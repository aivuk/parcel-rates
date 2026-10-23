/**
 * Typed mock responses for tests and the `?mock=1` dev mode.
 *
 * Shapes follow ./types.ts. The numbers come from a small toy price formula,
 * shaped to resemble published list prices (USPS cheap when light, UPS/FedEx
 * catching up with weight, residential surcharges on private carriers). They
 * are NOT real prices and must never be shown without the mock banner.
 */
import type {
  BlendedCarrier,
  BlendedRequest,
  BlendedResponse,
  BreakevenCell,
  BreakevenRequest,
  BreakevenResponse,
  Carrier,
  CarrierPick,
  Controls,
  FuelDefault,
  LineItem,
  Meta,
  Parcel,
  Quote,
  QuoteRequest,
  QuoteResponse,
  SampleParcels,
  ServiceInfo,
  Tier,
  YearlyRequest,
  YearlyResponse,
  YearPoint,
  ZoneBand,
} from "./types";
import { CARRIERS, TIERS } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const mockDefaultControls: Controls = {
  year: 2026,
  usps_rate_card: "commercial",
  peak: false,
  flat_price: 9.99,
};

const services: ServiceInfo[] = [
  ["usps", "usps_ground_advantage", "USPS Ground Advantage", "ground", true, true],
  ["usps", "usps_priority_mail", "Priority Mail", "two_three_day", true, true],
  ["usps", "usps_priority_mail_express", "Priority Mail Express", "next_day", true, true],
  ["ups", "ups_ground", "UPS Ground", "ground", true, true],
  ["ups", "ups_3_day_select", "UPS 3 Day Select", "two_three_day", true, true],
  ["ups", "ups_2nd_day_air", "UPS 2nd Day Air", "two_three_day", true, true],
  ["ups", "ups_next_day_air_saver", "UPS Next Day Air Saver", "next_day", true, true],
  ["fedex", "fedex_ground", "FedEx Ground", "ground", false, true],
  ["fedex", "fedex_home_delivery", "FedEx Home Delivery", "ground", true, false],
  ["fedex", "fedex_express_saver", "FedEx Express Saver", "two_three_day", true, true],
  ["fedex", "fedex_standard_overnight", "FedEx Standard Overnight", "next_day", true, true],
].map(([carrier, service_id, display_name, tier, residential_allowed, business_allowed]) => ({
  carrier: carrier as Carrier,
  service_id: service_id as string,
  display_name: display_name as string,
  tier: tier as Tier,
  residential_allowed: residential_allowed as boolean,
  business_allowed: business_allowed as boolean,
}));

/** Values copied from data/processed/{fedex,ups}/fuel_surcharge.csv. */
const fuelTable: [number, number, number][] = [
  [2023, 18.0, 19.25],
  [2024, 16.25, 16.0],
  [2025, 20.5, 19.25],
  [2026, 26.25, 28.75],
];
const fuel_defaults: FuelDefault[] = [
  ...fuelTable.flatMap(([year, ground, express]) =>
    (["fedex", "ups"] as const).flatMap((carrier) => [
      { carrier, year, service_group: "ground" as const, default_percent: ground, is_proxy: carrier === "ups" },
      { carrier, year, service_group: "express" as const, default_percent: express, is_proxy: carrier === "ups" },
    ]),
  ),
  // FedEx 2027 reuses the latest 2026 window, flagged as a proxy in fuel_surcharge.csv.
  { carrier: "fedex", year: 2027, service_group: "ground", default_percent: 26.25, is_proxy: true },
  { carrier: "fedex", year: 2027, service_group: "express", default_percent: 28.75, is_proxy: true },
];

const uspsEdges: [number, number, number | null][] = [
  [1, 0, 50], [2, 51, 150], [3, 151, 300], [4, 301, 600],
  [5, 601, 1000], [6, 1001, 1400], [7, 1401, 1800], [8, 1801, null],
];
const zone_bands: ZoneBand[] = [
  ...uspsEdges.map(([zone, min_miles, max_miles]) => ({ carrier: "usps" as const, zone, min_miles, max_miles })),
  ...(["ups", "fedex"] as const).flatMap((carrier) =>
    uspsEdges.slice(1).map(([zone, min_miles, max_miles]) => ({
      carrier, zone, min_miles: zone === 2 ? 0 : min_miles, max_miles,
    })),
  ),
];

export const mockMeta: Meta = {
  years: { usps: [2023, 2024, 2025, 2026], ups: [2023, 2024, 2025, 2026], fedex: [2023, 2024, 2025, 2026, 2027] },
  services,
  default_controls: mockDefaultControls,
  fuel_defaults,
  zone_bands,
  limitations: [
    "Published list prices only: no negotiated discounts, no account-specific rates.",
    "Zones are estimated from straight-line distance bands, not from ZIP-to-ZIP zone charts.",
    "UPS fuel surcharge uses the FedEx published history as a proxy.",
    "UPS announced increases come from trade press, not from UPS itself.",
  ],
};

export const mockSampleParcels: SampleParcels = {
  description:
    "Illustrative month for a small home-goods shop: mostly light residential parcels by ground, a few heavy or bulky ones, some expedited.",
  parcels: [
    { weight_lb: 0.5, length_in: 9, width_in: 6, height_in: 2, distance_miles: 120, residential: true, speed: "ground", quantity: 180 },
    { weight_lb: 0.9, length_in: 10, width_in: 8, height_in: 3, distance_miles: 650, residential: true, speed: "ground", quantity: 140 },
    { weight_lb: 1.8, length_in: 12, width_in: 9, height_in: 4, distance_miles: 340, residential: true, speed: "ground", quantity: 120 },
    { weight_lb: 2.5, length_in: 12, width_in: 10, height_in: 6, distance_miles: 1500, residential: true, speed: "ground", quantity: 90 },
    { weight_lb: 4, length_in: 14, width_in: 12, height_in: 8, distance_miles: 900, residential: true, speed: "ground", quantity: 70 },
    { weight_lb: 3, length_in: 12, width_in: 12, height_in: 6, distance_miles: 220, residential: false, speed: "ground", quantity: 40 },
    { weight_lb: 7.5, length_in: 18, width_in: 14, height_in: 10, distance_miles: 1200, residential: true, speed: "ground", quantity: 35 },
    { weight_lb: 12, length_in: 20, width_in: 16, height_in: 12, distance_miles: 450, residential: false, speed: "ground", quantity: 20 },
    { weight_lb: 22, length_in: 24, width_in: 18, height_in: 14, distance_miles: 2100, residential: true, speed: "ground", quantity: 8, price_charged: 24.99 },
    { weight_lb: 1.2, length_in: 10, width_in: 8, height_in: 4, distance_miles: 800, residential: true, speed: "two_three_day", quantity: 45, price_charged: 14.99 },
    { weight_lb: 3.5, length_in: 14, width_in: 10, height_in: 6, distance_miles: 1900, residential: true, speed: "two_three_day", quantity: 15, price_charged: 19.99 },
    { weight_lb: 1, length_in: 10, width_in: 8, height_in: 4, distance_miles: 500, residential: true, speed: "next_day", quantity: 6, price_charged: 34.99 },
    { weight_lb: 6, length_in: 30, width_in: 6, height_in: 6, distance_miles: 700, residential: true, speed: "ground", quantity: 10, nonstandard_packaging: true },
    { weight_lb: 2, length_in: 12, width_in: 9, height_in: 4, distance_miles: 1100, residential: true, speed: "ground", quantity: 12, delivery_area: "das" },
  ],
};

/* ---------- toy price engine ---------- */

function zoneFor(carrier: Carrier, miles: number): number {
  const band = zone_bands.find(
    (b) => b.carrier === carrier && miles >= b.min_miles && (b.max_miles === null || miles <= b.max_miles),
  );
  return band ? band.zone : 8;
}

const tierFactor: Record<Tier, number> = { ground: 1, two_three_day: 1.9, next_day: 4.2 };
const yearFactor = (year: number) => Math.pow(1.059, year - 2026);

function fuelPercent(carrier: Carrier, tier: Tier, c: Controls): number {
  if (carrier === "usps") return 0;
  const group = tier === "ground" ? "ground" : "express";
  const override = c.fuel_override_percent?.[group];
  if (override !== undefined) return override;
  const row = fuel_defaults.find((f) => f.carrier === "fedex" && f.year === c.year && f.service_group === group);
  return row?.default_percent ?? 20;
}

function billable(p: Parcel, carrier: Carrier): { billable: number; dim: number | null } {
  const actual = p.weight_lb < 1 && carrier === "usps" ? Math.ceil(p.weight_lb * 16) / 16 : Math.ceil(p.weight_lb);
  if (p.length_in === undefined || p.width_in === undefined || p.height_in === undefined) {
    return { billable: actual, dim: null };
  }
  const volume = p.length_in * p.width_in * p.height_in;
  if (carrier === "usps" && volume <= 1728) return { billable: actual, dim: null };
  const dim = Math.ceil(volume / (carrier === "usps" ? 166 : 139));
  return { billable: Math.max(actual, dim), dim };
}

function priceService(p: Parcel, s: ServiceInfo, c: Controls): Quote {
  const carrier = s.carrier;
  const zone = zoneFor(carrier, p.distance_miles);
  const { billable: bw, dim } = billable(p, carrier);
  const available = p.residential ? s.residential_allowed : s.business_allowed;
  const tf = tierFactor[s.tier] * (s.service_id.endsWith("_air") || s.service_id.endsWith("priority_overnight") ? 1.15 : 1);
  const curve =
    carrier === "usps"
      ? 4.6 + 0.62 * zone + bw * (0.55 + 0.11 * zone) + (c.usps_rate_card === "retail" ? 1.6 : 0)
      : (carrier === "ups" ? 9.6 : 9.4) + 0.48 * zone + bw * (0.34 + 0.07 * zone);
  const base = round2(curve * tf * yearFactor(c.year));
  const items: LineItem[] = [{ kind: "base", label: "Base rate", amount: base, source: "mock" }];
  if (carrier !== "usps" && p.residential) {
    items.push({ kind: "surcharge", label: "Residential Surcharge", amount: round2(5.95 * yearFactor(c.year)), surcharge_id: `${carrier}_residential` });
  }
  if (carrier !== "usps" && p.delivery_area && p.delivery_area !== "none") {
    items.push({ kind: "surcharge", label: p.delivery_area === "das" ? "Delivery Area Surcharge" : "Extended Delivery Area Surcharge", amount: p.delivery_area === "das" ? 4.45 : 5.55 });
  }
  if (p.nonstandard_packaging) {
    items.push({ kind: "surcharge", label: carrier === "usps" ? "Nonstandard Fee" : "Additional Handling", amount: carrier === "usps" ? 4 : 25 });
  }
  if (c.peak && carrier !== "usps" && p.residential) {
    items.push({ kind: "surcharge", label: "Peak Surcharge", amount: 0.4 });
  }
  const fp = fuelPercent(carrier, s.tier, c);
  const fuelBase = items.reduce((sum, i) => sum + i.amount, 0);
  if (fp > 0) items.push({ kind: "fuel", label: `Fuel Surcharge (${fp}%)`, amount: round2((fuelBase * fp) / 100) });
  const total = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const price = p.price_charged ?? c.flat_price;
  return {
    carrier,
    service_id: s.service_id,
    service_name: s.display_name,
    tier: s.tier,
    zone,
    billable_weight_lb: bw,
    dim_weight_lb: dim,
    line_items: items,
    total,
    margin: round2(price - total),
    available,
    ...(available ? {} : { unavailable_reason: `${s.display_name} serves ${s.residential_allowed ? "residential" : "business"} addresses only` }),
  };
}

function cheapest(quotes: Quote[], tier: Tier, carrier?: Carrier): Quote | undefined {
  return quotes
    .filter((q) => q.available && q.tier === tier && (carrier === undefined || q.carrier === carrier))
    .sort((a, b) => a.total - b.total)[0];
}

const pick = (q: Quote): CarrierPick => ({ carrier: q.carrier, service_id: q.service_id, total: q.total });

export function mockQuote({ parcel, controls }: QuoteRequest): QuoteResponse {
  const quotes = services.map((s) => priceService(parcel, s, controls));
  const order = (q: Quote) => (q.tier === parcel.speed ? 0 : 1);
  quotes.sort((a, b) => order(a) - order(b) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.total - b.total);
  const cheapest_by_tier = Object.fromEntries(
    TIERS.map((t) => {
      const q = cheapest(quotes, t);
      return [t, q ? pick(q) : null];
    }),
  ) as Record<Tier, CarrierPick | null>;
  return { quotes, cheapest_by_tier };
}

const DEFAULT_DISTANCES = [25, 100, 225, 450, 800, 1200, 1600, 2000];

export function mockBreakeven(req: BreakevenRequest): BreakevenResponse {
  const weights = req.weights_lb ?? Array.from({ length: 70 }, (_, i) => i + 1);
  const distances = req.distances_miles ?? DEFAULT_DISTANCES;
  const cells: BreakevenCell[] = [];
  for (const w of weights) {
    for (const d of distances) {
      const parcel: Parcel = { weight_lb: w, distance_miles: d, residential: req.residential, speed: "ground" };
      const quotes = services.filter((s) => s.tier === "ground").map((s) => priceService(parcel, s, req.controls));
      const best = CARRIERS.map((c) => cheapest(quotes, "ground", c)).filter((q): q is Quote => !!q).sort((a, b) => a.total - b.total);
      const [winner, runner] = best;
      if (!winner || !runner) continue;
      cells.push({
        weight_lb: w,
        distance_miles: d,
        zone_usps: zoneFor("usps", d),
        zone_private: zoneFor("ups", d),
        winner: pick(winner),
        runner_up: pick(runner),
        saving: round2(runner.total - winner.total),
      });
    }
  }
  const breakeven_weight_lb = distances.map((d) => {
    const at = (vs: Carrier) => {
      for (const w of weights) {
        const parcel: Parcel = { weight_lb: w, distance_miles: d, residential: req.residential, speed: "ground" };
        const qs = services.filter((s) => s.tier === "ground").map((s) => priceService(parcel, s, req.controls));
        const u = cheapest(qs, "ground", "usps");
        const o = cheapest(qs, "ground", vs);
        if (u && o && o.total < u.total) return w;
      }
      return null;
    };
    return { distance_miles: d, vs_ups_lb: at("ups"), vs_fedex_lb: at("fedex") };
  });
  return { cells, breakeven_weight_lb };
}

function blendFor(parcels: Parcel[], controls: Controls, choose: (qs: Quote[], p: Parcel) => Quote | undefined, label: Carrier | "best_mix"): BlendedCarrier {
  let shipped = 0, unavailable = 0, cost = 0, base = 0, sur = 0, fuel = 0, margin = 0, losses = 0;
  const bySurcharge = new Map<string, number>();
  for (const p of parcels) {
    const qty = p.quantity ?? 1;
    const qs = services.map((s) => priceService(p, s, controls));
    const q = choose(qs, p);
    if (!q) { unavailable += qty; continue; }
    shipped += qty;
    cost += q.total * qty;
    margin += q.margin * qty;
    if (q.margin < 0) losses += qty;
    for (const li of q.line_items) {
      if (li.kind === "base") base += li.amount * qty;
      else if (li.kind === "fuel") fuel += li.amount * qty;
      else {
        sur += li.amount * qty;
        bySurcharge.set(li.label, (bySurcharge.get(li.label) ?? 0) + li.amount * qty);
      }
    }
  }
  const per = (n: number) => (shipped ? round2(n / shipped) : 0);
  const share = (n: number) => (cost ? Math.round((n / cost) * 1000) / 1000 : 0);
  return {
    carrier: label,
    parcels_shipped: shipped,
    parcels_unavailable: unavailable,
    cost_per_parcel: per(cost),
    split_per_parcel: { base: per(base), surcharges: per(sur), fuel: per(fuel) },
    split_share: { base: share(base), surcharges: share(sur), fuel: share(fuel) },
    surcharge_breakdown: [...bySurcharge.entries()].map(([lbl, amt]) => ({ label: lbl, amount_per_parcel: per(amt), share: share(amt) })),
    margin_per_parcel: per(margin),
    loss_share: shipped ? Math.round((losses / shipped) * 1000) / 1000 : 0,
  };
}

export function mockBlended({ parcels, controls }: BlendedRequest): BlendedResponse {
  const counts: Partial<Record<Carrier, number>> = {};
  const rows = CARRIERS.map((c) => blendFor(parcels, controls, (qs, p) => cheapest(qs, p.speed, c), c));
  rows.push(
    blendFor(parcels, controls, (qs, p) => {
      const q = cheapest(qs, p.speed);
      if (q) counts[q.carrier] = (counts[q.carrier] ?? 0) + (p.quantity ?? 1);
      return q;
    }, "best_mix"),
  );
  return { carriers: rows, best_mix_counts: counts };
}

export function mockYearly({ parcels, controls, next_year_increase_percent }: YearlyRequest): YearlyResponse {
  const announced: Record<Carrier, Record<number, number>> = {
    usps: { 2023: -0.7, 2024: 5.4, 2025: 3.9, 2026: 7.8 },
    ups: { 2023: 6.9, 2024: 5.9, 2025: 5.9, 2026: 5.9 },
    fedex: { 2023: 6.9, 2024: 5.9, 2025: 5.9, 2026: 5.9, 2027: 5.9 },
  };
  const carriers = CARRIERS.map((carrier) => {
    let prev: number | null = null;
    const points: YearPoint[] = mockMeta.years[carrier].map((year): YearPoint => {
      const r = blendFor(parcels, { ...controls, year }, (qs, p) => cheapest(qs, p.speed, carrier), carrier);
      const cost = r.cost_per_parcel;
      const change = prev === null ? null : round2(((cost - prev) / prev) * 100);
      prev = cost;
      return {
        year, cost_per_parcel: cost, change_percent: change,
        announced_increase_percent: announced[carrier][year] ?? null,
        announced_source: carrier === "ups" ? ("secondary" as const) : ("primary" as const),
      };
    });
    const last = points[points.length - 1];
    if (next_year_increase_percent !== undefined && last && last.cost_per_parcel !== null) {
      points.push({
        year: last.year + 1,
        cost_per_parcel: round2(last.cost_per_parcel * (1 + next_year_increase_percent / 100)),
        change_percent: next_year_increase_percent,
        announced_increase_percent: null,
        announced_source: null,
        projected: true,
      });
    }
    return { carrier, points };
  });
  const drivers = CARRIERS.flatMap((carrier) =>
    [2024, 2025, 2026].map((to_year) => ({
      carrier, from_year: to_year - 1, to_year,
      contributions: [
        { dimension: "residential" as const, band: "residential", contribution_per_parcel: 0.21 },
        { dimension: "weight_band" as const, band: "1–5", contribution_per_parcel: 0.14 },
        { dimension: "zone_band" as const, band: "5–6", contribution_per_parcel: 0.09 },
        { dimension: "speed" as const, band: "two_three_day", contribution_per_parcel: 0.05 },
      ],
    })),
  );
  return { carriers, drivers };
}
