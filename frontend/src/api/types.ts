/**
 * Types mirroring docs/API.md and backend/app/api/models.py (branch issue-3-engine-api).
 * Keep in sync: src/api/contract.test.ts validates every example payload in
 * src/api/__fixtures__/ against the guards in ./guards.ts, which follow these types.
 *
 * Request types follow the Pydantic request models (fields with a server default are optional).
 * Response types follow the response models, which use `extra="forbid"` and serialize
 * missing optionals as `null`, not as absent keys.
 */

export type Carrier = "usps" | "ups" | "fedex";
export type Tier = "ground" | "two_three_day" | "next_day";
export type DeliveryArea = "none" | "das" | "extended";
export type UspsRateCard = "commercial" | "retail";
export type FuelGroup = "ground" | "express";
export type WeightBand = "≤1" | "1–5" | "5–10" | "10–20" | "20–70";
export type ZoneBandLabel = "1–2" | "3–4" | "5–6" | "7–8";

export const CARRIERS: readonly Carrier[] = ["usps", "ups", "fedex"] as const;
export const TIERS: readonly Tier[] = ["ground", "two_three_day", "next_day"] as const;
export const DELIVERY_AREAS: readonly DeliveryArea[] = ["none", "das", "extended"] as const;
export const WEIGHT_BANDS: readonly WeightBand[] = ["≤1", "1–5", "5–10", "10–20", "20–70"] as const;
export const ZONE_BANDS: readonly ZoneBandLabel[] = ["1–2", "3–4", "5–6", "7–8"] as const;

/* ---------- requests ---------- */

/** A parcel as the frontend sends it (absent = server default). */
export interface Parcel {
  weight_lb: number; // > 0, <= 70
  length_in?: number; // all three or none; > 0
  width_in?: number;
  height_in?: number;
  distance_miles?: number; // >= 0; needed unless destination_zip is given
  residential: boolean;
  speed: Tier;
  quantity?: number; // default 1, integer >= 1
  price_charged?: number; // overrides Controls.flat_price for this row
  delivery_area?: DeliveryArea; // default "none"
  nonstandard_packaging?: boolean; // default false
  order_value?: number; // >= 0; value of the order, for Controls.free_shipping_over
  origin_zip?: string; // 5-digit ZIP; default Controls.origin_zip
  destination_zip?: string; // 5-digit ZIP; with an origin, sets the zones (USPS chart, UPS/FedEx estimated)
}

/** A parcel as the server returns it (GET /sample-parcels): every key present, optionals null. */
export interface ParcelOut {
  weight_lb: number;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  distance_miles: number | null;
  residential: boolean;
  speed: Tier;
  quantity: number;
  price_charged: number | null;
  delivery_area: DeliveryArea;
  nonstandard_packaging: boolean;
  order_value: number | null;
  origin_zip: string | null;
  destination_zip: string | null;
}

export interface FuelOverride {
  ground?: number | null; // 0..100
  express?: number | null;
}

export interface Controls {
  year?: number | null; // null/absent: latest year with all three carriers
  as_of?: string | null; // ISO date
  usps_rate_card?: UspsRateCard; // default "commercial"
  fuel_override_percent?: FuelOverride | null;
  peak?: boolean; // default false
  flat_price?: number; // default 9.99
  free_shipping_over?: number | null; // free shipping on orders of this value or more; absent/null: no rule
  origin_zip?: string | null; // where the shop ships from (5-digit ZIP)
}

export interface SegmentFilter {
  weight_band?: WeightBand | null;
  zone_band?: ZoneBandLabel | null;
  residential?: boolean | null;
  speed?: Tier | null;
}

export interface QuoteRequest {
  parcel: Parcel;
  controls?: Controls;
}

export interface BreakevenRequest {
  controls?: Controls;
  residential?: boolean; // default true
  weights_lb?: number[] | null; // 1..200 values, each in (0, 70]
  distances_miles?: number[] | null; // 1..50 values, each >= 0
}

export interface BlendedRequest {
  parcels: Parcel[]; // 1..10,000
  controls?: Controls;
  segment?: SegmentFilter | null;
}

export interface YearlyRequest {
  parcels: Parcel[]; // 1..10,000
  controls?: Controls;
  next_year_increase_percent?: number | null; // -50..100; the assumption for carriers that have not announced
  next_year_override?: boolean; // default false; true applies the percentage to every carrier
}

/* ---------- shared response pieces ---------- */

export interface LineItem {
  kind: "base" | "surcharge" | "fuel";
  label: string;
  amount: number;
  surcharge_id: string | null;
  source: string | null; // "file p.N" for display
  condition: string | null; // surcharges.csv condition, for grouping
}

/** An unavailable quote has line_items [], total 0, margin 0, and null zone/weights. Check `available`. */
export interface Quote {
  carrier: Carrier;
  service_id: string;
  service_name: string;
  tier: Tier;
  zone: number | null;
  billable_weight_lb: number | null;
  dim_weight_lb: number | null;
  line_items: LineItem[];
  total: number;
  margin: number;
  available: boolean;
  unavailable_reason: string | null;
  as_of: string | null;
  /** usps_chart: the USPS zone chart; zip_distance: estimated from the ZIPs' distance; distance: typed miles. */
  zone_source: ZoneSource;
}

export type ZoneSource = "usps_chart" | "zip_distance" | "distance";

export interface CarrierPick {
  carrier: Carrier;
  service_id: string;
  total: number;
}

/* ---------- GET /api/health ---------- */

export interface HealthResponse {
  status: "ok";
}

/* ---------- GET /api/meta ---------- */

export interface ServiceInfo {
  carrier: Carrier;
  service_id: string;
  display_name: string;
  tier: Tier;
  residential_allowed: boolean;
  business_allowed: boolean;
  rate_cards: string[];
  rate_card_notes: string;
  max_weight_lb: number;
  notes: string;
}

export interface FuelDefault {
  carrier: Carrier;
  year: number;
  service_group: FuelGroup;
  default_percent: number;
  is_proxy: boolean;
  window_start: string | null;
  window_end: string | null;
}

export interface ZoneBand {
  carrier: Carrier;
  zone: number;
  min_miles: number;
  max_miles: number | null; // null = open-ended
}

export interface MetaDefaults {
  year: number;
  usps_rate_card: UspsRateCard;
  peak: boolean;
  flat_price: number;
  as_of: Partial<Record<Carrier, string>>;
}

export interface Meta {
  years: Partial<Record<Carrier, number[]>>;
  services: ServiceInfo[];
  defaults: MetaDefaults;
  fuel_defaults: FuelDefault[];
  zone_bands: ZoneBand[];
  segments: { weight_bands: string[]; zone_bands: string[] };
  limitations: string[];
  /** ZIP data on the server (issue #9); null: distances must be typed. */
  zip_zones: { usps_effective_date: string; usps_origins: number; zip_points: number } | null;
}

/* ---------- GET /api/sample-parcels ---------- */

export interface SampleParcels {
  description: string;
  parcels: ParcelOut[];
}

/* ---------- POST /api/quote ---------- */

export interface QuoteResponse {
  /** Typed, or between the two ZIPs' Census points. */
  distance_miles: number;
  quotes: Quote[];
  /** Always all three tiers; null when no service of the tier can carry the parcel. */
  cheapest_by_tier: Record<Tier, CarrierPick | null>;
}

/* ---------- POST|GET /api/breakeven ---------- */

export interface BreakevenCell {
  weight_lb: number;
  distance_miles: number;
  zone_usps: number | null;
  zone_private: number | null;
  winner: CarrierPick | null;
  runner_up: CarrierPick | null;
  saving: number;
  /** Only carriers that publish the year and can carry the parcel (2027: FedEx only). */
  totals: Partial<Record<Carrier, number>>;
}

/** Lightest grid weight at which USPS is >= the rival; null when USPS wins at every weight. */
export interface BreakevenBand {
  distance_miles: number;
  zone_usps: number | null;
  zone_private: number | null;
  vs_ups: number | null;
  vs_fedex: number | null;
}

export interface BreakevenResponse {
  year: number;
  residential: boolean;
  weights_lb: number[];
  distances_miles: number[];
  cells: BreakevenCell[];
  breakeven_weight_lb: BreakevenBand[];
}

/* ---------- POST /api/blended ---------- */

export interface SplitPart {
  per_parcel: number;
  total: number;
  share: number; // 0..1
}

export interface Split {
  base: SplitPart;
  surcharges: SplitPart;
  fuel: SplitPart;
}

export interface ConditionTotal {
  condition: string;
  total: number;
  per_parcel: number;
  share_of_cost: number;
}

/** Everything weighted by quantity. */
export interface Summary {
  parcels_shipped: number;
  parcels_unavailable: number;
  total_cost: number;
  cost_per_parcel: number;
  split: Split;
  surcharges_by_condition: ConditionTotal[];
  margin_per_parcel: number;
  total_margin: number;
  loss_share: number; // 0..1
  parcels_at_loss: number;
}

export interface CarrierBlended extends Summary {
  carrier: Carrier;
  services_used: Record<string, number>; // service_id -> parcels
}

export interface BestMix extends Summary {
  parcels_by_carrier: Record<string, number>;
}

export interface BlendedResponse {
  year: number;
  parcels_considered: number;
  revenue_per_parcel: number;
  /** Present when Controls.free_shipping_over is set: parcels whose order reaches it. */
  free_shipping: { threshold: number; parcels: number } | null;
  carriers: CarrierBlended[];
  best_mix: BestMix;
}

/* ---------- POST /api/yearly ---------- */

export interface Change {
  from_year: number;
  dollars_per_parcel: number;
  percent: number | null;
}

export interface Announced {
  percent: number | null;
  basis: "all" | "average_of_services" | "none";
  services: string[];
  source_type: string | null; // "primary" | "secondary"
}

export interface Driver {
  segment: string;
  parcels: number;
  change_per_parcel: number;
  change_total: number;
}

export interface Drivers {
  weight_band: Driver[];
  zone_band: Driver[];
  residential: Driver[];
  speed: Driver[];
}

export interface FuelGroupUsed {
  default_percent: number | null;
  is_proxy: boolean | null;
  applied_percent: number | null;
}

export interface YearRow {
  year: number;
  as_of: string | null;
  cost_per_parcel: number;
  summary: Summary;
  services_used: string[];
  change_vs_previous: Change | null; // null for the first year
  announced_increase: Announced;
  drivers: Drivers | null;
  fuel: { ground: FuelGroupUsed; express: FuelGroupUsed } | null; // null for USPS
  warnings: string[];
}

export interface Projection {
  year: number; // the year after this carrier's latest price list
  increase_percent: number;
  cost_per_parcel: number;
  /** announced: the carrier's own figure for that year; assumed: the request's percentage; override: forced. */
  basis: "announced" | "assumed" | "override";
  announced_percent: number | null; // the carrier's own figure for that year, whatever the basis
  source_type: string | null;
  source_files: string[];
}

export interface CarrierYears {
  carrier: Carrier;
  parcels_used: number;
  parcels_excluded: number;
  years: YearRow[];
  projected: Projection | null;
}

export interface YearlyResponse {
  carriers: CarrierYears[];
}

/* ---------- errors ---------- */

/** One entry of a 422 body, as backend/app/api/errors.py writes it: always loc, msg and type. */
export interface ValidationIssue {
  loc: (string | number)[];
  msg: string; // written for the shop owner; parcel-list errors start "Parcel N: "
  type: string; // the Pydantic error type, e.g. "less_than_equal"
}

/** 422 body. */
export interface ValidationErrorBody {
  detail: ValidationIssue[];
}

/** FastAPI's own errors (404, 405) carry a plain string; the client accepts both. */
export interface HttpErrorBody {
  detail: string;
}
