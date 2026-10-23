import type { DeliveryArea, Parcel, Tier } from "../../api/types";

/** The quote form as the user types it: strings, so half-typed numbers survive. */
export interface Draft {
  lb: string;
  oz: string;
  length: string;
  width: string;
  height: string;
  distance: string;
  /** Destination ZIP; when given, the zones come from it and the ship-from ZIP, not the distance. */
  toZip: string;
  residential: boolean;
  speed: Tier;
  area: DeliveryArea;
  nonstandard: boolean;
}

export const DEFAULT_DRAFT: Draft = {
  lb: "3",
  oz: "",
  length: "12",
  width: "10",
  height: "6",
  distance: "600",
  toZip: "",
  residential: true,
  speed: "ground",
  area: "none",
  nonstandard: false,
};

/** A number as typed: "1,5" is read as 1.5 (decimal comma); thousands separators are not expected here. */
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Total weight in lb from the lb and oz boxes; null when neither is filled, NaN when garbled. */
export function draftWeight(d: Draft): number | null {
  const lb = parseNum(d.lb);
  const oz = parseNum(d.oz);
  if (lb === null && oz === null) return null;
  if (Number.isNaN(lb) || Number.isNaN(oz)) return NaN;
  return Math.round(((lb ?? 0) + (oz ?? 0) / 16) * 10000) / 10000;
}

export type LocalErrors = Partial<Record<"weight" | "dims" | "distance" | "toZip", string>>;

/**
 * Turn the draft into a request parcel. Only shape problems are caught here (empty, not a
 * number, two of three dimensions); ranges are left to the server so its 422 messages show.
 */
export function draftToParcel(d: Draft): { parcel: Parcel; errors: null } | { parcel: null; errors: LocalErrors } {
  const errors: LocalErrors = {};
  const weight = draftWeight(d);
  if (weight === null) errors.weight = "Enter the weight.";
  else if (Number.isNaN(weight)) errors.weight = "Weight must be a number.";
  const dims = [d.length, d.width, d.height].map(parseNum);
  const filled = dims.filter((x) => x !== null).length;
  if (dims.some((x) => Number.isNaN(x))) errors.dims = "Dimensions must be numbers.";
  else if (filled > 0 && filled < 3) errors.dims = "Give all three dimensions, or leave all three empty.";
  const toZip = d.toZip.trim();
  const distance = toZip ? null : parseNum(d.distance);
  if (toZip && !/^\d{5}$/.test(toZip)) errors.toZip = "Enter a 5-digit ZIP code.";
  else if (!toZip && distance === null) errors.distance = "Enter the distance, or a destination ZIP.";
  else if (Number.isNaN(distance)) errors.distance = "Distance must be a number.";
  if (Object.keys(errors).length > 0) return { parcel: null, errors };
  const parcel: Parcel = {
    weight_lb: weight!,
    ...(toZip ? { destination_zip: toZip } : { distance_miles: distance! }),
    residential: d.residential,
    speed: d.speed,
    delivery_area: d.area,
    nonstandard_packaging: d.nonstandard,
    ...(filled === 3 ? { length_in: dims[0]!, width_in: dims[1]!, height_in: dims[2]! } : {}),
  };
  return { parcel, errors: null };
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function draftFromParcel(p: Parcel): Draft {
  const whole = Math.floor(p.weight_lb);
  const oz = Math.round((p.weight_lb - whole) * 16 * 100) / 100;
  return {
    lb: p.weight_lb < 1 ? "" : String(oz > 0 && whole >= 1 ? whole : p.weight_lb),
    oz: p.weight_lb < 1 ? String(Math.round(p.weight_lb * 16 * 100) / 100) : oz > 0 ? String(oz) : "",
    length: str(p.length_in),
    width: str(p.width_in),
    height: str(p.height_in),
    distance: str(p.distance_miles),
    toZip: p.destination_zip ?? "",
    residential: p.residential,
    speed: p.speed,
    area: p.delivery_area ?? "none",
    nonstandard: p.nonstandard_packaging ?? false,
  };
}
