import type { Parcel, Tier, WeightBand } from "../api/types";
import { TIERS, WEIGHT_BANDS } from "../api/types";

export interface Bucket {
  label: string;
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

/** Distance bands follow the USPS zone pairs used for zone_band: 1–2, 3–4, 5–6, 7–8. */
export const DISTANCE_BANDS = [
  { label: "0–150 mi", zones: "1–2", max: 150 },
  { label: "151–600 mi", zones: "3–4", max: 600 },
  { label: "601–1,400 mi", zones: "5–6", max: 1400 },
  { label: "1,401+ mi", zones: "7–8", max: Infinity },
] as const;

export function distanceBand(miles: number): string {
  return (DISTANCE_BANDS.find((b) => miles <= b.max) ?? DISTANCE_BANDS[DISTANCE_BANDS.length - 1]!).label;
}

const qty = (p: Parcel) => p.quantity ?? 1;

function buckets(parcels: Parcel[], labels: readonly string[], key: (p: Parcel) => string, total: number): Bucket[] {
  const counts = new Map<string, number>(labels.map((l) => [l, 0]));
  for (const p of parcels) counts.set(key(p), (counts.get(key(p)) ?? 0) + qty(p));
  return labels.map((label) => {
    const count = counts.get(label) ?? 0;
    return { label, count, share: total ? count / total : 0 };
  });
}

export function summarize(parcels: Parcel[]): ParcelSummary {
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
    distance: buckets(parcels, DISTANCE_BANDS.map((b) => b.label), (p) => distanceBand(p.distance_miles), total),
    withOwnPrice: parcels.filter((p) => p.price_charged !== undefined).reduce((s, p) => s + qty(p), 0),
    meanWeightLb: total ? parcels.reduce((s, p) => s + p.weight_lb * qty(p), 0) / total : 0,
  };
}
