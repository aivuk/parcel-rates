"""Unit tests for the USPS price-CSV parser (data/pipeline/usps.py)."""
from __future__ import annotations

import csv
import io

import pytest

from data.pipeline.usps import find_zone_header, ounces_to_pounds, parse_price_csv

GROUND_ADVANTAGE_FIXTURE = """USPS Ground Advantage,Final,,12/14/2023
Retail,,,,,,,,,,
Weight Not Over (ounces),Zones,,,,,,,,,
,Zone 1,Zone 2,Zone 3,Zone 4,Zone 5,Zone 6,Zone 7,Zone 8,Zone 9,
4,5.00,5.10,5.15,5.25,5.35,5.40,5.45,5.55,5.55,
8,5.70,5.80,5.85,5.90,5.95,6.00,6.05,6.15,6.15
15.999000000000001,8.00,8.20,8.30,8.45,8.60,8.70,8.85,9.00,9.00
Weight Not Over (pounds),-,-,-,-,-,-,-,-,-
1,8.00,8.20,8.30,8.45,8.60,8.70,8.85,9.00,9.00
70,54.30,58.10,63.75,83.45,107.25,127.20,146.15,165.05,165.05
Oversized,93.95,104.25,119.65,145.35,170.80,196.40,221.00,246.60,246.60
"Parcels exceeding one cubic foot are charged on the actual weight or the dimensional weight, whichever is greater. "
Nonstandard Length fee > 30",8.40,,
"""

PRIORITY_MAIL_FIXTURE = """Priority Mail - Retail,,Final,,12/14/2023
,
Flat Rate Envelopes,9.85,,,,,,,
Large Flat Rate Boxes,24.75,,,,,,,
,,,,,,,,
"Letters, Large Envelopes, Parcels",,,,,,,,
Weight Not Over (Lbs),Zones,,,,,,,,
,Zone 1,Zone 2,Zone 3,Zone 4,Zone 5,Zone 6,Zone 7,Zone 8,Zone 9,,,,,,,,
1,9.25,9.50,9.60,9.80,10.75,11.60,12.45,13.45,27.15,,,,,,,,
2,10.35,11.00,11.70,12.50,14.50,15.45,16.40,18.05,36.45,,,,,,,,
"""


def test_find_zone_header_skips_irregular_preamble():
    rows = list(csv.reader(io.StringIO(PRIORITY_MAIL_FIXTURE)))
    index, zones = find_zone_header(rows)
    assert index == 7
    assert zones == {zone: zone for zone in range(1, 10)}


def test_find_zone_header_fails_loudly_without_header():
    with pytest.raises(ValueError):
        find_zone_header([["Priority Mail", "Final"], ["1", "9.25"]])


@pytest.mark.parametrize("ounces,expected", [
    ("4", "0.25"), ("8", "0.5"), ("12", "0.75"), ("15.999", "0.9999"), ("15.999000000000001", "0.9999"),
])
def test_ounces_to_pounds_normalizes_labels(ounces, expected):
    assert ounces_to_pounds(ounces) == expected


def test_parse_ground_advantage_fixture_switches_units_and_skips_non_steps():
    steps, skipped = parse_price_csv(GROUND_ADVANTAGE_FIXTURE)
    labels = [label for label, _ in steps]
    assert labels == ["0.25", "0.5", "0.9999", "1", "70"]
    assert steps[0][1][1] == "5.00" and steps[0][1][9] == "5.55"
    assert steps[-1][1][9] == "165.05"
    assert skipped[0] == "Oversized"
    assert skipped[1].startswith("Parcels exceeding one cubic foot")
    assert skipped[2] == 'Nonstandard Length fee > 30"'
    assert len(skipped) == 3


def test_parse_priority_mail_fixture_ignores_flat_rate_rows():
    steps, skipped = parse_price_csv(PRIORITY_MAIL_FIXTURE)
    assert [label for label, _ in steps] == ["1", "2"]
    assert steps[1][1] == {1: "10.35", 2: "11.00", 3: "11.70", 4: "12.50", 5: "14.50",
                           6: "15.45", 7: "16.40", 8: "18.05", 9: "36.45"}
    assert skipped == []


def test_parse_rejects_missing_price():
    broken = PRIORITY_MAIL_FIXTURE.replace("2,10.35,11.00,11.70,12.50,14.50,15.45,16.40,18.05,36.45",
                                           "2,10.35,11.00,11.70,12.50,14.50,15.45,16.40,18.05,")
    with pytest.raises(ValueError):
        parse_price_csv(broken)
