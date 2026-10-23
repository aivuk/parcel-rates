"""Rule resolution: zone, as_of, dimensional weight, surcharges and fuel.

Every number comes from the tables; this module only encodes how the columns
documented in docs/data/SCHEMA.md and the rules in docs/API.md combine.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from .tables import DimRule, RateTables, Service, SurchargeRule, in_window
from .types import Controls, FuelOverride, Parcel, money

# docs/API.md: "With peak: true it is December 10 of the year".
PEAK_MONTH, PEAK_DAY = 12, 10
CUBIC_INCHES_PER_CUBIC_FOOT = Decimal(12**3)

PEAK_CONDITIONS = frozenset(
    {"peak_residential", "peak_additional_handling", "peak_oversize", "peak_base"}
)
# Peak add-ons that only add to a charge the parcel already pays (see the
# surcharge notes: "adds to the Additional Handling Surcharge for packages
# meeting its criteria"). They carry no thresholds of their own.
ADDITIONAL_HANDLING_CONDITIONS = frozenset(
    {
        "additional_handling_weight",
        "additional_handling_length",
        "additional_handling_width",
        "additional_handling_packaging",
        "nonstandard_length",
        "nonstandard_volume",
    }
)
PEAK_REQUIRES = {
    "peak_additional_handling": ADDITIONAL_HANDLING_CONDITIONS,
    "peak_oversize": frozenset({"oversize"}),
}


# ---- zone -----------------------------------------------------------------
def zone_for(tables: RateTables, carrier: str, distance_miles: float) -> int | None:
    """Band whose min_miles <= distance <= max_miles (empty max = open)."""
    bands = tables.zone_bands.get(carrier, [])
    for band in bands:
        if distance_miles >= band.min_miles and (
            band.max_miles is None or distance_miles <= band.max_miles
        ):
            return band.zone
    # Fractional distances between integer bands (e.g. 50.5): next band up.
    for band in bands:
        if distance_miles < band.min_miles:
            return band.zone
    return None


# ---- as_of ----------------------------------------------------------------
def resolve_as_of(tables: RateTables, carrier: str, year: int, controls: Controls) -> date | None:
    if controls.peak:
        return date(year, PEAK_MONTH, PEAK_DAY)
    if controls.as_of is not None:
        return controls.as_of
    return tables.base_effective.get((carrier, year))


# ---- dimensional weight ---------------------------------------------------
def resolve_dim_rule(tables: RateTables, carrier: str, year: int, as_of: date) -> DimRule | None:
    """Row whose window contains as_of; latest effective_from wins, then the
    row labelled with the requested year."""
    rows = tables.dim_rules.get(carrier, [])
    matching = [r for r in rows if in_window(as_of, r.effective_from, r.effective_to)]
    if not matching:
        # as_of earlier than every window: use the year's own row(s).
        matching = [r for r in rows if r.year == year]
    if not matching:
        return None
    return max(
        matching,
        key=lambda r: (r.effective_from or date.min, r.year == year, r.year),
    )


def rounds_dimensions_up(rule: DimRule) -> bool:
    """Read the rounding text: some rows round every fraction up
    ("round up each measurement", "round each fractional dimension up"),
    the others round to the nearest inch."""
    text = rule.rounding.lower()
    return bool(re.search(r"round up each|fractional dimension up", text))


def dim_weight_cap(rule: DimRule) -> Decimal | None:
    """USPS: "over 70 lb pays the 70-pound price"."""
    m = re.search(r"over (\d+) lb pays the \1-pound price", rule.rounding)
    return Decimal(m.group(1)) if m else None


def round_dimension(value: float, rule: DimRule | None) -> Decimal:
    d = Decimal(str(value))
    if rule is not None and rounds_dimensions_up(rule):
        return d.quantize(Decimal(1), rounding=ROUND_CEILING)
    return d.quantize(Decimal(1), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Measured:
    """A parcel as the carrier measures it on a given date."""

    dims: tuple[Decimal, Decimal, Decimal] | None  # sorted, longest first
    dim_weight: Decimal | None
    weight: Decimal  # max(actual, dim weight) before stepping

    @property
    def volume_cuin(self) -> Decimal | None:
        if self.dims is None:
            return None
        a, b, c = self.dims
        return a * b * c

    @property
    def length_plus_girth(self) -> Decimal | None:
        if self.dims is None:
            return None
        a, b, c = self.dims
        return a + 2 * (b + c)


def measure(parcel: Parcel, rule: DimRule | None) -> Measured:
    actual = Decimal(str(parcel.weight_lb))
    if not parcel.has_dimensions:
        return Measured(None, None, actual)
    dims = sorted(
        (round_dimension(v, rule) for v in (parcel.length_in, parcel.width_in, parcel.height_in)),
        reverse=True,
    )
    dims_t = (dims[0], dims[1], dims[2])
    dim_weight = None
    if rule is not None:
        volume = dims[0] * dims[1] * dims[2]
        if volume > rule.min_volume_cuin:
            dim_weight = Decimal(math.ceil(volume / Decimal(rule.divisor)))
            cap = dim_weight_cap(rule)
            if cap is not None and dim_weight > cap:
                dim_weight = cap
    weight = max(actual, dim_weight) if dim_weight is not None else actual
    return Measured(dims_t, dim_weight, weight)


# ---- surcharges -----------------------------------------------------------
def applies_to_service(rule: SurchargeRule, service: Service) -> bool:
    target = rule.applies_to.strip()
    if target == "all":
        return True
    if target == "ground":
        return service.tier == "ground"
    if target == "air":
        return service.tier != "ground"
    return service.service_id in {s.strip() for s in target.split(",")}


def address_matches(rule: SurchargeRule, residential: bool) -> bool:
    if rule.address_type == "any":
        return True
    return rule.address_type == ("residential" if residential else "commercial")


def thresholds_met(rule: SurchargeRule, billable: Decimal, m: Measured, zone: int) -> bool:
    if rule.min_weight_lb is not None and billable < rule.min_weight_lb:
        return False
    if rule.max_weight_lb is not None and billable > rule.max_weight_lb:
        return False
    if rule.zone_min is not None and zone < rule.zone_min:
        return False
    if rule.zone_max is not None and zone > rule.zone_max:
        return False
    dim_rules = (
        rule.min_length_in,
        rule.min_width_in,
        rule.min_length_plus_girth_in,
        rule.min_volume_cuft,
    )
    if all(v is None for v in dim_rules):
        return True
    if m.dims is None:  # no dimensions: no dimension-based surcharges
        return False
    longest, second, _ = m.dims
    if rule.min_length_in is not None and not longest > rule.min_length_in:
        return False
    if rule.min_width_in is not None and not second > rule.min_width_in:
        return False
    if rule.min_length_plus_girth_in is not None and not m.length_plus_girth > rule.min_length_plus_girth_in:
        return False
    if rule.min_volume_cuft is not None and not (
        m.volume_cuin / CUBIC_INCHES_PER_CUBIC_FOOT > rule.min_volume_cuft
    ):
        return False
    return True


def condition_gate(rule: SurchargeRule, parcel: Parcel, controls: Controls) -> bool:
    cond = rule.condition
    if cond == "delivery_area":
        return parcel.delivery_area == "das"
    if cond == "delivery_area_extended":
        return parcel.delivery_area == "extended"
    if cond == "additional_handling_packaging":
        return parcel.nonstandard_packaging
    if cond in PEAK_CONDITIONS:
        return controls.peak
    return True


def surcharge_amount(rule: SurchargeRule, base_price: Decimal) -> Decimal:
    if rule.unit == "percent":
        return money(base_price * rule.amount / Decimal(100))
    return money(rule.amount)


def _resolve_exclusive(candidates: list[tuple[SurchargeRule, Decimal]]) -> list[tuple[SurchargeRule, Decimal]]:
    """Same exclusive_group: highest amount only (first listed on ties)."""
    best: dict[str, tuple[SurchargeRule, Decimal]] = {}
    order: list[str] = []
    for rule, amount in candidates:
        group = rule.exclusive_group
        if group not in best:
            order.append(group)
            best[group] = (rule, amount)
        elif amount > best[group][1]:
            best[group] = (rule, amount)
    return [best[g] for g in order]


def match_surcharges(
    tables: RateTables,
    *,
    service: Service,
    year: int,
    rate_card: str,
    zone: int,
    billable: Decimal,
    measured: Measured,
    parcel: Parcel,
    controls: Controls,
    as_of: date,
    base_price: Decimal,
) -> list[tuple[SurchargeRule, Decimal]]:
    rules = tables.surcharges.get((service.carrier, year), [])
    regular: list[tuple[SurchargeRule, Decimal]] = []
    peak: list[SurchargeRule] = []
    for rule in rules:
        if not in_window(as_of, rule.effective_from, rule.effective_to):
            continue
        if rule.rate_card and rule.rate_card != rate_card:
            continue
        if not applies_to_service(rule, service):
            continue
        if not address_matches(rule, parcel.residential):
            continue
        if not condition_gate(rule, parcel, controls):
            continue
        if not thresholds_met(rule, billable, measured, zone):
            continue
        if rule.condition in PEAK_REQUIRES:
            peak.append(rule)
        else:
            regular.append((rule, surcharge_amount(rule, base_price)))

    applied = _resolve_exclusive(regular)
    applied_conditions = {r.condition for r, _ in applied}
    gated = [
        (r, surcharge_amount(r, base_price))
        for r in peak
        if applied_conditions & PEAK_REQUIRES[r.condition]
    ]
    return _resolve_exclusive(applied + gated)


# ---- fuel -----------------------------------------------------------------
def fuel_group(service: Service) -> str:
    return "ground" if service.tier == "ground" else "express"


def fuel_percent(
    tables: RateTables, carrier: str, year: int, service: Service, override: FuelOverride | None
) -> tuple[Decimal | None, str | None]:
    """(percent, source). None when the carrier has no fuel surcharge (USPS)."""
    if carrier not in tables.fuel_carriers:
        return None, None
    group = fuel_group(service)
    if override is not None:
        value = override.ground if group == "ground" else override.express
        if value is not None:
            return Decimal(str(value)), "fuel override"
    row = tables.fuel.get((carrier, year, group))
    if row is None:
        return None, None
    source = _source(row.source_file, row.source_ref) or "fuel_surcharge.csv"
    if row.is_proxy:
        source += " (proxy)"
    return row.default_percent, source


def _source(file: str, ref: str) -> str | None:
    if not file:
        return None
    name = file.rsplit("/", 1)[-1]
    ref = (ref or "").strip()
    if not ref:
        return name
    if ref.isdigit():
        return f"{name} p.{ref}"
    return f"{name} ({ref})"


source_label = _source
