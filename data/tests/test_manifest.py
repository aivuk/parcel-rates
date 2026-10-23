"""Tracked raw files must be present and match their manifest checksum."""
from __future__ import annotations

import hashlib

import pytest

from data.pipeline.common import RAW_DIR, manifest_rows


def sha256_of(path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def test_manifest_columns():
    assert list(manifest_rows()[0].keys()) == [
        "carrier", "year", "path", "url", "method", "sha256", "bytes", "in_git", "content"
    ]


@pytest.mark.parametrize("row", [pytest.param(r, id=r["path"]) for r in manifest_rows() if r["in_git"] == "true"])
def test_tracked_file_matches_checksum(row):
    path = RAW_DIR / row["path"]
    assert path.is_file(), f"{row['path']} tracked in git but missing"
    assert sha256_of(path) == row["sha256"], f"{row['path']} checksum differs from manifest"
    assert str(path.stat().st_size) == row["bytes"]


def test_wayback_urls_use_passthrough():
    bad = [r["path"] for r in manifest_rows() if r["method"] == "wayback" and "id_/" not in r["url"]]
    assert not bad, bad
