"""Unit tests for the UPS rate-table parser: line grouping, row tokenizing,
zone-column validation, and a small synthetic page fixture. A final test
parses one real page when the 2026 guide is on disk."""
from __future__ import annotations

import pytest

from data.pipeline import ups
from data.pipeline.common import raw_path
from data.tests.raw import missing_raw


def word(text: str, x: float, top: float, width: float = 24.0) -> dict:
    return {"text": text, "x0": x - width / 2, "x1": x + width / 2, "top": top}


HEADER_X = [133, 180, 227, 273, 320, 366, 413, 455, 502, 548]
HEADER_CODES = ["2", "3", "4", "5", "6", "7", "8", "44**", "45**", "46**"]


def header_line(top: float = 186) -> list[dict]:
    return [word("Zones", 57, top)] + [word(code, x, top) for code, x in zip(HEADER_CODES, HEADER_X)]


def price_row(weight: int, prices: list[str], top: float, xs: list[float] = HEADER_X, lb: bool = False) -> list[dict]:
    words = [word(str(weight), 51, top)]
    if lb:
        words.append(word("Lb.", 60, top))
    words += [word(price, x, top) for price, x in zip(prices, xs)]
    return words


ROW1 = ["$11.99", "$12.38", "$13.51", "$14.10", "$14.60", "$14.83", "$15.03", "$43.25", "$44.17", "$56.96"]
ROW2 = ["12.85", "14.15", "15.46", "15.79", "16.49", "17.18", "17.40", "48.12", "49.48", "61.80"]


def fixture_page() -> list[dict]:
    words = header_line()
    words += [word("Letter**", 57, 192)] + [word("$30.56", x, 192) for x in HEADER_X]
    words += price_row(1, ROW1, 198, lb=True)
    words += price_row(2, ROW2, 210)
    words += [word("*Visit", 40, 400), word("ups.com/holidays", 80, 400)]
    return words


def test_group_lines_clusters_by_top_and_sorts_left_to_right():
    words = [word("b", 100, 10.5), word("a", 50, 10.0), word("c", 50, 22.0)]
    lines = ups.group_lines(words)
    assert [[w["text"] for w in line] for line in lines] == [["a", "b"], ["c"]]


def test_parse_header_reads_zone_codes_and_centers():
    header = ups.parse_header(header_line())
    assert header.codes == HEADER_CODES
    assert header.centers == pytest.approx(HEADER_X)
    assert ups.parse_header(price_row(3, ROW2, 50)) is None


def test_zone_columns_separates_ak_hi_codes():
    header = ups.parse_header(header_line())
    zones, excluded = header.zone_columns(ups.SERVICES["ups_ground"][1])
    assert zones == {0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8}
    assert excluded == ["44**", "45**", "46**"]


def test_zone_columns_maps_three_digit_air_codes():
    codes = ["102", "103", "104", "105", "106", "107", "108", "124*"]
    header = ups.Header(codes, [float(i) for i in range(len(codes))])
    zones, excluded = header.zone_columns(ups.SERVICES["ups_next_day_air"][1])
    assert list(zones.values()) == [2, 3, 4, 5, 6, 7, 8]
    assert excluded == ["124*"]


def test_zone_columns_rejects_unknown_code():
    header = ups.Header(["2", "3", "4", "5", "6", "7", "9"], [0.0] * 7)
    with pytest.raises(ups.ParseError):
        header.zone_columns(ups.SERVICES["ups_ground"][1])


def test_tokenize_row_drops_lb_token_and_skips_letter_rows():
    weight, prices = ups.tokenize_row(price_row(1, ROW1, 198, lb=True))
    assert weight == 1
    assert [w["text"] for w in prices] == ROW1
    assert ups.tokenize_row([word("Letter**", 57, 192), word("$30.56", 133, 192)]) is None


def test_tokenize_row_rejects_non_price_tokens():
    with pytest.raises(ups.ParseError):
        ups.tokenize_row(price_row(5, ["12.85", "n/a", "15.46"], 50, xs=HEADER_X[:3]))


def test_assign_columns_requires_one_price_per_column():
    header = ups.parse_header(header_line())
    with pytest.raises(ups.ParseError, match="9 prices for 10"):
        ups.assign_columns(price_row(2, ROW2[:9], 210, xs=HEADER_X[:9])[1:], header)


def test_assign_columns_rejects_misaligned_price():
    header = ups.parse_header(header_line())
    shifted = [x + 30 for x in HEADER_X]
    with pytest.raises(ups.ParseError, match="not under column"):
        ups.assign_columns(price_row(2, ROW2, 210, xs=shifted)[1:], header)


def test_assign_columns_normalizes_money():
    header = ups.parse_header(header_line())
    prices = ups.assign_columns(price_row(1, ROW1, 198)[1:], header)
    assert prices[0] == "11.99" and prices[-1] == "56.96"


def test_parse_rate_page_fixture():
    table = ups.parse_rate_page(fixture_page(), page=91)
    assert table.page == 91
    assert set(table.rows) == {1, 2}
    assert table.rows[1][:7] == ["11.99", "12.38", "13.51", "14.10", "14.60", "14.83", "15.03"]
    assert table.rows[2][6] == "17.40"


def test_parse_rate_page_rejects_duplicate_weight():
    words = fixture_page() + price_row(2, ROW2, 222)
    with pytest.raises(ups.ParseError, match="appears twice"):
        ups.parse_rate_page(words, page=1)


def test_service_on_page_needs_heading_and_domestic_subheading():
    assert ups.service_on_page(["UPS® Ground*", "U.S. 48 – Domestic", "PACKAGE"]) == "ups_ground"
    assert ups.service_on_page(["Domestic", "UPS Next Day Air®", "Guaranteed"]) == "ups_next_day_air"
    assert ups.service_on_page(["UPS® Ground*", "Alaska – Domestic"]) is None
    assert ups.service_on_page(["UPS Next Day Air® Early", "U.S. 48 – Domestic"]) is None
    assert ups.service_on_page(["UPS 2nd Day Air A.M.®*", "U.S. 48 – Domestic"]) is None
    assert ups.service_on_page(["UPS 3 Day Select® from Canada", "Domestic"]) is None


def test_fuel_rows_parse_and_lower_median():
    text = ("Effective date ... Export Import Nov. 18, 2024-Nov. 24, 2024 16.00% 16.00% $0.452 per lb. 22.50% 26.25% "
            "Nov. 11, 2024-Nov. 17, 2024 16.00% 15.75% $0.448 per lb. 22.00% 25.75% "
            "Nov. 4, 2024-Nov. 10, 2024 16.25% 16.00% $0.452 per lb. 22.25% 26.00% previous fedex freight ...")
    rows = ups.parse_fuel_rows(text)
    assert [r.start.isoformat() for r in rows] == ["2024-11-18", "2024-11-11", "2024-11-04"]
    assert rows[0].percents == ["16.00%", "16.00%", "22.50%", "26.25%"]
    from decimal import Decimal
    assert ups.lower_median([Decimal("16.25"), Decimal("16.00"), Decimal("16.00"), Decimal("16.50")]) == Decimal("16.00")


def test_real_2026_ground_page():
    pdfplumber = pytest.importorskip("pdfplumber")
    try:
        path = raw_path(ups.rules.GUIDES[2026]["file"])
    except FileNotFoundError as error:
        missing_raw(error)
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[90]
        assert ups.service_on_page(page.extract_text().splitlines()) == "ups_ground"
        table = ups.parse_rate_page(page.extract_words(x_tolerance=1.5), page=91)
    zones, excluded = table.header.zone_columns(ups.SERVICES["ups_ground"][1])
    assert table.rows[1][0] == "11.99"
    assert excluded == ["44**", "45**", "46**"]
    assert min(table.rows) == 1 and max(table.rows) == 35
