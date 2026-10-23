import { describe, expect, it } from "vitest";
import { parseNumber, parseParcelCsv } from "./parcelCsv";

const SEMI = "weight_lb;distance_miles;residential;speed;price_charged";

describe("CSV numbers: decimal commas and thousands separators", () => {
  it("reads 2,5 as 2.5 in a semicolon-delimited (European) file", () => {
    const { parcels, errors, warnings } = parseParcelCsv(`${SEMI}\n2,5;1200;ja;ground;9,99\n`.replace("ja", "yes"));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(parcels[0]).toMatchObject({ weight_lb: 2.5, distance_miles: 1200, price_charged: 9.99 });
  });

  it("reads 1.234,50 as 1234.5 in a semicolon file", () => {
    const { parcels, errors, warnings } = parseParcelCsv(`${SEMI}\n2;1.234,50;yes;ground;\n`);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(parcels[0]!.distance_miles).toBe(1234.5);
  });

  it("reads a quoted 1,234 as 1234 in a comma-delimited file", () => {
    const csv = 'weight_lb,distance_miles,residential,speed\n2,"1,234",true,ground\n';
    const { parcels, errors, warnings } = parseParcelCsv(csv);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(parcels[0]!.distance_miles).toBe(1234);
  });

  it("reads a quoted 2,5 as 2.5 in a comma file: two decimals cannot be a thousands group", () => {
    const { parcels } = parseParcelCsv('weight_lb,distance_miles,residential,speed\n"2,5",100,true,ground\n');
    expect(parcels[0]!.weight_lb).toBe(2.5);
  });

  it("warns, row by row, when a value can be read two ways", () => {
    const { parcels, errors, warnings } = parseParcelCsv(`${SEMI}\n2;1.234;yes;ground;\n`);
    expect(errors).toEqual([]);
    expect(parcels[0]!.distance_miles).toBe(1234);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ row: 2, column: "distance_miles" });
    expect(warnings[0]!.message).toMatch(/1\.234.*read as 1234.*thousands/);
  });

  it("warns about 1,234 in a tab-delimited file, where it may be a decimal comma", () => {
    const { warnings, parcels } = parseParcelCsv("weight_lb\tdistance_miles\tresidential\tspeed\n2\t1,234\ttrue\tground\n");
    expect(parcels[0]!.distance_miles).toBe(1234);
    expect(warnings[0]).toMatchObject({ row: 2, column: "distance_miles" });
  });

  it("still catches weights that are too heavy after decimal handling", () => {
    const { errors } = parseParcelCsv(`${SEMI}\n70,5;100;yes;ground;\n`);
    expect(errors[0]).toMatchObject({ row: 2, column: "weight_lb" });
  });

  it.each([
    ["2.5", ".", ",", 2.5],
    ["1,234.5", ".", ",", 1234.5],
    ["$9.99", ".", ",", 9.99],
    ["2,5", ",", ";", 2.5],
    ["2.5", ",", ";", 2.5],
    ["12", ",", ";", 12],
  ] as const)("parseNumber(%j) with decimal %j, delimiter %j → %d", (raw, decimal, delimiter, value) => {
    expect(parseNumber(raw, { decimal, delimiter })).toEqual({ value });
  });

  it.each(["1,2,3", "abc", "1.2.3,4,5", "1,23456"])("rejects %j in a comma file", (raw) => {
    expect(parseNumber(raw).value).toBeUndefined();
  });
});
