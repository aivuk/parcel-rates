# Data availability and quality report

Issue #1. Survey date: 2026-10-22. Three agents, one per carrier, searched for
the published (non-contract, retail) US domestic parcel rates of USPS, UPS and
FedEx for 2022 through 2026, downloaded what they could, and recorded every
file with its URL, retrieval method and parse notes in
`data/raw/<carrier>/SOURCES.md`. This report consolidates their findings and
records the decisions that follow from them.

## Summary

| | USPS | UPS | FedEx |
|---|---|---|---|
| Base rate tables | Every price change 2022–2026 (15 events) | Yearly Daily Rates guide, 2022–2026 | Yearly Standard List Rates, 2022–2027 |
| Best format | CSV zip per price change (clean) | Text PDF only (tables span ~4 pages per service) | XLSX for 2022, 2025, 2026, 2027; text PDF for 2023, 2024 |
| Surcharge rules | Footnotes in Notice 123 PDFs | Surcharge section of the same guide (3-column prose) | Yearly "surcharge and fee changes" PDFs (2022, 2024–2026) plus Service Guides |
| Residential / delivery area | None (confirmed) | Residential, DAS, extended DAS amounts in guide; ZIP list not downloaded | Residential, DAS amounts; DAS ZIP lists downloaded for every year |
| Dimensional weight | Over 1,728 cu in, greater of actual and dim weight; divisor 166 (DMM 123 and 133, March 2024 capture) and 139 from 2026-07-12 (DMM, live), no zone restriction; verified | Divisor 139, round up to next pound (verified in 2026 guide) | Divisor 139 (verified in every Service Guide 2022–2026) |
| Fuel surcharge | None | No weekly history retrievable; only index-to-percent tables | Weekly history page, one ~13-week snapshot saved per year |
| Peak / demand surcharges | Peak price tables per season (2022, 2024, 2025, 2026; none in 2023) | Demand surcharge PDFs 2022–2024 | Dated notices; amounts inside Service Guides, not isolated |
| Announced average increase | USPS press releases, per product (primary source) | Secondary news sources only (5.9% 2022, 6.9% 2023, 5.9% 2024–2026) | FedEx's own rate-change pages: 5.9% every year except 6.9% in 2023 (primary) |
| Access | Direct, needs a browser User-Agent | assets.ups.com blocks curl; fetched through Wayback passthrough | fedex.com blocks this host entirely; everything via the Wayback Machine |
| Raw size | 26 MB (48 files) | 40 MB (23 files) | 74 MB (56 files) |

## Per carrier

### USPS

- **Coverage.** All 15 price changes from January 2022 to October 2026, each
  with a Notice 123 PDF and a Postal Explorer CSV zip. Press releases give the
  announced average increase per product for most changes.
- **Services.** Priority Mail and Priority Mail Express 1–70 lb by zone 1–9
  in every file. Ground Advantage exists from 2023-07-09; before that the
  equivalent lineage is First-Class Package Service (up to 15.999 oz) plus
  USPS Retail Ground (1–70 lb).
- **Parse difficulty.** Low. Each CSV block has a short irregular preamble,
  then a `,Zone 1,…,Zone 9` header and one row per weight step. One float
  artifact (`15.999000000000001`). Surcharge rules are not in the CSVs; they
  are footnotes beside the tables in the PDFs, which pdftotext interleaves
  with price rows. Reading them by hand into a curated table is faster and
  safer than parsing them.
- **Dimensional weight, verified.** Notice 123 only states the one cubic
  foot rule; the divisor is in the Domestic Mail Manual sections 123
  (Priority Mail) and 133 (Ground Advantage). Saved under
  `data/raw/usps/dmm/`: the March 2024 Wayback captures say "divide the
  result by 166"; the 2026-10-22 live pages say "divide the result by 139"
  with a `[7-12-26]` change marker. Neither restricts the rule by zone.
- **Gaps.** No bulk zone matrix without an order
  form; the free per-origin zone chart is a form POST on postcalc.usps.com.
- **Quirks.** 2026 has three states: January base, a time-limited +8%
  transportation surcharge from April, and the October peak table.

### UPS

- **Coverage.** A full Daily Rates guide for every year 2022–2026, with all
  five target services, zones 2–8 plus 44–46, 1–150 lb, and the surcharge
  section. Demand surcharge PDFs for 2022–2024 and fuel index tables for
  several dates.
- **Parse difficulty.** Medium. Text PDFs; `pdftotext -layout` gives aligned
  columns on rate pages, but each service table spans about four pages with a
  repeated header strip, and page numbering shifts between the 158–165 page
  guides (2022–2024) and the 216 page guides (2025–2026). The surcharge pages
  are three-column prose with inline tables and need regex extraction.
- **Gaps.** No weekly fuel surcharge history anywhere accessible (the UPS
  page is JavaScript-rendered and Wayback snapshots carry no values). No
  UPS-authored source for the announced increases, only trade press. 2027 not
  announced as of 2026-10-13. DAS ZIP list not downloaded.
- **Editions.** Mid-year updates exist for 2023, 2024, 2025 and 2026; the
  December original is missing for 2024 and 2026, so those years use the
  mid-year revision.

### FedEx

- **Coverage.** Standard List Rates for 2022–2027 with all six target
  services, surcharge change documents for 2022 and 2024–2026, Service Guides
  2022–2026, DAS ZIP lists for every year, fuel trigger tables and one
  historical fuel snapshot per year, and FedEx's own rate-change pages with
  the announced increase.
- **Parse difficulty.** Low for the XLSX years (one sheet per market, stacked
  blocks per service, `Zones 2 3 4 …` header). Medium for 2023 and 2024,
  which are PDF only but consistently laid out. Surcharge change PDFs are
  four-column old/new tables with wrapped cells.
- **Gaps.** No XLSX for 2023 and 2024. No 2023 surcharge change document
  (use the 2024 one's "old" column). Demand surcharge amounts are inside the
  Service Guides rather than isolated. Only one ~13-week fuel window per year.
- **Quirks.** 2026 rates were revised on June 1 2026 and the XLSX predates
  that revision; the PDF captured on 2026-10-22 includes it.

## Decisions

1. **Year range: 2023 through 2026** for the year-over-year view, four price
   points under each year's January list prices. 2022 is excluded from the
   MVP because USPS had a different product set (the Ground Advantage lineage
   starts in July 2023). For USPS 2023 the July 2023 tables are used and
   labelled as such. 2027 FedEx rates are already published and are kept as
   an optional forward year (issue #11).
2. **Parse order by confidence.** USPS CSVs first, FedEx XLSX years next,
   then the FedEx and UPS PDF years. Each parser is validated against
   hand-checked prices from the documents.
3. **Surcharge rules are curated, not parsed.** Amounts for residential,
   delivery area, additional handling, oversize, nonstandard and peak are
   transcribed into `data/processed/surcharges.csv` with the source file and
   page for each row. The PDFs are kept as evidence, not as pipeline input.
4. **Fuel surcharge default per year.** FedEx is the only carrier with a
   retrievable history. The per-year default for both UPS and FedEx is taken
   from the FedEx historical snapshots (the two carriers' percentages track
   each other closely), recorded with its source window, and flagged as an
   approximation. The slider in the UI is the user's override. USPS has none.
5. **Announced increases.** FedEx and USPS from primary sources. UPS from
   trade press, marked as secondary in `announced_increase.csv`.
6. **Dimensional weight.** Divisor 139 for UPS and FedEx on every billable
   parcel. For USPS, dim weight applies only above 1,728 cubic inches, with
   divisor 166 through 2026-07-11 and 139 from 2026-07-12, verified against
   the DMM captures in `data/raw/usps/dmm/`.
7. **Raw files in git.** Only the spreadsheets, CSV zips and small HTML
   snapshots are committed (about 8 MB). No PDF is tracked. Every raw file,
   tracked or not, is listed in `data/raw/manifest.csv` with its URL
   (Wayback passthrough form where applicable), SHA-256 and size, and
   `python3 data/fetch_raw.py` restores the missing ones one at a time with
   a pause between requests, retrying with backoff, and verifies checksums.
8. **Citations are tested.** Every hand-curated row (surcharges, fuel,
   announced increases, dimensional weight, zone bands) cites a file, a
   page and a verbatim quote containing the amount; a test opens the cited
   page and checks the quote is there. A missing raw file fails the test with
   a pointer to `data/fetch_raw.py`; `ALLOW_MISSING_RAW=1` turns that into a skip.
9. **Zones.** Distance bands stand in for ZIP-to-ZIP zones (issue #9 is the
   bonus). The band table is documented in `data/processed/zone_from_distance.csv`.

## Known limitations to state in the README

- List prices only; any shipper with a negotiated contract pays less.
- Zones are approximated from distance, not looked up from ZIP pairs.
- UPS fuel surcharge history is a proxy taken from FedEx.
- UPS announced-increase percentages come from trade press.
- Peak surcharges are modelled as a toggle with that year's amounts, not by
  ship date.
