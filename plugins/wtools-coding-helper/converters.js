"use strict";
(() => {
  const encoder = new TextEncoder();
  const decoder = () => new TextDecoder("utf-8", { fatal: true });
  function fail(message) { throw new Error(message); }
  function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  }
  function base64ToBytes(text) {
    const source = text.replace(/\s/g, "");
    if (!source) return new Uint8Array();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source) || source.length % 4 === 1 || (source.includes("=") && source.length % 4 !== 0)) fail("Base64 格式无效，请检查字符与末尾补位。");
    const padded = source + "=".repeat((4 - source.length % 4) % 4);
    let binary;
    try { binary = atob(padded); } catch { fail("Base64 格式无效。"); }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (bytesToBase64(bytes).replace(/=+$/, "") !== source.replace(/=+$/, "")) fail("Base64 尾部包含无效数据。");
    return bytes;
  }
  function base64(text, decode) {
    if (!decode) return bytesToBase64(encoder.encode(text));
    try { return decoder().decode(base64ToBytes(text)); }
    catch (error) { if (error instanceof TypeError) fail("解码内容不是有效 UTF-8 文本，图片请使用「图片 Base64」。"); throw error; }
  }
  function imageType(bytes) {
    const starts = values => values.every((value, index) => bytes[index] === value);
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return ["image/png", "png"];
    if (starts([255, 216, 255])) return ["image/jpeg", "jpg"];
    if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return ["image/gif", "gif"];
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return ["image/webp", "webp"];
    if (ascii(0, 2) === "BM") return ["image/bmp", "bmp"];
    if (starts([0, 0, 1, 0])) return ["image/x-icon", "ico"];
    fail("无法识别图片，请使用 PNG、JPEG、GIF、WebP、BMP 或 ICO。");
  }
  function imageBytes(text) {
    const source = text.trim();
    const match = /^data:image\/[a-z0-9.+-]+;base64,([\s\S]*)$/i.exec(source);
    if (source.startsWith("data:") && !match) fail("请输入 base64 图片 Data URL，或纯 Base64 内容。");
    if (source.length > 24 * 1024 * 1024) fail("图片 Base64 内容过大，图片最大 16 MiB。");
    const bytes = base64ToBytes(match ? match[1] : source);
    if (bytes.length > 16 * 1024 * 1024) fail("图片最大 16 MiB。");
    const [mime, extension] = imageType(bytes);
    return { bytes, mime, extension };
  }
  function html(text, decode) {
    if (!decode) return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    // Only a single entity is placed in this detached element, never user markup.
    const element = document.createElement("textarea");
    return text.replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, entity => {
      element.innerHTML = entity;
      return element.value;
    });
  }
  function scalar(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) fail("包含无效 Unicode 码位。");
    return String.fromCodePoint(value);
  }
  function unicode(text, format, decode) {
    if (!decode) {
      if (format === "codepoint") return Array.from(text, char => "U+" + char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
      if (format === "escape") return Array.from(text, char => "\\u{" + char.codePointAt(0).toString(16).toUpperCase() + "}").join("");
      if (format === "utf16") return text.split("").map(char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")).join("");
      if (format === "utf8") return Array.from(encoder.encode(text), byte => "\\x" + byte.toString(16).padStart(2, "0")).join("");
      return Array.from(text, char => "&#" + char.codePointAt(0) + ";").join("");
    }
    if (format === "codepoint") {
      if (!/^(?:\s*U\+[0-9a-f]{1,6}\s*)+$/i.test(text)) fail("请输入 U+4F60 U+597D 形式的码位。");
      return [...text.matchAll(/U\+([0-9a-f]{1,6})/gi)].map(match => scalar(parseInt(match[1], 16))).join("");
    }
    if (format === "escape") {
      if (!/^(?:\s*\\u\{[0-9a-f]{1,6}\}\s*)+$/i.test(text)) fail("请输入 \\u{4F60} 形式的码位。");
      return [...text.matchAll(/\\u\{([0-9a-f]{1,6})\}/gi)].map(match => scalar(parseInt(match[1], 16))).join("");
    }
    if (format === "utf16") {
      if (/\\u(?![0-9a-f]{4})/i.test(text)) fail("UTF-16 转义需包含四位十六进制数字。");
      return text.replace(/\\u([0-9a-f]{4})/gi, (_, value) => String.fromCharCode(parseInt(value, 16)));
    }
    if (format === "utf8") {
      if (/\\x(?![0-9a-f]{2})/i.test(text)) fail("UTF-8 转义需包含两位十六进制数字。");
      try { return text.replace(/(?:\\x[0-9a-f]{2})+/gi, part => decoder().decode(Uint8Array.from([...part.matchAll(/\\x([0-9a-f]{2})/gi)], match => parseInt(match[1], 16)))); }
      catch { fail("这些字节不是有效的 UTF-8 编码。"); }
    }
    return html(text, true);
  }
  function radix(text, from, to) {
    if (![from, to].every(base => Number.isInteger(base) && base >= 2 && base <= 36)) fail("进制必须在 2 到 36 之间。");
    let source = text.trim(), sign = 1n;
    if (source.length > 10000) fail("整数最多 10000 个字符。");
    if (source.startsWith("-") || source.startsWith("+")) { if (source[0] === "-") sign = -1n; source = source.slice(1); }
    const prefixes = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };
    if (prefixes[from]) source = source.replace(prefixes[from], "");
    if (!source) fail("请输入一个整数。");
    let value = 0n;
    for (const char of source.toLowerCase()) {
      const digit = "0123456789abcdefghijklmnopqrstuvwxyz".indexOf(char);
      if (digit < 0 || digit >= from) fail(`「${char}」不是 ${from} 进制数字，仅支持整数。`);
      value = value * BigInt(from) + BigInt(digit);
    }
    return (value * sign).toString(to);
  }
  function parseDate(text, unit = "auto", zone = "local") {
    const source = text.trim();
    if (/^[+-]?\d+$/.test(source)) {
      const number = Number(source);
      const value = number * (unit === "seconds" || (unit === "auto" && Math.abs(number) < 1e11) ? 1000 : 1);
      const date = new Date(value);
      if (!Number.isSafeInteger(value) || !Number.isFinite(date.getTime())) fail("时间戳超出有效范围。");
      return date;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(source);
    if (!match || (match[8] && !match[4])) fail("请输入时间戳、YYYY-MM-DD HH:mm:ss 或 ISO 8601 时间。");
    const [, y, mo, d, h = "0", mi = "0", s = "0", fraction = "0", offset] = match;
    const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(fraction.padEnd(3, "0"))];
    const check = new Date(0);
    check.setUTCFullYear(parts[0], parts[1], parts[2]); check.setUTCHours(parts[3], parts[4], parts[5], parts[6]);
    if ([check.getUTCFullYear(), check.getUTCMonth(), check.getUTCDate(), check.getUTCHours(), check.getUTCMinutes(), check.getUTCSeconds()].some((value, i) => value !== parts[i])) fail("日期或时间无效，请检查月份、日期与时分秒。");
    if (offset) {
      if (offset.toUpperCase() === "Z") return check;
      const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4, 6));
      if (hours > 23 || minutes > 59) fail("时区偏移无效。");
      return new Date(check.getTime() - (hours * 60 + minutes) * 60000 * (offset[0] === "+" ? 1 : -1));
    }
    if (zone === "utc") return check;
    const local = new Date(0);
    local.setFullYear(parts[0], parts[1], parts[2]); local.setHours(parts[3], parts[4], parts[5], parts[6]);
    if ([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds()].some((value, i) => value !== parts[i])) fail("此本地时间不存在（可能位于夏令时跳变区间）。");
    return local;
  }
  function dateRows(date) {
    const pad = (value, length = 2) => String(value).padStart(length, "0");
    const offset = -date.getTimezoneOffset();
    const zone = `${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    const local = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    return [["Unix 秒", String(Math.floor(date.getTime() / 1000))], ["Unix 毫秒", String(date.getTime())], ["本地时间 · UTC" + zone, local], ["ISO 8601 · UTC", date.toISOString()], ["标准时间 · GMT", date.toUTCString()]];
  }
  function detect(text) {
    const value = text.trim();
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return { tool: "image", action: "decode" };
    if (/^[+-]?0x[0-9a-f]+$/i.test(value)) return { tool: "radix", from: 16 };
    if (/^(?:[+-]?(?:\d{10}|\d{13})|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)$/i.test(value)) return { tool: "date" };
    if (/\\u\{[0-9a-f]{1,6}\}/i.test(value)) return { tool: "unicode", format: "escape", action: "decode" };
    if (/\\u[0-9a-f]{4}/i.test(value)) return { tool: "unicode", format: "utf16", action: "decode" };
    if (/\\x[0-9a-f]{2}/i.test(value)) return { tool: "unicode", format: "utf8", action: "decode" };
    if (/^(?:\s*U\+[0-9a-f]{1,6}\s*)+$/i.test(value)) return { tool: "unicode", format: "codepoint", action: "decode" };
    if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value)) return { tool: "html", action: "decode" };
    if (/%[0-9a-f]{2}/i.test(value)) return { tool: "url", action: "decode" };
    if (value.length >= 4 && /^[A-Za-z0-9+/\s]+={0,2}$/.test(value)) {
      try { const result = base64(value, true); if (result && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(result)) return { tool: "base64", action: "decode" }; } catch { /* Not a UTF-8 Base64 string. */ }
    }
    return null;
  }
  window.CodingHelper = { bytesToBase64, base64ToBytes, base64, imageType, imageBytes, html, unicode, radix, parseDate, dateRows, detect };
})();
