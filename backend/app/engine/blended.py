"""Question 3: blended cost per parcel per carrier for a parcel mix."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .quote import cheapest_for_carrier, price_charged, ships_free
from .segments import SegmentFilter, matches
from .tables import RateTables
from .types import Controls, Parcel, Quote, Totals

ZERO = Decimal("0")


def _r(value: Decimal, places: str = "0.01") -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def _share(part: Decimal, whole: Decimal) -> float:
    return _r(part / whole, "0.0001") if whole else 0.0


def summarize(t: Totals, unavailable: int = 0) -> dict:
    n = Decimal(t.parcels) if t.parcels else None

    def per(x: Decimal) -> float:
        return _r(x / n) if n else 0.0

    by_condition = [
        {
            "condition": cond,
            "total": _r(amount),
            "per_parcel": per(amount),
            "share_of_cost": _share(amount, t.total),
        }
        for cond, amount in sorted(t.by_condition.items(), key=lambda kv: -kv[1])
    ]
    return {
        "parcels_shipped": t.parcels,
        "parcels_unavailable": unavailable,
        "total_cost": _r(t.total),
        "cost_per_parcel": per(t.total),
        "split": {
            "base": {"per_parcel": per(t.base), "total": _r(t.base), "share": _share(t.base, t.total)},
            "surcharges": {
                "per_parcel": per(t.surcharges),
                "total": _r(t.surcharges),
                "share": _share(t.surcharges, t.total),
            },
            "fuel": {"per_parcel": per(t.fuel), "total": _r(t.fuel), "share": _share(t.fuel, t.total)},
        },
        "surcharges_by_condition": by_condition,
        "margin_per_parcel": per(t.margin),
        "total_margin": _r(t.margin),
        "loss_share": round(t.loss_parcels / t.parcels, 4) if t.parcels else 0.0,
        "parcels_at_loss": t.loss_parcels,
    }


def per_parcel_quotes(
    tables: RateTables, carrier: str, parcels: list[Parcel], controls: Controls, year: int | None = None
) -> list[Quote | None]:
    """Each parcel at the carrier's cheapest available service in its tier."""
    return [cheapest_for_carrier(tables, carrier, p.speed, p, controls, year=year) for p in parcels]


def blended(
    tables: RateTables,
    parcels: list[Parcel],
    controls: Controls,
    segment: SegmentFilter | None = None,
) -> dict:
    selected = [p for p in parcels if matches(tables, p, segment)]
    carriers = [c for c in tables.carriers() if (c, controls.year) in tables.base_effective]

    quotes_by_carrier: dict[str, list[Quote | None]] = {}
    results = []
    for carrier in carriers:
        quotes = per_parcel_quotes(tables, carrier, selected, controls)
        quotes_by_carrier[carrier] = quotes
        totals = Totals()
        unavailable = 0
        services: dict[str, int] = {}
        for parcel, q in zip(selected, quotes):
            if q is None:
                unavailable += parcel.quantity
                continue
            totals.add(q, parcel.quantity)
            services[q.service_id] = services.get(q.service_id, 0) + parcel.quantity
        results.append({"carrier": carrier, **summarize(totals, unavailable), "services_used": services})

    best = Totals()
    best_unavailable = 0
    counts: dict[str, int] = {c: 0 for c in carriers}
    for i, parcel in enumerate(selected):
        options = [quotes_by_carrier[c][i] for c in carriers if quotes_by_carrier[c][i] is not None]
        if not options:
            best_unavailable += parcel.quantity
            continue
        q = min(options, key=lambda x: x.total)
        best.add(q, parcel.quantity)
        counts[q.carrier] += parcel.quantity

    revenue = sum((price_charged(p, controls) * p.quantity for p in selected), ZERO)
    n = sum(p.quantity for p in selected)
    free = None
    if controls.free_shipping_over is not None:
        free = {
            "threshold": controls.free_shipping_over,
            "parcels": sum(p.quantity for p in selected if ships_free(p, controls)),
        }
    return {
        "year": controls.year,
        "parcels_considered": n,
        "revenue_per_parcel": _r(revenue / n) if n else 0.0,
        "free_shipping": free,
        "carriers": results,
        "best_mix": {**summarize(best, best_unavailable), "parcels_by_carrier": counts},
    }
