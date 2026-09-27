"""
Fetch a prebuilt llama.cpp (CPU) plus `convert_hf_to_gguf.py` + its `conversion/`
package, into a SHORT path (C:\\llamacpp).

Why: Unsloth's own prebuilt downloader unpacks a Windows app bundle whose deepest
Svelte UI file path exceeds MAX_PATH, so extraction fails and it falls back to a
full cmake build. We only need two things, so grab them directly.

    python training/fetch_llamacpp.py

Env overrides: LLAMA_TAG (default b11178), LLAMA_DEST (default C:\\llamacpp).
"""

from __future__ import annotations

import os
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

TAG = os.environ.get("LLAMA_TAG", "b11178")
DEST = Path(os.environ.get("LLAMA_DEST", r"C:\llamacpp"))
BIN_URL = (
    f"https://github.com/ggml-org/llama.cpp/releases/download/{TAG}/"
    f"llama-{TAG}-bin-win-cpu-x64.zip"
)
SRC_URL = f"https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/{TAG}"


def download(url: str, dest: Path) -> None:
    print(f"[fetch] {url}")

    def hook(blocks: int, bs: int, total: int) -> None:
        if total > 0 and blocks % 200 == 0:
            pct = 100 * blocks * bs / total
            sys.stdout.write(f"\r  {pct:5.1f}%")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, hook)
    print(f"\r  -> {dest} ({dest.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    bin_dir = DEST / "bin"
    src_dir = DEST / "src"
    bin_dir.mkdir(exist_ok=True)
    src_dir.mkdir(exist_ok=True)

    quant = bin_dir / "llama-quantize.exe"
    if not quant.exists():
        z = DEST / "bin.zip"
        download(BIN_URL, z)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(bin_dir)
        z.unlink()
    print(f"[fetch] llama-quantize.exe: {'OK' if quant.exists() else 'MISSING'}")

    convert = next(src_dir.rglob("convert_hf_to_gguf.py"), None)
    gguf_py = next((p for p in src_dir.rglob("gguf-py") if p.is_dir()), None)
    if convert is None or gguf_py is None:
        t = DEST / "src.tar.gz"
        download(SRC_URL, t)
        with tarfile.open(t, "r:gz") as tf:
            # Converter + its helper package + the matching gguf-py (the PyPI
            # `gguf` wheel lags llama.cpp master and lacks new MODEL_ARCH values).
            members = [
                m for m in tf.getmembers()
                if m.name.endswith("/convert_hf_to_gguf.py")
                or "/conversion/" in m.name
                or "/gguf-py/" in m.name
            ]
            print(f"[fetch] extracting {len(members)} files (converter + gguf-py)")
            tf.extractall(src_dir, members=members)
        t.unlink()
        convert = next(src_dir.rglob("convert_hf_to_gguf.py"), None)
        gguf_py = next((p for p in src_dir.rglob("gguf-py") if p.is_dir()), None)
    print(f"[fetch] convert_hf_to_gguf.py: {convert}")
    print(f"[fetch] gguf-py: {gguf_py}")
    if convert is None or gguf_py is None or not quant.exists():
        raise SystemExit("fetch incomplete")


if __name__ == "__main__":
    main()
