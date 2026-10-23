# Frontend

Vite + React + TypeScript dashboard. Design direction and rules: [DESIGN.md](DESIGN.md).

## Run locally

Node 18.18+ (Docker uses Node 22).

```sh
npm ci
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` to the backend at `VITE_API_TARGET`, default
`http://localhost:8787`. Start the backend on that port from the repository root:

```sh
cd backend && uv run uvicorn app.main:app --reload --port 8787
```

In Docker the built app is served by nginx instead, which proxies `/api` to the
backend container; see the root README.

To point at a backend elsewhere: `VITE_API_TARGET=http://localhost:9000 npm run dev`
(or put the variable in `frontend/.env.local`).

Without a backend, open `http://localhost:5173/?mock=1`: the app serves the backend's
recorded example responses from `src/api/__fixtures__/` and shows a "Mock data" banner.
Mock answers do not change with the inputs.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | dev server with the `/api` proxy |
| `npm run test` | Vitest + Testing Library, including the API contract test |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run build` | type-check and build into `dist/` |
| `npm run e2e` | Playwright end-to-end tests and axe checks against a running stack |
| `npm run e2e:update-screens` | rewrite the review screenshots in `e2e/screenshots/` |

## End-to-end tests

Playwright 1.49 (the last release that runs on Node 18) with two projects:
`desktop` (Chromium, 1440 × 900) and `mobile` (Pixel-like, 375 × 812, touch, 2×).
Specs are in `e2e/`; `e2e/helpers.ts` holds the shared steps (open the app, load
the sample, switch question, open the settings rail or sheet). Waits are on API
responses and visible state, never on fixed timeouts.

```sh
npx playwright install chromium        # once
docker compose up -d --build           # from the repository root; app on :8088
npm run e2e                            # flows + axe, both projects
npm run e2e:update-screens             # screenshots, both projects, light and dark
npx playwright test --project=mobile   # one project; add a file name to run one spec
```

`E2E_BASE_URL` points the suite elsewhere (default `http://localhost:8088`), e.g.
the dev servers: start the backend on 8787 and `npm run dev`, then
`E2E_BASE_URL=http://localhost:5173 npm run e2e`.

| Spec | Covers |
|---|---|
| `q1-quote.spec.ts` | sample mix strip, typical parcel answer and line items with sources, bulky box size note, speed tier, 422 message at the weight input |
| `q2-breakeven.spec.ts` | map and readout, homes/businesses, keyboard focus tooltip, "Show as table" |
| `q3-blended.spec.ts` | empty state, answer, loss verdict, segment chip re-query and count |
| `q4-yearly.spec.ts` | answer, dollars/index scale, next-year slider and reset, driver chips |
| `controls.spec.ts` | 2027 FedEx-only note, USPS retail vs commercial, fuel override and reset, peak, URL state across a reload |
| `csv-upload.spec.ts` | a valid file, and a file whose error names the row |
| `mobile-sheet.spec.ts` | the settings sheet is a modal dialog, traps focus, closes on Escape |
| `a11y.spec.ts` | axe (WCAG 2.2 AA + best practice) on every question, light and dark; fails on serious or critical |
| `screenshots.spec.ts` (`@screens`) | full-page captures for [docs/ux-review.md](../docs/ux-review.md) |

Failures leave a trace and a screenshot in `e2e/.output/` (ignored by git).

## API contract

`src/api/types.ts` mirrors `docs/API.md` and `backend/app/api/models.py`.
`src/api/contract.test.ts` checks every example payload in `src/api/__fixtures__/`
(copied from `docs/api-examples/`) against the runtime guards in `src/api/guards.ts`, so
a change on either side fails the tests until both agree.
