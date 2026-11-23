const $ = id => document.getElementById(id);
let workspace, selected = -1, busy = false, loadingEditor = false, pending;
let saved = '', applied = '', systemText = '', systemError = '', systemLoading = false;
let menuIndex = -1, renameIndex = -1, deleteIndex = -1;
const documents = new Map();
function readPref(key, fallback) { try { return localStorage.getItem(`hosts.${key}`) ?? fallback; } catch { return fallback; } }
function pref(key, value) { try { localStorage.setItem(`hosts.${key}`, value); } catch {} }
let mode = readPref('mode', 'multiple');
if (!['single', 'multiple'].includes(mode)) mode = 'multiple';
const theme = readPref('theme', 'auto');
$('theme').value = ['light', 'dark'].includes(theme) ? theme : 'auto';
document.documentElement.dataset.theme = $('theme').value;
$('vim').checked = readPref('vim', 'false') === 'true';
CodeMirror.defineMode('hosts', () => ({ token(stream) {
  if (stream.eatSpace()) return null;
  if (stream.match('#')) { stream.skipToEnd(); return 'comment'; }
  if (stream.match(/(?:[0-9a-fA-F]*:[0-9a-fA-F:.]+|\d{1,3}(?:\.\d{1,3}){3})(?=\s|$)/)) return 'number';
  stream.match(/[^\s#]+/) || stream.next(); return 'string';
} }));
const editor = CodeMirror.fromTextArea($('content'), {
  mode: 'hosts', lineNumbers: true, styleActiveLine: true, lineWrapping: false,
  readOnly: true, keyMap: $('vim').checked ? 'vim' : 'default',
  extraKeys: { 'Ctrl-S': () => save(), 'Cmd-S': () => save(), 'Ctrl-Enter': () => preview(), 'Cmd-Enter': () => preview() },
});
editor.getInputField().setAttribute('aria-label', 'hosts 内容');
CodeMirror.commands.save = () => save();
CodeMirror.Vim.defineEx('write', 'w', () => save());
function position() {
  const p = editor.getCursor();
  $('cursor').textContent = `行 ${p.line + 1}，列 ${p.ch + 1}`;
  $('line-count').textContent = `${editor.lineCount()} 行`;
}
editor.on('cursorActivity', position);
editor.on('vim-mode-change', event => { $('vim-state').textContent = `VIM · ${event.mode.toUpperCase()}`; });
$('vim-state').hidden = !$('vim').checked;
new ResizeObserver(() => editor.refresh()).observe($('editor-container'));
function message(text, error = false, target = $('status')) {
  target.textContent = text; target.toggleAttribute('data-error', error);
}
async function request(op, payload = {}) {
  const response = await fetch('/_atools/hosts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...payload }) });
  if ([403, 404].includes(response.status)) throw new Error('请在已授权此版本 hosts 插件的 WTools 构建中运行。');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败，请重试。');
  return result;
}
const snapshot = () => JSON.stringify(workspace);
function renderSummary() {
  if (!workspace) return;
  const enabled = workspace.profiles.filter(p => p.enabled);
  $('merge-title').textContent = enabled.length ? `公共配置 + ${enabled.length} 个方案` : '仅公共配置';
  $('merge-description').textContent = enabled.length ? enabled.map(p => p.name).join('、') : '所有方案均未启用，将仅写入公共配置';
  $('merge-description').title = $('merge-description').textContent;
  $('dirty').hidden = snapshot() === saved;
  $('applied-state').textContent = !applied ? '尚未在本次会话应用' : applied === snapshot() ? '✓ 已应用当前配置' : '配置已更改，待应用';
}
function controls() {
  const disabled = !workspace || busy;
  for (const id of ['save', 'preview', 'public', 'add', 'empty-add', 'single', 'multiple', 'more']) $(id).disabled = disabled;
  for (const el of $('profiles').querySelectorAll('button,input')) el.disabled = disabled;
  for (const el of $('review').querySelectorAll('button')) el.disabled = busy;
  $('retry').disabled = busy;
  editor.setOption('readOnly', disabled || selected === -2);
  $('refresh').disabled = systemLoading || busy;
}
async function run(task, feedback = $('status')) {
  if (busy) return;
  busy = true; closeMenu(); controls();
  try { await task(); } catch (e) { message(e.message, true, feedback); }
  finally { busy = false; controls(); renderSummary(); }
}
function changed() { renderSummary(); message('有未保存的更改'); }
editor.on('change', () => {
  position();
  if (loadingEditor || !workspace || selected === -2) return;
  if (selected === -1) workspace.public = editor.getValue();
  else workspace.profiles[selected].content = editor.getValue();
  changed();
});
function renderProfiles() {
  if (!workspace) return;
  $('public').setAttribute('aria-current', String(selected === -1));
  $('system').setAttribute('aria-current', String(selected === -2));
  $('single').setAttribute('aria-pressed', String(mode === 'single'));
  $('multiple').setAttribute('aria-pressed', String(mode === 'multiple'));
  $('profile-count').textContent = workspace.profiles.length;
  $('empty').hidden = workspace.profiles.length > 0;
  $('profiles').replaceChildren(...workspace.profiles.map((profile, index) => {
    const li = document.createElement('li'), check = document.createElement('input'), button = document.createElement('button'), more = document.createElement('button');
    check.type = mode === 'single' ? 'radio' : 'checkbox'; check.name = 'enabled-profile'; check.checked = profile.enabled;
    check.setAttribute('aria-label', `启用 ${profile.name}`);
    check.addEventListener('change', () => { enable(index, check.checked); renderProfiles(); controls(); });
    button.className = 'profile-select'; button.textContent = profile.name; button.title = profile.name;
    button.setAttribute('aria-current', String(selected === index));
    button.addEventListener('click', () => select(index));
    button.addEventListener('dblclick', () => quickApply(index));
    more.className = 'icon-button profile-menu'; more.textContent = '···'; more.setAttribute('aria-label', `管理 ${profile.name}`);
    more.addEventListener('click', () => { const r = more.getBoundingClientRect(); openMenu(index, r.right, r.bottom); });
    li.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(index, e.clientX, e.clientY); });
    li.append(check, button, more); return li;
  }));
  renderSummary();
}
function select(index) {
  if (!workspace || busy) return;
  selected = index;
  const profile = workspace.profiles[index], system = index === -2;
  const title = system ? '系统 hosts' : profile?.name ?? '公共配置';
  $('breadcrumb').textContent = $('editor-title').textContent = title;
  $('filename').textContent = system ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : `${title}.hosts`;
  $('editor-description').textContent = system ? '当前系统实际生效的内容，可重新读取以查看外部修改。' : profile ? '独立的 hosts 片段。勾选启用后，与公共配置合并。' : '首次使用时读取系统 hosts，作为所有方案的基础。';
  $('readonly').hidden = !system; $('refresh').hidden = !system; $('editor-kind').hidden = system;
  $('editor-kind').textContent = profile ? '自定义方案' : '基础配置';
  $('more').hidden = !profile;
  let doc = documents.get(system ? 'system' : profile ?? 'public');
  const value = system ? systemText : profile?.content ?? workspace.public;
  if (!doc) { doc = new CodeMirror.Doc(value, 'hosts'); documents.set(system ? 'system' : profile ?? 'public', doc); }
  loadingEditor = true; editor.swapDoc(doc); loadingEditor = false;
  if (editor.getValue() !== value) { loadingEditor = true; editor.setValue(value); loadingEditor = false; }
  position(); renderProfiles(); controls();
  if (systemError && system) message(systemError, true);
}
function enable(index, checked = true) {
  if (mode === 'single' && checked) workspace.profiles.forEach((p, i) => { p.enabled = i === index; });
  else workspace.profiles[index].enabled = checked;
  changed();
}
async function loadSystem() {
  if (systemLoading) return;
  systemLoading = true; controls();
  try {
    systemText = await request('current'); systemError = ''; documents.delete('system');
    if (selected === -2 && workspace && !busy) { select(-2); message('已重新读取系统 hosts'); }
  } catch (e) { systemError = e.message; if (selected === -2) message(e.message, true); }
  finally { systemLoading = false; controls(); }
}
async function load() {
  if (workspace) return;
  await run(async () => {
    const loaded = await request('load'); workspace = loaded; saved = snapshot();
    // Preserve existing multi-selection when loading an older workspace.
    if (workspace.profiles.filter(p => p.enabled).length > 1) { mode = 'multiple'; pref('mode', mode); }
    message('方案已载入');
  });
  $('retry').hidden = !!workspace;
  if (workspace) select(-1);
}
async function save() {
  if (!workspace || busy) return;
  await run(async () => { await request('save', { workspace }); saved = snapshot(); message('✓ 所有方案已保存'); });
}
async function writePending() {
  await request('apply', pending);
  saved = JSON.stringify(pending.workspace); applied = saved;
  systemText = $('result').value; systemError = ''; documents.delete('system');
  $('review').close(); pending = undefined;
  message('✓ 已写入系统 hosts，方案已保存');
}
async function preview(quick = false) {
  if (!workspace || busy) return;
  await run(async () => {
    const draft = structuredClone(workspace), result = await request('preview', { workspace: draft });
    pending = { workspace: draft, expected: result.expected };
    $('selection').textContent = ['公共配置', ...draft.profiles.filter(p => p.enabled).map(p => p.name)].join(' + ');
    $('result').value = result.content; $('current').value = result.current;
    $('conflicts').hidden = !result.conflicts.length;
    $('conflicts').textContent = `以下主机名存在同类 IP 地址冲突，请核对：${result.conflicts.join('、')}`;
    $('review').querySelector('details').open = false;
    message('系统可能会请求管理员权限。', false, $('review-status'));
    if (quick && !result.conflicts.length) {
      message('正在写入系统 hosts…');
      try { await writePending(); } catch (e) { pending = undefined; throw e; }
    } else { $('review').showModal(); }
  });
}
async function quickApply(index) {
  if (busy || !workspace) return;
  select(index); enable(index); renderProfiles();
  await preview(true);
}
function closeMenu() { $('context-menu').hidden = true; }
function openMenu(index, x, y) {
  if (busy) return;
  menuIndex = index;
  const menu = $('context-menu'); menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  menu.querySelector('button').focus();
}
function profileDialog(index = -1) {
  if (!workspace || busy) return;
  if (index < 0 && workspace.profiles.length >= 64) return message('最多保存 64 套方案', true);
  renameIndex = index; $('profile-dialog-title').textContent = index < 0 ? '新建方案' : '重命名方案';
  $('profile-name').value = workspace.profiles[index]?.name ?? ''; $('profile-error').textContent = '';
  $('profile-dialog').showModal(); $('profile-name').focus(); $('profile-name').select();
}
$('profile-form').addEventListener('submit', e => {
  e.preventDefault(); if (busy) return;
  const name = $('profile-name').value.trim();
  if (!name || /[\x00-\x1f\x7f]/.test(name) || [...name].length > 80) { $('profile-error').textContent = '请输入有效的方案名称（最多 80 个字符）'; return; }
  if (workspace.profiles.some((p, i) => i !== renameIndex && p.name.trim().toLowerCase() === name.toLowerCase())) { $('profile-error').textContent = '方案名称已存在'; return; }
  let index = renameIndex;
  if (index < 0) { workspace.profiles.push({ name, content: '# 在下方添加 IP 地址和域名\n', enabled: false }); index = workspace.profiles.length - 1; }
  else workspace.profiles[index].name = name;
  $('profile-dialog').close(); select(index); changed(); editor.focus();
});
$('context-menu').addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action || busy || !workspace?.profiles[menuIndex]) return;
  const index = menuIndex; closeMenu();
  if (action === 'apply') quickApply(index);
  if (action === 'rename') profileDialog(index);
  if (action === 'duplicate') {
    if (workspace.profiles.length >= 64) return message('最多保存 64 套方案', true);
    const p = workspace.profiles[index]; let number = 1, name;
    do { name = `${[...p.name].slice(0, 65).join('')} 副本 ${number++}`; } while (workspace.profiles.some(p => p.name.toLowerCase() === name.toLowerCase()));
    workspace.profiles.push({ ...p, name, enabled: false }); select(workspace.profiles.length - 1); changed();
  }
  if (action === 'delete') { deleteIndex = index; $('delete-description').textContent = `确定删除「${workspace.profiles[index].name}」？`; $('delete-dialog').showModal(); }
});
$('confirm-delete').addEventListener('click', () => {
  if (busy || !workspace.profiles[deleteIndex]) return;
  documents.delete(workspace.profiles[deleteIndex]); workspace.profiles.splice(deleteIndex, 1);
  $('delete-dialog').close(); select(-1); changed();
});
for (const id of ['single', 'multiple']) $(id).addEventListener('click', () => {
  if (busy || !workspace) return;
  mode = id; pref('mode', mode);
  if (mode === 'single') {
    const enabled = workspace.profiles.filter(p => p.enabled);
    if (enabled.length > 1) { const keep = workspace.profiles[selected]?.enabled ? workspace.profiles[selected] : enabled[0]; workspace.profiles.forEach(p => { p.enabled = p === keep; }); changed(); }
  }
  renderProfiles(); controls();
});
$('system').addEventListener('click', () => { if (!busy && workspace) { select(-2); loadSystem(); } });
$('public').addEventListener('click', () => select(-1));
$('refresh').addEventListener('click', loadSystem);
$('retry').addEventListener('click', load);
for (const id of ['add', 'empty-add']) $(id).addEventListener('click', () => profileDialog());
$('more').addEventListener('click', () => { const r = $('more').getBoundingClientRect(); openMenu(selected, r.right, r.bottom); });
$('save').addEventListener('click', save);
$('preview').addEventListener('click', () => preview());
$('apply').addEventListener('click', () => { if (pending) run(async () => { message('正在写入系统 hosts…', false, $('review-status')); await writePending(); }, $('review-status')); });
for (const id of ['settings', 'help']) $(`${id}-button`).addEventListener('click', () => $(id).showModal());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { if (!busy) $(b.dataset.close).close(); }));
$('review').addEventListener('cancel', e => { if (busy) e.preventDefault(); });
$('review').addEventListener('close', () => { pending = undefined; });
$('theme').addEventListener('change', () => { document.documentElement.dataset.theme = $('theme').value; pref('theme', $('theme').value); });
$('vim').addEventListener('change', () => { editor.setOption('keyMap', $('vim').checked ? 'vim' : 'default'); $('vim-state').hidden = !$('vim').checked; $('vim-state').textContent = 'VIM · NORMAL'; pref('vim', String($('vim').checked)); });
document.addEventListener('pointerdown', e => { if (!$('context-menu').contains(e.target)) closeMenu(); });
window.addEventListener('resize', closeMenu);
document.addEventListener('keydown', e => {
  if (!$('context-menu').hidden) {
    const items = [...$('context-menu').querySelectorAll('button')];
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); items[(items.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (e.key === 'Escape') { closeMenu(); if (menuIndex >= 0) $('profiles').children[menuIndex]?.querySelector('button').focus(); }
  }
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key.toLowerCase() === 's' || e.key === 'Enter') {
    e.preventDefault(); if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter') preview(); else save();
  }
}, true);
window.addEventListener('beforeunload', e => { if (workspace && snapshot() !== saved) { e.preventDefault(); e.returnValue = ''; } });
window.wtools?.onPluginEnter(() => { if (selected === -2) loadSystem(); });
controls(); loadSystem(); load();
