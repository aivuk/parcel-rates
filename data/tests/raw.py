"""Tests that open a raw PDF skip when it has not been fetched, so a fresh clone
is green. PARCEL_RATES_REQUIRE_RAW=1 turns those skips into failures for a full
validation run (after `python3 data/fetch_raw.py`)."""
from __future__ import annotations

import os
from typing import NoReturn

import pytest

REQUIRE_RAW_ENV = "PARCEL_RATES_REQUIRE_RAW"


def missing_raw(error: FileNotFoundError) -> NoReturn:
    """Skip, or fail when PARCEL_RATES_REQUIRE_RAW=1, for a raw file that is not on disk."""
    if os.environ.get(REQUIRE_RAW_ENV) == "1":
        pytest.fail(f"{error} ({REQUIRE_RAW_ENV}=1)")
    pytest.skip(str(error))
