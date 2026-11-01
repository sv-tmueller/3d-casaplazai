# 3D House Planner — Round 2: room detection & editing, wall/room topology

Competitive research for **CasaPlazAI** (2D/3D web floorplanner, Vite/TS/Three.js, no backend,
localStorage autosave). Round 2, narrower question:

> **Room detection and editing**: room-by-size, closed-loop detection, vertex editing, splitting/merging
> walls, and what happens to rooms and openings when a wall is deleted or moved.

Round 1 (`rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/report.md`) was read first and is **not
redone**; its evidence is reused read-only and re-cited here. This report goes deeper on the narrow
question and closes round-1 Unknowns **#4 (room-detection algorithm)**, **#5 (shared-wall semantics)** and
**#6 (vertex-editing UX)**, plus the topology consequences.

**Evidence tags**
- **OBSERVED** — I loaded the live app, drove its own exposed JS API, or read a live-decoded bundle file
  (evidence file named).
- **DOCUMENTED** — vendor's own served text (UI strings, i18n dictionary, tooltips).
- **INFERRED** — my reading of decoded source structure, not confirmed by executing the feature.

**Method (new in round 2, and reusable).** 3dhouseplanner ships obfuscated bundles whose string arrays are
rotation-encoded. Round 1 could not beautify them (`recover-javascript-sources` needs an uninstalled
`REA_WAKARU_COMMAND`). I found three working ways to read the real strings:
1. **Live-page decode** (`tools/deob5.mjs`): the decoder is a top-level function, so on the loaded page it
   is a global; extract `(decoderName, callIndex)` pairs offline, evaluate the decoder in the page,
   substitute string literals. **Exact by construction — 0 misses on all 11 planner modules (17 577 call
   sites).** Decoded output is in `deob/`. This is the source of every "decoded source" claim below.
2. A bounded replay of the vendor's own rotation loop (`tools/rotation.mjs`) — confirms the rotation count
   (qSVG = 65 shifts, floorplanEditor = 158).
3. The 2D planner is an **MIT-licensed fork of an open-source floor planner** (see 2.1), so its structure
   is additionally legible from the i18n dictionary and API shape.
All statements below are my own description of behaviour; no vendor code is copied into any deliverable.

Job folder `02-03d-walls-rooms-drawing-rooms-ed/`. Start 14:33 CET 2026-10-31.

---

## 1. Summary (5 bullets)

1. **Rooms are not authored, they are *derived*.** The 2D planner holds three flat global arrays —
   `WALLS`, `ROOM`, `OBJDATA` — and after *every* edit (draw, move, delete, joint) it re-runs one pure
   function, `qSVG.polygonize(WALLS)`, to recompute all rooms, then `roomMaker()` reconciles the new
   polygons against the existing `ROOM` objects so colours/names survive. There is no "room" primitive and
   no explicit "close the loop" command: a space becomes a room purely because a graph walk from the
   top-left vertex returned to itself. (**OBSERVED** decoded `qSVG.js` `polygonize`, decoded
   `planner-main.js` call sites, live API run in `evidence/rooms-probe.json`.)
2. **Detection is a half-edge walk over a noded planar graph, with three hard filters.** `junctionList()`
   intersects every wall pair to build nodes; `vertexList()` sorts each node's incident edges by polar
   angle; `segmentTree()` walks faces by always taking the next edge in rotational order at each node
   (**INFERRED** direction — the tie-break comparator is not fully read, see Unknown 3); `polygonIntoWalls()`
   converts the resulting vertex loop into inner/outer wall-face polygons. A face is rejected if its
   polygon already exists (dedup), if it encloses an existing room (`bypass`), or if
   `parseInt(area) < 360 px²` (≈ 0.1 m² at 60 px/m). (**OBSERVED** decoded `qSVG.js`; **OBSERVED** the
   0.1 m² threshold by area sweep in `evidence/rooms-probe2.json` `minArea`, which shows detection also
   fails for geometric reasons at ~20–24 px side.)
3. **Wall↔wall topology is an explicit doubly-linked `parent`/`child` chain, not inferred.** Each wall has
   `{thick, start, end, type, parent, child, angle, equations, coords, backUp}`; `parent`/`child` point at
   the *objects* at the two ends (serialised as array indices). A wall only adopts a neighbour as
   parent/child if the corner angle is between 20° and 160° (a straight continuation does not get linked).
   (**OBSERVED** decoded `floorplanEditor.js` `wall`, `wallsComputing`; live link dump
   `evidence/rooms-probe.json` `cases.C_walls`.)
4. **Deleting a wall re-runs detection, so the outcome depends on whether the rest still closes — rooms
   either merge or vanish.** The trash handler nulls every `child`/`parent` pointing at the victim,
   `splice`s it out, removes its SVG paths, then calls `architect(WALLS)` = `wallsComputing` +
   `polygonize` + `roomMaker`. **Observed:** (a) deleting a *shared interior* wall turns two 400×300 px
   rooms into **one 800×300 room of the summed area** (226 944 px² = 63 m²); (b) deleting an *exterior*
   wall of a single room opens the loop and leaves **zero rooms** — the named, coloured room is destroyed
   outright, because `roomMaker` has no polygon left to match it to. Openings are never touched: they live
   in `OBJDATA` and end up free-floating (the vendor's own check warns "`{name} is not inside a wall`").
   (**OBSERVED** decoded `planner-main.js` wallTrash handler; live runs `evidence/rooms-probe.json`
   `cases.F_before_delete` and `evidence/rooms-probe4-identity.json`.)
5. **Vertex editing is mode-based and destructive-by-split.** "Add joint" (`node_mode`) picks the nearest
   wall within 30 px, then *splits* it at the click point by pushing a **new** `wall` and setting the old
   wall's `end`/`start` to the split point (arc walls re-split their bulge; the clamp can drop one half).
   Wall *selection* lets you drag the whole wall (neighbours follow) or drag a middle handle to bend it
   (`bulge`). Splitting/merging walls is therefore: joint = split, separation-wall = merge-to-line,
   Cut = one wall → N walls at each crossing. (**OBSERVED** decoded `planner-main.js` `node_mode` blocks;
   **DOCUMENTED** i18n `msg.addJoint`, `msg.addJointNote`, `wall.cut`, `wall.toSeparationBtn`.)

---

## 2. Findings

### 2.1 Architecture: which layer owns rooms

- The 2D planner is served from `https://www.3dhouseplanner.com/2D-Planner/index.php`, which loads 11
  modules: `i18n, qSVG, floorplanEditor, orientation3d, symbols, objectCatalog, objectPalette,
  planner-main, uiShell, bridge3d, donate` (`evidence/planner/*.js`, fetched with a `visited=true`
  cookie after the page's redirect loop). It is a fork of the MIT-licensed
  **`floorplanner`/`extension-floorplanner`** codebase — the vendor kept its internal class prefix
  `extension-floorplanner-*`, its globals (`WALLS`, `ROOM`, `OBJDATA`, `HISTORY`, `meter`, `settings`),
  and a classic rotate/checksum string obfuscator. (**OBSERVED** DOM ids and globals; **INFERRED** the
  fork ancestry from those identifiers.)
- **The 3D app (`app.php`, Babylon.js) does not detect rooms**; it *receives* them. `bridge3d.js` builds a
  per-level plan state `{meter, walls, objects, rooms, polygons}` and pushes it to 3D. Walls are sent as
  `{uid, start, end, thick, type, bulge}` — note the **`uid`** and the **`bulge`** for curved walls.
  (**OBSERVED** decoded `deob/bridge3d.js` `_0x558613`.)
- The 3D wall-builder's "**Room by size**" (`wb.room`) is a convenience for *drawing* four walls; the
  resulting room only exists once the planner's `polygonize` accepts the loop. (**DOCUMENTED** round-1
  `evidence/i18n-app.json` `wb.room = 'Room by size'`; **INFERRED** that it is the same loop detector.)

### 2.2 The data model (decoded from source, and confirmed by running it)

```
WALL  = { thick:Number,            // px; wallSize=12 default in the planner, partitionSize=8
          start:{x,y}, end:{x,y},  // centre-line endpoints, in plan px
          type:'normal'|...,       // 'normal' vs 'partition' (separation) vs arc-bearing
          parent:WALL|null, child:WALL|null,   // the connected walls at start / end
          angle:Number,            // atan2 of the centre-line, recomputed in wallsComputing
          equations:{},            // cached line equation per side face
          coords:[],               // the 4+ corners of the wall's fill polygon
          backUp:false, bulge:Number?, uid:String? }
ROOM  = { way:[vertexIdx...],      // the closed loop, indices into the polygonised vertex list
          coords:[{x,y}...],       // the == centre-line == loop of the room (wall axes, not faces)
          coordsInside:[...], coordsOutside:[...],   // the inner-face / outer-face loops
          inside:[roomIdx...],     // rooms fully contained in this one (holes)
          walls:[WALL...],         // bounding walls (observed emptied by the walk in some runs)
          area:Number,             // === inner-face === polygon area, px²  (NOT coords' area)
          outsideArea, realArea,   // outer-face area / raw centre-line area
          surface, name, color, wallTexture, showSurface, action:'add', skirting, ceiling }
OBJDATA = [ ... objects ... ]      // doors/windows are family:'inWall', class:'doorWindow'
```
(**OBSERVED** decoded `deob/floorplanEditor.js` `'wall':function(...)`; decoded `deob/planner-main.js`
`serializePlan` → `{objData, wallData, roomData}`; live dumps `evidence/rooms-probe.json`,
`evidence/rooms-probe2.json`.)

- Persistence is `localStorage` under `extension-floorplanner-history` (an array of up to `HISTORY_LIMIT =
  50` serialised plan snapshots, i.e. **JSON-diffing undo stack**, not command-based), plus a **500 ms
  debounced** autosave (`setTimeout(..., 0x5dc)`), flushed on `pagehide`. Openings/objects ride along in
  `objData`. (**OBSERVED** decoded `planner-main.js` `serializePlan`, `scheduleAutoSave`.)
- Units: `meter = 60` px, `units = {name:'m', factor:1}`; areas are displayed by dividing px² by
  `meter²` (so area thresholds below convert to m² by `/3600`). (**OBSERVED** live `evidence/
  rooms-probe.json` `apiOk.meter = 60`.)

### 2.3 The closed-loop detection algorithm (`qSVG.polygonize`)

Decoded source (`deob/qSVG.js`) reads, in order:

1. **`junctionList(WALLS)`** — for every ordered wall pair, compute each wall's infinite line and take
   `intersectionOfEquations`. If the intersection lies **between** both segments (`btwn(...,'round')`),
   emit one or more junction records `{segment, child, values:[x,y], type:'natural'|...}`. Coincident
   endpoints ("natural") are emitted directly, so **T-junctions and X-crossings become shared nodes** and
   the walls are effectively split at the node by the vertex builder.
2. **`vertexList(junction, WALLS)`** — groups junctions by rounded coordinate into a vertex; each vertex
   gets `{x, y, segment:[wallIndices], child:[...], bypass:false}` and its incident edges are sorted by
   polar angle. This is the half-edge / DCEL construction.
3. **`segmentTree(startVertex, vertex)`** — a face-traversal: from the start vertex take an incident edge
   chosen by rotational order (a left/right-hand rule over the angle-sorted `child` list), advance to the far
   vertex, repeat until it returns to the start. (**INFERRED** the exact turn direction; the loop closes
   correctly in every probe, which is consistent with a consistent handedness.) Returns the loop as a `'-'`-joined index path. It returns `[]` for a
   vertex it cannot advance from.
4. **Main loop** — find the top-most, then left-most, non-`bypass` vertex with ≥2 incident edges (a
   deterministic start), walk it, then apply **three rejection rules**:
   - **already found**: `arrayCompare(existing.way, newWay, 'pop')` → the same loop (allowing one
     cyclically-rotated duplicate) → mark `bypass`.
   - **encloses an existing room**: `polygonIntoWalls` returns `inside` faces; if the loop contains an
     earlier room, mark `bypass` (this is how a *room inside a room* is prevented from double-counting).
   - **too small**: `parseInt(areaRoom(vertex, way)) < 360` → mark `bypass`. **The threshold is 360 px².**
5. **`polygonIntoWalls(vertex, way)`** — for each consecutive pair of the loop, resolve the corner by
   intersecting the two walls' *offset* face lines: a wall is represented as two parallel lines at
   ±`thick/2`, and the inner corner of the room is where the two walls' inner faces meet. It returns
   **`{inside:[...], outside:[...], walls:[...], dense:[...]}`** — both loops already closed (the first
   point is pushed again at the end), plus an optional `dense` resampled loop. If any bounding wall is an
   arc it dispatches to `polygonIntoCurvedWalls`. (**OBSERVED** decoded `qSVG.js`.)
5b. **The room record mixes centre-line geometry with inner-face area.** `coords` is the **centre-line**
   loop (`way` → vertex coordinates), while `area = area(polygonIntoWalls(...).inside)` is the
   **inner-face** area, and `outsideArea`/`realArea` carry the outer-face and raw centre-line areas. For
   the 400×300 rectangle with t=12 the record is `coords = [(0,0),(400,0),(400,300),(0,300),(0,0)]` but
   `area = 111 744 = 388×288`, i.e. the walls' centre-lines *and* the clear floor area are both stored.
   Which loop the renderer uses for the floor slab decides whether the room visually overlaps the walls;
   `bridge3d` forwards **both** `rooms` (with `coords`) and `polygons` (with `coordsInside`).
   (**OBSERVED** decoded `qSVG.js`; `evidence/rooms-probe.json` `A_closed_rect`; `deob/bridge3d.js`.)
6. **`areaRoom` / `area`** — the shoelace (surveyor's) formula, with the closure edge added when the first
   and last point differ, and a degenerate (zero-area) case falling back to the bounding-box centre.
   `areaRoom` additionally subtracts `inside` areas so an annular/courtyard room reports its true net
   area. (**OBSERVED** decoded `qSVG.js`.)

The vendor describes the drawing side of this as: *"Draw walls: click to start, click for each corner,
click the first point to close"* and *"click the first point to close the room · Esc finishes."* There is
no separate "create room" command in the tool list — closing the loop *is* the command.
(**DOCUMENTED** `tool.walls.tip`, `hint.line_mode`, `hint.line_mode_drawing`, `help.step1` in
`evidence/planner-i18n.json`.)

So: **"closed-loop detection" is an exact planar-subdivision face walk with an area and
non-duplication filter — not a flood fill and not a tolerance-based loop matcher.**

### 2.4 Observed detection behaviour (live API runs)

Driving only the planner's own API — `new floorplanEditor['wall']({x,y},{x,y},'normal',12)` pushed into
`window.WALLS`, then `window.floorplanEditor['architect'](window.WALLS)`, then reading `window.ROOM` —
gives these deterministic results (`evidence/rooms-probe.json`, `evidence/rooms-probe2.json`):

| Case (px, 60 px = 1 m) | Rooms | Area (px² / m²) | Note |
|---|---|---|---|
| 4 walls, 400×300 closed rectangle | 1 | 111 744 / 31.04 | `way = 1-0-2-3-1`, 5 coords |
| Same rectangle, **one wall missing** | **0** | — | open chain never returns to start |
| Two 400×300 rooms sharing a wall | **2** | 111 744 each | shared wall consumed by both |
| Outer loop + stub wall meeting it mid-span (T) | 1 | 111 744 | **T-junction does not split the room** |
| 4-wall cross (X, degree-4 node) | **0** | — | cross alone encloses nothing |
| Diagonal inside a square | 2 | 72 016 each | each triangle becomes a room |
| L-shape, 6 noded walls (proper) | 1 | 60 444 / 16.79 | 7-coord polygon |
| L-shape where the notch walls are only inner stubs | **2** | 60 444 + 19 044 | an unintended extra room |
| 60×60 px square vs 90×90 px square | 1 / 1 | 2 304 / 6 084 | both detected |
| Two rooms + a **doorway-sized gap** in the shared wall | 2 | 111 744 each | **openings do not affect rooms** |
| Shared wall replaced by two stubs (gap in the middle) | **1** | 226 944 | rooms merge through the gap |
| **Delete the shared wall** (trash-button logic) | **1** | 226 944 | merge, area conserved |
| Nested 400×400 + inner 200×200 loop | 2 | 105 600 + 35 344 | outer room reports `inside:[1]` |
| 5-sided room | 1 | 65 131 | 6-coord polygon |
| Duplicate wall (same segment twice) | 1 | 111 744 | duplicate ignored by the walk |
| Overlapping collinear walls (0–250 and 150–400) | **0** | — | **overlap breaks detection** |
| Collinear chain (0–200, 200–400) | 1 | 111 744 | colinear split is fine, adds a vertex |

Two hard consequences worth stating plainly:
- **Threshold is model-relative.** With thickness `t` the room polygon is the *inner* face, so a
  `100×100 px` square reports area `(100-t)²`: t=1 → 9801, t=12 → 7744, t=40 → 3600. `t=0` yields
  area 0 (the zero-area fallback), which is also below 360 and would be rejected. (**OBSERVED**
  `rooms-probe2.json` `thickSweep`.)
- **Detection is all-or-nothing per edit.** There is no "keep the room outline while walls are missing"
  state; in the probe a wall moved out from under its neighbours left the room *larger* rather than
  broken (`moveWall`: 111 744 → 129 024 and 111 744 → 94 464), while a genuinely dangling end left
  detection running but with a re-ordered `way`. (**OBSERVED** `rooms-probe2.json` `moveWall`,
  `danglingMove`.)

### 2.5 Vertex editing (adding/moving a joint)

- The tool is titled **"Joint — Add a joint to a wall to bend or move a part of it"** with the explicit
  warning **"Note: this may remove windows or doors already on that wall."** (**DOCUMENTED** 2D-planner
  i18n `tool.joint`, `tool.joint.tip`, `msg.addJoint`, `msg.addJointNote`, extracted to
  `evidence/planner-i18n.json`.)
- The in-app hint is **"Click on a wall to add a joint, then drag the joint"** — so the two-phase UX is:
  click splits the wall at that point, then the same tool lets you drag the new joint, which moves the
  shared endpoint of both halves. (**DOCUMENTED** `hint.node_mode` in `evidence/planner-i18n.json`.)
- `node_mode` hover uses `nearWall(point, 30)` — nearest wall **or vertex** within 30 px — and draws a
  green arrow binder rotated to the wall's local angle. (**OBSERVED** decoded `planner-main.js`
  `node_mode` hover block.)
- On click it executes a **split**, not an edit of a shared vertex:
  ```
  newWall = new wall({clicked point}, oldWall.end, 'normal', oldWall.thick)
  WALLS.push(newWall)
  oldWall.end = {clicked point}
  // if the old wall was an arc, re-cut the bulge for both halves and clamp; drop if unclampable
  architect(WALLS); floorplanSave()
  ```
  So **a joint creates a new wall object**; the existing vertex objects are not shared/indirected, they are
  copied by value (`start`/`end` are plain `{x,y}`). Any future move of that corner must update both walls
  (which is exactly what `wallsComputing` and the drag handler do). (**OBSERVED** decoded
  `planner-main.js`.)
- Wall-level editing: selecting a wall exposes **Thickness**, **Curve** (`bulge`, "how far the middle of
  the wall is from a straight line", draggable middle handle), **Straighten**, **Make separation**,
  **Cut**, **Delete wall**, and a paste slot for doors/windows. The in-app hint is *"Wall selected: change
  its thickness or curve, or delete it (Del) · drag it to move · drag its middle handle to bend it."*
  (**DOCUMENTED** `hint.edit_wall_mode`, `wall.curveHint`, `wall.curveStraight`, `wall.straighten`.) Dragging a selected wall moves it; the
  code updates the adjoining walls' shared endpoints and re-intersects the offset corner equations.
  (**DOCUMENTED** `evidence/planner-i18n.json` `wall.*`; **OBSERVED** decoded `planner-main.js` drag
  block with `intersectionOfEquations(equation1, equation2,'obj')` and parent/child endpoint patching.)

### 2.6 Splitting and merging walls

- **Split (a): joint** — one wall → two walls, as above.
- **Split (b): cut** — "Cut the wall: … A cut will be made at each wall encountered." Splits a wall at
  every crossing wall in one action. (**DOCUMENTED** `wall.cut`, `wall.cutHint`, `wall.cutBtn`.)
- **Merge (a): separation wall / divider** — *"Separation wall: Transform the wall into simple separation
  line"* / *"Make separation"*, with the inverse *"Transform to wall: The thickness will be identical to
  the last known."* Its own draw hint is *"Dividers: click to start, click to end · Esc finishes."*
  Internally the planner carries `partitionSize = 8` px next to `wallSize = 12` px, i.e. a divider is the
  same wall record with a smaller/nil thickness rather than a different type — and `splitCurvedWall`
  explicitly preserves `type === 'separate'`. (**OBSERVED** decoded `planner-main.js` constants, decoded
  `floorplanEditor.js` `splitCurvedWall`; **DOCUMENTED** `wall.separation`, `wall.toWall*`,
  `hint.partition_mode`.)
- **Merge (b): implicit** — collinear walls that meet at a node are *not* merged; they stay separate
  records and the loop simply carries an extra vertex (probe: collinear chain → 1 room, 6-coord polygon).
  (**OBSERVED** `rooms-probe2.json` `collinearChain`.)
- **Adoption rule.** `wallsComputing(WALLS, 'move')` re-links neighbours only when the angle between the
  two wall equations is `> 20°` and `< 160°` (`0x14 < angle < 0xa0`); near-collinear neighbours get no
  parent/child link. Links that no longer touch (`start`/`end` mismatch) are **nulled**, not moved.
  (**OBSERVED** decoded `deob/floorplanEditor.js` `wallsComputing`.)

### 2.7 What happens to rooms and openings

**Rooms.** `architect()` is:
```
wallsComputing(WALLS) → Rooms = qSVG.polygonize(WALLS) → roomMaker(Rooms)
```
Every mutation path (draw, drag, joint, delete, cut, arc, undo/redo load) ends in `architect` or in
`polygonize + roomMaker`. So rooms are always regenerated; there is no incremental room edit.

`roomMaker()` then **reconciles** the fresh polygons against the previous `ROOM` array so user data
survives. Its matching test (decoded) compares `way` arrays with `diffArray` and the coordinate arrays
with `diffObjIntoArray`, accepting:
- same wall count and same coords,
- polygon has exactly **one more** `way` entry and `diffArray` length 1 **and** `diffObjIntoArray` length 2,
- polygon has exactly **one fewer** `way` entry with `diffArray` length 1.
On a match it copies `area, inside, coords, coordsOutside, coordsInside, way, coordsInside, walls` onto the
old room (preserving `color`, `name`, `surface`, `wallTexture`); otherwise the room is a **new** `ROOM`
entry with `action:'add'`, `color:'gradientWhite'`, `name:''`. Rooms with no match are collected and
`splice`d out. **Rooms therefore survive a one-vertex change (a joint, a collinear split) with their
colour/name intact, but a topologically different merge produces a brand-new anonymous room.** The
matching also uses a tolerant `way.length ± 1` window plus a full-coords fallback, which is why a moved
wall can still "be the same room". (**OBSERVED** decoded `deob/floorplanEditor.js` `roomMaker`.)

**Room identity survives edits — verified end to end.** Driving the same paths by hand
(`evidence/rooms-probe4-identity.json`), a room named `Kitchen` with a colour and a wall texture kept
**all three** across (a) a joint that split one bounding wall (loop grew 5 → 6 vertices, area unchanged)
and (b) a +20 px move of one wall (area correctly recomputed 111 744 → 117 504 px²). Only a topology
change that removes the loop destroys it: deleting an exterior wall gave **0 rooms** and the name/colour
were gone. This is `roomMaker`'s matching window doing real work, and it is the behaviour to copy.
(Colours/textures are normalised with an `extension-floorplanner-` prefix on the way in.)

**Openings (doors/windows).** These are `OBJDATA` entries with `family:'inWall'`, `class:'doorWindow'`,
plus `x, y, angle, size, height3d, limit`. They are **not** part of any room polygon and
`polygonIntoWalls` never reads `OBJDATA`. Confirmed experimentally: adding a gap-sized break in a shared
wall, and adding a doorway in the wall, both leave the two rooms detected exactly as if the wall were
solid. (**OBSERVED** decoded `planner-main.js`/`qSVG.js`; probe `E_doorway_gap`.)
Consequences:
- Deleting a wall does **not** delete its openings; they remain in `OBJDATA` at their old `x,y,angle` —
  i.e. **orphaned in mid-air**. The vendor's own model check reports exactly this:
  `bim.issue.openingNoWall = '{name} is not inside a wall.'` (**DOCUMENTED** round-1
  `evidence/i18n-app.json`.)
- Because the room layer ignores openings, **a room is "closed" even when it has a doorway** — the app
  never asks whether the loop is *door-free*, only whether the walls form a cycle.
- A wall that is *moved* keeps its openings parametrically (see 2.7b). A wall that is *replaced* — the
  joint split and the Cut tool `splice` the old wall out and push new objects — loses them, because the
  openings' `wall` pointer now refers to a record that is gone and their cached `x,y,angle` no longer
  satisfy `objFromWall` (`nearPointOnEquation(...).distance < 0.01` **and** inside both endpoint `btwn`
  tests). That is the mechanism behind the vendor's own warning *"Note: this may remove windows or doors
  already on that wall."*

**Deletion, exactly as the trash button does it** (decoded):
```
for each w in WALLS: if (w.child === victim) w.child = null; if (w.parent === victim) w.parent = null
WALLS.splice(WALLS.indexOf(victim), 1)
victim.graph.remove()                       // SVG paths
architect(WALLS)                            // re-link + re-polygonise + reconcile rooms
floorplanSave()  →  mode = 'select_mode'
```
(**OBSERVED** decoded `planner-main.js` `extension-floorplanner-wallTrash` click handler.)
The Delta-rule is worth copying: the *neighbours are relinked from scratch* by `wallsComputing` rather
than by the delete handler, so deleting a wall also makes any now-collinear neighbours unlink.

### 2.7b The opening-preservation pipeline (how openings survive a moved wall)

This is the clearest "hidden" mechanism in the app and it directly answers *what happens to openings when a
wall is moved*. Openings are never re-derived from geometry; they are tracked by a **wall-relative
parameter `u` ∈ [0,1]** and a **snapshot/restore pair**:

```
snapshotWallObjects(walls)                 // before a drag/resize starts
  for each wall, for each opening on it (objFromWall):
     u = wallParamOf(wall, opening)        // 0..1 along the wall (arc: arcParam().u)
     push {wall, obj, u, fromStart:u*L, fromEnd:(1-u)*L, start, end}

reseatWallObjects(snapshot, keepU)
  for each entry whose wall is still in WALLS and length L > 0:
     if (!keepU)  // wall endpoints changed
        if start unchanged -> u = fromStart / L
        else if end unchanged -> u = 1 - fromEnd / L
     u = clampOpeningU(wall, opening.size, u)      // keep the opening fully on the wall
     placeOnWall(wall, obj, u ?? clamp(u))         // re-derive x, y, angle, limit
```
`clampOpeningU` returns `null` when `size/2 > wallLength` (the opening no longer fits) and otherwise
clamps `u` to `[halfSize/L, 1 - halfSize/L]`. `placeOnWall` recomputes `x, y, angle (= wallDeg + 180·angleSign)`
and `limit = openingLimits(frame, size)` — the two endpoints of the opening's own extent along the wall.
`objFromWall` is the membership test: for straight walls it is `perpendicular distance < 0.01` **and** the
opening's `x`/`y` inside the wall's bounding `btwn` test; for arc walls `arcNearest(...).inside &&
distance < 0.5`. (**OBSERVED** decoded `deob/floorplanEditor.js` `snapshotWallObjects`, `reseatWallObjects`,
`clampOpeningU`, `placeOnWall`, `objFromWall`.)

Call sites confirm the design:
- **straight/arc wall drag** (`_MOUSEMOVE` `bind_mode`): snapshot the arc-hosted openings at drag start →
  `wallsComputing(WALLS,'move')` → `reseatWallObjects(arcOpeningsRun, false)` → `polygonize(WALLS)`.
  Straight-wall openings are re-seated per-frame through the `equationsObj` perpendicular intersections;
  `arcOpeningsRun` carries the ones on curved walls. (**OBSERVED** decoded `planner-main.js`.)
- **curve/bulge drag**: `bulgeOpeningsRun = snapshotWallObjects([wall])` at start; on release,
  `architect(WALLS)` then `reseatWallObjects(bulgeOpeningsRun, true)` — `keepU` **true**, so the openings
  keep the same 0–1 parameter while the arc length changes. (**OBSERVED** decoded `planner-main.js`.)

So a moved wall keeps its openings **as long as the wall object survives and the opening still fits**, and
the opening's placement is *parametric*, not geometric. Only ops that **replace** the wall object — the
"Add joint" split and `splitWall`/`splitCurvedWall` (the "Cut" tool) — break the link, because they
`splice` the old wall out and push brand-new `wall` objects; that is the mechanism behind the vendor's own
warning *"Note: this may remove windows or doors already on that wall."* (**OBSERVED** decoded
`floorplanEditor.js` `splitWall`, `splitCurvedWall`; **DOCUMENTED** `msg.addJointNote`.)

`splitWall` in full (decoded): find every other wall crossing this one, keep intersections with
`5 < distance < wallLength` (so crossings within 5 px of an end are ignored), sort by distance, null every
`parent`/`child` pointing at the victim, `splice` the victim out, then push one new wall per sub-span and
finish with `architect(WALLS)`. `splitCurvedWall` is the arc version, filtering crossings by
`arcParam().u * arcLength > 2` on both sides and rejecting crossings within 1 px of an earlier one, and it
preserves `type` (`'separate'` stays `separate`) and re-derives each sub-arc's `bulge` via `subArcBulge` +
`clampBulge` (an unclampable sub-arc simply loses its bulge, i.e. becomes straight).

### 2.7c Two detection quirks worth knowing

- **`coords` is the centre-line loop but `area` is the inner-face area.** Comparing `areaRoom(vertex, way)`
  against the shoelace of `coords` therefore disagrees by the wall thickness; the two "same room?" tests
  in `roomMaker` compare `way` and `coords` — consistent with each other — while the *area* threshold uses
  the inner face. (**OBSERVED** decoded `qSVG.js`; verified numerically in 2.4.)
- **Duplicate walls are only half-tolerated.** A duplicated segment is kept in `WALLS` (5 walls → 1 room,
  probe `dupWall`) because the face walk de-duplicates loops, but *overlapping collinear* walls
  (0–250 and 150–400) yield **zero rooms** — the planar sub-division loses the crossings. The app's model
  check does flag duplicates after the fact (`bim.issue.dupWall`). (**OBSERVED** `rooms-probe2.json`;
  **DOCUMENTED** round-1 i18n.)
- **Curvature is ignored by room detection.** Setting `bulge` on a room's walls (one wall, or all four)
  left the room detected with **exactly the same area** as the straight square (111 744 px²), and two
  opposing arc walls alone closed **no** room — consistent with `junctionList` skipping arc pairs
  (`!wallArc(a) && !wallArc(b)`). Caveat: `wallArc()` returned null for my hand-assigned `bulge` values, so
  it is possible the bulges were never treated as valid arcs; the area-unchanged result is the reliable
  part. (**OBSERVED** `evidence/rooms-probe3-arc.json`; see Unknown 4.)

### 2.8 Shared walls, quantified (closes round-1 Unknown #5)

Probe `C_shared_wall` (two rooms, one wall at x=400) produced the doubly-linked ring:
```
w0 (0,0→400,0)  parent=3  child=4
w1 (400,0→400,300) parent=0 child=6     ← the shared wall: parent/child are the top and bottom walls
w2 (400,300→0,300) parent=1 child=3
w3 (0,300→0,0)   parent=2 child=0
w4 (400,0→800,0) parent=0 child=5
w5 (800,0→800,300) parent=4 child=6
w6 (800,300→400,300) parent=5 child=1
```
So "shared wall" is not a special object: it is an ordinary wall that ends up in **both** rooms' `way`
loops. Because it is consumed by both loops, it renders as a single thin slab in 3D and each room keeps
its own inner-face offset. Note the model-check string `bim.issue.dupWall = '{a} and {b} are the same
wall.'` — the app does flag accidental duplicates. (**OBSERVED** decoded source + `cases.C_walls`;
**DOCUMENTED** round-1 i18n.)

### 2.9 Room identity, area reporting and 3D

- `globalArea` sums `area` only for rooms with `action === 'add'` and is shown in
  `#extension-floorplanner-areaValue`; a room can be marked otherwise by the AI/vectoriser or by
  loading. (**OBSERVED** decoded `planner-main.js` `roomMaker`.)
- `roomMaker` also emits the per-room angle annotations (`extension-floorplanner-boxAngles`) and calls
  `window.drawRoomSkirtings()` inside a try/catch, so skirting/ceiling are derived from the room polygon,
  not from the walls. (**OBSERVED** decoded `roomMaker`.)
- `bridge3d.js` sends `rooms` (coords stripped of SVG handles) **and** `polygons` (from `Rooms.polygons`)
  to the 3D side, keyed by a rounded-coordinate join of `coords` (`round(1000*x)/1000 + ',' + ...`), so a
  room's 3D floor slab can be matched back to its 2D styling. (**OBSERVED** decoded `deob/bridge3d.js`
  `_0x558613`, `_0x2f3720`.)
- The 3D app's own model check has a room-flavoured complaint for exactly the case in 2.4:
  `eff.noRooms = 'No room found: close the walls of a room or draw its floor.'` (**DOCUMENTED** round-1
  i18n.)

### 2.10 Manual "draw the floor" fallback

`norms.noRooms = 'Draw named rooms (floors with a name) to get the requirements of each room.'` and
`eff.noRooms` both imply a manual fallback: you can create a floor polygon directly instead of closing
walls. (**DOCUMENTED** i18n; **INFERRED** that the 2D planner's room objects are also created by the
"Rooms" tool, which only *styles* a detected room, so the manual path is the 3D/dims layer.)

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. "Schema" refers to `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

| # | Idea | Tied to | Effort | Value |
|---|---|---|---|---|
| 1 | **Make rooms derived, not authored — add a `polygonize(walls)` step after every wall mutation and keep one `rooms` table keyed by a stable id.** 3DHP's entire room model is one pure function over `WALLS`; this removes a whole class of sync bugs (room out of sync with walls) and makes shared walls automatic. | 2.3, 2.7 | M | ★★★★ |
| 2 | **Reconcile room identity across re-detection instead of recreating rooms.** Copy 3DHP's `roomMaker` matching (same loop / ±1 vertex / identical coords) so a room keeps its name, colour, texture and furniture assignment when a joint is added or a wall is nudged — verified to work for both. Pair it with a **"this edit removes room X"** confirmation when a deletion would open the loop, because 3DHP silently destroys the room (and its name) in that case. | 2.7 | M | ★★★★ |
| 3 | **Store openings as a wall-relative parameter `u ∈ [0,1]` (plus cached x/y/angle) and re-seat them after every wall geometry change.** 3DHP's `snapshotWallObjects` → `reseatWallObjects` pair plus `u = fromStart/L` (or `1 - fromEnd/L` when only the end moved) is exactly this; it is far more robust than re-deriving an opening's host from its coordinates. Copy `clampOpeningU`'s rule (return `null` when `size > wallLength`). | 2.7b | M | ★★★★ |
| 4 | **Carry the transform across a split: split/cut must be the only destructive op.** 3DHP loses openings on split because it `splice`s the old wall record and pushes new ones. If CasaPlazAI splits a wall, re-parent each opening to the sub-wall containing its `u` and re-normalise `u`, so the vendor's own warning ("may remove windows or doors") never applies. | 2.7b | S | ★★★★ |
| 5 | **Show a live "rooms detected: N" affordance while drawing walls**, plus a non-blocking chip on each detected room with its area. 3DHP silently recomputes rooms with no indicator, which makes the 0.1 m² threshold feel like a bug. CasaPlazAI can beat it cheaply. | 2.3, 2.4 | S | ★★★ |
| 6 | **Add an explicit "Add joint / split wall" tool that is a *split*, and say so.** Model it as: split wall at parameter `t`, produce two walls sharing a new vertex; keep openings if still on a wall; warn when they are not. | 2.5, 2.6 | M | ★★★ |
| 7 | **Adopt the ±`thick/2` inner-face polygon for area and floor slabs, and show both gross and net area.** 3DHP's room polygon is the inner face; that is what makes its area labels match reality. Add courtyard/hole support (`inside[]`) since 3DHP already does it — and note it keeps the **centre-line loop in `coords`** while `area` is the inner face, so a naive renderer of `coords` overlaps the walls. | 2.3, 2.4, 2.7c | M | ★★★ |
| 8 | **Keep geometry derived and persist only presentation.** 3DHP stores `area/coords/coordsInside/outsideArea/realArea` on the recomputed object and only carries `name/color/wallTexture` across re-detection — a clean split to copy into the CasaPlazAI room record. | 2.7, 2.2 | S | ★★★ |
| 9 | **Guard the detection thresholds and degenerate inputs.** Reject `area < ~0.1 m²`, and explicitly reject *overlapping collinear* walls (3DHP's detector returns 0 rooms for a 0–250 + 150–400 overlap — a silent failure). Prefer merging/deduping on insert. | 2.4 | S | ★★★ |
| 10 | **Use the wall-thickness change as a model event, not a paint change.** 3DHP re-offsets every room polygon when thickness changes because rooms are the inner faces; do the same so furniture fit checks stay correct. | 2.4, 2.6 | M | ★★ |
| 11 | **Add "Cut wall at every crossing" and "Make separation wall" as first-class wall ops.** They are cheap once walls are a graph, and they are exactly the operations users reach for when they *meant* to draw two rooms. | 2.6 | S | ★★ |
| 12 | **Keep the local-storage undo as JSON snapshots but cap it (3DHP uses 50) and flush on `pagehide`/debounce ~500 ms.** CasaPlazAI already autosaves; matching the debounce+flush pattern avoids losing the last edit on tab close. | 2.2 | XS | ★★ |

Schema notes: idea 1 maps naturally onto CasaPlazAI's existing wall list — rooms should be a **derived
view** with a persisted `id` + presentation fields (`name`, `color`, `floorTexture`, `roomType`) while
geometry (`polygon`, `area`, `holes`, `innerPolygon`) is recomputed. Idea 3 wants two fields on each
opening: `hostWallId: string | null` and `u: number` (0–1 along the host), with `x/y/angle` kept only as a
cached render fallback — then "opening orphaned" is representable, and a wall move is a pure re-projection.

---

## 4. Unknowns

1. **`polygonIntoWalls`'s `walls[]` array is still unexplained.** Its *return shape* is now decoded
   (`{inside, outside, walls, dense}` with closed loops) and the ±`thick/2` construction is confirmed, but
   my probes read `walls` as empty in every run, so I cannot say what it is meant to carry. Related: how
   `inside`/`outside` are disambiguated when the loop runs clockwise vs anticlockwise is inferred from
   `rayCasting` use, not read.
2. **The 360 px² constant's provenance.** Observed as a literal (`0x168`) guarded by `bypass`; I did not
   find where (or whether) it is configurable, nor whether the metric is the value of `parseInt(area)` as
   px² after the units conversion (my maths says yes: 360/3600 = 0.1 m², and a 0.1 m² room is smaller than
   any real door).
3. **`vertexList`'s `segment`/`child` arrays** are built but I did not fully decode how `segmentTree`'s
   "next clockwise" comparator handles exactly-collinear or duplicated angles; the collinear-chain probe
   shows it copes, but the tie-break rule is unread.
4. **Arc (`bulge`) walls inside room detection.** `polygonize` dispatches to `polygonIntoCurvedWalls` and
   `junctionList` skips arc pairs, so an *all-arc* loop is probably not detectible; my probe confirms
   bulged walls do not change a room's area, but `wallArc()` rejected my hand-set `bulge` values, so I
   never got a *valid* arc into the detector. Round-1 Unknown #9 (bulge/radius semantics) remains open for
   the room case; the arc tool commits a wall only when `clampBulge` returns a value.
5. **The 3D side's own room/floor construction** (how `rooms`/`polygons` become Babylon meshes, and
   whether the 3D app ever edits rooms back into the planner) is inferred from `bridge3d`'s state shape
   only; I could not deobfuscate the 3D modules with the live-page decoder because their decoders are
   module-scoped, and my offline rotation solver did not converge (see `tools/rot-solve.mjs`). A future
   run could attach a debugger or use the `--format` capture tools to read `HPSync.applyPlan`.
6. **`Cut` through the UI.** `splitWall`/`splitCurvedWall` are decoded (find every crossing at
   `5 < d < wallLength`, splice the victim, push one wall per sub-span), so the *algorithm* is known, but I
   did not click the Cut button to confirm the UI reaches exactly these functions and what it does to
   openings in practice (see 2.7b for the expected outcome).
7. **Openings' `limit` array and `height3d`** are stored per object; I did not verify how the 3D layer
   clamps an opening when its host wall shrinks after a joint split (the warning implies it can be lost).
8. **Not exercised:** the AI/vectoriser path (`floorplan-ai-vectorizer`) which can create rooms directly,
   and the DXF import path that reports "`{n} walls created from the DXF lines`" — both are alternative
   sources of the same `WALLS` array and may bypass `roomMaker`'s reconciliation.

---

### Evidence files (this job)

| File | What it is |
|---|---|
| `evidence/planner/*.js` | 11 original 2D-planner modules, fetched as served (obfuscated). |
| `deob/*.js` | Same modules with **all 17 577** decoder calls replaced by exact string literals (live-page decode). |
| `deob/floorplanEditor.js` | Contains `architect`, `roomMaker`, `wallsComputing`, `splitWall`, `reseatWallObjects`. |
| `deob/qSVG.js` | Contains `polygonize`, `junctionList`, `vertexList`, `segmentTree`, `polygonIntoWalls`, `areaRoom`. |
| `deob/planner-main.js` | Contains `node_mode` joint, wallTrash delete, `serializePlan`, autosave. |
| `deob/bridge3d.js` | 2D→3D plan state `{meter, walls, objects, rooms, polygons}`. |
| `evidence/planner-i18n.json` | 2D planner's 905-key i18n dictionary (served text). |
| `evidence/rooms-probe.json` | Live API run: closed loop, open loop, shared wall, T, gap, delete, nested, L, cross. |
| `evidence/rooms-probe2.json` | Live API run: area threshold, thickness sweep, overlap, collinear, move, dangling. |
| `evidence/rooms-probe3-arc.json` | Live API run: bulge/arc walls vs room detection (`scripts/arc_probe.mjs`). |
| `evidence/rooms-probe4-identity.json` | Live API run: room name/colour/texture survival across joint, move, delete (`scripts/identity_probe.mjs`). |
| `evidence/three/*.js` | 3D modules copied from round-1 evidence (module-scoped decoders — see Unknown 5). |
| `scripts/rooms_probe.mjs`, `scripts/rooms_probe2.mjs`, `scripts/arc_probe.mjs`, `scripts/identity_probe.mjs` | The four live experiments. |
| `scripts/fetch_planner.mjs`, `tools/deob5.mjs` | Fetch + exact live-page deobfuscation. |
| `tools/rotation.mjs`, `tools/rot-solve.mjs` | Rotation-count replay / offline rotation solver (partial). |
