import { describe, expect, it } from "vitest";
import type { Quote } from "../../api/types";
import { dimDrivers } from "./quoteModel";

const q = (over: Partial<Quote>): Quote => ({
  carrier: "ups",
  service_id: "ups_ground",
  service_name: "UPS Ground",
  tier: "ground",
  zone: 5,
  billable_weight_lb: 4,
  dim_weight_lb: null,
  line_items: [],
  total: 10,
  margin: 0,
  available: true,
  unavailable_reason: null,
  as_of: null,
  ...over,
});

describe("dimDrivers", () => {
  it.each([
    ["no dimensional weight", q({}), false],
    ["dimensional weight sets the billable weight", q({ dim_weight_lb: 13, billable_weight_lb: 13 }), true],
    ["dimensional weight below the billable weight", q({ dim_weight_lb: 2, billable_weight_lb: 4 }), false],
    ["dimensional weight not above the actual weight", q({ dim_weight_lb: 3, billable_weight_lb: 3 }), false],
    ["unavailable service", q({ dim_weight_lb: 13, billable_weight_lb: 13, available: false }), false],
  ])("%s", (_, quote, expected) => {
    expect(dimDrivers([quote], 3).length > 0).toBe(expected);
  });
});
