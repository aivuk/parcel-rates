"""Rate-table invariants. Each anomaly must be listed in the carrier's exceptions.csv
(then it is a warning) or the test fails. See docs/data/SCHEMA.md."""
from __future__ import annotations

import re
import warnings
from collections import defaultdict
from decimal import Decimal

from data.pipeline.common import (
    COLUMNS,
    EXCEPTION_KINDS,
    MAX_WEIGHT_LB,
    RATE_CARDS,
    USPS_OUNCE_STEPS,
    ZONES,
    manifest_paths,
)

MONEY = re.compile(r"^\d+\.\d{2}$")


def matches(exception: dict, **cell) -> bool:
    """An exception row matches a cell when every non-empty scope field equals it."""
    for field, value in cell.items():
        scope = exception.get(field, "")
        if scope and str(scope) != str(value):
            return False
    return True


def report(anomalies: list[dict], exceptions: list[dict]) -> None:
    undocumented = []
    for anomaly in anomalies:
        kind = anomaly.pop("kind")
        if any(matches(e, **anomaly) and e["kind"] == kind for e in exceptions):
            warnings.warn(f"documented exception {kind}: {anomaly}", stacklevel=2)
        else:
            undocumented.append((kind, anomaly))
    assert not undocumented, "undocumented anomalies (add them to exceptions.csv):\n" + "\n".join(
        f"  {kind}: {cell}" for kind, cell in undocumented[:40]
    )


def test_columns_match_schema(base_rates):
    assert list(base_rates[0].keys()) == COLUMNS["base_rates"]


def test_exception_kinds_are_known(exceptions):
    bad = {e["kind"] for e in exceptions} - set(EXCEPTION_KINDS)
    assert not bad, bad


def test_sources_are_in_manifest(base_rates):
    missing = {row["source_file"] for row in base_rates} - manifest_paths()
    assert not missing, missing


def test_rate_cards_and_zones(carrier, base_rates, exceptions):
    anomalies = []
    allowed_zones = set(ZONES[carrier])
    for row in base_rates:
        if row["rate_card"] not in RATE_CARDS[carrier]:
            anomalies.append({"kind": "other", "service_id": row["service_id"], "rate_card": row["rate_card"], "year": row["year"]})
        if int(row["zone"]) not in allowed_zones:
            anomalies.append({"kind": "ak_hi_zone", "service_id": row["service_id"], "year": row["year"], "zone": row["zone"]})
    report(anomalies, exceptions)


def test_prices_are_clean_money(base_rates, exceptions):
    anomalies = [
        {"kind": "rounding_artifact", "service_id": r["service_id"], "year": r["year"], "zone": r["zone"], "max_weight_lb": r["max_weight_lb"]}
        for r in base_rates if not MONEY.match(r["price"])
    ]
    report(anomalies, exceptions)


def test_weight_labels_are_clean(carrier, base_rates, exceptions):
    anomalies = []
    for r in base_rates:
        label = r["max_weight_lb"]
        ok = label.isdigit() or (carrier == "usps" and label in USPS_OUNCE_STEPS)
        if not ok:
            anomalies.append({"kind": "rounding_artifact", "service_id": r["service_id"], "year": r["year"], "max_weight_lb": label})
    report(anomalies, exceptions)


def grouped(base_rates):
    tables = defaultdict(dict)
    for r in base_rates:
        key = (r["service_id"], r["rate_card"], r["year"])
        tables[key][(int(r["zone"]), Decimal(r["max_weight_lb"]))] = Decimal(r["price"])
    return tables


def test_coverage_complete(carrier, base_rates, exceptions):
    anomalies = []
    for (service, card, year), cells in grouped(base_rates).items():
        zones_present = {z for z, _ in cells}
        steps_by_zone = defaultdict(set)
        for z, w in cells:
            steps_by_zone[z].add(w)
        for zone in ZONES[carrier]:
            if zone not in zones_present:
                anomalies.append({"kind": "missing_cell", "service_id": service, "rate_card": card, "year": year, "zone": zone})
        steps = set.union(*steps_by_zone.values()) if steps_by_zone else set()
        for zone, present in steps_by_zone.items():
            for w in steps - present:
                anomalies.append({"kind": "missing_cell", "service_id": service, "rate_card": card, "year": year, "zone": zone, "max_weight_lb": w})
        if steps and max(steps) != MAX_WEIGHT_LB[carrier]:
            anomalies.append({"kind": "missing_cell", "service_id": service, "rate_card": card, "year": year, "max_weight_lb": MAX_WEIGHT_LB[carrier]})
        whole = sorted(w for w in steps if w == w.to_integral_value())
        for a, b in zip(whole, whole[1:]):
            if b - a != 1:
                anomalies.append({"kind": "missing_cell", "service_id": service, "rate_card": card, "year": year, "max_weight_lb": a + 1})
    report(anomalies, exceptions)


def test_prices_monotonic(base_rates, exceptions):
    anomalies = []
    for (service, card, year), cells in grouped(base_rates).items():
        zones = sorted({z for z, _ in cells})
        steps = sorted({w for _, w in cells})
        for z in zones:
            for a, b in zip(steps, steps[1:]):
                if (z, a) in cells and (z, b) in cells and cells[(z, b)] < cells[(z, a)]:
                    anomalies.append({"kind": "non_monotonic", "service_id": service, "rate_card": card, "year": year, "zone": z, "max_weight_lb": b})
        for w in steps:
            for z1, z2 in zip(zones, zones[1:]):
                if (z1, w) in cells and (z2, w) in cells and cells[(z2, w)] < cells[(z1, w)]:
                    anomalies.append({"kind": "non_monotonic", "service_id": service, "rate_card": card, "year": year, "zone": z2, "max_weight_lb": w})
    report(anomalies, exceptions)
