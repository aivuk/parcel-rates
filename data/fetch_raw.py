#!/usr/bin/env python3
"""Restore raw source files listed in data/raw/manifest.csv, politely.

Fetches one file at a time, pauses between requests, retries with backoff on
429/5xx/timeouts, identifies itself with a User-Agent, verifies SHA-256
checksums, and never re-downloads a file whose checksum already matches.

Usage:
  python3 data/fetch_raw.py                 # fetch everything missing or mismatched
  python3 data/fetch_raw.py --carrier ups   # one carrier
  python3 data/fetch_raw.py --verify        # only check what is on disk
  python3 data/fetch_raw.py --record        # fill empty sha256/bytes in the manifest after fetching

Standard library only, so it runs with any Python 3.8+.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAW_DIR = Path(__file__).resolve().parent / "raw"
MANIFEST = RAW_DIR / "manifest.csv"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) parcel-rates-dashboard/0.1 "
    "(+https://github.com/aivuk/parcel-rates; polite sequential fetcher)"
)
PAUSE_SECONDS = 3.0
JITTER_SECONDS = 2.0
BACKOFF_SECONDS = (10, 30, 90)
TIMEOUT_SECONDS = 120
GZIP_MAGIC = b"\x1f\x8b"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest() -> list[dict]:
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_manifest(rows: list[dict]) -> None:
    fields = list(rows[0].keys())
    tmp = MANIFEST.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(MANIFEST)


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt, backoff in enumerate((*BACKOFF_SECONDS, None)):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            last_error = error
            retryable = error.code == 429 or error.code >= 500
            if not retryable or backoff is None:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            if backoff is None:
                raise
        print(f"    retry {attempt + 1} in {backoff}s ({last_error})", flush=True)
        time.sleep(backoff)
    raise RuntimeError(f"unreachable: {last_error}")


def maybe_gunzip(data: bytes, target: Path) -> bytes:
    """Wayback's id_ passthrough returns the original bytes, which for some
    HTML captures are still gzip-encoded. Decompress unless the target is a
    gzip file by name."""
    if data[:2] == GZIP_MAGIC and target.suffix not in {".gz", ".zip"}:
        return gzip.decompress(data)
    return data


def status_of(row: dict) -> str:
    target = RAW_DIR / row["path"]
    if not target.is_file():
        return "missing"
    if not row["sha256"]:
        return "unverified"
    return "ok" if sha256_of(target) == row["sha256"] else "mismatch"


def fetch_row(row: dict) -> None:
    target = RAW_DIR / row["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    data = maybe_gunzip(fetch_bytes(row["url"]), target)
    tmp = target.with_name(target.name + ".part")
    tmp.write_bytes(data)
    tmp.replace(target)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--carrier", help="only this carrier")
    parser.add_argument("--verify", action="store_true", help="check only, fetch nothing")
    parser.add_argument("--record", action="store_true", help="fill empty sha256/bytes after fetching")
    parser.add_argument("--limit", type=int, default=0, help="stop after N fetches")
    args = parser.parse_args(argv)

    rows = read_manifest()
    selected = [r for r in rows if not args.carrier or r["carrier"] == args.carrier]
    fetched = failed = 0
    for row in selected:
        state = status_of(row)
        target = RAW_DIR / row["path"]
        if state == "ok":
            continue
        if state == "unverified" and not args.record:
            print(f"?? {row['path']}: present, no checksum in manifest")
            continue
        if args.verify:
            print(f"!! {row['path']}: {state}")
            failed += 1
            continue
        if state in {"missing", "mismatch"}:
            if fetched:
                time.sleep(PAUSE_SECONDS + random.uniform(0, JITTER_SECONDS))
            print(f".. {row['path']} <- {row['url']}", flush=True)
            try:
                fetch_row(row)
                fetched += 1
            except Exception as error:  # noqa: BLE001 - report and continue with the next file
                print(f"!! {row['path']}: {error}")
                failed += 1
                continue
        if args.record and target.is_file():
            digest = sha256_of(target)
            if row["sha256"] and row["sha256"] != digest:
                print(f"!! {row['path']}: checksum changed, not overwriting manifest")
                failed += 1
                continue
            row["sha256"] = digest
            row["bytes"] = str(target.stat().st_size)
        if args.limit and fetched >= args.limit:
            break
    if args.record:
        write_manifest(rows)
    print(f"done: {fetched} fetched, {failed} problems, {len(selected)} rows considered")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
