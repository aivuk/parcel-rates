/** Carrier names, colours, and which carriers publish prices for a year. */
import type { Carrier, Meta } from "../api/types";
import { CARRIERS } from "../api/types";

export const CARRIER_NAME: Record<Carrier, string> = { usps: "USPS", ups: "UPS", fedex: "FedEx" };

export const carrierName = (c: Carrier | string) => CARRIER_NAME[c as Carrier] ?? c;

/** CSS variable for a carrier's colour; use in style props so dark mode follows. */
export const carrierVar = (c: Carrier) => `var(--carrier-${c})`;

/** Resolved colour, for libraries that need a concrete value (e.g. Recharts fills). */
export function carrierColor(c: Carrier, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(`--carrier-${c}`).trim();
}

/** Carriers that publish prices for `year`; all three when meta is not loaded yet. */
export function carriersForYear(meta: Meta | null, year: number): Carrier[] {
  if (!meta) return [...CARRIERS];
  return CARRIERS.filter((c) => meta.years[c]?.includes(year));
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

/** The service's display name from /api/meta, or a readable fallback built from its id. */
export function serviceName(meta: Meta | null, serviceId: string): string {
  const found = meta?.services.find((s) => s.service_id === serviceId);
  if (found) return found.display_name;
  return serviceId
    .split("_")
    .map((w) => (w === "usps" || w === "ups" ? w.toUpperCase() : w === "fedex" ? "FedEx" : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}
