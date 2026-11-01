# 3D House Planner — Left-Dock Control Inventory (Round 2, job 02-01b)

**Target:** https://www.3dhouseplanner.com/app.php — Babylon.js editor. 2D planner iframe entry: `/2D-Planner/index.php` (round-1 evidence), launched from `#open2DPlanner`.
**Question:** every control in the left dock tabs **View and light / Build / Measure-copy-paint** — label, type, range, default, effect, persistence key.
**Method:** round-1 report read first (`~/dsh-workspaces/rea-3dhouseplanner-2026-10/01-01-feature-inventory/report.md`, read-only, reused); then fresh work: (a) raw HTML of `/app.php` fetched with the site's `visted` gate cookie, (b) the page's own per-module JS downloaded via `js.php?f=editor/...`, deobfuscated offline, (c) a live Chromium session (Playwright + `playwright-core`) that boots the editor, closes the setup dialogs, and reads/toggles every dock control while watching `window.HP3D` and `localStorage`.
**Dates:** captured 2026-10-31. Started 14:33 CET, hard stop 16:33 CET. Chrome 156.0.8078.74; viewport 1600×950; locale en-US; TZ UTC.

## 1. Summary

- **The dock is two always-present cards plus a conditional third**: `#hpLeftDock > section#hpLevelPanel` (*Floors & grid*), `#hpLeftDock > section#hpToolCard` (the 3-tab card, `role="tablist"`, containing `#viewtab` / `#tooltab` / `#extensiontab`), and `#hpLeftDock > section#hpCopyPanel` (*Copy to another floor*, `hp-hidden hp-fcard-empty` until something is copyable). **The *Material* card `#hpMaterialPanel` is not in `#hpLeftDock` at all** — it is a separate direct child of `#hpGuiRoot` (`section.hp-fcard.hp-mat.hp-hidden`, `display:none` on a clean boot). **OBSERVED** DOM ancestry computed from `evidence/live_hpLeftDock.html` and `evidence/live_hpGuiRoot.html`: `hpLevelPanel`, `hpToolCard`, `hpCopyPanel` → `div#hpLeftDock`; `hpMaterialPanel` → `div#hpGuiRoot`. (Round 1 described two cards but did not state their parent; this pins the level card and the tab card as siblings inside `#hpLeftDock`, with the level card inserted via `insertBefore(panel, dock.firstChild)`.)
- **Only `hpLevelPanel` is visible regardless of the active tab**; the three tab panes are toggled purely by `display:block/none` on `#viewtab` / `#tooltab` / `#extensiontab`. **OBSERVED** `evidence/dock_live.json` `afterTab_*`.
- **Seven option objects persist in `localStorage`** and are read back on the next visit: `hp-wallbuilder-opts`, `hp-skirting`, `hp-wall-skirting`, `hp-linear`, `hp-measure`, `hp-dims`, `hp-dims-opts` (+ `hp-sun-map`, `hp-mat-collapsed`, `hp-catalog-recent`, `hp-tour-done`, the units key `#heightmapLengthValue`). **Every slider in the *Floors & grid* card is session-only**: changing visible-floors / snap / wall height / wall thickness / terrain / brush wrote nothing. **OBSERVED** `evidence/dock_level.json`, `evidence/dock_persist.json`.
- **The snap slider's label is derived, not fixed**: index 2…16 (step 2) maps to snap 0.500 → 0.063 m in a 1/n sequence; the default index 8 shows **0.125 m**. **OBSERVED** `evidence/dock_level.json.snapMapping`.
- **Static vs runtime-built controls.** Some sub-panels are fully static HTML and some are empty containers filled by JS. **Static:** `#wallbuilderopts` (all 18 inputs), `#wallskirtopts` (2), `#terraintools` (3), `#painttexturepanel` (all 3 layers × 4 controls). **Empty container, JS-built body:** `#ceiltrimtools`, `#lineartools`, `#hpBrushOpts`, `#hpMeasureOpts` (inside the static `#measurecheckboxespanel`). Sun card `#hpSunCard` is also an empty container. **OBSERVED** `evidence/app.php.html` (static markup), `evidence/dock_persist.json.expandedBuild`, `evidence/dock_final.json.brushOptsVisible`, `evidence/dock_defaults.json.buildDefaults`.

## 2. Findings

### 2.1 Evidence index (this job)

| Evidence | What it is |
|---|---|
| `evidence/app.php.html` | raw HTML of `/app.php` (2,092,041 B) fetched with the `visted=1` cookie; contains the static dock markup, `HP_I18N_DATA` and the 1.2 MB `HP_BOOT` payload |
| `evidence/i18n_app.json` | parsed `window.HP_I18N_DATA["app"]` — 1,678 UI strings across 40+ prefixes (`gui.`, `tool.`, `wb.`, `measure.`, `dims.`, `sun.`, `copy.`, `brush.`, `detail.`, `paint.`) |
| `evidence/dock_live.json` | live editor capture: every `#hpLeftDock` control with min/max/step/value/checked/label/dataset, panel outerHTML, per-tab visibility |
| `evidence/dock_persist.json` | live mutation test: changed each parameter and diffed `localStorage` before/after |
| `evidence/dock_labels.json` | live sweep of *every* step of every *Floors & grid* slider, recording the exact label text at each index — this is what establishes the 1/index (snap), 1:1 (terrain radius) and 1/6 (brush radius) mappings |
| `evidence/dock_level.json` | live probe of the *Floors & grid* card: labels, ranges, HP3D mirror |
| `evidence/dock_defaults.json` | live clean-boot capture of the **exact** default of every Material range/number, every Build sub-panel input, the sun card, the crown/cove type-dependent defaults and `window.HP3D`/`HPUnits`/`HPSun`/`HPMeasure`/`HPDims` key lists |
| `evidence/dock_final.json` | live capture of the `#hpBrushOpts` runtime HTML, the `#hpLevelCopyDialog` full markup, and confirmation that the Material card stays hidden when the brush is on |
| `evidence/dock_effects.json` | live toggle test for the primary checkboxes |
| `evidence/live_*.html` | extracted rendered panels from round-1 DOM + this job's live DOM |
| `evidence/js/editor__hp-*.js` and `*.deob.js` | the page's own module scripts, downloaded from `js.php`, deobfuscated offline for key names |
| `scripts/deob.js` | javascript-obfuscator (base64 string-array + rotation + aliases) deobfuscator written for this job |
| `scripts/drive.mjs`, `scripts/dock_*.js` | Playwright driver and scenario scripts used for the live captures |

### 2.2 How the dock is assembled

**OBSERVED** (`evidence/app.php.html` static markup; `evidence/dock_live.json` rendered DOM; ancestry computed from `evidence/live_hpLeftDock.html` + `evidence/live_hpGuiRoot.html`; `evidence/js/editor__hp-panels.deob.js`):

- **Structure** (verified by walking the DOM ancestors of each id):

  ```
  div#hpGuiRoot
  ├── section#hpLeftDock.hp-dock
  │   ├── section#hpLevelPanel.hp-fcard.hp-dockcard      ← "Floors & grid", always visible
  │   ├── section#hpToolCard.hp-fcard.hp-dockcard        ← role="tablist", 3 tabs
  │   │   ├── div#viewtab.hp-tool-pane
  │   │   ├── div#tooltab.hp-tool-pane.hp-tab-hidden
  │   │   └── div#extensiontab.hp-tool-pane.hp-tab-hidden
  │   └── section#hpCopyPanel.hp-fcard.hp-dockcard.hp-hidden.hp-fcard-empty   ← "Copy to another floor"
  └── section#hpMaterialPanel.hp-fcard.hp-mat.hp-hidden  ← NOT in the left dock; own child of #hpGuiRoot
  ```

  **`#hpMaterialPanel` is a sibling of `#hpLeftDock`**, not part of it. This matters for the question: the *Material* card is dock-adjacent, not dock-resident, and it starts `display:none`. **OBSERVED**

- `#hpLeftDock` **is present in the static HTML** (`<div id="hpLeftDock" class="hp-dock">`) and already contains `#hpToolCard`. What is injected is: the **Floors & grid** card (inserted with `insertBefore(panel, dock.firstChild)`, hence always first) and the **Copy to another floor** card (appended). The static comment reads `<!-- Left dock: floors & grid settings (hp-panels.js), tool card, copy-to-floor card (hp-panels.js) -->`. **OBSERVED** `evidence/app.php.html`, `evidence/js/editor__hp-panels.deob.js`. The **Material** card is built by `hp-panels.js` as a child of `#hpGuiRoot`, *never* inside the dock.
- The 3-tab card is `#hpToolCard` with a `div.hp-tabs.hp-tabs-icons[data-hp-tabs]` container and exactly three `button.hp-tab` children, each carrying `data-tab` (`viewtab` / `tooltab` / `extensiontab`), `aria-label`, `data-tip`, `data-tip-pos="bottom"`, `data-i18n-aria`/`data-i18n-tip` (`tool.viewTab`, `tool.buildTab`, …), plus a Material-icons glyph (`wb_sunny`, `construction`, …). The active tab carries `hp-active` and `aria-selected`. Tab labels: **"View and light" / "Build" / "Measure, copy and paint"**. **OBSERVED** `evidence/app.php.html`, `evidence/dock_live.json.tabs`.
- Tab switching only sets `display` on the three panes. Measured live: **View** → `#viewtab` display `block` / h 165 px, others `none`; **Build** → `#tooltab` display `block` / h 470 px; **Measure…** → `#extensiontab` display `block` / h 74 px. `#hpLevelPanel` stays `block` / h 187 px in all three. **OBSERVED** `evidence/dock_live.json`.
- Round 1 records the **collapse** button (`button.hp-icon-btn.hp-fcard-collapse`, `aria-label="Collapse"` → `aria-expanded`, `class hp-collapsed`) on the *Material* card, and its state is persisted (`localStorage["hp-mat-collapsed"]`, "1"/"0"). **OBSERVED** `evidence/js/editor__hp-panels.deob.js`.
- **Static vs JS-built bodies.** The tab panes and their sub-panel containers are static HTML in `app.php`; the *contents* of `#hpSunCard`, `#hpMeasureOpts`, `#ceiltrimtools`, `#lineartools` and the Material card are emptied and re-rendered by `hp-sun.js`, `hp-measure.js`, `hp-dims.js` and the relevant module. `#wallbuilderopts`, `#wallskirtopts`, `#terraintools` and `#painttexturepanel` keep their hand-written static inputs. **OBSERVED** `evidence/app.php.html` (comment `<!-- Left dock: floors & grid settings (hp-panels.js), tool card, copy-to-floor card (hp-panels.js) -->`, `<!-- sun of the scene: … built by hp-sun.js -->`, `<!-- tape, pinned measurements, automatic dimensions and statistics: built by hp-measure.js -->`, `id="ceiltrimtools" … ></div>`, `id="lineartools" … ></div>`).

### 2.3 Card 1 — "Floors & grid" (`#hpLevelPanel`, always visible)

**OBSERVED** `evidence/live_hpLevelPanel_full.html`, `evidence/dock_level.json`. Every row is a `div.hp-range.hp-gui-slider` with a `<label class="hp-range-label hp-gui-label">` carrying the live readout, and `input[type=range].hp-range-input` whose fill is a CSS custom property `--hp-fill`. There is **no discrete value control — the label *is* the value display**. Rows flagged `hp-hidden` are built but not displayed until the matching tool is active (the app's own language in the live DOM is the class `hp-hidden`, not an HTML `hidden` attribute).

| # | Label (live text) | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|---|
| 1 | `Visible floors: up to {n}` | range | 1 | 50 | 1 | **50** | caps how many levels are drawn/handled; label prints the index verbatim (1…50) |
| 2 | `Current floor: {n}` | range (built `hidden`) | 0 | 50 | 1 | **0** | active level; label prints the index verbatim; hidden — the visible floor picker is in the top bar / status bar |
| 3 | `Snap to grid: {v} m` | range | 2 | 16 | 2 | **8 → 0.125 m** | grid pitch = `1/index` m at runtime (see mapping below) |
| 4 | `Wall height: {v} m` | range (built `hidden`) | 0.05 | 2.65 | 0.05 | **2.65** | mirrors the Wall-builder *Height* slider; label = value with 2 decimals |
| 5 | `Wall thickness: {v} m` | range (built `hidden`) | 0.1 | 0.4 | 0.01 | **0.20** | mirrors the Wall-builder *Thickness* slider; label = value with 2 decimals |
| 6 | `Terrain radius: {v} m` | range (built `hidden`) | 1 | 30 | 1 | **5** → label `5.00 m` (the index **is** the metre value) | terrain brush footprint |
| 7 | `Terrain strength: {v}` | range (built `hidden`) | −0.1 | 0.1 | 0.01 | **0.01** | terrain brush strength (signed: raise/lower) |
| 8 | `Brush radius: {v} m` | range (built `hidden`) | 1 | 40 | 1 | **5** → label `0.8 m`; the label is `round(index/6, 0.1) m` (**not** 1:1 like *Terrain radius*) | terrain-paint brush |
| 9 | `Brush strength: {v}` | range (built `hidden`) | 0 | 1 | 0.1 | **1** | terrain-paint strength |
| — | `Duplicate level…` (`button.hp-btn.hp-btn-sm.hp-level-copy`) | button | — | — | — | — | opens **`#hpLevelCopyDialog`**, a real modal: `role="dialog"`, `aria-modal="true"`, class `hp-dialog hp-open` (**OBSERVED** live `evidence/dock_final.json.dupCandidates`) |

**The Duplicate level dialog (OBSERVED live, `evidence/dock_final.json`)** — `#hpLevelCopyDialog > .hp-dialog-card.hp-dialog-md`, heading *"Duplicate level"*, sub *"Copy walls, openings and floors of a level to another one, for example to start the upper floor."*, `×` close button, then `div.hp-grid2` with `label.hp-field > span` **From** (`select[data-lc="from"]`, option `0` → *Level 0*) and **To** (`select[data-lc="to"]`, option `1` → *New level above (Level 1)*). Then `div.hp-section-title` **What to copy** and `div.hp-lc-groups` with **seven** `label.hp-lc-group` rows, each `input[type=checkbox][data-group=…]` + icon + name + `small` count: `walls` Walls / `openings` Doors and windows / `floors` Floors / `finishes` Skirting and cornices / `objects` Furniture and objects / `stairs` Stairs / `roofs` Roofs. Footer: `Cancel` (`data-hp-close`) and a primary `Duplicate` button (`data-lc="go"`) that starts **disabled**. The per-group checkboxes are also `disabled` and tagged `hp-lc-empty` when that group has 0 elements — i.e. the dialog **counts what actually exists** on the source level before it enables anything. A `div.hp-lc-target[aria-live="polite"]` announces `{name} already has {n} elements of these kinds.` and the final action offers `Add to them` / `Replace them` (`copy.level.add` / `copy.level.replace`).

**Snap mapping (OBSERVED, `evidence/dock_labels.json`):** index 2→`0.500 m`, 4→`0.250`, 6→`0.167`, 8→`0.125`, 10→`0.100`, 12→`0.083`, 14→`0.071`, 16→`0.063`. That is **1/index metres**, not a linear step — so "finest 6.3 cm, coarsest 50 cm", much finer than CasaPlazAI's 0.5 m grid.

**Two different radius mappings (OBSERVED, `evidence/dock_labels.json`):** every level slider's label was read at *every* step of its range. `Terrain radius` prints `index` metres verbatim (1→`1.00 m` … 30→`30.00 m`), whereas `Brush radius` prints `round(index/6, 0.1)` metres (1→`0.2 m`, 5→`0.8 m`, 30→`5.0 m`, 40→`6.7 m`); `Snap to grid` prints `1/index`. So the three "distance" sliders in one card use three different scales, and none of them stores the printed number — the stored value is always the integer index. This is the clearest single lesson in the card for CasaPlazAI.

**Level sliders do not persist. OBSERVED**: after setting all nine sliders the only `localStorage` delta was the unrelated `hp-donate` counter. The mirror between the level card and the Wall-builder sliders is live (`wbMirror` = height 2.65 / 2.65, thickness 0.2 / 0.2 after setting the level card). **OBSERVED** `evidence/dock_level.json`.

**Defaults re-verified on a clean boot** (`evidence/dock_defaults.json.buildDefaults`): `#wbthick` 0.2, `#wbheight` 2.65, `#wbgrid` unchecked, `#wbangle` checked, `#wbmagnet` checked, `#wbroomw` 4 / `#wbroomd` 3, `#wallskirtheight` 8 / `#wallskirtcolor` #ffffff, ceiling `type` `crown` with width 6 / height 8 / colour #ffffff / LED #ffd9a0, `#linspacing` 10, `#linwhole` checked, `#linterrain` checked, `#pathwidth` 4, `#pointlength` 5, `#uvtexture1..3` 21, all three `[data-slot]` selects `auto`, `#sliderFloor` 4, `#sliderRoof` 4, `#sliderdistancewindowwall` 4, `#sliderdistancedoorwall` 4. Segmented defaults: `road2` / `auto` / `M`; fence model *"Pine picket fence panel"*. Sun card: `#hpSunTime` **600** = clock `10:00`, date today, ticks `06:35 / 11:52 / 17:09`. **OBSERVED**

### 2.4 Card 2, tab 1 — "View and light" (`#viewtab`, `hp-tool-pane`)

**OBSERVED** `evidence/live_viewtab_full.html`, `evidence/dock_live.json`. The static markup contains a **legacy block wrapped in `div.hp-legacy-hidden`** whose three controls are *not displayed*: `2D` (`input#viewcheck` checkbox), `Open the 2D planner (synced with 3D)` (`button#open2DPlanner`), `Walk` (`input#cameracheck` inside `#cameramodeview`). Ancestry verified in `evidence/app.php.html`: all three are `… > div#hpLeftDock > section#hpToolCard > div#viewtab > div.hp-legacy-hidden (… > div#cameramodeview)`. The comment in the DOM says: *"3D / top / walk views are switched from the top bar (hp-ui.js drives these checkboxes)"* — so the dock still owns the elements, the top bar owns the visible switches. **This explains why round-1 saw "2D", "Walk" buttons in this tab: they are in the DOM and in the accessibility tree even when not displayed.**

The *visible* content is the **Sun card**, injected by `hp-sun.js` into `#hpSunCard`:

| Label | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|
| `Time of day` (+ a `b.hp-sun-card-clock` readout, default `10:00`) | range `#hpSunTime`, `data-sun="time"` | 365 | 1059 | 5 | **600** (= 10:00) | minutes-of-day → moves the Babylon.js sun; ticks printed under it are `06:35` (`.hp-sun-tick-rise`), `11:52` (`.hp-sun-tick-noon`), `17:09` (`.hp-sun-tick-set`) |
| `Date` (aria-label) | `input[type=date].hp-sun-card-date`, `data-sun="date"` | — | — | — | today (2026-10-31) | moves the sun on its annual path; label `sun.date` |
| `Summer` | `button.hp-menu-chip`, `data-sun-season="summer"`, `title="Summer solstice"` | — | — | — | — | jumps the date to 21 June |
| `Equinox` | `button.hp-menu-chip`, `data-sun-season="equinox"`, `title="Equinox"` | — | — | — | — | jumps the date to 20 March / 22 September |
| `Winter` | `button.hp-menu-chip`, `data-sun-season="winter"`, `title="Winter solstice"` | — | — | — | — | jumps the date to 21 December |
| `Sun study…` | `button.hp-btn.hp-btn-sm.hp-sun-card-study`, `data-sun-act="study"` | — | — | — | — | opens the full **Sun study** panel `#hpSunPanel` (`hp-panel hp-open`) |

**Hidden `input#lightcheck`** sits in the tab with the `hidden` attribute and no switch. The DOM comment: *"night sky: no switch, the time of the day turns it on and off (hp-sun.js); the editor's lights still follow it."* **OBSERVED** `evidence/live_viewtab_full.html`.

**The Sun study panel** (opened live from `Sun study…`, **OBSERVED** `evidence/dock_persist.json.sunStudy`) contains, beyond the card: `Latitude (°)` / `Longitude (°)` number inputs (defaults observed `38.9` / `-77.04`), `Use my location`, a `Time zone` select of ~38 UTC±x options, `Summer solstice` / `Equinox` / `Winter solstice` buttons (with real dates `sunDate="2026-06-21"`, `2026-03-20`, `2026-12-21`), a `Time` range, `Play the day` / `Play the year`, an sun-path diagram, and an **Hours of sun on the ground** block (`Floors of the rooms` checkbox `data-sun-opt="rooms"` checked, plus `Compute the map`, colour-scale controls, `Hide the map`). Its `data-sun-opt` object is the thing persisted under **`hp-sun-map`** (`{"rooms":true,…}`; **OBSERVED** `evidence/js/editor__hp-sun.deob.js`).

### 2.5 Card 2, tab 2 — "Build" (`#tooltab`, `hp-tool-pane`)

**OBSERVED** `evidence/dock_live.json.controls`, `evidence/dock_persist.json.expandedBuild`. **Pattern:** each tool is `label.hp-check > input[type=checkbox] + span` — a *toggle* that expands a sub-panel in place (`display:none → block/grid`). Everything is one scroll column; there is no wizard and no modal except for libraries and dialogs.

#### 2.5.1 Wall builder — toggle `#wallcheck` → `#wallbuilderopts.hp-subpanel` (18 controls)

| Control | Type | Values / range | Default | Effect |
|---|---|---|---|---|
| `Drawing mode` | 4 × `button.hp-seg-btn` `data-wb-mode` | `chain` / `single` / `rect` / `arc` | **chain** | Chain = every click ends a wall and starts the next; Single = one wall per two clicks; Rectangle = two clicks on opposite corners make 4 closed walls; Arc = click both ends, then move the mouse to bend |
| `Wall position on the line` | 3 × `button.hp-seg-btn` `data-wb-align` | `center` / `inside` / `outside` | **center** | Center: the drawn line is the wall axis; Inside/Outside: the line is the outer/inner face |
| `Thickness` | range `#wbthick` | 0.1 – 0.4, step 0.01 | **0.20 m** | default wall thickness |
| `Height` | range `#wbheight` | 0.05 – 2.65, step 0.05 | **2.65 m** | default wall height (identical to the level card's hidden Wall-height slider) |
| `Grid` | checkbox `#wbgrid` | — | **unchecked** | snap points to the grid (Shift mid-draw = same) |
| `Angles` | checkbox `#wbangle` | — | **checked** | snap directions to 15° steps (0/45/90 first), also relative to the previous wall |
| `Magnet` | checkbox `#wbmagnet` | — | **checked** | snap to wall ends, onto walls (T-junctions) and alignment guides |
| `Room by size` → `Width` | number `#wbroomw` `aria-label="Width"` | min 0.5, step 0.1 | **4** | room width in m |
| ↳ `Depth` | number `#wbroomd` `aria-label="Depth"` | min 0.5, step 0.1 | **3** | room depth in m |
| ↳ `Place` | button `#wbroomplace` | — | — | the sized room follows the cursor; click drops it by its corner |

**Persistence: `localStorage["hp-wallbuilder-opts"]`. OBSERVED** exact shape after toggling: `{"mode":"chain","align":"center","grid":true,"angle":false,"magnet":false,"roomW":4,"roomD":3}` — i.e. the JSON keys are `mode`, `align`, `grid`, `angle`, `magnet`, `roomW`, `roomD`. `roomW`/`roomD` defaults 4 / 3 match the live inputs.

#### 2.5.2 Skirting board — toggle `#wallskirtcheck` → `#wallskirtopts` (`hp-wall-skirt`, `display:grid`)

| Control | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|
| `Height (cm)` | number `#wallskirtheight` | 2 | 50 | 0.5 | **8** | skirting height |
| `Color` | `input[type=color]` `#wallskirtcolor` | — | — | — | **#ffffff** | skirting colour |

**Persistence: `localStorage["hp-wall-skirting"]` = `"1"` / `"0"` for the toggle, and `localStorage["hp-skirting"]` = `{"height":8,"depth":1.5,"color":"#ffffff"}` for the parameters. OBSERVED** — changing height/colour wrote `hp-skirting`; toggling wrote `hp-wall-skirting`. Note there is also a hidden `depth` field (default 1.5 cm) not exposed in this sub-panel. The engine-side defaults are exposed as `window.HP3D.skirtingDefaults = {height:0.08, depth:0.015, color:"#ffffff"}` (**metres**, i.e. 8 cm / 1.5 cm) — the dock's `8` is the same value in cm. **OBSERVED** `evidence/dock_defaults.json.hp3dMore`. A second `depth` control (`skirt.depth = "Thickness (cm)"`), plus `Face A`/`Face B`/`Both faces` placement and `Add`/`Remove`, exists in the *per-wall* skirting UI (`skirt.*`), not in this dock sub-panel.

#### 2.5.3 Crown / cove — toggle `#ceiltrimcheck` → `#ceiltrimtools.hp-subpanel.hp-ceil-tool`

| Control | Type | Range/values | Default | Effect |
|---|---|---|---|---|
| `Type` | `select[data-ceil="type"]` | `crown` / `cove` / `cove_open` → Crown moulding / Cove (closed) / Open cove with LED | **crown** | profile family |
| `Projection (cm)` | number `[data-ceil="width"]` | 1 – 150, step 0.5 | **6** for crown, **40** for cove / cove_open | how far it projects from the wall (changing `Type` **reloads that type's own defaults** — measured live) |
| `Height on the wall (cm)` | number `[data-ceil="height"]` | 1 – 60, step 0.5 | **8** for crown, **15** for cove / cove_open | vertical position |
| `Color` | color `[data-ceil="color"]` | — | **#ffffff** | moulding colour |
| `LED colour` | color `[data-ceil="led"]` | — | **#ffd9a0** | only meaningful for *Open cove with LED* |
| `All rooms of the level` | button `[data-ceiltool="level"]` | — | — | bulk-apply to every room |
| `Remove from the level` | button `[data-ceiltool="remove"]` (danger) | — | — | bulk-remove |

Helper text (live): *"Moulding where the walls meet the ceiling, mitred at the corners. While this is on, click the floor of a room in the 3D view to add it (clicking again replaces it). Esc or the switch turns it off."* **No persistence key was observed** for the crown/cove parameters (toggling and editing wrote nothing).

#### 2.5.4 Roads, rails & fences — toggle `#linearcheck` → `#lineartools.hp-subpanel` (30 controls)

| Control group | Type / values | Default | Effect |
|---|---|---|---|
| `Type` | 5 × `button.hp-seg-btn[data-lin-sys]`: `rail` Railway / `road2` Road 2 lanes / `road1` Road 1 lane / `fence` Fence / railing / `row` light Row | **road2** | what the run is made of |
| `Piece` (2nd row of the same group) | `row` | **row** | placement mode |
| Mode row | `button[data-lin-mode]`: `auto` (A), `straight` (S), `curveL` (Q), `curveR` (E), `turn90L`, `turn90R`, `switchL`, `switchR`, `cross` | **auto** | how the next piece turns; tooltips name the hotkeys |
| `Curve radius` | 3 × `button.hp-seg-btn[data-lin-radius]`: `S` Tight R 26 m / `M` Medium R 51 m / `L` Wide R 101 m | **M** | radius presets for the curve modes |
| `Model` (fence) | `button.hp-lin-pick-btn` + `expand_more` (opens the catalog) + a `close` button `[data-lin-act="dropStyle"][data-which="fence"]` | *Pine picket fence panel* | fence model picker; `close` reverts to the original model |
| `Posts at the joints` | `button.hp-lin-pick-btn` "No posts" | **No posts** | post style |
| `Whole panels` | checkbox `#linwhole` | **checked** | fit whole panels instead of cutting |
| `Follow the terrain` | checkbox `#linterrain` | **checked** | drape the run over the terrain |
| `Around a floor` | button `[data-lin-act="floor"]` | — | then click a floor to ring it |
| `Use a scene object` (×2: fence and row) | button `[data-lin-act="selFence"]` / `selRow` | — | pick an existing object as the model |
| `Model` (row) | `button.hp-lin-pick-btn` "Single-arm LED street light" + revert | *Single-arm LED street light* | street-light model |
| `Every` | number `#linspacing` (`lin.spacing` = "Every") | 0.5 – 200, step 0.5 | **10** | spacing between lamps, in metres |
| `Undo` / `End run` | buttons `[data-lin-act="undo"]` / `[data-lin-act="end"]`, both `disabled` until a run exists | — | remove last piece / finish the run |

**Persistence: `localStorage["hp-linear"]`. OBSERVED** exact shape: `{"sys":"road2","mode":"auto","radius":"M","fence":818,"post":"","whole":true,"terrain":true,"row":350,"spacing":10}` — note `fence`/`row` are numeric *catalog object ids*, and `spacing` is in metres.

#### 2.5.5 Terrain sculpting — toggle `#terraincheck` → `#terraintools` (static markup inside `#tooltab`)

| Control | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|
| `Draw path` | `button#drawpath.hp-tile.hp-tile-wide` (with a `textures/path.jpg` thumbnail) | — | — | — | — | left-click and drag to lay a path |
| `Width` | range `#pathwidth` (`<b id="textpathwidth">4.00m</b>` is the readout) | 2 | 20 | 1 | **4** | path width |
| `Subd. len.` | range `#pointlength` (readout `#textpointlength` = `5.00m`) | 5 | 10 | 1 | **5** | path subdivision length |

No persistence key observed. Tooltips from `i18n` / `data-tip`: `fx.sculptHint` "Right-click to model terrain", `fx.drawPathHint` "Left-click and drag to draw path", `fx.noPathImported` "You cannot draw path on imported ground". **OBSERVED** `evidence/app.php.html`, `evidence/dock_defaults.json`.

#### 2.5.6 Terrain painter — toggle `#terrainpaintercheck` → `#painttexturepanel.hp-subpanel` (static, 3 layers × 4 controls)

**3 identically structured layers** (radio `name="painttexture"` with values `#FF0000` / `#00FF00` / `#0000FF` and labels 1/2/3 — these are the *layer selector*, the colours being the on-terrain debug tint):

| Control | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|
| layer radio 1/2/3 | `input[type=radio]` | — | — | — | — | which paint layer is active |
| texture thumb (`#terraintextureimg1/2/3`, class `hp-paint-thumb`) | button `data-hp-open="modalpaintterrain"` | — | — | — | — | opens the 35-texture library / upload / AI modal |
| `UV scale` (aria label) | range `#uvtexture1/2/3` | 1 | 150 | 2 | **21** live (round 1 saw "Automatic (by texture)" as the first option in a select variant) | texture tiling per layer |
| `Vegetation of this texture` | `select.hp-paint-detail[data-slot="0/1/2"]` | `auto` / `none` / `grass` / `dry` / `pebbles` / `sand` / `mud` / `bog` / `water` | **auto** | scatters 3D vegetation when painting |

No persistence key observed for the paint layers (they belong to the project file).

#### 2.5.7 Floor / Roof / Rough opening / Door opening / Hip roof / Gable roof (static card grid `#finishingtools`)

Each entry is a `button.hp-tile.hp-tool-card` with an inline SVG glyph + `span.hp-tile-name`; the *range input stays the source of truth* and `hp-panels.js` renders the `− value +` stepper from it (DOM comment: *"finishing tools: compact cards (icon + name); the range inputs stay the source of truth and are shown as − value + steppers by hp-panels.js"*). **OBSERVED** `evidence/app.php.html`.

| Control | Type | min | max | step | default | Effect |
|---|---|---|---|---|---|---|
| `Floor` (`data-tip="Floor"`) | `button#floorButton.hp-tile.hp-tool-card` | — | — | — | — | starts the floor tool (needs a polygon) |
| `Floor edges` −/+ + readout `#floortext` ("4 edges") | `div.hp-stepper[data-for="sliderFloor"]` | — | — | — | — | stepper around the slider |
| ↳ slider | range `#sliderFloor.hp-range-input.hp-stepper-src`, `aria-label="Floor edges"` | 3 | 20 | 1 | **4** | number of sides of the generated floor disc |
| `Roof` (`data-tip="Roof"`) | `button#roofButton` + `#rooftext` readout | — | — | — | — | roof tool |
| ↳ slider | range `#sliderRoof`, `aria-label="Roof edges"` | 3 | 20 | 1 | **4** | sides of the roof cone |
| `Rough opening` (`data-tip="Rough opening"`) | `button#frameButtonW` + `#textdistancewindowwall` readout | — | — | — | — | cut a window-less opening in a wall |
| `Wall length` −/+ + slider | range `#sliderdistancewindowwall` | 2.5 | 20 | 0.125 | **4** | wall length used to place the opening |
| `Door opening` (`data-tip="Door opening"`) | `button#frameButtonD` + `#textdistancedoorwall` readout | — | — | — | — | door-less opening |
| `Wall length` −/+ + slider | range `#sliderdistancedoorwall` | 2.5 | 20 | 0.25 | **4** | same for the door opening |
| `Hip roof` (`data-tip="Hip roof"`) | `button#roofButtonPoly` | — | — | — | — | one-click hip roof |
| `Gable roof` (`data-tip="Gable roof"`) | `button#roofButtonPoly2` | — | — | — | — | one-click gable roof |

**No persistence keys observed** for these six tools; their settings live in the project.

### 2.6 Card 2, tab 3 — "Measure, copy and paint" (`#extensiontab`, `hp-tool-pane`)

**OBSERVED** `evidence/live_extensiontab_full.html`, `evidence/dock_live.json`. Three switch rows; two of them expand a `hp-subpanel`.

#### 2.6.1 Measure — toggle `#measurecheck` → `#measurecheckboxespanel.hp-subpanel` (contains `#hpMeasureOpts`, built by `hp-measure.js`)

| Control | Type | Values | Default | Effect |
|---|---|---|---|---|
| `Distance` | `button.hp-seg-btn[data-m-mode="dist"]` | — | **active** | two-point distance tape; readout `measure.start` = *"Click the first point"* |
| `Angle` | `button.hp-seg-btn[data-m-mode="angle"]` | — | — | three-point angle; prompt *"Click three points: the second one is the vertex"* |
| readout | `div.hp-measure-readout[aria-live="polite"]` | — | *"Click the first point"* | live distance/angle, plus horizontal and height components |
| hint | `p.hp-muted.hp-measure-hint` | — | — | *"Snaps to the corners of walls, openings, floors and objects. Shift: along an axis · Esc: cancel"* |
| `Keep the measurements in the project` | checkbox `[data-m-opt="pin"]` | — | **checked** | pin measurements into the saved project |
| `Dimensions in 3D` | checkbox `[data-m-dims="on"]` | — | **unchecked** | master switch for automatic dimensions |
| `Walls and overall size` | checkbox `[data-m-dims="walls"]` | — | **checked, disabled until the master is on** | auto-dimension walls/overall |
| `Doors and windows` | checkbox `[data-m-dims="openings"]` | — | unchecked, disabled | auto-dimension openings |
| `Room areas` | checkbox `[data-m-dims="rooms"]` | — | unchecked, disabled | auto-dimension room areas |
| `Heights` | checkbox `[data-m-dims="heights"]` | — | unchecked, disabled | auto-dimension heights |
| `Stats` | `button.hp-btn.hp-btn-sm.hp-btn-block[data-m-act="stats"]` | — | — | opens the quantities/efficiency stats |
| measurement list | `ol.hp-measure-list` (only while measurements exist) | — | — | each row has a `[data-m-del="i"]` remove button; a `[data-m-act="clear"]` *"Remove all measurements"* button appears with them |

Enabling `Dimensions in 3D` live **enabled** all four sub-checkboxes. **OBSERVED** `evidence/dock_effects.json.measureAfterDimsOn`.

**Persistence:** `localStorage["hp-measure"]` = `{"mode":"dist","pin":true}` (**OBSERVED** exact shape) and `localStorage["hp-dims"]` = `"1"|"0"` + `localStorage["hp-dims-opts"]` = `{"walls":true,"openings":false,"rooms":false,"heights":false}`. Keys resolved from `evidence/js/editor__hp-dims.deob.js`: `hp-dims`, `hp-dims-opts`. **OBSERVED** `evidence/dock_persist.json`.

#### 2.6.2 Material brush — toggle `#brushcheck` → `#hpBrushOpts.hp-subpanel` (runtime HTML)

The sub-panel is an empty `div.hp-subpanel` with `display:none` in the static HTML; switching the toggle on makes it `display:block` and `hp-copy.js` renders a **sample row + hint** into it (**OBSERVED** `evidence/dock_final.json.brushOptsVisible`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

The Material card (§2.7) is the material source. `window.HPCopy` exposes only `{openLevel, duplicate}` — i.e. the brush state lives inside the module, not on a public surface. `i18n brush.*` (7 keys): *"Click the surfaces to paint"*, *"Alt+click picks another material · Shift+click paints every surface of the same kind and material on this level · Esc ends"*, *"Click a surface to pick its material"*, *"Pick another material"*, *"{n} surfaces painted"*, *"No material yet"*, *"Material brush"*. **OBSERVED** `evidence/live_extensiontab_full.html`, `evidence/i18n_app.json`, `evidence/js/editor__hp-copy.deob.js` (`hpBrushOpts`).

**Note on the Material card's own visibility:** in a clean boot the card is `hp-fcard hp-mat hp-hidden` with `display:none` and does **not** appear when the brush is switched on (**OBSERVED** `evidence/dock_final.json.matBefore` / `matAfterBrush` are identical). It is shown by the editor when a surface is actually *picked* — so the card's trigger is selection state, not the brush toggle (round-1 reading, re-confirmed here).

#### 2.6.3 Copy — the `#hpCopyPanel` card ("Copy to another floor")

**OBSERVED** `evidence/live_hpCopyPanel_full.html`. The card lives **below** the tab card, not inside a tab; it is `hp-hidden hp-fcard-empty` until something is copyable. It contains a hidden `Paste to floor {n}` slider (min 0, max 50, step 1) and three buttons that are each individually hidden until relevant: `Paste` (primary), `Copy material`, `Paste material`. Its body has `data-hint="Choose what to copy in the tool card: walls, floors, doors/windows or material."` The element-copy UI (`Copy element` / `Array` / `Mirror ↔` / `Mirror ↕` / `Spacing` / `Copies` / `Same place on another level`) is **not** in the dock — it is in the selection bar / top bar. **OBSERVED** `evidence/i18n_app.json copy.*`, plus DOM comment *"copies of elements are in the selection bar, copies of a level in the Floors card"*.

### 2.7 The *Material* card (`#hpMaterialPanel`) — dock-adjacent, `#hpGuiRoot > section`

**OBSERVED** `evidence/live_hpMaterialPanel_full.html`, `evidence/live_hpGuiRoot.html`. Section `section.hp-fcard.hp-mat.hp-hidden` — **a direct child of `#hpGuiRoot`, not of `#hpLeftDock`**, and `display:none` on a clean boot (`evidence/dock_final.json.matBefore`). It is revealed when a surface is picked / the material editor is needed (round-1 reading, re-confirmed: switching the material brush on does **not** reveal it). Head: `palette` icon, title `Material`, and a collapse button whose state is persisted (`hp-mat-collapsed`).

| Control | Type | min | max | step | default (read from the live `input.value`) | Effect |
|---|---|---|---|---|---|---|
| `Standard` / `PBR` | 2 × `button.hp-seg-btn[role=radio]` | — | — | — | neither `aria-checked` until a surface is painted | standard vs physically based material |
| `Color` | 16 `button.hp-swatch[data-color]` + `input[type=color]` + `input.hp-color-hex[maxlength=7]` | — | — | — | swatch palette: `#FFFFFF #F5F0E6 #D6C7A1 #A47551 #6B4F3A #9E9E9E #424242 #1C1C1C #B71C1C #E67E22 #F1C40F #2E7D32 #00897B #1565C0 #6A1B9A #C2185B`; `color` = `#ff0000`, hex field empty | diffuse/standard colour |
| `U scale` | range + paired number | 0.05 | 10 | 0.05 | **1** (both inputs, read live) | texture tiling U |
| `V scale` | range + paired number | 0.05 | 10 | 0.05 | **1** | texture tiling V |
| `Texture angle` | range + paired number | 0 | 2π (6.283185307179586) | any | **0 rad** | texture rotation |
| `Metallic` | range + paired number | 0 | 1 | any | **0.5** | PBR metallic |
| `Glass` | `label.hp-switch` + checkbox | — | — | — | unchecked | enables refraction/transparency path |
| `Refraction index` | range + paired number | 1 | 1.7 | any | **1.4** | PBR IOR |
| `Roughness` | range + paired number | 0 | 1 | any | **0** | PBR roughness |
| `Transparency` | range + paired number | 0.1 | 1 | any | **1** | alpha |
| `Emissive` | `label.hp-switch` + checkbox + inline `input.hp-range-number` | 0 | 1 | any | unchecked / **0** | emissive on/off + strength |
| (unlabelled row) | range `hp-range-nolabel` | 0 | 1 | any | **0** | the label slot is populated at runtime |
| `Textures` | button `data-tip="Open the texture library"` | — | — | — | — | texture library |
| `AI texture` | button `hp-btn-ai-soft[data-hp-open="modalAiTexture"]` | — | — | — | — | Puter.js AI texture generator |

All values in this table except the swatch palette were read from the live DOM inputs (`evidence/dock_defaults.json.material`) after a clean boot — they are **OBSERVED**, not inferred from the `--hp-fill` bar. The card has **eight** range rows in total (the eighth carries no label and no number input).

No persistence key observed for material parameters.

### 2.8 Persistence — the full dock-relevant key table

| Key | Written by | Example value observed | Read on load |
|---|---|---|---|
| `hp-wallbuilder-opts` | Wall builder mode/align/snapping/room size | `{"mode":"chain","align":"center","grid":true,"angle":false,"magnet":false,"roomW":4,"roomD":3}` | yes |
| `hp-skirting` | Skirting height/colour (+ hidden depth) | `{"height":12,"depth":1.5,"color":"#123456"}` | yes |
| `hp-wall-skirting` | Skirting toggle | `"1"` / `"0"` | yes |
| `hp-linear` | Roads/rails: system, mode, radius, model ids, whole/terrain, spacing | `{"sys":"road2","mode":"auto","radius":"L","fence":818,"post":"","whole":false,"terrain":true,"row":350,"spacing":17}` | yes |
| `hp-measure` | Measure mode + pin | `{"mode":"angle","pin":false}` | yes |
| `hp-dims` | `Dimensions in 3D` master | `"1"` / `"0"` | yes |
| `hp-dims-opts` | Which dimension families | `{"walls":true,"openings":true,"rooms":true,"heights":false}` | yes |
| `hp-sun-map` | Sun-on-ground options | `{"rooms":true}` | yes |
| `hp-mat-collapsed` | Material card collapse | `"1"` / `"0"` | yes |
| `hp-catalog-recent` | Recently used objects (catalog, not dock) | JSON array of ids, max 12 | yes |
| `hp-tour-done` | First-run tour dismissed | `"1"` | yes |
| `hp-start-dismissed` | **sessionStorage**: start card hidden | `"1"` | per session |
| `#heightmapLengthValue` (the constant `HP_UNITS_KEY` — a legacy element-id string used as the key) | unit switch m/ft | `"m"` / `"ft"` | yes |
| `extension-floorplanner-currently-editing` | 2D-planner iframe coordination | `"true"` | yes |
| `hp-donate` | donation nag counter (module `hp-donate.js`) | `{"used":90,"next":0}` | yes |

**How each row was established.** The first seven keys were **observed being written** when the corresponding control was changed, with the value shown captured from `localStorage` (`evidence/dock_persist.json`). `hp-sun-map`, `hp-mat-collapsed`, `hp-catalog-recent`, `hp-tour-done`, `hp-start-dismissed` and `#heightmapLengthValue` were found as literals in the modules named in the table and/or were present in a live boot's storage (`evidence/dock_live.json.storage`); for those the *"read on load"* column is the app's own behaviour as evidenced by the code path (`localStorage.getItem` at start-up), which is **OBSERVED** from the code, not merely assumed. Only `hp-donate`'s exact key name is inferred from its module name (`hp-donate.js`) plus the live storage entry — its write site is inside obfuscated code.

**Not persisted** (verified by diffing storage after mutation): visible floors, current floor, snap to grid, wall height, wall thickness, terrain radius/strength, brush radius/strength, crown/cove type+projection+height+colours, floor/roof edges, opening wall lengths, terrain path width/subd length, paint-layer UV/vegetation, material parameters, sun time/date/season. **OBSERVED** `evidence/dock_level.json`, `evidence/dock_persist.json`, `evidence/dock_effects.json`.

### 2.9 Cross-cutting observations

- **Units:** every metric readout in the dock goes through `window.HPUnits`, which exposes `{name, factor, set, toggle, pushTo2d, refreshLabels, onChange}`; the factor is `3.28084` for feet and `1` for metres, and it is itself persisted under the legacy key `#heightmapLengthValue`. **OBSERVED** `evidence/dock_live.json.state.units`, `evidence/js/editor__hp-app.deob.js`.
- **i18n:** every label is a `data-i18n` key resolved from `HP_I18N_DATA["app"].dict` (1,678 strings, 10 languages: en, pt, es, fr, de, it, ru, zh, ja, ko). The dock's own keys are prefixed `gui.` (48), `tool.` (40), `wb.` (39), `measure.` (11), `copy.` (41), `brush.` (7), `sun.` (49), `detail.` (9), `paint.` (9). **OBSERVED** `evidence/i18n_app.json`.
- **Range rows are a reusable widget:** `div.hp-range` + `label.hp-range-label` + `input.hp-range-input` + optional paired `input.hp-range-number`, with the fill as `--hp-fill`. Every "slider with a value in its title" in the dock is this one widget. **OBSERVED** all extracted panel HTML.
- **Hotkeys are surfaced in the tooltip text of the tool itself** (e.g. linear tools name A/S/Q/E; the wall builder hint names Enter/double-click/right-click, Tab, Backspace, Ctrl+Z, Esc, Shift, Alt). **OBSERVED** `evidence/i18n_app.json wb.hint*`, live `data-tip`s.

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. `S` ≈ hours, `M` ≈ days, `L` ≈ week+. Schema = `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

| # | Idea | Tied to | Effort | Why it helps CasaPlazAI |
|---|---|---|---|---|
| 1 | **Make the tool card a stack of checkbox toggles whose parameters expand inline** (never a modal, never a mode screen). One scroll column; the checkbox *is* the mode switch. | §2.5 pattern; round-1 §2.5 | S | The current redesign has Plan/3D/Walk modes + tool card + inspector. A toggle-expands-in-place tool card keeps the inspector free and removes mode screens. Directly replaces the "rectangle/polygon tool" radio with a `Drawing mode` segmented row. |
| 2 | **Persist tool settings as small per-tool JSON objects under one namespace**, not as scattered keys. Use the tool's own name as the key and the option object as the value (`hp-wallbuilder-opts`, `hp-linear`, `hp-measure`, `hp-dims-opts`). | §2.8 | S | CasaPlazAI already autosaves the plan to `localStorage` (round-1 §2.13); add sibling editor keys such as `casaplaza.tool.wall` / `casaplaza.tool.measure`. Read defensively (`try/catch` + defaults), exactly as this app does. |
| 3 | **One reusable "range row" widget** that renders `label: value` in the label itself and supports an optional paired number input, with the fill as a CSS variable. | §2.9 | S | The 0.5 m grid slider, wall height/thickness, furniture scale all become one component; it also gives you a free `--hp-fill`-style progress tint. |
| 4 | **Derive the snap label from the index** rather than storing a float: show `Snap to grid: 0.125 m` computed as `1/index m`. Offer a **fine preset ladder** (0.50 → 0.063 m) whose labelled default is the middle rung, with `0.5 m` available as the coarsest. | §2.3 snap mapping | S | CasaPlazAI's single 0.5 m grid is coarse for wall thickness and vertex nudging; a 1/n ladder is one array of labels plus one division, and it makes "how fine can I go" visible without a numeric field. |
| 5 | **Put a "grid / angles / magnet" triple under the wall tool**, defaulting to angles+magnet on and grid off, with the modifier keys named in the tooltip (*"hold Shift for the grid mid-draw"*, *"Alt: no snapping"*). | §2.5.1 | S–M | Direct improvement on the rectangle/polygon tools; snapping policy becomes user-visible and explainable. |
| 6 | **One "Snap/Settings" card that is always visible above the tool stack** (the level card here), holding global parameters (grid, wall height/thickness, level visibility) while per-tool copies of the same parameters mirror it. | §2.3, §2.2 | M | Keeps a single place for plan-wide settings; the mirror (`wbMirror` = 2.65/2.65) is the mechanism, and the sync is trivial because both read/write one observable. |
| 7 | **A `Dimensions in 3D` master switch with four dependent checkboxes** (walls+overall / openings / room areas / heights) that are disabled until the master is on. | §2.6.1 | S | Better than four independent toggles: it communicates causality and keeps the default quiet. Persist `{enabled, opts}` together like `hp-dims` + `hp-dims-opts`. |
| 8 | **Measure tool with a `Distance`/`Angle` segmented mode + an `aria-live` readout that also shows horizontal and height components**, and a "Keep in project" checkbox that decides whether the measurement is part of `plan`. | §2.6.1 | M | CasaPlazAI has measure; the horizontal/height split and the pin-to-plan flag are the two missing behaviours. |
| 9 | **A placeable "room by size" (width × depth + Place)** alongside free drawing. | §2.5.1 | M | A common request ("make me a 4×3 room") and cheap once a rectangle tool exists. |
| 10 | **Sun/site card in the View tab: time-of-day slider with sunrise/noon/sunset ticks, a date input, and three seasonal presets** — plus a "sun path diagram" panel behind one button. | §2.4 | M–L | Gives the 3D mode real value with almost no new geometry code, and the ticks make the slider self-explanatory. Put lat/long + time zone behind the button, not in the card. |
| 11 | **Wall "thickness/height" as a two-slider pair shared by the global settings and the wall tool.** | §2.3/§2.5.1 | S | Avoids two sources of truth: one model, two views. |
| 12 | **A "layers" pattern for the terrain/ground painter:** N identical slots, each a radio + texture thumbnail + UV scale + a vegetation select. | §2.5.6 | M | If CasaPlazAI ever paints floors/ground, this is the cheapest multi-layer UI; the identical-slot repetition is also a strong a11y win (predictable order). |

**Anti-patterns deliberately not recommended:** (a) building controls with `id`-less anonymous sliders (`hpr48900168`) — it makes them unaddressable for tests; CasaPlazAI should keep stable ids. (b) Leaving legacy controls in the DOM wrapped in a `hp-legacy-hidden` container so they appear in the accessibility tree while invisible (§2.4) — a screen-reader trap. (c) Most of the dock's controls write nothing at all (only 7 option objects persist); CasaPlazAI should decide per control whether it is a preference or plan data, and say so in the UI.

### 3.1 Where each idea lands in the CasaPlazAI schema

Reading `~/dsh-workspaces/rea2-shared/casaplazai-schema.md` (read-only), the dock's split between *editor preference* and *plan data* maps almost one-to-one onto the schema's split:

| Dock control / behaviour | CasaPlazAI target | Note |
|---|---|---|
| Wall height / wall thickness sliders (level card + wall builder, mirrored) | **`FloorplanData.wallHeight` / `.wallThickness`** (top-level, validated `> 0`) | These are *schema* fields, so "persist the tool setting" is really "edit the plan". Idea 11's shared slider should write those two fields, not a third editor key. |
| Snap-to-grid ladder (index → 1/n m) | **`casaplaza.snap.settings.v1`** — already declared out-of-schema ("grid pitch + master switch") | Idea 4 needs no schema change: it is purely a richer editor preference. The `.v1` suffix is the same versioned-key convention as here. |
| `Dimensions in 3D` + its four families (`hp-dims`, `hp-dims-opts`) | **Measurement annotations** — already "persisted under their own key" | Idea 7 should extend that existing key with an `{enabled, walls, openings, rooms, heights}` shape, mirroring the dock's split into a master + dependents. |
| "Keep the measurements in the project" (`hp-measure.pin`) | same measurement key, `pin` flag | A measurement is either transient UI or part of the saved set; the dock makes that a checkbox — recommend the same explicit flag. |
| Wall height as a *per-wall* value | **`Room.wallsOverride[{segmentIndex, height}]`** | The dock keeps one session-wide wall height (2.65 m) with no per-wall override and no persistence; CasaPlazAI treats a per-wall height as schema data keyed by `segmentIndex`, so the UI must be an edit on the room polygon, not a tool slider. |
| Hip roof / gable roof one-click buttons | **`Room.roofs[{segmentIndex, leanDeg}]`** (topmost floor only; ridge derived) | The dock offers two one-click roofs with no per-segment choice (and no `leanDeg`); the schema's model is per-segment lean with composition rules — a good example of *not* copying the competitor's UI verbatim. |
| Material U/V scale, angle, metallic, IOR, roughness | **`Room.floorTexture` is only a 5-value enum** | The dock's PBR/material panel has no schema counterpart today; treat it as out-of-scope for v1 and keep it out of `FloorplanData` unless a `materials` extension is designed through `migrate.ts`. |
| Furniture "room by size *(width × depth)* + Place" | **`FurnitureItem.footprint` + `rotationDeg`** | The `footprint` is already an `[a, b]` extent pair, so the dock's width/depth fields map directly onto it; `rotationDeg` covers the orientation. |

**Net recommendation:** adopt the dock's *UI pattern* (toggle-expands-in-place, one range widget, labelled readouts) but keep CasaPlazAI's stricter separation — preferences (`casaplaza.*` keys) versus plan data (`FloorplanData`) — because the schema already draws that line.


## 4. Unknowns

0. **Scope note:** the material between [OBSERVED] and the following is entirely this job. **OBSERVED** means it was read from a live DOM, from the raw `app.php` HTML, or from the page's own script; **DOCUMENTED** would mean the vendor's published docs (the site publishes none for the dock) and **INFERRED** means reasoning from names/behaviour. Everything in §2 is OBSERVED; the only INFERRED statements are the unit semantics of terrain strength, the 2D-planner handshake, and the terrain-brush radius meaning, listed below.

1. **Effect of each *Build* toggle inside the 3D scene was not executed** — I toggled them and confirmed the sub-panel expansion and the storage writes, but I did not draw walls/terrain and watch meshes appear. Where a tool has a scripted entry point it is listed in `window.HP3D` (`buildWall`, `wallBuilder`, `buildSlab`, `buildRoof`, `terrainExport`, `applyTexture`, …) but I did not drive them.
2. **`Current floor` slider is built `hidden`; the visible level switcher is elsewhere** (top bar / status bar per round 1). I did not verify how the level card's copy stays in sync after switching floors from the top bar.
3. **The terrain radius/strength and brush radius/strength sliders were only read, not exercised**, so their exact unit semantics ("radius 5 = 5 m?" and the sign convention on strength) are **INFERRED** from the labels.
4. **`hp-skirting.depth` (1.5)** has no visible control in the dock sub-panel — it is written by the editor when skirting is built. Whether the value is user-editable elsewhere is unknown.
5. **Puter.js AI paths and the paint-texture library modal contents** were not opened (consistent with round 1's "AI features were not executed").
6. **The Sun study panel's ground-hours computation was not run** (`Compute the map`), so the reported accuracy/cost of the "sampled every 20 minutes" wording is unverified; the panel itself was opened and its controls enumerated.
7. **Whether the persisted option objects survive a version change** (i.e. the app's migration/defaulting strategy) is unknown; all reads are wrapped in `try/catch` with literal defaults.
8. **The 2D planner iframe at `/2D-Planner/index.php`** was not opened in this job; round 1 also left it unopened. Consequently the `pushTo2d` / `extension-floorplanner-currently-editing` handshake is only inferred from names.
9. **Deobfuscation caveat:** `scripts/deob.js` reproduces the string-array rotation and alias substitution, and the modules whose strings I quote (`hp-panels`, `hp-measure`, `hp-dims`, `hp-sun`) came out coherent (real localStorage keys, real i18n key names, real `data-*` attributes that match the live DOM). The large `hp-editor` bundle still shows a few mis-mapped strings after substitution, so **no claim in this report rests on `editor__hp-editor.deob.js` alone** — every key and label quoted here was re-confirmed in the live DOM or in the static `app.php` HTML.
10. **The eighth, unlabelled Material range row** (`hp-range-nolabel`, 0–1, default 0) has no `data-i18n` label and no paired number input even in the live DOM; whether it is bound to a material property at all, or is a leftover, is unknown. The seven named rows in §2.7 *were* read directly from the live inputs, so their defaults are solid.
