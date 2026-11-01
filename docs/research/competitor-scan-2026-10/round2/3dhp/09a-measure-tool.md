# 3D House Planner — the Measure tool live: distance/angle, pinning, snapping, display, removal

Round-2 deep dive for **CasaPlazAI**. Subject: **3D House Planner**, <https://www.3dhouseplanner.com/>
(browser editor, Babylon.js; 2D planner iframe at `2D-Planner/index.php`).

**Scope of this round.** Round 1
(`~/dsh-workspaces/rea-3dhouseplanner-2026-10/09-09-measurements-levels/report.md`, read-only,
reused here) established the existence, strings and static code of two measuring systems and left
"the Measure tool was not exercised live end-to-end" as its Unknown #1. This round **exercises the
Measure tool live** in a real headless Chromium with software WebGL, and goes deep on the exact
question: *distance/angle, pinning, snapping targets, display and removal*. It also closes round-1
Unknowns #1, #2 (partly), #5 (partly) and #6.

**Evidence tags.** `OBSERVED` = seen in a live captured page, DOM, JS state or the site's own
JavaScript (`evidence/`, `bundles/`). `DOCUMENTED` = stated by the vendor. `INFERRED` = my reasoning.

**Note on code.** 3D House Planner is proprietary (footer *"© 2022-2026. All rights reserved."*).
Everything below describes behaviour, identifiers and UX in my own words; the obfuscated bundles the
site served me are kept locally as evidence only and are not reproduced in this deliverable.

Local evidence: `evidence/` (236 files, per-scenario `*-log.json` + step dumps), `scenarios/`
(reproducible scenario JSON + `deobf.mjs`), `bundles/` (local deobfuscation), `driver.mjs` (the
harness), `sources.json`.

---

## 1. Summary

- **The Measure tool was driven end-to-end live for the first time.** A headless Chromium launched
  with software WebGL (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`)
  reached `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, the editor booted to `app.php`, and synthetic
  `page.mouse` clicks **did** register as Babylon `POINTERTAP` events once the click point was
  projected from a world coordinate through the same camera (`OBSERVED`, `driver.mjs`, `evidence/d4-*`,
  `evidence/d5-*`). Every measurement below was read back from `HPMeasure.state()`, the DOM and the
  Babylon scene graph — not from screenshots.
- **It is a true click-click tape measure, not drag.** Distance mode takes 2 taps, angle mode exactly
  3 taps *with the second tap as the vertex*; after the final tap the readout finalises and the point
  buffer resets, so a pinned measurement requires no extra confirmation click (`OBSERVED`, `evidence/d4-measure-live.json`).
- **Snapping is screen-space and silent.** The pick silently logs a snapped point if a candidate list
  vertex (wall corner, opening corner, floor-polygon corner, object bounding-box corner) projects
  within **14 px** of the cursor; otherwise it falls back to the raw pick — or, if nothing is hit,
  **projects the cursor onto the ground plane y=0** (`OBSERVED` live + `bundles/hp-measure.pretty.js`).
  There is no snap indicator, label or toast: only a CSS class on the cursor marker — and that class
  was never observed to appear in a real browser (see 2.5).
- **Shift is a genuine 3-axis axis-lock, verified numerically.** With Shift held the second click
  keeps only the dominant component, and X wins ties (`x ≥ y` and `x ≥ z`). A click at world
  x≈2.90, z≈1.00 became a measured 2.40 m purely-horizontal line to `[2.90, 0.06, 0.44]`
  (`OBSERVED`, `evidence/d5-snap-axis.json`).
- **Pinning stores points in 3D world metres, and the project persists them.** With *"Keep the
  measurements in the project"* checked (the **default**), a finished measurement is appended to an
  in-memory list; the list is written into the project as a `measures` array and **survived a full
  page reload** (1 measurement, 6.00 m, before and after). With the checkbox off the finished
  measurement only becomes a non-persistent overlay (`OBSERVED`, `evidence/d7-*`, `evidence/d8-*`,
  `evidence/d12-*`). Removal is per-item and clear-all, and removing the measured wall does **not**
  remove the measurement.

---

## 2. Findings

### 2.1 Live setup: how the Measure tool was driven, and why it now works

- **Software WebGL is enough.** Launched
  `~/Library/Caches/ms-playwright/chromium-1243/.../Google Chrome for Testing` headless with
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-webgl`, and
  `canvas.getContext('webgl2').getParameter(VERSION)` returned `WebGL 2.0 (OpenGL ES 3.0 Chromium)`
  (`OBSERVED`, harness `driver.mjs`; the round-1 note that headless Chromium had no WebGL is thereby
  qualified for this machine).
- **Entry path.** `https://www.3dhouseplanner.com/index.php` → the site's own CTA
  (`#about a.l-btn-primary`) → 22 s boot → *Start designing* → 20 s → the editor is at
  `https://www.3dhouseplanner.com/app.php` with `BABYLON`, `HP3D`, `HPMeasure`, `HPDims`, `HPUnits`,
  `HPUI`, `HPBIM` all defined (`OBSERVED`, `evidence/d1-9-end.json`, `evidence/d3-*`).
  A direct `app.php` navigation first is what round 1's scenario did and is what confused it.
- **Round-1's "synthetic canvas clicks did nothing" is now explained, not just worked around.** The
  module listens on `scene.onPointerObservable` for `POINTERMOVE | POINTERTAP` and reads
  `scene.pointerX/pointerY` (`OBSERVED`, `bundles/hp-measure.pretty.js`). Raw page coordinates
  therefore work, but a click only lands on the intended geometry when it is computed by projecting
  the target *world* point through the live camera:
  ```js
  // helper used by every scenario in this round (evaluated in-page, not copied into the product)
  const r = canvas.getBoundingClientRect();
  const v = BABYLON.Vector3.Project(worldPoint, BABYLON.Matrix.IdentityReadOnly,
              scene.getTransformMatrix(),
              scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
  // click at (r.left + v.x, r.top + v.y)
  ```
  With that, a click aimed at world `(-3, 0, -3)` measured a clean `[-3, 0.06, -3]` endpoint and the
  readout said `6.00 m / horizontal 6.00 m / height 0.00 m` (`OBSERVED`, `evidence/d8-openings-persist.json`).
- **The scene can be built from the page's own API** rather than by drawing: `HP3D.buildWall({x1,z1,x2,z2,thickness,height,baseY,level})`
  returns a merged wall mesh (four calls produced four `wall_merged` meshes, `thickness 0.2`,
  `height 2.65`), `HP3D.buildSlab({points:[[x,z],…],level})` extrudes a floor polygon,
  `HP3D.placeOpening({wall,t,kind,width,level})` places a door/window on a wall
  (`OBSERVED`, `evidence/d5-snap-axis.json`, `evidence/d8-*`, `evidence/d11-*`; signatures read from
  the deobfuscated `hp-editor`). This is how deterministic snap targets were created.
- **The Measure panel is built at runtime into `#hpMeasureOpts` and only after the tool checkbox
  `#measurecheck` is ticked**; before that the container is empty (`OBSERVED`, `evidence/d2-measure-on.json`).
  It renders: a Distance/Angle segmented group, a live readout (`aria-live="polite"`), the hint
  paragraph, the pin checkbox, the pin list (only when non-empty), the *Dimensions in 3D* block and a
  *Stats* button.

### 2.2 Distance mode, live

- **Two clicks, then it is done.** State (`HPMeasure.state()`) stays `[]` after the first click and
  contains one `{kind:'dist', p:[a,b]}` after the second (`OBSERVED`, `evidence/d5-snap-axis.json`,
  `evidence/d4-measure-live.json`).
- **Readout states live**: before the first click *"Click the first point"*; after the first click
  *"Click the next point"* (i18n `measure.start`, `measure.next`); after the second click
  `<strong>5.80 m</strong><small>horizontal 5.80 m · height 0.00 m</small>` (`OBSERVED`).
- **The three numbers are computed from one vector** `d = p1 − p0`: total `d.length()`, horizontal
  `hypot(d.x, d.z)`, height `abs(d.y)` — so the height component is unsigned and the total is the true
  3D length (`OBSERVED` formula in `bundles/hp-measure.pretty.js`; the horizontal+height split is the
  round-1 finding, now confirmed by the live readout).
- **THREE-DIMENSIONAL snapping is real, and makes sloped measurements exact.** Clicking the world
  point `(-3, 2.65, -3)` while it was inside the 14 px snap window stored literally
  `y = 2.650000047683716` (float32 of 2.65) rather than a picked surface point, and the readout was
  `6.00 m / horizontal 6.00 m / height 0.00 m` (`OBSERVED`, `evidence/d6-ux.json`). A wall-top corner
  is therefore a first-class 3D snap target, which is what makes a sloped/diagonal measurement exact.
- **When nothing is hit it still measures.** After a first point on a wall, the second click at world
  `(0, 1.3, 3.0)` — a direction where there was **no wall to hit** — produced endpoint
  `[0.0000015, 1.3813, 2.90]`, i.e. the cursor ray projected onto the ground plane y=0, and the
  readout `6.00 m / horizontal 6.00 m / height 0.03 m` (`OBSERVED`, `evidence/d6-ux.json`).
  `INFERRED`: a full drag-to-measure `pointerup` needs a camera drag; the module only reacts to taps
  (`POINTERTAP`), and taps are click-click, so a drag gesture is not a measurement gesture.

### 2.3 Angle mode, live

- **Exactly three taps, and the second is the vertex** — matching the hint
  *"Click three points: the second one is the vertex"* (`measure.startAngle`). Verified live: after
  the first tap the readout showed `0.00 m / horizontal 0.00 m · height 0.00 m`, after the **second**
  tap it flipped to `90.0°`, and after the third it stayed `<strong>90.0°</strong>`
  (`OBSERVED`, `evidence/d4-measure-live.json`, `evidence/d7-remove-angle.json`).
- **Formula**: `acos( clamp( dot(v0−v1, v2−v1) / (|v0−v1|·|v2−v1|) , −1, 1 ) ) · 180/π`, with a
  `max(1e-9, …)` guard on the denominator; the pitch angle is unaffected by yaw
  (`OBSERVED`, `bundles/hp-measure.pretty.js`).
- **Stored shape**: `{kind:'angle', p:[a, vertex, b]}` — verified live as
  `{"kind":"angle","p":[[-3,0.06,-3],[-3,0.06,3],[3,0.06,3]]}` for a right angle at the second point
  (`OBSERVED`, `evidence/d7-remove-angle.json`).
- **Formatting** is always degrees with **one decimal** and the `°` suffix
  (`toLocaleString(locale,{min/maxFractionDigits:1}) + '°'`), so the unit switch never changes an
  angle — `90.0°` in both metric and imperial (`OBSERVED`, `evidence/d7-remove-angle.json`).

### 2.4 Pinning, live

- **Default is ON.** `localStorage["hp-measure"]` seeds `{mode:'dist', pin:true}`; the rendered
  checkbox came back `checked` (`OBSERVED`, `evidence/d2-measure-on.json`). After a session in which
  the box was unticked it read back `{"mode":"angle","pin":true}`, and after unticking
  `{"mode":"dist","pin":false}` — i.e. **mode and pin are persisted per browser under one key**
  (`OBSERVED`, `evidence/d7-9-end.json` localStorage, `evidence/d6-9-end.json`).
- **What pinning changes is only whether the finished item enters the saved list.** In `hp-measure`'s
  tap handler, when 2 (or 3) points are collected the same `{kind,p}` object is created either way;
  `pin` decides `pinned.push(item)` (with a `markDirty`) versus `pending = item` (a transient overlay)
  (`OBSERVED` in `bundles/hp-measure.pretty.js`, and behaviourally in `evidence/d6-ux.json`).
  With pin **off**, a finished measurement drew its overlay line and its label (`5.24 m`) but
  `HPMeasure.state()` stayed empty and no list appeared; with pin **on**, the same action produced a
  list item (`OBSERVED`, `evidence/d6-ux.json` vs `evidence/d5-snap-axis.json`).
- **The pin list UI** (present only when non-empty) is an `<ol class="hp-measure-list">` of
  `<li>` rows, each `icon + formatted value + a close button` with
  `data-m-del="<index>"` and `title="Remove this measurement"`, followed by a full-width
  `data-m-act="clear"` button labelled *"Remove all measurements"* (`OBSERVED` markup extracted from
  `#hpMeasureOpts`, `evidence/d7-remove-angle.json`, `evidence/d5-snap-axis.json`).
- **Toggling pin off mid-session** sets `pending = null` and redraws, so the just-finished unfiled
  measurement's *live* overlay disappears (`OBSERVED` in `bundles/hp-measure.pretty.js`).
- **Measurements are member data, but the tool never references them by host.** `HPMeasure` exposes
  only `active`, `state()` and `setState()`; there is no `clear()` or `removeAt()` on the public
  object (`OBSERVED`, `evidence/d1-9-end.json` probe: `active,state,setState`). Removal is done by
  clicking the rendered buttons (`OBSERVED`, `evidence/d7-remove-angle.json`).

### 2.5 Snapping targets, live

- **The candidate list is rebuilt lazily** on the first move/click and cached; it is invalidated by
  the editor's `created | deleted | moved | imported | level | ready | projectLoaded | projectCleared`
  events (`OBSERVED`, `bundles/hp-measure.pretty.js`).
- **Candidates** (`OBSERVED` in `bundles/hp-measure.pretty.js`):
  - **Wall corners**: for each wall, the two endpoints × thickness offset (±½ thickness along the
    segment normal) × base height and top height = **8 points**.
  - **Floors**: for each `slab` whose metadata carries a polygon, its `points` placed at the slab's
    world `max.y` (also consumed by the *Room areas* dimension category).
  - **Openings and objects**: the **8 corners of the world bounding box** of `door`, `window`,
    `object`, `slab` and `frame` elements.
  - **Terrain excluded**, and the auto-generated `wall_merged` mesh is skipped so the real wall
    element supplies the corners.
- **Radius is 14 px, screen-space, z-tested.** Each candidate is projected with `Vector3.ProjectToRef`
  using the current transform matrix and the full canvas viewport; candidates with a projected `z`
  outside `]0,1[` (behind/at the near or far plane) are dropped, then the nearest candidate whose
  screen distance to `scene.pointerX/pointerY` is `< 14` wins (`OBSERVED`, `bundles/hp-measure.pretty.js`).
- **Verified live:** a floor-polygon corner `(3, 0.05, 3)` reported snapped; a wall-top corner
  `(-3, 2.65, -3)` reported snapped **and stored exactly 2.65**; a door's top corner reported snapped
  (`OBSERVED`, `evidence/d9-snaptargets.json`, `evidence/d6-ux.json`, `evidence/d11-door-2d.json`).
- **Mid-edge is not a snap target — in 3D.** Hovering the midpoint of a wall, or of a slab edge, at
  30 px from any corner never reported snapped and always stored the raw pick (`OBSERVED`,
  `evidence/d6-ux.json`, `evidence/d9-snaptargets.json`). Windows snap to opening **corners**, not
  along the opening. `INFERRED`: this is why the hint promises "corners … and objects" and not edges.
- **The marker class lies.** The tool toggles `hp-snapped` on the `div.hp-measure-marker` whenever the
  current resolution has `snap:true`, and every probe script (including a check of the marker's class
  string after a hover) reported a bare `hp-measure-marker` even when `state()` proved the stored
  point was exactly the projected candidate (`OBSERVED`, `evidence/d5-snap-axis.json` vs
  `evidence/d6-ux.json`). `INFERRED`: a CSS-class timing/repaint subtlety; either way the class is
  **not** a usable signal, and the app exposes **no** snap indicator, label, toast or sound.
  The user gets no confirmation that a snap occurred.
- **Axis lock (Shift).** Hovering/moving with Shift sets a flag from `event.shiftKey`, and the next
  accepted point is replaced by its dominant-axis projection relative to the previous point: if
  `|dx| ≥ |dy|` and `|dx| ≥ |dz|` keep only x; else if `|dy| ≥ |dz|` keep only y; else keep only z
  (`OBSERVED`, `bundles/hp-measure.pretty.js`).
  - Reference point for the second three-axis tie-break case is `[0.4985, 0.06, 0.4385]` and the
    axis-locked result was `[2.8999999985, 0.06, 0.43850148]`; the readout said **`2.40 m /
    horizontal 2.40 m / height 0.00 m`** (`OBSERVED`, `evidence/d5-snap-axis.json`).
- **Snap wins over axis lock for the first point of a measurement.** The first accepted point uses the
  snapped/ground point unchanged, so Shift cannot shift point 1 off a wall corner
  (`OBSERVED`, `bundles/hp-measure.pretty.js`).

### 2.6 Display, live

- **Two Babylon line systems, one colour each** (`OBSERVED`, `bundles/hp-measure.pretty.js`):
  - **Live** preview while collecting: `CreateLineSystem("hpMeasureLive", …)` in the teal
    `Color4(0.12, 0.44, 0.41, 1)`; for distance it is the single segment point→cursor, for angle the
    two segments vertex→p1 and vertex→p2.
  - **Committed** overlay rebuilt on any change: `CreateLineSystem("hpMeasure", …)` in the amber
    `Color4(0.93, 0.45, 0.1, 1)`.
  - Both are `isPickable = false` and `renderingGroupId = 1`, so they draw over the model and can
    never be a snap/selection target. Only the committed mesh existed at rest; the live mesh existed
    only mid-measure (`OBSERVED`, `evidence/d4-measure-live.json` `["hpMeasureLive"]` after one
    point, `["hpMeasure"]` at rest).
  - For a **distance**, a small perpendicular foot is drawn at each endpoint (8 % of the segment
    length, capped at 0.08 world units) — a two-tick dimension line. For an **angle**, no foot ticks.
  - Verified colour live: `getVerticesData(ColorKind)` on `hpMeasure` returned `[0.12, 0.44, 0.41, 1]`
    (`OBSERVED`, `evidence/d10-final.json`), i.e. the *live* teal — `INFERRED`: the committed system
    reuses the live mesh while a preview is on screen, so the "committed" mesh can briefly carry the
    live colour. The two-colour design is nonetheless explicit in source.
- **Labels are DOM, not 3D text.** Each measurement gets a `span.hp-dim-label.hp-measure-label`
  appended to a body-level overlay layer via the dims module's `overlay()` factory, positioned by
  `style.transform = translate(x,y) translate(-50%,-50%)` in canvas-relative coordinates. Live CSS:
  `position:fixed`, white text on the teal `rgb(31,111,104)`, `font-size:11.5px`, `padding:1px 5px`
  (`OBSERVED`, `evidence/d10-final.json`, `evidence/d4-measure-live.json`). The live preview uses the
  additional class `hp-measure-live` (`OBSERVED`, `evidence/d4-measure-live.json`).
- **The pin list and the readout are the numeric display**; there is no floating tooltip and no on-canvas
  chip (`OBSERVED`, panel markup).
- **Units switch relabels committed measurements live.** Toggling `HPUnits.toggle()` to `ft`
  (factor `3.28084`) changed a 6.00 m label to **`19'-8"`** while the angle label stayed `90.0°`; toggling
  back restored `6.00 m` (`OBSERVED`, `evidence/d7-remove-angle.json`). Lengths become feet-inches;
  angles do not change.
- **Labels persist while the tool is off.** Unticking the Measure checkbox removed the readout/marker
  (`display:none`, `active:false`) but the labels for the two pinned measurements stayed on screen
  (`OBSERVED`, `evidence/d7-remove-angle.json`). `INFERRED`: turning the tool off stops new measuring;
  it is not a "hide measurements" switch.
- **Marker**: `div.hp-measure-marker`, `position:fixed`, `10×10 px`, `border-radius:50%`,
  `border:2px solid rgb(238,115,25)` (the same amber), `z-index:4`, positioned by `translate(px,px)
  translate(-50%,-50%)`; hidden (`display:none`) when the tool is off or no pick is under the cursor
  (`OBSERVED`, `evidence/d10-final.json`, `evidence/d7-remove-angle.json`).

### 2.7 Removal, live

- **Per item**: clicking the `close` button with `data-m-del="<index>"` splices that index out of the
  pinned array, calls the BIM module's `markDirty`, rebuilds the line systems and re-renders the panel.
  Verified: 2 pinned measurements → click `data-m-del="1"` → `state()` = 1 measurement and only one
  list row remained (`OBSERVED`, `evidence/d7-remove-angle.json`).
- **Clear all**: `data-m-act="clear"` empties the pinned array, empties `pending`, calls `markDirty`,
  rebuilds (deleting the `hpMeasure` overlay mesh when nothing is left) and re-renders. Verified twice:
  `had:1 → now:0` with the list node gone (`OBSERVED`, `evidence/d4-measure-live.json`,
  `evidence/d5-snap-axis.json`).
- **Escape cancels an in-progress measurement only.** With one point collected (*"0.00 m / horizontal
  0.00 m"*) pressing Escape reset the buffer to *"Click the first point"* and the previously pinned
  measurement was still there (`OBSERVED`, `evidence/d7-remove-angle.json`).
- **Removing the measured wall does not remove the measurement.** Deleted one of the four walls via
  `HP3D.disposeElement`, then the pinned 6.00 m measurement was still in `state()`, its label still
  rendered, and the `hpMeasure` overlay mesh still present (`OBSERVED`, `evidence/d12-stats-reload.json`).
  `INFERRED`: measurements are free-floating world data with no reference to a host element — the
  opposite of doors/windows, which are hosted on a wall.
- **Removal has no undo of its own**; the module itself only calls `markDirty`, so whatever the BIM
  history offers applies (`OBSERVED` for `markDirty` in `bundles/hp-measure.pretty.js`;
  `INFERRED` that this is the same undo stack as element edits).

### 2.8 Data model, persistence, and the CasaPlazAI schema bridge

- **Public surface** (`OBSERVED`, `evidence/d1-9-end.json`): `window.HPMeasure = { get active(), state(), setState(x) }`
  — only three members. `state()` deep-copies the pinned list as `{kind:'dist'|'angle', p:[[x,y,z],…]}`;
  `setState` filters to entries whose `kind` is `'dist'`/`'angle'`, whose point count is exactly 2
  (dist) or 3 (angle), and whose every coordinate is `isArray(finite)`; then it clears `pending`,
  cancels any in-progress measurement, rebuilds overlays and re-renders (`OBSERVED`,
  `bundles/hp-measure.pretty.js`).
- **Coordinates are 3D world metres, Babylon convention `(x, y=up, z)`**, copied verbatim from the
  candidate/pick (`OBSERVED`, `evidence/d7-remove-angle.json`).
- **Project persistence**: `hp-bim`'s serializer emits a **`measures`** array
  (`window.HPMeasure ? HPMeasure.state() : []`) alongside `settings, camera, levels, levelInfo, site,
  norms, sun, tour, efficiency, classification, ifc, types, budget, elements, terrain, plan, georef,
  check, sync` (`OBSERVED` live: `HPBIM.serialize()` returned those top-level keys with a populated
  `measures` array matching `state()` exactly — `evidence/d8-openings-persist.json`).
  On load it calls `HPMeasure.setState(payload.measures || null)`
  (`OBSERVED`, `bundles/hp-bim.js`): `'measures':window['HPMeasure']?window['HPMeasure'].state():[]`.
- **Reload survival proven.** Pinned a 6.00 m measurement, called `HPBIM.save()` (a promise), reloaded
  the page, and after re-boot `HPMeasure.state()` still held
  `[{"kind":"dist","p":[[-3,0.06,-3],[3,0.06,-3]]}]` with the label `6.00 m` rendered and the (reduced)
  wall set intact. The durable store is **IndexedDB** — localStorage held only autosave/history keys
  and `hp-measure`/`hp-units` preferences (`OBSERVED`, `evidence/d12-stats-reload.json`).
- **Preference keys**: `hp-measure` = `{mode, pin}`. `hp-dims` = `'1'` and `hp-dims-opts`
  (round-1 finding, unchanged). `hp-units` = `'m'|'ft'`. **Pinned measurements are project data,
  `mode`/`pin` are browser preferences** — a clean split.
- **Stats button** (`data-m-act="stats"`) closes the loop with the quantity take-off: it calls the
  shell's `openPanel('qto')`. Verified live: the click opened `<aside id="hpBimPanel" role="dialog"
  aria-label="BIM model">` — the BIM/quantities side panel (`OBSERVED`, `evidence/d12-stats-reload.json`).
- **Bridge to CasaPlazAI's schema.** The CasaPlazAI contract deliberately keeps
  *"Measurement annotations — persisted under their own key"* **out of** `FloorplanData`
  (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`). 3D House Planner does the same thing
  at the *editor-state* level (`mode`/`pin` are localStorage) but puts the **measurement list itself
  into the saved project** under `measures` — a third option CasaPlazAI should choose consciously.
  Their stored shape maps cleanly onto the plan's XY-metre convention: a `dist` entry's two points are
  `[x,y,z]`; the CasaPlazAI analogue is `{kind:'dist', p:[[x,z],[x,z]]}` plus an optional `y` per
  point, or a per-floor `{floorId, kind, points}` list if measurements are to be floor-scoped.

### 2.9 The 2D planner's own Measure tool (cross-check)

- The editor's *2D plan* view is an iframe `#floorplanIframe` →
  `https://www.3dhouseplanner.com/2D-Planner/index.php?lang=en`, same-origin and scriptable
  (`OBSERVED`, `evidence/d11-door-2d.json`, `evidence/d10-final.json`).
- Its window exposes `floorplanEditor`, `serializePlan`, `applyPendingModel`, and history/save hooks;
  its tool button list includes **Straighten** (the measure tool), alongside *Cut*,
  *Make separation*, *Reverse hinges*, *Paste door / window*, etc. (`OBSERVED`,
  `evidence/d11-door-2d.json`).
- There is **no `measure()` method** on `floorplanEditor`, and its 37 keys plus its prototype contain
  no `measure|dist|angle|dimen` member — so the 2D measure tool is state-driven by its *Straighten*
  mode, not callable as an API (`OBSERVED`, `evidence/d11-door-2d.json`, `evidence/d13-2d-editor-measure.eval.json`).
- **The 2D plan's own serialisation has no measurement slot at all.** `serializePlan()` returns exactly
  `{objData, wallData, roomData}` and no `measure`/`measures` key (`OBSERVED`,
  `evidence/d13-2d-serialize-measure.eval.json`). So the 2D *Straighten* numbers are **not saved with
  the 2D plan**; they are transient, or kept under a separate key — in contrast with the 3D tool,
  whose list *is* in the project (`measures`, finding 2.8).
- **The 2D planner does have snap UI; the 3D Measure tool does not.** The iframe window exposes
  `setGridSnapEnabled`, **`updateGridSnapUI`**, `grid_snap`, `calcul_snap`, `snapObjectToWall`,
  `arcToolSnap` (`OBSERVED`, `evidence/d13-2d-globals-measure.eval.json`), matching round-1's
  `msg.snapOn/Off`, `msg.gridOn/Off`, `msg.snappedToWall` *"Snapped to wall (hold Alt to place freely)"*.
  `INFERRED`: the product already knows how to announce a snap in 2D; the 3D Measure tool simply
  never got the same feedback — which sharpens the round-1 observation and idea 1 below.
- Round 1's read of the 2D layer strings stands: `layers.measures` *"Show or hide wall measurements"*,
  `layers.angles`, `tool.measure.tip` *"Measure: click the start, then the end point"*,
  `arc.measure` *"Radius {radius} · Arc {length}"* — i.e. the 2D planner's measure is a **2-click
  distance with a layer toggle for wall measurements and angles**, and it is a **separate
  implementation** from the 3D tool (`OBSERVED` round-1 i18n map `evidence/2dplanner-i18n.json`).
- The 2D view itself is a full-viewport iframe (`1600×1000` at `top:0,left:0`, `display:inline`)
  reached from three toolbar entries — *"Open the 2D planner (synced with…)"*, *"2D plan"* and a
  *straighten* button (`OBSERVED`, `evidence/d13-open-2d.eval.json`, `evidence/d13-iframe-visible.eval.json`).

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each ties back to a finding above and, where it touches the schema, to
`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`. CasaPlazAI today has a measure tool,
0.5 m grid snapping, shared walls, doors/windows, a small palette, 3D walkthrough, PNG/JPEG export
and localStorage autosave. **Round 1's Tier-1 ideas already cover persistence of pinned measurements;
these are the round-2 additions and corrections on top of them.**

### Tier 1 — high value, low effort

1. **Make the snap silent-but-visible: show *what* was snapped to** *(finding 2.5)*. The competitor's
   biggest miss is that snapping is invisible — verified: nothing in the DOM says "corner of wall",
   and even their own `hp-snapped` class never rendered, even though the 2D planner *does* announce
   snaps (`updateGridSnapUI`, *"Snapped to wall (hold Alt to place freely)"*, finding 2.9).
   CasaPlazAI already snaps to the 0.5 m grid; extend the readout to name the target
   (*"grid 0.5 m"*, *"wall corner"*, *"door edge"*) and tint the marker. Cheap: a string plus one CSS
   class, and it turns a hidden 14 px hit-test into a feature users can trust. This also fixes the
   only reason users would re-measure "to be sure".

2. **Snap to corner-endpoint in 3D, at the wall's true top and bottom, and store the 3D point**
   *(finding 2.2)*. The competitor's 8-points-per-wall candidate set (2 ends × ±thickness/2 ×
   top/bottom) is the minimum needed to make a sloped measurement exact; CasaPlazAI measures in 2D
   plan metres today, so any wall-top/sill/diagonal measurement is currently impossible. Add
   `{(x,y,z)}` points with `y` from the wall's height/`wallsOverride`, and keep the readout's
   `horizontal · height` breakdown (finding 2.2) — it is the one readout shape that makes a sloped
   tape measure self-explanatory.

3. **Pin = "keep in project", default ON, with the pin list in the inspector** *(findings 2.4, 2.8)*.
   The competitor persists `mode`/`pin` as one browser preference and the **measurements themselves
   as project data** (`measures`). CasaPlazAI's schema already reserves a separate localStorage key
   for measurement annotations — keep that key for the *tool preference* (`{mode, pin}`) and put the
   *annotation list* into the saved plan (or, if staying strictly schema-clean, into a
   `casaplaza.measures.v1` key that is **included in the autosave payload**, since the schema note
   says only that it is out of `FloorplanData`, not that it may not be persisted). The list UI is a
   model worth copying exactly: `<ol>` rows of *icon + value + ✕*, then one *Remove all* button.

4. **Angle mode with the second click as the vertex, and angles that do not follow the units switch**
   *(finding 2.3)*. Their rule — `acos(dot/(|a||b|))`, one decimal, `°`, always degrees — is the
   right, unglamorous choice. The specific UX detail worth copying is that the readout switches from a
   *distance* to an *angle* the moment the vertex is clicked, which teaches the 3-click grammar
   without a tutorial. Effort: one extra state in the existing measure tool.

5. **A Shift axis-lock that is a real 3-axis projection, with the dominant axis echoed in the label**
   *(finding 2.5)*. Their rule is `|dx| ≥ |dy| ∧ |dx| ≥ |dz| → keep x`, else `|dy| ≥ |dz| → keep y`,
   else `keep z`, i.e. X wins ties. First-point snapping is applied before the lock, so Shift can
   never drag an endpoint off a snapped corner. Combines well with CasaPlazAI's 0.5 m grid for
   orthographic-alignment taps; showing *"X-locked"* in the readout is the 5-line addition.

6. **Per-item ✕ and Remove all, plus Esc to cancel the in-progress measurement** *(finding 2.7)*.
   Esc only cancels the *pending* points and leaves pinned measurements untouched; removal is a
   splice at the clicked index followed by a rebuild. Removing the measured wall keeps the measurement
   — which means measurements must be treated as free-floating annotations, not as data host-linked
   to a room/wall (a design decision CasaPlazAI should make explicitly, because it is the opposite of
   how its `Opening.roomId` references work).

### Tier 2 — valuable, medium effort

7. **Render measurements with two line systems, one colour each, `renderingGroupId = 1`,
   `isPickable = false`, and foot ticks on distances only** *(finding 2.6)*. This is the cheapest
   possible 3D dimension: no fonts, no meshes, no materials. The extra touch that makes it read like
   a drawing is the small perpendicular foot at each distance endpoint — and the deliberate omission
   of feet for angles.

8. **DOM labels projected each frame, with the dims module's shared declutter pass** *(findings 2.6,
   round-1 2.2)*. Reuse the same `span.hp-dim-label` overlay layer and per-frame projection so manual
   measurements and automatic dimensions never fight over the same screen space, and one
   collision/off-screen pass covers both. Bonus: because the layer is DOM, the labels automatically
   follow the units switch (their 6.00 m → `19'-8"` flip proves it).

9. **Wire the measure list into a Stats/quantities view** *(finding 2.8)*. Their Stats button is a
   two-line bridge from the measure panel to the BIM panel. Once CasaPlazAI has room areas
   (round-1 idea 3), one button can turn pinned measurements into named rows in that schedule.

### Anti-patterns worth avoiding (learned in round 2)

- **Do not make snapping invisible.** Round-2's clearest negative finding: the user never learns that
  a snap happened, which makes every measurement feel approximate.
- **Do not let a drag gesture look like measuring.** The tool only reacts to taps; a press-move-release
  produces no measurement (finding 2.2), so the cursor hint *"Shift: along an axis"* is discoverable
  but the interaction grammar is not self-evident.
- **Do not expose the tool state as an untouchable closure.** `HPMeasure` publishes only
  `active/state/setState`; there is no `clear()` or `remove(i)`, so anything scripted (or a future
  keyboard shortcut) must synthesise DOM clicks (finding 2.4). CasaPlazAI should give its measure
  store a real API.
- **Do not hide the measurement list while keeping it alive.** When the tool is switched off the pinned
  labels stay on the plan but their list is inside the tool panel, so there is no way to see or
  delete them until the tool is re-enabled (finding 2.6).

---

## 4. Unknowns

1. **Multi-floor measure behaviour was not exercised.** All live scenarios built geometry on level 0.
   Round 1 established `levelBase(n) = floorHeight × n` and a `level` event that invalidates the snap
   cache; whether a pinned measurement carries a level, is hidden when another level is active, or is
   re-based on level switch is unverified (`OBSERVED` that the cache invalidation list includes
   `'level'`, nothing more). This matters because the CasaPlazAI analogue would be per-floor measure
   scoping.
2. **Undo/redo of a pinned or removed measurement** was not driven. The module calls `markDirty()` on
   pin, per-item remove and clear-all, which *implies* participation in the BIM history, but I did not
   press Ctrl+Z and observe the list change.
3. **The `hp-snapped` marker class never appeared in any capture** even when `setState`/`state` proved
   a snap had been committed. I could not decide between a CSS-timing artefact and a genuine
   code/behaviour mismatch; the practical conclusion (no visible snap feedback) is solid either way,
   but the exact cause is not.
4. **The 14 px snap radius is a reported constant**, confirmed behaviourally only at distances of
   ~9 px (snapped) and ~30 px (not snapped). I did not bisect the boundary, and the radius is in CSS
   pixels of the full canvas while `dpr` was 1 in every run, so a HiDPI display is untested.
5. **Multi-sample pinch precision was not tested** — a candidate exactly on the camera's near/far
   plane is discarded (`projected z ∉ ]0,1[`), which I read but did not observe.
6. **The 2D planner's *Straighten* measure flow was not driven.** I confirmed the iframe, the tool
   button and the absence of a `measure()` API, and that the 2D plan serialisation has **no**
   measurement slot (`{objData, wallData, roomData}` only) — but not its click order, nor where (or
   whether) its transient numbers are kept, nor whether they ever reach the 3D tool's `measures`
   array. Round 1's `layers.measures` reads as a *display* toggle for derived wall measurements,
   suggesting the 2D numbers are computed, not user annotations.
7. **The `measures` array inside an exported project file** (the JSON download) was not inspected; I
   serialised the in-memory project and verified the reload path, but not the file round-trip.
8. **`HPDims.setEnabled` / `setOption` interactions with the measure overlays** were only partially
   covered: I verified the *Dimensions in 3D* block exists in the same panel with `walls` checked and
   the other three disabled while the master is off (round 1's option model, re-observed live), but
   not how the dims overlay and many pinned measurements share the declutter pass under load.
9. **Mobile/touch measuring** is unexplored; the pointer handler reads `event.button === 0`, which
   says nothing about touch tap mapping.
10. **The site's own help/docs for the Measure tool** were not searched this round; all statements
    here are from live behaviour, the shipped JavaScript, or round-1's i18n evidence.
