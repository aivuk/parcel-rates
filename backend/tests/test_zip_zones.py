"""Zones from ZIP codes (issue #9): the real USPS chart, and distance between Census ZIP points
for UPS and FedEx (estimated)."""

from __future__ import annotations

import pytest

from app.api import models as m
from app.engine.zip_zones import great_circle_miles


def _msgs(resp):
    return {tuple(e["loc"]): e["msg"] for e in resp.json()["detail"]}


def test_great_circle_miles():
    nyc, la = (40.7506, -73.9971), (34.0522, -118.2437)
    assert great_circle_miles(nyc, nyc) == 0
    assert 2440 <= great_circle_miles(nyc, la) <= 2460


def test_points_fall_back_to_the_zip3_centre(tables):
    z = tables.zip_zones
    exact = z.point("10001")
    assert exact is not None and exact.basis == "zcta"
    assert z.point("10001-1234") == exact
    # 10008 is a PO box ZIP (Church Street Station) without a ZCTA of its own.
    fallback = z.point("10008")
    assert fallback is not None and fallback.basis == "zip3"
    assert z.point("00000") is None
    assert z.point("abc") is None


def test_usps_zone_from_the_chart(tables):
    z = tables.zip_zones
    assert z.usps_zone("10001", "90210") == 8
    assert z.usps_zone("10001", "10002") == 1
    assert z.usps_zone("10001", "00000") is None


def test_quote_from_zips_uses_the_usps_chart_and_estimates_ups_and_fedex(client):
    parcel = {"weight_lb": 2, "residential": True, "speed": "ground", "origin_zip": "10001", "destination_zip": "90210"}
    body = client.post("/api/quote", json={"parcel": parcel}).json()
    m.QuoteResponse.model_validate(body)
    by = {q["carrier"]: q for q in body["quotes"] if q["available"]}
    assert by["usps"]["zone"] == 8 and by["usps"]["zone_source"] == "usps_chart"
    assert by["ups"]["zone"] == 8 and by["ups"]["zone_source"] == "zip_distance"
    assert by["fedex"]["zone_source"] == "zip_distance"
    assert 2400 < body["distance_miles"] < 2500


def test_origin_zip_from_the_controls_and_typed_miles_still_work(client):
    parcel = {"weight_lb": 2, "residential": True, "speed": "ground", "destination_zip": "10002"}
    body = client.post("/api/quote", json={"parcel": parcel, "controls": {"origin_zip": "10001"}}).json()
    usps = next(q for q in body["quotes"] if q["carrier"] == "usps" and q["available"])
    assert usps["zone"] == 1 and usps["zone_source"] == "usps_chart"

    typed = {"weight_lb": 2, "residential": True, "speed": "ground", "distance_miles": 300}
    body = client.post("/api/quote", json={"parcel": typed}).json()
    assert {q["zone_source"] for q in body["quotes"] if q["available"]} == {"distance"}
    assert body["distance_miles"] == 300


@pytest.mark.parametrize(
    ("parcel", "controls", "loc", "fragment"),
    [
        ({"weight_lb": 2, "residential": True, "speed": "ground"}, {}, ("body", "parcel"), "distance_miles or destination_zip"),
        ({"weight_lb": 2, "residential": True, "speed": "ground", "destination_zip": "90210"}, {},
         ("body", "parcel", "origin_zip"), "origin"),
        ({"weight_lb": 2, "residential": True, "speed": "ground", "destination_zip": "00000", "origin_zip": "10001"}, {},
         ("body", "parcel", "destination_zip"), "00000"),
        ({"weight_lb": 2, "residential": True, "speed": "ground", "destination_zip": "9021"}, {},
         ("body", "parcel", "destination_zip"), "5-digit"),
    ],
)
def test_zip_errors_name_the_field(client, parcel, controls, loc, fragment):
    msgs = _msgs(client.post("/api/quote", json={"parcel": parcel, "controls": controls}))
    assert loc in msgs, msgs
    assert fragment in msgs[loc]


def test_blended_with_zips(client):
    parcels = [
        {"weight_lb": 1, "residential": True, "speed": "ground", "destination_zip": "90210", "quantity": 2},
        {"weight_lb": 3, "residential": False, "speed": "ground", "distance_miles": 120},
    ]
    body = client.post("/api/blended", json={"parcels": parcels, "controls": {"origin_zip": "10001"}}).json()
    m.BlendedResponse.model_validate(body)
    assert body["parcels_considered"] == 3
    msgs = _msgs(client.post("/api/blended", json={"parcels": parcels[:1]}))
    assert ("body", "parcels", 0, "origin_zip") in msgs


def test_meta_reports_the_zip_data(client):
    z = client.get("/api/meta").json()["zip_zones"]
    assert z["usps_origins"] >= 1 and z["zip_points"] > 30000 and z["usps_effective_date"]
