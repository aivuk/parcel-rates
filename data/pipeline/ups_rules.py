"""Curated UPS rules, transcribed from the Daily Rates guides and demand-surcharge
PDFs in data/raw/ups. Every entry quotes the cited page verbatim (as pdfplumber
reads it); amounts are taken from the quote itself so a transcription error
cannot separate a number from its citation. `data.pipeline.ups` expands these
literals into the CSV tables.
"""
from __future__ import annotations

import re

CARRIER = "ups"
RATE_CARD = "list"
YEARS = (2023, 2024, 2025, 2026)

G23 = "ups/2023/ups-2023-rate-and-service-guide-daily-rates.pdf"
G24 = "ups/2024/ups-2024-rate-and-service-guide-daily-rates-updated-2024-07-01.pdf"
G25 = "ups/2025/ups-2025-rate-and-service-guide-daily-rates-2024-12-23.pdf"
G26 = "ups/2026/ups-2026-rate-and-service-guide-daily-rates-updated-2026-09-07.pdf"
DEMAND23 = "ups/2023/ups-demand-surcharges-2023-01-15-update.pdf"
DEMAND24 = "ups/2024/ups-demand-surcharges-2024-07-15-update.pdf"
DEMAND25 = "ups/2025/ups-demand-surcharges-2024-09-16-update-peak-2024-25.pdf"

# The guide used for each price year and the effective date printed in it.
GUIDES = {
    2023: {"file": G23, "effective_date": "2022-12-27"},
    2024: {"file": G24, "effective_date": "2024-07-01"},
    2025: {"file": G25, "effective_date": "2024-12-23"},
    2026: {"file": G26, "effective_date": "2026-09-07"},
}

AIR_AND_3DS = "ups_3_day_select,ups_2nd_day_air,ups_next_day_air_saver,ups_next_day_air"
GROUND = "ups_ground"

FUEL_NOTE = {
    2023: ("fuel_applies assumed from the page note 'Fuel surcharges apply to other charges "
           "associated with pickup, transport and delivery.'"),
    2024: ("fuel_applies assumed from the page note 'Fuel surcharges apply to other charges "
           "associated with pickup, transport and delivery.'"),
    2025: ("fuel_applies assumed from the page note 'Fuel surcharges may apply to any or all domestic "
           "and international transportation charges and certain accessorial charges, value-added "
           "charges, surcharges and other charges.'"),
    2026: ("fuel_applies assumed from the page note 'Fuel surcharges may apply to any or all domestic "
           "and international transportation charges and certain accessorial charges, value-added "
           "charges, surcharges and other charges.'"),
}

BANDS_3 = ((2, 2), (3, 4), (5, 8))        # guide columns: Zone 2 | Zones 3-4 | Zones 5+
BANDS_4 = ((2, 2), (3, 4), (5, 6), (7, 8))  # 2026 guide: Zone 2 | 3-4 | 5-6 | 7+

# ---------------------------------------------------------------------------
# Residential surcharge (per package). Two amounts: Ground vs Air/3 Day Select.
# The air fee cell reads "UPS Domestic and International Air Services, UPS 3 Day
# Select and UPS 3 Day Select from Canada: $x" across three lines; the quote is
# the line that carries the amount.
RESIDENTIAL = {
    2023: {"page": 132, "ground": "– UPS® Ground Services: $5.25", "air": "UPS 3 Day Select® from Canada: $5.85"},
    2024: {"page": 132, "ground": "– UPS® Ground Services: $5.65", "air": "UPS 3 Day Select® from Canada: $6.20"},
    2025: {"page": 184, "ground": "– UPS® Ground Services: $6.10", "air": "UPS 3 Day Select® from Canada: $6.55"},
    2026: {"page": 185, "ground": "– UPS® Ground Services: $6.50", "air": "– UPS Domestic Air and UPS 3 Day Select®: $7.00"},
}

# ---------------------------------------------------------------------------
# Delivery Area Surcharge. Each quote line reads "<variant> $ground $air".
DELIVERY_AREA = {
    2023: {"page": 130, "commercial": "– Commercial $3.70 $3.70", "residential": "– Residential $5.30 $5.55",
           "commercial_extended": "– C ommercial Extended $4.50 $4.50", "residential_extended": "– R esidential Extended $7.15 $7.15"},
    2024: {"page": 130, "commercial": "– Commercial $3.95 $3.95", "residential": "– Residential $5.70 $5.85",
           "commercial_extended": "– C ommercial Extended $4.90 $4.90", "residential_extended": "– R esidential Extended $7.70 $7.70"},
    2025: {"page": 182, "commercial": "– Commercial $4.20 $4.20", "residential": "– Residential $6.15 $6.15",
           "commercial_extended": "– C ommercial Extended $5.35 $5.35", "residential_extended": "– R esidential Extended $8.30 $8.30"},
    2026: {"page": 182, "commercial": "– Commercial $4.50 $4.50", "residential": "– R esidential $6.55 $6.55",
           "commercial_extended": "– C ommercial Extended $5.70 $5.70", "residential_extended": "– R esidential Extended $8.85 $8.85"},
}

# ---------------------------------------------------------------------------
# Additional Handling: one quote line per criterion, amounts by zone band.
# criterion -> (condition, threshold columns, note)
AH_CRITERIA = {
    "weight": ("additional_handling_weight", {"min_weight_lb": "50"},
               "actual weight of more than 50 pounds"),
    "length_plus_girth": ("additional_handling_length", {"min_length_plus_girth_in": "105"},
                          "length plus girth [(2 x width) + (2 x height)] exceeding 105 inches"),
    "length": ("additional_handling_length", {"min_length_in": "48"},
               "longest side exceeding 48 inches"),
    "width": ("additional_handling_width", {"min_width_in": "30"},
              "second-longest side exceeding 30 inches"),
    "cubic": ("nonstandard_volume", {"min_volume_cuft": "6"},
              "cubic size greater than 10,368 cubic inches (= 6 cu ft)"),
    "packaging": ("additional_handling_packaging", {},
                  "not fully encased in corrugated cardboard, cylindrical, banded, soft-sided over 18x14x6 in, etc."),
}
ADDITIONAL_HANDLING = {
    2023: {"page": 129, "bands": BANDS_3, "quotes": {
        "weight": "– Weight $29.00 $31.50 $34.50",
        "length_plus_girth": "– Length + girth $18.50 $20.50 $23.50",
        "length": "– Length $18.50 $20.50 $23.50",
        "width": "– Width $18.50 $20.50 $23.50",
        "packaging": "– Packaging $16.50 $19.00 $20.50"}},
    2024: {"page": 129, "bands": BANDS_3, "quotes": {
        "weight": "– Weight $34.50 $37.50 $41.50",
        "length_plus_girth": "– Length + girth $22.00 $24.50 $28.25",
        "length": "– Length $22.00 $24.50 $28.25",
        "width": "– Width $22.00 $24.50 $28.25",
        "packaging": "– Packaging $19.50 $23.00 $24.50"}},
    2025: {"page": 181, "bands": BANDS_3, "quotes": {
        "weight": "– Weight $43.50 $47.50 $52.75",
        "length_plus_girth": "– Length + Girth $28.00 $31.00 $36.00",
        "length": "– Length $28.00 $31.00 $36.00",
        "width": "– Width $28.00 $31.00 $36.00",
        "packaging": "– Packaging $25.00 $29.00 $31.00"}},
    2026: {"page": 181, "bands": BANDS_4, "quotes": {
        "weight": "– Weight $46.50 $50.75 $56.25 $58.75",
        "length_plus_girth": "– Length + Girth $30.00 $33.25 $38.50 $40.50",
        "length": "– Length $30.00 $33.25 $38.50 $40.50",
        "width": "– Width $30.00 $33.25 $38.50 $40.50",
        "cubic": "– Cubic Size $30.00 $33.25 $38.50 $40.50",
        "packaging": "– Packaging $26.75 $31.00 $33.25 $33.75"}},
}

# ---------------------------------------------------------------------------
# Large Package Surcharge (condition oversize), commercial and residential
# amounts by zone band. Minimum billable weight 90 lb is noted, not modelled.
LPS_CRITERIA = {
    "length_plus_girth": ({"min_length_plus_girth_in": "130"}, "length plus girth exceeds 130 inches"),
    "length": ({"min_length_in": "96"}, "length exceeds 96 inches"),
    "weight": ({"min_weight_lb": "110"}, "weight over 110 lb"),
    "cubic": ({"min_volume_cuft": "10"}, "cubic size greater than 17,280 cubic inches (= 10 cu ft)"),
}
LARGE_PACKAGE = {
    2023: {"page": 131, "bands": BANDS_3, "quotes": {
        ("commercial", "length_plus_girth"): 'girth > 130" $135.00 $145.00 $165.00',
        ("commercial", "length"): '– Length > 96" $135.00 $145.00 $165.00',
        ("residential", "length_plus_girth"): 'girth > 130" $160.00 $170.00 $195.00',
        ("residential", "length"): '– Length > 96" $160.00 $170.00 $195.00'}},
    2024: {"page": 131, "bands": BANDS_3, "quotes": {
        ("commercial", "length_plus_girth"): 'girth > 130" $160.00 $175.00 $197.50',
        ("commercial", "length"): '– Length > 96" $160.00 $175.00 $197.50',
        ("residential", "length_plus_girth"): 'girth > 130" $190.00 $205.00 $235.00',
        ("residential", "length"): '– Length > 96" $190.00 $205.00 $235.00'}},
    2025: {"page": 183, "bands": BANDS_3, "quotes": {
        ("commercial", "length_plus_girth"): 'Girth > 130" $205.00 $225.00 $250.00',
        ("commercial", "length"): '– Length > 96" $205.00 $225.00 $250.00',
        ("residential", "length_plus_girth"): 'Girth > 130" $240.00 $260.00 $297.50',
        ("residential", "length"): '– Length > 96" $240.00 $260.00 $297.50'}},
    2026: {"page": 183, "bands": BANDS_4, "quotes": {
        ("commercial", "length_plus_girth"): "Girth > 130” $219.50 $239.50 $273.00 $286.00",
        ("commercial", "length"): "– Length > 96” $219.50 $239.50 $273.00 $286.00",
        ("commercial", "weight"): "– Weight $219.50 $239.50 $273.00 $286.00",
        ("commercial", "cubic"): "– Cubic Size $219.50 $239.50 $273.00 $286.00",
        ("residential", "length_plus_girth"): "Girth > 130” $254.50 $274.50 $320.50 $331.00",
        ("residential", "length"): "– Length > 96” $254.50 $274.50 $320.50 $331.00",
        ("residential", "weight"): "– Weight $254.50 $274.50 $320.50 $331.00",
        ("residential", "cubic"): "– Cubic Size $254.50 $274.50 $320.50 $331.00"}},
}

# ---------------------------------------------------------------------------
# Demand (peak) surcharges, per package, from the demand-surcharge PDFs. Each
# entry: the quote line holding the amounts, and the windows in column order.
# The January 2023 PDF's text layer has no spaces; quotes reproduce it as read.
PEAK = {
    2023: {"file": DEMAND23, "note": "UPS Demand Surcharges, January 15, 2023 Update; quote reproduces the PDF text layer, which lacks spaces",
           "rows": [
               {"condition": "peak_additional_handling", "applies_to": "all", "page": 5,
                "quote": "AdditionalHandling3 $6.50perpackage $3.50perpackage",
                "windows": [("2022-10-30", "2023-01-14"), ("2023-01-15", "")]},
               {"condition": "peak_oversize", "applies_to": "all", "page": 5,
                "quote": "LargePackageSurcharge3 $70.00perpackage $40.00perpackage",
                "windows": [("2022-10-30", "2023-01-14"), ("2023-01-15", "")]},
           ]},
    2024: {"file": DEMAND24, "note": "UPS Demand Surcharges, July 15, 2024 Update",
           "rows": [
               {"condition": "peak_additional_handling", "applies_to": "all", "page": 5,
                "quote": "Additional $3.50 per package $7.75 per package $9.95 per package $7.75 per package",
                "windows": [("2024-01-14", "2024-09-28"), ("2024-09-29", "2024-11-23"), ("2024-11-24", "2024-12-28"), None]},
               {"condition": "peak_oversize", "applies_to": "all", "page": 5,
                "quote": "Large Package $40.00 per package $84.75 per package $99.00 per package $84.75 per package",
                "windows": [("2024-01-14", "2024-09-28"), ("2024-09-29", "2024-11-23"), ("2024-11-24", "2024-12-28"), None]},
               {"condition": "peak_residential", "applies_to": GROUND, "page": 6,
                "quote": "UPS Ground Residential $0.25 $0.50 $0.25",
                "windows": [("2024-10-27", "2024-11-23"), ("2024-11-24", "2024-12-28"), None]},
               {"condition": "peak_base", "applies_to": AIR_AND_3DS, "page": 6,
                "quote": "UPS Next Day Air $1.00 $2.00 $1.00",
                "windows": [("2024-10-27", "2024-11-23"), ("2024-11-24", "2024-12-28"), None],
                "note": "applies to all UPS Air packages, residential or not; the 'All Other UPS Air' row (2nd Day Air, 3 Day Select) carries the same amounts"},
           ]},
    2025: {"file": DEMAND25, "note": "UPS Demand Surcharges, September 16, 2024 Update (2024-25 peak season); no 2025-26 peak-season document was retrieved",
           "rows": [
               {"condition": "peak_additional_handling", "applies_to": "all", "page": 5,
                "quote": "Additional $3.50 per package $7.75 per package $9.95 per package $7.75 per package",
                "windows": [None, None, ("2024-11-24", "2024-12-28"), ("2024-12-29", "2025-01-18")]},
               {"condition": "peak_oversize", "applies_to": "all", "page": 5,
                "quote": "Large Package $40.00 per package $84.75 per package $99.00 per package $84.75 per package",
                "windows": [None, None, ("2024-11-24", "2024-12-28"), ("2024-12-29", "2025-01-18")]},
               {"condition": "peak_residential", "applies_to": GROUND, "page": 6,
                "quote": "UPS Ground Residential $0.25 $0.50 $0.25",
                "windows": [None, ("2024-11-24", "2024-12-28"), ("2024-12-29", "2025-01-18")]},
               {"condition": "peak_base", "applies_to": AIR_AND_3DS, "page": 6,
                "quote": "UPS Next Day Air $1.00 $2.00 $1.00",
                "windows": [None, ("2024-11-24", "2024-12-28"), ("2024-12-29", "2025-01-18")],
                "note": "applies to all UPS Air packages, residential or not; the 'All Other UPS Air' row (2nd Day Air, 3 Day Select) carries the same amounts"},
           ]},
}

# ---------------------------------------------------------------------------
# Announced general rate increases (secondary sources only; no UPS primary).
ANNOUNCED_INCREASE = {
    2023: {"file": "ups/2023/gri-2023-retaildive-ups-mirrors-fedex-6.9pct.html",
           "quote": "Rates for UPS' Ground, Air and International services will increase by an average of 6.9%"},
    2024: {"file": "ups/gri-history-2020-2027-ebblogistics.html",
           "quote": "2024 5.9% December 26, 2023"},
    2025: {"file": "ups/2025/gri-2025-retaildive-ups-5.9pct.html",
           "quote": "UPS will increase rates for its ground, air and international shipping services by an average of 5.9%"},
    2026: {"file": "ups/2026/gri-2026-supplychaindive-ups-5.9pct.html",
           "quote": "UPS rates will increase by 5.9% on average for ground, air and international services"},
}

# ---------------------------------------------------------------------------
# Dimensional weight rule (package section of each guide).
DIM_WEIGHT = {
    2023: {"page": 20, "quote": "Divide the cubic size in inches by 139",
           "rounding": "round each dimension to the nearest whole inch; round dimensional weight up to the next whole pound"},
    2024: {"page": 20, "quote": "Divide the cubic size in inches by 139",
           "rounding": "round each dimension to the nearest whole inch; round dimensional weight up to the next whole pound"},
    2025: {"page": 21, "quote": "by 139 for Domestic and 139 for",
           "rounding": "round each dimension to the nearest whole inch; round dimensional weight up to the next whole pound"},
    2026: {"page": 21, "quote": "Divide the cubic size in inches by 139",
           "rounding": "round each fractional dimension up to the next whole inch (1.1 counts as 2); round dimensional weight up to the next whole pound"},
}

# ---------------------------------------------------------------------------
# Fuel surcharge proxies: FedEx's historical pages (the only retrievable
# weekly history). Column order of the percentages in each snapshot's table.
FUEL_PROXY_SOURCES = {
    2023: {"file": "fedex/2023/historical-fuel-surcharge_page_wayback_2023-01-12.html",
           "percent_index": {"express": 0, "ground": 3},
           "layout": "columns: FedEx Express domestic package %, Express freight $/lb, export %, import %, FedEx Ground %"},
    2024: {"file": "fedex/2024/historical-fuel-surcharge_page_wayback_2024-12-02.html",
           "percent_index": {"ground": 0, "express": 1},
           "layout": "columns: FedEx Ground/Home Delivery %, other package and express freight domestic %, express freight $/lb, export %, import %"},
    2025: {"file": "fedex/2025/historical-fuel-surcharge_page_wayback_2025-09-20.html",
           "percent_index": {"ground": 0, "express": 1},
           "layout": "columns: FedEx Ground/Home Delivery %, other package and express freight domestic %, express freight $/lb, export %, import %"},
    2026: {"file": "fedex/2026/historical-fuel-surcharge_page_wayback_2026-10-13.html",
           "percent_index": {"ground": 0, "express": 1},
           "layout": "columns: FedEx Ground/Home Delivery/pickup %, other package and express freight domestic %, express freight $/lb, export & import %"},
}

# ---------------------------------------------------------------------------
# Documented anomalies that are not derivable from the parse (kind `other`).
# ak_hi_zone rows are generated by the parser from the excluded header columns.
EXCEPTION_NOTES = [
    {"year": "2024", "kind": "other", "source_file": G24, "source_ref": "1",
     "note": "Only the 'Updated July 1, 2024' revision of the 2024 guide is on disk; it stands in for the "
             "December 26, 2023 initial edition. effective_date is 2024-07-01 and Jan-Jun 2024 list prices may differ."},
    {"year": "2026", "kind": "other", "source_file": G26, "source_ref": "1",
     "note": "Only the 'Updated September 7, 2026' revision of the 2026 guide is on disk; it stands in for the "
             "December 22, 2025 initial edition. effective_date is 2026-09-07 and Dec 2025-Sep 2026 list prices may differ."},
    {"year": "2023", "kind": "other", "source_file": DEMAND23, "source_ref": "5",
     "note": "No all-customer peak residential surcharge in the January 15, 2023 demand-surcharge update: the "
             "residential demand surcharge applies only to shippers billed for more than 20,000 packages in a week, "
             "tiered by volume over baseline, so no peak_residential row is curated for 2023."},
    {"year": "2026", "kind": "other", "source_file": G26, "source_ref": "182",
     "note": "2026-27 demand surcharges were announced (trade press, checked 2026-10-23: from 2026-09-27 for Additional "
             "Handling, Large Package and Over Maximum; from 2026-10-25 for Ground Residential and Air) but the UPS "
             "document is not in the current sources: the guide only says 'Refer to ups.com/peaksurcharges', ups.com "
             "blocks this host and the Wayback Machine was offline when checked. No 2026 peak rows until the document is "
             "added through the manifest."},
    {"year": "2025", "kind": "other", "source_file": DEMAND25, "source_ref": "1",
     "note": "Peak rows for 2025 cover only the tail of the 2024-25 season (through January 18, 2025); the "
             "2025-26 peak-season update is not in the current sources."},
]


def amounts_in(quote: str) -> list[str]:
    """Dollar amounts in a quote, in order, as two-decimal strings."""
    return [m.replace(",", "") for m in re.findall(r"\$\s?([\d,]+\.\d{2})", quote)]
