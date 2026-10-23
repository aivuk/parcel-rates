import { describe, expect, it } from "vitest";
import type { BreakevenCell, BreakevenResponse, Carrier } from "../../api/types";
import { mockMeta } from "../../api/mocks";
import { readout } from "./readout";

const CODE: Record<string, Carrier> = { S: "usps", U: "ups", F: "fedex" };

interface Spec {
  /** One string per distance column, one letter per weight (S = USPS, U = UPS, F = FedEx wins). */
  columns: string[];
  residential?: boolean;
  year?: number;
  /** Carriers with prices this year (default all three). */
  carriers?: Carrier[];
  /** Pairwise breakeven weights per column, as the API sends them (default null). */
  vs?: { ups: number | null; fedex: number | null }[];
}

/** A small synthetic map: the winner costs $10, every other carrier $11 (so savings are $1). */
function grid({ columns, residential = true, year = 2026, carriers = ["usps", "ups", "fedex"], vs = [] }: Spec): BreakevenResponse {
  const weights = Array.from({ length: columns[0]!.length }, (_, i) => i + 1);
  const distances = columns.map((_, c) => (c + 1) * 100);
  const cells: BreakevenCell[] = [];
  columns.forEach((col, c) => {
    [...col].forEach((letter, r) => {
      const winner = CODE[letter]!;
      const totals: Partial<Record<Carrier, number>> = {};
      for (const k of carriers) totals[k] = k === winner ? 10 : 11;
      const runner = carriers.find((k) => k !== winner);
      cells.push({
        weight_lb: weights[r]!,
        distance_miles: distances[c]!,
        zone_usps: c + 2,
        zone_private: c + 2,
        winner: { carrier: winner, service_id: `${winner}_x`, total: 10 },
        runner_up: runner ? { carrier: runner, service_id: `${runner}_x`, total: 11 } : null,
        saving: runner ? 1 : 0,
        totals,
      });
    });
  });
  return {
    year,
    residential,
    weights_lb: weights,
    distances_miles: distances,
    cells,
    breakeven_weight_lb: distances.map((d, c) => ({
      distance_miles: d,
      zone_usps: c + 2,
      zone_private: c + 2,
      vs_ups: vs[c]?.ups ?? null,
      vs_fedex: vs[c]?.fedex ?? null,
    })),
  };
}

const cases: { name: string; spec: Spec; figure: string; lines: string[]; caption?: RegExp }[] = [
  {
    name: "USPS never loses",
    spec: { columns: ["SSSS", "SSSS"] },
    figure: "Never",
    lines: ["From 100 mi to 200 mi (zones 2–3), USPS Ground Advantage is cheapest at every weight up to 4 lb."],
    caption: /cheapest ground service at every weight from 1 lb to 4 lb/,
  },
  {
    name: "USPS loses at the lightest weight, then wins again",
    spec: { columns: ["UUSS"], vs: [{ ups: 1, fedex: null }] },
    figure: "1 lb",
    lines: ["At 100 mi (zone 2), UPS Ground wins from the lightest weight; USPS Ground Advantage is cheapest from 3 lb."],
  },
  {
    name: "winner flips back and forth, then USPS wins again",
    spec: { columns: ["SSUSUSS"], vs: [{ ups: 3, fedex: null }] },
    figure: "3 lb",
    lines: [
      "At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 2 lb and again from 6 lb; between 3 lb and 5 lb UPS Ground mostly wins.",
    ],
  },
  {
    name: "vs_ups null, vs_fedex set",
    spec: { columns: ["SSFF"], vs: [{ ups: null, fedex: 3 }] },
    figure: "3 lb",
    lines: ["At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 2 lb; beyond that FedEx Home Delivery wins."],
    caption: /from 3 lb at every distance, where FedEx Home Delivery takes over/,
  },
  {
    name: "vs_fedex null, vs_ups set",
    spec: { columns: ["SUUU"], vs: [{ ups: 2, fedex: null }] },
    figure: "2 lb",
    lines: ["At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 1 lb; beyond that UPS Ground wins."],
  },
  {
    name: "three-way crossover: FedEx beats USPS pairwise first, but UPS is cheapest overall",
    spec: { columns: ["SSUUFF"], vs: [{ ups: 3, fedex: 2 }] },
    figure: "3 lb",
    lines: ["At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 2 lb; beyond that UPS Ground or FedEx Home Delivery wins."],
    caption: /where UPS Ground takes over/,
  },
  {
    name: "a rival that beats USPS pairwise but never wins overall is not named",
    spec: { columns: ["SSUU"], vs: [{ ups: 3, fedex: 3 }] },
    figure: "3 lb",
    lines: ["At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 2 lb; beyond that UPS Ground wins."],
    caption: /where UPS Ground takes over\.$/,
  },
  {
    name: "earliest crossing names only the distances where it happens",
    spec: { columns: ["SSSS", "SSFF", "SFFF"] },
    figure: "2 lb",
    lines: [
      "At 100 mi (zone 2), USPS Ground Advantage is cheapest at every weight up to 4 lb.",
      "At 200 mi (zone 3), USPS Ground Advantage is cheapest up to 2 lb; beyond that FedEx Home Delivery wins.",
      "At 300 mi (zone 4), USPS Ground Advantage is cheapest up to 1 lb; beyond that FedEx Home Delivery wins.",
    ],
    caption: /from 2 lb at 300 mi, where FedEx Home Delivery takes over/,
  },
  {
    name: "business delivery names FedEx Ground",
    spec: { columns: ["SSFF"], residential: false },
    figure: "3 lb",
    lines: ["At 100 mi (zone 2), USPS Ground Advantage is cheapest up to 2 lb; beyond that FedEx Ground wins."],
    caption: /cheapest business delivery from 3 lb/,
  },
  {
    name: "2027: FedEx only",
    spec: { columns: ["FF", "FF"], year: 2027, carriers: ["fedex"] },
    figure: "FedEx only",
    lines: [],
    caption: /USPS has no 2027 prices/,
  },
];

describe("readout", () => {
  it.each(cases)("$name", ({ spec, figure, lines, caption }) => {
    const r = readout(grid(spec), mockMeta);
    expect(r.figure).toBe(figure);
    expect(r.lines).toEqual(lines);
    if (caption) expect(r.caption).toMatch(caption);
  });

  it("names every carrier in a sentence only if it wins a cell in that column", () => {
    const r = readout(grid({ columns: ["SSUUFF", "SSUUUU"], vs: [{ ups: 3, fedex: 2 }, { ups: 3, fedex: 3 }] }), mockMeta);
    expect(r.lines[1]).not.toMatch(/FedEx/);
  });

  it("reports no USPS when the year has none, without a breakeven", () => {
    expect(readout(grid({ columns: ["FU"], year: 2027, carriers: ["fedex", "ups"] }), mockMeta)).toMatchObject({
      figure: "No USPS",
      noUsps: true,
    });
  });
});
