"""A point for every ZIP code, from the US Census Bureau's ZCTA Gazetteer (issue #9).

The distance between two ZIP codes estimates the UPS and FedEx zone (their zone charts cannot
be collected by script; see docs/DECISIONS.md). The Census Bureau publishes, for every ZIP Code
Tabulation Area (ZCTA, an approximation of a 5-digit ZIP's area), an interior point. This script

1. finds the latest national ZCTA Gazetteer file by rule: the newest year, counting down from
   the current one, whose file exists at the Census URL pattern;
2. downloads it once (politely, checksum recorded in data/raw/manifest.csv; the zip, under
   1 MB, is committed like the other data zips);
3. writes data/processed/zip_points.csv: one row per ZCTA (zip5, lat, lon), and one row
   per 3-digit prefix (zip3) at the land-area-weighted centre of its ZCTAs. The prefix row is
   the fallback for ZIPs without a ZCTA (PO box and single-business ZIPs).

Usage:

    uv run python -m data.collect.zip_points
"""

from __future__ import annotations

import csv
import hashlib
import io
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

from data.collect.announcements import fetch

DATA = Path(__file__).resolve().parents[1]
RAW = DATA / "raw"
MANIFEST = RAW / "manifest.csv"
TABLE = DATA / "processed" / "zip_points.csv"
URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{year}_Gazetteer/{year}_Gaz_zcta_national.zip"
OLDEST = 2020


def latest_gazetteer() -> tuple[int, str, bytes] | None:
    for year in range(date.today().year, OLDEST - 1, -1):
        url = URL.format(year=year)
        body = fetch(url)
        if body and body[:2] == b"PK":
            return year, url, body
    return None


def rows_from(zip_bytes: bytes) -> list[dict]:
    """(zip5, lat, lon, land area) from the delimited text file inside the zip."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".txt"))
        text = archive.read(name).decode("utf-8-sig")
    # Tab-separated until 2025, pipe-separated from 2026.
    delimiter = "|" if "|" in text.split("\n", 1)[0] else "\t"
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    reader.fieldnames = [f.strip() for f in reader.fieldnames or []]
    return [
        {"zip5": r["GEOID"].strip(), "lat": float(r["INTPTLAT"]), "lon": float(r["INTPTLONG"]), "aland": float(r["ALAND"])}
        for r in reader
    ]


def points(rows: list[dict]) -> list[dict]:
    """ZCTA points plus land-area-weighted ZIP3 centres (plain mean when no land area)."""
    by3: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by3[r["zip5"][:3]].append(r)
    out = [{"zip": r["zip5"], "kind": "zcta", "lat": f"{r['lat']:.6f}", "lon": f"{r['lon']:.6f}"} for r in rows]
    for zip3, members in sorted(by3.items()):
        weight = sum(m["aland"] for m in members) or len(members)
        lat = sum(m["lat"] * (m["aland"] or 1) for m in members) / weight
        lon = sum(m["lon"] * (m["aland"] or 1) for m in members) / weight
        out.append({"zip": zip3, "kind": "zip3", "lat": f"{lat:.6f}", "lon": f"{lon:.6f}"})
    return out


def record(year: int, url: str, body: bytes) -> str:
    path = f"shared/census/{year}_Gaz_zcta_national.zip"
    target = RAW / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        manifest = [r for r in csv.DictReader(handle) if r["path"] != path]
    fields = list(manifest[0].keys())
    manifest.append({
        "carrier": "shared", "year": str(year), "path": path, "url": url, "method": "direct",
        "sha256": hashlib.sha256(body).hexdigest(), "bytes": str(len(body)), "in_git": "true",
        "content": f"US Census Bureau {year} ZCTA Gazetteer (national): interior point and land area per ZIP Code Tabulation Area",
    })
    with MANIFEST.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(manifest)
    return path


def main() -> int:
    found = latest_gazetteer()
    if not found:
        print("no ZCTA Gazetteer file found")
        return 1
    year, url, body = found
    path = record(year, url, body)
    out = points(rows_from(body))
    TABLE.parent.mkdir(parents=True, exist_ok=True)
    with TABLE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["zip", "kind", "lat", "lon"])
        writer.writeheader()
        writer.writerows(out)
    print(f"{path}: {sum(1 for r in out if r['kind'] == 'zcta')} ZCTAs, "
          f"{sum(1 for r in out if r['kind'] == 'zip3')} ZIP3 centres -> {TABLE.relative_to(DATA.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
