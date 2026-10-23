# Decisions

Running log of the choices made for this project, in the order they were made.
Each entry says what was decided, the alternatives considered, and why.
See `docs/ASSIGNMENT.md` for the brief and `docs/agent-log/` for the agent
conversations that led here.

## 2026-10-22 — Problem, user and scope

**Problem.** A small online shop sends a few hundred to a few thousand parcels
a month, has no negotiated carrier contract, and pays the published list
prices of FedEx, UPS and the Postal Service. Today the carrier is chosen by
habit. The dashboard helps the owner choose the carrier per kind of parcel,
and check whether the flat shipping price charged to customers still covers
the real cost once surcharges and yearly price increases are included.

**Questions the dashboard answers.**

1. For a given parcel (weight, dimensions, distance, residential or business,
   required speed), which service is cheapest once surcharges are included,
   and what are the line items of that price?
2. Where are the breakeven points between the Postal Service and FedEx or UPS
   ground, by weight and distance?
3. For the owner's whole set of parcels, what is the blended cost per parcel
   with each carrier, and how much of it is surcharges rather than base rate?
4. How did that blended cost change year by year under each year's published
   prices, compared with the average increase the carriers announced, and
   which kinds of parcels in the mix drove the change?

**Scope decisions.**

- Timebox: issues are sized to fit about five hours of focused work (the
  brief's upper bound). Extras are tracked separately and only started if
  time remains. Time actually spent is recorded by the owner, not estimated.
- Services: three speed tiers across the three carriers — ground, two to
  three day, and next day. Weight capped at 70 lb (the USPS maximum).
- Years covered: decided after the data survey (issue 1), based on what can
  actually be downloaded and parsed reliably.
- Parcel input: CSV upload plus a bundled illustrative sample mix. Columns:
  weight, length, width, height, distance in miles, residential flag,
  required speed, and an optional per-parcel price charged to the customer.
  Dimensional weight is computed from the dimensions.
- Price charged to the customer: a single flat price is the MVP control. The
  optional per-parcel column overrides it when present.
- Fuel and peak surcharges: a documented per-year default taken from the
  published history, a slider to stress test the fuel percentage, and a peak
  season toggle. A next-year increase slider sits on the year-over-year view.
- Zone from distance: a documented distance-band to zone mapping. Real
  ZIP-to-ZIP zones are a bonus, not MVP.
- The app never fetches live data; all rate tables are committed.

## 2026-10-22 — Stack

| Area | Decision | Alternatives considered | Why |
|---|---|---|---|
| Backend | FastAPI, Pydantic models, pandas over committed CSV tables loaded in memory, managed with `uv` | DuckDB; SQLite | Rate cards are a few thousand rows. No database keeps Docker and setup trivial. |
| Data collection | Python scripts under `data/` that download the carriers' published rate documents, parse them (pdfplumber for PDFs), and write normalized CSVs that are committed | Hand-typed tables | Reproducible, documents provenance, and qualifies for the scraping bonus. |
| Frontend | Vite + React + TypeScript, Recharts for line and bar charts, a custom SVG heatmap for the breakeven map, plain CSS with design tokens | Chart.js (needs a matrix plugin for heatmaps); Plotly (over 1 MB, poor on mobile); Tailwind | Small bundle, declarative, the heatmap is a trivial grid. |
| Docker | `docker compose` with two services: uvicorn backend and an nginx container serving the Vite build and proxying `/api` | Single multi-stage image with FastAPI serving static files | Clean separation, one command for the reviewer. |
| Tests | pytest for pipeline, rate engine and API; Vitest + Testing Library for components; Playwright end to end at 1440 and 375 px with screenshots reviewed for UX | — | Required by the brief and by us. |
| Workflow | Private GitHub repo, one issue per task, a branch and git worktree per issue, parallel agents each in their own worktree, pull requests merged with merge commits | Commit straight to main | Keeps history and lets agents work in parallel without stepping on each other. |
| Agent log | `SessionEnd` hook exports every session (and subagent) transcript to `docs/agent-log/<session-id>.md` and commits it; home directory path redacted | Manual export | Required by the brief, zero effort once set up. |

## 2026-10-22 — Year range and data policy (from the data survey, issue #1)

Full findings in `docs/data/QUALITY.md`; sources per file in `data/raw/<carrier>/SOURCES.md`.

- **Years: 2023 through 2026**, under each year's January list prices
  (USPS 2023 uses the July 2023 tables, when Ground Advantage launched).
  2022 is dropped from the MVP because USPS sold a different product set.
  FedEx 2027 rates are already published and are kept as an optional forward year.
- **Base rates are parsed** from USPS CSV zips, FedEx XLSX (2022, 2025–2027)
  and text PDFs (FedEx 2023–2024, UPS all years), each validated against
  hand-checked prices.
- **Surcharge rules are curated** into a CSV with a source file and page per
  row, rather than parsed from prose PDFs.
- **Fuel surcharge:** per-year default from FedEx's published history,
  applied to UPS as a proxy and flagged; the UI slider overrides it. USPS has none.
- **Announced increases:** FedEx and USPS from primary sources; UPS from
  trade press, marked secondary.
- **Raw files:** only spreadsheets, CSV zips and small HTML snapshots are
  committed (about 8 MB). All PDFs are gitignored and restored by
  `data/fetch_raw.py` from `data/raw/manifest.csv` (URL, SHA-256, size),
  fetched one at a time with a pause between requests.
- **Citations:** every curated row carries file, page and verbatim quote,
  and a test checks the quote against the document.
- **USPS dimensional weight** verified in the DMM: divisor 166, then 139 from
  2026-07-12, above 1,728 cubic inches, all zones.
- **Schema** for all processed tables and the parcel CSV is fixed in
  `docs/data/SCHEMA.md` before any parser is written.

## 2026-10-23 — Data collection must be fully scripted (rule; discovery still open in #13)

- Every step of data collection, including finding the source URLs, must run
  from committed scripts without an LLM or agent, so the data can be rebuilt
  on another machine or refreshed next year. Triggered by the owner asking
  where the download scripts were: the survey agents had fetched with one-off
  calls and only a post-hoc fetcher existed.
- Done: `data/fetch_raw.py` restores every file in `data/raw/manifest.csv`
  with checksums, with no agent involved. Not done: the discovery step
  (Wayback lookups, file-name resolution) is still manual. It is tracked in
  #13, which the owner deferred to the extras.

## 2026-10-23 — Schema amendments before the parsers (issue #2, PR #15)

The owner reviewed the draft `docs/data/SCHEMA.md` and asked for these changes
before any parser agent was dispatched. From this point every big step
(dispatching agents, merging) waits for the owner's OK.

- **Rate cards.** A `rate_card` column on every base-rate row. USPS keeps
  `retail` and `commercial`, and the dashboard defaults to `commercial`,
  because small online sellers buy postage through shipping software at
  commercial prices and almost never pay counter prices; retail stays
  selectable. UPS Daily Rates and FedEx Standard List Rates are stored as
  `list`, not `retail`: they are the carriers' published prices, which is what
  a shop without a contract pays, and "retail" would suggest a counter price.
  `services.csv` explains each card in one line per carrier. The default is
  explained in the README.
- **Exceptions are warnings, not silent fixes.** Alaska and Hawaii columns,
  rounding artefacts and other anomalies in the carriers' tables are kept as
  printed and listed in `exceptions.csv`; the invariant tests fail on any
  anomaly that is not in that allowlist.
- **Rules that change over time.** The owner asked to check every variable
  that moves a price across years. Result: dimensional-weight rules carry
  `effective_from` / `effective_to` (USPS divisor 166, then 139 from
  2026-07-12), and every price-moving rule change is listed in
  `docs/data/RULE_CHANGES.md`.
- **Surcharge rows** gained `address_type` (carriers price delivery-area and
  large-package surcharges differently for homes and businesses), a width
  threshold column, and a packaging-handling condition with a matching
  `nonstandard_packaging` column on the parcel CSV.
- **Fuel** is applied to the base plus the surcharges flagged `fuel_applies`,
  with tests that check that basis.
- **Golden cells** include, per carrier, card and year, the heaviest weight in
  the farthest and nearest zone and the lightest weight in the farthest zone,
  because column and page shifts in the PDFs break exactly those cells.
- **Curated rules stay diffable.** Surcharge and rule tables are Python
  literals with verbatim quotes, written to committed CSVs, and the
  quote-on-cited-page test runs against those CSVs. Where a carrier rule was
  not found, the note says "not found in the current source" rather than "no
  such surcharge" (for example UPS peak surcharges not yet announced, #14).

## 2026-10-23 — Zone bands from the Domestic Mail Manual (issue #2)

- The brief assumed USPS zones 1 and 2 share a 0–50 mile band and that UPS
  and FedEx zone n equals USPS zone n+1. The USPS pipeline agent fetched DMM
  608.9.4.2, which shows zone 1 up to about 50 miles and zone 2 up to about
  150 as separate bands.
- `zone_from_distance.csv` now follows the DMM for USPS. UPS and FedEx publish
  zones only by ZIP pair, so their bands are derived: zone 2 = 0–150 miles
  (USPS zones 1 and 2 together), zone n = the USPS zone n band for n ≥ 3. The
  derivation is written into the table's `notes` column with the DMM quote.

## 2026-10-23 — Delivery area is a per-parcel opt-in (issue #2, #3)

- Delivery-area and extended-area surcharges are triggered by ZIP-code lists.
  The dashboard works from distance, not ZIP pairs, so it cannot look the area
  up. Instead the parcel CSV has an optional `delivery_area` column (`none`,
  `das`, `extended`) and the quote form has the same control.
- Alternative rejected: applying an average rural share to every parcel,
  which would hide a surcharge that is all or nothing for a given address.
  Real ZIP-to-ZIP zones and area lookup are the bonus in #9.

## 2026-10-23 — Engine rules and the API contract (issues #3–#6, PRs #16, #17)

- One written contract (`docs/API.md`) before backend and frontend work
  started in parallel, so the two could be built by separate agents.
- Threshold semantics fixed in the schema during the engine work: weight
  bands are inclusive on billable weight, single weight thresholds strict on
  actual weight, dimension thresholds strict, `effective_to` inclusive. The
  USPS and UPS rule windows were corrected to match.
- Merging policy: every pull request is reviewed by a review agent and fixed
  before it is merged, with a merge commit.
- Local development uses port 8787 and the compose stack 8088, because 8000
  and 8001 are taken on the development machine (PRs #19, #20).

## 2026-10-23 — Model switch

- The main session and all subagents moved to Opus 5.5 (1M context) on
  2026-10-23 at 08:29, to stay within usage limits for the rest of the build.
  Earlier work, including the data survey, ran on the previous default.

## 2026-10-23 — 90 lb minimum billable weight and base rates to 150 lb (issue #18, PR #24)

- Found in the PR #17 review: UPS Large Package and FedEx Oversize parcels are
  billed at a minimum of 90 lb, but the engine priced the base at actual or
  dimensional weight, understating it.
- The minimum is data, not code: a `min_billable_weight_lb` column on those
  surcharge rows, cited per year and checked on its page. To price it from
  the carriers' own tables, UPS and FedEx base rates are parsed to 150 lb
  (USPS stays at 70). Actual weight stays capped at 70 lb; parcels whose
  dimensional weight is 71–150 lb are now priced instead of unavailable.

## 2026-10-23 — FedEx 2027 stays as a forward year, flagged (PRs #21, #23)

- FedEx 2027 base rates are published and parsed, but its surcharge-change
  document is not archived, so only the Home Delivery residential charge and
  the January peak rows exist. Rather than drop the year, it stays selectable
  and the UI states that 2027 is FedEx only and that its totals understate
  surcharges (Q1, Q2, Q4 notes; README limitations).

## 2026-10-23 — Typical sample mix (issue #22, PR #25)

- The first sample (300 parcels, 22 % bulky, 13 % expedited, all at the flat
  $9.99) showed 71 % of parcels shipped at a loss even with USPS. That was an
  artefact of the sample, not an insight.
- Owner decision: an illustrative home-goods shop with mostly light ground
  parcels, 7 % bulky, 4 % two-to-three day and 1 % next day, and the expedited
  parcels carrying their own `price_charged` ($19.99 / $39.99), as real shops
  charge more for speed. The default view now opens near break-even (USPS
  margin −$0.31 per parcel, 40 % of parcels at a loss), with the losses in
  bulky boxes, 5–20 lb and far zones. The label "illustrative example" is kept
  in the API and the UI.

## 2026-10-23 — End-to-end tests and screenshots (issue #8, PR #26)

- Playwright pinned to 1.49 so it runs on Node 18; axe scans fail on serious
  or critical violations and now pass at every level.
- Screenshots that passed the UX review are added to the README, at the
  owner's request; remaining UX items are tracked in #27.

## 2026-10-23 — Shipping-label redesign

- Owner decision: the first visual direction (warm cream paper, Newsreader
  serif, "shipping ledger") read like a generic AI-product page. The new
  direction is the shipping label, the one printed object every parcel sender
  knows: white stock, 2 px ink rules between zones, Barlow Condensed figures,
  IBM Plex Mono for line items, tables and citations, and safety orange
  (`#E8590C`) for the loss verdict only.
- Kept: the hierarchy and answer-first rule, the carrier colours, and the
  accessibility bar (axe at every impact level is clean on every view, light
  and dark, desktop and phone; ratios are measured in `frontend/DESIGN.md`).
- Structural changes: on desktop the assumptions rail is now a label header
  strip under the masthead (phones keep the bottom sheet); the Q3 and Q4
  answers are stamps (paper figure on an ink block); a CSS barcode stripe in
  the masthead is the only decoration.
- Consequences: the safety orange passes only as large text on white
  (3.6:1), so small loss text uses `--loss` (`#C2410C`, the same orange
  darkened). The Q2 heatmap's lightest saving step rose from 22 % to 45 % of
  the carrier colour, mixed in oklch with hue-true washes, so cells do not go
  pastel or beige on white. The Q4 "cost up" colour moved from rust to ochre
  to stay clear of the accent.

## 2026-10-23 — Compact page top

- Owner finding: after the shipping-label redesign too much of the first
  screen went to the masthead, the assumptions strip, the parcel strip and a
  three-line question, so the answer needed a scroll.
- Changes: the masthead is one 90 px band (the barcode is a small mark in the
  eyebrow); from 1280 px the assumptions return to a 260 px left rail, as the
  first design specified, with the strip kept for 1024–1279 px and the sheet
  below; control explanations move into one "About these assumptions"
  disclosure; the parcel set shares the question tab row; each question's
  heading is a one-line short form, with the full sentence as a muted caption
  under the answer.
- Effect at 1440 px: the Q1 answer moved from about 690 px to 360 px from the
  top, and the Q3 loss verdict is now on the first screen.

## 2026-10-23 — Free shipping from an order value (issue #10)

- The per-parcel `price_charged` column already overrode the flat price. The
  missing piece of the shop's pricing policy was "free shipping on orders of
  $X or more": parcels now take an optional `order_value` and the controls a
  `free_shipping_over` threshold. A parcel whose order reaches it is charged
  $0 for shipping, ahead of its own `price_charged` (free shipping is the
  policy the customer sees at checkout). Rows without an order value are not
  affected; the UI says so when a set has no `order_value` column.
- The rule is off by default. The sample mix gained illustrative order values
  from a separate random stream, so every other column and the default view
  (−$0.31 per parcel with USPS) are unchanged; from $75, 54 of 307 parcels
  ship free and the margin falls to −$2.06.
- Q1 prices one parcel against the flat price and does not take an order
  value; the rule applies to the parcel-set views (Q3 margins).

## 2026-10-23 — Next year from each carrier's own announcement (issue #11)

- Q4 already projected a next year, but with one slider percentage for every
  carrier. Each carrier now projects the year after its own latest price list
  (FedEx 2028, UPS and USPS 2027) at the increase it announced for that year
  when the data has one; the slider is the assumption for the others and,
  once moved, an override for all, with a reset back to the announcements.
- As of 2026-10-23 nothing beyond the loaded price lists is announced: UPS's
  2027 figure was pending (it announced 2026 on November 4, 2025) and USPS had
  not filed January 2027 prices. So today every projection is "assumed", and
  the UI says so per carrier.
- Owner decision: build the mechanism and a scripted watcher rather than wait.
  `data/collect/announcements.py` finds announcements by rule with no agent
  involved: the USPS January price release (primary), the dated GRI table on
  ebb Logistics for UPS (secondary; UPS's own pages render client-side and
  carry no text) and the FedEx rate-changes page (primary, via the latest
  Wayback capture because the live page serves a bot block with status 200).
  It saves each source with a manifest row and records the verbatim quote;
  the pipelines merge found rows only where the curated rules are silent, and
  the citation test checks each quote. Run against today's pages, it finds
  FedEx 5.9 % for 2027 with exactly the curated quote, and nothing else.

## Decisions changed after reviewing agent output

| Decision | What the agent produced | What changed, and why | Where |
|---|---|---|---|
| Zone bands | My brief told the agents UPS/FedEx zone n = USPS zone n+1 | The USPS agent's DMM reading showed zones 1 and 2 are separate; bands rebuilt from the DMM | Agent log 2026-10-23 08:44; PR #15 |
| Rate-card naming | Amended schema stored UPS Daily Rates and FedEx Standard List Rates as `retail` | Owner: `list` for UPS and FedEx, `retail`/`commercial` for USPS, default commercial | Agent log 2026-10-23 08:10 and 08:18; PR #15 |
| Sample mix | Generator produced a mix with 71 % of parcels at a loss | Owner reversed it to a typical mix with expedited `price_charged` | Issue #22; PR #25 |
| Minimum billable weight | Engine priced oversize parcels at actual or dimensional weight | Review of PR #17 found the 90 lb minimum; added as cited data | Issue #18; PR #24 |

The delivery-area opt-in is not in this table: the transcript shows the agent
proposed it in the schema draft (agent log 2026-10-22 13:23) and the owner
accepted it unchanged, so it is recorded above as a decision, not a reversal.
