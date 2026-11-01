# Sweet Home 3D — Wall & Room Drawing (competitive research for CasaPlazAI)

Job folder: `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing`
Research date: 2026-10-31 · REA v6.8.0 · live app **Sweet Home 3D JS Online 7.5.2** (headless Chromium 153) · desktop guide v7.5.

**Claim tags used below**
- **OBSERVED** — I drove the live online app or read the shipped files myself; evidence file given.
- **DOCUMENTED** — vendor user guide / release history (URL given).
- **INFERRED** — my reconstruction from observed evidence; not stated by the vendor.

---

## 1. Summary (5 bullets)

1. Sweet Home 3D is a **mode-based** plan editor: one toolbar toggle per tool (`Create walls`, `Create rooms`, `Select`, `Pan`, …), and a single `PlanController` state machine (Selection / WallCreation / WallDrawing / RoomCreation / RoomDrawing / WallResize / WallArcExtent / …). Drawing is a click-then-drag-then-click chain, not a press-drag-release gesture. **(OBSERVED + DOCUMENTED)**
2. Wall creation **chains**: click start, then each click commits the current segment *and* starts the next one from that point; double-click or `Esc` ends the chain. Clicking back on the start point **joins the loop** (walls store explicit `wallAtStart`/`wallAtEnd` links). **(DOCUMENTED + OBSERVED)**
3. Two independent helpers exist: **15° angle magnetism** (a 24-step circle; default-on, preference-toggleable, temporarily bypassed with Alt on Windows / ⌘ on macOS / Shift+Alt on Linux) and **Shift alignment** (align with a previous wall/point, freedhand angle when nothing to align to). Length/position values themselves are separately magnetised to a scale-dependent granularity (1 cm…100 cm metric; ⅛″…6″ imperial). **(DOCUMENTED + OBSERVED + source-verified)**
4. Rooms have **two creation paths**: draw the outline (click corners, double-click last point or `Esc`) **or double-click inside any closed wall loop** and the app reconstructs the polygon from the wall paths, insetting to the wall faces and adding half of each door threshold. Room points are later editable one by one in Select mode (cursor changes to a move/resize cursor), and the room dialog offers *Recompute walls*. **(DOCUMENTED + OBSERVED)**
5. Walls carry much richer data than CasaPlazAI's: per-wall `thickness`, `height`, **`heightAtEnd` (sloping/attic walls)**, **`arcExtent` (round walls up to ±270°)**, per-side colors/textures, top pattern, baseboards, level, and join ids. Round and sloping walls are edited *after* creation through the double-click window, and a mid-wall curve indicator appears on a selected wall. **(DOCUMENTED + OBSERVED, XML/source-verified)**

---

## 2. Findings

### 2.1 Wall creation mode and gesture grammar

- **DOCUMENTED** (User Guide, "Drawing walls", https://www.sweethome3d.com/userGuide.jsp §Drawing walls; German copy fetched locally too): click the `Create walls` button, click the start point, then click **or double-click** the end point. "As long as you don't double-click or press the Escape key, each new click indicates the opposite point of the current wall and the start point of the next wall."
- **OBSERVED** (`out/probe_interaction3.json`): drawing 0,0 → 400,0 → 400,300 → 0,300 → back to 0,0 with the Create-walls tool produced exactly **4 walls**, each with `wallAtStart`/`wallAtEnd` pointing at its neighbour, i.e. a closed ring — no duplicate fifth wall and no gap. Clicking exactly on the first wall's end auto-joined instead of creating a new wall.
- **OBSERVED** (`out/probe_interaction.json`, `out/probe_interaction2.json`): while a segment is in progress, a tooltip tracks the cursor: `Length: 298 cm` / `Angle: 0°` / `Thickness: 7.5 cm`, then the wall dialog values. Confirmed also in the shipped strings (`wallLengthToolTipFeedback`, `wallAngleToolTipFeedback`, `wallThicknessToolTipFeedback` in `sources/js/sweethome3d.min.js`).
- **OBSERVED** (`out/probe_state.json`): mode switches are driven by toolbar toggles with ids `toolbar-button-CREATE_WALLS`, `toolbar-button-CREATE_ROOMS`, `toolbar-button-SELECT`, `toolbar-button-PAN`; selecting one deselects the other (`class="toolbar-button toggle selected"`).
- **SOURCE-VERIFIED** (`sources/js/sweethome3d.min.js`, 7.5.2): `PlanController.Mode` enumerates `SELECTION`, `PANNING`, `WALL_CREATION`, `ROOM_CREATION`, `POLYLINE_CREATION` (plus dimension/label modes). `WallCreationState.pressMouse` switches into `WallDrawingState`; `WallDrawingState.pressMouse` with double-click joins or validates, with single click ends the wall. `Esc` deletes the in-progress wall and validates the chain.

### 2.2 Magnetism, alignment and snapping (three separate mechanisms)

| Mechanism | Trigger | Effect | Evidence |
|---|---|---|---|
| 15° angle magnetism | default on | wall angle snapped to a multiple of 15° (24-step circle) | DOCUMENTED; OBSERVED; source constant `CIRCLE_STEPS_15_DEG = 24` |
| temporary magnetism bypass | Alt (Win) / ⌘ (macOS) / Shift+Alt (Linux) | free angle for the current draw | DOCUMENTED; OBSERVED |
| Shift alignment | hold Shift while drawing | aligns to a reference wall/point; free angle when no reference | DOCUMENTED (guide); SOURCE-VERIFIED (`ACTIVATE_ALIGNMENT`); OBSERVED partial (see 2.9) |
| length/coordinate magnetisation | always when magnetism on | rounds values to a scale-dependent step (1 cm/5 cm/10 cm/100 cm metric; ⅛″–6″ imperial) | SOURCE-VERIFIED |
| point-to-wall/room magnetism (rooms) | Create-rooms mode | new room points snap onto existing walls and room points | SOURCE-VERIFIED (`PointMagnetizedToClosestWallOrRoomPoint`) |

- **DOCUMENTED**: "To help you drawing parallel walls, the angle of the walls on the floor is a multiple of 15° by default. You may cancel this magnetism by disabling magnetism in the preferences dialog box or by holding the Alt key pressed during the drawing under Windows, the cmd key under macOS or the Shift + Alt keys under Linux." (User Guide, §Drawing walls; identical in `sources/userGuide_de.txt` line 424.)
- **OBSERVED** (`out/probe_interaction.json`): moving the cursor to ~7° while drawing yielded angle **0°** and length **298 cm** (snap to the 15° multiple). In `out/probe_interaction2.json`, a 37° target without modifiers produced **30.03° / 184.8 cm**, while the same geometry with ⌘ held produced **36.87° / 200 cm** — the untouched raw value.
- **SOURCE-VERIFIED** (`sources/js/sweethome3d.min.js`): the angle magnetiser rounds `atan2` to `2π/24` steps and then re-projects the point, and additionally magnetises the *distance* through the length unit. Metric rounding switches between 0.1/1/5/10/100 cm depending on the on-screen scale (`getMagnetizedMeterLength`), imperial between ⅛/¼/½/1/3/6 inch (`getMagnetizedInchLength`). So the snap grid is display-scale-aware, not a fixed 0.5 m grid.
- **SOURCE-VERIFIED** (`sources/js/sweethome3d.min.js`, input map): `shift pressed SHIFT → ACTIVATE_ALIGNMENT` / `released SHIFT → DEACTIVATE_ALIGNMENT`; on macOS `meta pressed META → TOGGLE_MAGNETISM_ON` / `released META → TOGGLE_MAGNETISM_OFF` (Windows uses Alt; Linux layers Shift+Alt). The duplication (round-wall) modifier is Alt on macOS and Ctrl elsewhere — i.e. **⌘ and Alt are deliberately swapped on macOS** relative to Windows.
- **OBSERVED negative** (`out/probe_interaction2.json`): the Shift-alignment run was contaminated by my test geometry (the reference wall made the result `-60°` while the tooltip said `-15°`), so I record Shift alignment as **partially verified only**; see Unknowns.

### 2.3 Wall data model (thickness, height, sloping, arc)

- **DOCUMENTED** (User Guide §Editing walls; release history https://www.sweethome3d.com/history.jsp): the wall dialog edits left/right side colour/texture, **thickness** and **height**. Round walls arrived in **v3.0 (2010-11-30)**; v3.1 made new round walls symmetric and handled two round walls joined together; **v6.0 (2018-10-11)** added a mid-wall indicator to change the curve, tooltip showing arc length next to the *Arc extent* field, and allowed sloping walls to have a minimum height of 0 at one end. Sloping (garret) wall heights date back to v1.2 (2007).
- **OBSERVED** (`out/probe_room_points.json`, wall dialog captured live): the Modify-walls dialog contains *Start point X/Y*, *End point X/Y*, *Distance between end points*, *Left side*, *Right side*, *Pattern and color of the top*, **Height → "Rectangular wall" / "Sloping wall" with Height at start / Height at end**, *Thickness (cm)*, **Arc extent (°)**, plus an explanatory diagram of left/right side.
- **OBSERVED** (`sources/examples/roundwall/Home.xml`, extracted from `1BedroomApartmentWithRoundWall.sh3x`): a wall element with `arcExtent='0.6981317'` (= 40°). Wall attributes in the shipped XML: `xStart yStart xEnd yEnd height heightAtEnd thickness arcExtent wallAtStart wallAtEnd leftSideColor rightSideColor topColor pattern level`.
- **OBSERVED** (`sources/examples/3BedroomHouseWithAttic/Home.xml`): real designs use `heightAtEnd` heavily (e.g. 250→200, 20→250) for attic/sloping ceilings.
- **SOURCE-VERIFIED**: the arc extent is stored in radians, edited in degrees, clamped to ±3π/2 (270°), and a round wall's length is derived from chord + arc circle centre. The `Wall` model fires change events per field (`X_START`, `Y_START`, `THICKNESS`, `HEIGHT`, `HEIGHT_AT_END`, `ARC_EXTENT`, …).
- **OBSERVED** (`out/probe_model.json`, Studio demo live): walls had thicknesses {7.5, 16, 26} cm and heights {110, 250} cm in one home — several wall types coexist.

### 2.4 Round (arc) wall creation — the two-click arc ritual

- **OBSERVED** (`out/probe_arc2.json`, live app): with the Create-walls tool, holding the macOS round-wall modifier **before the first press** (sampled at press time), then:
  1. press start → nothing created yet;
  2. move → a straight segment with the normal tooltip (`Length: 300 cm / Angle: 0°`);
  3. **second click** → the wall becomes a **semicircle** (`arcExtent = π`, tooltip `Arc extent: 180°`) instead of ending the chain;
  4. move → the arc extent follows the cursor (observed −214°, then −138°);
  5. next click → the arc wall commits.
- **SOURCE-VERIFIED**: `WallDrawingState` implements exactly this: while the round-wall flag is set and no arc exists, the second click sets arc extent to π; further moves update it; `updateEditableProperty("ARC_EXTENT", …)` accepts typed degrees (clamped to ±270°).
- **OBSERVED** (`out/probe_arc2.json`): the modifier state is read from the mouse event at press time (`wasDuplicationActivatedLastMousePress`) — holding it only during the drag did **not** produce an arc (`out/probe_interaction4.json`), which matters for how a web re-implementation should sample modifiers.
- Two round walls can be joined; the demo file "1-Bedroom apartment" exists specifically to showcase a round wall (demo label `1BedroomApartmentWithRoundWall`, OBSERVED in `sources/online_dom.html`).

### 2.5 Room creation A — draw the outline

- **DOCUMENTED** (User Guide §Drawing rooms): click `Create rooms`, then "click at each corner of the room, then double-click at its last point or press the Escape key after you added the last point".
- **OBSERVED** (`out/probe_room_points.json`): clicking 3 corners and double-clicking the 4th produced a 4-point room; area computed automatically (≈9.24 m² for a 4×2.3 m test), points placed exactly where clicked (±0.5 cm).
- **SOURCE-VERIFIED**: `RoomCreationState` sets a DRAW cursor and magnetises the first point to the closest wall/room point (fallback: room-point angle magnetism). `RoomDrawingState` appends points; double-click routes to the wall-derived path (below); `Esc` removes the last point and validates; rooms with fewer than 3 points are deleted rather than kept.

### 2.6 Room creation B — double-click inside walls (`computeRoomPointsAt`)

- **DOCUMENTED** (User Guide): "double-click anywhere inside an existing closed surface (i.e. surrounded by walls)"; the room "will include the half doorstep of each door placed on its walls… ensures rooms join each other correctly in the 3D view when the doors between rooms are opened". Recommended workflow: draw walls **and place doors first**, then double-click each surface.
- **OBSERVED** (`out/probe_interaction3.json`): a 400×300 closed wall loop with 7.5 cm walls; double-clicking the centre produced a 4-point room at 3.3 / 395.8 / 295.8 — i.e. the polygon follows the **inner wall faces**, not the wall centre lines.
- **SOURCE-VERIFIED** (`sources/js/sweethome3d.min.js`): `computeRoomPointsAt(x, y)` first collects free-space paths formed by walls (`getRoomPathsFromWalls`), finds the path containing the click, then scans the **doors/windows visible at ground level**: if a 4-point door has most of its points inside the path, a half-threshold stub is inserted (constant 0.05) so the room polygon closes across the door opening. This is the documented "half doorstep" behaviour.
- **OBSERVED** (`out/probe_room_points.json`): the resulting room dialog exposes *Name and area*, *Floor*, *Ceiling*, *Wall sides around room* with a **Recompute walls** action, and *Wall sides baseboard*.
- **OBSERVED** (`out/probe_interaction4.json`): with the **Create-walls** tool, double-clicking inside an existing room also works in reverse — it generated a new 4-wall loop around that room, offset outward by half the wall thickness (corners at −4.3 instead of −0.4). SOURCE-VERIFIED as `createWallsAroundRoom(room)` inside the wall-drawing state.

### 2.7 Point editing (walls and rooms)

- **DOCUMENTED** (User Guide §Editing walls): in Select mode, drag selected walls or use arrow keys; "When one wall is selected in the plan, you can also move its start and end point with the mouse or split it in two walls with Plan > Split wall".
- **DOCUMENTED** (User Guide §Drawing rooms): "When one room is selected, you may also move each one of its points with the mouse in Select mode, and change the location of its area and of its name with the indicators drawn under texts."
- **OBSERVED** (`out/probe_room_points.json`): hovering a room corner changed the canvas cursor to a `resize16x16 … ew-resize` cursor; hovering a room side changed it to `move16x16 … move`. Dragging a room corner moved that single vertex (400,0 → 449.5,-0.4) and the **area recomputed automatically** (92412 → 98187 cm²).
- **SOURCE-VERIFIED** (`sources/js/sweethome3d.min.js`): `PlanController` exposes `addPointToSelectedRoom`, `deletePointFromSelectedRoom`, `isRoomPointDeletableAt`, `isRoomPointsComputableAt`, `recomputeSelectedRoomPoints`, plus wall-level `splitSelectedWall`, `joinSelectedWalls`, `reverseSelectedWallsDirection`, `moveWallStartPoint`/`moveWallEndPoint`/`moveWallPoint` (static helpers) and `getResizedWallStartAt`/`getResizedWallEndAt`, and the arc-extent indicator state (`getWallArcExtentState`, `getArcExtentWallAt`).
- **OBSERVED negative** (`out/probe_room_points.json`): double-clicking a room **side** in the Select mode of the online version did **not** add a vertex (still 4 points); a right-click on a point did not delete it either. The API exists; the exact gesture/UI trigger was not confirmed — see Unknowns.

### 2.8 Keyboard numeric entry (Enter) and its absence in the Online version

- **DOCUMENTED** (User Guide §Drawing walls): "You may also enter the length and the angle of the wall being created after pressing the enter key **(feature not available in Online and Mobile versions)**."
- **SOURCE-VERIFIED**: the desktop key map binds `pressed ENTER` / `shift pressed ENTER` to an "activate edition" action, and the in-progress drawing states expose an editable-property set with values:
  * walls before the first point: `X`, `Y`; wall in progress: `LENGTH`, `ANGLE`, `THICKNESS`; arc in progress: `ARC_EXTENT`;
  * rooms: first point `X`,`Y`; segment `LENGTH`, `DIAGONAL`, `ANGLE`; later sides `LENGTH`, `ANGLE`;
  * dimension lines: `X`,`Y` → `OFFSET` → `LENGTH`,`ANGLE`.
  `updateEditableProperty` clamps typed values (thickness 0.01–1000 cm; arc ±270°; length ≤ unit max).
- **OBSERVED negative** (`out/probe_interaction2.json`): in the **JS Online** build, pressing Enter mid-draw produced **no visible input/editor**; the same shipped bundle's generic plan component implements `setToolTipEditedProperties(...)` as an empty stub (`{}`). This matches the documented "not available in Online".
- **INFERRED**: numeric entry is a desktop (Swing) affordance, deliberately omitted from the web build — an area where a web-first CasaPlazAI can differentiate.

### 2.9 Other observed mechanics worth reusing

- **Live tooltip as the primary feedback channel** — length, angle, thickness, arc extent and X/Y are all shown in a cursor-following HTML tooltip (OBSERVED; `sources/js/sweethome3d.min.js` tooltip DOM created with `z-index: 101`).
- **Point feedback dots** are drawn at chain start/end during drawing (`makePointVisible`) (SOURCE-VERIFIED).
- **Level awareness**: walls/rooms carry a `level`; the active level governs which objects are editable/selectable, and non-active-level walls are drawn light. `LevelPanel` fields: Name, Elevation, Floor thickness, Height; rooms/ceilings derive from level height. (DOCUMENTED §Adding levels; OBSERVED in DOM templates.)
- **Rooms are first-class objects** with name, name offset/angle, area text offset/angle, area visibility, floor color/texture, ceiling color/texture + flat-ceiling flag, and wall-side styling per room. (OBSERVED in `sources/online_dom.html` room-dialog template and in the shipped XML.)
- **The online build autosaves** ("except with the Online version where the edited home is automatically saved", DOCUMENTED §Starting a new home) and stores per-browser (IndexedDB / local storage mentioned in the v7.2 history entry). OBSERVED only that `localStorage` held only `user_pseudo_id` in my session and the demo home had to be loaded explicitly from `/examples/*.sh3x` (`out/probe_state.json`).
- **Demo homes are plain XML-in-ZIP** (`*.sh3x` containing `Home.xml`) — useful as a free source of real-world design data models (OBSERVED; downloaded 3 demos).

### 2.10 Evidence inventory (all inside this job folder)

| File | What it proves |
|---|---|
| `sources/userGuide_en.txt`, `sources/userGuide_de.txt`, `sources/userGuide_en.html`, `sources/userGuide_de.html` | vendor documentation of wall/room drawing (EN + DE as requested) |
| `sources/history.txt` | release-history dates for round walls (v3.0/v3.1), curve indicator & arc tooltip (v6.0), Create-rooms tool (v1.5) |
| `sources/js/sweethome3d.min.js` (7.5.2) | shipped online bundle: states, magnetism steps, editable properties, key map, dialogs |
| `sources/online_dom.html`, `sources/js_online.jsp` | live DOM templates: toolbar ids, wall dialog fields, room dialog fields, preference checkboxes |
| `sources/examples/roundwall/Home.xml`, `3BedroomHouseWithAttic/Home.xml`, `2BedroomApartmentWithBowWindow/Home.xml` | real data model incl. `arcExtent`, `heightAtEnd`, room points |
| `out/probe_app.json`, `out/probe_state.json`, `out/probe_model.json`, `out/probe_geom.json` | live app structure, toolbar, defaults, model API values |
| `out/probe_interaction.json`, `_2`, `_3`, `_4`, `out/probe_arc.json`, `out/probe_arc2.json`, `out/probe_room_points.json` | recorded interaction experiments (15° snap, ⌘ bypass, loop join, room detection, arc ritual, point drag) |
| `out/01_load.json`, `out/02_shot.json`, `shots/*.png` | REA browser-scenario evidence + screenshots |
| `scenarios/*.json`, `scripts/*.mjs` | reproducible scenario/probe inputs |

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

| # | Idea | Tied to finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Make walls chain by default and auto-join loops.** One click = start, each subsequent click commits a segment and starts the next; double-click/Esc ends; clicking back on the start point closes and joins the ring. Store explicit `startWallId`/`endWallId` per wall so joins, shared-wall trimming and 3D wall intersection are geometry-free. | 2.1, 2.3 | High — removes hundreds of clicks in real plans and makes shared walls a data guarantee | Low-Med (already have wall list; add link ids + join on snap) |
| 2 | **Cursor-following live dimension tooltip** (length, angle, thickness) during every draw/drag, plus point dots at chain ends. | 2.1, 2.9 | High — biggest single usability upgrade for precise drawing | Low |
| 3 | **Two-tier magnetism: 15°-family angle snap + scale-aware length snap**, each independently togglable, with a one-key temporary bypass on the modifier the OS expects (⌘ on macOS, Alt elsewhere) sampled **at pointer-down**. CasaPlazAI's fixed 0.5 m grid should become the coarse tier, not the only tier. | 2.2 | High — "draw a 4.37 m wall quickly" without fighting the grid | Low-Med |
| 4 | **Double-click-inside-walls room detection**, reusing the existing wall graph: trace free-space paths from the click, inset to inner wall faces, then stitch across door openings by half the door threshold so adjacent rooms meet in 3D. Keep the manual polygon tool as the fallback. | 2.6 | High — the single most-praised SH3D workflow | Med (needs a planar-subdivision / cycle-find on the wall graph) |
| 5 | **Room as a first-class object with an editable vertex list**: per-vertex drag with area recompute, add/delete vertex, and a `Recompute walls` action that re-derives the polygon from the current walls. | 2.6, 2.7 | High — CasaPlazAI rooms currently can't adapt to wall edits | Med |
| 6 | **Round/arc walls via a two-step ritual**: hold the modifier before the first press → second click materialises a 180° arc → subsequent move sets the arc extent → next click commits. Show `Arc extent` + arc length in the tooltip and in the wall inspector (clamp ±270°). This is a low-cost way to cover bow windows and curved partitions. | 2.4 | Med-High — differentiator; "Apartment with bow window" is a shipped demo for a reason | Med |
| 7 | **Sloping walls / attic heights**: add `heightAtEnd` (and allow 0) to the wall model with a Rectangular/Sloping radio in the inspector. Unlocks attics/garrets that a single-height wall cannot express. | 2.3 | Med — needed for whole-home plans | Med |
| 8 | **Wall inspector mirroring the proven field set**: start/end X-Y (editable), derived distance, thickness, height(s), arc extent, left/right side colour+texture, top pattern. A properties panel is faster than remembering tool modes and is a natural fit for CasaPlazAI's single-workspace redesign. | 2.3, 2.9 | Med-High | Low-Med (mostly UI over an extended model) |
| 9 | **Enter-driven numeric entry as a web-first differentiator**: press Enter mid-draw, type length/angle (or X/Y, or arc extent), Tab between fields. SH3D's web build explicitly lacks it, so this is a visible win over the competitor. | 2.8 | Med-High | Med |
| 10 | **Wall edit verbs**: Split wall, Join walls, Reverse direction — surfaced as context actions on a selected wall. Underpins interior remodelling (open-plan conversions) without redrawing. | 2.7 | Med | Low-Med |
| 11 | **Select-mode cursor contract**: move cursor on a body, resize cursor on a handle/point, draw cursor in creation modes; plus Shift-click multi-select and rubber-band selection. Cheap polish that makes a canvas feel native. | 2.7, 2.9 | Med | Low |
| 12 | **Level/hierarchy model for walls and rooms** (elevation, height, floor thickness; inactive levels ghosted and non-editable) — aligns with CasaPlazAI's walkthrough ambitions and future multi-storey support. | 2.9 | Med (long-term) | Med-High |

---

## 4. Unknowns / what I could not verify

1. **Shift alignment semantics** were only partially confirmed. My automated run measured `-60°` while the tooltip read `-15°`, which means the reference wall/point my test clicked was not the one the app aligned to. I did not isolate a clean "align to previous wall" experiment.
2. **Add/delete room point gesture in the online build.** The API (`addPointToSelectedRoom`, `deletePointFromSelectedRoom`, `isRoomPointDeletableAt`) is present and the guide documents per-point dragging, but double-clicking a room *side* and right-clicking a *point* did not add/remove vertices in my Select-mode tests. The desktop trigger (likely Alt-click/menu) was not established.
3. **`Recompute walls` outcome** was not measured. The dialog checkbox exists and was captured, but the probe call (`scripts/probe_recompute.mjs` → `out/probe_recompute.json`) was interrupted before its result was verified, so I make no claim about what it does beyond the label.
4. **Enter numeric entry in the desktop Swing version** is only DOCUMENTED (guide) — I could not run the desktop app in this environment, and the guide itself says the feature is missing from Online.
5. **Round wall + door/window interaction** (door placement on an arc wall, holes in curved geometry) was not tested; only that arc walls round-trip through XML and stay joined to neighbours.
6. **"Joined wall" trimming widths** — how intersecting shared walls are visually trimmed vs. stored (the demo XML shows walls overlapping by ~thickness/2 at corners, e.g. x from 4.0 with thickness 16.0) is inferred, not verified against code.
7. **Autosave/undo model** of the online build beyond "auto-saved" (DOCUMENTED) — I did not observe the persistence store beyond `localStorage.user_pseudo_id`; the home appeared session/demo-driven.
8. **Exact magnetism bypass key matrix** is source-verified for macOS (⌘) and Windows (Alt) and DOCUMENTED for Linux (Shift+Alt), but only the macOS path was exercised live; the Linux combination was not executed.
9. **Performance/limits** (how many walls/rooms before the planar room detection or 3D preview degrades) was not measured — no timing instrumentation was captured.

## Sources

- Sweet Home 3D Users Guide (EN): https://www.sweethome3d.com/userGuide.jsp — local copy `sources/userGuide_en.html`, text `sources/userGuide_en.txt`
- Sweet Home 3D Benutzerhandbuch (DE, requested): https://www.sweethome3d.com/de/userGuide.jsp — local copy `sources/userGuide_de.html`, text `sources/userGuide_de.txt`
- Release history: https://www.sweethome3d.com/history.jsp — `sources/history.txt`
- Sweet Home 3D JS Online (live app): https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — `sources/js_online.jsp`, `sources/online_dom.html`, `out/*.json`, `shots/*.png`
- Shipped bundle v7.5.2: https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 — `sources/js/sweethome3d.min.js` (behaviour described, no source copied)
- Demo homes: https://www.sweethome3d.com/examples/1BedroomApartmentWithRoundWall.sh3x (and `…3BedroomHouseWithAttic.sh3x`, `…2BedroomApartmentWithBowWindow.sh3x`) — `sources/examples/**/Home.xml`
- Tips hub: https://www.sweethome3d.com/tips.jsp — `sources/tips.txt`
- CasePlazAI-relevant note: Sweet Home 3D is GPL; none of its source code was copied — only names, field sets and observed behaviour are reported.
