"""Download pinned browser libraries for wtools-video-batch; no build or package manager is required."""

import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2] / "plugins" / "wtools-video-batch" / "vendor"
PACKAGES = [
    (
        "@ffmpeg/core",
        "0.12.10",
        {
            "dist/umd/ffmpeg-core.js": "ffmpeg-core.js",
            "dist/umd/ffmpeg-core.wasm": "ffmpeg-core.wasm",
        },
        "https://github.com/ffmpegwasm/ffmpeg.wasm-core (MIT / FFmpeg LGPL/GPL)",
    ),
    (
        "@ffmpeg/ffmpeg",
        "0.12.15",
        {
            "dist/umd/ffmpeg.js": "ffmpeg.js",
            "dist/umd/814.ffmpeg.js": "814.ffmpeg.js",
        },
        "MIT",
    ),
    (
        "jszip",
        "3.10.1",
        {
            "dist/jszip.min.js": "jszip.min.js",
        },
        "MIT / GPLv3",
    ),
]


def download():
    ROOT.mkdir(parents=True, exist_ok=True)
    notices = []
    for name, version, files, fallback_license in PACKAGES:
        with urlopen(f"https://registry.npmjs.org/{name}/{version}", timeout=120) as response:
            metadata = json.load(response)
        with urlopen(metadata["dist"]["tarball"], timeout=120) as response:
            content = response.read()
        algorithm, expected = metadata["dist"]["integrity"].split("-", 1)
        actual = base64.b64encode(hashlib.new(algorithm, content).digest()).decode()
        if actual != expected:
            raise ValueError(f"Integrity mismatch: {name}@{version}")
        license_text = None
        with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
            for member in archive.getmembers():
                relative = member.name.removeprefix("package/")
                destination = files.get(relative)
                if destination and member.isfile():
                    target = ROOT / destination
                    if not target.resolve().is_relative_to(ROOT.resolve()):
                        raise ValueError("Invalid archive path")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.extractfile(member).read())
                if member.isfile() and relative.upper() in {
                    "LICENSE",
                    "LICENSE.TXT",
                    "LICENSE.MD",
                    "LICENSE.MARKDOWN",
                }:
                    license_text = archive.extractfile(member).read().decode("utf-8", errors="replace")
        notices.append(
            f"{name} {version}\nhttps://www.npmjs.com/package/{name}/v/{version}\n"
            + (license_text or f"License: {fallback_license}")
        )
        missing = [path for path in files.values() if not (ROOT / path).is_file()]
        if missing:
            raise ValueError(f"Missing files: {missing}")
        print(f"Downloaded {name}@{version}")
    (ROOT.parent / "THIRD-PARTY-LICENSES.txt").write_text(
        "\n\n--------\n\n".join(notices), encoding="utf-8"
    )


if __name__ == "__main__":
    download()
