# 3D House Planner — doors, windows and other openings
**Competitor teardown for CasaPlazAI · job `04-04-doors-windows`**

Target: <https://www.3dhouseplanner.com/> (editor at `app.php`). Research date 2026-10-31.
All evidence files live in this job folder. No source code was copied: everything below is a
description of observed behaviour, data shapes and UX patterns in my own words. The app ships
GPL-free, obfuscated, closed-source JavaScript (no licence was observed on the site), so I only
report facts and behaviour.

---

## 1. Summary

- **Openings are hosted elements, not standalone objects.** A door or window is placed on a wall
  and stored parametrically as a fraction `t ∈ [0,1]` along that wall (with a yaw computed from the
  wall direction, including curved walls), plus a small property bag (`sill`, `swing`, `operation`,
  `fireRating`, `mark`, `material`). Movement is therefore constrained to the host wall by
  construction. *(OBSERVED — `src/hp-editor.deobf.js` `placeOpening`, `src/hp-bim.deobf.js`)*
- **Two authoring tools, two catalogues.** The tool pane offers **"Rough opening"** (`#frameButtonW`)
  and **"Door opening"** (`#frameButtonD`); the catalogue is `window.HP_BOOT.doorOptions`
  (**60** GLB door models) and `window.HP_BOOT.windowOptions` (**46** GLB window models), each entry
  `{id, title, title_en, image, path, rotation_offset}`. *(OBSERVED — `raw/app.html`,
  `raw/boot-full.json`, `raw/tooltab.html`)*
- **The 2D planner, not the 3D editor, owns the opening taxonomy.** The 3D view consumes
  `DOOR_TYPES = ["aperture","simple","double","pocket"]` and
  `WINDOW_TYPES = ["fix","flap","twin","bay"]` from the embedded 2D planner and merely reacts to its
  `mode` / `modeOption` / `binder.obj.type`. *(OBSERVED — `src/hp-editor.deobf.js`)*
- **Swing and mirroring are first-class and cheap.** `bim.swing` has six semantic values
  (`left, right, double, sliding, fixed, pivot`) that map to a long IFC operation enum; **mirroring is
  implemented by negating the mesh scale on its long axis** when `hinge === "reverse"`, i.e. a flip
  in place, not a rotation. *(OBSERVED — `src/hp-editor.deobf.js`, `src/hp-bim.deobf.js`,
  `raw/app.html` i18n dictionary)*
- **The wall is really cut, and the cut is measured.** Walls merge into `wall_merged` / `csg2` meshes
  and each placed opening becomes a mesh called `door_window`; BIM quantities distinguish
  `GrossSideArea`/`NetSideArea`, `GrossVolume`/`NetVolume` and expose a separate `OpeningArea`.
  Violations surface as model checks (`openingOverlap`, `openingNoWall`, `normDoor`, `normEgress`,
  `normLight`). *(OBSERVED — `src/hp-bim.deobf.js`, `raw/app.html`; CSG mechanism INFERRED)*

---

## 2. Findings

### 2.1 Opening catalogue and types

**Two separate model catalogues.** `window.HP_BOOT` carries `doorOptions` (60 entries) and
`windowOptions` (46 entries) alongside `objectOptions` (1 776 furniture/object models),
`objectCategories` (157), `products` (1 882), `textures`/`floorplanTextureCatalog` (456) and
`suggestions` (`objects`, `textures`).
*(OBSERVED — `raw/boot-full.json`, captured from the live page; `raw/app.html` line ~38 758 shows
the editor reading `HP_BOOT['doorOptions']` / `['windowOptions']`.)*

Every door and window entry has exactly the same six fields, with no per-model size metadata:

```json
{"id":27, "title":"Red mahogany panel door", "title_en":"Red mahogany panel door",
 "image":"/admin/imagedetails/mgodoor.png", "path":"/admin/objects/9mpdoor.glb",
 "rotation_offset": null}
```
*(OBSERVED — `raw/boot-full.json`; all 106 entries share `{id,title,title_en,image,path,rotation_offset}`;
`rotation_offset` is `null` for all 106 in the captured session.)*

The catalogue is predominantly **dressed models**, not abstract types: doors include "White bifold
panel door", "Grey diagonal slat garage door", "White 9-lite half-glass door"; windows include
"White sliding window pair", "Black window with top vent", "Wide black six-pane window". Openings
are therefore chosen by *appearance*, with behaviour added separately.
*(OBSERVED — `raw/boot-full.json`)*

**The 2D planner defines the behavioural taxonomy.** In the 3D editor, the door/window mode guard is:

```
DOOR_TYPES  = iframe.DOOR_TYPES   || ["aperture","simple","double","pocket"]
WINDOW_TYPES= iframe.WINDOW_TYPES || ["fix","flap","twin","bay"]
```
*(OBSERVED — `src/hp-editor.deobf.js`, around the `FloorplanLibrary.setData` call.)*

`aperture` (= plain hole) vs `simple/double/pocket` (= leaf behaviours) and
`fix/flap/twin/bay` are the real type system; the 3D editor only switches which side panel and
which 3D catalogue list it shows. *(OBSERVED for the code path; the *meaning* of each token is
INFERRED from the names plus the `kind.frame` / `kind.door` / `kind.window` labels.)*

**The tool pane exposes only two opening tools**, both with hand-drawn SVG icons that literally show
a hole in a wall:

| Tool | id | i18n label | i18n value |
|---|---|---|---|
| Rough opening | `#frameButtonW` | `tool.opening` | "Rough opening" |
| Door opening | `#frameButtonD` | `tool.openingDoor` | "Door opening" |

*(OBSERVED — `raw/tooltab.html`, `raw/app.html`, and the i18n dictionary in `raw/app.html`.)*

The element-type labels are `kind.frame = "Rough opening"`, `kind.door = "Door"`,
`kind.window = "Window"`. So the app distinguishes a **pure hole** (`kind.frame`) from a **hole with
a door/window behaviour** attached — an important modelling distinction CasaPlazAI currently lacks.
*(OBSERVED for the labels; the hole-vs-leaf interpretation is INFERRED but strongly supported by the
icon markup and by `bim.issue.openingNoWall`.)*

### 2.2 Placement on walls

**Placement is parametric on the host wall.** The editor's BIM-side API exposes:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- `kind === "door" ? "door" : "window"`
- if a `wall` is given: `t` is clamped with `max(0, min(1, t))`, then the insertion point is linearly
  interpolated between the wall endpoints; **for curved walls** a dedicated curve evaluator returns
  the point *and* `yaw = atan2(-dirZ, dirX)`.
- otherwise the opening is placed from free `x,z` coordinates rescaled to the level.
*(OBSERVED — `src/hp-editor.deobf.js`, `'placeOpening': async function(...)`.)*

This is the key architectural difference from a "drop an object anywhere" palette: an opening cannot
exist off a wall, and sliding it is a 1-D operation along one wall.
*(OBSERVED for the data flow; INFERRED for the interaction.)*

**Distance-to-wall-end feedback while dragging.** A floating card `#distwindowdoorwall` shows a small
floor-plan SVG with four live readouts — `#leftwall`, `#rightwall`, `#upwall`, `#downwall` — and two
positioned markers, `#horizontalwindow` and `#verticalwindow`, moved via CSS transforms:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
*(OBSERVED — `src/hp-editor.deobf.js`.)*

**Host-wall binding in 3D.** Placed openings are found by iterating meshes with id `wall` and testing
`opening.intersectsMesh(wall, true)`; a companion mesh `door_window_binding-<id>` and a
`windowrefplane` exist so a reference plane can be re-attached to the opening's host.
*(OBSERVED — `src/hp-editor.deobf.js`.)*

**2D ↔ 3D bridge.** The 3D editor embeds `2D-Planner/index.php` in `#floorplanIframe` and pushes the
catalogue into it (`FloorplanLibrary.setData({categories, products})`), then reacts to
`floorplannerHooks.objectPlaced`. Door/window mode is driven by
`#extension-floorplanner-door_mode` / `#extension-floorplanner-window_mode` and by the iframe's
`mode` (`door_mode`, `edit_door_mode`, …) and `modeOption`; the current element type is read from
`binder.obj.type`. A 250 ms interval (`__doorWindowVisibilityInterval`) keeps door/window visibility
in sync.
*(OBSERVED — `src/hp-editor.deobf.js`.)*

**Sliders are wall-length controls, not opening-size controls.** While an opening tool is active the
pane shows steppers labelled "Wall length":

| Control | min | max | value | step |
|---|---|---|---|---|
| `#sliderdistancewindowwall` | 2.5 | 20 | 4 | 0.125 |
| `#sliderdistancedoorwall` | 2.5 | 20 | 4 | 0.25 |

with label `tool.wallDist = "Wall⇔{v}"` and an initial readout `"Wall⇔4.00m"`.
*(OBSERVED — `raw/tooltab.html`, `raw/app.html`, `src/hp-editor.deobf.js`.)*

**Wall-drawing context that the openings inherit:** chain / single / rectangle / arc modes, and
center / inside / outside wall alignment (`wb.mode`, `wb.chain`, `wb.single`, `wb.rect`, `wb.hintArcBend`,
plus data-tip strings in `raw/tooltab.html`). Openings are cut into whatever those walls produce.
*(OBSERVED for the controls; INFERRED for the inheritance.)*

### 2.3 Sizing

There is **no width/height editor in the 2D tool pane**. Sizing appears in two other places:

1. **BIM element properties.** The Opening section is built as
   `"<div class='hp-section-title'>door_front Opening</div>"` followed by a 2-column grid with
   `data-open="sill"`, `data-open="swing"`, `data-open="operation"`, `data-open="fireRating"`,
   `data-open="mark"`, `data-open="material"`.
   - `bim.sill` = "Sill height", unit-suffixed, with the level's default as placeholder.
   - `bim.mark` placeholder is `P01` for doors and `J01` for windows.
   *(OBSERVED — `src/hp-bim.deobf.js`.)*
2. **Schedules.** The doors/windows schedule columns are
   `levelName, mark, name, width, height, sill, area, host, swing, operation, fireRating, material,
   typeName` (windows reuse the door column set verbatim).
   *(OBSERVED — `src/hp-bim.deobf.js`, `_0x3b0747['windows'] = _0x3b0747['doors']`.)*

So width/height exist as opening *properties* and are reportable, but the primary source of the
geometry is the GLB model itself: the placed mesh is aligned so its `minY` sits at the model's
`minY` and its X/Z centre matches the model's centre, i.e. the model's own bounding box defines the
hole. *(OBSERVED — `src/hp-bim.deobf.js`; "model bbox drives the hole size" is INFERRED.)*

Sizing is also **regulated by checks** rather than blocked at placement time:
`bim.issue.normDoor` ("Door {name} is {v} m wide; at least {min} m for this room"),
`bim.issue.normDoorEntrance`, `bim.issue.normLight` (windows/floor ratio),
`bim.issue.normEgress` ("no window can serve as emergency escape ({area} m² clear, sill at most
{sill} m)"), `norms.egressValue` ("{area} m² clear, sill ≤ {sill} m").
*(OBSERVED — i18n dictionary in `raw/app.html`.)*

### 2.4 Swing direction and mirroring

**Six semantic swing values**, presented as a `<select class="hp-input" data-open="swing">` with an
empty option, rendered by mapping over `['left','right','double','sliding','fixed','pivot']` to
`bim.swing.left/right/double/sliding/fixed/pivot` = Left / Right / Double / Sliding / Fixed / Pivot.
*(OBSERVED — `src/hp-bim.deobf.js` and the i18n dictionary in `raw/app.html`.)*

**A separate IFC operation enum** is offered in the same grid
(`data-open="operation"`): doors get
`SINGLE_SWING_LEFT, SINGLE_SWING_RIGHT, DOUBLE_DOOR_SINGLE_SWING, DOUBLE_SWING_LEFT,
DOUBLE_SWING_RIGHT, DOUBLE_DOOR_DOUBLE_SWING, SLIDING_TO_LEFT, SLIDING_TO_RIGHT,
DOUBLE_DOOR_SLIDING, FOLDING_TO_LEFT, FOLDING_TO_RIGHT, DOUBLE_DOOR_FOLDING, REVOLVING, ROLLINGUP,
SWING_FIXED_LEFT, SWING_FIXED_RIGHT, USERDEFINED, NOTDEFINED`; windows get panel operations
`SINGLE_PANEL, DOUBLE_PANEL_VERTICAL, DOUBLE_PANEL_HORIZONTAL, TRIPLE_PANEL_VERTICAL,
TRIPLE_PANEL_BOTTOM, TRIPLE_PANEL_TOP, TRIPLE_PANEL_LEFT, TRIPLE_PANEL_RIGHT,
TRIPLE_PANEL_HORIZONTAL, USERDEFINED, NOTDEFINED`.
*(OBSERVED — `src/hp-bim.deobf.js`.)*

**Mirroring is an in-place scale flip, not a rotation.** In the mesh builder:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
*(OBSERVED — `src/hp-editor.deobf.js`.)*

This is elegant and cheap: the *same* GLB is reused for both hands of a door by flipping the scale on
its long axis, and the yaw is computed from a combination of the 2D wall angle, a per-product
rotation offset and a user offset. `computeDoorWindowYaw` is a first-class API on the same object as
`placeOpening`.
*(OBSERVED — `src/hp-editor.deobf.js`.)*

**Robust to badly-oriented models.** `rotation_offset` in the catalogue entry, falling back to
`productRotationOffset` on the placed object, feeds the yaw; the 2D side shows `p2d.autoTurn`
"(auto 90°)", `p2d.modelTurn` "Model turn: {v}°", `p2d.frontHint` "Blue triangle = front of the 3D
model" and `p2d.rotateTip` "The 3D model faces the wrong way? Turn it by 90° inside this symbol."
*(OBSERVED — `src/hp-editor.deobf.js`, i18n dictionary in `raw/app.html`.)*

**Generic mirroring also exists** for any element in the Copy tool: `copy.el.mirrorX` "Mirror ↔"
/ `copy.el.mirrorXTip` "Flip left-right (X axis) in place", and `copy.el.mirrorZ` "Mirror ↕" /
"Flip front-back (Z axis) in place".
*(OBSERVED — i18n dictionary in `raw/app.html`.)*

### 2.5 How the opening cuts the 3D wall

**Classification.** The IFC/geometry import maps entity names to mesh roles:

| IFC entity | kind | mesh id |
|---|---|---|
| `IFCWALL*`, `IFCCURTAINWALL` | wall | `wall_merged` |
| `IFCDOOR`, `IFCDOORSTANDARDCASE` | door | `door_window` |
| `IFCWINDOW`, `IFCWINDOWSTANDARDCASE` | window | `door_window` |
| `IFCSLAB*`, `IFCCOVERING`, `IFCPLATE`, `IFCFOOTING` | slab | `polyt1_ifc` |
| `IFCROOF` | roof | `polyt3_ifc` |
| `IFCOPENING*`, `IFCSPACE`, `IFCANNOTATION`, `IFCVIRTUALELEMENT` | *(skipped → `null`)* | |
| everything else | object | `objmeshes` |

*(OBSERVED — `src/hp-bim.deobf.js`.)*

Note that a placed door/window becomes a `door_window` mesh, and the editor's "is this a wall-like
mesh?" predicate (`_0xcf6c84`) explicitly includes `wall, wall_merged, csg2, door_window, objmeshes,
poly, 3poly, 4poly, autoRoof, hpRoof, 2poly, skirting, ceiltrim, groundplan` and anything matching
`/^polyt[123]/`. `csg2` and `wall_merged` being in that set, together with the separate `door_window`
mesh id, is consistent with **boolean subtraction of the opening volume from the merged wall mesh**.
*(OBSERVED for the ids and predicate; the CSG-subtraction mechanism is INFERRED.)*

**Mesh placement.** On import/instantiate the opening mesh is oriented and grounded:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
*(OBSERVED — `src/hp-bim.deobf.js`.)*

**Gross vs. net quantities.** Wall quantities include `GrossSideArea` / `NetSideArea`,
`GrossVolume` / `NetVolume`, `GrossFootprintArea`, and openings carry `OpeningArea`, `Cut volume`
and `Fill volume` (`bim.q.Cut`, `bim.q.Fill`, `bim.q.OpeningArea`). Reporting both gross and net
values confirms openings puncture the wall volume rather than decorate its surface.
*(OBSERVED — i18n dictionary in `raw/app.html`, schedule columns in `src/hp-bim.deobf.js`.)*

**Consequential geometry follows the cut.** Skirting is described as running "along the inner faces of
the walls of every room … with gaps at the doors" (`skirt.globalHint`), i.e. downstream trim
recognises door openings. *(OBSERVED — i18n dictionary.)*

**Wall composition is layered**, e.g. `"Masonry 14 cm + plaster"` with layers
`Plaster 0.02 / Ceramic block 0.14 / Plaster 0.02`, `"Drywall 9.5 cm"` with
`Gypsum board 0.0125 / Steel studs + mineral wool 0.07 / Gypsum board 0.0125`.
*(OBSERVED — `raw/bim-before.json`, `HPBIM.types`.)*

### 2.6 Constraints and validation

Placement is **permissive**; correctness is enforced afterwards by a model check that produces a BCF
export. Directly opening-related checks:

| i18n key | Message |
|---|---|
| `bim.issue.openingNoWall` | "{name} is not inside a wall." |
| `bim.issue.openingOverlap` | "{a} overlaps {b} in the same wall." |
| `bim.issue.dupWall` | "{a} and {b} are the same wall." |
| `bim.issue.shortWall` | "{name} is very short ({v} m)." |
| `bim.issue.thinWall` | "{name} is very thin ({v} m)." |
| `bim.issue.noDoor` | "Level {n} has rooms but no door." |
| `bim.issue.noWindow` | "Room \"{name}\" has no window." |
| `bim.issue.normDoor` | "Door {name} is {v} m wide; at least {min} m for this room" |
| `bim.issue.normDoorEntrance` | "Entrance door {name} is {v} m wide; at least {min} m" |
| `bim.issue.normLight` | "{name}: windows are {v} % of the floor area; at least {min} % (about {need} m²)" |
| `bim.issue.normWetVent` | "{name} has no window: provide mechanical ventilation or a duct" |
| `bim.issue.normEgress` | "{name}: no window can serve as emergency escape ({area} m² clear, sill at most {sill} m)" |

*(OBSERVED — i18n dictionary in `raw/app.html`; `bim.issue.openingOverlap`/`openingNoWall` are also the
natural reading of the parametric wall-hosted model in §2.2.)*

Openings are also a first-class **copy category**: `copy.group.openings` = "Doors and windows",
`tool.copyWindoor` = "Copy window / door", `copy.level.intro` = "Copy walls, openings and floors of a
level to another one", `gui.copyHint` = "Choose what to copy in the tool card: walls,
floors, doors/windows or material." The copy tool is gated by `#copywindoor` and `#copycheck`.
*(OBSERVED — `raw/app.html` i18n dictionary and `src/hp-editor.deobf.js`.)*

**AI floor-plan import** can synthesise openings: `fpai.openings` = "Insert detected doors and
windows" (checkbox `#floorplanAiOpenings`), `fpai.sub` = "Walls are traced from the image; the AI
model checks them, finds doors, windows and room types.", `fx.fp.openings` = "Inserting doors and
windows…". *(OBSERVED — `raw/app.html`.)*

**Dimensions recognise openings**: `dims.openings` = "Doors and windows" is a toggle group;
`measure.hint` = "Snaps to the corners of walls, openings, floors and objects."
*(OBSERVED — i18n dictionary.)*

### 2.7 Technology corroboration

The editor is a jQuery + Babylon.js single page: `assets/babylonjs/babylon.js`, `cannon.js`,
`ammo.js`, `Oimo.js`, `earcut.min.js`, `jquery-3.2.1.min.js`, plus 29 `js.php?f=editor/...` modules
(`hp-editor`, `hp-bim`, `hp-panels`, `hp-ui`, `hp-ai-place`, `hp-sync`, …), each obfuscated with
`javascript-obfuscator`'s string-array transform. The editor also embeds a second, separate
`2D-Planner/index.php` application. *(OBSERVED — `raw/js-manifest.txt`, `raw/scripts.json`,
`raw/scenario-app-load.json`, `raw/app.html`.)*

Evidence files:
`raw/app.html` (2.09 MB served HTML incl. the full i18n dictionary and catalogue markup),
`dom/app-ready__boot.html` (post-load DOM), `shots/app-ready__boot.png`,
`raw/boot-full.json` (1.17 MB `window.HP_BOOT`), `raw/tooltab.html` (tool pane markup),
`raw/scenario-app-load.json` (browser scenario with 232 network events),
`raw/bim-before.json` (`HPBIM.types` wall/slab/roof layer stacks),
`src/hp-editor.deobf.js` and `src/hp-bim.deobf.js` (string-array-decoded bundles),
`deobf.js` (the decoder I wrote), `cdp.py` (CDP bridge used for live introspection).

---

## 3. Ideas for CasaPlazAI

Ranked by value / effort. Each idea names the finding it comes from.

| # | Idea | From | Value | Effort |
|---|---|---|---|---|
| 1 | **Make openings wall-hosted with a `t` parameter.** Store `{hostWallId, t, kind, swing, mirrored}` instead of absolute x/z. Sliding becomes a 1-D drag clamped to `[0,1]`; `openingNoWall` becomes structurally impossible. | §2.2 `placeOpening` clamps `t` to `[0,1]` | High | Medium |
| 2 | **Split "rough opening" from "door/window".** Introduce `kind: 'frame' | 'door' | 'window'` so users can punch a hole for later, and so AI import can emit holes before leaves exist. Labels already exist as `kind.frame` / `kind.door` / `kind.window`. | §2.1 `#frameButtonW` vs `#frameButtonD` | High | Low |
| 3 | **Mirror by scale flip, not rotation.** `if (mirrored) mesh.scaling[longAxis] *= -1` with `longAxis = (w >= d) ? 'x' : 'z'`. One GLB serves both hands; no second asset, no 180° yaw bookkeeping. | §2.4 `hinge === "reverse"` | High | Low |
| 4 | **Six-value swing selector + separate IFC operation.** Snap a user-facing `left/right/double/sliding/fixed/pivot` in the properties panel, keep the long IFC enum in an advanced field. Cheap UI, real BIM payload. | §2.4 `bim.swing` + operation enum | Medium | Low |
| 5 | **Live distance-to-wall-end HUD while dragging an opening.** Left/right (and up/down) readouts plus two markers on a mini plan, updated by CSS transform every pointer move — no re-layout cost. | §2.2 `#distwindowdoorwall`, `#horizontalwindow`/`#verticalwindow` | Medium | Low |
| 6 | **Publish both gross and net wall areas + `OpeningArea`.** Walls already need a net figure; adding `GrossSideArea`/`NetSideArea`/`GrossVolume`/`NetVolume`/`OpeningArea` makes the cut auditable and powers a schedule. | §2.5 quantity names | Medium | Low |
| 7 | **Validate after placement, don't block it.** Keep dropping permissive, then run checks: overlap-in-same-wall, not-in-a-wall, door width minimums, window/floor ratio, egress clear-area + max sill. Report with a jump-to-element list; offer one-click BCF/CSV export. | §2.6 `bim.issue.*`, `norms.*` | High | Medium |
| 8 | **Per-opening property bag: `sill, mark, fireRating, material, swing, operation`.** Sill with a level-default placeholder; door marks `P01…`, window marks `J01…`. Turns openings from tokens into BIM data. | §2.3 `data-open=...` grid | Medium | Low |
| 9 | **Make "Doors and windows" a copy category** (duplicate to same place on another level; mirror X/Z in place). | §2.6 `copy.group.openings`, `copy.el.mirrorX` | Medium | Medium |
| 10 | **Interrupt skirting/trim at door openings** and treat openings as snap targets for the measure tool. Downstream geometry should consume the opening list, not re-detect holes. | §2.5 `skirt.globalHint`, §2.6 `measure.hint` | Low | Low |
| 11 | **Per-product rotation offset fallback chain** (`catalogue.rotation_offset` → `object.productRotationOffset` → user yaw) plus an on-canvas "front" indicator, so imported GLBs are never silently back-to-front. | §2.3/§2.4 yaw fallback, `p2d.frontHint` | Medium | Medium |
| 12 | **Type taxonomy owned by the plan model** (`DOOR_TYPES`/`WINDOW_TYPES` with overridable defaults) so 2D and 3D never drift. | §2.1 defaults-in-editor pattern | Medium | Medium |

---

## 4. Unknowns / what I could not verify

- **The 2D planner itself was never fetched.** `2D-Planner/index.php` is a separate embedded app;
  only the 3D side's view of it (`DOOR_TYPES`, `WINDOW_TYPES`, `mode`, `modeOption`,
  `binder.obj.type`, `doorSelect`/`windowSelect` in its DOM) was observed. The actual 2D placement
  gesture, snapping and its opening property model remain unverified.
- **No interactive placement was performed.** Chrome remote debugging on port 9333 was closed before
  the click-through step, and the session time budget ended before it could be re-run. So the exact
  click sequence, the default width/height per catalogue model, and whether a "flip swing" button
  exists in the 3D selection UI are **INFERRED, not OBSERVED**.
- **`hp-panels.js` and `hp-ui.js` were not successfully deobfuscated.** The string-array prologue
  reconstruction in `deobf.js` only parsed for some modules (`hp-editor`, `hp-bim`, `hp-app`,
  `hp-editor-tail`); the catalogue tile rendering and panel wiring therefore could not be read
  directly. `raw/tooltab.html` and `raw/pane*.html` were used instead.
- **The CSG cut is INFERRED.** Mesh ids (`wall_merged`, `csg2`, `door_window`), the wall-like-mesh
  predicate and the gross/net quantity names all point to boolean subtraction, but I did not observe
  the subtraction call itself.
- **Sizing source is INFERRED.** Width/height exist as schedule columns and the mesh is grounded to
  the GLB bounding box, but I did not observe whether the user can override them independently of the
  model.
- **`rotation_offset` was `null` for all 106 catalogs in this session**, so the override path is seen
  in code only, never exercised.
- **No vendor documentation exists** for this app. This report therefore contains no
  DOCUMENTED-tier claim other than the app's own published i18n strings and its shipped JavaScript;
  every finding above is OBSERVED (with the named evidence file) or INFERRED.
- **Catalogue counts are a snapshot** of one session on 2026-10-31 (60 doors / 46 windows /
  1 776 objects / 1 882 products); the catalogue is admin-populated and can change.
- **Licence:** no licence or terms file was observed for 3D House Planner; the shipped JavaScript is
  obfuscated and proprietary. Nothing was copied from it — behaviour is described in my own words.
