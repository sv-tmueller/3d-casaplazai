# 3D House Planner (3dhouseplanner.com) — how wall & room drawing works

Competitive research for **CasaPlazAI** (2D/3D web floorplanner, Vite/TS/Three.js, no backend, localStorage autosave).
Scope of the question: interaction model, snapping/magnetism, wall thickness & height, units, angle
constraints, room detection, vertex editing/reshaping, shared walls.

**Evidence tags used below**
- **OBSERVED** — I loaded or instrumented the live app and read the values (evidence file named).
- **DOCUMENTED** — taken from the vendor's own served text (UI strings, in-page tooltips, i18n dictionary)
  or a vendor URL; still the vendor's claim, not my measurement.
- **INFERRED** — my reading of shipped code structure or of UI text, not confirmed by executing the feature.

Job folder: `03-03-walls-rooms-drawing/`. All raw evidence is under `evidence/`; a per-file inventory is in
`sources.json`.

---

## 1. Summary (5 bullets)

1. **The wall tool is a "Wall builder" with four drawing modes** — Chain (continuous), Single, Rectangle
   (2 clicks ⇒ 4 closed walls) and Arc (bent walls) — plus a **wall-alignment switch** Center / Inside /
   Outside that decides whether the drawn line is the wall's centre-line, outer face or inner face.
   (**OBSERVED** markup + defaults in `evidence/app-ui.html`, `evidence/draw3.json`;
   **DOCUMENTED** vendor tooltips.)
2. **Three independent snaps** — Grid (points, also `Shift` mid-draw), Angles (15° steps with 0/45/90
   prioritised, *relative to the previous wall*) and Magnet (wall ends, onto walls/T-junctions, and
   alignment guides) — all three are persisted per user; angle+magnet default ON, grid default OFF.
   (**OBSERVED** `evidence/draw3.json`, 24-step `i*Math.PI/12` loop in `evidence/js-exported/js.php.7868a06179c38d65.js`.)
3. **Numeric precision while drawing is keyboard-driven**: click to place points, *type a number* for an exact
   length (then `Tab` for the angle), `Backspace`/`Ctrl+Z` undo the last point, `Enter`/double-click/right-click
   finish, clicking the first point closes the loop, `Esc` cancels then exits, `Alt` disables snapping.
   (**DOCUMENTED** vendor hint strings `wb.hint`, `wb.hintRect`, `wb.hintArc`, `wb.hintArcBend`, `wb.hintRoom`
   in `evidence/i18n-app.json`.)
4. **Dimensional model**: wall thickness is a 0.10–0.40 m slider (step 0.01, default **0.20 m**) and wall
   height a 0.05–2.65 m slider (step 0.05, default **2.65 m**); the project dialog separately sets
   *floor-to-floor height* 2–5 m (default 2.65) and *floor-plan size* 50–1000 m, with a **Meters/Feet** switch
   that the app describes as applying to "the 3D and the 2D plan" together.
   (**OBSERVED** `evidence/app-ui.html`, `evidence/draw3.json`, `evidence/probe3-globals.json`.)
5. **Walls are first-class objects with level + host relationships**, not just lines: each wall mesh carries
   `metadata.hp = {kind:'wall', level, curve?, thickness, height}`, openings record a *host wall* and a *sill
   height*, the editor runs a model check that flags duplicate, very thin and very short walls, and there is a
   separate 2D planner whose plan state is a per-level `{walls, rooms, polygons, objects}` document synced
   into 3D. (**OBSERVED** `evidence/draw3.json`, `evidence/draw4.json`; **DOCUMENTED** vendor strings
   `bim.issue.dupWall`, `bim.host`, `bim.sill`, `bim.thkWarn`, `sync.slabs`.)

---

## 2. Findings

### 2.0 How the editor is reached (context for everything else)

- The landing page is `/` (served as `index.php`); the 3D editor is **`https://www.3dhouseplanner.com/app.php`**,
  reachable from the "Start designing — free" / "Sketch now" buttons. `index3.php` is the **2D Planner**
  marketing page and its app URL `/2D-Planner/` is a stub that does
  `window.location.replace('index.php' + search + hash)` — i.e. *the 2D planner now lives inside
  `index.php`*. `index2.php` is the Material Editor, `index4.php` is a finance-calculator page.
  (**OBSERVED** `evidence/01-dom.html`, `evidence/2dplanner.html`, `evidence/index3.html`, `evidence/index4.html`;
  HTTP checks in the session log: `app.php 200`, `index.php 200`, `index2.php 200`, `index3.php 200`,
  `index4.php 200`, `index6.php 404`.)
- `app.php` boots a **Babylon.js 6.38.0 / WebGL2** scene onto `<canvas id="renderCanvas">` (full viewport),
  but only *after* the first-run **"Project settings"** dialog (`#modal1`) is confirmed with
  **`#definefloor` ("Start designing")**; the scene starts near-empty
  (`skyBox, ground, ground, ground2, myPlane, inpacttorus`). (**OBSERVED** `evidence/draw2.json`,
  `evidence/draw3.json`, console `BJS - Babylon.js v6.38.0 - WebGL2`.)
- Note for automation: `app.php` did **not** boot the editor on a cold profile in my first probe; loading
  another site page first (`index.php`) and then `app.php` made all editor globals appear.
  (**OBSERVED** `evidence/probe1.json` → no canvas/no globals vs `evidence/probe2.json` → `hasCanvas: true`.)

### 2.1 Interaction model of the wall builder

**OBSERVED** in the served editor markup (`evidence/app-ui.html`, section `#wallbuilderopts` inside the
"Build" tab, shown only while `#wallcheck` — "Wall builder" — is on):

- **Drawing mode** (`data-wb-mode`, segmented group, default `chain` — confirmed live in `evidence/draw3.json`):

  | mode | vendor tooltip (DOCUMENTED) |
  |---|---|
  | `chain` | "Continuous walls: each click ends a wall and starts the next one" |
  | `single` | "One wall per two clicks" |
  | `rect` | "Two clicks on opposite corners make 4 closed walls" |
  | `arc` | "Curved walls: click the start and the end, then move the mouse to bend the wall and click" |

- **Wall position on the line** (`data-wb-align`, default `center` — confirmed live):
  `center` = "The drawn line is the center line of the wall"; `inside` = "Walls inside the drawn outline
  (the line is their outer face)"; `outside` = "Walls outside the drawn outline (the line is their inner face)".
  This is the app's answer to *where the shared/party wall sits* when two rooms are drawn against each other.
- **Thickness** slider `#wbthick` — `min 0.1 max 0.4 step 0.01 value 0.2`, badge text "0.20 m" (OBSERVED live: 0.2).
- **Height** slider `#wbheight` — `min 0.05 max 2.65 step 0.05 value 2.65`, badge "2.65 m" (OBSERVED live: 2.65).
- **Snapping toggles**: `#wbgrid` "Grid", `#wbangle` "Angles", `#wbmagnet` "Magnet".
  OBSERVED live defaults: `grid=false, angle=true, magnet=true`.
- **Room by size**: `#wbroomw` × `#wbroomd` (number inputs, `min 0.5 step 0.1`, live default `4` × `3`) and
  `#wbroomplace` "Place" — "The room follows the cursor: click to drop it by its corner".
- All of this is **persisted**: the builder reads/writes one localStorage record (key literal
  `hp-wallbuilding` observed in the shipped bundle) containing `{mode, align, grid, angle, magnet, roomW, roomD}`,
  with `roomW/roomD` accepted only in 0.5…200. (**INFERRED** from shipped code; values themselves OBSERVED.)

**Placing points** (**DOCUMENTED**, vendor in-app hint bar, `wb.hint` — the same text is rendered by the tool's
HUD, cf. `wb.hint` strings in `evidence/i18n-app.json`):

> "Click: place points · Enter, double-click or right-click: finish · Click the first point: close · Type a
> number: exact length (Tab: angle) · Backspace / Ctrl+Z: undo · Esc: cancel, Esc again: exit · Shift: grid ·
> Alt: no snapping"

Mode-specific variants: `wb.hintRect` "Click two opposite corners · Type a number: width (Tab: depth) …";
`wb.hintArc` "Click the start of the arc, then its end · Type a number: exact chord length (Tab: angle) …";
`wb.hintArcBend` "Move the mouse to bend the wall, click to place it · Type a number: radius (Tab: bulge)";
`wb.hintRoom` "Move the room and click to drop it · Esc: cancel".

**OBSERVED** auxiliary readouts the builder drives (element ids present in `evidence/app-ui.html`):
`#distwindowdoorwall` / `#distancedoorwall` cards with `#textdistancewindowwall`, `#sliderdistancewindowwall`,
`#textdistancedoorwall`, `#sliderdistancedoorwall` — i.e. while dragging an opening the app shows its distance
to the wall end with sliders (i18n `tool.wallDist`: `"Wall⇔{v}"`, `dims.openings`: "Doors and windows").

**INFERRED (code structure, not executed)** in the wall builder module of `evidence/js-exported/js.php.7868a06179c38d65.js`:
the builder exposes a small API object — `state`, `chainLength`, `historyLength`, `options`, `setOption`,
`finish`, `undo`, `placeRoom`, `snapAt(x,y)` — and builds an SVG overlay containing an `hp-wb-guides` layer, a
`hp-wb-snap` layer with distinct glyphs for a *free* vs *snapped* point, a start marker, and a HUD with
`#…main` / `#…sub` hint lines plus two inline numeric fields (length / angle, `inA`/`inB` with `kA`/`kB`
labels). `setOption` re-renders the hint text from `wb.hint*` keys. This matches the DOCUMENTED hint strings.

### 2.2 Snapping and magnetism

- **Grid** — "Snap points to the grid (hold Shift for the same while drawing)". `Shift` is therefore a
  *momentary grid override*; `Alt` is a *momentary no-snapping override* (**DOCUMENTED** `wb.gridTip`,
  `wb.hint`). **OBSERVED** related surface: `#wbgrid` default off, `gui.snap: "Snap to grid: {v}"`,
  grid-size readout `"0.125 m"` computed as `0.125 * unitsconver` in the bundle (**OBSERVED** in
  `evidence/js-exported/js.php.7868a06179c38d65.js`, grid header text).
- **Angles** — "Snap directions to 15° steps (0°, 45° and 90° first), also relative to the previous wall"
  (**DOCUMENTED** `wb.angleTip`). **OBSERVED (code)**: the snap search enumerates `24` candidate directions
  `i*Math.PI/12` and marks `i % 3 === 0` as the *first-class* set (0°, 45°, 90°, 135°, …), then, when a
  previous wall direction exists, re-runs the same 24-step search **offset by the previous segment's angle**
  (skipping the duplicate). The chosen direction is scored by angular distance and the point is re-projected
  onto it. So: 15° granularity, with 0/45/90 as primaries and *relative* continuation from the last wall.
- **Magnet** — "Snap to wall ends, onto walls (T-junctions) and to alignment guides" (**DOCUMENTED**
  `wb.magnetTip`). **INFERRED** from the guide layer and the "alignment guides" wording: guide lines are drawn
  when the cursor is axis-aligned with existing geometry; both grid and angle snapping are disabled `/`
  overridden per the same snap search (a `null` result means "free").
- **Snapping also applies to the transform gizmos** (**OBSERVED (code)**): each gizmo manager's
  `positionGizmo.snapDistance` is set to `1 / gridRatio` (and rotation gizmo to `5*PI/180 = 5°`) — i.e. moving
  an existing element snaps to the same grid, and rotation is quantised, when those switches are on.

### 2.3 Units, height and grid scale

- **Units**: project dialog offers `Meters (m)` (default, `checked`) and `Feet (ft)` (**OBSERVED**
  `evidence/app-ui.html` / `#modal1`). The app itself describes the setting as global:
  `ui.unitsSet: "Units: {u} (3D and 2D plan)"` and `ui.unitsTip: "Units of the 3D and of the 2D plan: click to
  switch meters / feet"` (**DOCUMENTED**). **OBSERVED** live global `HPUnits` = `{name:'m', factor:1, set,
  toggle, pushTo2d, refreshLabels, onChange}` and `window.HP_UNITS_KEY = 'hp-units'` — the `pushTo2d` member
  and the tooltip together indicate the unit choice is **pushed into the 2D planner** too.
- **Floor-to-floor height**: `#floorheight` range `2…5 m`, `step .01`, default `2.65`, badged "2.65 m", hint
  "Vertical distance between two levels, slab included. New walls use this height." (**OBSERVED** markup;
  **DOCUMENTED** hint). This is the *storey* height; the wall builder's own height slider is the *wall* height.
- **Floor plan size**: `#floorsize` range `50…1000 m`, `step 10`, default `100`, hint "Side of the square
  ground and grid you will build on." (**OBSERVED** markup; **DOCUMENTED** hint).
- **Levels**: up to 50 floors per project (marketing claim, **DOCUMENTED**
  `evidence/01-dom.html`); observed live `window.HPSync.level = 0`, `HPUI`/`gui.currentFloor`,
  `ui.levelTip: "Current level: new walls, floors and objects go here"`, and copy tools
  (`copy.level.*`: duplicate walls/openings/floors to another level) (**DOCUMENTED**).
- **Building-code/limits wording in the same dialog family** confirms the unit system is metric-first:
  `bim.ceilingHeight`, `bim.storeyHeight`, `norms.req.height` ("Ceiling height"), `norms.lot.area` (m²),
  and the sheet export prints "Dimensions and levels in metres" or "Dimensions in feet and inches"
  (`sheet.tb.units` / `sheet.tb.unitsFt`) (**DOCUMENTED**).

### 2.4 Wall representation, thickness, shared walls, openings

- **OBSERVED (code, `buildWall`)** — a wall is built from exactly two plan points and a thickness/height:
  `buildWall({x1, z1, x2, z2, thickness, height, curve?, meta?, level?, levelY?})`:
  position = midpoint `((x1+x2)/2, levelBase + height/2, (z1+z2)/2)`;
  `scaling.set(length + thickness - 0.05, height, thickness)`; `rotation.y = atan2(dx, dz) - PI/2`;
  `metadata.hp = {kind:'wall', …}`; walls are pushed into a dedicated `gizmoLists.walls`; a wall shorter than
  `0.01` is rejected (`return null`). The `-0.05` and the explicit thickness term are how the app closes wall
  corners/joins instead of leaving a gap — consistent with the DOCUMENTED `miterWalls` tool.
  The hub also exposes `wallEndpoints(mesh)`, `nearestWall`, `wallOfCut`, `cutOfWall`, `wallSideFacing`,
  `setWallCurve` (adds `metadata.hp.curve = {s: bulge}`), `miterWalls`, `cutwalls`, `wallPointAt`.
- **Merging / CSG for openings**: child meshes of a wall (door/window "slaves", ids like `wallslaves`,
  `door_window_binding-…`) are merged into a single `wall_merged` mesh when a wall has more than 4 children,
  and `csg` / `csg2` merged meshes are produced for boolean cutting (**OBSERVED (code)**, names
  `wall_merged`, `csg`, `csg2`, `wallslaves` all present as literals). This is why openings "cut the walls"
  (vendor claim, **DOCUMENTED** `evidence/01-dom.html`).
- **Host relationship & checks** — the app models openings as *hosted* on a wall and checks the model for
  problems: `bim.host` "Host wall", `bim.sill` "Sill height", `bim.orthoHeight` "Orthogonal height",
  `bim.thickness`, `bim.thkWarn` "The type is {a} thick, the modelled wall {b}",
  `bim.thinWall` "{name} is very thin ({v} m)", `bim.shortWall` "{name} is very short ({v} m)",
  `bim.issue.dupWall` "{a} and {b} are the same wall", `bim.issue.openingNoWall`
  "{name} is not inside a wall", `bim.issue.openingOverlap` "{a} overlaps {b} in the same wall",
  `bim.issue.floating` "{name} is floating {v} m above its level" (**DOCUMENTED**, `evidence/i18n-app.json`).
  → **shared walls are detected as duplicates rather than silently allowed**, and openings are validated
  against their host. **OBSERVED** supporting API: `HPBIM.hostedBy`, `HPBIM.check`, `HPBIM.quantities`,
  `HPBIM.schedule`, `HPBIM.issue.*` consumers, `HPBIM.undo/redo`, `HPBIM.changeSeq` (`evidence/probe3-globals.json`).
- **Wall layers / types** — layered wall types exist (`bim.layers`, `bim.layerOrderWall` "Layers from the
  exterior (side A) to the interior", `bim.typeSeed.drywall` "Drywall 9.5 cm", `bim.typeSeed.slab`), so a
  wall can carry a composite build-up distinct from its modelled thickness (**DOCUMENTED**); the thin/thick
  warnings above are the reconciliation between the two.

### 2.5 Room detection and rooms-as-data

- **Rooms are detected from closed walls, and a "floor" is created from a room**:
  `eff.noRooms` "No room found: close the walls of a room or draw its floor";
  `lin.noFloors` "There is no floor yet: draw a room in the 2D plan (it gets a floor), or … use the Floor
  button of the Build tab"; `toast` `dims.rooms` "Room areas"; `eff.roomN` "Room {n}" (**DOCUMENTED**).
  **OBSERVED** APIs: `HPHousePlanner.plan()`, `HPHousePlanner.roomType(name)` (a server lookup returning a
  room class), `HPSync.applyPlan`, `HPSync.getState`, `HPSync.buildAt/moveBuild/rotateBuild/moveHandle`,
  `HPSync.stairFootprints`, `HPAIPlace.findRoom`, `HPAIPlace.pointInPoly`, `HPAIPlace.roomFaces`.
- **Plan document shape** (**OBSERVED** live, `evidence/draw4.json`): `HPSync.getState()` returned
  ```
  { plans: { "0": { meter: 60, walls: [], objects: [], rooms: [], polygons: [] } },
    meshless: {}, roofs: {}, meter: 60 }
  ```
  → one plan document **per level index**, with `walls`, `rooms`, `polygons`, `objects` arrays, and a `meter`
  scale (60 observed; `HPSync` also has a `setEnabled`/`requestLevel`/`applyPlan` surface).
- **The closed-ring / largest-area heuristic is visible in the 2D side**: shpped code takes plan `polygons`,
  filters rings with `length > 3`, computes signed area, drops degenerate rings, sorts by absolute area,
  takes the largest as `outer` and the rest as `holes`/`extras`, with earcut doing the triangulation
  (`ExtrudePolygon`/earcut are loaded; "Earcut unavailable for roof generation" warning path exists)
  (**INFERRED** from code, names `polygonIntoWalls`, `polygonArea`, `polygonCentroid`, `minAreaRect`,
  `Rooms.vertex`, `qSVG`, `WALLS`, per-wall `thick`). The same module calls
  `polygonIntoWalls(Rooms.vertex, wallList)` to turn a room outline into wall segments — i.e. **room ⇒ walls**
  and **walls ⇒ rooms** are both derived from one shared polygonal representation.
- **AI/manual import path** also produces rooms: `ctx.floorplanAi` "Convert the selected floor plan image into
  walls, doors and rooms"; its failure strings `fx.wallShapes`/`fx.floorShapes` "Complex shapes not detected
  for wall/floor generation" and `fx.floorArea`/`fx.totalWallVolume` show the same wall+room model underneath.
  DXF import: "DXF plan: lines become walls" with `io.dxfThickness` "DXF wall thickness (cm)" and a toast
  `bim.dxfWalls` "{n} walls created from the DXF lines" (**DOCUMENTED**; **OBSERVED** `HPBIM.importFile`,
  `HPBIM.canImport`, `HPBIM.exportDxf`, `HPBIM.exportSvg`).
- **2D ⇄ 3D sync is live and per-level**: `sync.slabs` "Floors follow the rooms", `sync.roof` "Roof follows the
  walls", `sync.b.menuTip` "Floors, roofs and rough openings of the 3D, placed and edited on the plan",
  plus `sync.levelUp` / `sync.levelDown` and the `#open2DPlanner` button "Open the 2D planner (synced with 3D)"
  (**DOCUMENTED**; **OBSERVED** `HPSync.buildAt`, `moveBuild`, `deleteBuild`, `projectNow`, `updateContours`).

### 2.6 Editing / reshaping vertices

- **OBSERVED (code)**: the editor has a per-vertex handle system shared by *all* shape-bearing kinds. A
  shared table maps handle ids to drag handlers: `spheredrag`, `2spheredrag`, `3spheredrag`, `4spheredrag`,
  and `shapeHandles(element)` groups child meshes that share a local x into
  `{key: "i,j,k", x, z}` records (vertex indices joined with commas). `moveHandle(element, "i,j", x, z)`
  resolves those indices, works out the delta **in the element's rotated local frame** (so handles follow a
  rotated room/frame), moves *all* meshes of the group, and then re-runs the dependent updates
  (wall cuts, wall merging, level/mesh lists, events). Behaviourally: **grab a corner dot and the shared
  corner of the adjoining walls moves with it.**
- Wall endpoints are re-derivable afterwards (`wallEndpoints`, `miterWalls`, `cutwalls`), and `moveElement`
  / `rotateElement` exist for whole elements (**OBSERVED (code)**; the names `onDragStartObservable`,
  `onDragEndObservable`, `PointerDragBehavior`, `dragPlaneNormal`, `dragDeltaRatio`, `boundingBoxDragBehavior`
  appear alongside them).
- Undo/redo is a first-class, project-wide stack: `HPBIM.undo/redo`, `canUndo/canRedo`, `ui.undo/redone`,
  `bim.undone` "Undone ({n} element(s))", plus in-tool `Backspace / Ctrl+Z` at point level (**DOCUMENTED** +
  **OBSERVED** `evidence/probe3-globals.json`).

### 2.7 Persistence and scale cues

- **OBSERVED** live localStorage after entering the editor: `extension-floorplanner-currently-editing`,
  `hp-donate`; and `HP_UNITS_KEY = 'hp-units'`, `hp-wallbuilding` for builder options, `hp-catalog-recent`
  (top-12 recent catalogue items, trimmed to 12 in code), `hp-sync`/project data via IndexedDB.
- Vendor claim: "Projects are saved in your own browser (IndexedDB) with automatic recovery. Nothing is
  uploaded to our servers" (**DOCUMENTED**, `evidence/01-dom.html`). Observed `indexedDB` available and an
  empty pre-boot localStorage — consistent.
- **OBSERVED** catalogue/persistence scale (not directly asked, but relevant to how heavy the editor is):
  `window.HP_BOOT` embeds **1776 objects**, 60 door options, 46 window options, 456 textures, 157 categories,
  ~1.2 MB of JSON inline in `app.php` (2.09 MB HTML total) — `evidence/hp-boot.json`.
- **Licence facts to record exactly** (**DOCUMENTED**, `evidence/01-dom.html`, `evidence/2dplanner.html`):
  the 2D planner is a fork of an **MIT-licensed** project — "MIT License, Copyright (c) 2018 Patrick Raspino"
  (`https://www.3dhouseplanner.com/2D-Planner/LICENSE`); some 3D models come from the **Sweet Home 3D 7.0.2
  free version default catalog, CC BY 3.0**, plus Scopia/Kator Legaz/Blend Swap (CC BY 3.0),
  ArchiBit Generation (CC BY-NC-SA 2.5 IT), ArchiBase.net and "Free the models".
  **I did not copy any source code**; findings above are behavioural descriptions and identifier names.

### 2.8 What I actually executed, and one negative result

- **OBSERVED** scenarios: landing `evidence/01-recon.json.out` (+ DOM/screenshot/AX), `app.php`
  `evidence/02-app.json.out`, `index.php` `evidence/03-index.json.out`, `index3.php`
  `evidence/04-2dplanner.json.out`, `index5.php` `evidence/05-editor.json.out` (this one is the **AI Rendering**
  page, title "AI Design Rendering | Interior & Exterior Image Generation" — not the editor).
- **OBSERVED** script sources: 41 scripts captured from the live page and exported verbatim to
  `evidence/js-exported/` with `manifest.json` + `module-map.json` (module name ↔ versioned `js.php` URL):
  `hp-editor` (691 KB), `hp-bim` (484 KB), `hp-linear`, `hp-ai-chat`, `hp-efficiency`, `hp-sync`, `hp-ui`,
  `hp-panels`, `hp-house-planner`, `hp-dims`, `hp-measure`, `hp-units`/`hp-i18n`, etc. All are
  obfuscated (control-flow flattened, string-array encoding) — so my code claims are structural, from
  identifier/property names and numeric constants, not from de-obfuscation.
- **Negative result (honest gap):** I drove real Chromium mouse events over the canvas to draw a rectangle
  room (world −4,0,−3 → 4,0,3, projected to screen) in headless mode; the scene mesh count stayed at 6 and
  `HPSync.getState()` still showed `walls: []`, `rooms: []`. So **I did not reproduce a completed
  click-to-draw wall/room myself**; the interaction model above rests on the vendor's served UI
  (labels, tooltips, hint strings it renders) plus the shipped-code structure — both strong, but
  *not* a first-person end-to-end confirmation. Details of the attempt: `evidence/draw4.json`,
  screenshot `evidence/shots/11-rect-drawn.png`.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Ranked highest-value-per-effort first; each ties back to a finding.

1. **Angle constraint with 15° granularity and prior-axis continuity** *(Finding 2.2 — Angle snap)*.
   Implement a snap-direction search that (a) tries the 8 primary axes 0/45/90/…, (b) then every 15°, and
   (c) when a previous segment exists, repeats the search offset by that segment's direction and skips the
   duplicate. CasaPlazAI already has 0.5 m grid snapping; 15° + "continue the last wall's direction" is what
   makes hand-drawn plans look *drawn by an architect* instead of jittery.
   **Effort: low** (one pure function, applies to both rect and polygon tools). **Value: high.**
2. **Magnet snapping to wall ends / onto walls (T-junctions) / alignment guides** *(Finding 2.2)*. This is the
   single feature that makes rooms close properly and shared walls coincide. Minimum viable version: snap the
   cursor to existing wall endpoints within a screen-space radius, then project onto the nearest wall segment
   for T-junctions; draw the guide line while a snap is active so the user sees *why* the point moved.
   **Effort: medium. Value: very high** (directly fixes CasaPlazAI's shared-wall correctness).
3. **Momentary modifiers: hold `Shift` = grid, hold `Alt` = no snapping** *(Finding 2.2; DOCUMENTED vendor
   hint)*. Cheap once a snap pipeline exists, and it removes the need for users to leave the tool to toggle
   settings. **Effort: low. Value: high** (perceived precision without permanent modes).
4. **Typed numeric entry during drawing: type length, `Tab` to angle** *(Finding 2.1; DOCUMENTED hints)*.
   Power users enter exact dimensions without a separate dialog — this is how the competitor reconciles
   "sketchy drawing" with "exact plan". Implementation: an inline two-field HUD (length/angle) with an
   active-field ring and live preview, plus `Backspace` = remove last point, `Esc` twice = exit tool.
   **Effort: medium. Value: high.**
5. **Wall alignment (Centre / Inside / Outside) as a per-tool switch** *(Finding 2.1; DOCUMENTED tooltips)*.
   CasaPlazAI's shared-wall work should define, explicitly, whether the drawn polyline is the centre-line or a
   face. Making this a visible 3-state switch is a small amount of geometry and removes a whole class of
   "my room is 0.2 m too big" complaints. **Effort: medium (geometry) / low (UI). Value: high.**
6. **Rectangle mode = 2 clicks ⇒ 4 closed walls + a room** *(Finding 2.1, 2.5)*. CasaPlazAI already has a
   rectangle tool; adding "closes automatically and raises a room with a floor" closes the loop from drawing
   to furnished-space and matches how the competitor makes a whole room two clicks. **Effort: low-medium
   (reuse existing rectangle + room detection). Value: high.**
7. **Room-by-size placement (width × depth + cursor ghost, click to drop)** *(Finding 2.1, `wb.room`)*.
   Ideal for repetitive spaces (bedrooms, bathrooms), lowers input precision demands, and is trivially
   testable. **Effort: low. Value: medium-high.**
8. **Persist tool options (mode, align, grid/angle/magnet, room W/D) per user in localStorage**
   *(Finding 2.1, key `hp-wallbuilding`)*. CasaPlazAI already autosaves the plan; also persisting the *tool
   state* is a few lines and makes return visits feel continuous. **Effort: very low. Value: medium.**
9. **Per-vertex drag handles shared across shapes, with vertex-group moves** *(Finding 2.6)*. Group
   coincident vertices (same world x/z) into one handle so moving a corner moves both adjoining walls and the
   room polygon together; run dependent updates (openings, floors) after the drag. **Effort: medium-high.
   Value: high** — this is the difference between "editable" and "redraw it".
10. **Live dimension readouts while dragging (wall length/angle; opening ⇔ wall end)** *(Finding 2.1, 2.7;
    `tool.wallLength`, `tool.wallDist`, `#textdistancewindowwall`)*. CasaPlazAI has a measure tool, but
    *inline* dimensions during the drag are what users actually rely on. **Effort: low-medium. Value: medium.**
11. **Wall/opening data model with host + level + sill/orthogonal height, and duplicate-wall detection**
    *(Finding 2.4)*. Store `hostWallId`, `sillHeight`, `level`, `thickness`, `height` on openings; then add a
    cheap "model check" pass that warns on *duplicate coincident walls*, *very thin/short walls*, and
    *openings not inside a wall*. This is the structural fix behind shared walls, and it is test-friendly.
    **Effort: medium (model) / low (checks). Value: high** for data quality and export.
12. **Wall as a first-class scene object with metadata, plus a merge step for opening cuts**
    *(Finding 2.4; `wall_merged`/`csg`)*. In a Three.js app, do the equivalent with `CSG`/`Shape` holes or
    stencil-free boolean geometry: keep one logical wall per segment (with metadata) but one merged mesh per
    contiguous run for openings. **Effort: high. Value: high** (this is what makes walls+doors look right).
13. **Units as a single app-wide source of truth pushed into every view** *(Finding 2.3; `HPUnits.pushTo2d`,
    `ui.unitsSet`)*. One `units` store, one `formatLength/formatArea`, and a visible two-state toggle whose
    tooltip promises the same unit in 2D and 3D; conversion happens only at format/entry boundaries so the
    model stays metric. **Effort: medium. Value: medium-high** (Cheap insurance against a 2D/3D mismatch).
14. **First-run "Project settings" dialog: name, floor-to-floor height, plan size, units, with sane
    defaults** *(Finding 2.0, 2.3)*. One modal, four settings, all with defaults, then straight into the
    canvas — plus "new walls inherit the storey height". **Effort: low. Value: medium** (and it gives
    CasaPlazAI a natural place for its single-workspace redesign to start).
15. **Expose a small versioned `window.CasaPlaz*` API for the editor domains** *(Observability; see
    `evidence/probe3-globals.json`)*. The competitor's `HPSync / HPBIM / HPUnits / HPDims / HPMeasure`
    objects made it possible for me to inspect their data model without reading source, and they let their
    own AI assistant "build with the same tools as you". For CasaPlazAI this pays off three times: automated
    tests, agent/AI integration, and console debugging. **Effort: low. Value: high (strategic).**
16. **Level-scoped plan document `{walls, rooms, polygons, objects}` with a `meter` scale**
    *(Finding 2.5)*. Aligns with CasaPlazAI's localStorage autosave: one document per level, vertex arrays in
    metres, derived rooms/floors rebuilt on change. **Effort: medium-high. Value: medium-high**
    (foundation, not user-visible).

*Lower priority / watch-list:* arc (bulge) walls with radius/bulge numeric entry *(2.1)*; skirting boards and
crown/cove trims per room *(DOCUMENTED `wallskirt*`, `ceiltrimtools`)*; AI floor-plan image → walls/doors/rooms
conversion *(2.5)*; layered wall/slab types and quantity take-off *(2.4)*.

---

## 4. Unknowns / what I could not verify

1. **I never completed an end-to-end draw myself.** Headless synthetic mouse events on `#renderCanvas` did not
   produce a wall (mesh count stayed 6, `HPSync` walls/rooms empty — `evidence/draw4.json`). Everything about
   the *click flow* is therefore from the vendor's served UI text and shipped-code structure, not from a
   completed gesture. A headed run with real pointer timings, or `HPSync.buildAt(...)`/the wall builder's
   `snapAt()` API, would settle it.
2. **Exact grid step and its interaction with the 0.5 m grid.** I saw `0.125 m` in the grid-size readout and
   `HPSync.meter = 60`, and a `#floorsize` slider in metres, but I could not confirm whether the builder's
   grid is 0.125 m, a sub-multiple, or user-scalable — nor whether `gui.snap` is the same grid as the ground
   grid. Compare with CasaPlazAI's 0.5 m.
3. **Magnet quantification.** "Alignment guides" is documented but I did not measure the attraction radius,
   the priority order when grid + angle + magnet all offer a candidate, or whether snapping is screen-space or
   world-space constant.
4. **Room detection algorithm details.** I saw closed-ring/area/earcut machinery and the `polygons`/`rooms`
   arrays, but not the exact rule for "this ring is a room" (minimum area? wall thickness handling? holes?),
   nor how a room is named/typed (the `roomType` call hits a server endpoint, which I did not invoke).
5. **Shared-wall semantics end to end.** The model check says duplicate walls are reported
   (`bim.issue.dupWall`), but I did not confirm whether two rooms sharing an edge end up with one wall, two
   coincident walls, or a merged wall — nor how the *Inside/Outside* alignment interacts with that.
6. **Vertex-editing UX.** I confirmed the handle machinery exists (grouped vertex keys, local-frame drags)
   but not which element kinds show handles in practice, how many handles a room/wall shows, or what
   double-click/right-click does on a handle.
7. **Units edge cases.** Whether `Feet (ft)` changes wall-thickness entry granularity, the sliders' step
   values, or only the labels; and whether the 2D planner really follows immediately (`pushTo2d` observed but
   not exercised).
8. **Persistence details.** Project storage is IndexedDB per vendor text, but I did not read the record schema,
   the autosave debounce, or the crash-recovery format; nor the exact localStorage key for the wall-builder
   options (I observed the literal `hp-wallbuilding`, not a written record).
9. **Arc walls.** Bulge/radius semantics, whether an arc wall participates in room closure and in the
   duplicate-wall check.
10. **Two tooling limits worth noting for future runs**: REA `recover-javascript-sources` needs a
    `REA_WAKARU_COMMAND` (not installed), so no beautified/renamed JS was available — all code claims come
    from obfuscated source and identifier names. And the `capture-browser-scenario` action set has no raw
    pointer actions, so canvas drawing needs the local Playwright driver I used (same Chromium binary,
    scripts in `scripts/`).
