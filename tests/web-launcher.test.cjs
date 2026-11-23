const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebLauncher: m } = require('../plugins/wtools-web-launcher/model.js');

test('normalize bare domains and reject executable or credential URLs', () => {
  assert.equal(m.normalizeUrl('example.com/a?q=中文'), 'https://example.com/a?q=%E4%B8%AD%E6%96%87');
  for (const value of ['', 'javascript:alert(1)', 'file:///C:/Windows', 'https://user:pass@example.com', 'https://a.com/\n--flag']) assert.throws(() => m.normalizeUrl(value));
});
test('batch launches include enabled entries, preserve browser choices and deduplicate', () => {
  const a = { url: 'https://example.com/', browser: 'default' };
  const b = { ...a, browser: 'edge' };
  assert.deepEqual(m.launchItems([{ enabled: true, urls: [a, a, b] }, { enabled: false, urls: [{ url: 'https://disabled.com/', browser: 'chrome' }] }]), [a, b]);
  assert.throws(() => m.launchItems([{ enabled: false, urls: [a] }]));
  assert.throws(() => m.launchItems([{ enabled: true, urls: Array.from({ length: 101 }, (_, i) => ({ ...a, url: `https://example.com/${i}` })) }]));
});
test('saved data round trips and rejects orphan categories and unknown browsers', () => {
  const data = m.initialState();
  assert.deepEqual(m.validateState(JSON.parse(JSON.stringify(data))), data);
  const orphan = structuredClone(data); orphan.entries[0].category = 'deleted';
  assert.throws(() => m.validateState(orphan));
  const command = structuredClone(data); command.entries[0].urls[0].browser = 'powershell';
  assert.throws(() => m.validateState(command));
});
