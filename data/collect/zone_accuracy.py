"""How accurate is a zone estimated from the distance between two ZIP codes? (issue #9)

UPS and FedEx zones are estimated: great-circle miles between Census ZIP points, then the
distance bands in data/processed/zone_from_distance.csv. This script measures that estimate
against real zone charts and writes docs/data/ZONE_ACCURACY.md:

- USPS: the same estimate with the USPS bands, against the real USPS chart for every origin
  (data/processed/usps/zone_chart.csv), contiguous 48 states;
- UPS: the estimate with the UPS bands, against the UPS Ground zone charts that the Wayback
  Machine holds for 2026 (five origins in October 2026; ups.com itself refuses scripted
  downloads). They are saved to data/raw/ups/zones/ with manifest rows. A third method is
  measured too: the real USPS chart zone read as a UPS zone (UPS zone 2 covers USPS 1 and 2).

Two ways to place a ZIP are measured for the distance: the centre of its 3-digit prefix (the
charts are defined per prefix) and, on a fixed random sample of 5-digit pairs, the ZIP's own
Census point.

Usage:

    uv run python -m data.collect.zone_accuracy
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import random
import sys
from collections import Counter
from pathlib import Path

from data.collect.announcements import CDX, fetch

DATA = Path(__file__).resolve().parents[1]
ROOT = DATA.parent
PROCESSED = DATA / "processed"
RAW = DATA / "raw"
MANIFEST = RAW / "manifest.csv"
REPORT = ROOT / "docs" / "data" / "ZONE_ACCURACY.md"
UPS_PREFIX = "www.ups.com/media/us/currentrates/zone-csv/"
UPS_FROM = "2026"
SAMPLE_PAIRS = 200_000
SEED = 20261023

# ZIP3 prefixes outside the contiguous 48 states (PR, VI, military, HI, Pacific, AK).
NOT_CONTIGUOUS = {*range(6, 10), *range(90, 100), 340, *range(962, 970), *range(995, 1000)}


def great_circle_miles(a, b) -> float:
    import math

    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def bands(carrier: str) -> list[tuple[int, float, float | None]]:
    with (PROCESSED / "zone_from_distance.csv").open(newline="", encoding="utf-8") as handle:
        rows = [r for r in csv.DictReader(handle) if r["carrier"] == carrier]
    return sorted(
        (int(r["zone"]), float(r["min_miles"]), float(r["max_miles"]) if r["max_miles"] else None) for r in rows
    )


def zone_for(table, miles: float) -> int | None:
    """Same rule as backend/app/engine/rules.py zone_for."""
    for zone, low, high in table:
        if miles >= low and (high is None or miles <= high):
            return zone
    for zone, low, _ in table:
        if miles < low:
            return zone
    return None


def load_points() -> tuple[dict[str, tuple[float, float]], dict[str, tuple[float, float]]]:
    zcta, centres = {}, {}
    with (PROCESSED / "zip_points.csv").open(newline="", encoding="utf-8") as handle:
        for r in csv.DictReader(handle):
            (zcta if r["kind"] == "zcta" else centres)[r["zip"]] = (float(r["lat"]), float(r["lon"]))
    return zcta, centres


def load_usps_chart() -> dict[str, str]:
    with (PROCESSED / "usps" / "zone_chart.csv").open(newline="", encoding="utf-8") as handle:
        return {r["origin_zip3"]: r["zones"] for r in csv.DictReader(handle)}


class Tally:
    def __init__(self) -> None:
        self.diff: Counter[int] = Counter()

    def add(self, real: int, estimate: int | None) -> None:
        if estimate is not None:
            self.diff[estimate - real] += 1

    @property
    def n(self) -> int:
        return sum(self.diff.values())

    def share(self, pred) -> str:
        return f"{sum(v for k, v in self.diff.items() if pred(k)) / self.n:.1%}" if self.n else "–"

    def row(self, label: str) -> str:
        return (f"| {label} | {self.n:,} | {self.share(lambda d: d == 0)} | {self.share(lambda d: abs(d) == 1)} | "
                f"{self.share(lambda d: abs(d) >= 2)} | {self.share(lambda d: d < 0)} | {self.share(lambda d: d > 0)} |")


def contiguous(zip3: str) -> bool:
    return int(zip3) not in NOT_CONTIGUOUS


# ---------------------------------------------------------------------------- USPS
def usps_tallies(chart, zcta, centres) -> tuple[Tally, Tally]:
    usps = bands("usps")
    by_prefix, by_zip = Tally(), Tally()
    origins = [o for o in chart if contiguous(o) and o in centres]
    for o in origins:
        row = chart[o]
        for d in range(1000):
            d3 = f"{d:03d}"
            real = row[d]
            if real == "0" or not contiguous(d3) or d3 not in centres:
                continue
            by_prefix.add(int(real), zone_for(usps, great_circle_miles(centres[o], centres[d3])))
    rng = random.Random(SEED)
    zips = [z for z in zcta if contiguous(z[:3]) and z[:3] in chart]
    for _ in range(SAMPLE_PAIRS):
        a, b = rng.choice(zips), rng.choice(zips)
        real = chart[a[:3]][int(b[:3])]
        if real != "0":
            by_zip.add(int(real), zone_for(usps, great_circle_miles(zcta[a], zcta[b])))
    return by_prefix, by_zip


# ---------------------------------------------------------------------------- UPS
def ups_captures() -> list[tuple[str, str]]:
    """(origin zip3, id_ URL) for the latest 2026 capture of each archived UPS zone chart."""
    query = f"{CDX}?url={UPS_PREFIX}&matchType=prefix&output=json&fl=timestamp,original&filter=statuscode:200&from={UPS_FROM}"
    body = fetch(query)
    latest: dict[str, tuple[str, str]] = {}
    for timestamp, original in json.loads(body.decode("utf-8") or "[]")[1:] if body else []:
        name = original.rsplit("/", 1)[-1].split("?")[0]
        zip3 = name.split(".")[0]
        if zip3.isdigit() and len(zip3) == 3 and (zip3 not in latest or timestamp > latest[zip3][0]):
            latest[zip3] = (timestamp, original)
    return [(z, f"https://web.archive.org/web/{t}id_/{u}") for z, (t, u) in sorted(latest.items())]


def ups_chart(body: bytes) -> dict[str, int]:
    """Destination ZIP3 -> UPS Ground zone (2-8) from a UPS zone workbook."""
    import openpyxl

    sheet = openpyxl.load_workbook(io.BytesIO(body), read_only=True).worksheets[0]
    out: dict[str, int] = {}
    for row in sheet.iter_rows(values_only=True):
        dest, ground = (str(row[0] or "").strip(), str(row[1] or "").strip()) if len(row) > 1 else ("", "")
        if not ground.isdigit() or not 2 <= int(ground) <= 8:
            continue  # headers, '-' and the 044-046 zones of Alaska, Hawaii, Puerto Rico
        parts = dest.split("-")
        if all(p.isdigit() and len(p) == 3 for p in parts):
            for d in range(int(parts[0]), int(parts[-1]) + 1):
                out[f"{d:03d}"] = int(ground)
    return out


def save_raw(path: str, url: str, body: bytes) -> None:
    target = RAW / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        manifest = [r for r in csv.DictReader(handle) if r["path"] != path]
    fields = list(manifest[0].keys())
    manifest.append({"carrier": "ups", "year": "2026", "path": path, "url": url, "method": "wayback",
                     "sha256": hashlib.sha256(body).hexdigest(), "bytes": str(len(body)), "in_git": "true",
                     "content": "UPS zone chart (Ground and air zones by destination ZIP3) for one origin, Wayback capture; "
                                "used only to measure the distance-based zone estimate"})
    with MANIFEST.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(manifest)


def usps_as_private(digit: str) -> int | None:
    """A USPS chart zone read as a UPS/FedEx zone: their zone 2 covers USPS zones 1 and 2."""
    if digit == "0":
        return None
    return max(2, int(digit))


def ups_tallies(zcta, centres, chart) -> tuple[list[tuple[str, Tally, Tally, Tally]], list[str]]:
    ups = bands("ups")
    rng = random.Random(SEED)
    out, sources = [], []
    for zip3, url in ups_captures():
        body = fetch(url)
        if not body or body[:2] != b"PK":
            continue
        path = f"ups/zones/{zip3}_{url.split('/web/')[1][:8]}.xlsx"
        save_raw(path, url, body)
        sources.append(f"`data/raw/{path}`")
        real = ups_chart(body)
        by_prefix, by_zip, by_usps = Tally(), Tally(), Tally()
        for d3, zone in real.items():
            if contiguous(d3) and d3 in centres and zip3 in centres:
                by_prefix.add(zone, zone_for(ups, great_circle_miles(centres[zip3], centres[d3])))
            if contiguous(d3) and zip3 in chart:
                by_usps.add(zone, usps_as_private(chart[zip3][int(d3)]))
        origins = [z for z in zcta if z[:3] == zip3]
        dests = [z for z in zcta if z[:3] in real and contiguous(z[:3])]
        for _ in range(SAMPLE_PAIRS // 20):
            a, b = rng.choice(origins), rng.choice(dests)
            by_zip.add(real[b[:3]], zone_for(ups, great_circle_miles(zcta[a], zcta[b])))
        out.append((zip3, by_prefix, by_zip, by_usps))
    return out, sources


HEADER = "| Measured | Pairs | Exact | Off by one | Off by two or more | Estimate lower | Estimate higher |\n|---|---|---|---|---|---|---|"


def main() -> int:
    zcta, centres = load_points()
    chart = load_usps_chart()
    usps_prefix, usps_zip = usps_tallies(chart, zcta, centres)
    ups, sources = ups_tallies(zcta, centres, chart)
    lines = [
        "# Zone estimate from ZIP distance: measured accuracy",
        "",
        "Generated by `uv run python -m data.collect.zone_accuracy` (issue #9). UPS and FedEx zones",
        "are estimated from the great-circle distance between two ZIP codes' Census points and the",
        "distance bands in `data/processed/zone_from_distance.csv`; this measures that estimate",
        "against real charts, contiguous 48 states. \"Lower\" means the estimate is a lower zone than",
        "the chart (a cheaper price than the carrier would charge).",
        "",
        "The app estimates UPS and FedEx zones from the distance between the two ZIPs' prefix",
        "centres, the method that measured closest to both carriers' charts below; USPS zones come",
        "from the USPS chart itself.",
        "",
        f"## USPS: the same estimate against the real USPS chart ({len(chart)} origin prefixes)",
        "",
        HEADER,
        usps_prefix.row("ZIP3 centres, every prefix pair"),
        usps_zip.row(f"5-digit ZIP points, {SAMPLE_PAIRS:,} random pairs"),
        "",
        "The app does not use this estimate for USPS: it reads the USPS chart. It shows how close a",
        "distance estimate gets where the real answer is known.",
        "",
        f"## UPS: against the UPS Ground charts archived for 2026 ({len(ups)} origins)",
        "",
        HEADER,
    ]
    total_prefix, total_zip, total_usps = Tally(), Tally(), Tally()
    for zip3, by_prefix, by_zip, by_usps in ups:
        lines.append(by_prefix.row(f"origin {zip3}, distance between ZIP3 centres"))
        lines.append(by_zip.row(f"origin {zip3}, distance between 5-digit points (sample)"))
        lines.append(by_usps.row(f"origin {zip3}, the USPS chart zone (USPS 1 read as 2)"))
        total_prefix.diff.update(by_prefix.diff)
        total_zip.diff.update(by_zip.diff)
        total_usps.diff.update(by_usps.diff)
    lines += [
        total_prefix.row("**all origins, distance between ZIP3 centres**"),
        total_zip.row("**all origins, distance between 5-digit points (sample)**"),
        total_usps.row("**all origins, the USPS chart zone (USPS 1 read as 2)**"),
        "",
    ]
    lines += ["Sources: " + ", ".join(sources) + "." if sources else "No archived UPS chart could be fetched.", ""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
