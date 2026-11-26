/* Video batch processing engine backed by FFmpeg WASM worker */

let worker = null;
let jobSeq = 1;
let activeJob = null;

function ensureWorker() {
  if (!worker) {
    worker = new Worker('worker.js');
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        if (activeJob && activeJob.onProgress) {
          activeJob.onProgress(msg.progress);
        }
        return;
      }
      if (activeJob && msg.id === activeJob.id) {
        const job = activeJob;
        activeJob = null;
        if (msg.ok) job.resolve(msg.files || []);
        else job.reject(new Error(msg.error || '处理失败'));
      }
    };
    worker.onerror = (err) => {
      if (activeJob) {
        const job = activeJob;
        activeJob = null;
        job.reject(new Error(err.message || 'FFmpeg Worker 运行异常'));
      }
      worker = null;
    };
  }
  return worker;
}

export function abortCurrentJob() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (activeJob) {
    const job = activeJob;
    activeJob = null;
    job.reject(new Error('已中止当前任务'));
  }
}

export function runFFmpegJob({ inputs, args, outputs, outputPrefix, onProgress }) {
  const w = ensureWorker();
  const id = jobSeq++;
  return new Promise((resolve, reject) => {
    activeJob = { id, resolve, reject, onProgress };
    const transferInputs = inputs.map(item => {
      const u8 = item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data);
      const copy = u8.slice();
      return { name: item.name, data: copy.buffer };
    });
    w.postMessage(
      {
        id,
        type: 'run',
        payload: {
          inputs: transferInputs,
          args,
          outputs,
          outputPrefix,
        },
      },
      transferInputs.map(i => i.data),
    );
  });
}

export function getExt(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : 'mp4';
}

export function baseName(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(0, idx) : name;
}

export function replaceExt(name, newExt) {
  return `${baseName(name)}.${newExt}`;
}

export function even(n) {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v - 1;
}

export function parseTimecode(str) {
  const s = String(str || '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Number(s));
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildAtempoFilter(rate) {
  const filters = [];
  let r = rate;
  while (r > 2.0) {
    filters.push('atempo=2.0');
    r /= 2.0;
  }
  while (r < 0.5) {
    filters.push('atempo=0.5');
    r /= 0.5;
  }
  filters.push(`atempo=${r.toFixed(4)}`);
  return filters.join(',');
}

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function canvasToUint8(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error('水印图层生成失败'));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

async function buildWatermarkPng(videoWidth, videoHeight, opts) {
  let stampCanvas;
  if (opts.wmType === 'image') {
    if (!opts.wmImageFile) throw new Error('请先选择水印图片');
    const url = URL.createObjectURL(opts.wmImageFile);
    try {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('无法读取水印图片'));
        img.src = url;
      });
      const targetW = Math.max(16, Math.round(videoWidth * (opts.imgScale / 100)));
      const targetH = Math.max(16, Math.round((img.naturalHeight / img.naturalWidth) * targetW));
      stampCanvas = createCanvas(targetW, targetH);
      const sctx = stampCanvas.getContext('2d');
      sctx.globalAlpha = opts.opacity / 100;
      sctx.drawImage(img, 0, 0, targetW, targetH);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const text = (opts.text || '').trim();
    if (!text) throw new Error('请输入水印文字');
    const fontSize = Math.max(12, Number(opts.fontSize) || 28);
    const probe = createCanvas(10, 10).getContext('2d');
    probe.font = `bold ${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    const metrics = probe.measureText(text);
    const pad = Math.ceil(fontSize * 0.35);
    const w = Math.ceil(metrics.width + pad * 2);
    const h = Math.ceil(fontSize * 1.35 + pad * 2);
    stampCanvas = createCanvas(w, h);
    const sctx = stampCanvas.getContext('2d');
    sctx.globalAlpha = opts.opacity / 100;
    sctx.font = `bold ${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    sctx.textBaseline = 'middle';
    sctx.textAlign = 'center';
    sctx.shadowColor = 'rgba(0,0,0,0.45)';
    sctx.shadowBlur = 4;
    sctx.fillStyle = opts.color || '#ffffff';
    sctx.fillText(text, w / 2, h / 2);
  }

  if (opts.wmMode === 'tile') {
    const full = createCanvas(videoWidth, videoHeight);
    const fctx = full.getContext('2d');
    const gap = Math.max(40, Number(opts.tileGap) || 140);
    const rad = ((Number(opts.tileAngle) || -25) * Math.PI) / 180;
    const stepX = stampCanvas.width + gap;
    const stepY = stampCanvas.height + gap;
    const diag = Math.ceil(Math.hypot(videoWidth, videoHeight));
    fctx.save();
    fctx.translate(videoWidth / 2, videoHeight / 2);
    fctx.rotate(rad);
    for (let y = -diag; y <= diag; y += stepY) {
      for (let x = -diag; x <= diag; x += stepX) {
        fctx.drawImage(stampCanvas, x - stampCanvas.width / 2, y - stampCanvas.height / 2);
      }
    }
    fctx.restore();
    return { png: await canvasToUint8(full), fullFrame: true };
  }

  return { png: await canvasToUint8(stampCanvas), fullFrame: false };
}

function getOverlayExpr(opts) {
  if (opts.wmMode === 'tile') return 'overlay=0:0';
  if (opts.wmMode === 'dynamic') {
    const spd = opts.speed === 'slow' ? 50 : opts.speed === 'fast' ? 160 : 95;
    const spdY = Math.round(spd * 0.72);
    return `overlay=x='abs(mod(t*${spd},max(2,2*(W-w)))-max(1,W-w))':y='abs(mod(t*${spdY},max(2,2*(H-h)))-max(1,H-h))'`;
  }
  const m = Math.max(0, Number(opts.margin) || 24);
  const posMap = {
    tl: `${m}:${m}`,
    tc: `(W-w)/2:${m}`,
    tr: `W-w-${m}:${m}`,
    ml: `${m}:(H-h)/2`,
    mc: `(W-w)/2:(H-h)/2`,
    mr: `W-w-${m}:(H-h)/2`,
    bl: `${m}:H-h-${m}`,
    bc: `(W-w)/2:H-h-${m}`,
    br: `W-w-${m}:H-h-${m}`,
  };
  return `overlay=${posMap[opts.position] || posMap.br}`;
}

export async function buildPreviewMp4(file) {
  const ext = getExt(file.name);
  const inName = `input.${ext}`;
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  const outName = 'preview.mp4';
  const args = [
    '-i', inName,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '26',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outName,
  ];
  const [out] = await runFFmpegJob({
    inputs: [{ name: inName, data: inputBytes }],
    args,
    outputs: [outName],
  });
  return new Blob([out.data], { type: 'video/mp4' });
}

export async function extractFallbackThumb(file) {
  const ext = getExt(file.name);
  const inName = `input.${ext}`;
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  const outName = 'thumb.png';
  const args = ['-ss', '0.2', '-i', inName, '-vframes', '1', '-vf', 'scale=272:-2', outName];
  const [out] = await runFFmpegJob({
    inputs: [{ name: inName, data: inputBytes }],
    args,
    outputs: [outName],
  });
  return URL.createObjectURL(new Blob([out.data], { type: 'image/png' }));
}

export async function processSingleVideo(item, mode, opts, onProgress) {
  const ext = getExt(item.file.name);
  const inName = `input.${ext}`;
  const inputBytes = new Uint8Array(await item.file.arrayBuffer());

  if (mode === 'compress') {
    if (ext !== 'mp4') {
      throw new Error('仅支持 MP4 视频压缩');
    }
    if (opts.codec === 'av1') {
      throw new Error('当前离线内核暂不支持 AV1 编码，请选择 H.264 或 H.265');
    }
    const outName = 'output.mp4';
    const crf = String(opts.crf ?? 30);
    const args = opts.codec === 'h265'
      ? ['-i', inName, '-c:v', 'libx265', '-crf', crf, '-preset', 'ultrafast', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outName]
      : ['-i', inName, '-c:v', 'libx264', '-crf', crf, '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_compressed.mp4`,
    };
  }

  if (mode === 'trim') {
    const outExt = ext;
    const outName = `output.${outExt}`;
    const dur = item.duration || 0;
    let ss = 0;
    let t = null;
    if (opts.trimMode === 'head') {
      ss = parseTimecode(opts.headDur);
      if (Number.isNaN(ss) || ss < 0) throw new Error('请输入有效的时间格式 (HH:MM:SS)');
      if (dur > 0 && ss >= dur) throw new Error('剪掉时长大于或等于视频总时长');
    } else if (opts.trimMode === 'tail') {
      const tail = parseTimecode(opts.tailDur);
      if (Number.isNaN(tail) || tail < 0) throw new Error('请输入有效的时间格式 (HH:MM:SS)');
      if (dur <= 0) throw new Error('无法获取视频时长以裁剪片尾');
      t = dur - tail;
      if (t <= 0) throw new Error('剪掉时长大于或等于视频总时长');
    } else if (opts.trimMode === 'range') {
      ss = parseTimecode(opts.rangeStart);
      const end = parseTimecode(opts.rangeEnd);
      if (Number.isNaN(ss) || Number.isNaN(end) || ss < 0 || end <= ss) {
        throw new Error('结束时间必须大于开始时间');
      }
      t = end - ss;
    } else {
      ss = parseTimecode(opts.segStart);
      t = parseTimecode(opts.segDur);
      if (Number.isNaN(ss) || Number.isNaN(t) || ss < 0 || t <= 0) {
        throw new Error('片段时长必须大于 0');
      }
    }
    const args = [];
    if (ss > 0) args.push('-ss', ss.toFixed(3));
    args.push('-i', inName);
    if (t !== null) args.push('-t', t.toFixed(3));
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero', outName);
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: item.file.type || 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_trim.${outExt}`,
    };
  }

  if (mode === 'crop') {
    const [rw, rh] = (opts.ratio || '16:9').split(':').map(Number);
    const w = item.width || 1280;
    const h = item.height || 720;
    const targetRatio = rw / rh;
    let cw;
    let ch;
    if (w / h > targetRatio) {
      ch = even(h);
      cw = even(ch * targetRatio);
    } else {
      cw = even(w);
      ch = even(cw / targetRatio);
    }
    let x = Math.floor((w - cw) / 2);
    let y = Math.floor((h - ch) / 2);
    if (opts.anchor === 'top') { x = 0; y = 0; }
    else if (opts.anchor === 'bottom') { x = Math.max(0, w - cw); y = Math.max(0, h - ch); }
    const outName = 'output.mp4';
    const args = ['-i', inName, '-vf', `crop=${cw}:${ch}:${x}:${y}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_crop.mp4`,
    };
  }

  if (mode === 'convert') {
    const fmt = opts.format || 'mp4';
    const outName = `output.${fmt}`;
    const codecArgs = {
      mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      avi: ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-q:a', '4'],
      flv: ['-c:v', 'flv', '-q:v', '5', '-c:a', 'libmp3lame', '-ar', '44100'],
      mkv: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
      mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      wmv: ['-c:v', 'wmv2', '-q:v', '5', '-c:a', 'wmav2'],
      webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '4', '-c:a', 'libopus'],
    }[fmt];
    const args = ['-i', inName, ...codecArgs, outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data]),
      fileName: replaceExt(item.file.name, fmt),
    };
  }

  if (mode === 'animated') {
    const fmt = opts.animFormat || 'gif';
    const fps = Math.max(1, Math.min(30, Number(opts.fps) || 10));
    const width = opts.width ? even(Number(opts.width)) : null;
    const scalePart = width ? `,scale=${width}:-2:flags=lanczos` : '';
    const loop = opts.loop !== false;
    const outName = `output.${fmt}`;
    let args;
    if (fmt === 'webp') {
      args = ['-i', inName, '-vf', `fps=${fps}${scalePart}`, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '75', '-loop', loop ? '0' : '1', '-an', outName];
    } else {
      args = ['-i', inName, '-filter_complex', `[0:v]fps=${fps}${scalePart},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`, '-loop', loop ? '0' : '-1', outName];
    }
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: fmt === 'gif' ? 'image/gif' : 'image/webp' }),
      fileName: replaceExt(item.file.name, fmt),
    };
  }

  if (mode === 'watermark') {
    const w = item.width || 1280;
    const h = item.height || 720;
    const { png } = await buildWatermarkPng(w, h, opts);
    const outName = 'output.mp4';
    const overlay = getOverlayExpr(opts);
    const args = ['-i', inName, '-i', 'wm.png', '-filter_complex', `[0:v][1:v]${overlay},format=yuv420p[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'copy', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({
      inputs: [{ name: inName, data: inputBytes }, { name: 'wm.png', data: png }],
      args,
      outputs: [outName],
      onProgress,
    });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_wm.mp4`,
    };
  }

  if (mode === 'resize') {
    const tw = opts.width ? even(Number(opts.width)) : null;
    const th = opts.height ? even(Number(opts.height)) : null;
    if (!tw && !th) throw new Error('请至少填写目标宽度或目标高度');
    const scale = tw && th ? `scale=${tw}:${th}:flags=lanczos` : tw ? `scale=${tw}:-2:flags=lanczos` : `scale=-2:${th}:flags=lanczos`;
    const outName = 'output.mp4';
    const args = ['-i', inName, '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_resize.mp4`,
    };
  }

  if (mode === 'cover') {
    if (!opts.coverFile) throw new Error('请先选择封面图片');
    const coverExt = getExt(opts.coverFile.name);
    const coverName = `cover.${coverExt}`;
    const coverBytes = new Uint8Array(await opts.coverFile.arrayBuffer());
    const outExt = ['mp4', 'mov', 'm4v', 'mkv'].includes(ext) ? ext : 'mp4';
    const outName = `output.${outExt}`;
    const args = outExt === 'mkv'
      ? ['-i', inName, '-c', 'copy', '-attach', coverName, '-metadata:s:t', `mimetype=image/${coverExt === 'png' ? 'png' : 'jpeg'}`, outName]
      : ['-i', inName, '-i', coverName, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', outName];
    const [out] = await runFFmpegJob({
      inputs: [{ name: inName, data: inputBytes }, { name: coverName, data: coverBytes }],
      args,
      outputs: [outName],
      onProgress,
    });
    return {
      blob: new Blob([out.data]),
      fileName: `${baseName(item.file.name)}_cover.${outExt}`,
    };
  }

  if (mode === 'speed') {
    const rate = Math.max(0.25, Math.min(4, Number(opts.rate) || 2));
    const pts = (1 / rate).toFixed(4);
    const outName = 'output.mp4';
    const hasAudio = item.hasAudio !== false && opts.syncAudio;
    let args;
    if (hasAudio) {
      const atempo = buildAtempoFilter(rate);
      args = ['-i', inName, '-filter_complex', `[0:v]setpts=${pts}*PTS[v];[0:a]${atempo}[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outName];
    } else {
      args = ['-i', inName, '-vf', `setpts=${pts}*PTS`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outName];
    }
    try {
      const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
      return {
        blob: new Blob([out.data], { type: 'video/mp4' }),
        fileName: `${baseName(item.file.name)}_${rate}x.mp4`,
      };
    } catch (err) {
      if (hasAudio && /matches no streams|Stream specifier/i.test(err.message)) {
        const fallbackArgs = ['-i', inName, '-vf', `setpts=${pts}*PTS`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outName];
        const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args: fallbackArgs, outputs: [outName], onProgress });
        return {
          blob: new Blob([out.data], { type: 'video/mp4' }),
          fileName: `${baseName(item.file.name)}_${rate}x.mp4`,
        };
      }
      throw err;
    }
  }

  if (mode === 'flip') {
    const vf = opts.flip === 'v' ? 'vflip' : opts.flip === 'hv' ? 'hflip,vflip' : 'hflip';
    const outName = 'output.mp4';
    const args = ['-i', inName, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_flip.mp4`,
    };
  }

  if (mode === 'rotate') {
    const raw = Number(opts.angle) || 0;
    const norm = ((raw % 360) + 360) % 360;
    const outName = 'output.mp4';
    let vf = '';
    if (norm === 0) {
      const args = ['-i', inName, '-c', 'copy', outName];
      const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
      return { blob: new Blob([out.data], { type: 'video/mp4' }), fileName: `${baseName(item.file.name)}_rot0.mp4` };
    }
    if (norm === 90) vf = 'transpose=1';
    else if (norm === 180) vf = 'transpose=1,transpose=1';
    else if (norm === 270) vf = 'transpose=2';
    else {
      const rad = ((raw * Math.PI) / 180).toFixed(6);
      vf = `rotate=${rad}:ow='rotw(${rad})':oh='roth(${rad})':c=black,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    }
    const args = ['-i', inName, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data], { type: 'video/mp4' }),
      fileName: `${baseName(item.file.name)}_rot${norm}.mp4`,
    };
  }

  if (mode === 'merge') {
    if (!opts.extraFile) throw new Error('请先选择要合并的片头/片尾视频');
    const extraExt = getExt(opts.extraFile.name);
    const extraName = `extra.${extraExt}`;
    const extraBytes = new Uint8Array(await opts.extraFile.arrayBuffer());
    const ordered = opts.mergeMode === 'head'
      ? [{ name: extraName, data: extraBytes }, { name: inName, data: inputBytes }]
      : [{ name: inName, data: inputBytes }, { name: extraName, data: extraBytes }];
    const listTxt = new TextEncoder().encode(ordered.map(f => `file '${f.name}'`).join('\n'));
    const outExt = ext;
    const outName = `output.${outExt}`;
    const args = ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', outName];
    const [out] = await runFFmpegJob({
      inputs: [...ordered, { name: 'list.txt', data: listTxt }],
      args,
      outputs: [outName],
      onProgress,
    });
    return {
      blob: new Blob([out.data]),
      fileName: `${baseName(item.file.name)}_merged.${outExt}`,
    };
  }

  if (mode === 'audio') {
    if (opts.audioMode === 'extract') {
      const afmt = opts.audioFormat || 'mp3';
      const outName = `output.${afmt}`;
      const codecArgs = {
        mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
        aac: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
        wav: ['-vn', '-c:a', 'pcm_s16le'],
      }[afmt];
      const args = ['-i', inName, ...codecArgs, outName];
      const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
      return {
        blob: new Blob([out.data]),
        fileName: replaceExt(item.file.name, afmt),
      };
    }
    const outName = `output.${ext}`;
    const args = ['-i', inName, '-c:v', 'copy', '-an', outName];
    const [out] = await runFFmpegJob({ inputs: [{ name: inName, data: inputBytes }], args, outputs: [outName], onProgress });
    return {
      blob: new Blob([out.data]),
      fileName: `${baseName(item.file.name)}_muted.${ext}`,
    };
  }

async function pngBytesToJpgBuffer(pngBytes, quality = 0.92) {
  const blob = new Blob([pngBytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('帧图片解码失败'));
      img.src = url;
    });
    const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
    canvas.getContext('2d').drawImage(img, 0, 0);
    const jpgBlob = await new Promise((res, rej) => {
      canvas.toBlob(b => (b ? res(b) : rej(new Error('JPG 编码失败'))), 'image/jpeg', quality);
    });
    return jpgBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

  if (mode === 'frames') {
    const interval = Math.max(0.1, Number(opts.interval) || 1);
    const fps = (1 / interval).toFixed(6);
    const fmt = opts.frameFormat || 'jpg';
    const w = opts.width ? even(Number(opts.width)) : null;
    const vf = w ? `fps=${fps},scale=${w}:-2:flags=lanczos` : `fps=${fps}`;
    const args = ['-i', inName, '-vf', vf, 'frame_%04d.png'];
    const files = await runFFmpegJob({
      inputs: [{ name: inName, data: inputBytes }],
      args,
      outputPrefix: 'frame_',
      onProgress,
    });
    if (!files.length) throw new Error('未能提取到任何视频帧');
    const JSZip = window.JSZip;
    if (!JSZip) throw new Error('JSZip 未加载');
    const zip = new JSZip();
    for (const f of files) {
      if (fmt === 'jpg') {
        const jpgBuf = await pngBytesToJpgBuffer(f.data);
        zip.file(f.name.replace(/\.png$/i, '.jpg'), jpgBuf);
      } else {
        zip.file(f.name, f.data);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return {
      blob,
      fileName: `${baseName(item.file.name)}_frames.zip`,
      frameCount: files.length,
    };
  }

  throw new Error(`未知处理模式: ${mode}`);
}

export async function mergeQueueVideos(items, onProgress) {
  if (items.length < 2) throw new Error('队列合并至少需要 2 个视频');
  const firstExt = getExt(items[0].file.name);
  const inputs = [];
  const lines = [];
  for (let i = 0; i < items.length; i++) {
    const ext = getExt(items[i].file.name);
    const name = `seg_${i}.${ext}`;
    inputs.push({ name, data: new Uint8Array(await items[i].file.arrayBuffer()) });
    lines.push(`file '${name}'`);
  }
  inputs.push({ name: 'list.txt', data: new TextEncoder().encode(lines.join('\n')) });
  const outName = `merged.${firstExt}`;
  const args = ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', outName];
  const [out] = await runFFmpegJob({ inputs, args, outputs: [outName], onProgress });
  return {
    blob: new Blob([out.data]),
    fileName: `merged_${items.length}.${firstExt}`,
  };
}
