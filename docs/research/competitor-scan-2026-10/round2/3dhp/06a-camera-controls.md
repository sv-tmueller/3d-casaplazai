# 3D House Planner — camera controls per view mode: key bindings, walk collision & gravity, eye height, orbit/zoom limits, view transitions

Target: <https://www.3dhouseplanner.com/> (landing `index.php`; editor `app.php`; 2D planner iframe `2D-Planner/index.php`).
Round 2, narrow scope. Research date: 2026-10-31. Renderer: Babylon.js **6.38.0**.

Round-1 report read and reused read-only: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/report.md` (its §2.2 table, `view_states.json`, `ortho_probe.json`, `topbar.json`). Everything below is new evidence unless it explicitly cites round 1.

**Tag legend** — **OBSERVED** (read from the running page or its shipped JS; evidence file named) · **DOCUMENTED** (vendor's own claim; URL named) · **INFERRED** (my interpretation, stated as such).

All live probes ran against a real headless Chrome session driving the site's own UI. Method: open the landing page, click the site's own "Start designing — free" **link** (which navigates to `app.php` and sets the session cookie), then click the site's own `#definefloor` "Start designing" button inside the setup dialog. The first walk entry was reproduced after a fresh editor load. Evidence files in this folder:

| file | what it contains |
|---|---|
| `evidence/cam_probe.json` | mode-by-mode active-camera snapshots, wheel/drag effects, mode round-trip |
| `evidence/key_probe2.json` | key-listener instrumentation; shows CDP key events reach the DOM but not Babylon's scene observable in this build |
| `evidence/key_probe3.json` | 250 ms position sampling under held keys; held-key array behaviour |
| `evidence/wasd_confirm.json` | discarded first confirmation attempt (positive control failed; kept as the reason the retry is control-gated) |
| `evidence/limits_probe.json` | full ArcRotate config for all three cameras; zoom in/out sweeps; beta clamp; ortho zoom; mode transitions |
| `evidence/walk_probe.json` | walk entry, movement, vertical guard, teleport, collisions/gravity flags |
| `evidence/final_probe.json` | decisive WASD-vs-arrows matrix, Shift test, cursor-anchored zoom, top pan, 3D→Walk transition trace |
| `evidence/wasd_probe2.json` | independent fresh-Chrome confirmation of the WASD/arrow split, with an ArrowUp positive control |
| `evidence/pan_probe.json`, `evidence/pan_probe2..6.json` | pan bindings, panning sensibility, inertial panning, 2D-mode state |
| `evidence/ground_probe.json`, `evidence/ground_probe2.json`, `evidence/guard_probe.json` | entry-time ground guard: full-reset cases and a bisected 0.005 m threshold sweep on both edges |
| `evidence/eye_probe.json` | eye height vs project floor-to-floor height |
| `evidence/hotkeys.svg` | the in-app keyboard-shortcut sheet (downloaded, parsed) |

Probe scripts: `cdp.py`, `open_editor.py`, `wait_scene.py`, `common.py`, `probe_cam.py`, `probe_keys2.py`, `probe_keys3.py`, `probe_limits.py`, `probe_walk.py`, `probe_final.py`, `probe_pan*.py`, `probe_eye.py`, `probe_ground*.py`, `probe_guard.py`, `launch_chrome.sh`.

---

## 1. Summary

- **Walk mode is arrows-only in practice — the "WASD" in the UI tooltip is wrong.** In a clean run, *w / a / s / d* produced **zero** movement and were never recorded in the camera's held-key array, while ArrowUp/Down gave ±5.4/−7.0 m along the view axis, ArrowLeft/Right strafed ±8.3/+6.0 m, and PageUp/PageDown raised/lowered by +5.5/−3.9 m. The camera's arrays are exactly Babylon's defaults: `keysUp [38]`, `keysDown [40]`, `keysLeft [37]`, `keysRight [39]`, `keysUpward [33]`, `keysDownward [34]`; Q/E, Space and Shift do nothing, and Shift+ArrowUp is not faster (2.55 m vs 2.62 m in 2 s). Re-confirmed in a **second, fresh-Chrome session** with a passing `ArrowUp` positive control: W/A/S/D all `(0, 0, 0)` while ArrowUp/Down/Left/Right moved 8.6 / −9.2 / −5.4 / +7.1 m respectively, and every WASD press left the held-key array empty (**OBSERVED**, `evidence/final_probe.json`, `evidence/wasd_probe2.json`). This **corrects** round 1's suspicion that WASD might be unconfirmed and **contradicts** `ui.walkTip = "First-person camera (WASD / arrows)"` and `ux.keys.walk = "Walk (first-person view; arrows too)"` in the shipped i18n blob (**OBSERVED**, `app_index.html`).
- **Walk is free flight: no collisions, no gravity, no ground follow.** `checkCollisions = false`, `applyGravity = false`, `camera.gravity = undefined`; the scene has `collisionsEnabled = true` and `gravity = (0, −9.807, 0)` and the default ellipsoid `(0.5, 1, 0.5)`, but **0 of the 6 loaded meshes have `checkCollisions`**, so there is nothing to collide with. Teleporting the camera to y = 6 m or (50, 6, 50) leaves it exactly there (**OBSERVED**, `evidence/walk_probe.json`).
- **Eye height is 1.54 m on a flat site, and it is derived, not hard-coded.** Every entry into Walk placed the camera at `(0, 1.54, 0)`, and it is **independent of the project's floor-to-floor height** — changing that setting from 2.65 to 3.5 to 2.0 m left the walk eye at 1.54 m (**OBSERVED**, `evidence/eye_probe.json`). There is no literal `1.54` in any shipped file; the guard code uses `+1.6` and round 1 recorded the site datum as `−0.06`, and 1.60 − 0.06 = 1.54 exactly — i.e. the eye height is **1.6 m above the local ground surface**, which reads as 1.54 m on a flat default project (**INFERRED** from two OBSERVED constants).
- **The entry-time ground guard resets the whole camera outside a ±1.2 m band — it is not a ground-follow.** On each entry into Walk the app tests how far the camera is from the ground surface at eye height; outside the band it re-places the camera at the look-at point's XZ, sets eye height, resets yaw to 0 and re-aims along `+Z`; inside the band it leaves the camera **exactly** alone. I bisected both edges: with the camera at `(7, y, 9)`, y = 0.34 m and y = 2.744 m reset to `(0, 1.54, 0)`, while y = 0.345 m and y = 2.74 m were kept including x/z. Both edges are within 0.005 m of `1.54 ± 1.20` (**OBSERVED**, `evidence/ground_probe.json`, `evidence/ground_probe2.json`, `evidence/guard_probe.json`; code in `deob/hp-editor.js`). Between entries there is **no** ground-follow at all: at y = 6 m or (50, 6, 50) the camera stays put indefinitely (**OBSERVED**, `evidence/walk_probe.json`).
- **The three cameras have deliberately opposite input personalities.** 3D `Camera` (perspective ArcRotate): **left-drag orbits, right-drag *and* Ctrl+left-drag pan**, wheel zooms toward the target, `wheelPrecision 50`, `panningSensibility 1000`, no alpha limits, `beta ∈ [0.01, π−0.01]`, no radius limits — I zoomed 28.28 → 9.60 and 9.60 → 36.44 without hitting a wall. Top `Camera2` (orthographic ArcRotate): all four orbit parameters are pinned to constants so it **cannot orbit or change distance**; the wheel rescales the orthographic half-extents (20 → 5 and back → 29) and **left-drag pans**, with a `panningSensibility` the app recomputes on every zoom (568.18 at ±20, 403.23 at ±15.5) (**OBSERVED**, `evidence/limits_probe.json`, `evidence/pan_probe5.json`, `evidence/pan_probe6.json`).

---

## 2. Findings

### 2.0 How the modes are wired

**OBSERVED** — `deob/hp-ui.js` (offsets ~12715 and ~43784), `app_index.html`, `topbar.json` (round 1).

- One segmented control `#hpViewSeg` with four `button.hp-seg-btn[data-view]` entries: `3d` (icon `view_in_ar`, i18n `ui.view3d` / `ui.view3dTip` "Orbit around the model"), `walk` (`directions_walk`, `ui.walkTip` "First-person camera (WASD / arrows)"), `top` (`grid_on`, `ui.viewTopTip` "Orthographic top view of the 3D scene"), `2d` (`architecture`, `ui.view2dTip` "Open the 2D planner (synced with 3D)").
- The real state lives in two **hidden legacy checkboxes** wrapped in `.hp-legacy-hidden`: `#viewcheck` (= Top) and `#cameracheck` (= Walk). A helper in `hp-ui.js` derives the label
  `viewcheck.checked ? 'top' : cameracheck.checked ? 'walk' : '3d'` and toggles `hp-active` on the three 3D-mode buttons accordingly.
- Clicking a segment button: if the view is not `2d`, it sets `#viewcheck.checked` and `#cameracheck.checked` to match the target and programmatically `.click()`s whichever one differs, then re-syncs the active class; if the view is `2d` it just clicks `#open2DPlanner`. A `change` **and** a deferred `click` listener (`setTimeout(…, 0)`) on the two checkboxes re-run the sync so the segmented control keeps following any other code path that flips the checkboxes.
- **INFERRED**: the checkboxes are the single source of truth, and the top-bar control is a façade over them. That is why round 1 saw `#viewcheck` / `#cameracheck` "retained but hidden".

### 2.1 The three cameras

**OBSERVED** — `evidence/limits_probe.json` (`base.cams`), `evidence/cam_probe.json`, `evidence/pan_probe5.json`.

| | 3D `Camera` | Walk `UniversalCamera` | Top `Camera2` |
|---|---|---|---|
| class | `ArcRotateCamera` | `UniversalCamera` | `ArcRotateCamera` |
| projection | perspective, `fov 0.8` | perspective, `fov 0.8` | **`mode = 1` (ORTHOGRAPHIC)**, `fov` unused |
| `minZ` / `maxZ` | 1 / 10000 | 1 / 10000 | 1 / 10000 |
| position model | alpha `−π/2`, beta `π/4`, radius `28.284`, target `(0,0,0)` → pos `(0, 20, −20)` | free position, y = **1.54** | alpha `−π/2`, beta `0`, radius `28.284`, target `(0, 300, 0)` → pos `(0, 328.284, 0)` |
| alpha limits | **none** (`lowerAlpha = upperAlpha = null`) | — | `lowerAlpha = upperAlpha = −π/2` (pinned) |
| beta limits | `0.01` … `3.1316` (= π−0.01) | — | `lowerBeta = upperBeta = 0` (pinned) |
| radius limits | **none** | — | `lowerRadius = upperRadius = 28.2842712…` (pinned) |
| ortho extents | — | — | `left −20, right +20, top 11.25, bottom −11.25` (16:9 viewport, half-height = 20·9/16) |
| `speed` | 2 | **0.2** | 2 |
| `inertia` / `panningInertia` | 0.9 / 0.9 | 0.9 | 0.9 / 0.9 |
| `wheelPrecision` | **50** | — | **3** |
| `panningSensibility` | 1000 | — | **568.18**, recomputed on zoom |
| pan binding | `_panningMouseButton = 2` (right), `_useCtrlForPanning = true` | — | `_panningMouseButton = 0` (left), `_useCtrlForPanning = false` |
| `checkCollisions` / `applyGravity` | false / false | **false / false** | false / false |
| ellipsoid | — | `(0.5, 1, 0.5)` | — |
| attached inputs | keyboard, mousewheel, pointers | keyboard, mouse, touch, gamepad | keyboard, mousewheel, pointers |
| key arrays | up 38, down 40, left 37, right 39 | up 38, down 40, left 37, right 39, **upward 33, downward 34** | up 38, down 40, left 37, right 39 |

Babylon 6.38 defaults vs app overrides — I read the bundled `src/babylon.js` (round-1 copy): `FreeCameraKeyboardMoveInput` defaults to `keysUp [38], keysUpward [33], keysDown [40], keysDownward [34], keysLeft [37], keysRight [39]`; `ArcRotateCameraPointersInput` defaults to `buttons [0,1,2], angularSensibilityX/Y 1000, panningSensibility 1000, multiTouchPanning true`; `ArcRotateCameraMouseWheelInput` defaults to `wheelPrecision 3`; `UniversalCamera`/`FreeCamera` defaults to `ellipsoid (0.5,1,0.5), checkCollisions false, applyGravity false`; `ArcRotateCamera` defaults to `lowerBetaLimit 0.01`, `upperBetaLimit π−0.01`, `_panningMouseButton 2`, `_useCtrlForPanning true`. Therefore: **the 3D camera and the walk camera are essentially stock Babylon** (only `speed`/`fov`/`inertia` are touched), and **all the interesting customisation is in `Camera2` (Top)** — `mode = 1`, four pinned orbit parameters, `wheelPrecision 3` and the adaptive `panningSensibility`. That also means round 1's `wheelPrecision 50` on the 3D camera is an **app override** (default is 3) that makes the orbit wheel 16× coarser than Babylon's stock feel.

### 2.2 Walk mode — key bindings (the decisive test)

**OBSERVED** — `evidence/final_probe.json`, `evidence/walk_probe.json`, `evidence/common.py`.

**Method.** The page's own keyboard path is `scene.onKeyboardObservable`, which Babylon feeds from a `keydown`/`keyup` listener on the engine's input element (`renderCanvas`). Real CDP `Input.dispatchKeyEvent` events reached the page but **never reached the scene** in this headless build (`document.activeElement` stayed `<body>`; the scene observable recorded nothing after an explicit `canvas.focus()`), which is exactly the "synthetic clicks often did nothing" lesson from round 1 extended to keys. I therefore dispatched `KeyboardEvent`s directly on `#renderCanvas` and **verified they arrive** (the instrumented scene observable recorded `[1, 38, "ArrowUp", false]` for keydown and `[2, 38, "ArrowUp", false]` for keyup). I then compared **held-key state and camera displacement per key** across a fresh run.

Held for 2 s, with the camera neutralised (`position (0,1.54,0)`, `rotation (0,0,0)`, `cameraDirection` zeroed) before each key:

| key | code | camera's held-key array during hold | Δposition (m) |
|---|---|---|---|
| `w` | 87 | `[]` | **(0, 0, 0)** |
| `s` | 83 | `[]` | **(0, 0, 0)** |
| `a` | 65 | `[]` | **(0, 0, 0)** |
| `d` | 68 | `[]` | **(0, 0, 0)** |
| `q` / `e` | 81 / 69 | `[]` | (0, 0, 0) |
| Space | 32 | `[]` | (0, 0, 0) |
| Shift | 16 | `[]` | (0, 0, 0) |
| ArrowUp | 38 | `[38]` | (0, 0, **+5.407**) |
| ArrowDown | 40 | `[40]` | (0, 0, **−7.003**) |
| ArrowLeft | 37 | `[37]` | (**−8.259**, 0, 0) |
| ArrowRight | 39 | `[39]` | (**+5.963**, 0, 0) |
| PageUp | 33 | `[33]` | (0, **+5.470**, 0) |
| PageDown | 34 | `[34]` | (0, **−3.876**, 0) |

Shift+ArrowUp over the same 2 s moved **2.552 m** vs **2.620 m** for ArrowUp alone, i.e. **no run/sprint modifier** (**OBSERVED**, `evidence/final_probe.json`).

**Independent confirmation (fresh Chrome session).** I repeated the matrix in a second browser profile, this time gating on a passing positive control: `ArrowUp` had to move the camera before any negative result was accepted. The control moved **+4.021 m**, after which W/A/S/D each gave exactly `(0, 0, 0)` with an empty held-key array, while ArrowUp/Down/Left/Right gave **+8.585 / −9.209 / −5.420 / +7.074 m** and were each recorded in the held-key array. Because the positive and negative results come from the same session, the same render loop and the same event-dispatch path, the WASD-is-dead conclusion does not depend on the render loop being healthy (**OBSERVED**, `evidence/wasd_probe2.json`). An earlier attempt at this confirmation (`evidence/wasd_confirm.json`) had to be **discarded**: its `ArrowUp` control failed because that tab's Babylon frame counter had frozen, so every zero in it was uninformative. That is the reason the retry is control-gated.

Magnitude cross-checks. Babylon's free-camera speed is `speed · sqrt(Δt / (100·fps))`; with `speed = 0.2` the camera moves a few tenths of a metre per frame, so over 2 s at ~50–60 fps the totals land in the 2–8 m range — consistent with the two-second hold windows. The run-to-run spread (ArrowUp 5.4 m in run 1, 8.6 m in run 2) is expected because the browser session runs on SwiftShader and the frame rate varies; the asymmetry between ArrowUp (5.4) and ArrowDown (−7.0) *within* one run is **INFERRED** to be inertia carry-over plus the fact that my earlier `w`/`s` tests had already latched `cameraDirection`. The **sign and axis** of every arrow, and the all-zero WASD result, are reproduced across both runs; the exact distance is not.

- **Strafing is real**: ArrowLeft/Right move the camera sideways without changing `rotation` — a strafe, not a turn. Turning is done with the mouse (below).
- The Q/E keys, which are a common "up/down" convention in first-person camera code, are **not** bound here; PageUp/PageDown are.
**Static cross-check.** I searched every shipped module (raw `src/hp-*.js` and the deobfuscated `deob/*.js`) plus the decoded string table for any assignment to `keysUp`, `keysDown`, `keysLeft`, `keysRight`, `keysUpward`, `keysDownward`, or for the WASD keycodes 87/65/83/68 as a bound-key array, and found **none** — consistent with the live read that every walk key array is still Babylon's default `[38]/[40]/[37]/[39]/[33]/[34]`, and with WASD having no binding anywhere (**OBSERVED**, `deob/*.js`, `src/hp-*.js`; see §4 unknown 8 for the caveat about computed property names).

- The in-app shortcut sheet is a single SVG (`textures/hotkeys.svg`, embedded via `<object>` in `#modalkey`, i18n title "Keyboard shortcuts"). I downloaded and parsed it; its text nodes are only *"Delete objects · Snap to Grid · Translate objects · Rotate objects · Bonding Box · Copy/Paste objects · Stop wall sketch · Select multiple objects"* — **it does not document camera keys at all** (**OBSERVED**, `evidence/hotkeys.svg`). The only camera-key text in the product is the `ui.walkTip` / `ux.keys.walk` tooltip text quoted above.

### 2.3 Walk mode — mouse look

**OBSERVED** — `evidence/cam_probe.json` (`walk_after_mouselook`), `evidence/final_probe.json`.

- The walk camera attaches `keyboard, mouse, touch, gamepad`. A pointer drag changes `rotation` (yaw **and** pitch): after a drag of `+150 px` right and `+30 px` down, `rotation.y` went `0 → 0.243` and `rotation.x` went `0 → 0.026`, while `position` was unchanged.
- `angularSensibility` is **2000**, which is Babylon's `FreeCameraMouseInput` default — so the app did not tune look sensitivity.
- There is **no pointer lock** in the default path (`isPointerLock` false); the aim is a drag-to-look. **INFERRED**: combined with arrows-only movement, "Walk" is closer to a *drag-to-aim fly-through* than to a conventional FPS.
- **INFERRED** from the design: look-yaw is free (no clamps on `rotation.x/y` were configured), so you can roll past vertical and fly upside down.

### 2.4 Walk mode — collision, gravity, eye height, ground guard
**OBSERVED** — `evidence/walk_probe.json`, `evidence/ground_probe.json`, `evidence/ground_probe2.json`, `evidence/eye_probe.json`.

Collision and gravity, read live on first entry into Walk:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Direct proof that nothing acts on the camera: set `position.y = 6`, then sample every 500 ms for 5 s → `[6, 6, 6, 6, 6, 6, 6, 6, 6, 6]`; set `position = (50, 6, 50)` → still `(50, 6, 50)` after 2.5 s (**OBSERVED**, `evidence/walk_probe.json`). So **you walk through walls and you can leave the floor plane entirely**; gravity is a scene-level setting that no camera or mesh opts into.

Eye height, and its independence from the project setting:

| project `#floorheight` | walk entry `position.y` | y / floorheight |
|---|---|---|
| 2.65 m (default) | **1.54** | 0.58113 |
| 3.0 m | **1.54** | 0.51333 |
| 3.5 m | **1.54** | 0.44000 |
| 2.0 m | **1.54** | 0.77000 |

The eye height is **1.54 m on a flat site**, and it is **not** a fraction of the floor-to-floor height: it does not move when `#floorheight` changes (**OBSERVED**, `evidence/eye_probe.json`). There is no literal `1.54` in any shipped `hp-*.js` or `app_index.html`; the derivation is given with the ground guard below.

The **entry-time ground guard**. Switching 3D→Walk runs a check written around a `+1.6` offset and a `>1.2` distance test (read in the shipped `deob/hp-editor.js`). If the test fires, the camera is **reset wholesale** — placed at the look-at point's XZ, `position.y` set to eye height, `rotation.y` reset to 0, target re-aimed along `+Z`; if it does not fire, the camera is left **exactly** where it was, x/z and yaw included. I bisected both edges of the band with the camera at `(7, y, 9)`:

| `y` on entry | outcome | x/z preserved? |
|---|---|---|
| 0.30, 0.32, 0.336, **0.34** | reset to `(0, 1.54, 0)`, yaw 0 | no |
| **0.345**, 0.36, 0.40 | kept at `(7, y, 9)`, yaw unchanged | **yes** |
| 2.70, 2.72, **2.74** | kept at `(7, y, 9)` | **yes** |
| **2.744**, 2.745, 2.746, 2.75, 2.76, 2.80, 2.90, 3.00 | reset to `(0, 1.54, 0)`, yaw 0 | no |
| `(20, 1.54, 20)` | kept | yes |
| `(0, 5.0, 0)` / `(0, −3.0, 0)` | reset | no |

Both transition edges sit within 0.005 m of `1.54 ± 1.20`, so the firing condition is `|y − 1.54| ≥ 1.2` and the band is **[0.34 m, 2.74 m]** around the 1.54 m eye height (**OBSERVED**, `evidence/ground_probe.json`, `evidence/ground_probe2.json`, `evidence/guard_probe.json`).

**The guard code, verbatim.** From `deob/hp-editor.js` at byte offset ≈ 339 897 (one long line; lightly re-spaced for reading only):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

**OBSERVED** — `deob/hp-editor.js` @ ≈339 897–340 400. Note the two constants are exactly `+1.6` and `>1.2`, `setTarget` adds a **unit horizontal vector** (not the full look-offset), and `position` is a whole-object assignment (which is why x/z/yaw are all reset together). This confirms the live threshold measurement (§2.4) against the source.

**Where the 1.54 comes from — strong inference.** The guard's code literal is `+1.6`, but the measured band centre is 1.5425. The difference is exactly 0.06, and round 1 recorded the site's contour **datum = −0.06** (`ortho_probe.json`, `sync.contours.datum`). So `reference = terrainHeightAt(x, z) + 1.6`, and in the flat default project the ground surface sits at the −0.06 datum, giving **1.60 − 0.06 = 1.54**. This also explains why there is no literal `1.54` anywhere in the shipped files: the walk eye height is a *derived* value, `1.6 m above the local ground surface`, and the 0.06 m ground offset makes it read as 1.54 m on a flat site (**INFERRED** from two OBSERVED constants; it predicts the eye height should change on a sloped/raised terrain, which I did not test — see §4).

**No continuous ground-follow exists.** Because the guard is a one-shot test at mode entry, the camera is free between entries: at y = 6 m or (50, 6, 50) it stays put indefinitely. Step off a balcony in Walk and you keep flying; only re-entering the mode teleports you back. Negative-y placements snap up (the measured lower edge is 0.34 m), so a basement drawn below the model origin is not reachable in Walk.

### 2.5 3D orbit camera — orbit, pan, zoom

**OBSERVED** — `evidence/limits_probe.json`, `evidence/pan_probe5.json`, `evidence/pan_probe6.json`, `evidence/final_probe.json`.

Zoom (wheel) — **radius only, always toward the target, with soft-ramp/inertia behaviour and no hard clamp reached**:

| action | radius after each step |
|---|---|
| 14 × 2 wheel notches in | 28.284 → 28.044 → 27.588 → 26.938 → 26.113 → 25.130 → 24.005 → 21.626 → 20.372 → 19.003 → 17.531 → 15.967 → 12.835 → 11.260 → **9.602** |
| 16 × 2 wheel notches out (after a manual reset to 28.284) | 24.481 → 23.850 → 23.226 → 23.200 → 23.416 → 23.851 → 24.483 → 24.483 → 26.475 → 27.564 → 28.784 → 30.122 → 31.567 → 33.106 → 34.732 → **36.436** |

- The first few "out" readings dip before rising (28.284 → 23.2 → …) because the "in" sweep had left negative `inertialRadiusOffset` that had to unwind; the monotone tail from 26.5 to 36.4 is the true zoom-out. **INFERRED**: this is Babylon's `inertialRadiusOffset` + `inertia 0.9` model, i.e. the wheel is applied as an impulse, not as a linear multiplier.
- **No radius clamp was hit** after 28 notches in or 32 out, matching `lowerRadiusLimit = upperRadiusLimit = null`. At `minZ = 1` a radius below 1 would clip into geometry; the app relies on the user not to.
- **Zoom is not cursor-anchored.** With the wheel dispatched at screen point (200, 150) instead of the centre, radius fell 28.284 → 26.983 while `alpha (−1.5708)`, `beta (0.7854)` and `target (0,0,0)` were all **unchanged** (**OBSERVED**, `evidence/final_probe.json`). The bundled `ArcRotateCameraMouseWheelInput` implements `zoomToMouseLocation` with a `_hitPlane` + `_inertialPanning` path; the input's `zoomToMouseLocation` property is **absent/false** here, so the hit-plane branch is never taken. The zoom always pulls toward the current target.
- `wheelPrecision 50` means one notch ≈ `deltaY / (40 × 50)` added to `inertialRadiusOffset` — 16× coarser than Babylon's stock `wheelPrecision 3` — consistent with the ~0.24–1.7 m per notch I measured.

Orbit and pan bindings (read from `inertialAlphaOffset` / `inertialBetaOffset` / `inertialPanningX` / `inertialPanningY` immediately after a synthetic pointer drag; `_panningMouseButton = 2`, `_useCtrlForPanning = true`):

| gesture | effect on input offsets |
|---|---|
| left-drag (+220, +120 px) | **orbit**: `inertialAlpha −0.11`, `inertialBeta −0.06`; no panning |
| right-drag | **pan**: `inertialPanning (−0.11, +0.06)`; no orbit |
| Ctrl+left-drag | **pan**: `inertialPanning (−0.12, +0.07)`; no orbit |

`onButtonDown` in the bundle is `this._isPanClick = (e.button === this.camera._panningMouseButton)`, which is why the right button (2) is the pan trigger; `_useCtrlForPanning` adds the Ctrl+left route. `panningSensibility 1000` and `panningAxis (1,1,0)` are Babylon defaults, so the pan feel is stock. **Panning end-to-end remains unconfirmed**: the input offsets are set and `panningInertia 0.9` is configured, but `getTarget()` stayed at `(0,0,0)` in every drag I sampled, both immediately and 1.5 s later. **INFERRED**: Babylon 6.38 `ArcRotateCamera` consumes panning into `_viewOffset`, which is applied in the view matrix rather than written back into `_target`, so my `getTarget()` read-out may simply not be the observable that moves; I could not settle it from outside the app (**OBSERVED** for the offsets, **INFERRED** for the conclusion).

### 2.6 Top view — the one camera the app actually customises

**OBSERVED** — `evidence/limits_probe.json`, `evidence/pan_probe.json`, `evidence/pan_probe5.json`, `evidence/pan_probe6.json`.

- `Camera2` is an `ArcRotateCamera` in **ORTHOGRAPHIC** mode (`camera.mode = 1`) placed straight above the plan (`beta = 0`, `radius = 28.284`, target `(0, 300, 0)`, position `(0, 328.284, 0)`), with `lowerBeta = upperBeta = 0`, `lowerAlpha = upperAlpha = −π/2` and `lowerRadius = upperRadius = 28.2842712…`. **All four orbit parameters are pinned**, so no drag can rotate or dolly it — the only inputs that do anything are the wheel and pan.
- Ortho extents are derived from the viewport aspect: `left/right = ∓20`, `top/bottom = ±20 × 9/16 = ±11.25` at a 1600×900 viewport.
- **The wheel changes the orthographic extents, not the radius** (radius stayed 28.284 for every step):

| action | half-extents (`|left|`, `top`) |
|---|---|
| 6 × 2 notches in | 20 → 17 → 14 → 11 → 8 → 5 → 5 |
| 8 × 2 notches out | 5 → 8 → 11 → 14 → 17 → 20 → 23 → 26 → 29 |

So Top has a **real zoom-out past its starting framing** (29 m half-width) and clamps in at 5 m half-width. **INFERRED**: the 5 m in-limit is the app's or Babylon's ortho handling bottoming out; I did not find a configured floor.
- **`panningSensibility` is recomputed by the app as you zoom**: **568.18** at half-width 20, **403.23** after zooming to half-width 15.5 — i.e. panning gets *finer* as you zoom in. Setting the orthographic extents directly did **not** change it (still 568.18 at half-width 40, 20, 10 and 5), so it is driven by the app's own wheel/zoom path, not recomputed per frame. Both readings are exact rationals over the same numerator (**568.1818… = 6250/11**, **403.2258… = 6250/15.5**). This is the clearest piece of deliberate camera tuning in the product: someone made top-view panning scale with the zoom level instead of leaving Babylon's constant 1000 (**OBSERVED** values, **INFERRED** intent; the closed form is unresolved — see §4).
- **Pan binding in Top is the LEFT button, not the right.** `Camera2`'s `_panningMouseButton = 0` and `_useCtrlForPanning = false`, and `panningAxis (1,1,0)`. Live: a left-drag produced `inertialPanning (−0.2728, +0.1488)`, whereas a right-drag produced `inertialAlpha −0.12 / inertialBeta −0.07` — which is a no-op because the alpha/beta limits are pinned. **INFERRED UX consequence**: in Top, right-drag looks like "nothing happens", and left-drag is the only way to slide the plan.
- **Zoom is not cursor-anchored in Top either.** Wheeling at a corner vs at the centre produced the same extents and left `target (0,300,0)` untouched (**OBSERVED**, `evidence/pan_probe.json`).

### 2.7 View transitions

**OBSERVED** — `evidence/final_probe.json` (`transition_trace`), `evidence/limits_probe.json` (`transitions`), `evidence/pan_probe.json` (`2d`), `evidence/cam_probe.json`.

- **Switching is a hard cut, not an animated blend.** Sampling every 100 ms for 1.4 s across a 3D→Walk switch, `scene.activeCamera` was already `UniversalCamera` at the **first** sample and stayed there; no element with a partial opacity covering more than 500 px appeared in any sample, and the canvas has no CSS transition on it. So the change is `scene.activeCamera = …` plus a HUD/grid toggle, with no cross-fade and no fade-to-black (**OBSERVED**).
- **Per-camera state survives round trips.** After an orbit drag the 3D camera held `alpha −1.685, beta 0.785, radius 27.658`; after 3D→Walk→Top→3D it was still `alpha −1.685, radius 27.658`. The Top ortho extents (±29 after zoom-out) also survived a full round trip.
- **Walk entry is a reposition, not a fresh camera**: the same `UniversalCamera` instance is reused (identity and `attached` inputs unchanged), and the entry guard of §2.4 runs each time.
- **2D mode suspends the 3D canvas rather than destroying it**: `#renderCanvas` goes `display:none` with `clientWidth/Height = 0`, the engine keeps reporting its previous render size (1600×813 in my 1600×900 viewport), `#floorplanIframe` becomes the full 1600×813, and `scene.activeCamera` is left exactly as it was (still `Camera2` in my run). Round 1's "the 3D engine's render size drops to 0×0" is refined here: it is the **canvas element** that collapses; `engine.getRenderWidth()/getRenderHeight()` still answer 1600/813 (**OBSERVED**, `evidence/pan_probe.json`).
- **`hp-tour.js` has a second, unrelated `UniversalCamera`.** Its camera-tour feature constructs a temporary `UniversalCamera` to fly a spline of user-recorded viewpoints (`pos`/`target`/`fov` keyframes, Catmull-Rom interpolation, `seconds` and `hold` options, optional `VideoRecorder` capture), restores `scene.activeCamera = prev` and disposes the temp camera on close, and also temporarily hides the grid and the level panel. That is a **fly-through playback path, distinct from the Walk mode**; both end up with a `UniversalCamera` named by the same class (**OBSERVED**, `deob/hp-tour.js`).

### 2.8 Interaction with the rest of the app during these modes

**OBSERVED** — `evidence/walk_probe.json`, `evidence/pan_probe3.json`, `app_index.html`.

- Scene-level flags are **constant across all modes**: `collisionsEnabled true`, `gravity (0,−9.807,0)`, `useRightHandedSystem` false, the same 6 meshes. Nothing in the mode switch touches scene physics.
- The only DOM text that mentions camera keys in the running UI is the Walk tooltip and the shortcut dialog title; `document.activeElement` is never moved to the canvas by the app, and no `tabindex` is present on `#renderCanvas`, which is why keystrokes only work while the canvas has focus by default. **INFERRED**: on a real browser this is invisible for click-then-press flows but would break "just start typing" after a panel interaction.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each ties to a finding above; "schema" refers to `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`. CasaPlazAI today has Plan / 3D / Walk modes, a tool card and an inspector, and already stores a plan in `localStorage` — so these are mostly *small, well-scoped* changes to the camera layer rather than new subsystems.

| # | Idea | Ties to | Why it matters | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Make the Walk key set match the tooltip, and make the tooltip tell the truth.** Bind both WASD *and* arrows to forward/back/strafe, add Q/E or PageUp/PageDown for vertical, and render the real bindings in the UI. 3D House Planner ships "WASD / arrows" in the tooltip and binds **only the arrows** — a one-line UX win for us and a credibility loss for them. | §2.2, §2.3 | Users try W first; a dead W reads as a broken app. | **High** | **Low** |
| 2 | **Ship an explicit, persisted Walk policy: collision on/off, gravity on/off, eye height.** Default to *collide with walls, keep eye height, no gravity* (a proper "walk" rather than their free flight), and expose the toggles in the tool card. Their shipped state is all-off with a ±1.2 m snap band — which is why their Walk can be flown through the floor and out of the building. | §2.4 | Their walkthrough has no walls and no floor; ours can feel solid with ~30 lines. | **High** | **Low** |
| 3 | **Anchor zoom at the cursor in both Plan and 3D.** Their wheel always zooms toward the camera target (`zoomToMouseLocation` off) and, in Top, the wheel rescales extents around the camera centre regardless of where the pointer is. In Three.js this is a few lines in the wheel handler (raycast the pointer, move the orbit target toward the hit point). Big usability win for detail work. | §2.5, §2.6 | Standard in Figma/Blender-style tools; their absence is felt immediately. | **High** | **Low–Med** |
| 4 | **Give each mode an explicit input map, in one typed object.** They scatter it: the Top camera's pan button (`_panningMouseButton = 0`) differs from the 3D camera's (`= 2`), Top ignores right-drag entirely, `_useCtrlForPanning` is the opposite between the two, and none of it is discoverable in the UI. A single `MODE_INPUT_MAP` (mode → {orbitButton, panButton, zoomAxis, keys}) makes the two orbit personalities impossible to drift apart. | §2.1, §2.5, §2.6 | Prevents exactly the inconsistency we just spent an hour documenting. | Med | Low |
| 5 | **Scale pan sensitivity with zoom, the way they do in Top.** Their `panningSensibility` is 568.18 at half-width 20 and 403.23 at half-width 15.5 — they recompute it on the wheel-zoom path so panning stays proportional on screen. We can do the cleaner version: derive screen-space pan from the ortho half-height (or the perspective distance to the target) every frame. | §2.6 | Avoids the "panning is too coarse when zoomed in" complaint. | Med | Low |
| 6 | **Add a persistent ground-follow for Walk rather than a one-shot dead-band reset.** Their guard acts **only** at mode entry: outside `1.54 ± 1.2 m` it teleports and re-aims the camera, inside the band it does nothing, and between entries nothing keeps you on the floor (they stay at y = 6 m indefinitely). If CasaPlazAI floors/walls are already solids, a per-frame raycast-down (or a Babylon-style ellipsoid + gravity) is strictly better and removes their "walk out of the building" trick. | §2.4 | The single biggest quality gap between our Walk and theirs. | **High** | Med |
| 7 | **Derive the walk eye height from the plan's own floor/ground height, and name it.** Their 1.54 m is `1.6 m above the local ground surface` with the site's `−0.06` datum — correct in spirit but undocumented and invisible, and it ignores their own `#floorheight` setting entirely. Ours should be a named constant (`EYE_HEIGHT_M`) applied against the actual floor elevation of whichever level we are walking on, re-derived when the level changes. | §2.4; schema `floorHeight` / level elevation | Removes a whole class of "why is the camera at the wrong height" bugs and makes multi-level walk work. | **High** | Low |
| 8 | **Instant mode cut is fine; keep it — but preserve per-mode camera state explicitly.** Their switches are hard cuts with no fade, and each camera keeps alpha/beta/radius across a 3D→Walk→Top→3D round trip. If our mode switch recreates the camera, we lose that; if it does, snapshot `{target, distance, yaw, pitch, orthoHalfHeight}` per mode in the store so a round trip is lossless. | §2.7 | Cheap continuity win; users notice losing their framing. | Med | Low |
| 9 | **Suspend, don't destroy, the 3D canvas when Plan mode is active** — exactly what they do (canvas `display:none`, engine and camera kept alive, `activeCamera` untouched). In Three.js: `renderer.setAnimationLoop` gated on mode, keep the scene/GPU resources, resize on return. | §2.7 | Instant mode switching and no shader recompiles. | Med | Low |
| 10 | **Reference the three-camera architecture, not four.** They need only three cameras (perspective orbit, perspective walk, orthographic top); the 2D planner is a separate iframe with its own SVG editor. CasaPlazAI has Plan/3D/Walk in one workspace — mapping Plan→orthographic top camera (same `Camera2` idea), 3D→orbit, Walk→free camera gives us a clean one-renderer, three-camera design with no mode-specific renderer. | §2.0, §2.1, §2.7 | Simplest structure that covers all three modes. | Med | Med |
| 11 | **Guardrail: do not copy their input-plumbing indirection.** Their top-bar segmented control is a façade over two hidden legacy checkboxes (`#viewcheck`, `#cameracheck`), with the active class re-derived from checkbox state in a `setTimeout(…, 0)`. Our redesign is already moving to a single source of truth; keep exactly one, and make the segmented control write to it directly. | §2.0 | Avoids the "which one is real?" bug class. | Low (guardrail) | Low |
| 12 | **Guardrail: don't put camera keys only in a bitmap shortcut sheet.** Their `textures/hotkeys.svg` documents selection and snapping but **not one camera key** — camera bindings exist only in tooltip strings. Rendering the shortcut list from a typed keymap means the sheet can never drift from the code (and would have caught their own WASD lie). | §2.2 | Documentation correctness. | Low | Low |

---

## 4. Unknowns

1. **The 1.54 m eye height is a derived value whose ground offset I inferred, not read.** The guard literal `+1.6` and the `−0.06` datum are both directly observed, and they sum to the measured 1.54; but I did not recover the body of `terrainHeightAt(x, z, …)` (it is a helper passed into this closure), and I did not test a raised or sloped terrain. If the inference is right, the walk eye height should rise and fall with the local ground surface. Only the flat-site outcome (1.54 m, invariant to `#floorheight` 2.0/2.65/3.0/3.5) is established (`evidence/eye_probe.json`, `evidence/guard_probe.json`).
2. **Full reset vs guard on Walk re-entry — resolved from source.** `probe_walk` was below the band's lower edge, so the guard's `cam.position = p` branch fired and reset x/z and yaw as well as y; the `probe_ground` cases were inside the band and were preserved. The `deob/hp-editor.js` snippet in §2.4 is a single `if (Math.abs(y - (ground + 1.6)) > 1.2)` with one reset branch, so there is one code path, not two. Residual uncertainty is only measurement jitter at the edge: `probe_ground2`'s first pass at `y = 2.744` read "kept" and `probe_guard`'s re-run read "snapped" — hence "within 0.005 m".
3. **Panning end-to-end.** `inertialPanningX/Y` are set by right-drag (3D) and left-drag (Top), but `getTarget()` never moved in any sample. I could not confirm from outside the app whether the pan is actually applied (via `_viewOffset` in the view matrix) or silently dropped. A visual check or a `scene.onBeforeRenderObservable` read of the view matrix would settle it.
4. **The Top `panningSensibility` formula.** Measured 568.18 at half-width 20 and 403.23 after zooming to half-width 15.5, and it changes on wheel zoom — but **not** when I set the ortho extents directly, which means it is recomputed by the app's own wheel path rather than derived per frame. One concrete clue for a follow-up: both values are exact rationals with the same numerator — **568.1818… = 6250/11** and **403.2258… = 6250/15.5** — but 6250/20 = 312.5 does not match the pre-zoom reading, so the denominator is not simply the current half-width. Sampling `panningSensibility` immediately before and after several single wheel notches, alongside the ortho extents and `engine.getRenderHeight()`, should identify it. No app-side ortho or zoom limit was found in the live object.
5. **Whether the Top ortho in-limit (half-width 5) is configured or emergent.** The zoom-out went past the initial framing to 29, but the zoom-in stopped at exactly 5 in two independent runs. No app-side ortho limit was found in the live object.
6. **Mobile / touch / pinch.** `UniversalCamera` attaches a `touch` input, `Camera2` has `multiTouchPanning true`, `pinchZoom true`, `useNaturalPinchZoom false`, and `Camera` has `pinchDeltaPercentage 0` — but I only dispatched mouse events and never touched the touch path. `onMultiTouch` in the bundle chooses between `_computePinchZoom` and `_computeMultiTouchPanning` based on `pinchToPanMaxDistance`, so the mobile pan/zoom split is untested.
7. **Gamepad.** The walk camera registers a `gamepad` input that I never exercised.
8. **Where the walk camera is *constructed*, and whether the app ever sets `checkCollisions` / `applyGravity` / camera key arrays.** The live object matches Babylon's `UniversalCamera` defaults for `ellipsoid (0.5, 1, 0.5)` and keeps the default arrow keycodes exactly, so there is no evidence of app-side override — but I could not find a construction site or a property assignment for any of `checkCollisions`, `applyGravity`, `gravity`, `keysUp/Upward/Down/Left/Right` in any shipped module (raw or deobfuscated; the strings are not in the extracted string table either). Either the app never touches them (most likely, given the live values are all Babylon defaults) or they are indirected through a computed property name. The absence of an override is itself the finding; the exact construction file/offset remains unknown.
9. **Xbox/PlayStation-style controller and keyboard-modifier combinations** beyond Shift: I tested Shift+ArrowUp only; Ctrl/Alt/Meta combinations with movement keys were not tested.
10. **Frame-rate dependence of walk speed.** Babylon's `_computeLocalCameraSpeed()` is `speed · sqrt(Δt/(100·fps))`, and the page runs on SwiftShader here, so the absolute metres/second I measured (§2.2) are not portable; only the sign/axis/binding conclusions are.
11. **Whether the 3D camera's `beta` clamp is reachable by drag.** I attempted far up/down drags to hit `lowerBeta 0.01` / `upperBeta 3.1316`; `beta` never moved because the pointer handler writes `inertialBetaOffset` rather than `beta` directly (the same discrepancy as unknown 3). So the clamps are **configured** but their reachability through a real drag is unverified.
12. **Two-finger trackpad pan on desktop.** `wheelXAction`/`wheelYAction` and the wheel-with-Ctrl path were not explored; I sent one Ctrl+wheel burst with no effect, but a real trackpad gesture may resolve differently.
13. **`zoomToMouseLocation` on the Top camera.** I could not read this property on `Camera2`'s wheel input through the live object, so "Top zoom is not cursor-anchored" rests on the behavioural result (corner vs centre wheel gave identical extents and an unchanged target), not on the flag.
