const byId = (id) => document.getElementById(id);
const systemView = byId("system-view");
const systemContent = byId("system-content");
const systemStatus = byId("system-status");
const refresh = byId("refresh");
const manage = byId("manage");
const back = byId("back");
const work = byId("work");
const publicButton = byId("public");
const profiles = byId("profiles");
const nameRow = byId("name-row");
const name = byId("name");
const content = byId("content");
const contentLabel = byId("content-label");
const remove = byId("remove");
const help = byId("help");
const save = byId("save");
const preview = byId("preview");
const retry = byId("retry");
const status = byId("status");
const review = byId("review");
const reviewStatus = byId("review-status");
const apply = byId("apply");
const cancel = byId("cancel");

let workspace;
let selected = -1;
let pending;
let busy = false;

async function request(op, payload = {}) {
  const response = await fetch("/_atools/hosts", {
    method: "POST",
    body: JSON.stringify({ op, ...payload }),
  });
  if (response.status === 403 || response.status === 404) {
    throw new Error("请在支持 hosts 切换的 WTools 构建中运行当前插件。");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function message(element, text, isError = false) {
  element.textContent = text;
  element.toggleAttribute("data-error", isError);
}

async function loadSystem() {
  if (refresh.disabled) return;
  refresh.disabled = true;
  message(systemStatus, "正在读取本机 hosts…");
  try {
    systemContent.value = await request("current");
    message(systemStatus, "");
  } catch (error) {
    systemContent.value = "";
    message(systemStatus, error.message, true);
  } finally {
    refresh.disabled = false;
  }
}

function showSchemes(show) {
  systemView.hidden = show;
  byId("view-actions").hidden = show;
  work.hidden = !show;
  byId("scheme-actions").hidden = !show;
  byId("scheme-status").hidden = !show;
}

function changed() {
  message(status, "有未保存的更改");
}

function renderProfiles() {
  publicButton.setAttribute("aria-current", String(selected < 0));
  byId("empty").hidden = workspace.profiles.length > 0;
  profiles.replaceChildren(...workspace.profiles.map((profile, index) => {
    const item = document.createElement("li");
    const check = document.createElement("input");
    const edit = document.createElement("button");
    check.type = "checkbox";
    edit.type = "button";
    check.checked = profile.enabled;
    edit.textContent = profile.name || "未命名方案";
    check.setAttribute("aria-label", `合并 ${edit.textContent}`);
    edit.setAttribute("aria-current", String(selected === index));
    check.addEventListener("change", () => {
      profile.enabled = check.checked;
      changed();
    });
    edit.addEventListener("click", () => {
      select(index);
      content.focus();
    });
    item.append(check, edit);
    return item;
  }));
}

function select(index) {
  selected = index;
  const profile = workspace.profiles[index];
  nameRow.hidden = !profile;
  remove.hidden = !profile;
  name.value = profile?.name ?? "";
  content.value = profile ? profile.content : workspace.public;
  contentLabel.textContent = profile ? "hosts 片段" : "公共配置";
  help.textContent = profile
    ? "勾选方案后，它将按列表顺序追加到公共配置。"
    : "首次使用时从系统 hosts 读取。之后可在此编辑公共配置。";
  renderProfiles();
}

function syncControls() {
  work.disabled = !workspace || busy;
  save.disabled = work.disabled;
  preview.disabled = work.disabled;
  back.disabled = busy;
  apply.disabled = busy;
  cancel.disabled = busy;
  retry.disabled = busy;
}

async function run(task, feedback = status) {
  if (busy) return;
  busy = true;
  syncControls();
  try {
    await task();
  } catch (error) {
    message(feedback, error.message, true);
  } finally {
    busy = false;
    syncControls();
  }
}

async function load() {
  if (workspace || busy) return;
  await run(async () => {
    workspace = await request("load");
    retry.hidden = true;
    message(status, "");
    select(-1);
  });
  retry.hidden = Boolean(workspace);
}

refresh.addEventListener("click", loadSystem);
manage.addEventListener("click", async () => {
  showSchemes(true);
  await load();
  back.focus();
});
back.addEventListener("click", () => {
  showSchemes(false);
  manage.focus();
  loadSystem();
});
publicButton.addEventListener("click", () => select(-1));
byId("add").addEventListener("click", () => {
  if (workspace.profiles.length >= 64) {
    message(status, "最多保存 64 套方案", true);
    return;
  }
  const used = new Set(workspace.profiles.map((profile) => profile.name.trim()));
  let number = workspace.profiles.length + 1;
  while (used.has(`方案 ${number}`)) number += 1;
  workspace.profiles.push({ name: `方案 ${number}`, content: "", enabled: false });
  select(workspace.profiles.length - 1);
  changed();
  name.focus();
  name.select();
});

name.addEventListener("input", () => {
  const profile = workspace.profiles[selected];
  if (!profile) return;
  profile.name = name.value;
  const row = profiles.children[selected];
  const label = name.value || "未命名方案";
  row.querySelector("button").textContent = label;
  row.querySelector("input").setAttribute("aria-label", `合并 ${label}`);
  changed();
});

content.addEventListener("input", () => {
  if (selected < 0) workspace.public = content.value;
  else workspace.profiles[selected].content = content.value;
  changed();
});

remove.addEventListener("click", () => {
  if (selected >= 0 && window.confirm("移除这个方案？保存后才会更新方案列表。")) {
    workspace.profiles.splice(selected, 1);
    select(-1);
    changed();
  }
});

save.addEventListener("click", () => run(async () => {
  await request("save", { workspace });
  message(status, "方案已保存");
}));

preview.addEventListener("click", () => run(async () => {
  const draft = structuredClone(workspace);
  const result = await request("preview", { workspace: draft });
  pending = { workspace: draft, expected: result.expected };
  const names = draft.profiles.filter((profile) => profile.enabled).map((profile) => profile.name.trim());
  byId("selection").textContent = names.length
    ? `公共配置 + ${names.join("、")}`
    : "仅写入公共配置";
  const warning = byId("conflicts");
  warning.hidden = !result.conflicts.length;
  warning.textContent = `以下主机名存在同类 IP 地址冲突，请核对后再写入：${result.conflicts.join("、")}`;
  byId("result").value = result.content;
  byId("current").value = result.current;
  review.querySelector("details").open = false;
  message(reviewStatus, "系统可能会请求管理员权限。");
  review.showModal();
  cancel.focus();
}));

apply.addEventListener("click", () => run(async () => {
  message(reviewStatus, "正在写入系统 hosts…");
  await request("apply", pending);
  review.close();
  message(status, "已写入系统 hosts，方案已保存");
}, reviewStatus));

cancel.addEventListener("click", () => review.close());
review.addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
review.addEventListener("close", () => { pending = undefined; });
retry.addEventListener("click", load);
window.wtools?.onPluginEnter(() => {
  if (!systemView.hidden) loadSystem();
});
loadSystem();
