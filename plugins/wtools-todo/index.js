const byId = (id) => document.getElementById(id);
const sticky = window.wtoolsTodoSticky || location.hash === "#sticky";
const quickText = byId("quick-text");
const search = byId("search");
const list = byId("tasks");
const status = byId("status");
const edit = byId("edit-dialog");
const editText = byId("edit-text");
const summary = byId("summary-dialog");
const summaryText = byId("summary-text");
const summaryStatus = byId("summary-status");
const model = byId("model");
const phase = byId("phase");
const minutes = byId("minutes");
const clock = byId("clock");
const timerStatus = byId("timer-status");
const toggle = byId("toggle-timer");
const tabs = [...document.querySelectorAll("[data-filter]")];

let state;
let filter = "pending";
let editId = null;
let busy = false;
let reading = false;
let version = 0;

if (sticky) {
  document.body.classList.add("sticky");
  byId("page-title").textContent = "桌面便签";
}

function notice(element, text, error = false) {
  element.textContent = text;
  element.toggleAttribute("data-error", error);
}

async function request(op, data = {}) {
  const response = await fetch("/_atools/todo", { method: "POST", body: JSON.stringify({ op, ...data }) });
  if (response.status === 403 || response.status === 404) {
    throw new Error("请使用支持 ToDo 待办的 WTools 构建。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function tasks() {
  const query = search.value.trim().toLocaleLowerCase();
  return (state?.tasks ?? []).filter((task) => {
    const matches = filter === "all" || (filter === "done" && task.done)
      || (filter === "idea" && task.idea && !task.done)
      || (filter === "pending" && !task.idea && !task.done);
    return matches && task.text.toLocaleLowerCase().includes(query);
  });
}

function setFilter(next) {
  filter = next;
  for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.filter === next));
  renderList();
}

function renderList() {
  const visible = tasks();
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  byId("empty").hidden = visible.length > 0;
  byId("empty").textContent = search.value ? "没有匹配的记录" : "当前列表为空";
  list.replaceChildren(...visible.map((task) => {
    const item = document.createElement("li");
    const check = document.createElement("input");
    const open = document.createElement("button");
    item.className = "task";
    check.type = "checkbox";
    check.checked = task.done;
    check.dataset.key = `check-${task.id}`;
    check.setAttribute("aria-label", `${task.done ? "标为待处理" : "标为完成"} ${task.text.slice(0, 50)}`);
    check.addEventListener("change", () => {
      const done = check.checked;
      check.checked = task.done;
      change("toggle", { id: task.id, done });
    });
    open.type = "button";
    open.dataset.key = `edit-${task.id}`;
    open.textContent = task.text;
    open.classList.toggle("done", task.done);
    open.addEventListener("click", () => editTask(task));
    item.append(check, open);
    return item;
  }));
  if (focused) {
    const retained = list.querySelector(`[data-key="${focused}"]`);
    (retained ?? list.querySelector("input") ?? quickText).focus();
  }
}

function sync() {
  byId("quick-fields").disabled = !state || busy;
  byId("timer-controls").disabled = !state || busy;
  for (const id of ["sticky", "batch", "summary"]) byId(id).disabled = !state || busy;
  byId("retry").disabled = busy;
}

function applyState(next) {
  const timerChanged = !state || state.timer.minutes !== next.timer.minutes || state.timer.phase !== next.timer.phase;
  const tasksChanged = !state || JSON.stringify(state.tasks) !== JSON.stringify(next.tasks);
  state = next;
  if (timerChanged) {
    phase.value = state.timer.phase;
    minutes.value = state.timer.minutes;
  }
  if (tasksChanged) renderList();
  renderTimer();
  sync();
}

async function refresh() {
  if (reading || busy) return;
  const previousVersion = version;
  reading = true;
  try {
    const next = await request("load");
    if (previousVersion !== version) return;
    if (!state) notice(status, "");
    byId("retry").hidden = true;
    applyState(next);
  } catch (error) {
    if (!state) {
      byId("empty").textContent = "无法读取待办";
      byId("retry").hidden = false;
      notice(status, error.message, true);
    }
  } finally {
    reading = false;
  }
}

async function change(op, data, after = () => {}, feedback = status) {
  if (!state || busy) return;
  busy = true;
  version += 1;
  sync();
  try {
    applyState(await request(op, data));
    busy = false;
    sync();
    after();
  } catch (error) {
    notice(feedback, error.message, true);
  } finally {
    busy = false;
    sync();
  }
}

byId("quick").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = quickText.value.trim();
  if (!text) return quickText.focus();
  const idea = byId("kind").value === "idea";
  change("add", { texts: [text], idea }, () => {
    quickText.value = "";
    search.value = "";
    setFilter(idea ? "idea" : "pending");
    notice(status, "已添加");
    quickText.focus();
  });
});

for (const tab of tabs) tab.addEventListener("click", () => state && setFilter(tab.dataset.filter));
search.addEventListener("input", renderList);
byId("retry").addEventListener("click", refresh);
byId("sticky").addEventListener("click", async () => {
  try {
    await request("sticky");
    notice(status, "已打开桌面便签");
  } catch (error) {
    notice(status, error.message, true);
  }
});

function editTask(task) {
  if (busy) return;
  editId = task?.id ?? null;
  byId("edit-title").textContent = task ? "编辑记录" : "批量添加";
  byId("edit-label").textContent = task ? "内容" : "每行一条记录";
  byId("edit-kind-label").hidden = Boolean(task);
  byId("edit-kind").hidden = Boolean(task);
  byId("delete").hidden = !task;
  editText.value = task?.text ?? "";
  notice(byId("edit-status"), "");
  edit.showModal();
  editText.focus();
}

byId("batch").addEventListener("click", () => editTask());
byId("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = editText.value.trim();
  if (editId !== null) {
    change("edit", { id: editId, text }, () => edit.close(), byId("edit-status"));
  } else {
    const texts = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const idea = byId("edit-kind").value === "idea";
    change("add", { texts, idea }, () => {
      edit.close();
      search.value = "";
      setFilter(idea ? "idea" : "pending");
      notice(status, `已添加 ${texts.length} 条记录`);
    }, byId("edit-status"));
  }
});

byId("delete").addEventListener("click", () => {
  if (editId !== null && !busy && window.confirm("删除这条记录？")) {
    change("remove", { id: editId }, () => edit.close(), byId("edit-status"));
  }
});

function remaining(timer) {
  return Math.max(0, timer.deadline == null ? timer.remaining : timer.deadline - Date.now());
}

function renderTimer() {
  if (!state) return;
  const timer = state.timer;
  const time = remaining(timer);
  const running = timer.deadline !== null && time > 0;
  const finished = time === 0;
  const seconds = Math.ceil(time / 1000);
  const show = [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
  if (clock.textContent !== show) clock.textContent = show;
  clock.toggleAttribute("data-finished", finished);
  const mode = timer.phase === "focus" ? "专注" : "休息";
  const text = finished ? `${mode}时间到` : running ? `${mode}中`
    : time < timer.minutes * 60_000 ? "已暂停" : "准备开始";
  if (timerStatus.textContent !== text) timerStatus.textContent = text;
  phase.disabled = running;
  minutes.disabled = running;
  toggle.textContent = running ? "暂停" : finished ? "重新开始" : text === "已暂停" ? "继续" : "开始";
}

phase.addEventListener("change", () => { minutes.value = phase.value === "focus" ? 25 : 5; });
toggle.addEventListener("click", () => {
  if (!state || busy) return;
  const timer = state.timer;
  const time = remaining(timer);
  if (timer.deadline !== null && time > 0) {
    return change("pause");
  }
  if (!minutes.reportValidity()) return;
  if (time > 0 && time < timer.minutes * 60_000 && timer.phase === phase.value && timer.minutes === minutes.valueAsNumber) {
    return change("resume");
  }
  change("start", { phase: phase.value, minutes: minutes.valueAsNumber });
});
byId("reset").addEventListener("click", () => change("reset", {}, () => {
  phase.value = state.timer.phase;
  minutes.value = state.timer.minutes;
}));

byId("summary").addEventListener("click", async () => {
  if (busy) return;
  model.replaceChildren();
  summaryText.value = "";
  byId("generate").disabled = true;
  byId("summary-save").disabled = true;
  notice(summaryStatus, "正在读取本机模型…");
  summary.showModal();
  try {
    const models = await request("models");
    for (const name of models) model.add(new Option(name, name));
    byId("generate").disabled = !models.length;
    notice(summaryStatus, models.length ? "" : "请先在 Ollama 安装一个本地模型。", !models.length);
  } catch (error) {
    notice(summaryStatus, error.message, true);
  }
});

byId("generate").addEventListener("click", async () => {
  if (busy) return;
  const ids = tasks().slice(0, 60).map((task) => task.id);
  if (!ids.length) return notice(summaryStatus, "当前列表没有可总结的记录", true);
  busy = true;
  sync();
  byId("generate").disabled = true;
  notice(summaryStatus, "本地模型正在生成总结…");
  try {
    summaryText.value = await request("summary", { model: model.value, ids });
    byId("summary-save").disabled = false;
    notice(summaryStatus, "已生成，可修改后保存");
  } catch (error) {
    notice(summaryStatus, error.message, true);
  } finally {
    busy = false;
    byId("generate").disabled = false;
    sync();
  }
});

byId("summary-save").addEventListener("click", () => {
  const chars = Array.from(summaryText.value.trim());
  if (!chars.length) return notice(summaryStatus, "请填写总结内容", true);
  const texts = [];
  for (let start = 0; start < chars.length; start += 1000) {
    texts.push(chars.slice(start, start + 1000).join(""));
  }
  change("add", { texts, idea: true }, () => {
    summary.close();
    search.value = "";
    setFilter("idea");
    notice(status, "已保存为灵感");
  }, summaryStatus);
});

for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => byId(button.dataset.close).close());
}

document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.ctrlKey && event.key === "Enter" && edit.open) {
    event.preventDefault();
    byId("edit-form").requestSubmit();
  } else if (!edit.open && !summary.open && event.ctrlKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    quickText.focus();
  } else if (!sticky && !edit.open && !summary.open && event.ctrlKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    search.focus();
  }
});

window.wtools?.onPluginEnter(refresh);
window.addEventListener("focus", refresh);
setInterval(() => { if (!document.hidden) refresh(); }, 2500);
setInterval(renderTimer, 250);
refresh();
