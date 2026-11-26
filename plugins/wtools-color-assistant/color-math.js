(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ColorMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function round(v, digits) {
    const p = Math.pow(10, digits || 0);
    return Math.round((v + Number.EPSILON) * p) / p;
  }

  function normalizeHex(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
      s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    } else if (/^[0-9a-fA-F]{8}$/.test(s)) {
      s = s.slice(0, 6);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return '#' + s.toLowerCase();
  }

  function hexToRgb(hex) {
    const norm = normalizeHex(hex);
    if (!norm) return null;
    const n = parseInt(norm.slice(1), 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function rgbToHsv(r, g, b) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    return { h: round(h, 1), s: round(s, 1), v: round(v, 1) };
  }

  function hsvToRgb(h, s, v) {
    const hn = ((h % 360) + 360) % 360;
    const sn = clamp(s, 0, 100) / 100;
    const vn = clamp(v, 0, 100) / 100;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;
    let rp = 0, gp = 0, bp = 0;
    if (hn < 60) { rp = c; gp = x; }
    else if (hn < 120) { rp = x; gp = c; }
    else if (hn < 180) { gp = c; bp = x; }
    else if (hn < 240) { gp = x; bp = c; }
    else if (hn < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255)
    };
  }

  function rgbToHsl(r, g, b) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 2) };
  }

  function hslToRgb(h, s, l) {
    const hn = ((h % 360) + 360) % 360;
    const sn = clamp(s, 0, 100) / 100;
    const ln = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = ln - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (hn < 60) { rp = c; gp = x; }
    else if (hn < 120) { rp = x; gp = c; }
    else if (hn < 180) { gp = c; bp = x; }
    else if (hn < 240) { gp = x; bp = c; }
    else if (hn < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255)
    };
  }

  function rgbToCmyk(r, g, b) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 1 - 1e-6) return { c: 0, m: 0, y: 0, k: 100 };
    const c = (1 - rn - k) / (1 - k);
    const m = (1 - gn - k) / (1 - k);
    const y = (1 - bn - k) / (1 - k);
    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100)
    };
  }

  function cmykToRgb(c, m, y, k) {
    const cn = clamp(c, 0, 100) / 100;
    const mn = clamp(m, 0, 100) / 100;
    const yn = clamp(y, 0, 100) / 100;
    const kn = clamp(k, 0, 100) / 100;
    return {
      r: Math.round(255 * (1 - cn) * (1 - kn)),
      g: Math.round(255 * (1 - mn) * (1 - kn)),
      b: Math.round(255 * (1 - yn) * (1 - kn))
    };
  }

  function rgbToHsi(r, g, b) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const sum = rn + gn + bn;
    const i = sum / 3;
    let s = 0;
    let h = 0;
    if (sum > 0) {
      const min = Math.min(rn, gn, bn);
      s = 1 - (3 / sum) * min;
      const num = 0.5 * ((rn - gn) + (rn - bn));
      const den = Math.sqrt((rn - gn) * (rn - gn) + (rn - bn) * (gn - bn));
      if (den > 1e-9) {
        let theta = Math.acos(clamp(num / den, -1, 1)) * (180 / Math.PI);
        if (bn > gn) theta = 360 - theta;
        h = theta;
      }
    }
    return { h: round(h, 1), s: round(s * 100, 1), i: round(i * 100, 2) };
  }

  function hsiToRgb(h, s, i) {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const intensity = clamp(i, 0, 100) * 2.55;
    const sector = Math.floor(hue / 120);
    const angle = hue % 120 * Math.PI / 180;
    const low = intensity * (1 - saturation);
    const primary = intensity * (1 + saturation * Math.cos(angle) / Math.cos(Math.PI / 3 - angle));
    const secondary = 3 * intensity - primary - low;
    const channels = [primary, secondary, low];
    return {
      r: channels[(3 - sector) % 3],
      g: channels[(4 - sector) % 3],
      b: channels[(5 - sector) % 3]
    };
  }

  function rgbToLab(r, g, b) {
    const linearize = (v) => {
      const s = clamp(v, 0, 255) / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const rl = linearize(r);
    const gl = linearize(g);
    const bl = linearize(b);

    // sRGB to XYZ (D65)
    const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
    const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.00000;
    const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;

    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);

    return {
      l: round(116 * fy - 16, 3),
      a: round(500 * (fx - fy), 3),
      b: round(200 * (fy - fz), 3)
    };
  }

  function labToRgb(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const inv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
    const x = 0.95047 * inv(fx);
    const y = 1.00000 * inv(fy);
    const z = 1.08883 * inv(fz);

    const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    const gl = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

    const gamma = (u) => {
      const c = clamp(u, 0, 1);
      return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    };
    return {
      r: Math.round(gamma(rl) * 255),
      g: Math.round(gamma(gl) * 255),
      b: Math.round(gamma(bl) * 255)
    };
  }

  function relativeLuminance(r, g, b) {
    const lin = (v) => {
      const s = clamp(v, 0, 255) / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(hex1, hex2) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    if (!c1 || !c2) return 1;
    const l1 = relativeLuminance(c1.r, c1.g, c1.b);
    const l2 = relativeLuminance(c2.r, c2.g, c2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return round((lighter + 0.05) / (darker + 0.05), 2);
  }

  function deltaE76(hex1, hex2) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    if (!c1 || !c2) return 0;
    const l1 = rgbToLab(c1.r, c1.g, c1.b);
    const l2 = rgbToLab(c2.r, c2.g, c2.b);
    return round(
      Math.sqrt(
        Math.pow(l1.l - l2.l, 2) +
        Math.pow(l1.a - l2.a, 2) +
        Math.pow(l1.b - l2.b, 2)
      ),
      2
    );
  }

  function isLightColor(hex) {
    const c = hexToRgb(hex);
    if (!c) return true;
    return relativeLuminance(c.r, c.g, c.b) > 0.36;
  }

  function getHarmonies(h, s, v) {
    const shift = (deg) => {
      const rgb = hsvToRgb((h + deg + 360) % 360, s, v);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    };
    return {
      complementary: [shift(180)],
      contrasting: [shift(135), shift(225)],
      analogous: [shift(-25), shift(25)],
      intermediate: [shift(90), shift(180), shift(270)]
    };
  }

  function formatAll(hex, stripHash) {
    const norm = normalizeHex(hex) || '#003cf2';
    const rgb = hexToRgb(norm);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
    const hsi = rgbToHsi(rgb.r, rgb.g, rgb.b);
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    return {
      hex: stripHash ? norm.slice(1) : norm,
      rawHex: norm,
      rgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      hsv: `${hsv.h}, ${hsv.s}%, ${hsv.v}%`,
      hsl: `${hsl.h}, ${hsl.s}%, ${hsl.l}%`,
      cmyk: `${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%`,
      hsi: `${hsi.h}, ${hsi.s}%, ${hsi.i}%`,
      lab: `${lab.l}, ${lab.a}, ${lab.b}`,
      values: { rgb, hsv, hsl, cmyk, hsi, lab }
    };
  }

  function parseByFormat(format, text) {
    if (typeof text !== 'string') return null;
    let t = text.trim();
    if (!t) return null;
    if (format === 'hex') return normalizeHex(t);
    const wrapped = /^([a-z-]+)\(\s*([^()]*)\s*\)$/i.exec(t);
    if (wrapped) {
      const name = wrapped[1].toLowerCase();
      if (name !== format && !(format === 'hsv' && name === 'hsb')) return null;
      t = wrapped[2].trim();
    }
    const components = t.includes(',') ? t.split(/\s*,\s*/) : t.split(/\s+/);
    if (components.length !== (format === 'cmyk' ? 4 : 3)) return null;
    if (components.some(value => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:%|°|deg)?$/i.test(value))) return null;
    const hueFormat = ['hsv', 'hsl', 'hsi'].includes(format);
    if (components.some((value, index) => /(°|deg)$/i.test(value) && !(hueFormat && index === 0))) return null;
    if (hueFormat && components[0].endsWith('%')) return null;
    if (format === 'lab' && components.slice(1).some(value => value.endsWith('%'))) return null;
    const values = components.map(value => parseFloat(value));
    if (!values.every(Number.isFinite)) return null;
    if (format === 'rgb') {
      return rgbToHex(...values.map((value, index) => components[index].endsWith('%') ? value * 255 / 100 : value));
    }
    const convert = { hsv: hsvToRgb, hsl: hslToRgb, cmyk: cmykToRgb, hsi: hsiToRgb, lab: labToRgb }[format];
    if (!convert) return null;
    const { r, g, b } = convert(...values);
    if (![r, g, b].every(Number.isFinite)) return null;
    return rgbToHex(r, g, b);
  }

  function extractDominantColors(pixels, k) {
    const count = Math.max(2, Math.min(12, k || 6));
    if (!pixels || pixels.length === 0) return [];

    // Sample up to 3500 opaque pixels
    const samples = [];
    const totalPixels = Math.floor(pixels.length / 4);
    const step = Math.max(1, Math.ceil(totalPixels / 3500));
    for (let i = 0; i < totalPixels; i += step) {
      const idx = i * 4;
      if (pixels[idx + 3] < 128) continue;
      samples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
    if (samples.length === 0) return [];

    // K-means++ deterministic-friendly initialization
    const centroids = [samples[0].slice()];
    while (centroids.length < count && centroids.length < samples.length) {
      let bestIdx = 0;
      let bestDist = -1;
      for (let i = 0; i < samples.length; i++) {
        const p = samples[i];
        let minD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = (p[0] - centroids[c][0]) ** 2 + (p[1] - centroids[c][1]) ** 2 + (p[2] - centroids[c][2]) ** 2;
          if (d < minD) minD = d;
        }
        if (minD > bestDist) {
          bestDist = minD;
          bestIdx = i;
        }
      }
      if (bestDist === 0) break;
      centroids.push(samples[bestIdx].slice());
    }

    const clusters = new Array(centroids.length).fill(0);
    for (let iter = 0; iter < 12; iter++) {
      const sums = centroids.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < samples.length; i++) {
        const p = samples[i];
        let bestC = 0;
        let minD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = (p[0] - centroids[c][0]) ** 2 + (p[1] - centroids[c][1]) ** 2 + (p[2] - centroids[c][2]) ** 2;
          if (d < minD) {
            minD = d;
            bestC = c;
          }
        }
        sums[bestC][0] += p[0];
        sums[bestC][1] += p[1];
        sums[bestC][2] += p[2];
        sums[bestC][3] += 1;
        clusters[bestC] = sums[bestC][3];
      }
      for (let c = 0; c < centroids.length; c++) {
        if (sums[c][3] > 0) {
          centroids[c][0] = sums[c][0] / sums[c][3];
          centroids[c][1] = sums[c][1] / sums[c][3];
          centroids[c][2] = sums[c][2] / sums[c][3];
        }
      }
    }

    const results = centroids
      .map((c, idx) => ({
        hex: rgbToHex(c[0], c[1], c[2]),
        count: clusters[idx]
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    // Deduplicate very close colors
    const unique = [];
    for (const item of results) {
      const close = unique.find((color) => deltaE76(color.hex, item.hex) < 4);
      if (close) close.count += item.count;
      else unique.push(item);
    }
    return unique.sort((a, b) => b.count - a.count)
      .map(({ hex, count }) => ({ hex, ratio: round(count / samples.length * 100, 1) }));
  }

  return {
    normalizeHex,
    hexToRgb,
    rgbToHex,
    rgbToHsv,
    hsvToRgb,
    rgbToHsl,
    hslToRgb,
    rgbToCmyk,
    cmykToRgb,
    rgbToHsi,
    hsiToRgb,
    rgbToLab,
    labToRgb,
    relativeLuminance,
    contrastRatio,
    deltaE76,
    isLightColor,
    getHarmonies,
    formatAll,
    parseByFormat,
    extractDominantColors
  };
});
