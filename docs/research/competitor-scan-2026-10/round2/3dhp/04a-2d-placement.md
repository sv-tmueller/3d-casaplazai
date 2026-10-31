# 3D House Planner — 2D planner opening placement, property model and 3D sync
**Round 2 teardown for CasaPlazAI · job `03-04a-doors-windows-2d-placement`**

Target: <https://www.3dhouseplanner.com/> — the 2D planner at
<https://www.3dhouseplanner.com/2D-Planner/index.php> (served standalone at `www.`, embedded by the
3D editor from the bare domain `3dhouseplanner.com/app.php`). Research date 2026-10-31.
Round 1 report: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/04-04-doors-windows/report.md`
(read-only, reused below; its Unknowns #1 and #2 are the gaps this report closes).

Everything here is my own description of observed behaviour. 3D House Planner is proprietary,
obfuscated, unlicensed JavaScript; no code was copied. Evidence files live in this job folder
(`raw/`, `src2/`, `shots/`, `tools/`). Tag legend: **OBSERVED** = seen live or in a retained
artifact; **DOCUMENTED** = the vendor's own published string/UI text; **INFERRED** = reasoned from
code without an independent observation.

## 1. Summary (5 bullets)

- **The 2D planner is a self-contained SVG editor with its own object model, and I got it running
  headless and drove it with real pointer events.** Ten modules are served as opaque
  `/js.php?f=planner/<name>&v=<hash>` blobs behind Cloudflare; I pulled them out of the page with a
  Playwright scenario plus `rea export-web-scripts`, then decoded the `javascript-obfuscator` string
  array to readable (if still name-mangled) source. **OBSERVED** — `raw/scenario-modules2.json`,
  `raw/scripts2/manifest.json`, `src2/*.fmt.js`.
- **Placement is a hover-preview-then-click gesture on a wall, and the opening lives on the wall,
  not in the room.** Picking *Doors → Simple* sets `door_mode`; moving over a wall builds a
  throw-away preview object bound to the nearest wall; the first click commits it into `OBJDATA`,
  drops back to `select_mode` and saves. **OBSERVED** — `raw/live5/probe5.json`,
  `shots/door-mode-preview.png`.
- **An opening's persisted identity is `{family:"inWall", class:"doorWindow", type, x, y, angle,
  angleSign, size, thick, hinge, height3d, limit[, model, uid, …]}` — a wall-relative record whose
  wall is implied, not referenced.** There is no stored wall id or `t` on the object: the wall is
  re-derived every time by projecting the opening's point onto a wall. **OBSERVED** —
  `raw/live8/probe8.json` (`saved_plan`), `raw/live7/probe7.json` (`saved_plan`).
- **Width and height are centimetre sliders whose `min`/`max` come from the type, and width is
  additionally re-tested against the host wall.** The markup is `type="range" step="1"`; the
  selection code fills the bounds from the type's resize range (simple door 0.67–2.00 m) and the
  per-kind height limits (door 1.50–2.50 m). Because the bounds are fractional pixel-to-centimetre
  conversions, requested values land on the lattice and I got 89.8 px (not 90) for a requested
  150; driving the width to 4.00 m clamped at the type maximum 119.8 px. A width that no longer
  fits between its wall's endpoints is **silently ignored** rather than reported.
  **OBSERVED** — `raw/live5/probe5.json`, `raw/2dplanner-index.html`, `src2/planner-main.fmt.js`.
- **3D sync is a direct same-origin JS bridge, not postMessage: the 2D planner page exposes
  `window.FloorplanBridge` (`version:1`, `getModel`, `setModel`, `onChange`, `ensureUids`), and the
  3D editor's `hp-sync` module reaches into the iframe's `contentWindow` to drive it.** Openings
  survive a `getModel()`→`setModel()` round-trip with their type, width, hinge and `height3d`, and
  `setModel` writes into the 2D planner's own undo history. **OBSERVED** — `raw/live6/probe6.json`,
  `src2/bridge3d.fmt.js`, `src2/hp-sync.fmt.js`.

## 2. Findings

### 2.0 How the 2D planner was obtained (method + provenance)

**OBSERVED.** `curl` on `/2D-Planner/index.php` returns HTTP 200 — the HTML shell is public
(`raw/2dplanner-index.html`, 139 742 bytes, captured this session). The shell is a plain HTML page
with an inline `window.HP_I18N_DATA["planner"]` dictionary and one `<svg id="extension-floorplanner-lin">`
drawing surface, plus a modal "Start a new floorplan" dialog. The ten logic modules are **not** in
the HTML; they are loaded as `/js.php?f=planner/<module>&v=<content-hash>`.

A plain request for those module URLs returns **HTTP 403 "Forbidden"** (Cloudflare) even with a
browser user-agent, referer and cookies — but a `fetch()` from inside the page succeeds. I ran an
REA `capture-browser-scenario` with 13 steps (1 `goto`, 1 `wait_for_timeout`, 11 same-origin
`request` calls — one per module) and exported the retained script bodies:

| evidence | what it is |
| --- | --- |
| `raw/2dplanner-index.html` | the public HTML shell, with the full i18n dictionary |
| `raw/scen-fetch-modules2.json` | the scenario spec (13 steps) |
| `raw/scenario-modules2.json` | 14.3 MB REA evidence; its own `capture_completeness` reports `incomplete` with only the optional `events` section missing, so the scripts were retained but event ordering was not |
| `raw/scripts2/manifest.json` | URL → retained-file manifest from `rea export-web-scripts` (29 scripts seen, 11 of them the planner modules, 16 isolated files written) |
| `src2/<module>.js` | the ten originals (`i18n`, `qSVG`, `floorplanEditor`, `orientation3d`, `symbols`, `objectCatalog`, `objectPalette`, `planner-main`, `uiShell`, `bridge3d`) plus `donate` |
| `src2/<module>.d.js`, `.fmt.js` | string-array-decoded and re-formatted copies |
| `src2/<module>.strings.json` | the decoded string tables |

The obfuscation is the standard `javascript-obfuscator` string-array + rotating-decoder pattern:
a factory returns the literal table, and every string use becomes a call that indexes it
(`h<prefix>_0x…(<hex index>)`). I isolated the factory and the decoder, ran the rotation prologue
inside a Node `vm` so the table reached its real order, then either dumped it or inlined every call
site with its literal (`tools/obf.js`, `tools/fmt.js`). Identifiers are still mangled (hex-ish
`_0x…` names), but structure, field names, DOM ids and all strings are intact — enough to read
behaviour exactly. **Only 3D House Planner's shipped, obfuscated, proprietary code was inspected;
nothing was copied into this report or into any deliverable.**

### 2.1 Tool entry points and the opening gesture

**DOCUMENTED (vendor UI text).** The tool labels and hints are in the page's own dictionary and
markup: *Doors* — "choose a type, then click on a wall"; *Windows* — same; `hint.door_mode` —
"Move over a wall and click to place it · the arc shows where it opens"; `hint.edit_door_mode` —
"Door / window selected: flip it, change its width or delete it (Del)";
`msg.addDoor`/`msg.addWindow`/`msg.configureDoor`. The door submenu offers **Opening, Simple,
Double, Pocket**; the window submenu **Fixed, Simple, Double, Slide** (`raw/2dplanner-index.html`).

**OBSERVED.** The gesture, driven live with real `Input.dispatchMouseEvent` events:

1. Clicking a door/window tile calls the planner's generic tool selector with mode `door_mode` and
   the tile's type as the option. Both menus end up in `door_mode` — the *Windows* tiles pass their
   own id minus the `extension-floorplanner-` prefix, so a window is just a `door_mode` placement
   whose type string (`fix`/`flap`/`twin`/`bay`) belongs to the window set. Result:
   `{mode:"door_mode", modeOption:"simple"}` for a door, `{mode:"door_mode", modeOption:"twin"}`
   for a window. **OBSERVED** — `raw/live2/probe2.json` (`pick_door`, `pick_window`).
2. The status line changes to *Add a door* / *Add a window* and the cursor becomes a crosshair.
3. On each pointer move the planner snaps the cursor to the nearest wall (with a generous hit
   tolerance) and paints a preview: a throw-away `inWall/doorWindow` object that is *not* in
   `OBJDATA` yet, appended to the `#extension-floorplanner-boxbind` preview layer. While it exists,
   `binder.type` is the type string (`"simple"`), `binder.obj` is still undefined, and
   `binder.size` is the default 60 px = 1.00 m. **OBSERVED** — `raw/live5/probe5.json`
   (`hover1`/`hover2`), `shots/door-mode-preview.png`.
4. On pointer-down/up the committed branch runs: the object is pushed onto `OBJDATA`, its graph is
   moved out of the preview layer into the `#extension-floorplanner-boxcarpentry` group, the
   binder is torn down, the tool returns to `select_mode`, and the plan is saved. A fresh placement
   therefore ends in `select_mode`, not in the editing panel. **OBSERVED** — `raw/live/probe.json`
   (`after_click.mode === "select_mode"`).

Two placement details fall out of the code and were confirmed live:

- For a **straight** wall the preview's angle is the wall's own direction, and if the pointer is on
  the "far" side of the wall the planner adds 180° and sets `angleSign = 1`. The sign flip is what
  the later mirroring hinges on. On commit the angle is stored as `angle` (90 for a vertical wall
  in my runs) with `angleSign` 0 or 1.
- For a **curved** wall (`bulge`) the preview is instead seated with a dedicated arc helper that
  returns a position, an arc parameter `u`, a tangent angle and a flip flag; the stored object is
  otherwise identical. **OBSERVED (code)** — `src2/planner-main.fmt.js` around the `door_mode`
  mousemove branch and `src2/floorplanEditor.fmt.js` (`openingOnArc`).

If there is no wall under the cursor, `msg.drawWallFirst` ("Draw a wall first") is shown and the
tool drops back to `select_mode`. **DOCUMENTED (string) + OBSERVED (branch)**.

### 2.2 Snapping along walls

**OBSERVED.** Wall snapping is *not* a nearest-point projection helper used once: the planner
carries a family of small geometry functions and calls them at each stage.

- `nearWall(point, tolerance)` walks every wall, projects the point onto the wall's infinite line,
  keeps the projection **only if it lies between the wall's endpoints** (`btwn`), and finally
  compares the winning wall distance against the nearest wall *vertex* (`nearVertice`) — whichever
  is closer wins, within the caller's tolerance. That is why hovering near a corner seats the
  opening at the corner and why the preview can jump between the two walls meeting there.
  **OBSERVED (code)** — `src2/floorplanEditor.fmt.js` (`nearWall`, `nearVertice`).
- On placement over a straight wall the stored `x, y` come straight from that `nearWall` result
  (the projection) and the angle from `angleDeg(start → end)`. The **allowed interval** is computed
  separately: `limitObj` solves the ±half-width points on the wall's **centre-line** equation, and
  the write is accepted only if **both** points lie between the wall's endpoints (`btwn`). If a
  click lands near an endpoint, a special case re-seats the centre onto the interval's first or
  second point. This is the `limit` field seen on committed objects
  (`[{x:-270,y:-30},{x:-270,y:30}]` for a 1.00 m opening at the middle of a 9 m wall — the two ends
  of the 1 m span, ±0.5 m along the wall's centre line).
  **OBSERVED** — `raw/live8/probe8.json`, `raw/live5/probe5.json`, `src2/planner-main.fmt.js`
  (`door_mode` branch, `limitObj`).
- **Grid snapping is off by default, and even when on it cannot seat an opening off the wall.**
  `calcul_snap` rounds the cursor to the nearest grid multiple only when the user's `snap_to_grid`
  setting is on; that setting defaults to **false**. My clicks at plan y = −140 committed at
  y = −140.625, i.e. the wall projection, not a grid multiple — and because the opening is then
  re-projected onto the wall's line and interval, grid snapping would be overridden in any case.
  **OBSERVED** — `raw/live7/probe7.json` (`placed`), `src2/planner-main.fmt.js`
  (`calcul_snap`, `snap_to_grid` default).
- Because the store is a bare `x, y, angle`, the wall association is re-derived, not stored: the
  helper that lists a wall's openings (`objFromWall`) runs over `OBJDATA`, keeps `inWall` objects
  whose point lies within 0.01 px of the wall's line *and* between its endpoints (for arcs: inside
  the arc and within 0.5 px of it). This is the single mechanism behind placement admission, the
  `limit` computation, the dimension "rib", copy/paste collision checks and re-seating after the
  wall is edited. **OBSERVED (code)** — `src2/floorplanEditor.fmt.js`.
- **No overlap prevention at commit.** In my first run I placed the same `simple` door twice at the
  same plan point on the same wall and got **two** identical records, and a `twin` window placed on
  the perpendicular bottom wall got `angle: 0` and its own window default `height3d: 48` (0.8 m).
  Collision avoidance exists only in the *paste* path. **OBSERVED** — `raw/live2/probe2.json`
  (`after_door2`, `after_window`).
- **Multi-wall tolerance:** if a point is on more than one wall the planner takes the *last*
  matching wall in `WALLS` (`rayCastingWalls` returns the list, the caller clamps `.length > 1`
  down to the last entry; `rayCastingWall` has the same shape). Because my runs used a square room
  I did not observe a case where this mattered, so the effect at shared corners is
  **INFERRED (code)**.
- **Wall-selection hit testing is by polygon, not by distance.** When nothing is selected,
  `select_mode` calls `rayCastingWalls`/`rayCastingWall`, which tests the cursor against each
  wall's four-point `coords` outline (or an arc band), i.e. the wall's **full thickness**, not a
  centre-line tolerance. Only if that fails does it fall back to `nearWall(snap, tolerance)` on the
  line. **OBSERVED (code)** — `src2/floorplanEditor.fmt.js` (`pointInWall`, `rayCastingWalls`),
  `src2/planner-main.fmt.js` select-mode branch.
- **Wall edits re-seat their openings.** Before a wall is dragged/joined/curved the planner
  snapshots each resident opening as `{wall, obj, u, fromStart, fromEnd, start, end}` — the
  fraction `u` along the wall plus the absolute distances from both ends. After the edit it
  re-seats each one: if the wall's start vertex is unchanged it keeps `fromStart`, if its end
  vertex is unchanged it keeps `1 − fromEnd`, then clamps with the same width rule and re-places.
  This is how an opening "stays put" in metres when the far end of its wall moves, and how it
  survives a wall being bent. **OBSERVED (code)** — `snapshotWallObjects`/`reseatWallObjects`.
- **The `rib` dimension overlay** is a separate reading aid, not part of the model: with "wall
  offsets" ticked, each opening projects its two `limit` points onto the wall's two face lines and
  prints a label with the distance from the wall start in metres. Nothing about it is persisted.
  **DOCUMENTED (UI toggle) + OBSERVED (code)**, `src2/planner-main.fmt.js`.

### 2.3 The opening property model

**OBSERVED.** The in-memory and persisted record for an opening, read straight out of
`localStorage["extension-floorplanner-history"]` after live placement, edit and paste:

```
family:"inWall", class:"doorWindow", type:"simple",
x, y, angle, angleSign,             // world placement; angle in degrees
size, thick,                        // width and wall thickness, in plan px (60 px = 1 m)
hinge:"normal"|"reverse",           // the mirror flag
height3d,                           // the 3D-ish height, px; default 2 m door / 0.8 m window
limit:[{x,y},{x,y}],                // the two ends of the allowed interval on the wall
model, uid,                         // optional GLB path and stable id added by the bridge
value,                              // generic per-type numeric (step count for stairs etc.)
orientation3dHint                   // derived, not authored; recomputed on every save
```

plus the extras the round-1 GLB path needs (`modelYawOffset`, `modelFootprint3d`,
`modelAutoTurn`, `libraryProductId`, `productRotationOffset`, `sizeVersion`, `linear`).

Key points:

- **`type` is the whole semantic type.** Door types are `aperture`, `simple`, `double`, `pocket`;
  window types are `fix`, `flap`, `twin`, `bay`. There is no separate "is a door" flag — the
  membership test against the two constant lists is what decides which model `<select>` is used and
  which catalogue is offered. **OBSERVED** — `src2/planner-main.fmt.js` constants + live
  `DOOR_TYPES`/`WINDOW_TYPES` dump in `raw/live2/probe2.json` (`type_table`).
- **There is no `isDoor`/`sill`/`swing`/`operation`/`fireRating` enumeration in the 2D model at
  all.** Round 1 derived `{sill, swing, operation, fireRating, mark, material}` from the *3D*
  schedule UI; the 2D planner that authors the opening stores none of it. Swing is a pure 2D
  `hinge` mirror bit plus `angleSign`; operation is the `type` (`pocket` *is* the sliding-door
  type); sill/fire rating/mark/material do not exist here. **OBSERVED (2D model) + INFERRED
  (they live only on the 3D side)**.
- **The floor is a separate axis.** `height3d` is a single number with per-kind defaults and
  limits; there is no sill/head pair, no "opening starts at 0.9 m". A window is a hole whose
  vertical extent is `height3d`; the vertical *position* is not authored in 2D.
- **`limit` is a derived cache, written at placement/resize/paste time and merely copied back on
  load.** `floorplanLoad` assigns `obj.limit = saved.limit` verbatim; it is the *placement* path
  (and the width slider, and `pasteOpening` via `limitObj`) that computes it. A freshly previewed
  object that has never been committed still shows `limit: []` because the preview is built
  straight from the constructor, whereas a placed-then-saved opening always carries it.
  **OBSERVED** — compare the empty `limit: []` in `raw/live/probe.json` with the populated limits in
  `raw/live8/probe8.json` and `raw/live6/probe6.json`; `src2/planner-main.fmt.js` (`floorplanLoad`,
  `limitObj`). (Round 1's "usually empty" reading came from objects observed before their `limit`
  had been computed, so the field is best treated as derived, not as a source of truth.)
- **`model` (the product/GLB path) is supplied by the *3D host* page, so the standalone planner
  stores `null`.** The model `<select>` is looked up by id in the planner's own document and,
  failing that, in `parent.document` (wrapped in `try/catch`). The standalone planner page contains
  **no** `doorSelect`/`windowSelect` element, so on `www.3dhouseplanner.com/2D-Planner/` the lookup
  returns null and every opening I placed was stored with `model: null` — matching the live
  `saved_plan` dumps. Round 1's 3D `hp-editor` explains the other half: it creates those two hidden
  `<select>`s itself and injects them **into the iframe's `contentDocument`**, which is why the id
  lookup succeeds when the planner is embedded. **OBSERVED** — `raw/live5/probe5.json`
  (`saved_plan.openings[0].model` is `null`), `raw/2dplanner-index.html` has no such ids,
  `src2/planner-main.fmt.js` (`resolveModelSelect`, `bindModelSelects`, `updateObjectModel`),
  round-1 `src/hp-editor.deobf.js` (select created with `id="doorSelect"` and appended into
  `floorplanIframe.contentDocument`).
- **`width` and `height` are derived display strings, not the stored size.** The object constructor
  sets `width = (size / 60).toFixed(2)` and `height = (thick / 60).toFixed(2)`, i.e. metre strings
  rounded to 2 dp, recomputed on every `update()`. The authoritative numbers are `size` and `thick`
  in plan px (a fresh placed door read `width:"1.00", height:"0.20"` for `size:60, thick:12`).
  **OBSERVED** — `raw/live5/probe5.json` (`panel`), `src2/floorplanEditor.fmt.js` (`obj2D`).
- **The wall is not referenced.** No `wallId`, no `segmentIndex`, no `t`. Association is positional
  and re-derived (see 2.2). This is the sharpest model difference from CasaPlazAI, which stores a
  segment-relative `tCenter`.
- **`uid` is added by the bridge, not by the editor.** `ensureUids()` prefixes walls with `w` and
  objects with `o` (`wi9qqgm3ne1`, `oi9tb8211f5`), and the uid survives an undo/redo/paste cycle.
  **OBSERVED** — `raw/live6/probe6.json` (`saved_plan.wall0.uid`).

### 2.4 Sizing, limits and the editing panel

**OBSERVED (live, with code corroboration).** Selecting a *placed* opening is itself a two-step
affair: hovering it first produces a lightweight holder binder (`class:"socle"`, `family:"inWall"`),
and only a second hit on the object's own first child turns that into `binder.type = "obj"` with
the object attached. Pointer-down then enters `bind_mode`, and pointer-up enters
**`edit_door_mode`** and shows the door/window panel. A single hover-then-click on the leaf does it.
**OBSERVED** — `raw/live5/probe5.json` (`hover1`, `hover2`, `after_press`, `after_release`).
This is why a naive one-shot "click the opening" in an automation run lands back in `select_mode`:
the holder only becomes the editing binder when the pointer lands on the object's own graph child
(`binder.graph.firstChild`); any other target tears the holder down again (`bye_binder()`).

The panel then contains a **Width** and a **Height** slider (each a range plus a number box). The
slider values are in **centimetres** (`value = px / meter × 100`) and the ranges keep the browser
default `step` of 1, but the `min` attribute is itself a fraction (40 px is 66.666… cm, 24 px is
40 cm for a window). Because an `<input type=range>` snaps its value to `min + n × step`, a
requested value lands on that lattice — I asked for 150 and the element kept 149.666…, which the
handler then stored as **89.8 px**, not the 90 px a bare 150 would give. That is why the committed
sizes are not round metre values. Two different sources bound the same control:

| bound | source | door example | window example |
| --- | --- | --- | --- |
| width `min`/`max` | the type's resize range in the 2D icon table | simple 40–120 px (0.67–2.00 m) | twin 40–200 px |
| height `min`/`max` | per-kind height limits | 1.50–2.50 m (90–150 px) | 0.40–2.00 m (24–120 px) |

**OBSERVED** — live `type_table` in `raw/live2/probe2.json`; the panel bounds
(`wMin 0.67 / wMax 2.00 / hMin 1.50 / hMax 2.50`, raw slider attributes `66.666…`–`200` and
`150`–`250`) in `raw/live5/probe5.json` (`panel`) and `shots/edit-door-panel.png`. The per-kind
defaults are 2 m for any door and 0.8 m for any window.

**DOCUMENTED (vendor strings).** `common.width`, `common.height`, `msg.configureDoor` ("Configure
the door/window"), and the hint `hint.edit_door_mode` ("flip it, change its width or delete it
(Del)").

Behaviour when the slider is driven past its bounds is the interesting part:

- **Width.** Moving the slider to 150 (1.50 m) on a 9 m wall produced a committed 89.8 px
  (1.497 m) opening whose `limit` grew symmetrically around the centre. Driving it to 400 (4.00 m)
  stopped at the type maximum: the control read back `199.666…` and the stored size was 119.8 px
  (~2.00 m, the largest lattice value ≤ 120 px). **OBSERVED** — `raw/live5/probe5.json`
  (`width_150`, `width_400`).
- **On a curved wall the width path switches to a different rule.** The handler branches on whether
  the opening's host wall is an arc: for an arc it keeps the arc parameter `u`, asks
  `clampOpeningU` for a legal parameter for the new width, and accepts the change **only if** the
  re-centred position moves the opening by less than half a metre; otherwise it does nothing
  (no width is written). For a straight wall it silently ignores any width whose interval no longer
  fits between the wall's endpoints. **OBSERVED (code)** — `src2/planner-main.fmt.js`
  `doorWindowWidth` handler; `clampOpeningU` in `src2/floorplanEditor.fmt.js`.
- **The height range is enforced by the browser, not by the handler.** The input handler simply
  writes `height3d = value/100 × meter` with no clamp of its own, so the fact that 30 was stored as
  1.50 m and 250 as 2.50 m is the `<input type=range>` element respecting the `min`/`max` attributes
  that the selection code sets. **OBSERVED (code + live)** — `src2/planner-main.fmt.js`
  (`doorWindowHeight` handler), `raw/live5/probe5.json` (`height_250_then_30`).
- **Width and height are independent.** Changing the height does not touch `size`, and vice versa.
  **OBSERVED** — the same run.

The panel also carries a **"Reverse hinges"** button (bound to `objToolsHinge`), a **Copy**
button, a Delete/trash action, and — only when a door/window is selected — the placement hint
`msg.configureDoor`. **DOCUMENTED (markup) + OBSERVED (live)**.

### 2.5 Swing / hinge / mirroring in 2D

**OBSERVED.** The whole 2D swing story is one boolean and one transform:

- `hinge` is `"normal"` or `"reverse"`. Pressing *Reverse hinges* toggles it and re-renders.
- The object's SVG group transform is
  `translate(x, y) rotate(angle, 0, 0) scale(s, 1)` where `s` is `+1` for `"normal"` and `−1` for
  `"reverse"`. Live before/after: `… scale(1, 1)` → `… scale(-1, 1)` with `hinge` `normal` →
  `reverse`. **OBSERVED** — `raw/live5/probe5.json` (`hinge_flip`).
- Because the mirror is applied *inside* the group that has already been translated and rotated,
  flipping the hinge mirrors the door leaf about the wall axis in place; it does not move the
  object's `x`/`y`/`angle`.
- There is no separate "swing left / swing right" or "inward / outward" concept, and no
  `angleSign` UI: `angleSign` is chosen automatically at placement time (which side of the wall you
  clicked) and is carried through copy/paste and bridge round-trips. The pane's own wording is
  deliberately singular — *Reverse hinges* — not a swing-direction chooser.
- `orientation3dHint` (recomputed on every save) is a derived description of the symbol's front:
  `method:"2d-front-v2"`, the yaw in degrees, the catalogue symbol's own front angle, the user's
  `modelYawOffset`, the product's optional `productRotationOffset`, which 2D axis is longer, and
  the aspect ratio. It is the 2D side's guess at how the GLB should be turned, and it is *not*
  authored — which is consistent with round 1 finding `rotation_offset: null` for every catalogue
  entry. **OBSERVED** — `src2/planner-main.fmt.js` (`buildOrientation3dHint`) and every live
  `saved_plan` dump.

### 2.6 Copy–paste of openings

**OBSERVED (live) + DOCUMENTED (strings).** Copy/paste is a small, well-specified feature:

- The clipboard is `window.fpOpeningClipboard = {copy, paste, get value}` — a deliberate public
  hook on `window`. `copy()` returns false unless a door/window binder is selected; the value is a
  JSON deep copy of the binder's object. **OBSERVED** — `raw/live5/probe5.json`.
- The 2D panel shows a **Copy** button in `#extension-floorplanner-objTools`; once something is
  copied, the *wall* panel shows a **Paste door / window** section whose hint is `wall.pasteHint`
  ("Goes on the free stretch nearest the middle of this wall:") and whose label shows the clipped
  type and size (`"Simple · 1.00 m"`, built as `label(type) + " · " + width/60 + " m"`).
  **DOCUMENTED + OBSERVED** — `raw/live5/probe5.json` (`copy.pasteName`), `raw/2dplanner-index.html`.
- Copying does **not** clone the object immediately: `copyOpening()` deep-copies the selected
  object into a module-local `openingClipboard` (also exported as `window.fpOpeningClipboard`),
  writes `msg.openingCopied` to the status line, and refreshes the paste section. **OBSERVED
  (code)** — `src2/planner-main.fmt.js` (`copyOpening`).
- Keyboard: **Ctrl/⌘+C** works only in `edit_door_mode`, **Ctrl/⌘+V** only in `edit_wall_mode`,
  and both are suppressed while focus is in an input/textarea/select. **OBSERVED (code)** —
  `src2/planner-main.fmt.js` keydown handler.
- The paste section is a row inside the **"Modify the wall"** dialog
  (`#extension-floorplanner-wallTools`), hidden until the clipboard is non-empty
  (`refreshOpeningPaste()` sets its `display`), which is exactly why pasting is an `edit_wall_mode`
  action. **OBSERVED** — markup in `raw/2dplanner-index.html`, code in `src2/planner-main.fmt.js`
  (`refreshOpeningPaste`).
- The paste algorithm, read from code and confirmed behaviourally: it refuses a `separate`
  (partition) wall (`msg.pasteSeparate`, "A separation line has no wall to hold a door or window."),
  refuses a curved wall outright (`msg.pasteStraight`, "Paste works on straight walls…"), then
  **scans outward from the wall's midpoint in 5 cm steps**, testing midpoint + k·5 cm and
  midpoint − k·5 cm alternately, so it fills the wall outwards from the middle. A candidate position
  `p` is accepted only if all three hold: `p − w/2 ≥ thick/2 + 5 cm`, `p + w/2 ≤ L − thick/2 − 5 cm`,
  and no existing opening's span overlaps `[p − w/2 − 5 cm, p + w/2 + 5 cm]`. If nothing fits it
  reports `msg.pasteNoRoom` ("No free stretch on this wall wide enough for the copy.").
  **OBSERVED** —
  `raw/live8/probe8.json`: pasting a 1.00 m opening eight times onto a 9 m wall placed them at
  y = 0, then ±63, then ±126… and the ninth attempt returned "no free stretch".
- A pasted opening copies `type`, `size`, `hinge`, `angleSign`, `height3d`, `model` and the GLB
  extras; it gets a *new* uid and its own `limit`; the original's `uid` is deliberately not copied.
  **OBSERVED (code) + OBSERVED (live, `raw/live8/probe8.json`)**.
- Pasted openings land with `angle` equal to the new wall's direction plus 180° when the source's
  `angleSign` was 1 — the mirror side is preserved as an intent, re-expressed on the new wall.
  **OBSERVED (code)**.

### 2.7 Persistence format

**OBSERVED.** The 2D planner is entirely client-side and stores three things in `localStorage`:

| key | content |
| --- | --- |
| `extension-floorplanner-history` | the undo stack: an array of serialized plans |
| `extension-floorplanner-floorplans` | saved named plans (`{index, name, svg_data, floorplan}`) — the `svg_data` is a full SVG snapshot with ids rewritten `id=`→`xid=` |
| `extension-floorplanner-current-filename`, `…-settings`, `…-currently-editing` | current plan name, editor settings, session flag |

A serialized plan is exactly `JSON.stringify({objData, wallData, roomData})`:

- `objData` — every object, including openings, in the flat field set of 2.3; doors/windows also
  carry their `limit`, `height3d`, `hinge`, `angleSign` and `orientation3dHint`.
- `wallData` — walls as `{thick, start:{x,y}, end:{x,y}, type, parent, child, angle, equations:{up,down,base}, coords, bulge?}`.
  Wall topology is stored as *indices into the same array* (`parent`/`child`), swapped back to
  object references for the runtime and back to indices for serialization. `equations` is
  `{A,B}`-style line metadata; a curved wall adds a `bulge` scalar (the same quantity the UI calls
  a bend).
- `roomData` — polygons with `coords` and its own room styling/skirting/ceiling blocks.

**OBSERVED** — `raw/live6/probe6.json` (`saved_plan`), `src2/planner-main.fmt.js`
(`serializePlan`, `floorplanSave`, `save_to_floorplans`).

Undo/history: every `floorplanSave()` serializes the plan, skips if the string is identical to the
top of the stack, truncates any redo tail, pushes, and trims to **50** entries
(`HISTORY_LIMIT = 0x32`). Autosave is debounced **1 500 ms** and also flushed on `pagehide`.
`floorplanSave` additionally walks every object and calls `ensureDoorWindowHeight` (back-filling a
default `height3d` for legacy door/window objects) and rebuilds every `orientation3dHint`, so a
plan saved by an older version gets normalised on load. **OBSERVED** — `src2/planner-main.fmt.js`.

I saved a plan to `localStorage` through the real UI in every live run; the `history` array
contained the square room and the opening-bearing plan, and reloading the page into
`initHistory('recovery')` restored it. **OBSERVED** — `raw/live*/probe*.json`.

### 2.8 Sync to 3D

**OBSERVED.** The transport is a **same-origin JS object bridge**, not `postMessage` and not a
server round-trip. The 2D planner page loads its own `bridge3d` module, which at the end of init
defines `window.FloorplanBridge` and dispatches a `floorplan-bridge-ready` `CustomEvent`. On the
3D side, `hp-sync` grabs `document.getElementById("floorplanIframe").contentWindow.FloorplanBridge`
and consumes it directly (with `try/catch` around the cross-frame access). **OBSERVED (code)** —
`src2/bridge3d.fmt.js`, `src2/hp-sync.fmt.js` (its accessor for the iframe's `FloorplanBridge`).

The bridge surface is small and explicit:

| member | behaviour |
| --- | --- |
| `version` | `1` |
| `getModel()` | builds a fresh snapshot from the live editor state |
| `setModel(model, {fit})` | inverse: rebuilds `{objData, wallData, roomData}`, pushes it into the 2D undo `HISTORY`, loads it, optionally zooms to fit |
| `onChange(cb)` | registers a listener; every model mutation fans out the new model |
| `ensureUids()` | adds stable `w…`/`o…` uids to walls and objects |
| `newUid(prefix)` | mints one uid (prefix + timestamp base-36 + random + counter) |
| `setTopography(topology)` | draws terrain contours into a `#extension-floorplanner-boxTopo` layer with a mask |
| `setStatus({enabled, busy, level})`, `setBuildLayer(layer)` | drive the 3D-side status chip and the build/level filter |
| `refresh()` | re-runs `ensureUids()` and the plan→3D projection |
| `isSilent()` | true while the bridge is itself writing, so listeners don't echo |

**OBSERVED (code)** — `src2/bridge3d.fmt.js` lines 320–499.

`getModel()` shape, read live: `{meter, walls:[{uid,start,end,thick,type,bulge}],
objects:[{…whitelisted fields…}], rooms, polygons:[{coords,area,name,color,floorImage,wallImage,
skirting,ceiling}]}`. `meter` is 60 (px per metre). Objects are filtered (no `boundingBox`, no
`measure`) and projected through a fixed **whitelist**: `family, class, type, x, y, angle,
angleSign, size, thick, hinge, value, limit, height3d, model, uid, modelYawOffset,
modelFootprint3d, modelAutoTurn, libraryProductId, productRotationOffset, sizeVersion, linear`.
`rooms` and `polygons` are joined by a coordinate fingerprint. **OBSERVED** —
`raw/live6/probe6.json` (`bridge_model`), `src2/bridge3d.fmt.js`.

`onChange` fan-out is real: a listener registered from the page received an update when I placed
my first opening (`raw/live7/probe7.json`, `bridge_log`). And the round-trip works both ways:

- **2D → 3D.** `getModel()` after placing a simple door returned `walls:4, objects:1`,
  `openings:[{type:"simple", x:-270, y:0, size:60, hinge:"normal", height3d:120, uid:"…"}]`,
  `polygons:1`, `meter:60`. **OBSERVED** — `raw/live6/probe6.json`.
- **3D → 2D.** I took the model, changed the opening's `size` from 60 to 80 and its `hinge` to
  `"reverse"`, called `setModel(model, {fit:false})`, and read the live editor back:
  `size:80`, `hinge:"reverse"`, with a new `HISTORY` entry. **OBSERVED** — `raw/live6/probe6.json`
  (`bridge_setmodel.ok === true`, `after:[{size:80,hinge:"reverse"}]`).

The 3D-side consumer (`hp-sync`) then does three additional things above the raw model:

1. **Plan → 3D conversion.** It reads the live 3D scene (walls as meshes with `wallEndpoints`,
   element world bounds, yaw/scale), matches each object to a catalogue item by its `model` path,
   and writes a 2D record: `family:"inWall"`, `class:"doorWindow"`, a `type` chosen from the
   measured width (`door` → `double` if ≥1.3 m else `simple`; `window` → `twin` if ≥1.6 m else
   `fix`), `x, y, angle, angleSign:0`, `size`, `thick` from the wall, `hinge:"normal"`,
   `height3d` from the mesh's measured height, plus `model`/`libraryProductId`/
   `modelFootprint3d`/`sizeVersion`. It also snaps free-standing objects to the nearest wall.
   **OBSERVED (code)** — `src2/hp-sync.fmt.js`.
2. **Applying a plan into 3D.** `applyPlan(model)` is what the 3D editor calls for the 2D→3D
   direction; `projectNow()` and `flush()` push the other way, and `buildAt(plan, level, ?)`
   instantiates a plan at a storey. `HPSync` also keeps `plans` keyed by level plus a set of
   "meshless" element ids and `roofs`, with `getState()`/`setState()` serialising that whole
   multi-storey state and `setRoof`/`setContours3d`/`updateContours` for the surrounding features.
   **OBSERVED (code)** — `src2/hp-sync.fmt.js`.
3. **A sync toggle and a `sync.started`/`sync.off` toast**, plus `setEnabled`/`enabled`/`level`
   accessors and a "generate 3D" toolbar hook; incoming model changes are debounced (~350 ms,
   `0x15e`) before being applied to Babylon. **OBSERVED (code)** — `sync.*` strings in
   `src2/hp-sync.strings.json`, `window.HPSync = {…}` in `src2/hp-sync.fmt.js`.

Separately, the 2D planner's own 3D-facing "rough opening" UI (round 1's `frame`/`gap` overlay
items, `frameType:"door"`/`"window"`, four-point `gap` polygon) lives in `bridge3d`, i.e. the 2D
page owns the state that the 3D view turns into cut-outs. Round 1's CSG inference is unchanged by
this round; what is new is that the *authoring* half of that path is confirmed to be the 2D
`doorWindow` record. **OBSERVED (bridge3d strings: `tool.opening`, `tool.openingDoor`,
`frameType`, `gap`, "Door rough opening") + INFERRED (the CSG itself)**.

### 2.9 What this changes in the round-1 picture

- **Closes round-1 Unknown #1** (the 2D planner was never fetched) and **Unknown #2** (no
  interactive click-through): the page is fetched, all ten modules are read, and the whole
  placement → edit → copy/paste → persist → bridge path was driven live.
- **Corrects the round-1 reading of `limit`.** Round 1 saw openings with `limit: []` and treated
  the field as usually empty. It is a derived cache written at placement/resize/paste time
  (`limitObj`) and merely copied back by `floorplanLoad`; the empty values came from objects read
  before their `limit` had been computed (a live preview, or a very old save).
- **Confirms** round 1's `DOOR_TYPES`/`WINDOW_TYPES`, the 60 px metre, the `t`-like fraction `u`
  used internally for re-seating, and the "mirroring by negative scale" mechanism — the 2D side
  literally renders `scale(±1, 1)`.
- **Narrows round 1's "swing direction" claim.** There is no swing *direction* enum in the 2D
  model: only a boolean hinge mirror plus the automatic `angleSign`, and one button labelled
  *Reverse hinges*. Round 1's six `bim.swing` values are a 3D-side presentation of that bit, not a
  stored 2D property.
- **Clarifies the sizing question** (round-1 Unknown: "whether the user can override width/height
  independently of the model"). Yes: in the 2D planner width and height are plain numbers editable
  from the panel, clamped by type range and (for width) by the host wall; they are completely
  independent of any GLB.
- **Leaves the CSG cut inferred**, and the `hp-panels.js`/`hp-ui.js` deobfuscation still open
  (round-1 Unknown #3) — but the state that feeds it is now known exactly.

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. "Finding" points at the section above; "schema" at
`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

1. **Adopt hover-preview-then-click, and keep a snapshot of wall population while the tool is
   live.** *(Finding 2.1, 2.2 — high value, low effort.)* The preview-on-mousemove gesture is
   cheap to build in Three.js/2D and is what makes placement feel immediate; the important part is
   that the preview is **not** in the document model until commit. In CasaPlazAI terms: keep a
   `pendingOpening` (segment index + `tCenter`) in editor-local state, render it as a ghost cut,
   and only on click push a real `Opening` with `tCenter` and `width`. Zero schema change.
2. **Reuse the paste placement strategy as an algorithm.**
   *(Finding 2.6 — high value, low effort.)* "Scan outward from the wall midpoint in 5 cm steps,
   first fit wins, ±5 cm clearance between openings, refuse if none" is a ~30-line pure function
   over a segment. It pairs perfectly with CasaPlazAI's normalized `tCenter`: convert the scan
   position to `tCenter = pos / segmentLength`, and reuse the existing `opening-too-wide`
   validator as the "no free stretch" refusal. New i18n keys along the lines of
   `pasteStraight`, `pasteNoRoom`, `pasteSeparate` (3D House Planner's own wording is a good UX
   model — see its strings in `raw/planner-i18n-dict.json`).
3. **Make the wall association explicit where CasaPlazAI already can.**
   *(Finding 2.3 — high value, low effort.)* 3D House Planner stores a bare `x,y` and re-derives the
   wall by projecting onto every wall with a 0.01 px tolerance; at shared corners several walls
   qualify and the code resolves the ambiguity by taking the last match, which is fragile and forced
   the whole `snapshotWallObjects`/`reseatWallObjects` machinery. The
   CasaPlazAI schema is already better: `segmentIndex` + `tCenter`. The lesson is to lean on it —
   when a wall is edited, re-seat by `tCenter` (clamped by `clampOpening` semantics) instead of
   re-deriving the host.
4. **Store the mirror as a first-class, schema-migrated field.** *(Finding 2.5 — medium value, low
   effort.)* 3D House Planner's `hinge: "normal"|"reverse"` and `angleSign: 0|1` are exactly the
   data needed to reproduce its 2D look, and CasaPlazAI's schema currently has no place for them.
   Two clean options: (a) extend `Opening` with optional `mirrored?: boolean` and
   `side?: 0|1` via `migrate.ts`/`registerTransform` (the schema's own extension path), or (b) keep
   them editor-local. **(a)** is worth it if the 3D view must show the leaf swinging the same way,
   because a mirrored door cannot be recovered from `tCenter`+`width` alone.
5. **Separate the type range from the wall-fit range, and decide what to do when they conflict.**
   *(Finding 2.4 — high value, medium effort.)* 3D House Planner puts the *type's* range (0.67–2.00 m
   for a simple door) on the slider labels while the wall-fit rule silently suppresses the change —
   a design that is easy to build and easy to explain, but which lets the panel show one thing and
   the model hold another. CasaPlazAI already has the `opening-too-wide` validator for the wall-fit
   side; the extra step is to add a per-type `widthRange` table and a per-kind `heightRange`
   (doors ≈ 1.5–2.5 m, windows ≈ 0.4–2.0 m) in editor-local constants, and to make the *displayed*
   bound the intersection of the two rather than only the type. That keeps the "silent snap" feel
   without the mismatch.
6. **Keep CasaPlazAI's `sillHeight`/`headHeight` and expose them in the editor — this is where
   3D House Planner is strictly worse.** *(Finding 2.3 — medium value, medium effort.)* Its opening
   is a hole of height `height3d` starting at the floor: there is no sill, so a window cannot be
   raised and a clerestory cannot be expressed in 2D at all. The CasaPlazAI schema already models
   the vertical axis properly (`sillHeight` ≥ 0, `headHeight` > 0, doors pinned at 0), so the gap is
   only in the authoring UI. Give the opening panel a vertical-position control (and derive
   `headHeight = sillHeight + height` in the editor) rather than copying 3D House Planner's
   floor-anchored shortcut.
7. **Decide where the product/GLB catalogue lives — the vendor chose a hidden cross-document
   `<select>`.** *(Finding 2.3 — medium value, low effort.)* 3D House Planner's 3D page creates two
   hidden `<select>` elements and injects them into the planner iframe's `contentDocument`; the
   planner then looks them up by id in its own document and (as a fallback) in `parent.document`.
   So the 2D planner silently runs with `model: null` unless the host happens to inject the list.
   In CasaPlazAI, pass the catalogue in explicitly (or read it from the single shared store) and
   make "no product chosen" an explicit nullable field rather than a side effect of where the page
   is hosted.
8. **Expose the bridge as a versioned object, and make the round-trip idempotent.**
   *(Finding 2.8 — medium value, medium effort.)* If CasaPlazAI ever hosts the 2D editor in an
   iframe or a worker, `{version, getModel, setModel, onChange, ensureUids}` is a clean, testable
   contract, and 3D House Planner's `isSilent()` guard (don't echo while writing) is a detail worth
   copying. In CasaPlazAI the natural form is a typed module (`FloorplanBridge`) over
   `FloorplanData`, with `setModel` running `migrate.ts` first.
9. **Normalise legacy plans on load, and do it in one pass.** *(Finding 2.7 — medium value, low
   effort.)* `floorplanSave` back-fills missing `height3d`, recomputes every derived orientation
   hint, and skips a history push when the serialized plan is byte-identical to the top of the
   stack. CasaPlazAI already has `migrate.ts`; adding a single `normalizeFloorplan()` pass invoked
   on load (defaults + derived fields + id guarantees) plus a cheap structural-equality check before
   pushing undo will keep the stack clean.
10. **Copy the 50-entry undo cap and 1.5 s autosave with a `pagehide` flush.**
    *(Finding 2.7 — low value, low effort, but cheap insurance.)* CasaPlazAI autosaves to
    `localStorage`; gluing a debounce to `pagehide`/`visibilitychange` is a two-line fix that
    prevents losing the last edit.
11. **Use "dimension ribs" as an ephemeral reading aid, not data.** *(Finding 2.2 — low value, low
    effort.)* Projecting each opening's two ends onto the wall faces and printing the distance from
    the wall start is a nice measuring UX and requires no schema. CasaPlazAI could implement it as a
    derived overlay over `tCenter`/`width`.
12. **Do not copy the "hole-is-the-object" shortcut into a BIM direction.**
    *(Finding 2.3 — a warning.)* 3D House Planner's opening has no schedule metadata at all (no
    sill, fire rating, mark, material). Round 1 found those only in the 3D schedule UI. If
    CasaPlazAI later wants schedules, adding the fields to `Opening` now (optional, migrated) is far
    cheaper than a second, parallel object type.

## 4. Unknowns

- **The CSG cut itself remains INFERRED.** I confirmed the *authoring* half (the 2D `doorWindow`
  record and the bridge whitelist that carries `type/size/thick/height3d` across), and round 1's
  mesh-id and gross/net-quantity evidence stands, but I did not watch a boolean subtraction run and
  cannot state the exact operand order or the cut margin.
- **`hp-panels.js` and `hp-ui.js` were not successfully deobfuscated** (round-1 Unknown #3, still
  open). The 3D-side catalogue tile rendering, the schedule columns and the "six swing values" are
  therefore still read only through retained DOM, not through code. Which 3D swing value a 2D
  `hinge:"reverse"` maps to is **UNKNOWN**.
- **The `model` `<select>` option lists were not enumerated.** The standalone planner has no such
  element, and in the embedded editor the select is resolved from `parent.document`. I did not
  capture the `<option>` values, so whether the 2D select is the whole catalogue or filtered by
  opening type is UNKNOWN (the change handler does test the opening's type against
  `DOOR_TYPES`/`WINDOW_TYPES` before applying the value, which suggests a shared list).
- **Curved-wall paste was observed as a refusal but not as a success.** `pasteOpening` returns
  `msg.pasteStraight` for an arc — I confirmed the refusal live (`raw/live8/probe8.json`) — but the
  intended curved-wall workflow (place with the door tool, then drag along the arc) was not driven
  end-to-end, so arc-on-arc placement behaviour is read from code only.
- **`angleSign` semantics at 180°/270° corners are not fully pinned down.** The sign is a
  cross-product test against the wall direction at placement time; I did not enumerate all four
  wall orientations to confirm the stored `angle` is always `wallDeg` or `wallDeg + 180`.
- **The exact legacy-migration rules are partly UNKNOWN.** `floorplanSave` back-fills
  `height3d` and rewrites `orientation3dHint`, and `migrateLegacyObject` is called from
  `restoreObjectExtras`, but I did not decode every branch of the latter — so what very old plans
  (pre-`model`/pre-`sizeVersion`) look like on load is only partly established.
- **No vendor documentation exists** for this app, so this report again contains no DOCUMENTED-tier
  claim beyond the app's own shipped UI/i18n strings and markup.
- **Licence:** no licence or terms file was observed; the shipped JavaScript is obfuscated and
  proprietary. Nothing was copied from it — behaviour and algorithms are described in my own words.
