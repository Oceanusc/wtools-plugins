# hosts 切换编辑器

生产插件在 `plugins/wtools-hosts/`。使用现有 WTools `/_atools/hosts` 接口，不增加原生命令；保留原有 `{ public, profiles }` 存储格式。公共配置首次由宿主从系统导入，保存不写系统，应用时由宿主检查预览指纹再写入。

## 构建与检查

在本目录执行 `npm ci`、`npm run build`。构建将 CodeMirror 5.65.21、Vim 键位、活动行和命令输入组件打包到插件的 `vendor/`，运行时无需联网。依赖许可随包提供。

执行 `$env:PLAYWRIGHT_CHANNEL='msedge'; npm test` 可使用已安装的 Edge；也可先 `npx playwright install chromium` 后执行 `npm test`。自动化启动本地模拟 hosts 接口，覆盖编辑保存、多方案组合、预览、冲突、应用失败、右键管理、Vim、偏好持久化、权限错误及重试；不会读写系统 hosts。预览截图写入 `dist/hosts-preview/`。

## 行为

- 单击查看编辑，勾选参与合并；双击或右键“应用此方案”快速应用。多选模式保留其他已启用的片段，单选模式只启用目标片段。冲突始终先展示预览。
- 切换到单选时，如果已有多个启用项，保留当前编辑且已启用的方案，否则保留第一个启用项。加载旧数据时，多个已启用项会自动使用多选模式，避免丢失组合。
- Ctrl/⌘ S 保存所有方案，Ctrl/⌘ Enter 预览合并。Vim 支持 `:w` 保存。方案切换保留各自的编辑历史。
- 明亮、黑暗、跟随系统及 Vim/选择模式偏好保存在当前插件的 localStorage，旧 workspace 数据无需迁移。
- 系统 hosts 独立只读；本次会话成功应用后显示应用状态。未保存更改会触发页面关闭提醒，宿主强制关闭时是否展示由 WebView 宿主决定。

## 发布

运行仓库根目录 `python scripts/build_catalog.py` 生成市场 ZIP。此插件使用受指纹限制的原生接口，需要将全部包文件的指纹登记到 WTools 的 `src-tauri/src/plugins/official.rs`，再随支持该指纹的宿主发布。指纹按文件相对路径排序，对路径 UTF-8 长度（u64 大端）、路径字节、内容长度（u64 大端）、内容字节依次进行 SHA-256；保持 LF 换行。

原生 UAC、安全软件拦截、实际 hosts 写入及 DNS 解析需要在 WTools Windows 宿主中另行实测。
