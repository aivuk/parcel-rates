import { describe, expect, it } from "vitest";
import type { Parcel } from "../api/types";
import { mockMeta } from "../api/mocks";
import { FALLBACK_USPS_ZONES, summarize, uspsZones, weightBand, zoneForDistance } from "./summary";

const p = (o: Partial<Parcel>): Parcel => ({ weight_lb: 1, distance_miles: 100, residential: true, speed: "ground", ...o });

describe("summarize", () => {
  const parcels = [
    p({ weight_lb: 0.5, quantity: 6, distance_miles: 50 }),
    p({ weight_lb: 3, quantity: 3, residential: false, speed: "two_three_day", distance_miles: 700 }),
    p({ weight_lb: 25, distance_miles: 2000, speed: "next_day", price_charged: 30 }),
  ];
  const s = summarize(parcels, mockMeta.zone_bands);

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
    expect(s.distance.map((b) => [b.label, b.count])).toEqual([
      ["Zone 1", 6], ["Zone 2", 0], ["Zone 3", 0], ["Zone 4", 0],
      ["Zone 5", 3], ["Zone 6", 0], ["Zone 7", 0], ["Zone 8", 1],
    ]);
    expect(s.distance[0]!.detail).toBe("0–50 mi");
    expect(s.distance[7]!.detail).toBe("1,801+ mi");
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
    const zones = uspsZones(mockMeta.zone_bands);
    expect(zoneForDistance(50, zones).zone).toBe(1);
    expect(zoneForDistance(50.5, zones).zone).toBe(2);
    expect(zoneForDistance(5000, zones).zone).toBe(8);
  });

  it("uses only the USPS bands from meta, and falls back without meta", () => {
    expect(uspsZones(mockMeta.zone_bands).every((b) => b.carrier === "usps")).toBe(true);
    expect(uspsZones(mockMeta.zone_bands).map((b) => [b.zone, b.min_miles, b.max_miles])).toEqual(
      FALLBACK_USPS_ZONES.map((b) => [b.zone, b.min_miles, b.max_miles]),
    );
    expect(uspsZones(undefined)).toBe(FALLBACK_USPS_ZONES);
  });
});
