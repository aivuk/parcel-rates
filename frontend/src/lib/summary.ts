import type { Parcel, Tier, WeightBand, ZoneBand } from "../api/types";
import { TIERS, WEIGHT_BANDS } from "../api/types";

export interface Bucket {
  label: string;
  detail?: string;
  count: number; // parcels (sum of quantity)
  share: number; // 0..1
}

export interface ParcelSummary {
  rows: number;
  parcels: number;
  residentialShare: number;
  byTier: Record<Tier, number>; // share 0..1
  weight: Bucket[];
  distance: Bucket[];
  withOwnPrice: number; // parcels whose row sets price_charged
  meanWeightLb: number;
}

/** Upper bounds (inclusive) of the contract's weight bands: ≤1, 1–5, 5–10, 10–20, 20–70 lb. */
const WEIGHT_UPPER: Record<WeightBand, number> = { "≤1": 1, "1–5": 5, "5–10": 10, "10–20": 20, "20–70": 70 };

export function weightBand(lb: number): WeightBand {
  return WEIGHT_BANDS.find((b) => lb <= WEIGHT_UPPER[b]) ?? "20–70";
}

/** USPS zone bands (docs: data/processed/zone_from_distance.csv); used until /api/meta answers. */
export const FALLBACK_USPS_ZONES: ZoneBand[] = [
  [1, 0, 50], [2, 51, 150], [3, 151, 300], [4, 301, 600],
  [5, 601, 1000], [6, 1001, 1400], [7, 1401, 1800], [8, 1801, null],
].map(([zone, min_miles, max_miles]) => ({
  carrier: "usps" as const, zone: zone as number, min_miles: min_miles as number, max_miles: max_miles as number | null,
}));

const miles = new Intl.NumberFormat("en-US");

export function zoneLabel(b: ZoneBand): string {
  return `Zone ${b.zone}`;
}

export function zoneRange(b: ZoneBand): string {
  return b.max_miles === null ? `${miles.format(b.min_miles)}+ mi` : `${miles.format(b.min_miles)}–${miles.format(b.max_miles)} mi`;
}

/**
 * The USPS zone a distance falls in. Bands are whole miles with gaps (50, then 51), so a
 * fractional distance goes to the first band whose upper edge it does not pass.
 */
export function zoneForDistance(d: number, bands: ZoneBand[]): ZoneBand {
  const sorted = [...bands].sort((x, y) => x.zone - y.zone);
  return sorted.find((b) => b.max_miles === null || d <= b.max_miles) ?? sorted[sorted.length - 1]!;
}

export function uspsZones(bands: ZoneBand[] | undefined): ZoneBand[] {
  const usps = (bands ?? []).filter((b) => b.carrier === "usps").sort((x, y) => x.zone - y.zone);
  return usps.length > 0 ? usps : FALLBACK_USPS_ZONES;
}

const qty = (p: Parcel) => p.quantity ?? 1;

function buckets(
  parcels: Parcel[],
  labels: readonly string[],
  key: (p: Parcel) => string,
  total: number,
  detail?: (label: string, i: number) => string,
): Bucket[] {
  const counts = new Map<string, number>(labels.map((l) => [l, 0]));
  for (const p of parcels) counts.set(key(p), (counts.get(key(p)) ?? 0) + qty(p));
  return labels.map((label, i) => {
    const count = counts.get(label) ?? 0;
    return { label, count, share: total ? count / total : 0, ...(detail ? { detail: detail(label, i) } : {}) };
  });
}

/** `zoneBands`: the zone bands from /api/meta; the USPS ones bucket the distances. */
export function summarize(parcels: Parcel[], zoneBands?: ZoneBand[]): ParcelSummary {
  const zones = uspsZones(zoneBands);
  const total = parcels.reduce((s, p) => s + qty(p), 0);
  const share = (pred: (p: Parcel) => boolean) =>
    total ? parcels.filter(pred).reduce((s, p) => s + qty(p), 0) / total : 0;
  const byTier = Object.fromEntries(TIERS.map((t) => [t, share((p) => p.speed === t)])) as Record<Tier, number>;
  return {
    rows: parcels.length,
    parcels: total,
    residentialShare: share((p) => p.residential),
    byTier,
    weight: buckets(parcels, WEIGHT_BANDS, (p) => weightBand(p.weight_lb), total),
    distance: buckets(
      parcels,
      zones.map(zoneLabel),
      (p) => zoneLabel(zoneForDistance(p.distance_miles, zones)),
      total,
      (_l, i) => zoneRange(zones[i]!),
    ),
    withOwnPrice: parcels.filter((p) => p.price_charged !== undefined).reduce((s, p) => s + qty(p), 0),
    meanWeightLb: total ? parcels.reduce((s, p) => s + p.weight_lb * qty(p), 0) / total : 0,
  };
}
