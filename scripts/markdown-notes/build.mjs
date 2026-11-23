import {cp, mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {minify} from 'terser';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../plugins/wtools-markdown/', import.meta.url));
await mkdir(root + 'vendor/vditor', {recursive:true});
await cp(new URL('node_modules/vditor/dist/', import.meta.url), root + 'vendor/vditor/dist', {recursive:true, filter: p => !p.endsWith('.ts') && !p.includes('\\ts\\') && !p.includes('/ts/')});
// WTools CSP forbids eval. Chart options are data, never executable JavaScript.
for (const entry of ['index','method']) {
  const source=await readFile(new URL('node_modules/vditor/dist/'+entry+'.js',import.meta.url),'utf8');
  const original='return Function("\\\"use strict\\\";return (".concat(text, ")"))();';
  if (!source.includes(original)) throw Error('Vditor chart parser changed; review the CSP patch.');
  const patched=source.replace(original,`var option = JSON.parse(text);
    function lockTooltip(value) {
      if (!value || typeof value !== 'object') return;
      if (value.tooltip && typeof value.tooltip === 'object') value.tooltip.renderMode = 'richText';
      Object.values(value).forEach(lockTooltip);
    }
    lockTooltip(option); return option;`)
    .replace(/e\.innerHTML = ("echarts render error: <br>"\.concat\(error_1\));/g,'e.textContent = $1;');
  await writeFile(root+'vendor/vditor/dist/'+entry+'.js',patched);
  await writeFile(root+'vendor/vditor/dist/'+entry+'.min.js',(await minify(patched)).code);
}
for (const [from,to] of [['html2canvas/dist/html2canvas.min.js','html2canvas.min.js'],['jspdf/dist/jspdf.umd.min.js','jspdf.min.js']]) {
  await copyFile(new URL('node_modules/' + from, import.meta.url),root + 'vendor/' + to);
}
for (const pkg of ['vditor','html2canvas','jspdf']) await copyFile(new URL('node_modules/' + pkg + '/LICENSE', import.meta.url),root + 'vendor/' + pkg + '-LICENSE.txt').catch(async()=>copyFile(new URL('node_modules/' + pkg + '/LICENSE.txt',import.meta.url),root+'vendor/'+pkg+'-LICENSE.txt'));
console.log('Offline editor assets copied.');
