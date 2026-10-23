# API contract

The FastAPI backend (`backend/`) serves JSON under `/api`. The frontend talks to
it only through these endpoints. Types below are the Pydantic models
(`backend/app/api/models.py`) and the TypeScript types
(`frontend/src/api/types.ts`), which must stay in sync; a contract test in each
side checks the example payloads in `docs/api-examples/`.

Money is a number in USD rounded to cents. Weights in pounds, lengths in inches,
distances in miles. Years are price-list labels (see `docs/data/SCHEMA.md`).

## Shared types

```ts
type Carrier = "usps" | "ups" | "fedex";
type Tier = "ground" | "two_three_day" | "next_day";
type DeliveryArea = "none" | "das" | "extended";
type UspsRateCard = "commercial" | "retail";

interface Parcel {
  weight_lb: number;            // > 0, <= 70
  length_in?: number;           // all three or none; > 0
  width_in?: number;
  height_in?: number;
  distance_miles: number;       // >= 0
  residential: boolean;
  speed: Tier;
  quantity?: number;            // default 1, integer >= 1
  price_charged?: number;       // overrides Controls.flat_price for this row
  delivery_area?: DeliveryArea; // default "none"
  nonstandard_packaging?: boolean; // default false
}

interface Controls {
  year: number;                 // default: latest year with all three carriers (2026)
  as_of?: string;               // ISO date; default the year's January effective date
  usps_rate_card: UspsRateCard; // default "commercial"
  fuel_override_percent?: { ground?: number; express?: number }; // replaces the yearly default
  peak: boolean;                // default false; when true, as_of moves into the year's peak window
  flat_price: number;           // what the shop charges per parcel; default 9.99
}

interface LineItem {
  kind: "base" | "surcharge" | "fuel";
  label: string;                // carrier's own name, e.g. "Residential Surcharge"
  amount: number;
  surcharge_id?: string;        // links to surcharges.csv
  source?: string;              // "file p.N" for display
}

interface Quote {
  carrier: Carrier;
  service_id: string;
  service_name: string;
  tier: Tier;
  zone: number;
  billable_weight_lb: number;
  dim_weight_lb: number | null;
  line_items: LineItem[];
  total: number;
  margin: number;               // price charged minus total
  available: boolean;           // false when the service cannot carry this parcel
  unavailable_reason?: string;  // e.g. "FedEx Ground serves business addresses only"
}
```

## Endpoints

### GET /api/meta
Years per carrier, services, default controls, fuel defaults per year, the
zone bands, and the data limitations text shown in the UI footer.

### GET /api/sample-parcels
The bundled illustrative parcel mix as `Parcel[]`, with a `description`.

### POST /api/quote  (question 1)
Request `{ parcel: Parcel, controls: Controls }`. Response
`{ quotes: Quote[], cheapest_by_tier: Record<Tier, {carrier, service_id, total}> }`,
quotes sorted by total within the requested tier first, then the other tiers.

### POST /api/breakeven  (question 2)
Request `{ controls: Controls, residential: boolean, weights_lb?: number[], distances_miles?: number[] }`
(defaults: weights 1..70 step 1, distances at every zone band midpoint).
Response: a grid of cells `{ weight_lb, distance_miles, zone_usps, zone_private, winner: {carrier, service_id, total}, runner_up: {...}, saving }`
for the ground tier, plus `breakeven_weight_lb` per distance band: the lightest
weight at which USPS stops winning against UPS and against FedEx.

### POST /api/blended  (question 3)
Request `{ parcels: Parcel[], controls: Controls, segment?: SegmentFilter }`.
Response per carrier: parcels shipped, blended cost per parcel, base vs
surcharge vs fuel split (absolute and share), surcharge breakdown by kind,
margin per parcel, share of parcels shipped at a loss, and the cheapest
carrier per parcel (a "best mix" row). Each parcel uses the cheapest service
of that carrier in the parcel's speed tier.

### POST /api/yearly  (question 4)
Request `{ parcels: Parcel[], controls: Controls, next_year_increase_percent?: number }`.
Response per carrier and year: blended cost per parcel under that year's
prices and rules, the year-over-year change, the carrier's announced average
increase for comparison, and the driver breakdown: for each parcel segment
(weight band, zone band, residential, speed), its contribution to the change
in dollars per parcel. Optional projected next year from the slider.

### Segments
`SegmentFilter = { weight_band?: string, zone_band?: string, residential?: boolean, speed?: Tier }`.
Weight bands: `≤1`, `1–5`, `5–10`, `10–20`, `20–70` lb. Zone bands: `1–2`, `3–4`, `5–6`, `7–8`.

## Engine rules the endpoints share

- **Zone** from `data/processed/zone_from_distance.csv` per carrier: the band
  whose `min_miles <= distance <= max_miles`.
- **Billable weight** per carrier and `as_of` from `dim_weight.csv`: dimensions
  rounded per the row's rounding rule, dimensional weight = volume / divisor
  rounded up, only when volume exceeds `min_volume_cuin`; billable = max(actual
  rounded up to the next weight step, dimensional). USPS Ground Advantage keeps
  its ounce steps for parcels under 1 lb.
- **Base rate**: the first weight step `>= billable weight` in the zone, for
  the service, rate card (`list` for UPS and FedEx, the USPS control otherwise)
  and year.
- **Surcharges**: every rule of that carrier and year whose window contains
  `as_of`, whose `applies_to` covers the service, whose `address_type`
  matches, and whose thresholds the parcel meets; peak conditions only when
  `controls.peak`. Rules in the same `exclusive_group` do not stack: the
  highest amount wins. Percent surcharges apply to the base rate.
- **Fuel**: `percent x (base + surcharges flagged fuel_applies)`, percent from
  `fuel_surcharge.csv` for the year and service group (ground services use
  `ground`, all others `express`) unless overridden. USPS has none.
- **Availability**: FedEx Ground for business addresses only, Home Delivery for
  residential only (from `services.csv`); weight over 70 lb is rejected.
- **as_of**: defaults to the base-rate `effective_date` of the year for each
  carrier. With `peak: true` it is December 10 of the year, inside every
  carrier's peak window. `as_of` therefore also selects time-varying rules such
  as the USPS dimensional divisor (166 until 2026-07-11, 139 after) and the
  2026 USPS 8 % transportation increase.
- **Cheapest per tier**: among available services of the tier, lowest total.
- The engine never hardcodes an amount; every number comes from
  `data/processed/`.

## Errors
422 with `{ detail: [{ loc, msg }] }` for invalid input (Pydantic default),
with messages written for the shop owner, e.g. "weight_lb must be at most 70".
