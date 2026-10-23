"""ZIP data for zones (issue #9): the collectors' rules on small inline inputs, and the shape of
the processed tables they write."""
from __future__ import annotations

import csv

from data.collect import usps_zones, zip_points
from data.pipeline.common import processed_path

CHART = {
    "ZIPCodeError": "",
    "EffectiveDate": "October 1, 2026",
    "Column0": [
        {"ZipCodes": "005", "Zone": "1*", "MailService": ""},
        {"ZipCodes": "006---009", "Zone": "7", "MailService": ""},
        {"ZipCodes": "010---013", "Zone": "2+", "MailService": ""},
    ],
    "Column1": [{"ZipCodes": "96700", "Zone": "8", "MailService": ""}],
    "Zip5Digit": [{"ZipCodes": "09000---09999", "Zone": "5", "MailService": "Priority Mail service"}],
}


def test_zone_string_drops_markers_and_five_digit_entries():
    zones = usps_zones.zone_string(CHART)
    assert len(zones) == 1000
    assert zones[5] == "1" and zones[6:10] == "7777" and zones[10:14] == "2222"
    assert zones[967] == "0" and zones[0] == "0"
    assert usps_zones.origins_from(CHART) == ["005", "006", "007", "008", "009", "010", "011", "012", "013"]


def test_military_origins_have_no_chart():
    assert usps_zones.has_chart(CHART)
    apo = {"ZIPCodeError": "", "PageError": 'Please use the "Get Zone for ZIP Code Pair" tab for all inbound APO/FPO/DPO.',
           "Column0": [{"ZipCodes": "005", "Zone": "8", "MailService": ""}]}
    assert not usps_zones.has_chart(apo)


def test_zip3_centre_is_land_weighted():
    rows = [
        {"zip5": "10001", "lat": 40.0, "lon": -74.0, "aland": 3.0},
        {"zip5": "10002", "lat": 42.0, "lon": -72.0, "aland": 1.0},
    ]
    out = {r["zip"]: r for r in zip_points.points(rows)}
    assert out["10001"]["kind"] == "zcta"
    assert (out["100"]["kind"], out["100"]["lat"], out["100"]["lon"]) == ("zip3", "40.500000", "-73.500000")


def test_processed_zone_chart_and_points_agree():
    with processed_path("usps", "zone_chart").open(newline="", encoding="utf-8") as handle:
        chart = list(csv.DictReader(handle))
    with processed_path("shared", "zip_points").open(newline="", encoding="utf-8") as handle:
        points = list(csv.DictReader(handle))
    assert chart, "no USPS zone chart rows"
    for row in chart:
        assert len(row["zones"]) == 1000 and set(row["zones"]) <= set("0123456789"), row["origin_zip3"]
        assert row["effective_date"]
    centres = {r["zip"] for r in points if r["kind"] == "zip3"}
    contiguous = [r["origin_zip3"] for r in chart if r["origin_zip3"] in centres]
    assert len(contiguous) >= 0.9 * len(chart)  # most chart origins have a Census centre
    assert sum(1 for r in points if r["kind"] == "zcta") > 30_000
