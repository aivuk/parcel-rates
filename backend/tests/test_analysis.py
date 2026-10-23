"""Breakeven, blended and yearly views."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

import pytest

from app.engine import segments as seg
from app.engine.blended import blended
from app.engine.breakeven import breakeven, default_distances, default_weights
from app.engine.quote import cheapest_for_carrier, price_charged
from app.engine.tables import AnnouncedIncrease
from app.engine.types import Controls, Parcel
from app.engine.yearly import allocate_cents, announced_increase, yearly
from app.main import load_sample_parcels


@pytest.fixture(scope="module")
def sample():
    return [Parcel(**p) for p in load_sample_parcels()]


# ---- breakeven ---------------------------------------------------------------
def test_default_grid(tables):
    assert default_weights(tables) == [float(w) for w in range(1, 71)]
    d = default_distances(tables)
    assert len(d) == len(tables.zone_bands["usps"])
    assert d[0] == 25 and d[-1] == 2000  # last band: previous upper edge (1800) + 200


def test_usps_wins_light_and_near_residential(tables):
    r = breakeven(tables, Controls(year=2026), residential=True, weights_lb=[1, 2], distances_miles=[25, 100])
    for cell in r["cells"]:
        assert cell["winner"]["carrier"] == "usps"
        assert cell["saving"] >= 0
        assert cell["zone_usps"] in (1, 2)


def test_some_band_has_a_finite_breakeven(tables):
    for residential in (True, False):
        r = breakeven(tables, Controls(year=2026), residential=residential)
        assert len(r["cells"]) == 70 * 8
        finite = [b for b in r["breakeven_weight_lb"] if b["vs_ups"] is not None or b["vs_fedex"] is not None]
        assert finite, "USPS should lose to UPS or FedEx somewhere on the grid"
        for b in finite:
            cell = next(c for c in r["cells"] if c["distance_miles"] == b["distance_miles"]
                        and c["weight_lb"] == (b["vs_ups"] or b["vs_fedex"]))
            other = "ups" if b["vs_ups"] is not None else "fedex"
            assert cell["totals"]["usps"] >= cell["totals"][other]


def test_breakeven_uses_home_delivery_for_residential(tables):
    r = breakeven(tables, Controls(year=2026), residential=True, weights_lb=[60], distances_miles=[2000])
    picks = {r["cells"][0]["winner"]["service_id"], r["cells"][0]["runner_up"]["service_id"]}
    assert "fedex_ground" not in picks


# ---- blended -----------------------------------------------------------------
def test_blended_totals_equal_sum_of_per_parcel_quotes(tables, sample):
    controls = Controls(year=2026)
    r = blended(tables, sample, controls)
    for row in r["carriers"]:
        total = Decimal(0)
        for p in sample:
            q = cheapest_for_carrier(tables, row["carrier"], p.speed, p, controls)
            total += q.total * p.quantity
        assert row["total_cost"] == float(total)
        split = row["split"]
        assert abs(split["base"]["total"] + split["surcharges"]["total"] + split["fuel"]["total"]
                   - row["total_cost"]) < 0.011
        assert abs(sum(c["total"] for c in row["surcharges_by_condition"]) - split["surcharges"]["total"]) < 0.05
        assert row["parcels_shipped"] == sum(p.quantity for p in sample)
        assert 0 <= row["loss_share"] <= 1
    best = r["best_mix"]
    assert best["cost_per_parcel"] <= min(c["cost_per_parcel"] for c in r["carriers"])
    assert sum(best["parcels_by_carrier"].values()) == best["parcels_shipped"]


def test_blended_margin_uses_price_charged_over_flat_price(tables):
    p1 = Parcel(weight_lb=1, distance_miles=10, residential=False, speed="ground", price_charged=100)
    p2 = Parcel(weight_lb=1, distance_miles=10, residential=False, speed="ground")
    r = blended(tables, [p1, p2], Controls(year=2026, flat_price=0))
    usps = next(c for c in r["carriers"] if c["carrier"] == "usps")
    cost = float(cheapest_for_carrier(tables, "usps", "ground", p1, Controls(year=2026)).total)
    assert usps["margin_per_parcel"] == round((100 - cost + 0 - cost) / 2, 2)
    assert usps["loss_share"] == 0.5
    assert r["revenue_per_parcel"] == 50


def test_free_shipping_over_threshold_charges_nothing():
    rule = Controls(year=2026, flat_price=9.99, free_shipping_over=75)
    assert price_charged(Parcel(1, 10, True, "ground", order_value=75), rule) == 0
    assert price_charged(Parcel(1, 10, True, "ground", order_value=120, price_charged=19.99), rule) == 0
    assert price_charged(Parcel(1, 10, True, "ground", order_value=74.99), rule) == Decimal("9.99")
    assert price_charged(Parcel(1, 10, True, "ground", order_value=74.99, price_charged=19.99), rule) == Decimal("19.99")
    # Without an order value the rule cannot apply; without a threshold there is no rule.
    assert price_charged(Parcel(1, 10, True, "ground"), rule) == Decimal("9.99")
    assert price_charged(Parcel(1, 10, True, "ground", order_value=500), Controls(year=2026)) == Decimal("9.99")


def test_blended_counts_parcels_shipped_free(tables):
    big = Parcel(weight_lb=1, distance_miles=10, residential=False, speed="ground", quantity=3, order_value=90)
    small = Parcel(weight_lb=1, distance_miles=10, residential=False, speed="ground", order_value=20)
    r = blended(tables, [big, small], Controls(year=2026, flat_price=10, free_shipping_over=50))
    assert r["free_shipping"] == {"threshold": 50, "parcels": 3}
    assert r["revenue_per_parcel"] == 2.5  # (3 × $0 + $10) / 4
    assert blended(tables, [big, small], Controls(year=2026))["free_shipping"] is None


def test_sample_has_order_values_and_rule_is_off_by_default(tables, sample):
    assert all(p.order_value is not None and p.order_value > 0 for p in sample)
    off = blended(tables, sample, Controls(year=2026))
    on = blended(tables, sample, Controls(year=2026, free_shipping_over=75))
    assert 0 < on["free_shipping"]["parcels"] < off["parcels_considered"]
    assert on["revenue_per_parcel"] < off["revenue_per_parcel"]


def test_blended_segment_filter(tables, sample):
    f = seg.SegmentFilter(weight_band="1–5", residential=True, speed="ground")
    r = blended(tables, sample, Controls(year=2026), f)
    expected = sum(p.quantity for p in sample if seg.matches(tables, p, f))
    assert r["parcels_considered"] == expected > 0
    for z in ("1–2", "3–4", "5–6", "7–8"):
        assert blended(tables, sample, Controls(year=2026), seg.SegmentFilter(zone_band=z))["parcels_considered"] > 0


def test_blended_reports_unshippable_parcels(tables):
    huge = Parcel(weight_lb=20, length_in=40, width_in=30, height_in=20, distance_miles=10,
                  residential=False, speed="ground")
    r = blended(tables, [huge], Controls(year=2026))
    ups = next(c for c in r["carriers"] if c["carrier"] == "ups")
    assert ups["parcels_unavailable"] == 1 and ups["parcels_shipped"] == 0 and ups["cost_per_parcel"] == 0
    assert r["best_mix"]["parcels_by_carrier"]["usps"] == 1


def test_segments_cover_every_band(tables):
    assert seg.weight_band(Parcel(weight_lb=0.5, distance_miles=1, residential=True, speed="ground")) == "≤1"
    assert seg.weight_band(Parcel(weight_lb=70, distance_miles=1, residential=True, speed="ground")) == "20–70"
    assert seg.zone_band(tables, Parcel(weight_lb=1, distance_miles=5000, residential=True, speed="ground")) == "7–8"


# ---- yearly ------------------------------------------------------------------
def test_yearly_drivers_sum_to_total_change(tables, sample):
    r = yearly(tables, sample, Controls(year=2026), next_year_increase_percent=4)
    by_carrier = {c["carrier"]: c for c in r["carriers"]}
    assert [y["year"] for y in by_carrier["ups"]["years"]] == tables.years_for("ups")
    assert 2027 in [y["year"] for y in by_carrier["fedex"]["years"]]
    for c in r["carriers"]:
        rows = c["years"]
        assert rows[0]["change_vs_previous"] is None and rows[0]["drivers"] is None
        for prev, row in zip(rows, rows[1:]):
            change = row["change_vs_previous"]["dollars_per_parcel"]
            assert abs((row["cost_per_parcel"] - prev["cost_per_parcel"]) - change) <= 0.011
            for dim in ("weight_band", "zone_band", "residential", "speed"):
                contributions = sum(d["change_per_parcel"] for d in row["drivers"][dim])
                assert abs(contributions - change) <= 0.01, (c["carrier"], row["year"], dim)
        last = rows[-1]["cost_per_parcel"]
        assert c["projected"]["year"] == rows[-1]["year"] + 1
        assert abs(c["projected"]["cost_per_parcel"] - last * 1.04) <= 0.011


def _with_ups_2027(tables, percent="6.5"):
    row = AnnouncedIncrease("ups", 2027, "all", "list", Decimal(percent), "primary", "ups/2027/rate-changes.html")
    return replace(tables, increases=[*tables.increases, row])


def test_projection_uses_each_carriers_announced_next_year_increase(tables, sample):
    t = _with_ups_2027(tables)
    r = {c["carrier"]: c for c in yearly(t, sample[:40], Controls(year=2026), next_year_increase_percent=4)["carriers"]}
    ups = r["ups"]["projected"]
    assert (ups["year"], ups["increase_percent"], ups["basis"]) == (2027, 6.5, "announced")
    assert ups["source_files"] == ["ups/2027/rate-changes.html"]
    assert abs(ups["cost_per_parcel"] - r["ups"]["years"][-1]["cost_per_parcel"] * 1.065) <= 0.011
    # No announcement for USPS 2027 or FedEx 2028: the slider's percentage is an assumption.
    assert (r["usps"]["projected"]["year"], r["usps"]["projected"]["basis"]) == (2027, "assumed")
    assert (r["fedex"]["projected"]["year"], r["fedex"]["projected"]["increase_percent"]) == (2028, 4)
    assert r["fedex"]["projected"]["source_files"] == []


def test_projection_override_and_announced_without_a_slider(tables, sample):
    t = _with_ups_2027(tables)
    over = yearly(t, sample[:40], Controls(year=2026), next_year_increase_percent=3, next_year_override=True)
    assert {(c["projected"]["basis"], c["projected"]["increase_percent"]) for c in over["carriers"]} == {("override", 3)}
    bare = {c["carrier"]: c["projected"] for c in yearly(t, sample[:40], Controls(year=2026))["carriers"]}
    assert bare["ups"]["basis"] == "announced" and bare["usps"] is None and bare["fedex"] is None


def test_yearly_cost_equals_blended_for_each_year(tables, sample):
    r = yearly(tables, sample, Controls(year=2026))
    for c in r["carriers"]:
        assert c["parcels_excluded"] == 0
        for row in c["years"]:
            b = blended(tables, sample, Controls(year=row["year"]))
            match = next(x for x in b["carriers"] if x["carrier"] == c["carrier"])
            assert row["cost_per_parcel"] == match["cost_per_parcel"]


def test_yearly_peak_prices_on_december_10(tables, sample):
    r = yearly(tables, sample[:20], Controls(year=2026, peak=True))
    for c in r["carriers"]:
        for row in c["years"]:
            assert row["as_of"] == f"{row['year']}-12-10"


def test_announced_increase_prefers_all_then_averages_services(tables):
    ups = announced_increase(tables, "ups", 2026, ["ups_ground"], "commercial")
    assert ups["basis"] == "all" and ups["percent"] == 5.9 and ups["source_type"] == "secondary"
    usps = announced_increase(tables, "usps", 2026, ["usps_ground_advantage", "usps_priority_mail"], "commercial")
    assert usps["basis"] == "average_of_services"
    assert usps["percent"] == round((7.8 + 6.6) / 2, 2)
    card = announced_increase(tables, "usps", 2023, ["usps_ground_advantage"], "retail")
    assert card["percent"] == -3.2
    none = announced_increase(tables, "usps", 2019, ["usps_ground_advantage"], "retail")
    assert none["percent"] is None and none["basis"] == "none"


def test_yearly_warns_when_a_year_lacks_surcharge_rules(tables, sample):
    r = yearly(tables, sample[:10], Controls(year=2026))
    fedex = next(c for c in r["carriers"] if c["carrier"] == "fedex")
    y27 = next(y for y in fedex["years"] if y["year"] == 2027)
    assert y27["warnings"] and "delivery_area" in y27["warnings"][0]
    assert all(not y["warnings"] for y in fedex["years"] if y["year"] < 2027)


def test_allocate_cents_keeps_the_rounded_sum():
    values = {"a": Decimal("0.333"), "b": Decimal("0.333"), "c": Decimal("0.334")}
    out = allocate_cents(values, sum(values.values()))
    assert round(sum(out.values()), 2) == 1.0
    neg = {"a": Decimal("-0.335"), "b": Decimal("-0.335")}
    assert round(sum(allocate_cents(neg, sum(neg.values())).values()), 2) == -0.67


def test_fuel_override_applies_to_every_year(tables, sample):
    controls = replace(Controls(year=2026), fuel_override_percent=None)
    from app.engine.types import FuelOverride

    over = yearly(tables, sample[:5], replace(controls, fuel_override_percent=FuelOverride(ground=0, express=0)))
    ups = next(c for c in over["carriers"] if c["carrier"] == "ups")
    assert all(y["summary"]["split"]["fuel"]["total"] == 0 for y in ups["years"])


def test_yearly_reports_fuel_percent_per_year(tables, sample):
    r = yearly(tables, sample[:5], Controls(year=2026))
    by = {c["carrier"]: c for c in r["carriers"]}
    assert all(y["fuel"] is None for y in by["usps"]["years"])
    for y in by["ups"]["years"]:
        row = tables.fuel[("ups", y["year"], "ground")]
        assert y["fuel"]["ground"]["default_percent"] == float(row.default_percent)
        assert y["fuel"]["ground"]["applied_percent"] == float(row.default_percent)
        assert y["fuel"]["ground"]["is_proxy"] is True
    from app.engine.types import FuelOverride

    over = yearly(tables, sample[:5], Controls(year=2026, fuel_override_percent=FuelOverride(ground=15)))
    fx = next(c for c in over["carriers"] if c["carrier"] == "fedex")["years"][0]["fuel"]
    assert fx["ground"]["applied_percent"] == 15 and fx["express"]["applied_percent"] == fx["express"]["default_percent"]
