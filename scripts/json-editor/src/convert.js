import { parse as parseYAML } from 'yaml';

export function parseInput(text, mode = 'auto') {
  text = text.trim();
  if (!text) throw new Error('请先输入数据');
  if (mode === 'json') return { value: JSON.parse(text), type: 'JSON' };
  try { return { value: JSON.parse(text), type: 'JSON' }; } catch (error) {
    if (/^[{[]/.test(text) && !/^[{[]\s*"/.test(text)) {
      try {
        const value = parseYAML(text, { maxAliasCount: 50, stringKeys: true, logLevel: 'error' });
        if (value && typeof value === 'object') return { value: JSON.parse(JSON.stringify(value)), type: 'YAML' };
      } catch { /* Keep the original JSON diagnostic for malformed flow input. */ }
    }
    if (/^[{[\"]/.test(text)) throw error;
  }
  if (text.startsWith('<')) return { value: parseXML(text), type: 'XML' };
  if (/^(https?:\/\/|\?)/i.test(text) || /^[^\s=&]+=[\s\S]*$/.test(text)) {
    const query = /^https?:\/\//i.test(text) ? new URL(text).search.slice(1) : text.replace(/^\?/, '').split('#')[0];
    if (!query) throw new Error('URL 中没有查询参数');
    const value = Object.create(null);
    for (const [key, item] of new URLSearchParams(query)) {
      if (Object.hasOwn(value, key)) value[key] = Array.isArray(value[key]) ? [...value[key], item] : [value[key], item];
      else value[key] = item;
    }
    return { value, type: 'URL Params' };
  }
  if (!/(^|\n)\s*(?:[^\n]+:\s|[^\n]+:$|-\s|---)/.test(text)) throw new Error('无法识别格式，请输入 JSON、URL Params、XML 或 YAML');
  const value = parseYAML(text, { maxAliasCount: 50, stringKeys: true, logLevel: 'error' });
  // Normalize YAML values to the same JSON data model as the editor.
  return { value: JSON.parse(JSON.stringify(value)), type: 'YAML' };
}

export function parseXML(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML 不支持 DOCTYPE 或实体声明');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML 格式错误：' + doc.querySelector('parsererror').textContent.slice(0, 160));
  function visit(node) {
    const result = Object.create(null);
    for (const attr of node.attributes) result['@' + attr.name] = attr.value;
    for (const child of node.children) {
      const value = visit(child);
      if (Object.hasOwn(result, child.tagName)) result[child.tagName] = Array.isArray(result[child.tagName]) ? [...result[child.tagName], value] : [result[child.tagName], value];
      else result[child.tagName] = value;
    }
    const text = [...node.childNodes].filter(n => n.nodeType === 3 || n.nodeType === 4).map(n => n.textContent).join('').trim();
    if (!Object.keys(result).length) return text;
    if (text) result['#text'] = text;
    return result;
  }
  return { [doc.documentElement.tagName]: visit(doc.documentElement) };
}

export function toXML(value, indent = '  ') {
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
  function valid(name) {
    if (!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(name)) throw new Error(`无法将键「${name}」作为 XML 名称（属性用 @ 前缀，文本用 #text）`);
    return name;
  }
  function element(key, item, level) {
    valid(key);
    const pad = indent.repeat(level);
    if (Array.isArray(item)) return item.length ? item.map(x => element(key, x, level)).join('\n') : `${pad}<${key}/>`;
    if (item === null) return `${pad}<${key}/>`;
    if (typeof item !== 'object') return `${pad}<${key}>${esc(item)}</${key}>`;
    let attrs = '', text = '', children = [];
    for (const [k, v] of Object.entries(item)) {
      if (k.startsWith('@')) {
        valid(k.slice(1));
        if (v !== null && typeof v === 'object') throw new Error('XML 属性必须是标量');
        attrs += ` ${k.slice(1)}="${esc(v ?? '')}"`;
      } else if (k === '#text') {
        if (v !== null && typeof v === 'object') throw new Error('XML 文本必须是标量');
        text = esc(v ?? '');
      } else children.push(element(k, v, level + 1));
    }
    return children.length ? `${pad}<${key}${attrs}>${text}\n${children.join('\n')}\n${pad}</${key}>` : `${pad}<${key}${attrs}>${text}</${key}>`;
  }
  const keys = value && !Array.isArray(value) && typeof value === 'object' ? Object.keys(value) : [];
  const body = keys.length === 1 && !keys[0].startsWith('@') && keys[0] !== '#text' && !Array.isArray(value[keys[0]]) ? element(keys[0], value[keys[0]], 0) : element('root', Array.isArray(value) ? { item: value } : value, 0);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + body;
}

export function toTypeScript(value, indent = '  ') {
  function type(values, depth) {
    if (depth > 40) return 'unknown';
    const types = [];
    const add = t => { if (!types.includes(t)) types.push(t); };
    for (const v of values) if (v === null) add('null'); else if (typeof v !== 'object') add(typeof v);
    const arrays = values.filter(Array.isArray);
    if (arrays.length) { const t = type(arrays.flat(), depth + 1); add(`Array<${t}>`); }
    const objects = values.filter(v => v !== null && typeof v === 'object' && !Array.isArray(v));
    if (objects.length) {
      const keys = [...new Set(objects.flatMap(Object.keys))];
      const fields = keys.map(k => {
        const present = objects.filter(o => Object.hasOwn(o, k));
        const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return `${indent.repeat(depth + 1)}${key}${present.length < objects.length ? '?' : ''}: ${type(present.map(o => o[k]), depth + 1)};`;
      });
      add(fields.length ? `{\n${fields.join('\n')}\n${indent.repeat(depth)}}` : 'Record<string, never>');
    }
    return types.join(' | ') || 'unknown';
  }
  return `export type Root = ${type([value], 0)};\n`;
}
