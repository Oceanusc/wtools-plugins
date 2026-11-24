import * as pdfjs from './vendor/pdf.min.js';
import { WorkerMessageHandler } from './vendor/pdf.worker.min.js';
import { exportWord, exportPpt, exportExcel } from './office.js';

// The in-process worker also works in WTools WebViews without Worker URL support.
globalThis.pdfjsWorker = { WorkerMessageHandler };
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
const { PDFDocument, degrees } = window.PDFLib;
const MIME_PDF = 'application/pdf';
export const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export const stem = name => name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 90) || 'document';
export function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / (bytes < 1048576 ? 1024 : 1048576)).toFixed(2)} ${bytes < 1048576 ? 'KB' : 'MB'}`;
}
export function pageNumbers(input, count) {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const result = new Set();
  for (const part of input.replace(/，/g, ',').split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error('页码格式不正确，请使用 1-3,5 这样的格式。');
    const first = Number(match[1]), last = Number(match[2] || first);
    if (first < 1 || last > count || first > last) throw new Error(`页码超出范围；当前文件共有 ${count} 页。`);
    for (let n = first; n <= last; n++) result.add(n);
  }
  return [...result].sort((a, b) => a - b);
}
export function canvasBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败，请降低输出分辨率。')), type, quality));
}
export function releaseCanvas(canvas) { canvas.width = 1; canvas.height = 1; }
export async function openFile(file) {
  const image = /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!image && !/\.pdf$/i.test(file.name)) throw new Error('仅支持 PDF、PNG、JPG 和 WebP 文件。');
  if (!file.size) throw new Error('文件为空。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const item = { id: crypto.randomUUID(), file, bytes, name: file.name, image, rotation: 0, excluded: new Set(), pages: 1, preview: null, thumb: null, pdf: null };
  try {
    if (image) {
      const bitmap = await createImageBitmap(file);
      item.width = bitmap.width; item.height = bitmap.height; bitmap.close();
    } else {
      item.pdf = await pdfjs.getDocument({
        data: bytes.slice(), isEvalSupported: false, useSystemFonts: true,
        cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
        stopAtErrors: true,
      }).promise;
      item.pages = item.pdf.numPages;
      // pdf-lib cannot safely edit encrypted files, even when they have an empty password.
      await PDFDocument.load(bytes, { updateMetadata: false });
    }
    return item;
  } catch (error) {
    await item.pdf?.destroy();
    if (/password|encrypt/i.test(error.name + error.message)) throw new Error('暂不支持加密 PDF，请先解除密码和加密后添加。');
    throw new Error('文件无法读取：' + (error.message || '文件可能已损坏'));
  }
}
export async function disposeFile(item) {
  if (item.thumb) URL.revokeObjectURL(item.thumb);
  await item.pdf?.destroy();
}
export async function renderPage(item, number, dpi = 120, maxPixels = 16000000) {
  const canvas = document.createElement('canvas');
  let viewport, page;
  if (item.image) {
    const bitmap = await createImageBitmap(item.file);
    const ratio = Math.min(1, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)), 8192 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return { canvas, width: item.width * .75, height: item.height * .75, capped: ratio < 1 };
  }
  page = await item.pdf.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const requested = dpi / 72;
  const scale = Math.min(requested, Math.sqrt(maxPixels / (base.width * base.height)), 8192 / Math.max(base.width, base.height));
  viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
    return { canvas, width: base.width, height: base.height, capped: scale < requested };
  } catch (error) { releaseCanvas(canvas); throw error; }
}
export async function thumbnail(item, number = 1) {
  const { canvas } = await renderPage(item, number, 26, 200000);
  try { return URL.createObjectURL(await canvasBlob(canvas)); }
  finally { releaseCanvas(canvas); }
}
export async function zipOutputs(outputs, name, check = () => {}) {
  const zip = new window.JSZip(), names = new Set();
  for (const output of outputs) {
    check();
    let filename = output.name, index = 2;
    while (names.has(filename.toLowerCase())) filename = output.name.replace(/(\.[^.]*)?$/, (_, ext = '') => ` (${index++})${ext}`);
    names.add(filename.toLowerCase());
    zip.file(filename, await output.blob.arrayBuffer());
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }, check);
  return { name, blob };
}
const output = (name, bytes, type = MIME_PDF, note = '') => ({ name, blob: new Blob([bytes], { type }), note });
async function editable(item) { return PDFDocument.load(item.bytes, { updateMetadata: false }); }
function availablePages(item, options) {
  const pages = pageNumbers(options.range || '', item.pages);
  if (pages.length > 500) throw new Error('单次最多处理 500 页，请设置页码范围。');
  return pages;
}
async function merge(items, options, ctx) {
  const result = await PDFDocument.create();
  let done = 0;
  const total = items.reduce((sum, item) => sum + item.pages - item.excluded.size, 0);
  if (!total) throw new Error('请至少保留一页。');
  if (total > 500) throw new Error('一次最多合并 500 页。');
  for (const item of items) {
    ctx.check();
    if (item.image) {
      if (item.excluded.has(1)) continue;
      const { canvas, width, height } = await renderPage(item, 1);
      try {
        const embedded = await result.embedPng(await (await canvasBlob(canvas)).arrayBuffer());
        const page = result.addPage([width, height]);
        page.drawImage(embedded, { x: 0, y: 0, width, height });
        page.setRotation(degrees(item.rotation));
      } finally { releaseCanvas(canvas); }
      ctx.step(++done, total);
    } else {
      const source = await editable(item);
      for (let number = 1; number <= item.pages; number++) {
        ctx.check();
        if (item.excluded.has(number)) continue;
        const [page] = await result.copyPages(source, [number - 1]);
        page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
        result.addPage(page); ctx.step(++done, total); await pause();
      }
    }
  }
  ctx.check();
  return [output(`${stem(options.filename || '合并文档')}.pdf`, await result.save())];
}
async function compress(item, options, ctx) {
  let bytes, note = '';
  if (options.compression === 'basic') {
    const doc = await editable(item);
    bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 30 });
  } else {
    if (item.pages > 500) throw new Error('强压缩单次最多支持 500 页。');
    const doc = await PDFDocument.create();
    let capped = false;
    for (let n = 1; n <= item.pages; n++) {
      ctx.check();
      const rendered = await renderPage(item, n, options.dpi);
      try {
        const image = await doc.embedJpg(await (await canvasBlob(rendered.canvas, 'image/jpeg', options.quality / 100)).arrayBuffer());
        doc.addPage([rendered.width, rendered.height]).drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
        capped ||= rendered.capped;
      } finally { releaseCanvas(rendered.canvas); }
      ctx.step(n, item.pages); await pause();
    }
    bytes = await doc.save();
    note = '页面已转为图片，文字不可选中' + (capped ? '；超大页面已限制分辨率' : '');
  }
  if (bytes.byteLength >= item.bytes.byteLength) {
    bytes = item.bytes;
    note = '未获得更小体积，保留原文件';
  } else note = `减少 ${Math.round((1 - bytes.byteLength / item.bytes.byteLength) * 100)}%${note ? ' · ' + note : ''}`;
  ctx.check(); ctx.step(1, 1);
  return [output(`${stem(item.name)}_压缩.pdf`, bytes, MIME_PDF, note)];
}
async function split(item, options, ctx) {
  const selected = availablePages(item, options), source = await editable(item), outputs = [];
  const groups = options.splitMode === 'range' ? [selected] : options.splitMode === 'each' ? selected.map(n => [n]) : [];
  if (options.splitMode === 'count') for (let i = 0; i < selected.length; i += options.chunk) groups.push(selected.slice(i, i + options.chunk));
  let done = 0;
  for (const group of groups) {
    ctx.check();
    const doc = await PDFDocument.create();
    for (const page of await doc.copyPages(source, group.map(n => n - 1))) doc.addPage(page);
    outputs.push(output(`${stem(item.name)}_p${group[0]}${group.length > 1 ? '-' + group.at(-1) : ''}.pdf`, await doc.save()));
    ctx.step(++done, groups.length); await pause();
  }
  return outputs;
}
function watermarkCanvas(options) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  const font = `${options.fontSize * 2}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(options.text).width + 16);
  canvas.height = Math.ceil(options.fontSize * 3.2);
  if (canvas.width > 12000) throw new Error('水印文字过长，请缩短内容或减小字号。');
  context.font = font; context.fillStyle = options.color; context.textBaseline = 'middle';
  context.fillText(options.text, 8, canvas.height / 2);
  return canvas;
}
async function watermark(item, options, ctx) {
  const doc = await editable(item), pages = availablePages(item, options);
  const canvas = watermarkCanvas(options);
  let image;
  try { image = await doc.embedPng(await (await canvasBlob(canvas)).arrayBuffer()); }
  finally { releaseCanvas(canvas); }
  const textWidth = image.width / 2, textHeight = image.height / 2;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    const page = doc.getPage(pages[i] - 1);
    const box = page.getCropBox(), rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const width = rotation % 180 ? box.height : box.width, height = rotation % 180 ? box.width : box.height;
    // Position is expressed in the visible, rotated page, then mapped to PDF coordinates.
    const toPdf = (x, y) => rotation === 90 ? [box.x + box.width - y, box.y + x] : rotation === 180 ? [box.x + box.width - x, box.y + box.height - y] : rotation === 270 ? [box.x + y, box.y + box.height - x] : [box.x + x, box.y + y];
    const angle = options.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const draw = (cx, cy) => {
      const [x, y] = toPdf(cx - textWidth / 2 * c + textHeight / 2 * s, cy - textWidth / 2 * s - textHeight / 2 * c);
      page.drawImage(image, { x, y, width: textWidth, height: textHeight, opacity: options.opacity / 100, rotate: degrees(options.angle + rotation) });
    };
    if (options.tile) {
      const gapX = Math.max(textWidth + options.margin, 60), gapY = Math.max(textHeight + options.margin + 40, 60);
      if (Math.ceil(width / gapX) * Math.ceil(height / gapY) > 2000) throw new Error('水印过密，请增大间距。');
      for (let y = gapY / 2; y < height; y += gapY) for (let x = gapX / 2; x < width; x += gapX) draw(x, y);
    } else {
      const [row, column] = options.position.split('-').map(Number);
      const extentX = Math.abs(textWidth * c) / 2 + Math.abs(textHeight * s) / 2;
      const extentY = Math.abs(textWidth * s) / 2 + Math.abs(textHeight * c) / 2;
      draw(column === 0 ? options.margin + extentX : column === 2 ? width - options.margin - extentX : width / 2,
        row === 0 ? height - options.margin - extentY : row === 2 ? options.margin + extentY : height / 2);
    }
    ctx.step(i + 1, pages.length); await pause();
  }
  ctx.check();
  return [output(`${stem(item.name)}_水印.pdf`, await doc.save())];
}
export async function previewWatermark(item, number, options) {
  // A single copied page gives the same result as export without rewriting the entire input.
  const source = await editable(item), onePage = await PDFDocument.create();
  const [page] = await onePage.copyPages(source, [number - 1]); onePage.addPage(page);
  const temporary = { bytes: await onePage.save(), pages: 1, name: item.name };
  const [result] = await watermark(temporary, { ...options, range: '' }, { check() {}, step() {} });
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await result.blob.arrayBuffer()), isEvalSupported: false,
    useSystemFonts: true, cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href }).promise;
  try { return await renderPage({ pdf }, 1, 110, 2500000); }
  finally { await pdf.destroy(); }
}
async function images(item, options, ctx) {
  const pages = availablePages(item, options), outputs = [];
  let outputSize = 0;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    const { canvas, capped } = await renderPage(item, pages[i], options.dpi);
    try {
      const blob = await canvasBlob(canvas, options.format === 'png' ? 'image/png' : 'image/jpeg', options.quality / 100);
      outputSize += blob.size;
      if (outputSize > 256 * 1024 ** 2) throw new Error('输出超过 256 MB，请减少页码范围或降低分辨率。');
      outputs.push({ name: `${stem(item.name)}_p${String(pages[i]).padStart(3, '0')}.${options.format}`, blob, note: capped ? '超大页面已限制为 1600 万像素' : '' });
    } finally { releaseCanvas(canvas); }
    ctx.step(i + 1, pages.length); await pause();
  }
  return outputs;
}
function imageCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  if (!canvas.width || !canvas.height || canvas.width * canvas.height > 32000000) throw new Error('内嵌图片过大或尺寸无效，请尝试 PDF 转图片。');
  const context = canvas.getContext('2d');
  if (image.bitmap) { context.drawImage(image.bitmap, 0, 0); return canvas; }
  const pixels = context.createImageData(image.width, image.height), source = image.data, destination = pixels.data;
  if (!source) throw new Error('无法解码内嵌图片，请尝试 PDF 转图片。');
  if (image.kind === pdfjs.ImageKind.RGBA_32BPP) destination.set(source);
  else {
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const index = y * image.width + x, target = index * 4;
      if (image.kind === pdfjs.ImageKind.RGB_24BPP) {
        destination[target] = source[index * 3]; destination[target + 1] = source[index * 3 + 1]; destination[target + 2] = source[index * 3 + 2];
      } else {
        const value = source[y * Math.ceil(image.width / 8) + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
        destination[target] = value; destination[target + 1] = value; destination[target + 2] = value;
      }
      destination[target + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0); return canvas;
}
async function extract(item, options, ctx) {
  const pages = availablePages(item, options), outputs = [], seen = new Set();
  let outputSize = 0;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    const page = await item.pdf.getPage(pages[i]);
    // Rendering resolves decoded XObjects in page.objs / commonObjs.
    const rendered = await renderPage(item, pages[i], 10, 100000); releaseCanvas(rendered.canvas);
    const list = await page.getOperatorList();
    for (let j = 0; j < list.fnArray.length; j++) {
      ctx.check();
      const operator = list.fnArray[j], args = list.argsArray[j];
      if (![pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintInlineImageXObject].includes(operator)) continue;
      const inline = operator === pdfjs.OPS.paintInlineImageXObject;
      const id = inline ? `inline-${pages[i]}-${j}` : args[0];
      if (options.dedupe && seen.has(id)) continue;
      const image = inline ? args[0] : (id.startsWith('g_') ? page.commonObjs : page.objs).get(id);
      if (!image || image.width < options.minImage || image.height < options.minImage) continue;
      const canvas = imageCanvas(image);
      try {
        const blob = await canvasBlob(canvas); outputSize += blob.size;
        if (outputSize > 256 * 1024 ** 2) throw new Error('输出超过 256 MB，请缩小页码范围分批提取。');
        outputs.push({ name: `${stem(item.name)}_p${pages[i]}_img${outputs.length + 1}.png`, blob });
      }
      finally { releaseCanvas(canvas); }
      seen.add(id); await pause();
    }
    ctx.step(i + 1, pages.length); await pause();
  }
  if (!outputs.length) throw new Error('所选页中没有符合尺寸条件的内嵌图片；矢量图请使用「PDF 转图片」。');
  return outputs;
}
export async function textLines(item, number) {
  const page = await item.pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent(), lines = [];
  const entries = content.items.filter(item => item.str?.trim()).map(item => {
    const matrix = pdfjs.Util.transform(viewport.transform, item.transform);
    return { text: item.str, x: matrix[4], y: matrix[5], width: item.width, height: Math.hypot(matrix[2], matrix[3]) || item.height || 10 };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const entry of entries) {
    let line = lines.at(-1);
    if (!line || Math.abs(line.y - entry.y) > Math.max(2, Math.min(line.height, entry.height) * .4)) {
      line = { y: entry.y, height: entry.height, cells: [] }; lines.push(line);
    }
    line.cells.push(entry);
  }
  for (const line of lines) line.cells.sort((a, b) => a.x - b.x);
  return { lines, width: viewport.width, height: viewport.height };
}
export async function processFiles(mode, items, options, context) {
  if (mode === 'merge') return merge(items, options, context);
  const handlers = { compress, split, watermark, extract, images,
    word: (item, opts, ctx) => exportWord(item, opts, ctx, { renderPage, canvasBlob, releaseCanvas, textLines, pageNumbers, stem, pause }),
    ppt: (item, opts, ctx) => exportPpt(item, opts, ctx, { renderPage, canvasBlob, releaseCanvas, pageNumbers, stem, pause }),
    excel: (item, opts, ctx) => exportExcel(item, opts, ctx, { textLines, pageNumbers, stem, pause }),
  };
  const outputs = [], errors = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index]; context.check(); context.file(item, index, items.length);
    const ctx = { ...context, step: (done, total) => context.step((index + done / total) / items.length, 1) };
    try {
      const results = await handlers[mode](item, options, ctx);
      context.check(); outputs.push(...results.map(result => ({ ...result, sourceId: item.id })));
      context.result(item, results);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      errors.push(`${item.name}：${error.message}`); context.error(item, error);
    }
    context.step(index + 1, items.length); await pause();
  }
  return Object.assign(outputs, { errors });
}
