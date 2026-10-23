import type { Carrier } from "../api/types";

/** CSS variable for a carrier's colour; use in style props so dark mode follows. */
export const carrierVar = (c: Carrier) => `var(--carrier-${c})`;
export const carrierWashVar = (c: Carrier) => `var(--carrier-${c}-wash)`;

/** Resolved colour, for libraries that need a concrete value (e.g. Recharts fills). */
export function carrierColor(c: Carrier, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(`--carrier-${c}`).trim();
}
