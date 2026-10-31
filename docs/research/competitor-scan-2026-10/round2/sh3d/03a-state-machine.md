# Sweet Home 3D — PlanController modes & state transitions (CasaPlazAI competitor research)

Job folder: `rea2-sh3d-p1/09-03a-walls-rooms-drawing-state-ma`
Research date: 2026-10-31 · REA v6.8.0 · target: Sweet Home 3D (GPL Java desktop) + JS Online 7.5.2
Round 2 of a two-round effort. Round 1 report reused read-only:
`rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md`.
Round-1 findings are the background here; this report only extends them on
**PlanController modes and state transitions**.

**Claim tags**
- **OBSERVED** — I drove the live app / read shipped files myself; evidence file in this folder.
- **DOCUMENTED** — vendor guide / release history (URL).
- **INFERRED** — my reconstruction from observed evidence, not stated by the vendor.

Evidence files are listed in §2.9; every OBSERVED claim maps to one of them.

---

## 1. Summary (5 bullets)

1. **`PlanController` is an explicit State pattern, not a boolean soup.** One mutable
   `state` object implements 17 no-op operations (`enter/exit/setMode/pressMouse/
   releaseMouse/moveMouse/escape/toggleMagnetism/setAlignmentActivated/
   setDuplicationActivated/setEditionActivated/updateEditableProperty/zoom/
   deleteSelection/moveSelection/isModificationState/isBasePlanModificationState`), plus
   `getMode()` which each concrete state supplies.
   `setState(next)` exits the old state, enters the new one, then fires up to three
   property-change events (`MODE`, `MODIFICATION_STATE`, `BASE_PLAN_MODIFICATION_STATE`).
   All UI affordances (action enablement, cursors, toolbars) hang off those events —
   no caller ever asks "which mode are we in" to decide what a click means.
2. **Seven modes, and 32 states that report SELECTION mode** — the mode layer is tiny;
   almost all interaction complexity lives in SELECT sub-states.
   Modes are `SELECTION, PANNING, WALL_CREATION, ROOM_CREATION, POLYLINE_CREATION,
   DIMENSION_LINE_CREATION, LABEL_CREATION` (each is `new Mode("NAME")`, compared by
   object identity). Every creation mode has a two-state lifecycle: a **creation state**
   (armed, `isModificationState()=false`) and a **drawing state** (`true`) that the
   first press switches into and that commits the undoable edit on escape/validation.
3. **`isModificationState()` / `isBasePlanModificationState()` are the real contract.**
   They are dynamic predicates, not constants: `SelectionMoveState` reports
   `isBasePlanModificationState()` from a `basePlanModification` flag computed per drag
   (true only when the dragged selection is architectural), `DragAndDropState` reports
   base-plan from the dragged piece, and `RectangleSelectionState` is the one state
   that is a *modification* (`true`) but not a *base-plan* modification (`false`).
4. **Tool activation is a toggle-action group that calls `controller.setMode(...)`.**
   The seven plan tools (`SELECT`, `PAN`, `CREATE_WALLS`, `CREATE_ROOMS`,
   `CREATE_POLYLINES`, `CREATE_DIMENSION_LINES`, `CREATE_LABELS`) are
   `createToggleAction(..., "setMode", PlanController.Mode.X)` in one radio-button group
   (the `SELECTED_KEY` listener unchecks the other group members); `setMode(m)`
   early-exits when `m === state.getMode()`,
   otherwise `state.setMode(m)` performs the transition and the controller fires one
   extra `MODE` event (so a switch emits the event twice on the live app — once from
   `setState`, once from the controller wrapper). The dispatch tables are uniform:
   `AbstractModeChangeState` (and therefore `SelectionState`) lists all **seven** modes;
   every other state with a `setMode` lists the **six modes other than its own** 
   (`PanningState` omits `PANNING`; each drawing state omits its own creation mode), so
   the self-mode no-op is left to the controller's `m !== getMode()` guard.
5. **Action verbs split cleanly into state-verbs and controller-verbs.** Drawing,
   resizing, arc extent, room point dragging, area/name rotation, compass and camera
   edits are *states*. Split/Join/Reverse walls, Add/Delete/Recompute room points,
   locking the base plan, magnetism toggles and property dialogs are *controller
   methods over the current state*; Add/Delete/Recompute room points change model data
   while `SelectionState` stays entered and post an undoable edit themselves.

---

## 2. Findings

### 2.1 The `Mode` enumeration and the State pattern

**OBSERVED** (`sources/js/sweethome3d.min.js` @ 7.5.2; `out/states_extract_wrapped.txt`).
The nested enum is built lazily as identity objects: `Mode.SELECTION_$LI$()` returns
`new Mode("SELECTION")` cached on first use, and comparisons in the state code are
`bi === al.Mode.SELECTION_$LI$()` — reference equality against a singleton, not a
string/ordinal compare. The complete set:

`SELECTION`, `PANNING`, `WALL_CREATION`, `ROOM_CREATION`, `POLYLINE_CREATION`,
`DIMENSION_LINE_CREATION`, `LABEL_CREATION`.

**State contract** (all 17 members, from `ControllerState`; every other state inherits
the no-op base and overrides only what it needs):

| Operation | Meaning |
|---|---|
| `enter()` / `exit()` | acquire/release feedback, listeners, remembered geometry |
| `getMode()` | mode this state reports (may differ from the mode that created it) |
| `setMode(m)` | mode switch requested while this state is active; usually `escape()` then `setState(get…State())` |
| `pressMouse(x,y,clickCount,shiftDown,duplication)` / `releaseMouse` / `moveMouse` | pointer grammar |
| `escape()` | cancel the in-flight edit and return to a stable state |
| `deleteSelection()` / `moveSelection(dx,dy)` | generic selection verbs |
| `toggleMagnetism(b)` / `setAlignmentActivated(b)` / `setDuplicationActivated(b)` | modifier mirrors |
| `setEditionActivated(b)` | Enter key: begin/commit typed numeric editing |
| `updateEditableProperty(name,value)` | one typed field (`X`,`Y`,`LENGTH`,`ANGLE`,`THICKNESS`,`ARC_EXTENT`,`DIAGONAL`) |
| `zoom(f)` | pan/zoom handling |
| `isModificationState()` / `isBasePlanModificationState()` | dynamic flags driving action enablement and the "base plan locked" gate |

**`setState` sequencing** — **OBSERVED** (`out/plancontroller_wrapped.txt` lines 68–72):

```
setState(next):
  prev = state ? {mode, mod, base} : null
  state.exit()                     # old state tears down
  previousState = state
  state = next
  state.enter()                    # new state acquires
  if prev.mode !== next.getMode()          fire "MODE"
  if prev.mod  !== next.isModificationState()      fire "MODIFICATION_STATE"
  if prev.base !== next.isBasePlanModificationState() fire "BASE_PLAN_MODIFICATION_STATE"
```

**OBSERVED** live (`out/probe_arc_points.json`): one wall-draw entry produced the event
sequence `MODE: SELECTION→WALL_CREATION`, `MODIFICATION_STATE false→true`,
`BASE_PLAN_MODIFICATION_STATE false→true`, and `escape()` produced the exact inverses.

**`setMode` sequencing** — the controller wrapper **OBSERVED**
(`out/plancontroller_wrapped.txt` lines 79–80):

```
setMode(m): if (m !== state.getMode()) { state.setMode(m); fire MODE(oldMode, m) }
```

Because most `state.setMode` implementations themselves call `setState(...)`, which
already fires `MODE`, a mode switch emits `MODE` **twice** — **OBSERVED**
(`out/probe_states_live.json` `eventLog.onPanning` has two identical
`SELECTION→PANNING` entries per switch). A web re-implementation should fire once.

**`ControllerStateDecorator`** — **OBSERVED** (`out/states_extract_wrapped.txt`):
holds one `state` and forwards all 17 methods plus `getMode`; composition, not
inheritance. Only **one** subclass exists besides the decorator itself: the touch
gesture wrapper `SelectionMoveState$0`, built on the fly as
`new SelectionMoveState$0(this, getPanningState())` when a TOUCH pointer moves during
selection (`SelectionMoveState.moveMouse`). Its `enter()` replays the press into the
wrapped panning state and `escape()` returns to `SelectionState`.

### 2.2 State catalogue (48 `*State` classes: 1 base, 1 decorator, 4 abstracts, 42 concrete)

**OBSERVED**, generated from the bundle's `__class="…PlanController.<Name>"` markers by
`scripts/extract_states.py` into `out/state_table.json`; the full readable dump is
`out/states_extract_wrapped.txt`. The bundle declares **109** `PlanController` inner
classes: **48** `*State`, **53** `*UndoableEdit`, plus `Mode`, `JoinedWall`,
`ResizedPieceOfFurniture`, `ControllerStateDecorator` and the four magnetism helpers
(`PointWithAngleMagnetism`, `WallPointWithAngleMagnetism`,
`RoomPointWithAngleMagnetism`, `PointMagnetizedToClosestWallOrRoomPoint`).
Parent classes below are taken from `out/true_parents.json` because the per-class slice
in `state_table.json` occasionally attributes a neighbouring IIFE.

| Class | Mode | `isMod` | `isBase` | Extends |
|---|---|---|---|---|
| `ControllerState` | — | false | false | base: 17 no-ops; `getMode()` supplied by each concrete state |
| `ControllerStateDecorator` | delegate | delegate | delegate | wraps `ControllerState` |
| `AbstractModeChangeState` | — | false | false | implements `setMode` for creation states |
| `SelectionState` | SELECTION | false | false | AbstractModeChangeState |
| `SelectionMoveState` | SELECTION | true | `basePlanModification` | ControllerState |
| `SelectionMoveState$0` (touch wrapper) | SELECTION | delegate | delegate | ControllerStateDecorator→(PanningState) |
| `RectangleSelectionState` | SELECTION | true | false | ControllerState |
| `PanningState` | PANNING | false | false | ControllerState |
| `DragAndDropState` | SELECTION | false | `draggedPiece…` | ControllerState |
| `WallCreationState` | WALL_CREATION | false | false | AbstractModeChangeState |
| `WallDrawingState` | WALL_CREATION | true | true | AbstractWallState |
| `WallResizeState` | SELECTION | true | true | AbstractWallState |
| `WallArcExtentState` | SELECTION | true | true | AbstractWallState |
| `RoomCreationState` | ROOM_CREATION | false | false | AbstractModeChangeState |
| `RoomDrawingState` | ROOM_CREATION | true | true | AbstractRoomState |
| `RoomResizeState` | SELECTION | true | true | AbstractRoomState |
| `RoomAreaOffsetState` / `RoomAreaRotationState` | SELECTION | true | false | ControllerState |
| `RoomNameOffsetState` / `RoomNameRotationState` | SELECTION | true | false | ControllerState |
| `PolylineCreationState` / `PolylineDrawingState` / `PolylineResizeState` | POLYLINE_CREATION / POLYLINE_CREATION / SELECTION | false / true / true | false / true / true | AbstractModeChangeState / AbstractPolylineState / AbstractPolylineState |
| `DimensionLineCreationState` + 6 sub-states | DIMENSION_LINE_CREATION / DIMENSION_LINE_CREATION / SELECTION ×5 | false / true / true ×5 | false / true / true ×5 | AbstractModeChangeState for the creation state; ControllerState for the six sub-states |
| `LabelCreationState` / `LabelRotationState` / `LabelElevationState` | LABEL_CREATION / SELECTION / SELECTION | false / true / true | false / true / true | AbstractModeChangeState / ControllerState / ControllerState |
| `CompassRotationState` / `CompassResizeState` | SELECTION | true | true | ControllerState |
| `PieceOfFurniture{Resize,Rotation,Elevation,Height,PitchRotation,RollRotation,NameOffset,NameRotation}State` | SELECTION | true | per-piece predicate | ControllerState |
| `LightPowerModificationState` | SELECTION | true | false | ControllerState |
| `Camera{Yaw,Pitch}RotationState` / `CameraElevationState` | SELECTION | true | false | ControllerState |

**Interpretation (INFERRED):** `isModificationState()` means "the current interaction will
mutate the home and must be undoable/blocked when the plan is locked"; the room
area/name/label/furniture-name sub-states and the camera states are `mod=true` because
they mutate *annotation/derived* data, while `isBasePlanModificationState()` is a
narrower flag for architectural geometry (walls, rooms, compass).

### 2.3 State transition graph

**OBSERVED** (`out/state_table.json` `setStateCalls` + live `out/probe_states_live.json`
`log`). Since every state is constructed once in the `PlanController` constructor and
cached in a field (`selectionState`, `wallDrawingState`, …), transitions are plain field
lookups: `setState(getWallDrawingState())`.

Mode layer (all seven creation/pan modes can cross-switch via `AbstractModeChangeState.setMode`):

```
                 setMode(SELECTION)               setMode(WALL_CREATION)
  SelectionState ────────────────►  (already)  ◄──────────── PanningState
        ▲                                                         ▲
        │ setMode(PANNING)              setMode(PANNING)           │
        └──────────────────────────────────────────────────────────┘

  WallCreationState ──pressMouse(any)──► WallDrawingState
        ▲                                     │
        └── validateDrawnWalls()/escape() ────┘
  RoomCreationState ──pressMouse(any)──► RoomDrawingState
        ▲                                     │
        └──── validateDrawnRoom()/escape() ───┘
  PolylineCreationState ──pressMouse──► PolylineDrawingState ──► PolylineCreationState
  DimensionLineCreationState ──pressMouse(1, no dup)──► DimensionLineDrawingState ──► back
  LabelCreationState ──pressMouse──► createLabel() ──(touch only)──► SelectionState
```

Live-verified full cycle (**OBSERVED**, `out/probe_states_live.json` `log`):
`Selection → WallCreation → WallDrawing → WallCreation → WallDrawing → WallCreation →
RoomCreation → RoomDrawing → RoomCreation → Selection → WallCreation → WallDrawing →
WallCreation → Selection → Panning → Selection`. Note the drawing state returns to its
**creation** state (not to SELECTION) when the chain is closed, so the tool stays armed.

SELECTION fan-out — `SelectionState.pressMouse` is a 31-target ordered predicate chain
(**OBSERVED**, `out/states_extract_wrapped.txt` lines 2216–2246; raw byte range
`1501493–1506208` in `sources/js/sweethome3d.min.js`; **31** distinct
`setState(get…State())` targets reached through **30** `else-if` levels, evaluated over
33 distinct hit-test predicates):

| # | Hit test | Target state |
|---|---|---|
| 1 | `getRotatedLabelAt` | `LabelRotationState` |
| 2–3 | `getYawRotatedCameraAt` / `getPitchRotatedCameraAt` | camera rotation states |
| 4–5 | `getElevated{Label,Camera}At` | label/camera elevation |
| 6–9 | `getRoom{Name,RotatedName,Area,RotatedArea}At` | room name/area offset & rotation |
| 10–12 | `getResizedDimensionLine{Start,End}At`, `getHeightResizedDimensionLineAt` | dimension-line states |
| 13 | `getWidthAndDepthResizedPieceOfFurnitureAt` | furniture resize |
| 14 | `getResizedWallStartAt`/`EndAt` | **WallResizeState** |
| 15 | `getResizedRoomAt` | **RoomResizeState** |
| 16 | `getOffsetDimensionLineAt` | dimension-line offset |
| 17 | `getResizedPolylineAt` | polyline resize |
| 18–19 | `getPitch/RollRotatedPieceOfFurnitureAt` | furniture rotation states |
| 20 | `getModifiedLightPowerAt` | light power |
| 21 | `getHeightResizedPieceOfFurnitureAt` | furniture height |
| 22 | `getArcExtentWallAt` | **WallArcExtentState** |
| 23 | `getRotatedPieceOfFurnitureAt`, `getPitchRotatedDimensionLineAt` | rotation |
| 24–25 | `getElevatedPieceOfFurnitureAt`, `getElevatedDimensionLineAt` | elevation |
| 26–27 | `getPieceOfFurniture{Name,RotatedName}At` | name offset/rotation |
| 28–29 | `getRotatedCompassAt`, `getResizedCompassAt` | compass rotation/resize |
| 30 | **fallback:** not shift-down **and** (`TOUCH` or `getSelectableItemAt != null`) | `SelectionMoveState` |
| 31 | **else** | `RectangleSelectionState` |

**Double-click path:** `pressMouse` with `clickCount === 2` and a selectable item under
the cursor calls `modifySelectedItem()` — which opens the type-specific dialog by
`instanceof` dispatch (`HomePieceOfFurniture→…Furniture`, `Wall→modifySelectedWalls`,
`Room→modifySelectedRooms`, `Polyline`, `DimensionLine`, `Label`, `Compass`,
`ObserverCamera`) and **stays in `SelectionState`**. **OBSERVED**
(`out/probe_substates.json` `r_doubleClickWall`: 22 dialogs in the DOM, state unchanged).

**INFERRED:** every "handle" in the plan is not a separate DOM element; it is a
predicate over the currently selected item's geometry times the current scale
(`getIndicatorMargin() = INDICATOR_PIXEL_MARGIN(=5) [×3 for touch] / scale`). That is why
the state graph needs no explicit "handle id" — the hit test *is* the transition.

### 2.4 Selection sub-states (resize / move / arc / rubber-band)

**OBSERVED** live (`out/probe_substates.json`, `out/probe_arc_points.json`):

| Scenario | Resulting state | `mod` | `base` |
|---|---|---|---|
| hover wall end | `SelectionState` | false | false |
| press+hold wall end | **`WallResizeState`** | true | true |
| release | `SelectionState` | false | false |
| press empty canvas | **`RectangleSelectionState`** | true | **false** |
| release | `SelectionState` | false | false |
| press wall **mid-point** (arc indicator) | **`WallArcExtentState`** | true | true |
| shift-press on an already-selected item | `RectangleSelectionState` | true | false |
| double-click a wall | `SelectionState` (+ dialog) | false | false |

**`WallResizeState`** (**OBSERVED** source, lines 2489–2549) stores `selectedWall`,
`startPoint` (which end was grabbed — resolved by `getResizedWallStartAt`), the grab
offset `deltaXToResizePoint/…Y`, `oldX/oldY`, and modifier flags. `moveMouse` snaps via
`PointWithAngleMagnetism` (Shift) or `WallPointWithAngleMagnetism` (magnetism ON), calls
`moveWallPoint(wall,x,y,startPoint)`, draws triangulation dimension lines and an angle
feedback arc; `releaseMouse` posts `postWallResize(...)`, `escape()` restores `oldX/oldY`
and both return to `SelectionState`.

**`WallArcExtentState`** (**OBSERVED** source, lines 2551–2588) stores `selectedWall`,
`oldArcExtent`, the offset from the **mid-point indicator**, alignment/magnetism flags.
`enter()` even recomputes the indicator position from `getPoints$()` (index
`len/4 ± 1`, i.e. the mid-point of the first polyline segment) rather than trusting the
click. `moveMouse` recomputes the arc extent from the current point using
`AbstractWallState.getArcExtent(...)`, optionally rounds it to whole degrees when
alignment/magnetism is on, and `setArcExtent(...)` on the wall. `releaseMouse` posts
`postWallArcExtent(wall, oldArcExtent)`; `escape()` reverts to `oldArcExtent`.

Live value proof: built a straight wall `(0,0)→(400,0)`, set `arcExtent=π` (180°), then
grabbed the mid-indicator at model `(190,−210)` and dragged. `moveMouse` produced
**164°** and committed; a second drag then `escape()` reverted to the value before that
drag. **OBSERVED** (`out/probe_arc_points.json`: `arcValueDuringDrag.arc=2.86234`,
`deg=164`; `arcEscBefore===arcEscAfter`). Cursor over the indicator is the vertical
resize asset (`height16x16-macosx.png`), so the plan-view cursor contract maps arc extent
to `CURSOR_HEIGHT`.

**`RectangleSelectionState`** (**OBSERVED** source @1506270–1507130) extends
`ControllerState` with `getMode()=SELECTION`, `isModificationState()=true` and **no**
`isBasePlanModificationState()` override — hence the unique `mod=true / base=false`
pair, which keeps rubber-band select out of the base-plan modification gate. Inside:

- `enter()` finds the item under the press; if there is none **and Shift is not down**
  it calls `deselectAll()`; it snapshots the current selection into
  `selectedItemsMousePressed`; it sets `ignoreRectangleSelection = true` when the
  snapshot contains a piece of furniture that is no longer in the home (deleted mid-drag);
  `mouseMoved=false`.
- `moveMouse` sets `mouseMoved=true`, then for every move calls
  `updateSelectedItems(pressX,pressY,x,y,snapshot)` → `getSelectableItemsIntersectingRectangle(...)`
  and **additively (Shift) or exclusively** merges the hits into the selection, skipping
  `Camera` items; if feedback is on it calls `view.setRectangleFeedback(...)` and draws a
  point at the cursor.
- `releaseMouse`: if the pointer never moved it treats it as a *toggle click* — the item
  under the cursor is removed from / added to `selectedItemsMousePressed` (with
  group↔member de-duplication for `HomeFurnitureGroup`); then it selects the result.
- `exit()` deletes feedback and clears the snapshot.

`SelectionMoveState` (12 methods) is the drag-the-selection state; on a TOUCH move it
swaps itself for a transient `SelectionMoveState$0` decorator wrapping the panning state
so a finger drag pans instead of moving items.

### 2.5 Wall creation → drawing → arc extent

**Tool = one toggle action** (**OBSERVED**): `createToggleAction(CREATE_WALLS,
mode===WALL_CREATION, group, controller, "setMode", Mode.WALL_CREATION)`.

`WallCreationState` (7 methods, **OBSERVED** lines 2251–2271): arms cursor `DRAW`, applies
magnetism to the hover (`WallPointWithAngleMagnetism`), and `pressMouse` — *any* click
count — goes straight to `WallDrawingState`. `setEditionActivated(true)` also enters it.

`WallDrawingState` (19 methods, **OBSERVED** lines 2344–2488) state fields:
`xStart/yStart`, `xLastEnd/yLastEnd`, `wallStartAtStart/wallEndAtStart`,
`wallStartAtEnd/wallEndAtEnd`, `newWall`, `lastWall`, `newWalls`, `roundWall`,
`wallArcExtent`, `lastWallCreationTime`, `oldSelection`, `oldBasePlanLocked`,
`oldAllLevelsSelection`, modifiers.

- **`enter()`**: remembers selection + base-plan-locked + all-levels flags, snaps the
  start to an existing wall end (`getWallEndAt`) or start (`getWallStartAt`), else
  magnetises; clears everything; `deselectAll()`.
- **`moveMouse`**: chooses Shift-`PointWithAngleMagnetism` → else
  `WallPointWithAngleMagnetism` → else raw. Creates the working wall on first move.
  Once `wallArcExtent != null`, subsequent moves *replace* the end via
  `getArcExtent(...)` instead of `setXEnd/YEnd`; whole-degree rounding when
  alignment/magnetism is on. Tracks `wallStartAtEnd`/`wallEndAtEnd` to preselect the
  wall the next segment will join.
- **`pressMouse(clickCount==1)`**: if the working wall has zero length it does nothing;
  else if `roundWall && wallArcExtent==null` it sets `wallArcExtent=π` (the 180°
  "semicircle" beat); otherwise it deselects feedback, selects `newWall`, and
  `endWallCreation()`.
- **`pressMouse(clickCount==2)`**: ends the chain; if the first click landed inside a
  single `Room` and nothing was drawn yet, calls `createWallsAroundRoom(room)` — the
  reverse workflow that wraps a room outline in walls; otherwise joins the last wall to
  `wallStartAtEnd/wallEndAtEnd`.
- **`endWallCreation()`**: `lastWall=wallEndAtStart||wallStartAtStart`, re-anchors
  `xStart/yStart` at the current end, clears `newWall`/`wallArcExtent`.
- **`createNextWall()`**: computes the new direction from the joining wall's angle,
  creates the wall with `wallStartAtStart`/`bk` links and copies the previous wall's
  **thickness**.
- **`escape()`**: deletes the in-progress `newWall` from the home, removes it from
  `newWalls`, then `validateDrawnWalls()` (which posts `WallsCreationUndoableEdit`,
  reselects the created walls, and returns to `WallCreationState`).
- **`setEditionActivated`** doubles as the "commit the chain" path (Enter key) and carries
  the double-click **double-fire guard**: when a second segment is committed within
  `300 ms` of the previous one, the just-created wall is removed again and the chain
  validated, so a fast double-click never leaks a spurious wall (**OBSERVED** lines
  2431–2446).
- `createWallsAroundRoom` is the most intricate routine: derives the room polygon, insets
  each edge by half the new-wall thickness via `computeIntersection` of consecutive
  offset lines, tests each candidate against the existing walls `Area`, and emits only
  the wall segments that fall outside — plus a fallback that snaps to an existing wall of
  the same level when the whole inset is covered. **OBSERVED** source lines 2399–2423.

**Arc extent math** (**OBSERVED** `AbstractWallState`): `getArcExtent` builds the
circumscribed circle from three points (start, end, cursor) via two perpendicular
bisectors, computes the signed angle with `Line2D.relativeCCW`, and clamps with
`Math.min(angle, 3*Math.PI/2)` — max **270°**. Typed entry clamps to ±270° too.

### 2.6 Room creation → drawing → point edit

`RoomCreationState` (7 methods): cursor `DRAW`, magnetism preview; `pressMouse` → drawing.
`RoomDrawingState` (18 methods, **OBSERVED** lines 2590–2698):

- **`enter()`**: previous selection/base-plan flags, magnetised start (wall/room point
  then `RoomPointWithAngleMagnetism`), `deselectAll()`.
- **Double-click inside a closed surface** (`pressMouse clickCount==2` with
  `newRoom==null`): `computeRoomPointsAt(x,y)` — returns the wall-loop polygon *inset to
  inner wall faces* and stitched across door openings (half doorstep) — then
  `createRoom(points)` and selects it, then `validateDrawnRoom()`.
- **Polygon work**: `createAndSelectRoom` builds a 2-point room for the live preview;
  `moveMouse` sets/append the last vertex, magnetised to nearby wall/room points, and
  draws tooltip (length, diagonal, angle) plus triangulation dimension lines.
- **Closing**: `endRoomSide()` and `pressMouse` → `validateDrawnRoom()`; a room with <3
  points is deleted; otherwise `postCreateRooms(RoomsCreationUndoableEdit)`. Touch →
  `SelectionState`, else back to `RoomCreationState`.
- **`escape()`**: drops the last point (if not mid-side) and validates.
- **`setEditionActivated`/`updateEditableProperty`**: typed `X/Y`, `LENGTH`, `DIAGONAL`
  (law-of-cosines from the two previous sides), `ANGLE` — desktop-only (the web view's
  `setToolTipEditedProperties` is a stub, Round 1 §2.8).

**Room vertices are editable in SELECTION**: `RoomResizeState` (10 methods) grabs the
vertex under the press via `getPointIndexAt(x,y,getIndicatorMargin())`, stores the index,
`oldX/oldY` and the grab offset, then `moveMouse` snaps with
`PointMagnetizedToClosestWallOrRoomPoint` → else `RoomPointWithAngleMagnetism` →
`moveRoomPoint(room,x,y,index)`, showing triangulation dimension lines.
`releaseMouse` posts `postRoomResize` (`RoomResizingUndoableEdit`), `escape()` reverts.

**Add / Delete / Recompute room points** are **controller methods, not states**
(**OBSERVED** source + live). Each requires the single selection to be a `Room` and
`isItemResizable(room)`; the controller state stays `SelectionState` throughout:

- `addPointToSelectedRoom(x,y)` — finds the polygon segment with minimum
  `Line2D.ptSegDistSq` to the click, inserts at that index+1, then posts
  `RoomPointAdditionUndoableEdit`. **OBSERVED live**: room `(150,100)-(699.61,247.27)-
  (669.62,400)`; midpoint of segment 0 inserted `[424.81,173.63]` at index 1, then
  `deletePointFromSelectedRoom` at the same point removed it and restored 3 points
  (`out/probe_states_live.json` `pointVerbs`; `out/probe_arc_points.json` `pointVerbs`
  reproduced it on a 4-point room).
- `deletePointFromSelectedRoom(x,y)` — `getPointIndexAt` with the indicator margin, then
  `removePoint` + `RoomPointDeletionUndoableEdit`.
- `recomputeSelectedRoomPoints(x,y)` — `computeRoomPointsAt(x,y)`; if non-null, replaces
  the polygon via `setPoints` and posts `RoomPointsModificationUndoableEdit`.
- `isRoomPointsComputableAt(room,x,y)` — `isItemResizable && room.containsPoint(x,y,0)
  && computeRoomPointsAt(x,y) != null && points actually differ`. **OBSERVED**: returns
  `false` for a point inside an already-consistent room.

**Enablement** (**OBSERVED** `sources/js/sweethome3d.min.js` @1000858): `P =
mode===SELECTION`; `y = exactly 1 selected item, which is a Room`; `K = y &&
room.getPointCount() >= 4`. Then `ADD_ROOM_POINT = y && P` (one selected room) and
`DELETE_ROOM_POINTS = RECOMPUTE_ROOM_POINTS = K && P` (a room with ≥4 vertices, so
deleting one still leaves a valid polygon), each additionally gated on SELECTION mode.

**Open gap (was Round-1 Unknown #2, now narrowed).** The three actions are registered
with **no `controllerMethod`**: `createAction(ADD_ROOM_POINT, group)` rather than
`createAction(ADD_ROOM_POINT, group, controller, "addPointToSelectedRoom")`
(**OBSERVED** line 2270680; the identical pattern for DELETE). `ResourceAction.actionPerformed`
is `if (controller != null && controllerMethod != null) controller[controllerMethod](...)`
(**OBSERVED**), so with a null `controllerMethod` it falls through to the abstract action
no-op. In the 7.5.2 bundle these three actions are **never added to the plan popup menu
either** — the popup contains `MODIFY_WALL/JOIN_WALLS/REVERSE_WALL_DIRECTION/SPLIT_WALL/
MODIFY_ROOM/...` but no `*_ROOM_POINT` entry (**OBSERVED**, context-menu constructor @
2292800). History says these items were added in **v7.2** for the *desktop* menu
(DOCUMENTED, `sources/history.txt`), so in the JS build they are enabled-but-unreachable
legacy wiring; the model verbs are live and were driven directly in my probe.

### 2.7 `PanningState`, `DragAndDropState`, cross-mode switching

- **`PanningState`** (**OBSERVED** lines 937–966): cursor `PANNING`;
  `pressMouse` stores the *screen* coordinates, `moveMouse` calls `view.moveView(dx,dy)`,
  `releaseMouse/escape` clear them, `zoom(f)` multiplies scale. Its `setMode` dispatch
  lists the other six modes including `WALL_CREATION` (it omits only `PANNING`, i.e. its
  own) — the same six-minus-self shape as `AbstractModeChangeState`, which lists all
  seven.
- **`DragAndDropState`** (**OBSERVED** lines 968–1002): `startDraggedItems(items,x,y)`
  records furniture sizes magnetised to 0.1 cm, `escape()`s the current modification,
  `setState(DragAndDropState)`, then `moveMouse`; `stopDraggedItems()` asserts the state
  is the drag state and restores `previousState`. `isModificationState()=false`,
  `isBasePlanModificationState()` per dragged piece.
- **Cross-mode switching** from a drawing state (e.g. `WallDrawingState.setMode`,
  **OBSERVED** lines 2361–2366) calls `this.escape()` first — so switching tool mid-draw
  *discards the in-progress geometry* exactly as Escape would — then dispatches to the
  matching creation/selection state.
- **Cursor contract** (`PlanView.CursorType`): SELECTION(0), PANNING(1), DRAW(2),
  ROTATION(3), ELEVATION(4), HEIGHT(5), POWER(6), RESIZE(7), DUPLICATION(8), MOVE(9).
  `SelectionState.moveMouse` (a 15-outcome cursor chain, verified live for RESIZE / MOVE /
  ROTATION / HEIGHT / SELECTION) is the canonical mapper: rotation
  handles→ROTATION, elevation→ELEVATION, name/area/resize handles→RESIZE, light→POWER,
  arc/height→HEIGHT, move→MOVE, nothing→SELECTION. **OBSERVED** (live cursor over the arc
  indicator = `height16x16-macosx.png`, function `ns-resize`).

### 2.8 Modifiers, tooltips, undo transactions

- **Modifier plumbing** (**OBSERVED** `pressMouse` overloads, lines 105–108): a full
  press records `xLastMousePress/yLastMousePress`, mirrors them into
  `xLastMouseMove/yLastMouseMove`, then stores `shiftDownLastMousePress`,
  `alignmentActivatedLastMousePress`, `duplicationActivatedLastMousePress`,
  `magnetismToggledLastMousePress`, `pointerTypeLastMousePress`, and only then calls
  `state.pressMouse(x,y,clickCount,shiftDown,duplication)`. States read these recorded
  values in `enter()` — i.e. **modifiers are latched at press time, not sampled
  mid-drag** (consistent with Round 1's arc finding).
- **Undo is post-hoc, not live**: states mutate the model during `moveMouse` and only on
  `releaseMouse`/validation call a `post…` method that compares old vs new and posts the
  matching `…UndoableEdit` (`postWallResize`, `postWallArcExtent`, `postRoomResize`,
  `postCreateWalls`, `postCreateRooms`, `postRoomPoint…`, `postRoomAreaOffset`,
  `postRoomNameOffset`, …). `WallArcExtentState`/`WallResizeState` capture the old value
  in `enter()` purely for this compare.
- **Undo labels** (**OBSERVED** bundle strings): `undoAddRoomPointName`,
  `undoDeleteRoomPointName`, `undoRecomputeRoomPointsName`,
  `undoRecomputeRoomPointsName`, plus the wall/room edit keys from Round 1.
- **Tooltip keys** (`AbstractWallState.enter`, `AbstractRoomState.enter`):
  `wallLengthToolTipFeedback`, `wallAngleToolTipFeedback`,
  `wallArcExtentToolTipFeedback`, `wallThicknessToolTipFeedback`,
  `roomSideLengthToolTipFeedback`, `roomDiagonalLengthToolTipFeedback`,
  `roomSideAngleToolTipFeedback`. Tooltips are HTML fragments composed with
  `CoreTools.format(...)` and rendered by the view's cursor-following tooltip.
- **`feedbackDisplayed`** gates every preview (tooltip, alignment, angle arcs,
  dimension lines, point dots) — useful reminder that all feedback is optional and
  view-owned, not state-owned.

### 2.9 Evidence inventory (all inside this job folder)

| File | What it proves |
|---|---|
| `sources/js/sweethome3d.min.js` | shipped 7.5.2 bundle: modes, 48 state classes, transitions, arc math, action wiring, enablement |
| `sources/js/geom.min.js` | geometry primitives (`Area`, `Line2D`, magnetism helpers) referenced by the state code |
| `sources/js/SweetHome3D.js` | online page script — confirms no extra controller wiring in the page layer |
| `out/state_table.json` | machine-generated table: class, mode, `isModificationState`, `isBasePlanModificationState`, extends, `setMode` targets, `setState` targets |
| `out/true_parents.json` | corrected parent map computed from each class's closing `}(al.Parent))` — the raw per-class slice in `state_table.json` occasionally attributes a neighbouring IIFE, so parent/method lists for `ControllerState` and `RectangleSelectionState` are taken from this map and from the raw bundle instead |
| `out/states_extract.txt` / `_wrapped.txt` (2 883 lines) | readable bodies of all 109 `PlanController` inner classes |
| `out/plancontroller.txt` / `_wrapped.txt` (1 501 lines) | outer `PlanController` — `setState`, `setMode`, facade methods, post-edit methods |
| `out/inheritance.txt` | class hierarchy chain for the state family |
| `out/probe_states_live.json` | live mode/state transitions, wall chain, arc ritual, point verbs, MODE/MODIFICATION_STATE events |
| `out/probe_substates.json` | live SELECTION sub-state matrix (resize, rectangle, arc, double-click dialog) |
| `out/probe_arc_points.json` | live arc-indicator hit + drag/commit/escape values; room point add/delete/recompute |
| `scripts/extract_states.py`, `extract_plancontroller.py`, `state_table.py`, `pretty.py`, `wrap_lines.py` | extraction tooling (own code) |
| `scripts/probe_states_live.mjs`, `probe_substates.mjs`, `probe_arc_and_points.mjs` | reproducible Playwright probes |
| `scenarios_round1_ref/01_load.json`, `02_shot.json` | Round-1 browser scenarios reused as reference only |

---

## 3. Ideas for CasaPlazAI (concrete, ranked by value/effort)

CasaPlazAI today is a single-room-polygon model (`FloorplanData`: `rooms[].polygon`,
`openings[].segmentIndex/tCenter`, `wallsOverride`) with no wall entity. The ideas below
are ranked by (value ÷ effort) and each names the schema surface it would touch.

| # | Idea | Tied to finding | CasaPlazAI schema impact | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Adopt the two-flag interaction contract** (`isModificationState`, `isBasePlanModificationState`) as derived signals on a tiny state machine: `MODE`, `MODIFICATION_STATE`, `BASE_PLAN_MODIFICATION_STATE` events drive toolbar enable/disable and the "locked" gate. Fire each once per change (SH3D double-fires `MODE`). | 2.1, 2.3, 2.8 | none (editor-local) | High — removes per-call-site mode checks and makes undo/lock uniform | Low |
| 2 | **Keep drawing state separate from armed-tool state, and stay armed after a commit.** `WallCreationState→WallDrawingState→WallCreationState` means the user can draw room after room without re-clicking the tool; only Esc/right-click/SELECT exits. | 2.3, 2.5, 2.6 | none | High — matches how people actually trace plans | Low |
| 3 | **31-target "hit test is the transition" selection.** Implement selection as an ordered predicate list returning a *handle descriptor*, and map descriptor→state; no DOM handles, just geometry × scale. In CasaPlazAI, draw the same predicates into canvas hit regions in one place. | 2.3, 2.4 | none | High — one table replaces scattered pointer handlers | Med |
| 4 | **Room vertex editing as a first-class SELECT sub-state, with add/delete/recompute as *actions* not modes.** Grab a vertex (`getPointIndexAt` within ~5 px), drag with wall/room-point magnetism, Escape reverts; add = insert after nearest segment; delete = nearest vertex within margin; recompute = re-derive polygon from walls. Crucially, these mutate `rooms[].polygon` while staying in SELECT, so the CCW + `>=3 vertices` validators can run on commit. | 2.4, 2.6 | `rooms[].polygon` (+ validator `too-few-vertices`/`non-ccw-polygon` already exists) | High — rooms currently cannot adapt to wall edits | Med |
| 5 | **Post-hoc undo: mutate freely during drag, snapshot old value in `enter()`, post one edit on release/escape.** One `postEdit` per completed gesture, not per mousemove. | 2.8 | none | High — keeps undo history human-sized | Low |
| 6 | **Arc walls via a two-beat ritual + ±270° clamp.** Modifier-before-first-press starts a round wall; second click sets 180°; move refines extent; next click commits. Reuse for curved partitions / bow windows. In schema terms this is a **new wall entity or a `curved` room segment** — the room-polygon-only model must gain either `segments[].arc` or a full wall list. | 2.5, 2.2 | new: wall entity with `arcExtent` (radians, ±3π/2) | Med-High — differentiator; no competitor research needed to justify | Med |
| 7 | **Latch modifiers at pointer-down, not during drag.** Store shift/⌘/Alt/pointerType in the press record and let the state read it in `enter()`. This is what makes "hold ⌘ then press" deterministic and is testable. | 2.8, 2.5 | none | Med-High — removes a class of flaky drag bugs | Low |
| 8 | **Split the tool set into exactly 7 modes and never add an 8th** — new verbs (split/join/reverse wall, add/delete point) become *actions over the SELECT state*, keeping the state machine small. SH3D's 48 state classes are mostly SELECT sub-states, not modes; copy that ratio. | 2.2, 2.7 | none | Med | Low |
| 9 | **Double-click → modify dialog by `instanceof` dispatch, without leaving the selection state.** One `modifySelectedItem()` router; double-click on empty space does nothing. | 2.3 | none | Med | Low |
| 10 | **Rubber-band select needs its own flag pair.** `RectangleSelectionState` is the only `mod=true/base=false` state; model "select-only" changes as *modification* (undoable selection is not needed) but not architectural so the lock gate stays closed. | 2.4 | none | Med | Low |
| 11 | **Single cursor enum (10 values) as the state→UX contract.** Each state declares its cursor; the view maps enum→CSS. Cheap native feel. | 2.7, 2.3 | none | Med | Low |
| 12 | **`pointerType==TOUCH` changes the *exit* behavior** (drawing states return to SELECT instead of the armed tool; indicator margin ×3). If CasaPlazAI targets tablets, bake the pointer-type branch into the state machine, not into each handler. | 2.3, 2.5, 2.6 | none | Med (long-term) | Low-Med |
| 13 | **Reverse-wrap: double-click a room in WALL mode to generate walls around its polygon** (`createWallsAroundRoom`), insetting by half wall thickness and subtracting existing wall Area. Strong demo/onboarding feature, but needs the wall entity first. | 2.5 | new wall entity | Med | Med-High |
| 14 | **Wire the room-point actions end-to-end.** SH3D 7.5.2 registers `ADD/DELETE/RECOMPUTE_ROOM_POINTS` with a null `controllerMethod` and never adds them to the popup, so they are dead in the web build. CasaPlazAI should either implement them fully or omit them — an enabled-but-dead action is worse than a missing one. | 2.6 | none | Med (correctness/quality) | Low |

---

## 4. Unknowns

1. **`Add/Delete/Recompute room points` UI entry point.** The verbs and the model
   mutations are proven (OBSERVED), and the bundle enables the actions but registers
   them with a null `controllerMethod` and never adds them to the plan popup (OBSERVED).
   Whether the current **desktop 7.5.2** Swing build binds them (history says the items
   were added in v7.2) could not be verified on this machine; I did not inspect the Java
   desktop sources.
2. **Whether `RECOMPUTE_ROOM_POINTS` ever produces new points in practice.** My probe
   called `recomputeSelectedRoomPoints` on a consistent room and `isRoomPointsComputableAt`
   returned `false` / points unchanged. A room deliberately left stale after wall edits
   (the intended use case) was not constructed.
3. **`getArcExtentWallAt` indicator for arc walls after a wall join.** I verified the
   mid-indicator on an isolated straight wall turned arc; I did not test the indicator on
   a wall already joined at both ends (index derivation `len/4 ± 1` assumes the standard
   4-point wall path — could shift once joins add points).
4. **The exact predicate *order* inside `SelectionState.moveMouse`** (15 cursor outcomes)
   is extracted but was not exercised handle-by-handle; only RESIZE/MOVE/ROTATION/
   HEIGHT/SELECTION paths were observed live.
5. **`feedbackDisplayed` defaults and who toggles it in the online build** — the
   constructor sets `true`; the preference path (`setFeedbackDisplayed`) exists but I did
   not locate the UI that flips it in the web page (Round 1 found the numeric-entry
   counterpart stubbed, so it may be another desktop-only preference).
6. **Desktop-vs-web divergence for `setEditionActivated`/`updateEditableProperty`.** The
   state code implements typed X/Y/LENGTH/ANGLE/DIAGONAL/ARC_EXTENT/THICKNESS entry
   (OBSERVED in the bundle), but Round 1 observed the web view's
   `setToolTipEditedProperties` as a stub. Which of these fields actually works in the
   web build was not driven end-to-end.
7. **48 state classes vs. the desktop build.** The catalogue is extracted from the *online*
   bundle; the GPL desktop sources may contain additional states or a different enablement
   binding. Not verified.
8. **Performance of the 31-target press chain** on a large home (each press can evaluate
   up to 33 hit-test predicates over the current selection) was not measured; no timing
   instrumentation captured.

---

## Sources

- Sweet Home 3D JS Online (live app driven for all OBSERVED live claims):
  https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — probes `out/probe_*.json`,
  `scripts/probe_*.mjs`
- Shipped bundle v7.5.2 (behaviour and identifier names only; no code copied):
  https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 — local copy
  `sources/js/sweethome3d.min.js`
- Geometry bundle v7.5.2: https://www.sweethome3d.com/libjs/geom.min.js?version=7.5.2 —
  `sources/js/geom.min.js`
- Online page script: https://www.sweethome3d.com/SweetHome3D.js —
  `sources/js/SweetHome3D.js`
- Release history (Add/Delete point items v7.2; Recompute room points v7.2):
  https://www.sweethome3d.com/history.jsp — text copy reused read-only from Round 1
  (`rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/sources/history.txt`)
- Sweet Home 3D Users Guide (EN) — room points moved in Select mode, room creation by
  double-click, half doorstep: https://www.sweethome3d.com/userGuide.jsp (Round-1 local
  copy `sources/userGuide_en.txt`)
- Sweet Home 3D Benutzerhandbuch (DE): https://www.sweethome3d.com/de/userGuide.jsp
- Round-1 report reused read-only:
  `~/dsh-workspaces/rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md`
- CasaPlazAI schema referenced read-only:
  `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`
- Licence note: Sweet Home 3D is GPL-2.0-or-later, (c) 2024 Space Mushrooms / Emmanuel
  Puybaret, eTeks. No source code was copied into this deliverable — only class names,
  identifier strings, field sets and observed behaviour are described in my own words.
