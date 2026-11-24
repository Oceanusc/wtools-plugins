import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { parseInput, toXML, toTypeScript } from './convert.js';
import runnerCode from './filter-runner.txt';

const $ = id => document.getElementById(id);
const sample = { project: 'WTools', description: '让数据，清晰有序。', version: '1.0.0', items: [
  { id: 1, name: 'JSON 格式化', category: 'development', active: true },
  { id: 2, name: '数据转换', category: 'productivity', active: true },
  { id: 3, name: '灵感收集', category: 'productivity', active: false }
], meta: { total: 3, formats: ['JSON', 'XML', 'YAML'], updatedAt: '2026-11-24' } };
const colors = HighlightStyle.define([
  { tag: tags.propertyName, color: '#9b5681' }, { tag: tags.string, color: '#3b8b78' },
  { tag: tags.number, color: '#c08a49' }, { tag: [tags.bool, tags.null], color: '#8071c7' },
  { tag: tags.punctuation, color: '#8a95a8' }
]);
const sourceIndent = new Compartment(), resultLanguage = new Compartment(), wrapSource = new Compartment();
let outputType = 'JSON', suppress = false, validationTimer, toastTimer, frame, pendingRun, runTimer, runVersion = 0;
const setText = (view, text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
const size = text => `${new TextEncoder().encode(text).length.toLocaleString()} B · ${text.split('\n').length.toLocaleString()} 行`;
function message(text, error = false) { $('message').textContent = text; $('message').hidden = false; $('message').toggleAttribute('data-error', error); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('message').hidden = true, 5000); }
function status(id, text, error = false) { $(id).textContent = text; $(id).toggleAttribute('data-error', error); }
const source = new EditorView({ parent: $('source'), state: EditorState.create({ doc: JSON.stringify(sample, null, 2), extensions: [basicSetup, json(), syntaxHighlighting(colors), sourceIndent.of(indentUnit.of('  ')), wrapSource.of([]), keymap.of([indentWithTab]), EditorView.contentAttributes.of({ 'aria-label': '源数据编辑器' }), EditorView.updateListener.of(update => {
  if (!update.docChanged) return;
  $('source-size').textContent = size(source.state.doc.toString());
  if (!suppress) {
    cancelRun();
    status('result-status', '源数据已修改，重新处理以更新结果');
    clearTimeout(validationTimer); validationTimer = setTimeout(validate, 250);
  }
}), EditorView.domEventHandlers({ paste(event, view) {
  if (!$('auto').checked) return false;
  const text = event.clipboardData?.getData('text/plain');
  if (!text || (view.state.doc.length && (view.state.selection.main.from !== 0 || view.state.selection.main.to !== view.state.doc.length))) return false;
  try { const parsed = parseInput(text); event.preventDefault(); replaceSource(JSON.stringify(parsed.value, null, indentation())); $('source-type').textContent = parsed.type; show(parsed.value); message(`已将 ${parsed.type} 转换为 JSON`); return true; }
  catch { return false; }
} })] }) });
const result = new EditorView({ parent: $('result'), state: EditorState.create({ extensions: [basicSetup, resultLanguage.of(json()), syntaxHighlighting(colors), EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ 'aria-label': '处理结果编辑器' })] }) });
function indentation() { return $('indent').value === 'tab' ? '\t' : ' '.repeat(Number($('indent').value)); }
function parse() { return parseInput(source.state.doc.toString()).value; }
function validate() {
  const text = source.state.doc.toString();
  if (!text.trim()) { status('source-status', '粘贴 JSON、URL Params、XML 或 YAML 开始处理'); return; }
  try { const parsed = parseInput(text); status('source-status', parsed.type === 'JSON' ? '✓ 有效的 JSON' : `可转换的 ${parsed.type}`); $('source-type').textContent = parsed.type; }
  catch (error) { status('source-status', error.message, true); }
}
function replaceSource(text) { suppress = true; setText(source, text); suppress = false; validate(); }
function show(value, type = 'JSON', raw = false, label = '处理完成') {
  outputType = type;
  const text = raw ? value : JSON.stringify(value, null, indentation());
  setText(result, text);
  result.dispatch({ effects: resultLanguage.reconfigure(type === 'XML' ? xml() : type === 'TypeScript' ? javascript({ typescript: true }) : json()) });
  $('result-type').textContent = type;
  $('result-size').textContent = size(text);
  status('result-status', '✓ ' + label);
}
function action(type) {
  cancelRun();
  try {
    const value = parse();
    if (type === 'format') { replaceSource(JSON.stringify(value, null, indentation())); show(value, 'JSON', false, '格式化完成'); }
    if (type === 'minify') show(JSON.stringify(value), 'JSON', true, '压缩完成');
    if (type === 'escape') show(JSON.stringify(JSON.stringify(value)), 'JSON', true, '转义完成');
    if (type === 'unescape') {
      if (typeof value !== 'string') throw new Error('反转义需要输入 JSON 字符串，例如 "{\\"name\\":\\"WTools\\"}"');
      const unescaped = JSON.parse(value); show(unescaped, 'JSON', false, '反转义完成');
    }
    if (type === 'xml') show(toXML(value, indentation()), 'XML', true, '已转换为 XML');
    if (type === 'typescript') show(toTypeScript(value, indentation()), 'TypeScript', true, '已生成 TypeScript 类型');
    validate();
  } catch (error) { status('result-status', error.message, true); message(error.message, true); }
}
$('format').onclick = () => action('format');
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => action(button.dataset.action));
$('indent').onchange = () => { source.dispatch({ effects: sourceIndent.reconfigure(indentUnit.of(indentation())) }); action('format'); };
$('example').onclick = () => { cancelRun(); replaceSource(JSON.stringify(sample, null, indentation())); show(sample); };
$('clear').onclick = () => { cancelRun(); replaceSource(''); show('', 'JSON', true, '已清空'); source.focus(); };
$('search').onclick = () => { source.focus(); openSearchPanel(source); };
$('open').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的文件');
    const text = await file.text(); cancelRun(); replaceSource(text);
    const parsed = parseInput(text); replaceSource(JSON.stringify(parsed.value, null, indentation())); show(parsed.value, 'JSON', false, `已导入 ${file.name}`);
  } catch (error) { message(error.message, true); }
  $('file').value = '';
};
$('copy').onclick = async () => {
  try {
    const text = result.state.doc.toString();
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select();
      const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('复制失败');
    }
    message('结果已复制');
  } catch { message('无法访问剪贴板，请在结果区域全选后复制', true); }
};
$('download').onclick = () => {
  const ext = { JSON: 'json', XML: 'xml', TypeScript: 'ts' }[outputType];
  const url = URL.createObjectURL(new Blob([result.state.doc.toString()], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `result.${ext}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('use-result').onclick = () => {
  try { const parsed = parseInput(result.state.doc.toString()); cancelRun(); replaceSource(JSON.stringify(parsed.value, null, indentation())); message('结果已用作源数据'); }
  catch { message('当前结果无法转换为 JSON 输入', true); }
};
function cancelRun() {
  clearTimeout(runTimer); frame?.remove(); frame = null; pendingRun = null; runVersion++; $('run').disabled = false;
  status('run-status', '支持 filter、map、reduce 等 JavaScript 语法');
}
function run() {
  cancelRun();
  try {
    const data = parse(), expression = $('expression').value.trim();
    if (!expression) throw new Error('请输入 JavaScript 表达式');
    pendingRun = { data, expression };
    $('run').disabled = true; status('run-status', '正在运行…');
    const version = runVersion;
    frame = document.createElement('iframe'); frame.hidden = true; frame.sandbox = 'allow-scripts';
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-wtools-json-filter\'; worker-src blob:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'"><script nonce="wtools-json-filter">' + runnerCode + '</script>';
    document.body.append(frame);
    runTimer = setTimeout(() => { if (version !== runVersion) return; cancelRun(); status('run-status', '执行环境启动超时，请重试', true); }, 10000);
  } catch (error) { status('run-status', error.message, true); message(error.message, true); }
}
addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow || !pendingRun) return;
  if (event.data?.ready) {
    clearTimeout(runTimer);
    const version = runVersion;
    runTimer = setTimeout(() => { if (version !== runVersion) return; cancelRun(); status('run-status', '执行超过 2 秒，已中断', true); message('执行超过 2 秒，已中断', true); }, 2000);
    frame.contentWindow.postMessage(pendingRun, '*');
    return;
  }
  const response = event.data; cancelRun();
  if (response?.ok) {
    try { show(JSON.parse(response.json), 'JSON', false, '过滤完成'); status('run-status', '✓ 运行成功'); }
    catch (error) { status('run-status', error.message, true); }
  } else { status('run-status', response?.error || '执行失败', true); message(response?.error || '执行失败', true); }
});
$('run').onclick = run;
$('help').onclick = () => { $('help-content').hidden = !$('help-content').hidden; $('help').setAttribute('aria-expanded', String(!$('help-content').hidden)); };
document.querySelectorAll('[data-expression]').forEach(button => button.onclick = () => { $('expression').value = button.dataset.expression; $('expression').focus(); });
addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key === 'Enter') { event.preventDefault(); run(); }
  if (event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); action('format'); }
});
const handle = document.querySelector('.split-handle'), workspace = document.querySelector('.workspace');
function setSplit(percent) { workspace.style.gridTemplateColumns = `minmax(0, ${percent}fr) 16px minmax(0, ${100 - percent}fr)`; }
handle.onpointerdown = event => {
  handle.setPointerCapture(event.pointerId);
  handle.onpointermove = e => { const rect = workspace.getBoundingClientRect(); setSplit(Math.max(25, Math.min(75, (e.clientX - rect.left) / rect.width * 100))); };
  handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; };
};
let split = 50;
handle.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); split = Math.max(25, Math.min(75, split + (event.key === 'ArrowLeft' ? -5 : 5))); setSplit(split); } };
$('source-size').textContent = size(source.state.doc.toString()); validate(); show(sample, 'JSON', false, '示例数据已就绪');
