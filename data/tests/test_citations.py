"""Every curated row cites a file, a location and a verbatim quote containing the
amount. This test opens the cited location and checks the quote is really there.
Rows whose raw file has not been fetched are skipped with a message."""
from __future__ import annotations

import pytest

from data.pipeline.common import (
    ADDRESS_TYPES, CARRIERS, COLUMNS, CURATED_TABLES, SURCHARGE_CONDITIONS, normalize_text,
    processed_path, read_table, source_text,
)

AMOUNT_COLUMN = {
    "surcharges": "amount",
    "fuel_surcharge": "default_percent",
    "announced_increase": "percent",
    "dim_weight": "divisor",
}


def curated_rows():
    for carrier in CARRIERS:
        for table in CURATED_TABLES:
            for index, row in enumerate(read_table(processed_path(carrier, table))):
                yield pytest.param(carrier, table, row, id=f"{carrier}-{table}-{index}")
    for index, row in enumerate(read_table(processed_path("shared", "zone_from_distance"))):
        yield pytest.param("shared", "zone_from_distance", row, id=f"zone-{index}")


def amount_variants(value: str) -> set[str]:
    """'6.55' may be printed as '$6.55' or '6.55'; '5.9' as '5.9%'; '166' as '166'."""
    value = value.strip().lstrip("-")  # a decrease is quoted as "decrease 3.2 percent"
    variants = {value}
    try:
        number = float(value)
        if number == int(number):
            variants.add(str(int(number)))
        variants.add(f"{number:.2f}")
        variants.add(f"{number:,.2f}")
    except ValueError:
        pass
    return {v.lower() for v in variants}


@pytest.mark.parametrize("owner,table,row", list(curated_rows()))
def test_quote_is_in_cited_source(owner, table, row):
    assert list(row.keys()) == COLUMNS[table], f"{table} columns differ from schema"
    if table == "surcharges":
        assert row["condition"] in SURCHARGE_CONDITIONS, row["condition"]
        assert row["address_type"] in ADDRESS_TYPES, f"address_type must be one of {ADDRESS_TYPES}: {row['surcharge_id']}"
        if row["condition"] == "additional_handling_width":
            assert row["min_width_in"], f"width rule without min_width_in: {row['surcharge_id']}"
    quote = row["source_quote"]
    assert quote.strip(), f"{table}: empty source_quote"
    amount = row.get(AMOUNT_COLUMN.get(table, ""), "")
    if amount:
        assert any(v in quote.lower() for v in amount_variants(amount)), f"quote does not contain the amount {amount}: {quote}"
    ref = row.get("source_page") or row.get("source_ref") or None
    try:
        text = source_text(row["source_file"], ref)
    except FileNotFoundError as error:
        pytest.skip(str(error))
    assert normalize_text(quote) in normalize_text(text), (
        f"quote not found at {row['source_file']} [{ref}]: {quote[:120]}"
    )
