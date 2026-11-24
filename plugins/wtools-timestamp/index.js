"use strict";

const $ = id => document.getElementById(id);
const api = window.wtools;
const T = window.Timestamp;
const storageKey = "timestamp-settings-v1";
const store = api?.dbStorage ?? {
  getItem: key => JSON.parse(localStorage.getItem(key)),
  setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value))
};
const zones = T.availableZones();
const zoneSet = new Set(zones);
const defaults = () => ({ unit: "ms", zone: "Asia/Shanghai", zones: T.defaultZones.filter(zone => zoneSet.has(zone)), theme: "system" });
let prefs = defaults(), draft = null, storageFailed = false;
let paused = false, clockValue = Date.now(), timer = null, statusTimer = null;

function notice(text, error = false) {
  clearTimeout(statusTimer);
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
  if (!error) statusTimer = setTimeout(() => { $("status").textContent = ""; }, 3000);
}

function normalizePrefs(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults();
  const chosen = Array.isArray(saved.zones) ? [...new Set(saved.zones.filter(zone => zoneSet.has(zone)))] : defaults().zones;
  if (!chosen.length) chosen.push("Asia/Shanghai");
  return {
    unit: saved.unit === "s" ? "s" : "ms", zones: chosen,
    zone: chosen.includes(saved.zone) ? saved.zone : chosen[0],
    theme: ["system", "light", "dark"].includes(saved.theme) ? saved.theme : "system"
  };
}

try { prefs = normalizePrefs(store.getItem(storageKey)); }
catch { storageFailed = true; notice("无法读取已保存的设置，本次仍可转换，暂不覆盖原有设置。", true); }

function persist(next) {
  if (storageFailed) throw new Error("无法读取原有设置，请检查存储后重新打开插件。");
  store.setItem(storageKey, next);
}

function applyTheme() {
  if (prefs.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
}

function zoneLabel(zone, value = Date.now()) {
  return `${T.zoneName(zone)}（当前 ${T.offsetLabel(value, zone)}，${zone}）`;
}

function renderControls() {
  for (const button of document.querySelectorAll("[data-unit]")) {
    button.setAttribute("aria-pressed", String(button.dataset.unit === prefs.unit));
  }
  const now = Date.now();
  $("timezone").replaceChildren(...prefs.zones.map(zone => {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zoneLabel(zone, now);
    return option;
  }));
  $("timezone").value = prefs.zone;
  const unit = prefs.unit === "s" ? "秒" : "毫秒";
  $("current-unit").textContent = `（${unit}）`;
  $("input-unit").textContent = `${unit} · ${prefs.unit}`;
  $("timestamp-input").placeholder = `输入${unit}时间戳`;
}

function setResult(id, value, label) {
  const result = $(id);
  result.querySelector(".result-value").textContent = value ?? "—";
  result.dataset.value = value ?? "";
  result.disabled = value === null;
  result.setAttribute("aria-label", value === null ? `${label}：暂无结果` : `复制${label}：${value}`);
}

function fieldError(field, message) {
  $(field + "-input").setAttribute("aria-invalid", String(Boolean(message)));
  $(field + "-error").textContent = message;
}

function contextAt(value) {
  return `${T.zoneName(prefs.zone)} · ${T.offsetLabel(value, prefs.zone)} · ${prefs.zone}`;
}

function convertDate() {
  const text = $("date-input").value.trim();
  $("date-zone").textContent = `${T.zoneName(prefs.zone)} · ${prefs.zone}`;
  fieldError("date", "");
  if (!text) { setResult("timestamp-result", null, "时间戳"); return; }
  try {
    const value = T.fromDate(text, prefs.zone);
    setResult("timestamp-result", T.toTimestamp(value, prefs.unit), "时间戳");
    $("date-zone").textContent = contextAt(value);
    $("date-picker").value = T.toDate(value, prefs.zone, true).replace(" ", "T");
  } catch (error) {
    setResult("timestamp-result", null, "时间戳");
    fieldError("date", error.message);
  }
}

function convertTimestamp() {
  const text = $("timestamp-input").value.trim();
  $("timestamp-zone").textContent = `${T.zoneName(prefs.zone)} · ${prefs.zone}`;
  fieldError("timestamp", "");
  if (!text) { setResult("date-result", null, "日期"); return; }
  try {
    const value = T.fromTimestamp(text, prefs.unit);
    setResult("date-result", T.toDate(value, prefs.zone, prefs.unit === "ms" || value % 1000 !== 0), "日期");
    $("timestamp-zone").textContent = contextAt(value);
  } catch (error) {
    setResult("date-result", null, "日期");
    fieldError("timestamp", error.message);
  }
}

function renderClock() {
  if (!paused) clockValue = Date.now();
  // Live Unix seconds use whole seconds; converted dates retain their milliseconds.
  const value = prefs.unit === "s" ? String(Math.floor(clockValue / 1000)) : String(clockValue);
  setResult("current-result", value, "当前时间戳");
  $("current-date").textContent = `${T.toDate(clockValue, prefs.zone)} · ${T.zoneName(prefs.zone)} ${T.offsetLabel(clockValue, prefs.zone)}`;
}

function scheduleClock() {
  clearInterval(timer);
  timer = null;
  if (document.hidden || $("settings").open) return;
  renderClock();
  if (!paused) timer = setInterval(renderClock, prefs.unit === "ms" ? 100 : 1000);
}

function refresh() {
  applyTheme();
  renderControls();
  convertDate();
  convertTimestamp();
  scheduleClock();
}

function changeUnit(unit) {
  if (unit === prefs.unit) return;
  const next = { ...prefs, unit };
  let converted;
  try { converted = T.toTimestamp(T.fromTimestamp($("timestamp-input").value, prefs.unit), unit); }
  catch { /* Preserve invalid or empty input so the user can correct it. */ }
  try { persist(next); } catch (error) { notice(`设置未保存：${error.message}`, true); }
  prefs = next;
  if (converted !== undefined) $("timestamp-input").value = converted;
  refresh();
}

for (const button of document.querySelectorAll("[data-unit]")) button.onclick = () => changeUnit(button.dataset.unit);
$("timezone").onchange = () => {
  const next = { ...prefs, zone: $("timezone").value };
  try { persist(next); } catch (error) { notice(`设置未保存：${error.message}`, true); }
  prefs = next;
  convertDate(); convertTimestamp(); renderClock();
};
$("date-input").oninput = convertDate;
$("timestamp-input").oninput = convertTimestamp;
$("use-current-date").onclick = () => {
  $("date-input").value = T.toDate(Date.now(), prefs.zone, prefs.unit === "ms");
  convertDate();
};
$("open-calendar").onclick = () => {
  const picker = $("date-picker");
  if (!picker.value) picker.value = T.toDate(Date.now(), prefs.zone, true).replace(" ", "T");
  try {
    if (typeof picker.showPicker !== "function") throw new Error("Picker unavailable");
    picker.showPicker();
  } catch {
    picker.classList.add("picker-fallback");
    picker.removeAttribute("tabindex");
    picker.focus();
  }
};
$("date-picker").onchange = () => {
  if (!$("date-picker").value) return;
  $("date-input").value = $("date-picker").value.replace("T", " ");
  convertDate();
};
$("pause").onclick = () => {
  paused = !paused;
  $("pause").setAttribute("aria-pressed", String(paused));
  $("pause").querySelector("span").textContent = paused ? "继续" : "暂停";
  $("pause").querySelector("use").setAttribute("href", paused ? "#i-play" : "#i-pause");
  $("live-state").classList.toggle("paused", paused);
  $("live-state").replaceChildren(document.createElement("i"), document.createTextNode(paused ? "已暂停" : "实时"));
  scheduleClock();
};

async function copyResult(id) {
  const value = $(id).dataset.value;
  if (!value) return;
  try {
    if (typeof api?.copyText === "function") {
      if (!await api.copyText(value)) throw new Error("宿主未能写入剪贴板");
    } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else throw new Error("当前环境不支持剪贴板，请在 WTools 中使用");
    notice("已复制到剪贴板");
  } catch (error) { notice(`复制失败：${error.message}`, true); }
}
for (const id of ["timestamp-result", "date-result", "current-result"]) $(id).onclick = () => copyResult(id);

let zoneRows = [];
function prepareZoneRows() {
  const now = Date.now();
  zoneRows = zones.map(id => ({ id, name: T.zoneName(id), offset: T.offsetLabel(now, id) }));
}

function renderZoneList() {
  const query = $("zone-search").value.trim().toLocaleLowerCase();
  const visible = zoneRows.filter(row => `${row.name} ${row.id} ${row.offset}`.toLocaleLowerCase().includes(query));
  $("zone-count").textContent = `已选 ${draft.zones.length} / ${zones.length}`;
  $("zone-empty").hidden = visible.length > 0;
  $("zone-list").replaceChildren(...visible.map(row => {
    const label = document.createElement("label"); label.className = "zone-option";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox";
    checkbox.checked = draft.zones.includes(row.id);
    const info = document.createElement("div"); info.className = "zone-info";
    const name = document.createElement("div"); name.className = "zone-name"; name.textContent = row.name;
    const details = document.createElement("div"); details.className = "zone-details";
    details.textContent = `当前 ${row.offset} · ${row.id}`;
    info.append(name, details); label.append(checkbox, info);
    checkbox.onchange = () => {
      if (!checkbox.checked && draft.zones.length === 1) {
        checkbox.checked = true;
        $("settings-error").textContent = "至少保留一个时区。";
        return;
      }
      draft.zones = checkbox.checked ? [...draft.zones, row.id] : draft.zones.filter(id => id !== row.id);
      $("settings-error").textContent = "";
      $("zone-count").textContent = `已选 ${draft.zones.length} / ${zones.length}`;
    };
    return label;
  }));
}

function renderDraft() {
  for (const radio of document.querySelectorAll('[name="theme"]')) radio.checked = radio.value === draft.theme;
  renderZoneList();
}

$("open-settings").onclick = () => {
  draft = structuredClone(prefs);
  $("zone-search").value = "";
  $("settings-error").textContent = "";
  prepareZoneRows(); renderDraft();
  $("settings").showModal();
  scheduleClock();
};
for (const id of ["close-settings", "cancel-settings"]) $(id).onclick = () => $("settings").close();
$("settings").addEventListener("close", () => { draft = null; scheduleClock(); });
$("zone-search").oninput = renderZoneList;
$("reset-settings").onclick = () => {
  draft = defaults();
  $("zone-search").value = "";
  $("settings-error").textContent = "已恢复默认，保存后生效；取消可放弃。";
  renderDraft();
};
$("settings-form").onsubmit = event => {
  event.preventDefault();
  const theme = document.querySelector('[name="theme"]:checked').value;
  const next = normalizePrefs({ ...draft, theme });
  let converted;
  if (next.unit !== prefs.unit) {
    try { converted = T.toTimestamp(T.fromTimestamp($("timestamp-input").value, prefs.unit), next.unit); } catch { /* Keep editable input. */ }
  }
  try {
    persist(next);
    prefs = next;
    if (converted !== undefined) $("timestamp-input").value = converted;
    $("settings").close();
    refresh();
    notice("设置已保存");
  } catch (error) { $("settings-error").textContent = `保存失败：${error.message}`; }
};

document.addEventListener("visibilitychange", () => {
  scheduleClock();
  if (!document.hidden) renderControls();
});
document.addEventListener("keydown", event => {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || $("settings").open) return;
  if (event.target.matches("input, textarea, select") || event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (key === "z") { event.preventDefault(); copyResult("timestamp-result"); }
  if (key === "x") { event.preventDefault(); copyResult("date-result"); }
});

const initialTime = Math.floor(Date.now() / 1000) * 1000;
$("date-input").value = T.toDate(initialTime, prefs.zone);
$("timestamp-input").value = T.toTimestamp(initialTime, prefs.unit);
refresh();
