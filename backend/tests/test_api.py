"""API contract tests (docs/API.md)."""

from __future__ import annotations

import json

import pytest

from app.api import models as m
from app.engine import segments as seg
from app.main import REPO_ROOT, load_sample_parcels

PARCEL = {"weight_lb": 2, "distance_miles": 300, "residential": True, "speed": "ground"}


def _msgs(resp):
    assert resp.status_code == 422, resp.text
    return {tuple(d["loc"]): d["msg"] for d in resp.json()["detail"]}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta(client, tables):
    body = client.get("/api/meta").json()
    m.MetaResponse.model_validate(body)
    assert body["years"]["fedex"] == tables.years_for("fedex")
    assert body["defaults"]["year"] == 2026
    assert set(body["defaults"]["as_of"]) == {"usps", "ups", "fedex"}
    assert any(s["rate_card_notes"] for s in body["services"])
    assert any(f["is_proxy"] for f in body["fuel_defaults"] if f["carrier"] == "ups")
    assert body["segments"]["weight_bands"] == list(m.WeightBand.__args__)
    assert body["segments"]["zone_bands"] == list(m.ZoneBand.__args__)
    assert len(body["limitations"]) >= 6


def test_sample_parcels(client):
    body = client.get("/api/sample-parcels").json()
    assert "illustrative" in body["description"].lower()
    assert 150 <= len(body["parcels"]) <= 250
    residential = sum(p["residential"] for p in body["parcels"]) / len(body["parcels"])
    ground = sum(p["speed"] == "ground" for p in body["parcels"]) / len(body["parcels"])
    assert 0.6 < residential < 0.9 and 0.75 < ground < 0.95


def test_quote(client):
    r = client.post("/api/quote", json={"parcel": {**PARCEL, "speed": "two_three_day"}})
    assert r.status_code == 200
    body = r.json()
    m.QuoteResponse.model_validate(body)
    tiers = [q["tier"] for q in body["quotes"]]
    first_other = next(i for i, t in enumerate(tiers) if t != "two_three_day")
    assert all(t == "two_three_day" for t in tiers[:first_other])
    requested = [q["total"] for q in body["quotes"][:first_other] if q["available"]]
    assert requested == sorted(requested)
    for q in body["quotes"]:
        if q["available"]:
            assert abs(sum(li["amount"] for li in q["line_items"]) - q["total"]) < 1e-9
            assert abs(q["margin"] - (9.99 - q["total"])) < 1e-9
    cheapest = body["cheapest_by_tier"]["ground"]
    ground = [q for q in body["quotes"] if q["tier"] == "ground" and q["available"]]
    assert cheapest["total"] == min(q["total"] for q in ground)


def test_quote_controls(client):
    base = {"parcel": PARCEL, "controls": {"year": 2025, "usps_rate_card": "retail", "peak": True,
                                            "fuel_override_percent": {"ground": 10}, "flat_price": 5}}
    body = client.post("/api/quote", json=base).json()
    ups = next(q for q in body["quotes"] if q["service_id"] == "ups_ground")
    assert ups["line_items"][-1]["label"].startswith("Fuel Surcharge (10")
    assert ups["as_of"] == "2025-12-10"
    only_fedex = client.post("/api/quote", json={"parcel": PARCEL, "controls": {"year": 2027}}).json()
    assert {q["carrier"] for q in only_fedex["quotes"]} == {"fedex"}


@pytest.mark.parametrize(
    "parcel, loc, msg",
    [
        ({**PARCEL, "weight_lb": 80}, ("body", "parcel", "weight_lb"), "weight_lb must be at most 70"),
        ({**PARCEL, "weight_lb": 0}, ("body", "parcel", "weight_lb"), "weight_lb must be greater than 0"),
        ({**PARCEL, "distance_miles": -5}, ("body", "parcel", "distance_miles"), "distance_miles must be at least 0"),
        ({**PARCEL, "speed": "overnight"}, ("body", "parcel", "speed"),
         "speed must be one of 'ground', 'two_three_day' or 'next_day'"),
        ({**PARCEL, "residential": "maybe"}, ("body", "parcel", "residential"), "residential must be true or false"),
        ({**PARCEL, "quantity": 1.5}, ("body", "parcel", "quantity"), "quantity must be a whole number"),
        ({**PARCEL, "length_in": 10}, ("body", "parcel"),
         "give length_in, width_in and height_in together, or none of them"),
        ({k: v for k, v in PARCEL.items() if k != "speed"}, ("body", "parcel", "speed"), "speed is required"),
    ],
)
def test_quote_422_messages(client, parcel, loc, msg):
    assert _msgs(client.post("/api/quote", json={"parcel": parcel}))[loc] == msg


def test_quote_422_unknown_year_and_bad_date(client):
    msgs = _msgs(client.post("/api/quote", json={"parcel": PARCEL, "controls": {"year": 2019}}))
    assert msgs[("body", "controls", "year")].startswith("year must be one of 2023")
    msgs = _msgs(client.post("/api/quote", json={"parcel": PARCEL, "controls": {"as_of": "soon"}}))
    assert "must be a date" in msgs[("body", "controls", "as_of")]
    msgs = _msgs(client.post("/api/quote", content="{not json", headers={"content-type": "application/json"}))
    assert "not valid JSON" in next(iter(msgs.values()))


def test_breakeven(client):
    body = client.post("/api/breakeven", json={"residential": False, "weights_lb": [1, 5, 40],
                                               "distances_miles": [25, 2000]}).json()
    m.BreakevenResponse.model_validate(body)
    assert len(body["cells"]) == 6 and len(body["breakeven_weight_lb"]) == 2
    default = client.get("/api/breakeven?residential=true").json()
    assert len(default["cells"]) == 70 * 8
    msgs = _msgs(client.post("/api/breakeven", json={"weights_lb": [0, 80]}))
    assert "at most 70" in msgs[("body",)]
    msgs = _msgs(client.post("/api/breakeven", json={"distances_miles": [-1]}))
    assert "negative" in msgs[("body",)]
    assert client.get("/api/breakeven?year=1999").status_code == 422


def test_blended(client):
    parcels = load_sample_parcels()
    body = client.post("/api/blended", json={"parcels": parcels, "segment": {"weight_band": "1–5"}}).json()
    m.BlendedResponse.model_validate(body)
    assert {c["carrier"] for c in body["carriers"]} == {"usps", "ups", "fedex"}
    msgs = _msgs(client.post("/api/blended", json={"parcels": []}))
    assert msgs[("body", "parcels")] == "parcels needs at least 1 item(s)"
    msgs = _msgs(client.post("/api/blended", json={"parcels": [{**PARCEL, "weight_lb": 90}]}))
    assert msgs[("body", "parcels", 0, "weight_lb")] == "Parcel 1: weight_lb must be at most 70"
    msgs = _msgs(client.post("/api/blended", json={"parcels": [PARCEL], "segment": {"zone_band": "9"}}))
    assert "must be one of" in msgs[("body", "segment", "zone_band")]


def test_blended_free_shipping_rule(client):
    parcels = [{**PARCEL, "order_value": 100, "quantity": 2}, {**PARCEL, "order_value": 10}]
    body = client.post("/api/blended", json={"parcels": parcels,
                                             "controls": {"flat_price": 9, "free_shipping_over": 50}}).json()
    m.BlendedResponse.model_validate(body)
    assert body["free_shipping"] == {"threshold": 50, "parcels": 2}
    assert body["revenue_per_parcel"] == 3
    msgs = _msgs(client.post("/api/blended", json={"parcels": [{**PARCEL, "order_value": -1}]}))
    assert ("body", "parcels", 0, "order_value") in msgs
    msgs = _msgs(client.post("/api/blended", json={"parcels": [PARCEL], "controls": {"free_shipping_over": -5}}))
    assert ("body", "controls", "free_shipping_over") in msgs


def test_yearly(client):
    body = client.post("/api/yearly", json={"parcels": load_sample_parcels()[:30],
                                            "next_year_increase_percent": 5}).json()
    m.YearlyResponse.model_validate(body)
    assert all(c["projected"]["increase_percent"] == 5 for c in body["carriers"])
    assert all(c["projected"]["basis"] == "assumed" for c in body["carriers"])  # nothing announced yet
    body = client.post("/api/yearly", json={"parcels": load_sample_parcels()[:30], "next_year_increase_percent": 2,
                                            "next_year_override": True}).json()
    assert {c["projected"]["basis"] for c in body["carriers"]} == {"override"}
    msgs = _msgs(client.post("/api/yearly", json={"parcels": [PARCEL], "next_year_increase_percent": 500}))
    assert msgs[("body", "next_year_increase_percent")] == "next_year_increase_percent must be at most 100"


def test_cors_allows_vite_dev_server(client):
    r = client.options("/api/quote", headers={"Origin": "http://localhost:5173",
                                              "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_segment_labels_match_contract():
    assert [b[0] for b in seg.WEIGHT_BANDS] == list(m.WeightBand.__args__)
    assert [b[0] for b in seg.ZONE_BANDS] == list(m.ZoneBand.__args__)


def test_export_api_examples(tmp_path):
    from scripts.export_api_examples import export

    written = export(tmp_path)
    names = {p.stem for p in written}
    assert {"health", "meta", "sample-parcels", "quote", "breakeven", "blended", "yearly"} <= names
    models = {"meta": m.MetaResponse, "quote": m.QuoteResponse, "breakeven": m.BreakevenResponse,
              "blended": m.BlendedResponse, "yearly": m.YearlyResponse, "sample-parcels": m.SampleParcelsResponse}
    for name, model in models.items():
        model.model_validate(json.loads((tmp_path / f"{name}.json").read_text())["response"]["body"])


def test_committed_examples_match_the_models():
    folder = REPO_ROOT / "docs" / "api-examples"
    if not folder.exists():
        pytest.skip("docs/api-examples not generated yet")
    for path in folder.glob("*.json"):
        doc = json.loads(path.read_text())
        assert {"request", "response"} <= set(doc)


# ---- interactive docs (issue #33) ------------------------------------------
def test_openapi_schema_under_api(client):
    resp = client.get("/api/openapi.json")
    assert resp.status_code == 200
    assert "/api/quote" in resp.json()["paths"]


def test_docs_page_pins_swagger_with_sri_and_no_inline_script(client):
    from app.api import docs

    resp = client.get("/api/docs")
    assert resp.status_code == 200
    html = resp.text
    assert f'integrity="{docs.SWAGGER_JS_SRI}"' in html
    assert f'integrity="{docs.SWAGGER_CSS_SRI}"' in html
    assert "<script>" not in html  # inline scripts are blocked by the nginx CSP
    init = client.get("/api/docs/init.js")
    assert init.headers["content-type"].startswith("text/javascript")
    assert '"/api/openapi.json"' in init.text
    assert client.get("/docs").status_code == 404


def test_quote_example_matches_docs_and_is_accepted(client):
    from app.api import docs

    recorded = json.loads((REPO_ROOT / "docs/api-examples/quote.json").read_text())
    assert docs.QUOTE_EXAMPLE == recorded["request"]["body"]
    schema = client.get("/api/openapi.json").json()
    body = schema["paths"]["/api/quote"]["post"]["requestBody"]["content"]["application/json"]
    assert docs.QUOTE_EXAMPLE in body["schema"].get("examples", [])
    assert client.post("/api/quote", json=docs.QUOTE_EXAMPLE).status_code == 200
