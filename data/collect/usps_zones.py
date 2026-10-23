"""Collect the USPS domestic zone chart for every origin 3-digit ZIP prefix (issue #9).

USPS publishes zones per origin ZIP3 through the Domestic Zone Chart tool on postcalc.usps.com,
which answers with JSON: destination ZIP3 ranges and their zone. This script

1. fetches the chart of a seed origin (100, New York) and expands its destination ranges into
   the list of ZIP3 prefixes, which is the list of origins to collect (discovery by rule);
2. fetches each origin's chart once, sequentially and politely (pause with jitter, retries
   with backoff, identifying User-Agent), resumable: a chart already on disk is not fetched
   again. Raw charts go to data/raw/usps/zones/charts/<zip3>.json (not in git, like the PDFs),
   each listed with its URL, checksum and effective date in data/raw/usps/zones/charts.csv;
3. writes data/processed/usps/zone_chart.csv: one row per origin with a 1,000-character string,
   one zone digit per destination ZIP3 000-999 ("0" where the chart lists none).

The zone markers are dropped: "*" (same network distribution center, which matters only for
Parcel Select) and "+" (5-digit exceptions, listed separately; they are military APO/FPO
ranges), and so are the few 5-digit entries the tool lists among the ZIP3 ranges (96700).
The effective date the tool reports is kept per origin.

Usage (about an hour for every origin at the default pace):

    uv run python -m data.collect.usps_zones                    # fetch what is missing, then build
    uv run python -m data.collect.usps_zones --limit 3          # try three origins
    uv run python -m data.collect.usps_zones --build-only       # rebuild the table from data/raw
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from data.collect.announcements import fetch

DATA = Path(__file__).resolve().parents[1]
CHARTS = DATA / "raw" / "usps" / "zones" / "charts"
CHART_LIST = DATA / "raw" / "usps" / "zones" / "charts.csv"
TABLE = DATA / "processed" / "usps" / "zone_chart.csv"
URL = "https://postcalc.usps.com/DomesticZoneChart/GetZoneChart?zipCode3Digit={zip3}&shippingDate={month:02d}%2F{day:02d}%2F{year}"
SEED = "100"
LIST_COLUMNS = ["origin_zip3", "url", "sha256", "bytes", "effective_date", "fetched_on"]


def ranges(chart: dict) -> list[tuple[int, int, str]]:
    """(first ZIP3, last ZIP3, zone with markers) from the chart's columns, in order."""
    out = []
    for key in sorted(k for k in chart if k.startswith("Column")):
        for row in chart[key]:
            parts = row["ZipCodes"].split("---")
            if any(len(p) != 3 for p in parts):
                continue  # a 5-digit exception (e.g. 96700) inside the ZIP3 columns
            first, last = int(parts[0]), int(parts[-1])
            out.append((first, last, row["Zone"].strip()))
    return out


def zone_string(chart: dict) -> str:
    """One digit per destination ZIP3 000-999; markers dropped, "0" where none is listed."""
    cells = ["0"] * 1000
    for first, last, zone in ranges(chart):
        digit = zone.rstrip("*+")
        if not digit.isdigit() or len(digit) != 1:
            raise ValueError(f"unexpected zone {zone!r}")
        for z in range(first, last + 1):
            cells[z] = digit
    return "".join(cells)


def origins_from(chart: dict) -> list[str]:
    """Every ZIP3 the chart lists as a destination: the prefixes that exist."""
    found = set()
    for first, last, _ in ranges(chart):
        found.update(range(first, last + 1))
    return [f"{z:03d}" for z in sorted(found)]


def read_list() -> dict[str, dict]:
    if not CHART_LIST.exists():
        return {}
    with CHART_LIST.open(newline="", encoding="utf-8") as handle:
        return {r["origin_zip3"]: r for r in csv.DictReader(handle)}


def write_list(rows: dict[str, dict]) -> None:
    CHART_LIST.parent.mkdir(parents=True, exist_ok=True)
    with CHART_LIST.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=LIST_COLUMNS)
        writer.writeheader()
        writer.writerows(rows[k] for k in sorted(rows))


def get_chart(zip3: str, on: date, listed: dict[str, dict]) -> dict | None:
    """The chart from disk when its checksum matches the list, else fetched and recorded."""
    path = CHARTS / f"{zip3}.json"
    row = listed.get(zip3)
    if path.exists() and row and hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"]:
        return json.loads(path.read_text(encoding="utf-8"))
    url = URL.format(zip3=zip3, month=on.month, day=on.day, year=on.year)
    body = fetch(url)
    if body is None:
        return None
    chart = json.loads(body.decode("utf-8"))
    if chart.get("ZIPCodeError") or not any(k.startswith("Column") for k in chart):
        print(f"  {zip3}: no chart ({chart.get('ZIPCodeError') or 'empty'})")
        return None
    CHARTS.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    listed[zip3] = {
        "origin_zip3": zip3, "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": str(len(body)),
        "effective_date": chart.get("EffectiveDate", ""), "fetched_on": date.today().isoformat(),
    }
    return chart


def build(listed: dict[str, dict]) -> int:
    """Write the processed table from every chart on disk."""
    rows = []
    for zip3 in sorted(listed):
        path = CHARTS / f"{zip3}.json"
        if not path.exists():
            continue
        chart = json.loads(path.read_text(encoding="utf-8"))
        rows.append({"origin_zip3": zip3, "effective_date": listed[zip3]["effective_date"],
                     "zones": zone_string(chart), "source_file": f"usps/zones/charts/{zip3}.json"})
    TABLE.parent.mkdir(parents=True, exist_ok=True)
    with TABLE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["origin_zip3", "effective_date", "zones", "source_file"])
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--limit", type=int, help="fetch at most this many origins")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--date", type=date.fromisoformat, default=date.today(), help="shipping date asked for")
    args = parser.parse_args(argv)

    listed = read_list()
    if not args.build_only:
        seed = get_chart(SEED, args.date, listed)
        if seed is None:
            print("the seed chart could not be fetched")
            return 1
        origins = origins_from(seed)
        print(f"{len(origins)} ZIP3 prefixes listed; {sum(1 for o in origins if o in listed)} already on disk")
        todo = [o for o in origins if o not in listed]
        if args.limit is not None:
            todo = todo[: args.limit]
        for i, zip3 in enumerate(todo, 1):
            get_chart(zip3, args.date, listed)
            if i % 25 == 0 or i == len(todo):
                write_list(listed)
                print(f"  {i}/{len(todo)} fetched")
        write_list(listed)
    print(f"wrote {build(listed)} origin rows to {TABLE.relative_to(DATA.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
