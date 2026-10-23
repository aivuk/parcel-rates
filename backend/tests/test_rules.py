"""Fuel, exclusive groups, peak gating and time-varying rules."""

from __future__ import annotations

import math
from datetime import date
from decimal import Decimal

from app.engine.quote import quote_service
from app.engine.rules import resolve_dim_rule, zone_for
from app.engine.types import Controls, FuelOverride, Parcel
from tests.conftest import cents, read_csv, rule, synthetic_tables

HOME = Parcel(weight_lb=1.5, distance_miles=10, residential=True, speed="ground", delivery_area="das")


def _items(q):
    return {li.surcharge_id or li.kind: li.amount for li in q.line_items}


# ---- fuel (docs/data/SCHEMA.md "Engine tests for fuel") --------------------
def _fuel_tables():
    return synthetic_tables(
        surcharges=[
            rule(surcharge_id="res", condition="residential", address_type="residential", amount="3.10",
                 exclusive_group="res", fuel_applies="true"),
            rule(surcharge_id="das", condition="delivery_area", amount="2.05", exclusive_group="das",
                 fuel_applies="false"),
        ]
    )


def test_fuel_applies_to_base_plus_flagged_surcharges_only():
    t = _fuel_tables()
    q = quote_service(t, t.services["ups_ground"], HOME, Controls(year=2030))
    items = _items(q)
    assert items["base"] == Decimal("12.00") and items["res"] == Decimal("3.10") and items["das"] == Decimal("2.05")
    assert items["fuel"] == cents(Decimal("0.125") * (Decimal("12.00") + Decimal("3.10")))  # 1.89
    assert q.total == Decimal("12.00") + Decimal("3.10") + Decimal("2.05") + items["fuel"]


def test_fuel_override_replaces_yearly_default():
    t = _fuel_tables()
    q = quote_service(t, t.services["ups_ground"], HOME,
                      Controls(year=2030, fuel_override_percent=FuelOverride(ground=20)))
    assert _items(q)["fuel"] == cents(Decimal("0.20") * Decimal("15.10"))
    assert q.line_items[-1].source == "fuel override"
    # an override for the other group leaves the default in place
    q2 = quote_service(t, t.services["ups_ground"], HOME,
                       Controls(year=2030, fuel_override_percent=FuelOverride(express=50)))
    assert _items(q2)["fuel"] == cents(Decimal("0.125") * Decimal("15.10"))


def test_usps_has_no_fuel_line_even_with_override():
    t = _fuel_tables()
    q = quote_service(t, t.services["usps_ground_advantage"], HOME,
                      Controls(year=2030, fuel_override_percent=FuelOverride(ground=30)))
    assert all(li.kind != "fuel" for li in q.line_items)


def test_usps_real_quotes_have_no_fuel_line(tables):
    for sid in ("usps_ground_advantage", "usps_priority_mail", "usps_priority_mail_express"):
        q = quote_service(tables, tables.services[sid], HOME, Controls(year=2026))
        assert q.available and all(li.kind != "fuel" for li in q.line_items)


def test_carrier_without_fuel_row_for_year_gets_no_fuel_line():
    t = synthetic_tables(fuel=[dict(carrier="ups", year="2029", service_group="ground", default_percent="9",
                                    is_proxy="true", window_start="", window_end="", source_file="", source_ref="")])
    q = quote_service(t, t.services["ups_ground"], HOME, Controls(year=2030))
    assert all(li.kind != "fuel" for li in q.line_items)


# ---- exclusive groups ------------------------------------------------------
def test_same_exclusive_group_keeps_only_the_highest():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="low", condition="additional_handling_weight", min_weight_lb="1", amount="5.00",
             exclusive_group="handling"),
        rule(surcharge_id="high", condition="additional_handling_packaging", amount="9.00",
             exclusive_group="handling"),
        rule(surcharge_id="other", condition="residential", amount="1.00", exclusive_group="res"),
    ])
    parcel = Parcel(weight_lb=2, distance_miles=5, residential=True, speed="ground", nonstandard_packaging=True)
    q = quote_service(t, t.services["ups_ground"], parcel, Controls(year=2030))
    ids = [li.surcharge_id for li in q.line_items if li.kind == "surcharge"]
    assert ids == ["high", "other"]


def test_percent_surcharge_applies_to_base_rate():
    t = synthetic_tables(surcharges=[
        rule(carrier="usps", surcharge_id="pct", condition="transportation_time_limited", amount="8", unit="percent",
             exclusive_group="t"),
    ])
    q = quote_service(t, t.services["usps_ground_advantage"], HOME, Controls(year=2030))
    assert _items(q)["pct"] == cents(Decimal("12.00") * Decimal("0.08"))


def test_rule_filters_address_rate_card_service_zone_and_window():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="biz", address_type="commercial", exclusive_group="a"),
        rule(surcharge_id="retail_only", rate_card="retail", exclusive_group="b"),
        rule(surcharge_id="air", applies_to="air", exclusive_group="c"),
        rule(surcharge_id="far", zone_min="5", exclusive_group="d"),
        rule(surcharge_id="old", effective_to="2029-12-31", exclusive_group="e"),
        rule(surcharge_id="ground", applies_to="ground", exclusive_group="f"),
        rule(surcharge_id="listed", applies_to="usps_ground_advantage,ups_ground", exclusive_group="g"),
    ])
    q = quote_service(t, t.services["ups_ground"], HOME, Controls(year=2030))
    assert [li.surcharge_id for li in q.line_items if li.kind == "surcharge"] == ["ground", "listed"]


def test_dimension_thresholds():
    t = synthetic_tables(surcharges=[
        rule(carrier="usps", surcharge_id="len", condition="additional_handling_length", min_length_in="48", exclusive_group="1"),
        rule(carrier="usps", surcharge_id="wid", condition="additional_handling_width", min_width_in="30", exclusive_group="2"),
        rule(carrier="usps", surcharge_id="girth", condition="oversize", min_length_plus_girth_in="130", exclusive_group="3"),
        rule(carrier="usps", surcharge_id="vol", condition="nonstandard_volume", min_volume_cuft="2", exclusive_group="4"),
    ])
    small = Parcel(weight_lb=1, length_in=48, width_in=30, height_in=2, distance_miles=1, residential=False,
                   speed="ground")
    assert [li.kind for li in quote_service(t, t.services["usps_ground_advantage"], small,
                                            Controls(year=2030)).line_items] == ["base"]
    # 49 x 31 x 20: longest > 48, second > 30, L+G = 49 + 2*51 = 151 > 130, 30380 cu in > 2 cu ft
    big = Parcel(weight_lb=1, length_in=20, width_in=49, height_in=31, distance_miles=1, residential=False,
                 speed="ground")
    q = quote_service(t, t.services["usps_ground_advantage"], big, Controls(year=2030))
    assert q.dim_weight_lb is None  # synthetic USPS dim threshold is above this volume
    assert [li.surcharge_id for li in q.line_items if li.kind == "surcharge"] == ["len", "wid", "girth", "vol"]
    # without dimensions no dimension rule can apply
    flat = Parcel(weight_lb=1, distance_miles=1, residential=False, speed="ground")
    assert len(quote_service(t, t.services["usps_ground_advantage"], flat, Controls(year=2030)).line_items) == 1
    # dim weight beyond the published steps makes the service unavailable
    ups_big = quote_service(t, t.services["ups_ground"], big, Controls(year=2030))
    assert not ups_big.available


# ---- peak ------------------------------------------------------------------
def test_peak_add_ons_only_with_the_charge_they_add_to():
    t = synthetic_tables(surcharges=[
        rule(surcharge_id="ah", condition="additional_handling_packaging", amount="20.00", exclusive_group="h"),
        rule(surcharge_id="peak_ah", condition="peak_additional_handling", amount="5.00", exclusive_group="ph"),
        rule(surcharge_id="peak_os", condition="peak_oversize", amount="50.00", exclusive_group="po"),
        rule(surcharge_id="peak_res", condition="peak_residential", address_type="residential",
             amount="0.50", exclusive_group="pr"),
    ])
    plain = Parcel(weight_lb=1, distance_miles=1, residential=True, speed="ground")
    odd = Parcel(weight_lb=1, distance_miles=1, residential=True, speed="ground", nonstandard_packaging=True)
    ids = lambda q: [li.surcharge_id for li in q.line_items if li.kind == "surcharge"]  # noqa: E731
    peak = Controls(year=2030, peak=True)
    assert ids(quote_service(t, t.services["ups_ground"], plain, peak)) == ["peak_res"]
    assert sorted(ids(quote_service(t, t.services["ups_ground"], odd, peak))) == ["ah", "peak_ah", "peak_res"]
    assert ids(quote_service(t, t.services["ups_ground"], odd, Controls(year=2030))) == ["ah"]


def test_peak_moves_as_of_to_december_10(tables):
    parcel = Parcel(weight_lb=2, distance_miles=700, residential=True, speed="ground")
    q = quote_service(tables, tables.services["fedex_home_delivery"], parcel, Controls(year=2026, peak=True))
    assert q.as_of == date(2026, 12, 10)
    peak_rows = [
        r for r in read_csv("fedex/surcharges.csv")
        if r["year"] == "2026" and r["condition"] == "peak_residential"
        and r["effective_from"] <= "2026-12-10" <= (r["effective_to"] or "9999")
    ]
    assert len(peak_rows) == 1
    items = {li.surcharge_id: li.amount for li in q.line_items}
    assert items[peak_rows[0]["surcharge_id"]] == Decimal(peak_rows[0]["amount"])
    off = quote_service(tables, tables.services["fedex_home_delivery"], parcel, Controls(year=2026))
    assert peak_rows[0]["surcharge_id"] not in {li.surcharge_id for li in off.line_items}


def test_peak_rows_outside_their_window_do_not_apply(tables):
    # The 2025-labelled UPS peak rows cover the 2024-25 season only.
    parcel = Parcel(weight_lb=2, distance_miles=700, residential=True, speed="ground")
    q = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2025, peak=True))
    assert not any(li.condition and li.condition.startswith("peak_") for li in q.line_items)
    q24 = quote_service(tables, tables.services["ups_ground"], parcel, Controls(year=2024, peak=True))
    assert any(li.condition == "peak_residential" for li in q24.line_items)


def test_usps_2026_transportation_increase_by_window(tables):
    parcel = Parcel(weight_lb=2, distance_miles=700, residential=True, speed="ground")
    sid = "usps_ground_advantage"
    jan = quote_service(tables, tables.services[sid], parcel, Controls(year=2026))
    assert [li.kind for li in jan.line_items] == ["base"]
    may = quote_service(tables, tables.services[sid], parcel, Controls(year=2026, as_of=date(2026, 5, 1)))
    row = [r for r in read_csv("usps/surcharges.csv") if r["condition"] == "transportation_time_limited"][0]
    base = may.line_items[0].amount
    assert may.line_items[1].surcharge_id == row["surcharge_id"]
    assert may.line_items[1].amount == cents(base * Decimal(row["amount"]) / 100)


# ---- dimensional weight over time -------------------------------------------
def _usps_divisor(as_of: str) -> int:
    rows = [r for r in read_csv("usps/dim_weight.csv") if r["year"] == "2026"
            and r["effective_from"] <= as_of <= (r["effective_to"] or "9999")]
    assert len(rows) == 1
    return int(rows[0]["divisor"])


def test_usps_2026_dim_divisor_changes_on_july_12(tables):
    parcel = Parcel(weight_lb=1, length_in=15, width_in=15, height_in=12, distance_miles=700,
                    residential=True, speed="ground")
    svc = tables.services["usps_ground_advantage"]
    jan = quote_service(tables, svc, parcel, Controls(year=2026))
    jul = quote_service(tables, svc, parcel, Controls(year=2026, as_of=date(2026, 7, 12)))
    assert _usps_divisor("2026-01-18") == 166 and _usps_divisor("2026-07-12") == 139
    assert resolve_dim_rule(tables, "usps", 2026, date(2026, 7, 11)).divisor == 166
    assert jan.dim_weight_lb == math.ceil(15 * 15 * 12 / 166)
    assert jul.dim_weight_lb == math.ceil(15 * 15 * 12 / 139)


def test_usps_dim_weight_only_above_minimum_volume(tables):
    parcel = Parcel(weight_lb=1, length_in=12, width_in=12, height_in=12, distance_miles=700,
                    residential=True, speed="ground")  # exactly 1728 cu in
    q = quote_service(tables, tables.services["usps_ground_advantage"], parcel, Controls(year=2026))
    assert q.dim_weight_lb is None


def test_ups_2026_rounds_fractional_dimensions_up_but_2025_rounds_to_nearest(tables):
    parcel = Parcel(weight_lb=1, length_in=12.2, width_in=10.2, height_in=8.2, distance_miles=700,
                    residential=False, speed="ground")
    svc = tables.services["ups_ground"]
    q25 = quote_service(tables, svc, parcel, Controls(year=2025))
    q26 = quote_service(tables, svc, parcel, Controls(year=2026))
    assert q25.dim_weight_lb == math.ceil(12 * 10 * 8 / 139)  # 7
    assert q26.dim_weight_lb == math.ceil(13 * 11 * 9 / 139)  # 10


def test_zone_bands(tables):
    assert zone_for(tables, "usps", 0) == 1
    assert zone_for(tables, "usps", 50.5) == 2  # between integer bands: next band up
    assert zone_for(tables, "ups", 25) == 2
    assert zone_for(tables, "fedex", 5000) == 8
    assert zone_for(tables, "nobody", 10) is None


# ---- availability -----------------------------------------------------------
def test_fedex_ground_business_only_and_home_delivery_residential_only(tables):
    home = Parcel(weight_lb=2, distance_miles=300, residential=True, speed="ground")
    office = Parcel(weight_lb=2, distance_miles=300, residential=False, speed="ground")
    g = quote_service(tables, tables.services["fedex_ground"], home, Controls(year=2026))
    hd = quote_service(tables, tables.services["fedex_home_delivery"], office, Controls(year=2026))
    assert not g.available and "business" in g.unavailable_reason
    assert not hd.available and "residential" in hd.unavailable_reason
    assert quote_service(tables, tables.services["fedex_ground"], office, Controls(year=2026)).available
    assert quote_service(tables, tables.services["fedex_home_delivery"], home, Controls(year=2026)).available
