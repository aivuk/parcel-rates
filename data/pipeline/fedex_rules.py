"""Hand-transcribed FedEx rules (surcharges, announced increases, dimensional
weight, documented exceptions). Every amount cites the file, page and a
verbatim quote; data/tests/test_citations.py checks each quote against the
document. Written to CSV by `uv run python -m data.pipeline.fedex`.

Sources: surcharge_and_fee_changes_<year>.pdf ("new" column for that year; the
2024 document's "old" column recovers 2023), Service Guides, the archived
peak/demand-surcharge pages and rate-changes pages.
"""
from __future__ import annotations

from datetime import date, timedelta

CARRIER = "fedex"
CARD = "list"

# January effective date of each price list, from the rate documents.
EFFECTIVE = {2023: date(2023, 1, 2), 2024: date(2024, 1, 1), 2025: date(2025, 1, 6),
             2026: date(2026, 1, 5), 2027: date(2027, 1, 4)}

SC24 = "fedex/2024/surcharge_and_fee_changes_2024.pdf"
SC25 = "fedex/2025/surcharge_and_fee_changes_2025.pdf"
SC26 = "fedex/2026/surcharge_and_fee_changes_2026.pdf"
SG23 = "fedex/2023/Service_Guide_2023.pdf"
SG24 = "fedex/2024/Service_Guide_2024.pdf"
SG25 = "fedex/2025/Service_Guide_2025.pdf"
SG26 = "fedex/2026/Service_Guide_2026.pdf"
XLSX27 = "fedex/2027/FedEx_Standard_List_Rates_2027.xlsx"
PEAK23 = "fedex/2023/peak-surcharges_page_wayback_2022-11.html"
DEM24 = "fedex/2024/demand-surcharges_page_wayback_2023-12.html"
DEM25 = "fedex/2025/demand-surcharges_page_wayback_2024-11.html"
DEM26 = "fedex/2026/demand-surcharges_page_wayback_2025-11.html"
DEM27 = "fedex/2027/demand-surcharges_page_wayback_2026-10.html"
RC = {2023: "fedex/2023/rate-changes_page_wayback_2023-01-01.html",
      2024: "fedex/2024/rate-changes_page_wayback_2024-04-07.html",
      2025: "fedex/2025/rate-changes_page_wayback_2025-01-02.html",
      2026: "fedex/2026/rate-changes_page_wayback_2026-01-24.html",
      2027: "fedex/2027/rate-changes_page_wayback_2026-10-11.html"}

EXPRESS = "fedex_express_saver,fedex_2day,fedex_standard_overnight,fedex_priority_overnight"
OVERNIGHT = "fedex_standard_overnight,fedex_priority_overnight"
DEFERRED = "fedex_express_saver,fedex_2day"
HOME = "fedex_home_delivery"
GROUND_AND_EXPRESS = "fedex_ground," + EXPRESS  # commercial-address rules
HOME_AND_EXPRESS = HOME + "," + EXPRESS           # residential-address rules

# fedex.com/en-us/shipping/fuel-surcharge.html (archived 2023-05-22 and 2025-12-05):
# "the related fuel surcharge is assessed on the net package rate plus the following
# applicable surcharges: additional handling, ... delivery area surcharge, ... oversize,
# peak - additional handling, peak - oversize, peak-residential, peak surcharge,
# residential delivery, ..." (Express) and "... additional handling, ... delivery area
# surcharge, ... oversize, peak - additional handling, ... peak - oversize,
# peak-residential, ... residential delivery ..." (Ground). Every rule below is in
# those lists, so fuel_applies is true throughout.
FUEL_NOTE = ("fuel applies: listed in the fuel-surcharge page's 'assessed on the net package rate plus "
             "the following applicable surcharges' sentence (fuel-surcharge_page_wayback_2023-05-22.html, "
             "fuel-surcharge_page_wayback_2025-12-05.html)")

TIERS = ((2, 2), (3, 4), (5, 6), (7, 8))  # Zone 2 / Zones 3-4 / Zones 5-6 / Zone 7+
MID_2025 = "2025-07-14"         # "*Effective July 14, 2025" interim increases
MID_2025_BEFORE = "2025-07-13"


def year_end(year: int) -> str:
    return (EFFECTIVE[year + 1] - timedelta(days=1)).isoformat() if year + 1 in EFFECTIVE else ""


def rule(year, surcharge_id, display_name, condition, applies_to, amount, source_file, quote, *,
         source_page="", effective_from=None, effective_to=None, exclusive_group="", notes="",
         zone=None, **thresholds) -> dict:
    row = {
        "carrier": CARRIER, "year": year, "rate_card": CARD, "surcharge_id": surcharge_id,
        "display_name": display_name, "condition": condition, "applies_to": applies_to,
        "address_type": "residential" if condition in ("residential", "peak_residential") else "any",
        "amount": amount, "unit": "usd", "exclusive_group": exclusive_group,
        "effective_from": effective_from or EFFECTIVE[year].isoformat(),
        "effective_to": year_end(year) if effective_to is None else effective_to,
        "fuel_applies": "true", "source_file": source_file, "source_page": source_page,
        "source_quote": quote, "notes": (notes + "; " if notes else "") + FUEL_NOTE,
    }
    if zone:
        row["zone_min"], row["zone_max"] = zone
    row.update(thresholds)
    return row


# --------------------------------------------------------------------------- residential

RESIDENTIAL = [
    # (year, applies_to, amount, file, page, quote, notes)
    (2023, EXPRESS, "5.80", SG23, 117, "U.S. Express Package Services $5.80 per package", ""),
    (2023, HOME, "5.15", SG23, 117, "U.S. Ground Services, $5.50 per package ($5.15 per package",
     "Home Delivery rate; the $5.50 figure is for FedEx Ground, a business-only service"),
    (2024, EXPRESS, "6.15", SC24, 7, "Residential Delivery Charge U.S. Package Services $5.80 per package $6.15 per package", ""),
    (2024, HOME, "5.55", SC24, 7, "FedEx Home Delivery Shipments $5.15 per package $5.55 per package", ""),
    (2025, EXPRESS, "6.55", SC25, 6, "Residential Delivery Charge U.S. Package Services $6.15 per package $6.55 per package", ""),
    (2025, HOME, "5.95", SC25, 6, "FedEx Ground, FedEx Home Delivery, $5.55 per package $5.95 per package", ""),
    (2026, EXPRESS, "6.95", SC26, 7, "Residential Delivery Charge U.S. Package Services $6.55 per package $6.95 per package", ""),
    (2026, HOME, "6.45", SC26, 7, "FedEx Ground, FedEx Home Delivery, and $5.95 per package $6.45 per package", ""),
    (2027, HOME, "6.90", XLSX27, "", "A $6.90 residential surcharge per package will be added to FedEx Home Delivery shipments",
     "from the note under the 2027 Ground & FHD rate sheet; surcharge_and_fee_changes_2027.pdf is not archived, "
     "so the 2027 Express residential charge is not recorded"),
]


def residential_rows() -> list[dict]:
    rows = []
    for year, applies, amount, file, page, quote, notes in RESIDENTIAL:
        group = "express" if applies == EXPRESS else "home_delivery"
        rows.append(rule(year, f"fedex_residential_{group}_{year}", "Residential Delivery Charge", "residential",
                         applies, amount, file, quote, source_page=page, notes=notes))
    return rows


# --------------------------------------------------------------------------- delivery area

DAS = [
    # (year, variant, applies_to, amount, file, page, quote, notes)
    (2023, "residential", EXPRESS, "5.55", SC24, 4, "U.S. Package Services (Residential) $5.55 per package", ""),
    (2023, "residential_home_delivery", HOME, "5.30", SC24, 4, "FedEx Home Delivery® Shipments $5.30 per package", ""),
    (2023, "extended_residential", HOME_AND_EXPRESS, "7.15", SC24, 4, "U.S. Package Services (Extended $7.15 per package",
     "no separate Home Delivery extended rate is listed; the U.S. Package Services rate is applied to Home Delivery too"),
    (2023, "commercial", GROUND_AND_EXPRESS, "3.70", SC24, 4, "U.S. Package Services (Commercial) $3.70 per package", ""),
    (2023, "extended_commercial", GROUND_AND_EXPRESS, "4.50", SC24, 4, "U.S. Package Services (Extended $4.50 per package", ""),
    (2024, "residential", EXPRESS, "5.85", SC24, 4, "U.S. Package Services (Residential) $5.55 per package $5.85 per package", ""),
    (2024, "residential_home_delivery", HOME, "5.70", SC24, 4, "FedEx Home Delivery® Shipments $5.30 per package $5.70 per package", ""),
    (2024, "extended_residential", HOME_AND_EXPRESS, "7.70", SC24, 4, "$7.15 per package $7.70 per package",
     "no separate Home Delivery extended rate is listed; the U.S. Package Services rate is applied to Home Delivery too"),
    (2024, "commercial", GROUND_AND_EXPRESS, "3.95", SC24, 4, "U.S. Package Services (Commercial) $3.70 per package $3.95 per package", ""),
    (2024, "extended_commercial", GROUND_AND_EXPRESS, "4.90", SC24, 4, "$4.50 per package $4.90 per package", ""),
    (2025, "residential", EXPRESS, "6.20", SC25, 3, "FedEx First Overnight®, FedEx Priority $5.85 per package $6.20 per package", ""),
    (2025, "residential_home_delivery", HOME, "6.20", SC25, 3, "FedEx Ground® and FedEx Home $5.70 per package $6.20 per package", ""),
    (2025, "extended_residential", HOME_AND_EXPRESS, "8.30", SC25, 3, "$7.70 per package $8.30 per package", ""),
    (2025, "commercial", GROUND_AND_EXPRESS, "4.20", SC25, 3, "U.S. Package Services (Commercial) $3.95 per package $4.20 per package", ""),
    (2025, "extended_commercial", GROUND_AND_EXPRESS, "5.25", SC25, 3, "$4.90 per package $5.25 per package", ""),
    (2026, "residential", EXPRESS, "6.60", SC26, 4, "U.S. Package Services (Residential) $6.20 per package $6.60 per package", ""),
    (2026, "residential_home_delivery", HOME, "6.60", SC26, 4, "U.S. Package Services (Residential) $6.20 per package $6.60 per package",
     "the 2026 document lists no separate Home Delivery line; it defines U.S. Package Services to include FedEx Ground and FedEx Home Delivery"),
    (2026, "extended_residential", HOME_AND_EXPRESS, "8.80", SC26, 4, "(Extended Residential) $8.30 per package $8.80 per package", ""),
    (2026, "commercial", GROUND_AND_EXPRESS, "4.45", SC26, 4, "U.S. Package Services (Commercial) $4.20 per package $4.45 per package", ""),
    (2026, "extended_commercial", GROUND_AND_EXPRESS, "5.55", SC26, 4, "$5.25 per package $5.55 per package (Extended Commercial)", ""),
]
DAS_NOTE = "Remote tier (Remote Commercial, Remote Residential) and Alaska/Hawaii DAS are not recorded (no such delivery_area value)"


def das_rows() -> list[dict]:
    rows = []
    for year, variant, applies, amount, file, page, quote, notes in DAS:
        condition = "delivery_area_extended" if variant.startswith("extended") else "delivery_area"
        label = "Extended " if variant.startswith("extended") else ""
        name = f"Delivery Area Surcharge ({label}{'Residential' if 'residential' in variant else 'Commercial'})"
        rows.append(rule(year, f"fedex_das_{variant}_{year}", name, condition, applies, amount, file, quote,
                         source_page=page, exclusive_group="delivery_area",
                         address_type="residential" if "residential" in variant else "commercial",
                         notes=(notes + "; " if notes else "") + DAS_NOTE))
    return rows


# --------------------------------------------------------------------------- additional handling / oversize

# Thresholds (Service Guide, Additional Handling Surcharge definition, e.g. SG 2025 file page 127):
# "1) measures greater than 48 inches along its longest side; 2) measures greater than 30 inches
# along its second-longest side; 3) measures greater than 105 inches in length and girth ...;
# 4) has an actual weight greater than 50 lbs." Packaging: not fully encased in an outer
# shipping container, cylindrical, etc.
AH_KINDS = {
    "dimension": [
        ("additional_handling_length", {"min_length_in": "48"}, "Additional Handling Surcharge (Dimension: longest side greater than 48 inches)"),
        ("additional_handling_width", {"min_width_in": "30"}, "Additional Handling Surcharge (Dimension: second-longest side greater than 30 inches)"),
        ("additional_handling_length", {"min_length_plus_girth_in": "105"}, "Additional Handling Surcharge (Dimension: length plus girth greater than 105 inches)"),
    ],
    "weight": [("additional_handling_weight", {"min_weight_lb": "50"}, "Additional Handling Surcharge (Weight: actual weight greater than 50 lbs)")],
    "packaging": [("additional_handling_packaging", {}, "Additional Handling Surcharge (Packaging)")],
}

# (year, kind, file, page, [(tier, amount, quote)], effective_from)
AH = [
    (2023, "dimension", SC24, 1, [(0, "18.50", "Zone 2: $18.50 per package"), (1, "20.50", "Zones 3–41: $20.50 per package"),
                                  (2, "22.50", "Zones 5–6: $22.50 per package"), (3, "25.00", "Zone 7+2: $25 per package")], None),
    (2023, "weight", SC24, 1, [(0, "29.00", "Zone 2: $29 per package"), (1, "31.50", "Zones 3–41: $31.50 per package"),
                               (2, "33.50", "Zones 5–6: $33.50 per package"), (3, "36.00", "Zone 7+2: $36 per package")], None),
    (2023, "packaging", SC24, 1, [(0, "16.50", "Zone 2: $16.50 per package"), (1, "19.00", "Zones 3–41: $19 per package"),
                                  (2, "20.00", "Zones 5–6: $20 per package"), (3, "21.00", "Zone 7+2: $21 per package")], None),
    (2024, "dimension", SC24, 1, [(0, "22.00", "Zone 2: $22 per package"), (1, "24.50", "Zones 3–41: $24.50 per package"),
                                  (2, "27.00", "Zones 5–6: $27 per package"), (3, "30.00", "Zone 7+2: $30 per package")], None),
    (2024, "weight", SC24, 1, [(0, "34.50", "Zone 2: $34.50 per package"), (1, "37.50", "Zones 3–41: $37.50 per package"),
                               (2, "40.00", "Zones 5–6: $40 per package"), (3, "43.50", "Zone 7+2: $43.50 per package")], None),
    (2024, "packaging", SC24, 1, [(0, "19.50", "Zone 2: $19.50 per package"), (1, "23.00", "Zones 3–41: $23 per package"),
                                  (2, "24.00", "Zones 5–6: $24 per package"), (3, "25.00", "Zone 7+2: $25 per package")], None),
    (2025, "dimension", SC25, 1, [(0, "28.00", "Zone 2: $28 per package"), (1, "31.00", "Zones 3-41: $31 per package"),
                                  (2, "34.00", "Zones 5-6: $34 per package"), (3, "38.00", "Zone 7+2: $38 per package")], None),
    (2025, "weight", SC25, 1, [(0, "43.50", "Zone 2: $43.50 per package"), (1, "47.50", "Zones 3-41: $47.50 per package"),
                               (2, "50.50", "Zones 5-6: $50.50 per package"), (3, "55.00", "Zone 7+2: $55 per package")], None),
    (2025, "packaging", SC25, 1, [(0, "25.00", "Zone 2: $25 per package"), (1, "29.00", "Zones 3-41: $29 per package"),
                                  (2, "30.50", "Zones 5-6: $30.50 per package"), (3, "31.50", "Zone 7+2: $31.50 per package")], None),
    # Mid-2025 increase for Zones 5-6 only ("*Effective July 14, 2025" in the 2026 document's 2025 column).
    (2025, "dimension", SC26, 1, [(2, "36.00", "Zones 5-6: $36 per package*")], MID_2025),
    (2025, "weight", SC26, 1, [(2, "52.75", "Zones 5-6: $52.75 per package*")], MID_2025),
    (2025, "packaging", SC26, 2, [(2, "31.00", "Zones 5-6: $31 per package*")], MID_2025),
    (2026, "dimension", SC26, 1, [(0, "29.50", "Zone 2: $29.50 per package"), (1, "32.75", "Zones 3-41: $32.75 per package"),
                                  (2, "38.50", "Zones 5-6: $38.50 per package"), (3, "40.75", "Zone 7+2: $40.75 per package")], None),
    (2026, "weight", SC26, 1, [(0, "46.00", "Zone 2: $46 per package"), (1, "50.25", "Zones 3-41: $50.25 per package"),
                               (2, "56.25", "Zones 5-6: $56.25 per package"), (3, "58.75", "Zone 7+2: $58.75 per package")], None),
    (2026, "packaging", SC26, 2, [(0, "26.50", "Zone 2: $26.50 per package"), (1, "30.75", "Zones 3-41: $30.75 per package"),
                                  (2, "33.00", "Zones 5-6: $33 per package"), (3, "33.75", "Zone 7+2: $33.75 per package")], None),
]
AH_NOTE = ("zone-tiered (Zone 2 / Zones 3-4 / Zones 5-6 / Zone 7+); applies to U.S. Package Services (Express, Ground and Home "
           "Delivery); does not stack with other additional-handling kinds or the Oversize Charge (highest applies)")


def additional_handling_rows() -> list[dict]:
    rows = []
    for year, kind, file, page, tiers, eff_from in AH:
        for tier, amount, quote in tiers:
            # The January row of the tier that changed mid-2025 ends the day before the change.
            ends = MID_2025_BEFORE if (year == 2025 and eff_from is None and tier == 2) else None
            for condition, thresholds, name in AH_KINDS[kind]:
                suffix = "_girth" if "min_length_plus_girth_in" in thresholds else ""
                window = f"_{eff_from}" if eff_from else ""
                rows.append(rule(year, f"fedex_ah_{kind}{suffix}_{condition.split('_')[-1]}_z{TIERS[tier][0]}_{year}{window}",
                                 name, condition, "all", amount, file, quote, source_page=page,
                                 exclusive_group="non_standard", effective_from=eff_from, effective_to=ends,
                                 zone=TIERS[tier], notes=AH_NOTE, **thresholds))
    return rows


# Oversize Charge (Service Guide, e.g. SG 2025 file page 139): "An oversize charge applies to
# packages that exceed 96 inches in length or 130 inches in length and girth."
# (year, service group, file, page, [(tier, amount, quote)], effective_from, effective_to)
OVERSIZE = [
    (2023, "express_ground", SC24, 7, [(0, "135.00", "Zone 2: $135 per package"), (1, "145.00", "Zones 3–41: $145 per package"),
                                       (2, "160.00", "Zones 5–6: $160 per package"), (3, "170.00", "Zones 7+2: $170 per package")], None, None),
    (2023, "home_delivery", SC24, 7, [(0, "160.00", "Zone 2: $160 per package"), (1, "170.00", "Zones 3–41: $170 per package"),
                                      (2, "190.00", "Zones 5–6: $190 per package"), (3, "200.00", "Zones 7+2: $200 per package")], None, None),
    (2024, "express_ground", SC24, 7, [(0, "160.00", "Zone 2: $160 per package"), (1, "175.00", "Zones 3–41: $175 per package"),
                                       (2, "190.00", "Zones 5–6: $190 per package"), (3, "205.00", "Zones 7+2: $205 per package")], None, None),
    (2024, "home_delivery", SC24, 7, [(0, "190.00", "Zone 2: $190 per package"), (1, "205.00", "Zones 3–41: $205 per package"),
                                      (2, "230.00", "Zones 5–6: $230 per package"), (3, "240.00", "Zones 7+2: $240 per package")], None, None),
    (2025, "express_ground", SC25, 6, [(0, "205.00", "Zone 2: $205 per package"), (1, "225.00", "Zones 3–41: $225 per package"),
                                       (2, "240.00", "Zones 5–6: $240 per package"), (3, "260.00", "Zones 7+2: $260 per package")], None, MID_2025_BEFORE),
    (2025, "home_delivery", SC25, 6, [(0, "240.00", "Zone 2: $240 per package"), (1, "260.00", "Zones 3–41: $260 per package"),
                                      (2, "290.00", "Zones 5–6: $290 per package"), (3, "305.00", "Zones 7+2: $305 per package")], None, None),
    # "*Effective July 14, 2025" (2026 document, 2025 column).
    (2025, "express_ground", SC26, 6, [(0, "240.00", "Zone 2: $240 per package*"), (1, "260.00", "Zones 3–41: $260 per package*"),
                                       (2, "297.50", "Zones 5–6: $297.50 per package*"), (3, "305.00", "Zones 7+2: $305 per package*")], MID_2025, None),
    (2025, "home_delivery", SC26, 6, [(2, "297.50", "Zones 5–6: $297.50 per package*")], MID_2025, None),
    (2026, "express_ground", SC26, 6, [(0, "255.00", "Zone 2: $255 per package"), (1, "275.00", "Zones 3–41: $275 per package"),
                                       (2, "320.00", "Zones 5–6: $320 per package"), (3, "330.00", "Zones 7+2: $330 per package")], None, None),
    (2026, "home_delivery", SC26, 6, [(0, "255.00", "Zone 2: $255 per package"), (1, "275.00", "Zones 3–41: $275 per package"),
                                      (2, "320.00", "Zones 5–6: $320 per package"), (3, "330.00", "Zones 7+2: $330 per package")], None, None),
]
OVERSIZE_TRIGGERS = [({"min_length_plus_girth_in": "130"}, "girth"), ({"min_length_in": "96"}, "length")]
OVERSIZE_NOTE = ("zone-tiered; replaces the Additional Handling Surcharge when both apply (same exclusive group, highest amount "
                 "wins); the 90-lb minimum billable weight is not modeled")


def oversize_rows() -> list[dict]:
    rows = []
    for year, group, file, page, tiers, eff_from, eff_to in OVERSIZE:
        applies = HOME if group == "home_delivery" else GROUND_AND_EXPRESS
        for tier, amount, quote in tiers:
            ends = eff_to
            if year == 2025 and group == "home_delivery" and eff_from is None and tier == 2:
                ends = MID_2025_BEFORE
            for thresholds, trigger in OVERSIZE_TRIGGERS:
                window = f"_{eff_from}" if eff_from else ""
                rows.append(rule(year, f"fedex_oversize_{group}_{trigger}_z{TIERS[tier][0]}_{year}{window}",
                                 "Oversize Charge", "oversize", applies, amount, file, quote, source_page=page,
                                 exclusive_group="non_standard", effective_from=eff_from, effective_to=ends,
                                 zone=TIERS[tier], notes=OVERSIZE_NOTE, **thresholds))
    return rows


# --------------------------------------------------------------------------- peak / demand

# Windows are split at the January effective date so every row lies inside its
# price-list year. (file, condition, applies_to, display_name, [(amount, quote, start, end)])
PEAK = [
    (PEAK23, "peak_additional_handling", "all", "Peak - Additional Handling Surcharge",
     [("6.55", "$6.55 per package", "2022-10-03", "2023-01-15")]),
    (PEAK23, "peak_oversize", "all", "Peak - Oversize Charge",
     [("68.75", "$68.75 per package", "2022-10-03", "2023-01-15")]),
    (DEM24, "peak_additional_handling", "all", "Demand - Additional Handling Surcharge",
     [("6.95", "$6.95 per package Oct. 2, 2023–Jan. 14, 2024", "2023-10-02", "2024-01-14")]),
    (DEM24, "peak_oversize", "all", "Demand - Oversize Charge",
     [("73.00", "$73 per package Oct. 2, 2023–Jan. 14, 2024", "2023-10-02", "2024-01-14")]),
    (DEM25, "peak_additional_handling", "all", "Demand - Additional Handling Surcharge",
     [("3.45", "$3.45 per package $7.75 per package $10 per package $7.75 per package Feb. 5–Sept. 29, 2024", "2024-02-05", "2024-09-29"),
      ("7.75", "$7.75 per package $10 per package $7.75 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024", "2024-09-30", "2024-11-24"),
      ("10.00", "$10 per package $7.75 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024 Nov. 25–Dec. 29, 2024", "2024-11-25", "2024-12-29"),
      ("7.75", "$7.75 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024 Nov. 25–Dec. 29, 2024 Dec. 30, 2024–Jan. 19, 2025", "2024-12-30", "2025-01-19")]),
    (DEM25, "peak_oversize", "all", "Demand - Oversize Charge",
     [("39.50", "$39.50 per package $84.50 per package $100 per package $84.50 per package Feb. 5–Sept. 29, 2024", "2024-02-05", "2024-09-29"),
      ("84.50", "$84.50 per package $100 per package $84.50 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024", "2024-09-30", "2024-11-24"),
      ("100.00", "$100 per package $84.50 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024 Nov. 25–Dec. 29, 2024", "2024-11-25", "2024-12-29"),
      ("84.50", "$84.50 per package Feb. 5–Sept. 29, 2024 Sept. 30–Nov. 24, 2024 Nov. 25–Dec. 29, 2024 Dec. 30, 2024–Jan. 19, 2025", "2024-12-30", "2025-01-19")]),
    (DEM25, "peak_base", EXPRESS, "Demand Surcharge (Express package services)",
     [("1.00", "$1 per package $2 per package $1 per package Oct. 28–Nov. 24, 2024", "2024-10-28", "2024-11-24"),
      ("2.00", "$2 per package $1 per package Oct. 28–Nov. 24, 2024 Nov. 25–Dec. 29, 2024", "2024-11-25", "2024-12-29"),
      ("1.00", "$1 per package Oct. 28–Nov. 24, 2024 Nov. 25–Dec. 29, 2024 Dec. 30, 2024–Jan. 19, 2025", "2024-12-30", "2025-01-19")]),
    (DEM25, "peak_residential", HOME, "Demand Surcharge (Ground and Home Delivery residential shipments)",
     [("0.30", "$0.30 per package $0.55 per package $0.30 per package Oct. 28–Nov. 24, 2024", "2024-10-28", "2024-11-24"),
      ("0.55", "$0.55 per package $0.30 per package Oct. 28–Nov. 24, 2024 Nov. 25–Dec. 29, 2024", "2024-11-25", "2024-12-29"),
      ("0.30", "$0.30 per package Oct. 28–Nov. 24, 2024 Nov. 25–Dec. 29, 2024 Dec. 30, 2024–Jan. 19, 2025", "2024-12-30", "2025-01-19")]),
    (DEM26, "peak_additional_handling", "all", "Demand - Additional Handling Surcharge",
     [("8.25", "$8.25 per package $10.90 per package $8.25 per package Sept. 29–Nov. 23, 2025", "2025-09-29", "2025-11-23"),
      ("10.90", "$10.90 per package $8.25 per package Sept. 29–Nov. 23, 2025 Nov. 24–Dec. 28, 2025", "2025-11-24", "2025-12-28"),
      ("8.25", "$8.25 per package Sept. 29–Nov. 23, 2025 Nov. 24–Dec. 28, 2025 Dec. 29, 2025–Jan. 18, 2026", "2025-12-29", "2026-01-18")]),
    (DEM26, "peak_oversize", "all", "Demand - Oversize Charge",
     [("90.00", "$90 per package $108.50 per package $90 per package Sept. 29–Nov. 23, 2025", "2025-09-29", "2025-11-23"),
      ("108.50", "$108.50 per package $90 per package Sept. 29–Nov. 23, 2025 Nov. 24–Dec. 28, 2025", "2025-11-24", "2025-12-28"),
      ("90.00", "$90 per package Sept. 29–Nov. 23, 2025 Nov. 24–Dec. 28, 2025 Dec. 29, 2025–Jan. 18, 2026", "2025-12-29", "2026-01-18")]),
    (DEM26, "peak_base", EXPRESS, "Demand Surcharge (Express package services)",
     [("1.05", "$1.05 per package $2.10 per package $1.05 per package Oct. 27–Nov. 23, 2025", "2025-10-27", "2025-11-23"),
      ("2.10", "$2.10 per package $1.05 per package Oct. 27–Nov. 23, 2025 Nov. 24–Dec. 28, 2025", "2025-11-24", "2025-12-28"),
      ("1.05", "$1.05 per package Oct. 27–Nov. 23, 2025 Nov. 24–Dec. 28, 2025 Dec. 29, 2025–Jan. 18, 2026", "2025-12-29", "2026-01-18")]),
    (DEM26, "peak_residential", HOME, "Demand Surcharge (Ground and Home Delivery residential shipments)",
     [("0.40", "$0.40 per package $0.65 per package $0.40 per package Oct. 27–Nov. 23, 2025", "2025-10-27", "2025-11-23"),
      ("0.65", "$0.65 per package $0.40 per package Oct. 27–Nov. 23, 2025 Nov. 24–Dec. 28, 2025", "2025-11-24", "2025-12-28"),
      ("0.40", "$0.40 per package Oct. 27–Nov. 23, 2025 Nov. 24–Dec. 28, 2025 Dec. 29, 2025–Jan. 18, 2026", "2025-12-29", "2026-01-18")]),
    (DEM27, "peak_additional_handling", "all", "Demand - Additional Handling Surcharge",
     [("8.80", "$8.80 per package $11.85 per package $8.80 per package Sept. 28–Nov. 22, 2026", "2026-09-28", "2026-11-22"),
      ("11.85", "$11.85 per package $8.80 per package Sept. 28–Nov. 22, 2026 Nov. 23–Dec. 27, 2026", "2026-11-23", "2026-12-27"),
      ("8.80", "$8.80 per package Sept. 28–Nov. 22, 2026 Nov. 23–Dec. 27, 2026 Dec. 28, 2026–Jan. 17, 2027", "2026-12-28", "2027-01-17")]),
    (DEM27, "peak_oversize", "all", "Demand - Oversize Charge",
     [("95.75", "$ 95.75 per package $117.25 per package $95.75 per package Sept. 28–Nov. 22, 2026", "2026-09-28", "2026-11-22"),
      ("117.25", "$117.25 per package $95.75 per package Sept. 28–Nov. 22, 2026 Nov. 23–Dec. 27, 2026", "2026-11-23", "2026-12-27"),
      ("95.75", "$95.75 per package Sept. 28–Nov. 22, 2026 Nov. 23–Dec. 27, 2026 Dec. 28, 2026–Jan. 17, 2027", "2026-12-28", "2027-01-17")]),
    (DEM27, "peak_base", OVERNIGHT, "Demand Surcharge (overnight Express services)",
     [("1.30", "$1.30 per package $2.55 per package $1.30 per package Oct. 26–Nov. 22, 2026", "2026-10-26", "2026-11-22"),
      ("2.55", "$2.55 per package $1.30 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026", "2026-11-23", "2026-12-27"),
      ("1.30", "$1.30 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026 Dec. 28, 2026–Jan. 17, 2027", "2026-12-28", "2027-01-17")]),
    (DEM27, "peak_base", DEFERRED, "Demand Surcharge (FedEx 2Day and Express Saver)",
     [("1.20", "$1.20 per package $2.35 per package $1.20 per package Oct. 26–Nov. 22, 2026", "2026-10-26", "2026-11-22"),
      ("2.35", "$2.35 per package $1.20 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026", "2026-11-23", "2026-12-27"),
      ("1.20", "$1.20 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026 Dec. 28, 2026–Jan. 17, 2027", "2026-12-28", "2027-01-17")]),
    (DEM27, "peak_residential", HOME, "Demand Surcharge (Ground and Home Delivery residential shipments)",
     [("0.50", "$0.50 per package $0.80 per package $0.50 per package Oct. 26–Nov. 22, 2026", "2026-10-26", "2026-11-22"),
      ("0.80", "$0.80 per package $0.50 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026", "2026-11-23", "2026-12-27"),
      ("0.50", "$0.50 per package Oct. 26–Nov. 22, 2026 Nov. 23–Dec. 27, 2026 Dec. 28, 2026–Jan. 17, 2027", "2026-12-28", "2027-01-17")]),
]
PEAK_NOTES = {
    "peak_additional_handling": "adds to the Additional Handling Surcharge for packages meeting its criteria; does not stack with the Demand/Peak Oversize Charge",
    "peak_oversize": "adds to the Oversize Charge for packages meeting its criteria; does not stack with the Demand/Peak Additional Handling Surcharge",
    "peak_base": "per-package Demand Surcharge on U.S. Express package services (excluding FedEx One Rate)",
    "peak_residential": ("per-package Demand Surcharge on Ground and Home Delivery residential shipments; the separate volume-based "
                         "Demand - Residential Delivery Charge (enterprise shippers above 20,000 packages a week, peaking factor) is not modeled"),
}
TAGS = {"all": "", HOME: "", EXPRESS: "_express", OVERNIGHT: "_overnight", DEFERRED: "_deferred"}


def year_of(day: date) -> int:
    """Price-list year in force on `day`; 2022 for days before the 2023 list (not in scope)."""
    return max((year for year, start in EFFECTIVE.items() if start <= day), default=min(EFFECTIVE) - 1)


def peak_rows() -> list[dict]:
    rows = []
    for file, condition, applies, name, windows in PEAK:
        group = "peak_non_standard" if condition in {"peak_additional_handling", "peak_oversize"} else ""
        for amount, quote, start, end in windows:
            cursor, last = date.fromisoformat(start), date.fromisoformat(end)
            while cursor <= last:
                year = year_of(cursor)
                stop = min(last, EFFECTIVE[year + 1] - timedelta(days=1)) if year + 1 in EFFECTIVE else last
                if year >= 2023:
                    rows.append(rule(year, f"fedex_{condition}{TAGS[applies]}_{cursor.isoformat()}", name, condition, applies,
                                     amount, file, quote, effective_from=cursor.isoformat(), effective_to=stop.isoformat(),
                                     exclusive_group=group,
                                     notes=PEAK_NOTES[condition] + f"; document window {start} to {end}, split at the January list date"))
                cursor = stop + timedelta(days=1)
    return rows


def surcharge_rows() -> list[dict]:
    return residential_rows() + das_rows() + additional_handling_rows() + oversize_rows() + peak_rows()


# --------------------------------------------------------------------------- fuel proxy

def fuel_proxy_rows(rows: list[dict]) -> list[dict]:
    """2027 has no published weekly history yet: copy the 2026 defaults as proxies."""
    return [
        {**row, "year": 2027, "is_proxy": "true",
         "notes": "PROXY: copy of the 2026 default; no 2027 weekly fuel history exists yet (the 2027 list takes effect 2027-01-04). " + row["notes"]}
        for row in rows if int(row["year"]) == 2026
    ]


# --------------------------------------------------------------------------- announced increases

GRI_LONG = ("FedEx Express package and freight standard list rates for U.S., U.S. export, and U.S. import services, "
            "and FedEx Ground standard list rates will increase an average of {pct}%.")
GRI_2025 = "FedEx package and freight standard list rates for U.S., U.S. export, and U.S. import services will increase an average of 5.9%."
GRI_2026 = "FedEx package standard list rates for U.S., U.S. export, and U.S. import services will increase an average of 5.9%."
ANNOUNCED_INCREASES = [
    {"carrier": CARRIER, "year": year, "product_scope": "all", "rate_card": CARD, "percent": pct, "source_type": "primary",
     "source_file": RC[year], "source_ref": "", "source_quote": quote}
    for year, pct, quote in [
        (2023, "6.9", GRI_LONG.format(pct="6.9")),
        (2024, "5.9", GRI_LONG.format(pct="5.9")),
        (2025, "5.9", GRI_2025),
        (2026, "5.9", GRI_2026),
        (2027, "5.9", GRI_2026),
    ]
]

# --------------------------------------------------------------------------- dimensional weight

ROUNDING = ("round each dimension to the nearest inch (one-half inch or greater rounds up, less than one-half inch "
            "rounds down); any fraction of a pound of the resulting weight is rounded up to the next-higher pound")
DIM_WEIGHT = [
    {"carrier": CARRIER, "year": year, "effective_from": EFFECTIVE[year].isoformat(), "effective_to": year_end(year),
     "divisor": "139", "min_volume_cuin": "0", "rounding": ROUNDING, "source_file": file, "source_ref": page, "source_quote": quote}
    for year, file, page, quote in [
        (2023, SG23, "110", "each package in inches and dividing the total by 139"),
        (2024, SG24, "120", "package in inches and dividing the total by 139"),
        (2025, SG25, "132", "package in inches and dividing the total by 139"),
        (2026, SG26, "136", "package in inches and dividing the total by 139"),
        # The 2027 Service Guide is not archived yet; the 2027 rate-changes page announces no divisor change.
        (2027, SG26, "136", "package in inches and dividing the total by 139"),
    ]
]

# --------------------------------------------------------------------------- exceptions

def exception(kind, note, source_file, source_ref="", **scope) -> dict:
    row = {"carrier": CARRIER, "rate_card": CARD, "kind": kind, "note": note, "source_file": source_file, "source_ref": source_ref}
    row.update(scope)
    return row


AK_HI_XLSX_EXPRESS = ("The 'U.S. rates' sheet has Alaska/Hawaii columns (zones 9-10, 11-12, 13-16; Standard Overnight and 2Day A.M. "
                      "use 9 and 10-12) after zone 8; only zones 2-8 are parsed and the dashboard excludes Alaska/Hawaii.")
AK_HI_XLSX_GROUND = ("The 'Ground & FHD rates' sheet has Alaska/Hawaii columns (zones 9, 14, 17, 22, 23, 25, 92: To Hawaii / Intra-Oahu / "
                     "To Alaska / Intra-Alaska / Alaska to US); only the seven 'US Ground' columns (zones 2-8) are parsed.")
EXCEPTIONS = [
    exception("ak_hi_zone", "Express rates to/from/within Alaska and Hawaii (zones 9-16) are on separate pages (22-30); not parsed, excluded from the dashboard.",
              "fedex/2023/FedEx_Standard_List_Rates_2023.pdf", "23", year=2023),
    exception("ak_hi_zone", "Ground and Home Delivery Alaska/Hawaii shipments have their own table (pages 81-83, zones 9, 14, 17, 22, 23, 25, 92); not parsed, excluded from the dashboard.",
              "fedex/2023/FedEx_Standard_List_Rates_2023.pdf", "82", year=2023),
    exception("ak_hi_zone", "Express rates to/from/within Alaska and Hawaii (zones 9-16) are on separate pages (22-30); not parsed, excluded from the dashboard.",
              "fedex/2024/FedEx_Standard_List_Rates_2024.pdf", "23", year=2024),
    exception("ak_hi_zone", "Ground and Home Delivery Alaska/Hawaii shipments have their own table (pages 78-80, zones 9, 14, 17, 22, 23, 25, 92); not parsed, excluded from the dashboard.",
              "fedex/2024/FedEx_Standard_List_Rates_2024.pdf", "79", year=2024),
    exception("ak_hi_zone", AK_HI_XLSX_EXPRESS, "fedex/2025/FedEx_Standard_List_Rates_2025.xlsx", "2025 U.S. rates", year=2025),
    exception("ak_hi_zone", AK_HI_XLSX_GROUND, "fedex/2025/FedEx_Standard_List_Rates_2025.xlsx", "2025 Ground & FHD rates", year=2025),
    exception("ak_hi_zone", AK_HI_XLSX_EXPRESS, "fedex/2026/FedEx_Standard_List_Rates_2026.xlsx", "2026 U.S. rates", year=2026),
    exception("ak_hi_zone", AK_HI_XLSX_GROUND, "fedex/2026/FedEx_Standard_List_Rates_2026.xlsx", "2026 Ground & FHD rates", year=2026),
    exception("ak_hi_zone", AK_HI_XLSX_EXPRESS, "fedex/2027/FedEx_Standard_List_Rates_2027.xlsx", "2027 U.S. rates", year=2027),
    exception("ak_hi_zone", AK_HI_XLSX_GROUND, "fedex/2027/FedEx_Standard_List_Rates_2027.xlsx", "2027 Ground & FHD rates", year=2027),
    exception("other", ("The 2026 list was revised on June 1, 2026 (FedEx_Standard_List_Rates_2026_wayback-2026-10-22.pdf, cover 'Effective "
                        "January 5, 2026 / Updated June 1, 2026'). base_rates.csv carries the January 2026 prices from the Oct-2025 XLSX "
                        "capture; the June revision is not used."),
              "fedex/2026/FedEx_Standard_List_Rates_2026_wayback-2026-10-22.pdf", "1", year=2026),
    exception("other", ("FedEx publishes one table for FedEx Ground and FedEx Home Delivery (1-150 lb, same structure); fedex_home_delivery rows "
                        "are a copy of the fedex_ground rows. The per-package residential surcharge that the table's note adds to Home Delivery "
                        "is in surcharges.csv (condition residential), not in the base rate. Home Delivery is residential-only, FedEx Ground business-only."),
              "fedex/2025/FedEx_Standard_List_Rates_2025.xlsx", "2025 Ground & FHD rates", service_id="fedex_home_delivery"),
    exception("other", ("The express tables also list FedEx Envelope (up to 8 oz) and FedEx Pak rows and FedEx First Overnight / 2Day A.M. "
                        "columns; they are outside the six dashboard services and are skipped. In the 2023 PDF the first page of each zone "
                        "ends at 49 lb and the second starts at 50 lb (2024: 50/51)."),
              "fedex/2023/FedEx_Standard_List_Rates_2023.pdf", "6"),
    exception("other", ("surcharge_and_fee_changes_2027.pdf returned 404 from the archive, so 2027 surcharges.csv carries only the Home Delivery "
                        "residential charge (2027 rate sheet note) and the 2026-27 demand surcharges; 2027 Express residential, DAS, additional "
                        "handling and oversize amounts are missing. 2027 fuel rows are proxies of 2026. The 2027 Service Guide is not archived; "
                        "dim_weight 2027 cites the 2026 guide."),
              "fedex/2027/rate-changes_page_wayback_2026-10-11.html", "", year=2027),
]
