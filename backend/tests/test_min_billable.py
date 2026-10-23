"""Minimum billable weight (UPS Large Package, FedEx Oversize: 90 lb).

Real-data tests rebuild the expected quote from the CSV rows with the csv module;
synthetic tests pin the engine rule (exclusive groups, percent amounts, a minimum
above the table)."""

from __future__ import annotations

import math
from decimal import Decimal

from app.engine.quote import quote_service
from app.engine.types import Controls, Parcel
from tests.conftest import cents, only, read_csv, rule, synthetic_tables, zone_from_csv


def _price(carrier, service_id, year, zone, weight) -> Decimal:
    return Decimal(only(read_csv(f"{carrier}/base_rates.csv"), service_id=service_id, rate_card="list",
                        year=str(year), zone=str(zone), max_weight_lb=str(weight))["price"])


def _fuel(carrier, year, group) -> Decimal:
    return Decimal(only(read_csv(f"{carrier}/fuel_surcharge.csv"), year=str(year), service_group=group)["default_percent"])


def _dim(carrier, year, l, w, h) -> int:
    return math.ceil(l * w * h / int(only(read_csv(f"{carrier}/dim_weight.csv"), year=str(year))["divisor"]))


def _in_zone(row, zone) -> bool:
    return int(row["zone_min"]) <= zone <= int(row["zone_max"])


def test_ups_large_package_bills_the_base_at_90_lb(tables):
    # Longest side 98 in > 96 in: Large Package. 20 lb actual, dim weight 46 lb.
    parcel = Parcel(weight_lb=20, length_in=98, width_in=8, height_in=8, distance_miles=700,
                    residential=False, speed="ground")
    zone = zone_from_csv("ups", 700)
    assert _dim("ups", 2026, 98, 8, 8) < 90
    lps = [r for r in read_csv("ups/surcharges.csv")
           if r["year"] == "2026" and r["condition"] == "oversize" and r["address_type"] == "commercial"
           and r["min_length_in"] == "96" and _in_zone(r, zone)]
    assert len(lps) == 1 and lps[0]["min_billable_weight_lb"] == "90"
    lps = lps[0]
    base = _price("ups", "ups_ground", 2026, zone, 90)
    fuel = cents((base + Decimal(lps["amount"])) * _fuel("ups", 2026, "ground") / 100)

    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2026))

    assert q.billable_weight_lb == 90
    assert [(li.kind, li.surcharge_id, li.amount) for li in q.line_items] == [
        ("base", None, base),
        ("surcharge", lps["surcharge_id"], Decimal(lps["amount"])),
        ("fuel", None, fuel),
    ]
    assert q.line_items[0].label == (f"UPS Ground base rate (zone {zone}), billed at the 90 lb minimum "
                                     f"of the Large Package Surcharge")
    assert q.total == base + Decimal(lps["amount"]) + fuel


def test_fedex_oversize_bills_the_base_at_90_lb(tables):
    # Length + girth 90 + 2 x (11 + 10) = 132 in > 130 in, longest side under 96 in:
    # Oversize by girth. 20 lb actual, dim weight 72 lb.
    parcel = Parcel(weight_lb=20, length_in=90, width_in=11, height_in=10, distance_miles=900,
                    residential=False, speed="ground")
    zone = zone_from_csv("fedex", 900)
    dim = _dim("fedex", 2026, 90, 11, 10)
    assert dim < 90
    over = [r for r in read_csv("fedex/surcharges.csv")
            if r["year"] == "2026" and r["condition"] == "oversize" and r["min_length_plus_girth_in"] == "130"
            and "fedex_ground" in r["applies_to"].split(",") and _in_zone(r, zone)]
    assert len(over) == 1 and over[0]["min_billable_weight_lb"] == "90"
    over = over[0]
    base = _price("fedex", "fedex_ground", 2026, zone, 90)
    fuel = cents((base + Decimal(over["amount"])) * _fuel("fedex", 2026, "ground") / 100)

    q = quote_service(tables, tables.services["fedex_ground"], parcel, Controls(year=2026))

    assert q.dim_weight_lb == dim and q.billable_weight_lb == 90
    assert [(li.kind, li.surcharge_id, li.amount) for li in q.line_items] == [
        ("base", None, base),
        ("surcharge", over["surcharge_id"], Decimal(over["amount"])),
        ("fuel", None, fuel),
    ]
    assert "billed at the 90 lb minimum of the Oversize Charge" in q.line_items[0].label


def test_just_below_large_package_is_billed_normally(tables):
    # Longest side exactly 96 in and length + girth 128 in: no Large Package, only
    # Additional Handling (longest side > 48 in), which has no minimum.
    parcel = Parcel(weight_lb=20, length_in=96, width_in=8, height_in=8, distance_miles=700,
                    residential=False, speed="ground")
    zone = zone_from_csv("ups", 700)
    dim = _dim("ups", 2026, 96, 8, 8)
    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2026))
    assert q.billable_weight_lb == dim
    assert q.line_items[0].amount == _price("ups", "ups_ground", 2026, zone, dim)
    assert q.line_items[0].label == f"UPS Ground base rate (zone {zone}, {dim} lb)"
    conditions = {li.condition for li in q.line_items if li.kind == "surcharge"}
    assert conditions == {"additional_handling_length"}


def test_additional_handling_weight_alone_does_not_raise_billable_weight(tables):
    parcel = Parcel(weight_lb=60, distance_miles=700, residential=False, speed="ground")
    for service in ("ups_ground", "fedex_ground"):
        q = quote_service(tables, tables.services[service], parcel, Controls(year=2026))
        assert q.billable_weight_lb == 60
        assert {li.condition for li in q.line_items if li.kind == "surcharge"} == {"additional_handling_weight"}


def test_minimum_never_lowers_a_heavier_billable_weight(tables):
    # Oversize by length + girth with dim weight above 90 lb: billed at the dim weight,
    # which the 150 lb UPS and FedEx tables now price.
    parcel = Parcel(weight_lb=20, length_in=50, width_in=23, height_in=18, distance_miles=700,
                    residential=False, speed="ground")
    dim = _dim("ups", 2026, 50, 23, 18)
    assert 90 < dim <= 150
    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2026))
    assert q.available and q.billable_weight_lb == dim
    assert "minimum" not in q.line_items[0].label
    assert "oversize" in {li.condition for li in q.line_items}


# ---- engine rule on synthetic tables (weights 1-3 lb) -----------------------
BIG = Parcel(weight_lb=1, length_in=10, width_in=1, height_in=1, distance_miles=10, residential=False, speed="ground")


def test_minimum_raises_to_the_step_and_rematches_percent_amounts():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="big", condition="oversize", min_length_in="5", amount="4.00", exclusive_group="h",
             min_billable_weight_lb="2.5"),
        rule(surcharge_id="pct", condition="residential", unit="percent", amount="10", exclusive_group="p"),
    ])
    q = quote_service(t, t.services["ups_ground"], BIG, Controls(year=2030))
    items = {li.surcharge_id or li.kind: li.amount for li in q.line_items}
    assert q.billable_weight_lb == 3.0  # 2.5 lb minimum -> the 3 lb step
    assert items["base"] == Decimal("14.50") and items["pct"] == Decimal("1.45")
    assert q.line_items[0].label == "UPS Ground base rate (zone 2), billed at the 2.5 lb minimum of the S"


def test_minimum_of_a_rule_that_lost_its_exclusive_group_does_not_apply():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="small", condition="oversize", min_length_in="5", amount="1.00", exclusive_group="h",
             min_billable_weight_lb="3"),
        rule(surcharge_id="large", condition="additional_handling_length", min_length_in="5", amount="9.00",
             exclusive_group="h"),
    ])
    q = quote_service(t, t.services["ups_ground"], BIG, Controls(year=2030))
    assert q.billable_weight_lb == 1.0
    assert [li.surcharge_id for li in q.line_items if li.kind == "surcharge"] == ["large"]


def test_minimum_above_the_heaviest_step_is_unavailable():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="big", display_name="Large Package Surcharge", condition="oversize", min_length_in="5",
             exclusive_group="h", min_billable_weight_lb="90"),
    ])
    q = quote_service(t, t.services["ups_ground"], BIG, Controls(year=2030))
    assert not q.available
    assert q.unavailable_reason == ("the 90 lb minimum billable weight of the Large Package Surcharge is above "
                                    "the heaviest published price (3 lb)")
