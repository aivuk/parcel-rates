/**
 * Small helpers shared by the Q1 and Q2 views (issue #5). Kept here rather than in src/lib
 * so this branch does not touch shared files; move to src/lib if Q3/Q4 need them too.
 */
import { useEffect, useState } from "react";
import type { Carrier, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { formatUsd } from "../../lib/format";

/** Margins that round to $0.00 are break-even: no sign, no profit or loss colour. */
const BREAK_EVEN = 0.005;
const isBreakEven = (margin: number) => Math.abs(margin) < BREAK_EVEN;

/** "+$1.58 margin" / "−$1.90 loss": sign and word, never colour alone. */
export function marginText(margin: number): string {
  if (isBreakEven(margin)) return "$0.00, break-even";
  return margin > 0 ? `+${formatUsd(margin)} margin` : `−${formatUsd(-margin)} loss`;
}

export const marginClass = (margin: number) => (isBreakEven(margin) ? "" : margin < 0 ? "is-loss" : "is-profit");

/** Carriers that publish prices for `year`; all three when meta is not loaded yet. */
export function carriersForYear(meta: Meta | null, year: number): Carrier[] {
  if (!meta) return [...CARRIERS];
  return CARRIERS.filter((c) => meta.years[c]?.includes(year));
}

export function serviceName(meta: Meta | null, serviceId: string): string {
  const found = meta?.services.find((s) => s.service_id === serviceId);
  if (found) return found.display_name;
  return serviceId
    .split("_")
    .map((w) => (w === "usps" || w === "ups" ? w.toUpperCase() : w === "fedex" ? "FedEx" : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The value after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setSettled(value);
      return;
    }
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : settled;
}

/** "2027 prices are published by FedEx only" style sentence, or null when all three publish. */
export function missingCarriersNote(available: Carrier[], year: number, names: Record<Carrier, string>): string | null {
  if (available.length === CARRIERS.length) return null;
  if (available.length === 0) return `No carrier has published ${year} prices in this data.`;
  const list = available.map((c) => names[c]).join(" and ");
  const missing = CARRIERS.filter((c) => !available.includes(c));
  const missingList = missing.map((c) => names[c]).join(" and ");
  const verb = missing.length === 1 ? "has" : "have";
  const consequence = available.length === 1 ? "so there is nothing to compare against" : "so they are left out";
  return `${year} prices are published by ${list} only. ${missingList} ${verb} not published ${year} prices yet, ${consequence}.`;
}
