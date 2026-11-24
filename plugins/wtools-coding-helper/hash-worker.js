"use strict";
importScripts("./vendor/crypto-js.js");
const algorithms = ["MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512"];
onmessage = async ({ data }) => {
  try {
    const selected = data.algorithm === "all" ? algorithms : [data.algorithm];
    if (selected.some(name => !algorithms.includes(name))) throw new Error("不支持的摘要算法。");
    const hashers = selected.map(name => CryptoJS.algo[name].create());
    const update = bytes => { const words = CryptoJS.lib.WordArray.create(bytes); hashers.forEach(hash => hash.update(words)); };
    if (data.file) {
      const size = data.file.size;
      for (let offset = 0; offset < size; offset += 2 * 1024 * 1024) {
        const end = Math.min(offset + 2 * 1024 * 1024, size);
        update(new Uint8Array(await data.file.slice(offset, end).arrayBuffer()));
        postMessage({ progress: Math.round(end / size * 100) });
      }
    } else update(new TextEncoder().encode(data.text));
    postMessage({ rows: hashers.map((hash, i) => [selected[i], hash.finalize().toString(CryptoJS.enc.Hex)]) });
  } catch (error) { postMessage({ error: error.message || "摘要计算失败。" }); }
};
