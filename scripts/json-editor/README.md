# JSON 编辑器构建与验证

源代码及隔离执行器位于 `src/`，静态页面、样式和生成的脚本位于 `plugins/wtools-json-editor/`。所有运行依赖均打包到插件内，不依赖 CDN。

```powershell
npm ci --prefix scripts/json-editor
npm run build --prefix scripts/json-editor
npx --prefix scripts/json-editor playwright install chromium
npm test --prefix scripts/json-editor
python scripts/build_catalog.py
```

如本机已安装 Chrome，可跳过下载 Chromium，设置 `$env:PLAYWRIGHT_CHANNEL='chrome'` 后运行测试。

双栏支持编辑、搜索、折叠、撤销、拖动分隔线。粘贴到空文档或全选替换时自动检测 JSON、查询参数、XML、YAML；局部粘贴保留正常编辑行为。左侧保存输入，右侧显示压缩、转义、反转义、XML、TypeScript 和过滤结果。格式化同时更新左侧。不会保存或上传用户数据。

URL 参数保留字符串，重复键生成数组。XML 保留根节点，属性映射为 `@属性`，文本映射为 `#text`，重复元素生成数组；XML 标量保留为字符串，混合内容顺序不保留。JSON 转 XML 使用单个根键，否则包裹 `root`；数组元素使用 `item`，空数组及 null 为无内容元素，非法 XML 键名报错。YAML 使用 YAML 1.2，生成 JSON 时不保留注释和锚点。数字采用 JavaScript Number 精度，超出安全整数的 ID 请用字符串输入。

TypeScript 根据全部数组样本合并属性并推断联合类型、可选字段；空数组使用 `unknown`。过滤支持 `this` / `data` 表达式，或带 `return` 的语句。代码仅在无宿主权限的 sandbox iframe 内的 Worker 中执行，网络由 CSP 禁止，超时 2 秒销毁执行环境；结果上限 10 MB，文件导入上限 20 MB。过滤结果必须可序列化为 JSON。

`test.mjs` 覆盖真实浏览器内的转换、粘贴、导出、执行超时与后续恢复，并验证 HTTP 和本地文件打开方式。运行前需安装 Playwright Chromium。
