"""Structural checks for the hand-curated shared tables and surcharges."""
from __future__ import annotations

from collections import Counter

import pytest

from data.pipeline.common import (
    CARRIERS,
    COLUMNS,
    RATE_CARDS,
    processed_path,
    read_table,
)

TIERS = {"ground", "two_three_day", "next_day"}
BOOL = {"true", "false"}


def services() -> list[dict]:
    return read_table(processed_path("shared", "services"))


def test_services_schema_and_enums():
    rows = services()
    assert rows and list(rows[0].keys()) == COLUMNS["services"]
    for row in rows:
        assert row["carrier"] in CARRIERS, row
        assert row["tier"] in TIERS, row
        assert row["residential_allowed"] in BOOL and row["business_allowed"] in BOOL, row
        assert row["residential_allowed"] == "true" or row["business_allowed"] == "true", row
        assert set(row["rate_cards"].split(",")) == set(RATE_CARDS[row["carrier"]]), row
        for card in RATE_CARDS[row["carrier"]]:
            assert f"{card}:" in row["rate_card_notes"], f"{row['service_id']}: no note for card {card}"
        assert int(row["max_weight_lb"]) == (70 if row["carrier"] == "usps" else 150), row
    ids = [r["service_id"] for r in rows]
    assert len(ids) == len(set(ids))


def test_every_parsed_service_is_declared(carrier):
    declared = {r["service_id"] for r in services() if r["carrier"] == carrier}
    parsed = {r["service_id"] for r in read_table(processed_path(carrier, "base_rates"))}
    assert parsed <= declared, parsed - declared
    assert declared <= parsed, f"declared but never parsed: {declared - parsed}"


def surcharges(carrier: str) -> list[dict]:
    rows = read_table(processed_path(carrier, "surcharges"))
    if not rows:
        pytest.skip(f"{carrier}: no surcharges")
    return rows


def test_surcharge_ids_unique(carrier):
    dupes = [k for k, n in Counter(r["surcharge_id"] for r in surcharges(carrier)).items() if n > 1]
    assert not dupes, dupes


def test_surcharge_groups_and_windows(carrier):
    for row in surcharges(carrier):
        assert row["exclusive_group"], f"{row['surcharge_id']}: empty exclusive_group"
        assert row["effective_from"], row["surcharge_id"]
        if row["effective_to"]:
            assert row["effective_from"] <= row["effective_to"], row["surcharge_id"]
        assert row["unit"] in {"usd", "percent"}, row["surcharge_id"]
        assert row["fuel_applies"] in BOOL, row["surcharge_id"]
        if row["rate_card"]:
            assert row["rate_card"] in RATE_CARDS[carrier], row["surcharge_id"]


def test_surcharge_applies_to_known_services(carrier):
    known = {r["service_id"] for r in services() if r["carrier"] == carrier} | {"all", "ground", "air"}
    for row in surcharges(carrier):
        tokens = set(row["applies_to"].split(","))
        assert tokens <= known, f"{row['surcharge_id']}: unknown {tokens - known}"


def test_same_group_windows_do_not_overlap_with_different_amounts(carrier):
    """Within one group and scope, two rows active on the same day must not disagree
    unless their thresholds or zones differ (then they are different tiers)."""
    scope = ("exclusive_group", "applies_to", "address_type", "rate_card", "condition", "zone_min", "zone_max",
             "min_weight_lb", "max_weight_lb", "min_length_in", "min_width_in", "min_length_plus_girth_in",
             "min_volume_cuft")
    by_scope: dict[tuple, list[dict]] = {}
    for row in surcharges(carrier):
        by_scope.setdefault(tuple(row[c] for c in scope), []).append(row)
    problems = []
    for rows in by_scope.values():
        rows.sort(key=lambda r: r["effective_from"])
        for a, b in zip(rows, rows[1:]):
            a_end = a["effective_to"] or "9999-12-31"
            if b["effective_from"] < a_end and a["amount"] != b["amount"]:
                problems.append(f"{a['surcharge_id']} ({a['amount']}) overlaps {b['surcharge_id']} ({b['amount']})")
    assert not problems, "\n".join(problems[:20])
