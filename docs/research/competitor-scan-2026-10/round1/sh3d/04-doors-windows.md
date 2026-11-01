# Sweet Home 3D — Doors & Windows: catalog, wall magnetism, wall cut-outs, mirroring, dimensions, sash/opening angle

Job: `04-04-doors-windows` · Target: Sweet Home 3D (https://www.sweethome3d.com/de/), open-source Java desktop app + JS Online version.
All artefacts are in this folder; evidence paths are cited relative to it. Everything below is
**OBSERVED** (live app or shipped bundle/sample, with file path), **DOCUMENTED** (vendor page URL)
or **INFERRED** (my reading between the lines). No source code was copied; behaviour/data-model
descriptions only.

---

## 1. Summary

- **Catalog:** the shipped Online catalog (`bundles/FurnitureCatalog.json`) has 1 740 furniture records; the
  "Doors and windows" category holds 69 records, of which **66 are true openings** (`doorOrWindow=true`);
  3 (flat-roof skylight bubble, window shutter, screen door) are decorations that do **not** cut walls.
- **Openings are ordinary furniture with an extra property bag.** A door/window is a `CatalogDoorOrWindow`
  / `HomeDoorOrWindow` with `wallThickness`, `wallDistance`, `wallWidth/wallLeft/wallHeight/wallTop`,
  `cutOutShape`, `wallCutOutOnBothSides`, `widthDepthDeformable`, a list of `Sash(xAxis,yAxis,width,startAngle,endAngle)`
  and per-instance `modelTransformations`. All of these live in the catalog/library, not in the normal
  modification dialog.
- **Magnetism is a screen-space wall snap:** a 4-pixel margin (`PIXEL_MARGIN=4`), wall hit test under the
  cursor, fallback to the wall that overlaps the dragged piece's inflated footprint; on hit the piece is
  rotated parallel to the wall, moved so its `wallDistance`/`wallThickness` fractions put it in the wall,
  and flagged `boundToWall` (only for straight walls).
- **Wall cutting is computed automatically and always through the wall** (since v5.5): the 2-D plan draws the
  piece rectangle clipped to the cut-out shape plus sash arcs; the 3-D wall is rebuilt as vertical/horizontal
  parts around and above/below the openings, stacking overlapping openings by ground elevation. The 3-D wall
  re-derives itself when a door moves; the door does **not** re-derive its depth when the wall thickness changes.
- **Mirroring is a per-instance boolean applied at render time** (`modelMirrored`): 2-D flips the cut rectangle
  origin and the sash arc (`startAngle → 180° − startAngle`, arc mirrored), 3-D negates the width scale.
  Catalog sash data itself is never rewritten.
- **Sash/opening angle is static catalog geometry, not a live slider.** In the catalog the sash is an
  x/y/width/startAngle/endAngle tuple (7 distinct angle pairs, e.g. `0°→−90°` for 28 openings, `180°→270°`
  for 25); in 3-D the visible swing/slide comes from named deformable nodes in the model
  (`sweethome3d_hinge_…`, `…_opening_on_hinge_`, `…_on_rail_`, `…_on_hinge_`) driven by
  `modelTransformations` / "preset postures", added in v6.0/6.1/7.0/7.2. No `openAngle`/`openingAngle`
  property exists in the shipped JS.

---

## 2. Findings

### 2.1 Catalog: how many, what kind, what shape data

- `bundles/FurnitureCatalog.json` (fetched from `https://www.sweethome3d.com/libjs/resources/FurnitureCatalog.json`,
  the file the Online app declares in `applicationParams.furnitureCatalogURLs`, see `evidence/inline-app-scripts.js`).
  **OBSERVED**: 1 740 records; categories include "Living room" 132, "Kitchen" 125, "Exterior" 85,
  **"Doors and windows" 69**, "Staircases" 20, …
- Of the 69 "Doors and windows" records, **66 have `doorOrWindow=true`**; the non-openings are
  `Flat roof skylight bubble`, `Window shutter`, `Screen door`. **OBSERVED** (`bundles/FurnitureCatalog.json`).
- Extra property coverage inside those 66 (counts from the raw catalog file, cross-checked live in
  `evidence/live-tests.json` → `flagSummary`):

  | property | present |
  |---|---|
  | `doorOrWindowCutOutShape` | 60 (49 of them the default unit rectangle) |
  | `doorOrWindowSash*` (5 fields) | 41 |
  | `doorOrWindowWallThickness` | 45 |
  | `doorOrWindowWallDistance` | 20 |
  | `doorOrWindowWallCutOutOnBothSides="false"` | 1 (`eTeks#serviceHatch`) |
  | `doorOrWindowWidthDepthDeformable="false"` | 2 (`eTeks#openDoor`, `OlaKristianHoff#revdoor`) |
  | `multiPartModel` (models with movable parts) | most doors/windows in the file |

- **The catalog exposes the data model through explicit, hand-authored records**; e.g. `eTeks#door`
  (`bundles/FurnitureCatalog.json`): width 91.5, depth 14.5, height 208.5, `doorOrWindowWallThickness=7.5`,
  `doorOrWindowWallDistance=1`, `doorOrWindowSashXAxis=5`, `…SashYAxis=8.5`, `…SashWidth=81.5`,
  `…SashStartAngle=0`, `…SashEndAngle=−90`, `doorOrWindowCutOutShape="M0,0 v1 h1 v-1 z"`.
  **OBSERVED**.
- **DOCUMENTED** (furthest-going authority for the schema): the app's own bundle constants
  `DefaultFurnitureCatalog.PropertyKey` list in `bundles/sweethome3d.min.js` matches these names 1:1
  (`DOOR_OR_WINDOW_CUT_OUT_SHAPE:"doorOrWindowCutOutShape"`, `DOOR_OR_WINDOW_WALL_THICKNESS`,
  `DOOR_OR_WINDOW_WALL_DISTANCE`, `DOOR_OR_WINDOW_WALL_CUT_OUT_ON_BOTH_SIDES`,
  `DOOR_OR_WINDOW_WIDTH_DEPTH_DEFORMABLE`, `DOOR_OR_WINDOW_SASH_X_AXIS/Y_AXIS/WIDTH/START_ANGLE/END_ANGLE`).
  **OBSERVED** in the shipped JS.

> Note on units: the catalog JSON stores these in centimetres/degrees, and the loader normalises them —
> `wallThickness/n` (n = the model's width scale), `wallDistance/n`, sash x/y/width divided by the width/depth
> scale, sash angles converted `×π/180`. **OBSERVED** in `DefaultFurnitureCatalog.prototype.readFurniture` and
> `getDoorOrWindowSashes` (`bundles/sweethome3d.min.js`). Live objects therefore expose *fractions*:
> `eTeks#door` → `getWallThickness()=0.5172`, `getWallDistance()=0.0690`, sash `x=0.0546, y=0.5862, w=0.8907`
> (`evidence/live-tests.json`).

### 2.2 Two-level data model (definition vs. placed instance)

Live inspection of the Online app (`evidence/app-empty-model.json`, `evidence/live-tests.json`,
`evidence/live-tests-2.json`):

- **Definition level — `CatalogDoorOrWindow`** (methods):
  `getCutOutShape, getSashes, getWallDistance, getWallThickness, isDoorOrWindow, isHorizontallyRotatable,
  isWallCutOutOnBothSides, isWidthDepthDeformable`. **OBSERVED**.
- **Instance level — `HomeDoorOrWindow`** (extends `HomePieceOfFurniture`) adds:
  `get/setCutOutShape, get/setSashes, get/setWallDistance, get/setWallThickness, get/setWallWidth,
  get/setWallLeft, get/setWallHeight, get/setWallTop, is/setWallCutOutOnBothSides,
  is/setWidthDepthDeformable, is/setBoundToWall, duplicate`. **OBSERVED** (`evidence/app-empty-model.json`).
- `Sash` is a five-number value object only: `getXAxis, getYAxis, getWidth, getStartAngle, getEndAngle`.
  There is no setter and no runtime "open me" call. **OBSERVED** (`evidence/app-empty-model.json`).
- **Persistence (sample .sh3d)**: the vendor example `examples/userGuideExample.sh3d`
  (from `https://www.sweethome3d.com/examples/userGuideExample.sh3d`, unzipped to `examples-unzipped/Home.xml`)
  stores openings as `<doorOrWindow …wallThickness='0.7352941' cutOutShape='M0,0 v1 h1 v-1 z'…>` with
  `<sash xAxis='0.015151516' yAxis='0.7352941' width='0.4810606' startAngle='0.0' endAngle='-1.5707964'/>`
  children. 68 furniture instances total, 7 `doorOrWindow` records, each carrying its resolved wall
  fractions and cut-out path. **OBSERVED**.
- The exporter also writes `wallDistance, wallWidth, wallLeft, wallHeight, wallTop, wallCutOutOnBothSides`
  and per-instance `boundToWall`; the sample file simply doesn't need them (defaults). **OBSERVED** in the
  `HomeXMLExporter.PieceOfFurnitureExporter.writeAttributes` code (`bundles/sweethome3d.min.js`).

### 2.3 Magnetism: how a door/window finds its wall

Evidence: the de-minified region I saved to `evidence/magnetism-code.js`
(`PlanController.prototype.adjustMagnetizedPieceOfFurniture` / `adjustPieceOfFurnitureOnWallAt` from
`bundles/sweethome3d.min.js`), plus live measurements in `evidence/live-tests.json` / `live-tests-2.json`
and `evidence/live-drop-magnetism.json`.

Algorithm as read from the bundle (**OBSERVED code; behaviour confirmed live**):

1. A drag is only magnetised when `preferences.isMagnetismEnabled()` (there are toolbar actions
   `ENABLE_MAGNETISM=104` / `DISABLE_MAGNETISM=105`; the guide also mentions holding Alt/⌘ to bypass during
   wall drawing — **DOCUMENTED** `https://www.sweethome3d.com/users-guide/` "Drawing walls").
2. `PIXEL_MARGIN = 4` is divided by the view scale → a **screen-constant 4 px** tolerance
   (at the live scale 0.5 px/cm this was 8 cm; `evidence/live-tests.json` `scale`).
3. Primary hit test: walls whose polygon `containsPoint(x, y, …, margin)` contains the cursor; the nearest
   candidate wins. If none, the **fallback** builds the piece's rotated rectangle inflated by the margin and
   picks the wall with the largest intersection area. **OBSERVED** (the `getRotatedRectangle(…+2k…)` +
   `Area.intersect` branch of `evidence/magnetism-code.js`).
4. On hit the wall angle `F = atan2(dy,dx)` is applied to the piece (`F` or `F+π`, whichever side the cursor
   is on), and the piece is translated so that the wall's near edge plus
   `depth × (wallDistance + wallThickness)` / `wallDistance + wallThickness/2` (deformable vs. not) lands the
   piece inside the wall. `wallDistance` is therefore *how deep the piece sits in the wall*, expressed as a
   fraction of the piece's own depth. **OBSERVED code; live**: drop at `y=1.5` → `y=2.4999` for a 7.5 cm wall
   with `wallDistance=0.069`, `depth=14.5007`.
5. `setBoundToWall(true)` only for straight walls (`arcExtent == null || == 0`); a piece can be
   `setBoundToWall(false)` (dialog-independent API) and then rotate freely: live test T4 set angle 45° and
   x/y stayed put. Bound state is persisted (`boundToWall` attribute). **OBSERVED**.

Live behaviours worth stealing (all **OBSERVED**, `evidence/live-tests.json`):

- T1: door `eTeks#door` (ratio 0.5172) dropped on a 7.5 cm wall → `depth = 7.5 / 0.5172 = 14.5007` cm; on a
  20 cm wall → `38.6674` (formula predicts 38.6667). **The piece auto-fills the wall.**
- T1 after the wall was later thickened to 20 cm, the already-placed door kept `depth = 14.5007`: **no live
  constraint between an existing opening and its wall.**
- T6: a door handed to the magnetiser at 90° on a horizontal wall came back at 0° — magnetism wins over the
  drag angle.
- T7: dropped at (200,150) in open space → untouched, `boundToWall=false`, depth unchanged (14.5).
- T8: dropped 40 cm away from a vertical wall, the piece still snapped: the fallback uses the **piece
  footprint**, not the cursor distance.
- `adjustFurnitureSizeAndElevation` rounds width/depth/height/elevation to a 0.1 cm magnetised step, but
  **deliberately skips re-magnetising a door/window's depth** and never derives its depth from the wall.
  **OBSERVED** (`HomeFurnitureController.adjustFurnitureSizeAndElevation`, `bundles/sweethome3d.min.js`).
- Rotation uses a 24-step grid → 15° (`PlanController…STEP_COUNT = 24`), Alt toggles it; a rotation indicator
  appears on a selected piece. **OBSERVED** live + **DOCUMENTED** user guide ("Hold Alt key to toggle the
  15° magnetism applied during rotation").

### 2.4 Automatic wall cutting

**2-D plan** (`PlanComponent`, `bundles/sweethome3d.min.js`; screenshots `shots/03-doors-placed.png`,
`shots/04-plan-with-doors.png`, `shots/06-door-tests.png`):

- `getDoorOrWindowRectangle(piece, inPlan)` builds the piece rectangle from `width` and
  `depth × wallThickness`, offset by `depth × wallDistance`, then — if `cutOutShape` is set and not the
  default — clips width/left to the **bounds of the cut-out path** (mirrored when `isModelMirrored()`).
  **OBSERVED**; changelog v5.2 (DOCUMENTED, `https://www.sweethome3d.com/history/`):
  "Changed the width of the rectangle of doors and windows in the plan to take into account the width of their
  `doorOrWindowCutOutShape` property when it's smaller."
- `paintDoorOrWindowWallThicknessArea` fills the piece area clipped to the walls **only when
  `isWallCutOutOnBothSides()`** (tops of walls where the opening passes through). **OBSERVED**.
- `paintDoorOrWindowSashes` draws each sash as an `Arc2D.PIE` of radius `sashWidth × width`, centred at
  `(sashXAxis×width, sashYAxis×depth)` in piece space, rotated by the piece angle. **OBSERVED**.

**3-D wall** (`Wall3D`, `bundles/sweethome3d.min.js`):

- `getVisibleDoorsAndWindows`, `createGeometriesSurroundingDoorOrWindow`, `createWallPartShape`,
  `createVerticalPartGeometry`, `createHorizontalPartGeometry`, `createTopPartGeometry`.
- The wall is re-tessellated as the wall polygon minus the union of opening rectangles: vertical parts
  **below** the first opening's ground elevation and **above** the highest opening, horizontal lintel parts
  between stacked openings; overlapping doors are sorted by ground elevation and stepped through pairwise so
  two windows at different sills produce the correct jambs/lintels. **OBSERVED** (the door-sorting loop in
  `Wall3D` geometry code).
- If a door has a non-default `cutOutShape` / `wallWidth≠1` / `wallLeft≠0` / `wallHeight≠1` / `wallTop≠0`, extra
  geometry is generated around it from the model's front face
  (`createGeometriesSurroundingDoorOrWindow` guarded by exactly those five conditions) — this is how arched,
  round and frame-only openings get their surround. **OBSERVED**.
- **Always through-cut**: `doorOrWindowWallCutOutOnBothSides` defaults to true in the loader
  (`getOptionalBoolean(…, true)`), 65/66 catalog openings have it true, and v5.5 made it unconditional
  ("Made doors and windows always cut out the both sides of the walls to which they are added.").
  **OBSERVED** + **DOCUMENTED** (`history/`).
- The presence of selected walls/doors triggers a repaint
  (`wallsDoorsOrWindowsModification` → `repaint`); the changelog notes "Optimized 3D walls update after the
  move of a door or a window". **OBSERVED**/**DOCUMENTED**.
- Marked **INFERRED** for the visual result in 3-D: headless Chrome in this sandbox refused a WebGL context
  (the app needs WebGL; my `webgl.js` probe never got that far and the 3-D pane was never rendered), so I read
  the geometry code and the example model instead of observing holes live.

### 2.5 Mirroring (`modelMirrored`)

Evidence: `evidence/live-tests.json` T2/T3, `evidence/live-tests-2.json` C, `evidence/furniture-dialog-live.json`,
`bundles/sweethome3d.min.js`.

- One boolean per placed piece, editable as **"Mirrored shape"** in the furniture modification dialog
  (`mirrored-model-checkbox`; **OBSERVED** `evidence/furniture-dialog-live.json`,
  `evidence/furniture-dialog-template.json`). The user guide calls it "whether its 3D model shape should be
  mirrored" — **DOCUMENTED** `https://www.sweethome3d.com/users-guide/`.
- **Catalog data is never rewritten**: live test T2 toggled `setModelMirrored(true)` and the sash tuple
  stayed byte-identical (`x=0.0546, startAngle=0, endAngle=−1.5708`). **OBSERVED**.
- Mirroring is applied **at draw time in 2-D**:
  `h = isModelMirrored() ? -1 : 1`, centre `x = h·xAxis·width`, arc start `= 180° − startAngle` when mirrored,
  extent `= h·(endAngle−startAngle)`, and the cut rectangle origin becomes
  `(1 − wallLeft − wallWidth)·width` (`getDoorOrWindowSashShape`, `getDoorOrWindowRectangle`). **OBSERVED**.
- **At draw time in 3-D** the model is scaled by `(±width, height, depth)`
  (`getPieceOfFurnitureNormalizedModelTransformation`: `if (isModelMirrored()) l*=-1; mat4.scale(...)`).
  **OBSERVED**.
- Persisted as `modelMirrored='true'` on the `<pieceOfFurniture>` / `<doorOrWindow>` element; the example home
  contains a mirrored `Glass door cabinet` and a mirrored `French window`.
  **OBSERVED** (`examples-unzipped/Home.xml`).
- Changelog: v6.1 added `sweethome3d_window_mirror_on_hinge_` / `_on_rail_` shape prefixes; v7.3 "Prevented
  fixed parts in mirrored pieces from moving after an horizontal deformation" — i.e. mirroring of *movable
  model parts* is handled by node prefixes, not by a second boolean. **DOCUMENTED** (`history/`).

### 2.6 Dimension handling (width/depth/height/elevation, wall fractions)

- Placed openings carry plain `width/depth/height/elevation` in cm, plus the normalised wall fractions from
  the catalog. The dialog exposes **only** width/depth/height, not the wall fractions
  (**OBSERVED** `evidence/furniture-dialog-live.json`: cards Name | Location | Color and texture | Orientation
  | Size | Shininess; fields x, y, elevation, angle, pitch, roll, width, depth, height, mirrored, base-plan,
  colour/texture/material, shininess, visible). "Wall thickness", "wall distance", "sash" never appear in the
  dialog DOM nor as main-UI strings — they are library-authoring properties (**OBSERVED** search of
  `bundles/sweethome3d.min.js` and `sh3djs-online.html`). The Furniture Library Editor can edit them
  (v4.2 added "customize the cut out shape of doors and windows"; v7.5 mentions fixing the default value of
  `doorOrWindowWallThickness#` and editing "light and door/window properties") — **DOCUMENTED** (`history/`).
- Depth is a **derived** quantity for openings: on drop `depth = wall.thickness / doorOrWindowWallThickness`
  (live: 7.5/0.5172 = 14.5007, 20/0.5172 = 38.6674). `depthInPlan` equals the real depth; for non-DOW pieces
  the plan depth is capped by the wall.
- Changing the piece width does **not** rescale its depth; the cut-out path and sash fractions are relative,
  so they scale with width (live T3: `width 91.5→120`, cut shape, `wallWidth=1`, `wallLeft=0`, sash width
  0.8907 all unchanged). **OBSERVED**.
- Windows keep their catalog **elevation** on drop (live B: `Small window` elevation stayed 87 cm on a 7.5 cm
  wall; `Deep window` 80 cm, `French window` 11 cm, `Double-hung` 93 cm from the catalog JSON). **OBSERVED**.
- `dropOnTopElevation = -1` on most openings prevents the "drop on top of another piece" behaviour for them.
  **OBSERVED** (`bundles/FurnitureCatalog.json`).
- `widthDepthDeformable=false` (2 catalog items: `Open door`, `Revolving door`) + changelog v5.5 "Avoided
  opened doors to be deformed when their property `doorOrWindowWidthDepthDeformable` … is set to `false`"
  → an *open* door can be prevented from being squeezed when it is dropped into a thinner wall. **DOCUMENTED**
  + **OBSERVED** flag in live data. (My live test could not reproduce the blocking itself because I called the
  magnetiser directly — see Unknowns.)
- The wall-side fractions `wallWidth/wallLeft/wallHeight/wallTop` describe partial cut-outs (a service hatch
  occupying only part of the piece, a frame without a panel); defaults are `1/0/1/0`. **OBSERVED** in the
  parser defaults and in the 2-D/3-D consumers; only 1 catalog item turns the both-sides flag off.
- Magnetic length rounding for resizing is 0.1 cm (`getMagnetizedLength(value, 0.1)`) and does **not** apply
  to the door depth. **OBSERVED**.

### 2.7 Sash / opening angle in 2-D and in 3-D

**2-D (live, `evidence/live-tests.json`, `shots/04-plan-with-doors.png`):**

- 41/66 openings ship sash data. 10 of them are double-sash (2 arcs).
- Angle pairs found in the live catalog (degrees, 41 openings): `(0, −90)` ×28, `(180, 270)` ×25 (this count
  includes the second sash of doubles), `(−90, 0)` ×2, `(−90, −180)` ×4, `(90, −90)` ×1, `(90, 0)` ×1,
  `(180, 90)` ×1. **OBSERVED**.
- The plan draws each sash as a pie arc (open swing leaf). This is a *static* representation: the arc shows
  the swing quadrant the catalog author chose. **OBSERVED** code + the changelog v1.7 entry "Drawn the sashes
  of doors and windows with an arc of a circle". **DOCUMENTED**.
- `Sash.yAxis` is the hinge's position across the wall depth (e.g. `deep window y=0.5`, `door y=0.586`);
  `Sash.width` is the leaf length relative to the opening width (e.g. `0.8907`). **OBSERVED**.

**3-D:**

- There is **no scalar opening angle** in the model or the UI: searching the shipped JS for
  `openAngle`, `openingAngle`, `doorOpen`, `isOpen`, `setOpen` yields **0 hits** (only the static `Sash`
  angles, which are only consumed by the 2-D painter and the XML exporter). **OBSERVED**.
- Instead, the 3-D model itself contains **named deformable nodes**, and a per-instance list of
  `modelTransformations` (matrix per node name) poses them. Prefixes defined in the shipped `ModelManager`:
  `sweethome3d_hinge_`, `sweethome3d_opening_on_hinge_`, `sweethome3d_window_pane_on_hinge_`,
  `sweethome3d_mirror_on_hinge_`, `sweethome3d_unique_rail`, `sweethome3d_rail_`,
  `sweethome3d_opening_on_rail_`, `sweethome3d_window_pane_on_rail_`, `sweethome3d_mirror_on_rail_`,
  `sweethome3d_ball_`, `sweethome3d_arm_on_ball_`, `sweethome3d_mannequin_*`,
  and the suffix `_transformation` for the transform groups. **OBSERVED** (`bundles/sweethome3d.min.js`).
- The pose is applied by walking the model graph and matching `nodeName + "_transformation"` groups
  (`updateModelTransformations`, `updateTransformation`, `setNotUpdatedTranformationsToIdentity`), so moving
  a door leaf is a *model-graph* edit, not a wall/opening property. **OBSERVED**.
- UI entry points: the furniture dialog's **"Modify model transformations"** button is only shown when the
  loaded model contains such a node (`model-transformations-button` → `containsDeformableNode`);
  "preset postures" were added to the desktop and JS Online in v7.2. **OBSERVED** code + **DOCUMENTED**
  (`history/`: v6.0 "Updated rotating and sliding parts in the 3D model of doors, windows and furniture to
  support new rotation and translation capabilities"; v7.0 "Handled the user interface of 3D model
  transformations in Sweet Home 3D JS Online"; v7.2 "Added preset postures choice…").
- Consequence: a door leaf in 3-D opens because the catalog model declares a hinge node and the saved home
  carries a transformation for it — **not** because the opening has an `openingAngle` the user drags.
  **INFERRED from the above OBSERVED facts.**
- 3-D openings are pick-transparent for the transparent part
  (`setTransparentShapeNotPickable` is called when `isDoorOrWindow()`), so you can click through a glass pane.
  **OBSERVED**.

### 2.8 UI surface (what the user actually touches)

- Catalog pane + search + category tree; drag-and-drop into plan or furniture list; "Add furniture" button.
  **DOCUMENTED** (`https://www.sweethome3d.com/users-guide/` "Adding doors, windows and furniture").
- Selected piece shows 4 corner indicators: rotate (15° magnetism, Alt toggles), elevation, height, size.
  **DOCUMENTED** same page; **OBSERVED** `PlanController` states
  (`getPieceOfFurnitureRotationState`, `…HeightState`, `…ElevationState`, `…ResizeState`).
- Modification dialog (`evidence/furniture-dialog-live.json`, screenshot `shots/07-door-dialog.png`):
  Name/Description/Price, Location (X, Y, elevation, **Mirrored shape**, base-plan item), Colour/texture/
  model-materials, Orientation (angle + horizontal axis pitch/roll + an orientation preview image), Size
  (width/depth/height + keep proportions + Modify model transformations), Shininess, Visible.
- Wall dialog (for contrast) **has** thickness and height fields, plus baseboard/pattern/top colour —
  thickness is a wall property, while a door's "wall thickness" is a hidden catalog ratio.
  **OBSERVED** (`evidence/dialog-templates.json`: `wall-dialog-template` has `thickness-input`,
  `rectangular-wall-height-input`, …).

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort (H/M/L). Each idea cites the finding above.

1. **Live re-fit of openings when the wall changes (H value / M effort)** — from 2.3 T1: Sweet Home 3D does
   *not* do this (an already-placed door keeps its old depth after the wall is thickened), yet CasaPlazAI has
   shared walls and users edit walls. Store `wallThicknessRatio` per opening type and recompute depth/position
   whenever the host wall's thickness changes. This is a visible quality win over the competitor.
2. **Swing/opening arc in the 2-D plan (H / L)** — from 2.7: 41 shipped openings define a swing with
   `xAxis/yAxis/width/startAngle/endAngle`, drawn as a pie arc, mirror-aware. Adding one arc per door
   (hinge side + swing quadrant + leaf length) makes CasaPlazAI plans look professional for very little work,
   and doubles as a look-ahead for the 3-D walkthrough.
3. **Cut-out shape as data, not a boolean (H / M)** — from 2.1/2.4: 13 distinct cut-out paths ship in the
   catalog (arches, half-rounds, a keyhole for the revolving door, an inset frame shape). Store a normalised
   SVG-ish path per opening type, use its bounds to clip the plan rectangle (v5.2 behaviour) and use it as the
   subtraction mask in 3-D. CasaPlazAI's rectangular hole-only model is the main visual gap.
4. **Wall-snap with a footprint fallback + explicit bound/unbound flag (H / M)** — from 2.3: 4 px screen
   tolerance, cursor hit first, then the wall that overlaps the dragged piece; result stored as
   `boundToWall`, released only by an explicit "detach from wall" action. CasaPlazAI already snaps to a 0.5 m
   grid; wall snap on drop plus an `attachedWallId` field is the natural next step.
5. **Catalog-driven opening templates (H / M)** — from 2.1/2.6: one record per door type carrying
   `wallThickness ratio`, `wallDistance`, default elevation (sill), sash tuple, cut shape and mirror flags;
   dropping it auto-fits the wall and keeps the sill. Gives every furniture-palette door/window correct
   defaults with no per-instance UI.
6. **Always cut through both wall faces, and stack co-located openings (M / M)** — from 2.4: v5.5 made
   through-cutting unconditional and the 3-D builder sorts overlapping openings by ground elevation to emit
   jambs/lintels correctly. CasaPlazAI should subtract the union of openings per wall and handle a
   window-above-window case rather than a single hole.
7. **Mirror as a render-time flag (M / L)** — from 2.5: one boolean per instance, never rewriting the
   template; 2-D flips the arc (`180° − startAngle`) and the cut origin, 3-D negates the width scale.
   Cheap and it removes a whole class of duplicated catalog entries. For CasaPlazAI's procedural meshes this is
   a `scale.x = -1` plus an arc flip.
8. **One explicit `openingAngle` + hinge side for 3-D (M / M)** — from 2.7: Sweet Home 3D needs named model
   nodes and matrix "postures" to open a leaf, which is powerful but heavy; CasaPlazAI builds its own meshes,
   so a single `hingeSide` (left/right, in/out) + `openingAngle` per opening gives interactive swing in the
   3-D walkthrough with a fraction of the machinery.
9. **Keep wall/cut/sash numbers out of the primary dialog, put them behind "advanced" (M / L)** — from 2.6/2.8:
   the competitor's main dialog exposes only width/depth/height/mirror because the rest is template data.
   For CasaPlazAI: keep the placed-opening inspector minimal (position, size, mirror, flip swing, attach/
   detach) and expose cut shape + wall fit as per-type defaults in an "Opening types" editor.
10. **Partial cut-outs (service hatch / frame) via 4 fractions (L / M)** — from 2.1/2.6:
    `wallWidth/wallLeft/wallHeight/wallTop` + `wallCutOutOnBothSides=false` exist for the odd case. Low
    priority for CasaPlazAI's small palette, but it is the clean data model if you ever add a hatch or AC vent.
11. **15° rotation magnetism with modifier bypass (L / L)** — from 2.3: 24-step angle grid, `PIXEL_MARGIN`
   screen tolerance, Alt/⌘ bypass, global
   magnetism toggle. Small, familiar, cheap polish for CasaPlazAI's rotation handles.
12. **Explicit `boundToWall` semantics in the model (L / L)** — from 2.2: a boolean that says "this opening
    belongs to a wall", persisted with the plan. Makes the door/window editor and 3-D generation
    deterministic, and makes "detach" undoable.

---

## 4. Unknowns / what I could not verify

- **No live 3-D observation.** The Online app requires WebGL; my headless Chrome (Playwright `chromium-1243`,
  Chrome for Testing 153) never produced a usable context, and the 3-D pane never rendered. All 3-D wall-cut
  and sash-impact statements come from reading the shipped `sweethome3d.min.js` plus the vendor changelog, not
  from a rendered frame. (Screenshot evidence covers the 2-D plan only: `shots/03-doors-placed.png`,
  `04-plan-with-doors.png`, `06-door-tests.png`, `07-door-dialog.png`.)
- **Exact hit-test return values.** `adjustMagnetizedPieceOfFurniture` returns `void`; my `hit` booleans in
  `evidence/live-tests.json` are therefore always `false` and had to be judged from the resulting x/y/angle and
  `isBoundToWall()`. The wall-selection internals are read from code, not confirmed by instrumentation.
- **`widthDepthDeformable=false` enforcement.** The two catalog items that set it (`Open door`, `Revolving
  door`) were placed via the API directly, so I could not confirm the user-visible "open leaf is not squashed
  into a thin wall" behaviour that v5.5 describes; the guard condition is visible in the drag-and-drop path,
  not exercised.
- **`cutOutShape = null` semantics.** 6 catalog items (SeberRider windows/doors) return `null` from
  `getCutOutShape()` in the live app. The 2-D painter treats `null` like the full rectangle
  (`cutOutShape != null && != DEFAULT` → clip), and the 3-D "surround geometry" condition treats `null` as
  *different from the default* — whether those items produce a correct rectangular hole with surround
  geometry could not be verified.
- **Desktop-only authoring UI.** The Furniture Library Editor's door/window property fields (v4.2/v7.5) and
  the desktop "Modify model transformations"/preset-posture dialogs were not exercised; they are documented
  in `history/` only. The desktop app itself was not installed or run (rules: no downloads/installers).
- **Sash interaction vs. animation.** I established that no scalar open-angle property exists, but I could not
  confirm whether a user can drag a leaf in the 3-D view or only pick a preset posture / edit a matrix.
  INFERRED: posture/model-transformation only.
- **Exact 3-D hole triangulation quality** (texture coordinates at non-90° wall/door intersections, v4.4 fix)
  — read only, never observed.
- **Licensing/behavioural caveat for CasaPlazAI:** Sweet Home 3D is GPL-2.0+ and its catalog assets are
  GPL/CC-BY. Nothing was copied from the source tree; the shipped minified bundle was read for behaviour and
  the vendor `FurnitureCatalog.json` for counts/values. CasaPlazAI must not reuse those models/paths, only the
  behavioural patterns described here.

---

### Evidence index (all inside this job folder)

| file | what it is |
|---|---|
| `bundles/FurnitureCatalog.json` | shipped Online catalog used for all counts in §2.1 |
| `bundles/sweethome3d.min.js` | shipped Online app bundle (v7.5.2), source of all behaviour quotes |
| `bundles/classes.json` | GWT class/prototype inventory extracted from the bundle |
| `evidence/inline-app-scripts.js` | bootstrap of the Online page (catalog URLs, app subclass) |
| `evidence/app-empty-model.json` | live `CatalogDoorOrWindow` / `Sash` / `HomeDoorOrWindow` method lists |
| `evidence/live-tests.json` | live drop / resize / mirror / rotate / far-drop measurements |
| `evidence/live-tests-2.json` | live wall-depth formula, sill preservation, mirror points, cut-shape census |
| `evidence/live-drop-magnetism.json` | first live drop test (magnetism result fields) |
| `evidence/magnetism-code.js` | saved `adjustPieceOfFurnitureOnWallAt` region from the bundle |
| `evidence/furniture-dialog-live.json`, `evidence/furniture-dialog-template.json` | real dialog fields/labels |
| `evidence/dialog-templates.json` | all app dialog templates incl. wall dialog |
| `evidence/3dview-probe.json`, `evidence/controller-protos.json` | live controller/3-D prototype names |
| `examples/userGuideExample.sh3d`, `examples-unzipped/Home.xml` | vendor example plan, saved door/sash XML |
| `history.txt`, `features.txt`, `plug-in-developers-guide.txt`, `faq.txt`, `import-models.txt` | extracted vendor page text |
| `shots/01-initial.png` … `shots/07-door-dialog.png` | 2-D plan / dialog screenshots |
| `sources.json` | machine-readable source & claim list |
