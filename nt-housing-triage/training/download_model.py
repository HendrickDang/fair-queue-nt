"""
Parallel, resumable model downloader for slow / rate-limited links.

The Hugging Face Hub's default downloader opens one connection per file and,
when unauthenticated, is rate-limited. On a slow link a single 10 GB safetensors
file crawls. This splits each large file into N ranged chunks fetched in
parallel, with per-chunk resume and SHA-256 verification, so an interrupted run
continues where it left off.

    python training/download_model.py --repo unsloth/gemma-4-E2B-it --out training/models/base
    python training/finetune_gemma4.py --model training/models/base

Set HF_TOKEN to lift the anonymous rate limit (recommended):
    $env:HF_TOKEN = "hf_..."
"""

from __future__ import annotations

import argparse
import hashlib
import os
import threading
import time
from pathlib import Path

import requests

API = "https://huggingface.co/api/models/{repo}?blobs=true"
RESOLVE = "https://huggingface.co/{repo}/resolve/main/{path}"

TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
HEADERS = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}

_stop = threading.Event()
_done = 0
_total = 0
_out_dir = Path(".")


def list_files(repo: str) -> list[tuple[str, int, str | None]]:
    r = requests.get(API.format(repo=repo), headers=HEADERS, timeout=60)
    r.raise_for_status()
    out: list[tuple[str, int, str | None]] = []
    for s in r.json().get("siblings", []):
        name = s["rfilename"]
        if name.endswith("/"):
            continue
        lfs = s.get("lfs") or {}
        size = int(s.get("size") or lfs.get("size") or 0)
        out.append((name, size, lfs.get("sha256")))
    return out


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def download_file(repo: str, name: str, size: int, sha: str | None, parts: int) -> None:
    url = RESOLVE.format(repo=repo, path=name)
    dest = _out_dir / name
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and dest.stat().st_size == size:
        if not sha or sha256_of(dest) == sha:
            print(f"  [skip] {name} (complete)", flush=True)
            return
        print(f"  [redo] {name} (hash mismatch)", flush=True)
        dest.unlink()

    if size == 0:
        r = requests.get(url, headers=HEADERS, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return

    n_parts = parts if size > 32 * 1024 * 1024 else 1
    chunk = size // n_parts + 1
    part_paths = [dest.with_name(dest.name + f".part{i}") for i in range(n_parts)]

    def worker(i: int) -> None:
        start = i * chunk
        end = min(size - 1, start + chunk - 1)
        if start > end:
            return
        pf = part_paths[i]
        want = end - start + 1
        for attempt in range(8):
            if _stop.is_set():
                return
            # Re-read every attempt: a failed try may have written partial bytes.
            have = pf.stat().st_size if pf.exists() else 0
            if have > want:          # oversized => corrupt; restart this chunk
                pf.unlink()
                have = 0
            if have == want:
                return
            headers = dict(HEADERS)
            headers["Range"] = f"bytes={start + have}-{end}"
            try:
                with requests.get(url, headers=headers, stream=True, timeout=120) as r:
                    if r.status_code not in (200, 206):
                        raise RuntimeError(f"HTTP {r.status_code}")
                    mode = "ab" if have else "wb"
                    with open(pf, mode) as f:
                        for c in r.iter_content(1024 * 512):
                            f.write(c)
                        f.flush()
                continue  # loop re-checks size (handles short reads)
            except Exception as e:  # noqa: BLE001
                if attempt == 7:
                    print(f"  [fail] {name} part {i}: {e}", flush=True)
                    _stop.set()
                else:
                    time.sleep(2 * (attempt + 1))

    threads = [threading.Thread(target=worker, args=(i,), daemon=True) for i in range(n_parts)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    if _stop.is_set():
        raise SystemExit("aborted (partial chunks kept for resume)")

    with open(dest, "wb") as out:
        for pf in part_paths:
            with open(pf, "rb") as src:
                for block in iter(lambda: src.read(8 * 1024 * 1024), b""):
                    out.write(block)
            pf.unlink()

    got = dest.stat().st_size
    if got != size:
        raise SystemExit(f"size mismatch for {name}: got {got}, want {size}")
    if sha and sha256_of(dest) != sha:
        dest.unlink()
        raise SystemExit(f"SHA-256 mismatch for {name} (file removed; re-run to retry)")
    print(f"  [ok]   {name} ({got / 1e9:.2f} GB)", flush=True)


def disk_bytes() -> int:
    total = 0
    for p in _out_dir.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def progress_loop() -> None:
    last, last_t = 0, time.time()
    while not _stop.is_set():
        time.sleep(3)
        now = disk_bytes()
        dt = time.time() - last_t
        rate = (now - last) / dt / 1e6 if dt else 0
        last, last_t = now, time.time()
        pct = 100 * now / _total if _total else 0
        print(f"  {now / 1e9:.2f}/{_total / 1e9:.2f} GB  {pct:.1f}%  {rate:.2f} MB/s", flush=True)


def main() -> None:
    global _total, _out_dir
    ap = argparse.ArgumentParser(description="Parallel resumable model downloader.")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--parts", type=int, default=8)
    args = ap.parse_args()

    _out_dir = Path(args.out)
    files = list_files(args.repo)
    _total = sum(s for _, s, _ in files)
    print(f"{args.repo}: {len(files)} files, {_total / 1e9:.2f} GB -> {_out_dir}", flush=True)
    if not HEADERS:
        print("  (no HF_TOKEN set — download may be rate-limited)", flush=True)

    threading.Thread(target=progress_loop, daemon=True).start()
    for name, size, sha in files:
        download_file(args.repo, name, size, sha, args.parts)

    _stop.set()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
