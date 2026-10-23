"""Quote one parcel for one service, and for every service of every carrier."""

from __future__ import annotations

from decimal import Decimal

from .rules import (
    fuel_percent,
    match_surcharges,
    measure,
    resolve_as_of,
    resolve_dim_rule,
    source_label,
    zone_for,
)
from .tables import TIERS, RateTables, Service
from .types import Controls, LineItem, Parcel, Quote, money

ZERO = Decimal("0")


def rate_card_for(service: Service, controls: Controls) -> str:
    """USPS uses the dashboard control; UPS and FedEx publish one card."""
    if controls.usps_rate_card in service.rate_cards:
        return controls.usps_rate_card
    return service.rate_cards[0]


def price_charged(parcel: Parcel, controls: Controls) -> Decimal:
    value = parcel.price_charged if parcel.price_charged is not None else controls.flat_price
    return Decimal(str(value))


def _fmt_weight(w: Decimal) -> str:
    return f"{w.normalize():f}"


def _unavailable(service: Service, reason: str, zone=None, as_of=None, billable=None, dim=None) -> Quote:
    return Quote(
        carrier=service.carrier,
        service_id=service.service_id,
        service_name=service.display_name,
        tier=service.tier,
        zone=zone,
        billable_weight_lb=billable,
        dim_weight_lb=dim,
        line_items=(),
        total=ZERO,
        margin=ZERO,
        available=False,
        unavailable_reason=reason,
        as_of=as_of,
    )


def quote_service(
    tables: RateTables, service: Service, parcel: Parcel, controls: Controls, year: int | None = None
) -> Quote:
    year = controls.year if year is None else year
    carrier = service.carrier
    as_of = resolve_as_of(tables, carrier, year, controls)
    if as_of is None:
        return _unavailable(service, f"{carrier.upper()} has no {year} price list")

    if parcel.residential and not service.residential_allowed:
        return _unavailable(service, f"{service.display_name} serves business addresses only", as_of=as_of)
    if not parcel.residential and not service.business_allowed:
        return _unavailable(service, f"{service.display_name} serves residential addresses only", as_of=as_of)

    zone = zone_for(tables, carrier, parcel.distance_miles)
    if zone is None:
        return _unavailable(service, "distance is outside every zone band", as_of=as_of)

    rate_card = rate_card_for(service, controls)
    steps = tables.rate_steps(carrier, service.service_id, rate_card, year, zone)
    if not steps:
        return _unavailable(
            service, f"no {year} {rate_card} prices for {service.display_name}", zone=zone, as_of=as_of
        )

    dim_rule = resolve_dim_rule(tables, carrier, year, as_of)
    measured = measure(parcel, dim_rule)
    dim = float(measured.dim_weight) if measured.dim_weight is not None else None
    step = tables.find_step(steps, measured.weight)
    if step is None:
        return _unavailable(
            service,
            f"billable weight {_fmt_weight(measured.weight)} lb is above the heaviest published "
            f"price ({_fmt_weight(steps[-1].max_weight_lb)} lb)",
            zone=zone,
            as_of=as_of,
            dim=dim,
        )
    billable = step.max_weight_lb
    base_price = money(step.price)

    items: list[LineItem] = [
        LineItem(
            kind="base",
            label=f"{service.display_name} base rate (zone {zone}, {_fmt_weight(billable)} lb)",
            amount=base_price,
            source=source_label(step.source_file, step.source_ref),
        )
    ]
    applied = match_surcharges(
        tables,
        service=service,
        year=year,
        rate_card=rate_card,
        zone=zone,
        billable=billable,
        measured=measured,
        parcel=parcel,
        controls=controls,
        as_of=as_of,
        base_price=base_price,
    )
    fuel_basis = base_price
    for rule, amount in applied:
        items.append(
            LineItem(
                kind="surcharge",
                label=rule.display_name,
                amount=amount,
                surcharge_id=rule.surcharge_id,
                source=source_label(rule.source_file, rule.source_page),
                condition=rule.condition,
            )
        )
        if rule.fuel_applies:
            fuel_basis += amount

    pct, fuel_source = fuel_percent(tables, carrier, year, service, controls.fuel_override_percent)
    if pct is not None:
        items.append(
            LineItem(
                kind="fuel",
                label=f"Fuel Surcharge ({_fmt_weight(pct)}%)",
                amount=money(fuel_basis * pct / Decimal(100)),
                source=fuel_source,
            )
        )

    total = sum((li.amount for li in items), ZERO)
    return Quote(
        carrier=carrier,
        service_id=service.service_id,
        service_name=service.display_name,
        tier=service.tier,
        zone=zone,
        billable_weight_lb=float(billable),
        dim_weight_lb=dim,
        line_items=tuple(items),
        total=total,
        margin=price_charged(parcel, controls) - total,
        available=True,
        as_of=as_of,
    )


def quote_all(tables: RateTables, parcel: Parcel, controls: Controls) -> list[Quote]:
    """Every service of every carrier that publishes prices for the year,
    sorted by total within the parcel's tier first, then the other tiers."""
    quotes = [
        quote_service(tables, s, parcel, controls)
        for s in tables.services.values()
        if (s.carrier, controls.year) in tables.base_effective
    ]
    tier_rank = {t: i for i, t in enumerate(TIERS)}

    def key(q: Quote):
        return (
            q.tier != parcel.speed,
            tier_rank.get(q.tier, 99),
            not q.available,
            q.total,
        )

    return sorted(quotes, key=key)


def cheapest_by_tier(quotes: list[Quote]) -> dict[str, Quote | None]:
    result: dict[str, Quote | None] = {t: None for t in TIERS}
    for q in quotes:
        if not q.available:
            continue
        best = result.get(q.tier)
        if best is None or q.total < best.total:
            result[q.tier] = q
    return result


def cheapest_for_carrier(
    tables: RateTables, carrier: str, tier: str, parcel: Parcel, controls: Controls, year: int | None = None
) -> Quote | None:
    """Cheapest available service of one carrier in one tier, or None."""
    best: Quote | None = None
    for service in tables.services_for(carrier, tier):
        q = quote_service(tables, service, parcel, controls, year=year)
        if q.available and (best is None or q.total < best.total):
            best = q
    return best
