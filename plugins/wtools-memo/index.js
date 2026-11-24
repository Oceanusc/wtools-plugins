"use strict";
const $ = (id) => document.getElementById(id);
const api = window.wtools;
const prefix = "quick-paste/";
let notes = [], tags = [], selected = null, activeTag = "*", editing = null, image = null;
let imageLoading = 0;
let busy = false, managing = false, checked = new Set(), imageVersion = 0;
const urls = new Map();
const current = () => notes.find((note) => note._id === selected);
const visible = () => notes.filter((note) => (activeTag === "*" || (activeTag === "-" ? !note.tag : note.tag === activeTag)) &&
  `${note.body}\n${note.remark}\n${note.tag}`.toLocaleLowerCase().includes($("search").value.trim().toLocaleLowerCase()));
function message(text, error = false) { $("status").textContent = text; $("status").toggleAttribute("data-error", error); }
function action(handler) { return async (event) => { try { await handler(event); } catch (error) { message(error.message || "操作失败", true); } }; }
function put(doc) { const result = api.db.put(doc); if (!result?.ok) throw new Error(result?.message || "无法保存收藏"); }
function load() {
  if (!api?.db?.promises?.postAttachment) { message("请使用支持本地附件库的 WTools 版本打开此插件。", true); return; }
  try {
    notes = api.db.allDocs(prefix).filter((doc) => doc._id !== prefix + "settings").sort((a,b) => b.updatedAt - a.updatedAt);
    tags = api.db.get(prefix + "settings")?.tags || [];
    render();
  } catch (error) { message(`无法读取收藏：${error.message}`, true); }
}
function saveTags(next) { put({ ...api.db.get(prefix + "settings"), _id: prefix + "settings", tags: next }); tags = next; }
function renderTags() {
  const names = [...new Set([...tags, ...notes.map((n) => n.tag).filter(Boolean)])];
  const rows = [["*", "全部", "▦"], ["-", "无标签", "◩"], ...names.map((name) => [name,name,""])];
  $("tags").replaceChildren(...rows.map(([id,name,icon]) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "tag";
    button.classList.toggle("active", id === activeTag); button.setAttribute("aria-pressed", String(id === activeTag));
    const glyph = document.createElement("span"); glyph.textContent = icon; button.append(glyph,document.createTextNode(name));
    button.title = name; button.onclick = () => { activeTag = id; checked.clear(); render(); }; return button;
  }));
  $("tag-options").replaceChildren(...names.map((name) => { const option = document.createElement("option"); option.value = name; return option; }));
  $("rename-tag").disabled = $("delete-tag").disabled = ["*","-"].includes(activeTag) || busy;
}
function highlight(text, language) {
  const fragment = document.createDocumentFragment();
  if (language === "plain") { fragment.append(document.createTextNode(text)); return fragment; }
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|return|if|else|function|class|async|await|import|from|new|true|false|null)\b|\b\d+(?:\.\d+)?\b|\$[\w:]+|[\w-]+(?=\s*:))/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const token = document.createElement("span"); const value = match[0];
    token.className = /^\/\/|^\/\*|^#/.test(value) ? "token-comment" : /^["'`]/.test(value) ? "token-string" : /^\d/.test(value) ? "token-number" : /^\$|:$/.test(value) || /^[\w-]+$/.test(value) && !/^(const|let|var|return|if|else|function|class|async|await|import|from|new|true|false|null)$/.test(value) ? "token-key" : "token-word";
    token.textContent = value; fragment.append(token); offset = match.index + value.length;
  }
  fragment.append(document.createTextNode(text.slice(offset))); return fragment;
}
async function imageURL(note) {
  if (urls.has(note.attachment)) return urls.get(note.attachment);
  const bytes = await api.db.promises.getAttachment(note.attachment);
  if (!bytes) throw new Error("图片附件不存在");
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" })); urls.set(note.attachment,url); return url;
}
function render() {
  const rows = visible(); if (!rows.some((n) => n._id === selected)) selected = rows[0]?._id ?? null;
  renderTags();
  $("list").replaceChildren(...rows.map((note) => {
    const card = document.createElement("article"); card.className = "note"; card.dataset.id = note._id;
    card.classList.toggle("selected", note._id === selected); card.tabIndex = note._id === selected ? 0 : -1;
    card.setAttribute("role","option"); card.setAttribute("aria-selected",String(note._id === selected));
    card.setAttribute("aria-label",note.remark || note.body.slice(0,100) || "图片收藏");
    const content = document.createElement("div"); content.className = "content";
    if (note.type === "image") {
      const img = document.createElement("img"); img.alt = note.remark || "收藏图片"; content.append(img);
      imageURL(note).then((url) => { img.src = url; }).catch((error) => { content.textContent = error.message; });
    } else if (note.type === "code") { content.classList.add("code"); content.append(highlight(note.body, note.language)); }
    else content.textContent = note.body;
    card.append(content);
    if (note.remark) { const caption = document.createElement("div"); caption.className = "caption"; caption.textContent = note.remark; card.append(caption); }
    if (managing) { const check = document.createElement("input"); check.type = "checkbox"; check.checked = checked.has(note._id); check.setAttribute("aria-label","选择此收藏"); check.onclick = (event) => event.stopPropagation(); check.onchange = () => { check.checked ? checked.add(note._id) : checked.delete(note._id); updateTools(); }; card.append(check); }
    card.onclick = () => select(note._id); card.ondblclick = action(() => { if (!managing) return transfer("paste"); }); return card;
  }));
  $("empty").hidden = rows.length > 0;
  $("empty").querySelector("h2").textContent = notes.length ? "没有匹配的收藏" : "收藏常用，随取随贴";
  $("getting-started").hidden = notes.length >= 3 || activeTag !== "*" || Boolean($("search").value.trim()) || Boolean(api.db.get(prefix + "settings")?.guideDismissed);
  $("count").textContent = `${rows.length} 条收藏`; updateTools();
}
function select(id, scroll = false) {
  selected = id;
  for (const card of $("list").children) { const active = card.dataset.id === id; card.classList.toggle("selected",active); card.setAttribute("aria-selected",String(active)); card.tabIndex = active ? 0 : -1; if (active && scroll) card.scrollIntoView({block:"nearest"}); }
  updateTools();
}
function updateTools() {
  for (const id of ["paste","copy","edit"]) $(id).disabled = busy || !current();
  $("remove").disabled = busy || (managing ? checked.size === 0 : !current());
  $("remove").title = managing ? `删除选中的 ${checked.size} 条收藏` : "删除";
  $("new").disabled = busy || !api?.db; $("manage").disabled = busy;
}
function localTime(value) { if (!value) return ""; const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function typeChange() { const type = $("type").value; $("body").hidden = type === "image"; $("image-area").hidden = type !== "image"; $("language").hidden = type !== "code"; }
function openEditor(note = null) {
  if (busy || !api?.db) return;
  editing = note; imageVersion++; image = note?.attachment ? { attachment: note.attachment } : null;
  $("tag").value = note?.tag || (!["*","-"].includes(activeTag) ? activeTag : "");
  $("type").value = note?.type || "text"; $("language").value = note?.language || "auto";
  $("body").value = note?.body || ""; $("remark").value = note?.remark || ""; $("remind-at").value = localTime(note?.remindAt);
  $("editor-error").textContent = ""; $("file").value = ""; $("preview").removeAttribute("src");
  $("preview").parentElement.hidden = !image;
  if (image) imageURL(note).then((url) => { if (editing === note) $("preview").src = url; }).catch((e) => { $("editor-error").textContent = e.message; });
  typeChange(); $("dialog").showModal(); $("tag").focus();
}
async function setImage(file) {
  const version = ++imageVersion;
  if (!/^(image\/(png|jpeg|webp|gif))$/.test(file.type) || file.size > 20*1024*1024) throw new Error("请选择不超过 20 MB 的 PNG、JPEG、WebP 或 GIF 图片");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16000000) throw new Error("图片最多 1600 万像素");
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d").drawImage(bitmap,0,0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve,"image/png"));
    if (!blob || blob.size > 8*1024*1024) throw new Error("转换后的 PNG 超过 8 MB，请缩小图片后重试");
    if (version !== imageVersion || !$("dialog").open) return;
    image = { blob }; $("type").value = "image"; typeChange();
    $("preview").src = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    $("preview").parentElement.hidden = false; $("editor-error").textContent = "";
  } finally { bitmap.close(); }
}
async function native(payload) {
  const response = await fetch("/_wtools/memo-transfer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "当前 WTools 尚不支持快捷粘贴，请更新配套宿主。"); return result;
}
async function legacy(payload) {
  const response = await fetch("/_wtools/memos",{method:"POST",body:JSON.stringify(payload)}); const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "无法访问旧版备忘，请更新配套宿主。"); return result;
}
async function transfer(op) {
  const note = current(); if (busy || !note) return;
  busy = true; updateTools();
  try {
    let value = note.body;
    if (note.type === "image") { const blob = await (await fetch(await imageURL(note))).blob(); value = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
    if (op === "copy" && note.type !== "image") { if (!await api.copyText(value)) throw new Error("无法写入剪贴板"); }
    else await native({ op, type: note.type === "image" ? "image" : "text", value });
    message(op === "copy" ? "已复制" : "已粘贴到原窗口");
  } finally { busy = false; updateTools(); }
}
$("new").onclick = () => openEditor(); $("edit").onclick = () => openEditor(current());
$("search").oninput = render; $("type").onchange = typeChange;
$("paste").onclick = action(() => transfer("paste")); $("copy").onclick = action(() => transfer("copy"));
$("cancel").onclick = () => { imageVersion++; $("dialog").close(); };
$("dialog").addEventListener("cancel", (event) => { if (busy) event.preventDefault(); else imageVersion++; });
$("clear-image").onclick = () => { imageVersion++; image = null; $("preview").removeAttribute("src"); $("preview").parentElement.hidden = true; };
const importImage = async (file) => { imageLoading++; try { if (file) await setImage(file); } catch (error) { $("editor-error").textContent = error.message; } finally { imageLoading--; } };
$("file").onchange = () => importImage($("file").files[0]);
$("dialog").addEventListener("paste", (event) => { const file = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) { event.preventDefault(); importImage(file); } });
$("image-area").ondragover = (event) => event.preventDefault(); $("image-area").ondrop = (event) => { event.preventDefault(); importImage(event.dataTransfer.files[0]); };
$("editor").onsubmit = async (event) => {
  event.preventDefault(); if (busy) return;
  if (imageLoading) { $("editor-error").textContent = "图片正在处理，请稍候保存"; return; }
  const type = $("type").value, body = $("body").value, tag = $("tag").value.trim(), remark = $("remark").value.trim();
  if (type === "image" ? !image : !body.trim()) { $("editor-error").textContent = type === "image" ? "请添加图片" : "请输入收藏内容"; return; }
  if (["*","-"].includes(tag)) { $("editor-error").textContent = "标签不能使用保留字符 * 或 -"; return; }
  const time = $("remind-at").value; const remindAt = time ? new Date(time).getTime() : null;
  if (time && time !== localTime(editing?.remindAt) && (!Number.isFinite(remindAt) || remindAt <= Date.now())) { $("editor-error").textContent = "请选择未来的提醒时间"; return; }
  if (time && (type === "image" || body.length > 4000)) { $("editor-error").textContent = "图片与超过 4000 字的内容暂不支持提醒"; return; }
  busy = true; $("editor").querySelector("fieldset").disabled = true; updateTools();
  let staged;
  try {
    const id = editing?._id || prefix + crypto.randomUUID();
    let attachment = type === "image" ? image.attachment : null;
    if (type === "image" && image.blob) { staged = "quick-paste-image-" + crypto.randomUUID(); await api.db.promises.postAttachment(staged,image.blob,"image/png"); attachment = staged; }
    const legacyId = editing?.legacyId || crypto.randomUUID().replaceAll("-","");
    // Save the native reminder first. Failure leaves the editor and existing collection intact.
    if (remindAt || editing?.remindAt) await legacy({op:"save",id:legacyId,title:(remark || body.slice(0,60) || "收藏提醒").slice(0,100),body,remindAt});
    put({ _id:id,type,body:type === "image" ? "" : body,tag,remark,language:$("language").value,attachment,legacyId,remindAt,updatedAt:Date.now() });
    staged = null;
    if (editing?.attachment && editing.attachment !== attachment) await api.db.promises.removeAttachment(editing.attachment).catch(() => {});
    selected = id; activeTag = tag || "-"; $("search").value = ""; $("dialog").close(); imageVersion++; load(); message("已保存");
  } catch(error) { $("editor-error").textContent = error.message; if (staged) await api.db.promises.removeAttachment(staged).catch(() => {}); }
  finally { busy = false; $("editor").querySelector("fieldset").disabled = false; updateTools(); }
};
$("remove").onclick = action(async () => {
  const targets = managing ? notes.filter((n) => checked.has(n._id)) : [current()].filter(Boolean);
  if (busy || !targets.length || !confirm(`删除这 ${targets.length} 条收藏及其提醒？`)) return;
  busy = true; updateTools();
  try { for (const note of targets) {
    if (note.remindAt) await legacy({op:"remove",id:note.legacyId});
    const result = api.db.remove(note._id); if (!result?.ok) throw new Error("删除失败");
    if (note.attachment) { const url = urls.get(note.attachment); if (url) URL.revokeObjectURL(url); urls.delete(note.attachment); await api.db.promises.removeAttachment(note.attachment).catch(() => {}); }
    checked.delete(note._id);
  } message("已删除"); } finally { busy = false; load(); }
});
$("manage").onclick = () => { managing = !managing; checked.clear(); $("manage").setAttribute("aria-pressed",String(managing)); render(); };
$("add-tag").onclick = action(() => { const name = prompt("新建标签"); if (!name?.trim()) return; if (name.trim().length > 60 || ["*","-"].includes(name.trim())) throw new Error("请输入 60 字以内的有效标签"); saveTags([...new Set([...tags,name.trim()])]); activeTag = name.trim(); render(); });
$("rename-tag").onclick = action(() => { const name = prompt("重命名标签",activeTag)?.trim(); if (!name || name === activeTag) return; if (name.length > 60 || ["*","-"].includes(name)) throw new Error("请输入 60 字以内的有效标签"); for (const note of notes.filter((n) => n.tag === activeTag)) put({...note,tag:name}); saveTags([...new Set(tags.map((t) => t === activeTag ? name : t))]); activeTag = name; load(); });
$("delete-tag").onclick = action(() => { if (!confirm(`删除标签“${activeTag}”？收藏将移入无标签。`)) return; for (const note of notes.filter((n) => n.tag === activeTag)) put({...note,tag:""}); saveTags(tags.filter((t) => t !== activeTag)); activeTag = "-"; load(); });
$("info").onclick = () => $("help").showModal(); $("close-help").onclick = () => $("help").close();
$("import-old").onclick = action(async () => { if (busy) return; busy = true; $("import-old").disabled = true; try { const old = await legacy({op:"list"}); let count = 0; for (const note of old) { if (notes.some((n) => n.legacyId === note.id)) continue; put({_id:prefix+note.id,legacyId:note.id,type:"text",body:note.body || note.title,remark:note.title,tag:"",remindAt:note.remindAt,updatedAt:note.updatedAt}); count++; } load(); message(`已导入 ${count} 条旧备忘`); $("help").close(); } finally { busy = false; $("import-old").disabled = false; updateTools(); } });
document.addEventListener("keydown", action(async (event) => {
  if (event.isComposing || event.altKey) return;
  if ($("dialog").open) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); $("editor").requestSubmit(); } return; }
  if ($("help").open) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); openEditor(); return; }
  if (event.target.closest("input,textarea,select,button") && event.target !== $("search")) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const rows = visible(); const index = rows.findIndex((n) => n._id === selected); select(rows[Math.max(0,Math.min(rows.length-1,index+(event.key === "ArrowDown" ? 1 : -1)))]?._id, true); }
  if (event.key === "Enter" || event.key === "ArrowRight") { event.preventDefault(); await transfer("paste"); }
  if (event.key === "F2") { event.preventDefault(); openEditor(current()); }
}));
api?.onPluginEnter((entry) => { if (busy || $("dialog").open) return; load(); if (entry.type === "over") { openEditor(); $("body").value = entry.payload; } else if (entry.type === "img") { openEditor(); fetch(entry.payload).then((r) => r.blob()).then(importImage); } else $("search").focus(); });
load();

// Inline icons stay sharp at every display scale and require no external assets.
const icons = {
  copy: '<rect x="8" y="8" width="12" height="14" rx="1"/><path d="M16 4H4v14"/>',
  edit: '<path d="m4 16 12-12 4 4L8 20l-5 1zM13 7l4 4"/>',
  remove: '<path d="M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  manage: '<path d="m3 6 2 2 4-4M12 6h9M3 14l2 2 4-4M12 14h9M12 21h9"/>'
};
for (const [id, paths] of Object.entries(icons)) {
  $(id).innerHTML = `<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

$("guide-new").onclick = () => openEditor();
$("guide-import").onclick = () => $("import-old").click();
$("dismiss-guide").onclick = action(() => {
  put({ ...api.db.get(prefix + "settings"), _id: prefix + "settings", tags, guideDismissed: true });
  $("getting-started").hidden = true;
});
