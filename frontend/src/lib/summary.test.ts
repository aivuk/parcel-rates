import { describe, expect, it } from "vitest";
import type { Parcel } from "../api/types";
import { distanceBand, summarize, weightBand } from "./summary";

const p = (o: Partial<Parcel>): Parcel => ({ weight_lb: 1, distance_miles: 100, residential: true, speed: "ground", ...o });

describe("summarize", () => {
  const parcels = [
    p({ weight_lb: 0.5, quantity: 6, distance_miles: 50 }),
    p({ weight_lb: 3, quantity: 3, residential: false, speed: "two_three_day", distance_miles: 700 }),
    p({ weight_lb: 25, distance_miles: 2000, speed: "next_day", price_charged: 30 }),
  ];
  const s = summarize(parcels);

  it("counts parcels by quantity, not rows", () => {
    expect(s.rows).toBe(3);
    expect(s.parcels).toBe(10);
    expect(s.withOwnPrice).toBe(1);
  });

  it("weights shares by quantity", () => {
    expect(s.residentialShare).toBeCloseTo(0.7);
    expect(s.byTier).toEqual({ ground: 0.6, two_three_day: 0.3, next_day: 0.1 });
    expect(s.meanWeightLb).toBeCloseTo((0.5 * 6 + 3 * 3 + 25) / 10);
  });

  it("buckets weight and distance into the contract's bands", () => {
    expect(s.weight.map((b) => [b.label, b.count])).toEqual([["≤1", 6], ["1–5", 3], ["5–10", 0], ["10–20", 0], ["20–70", 1]]);
    expect(s.distance.map((b) => b.count)).toEqual([6, 0, 3, 1]);
    expect(s.weight.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1);
  });

  it("returns zero shares for an empty set", () => {
    const e = summarize([]);
    expect(e.parcels).toBe(0);
    expect(e.residentialShare).toBe(0);
    expect(e.weight.every((b) => b.share === 0)).toBe(true);
  });

  it("puts band edges in the lower band", () => {
    expect(weightBand(1)).toBe("≤1");
    expect(weightBand(1.01)).toBe("1–5");
    expect(weightBand(70)).toBe("20–70");
    expect(distanceBand(150)).toBe("0–150 mi");
    expect(distanceBand(151)).toBe("151–600 mi");
  });
});
