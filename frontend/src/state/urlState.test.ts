import { describe, expect, it } from "vitest";
import { FALLBACK_CONTROLS, readState, reducer, writeState, type AppState } from "./urlState";

const base: AppState = { controls: FALLBACK_CONTROLS, view: "quote" };

describe("URL state", () => {
  it("writes nothing for the defaults", () => {
    expect(writeState(base)).toBe("");
    expect(readState("")).toEqual(base);
  });

  it("round-trips every control and the active view", () => {
    const state: AppState = {
      controls: {
        year: 2024,
        usps_rate_card: "retail",
        fuel_override_percent: { ground: 22.5, express: 30 },
        peak: true,
        flat_price: 7.5,
      },
      view: "blended",
    };
    const search = writeState(state);
    expect(search).toContain("year=2024");
    expect(readState(search)).toEqual(state);
  });

  it("keeps foreign params such as mock=1", () => {
    const search = writeState({ ...base, view: "yearly" }, "?mock=1&view=quote");
    const params = new URLSearchParams(search);
    expect(params.get("mock")).toBe("1");
    expect(params.get("view")).toBe("yearly");
  });

  it("ignores invalid values and falls back to defaults", () => {
    const s = readState("?year=abc&usps=wholesale&fuel_ground=95&price=-3&view=nope&peak=yes");
    expect(s).toEqual({ controls: { ...FALLBACK_CONTROLS, peak: false }, view: "quote" });
  });

  it("uses the backend defaults when given", () => {
    expect(readState("", { ...FALLBACK_CONTROLS, year: 2025 }).controls.year).toBe(2025);
  });
});

describe("free shipping in the URL", () => {
  it("is off by default and round-trips a threshold", () => {
    expect(readState("").controls.free_shipping_over).toBeUndefined();
    const s = reducer(readState(""), { type: "freeShipping", over: 75 });
    expect(writeState(s)).toBe("?free_over=75");
    expect(readState("?free_over=75").controls.free_shipping_over).toBe(75);
    expect(readState("?free_over=-3").controls.free_shipping_over).toBeUndefined();
  });

  it("turns off with null", () => {
    const on = reducer(readState(""), { type: "freeShipping", over: 50 });
    const off = reducer(on, { type: "freeShipping", over: null });
    expect(off.controls).not.toHaveProperty("free_shipping_over");
    expect(writeState(off)).toBe("");
  });
});

describe("ship-from ZIP in the URL", () => {
  it("round-trips and clears", () => {
    const s = reducer(readState(""), { type: "originZip", zip: "10001" });
    expect(writeState(s)).toBe("?from=10001");
    expect(readState("?from=10001").controls.origin_zip).toBe("10001");
    expect(readState("?from=1000x").controls.origin_zip).toBeUndefined();
    expect(reducer(s, { type: "originZip", zip: null }).controls).not.toHaveProperty("origin_zip");
  });
});

describe("reducer", () => {
  it("sets and resets one fuel group without touching the other", () => {
    let s = reducer(base, { type: "fuel", group: "ground", percent: 20 });
    s = reducer(s, { type: "fuel", group: "express", percent: 25 });
    s = reducer(s, { type: "fuelReset", group: "ground" });
    expect(s.controls.fuel_override_percent).toEqual({ express: 25 });
    s = reducer(s, { type: "fuelReset", group: "express" });
    expect(s.controls).not.toHaveProperty("fuel_override_percent");
  });

  it("clamps fuel and price to their ranges", () => {
    expect(reducer(base, { type: "fuel", group: "ground", percent: 99 }).controls.fuel_override_percent?.ground).toBe(40);
    expect(reducer(base, { type: "price", price: -5 }).controls.flat_price).toBe(0);
  });

  it("drops fuel overrides when the year changes", () => {
    const s = reducer(reducer(base, { type: "fuel", group: "ground", percent: 20 }), { type: "year", year: 2023 });
    expect(s.controls.year).toBe(2023);
    expect(s.controls.fuel_override_percent).toBeUndefined();
  });
});
