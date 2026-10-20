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

Parallel worktrees: e2e ports are assigned per worktree via `E2E_PORT`
(main=4199, wt-editor=4201, wt-viewer=4202, wt-fixes=4203), so sessions
running `npm run e2e` side by side never collide. Cut worktrees with
`git worktree add ../casaplazai-<slug> main`, run `npm install` inside
each, and rebase onto freshly merged main before opening a PR.

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
