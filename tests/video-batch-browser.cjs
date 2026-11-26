const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("assert/strict");

const root = path.resolve(__dirname, "../plugins/wtools-video-batch");
const outDir = path.resolve(__dirname, "../dist/video-batch-preview");
fs.mkdirSync(outDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/favicon.ico") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    console.error("HTTP 404:", urlPath);
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  res.end(fs.readFileSync(filePath));
});

async function generateSampleMp4(tmpMp4Path) {
  global.self = { location: { href: "" } };
  const createFFmpegCore = require(path.join(root, "vendor/ffmpeg-core.js"));
  const core = await createFFmpegCore({
    wasmBinary: fs.readFileSync(path.join(root, "vendor/ffmpeg-core.wasm")),
    locateFile: (p) => path.join(root, "vendor", p),
  });
  core.reset();
  const ret = core.exec(
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "sample.mp4"
  );
  assert.equal(ret, 0, "Failed to generate sample.mp4 via ffmpeg-core");
  const bytes = core.FS.readFile("sample.mp4");
  fs.writeFileSync(tmpMp4Path, bytes);
}

(async () => {
  const sampleMp4 = path.join(outDir, "sample.mp4");
  await generateSampleMp4(sampleMp4);
  console.log("Generated sample.mp4:", fs.statSync(sampleMp4).size, "bytes");

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors = [];
    page.on("pageerror", (e) => {
      console.error("PAGEERROR:", e.message);
      errors.push(`pageerror: ${e.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("CONSOLE.ERROR:", msg.text());
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    await page.goto(url, { waitUntil: "networkidle" });

    // 1. Verify all 14 sidebar modes switch cleanly
    const modes = [
      "compress", "trim", "crop", "convert", "animated", "watermark",
      "resize", "cover", "speed", "flip", "rotate", "merge", "audio", "frames",
    ];
    for (const m of modes) {
      await page.click(`.nav-item[data-mode="${m}"]`);
      const visible = await page.isVisible(`.option-group[data-options="${m}"]`);
      assert.equal(visible, true, `Mode ${m} option group should be visible`);
    }

    // 2. Upload sample.mp4 into queue
    await page.click(`.nav-item[data-mode="compress"]`);
    await page.setInputFiles("#file-input", sampleMp4);
    await page.waitForSelector(".video-card");
    const cardTitle = await page.textContent(".card-title");
    assert.ok(cardTitle.includes("sample.mp4"), "Video card should show sample.mp4");
    await page.screenshot({ path: path.join(outDir, "01-compress-ready.png") });

    // 3. Run real FFmpeg WASM compression
    await page.click("#start-btn");
    await page.waitForSelector(".status-text.done, .status-text.error", { timeout: 20000 });
    const errEl = await page.$(".status-text.error");
    if (errEl) throw new Error("Compression failed in UI: " + (await errEl.textContent()));
    const doneText = await page.textContent(".status-text.done");
    assert.ok(doneText.includes("处理完成"), `Expected 处理完成, got: ${doneText}`);
    await page.click(".card-action-btn");
    const toastText = await page.textContent("#toast");
    assert.ok(toastText.includes("已开始下载"), `Expected download toast, got: ${toastText}`);
    await page.screenshot({ path: path.join(outDir, "02-compress-done.png") });

    // 4. Test animated GIF conversion
    await page.click(`.nav-item[data-mode="animated"]`);
    await page.click("#start-btn");
    await page.waitForSelector(".status-text.done, .status-text.error", { timeout: 20000 });
    const gifErr = await page.$(".status-text.error");
    if (gifErr) throw new Error("GIF failed: " + (await gifErr.textContent()));
    await page.screenshot({ path: path.join(outDir, "03-gif-done.png") });

    // 5. Test frame extraction (ZIP output)
    await page.click(`.nav-item[data-mode="frames"]`);
    await page.click("#start-btn");
    await page.waitForSelector(".status-text.done, .status-text.error", { timeout: 20000 });
    const frameErr = await page.$(".status-text.error");
    if (frameErr) throw new Error("Frames failed: " + (await frameErr.textContent()));
    const frameDone = await page.textContent(".status-text.done");
    assert.ok(frameDone.includes("帧)"), `Expected frame count in status, got: ${frameDone}`);

    // 6. Test responsive viewports (760x570 and 410x300)
    await page.setViewportSize({ width: 760, height: 570 });
    await page.screenshot({ path: path.join(outDir, "04-viewport-760x570.png") });
    await page.setViewportSize({ width: 410, height: 300 });
    await page.screenshot({ path: path.join(outDir, "05-viewport-410x300.png") });

    assert.deepEqual(errors, [], `Unexpected page/console errors: ${errors.join("; ")}`);
    console.log("All wtools-video-batch browser tests PASSED!");
  } finally {
    await browser.close();
    server.close();
  }
})();
