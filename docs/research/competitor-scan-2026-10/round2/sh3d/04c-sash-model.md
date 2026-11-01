# Sweet Home 3D (Online JS) — Sash model: 2-D swing arcs, 3-D opening, door/window dialog fields

Job `05-04c-doors-windows-sash-model` (round 2). Target: **Sweet Home 3D**
(https://www.sweethome3d.com/de/, GPL-2.0+ Java desktop; browser edition
https://www.sweethome3d.com/SweetHome3DJSOnline.jsp, same Java core compiled to JS with GWT).
Round-1 report reused **read-only**:
`~/dsh-workspaces/rea-sweethome3d-2026-10/04-04-doors-windows/report.md`.
New evidence is in this folder (`evidence/`, `*.js` drivers).

Tags: **OBSERVED** (live app run or shipped bundle, cited by file/URL) · **DOCUMENTED** (vendor page) ·
**INFERRED** (my reading). Behaviour/data-model descriptions only; no source code reproduced for reuse
(Sweet Home 3D is GPL-2.0+, its catalog GPL/CC-BY; nothing was copied into this report).

---

## 1. Summary (5 bullets)

- **A sash is a 5-number value object and nothing else.** `Sash = (xAxis, yAxis, width, startAngle, endAngle)` —
  getters only in the shipped JS (`evidence/sash-live.json`). Catalog fields are
  `doorOrWindowSashXAxis/YAxis/Width/StartAngle/EndAngle` (41 of 66 openings carry them), stored in cm/degrees
  in the JSON and normalised by the loader to **fractions of piece width/depth and radians**
  (`getDoorOrWindowSashes`, `bundles/sweethome3d.min.js`). Multi-sash openings put space-separated lists in the
  same five keys (e.g. 2 sashes with `XAxis="4.5 104"`, angles `"0 180"` / `"-90 270"`).
- **The 2-D plan draws each sash as a filled pie wedge (`Arc2D.PIE`), auto-mirror-aware, and I verified the
  geometry numerically live.** `PlanComponent.getDoorOrWindowSashShape(piece, sash)` centres the wedge at
  `(±x·width, y·depth)` in piece space, radius `sashWidth·width`, from `startAngle`; a mirrored piece negates
  the centre x, uses `180° − startAngle` and flips the angular extent. Live call for `eTeks#door` on a
  horizontal wall returned the wedge bounding box exactly at the analytic prediction
  (`x=59.25, y=3.75, 81.5×81.5`; `evidence/arc-geometry.json`).
- **No "opening angle" property exists at all — the swing lives in the *model*.** Every default-catalog door/
  window model I loaded carries named nodes `sweethome3d_hinge_N`, `sweethome3d_opening_on_hinge_N_*`,
  `sweethome3d_window_pane_on_hinge_N` and exactly one `sweethome3d_hinge_N_transformation` group per hinge
  (`evidence/model-nodes.json`, `evidence/model-nodes2.json`). Opening a leaf = replacing that group's 4×4
  matrix. I proved this live: setting the door's `hinge_1_transformation` to a Z-rotation swept the 3-D bounding
  box from 1.0×1.0×1.0 m to 2.23×1.0×1.0 m and `ModelManager.isDeformed()` flipped false→true for 30/45/90/135°
  (`evidence/persist.json`).
- **The door/window dialog exposes only generic furniture fields.** Live dialog for a placed door had cards
  Name · Location · Color and texture · Orientation · Size · Shininess with spinners x, y, elevation, angle,
  pitch, roll, width, depth, height, `Mirrored shape` ("change door opening direction"), keep-proportions and
  a `model-transformations-button` whose live label was **"Modify openings…"**
  (`tooltip: "…change door opening direction…"`; `evidence/dialog2.json`). **No sash, wall-thickness, wall-
  distance or opening-angle field anywhere** — confirming and sharpening round 1.
- **My live `setModelTransformations(...)` round-trip re-derives all wall/sash fractions from the new matrix**,
  which settles the 3-D question: when a leaf is posed, the code recalculates `wallThickness`, `wallDistance`,
  `wallWidth`, `wallLeft`, `wallHeight`, `wallTop` and each sash's x/y/width from the piece's *new* bounding
  box, normalised by (width, depth, height). Persisting a 45° hinge rotation left the piece numbers unchanged
  because the pose did not change the box (`evidence/persist.json`).

---

## 2. Findings

### 2.1 Sash definition and units (question part 1)

**Data model.** `Sash` is a value object with exactly five getters: `getXAxis, getYAxis, getWidth,
getStartAngle, getEndAngle` (live method list, `evidence/sash-live.json`). A placed opening holds a *list*:
`HomeDoorOrWindow.getSashes()`/`setSashes(list)` (**OBSERVED**, round-1 `evidence/app-empty-model.json`).
I confirmed live that `setSashes([new Sash(...)])` is accepted and read back verbatim (**OBSERVED**,
`evidence/sash-live.json` → `setSashOk: true`, `sashAfterSet`).

**Catalog keys** (**OBSERVED** in the shipped bundle and in the shipped catalog):
`DOOR_OR_WINDOW_SASH_X_AXIS:"doorOrWindowSashXAxis"` … `…SASH_END_ANGLE:"doorOrWindowSashEndAngle"`.
Census of the shipped catalog (`bundles/FurnitureCatalog.json`, 1740 records, 66 openings):
41 records carry the five sash keys; **21 of those have 2 sashes** (space-separated lists in each key); 25
openings have no sash at all (`evidence/sash-live.json` → `sashCensus`).

**Units / normalisation.** `DefaultFurnitureCatalog.getDoorOrWindowSashes` parses each key into a
space-separated array, requires equal lengths (throws otherwise) and constructs one `Sash` per index. Live
values are **fractions**: `eTeks#door` (catalog `5 / 8.5 / 81.5 / 0 / −90` cm·deg on a 91.5×14.5 cm piece)
reads back as `x=0.05464, y=0.58621, w=0.89071, a0=0, a1=−1.5708` (**OBSERVED** both sides).
So: `xAxis`/`width` × piece **width**, `yAxis` × piece **depth**, angles in **radians** (y-down screen space),
0° = +x, 90° = downward in the plan.

**Angle pairs actually shipped** (**OBSERVED**, `evidence/sash-live.json` → `anglePairs`):
`0/−90` ×28, `180/270` ×25, `−90/0` ×2, `−90/−180` ×4, `90/−90` ×1, `90/0` ×1, `180/90` ×1.
`yAxis` clusters at 0.5 (single-swing windows hinged at mid-wall-depth) and 0.56–0.83 (doors hinged toward
the inner face); one item at 0.023 and one at 0.125.

**Not rescaled on width edit, not rewritten by mirroring** (**OBSERVED**): widening the placed door 91.5→180 cm
left the sash tuple byte-identical (`sashAfterWidth`), and `setModelMirrored(true)` left it unchanged
(`sashAfterMirror`) — both consistent with round 1's T2/T3. Sash fractions are relative, so the *drawn* leaf
grows with the piece.

### 2.2 2-D drawing of swing arcs (question part 2)

Exact live-verified algorithm (**OBSERVED**; extract `PlanComponent.prototype.getDoorOrWindowSashShape` +
`paintDoorOrWindowSashes` in `bundles/sweethome3d.min.js`; measured via `evidence/arc-geometry.json`):

1. `h = piece.isModelMirrored() ? −1 : 1`
2. centre in piece-local cm: `cx = h · sash.xAxis · width`, `cy = sash.yAxis · depth` (y down = deeper into
   the wall); the code later translates by `(−width/2, −depth/2)` so piece-local origin is the piece centre.
3. radius `r = sash.width · width`; the arc is `Arc2D.Float(cx−r, cy−r, 2r, 2r, startDeg, extentDeg, PIE)`.
4. angles: `startDeg = sash.startAngle · 180/π`, and if mirrored `startDeg = 180 − startDeg`;
   `extentDeg = h · (sash.endAngle − sash.startAngle) · 180/π` (negative = clockwise in screen coords).
5. the whole wedge is transformed by translate(piece.x, piece.y) ∘ rotate(piece.angle) ∘
   translate(−width/2, −depth/2); each sash is filled (PIE) with the sash paint and stroked with the sash
   stroke — `paintDoorOrWindowSashes` iterates `getSashes()` and draws each shape.

**Numeric verification (live, `evidence/arc-geometry.json`).** For `eTeks#door` at x=100 on a horizontal wall
(width 91.5, depth 14.5007, angle 0, not mirrored): `getDoorOrWindowSashShape` bounds =
`{x:59.25, y:3.75, w:81.5, h:81.5}` = exactly the expected wedge (centre y = 0.58621·14.5007 = 8.5001,
radius 0.89071·91.5 = 81.5; a 0°→−90° quadrant from centre y=8.5 down to y=3.75 and x from 59.25 to 140.75).
Mirrored: bounds shift to `{x:159.25, y:3.75}` for a piece at x=200 — i.e. the arc is reflected to the opposite
jamb (centre x = −0.05464·91.5 = −5.0 piece-local). The path is a 4-vertex path for a 90° sweep
(`SEG_MOVETO` + 1 line + 2 curves + `SEG_CLOSE`) and is a **closed pie** (first vertex 140.75,3.75 … last
59.25,3.75), so the wedge is an area, not just an arc line. **OBSERVED**.

**Double sash.** `Scopia#window_2x3_arched` (two sashes `x=4.5 / 104`, `y=24.5`, `w=49.6`, `0→−90` and
`180→270`) produced two wedges spanning `250.25…299.85` and `300.15…349.75` — a symmetric two-leaf
casement. **OBSERVED** (`evidence/arc-geometry.json`). Adjectival detail: `Scopia#door` uses
`startAngle=180, endAngle=270` (xAxis 88 cm ≈ right jamb) and its wedge sits on the +x side, i.e. the same
catalog mechanism encodes a *right-hand* vs *left-hand* swing purely by the angle pair and the x/y axis.

**Relation to the wall drawing.** For openings the plan fills the piece rectangle clipped to
`cutOutShape` (`getDoorOrWindowRectangle(piece, true)` uses `depth·wallThickness` offset by
`depth·wallDistance`, and if the cut path is not the default unit rectangle it narrows width and shifts by the
path bounds, mirror-aware) and the wall-cut area is only painted when `isWallCutOutOnBothSides()` — round 1's
§2.4 re-confirmed by reading the same functions; my live `getDoorOrWindowRectangle` for `eTeks#door` returned
`{x:54.25, y:−3.7504, w:91.5, h:7.5004}` = the piece rectangle inside a 7.5 cm wall. **OBSERVED**.

**Change history.** v1.7 "Drawn the sashes of doors and windows with an arc of a circle (…catalog from version
1.7 and furniture libraries from 1.0.3)" — **DOCUMENTED** (`history.txt` line 975). No later entry changes the
2-D sash algorithm; v5.2 only changed the *rectangle* width for smaller cut-out shapes.

### 2.3 3-D opening: named model nodes + matrix "postures" (question part 3)

**No scalar angle.** Consistent with round 1: no `openAngle`/`openingAngle`/`isOpen` property anywhere; the
only "angles" are the static 2-D `Sash` angles. The 3-D pose is a **per-node 4×4 matrix list** on the placed
piece (`getModelTransformations()/setModelTransformations(list)`), persisted in XML as
`<transformation name="…" matrix="m00 m01 … m23"/>` (18 floats, 3×4) — **OBSERVED** in the exporter code and in
the shipped bundle.

**Naming scheme (OBSERVED, live model loads).** `ModelManager` defines
`SPECIAL_SHAPE_PREFIX="sweethome3d_"`, `HINGE_PREFIX="sweethome3d_hinge_"`,
`OPENING_ON_HINGE_PREFIX="sweethome3d_opening_on_hinge_"`,
`WINDOW_PANE_SHAPE_PREFIX="sweethome3d_window_pane"`, `…ON_HINGE="_on_hinge_"`,
`MIRROR_SHAPE_PREFIX="sweethome3d_window_mirror"`, `…ON_RAIL="_on_rail_"`, `RAIL_PREFIX="sweethome3d_rail_"`,
`OPENING_ON_RAIL_PREFIX="sweethome3d_opening_on_rail_"`, `BALL_PREFIX="sweethome3d_ball_"`,
`…MANNEQUIN_*…`, `DEFORMABLE_TRANSFORM_GROUP_SUFFIX="_transformation"`,
`SUB_TRANSFORMATION_SEPARATOR="_and_"`. At load time the manager **rebuilds the model graph**:
`updateSimpleDeformableModelHierarchy` pulls each `hinge_N` node and its `opening_on_hinge_N_*` children out of
the raw OBJ and reparents them under a generated pickable transform group named `hinge_N_transformation`;
`updateDeformableModelSubTransformedHierarchy` handles nested (`_and_`) hinges.

**What the default catalog actually ships** (**OBSERVED**, live loads via `ModelManager.loadModel`, my
`evidence/model-nodes2.json`; note the node names are baked into the shipped OBJ assets, not into the catalog
JSON — the catalog has no hinge key at all):

| catalog item | hinge groups | children of `opening_on_hinge` |
|---|---|---|
| `eTeks#door` (Door) | `hinge_1` | `door`, `handleIn`, `handleOut` |
| `eTeks#openDoor` (Open door) | `hinge_1` | same as above |
| `eTeks#window85x123` (Small window) | `hinge_1` | `handle`; plus `window_pane_on_hinge_1` |
| `Scopia#puerta` / `Scopia#door` | `hinge_1` | `door`, `maneta_puerta` / `handle` |
| `Scopia#window_2x3_arched` (Double arched window) | `hinge_1`, **`hinge_2`** | `glass`, `frame…`, `panes…` for each |
| `OlaKristianHoff#revdoor` (Revolving door) | `hinge_1` | `door2`, `doorbar`, `doorglass` (revolving leaves) |
| `eTeks#doorFrame` (Door frame) | — none — | no deformable node |
| `Mchnz#craftsmanDoorClosed` (Craftsman door, closed) | — none — | no deformable node |
| `OlaKristianHoff#window_deep` (Deep window) | — none — | sliding window: no hinge/rail node in the OBJ |

`ModelManager.containsDeformableNode(node)` returns true exactly for the items with a `*_transformation` group;
in the live dialog this drives the "Modify openings…" / mannequin button (see 2.4).

**How it is posed (live proof).** `HomePieceOfFurniture3D.updateModelTransformations(list)` walks the graph and
matches `transformation.name + "_transformation"` groups, writing each `Transformation` matrix into the group
(`updateTransformation`, `setNotUpdatedTranformationsToIdentity`). In the 3-D/modify dialog's preview
component the same happens interactively: `ModelPreviewComponent` picks the nearest `TransformGroup3D` under
the cursor, and for names starting with `hinge_`/`rail_` it **rotates (hinge) or slides (rail) the group by
direct matrix multiplication driven by mouse deltas** (`mouseDragged`: a Z-rotation about the projection of
the pivot for hinges, a Z-translation for rails), then reads back the model bounds and writes them into the
piece's x/y/elevation/width/depth/height. There is also a **pickable drag** path in the 3-D view itself:
`HomeComponent3D` (a `View3D`) handles `pressMouse`/`moveMouse`/`releaseMouse` when
`preferences.isEditingIn3DViewEnabled()` — the v7.2 "Selection and editing in 3D view" option — including a
"bounded pitch" guard that is *disabled* when the model contains a deformable node (so you can drag a hinge
past the top view). **OBSERVED** (bundle code; the live 3-D canvas `home-3D-view` is present and rendered at
1136×408, `evidence/3d-live.json`).

**Measured effect.** With the model loaded, rotating `sweethome3d_hinge_1_transformation` by
0/30/45/90/135° about Z changed the piece's model bounds (metres) as follows (**OBSERVED**,
`evidence/persist.json`):

| angle | x-extent | z-extent | `isDeformed` |
|---|---|---|---|
| 0° | 1.000 | 1.000 | false |
| 30° | 1.8956 | 1.000 | true |
| 45° | 2.214 | 1.000 | true |
| 90° | 2.2296 | 1.000 | true |
| 135° | 2.214 | 1.000 | true |

That is the leaf swinging out of the wall plane (a closed door is ~1 m of x, an open one ~2.2 m because the
1 m leaf lies along the wall) — the visual "opening angle", with no opening-angle number stored anywhere.

**Preset postures** are catalog data: `modelPresetTransformationsName_N` + `modelPresetTransformations_N`
(each value a run of `nodeName` + 12 matrix floats). Census of the shipped catalog: **104 such keys on 6
records, all mannequins** (`eTeks#mannequin`, `Scopia#mannequinMale/Brunette/fille/boy/nourrison`; names like
"Standing", "Sitting", "Running", "Lying down", "Dancing"). **No door or window has a preset posture.**
`DefaultPieceOfFurniture.isPieceOfFurniture*` strips `modelPresetTransformations*` from the per-instance
property list before placing, so postures stay definition-level. **OBSERVED**.
Changelog: v6.0 "Added the ability to rotate and slide openings and light spots"; v7.0 JS dialog; v7.2 "Added
preset postures choice (available for mannequin models…)" and the same list added to JS Online — **DOCUMENTED**
(`history.txt` lines 188, 200, 363).

**Persist/round-trip (my own live closure of round-1's biggest Unknown).** Calling
`piece.setModelTransformations(list, x, y, elevation, width, depth, height)` — the same 7-argument overload the
dialog's *applier* uses — ran a re-derivation block for doors/windows before storing the matrices
(**OBSERVED**, `evidence/persist.json`): it recomputes, from the *new* model bounds and the piece's own frame,
`wallLeft`, `wallWidth`, `wallThickness`, `wallHeight`, `wallTop`, `wallDistance` (all as fractions) and each
`sash`'s `xAxis`, `yAxis`, `width` in cm (dividing by the new width/depth), then stores them.
With a 45° hinge rotation that left the piece's outer bounds unchanged, so all the fractions came back
identical (`wallThickness 0.51724, wallDistance 0.06897, wallWidth 1, wallLeft 0, wallHeight 1, wallTop 0`,
sash unchanged) and only the transformation list appeared
(`modelTransformationsAfterPersist: ["sweethome3d_hinge_1"]`). This is the mechanism behind v6.0's
"opened doors are not deformed when `doorOrWindowWidthDepthDeformable=false`" (round-1 Unknown #3): the
deformable flag governs whether the re-derivation may resize the piece. **OBSERVED mechanism, INFERRED flag
role.**

**Consequence for the data model.** A sash's 2-D angles and the 3-D pose are **decoupled**: the 2-D plan keeps
drawing the catalog's static swing quadrant (`startAngle`/`endAngle`) even after the user changes the 3-D pose,
because nothing in the setting/copy path writes `endAngle`. **INFERRED from the OBSERVED code paths** — and it
is the cleanest "what to improve" hook for CasaPlazAI.

### 2.4 Door/window dialog fields (question part 4)

Live run (`evidence/dialog2.json`, `evidence/dialog-live.json`; fresh Chromium with SwiftShader WebGL):
placed `eTeks#door` on a 7.5 cm wall, selected it, `planController.modifySelectedItem()`.

* Visible dialog = `.home-furniture-dialog`; cards: **Name · Location · Color and texture · Orientation ·
  Size · Shininess** (**OBSERVED**).
* Labels: Name, Name (visible checkbox), Description, Price, X (cm), Y (cm), Elevation (cm), Angle (°),
  "Vertical rotation around Z axis", "Horizontal rotation around", "X axis (°)", "Y axis (°)",
  Width (cm), Depth (cm), Height (cm) (**OBSERVED**).
* Spinner values read from the live dialog: `x=120, y=2.5, elevation=0, angle=0, width=91.5, depth=14.5,
  height=208.5`, pitch/roll empty (**OBSERVED**).
* Checkboxes: `name-visible-checkbox`, **`mirrored-model-checkbox`** with label "Mirrored shape" and tooltip
  `<html>Select this check box to change door opening direction<br>or display the shape of a piece of furniture
  as in a mirror.` (this is the tooltip string, quoted as data), `base-plan-item-checkbox`,
  `keep-proportions-checkbox`, `visible-checkbox`; radios `paint-checkbox` ×4 (default / color / texture /
  model materials), `horizontal-rotation-radio` ×2 (PITCH/ROLL), `shininess-radio` ×3 (**OBSERVED**).
* The **`model-transformations-button`** exists in the DOM inside Size; per the template it is hidden by
  default (`t.parentElement.style.display="none"`) and shown only when
  `controller.isPropertyEditable("MODEL_TRANSFORMATIONS")` **and** the loaded model passes
  `containsDeformableNode`, in which case its label is set (from `modelTransformationsButton.text`, or
  `mannequinTransformationsButton.text` when the model contains `mannequin_abdomen`) and a click opens
  `displayModelTransformationsView`. In my run the label **was** localized to **"Modify openings…"** (so the
  model-updated branch ran) but the button's parent remained `display:none` at query time and the click did not
  open the chooser (`transformDialog` null). I could not resolve the ordering of the show/hide within the
  available time — reported honestly in Unknowns. **OBSERVED** (DOM state) + **INFERRED** (why).
  Round 1 reported this button as never found in the dialog DOM; the sharper picture is: the element is always
  in the template, and is only meant to be visible for models with deformable nodes.
* The chooser dialog, when it does open, is generated in code (**OBSERVED** in the bundle, not live): title
  from `ModelTransformationsPanel.modelTransformations.title`, a 350×350 `#model-preview-canvas`,
  `reset-transformations-button`, a `presetTransformations` `<select>` populated from
  `getModelPresetTransformationsNames()` (hidden when empty, as for every door/window), and view-from-front/
  side/top buttons; its **applier** writes the previewed matrices plus the recomputed
  x/y/elevation/width/depth/height back through the 7-arg `setModelTransformations`.
* **Absent from the dialog** (live DOM + code search): wall thickness, wall distance, cut-out shape, sash
  fields, opening angle, "15°/90°" swing controls. These stay library-authoring properties
  (Furniture Library Editor; **DOCUMENTED** `history.txt` line 203, "Added … the ability to edit light and
  door/window properties").
* Furniture **Library Editor** door/window pane and the desktop-only dialogs were not exercised (no installer
  download — rules).

### 2.5 What this closes / corrects in the round-1 report

* Closes **Unknown "Sash interaction vs. animation"**: no scalar angle, but hinges can be posed (a) by the
  "Modify openings…" chooser, (b) by mouse-dragging a hinge/rail node inside that chooser's preview, and
  (c) in the 3-D view itself when *Selection and editing in 3D view* is on; presets exist only for mannequins.
  **OBSERVED** bundle + live.
* Closes **Unknown "no live 3-D observation"**: this sandbox's headless Chromium **does** get WebGL with
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (renderer
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)`), the 3-D canvas
  `#home-3D-view` renders at 1136×408, and `HomeComponent3D` is reachable live as
  `homeController.getHomeController3D().getView()`. Only the *3-D geometry inspection* is now real; I did not
  view screenshots.
* Extends round 1's **§2.7** with the exact arc formula and its numeric verification, the full hinge/rail node
  naming census of the shipped models, the preset-posture census (mannequins only), the XML `transformation`
  element shape, and the re-derivation of wall/sash fractions on pose change.
* Corrects the round-1 claim that `model-transformations-button` "never appears in the dialog DOM": it is in the
  template always; its visibility is conditional on a deformable node.
* Still **Unknown**: whether the desktop app (as opposed to JS Online) exposes an extra "opening angle" spinner
  — the JS bundle has none, and I did not install the desktop app.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort (H/M/L). Each cites a finding above and, where relevant, the CasaPlazAI schema
(`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

1. **One `hingeSide` + `swingDeg` per opening, and draw the 2-D arc from it (H / L).** From 2.7: Sweet Home 3D
   needs a five-number sash tuple *plus* named model nodes and matrices to express one swing. CasaPlazAI builds
   its own meshes, so it can render the classic `Arc2D.PIE`-equivalent directly from two fields. Add to
   `Opening` (schema v2 via `registerTransform(1, …)`):
   `hingeSide: "start" | "end"`, `swingDeg: number` (signed; 0 = closed, ±90 = quarter arc, ±180 = full leaf),
   `swingInto: "inside" | "outside"`. Draw: pivot at `tCenter ∓ width/2` along the wall segment, radius =
   `width`, wedge from the wall normal to `swingDeg`; mirror by negating the side, never by rewriting the arc
   (from 2.5/2.2). This is the single highest-value, lowest-effort win and doubles as the 3-D pose input.
2. **Drive the 3-D leaf from the same two fields — no matrices (H / M).** From 2.3: Sweet Home 3D persists an
   ad-hoc list of `{name, matrix}` per hinge node, and the *catalog* holds the hinge location; CasaPlazAI has
   one procedural door mesh, so `THREE.Object3D.rotation.y = ±swingDeg` on a pivot group is enough. For the
   walkthrough this also gives free "open the doors" animation with no extra schema.
3. **Keep sash/wall-fit numbers out of the inspector; expose them as per-type defaults (M / L).** From 2.4:
   the competitor's placed-piece dialog is generic furniture fields only (x, y, elevation, angle, w/d/h,
   mirror, colour, orientation, shininess) and the four wall fractions + cut shape + sash live in the library.
   For CasaPlazAI's redesign: inspector shows position/size/mirror/hinge-side/swing; cut shape and
   `wallThicknessRatio` become fields of an "Opening types" list, not of the placed opening.
4. **Mirroring as a render-time flag, arc flipped arithmetically (M / L).** From 2.2/2.5: live-verified that
   `setModelMirrored(true)` never touches the sash tuple — the 2-D painter flips centre x and uses
   `180° − startAngle`, the extent sign flips, and the 3-D model negates the width scale. CasaPlazAI already
   has `rotationDeg`/footprint; a `mirrored` boolean plus one sign flip in the arc and mesh is enough, and
   "flip hinge side" is then a 2-line operation on the same flag.
5. **Two-row shared openings today, sash-ready tomorrow (M / M).** Schema §Opening says a shared door is two
   rows with mirrored `segmentIndex` and complementary `tCenter`. For a swing arc to be consistent on both
   sides you must derive `hingeSide`/`swingDeg` per row (each face sees the opposite handedness). Decide now
   whether the second row duplicates or references the first; duplicating keeps the schema additive but risks
   divergence — a `mirrorOf: id` field would be cleaner and still passes `dangling-ref`-style validation.
6. **Sash/cut-out data in the *type*, not the instance (M / M).** From 2.1: `getSashes()` is per placed piece in
   Sweet Home 3D but seeded from the catalog, which is why a catalog edit can't reach placed items. Put the
   swing/cut defaults on the CasaPlazAI opening *type* and copy to the instance on placement (with an explicit
   "reset to type defaults" action), so old plans never shift under the user.
7. **A numeric swing handle in the plan (M / M).** From 2.4: the competitor hides opening angle entirely (you
   change the 3-D pose in a separate dialog and the 2-D arc does **not** follow). A drag handle at the leaf tip
   that writes `swingDeg` — with an arc indicator and a 15° grid (round-1 §2.3: 24-step rotation magnetism with
   modifier bypass) — both looks better and keeps 2-D/3-D in sync by construction.
8. **Explicit "no sash" state (L / L).** From 2.1: 25/66 shipped openings have no sash and 2 default-catalog
   models (door frame, closed Craftsman door) have no deformable node at all. Model `sash: null` so
   fixed openings (a door frame, a fixed pane) draw no arc and cannot be opened in 3-D.
9. **Preset postures for the one case they fit (L / M).** From 2.3 the preset-posture mechanism is real but in
   the competitor it applies only to mannequins, never to openings. If CasaPlazAI ever ships an animated
   people/fixture asset, reuse the idea (`{name, transforms[]}` on the type, select in the inspector) — not
   worth it for doors and windows, where idea 1 is strictly better.
10. **Arc rendering budget check (L / L).** From 2.2 each arc is 4 path vertices for 90°; CasaPlazAI's canvas
    can draw `ctx.arc` + 2 radii, so a plan with hundreds of openings stays cheap. Worth a micro-benchmark
    only if the plan is autosaved on every `requestAnimationFrame`.

---

## 4. Unknowns

* **Dialog button visibility ordering not settled.** For a placed `eTeks#door` the
  `model-transformations-button` label was localized to "Modify openings…" (so the model-updated branch ran)
  yet its parent's `display` was still `none` and the click opened nothing. Likely an async show/hide race or
  a dialog re-init after the model finished loading; I did not isolate it, so I cannot say from the live UI
  which opening types actually show the button. **Observed DOM state only.**
* **3-D hole geometry of *posed* leaves not measured.** I measured bounding boxes around the hinge sweep
  (2.23 m x-extent at 90°), not the actual mesh, wall cut or texture coordinates. The wall cut for an opened
  door — round 1 noted v4.4's "texture coordinates at doors and windows intersection for walls with an angle
  different of 0° or 90°" — was never inspected.
* **Mirrored pose signs.** For `ModelManager.MIRROR_ON_HINGE_PREFIX` (`sweethome3d_window_mirror_on_hinge_`)
  and the `WINDOW_PANE_ON_HINGE`/`…ON_RAIL` prefixes I established the naming and that they are reparented,
  but I did not isolate how mirroring changes a posed leaf's matrix sign. **INFERRED** that it is handled by
  node naming plus the width-scale negation.
* **`isPropertyEditable("MODEL_TRANSFORMATIONS")` value in the JS Online build** was not read; the button's
  conditional depends on it.
* **Desktop-only authoring UIs** (Furniture Library Editor door/window pane, desktop "Modify model
  transformations" dialog, mannequin posture picker) were not exercised — documented in `history.txt` only,
  and no installer was downloaded (rules).
* **`widthDepthDeformable=false` enforcement** (round-1 Unknown #3) is now better understood conceptually —
  the 7-arg setter re-derives sizes and the flag gates that — but I did not observe the guard rejecting a
  resize.
* **Only the JS Online build (7.5.2) was analysed.** The desktop Java core may expose extra opening-angle UI;
  the shipped JS bundle contains no such property, and I did not install the desktop app.

---

### Evidence index (this folder)

| file | what it is |
|---|---|
| `driver.js` | reusable live driver: fresh headless Chromium + SwiftShader WebGL, loads EmptyHome, evaluates a scenario file |
| `ev-probe.js`, `ev-sash.js`, `ev-arc.js`, `ev-model.js`, `ev-nodes2.js`, `ev-dialog2.js`, `ev-live3d.js`, `ev-persist.js`, `ev-3d.js` | scenario scripts actually run |
| `evidence/sash-live.json` | live `Sash` surface, fraction values, width/mirror invariance, catalog sash census, angle-pair histogram |
| `evidence/arc-geometry.json` | measured `getDoorOrWindowSashShape` / `getDoorOrWindowRectangle` bounds vs analytic prediction, incl. mirrored + double sash |
| `evidence/model-nodes.json` | full node dump of `door.obj` loaded through `ModelManager` |
| `evidence/model-nodes2.json` | hinge/rail/pane node census for 10 representative openings |
| `evidence/live3d.json` | live 3-D scene reachability, `home-3D-view` canvas, hinge rotation applied in-scene |
| `evidence/persist.json` | hinge angle sweep 0/30/45/90/135°, bounds and `isDeformed`, 7-arg `setModelTransformations` round-trip |
| `evidence/dialog2.json` | live door modification dialog: cards, labels, spinners, mirror tooltip, transformations button label/visibility |
| `evidence/3d-live.json`, `evidence/probe-live.json` | 3-D component/view method inventories and canvas sizes |
| `chrome.log` | headless-browser launch log (WebGL/SwiftShader confirmation; screenshots were not used because images cannot be inspected) |
| `sources.json` | machine-readable sources and claim tags |
| round-1 folder (read-only) | `~/dsh-workspaces/rea-sweethome3d-2026-10/04-04-doors-windows/` — catalog census, magnetism, wall cut, XML examples, `history.txt` |
