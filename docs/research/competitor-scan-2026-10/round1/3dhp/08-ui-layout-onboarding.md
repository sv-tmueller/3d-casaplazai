# 3D House Planner (3dhouseplanner.com) — UI layout & first-run experience

Competitor research for **CasaPlazAI** workspace-UI redesign.
Job folder: `08-08-ui-layout-onboarding`. All evidence files referenced below live in this folder.

**Method.** Live observation with the REA CLI (`rea capture-browser-scenario`, Chromium 153 launch
mode) plus a Playwright probe, raw HTTP fetches, and static reading of the shipped editor bundle
(29 ES modules retrieved in-page from `js.php?f=editor/...`, stored in `js/`), the editor markup
(`rea/editor-dom.html`, 2.1 MB), the editor stylesheets (`css/`), and the app's own i18n dictionary
(`rea/i18n-app.json`, 1678 keys; `rea/i18n-planner.json`, 905 keys).

**Evidence tags used throughout:** `OBSERVED` (I saw it in a capture or in a shipped file),
`DOCUMENTED` (vendor page says it), `INFERRED` (my reasoning from observations).
Screenshots were captured but **not visually inspected** — the model in this session has no image
input; all pixel/geometry claims come from DOM, CSS and i18n strings.

---

## 1. Summary (5 bullets)

- **Layout is a three-strip shell around a full-bleed 3D canvas** — a fixed top bar (54 px, becomes
  94 px and wraps on phones), a fixed 30 px bottom status bar, and a floating left **tool card** with
  three icon tabs (View & light / Build / More) rather than a wide ribbon; the object catalog is a
  separate left drawer, and properties live in a right-hand collapsible ~400 px panel.
  (`OBSERVED`, `rea/editor-dom.html`, `css/hp-ui.css`)
- **First run is a forced two-stage funnel**: a non-dismissible "Project settings" modal (name
  optional, floor height, plan size, m/ft) → then a dismissible 4-tile "Start your project" card
  (Draw in 2D · Ask the AI · Draw walls in 3D · Open/import) → then a 6-step spotlight product tour.
  There is **no template or demo-plan gallery** anywhere. (`OBSERVED`)
- **Undo/redo exists but is barely surfaced**: the 3D editor exposes it only through `Ctrl+Z`/`Ctrl+Y`
  and i18n strings (`ui.undo`, `bim.undone = "Undone ({n} element(s))"`), with no persistent buttons;
  the separate 2D planner does have labelled Undo/Redo buttons. (`OBSERVED`, `INFERRED`)
- **The shortcut "help" is a single non-localised SVG image** (`textures/hotkeys.svg`) showing only
  ~8 English labels, while the real shortcut set (Home, F, 1/2/3, Shift, Ctrl+C/V, Del, Ctrl+Z/Y,
  Ctrl+S, Ctrl+K, wall-tool keys) is built as HTML from i18n keys in `hp-ux.js`. (`OBSERVED`)
- **Mobile is handled by CSS reflow only** — wrap the top bar, hide save-state/FPS, shrink the tool
  card, auto-collapse the tool dock — with `width=device-width` viewport but no touch gesture code
  (only `pointerdown`/`pointermove`, no `touchstart`, no `touch-action`) and mouse-worded hints.
  (`OBSERVED`, `INFERRED`)

---

## 2. Findings

### 2.1 How the editor is reached (app shell entry)

- `https://www.3dhouseplanner.com/` (index.php) is a **marketing landing page**: hero
  "Free 3D Home Design Software on the Web", CTAs `Sketch now` / `Start designing — free` / `Open the
  2D planner`, feature grid, FAQ, code-of-ethics claims ("No login · Nothing to install · Projects
  stay in your browser"), and a very large third-party review-badge wall. A YouTube modal is shown
  after a 15 s delay (`$('#modalyoutube').show()`). `OBSERVED` (`rea/index.php.html`)
- Clicking the primary CTA performs a **normal navigation to `app.php`** (not an SPA route), and the
  editor boots at that URL. `OBSERVED` (`rea/probe2.mjs` — "URL after CTA:
  https://www.3dhouseplanner.com/app.php", `shots/02-after-cta.png`)
- `app.php` raw bytes start with `<script>window.location.href = 'index.php'</script>` followed by
  the complete editor document; a direct fetch or a fresh headless launch at `app.php` ends up on
  `index.php`. `OBSERVED` (`rea/app.php.html` byte 0, `shots/step01-wait_load-url.json`) — the
  mechanism is unresolved (see §4).
- Editor is ~29 ES modules loaded from `js.php?f=editor%2Fhp-*&v=<hash>` — `hp-editor`, `hp-ui`,
  `hp-panels`, `hp-ux`, `hp-bim`, `hp-sync`, `hp-render`, `hp-sun`, `hp-tour`, `hp-measure`,
  `hp-dims`, `hp-copy`, `hp-share`, `hp-ar`, `hp-ai-chat`, `hp-ai-place`, `hp-efficiency`, `hp-linear`,
  `hp-stairs`, `hp-gltf`, `hp-pathtrace`, `hp-terrain-detail`, `hp-donate`, `hp-app`,
  `hp-editor-tail`, `hp-i18n`, `hp-api`, `floorplan-ai-vectorizer`. ~2.35 MB of JS, plus a ~1.2 MB
  inline `window.HP_BOOT` JSON and a 75 KB inline i18n blob **inside the HTML itself**.
  `OBSERVED` (`rea/module-urls.json`, `rea/app.php.html`)
- Plain `curl` on `js.php` returns `403 Forbidden`; scripts must be fetched with the page's own
  context. `OBSERVED`

### 2.2 Workspace layout (3D editor)

From the captured post-boot DOM (`rea/editor-dom.html`) and `css/hp-ui.css`:

| Region | Element | Detail |
|---|---|---|
| Top bar | `header.hp-topbar`, fixed, `--hp-topbar-h: 54px` | left / center / right clusters |
| Bottom bar | `footer.hp-statusbar`, fixed, `--hp-status-h: 30px` | selection readout → spacer → sync chip, units, FPS, Support, Language |
| Left dock | `#hpLeftDock.hp-dock` → `#hpToolCard` (`hp-fcard hp-dockcard`) | tabbed tool card |
| Catalog | `aside#mySidebar.hp-catalog` | slide-in drawer, `aria-hidden` until opened |
| Properties | `--hp-panel-w: 400px`, `.hp-mat` anchored right, collapsible (`.hp-collapsed`) | runtime-built by `hp-panels.js` |
| Overlays | `.hp-toasts[aria-live=polite]`, `#hpTooltip[role=tooltip]`, `.hp-context-actions` | pills e.g. "AI floor plan converter" |

`OBSERVED`

**Top bar, left:** brand logo linking back to `index.php` + a **project-name text input** (inline
rename) + a **save-state chip** (`.hp-save-state.hp-state-unsaved` → dot + "Unsaved changes",
switching to "Saving…"/"Saved in this browser"). `OBSERVED`

**Top bar, center:** a segmented control `#hpViewSeg` with four buttons — **3D** (orbit), **Walk**
(first-person, "WASD / arrows"), **Top** (orthographic), **2D plan** (opens the synced 2D planner) —
plus a **level stepper** ("Level − 0 +", title "Current level: new walls, floors and objects go
here"). `OBSERVED`

**Top bar, right:** three tool buttons — **Catalog** (`#hpToolCatalog`), **Help** (`#hpToolHelp`),
**Full screen** (`#hpToolFullscreen`). `OBSERVED`

**Bottom status bar:** "Nothing selected" with a crosshair icon; a spacer; a sync indicator; a
**units toggle** ("click to switch meters / feet"); an FPS readout; a **Support/donation** button
opening `#hpDonateDialog`; and a **language menu** with 10 languages (EN, PT, ES, FR, DE, IT, RU,
ZH, JA, KO). A `hp-tools-toggle` button is injected into the status bar to collapse the tool dock,
and the dock starts collapsed when a `matchMedia` query matches (narrow viewport).
`OBSERVED` + `INFERRED` (`js/editor_hp-ux.js`)

**Tool card — three icon tabs** (`OBSERVED`, `rea/editor-dom.html`):

1. **View and light** (`viewtab`, `wb_sunny`) — the 3D/Top/Walk/2D switch (duplicated here),
   time-of-day / night sky, render quality (Draft → Balanced → High → Path tracing, with "GPU cost"
   hints), depth of field, contour lines, plus a "Generate roof"/"Open the 2D planner" button.
2. **Build** (`tooltab`, `construction`) — the wall builder (`wb.*`: chain, single, rectangle, arc,
   room-by-size; snapping: grid, 15° angles, magnet/T-junction; wall alignment center/inside/outside;
   thickness/height/length steppers), skirting boards, ceiling crown/cove, floors, roofs (rect, hip,
   gable), rough openings and door openings, linear runs (roads/rails/fences), terrain sculpting,
   terrain painter, draw-path.
3. **Measure, copy and paint** (`extensiontab`, `straighten`) — measure (distance/angle, "pin" to
   keep in project), copy features (duplicate, array, mirror, copy wall/window-door/material to
   another floor, duplicate level), material brush.

Every control carries a `data-tip` that renders through `#hpTooltip`, and the tone is explanatory:
e.g. "Continuous walls: each click ends a wall and starts the next one", "The drawn line is the
center line of the wall", "Snap to wall ends, onto walls (T-junctions) and to alignment guides".
`OBSERVED`

**Catalog drawer** (`aside#mySidebar.hp-catalog`): head with title + close; tabs **Objects** /
**Textures**; a search field (`#autocomplete-input`, "Search objects") with a results list, live
status region (".hp-results-status"), and a "Type at least 2 characters" gate; a breadcrumb nav
("All categories" → …); a **4-level category drill-down** with thumbnail stacks and item counts
(e.g. Living room 317, Furniture 197); a "Recently used" list; and a texture grid. All data comes
from `window.HP_BOOT`: **1776 objectOptions, 60 doorOptions, 46 windowOptions, 157 objectCategories,
456 floorplanTextureCatalog entries, 456 textures, plus search `suggestions`**.
`OBSERVED` (`rea/app.php.html` inline `HP_BOOT`, `rea/editor-dom.html`)

**Overlays / dialogs captured in the DOM** (`OBSERVED`): `#modalkey` (Keyboard shortcuts),
`#modalfloorplanai` (AI floor plan converter, model picker incl. "No AI (image analysis only)"),
`#modalplan` (Bring in a floor plan — upload vs "Generate with AI", with real-scale sliders),
`#modalheightmap` (terrain colour map), `#modalpaintterrain` (terrain texture library grid),
`#modalAiTexture` (AI material texture), `#modal0` (solid non-dismissible loader), `#modal1`
(Project settings), `#hpDonateDialog`. Contextual pills `#generate-floorplan` and
`#apply-heightmap-plane` appear only for the relevant selection.

### 2.3 First-run experience

1. **Landing page** (`index.php`): hero + CTAs, "How it works" 3 steps, feature grid, FAQ, review
   badges, related-tools links. `OBSERVED` (`rea/index.php.html`)
2. **Click CTA → editor boots behind a blocking loader.** `#modal0` (`hp-dialog-loading
   hp-dialog-solid`, `data-dismissible="false"`, spinner + "Loading", percentage node) is shown
   while the scene prepares. `OBSERVED`
3. **Blocking "Project settings" modal** `#modal1` (`hp-dialog-setup`, `data-dismissible="false"`,
   `z-index 1102`). Content, exactly (from the live capture text and `rea/i18n-app.json`):
   - title "Project settings", sub "Set the basics of your new project. Everything else can be
     changed while you design."
   - **Project name (optional)** — `maxlength=80`, placeholder "My house"
   - **Floor-to-floor height** — slider, default **2.65 m**, hint "Vertical distance between two
     levels, slab included. New walls use this height."
   - **Floor plan size** — slider, default **100 m**, hint "Side of the square ground and grid you
     will build on."
   - **Units** — radio **Meters (m)** / **Feet (ft)**
   - footer: spinner + "Preparing the scene…" + primary button **"Start designing →"** (`#definefloor`)
   `OBSERVED` (`rea/probe4.mjs` output; `shots/flow-wait_setup.png`, `shots/step01-wait_editor-screenshot.png`)
4. **"Start your project" card** `.hp-start` (dismissible, "Hide" button; visibility persisted in
   `sessionStorage`), a 4-tile launcher, verbatim:
   - **Draw in 2D** — "Walls, doors and rooms appear in 3D as you draw"
   - **Ask the AI** — "“A 3-bedroom house with a gable roof”"
   - **Draw walls in 3D** — "Turn on the wall builder"
   - **Open / import** — "Projects, IFC, DXF, GLB, OBJ, images…"
   with copy "Draw a plan, describe a house to the AI or open something you already have. Everything
   stays in this browser." `OBSERVED` (`rea/probe4.mjs`, `shots/04-editor-empty.png`)
5. **Scripted first-steps tour** (`HPTour` in `hp-ux.js`): 6 spotlight steps over
   `#hpViewSeg` → plan → catalog → frame button → file → AI, with "Next" / "Skip" / "Start",
   completion stored in `localStorage['hp-tour-done']`, re-openable via a "Show the first steps tour"
   button injected into the help dialog. `OBSERVED` (strings read directly from the deobfuscated
   structure of `js/editor_hp-ux.js`)
6. **Empty state:** the status bar reads "Nothing selected"; pressing frame-all on an empty scene
   toasts **"Nothing built yet"** (`ux.frameEmpty`). `OBSERVED`
7. **Autosave / recovery:** the save-state chip shows "Unsaved changes"/"Saving…"/"Saved in this
   browser"; `Ctrl+S` = "Save project in the browser"; on the next visit a prompt appears —
   *"A project from your last session was found."* + **Restore** (`bim.recover` / `bim.recoverBtn`),
   with a fallback error string if the recovery copy can't be written. `OBSERVED` (i18n) + `INFERRED`
   (the prompt was not triggered live)
8. **No templates.** There is **no template/sample/demo-plan gallery** and no "start from example"
   entry in either planner — searched the full editor dictionary (1678 keys), the 2D planner
   dictionary (905 keys), the DOM and `HP_BOOT`: no `template`, `sample` or `demo` project keys.
   The closest onboarding content is six canned AI prompts (`ai.s1`…`ai.s6`, e.g. "Create a house with
   2 bedrooms, living room, kitchen and bathroom") and the AI floor-plan generator.
   `OBSERVED`

### 2.4 Toolbars and property panels

- Tools are **grouped by intent, not by object type**: 3 tabs, each pane mixing creation and editing
  for a phase of work ("View & light", "Build", "Measure, copy and paint"). Steppers
  (`.hp-stepper`, − value +) wrap range inputs so the numeric value stays the source of truth.
  `OBSERVED` (`css/hp-panels.css` comments, DOM)
- Tool tiles are 150 px wide at ≤700 px and the card sits in a floating dock; "finishing" tools
  (floor, roof, rough opening, door opening, hip roof, gable roof) are icon+label cards in a
  `hp-tile-grid hp-tool-cards`. `OBSERVED` (`rea/editor-dom.html`)
- The **properties area is deferred until selection**: `hp-panels.js` builds `.hp-mat` /
  object panels at runtime, anchored right with `--hp-panel-w: 400px` (`min(380px,100vw)` offsets),
  collapsible to a header, with fields for Standard/PBR material, colour, transparency, metallic,
  roughness, U/V scale, texture angle, plus geometry steppers (width/length/height). The selection
  itself is summarized in the status bar and in a contextual pill bar with actions like Move,
  Rotate, Scale, Delete, Focus, "Ask AI about the selected element". `OBSERVED` + `INFERRED`
- The **2D planner is a separate application** at `/2D-Planner/index.php` with its own chrome
  (`extension-floorplanner-*` ids) and a top menu: File (New plan, Saved plans, Save, Save as…,
  Import/Export .json, Print), Objects, Layers, Report, Settings, plus a top strip with undo/redo,
  snap (G), zoom, units and help. Its "Start a new floorplan" modal offers exactly three starters —
  **Empty plan / Square room / L-shaped plan**. `OBSERVED` (`rea/2dplanner.html`,
  `rea/i18n-planner.json`)

### 2.5 Undo / redo, history, saving

- 3D editor strings: `ui.undo`, `ui.redo`, `ui.undone`, `ui.redone`, `ui.history`, `bim.undo`,
  `bim.redo`, `bim.undone = "Undone ({n} element(s))"`, `bim.redone = "Redone ({n} element(s))"`.
  No undo/redo button exists in the captured 3D top bar or status bar; the shortcut list is the only
  in-product surface (`Ctrl+Z` / `Ctrl+Y`). `OBSERVED` + `INFERRED`
- 2D planner has explicit, tooltipped buttons **"Undo (Ctrl+Z)"** and **"Redo (Ctrl+Y)"**.
  `OBSERVED` (`rea/2dplanner.html`)
- Saving: autosave in the browser (`bim.autosave`, `settings.autosave = Auto-save` in the 2D planner
  with the hint "Automatically save each change you make"), explicit `Ctrl+S`, `bim.save`,
  `bim.saveAs`, `bim.saved = "Project saved in this browser"`, `bim.recent = "Projects in this
  browser"`, `bim.noProjects = "No project saved yet."`, partial-restore warning, and
  `bim.fmt.project = "Project (.hpbim.json)"` for file import/export. Landing page (`DOCUMENTED`)
  says projects live in **IndexedDB**; the in-app wording only says "in this browser" — see §4.
  `OBSERVED` + `DOCUMENTED`

### 2.6 Keyboard shortcuts

Assembled from `ux.keys.*` / `help.*` / `top.*` strings and the generated help list in
`js/editor_hp-ux.js`. Groups are labelled **View / Editing / Drawing walls / Project**.

3D editor (`OBSERVED` in i18n; the generated list is built from these keys):

| Key | Action |
|---|---|
| `Home` | Show the whole project (Frame all) |
| `F` | Focus camera on selection |
| `1` / `2` / `3` | Move / rotate / scale gizmo |
| `Shift` (hold) | Snap to the grid while moving |
| `Ctrl+C` / `Ctrl+V` | Copy selection / paste at the last clicked point |
| `Ctrl` + click | Select several objects |
| `Del` | Delete selection |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Esc` | Close panels and menus |
| `Ctrl+S` | Save project in the browser |
| `Ctrl+K` | AI assistant |
| WASD / arrows | Walk (first-person view) |
| Wall tool: `Enter` or double-click | Finish the walls |
| Wall tool: `Backspace` | Remove the last point |
| Wall tool: `Tab` | Switch to typing the angle after the length |

2D planner (`OBSERVED` in `rea/i18n-planner.json`): `Ctrl+Z`/`Ctrl+Y` undo/redo, `Ctrl+S` save,
`Del` delete, `Ctrl+D` duplicate, `Ctrl+V` paste door/window, `?` help, `G` snap toggle, `+`/`−`
zoom, `Ctrl+0` reset zoom, middle button or `Space` pan, `Alt` place freely.

Presentation problem (`OBSERVED`): the in-editor **"Keyboard shortcuts"** dialog (`#modalkey`) body is
a single `<object data="textures/hotkeys.svg">` image. The fetched SVG contains only eight English
labels — *Delete objects, Snap to Grid, Translate objects, Rotate objects, Bonding Box, Copy/Paste
objects, Stop wall sketch, Select multiple objects* — so it is neither complete nor localised, while
a richer, localised HTML list exists in code. Each tool pane also carries an inline `wb.hint` /
`lin.hint.*` / `measure.hint` line that tells you the keys for the active tool. `OBSERVED`

### 2.7 Mobile / touch

`OBSERVED` (`css/hp-ui.css`, `css/hp-panels.css`, `meta viewport`, module search):

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — **no** maximum-scale or
  `user-scalable=no`, so browser pinch-zoom remains available.
- Breakpoints actually written: 480, 520, 560, 640, 700, 900, 1100, 1366, 1440, 1600, 1700 px.
- `≤560px`: `--hp-topbar-h: 94px`, top bar becomes `flex-wrap` in three rows — brand+project (order 1),
  right tools (order 2), full-width view segmented control (order 3).
- `≤700px`: hide the save-state chip and FPS, shrink the project-name input to 90 px, tool card to
  150 px, tighter top-bar padding; hide the door/window-to-wall distance card.
- `≤640px`: move the viewer banner to the bottom, clear of the axis gizmo, and show only the view
  mode, not its label.
- `≤520px`: multi-column settings grids collapse to one column. `≤480px`: texture grid min 64 px.
- The tool dock auto-collapses when a `matchMedia` query matches and can be toggled from a
  status-bar button (`hp-tools-toggle` → `body.hp-tools-collapsed`).
- **No touch-specific code:** in the downloaded editor modules the only pointer listeners are
  `pointerdown` / `pointermove`; there is no `touchstart`, `touchmove`, `gesturestart` or
  `touch-action` rule in the editor CSS. Several hints are mouse-worded ("Move the mouse to bend the
  wall", "middle button", "Add a joint … then drag"), and the `hp-tip-pos` tooltips are hover-driven.
  `INFERRED`: touch works only through the browser's pointer-event synthesis; there is no dedicated
  pinch-zoom/pan or long-press gesture set, and no mobile-only tool layout beyond reflow.

### 2.8 Misc. UX patterns worth noting

- **Progressive disclosure of a big feature set**: three intent tabs + contextual panels + a
  context pill bar, instead of one long toolbar. `OBSERVED`
- **Explanatory tooltips everywhere** (`data-tip` + i18n `*Tip` keys), including "GPU cost" wording
  for render quality and "Free, no sign-up, no watermark" in the donate dialog. `OBSERVED`
- **Non-monetary, high-trust framing**: "No login", "Projects stay in your browser", donate-only
  monetisation, no watermark (landing page + donate dialog). `DOCUMENTED` / `OBSERVED`
- **Selective cloud**: view-share links, IFC/DXF conversion and AI runs are opt-in server calls with
  explicit copy about size limits (25 MB), expiry (90-day link renewal) and AR link lifetime (48 h).
  `OBSERVED` (`share.*`, `ar.*` i18n)
- **Heavy first load**: ~2.1 MB HTML (mostly inline `HP_BOOT` + i18n) + ~2.35 MB of JS modules +
  Babylon.js from `assets/babylonjs/`, all before the user has drawn anything; the blocking loader +
  "Project settings" modal are how that cost is hidden. `OBSERVED`

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort (V/E). Each ties to a finding above. Effort assumes the current
Vite/TS/Three.js single-page app.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Adopt the 3-strip shell**: fixed top bar = project name + save-state chip + view segmented control + level stepper; fixed slim bottom bar = selection readout, units toggle, FPS, Help. Canvas full-bleed behind. | §2.2 | High | Low |
| 2 | **First-run funnel of at most 4 decisions**: non-dismissible "New project" modal (name optional, grid size, units) → then a dismissible 3–4 tile "Start" card (Draw room · Rect/Polygon · Furnish · Import) with sessionStorage dismissal. | §2.3 | High | Low–Med |
| 3 | **Crash-recovery prompt** on load: "A project from your last session was found → Restore / Discard". For a localStorage-only planner this is the single biggest trust win. | §2.3/2.5 | High | Low |
| 4 | **Surface undo/redo in the chrome** — icon buttons with live counts and a tooltip ("Undo (Ctrl+Z)"); toast "Undone (2 elements)". Keep shortcuts too. | §2.5 | High | Low–Med |
| 5 | **Replace the shortcuts image with a real, localised HTML table** grouped View / Editing / Drawing / Project, reachable from a `?` button; also show a per-tool inline hint line for the active tool (what Enter/Backspace/Tab/Esc do *now*). | §2.6 | High | Low |
| 6 | **Intent-grouped tool rail with 3 icons** (View · Build · More) instead of a long toolbar; contextual properties appear only on selection. | §2.2/2.4 | High | Med |
| 7 | **Save-state chip** with 3 states (Unsaved / Saving… / Saved in this browser) + `Ctrl+S` + a one-off "Saved locally, nothing leaves your browser" toast. | §2.3/2.5 | Med–High | Low |
| 8 | **New-plan starter presets** — Empty · Square room · L-shaped room — instead of a full template gallery; near-zero content cost, covers "what do I click first". | §2.3/2.4 | Med | Low |
| 9 | **Status-bar units toggle (m ⇄ ft)** that updates the grid label, dimension text and exports live, with a tooltip. | §2.2 | Med | Low |
| 10 | **Empty-state guidance tied to state**: when the plan has no rooms, show the start card and make "Frame all" answer "Nothing built yet"; hide catalog/furnish tools until a room exists. | §2.3 | Med | Low |
| 11 | **Mobile pass**: at ≤560 px wrap the bar into 3 rows, hide non-essential chips, collapse the tool rail by default with a toggle, keep ≥44 px touch targets; add explicit pinch-zoom + one-finger pan + tap-to-place so touch is not merely "pointer events happen to work". | §2.7 | Med–High | Med–High |
| 12 | **Optional 4-step spotlight tour** (views → draw → furnish → export) shown once, skippable, stored in localStorage, re-openable from Help — instead of a permanent tutorial page. | §2.3 | Med | Med |
| 13 | **Defer the heavy payload**: keep the furniture palette small as it is, but lazy-load the catalog/thumbnails and any large JSON so first paint isn't behind a blocking loader. | §2.8 | Med | Med |
| 14 | **Keep one workspace, not two apps**: route the 2D plan as a mode of the same shell (segmented control) rather than a separate page/app, so plan state and selection never need a handoff. | §2.1/2.4 | Med | Med (you already have both views) |
| 15 | **Do NOT copy**: the SVG-image help dialog, the 2 MB inline boot JSON, the non-localisable hint strings, and hover-only tooltips (make them focus/tap-reachable). | §2.6/2.7/2.8 | High (avoid) | Low |

---

## 4. Unknowns / what I could not verify

- **`app.php` vs `index.php` redirect logic.** Raw fetches (with browser UA, Googlebot UA, cookie
  jar and `Referer`) always return the leading `window.location.href = 'index.php'` line, and a fresh
  headless launch at `app.php` lands on `index.php`; yet clicking the landing CTA to `app.php` keeps
  the editor there. Whether this is header/UA content negotiation, a cookie, or JS state is
  **unresolved**.
- **Screenshots were not visually inspected** — this session's model has no image input. All layout
  claims come from DOM, CSS and i18n, not from looking at the pixels.
- **The multi-step interaction capture was cancelled** by the host time limit (rea
  `capture_browser_scenario` → `code: cancelled`). Retained from it: `shots/flow-scenario_start.png`
  and `shots/flow-wait_setup.png` only. There is **no captured screenshot** of the catalog drawer open,
  the help dialog open, or a drawn plan; those states are evidenced by static DOM/i18n instead.
- **Undo/redo behaviour not exercised**: stack depth, grouping granularity, whether view changes are
  undone, and whether the 3D editor ever renders undo buttons after an edit are unverified.
- **Property panels not exercised live.** `.hp-mat`, object and wall panels are created at runtime by
  `hp-panels.js`, so they are absent from the captured DOM; their exact field layout is inferred from
  i18n keys and CSS, not observed.
- **Touch not tested on device or with an emulated touch profile.** Absence of touch code is a
  code-level observation; actual behaviour (momentum pan, pinch, hit accuracy) is unknown.
- **Storage mechanism conflict:** the landing page (`DOCUMENTED`) says IndexedDB; in-app strings only
  say "in this browser". Which is used in the current build is unverified.
- **2D planner read statically only** (`rea/2dplanner.html`, `rea/i18n-planner.json`); no live capture
  of the `extension-floorplanner-*` app, so its real layout, performance and touch behaviour are
  unknown. Whether it is embedded (a `floorplanFrameContainer` is referenced in `hp-ux.js`) or opened
  as a separate navigation is **inferred as separate navigation** from the observed request.
- **Exact shortcut set is inferred** from the i18n keys that build the help list; I did not fire each
  key combination and confirm the effect.
- **No pricing question** to answer: the app is donation-funded with no paid tier (`DOCUMENTED` on
  the landing page; a PayPal donate link exists in-app).
- **Editor JS is obfuscated** (string-array rotation, base64 lookup tables in `hp-ux.js` etc.), so
  behaviour inside `hp-editor.js` / `hp-bim.js` was read only where strings or deobfuscated
  structure allowed; no source code was copied.

---

## Appendix — evidence inventory

| File | What it is |
|---|---|
| `rea/app.php.html` | Editor document as served (~2.09 MB): editor markup + inline `HP_BOOT` + i18n |
| `rea/editor-dom.html` | Live post-boot editor DOM (2.1 MB), sha256 `37a16d20…` |
| `rea/i18n-app.json` | Editor dictionary, 1678 keys (extracted) |
| `rea/2dplanner.html` | 2D planner app page, 139 KB |
| `rea/i18n-planner.json` | 2D planner dictionary, 905 keys |
| `rea/hotkeys.svg` | The shortcut image used by the help dialog, sha256 `842c77ca…` |
| `rea/index.php.html`, `index3.php.html`, `index4.php.html`, `index5.php.html`, `index2.php.html`, `app2.php.html` | Landing / tool pages and the material editor |
| `rea/sitemap.xml`, `rea/module-urls.json` | URL inventory and the 29 editor module URLs |
| `js/editor_*.js` | 29 editor modules retrieved in-page (~2.35 MB) |
| `css/hp-ui.css`, `css/hp-panels.css`, `css/hp-io.css`, `css/boot-*.css` | Editor styles |
| `shots/step01-wait_load-screenshot.png` | Landing page viewport, `ev_46270718…` |
| `shots/step01-wait_editor-screenshot.png` | Editor + Project settings modal, `ev_706e3264…` |
| `shots/04-editor-empty.png` | Editor after "Start designing", with the "Start your project" card |
| `shots/flow-wait_setup.png`, `shots/flow-scenario_start.png` | From the cancelled flow capture |
| `rea/scen-*.json` / `.out.json` | Declared REA scenarios and their Evidence envelopes |
| `rea/probe*.mjs`, `rea/fetchjs.mjs`, `rea/extract.py` | The observation/extraction scripts used |
