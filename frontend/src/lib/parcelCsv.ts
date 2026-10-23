import Papa from "papaparse";
import type { DeliveryArea, Parcel, Tier } from "../api/types";
import { DELIVERY_AREAS, TIERS } from "../api/types";

/** Columns from docs/data/SCHEMA.md, section "Parcel set input". */
export const REQUIRED_COLUMNS = ["weight_lb", "residential", "speed"] as const;
/** One of these is needed: the distance, or the destination ZIP (with a ship-from ZIP). */
export const WHERE_COLUMNS = ["distance_miles", "destination_zip"] as const;
export const OPTIONAL_COLUMNS = [
  "distance_miles",
  "destination_zip",
  "origin_zip",
  "length_in",
  "width_in",
  "height_in",
  "quantity",
  "price_charged",
  "delivery_area",
  "nonstandard_packaging",
  "order_value",
] as const;
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export const MAX_WEIGHT_LB = 70;
export const MAX_ROWS = 20000;

export interface CsvProblem {
  /** Spreadsheet row number (the header is row 1); null for problems with the whole file. */
  row: number | null;
  column?: string;
  message: string;
}

export interface CsvResult {
  parcels: Parcel[];
  errors: CsvProblem[];
  warnings: CsvProblem[];
}

const TRUE_WORDS = new Set(["true", "yes", "1", "y"]);
const FALSE_WORDS = new Set(["false", "no", "0", "n"]);

export function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return undefined;
}

/**
 * How numbers are written in the file. A semicolon delimiter means a European export:
 * comma is the decimal separator and "." may group thousands. Otherwise "." is the decimal
 * point and "," may group thousands (or, for a value like "2,5", be a decimal comma).
 */
export type NumberStyle = { decimal: "." | ","; delimiter: string };

export interface ParsedNumber {
  value?: number;
  /** Set when the text could be read two ways; the value is the reading named here. */
  ambiguity?: string;
}

const PLAIN = /^-?\d+(\.\d+)?$/;
const COMMA_THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const DOT_THOUSANDS = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
const COMMA_DECIMAL = /^-?\d+,\d+$/;
const SHORT_COMMA_DECIMAL = /^-?\d+,\d{1,2}$/;

export function parseNumber(raw: string, style: NumberStyle = { decimal: ".", delimiter: "," }): ParsedNumber {
  const t = raw.trim().replace(/^\$/, "").replace(/\s/g, "");
  if (t === "") return {};
  const num = (x: string): ParsedNumber => ({ value: Number(x) });

  if (style.decimal === ",") {
    if (COMMA_DECIMAL.test(t) || /^-?\d+$/.test(t)) return num(t.replace(",", "."));
    if (DOT_THOUSANDS.test(t)) {
      const value = Number(t.replace(/\./g, "").replace(",", "."));
      if (t.includes(",")) return { value };
      // "1.234" in a semicolon file: thousands group (1234) or decimal point (1.234)?
      return { value, ambiguity: `"${raw.trim()}" read as ${value} (the "." taken as a thousands separator); write ${value} or ${t} with a comma decimal to be sure` };
    }
    if (PLAIN.test(t)) return num(t); // "2.5": not a thousands group, so a decimal point
    return {};
  }

  if (PLAIN.test(t)) return num(t);
  if (COMMA_THOUSANDS.test(t)) {
    const value = Number(t.replace(/,/g, ""));
    // With a comma delimiter the value was quoted on purpose, so a group like "1,234" is thousands.
    if (style.delimiter === "," || t.includes(".")) return { value };
    return { value, ambiguity: `"${raw.trim()}" read as ${value} (the "," taken as a thousands separator); if it is a decimal comma, write ${t.replace(",", ".")}` };
  }
  if (SHORT_COMMA_DECIMAL.test(t)) return num(t.replace(",", ".")); // "2,5": cannot be a thousands group
  return {};
}

const SPEED_ALIASES: Record<string, Tier> = {
  ground: "ground",
  two_three_day: "two_three_day",
  "2-3 day": "two_three_day",
  "2_3_day": "two_three_day",
  next_day: "next_day",
  overnight: "next_day",
  "next day": "next_day",
};

type Row = Record<string, string | undefined>;

class RowReader {
  readonly errors: CsvProblem[] = [];
  readonly warnings: CsvProblem[] = [];
  constructor(
    private readonly row: Row,
    private readonly rowNumber: number,
    private readonly style: NumberStyle,
  ) {}

  private fail(column: string, message: string): undefined {
    this.errors.push({ row: this.rowNumber, column, message });
    return undefined;
  }

  text(column: string): string {
    return (this.row[column] ?? "").trim();
  }

  /** A 5-digit ZIP; 3 or 4 digits get their leading zeros back (spreadsheets drop them). */
  zip(column: string): string | undefined {
    const raw = this.text(column);
    if (raw === "") return undefined;
    const plus4 = /^(\d{5})-\d{4}$/.exec(raw);
    if (plus4) return plus4[1];
    if (/^\d{5}$/.test(raw)) return raw;
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(5, "0");
      this.warnings.push({ row: this.rowNumber, column, message: `${column} ${raw} read as ${padded} (leading zeros restored)` });
      return padded;
    }
    return this.fail(column, `${column} "${raw}" is not a 5-digit ZIP code`);
  }

  number(column: string, required: boolean, check: (n: number) => string | null): number | undefined {
    const raw = this.text(column);
    if (raw === "") return required ? this.fail(column, `${column} is empty`) : undefined;
    const parsed = parseNumber(raw, this.style);
    const n = parsed.value;
    if (parsed.ambiguity) this.warnings.push({ row: this.rowNumber, column, message: `${column} ${parsed.ambiguity}` });
    if (n === undefined || !Number.isFinite(n)) return this.fail(column, `${column} "${raw}" is not a number`);
    const problem = check(n);
    return problem ? this.fail(column, problem) : n;
  }

  bool(column: string, required: boolean): boolean | undefined {
    const raw = this.text(column);
    if (raw === "") return required ? this.fail(column, `${column} is empty; use true or false`) : undefined;
    const b = parseBool(raw);
    if (b === undefined) return this.fail(column, `${column} "${raw}" is not true/false, yes/no or 1/0`);
    return b;
  }

  speed(): Tier | undefined {
    const raw = this.text("speed");
    if (raw === "") return this.fail("speed", "speed is empty");
    const tier = SPEED_ALIASES[raw.toLowerCase()];
    if (!tier) return this.fail("speed", `speed "${raw}" is not one of ${TIERS.join(", ")}`);
    return tier;
  }

  deliveryArea(): DeliveryArea | undefined {
    const raw = this.text("delivery_area").toLowerCase();
    if (raw === "") return undefined;
    if ((DELIVERY_AREAS as readonly string[]).includes(raw)) return raw as DeliveryArea;
    return this.fail("delivery_area", `delivery_area "${raw}" is not one of ${DELIVERY_AREAS.join(", ")}`);
  }
}

const positive = (col: string) => (n: number) => (n > 0 ? null : `${col} must be more than 0`);

function readRow(
  row: Row,
  rowNumber: number,
  style: NumberStyle,
): { parcel?: Parcel; errors: CsvProblem[]; warnings: CsvProblem[] } {
  const r = new RowReader(row, rowNumber, style);
  const weight = r.number("weight_lb", true, (n) => {
    if (n <= 0) return "weight_lb must be more than 0";
    if (n > MAX_WEIGHT_LB) return `weight_lb ${n} is over the ${MAX_WEIGHT_LB} lb limit`;
    return null;
  });
  const distance = r.number("distance_miles", false, (n) => (n >= 0 ? null : "distance_miles cannot be negative"));
  const destination = r.zip("destination_zip");
  const origin = r.zip("origin_zip");
  if (distance === undefined && destination === undefined && r.text("distance_miles") === "" && r.text("destination_zip") === "") {
    r.errors.push({ row: rowNumber, column: "distance_miles", message: "give distance_miles or destination_zip" });
  }
  const residential = r.bool("residential", true);
  const speed = r.speed();
  const length = r.number("length_in", false, positive("length_in"));
  const width = r.number("width_in", false, positive("width_in"));
  const height = r.number("height_in", false, positive("height_in"));
  const quantity = r.number("quantity", false, (n) =>
    Number.isInteger(n) && n >= 1 ? null : "quantity must be a whole number of at least 1",
  );
  const price = r.number("price_charged", false, (n) => (n >= 0 ? null : "price_charged cannot be negative"));
  const area = r.deliveryArea();
  const nonstandard = r.bool("nonstandard_packaging", false);
  const orderValue = r.number("order_value", false, (n) => (n >= 0 ? null : "order_value cannot be negative"));

  const dimsGiven = ["length_in", "width_in", "height_in"].filter((c) => r.text(c) !== "");
  if (dimsGiven.length > 0 && dimsGiven.length < 3) {
    r.errors.push({
      row: rowNumber,
      column: "length_in",
      message: "give all three of length_in, width_in and height_in, or none",
    });
  }

  if (r.errors.length > 0 || weight === undefined || residential === undefined || !speed) {
    return { errors: r.errors, warnings: r.warnings };
  }
  const parcel: Parcel = {
    weight_lb: weight,
    ...(distance !== undefined ? { distance_miles: distance } : {}),
    ...(destination !== undefined ? { destination_zip: destination } : {}),
    ...(origin !== undefined ? { origin_zip: origin } : {}),
    residential,
    speed,
    quantity: quantity ?? 1,
    ...(length !== undefined && width !== undefined && height !== undefined
      ? { length_in: length, width_in: width, height_in: height }
      : {}),
    ...(price !== undefined ? { price_charged: price } : {}),
    ...(area !== undefined ? { delivery_area: area } : {}),
    ...(nonstandard !== undefined ? { nonstandard_packaging: nonstandard } : {}),
    ...(orderValue !== undefined ? { order_value: orderValue } : {}),
  };
  return { parcel, errors: [], warnings: r.warnings };
}

export function parseParcelCsv(text: string): CsvResult {
  const parsed = Papa.parse<Row>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missing: string[] = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (!WHERE_COLUMNS.some((c) => headers.includes(c))) missing.push("distance_miles (or destination_zip)");
  if (missing.length > 0) {
    return {
      parcels: [],
      errors: [
        {
          row: null,
          message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must name the columns.`,
        },
      ],
      warnings: [],
    };
  }
  const delimiter = parsed.meta.delimiter;
  const style: NumberStyle = { delimiter, decimal: delimiter === ";" ? "," : "." };
  const warnings: CsvProblem[] = headers
    .filter((h) => h !== "" && !(ALL_COLUMNS as readonly string[]).includes(h))
    .map((h) => ({ row: null, column: h, message: `Column "${h}" is not used and was ignored` }));

  if (parsed.data.length === 0) {
    return { parcels: [], errors: [{ row: null, message: "The file has a header but no parcel rows." }], warnings };
  }
  if (parsed.data.length > MAX_ROWS) {
    return {
      parcels: [],
      errors: [{ row: null, message: `The file has ${parsed.data.length} rows; the limit is ${MAX_ROWS}. Use the quantity column to group identical parcels.` }],
      warnings,
    };
  }

  const parcels: Parcel[] = [];
  const errors: CsvProblem[] = [];
  parsed.data.forEach((row, i) => {
    const result = readRow(row, i + 2, style);
    warnings.push(...result.warnings);
    if (result.parcel) parcels.push(result.parcel);
    errors.push(...result.errors);
  });
  return { parcels: errors.length > 0 ? [] : parcels, errors, warnings };
}

/** Column order of the downloadable template, as listed in SCHEMA.md. */
export const TEMPLATE_COLUMNS = [
  "weight_lb",
  "length_in",
  "width_in",
  "height_in",
  "distance_miles",
  "residential",
  "speed",
  "quantity",
  "price_charged",
  "delivery_area",
  "nonstandard_packaging",
  "order_value",
  "destination_zip",
  "origin_zip",
] as const;

export const CSV_TEMPLATE =
  [
    TEMPLATE_COLUMNS.join(","),
    "0.8,9,6,3,120,true,ground,40,,none,false,24.00,,",
    "4.5,14,12,8,950,true,ground,12,,,,89.50,,",
    "2,12,9,4,1600,false,two_three_day,5,14.99,,,,,",
    "1,,,,450,yes,next_day,2,34.99,das,no,120,,",
    "1.5,10,8,4,,true,ground,8,,,,42.00,90210,10001",
  ].join("\n") + "\n";
