import Sval from 'sval';

// Interpret expressions inside the existing opaque-origin Worker. No eval or
// Function constructor is needed, so the host's CSP remains unchanged.
const send = self.postMessage.bind(self);
const stringify = JSON.stringify;
addEventListener('message', event => {
  const { expression, data } = event.data;
  try {
    const interpreter = new Sval({ ecmaVer: 'latest', sandBox: true });
    interpreter.import('data', data);
    let program;
    try {
      program = interpreter.parse('exports.result = (function(data) { "use strict"; return (\n' + expression + '\n); }).call(data, data);');
    } catch {
      program = interpreter.parse('exports.result = (function(data) { "use strict";\n' + expression + '\n}).call(data, data);');
    }
    interpreter.run(program);
    const value = interpreter.exports.result;
    if (value && typeof value.then === 'function') {
      Promise.resolve(value).catch(() => {});
      throw new Error('过滤仅支持同步表达式，不能返回 Promise');
    }
    const json = stringify(value, (_, value) => {
      if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('结果包含无法表示为 JSON 的值');
      return value;
    });
    if (json === undefined) throw new Error('表达式没有返回 JSON 值，请使用表达式或 return 返回结果');
    if (json.length > 10 * 1024 * 1024) throw new Error('过滤结果超过 10 MB，请缩小结果范围');
    send({ ok: true, json });
  } catch (error) { send({ ok: false, error: String(error.message || error) }); }
});
send({ ready: true });
