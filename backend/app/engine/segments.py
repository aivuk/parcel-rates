"""Parcel segments used by the segment filter and the yearly driver breakdown.

Band labels and edges come from docs/API.md ("Segments"). Zone bands use the
USPS zone of the parcel's distance, the finest of the carriers' band tables.
"""

from __future__ import annotations

from dataclasses import dataclass

from .rules import parcel_zone
from .tables import RateTables
from .types import Parcel

# (label, lower bound exclusive, upper bound inclusive)
WEIGHT_BANDS: tuple[tuple[str, float, float], ...] = (
    ("≤1", 0.0, 1.0),
    ("1–5", 1.0, 5.0),
    ("5–10", 5.0, 10.0),
    ("10–20", 10.0, 20.0),
    ("20–70", 20.0, 70.0),
)
ZONE_BANDS: tuple[tuple[str, int, int], ...] = (
    ("1–2", 1, 2),
    ("3–4", 3, 4),
    ("5–6", 5, 6),
    ("7–8", 7, 8),
)
SEGMENT_CARRIER = "usps"
DIMENSIONS = ("weight_band", "zone_band", "residential", "speed")


@dataclass(frozen=True)
class SegmentFilter:
    weight_band: str | None = None
    zone_band: str | None = None
    residential: bool | None = None
    speed: str | None = None


def weight_band(parcel: Parcel) -> str:
    for label, low, high in WEIGHT_BANDS:
        if low < parcel.weight_lb <= high:
            return label
    return WEIGHT_BANDS[-1][0]


def zone_band(tables: RateTables, parcel: Parcel) -> str:
    zone, _ = parcel_zone(tables, SEGMENT_CARRIER, parcel)
    for label, low, high in ZONE_BANDS:
        if zone is not None and low <= zone <= high:
            return label
    return ZONE_BANDS[-1][0]


def residential_label(parcel: Parcel) -> str:
    return "residential" if parcel.residential else "business"


def segment_of(tables: RateTables, parcel: Parcel) -> dict[str, str]:
    return {
        "weight_band": weight_band(parcel),
        "zone_band": zone_band(tables, parcel),
        "residential": residential_label(parcel),
        "speed": parcel.speed,
    }


def matches(tables: RateTables, parcel: Parcel, f: SegmentFilter | None) -> bool:
    if f is None:
        return True
    if f.weight_band is not None and weight_band(parcel) != f.weight_band:
        return False
    if f.zone_band is not None and zone_band(tables, parcel) != f.zone_band:
        return False
    if f.residential is not None and parcel.residential != f.residential:
        return False
    if f.speed is not None and parcel.speed != f.speed:
        return False
    return True
