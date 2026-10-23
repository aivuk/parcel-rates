import type { Carrier, Tier } from "../api/types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const int = new Intl.NumberFormat("en-US");

export const formatUsd = (n: number) => usd.format(n);
export const formatInt = (n: number) => int.format(n);
export const formatShare = (share: number) => `${Math.round(share * 100)}%`;
export const formatPercent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}%`;

export const CARRIER_NAME: Record<Carrier, string> = { usps: "USPS", ups: "UPS", fedex: "FedEx" };
export const TIER_NAME: Record<Tier, string> = {
  ground: "Ground",
  two_three_day: "2–3 day",
  next_day: "Next day",
};
