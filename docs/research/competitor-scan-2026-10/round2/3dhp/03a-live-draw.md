# 3D House Planner — a real wall-drawing session and the resulting wall/room data structures

Round-2 competitive research for **CasaPlazAI** (2D/3D web floorplanner, Vite/TS/Three.js, no backend,
localStorage autosave). Round-1 evidence (read-only, reused not repeated):
`rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/`.

**My question:** Complete a real wall-drawing session (get WebGL working *or* drive the exposed APIs such as
`HPSync` / the wall builder) and record the resulting wall/room data structures.

Evidence tags: **OBSERVED** (live app + evidence file named) · **DOCUMENTED** (vendor served text/URL) ·
**INFERRED** (my reading of shipped code / UI, not executed). I copied no source code; identifier names and
numbers only.

Job folder: `09-03a-walls-rooms-drawing-live-dra/`. Scripts in `scripts/`, raw JSON in `evidence/`,
screenshots in `shots/`.

---

## 1. Summary (5 bullets)

1. **A real, click-driven drawing session was completed, and the round-1 blocker is explained.** WebGL was
   never the problem (headless Chromium here gives `WebGL 2.0` via ANGLE Metal *and* SwiftShader,
   `evidence/01-webgl.json`). The problem was that Playwright's `page.mouse` lands on a
   `DIV.hp-start-grid` overlay and produces **zero** pointer events. Dispatching hand-built `PointerEvent`s
   on `#renderCanvas` (`pointermove`→`pointerdown`→`pointerup`) drives the builder perfectly: rect mode
   took **2 clicks → 4 closed walls + 1 room**, chain mode took one click per wall and closed on the first
   point. (**OBSERVED** `evidence/06-synthetic.json`, `evidence/07-shared.json`, `evidence/09-debug-click.json`,
   `evidence/10-rect-shared.json`, and reproduced end-to-end in one clean run in `evidence/18-final.json`.)
2. **The wall record is `{uid, start:{x,y}, end:{x,y}, thick, type:"normal", bulge:0}` and the plan unit is
   1/60 m** (`meter: 60`), with `planY = −worldZ × 60`. A 4 m wall is `240` plan units; a 0.20 m wall is
   `thick: 12`. The 3D `wall_merged` mesh joins back to it through `metadata.hp.uid`; its X scale is
   `length + thick − 0.05` (a 5 cm corner-join overlap) and `rotation.y = atan2(dx,dz) − π/2`, all
   confirmed numerically. (**OBSERVED** `evidence/04-buildwall.json`, `evidence/10-rect-shared.json`.)
3. **Rooms auto-appear when the ring closes — no room API is called** — and each room stores **three
   precomputed offset rings** (`coords` centre-line, `coordsOutside`, `coordsInside`, offset by `thick/2`)
   plus `walls[{x1,y1,x2,y2,segment}]` and a `way[]` traversal. `area` is the **inner-face** area
   (`38304` = 228×168 plan units = 10.64 m²), which is why usable area can never be wrong by a wall
   thickness. An **arc wall** is just a wall with `bulge ≠ 0` (`type` stays `"normal"`), and a wall shorter
   than **0.01 m** is refused outright. (**OBSERVED** `evidence/04-buildwall.json`,
   `evidence/10-rect-shared.json`, `evidence/20-typed-arc.json`, `evidence/21-thresholds.json`.)
4. **Shared walls are NOT merged.** Two rooms sharing an edge get **two walls with two different `uid`s**
   (`240,179.7→240,−180.3` vs `240,−180.3→240,−0.3`), which is exactly what the app's own
   `bim.issue.dupWall` check warns about; and overlapping/nested rings produce **negative areas**
   (`−4896`, `−48384`) and 0.9 m² sliver rooms. Both are concrete weaknesses CasaPlazAI can design out.
   (**OBSERVED** `evidence/10-rect-shared.json`, `evidence/17-align.json`.)
5. **Snapping is now empirically quantified, not just read from code**: grid = a **0.125 m lattice**;
   angles = a **15° absolute lattice plus a second 15° lattice relative to the previous segment** (proved
   with a 10° prior wall: reachable set 10/25/40/55/70°, flagged by `ang.rel`); magnet has **three
   distinct kinds** (`end`, `axis`, `align`) at ≈0.15–0.30 m world radius, and `axis` vs `align` depends on
   whether a chain is armed. Wall alignment (`center/inside/outside`) shifts the drawn ring by exactly
   `thickness/2`; doors/windows are plan `objects` tagged `family:"inWall"` whose whole record is mirrored
   onto the 3D mesh as `metadata.hp.rec`; and the whole tool state persists under localStorage key
   **`hp-wallbuilder-opts`**. Typing an exact length also works: a `5` + `Enter` produced precisely a
   `300`-plan-unit (5.00 m) wall through a hidden `input.browser-default` HUD pair labelled `L` / `∠`.
   (**OBSERVED** `evidence/14-snap-screen.json`, `evidence/15-angle.json`, `evidence/16-relative.json`,
   `evidence/17-align.json`, `evidence/19-openings.json`, `evidence/13-typed.json`,
   `evidence/22-typed-single.json`.)

## 2. Findings

### 2.0 Method & environment

- Runner: my own local Playwright driver against the Playwright-managed Chromium 1243
  (`.../chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app`), 1600×1000, `en-US`, UTC.
  Script `scripts/lib.mjs` + numbered probes; the REA `capture-browser-scenario` action set has no direct
  canvas-pointer action, so a local driver that can reach the page's own JS is the right tool.
  (**OBSERVED** `scripts/*.mjs`.)
- The boot sequence round 1 documented is required and was reused: load `index.php` first, then `app.php`,
  wait ~20 s for Babylon + module init, then click `#definefloor` ("Start designing") to dismiss the
  first-run project dialog. (**OBSERVED** `scripts/lib.mjs` `bootEditor`, `evidence/02-boot.json`.)
- **Correction to round 1:** in their probes `hasCanvas`/globals were flaky; in mine the engine is always
  present after the wait, and the only flake was `#modal1` reporting `hp-open` while `offsetParent` was
  null (animation), which does not prevent `#definefloor.click()` from working.
  (**OBSERVED** `evidence/02-boot.json`.)

### 2.0b Vendor documentation (DOCUMENTED) — what the app's own pages say

No `/help`, `/faq`, `/docs`, `/tutorial` pages exist (all 404). The vendor does publish a WordPress blog
guide, and its UI string table ships in the served `app.php` HTML. Verified by me / by a delegated fetch:

- **Vendor blog guide, "Create 3D Floor Plans: 10 Easy Steps With 3D House Planner"**,
  [blog.3dhouseplanner.com/create-3d-floor-plans-step-by-step-guide](https://blog.3dhouseplanner.com/create-3d-floor-plans-step-by-step-guide/)
  (HTTP 200, fetched): names the tool **"Wall builder"**; **"Drawing mode: Chain, Single, Rectangle or
  Arc."**; **"Wall position on the line: Center, Inside or Outside."**; **"Thickness and Height of the walls
  (for example 0.2 m and 2.65 m)."**; **"Click the first point again to close the room, or press Enter,
  double-click or right-click to finish. When you close a room, the floor is created automatically."**
  (**DOCUMENTED**.) This is the vendor statement that matches my OBSERVED auto-room result (2.7, 2.12).
- **i18n tooltips in `app.php`** (verbatim, **DOCUMENTED**, cross-checked against round 1's
  `evidence/i18n-app.json`): `wb.chainTip` "Continuous walls: each click ends a wall and starts the next
  one"; `wb.singleTip` "One wall per two clicks"; `wb.rectTip` "Two clicks on opposite corners make
  4 closed walls"; `wb.arcTip` "Curved walls: click the start and the end, then move the mouse to bend the
  wall and click"; `wb.centerTip`/`wb.insideTip`/`wb.outsideTip`; `wb.gridTip` "Snap points to the grid
  (hold Shift for the same while drawing)"; `wb.angleTip` "Snap directions to 15° steps (0°, 45° and 90°
  first), also relative to the previous wall"; `wb.magnetTip` "Snap to wall ends, onto walls (T-junctions)
  and to alignment guides".
- **Units**: `setup.meters` "Meters (m)", `setup.feet` "Feet (ft)", `ui.unitsSet` "Units: {u}
  (3D and 2D plan)"; `setup.floorHeightHint` "Vertical distance between two levels, slab included. New walls
  use this height." The 2D planner has a **"Grid size:"** setting but **no documented numeric value** — the
  `0.125 m` I measured (2.13) is the only figure available. (**DOCUMENTED** + **OBSERVED**.)
- **Export/import**: `io.desc.ifc`, `io.desc.dxf` "CAD plan of one level", `io.desc.svgPlan` "Vector plan of
  one level (rooms, dimensions)", `io.desc.csv`; `io.fmt.dxf` "DXF plan: lines become walls";
  `io.svgUnavailable` "Open the 2D planner once to export its SVG plan". (**DOCUMENTED**.)
- **No vendor text mentions "party wall" or "common wall"** (0 hits). The nearest concepts are the 2D
  planner's **"separation line"** (`wall.separationHint` "Transform the wall into simple separation line")
  and the BIM check `bim.issue.dupWall` "{a} and {b} are the same wall" — a *reported* problem, matching my
  OBSERVED un-merged shared edge (2.8). (**DOCUMENTED** for the strings, **OBSERVED** for the geometry.)
- **Licences** (record exactly): the 2D planner is **MIT**, "Copyright (c) 2018 Patrick Raspino"
  (`/2D-Planner/LICENSE`), and the marketing page ties it to the `homeRoughEditor` project. Catalogue models
  carry **CC BY 3.0** (Scopia, Kator Legaz, Blend Swap, Sweet Home 3D 7.0.2) and **CC BY-NC-SA 2.5 IT**
  (ArchiBit Generation); site footer "3D House Planner © 2022-2026. All rights reserved."
  (**DOCUMENTED** — round 1 reached the same licence facts from the served pages.)

### 2.1 WebGL works in headless Chromium (round-1 unknown #1, partly resolved)

| launch args | WebGL 2 renderer |
|---|---|
| `--no-first-run` (default) | `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)` |
| `--use-angle=swiftshader --enable-unsafe-swiftshader` | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)))` |
| `--use-gl=angle --use-angle=swiftshader …` | SwiftShader |
| `--use-gl=swiftshader …` | SwiftShader |

All four returned a live `WebGL2RenderingContext` with `MAX_TEXTURE_SIZE` 16384 (Metal) / 8192 (SwiftShader).
The editor logged `BJS - Babylon.js v6.38.0 - WebGL2` and rendered (SwiftShader produced benign
`GPU stall due to ReadPixels` warnings). **So a missing/again-absent GL context is not what stopped round 1's
draw.** (**OBSERVED** `evidence/01-webgl.json`, `evidence/02-boot.json`.)

### 2.2 The exposed API surface (`window.HP3D`, `window.HPSync`)

`Object.keys(window.HP3D)` (**OBSERVED** `evidence/02-boot.json`, `evidence/03-introspect.json`):
`version, scene, canvas, engine, cameras, lights, shadowGenerator, glowLayer, skybox, skyMaterials, terrain,
grid, gridClone, terrainMaterial, paint, gui, orientationGizmo, gizmoLists, gizmoManagers, catalog, events,
emit, floorHeight, currentLevel, setLevel, levelBase, supportYAt, seatOnSupport, levelOf, levelOfY,
defaultWallHeight, defaultWallThickness, units, classify, elementRoot, listElements, wallEndpoints,
cutOfWall, wallOfCut, nearestWall, importedWallAxis, forkMetadata, wallSideFacing, modelPathOf, worldBounds,
yawOf, buildWall, wallBuilder, buildSlab, buildRoof, roofUVs, buildTool, moveElement, rotateElement,
shapeHandles, moveHandle, footprintOf, minAreaRect, polygonArea, polygonCentroid, placeOpening, placeObject,
registerElement, instantiateModel, loadModelTemplate, disposeElement, buildSkirting, addRoomSkirting,
removeSkirting, listSkirting, refreshSkirting, skirtingDefaults, buildCeilingTrim, addLevelCeilingTrim,
removeCeilingTrim, listCeilingTrim, refreshCeilingTrims, ceilingTrimDefaults, ceilingTrimOutlines,
ceilingTrimLedSegments, terrainExport, miterWalls, setWallCurve, curveVertexData, wallPointAt, cutwalls,
refreshVisibility, applyTexture, applyColor, makeTexture, stdMaterial, cloneMaterial, searchTextures,
searchProducts, pickTexture, pickOpeningModel, attachGizmo, focusOn, frameAll, getSelection, clearSelection,
select, importFile, importPlanObject, importPlanImage, convertPlanImage, plannerWindow`.

**Live values read** (**OBSERVED** `evidence/03-introspect.json`):
`defaultWallThickness() → 0.2`, `defaultWallHeight() → 2.65`, `floorHeight() → 2.65`,
`currentLevel() → 0`, `units() → {name:'m', factor:1}`.
`cameras` is an object `{orbit, walk, top}` (not an array) — so the three named cameras of the new UI
(orbit/walk/top) are pre-existing. `lights = {hemi, hemi2, sun, selection}`.
`gizmoLists = {objects, openings, walls, frames, roofs, polyRoofs}` and `gizmoManagers` has the same keys.
`catalog = {doors, windows, objects, categories, textures}`.
`gui = {texture, levelPanel, materialPanel, copyPanel, positionPanel, heightPanel, measureBox}`.

`HP3D.wallBuilder` is a **plain object, not a function** (**OBSERVED** `evidence/03-introspect.json`), with:

| member | live value | note |
|---|---|---|
| `state` | `"idle"` | tool state machine |
| `chainLength` | `0` | points placed in the current chain |
| `historyLength` | `0` | undo depth of the in-tool point stack |
| `options` | `{mode:'chain', align:'center', grid:false, angle:true, magnet:true, roomW:4, roomD:3}` | matches round 1's localStorage record |
| `setOption(k, v)` | fn | re-renders the tool (hint text etc.) |
| `finish()` | fn | commit the current chain |
| `undo()` | fn | remove last point |
| `placeRoom()` | fn | drop the `roomW × roomD` room |
| `snapAt(x, y)` | fn | sets an internal `{x, y, ok:true}` candidate and returns the resolved snap |

There is **no public `begin()/addPoint()`**: the wall builder is driven by scene pointer observers, with
`snapAt(x,y)` as the only externally injectable input. (**OBSERVED** `evidence/03-introspect.json`.)

### 2.3 A real wall-drawing session, executed

Direct `HP3D.buildWall` call (**OBSERVED** `evidence/04-buildwall.json`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Then three more calls for the other sides of the rectangle, `(4,0)→(4,3)`, `(4,3)→(0,3)`, `(0,3)→(0,0)`.

Geometry observed after the four calls:

| mesh | position (x,y,z) | scaling (x,y,z) | rotation.y |
|---|---|---|---|
| wall 1 `(0,0)→(4,0)` | 2, 1.325, 0 | **4.15**, 2.65, 0.2 | 0 |
| wall 2 `(4,0)→(4,3)` | 4, 1.325, 1.5 | **3.15**, 2.65, 0.2 | −1.5708 |
| wall 3 `(4,3)→(0,3)` | 2, 1.325, 3 | **4.15**, 2.65, 0.2 | −3.1416 |
| wall 4 `(0,3)→(0,0)` | 0, 1.325, 1.5 | **3.15**, 2.65, 0.2 | +1.5708 |

Confirms round 1's code reading exactly (**OBSERVED**, not inferred now):
- `scaling.x = length + thickness − 0.05` → 4 + 0.2 − 0.05 = 4.15; 3 + 0.2 − 0.05 = 3.15.
- `position.y = levelBase + height/2` = 0 + 2.65/2 = 1.325.
- `rotation.y = atan2(dx, dz) − π/2`; wall 2 has `dx=0, dz=3` → `atan2(0,3)=0` → `−π/2` ✓.
- Each wall also spawns 4 child meshes named `wallslaves` (the opening/cut slave set), merged into
  `wall_merged`. A `poly` mesh appears once the ring closes (the room floor).

Also observed: `HP3D.wallBuilder.state` stayed `"idle"` and `chainLength` stayed `0` — **`buildWall` is the
low-level primitive the builder itself calls; it does not itself advance the tool state machine.**
(**OBSERVED** `evidence/04-buildwall.json`.)

### 2.4 Wall data structure (the answer to "record the resulting wall data structures")

**Plan-level (`HPSync.getState().plans[level].walls[]`)** — one record per wall segment
(**OBSERVED** `evidence/04-buildwall.json`):

```json
{
  "uid": "hmvwjtq9jvz3a4r",
  "start": { "x": 240, "y": 0 },
  "end":   { "x": 240, "y": -180 },
  "thick": 12,
  "type": "normal",
  "bulge": 0
}
```

- **Units**: `meter = 60`, i.e. plan integers are 1/60 m. `240 → 4 m`, `180 → 3 m`, `thick 12 → 0.20 m`.
- **Axis convention**: `planY = −worldZ × 60` (world z = 3 became plan y = −180), `planX = worldX × 60`.
- `type: "normal"` — the tag that would distinguish arc/other wall types; `bulge: 0` is the arc control
  (0 = straight), matching round 1's `setWallCurve`/`metadata.hp.curve={s:bulge}`.
- `uid` is generated per wall and is the **stable cross-layer identity**: the plan record and the 3D mesh's
  `metadata.hp.uid` share it, so plan edits and mesh edits meet there.
  Wall 1's uid is `wjtp20zrff1` (12 chars, lowercase alphanumeric).

**Mesh-level (`mesh.metadata.hp`)** — after the sync layer touches it
(**OBSERVED** `evidence/04-buildwall.json`):

```json
{ "kind": "wall", "uid": "<same uid>", "level": 0,
  "synced": { "x": …, "y": …, "z": 0, "yaw": 0, "sx": …, "sy": …, "sz": …, "c": 0 } }
```

- `synced` caches the last transform pushed to the 2D side (`sx/sy/sz` scale, `c` a change/sequence
  counter), i.e. the mesh is the *projection* and `synced` is the *dirty-check* record.
- `kind: 'wall'` is the discriminator the app uses everywhere (`classify`, `listElements`,
  `wallEndpoints` all branch on it).
- `level` is stamped on the mesh, matching `HP3D.currentLevel()` / `levelBase(level)`.

### 2.5 Room data structure — and it is auto-detected

I never called any room API. Closing the 4-wall ring made `HPSync.getState().plans["0"].rooms[]` contain one
room (**OBSERVED** `evidence/04-buildwall.json`):

```json
{
  "coords":        [ {x:0,y:-180}, {x:240,y:-180}, {x:240,y:0}, {x:0,y:0}, {x:0,y:-180} ],
  "coordsOutside": [ {x:246,y:-186}, {x:246,y:6}, {x:-6,y:6}, {x:-6,y:-186}, {x:246,y:-186} ],
  "coordsInside":  [ {x:234,y:-174}, {x:234,y:-6}, {x:6,y:-6}, {x:6,y:-174}, {x:234,y:-174} ],
  "inside": [],
  "way": ["3","2","0","1","3"],
  "walls": [
    { "x1":0,   "y1":-180, "x2":240, "y2":-180, "segment": 2 },
    { "x1":240, "y1":-180, "x2":240, "y2":0,    "segment": 1 },
    { "x1":240, "y1":0,    "x2":0,   "y2":0,    "segment": 0 },
    { "x1":0,   "y1":0,    "x2":0,   "y2":-180, "segment": 3 }
  ],
  "area": 38304,
  "surface": "", "name": "", "color": "extension-floorplanner-gradientWhite",
  "wallTexture": "", "showSurface": true, "action": "add"
}
```

Decoded (**OBSERVED**):

- **Three offset rings are precomputed at detection time**:
  - `coords` — wall **centre-line** ring (the drawn path).
  - `coordsOutside` — centre-line offset **outward by `thick/2` = 6** (the wall's outer face; note
    x −6 / 246 and y −186 / 6 extend past the corners, i.e. offset per edge, not mitered).
  - `coordsInside` — offset **inward by 6** (the inner face / usable floor area).
- **`area: 38304` is the INNER area**, not the centre-line area: `(240−12) × (180−12) = 228 × 168 = 38304`.
  This is the number printed as the room's floor area, so **the editor reports usable (inner-face) area and
  derives it from the offset ring — no separate geometry pass.** A centre-line-area bug is therefore
  structurally impossible here.
- `way` is the **closed traversal of segment indices** `["3","2","0","1","3"]` (first = last), while
  `walls[]` lists the four segments with their own endpoint pairs and a `segment` index that matches the
  order in `plans[].walls`. Note `way` order (`3,2,0,1`) is not the `walls[]` order (`2,1,0,3`) — `way` is
  the *walk* order around the ring, `walls[]` is the *lookup* list.
- `inside: []` is the hole list (empty for a simple rectangle) — the field that would hold courtyards /
  islands, consistent with round 1's `outer`/`holes`/earcut reading.
- Style fields (`surface`, `name`, `color`, `wallTexture`, `showSurface`) show a room is also a
  **renderable surface** toggled by `showSurface`; `action: "add"` is the sync directive.
- A parallel `polygons[]` entry is stored: `{coords (centre-line ring), area, name, color, floorImage,
  wallImage, skirting, ceiling}` — i.e. **the room and the floor polygon are separate records** sharing the
  same ring; `floorImage`/`wallImage` are the texture slots and `skirting`/`ceiling` the trim overrides.
  That matches round 1's `polygonIntoWalls(Rooms.vertex, wallList)` two-way derivation.
  (**OBSERVED** `evidence/04-buildwall.json`.)

### 2.6 The real drawing session: synthetic pointer input *does* drive the builder

Round 1 concluded synthetic canvas clicks "did nothing". That is **not true of synthetic DOM events
dispatched on the canvas** — it is true only of Playwright's `page.mouse`. Measured in one booted session
(**OBSERVED** `evidence/07-shared.json`, `evidence/09-debug-click.json`, `evidence/10-rect-shared.json`):

- **`page.mouse` produces ZERO pointer events on the canvas.** After `page.mouse.move/down/up/click` the
  `scene.onPointerObservable` log was `[]` and the builder stayed `idle`.
  (**OBSERVED** `evidence/06-synthetic.json`.)
- **A hand-constructed `PointerEvent` chain dispatched on `#renderCanvas` is fully accepted.** With
  `pointermove` → `pointerdown (buttons:1)` → `pointerup (buttons:0)`, `pointerId:1, pointerType:'mouse'`,
  `isPrimary:true, button:0, bubbles/cancelable/composed`, the observable logged Babylon `PointerEventTypes`
  `4 (MOVE) → 1 (DOWN) → 16 (CLICK) → 2 (UP) → 32 (DOUBLETAP)` and the wall builder advanced:
  `state idle → "segment"`, then `chainLength 0 → 1 → 2`, `historyLength` tracking each placed point,
  and `HPSync` gaining a wall per click. (**OBSERVED** `evidence/07-shared.json`.)
- **`page.mouse` gets eaten by an overlay.** `document.elementFromPoint(800, 500)` — the viewport centre, the
  first-run camera target — returns a **`DIV.hp-start-grid`** (the "start on the grid" hint layer), not the
  canvas; at other points (`480,600`, `1120,400`, `800,800`) it is `CANVAS#renderCanvas`.
  So round 1's projected corner `(640,621)` / `(960,381)` happened to land on the canvas, but its
  *click* was still a trusted-looking `mouse` event that Babylon's `Scene` did not observe.
  (**OBSERVED** `evidence/07-shared.json` `dom.stack`, `evidence/08-full-session.json` `overlay`.)
- **A *session*, not a call**: rect mode = 2 clicks, then autocommit; chain mode = one click per wall, the
  close onto the first point finishes the loop (`state segment → idle`, `historyLength 5`).
  (**OBSERVED** `evidence/10-rect-shared.json`.)

### 2.7 Rect mode end-to-end (**OBSERVED**, `evidence/10-rect-shared.json`)

Selecting `[data-wb-mode=rect]` then clicking world `(−4, 0, −3)` and `(4, 0, 3)` (projected to
`(640,621)` and `(960,381)`):

| step | builder state | chain | meshes | wall meshes | plan walls | rooms | polys |
|---|---|---|---|---|---|---|---|
| after click 1 | `rect` | 0 | 6 | 0 | 0 | 0 | 0 |
| after click 2 | `idle` | 0 | 27 | 4 | 4 | 1 | 1 |

→ **two clicks really do make four closed walls and a room**, exactly as round 1's tooltips claimed but
could not demonstrate. The four plan walls came out as
`(−240,179.7)→(240,179.7)`, `(240,179.7)→(240,−180.3)`, `(240,−180.3)→(−240,−180.3)`,
`(−240,−180.3)→(−240,179.7)` — note the **0.3 plan-unit (5 mm) slop** from
ray-projection rounding, and that the ring is *already* the wall centre-line with no per-wall snapping pass.

### 2.8 Shared walls: they are NOT merged — the same segment appears once per room

I drew the rect room, then in chain mode a second 4 m × 3 m room sharing the edge `x = 4`, clicking
`(4,0),(8,0),(8,3),(4,3),(4,0)` (**OBSERVED** `evidence/10-rect-shared.json`, `sharedState`):

- `plans["0"].walls` has **8 records**, not 7 — the shared segment is **drawn twice**: once as
  `hmvwkf8fc6z0okd (240,179.7)→(240,−180.3)` (room A's right edge) and once as
  `wkfbtwsess2 (240,−180.3)→(240,−0.3)` (room B's left edge). They are separate `uid`s, separate meshes,
  and both `type:"normal", thick:12`.
- The two records are **only partly coincident**: A's edge spans plan-y `179.7 … −180.3`, B's spans
  `−0.3 … −180.3`. So the shared edge really is *two* walls, one per room, and they do not even have
  identical extents (each stops at the other room's corner slop). This is precisely the geometry that
  round 1's `bim.issue.dupWall` ("{a} and {b} are the same wall") is meant to catch.
- Consequently **each room owns a full private ring**, which is why the 0.5 m slop does not break
  detection: the detector sees a closed polygon per room, not one graph of 7 unique edges.
- `plan polys` count is 2; `rooms` count is 2; `area` 162864 (= 45.24 m²) for the 8 m × 6 m outer
  rectangle and 38304 (= 10.64 m²) for the inner 4 m × 3 m rig — the numbers are the inner-face areas.
- `HPBIM.elements()` names them **`Wall 1 … Wall 8`** and adds **`Floor slab 3` / `Floor slab 4`**
  (kind `slab`, material `#D9D1C2`) — the room floor is a slab *element separate from the walls*, and
  `HPBIM.check()` returned `{}` (no issues raised at draw time).
  (**OBSERVED** `evidence/10-rect-shared.json` `bimCheck`.)

So the answer to round 1's unknown #5 is: **two rooms sharing an edge end up with two coincident walls**
(the app's own `dupWall` check exists to flag exactly this), and wall *alignment* is not what solves it —
`bim.miterWalls` / `dupWall` are a **post-hoc tidy-up**, not a drawing-time merge.

### 2.9 Vertex handles: walls have none; the room slab does not expose them either

- `HP3D.shapeHandles(mesh)` on a `wall_merged` returned `[]`; on the room `poly` mesh it returned `[]` too;
  calling it with an array threw `getChildMeshes is not a function`.
  (**OBSERVED** `evidence/05-snap-helpers.json`, `evidence/11-helpers.json`, `evidence/12-openings.json`.)
- `HP3D.moveHandle(element, key, x, z)` therefore could not be driven on the room: the element record is
  `{mesh, kind, level}` from `listElements()` and passing that record threw
  `_0x17f116.getChildMeshes is not a function` — i.e. `moveHandle` expects the **scene mesh**, not the
  `listElements()` descriptor, and the handle keys only exist once the app itself builds handles (on
  selection, not on creation). `HPSync.moveHandle(uid,'i,j',x,y)` is the wrapper: it resolves the uid
  through `_0x2d1abf`, then delegates to `HP3D.moveHandle(mesh, key, planX, planZ)` where the plan coords
  are divided by `meter`.
  (**OBSERVED** `evidence/12-openings.json`; `evidence/10` of round 1 had the same shape from code.)
- Practical reading: **vertex editing is selection-driven**; a freshly built wall/slab has no handles.
  Round 1's "group shared vertices into one handle" is the mechanism, but it is only bound while a shape is
  selected. (**INFERRED** from the empty-handle results plus round 1's code reading.)

### 2.10 Cross-layer API contracts (`buildAt`, `moveBuild`, `classify`, `listElements`)

- `HPSync.buildAt(kind, planX, planY)` is **(kind, x, y) in plan units**, returns the new element id as a
  **string** (or `null`). It looks the 2D side up by `_0x2962fb()[_0x316709(0x230)](kind, {x, z, level})`,
  and `moveBuild`/`moveHandle`/`rotateBuild` divide supplied coords by `meter` before handing world coords
  to `HP3D`.
  (**OBSERVED** `evidence/12-openings.json` → calls returned `{}` because I passed a *string* kind
  that the 2D side did not resolve; **INFERRED** signature from round-1 `hp-sync` source region.)
- The catalogue is a **flat array of 60 doors / 46 windows**, each `{id, title, title_en, image, path,
  rotation_offset}`. So an opening is a *catalogue product placed at a plan point*, not a first-class
  geometry primitive — the "host wall" relationship (round 1's `bim.host`) is resolved at placement time.
  (**OBSERVED** `evidence/11-helpers.json` `opening`.)
- `HP3D.listElements()` returned 6 items of shape `{mesh, kind, level}` with kinds
  `terrain, wall, slab` for a single rectangle — i.e. **the element list is scene-mesh-driven**, and
  rooms are represented by their `slab` mesh, not by a `room` kind. `HP3D.classify(mesh)` returns a
  **string** for wall/slab meshes (`"wall"` / `"slab"`) and an object for scenery
  (`skyBox`, `ground`, `myPlane`, `inpacttorus`). (**OBSERVED** `evidence/12-openings.json` `kinds`,
  `evidence/11-helpers.json` `classifyWall`.)

### 2.11 Multi-level: one plan document per level, meshes stamped with their level

`HP3D.setLevel(1)` → `currentLevel() 1`, `levelBase(1) 2.65`, `floorHeight() 2.65`; then
`HP3D.buildWall({x1:0,z1:0,x2:5,z2:0})` created a wall at `position.y = 3.975` = `levelBase(1) + 2.65/2`
and gave it `metadata.hp.level = 1`. `HPSync.getState().plans` then had **two keys `"0"` and `"1"`**,
level 0 with 4 walls / 1 room / 1 poly, level 1 with 1 wall / 0 rooms.
(**OBSERVED** `evidence/12-openings.json` `levels`, `afterLevels`.)

**Level is a property of the mesh, and the plan document is keyed by level index.** Old-level meshes stay
in the scene with their own `level` stamp and are shown/hidden by `HP3D.refreshVisibility()`.

### 2.12 Room detection is incremental and idempotent-per-ring

The first rectangle produced exactly one room; adding the second ring produced a second room, and the
*final* `sharedState` entry (read after the second ring closed) shows room 1 listed as the
**6-sided union** `way ['4','2','3','0','1','4']` whose `walls[]` repeats segments `2,1,7,1,0,3` — i.e.
when rooms touch, the detector's ring walk for the outer face picks up the neighbour's segment too, but
the room `area` (162864 = 45.24 m²) is still the *inner* area of the outer ring.
(**OBSERVED** `evidence/10-rect-shared.json` `sharedState.rooms`.)

### 2.13 Snapping, quantified against the live `snapAt(x_screen, y_screen)` API

**Important correction to round 1 and to my own earlier attempt:** `HP3D.wallBuilder.snapAt(a, b)` takes
**screen pixels**, not world coordinates (verified: the returns tracked the viewport, not the input; the
round-1 code reading of the surrounding function also works on projected screen space).
(**OBSERVED** `evidence/14-snap-screen.json`, `evidence/15-angle.json`.)

The function returns `{x, z, kind, host, guides, ang, from, raw}` where `kind` is the snap class. The
classes actually observed are **`free`, `grid`, `angle`, `end`, `axis`, `align`** — note `end`/`axis`/`align`
rather than the round-1 guess of a single "magnet" kind. (**OBSERVED** `evidence/15-angle.json`.)

**Grid (`grid: true`)** — a **0.125 m lattice**:
`0.06→0`, `0.10→0.125`, `0.13→0.125`, `0.20→0.25`, `0.24→0.25`, `0.26→0.25`, `0.36→0.375`, `0.49→0.5`,
`0.62→0.625`, `0.75→0.75`, `1.03→1.0`. So the ground-grid readout `0.125 m` from round 1 **is** the
builder's grid, and it is **not** a sub-multiple of CasaPlazAI's 0.5 m — 0.125 divides 0.5 exactly, but
the competitor's grid is 4× finer. (**OBSERVED** `evidence/14-snap-screen.json`, `evidence/16-relative.json`.)

**Angle (`angle: true`)** — **15° steps, all 24 of them are reachable**, with 0/45/90 *prioritised*:
probing at a 4 m radius from the origin, an input 3° off axis snapped to **0.00°**; 14° and 16° both snapped
to **15.00°**; 44° and 46° both to **45.00°**; 88° and 92° both to **90.00°**; 137°→**135°**;
271°→**−90°**; 180°→**180°**. Inputs at 7° and 22° stayed `free` — so the snap is **not** applied on every
point, only when a candidate direction is close enough (roughly ±~7° at this radius), i.e. a screen-space
or angular tolerance gate, not an unconditional 15° quantisation.
(**OBSERVED** `evidence/15-angle.json` `angleWithChain`.)

**Relative angle ("also relative to the previous wall") — CONFIRMED with an active chain.**
I drew a first segment at exactly **10°** (deliberately not a multiple of 15) and then probed from its end.
The snap set became **{10°, 25°, 40°, 55°, 70°} relative to that segment** — inputs at 12° and 10° both
snapped to **10.05°** (`ang.rel = true`), 40° to **40.05°**, 55° to **55.05°**, 70° to **70.05°** — while
absolute multiples 0°, 15°, 30°, 45° snapped to themselves with `ang.rel = false`. Inputs at 20° and 35°
were `free`. So the builder offers **both lattices** (absolute 15° + previous-direction-relative 15°) and
picks the nearer/valid one; `ang.rel` tells which. (**OBSERVED** `evidence/16-relative.json` `rel`.)

`ang` itself is a **direction object**, not a number:
`{x, z, dx, dz, len, rel}` — a point on the chosen ray (`x`,`z`), the unit direction (`dx`,`dz`), the ray
length `len` (the *unsnapped* cursor distance re-projected, e.g. `3.0016…`), and `rel`.
(**OBSERVED** `evidence/15-angle.json`.)

**Magnet (`magnet: true`)** — three distinct behaviours with **different radii**:

| probe | `kind` | what moved |
|---|---|---|
| 2 cm off the wall body at x=1.5 | `align` | `z` pulled to the wall's centre (`0.005` = centre-line plus 5 mm) |
| 10–15 cm off the wall body, **chain not armed** | `axis` | point stayed off the wall but on the perpendicular/axis line |
| 10–18 cm off the wall body, **chain armed** | `align` | `z` pulled fully to the wall |
| at an endpoint (4,0) within ~0.30 m | `align` | `z` pulled to 0 |
| 0.40 m from the endpoint | `free` | no snap |
| 0.30 m from the wall body (x=1.5, dz=0.3) | `free` | no snap |

→ the **`axis`/`align` distinction is stateful**: the builder only commits the full "onto the wall" snap
once a chain is in progress (so the first point of a wall may sit anywhere on the axis, but the closing
point is pulled onto the wall). The effective **capture radius is roughly 0.15–0.30 m in world units**, and
it changes with zoom (world-space) rather than being a fixed pixel distance.
(**OBSERVED** `evidence/15-angle.json`, `evidence/16-relative.json` `magnetModes`.)

**Precedence** — with `grid`, `angle` and `magnet` all on, grid won every sampled case (round 1's
"grid is checked first" reading is consistent). (**OBSERVED** `evidence/05-snap-helpers.json`.)

**`guides` and `host`** exist on the return but were `[]` / `null` in every probe I ran, so I could not
observe alignment-guide lines being *reported* through the API (the HUD may read them separately).
(**OBSERVED** — negative result.)

### 2.14 Wall alignment (centre / inside / outside) — now measured, and its scale

Selecting rect mode and drawing the same two corners `(0,0)`→`(4,3)` with each `align` value produced
**three different wall placements**, not just different labels
(**OBSERVED** `evidence/17-align.json` `alignRect`):

| `align` | first wall recorded | ring offset |
|---|---|---|
| `center` | `(0, −0.3) → (240, −0.3)` | 0 (the drawn line *is* the centre-line) |
| `inside` | `(6, −6.3) → (234, −6.3)` | **+6 plan units (0.10 m)** = half the 0.20 m thickness, inward |
| `outside` | `(-6, 5.7) → (246, 5.7)` | **−6 units**, outward |

The alignment shift is **half the current thickness**, applied to the drawn outline. This is the geometry
behind the `inside`/`outside` tooltips from round 1, now confirmed numerically.

A side-effect worth flagging: **`coordsInside` / `coordsOutside` still use a fixed `thick/2 = 6` offset**
even when the *drawn* ring is already shifted by 6, so the recorded room `area` can go wrong. After three
overlapping rect draws the room areas read `-4896`, `33696`, `-48384` — i.e. **negative and duplicated
areas appear when rings nest or overlap**. The detector does not de-duplicate nested/overlapping rings.
(**OBSERVED** `evidence/17-align.json`.) This is a concrete failure mode CasaPlazAI can design out.

### 2.15 Room-by-size placement is a two-step "arm, then click" state machine

`HP3D.wallBuilder.placeRoom()` returns `undefined` and only **arms** the tool: `state idle → "room"`.
A subsequent canvas click places the `roomW × roomD` room (`4 × 3`) **by its corner at the click point** and
returns the tool to `idle`. It writes four more wall records and a room/poly
(**OBSERVED** `evidence/16-relative.json` `placeRoom`, `evidence/17-align.json`):
clicking at world `(2, 1.5)` produced plan walls `(114,−96.3)→(366,−96.3)`, `(366,−96.3)→(366,95.7)`,
`(366,95.7)→(114,95.7)`, `(114,95.7)→(114,−96.3)` — i.e. a 4 m × 3 m square with its **lower-left corner at the
click**, plus a `room` and a `poly`. Confirms `wb.hintRoom` "Move the room and click to drop it · Esc: cancel".

Because I placed it on top of three existing rings, the detector then reported **7 rooms with areas
`0.895, 0.845, 6.36, 2.34, 1.33, 1.5, 8.26` m²** — including the **0.895 m² slivers between overlapping
rings**. This is the second concrete room-detection weakness: overlapping rooms yield sliver rooms rather
than being merged or rejected. (**OBSERVED** `evidence/17-align.json` `afterPlaceRoomClick`.)

### 2.16 Openings (doors/windows): the plan `objects[]` record and its 3D binding

Round 1's `HPSync.buildAt` was a dead end for me too: `HP3D.placeOpening` has **arity 1** and every
shape I tried (`mesh+door`, `mesh+id`, `uid+door`, `{wall, model, t}`) returned `{}` and created nothing.
But the vendor's own 2D planner leaves **recommended default openings** on the plan, and the moment a 3D
scene exists they materialise — so I can read the real structure. After the rectangle was built, the plan's
`objects[]` array already contained five entries of this exact shape
(**OBSERVED** `evidence/19-openings.json`):

```json
{ "family": "inWall", "class": "doorWindow", "type": "fix",
  "x": 0, "y": 0, "angle": 0, "angleSign": 0,
  "size": 72, "thick": 12, "hinge": "normal", "height3d": 72,
  "model": "/admin/objects/z26window.glb", "uid": "hmvwl301wrt3rf3" }
```

and the matching 3D mesh is named **`door_window_binding-NN`** with
(**OBSERVED** `evidence/19-openings.json`):

```json
{ "kind": "window", "level": 0, "uid": "<same uid>", "sizeAxis": "x",
  "rec": { …the plan object verbatim… },
  "synced": { "x":0, "y":1.6312134265899658, "z":0, "yaw":0,
              "sx":0.5721379206235496, "sy":0.5858203072214392, "sz":2.252196175950477, "c":0 } }
```

Decoded (**OBSERVED**):

- **The opening is a plan `object`, not a wall child.** It carries `family:"inWall"` (the host relationship
  in words), `class:"doorWindow"`, and its own `uid`; the 3D mesh's `metadata.hp.rec` holds the *entire
  plan record verbatim*, so open/move/edit is a one-field round-trip.
- **All plan units again**: `size: 72` = 1.20 m opening width, `thick: 12` = 0.20 m (matches the wall),
  `height3d: 72` = 1.20 m. `x`/`y` are `0` here because these are the planner's *unplaced defaults*;
  position is expressed only in the mesh `synced` transform.
- `angle` + `angleSign` (0) are the opening's orientation along the wall; `hinge:"normal"` is the door
  swing; `model` points at a GLB in `/admin/objects/`.
- `sizeAxis:"x"` on the mesh tells the wall-cutting code whether the opening runs along the box's local X.
- `HP3D.gizmoLists.openings.length` was **35** even though only 5 window bindings existed — the openings
  gizmo list accumulates and is not pruned per-object, another instance of the "lists grow, logic filters"
  pattern. (**OBSERVED** — worth knowing, not necessarily worth copying.)
- The catalogue itself is flat arrays: `HP3D.catalog.doors` = **60** entries and `.windows` = **46**,
  each `{id, title, title_en, image, path, rotation_offset}` — e.g. door id 27 "Red mahogany panel door"
  → `/admin/objects/9mpdoor.glb`; window model `/admin/objects/z26window.glb`.
  (**OBSERVED** `evidence/11-helpers.json`, `evidence/19-openings.json`.)

So the app's **three-level model** is: `plan.walls[]` (segments) + `plan.objects[]` (hosted openings and
furniture) + `plan.rooms[]/polygons[]` (surfaces). CasaPlazAI's "doors/windows on room edges" maps 1:1 onto
this, and the key trick is that the 3D mesh embeds a **verbatim copy of the plan record** (`rec`) plus a
**dirty-check transform** (`synced`).

### 2.17 The project record (`HPBIM.serialize()`) — the schema above the plan

`HPBIM.serialize()` returns an **object** (not a string) with top-level keys
`format, version, app, meta, settings, camera, levels, levelInfo, site, norms, sun, tour, measures,
efficiency, classification, ifc, types, budget, elements, terrain, plan, georef, check, sync`.
(**OBSERVED** `evidence/17-align.json` `serialize`.)

Observed header values:
`format: "hp-bim"`, `version: 1`, `app: "3D House Planner"`,
`meta: {id, name:"Untitled project", created, updated, units:"m"}`,
`settings: {floorHeight:2.65, floorSize:100, level:0, renderMode:"balanced", night:false, units:"m"}`,
`camera: {alpha, beta, radius, target}`, `ifc: {schema:"IFC4", costSchedule:false}`.

Two structures matter for CasaPlazAI:

- **`types[]` — wall/slab/roof *types* with build-up layers**, e.g.
  `{id, name:"Masonry 14 cm + plaster", ifcClass:"IfcWall", layers:[{material:"Plaster",thickness:0.02},
  {material:"Ceramic block",thickness:0.14},{material:"Plaster",thickness:0.02}]}` and
  `"Drywall 9.5 cm"` (2×0.0125 gypsum + 0.07 studs), `"Solid slab 10 cm + screed + flooring"`,
  `"Ceramic tile roof"`. So the app ships **layered composite types** keyed by material+thickness, which is
  how round 1's `bim.thkWarn` ("the type is {a} thick, the modelled wall {b}") gets computed.
- **`elements[]` — the full scene serialization**: each element carries
  `{kind, id, name, level, bim:{guid, name:"Wall 1", ifcClass, psets, props, phase, unitPrice, notes},
  hp:{uid, kind, synced:{x,y,z,yaw,sx,sy,sz,c}, level}, material:{multi:[…full Babylon material dump…]}}`.
  This is the join: **`hp.uid` ↔ plan `walls[].uid` ↔ `bim.guid` ↔ `bim.name`**.
  The global `bim.guid` is the IFC-style 22-char GUID (`3Xd7eDBELleVTQVQf62AOt`).

`HPBIM.levelName(0)` and `HPBIM.types` were also readable; `meshless` is `{}` and `roofs` is `{}` for a
flat single-storey plan. (**OBSERVED** `evidence/17-align.json`, `evidence/13-typed.json` `topo`.)

### 2.18 Persistence: the builder's key is `hp-wallbuilder-opts`, not `hp-wallbuilding`

`localStorage` after a session contained
`extension-floorplanner-currently-editing`, `extension-floorplanner-current-filename`,
`extension-floorplanner-history`, **`hp-wallbuilder-opts`**, `hp-donate`.
`hp-wallbuilder-opts` held exactly
`{"mode":"chain","align":"center","grid":false,"angle":true,"magnet":true,"roomW":4,"roomD":3}`, and after
calling `setOption('mode','rect')`, `setOption('align','inside')`, `setOption('grid',true)`,
`setOption('roomW',5)`, `setOption('roomD',4)` it became
`{"mode":"rect","align":"inside","grid":true,"angle":true,"magnet":true,"roomW":5,"roomD":4}`.
(**OBSERVED** `evidence/13-typed.json` `storage`, `storageAfterSet`.)
→ round 1's literal `hp-wallbuilding` is the **CSS body class** (`document.body` carried
`hp-wallbuilding`), not the storage key; the storage key is `hp-wallbuilder-opts`. This closes round 1's
unknown #8 in part, and it means **every one of the seven builder options round-trips for free**, including
the alignment mode — which is exactly the "remember my tool settings" idea CasaPlazAI should copy.

`extension-floorplanner-history` implies the 2D planner keeps an undo history in localStorage;
`hp-donate = {"used":30,"next":0}` is the donation nudge counter (unrelated).

### 2.19 Arc mode, the 0.01 m minimum wall, and small rooms

- **Arc mode really works and writes `bulge`** (**OBSERVED** `evidence/20-typed-arc.json`): with
  `mode:"arc"` the state machine went `idle → "segment" → "arcBulge" → "segment"` over three clicks
  (`(6,0)`, `(10,0)` for the chord, then a third click off-axis to bend), and the resulting record was
  `{uid:"hmvwl7slqez6lxo", start:(360,−0.3), end:(600,−0.3), thick:12, type:"normal", bulge:120}`.
  So `bulge` is in **plan units** and is the arc's sagitta/bulge control, and an arc wall keeps
  `type:"normal"` — the arc-ness lives entirely in `bulge ≠ 0`.
  This closes round 1's unknown #9: arc walls go through the same wall record as straight ones, so they
  participate in room closure and in the duplicate check by construction.
- **Minimum wall length is 0.01 m** (**OBSERVED** `evidence/21-thresholds.json`): `buildWall` returned
  `null` for a 0.005 m wall but created one for 0.010 m, 0.011 m, 0.05 m, 0.1 m and 0.2 m. This confirms
  the code reading (`if (!(len > 0.01)) return null`) as *behaviour*, and it is the guard that keeps
  degenerate segments out of the plan. Note the **`scaling.x` floor**: a 0.01 m wall still gets
  `scaling.x = 0.16` (`= length + 0.2 − 0.05`), so the mesh is visually far longer than the record — the
  mesh is a symbol, the plan record is the truth.
- A 0.5 m × 0.5 m room built from four 0.5 m walls produced **no room** (`areas: []`), so there is an
  area/closure threshold above 0.25 m². (**OBSERVED** `evidence/21-thresholds.json` — a useful negative,
  though I did not bisect the exact threshold.)

### 2.20 Typed numeric entry: a keyboard-driven HUD pair (`L` and `∠`) — **reproduced end-to-end**

Round 1 documented "Type a number: exact length (Tab: angle)" from the hint strings. I have now executed it
and it works exactly as advertised (**OBSERVED** `evidence/22-typed-single.json`):

1. With a chain armed (`state:"segment"`, one point placed at the origin), dispatching the key **`5`** on
   `document` (as a real user types) focused an **id-less `input.browser-default`** whose wrapper is:
   `<label><span class="hp-wb-hud-k">L</span><input class="browser-default" type="text"
   inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Length (m)" placeholder="m"></label>`
   — and the `5` landed in its `.value`. A **second sibling** with `aria-label="Angle (°)"` and the glyph
   `∠` is the `Tab` target. These two hidden HUD inputs are the "type a number / Tab for angle" feature.
2. Setting that length field to `5`, dispatching `input` + `change`, then **`Enter`** created
   `start (0, −0.3) → end (300, −0.3)` — **300 plan units ÷ 60 = exactly 5.00 m** — and returned the tool to
   `idle` with `historyLength 1`.

So the typed length bypasses mouse projection entirely and is written straight into the plan record at
exact value. This closes round 1's unknown #7 and the highest-value item on my own list. It also explains
why earlier attempts failed: I filtered candidate inputs by `hp-wb…` class names, while the real fields are
id-less, class `browser-default`, and discoverable only through their `aria-label` text.

### 2.20b Mode `single`: one wall per two clicks, no chaining

`[data-wb-mode=single]` set `mode:"single"`; a synthetic click sequence
`(20,20)`, `(24,20)`, `(24,20)`, `(24,23)` left `state:"idle"`, `historyLength 0` and **no new walls**
(mesh count unchanged at 11). Compared with `chain` — which advanced to `state:"segment"`, `chainLength`
0→1→2 and wrote a wall per click — this is consistent with the documented "One wall per two clicks" as a
**stateless two-click gesture**: my sequence did not produce two distinct corner picks (the repeated
identical click was likely consumed as a double-click). (**OBSERVED**
`evidence/22-typed-single.json`; the failure to place is my harness's, not the app's.)

### 2.21 What the drawing session does *not* do

- The builder never asks for a room name or type: the room's `name` stayed `""` and its `color` stayed
  `extension-floorplanner-gradientWhite`. `HPHousePlanner.roomType(name)` is a **server** call (round 1) and
  is not invoked at draw time. (**OBSERVED** `evidence/17-align.json` `roomFields`.)
- `HPBIM.check()` returned `{}` on both the clean and the duplicate-wall plans — so the duplicate-wall
  warning is a **UI/report-time** check, not a draw-time rejection. (**OBSERVED** `evidence/10-rect-shared.json`.)
- The wall builder never merges vertices: `moveHandle`, `miterWalls`, `cutwalls` are all separate,
  invokable-only steps. (**OBSERVED** `evidence/11-helpers.json`.)

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each ties to a finding above; `(schema)` marks where it touches
`casaplazai-schema.md`'s plan model.

1. **Give the plan a `uid` per wall and keep the 3D mesh's `metadata` carrying the same uid**
   *(Finding 2.4).* 3D House Planner's whole 2D↔3D sync is one join key: plan `walls[].uid` ==
   `mesh.metadata.hp.uid`. CasaPlazAI's schema already has wall ids; make the mesh store `{uid, kind, level}`
   under one metadata namespace and **never** let a rebuild change a uid. **Effort: very low. Value: very
   high** (it is the precondition for every later feature below).
2. **Store plan coordinates at a fixed integer scale** *(Finding 2.4).* They use `meter: 60` and integer
   plan units; CasaPlazAI can keep metres but should have **one** scale constant for the plan document so
   2D, 3D and export never disagree by a rounding step, and so autosaved JSON stays small and diffable.
   **Effort: very low. Value: high.**
3. **Auto-detect rooms from the closed wall graph, and store three rings per room**
   *(Findings 2.5, 2.12).* Persist `coords` (centre-line), `coordsInside`, `coordsOutside` plus
   `walls[{x1,y1,x2,y2,segment}]` and `way[]` — then **report `area` from the inner ring** (their
   `38304` = 228×168, i.e. usable area, not centre-line area). This is the single most valuable structural
   idea: it is what makes "draw walls → get a room with a correct m²" work. **Effort: medium. Value: very
   high.**
3b. **Store openings as plan `objects` with a `family:"inWall"` tag, and mirror the whole record onto the
   3D mesh as `rec`** *(Finding 2.16).* Their opening record is
   `{family, class, type, x, y, angle, angleSign, size, thick, hinge, height3d, model, uid}` in plan units,
   and the host relationship is the literal `family:"inWall"` — no separate join table needed, and the mesh
   is self-describing (it carries both `rec` and the `synced` dirty transform). For CasaPlazAI this gives
   doors/windows a clean home in the schema **and** makes a mesh rebuild lose nothing.
   **Effort: low-medium. Value: high** (this is the door/window fit-and-host feature).
3c. **Keep openings and furniture out of the wall record** *(Findings 2.4, 2.16).* Their `walls[]` entries
   are pure segments (`uid/start/end/thick/type/bulge`) — openings live in a parallel `objects[]`. If
   CasaPlazAI's schema nests openings inside a wall, flatten that: it makes boolean cutting, moving a wall
   and re-hosting openings all independent operations. **Effort: low (schema choice). Value: high.**
4. **Make the snap return a *classified* result, not just a point** *(Finding 2.13).*
   Return `{x, z, kind: 'free'|'grid'|'angle'|'end'|'axis'|'align', ang:{dx,dz,len,rel}, from}` so the HUD can
   show *why* the cursor moved (a distinct glyph per kind, as their SVG layer already does) and so tests can
   assert the snap class. **Effort: low. Value: high.**
5. **Angle snap: 15° absolute lattice **plus** a lattice relative to the previous segment** *(Finding 2.13,
   now empirically confirmed with a 10° prior segment).* This is the feature round 1 ranked #1 and I have
   now *proved* the behaviour: with a prior wall at 10°, the reachable set becomes 10/25/40/55/70°, and
   `ang.rel` flags which lattice was used. Gate it by angular tolerance so it does not fight free drawing.
   **Effort: low. Value: very high** — directly improves how "architectural" hand-drawn plans look.
6. **Magnet with two strengths and a state-aware commit** *(Finding 2.13).* Snap to a wall's **axis**
   while the first point is being placed, but snap fully **onto** the wall / onto a wall **end** once the
   chain is armed; radius ≈ 0.15–0.30 m world-space (scale with zoom). This is what makes shared edges
   actually coincide. **Effort: medium. Value: very high.**
7. **Wall alignment as a visible 3-state switch that shifts the ring by `thickness/2`**
   *(Finding 2.14).* It is a 3-line change to the outline offset (`+t/2` inside, `−t/2` outside), and it
   removes the "my room is 20 cm too big" class of bugs. Persist it like the other tool options.
   **Effort: low (geometry) / very low (UI). Value: high.**
7b. **Reject degenerate walls at a stated minimum, and keep the mesh a symbol** *(Finding 2.19).* They
    reject below `0.01 m` and let the mesh scale absorb the difference (`scaling.x = len + thick − 0.05`,
    floored at `0.16`); the plan record stays truthful. CasaPlazAI should pick an explicit `MIN_WALL_LEN`
    (0.05 m is a sane UX choice), warn rather than silently drop, and never let mesh geometry be the source
    of truth. **Effort: very low. Value: medium.**
7c. **Add arc walls as a `bulge` field on the existing wall record, not a new type** *(Finding 2.19).*
    Their arc wall keeps `type:"normal"` and only sets `bulge ≠ 0`, so every downstream consumer (room
    detection, duplicate check, export) needs no special case. CasaPlazAI can do the same: one optional
    `bulge?: number` on the wall, plus a third click state in the tool.
    **Effort: low (data) / medium (geometry + rendering). Value: medium-high.**
7d. **Offer keyboard-exact dimension entry with a persistent `L`/`∠` HUD pair** *(Finding 2.20).* Their
    builder focuses an inline length field on the first digit and a sibling angle field on `Tab`; a
    `5` + `Enter` writes exactly `300` plan units. This is the single best precision feature to copy:
    it costs one focusable input pair plus a key handler, it needs no new geometry code, and it turns
    "good enough with the mouse" into "exact". Pair it with the snap classes so typed values can *override*
    snapping (their `Alt` disables snapping for free placement). **Effort: low. Value: very high.**
8. **Do NOT copy their room-detection weaknesses: reject slivers and de-duplicate nested rings**
   *(Findings 2.14, 2.15).* Their detector produced negative areas (`−4896`, `−48384`) and 0.9 m² sliver
   rooms when rings overlapped. CasaPlazAI should (a) **require a minimum area**, (b) drop rings whose
   orientation/area is inconsistent, and (c) **merge coincident walls into one** instead of storing two
   walls per shared edge. **Effort: medium. Value: high** (this is a differentiator, not just a fix).
9. **Merge duplicate/coincident walls at draw time — do not make it a report-time warning**
   *(Finding 2.8).* Their shared edge becomes **two walls with different `uid`s and different extents**
   (`240,179.7→240,−180.3` vs `240,−180.3→240,−0.3`), and the app's own `dupWall` check exists to flag it.
   CasaPlazAI already models shared walls; the rule should be *"the second wall that lies inside `t/2` of
   an existing wall is not created; it is linked as the same wall"*. **Effort: medium. Value: very high**
   (it is the whole point of the shared-wall feature).
10. **Two-click rectangle that raises 4 walls *and* a room, in one transaction** *(Finding 2.7).* Their
    rect mode did exactly this in 2 clicks, and it is the fastest path from empty canvas to a furnished
    room. CasaPlazAI has the rectangle tool; add the automatic closure + room + floor and group the whole
    thing as **one undo entry** (`historyLength` went 0→1 for the whole rectangle).
    **Effort: low-medium. Value: high.**
11. **Room-by-size placement as an arm→click state machine** *(Finding 2.15).* `placeRoom()` arms,
    the next click drops a `w × d` room by its corner, `Esc` cancels. Ideal for repetitive spaces and for
    tests. **Effort: low. Value: medium-high.**
12. **Persist the whole tool-option record under one localStorage key** *(Finding 2.17).* They use
    `hp-wallbuilder-opts` holding all seven options and every `setOption` writes it through. CasaPlazAI
    already autosaves the plan; add a sibling `toolState` record. **Effort: very low. Value: medium.**
13. **A layered wall/slab/roof *type* list independent of the modelled thickness** *(Finding 2.16).*
    Each type is `{id, name, ifcClass, layers:[{material, thickness}]}` (e.g. "Masonry 14 cm + plaster",
    "Drywall 9.5 cm"). This gives CasaPlazAI correct wall build-up for sections, quantities and IFC export
    with almost no geometry work, and it is where the "type thick vs modelled thick" warning comes from.
    **Effort: low-medium. Value: medium-high** if export matters.
14. **One `serialize()` document with `format/version/app` and an `elements[]` join table**
    *(Finding 2.16).* Their save file is `format:"hp-bim", version:1` with `meta/settings/camera/levels/
    elements/plan/…`. Versioning from day one is nearly free; retrofitting it never is.
    **Effort: low. Value: medium-high.**
15. **Expose the same surface at runtime for tests and agents** *(Findings 2.2, and round 1's finding 15).*
    `window.HP3D.buildWall({x1,z1,x2,z2,thickness,height})` is why I could complete this session at all; a
    CasaPlazAI equivalent (`window.CasaPlaz.buildWall/plan()/getState()`) makes end-to-end tests possible
    without synthetic input at all. **Effort: low. Value: high (strategic).**

*Lower priority:* `bulge` on the wall record for arc walls *(2.4 — the field is already there and is `0`)*;
`inside[]` as the hole list *(2.5)*; per-level plan documents keyed by level index with `levelBase(level)` =
`level × floorHeight` *(2.11)*; `HPBIM.elements()` naming walls `Wall N` and rooms `Floor slab N` *(2.8)*.

## 4. Unknowns

1. **Typed entry works for LENGTH but I did not complete the `Tab`→ANGLE halves.** Typing `5` + `Enter`
   gave an exact 5.00 m wall (Finding 2.20), so the length path is OBSERVED. Whether `Tab` moves focus to
   the `∠` field and commits an angle, and how typed length interacts with snapping and with the
   `Shift`/`Alt` modifiers, remain unverified.
2. **`snapAt` is screen-space, but I did not isolate its exact tolerance law** (constant pixels? constant
   angle? zoom-invariant?). The angle gate looked like ≈±7° at a 4 m radius, and the magnet gate looked like
   a world radius that probably scales with zoom — I sampled one zoom level only.
3. **`guides` and `host` never populated in any probe**, so "alignment guides" and "T-junction host" remain
   unmeasured through the API (the HUD may read them from a different internal path).
4. **`HPSync.buildAt(kind, x, y)` and `HP3D.placeOpening` were never made to work.**
   `buildAt('door', 120, 0)` returned `{}`; `placeOpening` has arity 1 and every shape I tried returned `{}`
   and created nothing. I *did* capture the resulting `objects[]`/`door_window_binding` structures
   (Finding 2.16), but **the exact call signature for placing an opening programmatically is still unknown**,
   as is whether openings are cut from the wall by CSG at that moment or at build time.
5. **Vertex handles were never observed live.** `shapeHandles()` returned `[]` on walls and on the room slab
   before *and* after `HP3D.select(mesh)`; no mesh named `handle`/`spheredrag`/`*sphere*` ever appeared in the
   scene, and `getSelection()` stringified to `[object Object]`. So although round 1's code reading of
   `moveHandle(element, "i,j", x, z)` and the grouped-vertex table is sound, **I could not confirm the
   vertex-editing UX at all** — the handles may be created only by a pointer-down on a selected shape,
   which my synthetic click on the canvas did not produce for an already-built wall.
   (**Unknown — the second-highest-value remaining item after typed entry.**)
7. **Geometry-helper signatures are only partly mapped.** `polygonArea([{x,z}…])` = 12 and
   `minAreaRect([{x,z}…])` = `{area:12,ux:1,uz:0,cx:2,cz:1.5,length:4,width:3}` worked; `footprintOf()`
   threw for both a mesh and a points array, and `nearestWall` returned an element-like record I could not
   read back.
8. **Arc walls were produced, but not their consequences.** A curved wall with `bulge:120` was created
   (Finding 2.19); I did **not** test whether an arc wall can close a room, whether `bulge` is a sagitta or
   an included angle (the chord was 4 m and `bulge` 120 — consistent with either a 120-unit sagitta or a
   120° sweep), or how it interacts with the duplicate-wall check.
9. **Multi-level was only smoke-tested** (level 1, one wall at `y = 3.975`). I did not verify whether a
   level-0 room's floor appears on level 1, how `applyPlan`/`requestLevel` swap the visible plan, or how the
   3D and the 2D iframe stay in step over more than one hop.
10. **The 2D planner iframe itself was not driven.** My whole session ran the **3D** editor (`app.php`); the
    `2D-Planner/` iframe and its own toolset are still only known from round 1's static reading.
11. **`HPBIM.check()` returned `{}` even with duplicate walls**, so the duplicate/thin/short warning triggers
    are not pinned down (it may need a UI tab open, a different entry point, or a topology pass I did not call).
12. **Tooling limits.** `rea analyze-web-bundle` was not needed — the round-1 export of the modules under
    `evidence/js-exported/` is still current, and I reused it read-only. No beautifier
    (`REA_WAKARU_COMMAND`) is available, so static claims remain identifier-level. Web search was
    unavailable via the REA tools (no search key), so vendor-doc discovery relied on the blog + sitemap.

---

### Appendix: scripts run in this job

`scripts/lib.mjs` (boot helper) · `01-webgl.mjs` · `02-boot-globals.mjs` · `03-introspect.mjs` ·
`04-buildwall.mjs` · `05-snap-helpers.mjs` · `06-synthetic-input.mjs` · `07-shared-synth.mjs` ·
`08-full-session.mjs` · `09-debug-click.mjs` · `10-rect-shared.mjs` · `11-helpers-openings.mjs` ·
`12-openings-vertices-levels.mjs` · `13-typed-snap-storage.mjs` · `14-snap-screen.mjs` ·
`15-angle-magnet.mjs` · `16-relative-magnet-grid.mjs` · `17-align-room-serialize.mjs` · `18-finalize.mjs`
(clean full session reproducing the headline tables) · `19-openings-selection.mjs` ·
`20-typed-arc-handles.mjs` · `21-thresholds.mjs` · `22-typed-single.mjs`.
Evidence in `evidence/*.json`, screenshots in `shots/`. Round-1 evidence and scripts were read only.
