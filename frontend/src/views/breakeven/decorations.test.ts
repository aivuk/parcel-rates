import { describe, expect, it } from "vitest";
import type { BreakevenCell, Carrier } from "../../api/types";
import { decorations } from "./Heatmap";
import { isTie } from "./readout";

const cell = (carrier: Carrier, runnerUp: Carrier | null = null, saving = 0): BreakevenCell => ({
  weight_lb: 1,
  distance_miles: 1,
  zone_usps: 1,
  zone_private: 1,
  winner: { carrier, service_id: carrier, total: 1 },
  runner_up: runnerUp ? { carrier: runnerUp, service_id: runnerUp, total: 1 + saving } : null,
  saving,
  totals: { [carrier]: 1, ...(runnerUp ? { [runnerUp]: 1 + saving } : {}) },
});

describe("heatmap decorations", () => {
  it("draws USPS edges heavy and UPS/FedEx edges thin, and names tall runs only", () => {
    // rows: 1 lb [usps, ups], 2 lb [usps, fedex]
    const grid = [
      [cell("usps"), cell("ups")],
      [cell("usps"), cell("fedex")],
    ];
    const d = decorations(grid, [1, 2], 2, 50, 20);
    expect(d.boundaries).toBe("M96,38v20M96,58v20"); // the USPS | rival column edge, both rows
    expect(d.rivalEdges).toBe("M96,58h50"); // UPS above FedEx
    expect(d.runLabels).toEqual([{ x: 71, y: 58, carrier: "usps" }]); // 40 px USPS run; 20 px runs are too short
    expect(d.colSeps).toBe("M96,38v40");
  });

  it("treats UPS and FedEx within $0.10 as a tie, but never a USPS cell", () => {
    expect(isTie(cell("ups", "fedex", 0.04))).toBe(true);
    expect(isTie(cell("fedex", "ups", 0.1))).toBe(false);
    expect(isTie(cell("usps", "ups", 0.01))).toBe(false);
    expect(isTie(cell("ups", "usps", 0.01))).toBe(false);
  });

  it("merges a run of near-ties under one label, with thin edges to UPS or FedEx", () => {
    // one column: 1-2 lb UPS clear winner, 3-4 lb UPS/FedEx near-ties (FedEx wins one), 5 lb USPS
    const grid = [[cell("ups", "fedex", 2)], [cell("ups", "fedex", 2)], [cell("ups", "fedex", 0.03)], [cell("fedex", "ups", 0.05)], [cell("usps", "ups", 1)]];
    const d = decorations(grid, [1, 2, 3, 4, 5], 1, 50, 20);
    expect(d.runLabels.map((l) => l.carrier)).toEqual(["ups", "tie"]);
    expect(d.rivalEdges).toBe("M46,78h50"); // UPS above the tie; none inside the tie run
    expect(d.boundaries).toBe("M46,118h50"); // the tie above USPS
  });

  it("leaves out a label wider than its column", () => {
    const grid = [[cell("fedex")], [cell("fedex")]];
    expect(decorations(grid, [1, 2], 1, 30, 20).runLabels).toEqual([]);
    expect(decorations(grid, [1, 2], 1, 40, 20, 10).runLabels).toHaveLength(1);
  });
});
