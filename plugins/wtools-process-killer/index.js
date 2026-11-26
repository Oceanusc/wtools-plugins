const get = id => document.getElementById(id);
const service = window.processService;
const host = window.wtools;
const dialog = get('details');
const search = get('search');
const sortable = Array.from(document.querySelectorAll('[data-sort]'));
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
let awaitingPid;
let action;
let busy = false;

if (service?.platform === 'win32') document.body.classList.add('windows');
if (host?.isDarkColors?.()) document.body.classList.add('dark');

function textCell(value, className) {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function portBadges(ports, limit = ports.length) {
  const fragment = document.createDocumentFragment();
  if (ports.length === 0) fragment.append('—');
  for (const { protocol, port } of ports.slice(0, limit)) {
    const badge = document.createElement('span');
    badge.className = 'port';
    badge.textContent = `${protocol} ${port}`;
    fragment.append(badge);
  }
  if (ports.length > limit) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = '+' + (ports.length - limit);
    fragment.append(more);
  }
  return fragment;
}

function makeRow(row) {
  const tr = document.createElement('tr');
  tr.dataset.pid = row.pid;
  const label = textCell('', 'process-name');
  const name = document.createElement('strong');
  name.textContent = row.name;
  name.title = row.name;
  label.append(name);
  if (row.path) {
    const location = document.createElement('small');
    location.textContent = row.path;
    location.title = row.path;
    label.append(location);
  }
  const ports = textCell('', 'ports-cell');
  const portList = document.createElement('div');
  portList.className = 'ports';
  portList.append(portBadges(row.ports, 2));
  ports.append(portList);
  const detailsCell = textCell('', 'row-actions');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button row-button';
  button.textContent = '详情';
  button.setAttribute('aria-label', `查看 ${row.name}，PID ${row.pid}`);
  detailsCell.append(button);
  tr.append(label, textCell(row.pid, 'number'), ports, textCell(service.formatBytes(row.mem), 'number'),
    textCell(row.cpu === null ? '—' : row.cpu.toFixed(1) + '%', 'number cpu'), detailsCell);
  return tr;
}

function render() {
  const candidates = onlyWithPorts ? rows.filter(row => row.ports.length > 0) : rows;
  const visible = service.sortRows(service.filterRows(candidates, query), sortKey, ascending);
  const focusPid = document.activeElement?.closest('tr[data-pid]')?.dataset.pid;
  const target = get('rows');
  target.replaceChildren(...visible.map(makeRow));
  if (focusPid) target.querySelector(`[data-pid="${focusPid}"] button`)?.focus({ preventScroll: true });

  for (const heading of sortable) {
    heading.setAttribute('aria-sort', heading.dataset.sort === sortKey ? (ascending ? 'ascending' : 'descending') : 'none');
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
  document.querySelector('.list').scrollTop = 0;
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
        get('rows').querySelector(`[data-pid="${row.pid}"]`)?.scrollIntoView({ block: 'nearest' });
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

function updateDialog() {
  const { row, detail } = selection;
  const currentPath = detail?.path || row.path;
  get('detail-path').textContent = currentPath || '路径不可用';
  get('detail-command').textContent = detail ? detail.commandLine || '命令行不可用' : selection.error || '正在读取…';
  get('copy-path').disabled = !currentPath || busy;
  get('show-file').disabled = !currentPath || !(service.showInFolder || host?.shellShowItemInFolder) || busy;
  get('stop').disabled = !row.identity || !detail || busy;
  get('restart').disabled = !detail?.canRestart || busy;
  get('restart').title = detail && !detail.canRestart ? '当前进程的启动信息不可用' : '';
  get('apply-action').disabled = busy;
  get('cancel-action').disabled = busy;
  get('dismiss').disabled = busy;
}

async function openDetails(row) {
  if (busy) return;
  const next = { row, detail: null, error: '' };
  selection = next;
  action = undefined;
  get('confirm').hidden = true;
  get('detail-status').textContent = '';
  get('detail-name').textContent = row.name;
  get('detail-pid').textContent = 'PID ' + row.pid;
  get('detail-ports').replaceChildren(portBadges(row.ports));
  updateDialog();
  if (!dialog.open) dialog.showModal();
  try {
    next.detail = await service.details(row.pid, row.identity);
  } catch (error) {
    next.error = error.message || '无法读取进程详情。';
  }
  if (selection === next) updateDialog();
}

function confirmAction(restart) {
  action = restart ? 'restart' : 'stop';
  get('confirm-message').textContent = restart
    ? '此操作会关闭当前进程，再使用已读取的启动参数启动。'
    : '此操作会关闭当前进程，未保存的内容可能丢失。';
  get('apply-action').textContent = restart ? '确认重启' : '确认关闭';
  get('confirm').hidden = false;
  get('cancel-action').focus();
}

get('refresh').addEventListener('click', refresh);
get('auto-refresh').addEventListener('change', updateTimer);
search.addEventListener('input', () => setQuery(search.value));
for (const filter of ['all', 'with-ports']) {
  get(filter).addEventListener('click', () => {
    onlyWithPorts = filter === 'with-ports';
    document.querySelector('.list').scrollTop = 0;
    render();
  });
}
for (const heading of sortable) {
  heading.querySelector('button').addEventListener('click', () => {
    const key = heading.dataset.sort;
    ascending = sortKey === key ? !ascending : key === 'name';
    sortKey = key;
    document.querySelector('.list').scrollTop = 0;
    render();
  });
}
get('rows').addEventListener('click', event => {
  const button = event.target.closest('button');
  const row = rows.find(item => item.pid === Number(button?.closest('tr')?.dataset.pid));
  if (row) void openDetails(row);
});
get('dismiss').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
});
dialog.addEventListener('close', () => {
  if (!dialog.open) selection = undefined;
});

get('copy-path').addEventListener('click', async () => {
  const current = selection;
  const value = current.detail?.path || current.row.path;
  let message = '已复制进程路径。';
  try {
    if (host?.copyText) {
      if (await host.copyText(value) === false) throw new Error();
    } else await navigator.clipboard.writeText(value);
  } catch {
    message = '无法复制路径。';
  }
  if (selection === current) get('detail-status').textContent = message;
});
get('show-file').addEventListener('click', async () => {
  const current = selection;
  try {
    const result = service.showInFolder
      ? await service.showInFolder(current.row.pid, current.row.identity)
      : await host.shellShowItemInFolder(current.detail?.path || current.row.path);
    if (result === false) throw new Error();
  } catch {
    if (selection === current) get('detail-status').textContent = '无法在文件夹中显示该进程。';
  }
});
get('restart').addEventListener('click', () => confirmAction(true));
get('stop').addEventListener('click', () => confirmAction(false));
get('cancel-action').addEventListener('click', () => {
  get('confirm').hidden = true;
  get(action).focus();
  action = undefined;
});
get('apply-action').addEventListener('click', async () => {
  if (busy || !selection || !action) return;
  const row = selection.row;
  busy = true;
  updateDialog();
  get('detail-status').textContent = '正在处理…';
  try {
    const newPid = await service.change(row.pid, row.identity, action === 'restart');
    dialog.close();
    await refreshing;
    await refresh();
    get('status').textContent = newPid ? `进程已重启，PID ${newPid}。` : `已关闭进程 ${row.pid}。`;
  } catch (error) {
    get('detail-status').textContent = error.message || '进程操作失败。';
    get('confirm').hidden = true;
    await refreshing;
    await refresh();
  } finally {
    busy = false;
    if (selection) updateDialog();
  }
});

if (!service) {
  get('status').textContent = '请在 WTools 中运行此插件';
  get('refresh').disabled = true;
  get('auto-refresh').disabled = true;
  for (const control of document.querySelectorAll('.filters button, .filters input, th button')) control.disabled = true;
} else if (host?.onPluginEnter) {
  host.onPluginEnter(enter);
  host.onPluginOut?.(() => {
    active = false;
    awaitingPid = undefined;
    updateTimer();
    if (!busy && dialog.open) dialog.close();
  });
} else enter();
