# 3D House Planner — Live Furniture Placement: Drop, Drag, Gizmo, Snapping, rotation_offset & Footprints

Job: `08-05b-furniture-catalog-placement` · Round 2 · Target: https://www.3dhouseplanner.com/ (editor `/app.php`, 2D planner `2D-Planner/index.php`), Babylon.js 6.38.

Round 1 (`rea-3dhouseplanner-2026-10/05-05-furniture-catalog/report.md`) established the catalog data model, categories, search and the *static* placement code. **This round goes deeper on live placement** and closes its Unknowns #1 (live in-editor interaction never observed), #4 (`rotation_offset` semantics), and #8 (AI rules read not run) where they touch placement.

Method: a raw Playwright harness (`pw.mjs`, bundled `playwright-core` + local Chrome 156) driving the real editor with `--use-angle=swiftshader --enable-unsafe-swiftshader`, because `rea capture-browser-scenario` has **no `evaluate` action** (verified from its schema `dist/domain/browserScenarioValues.js`) and synthetic canvas clicks do nothing (round-1 lesson). Plus targeted extraction from the round-1 deobfuscated modules (read-only).

Legend: **OBSERVED** = seen in a live capture or in shipped bytes (evidence file named) · **DOCUMENTED** = stated on a vendor page (URL) · **INFERRED** = my deduction.

Started: 2026-10-31 15:50 CET.

---

## 1. Summary

- **The editor renders under software GL and exposes a real placement API**: `window.HP3D` only appears *after* the "Project settings" dialog is dismissed with **Start designing**; before that `BABYLON.EngineStore.Instances` is empty and `HP3D` is `undefined`. With SwiftShader the 3D canvas runs at ~60 fps (OBSERVED: `evidence/probe1-info.json`, `probe2-api.json`, `probe4-scene.json`).
- **A catalog drop is one GLB fetch, not a Draco-CDN round-trip.** Clicking the sofa catalog entry fetched exactly one model `/admin/objects/slgSofa.glb` (2 206 688 B) and produced a single merged mesh `objmeshes` (55 391 verts) on level 0 — no `draco_decoder.wasm` in 147 responses (OBSERVED: `evidence/probe6-place.json`). Round 1's Unknown #2 is closed for this item.
- **The drop pipeline is: catalog anchor → `loadModelTemplate` (cached, merged) → `instantiateModel` (clone) → scale-to-target per axis → Y-rotation → `seatOnSupport`**, which samples the bbox centre plus four ±40 % corner points and takes the max support height; a live call with `{width:2, depth:1, height:0.9, rotation:30}` gave `scaling ≈ [1.125, 0.921, 1.121]` and `rotationQuaternion = +30°` about Y (OBSERVED: `evidence/probe5-api.json`, `probe8-live.json`).
- **Dragging:** the shipped bundle contains a floor-plane `PointerDragBehavior` that rounds x/z by the grid factor only while Shift is held, but the **live furniture mesh instead carries two movement-disabled Babylon `SixDofDrag` gizmo handles and no reachable `PointerDragBehavior`**, so grid rounding could not be confirmed live; there is no wall snapping and no collision veto in the 3D path — wall snapping lives entirely in the 2D planner iframe (`snapObjectToWall`/`computeWallSnap`) (OBSERVED: `deobf/hp-editor.deobf.js`; `evidence/probe15-behaviors.json`, `probe16-sixdof.json`, `probe10-live.json`).
- **`rotation_offset` is a per-catalog-item yaw correction in degrees, quarter-snapped, with precedence `catalog.rotation_offset` > `instance.productRotationOffset` > null**, consumed by the 2D planner's `FloorplanOrientation` (executed live): `computeObjectTransform` derives `scaleX/scaleZ/yawRad` from the **2D symbol footprint**, plus a `modelYawOffset` user override and a `+90°` auto-turn heuristic when the GLB bbox and the symbol disagree about which axis is long (OBSERVED: `deobf/hp-editor.deobf.js`, `evidence/probe8-live.json`).

---

## 2. Findings

### 2.1 Live editor reachability, runtime environment and the API surface

**OBSERVED** (`evidence/probe1-info.json`, `probe2-api.json`, `probe4-scene.json`).

- `https://www.3dhouseplanner.com/app.php` with a `visted=1` cookie serves the editor HTML; the page decodes **Babylon.js 6.38** from `/assets/babylonjs/babylon.js` and creates the engine only after the loading/project dialog is dismissed. The render canvas is `#renderCanvas` (CSS 1600×1000, backing store 300×150 until the engine resizes it).
- With Playwright launch args `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` the WebGL context is real: `glRenderer = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"`. Nothing in the 3D scene rendered until "Start designing" was clicked; afterwards `engine.getFps() ≈ 60` and the scene holds the expected root meshes `skyBox, ground, ground2, myPlane, inpacttorus`.
- An initial scene contains three cameras (`ArcRotateCamera`, `UniversalCamera`, a second `ArcRotateCamera`) — the walkthrough camera exists from the start.
- **`window.HP3D` (round 1 could not see it) is a large, readable façade** — `version:'1'`, plus `scene, engine, cameras, lights, shadowGenerator, glowLayer, terrain, grid, gui, orientationGizmo, gizmoLists, gizmoManagers, catalog, events, emit, floorHeight, currentLevel, setLevel, levelBase, supportYAt, seatOnSupport, levelOf, levelOfY, units, classify, elementRoot, listElements, wallEndpoints, nearestWall, modelPathOf, worldBounds, yawOf, buildWall, buildTool, moveElement, rotateElement, footprintOf, minAreaRect, polygonArea, polygonCentroid, placeOpening, placeObject, registerElement, instantiateModel, loadModelTemplate, disposeElement, applyTexture, pickTexture, pickOpeningModel, attachGizmo, focusOn, frameAll, getSelection, clearSelection, select, importFile, importPlanObject, importPlanImage, convertPlanImage, plannerWindow`.
- This is *not* a hidden internal: it is the documented integration surface, published to page scripts as `window.HP3D` and announced with `window.dispatchEvent(new CustomEvent('hp3d:ready',{detail:window.HP3D}))` (OBSERVED in `deobf/hp-editor.deobf.js`). The 2D planner iframe consumes the same object.

### 2.2 The drop pipeline: catalog click → live mesh

**OBSERVED** (`evidence/probe6-place.json`, `probe5-api.json`).

Clicking `<a id="item4">` ("Red tufted leather two-seat sofa") in the Objects tab produced, after ~12 s:

| property | value |
|---|---|
| mesh id / name | `objmeshes` |
| `metadata.hp.kind` / `.level` | `object` / `0` |
| `metadata.hpModel` | `/admin/objects/slgSofa.glb` |
| position (local) | `[0, -0.038, 0]` |
| rotationQuaternion (euler, deg) | `[0, 0, 0]` |
| scaling | `[1, 1, 1]` |
| bounding box (world) | min `[-0.89, -0.06, -0.511]`, max `[0.888, 0.917, 0.381]` |
| vertices | 55 391 |

- The only model request in the whole session was `GET /admin/objects/slgSofa.glb` → 200, `content-length 2206688`; **no Draco decoder wasm was fetched** (147 responses inspected). The family-of-sofa file is not Draco-compressed, unlike the round-1 sample bed, so the Draco path is still only *inferred* for items that declare `KHR_draco_mesh_compression`.
- Note the object was placed **at the scene origin, not under the camera**, and `scene.meshes` also contains a `__root__` empty with `rotationQuaternion=[0,180,0]deg` and `scaling=[1,1,-1]` — a mirror node. My placed mesh's local and world positions matched, so it was not mirrored in this build (INFERRED: not parented to `__root__`).
- **Contrast with the API path:** the catalog click left `scaling = [1,1,1]` (the model's native size), whereas `placeObject({width:2, depth:1, height:0.9, …})` produced `scaling = [1.1153, 0.9213, 1.1211]` — `2/bbox.x`, `1/bbox.z`, `0.9/bbox.y` (OBSERVED: `probe6-place.json`, `probe8-live.json`). So the **catalog click instantiates at native GLB scale**; the target-size normalisation only happens when a width/depth/height is supplied, and the 2D-planner bridge explicitly defaults `applyScaling:false` for objects.

`placeObject` (read from the live function, `evidence/probe5-api.json`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

**Key behaviours:**

- **Scale is target-over-bounding-box per axis**, so the same GLB can be stretched non-uniformly; the catalog record's `width/depth/height` (reader `(x,0)`) drive it, `uniformScale` is optional.
- **Rotation is applied on the Y axis only**, in degrees, positive = `RotationAxis(Axis.Y, +θ)` (i.e. Babylon's right-handed CCW about +Y as seen from above).
- **Position is `(x, 0, z)` then seated**, so the authoring height of a model never decides where it floats.
- **`instantiateModel` is the cache consumer**: it takes the `loadModelTemplate` result, calls `clone('objmeshes', null, true)`, pushes it into `scene.meshes` if absent, sets `isPickable / receiveShadows / checkCollisions = true`, clones the root material, stamps `metadata.hpModel`, registers the mesh as a shadow caster, and attaches `metadata.hp` = `{kind, level, …}`. `loadModelTemplate` caches by path in a `Map`, so a second sofa is a clone, not a second download.

### 2.3 Drag: grid rounding in the shipped bundle vs. `SixDofDrag` handles live

**OBSERVED — static (`shipped bytes`)** and **OBSERVED — live (`probe15`, `probe16`)**, and the two disagree in an important way.

*(a) What the shipped `hp-editor` bundle contains.* Each gizmo manager (`objects`, `openings`, `walls`, `frames`, `roofs`, `polyRoofs`) creates **its own** `PointerDragBehavior` with:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- The drag plane is horizontal (normal +Y) for furniture, openings, walls and one roof manager; the terrain/roof-drape manager uses tilted planes (`(0, cos30°, sin30°)`) and the frame manager uses `(0,0,1)`.
- `validateDrag` **always returns `true`** in that code — the drag is never rejected; snapping is the only constraint and it is conditional on Shift.
- The UI label **"Snap to grid: 0.125 m"** is live-confirmed (OBSERVED: `evidence/probe8-live.json`), i.e. **8 divisions per metre, not CasaPlazAI's 0.5 m**, and the shipped slider handler sets `gridRatio = 1/sliderValue`. The `#snaptogridslider` element is not in this build's DOM (the label has no `id`). A separate element labelled **"Snapping"** with the hint *"Snaps to the corners of walls, openings, floors and objects. Shift: along an axis · Esc: cancel"* is the **measure tool**, not furniture snapping (that text is the `measure.hint` i18n key in `editor-page-raw.html`).
- `moveElement(mesh, dx, dz, {silent})` is the programmatic twin: it adds the deltas, calls `computeWorldMatrix(true)`, refreshes wall cuts for wall-like kinds, and emits a `change` event with `{mesh, kind}`. It does **not** round.

*(b) What the live build actually puts on a placed sofa.* After `placeObject(...)` the mesh had **zero** behaviors; after `attachGizmo(mesh)` it had **exactly two Babylon `SixDofDrag`** behaviors (OBSERVED: `evidence/probe15-behaviors.json`, `probe16-sixdof.json`), each configured:

| property | value |
|---|---|
| `disableMovement` | **true** |
| `rotateDraggedObject` | **false** |
| `rotateAroundYOnly` | false |
| `dragDeltaRatio` | 0.2 |
| `zDragFactor` | 3 |
| `faceCameraOnDragStart` / `allowMultiPointer` | false / true |
| `_ownerNode` | `objmeshes` |

- **No `PointerDragBehavior` was reachable on any scene mesh** (I scanned every mesh: `validateDrag` hits = 0), and `getClassName()` returned `null` on these behaviors (they come from the minified Babylon bundle, where the class is renamed). `SixDofDrag` with `disableMovement:true` is how Babylon's `GizmoManager` implements **handle dragging** for the gizmos, so these two are the gizmo's own handle behaviors, not a general "drag the furniture around the room" behavior.
- **Consequence:** I could **not** confirm that the `Math.round(v·slider)/slider` grid rounding actually executes in the current live build — the code is in the shipped bundle, but the live furniture mesh exposes gizmo handles instead, and the translation path was not identified. The two may coexist (the bundle's `PointerDragBehavior` attached to a different (legacy) gizmo manager, or to a node the live path does not use). Treat grid-rounded dragging as **documented-by-code, not live-verified**.
- It also means the earlier assumption "drag the mesh to move it" may be wrong for the modern shell: two movement-disabled handle behaviors suggest **the gizmo is the only mover**, which would make idea #4 below even more directly applicable.

### 2.4 Gizmo: bounding-box rotation/scaling with axis locks

**OBSERVED** (`evidence/probe5-api.json`, `probe7-live.json`, `deobf/hp-editor.deobf.js`).

Live state after the project started (before anything is selected):

| manager | `boundingBoxGizmoEnabled` | `positionGizmoEnabled` | `rotationGizmoEnabled` | `scaleGizmoEnabled` |
|---|---|---|---|---|
| `objects` | true | false | false | false |
| `openings` | true | false | false | false |
| `walls` / `frames` / `roofs` / `polyRoofs` | false | false | false | false |

- `attachGizmo(mesh)` detaches all six managers, then maps the mesh's class to a manager: `object → objects`, `door|window → openings`, `wall|slab|ground → walls`, `frame → frames`, `roof → roofs|polyRoofs` (by membership test). So **selecting a piece of furniture enables exactly one bounding-box gizmo**.
- The bounding-box gizmo is configured for **yaw-only rotation and X/Z-only scaling**: `setEnabledRotationAxis('y')`, `setEnabledScaling(scaleX=true, scaleZ=true)`, with Y scaling and the position/rotation gizmos off. That is what stops furniture from sinking or floating during a resize, and it means the only interactive transform axes are *yaw, width, depth*.
- The gizmo also listens to `onScaleBoxDragObservable` / `onScaleBoxDragEndObservable` to update/clear a live size readout, so **the user sees the new footprint dimensions while dragging a scale handle**.
- `rotateElement(mesh, deg, {silent})` exists as the keyboard/API equivalent: if the mesh has a `rotationQuaternion` it uses `rotate(Axis.Y, rad)`, else it adds to `rotation.y`; it then **re-centres** the mesh so the bounding-box centre is unchanged (it measures before/after footprint centres and compensates the position) and emits `change`.

### 2.5 Snapping to floors and supports (not to walls)

**OBSERVED** (`evidence/probe5-api.json`, `probe7-live.json`).

- `supportYAt(x, z, level)` casts a ray straight down from `levelBase + 0.5·floorHeight` and `intersectsMesh` every scene mesh that is enabled, belongs to the requested level and is **not** the object itself (`classify(mesh) === 'ground'` skips most; the `'ground2'` terrain mesh is tested separately and only for level 0). It returns the **highest** hit Y, falling back to the level base.
- `seatOnSupport(mesh, level)` samples five points — the bbox centre and the four corners at **±40 % of the bbox half-extents** — takes the **max** `supportYAt`, then calls `setY(mesh, y)`.
- **There is no wall snapping and no collision test in this path.** Reviewing the whole `validateDrag`/`moveElement`/`placeObject` chain, nothing consults `nearestWall` or the AI placement engine; a sofa can be dropped through a wall. That matches round 1's finding and is now confirmed live. (`nearestWall`, `wallEndpoints`, `cutOfWall` exist on `HP3D` but are used by wall/opening tooling, not by furniture drag.)

### 2.6 `rotation_offset` and the 2D-symbol ↔ 3D-model reconciliation

**OBSERVED** (`deobf/hp-editor.deobf.js`; consumer names confirmed on the live `HP3D` façade).

Round 1's Unknown #4 is now answerable. Three pieces make up the orientation model:

**(a) The accessor with precedence** (`_0x41ee5b(instance, modelPath)`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

So **catalog `rotation_offset` wins over a per-instance `productRotationOffset`**, and the value is *degrees* (it is handed straight to `resolveModelOffset`'s `productOffsetDeg`, which is later summed with other degree quantities). All 1 882 shipped records are `null` (round 1 §2.2), so today the instance value is always used — and it is only ever set by the 2D-planner hook:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

**(b) The resolver** — `resolveModelOffset({symbolFrontDeg, productOffsetDeg, userOffsetDeg, modelFootprint, target:{size,thick}, autoTurn})` returning `{offsetDeg, auto, productKnown}`. It is **not** in the editor: it lives in the **2D-planner iframe**, `contentWindow.FloorplanOrientation`, which I reached and executed live (OBSERVED: `evidence/probe8-live.json`). The editor calls it through `getPlannerWindow()` and falls back to `{offsetDeg:0, auto:false}` when the iframe is absent.

The module's full API: `ELONGATED_RATIO, normalizeDeg, snapQuarter, isQuarterTurnOdd, hasOffset, resolveModelOffset, footprintInSymbolFrame, computeObjectTransform, computeDoorWindowYaw, frontVector2d`. Live-read sources (deobfuscated by reading them at runtime, then rewritten here in my own words):

- `normalizeDeg(d)`: `mod 360`, negatives wrapped, exact 360 → 0. Live: `-10→350, 370→10, 95→95`.
- `resolveModelOffset(o)`: `productKnown = hasOffset(o.productOffsetDeg)`; `offset = snapQuarter(userOffsetDeg) + (productKnown ? snapQuarter(productOffsetDeg) : 0) + (auto ? snapQuarter(symbolFrontDeg) : 0)`; `auto=false` by default. If `autoTurn` was **not** supplied it runs the **auto-turn heuristic**: if no product/quarter offset is set and the model footprint and the target rectangle disagree about which axis is elongated (both over `ELONGATED_RATIO`), it adds **90°** and sets `auto=true`. Live calls:
  - `{symbolFrontDeg:0, productOffsetDeg:null, userOffsetDeg:0, modelFootprint:{x:2,z:1}, target:{size:2,thick:1}}` → `{offsetDeg:0, auto:false, productKnown:false}`
  - same with `productOffsetDeg:90` → `{offsetDeg:90, auto:false, productKnown:true}`
  - `modelFootprint:{x:1,z:2}, target:{size:2,thick:1}` (elongations disagree) → `{offsetDeg:90, auto:true, productKnown:false}`
- `footprintInSymbolFrame(fp, offsetDeg)`: when the offset is an **odd quarter turn** it swaps the axes (`{size: fp.z, thick: fp.x}`), else `{size: fp.x, thick: fp.z}`. Live: `({x:2,z:1},0)→{size:2,thick:1}`; `({x:2,z:1},90)→{size:1,thick:2}`.
- `computeObjectTransform({dims, target:{size,thick}, offsetDeg, angle2dDeg})`: if the offset is an odd quarter turn, `scaleX = thick/dims.x`, `scaleZ = size/dims.z`, else `scaleX = size/dims.x`, `scaleZ = thick/dims.z`; `yawDeg = normalizeDeg(angle2dDeg + offsetDeg)`, and `yawRad` is that in radians. Live: `{dims:{x:2,z:1},target:{size:2,thick:1},offsetDeg:0,angle2dDeg:0}` → `{scaleX:1, scaleZ:1, yawDeg:0}`; `angle2dDeg:90` → `yawDeg:90, yawRad:π/2` with scales unchanged; `offsetDeg:90` → `{scaleX:0.5, scaleZ:2, yawDeg:90}`.
- `computeDoorWindowYaw({dims, angle2dDeg, productOffsetDeg, userOffsetDeg})`: `yawDeg = normalizeDeg(angle2dDeg + (dims.x>=dims.z ? 0 : 90) + productOffset + userOffset)` and `longAxis = dims.x>=dims.z ? 'x' : 'z'`. Live: `{dims:{x:1,z:0.1},angle2dDeg:0}` → `{yawDeg:0, longAxis:'x'}`.

**(c) The consumers:**

- `footprintInSymbolFrame(footprint, offsetDeg)` → `{size, thick}`; the editor writes those back onto the 2D object (`obj.size`, `obj.thick`) and calls `updateOrientation3dHint`, then `floorplanSave()`.
- `computeObjectTransform(...)` → `{scaleX, scaleZ, yawRad}` applied to the 3D mesh, so **the 2D symbol footprint, not the GLB bbox, decides the final width/depth**, while the **bbox aspect ratio decides the yaw**.
- `computeDoorWindowYaw(...)` → `{yawRad, longAxis}`: for openings, the yaw chooses which bbox axis is "long", and `"reverse" === obj.hinge` flips the sign of that axis's scale (door-swing mirroring).

Summary of the model: **the 2D symbol frame is canonical**. `rotation_offset` is a per-catalog-item correction in **degrees** that maps a GLB's native orientation onto that symbol's "front"; the value is snapped to the nearest quarter turn; a per-instance `modelYawOffset` lets the user override, and `modelAutoTurn` records whether the 90° auto-turn heuristic was accepted. Because all shipped `rotation_offset` values are `null` and the 2D catalog's `frontDeg` is `0` for every core type (2.10), the correction chain currently resolves to `userOffsetDeg + (auto ? 90 : 0)`.

### 2.7 Footprint measurement (`modelFootprint3d`, `minAreaRect`, auto-turn)

**OBSERVED** (`deobf/hp-editor.deobf.js`; `footprintOf`/`minAreaRect` on the live façade).

- The editor has a **measure-only loader**: it calls `SceneLoader.ImportMesh('', root, file, scene, cb)` *just* to union all sub-meshes' `minimumWorld/maximumWorld` into one axis-aligned box, keeps only `{x, z}` (the plan footprint), disposes every loaded mesh in `finally`, and memoises the result in a `Map`. Errors: `"Failed to compute model footprint"` (throw) and `"Failed to load model for footprint detection"` (load error). It returns `null` if the model has no geometry or zero X/Z extent.
- It then checks **cache validity by source path**: `modelFootprint3d.source === currentModelPath`; if not, it deletes `modelAutoTurn` and recomputes. Persisted shape: `modelFootprint3d = {x, z, source}`.
- `minAreaRect(points)` (live source) is a **rotating-calipers minimum-area rectangle**: for each polygon edge it projects every point onto the edge direction `(ux,uz)` and its normal, tracks the min/max on both axes, computes `area = (maxU-minU)*(maxV-minV)`, keeps the smallest, and returns `{area, ux, uz, cx, cz, length, width}`. It normalises `width`/`length` ordering at the end. `polygonArea` (shoelace) and `polygonCentroid` are the helpers.
- `footprintOf(mesh)` (live name for the internal `_0x2327cc`) is a **plan-view outline extractor**: it takes the mesh's polygons, projects each vertex to `{x, y:z}`, keeps rings with > 3 points, collects all vertices into one flat point list, then densifies each ring by inserting intersections with the other rings' edges. **This is a polygon-boolean preparation step (self-intersection resolution) built on raw point/segment math** — no earcut/Clipper dependency is used for it.
- **Live results** (`evidence/probe8-live.json`): after `placeObject({width:2, depth:1, height:0.9, rotation:30})`, `minAreaRect` over the mesh's plan-projected vertices returned `{area:1.5768, length:1.7775, width:0.8871, ux:-1.0, uz:0.0063}` — i.e. the *rotated* 2×1 footprint recovers a ~1.78×0.89 oriented box at 30°+180° (the `ux=-1` reflects the axis sign, not a size change). `footprintOf(mesh)` **threw** on the merged `objmeshes` (`TypeError: _0x576013[...] is not a function`): the live merged mesh keeps its original merged geometry buffers and the extractor expects per-polygon data that only the 2D-side objects carry (INFERRED — the throw is OBSERVED, the reason is inferred). `seatOnSupport` placed the object at `y=0.08` on the flat default floor.

### 2.8 The 2D planner iframe (`2D-Planner/index.php`)

**OBSERVED** (`deobf/hp-editor.deobf.js`, `evidence/probe7-live.json`; direct `curl` blocked by Mod_Security).

- The 2D planner is an **overlay iframe created lazily** by the editor: a full-screen `div` (`background rgba(0,0,0,0.8)`, `z-index 1000`, `visibility:hidden`, `pointer-events:none`) containing

  ```html
  <iframe id="floorplanIframe" src="2D-Planner/index.php?lang=<lang>" style="width:100%;height:100%;border:0"></iframe>
  ```

  plus a floating control card (bottom-right, 115 px) that the editor shows/hides. `#close2DPlanner` hides the overlay; a window `resize` is forwarded to the iframe.
- A direct `curl` to `2D-Planner/index.php?lang=en` returns **HTTP 406 Mod_Security** ("Not Acceptable") — the page is only reachable inside a real browser session with the site's own headers/cookies (OBSERVED: `evidence/2d-planner.html`). So its internals must be read through the iframe, not by fetching.
- The editor drives the iframe through its `contentWindow`: it checks `w.WALLS`, reads/writes `contentDocument.getElementById('doorSelect')` / `'windowSelect'`, and pushes 3D state into it; the iframe calls back through `window.HP3D.importPlanObject`, `importPlanImage`, `convertPlanImage`.
- **`importPlanObject(obj, category, {applyScaling, alignToWall, scale, level})`** is the shared 2D→3D placement bridge (used for objects, doors and windows). It:
  1. resolves the model path (`obj.model` / `obj.graph[data-model]` fallback);
  2. `instantiateModel(path)`;
  3. if `applyScaling` (defaults **true for door/window, false for object**): rescales the mesh so the **larger** bbox axis becomes `max(obj.size,obj.thick)·scale` and the **smaller** axis becomes `min(...)·scale`, plus height from `obj.height3d`; otherwise (objects) it uses `FloorplanOrientation.computeObjectTransform` to get `scaleX/scaleZ/yawRad`;
  4. sets `position.x = obj.x·scale + offX`, `position.z = -obj.y·scale - offZ` — note the **2D y maps to −3D z**, i.e. the plan's Y axis is flipped into Babylon Z;
  5. for door/window: `id = name = 'door_window'`, `position.y = level·floorHeight + 0.2`, then finds the nearest wall within the wall's half-height band and seats the opening with `door`/`window` seat helpers, and `hinge === "reverse"` mirrors the long axis.
- Default `level` for an imported object is the **currently displayed floor** (`floorHeight · currentFloorIndex`), and openings go to `floorHeight·level + 0.2`.

### 2.9 Live vs. static: what "live placement" means (round-1 Unknown #1 closed)

**OBSERVED** (`evidence/probe6-place.json`, `probe7-live.json`).

The round-1 report could only read the placement code. This round executed it:

- Catalog click → real GLB fetch → merged `objmeshes` mesh added on level 0 with the expected metadata (2.2).
- The public API (`placeObject`, `instantiateModel`, `rotateElement`, `moveElement`, `seatOnSupport`, `attachGizmo`, `footprintOf`, `minAreaRect`) is callable from page script and returns live results.
- Gizmo managers are real Babylon `GizmoManager` instances with the documented flags (2.4).
- The 2D-planner iframe **does exist in the DOM** (the editor builds it at load), and `HP3D.plannerWindow()` resolves to its `contentWindow` — so the symbol↔model orientation code is reachable, not dead.

### 2.10 The 2D planner's own catalog, wall-snap and its answers to live queries

**OBSERVED** (`evidence/probe10-live.json`, `probe8-live.json`).

The iframe is a mature app in its own right. Its `contentWindow` exposes `floorplanEditor`, `WALLS`, `wallSize`, `FloorplanOrientation`, `FloorplanSymbols`, `FloorplanCatalog`, `FloorplanLibrary`, `snapObjectToWall`, `buildOrientation3dHint` / `updateOrientation3dHint` / `refreshAllOrientation3dHints`, `floorplanSave` / `floorplanLoad`, undo/redo, texture/floor helpers.

**The 2D shell** (OBSERVED live, `evidence/probe11-2d.json`): a single SVG-based canvas app (`#extension-floorplanner-svg-container`, 50 visible controls) with a top bar (`File`, undo, redo, floor/level buttons, **"3D build"**, **AI**, zoom 80 %, unit **m**, a live coordinate readout `E 0.00 m N 0.00 m`, a 1 m scale bar) and a left tool rail: **Select, Walls, Arc wall, Divider, Joint, Doors, Windows, Stairs, Objects, Rooms, Text**. So the same page is a full 2D plan editor, not just a symbol overlay, and it embeds the 3D *and* AI actions.

Its **snapping system** is separate from the 3D drag path:

- globals `grid_snap`, `setGridSnapEnabled`, `updateGridSnapUI`, and UI strings **"Snap to grid"** and **"Snap to grid on / off"** — a toggleable plan grid snap.
- `rotation_snappyness` — a rotation-snap granularity for the 2D objects.
- `calcul_snap`, `arcToolSnap`, `cleanDirPoint`, `nearWall`, `nearVertice`, `rayCastingWall(s)` — wall/vertex/arc snapping for the drawing tools.
- UI string **"Place objects without wall snapping"** — i.e. object placement wall-snaps *by default* in the 2D planner and this is the modifier to place free of a wall.
- **`FloorplanCatalog`** (45 keys incl. `GROUPS, SIZE_VERSION, items, getItem, resolveType, symbolFor, frontDeg, wantsWallSnap, defaultSizePx, legacyDefaultPx, normalizeText, matchModels, bestItemForProduct, searchItems, productsForSub, coverageReport, computeWallSnap, designBox`). A raw catalog item has the shape

  ```js
  { id:'couch', label:'Sofa', icon:'🛋️', w:200, d:90, cats:[1], kw:[2], ex:[3], alias:[2],
    wall:true, front:0, symbol:null, hidden:false, group:{…}, sub:{…}, label_en:'Sofa' }
  ```

  i.e. the 2D symbol's default box is in **centimetres** (`couch` = 200×90 cm, the same piece as the 3D `slgSofa.glb`), with `wall:true` marking wall-affinity and `front:0` the symbol's "front" angle. Live answers, which give the **plan-symbol geometry** directly:

| query | bed | sofa | table | chair | counter | bathtub | toilet | plant | lamp | tv |
|---|---|---|---|---|---|---|---|---|---|---|
| `resolveType` | bed | sofa | table | chair | counter | bathtub | toilet | plant | lamp | tv |
| `frontDeg` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `wantsWallSnap` | **true** | false | false | false | false | **true** | **true** | false | false | **true** |
| `designBox` (px, `y` down) | `{-10,-20,20,40}` | null | `{-50,-30,100,60}` | `{-22.5,-25,45,50}` | null | `{-85,-37.5,170,75}` | `{-22,-34,42,67}` | `{-25.6,-25.4,51.3,52.7}` | null | `{-62.5,-12.5,125,25}` |

- `designBox` is `{x, y, width, height}` in the symbol's own local layout frame, **centred on the symbol origin** (`x = -width/2`) and with **+y pointing down the plan**. Its unit is *not* the catalog's centimetres (bed 20×40 vs. `defaultSizePx('bed') = {width:54, height:120}`); it looks like an abstract layout/share unit rather than a physical one, so I did not convert it (see Unknowns). `SIZE_VERSION = 2` (so there was a v1 sizing table, read by `legacyDefaultPx`).
- `FloorplanSymbols.list()` returns **277** symbol names (`bean-bag, ottoman, footstool, bench, coffee-table, …`) and `FloorplanCatalog.items.length = 274`; `FloorplanSymbols.get('bed')` returned `null` while `list()` works, so the symbol map is keyed differently from the resolved type.
- **`FloorplanLibrary.setData/getProducts` returns 1 776 products** — the **same 1 776 `objectOptions` as the 3D catalog** (round 1 §2.2). So the 2D palette is fed the 3D library, and the palette has **15 tabs** (`.extension-floorplanner-palette-tab`). `getProducts()[0]` is "King bed with panelled headboard", the same first entry as `objectOptions`.
- **`floorplanEditor`** covers wall *and* opening *and* room geometry: `wall, getWallNode, wallArc, wallLength, wallParamOf, wallFrameAt, clampOpeningU, openingLimits, openingOnArc, placeOnWall, snapshotWallObjects, reseatWallObjects, setWallBulge, makeWall, invisibleWall, visibleWall, splitWall, splitCurvedWall, nearWallNode, rayCastingWall, pointInWall, stickOnWall, objFromWall, createEquationFromWall, rayCastingWalls, obj2D, roomMaker, rayCastingRoom, nearVertice, nearWall, showScaleBox`. `clampOpeningU`/`openingLimits`/`openingOnArc` mean **openings are constrained to their wall and auto-clamped** — the 2D planner is where CasaPlazAI-style `tCenter` clamping + shared-wall handling would live in this app.
- **`snapObjectToWall(obj, point, opts)`** is the object wall-snap (read live, rewritten here): it saves the previous "snapped" flag, refuses if the catalog does not `wantsWallSnap(obj.type)` or there are no `WALLS`, computes `halfThick = |obj.thick|/2`, calls `FloorplanCatalog.computeWallSnap(point, WALLS, halfThick, symbolFor(obj.type), max(24, 0.5·halfThick))`, and on a hit writes back `obj.x, obj.y, obj.angle`, sets the snapped flag and shows a `snappedToWall` message. `computeWallSnap` projects the point onto each wall segment *or* arc, rejects hits farther than `halfThick + objHalf + tolerance` (tolerance 24 by default), keeps the nearest, and also returns a **wall normal** `(nx, ny)` flipped to face the object. Live in a bare editor `WALLS.length === 0` and `wallSize === 12`, so no object was wall-snapped.
- **The 3D editor calls this same 2D code** for imported plan objects (`snapObjectToWall` is used before `importPlanObject`), i.e. **wall snapping is a 2D-planner feature that the 3D editor delegates to the iframe** — the 3D drag path never wall-snaps (2.5).
- The 2D planner also has its own floor/wall colour system (`RS_FLOOR_COLORS` = 12 gradients `gradientWhite…gradientPink`, `RS_DEFAULT_FLOOR = 'gradientWhite'`, `rsSetFloor`/`rsSetWall`/`applyRoomWallTexture`/`updateWallPreview`) and `toggleWallOffsets`/`showWallOffsets` (dimension offsets drawn off walls).

### 2.11 AI placement executed live — and the snapshot bug (round-1 Unknown #8)

**OBSERVED** (`evidence/probe10-live.json`).

- `HPAIPlace.TYPES` is a **57-entry** rule table (round 1 transcribed ~45 from the deobfuscated bytes). Live samples: `stairs {w:[0.6,3.5], d:[0.9,6.5], h:[2,4.5], place:'wall', clear:1, prio:1}`, `bunk_bed {w:[0.9,1.5], d:[1.9,2.2], h:[1.4,1.95], place:'corner', clear:0.6, prio:1}`, `crib {w:[1,1.45], d:[0.6,0.85], h:[0.8,1.15], place:'wall', clear:0.6, prio:2}`, `sofa_corner {w:[1.9,3.6], d:[1.4,3.2], place:'corner', clear:0.8, back:'tall', prio:1}`.
- **`typeOf(title)` is title-driven and works live**: `typeOf('Red tufted leather two-seat sofa')` → the live `sofa` rule `{w:[1.3,3.4], d:[0.72,1.15], h:[0.6,1.05], place:'wall', clear:0.9, back:'tall', rel:{to:['tv','tv_stand'], place:'facing'}, prio:1}`; `typeOf('King bed with panelled headboard')` → the `bed` rule `{w:[0.85,2.45], d:[1.85,2.45], h:[0.3,1.7], place:'wall', clear:0.6, back:'tall', avoidDoorWall:true, prio:1}`; `typeOf('White flatbed truck')` → **null** for the class `truck` (vehicles are handled under a different id, consistent with round 1's `car/motorcycle/bicycle` entries).
- **`HPAIPlace.analyse(mesh)` returns dimensions, not problems**: `{dims:{x:1.7776, y:0.9769, z:0.8920}, frontYaw:0, frontBy:'convention', front:'+z', w:1.7776, d:0.8920, h:0.9769}`. The problem detector is the internal `problems` (`_0x44f0ae`), which samples the **4 corners + 4 edge midpoints** of the oriented box plus its centre and, unless the item is wall- or ceiling-mounted, tests every sample against walls (via the room/wall lookup with a `maxDistance`), the room polygon, other objects, doors and windows. `describeProblem` maps `{kind}` → a human sentence (round 1's `"intersects a wall"` / `"overlaps e<id>"` family).
- **`HPAIPlace.solve(...)` also executed live** (OBSERVED: `evidence/probe12-live.json`): with `{model:'/admin/objects/r38bed.glb', x:1, z:1, level:0, type:'bed'}` and no rooms drawn it returned `{x:1, z:1, y:0, facing:0, rule:'position', warnings:[]}` — so the solver degrades gracefully (keeps the fallback position, empty warning list) instead of throwing when the plan is empty. `floorTop(0) = 0`, `ceilingY(0) = 2.65`, and `plausibleScale(w,d,h)` rescales shapes outside ~0.03–30 m (read live). I could not build a room in-headless (§4.2), so the full scored search with real rooms/openings remains read-only.
- **The dims are stale/wrong for a rotated object — a genuine bug worth noting**: after `placeObject({width:2, depth:1, height:0.9, rotation:30})` the mesh's `boundingBox.extendSize` (stored in `_boundingInfo`) was `{x:1.7776, y:0.9769, z:0.8920}`, an **AABB of the rotated mesh**, while `analyse`'s own `w/d` report `1.7776 × 0.8920`. `placeObject` sets `scaling` and `rotationQuaternion` and then calls `seatOnSupport` (which calls `computeWorldMatrix(true)` indirectly via `intersectsMesh`), but it never calls `refreshBoundingInfo()`, so `_boundingInfo` keeps the **pre-rotation** AABB. The AI engine therefore reasons about the axis-aligned box of a rotated piece unless something later refreshes it. (INFERRED that this is a bug; the numbers are OBSERVED.)

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Every row ties to a finding above; where the CasaPlazAI schema is touched I name the field or file.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Add a wall-affinity + clearance table for the seven FurnitureItem types** — a small `{wantsWallSnap: boolean, clearance: m, back: 'tall'\|null}` map keyed by `type` (`bed/sofa/table/chair/counter/bathtub/toilet`). 3D House Planner's 2D catalog ships exactly this per type (`bed: true`, `bathtub: true`, `toilet: true`, `tv: true`, others false) and carries a `clear` distance in its AI rules. It is the cheapest way to make "fit constraints" declarative and matches the review at §2.10/§2.11. | 2.10, 2.11 | High — one table replaces ad-hoc per-type code and scales past 7 types. | Low |
| 2 | **Snap furniture placement to the same grid as walls** (reuse the 0.5 m constant). 3D House Planner's *shipped code* runs furniture on `1/slider` with the label "Snap to grid: 0.125 m" (8 per metre) and gates it on Shift — though its live build exposes only gizmo handles (2.3), so the gate is a design warning, not a template. Do **not** copy the Shift gate as the default — make grid snap the default and Shift the *free* modifier, because CasaPlazAI already has a 0.5 m grid and users expect furniture at the same pitch as walls. | 2.3 | High — kills the "furniture half-off the wall" class of bug. | Low |
| 3 | **Rotate the model by the footprint's own aspect, not by hand-authored orientation data (auto-turn).** When a piece's GLB bbox disagrees with the schema `footprint [a,b]` about which axis is long — both ratios over `ELONGATED_RATIO = 1.2` — and neither the catalog nor the user has set a quarter offset, add 90°. Then **snap any yaw offset to quarter turns** in the resolver but keep `rotationDeg` free. Ship the formula, not the constant. | 2.6 | High — removes the single most common "sofa faces the wrong way" defect, and it needs no new catalog metadata. | Medium |
| 4 | **Split "move on the floor" from "resize/rotate"** the way 3D House Planner does: in the live build a placed sofa is moved by a bounding-box gizmo whose drag handles have `disableMovement:true` / `rotateDraggedObject:false`, with the position and rotation gizmos off. Translate that into a horizontal drag plane plus a gizmo with **Y-lock** (yaw only, X/Z scale only). `FurnitureItem.position/rotationDeg/footprint` already model this exactly, so the interaction is the only work. | 2.3, 2.4 | High — structural guarantee that nothing floats or sinks. | Medium |
| 5 | **Add a live size badge while a scale handle is dragged** (`onScaleBoxDragObservable` updates the readout, cleared on drag end). With `footprint [a,b]` in metres, showing "2.00 × 1.00 m" during the drag is a few lines and it is what makes the gizmo trustworthy. | 2.4 | High — cheap, immediate usability win. | Very low |
| 6 | **Seat furniture on the support by sampling the centre plus four corners at ±40 % of the half-extents and taking the max** (3D House Planner's `seatOnSupport`). Prevents chairs sinking into sloped/patched floors and is ~15 lines in the 3D viewer. | 2.5 | Medium-High. | Low |
| 7 | **Put a `rotationOffsetDeg` field on each catalog item now, even if the palette ships only 7 models.** 3D House Planner carries `rotation_offset` on all 1 882 records (all `null` today) with a precise semantics: **degrees, quarter-snapped, precedence `catalog.rotation_offset > item.productRotationOffset > null`**, plus a per-instance user offset. CasaPlazAI's `FurnitureItem` has no such field, so a future model swap would need it; adding an optional nullable field to the palette's data (not necessarily the `FloorplanData` schema — it can live in the editor-local catalog) costs nothing and avoids a migration. | 2.6 | Medium-High — dormant hook, proven useful pattern. | Very low |
| 8 | **Treat the 2D footprint as canonical and derive mesh scaling from it.** 3D House Planner's `computeObjectTransform` scales the mesh so `scaleX = target.size/dims.x`, `scaleZ = target.thick/dims.z` (swapping on odd quarter turns) — the GLB bbox only supplies the *aspect* that drives auto-turn. In CasaPlazAI terms, `footprint [a,b]` should win over the mesh bbox; the bbox is only a hint. This also makes imported/user models land at a predictable size. | 2.6, 2.7 | Medium-High — one rule for catalog and imported models. | Medium |
| 9 | **Give the furniture catalog a "wants wall" affordance, on by default, with a "place free of the wall" modifier.** In the 2D planner, wall-affine items (bed/bathtub/toilet/tv) snap their long edge flush to the nearest wall *automatically* (`snapObjectToWall` + `computeWallSnap`, tolerance 24, returns the wall normal) and the UI offers "Place objects without wall snapping" as the escape hatch. CasaPlazAI already has room segments and shared walls, so this is mostly a behaviour switch plus a toast. | 2.10, 2.5 | High — the most-requested furnishing convenience, with the room data already there. | Medium |
| 10 | **Add a rotation-snap granularity for furniture** (`rotation_snappyness` in the 2D planner) so dragging the yaw handle steps in 15°/45° increments while a modifier keeps it free. CasaPlazAI's `rotationDeg` is unconstrained, so the data model already allows it. | 2.10, 2.6 | Medium — makes "before the wall" angles reachable without pixel-hunting. | Low |
| 11 | **Adopt a soft, non-blocking conflict list with sentence rendering.** 3D House Planner's AI placement engine samples the oriented box's 4 corners + 4 edge midpoints + centre and emits `{kind:'wall'\|'outside_room'\|'object'\|'door'\|'window'}` with a human sentence per kind, split into hard vs soft penalties rather than refusing the drop. For CasaPlazAI this maps 1:1 onto rooms/openings/furniture and keeps users unblocked. | 2.11, 2.6 | High — the fit/collision UX without a physics engine. | Medium-High |
| 12 | **Clamp openings to their wall at authoring time** (`clampOpeningU`, `openingLimits`, `openingOnArc`, `placeOnWall`, `reseatWallObjects`) — the 2D planner clamps an opening's along-wall position and re-seats it when the wall moves, which is CasaPlazAI's `tCenter ∈ [0,1]` + `opening-too-wide` rule expressed as live editing rather than validation-only. | 2.10 | Medium-High — turns a validation error into an interaction the user cannot get wrong. | Medium |
| 13 | **Measure the footprint from the model instead of trusting hand-authored numbers**: a measure-only loader that unions the mesh's world bbox, keeps `{x,z}`, disposes immediately and memoises by source path (invalidate when the path changes). This gives `footprint [a,b]` for imported pieces and a cross-check for catalog ones. | 2.7 | Medium. | Medium |
| 14 | **Add a per-instance "rotate model relative to symbol" offset** (3D House Planner's `modelYawOffset`) so a user can correct a stubborn model without touching the catalog, and persist it on the furniture item. | 2.6 | Medium — a user-facing escape hatch for exactly the §2.6 bug class. | Low |
| 15 | **Catalog the 2D symbol separately from the 3D model**: 3D House Planner keeps a `FloorplanSymbols`/`FloorplanCatalog` layer (277 named symbols + per-type `designBox`, `front`, `wall`) on top of the 1 776-product 3D library, and the presence of `bestItemForProduct`, `matchModels` and `coverageReport` implies one 2D symbol can match many GLBs (INFERRED from those API names; symbol count 277 > product count 1 776 means the mapping is not 1:1 either way). For CasaPlazAI's 7 types this is overkill today, but a `symbolFor(type)` indirection now keeps the future import/catalog path clean. | 2.10 | Medium (low now, high later). | Low |

**Anti-patterns to avoid, tied to findings:**

- Do **not** pack `sillHeight`/`headHeight`/width into a single 3D-scale target for furniture the way 3D House Planner conflates `size`/`thick` across symbol and model (2.6); keep the schema's explicit `footprint [a,b]` + `rotationDeg`.
- Do **not** replicate the "2D side is canonical, 3D derives" split with a **cross-iframe function call** (2.6, 2.8): CasaPlazAI is a single page, so the orientation resolver belongs in a shared module, not behind an iframe boundary.
- Do **not** forget `refreshBoundingInfo()` after a programmatic place/rotate — 3D House Planner's `placeObject` leaves a stale pre-rotation AABB and its own AI engine then reasons about the rotated box (2.11).
- Do **not** ship three physics engines you never call (round 1, §2.6) — this round confirms the manual placement path still has no collider.

---

## 4. Unknowns

1. **The 2D planner's static source was not read, and I could not drive its canvas.** `2D-Planner/index.php` returns **HTTP 406 Mod_Security** to a direct fetch (`evidence/2d-planner.html`); everything about it here is from the live `contentWindow` of the iframe inside a real session. Attempts to *create* walls in-headless failed too: `snapObjectToWall`/`computeWallSnap`/`roomMaker`/`makeWall` were called with plausible signatures and returned `false`/errors without changing `WALLS` (which stayed `0`), and a real-Playwright `mouse` draw over the revealed iframe (`#extension-floorplanner-line_mode` then 4 corner clicks) also left `WALLS.length === 0` (OBSERVED: `evidence/probe12-live.json`, `probe13-draw.json`). So the 2D drawing/mouse pipeline is input-gated like the 3D canvas (round-1 lesson) and its CSS/tooling is only partially covered.
2. **Wall-snap geometry was not exercised numerically.** In a bare editor `WALLS.length === 0`, and I could not create walls (Unknown 1), so `snapObjectToWall`/`computeWallSnap` returned `false` for every case including a `bed` (whose `wantsWallSnap` is `true`). The 24-unit default tolerance, the wall-normal return, the arc-wall branch and the snapped `angle` convention are read from the live function bodies (OBSERVED as code), but **untested numerically**.
3. **`rotation_offset` sign convention unverified.** All shipped values are `null`, so I could not observe whether a positive offset turns the model clockwise or counter-clockwise relative to the symbol's front. I confirmed it is *degrees*, quarter-snapped, and **added** to the 2D angle in `computeObjectTransform` (`yawDeg = angle2dDeg + offsetDeg`), but the 2D plan's `+y` is downward, so sign in plan terms is still inferred.
4. **The exact catalog-click → placement function was not identified.** I observed the resulting `objmeshes` on level 0 with the expected metadata (§2.2), but the click path (`_0x147a48`-style loader vs. `placeObject` vs. a plan-import bridge) was not traced end to end, so I cannot state whether a catalog click also drives the 2D-symbol reconciliation or only the 3D mesh.
5. **Grid-rounded dragging not verified live.** The shipped bundle has the `Math.round(v·slider)/slider` rounding inside `PointerDragBehavior.validateDrag`, but in the live build the placed mesh carries two `SixDofDrag` gizmo handles (`disableMovement:true`) and **no** mesh in the scene exposed a `validateDrag` (0 hits across all meshes), so I could not execute the rounding. The formula is read from shipped bytes only, and the current translation path (gizmo handle vs. free drag) is unresolved.
6. **Shift gate read-only.** Because of #5 there was no reachable `validateDrag`, and the code tracks Shift on **Babylon** `KeyboardEventTypes` (not DOM), so the Shift modifier could not be exercised either.
7. **Draco decoder runtime still unverified.** The sofa GLB is not Draco-compressed and was fetched as one 2.2 MB file with no decoder wasm (§2.2); the round-1 sample bed *is* Draco, so for Draco items the CDN-decoder round-trip remains INFERRED.
8. **The full AI placement search not run with a real room.** `analyse`, `typeOf`, `TYPES` and `solve` all execute live, but I could not draw a room in-headless (Unknown 1), so `solve` only exercised its empty-plan fallback (`{x, z, y:0, facing:0, rule:'position', warnings:[]}`); the scoring, candidate generation, hard/soft penalty split and `applyPlacement` writing the mesh remain read-only.
9. **`floorplanIframe`'s `computeObjectTransform` vs. the editor's own scaling path** are two different code paths for the same idea (§2.8 `importPlanObject` vs. `placeObject`), and I did not verify they agree on a non-quarter offset.
10. **`__root__` mirror node parentage unresolved.** The scene has an empty `__root__` with `rotationQuaternion=[0,180,0]°`, `scaling=[1,1,-1]`; I did not determine whether placed furniture is parented to it (which would mirror X/Z) or stands alone. My live object's local and world positions matched, which suggests it is *not* parented in this build, but I did not assert it.
11. **`FloorplanCatalog` pixel geometry not turned into metres.** `designBox`/`defaultSizePx` are in plan pixels, `wallSize = 12`, and I did not establish the px-per-metre factor or why `defaultSizePx('bed') = {54,120}` differs from `designBox('bed') = {20,40}` centred.
12. **`FloorplanSymbols.get('bed')` returned `null`** while `list()` returns 277 names, so the symbol map's keying (name vs. resolved type vs. legacy id) is unclear.

---

## Evidence index

| File | What it is |
|---|---|
| `pw.mjs` | Playwright harness (local Chrome + SwiftShader launch args + `visted` cookie) |
| `evidence/probe1-info.json` | Editor boot: Babylon 6.38, SwiftShader WebGL, globals, canvas |
| `evidence/probe1-requests.json` | Full request list of a boot (script/CSS/assets) |
| `evidence/probe2-api.json` | Exposed API key inventory, first catalog anchors, sliders |
| `evidence/probe3-ui.json` | Dialogs, tool buttons, start-flow |
| `evidence/probe4-scene.json` | Scene after "Start designing": engine, mesh ids, `HP3D` keys |
| `evidence/probe5-api.json` | Live sources of `placeObject`/`instantiateModel`/`seatOnSupport`/`minAreaRect`/`attachGizmo`/… |
| `evidence/probe6-place.json` | Live catalog click on the sofa: resulting mesh + network (single GLB, no Draco) |
| `evidence/probe7-live.json` | First live placement attempt (selection bug) + iframe existence |
| `evidence/probe8-live.json` | Precise live placement (scaling 1.125/0.921/1.121, rotQ 30°, bbox), `minAreaRect`, iframe `FloorplanOrientation` API + executed resolver calls |
| `evidence/probe9-out.txt` | Probe that died on circular JSON from `FloorplanCatalog` before writing any JSON (kept as a record; superseded by probe10) |
| `evidence/probe10-live.json` | Drag-node search, iframe `FloorplanCatalog` live answers (resolveType/frontDeg/wantsWallSnap/designBox), `computeWallSnap`/`snapObjectToWall`, `HPAIPlace` TYPES/`typeOf`/`analyse` |
| `evidence/probe11-2d.json` | 2D planner shell: 50 controls, tool rail, `FloorplanLibrary` 1 776 products, raw catalog item shape, grid/rotation snap globals, `floorplanEditor` wall/opening keys, floor gradients |
| `evidence/probe12-live.json` | `roomMaker`/`makeWall` attempts (no effect on `WALLS`), `snapObjectToWall` returning false for bed/sofa/toilet, `HPAIPlace.solve` empty-plan result, `floorTop`/`ceilingY`/`plausibleScale` |
| `evidence/probe13-draw.json` | Real-Playwright mouse draw on the revealed 2D iframe → still `WALLS.length === 0` (input-gated) |
| `evidence/probe15-behaviors.json` | Live placed mesh carries **two `SixDofDrag`** behaviors after `attachGizmo`; zero `validateDrag` behaviors anywhere in the scene |
| `evidence/probe16-sixdof.json` | `SixDofDrag` config (`disableMovement:true`, `rotateDraggedObject:false`, `dragDeltaRatio:0.2`, `zDragFactor:3`) and all six gizmo managers' state |
| `evidence/probe14-dragnode.json` | Scene-wide behavior scan: `behaviorNodes: []` (the classes are minified, so the name filter missed them until probe15) |
| `evidence/probe*-out.txt` | Raw stdout of the later probes (probe9–16), kept for byte-level audit |
| `evidence/2d-planner.html` | Direct fetch of the 2D planner → HTTP 406 Mod_Security |
| `pw.mjs`, `probe*.mjs`, `extract.mjs` | The harness and probe scripts (reproducible; `extract.mjs` slices snippets out of the round-1 deobfuscated modules) |
| `README.md` | How to reproduce the probes |

Round-1 evidence reused read-only: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/05-05-furniture-catalog/` (`report.md`, `deobf/*.deobf.js`, `hp-boot.json`, `editor-page-raw.html`, `test.glb`).
