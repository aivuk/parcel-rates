# Frontend

Vite + React + TypeScript dashboard. Design direction and rules: [DESIGN.md](DESIGN.md).

## Run locally

Node 18.18+ (Docker uses Node 22).

```sh
npm ci
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` to the backend at `VITE_API_TARGET`, default
`http://localhost:8001` (port 8000 is used by another app on the dev machine).
Start the backend on that port from the repository root:

```sh
cd backend && uv run uvicorn app.main:app --reload --port 8001
```

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

## API contract

`src/api/types.ts` mirrors `docs/API.md` and `backend/app/api/models.py`.
`src/api/contract.test.ts` checks every example payload in `src/api/__fixtures__/`
(copied from `docs/api-examples/`) against the runtime guards in `src/api/guards.ts`, so
a change on either side fails the tests until both agree.
