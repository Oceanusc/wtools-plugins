# PDF 处理插件依赖维护

生产文件直接位于 `plugins/wtools-pdf/`，无需打包 JavaScript。`index.js` 负责队列及界面，`engine.js` 负责 PDF 处理，`office.js` 负责使用 JSZip 生成标准 OOXML（DOCX / PPTX / XLSX）。不依赖桌面 Office 或 Python 运行时。

使用 Python 标准库按固定版本从 npm 注册表重新获取第三方依赖：

```powershell
python scripts/pdf-tools/download_vendor.py
```

脚本验证注册表提供的完整性摘要，仅提取指定浏览器脚本、CMap、标准字体，并生成 `THIRD-PARTY-LICENSES.txt`。PDF.js 的 `.mjs` 文件复制为 `.js`，按 ES module 使用，便于宿主以 JavaScript MIME 提供资源。依赖不在运行时下载。不修改其他插件依赖。

按仓库流程运行根目录市场打包脚本即可收录该插件；下载依赖不等同于构建或发布。

用户授权后可在 WTools 中手动验收：有文字层及扫描 PDF 分别导入；合并排序、旋转、排除；三种拆分；中文水印含旋转页面；原图提取；PNG / JPG；Word 两模式；PPT 页序；Excel 中文表格；损坏文件及加密文件错误；处理中取消；ZIP 同名结果；深浅主题和窄窗口。Office 输出需用 Word / PowerPoint / Excel 或兼容客户端实际打开确认兼容性。
