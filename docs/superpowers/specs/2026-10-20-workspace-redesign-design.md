# CasaPlazAI workspace redesign — design

Date: 2026-10-20. Status: draft for owner approval. Author: advisor (Claude), from a brainstorming session with the owner.

## 1. Intent and why

The current UI grew one package at a time: a flat toolbar became a rail plus an app bar, popovers hang off whichever button filed them, the 3D viewer is a second page with its own floating HUD, and walk mode renders flat procedural smears. Each piece passed its own acceptance criteria; the sum is clunky. The owner named three pains: the button and tool layout, the walkable 3D textures, and the overall look and feel.

The target is a single, modern workspace in the spirit of 3dhouseplanner.com: one top bar with a view switcher, one floating tool card on the left, a contextual inspector on the right, a quiet status line, and a 3D view that looks like a place because it uses real materials and real furniture. The redesign is built from one design (this document), not accreted.

## 2. Goals, non-goals, anti-goals

**Goals**

1. One workspace. The editor and the 3D viewer become views of one app: Plan, 3D, Walk in this round, with Top added in batch 2 once the scene is grouped per floor (section 8.6). The separate viewer page and the side-by-side layout are retired.
2. One design language. Tokens, type, spacing, components, light and dark theme, applied to every surface including dialogs, toasts, the empty state, and the walk-mode overlay.
3. One tool card. Every tool and view control lives in a tabbed left card. No rail, no app-bar clusters, no floating buttons on the canvas, no popovers anchored to toolbar buttons.
4. A 3D view that looks like a place: PBR materials from real texture assets, physically plausible lighting and tone mapping, skirting and door and window frames, and glTF furniture models.
5. An architecture that can carry this: a UI component kit, a command registry, an app state, and a direct store subscription between the 2D model and the 3D scene. The 4,000-line glue module is contained behind an interface in this round and decomposed in the next.

**Non-goals (this design)**

- Schema changes. `FloorplanData` stays at v2. Project name and UI preferences live outside the schema.
- New drawing capabilities (wall-first model #157, door swing #151, copy and paste #124, DXF #123, project library #154).
- Engine switch. three.js stays; the geometry compiler is engine-independent and unchanged in shape.
- Mobile or touch layout (#156). The shell must not break below 1024 px, but it is designed for 1280 px and up.
- Photo-real rendering (#128).

**Anti-goals (what would make this a failure even if it works)**

- A reshuffled toolbar. If the result still reads as the old buttons in new positions, it failed.
- A split identity: a beautiful 2D editor next to an unchanged 3D viewer, or the reverse.
- Another layer of per-issue CSS bolted onto the existing 1,800-line stylesheet.
- Losing keyboard operability, accessible names, reduced-motion support, or the dark theme that already exist.

## 3. Constraints

- Vite plus vanilla TypeScript, no frontend framework. The component kit is hand-rolled DOM; adding React, Svelte, or similar is out.
- `FloorplanData` v2 is the only editor to viewer contract and it does not change. The `window.__casaplaza` bridge (getData, getCurrent, loadPlan) stays because tests and share links seed through it.
- `npm run verify` is the gate. The unit suite must stay green throughout. The e2e suite follows the UI: see section 9 for the policy.
- Assets are CC0 only, bundled in the repo under `public/assets/`, with `public/assets/ATTRIBUTION.md` listing source and license per file. Target total under 40 MB; everything lazy-loaded.
- The viewer URL `/viewer` must keep opening something sensible: it redirects to the workspace with the 3D view active and honors a `#plan=` share fragment.

## 4. What the reference does (and what we take)

Observed on 3dhouseplanner.com (app.php) on 2026-10-20:

- Top bar: logo, project name with an unsaved dot, a centered view segment (3D, Walk, Top, 2D plan), a level stepper, and a right cluster (library, capture, help, fullscreen).
- A floating left card with three tabs: View and light, Build, Measure/copy/paint. Contextual controls (night sky toggle, time-of-day slider with tick labels) live inside the card.
- Status line at the bottom: "Nothing selected" on the left, units and language on the right.
- Visual language: Inter, off-white page (#f7f9fc), white cards with large radius and soft shadow, one teal accent, pill segments, green value chips on sliders.
- Engine: Babylon.js with a real object and texture library.

We take the shell anatomy, the tabbed tool card, the segment-based view switching, the status line, and the asset-based materials. We do not take Babylon, the AI assistant, BIM export, or the project settings dialog on first run (our empty state covers that).

## 5. Design language

### 5.1 Tokens

All colour, spacing, radius, shadow, and type values are CSS custom properties on `:root`, overridden under `:root[data-theme="dark"]`. No component hardcodes a colour. The existing theme preference key `casaplaza.theme.v1` is kept.

Light theme (my call; adjust in the kit, not in components):

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f6f8fb` | page and stage background |
| `--surface` | `#ffffff` | cards, bars, dialogs |
| `--surface-2` | `#f1f4f8` | inset fields, segment tracks |
| `--line` | `#e3e8ef` | hairlines |
| `--ink` | `#111827` | primary text |
| `--ink-2` | `#5b6472` | secondary text |
| `--ink-3` | `#9aa3af` | placeholders, disabled |
| `--accent` | `#0f766e` | primary actions, active states |
| `--accent-soft` | `#d9f2ee` | active segment fill, chips |
| `--accent-ink` | `#0b5a54` | text on accent-soft |
| `--danger` | `#dc2626` | destructive |
| `--warn` | `#b45309` | overlap and validation callouts |
| `--radius-1/2/3` | 8 / 12 / 16 px | controls / cards / dialogs |
| `--shadow-1` | `0 1px 2px rgb(16 24 40 / 6%), 0 1px 3px rgb(16 24 40 / 10%)` | controls |
| `--shadow-2` | `0 4px 12px rgb(16 24 40 / 8%), 0 1px 3px rgb(16 24 40 / 6%)` | floating cards |
| `--shadow-3` | `0 16px 40px rgb(16 24 40 / 16%)` | dialogs |
| `--space-1..6` | 4 / 8 / 12 / 16 / 24 / 32 px | spacing scale |

Type: Inter, self-hosted as woff2 under `public/fonts/` (SIL OFL), with the system stack as fallback. Sizes: 12 px captions, 13 px controls and body, 14 px panel titles, 16 px dialog titles. Tabular numerals for every readout.

Dark theme: same tokens re-pointed (bg `#0f1318`, surface `#161b22`, surface-2 `#1d242d`, line `#2a323d`, ink `#e6e9ee`, accent `#2dd4bf`, accent-soft `#113b37`). The 2D canvas keeps painting from its own TypeScript palette (`render.ts`), which the shell selects by theme.

### 5.2 Component kit (`src/ui/`)

Hand-rolled, framework-free, one module and one stylesheet per component, built on a tiny `el()` DOM builder. Every component returns its root element plus a small handle (set state, destroy). Components never import editor or viewer code.

- `Button` (primary, secondary, ghost, danger; icon-only variant with tooltip and `aria-label`)
- `Segment` (radio group of pills, `role="radiogroup"`)
- `Toggle` (switch with visible label)
- `Slider` (label, live value chip, optional tick labels, native `<input type=range>` underneath)
- `Field` (label plus input, with unit suffix; used for dimensions and names)
- `Tabs` (`role="tablist"`, arrow-key navigation)
- `Card` (floating surface with optional header and collapse)
- `Menu` (popover list anchored to a trigger; Escape, outside click, focus return)
- `Dialog` (modal card with focus trap and Escape; replaces confirmDialog, exportDialog, helpModal)
- `Toast` (stack, de-duplicated, respects reduced motion)
- `Tooltip` (delayed, keyboard-reachable via focus)
- `Icon` (the existing inline SVG set, extended for new actions)

The kit ships with a static showcase page at `/dev/kit.html` (dev only, not built) so the design can be reviewed without the app.

## 6. Workspace layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ CasaPlazAI  My apartment ●       [ Plan | 3D | Walk ]      − Ground +  ↶ ↷  Share  Export  ?  ☾  ⛶ │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐                                        ┌─────────────┐ │
│ │ Build View Mea│                                        │ Living Room │ │
│ │ ───────────── │                                        │ Name  [...] │ │
│ │ ▸ Select  Pan │              STAGE                     │ Floor  wood │ │
│ │ ▸ Room ▭  ⬠  │     (Plan canvas | 3D canvas)          │ Walls  ...  │ │
│ │ ▸ Door Window │                                        │ Roof   ...  │ │
│ │ ▸ Stairs Furn.│                                        │ Area 19.4 m²│ │
│ │ ─ Furniture ─ │                                        └─────────────┘ │
│ │ [bed][sofa].. │                                                        │
│ └───────────────┘                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│ Click a room to select · drag to move        x 4.50  y 2.00        Total 36.7 m²  ·  m  ·  100 % │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Top bar (56 px, `--surface`, hairline below)

- Left: logo mark, project name (inline-editable, stored in `localStorage` key `casaplaza.project.v1`, default "Untitled plan"), unsaved dot that clears on autosave flush.
- Center: view segment Plan, 3D, Walk (Top joins in batch 2). Keyboard: `1` to `3` (`4` reserved for Top). The segment reflects the current view, never the next one.
- Right: level stepper (minus, level name as a menu trigger, plus; the menu lists floors with rename, add, delete), Undo and Redo, Share, Export, Help (shortcuts cheat sheet), theme toggle, fullscreen.
- File operations (Import JSON, Save JSON, New plan, Load demo) live in a menu behind the logo mark.

### 6.2 Left tool card (280 px wide, floating 12 px inside the stage, `--shadow-2`)

Three tabs. The card remembers its tab per browser. In Walk view the card collapses to a slim tab strip and reopens on hover or focus.

**Build**

- Tool grid, two per row, icon plus label, one pressed at a time: Select, Pan, Room (rectangle), Room (polygon), Door, Window, Stairs, Furniture. Hotkeys unchanged (V, Space-hold, R, P, D, W, T, F).
- Furniture section appears below the grid while Furniture is armed: a grid of the seven pieces with top-down symbols (reuse the existing SVG set now; #150 refines the symbols later). The selected piece is pressed.
- Snapping section: grid pitch, snap-to-geometry toggle (the content of today's Snap popover).

**View**

- Plan overlays: Dimensions toggle, Grid toggle, Underlay section (import, opacity slider, rotate, lock, hide, remove).
- 3D: Roofs toggle, Ceilings segment (auto, on, off), Walls transparency slider, Quality segment (low, high).
- Sun: Time of day slider with clock chip and tick labels (6:00, 12:00, 18:00), North offset slider with degree chip and the compass rose beside it.

**Measure**

- Measure tool (M), Clear measurements, and a list of the current floor's measurements with lengths; clicking one selects it.

### 6.3 Right inspector (300 px, floating, same card style)

Shown only while something is selected; slides in, slides out, no motion under reduced motion. Content per selection type, carrying over everything the current inspector panel does: room (name, floor texture, wall height and thickness, wall lean per segment, area), opening (kind, width, height, sill, wall), furniture (type, rotation, footprint), staircase (floors, direction, width), measurement (length). Multi-selection shows counts and the bulk actions (move is drag, delete). Type-in dimensions during a draw gesture stay as floating fields near the cursor, restyled with the kit.

### 6.4 Stage

- Plan view: the existing 2D canvas engine. The plan is fitted to the viewport on load and on floor change (today it loads off-screen).
- 3D view: the existing orbit rig (orthographic, idle spin), auto-framed on the plan's bounds after every rebuild. A perspective orbit rig is a batch 2 item (section 10); the view's name and segment position do not change when it lands.
- Top view (batch 2): orthographic top-down of the active level only, roofs hidden. It needs per-floor mesh grouping (section 8.6) and is therefore not in this round.
- Walk view: first-person. Entering shows a centered "Click to walk" prompt; while walking, a room pill top-center, a hint strip bottom-center ("WASD to move · Esc to release"), and the reticle. The Go-to-room list lives in the room pill's menu.
- Walk state machine (my call): views are exclusive. Leaving the Walk view ends walking and disposes the rig, exactly as leaving walk mode does today; hidden canvases do not render. The last walker pose is kept in `AppState.walkPose` for the session, so the Plan view's walker glyph shows where the camera stands, and place-camera-from-plan (`C` plus click and drag) writes that pose and switches to the Walk view, which spawns from it. The `walk-nav` and `walk-affordances` journeys are therefore restorable in batch 2 against this behaviour.
- Empty state: a centered card in the Plan view (Draw a room, Load a demo plan, Load a JSON file), restyled; it hides once a room exists. The 3D views show the empty-plot ground plane with a matching card.
- Toasts stack bottom-right of the stage, above the status bar, and never under the tool card or inspector.

### 6.5 Status bar (32 px)

Left: selection summary or the armed tool's hint. Center: cursor position in meters while over the plan. Right: livable-area total, units, zoom percentage. The entity-count debug string does not return.

### 6.6 Dialogs

Export (format, scale, which floors), Confirm (New plan, Delete floor), Shortcuts. All use the kit's `Dialog`.

## 7. The 3D look

### 7.1 Materials (`src/viewer/materials.ts` reworked)

- PBR texture sets at 1K (color, normal, roughness, and ambient occlusion where available), CC0, from ambientCG or Poly Haven, under `public/assets/materials/<name>/`. Initial set: oak planks, herringbone oak, ceramic tile (light), stone tile (grey), carpet (wool), concrete (polished), plaster (white), plaster (warm), ceiling plaster, roof shingles, exterior render, grass, pavement.
- The schema's `floorTexture` enum (wood, tile, carpet, concrete, null) maps to default sets: wood to oak planks, tile to ceramic tile, carpet to wool carpet, concrete to polished concrete, null to a neutral screed. The enum does not change in this design; per-room material choice beyond the enum is a later schema change.
- Walls use plaster (white) everywhere in this round; the interior versus exterior face split needs compiler work (`src/geom/`) and is a batch 2 item alongside trim.
- `MeshStandardMaterial` with map, normalMap, roughnessMap, aoMap; `RepeatWrapping`; repeat in meters per tile from the asset's real-world size; anisotropy from the renderer's max. Textures load lazily through a loader with a flat-colour fallback material per slot so the scene never waits on the network. The Low quality setting keeps flat colours.

### 7.2 Lighting

- Renderer: `ACESFilmicToneMapping`, `SRGBColorSpace` output, exposure tuned for interiors, physically correct lights.
- Environment: a `PMREMGenerator` environment from three's `RoomEnvironment` for specular response indoors; the sky dome stays as the visible background.
- Sun: the existing directional light with shadows, driven by time of day and north offset as today; shadow map 2K on High.
- Interior fill: keep the per-room fill from #152. Its intensity lives in `appController.ts`, which the shell package owns, so the retune against tone mapping is done in the shell package from values the materials package records in its PR (a single constant).
- Ground: a textured plot (grass or pavement) with a soft contact shadow under the building.

### 7.3 Architectural trim (batch 2)

Door and window frames already exist: the viewer adapter emits four frame slabs per doorway and per window into the `windowFrame` slot, pinned by unit tests. Batch 2 adds skirting boards (height 0.10 m, depth 0.015 m along every interior wall base, broken at doors) and window sills as compiled solids in `src/geom/`, maps the new slots to a painted-wood PBR set, and moves the frames to the same path so nothing is emitted twice. A door leaf (ajar at 20 degrees in the 3D view, swinging open in Walk when the walker is within 1.2 m) is runtime viewer behaviour on a per-door `Object3D`, which needs the per-floor grouping of section 8.6; it is batch 2 as well.

### 7.4 Furniture (`src/viewer/furniture/`)

- glTF models for bed, sofa, table, chair, counter, bathtub, toilet, CC0 (Poly Haven, Kenney, or Quaternius), meshopt-compressed, under `public/assets/models/`, each under 500 KB.
- Each model is normalised at build time to the schema footprint: origin at the floor-centre, forward along negative y in plan space, scaled to the footprint's width and depth; height from the model. Loaded lazily per type; while loading, and on load failure, the current box volume is shown.
- The 2D plan keeps its symbols; the 3D views use the models.
- Scope split: this round delivers the library (assets, attribution, the normalisation script, the loader with fallback, a `placeFurniture(adapted)` function returning a `Group`, and unit tests). Wiring that group into the viewer's rebuild and dispose cycle, and suppressing the adapter's box prisms when a model is present, is batch 2, because the rebuild cycle lives in `appController.ts`, which the shell package owns.

## 8. Architecture

### 8.1 Modules

```
src/
  app/              the workspace shell (new)
    main.ts         single entry; mounts the shell; keeps window.__casaplaza
    shell.ts        top bar, stage, tool card, inspector, status bar
    state.ts        AppState: view, activeTool, armedFurniture, panel state, theme, project meta
    commands.ts     command registry (id, label, icon, shortcut, enabled(), pressed(), run())
    shortcuts.ts    the existing registry, now backed by commands (README sync test keeps working)
    panels/         toolCard.ts, inspector.ts, statusBar.ts, topBar.ts, emptyState.ts, walkOverlay.ts
    dialogs/        export.ts, confirm.ts, shortcuts.ts
  ui/               component kit (section 5.2) + tokens.css + base.css
  editor/           2D model and canvas engine (store, controller, render, geom helpers)
    canvasEngine.ts the former glue.ts behind an EditorEngine interface (section 8.3)
  viewer/           3D engine (ViewerApp, sceneBuilder, materials, assets/, furniture/, modes)
  geom/             unchanged in this round
  shared/           schema, share links, reduced motion (unchanged)
```

`viewer.html` becomes a redirect stub. `src/editor/ui.ts`, `src/viewer/hud.ts`, `planMenu.ts`, `mini3d.ts`, the popover modules, and `style.css` are retired as their content moves; a module is deleted in the package that replaces it, not left behind.

### 8.2 Command registry and app state

Every user action is a command: `tool.select`, `view.walk`, `floor.next`, `history.undo`, `file.export`, `sun.time` and so on. Commands carry their label, icon, shortcut, and `enabled` and `pressed` predicates. The top bar, tool card, menus, shortcut handler, and help cheat sheet all render from the registry, so a control cannot drift from its shortcut or its accessible name. `AppState` is a small observable store (same subscribe pattern as `EditorStore`) that the shell renders from; it persists view, tab, theme, and project name to `localStorage`.

### 8.3 Containing the glue module

`initEditorInteraction` today takes a bag of about 100 DOM refs and attaches listeners. This design replaces that signature with an `EditorEngine` interface: the engine receives the canvas and the stores, exposes imperative methods (`setTool`, `armFurniture`, `undo`, `zoomBy`, `fitPlan`, `setDimensionsVisible`, `importUnderlay`, ...), and emits events (`toolChanged`, `selectionChanged`, `cursorMoved`, `hintChanged`, `message`). Its internal pointer and gesture logic is untouched in this round. The shell binds commands to the interface. Decomposing the engine into per-tool controllers is the next batch, once the interface is the only way in.

### 8.4 Plan channel

The 3D engine subscribes to `EditorStore` directly (same page, same process) and rebuilds on a debounced change, replacing the 250 ms JSON-stringify poll over the window bridge. This is the first half of #158; per-floor incremental recompile remains open there. `ViewerApp` keeps its canvas, modes, and rebuild logic; its HUD DOM is removed and its settings (roofs, walls alpha, ceilings, quality, sun) become `AppState` fields the engine reads.

### 8.5 Views

The stage holds both canvases; the view segment toggles which is visible and which receives input. Switching to the 3D view triggers a frame-to-bounds; switching to Walk spawns as today (from `AppState.walkPose` when set). Only the visible canvas renders; the 3D engine keeps rebuilding from store changes while hidden so a switch is instant, but it does not tick frames.

### 8.6 Per-floor scene grouping (batch 2)

Today the adapter merges every storey into one mesh per material slot. Three later features need per-entity or per-floor objects instead: the Top view (active level only), the box-to-model swap for lazily loaded furniture, and door leaves that move. Batch 2 restructures `adapter.ts` and `sceneBuilder.ts` to group by floor and keep furniture and door leaves as separate `Object3D`s; the `AdaptedScene` contract and its unit tests change in that package, not before. Nothing in batch 1 depends on this.

## 9. Testing policy

- Unit tests stay green in every package. Engine, store, geometry, materials, and furniture loaders get unit coverage as today.
- The kit gets happy-dom unit tests for keyboard behaviour (segment arrows, tabs, dialog focus trap, menu Escape).
- e2e follows the UI. The shell package rewrites `smoke`, `journey-fullloop`, `editor`, `first-run`, `navigation`, `tool-hotkeys`, and `viewer` specs against the new DOM and marks every other spec `test.fixme('workspace redesign: re-pin in batch 2')` with the issue number, so the gate stays green and the debt is listed. Batch 2 restores them one surface at a time. Test ids use a `ws-` prefix for shell elements so old and new never collide.
- `window.__casaplaza` is unchanged, so e2e seeding keeps working.

## 10. Delivery

The builder check showed that the first draft's "four independent packages" all touched `appController.ts`, `adapter.ts`, and `materials.ts`. This round therefore has three packages with explicit file ownership; anything that needs the viewer's rebuild cycle or the adapter waits for batch 2, after the shell has landed and owns those files alone.

**Batch 1 (this sign-off), three packages, strict ownership:**

| Package | Owns (may create or change) | Must not touch |
| --- | --- | --- |
| 1. Workspace shell and design system | `index.html`, `viewer.html`, `src/app/**`, `src/ui/**`, `src/editor/**` (engine interface, retirement of `ui.ts`, popovers, `planMenu.ts`, `mini3d.ts`), `src/viewer/appController.ts`, `src/viewer/hud.ts` (deleted), `src/viewer/quality.ts`, `src/shared/**`, `public/fonts/**`, `e2e/**`, `tests/unit/**` for the files above | `src/viewer/materials.ts`, `src/viewer/sceneBuilder.ts`, `src/viewer/adapter.ts`, `src/viewer/furniture/**`, `src/viewer/assets/**`, `src/geom/**`, `public/assets/**` |
| 2. 3D materials and lighting | `src/viewer/materials.ts`, `src/viewer/sceneBuilder.ts`, `src/viewer/assets/**` (new loader), `public/assets/materials/**`, `public/assets/ATTRIBUTION.md`, their unit tests | `appController.ts`, `adapter.ts`, `hud.ts`, `src/app/**`, `src/ui/**`, `src/editor/**`, `e2e/**` |
| 3. Furniture model library | `src/viewer/furniture/**`, `public/assets/models/**`, `scripts/normalize-models.*`, their unit tests, an appended section in `ATTRIBUTION.md` | everything else |

Interfaces held constant across the batch so the packages merge cleanly: `buildMaterial(slot, hiQuality)` keeps its signature (package 1 moves the quality source into `AppState` but still passes a boolean; package 2 keeps the boolean); `buildViewerScene(adapted, ...)` keeps its signature and return shape; `MaterialSlot` gains no members in this round. Packages 2 and 3 add no e2e specs and change no HUD DOM, so the shell package's e2e rewrite does not collide with them. Merge in any order; the shell package is the largest and is expected to merge last.

Package 1 is one deliberately large package built by a single Opus developer, committed in stages (kit, shell, engine interface, views, tests) so a resume can pick up. The owner chose this over slicing the shell across several workers.

**Assets (my call):** builders fetch CC0 files directly from ambientCG (direct zip downloads, no login), Poly Haven (public API), Kenney or Quaternius, and Google Fonts (Inter woff2), commit them as plain files in git (no LFS, no CDN), and record source URL and license per file in `ATTRIBUTION.md`. Budget: materials under 25 MB, models under 4 MB, fonts under 1 MB. If a source blocks automated downloads, the package parks with the exact URLs needed rather than substituting a non-CC0 source.

**Batch 2 (after merge), in rough order:** per-floor scene grouping (8.6) and furniture model integration (7.4); perspective orbit rig for the 3D view and the Top view; trim and wall-face split (7.3); interior fill retune; Split view with a draggable splitter (#149); e2e restoration; glue decomposition into tool controllers; furniture 2D symbols (#150); problems panel (#153) as an inspector section; deletion of any retired module that batch 1 left behind.

## 11. Left to the builder

- Exact icon set additions and the logo mark.
- Slider tick positions, animation timings (within 150 to 250 ms, none under reduced motion).
- Which of ambientCG or Poly Haven supplies each material, as long as it is CC0 and attributed.
- Model normalisation tooling (a script under `scripts/` is fine).
- Internal file split inside `src/app/panels/`.

## 12. Calls made by the advisor (not owner decisions)

- Teal accent and the token values in 5.1. Inter self-hosted.
- No framework; hand-rolled kit.
- Project name stored outside the schema.
- Mini 3D inset retired in favour of the view switcher now and Split view in batch 2.
- e2e policy in section 9 (rewrite the core journeys, fixme the rest, restore in batch 2).
- Four-package split with one large shell package on an Opus developer, per the owner's hybrid choice.
- Door leaves shown ajar in 3D and open near the walker (batch 2).
- Views are exclusive; leaving Walk ends walking and keeps the pose for the Plan glyph (6.4).
- Top view, trim, furniture integration, and per-floor grouping deferred to batch 2 so batch 1 packages do not share files.
- Assets committed as plain git files, fetched by the builders, no LFS (section 10).
