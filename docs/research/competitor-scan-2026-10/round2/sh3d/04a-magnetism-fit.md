# Sweet Home 3D — door/window wall magnetism, automatic orientation, depth fitting, wall ends & corners

Job: `03-04a-doors-windows-magnetism-fit` · Target: Sweet Home 3D (GPL-2.0+ Java desktop app; browser edition
at <https://www.sweethome3d.com/SweetHome3DJSOnline.jsp>, GWT-compiled from the same Java core).
**Round 2.** Round-1 report reused read-only and never redone:
`~/dsh-workspaces/rea-sweethome3d-2026-10/04-04-doors-windows/report.md` (cited as **R1**; its
evidence files are cited as **R1:<path>**). Round-1 established the catalog/data model, wall cutting,
mirroring, sash data and the round-1 magnetism outline; this report goes deeper on the *snapping /
orientation / depth-fit / wall-end / corner* mechanics it left as code-reading only.

Claim tags: **OBSERVED** (live app / shipped bundle / vendor file, with URL or evidence path),
**DOCUMENTED** (vendor doc URL), **INFERRED** (my reasoning).

Live-lab method: this round's headless Chromium **did** get a WebGL context with Playwright's own launcher
and software GL (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), which
unblocks R1's biggest unknown (3-D rendering). The JS Online app could be loaded deterministically by
clicking the `onclick="viewHome('/examples/EmptyHome.sh3x')"` anchor, then driven through its own exposed
Java-object API inside `page.evaluate` (R1 lesson (b): synthetic clicks avoided). All numeric results below
come from `pc.adjustMagnetizedPieceOfFurniture(piece, x, y)` — the exact function the app calls on drop.
Units in the raw evidence are the home's own units (cm, degrees, radians for angles).

---

## 1. Summary

- **Snap to wall is a screen-constant 4 px "collision/inflation" margin**, `PIXEL_MARGIN=4` divided by the
  current plan scale — geometry-level, not cursor-level. Live bisection of the snap/non-snap boundary at
  scales 0.25/0.5/1/2/4 px-per-cm gave 27 / 19 / 15 / 13 / 12 cm, exactly `7.5/2 + depth/2 + 4/scale`
  (predicted 27/19/15/13/12). The piece is pulled in even when the *piece body* (width 91.5) never reaches
  the wall. **OBSERVED** `evidence/fit-tests-2.json`, `evidence/fit-tests-3.json`.
- **Nothing about a wall segment's length or its ends constrains the snap.** A 200 cm stub and a 60 cm stub
  both accept a 91.5 cm door dropped 2 cm past the end, and the piece is never moved along the wall — the
  hit test exists only to pick a *wall*, never to clamp an interval. **OBSERVED** `evidence/fit-tests-2.json`
  (`A-outside-segment-*`, `B-stub-*`, `C-short-wall-*`). This is worse than the usual collision-checking
  picture and is a concrete opening for CasaPlazAI.
- **Orientation is exact and unconditional**: on hit the piece's angle is set to the wall's angle (or that
  angle + 180° depending on which side the nearest wall *edge* is on relative to the cursor) — a door asked
  for at 0° on a vertical wall comes back at 270°, on the *other* side at 90°. **OBSERVED**
  `evidence/fit-tests-3.json` (`sideSelection`).
- **Depth fitting has one exact rule**: for a normal (non-round) host wall, a resizable,
  `widthDepthDeformable` opening with no per-instance `modelTransformations` gets
  `depth = 0.00075 + wallThickness / wallThicknessRatio`, and the piece's centre perpendicular offset
  becomes `depth/2 − wallThickness/2 − wallDistance·depth` (derived from the code and confirmed
  position-by-position below). For the shipped `eTeks#door` (ratio 0.5172414, distance 0.068966)
  the live results matched the depth prediction to 6 decimals at wall thickness 5/7.5/10/20/40 cm
  (9.667417 / 14.50075 / 19.334083 / 38.667417 / 77.334083). **OBSERVED** `evidence/fit-tests.json`.
- **Wall-end behaviour is "binds anyway, then overlaps"**: a leaf bound to one wall may extend across the
  wall's end into a perpendicular wall or into empty space (a 91.5 cm door on a 60 cm wall; 45.75 cm hanging
  off a 200 cm stub), and there is no corner-clearance test at all. A separate quirk of the side rule: a drop
  *exactly on* the wall centre line picks the far face (angle 180° on a horizontal wall) and slides the piece
  to that face, while 1 cm to either side picks the near face (angle 0°, offset
  `+(depth/2 − thickness/2 − wallDistance·depth)`). **OBSERVED** `evidence/fit-tests.json`/`fit-tests-2.json`.

## 2. Findings

### 2.1 Where magnetism is wired in

- Magnetism is **off/on in user preferences**, and the drop-time magnetiser is called only when it is on and
  exactly one item is being dropped: the shipped controller contains
  `if(this.preferences.isMagnetismEnabled()&&g.length===1&&c.length===1){this.getPlanController().adjustMagnetizedPieceOfFurniture(g[0],k,j)}`
  — i.e. drag-move of one piece into either the plan or the 3-D view. **OBSERVED**
  `R1:bundles/sweethome3d.min.js` (search `adjustMagnetizedPieceOfFurniture(`); 51 hits for
  `isMagnetismEnabled()`, including the preferences/dialog plumbing.
- `PlanController.getSelectionMargin()` shows the house style for a screen-constant tolerance:
  `var c = PIXEL_MARGIN; if (pointerTypeLastMousePress === TOUCH) c *= 2; return c / this.getScale();`
  Hover/selection uses the same 4 px idea, doubled for touch. **OBSERVED** `R1:bundles/sweethome3d.min.js`.
- The app's public method for a *drag* is `adjustMagnetizedPieceOfFurniture(piece, x, y)`; it is a thin
  wrapper that also runs the elevation and side-by-side adjusters. Live signature read from the app:
  `function(d,c,h){var g=this.adjustPieceOfFurnitureElevation(d,false,3.4028235e+38)!=null; var f=this.adjustPieceOfFurnitureOnWallAt(d,c,h,true); ... adjustPieceOfFurnitureSideBySideAt(d,f==null,f) ... adjustPieceOfFurnitureInShelfBox(d,f==null)}`
  — i.e. `adjustPieceOfFurnitureOnWallAt(piece, x, y, magnetismEnabled)` performs the wall snap.
  **OBSERVED** `evidence/fit-tests-2.json` (`signature`).
- `viewHome('/examples/EmptyHome.sh3x')` gives an empty model (0 walls, 0 furniture) and is the deterministic
  way in; alert dialogs (the "your design won't be saved" notice) must be accepted. **OBSERVED**
  `diag-load.js` output.

### 2.2 The hit test: how a wall is chosen (and how far the snap reaches)

Reading `adjustPieceOfFurnitureOnWallAt` (**OBSERVED** code, `R1:evidence/magnetism-code.js`; behaviour
confirmed live), the order is:

1. `k = PIXEL_MARGIN / getScale()` — the tolerance.
2. Primary pass: walls **at the selected level** (and viewable) whose
   `containsPoint$float$float$boolean$float(cursorX, cursorY, atGroundLevel, margin)` is true; the first
   candidate wins (not the nearest — the code does not compare distances in this pass).
3. Second pass with `margin = 0` (exact containment), used when the first pass found nothing but magnetism
   is disabled or the piece is not a door/window.
4. Wall-level fallback: build the piece's **rotated plan rectangle inflated by `2k`** and intersect it with
   each wall's shape (a `BasicStroke(thickness).createStrokedShape(...)` polygon of the wall's centre line,
   **with its ends joined to neighbouring walls' half-thickness** via `getShapePoints`/`computeIntersection`).
   The wall with the largest intersection area wins. **OBSERVED** (`getShapePoints`, `computeIntersection` in
   `R1:bundles/sweethome3d.min.js`).
5. Inside the piece branch (`doorOrWindow === true`) there is an extra gate
   `u = w || A.isDoorOrWindow() || wall.containsPoint(cursor, margin)`; for a door on a straight wall the
   piece branch is always taken, so the **through-wall offset** is computed by the straight-wall formulae.

Live measurement of the total reach (**OBSERVED** `evidence/fit-tests-2.json` `A-tolerance-*`):
a 7.5 cm wall at scale 0.5 (1 px = 2 cm, so 4 px = 8 cm), door depth 14.50075, half-thickness 3.75:

| drop distance from wall centre line | 0 | 3 | 8 | 8.5 | 10 | 12 | 15 | 16 | 20 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|
| snapped? | y | y | y | y | y | y | y | y | **n** | **n** |

so the boundary is just above 16 cm — it is **not** simply the cursor tolerance (3.75 + 8 = 11.75); the
piece's own inflated bounding box (half-depth 7.25 + 8) reaches further, i.e. **the fallback, footprint-based
pass is what actually binds most near-miss drops**. Bisecting the boundary across plan scales gave

| plan scale (px per cm) | 0.25 | 0.5 | 1 | 2 | 4 |
|---|---|---|---|---|---|
| live max dy (cm) | 27 | 19 | 15 | 13 | 12 |
| `7.5/2 + depth/2 + 4/scale` | 27 | 19 | 15 | 13 | 12 |

which matches the predicted footprint formula exactly and proves the tolerance is
**screen-constant at 4 px and expressed in geometry, not screen space**.
**OBSERVED** `evidence/fit-tests-3.json` (`scaleBoundary`).

- **Segment ends are not part of the test.** Dropping at (-1,0), (-2,0), … (-20,0) on a wall that runs
  0→800 in x still snaps and **keeps the cursor's x** (piece centre stays at -1 … -20, i.e. more than 20 cm
  past the wall's start). On a 200 cm stub, drops at x = 0/5/30/…/195/196/199/200/202 on the line y=600 all
  snap with the piece centre left exactly at the drop x, so a 91.5 cm door dropped at x=195 has
  x∈[149.25, 240.75] while the wall ends at x=200 — **45.75 cm of the leaf hangs off the end into open
  space**. A 60 cm wall accepts the same 91.5 cm door at every drop point tested.
  **OBSERVED** `evidence/fit-tests-2.json` (`A-outside-segment-*`, `B-stub-*`, `C-short-wall-*`).
- **The reach past a segment end is exactly the piece's own half-width.** I measured the wall outline
  directly: a lone 200 cm wall (thickness 7.5) has `getShapePoints(false) = [(0,596.25), (200,596.25),
  (200,603.75), (0,603.75)]` — a clean rectangle with **zero overshoot** at either end.
  **OBSERVED** `evidence/ends-and-mts.json` (`loneWall`). The snapping beyond the end therefore comes
  entirely from the footprint fallback: the door's inflated rotated rectangle still overlaps the wall
  rectangle. Sweeping a door (width 91.5) along the wall line, drops at x = 200…240 snapped and x = 260 did
  not; symmetrically x = −40 snapped and x = −60 did not. Boundary ≈ 45.75 cm = half the door width,
  on both ends. So **the fallback uses the piece's full footprint, so a wide piece can be "magnetised" to a
  wall its centre is far outside of, and the overshoot scales with the piece's width.**
  **OBSERVED** `evidence/ends-and-mts.json` (`endReach`, `startReach`).
- There is **no explicit clearance/clamping step anywhere**: `adjustPieceOfFurnitureOnWallAt` returns a
  wall or null, and outside the door branch CasaPlazAI-relevant clamping (`S.subtract(...)`, `getClosestPath`)
  is applied **only to non-door furniture** (`if(!A.isDoorOrWindow() && …)`). **OBSERVED**
  `R1:evidence/magnetism-code.js`.

### 2.3 Automatic orientation (which way the door turns)

- On a hit the piece angle is set to `F = atan2(dy, dx)` of the wall, or `F + π`, chosen by
  `t = (F > -π/2 && F <= π/2)` and then `(H < z ? F : F+π)` where `z`/`H` are the distances from the cursor
  to the wall's two long edges (each a `ptLineDist` to the edge polyline, or `Point2D.distance` when the
  edge is degenerate). The piece ends up **flush against whichever face the cursor is nearer**.
  **OBSERVED** code (`R1:evidence/magnetism-code.js`).
- Live confirmation on a vertical wall from (0,0) to (0,400) (**OBSERVED** `evidence/fit-tests-3.json`
  `sideSelection`; note the first two rows are the same physical drop, the second row adds the measured leaf
  x-range):

  | cursor | returned angle | leaf x-range |
  |---|---|---|
  | x = -2, -1 | 90° | [-9.75, 4.75] |
  | x = 0 | 270° | [-4.75, 9.75] |
  | x = +1, +2 | 270° | [-4.75, 9.75] |

  i.e. the piece flips to the cursor's side of the wall, and the wall's own thickness is centred on the
  piece's depth axis.
- **The orientation always wins over the caller's angle.** Two independent live observations:
  R1 T6 (a door handed in at 90° on a horizontal wall came back at 0°) and this round's
  `fit-tests-3.json`/`fit-tests.json` rows. **OBSERVED**.

### 2.4 Depth fitting to wall thickness — the exact rule, and when it does *not* apply

For a **non-round** wall the piece branch is:

```
E = 0.00075                       # a fixed 0.0075-unit epsilon
if wall is straight:
    ac = E/2
    if (piece is a HomeDoorOrWindow) and isResizable() and isItemResizable(piece)
       and isWidthDepthDeformable() and getModelTransformations()==null:
         piece.setDepth(E + wall.thickness / piece.wallThicknessRatio)
         piece.setDepthInPlan(piece.getDepth())
         ac += piece.getDepth() * piece.wallDistance
    else:
         ac += piece.getDepth()*(piece.wallDistance + piece.wallThicknessRatio) - wall.thickness
    # then translate so that wall-edge distance + ac lands the piece in the wall
else:  # round wall (arcExtent != 0)
    ac = -wall.thickness/2 + piece.getDepth()*(piece.wallDistance + piece.wallThicknessRatio/2)
```

**OBSERVED** code (`R1:evidence/magnetism-code.js`), **OBSERVED** behaviourally:

| wall thickness | fitted depth | `predicted = 0.00075 + t/ratio` | piece y (wall centre y=0) | `depth/2 − t/2 − wallDistance·depth` |
|---|---|---|---|---|
| 5 | 9.667417 | 9.667417 | 1.66661 | 4.83371 − 2.5 − 0.66667 = 1.66704 ✓ |
| 7.5 | 14.50075 | 14.50075 | 2.49995 | 7.25037 − 3.75 − 1.00006 = 2.50031 ✓ |
| 10 | 19.334083 | 19.334083 | 3.33328 | 9.66704 − 5 − 1.33333 = 3.33371 ✓ |
| 20 | 38.667417 | 38.667417 | 6.66661 | 19.33371 − 10 − 2.66667 = 6.66704 ✓ |
| 40 | 77.334083 | 77.334083 | 13.33328 | 38.66704 − 20 − 5.33333 = 13.33371 ✓ |

**OBSERVED** `evidence/fit-tests.json` (`depth-vs-thickness-*`). The `+0.00075` is why the live depth is
"14.5007" rather than the clean 14.5 (R1 noted 14.5007 without explaining the epsilon).

- **`wallDistance` is a fraction of the piece's own depth** that slides the piece across the wall, and it
  *does not* re-fit the depth. On a 7.5 cm wall with ratio 0.5172414, depth stays 14.50075 and the piece's
  centre y for `wallDistance` 0 / 0.069 / 0.2 / 0.5 / 1.0 was 3.5 / 2.49995 / 0.59985 / −3.75038 /
  −11.00075 — i.e. the piece is pushed out of the wall by `(wallDistance − 0.068966)·14.50075`
  (`wallDistance = 0.5` puts the whole leaf on the far side; `0.069` centres it in the wall).
  **OBSERVED** `evidence/fit-tests.json` (`walldistance-*`). Formula from the code branch above:
  `y = (d·wallDistance + t/2) − d/2` for the upper side.
- **Three guards switch the rule off** and then the piece keeps its own depth and is only positioned relative
  to the wall:
  - `widthDepthDeformable == false`: a door with the flag cleared stays at depth 14.5 and is placed at
    y=2.49962 in a 7.5 cm wall (thin enough) but at **y=8.74962 in a 20 cm wall — hanging out of both faces
    of the wall, not thickened to fit**. **OBSERVED** `evidence/fit-tests.json`
    (`deformable-false-in-7.5`, `deformable-false-in-20`). This closes R1's "Unknown: `widthDepthDeformable`
    enforcement" — the enforcement is simply "skip depth fitting".
  - `getModelTransformations() != null`: in my attempt `setModelTransformations({})` did *not* stick
    (`getModelTransformations()` returned null after the call — the setter expects a typed map), so I could
    not reproduce this guard live; only the code path is **OBSERVED** (see Unknowns).
  - Piece not resizable / not a `HomeDoorOrWindow`.
- **Non-deformable pieces keep their depth when the wall changes:** after snapping a normal door into a
  20 cm wall I set the wall back to 7.5 cm; the door kept `depth = 38.66742` and `y = 6.66661`. Same as R1's
  T1 finding — there is **no live constraint between a placed opening and its wall's thickness**.
  **OBSERVED** `evidence/fit-tests.json` (`wall-7.5-after-snap`).
- Extreme thickness works arithmetically (1 cm wall → depth 1.9341; 60 cm → depth 116.0007, so the door leaf
  spans −78.0 … 38.0 across a 60 cm wall) — the formula is linear and unbounded.
  **OBSERVED** `evidence/fit-tests-2.json` (`G-extreme-thickness-*`).

### 2.5 Wall ends, corners, and what happens when the wall moves

- **Corners are not resolved.** With a room rectangle (0,0)-(500,0)-(500,400)-(0,400), drops near the corner
  at (400,0) of a two-wall corner pick **whichever wall's proximity the geometry favours** and simply bind
  the door there:
  - (400,0) → bound to the *vertical* wall, angle 270°, x=402.4999, y=0
  - (399,1), (399,0), (395,0) → bound to the *horizontal* wall, angle 0 or 180°
  - (401,1), (400,5), (400,20) → vertical wall, angle 270°
  - (400,−20) → **no snap at all** (`bound = false`, depth unchanged 14.5) because it is outside the room
    and beyond the fallback footprint.
  **OBSERVED** `evidence/fit-tests-2.json` (`E-corner-*`, `E2-*`).
- **A door bound to one wall can overlap a perpendicular wall.** A door on the vertical wall at x=400,
  dropped at (400,20), centred at y=20 with a 91.5 cm width spans y ∈ [−25.75, 65.75] — i.e. it crosses the
  horizontal wall at y=0 entirely, with its hinge-side leaf buried in the other wall. Dropping it 45.75 cm
  from the corner makes its edge land exactly on the neighbouring wall's centre line (y range [0, 91.5]).
  **OBSERVED** `evidence/fit-tests-3.json` (`cornerClearance`). This is the wall-end story in one sentence:
  **Sweet Home 3D binds first and never checks whether the opening's span leaves its wall or enters the next
  one.**
- **No follow-the-wall coupling.** A door snapped to a wall did **not** move or rotate when the wall was
  translated (`setYStart(100)/setYEnd(100)`) or rotated (`setXEnd(0)/setYEnd(600)`); it stayed at (100,
  2.4999) at angle 0 and kept `boundToWall = true`. Re-calling the magnetiser on the rotated wall also left
  it at (100, 2.4999) angle 0 — the piece is now floating in space, still flagged as bound (the cursor is
  outside `PIXEL_MARGIN/scale` of the new wall line, and the footprint fallback did not reach).
  A *fresh* door then correctly snapped to the rotated wall (angle 270°, x=2.4999, **depth fitted again**).
  **OBSERVED** `evidence/fit-tests.json` (`follow-*`), `evidence/fit-tests-2.json` (`D-*`).
- **Deleting the host wall leaves the opening in place, still bound.** `home.deleteWall(w)` left the door at
  (300, 2.5) with `boundToWall = true` and depth 14.501, still in `home.getFurniture()`.
  **OBSERVED** `evidence/fit-tests-3.json` (`afterHostWallDeleted`).
- **`boundToWall` is a value-typed flag, not a relationship.** It is cleared by the four geometry setters
  `setX/setY/setAngle/setDepth` (only when the value actually changes — `setX(same)` kept it) and by nothing
  else; `setWallDistance`/`setWallThickness` did not clear it. After clearing, re-running the magnetiser
  restores it. Lifecycle, **OBSERVED** `evidence/fit-tests-3.json` (`boundLifecycle`):

  | step | bound |
  |---|---|
  | snapped | true |
  | `setX(same value)` | true |
  | `setX(301)` (different) | **false** |
  | re-snapped | true |
  | `setAngle(0.1)` | **false** |
  | `setDepth(20)` | false (already false) |
  | `setWallDistance(0.3)` / `setWallThickness(0.9)` | unchanged |
  | re-snapped after the fraction edits | true, y = −2.084, depth = 8.334 (re-fitted with the new ratio) |

  The flag is **per-instance and persisted** (`boundToWall` in the model XML, R1 §2.2).

### 2.6 Round (arc) walls

- A wall with `arcExtent = π/2` on the chord (0,0)→(400,0) is tessellated into 46 outline points plus a
  small extra pair at each end (**OBSERVED** `evidence/fit-tests-3.json` `roundWall.points`, arc centre
  (200,200) = the chord's end point in this configuration).
- **Doors do not bind to round walls**: snapping a door onto the arc's midpoint gave angle 45°, the depth
  **unchanged at 14.5** and `boundToWall = false`; at the arc quarter it gave angle 180°, depth 14.5,
  `bound = false`. The identical geometry as a *straight* wall snapped with angle 0°, depth 14.50075 and
  `bound = true`. This matches the code's `T != 0` branch (`setBoundToWall(T == null || T === 0)`) and the
  round-wall offset formula `ac = −t/2 + depth·(wallDistance + wallThicknessRatio/2)`.
  **OBSERVED** `evidence/fit-tests-2.json` (`F-round-wall-arc` vs `F-straight-control`),
  `evidence/fit-tests-3.json` (`roundWall`).
  **INFERRED**: the angle you see (45°) is the piece being aligned to the *nearest tessellation segment*
  rather than to the tangent, which is why an unbound door on an arc wall looks approximately but not
  exactly tangential.

### 2.7 Related behaviours that shape the same UX

- **Magnetism is silently bypassed for a whole drag** when the user holds the toggle key
  (`wasMagnetismToggledLastMousePress`, 26 hits; R1 documented Alt/⌘). **OBSERVED** bundle + **DOCUMENTED**
  <https://www.sweethome3d.com/users-guide/>.
- **Furniture is a different rule than doors**: for non-openings the drag path additionally runs a
  wall-subtraction/clamping branch (`S.subtract(wall)`, `getClosestPath`) that keeps the piece from
  overlapping walls; doors skip it entirely. **OBSERVED** `R1:evidence/magnetism-code.js`.
- **Openings keep their catalog elevation** (window sill) through the snap; the drop-magnetiser never
  derives a sill from the wall. Live restatement: a door at elevation 0 and `eTeks#window85x123` at
  elevation 87 both stayed put while their depth re-fitted. **OBSERVED** `evidence/fit-tests-3.json`
  (`stacked`), R1 §2.6.
- Two openings may share a wall/position with different sills; the 3-D wall builder (R1 §2.4) sorts them by
  ground elevation and emits jambs/lintels. Live: door elev 0 depth 38.667 at y=6.667 and a window elev 87
  depth 27.201 at y=3.6 on the same 20 cm wall. **OBSERVED** `evidence/fit-tests-3.json` (`stacked`).
- **Width is not re-fitted** (`adjustFurnitureSizeAndElevation` deliberately skips a door's depth; R1
  §2.3), and setting width 600 on a 91.5-wide door leaves `bound = true` with no complaint.
  **OBSERVED** `evidence/wall-end-tests.json` (`E11b-set-width-600`).
- **Vendor documentation is thin on all of this.** The user guide's only relevant sentences are "When
  magnestism is active, a door or a window dropped upon a wall is automatically oriented and resized
  depending on the orientation and the thickness of that wall" and the 15° rotation-magnetism/Alt note
  (**DOCUMENTED** <https://www.sweethome3d.com/users-guide/> "Adding doors, windows and furniture"). The
  changelog supplies the intent: v1.7 "Automatic adjustment of the thickness and the orientation of a door
  or a window dropped upon a wall", v1.7–? "Draw the sashes…", v4.4 texture-coordinate fix at wall/door
  intersections, v4.5 "Fixed wrong computation of wall corner on some horizontal walls", and v5.5
  "Made doors and windows always cut out the both sides of the walls to which they are added"
  (**DOCUMENTED** <https://www.sweethome3d.com/history/>; extracted text `R1:history.txt`).
- **Licence note:** Sweet Home 3D is GPL-2.0+ (bundle + catalog). Nothing here is copied code — behavioural
  readings and live measurements only. A bare `master`-branch source fetch failed (404), so no upstream
  Java source was used; everything above is from the shipped minified bundle and the live app.

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each cites a finding and, where relevant, the CasaPlazAI schema
(`src/shared/schema/types.ts`, `openings[]` with `segmentIndex`, `tCenter`, `width`, `sillHeight`,
`headHeight`).

1. **Clamp the opening to its segment and reject the impossible drop (H value / M effort).** Finding §2.2:
   Sweet Home 3D never checks that a door's span lies inside its wall — a 91.5 cm door snaps to a 60 cm
   wall, 45.75 cm hanging off the end. CasaPlazAI's schema *already* has the invariant
   (`opening-too-wide`, `tCenter·L ± width/2 ⊆ [0, L]`), so the win is to enforce it at drop time:
   compute `tCenter` from the snapped position, and if the interval does not fit, either clamp `tCenter`
   to `[width/(2L), 1 − width/(2L)]` or refuse the snap and leave the opening free-standing. This turns a
   documented competitor bug into a visible correctness feature.
2. **Store the wall relationship, not just coordinates (H / M).** Finding §2.5: `boundToWall` is a boolean
   cleared by any `setX/setY/setAngle/setDepth`, is never re-evaluated, survives wall deletion, and a placed
   door does not move when its wall moves. CasaPlazAI's `Opening` already carries `roomId` +
   `segmentIndex` — an *address*, which is strictly stronger. Add `attachedWallId`/derived-segment
   semantics so that moving, splitting or deleting a wall deterministically moves/rebinds/detaches its
   openings, and recompute depth/`tCenter` when the wall's geometry changes.
3. **Screen-constant snap tolerance expressed in metres (H / L).** Finding §2.2: the competitor's 4 px
   margin becomes 4/scale home units, so the tolerance is 27 cm at one zoom and 12 cm at another — and the
   live boundary (27/19/15/13/12 cm at scales 0.25…4) shows the snap reach is `wallHalfThickness +
   pieceHalfDepth + 4/scale`, i.e. **the piece's footprint matters as much as the cursor**. CasaPlazAI has a
   0.5 m grid snap already; adopting `tolerance = 4 px / pixelsPerMeter` (converted to metres, clamped to a
   sane range) plus a "does the dragged footprint intersect this wall" fallback gives the same forgiving
   feel without importing the geometry-only trickiness.
4. **Two-pass hit test with an explicit nearest-winner (H / L).** Finding §2.2: the competitor's first pass
   takes the *first* wall under the cursor at `margin = 4 px`, then falls back to "largest intersection area
   of the inflated footprint". At a two-wall corner this makes the choice depend on wall order/area rather
   than distance (§2.5 corner table). CasaPlazAI should do: (a) walls whose centre line is within tolerance
   of the cursor, sorted by perpendicular distance, (b) else walls whose span intersects the dragged
   footprint, sorted by overlap length. Deterministic and explainable.
5. **Set depth from wall thickness **only** as a physical "fills the wall" rule with an explicit opt-out
   (H / M).** Finding §2.4: `depth = 0.00075 + wallThickness / wallThicknessRatio` is the whole magic; the
   ratio is a per-type catalog constant and `widthDepthDeformable=false` is exactly the opt-out. CasaPlazAI's
   schema has no opening depth at all (openings are cutouts in a wall of shared `wallThickness`), so the
   equivalent is: keep openings parameterised purely by `width`/`sillHeight`/`headHeight` and let the 3-D
   mesh hug the current `wallThickness` automatically — then make the "sill/lintel reveal" a render
   property. This is the simplest possible version of the competitor's best trick and avoids its staleness
   bug (depth not updated when the wall thickens).
6. **Corner clearance check + a real corner rule (M / M).** Finding §2.5: a door bound to one wall may
   overlap the perpendicular wall (leaf across the full 20 cm of the corner). CasaPlazAI should, at drop
   time, test the opening's interval against the **neighbouring segments sharing that vertex** and either
   refuse, shrink, or slide the opening until it clears the wall's inner corner face (half thickness on each
   side). The schema's `tCenter` makes this a cheap interval intersection.
7. **Auto-orient + "which face" flip (M / L).** Finding §2.3: angle = wall angle or wall angle + 180°,
   chosen by whichever long edge is nearer the cursor. In CasaPlazAI's data model the analog is the opening's
   **side/handedness** (which face of the wall it opens toward) — one enum on `Opening` (`hingeSide`,
   already suggested in R1), set on drop from the cursor side and shown in the inspector.
8. **A visible "unbound" state instead of a silent flag (M / L).** Finding §2.5/§2.6: round walls and
   out-of-tolerance drops produce `boundToWall = false` with no distinct rendering, leaving doors whose
   angle is a snapshot of the nearest tile. CasaPlazAI should render a free-standing opening differently in
   the Plan-mode inspector (e.g. "not attached" chip) and offer one-click "attach to nearest wall", which is
   a much better recovery path than the competitor's "drag it again and hope".
9. **Skip 15°/wall magnetism while a modifier is held (L / L).** Finding §2.7 / R1: `wasMagnetismToggled
   LastMousePress`, global preference plus a held key, is cheap and users expect it. For CasaPlazAI this is
   one boolean consulted in the drop handler, plus a status-bar hint.
10. **Sill preservation on drop (L / L).** Finding §2.7: windows keep their catalog elevation (87 / 80 /
    11 / 93 cm in R1's samples) while the depth is re-fitted; the magnetiser never invents a sill. Map it
    onto the schema as the opening template's default `sillHeight`/`headHeight` copied into the new
    `Opening` row, editable in the inspector.
11. **Round-wall handling, if CasaPlazAI ever adds arcs (L / L).** Finding §2.6: Sweet Home 3D aligns the
    piece to the nearest tessellation segment and marks it unbound; a cleaner rule is to attach to the arc
    by parameter (angle along the arc) with an explicit `wallCurve` field. Out of scope for the current
    rectangle/polygon tool set; noted so the data model stays additive.

## 4. Unknowns

- **3-D rendering is now possible but was not used much.** This round's Playwright launcher did get a WebGL
  context (`probe-webgl.js`, `renderer: "WebKit WebGL"`, canvases `#home-3D-view` present), so R1's "no live
  3-D" limitation is lifted for future rounds. I did **not** verify the rendered hole/surround geometry
  visually (I cannot view images) and all 3-D statements here are still code-read.
- **`modelTransformations` guard untested.** `piece.setModelTransformations({})` and the GWT
  `java.util.HashMap` both failed to construct in this environment (`java` helper not exposed in the page's
  `evaluate` scope), so `getModelTransformations()` stayed null and the depth-fit *did* run
  (`evidence/ends-and-mts.json` `mt.depthAfterSnap = 38.66742` = the deformable prediction). The code branch
  `… && V.getModelTransformations() == null` that disables depth fitting for posed doors is read from the
  bundle only; the class `Transformation` and `ModelManager` are present on the page (`mtClasses`), so a
  correctly-typed transformation map would be the way to exercise it.
- **`isItemResizable` / resizable-piece conditions** in the depth-fit guard were not isolated; all my test
  doors were resizable, so the "not resizable" path is code-read only.
- **Fallback pass arithmetic for a joined wall at an angle.** I verified the zero-overshoot rectangle for a
  *lone* wall and the 45.75 cm reach past its ends; I did not re-measure the wall outline after joining a
  perpendicular wall (the joined 90° case came back byte-identical to the lone wall here, but an angled
  junction with mitered `computeIntersection` was not tested).
- **Exact first-pass ordering.** The primary pass picks the first containing wall (no distance comparison)
  and I could not confirm the iteration order the app uses in practice (wall creation order vs. sorted), so
  "first" may effectively be "the one the model returns first". The corner table in §2.5 is the observable
  outcome, not the ordering rule.
- **Round-wall tangent.** I did not measure whether the returned angle equals the tangent at the drop point
  or the nearest tessellation segment's direction to enough precision to distinguish the two (45.0° was the
  mid-arc result, and the arc's tessellation is coarse).
- **Desktop-app-only behaviours** (Furniture Library Editor properties, the classic Swing plan editor
  versus the GWT one) were not run; no installer was downloaded (rules). Statements about them remain from
  R1 + vendor docs.
- **Licence:** nothing from Sweet Home 3D (GPL-2.0+) or its catalog was copied; the two numeric formulas
  described above are behavioural descriptions, and any CasaPlazAI implementation must be written from the
  behaviour, not transcribed.

---

### Evidence index (this job folder unless a `R1:` prefix is used)

| file | what it is |
|---|---|
| `report.md` | this report |
| `sources.json` | machine-readable source & claim list |
| `lib.js` | reusable Playwright harness (software-GL launch + deterministic demo load) |
| `probe-webgl.js` | WebGL / app-presence probe (unblocks R1's 3-D unknown) |
| `diag-load.js` | demo-choice/DOM diagnosis, deterministic `viewHome` click path |
| `exp-wall-ends.js` | first wall-end/corner sweep (superseded by exp-fit2/3, kept for provenance) |
| `exp-fit.js` | depth-fit formula, `wallDistance` sweep, deformable/mts guards, wall-move follow |
| `exp-fit2.js` | tolerance vs. distance, segment-end overshoot, short walls, corners, round wall, extremes |
| `exp-fit3.js` | tolerance vs. plan scale, round-wall bind, side selection, corner clearance, bound lifecycle, host-wall deletion, stacked openings |
| `exp-ends.js` | exact wall-shape extents at ends, end-reach sweep, joined-wall shape, `modelTransformations` guard attempt |
| `evidence/ends-and-mts.json` | raw output of `exp-ends.js` |
| `evidence/wall-end-tests.json` | raw output of `exp-wall-ends.js` |
| `evidence/fit-tests.json` | raw output of `exp-fit.js` |
| `evidence/fit-tests-2.json` | raw output of `exp-fit2.js` |
| `evidence/fit-tests-3.json` | raw output of `exp-fit3.js` |
| `shots/00-online-load.png` | Online app after load (2-D plan), 2-D only |
| `R1:report.md` | round-1 report (read-only) |
| `R1:evidence/magnetism-code.js` | saved `adjustPieceOfFurnitureOnWallAt` region (code quotes) |
| `R1:bundles/sweethome3d.min.js` | shipped Online bundle v7.5.2 (all code readings) |
| `R1:bundles/FurnitureCatalog.json` | shipped catalog (per-type ratio / distance / sash data) |
| `R1:history.txt`, `R1:faq.txt` | vendor changelog / FAQ text |
