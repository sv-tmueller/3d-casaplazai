# Competitor scan: 3D House Planner and Sweet Home 3D (2026-10)

Research into two floorplanner apps to inform the workspace redesign (#178), 3D materials and lighting (#179),
the furniture library (#180) and the plan schema (`docs/schema.md`).

- **Method:** headless DeepSeek Harness (DSH) workers using the REA reverse-engineering CLI against the live apps, their shipped JavaScript and public docs.
  Round 1 had 10 broad angles per app. Round 2 split each angle into 4 narrower sub-questions with 120 minutes each.
- **Reports:** [`round1/`](round1) has 20 reports, [`round2/`](round2) has 80, one file per question.
  Each report tags every claim OBSERVED / DOCUMENTED / INFERRED.
- **Not included:** evidence files the reports cite (`evidence/…`, `raw/…`, captures) stay outside the repo.
- **Links below** point to the round-2 report for each topic.

**Licence caveat:** 3DHP evidence includes fully deobfuscated proprietary JS (40 modules); SH3D evidence includes GPL source.
Use both as behaviour references only; never copy their code into CasaPlazAI. Code excerpts derived from either vendor were removed from the reports committed here.

## Round 2 fixes for round-1 blockers
- Headless WebGL works with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
  Live wall drawing ([3dhp/03a](round2/3dhp/03a-live-draw.md)), furniture placement ([3dhp/05b](round2/3dhp/05b-placement-live.md)) and the measure tool ([3dhp/09a](round2/3dhp/09a-measure-tool.md)) were all driven end to end.
- SH3D Online failed in round 1 because Playwright's `serviceWorkers: 'block'` broke its boot ([sh3d/02a](round2/sh3d/02a-live-load.md)).
  With that fixed, the Studio demo loaded with full model introspection via `window.application`.
- The 3DHP `app.php` redirect is a session gate: visit `index.php` first and it sets cookie `visted=1` ([3dhp/01a](round2/3dhp/01a-topbar-tools.md)).

## Schema / data model (docs/schema.md)
- CasaPlazAI v1 covers about a quarter of the Home.xml field surface: 3 entity kinds and 26 fields, vs 32 elements and 185 attributes ([sh3d/06d](round2/sh3d/06d-schema-gap-table.md)).
  The biggest gaps are no level, wall, dimensionLine, label or polyline entities.
- Both rivals make walls first-class (SH3D `wallAtStart/End`; 3DHP 2D-planner `WALLS[]` with parent/child links).
  However, 3DHP does NOT merge shared walls: two rooms sharing an edge get two walls ([3dhp/03a](round2/3dhp/03a-live-draw.md)), so our shared-wall model is stronger.
- SH3D room polygons have no winding rule: 52/70 real polygons are clockwise. A `.sh3d` importer must normalise to our CCW rule ([sh3d/06d](round2/sh3d/06d-schema-gap-table.md)).
- Openings: SH3D stores free x/y/angle plus wall-embedding ratios and an SVG `cutOutShape` ([sh3d/04b](round2/sh3d/04b-cutout-geometry.md)).
  3DHP stores a fraction along its host wall and cuts holes with CSG ([3dhp/04c](round2/3dhp/04c-wall-cutting.md)). Its catalog stores no dimensions; one GLB is rescaled per size ([3dhp/04d](round2/3dhp/04d-catalog-bim.md)).
- Versioning: SH3D uses one monotonic integer, applies in-memory `if (version < N)` upgrades, and only warns when a file comes from a newer version ([sh3d/06a](round2/sh3d/06a-versioning.md)).
  3DHP is hard-coded `version: 1` with no migration ([3dhp/07b](round2/3dhp/07b-autosave-recovery.md)). Our `migrate()` is already ahead of 3DHP.
- Asset integrity: SH3D's `ContentDigests` (SHA-1 per asset) is a repair ledger used on damaged-file load ([sh3d/06c](round2/sh3d/06c-asset-embedding.md)).

## Editing architecture (#178 command registry)
- SH3D `PlanController` is an explicit State pattern with 48 editing states and 53 undoable-edit classes ([sh3d/02b](round2/sh3d/02b-module-structure.md), [03a](round2/sh3d/03a-state-machine.md)).
  Undo lives in the controller layer, not the model. There are 89 edit types, each with a localised presentation name ("Undo Move") ([sh3d/06b](round2/sh3d/06b-edit-model.md)).
- In SH3D, Escape reverts the object currently being drawn, not a global cancel; double-click is its mouse equivalent ([sh3d/09b](round2/sh3d/09b-shortcut-sheet.md)).
  Enter for typed lengths exists on desktop but is a no-op online.
- 3DHP shows one-line hints per active tool naming every modifier, e.g. "Click: place points · Enter: finish · Type a number: exact length (Tab: angle) · Backspace…" ([3dhp/10b](round2/3dhp/10b-tutorial-content.md)). It's a cheap teaching surface.
- 2D, 3D and the furniture list are independent subscribers to one observable model (SH3D) ([sh3d/06b](round2/sh3d/06b-edit-model.md)).
  3DHP instead links its 2D and 3D views with a direct method-call bridge, debounced 350 ms ([3dhp/02d](round2/3dhp/02d-2d-planner-iframe.md)).

## Snapping
- Both apps measure snap tolerances in screen pixels, not metres.
  3DHP priority: Alt/Ctrl bypass → wall end 13 px → corner 9 px → T-junction → alignment/angle → grid ([3dhp/03b](round2/3dhp/03b-snapping-algorithms.md)).
  SH3D doors snap to walls within a 4 px screen margin ([sh3d/04a](round2/sh3d/04a-magnetism-fit.md)).
- SH3D length magnetism adapts to zoom: steps 0.1/0.5/1/5/… cm are chosen from the current pixel size, and the grid ladder keeps lines ≥10 px apart ([sh3d/03b](round2/sh3d/03b-magnetism.md), [10d](round2/sh3d/10d-oss-alternatives.md)).
- The SH3D maintainer explicitly refused grid snapping (FR #407) while precision is the oldest complaint ([sh3d/10a](round2/sh3d/10a-feature-requests.md), [10b](round2/sh3d/10b-complaint-threads.md)). Our grid snap is a differentiator.

## Furniture (#180)
- 3DHP models are in cm with an off-centre origin (the file origin sits above the lowest vertex), and the loader re-seats them at load time.
  Draco compression is mixed per file (43× to 0.42× gain). There is no LOD, and the template cache misses in the hot path ([3dhp/05c](round2/3dhp/05c-model-pipeline.md)).
  The full catalog is 2.54 GB across 1,882 GLBs.
- SH3D import keeps the mesh as-is and normalises at render time with a stored 3×3 rotation plus a W/D/H box.
  DAE files carry explicit units/up-axis ([sh3d/05c](round2/sh3d/05c-import-normalisation.md)). This is relevant to our normalisation script.
- SH3D furniture magnetism runs ordered rules: drop-on-top (5% tolerance) → against wall → side-by-side → in shelf ([sh3d/05d](round2/sh3d/05d-group-align-magnet.md)).
  Alignment is relative to the first-selected piece; distribution equalises gaps, not centres.
- 3DHP search is a substring match on the localised title only ("couch" finds nothing).
  There are no favourites; a recent-items list stores 12 entries and shows 8 ([3dhp/05a](round2/3dhp/05a-catalog-ui.md)).
- SH3D serves a 94-piece catalog to touch + small screens (`(hover:none),(pointer:coarse)` AND max-width 743px) and 805 pieces otherwise ([sh3d/05a](round2/sh3d/05a-catalog-schema.md)).

## 3D view (#179)
- SH3D aerial camera: auto-fits a bounding box that is recomputed on every change; pitch is limited to [0°, 90°], so it never goes below the horizon ([sh3d/07a](round2/sh3d/07a-aerial-camera.md)).
- Neither app has walk collision. 3DHP walk is arrow keys only (the WASD tooltip is wrong), eye height 1.54 m ([3dhp/06a](round2/3dhp/06a-camera-controls.md)).
  SH3D's visitor has eye height 170 cm, body = 15/14 × eye height, and follows the selected level ([sh3d/07b](round2/sh3d/07b-virtual-visitor.md)).
  Collision would be a differentiator.
- 3DHP renders only when something changed (idle after 3 s), which saves a lot on idle scenes ([3dhp/02c](round2/3dhp/02c-performance.md)).
  Its draft tier is hardware scaling 1.5 with no shadows. Shadow map steps: off → 1024² ESM → 2048² PCF → 4096² PCSS ([3dhp/06d](round2/3dhp/06d-quality-ladder.md)).
- Scene cost: 20 furniture pieces → 501 draw calls / 69 ms, dominated by multi-material models ([3dhp/02c](round2/3dhp/02c-performance.md)). Merge materials per model.
- 3DHP textures: 456 PBR-ready 1K/2K scans; a Standard→PBR conversion sets roughness from specular ([3dhp/06c](round2/3dhp/06c-materials-textures.md)).

## Onboarding and UI (#178)
- 3DHP's first run: a non-dismissible project-settings modal (name, storey height, plan size, m/ft), then 4 start tiles, then a 6-step tour with exact copy ([3dhp/08a](round2/3dhp/08a-first-run-funnel.md)).
- SH3D Online blocks the editor with a 3×3 demo chooser; picking an empty home shows an "won't be saved" alert, and help and tips are disabled ([sh3d/09c](round2/sh3d/09c-first-run-help.md)).
- Order taught across 5 peers: look around → choose start → walls/rooms → doors/windows → furnish → levels → view/render ([3dhp/10b](round2/3dhp/10b-tutorial-content.md)).
- 3DHP toasts are good (aria-live). Undo exists but users find it late ([3dhp/08d](round2/3dhp/08d-feedback-a11y.md)). Its inspector edits live on change ([3dhp/08c](round2/3dhp/08c-inspector-panels.md)).
- SH3D online splitters have no minimum size and save positions in absolute px, so the layout drifts on resize.
  Only 2 of its 4 panes are keyboard-reachable ([sh3d/09a](round2/sh3d/09a-layout-panes.md)).

## Measurements, levels, underlay
- 3DHP dimension labels are DOM labels projected each frame; overlapping labels are hidden, first one wins.
  Rooms show name · area · perimeter. Two rounding engines disagree at half-cent boundaries, so we should use a single formatter ([3dhp/09b](round2/3dhp/09b-dimension-overlay.md)).
- 3DHP levels are an integer × one storey height. SH3D levels have elevation/height/floorThickness plus separate viewable/visible flags ([sh3d/08c](round2/sh3d/08c-levels-ux.md)).
- 3DHP roofs come from a real straight-skeleton algorithm (hip/gable/shed/flat) ([3dhp/09d](round2/3dhp/09d-stairs-roofs.md)). "Roof" never appears in SH3D's release history ([sh3d/10c](round2/sh3d/10c-plugin-gaps.md)).
- SH3D background image: calibrated with a 2-point measuring line, one per level, inherited by new levels ([sh3d/09d](round2/sh3d/09d-background-image.md)).
  3DHP: two metre sliders typed before import ([3dhp/07d](round2/3dhp/07d-imports.md)).

## Market
- 3DHP is the only truly free rival, but almost no one uses it (no reviews on G2, Reddit content is 73/77 vendor posts) ([3dhp/10d](round2/3dhp/10d-blocked-reviews.md)).
  Its "nothing uploaded" claim is contradicted by its share and AR features ([3dhp/10c](round2/3dhp/10c-positioning-seo.md)).
- Paywall points: Planner 5D 1 project/50% of the catalog; Floorplanner 5 projects + perpetual licence over free users' plans; Homestyler coins/watermark ([3dhp/10a](round2/3dhp/10a-competitor-matrix.md)).
- Reddit themes for free web planners: ease 21%, precision 21%, is-free-enough 18%, browser-vs-install 17%, crashes/data loss 15% ([3dhp/10d](round2/3dhp/10d-blocked-reviews.md)).
- SH3D: 2.8 M downloads (Jan 2025–Oct 2026), Space Mushrooms ownership since 7.5, store subscription and nag popups.
  7.6.1 (2026-10-20) is a content release with 78 new models ([sh3d/01b](round2/sh3d/01b-version-history.md), [10a](round2/sh3d/10a-feature-requests.md)).
