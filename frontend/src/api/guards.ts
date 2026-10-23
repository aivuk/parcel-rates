/**
 * Hand-written runtime guards for the API responses, one per type in ./types.ts.
 * Objects are checked exactly (unknown or missing keys fail), like the backend's
 * `extra="forbid"`, so contract drift on either side fails src/api/contract.test.ts.
 */
import type {
  BlendedResponse,
  BreakevenResponse,
  HealthResponse,
  Meta,
  QuoteResponse,
  SampleParcels,
  ValidationErrorBody,
  YearlyResponse,
} from "./types";
import { CARRIERS, DELIVERY_AREAS, TIERS } from "./types";

export class ContractError extends Error {
  /** Path of the offending field inside the body, e.g. ".quotes[0].carrier" ("" = the body itself). */
  readonly path: string;
  readonly expected: string;

  constructor(path: string, expected: string, got: unknown) {
    super(`${path || "(root)"}: expected ${expected}, got ${JSON.stringify(got)?.slice(0, 80)}`);
    this.name = "ContractError";
    this.path = path;
    this.expected = expected;
  }
}

type Check = (v: unknown, path: string) => void;

const num: Check = (v, p) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ContractError(p, "number", v);
};
const int: Check = (v, p) => {
  if (!Number.isInteger(v)) throw new ContractError(p, "integer", v);
};
const str: Check = (v, p) => {
  if (typeof v !== "string") throw new ContractError(p, "string", v);
};
const bool: Check = (v, p) => {
  if (typeof v !== "boolean") throw new ContractError(p, "boolean", v);
};
const isoDate: Check = (v, p) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ContractError(p, "ISO date", v);
};
const lit =
  (...values: readonly unknown[]): Check =>
  (v, p) => {
    if (!values.includes(v)) throw new ContractError(p, `one of ${values.join("|")}`, v);
  };
const nullable =
  (c: Check): Check =>
  (v, p) => {
    if (v !== null) c(v, p);
  };
const arr =
  (c: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) throw new ContractError(p, "array", v);
    v.forEach((x, i) => c(x, `${p}[${i}]`));
  };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const obj =
  (shape: Record<string, Check>): Check =>
  (v, p) => {
    if (!isObj(v)) throw new ContractError(p, "object", v);
    for (const k of Object.keys(v)) if (!(k in shape)) throw new ContractError(`${p}.${k}`, "no such key", v[k]);
    for (const [k, c] of Object.entries(shape)) {
      if (!(k in v)) throw new ContractError(`${p}.${k}`, "key present", undefined);
      c(v[k], `${p}.${k}`);
    }
  };
/** Object with an open key set; `key` checks each key. */
const record =
  (key: Check, value: Check): Check =>
  (v, p) => {
    if (!isObj(v)) throw new ContractError(p, "object", v);
    for (const [k, x] of Object.entries(v)) {
      key(k, `${p}{key}`);
      value(x, `${p}.${k}`);
    }
  };
/**
 * Object keyed by a fixed set: unknown keys fail; with `required`, every key must be present.
 * Use `required` only where the backend always fills every key (cheapest_by_tier); maps such as
 * breakeven `totals` hold only the carriers that publish the year (2027: FedEx only).
 */
const closedRecord =
  (keys: readonly string[], value: Check, { required }: { required: boolean }): Check =>
  (v, p) => {
    if (!isObj(v)) throw new ContractError(p, "object", v);
    for (const k of Object.keys(v)) if (!keys.includes(k)) throw new ContractError(`${p}.${k}`, `a key in ${keys.join("|")}`, v[k]);
    for (const k of keys) {
      if (k in v) value(v[k], `${p}.${k}`);
      else if (required) throw new ContractError(`${p}.${k}`, "key present", undefined);
    }
  };
const extend = (base: Record<string, Check>, more: Record<string, Check>) => obj({ ...base, ...more });

const carrier = lit(...CARRIERS);
const tier = lit(...TIERS);
/** Keyed by carrier; only the carriers that apply are present. */
const byCarrier = (value: Check) => closedRecord(CARRIERS, value, { required: false });

/** A breakeven cell; its winner and runner-up must be among the carriers it has totals for. */
const breakevenCell: Check = (v, p) => {
  obj({
    weight_lb: num,
    distance_miles: num,
    zone_usps: nullable(int),
    zone_private: nullable(int),
    winner: nullable(pick),
    runner_up: nullable(pick),
    saving: num,
    totals: byCarrier(num),
  })(v, p);
  const cell = v as { winner: { carrier: string } | null; runner_up: { carrier: string } | null; totals: object };
  for (const role of ["winner", "runner_up"] as const) {
    const c = cell[role]?.carrier;
    if (c !== undefined && !(c in cell.totals)) throw new ContractError(`${p}.${role}.carrier`, "a carrier listed in totals", c);
  }
};

const parcelOut = obj({
  weight_lb: num,
  length_in: nullable(num),
  width_in: nullable(num),
  height_in: nullable(num),
  distance_miles: nullable(num),
  residential: bool,
  speed: tier,
  quantity: int,
  price_charged: nullable(num),
  delivery_area: lit(...DELIVERY_AREAS),
  nonstandard_packaging: bool,
  order_value: nullable(num),
  origin_zip: nullable(str),
  destination_zip: nullable(str),
});

const pick = obj({ carrier, service_id: str, total: num });

const lineItem = obj({
  kind: lit("base", "surcharge", "fuel"),
  label: str,
  amount: num,
  surcharge_id: nullable(str),
  source: nullable(str),
  condition: nullable(str),
});

const quote = obj({
  carrier,
  service_id: str,
  service_name: str,
  tier,
  zone: nullable(int),
  billable_weight_lb: nullable(num),
  dim_weight_lb: nullable(num),
  line_items: arr(lineItem),
  total: num,
  margin: num,
  available: bool,
  unavailable_reason: nullable(str),
  as_of: nullable(isoDate),
  zone_source: lit("usps_chart", "zip_distance", "distance"),
});

const splitPart = obj({ per_parcel: num, total: num, share: num });
const summaryShape: Record<string, Check> = {
  parcels_shipped: int,
  parcels_unavailable: int,
  total_cost: num,
  cost_per_parcel: num,
  split: obj({ base: splitPart, surcharges: splitPart, fuel: splitPart }),
  surcharges_by_condition: arr(obj({ condition: str, total: num, per_parcel: num, share_of_cost: num })),
  margin_per_parcel: num,
  total_margin: num,
  loss_share: num,
  parcels_at_loss: int,
};

const driver = obj({ segment: str, parcels: int, change_per_parcel: num, change_total: num });
const fuelGroupUsed = obj({ default_percent: nullable(num), is_proxy: nullable(bool), applied_percent: nullable(num) });

const checks = {
  health: obj({ status: lit("ok") }),
  meta: obj({
    years: byCarrier(arr(int)),
    services: arr(
      obj({
        carrier,
        service_id: str,
        display_name: str,
        tier,
        residential_allowed: bool,
        business_allowed: bool,
        rate_cards: arr(str),
        rate_card_notes: str,
        max_weight_lb: int,
        notes: str,
      }),
    ),
    defaults: obj({
      year: int,
      usps_rate_card: lit("commercial", "retail"),
      peak: bool,
      flat_price: num,
      as_of: byCarrier(isoDate),
    }),
    fuel_defaults: arr(
      obj({
        carrier,
        year: int,
        service_group: lit("ground", "express"),
        default_percent: num,
        is_proxy: bool,
        window_start: nullable(isoDate),
        window_end: nullable(isoDate),
      }),
    ),
    zone_bands: arr(obj({ carrier, zone: int, min_miles: int, max_miles: nullable(int) })),
    segments: obj({ weight_bands: arr(str), zone_bands: arr(str) }),
    limitations: arr(str),
    zip_zones: nullable(obj({ usps_effective_date: str, usps_origins: int, zip_points: int })),
  }),
  sampleParcels: obj({ description: str, parcels: arr(parcelOut) }),
  quote: obj({ distance_miles: num, quotes: arr(quote), cheapest_by_tier: closedRecord(TIERS, nullable(pick), { required: true }) }),
  breakeven: obj({
    year: int,
    residential: bool,
    weights_lb: arr(num),
    distances_miles: arr(num),
    cells: arr(breakevenCell),
    breakeven_weight_lb: arr(
      obj({
        distance_miles: num,
        zone_usps: nullable(int),
        zone_private: nullable(int),
        vs_ups: nullable(num),
        vs_fedex: nullable(num),
      }),
    ),
  }),
  blended: obj({
    year: int,
    parcels_considered: int,
    revenue_per_parcel: num,
    free_shipping: nullable(obj({ threshold: num, parcels: int })),
    carriers: arr(extend(summaryShape, { carrier, services_used: record(str, int) })),
    best_mix: extend(summaryShape, { parcels_by_carrier: byCarrier(int) }),
  }),
  yearly: obj({
    carriers: arr(
      obj({
        carrier,
        parcels_used: int,
        parcels_excluded: int,
        years: arr(
          obj({
            year: int,
            as_of: nullable(isoDate),
            cost_per_parcel: num,
            summary: obj(summaryShape),
            services_used: arr(str),
            change_vs_previous: nullable(obj({ from_year: int, dollars_per_parcel: num, percent: nullable(num) })),
            announced_increase: obj({
              percent: nullable(num),
              basis: lit("all", "average_of_services", "none"),
              services: arr(str),
              source_type: nullable(str),
            }),
            drivers: nullable(
              obj({ weight_band: arr(driver), zone_band: arr(driver), residential: arr(driver), speed: arr(driver) }),
            ),
            fuel: nullable(obj({ ground: fuelGroupUsed, express: fuelGroupUsed })),
            warnings: arr(str),
          }),
        ),
        projected: nullable(
          obj({
            year: int,
            increase_percent: num,
            cost_per_parcel: num,
            basis: lit("announced", "assumed", "override"),
            announced_percent: nullable(num),
            source_type: nullable(str),
            source_files: arr(str),
          }),
        ),
      }),
    ),
    next_year_default_percent: nullable(num),
  }),
  validationError: obj({
    detail: arr(obj({ loc: arr((v, p) => (typeof v === "number" ? int(v, p) : str(v, p))), msg: str, type: str })),
  }),
} satisfies Record<string, Check>;

function guard<T>(check: Check) {
  return (v: unknown): T => {
    check(v, "");
    return v as T;
  };
}

export const asHealth = guard<HealthResponse>(checks.health);
export const asMeta = guard<Meta>(checks.meta);
export const asSampleParcels = guard<SampleParcels>(checks.sampleParcels);
export const asQuoteResponse = guard<QuoteResponse>(checks.quote);
export const asBreakevenResponse = guard<BreakevenResponse>(checks.breakeven);
export const asBlendedResponse = guard<BlendedResponse>(checks.blended);
export const asYearlyResponse = guard<YearlyResponse>(checks.yearly);
export const asValidationError = guard<ValidationErrorBody>(checks.validationError);

