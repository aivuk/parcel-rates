# API contract

The FastAPI backend (`backend/`) serves JSON under `/api`. The frontend talks to
it only through these endpoints. Types below are the Pydantic models
(`backend/app/api/models.py`) and the TypeScript types
(`frontend/src/api/types.ts`), which must stay in sync; a contract test in each
side checks the example payloads in `docs/api-examples/`.

Interactive docs: `/api/docs` (Swagger UI) and `/api/openapi.json`, also
through the nginx proxy at http://localhost:8088/api/docs.

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
  distance_miles?: number;      // >= 0; needed unless destination_zip is given
  residential: boolean;
  speed: Tier;
  quantity?: number;            // default 1, integer >= 1
  price_charged?: number;       // overrides Controls.flat_price for this row
  delivery_area?: DeliveryArea; // default "none"
  nonstandard_packaging?: boolean; // default false
  order_value?: number;         // >= 0; value of the order the parcel ships (free-shipping rule)
  origin_zip?: string;          // 5-digit ZIP (or ZIP+4); default Controls.origin_zip
  destination_zip?: string;     // 5-digit ZIP; with an origin, sets the zones: USPS from its zone chart,
                                // UPS and FedEx estimated from the distance between the two ZIPs
}

interface Controls {
  year?: number;                // omitted or null: latest year with all three carriers (2026);
                                // a year no carrier publishes is a 422
  as_of?: string;               // ISO date; default the year's January effective date
  usps_rate_card: UspsRateCard; // default "commercial"
  fuel_override_percent?: { ground?: number; express?: number }; // replaces the yearly default
  peak: boolean;                // default false; when true, as_of moves into the year's peak window
  flat_price: number;           // what the shop charges per parcel; default 9.99
  free_shipping_over?: number | null; // free shipping on orders of this value or more; default none.
                                // A parcel whose order_value reaches it is charged $0, ahead of its
                                // price_charged; parcels without order_value are not affected
  origin_zip?: string | null;   // where the shop ships from (5-digit ZIP); the default origin of every parcel
}

interface LineItem {
  kind: "base" | "surcharge" | "fuel";
  label: string;                // carrier's own name, e.g. "Residential Surcharge"
  amount: number;
  surcharge_id?: string;        // links to surcharges.csv
  source?: string;              // "file p.N" for display
  condition?: string;           // surcharges.csv condition, for grouping surcharges by kind
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
  as_of: string | null;         // ISO date the rules were resolved for
}
// An unavailable quote has line_items: [] and total: 0, margin: 0; zone and
// weights are null when they were not reached. Clients must check `available`.
```

## Endpoints

### GET /api/health
`{"status": "ok"}` for the Docker health check.

### GET /api/meta
Years per carrier, services (with `rate_card_notes`), default controls
(including the default `as_of` per carrier), fuel defaults per year with
`is_proxy`, the zone bands, the segment band labels, and the data limitations
text shown in the UI footer. Shape: `MetaResponse` in `backend/app/api/models.py`.
`zip_zones` (`{usps_effective_date, usps_origins, zip_points}` or null) says
whether ZIP codes can be used: a 422 names `destination_zip` or `origin_zip`
when a ZIP is unknown, malformed or has no origin.

### GET /api/sample-parcels
The bundled illustrative parcel mix as `Parcel[]`, with a `description`.

### POST /api/quote  (question 1)
Request `{ parcel: Parcel, controls: Controls }`. Response
`{ distance_miles: number, quotes: Quote[], cheapest_by_tier: Record<Tier, {carrier, service_id, total}> }`
(`distance_miles` is the typed distance, or the great-circle miles between the two ZIPs' Census points;
each quote carries `zone_source`: `"usps_chart"` (the USPS zone chart), `"zip_distance"` (estimated from
the ZIP distance and the carrier's distance bands) or `"distance"` (typed miles)),
quotes sorted by total within the requested tier first, then the other tiers
(unavailable quotes last within a tier). Only carriers that publish the
requested year are quoted (2027 is FedEx only). A tier with no available
service maps to `null` in `cheapest_by_tier`.

### POST /api/breakeven  (question 2)
Request `{ controls: Controls, residential: boolean, weights_lb?: number[], distances_miles?: number[] }`
(defaults: weights 1..70 step 1, distances at every zone band midpoint).
Response: a grid of cells `{ weight_lb, distance_miles, zone_usps, zone_private, winner: {carrier, service_id, total}, runner_up: {...}, saving, totals: Record<Carrier, number> }`
for the ground tier (FedEx Ground for business, Home Delivery for residential),
plus `breakeven_weight_lb: [{ distance_miles, zone_usps, zone_private, vs_ups, vs_fedex }]`
per distance band: the lightest grid weight at which the USPS total is >= the
rival's total, `null` when USPS wins at every weight. The default distances are
each USPS band's midpoint (rounded down) and, for the open last band, the
previous band's upper edge + 200 miles.

### GET /api/breakeven
Same response with the default grid; query parameters `residential`
(default true), `year`, `peak`, `usps_rate_card`.

### POST /api/blended  (question 3)
Request `{ parcels: Parcel[], controls: Controls, segment?: SegmentFilter }`.
Response per carrier: parcels shipped, blended cost per parcel, base vs
surcharge vs fuel split (absolute and share), surcharge breakdown by kind,
margin per parcel, share of parcels shipped at a loss, and the cheapest
carrier per parcel (a "best mix" row). Each parcel uses the cheapest service
of that carrier in the parcel's speed tier.

Shape: `BlendedResponse` in `backend/app/api/models.py`: `year`,
`parcels_considered`, `revenue_per_parcel`, `free_shipping` (null, or
`{threshold, parcels}` when `free_shipping_over` is set: how many parcels ship
free), `carriers[]` and `best_mix`. Each
carrier row (and `best_mix`) is a `Summary`: `parcels_shipped`,
`parcels_unavailable` (quantity no service of the carrier could carry),
`total_cost`, `cost_per_parcel`, `split.{base,surcharges,fuel}.{per_parcel,total,share}`,
`surcharges_by_condition[] {condition, total, per_parcel, share_of_cost}`,
`margin_per_parcel`, `total_margin`, `loss_share`, `parcels_at_loss`; carrier
rows add `carrier` and `services_used` (service_id -> parcels), `best_mix`
adds `parcels_by_carrier`. Everything is weighted by `quantity`.

### POST /api/yearly  (question 4)
Request `{ parcels: Parcel[], controls: Controls, next_year_increase_percent?: number, next_year_override?: boolean }`.
Response per carrier and year: blended cost per parcel under that year's
prices and rules, the year-over-year change, the carrier's announced average
increase for comparison, and the driver breakdown: for each parcel segment
(weight band, zone band, residential, speed), its contribution to the change
in dollars per parcel. Each carrier also gets a projected next year: the year
after its latest price list, at the increase the carrier announced for that
year when the data has one (`basis: "announced"`), otherwise at
`next_year_increase_percent` (`"assumed"`); with `next_year_override: true`
the percentage applies to every carrier (`"override"`). No announcement and no
percentage: `projected` is null.

Rules: each year is priced at its own base-rate effective date per carrier
(December 10 of that year when `peak`); `controls.as_of` and `controls.year`
are ignored. `fuel_override_percent` applies to every year. Only parcels the
carrier can ship in every one of its years are compared (`parcels_used`,
`parcels_excluded`). Years a carrier lacks are absent.

Shape: `YearlyResponse` in `backend/app/api/models.py`: `carriers[] {carrier,
parcels_used, parcels_excluded, years[], projected}`; `projected` is
`{year, increase_percent, cost_per_parcel, basis, announced_percent,
source_type, source_files}` or `null` (`announced_percent` is the carrier's own
figure for that year whatever the basis, null when none). Each year row:
`year`, `as_of`, `cost_per_parcel`, `summary` (the blended `Summary`),
`services_used`, `change_vs_previous {from_year, dollars_per_parcel, percent}`
(null for the first year), `announced_increase {percent, basis, services,
source_type}` where `basis` is `"all"` (the carrier-wide row), 
`"average_of_services"` (plain average of the rows for the services used,
listed in `services`) or `"none"`, `drivers` (per dimension a list of
`{segment, parcels, change_per_parcel, change_total}`; the rounded
`change_per_parcel` values add up exactly to the rounded change), `fuel`
(`{ground, express}` each `{default_percent, is_proxy, applied_percent}`, null
for USPS) and `warnings` (e.g. a surcharge kind present the year before but
with no rules recorded this year).

### Segments
`SegmentFilter = { weight_band?: string, zone_band?: string, residential?: boolean, speed?: Tier }`.
Weight bands: `≤1`, `1–5`, `5–10`, `10–20`, `20–70` lb. Zone bands: `1–2`, `3–4`, `5–6`, `7–8`.

## Engine rules the endpoints share

- **Zone** from `data/processed/zone_from_distance.csv` per carrier: the band
  whose `min_miles <= distance <= max_miles`.
- **Billable weight** per carrier and `as_of` from `dim_weight.csv`: dimensions
  rounded per the row's rounding rule, dimensional weight = volume / divisor
  rounded up, only when volume exceeds `min_volume_cuin`; billable = max(actual
  rounded up to the next weight step, dimensional). The row is the one whose
  window contains `as_of`. Weight steps are the service's own table steps, so
  USPS Ground Advantage keeps its ounce steps under 1 lb (and the USPS commercial
  Priority Mail cards their 0.5 lb step). UPS and FedEx tables run to 150 lb,
  USPS to 70 lb; a billable weight above the heaviest step makes the service
  unavailable; USPS caps dimensional weight at 70 lb as its dim_weight row states.
- **Minimum billable weight**: when an applied surcharge rule carries
  `min_billable_weight_lb` (UPS Large Package, FedEx Oversize: 90 lb), billable
  weight is raised to it, the base is priced at that step and the surcharges
  are matched again; the quote's `billable_weight_lb` shows the raised weight
  and the base line item's label says "billed at the 90 lb minimum of the …".
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
  carrier, or `controls.as_of` when given. With `peak: true` it is December 10
  of the year (overriding `controls.as_of`), inside every carrier's peak window
  for which peak rows are recorded. `as_of` therefore also selects time-varying rules such
  as the USPS dimensional divisor (166 until 2026-07-11, 139 after) and the
  2026 USPS 8 % transportation increase.
- **Cheapest per tier**: among available services of the tier, lowest total.
- **Thresholds, windows and peak add-ons**: see "Matching rules" in
  `docs/data/SCHEMA.md` (bands inclusive on billable weight, a lone minimum weight
  strict on actual weight, dimensions strict, `effective_to` inclusive, peak
  add-ons only on top of the charge they add to).
- The engine never hardcodes an amount; every number comes from
  `data/processed/`.

## Errors
422 with `{ detail: [{ loc, msg }] }` for invalid input (Pydantic default),
with messages written for the shop owner, e.g. "weight_lb must be at most 70";
each entry also carries the Pydantic error `type`. Errors inside a parcel list
are prefixed "Parcel N: ". Real request/response pairs for every endpoint are
in `docs/api-examples/`, regenerated by `backend/scripts/export_api_examples.py`.
