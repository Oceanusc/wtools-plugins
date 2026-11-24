# WTools 插件仓库

## 插件视图适配约定

插件界面按 WTools 默认 760×570、最小 410×300 逻辑像素设计，分别处理窄窗和矮窗。根容器占满实际视口，编辑器与列表设置可收缩的边界，必要滚动留在内容区；不要用固定最小宽高、整体缩放或隐藏正文来掩盖溢出。Windows DPI 由 WebView2 换算，不对页面整体再次乘除缩放比例。

极矮窗口中，编码小助手通过「选项」展开转换设置，为输入和结果保留可编辑空间；月历仅显示公历日期，所选日的农历仍在详情区。JSON 筛选使用随包提供的 JavaScript 解释器，不依赖宿主放开 `eval`；执行环境就绪后超时 2 秒中断。

当前备忘、hosts、待办、进程、网页快开和日历要求 WTools 0.6.9，市场清单会阻止旧宿主安装这些新版包。

本次为全部 11 个插件补充了布局适配；Markdown 在窄窗中使用可关闭侧栏。原生接口插件的变更包须配套包含当前包指纹的宿主构建。插件统一调用 `window.wtools` 与 `/_wtools/`，宿主不再替换旧版 preload、注入旧全局别名或接受旧路由；JSON 编辑器与 ToDo 使用仓库内的 WTools 实现，合社日历改用通用请求且无需包指纹。指南见 [WTools 插件 AI 开发指南](https://github.com/Oceanusc/wtools/blob/main/docs/wtools-plugin-ai-guide.md)。包含窗口尺寸支持的宿主构建还可读取 `pluginSetting` 的初始与最小宽高；页面仍须适应实际视口。

此仓库维护可在 WTools 插件市场安装的 Web 插件。GitHub Actions 从登记的目录生成 ZIP、SHA-256 和目录索引，GitHub Pages 提供可直接下载的 HTTPS 文件。

## 上架或更新插件

1. 把可在 WTools 中打开的生产产物放到 `plugins/<目录名>/`，根目录包含 `plugin.json`。目录名使用小写字母、数字和连字符，插件资源使用包内相对路径。
2. 在 `plugins.json` 的 `plugins` 数组登记目录、分类和最低 WTools 版本。可选的 `featured` 控制精选，`publishedAt` 使用 Unix 毫秒时间戳。
3. 更新插件时保持 `plugin.json` 的 `name` 不变，提高 `version`，并更新 `publishedAt`。通过 PR 提交变更，合并到 `main` 后由 Actions 发布。
4. WTools 用户打开「设置中心 → 插件市场」并刷新目录，市场安装的旧版本即可点「更新」。

~~~json
{
  "plugins": [
    {
      "directory": "night-guard",
      "category": "other",
      "minWtoolsVersion": "0.6.6",
      "featured": true,
      "publishedAt": 1795392000000
    }
  ]
}
~~~

示例条目对应 `plugins/night-guard/`。当前收录备忘录、hosts 切换、ToDo 待办、进程与端口管理和 JSON 编辑器。前四项工具使用 WTools 的专用原生接口。改动这些插件的包内容时，需要在 WTools 宿主中登记新内容的指纹，并在上架清单注明所需的最低宿主版本。JSON 编辑器离线运行，无需原生接口；构建和验证说明见 `scripts/json-editor/README.md`。七种分类为 `text`、`productivity`、`system`、`network`、`development`、`media` 和 `other`。

网页快开支持分类批量启动、为每个网址指定浏览器和启动器搜索，当前插件包需要 WTools 0.6.9 或更新版本。说明见 [网页快开](plugins/wtools-web-launcher/README.md)。

编码小助手提供离线 Base64（含图片）、时间戳、UUID、文本/文件 Hash、URL、2–36 进制、Unicode 与 HTML 转义，支持启动器正则识别和搜索栏推送。无需构建或专用原生接口，最低 WTools 0.6.7；使用与依赖说明见 [编码小助手](plugins/wtools-coding-helper/README.md)。

时间戳转换支持秒/毫秒与日期双向转换、全球时区、结果复制和可暂停的当前时间戳，提供可选时区与明暗主题设置。离线运行，无需构建或专用原生接口，说明见 [时间戳转换](plugins/wtools-timestamp/README.md)。

合社日历基于开源 he-calendar 1.6.0 适配，提供农历、黄历、节日、二十四节气与中国风主题，支持搜索「合社日历」「日历」「万年历」「黄历」「calendar」。插件支持城市搜索、多城市实时天气及预报，并支持在系统默认浏览器打开外链。当前工作区已迁移通用 `wtools.request` 获取天气，需配套包含通用联网能力和外链接口的 WTools 构建，不再需要日历专用接口或包指纹；早期 0.6.8 不支持通用请求。日历离线可用，天气需要联网。使用方式和资源来源见 [合社日历](plugins/wtools-he-calendar/README.md)。

## 首次部署

在公开的 [wtools-plugins](https://github.com/Oceanusc/wtools-plugins) 仓库中，打开「Settings → Pages」，将 Source 设为 **GitHub Actions**。工作流成功后，从部署地址追加 `catalog.json` 得到 WTools 订阅地址。默认项目站点示例为 `https://oceanusc.github.io/wtools-plugins/catalog.json`。

发布 WTools 本体时，在首次构建前将该地址设为环境变量 `WTOOLS_PLUGIN_MARKET_URL`。用 WTools 仓库的 GitHub Actions 构建时，在该仓库的 Actions variables 中设置同名变量。后续插件更新沿用同一地址。

## 本地预览产物

hosts 切换 1.1.0 提供常驻方案侧栏、单选／多选合并、右键管理、双击应用和深浅主题及 Vim 编辑。编辑器依赖构建、模拟接口验收和宿主指纹发布说明见 [hosts 编辑器说明](scripts/hosts-editor/README.md)。该版本需与登记新插件指纹的 WTools 0.6.8 或更新构建配套使用。

在仓库根目录使用 Python 3.12 或更新版本执行 `python scripts/build_catalog.py`。目录和 ZIP 会输出到 `dist/`。Actions 每次从干净的检出目录生成发布快照。若客户端持有旧目录，可以刷新后重新取包。

备忘录 1.1.0 升级为「备忘快贴」：按标签收藏文本、代码和图片，支持明暗主题、代码高亮与批量管理。Enter、向右键或双击可粘贴到呼出启动器前的窗口，复制按钮可单独复制。此版本需配套 WTools 0.6.8 的受限 `memo-transfer` 接口及包指纹登记。文本保存在宿主插件数据库，图片保存在本地附件库（每张 PNG 最多 8 MiB）；说明菜单可导入旧备忘，原提醒保留。

## ToDo 待办 1.1

需要包含新版 ToDo 指纹与桌面窗口配置接口的 WTools 0.6.8 构建。支持列表／看板切换、搜索、自定义分组、批量添加、桌面便签，以及番茄／电子表两种专注主题。顶部视图按钮切换看板，分组标题旁的加号添加任务，左下角设置打开专注侧栏。Ctrl+N 添加任务，Ctrl+F 搜索，编辑弹窗中 Ctrl+Enter 保存。

批量添加默认每行一条；内容有空行时，按段落拆分并保留段落内换行。每批最多 50 条，每条最多 1000 字符。任务与计时状态沿用宿主的本机存储；自定义分组、任务分组关系和界面偏好保存在插件 WebView 的本机存储，不参与数据同步。桌面便签和番茄钟复用一个置顶窗口，重新打开时切换模式并带入当前分组与主题。

界面回归脚本为 `tests/todo-browser.cjs`，需提供 Playwright（`PLAYWRIGHT_MODULE` 可指定模块路径，`CHROME_PATH` 可指定 Chrome 路径）。运行 `node tests/todo-browser.cjs` 会使用模拟宿主数据验证交互，并在 `dist/todo-preview/` 输出截图；不读取真实待办。

## Markdown 笔记

新增独立的离线 Markdown 笔记插件，提供三种编辑模式、全文搜索、文件夹、公式与图表以及 Markdown / HTML / PDF / PNG 导出。文本和图片分别使用 WTools 文档数据库与附件数据库。启动器通过「笔记 关键词」搜索栏推送快速打开。安装、构建、验证和宿主能力限制见 [插件说明](plugins/wtools-markdown/README.md)。

## PDF 处理

新增独立的本地 PDF 工具，支持压缩、合并、拆分、水印、提取图片、转图片和 Word / PPT / Excel 导出。界面包含文件预览、合并排序与页面排除、批量处理和 ZIP 下载。全部依赖随包提供，不上传文件。Word 支持文字提取与图片两种模式，PPT 按页生成图片幻灯片，Excel 按文字位置分列，不含 OCR。使用限制与依赖维护见 [PDF 插件说明](plugins/wtools-pdf/README.md)。

备忘快贴 1.1.1 针对宿主默认窗口及 Windows 150% 缩放提供紧凑布局；收藏不足三条时显示可关闭的使用引导，可直接新建或导入旧备忘。升级保留已有收藏、标签和提醒，不自动添加演示数据。
