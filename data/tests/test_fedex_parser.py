"""Unit tests for the FedEx parser: XLSX block splitting on a tiny generated
workbook, PDF row tokenizing with fixtures, and the fuel median pick."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import openpyxl
import pytest

from data.pipeline import fedex
from data.pipeline.fedex import ParseError, median_row, parse_xlsx_express, parse_xlsx_ground, tokenize_pdf_row

ZONE_HEADER = ["Zones", 2, 3, 4, 5, 6, 7, 8, "9–10", "11–12", "13–16"]


def price_row(label, base):
    return [label] + [round(base + zone, 2) for zone in range(2, 9)] + [1.0, 2.0, 3.0]


def express_block(title, base, weights=150):
    rows = [[title], ZONE_HEADER, ["FedEx® Envelope\nup to 8 oz.", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            ["FedEx® Pak ", "*", "*", "*", "*", "*", "*", "*", "*", "*", "*"], price_row("1 lb.", base), price_row("2 lbs.", base + 1)]
    rows += [price_row(w, base + w - 1) for w in range(3, weights + 1)]
    return rows + [[None], ["*Based on the package weight, the corresponding rate applies."], [None]]


def write_book(tmp_path, express_rows, ground_rows=None):
    book = openpyxl.Workbook()
    ws = book.active
    ws.title = "2025 U.S. rates"
    for row in [["2025 FedEx® Standard List Rates: U.S. package rates"], ["Effective 1/6/2025"], [None]] + express_rows:
        ws.append(row)
    ws2 = book.create_sheet("2025 Ground & FHD rates")
    for row in [["title"], ["Effective 1/6/2025"], [None]] + (ground_rows or []):
        ws2.append(row)
    path = tmp_path / "rates.xlsx"
    book.save(path)
    return path


def test_split_express_blocks_takes_rate_blocks_not_multiweight(tmp_path):
    rows = []
    for title, base in [("FedEx First Overnight®", 100.0), ("FedEx Priority Overnight®", 30.0), ("FedEx Standard Overnight®", 20.0),
                        ("FedEx 2Day® A.M.", 15.0), ("FedEx 2Day®", 10.0), ("FedEx Express Saver®", 5.0)]:
        rows += express_block(title, base)
    rows += [["FedEx Express Multiweight®"], ["Multiply by total shipment weight."], [None], ["FedEx Priority Overnight® "],
             ["Weight", 2, 3, 4, 5, 6, 7, 8], ["100–499 lbs.", 9, 9, 9, 9, 9, 9, 9], [None]]
    cells = parse_xlsx_express(write_book(tmp_path, rows), "2025 U.S. rates")
    assert {c.service_id for c in cells} == set(fedex.EXPRESS_SERVICES.values())
    assert len(cells) == 4 * 7 * 150  # 1-150 lb, Multiweight rows ignored
    by_key = {(c.service_id, c.zone, c.weight): c.price for c in cells}
    assert by_key[("fedex_priority_overnight", 2, 1)] == "32.00"
    assert by_key[("fedex_2day", 8, 70)] == "87.00"
    assert ("fedex_priority_overnight", 2, 150) in by_key
    assert ("fedex_priority_overnight", 2, 151) not in by_key


def test_short_block_is_an_error(tmp_path):
    rows = express_block("FedEx Priority Overnight®", 30.0, weights=149)
    for title in ("FedEx Standard Overnight®", "FedEx 2Day®", "FedEx Express Saver®"):
        rows += express_block(title, 1.0)
    with pytest.raises(ParseError, match="not 1..150"):
        parse_xlsx_express(write_book(tmp_path, rows), "2025 U.S. rates")


def test_missing_service_block_is_an_error(tmp_path):
    rows = express_block("FedEx Priority Overnight®", 30.0)
    with pytest.raises(ParseError, match="no block for"):
        parse_xlsx_express(write_book(tmp_path, rows), "2025 U.S. rates")


def test_ground_sheet_uses_only_us_ground_columns(tmp_path):
    labels = ["Zones"] + ["US Ground"] * 7 + ["To Hawaii", "Intra-Oahu"]
    zones = [None, 2, 3, 4, 5, 6, 7, 8, 9, 14]
    body = [["1 lb."] + [10 + z for z in range(2, 9)] + [40, 9], ["2 lbs."] + [11 + z for z in range(2, 9)] + [45, 9]]
    body += [[w] + [10 + w + z for z in range(2, 9)] + [50, 9] for w in range(3, 151)]
    path = write_book(tmp_path, express_block("FedEx 2Day®", 1.0), [["FedEx Ground® and FedEx Home Delivery®"], labels, zones] + body + [[None]])
    cells = parse_xlsx_ground(path, "2025 Ground & FHD rates")
    assert {c.service_id for c in cells} == {"fedex_ground", "fedex_home_delivery"}
    assert len(cells) == 2 * 7 * 150
    assert max(c.zone for c in cells) == 8
    assert {c.price for c in cells if c.weight == 70 and c.zone == 8} == {"88.00"}


@pytest.mark.parametrize("tokens,expected", [
    (["1", "lb.", "$", "68.04", "$", "37.04", "$", "33.87", "$", "25.37", "$", "22.59", "$", "21.03"],
     (1, ["68.04", "37.04", "33.87", "25.37", "22.59", "21.03"])),
    (["2", "lbs.", "68.53", "37.53", "36.13", "25.82", "23.51", "21.42"], (2, ["68.53", "37.53", "36.13", "25.82", "23.51", "21.42"])),
    (["101lbs.", "310.07", "278.76", "272.70", "229.27", "182.81", "$171.70"], (101, ["310.07", "278.76", "272.70", "229.27", "182.81", "171.70"])),
    (["149", "457.43", "411.24", "402.30", "338.23", "269.69", "253.30", "4", "By", "12", "p.m."],
     (149, ["457.43", "411.24", "402.30", "338.23", "269.69", "253.30"])),
    (["150", "1,460.50", "414.00", "405.00", "340.50", "271.50", "255.00"], (150, ["1460.50", "414.00", "405.00", "340.50", "271.50", "255.00"])),
])
def test_tokenize_pdf_row(tokens, expected):
    assert tokenize_pdf_row(tokens, 6) == expected


def test_tokenize_pdf_row_skips_footnote_marker_after_weight():
    # 2023/2024 Ground pages print "150 2" (footnote 2) before the prices.
    tokens = ["150", "2", "102.64", "105.44", "112.20", "115.20", "125.61", "135.43", "152.56", "Any", "fraction"]
    assert tokenize_pdf_row(tokens, 7) == (150, ["102.64", "105.44", "112.20", "115.20", "125.61", "135.43", "152.56"])


@pytest.mark.parametrize("tokens", [
    ["1", "From", "origin", "to", "destination"],       # footnote starting with a digit
    ["Envelope", "up", "to", "8", "oz."],
    ["FedEx®", "Pak", "*", "*"],
    ["3"],                                               # page number
    [],
])
def test_tokenize_pdf_row_ignores_non_rows(tokens):
    assert tokenize_pdf_row(tokens, 6) is None


def test_tokenize_pdf_row_rejects_wrong_column_count():
    with pytest.raises(ParseError, match="5 price columns, expected 6"):
        tokenize_pdf_row(["12", "95.00", "64.00", "56.92", "39.39", "34.81"], 6)
    with pytest.raises(ParseError, match="expected 7"):
        tokenize_pdf_row(["12", "95.00", "64.00", "56.92", "39.39", "34.81", "1.00", "2.00", "3.00"], 7)


def test_median_row_picks_lower_median_that_appears_in_table():
    rows = [{"start": date(2024, 1, d), "ground": Decimal(v)} for d, v in enumerate(["16.25", "16.00", "15.75", "16.25"], 1)]
    assert median_row(rows, "ground")["ground"] == Decimal("16.00")
    rows.append({"start": date(2024, 1, 5), "ground": Decimal("17.00")})
    assert median_row(rows, "ground")["ground"] == Decimal("16.25")
