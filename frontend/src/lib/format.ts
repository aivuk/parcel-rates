/** Number, money, margin and label formatting shared by every view. */
import type { Tier } from "../api/types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const int = new Intl.NumberFormat("en-US");

export const formatUsd = (n: number) => usd.format(n);
export const formatInt = (n: number) => int.format(n);
/** A threshold such as "$75" or "$49.50": whole dollars without cents. */
export const formatUsdRound = (n: number) => (Number.isInteger(n) ? `$${int.format(n)}` : usd.format(n));
/** Share 0..1 as "71%". */
export const formatShare = (share: number) => `${Math.round(share * 100)}%`;
export const formatPercent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}%`;

/** "+$1.23" / "−$1.23" (true minus sign), "$0.00" for zero. */
export function signedUsd(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (r === 0) return formatUsd(0);
  return `${r > 0 ? "+" : "−"}${formatUsd(Math.abs(r))}`;
}

/** "+4.1%" / "−2.0%" with one decimal by default. */
export function signedPct(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return `0${digits ? "." + "0".repeat(digits) : ""}%`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}%`;
}

/* ---------- margin: sign and word, never colour alone ---------- */

/** Margins that round to $0.00 are break-even: no sign, no profit or loss colour. */
const BREAK_EVEN = 0.005;
const isBreakEven = (margin: number) => Math.abs(margin) < BREAK_EVEN;

/** "+$1.58 margin" / "−$1.90 loss" / "$0.00, break-even". */
export function marginText(margin: number): string {
  if (isBreakEven(margin)) return "$0.00, break-even";
  return margin > 0 ? `+${formatUsd(margin)} margin` : `−${formatUsd(-margin)} loss`;
}

/** Colour class that agrees with marginText: "is-loss", "is-profit", or none at break-even. */
export const marginClass = (margin: number) => (isBreakEven(margin) ? "" : margin < 0 ? "is-loss" : "is-profit");

/* ---------- labels ---------- */

export const TIER_NAME: Record<Tier, string> = {
  ground: "Ground",
  two_three_day: "2–3 day",
  next_day: "Next day",
};

export const tierName = (t: string) => TIER_NAME[t as Tier] ?? t;

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
