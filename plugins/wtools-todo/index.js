const $ = (id) => document.getElementById(id);
const sticky = Boolean(window.wtoolsTodoSticky || location.hash === "#sticky");
const status = $("status");
const edit = $("edit-dialog");
const summary = $("summary-dialog");
const settings = $("settings-dialog");
const defaults = [
  { id: "pending", name: "待处理" },
  { id: "done", name: "已完成" },
  { id: "idea", name: "灵感" },
];
let prefs = readPrefs();
let state,
  busy = false,
  reading = false,
  version = 0,
  selectedId = null,
  editId = null;
let filter = prefs.filter || "pending";
let board = !sticky && prefs.board === true;
let timerView = false;
let durationDirty = false;
let summaryBusy = false;
function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem("wtools-todo-ui-v2")) || {};
  } catch {
    return {};
  }
}
function savePrefs() {
  try {
    localStorage.setItem("wtools-todo-ui-v2", JSON.stringify(prefs));
  } catch {
    notice(status, "无法保存界面设置，请检查本机存储空间", true);
  }
}
function groups() {
  return [...defaults, ...(Array.isArray(prefs.groups) ? prefs.groups : [])];
}
function groupName(id) {
  return groups().find((g) => g.id === id)?.name || "待处理";
}
function groupFor(task) {
  return prefs.assignments?.[task.id] || (task.idea ? "idea" : "pending");
}
function inGroup(task, id) {
  return id === "done" ? task.done : !task.done && groupFor(task) === id;
}
function tasks(id = filter) {
  const query = $("search").value.trim().toLocaleLowerCase();
  return (state?.tasks || []).filter(
    (t) => inGroup(t, id) && t.text.toLocaleLowerCase().includes(query),
  );
}
function notice(el, text, error = false) {
  el.textContent = text;
  el.toggleAttribute("data-error", error);
}
async function request(op, data = {}) {
  const response = await fetch("/_atools/todo", {
    method: "POST",
    body: JSON.stringify({ op, ...data }),
  });
  if ([403, 404].includes(response.status))
    throw new Error("请使用支持此版本 ToDo 待办的 WTools 构建。");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作失败，请重试");
  return result;
}
function sync() {
  document
    .querySelectorAll(
      "#batch,#sticky,#summary,#board-add,#board-ai,#ai-shortcut,#sticky-shortcut,#sticky-add,#check-all,#show-timer",
    )
    .forEach((el) => (el.disabled = !state || busy));
  $("timer-controls").disabled = !state || busy;
  document
    .querySelectorAll(".task input,#focus-task input")
    .forEach((el) => (el.disabled = !state || busy));
  edit
    .querySelectorAll("button,textarea,select")
    .forEach((el) => (el.disabled = busy));
  $("retry").disabled = busy;
}
function applyState(next) {
  const changed =
    !state || JSON.stringify(state.tasks) !== JSON.stringify(next.tasks);
  const timerChanged = !state || state.timer.minutes !== next.timer.minutes;
  state = next;
  if (timerChanged && !durationDirty) setDuration(state.timer.minutes);
  if (changed) render();
  renderTimer();
  sync();
}
async function refresh() {
  if (reading || busy) return;
  reading = true;
  const previousVersion = version;
  try {
    const next = await request("load");
    if (previousVersion !== version) return;
    if (!state) notice(status, "");
    $("retry").hidden = true;
    applyState(next);
  } catch (error) {
    if (!state) {
      $("empty").textContent = "无法读取待办";
      $("retry").hidden = false;
      notice(status, error.message, true);
    }
  } finally {
    reading = false;
  }
}
async function change(op, data = {}, after = () => {}, feedback = status) {
  if (!state || busy) return;
  busy = true;
  version++;
  sync();
  try {
    const next = await request(op, data);
    applyState(next);
    busy = false;
    sync();
    await after(next);
    notice(status, "");
  } catch (error) {
    notice(feedback, error.message, true);
  } finally {
    busy = false;
    sync();
  }
}
// Small SVGs keep toolbar strokes consistent across fonts and display scaling.
const iconPaths = {
  check: "M5 12l4 4L19 6",
  plus: "M12 4v16M4 12h16",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M5 6h14M5 12h14M5 18h14",
  columns: "M3 4h18v16H3zM9 4v16M15 4v16",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  settings: "M7 3h10l5 9-5 9H7l-5-9zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  sticky:
    "M13 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M15 3h6v6h-6zM7 16l6-6M7 11v5h5",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  ai: "M7 4V2M17 4V2M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2M7 16l2-7 2 7M8 13h2M15 9v7",
};
function svgIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", iconPaths[name] || iconPaths.menu);
  if (name === "more") {
    path.setAttribute("stroke-width", "3.5");
  }
  svg.append(path);
  return svg;
}
function paintIcon(element, name) {
  element.replaceChildren(svgIcon(name));
}
const iconNames = { "＋": "plus", "▱": "sticky", "◷": "clock" };
function icon(text, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  paintIcon(button, iconNames[text] || text);
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}
function taskCard(task) {
  const item = document.createElement("li");
  item.className = "task";
  item.dataset.id = task.id;
  item.classList.toggle("selected", task.id === selectedId);
  item.classList.toggle("done", task.done);
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = task.done;
  check.disabled = busy;
  check.dataset.key = `check-${task.id}`;
  check.setAttribute(
    "aria-label",
    `${task.done ? "标为待处理" : "标为完成"} ${task.text.slice(0, 50)}`,
  );
  check.addEventListener("change", () => {
    const done = check.checked;
    check.checked = task.done;
    change("toggle", { id: task.id, done });
  });
  const text = document.createElement("button");
  text.type = "button";
  text.className = "task-text";
  text.textContent = task.text;
  text.dataset.key = `edit-${task.id}`;
  text.addEventListener("click", () => {
    selectedId = task.id;
    render();
    editTask(task);
  });
  const focus = icon("◷", "专注此任务", () => {
    selectedId = task.id;
    prefs.focusId = task.id;
    savePrefs();
    render();
    openSettings();
  });
  focus.className = "task-focus";
  item.append(check, text, focus);
  return item;
}
function render() {
  if (!groups().some((g) => g.id === filter)) filter = "pending";
  if (selectedId === null) selectedId = tasks()[0]?.id ?? null;
  const focused = document.activeElement?.dataset.key;
  document.body.classList.toggle("board-mode", board);
  $("board").hidden = !board;
  paintIcon($("view-toggle"), board ? "list" : "columns");
  const viewLabel = board ? "切换为列表视图" : "切换为看板视图";
  $("view-toggle").title = viewLabel;
  $("view-toggle").setAttribute("aria-label", viewLabel);
  $("groups").replaceChildren(
    ...groups().map((group) => {
      const button = document.createElement("button");
      button.className = "group-button";
      button.setAttribute("aria-current", String(group.id === filter));
      const grip = document.createElement("span");
      grip.className = "grip";
      paintIcon(grip, "menu");
      grip.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "group-name";
      name.textContent = group.name;
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = (state?.tasks || []).filter((t) =>
        inGroup(t, group.id),
      ).length;
      button.append(grip, name, count);
      button.addEventListener("click", () => setFilter(group.id));
      return button;
    }),
  );
  $("list-title").textContent = groupName(filter);
  $("sticky-group").textContent = groupName(filter);
  const visible = tasks();
  $("tasks").replaceChildren(...visible.map(taskCard));
  $("empty").hidden = visible.length > 0;
  $("empty").textContent = $("search").value
    ? "没有匹配的任务"
    : "当前分组暂无任务";
  $("check-all").checked = visible.length > 0 && visible.every((t) => t.done);
  if (board)
    $("board").replaceChildren(
      ...groups().map((group) => {
        const column = document.createElement("section");
        column.className = "board-column";
        column.classList.toggle("active", filter === group.id);
        const heading = document.createElement("div");
        heading.className = "section-heading";
        const name = document.createElement("button");
        name.className = "column-name";
        name.append(svgIcon("menu"), document.createTextNode(group.name));
        name.addEventListener("click", () => setFilter(group.id));
        const actions = document.createElement("div");
        actions.className = "heading-actions";
        actions.append(
          icon("＋", `添加到${group.name}`, () => editTask(null, group.id)),
          icon("▱", `打开${group.name}桌面便签`, () =>
            openDesktop("list", group.id),
          ),
        );
        heading.append(name, actions);
        const content = document.createElement("div");
        content.className = "column-tasks";
        const ul = document.createElement("ul");
        ul.append(...tasks(group.id).map(taskCard));
        content.append(ul);
        if (!ul.children.length) {
          const empty = document.createElement("p");
          empty.className = "column-empty";
          empty.textContent = $("search").value ? "没有匹配的任务" : "暂无任务";
          content.append(empty);
        }
        column.append(heading, content);
        return column;
      }),
    );
  if (focused)
    [...document.querySelectorAll("[data-key]")]
      .find((el) => el.dataset.key === focused && el.getClientRects().length)
      ?.focus();
  renderFocusTask();
}
function setFilter(id) {
  filter = id;
  prefs.filter = id;
  savePrefs();
  selectedId = tasks()[0]?.id ?? null;
  render();
}
function splitTasks() {
  const text = $("edit-text").value.trim();
  if (!text) return [];
  return text
    .split(/\n\s*\n/.test(text) ? /\n\s*\n/ : /\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}
function updateCount() {
  $("edit-count").replaceChildren();
  if (editId !== null) {
    $("edit-count").textContent = "编辑任务";
    return;
  }
  const number = document.createElement("strong");
  number.textContent = splitTasks().length;
  $("edit-count").append(
    "添加 ",
    number,
    ` 条任务到 ${groupName($("edit-kind").value)}`,
  );
}
function editTask(task = null, group = filter) {
  if (!state || busy) return;
  editId = task?.id ?? null;
  const select = $("edit-kind");
  select.replaceChildren(
    ...groups()
      .filter((g) => g.id !== "done")
      .map((g) => new Option(g.name, g.id)),
  );
  select.value = task ? groupFor(task) : group === "done" ? "pending" : group;
  $("edit-text").value = task?.text || "";
  $("delete").hidden = !task;
  $("editor-tab").hidden = false;
  $("editor-tab").textContent = task ? "编辑任务" : "添加到待办";
  notice($("edit-status"), "");
  updateCount();
  edit.showModal();
  $("edit-text").focus();
}
$("edit-text").addEventListener("input", updateCount);
$("edit-kind").addEventListener("change", updateCount);
edit.addEventListener("close", () => {
  $("editor-tab").hidden = true;
});
$("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("edit-text").value.trim();
  const group = $("edit-kind").value;
  const texts = editId === null ? splitTasks() : [text];
  if (
    !texts.length ||
    texts.length > 50 ||
    texts.some((t) => Array.from(t).length > 1000)
  )
    return notice(
      $("edit-status"),
      "每次可添加 1–50 条，每条内容须为 1–1000 个字符。",
      true,
    );
  const previous = new Set(state.tasks.map((t) => t.id));
  change(
    editId === null ? "add" : "edit",
    editId === null ? { texts, idea: group === "idea" } : { id: editId, text },
    (next) => {
      prefs.assignments ||= {};
      if (editId !== null) prefs.assignments[editId] = group;
      else
        next.tasks
          .filter((t) => !previous.has(t.id))
          .forEach((t) => (prefs.assignments[t.id] = group));
      savePrefs();
      edit.close();
      $("search").value = "";
      setFilter(group);
    },
    $("edit-status"),
  );
});
$("delete").addEventListener("click", () => {
  if (editId !== null && !busy && confirm("删除这条任务？"))
    change(
      "remove",
      { id: editId },
      () => {
        delete prefs.assignments?.[editId];
        savePrefs();
        edit.close();
        render();
      },
      $("edit-status"),
    );
});
$("add-group").addEventListener("click", () => {
  $("group-name").value = "";
  notice($("group-status"), "");
  $("group-dialog").showModal();
  $("group-name").focus();
});
$("group-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("group-name").value.trim();
  if (!name || groups().some((g) => g.name === name))
    return notice($("group-status"), "请输入不重复的分组名称", true);
  if (groups().length >= 24)
    return notice($("group-status"), "最多可创建 24 个分组", true);
  const id = `group-${crypto.randomUUID()}`;
  prefs.groups ||= [];
  prefs.groups.push({ id, name });
  savePrefs();
  $("group-dialog").close();
  setFilter(id);
});
$("view-toggle").addEventListener("click", () => {
  board = !board;
  prefs.board = board;
  savePrefs();
  render();
});
$("search").addEventListener("input", render);
$("retry").addEventListener("click", refresh);
for (const id of ["batch", "board-add", "sticky-add"])
  $(id).addEventListener("click", () => editTask());
function openSettings() {
  $("app-menu").hidden = true;
  $("menu-toggle").setAttribute("aria-expanded", "false");
  if (!durationDirty) setDuration(prefs.minutes || state?.timer.minutes || 25);
  settings.showModal();
}
for (const id of [
  "settings",
  "board-settings",
  "focus-settings",
  "timer-settings",
])
  $(id).addEventListener("click", openSettings);
$("menu-toggle").addEventListener("click", () => {
  $("app-menu").hidden = !$("app-menu").hidden;
  $("menu-toggle").setAttribute("aria-expanded", String(!$("app-menu").hidden));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#menu-toggle,#app-menu")) {
    $("app-menu").hidden = true;
    $("menu-toggle").setAttribute("aria-expanded", "false");
  }
});
function desktopConfig(view, group = filter) {
  return {
    view,
    group,
    theme: prefs.theme || "tomato",
    minutes: prefs.minutes || state?.timer.minutes || 25,
    focusId: prefs.focusId ?? selectedId,
    groups: prefs.groups || [],
    assignments: prefs.assignments || {},
  };
}
async function openDesktop(view = "list", group = filter) {
  if (!state || busy) return;
  try {
    if (sticky) {
      applyDesktopConfig(desktopConfig(view, group));
      return;
    }
    await request("sticky", { config: desktopConfig(view, group) });
    notice(status, view === "timer" ? "已打开桌面番茄钟" : "已打开桌面便签");
  } catch (error) {
    notice(status, error.message, true);
  }
}
for (const id of ["sticky", "sticky-shortcut"])
  $(id).addEventListener("click", () => openDesktop());
function applyDesktopConfig(config) {
  if (!config) return;
  prefs = {
    ...prefs,
    theme: config.theme,
    minutes: config.minutes,
    focusId: config.focusId,
    groups: config.groups,
    assignments: config.assignments,
  };
  filter = config.group || "pending";
  timerView = config.view === "timer";
  document.body.classList.toggle("timer-window", timerView);
  $("timer-panel").hidden = !timerView;
  setTheme(prefs.theme || "tomato");
  render();
}
window.addEventListener("wtools-todo-config", (event) =>
  applyDesktopConfig(event.detail),
);
$("sticky-close").addEventListener("click", () =>
  request("hideSticky").catch((error) => notice(status, error.message, true)),
);
$("timer-close").addEventListener("click", () => {
  if (sticky)
    request("hideSticky").catch((error) => notice(status, error.message, true));
  else {
    $("timer-panel").hidden = true;
  }
});
$("check-all").addEventListener("change", async () => {
  const done = $("check-all").checked;
  for (const task of tasks().filter((t) => t.done !== done)) {
    await change("toggle", { id: task.id, done });
    if (status.hasAttribute("data-error")) break;
  }
});
function renderRange() {
  const range = $("duration");
  const percent =
    ((Number(range.value) - Number(range.min)) /
      (Number(range.max) - Number(range.min))) *
    100;
  range.style.setProperty("--range-progress", `${percent}%`);
}
function setDuration(value) {
  $("minutes").value = value;
  $("duration").value = value;
  renderRange();
}
$("minutes").addEventListener("input", () => {
  durationDirty = true;
  if ($("minutes").checkValidity()) {
    $("duration").value = $("minutes").value;
    renderRange();
  }
});
$("duration").addEventListener("input", () => {
  durationDirty = true;
  $("minutes").value = $("duration").value;
  renderRange();
});
function setTheme(theme) {
  prefs.theme = theme;
  document.body.classList.toggle("digital", theme === "digital");
  document
    .querySelectorAll("[name=theme]")
    .forEach((el) => (el.checked = el.value === theme));
}
for (const radio of document.querySelectorAll("[name=theme]"))
  radio.addEventListener("change", () => {
    setTheme(radio.value);
    savePrefs();
  });
$("show-timer").addEventListener("click", () => {
  if (!$("minutes").reportValidity()) return;
  durationDirty = false;
  prefs.minutes = $("minutes").valueAsNumber;
  savePrefs();
  settings.close();
  openDesktop("timer");
});
function remaining(timer) {
  return Math.max(
    0,
    timer.deadline == null ? timer.remaining : timer.deadline - Date.now(),
  );
}
function renderFocusTask() {
  const task =
    state?.tasks.find((t) => t.id === (prefs.focusId ?? selectedId)) ||
    tasks().find((t) => !t.done);
  const el = $("focus-task");
  el.replaceChildren();
  if (task) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.gap = "14px";
    label.style.alignItems = "center";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = task.done;
    check.disabled = busy;
    check.setAttribute("aria-label", "完成专注任务");
    const span = document.createElement("span");
    span.textContent = task.text;
    check.addEventListener("change", () => {
      const done = check.checked;
      check.checked = task.done;
      change("toggle", { id: task.id, done });
    });
    label.append(check, span);
    el.append(label);
  } else el.textContent = "专注当下，完成一件小事";
}
function renderTimer() {
  if (!state) return;
  const timer = state.timer;
  const time = remaining(timer);
  const running = timer.deadline != null && time > 0;
  const ready = timer.deadline == null && time === timer.minutes * 60000;
  const seconds = ready
    ? (prefs.minutes || timer.minutes) * 60
    : Math.ceil(time / 1000);
  $("clock").textContent = [Math.floor(seconds / 60), seconds % 60]
    .map((p) => String(p).padStart(2, "0"))
    .join(":");
  $("timer-status").textContent =
    time === 0
      ? "专注时间到"
      : running
        ? "专注中"
        : time < timer.minutes * 60000
          ? "已暂停"
          : "准备开始";
  $("toggle-timer").textContent = running
    ? "暂停"
    : time === 0
      ? "重新开始"
      : time < timer.minutes * 60000
        ? "继续"
        : "开始";
  $("reset").disabled = busy || (!running && time === timer.minutes * 60000);
  $("minutes").disabled = running;
  $("duration").disabled = running;
}
$("toggle-timer").addEventListener("click", () => {
  if (!state || busy) return;
  const timer = state.timer;
  const time = remaining(timer);
  if (timer.deadline != null && time > 0) return change("pause");
  if (time > 0 && time < timer.minutes * 60000) return change("resume");
  change("start", { phase: "focus", minutes: prefs.minutes || timer.minutes });
});
$("reset").addEventListener("click", () => change("reset"));
async function openSummary() {
  if (!state || busy || summaryBusy) return;
  $("app-menu").hidden = true;
  $("model").replaceChildren();
  $("summary-text").value = "";
  $("generate").disabled = true;
  $("summary-save").disabled = true;
  notice($("summary-status"), "正在读取本机模型…");
  summary.showModal();
  try {
    const models = await request("models");
    for (const name of models) $("model").add(new Option(name, name));
    $("generate").disabled = !models.length;
    notice(
      $("summary-status"),
      models.length ? "" : "请先在 Ollama 安装一个本地模型。",
      !models.length,
    );
  } catch (error) {
    notice($("summary-status"), error.message, true);
  }
}
for (const id of ["summary", "ai-shortcut", "board-ai"])
  $(id).addEventListener("click", openSummary);
$("generate").addEventListener("click", async () => {
  if (busy || summaryBusy) return;
  const ids = tasks()
    .slice(0, 60)
    .map((t) => t.id);
  if (!ids.length)
    return notice($("summary-status"), "当前分组没有可总结的任务", true);
  summaryBusy = true;
  $("generate").disabled = true;
  $("summary-save").disabled = true;
  notice($("summary-status"), "本地模型正在生成总结…");
  try {
    $("summary-text").value = await request("summary", {
      model: $("model").value,
      ids,
    });
    $("summary-save").disabled = false;
    notice($("summary-status"), "已生成，可修改后保存");
  } catch (error) {
    notice($("summary-status"), error.message, true);
  } finally {
    summaryBusy = false;
    $("generate").disabled = false;
  }
});
$("summary-save").addEventListener("click", () => {
  const chars = Array.from($("summary-text").value.trim());
  if (!chars.length) return notice($("summary-status"), "请填写总结内容", true);
  const texts = [];
  for (let i = 0; i < chars.length; i += 1000)
    texts.push(chars.slice(i, i + 1000).join(""));
  change(
    "add",
    { texts, idea: true },
    () => {
      summary.close();
      $("search").value = "";
      setFilter("idea");
    },
    $("summary-status"),
  );
});
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => {
    if (!busy) $(button.dataset.close).close();
  });
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  const modal = document.querySelector("dialog[open]");
  if (event.ctrlKey && event.key === "Enter" && edit.open) {
    event.preventDefault();
    $("edit-form").requestSubmit();
  } else if (event.ctrlKey && event.key.toLowerCase() === "n" && !modal) {
    event.preventDefault();
    editTask();
  } else if (
    event.ctrlKey &&
    event.key.toLowerCase() === "f" &&
    !modal &&
    !sticky
  ) {
    event.preventDefault();
    $("search").focus();
  }
});
for (const [id, name] of Object.entries({
  "view-toggle": "columns",
  "menu-toggle": "more",
  settings: "settings",
  batch: "plus",
  "ai-shortcut": "ai",
  "sticky-shortcut": "sticky",
  "sticky-add": "plus",
  "sticky-close": "close",
  "board-add": "plus",
  "board-ai": "ai",
  "board-settings": "settings",
  "timer-settings": "settings",
  "timer-close": "close",
}))
  paintIcon($(id), name);
for (const element of document.querySelectorAll(".app-icon,.app-logo"))
  paintIcon(element, "check");
paintIcon(document.querySelector(".drawer-close"), "close");
$("add-group").replaceChildren(
  svgIcon("plus"),
  document.createTextNode("添加分组"),
);
renderRange();
if (sticky) document.body.classList.add("sticky");
setTheme(prefs.theme || "tomato");
if (window.wtoolsTodoConfig) applyDesktopConfig(window.wtoolsTodoConfig);
window.wtools?.onPluginEnter(refresh);
window.addEventListener("focus", refresh);
setInterval(() => {
  if (!document.hidden) refresh();
}, 2500);
setInterval(renderTimer, 250);
refresh();
