"""USPS rate-table pipeline.

Usage: uv run python -m data.pipeline.usps

Rewrites every file in data/processed/usps/ and the shared
data/processed/zone_from_distance.csv from the raw files listed in
data/raw/manifest.csv. base_rates.csv is parsed from the Postal Explorer CSV
zips; the other tables come from the hand-transcribed literals in usps_rules.py.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from decimal import ROUND_DOWN, Decimal

from data.pipeline import usps_rules as rules
from data.pipeline.common import (
    RATE_CARDS,
    ZONES,
    money,
    raw_path,
    weight_label,
    write_table,
)

CARRIER = "usps"
ZONE_HEADER = re.compile(r"^\s*zone\s*(\d)\s*$", re.I)
WEIGHT_CELL = re.compile(r"^\d+(\.\d+)?$")
OUNCES_PER_POUND = Decimal(16)
POUND_PRECISION = Decimal("0.0001")


def find_zone_header(rows: list[list[str]]) -> tuple[int, dict[int, int]]:
    """Return (row index, {zone: column index}) of the first row whose cells read 'Zone 1' .. 'Zone 9'.

    The preamble above it (title, flat-rate prices, 'Weight Not Over' line) is irregular,
    so the header is located by content rather than by position."""
    for index, row in enumerate(rows):
        zones = {}
        for column, cell in enumerate(row):
            match = ZONE_HEADER.match(cell)
            if match:
                zones[int(match.group(1))] = column
        if 1 in zones:
            return index, zones
    raise ValueError("no 'Zone 1' header row found")


def ounces_to_pounds(ounces: str) -> str:
    """'4' -> '0.25', '15.999000000000001' -> '0.9999' (truncated to 4 decimals, so the
    float artifact in the CSV cannot leak into the label)."""
    pounds = (Decimal(ounces) / OUNCES_PER_POUND).quantize(POUND_PRECISION, rounding=ROUND_DOWN)
    return weight_label(pounds)


def parse_price_csv(text: str) -> tuple[list[tuple[str, dict[int, str]]], list[str]]:
    """Parse one Postal Explorer price CSV into ([(max_weight_lb, {zone: price})], skipped_labels).

    Weight rows start with a number; the unit is ounces while the table is under a
    'Weight Not Over (ounces)' line and switches to pounds at the 'Weight Not Over
    (pounds)' marker row. Non-numeric first cells (flat-rate rows, 'Oversized',
    footnotes) are skipped and reported."""
    rows = list(csv.reader(io.StringIO(text)))
    header_index, zone_columns = find_zone_header(rows)
    unit = "oz" if any("ounce" in cell.lower() for row in rows[:header_index] for cell in row) else "lb"
    steps: list[tuple[str, dict[int, str]]] = []
    skipped: list[str] = []
    for row in rows[header_index + 1:]:
        first = row[0].strip() if row else ""
        if not first:
            continue
        if "pound" in first.lower() or "(lbs" in first.lower():
            unit = "lb"
            continue
        if not WEIGHT_CELL.match(first):
            skipped.append(first)
            continue
        label = ounces_to_pounds(first) if unit == "oz" else weight_label(Decimal(first))
        prices = {}
        for zone, column in zone_columns.items():
            cell = row[column].strip() if column < len(row) else ""
            if not cell:
                raise ValueError(f"step {first}: empty price for zone {zone}")
            prices[zone] = money(cell)
        steps.append((label, prices))
    if not steps:
        raise ValueError("no weight rows below the zone header")
    return steps, skipped


def read_zip_csv(zip_relative: str, member: str) -> str:
    with zipfile.ZipFile(raw_path(zip_relative)) as archive:
        return archive.read(member).decode("utf-8-sig")


def base_rate_rows() -> list[dict]:
    rows = []
    for year, (zip_relative, effective, _pdf, _end) in rules.YEARS.items():
        for (service, card), member in rules.CSV_NAMES.items():
            steps, _skipped = parse_price_csv(read_zip_csv(zip_relative, member))
            labels = [label for label, _ in steps]
            if len(set(labels)) != len(labels):
                raise ValueError(f"{year} {member}: duplicate weight steps {labels}")
            if labels[-1] != "70":
                raise ValueError(f"{year} {member}: last step is {labels[-1]}, expected 70")
            for label, prices in steps:
                if set(prices) != set(ZONES[CARRIER]):
                    raise ValueError(f"{year} {member}: zones {sorted(prices)}")
                for zone in ZONES[CARRIER]:
                    rows.append({
                        "carrier": CARRIER, "service_id": service, "rate_card": card, "year": year,
                        "effective_date": effective, "zone": zone, "max_weight_lb": label,
                        "price": prices[zone], "source_file": zip_relative, "source_ref": member,
                    })
    return rows


def surcharge_rows() -> list[dict]:
    """USPS has no residential or delivery-area fees, so every rule has address_type 'any'."""
    return [dict(row, address_type="any") for row in _surcharge_rows()]


def characteristic_fee_rows() -> list[dict]:
    _zip, effective, pdf, end = rules.YEARS[2026]
    return [
        {"carrier": CARRIER, "year": 2026, "rate_card": "", "surcharge_id": f"{service}_nonstandard_characteristic_2026",
         "display_name": "Nonstandard Fee, characteristics (tubes or rolls, cans, wooden or metal boxes, liquids in glass)",
         "condition": "additional_handling_packaging", "applies_to": service, "amount": amount, "unit": "usd",
         "exclusive_group": "usps_characteristic", "effective_from": effective, "effective_to": end,
         "fuel_applies": "false", "source_file": pdf, "source_page": page, "source_quote": quote,
         "notes": "New in 2026. Applied when the parcel is flagged nonstandard_packaging. The commercial "
                  "table prints the same footnote, so the rule covers both cards."}
        for service, amount, page, quote in rules.CHARACTERISTIC_FEE_2026
    ]


def _surcharge_rows() -> list[dict]:
    rows = characteristic_fee_rows()
    for year, (_zip, effective, pdf, end) in rules.YEARS.items():
        for service, (fee_22_30, fee_30, fee_volume) in rules.NONSTANDARD[year].items():
            page = rules.RETAIL_PAGE[service]
            common = {
                "carrier": CARRIER, "year": year, "rate_card": "", "applies_to": service, "unit": "usd",
                "effective_from": effective, "effective_to": end, "fuel_applies": "false",
                "source_file": pdf, "source_page": page,
                "notes": f"Notice 123 footnote beside the retail table (p.{page}); the commercial table "
                         f"(p.{rules.COMMERCIAL_PAGE[service]}) prints the same amount, so the rule covers both cards.",
            }
            rows.append(dict(common, surcharge_id=f"{service}_nonstandard_length_22_{year}",
                             display_name="Nonstandard Fee, length over 22 in up to 30 in",
                             condition="nonstandard_length", min_length_in="22", amount=fee_22_30[0],
                             exclusive_group="usps_length", source_quote=fee_22_30[1]))
            rows.append(dict(common, surcharge_id=f"{service}_nonstandard_length_30_{year}",
                             display_name="Nonstandard Fee, length over 30 in",
                             condition="nonstandard_length", min_length_in="30", amount=fee_30[0],
                             exclusive_group="usps_length", source_quote=fee_30[1]))
            rows.append(dict(common, surcharge_id=f"{service}_nonstandard_volume_{year}",
                             display_name="Nonstandard Fee, volume over 2 cu ft",
                             condition="nonstandard_volume", min_volume_cuft="2", amount=fee_volume[0],
                             exclusive_group="usps_volume", source_quote=fee_volume[1],
                             notes=common["notes"] + " A parcel may owe both a length and a volume fee (DMM 133.1.8)."))
    for year, season in rules.PEAK.items():
        for card, services, zone_min, zone_max, w_min, w_max, amount, page, quote in season["rows"]:
            for service in services:
                rows.append({
                    "carrier": CARRIER, "year": year, "rate_card": card,
                    "surcharge_id": f"{service}_peak_{card}_z{zone_min}{zone_max}_w{w_min or 0}_{w_max}_{year}",
                    "display_name": f"Peak season temporary price change {year}",
                    "condition": "peak_base", "applies_to": service,
                    "min_weight_lb": w_min, "max_weight_lb": w_max, "zone_min": zone_min, "zone_max": zone_max,
                    "amount": amount, "unit": "usd", "exclusive_group": "usps_peak",
                    "effective_from": season["effective_from"], "effective_to": season["effective_to"],
                    "fuel_applies": "false", "source_file": season["source_file"], "source_page": page,
                    "source_quote": quote,
                    "notes": "Weight bands are billable weight steps (4-10 lbs = the 4 lb to 10 lb steps). "
                             "Flat-rate, Parcel Select and cubic-tier add-ons from the same release are omitted. "
                             "The release ends the prices at midnight Central on the day the January list starts; effective_to (inclusive) is the day before.",
                })
    rows.append(dict(rules.TRANSPORTATION_2026))
    return rows


def announced_increase_rows() -> list[dict]:
    return [
        {"carrier": CARRIER, "year": year, "product_scope": service, "rate_card": "", "percent": percent,
         "source_type": "primary", "source_file": source, "source_ref": page, "source_quote": quote}
        for year, service, percent, source, page, quote in rules.ANNOUNCED_INCREASE
    ] + [
        {"carrier": CARRIER, "year": year, "product_scope": service, "rate_card": card, "percent": percent,
         "source_type": "primary", "source_file": source, "source_ref": page, "source_quote": quote}
        for year, service, percent, source, page, quote, card in rules.ANNOUNCED_BY_CARD
    ]


def zone_rows() -> list[dict]:
    rows = []
    for zone, lo, hi, quote in rules.USPS_ZONE_BANDS:
        rows.append({"carrier": "usps", "zone": zone, "min_miles": lo, "max_miles": hi,
                     "source_file": rules.ZONE_SOURCE, "source_quote": quote,
                     "notes": rules.USPS_ZONE_NOTES.get(zone, "DMM 608.9.4.2")})
    usps = {zone: (lo, hi, quote) for zone, lo, hi, quote in rules.USPS_ZONE_BANDS}
    for carrier in ("ups", "fedex"):
        for zone in ZONES[carrier]:
            if zone == 2:
                lo, hi, quote = 0, usps[2][1], usps[2][2]
            else:
                lo, hi, quote = usps[zone]
            rows.append({"carrier": carrier, "zone": zone, "min_miles": lo, "max_miles": hi,
                         "source_file": rules.ZONE_SOURCE, "source_quote": quote,
                         "notes": rules.DERIVED_ZONE_NOTE.format(carrier=carrier.upper() if carrier == "ups" else "FedEx")})
    return rows


def exception_rows() -> list[dict]:
    return [dict({"carrier": CARRIER}, **row) for row in rules.EXCEPTIONS]


def main() -> None:
    assert set(rules.CSV_NAMES) == {(s, c) for s in rules.SERVICES for c in RATE_CARDS[CARRIER]}
    written = [
        write_table(CARRIER, "base_rates", base_rate_rows()),
        write_table(CARRIER, "exceptions", exception_rows()),
        write_table(CARRIER, "surcharges", surcharge_rows()),
        write_table(CARRIER, "fuel_surcharge", []),
        write_table(CARRIER, "announced_increase", announced_increase_rows()),
        write_table(CARRIER, "dim_weight", rules.DIM_WEIGHT),
        write_table("shared", "zone_from_distance", zone_rows()),
    ]
    for path in written:
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
