import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getExt,
  replaceExtension,
  formatBytes,
  hexToRgba,
  computeResizeDimensions,
  computeCropRect,
  computePadLayout,
  encodeBmp,
  encodeIco,
  optimizeSvg,
} from '../plugins/wtools-image-batch/codecs.js';

test('extension and formatting helpers', () => {
  assert.equal(getExt('photo.PNG'), 'png');
  assert.equal(getExt('noext'), '');
  assert.equal(replaceExtension('a.b.png', 'webp'), 'a.b.webp');
  assert.equal(formatBytes(512), '512B');
  assert.equal(formatBytes(1536), '1.50KB');
  assert.equal(formatBytes(1509949), '1.44MB');
});

test('hexToRgba parses 3-char and 6-char hex', () => {
  assert.deepEqual(hexToRgba('#fff', 50), { r: 255, g: 255, b: 255, a: 0.5, css: 'rgba(255, 255, 255, 0.5)' });
  assert.deepEqual(hexToRgba('#4b61dd', 100), { r: 75, g: 97, b: 221, a: 1, css: 'rgba(75, 97, 221, 1)' });
});

test('computeResizeDimensions handles percent and fixed aspect', () => {
  assert.deepEqual(computeResizeDimensions(1000, 500, { mode: 'percent', percent: 50 }), { width: 500, height: 250 });
  assert.deepEqual(computeResizeDimensions(1000, 500, { mode: 'fixed', width: 400, height: 0, keepAspect: true }), { width: 400, height: 200 });
  assert.deepEqual(computeResizeDimensions(1000, 500, { mode: 'fixed', width: 400, height: 400, keepAspect: true }), { width: 400, height: 200 });
  assert.deepEqual(computeResizeDimensions(1000, 500, { mode: 'fixed', width: 400, height: 400, keepAspect: false }), { width: 400, height: 400 });
});

test('computeCropRect crops by aspect ratio and anchor', () => {
  assert.deepEqual(computeCropRect(1600, 1200, 16, 9, 'center'), { x: 0, y: 150, width: 1600, height: 900 });
  assert.deepEqual(computeCropRect(1600, 1200, 1, 1, 'top'), { x: 0, y: 0, width: 1200, height: 1200 });
  assert.deepEqual(computeCropRect(1600, 1200, 1, 1, 'bottom'), { x: 400, y: 0, width: 1200, height: 1200 });
});

test('computePadLayout handles uniform, sides, and ratio', () => {
  assert.deepEqual(computePadLayout(100, 80, { mode: 'uniform', all: 20 }), { width: 140, height: 120, offsetX: 20, offsetY: 20 });
  assert.deepEqual(computePadLayout(100, 80, { mode: 'sides', top: 10, bottom: 20, left: 5, right: 15 }), { width: 120, height: 110, offsetX: 5, offsetY: 10 });
  assert.deepEqual(computePadLayout(100, 80, { mode: 'ratio', ratio: '1:1' }), { width: 100, height: 100, offsetX: 0, offsetY: 10 });
});

test('encodeBmp produces valid 32-bit BMP header and pixel order', () => {
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,   // top-left red
    0, 255, 0, 255,   // top-right green
  ]);
  const bmp = encodeBmp(rgba, 2, 1);
  assert.equal(bmp[0], 0x42);
  assert.equal(bmp[1], 0x4d);
  assert.equal(bmp.length, 54 + 8);
  // First pixel in BGRA: B=0, G=0, R=255, A=255
  assert.deepEqual(Array.from(bmp.slice(54, 58)), [0, 0, 255, 255]);
});

test('encodeIco produces valid ICONDIR header', () => {
  const fakePng = new Uint8Array([137, 80, 78, 71]);
  const ico = encodeIco(fakePng, 256, 128);
  assert.equal(ico.length, 22 + 4);
  assert.equal(ico[2], 1); // type = ICO
  assert.equal(ico[4], 1); // count = 1
  assert.equal(ico[6], 0); // 256 encoded as 0
  assert.equal(ico[7], 128);
});

test('optimizeSvg strips comments and metadata', () => {
  const input = '<?xml version="1.0"?><!-- comment --><svg xmlns="http://www.w3.org/2000/svg"><metadata>x</metadata><rect width="10.12345" height="20"/></svg>';
  const out = optimizeSvg(input, 80);
  assert.ok(!out.includes('comment'));
  assert.ok(!out.includes('metadata'));
  assert.ok(out.includes('10.12'));
});

test('plugin.json has valid manifest and all 14 features', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('plugins/wtools-image-batch/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'wtools-image-batch');
  assert.equal(manifest.features.length, 14);
});
