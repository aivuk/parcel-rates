"""Generate backend/app/sample_parcels.csv, the bundled ILLUSTRATIVE parcel mix.

This is an example, not real shipping data. It imitates a small online
home-goods shop (candles, mugs, linens, small decor): mostly light ground
parcels in small boxes, a minority of bulky boxes, and few expedited orders.

Target mix (issue #22):

- about 80 % of parcels weigh under 5 lb; every box except the bulky ones is
  under 1 cubic foot (1,728 cu in), so dimensional weight rarely applies;
- a fixed 12 rows of bulky boxes between 1 and 2 cubic feet (throws, lamps),
  about 7 % of parcels;
- a fixed 12 rows ship two to three day and 3 rows next day (about 4 % and
  1 % of parcels), always single light parcels; the rest ship ground;
- about 76 % of rows residential; distances spread over every zone, weighted
  toward the middle zones (3 to 6); five rows in delivery areas (four
  delivery area, one extended); two rows with non-standard packaging;
- 200 rows whose quantities sum to about 300 parcels.

Price charged. Ground parcels leave ``price_charged`` empty and use the flat
price control ($9.99 by default). Expedited parcels carry what a shop would
charge at checkout for faster shipping: $19.99 for two to three day and
$39.99 for next day. Small shops usually price an expedited option at two to
four times their standard rate, and these amounts sit near the published USPS
Priority Mail and Priority Mail Express prices for the light parcels people
choose to rush. Without them every expedited parcel would ship at $9.99 and
show a loss no real shop would accept.

Order value (issue #10). Every row carries the value of the order its parcel
ships, so a free-shipping rule ("free shipping on orders of $75 or more") can be
explored. It grows with the parcel's weight, as heavier home goods cost more:
$9 per lb plus a log-normal basket of other items (median about $20), never
under $12. The values come from a separate random stream, so adding them left
every other column of the sample unchanged; the rule is off by default, so the
default view below is unchanged too.

Tuning target: the default view (2026, USPS commercial, default fuel, peak
off, flat $9.99) opens near break-even overall for the cheapest carrier (blended
margin within about $1 per parcel), with losses where they would be in reality.
Measured with the rate engine by ``--check`` (no engine or data change):

    200 rows, 307 parcels: 81 % under 5 lb, 7.2 % over 1 cu ft, 3.9 % two to
    three day, 1.0 % next day, 80 % residential, 2.3 % in delivery areas
    revenue $10.67 per parcel (flat $9.99 plus the expedited prices)
    USPS (cheapest): $10.98 per parcel, margin -$0.31 per parcel, 40 % of parcels at a loss
    UPS $31.14 and FedEx $31.22 per parcel (list prices, residential, fuel)
    best mix: all 307 parcels with USPS, same as USPS alone
    losses (USPS): bulky boxes -$10.69 per parcel (all at a loss), 5 to 20 lb
    -$6 to -$8, zones 5 to 8 -$1 to -$4 (about 65 % at a loss), next day
    -$4.41; gains: under 1 lb +$3.71, zones 1 to 4, two to three day +$8.22.
    USPS has no delivery area surcharge, so those parcels do not lose with USPS.
    free shipping over $75 (off by default): 54 parcels ship free, revenue
    $8.92 per parcel, USPS margin -$2.06; over $50: 118 free, -$4.28; over
    $100: 35 free, -$1.45.

Regenerate and measure (fixed seed, reproducible):

    uv run --directory backend python scripts/make_sample_parcels.py
    uv run --directory backend python scripts/make_sample_parcels.py --check
"""

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

SEED = 20261023
ORDER_SEED = SEED + 10  # separate stream: order values never shift the other columns
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
    "order_value",
]
CUBIC_FOOT = 1728

# (name, share of the non-bulky rows, weight range lb, box sizes in inches) — illustrative product mix.
PROFILES = [
    ("mailer", 0.55, (0.3, 2.0), [(9, 6, 2), (10, 8, 2), (10, 7, 4), (12, 9, 3)]),  # linens, small decor
    ("small box", 0.32, (2.0, 5.0), [(10, 8, 6), (12, 9, 4), (12, 10, 6), (12, 12, 6)]),  # mugs, candles
    ("medium box", 0.13, (5.0, 12.0), [(14, 12, 8), (16, 10, 8), (14, 14, 8)]),  # sets, cookware (< 1 cu ft)
]
# Bulky boxes over 1 cubic foot (throws, lamps), placed on a fixed number of rows.
BULKY = ((4.0, 12.0), [(18, 14, 10), (20, 14, 10), (16, 16, 12), (18, 16, 10)])
BULKY_ROWS = 12  # about 6 % of parcels
# One distance range per USPS zone band (miles) with a weight favouring mid distances.
DISTANCES = [
    ((5, 50), 0.06),  # zone 1
    ((51, 150), 0.08),  # zone 2
    ((151, 300), 0.13),  # zone 3
    ((301, 600), 0.20),  # zone 4
    ((601, 1000), 0.19),  # zone 5
    ((1001, 1400), 0.15),  # zone 6
    ((1401, 1800), 0.11),  # zone 7
    ((1801, 2700), 0.08),  # zone 8
]
DELIVERY_AREA_ROWS = 5  # a handful: four delivery area, one extended
EXPEDITED_ROWS = {"two_three_day": 12, "next_day": 3}  # about 4 % and 1 % of ~300 parcels
EXPEDITED_PRICE = {"two_three_day": 19.99, "next_day": 39.99}


def _order_value(rng: random.Random, weight_lb: float) -> float:
    """Illustrative order value: $9 per lb plus a basket of other items, at least $12."""
    return round(max(12.0, 9 * weight_lb + rng.lognormvariate(3.0, 0.6)), 2)


def _pick(rng: random.Random, items, weight):
    r = rng.random() * sum(weight(i) for i in items)
    acc = 0.0
    for item in items:
        acc += weight(item)
        if r <= acc:
            return item
    return items[-1]


def _row(rng: random.Random) -> dict:
    _, _, (wmin, wmax), boxes = _pick(rng, PROFILES, lambda p: p[1])
    weight = round(rng.uniform(wmin, wmax), 1)
    length, width, height = rng.choice(boxes)
    (lo, hi), _ = _pick(rng, DISTANCES, lambda d: d[1])
    return {
        "weight_lb": weight,
        "length_in": length,
        "width_in": width,
        "height_in": height,
        "distance_miles": rng.randint(lo, hi),
        "residential": "true" if rng.random() < 0.76 else "false",
        "speed": "ground",
        "quantity": rng.choice([1, 1, 1, 1, 2, 3]),
        "price_charged": "",
        "delivery_area": "none",
        "nonstandard_packaging": "false",
    }


def generate() -> list[dict]:
    rng = random.Random(SEED)
    rows = [_row(rng) for _ in range(N)]
    (wmin, wmax), boxes = BULKY
    bulky = rng.sample(range(N), BULKY_ROWS)
    for i in bulky:
        length, width, height = rng.choice(boxes)
        rows[i].update(weight_lb=round(rng.uniform(wmin, wmax), 1), length_in=length, width_in=width, height_in=height)
    # Expedited orders are single light parcels: a fixed count keeps the shares on target.
    light = [i for i, r in enumerate(rows) if r["weight_lb"] < 5 and i not in bulky]
    picked = rng.sample(light, EXPEDITED_ROWS["two_three_day"] + EXPEDITED_ROWS["next_day"])
    for n, i in enumerate(picked):
        speed = "two_three_day" if n < EXPEDITED_ROWS["two_three_day"] else "next_day"
        rows[i].update(speed=speed, quantity=1, price_charged=EXPEDITED_PRICE[speed])
    for i in rng.sample(range(N), 2):
        rows[i]["nonstandard_packaging"] = "true"
    for n, i in enumerate(rng.sample(range(N), DELIVERY_AREA_ROWS)):
        rows[i]["delivery_area"] = "das" if n < DELIVERY_AREA_ROWS - 1 else "extended"
    order_rng = random.Random(ORDER_SEED)
    for r in rows:
        r["order_value"] = _order_value(order_rng, r["weight_lb"])
    return rows


def write(rows: list[dict]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} illustrative parcels to {OUT}")


def check() -> None:
    """Price the written sample at the default controls and print where it loses."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from collections import defaultdict
    from dataclasses import replace
    from decimal import Decimal

    from app.engine.blended import blended, per_parcel_quotes
    from app.engine.quote import price_charged
    from app.engine.segments import segment_of
    from app.engine.tables import load_tables
    from app.engine.types import Controls, Parcel
    from app.main import data_dir, load_sample_parcels

    tables = load_tables(data_dir())
    parcels = [Parcel(**p) for p in load_sample_parcels()]
    controls = Controls(year=2026, usps_rate_card="commercial", peak=False, flat_price=9.99)
    n = sum(p.quantity for p in parcels)
    print(f"rows {len(parcels)}, parcels {n}")

    def share(pred) -> str:
        return f"{sum(p.quantity for p in parcels if pred(p)) / n:.1%}"

    def volume(p: Parcel) -> float:
        return p.length_in * p.width_in * p.height_in if p.has_dimensions else 0.0

    print(
        f"under 5 lb {share(lambda p: p.weight_lb < 5)}, over 1 cu ft {share(lambda p: volume(p) > CUBIC_FOOT)}, "
        f"2-3 day {share(lambda p: p.speed == 'two_three_day')}, next day {share(lambda p: p.speed == 'next_day')}, "
        f"residential {share(lambda p: p.residential)}, delivery area {share(lambda p: p.delivery_area != 'none')}"
    )

    r = blended(tables, parcels, controls)
    print(f"revenue/parcel {r['revenue_per_parcel']}")
    for c in sorted(r["carriers"], key=lambda c: c["cost_per_parcel"]):
        print(
            f"  {c['carrier']:5} cost/parcel {c['cost_per_parcel']:6.2f} margin/parcel {c['margin_per_parcel']:+6.2f} "
            f"at a loss {c['loss_share']:.1%}"
        )
    b = r["best_mix"]
    print(
        f"  best mix cost/parcel {b['cost_per_parcel']:6.2f} margin/parcel {b['margin_per_parcel']:+6.2f} "
        f"at a loss {b['loss_share']:.1%} {b['parcels_by_carrier']}"
    )

    for threshold in (50, 75, 100):
        free = blended(tables, parcels, replace(controls, free_shipping_over=threshold))
        usps = next(c for c in free["carriers"] if c["carrier"] == "usps")
        print(
            f"free shipping over ${threshold}: {free['free_shipping']['parcels']} parcels free, "
            f"revenue/parcel {free['revenue_per_parcel']}, USPS margin/parcel {usps['margin_per_parcel']:+.2f}"
        )

    cheapest = min(r["carriers"], key=lambda c: c["cost_per_parcel"])["carrier"]
    quotes = per_parcel_quotes(tables, cheapest, parcels, controls)
    groups: dict[str, list] = defaultdict(lambda: [0, Decimal(0), 0])  # parcels, margin, at loss

    def add(key: str, p: Parcel, margin: Decimal) -> None:
        g = groups[key]
        g[0] += p.quantity
        g[1] += margin * p.quantity
        g[2] += p.quantity if margin < 0 else 0

    for p, q in zip(parcels, quotes):
        if q is None:
            continue
        margin = price_charged(p, controls) - q.total
        s = segment_of(tables, p)
        add("bulky (> 1 cu ft)" if volume(p) > CUBIC_FOOT else "not bulky", p, margin)
        add(f"zone {s['zone_band']}", p, margin)
        add(f"weight {s['weight_band']} lb", p, margin)
        add(f"speed {p.speed}", p, margin)
        add("delivery area" if p.delivery_area != "none" else "no delivery area", p, margin)
        add(s["residential"], p, margin)
    print(f"segments for {cheapest} (parcels, margin/parcel, at a loss):")
    for key in sorted(groups):
        count, total, loss = groups[key]
        print(f"  {key:22} {count:4} {float(total) / count:+7.2f} {loss / count:6.1%}")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        write(generate())
