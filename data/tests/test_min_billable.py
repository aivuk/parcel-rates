"""The minimum billable weight of UPS Large Packages and FedEx Oversize packages is
data with a citation: each year's sentence must be on the cited page, the weight is
read from it, and every oversize row of that year carries that weight and quote."""
from __future__ import annotations

import os

import pytest

from data.pipeline import fedex_rules, ups_rules
from data.pipeline.common import min_billable_lb, normalize_text, processed_path, read_table, source_text

CITATIONS = {
    "ups": {year: {**spec, "file": ups_rules.GUIDES[year]["file"]} for year, spec in ups_rules.LPS_MIN_BILLABLE.items()},
    "fedex": fedex_rules.OVERSIZE_MIN_BILLABLE,
}
CASES = [pytest.param(owner, year, spec, id=f"{owner}-{year}")
         for owner, by_year in CITATIONS.items() for year, spec in by_year.items()]


@pytest.mark.parametrize("owner,year,spec", CASES)
def test_minimum_sentence_is_on_the_cited_page(owner, year, spec):
    try:
        text = normalize_text(source_text(spec["file"], spec["page"]))
    except FileNotFoundError as error:
        if os.environ.get("ALLOW_MISSING_RAW") == "1":
            pytest.skip(str(error))
        pytest.fail(f"{error}. Run `python3 data/fetch_raw.py`, or set ALLOW_MISSING_RAW=1 to skip on purpose.")
    for fragment in spec["quotes"]:
        assert normalize_text(fragment) in text, f"not on {spec['file']} p.{spec['page']}: {fragment}"
    assert min_billable_lb(spec["quotes"][-1]) == "90"


@pytest.mark.parametrize("owner", list(CITATIONS))
def test_every_oversize_row_carries_the_cited_minimum(owner):
    rows = read_table(processed_path(owner, "surcharges"))
    oversize = [r for r in rows if r["condition"] == "oversize"]
    assert {int(r["year"]) for r in oversize} == set(CITATIONS[owner])
    for row in rows:
        if row["condition"] != "oversize":
            assert row["min_billable_weight_lb"] == "", row["surcharge_id"]
            continue
        spec = CITATIONS[owner][int(row["year"])]
        assert row["min_billable_weight_lb"] == min_billable_lb(spec["quotes"][-1]), row["surcharge_id"]
        assert spec["quotes"][-1] in row["notes"], row["surcharge_id"]
        assert "not modelled" not in row["notes"] and "not modeled" not in row["notes"], row["surcharge_id"]


def test_usps_has_no_minimum_billable_weight():
    rows = read_table(processed_path("usps", "surcharges"))
    assert rows and all(r["min_billable_weight_lb"] == "" for r in rows)


@pytest.mark.parametrize("quote,expected", [
    ("to a minimum billable weight of 90 pounds.", "90"),
    ("weight, subject to a 90-lb. minimum billable weight.", "90"),
])
def test_min_billable_lb_reads_both_carriers(quote, expected):
    assert min_billable_lb(quote) == expected


def test_min_billable_lb_rejects_other_text():
    with pytest.raises(ValueError):
        min_billable_lb("Large Packages are subject")
