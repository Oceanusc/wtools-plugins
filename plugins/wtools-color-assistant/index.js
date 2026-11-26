(() => {
  "use strict";

  const C = window.ColorMath;
  const api = window.wtools;
  const storage = api?.dbStorage;
  const $ = id => document.getElementById(id);
  const pages = [...document.querySelectorAll("main > .page")];
  const nav = [...document.querySelectorAll("[data-page]")];
  const storageKey = "wtools-color-assistant";
  const maxComparison = 8;
  const formats = [
    ["hex", "HEX"], ["rgb", "RGB"], ["hsv", "HSV / HSB"], ["hsl", "HSL"],
    ["cmyk", "CMYK"], ["hsi", "HSI"], ["lab", "LAB (D65)"]
  ];
  const harmonyNames = {
    complementary: "互补色", contrasting: "对比色", analogous: "类似色", intermediate: "中差色"
  };

  function readSettings() {
    try {
      return (storage ? storage.getItem(storageKey) : JSON.parse(localStorage.getItem(storageKey))) || {};
    } catch {
      return {};
    }
  }

  const settings = readSettings();
  let stripHash = settings.stripHash === true;
  let favorites = Array.isArray(settings.favorites) ? settings.favorites : [];
  let favoriteFilter = "all";
  let page = "color";
  let ui = "flat";
  let country = "cn";
  let hueFilter = "all";
  let noticeTimer;
  let noticeTarget = $("notice");

  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function button(label, className, onClick) {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function notice(message) {
    clearTimeout(noticeTimer);
    noticeTarget.textContent = "";
    noticeTarget = document.querySelector("dialog[open] .dialog-notice") || $("notice");
    noticeTarget.textContent = message;
    noticeTimer = setTimeout(() => { noticeTarget.textContent = ""; }, 2800);
  }

  function writeSettings(changes) {
    try {
      const value = { stripHash, favorites, ...changes };
      if (storage) storage.setItem(storageKey, value);
      else localStorage.setItem(storageKey, JSON.stringify(value));
      return true;
    } catch {
      notice("无法保存到本机存储");
      return false;
    }
  }

  function hexLabel(hex) {
    return (stripHash ? hex.slice(1) : hex).toUpperCase();
  }

  async function copyText(text, message = "已复制") {
    try {
      if (api?.copyText) {
        if (!await api.copyText(text)) throw new Error();
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const previousFocus = document.activeElement;
        const input = element("textarea", "clipboard-buffer");
        input.value = text;
        (document.querySelector("dialog[open]") || document.body).append(input);
        input.select();
        try {
          if (!document.execCommand("copy")) throw new Error();
        } finally {
          input.remove();
          previousFocus?.focus();
        }
      }
      notice(message);
    } catch {
      notice("无法写入剪贴板");
    }
  }

  function selectPage(id) {
    if (!nav.some(item => item.dataset.page === id)) id = "color";
    const changed = page !== id;
    page = id;
    for (const panel of pages) panel.hidden = panel.id !== id;
    for (const item of nav) {
      if (item.dataset.page === id) {
        item.setAttribute("aria-current", "page");
        if (changed) item.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        item.removeAttribute("aria-current");
      }
    }
    if (changed) $("content").scrollTop = 0;
    if (id === "ui-palettes") renderUi();
    if (id === "traditional") renderTraditional();
    if (id === "gradients") renderGradients();
    if (id === "favorites") renderFavorites();
  }

  function selectOption(container, key, value) {
    for (const option of $(container).querySelectorAll("button")) {
      option.setAttribute("aria-pressed", String(option.dataset[key] === value));
    }
  }

  function bindOptions(container, key, onSelect) {
    $(container).addEventListener("click", event => {
      const value = event.target.closest("button")?.dataset[key];
      if (value) onSelect(value);
    });
  }

  function paint(node, hex) {
    node.style.setProperty("--swatch", hex);
    const black = C.contrastRatio(hex, "#000000");
    const white = C.contrastRatio(hex, "#ffffff");
    node.style.setProperty("--swatch-ink", black >= white ? "#000" : "#fff");
  }

  function favoriteKey(item) {
    if (item.type === "color") return "color:" + item.color.hex;
    if (item.type === "palette") return "palette:" + item.colors.map(color => color.hex).join(",");
    return "gradient:" + (item.gradient.angle % 360) + ":" + item.gradient.stops.join(",");
  }

  function saveFavorite(item) {
    const key = favoriteKey(item);
    if (favorites.some(favorite => favoriteKey(favorite) === key)) {
      notice("已在收藏中");
      return;
    }
    const next = [item, ...favorites];
    if (writeSettings({ favorites: next })) {
      favorites = next;
      notice("已收藏");
    }
  }

  function savePalette(name, colors) {
    if (colors.length) saveFavorite({ type: "palette", name, colors });
  }

  function removeFavorite(item) {
    const next = favorites.filter(favorite => favorite !== item);
    if (writeSettings({ favorites: next })) {
      favorites = next;
      renderFavorites();
      notice("已取消收藏");
    }
  }

  function hsvFor(hex, previousHue = 0) {
    const { r, g, b } = C.hexToRgb(hex);
    const hsv = C.rgbToHsv(r, g, b);
    if (!hsv.s) hsv.h = previousHue;
    return hsv;
  }

  let nextSlot = 1;
  function makeSlot(hex) {
    return { id: nextSlot++, hex, hsv: hsvFor(hex) };
  }

  let active = makeSlot("#003cf2");
  const slots = [active];
  let reference = active;
  const formatInputs = new Map();

  function updateColor(hex) {
    active.hsv = hsvFor(hex, active.hsv.h);
    active.hex = hex;
    renderColor();
    renderComparison();
  }

  function updateHsv(changes) {
    Object.assign(active.hsv, changes);
    const { h, s, v } = active.hsv;
    const { r, g, b } = C.hsvToRgb(h, s, v);
    active.hex = C.rgbToHex(r, g, b);
    renderColor();
    renderComparisonColors();
  }

  function renderColor() {
    const hex = active.hex;
    const { h, s, v } = active.hsv;
    $("hue").value = h;
    $("saturation").value = s;
    $("brightness").value = v;
    $("native-color").value = hex;
    $("wheel").style.setProperty("--wheel-shade", (100 - v) / 100);
    const full = C.hsvToRgb(h, 100, v);
    const bright = C.hsvToRgb(h, s, 100);
    const gray = v * 255 / 100;
    $("saturation").style.setProperty("--range-track", "linear-gradient(90deg, " +
      C.rgbToHex(gray, gray, gray) + ", " + C.rgbToHex(full.r, full.g, full.b) + ")");
    $("brightness").style.setProperty("--range-track", "linear-gradient(90deg, #000, " + C.rgbToHex(bright.r, bright.g, bright.b) + ")");
    const radians = h * Math.PI / 180;
    $("wheel-marker").style.left = (50 + Math.sin(radians) * s / 2) + "%";
    $("wheel-marker").style.top = (50 - Math.cos(radians) * s / 2) + "%";
    paint($("current-color"), hex);
    $("current-hex").textContent = hexLabel(hex);
    const values = C.formatAll(hex, stripHash);
    for (const [id, input] of formatInputs) {
      input.value = id === "hex" ? hexLabel(hex) : values[id];
      input.removeAttribute("aria-invalid");
    }
    for (const [key, colors] of Object.entries(C.getHarmonies(h, s, v))) {
      const row = $("harmony-" + key);
      colors.forEach((color, index) => {
        const chip = row.children[index];
        paint(chip, color);
        chip.dataset.hex = color;
        chip.title = harmonyNames[key] + " " + hexLabel(color);
        chip.setAttribute("aria-label", chip.title);
      });
    }
  }

  function renderComparisonColors() {
    for (const [index, slot] of slots.entries()) {
      const item = $("comparison-list").children[index];
      const chip = item.firstElementChild;
      paint(chip, slot.hex);
      chip.textContent = hexLabel(slot.hex);
      chip.setAttribute("aria-label", "比较色 " + (index + 1) + " " + hexLabel(slot.hex));
      if (slots.length > 1) $("reference-color").options[index].text = (index + 1) + ". " + hexLabel(slot.hex);
    }
    if (slots.length > 1) {
      const ratio = C.contrastRatio(active.hex, reference.hex);
      const delta = C.deltaE76(active.hex, reference.hex);
      $("comparison-result").textContent = "对比度 " + ratio.toFixed(2) + ":1 · 色差 ΔE₇₆ " + delta.toFixed(2);
    }
  }

  function renderComparison(focusActive = false) {
    $("comparison-list").replaceChildren(...slots.map((slot, index) => {
      const card = element("div", "comparison-card");
      const choose = button("", "comparison-chip", () => {
        active = slot;
        renderColor();
        renderComparison(true);
      });
      choose.setAttribute("aria-pressed", String(slot === active));
      card.append(choose);
      if (slots.length > 1) {
        const remove = button("×", "comparison-remove", () => {
          slots.splice(index, 1);
          if (slot === active) {
            active = slots[Math.min(index, slots.length - 1)];
            renderColor();
          }
          if (slot === reference) reference = slots.find(item => item !== active) || active;
          renderComparison(true);
        });
        remove.setAttribute("aria-label", "移除比较色 " + (index + 1));
        card.append(remove);
      }
      return card;
    }));
    $("comparison-details").hidden = slots.length < 2;
    $("save-comparison").disabled = slots.length < 2;
    $("reference-color").replaceChildren(...slots.map(slot => new Option("", String(slot.id))));
    $("reference-color").value = String(reference.id);
    $("add-slot").setAttribute("aria-disabled", String(slots.length === maxComparison));
    renderComparisonColors();
    if (focusActive) $("comparison-list").children[slots.indexOf(active)].firstElementChild.focus();
  }

  function addComparison(hex, reuse) {
    const existing = reuse && slots.find(slot => slot.hex === hex);
    if (existing) {
      active = existing;
    } else {
      if (slots.length >= maxComparison) {
        notice("最多可比较 " + maxComparison + " 个颜色");
        return false;
      }
      if (slots.length === 1) reference = active;
      const slot = makeSlot(hex);
      if (!reuse) slot.hsv = { ...active.hsv };
      active = slot;
      slots.push(slot);
    }
    renderColor();
    renderComparison();
    return true;
  }

  function initColor() {
    for (const [id, label] of formats) {
      const row = element("div", "format-row");
      const caption = element("label", "", label);
      caption.htmlFor = "format-" + id;
      const input = element("input", "data-value");
      input.id = caption.htmlFor;
      input.spellcheck = false;
      input.autocomplete = "off";
      formatInputs.set(id, input);
      const commit = () => {
        const values = C.formatAll(active.hex, stripHash);
        if (input.value === (id === "hex" ? hexLabel(active.hex) : values[id])) return;
        const hex = C.parseByFormat(id, input.value);
        if (hex) {
          updateColor(hex);
        } else {
          input.setAttribute("aria-invalid", "true");
          notice(label + " 色值格式有误");
        }
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") renderColor();
      });
      const copy = button("复制", "copy-format", () => {
        const value = C.formatAll(active.hex, stripHash);
        copyText(id === "hex" ? hexLabel(active.hex) : value[id], "已复制 " + label);
      });
      copy.setAttribute("aria-label", "复制 " + label);
      row.append(caption, input, copy);
      $("formats").append(row);
    }
    for (const [key, label] of Object.entries(harmonyNames)) {
      const group = element("div", "harmony-group");
      const row = element("div", "harmony-chips");
      row.id = "harmony-" + key;
      const count = { complementary: 1, contrasting: 2, analogous: 2, intermediate: 3 }[key];
      for (let index = 0; index < count; index++) {
        row.append(button("", "harmony-chip", event => openSwatch({ hex: event.currentTarget.dataset.hex, name: label })));
      }
      group.append(element("span", "", label), row);
      $("harmonies").append(group);
    }
    for (const [id, channel] of [["hue", "h"], ["saturation", "s"], ["brightness", "v"]]) {
      $(id).addEventListener("input", event => updateHsv({ [channel]: Number(event.target.value) }));
    }
    const wheel = $("wheel");
    const pick = event => {
      const rect = wheel.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const distance = Math.hypot(x, y);
      const h = distance < 1 ? active.hsv.h : (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
      updateHsv({ h, s: Math.min(100, distance * 200 / rect.width) });
    };
    wheel.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary) return;
      wheel.setPointerCapture(event.pointerId);
      pick(event);
    });
    wheel.addEventListener("pointermove", event => {
      if (wheel.hasPointerCapture(event.pointerId)) pick(event);
    });
    $("native-color").addEventListener("input", event => updateColor(event.target.value));
    $("eyedropper").hidden = typeof window.EyeDropper !== "function";
    $("eyedropper").addEventListener("click", async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        updateColor(sRGBHex.toLowerCase());
      } catch (error) {
        if (error.name !== "AbortError") notice("当前窗口无法启用屏幕取色");
      }
    });
    $("reference-color").addEventListener("change", event => {
      reference = slots.find(slot => slot.id === Number(event.target.value));
      renderComparisonColors();
    });
    $("add-slot").addEventListener("click", () => addComparison(active.hex, false));
    $("save-current").addEventListener("click", () => saveFavorite({ type: "color", color: { hex: active.hex } }));
    $("save-comparison").addEventListener("click", () => savePalette("多色对比", slots.map(slot => ({ hex: slot.hex }))));
    renderColor();
    renderComparison();
  }

  let selectedSwatch;
  function swatch(color, compact = false) {
    const name = color.name || hexLabel(color.hex);
    const chip = button("", compact ? "swatch compact" : "swatch", () => openSwatch(color));
    paint(chip, color.hex);
    chip.title = [name, color.reading, color.name && hexLabel(color.hex)].filter(Boolean).join(" ");
    chip.setAttribute("aria-label", chip.title);
    if (color.name || !compact) chip.append(element("span", "swatch-name", name));
    if (!compact && color.name) chip.append(element("span", "swatch-hex", hexLabel(color.hex)));
    return chip;
  }

  function openSwatch(color) {
    selectedSwatch = color;
    $("swatch-title").textContent = color.name || "颜色详情";
    $("swatch-hex").textContent = hexLabel(color.hex);
    $("swatch-reading").textContent = color.reading || "";
    paint($("swatch-preview"), color.hex);
    $("swatch-dialog").showModal();
  }

  function openColor(color, compare) {
    if (compare && !addComparison(color.hex, true)) return;
    if (!compare) updateColor(color.hex);
    $("swatch-dialog").close();
    selectPage("color");
    if (compare) {
      $("comparison-list").children[slots.indexOf(active)].firstElementChild.focus();
    } else {
      formatInputs.get("hex").focus();
    }
  }

  function paletteGroup(name, subtitle, colors, compact = false) {
    const group = element("section", compact ? "palette-group ui-group" : "palette-group");
    const heading = element("div", "group-heading");
    heading.append(element("h2", "", name));
    if (subtitle) heading.append(element("span", "muted", subtitle));
    const grid = element("div", compact ? "swatch-grid compact-grid" : "swatch-grid");
    grid.append(...colors.map(color => swatch(color, compact)));
    group.append(heading, grid);
    return group;
  }

  function renderUi() {
    selectOption("ui-options", "ui", ui);
    $("ui-groups").replaceChildren(...window.UIData[ui].map(group =>
      paletteGroup(group.name, group.en, group.colors, true)));
  }

  function renderTraditional() {
    selectOption("traditional-options", "country", country);
    $("term-control").hidden = country !== "cn";
    const query = $("traditional-search").value.trim().toLowerCase();
    const term = $("term-select").value;
    const terms = window.TraditionalCN.SOLAR_TERMS;
    const groups = country === "cn"
      ? terms.filter(group => !term || group.term === term)
      : [{ term: "和色大辞典", colors: window.TraditionalJP }];
    const matches = groups.map(group => ({
      ...group,
      colors: group.colors.filter(color => [color.name, color.reading, color.hex, group.term].some(
        text => text?.toLowerCase().includes(query)))
    })).filter(group => group.colors.length);
    const count = matches.reduce((total, group) => total + group.colors.length, 0);
    const total = groups.reduce((sum, group) => sum + group.colors.length, 0);
    $("traditional-count").textContent = (country === "cn" ? "故宫二十四节气 · " : "") +
      (count === total ? total : count + " / " + total) + " 色";
    $("traditional-groups").replaceChildren(...(matches.length
      ? matches.map(group => paletteGroup(group.term, group.desc, group.colors))
      : [element("p", "empty", "没有找到匹配的颜色")]));
  }

  const media = window.ColorAssistantMedia({
    $, element, button, notice, copyText, swatch, savePalette, saveFavorite
  });

  function renderGradients() {
    selectOption("gradient-filters", "hue", hueFilter);
    const gradients = window.GradientData.GRADIENTS.filter(item => hueFilter === "all" || item.hue === hueFilter);
    $("gradient-grid").replaceChildren(...(gradients.length
      ? gradients.map(media.gradientCard)
      : [element("p", "empty", "这个色系暂无预设")]));
  }

  function renderFavorites() {
    selectOption("favorite-options", "favorite", favoriteFilter);
    const visible = favorites.filter(item => favoriteFilter === "all" || item.type === favoriteFilter);
    $("favorite-list").replaceChildren(...(visible.length ? visible.map(item => {
      const row = element("section", "favorite-row");
      const title = item.type === "color" ? item.color.name || hexLabel(item.color.hex)
        : item.type === "gradient" ? item.gradient.name : item.name;
      const heading = element("div", "section-heading");
      const remove = button("取消收藏", "subtle", () => removeFavorite(item));
      heading.append(element("h2", "", title), remove);
      row.append(heading);
      if (item.type === "gradient") {
        row.append(media.gradientCard(item.gradient, "编辑渐变"));
      } else {
        const grid = element("div", "swatch-grid");
        grid.append(...(item.type === "palette" ? item.colors : [item.color]).map(color => swatch(color)));
        row.append(grid);
      }
      if (item.type === "palette") {
        row.append(button("复制色板", "", () => copyText(item.colors.map(color => hexLabel(color.hex)).join(", "))));
      }
      return row;
    }) : [element("p", "empty", "收藏的颜色、色板和渐变会显示在这里")]));
  }

  function refreshHexLabels() {
    renderColor();
    renderComparisonColors();
    if (page === "ui-palettes") renderUi();
    if (page === "traditional") renderTraditional();
    if (page === "favorites") renderFavorites();
    media.renderImageColors();
  }

  for (const item of nav) item.addEventListener("click", () => selectPage(item.dataset.page));
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { dialog.querySelector(".dialog-notice").textContent = ""; });
  }
  $("strip-hash").checked = stripHash;
  $("strip-hash").addEventListener("change", event => {
    stripHash = event.target.checked;
    writeSettings({ stripHash });
    refreshHexLabels();
  });
  $("swatch-copy").addEventListener("click", () => copyText(hexLabel(selectedSwatch.hex), "已复制 HEX"));
  $("swatch-open").addEventListener("click", () => openColor(selectedSwatch, false));
  $("swatch-compare").addEventListener("click", () => openColor(selectedSwatch, true));
  $("swatch-save").addEventListener("click", () => saveFavorite({ type: "color", color: selectedSwatch }));

  $("term-select").append(...window.TraditionalCN.SOLAR_TERMS.map(group =>
    new Option(group.term + " · " + group.season, group.term)));
  $("term-select").addEventListener("change", renderTraditional);
  $("traditional-search").addEventListener("input", renderTraditional);
  bindOptions("ui-options", "ui", value => { ui = value; renderUi(); });
  bindOptions("traditional-options", "country", value => { country = value; renderTraditional(); });
  bindOptions("favorite-options", "favorite", value => { favoriteFilter = value; renderFavorites(); });
  bindOptions("gradient-filters", "hue", value => { hueFilter = value; renderGradients(); });
  for (const { id, label, color } of window.GradientData.HUE_FILTERS) {
    const option = element("button", "hue-filter", label);
    option.type = "button";
    const dot = element("span", "hue-dot");
    dot.style.background = color;
    option.prepend(dot);
    option.dataset.hue = id;
    $("gradient-filters").append(option);
  }
  $("new-gradient").addEventListener("click", () => media.openGradient({
    name: "自定义渐变", angle: 135, stops: [active.hex, reference === active ? "#f9a8d4" : reference.hex]
  }));

  initColor();
  api?.onPluginEnter?.(({ code, type, payload }) => {
    document.querySelector("dialog[open]")?.close();
    const command = type === "text" && typeof payload === "string" ? payload.trim().toLowerCase() : "";
    if (code === "ui-palettes") {
      const match = [...$("ui-options").children].find(item => item.textContent.toLowerCase() === command);
      if (match) ui = match.dataset.ui;
      if (command === "falt ui") ui = "flat";
    }
    if (code === "traditional") {
      if (command === "日本传统色") country = "jp";
      if (["中国传统色", "二十四节气"].includes(command)) country = "cn";
    }
    selectPage(code);
    if (code === "color" && type === "regex") {
      const hex = C.normalizeHex(payload);
      if (hex) updateColor(hex);
    }
    if (code === "image-palette" && type === "img" &&
        typeof payload === "string" && payload.startsWith("data:image/png;base64,")) {
      media.loadImage(payload, "剪贴板图片");
    }
    if (code === "image-palette" && type === "files") {
      $("image-status").textContent = "请通过「打开图片」选择文件，或将图片拖入此页。";
    }
  });
})();
