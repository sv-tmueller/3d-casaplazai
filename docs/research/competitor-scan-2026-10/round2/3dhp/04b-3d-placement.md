# 3D House Planner — live placement of doors/windows in the 3D editor
**Round 2 · competitor teardown for CasaPlazAI · job `04-04b-doors-windows-3d-placement`**

Target: <https://www.3dhouseplanner.com/> — browser editor (`app.php`, Babylon.js) with an embedded
`2D-Planner/index.php` iframe. Round-1 report: `../rea-3dhouseplanner-2026-10/04-04-doors-windows/report.md`
(read-only; reused, not duplicated). Research date 2026-10-31, started 14:33, deadline 16:33.

Narrow question this round: **live placement in the 3D editor** — rough opening vs door opening tools,
dragging along the host wall, flipping swing, overlap and wall-end rules.

Legend: **OBSERVED** (local evidence file) · **DOCUMENTED** (vendor doc URL) · **INFERRED**.
Round-1 deobfuscated bundles are cited as `r1:src/<file>@<byte-offset>`; that folder is
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/04-04-doors-windows` (read-only, not modified).

---

## 1. Summary

- **"Rough opening" and "Door opening" are the same primitive — an 8-handle, drag-to-draw *apertured
  panel* — not a one-click hole punch.** `#frameButtonW` / `#frameButtonD` extrude an outline with a
  rectangular `holes` aperture into `id="2poly"`, `metadata.hp={kind:"frame", frameType:"window"|"door"}`;
  the classifier and the UI call that kind **`frame` = "Rough opening"** — a separate element class
  from `kind.door` / `kind.window`. *(OBSERVED — `r1:src/hp-editor.deobf.js` @ 58.7k–66.5k, @ 433 989;
  `r1:raw/tooltab.html`; `r1:raw/app.html` i18n.)*
- **Creation is wall-agnostic; the host wall is inferred later by geometry.** No `nearestWall` call, no
  stored host id: a binding pass (`_0x4d5796`) tests `door_window` meshes against meshes with
  `id === "wall"`, then **CSG-subtracts** a cutter box (short side inflated ×6) and spawns a
  `windowrefplane` pick proxy per opening. *(OBSERVED — @ 124.6k–137.5k; the shipped HTML documents
  `#distwindowdoorwall` as "distances of the rough opening to the wall ends while it is dragged".)*
- **Dragging along the wall is an axis-locked gizmo slide with a live clearance HUD.** The openings
  gizmo manager detaches Z/Y drag, snaps to `1/gridDivisions`, and each tick rewrites
  `#leftwall / #rightwall / #upwall / #downwall` plus two on-screen cursors from the wall/opening AABBs.
  *(OBSERVED — @ 231 289, @ 246 356, @ 312 552, @ 137.3k–144.6k.)*
- **Swing flip is a mirror, not a rotation, and it is a 2-D planner control.** The planner's "Modify
  door/window" panel has a **"Reverse hinges"** button (`#extension-floorplanner-objToolsHinge`,
  `dw.flip`) plus Width/Height sliders, and its placement hint says *"Move over a wall and click to
  place it · the arc shows where it opens"*; the 3-D layer then renders `hinge === "reverse"` as
  `mesh.scaling[longAxis] *= -1`. *(OBSERVED — `raw/2d-planner-index.html`; @ 330 886.)*
- **Overlap and wall-end limits are advisory, and the rule engine is server-side.** The only client
  wall-end rule is `placeOpening`'s `width ≤ wallLength − 0.1` (head margins 0.05 m door / 0.2 m
  window); collisions surface afterwards via `POST api/bim.php` as `bim.issue.openingOverlap`
  ("{a} overlaps {b} in the same wall"). *(OBSERVED — @ 543 423; `r1:src/hp-bim.deobf.js` @ 102 279 /
  @ 106 093; i18n.)*

---

## 2. Findings

### 2.1 The two tools: "Rough opening" vs "Door opening"

The tile pane exposes them as sibling cards with their own DOM ids and their own length steppers:

| UI card | DOM id | `buildTool` key | mesh `metadata.hp` | length stepper |
| --- | --- | --- | --- | --- |
| Rough opening | `#frameButtonW` | `opening` | `{kind:"frame", frameType:"window"}` | `#sliderdistancewindowwall` |
| Door opening | `#frameButtonD` | `doorOpening` | `{kind:"frame", frameType:"door"}` | `#sliderdistancedoorwall` |

*(OBSERVED — `r1:src/hp-editor.deobf.js` @ 504 753 tool map
`{'floor':…,'opening':"frameButtonW",'doorOpening':"frameButto…"}`; @ 60 940 and @ 65 588
`mesh.metadata = {'hp':{'kind':"frame",'frameType':…}}`; `r1:raw/tooltab.html` markup and
`r1:raw/app.html` i18n `"tool.opening":"Rough opening"`, `"tool.openingDoor":"Door opening"`.)*

**Both tools are drag-to-draw frame panels, not one-click inserts.** The `#frameButtonW` handler:

1. Makes two materials (green outline / white fill) and **creates 8 spheres** named `2spheredrag`
   with `diameter = wallThickness + 0.1`, all parented to the merged polygon.
2. Lays them out as a rectangular **outline** (indices 0–3: `(±slider/2 ± 0.05, 0, ±floorHeight/2)`)
   plus a smaller **inner hole rectangle** (indices 4–7: `(-1,0.4),(-1,-0.6),(1,-0.6),(1,0.6)`).
3. `ExtrudePolygon({shape: outline, holes: [hole]})` → merged to `id="2poly"`, pushed to the `frames`
   gizmo list (`_0x128918`). **The outline is the material and the hole is the aperture**, so the
   element is a free-standing apertured panel, not an entry punched through an existing wall mesh. The
   shipped HTML even documents the HUD it drives as *"distances of the rough opening to the wall ends
   while it is dragged"* (`<!-- distances of the rough opening to the wall ends while it is dragged -->`
   immediately before `#distwindowdoorwall`) — i.e. the panel is measured *against* a wall but is its
   own geometry. *(OBSERVED — handler body @ 58.7k–66.5k; comment in `r1:raw/app.html`.)*
4. On `onDragEndObservable` it re-reads the 8 sphere positions and **re-extrudes** the shape/hole; on
   `onDragObservable` it writes `"x: … | y: …"` to the position panel header.

The `#frameButtonD` handler is the same code path with a different point set: all 8 spheres form the
**door panel outline** (`(-slider/2-0.05, 0, ±h/2)`, `(+slider/2+0.05, 0, ±h/2)`, plus two points at
`y = -0.7` for the threshold), with a door-shaped inner aperture.
*(OBSERVED — `r1:src/hp-editor.deobf.js` @ 58 700–66 500.)*

**Consequence for the taxonomy:** the "rough opening" is a generic apertured panel that the user
reshapes by dragging 8 handles on the ground plane; the "door opening" is the same panel pre-set to
door proportions. Neither carries a swing, a hinge side, a sill or a model. The element kind that
carries those is `door_window`, created by a **different** flow (§2.4) — dragging a door/window model
from the catalogue (`[id^="item"]`, `product.doorWindow === true`) or by importing a plan.

### 2.2 Creation is wall-agnostic; wall-end rules live in two places

**How a real door/window gets placed live in the 3-D editor** (the "click a catalogue item" flow, which
is separate from the two rough-opening tools): clicking any `a[id^="item"]` entry looks the product up in
`HP_BOOT.products` and calls `_0x147a48(product, event)`. When `product.doorWindow` is true the imported
model is stamped `id = name = "door_window"`, pushed to the `openings` gizmo list, positioned at the
**grid-snapped ground cursor** (`Math.round(px*grid)/grid`), and then:

- if the last pick was a child of a wall (`_0x7d99ec.id.includes("wallslaves")`) it is **seated against
  that wall** — `_0x44fe5b` for a door (base flush with the wall's bottom) or `_0x4efbb1` for a window
  (aligned to the wall's centre-Y) — and **re-oriented** to the wall by `_0x20f90e`
  (`atan2(cross, dot)` of the wall's local X vs the mesh's long axis);
- `setTimeout(cutwalls, 300)` re-runs the binding/cut pass so the wall is cut almost immediately.

Non-door/window catalogue items take the `else` branch and become `objmeshes` objects instead
(*"near a wall it turns its back to the wall"* per the planner hint). So: **in the 3-D editor a
door/window is placed by clicking it with a wall already selected/under the cursor; the rough-opening
tiles are the manual alternative; both end up as `door_window` or `frame` meshes respectively.**
*(OBSERVED — `r1:src/hp-editor.deobf.js` @ 41 000–46 500 `_0x147a48`; @ 42604 the `doorWindow`
branch; `raw/2d-planner-index.html` `hint.object_mode`.)*

At creation the **rough-opening frame tool** does not query a wall at all:

- It reads the last ground-plane pick (`_0x7d99ec`) and rounds to the grid:
  `x = round(x * grid) / grid`, same for `z`. If there is no pick it ray-picks the slab/terrain or
  falls back to 2.5 m in front of the camera.
- Y = `floorheight * level + floorheight/2` (level base + half a storey); rotation is fixed
  `(π/2, 0, 0)` for the flat extrusion.
- There is **no** `nearestWall`, no endpoint clamp and no per-opening `t` at creation.
*(OBSERVED — @ 41 000–46 500 insert path, @ 61 400 / @ 65 300 frame handlers.)*

Wall-end/head rules **do** exist, but on the parametric path (`window.HP3D.placeOpening`) and on the
catalogue-insert path:

- **`placeOpening` clamps** (OBSERVED — @ 543 423):
  - `t` → `clamp(t, 0, 1)` along the wall (or a curved-wall arc-length sample `wallPointAt(wall, t)`);
  - `width = max(0.4, min(width, wallLength − 0.1))` — **an opening may not reach either wall end: a
    0.1 m (concrete: 0.1 m unit) end margin, and never narrower than 0.4 m**;
  - `height = min(height, wallHeight − (door ? 0.05 : 0.2))` — **door head margin 5 cm, window head
    margin 20 cm**;
  - window `sill = clamp(sill, 0, wallHeight − height − 0.05)`;
  - default width/height are `0.9 / 2.1` for doors and `1.2 / 1.2` for windows;
  - XY position is then `seatOnSupport(mesh, baseY + sill)`.
- **Catalogue insert** seats the model against the wall's own box: `_0x44fe5b` (door) returns
  `wall.minY + mesh.absY − mesh.centerY + mesh.height/2` (base flush with the wall's bottom),
  `_0x4efbb1` (window) aligns to the wall's centre-Y, and `_0x20f90e` re-orients the model by
  `atan2(cross, dot)` of the wall's local X against the mesh's long axis. Doors additionally get
  `y = wallslaves-parent based` seating and an explicit re-orient call. *(OBSERVED — @ 41 000–46 500,
  @ 137 700–139 000.)*
- `maxDistance` for the fallback "find me a wall" call is **1.5 m** by default
  (`placeOpening({x,z,maxDistance})` → `nearestWall(x, z, level, {maxDistance:1.5})`); beyond that it
  throws `"No wall near the <door|window>"`. *(OBSERVED — @ 543 423; `nearestWall` `_0x35fc6d`.)*

### 2.3 Dragging along the host wall

- **Two separate gizmo managers, one per element class:** `_0x5ca29f` = `frames`, `_0x180d73` =
  `openings`, both `BABYLON.GizmoManager`, both with `boundingBoxGizmoEnabled = true` and
  `attachableMeshes` bound to the corresponding live list. `HP3D.gizmoManagers` /
  `HP3D.gizmoLists` export them. *(OBSERVED — @ 231 289, @ 238 894, @ 506 504.)*
- **Axis locking:** for the openings manager the **Z gizmo's drag behaviour is detached** and
  `zGizmo.scaleRatio = 0`; Y is likewise excluded, so the drag is effectively a slide along the wall
  axis (the X gizmo). All three drag observables (`yGizmo`, `zGizmo`, …) call `_0x3da8ac(...)`.
  *(OBSERVED — @ 246 356, @ 312 552.)*
- **Snap during drag:** `onDragStartObservable → positionGizmo.snapDistance = snapOn ? 1/gridDivisions : 0`.
  *(OBSERVED — @ 246 500.)*
- **Live clearance HUD** (`_0x3da8ac`, ONLY when the element intersects a `wall` mesh):
  - `#distwindowdoorwall` is `.show()`n;
  - An AABB of the opening and of the wall are computed; `W = wallExtentX` (or Z for a Z-running
    wall), `Cw = wallCentre`, `w = openingExtent`, `Co = openingCentre`;
  - `a = W − w − (Cw − Co)` (left gap), `right = 2(W − w) − a`, i.e. **left + right = 2·(W − w)**;
  - `#leftwall` / `#rightwall` print `a` / `right` in current units;
  - vertical: `up = wallExtY − openExtY − (wallCenterY − openCenterY)` and
    `down = 2(wallExtY − openExtY) − up`, printed to `#upwall` / `#downwall`;
  - two small cursors are translated to visualise the split:
    `#verticalwindow` ← `translateY(11.2·(down/(up+down) − 0.5)px)`,
    `#horizontalwindow` ← `translateX(7·(left/(right+left) − 0.5)px)`.
  *(OBSERVED — @ 137 300–144 600.)*
- **Drop** (`onDragEndObservable`): `#distwindowdoorwall.hide()`; if the picked mesh is a
  `windowrefplane`, its bound `door_window_binding-<n>` mesh (or its parent) is moved to the plane's
  X and Z. *(OBSERVED — @ 312 552 ff.)*
- The four clearance labels are exactly `#leftwall`, `#rightwall`, `#upwall`, `#downwall` and each
  occurs once in the bundle, so this wall-distance HUD is the only place they are written.
  *(OBSERVED — id counts on `r1:src/hp-editor.deobf.js`.)*

### 2.4 Rough opening → placed door/window: the binding pass and the (server-side) overlap check

`_0x4d5796` (invoked by `cutwalls()` / `_0x2d4b33()` after every edit, and by the `viewcheck`
handler) is the client authority that turns free elements into wall-hosted ones:

1. **Clear** every previous `csg` and `windowrefplane` mesh.
2. **Host by intersection:** for each mesh with `id === "wall"`, collect
   `door_window` meshes where `intersectsMesh(wall, true)`; the pair is recorded in a per-wall list
   whose head is the wall. **No stored host id is consulted — hosting is purely geometric.**
3. **Cut:** for each hosted opening build a `BABYLON.MeshBuilder.CreateBox` cutter from the opening's
   sub-mesh AABB, and **inflate its short side ×6** so the cutter reliably punches through the wall
   (`short < long ? short *= 6 : long *= 6`); then
   `BABYLON.CSG.FromMesh(wall).subtract(BABYLON.CSG.FromMesh(cutter))` → `toMesh("csg", …)`, with
   sub-mesh material indices remapped so the cut faces get the reveal material. The wall mesh is
   consumed into the `csg` output.
4. **Pick proxies:** per opening, create a `windowrefplane` ground mesh sized from the opening's
   bounding box, named `door_window_binding_ref-<n>`, parented to a `door_window_binding-<n>` carrier,
   textured `./textures/patternwindows.jpg`, with an emissive black material. Those proxies are the
   pickable things in "view" mode; the cut wall itself is hidden.
*(OBSERVED — @ 124 560–137 500. The CSG subtract, the ×6 inflation, and the `windowrefplane` naming
are all literal in the bundle; the reveal-material remap is literal too.)*

- **The BIM model check is a server round-trip, not a client rule engine.** "Check" posts the whole
  scene graph (`HP3D.listElements()` → `{kind, level, bim}` per element) to **`POST api/bim.php`**
  with body `{action:"check", model, options:{lang}}` (gzip'd via `CompressionStream` above 64 KiB,
  `X-HP-Encoding: gzip`), and maps the returned `issues[]` rows
  (`{level, code, text, uid, other}`) back onto meshes by uid. The client therefore never contains the
  overlap/short-wall/thin-wall thresholds. *(OBSERVED — `r1:src/hp-bim.deobf.js` @ 106 093
  `_0x911969`, @ 102 279 `_0x240c6f` fetch, @ 72 224 model collector `_0x1dce1f`.)*
- The issue **texts** are localised client-side (`bim.issue.openingOverlap`, `bim.issue.openingNoWall`,
  `bim.issue.shortWall`, `bim.issue.thinWall`, `bim.issue.noDoor`, `bim.issue.noWindow`) and rendered
  with a warning/error icon; each issue can carry a clickable `mesh` **and** an `other` mesh
  ("Select the other element") — exactly the shape you need for an "A overlaps B in the same wall"
  pair. *(OBSERVED — `r1:src/hp-bim.deobf.js` @ 302 936 `_0x90a459` renderer; i18n dictionary.)*
- **No overlap or end-stop at placement time.** Two openings may be created intersecting the same
  wall; each gets its own cutter in the binding pass. The situation is a **model-check finding**
  afterwards, not an error, with these exact messages:
  - `bim.issue.openingOverlap` = `"{a} overlaps {b} in the same wall."`
  - `bim.issue.openingNoWall` = `"{name} is not inside a wall."`
  - `bim.issue.shortWall` = `"{name} is very short ({v} m)."`, `bim.issue.thinWall` = `"… thin …"`,
    plus `bim.stale` / `bim.rerunCheck` / `bim.checkedAt` around the check run.
*(OBSERVED — `r1:raw/app.html` i18n dictionary; transport and renderer in `r1:src/hp-bim.deobf.js`
@ 106 093 / @ 302 936. The rule engine that produces those codes is the remote `api/bim.php`, so the
tolerances are not in the client — see Unknowns.)*

**Wall-end rule on the geometric path** is only the 0.1 m clamp inside `placeOpening`; the frame tool
and the drag gizmo can put a hole hard against a wall end, and the result is reported by the BIM check
rather than blocked. *(OBSERVED for the clamp; INFERRED that the geometric path has no separate end
stop, from the absence of an end test in `_0x3da8ac` and at creation.)*

**Instancing/selection plumbing:** `HP3D.classify` maps `"2poly"`/`polyt2*` → `frame` (≠ door/window),
`"csg"` → `wall_cut`, `"wall_merged"`/`"csg2"` → `wall`, `"door_window"` → `door`/`window` decided by
`minY − levelBase < 0.25 ? "door" : "window"`. So a frame and a real opening are different element
classes to every downstream consumer (gizmo, list, BIM, export). *(OBSERVED — @ 428 900, @ 433 989.)*

### 2.5 Flipping swing / mirroring

The swing control is a **2-D planner feature**, and it is a single boolean toggle — this closes the
round-1 Unknown about where swing is chosen.

**The planner's "Modify door/window" panel** (`#extension-floorplanner-objTools`, title
`dw.title`="Modify door/window") contains, in order:

| Control | DOM id | i18n | Notes |
| --- | --- | --- | --- |
| Width | `extension-floorplanner-doorWindowWidth` | — | range `step=1` + number input `step=0.01` |
| Height | `extension-floorplanner-doorWindowHeight` | — | same pattern |
| **Reverse hinges** | `extension-floorplanner-objToolsHinge` | `dw.flip`="Reverse hinges" | the flip toggle |
| Copy | `extension-floorplanner-objToolsCopy` | — | "Then select a wall and use *Paste door / window* (or Ctrl+V)" |

*(OBSERVED — `raw/2d-planner-index.html` fetched live from
<https://www.3dhouseplanner.com/2D-Planner/index.php> (HTTP 200, 139 742 bytes; saved as
`raw/2d-planner-index.html`), planner i18n dictionary and the panel markup around
`#extension-floorplanner-objToolsHinge`.)*

**Door/window live placement is also a 2-D planner behaviour**, and it is wall-snapped with a swing
preview — unlike the 3-D editor's free panel tools:

- `hint.door_mode` = *"Move over a wall and click to place it · **the arc shows where it opens**"* —
  placement is a **hover-over-a-wall + click**, and a **swing arc is drawn during the hover** so the
  user sees the opening direction before committing.
- `hint.edit_door_mode` = *"Door / window selected: **flip it**, change its width or delete it (Del)"* —
  `Del` deletes, width is editable, and flip is the hinge button.
*(OBSERVED — planner i18n dictionary.)*

**The opening type taxonomy is the planner's, and the 3-D layer consumes it.** The planner offers
`door.aperture`="Opening", `door.simple`="Simple", `door.double`="Double", `door.pocket`="Pocket" and
`window.fix`="Fixed", `window.flap`="Simple", `window.twin`="Double", `window.bay`="Slide" — the human
labels for round 1's `DOOR_TYPES = ["aperture","simple","double","pocket"]` and
`WINDOW_TYPES = ["fix","flap","twin","bay"]`. *(OBSERVED — planner i18n; `r1:src/hp-editor.deobf.js`
@ 352 700.)*

Within the 3-D editor itself, mirroring is a **negative scale, not a rotation**:

- `if (binding.hinge === "reverse") mesh.scaling[longAxis] *= -1`, then
  `rotationQuaternion = Quaternion.RotationAxis(Y, yawRad)`. `longAxis` is `x` if the model bbox X ≥ Z
  else `z`. A flip is therefore a mirror across the model's long axis, in place. *(OBSERVED —
  @ 330 886; the yaw comes from the planner bridge's `FloorplanOrientation.computeObjectTransform`
  `{scaleX, scaleZ, yawRad}` @ 330 000.)*
- `placeOpening({flip:true})` is a separate, programmatic path: it adds `π` to the Y quaternion
  (`yaw + (longAxis==='z' ? π/2 : 0) + (flip ? π : 0)`). *(OBSERVED — @ 545 915.)*
- Orientation turn on the 2-D side is `modelYawOffset = normalizeDeg(modelYawOffset + 90)` via the
  "Turn" button, with `modelAutoTurn` as an automatic alternative. *(OBSERVED — @ 350 755 ff.; i18n
  `p2d.modelTurn`, `p2d.autoTurn`.)*

### 2.6 The programmatic API surface (machine-checkable)

`window.HP3D` (literal @ 506 504) exposes, among others:

- `placeOpening(opts)` → `door_window` mesh, with the clamps in §2.2; returns the mesh; emits
  `"created"` unless `silent`.
- `moveElement(mesh, dx, dz)`, `rotateElement`, `moveHandle(mesh, handleKey, x, z, opts)`,
  `shapeHandles(mesh)`, `footprintOf`, `minAreaRect`.
- `nearestWall(x, z, level, {maxDistance})`, `wallEndpoints(wall)`, `wallPointAt(wall, t)`,
  `cutOfWall(cut)`, `wallOfCut(cut)`, `cutwalls()`, `classify(mesh)`, `elementRoot`, `listElements`,
  `buildWall`, `buildTool(toolKey, opts)`, `pickOpeningModel(kind, width)`, `focusOn`, `attachGizmo`.
- Lists: `gizmoLists.{objects,openings,walls,frames,roofs,polyRoofs}` and the matching
  `gizmoManagers`. Events: `HP3D.events`, `HP3D.emit`, `HP3D.on`, plus the DOM event `hp3d:ready`.
*(OBSERVED — @ 506 504–569 056; `placeOpening` @ 543 423; `pickOpeningModel` `_0x105200` @ 285 133.)*

`pickOpeningModel(kind, width)` is the auto-pick in `placeOpening` and is worth noting as an idea
source: it filters out `gate|glassblock|accordion|fold|side`, then prefers `/garage/i` when a door is
≥ 2.2 m wide, `/double/i` when a door is ≥ 1.3 m or a window ≥ 1.6 m wide, and otherwise the first
plain catalogue entry; it falls back to the plain list, then to the whole list, then to `null` (which
throws `"No door model in the catalog"`). *(OBSERVED — @ 285 133.)*

### 2.7 Evidence inventory

| Evidence | What it shows |
| --- | --- |
| `r1:src/hp-editor.deobf.js` @ 58.7k–66.5k | `#frameButtonW`/`#frameButtonD` 8-handle extrude tools, `metadata.hp={kind:"frame",frameType}` |
| `r1:src/hp-editor.deobf.js` @ 41.0k–46.5k | catalogue insert of `doorWindow` products (click a wall, model seats + re-orients, `cutwalls` after 300 ms); grid snap |
| `r1:src/hp-editor.deobf.js` @ 124.6k–137.5k | `_0x4d5796`: host-by-intersection, CSG subtract, ×6 cutter inflation, `windowrefplane` proxies |
| `r1:src/hp-editor.deobf.js` @ 137.3k–144.6k | `#distwindowdoorwall` HUD; left/right/up/down wall gaps; horizontal/vertical cursors |
| `r1:src/hp-editor.deobf.js` @ 231.3k / 238.9k / 246.4k / 312.5k | gizmo managers; `attachableMeshes`; detached Z/Y; `snapDistance`; drag-end rebind |
| `r1:src/hp-editor.deobf.js` @ 328.9k–334.6k | plan-import conversion; `computeObjectTransform`; door/window Y seating; `binder.hinge` |
| `r1:src/hp-editor.deobf.js` @ 330 886 | `hinge === "reverse"` → `scaling[longAxis] *= -1` |
| `r1:src/hp-editor.deobf.js` @ 350 755 ff. | 2-D `modelYawOffset` turn (+90°) and `modelAutoTurn` |
| `r1:src/hp-editor.deobf.js` @ 352 700–357 000 | 2-D planner bridge: `DOOR_TYPES`/`WINDOW_TYPES`, `modeOption`, `binder.obj.type`, `floorplannerHooks.objectPlaced` |
| `r1:src/hp-editor.deobf.js` @ 433 989 | classifier: `frame` vs `door`/`window` vs `wall_cut` |
| `r1:src/hp-editor.deobf.js` @ 504 753 | tool map `opening→frameButtonW`, `doorOpening→frameButtonD` |
| `r1:src/hp-editor.deobf.js` @ 506 504–569 056 | `window.HP3D` public API |
| `r1:src/hp-editor.deobf.js` @ 543 423 | `placeOpening` clamps, yaw, flip, sill, `metadata.hp` |
| `r1:src/hp-bim.deobf.js` @ 72 224 | `_0x1dce1f`: client-side element collector posted to the check |
| `r1:src/hp-bim.deobf.js` @ 102 279 | `_0x240c6f`: `POST api/bim.php` transport (gzip via CompressionStream) |
| `r1:src/hp-bim.deobf.js` @ 106 093 | `_0x911969`: `action:"check"`, issue uid → mesh re-mapping |
| `r1:src/hp-bim.deobf.js` @ 302 936 | `_0x90a459`: issue list renderer incl. "other element" (`bim.selectOther`) |
| `r1:raw/tooltab.html` | `#frameButtonW` / `#frameButtonD` markup, steppers, ranges (2.5–20 m, step 0.125) |
| `r1:raw/app.html` | i18n (`tool.opening`, `kind.frame`, `bim.issue.*`, `p2d.modelTurn`); HTML comment "distances of the rough opening to the wall ends while it is dragged" above `#distwindowdoorwall` |
| `raw/2d-planner-index.html` | live fetch of `2D-Planner/index.php` (HTTP 200): "Reverse hinges" panel (`#extension-floorplanner-objToolsHinge`, `dw.flip`), width/height sliders, "arc shows where it opens" hint, doorway taxonomy labels |

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort; each names the finding it comes from and the schema touch-point. CasaPlazAI's
opening row is `{id, roomId, kind:"door"|"window", segmentIndex, tCenter, width, sillHeight, headHeight}`
with `opening-too-wide` as its only geometric opening fault (`casaplazai-schema.md`).

**A. Adopt the two-tool split as a real product distinction — high value, low effort.**
*From §2.1.* CasaPlazAI today has one opening concept. Give the tool card a **"Rough opening"** tile and
a **"Door/window"** tile. The competitor's rough opening is a standalone apertured panel the user
shapes by hand (not a cut in a wall), which is exactly the semantic CasaPlazAI would want for a
pass-through or a service chase; model it as a `kind:"door"` row with `headHeight` near the wall height
and a small new `openingStyle:"rough"|"leaf"` flag, so a later "choose the leaf" step can upgrade it
without moving it. Cheap: one tile + one flag, no new geometry, and it matches the competitor's
vocabulary that users already know.

**B. Keep hosting in the schema, but borrow the competitor's clamps for the validator.**
*From §2.2/§2.4.* The competitor's biggest architectural weakness is that an opening is a free mesh
until a later intersection pass guesses its wall — which is why it needs the post-hoc `openingNoWall`
and `openingOverlap` checks. CasaPlazAI already does the right thing (`roomId` + `segmentIndex` +
`tCenter`), so **do not copy the free-mesh model.** Instead, add the two clamps the competitor's
`placeOpening` enforces to CasaPlazAI's `validate.ts`:
`opening-too-close-to-wall-end` when `tCenter*L ± width/2` comes within 0.1 m of either endpoint
(today only `opening-too-wide` fires at the exact end), and `opening-head-too-high` when
`sillHeight + headHeight > wallHeight`. Both are closed-form on existing fields; high value, tiny
effort, and they are the competitor's actual numbers (0.1 m end margin, 0.05 m door head margin,
0.2 m window head margin). *(Schema: new validation codes only, no shape change.)*

**I. Surface conflicts as paired, cross-highlightable findings.**
*From §2.4.* The competitor's check returns each issue with a primary element **and** an `other`
element, rendered as a "Select the other element" button (`bim.selectOther`) — so "A overlaps B" is one
click away from seeing both. CasaPlazAI has no conflict layer at all today. Add a client-side
`findOpeningConflicts(data)` (pure function over `openings`, no server needed) that returns
`{a, b}` pairs for same-segment overlaps, and render each as an inspector row with two chips that
select the respective openings. This is the offline-friendly, deterministic version of the competitor's
feature and fits CasaPlazAI's localStorage-only architecture. *(Schema: none — derived view; keep it out
of `FloorplanData` like the measurement annotations.)*

**C. Port the "wall clearances" HUD to the 2-D inspector — high value, medium effort.**
*From §2.3.* The competitor's `left / right / up / down` read-out while dragging is genuinely useful and
cheap to reproduce: for the selected opening you already know `L`, `tCenter`, `width`, `sillHeight`,
`headHeight`, and `wallHeight`, so all four gaps are closed-form — no bounding boxes needed. Show them
as four small labels around the selected opening in the inspector, updating on drag. This is the single
highest perceived-value item from this round because it prevents the very collisions the competitor
only warns about later. *(Schema: none; pure editor UI, reads existing fields.)*

**J. Hover-over-wall placement with a swing-arc preview.**
*From §2.5.* The competitor's 2-D planner places a door/window by *hovering over a wall* and clicking,
drawing a **swing arc during the hover** so the opening direction is visible before the commit; the
3-D editor's own rough-opening tools are the clumsy alternative (drag 8 handles). CasaPlazAI already
snaps to segments and has the wall geometry, so a hover preview that shows the prospective cutout plus
a quarter-circle swing arc (derived from `flip`) is a small canvas overlay and a big UX win. Pair it
with the `Del`-to-delete / width-slider behaviour the competitor also exposes in the same panel.
*(Schema: none for the preview; the committed row is the existing `Opening`.)*

**D. Grid snap on opening drag should reuse the existing snap setting.**
*From §2.3.* The competitor snaps gizmo drags to `1/gridDivisions`. CasaPlazAI already persists
`casaplaza.snap.settings.v1`; make opening/window dragging honour it (quantise `tCenter` to the nearest
grid intersection, not a fixed fraction). Note the competitor's own grid is 0.125 m
(`0.125*unitsconver`, `snapDistance = 1/divisions`), which is why its stepper step is 0.125 — a good
sanity value for CasaPlazAI's own "fine" pitch.

**E. Offer a one-click "auto model pick" analogous to `pickOpeningModel`.**
*From §2.6.* When the user drops a window on a wall and has not chosen a variant, pre-select a sensible
variant from the **width**: single leaf below ~1.3–1.6 m, double/sliding above, and a distinct
"garage"/wide type above ~2.2 m. This is a small pure function over the catalogue and removes a
decision from the primary flow. *(Schema: could seed `kind` and a future `variant` field; today just
the palette selection.)*

**F. Expose programmatic placement, mirroring `window.HP3D`.**
*From §2.6.* The competitor's `HP3D.placeOpening/moveElement/cutwalls` made it trivially automatable
(and made this teardown possible). CasaPlazAI is a single-page app with a schema — exposing a small
`window.CasaPlaza.placeOpening({roomId, segmentIndex, tCenter, width, sillHeight, headHeight})` that
validates then commits to the same store costs little and pays off in tests, power users and any future
AI/tooling integration. *(Schema: writes the existing `Opening` shape; reuse `validate.ts`.)*

**G. Model swing as one boolean plus an explicit type — copy the planner's restraint.**
*From §2.5.* The competitor's user-facing control is a single **"Reverse hinges"** toggle, not a
handedness dropdown; the richer swing vocabulary only appears in the BIM/compliance layer. If
CasaPlazAI adds swing presentation, do the same: an optional `flip:boolean` (default `false`) plus a
`variant` for the type (`aperture/simple/double/pocket`, `fix/flap/twin/bay` are proven vocabularies),
and derive any richer `swing` semantics for display only. Never encode the mirror as a negative mesh
scale — the competitor does (`scaling[longAxis] *= -1`) and it is exactly the kind of rendering detail
that should not leak into a schema. *(Schema: additive optional fields, registered through `migrate.ts`
per the migration hook convention.)*

**H. Two-row shared-door convention — verify the competitor's behaviour before investing.**
*From §2.4 (negative result).* The competitor never solves "the same door on a shared wall" in the
3-D layer; it re-derives hosting per wall by intersection. CasaPlazAI's two-row convention (advisor
ruling #2) is strictly better; keep it and add a validator test that both mirrored rows survive an
opening edit, rather than implementing any intersection pass.

## 4. Unknowns

- **The BIM rule engine is server-side and was not observable.** The overlap / no-wall / short-wall /
  thin-wall thresholds are computed by `POST api/bim.php` (`action:"check"`); only the transport and
  the issue-rendering path exist client-side. The codes and messages are OBSERVED (i18n dictionary,
  `r1:src/hp-bim.deobf.js` @ 106 093 / @ 302 936) but the **tolerances are UNKNOWN**. This is the
  largest remaining gap and it is not reachable by static analysis of the shipped bundles; a live
  scenario that builds two overlapping openings and runs the check would be needed.
- **No scripted *browser* session was achieved this round** (though a live HTTP fetch was). `rea
  capture-browser-scenario` (v6.8.0) has no `evaluate` action and rejects `browser.args`
  (`{"path":["browser","args"],"reason":"unknown_argument"}`); its action enum is only
  `goto|click|fill|press|select_option|check|uncheck|wait_for|request|wait_for_timeout`. A plain
  `curl` fetch of `2D-Planner/index.php` **did** succeed and supplied §2.5, but it returns only the
  static HTML shell — the planner's door/window *geometry* (swing arc, hinge mirroring) is drawn by
  its own JS at runtime and was not exercised. Consequently the `HP3D` API is documented from its
  definition rather than from a live call, and no WebGL / software-GL check was performed.
- **Where "rough openings" are finally consumed in the model/export.** The frame elements are their own
  class (`kind:"frame"`, mesh `"2poly"`) and `_0x4d5796` only iterates `getMeshesByID("door_window")`,
  so the automatic cut pass does **not** cut for frames — the `#frameButtonW/D` handlers only regenerate
  UVs (`_0x3a43e4`, which rewrites `VertexBuffer.UVKind`) and never call `cutwalls()`. Whether frames
  are exported to IFC/BIM at all (they carry no host-wall reference) is **UNKNOWN**; the classifier
  does expose them as `frame` to `HP3D.classify`, so they are at least first-class to selection and
  gizmos. *(Evidence: @ 121 232 `_0x3a43e4` UV helper, @ 124 535 `getMeshesByID("door_window")`,
  @ 433 989 classifier.)*
- **Precise default grid pitch and "levels" semantics** beyond the `0.125 m` stepper step and
  `floor-to-floor height` default `2.65 m` (read from `r1:raw/app.html` `#floorheight`); the
  competitor's "level" vs "floor" naming (the 2-D planner has both) was not fully reconciled.
- **`hinge`/`swing` enum is now largely resolved.** The planner exposes a single boolean **"Reverse
  hinges"** (`dw.flip`) rather than a hinge-side enum, and round 1's `bim.swing` values
  (`left/right/double/sliding/fixed/pivot`) are the **BIM/compliance view** of the opening's type and
  operation, set from the planner's opening-type chips (`door.aperture/simple/double/pocket`,
  `window.fix/flap/twin/bay`), not a second 3-D control. What remains unverified is the exact mapping
  from each type chip to each `bim.swing` value and the IFC operation enum. *(OBSERVED for the panel
  and the taxonomy; INFERRED for the mapping.)*
- **Licence:** no licence file was observed for 3D House Planner; its shipped JavaScript is obfuscated
  and proprietary. No code was copied — behaviour, constants and data shapes are described in my own
  words.
