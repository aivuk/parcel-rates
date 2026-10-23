from __future__ import annotations

import csv
import math
from decimal import ROUND_HALF_UP, Decimal

import pytest
from fastapi.testclient import TestClient

from app.engine.tables import RateTables, load_tables
from app.main import DEFAULT_DATA_DIR, create_app

DATA = DEFAULT_DATA_DIR


@pytest.fixture(scope="session")
def tables() -> RateTables:
    return load_tables(DATA)


@pytest.fixture(scope="session")
def client(tables):
    with TestClient(create_app(tables)) as c:
        yield c


# ---- independent CSV helpers for hand computation -------------------------
def read_csv(rel: str) -> list[dict[str, str]]:
    with (DATA / rel).open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def only(rows: list[dict], **where) -> dict:
    hits = [r for r in rows if all(r[k] == v for k, v in where.items())]
    assert len(hits) == 1, f"expected one row for {where}, got {len(hits)}"
    return hits[0]


def zone_from_csv(carrier: str, miles: float) -> int:
    for r in read_csv("zone_from_distance.csv"):
        if r["carrier"] != carrier:
            continue
        hi = float(r["max_miles"]) if r["max_miles"] else math.inf
        if float(r["min_miles"]) <= miles <= hi:
            return int(r["zone"])
    raise AssertionError("no zone")


def cents(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---- synthetic dataset ------------------------------------------------------
SERVICE_COLS = dict(rate_card_notes="", max_weight_lb="70", notes="")


def synthetic_tables(surcharges=(), fuel=None) -> RateTables:
    """Two services, one zone, weights 1-3 lb; amounts chosen by the test."""
    services = [
        dict(carrier="ups", service_id="ups_ground", display_name="UPS Ground", tier="ground",
             residential_allowed="true", business_allowed="true", rate_cards="list", **SERVICE_COLS),
        dict(carrier="usps", service_id="usps_ground_advantage", display_name="USPS Ground Advantage",
             tier="ground", residential_allowed="true", business_allowed="true",
             rate_cards="retail,commercial", **SERVICE_COLS),
    ]
    zones = [
        dict(carrier="ups", zone="2", min_miles="0", max_miles=""),
        dict(carrier="usps", zone="2", min_miles="0", max_miles=""),
    ]
    base = []
    for carrier, sid, card in (("ups", "ups_ground", "list"), ("usps", "usps_ground_advantage", "commercial")):
        for w, price in (("1", "10.00"), ("2", "12.00"), ("3", "14.50")):
            base.append(dict(carrier=carrier, service_id=sid, rate_card=card, year="2030",
                             effective_date="2030-01-01", zone="2", max_weight_lb=w, price=price,
                             source_file=f"{carrier}/x.pdf", source_ref="3"))
    if fuel is None:
        fuel = [dict(carrier="ups", year="2030", service_group="ground", default_percent="12.50",
                     is_proxy="false", window_start="", window_end="", source_file="ups/f.html", source_ref="")]
    dims = [dict(carrier=c, year="2030", effective_from="2030-01-01", effective_to="", divisor="139",
                 min_volume_cuin="0" if c == "ups" else "100000",
                 rounding="round each dimension to the nearest whole inch",
                 source_file="", source_ref="") for c in ("ups", "usps")]
    return RateTables.from_rows(services=services, zones=zones, base_rates=base,
                                surcharges=list(surcharges), dim_weight=dims, fuel=fuel)


def rule(**kw) -> dict:
    base = dict(carrier="ups", year="2030", rate_card="", surcharge_id="s", display_name="S",
                condition="residential", applies_to="all", address_type="any", min_weight_lb="",
                max_weight_lb="", min_length_in="", min_width_in="", min_length_plus_girth_in="",
                min_volume_cuft="", zone_min="", zone_max="", amount="1.00", unit="usd",
                exclusive_group="g", effective_from="2030-01-01", effective_to="", fuel_applies="false",
                source_file="ups/s.pdf", source_page="7")
    base.update(kw)
    return base
