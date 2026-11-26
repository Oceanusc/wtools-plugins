"""Download pinned browser libraries for wtools-image-batch; no build or package manager required."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2] / "plugins" / "wtools-image-batch" / "vendor"
PACKAGES = [
    ("pako", "2.1.0", {"dist/pako.min.js": "pako.min.js"}),
    ("upng-js", "2.1.0", {"UPNG.js": "UPNG.js"}),
    ("utif2", "4.1.0", {"UTIF.js": "UTIF.js"}),
    ("gifenc", "1.0.3", {"dist/gifenc.esm.js": "gifenc.esm.js"}),
    ("pdf-lib", "1.17.1", {"dist/pdf-lib.min.js": "pdf-lib.min.js"}),
    ("jszip", "3.10.1", {"dist/jszip.min.js": "jszip.min.js"}),
]


def download():
    ROOT.mkdir(parents=True, exist_ok=True)
    notices = []
    for name, version, files in PACKAGES:
        with urlopen(f"https://registry.npmjs.org/{name}/{version}", timeout=60) as response:
            metadata = json.load(response)
        with urlopen(metadata["dist"]["tarball"], timeout=60) as response:
            content = response.read()
        algorithm, expected = metadata["dist"]["integrity"].split("-", 1)
        actual = base64.b64encode(hashlib.new(algorithm, content).digest()).decode()
        if actual != expected:
            raise ValueError(f"Integrity mismatch: {name}@{version}")
        license_found = False
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
                if member.isfile() and relative.upper() in {"LICENSE", "LICENSE.TXT", "LICENSE.MD", "LICENSE.MARKDOWN"}:
                    license_found = True
                    notices.append(
                        f"{name} {version}\nhttps://www.npmjs.com/package/{name}/v/{version}\n"
                        + archive.extractfile(member).read().decode("utf-8")
                    )
        if not license_found:
            raise ValueError(f"Missing license: {name}@{version}")
        missing = [path for path in files.values() if not (ROOT / path).is_file()]
        if missing:
            raise ValueError(f"Missing files: {missing}")
        print(f"Downloaded {name}@{version}")
    (ROOT.parent / "THIRD-PARTY-LICENSES.txt").write_text("\n\n--------\n\n".join(notices), encoding="utf-8")


if __name__ == "__main__":
    download()
