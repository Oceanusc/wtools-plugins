# WTools 插件仓库

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

示例条目对应 `plugins/night-guard/`。当前收录备忘录、hosts 切换、ToDo 待办和进程与端口管理。四项工具使用 WTools 的专用原生接口。改动这些插件的包内容时，需要在 WTools 宿主中登记新内容的指纹，并在上架清单注明所需的最低宿主版本。七种分类为 `text`、`productivity`、`system`、`network`、`development`、`media` 和 `other`。

## 首次部署

在公开的 [wtools-plugins](https://github.com/Oceanusc/wtools-plugins) 仓库中，打开「Settings → Pages」，将 Source 设为 **GitHub Actions**。工作流成功后，从部署地址追加 `catalog.json` 得到 WTools 订阅地址。默认项目站点示例为 `https://oceanusc.github.io/wtools-plugins/catalog.json`。

发布 WTools 本体时，在首次构建前将该地址设为环境变量 `WTOOLS_PLUGIN_MARKET_URL`。用 WTools 仓库的 GitHub Actions 构建时，在该仓库的 Actions variables 中设置同名变量。后续插件更新沿用同一地址。

## 本地预览产物

在仓库根目录使用 Python 3.12 或更新版本执行 `python scripts/build_catalog.py`。目录和 ZIP 会输出到 `dist/`。Actions 每次从干净的检出目录生成发布快照。若客户端持有旧目录，可以刷新后重新取包。
