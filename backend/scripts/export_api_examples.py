"""Write one real request/response pair per endpoint to docs/api-examples/.

The frontend uses these files as fixtures and its contract test checks them
against frontend/src/api/types.ts. Regenerate after any engine or data change:

    uv run --directory backend python scripts/export_api_examples.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import REPO_ROOT, create_app  # noqa: E402

OUT_DIR = REPO_ROOT / "docs" / "api-examples"

QUOTE_PARCEL = {
    "weight_lb": 3.2,
    "length_in": 14,
    "width_in": 12,
    "height_in": 10,
    "distance_miles": 700,
    "residential": True,
    "speed": "ground",
    "delivery_area": "das",
}


def examples(sample: list[dict]) -> list[tuple[str, str, str, dict | None]]:
    """(name, method, path, request body)."""
    return [
        ("health", "GET", "/api/health", None),
        ("meta", "GET", "/api/meta", None),
        ("sample-parcels", "GET", "/api/sample-parcels", None),
        ("quote", "POST", "/api/quote", {"parcel": QUOTE_PARCEL, "controls": {"year": 2026}}),
        ("breakeven", "POST", "/api/breakeven", {"controls": {"year": 2026}, "residential": True}),
        ("blended", "POST", "/api/blended", {"parcels": sample, "controls": {"year": 2026, "flat_price": 9.99}}),
        (
            "yearly",
            "POST",
            "/api/yearly",
            {"parcels": sample, "controls": {"usps_rate_card": "commercial"}, "next_year_increase_percent": 5.9},
        ),
        (
            "quote-422",
            "POST",
            "/api/quote",
            {"parcel": {**QUOTE_PARCEL, "weight_lb": 80, "speed": "overnight"}, "controls": {"year": 2026}},
        ),
    ]


def export(out_dir: Path = OUT_DIR) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    with TestClient(create_app()) as client:
        sample = client.get("/api/sample-parcels").json()["parcels"]
        for name, method, path, body in examples(sample):
            response = client.request(method, path, json=body)
            expected = 422 if name.endswith("422") else 200
            if response.status_code != expected:
                raise SystemExit(f"{name}: HTTP {response.status_code} {response.text[:300]}")
            doc = {
                "request": {"method": method, "path": path, "body": body},
                "response": {"status": response.status_code, "body": response.json()},
            }
            target = out_dir / f"{name}.json"
            target.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
            written.append(target)
    return written


if __name__ == "__main__":
    for path in export():
        print(f"wrote {path}")
