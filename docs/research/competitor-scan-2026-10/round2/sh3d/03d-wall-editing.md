# Sweet Home 3D — Wall editing: split / join / reverse, round & sloping walls, "Recompute walls", room point add-delete

**Job folder:** `rea2-sh3d-p2/02-03d-walls-rooms-drawing-wall-edi` (round 2)
**App:** Sweet Home 3D — https://www.sweethome3d.com/de/ (GPL Java desktop) · browser build https://www.sweethome3d.com/SweetHome3DJSOnline.jsp
**Research date:** 2026-10-31 · REA v6.8.0 · live app = Sweet Home 3D JS Online **7.5.2** (headless Google Chrome for Testing 153, no WebGL needed for 2D plan work)
**Round-1 report reused read-only:** `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md`
**Claim tags**
- **OBSERVED** — I drove the live online app or read shipped files myself; evidence file named.
- **DOCUMENTED** — vendor user guide / release history (URL given).
- **SOURCE-VERIFIED** — I read the shipped minified online bundle and describe the algorithm in my own words. No source code is copied into this report.
- **INFERRED** — my reconstruction, not stated by the vendor.

**Scope.** Round 1 settled the wall/room *drawing* grammar, magnetism and the wall data model, and left three relevant gaps (its Unknowns #2, #3, #5). This round closes them and goes deeper on the wall/room **editing verbs**: `Split wall`, `Join walls`, `Reverse walls direction`, round- and sloping-wall behaviour under those verbs, the two differently-named "recompute" operations, and room point add/delete.

---

## 1. Summary (5 bullets)

1. **All five edit verbs are real and were exercised live.** Wall context menu on one selected wall shows `Modify walls…`, `Reverse walls direction`, `Split wall`; with two walls selected `Join walls` appears instead of `Split wall`. Each maps to one controller method and one undoable edit. **(OBSERVED, `out/probe_wall_menu.json`; SOURCE-VERIFIED)**
2. **`Split wall` is midpoint-only and preserves links + slope but corrupts arcs.** Live: a 400 cm wall became two 200 cm walls, neighbours re-threaded so the chain stays continuous; a sloping wall (250→100) split into 250→175 and 175→100. But a round wall split into two half-length walls that **each keep the full `arcExtent`**, so the original single bulge becomes two shallower bumps (apex −87.0 → −45.6; arc length 444.29 → 2 × 222.14). **(OBSERVED + SOURCE-VERIFIED)**
3. **`Join walls` splices two wall records into one chain; it does not merge them.** Live: two collinear walls with a 50 cm gap were joined by extending the first to the second's free start and cross-linking `wallAtEnd`/`wallAtStart`; the join point is the line intersection for non-parallel walls, or the bridging free endpoint for collinear ones. The candidate scan prefers arc-free walls with a free end, but a fallback path can still pick an arc wall — and when it did, the arc was retained. **(OBSERVED + SOURCE-VERIFIED)**
4. **"Recompute walls" (room dialog) ≠ "Recompute room points" (plan menu).** The dialog checkbox is internally `split-surrounding-walls-checkbox` and means *"cut the room's surrounding walls where they cross each other"* (`splitWalls`, with a per-half stub longer than half the crossing wall's thickness and a proportional slope interpolation). The plan item is `RECOMPUTE_ROOM_POINTS` (added v7.2, 2023) and re-fits the room polygon via `computeRoomPointsAt`. **(OBSERVED label + DOM name; SOURCE-VERIFIED both algorithms)**
5. **The room-point add/delete menus are desktop-only.** `ADD_ROOM_POINT` / `DELETE_ROOM_POINT` are documented as plan context-menu items (v5.0, 2015) and their APIs work live, but the **online 7.5.2 build's room context menu does not show them** (nor `Recompute room points`), even though `isRoomPointDeletableAt` returns `true` at a room corner. Round 1's Unknown #2 is therefore answered: the API is reachable, the *gesture* is not shipped online. **(OBSERVED + SOURCE-VERIFIED + DOCUMENTED)**

---

## 2. Findings

### 2.1 Where the wall/room edit verbs live (menus, actions, enable rules) — SOURCE-VERIFIED + OBSERVED

`HomeView.ActionType` enum ids (from the shipped bundle): `MODIFY_WALL [109]`, `JOIN_WALLS [110]`, `REVERSE_WALL_DIRECTION [111]`, `SPLIT_WALL [112]`, `MODIFY_ROOM [113]`, `RECOMPUTE_ROOM_POINTS [114]`, `ADD_ROOM_POINT [115]`, `DELETE_ROOM_POINT [116]`.

- **Context menu builder** adds, in order: `MODIFY_COMPASS`, `MODIFY_WALL`, `JOIN_WALLS`, `REVERSE_WALL_DIRECTION`, `SPLIT_WALL`, `MODIFY_ROOM`, `MODIFY_POLYLINE`, `MODIFY_DIMENSION_LINE`, `MODIFY_LABEL`. A second variant (the Plan-menu list) inserts the same run after the creation items.
- **Action wiring:** `JOIN_WALLS → joinSelectedWalls`, `REVERSE_WALL_DIRECTION → reverseSelectedWallsDirection`, `SPLIT_WALL → splitSelectedWall`. `ADD_ROOM_POINT` / `DELETE_ROOM_POINT` are created **without a named handler** — they are dispatched through the action map. `RECOMPUTE_ROOM_POINTS` is created (no named handler either).
- **Enablement:** `ADD_ROOM_POINT` = `y && P`; `DELETE_ROOM_POINT` and `RECOMPUTE_ROOM_POINTS` = `K && P`, where `P` = plan controller exists **and mode == SELECTION**. So the room-point verbs are Select-mode-only.
- **OBSERVED live 7.5.2 (online):**
  - One wall selected (cursor over the wall is `height16x16…ns-resize`): menu = `Undo Create walls · Delete selection · Cut · Copy · Select all · Modify compass… · **Modify walls…** · **Reverse walls direction** · **Split wall** · Import background image… · Add level · Add level at same elevation`.
  - Two walls selected: `…Modify walls… · **Join walls** · Reverse walls direction · …` — note `Split wall` is gone (exactly-one-wall rule) and `Join walls` appears.
  - Room selected: `…Modify compass… · **Modify rooms…** · Modify text style › · Import background image… · Add level · …` — **no** Add/Delete point, **no** Recompute room points.
  - No menu bar exists online (`.menu-bar` absent); the app is toolbar + canvas popup menus, consistent with the guide's "Online version has no menu bar; all menu items of the downloadable version are reachable through context menus or the toolbar, except 3D-model import and photo/video creation".
  - Toolbar ids observed (30): `SHOW_APPLICATION_MENU, VIEW_FROM_TOP, VIEW_FROM_OBSERVER, UNDO, REDO, DELETE_SELECTION, CUT, COPY, PASTE, ADD_HOME_FURNITURE, SELECT, PAN, CREATE_WALLS, CREATE_ROOMS, CREATE_POLYLINES, CREATE_DIMENSION_LINES, CREATE_LABELS, DISABLE_MAGNETISM, LOCK_BASE_PLAN, FLIP_HORIZONTALLY, FLIP_VERTICALLY, INCREASE_TEXT_SIZE, DECREASE_TEXT_SIZE, TOGGLE_BOLD_STYLE, TOGGLE_ITALIC_STYLE, ZOOM_IN, ZOOM_OUT, ABOUT, PREFERENCES`.

### 2.2 `Split wall` — algorithm — SOURCE-VERIFIED + OBSERVED

Trigger: DOCUMENTED — "When one wall is selected in the plan, you can also move its start and end point with the mouse or split it in two walls with **Plan > Split wall** menu item" (User Guide §Editing walls, EN line 431; DE line 431 `Plan > Wand teilen`). Added **v1.4** (2008-10-07): "split the selected wall in two walls after inserting a point in its middle" — i.e. **always at the midpoint**, never at a clicked point. Live: clicking `Split wall` in the online popup did perform the split.

Algorithm (own words), requiring exactly one wall in the selection:
1. Snapshot the wall W, its start neighbour and end neighbour, and four booleans recording *which end* of each neighbour references W.
2. `mid = ((xStart+xEnd)/2, (yStart+yEnd)/2)`.
3. Add **two duplicates** of W at W's level.
4. First copy: keeps W's start, end moves to `mid`. Second copy: start = `mid`, keeps W's end.
5. `copy1.wallAtEnd = copy2`, `copy2.wallAtStart = copy1`.
6. Re-thread each neighbour to point at copy1 / copy2 on the same end that previously referenced W.
7. Delete W; select copy1; post one `WallSplittingUndoableEdit` carrying both new walls and both `JoinedWall` snapshots.
8. **Slope:** if W had a `heightAtEnd`, `copy1.heightAtEnd = copy2.height = (height + heightAtEnd)/2`.

**OBSERVED live** (`out/probe_join_arc_dialog.json`, `out/probe_edit_verbs.json`):
- 400 cm wall with links `(ws=0,we=1)…(ws=1,we=0)` → two 200 cm walls `(-0.5→199.5)` and `(199.5→399.5)`, links re-threaded (`(0,1)` and `(1,0)`; with a neighbour also `(1,1)`).
- Sloping wall `height 250 → heightAtEnd 100` split into `(250, 175)` and `(175, 100)` — the documented midpoint average, confirmed numerically.
- **Arc defect (new):** a chord-400 wall with `arcExtent = +π/2` (length 444.29, flattened apex y ≈ −87.0) split into two chord-200 walls that **each still carry `arcExtent = +π/2`** (lengths 222.14 each, apexes y ≈ −45.6). The bundled code duplicates the wall including `arcExtent` and only moves endpoints, so the halves are scaled-down copies: total arc *length* is conserved but the **shape is not** — one 90° bulge becomes two 90° bulges half as deep. A re-implementation must decide whether to split the arc into two sub-angles instead. (v6.4.2 fixed joined walls detaching on split/recompute; the arc case is not addressed.)

### 2.3 `Join walls` — algorithm — SOURCE-VERIFIED + OBSERVED

Trigger: DOCUMENTED — "Added Plan > Join walls menu item to join selected walls at their intersection or join aligned walls broken in two parts" (**v5.5**, 2017-09-06). Live: appears in the two-wall context menu.

Algorithm (own words):
1. **Candidate scan:** a wall qualifies only if it has **no arc** (`arcExtent == null || 0`) **and at least one free end** (`wallAtStart == null || wallAtEnd == null`). The first two qualifying walls become the pair.
2. **Fallback when fewer than two candidates:** sort the whole selection with a comparator that measures how close each wall's line intersection with wall[0] lies to wall[0]'s ends, then take the second wall of the sorted list as partner. *This is why an arc wall can still be joined* — it is excluded from the candidate scan but not from the fallback.
3. Compute both direction angles; `j = |θ1 − θ2| mod π`.
4. **Non-parallel** (`j > 0.5°` and `π−j > 0.5°`): join point = the two lines' **intersection**.
5. **Collinear** (`j ≤ 0.5°` or `π−j ≤ 0.5°` and both of wall2's endpoints lie on wall1's infinite line within 0.01): pick the bridging free endpoint — if wall2 has exactly one free end use it; if it has both free ends, pick whichever endpoint of wall2 is farther from wall1's segment ends (a `ptSegDistSq` decision tree).
6. Snap the free end(s) of each wall to the join point; link `wallA.wallAtEnd/Start ↔ wallB` while the `g` flag says a free end remains.
7. Selection = both walls if a link was made, else just the first; post `WallsJoiningUndoableEdit`.

**OBSERVED live** (`out/probe_join_arc_dialog.json`):
- Two collinear walls `(0→200)` and `(250→450)`, both ends free: after `joinSelectedWalls()` the pair became `(−0.5→249.5)` and `(249.5→449.5)` with cross-links `(we=1)` / `(ws=1)` — **the first wall was extended to the second wall's free start**, i.e. the collinear gap-bridging branch.
- Same setup with `arcExtent = +π/3` on the second wall: the join **still completed** (first wall extended to 249.5; second wall kept `arcExtent = 1.0472`, length 209.4). This is the fallback path of step 2 in action.

**Implication:** "join" never produces a single wall object. Vertical/parallel-but-offset walls that are not collinear fall into the intersection branch with parallel lines and may simply not join (INFERRED from the branch structure).

### 2.4 `Reverse walls direction` — algorithm — SOURCE-VERIFIED + OBSERVED

Trigger: DOCUMENTED — "Added Plan > Reverse walls direction menu item to reverse the direction of selected walls" (**v1.4**, 2008-10-07). It exists because wall *sides* are direction-dependent (left/right colour, texture, shininess, baseboard). Live: present in both the one-wall and two-wall menus; works on a multi-selection.

Algorithm (own words), per selected wall:
1. Swap start ↔ end coordinates.
2. If `arcExtent != null`, **negate** it.
3. Swap `wallAtStart ↔ wallAtEnd` and re-point neighbours (same four-boolean pattern as split).
4. If `heightAtEnd != null`, swap `height ↔ heightAtEnd`.
5. Swap the whole left-side style bundle with the right-side bundle (colour, texture, shininess, baseboard).
6. One `WallsDirectionReversingUndoableEdit` for the whole selection.

**OBSERVED live** on a wall carrying all three features at once: `xStart −0.5→399.5`, `arc +1.0472→−1.0472`, `height/heightAtEnd 250/100 → 100/250`, left `0x00ff00 ↔ right 0x0000ff`. All four behaviours confirmed in one call.

### 2.5 Round walls and sloping walls as wall data — DOCUMENTED + SOURCE-VERIFIED

- **Round walls:** support added **v3.0** (2010-11-30); **v3.1** (2011-02-13) "Made new round walls symmetric" and "Managed two round walls joined to each other". `arcExtent` is stored in radians, edited in degrees, clamped to ±270°. It is not a separate class — every verb must be arc-aware, and the results differ: Reverse negates the arc correctly; Split duplicates it (defect, §2.2); Join's candidate scan skips arcs but the fallback can pick them (§2.3).
- **Sloping walls:** `heightAtEnd` (round 1 verified from the shipped XML). Dialog offers Rectangular / Sloping with Height at start / Height at end. **v6.0** (2018-10-11) "Allowed sloping walls to have a minimum height equal to 0 on one end" (garret walls coming down to the floor) and added the arc-length tooltip for the Arc extent field. **v7.0** (2022-07-13) added the room's "Flat ceiling only" checkbox "to compute sloping ceilings when necessary" — i.e. **the wall slope drives the 3D ceiling** unless suppressed. Split averages the slope (§2.2), Reverse swaps it (§2.4), `splitWalls` interpolates it proportionally (§2.7).

### 2.6 Room point add / delete / drag — round 1's Unknown #2, resolved

The shipped bundle documents the intended desktop gesture and implements it:
- **DOCUMENTED:** "Added **Add point to room** and **Delete point from room** menu items in the contextual menu of the plan" — **v5.0**, 2015-07-19. "When one room is selected, you may also move each one of its points with the mouse in Select mode" — User Guide §Drawing rooms (EN line 485, DE line 485).
- **SOURCE-VERIFIED API:** `addPointToSelectedRoom(x,y)` requires exactly one selected Room and `isItemResizable`; it finds the edge with the smallest `ptSegDistSq` to the click and inserts a new vertex at `edgeIndex+1` (i.e. on the nearest edge, in edge order). `deletePointFromSelectedRoom(x,y)` uses `getPointIndexAt(x,y,indicatorMargin)` and removes that index. Guards: `isRoomPointDeletableAt` = resizable && index found; `isRoomPointsComputableAt` = room contains the point && `computeRoomPointsAt` returns a **different** list. Each posts its own undoable edit (`RoomPointAddition…`, `RoomPointDeletion…`, `RoomPointsModification…`).
- **SOURCE-VERIFIED drag:** `RoomResizeState` finds the point under the press, records old X/Y, and during the drag applies Shift alignment (`PointWithAngleMagnetism`) or magnetism (`PointMagnetizedToClosestWallOrRoomPoint` → `RoomPointWithAngleMagnetism` fallback), calls `moveRoomPoint`, shows angle feedback + triangulation dimension lines, and on release posts `RoomResizingUndoableEdit`; Esc restores.
- **OBSERVED live (API):** a 4-point room → `addPointToSelectedRoom(200,0)` → 5 points ending in `(200,0)`; `isRoomPointDeletableAt(room, corner)` → **true**; `deletePointFromSelectedRoom(200,0)` → back to 4 points. Separately, 5 → 6 → 5 on a wall-detected room.
- **OBSERVED live (UI — negative):** right-clicking exactly on a room corner (cursor `resize16x16…ew-resize`) and right-clicking a room edge both opened the *same* generic plan menu: `Undo … · Delete selection · Cut · Copy · Select all · Modify compass… · Modify rooms… · Modify text style › · Import background image… · Add level · Add level at same elevation`. **Neither `Add point to room` nor `Delete point from room` nor `Recompute room points` is present.** So online 7.5.2 ships the API but not the menu surface; the desktop build is where the v5.0 items live.

### 2.7 "Recompute walls" (room dialog) vs "Recompute room points" (plan item) — both resolved

**A. Room-dialog "Recompute walls" = `split-surrounding-walls-checkbox` → `setSplitSurroundingWalls` → `splitWalls`.**
- **OBSERVED:** the checkbox exists in the live online room dialog with DOM name `split-surrounding-walls-checkbox`, label text **"Recompute walls"**, unchecked by default, inside the "Wall sides around room" group (round-1 capture `out/probe_recompute.json` lists the full input set; my `out/probe_arc_fidelity.json` reads the element directly).
- **SOURCE-VERIFIED visibility rule:** the control is created and its group is shown whenever wall sides are editable; it is **disabled** unless the dry run `splitWalls(wallSides,null,null,null)` returns true (`disabled = !isSplitSurroundingWallsNeeded()`), and on OK it is applied only if ticked. So it is *available* on ordinary rectangular rooms but only *effective* when a room side is shared by crossing walls.
- **SOURCE-VERIFIED algorithm** (own words): for each room wall side whose wall F is straight, build F's footprint area; intersect it with every other wall x in the list; if the intersection is non-empty and **singular** (genuinely crossing, not just touching), compute the **centre-line intersection A**; duplicate F into H (start→A) and B (A→end); **reject unless both H and B are longer than half of x's thickness**; re-thread F's neighbours onto H and B; interpolate the slope proportionally — `heightAtEnd(H) = height(B) = height + (heightAtEnd − height) · dist(start,A)/length`; delete F; add H and B; rewrite the room's wall-side list so both halves inherit F's `LEFT_SIDE`/`RIGHT_SIDE`. This is a *geometry repair*, not a polygon recompute.

**B. Plan item "Recompute room points" = `RECOMPUTE_ROOM_POINTS [114]` → `recomputeSelectedRoomPoints` → `computeRoomPointsAt`.**
- **DOCUMENTED:** "Added **Recompute room points** item to plan contextual menu" — **v7.2**, 2023-09-22.
- **OBSERVED live (API, and it genuinely re-fits the polygon):** created a room from a 4-wall ring (points `[395.8,3.3] [395.8,295.8] [3.3,295.8] [3.3,3.3]`, area 114806). Moved the top wall's *end* from `(400,0)` to `(400,120)` so the side no longer matches the polygon → `isRoomPointsComputableAt(room,200,150)` returned **true** → `recomputeSelectedRoomPoints(200,150)` rewrote the room to 5 points `[3.3,4.6] [395.8,122.6] [395.8,295.8] [3.3,295.8] [3.3,4.6]` — the polygon picked up a new vertex at the oblique wall corner. `changed: true` (`out/probe_recompute_demo.json`).
- Before the wall moved, `isRoomPointsComputableAt` was **false**, which is exactly the "only enable when the result would differ" guard.

### 2.8 Room detection (used by both recompute paths) — corroborated

Round 1 established `computeRoomPointsAt`. This round shows it is the single shared primitive behind: double-click room creation (round 1), "Recompute room points" (§2.7B) and the computable guard. **OBSERVED again** that a room created from a closed ring follows the **inner wall faces** (points at 3.3 / 395.8 for 7.5 cm walls), i.e. inset by half the thickness, with area 114806 cm² for the 400×300 ring.

### 2.9 Live-observed issues / rough edges worth knowing

| Observation | Evidence | Tag |
|---|---|---|
| `Split wall` on a round wall keeps the full arc on both halves → shape corruption | `out/probe_arc_fidelity.json` | OBSERVED + SOURCE-VERIFIED |
| `Split wall` is midpoint-only; no "split at clicked point" | `out/probe_join_arc_dialog.json` + history | OBSERVED + DOCUMENTED |
| `Join walls` can join an arc wall via its fallback path (arc retained) | `out/probe_join_arc_dialog.json` | OBSERVED |
| Online room context menu omits Add/Delete point **and** Recompute room points, though the APIs and guards work | `out/probe_roompoint_menu.json`, `out/probe_wall_edit_ui.json` | OBSERVED |
| Walls created purely through `home.addWall(...)` were not selectable by canvas clicks (no level assigned), so UI probes must use tool-drawn walls | `out/probe_wall_edit_ui.json` (`wallSelected: []`) | OBSERVED |
| Change to a wall's geometry does **not** auto-update an existing room polygon; the polygon only re-fits on recompute | `out/probe_recompute_demo.json` | OBSERVED |

### 2.10 Evidence inventory (all inside this job folder)

| File | What it proves |
|---|---|
| `report.md`, `sources.json` | this report + machine-readable sources |
| `scripts/probe_edit_verbs.mjs` → `out/probe_edit_verbs.json` | live split (straight + sloping), arc-length derivation, reverse |
| `scripts/probe_wall_menu.mjs` → `out/probe_wall_menu.json` | wall context menu contents, `Split wall` via the menu, toolbar ids |
| `scripts/probe_roompoint_menu.mjs` → `out/probe_roompoint_menu.json` | room context menu has no point items; corner cursor; guards |
| `scripts/probe_wall_edit_ui.mjs` → `out/probe_wall_edit_ui.json` | `Wall/Room/Home/PlanController` globals; API room creation; add/delete point API |
| `scripts/probe_join_arc_dialog.mjs` → `out/probe_join_arc_dialog.json` | collinear join, arc-wall join, split-of-round, split-of-slope, reverse all-fields |
| `scripts/probe_arc_fidelity.mjs` → `out/probe_arc_fidelity.json` | quantified arc corruption; `split-surrounding-walls-checkbox` present/label/checked |
| `scripts/probe_recompute_demo.mjs` → `out/probe_recompute_demo.json` | `isRoomPointsComputableAt` + polygon re-fit after a wall move |
| (read-only upstream) `rea-sweethome3d-2026-10/.../sources/js/sweethome3d.min.js` | SOURCE-VERIFIED algorithms |
| (read-only upstream) `.../sources/userGuide_en.txt`, `userGuide_de.txt`, `history.txt` | DOCUMENTED claims and version dates |

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

| # | Idea | Tied to | Value | Effort |
|---|---|---|---|---|
| 1 | **Split at the clicked point, not the midpoint.** SH3D's Produce hotkey splits at 50 % only; a wall inspector that splits where the user placed a "break" marker is a strict superset of its behaviour and directly supports open-plan remodels. Keep SH3D's link re-threading (a single ordered wall chain with `startWallId`/`endWallId`) so shared walls stay valid. | 2.2 | High | Low (CasaPlazAI already has a wall list; add link ids + a "split here" handle) |
| 2 | **Model joined walls as a chain, exactly like SH3D.** Store `wallAtStart`/`wallAtEnd` ids; Join = splice + snap free ends to the intersection; Reverse = swap ends and swap per-side styles. This makes shared-wall trimming, 3D intersections and room detection mostly geometry-free. | 2.1–2.4 | High | Med |
| 3 | **Divide the arc when splitting a round wall.** SH3D's defect (each half keeps the full `arcExtent`, halving the bulge) is a free differentiator: split `arcExtent` into two sub-angles that reproduce the original curve, and expose the arc-length in the inspector. | 2.2, 2.5, 2.9 | Med-High | Med (needs arc splitting math + join re-threading on curved ends) |
| 4 | **Two "recompute" verbs, clearly named.** (a) *Recompute room outline* = re-run room detection from the current wall graph (SH3D's v7.2 item) — guard it with a "would change" test and disable it otherwise. (b) *Repair shared walls* = split surrounding walls at their crossings, with a minimum-stub rule and proportional slope interpolation (SH3D's room-dialog checkbox). Distinct labels prevent SH3D's confusion. | 2.7 | High | Med (reuses the room-detection code from Idea 4 in round 1) |
| 5 | **Room vertices as draggable, addable, deletable handles with an undo stack.** SH3D ships the API but hides the menu online; a web-first CasaPlazAI can expose hover handles + `Delete`/`Backspace` and Alt-click-to-insert-on-edge, with per-vertex undo entries. | 2.6 | High | Low-Med (the polygon and inspector exist; add hit-test + two commands) |
| 6 | **Sloping / attic walls with `heightAtEnd` in the inspector**, plus a Rectangular/Sloping toggle and a minimum height of 0. Split interpolates proportionally; Reverse swaps. Feeds sloping ceilings in 3D. | 2.2, 2.4, 2.5 | Med-High | Med |
| 7 | **Slope-aware ceilings**: derive the ceiling surface from wall `heightAtEnd` by default, with an explicit "flat ceiling" override. | 2.5 | Med | Med (3D side) |
| 8 | **Context menu that mirrors the action enum** but is filtered by selection: one wall → Split/Reverse/Modify; two+ walls → Join/Reverse; room → Modify/Recompute outline; room point → Delete point. SH3D's menu is enablement-filtered but its room menu lost the point actions online — a single source of truth for the menu prevents that drift. | 2.1, 2.6 | Med-High | Low |
| 9 | **Never let wall edits silently invalidate a room polygon.** After a wall move/split/join, mark affected rooms "outline stale" and surface the recompute action (or auto-recompute with a single undo entry). SH3D only updates on explicit recompute. | 2.7B, 2.9 | Med-High | Low-Med |
| 10 | **Arc-aware "all verbs".** Audit Split/Join/Reverse/Resize for round walls; SH3D's Join silently excludes arcs from its candidate scan and Split mishandles them — a correctness differentiator if CasaPlazAI supports curved walls. | 2.3, 2.5, 2.9 | Med | Med (only if arcs are adopted) |

---

## 4. Unknowns

1. **Exact desktop gesture for the point menus.** v5.0 added `Add point to room` / `Delete point from room` to *the contextual menu of the plan* (DOCUMENTED), and the online bundle carries action ids 115/116, but the online 7.5.2 menu does not expose them (OBSERVED). Whether the desktop menu shows them only when the right-click lands on a point/edge, or only in a submenu, was not verified — the desktop app cannot be run here.
2. **Why the online build omits them.** I can see the actions are created and the enable-guards work live, but I did not find the code path that filters them out of the online context menu. Tagged as an observed gap, not a mechanism.
3. **`splitWalls` result when more than one crossing wall exists on the same side.** The algorithm loops candidates and returns after the first successful split (the dry run returns `true`, the real run then re-derives wall sides once). Multi-crossing behaviour is INFERRED, not measured.
4. **`Join walls` when the two walls are parallel but offset.** The code takes the collinear branch only when both endpoints of wall2 lie on wall1's infinite line; otherwise it falls into the intersection branch with parallel lines. The actual failure/no-op outcome was not exercised.
5. **`Recompute room points` on a room with doors/windows.** Round 1 showed `computeRoomPointsAt` inserts half-doorstep stubs (constant 0.05) for 4-point doors. I did not test a recompute on a room whose walls carry doors, so the recomputed step shape is unmeasured.
6. **Round-wall + door/window interaction** (unchanged from round 1): holes in curved walls were not tested.
7. **Undo granularity across a multi-step edit** (e.g. dialog OK with "Recompute walls" ticked: one edit or several?) — the bundle posts a `ModifiedRoomsAndWallSides` edit for the group, but I did not count stack entries live.
8. **Performance/limits** (how many walls/rooms before room detection or `splitWalls` degrades) were not measured.

## Sources

- Sweet Home 3D — https://www.sweethome3d.com/de/ (product site; GPL application) — release history https://www.sweethome3d.com/history.jsp
- Users Guide (EN): https://www.sweethome3d.com/userGuide.jsp · Benutzerhandbuch (DE): https://www.sweethome3d.com/de/userGuide.jsp
- Sweet Home 3D JS Online 7.5.2 (live app): https://www.sweethome3d.com/SweetHome3DJSOnline.jsp
- Shipped online bundle (behaviour read, no code copied): https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2
- Round-1 report (read-only, reused): `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md` and its `sources/` (userGuide EN/DE text, history text, minified bundle, demo `.sh3x` XML)
- License note: Sweet Home 3D is GPL; 3D House Planner is proprietary; CasaPlazAI is proprietary. Only behaviour, algorithms, field sets and UX are described here, in my own words; no code was copied.
