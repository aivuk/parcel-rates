import type { BreakevenBand, BreakevenCell, BreakevenResponse, Carrier, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { serviceName } from "../../lib/carriers";
import { formatInt } from "../../lib/format";

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

/** UPS and FedEx closer than this are drawn as a tie: a few cents decide nothing, and on the
 * map they made a band of thin alternating slivers. USPS cells are never merged, since where
 * USPS stops winning is the question the map answers. */
export const TIE_DOLLARS = 0.1;

export function isTie(c: BreakevenCell | null): boolean {
  const a = c?.winner?.carrier;
  const b = c?.runner_up?.carrier;
  return !!a && !!b && a !== "usps" && b !== "usps" && c!.saving < TIE_DOLLARS;
}

/** What a cell shows: its winner, or "tie" for a UPS/FedEx near-tie. */
export const cellKey = (c: BreakevenCell | null): Carrier | "tie" | undefined => (isTie(c) ? "tie" : c?.winner?.carrier);

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

/**
 * What one distance column says, read from the per-cell winner (the carrier the map paints), so
 * every clause names the same carriers as the map. `breakeven_weight_lb` is pairwise (USPS against
 * one rival, ties counted as USPS losing) and can name a carrier that never wins overall when all
 * three cross; it is not used for the wording.
 */
interface BandFacts {
  band: BreakevenBand;
  /** Lightest weight where a carrier other than USPS is cheapest; null when USPS wins throughout. */
  first: number | null;
  /** The carrier cheapest at `first`. */
  firstWinner: Carrier | null;
  /** Every non-USPS winner between `first` and `lastRival`. */
  beyond: Carrier[];
  /** Heaviest weight a rival wins, and the next grid weight (USPS wins again from there), if any. */
  lastRival: number | null;
  uspsAgainFrom: number | null;
  /** USPS still wins some weights between `first` and `lastRival`. */
  mixed: boolean;
}

function bandFacts(res: BreakevenResponse, grid: (BreakevenCell | null)[][], col: number): BandFacts {
  const band = res.breakeven_weight_lb[col] ?? {
    distance_miles: res.distances_miles[col]!,
    zone_usps: null,
    zone_private: null,
    vs_ups: null,
    vs_fedex: null,
  };
  const winners = res.weights_lb.map((_, r) => grid[r]?.[col]?.winner?.carrier ?? null);
  const isRival = (w: Carrier | null) => w !== null && w !== "usps";
  const firstIdx = winners.findIndex(isRival);
  let lastIdx = -1;
  winners.forEach((w, r) => {
    if (isRival(w)) lastIdx = r;
  });
  if (firstIdx < 0) {
    return { band, first: null, firstWinner: null, beyond: [], lastRival: null, uspsAgainFrom: null, mixed: false };
  }
  const span = winners.slice(firstIdx, lastIdx + 1);
  const beyond = CARRIERS.filter((c) => c !== "usps" && span.includes(c));
  const after = winners.slice(lastIdx + 1);
  const uspsAgainFrom = after.length > 0 && after.every((w) => w === "usps") ? res.weights_lb[lastIdx + 1]! : null;
  return {
    band,
    first: res.weights_lb[firstIdx]!,
    firstWinner: winners[firstIdx]!,
    beyond,
    lastRival: res.weights_lb[lastIdx]!,
    uspsAgainFrom,
    mixed: span.includes("usps"),
  };
}

export interface Readout {
  /** The figure: where USPS first stops winning, or a word when it never does. */
  figure: string;
  caption: string;
  lines: string[];
  /** True when USPS has no prices for the year, so there is nothing to compare. */
  noUsps: boolean;
}

/** Plain-language breakeven lines per distance band, grouping neighbouring bands that read the same. */
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
  const key = (f: BandFacts) => `${f.first}|${f.firstWinner}|${f.beyond.join()}|${f.lastRival}|${f.uspsAgainFrom}|${f.mixed}`;
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
    const winners = joinOr(f.beyond.map(name));
    const mostly = f.mixed ? "mostly " : "";
    const verb = `${mostly}wins`; // "UPS Ground or FedEx Ground wins": one of them, per weight
    const again = f.uspsAgainFrom !== null ? ` and again from ${fmtLb(f.uspsAgainFrom)}` : "";
    if (f.first <= minW) {
      const back = f.uspsAgainFrom !== null ? `; ${usps} is cheapest from ${fmtLb(f.uspsAgainFrom)}` : "";
      return `${W}, ${winners} ${verb} from the lightest weight${back}.`;
    }
    const prev = res.weights_lb[res.weights_lb.indexOf(f.first) - 1] ?? f.first;
    if (f.uspsAgainFrom !== null) {
      return `${W}, ${usps} is cheapest up to ${fmtLb(prev)}${again}; between ${fmtLb(f.first)} and ${fmtLb(f.lastRival!)} ${winners} ${verb}.`;
    }
    return `${W}, ${usps} is cheapest up to ${fmtLb(prev)}; beyond that ${winners} ${verb}.`;
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
  const rivalSet = CARRIERS.filter((c) => at.some((f) => f.firstWinner === c));
  const dists = at.map((f) => fmtMi(f.band.distance_miles));
  const distText = at.length === crossings.length && at.length === facts.length ? "at every distance" : `at ${joinOr(dists).replace(/ or /, " and ")}`;
  return {
    figure: fmtLb(lowest),
    caption: `${usps} stops being the cheapest ${res_ ? "home" : "business"} delivery from ${fmtLb(lowest)} ${distText}, where ${joinOr(rivalSet.map(name))} ${rivalSet.length > 1 ? "take" : "takes"} over.`,
    lines,
    noUsps,
  };
}
