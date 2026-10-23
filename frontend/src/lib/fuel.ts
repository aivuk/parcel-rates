import type { Carrier, FuelGroup, Meta } from "../api/types";

export interface FuelDefaultInfo {
  percent: number;
  /** Carriers whose default comes from another carrier's history. */
  proxyCarriers: Carrier[];
  /** True when carriers publish different defaults; the slider shows the first non-proxy one. */
  differs: boolean;
}

/** The year's documented fuel default for a service group, or null when no carrier has one. */
export function fuelDefault(meta: Meta | null, year: number, group: FuelGroup): FuelDefaultInfo | null {
  if (!meta) return null;
  const rows = meta.fuel_defaults.filter((f) => f.year === year && f.service_group === group);
  if (rows.length === 0) return null;
  const primary = rows.find((r) => !r.is_proxy) ?? rows[0]!;
  return {
    percent: primary.default_percent,
    proxyCarriers: rows.filter((r) => r.is_proxy).map((r) => r.carrier),
    differs: rows.some((r) => r.default_percent !== primary.default_percent),
  };
}

/** Every year any carrier has prices for, newest first, with the carriers missing that year. */
export function yearOptions(meta: Meta | null): { year: number; missing: Carrier[] }[] {
  if (!meta) return [];
  const carriers = Object.keys(meta.years) as Carrier[];
  const all = [...new Set(carriers.flatMap((c) => meta.years[c]))].sort((a, b) => b - a);
  return all.map((year) => ({ year, missing: carriers.filter((c) => !meta.years[c].includes(year)) }));
}
