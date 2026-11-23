# Markdown 笔记 1.0

面向 Windows WTools 0.6.7 及更新版本的离线笔记插件。文本只通过 `window.wtools.db` 保存，图片通过 `window.wtools.db.promises` 附件接口保存，界面偏好通过 `dbStorage` 保存。没有其他宿主适配或备用数据库。

## 使用

在「设置中心 → 已安装插件」注册本目录，或导入生成的 ZIP；输入「Markdown 笔记」或「笔记」打开。开发目录修改后需重载。

- 所见即所得、即时渲染和源码双栏预览，自动保存；Ctrl+S 可重试保存。保存失败保留当前草稿并阻止切换，仍可导出备份。
- 文件夹嵌套、笔记重命名与删除、拖放排序与归档、右键菜单、标题和正文全文搜索、明暗主题、文档大纲。
- Todo 列表、表格、代码高亮（随包提供的 Highlight.js 超过 168 种语言）、KaTeX、Mermaid、ECharts。ECharts 只接受标准 JSON，不执行函数或 JavaScript 配置。
- 插入或粘贴 PNG、JPEG、GIF、WebP 图片。单附件最多 8 MiB，宿主所有插件附件合计最多 64 MiB / 128 项。更多菜单可清理未引用图片；清理也会影响撤销记录中的旧图片。
- 导入 `.md`、`.markdown`、`.txt`，单文件最多 4 MiB。导出 Markdown、独立 HTML、PNG 和 PDF；Markdown 中的本地图片转为 data URI，HTML 将公式字体和图表一并内嵌。文件夹导出为包含子笔记的单个 Markdown 文件。
- PDF 为分页栅格图像，中文和图表可保留，文字不能选取；PNG/PDF 高度超过 24000px 时建议改用 HTML 或 Markdown。

## 宿主能力边界

当前 WTools 公开接口尚未提供独立多窗口、动态注册笔记名称为全局指令、通用 AI 调用、系统浏览器打开 URL 或文件路径。本版会在相关入口说明限制。支持四种图表模板，也能粘贴外部 AI 生成的 Mermaid / ECharts JSON。

在插件详情开启「搜索栏推送」后，以聚合模式输入「笔记 关键词」即可搜索标题和正文并直接打开结果。这依赖现有 `onMainPush` 接口，不需要专用原生权限或官方指纹。

宿主文档数据库当前使用插件专属 WebView 存储，文本有 WebView 配额限制，写入失败时会提示；附件使用宿主的独立附件库。开发目录与普通安装数据分别保存。升级保持插件标识不变，重要内容请定期导出。

## 开发与验证

在仓库根目录：

```powershell
npm ci --prefix scripts/markdown-notes
node scripts/markdown-notes/build.mjs
node scripts/markdown-notes/smoke.mjs
python scripts/build_catalog.py
```

运行时全部资源已在 `vendor/` 中，无需安装依赖。构建脚本固定 Vditor 3.11.2，将图表的动态求值改成 JSON 解析，按 WTools CSP 验证。原项目许可证保留在 `vendor/` 中。

自动回归使用 Edge 无头浏览器、与宿主一致的 CSP 和隔离的模拟 WTools 数据库，检查编辑模式、导入、保存恢复、保存失败、全文搜索、附件、公式、流程图、统计图、四种导出、文件夹和明暗窄屏布局，同时要求零外网请求。未在真实 WTools WebView2 中完成安装、附件配额、启动器推送与系统下载的实机验收。
