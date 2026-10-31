# Sweet Home 3D — grouping, alignment, distribution and furniture magnetism (drop-on-top, against walls, side by side)

**Job:** `rea2-sh3d-p2/10-05d-furniture-catalog-import-gro` — **Round 2** (narrow follow-up to round 1)
**App under study:** Sweet Home 3D 7.5 — GPL Java desktop app; "Sweet Home 3D JS Online" web build compiled from the same Java core.
**Homepage (German):** https://www.sweethome3d.com/de/ · **Browser edition:** https://www.sweethome3d.com/SweetHome3DJSOnline.jsp
**Round-1 report (read first, reused here):** `~/dsh-workspaces/rea-sweethome3d-2026-10/05-05-furniture-catalog-import/report.md` (§2.7 grouping, §2.8 magnetism). Its evidence files are reused read-only; nothing in that folder was modified.
**Licence:** Sweet Home 3D is GPL; 3D House Planner is proprietary; CasaPlazAI is proprietary. **No source code was copied into this deliverable.** The GPL source was *read* to establish facts; only short factual fragments (identifier names, constant values) are quoted, and every algorithm below is described in my own words.
**Legend:** `OBSERVED` = seen in a file in `evidence/` or in a live capture saved here · `DOCUMENTED` = stated by vendor docs/javadoc at the cited URL · `INFERRED` = my reasoning over the evidence.

---

## 1. Summary

- **Alignment, distribution and grouping are a controller feature, not a model feature.** Eight alignment commands, two distribution commands, group/ungroup and "reset elevation" are thin actions on `FurnitureController` (action ids 79–92) that mutate piece `x/y/elevation` in place and wrap the change in one `UndoableEdit` each; they are grouped into a single "Align or distribute" submenu, and the UI enables them only for the right selection size (≥ 2 for align, ≥ 3 for distribute, movable pieces only, grouping additionally refuses pieces that are already in a group). [OBSERVED `evidence/region_controller_align_dist.txt`, `evidence/region_alignmenu.txt`, `evidence/region_menuactions.txt`, `evidence/region_enablement.txt`; DOCUMENTED FurnitureController javadoc]
- **Alignment is always relative to the *first selected piece* (the "leader"), never to the selection bounding box**, and it moves only the *other* movable selected pieces; the leader is retained across selections so repeated alignments are stable. "Top/Bottom/Left/Right" align the **axis-aligned bounding box** of the rotated footprint, while "Front side / Back side / Left side / Right side" align to the leader's **own rotated footprint edges** — and the release history confirms the "leading selected piece" concept. [OBSERVED `evidence/region_controller_align_dist.txt` lines 56–90, `evidence/region_alignment_edits.txt`, `evidence/region_alignment_edits2.txt`, `evidence/src_side_align_edges.txt`, `evidence/doc_history_en.txt` (and `doc_history_de.txt`); DOCUMENTED javadoc wording "…of the first selected piece"]
- **Distribution equalises the *gaps*, not the centre spacing**, along the axis orthogonal to the chosen direction, and it needs **≥ 3** pieces; the extent of each piece along the axis is its rotation-aware bounding width `|w·cosθ| + |d·sinθ|`, with the axis line anchored on the leader. Both claims now have **live numeric confirmation**: with pieces 100/200/150 wide at x = 0/300/900, the shipped routine yields x = 0/437.5/900 and two equal gaps of 287.5; with the middle piece rotated 90° its along-axis half-extent correctly becomes 25 (not its raw 50), giving two equal gaps of 362.5. [OBSERVED `evidence/region_controller_align_dist.txt` lines 249–281, 135–139; live: `evidence/results/02_numeric_out.json`]
- **Magnetism is a soft, ordered resolver**: `adjustMagnetizedPieceOfFurniture` tries **(1) drop-on-top elevation → (2) against-wall → (3) side-by-side → (4) inside a shelf box**, stopping the later rules when an earlier one fired (elevation suppresses side-by-side; side-by-side suppresses shelf-box). It never **rejects** a placement: the only constraint-like step is inside the wall rule, where a piece that would poke into a *different* wall is slid along the current wall and, failing that, the wall snap is abandoned (the piece just stays where the mouse put it). Everywhere else overlapping furniture simply renders on top of itself. The 15° rotation snap is the same idea with `STEP_COUNT = 24` (`2π/24`), toggled by XOR against the magnetism preference; a *negative* catalog `dropOnTopElevation` is the "nothing may stack on me" flag; and a door/window whose footprint is > 99.9 % inside walls is auto-bound on add. [OBSERVED `evidence/region_plancontroller_magnetize.txt` lines 6–14 and 189–234, `evidence/region_rotation_magnetism.txt`, `evidence/region_enablement.txt`; consistent with round-1 §2.8]
- **The three drop rules are containment tests with explicit tolerances**: drop-on-top = "the piece's four footprint corners are inside a taller candidate's footprint, expanded by **5 %** of its smaller plan side", searched **only within the same group**; shelf-box insertion = the same containment with a **20 %** margin plus a "mostly inside, tiny spill" area test; against-wall = a wall hit test with a **4-pixel** margin, then the back face is laid along the wall and, for a door/window, the depth is re-derived from the wall's thickness. All four constants are independently confirmed by the vendor javadoc. [OBSERVED `evidence/region_controller_align_dist.txt` lines 331–393, `evidence/region_plancontroller_magnetize.txt`, `evidence/region_plancontroller_sidebyside.txt`; DOCUMENTED FurnitureController javadoc]

---

## 2. Findings

### 2.1 Where the feature lives: controller split and the command surface

[OBSERVED `evidence/region_menuactions.txt`, `evidence/region_alignmenu.txt`, `evidence/region_controller_align_dist.txt`; DOCUMENTED javadoc]

`FurnitureController` (and its subclass `PlanController`) exposes the whole feature set as public methods. The web/desktop UI wires them 1:1 to actions; the JS build registers them in `HomeView.ActionType` with these enum ids:

| id | action | controller method |
|---:|---|---|
| 79–82 | align on top / bottom / left / right | `alignSelectedFurnitureOnTop/Bottom/Left/Right` |
| 83–86 | align on front side / back side / left side / right side | `alignSelectedFurnitureOnFrontSide/BackSide/LeftSide/RightSide` |
| 87 | align side by side | `alignSelectedFurnitureSideBySide` |
| 88–89 | distribute horizontally / vertically | `distributeSelectedFurnitureHorizontally/Vertically` |
| 90 | reset furniture elevation | `resetFurnitureElevation` |
| 91–92 | group / ungroup | `groupSelectedFurniture` / `ungroupSelectedFurniture` |
| 104–105 | enable / disable magnetism | preference toggle |

`HomePane.createAlignOrDistributeMenu` (web build) builds exactly one submenu holding 79–89 in that order. Group/ungroup and reset-elevation are registered alongside, not inside that submenu. The desktop guide's own wording matches: alignment commands operate "on the first selected piece" and distribution "along horizontal/vertical axis" [DOCUMENTED, `https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/viewcontroller/FurnitureController.html`].

**Enablement rules.** [OBSERVED `evidence/region_enablement.txt` (`HomeController.enableActionsBoundToSelection`, bundle offset 995256)] The controller recomputes action enablement on every selection change and derives three flags from the selected pieces, counting only **movable** furniture (`isPieceOfFurnitureMovable`):

| flag | condition | gates |
|---|---|---|
| `e` | ≥ 2 movable furniture items selected | **all eight** align actions |
| `c` | ≥ 3 movable furniture items selected | distribute horizontally / vertically |
| `x` | `e` **and** every movable selected piece is a direct child of the home furniture list (not inside a group) | **group** |
| `p` | ≥ 1 movable furniture item selected | reset elevation |
| `F` | ≥ 1 selected item is a `HomeFurnitureGroup` | ungroup |

Two consequences worth copying: **grouping refuses pieces that are already inside a group** (you must ungroup or use "Add to group" instead), while **alignment and distribution work across groups** because they only look at the flat movable list. This is exactly the kind of rule that keeps a UI from offering actions that would silently do nothing.

**Leader selection semantics.** [OBSERVED `evidence/region_alignment_edits2.txt` lines 144–161] A `SelectionListener` keeps a `leadSelectedPieceOfFurniture`: it is set to the first furniture item of the selection, and is *kept* when the previous lead is still selected (so re-running an alignment after the selection changed but still contains the lead stays anchored). Each alignment edit stores `alignedFurniture` = the movable selected pieces **excluding the leader**, and `undo` restores their old x/y together with the previous home selection.

### 2.2 Grouping: `HomeFurnitureGroup` is a real piece of furniture

[OBSERVED `evidence/region_group_move.txt`, round-1 `bundle_groupmodel.txt`; DOCUMENTED javadoc `HomeFurnitureGroup`]

- A group **is-a** `HomePieceOfFurniture` that owns a child list; children may themselves be groups, so nesting works. `HomeFurnitureGroup` forces `resizable/deformable/texturable = true`, derives `movable = AND(children)`, `visible = OR(children)`, `doorOrWindow = AND(children)`, picks the common currency, and nulls out the catalog-ish fields (catalogId, description, creator, icon, planIcon, model) and the name-visibility/offset/style fields. Its default name comes from the localized `groupName` string plus a running count of all groups including nested ones (round 1: `"Group N"`).
- **Its geometry is derived from its children.** `updateLocationAndSize` computes: elevation = lowest child elevation; height = topmost child top minus that elevation; `dropOnTopElevation` = (max over children of `elevation + heightInPlan × childDropOnTopElevation` minus the group's base elevation) ÷ group height — i.e. the group re-normalises its children's drop-on-top into the same 0..1 ratio convention the catalog uses; centre = centroid of the children's rotated footprints' bounding box after rotating the box by −groupAngle; width/depth = that box's size. [OBSERVED]
- **Transforms propagate to children** in a deliberately simple way: `setX`/`setY`/`setElevation` move every child by the same delta; `setAngle` rotates every child around the group centre and clears `boundToWall`; `setWidth` scales each child's width and depth by the *projection* of the group's x-scale onto that child's own angle (`w' = w + w(k−1)|cos Δ|`, `d' = d + d(k−1)|sin Δ|`) and repositions it around the centre by the same factor; `setHeight` scales child heights and their elevation offsets. So resizing a group is a proportional scale of the whole arrangement, not a re-layout. [OBSERVED `evidence/region_group_move.txt`, `evidence/region_group_move.txt`]
- **Group creation** collects the selected movable pieces grouped by their current container (home list or an existing group), preserves each piece's original index, level and elevation, inserts the new group at the position of the last piece of the largest covered run, and gives the group the lowest involved level. Undo/redo are `FurnitureGroupingUndoableEdit` / `FurnitureUngroupingUndoableEdit`; ungrouping recomputes each child's level and index so stacking order is restored. Round 1 established the details and the `getFurnitureGroupCount` recursion used for naming; this round adds the exact transform-propagation rules above.

### 2.3 Alignment: eight commands, two different notions of an edge

[OBSERVED `evidence/region_controller_align_dist.txt` lines 56–139, `evidence/region_alignment_edits.txt`, `evidence/region_alignment_edits2.txt`]

Common shape of every command: take the movable selected pieces (must be **≥ 2**), set the home selection to exactly those, call `alignFurniture` on a subclass of `FurnitureAlignmentUndoableEdit`, and post it to the undo support. The base edit already contains leader and excludes it from the moved set.

| command | anchor taken from the leader | per-piece action |
|---|---|---|
| Align top | `min Y` over the leader's footprint corners | shift each piece in Y so its own `min Y` equals the leader's |
| Align bottom | `max Y` | shift in Y so `max Y` matches |
| Align left | `min X` | shift in X so `min X` matches |
| Align right | `max X` | shift in X so `max X` matches |
| Align **front side** | the leader's **bottom edge, corners [2]→[3]** | `alignPieceOfFurnitureAlongSides(piece, leader, thatEdge, sideFlag=true, aux=null, offset=0)` |
| Align **back side** | the leader's **top edge, corners [0]→[1]** | same routine, `sideFlag=false` |
| Align **left side** | the leader's **left edge, corners [3]→[0]** | `alignPieceOfFurnitureAlongLeftOrRightSides(piece, leader, thatEdge, sideFlag=false)` |
| Align **right side** | the leader's **right edge, corners [1]→[2]** | same routine, `sideFlag=true` |

The corner order is verifiable from the hit-test helpers: `[0]` = top-left, `[1]` = top-right, `[2]` = bottom-right, `[3]` = bottom-left. So "front side" really is the piece's **bottom** edge (the plan-view side facing the viewer), "back side" the top edge, and "left/right side" the vertical edges. [OBSERVED `evidence/src_side_align_edges.txt`, `evidence/src_edge_align_routines.txt`]

Key points:

- **Top/bottom/left/right are bounding-box alignments** — they shift along one axis only and ignore the pieces' angles (apart from the corner list already being rotated). **Front/back/left/right-side are edge alignments** — they move a piece along an arbitrary axis so its far edge touches the leader's named edge, using the leader's actual orientation. Concretely, the four bbox edits are one-liners over corner extremes: `Top` = `delta = getMinY(leader) − getMinY(piece)`, `Bottom` = `getMaxY(leader) − getMaxY(piece)`, `Left` = `getMinX`, `Right` = `getMaxX`, each added to the piece's `x` or `y`; and `getMinX/MaxX/MinY/MaxY` are simply `min`/`max` over `piece.getPoints()` (the rotated footprint corners). [OBSERVED `evidence/src_minmax_and_align.txt`, `evidence/region_alignment_edits.txt`]
- **The two edge routines share one idea but use different perpendicular extents, and both measure the piece's extent at the *relative* angle between piece and leader.** Write `Δ = piece.angle − leader.angle` and `α = leader.angle`.
  - `alignPieceOfFurnitureAlongSides(piece, leader, edgeLine, sideFlag, auxLine, auxOffset)` (front/back): signed perpendicular distance `b` from the leader's named edge to **the piece's own centre**, plus half the piece's **bounding height at Δ** — `|w·sin Δ| + |d·cos Δ|`; negate `b` when `sideFlag` is true; then `piece.move(−b·sin α, +b·cos α)` (the leader edge normal) and `return` the piece's **bounding width at Δ** (`|w·cos Δ| + |d·sin Δ|`). When `auxLine` is supplied (the side-by-side caller) an extra flush offset is folded in first.
  - `alignPieceOfFurnitureAlongLeftOrRightSides(piece, leader, edgeLine, sideFlag)` (left/right side): the same signed perpendicular distance `b` to the **piece's own centre**, plus half the piece's **bounding width at Δ** (`|w·cos Δ| + |d·sin Δ|`); negate when `sideFlag` is true; then `piece.move(b·cos α, b·sin α)` (the leader's edge direction).
  - So in every case the *piece* is translated (never the leader); the difference is purely which local extent is perpendicular to the named edge — **height** for the front/back edges (which run along the leader's width) and **width** for the left/right edges (which run along the leader's depth), each evaluated at the relative rotation `Δ`. The two flags choose which of the two parallel faces is used. Using `Δ` rather than the absolute angle is the correct behaviour: a piece rotated 90° relative to the leader must contribute its *depth* perpendicular to a width-running edge and vice versa.
- **Live check (§2.17).** With an axis-aligned leader 200×100 at the origin and a piece 100×60 dropped at `(0,500)`, aligning to the leader's back edge `y = −50` moves the piece to `(0, −20)`, so its top edge lands exactly at `y = −50`; the returned bounding width is `100`. Aligning a `(900,0)` piece to the leader's left edge `x = −100` moves it to `(−50, 0)`, putting its left edge exactly at `x = −100`. Both routines therefore *are* flush in practice, not merely in prose. [OBSERVED `evidence/results/02_numeric_out.json`]
- **The pieces' order does not matter** for these eight commands; only the leader matters. Undo label is `undoAlignName`. The routine's returned bounding width is what `FurnitureSideBySideAlignmentUndoableEdit` accumulates (§2.5).
- Because the moved list is filtered by `isPieceOfFurnitureMovable`, **doors and windows and base-plan-locked pieces are skipped** (they are non-movable); the leader may still be any selected piece.

### 2.4 Distribution: equal gaps along an axis, minimum 3 pieces

[OBSERVED `evidence/region_controller_align_dist.txt` lines 215–281, 92–139]

`distributeSelectedFurniture(horizontal)` requires **≥ 3** movable selected pieces, snapshots old x/y for undo, then calls `doDistributeFurnitureAlongAxis`:

1. Build the axis line through the **leader**: for horizontal distribution a vertical line `(0,0)→(0,−1)`; for vertical distribution a horizontal line `(0,0)→(1,0)`.
2. Sort all selected pieces by `ptLineDistSq · relativeCCW` against that line — i.e. by their signed position along the axis, starting from the leader.
3. First and last pieces stay put. Their separation along the axis is computed from the two signed distances, minus half of each end piece's axis-relative bounding width. Subtract the running widths of all interior pieces, and divide the remainder by `count−1` → the **equal gap**.
4. Walk from the leader outward, placing each interior piece at `runningPosition + gap + ownWidth/2` so that all consecutive gaps are identical.

Notes:
- The "width" used is **not** the raw width but the rotation-aware bounding width against the axis: `getPieceBoundingRectangleWidth(piece, baseAngle) = |widthInPlan·cos(baseAngle+angle)| + |depthInPlan·sin(baseAngle+angle)|`; the height helper swaps sin/cos. For horizontal distribution baseAngle = 0, for vertical π/2. This is the single most reusable primitive in the whole feature.
- Sorting uses a comparator over `ptLineDistSq · relativeCCW`, which is a monotone re-parameterisation of the distance along the line, so pieces on opposite sides of the axis still order correctly.
- Undo label `undoDistributeName`; selection is replaced by the distributed pieces and restored on undo.

**Live check (see §2.17).** Running this routine in the shipped bundle on three stubs (100/200/150 wide at x = 0/300/900) gives x = **0/437.5/900** and two equal gaps of **287.5**; rotating the middle piece 90° changes its along-axis half-extent to 25 and the equal gaps become **362.5/362.5** — confirming both the equal-gap rule and the rotation-aware extent. [OBSERVED `evidence/results/02_numeric_out.json`]

### 2.5 Side-by-side *alignment*: stack flush, propagating from the leader outward

[OBSERVED `evidence/src_side_align_edges.txt`, `evidence/src_edge_align_routines.txt`; DOCUMENTED `evidence/doc_history_en.txt` line 721]

`FurnitureSideBySideAlignmentUndoableEdit` differs from the other alignment commands: it re-sorts the selection itself along an axis built from the leader's **centre to the midpoint of its back (top) edge** — corners `[0]↔[1]`, which is also the reference line. It then walks outward in both directions from the leader's position in that sorted order, maintaining a running offset that starts at `+leaderWidthInPlan/2` on one side and `−leaderWidthInPlan/2` on the other, and calls `alignPieceOfFurnitureAlongSides(..., auxLine = that centre→edge direction, offset = running)` for each piece, accumulating the returned bounding widths. The effect: every selected piece ends up **flushed against its neighbour along the leader's back-edge direction**, packed side by side. This is exactly what the vendor's own release note means by "align selected furniture on the sides and on the **back side** of the first selected piece". [DOCUMENTED `evidence/doc_history_en.txt` line 721]

### 2.6 The magnetism resolver: order, gating and the preference

[OBSERVED `evidence/region_plancontroller_magnetize.txt` lines 6–14; `evidence/region_magnetism_caller.txt`; `evidence/region_rotation_magnetism.txt`]

**When the resolver runs at all.** [OBSERVED `evidence/region_magnetism_caller.txt`] The single call site gates on four conditions simultaneously:

```
magnetism on  &&  exactly 1 item dropped  &&  exactly 1 furniture piece  &&  drop target is the plan view or the 3D view
```

So magnetism applies only to a **single-piece drop onto the plan/3D view**; pasting a multi-item selection, or adding to the furniture-list view, bypasses it entirely. Before the resolver runs, `adjustFurnitureSizeAndElevation(pieces, ...)` quantises the piece's width/depth/height/elevation through `getMagnetizedLength(value, 0.1)` — but it skips `HomeFurnitureGroup` and non-resizable pieces, and it skips the depth of a width/depth-deformable door/window when certain conditions hold. Only then does `adjustMagnetizedPieceOfFurniture(piece, dx, dy)` run its four rules.

**With magnetism off, a drop is raw.** The same guard covers the size quantiser and the resolver, so switching magnetism off means the dropped piece keeps its cursor coordinates, keeps its own angle, is not raised onto furniture beneath it, and its dimensions are not stepped to 0.1-unit multiples. The vendor guide's conditional phrasing ("When magnetism is active…") matches this exactly, so the preference is the single on/off switch for the whole assist. [OBSERVED `evidence/region_magnetism_caller.txt`; DOCUMENTED `evidence/doc_findings.md` findings 1 and 21]

`adjustMagnetizedPieceOfFurniture(piece, x, y)` runs exactly four rules, and the outcomes gate each other:

1. `elevationFired = adjustPieceOfFurnitureElevation(piece, false, +∞) != null` — drop-on-top.
2. `wall = adjustPieceOfFurnitureOnWallAt(piece, x, y, true)` — snap/rotate against a wall; returns the reference wall or null.
3. **only if the elevation rule did *not* fire:** `sideBySide = adjustPieceOfFurnitureSideBySideAt(piece, wall == null, wall)` — note the second argument: "copy the neighbour's angle" only when there was **no** wall hit.
4. **only if side-by-side returned null:** `adjustPieceOfFurnitureInShelfBox(piece, wall == null)` — shelf-box insertion, again angle-copying only without a wall hit.

Everything is driven by `UserPreferences.isMagnetismEnabled()`; the plan view can toggle it temporarily for the current drag (`toggleMagnetism`, `wasMagnetismToggledLastMousePress`), and the menu exposes ENABLE_MAGNETISM / DISABLE_MAGNETISM (ids 104/105). When magnetism is on, dragging also re-quantises furniture **dimensions** through `getMagnetizedLength(value, 0.1)` (a length unit whose feasible rounding step is chosen from the tolerance: 0.1 / 0.5 / 1 / 5 / 10 / 100 cm for metric). The 15° rotation snapping and the Alt-to-toggle behaviour are user-guide facts carried over from round 1 [DOCUMENTED, `docs/userguide.txt`].

### 2.7 Drop-on-top elevation: a containment test, not a stack physics

[OBSERVED `evidence/region_controller_align_dist.txt` lines 331–393, 283–330; `evidence/region_plancontroller_magnetize.txt` lines 421–452]

- `getSurroundingFurniture(piece, excluded, marginFactor, includeShelfUnits)`: a candidate must be visible at the selected level, must not be excluded, must satisfy `dropOnTopElevation ≥ 0` (or be a shelf unit when `includeShelfUnits` is true), and must **contain all four corners of the dragged piece's footprint** within `marginFactor × min(widthInPlan, depthInPlan)`. Crucially, candidates are searched **only inside the piece's own group** (`getFurnitureInSameGroup`), so furniture only stacks on furniture in the same container.
- `getHighestSurroundingPieceOfFurniture` calls it with **margin 0.05 (5 %)** and shelf units excluded, then picks the candidate with the greatest top = `elevation + (heightInPlan if horizontally rotated else height × dropOnTopElevation)`.
- `adjustPieceOfFurnitureElevation(piece, force, tolerance)`:
  - applies only when `piece.getElevation() === 0` (or `force`), and never for a door/window when `force` is false;
  - with a `force` (used by the drag path with `false` → so the plain `getElevation()===0` branch is taken) it uses the single highest surrounding piece; the other branch (used by reset-elevation-style callers) gathers shelf units and returns null unless a shelf unit is among them;
  - candidate target heights are, in order of preference: the shelf boxes' lower Z values, else the shelf elevations, else the piece's `dropOnTopElevation`; a special case forces the drop-on-top candidate when the dragged piece's own elevation is 0 and the first shelf level is not 0;
  - for each candidate Z it adds the host's elevation (using `heightInPlan` if the host is horizontally rotated, else `height × dropOnTopElevation`) and corrects for the level elevation difference between host and dragged piece;
  - it accepts the candidate closest to the piece's current elevation **within the tolerance** and sets the elevation; the drag path passes `+∞`, so it always takes the nearest.
- `resetFurnitureElevation` (the "reset elevation" command) applies the same host formula to each selected movable piece, sets `max(0, target)` when a host exists and `0` otherwise, and posts one `FurnitureElevationResetUndoableEdit` (undo label `undoResetElevation`).
- The net user-visible rule matches the guide: *a piece dropped on a larger one is raised to sit on its top face if its own default elevation is floor level* — but only when both pieces are in the same group and the smaller piece's footprint is essentially inside the larger one. [DOCUMENTED user guide + OBSERVED; round 1 §2.8]
- **This resolves round-1's open question about `dropOnTopElevation: "-1"`.** The candidate filter explicitly requires `dropOnTopElevation ≥ 0` (unless the candidate is a shelf unit and the caller allowed shelf units), so a **negative `dropOnTopElevation` is the catalog's way of saying "nothing may be stacked on me"**. That is why doors and windows — which are meant to be stood in a wall, not built on — carry exactly `"-1"`. [OBSERVED; closes round-1 `report.md` §4 unknown 6]

### 2.8 Against-wall: hit test, back-face-to-wall, door/window depth from wall thickness

[OBSERVED `evidence/region_plancontroller_magnetize.txt` lines 16–241, 246–258; `evidence/region_plancontroller_wallsarea.txt`]

- The margin is `PIXEL_MARGIN / scale` (4 screen pixels converted to model units).
- **Hit test** — first pass: iterate walls at the selected level whose start-end distance is > 0 and whose thickened footprint contains the drop point (the "inside walls area" variant is used only for non-door/window pieces at elevation 0). Second pass repeats the same scan (the two loops have identical bodies in the shipped build — I read this as a transpiler artefact rather than two intended passes [INFERRED]).
- **Fallback when the point is not inside any wall**: expand the piece's rotated rectangle by the pixel margin and intersect it with each wall footprint; the wall with the largest intersection wins, and the reference point becomes that intersection's centre. This is what makes a piece dragged near (not exactly on) a wall still snap.
- **Curved walls**: `getReferenceWall` replaces an arc wall with a tiny straight wall tangent at the drop point (a short segment spanning ±0.001 rad around the circle centre), so all the straight-wall maths below applies unchanged.
- **Orientation/position**: the wall direction angle `F` is computed from the reference wall; the piece angle is set to `F` or `F+π` depending on which side of the wall its centre lies; the piece is then translated so that its **back face lies on the wall's inner face**, offset by half the wall thickness, plus baseboard thickness when baseboards exist.
- **Doors/windows**: instead of the generic offset, when the dropped piece is a resizable, width/depth-deformable door/window with no model transformations, its **depth is set to a small epsilon plus `wallThickness / modelWallThickness`** — i.e. the frame depth is re-derived from the wall's thickness; otherwise the door keeps its own depth and the wall-distance/thickness fields are used to straddle the wall. Afterwards `boundToWall` is set true only for a straight wall (arc extent null or zero).
- **Keeping pieces out of walls**: after repositioning, for a non-door/window piece the code builds the walls' area, subtracts the reference wall footprint, and intersects it with the repositioned footprint. If there is a leftover that pokes into another wall, it tries to slide the piece **along** the wall so it stays inside; if that fails (or the piece is exactly parallel and spans multiple wall loops) it returns `null`, abandoning the wall snap. This is the closest thing to a placement constraint in the whole feature.
- **Wall avoidance across a wall**: if the drop point is on the opposite side of the wall from the piece centre, the piece is moved past the wall by its own plan extent plus wall thickness plus baseboards — so dragging a piece to the far side of a wall keeps it on that side instead of straddling.

### 2.9 Side-by-side *drop* magnetism: overlap, largest shared edge, flush nudge

[OBSERVED `evidence/region_plancontroller_sidebyside.txt` lines 46–208; helpers `evidence/src_magnetize_helpers.txt`]

- Applies to a single dragged piece whose ground elevation band vertically overlaps a candidate's band (`x < F + h_candidate` and `x + h_dragged > F`). A wall-bound door/window may only pair with another door/window; free pieces may pair with anything.
- **Candidate side band**: for a free piece it is the area of that piece's footprint (cached per piece); for a door/window paired with another door/window it is the union of two thin bands built along the candidate's front and back edges with thickness `2 × PIXEL_MARGIN / scale`.
- **Selection criterion**: intersect the dragged piece's footprint with the candidate band; require a non-empty intersection, require the *rest* of the footprint (footprint minus band) to be a single non-degenerate region, and require the band-minus-overlap part to be empty — i.e. the dragged piece overhangs on exactly one side of the neighbour. Among all candidates satisfying this, take the one with the **largest intersection area**.
- **Where it lands**: decide whether the overlap is larger on the candidate's front/back or left/right side, compute the offset that puts the dragged piece flush against the neighbour's edge, and apply it. If the resulting position still intersects the neighbour or a wall, try the mirrored side; if that also fails, return null. When the resolver was called with `copyAngle = true` (no wall hit), the dragged piece's angle is set to the neighbour's angle.
- Return value is the matched neighbour, which is what suppresses the shelf-box rule.

### 2.10 Shelf-box insertion (the "tuck it into the bookcase" rule)

[OBSERVED `evidence/region_plancontroller_sidebyside.txt` lines 210–end, `evidence/src_isarealarger.txt`]

- Only for non-horizontally-rotated shelf units whose ground elevation matches a shelf box's lower Z **within 0.1** (model units, i.e. 0.1 cm).
- The box rectangle is built from its normalised lower/upper x/y extents, transformed by the shelf's position/angle and mirroring.
- A box is eligible when its intersection with the piece's footprint leaves a spill area `A = footprintArea − intersectionArea` with `|A| > 0.01` and `A < footprintArea/4` — i.e. **the piece is mostly inside the box with a small overhang** — and the best box is the one with the largest such `A`.
- The piece is then snapped flush to the box's inner edge (using the signed distance of the farthest corner from the box edge, mirrored if the shelf's model is mirrored); if the caller allowed it, the piece copies the shelf's angle.

### 2.11 Numeric constants and tolerances (all OBSERVED in the shipped bundle)

| constant | value | used for |
|---|---|---|
| `PIXEL_MARGIN` | 4 px | selection margin (`/scale` → model units), wall hit margin |
| `INDICATOR_PIXEL_MARGIN` | 5 px | drag-indicator hit margin |
| `WALL_ENDS_PIXEL_MARGIN` | 2 px | wall-end hit margin |
| touch pointer | selection margin × 2 | `getSelectionMargin` |
| drop-on-top containment | 5 % of `min(widthInPlan, depthInPlan)` | `getHighestSurroundingPieceOfFurniture` |
| shelf containment | 20 % of the same | `getSurroundingFurniture` default |
| side-by-side band thickness | `2 × PIXEL_MARGIN / scale` | door/window face bands |
| box-fit spill | `0.01 < A < footprint/4` | shelf-box insertion |
| shelf Z match | `0.1` | shelf-box elevation match |
| door depth epsilon | `0.00075` | door frame depth added when fitted to a wall |
| length magnetisation | tolerance 0.1 → step 0.1/0.5/1/5/10/100 cm | `getMagnetizedLength` |
| rotation snap | `STEP_COUNT = 24` → `2π/24 = 15°` | all five rotation states |
| door auto-bind | wall-area coverage ratio > 0.999 | `PlanController.addFurniture` |

### 2.12 Rotation magnetism: one `STEP_COUNT = 24` shared by every rotation state

[OBSERVED `evidence/region_rotation_magnetism.txt`, `evidence/region_rotation_state.txt`]

The 15° snap I could not find by grepping for `Math.PI/12` is expressed as a **step count**, which is why a constant search failed:

```
if (alignmentActivated || magnetismEnabled) {
    step = 2 * Math.PI / STEP_COUNT;     // STEP_COUNT = 24 → 15°
    angle = Math.round(angle / step) * step;
}
```

This exact block appears in **all five** rotation controller states that carry `STEP_COUNT = 24` — piece of furniture rotation, piece **name** rotation, room name rotation, room area rotation, label rotation — and in the dimension-line pitch state. So:
- The snap is a simple nearest-multiple rounding of the *absolute* angle (not a relative-to-start snap), applied on every mouse move.
- It fires when **either** the plan alignment feature is active **or** magnetism is on: `alignmentActivated || magnetismEnabled`. They are two independent triggers for the same rounding.
- `alignmentActivated` comes from `wasAlignmentActivatedLastMousePress()`; `magnetismEnabled` is `preferences.isMagnetismEnabled() !== wasMagnetismToggledLastMousePress()` — an **XOR**, i.e. the per-drag toggle inverts the preference, so Alt (or the equivalent) *adds* snapping when magnetism is off and *removes* it when magnetism is on.
- `escape()` restores the pre-drag angle (and the door's `boundToWall` flag), so cancelling a rotation is complete.

This resolves unknown #2 of my own list and closes the round-1 gap about how the 15° snap is implemented. The user-guide wording ("the angle of the walls on the floor is a multiple of 15° by default … you may cancel this magnetism … or by holding the Alt key") is the same mechanism surfaced for walls. [DOCUMENTED, `docs/userguide.txt` line 208]

### 2.13 Doors/windows auto-bound on add

[OBSERVED `evidence/region_plancontroller_magnetize.txt` region, `PlanController.addFurniture`]

When magnetism is enabled and furniture is added, `PlanController.addFurniture` post-processes it: for every `HomeDoorOrWindow`, intersect its footprint area with the walls' area; if the intersection is non-empty and the door's own area divided by the intersection area is **> 0.999** — i.e. the door is essentially fully inside a wall — set `boundToWall = true`. This is the "drop a door onto a wall and it becomes a wall-bound door" rule, applied at *add* time rather than only in the drag resolver. The javadoc confirms the intent: `PlanController.addFurniture` = "Adds furniture to home and updates door and window flags if they intersect with walls and magnetism is enabled." [DOCUMENTED, `PlanController` javadoc]

### 2.14 Documentation cross-check (javadoc, 7.5 API)

[DOCUMENTED, `https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/viewcontroller/FurnitureController.html`]
The javadoc independently confirms the command semantics I read from the bundle: the eight align methods are documented as "Controls the alignment of selected furniture on **top/bottom/left/right/front side/back side/left side/right side** of the **first selected piece**"; distribution is "along horizontal axis" / "along vertical axis" / "along the axis orthogonal to the given one"; `getHighestSurroundingPieceOfFurniture` is "the highest piece of furniture that includes the given piece **with a margin error of 5 % of the smallest side length**"; `getSurroundingFurniture` is "the **shelf units** which include the given piece **with a margin error of 20 %**"; `getFurnitureInSameGroup` "Returns the furniture list of the given piece which belongs to same group or home furniture if it doesn't belong to home furniture" (since 5.0); `resetFurnitureElevation` since 4.4. This is an independent confirmation of the two margin constants and of the group-scoped lookup.

[DOCUMENTED, `https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/viewcontroller/PlanController.html`]
`adjustMagnetizedPieceOfFurniture` = "Attempts to modify `piece` location depending of its context."; `toggleMagnetism` = "Toggles temporary magnetism feature of user preferences."; `setAlignmentActivated` / `wasAlignmentActivatedLastMousePress` confirm the per-mouse-press toggling model (this is the *wall drawing* alignment feedback, distinct from furniture alignment [INFERRED]).

### 2.15 Version provenance (which release introduced what)

[DOCUMENTED `evidence/doc_history_en.txt` (and `doc_history_de.txt`) — the vendor's own release history, fetched from the Sweet Home 3D site]

Mapping each feature to its release makes the design intent legible and shows that the alignment/distribution/magnetism surface was built up over 14 releases:

| version | entry (shortened) |
|---|---|
| 0.14 | "Added furniture alignment menu items." |
| 1.1 | "Managed walls modification with active magnetism." |
| 1.4 | "Applied magnetism to lengths depending on the current scale in the plan and unit." |
| 2.3 | "Added **Furniture > Group** and **Furniture > Ungroup** menu items…" |
| 3.4 / 3.3 | drawing magnetism for walls and rooms; "Increased magnetism sensitivity"; alignment lines |
| **3.5** | the big one: **Align on front side / back side / left side / right side**; **Distribute horizontally / vertically**; **Align side by side**; **"Align or distribute furniture" menu in the plan popup menu to grant access to these features in the online version**; drag magnetism "when its borders approach the borders of an other piece of furniture"; "Improved magnetism of furniture along walls (including round walls) with **anti collision system**" |
| 3.6 | "Improved alignment magnetism of a piece of furniture when its side is aligned along a wall." |
| 3.7 | "Displayed groups in the furniture table as expandable / collapsible tree nodes." |
| 4.0 | "Used the **Shift** key to keep objects moved in the plan aligned along horizontal or vertical axis, and changed the key used to toggle magnetism" |
| 4.5 | "Fixed a bug that prevented **side by side alignment of superimposed pieces**…"; order preserved after grouping |
| 5.0 | select/edit/delete objects inside groups **without ungrouping**; "Furniture > Add to group" and "Edit > Paste to group"; expanded groups saved in the list |
| 6.0 | "Fixed angle of grouped furniture according to the angle of **leading selected piece**" — confirms the leader concept |
| 7.0 | "Added a button in the toolbar to **enable/disable magnetism**." |
| 7.2 | shelf-unit magnetism via the new `shelfElevations` / `shelfBoxes` catalog properties; **"shelves magnetism"** added to Sweet Home 3D JS Online |
| 7.3 | "Fixed mirroring operation on a group of furniture containing rotated pieces." |

Two takeaways for CasaPlazAI: (a) the *arrangement* commands (align/distribute/side-by-side) and the *drag assist* (magnetism) are separate deliverables shipped at different times — align/distribute came first (0.14 → 3.5), drop magnetism later and iteratively (3.5 → 4.5 → 7.2); (b) the online edition was explicitly given the align/distribute features via a **plan popup menu** in 3.5, which is the pattern to copy for a no-menu-bar single-page app.

### 2.16 Browser-edition presence and open items

[OBSERVED `evidence/doc_history_en.txt` (and `doc_history_de.txt`); DOCUMENTED; INFERRED where noted]

- The browser edition **does** carry alignment, distribution, grouping and magnetism from **3.5** onward: the history explicitly says the "Align or distribute furniture" plan popup menu was added "to grant access to these features in the **online** version", and 7.2 added "shelves magnetism … to Sweet Home 3D JS Online". Round 1 separately found that model import, photo and video creation are absent online. So grouping/alignment/magnetism = present online; model/texture import = desktop-only. [OBSERVED history + round-1 §2.1]
- The shipped web bundle contains the full set of classes/methods analysed above, which independently corroborates that the browser build ships the feature. [OBSERVED]
- The **German user guide omits alignment, distribution and grouping entirely** — I stripped both the saved German guide and a freshly fetched copy and found no `ausrichten`/`verteilen`/`gruppieren` in a furniture sense (only "Ausrichtungslinien" for drawing aids and "ausgerichtet" for door/window auto-fit). A systematic count on the full English guide returns **0** occurrences of "Align", "Distribute", "Group" and "side by side" in this sense. The features are only documented in the javadoc, the release history and the tool itself. CasaPlazAI should not copy that documentation gap. [OBSERVED `evidence/doc_de_users_guide.html`, `evidence/doc_findings.md` finding 1-negative; round-1 `docs/users-guide_`]
- **The only documented modifier keys are for magnetism/rotation, not for align/distribute.** 15° rotation snap: **Alt** toggles it; temporary magnetism: **Alt** (Windows) / **cmd** (macOS) / **Shift+Alt** (Linux); the 3.5 blog adds **Shift while moving a piece** temporarily disables drag magnetism; v4.0 changed the toggle key. **No keyboard shortcut is documented for any align/distribute/group command** — they are menu/popup-menu only (INFERRED: there may be undocumented accelerators, but nothing in the vendor material). [DOCUMENTED `evidence/doc_findings.md` finding 10]
- **Live confirmation is now partly in place** (§2.17): the shipped alignment/distribution maths has been executed against a live headless Chrome and the numbers match §2.3/§2.4 exactly. What remains bundle-only is the `Home`-level wiring (undo, enablement, the magnetize resolver as a whole); the sentencing evidence for those is that the javadoc's prose (5 % / 20 % margins, "first selected piece", same-group lookup) matches the code exactly.

### 2.17 Live / documented follow-up evidence

[OBSERVED `evidence/`; see also `sources.json`]

This round ran two parallel follow-ups:

**Documentation follow-up (delivered).** Saved into `evidence/`: `doc_de_users_guide.html`/`.txt`, `doc_en_users_guide.html`/`.txt`, `doc_history_en.txt`/`doc_history_de.txt` (release history → §2.15), `doc_features_en/de.html`, `doc_online.html`, `doc_faq.txt`, `doc_blog.html`, `doc_tips.html`. Findings from it that I did **not** already have from the bundle: §2.15 version provenance, the German-guide omission of align/distribute/group, the online-edition popup-menu route for these features, and 7.2 "shelves magnetism" arriving in the JS build.

**Live browser probe — the app's JavaScript core boots offline under REA.** [OBSERVED `evidence/fixture/bootcheck.html`, `evidence/scenarios/01_bootcheck_local.json`, `evidence/results/01_bootcheck_local.json`, `evidence/results/01_bootcheck_dom.html`]

The winning recipe (the round-1 blocker is now solved) is to serve a small local fixture over `http://127.0.0.1:8765/` and point `capture-browser-scenario` at it instead of the live site:

- The fixture loads the app's own script list from the copied `/libjs/` tree — `big.min.js`, `gl-matrix-min.js`, `jszip.min.js`, `jsXmlSaxParser.min.js`, `core.min.js`, `geom.min.js`, `stroke.min.js`, `swingundo.min.js`, `batik-svgpathparser.min.js`, `triangulator.min.js`, `graphics2d.min.js`, `sweethome3d.min.js` — in that order, then runs a probe and writes JSON into a `<pre id="out">`.
- The scenario JSON that worked uses only `wait_for_timeout` + `at_end: ["dom","url","screenshot"]` + `events: ["console","page-errors"]` with `command_timeout_ms: 60000`; no special GL flags were needed, because the DOM dump never has to render 3D.
- Result: **all of the app's core classes are live globals** — `Home`, `HomePieceOfFurniture`, `HomeFurnitureGroup`, `HomeDoorOrWindow`, `PlanController`, `FurnitureController`, `CatalogPieceOfFurniture`, `FurnitureCatalog`, `HomeShelfUnit`, `HomeLight`, `UserPreferences`, `HomeObject`, `Wall`, `Room`, `CollectionEvent` are all `function`, `LengthUnit` is an `object`, the Java shim is present (`java` defined, `java.awt.geom.Line2D` present), `new Home()` succeeds, and the page reported **zero JS errors**.
- Caveats found: `java.awt.geom.Area` was `undefined` in that probe (only `Line2D` was on the checked path), `Home.getFurnitureCount` does not exist, and the quick 3-argument `HomePieceOfFurniture(...)` construction raised `invalid overload` — so the exact constructor signature still needs enumerating before numeric before/after experiments.

This confirms the model/controller surface is genuinely reachable offline and independently corroborates the class names that §2.1–§2.14 are built on. Numeric before/after verification of the alignment/distribution maths is the natural next step; it is listed in §4.

**Exact REA scenario key names (confirmed, not guessed).** [OBSERVED `evidence/live_findings.md` §1, from `rea capture-browser-scenario --schema` plus the packaged strict Zod schemas] This closes a real gap for future rounds on this app:

- Top level is a **strict object** with exactly eight keys: `browser` (required), `start_url` (required, `{url, query[]}`), `environment`, `actions` (required, ≥ 1 step), `storage`, `secrets`, `capture`, `command_timeout_ms`. Unknown keys are **rejected**.
- `browser` is a discriminated union on `mode`: `{mode:"launch", executable_path, headless}` or `{mode:"connect", cdp_endpoint, target_id}`.
- Action vocabulary: `goto` (`destination`, `wait_until`), `click`, `fill`, `press`, `select_option`, `check`, `uncheck`, `wait_for`, `request`, `wait_for_timeout` (**`duration_ms`**, not `timeout_ms`); locators are `test_id` / `role` / `css`.
- **There is no `evaluate`/`init_script`/`preload` action and no way to pass Chromium flags** (`launch_args`, `args`, `chromium_flags` all absent). The only caller-influenced flag in the whole package is the env var `REA_BROWSER_NO_SANDBOX=true`. The only "run my own JS" route is therefore **to put the script in a page you serve** — exactly what the fixture does.
- `command_timeout_ms` is the **only** timeout knob (integer, default 20 000 ms) and it bounds the initial `goto`. That is the direct cause of round-1's `provider_timeout`: the remote `SweetHome3DJSOnline.jsp` pulls ~15 more scripts from the public origin plus Firebase/GTM/crypto-js and cannot finish inside the 20 s default. Serving the same bundles over loopback fixes it completely (boot in **6.2 s**).

**Live-observed app facts (independent corroboration).** [OBSERVED `evidence/live_findings.md` §4, `evidence/results/01_bootcheck_dom.html`] In the running page: `new Home()` **constructs successfully**; all the class names in §2.1 are live globals; `FurnitureController` exposes the statics this report relies on (`doDistributeFurnitureAlongAxis`, `alignPieceOfFurnitureAlongSides`, `alignPieceOfFurnitureAlongLeftOrRightSides`, `getPieceBoundingRectangleWidth/Height`, `doGroupFurniture`, `doUngroupFurniture`, `getPieceOfFurnitureGroup`, `doSetFurnitureElevation`, `undoAlignFurniture`, `sortFurniture`, `getMinX/MaxX/MinY/MaxY`); and the ≥ 2 / ≥ 3 / ≥ 1 guards match §2.1 and §2.4. One benign fixture artefact was observed: a single `page-error` from a `DirectHomeRecorder.prototype = Object.create(HomeRecorder.prototype)` site, because serving the bundle without the app's own loader leaves `HomeRecorder` invisible at that top-level statement — it does **not** stop the classes used here from loading.

**Still not obtained:** the targeted numeric before/after run (build a `Home`, add pieces, call the align/distribute statics, diff coordinates). The probe reported the 3-arg `HomePieceOfFurniture(...)` constructor as `invalid overload` and `java.awt.geom.Area` as `undefined` on the paths checked, so the exact constructor signature and `Area` availability must be enumerated first. See §4 item 1 and item 7.

**Numeric confirmation — obtained, by sidestepping the constructor.** [OBSERVED `evidence/fixture/numeric.html`, `evidence/scenarios/02_numeric.json`, `evidence/results/02_numeric_out.json`, `evidence/results/02_numeric.json` (exit 0, zero `page-errors`)] The `HomePieceOfFurniture` constructor has four interleaved overload branches guarded on `typeof r === "string"` plus a `PieceOfFurniture`-interface check and an `Array` check, so duck-typed objects are rejected; but **every routine this report describes is a *static* on `FurnitureController` that only calls `getX/getY/setX/setY/move/getAngle/getPoints/getWidthInPlan/getDepthInPlan`**, so a hand-built stub piece drives them without ever constructing a `Home`. Concrete numbers (units = cm, angles = radians):

| probe | input | live output | what it proves |
|---|---|---|---|
| `getPieceBoundingRectangleWidth` (leader 200×100) | base angle `0`, `π/2`, `π/4` | `200`, `100`, `212.132034` | the extent helper really is `\|w·cosθ\|+\|d·sinθ\|`; at 45° both extents are `(200+100)/√2 = 212.132` |
| `getPieceBoundingRectangleHeight` | same three | `100`, `200`, `212.132034` | the sin/cos-swapped twin, exactly as described |
| `alignPieceOfFurnitureAlongSides` | leader `A` at origin 200×100 (θ=0), back edge `[0]→[1]` = `y=−50`; piece `B` 100×60 at `(0,500)`, flag `false`, aux `null` | `B → (0, −20)`; returned `100`; `B`'s top edge `= −50` | **flush placement verified**: `B`'s top edge lands exactly on the leader's back edge, and the returned value is the piece's bounding **width** |
| `alignPieceOfFurnitureAlongLeftOrRightSides` | leader `A3` 200×100 (θ=0), left edge `[3]→[0]` = `x=−100`; piece `B3` at `(900,0)`, flag `false` | `B3 → (−50, 0)`; leader left edge `−100` | **flush placement verified** for the side routine too (`B3`'s left edge, `−50 − 50 = −100`, coincides with the leader's) |
| `doDistributeFurnitureAlongAxis(pieces, true)` | widths `100, 200, 150` at `x = 0, 300, 900` (leader = first) | `x → 0, 437.5, 900`; **both gaps `287.5`** | equal-gap distribution verified numerically; the gaps are computed with rotation-aware half-extents |
| `doDistributeFurnitureAlongAxis(pieces, true)` with a **rotated** middle piece (200×50 at θ=90°) | half-extents become `50, 25, 75` | middle `x → 437.5` unchanged; **both gaps `362.5`** | the rotated piece's along-axis extent is its **rotated** half-width (25), *not* its raw `widthInPlan/2` (100). Running the naive raw-width arithmetic on the same coordinates would have reported symmetric `287.5`, which is the trap the helper exists to avoid |
| `doDistributeFurnitureAlongAxis(pieces, false)` | heights `50, 80, 50` at `y = 0, 300, 900` | `y → 0, 450, 900` | the vertical variant and its boolean dispatch work; outer pieces are pinned, the middle moves |

Two extra facts fell out of the probe that the bundle reading could not settle definitively: **`doDistributeFurnitureAlongAxis` is a static with signature `(pieces, horizontal: boolean)` and is *not* on the prototype** (`typeof FC.prototype.doDistributeFurnitureAlongAxis === "undefined"`), and the same is true of the `getMinX/getMaxX/getMinY/getMaxY` helpers. The real callers confirm this: `distributeSelectedFurniture(horizontal)` invokes `a.doDistributeFurnitureAlongAxis(b, d)` statically, and the undo edit's `redo` does the same.

> **Method note.** The probe calls the shipped statics with my own stub pieces, so it validates the *arithmetic and dispatch* of the shipped code against independently-reasoned expectations; it does not exercise `Home` wiring, undo posting, or the enablement guards (those are covered from the bundle in §2.1). All numbers above are the page's own output, reproduced verbatim in `evidence/results/02_numeric_out.json`.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. "Palette" = the current seven types. CasaPlazAI schema facts referenced below come from `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`: `FurnitureItem = {id, type, roomId, position:[x,y], rotationDeg, footprint:[a,b]}`; footprint is the **unrotated** rectangle centred on `position`; consumers compute corners as `rotate(position ± R(θ)·offsets)`; there is **no elevation and no grouping in `FloorplanData`**, and the schema evolves only through `migrate.ts` (`registerTransform(1, …)` + `SCHEMA_VERSION` bump, additive).

| # | Idea | Ties to finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Rail of alignment + distribution commands over `FurnitureItem.position`.** Implement the eight align commands (top/bottom/left/right on the rotated footprint's axis-aligned bbox; front/back/left/right-side along the leader's own edges) plus equal-gap distribution. Needs **no schema change** — every command only writes `position` (and optionally `rotationDeg`). Anchor on a "leader" = first-selected/focused item, keep the leader stable across selections, and register **one undo entry per command**. | §2.1, §2.3, §2.4 | High | Low |
| 2 | **One rotation-aware extent primitive shared by alignment, distribution and collision.** `extentAlong(item, axisAngle) = |a·cos(θ+axis)| + |b·sin(θ+axis)|` (and the sin/cos-swapped height variant). This single helper is what makes distribution correct for rotated furniture and it also feeds the existing fit/collision checks. | §2.4 (`getPieceBoundingRectangleWidth/Height`) | High | Low |
| 3 | **Edge-based "align side by side" / "pack flush" command.** Sort the selection along the leader's front axis, then walk outward packing each item flush with a running offset. This is the command users actually reach for when building a sofa+side tables row, and it reuses idea 2. | §2.5 | High | Low–Med |
| 4 | **Grouping as editor-local state, not schema.** Mirror `HomeFurnitureGroup`: a nested group object that *is* movable/resizable, whose position/size are derived from children, plus group/ungroup and "group N" default naming, with move/rotate/scale propagating to children (move = same delta; rotate = about group centre; scale = project the scale factor onto each child's own angle). Persist under an editor-local key (the same pattern already used for snap settings and the underlay). | §2.2 | High | Med |
| 5 | **Magnetism resolver with the documented rule order and gating.** Implement `magnetize(item, x, y)`: wall-snap → side-by-side flush → (elevation, when the schema gains it) and make each earlier rule suppress later ones exactly as Sweet Home 3D does. Wall snapping maps directly onto CasaPlazAI's room polygons: find the room segment within `PIXEL_MARGIN/scale`, set `rotationDeg` so the item's back face is parallel, and inset by `wallThickness/2` from the schema. Gate it on a `magnetismEnabled` preference plus a temporary key. | §2.6, §2.8, §2.9 | High | Med |
| 6 | **Drop-on-top needs an elevation concept the schema does not have.** Two options, ranked: **(a)** add an editor-local `elevationById` map (out-of-schema, persisted like the underlay) purely for 2D/3D preview and the "dropped on a counter" assist — cheapest, keeps `FloorplanData` frozen; **(b)** if the 3D viewer must see it, do the honest additive bump: register `registerTransform(1, v1 => ({...v1, furniture: v1.furniture.map(f => ({...f, elevation: 0, dropOnTop: f.footprint[1]}))}))` and bump `SCHEMA_VERSION` atomically, matching the barrel's additive-only rule. Either way, reuse the **containment test** (all four rotated corners inside the host's footprint, expanded by 5 % of the host's smaller extent) instead of a naive bbox overlap. | §2.7 | High | Low (a) / Med–High (b) |
| 7 | **Side-by-side *drop* magnetism (largest-shared-edge nudge)** — when a dragged item already overlaps exactly one neighbour, nudge it flush against that neighbour rather than leaving it half-buried; pick the neighbour with the largest intersection area and abandon the nudge if the result would still intersect (or would hit a wall). | §2.9 | Med–High | Med |
| 8 | **Reset-elevation command** ("put it back on the floor / on the counter") using the same host formula; trivial once idea 6 exists. | §2.7 | Med | Low |
| 9 | **Alignment/distribution feedback + disabled-state rules** — enable them only for ≥ 2 (align) / ≥ 3 (distribute) **movable** selected items; refuse "group" when any selected item already lives in a group; allow align/distribute across groups. Show them in one "Align or distribute" submenu, exactly as Sweet Home 3D does, and mirror CasaPlazAI's non-movable edge-bound doors/windows into the same filter. | §2.1 (enablement table), §2.3 | Med | Low |
| 10 | **Keep hard collision as the differentiator, add a "warn and allow" mode.** Sweet Home 3D enforces *nothing*: the magnetism chain only nudges, and overlapping furniture renders on top of itself. CasaPlazAI's existing fit/collision constraint is already ahead; offer block (current) vs warn+allow (Sweet-Home-3D-like freedom) and drive the warn case off `dropOnTop` metadata. | §2.6, round-1 §2.8 | High | Med |
| 11 | **Numeric defaults from §2.11 as a shared constants module** — 4 px margin, 5 % containment, 20 % shelf containment, 0.1 match tolerance, the tolerance→step rounding for dimensions. Documenting them as named constants makes the "why did it snap?" behaviour testable. | §2.11, §2.4 | Med | Low |
| 12 | **Shelf/insertion rule** — only worth it after idea 6 and a per-type "container" notion exist; the "mostly inside, spill < ¼ of the footprint" test is a neat, cheap heuristic for tucking a chair under a desk. | §2.10 | Low–Med | Med |
| 13 | **Rotation snap for `rotationDeg` using the same step mechanism.** `snapped = Math.round(deg / 15) * 15`, on by default while dragging a rotate handle, with a modifier key that XORs it against the magnetism preference (exactly Sweet Home 3D's `alignmentActivated || magnetismEnabled` then XOR). Snap the **absolute** angle (nearest multiple), not a delta from drag start — that is what the shipped code does and it avoids drift across a long drag. | §2.12 | Med–High | Low |
| 14 | **Wall-snap should reuse the schema's own geometry.** CasaPlazAI already stores `wallThickness` and room polygons; the wall rule is then: find the segment whose thickened footprint contains the drop point within a small screen-pixel margin, set `rotationDeg` to the segment direction (choose the face by which side the centre is on), and place `position` so the item's back face sits at `wallThickness/2` inside. No new schema field needed. | §2.8, §2.13 | High | Med |

**Anti-patterns / traps not worth copying:**

- The wall-snap routine runs **two byte-identical wall scans** back to back in the shipped web build (the second under `if (referenceWall == null)`). Whether that is duplicate Java source or a GWT artefact, the second pass re-does work the first pass already did — don't mirror it.
- **Magnetism silently re-rounds the *dimensions* of every dragged piece** (`getMagnetizedLength(width/depth/height/elevation, 0.1)` on drag start), so a user who dislikes the assist still gets their sizes changed by merely touching the piece. CasaPlazAI should round dimensions only when the user asked for snapping, and keep positional assist separate.
- The eight alignment commands are split across **two inconsistent notions of "edge"** (axis-aligned bounding box for top/bottom/left/right vs the leader's rotated footprint edges for front/back/left-side/right-side) with names that do not make the difference obvious. CasaPlazAI should label them explicitly ("align bounding boxes" vs "align faces"), or pick one notion.
- The German (and English) **user manual documents none of this** — no align, distribute or group section. Groups and alignment are discoverable only from the menu. Whatever CasaPlazAI ships needs discoverable affordances plus a line of explanation, not a silently-enabled menu.

---

## 4. Unknowns

1. **Live numeric verification — CLOSED for the pure maths, OPEN for the `Home` path.** I now have a working offline harness (§2.17) and a stub-piece probe that executes the shipped statics and confirms the bounding-extent formula, both edge-alignment routines (flush placement lands exactly on the leader's edge), equal-gap distribution, and vertical/horizontal dispatch — all verbatim in `evidence/results/02_numeric_out.json`. What is **not** exercised live: constructing a real `HomePieceOfFurniture` (the constructor's four overload branches reject duck-typed objects), `Home`/undo/enablement wiring, `adjustMagnetizedPieceOfFurniture` end to end, and anything needing `java.awt.geom.Area`. Everything else in this report is OBSERVED-from-bundle + DOCUMENTED, corroborated by the javadoc prose matching the code.
2. **Rotation magnetism** — **RESOLVED this round** (was unknown 2 in the draft): the snap is `Math.round(angle / (2π/STEP_COUNT)) * (2π/STEP_COUNT)` with `STEP_COUNT = 24`, applied in five rotation states when `alignmentActivated || magnetismEnabled`. See §2.12. The remaining question is only *which physical key* maps to `toggleMagnetism` per platform (the guide says Alt/cmd/Shift+Alt).
3. **The transpiled double wall scan** in `adjustPieceOfFurnitureOnWallAt` may be an artefact of the Java→JS compiler or two genuinely different passes whose bodies were flattened identically. I could not resolve which without the Java source.
4. **Operator precedence** in the shelf fallback `n.length===0 || n[0]!==0 && piece.elevation===0` was read with C-style `&&` binding tighter than `||`; if the compiler meant otherwise the fallback triggers on a slightly different condition.
5. **`getSurroundingFurniture` ordering/limit** — the method returns every containing candidate with no cap; I did not measure how a room full of overlapping candidates performs.
6. **Shelf-box geometry details** (the exact corner-order and mirroring in the box rectangle, and which of the two corners is used for the flush snap) were only partly traced; the high-level rule is solid, the last few metres are INFERRED.
7. **Offline harness gaps (partly closed).** The stub-piece probe removed the constructor blocker for the *pure* routines, but `java.awt.geom.Area` came back `undefined` in the bootcheck (only `Line2D` was on the checked path) and `Home.getFurnitureCount` does not exist. The **exact `HomePieceOfFurniture` constructor signature** therefore still needs enumerating before a full `Home`-based numeric run, and the `Area` question matters: if `Area` is genuinely absent under the browser build, the containment/intersection code paths (drop-on-top, side-by-side, shelf-box) could behave differently online than on the desktop — i.e. the *online* edition could have weaker magnetism than the desktop edition. Worth a targeted check.
8. **German UI labels and the menu that hosts the align submenu** — the German user manual has no section on these features at all (confirmed). The web build wires them into one "Align or distribute" plan popup submenu (§2.1, and 3.5's release note says the popup was added precisely "to grant access to these features in the online version"); where the Java desktop build places them (Furniture menu vs piece context menu) and the exact German wording were not confirmed from a running desktop build (not permitted to install here). The literal UI labels live in `HomePane*.properties`, which 404 on the public web.
9. **Multi-level behaviour** of alignment/grouping: `isPieceOfFurnitureVisibleAtSelectedLevel` and level-elevation deltas appear in the host math, but I did not verify whether alignment is restricted to the selected level or can move pieces across levels.
10. **Group resize semantics edge cases** — the projected scale formula for a child whose angle differs from the group's is clear for pure width/depth scaling, but the combined rotate+scale path (`setWidth` + `setAngle`) was not traced end to end.
11. **Whether CasaPlazAI should model drop-on-top at all** is a product decision: its `FurnitureItem` has no elevation, and adding one is a `SCHEMA_VERSION` bump. Idea 6(a)/(b) is a proposal, not a validated design.
12. **`Shift`-to-constrain-move (4.0 history entry)** and the rotation *indicator* drag were not traced in code; the guide and history say they exist (the 3.5 blog says magnetism is "temporarily disabled by pressing the Shift key while moving the piece"), but I did not find the code path that keeps a dragged piece axis-aligned under Shift.
13. **Magnetism OFF = raw drop (documented, low residual risk).** The vendor guide phrases the assist conditionally ("When magnetism is active…") and the observed guard `isMagnetismEnabled() && …` matches; I verified the guard in the shipped bundle but did not toggle the preference live, so the *user-visible* difference between the two settings is DOCUMENTED + OBSERVED-at-code-level rather than OBSERVED-in-a-running-UI.
