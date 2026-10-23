import type { Parcel, ParcelOut } from "../api/types";

/** Server parcels carry every key with nulls; the UI and requests use absent keys instead. */
export function fromParcelOut(p: ParcelOut): Parcel {
  const dims =
    p.length_in !== null && p.width_in !== null && p.height_in !== null
      ? { length_in: p.length_in, width_in: p.width_in, height_in: p.height_in }
      : {};
  return {
    weight_lb: p.weight_lb,
    ...(p.distance_miles !== null ? { distance_miles: p.distance_miles } : {}),
    residential: p.residential,
    speed: p.speed,
    quantity: p.quantity,
    ...dims,
    ...(p.price_charged !== null ? { price_charged: p.price_charged } : {}),
    ...(p.delivery_area !== "none" ? { delivery_area: p.delivery_area } : {}),
    ...(p.nonstandard_packaging ? { nonstandard_packaging: true } : {}),
    ...(p.order_value !== null ? { order_value: p.order_value } : {}),
    ...(p.origin_zip !== null ? { origin_zip: p.origin_zip } : {}),
    ...(p.destination_zip !== null ? { destination_zip: p.destination_zip } : {}),
  };
}
