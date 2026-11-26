/** Pure JS image math, naming, SVG optimization, and binary BMP/ICO encoders. */

export function getExt(filename = '') {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

export function replaceExtension(filename, newExt) {
  const cleanExt = newExt.replace(/^\./, '').toLowerCase();
  const idx = filename.lastIndexOf('.');
  const base = idx > 0 ? filename.slice(0, idx) : filename;
  return `${base}.${cleanExt}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export function hexToRgba(hex = '#ffffff', opacityPct = 100) {
  const clean = String(hex).replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, Number(opacityPct) / 100));
  return { r, g, b, a, css: `rgba(${r}, ${g}, ${b}, ${a})` };
}

export function computeResizeDimensions(srcW, srcH, opts) {
  const w = Math.max(1, Math.round(srcW));
  const h = Math.max(1, Math.round(srcH));
  if (opts.mode === 'percent') {
    const scale = Math.max(0.01, Number(opts.percent || 100) / 100);
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    };
  }
  const reqW = Number(opts.width) > 0 ? Math.round(Number(opts.width)) : 0;
  const reqH = Number(opts.height) > 0 ? Math.round(Number(opts.height)) : 0;
  if (reqW && reqH) {
    if (!opts.keepAspect) return { width: reqW, height: reqH };
    const ratio = Math.min(reqW / w, reqH / h);
    return {
      width: Math.max(1, Math.round(w * ratio)),
      height: Math.max(1, Math.round(h * ratio)),
    };
  }
  if (reqW) {
    return {
      width: reqW,
      height: opts.keepAspect ? Math.max(1, Math.round((h * reqW) / w)) : h,
    };
  }
  if (reqH) {
    return {
      width: opts.keepAspect ? Math.max(1, Math.round((w * reqH) / h)) : w,
      height: reqH,
    };
  }
  return { width: w, height: h };
}

export function computeCropRect(srcW, srcH, ratioW, ratioH, anchor = 'center') {
  const targetRatio = Math.max(0.01, ratioW / ratioH);
  const srcRatio = srcW / srcH;
  let cropW = srcW;
  let cropH = srcH;
  if (srcRatio > targetRatio) {
    cropW = Math.max(1, Math.round(srcH * targetRatio));
  } else if (srcRatio < targetRatio) {
    cropH = Math.max(1, Math.round(srcW / targetRatio));
  }
  let x = Math.floor((srcW - cropW) / 2);
  let y = Math.floor((srcH - cropH) / 2);
  if (anchor === 'top') {
    x = 0;
    y = 0;
  } else if (anchor === 'bottom') {
    x = srcW - cropW;
    y = srcH - cropH;
  }
  return { x: Math.max(0, x), y: Math.max(0, y), width: cropW, height: cropH };
}

export function computePadLayout(srcW, srcH, opts) {
  if (opts.mode === 'uniform') {
    const p = Math.max(0, Math.round(Number(opts.all) || 0));
    return { width: srcW + p * 2, height: srcH + p * 2, offsetX: p, offsetY: p };
  }
  if (opts.mode === 'sides') {
    const top = Math.max(0, Math.round(Number(opts.top) || 0));
    const bottom = Math.max(0, Math.round(Number(opts.bottom) || 0));
    const left = Math.max(0, Math.round(Number(opts.left) || 0));
    const right = Math.max(0, Math.round(Number(opts.right) || 0));
    return { width: srcW + left + right, height: srcH + top + bottom, offsetX: left, offsetY: top };
  }
  const [rw, rh] = String(opts.ratio || '1:1').split(':').map(Number);
  const targetRatio = (rw || 1) / (rh || 1);
  const srcRatio = srcW / srcH;
  let width = srcW;
  let height = srcH;
  if (srcRatio > targetRatio) {
    height = Math.max(srcH, Math.round(srcW / targetRatio));
  } else if (srcRatio < targetRatio) {
    width = Math.max(srcW, Math.round(srcH * targetRatio));
  }
  return {
    width,
    height,
    offsetX: Math.floor((width - srcW) / 2),
    offsetY: Math.floor((height - srcH) / 2),
  };
}

/** Encode RGBA Uint8ClampedArray into a 32-bit BGRA BMP file. */
export function encodeBmp(rgba, width, height) {
  const rowSize = width * 4;
  const pixelBytes = rowSize * height;
  const fileSize = 54 + pixelBytes;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive = bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelBytes, true);

  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      out[d] = rgba[s + 2];     // B
      out[d + 1] = rgba[s + 1]; // G
      out[d + 2] = rgba[s];     // R
      out[d + 3] = rgba[s + 3]; // A
    }
  }
  return out;
}

/** Wrap a PNG byte array inside a standard single-entry ICO container. */
export function encodeIco(pngBytes, width, height) {
  const headerSize = 6 + 16;
  const out = new Uint8Array(headerSize + pngBytes.length);
  const view = new DataView(out.buffer);

  // ICONDIR
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // type 1 = ICO
  view.setUint16(4, 1, true); // count = 1

  // ICONDIRENTRY
  view.setUint8(6, width >= 256 ? 0 : width);
  view.setUint8(7, height >= 256 ? 0 : height);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize, true);

  out.set(pngBytes, headerSize);
  return out;
}

/** Lightweight offline SVG minifier/optimizer. */
export function optimizeSvg(svgText, quality = 80) {
  const decimals = quality >= 90 ? 3 : quality >= 60 ? 2 : 1;
  let text = String(svgText)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/\s+(?:inkscape|sodipodi|sketch):[a-zA-Z0-9_-]+="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (quality < 95) {
    text = text.replace(/(\d+\.\d{3,})/g, num => {
      const rounded = Number(num).toFixed(decimals);
      return rounded.replace(/\.?0+$/, '');
    });
  }
  return text;
}
