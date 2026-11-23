import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const root = new URL('../../plugins/wtools-hosts/', import.meta.url);
const initial = { public: '# 公共配置 · 所有环境共用\n# Localhost\n127.0.0.1    localhost\n::1          localhost\n\n# 本地服务\n127.0.0.1    wtools.local\n', profiles: [
  { name: '开发环境', enabled: true, content: '# Development\n127.0.0.1    api.dev.local\n127.0.0.1    app.dev.local\n' },
  { name: '测试环境', enabled: false, content: '# Staging\n192.168.1.20    api.test.local\n' },
  { name: '生产环境', enabled: false, content: '# Production\n10.0.0.10    api.prod.local\n' },
] };
let stored = structuredClone(initial), current = initial.public, calls = [], fail = '', conflicts = [], denied = false;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/_atools/hosts') {
      let body = ''; for await (const chunk of req) body += chunk;
      const data = JSON.parse(body); calls.push(data);
      res.setHeader('Content-Type', 'application/json');
      if (denied) { res.statusCode = 403; res.end('{}'); return; }
      if (fail === data.op) { res.statusCode = 409; res.end(JSON.stringify({ error: '预览后系统 hosts 已被修改，请重新预览再应用。' })); return; }
      let result;
      if (data.op === 'load') result = stored;
      if (data.op === 'current') result = current;
      if (data.op === 'save') { stored = data.workspace; result = null; }
      if (data.op === 'preview') result = { current, content: [data.workspace.public, ...data.workspace.profiles.filter(p => p.enabled).map(p => p.content)].join('\n'), expected: 'mock-current-hash', conflicts };
      if (data.op === 'apply') { assert.equal(data.expected, 'mock-current-hash'); stored = data.workspace; current = [stored.public, ...stored.profiles.filter(p => p.enabled).map(p => p.content)].join('\n'); result = null; }
      res.end(JSON.stringify(result)); return;
    }
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!/^[\w./-]+$/.test(name) || name.includes('..')) throw Error();
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(new URL(name, root)));
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1080, height: 740 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
const waitMessage = text => page.waitForFunction(text => document.querySelector('#status').textContent.includes(text), text);
const edit = value => page.locator('.CodeMirror').evaluate((el, value) => el.CodeMirror.setValue(value), value);
const content = () => page.locator('.CodeMirror').evaluate(el => el.CodeMirror.getValue());
const profile = i => page.locator('.profile-select').nth(i);
const checks = () => page.locator('#profiles input');
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`); await waitMessage('已载入');
  assert.equal(await profile(0).innerText(), '开发环境'); assert.equal(await content(), initial.public);
  assert.equal(calls.some(c => c.op === 'apply'), false);
  await mkdir(new URL('../../dist/hosts-preview/', import.meta.url), { recursive: true });
  await profile(0).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: new URL('../../dist/hosts-preview/light.png', import.meta.url).pathname.slice(1) });
  await page.locator('#settings-button').click(); await page.locator('#theme').selectOption('dark'); await page.locator('[data-close="settings"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: new URL('../../dist/hosts-preview/dark.png', import.meta.url).pathname.slice(1) });
  await edit('# 修改开发配置\n127.0.0.1 edited.local\n');
  await profile(1).click(); await profile(0).click(); assert.match(await content(), /edited.local/);
  await page.keyboard.press('Control+s'); await waitMessage('已保存'); assert.match(stored.profiles[0].content, /edited.local/);
  await checks().nth(1).check(); assert.equal(await checks().nth(0).isChecked(), true);
  await page.locator('#single').click(); assert.equal(await checks().nth(0).isChecked(), true); assert.equal(await checks().nth(1).isChecked(), false);
  await checks().nth(1).check(); assert.equal(await checks().nth(0).isChecked(), false);
  await page.locator('#multiple').click(); await checks().nth(0).check();
  await page.locator('#preview').click(); await page.locator('#review[open]').waitFor();
  assert.match(await page.locator('#result').inputValue(), /edited.local/); assert.match(await page.locator('#result').inputValue(), /api.test.local/);
  fail = 'apply'; await page.locator('#apply').click(); await page.waitForFunction(() => document.querySelector('#review-status').hasAttribute('data-error'));
  assert.equal(await page.locator('#review').evaluate(el => el.open), true);
  fail = ''; await page.locator('#apply').click(); await waitMessage('已写入'); assert.equal(await page.locator('#review').evaluate(el => el.open), false);
  assert.equal(stored.profiles.filter(p => p.enabled).length, 2);
  await page.locator('#system').click(); await waitMessage('重新读取');
  assert.match(await content(), /edited.local/); assert.equal(await page.locator('.CodeMirror').evaluate(el => el.CodeMirror.getOption('readOnly')), true);
  // Double-click includes the selected profile and preserves enabled profiles in multi mode.
  await profile(2).dblclick(); await waitMessage('已写入'); assert.equal(stored.profiles.filter(p => p.enabled).length, 3);
  conflicts = ['api.test.local']; await profile(1).dblclick(); await page.locator('#review[open]').waitFor(); assert.equal(await page.locator('#conflicts').isVisible(), true);
  await page.locator('#review [data-close="review"]').first().click(); conflicts = [];
  await profile(1).click({ button: 'right' }); await page.locator('[data-action="rename"]').click();
  await page.locator('#profile-name').fill('开发环境'); await page.locator('#profile-form button[type="submit"]').click();
  assert.match(await page.locator('#profile-error').innerText(), /已存在/);
  await page.locator('#profile-name').fill('集成测试'); await page.locator('#profile-form button[type="submit"]').click(); assert.equal(await profile(1).innerText(), '集成测试');
  await profile(1).click({ button: 'right' }); await page.locator('[data-action="duplicate"]').click(); assert.equal(await profile(3).innerText(), '集成测试 副本 1');
  await profile(3).click({ button: 'right' }); await page.locator('[data-action="delete"]').click(); await page.locator('#confirm-delete').click(); assert.equal(await profile(0).count(), 1); assert.equal(await page.locator('.profile-select').count(), 3);
  await page.locator('#add').click(); await page.locator('#profile-name').fill('新方案'); await page.locator('#profile-form button[type="submit"]').click();
  await edit('127.0.0.1 new.local'); await page.locator('#settings-button').click(); await page.locator('#vim').check(); await page.locator('[data-close="settings"]').click();
  await page.locator('.CodeMirror').click(); await page.keyboard.press('Escape'); await page.keyboard.type('ggdd');
  assert.equal(await content(), '');
  await page.keyboard.type('i'); await page.keyboard.insertText('127.0.0.1 vim.local'); await page.keyboard.press('Escape');
  await page.keyboard.type(':w'); await page.keyboard.press('Enter'); await waitMessage('已保存'); assert.match(stored.profiles[3].content, /vim.local/);
  await page.reload(); await waitMessage('已载入'); assert.equal(await page.locator('#theme').inputValue(), 'dark'); assert.equal(await page.locator('#vim').isChecked(), true);
  await page.setViewportSize({ width: 600, height: 500 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#preview').isVisible(), true);
  denied = true; await page.reload(); await page.locator('#retry:not([hidden])').waitFor(); assert.equal(await page.locator('#preview').isDisabled(), true); assert.match(await page.locator('#status').innerText(), /已授权/);
  denied = false; stored = { public: initial.public, profiles: [] }; await page.locator('#retry').click(); await waitMessage('已载入'); assert.equal(await page.locator('#empty').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: read-only system view, edit retention, save shortcuts, single/multi select, merge preview, stale-write error, apply, double-click, conflicts, rename validation, duplicate/delete/create, real Vim dd/i/:w, preference persistence, responsive layout, authorization failure/retry, empty state. Native hosts untouched (mock API).');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
