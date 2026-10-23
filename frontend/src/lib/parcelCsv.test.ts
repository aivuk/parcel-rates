import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, parseBool, parseParcelCsv } from "./parcelCsv";

const HEADER = "weight_lb,length_in,width_in,height_in,distance_miles,residential,speed,quantity,price_charged,delivery_area,nonstandard_packaging";

describe("parseParcelCsv", () => {
  it("parses a valid file with all columns", () => {
    const csv = `${HEADER}\n0.8,9,6,3,120,true,ground,40,12.5,das,false\n4,,,,950,no,next_day,,,,\n`;
    const { parcels, errors, warnings } = parseParcelCsv(csv);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(parcels).toEqual([
      {
        weight_lb: 0.8, length_in: 9, width_in: 6, height_in: 3, distance_miles: 120, residential: true,
        speed: "ground", quantity: 40, price_charged: 12.5, delivery_area: "das", nonstandard_packaging: false,
      },
      { weight_lb: 4, distance_miles: 950, residential: false, speed: "next_day", quantity: 1 },
    ]);
  });

  it("accepts only the required columns, in any order and case, and defaults quantity to 1", () => {
    const csv = "Speed, Residential ,DISTANCE_MILES,weight_lb\nground,1,300,2.5\n";
    const { parcels, errors } = parseParcelCsv(csv);
    expect(errors).toEqual([]);
    expect(parcels).toEqual([{ weight_lb: 2.5, distance_miles: 300, residential: true, speed: "ground", quantity: 1 }]);
  });

  it("rejects a file missing a required column with a file-level message", () => {
    const { parcels, errors } = parseParcelCsv("weight_lb,distance_miles,speed\n1,100,ground\n");
    expect(parcels).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: null });
    expect(errors[0]!.message).toContain("residential");
  });

  it("reports a bad boolean with its spreadsheet row number", () => {
    const csv = "weight_lb,distance_miles,residential,speed\n1,100,true,ground\n2,200,maybe,ground\n";
    const { parcels, errors } = parseParcelCsv(csv);
    expect(parcels).toEqual([]);
    expect(errors).toEqual([
      { row: 3, column: "residential", message: 'residential "maybe" is not true/false, yes/no or 1/0' },
    ]);
  });

  it.each([
    ["true", true], ["TRUE", true], ["yes", true], ["Yes", true], ["1", true],
    ["false", false], ["no", false], ["0", false], [" No ", false],
  ])("reads %j as %s", (raw, expected) => {
    expect(parseBool(raw)).toBe(expected);
  });

  it("rejects weight over 70 lb and non-positive weight", () => {
    const csv = "weight_lb,distance_miles,residential,speed\n70.5,100,true,ground\n0,100,true,ground\n70,100,true,ground\n";
    const { errors } = parseParcelCsv(csv);
    expect(errors.map((e) => [e.row, e.column])).toEqual([[2, "weight_lb"], [3, "weight_lb"]]);
    expect(errors[0]!.message).toContain("70 lb");
  });

  it("validates optional columns: partial dimensions, quantity, area, speed, price", () => {
    const csv = [
      HEADER,
      "1,10,,,100,true,ground,,,,",
      "1,,,,100,true,ground,2.5,,,",
      "1,,,,100,true,ground,,,rural,",
      "1,,,,100,true,express,,,,",
      "1,,,,100,true,ground,,-1,,",
      "1,,,,100,true,ground,,,,perhaps",
    ].join("\n");
    const { errors } = parseParcelCsv(csv);
    expect(errors.map((e) => [e.row, e.column])).toEqual([
      [2, "length_in"],
      [3, "quantity"],
      [4, "delivery_area"],
      [5, "speed"],
      [6, "price_charged"],
      [7, "nonstandard_packaging"],
    ]);
  });

  it("accepts a $ sign on prices, speed aliases and a BOM, and warns about unknown columns", () => {
    const csv = "﻿weight_lb,distance_miles,residential,speed,sku\n1,100,yes,overnight,AB-1\n";
    const csv2 = "weight_lb,distance_miles,residential,speed,price_charged\n1,100,yes,ground,$9.50\n";
    const a = parseParcelCsv(csv);
    expect(a.errors).toEqual([]);
    expect(a.parcels[0]!.speed).toBe("next_day");
    expect(a.warnings).toEqual([{ row: null, column: "sku", message: 'Column "sku" is not used and was ignored' }]);
    expect(parseParcelCsv(csv2).parcels[0]!.price_charged).toBe(9.5);
  });

  it("reports a header-only file as empty", () => {
    expect(parseParcelCsv("weight_lb,distance_miles,residential,speed\n").errors[0]!.message).toContain("no parcel rows");
  });

  it("parses its own downloadable template without errors", () => {
    const { parcels, errors } = parseParcelCsv(CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(parcels).toHaveLength(5);
  });

  it("reads an optional order_value and rejects a negative one", () => {
    const ok = parseParcelCsv("weight_lb,distance_miles,residential,speed,order_value\n1,100,yes,ground,$82.50\n2,100,yes,ground,\n");
    expect(ok.errors).toEqual([]);
    expect(ok.parcels[0]!.order_value).toBe(82.5);
    expect(ok.parcels[1]).not.toHaveProperty("order_value");
    const bad = parseParcelCsv("weight_lb,distance_miles,residential,speed,order_value\n1,100,yes,ground,-4\n");
    expect(bad.errors[0]).toMatchObject({ row: 2, column: "order_value" });
  });

  it("takes a destination ZIP instead of the distance and restores leading zeros", () => {
    const r = parseParcelCsv("weight_lb,residential,speed,destination_zip,origin_zip\n1,yes,ground,90210,\n2,no,ground,2134,10001\n");
    expect(r.errors).toEqual([]);
    expect(r.parcels[0]).toMatchObject({ destination_zip: "90210" });
    expect(r.parcels[0]).not.toHaveProperty("distance_miles");
    expect(r.parcels[1]).toMatchObject({ destination_zip: "02134", origin_zip: "10001" });
    expect(r.warnings[0]).toMatchObject({ row: 3, column: "destination_zip" });
    const neither = parseParcelCsv("weight_lb,distance_miles,residential,speed\n1,,yes,ground\n");
    expect(neither.errors[0]).toMatchObject({ row: 2, column: "distance_miles" });
    expect(neither.errors[0]!.message).toMatch(/destination_zip/);
    const bad = parseParcelCsv("weight_lb,residential,speed,destination_zip\n1,yes,ground,9O210\n");
    expect(bad.errors[0]).toMatchObject({ row: 2, column: "destination_zip" });
  });
});

