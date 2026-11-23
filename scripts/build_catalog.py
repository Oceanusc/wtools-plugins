"""Build the static WTools market catalog and its ZIP packages."""

import hashlib
import io
import json
from pathlib import Path
import re
import shutil
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {"text", "productivity", "system", "network", "development", "media", "other"}
RESERVED_NAMES = {"atools-text-workbench", "wtools-quickcommand"}
NUMBER = r"(?:0|[1-9][0-9]*)"
PRERELEASE = rf"(?:{NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
SEMVER = re.compile(
    rf"{NUMBER}\.{NUMBER}\.{NUMBER}(?:-{PRERELEASE}(?:\.{PRERELEASE})*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: {error}") from error
    require(isinstance(value, dict), f"{path}: JSON 根节点必须是对象")
    return value


def version(value, field):
    require(
        isinstance(value, str) and len(value) <= 64 and SEMVER.fullmatch(value),
        f"{field} 必须是长度不超过 64 的 SemVer 版本",
    )
    return value


def plugin_files(directory):
    require(directory.is_dir(), f"找不到插件目录 {directory}")
    require(
        not any(
            path.is_symlink() or path.is_junction() for path in (directory.parent, directory)
        ),
        f"{directory}: 插件目录必须为普通目录",
    )
    files = {}
    names = set()
    size = 0
    for path in sorted(directory.rglob("*")):
        name = path.relative_to(directory).as_posix()
        require(
            not path.is_symlink() and not path.is_junction(),
            f"{directory.name}: 包内包含链接 {name}",
        )
        require(
            not path.name.startswith(".") and path.name != "node_modules",
            f"{directory.name}: 只放发布产物，请移出 {name}",
        )
        if path.is_dir():
            continue
        require(
            path.is_file()
            and len(name.encode("utf-8")) <= 1024
            and len(name.split("/")) <= 32
            and not re.search(r"[\x00-\x1f\x7f-\x9f\\:?#]", name)
            and name.lower() not in names,
            f"{directory.name}: 包内路径无效或重复 {name}",
        )
        files[name] = path
        names.add(name.lower())
        size += path.stat().st_size
        require(
            len(files) <= 8000 and size <= 128 * 1024**2,
            f"{directory.name}: 解包后超出大小或文件数上限",
        )
    require("plugin.json" in files, f"{directory.name}: 包根缺少 plugin.json")
    require(
        files["plugin.json"].stat().st_size <= 256 * 1024,
        f"{directory.name}: plugin.json 超过 256 KiB",
    )
    return files


def release(row, slug, files):
    manifest = read_json(files["plugin.json"])
    name = manifest.get("name")
    require(
        isinstance(name, str)
        and re.fullmatch(r"[A-Za-z0-9._/@-]{1,120}", name)
        and all(part not in {"", ".", ".."} for part in name.split("/"))
        and not name.lower().startswith("dev/")
        and name.lower() not in RESERVED_NAMES,
        f"{slug}: 插件标识无效或已保留",
    )
    main = manifest.get("main")
    entrypoint = main.removeprefix("./") if isinstance(main, str) else ""
    require(entrypoint.lower().endswith(".html") and entrypoint in files, f"{slug}: 找不到 main 指向的 HTML")
    platform = manifest.get("platform")
    require(
        platform is None or platform == "win32" or (isinstance(platform, list) and "win32" in platform),
        f"{slug}: 插件须支持 Windows",
    )

    text = {field: manifest.get(field, "") for field in ("title", "pluginName", "description", "author")}
    for field, value in text.items():
        require(isinstance(value, str), f"{slug}: {field} 必须是字符串")
    title = next((value for value in (text["title"], text["pluginName"]) if value.strip()), name)
    for field, value, maximum in (
        ("title", title, 300), ("description", text["description"], 4096), ("author", text["author"], 240),
    ):
        require(len(value.encode("utf-8")) <= maximum, f"{slug}: {field} 超出长度限制")

    category = row.get("category")
    featured = row.get("featured", False)
    published_at = row.get("publishedAt", 0)
    require(isinstance(category, str) and category in CATEGORIES, f"{slug}: 无效的 category")
    require(type(featured) is bool, f"{slug}: featured 必须是布尔值")
    require(
        type(published_at) is int and 0 <= published_at <= 8_640_000_000_000_000,
        f"{slug}: publishedAt 必须是 Unix 毫秒时间戳",
    )
    return {
        "name": name,
        "title": title,
        "description": text["description"],
        "author": text["author"],
        "category": category,
        "version": version(manifest.get("version"), f"{slug} 的 version"),
        "minWtoolsVersion": version(row.get("minWtoolsVersion"), f"{slug} 的 minWtoolsVersion"),
        "featured": featured,
        "publishedAt": published_at,
    }


def write_package(output, slug, files, plugin):
    with io.BytesIO() as buffer:
        with ZipFile(buffer, "w") as archive:
            for name, path in sorted(files.items()):
                entry = ZipInfo(name)
                entry.compress_type = ZIP_DEFLATED
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                with path.open("rb") as source, archive.open(entry, "w") as target:
                    shutil.copyfileobj(source, target)

        size = buffer.tell()
        require(size <= 48 * 1024**2, f"{slug}: ZIP 超过 48 MiB")
        content = buffer.getbuffer()
        try:
            digest = hashlib.sha256(content).hexdigest()
            tag = plugin["version"].replace("+", "_")
            package = f"{slug}-{tag}-{digest[:16]}.zip"
            (output / package).write_bytes(content)
        finally:
            content.release()
    plugin.update(package=package, size=size, sha256=digest)


def build_catalog():
    entries = read_json(ROOT / "plugins.json").get("plugins")
    require(isinstance(entries, list) and len(entries) <= 256, "plugins 必须是最多 256 项的数组")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    plugins = []
    directories = set()
    names = set()
    for row in entries:
        require(isinstance(row, dict), "plugins 中的每一项必须是对象")
        slug = row.get("directory")
        require(
            isinstance(slug, str) and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", slug),
            "directory 必须是小写字母、数字和连字符组成的目录名",
        )
        require(slug not in directories, f"插件目录重复登记：{slug}")
        files = plugin_files(ROOT / "plugins" / slug)
        plugin = release(row, slug, files)
        name = plugin["name"].lower()
        require(name not in names, f"插件标识重复：{plugin['name']}")
        write_package(output, slug, files, plugin)
        plugins.append(plugin)
        directories.add(slug)
        names.add(name)

    catalog = json.dumps({"schemaVersion": 1, "plugins": plugins}, ensure_ascii=False, indent=2) + "\n"
    data = catalog.encode("utf-8")
    require(len(data) <= 512 * 1024, "catalog.json 超过 512 KiB")
    pending = output / "catalog.json.tmp"
    pending.write_bytes(data)
    pending.replace(output / "catalog.json")
    print(f"生成 catalog.json，共 {len(plugins)} 个插件")


if __name__ == "__main__":
    try:
        build_catalog()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
