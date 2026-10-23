"""UPS Daily Rates pipeline.

Usage: uv run python -m data.pipeline.ups

Rewrites every file in data/processed/ups/ from the raw files listed in the
manifest: base_rates.csv is parsed from the rate-table pages of the guides with
pdfplumber word positions; the curated tables are expanded from the literals in
data/pipeline/ups_rules.py; fuel_surcharge.csv holds proxies computed from the
FedEx historical pages. Any rate row whose columns do not line up with the
table header is an error, never a guess.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from data.pipeline import ups_rules as rules
from data.pipeline.common import (
    MAX_WEIGHT_LB, ZONES, html_text, min_billable_lb, money, raw_path, weight_label, write_table,
)

PRICE = re.compile(r"^\$?\d{1,3}(?:,\d{3})*\.\d{2}$")
WEIGHT = re.compile(r"^\d{1,3}$")
LB_TOKENS = {"Lb.", "Lbs."}
SUBHEADINGS = {"Domestic", "U.S. 48 – Domestic"}
MAX_TABLE_WEIGHT = 150
COLUMN_TOLERANCE = 18.0  # points; zone columns are ~47 points apart
ROW_TOLERANCE = 3.0
MARGIN_TOLERANCE = 30.0  # points right of the last zone column that still belong to the table

# service_id -> (heading regex matched against a whole text line, header code -> zone)
SERVICES: dict[str, tuple[re.Pattern[str], dict[str, int]]] = {
    "ups_next_day_air": (re.compile(r"^UPS Next Day Air®\s*$"), {f"10{z}": z for z in range(2, 9)}),
    "ups_next_day_air_saver": (re.compile(r"^UPS Next Day Air Saver®\s*$"), {f"13{z}": z for z in range(2, 9)}),
    "ups_2nd_day_air": (re.compile(r"^UPS 2nd Day Air®\*?\s*$"), {f"20{z}": z for z in range(2, 9)}),
    "ups_3_day_select": (re.compile(r"^UPS 3 Day Select®\*?\s*$"), {f"30{z}": z for z in range(2, 9)}),
    "ups_ground": (re.compile(r"^UPS® Ground\*?\s*$"), {str(z): z for z in range(2, 9)}),
}


class ParseError(ValueError):
    """A rate page that cannot be read unambiguously."""


@dataclass
class Header:
    codes: list[str]
    centers: list[float]

    def zone_columns(self, code_map: dict[str, int]) -> tuple[dict[int, int], list[str]]:
        """Return {column index: zone} for the carrier's zones and the excluded codes (AK/HI/PR)."""
        zones, excluded = {}, []
        for index, code in enumerate(self.codes):
            bare = code.rstrip("*")
            if bare in code_map and not code.endswith("*"):
                zones[index] = code_map[bare]
            elif code.endswith("*"):
                excluded.append(code)
            else:
                raise ParseError(f"unexpected zone header {code!r} in {self.codes}")
        if sorted(zones.values()) != list(ZONES["ups"]):
            raise ParseError(f"header does not cover zones 2-8: {self.codes}")
        return zones, excluded


@dataclass
class PageTable:
    page: int
    header: Header
    rows: dict[int, list[str]] = field(default_factory=dict)  # weight -> prices per header column


def group_lines(words: list[dict], tolerance: float = ROW_TOLERANCE) -> list[list[dict]]:
    """Cluster pdfplumber words into lines by their `top`, each line sorted left to right."""
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(lines[-1][0]["top"] - word["top"]) <= tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def center(word: dict) -> float:
    return (word["x0"] + word["x1"]) / 2


def parse_header(line: list[dict]) -> Header | None:
    if not line or line[0]["text"] != "Zones":
        return None
    codes = [w["text"] for w in line[1:]]
    if not codes:
        raise ParseError("empty Zones header")
    return Header(codes, [center(w) for w in line[1:]])


def tokenize_row(line: list[dict]) -> tuple[int, list[dict]] | None:
    """(weight, price words) for a rate row; None for anything else (Letter rows, notes)."""
    if not line or not WEIGHT.match(line[0]["text"]):
        return None
    rest = [w for w in line[1:] if w["text"] not in LB_TOKENS]
    bad = [w["text"] for w in rest if not PRICE.match(w["text"])]
    if not rest or len(bad) == len(rest):
        return None  # a bare page number or a prose line that happens to start with a number
    if bad:
        raise ParseError(f"row {line[0]['text']}: non-price tokens {bad}")
    return int(line[0]["text"]), rest


def assign_columns(prices: list[dict], header: Header, tolerance: float = COLUMN_TOLERANCE) -> list[str]:
    """Match each price to the header column it sits under; exactly one price per column or error."""
    if len(prices) != len(header.centers):
        raise ParseError(f"{len(prices)} prices for {len(header.centers)} zone columns: {[w['text'] for w in prices]}")
    for word, expected in zip(prices, header.centers):
        if abs(center(word) - expected) > tolerance:
            raise ParseError(f"price {word['text']} at x={center(word):.0f} is not under column at x={expected:.0f}")
    return [money(w["text"].replace("$", "").replace(",", "")) for w in prices]


def parse_rate_page(words: list[dict], page: int) -> PageTable:
    header: Header | None = None
    rows: dict[int, list[str]] = {}
    for line in group_lines(words):
        found = parse_header(line)
        if found:
            if header is not None:
                raise ParseError(f"page {page}: two Zones headers")
            header = found
            continue
        if header is None:
            continue  # header strip above the table (e.g. "50 ups.com") is not part of it
        # the 2023-2024 guides print a vertical "DAILY RATES" label in the right margin
        line = [w for w in line if center(w) <= header.centers[-1] + MARGIN_TOLERANCE]
        token = tokenize_row(line)
        if token is None:
            continue
        weight, prices = token
        if weight in rows:
            raise ParseError(f"page {page}: weight {weight} appears twice")
        try:
            rows[weight] = assign_columns(prices, header)
        except ParseError as error:
            raise ParseError(f"page {page}, {weight} lb: {error}") from error
    if header is None or not rows:
        raise ParseError(f"page {page}: no rate table found")
    return PageTable(page, header, rows)


def service_on_page(lines: list[str]) -> str | None:
    """The service whose U.S. 48 table this page holds, judged by heading plus subheading."""
    stripped = [line.strip() for line in lines]
    for service_id, (pattern, _) in SERVICES.items():
        for index, line in enumerate(stripped):
            if pattern.match(line):
                neighbours = {stripped[i] for i in (index - 1, index + 1) if 0 <= i < len(stripped)}
                if neighbours & SUBHEADINGS:
                    return service_id
    return None


def parse_guide(year: int) -> tuple[list[dict], list[dict]]:
    """base_rates rows (1-150 lb) and ak_hi_zone exception rows for one guide."""
    import pdfplumber

    guide = rules.GUIDES[year]
    path = raw_path(guide["file"])
    tables: dict[str, list[PageTable]] = {s: [] for s in SERVICES}
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if "Zones" not in text:
                continue
            service_id = service_on_page(text.splitlines())
            if service_id is None:
                continue
            words = page.extract_words(x_tolerance=1.5)
            tables[service_id].append(parse_rate_page(words, number))
    base_rows, exceptions = [], []
    for service_id, pages in tables.items():
        base, excluded = assemble_table(service_id, pages, year)
        base_rows.extend(base)
        exceptions.append(ak_hi_exception(service_id, year, pages, excluded))
    return base_rows, exceptions


def assemble_table(service_id: str, pages: list[PageTable], year: int) -> tuple[list[dict], list[str]]:
    if not pages:
        raise ParseError(f"{year} {service_id}: no table pages found")
    guide = rules.GUIDES[year]
    code_map = SERVICES[service_id][1]
    rows: list[dict] = []
    seen: dict[int, int] = {}
    excluded_codes: list[str] = []
    for table in pages:
        zones, excluded = table.header.zone_columns(code_map)
        excluded_codes = excluded or excluded_codes
        for weight, prices in table.rows.items():
            if weight in seen:
                raise ParseError(f"{year} {service_id}: {weight} lb on pages {seen[weight]} and {table.page}")
            seen[weight] = table.page
            if weight > MAX_WEIGHT_LB[rules.CARRIER]:
                continue
            for index, zone in zones.items():
                rows.append({
                    "carrier": rules.CARRIER, "service_id": service_id, "rate_card": rules.RATE_CARD,
                    "year": str(year), "effective_date": guide["effective_date"], "zone": str(zone),
                    "max_weight_lb": weight_label(weight), "price": prices[index],
                    "source_file": guide["file"], "source_ref": str(table.page),
                })
    expected = list(range(1, MAX_TABLE_WEIGHT + 1))
    if sorted(seen) != expected:
        missing = sorted(set(expected) - set(seen))
        raise ParseError(f"{year} {service_id}: weights missing or extra, missing={missing[:10]}, extra={sorted(set(seen) - set(expected))[:10]}")
    return rows, excluded_codes


def ak_hi_exception(service_id: str, year: int, pages: list[PageTable], excluded: list[str]) -> dict:
    guide = rules.GUIDES[year]
    page_list = ",".join(str(t.page) for t in pages if min(t.rows) <= MAX_WEIGHT_LB[rules.CARRIER])
    if excluded:
        note = (f"Columns {', '.join(excluded)} (Alaska, Hawaii, Puerto Rico) sit in the same table as zones 2-8 "
                f"and are not parsed into base_rates; excluded from the dashboard.")
    else:
        note = ("The U.S. 48 table publishes zones 2-8 only; Alaska/Hawaii rates for this service are in separate "
                "tables (2025+) or not published, and are not parsed.")
    return {"carrier": rules.CARRIER, "service_id": service_id, "rate_card": rules.RATE_CARD, "year": str(year),
            "kind": "ak_hi_zone", "note": note, "source_file": guide["file"], "source_ref": page_list}


# ---------------------------------------------------------------------------
# Curated tables


def guide_end(year: int) -> str:
    """Last day a guide's rules apply: the day before the next guide takes effect (open for the latest)."""
    following = rules.GUIDES.get(year + 1)
    if not following:
        return ""
    return (date.fromisoformat(following["effective_date"]) - timedelta(days=1)).isoformat()


def surcharge_row(year: int, **values: str) -> dict:
    guide = rules.GUIDES[year]
    row = {"carrier": rules.CARRIER, "year": str(year), "rate_card": rules.RATE_CARD, "unit": "usd", "address_type": "any",
           "effective_from": guide["effective_date"], "effective_to": guide_end(year), "fuel_applies": "true",
           "source_file": guide["file"]}
    row.update(values)
    return row


def residential_rows(year: int) -> list[dict]:
    spec = rules.RESIDENTIAL[year]
    rows = []
    for variant, applies_to in (("ground", rules.GROUND), ("air", rules.AIR_AND_3DS)):
        quote = spec[variant]
        (amount,) = rules.amounts_in(quote)
        rows.append(surcharge_row(
            year, surcharge_id=f"ups_residential_{variant}_{year}", display_name="Residential Surcharge",
            condition="residential", applies_to=applies_to, address_type="residential", amount=amount, exclusive_group="residential",
            source_page=str(spec["page"]), source_quote=quote,
            notes=f"Per package, delivery to a home. {rules.FUEL_NOTE[year]}"))
    return rows


def delivery_area_rows(year: int) -> list[dict]:
    spec = rules.DELIVERY_AREA[year]
    rows = []
    for variant in ("commercial", "residential", "commercial_extended", "residential_extended"):
        quote = spec[variant]
        ground_amount, air_amount = rules.amounts_in(quote)
        condition = "delivery_area_extended" if variant.endswith("_extended") else "delivery_area"
        address = variant.split("_")[0]
        for mode, applies_to, amount in (("ground", rules.GROUND, ground_amount), ("air", rules.AIR_AND_3DS, air_amount)):
            rows.append(surcharge_row(
                year, surcharge_id=f"ups_das_{variant}_{mode}_{year}", display_name="Delivery Area Surcharge",
                condition=condition, applies_to=applies_to, address_type=address, amount=amount, exclusive_group="delivery_area",
                source_page=str(spec["page"]), source_quote=quote,
                notes=(f"{address.capitalize()} deliveries only ({'extended' if condition.endswith('extended') else 'standard'} "
                       f"delivery-area ZIP codes); the guide prints Ground and Air amounts side by side. {rules.FUEL_NOTE[year]}")))
    return rows


def banded_rows(year: int, quote: str, bands: tuple, **values: str) -> list[dict]:
    amounts = rules.amounts_in(quote)
    if len(amounts) != len(bands):
        raise ValueError(f"{year}: {len(amounts)} amounts for {len(bands)} zone bands in {quote!r}")
    rows = []
    base_id = values.pop("surcharge_id")
    for (zone_min, zone_max), amount in zip(bands, amounts):
        band = f"z{zone_min}" if zone_min == zone_max else f"z{zone_min}-{zone_max}"
        rows.append(surcharge_row(year, surcharge_id=f"{base_id}_{band}", zone_min=str(zone_min),
                                  zone_max=str(zone_max), amount=amount, source_quote=quote, **values))
    return rows


def additional_handling_rows(year: int) -> list[dict]:
    spec = rules.ADDITIONAL_HANDLING[year]
    rows = []
    for criterion, quote in spec["quotes"].items():
        condition, thresholds, note = rules.AH_CRITERIA[criterion]
        rows.extend(banded_rows(
            year, quote, spec["bands"], surcharge_id=f"ups_additional_handling_{criterion}_{year}",
            display_name="Additional Handling", condition=condition, applies_to="all",
            exclusive_group="ups_handling", source_page=str(spec["page"]),
            notes=(f"Criterion: {note}. Only one Additional Handling charge applies and none when a Large Package "
                   f"Surcharge applies (same exclusive_group). {rules.FUEL_NOTE[year]}"), **thresholds))
    return rows


def large_package_rows(year: int) -> list[dict]:
    spec = rules.LARGE_PACKAGE[year]
    floor = rules.LPS_MIN_BILLABLE[year]
    if floor["page"] != spec["page"]:
        raise ValueError(f"{year}: minimum billable weight cited on p.{floor['page']}, amounts on p.{spec['page']}")
    minimum = min_billable_lb(floor["quotes"][-1])
    rows = []
    for (address, criterion), quote in spec["quotes"].items():
        thresholds, note = rules.LPS_CRITERIA[criterion]
        rows.extend(banded_rows(
            year, quote, spec["bands"], surcharge_id=f"ups_large_package_{address}_{criterion}_{year}",
            display_name="Large Package Surcharge", condition="oversize", applies_to="all", address_type=address,
            exclusive_group="ups_handling", source_page=str(spec["page"]),
            min_billable_weight_lb=minimum,
            notes=(f"{address.capitalize()} deliveries only. Criterion: {note}. Minimum billable weight {minimum} lb "
                   f"(p.{floor['page']}): \"{' '.join(floor['quotes'])}\" {rules.FUEL_NOTE[year]}"), **thresholds))
    return rows


def peak_rows(year: int) -> list[dict]:
    spec = rules.PEAK.get(year)
    if not spec:
        return []
    rows = []
    for item in spec["rows"]:
        amounts = rules.amounts_in(item["quote"])
        if len(amounts) != len(item["windows"]):
            raise ValueError(f"{year} {item['condition']}: {len(amounts)} amounts for {len(item['windows'])} windows")
        for amount, window in zip(amounts, item["windows"]):
            if window is None:
                continue
            start, end = window
            rows.append(surcharge_row(
                year, surcharge_id=f"ups_{item['condition']}_{year}_{start}", display_name="Demand Surcharge",
                condition=item["condition"], applies_to=item["applies_to"], amount=amount,
                address_type="residential" if item["condition"] == "peak_residential" else "any",
                exclusive_group=item["condition"], effective_from=start, effective_to=end,
                source_file=spec["file"], source_page=str(item["page"]), source_quote=item["quote"],
                notes="; ".join(filter(None, [spec["note"], item.get("note"),
                                              "fuel_applies assumed from the guide's statement that fuel may apply to surcharges"]))))
    return rows


def surcharges() -> list[dict]:
    rows = []
    for year in rules.YEARS:
        rows += residential_rows(year) + delivery_area_rows(year) + additional_handling_rows(year)
        rows += large_package_rows(year) + peak_rows(year)
    return rows


def announced_increase() -> list[dict]:
    rows = []
    for year, spec in rules.ANNOUNCED_INCREASE.items():
        match = re.search(r"(\d+\.\d+)%", spec["quote"])
        if not match:
            raise ValueError(f"{year}: no percent in {spec['quote']!r}")
        rows.append({"carrier": rules.CARRIER, "year": str(year), "product_scope": "all", "rate_card": rules.RATE_CARD,
                     "percent": match.group(1), "source_type": "secondary", "source_file": spec["file"],
                     "source_ref": "", "source_quote": spec["quote"]})
    return rows


def dim_weight() -> list[dict]:
    rows = []
    for year, spec in rules.DIM_WEIGHT.items():
        guide = rules.GUIDES[year]
        rows.append({"carrier": rules.CARRIER, "year": str(year), "effective_from": guide["effective_date"],
                     "effective_to": guide_end(year), "divisor": "139", "min_volume_cuin": "0", "rounding": spec["rounding"],
                     "source_file": guide["file"], "source_ref": str(spec["page"]), "source_quote": spec["quote"]})
    return rows


# ---------------------------------------------------------------------------
# Fuel surcharge proxies from the FedEx historical pages

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
DATE = r"(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.? \d{1,2}, \d{4}"
WEEK_ROW = re.compile(rf"({DATE})\s*[-\u2013\u2014]\s*({DATE})")
PERCENT = re.compile(r"\d+\.\d+%")


def parse_date(text: str) -> date:
    month, day, year = re.match(r"([A-Za-z]+)\.? (\d{1,2}), (\d{4})", text).groups()
    return date(int(year), MONTHS[month[:3].lower()], int(day))


@dataclass
class WeekRow:
    start: date
    end: date
    text: str          # row text as it appears in the collapsed page text
    percents: list[str]


def parse_fuel_rows(page_text: str) -> list[WeekRow]:
    """Weekly rows of the first (package) table on a FedEx historical fuel page."""
    text = re.sub(r"\s+", " ", page_text)
    starts = [m for m in WEEK_ROW.finditer(text)]
    rows = []
    for current, following in zip(starts, starts[1:] + [None]):
        end = following.start() if following else len(text)
        segment = text[current.start():end]
        segment = segment.split(" previous ")[0].split(" Previous ")[0].strip()
        percents = PERCENT.findall(segment)
        if not percents:
            continue
        rows.append(WeekRow(parse_date(current.group(1)), parse_date(current.group(2)), segment, percents))
    if not rows:
        raise ValueError("no weekly fuel rows found")
    return rows


def lower_median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    return ordered[(len(ordered) - 1) // 2]


def fuel_proxy_rows(year: int) -> list[dict]:
    spec = rules.FUEL_PROXY_SOURCES[year]
    rows = parse_fuel_rows(html_text(raw_path(spec["file"])))
    out = []
    for group, index in spec["percent_index"].items():
        values = [Decimal(r.percents[index].rstrip("%")) for r in rows]
        median = lower_median(values)
        mean = sum(values) / len(values)
        chosen = next(r for r in rows if Decimal(r.percents[index].rstrip("%")) == median)
        token = chosen.percents[index]
        quote = chosen.text[:chosen.text.index(token) + len(token)]
        out.append({
            "carrier": rules.CARRIER, "year": str(year), "service_group": group, "default_percent": f"{median:.2f}",
            "basis": "base rate plus surcharges flagged fuel_applies",
            "window_start": min(r.start for r in rows).isoformat(), "window_end": max(r.end for r in rows).isoformat(),
            "is_proxy": "true", "source_file": spec["file"], "source_ref": "", "source_quote": quote,
            "notes": (f"Proxy: UPS publishes no retrievable weekly fuel history. default_percent is the lower median of the "
                      f"{len(values)} weekly FedEx {group} percentages in this snapshot (mean {mean:.2f}%); the quoted row is "
                      f"the most recent week at the median. {spec['layout']}."),
        })
    return out


def fuel_surcharge() -> list[dict]:
    rows = []
    for year in rules.YEARS:
        rows += fuel_proxy_rows(year)
    return rows


def exceptions(parsed: list[dict]) -> list[dict]:
    rows = [dict(row) for row in parsed]
    for note in rules.EXCEPTION_NOTES:
        rows.append({"carrier": rules.CARRIER, "rate_card": rules.RATE_CARD, **note})
    return rows


def main() -> None:
    base_rows, parsed_exceptions = [], []
    for year in rules.YEARS:
        rows, year_exceptions = parse_guide(year)
        base_rows += rows
        parsed_exceptions += year_exceptions
        print(f"{year}: {len(rows)} rate cells")
    builders = (
        ("base_rates", lambda: base_rows),
        ("exceptions", lambda: exceptions(parsed_exceptions)),
        ("surcharges", surcharges),
        ("fuel_surcharge", fuel_surcharge),
        ("announced_increase", announced_increase),
        ("dim_weight", dim_weight),
    )
    for table, build in builders:
        rows = build()
        path = write_table(rules.CARRIER, table, rows)
        print(f"wrote {path.name}: {len(rows)} rows")


if __name__ == "__main__":
    main()
