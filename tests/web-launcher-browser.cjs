const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../plugins/wtools-web-launcher');

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 780 } });
    const errors = [], opens = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.wtools = {
        dbStorage: { getItem: key => JSON.parse(localStorage.getItem(key)), setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)) },
        onMainPush: (query, select) => { window.queryPush = query; window.selectPush = select; },
        onPluginEnter: callback => { window.enterPlugin = callback; }
      };
    });
    await page.route('**/_wtools/web-launcher', route => {
      const data = route.request().postDataJSON();
      if (data.op === 'open') opens.push(data.items);
      return route.fulfill({ json: data.op === 'browsers' ? { browsers: [{ id: 'default' }, { id: 'edge' }] } : { opened: data.items.length, failed: [] } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#add-category').click(); await page.locator('#category-name').fill('工作'); await page.locator('#category-form button[type=submit]').click();
    await page.locator('#add-entry').click(); await page.locator('#entry-name').fill('工作台');
    await page.locator('.url-field input').fill('example.com'); await page.locator('.url-field select').selectOption('edge');
    await page.locator('#add-url').click(); await page.locator('.url-field input').nth(1).fill('https://example.org/');
    await page.locator('#entry-form button[type=submit]').click();
    assert.equal(await page.locator('.entry').count(), 1);
    await page.locator('.entry-title').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提交 2'));
    assert.deepEqual(opens[0], [{ url: 'https://example.com/', browser: 'edge' }, { url: 'https://example.org/', browser: 'default' }]);
    await page.locator('.switch-label input').uncheck(); assert.equal(await page.locator('#open-category').isDisabled(), true);
    assert.equal((await page.evaluate(() => window.queryPush({ code: 'web', payload: '网页快开 工作台' }))).length, 0);
    await page.locator('.switch-label input').check(); await page.locator('#category-launch').check();
    assert.equal((await page.evaluate(() => window.queryPush({ code: 'web', payload: '网页快开 工作' }))).length, 2);
    await page.reload(); assert.equal(await page.locator('#categories button').count(), 2);
    await page.getByRole('button', { name: '工作 1', exact: true }).click();
    assert.equal(await page.locator('#category-launch').isChecked(), true);
    assert.equal(await page.locator('.url-line').count(), 2);
    await page.locator('.entry-edit').click(); await page.locator('.url-field input').first().fill('javascript:alert(1)');
    await page.locator('#entry-form button[type=submit]').click(); assert.ok(await page.locator('#editor-error').innerText());
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#editor').isVisible(), false);
    await page.locator('#delete-category').click(); await page.locator('#confirm-delete-category').click();
    assert.equal(await page.locator('#category-title').innerText(), '默认分类'); assert.equal(await page.locator('.entry').count(), 1);
    await page.screenshot({ path: path.resolve(__dirname, '../dist/web-launcher-desktop.png') });
    await page.locator('#ai-tab').click(); assert.equal(await page.locator('.entry').count(), 8);
    await page.screenshot({ path: path.resolve(__dirname, '../dist/web-launcher-ai.png') });
    await page.setViewportSize({ width: 410, height: 570 });
    await page.locator('#web-tab').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => document.querySelector('.switch-label').getBoundingClientRect().right <= document.querySelector('main').getBoundingClientRect().right - 10), true);
    await page.screenshot({ path: path.resolve(__dirname, '../dist/web-launcher-narrow.png') });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.setViewportSize({ width: 1040, height: 780 });
    await page.screenshot({ path: path.resolve(__dirname, '../dist/web-launcher-dark.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: CRUD, per-URL browser, launch payload, enable switch, launcher search, persistence, validation, category deletion, AI tab, 410px layout, dark mode; no page errors.');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
