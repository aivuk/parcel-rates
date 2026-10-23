/** Pure derivations for the Q4 year-over-year view. */
import type { Carrier, CarrierYears, Driver, Drivers, YearRow, YearlyResponse } from "../../api/types";
import { carrierName } from "../../lib/carriers";
import { conditionLabel, formatUsd, signedPct, signedUsd, tierName } from "../../lib/format";

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

const joinAnd = (words: string[]) =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/**
 * Projections start after each carrier's last published year, so they can land on different
 * years (FedEx publishes 2027 before the others). Says so, and names the published years that
 * sit where the other carriers are projected.
 */
export function projectionSentence(carriers: CarrierYears[]): string | null {
  const projected = carriers.filter((c) => c.projected !== null);
  if (projected.length === 0) return null;
  const base = "Each projection starts after that carrier’s last published year";
  const years = [...new Set(projected.map((c) => c.projected!.year))].sort((a, b) => a - b);
  if (years.length === 1) return `${base}.`;
  const first = years[0]!;
  const groups = years.map((y, i) => {
    const names = joinAnd(projected.filter((c) => c.projected!.year === y).map((c) => carrierName(c.carrier)));
    return i === 0 ? `${names} project to ${y}` : `${names} to ${y}`;
  });
  const published = projected.flatMap((c) => {
    const ahead = c.years.map((r) => r.year).filter((y) => y >= first);
    if (ahead.length === 0) return [];
    const what = ahead.length === 1 ? "is a published price list" : "are published price lists";
    return [`${carrierName(c.carrier)} ${joinAnd(ahead.map(String))} ${what}`];
  });
  const why = published.length > 0 ? `; ${joinAnd(published)}, not a projection` : "";
  return `${base}: ${joinAnd(groups)}${why}.`;
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

/**
 * The year step where the carrier's cost rose most, with its fuel part; null when no step is a
 * rise (the "how much of the rise is fuel" question does not apply) or the carrier has no fuel.
 */
export function biggestFuelStep(c: CarrierYears, upTo?: number): FuelStep | null {
  let best: FuelStep | null = null;
  for (let i = 1; i < c.years.length; i++) {
    const cur = c.years[i]!;
    if (upTo !== undefined && cur.year > upTo) break;
    const s = fuelStep(c, c.years[i - 1]!, cur);
    if (s && s.change > 0 && (!best || s.change > best.change)) best = s;
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

/** Change per parcel *within* the segment: its own parcels' change, independent of its size. */
export function withinChange(d: Driver): number {
  return d.parcels > 0 ? Math.round((d.change_total / d.parcels) * 100) / 100 : 0;
}

/** The segment whose own parcels moved most in the direction of the overall change. */
export function fastestSegment(list: Driver[], overall: number): Driver | null {
  const withParcels = list.filter((d) => d.parcels > 0);
  if (withParcels.length === 0) return null;
  const sign = overall >= 0 ? 1 : -1;
  return withParcels.reduce((best, d) => (sign * withinChange(d) > sign * withinChange(best) ? d : best));
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
  const first =
    `Largest contributor: ${what} (${top.parcels} of them) ${direction} ${formatUsd(Math.abs(top.change_per_parcel))} per parcel ` +
    `of ${name}'s ${signedUsd(ch.dollars_per_parcel)} change from ${span}${shareText}.`;
  const fast = fastestSegment(list, ch.dollars_per_parcel);
  if (!fast) return first;
  const verb = ch.dollars_per_parcel >= 0 ? "rising" : "falling";
  if (fast.segment === top.segment) return `${first} Its own parcels also changed fastest: ${signedUsd(withinChange(fast))} each.`;
  const fastWhat = segmentPhrase(dim, fast.segment);
  const fastShare = Math.round((fast.parcels / list.reduce((n, d) => n + d.parcels, 0)) * 100);
  return (
    `${first} Fastest ${verb}: ${fastWhat}, ${signedUsd(withinChange(fast))} each, ` +
    `but they are only ${fastShare}% of the parcels (${fast.parcels}), so they move the average less.`
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
      for (const w of y.warnings) out.push({ carrier: c.carrier, year: y.year, text: readableWarning(w), kind: "warning" });
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

/** "No 2027 rules recorded for: a_b, c; …" with the surcharge ids in the owner's words. */
export function readableWarning(w: string): string {
  const m = /^(No \d{4} rules recorded for): ([^;]+);\s*(.*)$/.exec(w);
  if (!m) return w;
  const kinds = m[2]!.split(",").map((k) => conditionLabel(k.trim()).toLowerCase());
  const rest = m[3]!.replace(/^./, (ch) => ch.toUpperCase());
  return `${m[1]} ${kinds.join(", ")}. ${rest}${/[.!]$/.test(rest) ? "" : "."}`;
}
