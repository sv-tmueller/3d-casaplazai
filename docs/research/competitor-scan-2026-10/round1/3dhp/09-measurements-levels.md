# 3D House Planner — measurements & multi-storey plans

Competitor research for **CasaPlazAI**. Subject: **3D House Planner**, <https://www.3dhouseplanner.com/> (browser-based, no login).
Research method: live page captures with `rea capture-browser-scenario`, the site's own server-rendered internationalisation maps, and the JavaScript the site shipped to my browser (`js.php?f=editor/*`, `js.php?f=planner/*`), de-obfuscated locally.

**Evidence tags.** `OBSERVED` = seen in a captured page/DOM/accessibility tree, or read out of JavaScript the site itself served me. `DOCUMENTED` = stated by the vendor on a page I fetched. `INFERRED` = my reasoning beyond what was directly observed.
**Note on code.** 3D House Planner is proprietary (footer: *"© 2022-2026. All rights reserved."*). All statements below describe behaviour, identifiers and UX patterns in my own words; decoded source is kept locally only as evidence and is not reproduced here.

Local evidence: `evidence/`, `screenshots/`, `bundles/`, `readonly/`, `scenarios/`, `sources.json`.

---

## 1. Summary

- **Two separate measuring systems, both client-side.** A free-hand *Measure* tool (distance **and** angle, pinnable, snapping to corners of walls/openings/floors/objects) and an automatic *Dimensions in 3D* overlay with four independent categories — **Walls and overall size**, **Doors and windows**, **Room areas**, **Heights** (`OBSERVED`, `hp-measure`, `hp-dims`, `evidence/app-php-i18n.json`).
- **Dimensions are one line-system plus HTML labels, not 3D text.** Babylon `CreateLineSystem("hpDims")` draws all dimension lines; each value is a `<span class="hp-dim-label">` projected to screen space each frame, with box-overlap rejection and off-screen hiding (`OBSERVED`, `hp-dims`).
- **Metric/imperial is a single global switch** (`HPUnits`: `'m'`/`'ft'`, factor `3.28084`, localStorage `hp-units`) that drives the 3D scene and is pushed into the 2D planner; in `ft` mode lengths render as **feet-inches** (`8'-8"`) and areas as `ft²` via `10.7639` (`OBSERVED`, `hp-app`, `hp-dims`).
- **Levels are an integer index with one uniform storey height and no per-level elevation.** `setLevel(n)` clamps to `0..50`, `levelBase(n) = floorHeight × n` with floor-to-floor height from project settings (default **2.65 m**), and "Visible floors" hides everything above a Y threshold rather than offering per-level checkboxes (`OBSERVED`, `hp-editor`, `hp-panels`).
- **Multi-storey authoring is a "Duplicate level" dialog** (category checkboxes for walls/openings/floors/finishes/objects/stairs/roofs, target level or a new level above, Add vs Replace) and **stairs/roofs are handled as derived geometry**: a stair object recognised by name auto-cuts a hole in the slab above, while roofs come from Hip/Gable tools, follow wall edits, and their top is measured for the height dimension (`OBSERVED`, `hp-copy`, `hp-stairs`, `hp-dims`).

---

## 2. Findings

### 2.1 The free-hand Measure tool (3D scene)

- The tool is a switch in the **"Measure, copy and paint"** tab of the left dock; the panel is `#hpMeasureOpts` and the tool is built at runtime by `hp-measure` (`OBSERVED` — accessibility tree `evidence/s5-7-measure-panel.txt` shows tab panel contents *Measure* / *Material brush*; markup `id="hpMeasureOpts"` in `evidence/app.php.html` with the comment *"tape, pinned measurements, automatic dimensions and statistics: built by hp-measure.js"*).
- **Two modes**: `'dist'` (Distance) and `'angle'` (Angle). State is persisted in localStorage key **`hp-measure`** as `{mode, pin}` (`OBSERVED`, `hp-measure`).
- **Distance mode** shows a live readout of the total length plus a secondary line: *"horizontal `<x>` · height `<y>`"* — i.e. the same pick yields total, horizontal component and vertical component (i18n `measure.horizontal`, `measure.height`, `measure.dist`; `OBSERVED` in `hp-measure` and `evidence/app-php-i18n.json`).
- **Angle mode** needs three clicks; **the second point is the vertex**, and the angle is reported in degrees with one decimal and a `°` suffix (`measure.startAngle` = *"Click three points: the second one is the vertex"*; `OBSERVED`, `hp-measure`).
- **Snapping**: the hint text is *"Snaps to the corners of walls, openings, floors and objects. **Shift**: along an axis · **Esc**: cancel"*. A screen-space marker element (`div.hp-measure-marker`, class `hp-snapped` when snapped) follows the cursor (`OBSERVED`, `hp-measure`).
- **Pinning**: *"Keep the measurements in the project"* (`measure.pin`). Pinned measurements go into a list with per-item remove and *"Remove all measurements"* (`measure.remove`, `measure.clear`), and pinning calls the BIM module's `markDirty` — i.e. pinned measurements become project data that participates in change tracking/undo (`OBSERVED`, `hp-measure`).
- **Measurements can be serialised**: the module exposes `state()` / `setState()` that validate `{kind:'dist'|'angle', p:[[x,y,z],…]}` arrays — the natural hook for project save/load (`OBSERVED`, `hp-measure`).
- `INFERRED`: because points are stored in 3D world coordinates, a distance measured in the 3D view is a true sloped length, and the horizontal/height split is derived, not entered separately.

### 2.2 The automatic "Dimensions in 3D" overlay

- Module `hp-dims`, global `window.HPDims`. Enable flag persisted as localStorage **`hp-dims` = `'1'`**; options persisted as **`hp-dims-opts`** (`OBSERVED`, `hp-dims`).
- Four options, default state: **`walls: true`, `openings: false`, `rooms: false`, `heights: false`**. Their labels in the interface are `dims.walls` *"Walls and overall size"*, `dims.openings` *"Doors and windows"*, `dims.rooms` *"Room areas"*, `dims.heights` *"Heights"*; the master label is `dims.toggle` *"Dimensions in 3D"* (`OBSERVED`, i18n map + `hp-dims`).
- Rendering: all dimension lines are merged into one Babylon `MeshBuilder.CreateLineSystem("hpDims", {lines, colors})`, `isPickable = false`, `renderingGroupId = 1` so it draws over the model. Colour is a single `Color4(0.11,0.14,0.19,1)` (`OBSERVED`, `hp-dims`).
- **Labels are DOM elements.** A single `div.hp-dims-layer` is appended to `<body>`; each dimension creates a `span.hp-dim-label` containing the formatted value. On every scene render the 3D anchor is projected with `BABYLON.Vector3.ProjectToRef(...)`; the label is positioned by `style.transform = translate(x,y) translate(-50%,-50%)` (`OBSERVED`, `hp-dims`).
- **Label de-cluttering** is explicit: a screen-space box is built as `3.3 px × text length + 6 px` wide and `±9 px` tall; labels off-screen, behind the camera, or intersecting an already-placed box get `display:none` (`OBSERVED`, `hp-dims`).
- **Overall size**: for each level it takes the world bounds of the walls, draws the outline dimension chain, and adds an **overall width and depth** dimension plus a **vertical height dimension** from `levelBase(0)` to the top; the vertical one is only drawn if the top exceeds the base by more than `0.05` (`OBSERVED`, `hp-dims`).
- **Heights including roof**: when computing the top of the building the module iterates `listElements({kinds:['roof']})`, takes the maximum `worldBounds(...).max.y` over all roof elements, and draws a vertical dimension with that value — i.e. roof height is measured geometry, not a roof parameter (`OBSERVED`, `hp-dims`).
- **Reflow triggers**: `created`, `deleted`, `moved`, `imported`, `level`, `ready`, `projectLoaded`, `projectCleared`, plus `HPUnits.onChange`; rebuilds are debounced (≈150 ms) (`OBSERVED`, `hp-dims`).
- **Length formatting** is shared: `HPDims.format(v)` — in metric `v.toLocaleString(lang, {min/maxFractionDigits: 2}) + " m"`; in feet `Math.round(v/0.0254)` converted to `floor(inches/12) + "'-" + inches%12 + '"'` (`OBSERVED`, `hp-dims`).
- **Area formatting** is `HPDims.formatArea(v)`: `(ft ? 10.7639*v : v).toLocaleString(lang, {2,2}) + (ft ? " ft²" : " m²")` (`OBSERVED`, `hp-dims`).
- `INFERRED`: because the overlay is viewport-space HTML, it reads well at any zoom and stays crisp, but it can never be baked into a 3D/PNG export as drawn dimension lines; the separate DXF/PDF/SVG export path is what carries dimensions out of the app.

### 2.3 Metric / imperial

- Central singleton **`HPUnits`** defined in `hp-app`: names `'m'` / `'ft'`, factor `1` / **`3.28084`**, persisted under localStorage key **`hp-units`** (`OBSERVED`, `hp-app`).
- Public surface: `name`, `factor`, `set(u, {from2d})`, `toggle()`, `pushTo2d()`, `refreshLabels()`, `onChange(cb)` — a small observer pattern used by the dims, measure, BIM, linear, sync and UI modules (`OBSERVED`, `hp-app` and the `HPUnits.onChange(...)` call sites in the other modules).
- **3D → 2D propagation**: `pushTo2d()` reaches into the 2D planner iframe, sets `#unitSelector`, tags it with `dataset.hpFrom3d='1'` and dispatches a `change` event, so the 2D planner updates without echoing back (`OBSERVED`, `hp-app`).
- **Relabelling on switch**: numeric readouts are recomputed, e.g. `#numvalue = (floorheight × factor).toFixed(2) + ' ' + unit`, `#numvalue2 = (floorsize × factor).toFixed(0)`; grid and wall sliders are re-notified (`OBSERVED`, `hp-app`).
- **Project units are authoritative on load**: the BIM module reads the project's `units` field (`'m'`/`'ft'`) and calls `HPUnits.set(...)` if it differs from the current switch (`OBSERVED`, `hp-bim`).
- **First-run Project settings dialog** offers a *Units* radiogroup with *Meters (m)* / *Feet (ft)*, next to *Floor-to-floor height* (slider, default **2.65 m**) and *Floor plan size* (slider, default **100 m**) (`OBSERVED` — accessibility `evidence/s4-4-boot2.txt`; labels `setup.meters`, `setup.feet`, `setup.floorHeight`, `setup.floorSize`).
- **The footer/toolbar has a one-click toggle** whose accessible name is *"Units of the 3D and of the 2D plan: click to switch meters / feet"* and whose visible text is the current unit (`m` in the capture) (`OBSERVED`, `evidence/s5-5-scene.txt`).
- **2D planner units object**: `units = {name:'m', factor:1}` with `meter = 60` (pixels per metre) — so the 2D canvas has a fixed internal scale with one world unit per metre and area computed in metre² units before conversion (`OBSERVED`, `planner-main`).
- **2D formatting**: `formatLength(v) = (v/meter × factor).toFixed(2) + ' ' + name`; `formatArea(v) = (v/(meter²) × factor²).toFixed(2) + ' ' + name + '²'`; the UI updates every `.unit-label` and `.area-unit-label` node, i.e. the `²` suffix is appended to the unit name rather than using a separate area unit (`OBSERVED`, `planner-main`).
- **2D units UI**: top-bar button *"Units: meters / feet"* (`top.units`), plus a settings group with `settings.units` *"Units"*, `settings.unitsHint` *"Choose measurement units for labels and tools"*, `settings.gridSize`, and `settings.snap` with hint *"Lock wall drawing to grid intersections"* (`OBSERVED`, `evidence/2dplanner-i18n.json`).
- `INFERRED`: a single global switch with one conversion factor is much cheaper to keep consistent than per-tool units, and it is the pattern CasaPlazAI should copy before adding imperial support.

### 2.4 Levels / floors

- Toolbar control: a `div.hp-level` with `title` = *"Current level: new walls, floors and objects go here"*, containing `span.hp-level-label`, button `.hp-level-down` (aria-label `-`), `span.hp-level-value`, button `.hp-level-up` (aria-label `+`) (`OBSERVED`, `hp-ui`).
- **Camera/level model** (`hp-editor`):
  - `floorHeight()` = value of `#floorheight` (project setting), fallback **2.65**.
  - `currentLevel()` = `Math.round(levelSlider.value)`.
  - `setLevel(n)` = `Math.max(0, Math.min(50, Math.round(n)))` — hard cap of **50 levels** (`0x32`).
  - `levelBase(n) = floorHeight() × (n ?? currentLevel())` — a single uniform storey height for the whole project.
  - Level changes emit an event `{type:'level', level}` consumed by the sync and dimension modules (`OBSERVED`).
- **"Floors & grid" panel** (label `gui.scene`), in the *View and light* tab:
  - *Visible floors: up to {n}* — slider `min:1, max:50, step:1, value:50`; the header text is built with the literal `50` (`OBSERVED`, `hp-panels`; accessibility `evidence/s5-5-scene.txt` shows `slider "Visible floors: up to 50": "50"`).
  - The visibility rule is a **height cut**: meshes whose absolute `position.y > floorHeight × sliderValue + 0.001` are hidden, excluding the grid, terrain, skybox and child meshes (`OBSERVED`, `hp-editor`). So the slider means "show everything below storey N", not a per-storey checkbox list.
  - *Snap to grid: {v}* — slider `min:2, max:16, step:2, value:8`; the displayed value is `(1/sliderValue × factor).toFixed(3)` and the grid material's `gridRatio` is set to `1/sliderValue`. Default 8 → **0.125 m**; the range thus covers 0.5 m down to 0.0625 m. Header text is recomputed on `HPUnits` change so it shows metres or feet (`OBSERVED`, `hp-panels`, `hp-editor`; accessibility confirms `Snap to grid: 0.125 m`).
  - Ground grid: Babylon `Mesh.CreateGround("ground", floorSize, floorSize)` with a `GridMaterial` at `gridRatio = 0.125` (`OBSERVED`, `hp-editor`).
  - A **Duplicate level…** button sits in this same panel (`copy.level.btn`), and the panel comment says copies of a level belong in the Floors card (`OBSERVED`, `evidence/s5-5-scene.txt`, `evidence/app.php.html`).
- **Duplicate level dialog** (`hp-copy`, element `#hpLevelCopyDialog`):
  - Fields: **From** level select, **To** level select whose first option is *"New level above ({name})"* = `max(existing levels)+1`, followed by the existing levels except the source; **What to copy** = a list of checkboxes (`OBSERVED`).
  - The category list is data-driven, each entry an `{id, icon, defaultOn, test(element)}` record (`OBSERVED`, `hp-copy`):
    | id | label (`copy.group.*`) | matches | default |
    |---|---|---|---|
    | `walls` | Walls | kind `wall` or `frame` | **on** |
    | `openings` | Doors and windows | kind `door` or `window` | **on** |
    | `floors` | Floors | kind `slab` | **on** |
    | `finishes` | Skirting and cornices | kind `skirting` or `ceiling_trim` | **on** |
    | `objects` | Furniture and objects | kind `object`, not a stair | off |
    | `stairs` | Stairs | kind `object`, is a stair | off |
    | `roofs` | Roofs | kind `roof`, excluding the generated `autoRoof` mesh | off |
  - If the destination already holds elements of the ticked kinds, the dialog warns *"{name} already has {n} elements of these kinds."* and offers **Add to them** / **Replace them** (`copy.level.add`, `copy.level.replace`) (`OBSERVED`).
  - On confirm it copies with `dy = levelBase(to) − levelBase(from)`, assigns the new `level` to each copy, switches the editor to the destination level and toasts *"{n} elements copied to {name}"* (`OBSERVED`, `hp-copy`).
  - Intro copy: *"Copy walls, openings and floors of a level to another one, for example to start the upper floor."* (`copy.level.intro`) (`OBSERVED`).
- **Element-level level moves** also exist: *"Copy to another floor"* (`gui.copyTitle`), *"Paste to floor {n}"* (`gui.pasteTo`), and a *"Same place on another level"* section in the element copy popover with a level select and paste button (`copy.el.toLevel`) (`OBSERVED`, `hp-copy`, i18n).
- **2D planner mirrors the level control**: it builds a `.fp-level` group with −/+ buttons and a value span; the down button is disabled at level ≤ 0 and the up button at level ≥ 50; the sync badge shows `level N` when syncing, using `sync.levelDown`/`sync.levelUp` and `ui.level` labels (`OBSERVED`, `planner-bridge3d`; accessibility `evidence/s5-5-scene.txt` for the 3D toolbar).
- **Level metadata in BIM**: `bim.storey` *"Level {n}"*, `bim.levelName` *"Level name"*, `bim.storeyHeight` *"Storey height"*, `bim.elevation` *"Elevation"*, `bim.orthoHeight` *"Orthogonal height"*, `bim.groupBy.level`; the schema calls levels *Storeys* (`bim.storeys`) (`OBSERVED`, i18n map).
- **Export granularity follows levels**: `io.level` *"Level"*, `io.levels`, `io.allLevels` *"All levels"*, `io.importLevel` *"Import onto level"*; description strings say DXF is *"CAD plan of one level"* and SVG is *"Vector plan of one level (rooms, dimensions)"*, with the note *"The current level, drawn by the 2D planner."* (`io.desc.dxf`, `io.desc.svgPlan`, `io.note.svg`) (`OBSERVED`).
- **Marketing cap**: the landing page advertises **"50 floors per project"** (`DOCUMENTED`, <https://www.3dhouseplanner.com/>), which matches the `0..50` clamp found in the code (`OBSERVED`).
- `INFERRED`: the model is a single "level index + uniform storey height" stack. That is simple and fast, but it cannot express basements with different heights, split levels or a mezzanine without hacks — and the "Visible floors" height cut means you cannot, for example, show ground floor and level 2 while hiding level 1.

### 2.5 Room areas, labels and schedules

- **2D room properties** include a dedicated area block (`OBSERVED`, `evidence/2dplanner-i18n.json`): `rs.area` *"Area"*, `rs.areaLabel` *"Floor area"*, `rs.areaOptions` *"Area options"*, `rs.showArea` *"Show area on the plan"*, `rs.countArea` *"Count in the total area"*, `rs.ignoreArea` *"Leave out of the total area"*, `rs.realArea` *"Real area, if you know it"* (manual override), `rs.roomType` *"Room type or name"* with placeholder *"Search a type or type a name"*.
- **Room labelling** is explicit user data: `text.label` *"Text"*, `text.roomNames` *"Room names…"*, `report.label` *"Label"*, `report.noLabel` *"This room has no name: name it (e.g. Bedroom) to apply the rules of its type."*, `report.roomN` *"Room no. {n}"*, `report.roomCount` (`OBSERVED`).
- **Room types are a large fixed enum** — `roomType.1`…`roomType.138` — including *Lounge, Kitchen, Bedroom 2/3/4/5, Bathroom, Toilet, Hall, Balcony, Terrace, Corridor, Garage, Attic, Loft, Mezzanine, Cellar, **Staircase**, **Elevator**, Pantry, Foyer, Study, Gym, Roof* etc. (`OBSERVED`, `evidence/2dplanner-i18n.json`; 136 named types + numbered duplicates).
- **Area math is done on room polygons**: the 2D editor stores a room's `way` (polygon), then copies `area`, `inside`, `coords`, `coordsOutside` from the computed polygon set; it detects when a room's polygon changes once (diff of vertex arrays) (`OBSERVED`, `planner-floorplanEditor`).
- **Area conversion for room slabs in 3D**: when a slab element carries an `area`, the bridge multiplies it by `factor²` using the shared units object before display (`OBSERVED`, `planner-bridge3d`).
- **Quantities with named keys**: `bim.q.Area, Perimeter, Length, Width, Height, Depth, Thickness, Radius, Count, OpeningArea, GrossFootprintArea, GrossSideArea, InnerSideArea, OuterSideArea, NetSideArea, GrossVolume, NetVolume, Volume, Cut, Fill` (`OBSERVED`, i18n map). This is an IFC-style quantity vocabulary.
- **Schedules**: `bim.sched.rooms` *"Rooms"*, `bim.sched.walls`, `bim.sched.doors`, `bim.sched.windows`; `sheet.areas` *"Area schedule"*, `sheet.areaUnit` *"Area (m²)"*, `sheet.total` *"Total floor area"*, `sheet.subtotal`, and `io.desc.csv` *"Quantities and costs (spreadsheet)"* (`OBSERVED`). The landing page says *"Areas, volumes, schedules and budget in CSV"* (`DOCUMENTED`).
- **Norm/model checks that consume the measurements** (`OBSERVED`, i18n map): `bim.issue.normArea` *"{name}: {v} m², below the {min} m² minimum"*, `normHeight` *"ceiling height {v} m, under {min} m"*, `normWidth`, `normDoor`, `normDoorEntrance`, `normEgress` *"no window can serve as emergency escape ({area} m² clear, sill at most {sill} m)"*, `normLight` *"windows are {v} % of the floor area; at least {min} % (about {need} m²)"*, `normCorridor`, `normFar` (floor area ratio), `normCoverage` (lot coverage %), `floating` *"{name} is floating {v} m above its level."*, `noDoor` *"Level {n} has rooms but no door."*, `thinWall`, `shortWall`, `overlap`, `openingOverlap`, `openingNoWall`. The landing page summarises this as *"Model check: overlaps, missing hosts, empty levels"* (`DOCUMENTED`).
- `INFERRED`: the app treats area as three different numbers — computed polygon area, an optional user-entered "real area", and an include/exclude flag for the total — which is exactly the trio that avoids arguments between a drawn plan and a survey.

### 2.6 Stairs

- **Recognition, not a separate element type**: the stairs module decides an object is a stair from element metadata (a `stair` flag or `aiType === 'stairs'`) or from a multilingual name regex covering `stair|staircase|escada|escalera|escalier|treppe|scala|лестниц|楼梯|階段|계단|ladder|escalator`, minus a small exclusion list for pool ladders and step stools (`OBSERVED`, `hp-stairs`).
- **Auto-fit to the storey above**: for a stair element not yet fit, it measures the object's world bounds, reads `levelOf(element)`, and computes the target top as `levelBase(level + 1) + 0.06`; it then looks for `slab` elements on `level+1` around the stair centre and cuts/places the stair there, marking the element `stairFitted` once successful (`OBSERVED`, `hp-stairs`).
- **The floor opening is real geometry**: it builds a hole polygon with `BABYLON.MeshBuilder.ExtrudePolygon("stairHole", …)` and derives a cut mesh (`stairCut`) from the slab's vertex data, preserving sub-material indices — i.e. the slab is locally removed and the stair passes through (`OBSERVED`, `hp-stairs`).
- **Refit triggers**: the module re-runs on the `level` event, and rebuilds fully on `projectLoaded`/`imported`; other element events are debounced (≈60 ms) (`OBSERVED`, `hp-stairs`).
- **Stairs are a separate copy category** in the Duplicate-level dialog (off by default) and are excluded from the generic *Furniture and objects* category, so a duplicated upper level does not silently double the staircases unless asked (`OBSERVED`, `hp-copy`).
- `INFERRED`: this is a pragmatic shortcut. It avoids modelling stair treads as parametric data (riser/tread count, headroom check), and instead leans on catalog geometry plus a boolean hole.

### 2.7 Roofs

- **Roof tools** live in the *Build* tab: tiles labelled *Roof*, *Roof edges* (with −/+, value **4**), *Hip roof*, *Gable roof* (`tool.roof`, `tool.roofEdges`, `tool.hipRoof`, `tool.gableRoof`) (`OBSERVED`, `evidence/s5-9-build-panel.txt`; i18n map).
- **Roof height is measured, not parametric**: the dims module enumerates `kinds:['roof']` and takes the highest `worldBounds().max.y` to draw the overall vertical dimension from `levelBase(0)` (`OBSERVED`, `hp-dims`).
- **Sync**: `sync.roof` *"Roof follows the walls"* and `sync.slabs` *"Floors follow the rooms"* — roof geometry is regenerated from the wall outline when walls change (`OBSERVED`, i18n map; the `sync` module registers `roof`/`slabs` behaviours and the `hp-earcut`-based polygon extrusion is present in the editor module).
- **Copy semantics**: `copy.group.roofs` copies roofs between levels but excludes the generated `autoRoof` mesh, so only user-placed roofs travel and the automatic one is regenerated (`OBSERVED`, `hp-copy`).
- **Roof-adjacent quantities**: `bim.typeSeed.roof` *"Ceramic tile roof"*, `bim.mat.roofTile`; the efficiency module reports `eff.pv.area` *"Usable roof area"* and `eff.rain.area` *"Catchment area (roof)"* (`OBSERVED`).
- `INFERRED`: roofs are derived/booleans over the wall footprint rather than a storey of their own, which is why a roof is copied as a category but regenerates automatically by default.

### 2.8 Shell, project settings and persistence (context)

- **Editor entry gate**: `app.php` begins with `window.location.href = 'index.php'`. A fresh headless profile navigating straight to `/app.php` landed on the marketing page, while clicking the site's own *"Start designing — free"* CTA loaded the editor (`OBSERVED`, `evidence/s4-2-enter.html` vs `evidence/s5-5-scene.txt`). `INFERRED`: a session/referrer gate against deep-linking the editor, and my first attempts were affected by it.
- **Editor toolbar** (accessibility): project-name box, *Unsaved changes*, History group (Undo/Redo), view buttons *3D / Walk / Top / 2D plan*, **Level −/0/+**, *Frame all*, *File*, *Catalog*, render mode *Balanced*, *AI assistant*, *BIM*, *Help*, *Full screen*; footer *Tools*, *Nothing selected*, **`2D⇄3D`**, the units toggle (`m`), FPS, *Support*, `EN` (`OBSERVED`, `evidence/s5-5-scene.txt`).
- **Left dock** has three tabs: *View and light*, *Build*, *Measure, copy and paint* (`OBSERVED`).
- **Project settings on first run**: Project name (optional), *Floor-to-floor height* `2.65 m` with hint *"Vertical distance between two levels, slab included. New walls use this height."*, *Floor plan size* `100 m` with hint *"Side of the square ground and grid you will build on."*, *Units* Meters/Feet, then *Start designing* (`OBSERVED`, `evidence/s4-4-boot2.txt`, i18n `setup.*`).
- **Preview-only changes during setup**: the height label is recalculated live from the slider (`#numvalue`), so the number shown is derived, not stored separately (`OBSERVED`, `hp-app`).
- **Persistence**: *"Stored in this browser only (IndexedDB) – export a project file to keep a copy."* (`bim.storage`), crash-recovery copy semantics (`bim.restoreFailed`), *"Saved in this browser"* / *"Saving…"* / *"Unsaved changes"* (`ui.*`), `Ctrl+S` to save, and `io.desc.project` = *"Complete editable project, reopen it here"* (`OBSERVED`; landing page: *"Projects, autosave and crash recovery live in your browser storage. No account, no upload"* — `DOCUMENTED`).
- **Export surfaces relevant to measurement**: `io.desc.dxf` *"CAD plan of one level"*, `io.desc.svg`/`svgPlan` *"Vector plan of one level (rooms, dimensions)"*, `io.desc.pdf` *"Plans, sections and elevations with title block"*, `io.desc.csv` quantities and costs, `io.desc.ifc` BIM exchange; PDF/sheets are produced **on the server from a copy of the model** (`io.serverNote` *"Made on our server from a copy of the model; nothing is stored."*, `io.tooLarge` 25 MB, `io.serverDown`) — i.e. that part is *not* purely client-side (`OBSERVED`).
- **Sheet/scale machinery**: paper list **A4, A3, A2, A1, A0, Letter (8.5 × 11 in), Tabloid (11 × 17 in), ARCH D (24 × 36 in)**; `io.sheet.scale` *"Scale"*, `io.sheet.auto` *"Automatic (largest that fits)"*, `sheet.scaleShort` *"SCALE 1:{n}"*, sheet contents *cover and area schedule / floor plans / sections A-A and B-B / elevations / 3D view*, `sheet.plan` *"Floor plan — {level}"*, 8 elevation labels, and a title block with unit note `sheet.tb.units` *"Dimensions and levels in metres"* / `sheet.tb.unitsFt` *"Dimensions in feet and inches"* (`OBSERVED`, i18n map).
- **2D planner surface**: top bar with tools *Select, Walls, Divider, Arc wall, Joint, Doors, Windows, Stairs, Objects, Rooms, Measure, Text, Layers*; `tool.measure.tip` *"Measure: click the start, then the end point"*; `layers.measures` *"Show or hide wall measurements"* and `layers.angles`; `arc.measure` *"Radius {radius} · Arc {length}"*; snap feedback messages `msg.snapOn/Off`, `msg.gridOn/Off`, `msg.snappedToWall` *"Snapped to wall (hold Alt to place freely)"* (`OBSERVED`, `evidence/2dplanner-i18n.json`).
- **Grid in the 2D planner**: `DEFAULT_GRID_SIZE = 20` (px) with `meter = 60`, i.e. the default grid is 0.333 m on an internally metre-based canvas, adjustable via `settings.gridSize`; `GRID_PATTERN_BASE_SIZE` is used to rescale the grid pattern (`OBSERVED`, `planner-main`).
- **Language**: 10 interface languages (EN, PT, ES, FR, DE, IT, RU, ZH, JA, KO); switching keeps the project (`ui.langSwitching` *"Switching to {lang}… your project is kept."*) (`OBSERVED`).

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each is tied to a finding above. CasaPlazAI today has: rectangle + polygon rooms, 0.5 m grid snapping, shared walls, doors/windows, a small furniture palette, a measure tool, 3D walkthrough, PNG/JPEG export, localStorage autosave, and a single-workspace UI redesign in flight.

### Tier 1 — high value, low effort

1. **One global units switch with a single conversion layer** *(finding 2.3)*.
   Introduce a tiny `Units` module: `{ name: 'm'|'ft', factor: 1|3.28084 }`, one `formatLength`/`formatArea` pair, persisted under one localStorage key (e.g. `cp-units`), with an `onChange` listener list. Route **every** existing readout (measure tool, room areas, wall lengths, grid label, export captions) through it. Chip in the status bar showing the active unit and toggling on click, mirroring the competitor's *"Units of the 3D and of the 2D plan"* button. Because CasaPlazAI's plan is metric internally (0.5 m grid), this is nearly free and removes the need to touch any geometry code.

2. **Make the measure readout show the breakdown, and make measurements persistable** *(finding 2.1)*.
   CasaPlazAI already measures. Add the competitor's second line — *horizontal X · height Y* — computed from the same two picked points, plus an angle mode where the **second click is the vertex**. Add a "pin" checkbox with a small list of pinned measurements (value + delete + clear all), and serialise pinned measurements into the autosaved plan. This converts a throwaway readout into project data, and the horizontal/height split is the exact case users hit when measuring a sloped wall or a stair diagonal.

3. **Area labels on the plan, with include/exclude and a manual override** *(finding 2.5)*.
   Add per-room properties: *show area*, *count in total*, *leave out of total*, *real area (if you know it)*, and a room name. Render the label centred in the room polygon on the 2D plan, with the same collision-avoidance idea the competitor uses for 3D dimension labels (box per label, hide the ones that overlap). Also show a running *total floor area* for the level. This is the single highest-value measurement feature for a home-planning audience and it is additive to the existing room model.

4. **Per-category 3D dimension overlay with persisted options** *(finding 2.2)*.
   Add one "Dimensions" toggle with four sub-options defaulting on/off the way the competitor does (walls+overall on; doors/windows, room areas, heights off), stored as `{enabled, options}` in localStorage. Draw dimension lines as a single non-pickable line system, and render the numbers as DOM labels projected each frame (cheap, crisp, no font meshes) — with the box-overlap rejection so labels never pile up. This gives CasaPlazAI a "looks like a plan" 3D view with a fraction of the work of text geometry.

### Tier 2 — high value, medium effort

5. **Levels as an explicit index + one storey height, with a "show up to storey N" slider** *(finding 2.4)*.
   Add `level: 0..N` to every element, `levelBase(n) = floorHeight × n`, a Level −/+ control in the toolbar, and a storey height in project settings (suggested default **2.65 m** with the exact hint the competitor uses: *"Vertical distance between two levels, slab included"*). Add a visibility control. Recommendation: **improve on the competitor here** — offer a per-level checkbox list *in addition to* a height cut, because their pure height cut cannot hide a middle storey.

6. **"Duplicate level" dialog with category checkboxes and Add/Replace** *(finding 2.4)*.
   A dialog with From / To (the To list starting with *"New level above"*), a "What to copy" checkbox list — walls, doors & windows, floors, skirting/trim, furniture, stairs, roofs — with sensible defaults (structure on, loose furniture off), a warning when the destination already contains those categories, and an Add/Replace choice. This is the feature that makes multi-storey usable, and CasaPlazAI's element list already has the kinds to filter on.

7. **Persistent area/room schedules with CSV export** *(finding 2.5)*.
   Aggregate per level and per room: name, type, area, perimeter, count; plus totals. Export as CSV with the unit suffix driven by the units switch. The competitor's quantity vocabulary (`Area, Perimeter, GrossFootprintArea, NetSideArea, OpeningArea, Height`) is a good checklist for which columns matter, and *"Quantities and costs (spreadsheet)"* is the framing users understand.

8. **Stair object that cuts its own opening in the floor above** *(finding 2.6)*.
   Rather than a parametric staircase, treat stairs like the competitor: a catalog object that, once placed on level N, cuts a polygonal hole in the slab of level N+1 and snaps its top to that level's base. CasaPlazAI already has polygon rooms and walls, so a polygon hole in the room polygon (or a subtracted slab area) is a contained change. Add it as its own copy category so duplicating a level does not duplicate stairs.

### Tier 3 — valuable but larger

9. **Print/scale output: paper size, scale, title block, per-level plans** *(finding 2.8)*.
   `SCALE 1:{n}` plus a title block whose unit note switches between metres and feet-inches, one sheet per level, an area schedule sheet, and simple section/elevation views. The competitor offloads this to a server; CasaPlazAI is explicitly backend-free, so scope it to a client-side PDF/canvas sheet with plan + area schedule + title block first, and treat sections/elevations as later work.

10. **Norm/consistency warnings that reuse the measurements** *(finding 2.5)*.
    Non-blocking checks in a "Problems" list: room below a minimum area, ceiling height under a minimum, an element floating above its level (i.e. its base does not match `levelBase`), a room with no door, door clear width, window area as a percentage of floor area. Even three of these ("no door in room", "floating element", "ceiling too low") are cheap because all the inputs already exist once ideas 1, 3 and 5 land, and they make the tool feel like it understands buildings.

11. **Imperial-aware dimension formatting as feet-inches, not decimal feet** *(finding 2.3)*.
    When feet are selected, render lengths as `8'-8"` (the competitor's exact pattern) rather than `8.67 ft`, while keeping `ft²` for areas. Small change once idea 1 exists, and it is the notation North-American users actually read on drawings.

### Anti-patterns worth avoiding (learned from the competitor)

- **Do not make the storey height global and immutable.** Their `levelBase = floorHeight × n` cannot express a taller ground floor, a basement or a split level. A per-level height with a project default is barely more work and much more honest.
- **Do not hide floors purely by height.** Their "Visible floors" slider is a Y-threshold; you cannot isolate level 2 while hiding level 1. Prefer per-level visibility flags.
- **Do not gate the editor behind a session/referrer trick.** Their `app.php` bounces cold navigations to the landing page, which breaks deep links and made their own editor URL look broken in a fresh profile.
- **Do not let an export depend on a server** if the product promise is "no backend": their PDF/sheet pipeline is server-side with a 25 MB cap and an explicit "could not be reached" error.

---

## 4. Unknowns / what I could not verify

1. **The Measure tool was not exercised live end-to-end.** My scripted interaction with the "Measure, copy and paint" tab (`scenarios/s6-measure-panel.json`) did not complete within the research budget, so the panel's exact runtime layout, the readout's live behaviour and the pin list are `OBSERVED` only in the shipped JavaScript and the i18n map, not in a screenshot. The features themselves are certain (the strings and code are unambiguous); only the visual/runtime detail is inferred.
2. **Numeric room-area output was never seen.** I read the 2D planner's `formatArea` and the room-area fields, but I did not draw a room and read a displayed area, so rounding behaviour on screen (2 decimals everywhere, no unit-precision tiering) is `OBSERVED` in code only.
3. **Stairs were not placed.** The auto-fit and stair-hole logic is `OBSERVED` in code; I did not confirm visually how the hole looks, whether the fit has a tolerance for the object's real size, or what happens when no slab exists on the level above.
4. **Roof generation parameters are unknown.** I saw the Hip/Gable tools, the "Roof edges" slider value 4 and the "Roof follows the walls" sync, but not the pitch/overhang model or how roof height feeds the "Heights" dimension numerically. The relevant code lives in `hp-editor` / `hp-sync` beyond what my grep-and-read pass covered.
5. **"Floors & grid" exact snap steps.** The slider is `min 2 / max 16 / step 2` and the label is `1/value`, so the reachable labels are 0.5, 0.25, 0.1667, 0.125, 0.1, 0.0833, 0.0714, 0.0625 m. That is arithmetic from the code (`OBSERVED`), but I did not step the slider in a live session to confirm each label renders as I compute.
6. **Whether "Visible floors" also hides the *current* level's own contents** and how it interacts with editing hidden levels is not fully clear from the visibility predicate alone.
7. **CSV/PDF/SVG contents were not downloaded.** The column set, whether areas are exported in the unit setting, and the sheet layout are `OBSERVED` only as i18n keys and option markup; I did not trigger an export (the PDF/sheets path is server-side and I did not want to send a model to their server).
8. **IFC property sets for measurements/levels** are claimed on the landing page and hinted by `bim.storey`/`bim.elevation`/`bim.orthoHeight`, but I did not inspect an exported IFC file.
9. **The other editor routes** `index2.php`, `index4.php`, `index5.php` and `app2.php` appear in the sitemap but were not fetched, so I cannot say whether they are legacy editors or alternates with different measurement behaviour.
10. **Web search was unavailable** in this environment (search provider had no API key), so all external statements here come from pages I fetched directly with `web_fetch`/`curl`, not from third-party reviews.
