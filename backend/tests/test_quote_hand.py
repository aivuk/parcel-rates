"""Quotes computed by hand from the CSV rows, one per carrier.

Each test looks the rows up in data/processed with the csv module (not with
the engine's loader) and rebuilds the line items independently.
"""

from __future__ import annotations

import math
from decimal import Decimal

from app.engine.quote import quote_service
from app.engine.types import Controls, Parcel
from tests.conftest import cents, only, read_csv, zone_from_csv


def _price(carrier, service_id, card, year, zone, weight) -> Decimal:
    rows = read_csv(f"{carrier}/base_rates.csv")
    candidates = [
        r for r in rows
        if r["service_id"] == service_id and r["rate_card"] == card and r["year"] == str(year)
        and r["zone"] == str(zone) and Decimal(r["max_weight_lb"]) >= weight
    ]
    return Decimal(min(candidates, key=lambda r: Decimal(r["max_weight_lb"]))["price"])


def _fuel(carrier, year, group) -> Decimal:
    return Decimal(only(read_csv(f"{carrier}/fuel_surcharge.csv"), year=str(year), service_group=group)["default_percent"])


def _amounts(quote):
    return [(li.kind, li.surcharge_id, li.amount) for li in quote.line_items]


def test_usps_ground_advantage_by_hand(tables):
    parcel = Parcel(weight_lb=2.3, distance_miles=400, residential=True, speed="ground")
    zone = zone_from_csv("usps", 400)
    expected_base = _price("usps", "usps_ground_advantage", "commercial", 2026, zone, Decimal("2.3"))

    q = quote_service(tables, tables.services["usps_ground_advantage"], parcel, Controls(year=2026))

    assert q.zone == zone
    assert q.billable_weight_lb == 3.0
    assert _amounts(q) == [("base", None, expected_base)]
    assert q.total == expected_base
    assert q.margin == Decimal("9.99") - expected_base


def test_usps_retail_card_and_ounce_steps(tables):
    parcel = Parcel(weight_lb=0.3, distance_miles=20, residential=False, speed="ground")
    zone = zone_from_csv("usps", 20)
    expected = _price("usps", "usps_ground_advantage", "retail", 2025, zone, Decimal("0.3"))
    q = quote_service(tables, tables.services["usps_ground_advantage"], parcel,
                      Controls(year=2025, usps_rate_card="retail"))
    assert q.billable_weight_lb == 0.5
    assert q.total == expected


def test_ups_ground_residential_das_with_dim_weight_by_hand(tables):
    parcel = Parcel(weight_lb=4.2, length_in=12, width_in=10, height_in=8, distance_miles=700,
                    residential=True, speed="ground", delivery_area="das")
    zone = zone_from_csv("ups", 700)
    dim_row = only(read_csv("ups/dim_weight.csv"), year="2026")
    dim_weight = math.ceil(12 * 10 * 8 / int(dim_row["divisor"]))  # dims already whole inches
    billable = max(math.ceil(4.2), dim_weight)
    base = _price("ups", "ups_ground", "list", 2026, zone, Decimal(billable))
    sur = read_csv("ups/surcharges.csv")
    res = only(sur, year="2026", condition="residential", applies_to="ups_ground")
    das = only(sur, year="2026", condition="delivery_area", applies_to="ups_ground", address_type="residential")
    flagged = base + sum(Decimal(r["amount"]) for r in (res, das) if r["fuel_applies"] == "true")
    fuel = cents(flagged * _fuel("ups", 2026, "ground") / 100)

    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2026))

    assert q.dim_weight_lb == dim_weight
    assert q.billable_weight_lb == billable
    assert _amounts(q) == [
        ("base", None, base),
        ("surcharge", res["surcharge_id"], Decimal(res["amount"])),
        ("surcharge", das["surcharge_id"], Decimal(das["amount"])),
        ("fuel", None, fuel),
    ]
    assert q.total == base + Decimal(res["amount"]) + Decimal(das["amount"]) + fuel
    assert q.line_items[1].label == res["display_name"]
    assert q.line_items[1].source == f"{res['source_file'].rsplit('/', 1)[-1]} p.{res['source_page']}"


def test_fedex_ground_business_additional_handling_by_hand(tables):
    parcel = Parcel(weight_lb=10, length_in=50, width_in=10, height_in=10, distance_miles=900,
                    residential=False, speed="ground")
    zone = zone_from_csv("fedex", 900)
    dim_row = only(read_csv("fedex/dim_weight.csv"), year="2025")
    billable = max(10, math.ceil(50 * 10 * 10 / int(dim_row["divisor"])))
    base = _price("fedex", "fedex_ground", "list", 2025, zone, Decimal(billable))
    # Longest side 50 > 48: additional handling (length), zone 5-6, January window.
    ah = [
        r for r in read_csv("fedex/surcharges.csv")
        if r["year"] == "2025" and r["condition"] == "additional_handling_length" and r["min_length_in"] == "48"
        and int(r["zone_min"]) <= zone <= int(r["zone_max"]) and r["effective_from"] == "2025-01-06"
    ]
    assert len(ah) == 1
    ah = ah[0]
    fuel = cents((base + Decimal(ah["amount"])) * _fuel("fedex", 2025, "ground") / 100)

    q = quote_service(tables, tables.services["fedex_ground"], parcel, Controls(year=2025))

    assert q.billable_weight_lb == billable
    assert _amounts(q) == [
        ("base", None, base),
        ("surcharge", ah["surcharge_id"], Decimal(ah["amount"])),
        ("fuel", None, fuel),
    ]
    assert q.total == base + Decimal(ah["amount"]) + fuel


def test_no_dimensions_means_no_dim_weight_or_dimension_surcharges(tables):
    parcel = Parcel(weight_lb=10, distance_miles=900, residential=False, speed="ground")
    q = quote_service(tables, tables.services["fedex_ground"], parcel, Controls(year=2025))
    assert q.dim_weight_lb is None
    assert [li.kind for li in q.line_items] == ["base", "fuel"]


def test_unknown_year_for_carrier_is_unavailable(tables):
    parcel = Parcel(weight_lb=1, distance_miles=10, residential=False, speed="ground")
    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2027))
    assert not q.available and "2027" in q.unavailable_reason


def test_billable_weight_above_table_is_unavailable(tables):
    parcel = Parcel(weight_lb=20, length_in=40, width_in=30, height_in=20, distance_miles=10,
                    residential=False, speed="ground")
    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2026))
    assert not q.available and "heaviest published price" in q.unavailable_reason


def test_usps_dim_weight_is_capped_at_the_70_lb_price(tables):
    parcel = Parcel(weight_lb=20, length_in=40, width_in=30, height_in=20, distance_miles=10,
                    residential=False, speed="ground")
    q = quote_service(tables, tables.services["usps_ground_advantage"], parcel, Controls(year=2026))
    assert q.available and q.dim_weight_lb == 70 and q.billable_weight_lb == 70
