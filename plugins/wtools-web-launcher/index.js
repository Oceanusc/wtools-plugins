"use strict";
const $ = id => document.getElementById(id);
const { browserNames, normalizeUrl, initialState, validateState, launchItems } = window.WebLauncher;
const api = window.wtools;
const storageKey = "web-launcher-v1";
const store = api?.dbStorage ?? { getItem: key => JSON.parse(localStorage.getItem(key)), setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)) };
let state, category = "default", mode = "web", editing = null, categoryEditing = false, busy = false;
let browsers = new Set(["default"]), hostReady = false, loadFailed = false;
try { state = validateState(store.getItem(storageKey) ?? initialState()); }
catch { state = initialState(); loadFailed = true; notice("无法读取已保存的数据，为避免覆盖，已暂停编辑。请检查存储后重新打开插件。", true); }

function notice(message, error = false) { $("status").textContent = message; $("status").classList.toggle("error", error); }
function commit(next) {
  if (loadFailed) throw new Error("无法读取原有数据，暂时不能保存。");
  validateState(next);
  store.setItem(storageKey, next);
  state = next;
  render();
}
function update(change) {
  const next = structuredClone(state);
  change(next);
  commit(next);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function group() { return mode === "ai" ? "ai" : category; }
function matches(entry, query) { return `${entry.name} ${entry.urls.map(u => u.url).join(" ")}`.toLocaleLowerCase().includes(query); }
function selectCategory(id) { category = id; $("search").value = ""; render(); }
function switchMode(next) { mode = next; $("search").value = ""; render(); }
function render() {
  document.body.classList.toggle("ai", mode === "ai");
  $("web-tab").setAttribute("aria-pressed", String(mode === "web"));
  $("ai-tab").setAttribute("aria-pressed", String(mode === "ai"));
  $("categories").replaceChildren(...state.categories.map(c => {
    const button = element("button", category === c.id ? "active" : "");
    button.append(element("span", "", c.name), element("span", "", String(state.entries.filter(e => e.category === c.id).length)));
    button.setAttribute("aria-pressed", String(category === c.id));
    button.onclick = () => selectCategory(c.id);
    return button;
  }));
  $("builtin").classList.toggle("active", category === "builtin");
  const current = state.categories.find(c => c.id === category);
  $("edit-category").disabled = !current || loadFailed;
  $("delete-category").disabled = !current || category === "default" || loadFailed;
  $("add-category").disabled = loadFailed;
  $("category-title").textContent = mode === "ai" ? "AI 快开" : current?.name ?? "常用网站";
  $("category-hint").textContent = mode === "ai" ? "常用 AI，一个入口即刻抵达" : "点击名称打开网页，多个网址将一起启动";
  $("category-launch-label").hidden = mode === "ai" || !current;
  $("ai-note").hidden = mode !== "ai";
  $("category-launch").checked = current?.launch ?? false;
  $("category-launch").disabled = loadFailed;
  $("add-entry").disabled = loadFailed;
  const entries = state.entries.filter(e => e.category === group());
  const query = $("search").value.trim().toLocaleLowerCase();
  const visible = entries.filter(e => matches(e, query));
  $("total").textContent = `${entries.filter(e => e.enabled).length} / ${entries.length} 个入口已启用`;
  $("open-category").disabled = busy || !entries.some(e => e.enabled);
  $("empty").hidden = visible.length > 0;
  $("empty").querySelector("h3").textContent = query ? "没有找到匹配的网页" : "从一个常用网页开始";
  $("empty-add").hidden = Boolean(query) || loadFailed;
  $("entries").replaceChildren(...visible.map(entry => {
    const row = element("article", `entry${entry.enabled ? "" : " disabled"}`);
    const icon = element("div", "entry-icon", entry.glyph ?? Array.from(entry.name)[0].toUpperCase());
    icon.style.background = entry.bg ?? "#e9edf9"; icon.style.color = entry.fg ?? "#626fb8";
    const info = element("div", "entry-info");
    const title = element("button", "entry-title", entry.name);
    title.disabled = busy || !entry.enabled;
    title.onclick = () => launch([entry]);
    info.append(title);
    for (const item of entry.urls) {
      const line = element("div", "url-line");
      const url = element("span", "", item.url); url.title = item.url;
      line.append(url, element("span", "browser-tag", browserNames[item.browser])); info.append(line);
    }
    const edit = element("button", "entry-edit", "•••"); edit.setAttribute("aria-label", `编辑 ${entry.name}`); edit.onclick = () => editEntry(entry); edit.disabled = loadFailed;
    const label = element("label", "switch-label"); const toggle = element("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.setAttribute("aria-label", `启用 ${entry.name}`); toggle.checked = entry.enabled; toggle.disabled = loadFailed;
    toggle.onchange = () => { try { update(next => { next.entries.find(e => e.id === entry.id).enabled = toggle.checked; }); } catch (error) { toggle.checked = entry.enabled; notice(error.message, true); } };
    label.append(toggle, element("span", "", "启用")); row.append(icon, info, edit, label); return row;
  }));
}
async function request(data) {
  const response = await fetch("/_wtools/web-launcher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? "当前宿主不支持网页快开，请使用包含网页启动接口的 WTools 构建。");
  return result;
}
async function launch(entries) {
  if (busy) return;
  busy = true; render();
  try {
    const items = launchItems(entries);
    const result = await request({ op: "open", items });
    const failures = result.failed ?? [];
    notice(failures.length ? `已提交 ${result.opened} 个网页；${failures.map(f => `${f.url}：${f.error}`).join("；")}` : `已向浏览器提交 ${result.opened} 个网页`, failures.length > 0);
  } catch (error) { notice(error.message, true); }
  finally { busy = false; render(); }
}
function urlField(item = { url: "", browser: "default" }) {
  const row = element("div", "url-field"); const input = element("input"); input.value = item.url; input.placeholder = "https://example.com"; input.required = true; input.maxLength = 4096; input.setAttribute("aria-label", "网页地址");
  const select = element("select"); select.setAttribute("aria-label", "打开此网页的浏览器");
  for (const [id, name] of Object.entries(browserNames)) {
    const option = element("option", "", name + (hostReady && !browsers.has(id) ? "（未安装）" : "")); option.value = id; option.disabled = hostReady && !browsers.has(id); select.append(option);
  }
  select.value = item.browser;
  const remove = element("button", "", "×"); remove.type = "button"; remove.setAttribute("aria-label", "移除此网页"); remove.onclick = () => { if ($("url-fields").children.length > 1) row.remove(); else input.focus(); };
  row.append(input, select, remove); $("url-fields").append(row);
}
function editEntry(entry) {
  editing = entry?.id ?? null;
  $("editor-title").textContent = entry ? "编辑网页快开" : "新增网页快开";
  $("entry-name").value = entry?.name ?? "";
  $("entry-category").replaceChildren(...[...state.categories, { id: "builtin", name: "常用网站" }, { id: "ai", name: "AI 快开" }].map(c => { const option = element("option", "", c.name); option.value = c.id; return option; }));
  $("entry-category").value = entry?.category ?? group();
  $("entry-enabled").checked = entry?.enabled ?? true;
  $("url-fields").replaceChildren();
  for (const item of entry?.urls ?? [{ url: "", browser: "default" }]) urlField(item);
  $("editor-error").textContent = ""; $("delete-entry").hidden = !entry;
  $("editor").showModal(); $("entry-name").focus();
}
$("entry-form").onsubmit = event => {
  event.preventDefault();
  try {
    const name = $("entry-name").value.trim(); if (!name) throw new Error("请输入名称。");
    const urls = [...$("url-fields").children].map(row => ({ url: normalizeUrl(row.querySelector("input").value), browser: row.querySelector("select").value }));
    if (hostReady && urls.some(item => !browsers.has(item.browser))) throw new Error("所选浏览器未安装，请改用默认浏览器或其他已安装浏览器。");
    update(next => {
      const old = next.entries.find(e => e.id === editing);
      const entry = { ...old, id: editing ?? crypto.randomUUID(), name, urls, category: $("entry-category").value, enabled: $("entry-enabled").checked };
      if (old) next.entries[next.entries.indexOf(old)] = entry; else next.entries.push(entry);
    });
    category = $("entry-category").value === "ai" ? category : $("entry-category").value;
    mode = $("entry-category").value === "ai" ? "ai" : "web";
    $("search").value = ""; $("editor").close(); render(); notice("已保存网页快开");
  } catch (error) { $("editor-error").textContent = error.message; }
};
$("delete-entry").onclick = () => { try { update(next => { next.entries = next.entries.filter(e => e.id !== editing); }); $("editor").close(); notice("已删除入口"); } catch (error) { $("editor-error").textContent = error.message; } };
$("add-url").onclick = () => { if ($("url-fields").children.length >= 30) $("editor-error").textContent = "一个入口最多添加 30 个网页。"; else urlField(); };
function editCategory(rename) { categoryEditing = rename; $("category-name").value = rename ? state.categories.find(c => c.id === category).name : ""; $("category-dialog-title").textContent = rename ? "重命名分类" : "新增分类"; $("category-error").textContent = ""; $("category-dialog").showModal(); $("category-name").focus(); }
$("category-form").onsubmit = event => {
  event.preventDefault();
  try {
    const name = $("category-name").value.trim();
    if (!name) throw new Error("请输入分类名称。");
    if (state.categories.some(c => c.name === name && (!categoryEditing || c.id !== category)) || ["常用网站", "AI 快开"].includes(name)) throw new Error("已存在同名分类。");
    const id = categoryEditing ? category : crypto.randomUUID();
    update(next => { if (categoryEditing) next.categories.find(c => c.id === id).name = name; else next.categories.push({ id, name, launch: false }); });
    selectCategory(id); $("category-dialog").close();
  } catch (error) { $("category-error").textContent = error.message; }
};
$("add-category").onclick = () => editCategory(false); $("edit-category").onclick = () => editCategory(true);
$("delete-category").onclick = () => $("confirm-dialog").showModal();
$("confirm-delete-category").onclick = () => { try { update(next => { next.categories = next.categories.filter(c => c.id !== category); next.entries.filter(e => e.category === category).forEach(e => { e.category = "default"; }); }); selectCategory("default"); $("confirm-dialog").close(); } catch (error) { notice(error.message, true); } };
$("category-launch").onchange = () => { try { update(next => { next.categories.find(c => c.id === category).launch = $("category-launch").checked; }); } catch (error) { render(); notice(error.message, true); } };
$("web-tab").onclick = () => switchMode("web"); $("ai-tab").onclick = () => switchMode("ai");
$("builtin").onclick = () => selectCategory("builtin"); $("search").oninput = render;
$("add-entry").onclick = $("empty-add").onclick = () => editEntry();
$("open-category").onclick = () => launch(state.entries.filter(e => e.category === group()));
for (const button of document.querySelectorAll("[data-close]")) button.onclick = () => $(button.dataset.close).close();
api?.onMainPush(({ code, payload }) => {
  if (code !== "web" || loadFailed) return [];
  const query = String(payload ?? "").replace(/^(网页快开|打开网页)\s*/, "").trim().toLocaleLowerCase();
  const entries = state.entries.filter(e => e.enabled && matches(e, query)).map(e => ({ text: e.name, title: e.urls.map(u => u.url).join(" · ").slice(0, 240), target: e.id, kind: "entry" }));
  const categories = state.categories.filter(c => c.launch && c.name.toLocaleLowerCase().includes(query) && state.entries.some(e => e.category === c.id && e.enabled)).map(c => ({ text: `打开分类：${c.name}`, title: "打开分类中所有已启用的网页", target: c.id, kind: "category" }));
  return [...categories, ...entries].slice(0, 12);
}, () => true);
api?.onPluginEnter(entry => {
  switchMode(entry.code === "ai" ? "ai" : "web");
  const option = entry.option;
  if (option?.kind === "entry") { const target = state.entries.find(e => e.id === option.target && e.enabled); if (target) { mode = target.category === "ai" ? "ai" : "web"; category = target.category === "ai" ? category : target.category; render(); launch([target]); } }
  else if (option?.kind === "category") { const target = state.categories.find(c => c.id === option.target && c.launch); if (target) { selectCategory(target.id); launch(state.entries.filter(e => e.category === target.id)); } }
});
render();
if (api) request({ op: "browsers" }).then(result => { browsers = new Set(result.browsers.map(b => b.id)); hostReady = true; }).catch(error => notice(error.message, true));
else if (!loadFailed) notice("浏览器预览：可编辑并保存配置；打开网页请在 WTools 中使用。");
