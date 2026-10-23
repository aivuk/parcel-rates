import type { FuelGroup, MetaDefaults, UspsRateCard } from "../api/types";

/**
 * The controls as the UI holds them: every field resolved. Assignable to the request
 * type `Controls`, which leaves fields with a server default optional.
 */
export interface ControlsState {
  year: number;
  usps_rate_card: UspsRateCard;
  peak: boolean;
  flat_price: number;
  fuel_override_percent?: { ground?: number; express?: number };
  /** Free shipping on orders of this value or more; absent: no such rule. */
  free_shipping_over?: number;
}

export function controlsFromMeta(d: MetaDefaults): ControlsState {
  return { year: d.year, usps_rate_card: d.usps_rate_card, peak: d.peak, flat_price: d.flat_price };
}

export const VIEWS = ["quote", "breakeven", "blended", "yearly"] as const;
export type ViewId = (typeof VIEWS)[number];

export interface AppState {
  controls: ControlsState;
  view: ViewId;
}

export const FALLBACK_CONTROLS: ControlsState = {
  year: 2026,
  usps_rate_card: "commercial",
  peak: false,
  flat_price: 9.99,
};

export const FUEL_MIN = 0;
export const FUEL_MAX = 40;
export const PRICE_MAX = 1000;
export const ORDER_VALUE_MAX = 100_000;

const KEYS = {
  year: "year",
  card: "usps",
  fuelGround: "fuel_ground",
  fuelExpress: "fuel_express",
  peak: "peak",
  price: "price",
  freeOver: "free_over",
  view: "view",
} as const;

/** Params the app owns; anything else in the query string (e.g. mock=1) is preserved. */
const OWNED = new Set<string>(Object.values(KEYS));

function num(params: URLSearchParams, key: string, min: number, max: number): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

export function readState(search: string, defaults: ControlsState = FALLBACK_CONTROLS): AppState {
  const params = new URLSearchParams(search);
  const year = num(params, KEYS.year, 2000, 2100);
  const card = params.get(KEYS.card);
  const ground = num(params, KEYS.fuelGround, FUEL_MIN, FUEL_MAX);
  const express = num(params, KEYS.fuelExpress, FUEL_MIN, FUEL_MAX);
  const price = num(params, KEYS.price, 0, PRICE_MAX);
  const freeOver = num(params, KEYS.freeOver, 0, ORDER_VALUE_MAX);
  const view = params.get(KEYS.view);
  const fuel: Partial<Record<FuelGroup, number>> = {
    ...(ground !== undefined ? { ground } : {}),
    ...(express !== undefined ? { express } : {}),
  };
  const controls: ControlsState = {
    year: year !== undefined && Number.isInteger(year) ? year : defaults.year,
    usps_rate_card: card === "retail" || card === "commercial" ? card : defaults.usps_rate_card,
    peak: params.has(KEYS.peak) ? params.get(KEYS.peak) === "1" : defaults.peak,
    flat_price: price ?? defaults.flat_price,
    ...(Object.keys(fuel).length > 0 ? { fuel_override_percent: fuel } : {}),
    ...(freeOver !== undefined ? { free_shipping_over: freeOver } : {}),
  };
  return { controls, view: (VIEWS as readonly string[]).includes(view ?? "") ? (view as ViewId) : "quote" };
}

/** Serialize, leaving out values equal to the defaults so shared links stay short. */
export function writeState(state: AppState, currentSearch = "", defaults: ControlsState = FALLBACK_CONTROLS): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of OWNED) params.delete(key);
  const c = state.controls;
  if (c.year !== defaults.year) params.set(KEYS.year, String(c.year));
  if (c.usps_rate_card !== defaults.usps_rate_card) params.set(KEYS.card, c.usps_rate_card);
  if (c.fuel_override_percent?.ground !== undefined) params.set(KEYS.fuelGround, String(c.fuel_override_percent.ground));
  if (c.fuel_override_percent?.express !== undefined) params.set(KEYS.fuelExpress, String(c.fuel_override_percent.express));
  if (c.peak !== defaults.peak) params.set(KEYS.peak, c.peak ? "1" : "0");
  if (c.flat_price !== defaults.flat_price) params.set(KEYS.price, String(c.flat_price));
  if (c.free_shipping_over !== undefined) params.set(KEYS.freeOver, String(c.free_shipping_over));
  if (state.view !== "quote") params.set(KEYS.view, state.view);
  const out = params.toString();
  return out ? `?${out}` : "";
}

/* ---------- reducer ---------- */

export type Action =
  | { type: "year"; year: number }
  | { type: "card"; card: UspsRateCard }
  | { type: "fuel"; group: FuelGroup; percent: number }
  | { type: "fuelReset"; group: FuelGroup }
  | { type: "peak"; peak: boolean }
  | { type: "price"; price: number }
  | { type: "freeShipping"; over: number | null }
  | { type: "view"; view: ViewId }
  | { type: "replace"; state: AppState };

function withFuel(c: ControlsState, group: FuelGroup, percent: number | undefined): ControlsState {
  const { [group]: _dropped, ...rest } = c.fuel_override_percent ?? {};
  const next = percent === undefined ? rest : { ...rest, [group]: percent };
  const { fuel_override_percent: _old, ...base } = c;
  return Object.keys(next).length > 0 ? { ...base, fuel_override_percent: next } : base;
}

export function reducer(state: AppState, action: Action): AppState {
  const set = (controls: ControlsState): AppState => ({ ...state, controls });
  switch (action.type) {
    case "year":
      // A new year has its own fuel defaults; an override from another year would mislead.
      return set(withFuel(withFuel({ ...state.controls, year: action.year }, "ground", undefined), "express", undefined));
    case "card":
      return set({ ...state.controls, usps_rate_card: action.card });
    case "fuel":
      return set(withFuel(state.controls, action.group, Math.min(FUEL_MAX, Math.max(FUEL_MIN, action.percent))));
    case "fuelReset":
      return set(withFuel(state.controls, action.group, undefined));
    case "peak":
      return set({ ...state.controls, peak: action.peak });
    case "price":
      return set({ ...state.controls, flat_price: Math.min(PRICE_MAX, Math.max(0, action.price)) });
    case "freeShipping": {
      const { free_shipping_over: _old, ...rest } = state.controls;
      return set(action.over === null ? rest : { ...rest, free_shipping_over: Math.min(ORDER_VALUE_MAX, Math.max(0, action.over)) });
    }
    case "view":
      return { ...state, view: action.view };
    case "replace":
      return action.state;
  }
}
