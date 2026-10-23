/**
 * Types mirroring docs/API.md. Keep in sync with backend/app/api/models.py.
 *
 * Shared types and request bodies are copied verbatim from the contract.
 * Response shapes for /meta, /sample-parcels, /breakeven, /blended and /yearly
 * are described only in prose in docs/API.md; the shapes below are the
 * frontend's reading of that prose. Fields marked "CONTRACT GAP" are the
 * places the contract should pin down (see the issue #4 report).
 */

export type Carrier = "usps" | "ups" | "fedex";
export type Tier = "ground" | "two_three_day" | "next_day";
export type DeliveryArea = "none" | "das" | "extended";
export type UspsRateCard = "commercial" | "retail";
export type FuelGroup = "ground" | "express";

export const CARRIERS: readonly Carrier[] = ["usps", "ups", "fedex"] as const;
export const TIERS: readonly Tier[] = ["ground", "two_three_day", "next_day"] as const;
export const DELIVERY_AREAS: readonly DeliveryArea[] = ["none", "das", "extended"] as const;

export interface Parcel {
  weight_lb: number; // > 0, <= 70
  length_in?: number; // all three or none; > 0
  width_in?: number;
  height_in?: number;
  distance_miles: number; // >= 0
  residential: boolean;
  speed: Tier;
  quantity?: number; // default 1, integer >= 1
  price_charged?: number; // overrides Controls.flat_price for this row
  delivery_area?: DeliveryArea; // default "none"
  nonstandard_packaging?: boolean; // default false
}

export interface Controls {
  year: number;
  as_of?: string; // ISO date
  usps_rate_card: UspsRateCard;
  fuel_override_percent?: { ground?: number; express?: number };
  peak: boolean;
  flat_price: number;
}

export interface LineItem {
  kind: "base" | "surcharge" | "fuel";
  label: string;
  amount: number;
  surcharge_id?: string;
  source?: string;
}

export interface Quote {
  carrier: Carrier;
  service_id: string;
  service_name: string;
  tier: Tier;
  zone: number;
  billable_weight_lb: number;
  dim_weight_lb: number | null;
  line_items: LineItem[];
  total: number;
  margin: number;
  available: boolean;
  unavailable_reason?: string;
}

/* ---------- GET /api/meta ---------- */

export interface ServiceInfo {
  carrier: Carrier;
  service_id: string;
  display_name: string;
  tier: Tier;
  residential_allowed: boolean;
  business_allowed: boolean;
}

/** One row of fuel_surcharge.csv. USPS has none. */
export interface FuelDefault {
  carrier: Carrier;
  year: number;
  service_group: FuelGroup;
  default_percent: number;
  is_proxy: boolean; // UPS uses FedEx history as a proxy
}

export interface ZoneBand {
  carrier: Carrier;
  zone: number;
  min_miles: number;
  max_miles: number | null; // null = open-ended (zone 8)
}

export interface Meta {
  /** Years with base rates, per carrier (UPS has no 2027). */
  years: Record<Carrier, number[]>;
  services: ServiceInfo[];
  default_controls: Controls;
  fuel_defaults: FuelDefault[];
  zone_bands: ZoneBand[];
  /** Paragraphs shown in the footer. CONTRACT GAP: string vs string[]. */
  limitations: string[];
}

/* ---------- GET /api/sample-parcels ---------- */

/** CONTRACT GAP: the contract says "Parcel[] with a description"; an array cannot carry one. */
export interface SampleParcels {
  description: string;
  parcels: Parcel[];
}

/* ---------- POST /api/quote ---------- */

export interface QuoteRequest {
  parcel: Parcel;
  controls: Controls;
}

export interface CarrierPick {
  carrier: Carrier;
  service_id: string;
  total: number;
}

export interface QuoteResponse {
  quotes: Quote[];
  /** CONTRACT GAP: a tier with no available service; modelled as null. */
  cheapest_by_tier: Record<Tier, CarrierPick | null>;
}

/* ---------- POST /api/breakeven ---------- */

export interface BreakevenRequest {
  controls: Controls;
  residential: boolean;
  weights_lb?: number[];
  distances_miles?: number[];
}

export interface BreakevenCell {
  weight_lb: number;
  distance_miles: number;
  zone_usps: number;
  zone_private: number;
  winner: CarrierPick;
  runner_up: CarrierPick;
  saving: number;
}

export interface BreakevenLine {
  distance_miles: number;
  /** Lightest weight at which USPS stops winning; null if it never does. */
  vs_ups_lb: number | null;
  vs_fedex_lb: number | null;
}

export interface BreakevenResponse {
  cells: BreakevenCell[];
  breakeven_weight_lb: BreakevenLine[];
}

/* ---------- POST /api/blended ---------- */

export type WeightBand = "≤1" | "1–5" | "5–10" | "10–20" | "20–70";
export type ZoneBandLabel = "1–2" | "3–4" | "5–6" | "7–8";
export const WEIGHT_BANDS: readonly WeightBand[] = ["≤1", "1–5", "5–10", "10–20", "20–70"] as const;
export const ZONE_BANDS: readonly ZoneBandLabel[] = ["1–2", "3–4", "5–6", "7–8"] as const;

export interface SegmentFilter {
  weight_band?: WeightBand;
  zone_band?: ZoneBandLabel;
  residential?: boolean;
  speed?: Tier;
}

export interface BlendedRequest {
  parcels: Parcel[];
  controls: Controls;
  segment?: SegmentFilter;
}

export interface CostSplit {
  base: number;
  surcharges: number;
  fuel: number;
}

export interface SurchargeShare {
  label: string;
  surcharge_id?: string;
  amount_per_parcel: number;
  share: number; // 0..1 of the blended cost
}

export interface BlendedCarrier {
  carrier: Carrier | "best_mix";
  parcels_shipped: number; // sum of quantity
  /** CONTRACT GAP: parcels the carrier cannot carry in the tier, excluded from the average. */
  parcels_unavailable: number;
  cost_per_parcel: number;
  split_per_parcel: CostSplit;
  split_share: CostSplit; // 0..1
  surcharge_breakdown: SurchargeShare[];
  margin_per_parcel: number;
  loss_share: number; // 0..1 of parcels shipped at a loss
}

export interface BlendedResponse {
  carriers: BlendedCarrier[]; // usps, ups, fedex, best_mix
  /** best_mix only: how many parcels each carrier takes. */
  best_mix_counts?: Partial<Record<Carrier, number>>;
}

/* ---------- POST /api/yearly ---------- */

export interface YearlyRequest {
  parcels: Parcel[];
  controls: Controls;
  next_year_increase_percent?: number;
}

export interface YearPoint {
  year: number;
  cost_per_parcel: number | null; // null when the carrier has no prices that year
  change_percent: number | null;
  /** CONTRACT GAP: USPS announces per service; the backend should collapse to one number. */
  announced_increase_percent: number | null;
  announced_source: "primary" | "secondary" | null;
  projected?: boolean;
}

export interface YearlyCarrier {
  carrier: Carrier;
  points: YearPoint[];
}

export interface DriverContribution {
  dimension: "weight_band" | "zone_band" | "residential" | "speed";
  band: string;
  contribution_per_parcel: number;
}

export interface YearlyDriver {
  carrier: Carrier;
  from_year: number;
  to_year: number;
  contributions: DriverContribution[];
}

export interface YearlyResponse {
  carriers: YearlyCarrier[];
  drivers: YearlyDriver[];
}

/* ---------- Errors ---------- */

export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type?: string;
}

export interface ValidationErrorBody {
  /** Pydantic default is an array; FastAPI HTTPException gives a string. */
  detail: ValidationIssue[] | string;
}
