"""Hand-transcribed (curated) USPS rules, written to CSV by `python -m data.pipeline.usps`.

Every row cites the raw file, the page (PDF) and a verbatim quote that contains
the amount; data/tests/test_citations.py checks each quote against the document.
Nothing here is computed: the amounts are typed from the cited page.

Conventions
- `year` is the price-list label (2023 = the 2023-07-09 Ground Advantage launch tables).
- Peak and time-limited windows use the dates the press release names: the
  January price list takes effect on the `effective_to` date itself ("remain in
  place until midnight Central on Jan. 19, 2025"), so treat `effective_to` as
  exclusive for the `peak_base` and `transportation_time_limited` rows.
- Weight bands (`min_weight_lb`/`max_weight_lb`) are billable weight steps:
  "4-10 lbs" means the 4 lb to 10 lb steps, i.e. actual weight over 3 lb up to 10 lb.
"""
from __future__ import annotations

GA = "usps_ground_advantage"
PM = "usps_priority_mail"
PME = "usps_priority_mail_express"
SERVICES = (GA, PM, PME)

# year label -> (CSV zip, effective date, Notice 123 PDF of the same date, last day of the list)
YEARS = {
    2023: ("usps/2023/price_files_csv_2023-07-09.zip", "2023-07-09", "usps/2023/notice123_2023-07-09.pdf", "2024-01-20"),
    2024: ("usps/2024/price_files_csv_2024-01-21.zip", "2024-01-21", "usps/2024/notice123_2024-01-21.pdf", "2025-01-18"),
    2025: ("usps/2025/price_files_csv_2025-01-19.zip", "2025-01-19", "usps/2025/notice123_2025-01-19.pdf", "2026-01-17"),
    2026: ("usps/2026/price_files_csv_2026-01-18.zip", "2026-01-18", "usps/2026/notice123_2026-01-18.pdf", ""),
}

# CSV file inside each zip, per (service_id, rate_card). Same names in all four zips.
CSV_NAMES = {
    (PM, "retail"): "PM Retail.csv",
    (PM, "commercial"): "PM Comm.csv",
    (PME, "retail"): "PME Retail.csv",
    (PME, "commercial"): "PME Comm.csv",
    (GA, "retail"): "USPS Ground Advantage Retail.csv",
    (GA, "commercial"): "USPS Ground Advantage Comm.csv",
}

# Notice 123 page of the retail table whose footnotes carry the nonstandard fees
# (the commercial page prints the same amounts: PME p10, PM p11, GA p15).
RETAIL_PAGE = {PME: 4, PM: 5, GA: 7}
COMMERCIAL_PAGE = {PME: 10, PM: 11, GA: 15}

# ---------------------------------------------------------------------------
# Nonstandard fees (Notice 123 footnotes of the January / July-2023 price list)
# year -> service -> (fee 22-30 in, fee over 30 in, fee over 2 cu ft), each (amount, quote)
# The Ground Advantage footnotes are printed in a column beside the table, so
# only within-line fragments of them survive text extraction; the quotes for GA
# are therefore shorter. All four years print identical amounts on the retail
# and commercial pages, so rate_card is left empty (= both cards).
# ---------------------------------------------------------------------------
NONSTANDARD = {
    2023: {
        PME: (("4.00", "length, add $4.00."), ("15.00", "Parcels that exceed 30 inches in length, add $15.00."),
              ("25.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $25.00.")),
        PM: (("4.00", "length, add $4.00."), ("15.00", "Parcels that exceed 30 inches in length, add $15.00."),
             ("25.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $25.00.")),
        GA: (("4.00", "inches in length, add $4.00."), ("7.00", "in length, add $7.00."), ("15.00", "$15.00.")),
    },
    2024: {
        PME: (("4.00", "length, add $4.00."), ("18.00", "Parcels that exceed 30 inches in length, add $18.00."),
              ("30.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $30.00.")),
        PM: (("4.00", "length, add $4.00."), ("18.00", "Parcels that exceed 30 inches in length, add $18.00."),
             ("30.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $30.00.")),
        GA: (("4.00", "inches in length, add $4.00."), ("8.40", "in length, add $8.40."), ("18.00", "$18.00.")),
    },
    2025: {
        PME: (("4.00", "length, add $4.00."), ("18.00", "Parcels that exceed 30 inches in length, add $18.00."),
              ("30.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $30.00.")),
        PM: (("4.00", "length, add $4.00."), ("18.00", "Parcels that exceed 30 inches in length, add $18.00."),
             ("30.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $30.00.")),
        GA: (("4.00", "inches in length, add $4.00."), ("8.40", "in length, add $8.40."), ("18.00", "$18.00.")),
    },
    2026: {
        PME: (("4.50", "length, add $4.50."), ("21.00", "Parcels that exceed 30 inches in length, add $21.00."),
              ("35.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $35.00.")),
        PM: (("4.50", "length, add $4.50."), ("21.00", "Parcels that exceed 30 inches in length, add $21.00."),
             ("35.00", "Parcels that exceed 2 cubic feet (3456 cubic inches), add $35.00.")),
        GA: (("4.50", "inches in length, add $4.50."), ("10.00", "in length, add $10.00."), ("21.00", "$21.00.")),
    },
}

# ---------------------------------------------------------------------------
# Peak-season add-ons, from the USPS press releases (primary). Each season is
# transcribed fully for Ground Advantage, Priority Mail and Priority Mail
# Express by zone band and weight band. Omitted on purpose: flat-rate product
# add-ons, Parcel Select and commercial cubic-tier wording (the cubic tiers are
# named in the same bullet as the weight band and are kept in the quote).
# Fields: (rate_card, services, zone_min, zone_max, min_weight_lb, max_weight_lb, amount, page, quote)
# ---------------------------------------------------------------------------
PEAK = {
    2024: {
        "source_file": "usps/2024/press_2024-09-05_peak2024_temporary_rates.pdf",
        "effective_from": "2024-10-06", "effective_to": "2025-01-19",
        "rows": [
            # commercial, page 1
            ("commercial", (PM, GA), 1, 4, "", "3", "0.30", 1, "$0.30 cents increase for Zones 1-4, 0-3 lbs"),
            ("commercial", (PM, GA), 1, 4, "4", "10", "0.45", 1, "$0.45 cents increase for Zones 1-4, 4-10 lbs"),
            ("commercial", (PM, GA), 1, 4, "11", "25", "0.75", 1, "$0.75 cents increase for Zones 1-4, 11-25 lbs"),
            ("commercial", (PM, GA), 1, 4, "26", "70", "3.00", 1, "$3.00 increase for Zones 1-4, 26-70 lbs"),
            ("commercial", (PM,), 5, 9, "", "3", "0.70", 1, "$0.70 cents increase for Zones 5-9, 0-3 lbs"),
            ("commercial", (PM,), 5, 9, "4", "10", "1.25", 1, "$1.25 increase for Zones 5-9, 4-10 lbs"),
            ("commercial", (PM,), 5, 9, "11", "25", "2.75", 1, "$2.75 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PM,), 5, 9, "26", "70", "7.00", 1, "$7.00 increase for Zones 5-9, 26-70 lbs"),
            ("commercial", (GA,), 5, 9, "", "3", "0.35", 1, "$0.35 cents increase for Zones 5-9, 0-3 lbs"),
            ("commercial", (GA,), 5, 9, "4", "10", "0.75", 1, "$0.75 cents increase for Zones 5-9, 4-10 lbs"),
            ("commercial", (GA,), 5, 9, "11", "25", "1.25", 1, "$1.25 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (GA,), 5, 9, "26", "70", "5.50", 1, "$5.50 increase for Zones 5-9, 26-70 lbs"),
            # retail, page 2
            ("retail", (PM, GA), 1, 4, "", "3", "0.40", 2, "$0.40 cents increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PM, GA), 1, 4, "4", "10", "0.55", 2, "$0.55 cents increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PM, GA), 1, 4, "11", "25", "0.95", 2, "$0.95 cents increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PM, GA), 1, 4, "26", "70", "4.00", 2, "$4.00 increase for Zones 1-4, 26-70 lbs"),
            ("retail", (PM,), 5, 9, "", "3", "0.90", 2, "$0.90 cents increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PM,), 5, 9, "4", "10", "1.45", 2, "$1.45 cents increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PM,), 5, 9, "11", "25", "3.25", 2, "$3.25 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PM,), 5, 9, "26", "70", "8.50", 2, "$8.50 increase for Zones 5-9, 26-70 lbs"),
            ("retail", (GA,), 5, 9, "", "3", "0.50", 2, "$0.50 cents increase for Zones 5-9, 0-3 lbs"),
            ("retail", (GA,), 5, 9, "4", "10", "1.00", 2, "$1.00 cents increase for Zones 5-9, 4-10 lbs"),
            ("retail", (GA,), 5, 9, "11", "25", "2.00", 2, "$2.00 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (GA,), 5, 9, "26", "70", "5.85", 2, "$5.85 increase for Zones 5-9, 26-70 lbs"),
            # Priority Mail Express, page 2
            ("commercial", (PME,), 1, 4, "", "3", "1.00", 2, "$1.00 increase for Zones 1-4, 0-3 lbs"),
            ("commercial", (PME,), 5, 9, "", "3", "1.75", 2, "$1.75 increase for Zones 5-9, 0-3 lbs"),
            ("commercial", (PME,), 1, 4, "4", "10", "1.50", 2, "$1.50 increase for Zones 1-4, 4-10 lbs"),
            ("commercial", (PME,), 5, 9, "4", "10", "3.95", 2, "$3.95 increase for Zones 5-9, 4-10 lbs"),
            ("commercial", (PME,), 1, 4, "11", "25", "3.50", 2, "$3.50 increase for Zones 1-4, 11-25 lbs"),
            ("commercial", (PME,), 5, 9, "11", "25", "7.50", 2, "$7.50 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PME,), 1, 4, "26", "70", "8.95", 2, "$8.95 increase for Zones 1-4, 26-70 lbs"),
            ("commercial", (PME,), 5, 9, "26", "70", "13.00", 2, "$13.00 increase for Zones 5-9, 26-70 lbs"),
            ("retail", (PME,), 1, 4, "", "3", "1.10", 2, "$1.10 increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PME,), 5, 9, "", "3", "2.00", 2, "$2.00 increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PME,), 1, 4, "4", "10", "2.00", 2, "$2.00 increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PME,), 5, 9, "4", "10", "4.85", 2, "$4.85 increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PME,), 1, 4, "11", "25", "3.90", 2, "$3.90 increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PME,), 5, 9, "11", "25", "9.00", 2, "$9.00 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PME,), 1, 4, "26", "70", "9.75", 2, "$9.75 increase for Zones 1-4, 26-70 lbs"),
            ("retail", (PME,), 5, 9, "26", "70", "16.00", 2, "$16.00 increase for Zones 5-9, 26-70 lbs"),
        ],
    },
    2025: {
        "source_file": "usps/2025/press_2025-08-08_peak2025_temporary_rates.pdf",
        "effective_from": "2025-10-05", "effective_to": "2026-01-18",
        "rows": [
            # retail, page 1 (Ground Advantage zones 5-9 continues on page 2)
            ("retail", (PM, GA), 1, 4, "", "3", "0.40", 1, "$0.40 cents increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PM, GA), 1, 4, "4", "10", "0.60", 1, "$0.60 cents increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PM, GA), 1, 4, "11", "25", "0.95", 1, "$0.95 cents increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PM, GA), 1, 4, "26", "70", "3.00", 1, "$3.00 increase for Zones 1-4, 26-70 lbs and Oversized"),
            ("retail", (PM,), 5, 9, "", "3", "0.90", 1, "$0.90 cents increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PM,), 5, 9, "4", "10", "1.45", 1, "$1.45 cents increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PM,), 5, 9, "11", "25", "3.25", 1, "$3.25 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PM,), 5, 9, "26", "70", "7.00", 1, "$7.00 increase for Zones 5-9, 26-70 lbs"),
            ("retail", (GA,), 5, 9, "", "3", "0.50", 1, "$0.50 cents increase for Zones 5-9, 0-3 lbs"),
            ("retail", (GA,), 5, 9, "4", "10", "1.00", 1, "$1.00 cents increase for Zones 5-9, 4-10 lbs"),
            ("retail", (GA,), 5, 9, "11", "25", "2.00", 2, "$2.00 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (GA,), 5, 9, "26", "70", "5.75", 2, "$5.75 increase for Zones 5-9, 26-70 lbs and Oversized"),
            ("retail", (PME,), 1, 4, "", "3", "1.10", 2, "$1.10 increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PME,), 5, 9, "", "3", "2.00", 2, "$2.00 increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PME,), 1, 4, "4", "10", "2.00", 2, "$2.00 increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PME,), 5, 9, "4", "10", "4.85", 2, "$4.85 increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PME,), 1, 4, "11", "25", "3.90", 2, "$3.90 increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PME,), 5, 9, "11", "25", "9.00", 2, "$9.00 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PME,), 1, 4, "26", "70", "9.75", 2, "$9.75 increase for Zones 1-4, 26-70 lbs"),
            ("retail", (PME,), 5, 9, "26", "70", "16.00", 2, "$16.00 increase for Zones 5-9, 26-70 lbs"),
            # commercial, page 2
            ("commercial", (PM, GA), 1, 4, "", "3", "0.30", 2, "$0.30 cents increase for Zones 1-4, 0-3 lbs and Cubic Tiers 1-3"),
            ("commercial", (PM, GA), 1, 4, "4", "10", "0.45", 2, "$0.45 cents increase for Zones 1-4, 4-10 lbs and Cubic Tiers 4-5 (PM), 4-9 (GA)"),
            ("commercial", (PM, GA), 1, 4, "11", "25", "0.75", 2, "$0.75 cents increase for Zones 1-4, 11-25 lbs and Cubic Tier 10 (GA)"),
            ("commercial", (PM, GA), 1, 4, "26", "70", "2.25", 2, "$2.25 increase for Zones 1-4, 26-70 lbs and Oversized"),
            ("commercial", (PM,), 5, 9, "", "3", "0.70", 2, "$0.70 cents increase for Zones 5-9, 0-3 lbs and Cubic Tiers 1-3"),
            ("commercial", (PM,), 5, 9, "4", "10", "1.25", 2, "$1.25 increase for Zones 5-9, 4-10 lbs and Cubic Tiers 4-5"),
            ("commercial", (PM,), 5, 9, "11", "25", "2.75", 2, "$2.75 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PM,), 5, 9, "26", "70", "6.50", 2, "$6.50 increase for Zones 5-9, 26-70 lbs"),
            ("commercial", (GA,), 5, 9, "", "3", "0.35", 2, "$0.35 cents increase for Zones 5-9, 0-3 lbs and Cubic Tiers 1-3"),
            ("commercial", (GA,), 5, 9, "4", "10", "0.75", 2, "$0.75 cents increase for Zones 5-9, 4-10 lbs and Cubic Tiers 4-9"),
            ("commercial", (GA,), 5, 9, "11", "25", "1.25", 2, "$1.25 increase for Zones 5-9, 11-25 lbs and Cubic Tier 10"),
            ("commercial", (GA,), 5, 9, "26", "70", "5.50", 2, "$5.50 increase for Zones 5-9, 26-70 lbs and Oversized"),
            ("commercial", (PME,), 1, 4, "", "3", "1.00", 2, "$1.00 increase for Zones 1-4, 0-3 lbs"),
            ("commercial", (PME,), 5, 9, "", "3", "1.75", 2, "$1.75 increase for Zones 5-9, 0-3 lbs"),
            ("commercial", (PME,), 1, 4, "4", "10", "1.50", 2, "$1.50 increase for Zones 1-4, 4-10 lbs"),
            ("commercial", (PME,), 5, 9, "4", "10", "3.95", 2, "$3.95 increase for Zones 5-9, 4-10 lbs"),
            ("commercial", (PME,), 1, 4, "11", "25", "3.50", 2, "$3.50 increase for Zones 1-4, 11-25 lbs"),
            ("commercial", (PME,), 5, 9, "11", "25", "7.50", 2, "$7.50 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PME,), 1, 4, "26", "70", "8.95", 2, "$8.95 increase for Zones 1-4, 26-70 lbs"),
            ("commercial", (PME,), 5, 9, "26", "70", "13.00", 2, "$13.00 increase for Zones 5-9, 26-70 lbs"),
        ],
    },
    2026: {
        "source_file": "usps/2026/press_2026-08-25_peak2026_temporary_rates.pdf",
        "effective_from": "2026-10-04", "effective_to": "2027-01-17",
        "rows": [
            # retail, page 1 (Ground Advantage zones 5-9 continues on page 2)
            ("retail", (PM, GA), 1, 4, "", "3", "0.50", 1, "$0.50 increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PM, GA), 1, 4, "4", "10", "0.80", 1, "$0.80 increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PM, GA), 1, 4, "11", "25", "1.25", 1, "$1.25 increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PM, GA), 1, 4, "26", "70", "3.90", 1, "$3.90 increase for Zones 1-4, 26-70 lbs. and Oversized"),
            ("retail", (PM,), 5, 9, "", "3", "1.00", 1, "$1.00 increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PM,), 5, 9, "4", "10", "2.10", 1, "$2.10 increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PM,), 5, 9, "11", "25", "4.30", 1, "$4.30 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PM,), 5, 9, "26", "70", "9.10", 1, "$9.10 increase for Zones 5-9, 26-70 lbs"),
            ("retail", (GA,), 5, 9, "", "3", "0.75", 1, "$0.75 increase for Zones 5-9, 0-3 lbs"),
            ("retail", (GA,), 5, 9, "4", "10", "1.40", 1, "$1.40 increase for Zones 5-9, 4-10 lbs"),
            ("retail", (GA,), 5, 9, "11", "25", "2.75", 2, "$2.75 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (GA,), 5, 9, "26", "70", "7.50", 2, "$7.50 increase for Zones 5-9, 26-70 lbs. and Oversized"),
            ("retail", (PME,), 1, 4, "", "3", "1.40", 2, "$1.40 increase for Zones 1-4, 0-3 lbs"),
            ("retail", (PME,), 5, 9, "", "3", "2.35", 2, "$2.35 increase for Zones 5-9, 0-3 lbs"),
            ("retail", (PME,), 1, 4, "4", "10", "2.45", 2, "$2.45 increase for Zones 1-4, 4-10 lbs"),
            ("retail", (PME,), 5, 9, "4", "10", "6.30", 2, "$6.30 increase for Zones 5-9, 4-10 lbs"),
            ("retail", (PME,), 1, 4, "11", "25", "5.05", 2, "$5.05 increase for Zones 1-4, 11-25 lbs"),
            ("retail", (PME,), 5, 9, "11", "25", "11.70", 2, "$11.70 increase for Zones 5-9, 11-25 lbs"),
            ("retail", (PME,), 1, 4, "26", "70", "12.70", 2, "$12.70 increase for Zones 1-4, 26-70 lbs"),
            ("retail", (PME,), 5, 9, "26", "70", "20.80", 2, "$20.80 increase for Zones 5-9, 26-70 lbs"),
            # commercial, page 2
            ("commercial", (PM, GA), 1, 4, "", "3", "0.40", 2, "$0.40 increase for Zones 1-4, 0-3 lbs. and Cubic Tiers 1-3"),
            ("commercial", (PM, GA), 1, 4, "4", "10", "0.65", 2, "$0.65 increase for Zones 1-4, 4-10 lbs. and Cubic Tiers 4-5 (PM), 4-9 (GA)"),
            ("commercial", (PM, GA), 1, 4, "11", "25", "1.05", 2, "$1.05 increase for Zones 1-4, 11-25 lbs. and Cubic Tier 10 (GA)"),
            ("commercial", (PM, GA), 1, 4, "26", "70", "3.15", 2, "$3.15 increase for Zones 1-4, 26-70 lbs. and Oversized"),
            ("commercial", (PM,), 5, 9, "", "3", "0.85", 2, "$0.85 increase for Zones 5-9, 0-3 lbs. and Cubic Tiers 1-3"),
            ("commercial", (PM,), 5, 9, "4", "10", "1.75", 2, "$1.75 increase for Zones 5-9, 4-10 lbs. and Cubic Tiers 4-5"),
            ("commercial", (PM,), 5, 9, "11", "25", "3.85", 2, "$3.85 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PM,), 5, 9, "26", "70", "9.10", 2, "$9.10 increase for Zones 5-9, 26-70 lbs"),
            ("commercial", (GA,), 5, 9, "", "3", "0.55", 2, "$0.55 increase for Zones 5-9, 0-3 lbs. and Cubic Tiers 1-3"),
            ("commercial", (GA,), 5, 9, "4", "10", "1.05", 2, "$1.05 increase for Zones 5-9, 4-10 lbs. and Cubic Tiers 4-9"),
            ("commercial", (GA,), 5, 9, "11", "25", "1.75", 2, "$1.75 increase for Zones 5-9, 11-25 lbs. and Cubic Tier 10"),
            ("commercial", (GA,), 5, 9, "26", "70", "7.70", 2, "$7.70 increase for Zones 5-9, 26-70 lbs. and Oversized"),
            ("commercial", (PME,), 1, 4, "", "3", "1.40", 2, "$1.40 increase for Zones 1-4, 0-3 lbs"),
            ("commercial", (PME,), 5, 9, "", "3", "2.35", 2, "$2.35 increase for Zones 5-9, 0-3 lbs"),
            ("commercial", (PME,), 1, 4, "4", "10", "2.10", 2, "$2.10 increase for Zones 1-4, 4-10 lbs"),
            ("commercial", (PME,), 5, 9, "4", "10", "5.55", 2, "$5.55 increase for Zones 5-9, 4-10 lbs"),
            ("commercial", (PME,), 1, 4, "11", "25", "4.90", 2, "$4.90 increase for Zones 1-4, 11-25 lbs"),
            ("commercial", (PME,), 5, 9, "11", "25", "10.50", 2, "$10.50 increase for Zones 5-9, 11-25 lbs"),
            ("commercial", (PME,), 1, 4, "26", "70", "12.55", 2, "$12.55 increase for Zones 1-4, 26-70 lbs"),
            ("commercial", (PME,), 5, 9, "26", "70", "18.20", 2, "$18.20 increase for Zones 5-9, 26-70 lbs"),
        ],
    },
}

# Transportation-related time-limited increase, April 2026 (press release, primary).
TRANSPORTATION_2026 = {
    "carrier": "usps", "year": 2026, "rate_card": "",
    "surcharge_id": "usps_transportation_time_limited_2026",
    "display_name": "Transportation-Related Time-Limited Price Change",
    "condition": "transportation_time_limited", "applies_to": ",".join(SERVICES),
    "amount": "8", "unit": "percent", "exclusive_group": "",
    "effective_from": "2026-04-26", "effective_to": "2027-01-17", "fuel_applies": "false",
    "source_file": "usps/2026/press_2026-03-25_apr2026_transportation_time_limited.pdf", "source_page": 1,
    "source_quote": ("an 8 percent increase that would affect base postage prices on the following retail and "
                     "commercial domestic competitive products: Priority Mail Express, Priority Mail, USPS Ground "
                     "Advantage, and Parcel Select"),
    "notes": ("Applied to the base postage of the January 2026 list; the April 2026 Notice 123 prints the "
              "resulting tables. Window ends at midnight Central on 2027-01-17 (treat effective_to as exclusive)."),
}

# ---------------------------------------------------------------------------
# Announced average increases (press releases, primary). product_scope = service_id.
# 2023 Priority Mail / Express: the July 2023 (Ground Advantage launch) tables kept
# the January 22 2023 PM/PME prices, so the January 2023 release is cited.
# 2023 Ground Advantage launched with a price *decrease* (retail -3.2 %, commercial
# -0.7 % per press_2023-05-10); the citation test cannot match a negative percent,
# so those two rows are not recorded here (see exceptions.csv).
# ---------------------------------------------------------------------------
# 2026 Notice 123 footnote: "Parcels that contain any of the following characteristics,
# add $4.50: a. Cylindrical tubes or rolls b. A can, or wooden or metal box c. A parcel
# containing more than 24 ounces of liquid in glass ..." Modelled as packaging handling,
# triggered by the parcel's nonstandard_packaging flag. Retail page cited; the commercial
# page prints the same footnote. The GA page interleaves the footnote with price rows,
# so its quote is the fragment that survives text extraction.
CHARACTERISTIC_FEE_2026 = (
    (PME, "4.50", 4, "Parcels that contain any of the following characteristics, add $4.50:"),
    (PM, "4.50", 5, "Parcels that contain any of the following characteristics, add $4.50:"),
    (GA, "4.50", 7, "add $4.50:"),
)

# Ground Advantage launched 2023-07-09 with a price decrease, announced per rate card.
# (year, service, percent, source, page, quote, rate_card)
ANNOUNCED_BY_CARD = [
    (2023, GA, "-3.2", "usps/2023/press_2023-05-10_jul2023_ground_advantage.pdf", 1,
     "USPS Ground Advantage Retail prices will decrease 3.2 percent", "retail"),
    (2023, GA, "-0.7", "usps/2023/press_2023-05-10_jul2023_ground_advantage.pdf", 1,
     "USPS Ground Advantage Commercial published prices will decrease 0.7 percent", "commercial"),
]

ANNOUNCED_INCREASE = [
    (2023, PM, "5.5", "usps/2023/press_2022-11-10_jan2023_competitive_prices.pdf", 1,
     "Overall, Priority Mail service prices would increase approximately 5.5 percent, Priority Mail Express service prices would increase by 6.6 percent"),
    (2023, PME, "6.6", "usps/2023/press_2022-11-10_jan2023_competitive_prices.pdf", 1,
     "Priority Mail Express service prices would increase by 6.6 percent"),
    (2024, GA, "5.4", "usps/2024/press_2023-11-15_jan2024_competitive_prices.pdf", 1,
     "USPS Ground Advantage prices would increase by 5.4 percent"),
    (2024, PM, "5.7", "usps/2024/press_2023-11-15_jan2024_competitive_prices.pdf", 1,
     "Priority Mail service prices would increase by 5.7 percent"),
    (2024, PME, "5.9", "usps/2024/press_2023-11-15_jan2024_competitive_prices.pdf", 1,
     "Priority Mail Express service prices would increase by 5.9 percent"),
    (2025, PM, "3.2", "usps/2025/press_2024-11-15_jan2025_competitive_prices.pdf", 1,
     "approximately 3.2 percent for Priority Mail service and Priority Mail Express service"),
    (2025, PME, "3.2", "usps/2025/press_2024-11-15_jan2025_competitive_prices.pdf", 1,
     "approximately 3.2 percent for Priority Mail service and Priority Mail Express service"),
    (2025, GA, "3.9", "usps/2025/press_2024-11-15_jan2025_competitive_prices.pdf", 1,
     "3.9 percent for USPS Ground Advantage"),
    (2026, PM, "6.6", "usps/2026/press_2025-11-14_jan2026_competitive_prices.pdf", 1,
     "approximately 6.6 percent for Priority Mail service"),
    (2026, PME, "5.1", "usps/2026/press_2025-11-14_jan2026_competitive_prices.pdf", 1,
     "5.1 percent for Priority Mail Express service"),
    (2026, GA, "7.8", "usps/2026/press_2025-11-14_jan2026_competitive_prices.pdf", 1,
     "7.8 percent for USPS Ground Advantage"),
]

# ---------------------------------------------------------------------------
# Dimensional weight (DMM 123.1.3 / 133.1.4). One row per year label for the
# 166 divisor plus the 139 row that took effect 2026-07-12.
# ---------------------------------------------------------------------------
DIM_166 = {
    "divisor": "166", "min_volume_cuin": "1728",
    "effective_from": "2023-07-09", "effective_to": "2026-07-11",
    "rounding": "round off each measurement to the nearest whole inch; divide by 166 and round up to the next whole pound; over 70 lb pays the 70-pound price",
    "source_file": "usps/dmm/dmm123_2024-03.htm", "source_ref": "DMM 123.1.3.1",
    "source_quote": "If the result exceeds 1,728 cubic inches, divide the result by 166 and round up (see 604.7.0 ) to the next whole number to determine the dimensional weight in pounds",
}
DIM_139 = {
    "divisor": "139", "min_volume_cuin": "1728",
    "effective_from": "2026-07-12", "effective_to": "",
    "rounding": "round up each measurement to the nearest whole inch; divide by 139 and round up to the next whole pound; over 70 lb pays the 70-pound price",
    "source_file": "usps/dmm/dmm123_2026-10-22.htm", "source_ref": "DMM 123.1.3.2",
    "source_quote": "If the result exceeds 1,728 cubic inches, divide the result by 139 and round up (see 604.7.0 ) to the next whole number to determine the dimensional weight in pounds",
}
DIM_WEIGHT = [dict(DIM_166, carrier="usps", year=year) for year in YEARS] + [dict(DIM_139, carrier="usps", year=2026)]

# ---------------------------------------------------------------------------
# Zone distance bands, DMM 608.9.4.2 (live page, fetched 2026-10-23).
# USPS: zone 1 up to 50 miles, zone 2 to 150, zone 3 to 300, zone 4 to 600,
# zone 5 to 1,000, zone 6 to 1,400, zone 7 to 1,800, zone 8 beyond; zone 9 is
# not a distance band (Palau, Micronesia, Marshall Islands).
# UPS and FedEx publish zones only by ZIP pair; their zone 2 covers 0-150 miles
# (USPS zones 1 and 2 together) and their zone n for n >= 3 uses the USPS zone n band.
# ---------------------------------------------------------------------------
ZONE_SOURCE = "usps/dmm/dmm608_2026-10-23.htm"
USPS_ZONE_BANDS = [
    (1, 0, 50, "The Zone 1 price also includes pieces mailed with different 3-digit O/D pairs, whose centroids are up to 50 miles in distance."),
    (2, 51, 150, "Zone 2 includes all units of area outside zone 1 lying in whole or in part within a radius of about 150 miles from the center of a given unit of area."),
    (3, 151, 300, "Zone 3 includes all units of area outside zone 2 lying in whole or in part within a radius of about 300 miles from the center of a given unit of area."),
    (4, 301, 600, "Zone 4 includes all units of area outside zone 3 lying in whole or in part within a radius of about 600 miles from the center of a given unit of area."),
    (5, 601, 1000, "Zone 5 includes all units of area outside zone 4 lying in whole or in part within a radius of about 1,000 miles from the center of a given unit of area."),
    (6, 1001, 1400, "Zone 6 includes all units of area outside zone 5 lying in whole or in part within a radius of about 1,400 miles from the center of a given unit of area."),
    (7, 1401, 1800, "Zone 7 includes all units of area outside zone 6 lying in whole or in part within a radius of about 1,800 miles from the center of a given unit of area."),
    (8, 1801, "", "Zone 8 includes all units of area outside zone 7. Zone 9 includes the destinations listed in DMM 2.2 (Republic of Palau, Federated States of Micronesia, and Republic of the Marshall Islands)."),
]
USPS_ZONE_NOTES = {
    1: "DMM 608.9.4.2; zone 1 also covers any pair within the same 3-digit ZIP prefix. Band edges are 'about' the stated radius.",
    8: "Open-ended. USPS zone 9 is not a distance band: it covers Palau, Micronesia and the Marshall Islands and is excluded from the dashboard mapping.",
}
DERIVED_ZONE_NOTE = (
    "{carrier} publishes zones only by ZIP-code pair, not in miles. Derived from the USPS DMM 608.9.4.2 bands: "
    "{carrier} zone 2 = 0-150 miles (USPS zones 1 and 2 together); {carrier} zone n for n >= 3 = the USPS zone n band."
)

# ---------------------------------------------------------------------------
# Exceptions / documented anomalies in the parsed base_rates (see SCHEMA.md).
# ---------------------------------------------------------------------------
EXCEPTIONS = [
    dict(service_id=GA, max_weight_lb="0.9999", kind="rounding_artifact",
         note="The 15.999 oz step is written '15.999000000000001' in every CSV zip (float artifact). The parser converts ounces to pounds, truncates to 4 decimals and labels the step 0.9999 (common.weight_label).",
         source_file="usps/2024/price_files_csv_2024-01-21.zip", source_ref="USPS Ground Advantage Retail.csv"),
    dict(service_id=GA, rate_card="retail", year="2025", zone="9", max_weight_lb="0.9999", kind="non_monotonic",
         note="Ground Advantage retail 2025, 15.999 oz step: zone 9 is $9.35 while zone 8 is $9.45. The Notice 123 PDF (p.7) prints the same values, so this is what the document says; kept as parsed.",
         source_file="usps/2025/notice123_2025-01-19.pdf", source_ref="7"),
    dict(service_id=GA, rate_card="retail", year="2025", zone="9", max_weight_lb="1", kind="non_monotonic",
         note="Ground Advantage retail 2025, 1 lb step: zone 9 is $9.35 while zone 8 is $9.45 (same values as the 15.999 oz row). The Notice 123 PDF (p.7) prints the same values; kept as parsed.",
         source_file="usps/2025/notice123_2025-01-19.pdf", source_ref="7"),
    dict(service_id=GA, kind="other",
         note="Ounce steps 4, 8, 12 oz are stored in pounds as 0.25, 0.5, 0.75 (the CSV header says 'Weight Not Over (ounces)' until the 'Weight Not Over (pounds)' marker row, which the parser uses to switch units).",
         source_file="usps/2024/price_files_csv_2024-01-21.zip", source_ref="USPS Ground Advantage Retail.csv"),
    dict(service_id=GA, max_weight_lb="1", kind="other",
         note="The 15.999 oz row and the 1 lb row carry identical prices in all years and both cards; both are kept as steps.",
         source_file="usps/2024/notice123_2024-01-21.pdf", source_ref="7"),
    dict(kind="other",
         note="Flat-rate rows (Flat Rate Envelopes, Small/Medium/Large Flat Rate Boxes) in the PM and PME CSV preambles are not weight steps and are skipped; the 'Oversized' row of the Ground Advantage tables (combined length and girth over 108 in up to 130 in, priced regardless of weight) is skipped too.",
         source_file="usps/2024/price_files_csv_2024-01-21.zip", source_ref="PM Retail.csv"),
    dict(zone="9", kind="other",
         note="Zone 9 is not a distance band: DMM 608.9.4.2 defines it as the Freely Associated States (Palau, Micronesia, Marshall Islands). Parsed because it falls out of the same table; Ground Advantage zone 9 prices equal zone 8, PM/PME zone 9 prices are much higher. Excluded from the dashboard distance mapping (zone_from_distance.csv has no zone 9 row).",
         source_file="usps/dmm/dmm608_2026-10-23.htm", source_ref="9.4.2"),
    dict(service_id=PM, rate_card="commercial", max_weight_lb="0.5", kind="other",
         note="Priority Mail commercial has a 0.5 lb step (same price as 1 lb in 2024) that the retail table does not have; it is kept as a step and the retail table starts at 1 lb.",
         source_file="usps/2024/notice123_2024-01-21.pdf", source_ref="11"),
    dict(service_id=PME, max_weight_lb="0.5", kind="other",
         note="Priority Mail Express has a 0.5 lb step on both cards in all years (SCHEMA lists PM/PME as 1-70 lb only).",
         source_file="usps/2024/notice123_2024-01-21.pdf", source_ref="4"),
    dict(year="2023", kind="other",
         note="Year label 2023 uses the 2023-07-09 tables (Ground Advantage launch). The 2023-07-09 CSV zip is marked 'Proposed' (5/26/2023) in its title rows; its PM/PME prices are identical to the 2023-01-22 zip and the golden cells were checked against the final Notice 123 of 2023-07-09.",
         source_file="usps/2023/price_files_csv_2023-07-09.zip", source_ref="PM Retail.csv"),
    dict(year="2026", kind="other",
         note="2026 adds a 'Nonstandard Characteristic fee' of $4.50 (tubes or rolls, cans, wooden or metal boxes, liquids in glass); recorded as additional_handling_packaging, triggered by the parcel's nonstandard_packaging flag. The 8 % transportation-related time-limited increase (2026-04-26 to 2027-01-17) is recorded as a percent surcharge.",
         source_file="usps/2026/notice123_2026-01-18.pdf", source_ref="5"),
]
