# FedEx U.S. domestic published (non-contract) rates — raw source inventory

Retrieval date for everything below: **2026-10-22**.
Method for every file: **Wayback Machine** (`https://web.archive.org/web/<TIMESTAMP>id_/<ORIGINAL-URL>`).
fedex.com itself returned a WAF block page ("We're sorry, we can't process your request right now. It appears you don't have
permission to view this webpage") for every request from this host (curl with browser UA, and the WebFetch tool), including
the `/content/dam/...` PDF/XLSX assets. All files were therefore pulled from archived copies. The archived bytes are what
fedex.com served at the capture time; the `<TIMESTAMP>` of each capture is given so the exact copy can be re-fetched.

The Internet Archive was intermittently "Temporarily Offline" during the session; some CDX index queries (notably the one
for `*2027*` files) failed and were not all retried.

Conventions: "PDF p.N" below means the page number printed in the document's own table of contents; the PDF file index is
offset by the cover/contents pages (e.g. in the 2024 PDF the Ground zones 2-8 table that the TOC lists as pp. 75-77 is at file
pages 76-78 — verify with `pdftotext -f`). `Wayback <ts>` is the capture timestamp used.

Facts quoted in this file (effective dates, GRI percentages, surcharge amounts, fuel percentages) come from the named file and
were checked with `pdftotext`/`openpyxl`/HTML text extraction; nothing here is from memory.

---

## 2022  (`data/raw/fedex/2022/`)

### FedEx_Standard_List_Rates_2022.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/FedEx_Standard_List_Rates_2022.pdf  (Wayback 20210921165115)
- Format: PDF, 85 pages, text-based (not scanned). First page: "FedEx® Standard List Rates — Effective January 3, 2022".
- Contains: U.S. package rates pp. 1-21 (FedEx First Overnight, Priority Overnight, Standard Overnight, 2Day A.M., 2Day,
  Express Saver; zones 2-8; weights 1-150 lb, plus envelope/pak rows), to/from Alaska & Hawaii Express rates pp. 22-30,
  multiweight/freight/SameDay pp. 31-38, international pp. 39-77, **FedEx Ground & Home Delivery zones 2-8 pp. 78-80**,
  Ground Alaska/Hawaii pp. 81-83.
- Caveat: the capture is from Sept 2021 (pre-effective). A larger capture from 2022-01-01 (1.5 MB) exists in the CDX index
  but returned 404 when fetched; later captures (2023-06-02, 2026-03-11, ~1.68 MB) were not fetched. If exact parity with the
  final in-year version matters, re-fetch one of those and diff.
- Parse notes: one service per table block, several weight rows per line; `pdfplumber` with explicit column positions or
  `pdftotext -layout` + regex should work. Tables for a single service span multiple pages. Prefer the XLSX below.

### FedEx_Standard_List_Rates_2022.xlsx
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/FedEx_Standard_List_Rates_2022.xlsx  (Wayback 20210923065819)
- Format: XLSX. Sheets: `2022 U.S. express list rates` (1373x21; header "Effective 1/3/2022"; service blocks headed e.g.
  "FedEx Express U.S. package Standard List Rates: FedEx First Overnight®", column header row `Zones 2 3 4 5 6 7 8 9-10 11-12 13-16`
  — i.e. includes Alaska/Hawaii zones), `2022 U.S. export list rates`, `2022 U.S. import list rates`,
  `2022 ground list rates` (316x16; "FedEx Ground and FedEx Home Delivery Standard List Rates", zones `2 3 4 5 6 7 8 9 14 17 92` ...),
  `SameDay rates`, `SameDay city rates`.
- Parse notes: **easiest source for 2022** — stacked blocks per service in one sheet; split on the title rows. Pre-effective
  capture (Sept 2021), same caveat as the PDF.

### Service_Guide_2022.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/Service_Guide_2022.pdf  (Wayback 20211214083917)
- Format: PDF, ~185 pages, 12.9 MB, text-based. Dated January 3, 2022.
- Contains: full Service Guide (Contents / Rates / Terms). Surcharge & fee index with page refs: Additional Handling
  Surcharge p.102, Non-stackable p.103, Delivery Area Surcharge p.107, Oversize Charge p.115, Peak Surcharge p.116,
  Residential Delivery Charge p.116. Dimensional weight rule text: "multiplying the length by width by height of each package in
  inches and dividing the total by 139 ... If the dimensional weight exceeds the actual weight, charges may be assessed..."
  (Terms section).
- Parse notes: multi-column layout, checkmark matrices; good for manual/LLM extraction of surcharge rules, poor for
  automated table parsing. Use the surcharge PDFs below for amounts.

### FXE_FXG_Surcharges_and_Fees_2022.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/FXE_FXG_Surcharges_and_Fees_2022.pdf  (Wayback 20211208024617)
- Format: PDF, 6 pages, text. "2021 vs 2022" change table.
- Contains (U.S. package): Additional Handling (dimension/weight/packaging; Express vs Ground by zone, effective Jan 24 2022),
  Delivery Area Surcharge (e.g. "U.S. Express Package Services $4.70 → $5.20 per package"; max charges), Ground Unauthorized
  Package ("$920 → $1,025 per package"), Oversize Charge ("$105 → Zone 2: $110 / Zones 3-41: $120 per package", eff. Jan 24 2022),
  Residential Delivery Charge ("U.S. Express Package Services $4.95 → $5.30 per package"), On Demand Care, etc.
- Parse notes: 4-column change table (surcharge / service / old / new); `pdfplumber` extract_tables should work, cells wrap lines.

### Other_Surcharge_Changes_2022.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/Other_Surcharge_Changes_2022.pdf  (Wayback 20211127110831)
- Format: PDF, 2 pages. Mid-cycle changes effective Jan 17/24, 2022: Additional Handling ("$25.50 per package (weight)" line),
  Oversize ("FedEx Home Delivery® $130 per package"), new $1.00 Delivery and Returns Surcharge (Jan 17 2022), No Shipment Tendered.

### DAS_Contiguous_Extended_Alaska_Hawaii_2022.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/DAS_Contiguous_Extended_Alaska_Hawaii_2022.pdf  (Wayback 20220121021111)
- Format: PDF, 29 pages, ZIP lists in 8 columns with ranges like `01832-01833`. 2022 has only Contiguous / Extended / Alaska /
  Hawaii tiers (no "Remote" tier yet). Parse: `pdftotext -layout` + regex for `\d{5}(-\d{5})?`; section headers mark the tier.
- The 2022 surcharges page also linked per-tier `.txt` lists (`DAS_Contiguous_US_2022.txt`, `DAS_Contiguous_US_Extended_2022.txt`,
  `DAS_Alaska_2022.txt`, `DAS_Hawaii_2022.txt`, `DAS_Intra_Hawaii_2022.txt`) — not fetched (not in the CDX listing with 200).

### fuel_surcharge_effective_4-4-22.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/fuel_surcharge_effective_4-4-22.pdf  (Wayback 20220318150619)
- Format: PDF, 4 pages. "FedEx Express domestic fuel surcharge tables — Effective April 4, 2022": index-to-percentage trigger
  tables (package services and express freight; also Ground table on later pages per the title). This is the *lookup table*, not
  the weekly applied percentage.

### fuel-surcharge_page_wayback_2022-10-05.html
- URL: https://www.fedex.com/en-us/shipping/fuel-surcharge.html  (Wayback 20221005131549)
- Format: scraped HTML (raw, no Wayback toolbar). Contains the current-week Ground and Express percentages and the full trigger
  tables (212 percentage tokens). Links to `historical-fuel-surcharge.html`.

### historical-fuel-surcharge_page_wayback_2022-10-06.html
- URL: https://www.fedex.com/en-us/shipping/historical-fuel-surcharge.html  (Wayback 20221006041812)
- Format: scraped HTML. Weekly history table, **rolling window of ~13-16 weeks only** (this snapshot: July 6 2022 – Sept 25 2022).
  Columns: effective week, Ground/Home Delivery %, domestic package %, express freight $/lb, export/import %.
- Parse notes: simple `<table>`; BeautifulSoup/pandas.read_html. To build a full weekly series you must stitch many snapshots
  (CDX lists ~monthly captures from 2022 on; only one per year was fetched here).

### rate-changes_page_wayback_2022-03-24.html
- URL: https://www.fedex.com/en-us/shipping/rate-changes.html  (Wayback 20220324114219)
- GRI statement (quoted): "FedEx Express package and freight standard list rates will increase an average of 5.9% for U.S.,
  U.S. export, and U.S. import services. FedEx Ground ..." (effective Jan 3, 2022). Also peak-surcharge notices with dates.

### surcharges-and-fees_page_wayback_2022-01-05.html
- URL: https://www.fedex.com/en-us/shipping/current-rates/surcharges-and-fees.html  (Wayback 20220105055751)
- Scraped HTML of the 2022 surcharges page; links to the DAS txt/pdf lists, FXE_FXG_Surcharges_and_Fees_2022.pdf and peak
  surcharge PDFs. (No 200 captures of this page exist after 2022 in the CDX index; later years' surcharges live in the
  Service Guide and `surcharge_and_fee_changes_<year>.pdf`.)

---

## 2023  (`data/raw/fedex/2023/`)

### FedEx_Standard_List_Rates_2023.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/FedEx_Standard_List_Rates_2023.pdf  (Wayback 20230216062837; served gzip-encoded, decompressed on save)
- Format: PDF, 85 pages, 3.6 MB, text. "Effective January 2, 2023". Same layout as 2022: U.S. package rates pp. 1-21,
  Alaska/Hawaii Express pp. 22-30, **Ground & Home Delivery zones 2-8 pp. 78-80**, Ground AK/HI pp. 81-83.
- Parse notes: as 2022 PDF. **No XLSX available for 2023** (only blocked/`text/html` captures of
  `FedEx_Standard_List_Rates_2023.xlsx` exist in the archive) — this PDF is the only machine source for 2023 rates.

### Service_Guide_2023.pdf
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/Service_Guide_2023.pdf  (Wayback 20230122155730)
- Format: PDF, ~183 pages, 16.5 MB. Surcharge index: Additional Handling p.102, Non-stackable p.103, Delivery Area p.107,
  Oversize p.115, Peak Surcharge p.116, Residential Delivery Charge p.116. Dim weight: "... dividing the total by 139 ...".
- **This is the only 2023 surcharge-amount source retrieved**: `FXE_FXG_Surcharges_and_Fees_2023.pdf` exists only as a
  blocked (`text/html`, 1 KB) capture. The 2024 change document below gives "2023 → 2024" old/new values, which also recovers
  the 2023 amounts for the listed surcharges.

### DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2023.xlsx
- URL: https://www.fedex.com/content/dam/fedex/us-united-states/services/DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2023.xlsx  (Wayback 20230308133722)
- Format: XLSX, sheets `DAS_ContUS` (7258 rows), `DAS_ContUSExt` (14292), `DAS_ContUSRem` (3842), `DAS_Alaska` (221),
  `DAS_Hawaii` (77), `DAS_IntraHawaii` (38). Header "Effective 1/30/2023". One ZIP (or ZIP range) per row after a 4-5 line
  preamble. Parse: trivial with openpyxl/pandas (skip preamble rows).

### fuel_surcharge_effective_12-11-23.pdf
- URL: .../fuel_surcharge_effective_12-11-23.pdf  (Wayback 20240718113841). PDF 2 pp. "FedEx Express domestic fuel surcharge
  tables — Effective Dec. 11, 2023" (trigger tables).
### fuel_surcharge_effective_11-20-23.pdf
- URL: .../fuel_surcharge_effective_11-20-23.pdf  (Wayback 20240714084124). PDF 1 p. **International** fuel table (Nov 20 2023) —
  retrieved before its scope was known; not needed for U.S. domestic.
### fuel-surcharge_page_wayback_2023-05-22.html — Wayback 20230522161058 of fuel-surcharge.html (current-week % + trigger tables).
### historical-fuel-surcharge_page_wayback_2023-01-12.html — Wayback 20230112094057; weekly rows Oct 3 2022 – Jan 1 2023 (13 weeks).
### rate-changes_page_wayback_2023-01-01.html — Wayback 20230101193136. GRI (quoted): "... FedEx Ground standard list rates will
  increase an average of 6.9%." (effective Jan 2, 2023). Peak surcharge notices (Peak – Additional Handling / Peak – Oversize
  changes effective Jan 16, 2023; Aug 5 2022 peak notice).

---

## 2024  (`data/raw/fedex/2024/`)

### FedEx_Standard_List_Rates_2024.pdf
- URL: .../FedEx_Standard_List_Rates_2024.pdf  (Wayback 20231105073928)
- Format: PDF, 82 pages, text. "Effective January 1, 2024". U.S. package rates pp. 1-21 (six Express services, zones 2-8,
  1-150 lb), AK/HI pp. 22-30, international pp. 36-74, **Ground & Home Delivery zones 2-8 pp. 75-77** (file pages 76-78),
  Ground AK/HI pp. 78-80, International Ground Canada p. 81.
- Capture is pre-effective (Nov 2023); later captures (2025-06-17, 2025-10-15, 2025-12-16, ~530 KB) exist and were not fetched.
- **No XLSX available for 2024** in the archive (the page linked `FedEx_Standard_List_Rates_2024.xlsx` but no 200 capture exists).

### Service_Guide_2024.pdf
- URL: .../Service_Guide_2024.pdf  (Wayback 20240118202815). PDF ~183 pp., 4.2 MB. Surcharge index: Additional Handling p.114,
  Non-stackable p.115, Delivery Area p.118, Demand Surcharge (footnoted), Oversize p.126, Residential Delivery Charge (p. ~127).
  Dim weight: "... dividing the total by 139 ...".

### surcharge_and_fee_changes_2024.pdf
- URL: .../surcharge_and_fee_changes_2024.pdf  (Wayback 20240912135024). PDF 7 pp. 2023→2024 change table. Examples (quoted):
  "Delivery Area Surcharge — U.S. Package Services (Residential) $5.55 → $5.85 per package"; "Ground Unauthorized ... $1,150 →
  $1,250 per package"; "Oversize Charge (Cont.) U.S. Package Services Zone 2: $135 → Zone 2: $160 per package"; "Residential
  Delivery Charge U.S. Package Services $5.80 → $6.15 per package"; Additional Handling dimension/weight/packaging rows with
  effective dates Jan 1 / Jan 15, 2024.
- Parse notes: same 4-column change-table format as 2022; some surcharges (DAS, Oversize, Additional Handling) are
  zone-tiered and wrap across lines/pages.

### DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2024.xlsx
- URL: .../DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2024.xlsx  (Wayback 20240118203118). "Effective 1/1/2024". Sheets as 2023
  (ContUS 7552, Ext 14404, Rem 3423, Alaska 228, Hawaii 77, IntraHawaii 37 rows).

### fuel_surcharge_effective_9-2-24.pdf — Wayback 20250108142344. "FedEx domestic fuel surcharge tables — Effective Sept. 2, 2024" (2 pp.).
### fuel_surcharge_effective_7-1-24.pdf — Wayback 20250720130029. **International** table (July 1 2024); not domestic.
### fuel_surcharge_effective_10-7-24.pdf — Wayback 20240920153624. **International** table (Oct 7 2024); not domestic.
### fuel-surcharge_page_wayback_2024-09-12.html — Wayback 20240912205520 (current-week % + Ground/Express trigger tables).
### historical-fuel-surcharge_page_wayback_2024-12-02.html — Wayback 20241202191637; weekly rows Aug 26 2024 – Nov 24 2024.
### rate-changes_page_wayback_2024-04-07.html — Wayback 20240407054452. GRI (quoted): "... FedEx Ground standard list rates will
  increase an average of 5.9%." (effective Jan 1, 2024). Links `fuel_surcharge_effective_12-11-23.pdf`.

---

## 2025  (`data/raw/fedex/2025/`)

### FedEx_Standard_List_Rates_2025.pdf
- URL: .../FedEx_Standard_List_Rates_2025.pdf  (Wayback 20241108082257). PDF 112 pp. "Effective January 6, 2025". U.S. package
  rates pp. 1-21, AK/HI pp. 22-30, international pp. 36-104, **Ground & Home Delivery zones 2-8 pp. 105-107**, AK/HI pp. 108-110.
- Pre-effective capture (Nov 2024); later captures 2024-12-09, 2025-01-08, 2025-08-24, 2025-10-25, 2025-12-04 exist (not fetched).

### FedEx_Standard_List_Rates_2025.xlsx
- URL: .../FedEx_Standard_List_Rates_2025.xlsx  (Wayback 20250108215326). Sheets: `2025 U.S. rates` (1375x21, "Effective 1/6/2025",
  blocks starting "FedEx First Overnight®" ...), `2025 U.S. Export rates`, `2025 U.S. Import rates`, `2025 Ground & FHD rates`
  (316x28; "FedEx Ground® and FedEx Home Delivery® (Contiguous U.S.; Alaska and Hawaii)"). **Preferred source for 2025.**

### Service_Guide_2025.pdf — Wayback 20250107195141. PDF ~183 pp., 11 MB. Surcharge index: Additional Handling p.126, Non-stackable
  p.127, Delivery Area p.130, Demand Surcharge (footnoted), Oversize p.138, Residential Delivery Charge (~p.139). Dim weight text:
  "... dividing the total by 139" (footnote marker "2" follows the number in extracted text: "1392").

### surcharge_and_fee_changes_2025.pdf — Wayback 20240916232044. PDF 6 pp. 2024→2025 change table. Quoted: "Delivery Area Surcharge
  FedEx First Overnight®, FedEx Priority ... $5.85 → $6.20 per package"; "Ground Unauthorized ... $1,250 → $1,325 per package";
  "Residential Delivery Charge U.S. Package Services $6.15 → $6.55 per package"; "Oversize Charge International Package Services
  $175 → $190 per package"; DAS max charge "$19.75 → $21 per shipment (Commercial)".

### DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2025.xlsx — Wayback 20250108221303. "Effective 1/13/2025". Same 6 sheets
  (ContUS 7615, Ext 14390, Rem 3425, Alaska 228, Hawaii 77, IntraHawaii 37).

### fuel_surcharge_effective_2-10-25.pdf — Wayback 20250117211935. "FedEx domestic fuel surcharge tables — Effective Feb. 10, 2025" (2 pp.).
### fuel_surcharge_effective_6-9-25.pdf — Wayback 20250821171459. "FedEx domestic fuel surcharge tables — Effective June 9, 2025" (4 pp.).
### fuel_surcharge_effective_12-1-25.pdf — Wayback 20251202185419. "FedEx domestic fuel surcharge tables — Effective Dec. 1, 2025" (2 pp.).
### fuel-surcharge_page_wayback_2025-12-05.html — Wayback 20251205093936.
### historical-fuel-surcharge_page_wayback_2025-09-20.html — Wayback 20250920040430; weekly rows June 16 2025 – Sept 14 2025.
### rate-changes_page_wayback_2025-01-02.html — Wayback 20250102231702. GRI (quoted): "FedEx package and freight standard list rates
  for U.S., U.S. export, and U.S. import services will increase an average of 5.9%." (effective Jan 6, 2025). Contains the
  "U.S. package Demand Surcharges" notice (Updated Aug 15, 2024) — amounts are on a linked page, not in this HTML.

---

## 2026  (`data/raw/fedex/2026/`)

### FedEx_Standard_List_Rates_2026.pdf
- URL: .../FedEx_Standard_List_Rates_2026.pdf  (Wayback 20251014065228). PDF 112 pp. "Effective January 5, 2026". Layout as 2025
  (Ground & Home Delivery zones 2-8 pp. 105-107; file pages 106-108 verified to carry that heading).
### FedEx_Standard_List_Rates_2026_wayback-2026-10-22.pdf
- Same URL, Wayback 20261022095520. First page reads "Effective January 5, 2026 / **Updated June 1, 2026**". 112 pp. This is the
  in-force mid-year revision; use this one over the Oct-2025 capture and diff them to see what changed on June 1, 2026.
### FedEx_Standard_List_Rates_2026.xlsx
- URL: .../FedEx_Standard_List_Rates_2026.xlsx  (Wayback 20251024100834). Sheets `2026 U.S. rates` (1375x24, "Effective 1/5/2026"),
  `2026 U.S. Export rates`, `2026 U.S. Import rates`, `2026 Ground & FHD rates` (316x28). Oct-2025 capture — **predates the June 1,
  2026 update**; a later XLSX capture was not fetched (check CDX for `FedEx_Standard_List_Rates_2026.xlsx` after 2026-06).

### Service_Guide_2026.pdf — Wayback 20260120220702. PDF ~186 pp., 10.6 MB. Surcharge index: Additional Handling p.127, Non-stackable
  p.128, Oversize p.128, Delivery Area p.134, Demand Surcharge p.135, Residential Delivery Charge (~p.135). Dim weight: "...
  dividing the total by 139" (footnote "3" trails the number in extracted text). Note the web search result for this URL
  shows a later "Updated September 11, 2026" revision exists — not fetched.

### surcharge_and_fee_changes_2026.pdf — Wayback 20250919090637. PDF 7 pp. 2025→2026 change table. Quoted: "Delivery Area Surcharge
  U.S. Package Services (Residential) $6.20 → $6.60 per package"; "Ground Unauthorized ... $1,775 per package* → $1,875 per
  package (*Effective July 14, 2025)"; "Residential Delivery Charge U.S. Package Services $6.55 → $6.95 per package"; "Oversize
  Charge International Package Services $190 → $208 per package"; several mid-2025 effective dates (May 2, July 14, Aug 18,
  Sept 22, 2025) for interim changes.

### DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2026.xlsx — Wayback 20260820135800. Header "Effective 7/20/2026" (a mid-year ZIP
  list revision; the January 2026 list was not captured separately). Sheets ContUS 7691, Ext 14387, Rem 3600, Alaska 228,
  Hawaii 77, IntraHawaii 37.
- Not fetched: `PAS_Contiguous_Extended_Remote_2026.xlsx` (a new "PAS" ZIP list linked from the 2027 rate-changes page; download
  failed during the archive outage and was not retried).

### fuel_surcharge_effective_5-11-26.pdf — Wayback 20260511173026. **International** table (May 11 2026) — not domestic.
### fuel_surcharge_effective_6-22-26.pdf — Wayback 20260825224558. **International** table (June 22 2026) — not domestic.
  (No domestic trigger-table PDF for 2026 was found in the CDX listing; the domestic Ground table "Effective June 1, 2026" is
  embedded in the fuel-surcharge page snapshot below.)
### fuel-surcharge_page_wayback_2026-10-09.html — Wayback 20261009160010. Quoted current rows: "Oct. 12, 2026–Oct. 18, 2026 28.75%
  [Ground/Home Delivery] ... 32.25% [domestic package] $0.712 per lb. [express freight] 44.50% [export & import]" and
  "Oct. 5, 2026–Oct. 11, 2026 29.25% ... 31.75% $0.704 per lb. 44.25%". Also the Ground trigger table "Effective June 1, 2026
  (prices per gallon of diesel fuel) At least $5.89 But less than $5.98 → 28.00% ...".
### historical-fuel-surcharge_page_wayback_2026-10-13.html — Wayback 20261013031726; weekly rows July 13 2026 – Oct 4 2026.
### rate-changes_page_wayback_2026-01-24.html — Wayback 20260124173619. GRI (quoted): "FedEx package standard list rates for U.S.,
  U.S. export, and U.S. import services will increase an average of 5.9%." (effective Jan 5, 2026). Demand surcharge notice
  "Updated July 8, 2025: U.S. package Demand Surcharges" (details on a linked page, not captured here).

---

## 2027  (`data/raw/fedex/2027/`)  — rates announced, effective Jan 4, 2027

### FedEx_Standard_List_Rates_2027.pdf — URL .../FedEx_Standard_List_Rates_2027.pdf (Wayback, nearest capture to 20261020; exact
  timestamp not recorded — re-query CDX). PDF 114 pp. "Effective January 4, 2027".
### FedEx_Standard_List_Rates_2027.xlsx — Wayback 20261012154441. Sheets `2027 U.S. rates` (1375x21, "Effective 1/4/2027"),
  `2027 U.S. Export rates` (826), `2027 U.S. Import rates` (647), `2027 Ground & FHD rates` (316x28).
### DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2027.pdf — Wayback 20261011133532. PDF 52 pp. "Effective January 4, 2027";
  sections Contiguous / Extended / Remote / Alaska / Hawaii / Intra-Hawaii. (The 2027 XLSX is linked on the page but no 200
  capture was found.)
### rate-changes_page_wayback_2026-10-11.html — Wayback 20261011070339. GRI (quoted): "FedEx package rates Effective Jan. 4, 2027 —
  FedEx package standard list rates for U.S., U.S. export, and U.S. import services will increase an average of 5.9%."
  Demand surcharge notices: "Updated July 22, 2026: U.S. package Demand Surcharges ..." and "Updated Sept. 4, 2026: ... Effective
  Sept. 21, 2026, FedEx will adjust the Demand Surcharge for U.S. international services, as well as apply Demand — Non-standard
  shipments fees ...". Links `surcharge_and_fee_changes_2027.pdf` (fetch returned 404 from the archive — **not retrieved**).

Third-party corroboration (not saved, not authoritative): Supply Chain Dive, 2026-09-21,
https://www.supplychaindive.com/news/fedex-preps-59-rate-hike-surcharge-increases-for-2027/830903/ — reports 5.9% average
effective Jan 4, 2027 and quotes 2026→2027 surcharge moves (Residential delivery $6.95→$7.35, DAS residential $6.60→$7.00,
Oversize zones 3-4 $275→$290). Treat as unverified until `surcharge_and_fee_changes_2027.pdf` is obtained.

---

## Looked for and NOT retrieved

| Item | What was tried | Status |
|---|---|---|
| Live fedex.com pages (current-rates, fuel-surcharge, surcharges-fees, rate-changes) and live PDFs | curl (browser UA), WebFetch | WAF block page for every request from this host |
| `FedEx_Standard_List_Rates_2023.xlsx`, `_2024.xlsx` | Wayback CDX | only `text/html` (blocked) captures; no real file archived |
| `FXE_FXG_Surcharges_and_Fees_2023.pdf`, `_2024.pdf` | Wayback CDX | only blocked captures. 2023 amounts must come from Service_Guide_2023.pdf or the "old" column of surcharge_and_fee_changes_2024.pdf |
| `surcharge_and_fee_changes_2027.pdf` | Wayback (nearest capture) | 404 — not yet archived |
| `PAS_Contiguous_Extended_Remote_2026.xlsx`, `_2027.xlsx`, `DAS_..._2027.xlsx` | Wayback | first attempt hit the archive outage; not retried / no capture |
| 2022 per-tier DAS `.txt` lists | not attempted (CDX listed 2018-2021 only) | — |
| Final in-year versions of the 2022/2024/2025 rate PDFs (captures exist after the effective date) | not fetched (timebox) | pre-effective captures saved instead |
| 2026 Service Guide "Updated Sept 11, 2026" revision; 2026 XLSX after the June 1 update | not fetched | — |
| Full weekly fuel-surcharge history 2022-2026 | one `historical-fuel-surcharge.html` snapshot per year | each snapshot covers ~13 weeks only; a full series needs ~monthly snapshots stitched (CDX shows them) |
| Domestic fuel trigger-table PDFs for every change (e.g. 5-6-24, and the 2023 Jan/Apr tables) | CDX | `5-6-24` has only blocked captures; others not searched exhaustively |
| U.S. package Demand/peak surcharge *amount tables* per year | rate-changes snapshots only carry the notice + link ("click here") | amounts live on linked pages / Service Guide "Demand Surcharge" sections (SG 2024 p.~119, SG 2025 p.~131, SG 2026 p.135) — not separately extracted |
| FedEx newsroom press releases for each GRI | WebSearch found https://newsroom.fedex.com/newsroom/global-english/fedex-announces-adjusted-shipping-rates-fees-and-surcharges (2024 GRI) | not fetched; the GRI figures above are taken from FedEx's own rate-changes page snapshots instead |

## Demand and peak surcharge pages (added 2026-10-23 by the parser work, issue #2)

Fetched with `data/fetch_raw.py` from the Wayback Machine (fedex.com blocks this host).
Exact URLs and checksums are in `../manifest.csv`; the Wayback timestamp in each URL
redirects to the nearest capture of that date.

| File | Season |
|---|---|
| 2023/peak-surcharges_page_wayback_2022-11.html | 2022-23 peak |
| 2024/demand-surcharges_page_wayback_2023-12.html | 2023-24 demand (a 2023-11 capture returned a FedEx block page) |
| 2025/demand-surcharges_page_wayback_2024-11.html | 2024-25 demand |
| 2026/demand-surcharges_page_wayback_2025-11.html | 2025-26 demand |
| 2027/demand-surcharges_page_wayback_2026-10.html | 2026-27 demand |
