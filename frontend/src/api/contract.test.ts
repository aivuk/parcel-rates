import { describe, expect, it } from "vitest";
import blended from "./__fixtures__/blended.json";
import breakeven from "./__fixtures__/breakeven.json";
import health from "./__fixtures__/health.json";
import meta from "./__fixtures__/meta.json";
import quote422 from "./__fixtures__/quote-422.json";
import quote from "./__fixtures__/quote.json";
import sample from "./__fixtures__/sample-parcels.json";
import yearly from "./__fixtures__/yearly.json";
import {
  ContractError,
  asBlendedResponse,
  asBreakevenResponse,
  asHealth,
  asMeta,
  asQuoteResponse,
  asSampleParcels,
  asValidationError,
  asYearlyResponse,
} from "./guards";
import { fromParcelOut } from "../lib/parcels";
import { parseParcelCsv } from "../lib/parcelCsv";

const cases: [string, { response: { status: number; body: unknown } }, (v: unknown) => unknown][] = [
  ["health", health, asHealth],
  ["meta", meta, asMeta],
  ["sample-parcels", sample, asSampleParcels],
  ["quote", quote, asQuoteResponse],
  ["quote-422", quote422, asValidationError],
  ["breakeven", breakeven, asBreakevenResponse],
  ["blended", blended, asBlendedResponse],
  ["yearly", yearly, asYearlyResponse],
];

describe("contract: backend example payloads match src/api/types.ts", () => {
  it("covers every fixture file", () => {
    const files = Object.keys(import.meta.glob("./__fixtures__/*.json"));
    expect(files.map((f) => f.replace("./__fixtures__/", "").replace(".json", "")).sort()).toEqual(cases.map(([n]) => n).sort());
  });

  it.each(cases)("%s response body passes its guard", (_name, fixture, guard) => {
    expect(() => guard(fixture.response.body)).not.toThrow();
  });

  it("rejects drift: an unknown key, a missing key, a wrong type", () => {
    const body = structuredClone(quote.response.body) as { quotes: Record<string, unknown>[] };
    const extra = structuredClone(body);
    extra.quotes[0]!.discount = 1;
    expect(() => asQuoteResponse(extra)).toThrow(/quotes\[0\]\.discount: expected no such key/);
    const missing = structuredClone(body);
    delete missing.quotes[0]!.as_of;
    expect(() => asQuoteResponse(missing)).toThrow(ContractError);
    const wrong = structuredClone(body);
    wrong.quotes[0]!.carrier = "dhl";
    expect(() => asQuoteResponse(wrong)).toThrow(/quotes\[0\]\.carrier/);
  });

  it("the sample parcels survive the round trip through the CSV rules", () => {
    const parcels = asSampleParcels(sample.response.body).parcels.map(fromParcelOut);
    const header = "weight_lb,length_in,width_in,height_in,distance_miles,residential,speed,quantity,price_charged,delivery_area,nonstandard_packaging";
    const rows = parcels.map((p) =>
      [p.weight_lb, p.length_in, p.width_in, p.height_in, p.distance_miles, p.residential, p.speed, p.quantity, p.price_charged, p.delivery_area, p.nonstandard_packaging]
        .map((v) => (v === undefined ? "" : String(v)))
        .join(","),
    );
    const parsed = parseParcelCsv([header, ...rows].join("\n"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.parcels).toEqual(parcels);
  });
});
