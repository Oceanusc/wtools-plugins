import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { parseInput, toTypeScript } from './src/convert.js';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.deepEqual(JSON.parse(JSON.stringify(parseInput('?tag=a&tag=b&q=%E4%B8%AD%E6%96%87&__proto__=safe').value)), { tag: ['a','b'], q: '中文', __proto__: undefined, ...JSON.parse('{"__proto__":"safe"}') });
assert.deepEqual(parseInput('name: test\nitems:\n  - id: 1\n    active: true').value, { name:'test', items:[{id:1,active:true}] });
assert.throws(() => parseInput('{"x":}'));
const generated = toTypeScript([{id:1, title:'a'}, {id:2, enabled:true}, null]);
assert.match(generated, /title\?: string/);
const source = ts.createSourceFile('result.ts', generated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(source.parseDiagnostics.length, 0, generated);
const root = path.resolve(here, '../../plugins/wtools-json-editor');
// Optional integration check against the actual host policy, rather than only
// the plugin's own HTML meta policy. Keep failures visible in host QA.
let hostCsp;
if (process.env.WTOOLS_HOST_CSP === '1') {
  const runtime = await readFile(path.join(process.env.WTOOLS_SOURCE || 'D:/WTools', 'src-tauri/src/plugins/runtime.rs'), 'utf8');
  const match = runtime.match(/const CSP: &str =\s*"([\s\S]*?)";/);
  assert.ok(match, 'Cannot read the WTools host CSP');
  hostCsp = match[1].replace(/\\\r?\n\s*/g, '');
}
const server = createServer(async (req,res) => {
  try { const name = req.url === '/' ? 'index.html' : req.url.slice(1); if (!/^[\w.-]+$/.test(name)) throw Error();
    const data = await readFile(path.join(root, name));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    if (hostCsp) res.setHeader('Content-Security-Policy', hostCsp);
    res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {}) });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:850} });
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#source .cm-content').waitFor();
  const result = () => page.locator('#result .cm-content').innerText();
  const input = async text => {
    await page.locator('#source .cm-content').click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text);
  };
  await page.locator('[data-action="minify"]').click();
  assert.equal(JSON.parse(await result()).project, 'WTools');
  assert.equal((await result()).split('\n').length,1);
  await page.locator('#expression').fill('this.items.filter(x => x.active).map(x => x.name)');
  await page.locator('#run').click(); await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.match(await page.locator('#run-status').innerText(), /运行成功/);
  assert.deepEqual(JSON.parse(await result()),['JSON 格式化','数据转换']);
  await page.locator('#expression').fill('while (true) {}'); await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#run-status').textContent.includes('已中断'));
  await page.locator('#expression').fill('this.items.length'); await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#run-status').textContent.includes('运行成功'));
  assert.equal(JSON.parse(await result()),3);
  await page.locator('#expression').fill('fetch("https://example.com")'); await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.match(await page.locator('#run-status').innerText(), /fetch is not defined/);
  await page.locator('#expression').fill('Promise.resolve(1)'); await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.match(await page.locator('#run-status').innerText(), /不能返回 Promise/);
  await page.locator('#expression').fill('typeof parent + ":" + typeof document'); await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#run-status').textContent.includes('运行成功'));
  assert.equal(JSON.parse(await result()), 'undefined:undefined');
  for (const [expression, expected] of [
    ['return data.items.reduce((sum, item) => sum + item.id, 0)', 6],
    ['data.items.map(({id, ...rest}) => ({...rest, id: id * 2}))[0].id', 2],
    ['data.items?.filter(item => item.active).length ?? 0', 2],
    ['typeof wtools + ":" + typeof localStorage + ":" + typeof fetch', 'undefined:undefined:undefined'],
  ]) {
    await page.locator('#expression').fill(expression); await page.locator('#run').click();
    await page.waitForFunction(()=>!document.querySelector('#run').disabled);
    assert.match(await page.locator('#run-status').innerText(), /运行成功/);
    assert.deepEqual(JSON.parse(await result()), expected);
  }
  await input('<root version="1"><item>A &amp; B</item><item>中文</item></root>'); await page.locator('#format').click();
  assert.deepEqual(JSON.parse(await result()), { root:{'@version':'1', item:['A & B','中文']} });
  await page.locator('[data-action="xml"]').click(); assert.match(await result(), /A &amp; B/);
  await page.locator('#use-result').click(); await page.locator('#format').click();
  assert.deepEqual(JSON.parse(await result()), { root:{'@version':'1',item:['A & B','中文']} });
  await input('name: example\nactive: true\nitems: [1, 2]'); await page.locator('#format').click();
  assert.deepEqual(JSON.parse(await result()),{name:'example',active:true,items:[1,2]});
  await page.locator('[data-action="escape"]').click(); const escaped = await result(); assert.equal(typeof JSON.parse(escaped),'string');
  await input(escaped); await page.locator('[data-action="unescape"]').click(); assert.equal(JSON.parse(await result()).name,'example');
  await input('{"broken":}'); await page.locator('#format').click(); assert.equal(await page.locator('#result-status').getAttribute('data-error'),'');
  await page.locator('#clear').click();
  await page.locator('#source .cm-content').evaluate(el => {
    const transfer = new DataTransfer(); transfer.setData('text/plain','?q=hello+world&tag=a&tag=b');
    el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
  });
  assert.deepEqual(JSON.parse(await result()),{q:'hello world',tag:['a','b']});
  await page.locator('[data-action="typescript"]').click(); assert.match(await result(),/export type Root/);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download').click(); assert.equal((await downloadPromise).suggestedFilename(),'result.ts');
  await page.locator('#example').click();
  await page.locator('#expression').fill('this.items.filter(item => item.active).map(item => item.name)');
  await page.waitForTimeout(5100);
  await page.screenshot({path:path.join(here,'preview.png'),fullPage:true});
  await page.setViewportSize({width:700,height:600});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  // Also verify the plugin works when opened directly without a web server.
  await page.goto('file:///' + path.join(root, 'index.html').replaceAll('\\','/'));
  await page.locator('#expression').fill('this.items.length'); await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#run-status').textContent.includes('运行成功'));
  assert.equal(JSON.parse(await result()),3);
  console.log('PASS: conversion, TypeScript, editor actions, paste, filter sandbox/timeout, download, responsive layout, file://');
} finally { await browser.close(); server.close(); }
