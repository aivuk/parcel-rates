"""Question 4: blended cost per parcel year over year, against the announced
increase, with the parcel segments that drove the change."""

from __future__ import annotations

from dataclasses import replace
from decimal import ROUND_HALF_UP, Decimal

from .blended import per_parcel_quotes, summarize
from .rules import PEAK_CONDITIONS, resolve_as_of
from .segments import DIMENSIONS, segment_of
from .tables import RateTables, in_window
from .types import Controls, Parcel, Quote, Totals

ZERO = Decimal("0")
CENT = Decimal("0.01")


def _r(value: Decimal, places: str = "0.01") -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def allocate_cents(values: dict[str, Decimal], total: Decimal) -> dict[str, float]:
    """Round each value to cents so the rounded values still add up to the
    rounded total (largest remainder)."""
    target = total.quantize(CENT, rounding=ROUND_HALF_UP)
    floors = {k: (v / CENT).to_integral_value(rounding="ROUND_FLOOR") for k, v in values.items()}
    remainder = int(target / CENT - sum(floors.values()))
    order = sorted(values, key=lambda k: (values[k] / CENT - floors[k]), reverse=True)
    if remainder < 0:
        order = list(reversed(order))
    step = 1 if remainder >= 0 else -1
    for k in order[: abs(remainder)]:
        floors[k] += step
    return {k: float(floors[k] * CENT) for k in values}


def announced_increase(tables: RateTables, carrier: str, year: int, services_used: list[str], usps_card: str) -> dict:
    rows = [
        r
        for r in tables.increases
        if r.carrier == carrier and r.year == year and r.rate_card in ("", "list", usps_card)
    ]
    overall = [r for r in rows if r.product_scope == "all"]
    if overall:
        r = overall[0]
        return {
            "percent": float(r.percent),
            "basis": "all",
            "services": [],
            "source_type": r.source_type,
        }
    scoped = [r for r in rows if r.product_scope in services_used]
    if not scoped:
        return {"percent": None, "basis": "none", "services": [], "source_type": None}
    avg = sum((r.percent for r in scoped), ZERO) / len(scoped)
    return {
        "percent": _r(avg, "0.01"),
        "basis": "average_of_services",
        "services": sorted({r.product_scope for r in scoped}),
        "source_type": ",".join(sorted({r.source_type for r in scoped})),
    }


def _announced_files(tables: RateTables, carrier: str, year: int, services_used: list[str], usps_card: str) -> list[str]:
    """Source files of the announcement rows announced_increase() used."""
    rows = [
        r
        for r in tables.increases
        if r.carrier == carrier and r.year == year and r.rate_card in ("", "list", usps_card)
    ]
    overall = [r for r in rows if r.product_scope == "all"]
    used = overall[:1] or [r for r in rows if r.product_scope in services_used]
    return sorted({r.source_file for r in used if r.source_file})


def project_next_year(
    tables: RateTables,
    carrier: str,
    last_row: dict,
    last_cost: Decimal,
    usps_card: str,
    slider_percent: float | None,
    override: bool,
) -> dict | None:
    """Cost per parcel the year after the carrier's latest price list. The carrier's own
    announced increase for that year when the data has one; otherwise the slider's
    percentage as an assumption; with `override`, the slider for every carrier."""
    year = last_row["year"] + 1
    services = last_row["services_used"]
    announced = announced_increase(tables, carrier, year, services, usps_card)
    if override and slider_percent is not None:
        percent, basis, files = slider_percent, "override", []
    elif announced["percent"] is not None:
        percent, basis = announced["percent"], "announced"
        files = _announced_files(tables, carrier, year, services, usps_card)
    elif slider_percent is not None:
        percent, basis, files = slider_percent, "assumed", []
    else:
        return None
    factor = Decimal(1) + Decimal(str(percent)) / Decimal(100)
    return {
        "year": year,
        "increase_percent": percent,
        "cost_per_parcel": _r(last_cost * factor),
        "basis": basis,
        # The carrier's own figure, also when an override or nothing replaced it, so a UI can offer it back.
        "announced_percent": announced["percent"],
        "source_type": announced["source_type"] if basis == "announced" else None,
        "source_files": files,
    }


def conditions_in_force(tables: RateTables, carrier: str, year: int, controls: Controls) -> set[str]:
    """Non-peak surcharge conditions with at least one rule in force."""
    as_of = resolve_as_of(tables, carrier, year, controls)
    return {
        r.condition
        for r in tables.surcharges.get((carrier, year), [])
        if r.condition not in PEAK_CONDITIONS and as_of and in_window(as_of, r.effective_from, r.effective_to)
    }


def fuel_used(tables: RateTables, carrier: str, year: int, controls: Controls) -> dict | None:
    """Fuel percent per service group for the year: the table default, whether
    it is a proxy, and the percent actually applied (override or default).
    None for a carrier without a fuel surcharge (USPS)."""
    if carrier not in tables.fuel_carriers:
        return None
    out = {}
    override = controls.fuel_override_percent
    for group in ("ground", "express"):
        row = tables.fuel.get((carrier, year, group))
        forced = getattr(override, group) if override is not None else None
        default = float(row.default_percent) if row else None
        out[group] = {
            "default_percent": default,
            "is_proxy": row.is_proxy if row else None,
            "applied_percent": float(forced) if forced is not None else default,
        }
    return out


def _drivers(
    tables: RateTables,
    parcels: list[Parcel],
    prev: list[Quote],
    cur: list[Quote],
    n: int,
) -> dict[str, list[dict]]:
    total_change = sum(((c.total - p.total) * x.quantity for x, p, c in zip(parcels, prev, cur)), ZERO)
    out: dict[str, list[dict]] = {}
    segs = [segment_of(tables, p) for p in parcels]
    for dim in DIMENSIONS:
        change: dict[str, Decimal] = {}
        count: dict[str, int] = {}
        for x, s, p, c in zip(parcels, segs, prev, cur):
            key = s[dim]
            change[key] = change.get(key, ZERO) + (c.total - p.total) * x.quantity
            count[key] = count.get(key, 0) + x.quantity
        per_parcel = {k: v / n for k, v in change.items()}
        rounded = allocate_cents(per_parcel, total_change / n)
        out[dim] = [
            {
                "segment": k,
                "parcels": count[k],
                "change_per_parcel": rounded[k],
                "change_total": _r(change[k]),
            }
            for k in sorted(change, key=lambda k: -abs(change[k]))
        ]
    return out


# Quotes every parcel for every carrier and year without caching: about 1 s per
# 1,000 parcels on a laptop. Requests are capped at 10,000 parcels (api/models.py);
# a small shop's monthly mix of a few thousand parcels answers in a few seconds.
def yearly(
    tables: RateTables,
    parcels: list[Parcel],
    controls: Controls,
    next_year_increase_percent: float | None = None,
    next_year_override: bool = False,
) -> dict:
    result = []
    for carrier in tables.carriers():
        years = tables.years_for(carrier)
        per_year: dict[int, list[Quote | None]] = {}
        for y in years:
            cy = replace(controls, year=y, as_of=None)
            per_year[y] = per_parcel_quotes(tables, carrier, parcels, cy, year=y)

        # Like-for-like: only parcels the carrier can ship in every year.
        keep = [i for i in range(len(parcels)) if all(per_year[y][i] is not None for y in years)]
        used = [parcels[i] for i in keep]
        n = sum(p.quantity for p in used)
        excluded = sum(p.quantity for p in parcels) - n

        rows = []
        prev_y: int | None = None
        prev_cost: Decimal | None = None
        prev_conditions: set[str] = set()
        for y in years:
            conditions = conditions_in_force(tables, carrier, y, replace(controls, year=y, as_of=None))
            missing = sorted(prev_conditions - conditions)
            quotes = [per_year[y][i] for i in keep]
            totals = Totals()
            for p, q in zip(used, quotes):
                totals.add(q, p.quantity)
            cost = totals.total / n if n else ZERO
            services = sorted({q.service_id for q in quotes})
            row = {
                "year": y,
                "as_of": quotes[0].as_of.isoformat() if quotes else None,
                "cost_per_parcel": _r(cost),
                "summary": summarize(totals),
                "services_used": services,
                "change_vs_previous": None,
                "announced_increase": announced_increase(
                    tables, carrier, y, services, controls.usps_rate_card
                ),
                "drivers": None,
                "fuel": fuel_used(tables, carrier, y, controls),
                "warnings": (
                    [f"No {y} rules recorded for: {', '.join(missing)}; surcharges may be understated"]
                    if missing
                    else []
                ),
            }
            if prev_y is not None and n:
                diff = cost - prev_cost
                row["change_vs_previous"] = {
                    "from_year": prev_y,
                    "dollars_per_parcel": _r(diff),
                    "percent": _r(diff / prev_cost * 100, "0.01") if prev_cost else None,
                }
                prev_quotes = [per_year[prev_y][i] for i in keep]
                row["drivers"] = _drivers(tables, used, prev_quotes, quotes, n)
            rows.append(row)
            prev_y, prev_cost, prev_conditions = y, cost, conditions

        projected = None
        if rows and n:
            projected = project_next_year(
                tables,
                carrier,
                rows[-1],
                prev_cost,
                controls.usps_rate_card,
                next_year_increase_percent,
                next_year_override,
            )
        result.append(
            {
                "carrier": carrier,
                "parcels_used": n,
                "parcels_excluded": excluded,
                "years": rows,
                "projected": projected,
            }
        )
    return {"carriers": result}
