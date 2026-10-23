"""Zones from ZIP codes (issue #9).

USPS: the real zone chart for the origin's 3-digit prefix (data/processed/usps/zone_chart.csv,
collected by data/collect/usps_zones.py). UPS and FedEx publish zone charts too, but not in a
form a script may collect, so their zone is estimated: the great-circle distance between the
two ZIPs' Census points (data/processed/zip_points.csv, data/collect/zip_points.py), then the
same distance bands as typed miles.
"""

from __future__ import annotations

import csv
import math
import re
from dataclasses import dataclass
from pathlib import Path

EARTH_RADIUS_MILES = 3958.8
ZIP_PATTERN = re.compile(r"^(\d{5})(?:-\d{4})?$")


@dataclass(frozen=True)
class ZipPoint:
    lat: float
    lon: float
    basis: str  # "zcta": the ZIP's own Census area; "zip3": the centre of its 3-digit prefix


def great_circle_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def zip5(value: str) -> str | None:
    match = ZIP_PATTERN.match(value.strip())
    return match.group(1) if match else None


@dataclass
class ZipZones:
    points: dict[str, tuple[float, float]]  # zip5 -> point
    centres: dict[str, tuple[float, float]]  # zip3 -> point
    usps_chart: dict[str, str]  # origin zip3 -> one zone digit per destination zip3 000-999
    usps_effective: str
    census_year: str

    def point(self, value: str) -> ZipPoint | None:
        code = zip5(value)
        if code is None:
            return None
        if code in self.points:
            return ZipPoint(*self.points[code], "zcta")
        if code[:3] in self.centres:
            return ZipPoint(*self.centres[code[:3]], "zip3")
        return None

    def miles(self, origin: str, destination: str) -> float | None:
        a, b = self.point(origin), self.point(destination)
        if a is None or b is None:
            return None
        return great_circle_miles((a.lat, a.lon), (b.lat, b.lon))

    def usps_zone(self, origin: str, destination: str) -> int | None:
        o, d = zip5(origin), zip5(destination)
        if o is None or d is None:
            return None
        row = self.usps_chart.get(o[:3])
        if row is None:
            return None
        digit = row[int(d[:3])]
        return int(digit) if digit != "0" else None


def load_zip_zones(data_dir: Path) -> ZipZones | None:
    """None when the ZIP tables are not there (the app then needs typed distances)."""
    points_path = data_dir / "zip_points.csv"
    chart_path = data_dir / "usps" / "zone_chart.csv"
    if not points_path.exists():
        return None
    points: dict[str, tuple[float, float]] = {}
    centres: dict[str, tuple[float, float]] = {}
    with points_path.open(newline="", encoding="utf-8") as handle:
        for r in csv.DictReader(handle):
            target = points if r["kind"] == "zcta" else centres
            target[r["zip"]] = (float(r["lat"]), float(r["lon"]))
    chart: dict[str, str] = {}
    effective = ""
    if chart_path.exists():
        with chart_path.open(newline="", encoding="utf-8") as handle:
            for r in csv.DictReader(handle):
                chart[r["origin_zip3"]] = r["zones"]
                effective = r["effective_date"] or effective
    return ZipZones(points, centres, chart, effective, census_year="")
