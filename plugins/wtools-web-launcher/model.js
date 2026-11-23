/* Shared by the plugin UI and the offline validation suite. */
(function (root) {
  const browserNames = { default: "默认浏览器", edge: "Edge", chrome: "Chrome", firefox: "Firefox" };
  function normalizeUrl(value) {
    const raw = value.trim();
    if (!raw || /[\s\u0000-\u001f\u007f]/u.test(raw)) throw new Error("请输入有效的网址，网址中不能包含空格。");
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("仅支持不含用户名和密码的 HTTP / HTTPS 网址。");
    if (url.href.length > 4096) throw new Error("网址不能超过 4096 个字符。");
    return url.href;
  }
  const presets = [
    ["deepseek", "DeepSeek", "https://chat.deepseek.com/", "D", "#e9edff", "#5367e8"],
    ["kimi", "Kimi", "https://www.kimi.com/", "K", "#262833", "#ffffff"],
    ["doubao", "豆包", "https://www.doubao.com/", "豆", "#e8f3f9", "#5292ac"],
    ["zai", "Z.ai", "https://chat.z.ai/", "Z", "#f1f1f4", "#242635"],
    ["qianwen", "千问", "https://www.qianwen.com/", "千", "#ece9ff", "#7560d8"],
    ["yuanbao", "元宝", "https://yuanbao.tencent.com/", "元", "#e8f6ed", "#43a873"],
    ["minimax", "MiniMax", "https://agent.minimaxi.com/", "M", "#ffedf2", "#e6678e"],
    ["wenxin", "文心", "https://yiyan.baidu.com/", "文", "#eeecff", "#7964db"]
  ];
  const common = [
    ["github", "GitHub", "https://github.com/", "G", "#ededf2", "#343b50"],
    ["bing", "必应", "https://www.bing.com/", "b", "#e4f5f4", "#3ba79f"],
    ["bilibili", "哔哩哔哩", "https://www.bilibili.com/", "哔", "#fdebf2", "#e8799d"],
    ["antd", "Ant Design", "https://ant.design/", "A", "#e6f2ff", "#338be3"],
    ["mui", "MUI", "https://mui.com/", "M", "#e5f3ff", "#288ee1"]
  ];
  function presetRows(rows, group) {
    return rows.map(([id, name, url, glyph, bg, fg]) => ({ id: `${group}-${id}`, name, category: group, enabled: true, urls: [{ url, browser: "default" }], glyph, bg, fg }));
  }
  function initialState() {
    return { version: 1, categories: [{ id: "default", name: "默认分类", launch: false }], entries: [...presetRows(common, "builtin"), ...presetRows(presets, "ai")] };
  }
  function validateState(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.categories) || !Array.isArray(value.entries)) throw new Error("保存的数据格式不正确。");
    if (!value.categories.some(c => c.id === "default") || value.categories.length > 100 || value.entries.length > 1000) throw new Error("保存的数据超出限制或缺少默认分类。");
    const ids = new Set(["builtin", "ai"]);
    for (const category of value.categories) {
      if (typeof category.id !== "string" || ids.has(category.id) || typeof category.name !== "string" || !category.name.trim() || category.name.length > 30 || typeof category.launch !== "boolean") throw new Error("分类数据无效。");
      ids.add(category.id);
    }
    const entries = new Set();
    for (const entry of value.entries) {
      if (typeof entry.id !== "string" || entries.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 60 || !ids.has(entry.category) || typeof entry.enabled !== "boolean" || !Array.isArray(entry.urls) || !entry.urls.length || entry.urls.length > 30) throw new Error("网页数据无效。");
      entries.add(entry.id);
      for (const item of entry.urls) {
        if (!Object.hasOwn(browserNames, item.browser) || normalizeUrl(item.url) !== item.url) throw new Error("保存的网址或浏览器无效。");
      }
    }
    return value;
  }
  function launchItems(entries) {
    const unique = new Map();
    for (const entry of entries.filter(e => e.enabled)) for (const item of entry.urls) unique.set(`${item.browser}:${item.url}`, item);
    if (unique.size > 100) throw new Error("一次最多打开 100 个网页，请减少分类内的网页数量。");
    if (!unique.size) throw new Error("没有已启用的网页，请先开启入口。");
    return [...unique.values()];
  }
  root.WebLauncher = { browserNames, normalizeUrl, initialState, validateState, launchItems };
})(typeof module === "object" ? module.exports : window);
