import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';
import {
  getExt,
  replaceExtension,
  hexToRgba,
  computeResizeDimensions,
  computeCropRect,
  computePadLayout,
  encodeBmp,
  encodeIco,
  optimizeSvg,
} from './codecs.js';

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) reject(new Error('图片编码失败'));
      else resolve(blob);
    }, mime, quality);
  });
}

export async function decodeImageFile(file) {
  const ext = getExt(file.name);
  if (ext === 'tif' || ext === 'tiff') {
    const buf = await file.arrayBuffer();
    const UTIF = window.UTIF;
    if (!UTIF) throw new Error('TIFF 解码器未加载');
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error('无效的 TIFF 文件');
    UTIF.decodeImage(buf, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const w = ifds[0].width;
    const h = ifds[0].height;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const imgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
    ctx.putImageData(imgData, 0, 0);
    return { canvas, width: w, height: h, ext };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`无法解码图片：${file.name}`));
      img.src = url;
    });
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, width: w, height: h, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodeCanvas(canvas, format, quality = 90) {
  const fmt = format.toLowerCase();
  const w = canvas.width;
  const h = canvas.height;

  if (fmt === 'png') {
    return canvasToBlob(canvas, 'image/png');
  }
  if (fmt === 'jpg' || fmt === 'jpeg') {
    const flat = createCanvas(w, h);
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0);
    return canvasToBlob(flat, 'image/jpeg', Math.max(0.01, Math.min(1, quality / 100)));
  }
  if (fmt === 'webp') {
    return canvasToBlob(canvas, 'image/webp', Math.max(0.01, Math.min(1, quality / 100)));
  }
  if (fmt === 'avif') {
    const blob = await canvasToBlob(canvas, 'image/avif', Math.max(0.01, Math.min(1, quality / 100)));
    if (blob.type !== 'image/avif') {
      throw new Error('当前系统内核不支持 AVIF 编码');
    }
    return blob;
  }
  if (fmt === 'bmp') {
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    return new Blob([encodeBmp(data, w, h)], { type: 'image/bmp' });
  }
  if (fmt === 'tiff' || fmt === 'tif') {
    const UTIF = window.UTIF;
    if (!UTIF) throw new Error('TIFF 编码器未加载');
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const buf = UTIF.encodeImage(new Uint8Array(data.buffer), w, h);
    return new Blob([buf], { type: 'image/tiff' });
  }
  if (fmt === 'gif') {
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(index, w, h, { palette });
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  }
  if (fmt === 'ico') {
    let target = canvas;
    if (w > 256 || h > 256) {
      const scale = Math.min(256 / w, 256 / h);
      const iw = Math.max(1, Math.round(w * scale));
      const ih = Math.max(1, Math.round(h * scale));
      target = createCanvas(iw, ih);
      target.getContext('2d').drawImage(canvas, 0, 0, iw, ih);
    }
    const pngBlob = await canvasToBlob(target, 'image/png');
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    return new Blob([encodeIco(pngBytes, target.width, target.height)], { type: 'image/x-icon' });
  }
  throw new Error(`不支持的输出格式：${format}`);
}

async function compressPng(canvas, quality, targetBytes) {
  const UPNG = window.UPNG;
  if (!UPNG) return canvasToBlob(canvas, 'image/png');
  const w = canvas.width;
  const h = canvas.height;
  const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const encodeWithCnum = cnum => {
    const buf = UPNG.encode([rgba.buffer.slice(0)], w, h, cnum);
    return new Blob([buf], { type: 'image/png' });
  };

  if (targetBytes > 0) {
    let best = null;
    for (const cnum of [256, 192, 128, 96, 64, 32, 16]) {
      const candidate = encodeWithCnum(cnum);
      best = candidate;
      if (candidate.size <= targetBytes) return candidate;
    }
    return best;
  }

  const cnum = quality >= 98 ? 0 : Math.max(16, Math.min(256, Math.round(16 + (quality / 100) * 240)));
  return encodeWithCnum(cnum);
}

async function compressByBinarySearch(canvas, fmt, targetBytes) {
  let lo = 5;
  let hi = 95;
  let best = null;
  for (let i = 0; i < 7; i++) {
    const mid = Math.round((lo + hi) / 2);
    const candidate = await encodeCanvas(canvas, fmt, mid);
    if (candidate.size <= targetBytes) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best || encodeCanvas(canvas, fmt, 5);
}

export async function compressFile(item, opts) {
  const ext = getExt(item.name);
  const quality = Math.max(1, Math.min(100, Number(opts.quality) || 80));
  const targetBytes = Number(opts.targetKb) > 0 ? Number(opts.targetKb) * 1024 : 0;

  if (ext === 'svg') {
    const text = await item.file.text();
    const optimized = optimizeSvg(text, quality);
    const blob = new Blob([optimized], { type: 'image/svg+xml' });
    if (blob.size >= item.size) throw new Error('已经达到最大压缩限度');
    return { blob, name: item.name, width: item.width, height: item.height };
  }

  const decoded = await decodeImageFile(item.file);
  let blob;
  if (ext === 'png') {
    blob = await compressPng(decoded.canvas, quality, targetBytes);
  } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'avif') {
    blob = targetBytes > 0
      ? await compressByBinarySearch(decoded.canvas, ext, targetBytes)
      : await encodeCanvas(decoded.canvas, ext, quality);
  } else if (ext === 'tif' || ext === 'tiff') {
    blob = await encodeCanvas(decoded.canvas, 'tiff', quality);
  } else {
    // Fallback for bmp/gif/ico if compressed directly
    blob = await encodeCanvas(decoded.canvas, 'webp', quality);
    return { blob, name: replaceExtension(item.name, 'webp'), width: decoded.width, height: decoded.height };
  }

  if (blob.size >= item.size && (!targetBytes || blob.size > targetBytes)) {
    throw new Error('已经达到最大压缩限度');
  }
  return { blob, name: item.name, width: decoded.width, height: decoded.height };
}

function drawWatermark(ctx, w, h, opts, wmImage) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, Number(opts.opacity || 50) / 100));
  const angleRad = (Number(opts.angle || 0) * Math.PI) / 180;

  let drawW = 0;
  let drawH = 0;
  if (opts.type === 'image' && wmImage) {
    const scalePct = Math.max(3, Math.min(100, Number(opts.imageScale || 20))) / 100;
    drawW = Math.max(12, Math.round(w * scalePct));
    drawH = Math.max(12, Math.round((wmImage.height / wmImage.width) * drawW));
  } else {
    const fontSize = Math.max(8, Number(opts.fontSize || 36));
    ctx.font = `600 ${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const metrics = ctx.measureText(opts.text || 'WTools');
    drawW = Math.max(20, metrics.width);
    drawH = fontSize * 1.2;
  }

  const stamp = (cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    if (opts.type === 'image' && wmImage) {
      ctx.drawImage(wmImage, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.fillText(opts.text || 'WTools', 0, 0);
    }
    ctx.restore();
  };

  if (opts.tile) {
    const gap = Math.max(10, Number(opts.tileGap || 80));
    const stepX = drawW + gap;
    const stepY = drawH + gap;
    for (let y = drawH / 2; y < h + drawH; y += stepY) {
      for (let x = drawW / 2; x < w + drawW; x += stepX) {
        stamp(x, y);
      }
    }
  } else {
    const [row, col] = String(opts.position || '2-2').split('-').map(Number);
    const margin = Math.max(16, Math.round(Math.min(w, h) * 0.04));
    const cx = col === 0 ? margin + drawW / 2 : col === 2 ? w - margin - drawW / 2 : w / 2;
    const cy = row === 0 ? margin + drawH / 2 : row === 2 ? h - margin - drawH / 2 : h / 2;
    stamp(cx, cy);
  }
  ctx.restore();
}

export async function processSingle(item, mode, opts) {
  if (mode === 'compress') return compressFile(item, opts);

  const decoded = await decodeImageFile(item.file);
  const src = decoded.canvas;
  const origExt = getExt(item.name);
  let outFormat = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'avif', 'bmp', 'gif', 'ico'].includes(origExt) ? origExt : 'png';
  let outCanvas = src;

  if (mode === 'convert') {
    outFormat = opts.format;
  } else if (mode === 'resize') {
    const dim = computeResizeDimensions(src.width, src.height, opts);
    outCanvas = createCanvas(dim.width, dim.height);
    const ctx = outCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dim.width, dim.height);
  } else if (mode === 'watermark') {
    outCanvas = createCanvas(src.width, src.height);
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(src, 0, 0);
    drawWatermark(ctx, src.width, src.height, opts, opts.wmImageCanvas || null);
  } else if (mode === 'round') {
    const w = src.width;
    const h = src.height;
    const radius = opts.unit === 'percent'
      ? Math.min(w, h) * (Math.max(1, Math.min(50, Number(opts.percent) || 15)) / 100)
      : Math.min(Math.min(w, h) / 2, Math.max(1, Number(opts.px) || 20));
    outCanvas = createCanvas(w, h);
    const ctx = outCanvas.getContext('2d');
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, radius);
    ctx.clip();
    ctx.drawImage(src, 0, 0);
    if (outFormat === 'jpg' || outFormat === 'jpeg' || outFormat === 'bmp') outFormat = 'png';
  } else if (mode === 'border') {
    const bw = Math.max(1, Math.round(Number(opts.width) || 16));
    const rgba = hexToRgba(opts.color, opts.opacity);
    if (opts.inside) {
      outCanvas = createCanvas(src.width, src.height);
      const ctx = outCanvas.getContext('2d');
      ctx.drawImage(src, 0, 0);
      ctx.strokeStyle = rgba.css;
      ctx.lineWidth = bw * 2;
      ctx.strokeRect(0, 0, src.width, src.height);
    } else {
      outCanvas = createCanvas(src.width + bw * 2, src.height + bw * 2);
      const ctx = outCanvas.getContext('2d');
      ctx.fillStyle = rgba.css;
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
      ctx.drawImage(src, bw, bw);
    }
    if (rgba.a < 1 && (outFormat === 'jpg' || outFormat === 'jpeg')) outFormat = 'png';
  } else if (mode === 'pad') {
    const layout = computePadLayout(src.width, src.height, opts);
    const rgba = hexToRgba(opts.color, opts.opacity);
    outCanvas = createCanvas(layout.width, layout.height);
    const ctx = outCanvas.getContext('2d');
    if (rgba.a > 0) {
      ctx.fillStyle = rgba.css;
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
    ctx.drawImage(src, layout.offsetX, layout.offsetY);
    if (rgba.a < 1 && (outFormat === 'jpg' || outFormat === 'jpeg' || outFormat === 'bmp')) outFormat = 'png';
  } else if (mode === 'crop') {
    const rect = computeCropRect(src.width, src.height, opts.ratioW, opts.ratioH, opts.anchor);
    outCanvas = createCanvas(rect.width, rect.height);
    outCanvas.getContext('2d').drawImage(src, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  } else if (mode === 'rotate') {
    const rad = (Number(opts.angle || 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const newW = Math.max(1, Math.round(src.width * cos + src.height * sin));
    const newH = Math.max(1, Math.round(src.width * sin + src.height * cos));
    outCanvas = createCanvas(newW, newH);
    const ctx = outCanvas.getContext('2d');
    if (opts.bg === 'white' || opts.bg === 'black') {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, newW, newH);
    } else if (outFormat === 'jpg' || outFormat === 'jpeg' || outFormat === 'bmp') {
      outFormat = 'png';
    }
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
  } else if (mode === 'flip') {
    outCanvas = createCanvas(src.width, src.height);
    const ctx = outCanvas.getContext('2d');
    ctx.translate(opts.horizontal ? src.width : 0, opts.vertical ? src.height : 0);
    ctx.scale(opts.horizontal ? -1 : 1, opts.vertical ? -1 : 1);
    ctx.drawImage(src, 0, 0);
  }

  const quality = mode === 'convert' ? Number(opts.quality || 90) : 92;
  const blob = await encodeCanvas(outCanvas, outFormat, quality);
  const name = replaceExtension(item.name, outFormat);
  return { blob, name, width: outCanvas.width, height: outCanvas.height };
}

export async function cropRegion(item, rect) {
  const decoded = await decodeImageFile(item.file);
  const outCanvas = createCanvas(rect.width, rect.height);
  outCanvas.getContext('2d').drawImage(
    decoded.canvas,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, rect.width, rect.height,
  );
  const origExt = getExt(item.name);
  const outFormat = ['png', 'jpg', 'jpeg', 'webp'].includes(origExt) ? origExt : 'png';
  const blob = await encodeCanvas(outCanvas, outFormat, 92);
  return { blob, name: replaceExtension(item.name, outFormat), width: outCanvas.width, height: outCanvas.height };
}

const PDF_SIZES = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  letter: [612, 792],
};

export async function mergeToPdf(items, opts, onProgress) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) throw new Error('PDF 引擎未加载');
  const doc = await PDFLib.PDFDocument.create();
  const margin = Number(opts.margin || 0);

  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    const decoded = await decodeImageFile(items[i].file);
    const pngBlob = await canvasToBlob(decoded.canvas, 'image/png');
    const embedded = await doc.embedPng(await pngBlob.arrayBuffer());

    let pageW = decoded.width;
    let pageH = decoded.height;
    if (opts.pageSize !== 'auto' && PDF_SIZES[opts.pageSize]) {
      const [baseW, baseH] = PDF_SIZES[opts.pageSize];
      const landscape = decoded.width > decoded.height;
      pageW = landscape ? baseH : baseW;
      pageH = landscape ? baseW : baseH;
    }
    const page = doc.addPage([pageW, pageH]);
    const availW = Math.max(10, pageW - margin * 2);
    const availH = Math.max(10, pageH - margin * 2);
    const scale = Math.min(availW / decoded.width, availH / decoded.height);
    const drawW = decoded.width * scale;
    const drawH = decoded.height * scale;
    page.drawImage(embedded, {
      x: (pageW - drawW) / 2,
      y: (pageH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }
  onProgress?.(items.length, items.length);
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: '合并图片.pdf', width: 0, height: 0 };
}

export async function mergeToImage(items, opts, onProgress) {
  const decodedList = [];
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    decodedList.push(await decodeImageFile(items[i].file));
  }
  const gap = Math.max(0, Number(opts.gap || 0));
  const vertical = opts.direction !== 'horizontal';
  let totalW = 0;
  let totalH = 0;

  if (vertical) {
    totalW = Math.max(...decodedList.map(d => d.width));
    totalH = decodedList.reduce((acc, d) => acc + d.height, 0) + gap * (decodedList.length - 1);
  } else {
    totalH = Math.max(...decodedList.map(d => d.height));
    totalW = decodedList.reduce((acc, d) => acc + d.width, 0) + gap * (decodedList.length - 1);
  }

  const canvas = createCanvas(totalW, totalH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.bg || '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  let cursor = 0;
  for (const d of decodedList) {
    let dw = d.width;
    let dh = d.height;
    let dx = 0;
    let dy = 0;
    if (vertical) {
      if (opts.align === 'stretch') {
        dh = Math.round((d.height * totalW) / d.width);
        dw = totalW;
      } else if (opts.align === 'center') dx = Math.floor((totalW - dw) / 2);
      else if (opts.align === 'end') dx = totalW - dw;
      dy = cursor;
      cursor += dh + gap;
    } else {
      if (opts.align === 'stretch') {
        dw = Math.round((d.width * totalH) / d.height);
        dh = totalH;
      } else if (opts.align === 'center') dy = Math.floor((totalH - dh) / 2);
      else if (opts.align === 'end') dy = totalH - dh;
      dx = cursor;
      cursor += dw + gap;
    }
    ctx.drawImage(d.canvas, dx, dy, dw, dh);
  }

  const fmt = opts.format || 'png';
  const blob = await encodeCanvas(canvas, fmt, 92);
  onProgress?.(items.length, items.length);
  return { blob, name: `合并图片.${fmt}`, width: totalW, height: totalH };
}

export async function mergeToGif(items, opts, onProgress) {
  const first = await decodeImageFile(items[0].file);
  const w = first.width;
  const h = first.height;
  const gif = GIFEncoder();
  const delay = Math.max(20, Number(opts.delay || 500));
  const repeat = Math.max(0, Number(opts.loop ?? 0));
  const frameCanvas = createCanvas(w, h);
  const ctx = frameCanvas.getContext('2d');

  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    const d = i === 0 ? first : await decodeImageFile(items[i].file);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const scale = opts.fit === 'cover'
      ? Math.max(w / d.width, h / d.height)
      : Math.min(w / d.width, h / d.height);
    const dw = Math.round(d.width * scale);
    const dh = Math.round(d.height * scale);
    ctx.drawImage(d.canvas, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2), dw, dh);

    const rgba = ctx.getImageData(0, 0, w, h).data;
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, w, h, { palette, delay, repeat: i === 0 ? repeat : undefined });
  }
  gif.finish();
  onProgress?.(items.length, items.length);
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), name: '合成动图.gif', width: w, height: h };
}
