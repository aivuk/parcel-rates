/**
 * Formatting shared by the Q3 and Q4 views (issue #6). Lives here rather than in src/lib
 * so the parallel Q1/Q2 branch is not touched; src/lib/format.ts has the base formatters.
 */
import type { Carrier, Tier } from "../../api/types";
import { CARRIER_NAME, TIER_NAME, formatUsd } from "../../lib/format";

/** "+$1.23" / "−$1.23" (true minus sign), "$0.00" for zero. */
export function signedUsd(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (r === 0) return formatUsd(0);
  return `${r > 0 ? "+" : "−"}${formatUsd(Math.abs(r))}`;
}

/** "+4.1%" / "−2.0%" with one decimal. */
export function signedPct(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return `0${digits ? "." + "0".repeat(digits) : ""}%`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}%`;
}

/** Share 0..1 as "71%". */
export const pct0 = (share: number) => `${Math.round(share * 100)}%`;

export const carrierName = (c: Carrier | string) => CARRIER_NAME[c as Carrier] ?? c;

/** Surcharge conditions (surcharges.csv) in the owner's words. */
const CONDITION_LABEL: Record<string, string> = {
  residential: "Home delivery",
  delivery_area: "Remote area",
  delivery_area_extended: "Extended remote area",
  additional_handling_packaging: "Handling: packaging",
  additional_handling_weight: "Handling: weight",
  additional_handling_length: "Handling: length",
  additional_handling_width: "Handling: width",
  nonstandard_volume: "Non-standard size",
  nonstandard_length: "Non-standard length",
  oversize: "Oversize",
};

export function conditionLabel(condition: string): string {
  return CONDITION_LABEL[condition] ?? condition.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const tierName = (t: string) => TIER_NAME[t as Tier] ?? t;
