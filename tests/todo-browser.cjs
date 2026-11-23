const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("assert/strict");
const root = path.resolve(__dirname, "../plugins/wtools-todo");
const output = path.resolve(__dirname, "../dist/todo-preview");
let state = {
  tasks: [
    { id: 1, text: "海外产品设计（官网、logo等）", idea: false, done: false },
    { id: 2, text: "悬浮球设计以及logo优化", idea: false, done: false },
    {
      id: 3,
      text: "月度更新（视频还未做，喵提醒自定义）",
      idea: false,
      done: false,
    },
    { id: 4, text: "开发者工具氛围感", idea: false, done: false },
    {
      id: 5,
      text: "视频创作者计划策划方案——后续修改",
      idea: false,
      done: true,
    },
  ],
  timer: { phase: "focus", minutes: 25, remaining: 1500000, deadline: null },
};
let nextId = 6;
const calls = [];
const server = http.createServer((req, res) => {
  const name = req.url.split("?")[0];
  res.setHeader(
    "Content-Type",
    name.endsWith(".css")
      ? "text/css"
      : name.endsWith(".js")
        ? "text/javascript"
        : "text/html",
  );
  res.end(fs.readFileSync(path.join(root, name === "/" ? "index.html" : name)));
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1212, height: 903 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const handleTodoRoute = async (route) => {
    const data = route.request().postDataJSON();
    calls.push(data);
    switch (data.op) {
      case "add":
        state.tasks.push(
          ...data.texts.map((text) => ({
            id: nextId++,
            text,
            idea: data.idea,
            done: false,
          })),
        );
        break;
      case "edit":
        state.tasks.find((t) => t.id === data.id).text = data.text;
        break;
      case "toggle":
        state.tasks.find((t) => t.id === data.id).done = data.done;
        break;
      case "remove":
        state.tasks = state.tasks.filter((t) => t.id !== data.id);
        break;
      case "start":
        state.timer = {
          phase: data.phase,
          minutes: data.minutes,
          remaining: data.minutes * 60000,
          deadline: Date.now() + data.minutes * 60000,
        };
        break;
      case "pause":
        state.timer.remaining = state.timer.deadline - Date.now();
        state.timer.deadline = null;
        break;
      case "resume":
        state.timer.deadline = Date.now() + state.timer.remaining;
        break;
      case "reset":
        state.timer.deadline = null;
        state.timer.remaining = state.timer.minutes * 60000;
        break;
      case "models":
        return route.fulfill({ json: ["local-model"] });
      case "summary":
        return route.fulfill({ json: "下一步：完成产品设计。" });
      case "sticky":
      case "hideSticky":
        return route.fulfill({ json: null });
    }
    await route.fulfill({ json: structuredClone(state) });
  };
  await page.route("**/_atools/todo", handleTodoRoute);
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.waitForSelector(".task");
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "todo-list.png") });
  // Keep the physical client area constant, matching the user's 1140×855 capture.
  // WebView2 display scaling changes the available CSS viewport.
  for (const scale of [1, 1.25, 1.5, 2]) {
    const context = await browser.newContext({
      viewport: { width: Math.round(1140 / scale), height: Math.round(855 / scale) },
      deviceScaleFactor: scale,
    });
    const scaled = await context.newPage();
    scaled.on("pageerror", (e) => errors.push(e.message));
    await scaled.route("**/_atools/todo", handleTodoRoute);
    await scaled.goto(url);
    await scaled.waitForSelector(".task");
    await scaled.screenshot({ path: path.join(output, `todo-list-${scale * 100}.png`) });
    await scaled.locator("#settings").click();
    const geometry = await scaled.evaluate(() => {
      const drawer = document.querySelector("#settings-dialog");
      const body = drawer.querySelector(".drawer-body");
      const card = drawer.querySelector(".settings-card");
      const action = document.querySelector("#show-timer");
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, height:r.height }; };
      return { drawer:rect(drawer), card:rect(card), action:rect(action), viewport:innerHeight,
        rootOverflow:document.documentElement.scrollHeight > innerHeight,
        drawerOverflow:drawer.scrollHeight > drawer.clientHeight + 1,
        bodyOverflow:body.scrollHeight > body.clientHeight + 1 };
    });
    assert.equal(geometry.rootOverflow, false, `root overflows at ${scale}`);
    assert.equal(geometry.drawerOverflow, false, `drawer overflows at ${scale}`);
    assert.equal(geometry.bodyOverflow, false, `settings content overflows at ${scale}`);
    assert(geometry.action.bottom <= geometry.viewport + 1, `footer offscreen at ${scale}`);
    assert(geometry.card.bottom <= geometry.action.top + 1, `footer covers themes at ${scale}`);
    await scaled.screenshot({ path: path.join(output, `todo-settings-${scale * 100}.png`) });
    await scaled.getByRole("button", { name:"关闭专注设置" }).click();
    await scaled.locator("#view-toggle").click();
    await scaled.screenshot({ path: path.join(output, `todo-board-${scale * 100}.png`) });
    await context.close();
  }

  await page.locator("#view-toggle").click();
  assert.equal(await page.locator(".board-column").count(), 3);
  await page.screenshot({ path: path.join(output, "todo-board.png") });
  await page.locator("#board-add").click();
  await page.locator("#edit-text").fill("第一条任务\n\n第二条任务的内容\n续行");
  assert.match(await page.locator("#edit-count").textContent(), /2 条/);
  await page.screenshot({ path: path.join(output, "todo-add.png") });
  await page.locator("#edit-form button[type=submit]").click();
  await page.waitForSelector("#edit-dialog", { state: "hidden" });
  assert(state.tasks.some((t) => t.text === "第二条任务的内容\n续行"));
  await page.locator("#view-toggle").click();
  await page.locator("#add-group").click();
  await page.locator("#group-name").fill("开发新插件");
  await page.locator("#group-form button[type=submit]").click();
  await page.locator("#batch").click();
  await page.locator("#edit-text").fill("<img src=x onerror=alert(1)>");
  await page.locator("#edit-form button[type=submit]").click();
  await page.waitForSelector("#edit-dialog", { state: "hidden" });
  assert.equal(await page.locator("#tasks .task").count(), 1);
  assert.equal(await page.locator("#tasks img").count(), 0);
  await page.reload();
  await page.waitForSelector(".task");
  assert.equal(await page.locator("#list-title").textContent(), "开发新插件");
  await page.locator("#tasks input[type=checkbox]").click();
  await page.waitForFunction(
    () => document.querySelector("#tasks").children.length === 0,
  );
  await page
    .getByRole("button", { name: /已完成/ })
    .first()
    .click();
  assert.equal(await page.locator("#tasks .task").count(), 2);
  await page.locator("#settings").click();
  await page.locator("#minutes").fill("35");
  await page.locator("input[value=digital]").check();
  await page.screenshot({ path: path.join(output, "todo-settings.png") });
  await page.locator("#show-timer").click();
  await page.waitForTimeout(100);
  const config = calls.findLast((c) => c.op === "sticky").config;
  assert.equal(config.minutes, 35);
  assert.equal(config.theme, "digital");
  await page.evaluate((config) => {
    document.body.classList.add("sticky");
    window.dispatchEvent(
      new CustomEvent("wtools-todo-config", { detail: config }),
    );
  }, config);
  await page.waitForFunction(() => document.querySelector("#clock").textContent === "35:00");
  await page.setViewportSize({ width: 400, height: 500 });
  await page.screenshot({ path: path.join(output, "todo-digital.png") });
  await page.locator("#toggle-timer").click();
  await page.waitForTimeout(100);
  assert.equal(calls.findLast((c) => c.op === "start").minutes, 35);
  await page.locator("#toggle-timer").click();
  await page.waitForTimeout(100);
  assert.equal(state.timer.deadline, null);
  await page.locator("#toggle-timer").click();
  await page.waitForTimeout(100);
  assert(state.timer.deadline > Date.now());
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("wtools-todo-config", {
        detail: { view: "timer", theme: "tomato", minutes: 35 },
      }),
    ),
  );
  await page.screenshot({ path: path.join(output, "todo-tomato.png") });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("wtools-todo-config", {
        detail: { view: "list", theme: "tomato", group: "pending" },
      }),
    ),
  );
  await page.setViewportSize({ width: 636, height: 650 });
  await page.screenshot({ path: path.join(output, "todo-sticky.png") });
  await page.setViewportSize({ width: 375, height: 700 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: list, board, batch paragraphs, groups/reload, completion, safe text, settings, desktop config, timer start/pause/resume, compact viewport and 100/125/150/200% display scaling without overflow; no browser errors.",
  );
  await browser.close();
  server.close();
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
