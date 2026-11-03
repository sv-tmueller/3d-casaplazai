# AGENTS.md — CasaPlazAI

Guidance for humans and agents working in this repo.

## Project shape

Vite + vanilla TypeScript, no frontend framework. One entry:
`index.html` mounts the workspace (`src/app/main.ts`) with three views
over one editor store — Plan (2D canvas engine), 3D and Walk (three.js).
`viewer.html` is only a redirect stub: `/viewer[?q][#plan=…]` goes to
`/?q&view=3d#plan=…`. The 2D and 3D engines exchange plan state
exclusively through the frozen `FloorplanData` schema living in
`src/shared/schema/` (contract docs: `docs/schema.md`).

Layers (issue #178): `src/ui/` is the framework-free component kit and
design tokens (imports nothing from editor, viewer or app; showcase at
`/dev/kit.html` under `npm run dev`, not built); `src/app/` is the shell
(AppState, command registry, keyboard dispatcher, panels, dialogs);
`src/editor/` holds the store and the canvas engine behind the
`EditorEngine` interface (`src/editor/engine.ts`); `src/viewer/` holds
the 3D engine, which reports UI through `ViewerUiSink`. Every control,
shortcut, tooltip and the README shortcut table read from
`src/app/commands.ts`.

## Useful commands

```bash
npm install           # bootstrap (clean clones: node_modules absent)
npm run dev           # vite dev server (workspace at /, kit showcase at /dev/kit.html)
npm run build         # production build to dist/
npm run preview       # serve dist/ (used by e2e)
npm run lint          # eslint (flat config)
npm run typecheck     # tsc --noEmit
npm run test          # vitest run (unit + stub tests)
npm run e2e           # playwright (chromium; serves dist/ via preview — build first)
npm run verify:fast   # lint + typecheck + test
npm run verify        # lint + typecheck + test + e2e  <- the gate
```

Clean-clone gate: `npm install && npm run build && npm run verify` must
exit 0. e2e serves the existing `dist/` and does not build it: run
`npm run build` before `npm run e2e` or `npm run verify`, or every spec
times out waiting for the workspace. e2e helpers for the workspace
(open, follow the /viewer redirect, aim through `__editorCam`, switch
views) live in `e2e/fixtures/workspace.ts`.
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
