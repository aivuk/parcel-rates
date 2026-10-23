/** Pure derivations for the Q4 year-over-year view. */
import type { Carrier, CarrierYears, Driver, Drivers, YearRow, YearlyResponse } from "../../api/types";
import { formatUsd } from "../../lib/format";
import { carrierName, signedPct, signedUsd, tierName } from "../blended/money";

export type Dimension = keyof Drivers;
export const DIMENSIONS: readonly Dimension[] = ["weight_band", "zone_band", "residential", "speed"];
export const DIMENSION_LABEL: Record<Dimension, string> = {
  weight_band: "Weight",
  zone_band: "Distance",
  residential: "Address",
  speed: "Speed",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Latest year every carrier with data publishes (2026 when FedEx alone has 2027). */
export function referenceYear(r: YearlyResponse): number | null {
  const sets = r.carriers.filter((c) => c.years.length > 0).map((c) => new Set(c.years.map((y) => y.year)));
  if (sets.length === 0) return null;
  const common = [...sets[0]!].filter((y) => sets.every((s) => s.has(y)));
  if (common.length) return Math.max(...common);
  return Math.max(...r.carriers.flatMap((c) => c.years.map((y) => y.year)));
}

export const rowFor = (c: CarrierYears, year: number) => c.years.find((y) => y.year === year) ?? null;

/** The carrier the owner would pick: cheapest per parcel in the reference year. */
export function pickCarrier(r: YearlyResponse, ref: number): CarrierYears | null {
  let best: CarrierYears | null = null;
  let bestCost = Infinity;
  for (const c of r.carriers) {
    const row = rowFor(c, ref);
    if (row && c.parcels_used > 0 && row.cost_per_parcel < bestCost) {
      best = c;
      bestCost = row.cost_per_parcel;
    }
  }
  return best;
}

export interface PeriodChange {
  fromYear: number;
  toYear: number;
  from: number;
  to: number;
  dollars: number;
  percent: number;
  /** Announced increases compounded over the same years; null when a year has none. */
  announcedPercent: number | null;
}

/** Change in cost per parcel from the carrier's first year to `toYear`, against the compounded announcements. */
export function periodChange(c: CarrierYears, toYear: number): PeriodChange | null {
  const first = c.years[0];
  const last = rowFor(c, toYear);
  if (!first || !last || last.year <= first.year || first.cost_per_parcel === 0) return null;
  let factor: number | null = 1;
  for (const y of c.years) {
    if (y.year <= first.year || y.year > toYear) continue;
    const p = y.announced_increase.percent;
    factor = p === null || factor === null ? null : factor * (1 + p / 100);
  }
  return {
    fromYear: first.year,
    toYear,
    from: first.cost_per_parcel,
    to: last.cost_per_parcel,
    dollars: round2(last.cost_per_parcel - first.cost_per_parcel),
    percent: ((last.cost_per_parcel - first.cost_per_parcel) / first.cost_per_parcel) * 100,
    announcedPercent: factor === null ? null : (factor - 1) * 100,
  };
}

/** Cost path if every year had risen exactly by the announced increase, from the first year's cost. */
export function announcedPath(c: CarrierYears): Map<number, number> {
  const out = new Map<number, number>();
  const first = c.years[0];
  if (!first) return out;
  let v = first.cost_per_parcel;
  out.set(first.year, v);
  for (const y of c.years.slice(1)) {
    const p = y.announced_increase.percent;
    if (p === null) break;
    v = v * (1 + p / 100);
    out.set(y.year, round2(v));
  }
  return out;
}

/** Default for the next-year slider: the pick carrier's latest announced increase. */
export function defaultIncrease(c: CarrierYears | null): number | null {
  if (!c) return null;
  for (let i = c.years.length - 1; i >= 0; i--) {
    const p = c.years[i]!.announced_increase.percent;
    if (p !== null) return p;
  }
  return null;
}

/* ---------- fuel ---------- */

export interface FuelStep {
  carrier: Carrier;
  fromYear: number;
  toYear: number;
  change: number;
  fuelChange: number;
  /** fuel change as a share of the total change (can exceed 1 or be negative) */
  share: number | null;
  groundFrom: number | null;
  groundTo: number | null;
}

export function fuelStep(c: CarrierYears, prev: YearRow, cur: YearRow): FuelStep | null {
  if (!cur.fuel || !prev.fuel || !cur.change_vs_previous) return null;
  const change = cur.change_vs_previous.dollars_per_parcel;
  const fuelChange = round2(cur.summary.split.fuel.per_parcel - prev.summary.split.fuel.per_parcel);
  return {
    carrier: c.carrier,
    fromYear: prev.year,
    toYear: cur.year,
    change,
    fuelChange,
    share: change !== 0 ? fuelChange / change : null,
    groundFrom: prev.fuel.ground.applied_percent,
    groundTo: cur.fuel.ground.applied_percent,
  };
}

/** The year step where the carrier's cost rose most, with its fuel part. */
export function biggestFuelStep(c: CarrierYears, upTo?: number): FuelStep | null {
  let best: FuelStep | null = null;
  for (let i = 1; i < c.years.length; i++) {
    const cur = c.years[i]!;
    if (upTo !== undefined && cur.year > upTo) break;
    const s = fuelStep(c, c.years[i - 1]!, cur);
    if (s && (!best || s.change > best.change)) best = s;
  }
  return best;
}

export function fuelSentence(s: FuelStep): string {
  const name = carrierName(s.carrier);
  const pct = s.share !== null && s.change > 0 && s.fuelChange > 0 ? ` (${Math.round(s.share * 100)}% of it)` : "";
  const rates =
    s.groundFrom !== null && s.groundTo !== null && s.groundFrom !== s.groundTo
      ? `; the ground fuel surcharge went from ${s.groundFrom}% to ${s.groundTo}%`
      : "";
  return `${name} ${s.fromYear}→${s.toYear}: ${signedUsd(s.change)} per parcel, of which fuel ${signedUsd(s.fuelChange)}${pct}${rates}.`;
}

/* ---------- drivers ---------- */

export function sortedDrivers(list: Driver[]): Driver[] {
  return [...list].sort((a, b) => Math.abs(b.change_per_parcel) - Math.abs(a.change_per_parcel) || a.segment.localeCompare(b.segment));
}

export function segmentLabel(dim: Dimension, segment: string): string {
  switch (dim) {
    case "weight_band":
      return `${segment} lb`;
    case "zone_band":
      return `Zones ${segment}`;
    case "residential":
      return segment === "residential" ? "Homes" : segment === "business" ? "Businesses" : segment;
    case "speed":
      return tierName(segment);
  }
}

function segmentPhrase(dim: Dimension, segment: string): string {
  switch (dim) {
    case "weight_band":
      return `parcels of ${segment} lb`;
    case "zone_band":
      return `parcels to zones ${segment}`;
    case "residential":
      return segment === "residential" ? "deliveries to homes" : "deliveries to businesses";
    case "speed":
      return `${tierName(segment).toLowerCase()} parcels`;
  }
}

/** The dimension whose largest single segment explains most of the change. */
export function strongestDimension(d: Drivers): Dimension {
  let best: Dimension = "weight_band";
  let bestV = -1;
  for (const dim of DIMENSIONS) {
    const top = sortedDrivers(d[dim])[0];
    const v = top ? Math.abs(top.change_per_parcel) : 0;
    if (v > bestV) {
      best = dim;
      bestV = v;
    }
  }
  return best;
}

export function driverSentence(carrier: Carrier, row: YearRow, dim: Dimension): string | null {
  const ch = row.change_vs_previous;
  const list = row.drivers?.[dim];
  if (!ch || !list || list.length === 0) return null;
  const top = sortedDrivers(list)[0]!;
  const name = carrierName(carrier);
  const span = `${ch.from_year} to ${row.year}`;
  const what = segmentPhrase(dim, top.segment);
  const share = ch.dollars_per_parcel !== 0 ? Math.round((top.change_per_parcel / ch.dollars_per_parcel) * 100) : null;
  const shareText = share !== null && share > 0 ? `, ${share}% of it` : "";
  const direction = top.change_per_parcel >= 0 ? "added" : "took off";
  return (
    `Top driver: ${what} (${top.parcels} parcels) ${direction} ${formatUsd(Math.abs(top.change_per_parcel))} per parcel ` +
    `of ${name}'s ${signedUsd(ch.dollars_per_parcel)} change from ${span}${shareText}.`
  );
}

/* ---------- warnings ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export interface PointNote {
  carrier: Carrier;
  year: number;
  text: string;
  kind: "warning" | "edition";
}

/**
 * Warnings from the response, plus a note when the year's prices took effect mid-year
 * (the backend reports `as_of`, not a warning, for that): a year priced from a mid-year
 * edition is not a January-to-January comparison.
 */
export function pointNotes(r: YearlyResponse): PointNote[] {
  const out: PointNote[] = [];
  for (const c of r.carriers) {
    for (const y of c.years) {
      for (const w of y.warnings) out.push({ carrier: c.carrier, year: y.year, text: w, kind: "warning" });
      if (y.as_of) {
        const [ay, am] = y.as_of.split("-").map(Number);
        if (ay === y.year && am !== undefined && am >= 3) {
          out.push({
            carrier: c.carrier,
            year: y.year,
            kind: "edition",
            text: `Priced from the edition effective ${formatDate(y.as_of)}, published mid-year, so the step into and out of ${y.year} is not January to January.`,
          });
        }
      }
    }
  }
  return out;
}

export const pctText = (n: number) => signedPct(n, 1);
