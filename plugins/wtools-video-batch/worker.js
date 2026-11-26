/* FFmpeg WebAssembly Worker for wtools-video-batch */
'use strict';

importScripts('vendor/ffmpeg-core.js');

let wasmModulePromise = null;
const recentLogs = [];

function getWasmModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = fetch('vendor/ffmpeg-core.wasm')
      .then((res) => {
        if (!res.ok) throw new Error(`无法加载 ffmpeg-core.wasm (${res.status})`);
        return res.arrayBuffer();
      })
      .then((buf) => WebAssembly.compile(buf));
  }
  return wasmModulePromise;
}

async function getCore() {
  const mod = await getWasmModule();
  const core = await self.createFFmpegCore({
    instantiateWasm(imports, receiveInstance) {
      WebAssembly.instantiate(mod, imports).then((instance) => {
        receiveInstance(instance, mod);
      });
      return {};
    },
  });
  core.setLogger(({ message }) => {
    if (message) {
      recentLogs.push(message);
      if (recentLogs.length > 60) recentLogs.shift();
    }
  });
  core.setProgress(({ progress }) => {
    const pct = Math.max(0, Math.min(1, Number(progress) || 0));
    self.postMessage({ type: 'progress', progress: pct });
  });
  return core;
}

function safeUnlink(FS, path) {
  try {
    FS.unlink(path);
  } catch (_) {}
}

function listDirFiles(FS, dir) {
  try {
    return FS.readdir(dir).filter(n => n !== '.' && n !== '..');
  } catch (_) {
    return [];
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'init') {
      await getCore();
      self.postMessage({ id, ok: true });
      return;
    }

    if (type === 'run') {
      const core = await getCore();
      const FS = core.FS;
      recentLogs.length = 0;

      const { inputs, args, outputs, outputPrefix } = payload;
      const created = [];

      try {
        for (const item of inputs) {
          const data = item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data);
          FS.writeFile(item.name, data);
          created.push(item.name);
        }

        core.reset();
        const ret = core.exec(...args);
        if (ret !== 0) {
          const tail = recentLogs.slice(-8).join('\n');
          throw new Error(`FFmpeg 处理失败 (code ${ret})${tail ? ': ' + tail : ''}`);
        }

        const resultFiles = [];
        if (outputPrefix) {
          const names = listDirFiles(FS, '.').filter(n => n.startsWith(outputPrefix)).sort();
          for (const name of names) {
            const bytes = FS.readFile(name);
            resultFiles.push({ name, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
            created.push(name);
          }
        } else {
          for (const outName of outputs) {
            const bytes = FS.readFile(outName);
            resultFiles.push({ name: outName, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
            created.push(outName);
          }
        }

        const transfers = resultFiles.map(f => f.data);
        self.postMessage({ id, ok: true, files: resultFiles }, transfers);
      } finally {
        for (const name of created) safeUnlink(FS, name);
        if (outputs) {
          for (const outName of outputs) safeUnlink(FS, outName);
        }
      }
      return;
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
