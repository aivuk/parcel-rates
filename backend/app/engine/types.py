"""Plain data types shared by the engine (no FastAPI or Pydantic here)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    """Round to cents, half up. Only line items are rounded."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Parcel:
    weight_lb: float
    distance_miles: float
    residential: bool
    speed: str
    length_in: float | None = None
    width_in: float | None = None
    height_in: float | None = None
    quantity: int = 1
    price_charged: float | None = None
    delivery_area: str = "none"
    nonstandard_packaging: bool = False
    order_value: float | None = None  # value of the order the parcel ships, for free-shipping rules
    # Set by the API from origin and destination ZIPs (issue #9): the USPS zone from its chart, and
    # whether distance_miles was computed from the two ZIPs rather than typed.
    usps_zone: int | None = None
    distance_from_zips: bool = False

    @property
    def has_dimensions(self) -> bool:
        return None not in (self.length_in, self.width_in, self.height_in)


@dataclass(frozen=True)
class FuelOverride:
    ground: float | None = None
    express: float | None = None


@dataclass(frozen=True)
class Controls:
    year: int
    as_of: date | None = None
    usps_rate_card: str = "commercial"
    fuel_override_percent: FuelOverride | None = None
    peak: bool = False
    flat_price: float = 9.99
    # Free shipping on orders of this value or more (None: no such rule).
    free_shipping_over: float | None = None


@dataclass(frozen=True)
class LineItem:
    kind: str  # base | surcharge | fuel
    label: str
    amount: Decimal
    surcharge_id: str | None = None
    source: str | None = None
    condition: str | None = None


@dataclass(frozen=True)
class Quote:
    carrier: str
    service_id: str
    service_name: str
    tier: str
    zone: int | None
    billable_weight_lb: float | None
    dim_weight_lb: float | None
    line_items: tuple[LineItem, ...]
    total: Decimal
    margin: Decimal
    available: bool
    unavailable_reason: str | None = None
    as_of: date | None = None
    zone_source: str = "distance"  # usps_chart | zip_distance (estimated) | distance (typed miles)

    def amount_of(self, kind: str) -> Decimal:
        return sum((li.amount for li in self.line_items if li.kind == kind), Decimal("0"))


@dataclass
class Totals:
    """Quantity-weighted accumulator of quotes."""

    parcels: int = 0
    total: Decimal = Decimal("0")
    base: Decimal = Decimal("0")
    surcharges: Decimal = Decimal("0")
    fuel: Decimal = Decimal("0")
    margin: Decimal = Decimal("0")
    loss_parcels: int = 0
    by_condition: dict[str, Decimal] = field(default_factory=dict)

    def add(self, quote: Quote, quantity: int) -> None:
        q = Decimal(quantity)
        self.parcels += quantity
        self.total += quote.total * q
        self.base += quote.amount_of("base") * q
        self.surcharges += quote.amount_of("surcharge") * q
        self.fuel += quote.amount_of("fuel") * q
        self.margin += quote.margin * q
        if quote.margin < 0:
            self.loss_parcels += quantity
        for li in quote.line_items:
            if li.kind == "surcharge":
                key = li.condition or "other"
                self.by_condition[key] = self.by_condition.get(key, Decimal("0")) + li.amount * q
