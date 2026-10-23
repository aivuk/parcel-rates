"""Pydantic models for the API contract (docs/API.md).

These mirror frontend/src/api/types.ts. Field constraints double as the 422
messages a shop owner sees (see app/api/errors.py).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Carrier = Literal["usps", "ups", "fedex"]
Tier = Literal["ground", "two_three_day", "next_day"]
DeliveryArea = Literal["none", "das", "extended"]
UspsRateCard = Literal["commercial", "retail"]
WeightBand = Literal["≤1", "1–5", "5–10", "10–20", "20–70"]
ZoneBand = Literal["1–2", "3–4", "5–6", "7–8"]

MAX_WEIGHT_LB = 70  # app cap from docs/API.md (USPS maximum); not a price
MAX_PARCELS = 10_000


# ---- requests -------------------------------------------------------------
class Parcel(BaseModel):
    weight_lb: float = Field(gt=0, le=MAX_WEIGHT_LB)
    length_in: float | None = Field(default=None, gt=0)
    width_in: float | None = Field(default=None, gt=0)
    height_in: float | None = Field(default=None, gt=0)
    distance_miles: float = Field(ge=0)
    residential: bool
    speed: Tier
    quantity: int = Field(default=1, ge=1)
    price_charged: float | None = Field(default=None, ge=0)
    delivery_area: DeliveryArea = "none"
    nonstandard_packaging: bool = False
    order_value: float | None = Field(default=None, ge=0, description="value of the order this parcel ships")

    @model_validator(mode="after")
    def _all_or_no_dimensions(self) -> "Parcel":
        given = [v is not None for v in (self.length_in, self.width_in, self.height_in)]
        if any(given) and not all(given):
            raise ValueError("give length_in, width_in and height_in together, or none of them")
        return self


class FuelOverride(BaseModel):
    ground: float | None = Field(default=None, ge=0, le=100)
    express: float | None = Field(default=None, ge=0, le=100)


class Controls(BaseModel):
    year: int | None = Field(default=None, description="default: latest year with all three carriers")
    as_of: date | None = None
    usps_rate_card: UspsRateCard = "commercial"
    fuel_override_percent: FuelOverride | None = None
    peak: bool = False
    flat_price: float = Field(default=9.99, ge=0)
    free_shipping_over: float | None = Field(
        default=None, ge=0, description="free shipping on orders of this value or more; needs order_value"
    )


class SegmentFilter(BaseModel):
    weight_band: WeightBand | None = None
    zone_band: ZoneBand | None = None
    residential: bool | None = None
    speed: Tier | None = None


class QuoteRequest(BaseModel):
    parcel: Parcel
    controls: Controls = Field(default_factory=Controls)


class BreakevenRequest(BaseModel):
    controls: Controls = Field(default_factory=Controls)
    residential: bool = True
    weights_lb: list[float] | None = Field(default=None, min_length=1, max_length=200)
    distances_miles: list[float] | None = Field(default=None, min_length=1, max_length=50)

    @model_validator(mode="after")
    def _grid_in_range(self) -> "BreakevenRequest":
        for w in self.weights_lb or []:
            if not 0 < w <= MAX_WEIGHT_LB:
                raise ValueError(f"every weight in weights_lb must be above 0 and at most {MAX_WEIGHT_LB}")
        for d in self.distances_miles or []:
            if d < 0:
                raise ValueError("distances_miles cannot be negative")
        return self


class BlendedRequest(BaseModel):
    parcels: list[Parcel] = Field(min_length=1, max_length=MAX_PARCELS)
    controls: Controls = Field(default_factory=Controls)
    segment: SegmentFilter | None = None


class YearlyRequest(BaseModel):
    parcels: list[Parcel] = Field(min_length=1, max_length=MAX_PARCELS)
    controls: Controls = Field(default_factory=Controls)
    next_year_increase_percent: float | None = Field(
        default=None,
        ge=-50,
        le=100,
        description="assumed increase for carriers that have not announced their next year",
    )
    next_year_override: bool = Field(
        default=False, description="apply next_year_increase_percent to every carrier, announced or not"
    )


# ---- responses ------------------------------------------------------------
class Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LineItem(Out):
    kind: Literal["base", "surcharge", "fuel"]
    label: str
    amount: float
    surcharge_id: str | None = None
    source: str | None = None
    condition: str | None = None


class Quote(Out):
    carrier: Carrier
    service_id: str
    service_name: str
    tier: Tier
    zone: int | None
    billable_weight_lb: float | None
    dim_weight_lb: float | None
    line_items: list[LineItem]
    total: float
    margin: float
    available: bool
    unavailable_reason: str | None = None
    as_of: date | None = None


class Pick(Out):
    carrier: Carrier
    service_id: str
    total: float


class QuoteResponse(Out):
    quotes: list[Quote]
    cheapest_by_tier: dict[Tier, Pick | None]


class BreakevenCell(Out):
    weight_lb: float
    distance_miles: float
    zone_usps: int | None
    zone_private: int | None
    winner: Pick | None
    runner_up: Pick | None
    saving: float
    totals: dict[Carrier, float]


class BreakevenBand(Out):
    distance_miles: float
    zone_usps: int | None
    zone_private: int | None
    vs_ups: float | None
    vs_fedex: float | None


class BreakevenResponse(Out):
    year: int
    residential: bool
    weights_lb: list[float]
    distances_miles: list[float]
    cells: list[BreakevenCell]
    breakeven_weight_lb: list[BreakevenBand]


class SplitPart(Out):
    per_parcel: float
    total: float
    share: float


class Split(Out):
    base: SplitPart
    surcharges: SplitPart
    fuel: SplitPart


class ConditionTotal(Out):
    condition: str
    total: float
    per_parcel: float
    share_of_cost: float


class Summary(Out):
    parcels_shipped: int
    parcels_unavailable: int
    total_cost: float
    cost_per_parcel: float
    split: Split
    surcharges_by_condition: list[ConditionTotal]
    margin_per_parcel: float
    total_margin: float
    loss_share: float
    parcels_at_loss: int


class CarrierBlended(Summary):
    carrier: Carrier
    services_used: dict[str, int]


class BestMix(Summary):
    parcels_by_carrier: dict[str, int]


class FreeShipping(Out):
    threshold: float
    parcels: int


class BlendedResponse(Out):
    year: int
    parcels_considered: int
    revenue_per_parcel: float
    free_shipping: FreeShipping | None
    carriers: list[CarrierBlended]
    best_mix: BestMix


class Change(Out):
    from_year: int
    dollars_per_parcel: float
    percent: float | None


class Announced(Out):
    percent: float | None
    basis: Literal["all", "average_of_services", "none"]
    services: list[str]
    source_type: str | None


class Driver(Out):
    segment: str
    parcels: int
    change_per_parcel: float
    change_total: float


class Drivers(Out):
    weight_band: list[Driver]
    zone_band: list[Driver]
    residential: list[Driver]
    speed: list[Driver]


class FuelGroupUsed(Out):
    default_percent: float | None
    is_proxy: bool | None
    applied_percent: float | None


class FuelUsed(Out):
    ground: FuelGroupUsed
    express: FuelGroupUsed


class YearRow(Out):
    year: int
    as_of: date | None
    cost_per_parcel: float
    summary: Summary
    services_used: list[str]
    change_vs_previous: Change | None
    announced_increase: Announced
    drivers: Drivers | None
    fuel: FuelUsed | None
    warnings: list[str]


class Projection(Out):
    year: int
    increase_percent: float
    cost_per_parcel: float
    basis: Literal["announced", "assumed", "override"]
    announced_percent: float | None
    source_type: str | None
    source_files: list[str]


class CarrierYears(Out):
    carrier: Carrier
    parcels_used: int
    parcels_excluded: int
    years: list[YearRow]
    projected: Projection | None


class YearlyResponse(Out):
    carriers: list[CarrierYears]


class SampleParcelsResponse(Out):
    description: str
    parcels: list[Parcel]


class ServiceOut(Out):
    carrier: Carrier
    service_id: str
    display_name: str
    tier: Tier
    residential_allowed: bool
    business_allowed: bool
    rate_cards: list[str]
    rate_card_notes: str
    max_weight_lb: int
    notes: str


class FuelDefault(Out):
    carrier: Carrier
    year: int
    service_group: Literal["ground", "express"]
    default_percent: float
    is_proxy: bool
    window_start: date | None
    window_end: date | None


class ZoneBandOut(Out):
    carrier: Carrier
    zone: int
    min_miles: int
    max_miles: int | None


class Defaults(Out):
    year: int
    usps_rate_card: UspsRateCard
    peak: bool
    flat_price: float
    as_of: dict[str, date]


class Segments(Out):
    weight_bands: list[str]
    zone_bands: list[str]


class MetaResponse(Out):
    years: dict[str, list[int]]
    services: list[ServiceOut]
    defaults: Defaults
    fuel_defaults: list[FuelDefault]
    zone_bands: list[ZoneBandOut]
    segments: Segments
    limitations: list[str]
