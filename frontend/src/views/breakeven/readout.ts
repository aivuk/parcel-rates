import type { BreakevenBand, BreakevenCell, BreakevenResponse, Carrier, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { formatInt } from "../../lib/format";
import { serviceName } from "../quote/shared";

/** The ground service each carrier competes with on this map. */
export function groundService(carrier: Carrier, residential: boolean): string {
  if (carrier === "usps") return "usps_ground_advantage";
  if (carrier === "ups") return "ups_ground";
  return residential ? "fedex_home_delivery" : "fedex_ground";
}

export const groundName = (meta: Meta | null, c: Carrier, residential: boolean) =>
  serviceName(meta, groundService(c, residential));

/** Saving buckets for cell intensity; fixed in dollars so the legend means the same on every map. */
export const SAVING_STEPS = [1, 3, 10] as const;
export const SAVING_LABELS = ["under $1", "$1–3", "$3–10", "$10 or more"] as const;

export function savingLevel(saving: number): 0 | 1 | 2 | 3 {
  if (saving < SAVING_STEPS[0]) return 0;
  if (saving < SAVING_STEPS[1]) return 1;
  if (saving < SAVING_STEPS[2]) return 2;
  return 3;
}

/** Cells indexed [row = weight][col = distance], in the order of the response's axes. */
export function cellGrid(res: BreakevenResponse): (BreakevenCell | null)[][] {
  const wi = new Map(res.weights_lb.map((w, i) => [w, i]));
  const di = new Map(res.distances_miles.map((d, i) => [d, i]));
  const grid: (BreakevenCell | null)[][] = res.weights_lb.map(() => res.distances_miles.map(() => null));
  for (const c of res.cells) {
    const r = wi.get(c.weight_lb);
    const col = di.get(c.distance_miles);
    if (r !== undefined && col !== undefined) grid[r]![col] = c;
  }
  return grid;
}

export const zoneLabel = (zUsps: number | null, zPrivate: number | null) =>
  zUsps === zPrivate || zPrivate === null ? `zone ${zUsps ?? "—"}` : `zone ${zUsps ?? "—"} (UPS/FedEx ${zPrivate})`;

const fmtMi = (d: number) => `${formatInt(d)} mi`;
const fmtLb = (w: number) => `${Number.isInteger(w) ? w : w.toFixed(1)} lb`;

function joinOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

interface BandFacts {
  band: BreakevenBand;
  first: number | null; // lightest grid weight where a rival matches or beats USPS
  rivals: Carrier[]; // the rivals that do so at `first`
  beyond: Carrier[]; // non-USPS winners at weights >= first
  /** Heaviest weight a rival wins, and the next grid weight (USPS wins again from there), if any. */
  lastRival: number | null;
  uspsAgainFrom: number | null;
  /** USPS still wins some weights between `first` and `lastRival`. */
  mixed: boolean;
}

function bandFacts(res: BreakevenResponse, grid: (BreakevenCell | null)[][], col: number): BandFacts {
  const band = res.breakeven_weight_lb[col]!;
  const vs: [Carrier, number | null][] = [
    ["ups", band.vs_ups],
    ["fedex", band.vs_fedex],
  ];
  const known = vs.filter((x): x is [Carrier, number] => x[1] !== null);
  const first = known.length ? Math.min(...known.map((x) => x[1])) : null;
  const rivals = known.filter((x) => x[1] === first).map((x) => x[0]);
  const beyond = new Set<Carrier>();
  let lastRivalIdx = -1;
  let firstIdx = -1;
  if (first !== null) {
    res.weights_lb.forEach((w, r) => {
      const win = grid[r]?.[col]?.winner?.carrier;
      if (w < first || !win || win === "usps") return;
      beyond.add(win);
      if (firstIdx < 0) firstIdx = r;
      lastRivalIdx = r;
    });
  }
  let mixed = false;
  for (let r = firstIdx; firstIdx >= 0 && r <= lastRivalIdx; r++) {
    if (grid[r]?.[col]?.winner?.carrier === "usps") mixed = true;
  }
  const lastRival = lastRivalIdx >= 0 ? res.weights_lb[lastRivalIdx]! : null;
  const uspsAgainFrom = lastRivalIdx >= 0 ? (res.weights_lb[lastRivalIdx + 1] ?? null) : null;
  return { band, first, rivals, beyond: CARRIERS.filter((c) => beyond.has(c)), lastRival, uspsAgainFrom, mixed };
}

export interface Readout {
  /** The figure: where USPS first stops winning, or a word when it never does. */
  figure: string;
  caption: string;
  lines: string[];
  /** True when USPS has no prices for the year, so there is nothing to compare. */
  noUsps: boolean;
}

/** Plain-language breakeven lines from `breakeven_weight_lb`, grouping neighbouring bands that read the same. */
export function readout(res: BreakevenResponse, meta: Meta | null): Readout {
  const res_ = res.residential;
  const usps = groundName(meta, "usps", res_);
  const name = (c: Carrier) => groundName(meta, c, res_);
  const maxW = res.weights_lb[res.weights_lb.length - 1] ?? 70;
  const minW = res.weights_lb[0] ?? 1;
  const noUsps = !res.cells.some((c) => c.totals.usps !== undefined);
  if (noUsps) {
    const present = CARRIERS.filter((c) => res.cells.some((x) => x.totals[c] !== undefined));
    return {
      figure: present.length === 1 ? `${name(present[0]!).split(" ")[0]} only` : "No USPS",
      caption: `USPS has no ${res.year} prices in this data, so there is no breakeven to draw.`,
      lines: [],
      noUsps,
    };
  }
  const grid = cellGrid(res);
  const facts = res.distances_miles.map((_, col) => bandFacts(res, grid, col));

  // Group consecutive bands with the same story.
  const key = (f: BandFacts) => `${f.first}|${f.rivals.join()}|${f.beyond.join()}|${f.lastRival}|${f.mixed}`;
  const groups: BandFacts[][] = [];
  for (const f of facts) {
    const g = groups[groups.length - 1];
    if (g && key(g[0]!) === key(f)) g.push(f);
    else groups.push([f]);
  }

  const where = (g: BandFacts[]) => {
    const a = g[0]!.band;
    const b = g[g.length - 1]!.band;
    if (g.length === 1) return `at ${fmtMi(a.distance_miles)} (zone ${a.zone_usps ?? "—"})`;
    return `from ${fmtMi(a.distance_miles)} to ${fmtMi(b.distance_miles)} (zones ${a.zone_usps ?? "—"}–${b.zone_usps ?? "—"})`;
  };

  const lines = groups.map((g) => {
    const f = g[0]!;
    const w = where(g);
    const W = w[0]!.toUpperCase() + w.slice(1);
    if (f.first === null) return `${W}, ${usps} is cheapest at every weight up to ${fmtLb(maxW)}.`;
    const rivals = joinOr(f.rivals.map(name));
    if (f.first <= minW) return `${W}, ${rivals} ${f.rivals.length > 1 ? "match" : "matches"} or ${f.rivals.length > 1 ? "beat" : "beats"} ${usps} from the lightest weight.`;
    const prev = res.weights_lb[res.weights_lb.indexOf(f.first) - 1] ?? f.first;
    const winners = joinOr(f.beyond.map(name));
    if (f.beyond.length === 0) return `${W}, ${usps} is cheapest up to ${fmtLb(prev)}; from ${fmtLb(f.first)} ${rivals} costs the same.`;
    const mostly = f.mixed ? "mostly " : "";
    if (f.uspsAgainFrom !== null && f.lastRival !== null) {
      return `${W}, ${usps} is cheapest up to ${fmtLb(prev)} and again from ${fmtLb(f.uspsAgainFrom)}; between ${fmtLb(f.first)} and ${fmtLb(f.lastRival)} ${winners} ${mostly}wins.`;
    }
    return `${W}, ${usps} is cheapest up to ${fmtLb(prev)}; beyond that ${winners} ${mostly}wins.`;
  });

  const crossings = facts.filter((f) => f.first !== null);
  if (crossings.length === 0) {
    return {
      figure: "Never",
      caption: `${usps} is the cheapest ground service at every weight from ${fmtLb(minW)} to ${fmtLb(maxW)} and every distance on this map.`,
      lines,
      noUsps,
    };
  }
  const lowest = Math.min(...crossings.map((f) => f.first!));
  const at = crossings.filter((f) => f.first === lowest);
  const rivalSet = CARRIERS.filter((c) => at.some((f) => f.rivals.includes(c)));
  const dists = at.map((f) => fmtMi(f.band.distance_miles));
  const distText = at.length === crossings.length && at.length === facts.length ? "at every distance" : `at ${joinOr(dists).replace(/ or /, " and ")}`;
  return {
    figure: fmtLb(lowest),
    caption: `${usps} stops being the cheapest ${res_ ? "home" : "business"} delivery from ${fmtLb(lowest)} ${distText}, where ${joinOr(rivalSet.map(name))} ${rivalSet.length > 1 ? "match or beat" : "matches or beats"} it.`,
    lines,
    noUsps,
  };
}
