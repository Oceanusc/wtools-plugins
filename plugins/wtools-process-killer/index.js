const get = id => document.getElementById(id);
const service = window.processService;
const host = window.wtools;
const drawer = get('details-drawer');
const killDialog = get('kill-dialog');
const search = get('search');
const sortable = Array.from(document.querySelectorAll('.sort-bar [data-sort]'));
const formatter = new Intl.NumberFormat('zh-CN');

let rows = [];
let query = '';
let sortKey = 'mem';
let ascending = false;
let onlyWithPorts = false;
let active = true;
let timer;
let refreshing;
let selection;
let killTarget;
let killMode = 'stop';
let busy = false;
let awaitingPid;
const iconCache = new Map();

if (service?.platform === 'win32') document.body.classList.add('windows');
if (host?.isDarkColors?.()) document.body.classList.add('dark');

function makeIcon(row) {
  const wrap = document.createElement('div');
  wrap.className = 'proc-icon';
  wrap.setAttribute('aria-hidden', 'true');
  const label = (row.name || '?').replace(/\.exe$/i, '').slice(0, 2).toUpperCase();
  wrap.textContent = label;
  if (row.path && host?.getFileIcon) {
    if (iconCache.has(row.path)) {
      const cached = iconCache.get(row.path);
      if (cached) {
        const img = document.createElement('img');
        img.src = cached;
        wrap.textContent = '';
        wrap.append(img);
      }
    } else {
      Promise.resolve(host.getFileIcon(row.path)).then(src => {
        iconCache.set(row.path, src || '');
        if (!src || !wrap.isConnected) return;
        const img = document.createElement('img');
        img.src = src;
        wrap.textContent = '';
        wrap.append(img);
      }).catch(() => iconCache.set(row.path, ''));
    }
  }
  return wrap;
}

function makeTag(text, className = '') {
  const span = document.createElement('span');
  span.className = className ? `tag-pill ${className}` : 'tag-pill';
  span.textContent = text;
  return span;
}

function makeRow(row) {
  const li = document.createElement('li');
  li.className = 'proc-item';
  if (selection?.row.pid === row.pid && !drawer.hidden) li.classList.add('selected');
  li.dataset.pid = row.pid;
  li.tabIndex = 0;
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', String(selection?.row.pid === row.pid && !drawer.hidden));

  const body = document.createElement('div');
  body.className = 'proc-body';

  const head = document.createElement('div');
  head.className = 'proc-head';
  const name = document.createElement('span');
  name.className = 'proc-name';
  name.textContent = row.name;
  name.title = row.name;

  const tags = document.createElement('div');
  tags.className = 'proc-tags';
  tags.append(makeTag(service.formatBytes(row.mem)));
  if (row.cpu !== null && row.cpu !== undefined) tags.append(makeTag(`CPU ${row.cpu.toFixed(1)}%`));
  tags.append(makeTag(`PID ${row.pid}`));
  for (const { protocol, port } of row.ports.slice(0, 3)) {
    tags.append(makeTag(`${protocol.toLowerCase()} ${port}`, 'port'));
  }
  if (row.ports.length > 3) tags.append(makeTag(`+${row.ports.length - 3}`));

  head.append(name, tags);

  const path = document.createElement('div');
  path.className = 'proc-path';
  path.textContent = row.path || '系统进程 / 路径不可用';
  path.title = row.path || '';

  body.append(head, path);

  const hint = document.createElement('span');
  hint.className = 'proc-hint';
  hint.textContent = '左键关闭 · 右键详情';

  li.append(makeIcon(row), body, hint);
  return li;
}

function render() {
  const candidates = onlyWithPorts ? rows.filter(row => row.ports.length > 0) : rows;
  const visible = service.sortRows(service.filterRows(candidates, query), sortKey, ascending);
  const focusPid = document.activeElement?.closest('.proc-item[data-pid]')?.dataset.pid;
  const target = get('rows');
  target.replaceChildren(...visible.map(makeRow));
  if (focusPid) target.querySelector(`.proc-item[data-pid="${focusPid}"]`)?.focus({ preventScroll: true });

  for (const btn of sortable) {
    btn.setAttribute('aria-sort', btn.dataset.sort === sortKey ? (ascending ? 'ascending' : 'descending') : 'none');
  }
  get('all').setAttribute('aria-pressed', String(!onlyWithPorts));
  get('with-ports').setAttribute('aria-pressed', String(onlyWithPorts));
  get('count').textContent = `显示 ${formatter.format(visible.length)} / ${formatter.format(rows.length)} 个进程`;
  const empty = get('empty');
  empty.textContent = rows.length ? '没有符合条件的进程' : '暂无进程数据';
  empty.hidden = visible.length > 0;
}

function setQuery(input) {
  query = input;
  search.value = input;
  document.querySelector('.list-wrap').scrollTop = 0;
  render();
}

function refresh() {
  if (!service) return;
  if (!refreshing) refreshing = readSnapshot().finally(() => { refreshing = undefined; });
  return refreshing;
}

async function readSnapshot() {
  get('refresh').disabled = true;
  get('status').textContent = '正在刷新…';
  try {
    const snapshot = await service.refresh();
    rows = snapshot.rows;
    render();
    get('status').textContent = snapshot.portWarning || `更新于 ${new Date().toLocaleTimeString('zh-CN')}`;
    if (active && awaitingPid) {
      const row = rows.find(item => item.pid === awaitingPid);
      awaitingPid = undefined;
      if (row) {
        get('rows').querySelector(`.proc-item[data-pid="${row.pid}"]`)?.scrollIntoView({ block: 'nearest' });
        void openDetails(row);
      } else get('status').textContent = '所选进程已退出。';
    }
  } catch {
    get('status').textContent = '读取进程失败，请重试。';
  } finally {
    get('refresh').disabled = false;
  }
}

function updateTimer() {
  clearInterval(timer);
  if (service && active && get('auto-refresh').checked) timer = setInterval(refresh, 4000);
}

function enter({ code, type, payload, option } = {}) {
  active = true;
  sortKey = code === 'netstat' ? 'ports' : 'mem';
  ascending = false;
  onlyWithPorts = false;
  awaitingPid = Number(option?.text?.match(/^\[(\d+)\]/)?.[1]) || undefined;
  const input = (code === 'search' || type === 'regex' || type === 'over') && typeof payload === 'string' ? payload : '';
  if (!service) return;
  if (!service.showInFolder && typeof host?.setSubInput === 'function' && host.setSubInput(({ text }) => setQuery(text), '搜索进程、PID 或端口') !== false) {
    document.body.classList.add('host-search');
    host.setSubInputValue?.(input);
  }
  setQuery(input);
  updateTimer();
  void refresh();
}

function updateDrawer() {
  if (!selection) return;
  const { row, detail } = selection;
  const currentPath = detail?.path || row.path;
  get('detail-command').textContent = detail ? detail.commandLine || '命令行不可用' : selection.error || '正在读取…';
  get('copy-cmd').disabled = !detail?.commandLine || busy;
  get('copy-path').disabled = !currentPath || busy;
  get('show-file').disabled = !currentPath || !(service.showInFolder || host?.shellShowItemInFolder) || busy;
  get('stop').disabled = !row.identity || !detail || busy;
  get('restart').disabled = !detail?.canRestart || busy;
  get('restart').title = detail && !detail.canRestart ? '当前进程的启动信息不可用' : '';
  get('dismiss').disabled = busy;
}

async function openDetails(row) {
  if (busy) return;
  const next = { row, detail: null, error: '' };
  selection = next;
  get('detail-status').textContent = '';
  get('detail-icon').replaceChildren(makeIcon(row));
  get('detail-name').textContent = row.name;
  get('detail-subtitle').textContent = row.path || '系统进程';
  get('detail-pid').textContent = `pid: ${row.pid}`;

  const metrics = get('detail-metrics');
  metrics.replaceChildren();
  const memPill = document.createElement('span');
  memPill.className = 'pill accent';
  memPill.textContent = service.formatBytes(row.mem);
  metrics.append(memPill);
  if (row.cpu !== null && row.cpu !== undefined) {
    const cpuPill = document.createElement('span');
    cpuPill.className = 'pill';
    cpuPill.textContent = `CPU ${row.cpu.toFixed(1)}%`;
    metrics.append(cpuPill);
  }

  const portsBlock = get('detail-ports-block');
  const portsWrap = get('detail-ports');
  portsWrap.replaceChildren();
  portsBlock.hidden = row.ports.length === 0;
  for (const { protocol, port } of row.ports) {
    const p = document.createElement('span');
    p.className = 'pill port';
    p.textContent = `${protocol.toLowerCase()} ${port}`;
    portsWrap.append(p);
  }

  drawer.hidden = false;
  render();
  updateDrawer();
  try {
    next.detail = await service.details(row.pid, row.identity);
  } catch (error) {
    next.error = error.message || '无法读取进程详情。';
  }
  if (selection === next) updateDrawer();
}

function closeDrawer() {
  if (busy) return;
  drawer.hidden = true;
  selection = undefined;
  render();
}

function promptKill(row, mode = 'stop') {
  if (busy) return;
  killTarget = row;
  killMode = mode;
  get('kill-icon').replaceChildren(makeIcon(row));
  get('kill-title').textContent = mode === 'restart' ? `重启「${row.name}」` : `关闭「${row.name}」`;
  get('kill-pid').textContent = `PID ${row.pid} · ${service.formatBytes(row.mem)}`;
  get('kill-message').textContent = mode === 'restart'
    ? '确定要重启该进程吗？当前进程会先被关闭，再按原启动参数重新启动。'
    : '确定要关闭该进程吗？未保存的数据可能会丢失。';
  get('kill-path').textContent = row.path || '';
  get('kill-error').hidden = true;
  get('kill-error').textContent = '';
  get('kill-details').hidden = !drawer.hidden && selection?.row.pid === row.pid;
  get('apply-action').textContent = mode === 'restart' ? '确认重启' : '确认关闭';
  get('apply-action').disabled = !row.identity;
  if (!row.identity) {
    get('kill-error').textContent = '该系统进程受保护或缺少身份标识，无法直接操作。';
    get('kill-error').hidden = false;
  }
  if (!killDialog.open) killDialog.showModal();
  get(row.identity ? 'apply-action' : 'cancel-action').focus();
}

async function copyText(value, successMsg, failMsg) {
  if (!value) return;
  try {
    if (host?.copyText) {
      if (await host.copyText(value) === false) throw new Error();
    } else await navigator.clipboard.writeText(value);
    if (!drawer.hidden) get('detail-status').textContent = successMsg;
    else get('status').textContent = successMsg;
  } catch {
    if (!drawer.hidden) get('detail-status').textContent = failMsg;
    else get('status').textContent = failMsg;
  }
}

get('refresh').addEventListener('click', refresh);
get('auto-refresh').addEventListener('change', updateTimer);
search.addEventListener('input', () => setQuery(search.value));
for (const filter of ['all', 'with-ports']) {
  get(filter).addEventListener('click', () => {
    onlyWithPorts = filter === 'with-ports';
    document.querySelector('.list-wrap').scrollTop = 0;
    render();
  });
}
for (const btn of sortable) {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sort;
    ascending = sortKey === key ? !ascending : key === 'name';
    sortKey = key;
    document.querySelector('.list-wrap').scrollTop = 0;
    render();
  });
}

// Left click -> ask to kill; Right click -> open details drawer
get('rows').addEventListener('click', event => {
  const item = event.target.closest('.proc-item[data-pid]');
  if (!item) return;
  const row = rows.find(r => r.pid === Number(item.dataset.pid));
  if (row) promptKill(row, 'stop');
});
get('rows').addEventListener('contextmenu', event => {
  const item = event.target.closest('.proc-item[data-pid]');
  if (!item) return;
  event.preventDefault();
  const row = rows.find(r => r.pid === Number(item.dataset.pid));
  if (row) void openDetails(row);
});
get('rows').addEventListener('keydown', event => {
  const item = event.target.closest('.proc-item[data-pid]');
  if (!item) return;
  const row = rows.find(r => r.pid === Number(item.dataset.pid));
  if (!row) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    if (event.shiftKey) void openDetails(row);
    else promptKill(row, 'stop');
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    void openDetails(row);
  }
});

get('dismiss').addEventListener('click', closeDrawer);
get('copy-cmd').addEventListener('click', () => copyText(selection?.detail?.commandLine, '已复制命令行。', '无法复制命令行。'));
get('copy-path').addEventListener('click', () => copyText(selection?.detail?.path || selection?.row.path, '已复制进程路径。', '无法复制路径。'));
get('show-file').addEventListener('click', async () => {
  const current = selection;
  if (!current) return;
  try {
    const result = service.showInFolder
      ? await service.showInFolder(current.row.pid, current.row.identity)
      : await host.shellShowItemInFolder(current.detail?.path || current.row.path);
    if (result === false) throw new Error();
  } catch {
    if (selection === current) get('detail-status').textContent = '无法在文件夹中显示该进程。';
  }
});
get('restart').addEventListener('click', () => { if (selection) promptKill(selection.row, 'restart'); });
get('stop').addEventListener('click', () => { if (selection) promptKill(selection.row, 'stop'); });

get('kill-details').addEventListener('click', () => {
  const target = killTarget;
  if (killDialog.open) killDialog.close();
  if (target) void openDetails(target);
});
get('cancel-action').addEventListener('click', () => { if (!busy && killDialog.open) killDialog.close(); });
killDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
killDialog.addEventListener('close', () => { killTarget = undefined; });

get('apply-action').addEventListener('click', async () => {
  if (busy || !killTarget || !killTarget.identity) return;
  const row = killTarget;
  const isRestart = killMode === 'restart';
  busy = true;
  get('apply-action').disabled = true;
  get('cancel-action').disabled = true;
  get('kill-details').disabled = true;
  get('kill-error').hidden = true;
  if (selection) updateDrawer();
  try {
    const newPid = await service.change(row.pid, row.identity, isRestart);
    killDialog.close();
    if (selection?.row.pid === row.pid) closeDrawer();
    await refreshing;
    await refresh();
    get('status').textContent = newPid ? `进程已重启，PID ${newPid}。` : `已关闭进程 ${row.name} (${row.pid})。`;
  } catch (error) {
    get('kill-error').textContent = error.message || '进程操作失败。';
    get('kill-error').hidden = false;
    await refreshing;
    await refresh();
  } finally {
    busy = false;
    get('apply-action').disabled = !killTarget?.identity;
    get('cancel-action').disabled = false;
    get('kill-details').disabled = false;
    if (selection) updateDrawer();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !killDialog.open && !drawer.hidden) {
    event.preventDefault();
    closeDrawer();
    return;
  }
  if (drawer.hidden || !selection || killDialog.open) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    if (!get('copy-path').disabled) get('copy-path').click();
  } else if (mod && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    if (!get('show-file').disabled) get('show-file').click();
  } else if (mod && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (!get('restart').disabled) get('restart').click();
  } else if (event.key === 'Delete' && !get('stop').disabled) {
    event.preventDefault();
    get('stop').click();
  }
});

if (!service) {
  get('status').textContent = '请在 WTools 中运行此插件';
  get('refresh').disabled = true;
  get('auto-refresh').disabled = true;
  for (const control of document.querySelectorAll('.topbar button, .topbar input, .sort-bar button')) control.disabled = true;
} else if (host?.onPluginEnter) {
  host.onPluginEnter(enter);
  host.onPluginOut?.(() => {
    active = false;
    awaitingPid = undefined;
    updateTimer();
    if (!busy && killDialog.open) killDialog.close();
    if (!busy && !drawer.hidden) closeDrawer();
  });
} else enter();
