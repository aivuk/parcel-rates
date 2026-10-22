# USPS raw sources — data-availability survey (retrieved 2026-10-22)

Carrier: USPS, domestic **retail** (published, non-contract) list prices.
Scope asked: 2022–2026, services Ground Advantage (since 2023-07-09; before that First-Class Package
Service / Parcel Select Ground / USPS Retail Ground), Priority Mail, Priority Mail Express, zones 1–9.

All downloads were made directly from the live USPS sites with `curl -A "Mozilla/5.0 ..."`.
Note: pe.usps.com returns HTTP 404 to clients without a browser-like User-Agent and to HTTP
range requests; with a UA every file below came back 200. The Wayback Machine CDX index
(`web.archive.org/cdx/search/cdx?url=pe.usps.com/resources/PriceChange/*`) was used only to
*discover* the exact file names of older price-change zips; the files themselves were then
fetched from pe.usps.com directly (not from Wayback).

Price-change calendar covered (effective dates, from the PDFs' cover pages / DMM archive folder dates):
2022-01-09, 2022-07-10, 2022-10-02 (peak), 2023-01-22, 2023-07-09 (Ground Advantage launch),
2024-01-21, 2024-07-14, 2024-10-06 (peak), 2025-01-19, 2025-07-13, 2025-10-05 (peak),
2026-01-18, 2026-04-26 (transportation-related time-limited), 2026-07-12, 2026-10-04 (peak).
There was **no** USPS peak price change in autumn 2023 (see press release 2023-09-19 below).

## A. Notice 123 "Price List" PDFs (one per price change)

Source pattern: `https://pe.usps.com/Archive/PDF/DMMArchive<YYYYMMDD>/Notice123.pdf` (DMM archive,
folder date = effective date), except the current one (`https://pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf`)
and the April 2026 one (`https://pe.usps.com/resources/PriceChange/Transportation-Related%20Time-Limited%202026%20Price%20Change%20-%20Notice123%20PDF.pdf`).
Method: direct download. Format: PDF, 62–76 pages, text-based (not scanned).

Contents (all of them): domestic retail and commercial price tables for Priority Mail Express,
Priority Mail, Ground Advantage (2023-07 onward) / First-Class Package Service + USPS Retail Ground +
Parcel Select Ground (2022 and 2023-01), by zone 1–9 (zone 9 = Hawaii/Alaska-type) and weight
(Priority Mail / PME: 1–70 lb by pound; Ground Advantage retail: ounces up to 15.999 oz then pounds to 70 lb;
FCPS 2022: ounces to 15.999 oz), flat-rate prices, extra services, fees. Footnotes under each table
carry the surcharge rules (see section D).

Parse difficulty: PDF tables with footnotes printed in a right-hand column *beside* the table
(pdftotext -layout interleaves footnote text with price rows); tables for one product span
one or two pages. pdfplumber/camelot should work but the CSV zips (section B) are far easier —
use the PDFs for the footnote rules and as a cross-check only.

| File | URL | Effective |
|---|---|---|
| 2022/notice123_2022-01-09.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20220109/Notice123.pdf | 2022-01-09 |
| 2022/notice123_2022-07-10.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20220710/Notice123.pdf | 2022-07-10 |
| 2022/notice123_2022-10-02_peak.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20221002/Notice123.pdf | 2022-10-02 to 2023-01-22 (peak) |
| 2023/notice123_2023-01-22.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20230122/Notice123.pdf | 2023-01-22 |
| 2023/notice123_2023-07-09.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20230709/Notice123.pdf | 2023-07-09 (first Ground Advantage prices) |
| 2024/notice123_2024-01-21.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20240121/Notice123.pdf | 2024-01-21 |
| 2024/notice123_2024-07-14.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20240714/Notice123.pdf | 2024-07-14 |
| 2024/notice123_2024-10-06_peak.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20241006/Notice123.pdf | 2024-10-06 to 2025-01-19 (peak) |
| 2025/notice123_2025-01-19.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20250119/Notice123.pdf | 2025-01-19 |
| 2025/notice123_2025-07-13.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20250713/Notice123.pdf | 2025-07-13 |
| 2025/notice123_2025-10-05_peak.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20251005/Notice123.pdf | 2025-10-05 to 2026-01-18 (peak) |
| 2026/notice123_2026-01-18.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20260118/Notice123.pdf | 2026-01-18 |
| 2026/notice123_2026-04-26_transportation.pdf | (resources/PriceChange URL above) | 2026-04-26 to 2027-01-17 (time-limited +8 %) |
| 2026/notice123_2026-07-12.pdf | https://pe.usps.com/Archive/PDF/DMMArchive20260712/Notice123.pdf | 2026-07-12 |
| 2026/notice123_2026-10-04_peak.pdf | https://pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf (current) | 2026-10-04 to 2027-01-17 (peak) |

## B. Price-file CSV zips (Postal Explorer "Price Files – CSV" / "Notice 123.zip")

Method: direct download from `https://pe.usps.com/resources/PriceChange/<name>` (names below).
Format: ZIP of ~50 CSV files (one per product). Relevant retail files inside each zip:
`PM Retail.csv`, `PME Retail.csv`, and `USPS Ground Advantage Retail.csv` (2023-07 onward) /
`FCPS.csv`, `USPS Retail Ground.csv`, `Parcel Select Ground.csv` (2022-01 … 2023-01).
Also `PM Comm.csv`, `PME Comm.csv`, `USPS Ground Advantage Comm.csv` (commercial, out of scope).

Layout (checked on 2026-10-04 zip): a 1–2 line title row (`Priority Mail - Retail,,Final,,9/14/2026`),
flat-rate rows, then a header `Weight Not Over (Lbs),Zones` / `,Zone 1,…,Zone 9` followed by one row
per weight step (ounces for Ground Advantage: 4, 8, 12, 15.999; then pounds 1–70). ~90 lines per file.
Parse difficulty: **clean CSV, but with irregular preamble rows** — locate the `Zone 1` header row
programmatically, then read the numeric block; a float like `15.999000000000001` appears for the
15.999-oz step. Surcharge footnotes are NOT in the CSVs (they are only in the PDF).

| File | Source file name on pe.usps.com | Effective |
|---|---|---|
| 2022/price_files_csv_2022-01-09.zip | `January 2022 - Price Files - CSV.zip` | 2022-01-09 |
| 2022/price_files_csv_2022-07-10.zip | `July 2022 - Price Files - CSV.zip` | 2022-07-10 |
| 2022/price_files_csv_2022-10-02_peak.zip | `October 2022 - Price Files - CSV.zip` | 2022-10-02 (peak) |
| 2023/price_files_csv_2023-01-22.zip | `January 2023 - Price Files - CSV.zip` | 2023-01-22 |
| 2023/price_files_csv_2023-07-09.zip | `July 2023 Price Change 20230526 - Notice 123.zip` | 2023-07-09 |
| 2024/price_files_csv_2024-01-21.zip | `January 2024 Price Change 121823 - Notice 123.zip` | 2024-01-21 |
| 2024/price_files_csv_2024-07-14.zip | `July 2024 Price Change 20240614 - Notice 123.zip` | 2024-07-14 |
| 2024/price_files_csv_2024-10-06_peak.zip | `October 2024 Price Change 20241004 - Notice 123.zip` | 2024-10-06 (peak) |
| 2025/price_files_csv_2025-01-19.zip | `January 2025 Price Change 250116 - Notice 123.zip` | 2025-01-19 |
| 2025/price_files_csv_2025-07-13.zip | `July 2025 Price Change 20250708 - Notice 123.zip` | 2025-07-13 |
| 2025/price_files_csv_2025-10-05_peak.zip | `Time-Limited 2025 Price Change 20250911 - Notice 123.zip` | 2025-10-05 (peak) |
| 2026/price_files_csv_2026-01-18.zip | `January 2026 Price Change - Notice 123.zip` | 2026-01-18 |
| 2026/price_files_csv_2026-04-26_transportation.zip | `Transportation-Related Time-Limited 2026 Price Change - Notice 123 - Final.zip` | 2026-04-26 |
| 2026/price_files_csv_2026-07-12.zip | `July 2026 Price Change - 07082026 - Notice 123.zip` | 2026-07-12 |
| 2026/price_files_csv_2026-10-04_peak.zip | `Time-Limited OCT 2026 Price Change - Notice 123 - Final.zip` | 2026-10-04 (peak) |

Caveat: for each price change several revisions of the zip were published (draft → final). The
one taken is the latest-dated file name seen in the Wayback CDX index; only the Oct 2026 one is
labelled "Final" in its name. Verify against the PDF of the same date before trusting a cell.

## C. Announced average price increases (USPS national press releases, PDF versions)

Method: direct download from `https://about.usps.com/newsroom/national-releases/<yyyy>/<slug>.pdf`.
Format: 1–2 page text PDF, trivial to parse. Percentages quoted below were extracted with pdftotext
from the saved file named in each row.

| File | Covers | Quoted figures (from the file) |
|---|---|---|
| 2022/press_2021-11-10_jan2022_competitive_prices.pdf | 2022-01-09 | "approximately 3.1 percent for Priority Mail service, and 3.1 percent for Priority Mail Express" (First-Class Package Service figure not in the parsed lines; check file) |
| 2022/press_2022-04-06_jul2022_prices.pdf | 2022-07-10 | Market-dominant release: "First-Class Mail prices approximately 6.5 percent". No shipping-services percent found in it; July 2022 competitive % **not verified**. |
| 2022/press_2022-08-10_peak2022_temporary_rates.pdf | 2022-10-02 → 2023-01-22 peak | dollar add-ons by product/zone/weight band (see file) |
| 2023/press_2022-11-10_jan2023_competitive_prices.pdf | 2023-01-22 | "Priority Mail … approximately 5.5 percent, Priority Mail Express … 6.6 percent, and First-Class Package Service … 7.8 percent" |
| 2023/press_2023-05-10_jul2023_ground_advantage.pdf | 2023-07-09 | Ground Advantage launch release (retail GA prices announced as a decrease vs FCPS/Retail Ground; exact % to be read from file) |
| 2023/press_2023-09-19_no_peak_surcharge_2023.pdf | autumn 2023 | "No holiday surcharges for mailing and shipping with USPS this holiday season" |
| 2024/press_2023-11-15_jan2024_competitive_prices.pdf | 2024-01-21 | "USPS Ground Advantage … 5.4 percent, Priority Mail … 5.7 percent, and Priority Mail Express … 5.9 percent" |
| 2024/press_2024-05-10_jul2024_parcel_select.pdf | 2024-07-14 | Parcel Select only; no retail PM/PME/GA change announced for July 2024 |
| 2024/press_2024-09-05_peak2024_temporary_rates.pdf | 2024-10-06 → 2025-01-19 peak | dollar add-ons by product/zone/weight band |
| 2025/press_2024-11-15_jan2025_competitive_prices.pdf | 2025-01-19 | "approximately 3.2 percent for Priority Mail service and Priority Mail Express service, 3.9 percent for USPS Ground Advantage and 9.2 percent for Parcel Select" |
| 2025/press_2025-05-09_jul2025_shipping_prices.pdf | 2025-07-13 | "approximately 6.3 percent for Priority Mail service, 7.1 percent for USPS Ground Advantage and 7.6 percent for Parcel Select" |
| 2025/press_2025-08-08_peak2025_temporary_rates.pdf | 2025-10-05 → 2026-01-18 peak | dollar add-ons by product/zone/weight band |
| 2026/press_2025-11-14_jan2026_competitive_prices.pdf | 2026-01-18 | "approximately 6.6 percent for Priority Mail service, 5.1 percent for Priority Mail Express service, 7.8 percent for USPS Ground Advantage and 6.0 percent for Parcel Select" |
| 2026/press_2026-03-25_apr2026_transportation_time_limited.pdf | 2026-04-26 → 2027-01-17 | transportation-related time-limited increase on PME/PM/GA/Parcel Select (the 8 % figure comes from web search summaries; confirm in file) |
| 2026/press_2026-05-11_jul2026_competitive_price_changes.pdf | 2026-07-12 | no base-rate change for retail PM/PME/GA; "align the divisor for dimensional weight pieces to industry standards"; PO Box +3 % |
| 2026/press_2026-08-25_peak2026_temporary_rates.pdf | 2026-10-04 → 2027-01-17 peak | dollar add-ons by product/zone/weight band |

## D. Surcharge rules (what the fetched documents say)

From the Notice 123 PDFs (footnotes beside the Priority Mail / PME / Ground Advantage tables):
- Nonstandard length fees: "Parcels that exceed 22 inches but not greater than 30 inches in length, add $…" and
  "Parcels that exceed 30 inches in length, add $…". Over-30-in amounts seen: $15.00 (2022-01, "Effective April 3, 2022"), $15.00 (2023-07),
  $18.00 (2025-01), $21.00 (2026-07 and 2026-10). Ground Advantage over-30-in: $7.00 (2023-07), $8.40 (2025-01), $10.00 (2026).
- Volume fee: "Parcels that exceed 2 cubic feet (3456 cubic inches), add $…": $15.00 (2022), $25.00 (2023-07 PM/PME),
  $35.00 (2026 PM/PME), $21.00 (2026 Ground Advantage).
  The 22–30 in amounts are in the same footnotes; read them per year from the PDF (not extracted here).
- Dimensional weight: every year's footnote says "Parcels that exceed one cubic foot (1,728 cubic inches) are charged based on
  the actual weight or the dimensional weight, whichever is greater". The divisor and the zone scope are NOT stated in
  Notice 123 (it refers to DMM 123/223). Web summaries say divisor 166 through 2026-07-11 and 139 from 2026-07-12 for
  PME/PM/GA/Parcel Select (the 2026-05-11 press release confirms a divisor change "to industry standards" but does not
  print the number) — **divisor values and zone applicability (zones 1–4 vs 5–9 in earlier years) are unverified from
  saved files; source DMM 123.1.6 / 223.1.6 for the year in question**.
- Residential / delivery-area surcharges: none found in any Notice 123 or press release; the 2023-09-19 release explicitly
  says no extra fees for residential delivery or Saturday delivery. USPS has no such surcharge for retail parcels (consistent
  with all fetched docs; absence-of-evidence only).
- Peak season: temporary price changes replace the base tables (prices in the "_peak" PDFs/zips are the full tables, not an
  add-on). Windows: 2022-10-02→2023-01-22; none in 2023; 2024-10-06→2025-01-19; 2025-10-05→2026-01-18; 2026-10-04→2027-01-17.
  2026 additionally has the 2026-04-26→2027-01-17 transportation-related increase stacked under the peak prices.

## E. Zone chart

- zones/postalpro_zone_charts_page.html — https://postalpro.usps.com/operations/zone-charts (scraped HTML, 2026-10-22).
  Links to: Domestic Zone Chart tool, "Zone Charts Matrix Technical Guide" (/national-zone-charts-matrix/ZoneChartsMatrixTechnicalGuide,
  effective June 2024 — the link returned an HTML page, not a PDF, so it was not kept), "Zone Charts Order Form" (/Zone_Charts_Order_Form,
  dated 2026-07-12), Zone 10 test files. The full National Zone Charts Matrix (origin ZIP3 x destination ZIP3 → zone) is
  obtained via the order form, not as an open bulk download on that page.
- zones/postcalc_domestic_zone_chart_page.html — https://postcalc.usps.com/DomesticZoneChart (scraped HTML). Form-driven tool:
  given an origin ZIP3 it returns the zone for every destination ZIP3 range (with "same NDC" and 5-digit exceptions), optionally as
  an Excel-formatted table; endpoints seen in the page: `/DomesticZoneChart/GetZoneChart` and `/DomesticZoneChart/GetZone`
  (POST form, chart date selectable). That is the practical free source: ~1,000 ZIP3 requests build the full matrix.
  Zones are distance-based (DMM 608.9 ranges; zone 9 = non-contiguous/territories); not verified here beyond the page text.

## F. Looked for but NOT retrieved
- A DMM-archive Notice 123 for an October 2023 peak change: does not exist (USPS had no 2023 peak pricing; confirmed by press release).
- `https://pe.usps.com/Archive/HTML/DMMArchive/Default.htm` (archive index): HTTP 500 on every attempt; folder dates were guessed from effective dates instead.
- PostalPro price-change pages (`postalpro.usps.com/pricechange`, `/node/23052`, `/ZoneCharts`): HTTP 404; Postal Explorer has the same files.
- Zone Charts Matrix Technical Guide PDF and the bulk NZCM matrix file: only an HTML landing page / order form; not downloaded.
- July 2022 shipping-services % increase and the FCPS % for Jan 2022: not found in the saved releases (the Apr 2022 release covers market-dominant mail). Check the Federal Register notice for CP2022 July if needed.
- Dimensional-weight divisor values per year: not in the saved files (see D).
