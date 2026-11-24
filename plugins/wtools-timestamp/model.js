"use strict";

window.Timestamp = (() => {
  const formatters = new Map();
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  const cities = {
    "Pacific/Honolulu": "檀香山", "America/Los_Angeles": "洛杉矶", "America/Denver": "丹佛",
    "America/Chicago": "芝加哥", "America/New_York": "纽约", "America/Sao_Paulo": "圣保罗",
    UTC: "协调世界时", "Europe/London": "伦敦", "Europe/Paris": "巴黎", "Europe/Berlin": "柏林",
    "Africa/Cairo": "开罗", "Europe/Moscow": "莫斯科", "Asia/Dubai": "迪拜",
    "Asia/Kolkata": "加尔各答", "Asia/Calcutta": "加尔各答", "Asia/Kathmandu": "加德满都",
    "Asia/Katmandu": "加德满都", "Asia/Bangkok": "曼谷", "Asia/Shanghai": "北京",
    "Asia/Hong_Kong": "香港", "Asia/Taipei": "台北", "Asia/Singapore": "新加坡",
    "Asia/Tokyo": "东京", "Asia/Seoul": "首尔", "Australia/Sydney": "悉尼",
    "Pacific/Auckland": "奥克兰"
  };
  const defaultZones = [
    "Pacific/Honolulu", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "America/Sao_Paulo", "UTC", "Europe/London", "Europe/Paris", "Africa/Cairo", "Europe/Moscow",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Shanghai", "Asia/Hong_Kong",
    "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"
  ];

  function partsAt(value, zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new Intl.DateTimeFormat("en-GB-u-ca-iso8601-nu-latn", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", era: "short",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }));
    }
    const values = Object.fromEntries(formatters.get(zone).formatToParts(new Date(value)).map(p => [p.type, p.value]));
    if (values.era === "BC" || Number(values.year) > 9999) throw new Error("日期须在公元 0001 至 9999 年之间。");
    return {
      year: Number(values.year), month: Number(values.month), day: Number(values.day),
      hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
      millisecond: ((value % 1000) + 1000) % 1000
    };
  }

  function asUTC(parts) {
    const date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
    return date.getTime();
  }

  function parseDate(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text.trim());
    if (!match) throw new Error("请输入 YYYY-MM-DD HH:mm:ss 格式的日期，可附加 .SSS 毫秒。");
    const [, year, month, day, hour, minute, second = "0", fraction = ""] = match;
    const parts = { year: +year, month: +month, day: +day, hour: +hour, minute: +minute, second: +second, millisecond: +(fraction.padEnd(3, "0")) };
    const date = new Date(asUTC(parts));
    if (parts.year < 1 || date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month ||
        date.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59 || parts.second > 59) {
      throw new Error("日期无效，请检查年月日和时间。");
    }
    return parts;
  }

  function offsetAt(value, zone) {
    const parts = partsAt(value, zone);
    return asUTC(parts) - value;
  }

  function fromDate(text, zone) {
    const parts = parseDate(text);
    const wall = asUTC(parts);
    const offsets = new Set();
    for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
      const sample = wall + hours * 3600000;
      // At the supported year boundaries, sample only representable wall dates.
      try { offsets.add(offsetAt(sample, zone)); } catch { /* The actual candidate is checked below. */ }
    }
    const candidates = [...offsets].map(offset => wall - offset).filter(value => {
      try {
        const actual = partsAt(value, zone);
        return Object.keys(parts).every(key => parts[key] === actual[key]);
      } catch { return false; }
    });
    if (!candidates.length) throw new Error("该时区不存在这个时间（可能处于夏令时跳时），请调整日期或时区。");
    if (candidates.length > 1) throw new Error("夏令时回拨使这个时间对应两个时间戳，请改用 UTC 日期或直接输入时间戳。");
    return candidates[0];
  }

  function fromTimestamp(text, unit) {
    const value = text.trim();
    const pattern = unit === "s" ? /^-?\d+(?:\.\d{1,3})?$/ : /^-?\d+$/;
    if (!pattern.test(value)) throw new Error(unit === "s" ? "请输入秒时间戳，最多保留三位小数。" : "请输入整数毫秒时间戳。");
    let result;
    if (unit === "s") {
      const negative = value.startsWith("-");
      const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
      result = (BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"))) * (negative ? -1n : 1n);
    } else result = BigInt(value);
    if (result < -62135647200000n || result > 253402351199999n) throw new Error("时间戳超出支持范围（公元 0001 至 9999 年）。");
    return Number(result);
  }

  function toTimestamp(value, unit) {
    if (unit !== "s") return String(value);
    const absolute = Math.abs(value);
    const whole = Math.floor(absolute / 1000);
    const fraction = absolute % 1000;
    return `${value < 0 ? "-" : ""}${whole}${fraction ? "." + pad(fraction, 3).replace(/0+$/, "") : ""}`;
  }

  function toDate(value, zone, milliseconds = false) {
    const p = partsAt(value, zone);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${milliseconds ? "." + pad(p.millisecond, 3) : ""}`;
  }

  function offsetLabel(value, zone) {
    const minutes = Math.round(offsetAt(value, zone) / 60000);
    return `UTC${minutes < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  }

  function availableZones() {
    const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...new Set([...defaultZones, ...supported])].filter(zone => {
      try { partsAt(Date.now(), zone); return true; } catch { return false; }
    });
  }

  const zoneName = zone => cities[zone] ?? zone.split("/").slice(1).join(" / ").replace(/_/g, " ");
  return { defaultZones, parseDate, fromDate, fromTimestamp, toTimestamp, toDate, offsetLabel, availableZones, zoneName };
})();
