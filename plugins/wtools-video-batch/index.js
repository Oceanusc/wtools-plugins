import {
  abortCurrentJob,
  buildPreviewMp4,
  extractFallbackThumb,
  formatDuration,
  mergeQueueVideos,
  processSingleVideo,
} from './engine.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'wtools-video-batch-prefs-v1';
const CIRCUMFERENCE = 2 * Math.PI * 19;

const state = {
  mode: 'compress',
  items: [], // { id, file, url, thumbUrl, duration, width, height, status, progress, elapsedMs, result, error }
  running: false,
  cancelAll: false,
  prefs: { theme: 'auto', autoDownload: false },
  saveDirHandle: null,
  extra: {
    wmImageFile: null,
    coverFile: null,
    coverUrl: null,
    mergeExtraFile: null,
  },
};

let seq = 1;
let toastTimer = null;

function getStore() {
  return window.wtools?.dbStorage || {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  };
}

function loadPrefs() {
  try {
    const raw = getStore().getItem(STORAGE_KEY);
    if (raw) Object.assign(state.prefs, JSON.parse(raw));
  } catch (_) {}
  $('theme-select').value = state.prefs.theme || 'auto';
  $('auto-download').checked = Boolean(state.prefs.autoDownload);
  applyTheme();
}

function savePrefs() {
  try {
    getStore().setItem(STORAGE_KEY, JSON.stringify(state.prefs));
  } catch (_) {}
}

function applyTheme() {
  let theme = state.prefs.theme;
  if (theme === 'auto') {
    const hostDark = window.wtools?.isDarkColors?.();
    const mediaDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    theme = (hostDark ?? mediaDark) ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function saveOutput(blob, fileName, { silent = false } = {}) {
  if (state.saveDirHandle) {
    try {
      let perm = await state.saveDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await state.saveDirHandle.requestPermission({ mode: 'readwrite' });
      }
      if (perm === 'granted') {
        const fileHandle = await state.saveDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (!silent) toast(`已保存到目录「${state.saveDirHandle.name}」：${fileName}`);
        return;
      }
    } catch (err) {
      toast(`写入自定义目录失败，已回退为默认下载：${err.message}`, true);
    }
  }
  triggerDownload(blob, fileName);
  if (!silent) toast(`已开始下载：${fileName}（可在系统“下载”目录查看）`);
}

function updateSaveDirUI() {
  const nameEl = $('save-dir-name');
  const clearBtn = $('clear-dir-btn');
  const pickBtn = $('pick-dir-btn');
  if (typeof window.showDirectoryPicker !== 'function') {
    nameEl.textContent = '默认下载目录（当前环境不支持自选）';
    pickBtn.disabled = true;
    clearBtn.hidden = true;
    return;
  }
  if (state.saveDirHandle) {
    nameEl.textContent = state.saveDirHandle.name;
    clearBtn.hidden = false;
  } else {
    nameEl.textContent = '默认下载目录';
    clearBtn.hidden = true;
  }
}

function probeVideoMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const finish = (meta) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve({ url, ...meta });
    };

    const timer = setTimeout(() => finish({ duration: 0, width: 0, height: 0, thumbUrl: '' }), 4000);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      video.currentTime = Math.min(0.5, duration > 0 ? duration * 0.1 : 0);
      video.onseeked = () => {
        clearTimeout(timer);
        let thumbUrl = '';
        try {
          if (width > 0 && height > 0) {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 272 / width);
            canvas.width = Math.max(2, Math.round(width * scale));
            canvas.height = Math.max(2, Math.round(height * scale));
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbUrl = canvas.toDataURL('image/jpeg', 0.78);
          }
        } catch (_) {}
        finish({ duration, width, height, thumbUrl });
      };
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish({ duration: 0, width: 0, height: 0, thumbUrl: '' });
    };

    video.src = url;
  });
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f && f.size > 0);
  if (!files.length) return;

  for (const file of files) {
    const id = `v_${seq++}`;
    const meta = await probeVideoMeta(file);
    const item = {
      id,
      file,
      url: meta.url,
      previewUrl: '',
      thumbUrl: meta.thumbUrl,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      status: 'idle', // idle | working | done | error
      progress: 0,
      elapsedMs: 0,
      result: null,
      error: '',
    };
    state.items.push(item);
    renderQueue();
    if (!item.thumbUrl) {
      extractFallbackThumb(file)
        .then((thumbUrl) => {
          item.thumbUrl = thumbUrl;
          renderQueue();
        })
        .catch(() => {});
    }
  }
}

function removeItem(id) {
  if (state.running) return;
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const [removed] = state.items.splice(idx, 1);
  if (removed.url) URL.revokeObjectURL(removed.url);
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderQueue();
}

function clearQueue() {
  if (state.running) return;
  for (const item of state.items) {
    if (item.url) URL.revokeObjectURL(item.url);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  state.items = [];
  renderQueue();
}

function resetStatuses() {
  for (const item of state.items) {
    item.status = 'idle';
    item.progress = 0;
    item.elapsedMs = 0;
    item.result = null;
    item.error = '';
  }
}

function updateButtons() {
  const count = state.items.length;
  const startBtn = $('start-btn');
  const startText = $('start-btn-text');
  const clearBtn = $('clear-btn');
  const addBtn = $('add-btn');
  const downloadAllBtn = $('download-all-btn');

  clearBtn.disabled = state.running || count === 0;
  addBtn.disabled = state.running;

  const doneCount = state.items.filter(i => i.status === 'done' && i.result?.blob).length;
  downloadAllBtn.hidden = state.running || doneCount < 2;

  if (state.running) {
    const finished = state.items.filter(i => i.status === 'done' || i.status === 'error').length;
    const current = Math.min(count, finished + 1);
    startBtn.disabled = true;
    startText.textContent = `正在处理 (${current}/${count})`;
  } else {
    startBtn.disabled = count === 0;
    startText.textContent = `开始处理 (${count})`;
  }
}

function renderCardNode(item) {
  const li = document.createElement('li');
  li.className = 'video-card';
  li.dataset.id = item.id;

  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `
    <span class="card-badge"><svg class="icon"><use href="#i-video-badge"/></svg></span>
    <span class="card-title" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
    <button type="button" class="card-remove" title="移除" aria-label="移除"><svg class="icon"><use href="#i-close"/></svg></button>
  `;
  head.querySelector('.card-remove').disabled = state.running;
  head.querySelector('.card-remove').addEventListener('click', () => removeItem(item.id));

  const body = document.createElement('div');
  body.className = 'card-body';

  const thumbBox = document.createElement('div');
  thumbBox.className = 'thumb-box';
  if (item.thumbUrl) {
    const img = document.createElement('img');
    img.src = item.thumbUrl;
    img.alt = item.file.name;
    thumbBox.appendChild(img);
  }

  if (item.status === 'working') {
    const pct = Math.round(item.progress * 100);
    const offset = CIRCUMFERENCE * (1 - item.progress);
    const prog = document.createElement('div');
    prog.className = 'thumb-progress';
    prog.innerHTML = `
      <svg class="progress-ring" viewBox="0 0 46 46">
        <circle class="ring-bg" cx="23" cy="23" r="19"/>
        <circle class="ring-fg" cx="23" cy="23" r="19" stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
      </svg>
      <span class="progress-pct">${pct}%</span>
    `;
    thumbBox.appendChild(prog);
  } else {
    const play = document.createElement('div');
    play.className = 'thumb-play';
    play.innerHTML = `<svg class="icon"><use href="#i-play"/></svg>`;
    thumbBox.appendChild(play);
    thumbBox.addEventListener('click', () => openPreview(item));
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const dimText = item.width && item.height ? `${item.width}x${item.height}` : '未知';
  meta.innerHTML = `
    <div class="meta-row">大小: ${formatBytes(item.file.size)}</div>
    <div class="meta-row">时长: ${formatDuration(item.duration)}</div>
    <div class="meta-row">尺寸: ${dimText}</div>
  `;

  if (item.status !== 'idle') {
    const statusRow = document.createElement('div');
    statusRow.className = 'card-status-row';
    if (item.status === 'done') {
      const extra = item.result?.frameCount
        ? `(${item.result.frameCount} 帧)`
        : item.result?.blob ? `(${formatBytes(item.result.blob.size)})` : '';
      statusRow.innerHTML = `
        <span class="status-text done">处理完成 ${extra}</span>
        <button type="button" class="card-action-btn"><svg class="icon"><use href="#i-folder"/></svg><span>保存</span></button>
      `;
      statusRow.querySelector('.card-action-btn').addEventListener('click', () => {
        if (item.result?.blob) void saveOutput(item.result.blob, item.result.fileName);
      });
    } else if (item.status === 'working') {
      statusRow.innerHTML = `
        <span class="status-text working">处理中 ${formatElapsed(item.elapsedMs)}</span>
        <button type="button" class="stop-btn" title="停止" aria-label="停止"><svg class="icon"><use href="#i-stop"/></svg></button>
      `;
      statusRow.querySelector('.stop-btn').addEventListener('click', () => {
        state.cancelAll = true;
        abortCurrentJob();
      });
    } else if (item.status === 'error') {
      statusRow.innerHTML = `<span class="status-text error" title="${escapeHtml(item.error)}">${escapeHtml(item.error)}</span>`;
    }
    meta.appendChild(statusRow);
  }

  body.appendChild(thumbBox);
  body.appendChild(meta);
  li.appendChild(head);
  li.appendChild(body);
  return li;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderQueue() {
  const empty = $('empty-dropzone');
  const scroll = $('queue-scroll');
  const list = $('file-list');

  if (state.items.length === 0) {
    empty.hidden = false;
    scroll.hidden = true;
    list.innerHTML = '';
  } else {
    empty.hidden = true;
    scroll.hidden = false;
    list.innerHTML = '';
    for (const item of state.items) {
      list.appendChild(renderCardNode(item));
    }
  }
  updateButtons();
}

function updateCardProgress(item) {
  const li = $('file-list').querySelector(`li[data-id="${item.id}"]`);
  if (!li) return;
  const ring = li.querySelector('.ring-fg');
  const pct = li.querySelector('.progress-pct');
  const statusEl = li.querySelector('.status-text.working');
  if (ring && pct) {
    const p = Math.max(0, Math.min(1, item.progress));
    ring.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * (1 - p)).toFixed(2));
    pct.textContent = `${Math.round(p * 100)}%`;
  }
  if (statusEl) {
    statusEl.textContent = `处理中 ${formatElapsed(item.elapsedMs)}`;
  }
}

async function openPreview(item) {
  const dialog = $('preview-dialog');
  const video = $('preview-video');
  const statusEl = $('preview-status');
  $('preview-title').textContent = item.file.name;
  statusEl.hidden = true;
  dialog.showModal();

  const tryTranscodePreview = async () => {
    if (!dialog.open) return;
    if (item.previewUrl) {
      video.src = item.previewUrl;
      video.play().catch(() => {});
      return;
    }
    if (state.running) {
      statusEl.textContent = '当前正在批量处理，请稍后再试预览该格式';
      statusEl.hidden = false;
      return;
    }
    video.pause();
    statusEl.textContent = '正在转换预览格式，请稍候...';
    statusEl.hidden = false;
    try {
      const blob = await buildPreviewMp4(item.file);
      item.previewUrl = URL.createObjectURL(blob);
      if (!dialog.open) return;
      statusEl.hidden = true;
      video.src = item.previewUrl;
      video.play().catch(() => {});
    } catch (err) {
      if (!dialog.open) return;
      statusEl.textContent = `该视频编码暂不支持浏览器直接预览（${err.message}）`;
    }
  };

  video.onloadedmetadata = () => {
    if (video.videoWidth === 0) {
      void tryTranscodePreview();
    } else {
      statusEl.hidden = true;
      video.play().catch(() => {});
    }
  };
  video.onerror = () => {
    if (video.getAttribute('src')) {
      void tryTranscodePreview();
    }
  };

  video.src = item.previewUrl || item.url;
}

function switchMode(mode) {
  if (state.running) return;
  state.mode = mode;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.querySelectorAll('.option-group[data-options]').forEach(group => {
    group.hidden = group.dataset.options !== mode;
  });
}

function collectOptions(mode) {
  switch (mode) {
    case 'compress': {
      const codecBtn = $('compress-codec-group').querySelector('[aria-pressed="true"]');
      return { codec: codecBtn?.dataset.codec || 'h264', crf: Number($('compress-crf').value) };
    }
    case 'trim': {
      const trimBtn = $('trim-mode-group').querySelector('[aria-pressed="true"]');
      return {
        trimMode: trimBtn?.dataset.trim || 'segment',
        headDur: $('trim-head-dur').value,
        tailDur: $('trim-tail-dur').value,
        rangeStart: $('trim-range-start').value,
        rangeEnd: $('trim-range-end').value,
        segStart: $('trim-seg-start').value,
        segDur: $('trim-seg-dur').value,
      };
    }
    case 'crop': {
      const ratioBtn = $('crop-ratio-grid').querySelector('.active');
      return { ratio: ratioBtn?.dataset.ratio || '16:9', anchor: $('crop-anchor').value };
    }
    case 'convert': {
      const fmtBtn = $('convert-format-group').querySelector('[aria-pressed="true"]');
      return { format: fmtBtn?.dataset.format || 'mp4' };
    }
    case 'animated': {
      const animBtn = $('anim-format-group').querySelector('[aria-pressed="true"]');
      return {
        animFormat: animBtn?.dataset.anim || 'gif',
        fps: $('anim-fps').value,
        width: $('anim-width').value,
        loop: $('anim-loop').checked,
      };
    }
    case 'watermark': {
      const wmMode = $('wm-mode-group').querySelector('[aria-pressed="true"]')?.dataset.wmMode || 'fixed';
      const wmType = $('wm-type-group').querySelector('[aria-pressed="true"]')?.dataset.wmType || 'text';
      const pos = $('wm-pos-grid').querySelector('.active')?.dataset.pos || 'br';
      return {
        wmMode,
        wmType,
        text: $('wm-text').value,
        fontSize: $('wm-size').value,
        color: $('wm-color').value,
        wmImageFile: state.extra.wmImageFile,
        imgScale: Number($('wm-img-scale').value),
        opacity: Number($('wm-opacity').value),
        position: pos,
        margin: $('wm-margin').value,
        speed: $('wm-speed').value,
        tileGap: $('wm-tile-gap').value,
        tileAngle: $('wm-tile-angle').value,
      };
    }
    case 'resize':
      return { width: $('resize-width').value, height: $('resize-height').value };
    case 'cover':
      return { coverFile: state.extra.coverFile };
    case 'speed':
      return { rate: $('speed-rate').value, syncAudio: $('speed-audio').checked };
    case 'flip':
      return { flip: $('flip-mode-group').querySelector('[aria-pressed="true"]')?.dataset.flip || 'h' };
    case 'rotate':
      return { angle: $('rotate-exact').value };
    case 'merge':
      return {
        mergeMode: $('merge-mode-group').querySelector('[aria-pressed="true"]')?.dataset.merge || 'tail',
        extraFile: state.extra.mergeExtraFile,
      };
    case 'audio':
      return {
        audioMode: $('audio-mode-group').querySelector('[aria-pressed="true"]')?.dataset.audio || 'mute',
        audioFormat: $('audio-format-grid').querySelector('.active')?.dataset.aformat || 'mp3',
      };
    case 'frames':
      return {
        interval: $('frames-interval').value,
        frameFormat: $('frames-format-group').querySelector('[aria-pressed="true"]')?.dataset.fformat || 'jpg',
        width: $('frames-width').value,
      };
    default:
      return {};
  }
}

async function runBatch() {
  if (state.running || state.items.length === 0) return;
  const opts = collectOptions(state.mode);
  state.running = true;
  state.cancelAll = false;
  resetStatuses();
  renderQueue();

  try {
    if (state.mode === 'merge' && opts.mergeMode === 'queue') {
      const first = state.items[0];
      first.status = 'working';
      const t0 = performance.now();
      const timer = setInterval(() => {
        first.elapsedMs = performance.now() - t0;
        updateCardProgress(first);
      }, 80);
      renderQueue();
      try {
        const res = await mergeQueueVideos(state.items, (p) => {
          first.progress = p;
          first.elapsedMs = performance.now() - t0;
          updateCardProgress(first);
        });
        first.status = 'done';
        first.progress = 1;
        first.result = res;
        if (state.prefs.autoDownload) await saveOutput(res.blob, res.fileName, { silent: true });
        toast('队列视频合并完成');
      } catch (err) {
        first.status = 'error';
        first.error = err.message || '合并失败';
        toast(first.error, true);
      } finally {
        clearInterval(timer);
      }
      return;
    }

    for (const item of state.items) {
      if (state.cancelAll) break;
      item.status = 'working';
      item.progress = 0;
      item.elapsedMs = 0;
      const t0 = performance.now();
      const timer = setInterval(() => {
        item.elapsedMs = performance.now() - t0;
        updateCardProgress(item);
      }, 80);
      renderQueue();

      try {
        const res = await processSingleVideo(item, state.mode, opts, (p) => {
          item.progress = p;
          item.elapsedMs = performance.now() - t0;
          updateCardProgress(item);
        });
        item.status = 'done';
        item.progress = 1;
        item.result = res;
        if (state.prefs.autoDownload) await saveOutput(res.blob, res.fileName, { silent: true });
      } catch (err) {
        item.status = 'error';
        item.error = err.message || '处理失败';
        if (state.cancelAll) break;
      } finally {
        clearInterval(timer);
      }
      renderQueue();
    }

    if (state.cancelAll) {
      toast('已停止批量处理');
    } else {
      const ok = state.items.filter(i => i.status === 'done').length;
      const fail = state.items.filter(i => i.status === 'error').length;
      toast(fail ? `处理完成：成功 ${ok} 个，失败 ${fail} 个` : `全部 ${ok} 个视频处理完成`, fail > 0 && ok === 0);
    }
  } finally {
    state.running = false;
    renderQueue();
  }
}

async function downloadAllZip() {
  const ready = state.items.filter(i => i.status === 'done' && i.result?.blob);
  if (!ready.length) return;
  const JSZip = window.JSZip;
  if (!JSZip) return toast('JSZip 未加载', true);
  const zip = new JSZip();
  const used = new Set();
  for (const item of ready) {
    let name = item.result.fileName;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const base = dot >= 0 ? name.slice(0, dot) : name;
      const ext = dot >= 0 ? name.slice(dot) : '';
      let n = 2;
      while (used.has(`${base}_${n}${ext}`)) n++;
      name = `${base}_${n}${ext}`;
    }
    used.add(name);
    zip.file(name, item.result.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  await saveOutput(blob, 'video_batch_results.zip');
}

function bindSegmented(containerId, onChange) {
  const el = $(containerId);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !el.contains(btn)) return;
    el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    onChange?.(btn);
  });
}

function bindActiveGrid(containerId, onChange) {
  const el = $(containerId);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !el.contains(btn)) return;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    onChange?.(btn);
  });
}

function bindEvents() {
  $('nav-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn?.dataset.mode) switchMode(btn.dataset.mode);
  });

  // 1. Compress
  bindSegmented('compress-codec-group', (btn) => {
    $('compress-codec-hint').hidden = btn.dataset.codec !== 'av1';
  });
  $('compress-crf').addEventListener('input', (e) => {
    $('compress-crf-badge').textContent = e.target.value;
  });

  // 2. Trim
  bindSegmented('trim-mode-group', (btn) => {
    const m = btn.dataset.trim;
    $('trim-inputs-head').hidden = m !== 'head';
    $('trim-inputs-tail').hidden = m !== 'tail';
    $('trim-inputs-range').hidden = m !== 'range';
    $('trim-inputs-segment').hidden = m !== 'segment';
  });

  // 3. Crop
  bindActiveGrid('crop-ratio-grid');

  // 4. Convert
  bindSegmented('convert-format-group');

  // 5. Animated
  bindSegmented('anim-format-group');

  // 6. Watermark
  bindSegmented('wm-mode-group', (btn) => {
    const m = btn.dataset.wmMode;
    $('wm-pos-wrap').hidden = m !== 'fixed';
    $('wm-margin-wrap').hidden = m !== 'fixed';
    $('wm-dynamic-wrap').hidden = m !== 'dynamic';
    $('wm-tile-wrap').hidden = m !== 'tile';
  });
  bindSegmented('wm-type-group', (btn) => {
    const isImg = btn.dataset.wmType === 'image';
    $('wm-text-fields').hidden = isImg;
    $('wm-image-fields').hidden = !isImg;
  });
  $('wm-pick-btn').addEventListener('click', () => $('wm-image-input').click());
  $('wm-image-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.extra.wmImageFile = file;
      $('wm-pick-name').textContent = file.name;
    }
  });
  $('wm-img-scale').addEventListener('input', (e) => { $('wm-img-scale-badge').textContent = `${e.target.value}%`; });
  $('wm-opacity').addEventListener('input', (e) => { $('wm-opacity-badge').textContent = `${e.target.value}%`; });
  bindActiveGrid('wm-pos-grid');

  // 7. Resize
  $('resize-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $('resize-width').value = btn.dataset.w || '';
    $('resize-height').value = btn.dataset.h || '';
  });

  // 8. Cover
  $('cover-pick-btn').addEventListener('click', () => $('cover-input').click());
  $('cover-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.extra.coverFile = file;
      $('cover-pick-name').textContent = file.name;
      if (state.extra.coverUrl) URL.revokeObjectURL(state.extra.coverUrl);
      state.extra.coverUrl = URL.createObjectURL(file);
      $('cover-preview-img').src = state.extra.coverUrl;
      $('cover-preview-box').hidden = false;
    }
  });

  // 9. Speed
  $('speed-rate').addEventListener('input', (e) => {
    $('speed-rate-badge').textContent = `${Number(e.target.value).toFixed(2).replace(/\.00$/, '.0')}x`;
  });
  $('speed-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $('speed-rate').value = btn.dataset.speed;
    $('speed-rate-badge').textContent = `${Number(btn.dataset.speed).toFixed(1)}x`;
  });

  // 10. Flip
  bindSegmented('flip-mode-group');

  // 11. Rotate
  const syncRotate = (val) => {
    const n = Math.max(-360, Math.min(360, Number(val) || 0));
    $('rotate-angle').value = String(((n % 360) + 360) % 360);
    $('rotate-exact').value = String(n);
    $('rotate-angle-badge').textContent = `${n}°`;
  };
  $('rotate-angle').addEventListener('input', (e) => syncRotate(e.target.value));
  $('rotate-exact').addEventListener('input', (e) => syncRotate(e.target.value));
  $('rotate-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) syncRotate(btn.dataset.deg);
  });

  // 12. Merge
  bindSegmented('merge-mode-group', (btn) => {
    const m = btn.dataset.merge;
    $('merge-extra-wrap').hidden = m === 'queue';
    $('merge-extra-label').textContent = m === 'head' ? '选择片头视频' : '选择片尾视频';
  });
  $('merge-pick-btn').addEventListener('click', () => $('merge-extra-input').click());
  $('merge-extra-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.extra.mergeExtraFile = file;
      $('merge-pick-name').textContent = file.name;
    }
  });

  // 13. Audio
  bindSegmented('audio-mode-group', (btn) => {
    $('audio-format-wrap').hidden = btn.dataset.audio !== 'extract';
  });
  bindActiveGrid('audio-format-grid');

  // 14. Frames
  bindSegmented('frames-format-group');

  // Queue & Dropzone
  const openPicker = () => { if (!state.running) $('file-input').click(); };
  $('empty-add-btn').addEventListener('click', openPicker);
  $('add-btn').addEventListener('click', openPicker);
  $('file-input').addEventListener('change', async (e) => {
    await addFiles(e.target.files);
    e.target.value = '';
  });

  let dropDepth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dropDepth += 1;
    if (!state.running && dropDepth > 0) $('drop-overlay').hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (dropDepth === 0) $('drop-overlay').hidden = true;
  });
  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = state.running ? 'none' : 'copy';
  });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dropDepth = 0;
    $('drop-overlay').hidden = true;
    if (!state.running && e.dataTransfer?.files?.length) {
      await addFiles(e.dataTransfer.files);
    }
  });

  $('clear-btn').addEventListener('click', clearQueue);
  $('start-btn').addEventListener('click', runBatch);
  $('download-all-btn').addEventListener('click', downloadAllZip);

  // Dialogs
  $('preview-close').addEventListener('click', () => {
    $('preview-video').pause();
    $('preview-dialog').close();
  });
  $('preview-dialog').addEventListener('close', () => {
    const v = $('preview-video');
    v.onloadedmetadata = null;
    v.onerror = null;
    v.pause();
    v.removeAttribute('src');
    $('preview-status').hidden = true;
  });

  $('settings-btn').addEventListener('click', () => $('settings-dialog').showModal());
  $('settings-close').addEventListener('click', () => $('settings-dialog').close());
  $('theme-select').addEventListener('change', (e) => {
    state.prefs.theme = e.target.value;
    savePrefs();
    applyTheme();
  });
  $('auto-download').addEventListener('change', (e) => {
    state.prefs.autoDownload = e.target.checked;
    savePrefs();
  });
  $('pick-dir-btn').addEventListener('click', async () => {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast('当前环境不支持选择保存目录', true);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.saveDirHandle = handle;
      updateSaveDirUI();
      toast(`已设置保存目录：${handle.name}`);
    } catch (err) {
      if (err?.name !== 'AbortError') toast(`选择目录失败：${err.message}`, true);
    }
  });
  $('clear-dir-btn').addEventListener('click', () => {
    state.saveDirHandle = null;
    updateSaveDirUI();
    toast('已恢复为默认下载目录');
  });
  updateSaveDirUI();

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || $('preview-dialog').open || $('settings-dialog').open) return;
    if (e.key.toLowerCase() === 'o') { e.preventDefault(); openPicker(); }
    if (e.key === 'Enter') { e.preventDefault(); void runBatch(); }
  });
}

function init() {
  loadPrefs();
  bindEvents();
  renderQueue();

  const host = window.wtools;
  if (host?.onPluginEnter) {
    host.onPluginEnter((entry) => {
      if (entry?.code) switchMode(entry.code);
      if (entry?.type === 'files' && Array.isArray(entry.payload)) {
        toast('请点击「添加视频」或将文件拖入页面。');
      }
    });
  }
}

init();
