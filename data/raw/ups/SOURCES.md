# UPS — US domestic Daily Rates: raw sources

Survey date: 2026-10-22. Carrier: UPS, US domestic published Daily Rates (list, non-contract).
All PDFs below were verified to open (`pdfinfo`/`pdftotext`). Page numbers given as "PDF page N"
are physical page indices; the guides' own printed page numbers (used in each guide's Index) are
PDF page minus 2 (checked on the 2026 guide: Index says "Additional Handling 205", table is on PDF page 207).

Access notes (important for re-fetching):
- `https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf` still serves directly (no bot block),
  but as of 2026-10-22 it serves the **2025** guide (Updated March 31, 2025), not 2026.
- The 2026 guide lives on `assets.ups.com/adobe/assets/urn:aaid:aem:.../daily-rates-us-en.pdf`. Direct curl
  returns a 29-30 byte `application/blank` challenge body (bot protection). It was retrieved through the
  Wayback Machine passthrough (`web.archive.org/web/2026id_/<url>`), which works.
- Older `https://www.ups.com/assets/resources/media/en_US/daily_rates.pdf` has had the same Wayback digest since
  2021-08 (stale 2021 guide) — do not use.
- Wayback CDX API intermittently returns 429 / "Archive offline"; retries with back-off worked.
- The live UPS fuel-surcharge HTML page returns 250 bytes to curl (blocked); Wayback snapshots of it contain only
  the static shell — the "90-Day Fuel Surcharge History" table is rendered by JavaScript and is NOT in the HTML.

## 2022

### 2022/ups-2022-rate-and-service-guide-daily-rates.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf (Wayback snapshot 20220125130648)
- Retrieved: 2026-10-22, method: Wayback Machine (`id_` passthrough). Format: PDF, 158 pages, 4.6 MB.
  PDF ModDate 2021-12-17. Title page: "2022 UPS Rate & Service Guide – Daily Rates" (no "Updated" date; this is
  the initial edition effective 2021-12-26 per the GRI sources below).
- Contents (per the guide's Index, printed pages; add 2 for PDF pages): UPS Next Day Air Saver 54–57,
  UPS 2nd Day Air 62–65, UPS 3 Day Select 66–69, UPS Ground 70–73 (zones 2–8 plus 44/45/46 for AK/HI appear
  on the Ground pages; weights 1–150 lb across the 4 pages). Next Day Air table precedes Saver (around printed
  50–53; "Letter Rate 50"). Surcharges: Additional Handling 115/127, Delivery Area Surcharge 115/127,
  Large Package Surcharge 19/115/128, Over Maximum Limits 115/129, Residential Surcharge 115/130,
  Demand Surcharge section printed ~115/131. Dimensional weight text around PDF pages 20–24.
- Parse notes: text-based PDF (not scanned). Rate tables are one service per page-set, columns = zones, rows =
  lb; `pdftotext -layout` gives clean aligned columns; pdfplumber should work. Each service's 1–150 lb table
  spans ~4 pages. Nav header strip repeats on every page (filter it out). Surcharge pages are multi-column
  prose + small inline tables (harder; regex on "$" amounts after section labels).

### 2022/ups-peak-demand-surcharges-2022-05-22-update.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/PeakDemandSurcharges_US.pdf (Wayback 20220520062755)
- Retrieved 2026-10-22 via Wayback. PDF, 4 pages. "UPS Peak/Demand Surcharges – May 22, 2022 Update":
  demand surcharge amounts and effective periods as of that update. Note: later 2022 updates exist in Wayback
  (snapshots 2022-08-08, 2022-09-03, 2022-09-10) but were not downloaded (timebox).
- Parse: small tables, pdfplumber fine.

### 2022/ups-fuel-surcharge-index-tables-eff-2022-01-03.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/FuelSurcharge_US.pdf (Wayback 20220315134747)
- PDF, 2 pages. Index-to-percentage tables ("UPS Ground Fuel Surcharge Table – Effective January 3, 2022",
  prices per gallon of National U.S. Average On-Highway Diesel vs surcharge %), plus air tables. These are the
  lookup tables, NOT the weekly history of applied percentages.

### 2022/ups-fuel-surcharge-index-tables-2022-10-snapshot.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/2022_Fuel_Surcharge_US.pdf (Wayback 20221028090021)
- PDF, 2 pages. Same kind of index tables; text says "Effective October 31, 2022".

### 2022 GRI
- No UPS-authored document saved. Secondary: `gri-history-2020-2027-ebblogistics.html` (root folder, see below)
  states 2022 = 5.9% average, effective December 26, 2021. UNVERIFIED against a UPS primary source.

## 2023

### 2023/ups-2023-rate-and-service-guide-daily-rates.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf (Wayback 20230317165022)
- Wayback, PDF, 164 pages, 4.4 MB, ModDate 2023-01-13. "2023 UPS Rate & Service Guide – Daily Rates".
- Rate tables located by text search (PDF pages): Next Day Air Saver ~57–60, 2nd Day Air ~61–68,
  3 Day Select ~69–72, Ground 73–76 (Zone 44 appears on 73–76). Surcharge section: Additional Handling
  PDF 130/132, Delivery Area Surcharge 131, Large Package 130/132, Over Maximum 132, Residential 132–133,
  Demand Surcharge 131; Dimensional Weight PDF 21–25 and 138. Same layout/parse notes as 2022.

### 2023/ups-2023-rate-and-service-guide-daily-rates-updated-2023-12-03.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates_2023.pdf (Wayback 20250707100643)
- Wayback, PDF, 165 pages, ModDate 2023-11-17, title page "Updated December 3, 2023". UPS's archived
  "prior year" copy; includes late-2023 changes. Use the January edition for Jan–Nov 2023 list prices.

### 2023/ups-demand-surcharges-2023-01-15-update.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/PeakDemandSurcharges_US.pdf (Wayback 20230130210849)
- PDF, 5 pages, "UPS Demand Surcharges – January 15, 2023 Update". Later 2023 update (snapshot 2023-09-22)
  not downloaded.

### 2023/ups-fuel-surcharge-index-tables-2023-04-snapshot.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/FuelSurcharge_US.pdf (Wayback 20230405213112)
- PDF, 3 pages. Index tables; text says "Effective April 17, 2023". Also still live at the same URL on
  2026-10-22 (134,572 bytes, identical size).

### 2023/gri-2023-retaildive-ups-mirrors-fedex-6.9pct.html
- URL: https://retaildive.com/news/ups-rate-hike/634882 — scraped HTML, 2026-10-22. Secondary (news).
  States: "Rates for UPS' Ground, Air and International services will increase by an average of 6.9%
  effective Dec. 27" (2022, i.e. the 2023 rates).
### 2023/gri-2023-retaildive-what-shippers-should-know.html
- URL: https://www.retaildive.com/news/what-shippers-should-know-ups-fedex-2023-rate-increase/635140 — scraped
  HTML. Secondary. "UPS and FedEx have announced their delivery rates will soon increase by 6.9% on average."

## 2024

### 2024/ups-2024-rate-and-service-guide-daily-rates-updated-2024-07-01.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf (Wayback 20240729001254)
- Wayback, PDF, 164 pages, 4.3 MB, ModDate 2024-06-26, "2024 UPS Rate & Service Guide – Daily Rates,
  Updated July 1, 2024". NOTE: this is the mid-year update, not the 2023-12-26 initial edition; an earlier
  2024 snapshot was not found in the CDX listing for this URL (gap: Jan–Jun 2024 original edition).
- Rate tables (PDF pages): Next Day Air Saver ~56–59, 2nd Day Air ~60–67, 3 Day Select ~68–71,
  Ground 72–75 (Zone 44 on 72–75). Surcharges: Additional Handling 129/131, DAS 130, Large Package 129/131,
  Over Maximum 131, Residential 131–132, Demand 130; Dimensional Weight 20–24, 137. Same layout as 2022–23.

### 2024/ups-demand-surcharges-2024-07-15-update.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/PeakDemandSurcharges_US.pdf (Wayback 20240803051605)
- PDF, 6 pages, "July 15, 2024 Update".

### 2024/ups-fuel-surcharge-index-tables-2024-04-snapshot.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/Fuel_Surcharge_US.pdf (Wayback 20240421031609)
- PDF, 2 pages. "UPS Domestic Ground Fuel Surcharge Table – Effective December 18, 2023" plus air tables.

### 2024 GRI
- No document saved (tipranks article returned HTTP 403). Secondary ebblogistics page: 2024 = 5.9%,
  effective December 26, 2023. UNVERIFIED against a UPS primary source.

## 2025

### 2025/ups-2025-rate-and-service-guide-daily-rates-2024-12-23.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf (Wayback 20250107231345)
- Wayback, PDF, 216 pages, 6.9 MB, ModDate 2025-01-02. "2025 UPS Rate & Service Guide – U.S. 48, Alaska &
  Hawaii – Daily Rates – December 23, 2024". Initial 2025 edition. From 2025 the guide merges the AK/HI
  guide, hence 216 pages and shifted page numbers.
- Rate tables (PDF pages, found by text search): Next Day Air Saver ~69–74, 2nd Day Air ~75–86,
  3 Day Select ~87–90, Ground 91–104 (Zone 44 on 91–94). Surcharges: Additional Handling 181/183,
  DAS 182, Large Package 181/183, Over Maximum 183, Residential 183–184, Demand 182; Dimensional Weight
  21–25, 190.

### 2025/ups-2025-rate-and-service-guide-daily-rates-updated-2025-03-31.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/daily_rates.pdf — DIRECT download on 2026-10-22
  (the URL still serves this file; byte-identical to Wayback snapshot 20250903072620). PDF, 216 pages,
  6.77 MB, "Updated March 31, 2025".

### 2025/ups-demand-surcharges-2024-09-16-update-peak-2024-25.pdf
- URL: https://www.ups.com/assets/resources/webcontent/en_US/PeakDemandSurcharges_US.pdf (Wayback 20241226133044;
  first recorded as 20250724231137, a timestamp the archive redirected to the nearest capture, which now answers
  403. The capture taken since has the same SHA-256.)
- PDF, 6 pages, "September 16, 2024 Update" (covers the 2024–2025 peak season).

### 2025/ups-demand-surcharges-2025-08-28-update-peak-2025-26.pdf
- URL: https://assets.ups.com/adobe/assets/urn:aaid:aem:2c542692-de10-4fa3-b507-3b4f181e0953/original/as/demand-surcharges-us-en.pdf
  (Wayback 20251009053423). From 2025 the PDF lives at this address; the old `PeakDemandSurcharges_US.pdf` URL
  has no good capture after December 2024 and redirects here (capture 20260216054153). Added for issue #14,
  found by `data/collect/discover.py`.
- PDF, 3 pages, "August 28, 2025 Update" (2025–26 season). Page 1: Additional Handling, Large Package and Over
  Maximum for 9/28/25–11/22/25, 11/23/25–12/27/25, 12/28/25–1/17/26. Page 2: Ground Residential, Ground Saver
  and Air for October 26 – November 22, November 23 – December 27, December 28, 2025 – January 17, 2026. Pages
  2–3: the higher-volume shipper tables (not modelled).

### 2026/ups-demand-surcharges-2026-08-26-update-peak-2026-27.pdf
- URL: the same `demand-surcharges-us-en.pdf` (Wayback 20261009161904). Added for issue #14.
- PDF, 3 pages, "August 26, 2026 Update" (2026–27 season), same layout: windows 9/27/26–11/21/26,
  11/22/26–12/26/26, 12/27/26–1/16/27 on page 1 and October 25 – November 21, November 22 – December 26,
  December 27, 2026 – January 16, 2027 on page 2.

### 2025/ups-fuel-surcharge-update-eff-2025-05-12.pdf
- URL: https://assets.ups.com/adobe/assets/urn:aaid:aem:022a1e4c-5cb6-42a8-996a-00e98ae4e29f/original/as/fuel_surcharge_update.pdf
- Retrieved via Wayback passthrough (direct host blocks curl). PDF, 2 pages. "This document shows only certain
  UPS Fuel Surcharges that are subject to a rate change effective May 12, 2025" — partial index tables only.

### 2025/gri-2025-retaildive-ups-5.9pct.html
- URL: https://www.retaildive.com/news/ups-2025-gri-rate-increase/729462 — scraped HTML. Secondary.
  "UPS will increase rates for its ground, air and international shipping services by an average of 5.9% on Dec. 23" (2024).

## 2026

### 2026/ups-2026-rate-and-service-guide-daily-rates-updated-2026-09-07.pdf
- URL: https://assets.ups.com/adobe/assets/urn:aaid:aem:356d938a-4f0a-4c71-b50e-bdd890f50b47/original/as/daily-rates-us-en.pdf
- Retrieved 2026-10-22 via Wayback passthrough `https://web.archive.org/web/2026id_/<url>` (direct curl
  returns a bot-challenge stub). PDF 1.7, 216 pages, 6.95 MB, ModDate 2026-09-01. Title page: "2026 UPS Rate &
  Service Guide – U.S. 48, Alaska & Hawaii – Daily Rates – Updated September 7, 2026".
  NOTE: this is the September 2026 update; the original 2025-12-22 edition was not retrieved (a
  "preview-daily-rates-us-en.pdf" exists at urn:aaid:aem:a4030115-44a0-4935-b953-e8f65732ef9f but was not fetched).
- Guide Index (printed pages; +2 for PDF page): UPS Next Day Air 59–62, UPS Next Day Air Saver 67–70,
  UPS 2nd Day Air 79–82, UPS 3 Day Select 85–88, UPS Ground 89–92 (AK/HI pages follow each service, e.g. Ground
  89–102). Surcharges ("Other Charges – Package" 179–183): Additional Handling 179 and 205, Delivery Area
  Surcharge 180 (Commercial/Commercial Extended, Residential/Residential Extended), Demand Surcharges 180,
  Large Package Surcharge 20/181, Over Maximum Limits 181, Residential Surcharge 183, Fuel Surcharge 167–183.
  Dimensional Weight: printed 19–20 (PDF 21–25).
- Verified facts from this file: PDF p21: "Divide the cubic size in inches by 139 to determine the dimensional
  weight in pounds. Increase any fraction to the next whole pound." and each dimension is measured "rounding each
  fractional measurement up to the nearest whole number (for example, 1.1 will be considered 2)". PDF p91
  (UPS Ground, U.S. 48, columns Zones 2,3,4,5,6,7,8,44,45,46): 1 lb row = $11.99 / 12.38 / 13.51 / 14.10 /
  14.60 / 14.83 / 15.03 / 43.25 / 44.17 / 56.96. PDF p207: Additional Handling – Non-Corrugated and – Flat:
  Zone 2 $26.75, Zones 3-4 $31.00, Zones 5-6 $33.25, Zones 7+ $33.75.
  Also verified (2026 guide, Sep 7 2026 edition): PDF p182 Delivery Area Surcharge (Ground / Air*):
  Commercial $4.50 / $4.50; Residential $6.55 / $6.55; Commercial Extended $5.70 / $5.70; Residential Extended
  $8.85 / $8.85; "Refer to the Area Surcharge Listing at ups.com/rates for a listing of applicable ZIP codes"
  (ZIP list not downloaded). PDF p185 Residential Surcharge: "UPS Domestic Air and UPS 3 Day Select: $7.00";
  "UPS Standard Services: $6.60" (the UPS Ground residential line was not captured by the grep; it is on the
  same page).
- Parse notes: same text PDF family as 2025; `pdftotext -layout` yields aligned columns (see sample above),
  pdfplumber table extraction should work on rate pages; rate rows 1–150 lb span ~4 pages per service with the
  nav header strip on each page. Surcharge pages are 3-column prose with inline "$" tables (regex/pdfplumber
  with explicit column bounds). Zones 44–46 are in the same table as 2–8 for Ground.

### 2026/gri-2026-supplychaindive-ups-5.9pct.html
- URL: https://www.supplychaindive.com/news/ups-2026-gri-rate-increase-surcharge-changes/804486/ (published
  2025-11-03). Scraped HTML. Secondary. "UPS rates will increase by 5.9% on average for ground, air and
  international services starting Dec. 22" (2025). Also lists surcharge before/after examples (residential
  ground $6.10→$6.50, air $6.55→$7; DAS ground residential $6.15→$6.55; AH zone 2 $43.50→$46.50) — these
  figures are the article's, not verified against the UPS guide here.
### 2026/gri-2026-cep-research-ups-5.9pct.html
- URL: https://www.cep-research.com/2025/11/04/ups-announces-5-9-rate-increase-for-2026/ — scraped HTML. Secondary.

## Root

### gri-history-2020-2027-ebblogistics.html
- URL: https://ebblogistics.com/ups-fedex-rate-increase-history/ (page dated 2026-10-13/14). Scraped HTML.
  Secondary compilation: UPS 2022 5.9% (eff 2021-12-26), 2023 6.9% (2022-12-27), 2024 5.9% (2023-12-26),
  2025 5.9% (2024-12-23), 2026 5.9% (2025-12-22); 2027 "not announced" as of 2026-10-13.

## Looked for and NOT retrieved
- UPS primary GRI press releases / rate-change page for any year: about.ups.com search gave no direct press
  release URL; ups.com rate pages are JS-rendered/blocked to curl. All GRI percentages above are from news
  sites (secondary) — treat as unverified until a UPS primary source is captured.
- 2027 GRI: not announced by UPS as of the secondary sources dated 2026-10-13 (FedEx has announced 5.9%).
- Weekly fuel surcharge history (ground & air %): UPS publishes only a rolling "90-Day Fuel Surcharge History"
  table, JS-rendered — absent from Wayback HTML snapshots (checked 12 snapshots 2021-11 to 2025-01; only the
  2021-11-30 snapshot had a value in static HTML). Third parties: refundretriever.com shows history only as
  images; oilpriceapi.com/fuel-surcharge/ups shows a 12-week Ground-only table (2026-08-03 to 2026-10-19) with
  an authenticated API for longer history (not fetched). No multi-year weekly table was obtained. Do NOT use
  the ups.com "post-sales-ground-fuel-surcharge-archive.pdf" found in search — it is for UPS Supply Chain
  Solutions Post Sales, a different product.
- Standalone surcharge page / DAS ZIP list: the surcharge page URL is not in Wayback; DAS ZIP lists are
  typically ZIP/XLS downloads behind ups.com — not located in this timebox. Surcharge amounts are inside the
  guides (pages listed above).
- Original (December) editions for 2024 and 2026 guides (only mid/late-year updates captured).
- Later demand-surcharge updates within 2022/2023.
- The separate "Retail Rates" guides (UPS Store counter prices) exist for every year at
  `webcontent/en_US/retail_rates.pdf` (Wayback) but were not downloaded — the task scope is Daily Rates.
