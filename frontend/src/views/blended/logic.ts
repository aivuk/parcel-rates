/** Pure derivations for the Q3 blended view, kept apart from rendering so they are easy to test. */
import type { BlendedResponse, Carrier, CarrierBlended, Parcel, SegmentFilter } from "../../api/types";

export interface BlendedAnswer {
  cheapest: CarrierBlended;
  others: CarrierBlended[];
  /** Best mix minus cheapest single carrier, per parcel (negative = the mix is cheaper). */
  mixSavingPerParcel: number;
  mixSavingTotal: number;
  /** True when some carrier could not ship part of the set, so averages cover different parcels. */
  unevenCoverage: boolean;
}

/** Cheapest carrier by cost per parcel among carriers that shipped anything. */
export function blendedAnswer(r: BlendedResponse): BlendedAnswer | null {
  const shipped = r.carriers.filter((c) => c.parcels_shipped > 0);
  if (shipped.length === 0) return null;
  const sorted = [...shipped].sort((a, b) => a.cost_per_parcel - b.cost_per_parcel);
  const cheapest = sorted[0]!;
  return {
    cheapest,
    others: sorted.slice(1),
    mixSavingPerParcel: round2(cheapest.cost_per_parcel - r.best_mix.cost_per_parcel),
    mixSavingTotal: round2(cheapest.total_cost - r.best_mix.total_cost),
    unevenCoverage: r.carriers.some((c) => c.parcels_unavailable > 0),
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The carrier that wins every parcel in the best mix, when one does; the mix is then that carrier alone. */
export function soleWinner(r: BlendedResponse): Carrier | null {
  const winners = Object.entries(r.best_mix.parcels_by_carrier).filter(([, n]) => n > 0);
  return winners.length === 1 ? (winners[0]![0] as Carrier) : null;
}

/* ---------- stacked split ---------- */

export const MAX_KINDS = 3;
export const OTHER_KIND = "__other";
/** A kind narrower than this share of the longest bar is a sliver: it goes under "Other". */
export const MIN_KIND_SHARE = 0.02;

/** Surcharge kinds ordered by their total across carriers. A kind gets its own segment when, for
 * some carrier, it is at least MIN_KIND_SHARE of the most expensive carrier's cost per parcel; at
 * most MAX_KINDS do, and the rest fold into OTHER_KIND. */
export function surchargeKinds(r: BlendedResponse): { shown: string[]; folded: string[] } {
  const totals = new Map<string, number>();
  const widest = new Map<string, number>();
  for (const c of r.carriers)
    for (const s of c.surcharges_by_condition) {
      totals.set(s.condition, (totals.get(s.condition) ?? 0) + s.total);
      widest.set(s.condition, Math.max(widest.get(s.condition) ?? 0, s.per_parcel));
    }
  const longest = Math.max(0, ...r.carriers.filter((c) => c.parcels_shipped > 0).map((c) => c.cost_per_parcel));
  const order = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const visible = order.filter((k) => (widest.get(k) ?? 0) >= MIN_KIND_SHARE * longest);
  const slivers = order.filter((k) => !visible.includes(k));
  // Folding a single kind would only rename it, so up to MAX_KINDS + 1 visible kinds all stay when none fold.
  const room = slivers.length ? MAX_KINDS : MAX_KINDS + 1;
  if (visible.length <= room) return { shown: visible, folded: slivers };
  return { shown: visible.slice(0, MAX_KINDS), folded: [...visible.slice(MAX_KINDS), ...slivers] };
}

/** Every kind on its own, for the table, where a small amount is still readable. */
export const allKinds = (r: BlendedResponse) => {
  const { shown, folded } = surchargeKinds(r);
  return { shown: [...shown, ...folded], folded: [] };
};

export interface SplitRow {
  carrier: Carrier;
  label: string;
  base: number;
  fuel: number;
  /** per surcharge kind key (a condition or OTHER_KIND): dollars per parcel */
  kinds: Record<string, number>;
  surcharges: number;
  total: number;
  surchargeShare: number;
  fuelShare: number;
}

export function splitRows(r: BlendedResponse, kinds: { shown: string[]; folded: string[] }, names: Record<Carrier, string>): SplitRow[] {
  return r.carriers
    .filter((c) => c.parcels_shipped > 0)
    .map((c) => {
      const byKind: Record<string, number> = {};
      for (const k of kinds.shown) byKind[k] = 0;
      if (kinds.folded.length) byKind[OTHER_KIND] = 0;
      for (const s of c.surcharges_by_condition) {
        const key = kinds.shown.includes(s.condition) ? s.condition : OTHER_KIND;
        byKind[key] = round2((byKind[key] ?? 0) + s.per_parcel);
      }
      return {
        carrier: c.carrier,
        label: names[c.carrier],
        base: c.split.base.per_parcel,
        fuel: c.split.fuel.per_parcel,
        kinds: byKind,
        surcharges: c.split.surcharges.per_parcel,
        total: c.cost_per_parcel,
        surchargeShare: c.split.surcharges.share,
        fuelShare: c.split.fuel.share,
      };
    });
}

/* ---------- segment filter ---------- */

export type SegmentKey = keyof SegmentFilter;

/** Drop unset keys, so "All" everywhere sends no segment at all. */
export function cleanSegment(s: SegmentFilter): SegmentFilter | null {
  const out: SegmentFilter = {};
  if (s.weight_band != null) out.weight_band = s.weight_band;
  if (s.zone_band != null) out.zone_band = s.zone_band;
  if (s.residential != null) out.residential = s.residential;
  if (s.speed != null) out.speed = s.speed;
  return Object.keys(out).length ? out : null;
}

export const totalQuantity = (parcels: Parcel[]) => parcels.reduce((n, p) => n + (p.quantity ?? 1), 0);
