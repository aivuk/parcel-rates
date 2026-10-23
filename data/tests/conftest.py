from __future__ import annotations

import pytest

from data.pipeline.common import CARRIERS, processed_path, read_table


def carriers_with_output(table: str) -> list[str]:
    return [carrier for carrier in CARRIERS if processed_path(carrier, table).is_file()]


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "carrier" in metafunc.fixturenames:
        metafunc.parametrize("carrier", list(CARRIERS))


@pytest.fixture
def base_rates(carrier: str) -> list[dict]:
    rows = read_table(processed_path(carrier, "base_rates"))
    if not rows:
        pytest.skip(f"{carrier}: no base_rates.csv yet")
    return rows


@pytest.fixture
def exceptions(carrier: str) -> list[dict]:
    return read_table(processed_path(carrier, "exceptions"))
