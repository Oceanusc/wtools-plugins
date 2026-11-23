const search = document.getElementById("search");
const list = document.getElementById("list");
const listMessage = document.getElementById("list-message");
const create = document.getElementById("new");
const empty = document.getElementById("empty");
const editor = document.getElementById("editor");
const fields = editor.querySelector("fieldset");
const title = document.getElementById("title");
const body = document.getElementById("body");
const remindAt = document.getElementById("remind-at");
const clearTime = document.getElementById("clear-time");
const reminderStatus = document.getElementById("reminder-status");
const remove = document.getElementById("remove");
const status = document.getElementById("status");
const retry = document.getElementById("retry");
const reminderHelp = reminderStatus.textContent;
const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" });

let notes = [];
let selected;
let initial = {};
let loaded = false;
let refreshing = false;
let busy = false;
let writeVersion = 0;

async function request(payload) {
  const response = await fetch("/_atools/memos", { method: "POST", body: JSON.stringify(payload) });
  if (response.status === 403 || response.status === 404) {
    throw new Error("当前宿主或插件版本不支持备忘录，请使用支持此插件的 WTools 构建。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function message(text, error = false) {
  status.textContent = text;
  status.toggleAttribute("data-error", error);
}

function localTime(timestamp) {
  if (timestamp == null) return "";
  const date = new Date(timestamp);
  const parts = [date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, "0"));
  return `${date.getFullYear()}-${parts[0]}-${parts[1]}T${parts[2]}:${parts[3]}`;
}

function currentNote() {
  return notes.find((note) => note.id === selected);
}

function renderReminder() {
  const note = currentNote();
  clearTime.disabled = !remindAt.value;
  reminderStatus.textContent = note?.notified && remindAt.value === initial.time
    ? "已发送桌面提醒"
    : reminderHelp;
}

function renderList() {
  const query = search.value.trim().toLocaleLowerCase();
  const visible = notes.filter((note) =>
    note.title.toLocaleLowerCase().includes(query) || note.body.toLocaleLowerCase().includes(query));
  listMessage.hidden = visible.length > 0;
  listMessage.textContent = query ? "没有匹配的备忘" : "还没有备忘";
  const focusedNote = list.contains(document.activeElement) ? document.activeElement.dataset.id : undefined;
  list.replaceChildren(...visible.map((note) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const name = document.createElement("strong");
    const info = document.createElement("span");
    button.type = "button";
    button.className = "note";
    button.dataset.id = note.id;
    if (note.id === selected) button.setAttribute("aria-current", "true");
    name.textContent = note.title;
    info.textContent = note.remindAt == null
      ? dateFormat.format(note.updatedAt)
      : `${note.notified ? "已提醒" : "提醒"} · ${dateFormat.format(note.remindAt)}`;
    button.append(name, info);
    item.append(button);
    return item;
  }));
  if (focusedNote) list.querySelector(`[data-id="${focusedNote}"]`)?.focus();
}

function select(id) {
  selected = id;
  const note = currentNote();
  initial = { title: note?.title ?? "", body: note?.body ?? "", time: localTime(note?.remindAt) };
  empty.hidden = id !== undefined;
  editor.hidden = id === undefined;
  remove.hidden = !note;
  title.value = initial.title;
  body.value = initial.body;
  remindAt.value = initial.time;
  renderReminder();
  renderList();
}

function canSwitch() {
  if (busy) return false;
  const changed = title.value !== initial.title || body.value !== initial.body || remindAt.value !== initial.time;
  return editor.hidden || !changed || window.confirm("放弃未保存的更改？");
}

async function refresh() {
  if (refreshing || busy) return;
  refreshing = true;
  const version = writeVersion;
  try {
    const next = await request({ op: "list" });
    if (version !== writeVersion) return;
    if (!loaded) {
      notes = next;
      loaded = true;
      create.disabled = false;
      search.disabled = false;
      retry.hidden = true;
      message("");
      select(notes[0]?.id);
    } else if (JSON.stringify(notes) !== JSON.stringify(next)) {
      notes = next;
      renderList();
      renderReminder();
    }
  } catch (error) {
    if (version !== writeVersion || loaded) return;
    listMessage.textContent = "无法读取备忘";
    message(error.message, true);
    retry.hidden = false;
  } finally {
    refreshing = false;
  }
}

async function write(payload, nextSelection, success) {
  busy = true;
  writeVersion += 1;
  create.disabled = true;
  fields.disabled = true;
  try {
    notes = await request(payload);
    select(nextSelection === undefined ? notes[0]?.id : nextSelection);
    message(success);
  } catch (error) {
    message(error.message, true);
  } finally {
    busy = false;
    create.disabled = false;
    fields.disabled = false;
  }
}

create.addEventListener("click", () => {
  if (!canSwitch()) return;
  select(null);
  message("");
  title.focus();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest(".note");
  if (!button || button.dataset.id === selected || !canSwitch()) return;
  select(button.dataset.id);
  message("");
});

search.addEventListener("input", renderList);
retry.addEventListener("click", refresh);
remindAt.addEventListener("input", renderReminder);
clearTime.addEventListener("click", () => {
  remindAt.value = "";
  renderReminder();
  remindAt.focus();
});

editor.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  if (!title.value.trim()) {
    message("请输入标题", true);
    title.focus();
    return;
  }
  let time = currentNote()?.remindAt ?? null;
  if (remindAt.value !== initial.time) {
    time = remindAt.value ? new Date(remindAt.value).getTime() : null;
    if (time !== null && (!Number.isFinite(time) || localTime(time) !== remindAt.value || time <= Date.now())) {
      message("请选择有效的未来日期和时间", true);
      remindAt.focus();
      return;
    }
  }
  const id = selected ?? Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  write({ op: "save", id, title: title.value.trim(), body: body.value, remindAt: time }, id, "已保存");
});

remove.addEventListener("click", () => {
  if (!busy && currentNote() && window.confirm("删除这条备忘及其提醒？")) {
    write({ op: "remove", id: selected }, undefined, "已删除");
  }
});

window.wtools?.onPluginEnter(refresh);
window.addEventListener("focus", refresh);
setInterval(() => {
  if (loaded && !document.hidden && notes.some((note) => note.remindAt <= Date.now() && note.remindAt && !note.notified)) {
    refresh();
  }
}, 5000);
refresh();
