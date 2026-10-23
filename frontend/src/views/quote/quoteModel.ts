import type { Carrier, LineItem, Quote, QuoteResponse, Tier } from "../../api/types";
import type { FieldProblem } from "../../api/client";

export interface Split {
  base: number;
  surcharges: number;
  fuel: number;
}

export function splitOf(items: readonly LineItem[]): Split {
  const sum = (kind: LineItem["kind"]) => items.filter((i) => i.kind === kind).reduce((a, i) => a + i.amount, 0);
  return { base: sum("base"), surcharges: sum("surcharge"), fuel: sum("fuel") };
}

export interface TierView {
  /** Cheapest available service per carrier in the tier, cheapest first. */
  ranked: Quote[];
  /** Services in the tier that cannot carry this parcel, with their reason. */
  unavailable: Quote[];
  /** Available services in the tier that lose to a cheaper service of the same carrier. */
  alternatives: Quote[];
}

export function tierView(res: QuoteResponse, tier: Tier): TierView {
  const inTier = res.quotes.filter((q) => q.tier === tier);
  const available = inTier.filter((q) => q.available).sort((a, b) => a.total - b.total);
  const seen = new Set<Carrier>();
  const ranked: Quote[] = [];
  const alternatives: Quote[] = [];
  for (const q of available) {
    if (seen.has(q.carrier)) alternatives.push(q);
    else {
      seen.add(q.carrier);
      ranked.push(q);
    }
  }
  return { ranked, unavailable: inTier.filter((q) => !q.available), alternatives };
}

/** Billable weight was set by the box's size rather than its weight, for at least one service. */
export function dimDrivers(quotes: readonly Quote[], actualLb: number): Quote[] {
  return quotes.filter((q) => q.available && q.dim_weight_lb !== null && q.dim_weight_lb > Math.ceil(actualLb - 1e-9));
}

/** Zone per carrier for the feedback under the distance input. */
export function zonesByCarrier(quotes: readonly Quote[]): Partial<Record<Carrier, number>> {
  const out: Partial<Record<Carrier, number>> = {};
  for (const q of quotes) if (q.zone !== null && out[q.carrier] === undefined) out[q.carrier] = q.zone;
  return out;
}

export type FormField = "weight" | "dims" | "distance" | "speed" | "residential" | "delivery_area" | "packaging";

const FIELD_OF: Record<string, FormField> = {
  weight_lb: "weight",
  length_in: "dims",
  width_in: "dims",
  height_in: "dims",
  distance_miles: "distance",
  speed: "speed",
  residential: "residential",
  delivery_area: "delivery_area",
  nonstandard_packaging: "packaging",
};

/** Map 422 problems ("parcel · weight_lb") to form fields; the rest go to `other`. */
export function problemsByField(problems: readonly FieldProblem[]): {
  byField: Partial<Record<FormField, string[]>>;
  other: FieldProblem[];
} {
  const byField: Partial<Record<FormField, string[]>> = {};
  const other: FieldProblem[] = [];
  for (const p of problems) {
    const last = p.field.split(" · ").pop() ?? "";
    const field = p.field.startsWith("parcel") ? FIELD_OF[last] : undefined;
    if (field) byField[field] = [...(byField[field] ?? []), p.message];
    else other.push(p);
  }
  return { byField, other };
}
