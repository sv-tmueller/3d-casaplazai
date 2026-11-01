# Sweet Home 3D — Aerial camera deep dive: auto-fit, orbit/zoom limits, "centered on selection", interaction mapping

Job: `rea2-sh3d-p3/05-07a-3d-view-rendering-aerial-cam`
Target: **Sweet Home 3D** — https://www.sweethome3d.com/de/ (GPL Java desktop app) and the WebGL browser edition https://www.sweethome3d.com/SweetHome3DJSOnline.jsp (same Java core compiled to JavaScript).
Round-1 base (read-only, reused, not repeated): `~/dsh-workspaces/rea-sweethome3d-2026-10/07-07-3d-view-rendering/report.md`.
Evidence convention: **[OBSERVED]** = I measured it in the live editor or read it in the shipped bundle/artifacts, file named; **[DOCUMENTED]** = official Sweet Home 3D help page or user guide (URL); **[INFERRED]** = my deduction. No source code is reproduced — behaviour and algorithms are described in my own words (SH3D is GPL, our repo is proprietary).

**Method note.** The Editor was driven live over CDP in this job folder (Chrome 153, WebGL 1.0 software context; see `cdp.mjs`, `probes/*.js`, `rea-out/*.json`). Headless Chromium in round 1 had no working 3D; here a real (non-headless) Chrome with `--no-sandbox` reached the page and the app's own JS model, and **the whole camera model is reachable as plain JS state**, so every numeric claim below was measured by calling the page's own controller methods and reading camera/bounds state back. Screenshots were captured but not read visually (I cannot see images).

---

## 1. Summary

- **The aerial camera is a spherical orbit rig around an auto-computed bounding-box centre, and the fit is a formula you can copy exactly.** The box accumulates over visible walls, rooms, furniture, polylines, dimension lines and labels; the minimum orbit radius is `halfDiagonal × 1.05` and the maximum is `max(5 × min, 5000 cm)`. On the official Studio home I measured box `[-5.2,-16,0]…[748,465.2,250] cm`, `minDistance = 487.25`, `maxDistance = 5000` — both match the formula to 2 decimals. **[OBSERVED]** `rea-out/p02_aerial.json`, `p03_fit.json`, `p15_live_fit.json`, `p28_fresh_box.json`; bundle `TopCameraState.updateCameraIntervalToAerialViewCenter`.
- **The fit is continuous and one-directional, not a one-shot "zoom to fit".** Every object/property change recomputes the box, re-centres the orbit, *clamps* the current distance into the new `[min,max]`, and otherwise preserves the user's distance. When the home grows the camera is pushed out; when it shrinks the camera is **not** pulled back in. **[OBSERVED]** `probe15b.json` (clean home: `minD 487`, distance 975 → one item moved to 6000 cm forces `minD 4505` and distance `975 → 4505` → item restored, bounds shrink back to `minD 487`, but the distance **stays 4505**). The same asymmetry appears on the mutated home in `p15_live_fit.json` (`minD 845`, distance 1689 → forced to 4540 and never pulled back).
- **Orbit limits are pitch ∈ [0°, 90°] and distance ∈ [min, max].** You can never orbit below the horizon, so the camera never dips under the floor and the plan view (90° pitch) is the hard end-stop. Yaw and zoom preserve the orbit radius; pitch changes recompute X/Y/Z on the same sphere. **[OBSERVED]** `p04_orbit.json` (pitch −10 rad clamps to 0; +10 rad clamps to π/2); **[DOCUMENTED]** help page "(the mouse) forward or backward … makes the home turn around an horizontal axis".
- **"Aerial view centered on selection" does three things, and the zoom part only fires on the transition from an empty to a non-empty selection.** It swaps the bounds source to the selected Elevatable items, recomputes `[min,max]` from that smaller box, and **restores a globally remembered orbit distance** (one number for the whole document, not per object). Deselecting swaps back to the home box and drags the camera out to the new minimum — a visible sharp edge. **[OBSERVED]** `p06_centered.json`, `p07_snapback.json`, `p18_global.json`, `probe25.json`, `probe26.json`; **[DOCUMENTED]** FAQ "Is it possible to manually set the rotation center of the 3D view in Aerial view mode?".
- **Interaction is a small, fully enumerated map and it differs per mode.** Aerial: left-drag = yaw/pitch at `0.005 rad/px`, wheel = orbit distance `+3.125 cm` per wheel-delta unit (×5 with Shift), arrow/WASD = rotate + zoom, PageUp/PageDown = pitch, and **Home/End and Alt+arrows are deliberate no-ops**; Virtual visit reuses the same keys for walking/strafe/elevation, where wheel becomes walking and the only field-of-view control exists. **[OBSERVED]** `p09_keys.json`, `p10_observer_keys.json`, `p27_wheel_real.json`, `p22_fov.json`, `probe08.json` (real and synthetic DOM events); **[DOCUMENTED]** editing3DView help.

---

## 2. Findings

### A. Aerial auto-fit: what is in the box, and the exact formula

**A1. Box membership (walls, rooms, furniture, polylines, dimension lines, labels).** `updateAerialViewBoundsFromHomeBounds(wholeHome)` builds a lower/upper 3-D point. Per item kind:
- **Walls**: X/Y from the wall's two end points; Z from the level elevation up to `elevation + wallHeight` (or `elevation + heightAtEnd` for a sloped wall).
- **Rooms**: only the polygon points; Z from `levelElevation − floorThickness` to `levelElevation` (i.e. the **floor slab**, not the ceiling).
- **Furniture**: X/Y from `getPoints()` (the **rotated** footprint); Z from `groundElevation` to `groundElevation + heightInPlan`.
- **Polylines / dimension lines / labels**: X/Y from their points; Z is a flat value at the ground elevation.

Items are skipped unless visible (`furniture.isVisible()`, `polyline.isVisibleIn3D()`, label has a pitch) **and** at a viewable/visible level (`level == null || level.isViewableAndVisible()`). Openings (doors/windows) never contribute — they are inside walls. **[OBSERVED]** behaviourally, not just statically. On the freshly loaded Studio home the whole-home box is `[-5.2,-16,0]…[748,465.2,250]`, which matches the **walls** envelope exactly (`x ∈ [-5.2, 748]`, `y ∈ [-16, 465.2]`, `z = 250 = wallHeight`) even though the home also contains 8 dimension lines (`x ∈ [-22.1, 764.3]`, `y ∈ [-33.7, 482.2]`), a "Studio" label at `y = -68.2`, and rooms/furniture well inside. The extra entities were excluded because **all 8 dimension lines have `isVisibleIn3D() === false`** and the label has **`pitch === null`**. Turning *one* dimension line's 3D visibility on grew the box's `y` upper bound `465.2 → 482.2` (`minDistance 487.3 → 491.9`); setting the label's pitch to `0` grew the `y` lower bound `-16 → -68.2` (`minDistance → 502.0`); both reverted precisely when the flags were cleared. So the item-kind list and the visibility gating are both directly confirmed live. **[OBSERVED]** `p15_live_fit.json`, `p28_fresh_box.json`, `p29_visibility.json`, `p30_toggle.json`; bundle `TopCameraState.prototype.updateAerialViewBoundsFromHomeBounds`.

> **Note on the numbers in this section.** The first Studio load in this job produced box `[-5.2,-16,0]…[748,465.2,250]` (the geometry above) with `minDistance 487.25`. A later session, after the demo was reloaded and edited, produced a larger box (`[-61.9,-32.9,0]…[1172.9,626.1,792.9]`, `minDistance 844.5`) because the demo had been mutated by my own probes. Every formula verification below uses the matching session's box, and `p28_fresh_box.json` re-derives the original numbers from a clean page load.

**A2. The minimum box.** Three constants floor the box: `MIN_WIDTH = MIN_DEPTH = 100 cm`, `MIN_HEIGHT = 20 cm`. They are applied in two places:
- If **nothing** contributed a point, the box is `[0,0,0]…[100,100,20]`.
- If the whole home is being framed and the box is **narrower than the minimum**, it is grown symmetrically about its own centre to exactly the minimum (X, Y and Z independently).
This "whole home" gating matters: **when framing a selection, the minimum box is *not* applied**, so a small selected room produces a genuinely small box. **[OBSERVED]** `p06_centered.json`: a small selected room produced box `[118.8, 245, 250]…[229.9, 337.8, 262]` → `minDistance 76.3`, which is `sqrt(111.1² + 92.8² + 12²)/2 × 1.05 = 76.33` exactly, i.e. the raw half-diagonal with **no 100/20 floor and no MIN_HEIGHT inflation**. (A second, independent selection case in `p03_fit.json` — a selected Room with box `d = 207.91` and `minD` consistent with its own diagonal — shows the same absence of flooring.)

**A3. The formula, verified numerically.** For a box of size `(dx, dy, dz)`:
- `minDistance = sqrt(dx² + dy² + dz²) / 2 × 1.05` (half the space diagonal, +5 % margin)
- `maxDistance = max(5 × minDistance, 5000)` cm
- The orbit centre is the **box centre**, including Z: `z_centre = (lowerZ + upperZ)/2`. History confirms the intent: v4.0 "In Aerial view mode, set the height of the rotation center at half height of the visible items in the 3D view." **[DOCUMENTED]** `history`.

Measured Studio home (whole home):

| quantity | value |
|---|---|
| box lower | `[-5.2, -16, 0]` cm |
| box upper | `[748, 465.2, 250]` cm |
| diagonal | `928.0` cm |
| **minDistance** | `487.25` (formula 487.25) |
| **maxDistance** | `5000` (formula `max(2436, 5000)`) |
| centre | `[371.4, 224.6, 125]` cm |

Then one visible item moved to `(6000, 6000)`: box grew to `[-5.2,-16,0]…[6066,6018,793]`, `minDistance 4505`, `maxDistance 22526` — exactly `5 × 4505.24`, i.e. the 5000 cm floor only dominates while the home is small. **[OBSERVED]** `p15_live_fit.json`.

**A4. The 5000 cm ceiling is a *comfort* ceiling, not an absolute one.** Because `maxDistance = max(5 × min, 5000)`, the zoom range is always a factor ≤ 5, but the absolute maximum grows without bound as the home grows (`22526` cm for the test home). The `5000` value only matters for a home whose diagonal is below ~952 cm. **[OBSERVED]** `p15_live_fit.json`.

**A5. Auto-fit runs on entry, on every model change, and on mouse release.** The fit is invoked from the camera-state `enter()` (mode switch into aerial), from collection and property listeners on walls/furniture/rooms/polylines/dimension-lines/labels/levels, from selection changes, and from `releaseMouse` (end of a drag). There is **no "reset view"/"zoom to fit" command**: the fit continuously re-establishes the centre and clamps the radius. **[OBSERVED]** bundle call sites; `p15_live_fit.json` shows the box tracking model edits live.

**A6. Mode switch does not re-fit the distance.** Switching to Virtual visit tears the aerial state down (round 1's `TopCameraState.exit()` nulls `topCamera` and removes the listeners); switching back re-enters and calls the fit with the **current** camera as the source of the distance, so the orbit radius you left with is preserved (clamped into the new range). Verified round trip: set the aerial camera to `d = 3000` with yaw `-2.441` and pitch `1.571`, then `viewFromObserver → viewFromTop → viewFromObserver → viewFromTop`. The top camera was **bit-identical at every step** (`[371.4, 224.6, 3125, -2.441, 1.571]`, `d = 3000`), `topCamera` went `false → true(=null) → false`, and the active camera alternated `TOP → OBSERVER → TOP`. **[OBSERVED]** `p05_modes.json` (also `p07_snapback.json` steps J/K show the distance surviving yaw and pitch changes).

**A7. The serialised plan stores the fitted aerial pose.** Round 1 already showed `<camera attribute='topCamera' …/>` in `Home.xml`. I cross-checked the stored camera against the independently measured box centre `(371.4, 224.6, 125)` and it is exactly an orbit pose about that centre:

- The stored camera is `(371.32, 378.61, 947.96)` with yaw `-3.1411`, pitch `1.3858`.
- Its radius about the centre is `sqrt((−0.08)² + 154.01² + 822.96²) = 837.25` cm, which lies inside the stored home's `[487.25, 5000]` orbit range.
- Reverse-deriving the angles from the offset vector reproduces the stored values **to four decimals**: `asin(dz/d) = 1.3858` and `atan2(dx, −dy) = −3.1411`.

So the stored numbers are precisely the box-centre spherical coordinates the aerial camera uses, i.e. the aerial camera is part of the *document*, not an ephemeral view setting. **[OBSERVED]** `sh3x/Home.xml` (round 1) + `p42_asloaded.json`. (This is a *consistency* proof of the stored pose against the box centre; the live camera in my mutated session had a different distance, `1282.89` at box `minD 844.5`, because the demo had been edited by then — see `p02_aerial.json`/`p03_fit.json`.)

**A8. Defaults are hard-coded, then overwritten by the fit.** A brand-new `Home` constructs the top camera at `(50, 1050, 1010)`, yaw `180°`, pitch `45°`, FOV `63°`; `getCamera()` returns the top camera when none is set, so **aerial is the default 3D mode**. The first fit immediately replaces X/Y/Z with values derived from the box while keeping yaw/pitch/FOV. FOV 63° is common to both cameras at construction. **[OBSERVED]** bundle `Home.prototype.init` defaults + `getCamera`; measured live FOV `1.0996 rad = 63.0°`.

### B. Orbit and zoom limits

**B1. Pitch is clamped to `[0, π/2]`.** `rotateCameraPitch` adds the delta, clamps into that interval, then recomputes X/Y/Z on the sphere. Consequence: in aerial mode the camera is **never below the orbit centre's height**, the view is always downward, and the 90° end-stop is the orthographic-looking plan view. **[OBSERVED]** `p04_orbit.json`: pitch −10 rad left at exactly `pitch = 0`; pitch +10 rad left at exactly `1.5708`, camera Z = centre Z + distance. **[DOCUMENTED]** v3.5 history "Reversed rotation direction towards up / down in aerial view mode."

**B2. Yaw is unclamped and preserves the radius.** `rotateCameraYaw` moves only X/Y around the centre (`x = cx + sin(yaw)·d·cos(pitch)`, `y = cy − cos(yaw)·d·cos(pitch)`), leaving Z untouched — so the horizon stays put and you spin around the home. **[OBSERVED]** bundle + `p04_orbit.json` (yaw +90° keeps `d` constant at 5000).

**B3. Zoom clamps, and the clamp is where the auto-fit bites.** `placeCameraAt(distance)` clamps into `[minDistance, maxDistance]` and then re-derives X/Y/Z. On a stale home (`minD 844.5, maxD 5000`) requesting a distance of `1` gave exactly `844.5` and requesting `1 000 000` gave exactly `5000`; on a freshly loaded home the corresponding pair is `487.25` and `5000`. **[OBSERVED]** `p07_snapback.json` steps B and C; `p28_fresh_box.json`.

**B4. A bonus cap exists but is inert in the shipped flow.** `placeCameraAt` has a second parameter; when it is true the distance is additionally capped to `3 × minDistance` ("don't hover far away from a small target"). Every call site in the shipped bundle passes **false**, so in the app as shipped the cap never fires; only when I called `updateCameraFromHomeBounds(true, …)` directly did it engage (3000 → 2533.6 = `3 × 844.5`). **[OBSERVED]** `probe26.json` + bundle call-site reading.

**B5. FOV is fixed for the aerial camera.** `modifyFieldOfView` is implemented only by the visitor state; the aerial state inherits a no-op. Measured: while in aerial mode, `modifyFieldOfView(0.5)` left the top camera at `1.0996` rad (63°); the same call on the visitor changed its FOV. **[OBSERVED]** `p22_fov.json`. Also: there is **no third-person "zoom" that changes FOV** — aerial zoom is purely a change of orbit radius, so perspective distortion never changes.

### C. "Aerial view centered on selection"

**C1. The preference.** Live label "Aerial view centered on selection:" / checkbox "Enabled"; **default true** in the browser edition (round 1 saw the same). German UI: "Luftansicht auf Auswahl zentrieren:" / "Aktiviert". The preference listener propagates into the running camera state immediately (toggling it re-runs the fit). **[OBSERVED]** live `getUserPreferences().isAerialViewCenteredOnSelectionEnabled() === true`; `localization_de.json`; **[DOCUMENTED]** FAQ paragraph quoted below.

**C2. What it changes.** When enabled *and* a selection exists, the fit uses the **selection's** box instead of the home box. The box centre, `minDistance` and `maxDistance` are all recomputed from the selection. Measured in one run (`p06_centered.json`, same camera throughout, so the `camToCenter` column stays constant until an explicit zoom):

| step | pref | box centre | box Z band | minDistance | camera distance |
|---|---|---|---|---|---|
| no selection | OFF | `[555.5, 296.6, 396.5]` | `[0, 792.9]` | 844.5 | 1689.1 |
| small room selected | **OFF** | `[555.5, 296.6, 396.5]` | `[0, 792.9]` | 844.5 | 1689.1 |
| small room selected | **ON** | `[174.4, 291.4, 256]` | `[250, 262]` | 76.3 | 1689.1 |
| cleared selection | ON | `[555.5, 296.6, 396.5]` | `[0, 792.9]` | 844.5 | 1689.1 |
| 3 rooms selected | ON | `[579.2, 279.5, 125]` | `[-12, 262]` | 678.1 | 1689.1 |

Read the first two rows together: with the preference **off**, selecting a room changes *nothing* — same centre, same `minD`. That is the clean control for the feature. The selection's Z band is the room's floor-slab band per A1 (`levelElevation − floorThickness … levelElevation`), and the centre's Z is its midpoint (`(250+262)/2 = 256`). Note the minimum-box floor is **not** applied here (A2), which is why `minD` falls to `76.3` for a single small room.

**C3. Only Elevatable selected items count; otherwise the whole home is framed.** The selection is filtered to items implementing the "Elevatable" marker interface, plus the visibility rules of A1. A selection containing none of those (or an empty selection) falls back to the whole-home box — so the feature degrades gracefully rather than producing a degenerate box. **[OBSERVED]** bundle filter predicate + `p06_centered.json`.

**C4. The remembered distance is global, and it is only *applied* on the transition into a non-empty selection.** Measured sequence (`p18_global.json`): room selected at `d = 400` → deselect and move the camera to `d = 4000` → select a **different** object (centre moves from `[174, 291]` to `[207, 594]`, i.e. a different part of the home) → the camera snaps back to `d = 400`, with no relationship to the new object's fit distance. So SH3D keeps **one** "distance I last used while something was selected" for the whole document, not one per object and not one per selection shape. **[OBSERVED]** `p18_global.json`.

**C5. First-ever selection does not zoom.** With the memory unset (`-1`) and the camera at 3000, the first selection re-centres and rewrites its `minDistance` from the selection box, but the distance **stays 3000** (it would only move if the new minimum exceeded it). **[OBSERVED]** `probe25.json` step B: `d2cws` becomes `3000` and `d` remains `3000`; then stepping the memory (`F`) and re-selecting (`I`) snaps to the remembered `300`.

**C6. Sharp edge: deselecting yanks the camera back out.** Because the home box's `minDistance` is much larger than a small selection's, deselecting clamps the distance up to the home minimum. On a small selected room this is an abrupt jump: with the room selected at `d = 300` (selection `minD = 76.3`), deselecting forced the distance to the home minimum `844.5` in one step, since `max(300, 844.5) = 844.5`. The remembered distance is preserved, so re-selecting snaps back in, but the deselect already moved you. **[OBSERVED]** `p07_snapback.json` steps F→G and H→I; `probe25.json` step D.

**C7. The FAQ states the intent and the escape hatch.** **[DOCUMENTED]** https://www.sweethome3d.com/faq/ : *"By default, this rotation is centered on the middle of the bounding box which contains all the walls, rooms and furniture added to home, and this center is automatically updated at each modification. This behavior ensures the user always sees his home entirely with no way to get lost in the 3D view. If you want to move this center of rotation, enable the Aerial view centered on selection option in the preferences pane and select the object(s) …"* — note the FAQ lists walls/rooms/furniture, while the bundle also frames polylines, dimension lines and labels (A1).

**C8. Levels.** With the whole home framed, the Z band is clamped to at least `MIN_HEIGHT = 20` for flat item kinds, and the level filter (`isViewableAndVisible`) means the box covers only the levels you have made visible. On a single-level home the level actions are disabled (round 1: `MAKE_ALL_LEVELS_VIEWABLE enabled=false`). **[OBSERVED]** bundle `updateAerialViewBoundsFromHomeBounds` + A3's measurements; **[INFERRED]** that per-level visibility is the mechanism by which a multi-storey aerial fit avoids framing hidden storeys.

### D. Interaction mapping (aerial vs virtual visit)

All values below were measured by dispatching real or synthetic DOM events to the live canvas and reading the camera back.

**D1. Aerial mouse/pointer map.**

| gesture | effect | measured magnitude |
|---|---|---|
| left-drag horizontal | orbit yaw around the centre | `0.005 rad` per pixel (≈0.29°/px) |
| left-drag vertical (downward) | **raises** the camera toward the 90° top-down end-stop | `0.005 rad` per pixel, clamped to `[0, π/2]` |
| wheel (deltaY > 0) | orbit radius **increases** (zoom out) | `+3.125 cm` per deltaY unit (one 100-unit notch ≈ 3.1 m) |
| wheel + Shift | same, faster | effective delta ×5 |
| right-drag | nothing | — |
| double-click | a press only; no distinct second action in aerial | — |
| touch, 1 finger drag | yaw/pitch | as above |
| touch, 2 finger pinch | orbit zoom (via the same camera path) | — |

**[OBSERVED]** synthetic left-drag of +100 px changed yaw by exactly `+0.5 rad` and a +50 px downward drag changed pitch by `+0.25 rad` (`probe08.json`); real wheel events on the canvas measured exactly `+3.125 cm` of orbit radius per `deltaY` unit, monotonic and symmetric (3000 → 3312.5 → 3625 for two `deltaY=+100` notches, 3000 → 2687.5 for `deltaY=−100`), with Shift multiplying the *effective* delta by 5 so that `Shift+40` equals `+200` unshifted (`p27_wheel_real.json`). The listener is registered for both the legacy `mousewheel` and the Firefox-style `DOMMouseScroll` events, and the canvas must have focus for a drag to orbit (`document.activeElement === canvas`).

**D2. Aerial keyboard map** (`inputMap` → `actionMap`; the "fast" variants are used with Shift, and Alt is accepted as an alias for forward/backward):

| key | action | distance/angle delta |
|---|---|---|
| ↑ / W | forward = zoom **in** | 32.5 cm (6.5 × 5) |
| ↓ / S | backward = zoom out | 32.5 cm |
| Shift+↑ / Shift+W | fast forward | 162.5 cm |
| ← / A, → / D | yaw left / right | `π/60` ≈ 3° |
| Shift+← / Shift+→ | fast yaw | `π/12` = 15° |
| PageUp | tilt the view up toward the horizon (camera comes **down**) | pitch `−π/120` ≈ −1.5° ; Shift `−π/24` = −7.5° |
| PageDown | tilt the view down toward plan view (camera goes **up**) | pitch `+π/120` ; Shift `+π/24` |
| **Home / End, Alt+←, Alt+→** | **no-op in aerial** (they act only in virtual visit) | — |
| Escape | cancel the current camera state | — |

**[OBSERVED]** `p09_keys.json`: ↑ `974.5 → 942` (−32.5), Shift+↑ → 812 (−162.5), Alt+↑ → 779.5 (−32.5), ← yaw `−0.0524` (= `π/60`), Shift+→ yaw `+0.2618` (= `π/12`), PageDown `+0.0262` from pitch 0; in the same run **PageUp produced no change because pitch was already at the 0 clamp** (PageUp drives pitch negative), and Home/End/Alt+← produced literally zero change. A separate run starting at pitch `1.3208` showed PageUp moving it to `1.2946` (exactly `−π/120`). Note the counter-intuitive naming: the action literally called `ROTATE_CAMERA_PITCH_UP` *decreases* the pitch number, and the v3.5 history entry "Reversed rotation direction towards up / down in aerial view mode" is the origin. **[DOCUMENTED]** editing3DView help: *"In both modes, the left arrow and right arrow keys have the same effect as mouse lateral moves; page up and page down keys have the same effect as mouse moves forward and backward; up arrow and down arrow keys have the same effect as mouse wheel."*

**D3. Virtual visit reuses the very same keys with different meanings** — this is the useful contrast for a Plan/3D/Walk redesign:

| key | virtual visit | measured |
|---|---|---|
| ↑ / W | walk forward along the body yaw | 6.5 cm (Shift 32.5 cm) |
| ↓ / S | walk backward | 6.5 cm |
| Alt+← / Alt+→ | strafe left / right | 2.5 cm (Shift 10 cm) |
| ← / → | turn the body | `π/60` (Shift `π/12`) |
| PageUp / PageDown | nod the head | `π/120` (Shift `π/24`), clamped ±90° |
| Home / End | raise / lower the eyes | 2.5 cm (Shift 10 cm) |
| wheel | **walk**, not zoom | 62.5 cm per 100 deltaY units |
| FOV | only mode with a FOV control | clamped to 2°…120° |

**[OBSERVED]** `p10_observer_keys.json` (walk 6.5 cm, strafe, Home +2.5, Shift+Home +10, PageUp −0.0262 rad) and `p27_wheel_real.json` (one `deltaY=+100` notch moves the visitor exactly 62.5 cm along its body yaw, reversed by the opposite notch). Elevation clamps measured at `10 cm` (lowest level / no levels → `getMinimumElevation()` = 10) and `10000 cm` (`getLengthUnit().getMaximumElevation()`). FOV clamps measured at `2.0944 rad` (= exactly 120°) and `0.0349 rad` (= exactly 2°) after driving the modifier far past either end — matching the documented 2°–120° range. **[OBSERVED]** `p10_observer_keys.json` + **[DOCUMENTED]** round-1.

**D4. Navigation focus is required for mouse orbit.** The drag path only runs when the pointer press started inside the canvas *and* `document.activeElement` is the 3D canvas; the canvas carries `tabindex="2"`. Without a prior click/focus, a drag does not rotate the camera. Keyboard actions are bound to the canvas element's own `keydown`/`keyup`. **[OBSERVED]** `probe08.json` (after `focus()` the drag rotated; the app also focuses the canvas on touch) and the bundle listener code.

**D5. The optional on-canvas navigation arrows.** A preference "3D navigation arrows: Visible" (**default false**, German "3D-Navigationspfeile: / Sichtbar") inserts an absolutely-positioned overlay at the top-left of the 3D canvas containing a **56 × 59 px** image plus an image map with exactly **six** hotspots: `UP`, `LEFT`, `DOWN`, `RIGHT`, `PAGE_UP`, `PAGE_DOWN`. Each `<area>` carries a `data-simulated-key`; pressing one synthesises the same input-map key string the keyboard would produce (including a `"shift control alt pressed X"`-style prefix built from held modifiers) and **auto-repeats every 80 ms** while held. The overlay is created at view construction and merely toggled visible/hidden, and it repositions itself on window resize. There are **no Home/End hotspots** — elevation is keyboard-only. **[OBSERVED]** `probe14.json`: `areas` = 6 distinct keys, panel `visibility: hidden → visible`, `z-index 1`, inner HTML as an `<img usemap>` + `<map>`; bundle `createNavigationPanel` / `setNavigationPanelVisible` / `getSimulatedKeyElements`; **[DOCUMENTED]** editing3DView help: *"User preferences let you display or hide navigation arrows in the top left corner of the 3D view. The left, right, up and down navigation arrows have the same effect as the matching keys of the keyboard, whereas the two small up and down arrows at center have the same effect as the page up and page down keys."*

Implementation detail worth knowing if you copy the idea: the panel's six hotspots are registered **twice** (once read from the template before the overlay element exists, once from the created overlay), so `document.querySelectorAll('area[data-simulated-key]')` returns 12 and `getSimulatedKeyElements(body)` returns 12 keys — keys are still unique per name, so the double registration is harmless. **[OBSERVED]** `probe14.json` + bundle constructor.

**D6. Toolbar/menu toggle and its state.** `View from a top point of view` (`#toolbar-button-VIEW_FROM_TOP`, class `toolbar-button toggle selected`) and `View from a human observer point of view` (`#toolbar-button-VIEW_FROM_OBSERVER`) are real toggles: clicking one switches the active camera and moves the `selected` class; menu equivalents are `3D view > Aerial view` / `Virtual visit`. German toolbar/menu wording: **"Luftansicht"** / **"Virtuelles Begehen"**. **[OBSERVED]** `p24_button.js`, `probe15.json`; `localization_de.json`; **[DOCUMENTED]** editing3DView help ("Choose 3D view > Aerial view or 3D view > Virtual visit").

**D7. Per-object move/animation.** Changing the camera via mode switch animates: an interpolator records the initial and final camera and eases over ~75 ms, restarting if the target moves again mid-flight. Direct orbit/zoom input takes the non-animated path. **[OBSERVED]** bundle `moveCameraWithAnimation` / `updateViewPlatformTransform`.

### E. Sharp edges and gaps I could not exercise

**E1. Click-to-select in the 3D view is off by default, and the 3D picker is *unreliable* in this environment — it throws rather than returning a miss.** The "Selection and editing in 3D view" preference (`editingIn3DViewEnabled`) is **false** by default, and the selection branch of `releaseMouse` only runs when it is true. I tried to demonstrate it by scanning furniture positions with the real picker. The results are not consistent:

- One early run (**`probe12.json`**) did work: 593 shape hits and 86 item hits over a 20 px grid, with plausible named samples (`HomePieceOfFurniture "Box"`), and `homeObjects/homeObjects3D = 200`. That proves the API works in principle in this app.
- Every later run returned **zero** hits. Root cause found and verified: the picker decodes the picked pixel into a scene index and then dereferences `this.sceneGeometries[index].node`; when the decoded value is out of range it **throws `TypeError: Cannot read properties of undefined (reading 'node')`** instead of returning `null`. My probe loops wrapped the call in `try/catch`, so a throw was silently counted as a miss. On the reloaded page the decoded value is *always* out of range (measured: `782` sceneGeometries, while the framebuffer's decoded values are `1.4M–9.3M`). **[OBSERVED]** `p31_pick_resolve.json`, `p35_pick_forced.json`, `p38_fb_proof.json`, `p39_pick_nail.json`.

Diagnosis of *why* the pick render degrades (bounded, not speculative): the picking framebuffer itself is healthy — `checkFramebufferStatus` = `FRAMEBUFFER_COMPLETE`, `readPixels` works (a clear-then-read round-trips exactly `[51,102,153,255]`), and the size is a power-of-two `2048 × 512`. But its contents after the app's own pick pass are **grey shading values** (`84,84,84`, `141,141,141`, `55,55,55`, …), i.e. the *depth/shading* render rather than index-encoded colours, so no pixel decodes to a valid geometry index. Two environmental factors coincide: `document.visibilityState` is `hidden` (the CDP-opened tab is occluded), which throttles `requestAnimationFrame` to `0.5–1.6 fps`, and the pick buffer is refreshed **only from a completed animation frame** (`repaint()` just sets a flag consumed inside a `requestAnimationFrame` callback which then sets `pickingFrameBufferNeededRepaint`). Forcing `pickingFrameBufferNeededRepaint = true` by hand does re-run the pick draw but still yields out-of-range pixels, so visibility throttling is a contributing factor rather than the whole story. `Page.setWebLifecycleState("active")` did flip `document.visibilityState` to `visible`, but the pick render still did not produce valid indices. **[OBSERVED]** `p37_fb_state.json`, `p38_fb_proof.json`, `p40_fb_visible.json`, `p41_fbcomplete.json`; bundle `HTMLCanvas3D.prototype.getClosestShapeAt` / `repaint`.

Consequence for this report: the *selection → recentre* loop (C2–C6) was driven through the plan/JS selection API (`home.setSelectedItems([...])`) rather than a 3D click. That fires the same `SelectionListener` the click path uses, so the recentre logic is verified; only the click→pick handoff is not. **[INFERRED]** that in a normal, non-occluded browser window the pick render completes on each animation frame and clicking works as documented.

**E2. Known code smell worth not copying: the picker dereferences a global `component3D`** rather than `this`, so in a multi-window build the selection helper would consult the wrong view. **[OBSERVED]** bundle `getClosestSelectableItemAt`; **[INFERRED]** as a latent bug.

**E3. Interactive click on an `<area>` was not exercised.** Synthesising the click requires hit-testing the image map, which the headless input path cannot do; I verified the panel's structure and the key-synthesis code path (D5) but not a live arrow press. **[OBSERVED]** the no-op result of my mousedown on a hotspot element (`probe14.json` `afterSimulatedUp` unchanged) is consistent with the repeat timer/hit-testing needing a real pointer. **[INFERRED]** the arrows work in a real browser.

### F. Evidence inventory (this job folder)

| Path | What it is |
|---|---|
| `probes/p01_load.js` … `p41_fbcomplete.js` | The exact in-page probes (each a self-contained expression), kept so every numeric claim is reproducible |
| `rea-out/`: `p02_aerial`, `p03_fit`, `p04_orbit`, `p06_centered`, `p07_snapback`, `p09_keys`, `p10_observer_keys`, `p15_live_fit`, `p18_global`, `p19_prefs`, `p22_fov`, `p27_wheel_real` (real wheel events), `p28_fresh_box`, `p29_visibility`, `p30_toggle`, `p42_asloaded`, `p05_modes`, `p31_pick_resolve`, `p35_pick_forced`, `p37_fb_state`, `p38_fb_proof`, `p39_pick_nail`, `p40_fb_visible`, `p41_fbcomplete`, `p32_p12_rerun`, `p36_p12_visible`, and legacy `probe07`, `probe08`, `probe11`, `probe12` (the one successful pick run), `probe13`, `probe13b`, `probe14`, `probe15`, `probe15b`, `probe25`, `probe26` | Raw probe outputs (the OBSERVED record) |
| `cdp.mjs`, `cdp-visible.mjs`, `cdp-input.mjs` | The CDP evaluate driver, the variant that forces the page lifecycle to `active` before evaluating, and the input-dispatch driver |
| `libjs-sweethome3d.min.js` | Shipped Sweet Home 3D JS 7.5.2 bundle, downloaded here for static behaviour reading (GPL; not copied into the report) |
| `localization_de.json` | German UI string table (aerial/walk/navigation wording) |
| `de-3dview.html`, `de-guide.html` | German official 3D-view help page and online user guide |
| `shot-3d-aerial.png` | Captured aerial 3D screenshot (not read visually) |
| `chrome.log`, `profile/` | Browser launch log and throwaway profile |

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Context: single-page TypeScript + Three.js app, no backend, plan autosaves to localStorage (`FloorplanData` schema v1, metres, rooms as CCW polygons, openings by `segmentIndex`+`tCenter`, furniture by `position`/`rotationDeg`/`footprint`). "Out-of-schema editor state" is a deliberate convention (snap settings, measurements, underlay each have their own key) — camera state belongs in that same family.

### Tier 1 — high value, low effort

1. **Implement the aerial auto-fit as SH3D's exact formula, over *visible* geometry only.** *Ties to A1–A5.* Compute an AABB in world metres over: room polygons **plus their wall slabs** (the schema has no wall entity — derive wall segments from each room polygon, offset by `wallThickness/2` per side, extruded from `0` to `wallHeight` or the segment's `wallsOverride` height), every furniture item's **rotated** footprint corners (`position` + `rotate(±footprint/2, rotationDeg)`), and any measured annotations if they are in the 3D scene; skip openings. Then: `minDistance = halfDiagonal * 1.05`, `maxDistance = max(5*minDistance, 50)` (SH3D's 5000 cm = 50 m; keep the same shape but scale the absolute floor to a house-sized 50 m), centre = box centre with `z_centre = (lowerZ+upperZ)/2`. ~60 lines, no dependencies, and it makes "3D always frames the home" true by construction. Add SH3D's floor: a 1 m × 1 m × 0.2 m minimum box for the empty-plan case.
2. **Make the fit a continuous clamp, not a one-shot camera jump.** *Ties to A5, C6.* Re-run the bounds computation on every plan mutation (the store already emits changes) and clamp the orbit radius into `[minDistance, maxDistance]`, **preserving the user's radius whenever it is inside the range and only pushing out when the home grows**. Do not pull the camera back in when the plan shrinks — that is exactly what SH3D does and it is what stops the view from "fighting" the user while they drag furniture. Mitigates the sharp edge in C6.
3. **Pitch clamp `[0, 90°]` on the aerial orbit.** *Ties to B1.* In Three.js this is one line on the orbit controls (`maxPolarAngle = Math.PI/2`, and a `minPolarAngle` a few degrees above 0 to avoid a degenerate up-vector at exactly top-down — SH3D allows exactly π/2 and therefore needs special handling at the pole; clamping to ~2° is the safer Three.js choice). Prevents the camera going under the floor and losing the horizon.
4. **Two persisted camera objects, aerial + walk, outside `FloorplanData`.** *Ties to A7 (SH3D serialises the top camera in the plan), the schema's "Out-of-schema editor state" convention.* Store `casaplaza.camera.v1 = {aerial: {target:[x,y,z], radius, yaw, pitch}, walk: {position, yaw, pitch, fov}}` alongside the existing snap/underlay keys. On entering 3D mode, restore the aerial pose; on Plan mode, keep it untouched. This makes the new Plan/3D/Walk mode switch stateful (the SH3D round trip A6 shows the right behaviour: leave and re-enter, keep what you had) and costs almost nothing because localStorage persistence already exists.
5. **Ship the mode-specific key/gesture map as a single table, and make Home/End and Alt+arrows *not* silently dead in 3D.** *Ties to D1–D3, especially the aerial/visitor contrast.* SH3D's split (aerial: wheel = zoom, arrow = rotate/zoom, Shift = ×5; walk: wheel = move, arrow = walk, Alt+arrow = strafe, Home/End = eye height) is a good skeleton for Plan/3D/Walk, but SH3D leaves Home/End **as no-ops in aerial mode** — a user pressing End in the 3D aerial view gets nothing. Either map them to the walk-mode equivalents or document them in the tool card.

### Tier 2 — high value, medium effort

6. **"Center on selection" with a *local* memory, and no yank on deselect.** *Ties to C2–C6.* Adopt the feature (it is the answer to "my room is hidden behind a wall and I want to look at it"), but improve the two rough parts: (a) key the remembered distance to the selection (e.g. by selection bbox size or by room id set) rather than one global number — SH3D's global memory meant selecting a *different* object snapped you to a distance that belonged to the previous one (C4); (b) on deselect, keep the current radius if it is still above the home minimum instead of clamping out to it, and offer an explicit "fit home" action for the deliberate reset. Also mirror the graceful fallback: a selection that is not "Elevatable" falls back to the whole home (C3).
7. **Aerial ⇄ Walk as two named modes with an explicit toggle and a visual active state.** *Ties to D6.* SH3D's toolbar toggle button carries a `selected` class while the other carries `toggle`; the menu wording is Aerial view / Virtual visit, German Luftansicht / Virtuelles Begehen. For a redesign with a mode bar, the important part is that **the active mode is visible**, that the mode is a document/view state (not a transient), and that the same two idioms exist for keyboard users.
8. **On-canvas navigation D-pad, off by default.** *Ties to D5.* A 56 × 59 px, six-hotspot overlay (4 arrows + 2 page arrows) that synthesises the same key events your handlers already listen to, positioned over the 3D canvas and toggled by a preference, is a cheap win for touch and discoverability. Improvements to make: add Home/End (elevation) hotspots in walk mode, do not double-register the hotspots, and make the auto-repeat interval a tunable (SH3D's is a hard-coded 80 ms).
9. **Wheel/gesture constants tuned for a WebGL app.** *Ties to B3, D1.* SH3D's `+3.125 cm` per wheel-delta unit with a ×5 Shift modifier is in the right ballpark but its zoom step depends on a single 100-unit notch; use a **multiplicative** zoom (`radius *= 1.1` per notch) instead so the feel is consistent whether the camera is at 3 m or 30 m. That is a deliberate divergence from SH3D, whose additive step feels very different at the two extremes.

### Tier 3 — valuable, higher effort

10. **Roof-aware auto-fit.** *Ties to A1 and the schema's `roofs[].leanDeg`.* SH3D's box only contains walls, floors and furniture; a leaning roof plane raises the silhouette, and CasaPlazAI is the one that *knows* about roofs. The box should include the derived ridge/apex height for rooms with `roofs`, otherwise the top-floor aerial view will clip roofs. This is a real advantage over SH3D (which has no roof concept and relies on imported 3D models).
11. **Per-floor camera state and level-filtered fit.** *Ties to C8.* SH3D's box honours each item's level visibility; if CasaPlazAI's multi-floor plans get a "show only this floor" toggle, the aerial fit should follow the visible floors exactly as SH3D does. Store the aerial pose per floor so switching floors does not teleport the camera.

### Anti-patterns to avoid (taken from SH3D's rough edges I measured)

- **Don't make a hidden 3× minimum-distance cap like SH3D's `placeCameraAt` second parameter** — it is dead code in the shipped build and reading it wastes time. *(B4)*
- **Don't let deselecting yank the camera out to the home minimum.** *(C6)*
- **Don't hide a single global "last selection distance" behind a feature whose name suggests per-selection framing.** *(C4)*
- **Don't gate camera navigation behind the 3D-editing preference.** SH3D splits them correctly (navigation always works; click-select is opt-in, default false) — keep that split, and give the 3D-editing toggle a discoverable label because in SH3D "Selection and editing in 3D view: Enabled" is easy to miss and clicking does nothing without it. *(E1, D4)*
- **Don't leave keys dead in one mode** (Home/End in aerial). Either implement or document. *(D2)*

---

## 4. Unknowns

1. **Why the 3D pick render degrades in an occluded tab.** I proved the picker works in principle (one run returned 593 shape hits and named items) and that the framebuffer is complete and readable; I also proved that the decoded values are out of range afterwards and that the picker *throws* instead of missing. What I did **not** establish is the exact trigger that flips it from working to broken — the candidates are rAF throttling under `document.hidden` and a stale/incorrectly-encoded pick pass. A normal foreground browser window is the likely place to re-test. *(`probes/p11_click_select.js`, `probes/p12_scene.js`, `probes/p31_pick_resolve.js`, `probes/p35_pick_forced.js`, `probes/p37_fb_state.js`–`probes/p41_fbcomplete.js`)*
2. **Live navigation-arrow press.** The panel exists and its key-synthesis code is clear, but dispatching onto an `<area>` hotspot from CDP did not trigger a camera move (image-map hit-testing is not reachable from CDP's synthetic mouse path), so I could not confirm the 80 ms repeat pacing in practice. *(D5, `probe14.json`)*
3. **The absolute origin/interpretation of the `5000` cm constant and of the 3× cap in the original Java source.** I read them only in the minified JS and in behaviour; the Java comment/intent (and whether `placeCameraAt`'s second parameter is used by a different front end) is not something I verified. *(B4)*
4. **Multi-level aerial fit.** I measured the level filter predicate but the Studio demo is single-level, so I could not observe how the box and the per-level visibility interact on a real 2-storey home, nor how the level change re-fits the camera. *(C8)*
5. **Observer-mode details outside my question.** I recorded the walk/strafe/elevate/FOV numbers for contrast; the visitor's collision, speed preference and the "adjust eyes elevation according to selected level" behaviour are round-1 territory and were not re-derived.
6. **Whether the desktop Java build differs from the shipped JS bundle.** All numbers here come from the browser edition of the same core; the round-1 report and I assume parity, but I did not run the desktop app.
7. **The screenshot content.** I captured `shot-3d-aerial.png` but cannot read images, so no claim rests on it.
8. **Exact wheel-delta semantics across browsers.** I measured CDP `deltaY` values; the browser edition divides `deltaY` by 4 before applying its step, and wheel devices that report line/scroll mode could scale differently. My per-deltaY figure is exact for the CDP-synthesised events I used, not a hardware guarantee.

---

## 5. Sources

| # | Source | Used for |
|---|---|---|
| S1 | https://www.sweethome3d.com/SweetHome3DJSOnline.jsp | Live Editor (OBSERVED, all probes) |
| S2 | https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 | Camera-state algorithms, constants, input/action maps, navigation panel, defaults |
| S3 | https://www.sweethome3d.com/libjs/resources/localization_de.json | German UI wording (Luftansicht, Virtuelles Begehen, preferences) |
| S4 | https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/editing3DView.html?format=raw | DOCUMENTED mouse/keyboard mapping, navigation arrows, mode switching |
| S5 | https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/de/editing3DView.html?format=raw | German help text (Luftansicht) |
| S6 | https://www.sweethome3d.com/faq/ | DOCUMENTED rotation centre / centered-on-selection paragraph |
| S7 | https://www.sweethome3d.com/de/users-guide/ | DOCUMENTED mode wording and the mouse/keyboard figures |
| S8 | https://www.sweethome3d.com/history/ (round-1 snapshot `history.txt`) | DOCUMENTED version history for the rotation centre height (4.0), centered-on-selection (4.0), empty-home fit (4.1), pitch direction (3.5), max altitude (3.0), navigation arrows (2.3), mode introduction (0.16) |
| S9 | https://www.sweethome3d.com/examples/Studio.sh3x (round-1 snapshot `sh3x/Home.xml`) | OBSERVED serialised top camera and environment |
| S10 | ~/dsh-workspaces/rea-sweethome3d-2026-10/07-07-3d-view-rendering/report.md | Round-1 base: two-camera model, preferences defaults, stored viewpoints, FAQ quote |
| S11 | ~/dsh-workspaces/rea2-shared/casaplazai-schema.md | CasaPlazAI schema mapping for the ideas section |
