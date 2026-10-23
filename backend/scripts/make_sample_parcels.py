"""Generate backend/app/sample_parcels.csv, the bundled ILLUSTRATIVE parcel mix.

This is not real shipping data. It imitates a small online shop selling
apparel and home goods: mostly light parcels, some medium boxes, a few bulky
boxes that trigger dimensional weight, about 75 % residential and 85 % ground,
distances spread across every zone, a handful in delivery areas and a couple
with non-standard packaging. A fixed seed keeps the file reproducible:

    uv run --directory backend python scripts/make_sample_parcels.py
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

SEED = 20261023
N = 200
OUT = Path(__file__).resolve().parents[1] / "app" / "sample_parcels.csv"
COLUMNS = [
    "weight_lb",
    "length_in",
    "width_in",
    "height_in",
    "distance_miles",
    "residential",
    "speed",
    "quantity",
    "price_charged",
    "delivery_area",
    "nonstandard_packaging",
]

# (share, weight range lb, box sizes in inches) — illustrative product mix
PROFILES = [
    (0.62, (0.3, 5.0), [(10, 8, 2), (12, 9, 3), (12, 10, 4), (14, 10, 4), (10, 7, 5)]),  # apparel mailers
    (0.28, (5.0, 20.0), [(16, 12, 8), (18, 14, 8), (16, 16, 10), (20, 14, 10)]),  # home goods
    (0.10, (3.0, 12.0), [(24, 16, 12), (22, 18, 12), (20, 20, 14), (26, 16, 10)]),  # bulky, light boxes
]
# One distance range per USPS zone band (miles), sampled evenly.
DISTANCES = [(5, 50), (51, 150), (151, 300), (301, 600), (601, 1000), (1001, 1400), (1401, 1800), (1801, 2700)]


def _row(rng: random.Random) -> dict:
    r = rng.random()
    acc = 0.0
    for share, (wmin, wmax), boxes in PROFILES:
        acc += share
        if r <= acc:
            break
    weight = round(rng.uniform(wmin, wmax), 1)
    with_dims = rng.random() < 0.8 or share == PROFILES[2][0]
    length, width, height = rng.choice(boxes) if with_dims else ("", "", "")
    lo, hi = rng.choice(DISTANCES)
    speed_roll = rng.random()
    speed = "ground" if speed_roll < 0.85 else ("two_three_day" if speed_roll < 0.96 else "next_day")
    area_roll = rng.random()
    area = "das" if area_roll < 0.04 else ("extended" if area_roll < 0.06 else "none")
    return {
        "weight_lb": weight,
        "length_in": length,
        "width_in": width,
        "height_in": height,
        "distance_miles": rng.randint(lo, hi),
        "residential": "true" if rng.random() < 0.75 else "false",
        "speed": speed,
        "quantity": rng.choice([1, 1, 1, 1, 2, 3]),
        "price_charged": "" if rng.random() < 0.85 else rng.choice([7.99, 12.99, 14.99]),
        "delivery_area": area,
        "nonstandard_packaging": "false",
    }


def main() -> None:
    rng = random.Random(SEED)
    rows = [_row(rng) for _ in range(N)]
    for i in rng.sample(range(N), 2):
        rows[i]["nonstandard_packaging"] = "true"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} illustrative parcels to {OUT}")


if __name__ == "__main__":
    main()
