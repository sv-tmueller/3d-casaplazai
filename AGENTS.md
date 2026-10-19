# AGENTS.md — CasaPlazAI

Guidance for humans and agents working in this repo.

## Project shape

Vite + vanilla TypeScript, no frontend framework. Two entries:
`index.html` (2D editor) and `viewer.html` (3D viewer). They exchange
state exclusively through the frozen `FloorplanData` schema living in
`src/shared/schema/` (contract docs: `docs/schema.md`).

## Useful commands

```bash
npm install           # bootstrap (clean clones: node_modules absent)
npm run dev           # vite dev server (editor at /, viewer at /viewer.html)
npm run build         # production build to dist/
npm run preview       # serve dist/ (used by e2e)
npm run lint          # eslint (flat config)
npm run typecheck     # tsc --noEmit
npm run test          # vitest run (unit + stub tests)
npm run e2e           # playwright (chromium; serves dist/ via preview)
npm run verify        # lint + typecheck + test  <- the gate
```

Clean-clone gate: `npm install && npm run verify` must exit 0.
Playwright browsers: `npx playwright install chromium` (once per machine).

## Branch naming

Feature branches: `feat/<issue-number>-<short-slug>`
(e.g. `feat/2-foundation-schema-demo`). PRs target `main` and stay
draft until tester PASS + reviewer approve.

## Repo conventions

- Schema is the sole editor/viewer interchange contract; evolve it only
  via `src/shared/schema/migrate.ts` (see `docs/schema.md`).
- Import schema symbols only through the barrel
  `src/shared/schema/index.ts`.
- Demo fixture `demo/demo-apartment.json` must keep validating; it is
  covered by `tests/unit/fixtures.spec.ts`.
