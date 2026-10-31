# Sweet Home 3D — Magnetism, Alignment & Length Entry (deep dive, round 2)

Job folder: `rea2-sh3d-p1/10-03b-walls-rooms-drawing-magnetis`
Research date: 2026-10-31 (start 15:40, finalised 16:28) · REA v6.8.0 · target: Sweet Home 3D (vendor DE page https://www.sweethome3d.com/de/, browser edition https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — shipped bundle v7.5.2; desktop docs v7.5).
Round-1 broad report reused read-only: `rea-sweethome3d-2026-10/03-03-walls-rooms-drawing/report.md` (its 15° snap, length rounding, ⌘/Alt bypass, Enter-in-desktop facts are not re-derived here; this report closes its Unknown #1, #4, #8 and deepens the algorithms).

**Claim tags**
- **OBSERVED** — I drove the live online app or read the shipped files myself; evidence file under this folder given.
- **DOCUMENTED** — vendor user guide / release history / tips page (URL given).
- **SOURCE-VERIFIED** — read in the published GPL bundle (`sweethome3d.min.js` v7.5.2) or its generated source; behaviour described in my own words, no code copied.
- **INFERRED** — my reconstruction, not stated by the vendor.

---

## 1. Summary (5 bullets)

1. **Angle step = exactly 15° (24-step circle), applied by re-projecting the point onto the nearest ray, then rounding the resulting *length* through the length-unit magnetiser.** There are only two angle families in the whole plan editor: the **15° family** for walls/rooms/dimension lines and for Shift-alignment *while drawing*, and a **90° family** used when Shift aligns *moved objects and text/area offsets*. **(OBSERVED `out/probe_magnetism_api.json`, `out/probe_live_api_draw3.json`; SOURCE-VERIFIED `evidence/extract_magnetism_classes.txt`, `extract_length_and_angle_magnetism.txt`)**
2. **Length rounding is display-scale-aware, not a fixed grid.** The rule is `getMagnetizedLength(value, pixelLength)` where `pixelLength = 1/scale` in cm; the step is chosen from `pixelLength*2` against two ladders — metric **0.1 / 0.5 / 1 / 5 / 10 / 100 cm**, imperial **⅛ / ¼ / ½ / 1 / 3 / 6 in**. At the JS Online *default* plan scale 0.5 the step is **1 cm**; the finest 0.1 cm step is reached at max zoom. This corrects the round-1 phrasing ("1 cm…100 cm metric" was right, but the **0.1 cm** bottom step and the **0.5 cm** tier that make the ladder continuous were under-specified). **(OBSERVED `out/probe_magnetism_api.json` stepModel mismatches `0`; `out/probe_live_api_draw3.json`; SOURCE-VERIFIED)**
3. **Three distinct modifier mechanisms, all OS-branched.** Shift = alignment (never magnetism); on Windows **Alt** and on macOS **⌘ Meta** = *temporary magnetism bypass*, XORed against the preference and sampled at mouse-press; on Linux the bypass is **Shift+Alt together** (matching the guide). Duplication (Ctrl on Win/Linux, Alt on macOS) is a different key from the bypass on every platform, so the two features never collide. **(OBSERVED + SOURCE-VERIFIED `evidence/extract_keyboard_map.txt`)**
4. **Shift-alignment *while drawing* replaces the magnetism path entirely and uses the 15° family** — it is not additive. Round-1's puzzling "tooltip −15° vs geometry −60°" is explained by a **documented-by-source tooltip-vs-geometry divergence**: the side tooltip is computed from the *committed wall* (and, when the wall is joined at start, reports the angle **relative to the previous wall**), whereas the cursor point went through a different magnet. When Shift moves *existing objects or labels* it instead uses a **90° family** (horizontal/vertical alignment). **(OBSERVED `out/probe_live_interaction.json` shiftAlign; SOURCE-VERIFIED `getWallAngleInDegrees` + `WallDrawingState.moveMouse`; closes round-1 Unknown #1)**
5. **Keyboard length/angle entry is a real, fully-specified desktop feature that the web build shipped as no-ops.** The desktop map binds Enter (plus OS-modifier+Enter) to *activate edition*, the drawing states publish editable property tuples — walls before first point `X,Y`; wall in progress `LENGTH,ANGLE,THICKNESS`; arc in progress `ARC_EXTENT`; rooms `X,Y` → `LENGTH,DIAGONAL,ANGLE` → `LENGTH,ANGLE`; dimension lines `X,Y` → `OFFSET` → `LENGTH,ANGLE`; polylines `LENGTH,ANGLE` — with documented clamps, but the bundle's tooltip methods `setToolTipEditedProperties` / `setToolTipEditedPropertyValue` are **empty/undefined stubs**. **(OBSERVED `out/probe_live_interaction.json` enter; SOURCE-VERIFIED `evidence/extract_wall_drawing_state.txt`; closes round-1 Unknown #4)**

---

## 2. Findings

### 2.1 The exact angle snap algorithm (15° family)

**SOURCE-VERIFIED** (`evidence/extract_magnetism_classes.txt`, class `PlanController.PointWithAngleMagnetism`, constant `CIRCLE_STEPS_15_DEG = 24`). My reconstruction of the shipped algorithm:

1. Special cases first:
   * If the point is exactly horizontal/vertical relative to the start (`x==xStart` or `y==yStart`), only the *other* coordinate is rounded: `getMagnetizedLength(|Δ|, pixelLength)` is applied along that axis and the sign is preserved.
2. Otherwise:
   * `step = 2π / CIRCLE_STEPS` (CIRCLE_STEPS = 24 → 15°; the constructor also accepts an explicit step count, **4** is passed by the Shift-alignment/point-drag call sites → 90°).
   * `raw = atan2(Δy, Δx)`, `lower = floor(raw/step)*step`, `upper = lower + step`.
   * It computes **both** candidate rays and picks the one that is *closer in the "other" coordinate* (i.e. it compares the horizontal distance to the vertical ray vs. the vertical distance to the horizontal ray), not simply the closer angle. This is a "nearest edge" projection, so that a nearly-axis-aligned drag keeps the long axis intact.
   * Finally the length from the origin to the projected point is passed through `lengthUnit.getMagnetizedLength(distance, pixelLength)` and the point is rebuilt as `origin + length·(cos θ, −sin θ)`; `θ` is exposed as `getAngle()`.

**OBSERVED confirmation of the 15° grid** (`out/probe_live_api_draw3.json`, live JS Online, unit = cm, plan scale 0.5 → pixelLength 2 cm), drawing from (0,0) toward a target at radius 300 cm:

| raw angle | snapped | resulting length (cm) |
|---|---|---|
| 7° | 0° | 298 |
| 14.9° | −15° | 298 |
| 22° | −15° | 288 |
| 37° | −30° | 277 |
| 44° | −45° | 295 |
| 52° | −60° | 273 |
| 82° | −90° | 297 |
| 97° | −90° | 298 |
| 112° | −105° | 288 |
| −20° | +15° | 292 |
| −37° | +30° | 277 |

Note the sign convention: SH3D's model Y axis points **up**, so my screen-space `atan2(−Δy,Δx)` reports the mathematical sign correctly; the app's internal `angle` uses the same convention.

**OBSERVED** pure-function sweep (`out/probe_magnetism_api.json`, calling `PlanController.PointWithAngleMagnetism` directly with pixelLength 1 cm): 3°→0°, 8°→0°, 15.1°→−15°, 30°→−30°, 46°→−45°, 67°→−75°, 112°→−105°, 179°→−180°, −44°→+45°. Every output is a multiple of 15°; half-open interval behaviour means 14.9° rounds to −15° because the "nearest edge" tie-break pushes across the axis.

**OBSERVED** `CIRCLE_STEPS_15_DEG` is reachable at runtime (`window.PlanController.PointWithAngleMagnetism`), which is how I could exercise the algorithm without synthetic mouse events.

**OBSERVED full 1° sweep, −180°…179° at radius 300 cm, pixelLength 1 cm** (`out/probe_angle_sweep.json`):
* **Every one of the 360 outputs is an exact multiple of 15°** (0 non-multiples) — the grid is exact, not approximate.
* The distinct output set has **26 values: −180, −165, …, 180, 195** — note **195°**, i.e. the raw magnet angle is **not normalised to (−180°, 180°]**. The wall tooltip path re-normalises (`getWallAngleInDegrees` subtracts 360 when >180), so this leaks to UI only if a re-implementation reuses `getAngle()` raw. **(OBSERVED)**
* The snapped **length is not the pointer radius.** The algorithm builds an intermediate point from the horizontal/vertical offsets to the two adjacent rays and magnetises *that* distance, so at a 300 cm pointer radius the committed length ranged **241–300 cm** (up to ~20 % short); at 37° raw 300 cm it committed **277 cm**, and at raw 425.7 cm it committed 393 cm. A naive `rotate to nearest 15°` would preserve the radius and therefore feel different (it would keep the wall longer). This is the strongest argument for copying the *projection* rule, not just the step. **(OBSERVED `out/probe_angle_sweep.json`, `out/probe_live_api_draw3.json`)**
* Worked example from the live commit at 37°, radius 300 cm: committed end point **(239.889, 138.500)** ⇒ angle exactly −30°, length 277.0 cm — the x offset was kept and y was re-solved onto the ray, then the distance re-magnetised.

**Where the two families are used** (SOURCE-VERIFIED):
* 15° family: `WallDrawingState.moveMouse` (via `WallPointWithAngleMagnetism`), `WallCreationState.moveMouse`, `RoomCreationState`/`RoomDrawingState` (via `RoomPointWithAngleMagnetism`, 15° default), dimension-line creation, wall *resize* (`getResizedWallStartAt`/`getResizedWallEndAt`), arc-extent state.
* 90° family (explicit 4th/7th arg = 4): `SelectionMoveState.moveMouse` (moving objects), room-name offset drag, room-area offset drag, piece-of-furniture name offset drag, and — importantly — **any state with `alignmentActivated == true`** uses the *base* `PointWithAngleMagnetism` **without** an explicit step count, i.e. the 15° family, not 90°. My direct test of a 4-step instance gave 3°→0°, 37°→0° (length 240!), 46°→−90°, 135°→−180° (`out/probe_magnetism_api.json` `fourStep`), confirming it is a true 90° grid.

### 2.2 The exact length-rounding algorithm (per unit and per zoom)

**SOURCE-VERIFIED** `evidence/extract_length_and_angle_magnetism.txt`; the function is `LengthUnit.getMagnetizedMeterLength(d, a)` where `d` = length in cm and `a` = `view.getPixelLength()` in cm.

```
a = a * 2                      // the "2×" is the key: the on-screen target is 2 pixels
step = 0.1
if a > 100 : step = 100
elif a > 10 : step = 10
elif a > 5  : step = 5
elif a > 1  : step = 1
elif a > 0.5: step = 0.5
c = round(d/step)*step
return (c == 0 && d > 0) ? d : c     // never collapse a non-zero length to 0
```

Imperial variant `getMagnetizedInchLength` converts the pixel length to inches first (`centimeterToInch(a)*2`) and uses steps **6 / 3 / 1 / 0.5 / 0.25 / 0.125 in**; the result is converted back to cm. Six units delegate to these two (`MILLIMETER`, `CENTIMETER`, `METER` → meter ladder; `INCH`, `INCH_FRACTION`, `INCH_DECIMALS`, `FOOT_DECIMALS` → inch ladder).

**OBSERVED** (`out/probe_magnetism_api.json`):
* `stepModel` re-implementation of the ladder matched the shipped function on **every** probe (mismatches = 0) over pixelLengths 0.2…500 cm and values 0.3…999.9 cm.
* Metric outputs at pixelLength 1 cm (scale 1 ⇒ `2·pixelLength = 2 > 1` ⇒ **1 cm step**): 123.4→123, 124.6→125, 87.3→87, 211.1→211.
* Metric at pixelLength 10 cm (scale 0.1): 123.4→120, 124.6→120, 87.3→90, 211.1→210 (10 cm step).
* Metric at pixelLength 100 cm (scale 0.01, the minimum zoom): everything snaps to hundreds (123.4→100, 211.1→200).
* Imperial at pixelLength 5 cm: 25→22.86, 40→38.1, 60→60.96, 100→99.06, 175→175.26 (≈1 in steps); at pixelLength 10 cm it jumps to 3-in steps (30.48/45.72/60.96/106.68/167.64).
* **Active step vs `pixelLength`** (derived from the strict `>` ladder plus the live zoom run): `pixelLength ≤ 0.25 cm → 0.1`; `≤ 0.5 → 0.5`; `≤ 2.5 → 1`; `≤ 5 → 5`; `≤ 50 → 10`; `> 50 → 100` (cm). The step therefore becomes *finer* as you zoom in, and at the app's max zoom (scale 10, pixelLength 0.1 cm) it reaches its 0.1 cm floor. The live run shows the two ends: scale 2 (pixelLength 0.5 cm, 0.5 cm step) committed **392.5**; scale 5 (pixelLength 0.2 cm, 0.1 cm step) and scale 10 (pixelLength 0.1 cm) both committed **392.6**. (392.5 is also a valid 0.1-step value, so the 392.5→392.6 shift between scale 2 and scale 5 is the observable evidence for the step change at `pixelLength = 0.25 cm`.)

**OBSERVED live, zoom-dependent wall length** (`out/probe_live_api_draw3.json`; target raw length 425.7 cm at 37°, unit cm, magnetism on):

| plan scale | pixelLength (cm) | resulting wall length (cm) | step implied |
|---|---|---|---|
| 0.1 | 10 | 390 | 10 |
| 0.2 | 5 | 395 | 5 |
| 0.5 | 2 | 393 | 1 |
| 1 | 1 | 393 | 1 |
| 2 | 0.5 | 392.5 | 0.5 |
| 5 | 0.2 | 392.6 | 0.1 |
| 10 | 0.1 | 392.6 | 0.1 |
| 20 | 0.05 | 392.6 | 0.1 |

Zoom range: `getMinimumScale()=0.01`, `getMaximumScale()=10`; toolbar zoom steps multiply the scale by **1.5** (`zoomIn`/`zoomOut`, SOURCE-VERIFIED). So the coarsest magnet at default zoom 0.5 is 1 cm and the finest, at max zoom 10, is 0.1 cm. The practical consequence: **a user who zooms out gets coarse snapping automatically, with no setting to change.**

**OBSERVED** the funnel is *not* applied to wall thickness: with magnetism on, thickness stayed at the default 7.5 cm (a non-magnetised value) in every draw, matching SOURCE-VERIFIED code that only calls `getMagnetizedLength` for furniture dims/elevations, polyline thickness, compass diameter, dimension-line lengths, and drawing points — not for `Wall.thickness`.

### 2.3 Shift alignment — semantics, priority, and what it actually snaps to

**SOURCE-VERIFIED.** `WallDrawingState.moveMouse` is a strict either/or:

```
if (alignmentActivated)  point = new PointWithAngleMagnetism(xStart,yStart, mouseX,mouseY, unit, pixelLength)   // 15° grid
else if (magnetismEnabled) point = new WallPointWithAngleMagnetism(...)                                        // 15° grid + wall/room-point proximity
else point = raw mouse
```

So **Shift does not add alignment lines on top of magnetism — it swaps the magnetism implementation**. Two consequences that differ from the vendor's "to help you draw parallel walls… alignment lines" wording:
1. Shift-alignment keeps the 15° angle clamp but drops the wall/room-point proximity magnet (`WallPointWithAngleMagnetism` is what snaps onto existing endpoints/room points).
2. `PointWithAngleMagnetism` has **no reference geometry at all**, so it cannot "align to a nearby arbitrary wall". It can only produce a 15°-multiple ray through the chain's start point. Because one draws chains start-to-end, the *previous* wall is usually itself on the 15° grid, so a parallel ray from the chain start does come out parallel to it — which is why the feature reads as "parallel walls" in practice, while having no notion of "the wall I am nearest to".

**OBSERVED** (`out/probe_live_interaction.json`, live Shift held mid-chain, target 37° off a vertical previous wall): the resulting segment came back at **−30°** with length 277 cm — i.e. the 15° family, not the raw 37°. Round-1 saw the same effect (`probe_interaction2.json`: geometry `angleDeg −60`, tooltip `Angle: −15°`, length 200). The divergence is now explained by two separate facts, both source-verified:
* `getToolTipFeedbackText` → `getWallAngleInDegrees(wall)` reports the angle **relative to `wall.getWallAtStart()`** when the wall is joined at start (pure trigonometric difference of the two directions, normalised to ≤180°), not the absolute model angle; only an unjoined chain start reports the absolute `atan2` angle. I verified this live (`out/probe_angle_tooltip.json`): a chained wall whose absolute angle is −30° reported `relativeDeg −30°`, and an unjoined wall at absolute −60° reported `−60°`. So a joined non-magnetised wall can show an angle that looks unrelated to the drawing direction.
* the *geometry* is whatever the active magnet produced; the tooltip never reads the magnet's output point, only the committed wall, so any time the two disagree the tooltip is stale by a frame.

Round-1 Unknown #1 is therefore resolved as a **tooltip-relative-angle + stale-tooltip interaction**, not an "align to nearby wall" feature.

**OBSERVED** the same either/or trivially in the direct API run (`out/probe_live_api_draw3.json`): `magnetOFF_alignON_37` → −30°, length 277 — identical to `magnetON_alignON_37`, i.e. alignment alone produces the 15° snap regardless of the magnetism preference.

**SOURCE-VERIFIED** the point-drag / object-move flavour uses the 90° family: `SelectionMoveState`, `PieceOfFurnitureNameOffsetState`, `RoomNameOffsetState`, `RoomAreaOffsetState` all construct `PointWithAngleMagnetism(..., 4)` and only when `alignmentActivated`. This is exactly the documented "Used the Shift key to keep objects moved… aligned along horizontal or vertical axis" (release history v4.0, https://www.sweethome3d.com/history.jsp). It means **Shift means two different things in two contexts**: 15°-family alignment while drawing walls/rooms, 90°-family alignment while moving/labelling.

### 2.4 Magnetism bypass modifiers — the authoritative key matrix

**SOURCE-VERIFIED** `evidence/extract_keyboard_map.txt`. Two key maps exist (`HomeComponent3D.installKeyboardActions` for the 3D pane and `PlanComponent.installDefaultKeyboardActions` for the plan pane) and they agree:

| OS | magnetism bypass (press/release) | duplication modifier | Shift |
|---|---|---|---|
| Windows | **Alt** (plus Shift+Alt, Ctrl+Alt, Shift+Ctrl+Alt) | Ctrl | alignment (plus Ctrl+Shift / Alt+Shift) |
| macOS | **⌘ Meta** (plus Shift+Meta, Alt+Meta, Shift+Alt+Meta) | **Alt** | alignment (plus Alt+Shift / Meta+Shift) |
| Linux (else branch) | **Shift+Alt** (also via `alt shift pressed SHIFT`; plus Ctrl+Shift+Alt) | Ctrl | alignment (plus Ctrl+Shift; the else-branch also maps `shift released ALT` → ACTIVATE_ALIGNMENT) |

The action performed is `toggleMagnetism(true/false)` → `state.magnetismEnabled = preferences.isMagnetismEnabled() !== arg` — i.e. **the key toggles the preference, it does not force magnetism off**. Holding Alt/⌘ while the preference is *off* therefore turns magnetism **on**, which is the natural reading of a "toggle" but worth noting for a re-implementation. The key state is captured at mouse **press** (`wasMagnetismToggledLastMousePress`) and re-applied on each mouse move, so it is a per-gesture override, not a global switch.

**OBSERVED the magnet is all-or-nothing:** with magnetism off and no Shift, the drawn wall is the *raw* pointer vector — `magnetOFF_37` committed angle **−37°** and length **300.0 cm** for a 300 cm pointer (`out/probe_live_api_draw3.json`). So the bypass disables **both** the 15° angle snap and the length rounding at once; there is no "snap angle but keep exact length" mode. A re-implementation that wants that split must add it deliberately.

**OBSERVED negative** (`out/probe_live_interaction.json` `metaBypass`): my Playwright `keyboard.down('Meta')` did not reach the canvas (headless focus), so I could not re-confirm the ⌘ bypass live; round-1 did confirm it with `probe_interaction2.mjs`. I record it here as round-1 OBSERVED, SOURCE-VERIFIED by me.

**DOCUMENTED** the guide says "Alt under Windows, cmd under macOS or Shift + Alt under Linux" (https://www.sweethome3d.com/userGuide.jsp §Drawing walls; DE §424 identical) — consistent with the key map, no contradiction. Round-1 Unknown #8 (Linux not executed) remains not executed here; the source binding is now explicit.

**OBSERVED** the preference itself: `preferences.isMagnetismEnabled() === true` by default (`out/probe_live_api_draw3.json` prefs; `out/probe_live_interaction.json` viewInfo). The preference is toggled from the toolbar button and the preferences dialog (round-1 OBSERVED `magnetismCheckBox`, `enableDisableMagnetismButton`). Note the preference is a **boolean only** — there is no user-facing "snap strength" or angle-step setting; the magnet's granularity is entirely derived from scale.

**Unit-ladder parity** (OBSERVED `out/probe_edition_units.json` `unitLadders`; `getMagnetizedLength(v, 2)` = pixelLength 2 cm ⇒ 1 cm metric / 1 in imperial tier):

| unit | 123.4 | 124.6 | 87.3 | min length | spinner step |
|---|---|---|---|---|---|
| cm / mm / m | 123 | 125 | 87 | 0.1 cm | 0.5 cm |
| inch / inch-fraction / inch-decimals / foot-decimals | 124.46 | 124.46 | 86.36 | 0.3175 cm = ⅛ in | 0.3175 cm = ⅛ in |

The three imperial display units share one magnetiser and one ⅛-in minimum/step; the metric units share the meter ladder. **The unit *format* changes but the *magnetised value* is identical across all imperial variants** — a useful simplification to copy.

### 2.5 Keyboard length/angle entry (Enter) — full editable-property grammar

**SOURCE-VERIFIED** `evidence/extract_keyboard_map.txt` (key map) and `evidence/extract_wall_drawing_state.txt` (state handlers).

Desktop plan-pane map: `pressed ENTER → ACTIVATE_EDITIION`, `shift pressed ENTER → ACTIVATE_EDITIION`; `alt pressed ENTER` (macOS), `control pressed ENTER` (Win/Linux), `alt shift pressed ENTER` (Linux) also activate. A separate `installEditionKeyboardActions` map binds `ENTER → DEACTIVATE_EDITIION`, so Enter opens *and* commits the inline editor. (Note the vendor's own misspelling `EDITIION` in the shipped code.)

`ACTIVATE_EDITIION → setEditionActivated(true)` on the active drawing state, which publishes a `(names[], values[], x, y)` tuple to `PlanView.setToolTipEditedProperties(...)`. The full grammar:

| Context | Editable properties (in order) |
|---|---|
| Wall, before first point | `X`, `Y` |
| Wall in progress | `LENGTH`, `ANGLE`, `THICKNESS` |
| Round wall in progress | `ARC_EXTENT` |
| Room, before first point | `X`, `Y` |
| Room, current side (≥3 points) | `LENGTH`, `DIAGONAL`, `ANGLE` |
| Room, current side (2 points) | `LENGTH`, `ANGLE` |
| Dimension line, before first point | `X`, `Y` |
| Dimension line (offset phase) | `OFFSET` |
| Dimension line in progress | `LENGTH`, `ANGLE` |
| Polyline in progress | `LENGTH`, `ANGLE` |

Clamps and formulas applied by `updateEditableProperty`:
* **LENGTH**: `max(0.001 cm, min(value, unitMaximumLength))` (max = 100000 cm metric, 3280 ft imperial); the point is placed at the typed distance **along the current direction** (`π − atan2(...)`), joined walls keep the reference-wall direction.
* **ANGLE**: typed degrees → radians; subtracted from the reference wall's direction when the wall is joined at start, so the entered angle is relative to the previous wall, not to model north.
* **THICKNESS**: `max(0.01, min(|value|, 1000))` cm.
* **ARC_EXTENT**: sign-preserving clamp to ±3π/2 (270°).
* **DIAGONAL** (rooms only): only accepted if `side ≤ diagonal ≤ side+previousSide`, then re-solved via the law of cosines; the app responds by pushing a recomputed `ANGLE` back into the tooltip (`setToolTipEditedPropertyValue("DIAGONAL"/"ANGLE", …)`).
* **X / Y**: clamped to ±`maximumLength`.

**OBSERVED** in the browser edition (`out/probe_live_interaction.json` `enter`, `out/probe_edition_units.json` `edition`): pressing Enter mid-draw left the plain HTML tooltip unchanged (`Length: 346 cm<br>Angle: −30°<br>Thickness: 7.5 cm`), and no input element appeared even after calling `pc.setEditionActivated(true)` directly. `PlanComponent.prototype.setToolTipEditedProperties` is a **function with an empty body** (`function(c,b,a,d){}`) and `setToolTipEditedPropertyValue` is **undefined** (`typeof === "undefined"`), while the three room-state call sites still invoke it. This matches the guide's "(feature not available in Online and Mobile versions)" and is a **deliberate omission in the web build's view layer**, not a transport limitation.

**OBSERVED — the web build's *model* API for typed entry is fully live** (`out/probe_edition_units.json` `propUpdate`, driving `PlanController.updateEditableProperty` from JS while a wall is in progress at 300 cm / 0°):

| call | result |
|---|---|
| `updateEditableProperty('LENGTH', 450)` | wall length 300 → **450.0 cm**, end moves to (450, 0) |
| `updateEditableProperty('ANGLE', 90)` | wall rotates to **90°**, end (0, −450), length preserved |
| `updateEditableProperty('THICKNESS', 12.3)` | thickness = **12.3 cm** |
| `updateEditableProperty('ARC_EXTENT', 400)` | clamped to **270°** (as designed) |

So SH3D's web edition already ships the *engine* for keyboard length/angle entry — only the inline editor widget is stubbed. That materially lowers the effort estimate for Idea #4 below (CasaPlazAI already has no such gap to bridge beyond its own UI).

**DOCUMENTED** (User Guide §Drawing walls): "You may also enter the length and the angle of the wall being created after pressing the enter key (feature not available in Online and Mobile versions)." German identical (§418). Round-1 Unknown #4 is now **SOURCE-VERIFIED on the desktop path** (key map + state handlers + clamps all present and wired) and **OBSERVED absent on the web path** (stubs).

### 2.6 Point magnetism (a fourth, separate mechanism)

**SOURCE-VERIFIED** `evidence/extract_magnetism_classes.txt`, class `PointMagnetizedToClosestWallOrRoomPoint`: gathers all free-space path points from walls and all points of detectable rooms on the active level, picks the nearest within `getSelectionMargin() = PIXEL_MARGIN(4 px, ×2 for touch)/scale`, and sets `magnetized = true` only if within that radius. It is used for the *first* click in `RoomCreationState`/`RoomDrawingState` and for wall start/end joining. It is independent of both the angle magnet and the length magnet, and its tolerance in model units therefore also **scales with zoom**. **(OBSERVED** indirectly: room-drawing start points snapped onto wall faces in round-1's `probe_room_points.json`.)

### 2.7 What is *not* magnetised (useful negative space)

* **Wall thickness** — see 2.2 (OBSERVED, thickness stayed 7.5 cm).
* **Arc extent** — rounding happens only if `alignmentActivated || magnetismEnabled`, and then it is rounded to **whole degrees**, not to a 15° multiple: `round(deg) * π/180` (SOURCE-VERIFIED `WallDrawingState.moveMouse`, lines ~68914–68925).
* **Furniture rotation by drag** — the guide (DOCUMENTED §Editing furniture, https://www.sweethome3d.com/userGuide.jsp line 453) says "Hold Alt key to toggle the 15° magnetism applied during rotation", and the release history v4.0 confirms Alt became the magnetism key; rotation states reuse the same 15° family via the shared magnet class.
* **Wall angle feedback (the little angle arc)** — `showWallAngleFeedback` is pure display, no snapping.

### 2.8 Evidence inventory (all inside this job folder)

| File | What it proves |
|---|---|
| `evidence/sh3d.pretty.js` | de-minified (my own crude formatter, `scripts/fmt.py`) copy of the shipped bundle for line-addressable reading; source is GPL, no code copied into the report |
| `evidence/extract_magnetism_classes.txt` | `PointWithAngleMagnetism`, `WallPointWithAngleMagnetism`, `RoomPointWithAngleMagnetism`, `PointMagnetizedToClosestWallOrRoomPoint` bodies |
| `evidence/extract_length_and_angle_magnetism.txt` | `getMagnetizedMeterLength` / `getMagnetizedInchLength` ladders and the angle-snap constructor |
| `evidence/extract_wall_drawing_state.txt` | `WallDrawingState` enter/move + `updateEditableProperty` clamps (LENGTH/ANGLE/THICKNESS/ARC_EXTENT) |
| `evidence/extract_keyboard_map.txt` | OS key matrices for magnetism bypass, alignment, duplication, Enter edition |
| `evidence/extract_PointWithAngleMagnetism.txt` | raw minified region, for traceability |
| `out/probe_magnetism_api.json` | direct-object sweep: 15° grid, 4-step (90°) grid, metric/imperial ladders, step model match, pixelLength-length coupling |
| `out/probe_angle_sweep.json` | full −180°…179° 1°-step sweep: 360/360 outputs on the exact 15° grid, 26 distinct values incl. 195°, committed length 241–300 cm at radius 300 |
| `out/probe_live_api_draw3.json` | live controller-API draws: 15° snap table, magnetism on/off, alignment-only, zoom→length table |
| `out/probe_live_interaction.json` | live synthetic-mouse runs: tooltip text, Shift run, Enter no-op, view/scale/unit facts |
| `out/probe_edition_units.json` | live `updateEditableProperty` results (LENGTH/ANGLE/THICKNESS/ARC_EXTENT), empty view-layer stubs, unit-ladder parity table |
| `out/probe_angle_tooltip.json` | tooltip angle is absolute only for unjoined chains, relative to `wallAtStart` when joined |
| `out/probe_live_api_draw.json`, `out/probe_live_api_draw2.json` | superseded runs (polarity/sequence bugs documented here so the negative results are traceable) |
| `scripts/fmt.py`, `scripts/probe_magnetism_api.mjs`, `scripts/probe_angle_sweep.mjs`, `scripts/probe_live_api_draw*.mjs`, `scripts/probe_live_interaction.mjs`, `scripts/probe_edition_units.mjs` | reproducible inputs |

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

| # | Idea | Tied to finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Replace the fixed 0.5 m grid snap with a zoom-aware two-tier magnet.** Keep a coarse tier (0.5 m or 1 m) *plus* a fine tier that follows on-screen scale, modelled on SH3D's ladder (step chosen from `2 × cm-per-pixel`: 0.1/0.5/1/5/10/100 cm metric, ⅛/¼/½/1/3/6 in imperial). Users fighting a 0.5 m grid is the single biggest precision complaint a floorplanner gets. | 2.2 | High | Low — pure function over existing snap code; add a "snap strength" setting |
| 2 | **Make angle snap and length snap independent, and let the length snap always apply.** CasaPlazAI's schema (walls with `length`/`angle`) can store full precision; snapping is display-only. Apply 15° (or 24-step) angle families and a separate length rounding so a 4.37 m wall is one drag, not 9 grid cells. | 2.1, 2.2 | High | Low |
| 3 | **Add a "nearest edge" angle projection, not just nearest angle.** SH3D builds an intermediate point from the mouse's horizontal/vertical offset to the two adjacent rays and re-magnetises *that* distance onto the chosen ray, which is why an almost-axis-aligned drag keeps its long axis and why the committed length can be up to ~20 % shorter than the pointer radius. A naive `round(angle/15)*15` preserves the radius and gives visibly different (longer) walls on long diagonals. | 2.1 | Med-High | Low — a few lines, but materially better feel |
| 4 | **Implement Enter-to-type length/angle as a web-first differentiator.** The competitor's web build ships this as an empty stub *in the view layer only* — its model-side `updateEditableProperty('LENGTH'/'ANGLE'/'THICKNESS'/'ARC_EXTENT', v)` works and applies the documented clamps (I drove it live). So the grammar is fully specified (walls `LENGTH,ANGLE,THICKNESS`, `X,Y`, `ARC_EXTENT`; rooms `X,Y` → `LENGTH,DIAGONAL,ANGLE` → `LENGTH,ANGLE`), and the remaining work is a small inline editor next to the cursor-following tooltip: Tab cycles fields, Enter commits, Escape cancels. Map onto the plan schema's wall `length`/`angle`/`thickness`. | 2.5 | High — visible win over the competitor's *web* edition | Med |
| 5 | **Adopt the exact modifier contract, OS-aware and sampled at pointer-down.** Shift = alignment only; ⌘ (macOS) / Alt (Win/Linux Ctrl conventions) = temporary magnetism bypass *XOR*ed with the preference; a second key duplicates. Sampling at press (not during the drag) is what makes it predictable. | 2.3, 2.4 | Med-High | Low-Med |
| 6 | **Make Shift-alignment explicit about what it aligns *to*.** SH3D effectively only aligns along axes through the current chain start, which is why "align to previous wall" works only through the chain. CasaPlazAI can do better cheaply: while Shift is held, sort nearby wall directions and snap the ray to the nearest one (with the chain start as fallback), and draw the guide line. | 2.3 | Med-High | Med |
| 7 | **Never let the tooltip disagree with the geometry.** SH3D computes the angle tooltip from the committed wall while the cursor went through a different magnet, producing the contradictory readout I reproduced. CasaPlazAI should render the tooltip from the *same* snapped point that will be committed. | 2.3 | Med (trust/polish) | Low |
| 8 | **Zoom-adaptive proximity tolerance for point/edge snapping.** SH3D's wall/room-point magnet tolerance is `4 px / scale`, so it is constant *on screen*; a fixed model-unit tolerance feels sticky when zoomed out and dead when zoomed in. | 2.6 | Med | Low |
| 9 | **Round whole degrees for arc extent and offer 15°-family angle entries** — arc snapping is `round(deg)` when magnetism is on, not a 15° multiple; keep that distinction so curved walls can be placed at any degree. | 2.7 | Low-Med | Low |
| 10 | **Expose a "magnetism" toggle separate from alignment, in the tool card**, plus a keyboard bypass hint that names the OS key. SH3D has both but buries the modifier keys in the guide; surfacing "hold ⌘/Alt to ignore snapping" in the tool card is nearly free and removes the discovery problem. | 2.4 | Med | Low |
| 11 | **Imperial/metric ladder parity.** If CasaPlazAI ever supports feet/inches, use the same coarse-to-fine ladder (fractions ⅛→6 in) rather than a single imperial step; the metric and imperial paths differ in both step values and unit of rounding, and users notice. | 2.2 | Low-Med | Low |
| 12 | **Constrain entry validation the way SH3D does** (thickness 0.01–1000 cm, arc ±270°, room diagonal only when `side ≤ d ≤ side+prevSide`) and echo the solved third value back into the field — a cheap way to make typed input feel robust. | 2.5 | Med | Low-Med |

---

## 4. Unknowns

1. **Linux Shift+Alt bypass not executed live.** The shipped key map binds it and the guide documents it, but I only ran the macOS/Chromium build; I could not make `keyboard.down('Meta')` reach the canvas in headless mode (round-1 did confirm ⌘). The exact Linux behaviour (e.g. whether Alt alone still duplicates on Linux, since `ACTIVATE_DUPLICATION` is bound to Ctrl on that branch) is source-read, not observed.
2. **`ACTIVATE_EDITIION` UI in the desktop Swing build is not observed** — only the state handlers, clamps and key bindings are source-verified. I could not run the desktop app here, and the guide explicitly excludes Online/Mobile. Whether the inline editor is a small text field per property, a single field cycled by Tab, or a small dialog is INFERRED from `setToolTipEditedProperties(names[], values[], x, y)` plus `setToolTipEditedPropertyValue(name, value)`.
3. **The "nearest edge" tie-break in `PointWithAngleMagnetism` is resolved empirically but not line-proven.** The full 360-point sweep showed every output on the exact 15° grid and lengths 241–300 cm, which is consistent with the projection rule I describe (and rules out a naive radius-preserving rotation), but I did not instrument *which* of the two candidate rays is chosen at each step. The branch logic is a direct read of the de-minified code.
4. **`getMagnetizedLength` at exact ladder boundaries** is verified by the model-matching probe (mismatches 0, sweeping pixelLengths 0.2/0.3/0.5/0.6/1/2/2.6/5/5.1/10/50/50.1/100/500 cm), so this is closed; retained here only to note that the boundary is `>` not `≥`, i.e. `2·pixelLength == 1.0` still selects the 0.5 cm step.
5. **Interaction between magnetism and multi-select move.** `SelectionMoveState.moveMouse` uses the 90° point magnet only when the press-time Shift was down; how SH3D combines that with the separate shelf/wall furniture magnets (`adjustMagnetizedPieceOfFurniture`) was not traced — it is outside the wall/room drawing question.
6. **Performance of the magnet at scale** (`getRoomPathsFromWalls` is recomputed inside `PointMagnetizedToClosestWallOrRoomPoint`'s constructor, called on every mouse move) was not measured. It is a plausible O(walls·points)-per-frame path, but I have no timing.
7. **Whether the 15° constant is user-configurable.** I saw only `CIRCLE_STEPS_15_DEG=24` and the explicit `4` at drag call sites; I did not find a preference for the angle step (only on/off magnetism), but the preferences dialog was not exhaustively enumerated.
8. **Round-1's `Recompute walls` Unknown stays open** — out of scope for this round and untouched.

---

## Sources

* Sweet Home 3D User Guide (EN): https://www.sweethome3d.com/userGuide.jsp — round-1 local copy `sources/userGuide_en.txt` lines 418, 424, 453 (read-only reuse)
* Sweet Home 3D Benutzerhandbuch (DE): https://www.sweethome3d.com/de/userGuide.jsp — `sources/userGuide_de.txt` lines 418, 424, 453
* Release history: https://www.sweethome3d.com/history.jsp — `sources/history.txt` (v4.0 Shift-alignment / magnetism key change; "Applied magnetism to lengths depending on the current scale in the plan and unit"; "Increased magnetism sensitivity")
* Tips hub: https://www.sweethome3d.com/tips.jsp — "How to control magnetism" (video embed only, no textual spec)
* Shipped bundle v7.5.2: https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 — round-1 local copy `sources/js/sweethome3d.min.js`; my de-minified `evidence/sh3d.pretty.js` (GPL; behaviour described, no code copied into deliverables)
* Sweet Home 3D JS Online (live app): https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — `out/probe_magnetism_api.json`, `out/probe_live_api_draw3.json`, `out/probe_live_interaction.json`
* Sweet Home 3D is GPL; 3D House Planner is proprietary. No source code was copied into this report or into any deliverable meant for reuse.
