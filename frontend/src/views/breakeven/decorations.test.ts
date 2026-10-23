import { describe, expect, it } from "vitest";
import type { BreakevenCell, Carrier } from "../../api/types";
import { decorations } from "./Heatmap";

const cell = (carrier: Carrier): BreakevenCell => ({
  weight_lb: 1,
  distance_miles: 1,
  zone_usps: 1,
  zone_private: 1,
  winner: { carrier, service_id: carrier, total: 1 },
  runner_up: null,
  saving: 0,
  totals: { [carrier]: 1 },
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
});
