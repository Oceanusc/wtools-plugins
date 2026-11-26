"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const C = window.CodingHelper;
  const api = window.wtools;
  const tools = {
    base64: { title: "Base64", glyph: "64", category: "TEXT / ENCODING", description: "字符串与 Base64 互相转换，支持中文与 Emoji。", example: "你好，WTools 👋", fields: ["direction"], hint: "使用 UTF-8 字符编码；支持省略末尾补位的 Base64" },
    image: { title: "图片 Base64", glyph: "img", category: "IMAGE / BASE64", description: "图片转 Base64，或将 Base64 还原为可保存的图片。", fields: ["direction", "image-prefix"], hint: "支持 PNG、JPEG、GIF、WebP、BMP、ICO，最大 16 MiB" },
    date: { title: "时间转换", glyph: "ts", category: "DATE / TIMESTAMP", description: "时间戳、标准时间与 ISO 8601 格式互相转换。", example: "2026-11-24 12:00:00", fields: ["date-unit", "date-zone"], hint: "无时区的日期默认使用本地时区；自动单位按数值大小判断" },
    uuid: { title: "UUID / GUID", glyph: "id", category: "IDENTITY / UUID V4", description: "使用安全随机数，批量生成 UUID v4 唯一标识。", fields: ["uuid-count", "uuid-case", "uuid-style"], hint: "" },
    hash: { title: "Hash 摘要", glyph: "#", category: "DIGEST / CHECKSUM", description: "计算文本或文件的六种哈希摘要，内容始终留在本地。", example: "hello", fields: ["hash-source", "hash-algorithm"], hint: "Hash 为单向摘要，无法解密；文本按 UTF-8 原样计算，不去除空白" },
    url: { title: "URL 编解码", glyph: "%", category: "URL / PERCENT ENCODING", description: "处理 URL 参数或完整 URL，保留你需要的分隔符。", example: "你好 WTools /?a=1&b=2", fields: ["direction", "url-mode"], hint: "参数模式编码保留字符；完整 URL 模式保留 : / ? & 等分隔符；+ 按原字符保留" },
    radix: { title: "进制转换", glyph: "0x", category: "NUMBER / BASE CONVERSION", description: "2–36 进制整数转换，大整数也能保留完整精度。", example: "0x1FFFFFFFFFFFFF", fields: ["from-base", "to-base"], hint: "支持正负整数与匹配原进制的 0x / 0o / 0b 前缀，不支持小数" },
    unicode: { title: "Unicode", glyph: "U+", category: "UNICODE / TEXT ESCAPES", description: "Unicode 码位、UTF-16、UTF-8 与 HTML 数字实体转换。", example: "你好 👋", fields: ["direction", "unicode-format"], hint: "UTF-16 使用代理对表示 Emoji，UTF-8 以十六进制字节表示" },
    html: { title: "HTML 转义", glyph: "<>", category: "HTML / ENTITIES", description: "转义 HTML 特殊字符，或解码数字与命名实体。", example: '<div title="你好">Tom & Jerry</div>', fields: ["direction"], hint: "编码处理 & < > 双引号与单引号；实体解码单次执行，不渲染 HTML" }
  };
  const commands = {
    base64: ["Base64", "Base64 编码", "Base64 解码", "编码小助手"],
    image: ["图片 Base64", "图片 Base64 编码", "图片 Base64 解码"],
    date: ["时间转换", "时间戳", "date", "unixtime", "timestamp", "标准时间"],
    uuid: ["UUID", "GUID", "唯一ID"], hash: ["Hash", "哈希加密", "文件哈希", "MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512"],
    url: ["URL", "URL 编码", "URL 解码"], radix: ["进制转换", "十六进制"], unicode: ["Unicode", "UTF16", "UTF8", "Unicode 码位"], html: ["HTML 转义", "HTML 实体", "HTML 解码"]
  };
  let tool = "base64", selectedFile = null, revision = 0, activeHash = null, imageUrl = null;
  let resultText = "", refillText = "", inputTimer = null;
  const drafts = new Map();
  const autoTools = new Set(["base64", "url", "unicode", "html", "radix", "date"]);
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function notice(message, error = false) { $("status").textContent = message; $("status").classList.toggle("error", error); }
  function releaseImage() {
    $("preview").onload = $("preview").onerror = null;
    $("preview").removeAttribute("src");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  }
  function busy(value) { $("run").disabled = value; $("cancel").hidden = !value; }
  function invalidate() {
    revision++;
    if (activeHash) { activeHash.worker.terminate(); activeHash.reject(new Error("已取消计算。")); activeHash = null; }
    busy(false); releaseImage();
    resultText = refillText = "";
    $("output").value = ""; $("output").hidden = false;
    $("result-list").hidden = $("image-result").hidden = true;
    $("result-list").replaceChildren();
    $("copy").disabled = $("use-result").disabled = true;
  }
  function updateInputHint() {
  }
  function fileMode() { return (tool === "image" && $("direction").value === "encode") || (tool === "hash" && $("hash-source").value === "file"); }
  function showOptions(open) {
    $("options").toggleAttribute("data-open", open);
    $("toggle-options").setAttribute("aria-expanded", String(open));
  }
  $("toggle-options").onclick = () => showOptions(!$("options").hasAttribute("data-open"));
  document.addEventListener("pointerdown", event => {
    if (!$("options").contains(event.target) && !$("toggle-options").contains(event.target)) showOptions(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && $("options").hasAttribute("data-open")) {
      showOptions(false); $("toggle-options").focus(); event.preventDefault();
    }
  });
  matchMedia("(max-height: 360px)").addEventListener("change", () => showOptions(false));
  function renderControls() {
    const config = tools[tool];
    document.body.classList.toggle("uuid-mode", tool === "uuid");
    $("tool-title").textContent = config.title;
    $("tool-description").textContent = config.description;
    for (const field of document.querySelectorAll(".options > label")) field.hidden = !config.fields.includes(field.id.replace(/-field$/, ""));
    $("image-prefix-field").hidden = tool !== "image" || $("direction").value !== "encode";
    $("now").hidden = tool !== "date";
    $("example").hidden = tool === "uuid" || fileMode();
    $("input").hidden = fileMode(); $("file-area").hidden = !fileMode();
    $("file").accept = tool === "image" ? "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon" : "";
    $("file-prompt").textContent = tool === "image" ? "选择本地图片" : "选择本地文件";
    $("file-info").textContent = selectedFile ? `${selectedFile.name} · ${formatSize(selectedFile.size)}` : "也可以将文件拖放到此处";
    $("remove-file").hidden = !selectedFile;
    $("recognize").hidden = fileMode();
    $("clear").hidden = fileMode();
    const divider = $("input-panel").querySelector(".bar-divider");
    if (divider) divider.hidden = fileMode();
    for (const button of document.querySelectorAll("#direction-segmented button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === $("direction").value));
    }
    $("run").textContent = { date: "转换时间", uuid: "生成 UUID", hash: "计算摘要", radix: "转换进制" }[tool] ?? ($("direction").value === "decode" ? "解码" : "编码");
    $("input").placeholder = tool === "date" ? "输入秒 / 毫秒时间戳，或 YYYY-MM-DD HH:mm:ss…" : tool === "image" ? "粘贴图片 Base64 或 data:image/…;base64,…" : "在此输入或粘贴内容…";
    for (const button of document.querySelectorAll("#tools button[data-tool]")) button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    updateInputHint();
  }
  function selectTool(id, options = {}) {
    if (!tools[id]) return;
    showOptions(false);
    clearTimeout(inputTimer);
    if (!options.keepInput && tool !== id) drafts.set(tool, $("input").value);
    invalidate(); selectedFile = null; $("file").value = "";
    tool = id;
    if (!options.keepInput) $("input").value = drafts.get(id) ?? "";
    if (options.action) $("direction").value = options.action;
    if (options.format) $("unicode-format").value = options.format;
    if (options.from) $("from-base").value = options.from;
    renderControls();
    if ($("input").value.trim() && autoTools.has(tool)) run();
    else notice("所有转换均在本地完成");
  }
  function formatSize(size) { return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / 1024 / 1024).toFixed(2)} MiB`; }
  async function copy(text) {
    try {
      if (api?.copyText) { if (!await api.copyText(text)) throw new Error(); }
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = node("textarea"); area.value = text; document.body.append(area); area.select();
        const success = document.execCommand("copy"); area.remove(); if (!success) throw new Error();
      }
      notice("已复制到剪贴板");
    } catch { notice("复制失败，请选择结果文本后按 Ctrl+C。", true); }
  }
  function showResult(result, token) {
    if (token !== revision) return;
    const { rows, text = "", image } = result;
    resultText = rows ? rows.map(([label, value]) => `${label}: ${value}`).join("\n") : text;
    refillText = result.refill ?? (rows ? rows[0][1] : text);
    $("output").value = resultText;
    $("output").hidden = Boolean(rows || image);
    $("result-list").hidden = !rows;
    $("image-result").hidden = !image;
    if (rows) {
      $("result-list").replaceChildren(...rows.map(([label, value]) => {
        const row = node("div", "result-row"), header = node("div"), button = node("button", "", "复制");
        button.setAttribute("aria-label", `复制 ${label}`); button.onclick = () => copy(value);
        header.append(node("span", "", label), button); row.append(header, node("code", "", value)); return row;
      }));
    }
    if (image) {
      imageUrl = URL.createObjectURL(new Blob([image.bytes], { type: image.mime }));
      $("preview").onload = () => { if (token === revision) $("image-info").textContent = `${$("preview").naturalWidth} × ${$("preview").naturalHeight} · ${image.mime} · ${formatSize(image.bytes.length)}`; };
      $("preview").onerror = () => { if (token === revision) { invalidate(); notice("图片内容已损坏，无法预览或保存。", true); } };
      $("preview").src = imageUrl;
      $("save-image").onclick = () => download(imageUrl, `decoded.${image.extension}`);
    }
    $("copy").disabled = Boolean(image);
    $("use-result").disabled = Boolean(image) || tool === "uuid" || fileMode();
    notice("处理完成");
  }
  function download(url, filename) {
    const anchor = node("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    notice("已请求保存图片");
  }
  function hash(text, file, token) {
    return new Promise((resolve, reject) => {
      const worker = new Worker("./hash-worker.js");
      activeHash = { worker, reject };
      const finish = () => { worker.terminate(); if (activeHash?.worker === worker) activeHash = null; };
      worker.onmessage = ({ data }) => {
        if (token !== revision) { finish(); reject(new Error("已取消计算。")); return; }
        if (data.progress !== undefined) { notice(`正在计算文件摘要… ${data.progress}%`); return; }
        finish(); data.error ? reject(new Error(data.error)) : resolve({ rows: data.rows });
      };
      worker.onerror = event => { event.preventDefault(); finish(); reject(new Error("无法加载本地摘要计算模块，请重新加载插件。")); };
      try { worker.postMessage({ text, file, algorithm: $("hash-algorithm").value }); }
      catch (error) { finish(); reject(error); }
    });
  }
  function convert(id, text, options = {}) {
    const decode = (options.action ?? $("direction").value) === "decode";
    if (id === "base64") return { text: C.base64(text, decode) };
    if (id === "url") {
      const whole = $("url-mode").value === "uri";
      try { return { text: (decode ? (whole ? decodeURI : decodeURIComponent) : (whole ? encodeURI : encodeURIComponent))(text) }; }
      catch { throw new Error("URL 编解码失败，请检查百分号、UTF-8 字节或 Unicode 字符。"); }
    }
    if (id === "unicode") return { text: C.unicode(text, options.format ?? $("unicode-format").value, decode) };
    if (id === "html") return { text: C.html(text, decode) };
    if (id === "date") {
      const date = C.parseDate(text, $("date-unit").value, $("date-zone").value);
      return { rows: C.dateRows(date), refill: String(date.getTime()) };
    }
    if (id === "radix") {
      const from = options.from ?? Number($("from-base").value), to = Number($("to-base").value);
      const bases = [...new Set([to, 2, 8, 10, 16])];
      return { rows: bases.map(base => [`${base} 进制`, C.radix(text, from, base)]) };
    }
    throw new Error("请选择支持的转换工具。");
  }
  async function run() {
    showOptions(false);
    invalidate(); const token = revision;
    busy(true); notice("正在处理…");
    try {
      const text = $("input").value;
      if (text.length > 24 * 1024 * 1024) throw new Error("文本过大，请缩小到 24 MiB 字符以内。");
      let result;
      if (tool === "uuid") {
        const count = Number($("uuid-count").value);
        if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("UUID 数量必须是 1–100 的整数。");
        if (!crypto?.getRandomValues) throw new Error("当前环境不支持安全随机数，请在 WTools 中打开。");
        result = { text: Array.from({ length: count }, () => {
          const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
          let value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
          if ($("uuid-style").value !== "compact") value = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
          if ($("uuid-style").value === "braces") value = `{${value}}`;
          return $("uuid-case").value === "upper" ? value.toUpperCase() : value;
        }).join("\n") };
      } else if (tool === "hash") {
        if (fileMode() && !selectedFile) throw new Error("请先选择要计算摘要的文件。");
        result = await hash(text, fileMode() ? selectedFile : null, token);
      } else if (tool === "image") {
        if ($("direction").value === "decode") result = { image: C.imageBytes(text) };
        else {
          if (!selectedFile) throw new Error("请先选择图片文件。");
          const bytes = new Uint8Array(await selectedFile.arrayBuffer());
          if (token !== revision) return;
          const [mime] = C.imageType(bytes);
          result = { text: ($("image-prefix").checked ? `data:${mime};base64,` : "") + C.bytesToBase64(bytes) };
        }
      } else result = convert(tool, text);
      showResult(result, token);
    } catch (error) { if (token === revision) { notice(error.message || "处理失败，请检查输入。", true); } }
    finally { if (token === revision) busy(false); }
  }
  function setFile(file) {
    if (!file) return;
    invalidate();
    const limit = tool === "image" ? 16 * 1024 * 1024 : 1024 * 1024 * 1024;
    if (file.size > limit) { selectedFile = null; $("file").value = ""; renderControls(); notice(`文件过大，最大 ${tool === "image" ? "16 MiB" : "1 GiB"}。`, true); return; }
    selectedFile = file; renderControls(); notice("文件已选择，点击按钮开始处理");
  }
  function recognize() {
    const detected = C.detect($("input").value);
    if (!detected) { notice("未识别到已知格式，请手动选择工具。", true); return; }
    selectTool(detected.tool, { ...detected, keepInput: true }); run();
  }
  const navGroups = [
    ["编码转义", ["base64", "image", "url", "unicode", "html"]],
    ["格式与时间", ["date", "radix"]],
    ["摘要与标识", ["hash", "uuid"]]
  ];
  for (const [label, ids] of navGroups) {
    $("tools").append(node("p", "nav-group", label));
    for (const id of ids) {
      const config = tools[id];
      const button = node("button"); button.dataset.tool = id;
      const glyph = node("span", "glyph", config.glyph); glyph.setAttribute("aria-hidden", "true");
      button.append(glyph, node("span", "", config.title)); button.onclick = () => selectTool(id); $("tools").append(button);
    }
  }
  $("run").onclick = run;
  $("cancel").onclick = () => { invalidate(); notice("已取消计算"); };
  $("recognize").onclick = recognize;
  $("input").oninput = () => {
    invalidate(); clearTimeout(inputTimer);
    if (!$("input").value.trim()) { updateInputHint(); notice("所有转换均在本地完成"); return; }
    if (autoTools.has(tool)) { inputTimer = setTimeout(() => { updateInputHint(); run(); }, 120); }
    else { inputTimer = setTimeout(updateInputHint, 180); notice("输入已修改，点击按钮更新结果"); }
  };
  for (const button of document.querySelectorAll("#direction-segmented button")) {
    button.onclick = () => {
      if ($("direction").value === button.dataset.value) return;
      $("direction").value = button.dataset.value;
      $("direction").dispatchEvent(new Event("change"));
    };
  }
  for (const field of document.querySelectorAll(".options input,.options select")) field.onchange = () => {
    invalidate();
    if (field.id === "hash-source") { selectedFile = null; $("file").value = ""; }
    renderControls();
    if ($("input").value.trim() && autoTools.has(tool)) run();
    else notice("选项已更新，点击按钮开始处理");
  };
  $("now").onclick = () => { $("input").value = String(Date.now()); $("date-unit").value = "milliseconds"; updateInputHint(); run(); };
  $("clear").onclick = () => { invalidate(); $("input").value = ""; updateInputHint(); notice("已清空"); $("input").focus(); };
  $("copy").onclick = () => copy(resultText);
  $("use-result").onclick = () => {
    const value = refillText; invalidate(); $("input").value = value; updateInputHint(); notice("结果已用作输入"); $("input").focus();
  };
  $("example").onclick = () => {
    invalidate(); $("input").value = tools[tool].example ?? "";
    if (tool === "image") $("input").value = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    else if (["base64", "unicode", "html", "url"].includes(tool)) $("direction").value = "encode";
    if (tool === "radix") { $("from-base").value = "16"; $("to-base").value = "10"; }
    renderControls(); run();
  };
  $("file").onchange = () => setFile($("file").files[0]);
  $("remove-file").onclick = () => { invalidate(); selectedFile = null; $("file").value = ""; renderControls(); notice("已移除文件"); };
  for (const type of ["dragenter", "dragover"]) $("input-panel").addEventListener(type, event => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault(); $("input-panel").classList.add("dragover");
  });
  $("input-panel").addEventListener("dragleave", event => { if (!$("input-panel").contains(event.relatedTarget)) $("input-panel").classList.remove("dragover"); });
  $("input-panel").addEventListener("drop", event => {
    $("input-panel").classList.remove("dragover");
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    if (!["image", "hash"].includes(tool)) { notice("请切换到图片 Base64 或文件 Hash 后拖入文件。", true); return; }
    if (tool === "image") $("direction").value = "encode"; else $("hash-source").value = "file";
    setFile(event.dataTransfer.files[0]);
  });
  // Prevent accidental navigation when a file is dropped outside the input panel.
  for (const type of ["dragover", "drop"]) document.addEventListener(type, event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
  document.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); if (!$("run").disabled) run(); } });
  const themes = ["system", "light", "dark"], themeNames = { system: "跟随系统", light: "浅色", dark: "深色" };
  let theme = "system";
  try { const stored = localStorage.getItem("coding-helper-theme"); if (themes.includes(stored)) theme = stored; } catch { /* Preferences are optional. */ }
  function applyTheme() { document.documentElement.dataset.theme = theme; $("theme").textContent = `主题：${themeNames[theme]}`; }
  $("theme").onclick = () => { theme = themes[(themes.indexOf(theme) + 1) % themes.length]; applyTheme(); try { localStorage.setItem("coding-helper-theme", theme); } catch { /* Continue without persistence. */ } };
  function entryContent(entry) {
    let text = typeof entry.payload === "string" ? entry.payload : "";
    let command = "";
    if (entry.type === "text") {
      command = [...(commands[entry.code] ?? [])].sort((a, b) => b.length - a.length).find(value => text.toLowerCase() === value.toLowerCase() || text.toLowerCase().startsWith(value.toLowerCase() + " ")) ?? "";
      if (command) text = text.slice(command.length).trimStart();
    }
    return { text, command };
  }
  api?.onPluginEnter(entry => {
    const { text, command } = entryContent(entry);
    let options = entry.option?.conversion;
    if (!options || !tools[options.tool]) {
      const detected = C.detect(text);
      const id = tools[entry.code] ? entry.code : "base64";
      // Respect the feature the user selected, including an explicit Hash command.
      options = command === "编码小助手" ? detected ?? { tool: id } : detected?.tool === id ? detected : { tool: id };
      if (entry.type === "img") options = { tool: "image", action: "encode" };
    }
    if (command.includes("解码")) options = { ...options, action: "decode" };
    if (command.endsWith("编码") || command === "HTML 转义") options = { ...options, action: "encode" };
    if (entry.type === "regex" && ["base64", "image", "url", "unicode", "html"].includes(options.tool)) options = { ...options, action: "decode" };
    if (command === "UTF8") options = { ...options, format: "utf8" };
    if (command === "UTF16") options = { ...options, format: "utf16" };
    if (command === "Unicode 码位") options = { ...options, format: "codepoint" };
    selectTool(options.tool, { action: "encode", ...options });
    $("input").value = text;
    if (options.tool === "date") { $("date-unit").value = "auto"; $("date-zone").value = "local"; }
    if (options.tool === "url") $("url-mode").value = "component";
    if (options.tool === "radix") { $("from-base").value = "16"; $("to-base").value = "10"; }
    if (entry.code === "hash") {
      $("hash-source").value = command === "文件哈希" ? "file" : "text";
      $("hash-algorithm").value = ["MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512"].includes(command.toUpperCase()) ? command.toUpperCase() : "all";
    }
    renderControls();
    if (entry.type === "img") {
      try {
        const image = C.imageBytes(text);
        setFile(new File([image.bytes], `clipboard.${image.extension}`, { type: image.mime }));
        if (selectedFile) run();
      } catch (error) { notice(error.message, true); }
      return;
    }
    if (options.tool === "uuid" || (text && !fileMode())) run();
  });
  api?.onMainPush(entry => {
    const { text, command } = entryContent(entry);
    if (!text || text.length > 4096 || ["hash", "uuid"].includes(entry.code)) return [];
    const conversion = C.detect(text);
    if (!conversion || ["image", "hash", "uuid"].includes(conversion.tool)) return [];
    if (conversion.tool !== entry.code && !/^编码小助手(?:\s|$)/.test(String(entry.payload))) return [];
    // Never mutate the visible editor or do file work while answering a hidden query.
    try {
      let preview;
      const decode = !command.endsWith("编码") && command !== "HTML 转义";
      if (conversion.tool === "date") preview = C.dateRows(C.parseDate(text))[2][1];
      else if (conversion.tool === "radix") preview = C.radix(text, 16, 10);
      else if (conversion.tool === "base64") preview = C.base64(text, decode);
      else if (conversion.tool === "url") preview = (decode ? decodeURIComponent : encodeURIComponent)(text);
      else if (conversion.tool === "html") preview = C.html(text, decode);
      else preview = C.unicode(text, conversion.format, decode);
      const selected = { ...conversion, action: decode ? "decode" : "encode" };
      return [{ text: preview.trim().slice(0, 160) || "查看转换结果", title: `编码小助手 · ${tools[conversion.tool].title} · 打开查看完整结果`, conversion: selected }];
    } catch { return []; }
  }, () => true);
  applyTheme(); renderControls();
})();
