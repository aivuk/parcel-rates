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
- **Raw files:** small, parse-ready sources are committed (about 35 MB).
  Full-guide PDFs are gitignored with their URLs recorded, and re-fetched by
  the pipeline when absent.
