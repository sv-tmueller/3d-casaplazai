# Sweet Home 3D — Dimension line creation UX (snapping, offset dragging, keyboard entry, elevation dimensions, automatic dimensions)

Job: `09-08a-dimensions-levels-dimension`. Round 2, narrow follow-up to
`~/dsh-workspaces/rea-sweethome3d-2026-10/08-08-dimensions-levels/report.md`
(read-only; its evidence is reused, not re-collected). App: **Sweet Home 3D** (GPL Java desktop,
v7.5 as of Aug 2024) and its browser edition **Sweet Home 3D JS** built from the same Java core via
GWT (`https://www.sweethome3d.com/SweetHome3DJSOnline.jsp`).

Tags: **OBSERVED** (I fetched/ran and read it; evidence file named) · **DOCUMENTED** (vendor docs
state it; URL given) · **INFERRED** (my reasoning).

Started 2026-10-31 15:28 CET. Hard stop 17:28; research frozen 17:03.

**Bundle provenance (round 2).** The primary source, `libjs/sweethome3d.min.js`, was downloaded
again from the live page (`https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2`,
2 618 789 bytes) and its SHA-256 —
`053e7d1ab0364712d51cd44b05fed39f54de79d17ca81b96164a57ba90666d89` — is **byte-identical** to the
round-1 copy. So every byte-offset citation below is against the currently served 7.5.2 build, not
a stale snapshot (OBSERVED).

**Additional round-2 evidence.** (a) The live 7.5.2 page was loaded in headless Chromium and its
running GWT classes were interrogated over CDP on a private port — this is the basis of §2.8b and
upgrades several claims from source-text to running-object. (b) The third-party
`AutoDimensioning.sh3p` plug-in was downloaded whole (source included) and read for §2.7. Neither
adds code to this report; all third-party behaviour is described in my own words (Sweet Home 3D and
the plug-in are GPL). Full source list with licences in `sources.json`.

## 1. Summary

- **Creation is a click-driven state machine, and the line object appears on the first mouse *move*
  after the first click.** `DimensionLineCreationState` moves to `DimensionLineDrawingState` on the
  first click (that state's `enter` records the start point); the first subsequent mouse-move
  constructs the `DimensionLine` and keeps updating its end point; the next click opens the
  extension-line sizing phase (`offsetChoice`, mouse-move now sets the offset); the click after that
  commits. Double-clicking the border of furniture / a wall side / a room side collapses this: the
  same press builds the magnetised line *and* opens the sizing phase, so one more click commits
  (OBSERVED, `libjs/sweethome3d.min.js`, offsets 1 561 512 / 1 630 900 / 1 564 075 / 1 562 500;
  DOCUMENTED in the [user guide](https://www.sweethome3d.com/userGuide.jsp)).
- **Magnetism is length-magnetisation, not endpoint snapping.** Free endpoints are first pushed
  onto a horizontal/vertical or 15° ray by `PointWithAngleMagnetism`, then the *length* is rounded
  by `LengthUnit.getMagnetizedLength` to an adaptive grid derived from 2×pixelLength (metric:
  0.5/1/5/10/100 cm; inch: 1/8, 1/4, 1/2, 1, 3, 6 in). Hover-assisted creation instead reuses the
  wall/furniture/room edge points and magnetises their exact span (OBSERVED, same file).
- **Offset (extension-line length) is a signed perpendicular distance with a live drag handle.**
  During the sizing phase each mouse-move sets it to `Line2D.ptLineDist(...) × sign(relativeCCW)`
  (the perpendicular distance from the pointer to the measured baseline, signed by which side it is
  on); later, `DimensionLineOffsetState` drags the mid-point handle of the selected line and commits
  `postDimensionLineOffset` on mouse-up, `ESC` restoring the old value (OBSERVED; DOCUMENTED as
  "click a third time after moving the mouse pointer to choose the size of the extension lines"; no
  extension line when the mouse does not move between clicks 2 and 3).
- **Keyboard entry is uniform across all drawing tools**: `ENTER` toggles an "edition" mode whose
  tooltip exposes per-state editable properties — `["X","Y"]` → `["LENGTH","ANGLE"]` →
  `["OFFSET"]` for a dimension line. Values are typed into the plan tooltip and validated by
  `updateEditableProperty` with clamping (`length ≥ 0.001 cm`, `|X|,|Y| ≤ maximumLength`), and the
  same map also covers walls, rooms and polylines. (OBSERVED; the desktop-only caveat is DOCUMENTED
  for *walls*: "feature not available in Online and Mobile versions".)
- **Elevation dimensions (7.2+) are a first-class orientation, not a separate tool.** Holding
  `Ctrl` (macOS `alt`/`option`) on the first click opens the creation dialog preset to
  `Elevation dimension` + `Visible in 3D`, default end-point distance = `home.getWallHeight()`,
  `elevationStart = 0`, `offset = 20` cm, `pitch = −π/2`; in-plan they render as a two-circle symbol
  and when selected show four drag indicators (start elevation, height, offset, pitch around the
  vertical axis) (OBSERVED; DOCUMENTED in the
  [7.2 blog](https://www.sweethome3d.com/blog/sweet-home-3d-7-2-update/)). All of the above was
  re-verified against the *loaded* application, not just the source text: attached to the live 7.5.2
  page over CDP, `new DimensionLineController(new Home(), x, y, new UserPreferences(), null, null)`
  returns exactly those defaults (with `Home.getWallHeight() = 250` cm), `DimensionLine.getPoints()`
  and its offset/elevation hit-tests behave as described, and
  `PlanComponent.prototype.setToolTipEditedProperties` really is the empty stub that explains the
  missing in-plan keyboard entry in the browser edition (OBSERVED, §2.8b).

## 2. Findings

### 2.1 Creation flow and orientation (plan vs elevation)

The active tool is the controller mode `PlanController.Mode.DIMENSION_LINE_CREATION`; its state,
`DimensionLineCreationState` (`al.DimensionLineCreationState`, mode `DIMENSION_LINE_CREATION`),
only handles the *first* click. On a single click it does:

- if `wasDuplicationActivatedLastMousePress()` (i.e. the platform duplication modifier) →
  `PlanController.createDimensionLine(x, y)` (number,number overload) which constructs a
  `DimensionLineController(home, x, y, preferences, viewFactory, undoSupport)` and opens the
  **dialog immediately** — this is the path used by the elevation shortcut;
- otherwise → `setState(getDimensionLineDrawingState())`.

OBSERVED, `sweethome3d.min.js` @ 1 630 900 (`DimensionLineCreationState.pressMouse`,
`setEditionActivated`) and @ 1 283 315 (`PlanController.createDimensionLine$float$float`).

The dialog title is context-sensitive: `DimensionLinePanel.dimensionLineCreation.title` for the
creation path and `…dimensionLineModification.title` for the modification path
(`JSViewFactory.createDimensionLineView(modification, preferences, controller)`, OBSERVED
@sweethome3d.min.js 2 544 768).

`DimensionLineController` has exactly two constructors (OBSERVED @ 703 910):

| ctor | arguments | defaults |
| --- | --- | --- |
| creation (elevation) | `(Home, float x, float y, UserPreferences, ViewFactory, UndoableEditSupport)` | `editableDistance=true`; `distanceToEndPoint = home.getWallHeight()`; `elevationStart=0`; `elevationEnd=home.getWallHeight()`; `offset=20` cm; `orientation=ELEVATION`; `lengthFontSize = preferences.getDefaultTextStyle(DimensionLine).getFontSize()`; `visibleIn3D=true`; `pitch = -π/2` |
| modification | `(Home, UserPreferences, ViewFactory, UndoableEditSupport)` | `dimensionLineModification=true`; then `updateProperties()` reads the current selection |

The dialog's orientation radios are `PLAN` and `ELEVATION`
(`DimensionLineController.DimensionLineOrientation = { PLAN:0, ELEVATION:1, DIAGONAL:2 }`). Switching
orientation rewrites the geometry (`setOrientation`, OBSERVED @ 714 282): to `PLAN` it forces
`elevationEnd = elevationStart`, `yEnd = yStart`, `xEnd = xStart + distance`; to `ELEVATION` it
forces `xEnd = xStart`, `yEnd = yStart`, `elevationEnd = elevationStart + distance`.

`DimensionLineDrawingState` handles the geometry roll-up. Its `enter` records the start point from
the last mouse-move; then, on each mouse-move, it magnetises the free endpoint
(`PointWithAngleMagnetism`) unless magnetism/alignment is off, and on the **first** such move
constructs the `DimensionLine` (offset 0) from that start point to the pointer. Later moves just
update the end point (or the start point while `editingStartPoint`), reversing the endpoints when
the direction leaves the right half-plane. Setting `offsetChoice = true` switches the state into
"size the extension lines" mode, where each move instead writes the offset
(OBSERVED @ 1 562 500–1 564 427).

The click sequence is worth stating exactly, because the guide's two creation routes share one
handler (`DimensionLineDrawingState.pressMouse(x, y, clickCount, shift, duplication)`, OBSERVED
@ 1 564 075). The handler has two sequential `if`s (they are not exclusive — a double-click hit
falls through both):

1. `newDimensionLine == null && clickCount === 2` → `getMeasuringDimensionLineAt`; if a candidate
   edge is under the pointer, build the real line from it (keeping its computed `±20/scale`
   offset); **if nothing is under the pointer, fall back to `DimensionLineCreationState` (re-arm),
   no line created**.
2. `newDimensionLine != null`:
   - if `offsetChoice` → `validateDrawnDimensionLine()`: `selectItem`,
     `postCreateDimensionLines([line], oldSelection, oldBasePlanLocked, oldAllLevelsSelection)`,
     reset, and re-arm for another dimension;
   - else → set `offsetChoice = true`, switch the cursor to `PlanView.CursorType.HEIGHT`, clear the
     hover preview. *No geometry changes on this click* — the following mouse-move sets the offset
     (see 2.3).

So the two routes are: **free route** — click 1 moves `CreationState → DrawingState` (whose `enter`
+ the first mouse-move create the line), click 2 opens the offset phase, click 3 commits;
**hover route** — the second press of the double-click (`clickCount === 2`) creates the line *and*
opens the offset phase in the same event, and the next single click commits. In both routes the
middle step is the same "start sizing extension lines" transition, which is why the guide can
describe a uniform "third click". On touch pointers the line is validated immediately inside step 1
and the tool returns to the selection state instead (OBSERVED, same handler /
`validateDrawnDimensionLine`).

`DimensionLineResizeState` lets the user grab either extension line of a selected dimension and
re-aim it: it computes `distanceFromResizePointToDimensionBaseLine` on entry, then projects the drag
onto a circle of that radius around the opposite end, re-magnetising the resulting point
(OBSERVED @ 1 569 000–1 570 600).

**Keyboard shortcut summary for the tool** (OBSERVED, `installDefaultKeyboardActions` /
`installEditionKeyboardActions`, sweethome3d.min.js @ 2 162 542 and @ 2 166 748):

| key | effect |
| --- | --- |
| `ENTER` / `shift+ENTER` | `ACTIVATE_EDITIION` → tooltip keyboard entry for `["X","Y"]`, then `["LENGTH","ANGLE"]`, then `["OFFSET"]` (typo `EDITIION` is in the shipped bundle) |
| `ENTER` while in edition mode | `DEACTIVATE_EDITIION` (commit) |
| `ESC` / `shift+ESC` | cancel: `escape()` deletes the in-progress line (`home.deleteDimensionLine`) and returns to the creation state (to the selection state on touch pointers) |
| duplication modifier (Windows `ctrl`, macOS `alt`) + first click | elevation-dimension dialog path |
| magnetism toggle (Windows `alt`, macOS `meta`, others `shift+alt`) | re-runs `moveMouse` with magnetism inverted |

### 2.2 Snapping to walls / furniture / room sides / grid

There are two distinct snapping mechanisms.

**(a) Free two-point drawing — `PointWithAngleMagnetism`.** The constructor takes
`(x1, y1, x2, y2, LengthUnit, pixelLength)`. Internally the angular step count is
`CIRCLE_STEPS_15_DEG = 24`, i.e. 15° increments (OBSERVED @ 1 477 249); when the raw direction is
close to a multiple it snaps the ray, then calls
`LengthUnit.getMagnetizedLength(length, pixelLength)` to quantise the distance (OBSERVED
@ 1 560 000 region, `DimensionLineDrawingState.moveMouse`; the same class is used by wall, room,
polyline and resize states).

`LengthUnit.getMagnetizedLength` dispatches to metric vs. inch families (OBSERVED @ 2 048 147):

- **metric** (`getMagnetizedMeterLength`): let `a = 2 × pixelLength` in cm; pick a grid `b` by
  thresholds — `a > 100 → 100`, `> 10 → 10`, `> 5 → 5`, `> 1 → 1`, `> 0.5 → 0.5`, else `0.1` —
  then `round(d / b) * b`; if the result is 0 but `d > 0`, keep the raw `d`.
- **inch** (`getMagnetizedInchLength`): same idea with `b ∈ {1/8, 1/4, 1/2, 1, 3, 6}` inch keyed off
  `2 × pixelLength` converted to inches.

Because the grid depends on the *current zoom* (`PlanComponent.getPixelLength() = 1 / scale`), the
magnetisation coarsens when zoomed out and refines when zoomed in — a nice, cheap "snap to a
drawing-appropriate grid" without any explicit grid setting (INFERRED from the two functions above).

**(b) Hover-assisted edge dimensions — `PlanController.getMeasuringDimensionLineAt(x, y, magnetism)`**
(OBSERVED @ 1 324 094). It searches in this priority order, and returns the first hit:

1. every *visible furniture* piece — `getDimensionLineBetweenPointsAt(piece.getPoints(), x, y, margin, magnetism)`;
2. every **room path derived from walls** that intersects the selection margin box;
3. every **room polygon** whose level is null/viewable and which `isAtLevel(selectedLevel)`.

`getDimensionLineBetweenPointsAt(polygon, x, y, margin, magnetism)` iterates the polygon edges and
returns the first edge with `lengthSq > 0.01` and `ptSegDistSq(edge, point) ≤ margin²`, then calls
the shared builder `getDimensionLineBetweenPoints$float_A$float_A$float$double$boolean(p1, p2,
offset, lengthSq, magnetize)`. That builder (OBSERVED @ 1 324 094–1 327 000):

- computes `d = atan2(y1 - y2, x2 - x1)`; if `d ≤ -π/2 || d > π/2` it swaps the endpoints and negates
  the offset so the label is never upside down (history v2.3: "Avoided to display text upside down
  on new dimensions");
- if `magnetize` is set, replaces the edge span with
  `getMagnetizedLength(sqrt(lengthSq), pixelLength)` and re-derives the far endpoint along `d`;
- returns `new DimensionLine(x1, y1, x2, y2, offset)` — note the **offset argument carries over from
  the computed margin** (`bm = 20 / scale` for the wall/triangulation helpers), so a freshly hovered
  dimension already has extension lines of about 20 screen px.

The hit margin names come from `PlanController` constants (OBSERVED @ 1 343 020 region):
`PIXEL_MARGIN = 4`, `INDICATOR_PIXEL_MARGIN = 5`, `WALL_ENDS_PIXEL_MARGIN = 2`; the selection margin
is `PIXEL_MARGIN` (×2 for touch) divided by the current scale, and the indicator margin is
`INDICATOR_PIXEL_MARGIN` (×3 for touch) / scale — i.e. **hit targets are constant in screen
pixels, not model units**.

While the creation tool is active, `DimensionLineCreationState.moveMouse` continuously calls
`getMeasuringDimensionLineAt` and shows the candidate via `setDimensionLinesFeedback([line])`, so
the user sees the exact dimension that a double-click will accept (OBSERVED @ 1 630 941).

**Wall-side and room-side via wall paths.** In `createDimensionLine`-adjacent code,
`getDimensionLinesAlongWall(wall)` / `(furniture, wall)` use `getRoomPathsFromWalls()` and
`getPathPoints(path, true)`, intersect the wall's four outline points with room-path segments, and
emit a `DimensionLine` with offset `±20/scale` whose sign is chosen by
`isDimensionInsideWall(...)` / `isDimensionInsideRoom(...)` (OBSERVED @ 1 307 646, @ 1 652 191,
@ 1 691 712).

**No grid snap is exposed as a user setting for dimensions.** The only "grid" is the adaptive
length-magnetisation step above; `UserPreferences` exposes `isMagnetismEnabled()` and the plan has
a "magnetism" concept toggled by key/menu, but no per-dimension grid pitch. (OBSERVED absence in
the bundle's `LengthUnit`/`UserPreferences` surfaces; INFERRED that SH3D deliberately has no
drawing grid.)

### 2.3 Offset dragging and extension-line sizing

The `offset` field is a signed distance measured perpendicular to the dimension baseline; the
geometry is materialised in `DimensionLine.getPoints()` as start/end plus
`(-sin θ · offset, cos θ · offset)` where `θ = atan2(dy, dx)` for plan lines and `θ = pitch` for
elevation lines (round-1 OBSERVED; reconfirmed at `DimensionLine.getPoints`, sweethome3d.min.js
around 504 000).

Three ways to set it:

1. **Mouse-move in the sizing phase during creation.** `DimensionLineDrawingState.moveMouse` with
   `offsetChoice` set does `ptLineDist(baseline, x, y)` and multiplies by `sign(relativeCCW(...))`,
   so dragging to either side of the baseline flips the sign; if the line length is 0 the branch is
   skipped (OBSERVED @ 1 561 988). Note this happens on *move*, not on the click that entered the
   phase — the click only sets `offsetChoice = true` and the cursor.
2. **Dragging the middle handle of a selected line.** `PlanController.getOffsetDimensionLineAt(x,y)`
   returns the selected line when `isMiddlePointAt(x,y,margin) || (isTopPointAt(...) && !containsPoint(...))`
   (OBSERVED @ 1 347 922); that starts `DimensionLineOffsetState`, whose `enter()` caches the old
   offset and the vector from the mid-point; `moveMouse` then uses `Line2D.ptLineDist` +
   `relativeCCW` for plan lines, or `Point2D.distance` + `relativeCCW` against a synthetic pitch
   ray for elevation lines, and calls `setOffset(∓distance)`; `releaseMouse` posts
   `postDimensionLineOffset(line, oldOffset)`; `escape` restores the old offset (OBSERVED
   @ 1 580 734).
3. **Keyboard entry** — `setEditionActivated(true)` shows the tooltip property `["OFFSET"]`, and
   `updateEditableProperty("OFFSET", v)` clamps to `[-maximumLength, +maximumLength]` and calls
   `setOffset(v)` (OBSERVED @ 1 565 347 and @ 1 565 200 region).

The **extension-line length is the same `offset` magnitude** — `containsStartExtensionLinetAt` /
`containsEndExtensionLineAt` build a `Line2D.Float` from each end point along
`(-sin θ · offset, cos θ · offset)` and test `containsShapeAtWithMargin`
(OBSERVED @ 506 290–506 631). So the guide's "size of the extension lines" is literally the offset.
The guide's rule "the new dimension won't have any extension line if you don't move the mouse
between the second and the third click" follows because the offset keeps whatever value the click
entering the sizing phase left behind (0 for free drawing, the computed margin for hover-assisted
drawing) (DOCUMENTED, [user guide](https://www.sweethome3d.com/userGuide.jsp), "Drawing dimensions";
INFERRED for the
mechanism).

### 2.4 Keyboard entry (lengths, units, validation)

The plan surface installs two keyboard maps on the plan container element (`keydown`/`keyup`):

- **default map**: `pressed ENTER` and `shift pressed ENTER` → `ACTIVATE_EDITIION`; plus arrow-key
  move-selection actions, `DELETE`/`BACK_SPACE` → `DELETE_SELECTION`, `ESCAPE` → `ESCAPE`, and
  OS-specific duplication/magnetism/alignment chords (OBSERVED @ 2 162 542).
- **edition map** (installed while editing): `ENTER`/`shift+ENTER` → `DEACTIVATE_EDITIION`,
  `ESCAPE`/`shift+ESCAPE` → `ESCAPE`, plus the duplication/alignment chords (OBSERVED @ 2 166 748).

This is exactly history **v2.3** — "Enabled the user to enter the size of new dimensions with the
keyboard once the Enter key has been pressed" and "Added the ability to create dimensions on
furniture side, wall side or room side with a double-click" (OBSERVED, `docs/history.txt`).

Which fields are exposed is per controller state, via `PlanComponent.setToolTipEditedProperties(names,
values, x, y)`. The dimension-line states emit, in order (OBSERVED @ 1 565 472 / 1 565 590 / 1 565 737):

| phase | properties |
| --- | --- |
| before the dimension exists | `["X","Y"]` |
| line exists, not yet sizing extension lines | `["LENGTH","ANGLE"]` |
| sizing extension lines (`offsetChoice`) | `["OFFSET"]` |

Validation and application live in `updateEditableProperty(property, value)` (OBSERVED @ 1 565 520):

- `X`/`Y` clamped to `[-maximumLength, +maximumLength]`, `null → 0`;
- `LENGTH` clamped to `[0.001, maximumLength]` then end point recomputed as
  `x = xStart + length·cos(angle)`, `y = yStart − length·sin(angle)`;
- `ANGLE` taken in **degrees**, converted with `·π/180`, length preserved;
- `OFFSET` clamped to `[-maximumLength, maximumLength]`.
- Writing to the start vs. end point depends on `editingStartPoint`.

`DimensionLineController.updateProperties()` (the modification dialog) populates six independent
coordinate fields (OBSERVED @ 1 256 995 etc. and @ 708 392): `xStart, yStart, elevationStart,
xEnd, yEnd, elevationEnd`. `editableDistance` is `true` only when **all six** agree across the
selection; the dialog then drops or disables the derived `Distance between end points` field when
several lines are selected (DOCUMENTED, 7.2 blog: "the Distance between end points field won't be
shown because it's often too complicated to handle such modifications" — see the JS clarification
below for what "not shown" actually means in the port).

Two clarifications recovered from the JS dialog code (OBSERVED in `createDimensionLineView`,
@ 2 547 940–2 551 993):

- The distance field has its own bounds `minimum = getMinimumLength()`,
  `maximum = 2 × maximumLength × √2` — i.e. the diagonal of the maximum square — wider than the
  per-coordinate bounds.
- The `offset` spinner uses **hard-coded** `minimum: -10000, maximum: 10000` cm, not the length
  unit's maxima, unlike every other field in this dialog. The elevation-start spinner is instead
  bounded `[0, maximumLength]`, and the length-font-size spinner `[5, 999]`.
- "Hidden" in the JS build is realised as **`disabled`, not removed**: the orientation radios are
  `disabled = !controller.isEditableDistance()`, and on top of that `xEndInput`/`yEndInput` are
  disabled whenever the orientation is not PLAN, while `elevationStartInput` is enabled only when
  the line is `visibleIn3D` or ELEVATION-oriented (OBSERVED @ 2 551 245–2 551 993). So the
  7.2 blog's "field won't be shown" is an over-simplification of a greyed-out field in the JS port.

`setDistanceToEndPoint(distance, updateEnd)` is the length-driven setter: it recomputes the end
point in 3D with `atan2(yStart − yEnd, xEnd − xStart)` and `atan2(elevationEnd − elevationStart,
xEnd − xStart)`, so it handles elevation lines too (OBSERVED @ 713 498).

**Numeric parsing/units.** All dialog numeric inputs (and tooltip entry) are `JSSpinner`s built with
`format = lengthUnit.getFormat()`, `stepSize = lengthUnit.getStepSize()`, `minimum`/`maximum` from
the unit (OBSERVED @ 239 300–2 396 000 and in `createDimensionLineView` @ 2 544 880). Unit facts
(OBSERVED in the bundle's `LengthUnit` definitions @ 2 050 203 ff.):

| unit family | `getStepSize()` | `getMinimumLength()` | `getMaximumLength()` | `getMaximumElevation()` |
| --- | --- | --- | --- | --- |
| MILLIMETER / CENTIMETER / METER | 0.5 (cm) | 0.1 cm | 100 000 cm | maxLength / 10 |
| INCH / INCH_FRACTION / INCH_DECIMALS / FOOT_DECIMALS | 0.125 in (0.3175 cm) | 0.125 in | 3280 ft | maxLength / 10 |

Pressing ENTER does **not** submit a free-form expression; `JSSpinner.parseValueFromInput` calls
`format.parse(text, ParsePosition)` and falls back to the previous value on a blank box, so entry
is a single formatted number in the current length unit (OBSERVED @ 2 395 870). I found no
calculator/expression parser in the bundle (`Expression`/`Calculator`/`parseExpression` all have
0 hits), so "type `2.5`" not "type `3*0.5+1`" is the model (OBSERVED absence).

Spinner stepping uses the same 0.5 cm / 1/8 in `getStepSize()`, and the up/down keys are wired to
increment/decrement in `JSSpinner` (OBSERVED @ 2 393 000+).

**Browser-edition caveat.** The German user guide explicitly marks keyboard length/angle entry as
"(Funktion nicht in den Online- und Mobile-Versionen verfügbar)" for walls (OBSERVED,
`docs/de-userGuide.txt` line 194; the English guide at line 198 says the same). The Java source path
that makes this true is presumably the platform keyboard map being installed by the
Swing/AWT `PlanComponent`; I did **not** locate a JS-side replacement that re-enables typed entry,
and the JS `PlanComponent.prototype.setToolTipEditedProperties` is an **empty stub**
(`function(c,b,a,d){}`, OBSERVED @ 2 243 403). Two further facts point the same way: the companion
dynamic-update method **`setToolTipEditedPropertyValue` has zero definitions anywhere in the
2.6 MB bundle** yet is still called from `RoomCreationState.updateEditableProperty` (three call
sites, OBSERVED @ 1 670 981 / 1 671 589 / 1 671 998), and the JS build's
`PlanComponent.prototype` methods contain only `setToolTipEditedProperties`, `setToolTipFeedback`
and `deleteToolTipFeedback` — no input-widget plumbing. Taken together this is strong evidence the
tooltip-typing feature is inert in the browser build (OBSERVED stubs/absences; INFERRED that
keyboard dimension entry is unavailable in JS Online).

### 2.5 Elevation dimensions (7.2)

History/documented scope (OBSERVED `docs/history.txt`): v7.2 "Added elevation dimensions to show
items height", "Handled dimensions display in 3D view", "Added Modify dimensions dialog box,
elevation dimensions, 3D handling option, shelves magnetism and preset postures choice to Sweet Home
3D JS Online"; v7.3 "Fixed the font of dimensions in the 3D view to the one set in preferences".

DOCUMENTED behaviour ([7.2 blog](https://www.sweethome3d.com/blog/sweet-home-3d-7-2-update/)):

- `Plan > Modify dimensions` or a double-click on a dimension opens a pane to type coordinates or
  length; it also sets font size, colour, and whether the dimension is visible in the 3D view.
- Two types: **Plan dimension** and **Elevation dimension** (used to show an item's height).
  When visible in 3D, the text is always drawn in a legible direction regardless of the viewpoint;
  each plan dimension can be set to a 0° or 90° label pitch.
- In plan, an elevation dimension is drawn as a "symbol showing two circles (something like an arrow
  seen from top) and an extension line".
- When selected, an elevation dimension exposes **four indicators**: elevation of the start point,
  the height, the offset of the extension lines, and the angle around the elevation axis.
- Created directly with the Dimensions tool by holding `Ctrl` (`alt`/`option` on macOS) at the first
  click; the dialog then comes up with `Elevation dimension` + `Visible in 3D view` selected and a
  default end-point distance equal to `home.getWallHeight()`.

**The modifier is now traced end-to-end in the 7.5.2 build** (OBSERVED, bundle @ 2 145 915 and
@ 2 146 146, the `PlanComponent` mouse listener, corroborated live by
`PlanController.prototype["pressMouse$float$float$int$boolean$boolean$boolean$boolean$…"]`):

- The duplication modifier is the **Option/Alt key on macOS and the Control key elsewhere**;
  the magnetism toggle is **Alt on Windows, Command/Meta on macOS, and Shift+Alt on other
  platforms**; and the alignment modifier is plain **Shift on Windows/macOS, but Shift without Alt
  elsewhere**. Separately, the "plain shift" flag that reaches the controller deliberately excludes
  all other modifiers (Shift pressed alone).
- On a left-button press the listener calls
  `planController.pressMouse(convertXPixelToModel(x), convertYPixelToModel(y), clickCount,
  isShiftDown, isAlignmentActivated, isDuplicationActivated, isMagnetismToggled, View.PointerType.MOUSE)`.
- `PlanController.pressMouse(...)` stores the sixth boolean verbatim in
  `this.duplicationActivatedLastMousePress = j` and immediately calls
  `this.state.pressMouse(x, y, clickCount, shiftDown, duplication)`, i.e. the *fifth* argument of the
  state handler.
- `DimensionLineCreationState.pressMouse` (OBSERVED @ 1 630 900) then tests
  `wasDuplicationActivatedLastMousePress()` and, when true, calls
  `PlanController.createDimensionLine(x, y)` → the elevation `DimensionLineController` constructor.

So the whole chain *Ctrl (Windows/Linux) / Option (macOS) keydown state → DOM event → boolean →
controller field → state guard → elevation dialog* is confirmed in the shipped code, including the
platform split; the only untested link is a literal human keypress in a session (synthetic clicks on
the GWT canvas were unreliable in round 1). No separate chord exists for "elevation" — the feature
reuses the duplication modifier that every other tool uses to clone items.

Implementation facts recovered from the bundle:

- `DimensionLine.isElevationDimensionLine()` = `xStart === xEnd && yStart === yEnd &&
  elevationStart !== elevationEnd` (OBSERVED @ 503 731). So an "elevation ray" is just a
  zero-footprint dimension with a vertical extent.
- `DimensionLine.getLength()` = `sqrt(dx² + dy² + dz²)` (OBSERVED, same region) — the 3D length is
  what gets labelled for elevation lines.
- The four handles map to four hit-test methods (OBSERVED @ 506 631–507 352):
  `isMiddlePointAt` (plan offset), `isTopPointAt` / `isRightPointAt` / `isBottomPointAt` /
  `isLeftPointAt` (the four elevation handles placed at `offset ∓ endMarkSize/2` along and across
  the pitch direction), and `containsStartExtensionLinetAt` / `containsEndExtensionLineAt`.
- Four state classes then own the drags: `DimensionLineHeightState` (changes
  `elevationEnd = elevationStart + max(oldHeight − dy, 0)`, magnetised, then clamped to
  `[minimumLength, maximumLength]`), `DimensionLineElevationState` (changes `elevationStart`, clamped
  to `[0, elevationEnd − minimumLength]`, with a formatted tooltip), `DimensionLineOffsetState`, and
  `DimensionLinePitchRotationState` (rotates the label plane around the vertical axis using
  `atan2` and rounds to `2π / STEP_COUNT` with `STEP_COUNT = 24`, i.e. 15°) (OBSERVED
  @ 1 586 166, @ 1 589 326, @ 1 580 734, @ 1 606 000 region).
- The dialog's radio buttons reflect the `PLAN`/`ELEVATION` orientation enum; `pitch0`/`pitch90`
  radios set `pitch = 0` or `pitch = −π/2`, and the elevation-start input is enabled only when the
  line is elevation-oriented or marked visible in 3D (OBSERVED @ 2 551 100–2 552 000).

### 2.6 Automatic / temporary dimensions on selection, resize, move

- **Selection itself does *not* populate dimensions.** `DimensionLineController.updateProperties()`
  only reads the **currently selected `DimensionLine`s**
  (`Home.getDimensionLinesSubList(home.getSelectedItems())`); selecting a wall, room or piece of
  furniture produces no dimension read-out (OBSERVED @ 708 392).
- **Hover preview while the tool is armed** is the closest thing to "automatic": moving the mouse in
  `DimensionLineCreationState` continuously computes `getMeasuringDimensionLineAt` and pushes it to
  `setDimensionLinesFeedback` (OBSERVED @ 1 630 900 region), and a double-click accepts it.
- **Temporary dimensions while resizing a wall** (v6.3). `WallResizeState` and
  `WallEndPointResizeState`-style states call
  `setDimensionLinesFeedback(getDimensionLinesAlongWall(selectedWall))`, which walks every room path
  from walls, keeps segments that lie on the selected wall (using both the inner and outer wall
  outline points), emits a `DimensionLine` with `offset = ±20/scale`, drops duplicates by equal
  length, and finally drops entries shorter than 0.01 (OBSERVED @ 1 652 191–1 655 400 and the
  helper at 1 307 646).
- **Temporary dimensions while moving furniture along / near a wall** — the same helper is called
  with `(pieceOfFurniture, wall)` during `DragAndDropState`/move, showing the gaps to the adjacent
  walls (OBSERVED @ 1 495 174, @ 1 512 362).
- **Triangulation dimensions around a moved room point** (v6.3). `RoomPointMoveState` calls
  `getTriangulationDimensionLines(room, pointIndex)`: it builds a dimension to the previous point,
  to the next point, and — when the room has > 2 points — a third dimension to the penultimate
  point (the diagonal that keeps the triangle rigid), each offset `±20/scale` inward/outward per
  `isDimensionInsideRoom(...)` (OBSERVED @ 1 691 712; DOCUMENTED
  [6.3 blog](https://www.sweethome3d.com/blog/sweet-home-3d-6-3/): "new temporary dimension lines
  are now drawn along a wall when you move its end points and around the room point that you move.
  The latter should be helpful to draw rooms using triangulation method").
- **History hooks** (OBSERVED `docs/history.txt`): v6.3 "Added temporary dimension lines along a
  resized wall" and "during the move of a room point with a diagonal dimension to allow
  triangulation"; v6.4 "Fixed a bug in redoing dimension line resizing".

All temporary feedback is drawn by `PlanComponent.setDimensionLinesFeedback(list)` +
`repaint()`, i.e. a **non-persistent overlay layer**, never added to `Home` (OBSERVED @ 2 244 345).
Crucially for the browser edition, the *rendering* of that layer is **present and shared** in the
JS bundle: `PlanComponent.paintComponent` ends with a block that, when
`this.dimensionLinesFeedback != null`, calls
`paintDimensionLines(canvas, dimensionLinesFeedback, [], …)` (with a throw-away empty selection
list, i.e. the overlays are never drawn as "selected"), and `paintDimensionLines` handles both plan
lines and elevation rays via the `isElevationDimensionLine()` branch, draws the two end marks and
the extension lines, and uses the caller-supplied stroke/colour for feedback
(OBSERVED @ 2 186 483 and @ the `paintDimensionLines` body). The `DraggedItemsFeedback` path is
drawn the same way (@ 2 186 554). So the wall-resize, furniture-move and room-triangulation overlays
are not a desktop-only feature: the same states, helpers and painter are compiled into the JS
edition, and the *only* thing gating them is `feedbackDisplayed` (a viewer preference), exactly as
on the desktop.

### 2.7 AutoDimensioning plug-in (whole-plan automatic dimensions)

DOCUMENTED/third-party ([plug-ins page](https://www.sweethome3d.com/plugins.jsp)): **AutoDimensioning.sh3p**
by Dorin Vatavu (44 kB, source included, works in desktop + JS Online) adds
`Tools > Autodimensioning` and "allows to generate dimension lines for the whole plan"; the
[forum thread](https://www.sweethome3d.com/support/forum/viewtopic.php?t=10955) (OBSERVED, fetched)
shows the author's own TODO list at v1: "implement somehow the exterior walls; to align exterior
dimensions; to add walls thickness", and his workaround for alignment is "select the lines and then
align them with another plug-in". The thread has 35 replies and >170 000 views, and the plug-in is
listed as compatible with the JS Online edition.

**The algorithm is now recovered from the shipped plug-in** (OBSERVED, `AutoDimensioning.sh3p`
downloaded 2026-10-31 from its SourceForge attachment, GPL-2.0+, `autodim/AutoDimensionigPlugin.java`
included in the archive, 1 220 lines; read-only, *behaviour described, no code copied*). The
plug-in's own logic is in one class and works on the public model API:

- It does **not** touch the user's current level. `generateDimensions` first clones the layout by
  calling `PlanController.addLevelAtSameElevation()`, renames the new level (suffix such as
  " dimensions"), builds the whole list of lines off-screen, and only then calls
  `addDimensionLines(list)` once — i.e. one undoable edit and no incremental flicker
  (OBSERVED, `generateDimensions`).
- **Per-wall pass** (`getDimLinesAtLevel` → `getDimensionLinesAlongWall`): for each straight wall,
  offset = `20 / scale`; it builds the walls' outline `Area`, extracts closed room paths, and for
  every room-path segment checks whether it lies on the wall's *left* side (`wallPoints[0..1]`) or
  *right* side (`wallPoints[2..3]`) using squared line/segment distances with an epsilon of
  1e-4 (i.e. `distSq < 0.0001`), including the "segment is a sub-range of the wall side" cases.
  Accepted segments become candidate `DimensionLine`s. Zero-length results (`< 0.01`) are dropped,
  and across walls exact duplicates (`xStart,xEnd,yStart,yEnd,offset` all equal) are removed. Curved
  walls get a **different** treatment: two radial dimension lines from the arc centre (inner and
  outer radius), each chosen as the shorter of two measured candidates (OBSERVED, same method).
- **Surrounding/exterior pass** (`addSurroundingDimensions`, triggered by the "Exterior dimensions"
  checkbox): it takes the exterior-wall set, computes an axis-aligned bounding box of all wall
  points (with the `xMin==0`/`yMin==0` sentinel quirk of the original), then lays **four**
  `offset = 100` outline lines — up, right, down, left — 100 cm outside the bbox. It classifies the
  per-wall lines as exterior vs interior by testing whether both endpoints lie on the built-surface
  contour polyline, converts each group to `Line2D`s, collects the distinct projection points on
  those lines (`getInteriorDimPoints` / `getExteriorDimPoints`), and emits tightly packed
  orthogonal dimension runs in all four directions (`getUpDim`/`getRigthDim`/`getDownDim`/
  `getLeftDim`). Optionally it also draws extension "aid lines" as polylines when the
  "extensions" checkbox is on (OBSERVED, same region).
- **Other options**: "Built area" appends a polyline contour and a labelled area; "Roof built area"
  adds roof projection + area with an overhang spinner. These are the plug-in's own extras, not core
  dimension behaviour (OBSERVED, plug-in properties/checkbox fields).

Key takeaways for a CasaPlazAI feature: whole-plan auto-dimensioning is a *plugin*, not core; the
real algorithm is only ~150 lines of geometry on top of the model, so it is very portable; it emits
interior-wall dimensions by default and the whole exterior offset-chain is an explicit extra
checkbox; alignment of exterior dimension chains remains the known unresolved UX problem; and users
accepted a "generate → manually select → align" workflow rather than a fully automatic layout
(OBSERVED; INFERRED for the acceptance claim).

### 2.8 Data model & persistence of dimension lines

Round 1 already documented the `DimensionLine` model; the round-2 additions relevant to the UX:

- `DimensionLine.Property` = `X_START, Y_START, ELEVATION_START, X_END, Y_END, ELEVATION_END,
  OFFSET, END_MARK_SIZE, PITCH, LENGTH_STYLE, COLOR, VISIBLE_IN_3D, LEVEL` (DOCUMENTED,
  [javadoc](https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/DimensionLine.Property.html);
  OBSERVED in bundle property-change keys).
- Constructor defaults when fields are omitted: `xStart=yStart=xEnd=yEnd=elevationStart=
  elevationEnd=offset=endMarkSize=pitch=0`, `lengthStyle=null`, `color=null`,
  `visibleIn3D=false`, `level=null` (OBSERVED @ 496 300).
- Persistence in the `.sh3d`/`.sh3x` XML: the **writer** emits the full attribute set (now verified
  from source, OBSERVED `HomeXMLExporter$10.writeAttributes…DimensionLine`, bundle @ 405 311):
  `id`, optional `level`, `xStart`, `yStart`, `elevationStart` (omitted when 0), `xEnd`, `yEnd`,
  `elevationEnd` (omitted when 0), `offset`, `endMarkSize` (omitted when 10), `pitch` (omitted when
  0), `color`, `visibleIn3D` (omitted when false). Its `writeChildren` adds the generic
  `writeProperties(v, u)` (i.e. the `Property` map, sorted by name) followed by
  `writeTextStyle(v, u.getLengthStyle(), "lengthStyle")`.
  The **sample homes** happen to show only `<dimensionLine level=… xStart=… yStart=… xEnd=… yEnd=…
  offset=…/>` because all their fields are at the omitted defaults (OBSERVED, three files under
  `examples/x/*/Home.xml`, e.g. `2BedroomHouseWithBasement/Home.xml`: 20 lines, all six-attribute
  form). `HomeXMLHandler.setDimensionLineAttributes` reads the same set back via the generic
  `setProperties(...)` plus `setLengthStyle(textStyles["lengthStyle"])` (OBSERVED @ 37 602). So the
  earlier "non-default serialisation unverified" question is resolved: it is a plain
  write-if-non-default scheme, not a separate code path.
- `EndMarkSize` default 10 (OBSERVED, `K.endMarkSize=10` in the 13-arg creation constructor).
- Dimensions are `Elevatable`, hence carry a `level` — dimension lines are per-level objects and can
  be hidden by level visibility, which the sample `2BedroomHouseWithBasement` exercises
  (`level0` and `level1` lines side by side) (OBSERVED).

### 2.8b Live re-verification in the shipped JS app (round 2)

Beyond byte-reading the bundle, I loaded the live `SweetHome3DJSOnline.jsp` page in headless
Chromium, attached over CDP and interrogated the running GWT module's *own* classes (all OBSERVED,
2026-10-31, on the served 7.5.2 build). This upgrades the corresponding 2.1–2.9 claims from
"bundle text" to "the object actually loaded by the application". Highlights:

| probe | live result |
| --- | --- |
| `typeof DimensionLineController` / `DimensionLineOrientation` | function; `{PLAN:0, ELEVATION:1, DIAGONAL:2}` |
| `new DimensionLineController(new Home(), 100, 200, new UserPreferences(), null, null)` | `editableDistance=true`, `orientation=1` (ELEVATION), `elevationStart=0`, `elevationEnd=250`, `distanceToEndPoint=250`, `offset=20`, `visibleIn3D=true`, `pitch=−1.5707963267948966`, `xStart=100`, `yStart=200` — and `Home()` defaults `getWallHeight()=250` |
| `PlanComponent.prototype.setToolTipEditedProperties` | stringifies to `function(c,b,a,d){}` (empty stub) |
| `PlanComponent.prototype.setToolTipEditedPropertyValue` | `undefined`; only `setToolTipFeedback`, `setToolTipEditedProperties`, `deleteToolTipFeedback` exist |
| `PlanController.{PIXEL_MARGIN, INDICATOR_PIXEL_MARGIN, WALL_ENDS_PIXEL_MARGIN}` | `4`, `5`, `2` |
| `PlanController.prototype` dimension hit-test API | `getMeasuringDimensionLineAt`, `getOffsetDimensionLineAt`, `getElevatedDimensionLineAt`, `getHeightResizedDimensionLineAt`, `getPitchRotatedDimensionLineAt`, `getResizedDimensionLineStartAt/EndAt`, `getDimensionLinesAlongWall`, `createDimensionLine$float$float` — all present |
| `DimensionLine.prototype` | includes `isElevationDimensionLine`, `containsStartExtensionLinetAt`, `containsEndExtensionLineAt`, `isMiddlePointAt`, `isTopPointAt`, `isBottomPointAt`, `isLeftPointAt`, `isRightPointAt`, `getPoints`, `getShape`, `move` |
| `new DimensionLine(0,0,100,0,20).getPoints()` | `[[0,0],[0,20],[100,20],[100,0]]`; with offset `−20`: `[[0,0],[0,−20],[100,−20],[100,0]]`; `setOffset(−30)` flips the extension lines to `y=−30` |
| `new DimensionLine(10,20,30,10,20,80,5)` | `isElevationDimensionLine()=true`, `getLength()=50`, `getPoints()=[[10,20],[10,25],[10,25],[10,20]]` |
| hit tests on `(0,0,100,0,20)` | `containsStartExtensionLinetAt(0,10,4)=true`, `isMiddlePointAt(50,20,4)=true`, `isMiddlePointAt(50,0,4)=false`, `isTopPointAt(50,20,4)=false`; on the elevation line `isTopPointAt`/`isBottomPointAt` succeed at `offset ∓ endMarkSize/2` and plan-only extension hit-test returns `false` |
| `LengthUnit.getMagnetizedLength` on MILLIMETER | `[5.3, 23.7, 61.2, 137.5, 300.4]` with `pixelLength=1` → `[5, 24, 61, 138, 300]`; the same raw `37.4` at `pixelLength ∈ {0.1, 0.5, 1, 2, 5}` → `[37.4, 37.5, 37, 37, 35]`, i.e. the grid coarsens exactly as predicted; `getStepSize()=0.5`, `getMinimumLength()=0.1`, `getMaximumLength()=100000`, `getMaximumElevation()=10000` |
| `LengthUnit.INCH.getMinimumLength()` | `0.3175` cm (= 0.125 in) |
| `installDefaultKeyboardActions` live source | maps `ENTER` and `Shift+Enter` to the same `ACTIVATE_EDITIION` action name (the `EDITIION` misspelling is confirmed present in the running build) |
| live DOM | `#dimension-line-dialog-template` present with fields `x-start-input … offset-input` and `style-panel`/`rendering-3D-panel`; `#level-dialog-template` also present |

Consequences for the Unknowns list: the elevation-constructor defaults and the tooltip-stub gap are
now **verified against the loaded application**, not merely inferred from source text. What remains
unverified is only the *human* end-to-end gesture (does Ctrl-click really reach that constructor in a
real session) and the non-default XML serialisation.

### 2.9 Browser edition (Sweet Home 3D JS) specifics

**Two keyboard routes, only one survives the port — keep them apart.** (a) *Dialog numeric entry*
(`JSSpinner` fields for X/Y/elevation/distance/offset in the dimension dialog) is fully present in
the JS build: `JSViewFactory.createDimensionLineView` is defined and builds all six spinners with
`lengthUnit.getFormat()` / `getStepSize()` (OBSERVED @ 2 544 868 ff.), and 7.2 explicitly shipped the
dialog to JS Online. (b) *In-plan tooltip typing after `ENTER`* is the feature that is missing, as
the next bullets show. The two are easy to conflate because the user guide's Online/Mobile caveat
sits in the walls keyboard-entry paragraph, not the dialog paragraph.

- 7.2 shipped "Modify dimensions dialog box, elevation dimensions, 3D handling option, shelves
  magnetism and preset postures choice" **to Sweet Home 3D JS Online** (OBSERVED `docs/history.txt`).
- The JS build carries the full controller/state machine — `DimensionLineCreationState`,
  `DimensionLineDrawingState`, `DimensionLineResizeState`, `DimensionLineOffsetState`,
  `DimensionLineHeightState`, `DimensionLineElevationState`, `DimensionLinePitchRotationState`,
  `getMeasuringDimensionLineAt`, `getDimensionLinesAlongWall`,
  `getTriangulationDimensionLines` — all found in `libjs/sweethome3d.min.js` (OBSERVED).
- The dialog is a DOM template with `JSSpinner`/`JSComboBox` widgets and the same
  `DimensionLinePanel.*` resource keys; the DOM template `dimension-line-dialog-template` is part of
  the page (OBSERVED round-1 `evidence/tmpl_dimension-line-dialog-template.html`; `JSDialog`
  creation @ 2 544 768). **Re-verified live in round 2**: the served
  `SweetHome3DJSOnline.jsp` page contains the complete `dimension-line-dialog-template` markup with
  every field (`x-start-input`, `y-start-input`, `elevation-start-input`, `x-end-input`,
  `y-end-input`, `distance-to-end-point-input`, `offset-input`, `length-font-size-input`,
  `color-button`) plus the `style-panel` and `rendering-3D-panel` groups, and the
  `level-dialog-template` alongside it — so the DOM template is genuinely shipped, not a round-1
  fetch artefact (OBSERVED, live DOM, §2.8b).
- **Gap:** `PlanComponent.prototype.setToolTipEditedProperties` is an empty stub in the JS build
  (OBSERVED @ 2 243 403), and the tooltip element is a plain `div` with visibility toggling rather
  than interactive inputs — consistent with the guide's "keyboard length/angle entry … not available
  in Online and Mobile versions" (DOCUMENTED, user guide) and with German guide §286–292, which
  documents the *mouse* creation flows but omits the keyboard step present in the desktop-only
  sections (OBSERVED `docs/de-userGuide.txt`).
- Hit-testing margins and magnetism are scale-aware in the JS build exactly as in Java
  (`getSelectionMargin`, `getIndicatorMargin`, both ÷ scale; OBSERVED @ 1 343 020 region), so touch
  targets are enlarged ×2/×3 by `View.PointerType.TOUCH` (OBSERVED).

## 3. Ideas for CasaPlazAI

Ranked by (value ÷ effort). Each is tied to the finding it comes from and, where relevant, to the
CasaPlazAI schema / editor-local keys.

1. **Hover-to-measure instead of freehand snapping (high value, medium effort).**
   Finding 2.2/2.6. While the dimension tool is armed, raycast the pointer against room polygon
   edges, then furniture footprints, and *preview* a measurement annotation for the nearest edge.
   A click accepts it. In CasaPlazAI the walls are the room polygon segments, so the priority list
   becomes: room segment → furniture footprint edge → free point. Preview lives in editor-local
   state; the committed annotation is written under the existing measurement-annotation storage key,
   never into `FloorplanData`.
   *Why it matters:* it makes "measure this wall" a one-click action and gives the same
   discoverability SH3D gets from its hover preview.

2. **Adaptive, zoom-aware length magnetisation on free points (high value, low effort).**
   Finding 2.2. Port the *idea* (not the code) of `getMagnetizedLength`: quantise the free length to
   a grid chosen from `2 × pixelLength` — metric ladder 0.5/1/5/10/100 cm, inch ladder
   1/8→6 in — and keep the raw value if the rounded value is 0 but the raw is > 0. Also snap the
   direction to 15° increments (SH3D uses 24 steps). This reuses the existing
   `casaplaza.snap.settings.v1` object for a master toggle, and needs no schema change.

3. **Click-driven creation with an explicit offset phase, plus a drag handle (high value, medium
   effort).** Finding 2.1/2.3. Model the tool as a small state machine: `armed → firstPoint →
   drawing → sizingExtensions → committed`. Build the preview annotation on the first pointer move
   after the first click; the next click enters `sizingExtensions` (cursor change, no geometry
   change) and pointer moves set the signed perpendicular offset (`ptLineDist × sign(relativeCCW)`);
   the following click commits. Once committed the annotation keeps a mid-segment handle that
   re-drags the offset with the same formula. `ESC` cancels back to `armed`; `ENTER` commits.
   In CasaPlazAI, "extension line length" is just a per-annotation `offset` number in editor-local
   state.

4. **Keyboard entry via an inline tooltip editor (medium-high value, medium effort).** Finding 2.4.
   The SH3D pattern of per-phase property sets — `["X","Y"]` → `["LENGTH","ANGLE"]` →
   `["OFFSET"]` — is directly portable: after `ENTER`, turn the hover tooltip into a focused input
   (one field active, `Tab`/`Enter` to step), parse with the current unit formatter, and clamp
   (`length ≥ 0.001`, `|X|,|Y| ≤ maximumLength`, angle in degrees). CasaPlazAI stores units as
   meters and has a single unit model, so a small `parseLength`/`formatLength` pair plus the same
   clamp constants is enough. This is *the* SH3D feature the browser edition lacks, so it is a
   differentiator if done well.

5. **Temporary dimensions during wall resize and room-vertex move (high value, low-medium effort).**
   Finding 2.6. When dragging a room vertex, draw three overlays — to the previous vertex, to the
   next vertex, and the diagonal to the penultimate vertex — so the user can triangulate by eye;
   when dragging a wall segment, show the gaps to the neighbouring parallel walls (SH3D's
   `±20/scale` offset and the "drop duplicates by equal length, drop < 0.01" rules are good
   defaults). These are transient React/Three overlays, never persisted. This is the single biggest
   precision win for a no-CAD audience and it costs no storage work.

6. **Elevation/height annotations as a second annotation kind (medium value, medium effort).**
   Finding 2.5. Represent a height annotation as a zero-footprint line with a vertical extent, so
   `isElevationDimensionLine`-style logic (`xStart===xEnd && yStart===yEnd && hStart!==hEnd`) falls
   out for free; render it as a two-circle symbol with a vertical extension line; when selected,
   show four handles (start elevation, height, offset, label pitch) and reuse the same drag code as
   idea 3. CasaPlazAI already has `wallHeight`, `openings[].sillHeight/headHeight` and per-room
   `wallsOverride[].height`, so height annotations are the natural way to *communicate* those.
   Keep them editor-local (annotations are explicitly out of `FloorplanData`).

7. **"Modify dimensions" panel with multi-select semantics (medium value, low effort).** Finding
   2.5/2.8. A double-click opens a small property panel (start/end coordinates, length, offset,
   colour, font size, visible-in-3D, plan vs elevation). Follow SH3D's rule: show a shared field
   only when all selected annotations agree, and **disable** rather than remove the derived
   `Distance between end points` field when more than one is selected (that is what the shipped
   dialog actually does — the 7.2 blog's "won't be shown" is imprecise; §2.4). This is a UI-only
   change over the annotation store.

8. **Whole-plan auto-dimensioning as a create-then-arrange workflow (medium value, medium effort
   now that the algorithm is known).** Finding 2.7. The recovered plug-in algorithm is small and
   directly portable: (a) for each wall, keep the room-polygon segments that lie on either wall side
   (1e-4 epsilon), make one annotation per segment at a 20-screen-px offset, drop `< 0.01` and exact
   duplicates; (b) optionally add a four-direction exterior chain 100 cm outside the wall bounding
   box, with projection points collected per side; (c) commit the whole list as **one** undoable
   edit on a *new* level/annotation layer rather than mutating the current one. Then let the user
   select a run of parallel dimensions and "distribute/align" them (the unsolved part the plug-in
   also punts on). For CasaPlazAI's axis-aligned room polygons the segment matching collapses to
   simply walking each room polygon's edges, so v1 is genuinely small; defer curved-wall radial
   dimensions.

9. **Schema hygiene for all of the above (low effort, high value as a constraint).** Findings 2.8,
   2.9 and the shared `casaplazai-schema.md`. Every item above stores its data under editor-local
   keys (`casaplaza.snap.settings.v1` for the magnetisation ladder toggle, the measurement-annotation
   key for the annotations themselves). Nothing enters `FloorplanData` v1; if a future version ever
   needs annotations in the interchange contract, it must go through
   `registerTransform(1, …)` + a `SCHEMA_VERSION` bump, never a silent field.

## 4. Unknowns

Round 1 had no Unknowns section, so this list is the delta of what round 2 could *not* close. Four
items that looked open at the start of round 2 — non-default XML serialisation, the AutoDimensioning
algorithm, the browser overlay rendering, and the elevation-modifier chain — were resolved and are
kept here only to record what remains untested within each. The genuinely open items are the
compile-time reason for the browser keyboard gap and a handful of presentation/runtime details.

- **Java-side source of the browser gap.** I confirmed live that
  `PlanComponent.prototype.setToolTipEditedProperties` is an empty stub and that
  `setToolTipEditedPropertyValue` is entirely undefined in the loaded 7.5.2 module (§2.8b), but the
  *compile-time* reason keyboard dimension entry is absent from JS Online (e.g. `@GwtIncompatible`, a
  Swing-only `PlanComponent`, or the tooltip DOM not supporting inputs) is not proven. (OBSERVED
  stub/absence; mechanism UNKNOWN.)
- **Only a literal human keypress for the elevation shortcut is untested.** The modifier → DOM
  event → boolean → `PlanController.duplicationActivatedLastMousePress` → state guard →
  elevation-constructor chain is fully traced in the shipped 7.5.2 code and the constructor's
  defaults were verified live (§2.5, §2.8b), but I did not synthesise a real
  `ctrl`/`option`-modified press on the GWT canvas (round 1 found synthetic canvas clicks
  unreliable). (OBSERVED full code path; the physical gesture UNKNOWN.)
- **Whether `EndMarkSize`, colour, pitch, `visibleIn3D` and `lengthStyle` are written to the `.sh3d`
  XML when non-default.** *Resolved in round 2* by reading the exporter class:
  `HomeXMLExporter$10.writeAttributes…DimensionLine` writes every field with write-if-non-default
  semantics (`elevationStart`/`elevationEnd` omitted when 0, `endMarkSize` omitted when 10, `pitch`
  omitted when 0, `visibleIn3D` omitted when false, always `color`/`offset`/coordinates/id/level),
  and `writeChildren` appends the generic property map and the `lengthStyle` text style. The sample
  homes simply have all-default values. What is *not* exercised is a round-trip of such a
  non-default file through the reader (the writer path is OBSERVED; round-trip UNTESTED).
- **AutoDimensioning internal algorithm.** *Resolved in round 2* by downloading the shipped
  `AutoDimensioning.sh3p` and reading its bundled Java source (GPL-2.0+; behaviour described in
  §2.7, no code copied): per-straight-wall room-path segment matching with a 1e-4 epsilon, duplicate
  and zero-length removal, a separate radial treatment for curved walls, and an opt-in
  four-direction exterior offset chain around the wall bounding box. What remains untested is the
  plug-in running inside a real plan (read from source; UNTESTED at runtime).
- **Desktop vs. Online behavioural diff for the temporary overlay helpers.** *Resolved in round 2:*
  the JS bundle contains the full overlay path (`PlanComponent.paintComponent` → `paintDimensionLines`
  when `dimensionLinesFeedback != null`, plus the `DraggedItemsFeedback` variant), including the
  elevation-ray branch, so the wall-resize / furniture-move / room-point overlays are compiled into
  the browser edition and gated only by the `feedbackDisplayed` viewer preference. What I did not do
  is drive a real drag far enough to watch one render (code path OBSERVED; visual confirmation
  UNTESTED).
- **No numeric "default offset when free-drawing"**. Free drawing starts with offset 0 by
  construction; hover-assisted drawing passes `20/scale`. Whether the dialog then shows a
  rounded/quantised value to the user is unverified (OBSERVED mechanism; UNKNOWN presentation).
- **Whether the live app had a home loaded during probing.** `window.application.homes` was empty at
  probe time (the page shows the home-selection start screen), so all live object probes used
  freshly constructed `Home()`/`UserPreferences()`/`DimensionLineController` instances rather than a
  user-edited document. The class behaviour is unaffected, but no real `.sh3d` document was exercised
  (OBSERVED empty homes list; limitation, not a contradiction).
