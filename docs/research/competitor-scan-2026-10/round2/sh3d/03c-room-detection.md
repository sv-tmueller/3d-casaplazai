# Sweet Home 3D — Double-click room detection: polygon derivation, inset, door thresholds, edge cases

Job folder: `rea2-sh3d-p2/01-03c-walls-rooms-drawing-room-det`
Research date: 2026-10-31 · REA v6.8.0 · live app **Sweet Home 3D JS Online 7.5.2** (headless Chromium 153, `www.sweethome3d.com/SweetHome3DJSOnline.jsp`) · reference Java trunk 7.4.0.
Round 2: builds on `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md` (read-only). Narrow question: **the algorithm behind "double-click inside a closed wall loop → room polygon"** — how the polygon is derived from wall paths, inset to wall faces, door-threshold handling, edge cases.

**Claim tags**
- **OBSERVED** — I drove the live app / read shipped files myself; evidence file in this folder.
- **DOCUMENTED** — vendor user guide / source comments (URL or path given).
- **SOURCE-VERIFIED** — I read the GPL Java (`keich/SweetHome3D@825635f`, v7.4.0) and/or the shipped GWT JS bundle (7.5.2) and describe the algorithm in my own words; no code copied.
- **INFERRED** — my reconstruction or mapping to CasaPlazAI; not stated by the vendor.

**Licence / reuse note** — Sweet Home 3D is **GPLv2+** (`SweetHome3D-master/src/.../Home.java` header: "Copyright (c) 2024 Space Mushrooms … GNU General Public License … version 2"). Its source was consulted **read-only as a reference**; no code has been or should be copied into CasaPlazAI. Only behaviour, algorithms and data models are described here, in my own words.

---

## 1. Summary (5 bullets)

1. Detection is a **boolean geometry pipeline, not a graph traversal**: every wall is turned into a thin rectangle (its `getPoints()` outline, already mitered at joins), all rectangles are unioned into one Java2D `Area` of wall *footprints*, and the enclosed free-space loops fall out as that `Area`'s **holes**. **Measured winding: the hole/room rings are CCW (positive signed area, e.g. +114806 cm²) and the outer envelope ring is CW (−125306 cm²)** — the opposite of my first guess, and there is **no explicit sign filter** in the code: `computeRoomPointsAt` simply returns the first ring whose `contains(click)` is true. The polygon is the **inner wall face polyline**, mitred to the exact intersection of the two walls' faces. **(SOURCE-VERIFIED + OBSERVED)**
2. The click test is the literal `roomPath.contains(clickX, clickY)` **on the ring itself** (not `getInsideWallsArea`, which exists only to keep the wall band solid). Because the outer envelope ring *also* contains interior points, clicking inside the wall band (or exactly on a wall) resolves to the **building envelope** rather than a room — a real UX trap that falls straight out of the algorithm. **(SOURCE-VERIFIED + OBSERVED)**
3. Door thresholds are added in a second pass **on top of the detected polygon**: for each visible ground-level door/window whose footprint is a 4-point rectangle, the algorithm builds a small quad reaching from the wall opening across the door band and **unions it into the room path**, so the polygon stitches across the doorway and stays topologically closed. Walls-based only — rooms detected with *no* doors are just the inner boundary. **(SOURCE-VERIFIED + OBSERVED)**
4. **Edge cases are handled with permissive, "best-effort" rules**: a non-singular door∩wall intersection or an off-by-one corner makes the algorithm `break` and fall back to the simplest variant; overlapping doors produce a tiny duplicate-point artefact; and a door placed *on* a wall corner produces a 12-point self-touching polygon. Unclosed wall sets still produce rings, but the enclosed region's `contains()` is mostly false, so detection typically returns `null`. **(OBSERVED)**
5. **Round (arc) walls** are tessellated by the wall itself into a polyline (segments sized by arc length) *before* the area union, and the arc's inner face is what the room polygon follows — so a curved wall yields a many-vertex room. The room point list **never repeats the first vertex**, but the app **does not enforce a winding** at detection time (the measured hole rings happen to be CCW). **(SOURCE-VERIFIED + OBSERVED)**

---

## 2. Findings

### 2.1 Where the algorithm lives

| Layer | Symbol | Evidence |
|---|---|---|
| Java (7.4.0) | `PlanController.computeRoomPointsAt(x,y)` (private), `getRoomPathsFromWalls()`, `getAreaPaths(Area)`, `getWallsArea(boolean)`, `getPathPoints(GeneralPath,boolean)`, `getPath(Area)`, `getPath(float[][])` | `sources/java/viewcontroller/PlanController.java.utf8` lines 4363–4524, 8507–8664 |
| Java (7.4.0) | `Wall.getPoints()` / `getShapePoints` / `getUnjoinedShapePoints` / `computeIntersection` | `sources/java/model/Wall.java` lines 760–1080 |
| Java (7.4.0) | `HomeDoorOrWindow.isWallCutOutOnBothSides()`, `HomePieceOfFurniture.isParallelToWall(Wall)`, `getPoints()` | `sources/java/model/HomeDoorOrWindow.java.utf8` (§315), `sources/java/model/HomePieceOfFurniture.java.utf8` lines 1667, 1782 |
| Java (7.4.0) | `Room.setPoints/addPoint/removePoint/getPointIndexAt/getArea/isClockwise` | `sources/java/model/Room.java.utf8` lines 239–335, 690–800 |
| Live JS 7.5.2 | `computeRoomPointsAt`, `getRoomPathsFromWalls`, `getAreaPaths`, `getWallsArea`, `getPathPoints`, `getVisibleDoorsAndWindowsAtGround` are present **under their original Java names** (GWT) and **byte-equivalent in logic** to 7.4.0 | `out/js_computeRoomPointsAt_0.js`, `out/js_getRoomPathsFromWalls_0.js`, `out/js_getAreaPaths_0.js`, `out/js_getWallsArea_0.js`, `out/js_getPathPoints_0.js`, `out/js_getVisibleDoorsAndWindowsAtGround_0.js`; and the live call-path exercised in `out/p2_detection.json`, `out/p4_doors_arcs.json` |

**OBSERVED** (`out/p1_globals.json`): in the live page the GWT classes are global — `window.Wall`, `window.Home`, `window.Room`, `window.PlanController`, `window.HomeDoorOrWindow`, `window.HomeFurnitureGroup` are all constructors — and the controller instance exposes `computeRoomPointsAt`, `getRoomPathsFromWalls`, `getAreaPaths`, `getWallsArea`, `getPathPoints`, `resetAreaCache`, `createRoom`. That lets the app's **own** algorithm be driven with controlled wall sets, which is how §2.4–2.7 were measured. (No Java runtime was present on this machine, so the Java source was read, not executed; the identical-name JS in the shipped 7.5.2 bundle was executed instead.)

**INFERRED**: the 7.4.0 Java read and the 7.5.2 JS read match function-for-function for this pipeline, so behaviour measured live generalises to the documented algorithm. I flag the version gap (7.4.0 vs 7.5.2) explicitly rather than treating it as identical.

### 2.2 Step 1 — wall footprints → one `Area` of walls

`getWallsArea(includeBaseboards=false)`:
- for every wall **at the selected level** (`Wall.isAtLevel`), build a `GeneralPath` from `wall.getPoints(false)` and `Area.add(...)` it into one accumulator;
- the result is cached (`wallsAreaCache`) and **invalidated** (`resetAreaCache`) whenever a wall is added/deleted, or a wall property changes (`X_START, Y_START, X_END, Y_END, WALL_AT_START, WALL_AT_END, THICKNESS, ARC_EXTENT, LEVEL, HEIGHT, HEIGHT_AT_END, LEFT/RIGHT_SIDE_BASEBOARD`), or the selected level changes. **(SOURCE-VERIFIED)** `PlanController.java` lines 2470–2601, 6069, 8612–8632.

`Wall.getPoints()` is the key input to the inset:
- **straight wall** (`Wall.getUnjoinedShapePoints`, lines 991–1013): the 4 corners of a rectangle of width `thickness`, offset `±thickness/2` on each side of the centre line. For the segment (0,0)→(400,0), thickness 7.5, this is `(0,∓3.75)…(400,∓3.75)`.
- **joined wall** (`Wall.getShapePoints`, lines 804–935): each end that is joined to a neighbour **replaces the butt-end corners by the intersection of the two walls' face lines**, computed by `computeIntersection(..., limit)` where `limit = 2·max(thisThickness, neighbourThickness)` — i.e. a genuine **mitre/bevel joint**. If the two computed points coincide within `epsilon = 0.01` they are shared by reference to avoid rounding drift in areas. This is why the detected polygon corners come out as exact face intersections rather than naive offsets.
- **round wall** (`arcExtent ≠ 0`): the wall contributes a **polyline of arc points**, stepping by an angle chosen from the exterior arc length (`angleDelta = arcExtent / sqrt(exteriorArcLength)`), with exterior radius `r + t/2` and interior radius `max(0, r − t/2)`. So a curved wall arrives at the area union already tessellated. **(SOURCE-VERIFIED)** `Wall.java` lines 940–1034; **OBSERVED** in `out/p2_detection.json` (`arch_left`/`arch_right`/`round_loop`: 19–22-point paths). **DOCUMENTED** (source comment): the non-symmetric branch exists only so pre-3.0 walls keep their exact appearance.

### 2.3 Step 2 — free-space loops from the `Area` (`getAreaPaths`)

`getAreaPaths(area)` flattens the `Area` with a **flatness of 0.5** and walks the `PathIterator`:
- `SEG_MOVETO` opens a new `GeneralPath`;
- `SEG_LINETO` appends unless the point equals the previous one or is within `1E-10` distance-squared (dedup);
- `SEG_CLOSE` closes the path and adds it to the list.
**(SOURCE-VERIFIED)** `PlanController.java` lines 8570–8597; JS `out/js_getAreaPaths_0.js` uses the same `0.5` flatness and `1e-10` threshold.

The crucial, non-obvious step is **how the rings fall out of the `Area`**:
- Java2D `Area` emits the outer contour and each hole contour as separate rings; my measurement fixes the winding convention for this pipeline: **holes (rooms) are CCW → positive shoelace area, the outer boundary is CW → negative** (`rect_7_5`: inner +114806.2, outer −125306.2; `unclosed`: single ring −8250.0). The app applies **no sign filter** in `getRoomPathsFromWalls` (line 8555) — it returns all rings, and selection is by click containment alone. **(OBSERVED)** `out/p2_detection.json`, `out/p4_doors_arcs.json`; signed areas recomputed from the stored raw point lists.
- My live probe confirms the ring count and identity: for a plain 4-wall rectangle the ring list is **exactly two** rings — one inner (`bounds [3.75, 3.75, 392.5, 292.5]`) and one outer (`bounds [−3.75, −3.75, 407.5, 307.5]`). **(OBSERVED)** `out/p2_detection.json` `rect_7_5`, `out/p5_contains_and_edit.json` `closed_rect`.
- `insideWallsAreaCache` = walls area ∪ all those room paths — i.e. the solid wall band plus its holes = the **building envelope**. **(SOURCE-VERIFIED)** lines 8556–8562.

`getPathPoints(path, removeAlignedPoints)` then converts one ring to a point list: it drops the closing point if it repeats the first, drops exact duplicates, and when `removeAlignedPoints` is true collapses a point that is collinear (distance < `1E-4`) with the last added segment — a light vertex simplification. **(SOURCE-VERIFIED)** lines 8510–8544; JS `out/js_getPathPoints_0.js`.

**The inset, stated precisely**:
- Intuitively, every wall is a thin rectangle; unioning them leaves the enclosed free space as the union's hole, and the hole's boundary *is the inner wall faces*. Mathematically the "distance-to-wall" teeth are extra sub-loops that the boolean merges away, so they do not survive as separate holes. My probe confirms the enclosed-region `contains()` grid: exactly one room ring is *strictly* inside the room. **(OBSERVED)** `out/p5_contains_and_edit.json` `closed_rect` path 0: `(200,150)`→`true`, `(1,150)`→`false`, `(200,10)`→`true`, `(200,301)`→`false`; and `bounds = [3.75, 3.75, 392.5, 292.5]` for 7.5 cm walls on a 400×300 rectangle — i.e. the inset is exactly **half the wall thickness on each side (3.75 cm)**.
- The general statement for a corner is the **mitred face intersection**, not an offset by a constant: for a **20 cm** wall the inset is 10 cm (`bounds [10,10,380,280]`), and with **mixed 7.5/20 cm** walls the polygon is `[[390,3.75],[390,296.25],[10,296.25],[10,3.75]]` — x inset 10, y inset 3.75 per side. **(OBSERVED)** `out/p2_detection.json` `rect_20`, `mixed_thickness`.

### 2.4 Step 3 — path selection from the click

`computeRoomPointsAt(x,y)` iterates the ring list **in order** and returns on the **first** ring whose `contains(x,y)` is true. **(SOURCE-VERIFIED** lines 4367–4369; JS `out/js_computeRoomPointsAt_0.js`). `getRoomPathsFromWalls()` invalidates and rebuilds only when the cache is null, so the ring order is the order Java2D produced.

Consequences measured with the live algorithm:

| Probe (400×300, 7.5 cm walls) | Result | Meaning |
|---|---|---|
| `(200,150)` centre | returns the **inner** ring, 4 pts, area 114806.25 cm² | normal case |
| `(1,150)`, `(3.5,150)`, `(0,0)` — inside the wall band | returns the **outer** ring, 4 pts, area 125306.25 cm² | `contains()` honoured the wall band → "room" = building envelope |
| `(200,0)` on the wall centre | outer ring | same |
| `(4,150)`, `(10,150)` just inside | inner ring | the inner ring's boundary is the exact face at 3.75 |
| `(200,350)` outside | `null` | no ring contains it |
| `(10,10)` corner | inner ring | corner inside the room |
| `(4,4)` | inner ring | this point is inside the room's corner **because the inner ring is mitred to the exact face intersection** (the naive per-wall offset would have excluded it) |

**(OBSERVED)** `out/p2_detection.json` `rect_7_5`, `out/p5_contains_and_edit.json` `closed_rect`. A second useful consequence: with an **interior partition**, the same click point selects one of the two rooms (two inside rings, each with 4 points, area 56306.25 each) and a click **on the partition wall** selects the envelope instead. **(OBSERVED)** `partition_full`, `door_on_partition`.

**Why `contains()` and not `insideWallsArea`**: the click handler uses the *hole* rings (`getRoomPathsFromWalls`), never `getInsideWallsArea` — the latter is computed only to keep the wall band solid. This also explains why the room-path list's numbers stay small and `getInsideWallsArea` uses exactly the same cache.

### 2.5 Step 4 — the door threshold ("half doorstep")

`computeRoomPointsAt` continues inside the selected ring by looping `getVisibleDoorsAndWindowsAtGround(home.getFurniture())` — visible at the selected level, `elevation == 0`, descending into `HomeFurnitureGroup`s, `isDoorOrWindow()` only. **(SOURCE-VERIFIED)** lines 4372, 4529–4541. For each piece whose footprint is a 4-point rectangle it computes `intersectionCount = #doorPoints inside roomPath` and builds one of two "doorstep" quads (constant `epsilon = 0.05`):

**Path A — `HomeDoorOrWindow && isWallCutOutOnBothSides()`** (a door that cuts the wall through, i.e. the normal door/window opening):
1. `doorArea = Area(getPath(doorPoints))`, `wallsDoorIntersection = ∪ over selected-level walls with door.isParallelToWall(wall) of (wallPath ∩ doorArea)`, using **`wall.getPoints()` (the outline incl. its thickness)**.
2. If that intersection is non-empty and **`isSingular()`**, take its 4 points. With a cloned door whose **plan depth is increased by `4·wallThickness`**, re-intersect to guarantee the wall is cut through on both sides; keep only if it stayed singular.
3. Compute the door's **middle-of-wall line**: `doorMiddleY = y + depth·(−0.5 + wallDistance + wallThickness/2)` — the two points `(x ± width/2, doorMiddleY)` rotated by the door angle. This is the "**half doorstep**": from the wall face out to the *middle* of the wall band, not the full depth.
4. Match the 4 intersection points against the room path with an `epsilon`-sized rectangle intersection test (deliberately a rectangle test, because point tests miss grazing points), classify them as inside/outside the room, and **replace the two outside points by the two door-middle points**; keep the two inside points.
5. `union` the resulting quad into `roomPath` after **scaling it about its own centre by `(min + epsilon)/min`** so the union merges into a single path instead of two.

**Path B — fallback, `doorStepPoints == null && intersectionCount == 2`** (a plain piece flagged as a door/window, or the singular-test failed): intersect `getWallsArea(false)` with the door rectangle, take the 4 points, and for the two points outside the room set each to the **midpoint between itself and the paired inside point** — again the half-depth stub.

All of this is wrapped in the guard `if (doorStepPoints != null)`. **(SOURCE-VERIFIED)** lines 4370–4518; JS `out/js_computeRoomPointsAt_0.js` is code-for-code equivalent (same `epsilon=0.05`, same `4*f.getThickness()`, same `doorMiddleY` formula, same scale-about-centre union).

**Measured behaviour** (rect, 7.5 cm walls, door 80 cm wide at x=200 on the top wall, `wallThickness` field = 0.625, `wallDistance` = 0.188):

| Case | Detected polygon | Interpretation |
|---|---|---|
| no door | `[[396.25,3.75],[396.25,296.25],[3.75,296.25],[3.75,3.75]]`, 4 pts, area 114806.25 | baseline inner ring |
| door, `cutOutOnBothSides=true` | `[[159.47,−0.02],[153.68,3.75],[3.75,3.75],[3.75,296.25],[396.25,296.25],[396.25,3.75],[246.32,3.75],[240.53,−0.02]]`, 8 pts, area 115133.67 | **stitched doorway**: two outside points land at `y ≈ −0.02` (the door's middle-of-wall line, `wallDistance`-dependent, ≈0 not exactly 0), the others at the 3.75 face. The +327 cm² over baseline is exactly the doorstep slab. |
| door, `cutOutOnBothSides=false` | `[[153.64,−0.02],[153.64,3.75],…,[246.36,3.75],[246.36,−0.02]]`, 8 pts, area 115155.8 | Path B (midpoint) variant |
| door with `elevation=90` | baseline 4 pts, area 114806.25 | **filtered out** by `getVisibleDoorsAndWindowsAtGround` — only ground doors count |
| door width 380 | 8 pts, area 115710.48; the outside points at x=7.47 / 392.53 | the stub widens toward the corners |
| door width 500 (wider than the wall) | 8 pts, outside x=−53.33 / 453.33 | **no explicit clamp**; polygon escapes the wall, area 115941 |
| door narrow, width 8 | 8 pts, `[[195.95,−0.02],…,[204.05,−0.02]]` | threshold applied at door width, not wall width |
| door near corner (x=45) | **no threshold** (4 pts, 114806.25) | `intersectionCount != 2`, and Path A's singular test fails |
| door exactly **at** the corner (x=0) | **12 points**, self-touching (two vertices duplicate at `[16.41,2.47]`), area 114832.97 | Path A stitched against a degenerate opening — a visible artefact |
| two doors on the top wall | 12 pts, area 115384.19 | both thresholds applied |
| two overlapping doors | 8 pts, area 115360.67 | unions merge; the second door's stub re-uses the first's edge |

**(OBSERVED)** `out/p4_doors_arcs.json` (all cases above). **DOCUMENTED** (User Guide §Drawing rooms): the room "will include the half doorstep of each door placed on its walls"; recommended order is *draw walls and place doors first, then double-click each surface*. Round-1 verified this independently (`out/probe_interaction3.json`: 400×300 → polygon at 3.3/395.8, i.e. the faces).

Small caveat on the "half": the door's own `wallThickness`/`wallDistance` fields select **where the middle-of-wall line sits**; with the demo's stored values the stub lands at `y ≈ −0.02`, i.e. the middle of a 7.5 cm wall would be `y = 0`, and the ~0.02 is the door's own wall-depth offset. The **concept** is the wall-band midpoint; the exact y is a function of the door's wall parameters. **(OBSERVED + SOURCE-VERIFIED)**

### 2.6 Step 5 — assembling the room

`RoomCreationState.pressMouse` with `clickCount == 2` calls `computeRoomPointsAt`; `createRoom(points)` makes a `Room`, sets the floor colour preference, `home.addRoom(...)`. `RoomDrawingState` uses the same private method for the *draw* path. `Room.setPoints` stores the array **as given** (only the *derived* `shapeCache`/`areaCache` are invalidated). **(SOURCE-VERIFIED)** lines 14197–14212, 4367, `Room.java` 239–250.

- **Winding is not normalised by the app**, but the measured convention is convenient: detected **room (hole) rings come out CCW / positive shoelace area** (`+114806.2`, `+56306.2`, `+101906.0`, … in every measured case), while the outer envelope ring and stray degenerate rings are negative. `Room.isClockwise()` exists and is used for rendering/wall-side decisions, not to re-wind the detected points. For CasaPlazAI, whose validator requires strictly positive area (`non-ccw-polygon`), the detected polygon is *already* CCW for the common case — but the envelope ring and degenerate rings are not, so a sign check is still mandatory. **(OBSERVED + SOURCE-VERIFIED)**
- The first point is **not repeated**; `getPathPoints` strips the duplicate.
- **Area** comes from the shoelace formula (`Room.getSignedArea`), and rooms whose `Area` is non-singular (self-touching) sum the signed areas of the sub-paths.
- **Editing API (round-1 Unknowns #2, #3 — now resolved)**: `addPointToSelectedRoom(x,y)` finds the **closest polygon segment** by `Line2D.ptSegDistSq` and inserts the vertex at `closestSegmentIndex + 1`; `deletePointFromSelectedRoom(x,y)` removes the vertex found by `Room.getPointIndexAt(x,y, indicatorMargin)`; both require exactly one selected `Room` and `isItemResizable`; the **UI trigger is the plan right-click popup menu** (`HomePane.updateRoomActions`, items localised "Add point to room" / "Delete point from room" / "Recompute room points"), not a double-click. The menu item is enabled *on popup* by `isRoomPointDeletableAt(room,x,y)` / `isRoomPointsComputableAt(room,x,y)`. I confirmed the API live: on a 4-vertex room, `addPointToSelectedRoom(200,300)` produced 5 vertices with `[200,300]` inserted between the end vertices, `isRoomPointDeletableAt` returned true, `deletePointFromSelectedRoom` restored 4, and `recomputeSelectedRoomPoints` re-derived 4 points with the new 30 cm wall thickness (`[396.25,15],…,[3.75,15]`). **(SOURCE-VERIFIED** `PlanController.java` 4688–4856, `HomePane.java` 3646–3745; **OBSERVED** `out/p5_contains_and_edit.json` `roomPointEdit`.)
- **"Recompute walls" is a different feature**: the room-dialog checkbox `splitSurroundingWallsCheckBox.text=Recompute walls` (tooltip: "automatically split the walls that spread along other rooms") maps to `RoomController.setSplitSurroundingWalls` → `splitWalls(...)`, i.e. it **splits walls that span several rooms** at room boundaries, it does **not** re-derive the polygon. Round-1 Unknown #3 is hereby closed as a *misread label*: the polygon re-derivation action is "**Recompute room points**". **(SOURCE-VERIFIED)** `swing/package.properties` 2166–2168, `RoomController.java` 90–91, 418–432, 992–1013, 1120–1135; **DOCUMENTED** in the User Guide as the room dialog option "Recompute walls". Round-1's 6-wall probe (`out/probe_recompute.json`) actually shows the *room-detection* path (6 walls, one room derived), consistent with this reading.

### 2.7 Edge cases — measured

All from `out/p2_detection.json` and `out/p4_doors_arcs.json`, driving the app's own `computeRoomPointsAt`.

| Case | Walls | Rings produced | Detection | Note |
|---|---|---|---|---|
| **Open (not closed) loop**, 3 walls | ✓ | **1** ring, `n=8`, `bounds [0,−3.75,403.75,307.5]` | `null` at centre | the ring is the **inner side of the outer boundary only**; `contains()` is false for all interior probes (only the band corners `(399,150)`, `(200,−1)`, `(200,301)` are true). Detection effectively requires closure. |
| Open loop with a gap in one side | ✓ | 1 ring, `n=10` | `null` | same; the "spiral" ring never encloses |
| **L-shaped** 6-wall room | ✓ | 2 rings | inner ring `n=6` `[[396.25,3.75],[396.25,196.25],[196.25,196.25],[196.25,396.25],[3.75,396.25],[3.75,3.75]]`, area 114056.25 | reflex corner handled by the mitred faces |
| **Full partition** | 5 | **3** rings (2 inner + envelope) | click left/right → respective room; click on the partition → envelope | wall-graph "rooms" fall out of the planar subdivision for free |
| **Partition with a gap** (200,0)→(200,100) | 5 | **2** rings | inner ring `n=8` with a **6.25 cm gap stub** `[196.25,100]→[203.75,100]` around the wall tip; area 114084.375 | one connected free space, correctly |
| **Diagonal wall** across the rectangle | 5 | 3 rings (2 triangles + envelope) | probes in each half → the matching 3-point triangle (`[[396.25,3.75],[396.25,292.5],[11.25,3.75]]`, area 55584.375) | diagonal rooms are supported |
| **Two disjoint loops** | 8 | 4 rings | each loop detected independently; the point between them → `null` | loops are independent |
| **Island room** (free-standing rectangle inside a room) | 8 | 4 rings | outer area detected as the big ring; the island interior as its own small ring, area 8556.25 | the island walls' interiors are rooms |
| **Floating wall** (not joined) | 5 | 3 rings | the free-standing wall contributes a degenerate `n=4` ring (`150,96.25 … 250,103.75`) of area ≈0; click near it still resolves to the big room | unjoined wall yields a zero-area "room" ring |
| **Split side** (one side made of 2 collinear walls) | 5 | 2 rings (same as unsplit) | identical result, area 114806.25 | a wall split in two does not change the room |
| **Round (arc) wall + 3 straight** | 4 | 2 rings | room `n=22`, area 127480.56; polygon follows the arc's **inner** face (radius r−t/2) | arc tessellation becomes a many-vertex room |
| Round wall, opposite sign | 4 | 2 rings | `n=22`, area 101906.03 | arc direction changes the enclosed side |
| Arc + door | 4 | 2 rings | `n=26`, area 127807.98 | threshold stitching also works on mixed arc/straight rings |
| Closed loop containing a **round wall** | 4 | 2 rings | room `n=19`, area 31316.88 | |
| **Door thinner than a hair / wide wall / thin wall / wide door / door at corner** | — | — | see §2.5 table | |

Additional `contains()` facts measured with the live ring objects (`out/p5_contains_and_edit.json`):
- inner ring of a plain rectangle: true at `(1,150)`? **false**; `(200,301)` false; `(200,−1)` false — i.e. strictly interior.
- outer/envelope ring: true at `(1,150)`, `(399,150)`, `(200,−1)`, `(200,301)`; false at `(200,305)` (beyond the 3.75 band) and `(500,150)`.
- the "unclosed" ring: true only at `(399,150)`, `(403,150)`, `(200,−1)`, `(200,301)` — i.e. only where the open ring's own band is.

**DOCUMENTED** (User Guide, §Drawing rooms): double-clicking "anywhere inside an existing closed surface (i.e. surrounded by walls)" creates the room; the guide also warns to place doors before detecting rooms so the doorstep is included. **OBSERVED** (round 1, `probe_interaction3.json`): 7.5 cm walls on 400×300 produced 3.3/395.8 vertices — consistent with the ±3.75 face inset once the drawn wall geometry is included.

### 2.8 CasaPlazAI-relevant contrasts (schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`)

| Aspect | Sweet Home 3D | CasaPlazAI (schema v1) | Impact |
|---|---|---|---|
| Walls | explicit `Wall` objects with `wallAtStart`/`wallAtEnd` joins, per-wall thickness and level | `rooms` carry polygons; `wallThickness` is a single global; openings are `(roomId, segmentIndex, tCenter, width)` | SH3D can derive rooms from *walls*; CasaPlazAI would have to derive *walls* from rooms, or add a wall graph |
| Room winding | hole rings measured **CCW (positive area)**; outer envelope CW; no code-level re-winding — selection is by click containment only | **must be CCW** (`non-ccw-polygon`) | a detected room is usually already CCW, but envelope/degenerate rings are not — still validate and re-wind |
| Polygon vertices | inner wall faces, **not repeated first vertex** | same convention (`polygon[i] → polygon[(i+1)%n]`) | directly interchangeable once inset/winding are fixed |
| Openings | door is a furniture piece with `wallThickness`/`wallDistance`; threshold unions into the room | opening has `segmentIndex`, `tCenter`, `width`; a shared door is 2 mirrored rows | a detected room + its door list maps naturally onto `openings` |
| Door threshold | 3D correctness trick (adjacent rooms meet across the opening) | shared doors already handled by the two-row convention; no polygon stitcher exists | only needed if rooms must be **topologically closed** polygons (e.g. for floor rendering / area) |
| Per-wall height | `height`, `heightAtEnd`, per-room `wallsOverride` | `wallsOverride` per room segment | different axes — SH3D is wall-first, CasaPlazAI room-first |

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each ties to a finding and, where relevant, to the schema.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Add a "Detect room" action on a double-click inside a wall loop**, implementing SH3D's pipeline: (a) build one polygon per wall from its centre line and thickness, (b) mitre joined ends at face intersections, (c) union them into a planar region, (d) enumerate its hole rings, (e) pick the ring containing the click. Keep CasaPlazAI's manual rectangle/polygon tools as the fallback. | 2.1–2.4 | **High** — the single most-praised SH3D workflow; removes the dominant source of click fatigue | **Med** — needs a polygon-boolean step. No java.awt available in the browser: use a proven library (e.g. a clipping/offset library) or a purpose-built half-edge subdivision; do **not** port SH3D code |
| 2 | **Derive the room polygon from wall centre lines, then inset by half thickness *per wall*, mitred at corners** — i.e. reproduce the exact `[3.75, 3.75, 392.5, 292.5]` result of §2.4. For CasaPlazAI's single global `wallThickness` this reduces to a uniform inward offset with miter joins, which is far simpler than the general union. | 2.2, 2.4 | High — the visible definition of "the room" | Low-Med once (1) exists |
| 3 | **Validate the winding of every derived ring.** Measurement shows the room (hole) ring is usually CCW already, but the envelope and degenerate rings are CW — run the sign check the schema validates (`non-ccw-polygon`) and reverse when needed, and **do not** repeat the first vertex (schema convention matches SH3D's `getPathPoints`). | 2.3, 2.6 | High — otherwise a wrongly-picked envelope ring is rejected at the editor→viewer boundary | **Low** |
| 4 | **Detect multiple rooms from a partition graph in one pass**: SH3D gets planar subdivision for free, so a full partition yields two rooms and a click on the partition yields the envelope. Expose it as "fill all enclosed spaces on this floor" rather than one double-click per room. | 2.7 `partition_full` | High — turns a 2-minute job into one click | Med (same boolean machinery as (1)) |
| 5 | **Door-threshold stitching ("half doorstep")**: when a detected room polygon crosses a doorway, union a stub from the wall face to the *middle* of the wall band, so the polygon is closed and adjacent rooms meet in 3D. CasaPlazAI already has `(roomId, segmentIndex, tCenter, width)`; the stub width is exactly the opening `width`, and the depth is `wallThickness/2`. | 2.5 | Med-High — required for correct floors/areas when doors are placed before detection | Med |
| 6 | **Confine threshold stitching to ground-level door openings**: SH3D only considers pieces with `elevation == 0`; CasaPlazAI's `sillHeight == 0` (doors) is the analogue, so the rule is `kind === "door"` (or `sillHeight === 0`), never windows. | 2.5 `door_top_elev` | Med — avoids wrongly stitching windows | Low |
| 7 | **Right-click room menu: "Add point" / "Delete point" / "Recompute room points"**, mirroring `addPointToSelectedRoom` (closest-segment insertion) / `deletePointFromSelectedRoom` (`getPointIndexAt` within an indicator margin) / `recomputeSelectedRoomPoints` (re-run detection from the current walls, undoable). This is the correct reading of SH3D's "Recompute walls". | 2.6 | Med-High — makes rooms adapt to wall edits | Low-Med |
| 8 | **Do not normalise away the mitre**: when offsetting a room inward, compute each corner as the intersection of the two adjacent walls' inner face lines (and only fall back to a constant offset when the angle is too sharp). Naive per-vertex offsets shrink or overshoot sharp corners. | 2.2 | Med — geometric correctness on L-shapes/reflex corners | Low-Med |
| 9 | **Guard the threshold on degenerate placements**: SH3D produces a 12-point self-touching polygon when the door sits exactly on a corner, and lets a wider-than-wall door escape the wall. CasaPlazAI's `opening-too-wide` validator already forbids the latter; additionally skip stitching (and flag it) when the opening touches a polygon vertex. | 2.5, 2.7 | Med — avoids a class of rendering/area bugs | Low |
| 10 | **Support curved/arc walls in the detector by tessellating before the boolean** (SH3D steps by `arcLength / sqrt(exteriorArcLength)`), so a bow-window or curved partition yields a legal many-vertex room polygon (CasaPlazAI's schema allows >= 3 vertices with no upper bound). | 2.7 `arch_*`, `round_loop` | Med — differentiator vs. a walls-only competitor | Med |
| 11 | **Show the detected polygon before commit** (hover/ghost outline) instead of applying it on the double-click, so an accidental click on the wall band does not silently create the building envelope. SH3D's envelope-vs-room outcome is exactly the ambiguity users hit. | 2.4 | Med — prevents a confusing mis-click | Low |
| 12 | **Close the round-1 Unknown on point-edit gestures**: SH3D uses a right-click popup, not double-click, for add/delete/recompute. A web-first CasaPlazAI should surface the same verbs in its inspector / context menu, where they are discoverable. | 2.6 | Med | Low |

---

## 4. Unknowns

1. **Version gap.** The Java read is `keich/SweetHome3D@825635f` = **v7.4.0**; the live behaviour is **7.5.2**. I verified the *whole detection pipeline* is name- and logic-identical in the 7.5.2 bundle, but other parts of the 7.4.0 read (e.g. wall `isAtLevel`) were not re-checked against 7.5.2.
2. **Exact ring emission order.** `computeRoomPointsAt` returns on the **first** ring that `contains()` the click. My rectangle probes show the inner ring is hit before the envelope, but I did not establish a general rule for Java2D's emission order, nor test a click that lies in *two* holes or in a hole and the outer ring in a more complex non-convex plan.
3. **The `epsilon`-rectangle point-classification** in the door stub (Path A step 4) is the least predictable part: I observed the 12-point self-touching artefact when a door sits on a corner, but I did not enumerate the full failure space (e.g. two doors straddling the same corner, a door on a T-junction, a door on a round wall).
4. **Wall-graph corner cases**: sharp corners beyond the mitre guard `limit = 2·max(thicknesses)`, >2 walls meeting at one point (Y/T junctions with three joins), and walls whose start/end are joined in a chain but offset by more than `0.01` were not isolated.
5. **Non-manifold sets**: overlapping/crossing walls, duplicated walls, and zero-length walls were not tested; the union may create extra holes.
6. **"Recompute room points" vs "Recompute walls"** is resolved from source + labels, but I did not drive the *desktop* Swing popup (no Java runtime available), so the UI flow is DOCUMENTED/SOURCE-VERIFIED rather than OBSERVED end-to-end.
7. **`getVisibleDoorsAndWindowsAtGround` + multi-level**: I relied on `home.getSelectedLevel()`; behaviour with multiple levels (doors on other levels, rooms spanning levels) was not exercised.
8. **Performance**: I did not time the boolean union or `contains` scans on large plans (hundreds of walls) — the cache invalidation strategy (rebuild the whole `Area` on any wall edit) looks like the scaling risk.
9. **JS-only vs desktop divergence in the room dialog**: the online 7.5.2 bundle contains `ADD_ROOM_POINT`/`DELETE_ROOM_POINT`/`RECOMPUTE_ROOM_POINTS` action ids (4/4/3 occurrences) but the string "Recompute walls" is **not** in the JS bundle (it appeared only from the desktop `package.properties`); I did not establish whether the online room dialog exposes the checkbox.

---

## Sources

- Sweet Home 3D JS Online (live app driven in this job): https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — evidence `out/p1_globals.json`, `out/p2_detection.json`, `out/p3_doors_probe.json`, `out/p4_doors_arcs.json`, `out/p5_contains_and_edit.json`; scripts `scripts/p1_globals.mjs`, `scripts/p2_detection.mjs`, `scripts/p3_doors_probe.mjs`, `scripts/p4_doors_arcs.mjs`, `scripts/p5_contains_edit.mjs`
- Shipped GWT bundle v7.5.2: https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 — extracted methods `out/js_computeRoomPointsAt_0.js`, `out/js_getRoomPathsFromWalls_0.js`, `out/js_getAreaPaths_0.js`, `out/js_getWallsArea_0.js`, `out/js_getPathPoints_0.js`, `out/js_getVisibleDoorsAndWindowsAtGround_0.js`
- Reference source (GPLv2+, read-only): unofficial GitHub mirror of the official SVN trunk, https://github.com/keich/SweetHome3D at commit `825635f774a531773bc001b7a5c8231740a9ffd4` (2024-11-07, v7.4.0) — `sources/java/viewcontroller/PlanController.java.utf8`, `sources/java/model/Wall.java`, `sources/java/model/Room.java.utf8`, `sources/java/model/HomeDoorOrWindow.java.utf8`, `sources/java/model/HomePieceOfFurniture.java.utf8`, `sources/SweetHome3D-master/src/.../swing/HomePane.java`, `swing/RoomPanel.java`, `viewcontroller/RoomController.java`, `swing/package.properties`
- Vendor user guide (§Drawing rooms, "half doorstep"): https://www.sweethome3d.com/userGuide.jsp — read-only copy at `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/sources/userGuide_en.txt` / `userGuide_de.txt`
- Round-1 report and evidence (read-only, reused): `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md`, `out/probe_room_points.json`, `out/probe_interaction3.json`, `out/probe_recompute.json`
- CasaPlazAI schema (read-only): `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`
- Licence: Sweet Home 3D is GPLv2+ (`SweetHome3D-master/src/com/eteks/sweethome3d/model/Home.java` header). **No source code was copied into this deliverable or into CasaPlazAI; only behaviour, algorithms and data models are described, in my own words.**
