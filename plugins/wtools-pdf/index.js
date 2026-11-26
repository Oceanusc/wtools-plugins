const $ = id => document.getElementById(id);
const tools = {
  compress: ['PDF 压缩', '减小文件体积，让传输和分享更轻松。', '开始压缩'],
  merge: ['PDF 合并', '把多份 PDF 与图片，整理成一份文档。', '确认合并'],
  split: ['PDF 拆分', '按页、按份或按范围，取出需要的内容。', '开始拆分'],
  watermark: ['PDF 水印', '为文档添加文字标记，支持中文与平铺。', '添加水印'],
  extract: ['提取图片', '取出文档中的内嵌图片，保存原始像素。', '提取图片'],
  images: ['PDF 转图片', '将每一页保存为清晰的 PNG 或 JPG。', '转换图片'],
  word: ['PDF 转 Word', '提取可编辑文字，或以图片保留页面外观。', '转换 Word'],
  ppt: ['PDF 转 PPT', '一页一张幻灯片，让文档成为演示。', '转换 PPT'],
  excel: ['PDF 转 Excel', '按位置提取文字，每页一个工作表。', '转换 Excel'],
};
const state = { mode: 'compress', compression: 'basic', files: [], outputs: [], task: null, importing: false, archive: null };
let engine, toastTimer, previewItem = null, previewPage = 1, previewUrl = null, previewToken = 0, dragId = null, dropDepth = 0;
const metadata = new Map(), pageThumbs = new Map(), thumbnailQueue = [];
let thumbnailRunning = false, observer;
const activeFiles = () => state.mode === 'merge' ? state.files : state.files.filter(item => !item.image);
const locked = () => Boolean(state.task || state.importing);
function element(tag, className = '', text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}
function action(name, title, handler, extra = '') {
  const button = element('button', 'icon-button ' + extra); button.type = 'button'; button.title = title; button.setAttribute('aria-label', title);
  button.append(icon(name)); button.disabled = locked(); button.onclick = handler; return button;
}
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 10000 : 4000);
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), anchor = element('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`已发起下载：${name}\n请在下载位置查看文件。`);
  status(`已发起下载：${name}`);
}
function updateControls() {
  const busy = locked(), files = activeFiles();
  document.body.classList.toggle('busy', busy);
  document.body.classList.toggle('has-files', Boolean(files.length));
  document.querySelectorAll('.nav-item, #options input, #options select, #options button, #add-files, #empty-add, #file-input, #clear-files, #start, #download-all, #file-list button, #result-list button').forEach(node => { node.disabled = busy; });
  $('start').disabled = busy || !engine || !files.length;
  $('clear-files').disabled = busy || !state.files.length;
  $('download-all').disabled = busy || !state.outputs.length;
  $('cancel').hidden = !state.task;
  $('cancel').disabled = Boolean(state.task?.cancelled);
  $('progress').hidden = !state.task;
  $('start-label').textContent = state.task ? '处理中…' : tools[state.mode][2] + (files.length ? ` (${files.length})` : '');
  $('file-count').textContent = `${files.length} 个文件`;
  $('image-excluded').hidden = state.mode === 'merge' || !state.files.some(item => item.image);
  $('empty-state').hidden = Boolean(files.length);
  $('empty-state').querySelector('p').textContent = state.mode === 'merge' ? '将 PDF 或图片拖放到这里，或点击上方添加文件' : '将 PDF 文件拖放到这里，或点击上方添加文件';
  $('empty-add').firstChild.textContent = state.mode === 'merge' ? '选择 PDF / 图片' : '选择 PDF 文件';
  $('file-input').accept = state.mode === 'merge' ? '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp' : '.pdf,application/pdf';
  $('add-label').textContent = state.mode === 'merge' ? '添加 PDF / 图片' : '添加文件';
  $('watermark-position').disabled = busy || $('watermark-tile').checked;
  // Preserve endpoint constraints when re-enabling the rest of the queue.
  document.querySelectorAll('[data-move]').forEach(node => {
    const index = state.files.findIndex(item => item.id === node.dataset.id);
    node.disabled = busy || (node.dataset.move === 'up' ? index <= 0 : index === state.files.length - 1);
  });
  document.querySelectorAll('.merge-card').forEach(node => { node.draggable = !busy; });
}
function clearOutputs() {
  state.outputs = []; state.archive = null;
  for (const item of state.files) { delete item.resultNote; delete item.resultError; delete item.outputSize; }
  document.querySelectorAll('#file-list .download').forEach(node => node.remove());
  renderResults();
}
function syncOptions() {
  $('strong-options').hidden = state.compression !== 'strong';
  $('compression-hint').textContent = state.compression === 'strong' ? '将页面转为 JPG，可显著减小扫描件；文字不可选中，链接、表单等交互内容会丢失。' : '优化 PDF 内部结构，保留文字和矢量内容；体积变化取决于源文件。';
  $('chunk-field').hidden = $('split-mode').value !== 'count';
  const render = ['images', 'ppt'].includes(state.mode) || state.mode === 'word' && $('word-mode').value === 'image';
  $('render-options').hidden = !render;
  $('quality-field').hidden = state.mode === 'images' && $('image-format').value === 'png';
  $('range-field').hidden = ['compress', 'merge'].includes(state.mode);
  $('column-gap-field').hidden = $('excel-mode').value !== 'columns';
  $('word-hint').textContent = $('word-mode').value === 'text' ? '提取文字到 DOCX；不保留复杂排版、图片及表格。扫描件请使用图片模式，本工具不含 OCR。' : '以页面图片生成 DOCX，支持扫描件并保留外观；页面内容不可单独编辑。';
  $('angle-value').textContent = $('watermark-angle').value + '°';
  $('opacity-value').textContent = $('watermark-opacity').value + '%';
}
function switchMode(mode) {
  if (!tools[mode] || locked()) return;
  state.mode = mode; clearOutputs();
  $('workspace').classList.toggle('watermark', mode === 'watermark');
  $('tool-title').textContent = tools[mode][0]; $('tool-description').textContent = tools[mode][1];
  $('empty-state').querySelector('h3').textContent = tools[mode][0];
  document.querySelectorAll('[data-mode]').forEach(node => {
    node.classList.toggle('active', node.dataset.mode === mode);
    if (node.dataset.mode === mode) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-options]').forEach(node => { node.hidden = node.dataset.options !== mode; });
  syncOptions(); renderFiles(); status(activeFiles().length ? '文件已就绪，请设置参数后开始处理' : '准备就绪，添加文件后即可开始');
}
function fileIcon(item) {
  const node = element('div', 'pdf-file-icon' + (item.image ? ' image-file' : ''));
  node.setAttribute('aria-hidden', 'true'); node.append(icon('file'), element('span', '', item.image ? 'IMG' : 'PDF')); return node;
}
function renderMeta(item) {
  const node = metadata.get(item.id); if (!node) return;
  node.className = 'file-meta' + (item.resultError ? ' error' : item.resultNote ? ' success' : '');
  node.textContent = item.resultError || (item.outputSize !== undefined ? `${engine.sizeLabel(item.file.size)} → ${engine.sizeLabel(item.outputSize)} · ${item.resultNote}` : `${engine.sizeLabel(item.file.size)} · ${item.pages} 页${item.rotation ? ` · 旋转 ${item.rotation}°` : ''}${item.excluded.size ? ` · 已排除 ${item.excluded.size} 页` : ''}`);
}
function moveFile(id, direction) {
  if (locked()) return;
  const index = state.files.findIndex(item => item.id === id), next = index + direction;
  if (next < 0 || next >= state.files.length) return;
  [state.files[index], state.files[next]] = [state.files[next], state.files[index]];
  clearOutputs(); renderFiles();
}
function rotateFile(item) {
  if (locked()) return;
  item.rotation = (item.rotation + 90) % 360; clearOutputs(); renderFiles();
}
async function removeFile(item) {
  if (locked()) return;
  state.files = state.files.filter(file => file !== item);
  clearOutputs(); renderFiles();
  for (const [key, url] of pageThumbs) if (key.startsWith(item.id + ':')) { URL.revokeObjectURL(url); pageThumbs.delete(key); }
  await engine.disposeFile(item);
  status('已从队列移除，原文件保留');
}
function enqueueThumbnail(node, item, page = 1) {
  if (observer) { node._thumbRequest = { item, page }; observer.observe(node); }
  else { thumbnailQueue.push({ node, item, page }); void runThumbnails(); }
}
async function runThumbnails() {
  if (thumbnailRunning || state.task) return;
  thumbnailRunning = true;
  try {
    while (thumbnailQueue.length && !state.task) {
      const { node, item, page } = thumbnailQueue.shift();
      if (!node.isConnected || !state.files.includes(item)) continue;
      try {
        const key = `${item.id}:${page}`;
        let url = page === 1 ? item.thumb : pageThumbs.get(key);
        if (!url) {
          url = await engine.thumbnail(item, page);
          if (!state.files.includes(item)) { URL.revokeObjectURL(url); continue; }
          if (page === 1) item.thumb = url; else pageThumbs.set(key, url);
        }
        if (!node.isConnected) continue;
        const img = element('img'); img.src = url; img.alt = `${item.name}，第 ${page} 页`;
        if (item.rotation) img.style.transform = `rotate(${item.rotation}deg)`;
        node.replaceChildren(img);
      } catch { node.textContent = '预览不可用'; }
      await engine.pause();
    }
  } finally { thumbnailRunning = false; }
}
function mergeCard(item, index) {
  const card = element('article', 'merge-card'); card.dataset.id = item.id; card.draggable = !locked();
  const thumb = element('button', 'thumbnail-button'); thumb.setAttribute('aria-label', `预览 ${item.name}`);
  thumb.append(element('span', 'thumb-placeholder', '正在准备预览…')); thumb.onclick = () => openPreview(item);
  const title = element('button', 'file-name', item.name); title.title = item.name; title.onclick = () => openPreview(item);
  const meta = element('p', 'file-meta'); metadata.set(item.id, meta);
  const actions = element('div', 'file-actions');
  const up = action('up', '上移文件', () => moveFile(item.id, -1)), down = action('down', '下移文件', () => moveFile(item.id, 1));
  up.dataset.move = 'up'; down.dataset.move = 'down'; up.dataset.id = down.dataset.id = item.id;
  actions.append(up, down, action('rotate', '顺时针旋转全部页面', () => rotateFile(item)), action('trash', `移除 ${item.name}`, () => void removeFile(item)));
  card.append(thumb, element('span', 'merge-order', String(index + 1).padStart(2, '0')), title, meta, actions);
  card.addEventListener('dragstart', event => { if (locked()) { event.preventDefault(); return; } dragId = item.id; event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
  card.addEventListener('dragover', event => { if (dragId && dragId !== item.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('drag-over'); } });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.drag-over').forEach(node => node.classList.remove('dragging', 'drag-over')); });
  card.addEventListener('drop', event => {
    if (!dragId || locked()) return;
    event.preventDefault(); event.stopPropagation();
    const from = state.files.findIndex(file => file.id === dragId), to = state.files.indexOf(item);
    if (from >= 0 && to >= 0 && from !== to) { const [moved] = state.files.splice(from, 1); state.files.splice(to, 0, moved); }
    dragId = null; clearOutputs(); renderFiles();
  });
  return { card, thumb };
}
function renderFiles() {
  observer?.disconnect(); thumbnailQueue.length = 0; metadata.clear();
  const list = $('file-list'); list.replaceChildren(); list.className = state.mode === 'merge' ? 'file-list merge-grid' : 'file-list';
  const pending = [];
  activeFiles().forEach((item, index) => {
    if (state.mode === 'merge') {
      const { card, thumb } = mergeCard(item, index); list.append(card); pending.push([thumb, item, 1]);
      if ($('show-pages').checked) {
        const grid = element('div', 'page-grid'); grid.setAttribute('aria-label', item.name + ' 的页面');
        for (let page = 1; page <= Math.min(500, item.pages); page++) {
          const tile = element('div', 'page-tile' + (item.excluded.has(page) ? ' excluded' : ''));
          const picture = element('button', 'thumbnail-button'); picture.style.height = '115px'; picture.onclick = () => openPreview(item, page); picture.setAttribute('aria-label', `预览 ${item.name} 第 ${page} 页`);
          const toggle = element('button', 'page-toggle', item.excluded.has(page) ? '+' : '✓');
          toggle.setAttribute('aria-pressed', String(!item.excluded.has(page))); toggle.setAttribute('aria-label', `包含 ${item.name} 第 ${page} 页`);
          toggle.onclick = () => {
            if (locked()) return;
            if (item.excluded.has(page)) item.excluded.delete(page); else item.excluded.add(page);
            clearOutputs(); renderMeta(item); tile.classList.toggle('excluded', item.excluded.has(page));
            toggle.textContent = item.excluded.has(page) ? '+' : '✓'; toggle.setAttribute('aria-pressed', String(!item.excluded.has(page)));
          };
          tile.append(picture, toggle, element('span', '', `第 ${page} 页`)); grid.append(tile); pending.push([picture, item, page]);
        }
        if (item.pages > 500) grid.append(element('p', 'option-hint', '仅显示前 500 页；请先拆分大文档再合并。'));
        list.append(grid);
      }
    } else {
      const row = element('article', 'file-row'), info = element('div', 'file-info');
      const title = element('button', 'file-name', item.name); title.title = item.name; title.onclick = () => openPreview(item);
      const meta = element('p', 'file-meta'); metadata.set(item.id, meta); info.append(title, meta);
      const actions = element('div', 'file-actions');
      const related = state.outputs.filter(output => output.sourceId === item.id);
      if (related.length === 1) actions.append(action('download', `下载 ${related[0].name}`, () => saveBlob(related[0].blob, related[0].name), 'download'));
      actions.append(action('search', state.mode === 'watermark' ? '预览水印效果' : '预览文件', () => openPreview(item)), action('trash', `移除 ${item.name}`, () => void removeFile(item)));
      row.append(fileIcon(item), info, actions); list.append(row);
    }
    renderMeta(item);
  });
  updateControls();
  for (const request of pending) enqueueThumbnail(...request);
}
function renderResults() {
  $('results').hidden = !state.outputs.length; $('download-all').hidden = !state.outputs.length;
  $('results-count').textContent = `${state.outputs.length} 个文件`;
  $('download-all').querySelector('span').textContent = state.outputs.length === 1 ? '下载结果' : '打包下载全部';
  const list = $('result-list'); list.replaceChildren();
  state.outputs.forEach(result => {
    const row = element('div', 'result-row'), info = element('div');
    info.append(element('p', 'result-name', result.name), element('p', 'result-note', `${engine.sizeLabel(result.blob.size)}${result.note ? ' · ' + result.note : ''}`));
    row.append(info, action('download', `下载 ${result.name}`, () => saveBlob(result.blob, result.name), 'download')); list.append(row);
  });
}
async function addFiles(files) {
  if (!engine || locked() || !files.length) return;
  state.importing = true; clearOutputs(); updateControls();
  $('import-state').hidden = false;
  const errors = []; let added = 0;
  try {
    for (const file of files) {
      $('import-state').textContent = '正在读取 ' + file.name;
      if (state.files.length >= 50) { errors.push('队列最多 50 个文件，其余文件未添加。'); break; }
      if (file.size > 100 * 1024 ** 2) { errors.push(`${file.name}：超过单文件 100 MB 限制`); continue; }
      if (file.size + state.files.reduce((sum, item) => sum + item.file.size, 0) > 200 * 1024 ** 2) { errors.push(`${file.name}：队列合计超过 200 MB`); continue; }
      if (state.files.some(item => item.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) { errors.push(`${file.name}：已在队列中`); continue; }
      if (state.mode !== 'merge' && !/\.pdf$/i.test(file.name)) { errors.push(`${file.name}：请在「PDF 合并」中添加图片`); continue; }
      try { state.files.push(await engine.openFile(file)); added++; }
      catch (error) { errors.push(`${file.name}：${error.message}`); }
      await engine.pause();
    }
  } finally {
    state.importing = false; $('import-state').hidden = true; $('file-input').value = ''; renderFiles();
    status(`已添加 ${added} 个文件${errors.length ? `，${errors.length} 项未添加` : ''}`);
    if (errors.length) toast(errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n其余文件未添加，请检查文件类型和大小。' : ''), true);
  }
}
function numeric(id) {
  const field = $(id);
  if (!field.checkValidity() || !Number.isFinite(Number(field.value)) || field.value.trim() === '') {
    field.focus(); throw new Error(`参数应在 ${field.min} 到 ${field.max} 之间。`);
  }
  return Number(field.value);
}
function readOptions() {
  const options = { range: $('range-field').hidden ? '' : $('page-range').value.trim() };
  if (state.mode === 'compress') {
    options.compression = state.compression;
    if (state.compression === 'strong') { options.dpi = Number($('compress-dpi').value); options.quality = numeric('compress-quality'); }
  }
  if (state.mode === 'merge') options.filename = $('merge-name').value.trim() || '合并文档';
  if (state.mode === 'split') { options.splitMode = $('split-mode').value; options.chunk = options.splitMode === 'count' ? numeric('split-chunk') : 1; }
  if (state.mode === 'watermark') {
    options.text = $('watermark-text').value.trim();
    if (!options.text) { $('watermark-text').focus(); throw new Error('请输入水印文本。'); }
    Object.assign(options, { fontSize: numeric('watermark-size'), color: $('watermark-color').value, margin: numeric('watermark-margin'), angle: Number($('watermark-angle').value), opacity: Number($('watermark-opacity').value), tile: $('watermark-tile').checked, position: $('watermark-position').value });
  }
  if (state.mode === 'extract') { options.minImage = Number($('extract-min').value); options.dedupe = $('extract-dedupe').checked; }
  if (state.mode === 'images') options.format = $('image-format').value;
  if (state.mode === 'word') options.wordMode = $('word-mode').value;
  if (state.mode === 'excel') { options.excelMode = $('excel-mode').value; options.columnGap = options.excelMode === 'columns' ? numeric('column-gap') : 12; }
  if (!$('render-options').hidden) { options.dpi = Number($('render-dpi').value); options.quality = $('quality-field').hidden ? 90 : numeric('render-quality'); }
  return options;
}
function abortError() { return new DOMException('处理已取消', 'AbortError'); }
async function run() {
  if (!engine || locked() || !activeFiles().length) return;
  let options;
  try { options = readOptions(); }
  catch (error) { toast(error.message, true); return; }
  clearOutputs(); closePreview();
  const task = { cancelled: false }, files = activeFiles().slice(), mode = state.mode;
  state.task = task; $('progress').value = 0; updateControls();
  let fileStatus = '正在合并文档', errors = [];
  const check = () => { if (task.cancelled) throw abortError(); };
  try {
    // Let any active thumbnail finish before reusing its PDF document.
    while (thumbnailRunning) { check(); await new Promise(resolve => setTimeout(resolve, 30)); }
    status('正在准备处理…');
    const outputs = await engine.processFiles(mode, files, options, {
      check,
      file(item, index, total) { fileStatus = `处理 ${index + 1}/${total} · ${item.name}`; status(fileStatus); },
      step(done, total) { const value = Math.max(0, Math.min(1, done / total)); $('progress').value = value; status(`${fileStatus} · ${Math.round(value * 100)}%`); },
      result(item, results) {
        const size = results.reduce((sum, result) => sum + result.blob.size, 0);
        if (state.outputs.reduce((sum, result) => sum + result.blob.size, size) > 256 * 1024 ** 2) throw new Error('累计输出超过 256 MB，请减少文件或降低分辨率后分批处理。');
        state.outputs.push(...results.map(result => ({ ...result, sourceId: item.id })));
        item.outputSize = size; item.resultNote = results.length === 1 ? results[0].note || '处理完成' : `已生成 ${results.length} 个文件`;
        renderMeta(item); renderResults();
      },
      error(item, error) { item.resultError = error.message; renderMeta(item); },
    });
    check();
    if (mode === 'merge') { state.outputs = outputs; renderResults(); }
    errors = outputs.errors || [];
    status(errors.length ? `生成 ${state.outputs.length} 个结果，${errors.length} 个文件处理失败` : `处理完成，已生成 ${state.outputs.length} 个文件，请下载保存`, Boolean(errors.length));
    if (errors.length) toast(errors.slice(0, 4).join('\n'), true);
  } catch (error) {
    status(error.name === 'AbortError' ? `已取消${state.outputs.length ? '，已完成的结果仍可下载' : ''}` : '处理失败：' + error.message, error.name !== 'AbortError');
    if (error.name !== 'AbortError') toast(error.message, true);
  } finally { state.task = null; renderFiles(); updateControls(); void runThumbnails(); }
}
async function downloadAll() {
  if (locked() || !state.outputs.length) return;
  if (state.outputs.length === 1) { saveBlob(state.outputs[0].blob, state.outputs[0].name); return; }
  const task = { cancelled: false }; state.task = task; updateControls(); status('正在打包下载文件…'); $('progress').value = 0;
  const check = () => { if (task.cancelled) throw abortError(); };
  try {
    state.archive ||= await engine.zipOutputs(state.outputs, `${tools[state.mode][0]}_结果.zip`, check);
    check(); saveBlob(state.archive.blob, state.archive.name);
  } catch (error) { status(error.name === 'AbortError' ? '已取消打包，处理结果保留' : error.message, error.name !== 'AbortError'); }
  finally { state.task = null; updateControls(); void runThumbnails(); }
}
function closePreview() {
  previewToken++; previewItem = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
  if ($('preview').open) $('preview').close();
  $('preview-content').replaceChildren();
}
function openPreview(item, page = 1) {
  if (locked()) return;
  previewItem = item; previewPage = page; $('preview-title').textContent = item.name;
  if (!$('preview').open) $('preview').showModal();
  void drawPreview();
}
async function drawPreview() {
  const token = ++previewToken, item = previewItem, number = previewPage;
  if (!item) return;
  $('preview-page').textContent = `${number} / ${item.pages}`;
  $('preview-prev').disabled = number <= 1; $('preview-next').disabled = number >= item.pages;
  $('preview-kind').textContent = state.mode === 'watermark' ? '当前水印效果' : state.mode === 'merge' && item.rotation ? `已旋转 ${item.rotation}°` : '原文件预览';
  $('preview-content').replaceChildren(element('span', '', '正在加载预览…'));
  try {
    const rendered = state.mode === 'watermark' ? await engine.previewWatermark(item, number, readOptions()) : await engine.renderPage(item, number, 110, 2500000);
    let url;
    try { url = URL.createObjectURL(await engine.canvasBlob(rendered.canvas)); }
    finally { engine.releaseCanvas(rendered.canvas); }
    if (token !== previewToken || !previewItem) { URL.revokeObjectURL(url); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = url;
    const image = element('img'); image.src = url; image.alt = `${item.name} 第 ${number} 页预览`;
    if (state.mode === 'merge' && item.rotation) image.style.transform = `rotate(${item.rotation}deg)`;
    $('preview-content').replaceChildren(image);
  } catch (error) { if (token === previewToken) $('preview-content').replaceChildren(element('span', '', '预览失败：' + error.message)); }
}
function setTheme(choice) {
  document.documentElement.dataset.theme = choice === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
}
async function initialize() {
  const store = window.wtools?.dbStorage || { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
  let choice = 'system';
  try { const saved = store.getItem('pdf-theme'); if (['light', 'dark', 'system'].includes(saved)) choice = saved; } catch { /* Preferences are optional. */ }
  $('theme').value = choice; setTheme(choice);
  $('theme').onchange = () => { setTheme($('theme').value); try { store.setItem('pdf-theme', $('theme').value); } catch { toast('外观已应用，但偏好未能保存。', true); } };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ($('theme').value === 'system') setTheme('system'); });
  $('settings-open').onclick = () => $('settings').showModal(); $('settings-close').onclick = () => $('settings').close();
  $('preview-close').onclick = closePreview;
  $('preview').addEventListener('cancel', event => { event.preventDefault(); closePreview(); });
  $('preview-prev').onclick = () => { if (previewPage > 1) { previewPage--; void drawPreview(); } };
  $('preview-next').onclick = () => { if (previewItem && previewPage < previewItem.pages) { previewPage++; void drawPreview(); } };
  for (const dialog of [$('preview'), $('settings')]) dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) { if (dialog.id === 'preview') closePreview(); else dialog.close(); } });
  try { engine = await import('./engine.js'); }
  catch (error) { status('处理模块无法加载，请重新安装完整插件包。', true); toast('模块加载失败：' + error.message, true); return; }
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting && entry.target._thumbRequest) {
      thumbnailQueue.push({ node: entry.target, ...entry.target._thumbRequest }); observer.unobserve(entry.target);
    }
    void runThumbnails();
  }, { root: $('file-scroll'), rootMargin: '100px' });
  document.querySelectorAll('[data-mode]').forEach(button => { button.title = tools[button.dataset.mode][0]; button.onclick = () => switchMode(button.dataset.mode); });
  document.querySelectorAll('[data-compression]').forEach(button => { button.onclick = () => {
    state.compression = button.dataset.compression;
    document.querySelectorAll('[data-compression]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    clearOutputs(); syncOptions(); renderFiles();
  }; });
  $('options').addEventListener('input', event => {
    if (event.target.id !== 'show-pages') {
      clearOutputs(); for (const item of state.files) renderMeta(item);
      status('参数已更新，开始处理后生成新结果');
    }
    syncOptions(); updateControls();
  });
  $('show-pages').addEventListener('change', renderFiles);
  $('add-files').onclick = $('empty-add').onclick = () => { if (!locked()) $('file-input').click(); };
  $('file-input').onchange = () => void addFiles([...$('file-input').files]);
  $('clear-files').onclick = async () => {
    if (locked()) return;
    closePreview(); const removed = state.files; state.files = []; clearOutputs(); renderFiles();
    for (const url of pageThumbs.values()) URL.revokeObjectURL(url); pageThumbs.clear();
    for (const item of removed) await engine.disposeFile(item);
    status('列表已清空，原文件保留');
  };
  $('start').onclick = () => void run(); $('download-all').onclick = () => void downloadAll();
  $('cancel').onclick = () => { if (state.task) { state.task.cancelled = true; status('正在取消，当前页面处理结束后停止…'); updateControls(); } };
  document.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); if (++dropDepth > 0 && !locked()) $('drop-overlay').hidden = false; } });
  document.addEventListener('dragleave', event => { if (event.dataTransfer?.types.includes('Files')) { dropDepth = Math.max(0, dropDepth - 1); if (!dropDepth) $('drop-overlay').hidden = true; } });
  document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = locked() ? 'none' : 'copy'; } });
  document.addEventListener('drop', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); dropDepth = 0; $('drop-overlay').hidden = true;
    if (!locked()) void addFiles([...event.dataTransfer.files]);
  });
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || $('preview').open || $('settings').open) return;
    if (event.key.toLowerCase() === 'o') { event.preventDefault(); if (!locked()) $('file-input').click(); }
    if (event.key === 'Enter') { event.preventDefault(); void run(); }
  });
  const host = window.wtools;
  if (host?.onPluginEnter) host.onPluginEnter(entry => {
    if (tools[entry.code]) switchMode(entry.code);
    if (entry.type === 'files' && Array.isArray(entry.payload)) toast('请点击「添加文件」或将文件拖入页面。');
  });
  syncOptions(); renderFiles();
}
void initialize();
