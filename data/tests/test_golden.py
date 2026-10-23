"""Hand-checked golden cells must match the parsed output exactly, and every
(service, rate_card, year) must have the mandatory corner cells."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from pathlib import Path

import pytest

from data.pipeline.common import ZONES, read_table

GOLDEN_DIR = Path(__file__).parent / "golden"
REQUIRED_EXTRA = {"checked_by"}
MIN_CELLS = 5


def golden_rows(carrier: str) -> list[dict]:
    rows = []
    for path in sorted(GOLDEN_DIR.glob(f"{carrier}_*.csv")):
        rows.extend(read_table(path))
    return rows


def test_golden_cells_match(carrier, base_rates):
    golden = golden_rows(carrier)
    if not golden:
        pytest.fail(f"{carrier}: no golden samples in {GOLDEN_DIR}")
    index = {
        (r["service_id"], r["rate_card"], r["year"], int(r["zone"]), Decimal(r["max_weight_lb"])): r["price"]
        for r in base_rates
    }
    mismatches = []
    for g in golden:
        assert REQUIRED_EXTRA <= set(g), f"golden row lacks {REQUIRED_EXTRA}: {g}"
        key = (g["service_id"], g["rate_card"], g["year"], int(g["zone"]), Decimal(g["max_weight_lb"]))
        parsed = index.get(key)
        if parsed is None or Decimal(parsed) != Decimal(g["price"]):
            mismatches.append((key, g["price"], parsed, g.get("source_ref")))
    assert not mismatches, "golden mismatches (key, expected, parsed, source_ref):\n" + "\n".join(map(str, mismatches))


def test_golden_corner_cells_present(carrier, base_rates):
    golden = golden_rows(carrier)
    by_table = defaultdict(list)
    for g in golden:
        by_table[(g["service_id"], g["rate_card"], g["year"])].append(g)
    parsed_tables = defaultdict(list)
    for r in base_rates:
        parsed_tables[(r["service_id"], r["rate_card"], r["year"])].append(r)
    problems = []
    for key, rows in parsed_tables.items():
        steps = sorted({Decimal(r["max_weight_lb"]) for r in rows})
        zones = sorted({int(r["zone"]) for r in rows} & set(ZONES[carrier]))
        heaviest, lightest, nearest, farthest = steps[-1], steps[0], zones[0], zones[-1]
        cells = {(int(g["zone"]), Decimal(g["max_weight_lb"])) for g in by_table.get(key, [])}
        for name, cell in {
            "heaviest/farthest": (farthest, heaviest),
            "heaviest/nearest": (nearest, heaviest),
            "lightest/farthest": (farthest, lightest),
        }.items():
            if cell not in cells:
                problems.append(f"{key}: missing golden corner {name} = zone {cell[0]}, {cell[1]} lb")
        if len(cells) < MIN_CELLS:
            problems.append(f"{key}: only {len(cells)} golden cells, need {MIN_CELLS}")
        # Column and page shifts corrupt cells on later pages, so when the parsed table
        # spans several pages or sheets the golden cells must cover at least two of them.
        page_of = {(int(r["zone"]), Decimal(r["max_weight_lb"])): r["source_ref"] for r in rows}
        table_pages = set(page_of.values())
        covered = {page_of[c] for c in cells if c in page_of}
        if len(table_pages) > 1 and len(covered) < 2:
            problems.append(f"{key}: table spans {len(table_pages)} source pages but golden cells cover only {sorted(covered)}")
    assert not problems, "\n".join(problems)
