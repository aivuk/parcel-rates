"""FedEx Standard List Rates pipeline.

Usage: uv run python -m data.pipeline.fedex

Rewrites every file in data/processed/fedex/ from the raw files listed in
data/raw/manifest.csv. Parsed table: base_rates.csv (zones 2-8, 1-150 lb).
Curated tables come from data/pipeline/fedex_rules.py; fuel_surcharge.csv is
derived from the archived weekly fuel-surcharge history pages.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from data.pipeline import fedex_rules
from data.pipeline.common import (
    MAX_WEIGHT_LB,
    ZONES,
    html_text,
    money,
    raw_path,
    weight_label,
    with_found_announcements,
    write_table,
)

CARRIER = "fedex"
RATE_CARD = "list"
FULL_WEIGHT_RANGE = range(1, 151)
EXPRESS_SERVICES = {
    "FedEx Priority Overnight": "fedex_priority_overnight",
    "FedEx Standard Overnight": "fedex_standard_overnight",
    "FedEx 2Day": "fedex_2day",
    "FedEx Express Saver": "fedex_express_saver",
}
# Column order of the six service columns on the per-zone PDF pages.
PDF_EXPRESS_COLUMNS = (
    "fedex_first_overnight", "fedex_priority_overnight", "fedex_standard_overnight",
    "fedex_2day_am", "fedex_2day", "fedex_express_saver",
)
GROUND_SERVICES = ("fedex_ground", "fedex_home_delivery")
GROUND_ZONE_LABEL = "US Ground"

SOURCES = {
    2023: "fedex/2023/FedEx_Standard_List_Rates_2023.pdf",
    2024: "fedex/2024/FedEx_Standard_List_Rates_2024.pdf",
    2025: "fedex/2025/FedEx_Standard_List_Rates_2025.xlsx",
    2026: "fedex/2026/FedEx_Standard_List_Rates_2026.xlsx",
    2027: "fedex/2027/FedEx_Standard_List_Rates_2027.xlsx",
}
FUEL_HISTORY = {
    2023: "fedex/2023/historical-fuel-surcharge_page_wayback_2023-01-12.html",
    2024: "fedex/2024/historical-fuel-surcharge_page_wayback_2024-12-02.html",
    2025: "fedex/2025/historical-fuel-surcharge_page_wayback_2025-09-20.html",
    2026: "fedex/2026/historical-fuel-surcharge_page_wayback_2026-10-13.html",
}

MONEY_TOKEN = re.compile(r"^\d{1,3}(,\d{3})*\.\d{2}$")
WEIGHT_TOKEN = re.compile(r"^(\d{1,3})$")
FOOTNOTE_TOKEN = re.compile(r"^\d$")
WEIGHT_LABEL = re.compile(r"^(\d{1,3})\s*lbs?\.?$")
EXPRESS_PAGE = re.compile(r"U\.S\. express package rates: Zone (\d)")
GROUND_PAGE = re.compile(r"FedEx Ground.* and FedEx Home Delivery.* U\.S\. rates: Zones 2.8")
EFFECTIVE_LONG = re.compile(r"Effective ([A-Z][a-z]+ \d{1,2}, \d{4})")
EFFECTIVE_SHORT = re.compile(r"Effective (\d{1,2}/\d{1,2}/\d{4})")
LINE_TOLERANCE_PT = 4.5


class ParseError(RuntimeError):
    """A table did not have the expected shape; nothing is guessed."""


@dataclass(frozen=True)
class Cell:
    service_id: str
    zone: int
    weight: int
    price: str
    source_ref: str


# --------------------------------------------------------------------------- helpers

def clean_title(value) -> str:
    """'FedEx 2Day® ' -> 'FedEx 2Day'."""
    return re.sub(r"[®™]", "", str(value)).strip() if isinstance(value, str) else ""


def parse_weight_label(value) -> int | None:
    """XLSX/PDF weight labels: 1, '1 lb.', '2 lbs.', '12' -> int; anything else -> None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else None
    if isinstance(value, str):
        match = WEIGHT_LABEL.match(value.strip())
        if match:
            return int(match.group(1))
    return None


def tokenize_pdf_row(tokens: list[str], expected_columns: int) -> tuple[int, list[str]] | None:
    """Turn the whitespace tokens of one PDF text line into (weight, prices).

    Returns None for lines that are not weight rows (headers, footnotes, page
    numbers). Raises ParseError when a weight row has the wrong number of
    price columns, so a shifted column can never be silently accepted.
    """
    tokens = [t.lstrip("$") for t in tokens if t != "$"]  # "$ 10.70" or "$107.00"
    if not tokens:
        return None
    first = tokens[0]
    rest = tokens[1:]
    if WEIGHT_TOKEN.match(first):
        weight = int(first)
        if rest and rest[0] in {"lb.", "lbs.", "lb", "lbs"}:
            rest = rest[1:]
        if len(rest) > 1 and FOOTNOTE_TOKEN.match(rest[0]) and MONEY_TOKEN.match(rest[1]):
            rest = rest[1:]  # footnote marker printed after the weight ("150 2  102.64 ...")
    else:
        match = WEIGHT_LABEL.match(first)
        if not match:
            return None
        weight = int(match.group(1))
    prices: list[str] = []
    for token in rest:
        if MONEY_TOKEN.match(token):
            prices.append(token.replace(",", ""))
        else:
            break
    if not prices:
        return None  # a footnote such as "1 From origin to destination ..."
    if weight not in FULL_WEIGHT_RANGE or len(prices) != expected_columns:
        raise ParseError(
            f"row for weight {weight!r} has {len(prices)} price columns, expected {expected_columns}: {' '.join(tokens)}"
        )
    return weight, prices


def pdf_lines(page) -> list[list[str]]:
    """Words of a pdfplumber page grouped into lines by vertical position, left to right."""
    # Rotated side labels ("Shipments in all other packaging / maximum weight in
    # lbs.") share a baseline with the weight rows; only upright words are rows.
    words = [w for w in page.extract_words(keep_blank_chars=False, use_text_flow=False) if w.get("upright", True)]
    # Rows are ~11 pt apart; price glyphs sit up to ~3.5 pt off the weight label's
    # baseline, so cluster on the running mean top with a 4.5 pt tolerance.
    lines: list[list] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(sum(w["top"] for w in lines[-1]) / len(lines[-1]) - word["top"]) <= LINE_TOLERANCE_PT:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [[w["text"] for w in sorted(ws, key=lambda w: w["x0"])] for ws in lines]


def check_complete(cells: list[Cell], year: int) -> None:
    """Every service must have zones 2-8 with weights 1-150, each exactly once."""
    seen: dict[tuple[str, int, int], int] = {}
    for cell in cells:
        key = (cell.service_id, cell.zone, cell.weight)
        seen[key] = seen.get(key, 0) + 1
    duplicates = [k for k, n in seen.items() if n > 1]
    if duplicates:
        raise ParseError(f"{year}: duplicate cells {duplicates[:5]}")
    services = {c.service_id for c in cells}
    expected = set(EXPRESS_SERVICES.values()) | set(GROUND_SERVICES)
    if services != expected:
        raise ParseError(f"{year}: services parsed {sorted(services)} != expected {sorted(expected)}")
    missing = [
        (s, z, w) for s in expected for z in ZONES[CARRIER] for w in range(1, MAX_WEIGHT_LB[CARRIER] + 1)
        if (s, z, w) not in seen
    ]
    if missing:
        raise ParseError(f"{year}: {len(missing)} missing cells, first {missing[:5]}")


# --------------------------------------------------------------------------- XLSX

def xlsx_rows(path: Path, sheet: str) -> list[tuple]:
    import openpyxl

    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet not in book.sheetnames:
        raise ParseError(f"{path.name}: no sheet {sheet!r}; have {book.sheetnames}")
    return [tuple(row) for row in book[sheet].iter_rows(values_only=True)]


def split_express_blocks(rows: list[tuple]) -> dict[str, tuple[list[int], list[tuple]]]:
    """Split a stacked U.S. express sheet into service blocks.

    A block is a title row whose text is one of EXPRESS_SERVICES, immediately
    followed by a `Zones` header row. Returns {service_id: (zone_columns, rows)}
    where zone_columns are the column indexes of zones 2-8 and rows are the
    rows up to the next blank row. Only the first block per service counts
    (the Multiweight section repeats the titles with a `Weight` header).
    """
    blocks: dict[str, tuple[list[int], list[tuple]]] = {}
    for index, row in enumerate(rows[:-1]):
        service = EXPRESS_SERVICES.get(clean_title(row[0]))
        header = rows[index + 1]
        if service is None or service in blocks or not str(header[0] or "").strip().startswith("Zones"):
            continue
        zone_columns = [i for i, v in enumerate(header) if isinstance(v, (int, float)) and int(v) in ZONES[CARRIER]]
        if len(zone_columns) != len(ZONES[CARRIER]):
            raise ParseError(f"block {service}: header has zones at {zone_columns}, expected {len(ZONES[CARRIER])} columns")
        body: list[tuple] = []
        for body_row in rows[index + 2:]:
            if all(v is None for v in body_row):
                break
            body.append(body_row)
        blocks[service] = (zone_columns, body)
    return blocks


def cells_from_block(service: str, zone_columns: list[int], body: list[tuple], ref: str) -> list[Cell]:
    cells: list[Cell] = []
    weights: list[int] = []
    for row in body:
        weight = parse_weight_label(row[0])
        if weight is None:
            continue  # Envelope, Pak and footnote rows
        weights.append(weight)
        if weight > MAX_WEIGHT_LB[CARRIER]:
            continue
        for zone, column in zip(ZONES[CARRIER], zone_columns):
            value = row[column]
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise ParseError(f"{service} {weight} lb zone {zone}: non-numeric price {value!r}")
            cells.append(Cell(service, zone, weight, money(value), ref))
    if weights != list(FULL_WEIGHT_RANGE):
        raise ParseError(f"{service}: weight rows {weights[:3]}..{weights[-3:]} ({len(weights)}) are not 1..150")
    return cells


def parse_xlsx_express(path: Path, sheet: str) -> list[Cell]:
    rows = xlsx_rows(path, sheet)
    blocks = split_express_blocks(rows)
    missing = set(EXPRESS_SERVICES.values()) - set(blocks)
    if missing:
        raise ParseError(f"{sheet}: no block for {sorted(missing)}")
    cells: list[Cell] = []
    for service, (zone_columns, body) in blocks.items():
        cells.extend(cells_from_block(service, zone_columns, body, sheet))
    return cells


def ground_zone_columns(label_row: tuple, zone_row: tuple) -> list[int]:
    """Columns of the Ground sheet that are contiguous-U.S. zones 2-8."""
    columns = [
        i for i, (label, zone) in enumerate(zip(label_row, zone_row))
        if label == GROUND_ZONE_LABEL and isinstance(zone, (int, float)) and int(zone) in ZONES[CARRIER]
    ]
    zones = [int(zone_row[i]) for i in columns]
    if zones != list(ZONES[CARRIER]):
        raise ParseError(f"Ground sheet zones {zones}, expected {list(ZONES[CARRIER])}")
    return columns


def parse_xlsx_ground(path: Path, sheet: str) -> list[Cell]:
    rows = xlsx_rows(path, sheet)
    for index, row in enumerate(rows[:-1]):
        if str(row[0] or "").strip() == "Zones" and GROUND_ZONE_LABEL in row:
            columns = ground_zone_columns(row, rows[index + 1])
            body: list[tuple] = []
            for body_row in rows[index + 2:]:
                if all(v is None for v in body_row):
                    break
                body.append(body_row)
            cells: list[Cell] = []
            for service in GROUND_SERVICES:
                cells.extend(cells_from_block(service, columns, body, sheet))
            return cells
    raise ParseError(f"{sheet}: no 'Zones' / '{GROUND_ZONE_LABEL}' header row")


def xlsx_effective_date(path: Path, sheet: str) -> date:
    for row in xlsx_rows(path, sheet)[:5]:
        match = EFFECTIVE_SHORT.search(str(row[0] or ""))
        if match:
            return datetime.strptime(match.group(1), "%m/%d/%Y").date()
    raise ParseError(f"{sheet}: no 'Effective m/d/yyyy' row")


def parse_xlsx(year: int, relative: str) -> tuple[date, list[Cell]]:
    path = raw_path(relative)
    express_sheet, ground_sheet = f"{year} U.S. rates", f"{year} Ground & FHD rates"
    effective = xlsx_effective_date(path, express_sheet)
    if xlsx_effective_date(path, ground_sheet) != effective:
        raise ParseError(f"{relative}: express and ground sheets have different effective dates")
    return effective, parse_xlsx_express(path, express_sheet) + parse_xlsx_ground(path, ground_sheet)


# --------------------------------------------------------------------------- PDF

def parse_pdf_page(page, page_index: int) -> list[Cell]:
    text = page.extract_text() or ""
    express = EXPRESS_PAGE.search(text)  # heading only present on the per-zone contiguous-U.S. pages
    ground = GROUND_PAGE.search(text)
    if express and ground:
        raise ParseError(f"page {page_index} carries both an express and a ground heading")
    if not express and not ground:
        return []
    cells: list[Cell] = []
    for tokens in pdf_lines(page):
        if express:
            parsed = tokenize_pdf_row(tokens, len(PDF_EXPRESS_COLUMNS))
            if parsed is None:
                continue
            weight, prices = parsed
            zone = int(express.group(1))
            for service, price in zip(PDF_EXPRESS_COLUMNS, prices):
                if service in EXPRESS_SERVICES.values() and weight <= MAX_WEIGHT_LB[CARRIER]:
                    cells.append(Cell(service, zone, weight, money(price), str(page_index)))
        else:
            parsed = tokenize_pdf_row(tokens, len(ZONES[CARRIER]))
            if parsed is None:
                continue
            weight, prices = parsed
            if weight > MAX_WEIGHT_LB[CARRIER]:
                continue
            for zone, price in zip(ZONES[CARRIER], prices):
                for service in GROUND_SERVICES:
                    cells.append(Cell(service, zone, weight, money(price), str(page_index)))
    return cells


def parse_pdf(relative: str) -> tuple[date, list[Cell]]:
    import pdfplumber

    path = raw_path(relative)
    cells: list[Cell] = []
    with pdfplumber.open(path) as pdf:
        cover = pdf.pages[0].extract_text() or ""
        match = EFFECTIVE_LONG.search(cover)
        if not match:
            raise ParseError(f"{relative}: no 'Effective Month d, yyyy' on the cover")
        effective = datetime.strptime(match.group(1), "%B %d, %Y").date()
        for index, page in enumerate(pdf.pages, 1):
            try:
                cells.extend(parse_pdf_page(page, index))
            except ParseError as error:
                raise ParseError(f"{relative} page {index}: {error}") from error
    return effective, cells


# --------------------------------------------------------------------------- tables

def base_rate_rows() -> list[dict]:
    rows: list[dict] = []
    for year, relative in SOURCES.items():
        effective, cells = parse_pdf(relative) if relative.endswith(".pdf") else parse_xlsx(year, relative)
        check_complete(cells, year)
        for cell in sorted(cells, key=lambda c: (c.service_id, c.zone, c.weight)):
            rows.append({
                "carrier": CARRIER, "service_id": cell.service_id, "rate_card": RATE_CARD,
                "year": year, "effective_date": effective.isoformat(), "zone": cell.zone,
                "max_weight_lb": weight_label(cell.weight), "price": cell.price,
                "source_file": relative, "source_ref": cell.source_ref,
            })
    return rows


FUEL_ROW = re.compile(
    r"((?:Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec)\.? \d{1,2}, \d{4})\s*[–-]\s*"
    r"((?:Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec)\.? \d{1,2}, \d{4})"
    r"((?:\s+(?:\d+\.\d+%|\$\d+\.\d+ per lb\.)){4,5})"
)
MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "June": 6, "July": 7,
          "Aug": 8, "Sept": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def parse_fuel_date(text: str) -> date:
    month, day, year = re.match(r"([A-Za-z]+)\.? (\d{1,2}), (\d{4})", text).groups()
    return date(int(year), MONTHS[month], int(day))


def fuel_history_rows(relative: str) -> list[dict]:
    """Weekly rows of an archived historical-fuel-surcharge page.

    Two layouts exist: 2023 (Express package %, express freight $/lb, export %,
    import %, Ground %) and 2024+ (Ground %, package %, freight $/lb, export %,
    import %; 2026 merges export and import into one column). The Ground
    column is identified by position: last in the 2023 layout, first otherwise.
    Matching runs on entity-decoded text (the pages contain `&nbsp;`); each
    quote is cut right after the value used so it is a verbatim substring of
    the raw page too.
    """
    text = re.sub(r"\s+", " ", html.unescape(html_text(raw_path(relative))).replace("\xa0", " "))
    header = text.split("Previous FedEx Freight")[0]
    ground_first = "FedEx Ground, FedEx Home Delivery" in header
    if not ground_first and "FedEx Ground Surcharge" not in header:
        raise ParseError(f"{relative}: unrecognised fuel history table layout")
    rows = []
    for match in FUEL_ROW.finditer(text):
        values = [(m.group(0), m.end()) for m in re.finditer(r"\d+\.\d+%|\$\d+\.\d+ per lb\.", match.group(3))]
        percents = [(v, end) for v, end in values if v.endswith("%")]
        ground, express = (percents[0], percents[1]) if ground_first else (percents[-1], percents[0])
        offset = match.start(3)
        rows.append({
            "start": parse_fuel_date(match.group(1)), "end": parse_fuel_date(match.group(2)),
            "ground": Decimal(ground[0].rstrip("%")), "express": Decimal(express[0].rstrip("%")),
            "quote": {"ground": text[match.start():offset + ground[1]], "express": text[match.start():offset + express[1]]},
        })
    if not rows:
        raise ParseError(f"{relative}: no weekly fuel rows found")
    return rows


def median_row(rows: list[dict], column: str) -> dict:
    """The row holding the lower median of `column` (a value that appears in the table)."""
    ordered = sorted(rows, key=lambda r: (r[column], r["start"]))
    return ordered[(len(ordered) - 1) // 2]


def fuel_surcharge_rows() -> list[dict]:
    out: list[dict] = []
    for year, relative in FUEL_HISTORY.items():
        rows = fuel_history_rows(relative)
        starts, ends = min(r["start"] for r in rows), max(r["end"] for r in rows)
        for group in ("ground", "express"):
            pick = median_row(rows, group)
            values = sorted(r[group] for r in rows)
            out.append({
                "carrier": CARRIER, "year": year, "service_group": group,
                "default_percent": str(pick[group]),
                "basis": "base rate plus surcharges flagged fuel_applies",
                "window_start": starts.isoformat(), "window_end": ends.isoformat(),
                "is_proxy": "false", "source_file": relative, "source_ref": "",
                "source_quote": pick["quote"][group],
                "notes": (
                    f"Lower median of the {len(rows)} weekly {'Ground/Home Delivery' if group == 'ground' else 'domestic package (Express)'} "
                    f"values in this snapshot (range {values[0]}%-{values[-1]}%); the quoted row is the week carrying that value. "
                    f"The snapshot covers only the weeks listed, not the whole year."
                ),
            })
    out.extend(fedex_rules.fuel_proxy_rows(out))
    return out


def main() -> None:
    write_table(CARRIER, "base_rates", base_rate_rows())
    write_table(CARRIER, "exceptions", fedex_rules.EXCEPTIONS)
    write_table(CARRIER, "surcharges", fedex_rules.surcharge_rows())
    write_table(CARRIER, "fuel_surcharge", fuel_surcharge_rows())
    write_table(CARRIER, "announced_increase", with_found_announcements(CARRIER, fedex_rules.ANNOUNCED_INCREASES))
    write_table(CARRIER, "dim_weight", fedex_rules.DIM_WEIGHT)
    print("wrote data/processed/fedex/*.csv")


if __name__ == "__main__":
    main()
