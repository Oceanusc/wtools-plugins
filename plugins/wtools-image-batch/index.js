import { getExt, formatBytes } from './codecs.js';
import { decodeImageFile, processSingle, cropRegion, mergeToPdf, mergeToImage, mergeToGif } from './engine.js';

const $ = id => document.getElementById(id);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'avif', 'bmp', 'gif', 'ico', 'svg']);
const MERGE_MODES = new Set(['merge-pdf', 'merge-image', 'merge-gif']);
const LOSSY_FORMATS = new Set(['jpg', 'jpeg', 'webp', 'avif']);

const state = {
  mode: 'compress',
  files: [],       // { id, file, name, size, width, height, ext, thumbUrl }
  results: [],     // { id, origName, origSize, origW, origH, origExt, blob, name, width, height, error }
  busy: false,
  convertFormat: 'png',
  resizeMode: 'fixed',
  wmType: 'text',
  wmPos: '2-2',
  wmImageCanvas: null,
  roundUnit: 'percent',
  cropRatio: '1:1',
  pdfMargin: 0,
  mergeDir: 'vertical',
  mcRatio: 'free',
  mcIndex: 0,
  mcMap: new Map(), // id -> { blob, name, width, height, rect }
  dragId: null,
  settings: { theme: 'light', downloadMode: 'zip' },
};

let uidCounter = 1;
let toastTimer = null;
let previewUrls = [];

// Manual cropper canvas state
const mc = {
  decoded: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rect: null, // in image pixel coords { x, y, w, h }
  action: null, // 'move' | 'new' | handle name
  startX: 0,
  startY: 0,
  startRect: null,
};

function showToast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 3000);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  showToast(`已发起下载：${filename}\n请在下载位置查看文件。`);
}

function loadSettings() {
  try {
    const raw = window.wtools?.dbStorage?.getItem?.('image_batch_settings') ?? localStorage.getItem('image_batch_settings');
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      Object.assign(state.settings, parsed);
    }
  } catch { /* ignore */ }
  applySettings();
}

function saveSettings() {
  try {
    const val = JSON.stringify(state.settings);
    if (window.wtools?.dbStorage?.setItem) window.wtools.dbStorage.setItem('image_batch_settings', val);
    else localStorage.setItem('image_batch_settings', val);
  } catch { /* ignore */ }
  applySettings();
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  $('theme-select').value = state.settings.theme;
  $('download-mode-select').value = state.settings.downloadMode;
}

function setMode(mode) {
  if (state.busy) return;
  if (!document.querySelector(`.nav-item[data-mode="${mode}"]`)) return;
  state.mode = mode;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.querySelectorAll('.option-group').forEach(grp => {
    grp.hidden = grp.dataset.options !== mode;
  });
  syncQueueView();
}

function syncQueueView() {
  const hasFiles = state.files.length > 0;
  const isManual = state.mode === 'manual-crop';

  $('empty-dropzone').hidden = hasFiles;
  $('queue-scroll').hidden = !hasFiles || isManual;
  $('manual-crop-stage').hidden = !hasFiles || !isManual;

  if (isManual && hasFiles) {
    if (state.mcIndex >= state.files.length) state.mcIndex = 0;
    renderManualCropStrip();
    loadManualCropImage(state.mcIndex);
  } else if (hasFiles) {
    renderFileList();
  }
  updateActionBar();
}

function updateActionBar() {
  const count = state.files.length;
  const isManual = state.mode === 'manual-crop';
  const readyCount = isManual ? state.mcMap.size : count;
  $('start-label').textContent = state.busy
    ? '处理中…'
    : isManual
      ? `完成裁剪 (${readyCount}/${count})`
      : `开始处理 (${count})`;

  let canStart = count > 0 && !state.busy;
  if (MERGE_MODES.has(state.mode) && count < 1) canStart = false;
  if (isManual && state.mcMap.size === 0) canStart = false;
  $('btn-start').disabled = !canStart;
  $('btn-clear-files').disabled = state.busy || count === 0;
  $('btn-add-files').disabled = state.busy;
  $('btn-add-folder').disabled = state.busy;
}

function renderFileList() {
  const list = $('file-list');
  list.innerHTML = '';
  const isMerge = MERGE_MODES.has(state.mode);

  for (const item of state.files) {
    const li = document.createElement('li');
    li.className = 'file-row';
    li.dataset.id = item.id;
    li.draggable = isMerge && !state.busy;

    if (isMerge && item.thumbUrl) {
      const img = document.createElement('img');
      img.className = 'file-thumb';
      img.src = item.thumbUrl;
      img.alt = '';
      li.append(img);
    } else {
      const badge = document.createElement('div');
      badge.className = 'file-badge';
      badge.textContent = (item.ext || 'IMG').slice(0, 4);
      li.append(badge);
    }

    const info = document.createElement('div');
    info.className = 'file-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'file-name';
    nameEl.textContent = item.name;
    const metaEl = document.createElement('div');
    metaEl.className = 'file-meta';
    const sizeSpan = document.createElement('span');
    sizeSpan.textContent = formatBytes(item.size);
    const dimSpan = document.createElement('span');
    dimSpan.textContent = item.width && item.height ? `${item.width} x ${item.height}` : '读取中…';
    metaEl.append(sizeSpan, dimSpan);
    info.append(nameEl, metaEl);
    li.append(info);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    if (!isMerge) {
      const effBtn = document.createElement('button');
      effBtn.type = 'button';
      effBtn.className = 'effect-btn';
      effBtn.textContent = '效果';
      effBtn.onclick = () => openEffectPreview(item);
      actions.append(effBtn);
    }

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'remove-btn';
    rmBtn.title = '移除';
    rmBtn.innerHTML = '<svg class="icon"><use href="#i-minus"/></svg>';
    rmBtn.onclick = () => removeFile(item.id);
    actions.append(rmBtn);

    if (isMerge) {
      const dragBtn = document.createElement('button');
      dragBtn.type = 'button';
      dragBtn.className = 'drag-handle';
      dragBtn.title = '拖动排序';
      dragBtn.innerHTML = '<svg class="icon"><use href="#i-drag"/></svg>';
      actions.append(dragBtn);
    }

    li.append(actions);

    if (isMerge) {
      li.addEventListener('dragstart', e => {
        state.dragId = item.id;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => {
        state.dragId = null;
        document.querySelectorAll('.file-row').forEach(r => r.classList.remove('dragging', 'drag-over'));
      });
      li.addEventListener('dragover', e => {
        e.preventDefault();
        if (state.dragId && state.dragId !== item.id) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', e => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!state.dragId || state.dragId === item.id) return;
        const fromIdx = state.files.findIndex(f => f.id === state.dragId);
        const toIdx = state.files.findIndex(f => f.id === item.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [moved] = state.files.splice(fromIdx, 1);
          state.files.splice(toIdx, 0, moved);
          renderFileList();
        }
      });
    }

    list.append(li);
  }
}

function removeFile(id) {
  const idx = state.files.findIndex(f => f.id === id);
  if (idx < 0) return;
  const [removed] = state.files.splice(idx, 1);
  if (removed.thumbUrl) URL.revokeObjectURL(removed.thumbUrl);
  state.mcMap.delete(id);
  syncQueueView();
}

function clearFiles() {
  for (const item of state.files) {
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  }
  state.files = [];
  state.mcMap.clear();
  state.mcIndex = 0;
  syncQueueView();
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList || []).filter(f => {
    const ext = getExt(f.name);
    return IMAGE_EXTS.has(ext) || (f.type && f.type.startsWith('image/'));
  });
  if (!incoming.length) {
    showToast('未检测到支持的图片文件', true);
    return;
  }
  const newItems = [];
  for (const file of incoming) {
    const id = `img-${uidCounter++}`;
    const ext = getExt(file.name) || 'png';
    const item = { id, file, name: file.name, size: file.size, width: 0, height: 0, ext, thumbUrl: '' };
    state.files.push(item);
    newItems.push(item);
  }
  syncQueueView();

  // Decode dimensions & thumbnails asynchronously
  for (const item of newItems) {
    try {
      const decoded = await decodeImageFile(item.file);
      item.width = decoded.width;
      item.height = decoded.height;
      const thumbCanvas = document.createElement('canvas');
      const scale = Math.min(120 / decoded.width, 120 / decoded.height, 1);
      thumbCanvas.width = Math.max(1, Math.round(decoded.width * scale));
      thumbCanvas.height = Math.max(1, Math.round(decoded.height * scale));
      thumbCanvas.getContext('2d').drawImage(decoded.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      item.thumbUrl = await new Promise(resolve => {
        thumbCanvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : ''), 'image/webp', 0.8);
      });
    } catch {
      item.width = 0;
      item.height = 0;
    }
  }
  syncQueueView();
}

function collectOptions() {
  const m = state.mode;
  if (m === 'compress') {
    return { quality: Number($('compress-quality').value), targetKb: Number($('compress-target-kb').value) || 0 };
  }
  if (m === 'convert') {
    return { format: state.convertFormat, quality: Number($('convert-quality').value) };
  }
  if (m === 'resize') {
    return {
      mode: state.resizeMode,
      width: Number($('resize-width').value),
      height: Number($('resize-height').value),
      keepAspect: $('resize-keep-aspect').checked,
      percent: Number($('resize-percent').value),
    };
  }
  if (m === 'watermark') {
    return {
      type: state.wmType,
      text: $('wm-text').value,
      fontSize: Number($('wm-font-size').value),
      color: $('wm-color').value,
      wmImageCanvas: state.wmImageCanvas,
      imageScale: Number($('wm-img-scale').value),
      opacity: Number($('wm-opacity').value),
      angle: Number($('wm-angle').value),
      tile: $('wm-tile').checked,
      tileGap: Number($('wm-tile-gap').value),
      position: state.wmPos,
    };
  }
  if (m === 'round') {
    return { unit: state.roundUnit, percent: Number($('round-percent').value), px: Number($('round-px').value) };
  }
  if (m === 'border') {
    return {
      width: Number($('border-width').value),
      color: $('border-color').value,
      opacity: Number($('border-opacity').value),
      inside: $('border-inside').checked,
    };
  }
  if (m === 'pad') {
    return {
      mode: $('pad-mode').value,
      all: Number($('pad-all').value),
      top: Number($('pad-top').value),
      bottom: Number($('pad-bottom').value),
      left: Number($('pad-left').value),
      right: Number($('pad-right').value),
      ratio: $('pad-ratio').value,
      color: $('pad-color').value,
      opacity: Number($('pad-opacity').value),
    };
  }
  if (m === 'crop') {
    let rw = 1;
    let rh = 1;
    if (state.cropRatio === 'custom') {
      rw = Math.max(1, Number($('crop-rw').value) || 1);
      rh = Math.max(1, Number($('crop-rh').value) || 1);
    } else {
      [rw, rh] = state.cropRatio.split(':').map(Number);
    }
    return { ratioW: rw, ratioH: rh, anchor: $('crop-anchor').value };
  }
  if (m === 'rotate') {
    return { angle: Number($('rotate-angle').value), bg: $('rotate-bg').value };
  }
  if (m === 'flip') {
    return { horizontal: $('flip-h').checked, vertical: $('flip-v').checked };
  }
  if (m === 'merge-pdf') {
    return { pageSize: $('pdf-page-size').value, margin: state.pdfMargin };
  }
  if (m === 'merge-image') {
    return {
      direction: state.mergeDir,
      gap: Number($('merge-gap').value),
      bg: $('merge-bg').value,
      align: $('merge-align').value,
      format: $('merge-img-format').value,
    };
  }
  if (m === 'merge-gif') {
    return { delay: Number($('gif-delay').value), loop: Number($('gif-loop').value), fit: $('gif-fit').value };
  }
  return {};
}

async function openEffectPreview(item) {
  previewUrls.forEach(u => URL.revokeObjectURL(u));
  previewUrls = [];
  $('preview-title').textContent = `效果预览 — ${item.name}`;
  $('preview-orig-meta').textContent = `原图：${formatBytes(item.size)} · ${item.width} × ${item.height}`;
  $('preview-out-meta').textContent = '正在生成预览…';
  const origUrl = URL.createObjectURL(item.file);
  previewUrls.push(origUrl);
  $('preview-orig-img').src = origUrl;
  $('preview-out-img').removeAttribute('src');
  $('preview-dialog').showModal();

  try {
    const out = await processSingle(item, state.mode, collectOptions());
    const outUrl = URL.createObjectURL(out.blob);
    previewUrls.push(outUrl);
    $('preview-out-img').src = outUrl;
    const pct = item.size ? (((out.blob.size - item.size) / item.size) * 100).toFixed(1) : '0.0';
    const sign = out.blob.size > item.size ? '+' : '';
    $('preview-out-meta').textContent = `处理后：${formatBytes(out.blob.size)} (${sign}${pct}%) · ${out.width} × ${out.height}`;
  } catch (err) {
    $('preview-out-meta').textContent = err.message || '无法预览';
  }
}

async function runBatch() {
  if (state.busy || !state.files.length) return;
  state.busy = true;
  state.results = [];
  $('progress-inline').hidden = false;
  $('batch-progress').value = 0;
  updateActionBar();

  const opts = collectOptions();
  try {
    if (MERGE_MODES.has(state.mode)) {
      const fn = state.mode === 'merge-pdf' ? mergeToPdf : state.mode === 'merge-image' ? mergeToImage : mergeToGif;
      const out = await fn(state.files, opts, (done, total) => {
        $('batch-progress').value = Math.round((done / Math.max(1, total)) * 100);
        $('progress-text').textContent = `${done}/${total}`;
      });
      const totalIn = state.files.reduce((a, b) => a + b.size, 0);
      state.results.push({
        id: 'merged',
        origName: `${state.files.length} 张图片`,
        origSize: totalIn,
        origW: state.files[0].width,
        origH: state.files[0].height,
        origExt: 'IMG',
        ...out,
      });
    } else if (state.mode === 'manual-crop') {
      for (const item of state.files) {
        const cropped = state.mcMap.get(item.id);
        if (cropped) {
          state.results.push({
            id: item.id,
            origName: item.name,
            origSize: item.size,
            origW: item.width,
            origH: item.height,
            origExt: item.ext,
            blob: cropped.blob,
            name: cropped.name,
            width: cropped.width,
            height: cropped.height,
          });
        }
      }
    } else {
      for (let i = 0; i < state.files.length; i++) {
        const item = state.files[i];
        $('batch-progress').value = Math.round((i / state.files.length) * 100);
        $('progress-text').textContent = `${i}/${state.files.length}`;
        try {
          const out = await processSingle(item, state.mode, opts);
          state.results.push({
            id: item.id,
            origName: item.name,
            origSize: item.size,
            origW: item.width,
            origH: item.height,
            origExt: item.ext,
            ...out,
          });
        } catch (err) {
          state.results.push({
            id: item.id,
            origName: item.name,
            origSize: item.size,
            origW: item.width,
            origH: item.height,
            origExt: item.ext,
            error: err.message || '处理失败',
          });
        }
        await new Promise(r => setTimeout(r, 0));
      }
      $('batch-progress').value = 100;
      $('progress-text').textContent = `${state.files.length}/${state.files.length}`;
    }
    showResultsView();
  } catch (err) {
    showToast(err.message || '处理失败', true);
  } finally {
    state.busy = false;
    $('progress-inline').hidden = true;
    updateActionBar();
  }
}

function showResultsView() {
  $('app-shell').classList.add('showing-results');
  $('results-view').hidden = false;
  const list = $('result-list');
  list.innerHTML = '';

  let okCount = 0;
  let failCount = 0;

  for (const res of state.results) {
    const li = document.createElement('li');
    li.className = 'result-row';

    // Left side (original)
    const left = document.createElement('div');
    left.className = 'result-side';
    const badgeL = document.createElement('div');
    badgeL.className = 'file-badge';
    badgeL.textContent = (res.origExt || 'IMG').slice(0, 4);
    const infoL = document.createElement('div');
    infoL.className = 'file-info';
    infoL.innerHTML = `<div class="file-name"></div><div class="file-meta"><span></span><span></span></div>`;
    infoL.querySelector('.file-name').textContent = res.origName;
    const spansL = infoL.querySelectorAll('.file-meta span');
    spansL[0].textContent = formatBytes(res.origSize);
    spansL[1].textContent = res.origW && res.origH ? `${res.origW} x ${res.origH}` : '';
    left.append(badgeL, infoL);

    const arrow = document.createElement('div');
    arrow.className = 'result-arrow';
    arrow.innerHTML = '<svg class="icon"><use href="#i-arrow-right"/></svg>';

    // Right side (output or error)
    const right = document.createElement('div');
    right.className = 'result-side';
    const dlCell = document.createElement('div');

    if (res.error) {
      failCount++;
      right.innerHTML = `<div class="result-error"><svg class="icon"><use href="#i-close"/></svg><span></span></div>`;
      right.querySelector('span').textContent = res.error;
    } else {
      okCount++;
      const badgeR = document.createElement('div');
      badgeR.className = 'file-badge';
      badgeR.textContent = (getExt(res.name) || 'IMG').slice(0, 4);
      const infoR = document.createElement('div');
      infoR.className = 'file-info';
      const nameR = document.createElement('div');
      nameR.className = 'file-name';
      nameR.textContent = res.name;
      const metaR = document.createElement('div');
      metaR.className = 'file-meta';
      const sizeR = document.createElement('span');
      const pct = res.origSize ? (((res.blob.size - res.origSize) / res.origSize) * 100).toFixed(1) : '0.0';
      const sign = res.blob.size > res.origSize ? '+' : '';
      sizeR.innerHTML = `${formatBytes(res.blob.size)} <span class="result-delta">(${sign}${pct}%)</span>`;
      const dimR = document.createElement('span');
      dimR.textContent = res.width && res.height ? `${res.width} x ${res.height}` : '';
      metaR.append(sizeR, dimR);
      infoR.append(nameR, metaR);
      right.append(badgeR, infoR);

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'tool-icon-btn';
      dlBtn.title = '下载此文件';
      dlBtn.innerHTML = '<svg class="icon"><use href="#i-download"/></svg>';
      dlBtn.onclick = () => saveBlob(res.blob, res.name);
      dlCell.append(dlBtn);
    }

    li.append(left, arrow, right, dlCell);
    list.append(li);
  }

  $('results-summary').textContent = `批量处理完成：${okCount} 张成功，${failCount} 张失败`;
  $('btn-replace').disabled = okCount === 0 || MERGE_MODES.has(state.mode);
  $('btn-download-results').disabled = okCount === 0;
}

function hideResultsView() {
  $('app-shell').classList.remove('showing-results');
  $('results-view').hidden = true;
}

async function replaceOriginalsWithResults() {
  const okMap = new Map();
  for (const res of state.results) {
    if (!res.error && res.blob) okMap.set(res.id, res);
  }
  if (!okMap.size) return;

  for (const item of state.files) {
    const res = okMap.get(item.id);
    if (!res) continue;
    const newFile = new File([res.blob], res.name, { type: res.blob.type || 'application/octet-stream' });
    item.file = newFile;
    item.name = res.name;
    item.size = res.blob.size;
    item.width = res.width;
    item.height = res.height;
    item.ext = getExt(res.name);
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    item.thumbUrl = URL.createObjectURL(res.blob);
  }
  state.mcMap.clear();
  hideResultsView();
  syncQueueView();
  showToast('已用处理结果替换原图，可继续下一步处理');
}

async function downloadAllResults() {
  const ok = state.results.filter(r => !r.error && r.blob);
  if (!ok.length) return;
  if (ok.length === 1) {
    saveBlob(ok[0].blob, ok[0].name);
    return;
  }
  if (state.settings.downloadMode === 'individual' || !window.JSZip) {
    for (const r of ok) {
      saveBlob(r.blob, r.name);
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    showToast(`已发起下载 ${ok.length} 个文件\n请在下载位置查看文件。`);
    return;
  }
  const zip = new window.JSZip();
  const usedNames = new Map();
  for (const r of ok) {
    let fname = r.name;
    const count = usedNames.get(fname) || 0;
    if (count > 0) {
      const dot = fname.lastIndexOf('.');
      fname = dot > 0 ? `${fname.slice(0, dot)}_${count}${fname.slice(dot)}` : `${fname}_${count}`;
    }
    usedNames.set(r.name, count + 1);
    zip.file(fname, r.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveBlob(zipBlob, `图片批量处理_${ok.length}张.zip`);
}

// ---------------- Manual Cropper ----------------
function renderManualCropStrip() {
  const strip = $('mc-thumb-strip');
  strip.innerHTML = '';
  state.files.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-thumb-item' + (idx === state.mcIndex ? ' active' : '') + (state.mcMap.has(item.id) ? ' cropped' : '');
    btn.title = item.name;
    const img = document.createElement('img');
    img.src = item.thumbUrl || '';
    img.alt = item.name;
    btn.append(img);
    btn.onclick = () => loadManualCropImage(idx);
    strip.append(btn);
  });
  $('mc-progress-text').textContent = `${state.mcIndex + 1} / ${state.files.length}（已裁剪 ${state.mcMap.size} 张）`;
}

async function loadManualCropImage(idx) {
  if (!state.files.length) return;
  state.mcIndex = Math.max(0, Math.min(state.files.length - 1, idx));
  renderManualCropStrip();
  const item = state.files[state.mcIndex];
  try {
    mc.decoded = await decodeImageFile(item.file);
    const saved = state.mcMap.get(item.id);
    if (saved?.rect) {
      mc.rect = { ...saved.rect };
    } else {
      resetMcRect();
    }
    drawManualCropCanvas();
  } catch (err) {
    showToast(err.message || '图片加载失败', true);
  }
}

function resetMcRect() {
  if (!mc.decoded) return;
  const { width: w, height: h } = mc.decoded;
  let rw = Math.round(w * 0.8);
  let rh = Math.round(h * 0.8);
  if (state.mcRatio !== 'free') {
    const [arW, arH] = state.mcRatio.split(':').map(Number);
    const ratio = arW / arH;
    if (rw / rh > ratio) rw = Math.round(rh * ratio);
    else rh = Math.round(rw / ratio);
  }
  mc.rect = {
    x: Math.round((w - rw) / 2),
    y: Math.round((h - rh) / 2),
    w: Math.max(10, rw),
    h: Math.max(10, rh),
  };
  drawManualCropCanvas();
}

function drawManualCropCanvas() {
  const canvas = $('mc-canvas');
  const wrap = $('mc-canvas-wrap');
  if (!mc.decoded || !wrap.clientWidth || !wrap.clientHeight) return;

  const cw = wrap.clientWidth - 16;
  const ch = wrap.clientHeight - 16;
  const imgW = mc.decoded.width;
  const imgH = mc.decoded.height;
  const scale = Math.min(cw / imgW, ch / imgH, 1);
  mc.scale = scale;

  const dispW = Math.max(1, Math.round(imgW * scale));
  const dispH = Math.max(1, Math.round(imgH * scale));
  canvas.width = dispW;
  canvas.height = dispH;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);
  ctx.drawImage(mc.decoded.canvas, 0, 0, dispW, dispH);

  if (!mc.rect) return;
  const rx = mc.rect.x * scale;
  const ry = mc.rect.y * scale;
  const rw = mc.rect.w * scale;
  const rh = mc.rect.h * scale;

  // Dark mask outside selection
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.fillRect(0, 0, dispW, ry);
  ctx.fillRect(0, ry + rh, dispW, dispH - (ry + rh));
  ctx.fillRect(0, ry, rx, rh);
  ctx.fillRect(rx + rw, ry, dispW - (rx + rw), rh);

  // Selection border & thirds grid
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx, ry, rw, rh);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx + rw / 3, ry); ctx.lineTo(rx + rw / 3, ry + rh);
  ctx.moveTo(rx + (2 * rw) / 3, ry); ctx.lineTo(rx + (2 * rw) / 3, ry + rh);
  ctx.moveTo(rx, ry + rh / 3); ctx.lineTo(rx + rw, ry + rh / 3);
  ctx.moveTo(rx, ry + (2 * rh) / 3); ctx.lineTo(rx + rw, ry + (2 * rh) / 3);
  ctx.stroke();

  // Corner handles
  ctx.fillStyle = '#4b61dd';
  ctx.strokeStyle = '#ffffff';
  const pts = [
    [rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh],
    [rx + rw / 2, ry], [rx + rw / 2, ry + rh], [rx, ry + rh / 2], [rx + rw, ry + rh / 2],
  ];
  for (const [px, py] of pts) {
    ctx.fillRect(px - 4, py - 4, 8, 8);
    ctx.strokeRect(px - 4, py - 4, 8, 8);
  }

  $('mc-selection-info').textContent = `选区：${Math.round(mc.rect.w)} × ${Math.round(mc.rect.h)} px`;
}

function hitTestHandle(px, py) {
  if (!mc.rect) return null;
  const s = mc.scale;
  const rx = mc.rect.x * s;
  const ry = mc.rect.y * s;
  const rw = mc.rect.w * s;
  const rh = mc.rect.h * s;
  const tol = 10;
  const near = (a, b) => Math.abs(a - b) <= tol;
  if (near(px, rx) && near(py, ry)) return 'nw';
  if (near(px, rx + rw) && near(py, ry)) return 'ne';
  if (near(px, rx) && near(py, ry + rh)) return 'sw';
  if (near(px, rx + rw) && near(py, ry + rh)) return 'se';
  if (px > rx && px < rx + rw && py > ry && py < ry + rh) return 'move';
  return 'new';
}

function clampRect(r, maxW, maxH) {
  r.w = Math.max(10, Math.min(maxW, r.w));
  r.h = Math.max(10, Math.min(maxH, r.h));
  r.x = Math.max(0, Math.min(maxW - r.w, r.x));
  r.y = Math.max(0, Math.min(maxH - r.h, r.y));
  return r;
}

async function confirmManualCropAndNext() {
  if (!mc.decoded || !mc.rect || !state.files.length) return;
  const item = state.files[state.mcIndex];
  const rect = {
    x: Math.round(mc.rect.x),
    y: Math.round(mc.rect.y),
    width: Math.max(1, Math.round(mc.rect.w)),
    height: Math.max(1, Math.round(mc.rect.h)),
  };
  try {
    const out = await cropRegion(item, rect);
    state.mcMap.set(item.id, { ...out, rect });
    updateActionBar();

    // Auto-advance to next uncropped image, or next index
    let nextIdx = -1;
    for (let offset = 1; offset <= state.files.length; offset++) {
      const candidate = (state.mcIndex + offset) % state.files.length;
      if (!state.mcMap.has(state.files[candidate].id)) {
        nextIdx = candidate;
        break;
      }
    }
    if (nextIdx >= 0) {
      await loadManualCropImage(nextIdx);
    } else {
      renderManualCropStrip();
      showToast('全部图片已裁剪完成，点击右下角「完成裁剪」查看结果');
    }
  } catch (err) {
    showToast(err.message || '裁剪失败', true);
  }
}

function bindEvents() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Compress controls
  $('compress-quality').addEventListener('input', e => {
    $('compress-quality-badge').textContent = e.target.value;
  });

  // Convert format grid
  document.querySelectorAll('#convert-format-grid .format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.convertFormat = btn.dataset.format;
      document.querySelectorAll('#convert-format-grid .format-btn').forEach(b => b.classList.toggle('active', b === btn));
      $('convert-quality-wrap').hidden = !LOSSY_FORMATS.has(state.convertFormat);
    });
  });
  $('convert-quality').addEventListener('input', e => { $('convert-quality-val').textContent = e.target.value; });

  // Resize controls
  document.querySelectorAll('#resize-mode-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.resizeMode = btn.dataset.resizeMode;
      document.querySelectorAll('#resize-mode-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      $('resize-fixed-fields').hidden = state.resizeMode !== 'fixed';
      $('resize-percent-fields').hidden = state.resizeMode !== 'percent';
    });
  });
  $('resize-percent').addEventListener('input', e => { $('resize-percent-val').textContent = `${e.target.value}%`; });

  // Watermark controls
  document.querySelectorAll('#wm-type-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.wmType = btn.dataset.wmType;
      document.querySelectorAll('#wm-type-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      $('wm-text-fields').hidden = state.wmType !== 'text';
      $('wm-image-fields').hidden = state.wmType !== 'image';
    });
  });
  $('wm-pick-img').addEventListener('click', () => $('wm-file-input').click());
  $('wm-file-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dec = await decodeImageFile(file);
      state.wmImageCanvas = dec.canvas;
      $('wm-img-name').textContent = file.name;
    } catch (err) {
      showToast(err.message, true);
    }
  });
  $('wm-img-scale').addEventListener('input', e => { $('wm-img-scale-val').textContent = `${e.target.value}%`; });
  $('wm-opacity').addEventListener('input', e => { $('wm-opacity-val').textContent = `${e.target.value}%`; });
  $('wm-angle').addEventListener('input', e => { $('wm-angle-val').textContent = `${e.target.value}°`; });
  $('wm-tile').addEventListener('change', e => {
    $('wm-tile-gap-wrap').hidden = !e.target.checked;
    $('wm-pos-wrap').hidden = e.target.checked;
  });
  document.querySelectorAll('#wm-pos-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.wmPos = btn.dataset.pos;
      document.querySelectorAll('#wm-pos-grid button').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // Round corners
  document.querySelectorAll('#round-unit-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.roundUnit = btn.dataset.roundUnit;
      document.querySelectorAll('#round-unit-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      $('round-percent-wrap').hidden = state.roundUnit !== 'percent';
      $('round-px-wrap').hidden = state.roundUnit !== 'px';
    });
  });
  $('round-percent').addEventListener('input', e => { $('round-percent-val').textContent = `${e.target.value}%`; });

  // Pad
  $('pad-mode').addEventListener('change', e => {
    const v = e.target.value;
    $('pad-uniform-wrap').hidden = v !== 'uniform';
    $('pad-sides-wrap').hidden = v !== 'sides';
    $('pad-ratio-wrap').hidden = v !== 'ratio';
  });
  $('pad-opacity').addEventListener('input', e => { $('pad-opacity-val').textContent = `${e.target.value}%`; });

  // Crop
  document.querySelectorAll('#crop-ratio-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.cropRatio = btn.dataset.ratio;
      document.querySelectorAll('#crop-ratio-grid button').forEach(b => b.classList.toggle('active', b === btn));
      $('crop-custom-wrap').hidden = state.cropRatio !== 'custom';
    });
  });

  // Rotate
  $('rotate-angle').addEventListener('input', e => { $('rotate-angle-val').textContent = `${e.target.value}°`; });
  document.querySelectorAll('[data-rot]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('rotate-angle').value = btn.dataset.rot;
      $('rotate-angle-val').textContent = `${btn.dataset.rot}°`;
    });
  });

  // Merge PDF
  document.querySelectorAll('#pdf-margin-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.pdfMargin = Number(btn.dataset.margin);
      document.querySelectorAll('#pdf-margin-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  // Merge Image
  document.querySelectorAll('#merge-dir-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mergeDir = btn.dataset.dir;
      document.querySelectorAll('#merge-dir-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  // Merge GIF
  $('gif-delay').addEventListener('input', e => { $('gif-delay-val').textContent = `${e.target.value} ms`; });

  // Manual Cropper controls
  document.querySelectorAll('#mc-ratio-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mcRatio = btn.dataset.mcRatio;
      document.querySelectorAll('#mc-ratio-grid button').forEach(b => b.classList.toggle('active', b === btn));
      resetMcRect();
    });
  });
  $('mc-confirm').addEventListener('click', confirmManualCropAndNext);
  $('mc-prev').addEventListener('click', () => loadManualCropImage(state.mcIndex - 1));
  $('mc-skip').addEventListener('click', () => loadManualCropImage((state.mcIndex + 1) % Math.max(1, state.files.length)));
  $('mc-reset').addEventListener('click', resetMcRect);

  const mcCanvas = $('mc-canvas');
  mcCanvas.addEventListener('pointerdown', e => {
    if (!mc.decoded) return;
    const box = mcCanvas.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    mc.action = hitTestHandle(px, py);
    mc.startX = px / mc.scale;
    mc.startY = py / mc.scale;
    mc.startRect = mc.rect ? { ...mc.rect } : { x: mc.startX, y: mc.startY, w: 10, h: 10 };
    if (mc.action === 'new') {
      mc.rect = { x: mc.startX, y: mc.startY, w: 10, h: 10 };
    }
    mcCanvas.setPointerCapture(e.pointerId);
  });
  mcCanvas.addEventListener('pointermove', e => {
    if (!mc.action || !mc.decoded) return;
    const box = mcCanvas.getBoundingClientRect();
    const ix = Math.max(0, Math.min(mc.decoded.width, (e.clientX - box.left) / mc.scale));
    const iy = Math.max(0, Math.min(mc.decoded.height, (e.clientY - box.top) / mc.scale));
    const dx = ix - mc.startX;
    const dy = iy - mc.startY;
    const r = { ...mc.startRect };

    if (mc.action === 'move') {
      r.x += dx;
      r.y += dy;
    } else if (mc.action === 'new') {
      r.x = Math.min(mc.startX, ix);
      r.y = Math.min(mc.startY, iy);
      r.w = Math.abs(ix - mc.startX);
      r.h = Math.abs(iy - mc.startY);
    } else {
      if (mc.action.includes('w')) { r.x += dx; r.w -= dx; }
      if (mc.action.includes('e')) { r.w += dx; }
      if (mc.action.includes('n')) { r.y += dy; r.h -= dy; }
      if (mc.action.includes('s')) { r.h += dy; }
    }
    if (state.mcRatio !== 'free' && mc.action !== 'move') {
      const [arW, arH] = state.mcRatio.split(':').map(Number);
      r.h = r.w / (arW / arH);
    }
    mc.rect = clampRect(r, mc.decoded.width, mc.decoded.height);
    drawManualCropCanvas();
  });
  mcCanvas.addEventListener('pointerup', () => { mc.action = null; });
  window.addEventListener('resize', () => {
    if (state.mode === 'manual-crop' && state.files.length) drawManualCropCanvas();
  });

  // File picking & drag/drop
  $('empty-add-btn').addEventListener('click', () => $('file-input').click());
  $('btn-add-files').addEventListener('click', () => $('file-input').click());
  $('btn-add-folder').addEventListener('click', () => $('folder-input').click());
  $('btn-clear-files').addEventListener('click', clearFiles);
  $('file-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('folder-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

  const qp = $('queue-panel');
  let dragDepth = 0;
  qp.addEventListener('dragenter', e => {
    if (e.dataTransfer?.types?.includes('Files')) {
      dragDepth++;
      $('drop-overlay').hidden = false;
    }
  });
  qp.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  qp.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  qp.addEventListener('drop', e => {
    if (e.dataTransfer?.files?.length) {
      e.preventDefault();
      dragDepth = 0;
      $('drop-overlay').hidden = true;
      addFiles(e.dataTransfer.files);
    }
  });

  // Primary Actions
  $('btn-start').addEventListener('click', runBatch);
  $('btn-continue').addEventListener('click', hideResultsView);
  $('btn-replace').addEventListener('click', replaceOriginalsWithResults);
  $('btn-download-results').addEventListener('click', downloadAllResults);

  // Dialogs
  $('preview-close').addEventListener('click', () => $('preview-dialog').close());
  $('btn-settings').addEventListener('click', () => $('settings-dialog').showModal());
  $('settings-close').addEventListener('click', () => $('settings-dialog').close());
  $('theme-select').addEventListener('change', e => { state.settings.theme = e.target.value; saveSettings(); });
  $('download-mode-select').addEventListener('change', e => { state.settings.downloadMode = e.target.value; saveSettings(); });

  // Shortcuts
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      $('file-input').click();
    } else if (e.ctrlKey && e.key === 'Enter' && !$('btn-start').disabled) {
      e.preventDefault();
      runBatch();
    }
  });
}

function initWtools() {
  if (!window.wtools?.onPluginEnter) return;
  window.wtools.onPluginEnter(async ({ code, type, payload }) => {
    if (code) setMode(code);
    if (type === 'img' && typeof payload === 'string' && payload.startsWith('data:image')) {
      const res = await fetch(payload);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      addFiles([new File([blob], `clipboard_${Date.now()}.${ext}`, { type: blob.type })]);
    }
  });
}

loadSettings();
bindEvents();
initWtools();
syncQueueView();
