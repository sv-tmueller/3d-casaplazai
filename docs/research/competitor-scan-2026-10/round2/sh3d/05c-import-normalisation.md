# Sweet Home 3D — Import wizard in detail & model normalisation (orientation, size, centering, units)

**Job:** `rea2-sh3d-p2/09-05c-furniture-catalog-import-imp` (round 2, deeper dive)
**App under study:** Sweet Home 3D — GPL Java desktop app; browser edition "Sweet Home 3D JS Online" v7.5.2 at https://www.sweethome3d.com/SweetHome3DJSOnline.jsp built from the same Java core (GWT/JS transpile). German homepage: https://www.sweethome3d.com/de/
**Round-1 report reused (read-only):** `~/dsh-workspaces/rea-sweethome3d-2026-10/05-05-furniture-catalog-import/report.md` + its evidence folder. This round does not redo the catalog/SH3F/list/grouping/magnetism work; it goes deep on the **import wizard pipeline** and **model normalisation** (orientation, size, centering, units) because CasaPlazAI needs a glTF normalisation script.
**Licence:** Sweet Home 3D is GPL. **No source code copied.** All behaviour described in my own words; evidence kept in this folder.
**Legend:** `OBSERVED` = seen in a file in this folder or a live capture saved here · `DOCUMENTED` = stated by vendor docs/javadoc at the cited URL · `INFERRED` = my reasoning over the evidence.

---

## 1. Summary

- The import wizard is a **4-state machine** — `MODEL(0) → ROTATION(1) → ATTRIBUTES(2) → ICON(3)` — implemented by `ImportedFurnitureWizardController` as four `…StepState` objects. Entering `MODEL` sets *first step* and enables *Next* only if a model is loaded (and keeps it in sync via a `"MODEL"` listener); `ROTATION` unconditionally enables *Next*; `ATTRIBUTES` listens to `WIDTH/DEPTH/HEIGHT/NAME/CATEGORY` and enables *Next* only while `isPieceOfFurnitureNameValid()` (name non-null, length > 0); `ICON` is the last step and its *Finish* calls `finish()` [OBSERVED, `evidence/controller_step_bodies.txt`, `js/sweethome3d.min.js` @1089989/1090076/1090175/1090272 (class defs), @1099552 `setFirstStep(true)`, @1100597 & @1105732 `setNextStepEnabled(true)`, @1101914 `checkPieceOfFurnitureNameInCategory()`, @1105709 `setLastStep(true)`; DOCUMENTED, `.../ImportedFurnitureWizardController.Step.html`].
- Normalisation is **deferred to render time**: the wizard never rewrites mesh geometry. It only records a **3×3 row-major rotation matrix** plus a `width/depth/height` box, and `ModelManager.getNormalizedTransform(node, modelRotation, width, modelCenteredAtOrigin)` produces a transform that "fills a box of the given width centered on the origin": translate the model's **exact AABB centre** to the origin → apply the rotation → optionally re-centre the *rotated* box → scale each axis so the box is `width` wide (with a `max(0.001, extent)` degenerate-model guard) [OBSERVED, `evidence/modelmanager_normalisation.txt`, `js/sweethome3d.min.js` @1845339; DOCUMENTED, `jd_j3d_ModelManager.html`].
- **Size at import time is non-uniform and box-driven**: the final render scale is `diag(±width, height, depth)`, so the model is stretched to the user's declared W/D/H. `modelMirrored` is folded into the sign of the X scale rather than a mirrored copy, and the world translation adds `n/2` (half the *possibly tilted* height) to turn the requested `elevation` (bottom of the piece) into the box centre the normalised model expects [OBSERVED, `js/sweethome3d.min.js` @1846320].
- **Units are only explicit for DAE/Collada**: the DAE loader reads `<unit meter="…">` (default 1) and multiplies by `meterScale × 100` into Sweet Home 3D's **centimetre** units, reads `<up_axis>` and applies `Rx(−90°)` for `Z_UP` / `Rz(+90°)` for `X_UP`, and pre-centres the whole scene on its own bounding box. OBJ and 3DS get no unit conversion and no axis fix-up — the wizard exists to let a human supply what the file cannot declare [OBSERVED, `evidence/daeloader_axis_units.txt`].
- The wizard's output is a `CatalogPieceOfFurniture` (or `CatalogDoorOrWindow`) holding `name, icon, model (Content), width, depth, height, elevation, movable, [cutOutShape], color, modelRotation, modelFlags, modelSize, creator, iconYaw, iconPitch, iconScale, proportional`; the home file adds `modelCenteredAtOrigin` (writer default `true`, reader back-compat `modelRotation == null` for pre-5.5 files) and `modelMirrored`. For CasaPlazAI the clean analogue is **an explicit asset record (normalisation inputs + digest) separate from the per-instance `FurnitureItem`** [OBSERVED, `js/sweethome3d.min.js` @1087986 (`finish`), @1088380 (ctor branch), @29916 (reader back-compat), @374047 (writer); DOCUMENTED, `jd_model_CatalogPieceOfFurniture.html`, `jd_model_HomePieceOfFurniture.html`].

> **Web-build caveat:** in the shipped `SweetHome3DJSOnline` bundle, `JSViewFactory.prototype.createImportedFurnitureWizardStepsView` is a stub that returns `null` (`…=function(c,a,e,b,d){return null}` @2464168), and the user guide says importing models is "*not available in Online version*". The whole controller/model layer is still present and readable, but the wizard **cannot be driven in the browser edition** [OBSERVED, `js/sweethome3d.min.js` @2464168; DOCUMENTED, `docs/userguide.txt`].

---

## 2. Findings

### 2.1 Wizard step machine (exact states, order, guards)

`ImportedFurnitureWizardController.Step` is a **4-value enum in declaration order** `MODEL=0, ROTATION=1, ATTRIBUTES=2, ICON=3`, confirmed both in the javadoc enum summary and in the transpiled numeric mapping emitted in JS (`J[j.MODEL=0]="MODEL" …` at @1097301) [OBSERVED, `js/sweethome3d.min.js` @1097301, `evidence/controller_step_bodies.txt`; DOCUMENTED, `.../ImportedFurnitureWizardController.Step.html`].

The controller's own **Property enum** has 21 constants — `STEP, NAME, CREATOR, MODEL, WIDTH, DEPTH, HEIGHT, ELEVATION, MOVABLE, DOOR_OR_WINDOW, STAIRCASE_CUT_OUT_SHAPE, CATEGORY, COLOR, MODEL_ROTATION, MODEL_SIZE, BACK_FACE_SHOWN, EDGE_COLOR_MATERIAL_HIDDEN, ICON_YAW, ICON_PITCH, ICON_SCALE, PROPORTIONAL` — and every one of them is a real `getX/setX` pair that fires a property change only when the value actually differs [DOCUMENTED, `.../ImportedFurnitureWizardController.Property.html`; OBSERVED, `evidence/controller_pretty.txt`].

| Step | enum | enter() actions | Next enabled when | Back → | Next → |
| --- | --- | --- | --- | --- | --- |
| Choose model | `MODEL=0` | `setFirstStep(true)`; `setNextStepEnabled(getModel()!=null)`; add `"MODEL"` listener | `getModel() != null` | — | ROTATION |
| Orientation | `ROTATION=1` | `setNextStepEnabled(true)` | always | MODEL | ATTRIBUTES |
| Attributes | `ATTRIBUTES=2` | add `WIDTH`, `DEPTH`, `HEIGHT`, `NAME`, `CATEGORY` listeners; `checkPieceOfFurnitureNameInCategory()` | `name != null && name.length > 0` | ROTATION | ICON |
| Icon | `ICON=3` | `setLastStep(true)`; `setNextStepEnabled(true)` | always (Finish) | ATTRIBUTES | `finish()` commits |

[OBSERVED, `evidence/controller_step_bodies.txt` at byte ranges 1099451–1100023 (MODEL), 1099830–1100975 (ROTATION), 1100860–1102365 (ATTRIBUTES), 1105560–1106180 (ICON; `setLastStep(true)` at @1105709); the name check is the literal `return this.name!=null&&this.name.length>0` (@42701 in the formatted controller).]
Notes that matter if you are cloning the flow:

- `MODEL`'s listener re-evaluates `setNextStepEnabled(getModel()!=null)` on every `"MODEL"` change, and `exit()` detaches it — so loading then clearing a model correctly re-disables *Next*.
- The `ROTATION` step has **no validation at all** — orientation can never block progress. That is consistent with `modelRotation` being allowed to stay identity.
- The `ATTRIBUTES` step covers both "name" and all three size fields plus category, but only the *name* gates *Next*. Sizes are pre-clamped to `≥ 0.001` in the setters, so they are always technically valid.
- `finish()` picks the constructor by `isDoorOrWindow()`: the door/window branch passes extra wall-fitting arguments (a fixed thickness/drop/sash set) into `CatalogDoorOrWindow`, the plain branch passes `getStaircaseCutOutShape()` into `CatalogPieceOfFurniture`; both pass `modelFlags` built from `backFaceShown` and `edgeColorMaterialHidden`. If the wizard was opened with a `home`, `finish()` also inserts a `HomePieceOfFurniture` into the home and selects it; if opened for an existing `piece`, the old piece is deleted from the catalogue and the new one added to the chosen `category` [OBSERVED, `js/sweethome3d.min.js` @1088320–1089600, `evidence/controller_pretty.txt` lines ~33934 and ~34295 ff.].

**Four public constructors** map onto the four real entry points: new catalogue piece; new catalogue piece with a pre-set `modelName` (drag-and-drop / file-dialog path); modify an existing `CatalogPieceOfFurniture`; new home piece (plus a `modelName` variant) which additionally takes `FurnitureController` and `UndoableEditSupport` [DOCUMENTED, `jd_viewcontroller_ImportedFurnitureWizardController.html`].

The wizard is a subclass of `WizardController`, so step navigation, *Back/Next/Finish* enable flags and the `WizardControllerStepState` base class (with `enter/exit/goBackToPreviousStep/goToNextStep/getStep/setFirstStep/setLastStep/setNextStepEnabled`) are inherited; `ImportedFurnitureWizardController.ImportedFurnitureWizardStepState` is the protected "step state superclass" each of the four classes extends [DOCUMENTED, `jd_viewcontroller_WizardController_WizardControllerStepState.html`, `jd_viewcontroller_ImportedFurnitureWizardController_ImportedFurnitureWizardStepState.html`].

### 2.2 Model file acquisition, format dispatch and archive handling

Formats accepted: **OBJ, DAE/Collada, 3DS, a ZIP containing one of those, and KMZ** — stated in the user guide ("Sweet Home 3D supports 3D model files at OBJ, DAE, 3DS format, ZIP files containing a file of this type, and KMZ files") and on the 3D-models-import page [DOCUMENTED, `docs/userguide.txt`, `docs/import-models.txt`]. The guide also records the drag-and-drop entry point, which is why one constructor takes a pre-set `modelName`.

Dispatch is a **retry chain** in `ModelManager.load(content, synchronous, observer)` [OBSERVED, `evidence/modelmanager_normalisation.txt` @1849854, `js/sweethome3d.min.js`]:

1. First use builds `modelLoaders = [new OBJLoader()]` and appends `new DAELoader()` and `new Max3DSLoader()` **only if those globals exist** — the web build degrades gracefully if a loader is absent.
2. It tries loader 0; on a successful parse it computes `getBounds(node)` and, **if the bounds are empty, advances to the next loader**; if every loader is exhausted it reports `"Unsupported 3D format"`. So at manager level, format detection is *by parse success + non-empty geometry*, not by file extension.
3. Each loader's `load()` first handles the `jar:` prefix used by plugin/SH3F content by splitting on `"!/"`, then goes through `ZIPTools.getZIP(url, …)`. A bare OBJ/DAE file is treated as a one-entry archive. If the URL names an entry, that entry is decoded; otherwise the loader picks **the first entry whose name matches `/\.<ext>$/i`** (e.g. any `.obj` inside the zip), falling back to the first entry. That is the `archive.zip!/name.obj` convention used throughout the shipped catalogue [OBSERVED, `evidence/modelmanager_normalisation.txt` (ModelLoader.load, byte ~1770221), `catalog_FurnitureCatalog.json`.]
4. Parsing is **chunked with a ~10 ms budget per slice** (`if (Date.now()-v>10) { setTimeout(f,0); return }`) with a `progression` callback reporting `READING_MODEL / PARSING_MODEL / BUILDING_MODEL / BINDING_MODEL` fractions, and a single-entry-at-a-time serialiser (`waitingParsedEntries` / `parserBusy`) so concurrent load requests do not interleave [OBSERVED, same region].

`ModelManager` also post-processes every loaded scene: it rewrites window-pane transparency for shapes whose name begins `sweethome3d_window_pane` (setting a 0.5 transparency if none was authored), walks the hierarchy for deformable/mannequin nodes, and replaces multiple shared shapes so parts can be transformed independently (`updateWindowPanesTransparency`, `updateDeformableModelHierarchy`, `replaceMultipleSharedShapes`) [OBSERVED, `evidence/modelmanager_normalisation.txt`].

CasaPlazAI takeaway: mimic the "**attempt a parse, keep it if the resulting AABB is non-empty**" detection and keep parsing off the UI thread; do not trust the file extension alone.

### 2.3 The orientation step: `modelRotation`, 3×3 matrix, and what the arrows really do

**Storage format.** `modelRotation` is `float[3][3]`, row-major. The home-file writer serialises it as nine space-separated floats in the order `[0][0] [0][1] [0][2] [1][0] … [2][2]`, default string `"1 0 0 0 1 0 0 0 1"`; the reader splits on whitespace, requires at least nine values (else `SAXException("Missing values for attribute modelRotation")`), and rebuilds the three rows. The identical encoding appears as `modelRotation#N` in the shipped JSON catalogue [OBSERVED, `js/sweethome3d.min.js` @24346 (reader) and @374047 (writer), `catalog_FurnitureCatalog.json`; DOCUMENTED, `jd_model_PieceOfFurniture.html` — "the rotation 3 by 3 matrix of this piece of furniture that ensures its model is correctly oriented"]. `CatalogPieceOfFurniture.getModelRotation()` deep-clones so callers cannot mutate the shared default (@157932).

**Default.** `PieceOfFurniture.IDENTITY_ROTATION` is the literal `[[1,0,0],[0,1,0],[0,0,1]]` (byte @224687 among the shared constants at @224587–224716), used whenever the parsed/serialised value is null [OBSERVED, `js/sweethome3d.min.js` @224687; DOCUMENTED, `jd_model_PieceOfFurniture.html`].

**What the wizard's arrows do.** The user guide instructs: "Orientate the model with arrow buttons in such a way the front view displays the front face of the 3D model, and click on Continue." Internally the controller only ever fires a `"MODEL_ROTATION"` change carrying a new matrix, and the preview component exposes **view** rotation (`setViewYaw/setViewPitch/setViewScale`) separately from **model** rotation (`setModelRotation` / `setModelRotationAndSize`) — so camera and geometry are two distinct knobs [DOCUMENTED, `docs/userguide.txt`, `jd_swing_ModelPreviewComponent.html`; OBSERVED, `evidence/controller_pretty.txt` `setModelRotation`, `evidence/modelpreview_pretty.txt`].

**What real catalogues actually store.** I parsed all 42 non-default matrices in the 805-piece catalogue [OBSERVED, `evidence/catalog_modelrotation.txt`]:

| count | determinant | matrix | meaning |
| --- | --- | --- | --- |
| 11 | +1.000000 | `0 0 -1 0 1 0 1 0 0` | yaw −90° |
| 7 | +1.000000 | `0 0 1 0 1 0 -1 0 0` | yaw +90° |
| 5 | +1.000000 | `1 0 0 0 0 1 0 -1 0` | roll/pitch −90° about X |
| 4 | +1.000000 | `-1 0 0 0 1 0 0 0 -1` | yaw 180° |
| 4 | +1.000000 | `1 0 0 0 0 -1 0 1 0` | roll/pitch +90° about X |
| 1 each | +1.000000 | `0 -1 0 0 0 1 -1 0 0`, `0 0 -1 1 0 0 0 -1 0`, `-1 0 0 0 0 1 0 1 0`, `0 0 1 -1 0 0 0 -1 0` | other 90° axis permutations |
| 1 each | +1.000000 | `1 0 0 0 0.9396926 0.34202018 0 -0.34202018 0.9396926` (20.0°), `1 0 0 0 0.10452846 0.9945219 0 -0.9945219 0.10452846` (6.0°), `1 0 0 0 0.70710677 -0.70710677 0 0.70710677 0.70710677` (45.0°), `0.99986255 0.016579868 0 …` (a ~0.95° mixed tilt) | **fractional** rotations |
| 1 each | ≈+1.0 | `0.99985 0 -0.0174524 …` (−1.0° yaw), `0.99939 0 -0.0349 …` (−2.0° yaw) | fractional yaw |

16 distinct matrices, **every one with determinant +1** (pure rotation; mirroring is the separate `modelMirrored` boolean, not a negative determinant), dominated by exact axis permutations but with a real fractional-angle minority. So the orientation step is **not a 6-way "front/back/left/right" picker** — it applies arbitrary rotation, and the 90°-multiple matrices are just the common authored case. This is the strongest single piece of evidence for how much orientation freedom the UI exposes.

**Where the matrix is consumed.** `ModelManager.getRotationTransformation(matrix)` copies the 3×3 into the upper-left of a `mat4` (column-major layout) and is used by `getNormalizedTransform`, the door/window wall cut-out code, and the plan-icon generator. `HomePieceOfFurniture3D` separately carries `modelTransformations` (deformable-node transforms), which the wizard does not set [OBSERVED, `js/sweethome3d.min.js` @1846111 (`getRotationTransformation`) and the `MODEL_FLAGS`-adjacent writer at @2336397].

### 2.4 The attributes step: name/size/elevation/flags and the keep-proportions maths

The constructor seeds every field, and the **defaults** are notable [OBSERVED, `evidence/controller_pretty.txt` lines 34–79]:

`name=null, creator=null, model=null, width=0, proportionalWidth=0, depth=0, proportionalDepth=0, height=0, proportionalHeight=0, elevation=0, movable=false, doorOrWindow=false, staircaseCutOutShape=null, color=null, category=null, modelSize=0, modelRotation=null, edgeColorMaterialHidden=false, backFaceShown=false, iconYaw=0, iconPitch=0, iconScale=0, proportional=false`.

So by default a piece is **not movable, not a door/window, has elevation 0 and proportions unlocked**, and all three sizes start at 0 until the user (or the view, after load) fills them.

**Clamping.** Each of the three setters wraps its argument with `Math.max(value, 0.001)` before storing — the same `minSize` floor used in `ModelManager` — so a zero or negative typed dimension can never reach the data model [OBSERVED, `evidence/controller_pretty.txt` `setWidth$float$boolean`, `setDepth$float$boolean`, `setHeight$float$boolean`]. Each setter also keeps a *proportional reference* value: `proportionalWidth/Depth/Height` is updated from the raw (unclamped) argument whenever the value was not clamped or the "keep proportions" flag was off.

**Keep-proportions maths (drift-free ratios).** The three size setters come in `setX(float)` and `setX(float, boolean)` overloads (the JS-overload dispatcher accepts `(number, boolean)` or `(number)`, otherwise throws `"invalid overload"`). The proportional logic lives in the four listener objects the `ATTRIBUTES` step attaches (registered against five properties: `WIDTH`, `DEPTH`, `HEIGHT`, `NAME`, `CATEGORY`) [OBSERVED, `js/sweethome3d.min.js` @1102890–1105990, `evidence/controller_step_bodies.txt`]:

- On a `WIDTH` change while `isProportional()`: it **removes** the `DEPTH` and `HEIGHT` listeners, computes `ratio = newWidth / oldWidth`, then sets `depth = proportionalDepth × ratio` and `height = proportionalHeight × ratio` (both with the keep-proportions flag `true`), and finally **re-adds** the listeners. Removing them prevents recursive re-scaling.
- The `DEPTH` listener does the mirror image (scales width and height from `proportionalWidth/proportionalHeight`), and the `HEIGHT` listener scales width and depth.
- Because it always scales the *other two* from the proportional reference triple rather than from their current values, repeated edits do not accumulate float drift — the ratio between the three reference values is preserved exactly.
- `NAME` and `CATEGORY` changes share one listener that only calls `checkPieceOfFurnitureNameInCategory()` (the *Next*-enable check).

That is the direct analogue of CasaPlazAI's `footprint [a, b]`: SH3D stores an unrotated W/D/H box plus a `proportional` boolean and a reference triple, which is exactly the "lock aspect ratio" affordance. CasaPlazAI's schema has neither a height nor a lock flag today; a glTF importer would need both.

### 2.5 The icon step: baking a viewpoint (iconYaw / iconPitch / iconScale)

The last step bakes a small raster icon of the model from a chosen viewpoint, for the catalogue thumbnail, furniture list and plan. The persisted fields are `iconYaw`, `iconPitch`, `iconScale`, all `float`, all defaulting to `0` [OBSERVED, `evidence/controller_pretty.txt`; DOCUMENTED, `jd_model_CatalogPieceOfFurniture.html` — "the yaw angle used to create the piece icon", "the pitch angle used to create the piece icon", "the scale used to create the piece icon"]. The controller fires `ICON_YAW / ICON_PITCH / ICON_SCALE` property changes so the view can render live [OBSERVED, `js/sweethome3d.min.js` @1096050 (`getIconYaw`)].

The preview's camera state is separate (`viewYaw`, `viewPitch`, `viewScale`, combined as `scale * Ry(viewYaw) * Rx(viewPitch)`), which reinforces that icon Y/P/S describe *how the icon was baked*, not a live camera [OBSERVED, `js/sweethome3d.min.js` @1883959; DOCUMENTED, `jd_swing_ModelPreviewComponent.html`].

The default framing in `ModelPreviewComponent.setModel` is directly reusable for a CasaPlazAI thumbnailer [OBSERVED, `evidence/modelpreview_pretty.txt` lines 39–102]:

- If no explicit W/D/H is passed, it calls `ModelManager.getSize(node)`; otherwise uses the explicit box.
- Fit factor `o = 1.8 / max(max(size.x, size.z), size.y)` — a **uniform factor that makes the largest dimension 1.8 world units** (i.e. a unit-scale box with headroom).
- It parks the model with `setX(0); setY(0); setElevation(-height/2)` so the box centre sits at the world origin, then renders.
- Lighting: four directional lights plus a 0.2 ambient — a cheap three-quarter studio rig. The plan-icon renderer `PieceOfFurnitureModelIcon.getSceneRoot` instead uses a **parallel projection**, front clip −1.1 / back clip 1.1, an `Rx(−π/2)` view-platform transform and a similar light rig; its `createIcon` scales the node by `(2/width, 2/depth, 2/height)` (a 2-unit normalised box) and returns the offscreen canvas image [OBSERVED, `js/sweethome3d.min.js` @2249591 (`getSceneRoot`) and @2251043 (`createIcon`)].
- The wizard asks for the icon lazily via `getIcon(maxWaitingDelay)` only when the step is actually displayed; the panel javadoc explains an offscreen 3D buffer "costs too much to create at each yaw change" [DOCUMENTED, `jd_swing_ImportedFurnitureWizardStepsPanel.html`].

**The shipped catalogue does not store these three fields at all** — 0 occurrences of `iconYaw`, `iconPitch`, `iconScale` across all 805 pieces, while 2 pieces carry a pre-rendered `planIcon` image [OBSERVED, `evidence/catalog_modelrotation.txt`]. The built-in catalogue thus ships *baked pixels*, and keeps the viewpoint parameters only when a user customises an icon. That is a deliberate "bake once, ship the image" split.

### 2.6 Size & centering normalisation of the loaded 3D model (the bounding-box pipeline)

This is the core of what CasaPlazAI's glTF script must replicate. `ModelManager` is a singleton and its kernel is [OBSERVED, `evidence/modelmanager_normalisation.txt`, `js/sweethome3d.min.js` @1845339 (`getNormalizedTransform`), @1845195 (the generating routine); DOCUMENTED, `jd_j3d_ModelManager.html` — "Returns a transform that will transform the model node to **let it fill a box of the given width centered on the origin**"]:

```
getNormalizedTransform(node, modelRotation, width, modelCenteredAtOrigin):
  box = getBounds(node)                      # exact AABB (vertices, not bounding sphere)
  T   = translate(-centre(box))              # centre the model's own box on the origin
  if modelRotation != null:
      M = getRotationTransformation(modelRotation) × T
      box = getBounds(node, M)               # RECOMPUTE the box AFTER rotating
      if modelCenteredAtOrigin:
          M = translate(-centre(box)) × M    # second, post-rotation re-centre
  else:
      M = T
  S = diag( width / max(minSize, extent.x),
            width / max(minSize, extent.y),
            width / max(minSize, extent.z) ) # minSize = 0.001
  return S × M
```

Consequences worth spelling out:

1. **Centering is unconditional and AABB-based**, and the *first* centre is applied in the model's own un-rotated frame. Any authored pivot is ignored. `getBounds` is explicitly documented as "the **exact box** that contains all the shapes, contrary to `node.getBounds()` that returns a bounding sphere for a scene" [DOCUMENTED, `jd_j3d_ModelManager.html`].
2. **`modelCenteredAtOrigin` is a second, optional re-centring after rotation.** Its javadoc: "Returns true if model center should be always centered at the origin **when model rotation isn't null**" [DOCUMENTED, `jd_model_HomePieceOfFurniture.html`]. When `false`, the model is centred only in its un-rotated frame and then rotated about the origin, so an off-centre part can swing out.
3. **Back-compat inference in the reader.** For homes written before file version 5500, or when a newer file explicitly writes `"false"`, `modelCenteredAtOrigin` is set to `(modelRotation == null)`: old pieces with no rotation are treated as origin-centred, old pieces with a rotation are not. The writer emits the attribute with default `true`. `CatalogPieceOfFurniture` in the web catalogue does not carry the flag at all (0 hits across 805 pieces); it is a `HomePieceOfFurniture` / file-format concern [OBSERVED, `js/sweethome3d.min.js` @29916 (reader back-compat), @374047 (writer); `evidence/catalog_modelrotation.txt`; DOCUMENTED, `jd_model_HomePieceOfFurniture.html`].
4. **Scaling is axis-aligned and applied *after* rotation.** The caller passes a single scalar `width`, divided by each **post-rotation** extent; the real final size then comes from an outer `diag(±width, height, depth)`. Pipeline order is therefore: **centre (own box) → rotate → re-centre (optional) → fit to a unit-wide box in the rotated frame → stretch to declared W/H/D**.
5. **`minSize` guard.** `getMinimumSize()` returns `0.001`; every extent and every size setter is wrapped in `Math.max(minSize, …)`. A flat plane or an empty axis becomes an extreme but finite scale rather than a division by zero.
6. **Two bounds algorithms.** `computeBounds(node, box, transform, exactGeometry, deformed)` walks `Group3D`/`TransformGroup3D` children accumulating the matrix; for a `Shape3D` it either transforms the shape's cached box or — when the rotation is *not* an axis permutation, or the model is deformed — falls back to transforming **every vertex index individually** (`computeTransformedGeometryBounds`). `isOrthogonalRotation` accepts matrix entries within 1e-6 of 0/±1, so a −1.0° yaw takes the exact-vertex path. That is exactly why the fractional matrices in §2.3 matter: they change which bounds algorithm runs [OBSERVED, `js/sweethome3d.min.js` @1843089 (`getMinimumSize`), @1843885 (`isOrthogonalRotation`), @1844670 (`computeTransformedGeometryBounds`)].
7. **`getSize` = `max(minSize, upper−lower)` per axis; `getCenter` = box midpoint per axis** — the two primitives a normaliser needs, exposed publicly [OBSERVED, same region; DOCUMENTED, `jd_j3d_ModelManager.html`].

Render-time placement is a separate function, `getPieceOfFurnitureNormalizedModelTransformation(piece, node)` [OBSERVED, `evidence/modelmanager_normalisation.txt`, `js/sweethome3d.min.js` @1846320]:

```
S = diag(piece.width × (modelMirrored ? -1 : 1), piece.height, piece.depth)
if the piece is pitched or rolled and node != null:
    J = Rx(-pitch) × Rz(-roll) × S
    box = getBounds(node, J)
    H = translate(-centre(box)) × J
    n = max(minSize, box extent in Y)          # effective height of the TILTED piece
else:
    H = S ; n = piece.height
A = Ry(-piece.angle) × H
return translate(piece.x, piece.elevation + n/2 + levelElevation, piece.y) × A
```

Two things stand out: **mirroring is a sign on the X scale**, not a mesh flip; and the translation adds **`n/2`**, half the possibly-tilted height, because the normalised model's local origin is the *centre* of its box vertically while `elevation` means the *bottom* of the piece. The doc for `setModel` confirms the intent that the model is shown "in a box 1 unit wide" [DOCUMENTED, `jd_swing_ModelPreviewComponent.html`].

### 2.7 Units and default size

**Catalogue and plan geometry are centimetres.** Values are plain numbers like `87/92/87` for an armchair and `100/55/80` for a chest, and door/window pieces are named `window85x123`; the UI converts to the user's chosen display unit only at the edges [OBSERVED, `catalog_FurnitureCatalog.json`; DOCUMENTED round-1 report §2].

**Only DAE declares a unit, and only DAE converts.** In the DAE loader [OBSERVED, `evidence/daeloader_axis_units.txt`, `js/sweethome3d.min.js` @1798873 (unit parse), @1817387 (self-centring + scale), @1817813 (`Z_UP`/`X_UP` rotation), @1817716 (meterScale×100)]:

- `<asset><unit meter="…">` sets `meterScale` (initial 1). COLLADA's `meter` is the real-world size of one unit, so a centimetre file would say `meter="0.01"`.
- `endDocument()` then builds `scale(meterScale*100, …, …)` — i.e. **file units → metres → catalogue centimetres**. A metre file (`meter="1"`) becomes ×100; a centimetre file (`meter="0.01"`) becomes ×1.
- `<up_axis>` is stored as text; `Z_UP` applies `Rx(−π/2)` and `X_UP` applies `Rz(+π/2)`; Collada's default `Y_UP` needs no rotation. The composition order is axis rotation × metre scale × centred scene.
- Before any of that, the loader computes the union bounds of all parsed shapes and translates by the negative box centre, so a DAE model arrives **already centred**. That is why the wizard's orientation step still matters for DAE but its centring matters less.

**3DS has a master scale, but it is not a unit.** `parseEditorData` reads `MASTER_SCALE` and returns it, and `createScene` receives it as the scale factor; but `createScene` also hard-codes `Rx(−π/2)`, and 3DS carries no unit label (metres vs inches) — so this is a numeric master scale, not unit conversion [OBSERVED, `evidence/daeloader_axis_units.txt`, `js/sweethome3d.min.js` @1819385 and @1826232 (`MASTER_SCALE`), @1820691 (`Rx(−π/2)` in `createScene`)].

**OBJ has neither unit nor axis metadata** — the OBJ grammar has no such field, and `OBJLoader.parseEntryScene` builds geometry directly in the file's coordinate space [OBSERVED, `js/sweethome3d.min.js` @1791011]. Empirically, the round-1 sample `armchair1.obj` measures **100.50 × 79.98 × 88.17 raw file units with centre (0.00, 40.05, −9.58)** — i.e. the contributor authored it directly in centimetres, sitting on the floor (min Y ≈ 0.06) and off-centre in Z. That is a convention, not something the code enforces [OBSERVED, `evidence/armchair1_bbox.txt`]. Note the Z off-centre value is precisely what `getNormalizedTransform`'s first centring step exists to remove.

**Net:** unit normalisation is format-dependent and only trustworthy for DAE; for OBJ/3DS (and by extension a glTF whose `asset.extras` are missing) the human must type the size in `ATTRIBUTES`.

### 2.8 Where the wizard's output lands in the data model

`finish()` constructs a `CatalogPieceOfFurniture` (or `CatalogDoorOrWindow`) whose argument order is [OBSERVED, `js/sweethome3d.min.js` @1088380; DOCUMENTED, `jd_model_CatalogPieceOfFurniture.html`]:
`name, icon, model, width, depth, height, elevation, movable, [staircaseCutOutShape], color, modelRotation, modelFlags, modelSize, creator, iconYaw, iconPitch, iconScale, proportional`

Two traps for anyone modelling this: the order is `width, depth, height` where **depth is the plan's Y extent** (not height), and `model` is a **`Content` pointer** (URL/resource/temporary file), never inlined geometry.

When the home file is written, each piece additionally serialises `modelRotation` (default identity string), `modelCenteredAtOrigin` (default `true`), `modelMirrored` (default false), `modelSize` (a `long` byte size used for cache/update checks), `modelFlags`, and `widthInPlan/depthInPlan/heightInPlan` (the **post-pitch/roll projections**, defaulting to W/D/H). Content identity is handled by `ContentDigestManager`, a singleton exposing SHA-1 digests and byte sizes; the javadoc says it "Returns the SHA-1 digest of the content, computing it if it wasn't set" — the same mechanism behind the catalogue's `modelDigest` keys seen in round 1 [OBSERVED, `js/sweethome3d.min.js` @374047 ff. (writer); DOCUMENTED, `jd_io_ContentDigestManager.html`].

The `HOME` writer/reader pair also handles `modelFlags` (SHOW_BACK_FACE, HIDE_EDGE_COLOR_MATERIAL) and the panel repaint set (`MODEL`, `MODEL_MIRRORED`, `MODEL_ROTATION`, `WIDTH`, `DEPTH`, `HEIGHT`, `ROLL`, `PITCH`, `MODEL_FLAGS`, `MODEL_TRANSFORMATIONS`, `WIDTH_IN_PLAN`, `DEPTH_IN_PLAN`, `HEIGHT_IN_PLAN`) — i.e. the renderer treats a rotation change and a size change as separate repaint triggers, consistent with the two-stage transform above [OBSERVED, round-1 + `js/sweethome3d.min.js` @2336397 (`MODEL_FLAGS`), @1948819].

For CasaPlazAI this is a clean **three-layer split** to mirror: **(a) catalogue/asset record** (name, licence, tags, W/D/H, model URL + digest + size, `modelRotation`, flags) → **(b) per-instance record** (`FurnitureItem`: position, `rotationDeg`, `footprint`, roomId) → **(c) deferred normalisation** recomputed at render time from (a).

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each idea names the finding it comes from and, where relevant, the `casaplazai-schema.md` touch-point.

| # | Idea | From | Value | Effort |
| --- | --- | --- | --- | --- |
| I1 | **Replicate the "centre → rotate → optional re-centre → fit to unit box" pipeline verbatim** in the glTF normalisation script. Compute the exact vertex-hull AABB (not `geometry.boundingSphere`), translate its centre to the origin, apply the asset rotation, optionally recompute + re-centre, scale so the largest extent is 1, then multiply by `footprint [a,b]` and height on the outside. This exact order is what makes a 90°-rotated asset land its extents on the right axes. | §2.6 | High | Low |
| I2 | **Store a 3×3 `normalizeRotation` matrix per furniture asset, not Euler angles.** Serialise it as a 9-float space-separated string exactly like `modelRotation`, default identity. Axis fixes are the dominant real-world case (42/805 pieces, 16 distinct matrices, all det = +1, mostly ±90° permutations), and matrix composition is gimbal-free and trivially correct. `FurnitureItem.rotationDeg` stays the only *placement* rotation. | §2.3 | High | Low |
| I3 | **Add an explicit `meterPerUnit` normalisation input for glTF, plus a degenerate-axis clamp.** glTF is metres by spec (`unitScale = 1`), but imported OBJ/DAE/3DS need DAE's `<unit meter>` handling and an OBJ heuristic. Wrap every extent as `max(EPS, extent)` (SH3D uses 0.001) so a flat "wall art" plane cannot produce an infinite scale. | §2.6(5), §2.7 | High | Low |
| I4 | **Bake each asset's thumbnail once at import and cache it; never re-render per view.** Copy SH3D's framing constants (largest dimension → 1.8 units; park the box centre at the origin; 4 directional + ambient rig) and its "compute the offscreen buffer lazily, only when displayed" rule. The shipped catalogue ships pixels and stores `iconYaw/Pitch/Scale` 0 times — the deliberate bake-once split is the model to follow. | §2.5 | Medium | Medium |
| I5 | **Put an explicit orientation step before the size step, with live re-measure.** Because scaling happens after rotation, the W/D/H shown to the user must be measured on the *rotated* box. A two-step (orient → size/attributes) wizard prevents "type a size, then rotate, then get a silently different footprint". | §2.1, §2.6(4) | High | Medium |
| I6 | **Persist a proportional reference triple, not just a lock boolean.** SH3D keeps `proportionalWidth/Depth/Height` as a reference triple and scales the other two from it while suppressing the reciprocal listeners; a naive lock that re-derives ratios from the last edited value drifts. Mirrors `footprint [a,b]` and adds the missing `height`. | §2.4 | Medium | Low |
| I7 | **Make format detection parse-based, normalise on load, and key the asset cache by digest.** `ModelManager.load` advances to the next loader when a parse yields empty bounds and only reports "unsupported" after all loaders fail; content identity is SHA-1 + byte size. In CasaPlazAI: keep the raw glTF in an asset blob keyed by digest together with the normalisation inputs, and recompute the transform cheaply rather than rewriting geometry. | §2.2, §2.8 | Medium | Medium |
| I8 | **Add an explicit asset layer to the editor-local schema.** Asset record = `{id, name, licence, tags, sourceUrl, digest, modelSize, unitScale, normalizeRotation, footprint, height, defaultElevation, modelFlags}` stored under a new local key (e.g. `casaplaza.assets.v1`), with `FurnitureItem` unchanged. One glTF then serves many items, matching SH3D's `CatalogPieceOfFurniture` vs `HomePieceOfFurniture` split. Promoting `FurnitureItem.assetId` into the shared `FloorplanData` would be a `schemaVersion` bump — out of scope this round. | §2.8 | High | Medium |
| I9 | **Add `elevation` (and a per-asset drop-to-top value) to the furniture asset record, with bottom-anchored semantics.** SH3D's `elevation` is the piece bottom, and render adds `n/2` (half the possibly tilted height) to reach the box centre. Wall-mounted items (TVs, shelves, mirrors) need exactly this bottom-vs-centre handling. | §2.6, §2.8 | Medium | Medium |
| I10 | **Represent mirroring as a signed X scale, not duplicated geometry.** SH3D folds `modelMirrored` into `diag(±width, height, depth)`, and its plan-icon cache key includes `(model, modelRotation, centeredAtOrigin, mirrored, pitch, roll, materials)`. This keeps `footprint` defined as the unrotated extent and avoids a second mesh. | §2.6, §2.5 | Low | Low |

**Concrete schema touch-points.** None of the above requires a breaking `FloorplanData` change: the asset/normalisation data is editor-local, like the existing blueprint underlay (`casaplaza.underlay.v1`). Recommended: a new editor-local key for asset records (I8) while `FurnitureItem` keeps `position`, `rotationDeg` and `footprint` unchanged; any shared-schema move (`FurnitureItem.assetId`) is a future `schemaVersion` bump.

---

## 4. Unknowns

1. **The orientation UI's exact button semantics.** The user guide says "orientate the model with arrow buttons", but the desktop Swing panel is absent from the web build (the JS view factory returns `null`), so I could not enumerate how many arrows exist, what increment each applies, or whether there is a reset. I verified via javadoc that `ModelPreviewComponent` supports view yaw/pitch/scale and a separate model rotation, and via the catalogue that arbitrary fractional matrices occur — but the arrow→matrix mapping, step size and snap behaviour are **INFERRED**.
2. **Whether the wizard pre-fills W/D/H from `ModelManager.getSize` and in which unit.** `ModelPreviewComponent.setModel` clearly calls `getSize` when no explicit box is given, and the `ATTRIBUTES` form has W/D/H inputs, but the exact call site that seeds the wizard's `width/depth/height` from the freshly loaded model lies behind the missing Swing panel. The existence of `setModelRotationAndSize(matrix, w, d, h)` suggests the orientation step receives the box from attributes rather than auto-sizing. **INFERRED.**
3. **`modelCenteredAtOrigin` history.** The reader infers it from `modelRotation == null` for files older than version 5500 and the writer defaults it to `true`; which release introduced the attribute and which changed the default is not checked.
4. **DAE `up_axis` sign/handedness.** The constants `Rx(−π/2)` for `Z_UP` and `Rz(+π/2)` for `X_UP` are read from the code, but I did not test them against real Collada files of each axis, so the sign convention is not independently confirmed.
5. **3DS `MASTER_SCALE` semantics.** The value flows into `createScene`'s scale, but 3DS can use inches and the loader hard-codes `Rx(−π/2)`; whether any inch→cm conversion happens, and whether that axis fix is always right for 3DS's Y-up convention, is unverified end-to-end.
6. **Icon rendering details.** The parallel-projection constants, front/back clip planes and material special-casing were read at code level only; no rendered image was inspected (the wizard UI is absent in the web build, and images are out of scope for my inspection).
7. **Multi-part / `multiPartModel` pieces.** The catalogue marks 667 entries as multi-part, and `ModelManager` special-cases name prefixes (`sweethome3d_window_pane`, lights, mannequin parts, hinges). Whether the *wizard* exposes any UI for joining or grouping parts is not established here; round 1 covered the catalogue side.
8. **Descriptor confirmation limited to static evidence.** The desktop-only arrow UI, drag-and-drop and SH3F install could not be reproduced on a running desktop install (downloads/installers not permitted). All claims about those are DOCUMENTED and tagged as such.

---

## Appendix — Chronology & evidence index

- **15:26** start. Read round-1 `report.md` and its evidence list (read-only, no redoing).
- **15:28** created the `report.md` skeleton.
- **15:30–15:55** extracted from round-1's `js/sweethome3d.min.js` (read-only) into `evidence/`: the wizard controller (`controller_raw.txt`, `controller_pretty.txt`), the four step-state bodies and proportional listeners (`controller_step_bodies.txt`), the loader/`ModelManager` region (`modelmanager_raw.txt`, `modelmanager_normalisation.txt`), `ModelPreviewComponent` (`modelpreview_pretty.txt`), and the DAE/3DS/OBJ unit-and-axis code (`daeloader_axis_units.txt`).
- **15:56–16:10** fetched vendor javadoc into `evidence/jd_*.html` for: the wizard controller, its `Step`, `Property` and nested `ImportedFurnitureWizardStepState`, `WizardController.WizardControllerStepState`, `ModelPreviewComponent`, `ImportedFurnitureWizardStepsPanel`, `ModelManager`, `PieceOfFurniture`, `CatalogPieceOfFurniture`, `HomePieceOfFurniture` (+ `Property`), `HomePieceOfFurniture3D`, `Content`, `ContentDigestManager`, `ImportedFurnitureWizardStepsView`, and the package summaries. Four wrongly-guessed nested-class URLs and three `src-html` URLs returned the site's 404 page and were **deleted after verification** (checks in this appendix rely only on files that pass a "Page Not Found" test).
- **16:05** live-browser attempt failed: the `rea capture-browser-scenario` schema has **no `browser.args` launch-argument field** (`invalid_request` / `unknown_argument`), and the earlier no-args attempt timed out (`provider_timeout`). Combined with the web build stubbing `createImportedFurnitureWizardStepsView → null`, no live wizard capture is possible; logged as `scenario_online_gl.json` / `scenario_online_gl_result.json`.
- **16:13–16:50** parsed the 805-piece catalogue: 42 non-default `modelRotation` values, 16 distinct matrices, all det ≈ +1 (`catalog_modelrotation.txt`); measured the sample `armchair1.obj` AABB empirically (`armchair1_bbox.txt`); wrote the findings, ideas and unknowns.
- **Web search was unavailable this session** (`DEEPSEEK_API_KEY` not configured), so every claim rests on local files plus direct vendor doc/javadoc fetches — which is exactly what the OBSERVED/DOCUMENTED tags record. Source URLs and licence notes are in `sources.json`.
