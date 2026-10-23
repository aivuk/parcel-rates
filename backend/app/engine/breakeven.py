"""Question 2: USPS vs UPS / FedEx ground breakeven by weight and distance."""

from __future__ import annotations

from .quote import cheapest_for_carrier
from .rules import zone_for
from .tables import RateTables
from .types import Controls, Parcel, Quote

GROUND = "ground"
USPS = "usps"
PRIVATE = ("ups", "fedex")
# docs/API.md: the open-ended last band is sampled this far past the
# previous band's upper edge.
LAST_BAND_OFFSET_MILES = 200


def default_weights(tables: RateTables) -> list[float]:
    """1 lb steps up to the lowest ground-service weight limit (70 lb)."""
    limit = min(s.max_weight_lb for s in tables.services.values() if s.tier == GROUND)
    return [float(w) for w in range(1, limit + 1)]


def default_distances(tables: RateTables) -> list[float]:
    """One distance per USPS zone band: the midpoint, or for the open-ended
    last band the previous band's upper edge plus LAST_BAND_OFFSET_MILES."""
    out: list[float] = []
    prev_max = 0
    for band in tables.zone_bands.get(USPS, []):
        if band.max_miles is None:
            out.append(float(prev_max + LAST_BAND_OFFSET_MILES))
        else:
            out.append(float((band.min_miles + band.max_miles) // 2))
            prev_max = band.max_miles
    return out


def _pick(q: Quote) -> dict:
    return {"carrier": q.carrier, "service_id": q.service_id, "total": float(q.total)}


def breakeven(
    tables: RateTables,
    controls: Controls,
    residential: bool,
    weights_lb: list[float] | None = None,
    distances_miles: list[float] | None = None,
) -> dict:
    weights = sorted(weights_lb) if weights_lb else default_weights(tables)
    distances = sorted(distances_miles) if distances_miles else default_distances(tables)
    carriers = [c for c in tables.carriers() if (c, controls.year) in tables.base_effective]

    cells = []
    bands = []
    for d in distances:
        first_loss: dict[str, float | None] = {c: None for c in PRIVATE}
        for w in weights:
            parcel = Parcel(weight_lb=w, distance_miles=d, residential=residential, speed=GROUND)
            quotes = {
                c: q
                for c in carriers
                if (q := cheapest_for_carrier(tables, c, GROUND, parcel, controls)) is not None
            }
            ranked = sorted(quotes.values(), key=lambda q: q.total)
            usps = quotes.get(USPS)
            for c in PRIVATE:
                other = quotes.get(c)
                if usps and other and first_loss[c] is None and usps.total >= other.total:
                    first_loss[c] = w
            private_zone = next((q.zone for q in ranked if q.carrier != USPS), None)
            cells.append(
                {
                    "weight_lb": w,
                    "distance_miles": d,
                    "zone_usps": zone_for(tables, USPS, d),
                    "zone_private": private_zone if private_zone is not None else zone_for(tables, "ups", d),
                    "winner": _pick(ranked[0]) if ranked else None,
                    "runner_up": _pick(ranked[1]) if len(ranked) > 1 else None,
                    "saving": float(ranked[1].total - ranked[0].total) if len(ranked) > 1 else 0.0,
                    "totals": {q.carrier: float(q.total) for q in ranked},
                }
            )
        bands.append(
            {
                "distance_miles": d,
                "zone_usps": zone_for(tables, USPS, d),
                "zone_private": zone_for(tables, "ups", d),
                "vs_ups": first_loss["ups"],
                "vs_fedex": first_loss["fedex"],
            }
        )
    return {
        "year": controls.year,
        "residential": residential,
        "weights_lb": weights,
        "distances_miles": distances,
        "cells": cells,
        "breakeven_weight_lb": bands,
    }

