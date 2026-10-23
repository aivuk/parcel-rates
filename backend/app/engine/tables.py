"""Load the processed rate tables into memory.

Every amount the engine uses comes from these tables. The loader reads the CSVs
under ``data/processed`` (see docs/data/SCHEMA.md) and indexes them for fast
lookup. Tests can build a ``RateTables`` directly from row dicts to inject a
small synthetic dataset.
"""

from __future__ import annotations

import csv
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Mapping

CARRIERS = ("usps", "ups", "fedex")
TIERS = ("ground", "two_three_day", "next_day")


def _bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


def _dec(value: str) -> Decimal | None:
    value = (value or "").strip()
    return Decimal(value) if value else None


def _int(value: str) -> int | None:
    value = (value or "").strip()
    return int(value) if value else None


def _date(value: str) -> date | None:
    value = (value or "").strip()
    return date.fromisoformat(value) if value else None


def in_window(as_of: date, start: date | None, end: date | None) -> bool:
    """True when ``as_of`` lies in [start, end]; an empty end is open-ended."""
    if start is not None and as_of < start:
        return False
    if end is not None and as_of > end:
        return False
    return True


@dataclass(frozen=True)
class Service:
    carrier: str
    service_id: str
    display_name: str
    tier: str
    residential_allowed: bool
    business_allowed: bool
    rate_cards: tuple[str, ...]
    rate_card_notes: str
    max_weight_lb: int
    notes: str


@dataclass(frozen=True)
class ZoneBand:
    carrier: str
    zone: int
    min_miles: int
    max_miles: int | None


@dataclass(frozen=True)
class RateStep:
    max_weight_lb: Decimal
    price: Decimal
    source_file: str
    source_ref: str


@dataclass(frozen=True)
class SurchargeRule:
    carrier: str
    year: int
    rate_card: str
    surcharge_id: str
    display_name: str
    condition: str
    applies_to: str
    address_type: str
    min_weight_lb: Decimal | None
    max_weight_lb: Decimal | None
    min_length_in: Decimal | None
    min_width_in: Decimal | None
    min_length_plus_girth_in: Decimal | None
    min_volume_cuft: Decimal | None
    zone_min: int | None
    zone_max: int | None
    amount: Decimal
    unit: str
    exclusive_group: str
    effective_from: date | None
    effective_to: date | None
    fuel_applies: bool
    source_file: str
    source_page: str


@dataclass(frozen=True)
class DimRule:
    carrier: str
    year: int
    effective_from: date | None
    effective_to: date | None
    divisor: int
    min_volume_cuin: int
    rounding: str
    source_file: str
    source_ref: str


@dataclass(frozen=True)
class FuelRow:
    carrier: str
    year: int
    service_group: str
    default_percent: Decimal
    is_proxy: bool
    window_start: date | None
    window_end: date | None
    source_file: str
    source_ref: str


@dataclass(frozen=True)
class AnnouncedIncrease:
    carrier: str
    year: int
    product_scope: str
    rate_card: str
    percent: Decimal
    source_type: str
    source_file: str


@dataclass
class RateTables:
    """In-memory, indexed view of every processed table."""

    services: dict[str, Service]
    zone_bands: dict[str, list[ZoneBand]]
    base: dict[tuple[str, str, str, int, int], list[RateStep]]
    base_effective: dict[tuple[str, int], date]
    surcharges: dict[tuple[str, int], list[SurchargeRule]]
    dim_rules: dict[str, list[DimRule]]
    fuel: dict[tuple[str, int, str], FuelRow]
    fuel_carriers: frozenset[str]
    increases: list[AnnouncedIncrease] = field(default_factory=list)

    # ---- construction -------------------------------------------------
    @classmethod
    def from_rows(
        cls,
        *,
        services: Iterable[Mapping[str, str]],
        zones: Iterable[Mapping[str, str]],
        base_rates: Iterable[Mapping[str, str]],
        surcharges: Iterable[Mapping[str, str]] = (),
        dim_weight: Iterable[Mapping[str, str]] = (),
        fuel: Iterable[Mapping[str, str]] = (),
        increases: Iterable[Mapping[str, str]] = (),
    ) -> "RateTables":
        svc = {}
        for r in services:
            svc[r["service_id"]] = Service(
                carrier=r["carrier"],
                service_id=r["service_id"],
                display_name=r["display_name"],
                tier=r["tier"],
                residential_allowed=_bool(r["residential_allowed"]),
                business_allowed=_bool(r["business_allowed"]),
                rate_cards=tuple(c.strip() for c in r["rate_cards"].split(",") if c.strip()),
                rate_card_notes=r.get("rate_card_notes", ""),
                max_weight_lb=int(r["max_weight_lb"]),
                notes=r.get("notes", ""),
            )

        bands: dict[str, list[ZoneBand]] = defaultdict(list)
        for r in zones:
            bands[r["carrier"]].append(
                ZoneBand(r["carrier"], int(r["zone"]), int(r["min_miles"]), _int(r["max_miles"]))
            )
        for lst in bands.values():
            lst.sort(key=lambda b: b.min_miles)

        base: dict[tuple, list[RateStep]] = defaultdict(list)
        effective: dict[tuple[str, int], date] = {}
        for r in base_rates:
            key = (r["carrier"], r["service_id"], r["rate_card"], int(r["year"]), int(r["zone"]))
            base[key].append(
                RateStep(Decimal(r["max_weight_lb"]), Decimal(r["price"]), r["source_file"], r["source_ref"])
            )
            eff = date.fromisoformat(r["effective_date"])
            ck = (r["carrier"], int(r["year"]))
            if ck not in effective or eff < effective[ck]:
                effective[ck] = eff
        for steps in base.values():
            steps.sort(key=lambda s: s.max_weight_lb)

        sur: dict[tuple[str, int], list[SurchargeRule]] = defaultdict(list)
        for r in surcharges:
            rule = SurchargeRule(
                carrier=r["carrier"],
                year=int(r["year"]),
                rate_card=r.get("rate_card", "") or "",
                surcharge_id=r["surcharge_id"],
                display_name=r["display_name"],
                condition=r["condition"],
                applies_to=r["applies_to"],
                address_type=r.get("address_type", "any") or "any",
                min_weight_lb=_dec(r.get("min_weight_lb", "")),
                max_weight_lb=_dec(r.get("max_weight_lb", "")),
                min_length_in=_dec(r.get("min_length_in", "")),
                min_width_in=_dec(r.get("min_width_in", "")),
                min_length_plus_girth_in=_dec(r.get("min_length_plus_girth_in", "")),
                min_volume_cuft=_dec(r.get("min_volume_cuft", "")),
                zone_min=_int(r.get("zone_min", "")),
                zone_max=_int(r.get("zone_max", "")),
                amount=Decimal(r["amount"]),
                unit=r["unit"],
                exclusive_group=r["exclusive_group"],
                effective_from=_date(r.get("effective_from", "")),
                effective_to=_date(r.get("effective_to", "")),
                fuel_applies=_bool(r.get("fuel_applies", "false")),
                source_file=r.get("source_file", ""),
                source_page=r.get("source_page", "") or "",
            )
            sur[(rule.carrier, rule.year)].append(rule)

        dims: dict[str, list[DimRule]] = defaultdict(list)
        for r in dim_weight:
            dims[r["carrier"]].append(
                DimRule(
                    carrier=r["carrier"],
                    year=int(r["year"]),
                    effective_from=_date(r.get("effective_from", "")),
                    effective_to=_date(r.get("effective_to", "")),
                    divisor=int(r["divisor"]),
                    min_volume_cuin=int(r.get("min_volume_cuin") or 0),
                    rounding=r.get("rounding", ""),
                    source_file=r.get("source_file", ""),
                    source_ref=r.get("source_ref", ""),
                )
            )

        fuel_rows: dict[tuple[str, int, str], FuelRow] = {}
        for r in fuel:
            row = FuelRow(
                carrier=r["carrier"],
                year=int(r["year"]),
                service_group=r["service_group"],
                default_percent=Decimal(r["default_percent"]),
                is_proxy=_bool(r.get("is_proxy", "false")),
                window_start=_date(r.get("window_start", "")),
                window_end=_date(r.get("window_end", "")),
                source_file=r.get("source_file", ""),
                source_ref=r.get("source_ref", ""),
            )
            fuel_rows[(row.carrier, row.year, row.service_group)] = row

        inc = [
            AnnouncedIncrease(
                carrier=r["carrier"],
                year=int(r["year"]),
                product_scope=r["product_scope"],
                rate_card=r.get("rate_card", "") or "",
                percent=Decimal(r["percent"]),
                source_type=r.get("source_type", ""),
                source_file=r.get("source_file", ""),
            )
            for r in increases
        ]

        return cls(
            services=svc,
            zone_bands=dict(bands),
            base=dict(base),
            base_effective=effective,
            surcharges=dict(sur),
            dim_rules=dict(dims),
            fuel=fuel_rows,
            fuel_carriers=frozenset(k[0] for k in fuel_rows),
            increases=inc,
        )

    # ---- lookups --------------------------------------------------------
    def years_for(self, carrier: str) -> list[int]:
        return sorted({y for (c, y) in self.base_effective if c == carrier})

    def all_years(self) -> list[int]:
        return sorted({y for (_, y) in self.base_effective})

    def carriers(self) -> list[str]:
        present = {c for (c, _) in self.base_effective}
        return [c for c in CARRIERS if c in present]

    def services_for(self, carrier: str, tier: str | None = None) -> list[Service]:
        return [
            s
            for s in self.services.values()
            if s.carrier == carrier and (tier is None or s.tier == tier)
        ]

    def rate_steps(self, carrier: str, service_id: str, rate_card: str, year: int, zone: int) -> list[RateStep]:
        return self.base.get((carrier, service_id, rate_card, year, zone), [])

    def find_step(self, steps: list[RateStep], weight: Decimal) -> RateStep | None:
        """First weight step whose upper bound is >= weight."""
        idx = bisect_left([s.max_weight_lb for s in steps], weight)
        return steps[idx] if idx < len(steps) else None


def _read(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def load_tables(data_dir: Path) -> RateTables:
    """Read every processed table under ``data_dir`` (once, at startup)."""
    data_dir = Path(data_dir)
    if not (data_dir / "services.csv").exists():
        raise FileNotFoundError(f"services.csv not found under {data_dir}; set DATA_DIR")

    def concat(name: str) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        for carrier in CARRIERS:
            rows.extend(_read(data_dir / carrier / f"{name}.csv"))
        return rows

    return RateTables.from_rows(
        services=_read(data_dir / "services.csv"),
        zones=_read(data_dir / "zone_from_distance.csv"),
        base_rates=concat("base_rates"),
        surcharges=concat("surcharges"),
        dim_weight=concat("dim_weight"),
        fuel=concat("fuel_surcharge"),
        increases=concat("announced_increase"),
    )
