# 3D House Planner — Import paths: floor-plan trace-over + scale calibration, DXF/IFC/GLB import, project open

Research job: `08-07d-save-export-share-imports` (Round 2) · CasaPlazAI competitor research · 2026-10-31

**Question.** How does 3D House Planner ingest content: (a) floor-plan image trace-over and its
scale calibration; (b) DXF, IFC and GLB/OBJ/STL/BABYLON model import code paths; (c) the
`.hpbim.json` project open path? Nothing was uploaded, published or submitted.

**Method / reuse.** Round 1 (`…/rea-3dhouseplanner-2026-10/07-07-save-export-share/`) established
the storage model, the `.hpbim.json` envelope, the import dialog inventory, the trace-over `plan`
record and the export formats. This round re-reads that folder's captured, locally de-obfuscated
modules (read-only, no source copied into deliverables), re-runs the local de-obfuscator with a
small alias-detection fix for readable globals, and adds live Chrome captures of the floor-plan
modal, the Import dialog and — for the first time — the **2D planner's own 11 modules**. All claims
are tagged **OBSERVED** (live page or shipped JS + evidence file), **DOCUMENTED** (vendor public
page) or **INFERRED**.

Evidence in this folder: `evidence/01-import-ui.*`, `evidence/02/*.dom.html`, `evidence/03-2dplanner.*`,
`evidence/08-planner-modules.json`, `notes/` (local observation helpers + the 2D planner modules),
`scenarios/` (capture inputs).

---

## 1. Summary

- **Floor-plan trace-over is an image on a Babylon `ground` plane, not a drawing surface.** The
  image is read as a data URL, a `CreateGround("groundplan", {width, height})` plane is created at
  1 cm above the floor, textured with it, and its metadata stamped `planImport:{dataUrl,sourceName}`.
  It is serialised into every project save. *OBSERVED* `evidence/02/settlePlanModal.dom.html`,
  round-1 `bundles/deobf/editor__hp-bim.js`.
- **"Scale calibration" is two 1–100 sliders (metres) typed once before import**, not a
  two-point measure. `#planwidthsize` / `#planlengthsize` (value `50`, step `.1`) set the plane's
  real width/length; the labels read "Image width/length in real scale" and the badges show `50.00 m`.
  The separate **2D planner has no calibration at all** — its "Trace over an image" is a
  viewport-sized CSS background that is never saved. *OBSERVED* `evidence/02/settlePlanModal.dom.html`,
  `evidence/02/importVisible.dom.html`, `evidence/08-planner-modules.json`.
- **The Import dialog is a single multi-file drop zone with one accept list** covering project,
  IFC, DXF, model, image *and* model sidecars (`.bin .mtl .ktx2 .tga .bmp .dds`), plus two options:
  "Import onto level" and "DXF wall thickness (cm)" (default 20, min 2, max 80). *OBSERVED*
  `evidence/02/importVisible.dom.html`.
- **DXF is converted server-side** (`POST api/bim.php {action:"dxf-import"}`, raw DXF text); the
  client only replays the returned `walls[]` through its own wall builder. IFC is parsed entirely
  client-side with `web-ifc` (pinned CDN `web-ifc@0.0.66`), GLB/glTF/OBJ/STL/BABYLON via Babylon's
  `SceneLoader.ImportMesh`. *OBSERVED*
- **Project open is format-gated on `format:"hp-bim"`**, then either (i) re-lays whatever fits into
  the current scene, or (ii) detects a floor-size mismatch and stashes the file in IndexedDB under
  the reserved id `__reopen__` with a `sessionStorage` breadcrumb before `location.reload()`.
  Restore is per-element and counted: failures are reported and a recovery copy is kept. *OBSERVED*

## 2. Findings

### 2.0 Carried over from round 1 (not re-derived)

Round-1 F1 (IndexedDB `hp-bim` v2, `projects` + `index` stores), F3 (`.hpbim.json` envelope), F10
(import dialog groups/formats), F11 (trace-over `plan` record), F12 (AI vectoriser), F14 (share) are
taken as read and only extended below. Round-1's Unknowns that touch this question are closed in
§2.6 (project open) and §2.8 (the 2D planner's own trace-over).

### 2.1 Floor-plan trace-over: the image underlay — OBSERVED

Two different doors lead to a plan underlay, and they share one implementation.

**Door A — "Import floor plan"** (File menu → `data-hp-open="modalplan"`, i.e. `#modalplan`, "Bring
in a floor plan"). The modal (`evidence/02/settlePlanModal.dom.html`) has two panes selected by a
segmented control (`data-plan-mode="upload"` / `"ai"`):

- *Upload image*: `#fileplan` with `accept="image/*"`; hint "Supported formats: JPG, PNG, BMP, GIF
  and SVG." (string `plan.formats`). The `onchange` handler whitelists exactly
  `png jpg jpeg bmp svg gif` and otherwise toasts `fx.wrongExtension` ("Unsupported file type").
  The file is read with `FileReader.readAsDataURL`, so the underlay lives in memory as a data URL.
- *Generate with AI*: `#aiPlanPrompt`, `#aiPlanModel` (7 text-to-image models exposed in the live
  DOM: GPT Image 2 / 2.5 Flare / 2.5 Sunburst, Gemini 3.1 Flash / Flash Lite / 3 Pro Image, Grok
  Imagine Image 2.0), `#aiPlanQuality`, preview `<img id="aiPlanPreview">`, `#generateAiPlan`,
  `#applyGeneratedPlan` (disabled until a preview exists). Footnote literally "text-to-image AI".
  This is a third-party call (Puter) — **out of scope, not exercised.**

**Door B — the generic Import dialog** (`[data-fileact="import"]`) also accepts `png jpg jpeg webp`
and routes them to the same underlay function.

**The underlay itself** (function reads `width`/`length` options or falls back to the two sliders):
a `BABYLON.MeshBuilder.CreateGround("groundplan", {height, width})` at `y = floorTop + 0.01`
(hard-coded 1 cm lift to avoid z-fighting with the slab), a `StandardMaterial` whose
`diffuseTexture` is the image data URL, `backFaceCulling` off, and
`mesh.metadata.planImport = {dataUrl, sourceName}`. Exactly one live `groundplan` mesh is kept:
the function disposes any previous one (including its material/texture) before creating the next.
Selecting the mesh in the 3D view reveals a contextual pill "AI floor plan converter"
(`#generate-floorplan`, hidden otherwise). *OBSERVED*

**Why the 1 cm offset matters:** the underlay is a *scene object*, so it is pickable, can be moved /
rotated / scaled by the normal transform gizmos, and is visible in 3D — not an overlay confined to
a 2D canvas.

### 2.2 Scale calibration — two sliders, fixed at import time — OBSERVED

- Live DOM: `<label for="planwidthsize">Image width in real scale</label>` +
  `<output id="planwidthvalue">50.00 m</output>` + `<input type="range" value="50" min="1" max="100" step=".1">`;
  the length pair is `#planlengthsize` / `#planlengthvalue`, identical range defaults.
- The import function takes `width`/`length` from the passed options **when > 0** (project restore,
  AI path), else from `$("#planwidthsize").val()` / `$("#planlengthsize").val()`. If either is
  falsy it refuses with `fx.planDims` ("Please set valid plan dimensions first.").
- The badge updater (`editor__hp-app`, function `_0x1d9ca2`) rewrites both badges on unit change as
  `(sliderValue * unitsconver).toFixed(2) + " " + selectedunits`, so the same slider reads
  `50.00 m` or ~`164.04 ft`.
- There is **no** user-facing instruction to measure a known line, no two-click calibration tool in
  the DOM, and no "known dimension" input. The user estimates the real-world extent of the image in
  metres and types it into the sliders. `groundplan` is then free to be re-scaled afterwards with
  the normal scale gizmo; the resulting `scaling` vector is what gets saved.
- Persisted calibration = the world-space bounding box of the mesh: the serializer stores
  `width = 2*extendSize.x`, `length = 2*extendSize.z` (so it captures both the creation size and any
  later scaling), plus `p` (position xyz), `q` (quaternion xyzw), `s` (scaling xyz) and `visible`.
  On open it recreates the plane and re-applies p/q/s.

*Note.* The "plan" underlay is separate from the *2D planner* (`2D-Planner/index.php`, an iframe) and
from the AI vectoriser. The vectoriser works on the same bitmap: it letterboxes the image onto a
canvas, detects ink/line structure (`workScale`, `wallThicknessPx`, skew in degrees reported in its
`meta`), optionally verifies with an AI model, and returns wall segments that the editor maps back
through the *underlay's own* world bounding box
(`x*W/imgW + plane.x − W/2 + dx/2`) — i.e. the calibration comes from the underlay plane, never from
the image's DPI. *OBSERVED*

### 2.3 DXF import: "lines become walls", converted on the server — OBSERVED

Dialog label in the Import dialog: **"DXF plan: lines become walls"** (`io.fmt.dxf`), with the
option **"DXF wall thickness (cm)"** (`io.dxfThickness`, number, min 2, max 80, step 1, default 20).
The default is not hard-coded: it is `round(100 * HP3D.defaultWallThickness())` and is persisted in
`localStorage["hp-io-import"]` (`{thickness}`), so a user's last DXF thickness survives reloads.
On import the value is clamped: `max(0.02, min(0.8, (Number(thickness) || 20) / 100))` metres.

Code path (all in `editor/hp-bim`):

1. extension `dxf` → read the **whole file as text** (`FileReader.readAsText`, fallback
   `file.text()`);
2. `serverCall("dxf-import", model=null, {thickness}, {dxf:<text>})` → `POST api/bim.php`
   (`Content-Type: application/json`, `credentials: same-origin`; bodies ≥ 64 KiB are gzip'd via
   `CompressionStream` and flagged with header `X-HP-Encoding: gzip`; 25 MB cap → `io.tooLarge`);
3. the response `{walls:[{a:[x,z], b:[x,z], thickness}]}` is replayed: for each wall,
   `HP3D.buildWall({x1,z1,x2,z2,thickness, silent:true})`; `silent` suppresses per-item
   normalisation; increments a counter;
4. toast `bim.dxfWalls` — "{n} walls created from the DXF lines" — then `cutwalls()` and an
   `emit("created",{kind:"wall",count:n})`, and the caller refreshes the UI.

There is **no DXF parser in the client bundle** (no `ENTITIES` / `LWPOLYLINE` / `POLYLINE` strings
anywhere). The server converts polylines/lines into straight wall segments; the client has no
arc/bulge handling for imported DXF (unlike the 2D-planner bridge, which does carry `bulge`).
DXF import is "onto the chosen level" only, has no layer chooser, no unit chooser and no preview
step. *OBSERVED* (response shape is read from the client's consumption code; the server itself was
not called).

### 2.4 IFC import: client-side web-ifc, units/elevations honoured — OBSERVED

Code path (`editor/hp-bim`):

1. extension `ifc` → lazily inject `<script src="https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js">`
   (toast `bim.ifcLoading` "Loading the IFC engine…"), `new WebIFC.IfcAPI()`,
   `SetWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/", true)`, `await Init()`. The API
   instance is memoised for the session;
2. `OpenModel(bytes, {COORDINATE_TO_ORIGIN:true})` on an `ArrayBuffer`, then `CloseModel` in a
   `finally`;
3. **unit scale**: reads `IFCUNITASSIGNMENT` → `LENGTHUNIT`; supports `IFCSIUNIT` prefixes
   (EXA…NANO) and `IFCCONVERSIONBASEDUNIT` with names matching `FOOT|FEET` → 0.3048,
   `INCH` → 0.0254, else the `ConversionFactor.ValueComponent`; falls back to 1;
4. **storeys**: `IFCBUILDINGSTOREY` → `{guid, name(LongName||Name), elevation = Elevation*scale,
   minY, count}`, i.e. each storey becomes a floor level;
5. walks every product line once, building relation maps
   `psets / type / material / container / parent / voidHost / fillOpening` via `IFCRELDEFINESBYPROPERTIES`,
   `IFCRELDEFINESBYTYPE`, `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELVOIDSELEMENT`,
   `IFCRELFILLSELEMENT`, then `IFCSPACE` for rooms and `IFCRELAGGREGATES`-style parent chains;
6. class names are normalised (strip `STANDARDCASE`, map `IFC…` → friendly names — the code carries
   a long `IfcWall/IfcSlab/IfcRoof/IfcDoor/IfcWindow/IfcFurniture/IfcColumn/IfcBeam/IfcStair/…`
   table, plus `IFCANNOTATION`, `IFCVIRTUALELEMENT`, `IFCCURTAINWALL`);
7. **properties are read under a wall-clock budget**: it loops up to 60 000 property sets, yields to
   the event loop every 150 items, and stops at 120 000 ms, toasting `bim.ifcPropsTruncated` if it
   truncates. Progress toasts: `bim.ifcProps` "{n}/{total}".
8. **georeferencing**: `IFCSITE` (GlobalId/Name/RefLatitude/RefLongitude/RefElevation with DMS→
   decimal), `IFCMAPCONVERSION` (Eastings/Northings/OrthogonalHeight/XAxisAbscissa/XAxisOrdinate/Scale)
   and the `TargetCRS` (Name/Description/GeodeticDatum/VerticalDatum/MapProjection/MapZone) become a
   `georef` record; if the project has no site yet, it is filled from that.
9. storeys are re-centred; a machine-readable note is stored:
   `"offset = coordinates removed by the re-centring (Babylon x, y, z): original = babylon + offset (x, z); each storey moved by dy; coordination = web-ifc move to origin"`,
   and `GetCoordinationMatrix()` is captured into `georef.coordination` when available.
10. if any imported element is a door/window, `cutwalls()` runs; then
    `emit("imported",{file,count})` and toast `bim.imported` "{name} imported ({n} elements)".

Import destination level is chosen in the dialog (`data-imp="level"`); the importer calls
`setLevel(level)` first if it differs from the current one. *OBSERVED*

### 2.5 GLB/glTF/OBJ/STL/BABYLON import: Babylon SceneLoader with an id-repair layer — OBSERVED

- Accepted extensions in the client (`_0x3fcad6`): **`glb`, `gltf`, `obj`, `stl`, `babylon`**;
  sidecar extensions allowed when the same drop contains a model file
  (`_0x34a0ce`): `bin, mtl, png, jpg, jpeg, webp, ktx2, tga, bmp, dds`. Multi-file drops are
  supported deliberately (`io.dropHint`): "Several files at once: a .gltf with its .bin and
  textures, an .obj with its .mtl…".
- Before import it copies the dropped files into `BABYLON.FilesInputStore.FilesToLoad` keyed by
  **lower-cased filename**, which is what lets a `.gltf` find its `.bin`/textures by relative URI.
- Import itself is `BABYLON.SceneLoader.ImportMesh("", "", file, scene, cb, progress, error)` — the
  file object is passed directly, so no server / object-URL round trip.
- On success every mesh is walked and **renamed into the editor's internal vocabulary** so the rest
  of the app can treat imported geometry like native geometry: `wall_merged`, `csg2`, `door_window`,
  `door_window_binding_ref`, `4poly`, `wallslaves`, `polyt1/2/3`, `ground2imp`, and everything else
  becomes `objmeshes` with its root freed and added as a shadow caster. Parent/child groups with
  >4 children are merged with `Mesh.MergeMeshes(..., disposeSource=true, mergeMultiMaterials=false,
  subdivideWithSubMeshes=false, multiMultiMaterials=false)`. Materials get id `pbr`. Meshes with no
  position vertex data are logged as "problems with: <name>".
- There is a second, separate path for a file dropped **onto the 3D canvas** (`io.dropCanvas`
  "Drop to import into the scene"), with a `hp-io-canvas-drop` overlay in the editor DOM.
- `.gltf` **export** uses Babylon `GLTF2Export` plus `HPGltf` (Draco/Meshopt via gltf-transform
  loaded from jsDelivr, optional fflate zip) — import does not use those.

Note: a *dropped* model lands as ordinary scene meshes (id `objmeshes`), i.e. it is scenery, not a
house: no walls/floors are extracted, no BIM data is attached. *OBSERVED*

### 2.6 Project open (`.hpbim.json`) — recall, replace, resize, recover — OBSERVED

Dispatch: extensions `json` and `hpbim` both enter the project branch. The client accepts an
`.hpbim.json` file, but also a bare `.json` whose top level has `format: "hp-bim"`; anything else
raises `bim.unknownJson` — "Unknown JSON file: only 3D House Planner projects (.hpbim.json) can be
imported." (this closes round-1's open question about how a wrong JSON is rejected).

Order of operations for a valid file:

1. `JSON.parse(await file.text())`, check `format === "hp-bim"`.
2. If the scene is dirty (`saveSeq`/unsaved flag) show a confirm dialog `bim.confirmImport`:
   "Open \"{name}\"? It replaces the current scene; unsaved changes will be lost." with OK button
   `bim.openBtn` ("Open"). Cancel returns `{kind:"cancelled"}`.
3. **Floor-size reconciliation.** `needsResize(file)` returns true when the file's
   `settings.floorSize` differs from the live `#floorsize` input by more than **0.5** (metres).
   If so, a second dialog `bim.resizeTitle` / `bim.confirmResize` offers "Reload" vs "Keep size":
   * Reload ⇒ the parsed JSON is stringified and stored in IndexedDB under the **reserved id
     `__reopen__`** (`{id:"__reopen__", name, created, updated, size, data, thumbnail:null}`), a
     `sessionStorage["hp-resume-after-reload"]` breadcrumb is written with
     `{id, at, floorHeight, floorSize, units, name}`, and the page does `location.reload()`; on boot
     the breadcrumb is valid for **600 000 ms (10 min)**, the `__reopen__` record is
     `getProject(id)`-ed back and applied, then deleted (`__reopen__` is the throwaway; `__recovery__`
     is the autosave safety net).
   * Keep size ⇒ fall through to the in-place apply, which re-scales coordinates to the current grid.
4. `applyProject(json)` — the actual open:
   - resets `HPSync` state, then applies `settings.floorHeight` (dispatching an `input` event),
     `units` (`HPUnits.set`), night/light checkbox;
   - `HPSun.setState`, `HPCameraTour.setState`, `HPMeasure.setState`, `HPEfficiency.setState`;
   - loads `levels`, `budget` (with `prices`), `georef`, `levelInfo`, `site`, `norms`,
     `classification`, `ifc` (`{schema:"IFC4", costSchedule:false, …}`), `types`;
   - **element-by-element** restore: skirting/ceiling-trim entries are deferred to a second pass;
     every other element is `await`-restored inside `try/catch`, each failure incrementing a
     `failed` counter and `console.warn("Element could not be restored", el)`;
   - then `terrain`, `cutwalls()`, the deferred trims, then the plan underlay via
     `planImportRestore`, which itself can add to `failed`;
   - camera `alpha/beta/radius/target`, `settings.level` via `setLevel`, `HPSync.setState`,
     `settings.renderMode` via `HPRender.setMode`;
   - project name normalisation: any localised "Untitled project" string is blanked, then
     `HPUI.setProjectName`;
   - the persisted `check` result is re-bound to live meshes by GUID (skipping `wall_cut`) and
     `stale`/`at` restored — so a saved model-check report survives round-tripping;
   - `refreshVisibility()`, `emit("projectLoaded",{name})`.
5. Failure reporting is granular, not all-or-nothing:
   `bim.restoreFailed` — "{n} element(s) could not be restored. The stored project is kept as it
   was: your changes go to a recovery copy until you save."; and `bim.partialNote` — "Some elements
   could not be restored: autosave keeps a recovery copy and does not overwrite this project until
   you save." (string `bim.restoreFailed` / `bim.partialNote`). The project opened from a file is
   always marked `stored:false`, so the next autosave is written to the recovery slot rather than
   over any existing library entry.

Other open paths share `applyProject`: the Projects panel ("Open…" with `bim.confirmOpen`), and
`app.php?share=<32 hex>` which fetches `api/share.php?id=…` (404 → "not found"), rejects payloads
whose `format !== "hp-bim"`, and opens read-only. *OBSERVED*

### 2.7 Adjacent importers (context, not the asked question) — OBSERVED

The BIM tab owns three further file imports, all client-side, none in the Import dialog:
**BCF** (`data-act="bcf-import"`, `.bcf/.bcfzip/.zip` → `bim.bcfLoaded` "{n} topics"),
**classification codes** (`cltable-import`, `.csv/.tsv/.txt` → `bim.codesImported`), and a
**unit-price table** (`pricetable-import`). The terrain colour-map import is a sibling of the plan
import (`#modalheightmap`, same upload/AI structure, plus `#aiHeightmapQuality`, and the vectoriser
style letterboxing). *OBSERVED*

### 2.8 The 2D planner's own trace-over: no calibration, not persisted — OBSERVED

The 2D planner was captured for the first time this round (11 modules, incl. `planner-main` 502 KB,
`uiShell`, `bridge3d`, `floorplanEditor`, `qSVG`, `objectCatalog`), which closes round-1's Unknown.
It has a **separate, much weaker** underlay than the 3D editor:

- Its File menu has "Trace over an image…" (`menu.traceImage`), wired to a hidden
  `#extension-floorplanner-upload-background-image` file input that — unlike the 3D editor's
  `#fileplan` — has **no `accept` attribute** and no extension whitelist.
- The handler (`readFileURL()`) reads the file with `FileReader.readAsDataURL` and assigns it as a
  CSS `background-image` on `#extension-floorplanner-svg-container-bg-image`, setting
  `opacity = .3` and a `manual_bg_upload` flag. That element is `position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh` with `background-size: contain; background-repeat: no-repeat;
  background-position: center` (from `2D-Planner/css/style.css`). The image is therefore stretched
  to the **viewport**, not to plan coordinates.
- There is **no width/length field, no two-point measure and no calibration UI at all** in the 2D
  planner: the string `calibrat` does not occur anywhere in its HTML, its i18n dictionary (905
  entries) or its scripts, and the only scale constant is a fixed `meter = 0x3c = 60` px used to
  convert between model units and pixels (`formatLength(x)` renders `x/meter*units.factor`).  Hovering
  a saved-plan card also previews that plan's own SVG in the same element when `manual_bg_upload` is
  false, so the same slot is a hover-preview and a manual trace image.
- The trace image is **not persisted**: a saved plan record is
  `{index, name, svg_data, floorplan}` (`save_to_floorplans()`), and the 2D project export is
  `{floorplans, settings}` (`export_project()` → `floorplanner-project.json`) — no background-image
  field, no position, no scale. The manual trace image is gone on reload; only the plan geometry
  survives.
- The 2D planner's own project open is `JSON.parse` + a loose shape check
  (`typeof obj.floorplans === "object"`, `typeof obj.settings === "object"`), stored under
  `localStorage["extension-floorplanner-floorplans"]`, and on failure a plain
  `alert(dlg.importFailed)` — no `format` gate, no version. Its own SVG export clones the live
  `<svg>`, strips the grid/scale/bind helper groups, forces the area and measure groups visible and
  saves `floorplanner.svg`.

**Consequence for the comparison.** The 2D planner is a *drawing* surface with a fixed 60 px/m grid
and a faint, non-persistent underlay; the 3D editor is the only place where a floor-plan image is a
real, measurable, persisted scene object with scale calibration. The two share nothing but the file
picker UI. This makes the 3D underlay's two sliders (§2.2) the *only* calibration mechanism in the
product. *OBSERVED*, `notes/2d/planner__{planner-main,uiShell,floorplanEditor,bridge3d}` and
`notes/2dplanner.html`; capture `evidence/08-planner-modules.json`.

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort, each tied to a finding above, and to the CasaPlazAI schema where relevant.

1. **Two-slider scale calibration for the blueprint underlay (cheap, high value).** §2.2 shows the
   competitor solves calibration with two 1–100 m sliders rather than a two-point measure. CasaPlazAI
   already has a blueprint underlay and a 0.5 m grid: adding *underlayWidthM* / *underlayLengthM*
   numeric inputs (default = grid-derived) plus a live "grid squares across" read-out gets 90 % of
   the accuracy for a fraction of the work. Store the two numbers in the existing underlay record
   (mirroring round-1's `plan:{width,length,p,q,s,visible}`), not the image DPI.
   *(effort S, value high)*
2. **A "known dimension" refinement on top of the sliders.** Once (1) exists, a two-click
   "click wall A, click wall B, type its real length" tool is ~1 extra day and makes the calibration
   exact for traced plans. Keep the sliders as the fallback.
   *(effort M, value high)*
3. **Make the underlay a real scene object.** §2.1 shows the underlay is a textured Babylon ground
   plane at floor+1 cm, pickable and transformable with the normal gizmos, and serialised with
   p/q/s. CasaPlazAI's underlay is deliberately editor-local (`casaplaza.underlay.v1`,
   `{[floorId]: UnderlayState}`, absent from `FloorplanData`), so this is *not* a schema change —
   but widening `UnderlayState` from a canvas-only image to a placed record with position, rotation,
   scale and opacity, and rendering it in the 3D viewer as an option, gives trace-over the same
   durability the competitor has without touching the frozen interchange contract.
   *(effort M, value high)*
4. **One multi-file drop zone instead of per-format pickers.** §2.5/§2.3: the competitor accepts
   project + IFC + DXF + model + image + sidecars in one `multiple` input with a single `accept`
   list, matches sidecars by lower-cased filename against `FilesToLoad`, and annotates each
   supported group with an icon, a name and an extension list. A CasaPlazAI import card that accepts
   images (+ SVG) and a plan-JSON drop and routes by extension is a small UI change with a large
   perceived-capability gain.
   *(effort S, value medium-high)*
5. **Format-gate the project JSON and give a precise error.** §2.6: reject anything without
   `format:"hp-bim"` with one clear message instead of a parse failure. For CasaPlazAI, validate
   `schemaVersion` the same way and tell the user the file is "a CasaPlazAI plan of a newer version"
   vs "not a CasaPlazAI plan" — a one-file change in the loader.
   *(effort S, value medium)*
6. **Granular, counted restore with a recovery copy.** §2.6's per-element try/catch + `failed`
   counter + "kept as it was, your changes go to a recovery copy until you save" is a strong
   robustness/trust pattern. CasaPlazAI autosaves to localStorage already: adding an
   `importFailedCount` toast and a "recovery copy" slot on partial load is low-effort insurance
   against schema drift between app versions.
   *(effort S–M, value medium-high)*
7. **Per-level import and a remembered DXF wall thickness.** §2.3: the dialog exposes "Import onto
   level" and "DXF wall thickness (cm)" (2–80, last value persisted in localStorage), so re-importing
   a CAD layer is a two-click loop. Worth copying if/when CasaPlazAI adds CAD import; the
   *remember-last-option* pattern is worth copying even sooner (grid step, wall thickness, floor
   height).
   *(effort S, value medium)*
8. **Do NOT copy the server-side DXF conversion.** §2.3 shows DXF is parsed on the vendor's server,
   which contradicts CasaPlazAI's no-backend constraint. If DXF support is ever wanted, use a
   client-side parser and restrict to LINE/LWPOLYLINE → walls; the UX lesson (one thickness input,
   "lines become walls", report the wall count) transfers without the architecture.
   *(effort L, value low until asked)*
9. **Multi-file sidecar handling is the hard part of glTF import — plan for it.** §2.5: `.gltf`
   needs its `.bin`/textures in the same drop; the competitor pre-seeds `FilesToLoad` by lower-cased
   name and accepts `ktx2/tga/bmp/dds`. If CasaPlazAI imports glTF, budget for that pre-seed step
   and for a friendly "add the .bin file too" message rather than a silent failure.
   *(effort M, value medium)*
10. **Persist the underlay in the 2D editor too — the competitor's biggest trace-over gap.** §2.8
    shows the 2D planner's trace image is a viewport-stretched CSS background that vanishes on reload
    and is not in the exported project. CasaPlazAI already keeps the underlay per floor under
    `casaplaza.underlay.v1` (`{[floorId]: UnderlayState}`); keeping it *shared* between the 2D
    editor and the 3D viewer, or at least persisting the same `{image, widthM, lengthM, offset,
    rotation, opacity}` record in both, is a direct differentiator that the competitor explicitly
    does not have. Note the schema already ratifies graceful omission from `FloorplanData` for share
    links, so this is an editor-local win, not a schema change.
    *(effort M, value high)*
11. **Show a live grid count, not raw metres, in the calibration control.** §2.8's insight is that
    the competitor's 2D side has a *fixed* 60 px/m so users think in grid cells, while the 3D side
    makes users type absolute metres blind. A CasaPlazAI slider that displays "≈ 12 × 9 grid squares
    (6.0 × 4.5 m at 0.5 m)" removes the unitless guesswork the competitor forces on users, at the
    cost of one derived label.
    *(effort S, value medium)*

## 4. Unknowns

- **DXF import does not exist in the 2D planner.** Its File menu offers only project `.json`, SVG
  image and a background image; there is no DXF/SVG *import* on the 2D side (SVG is export-only).
  So CAD import lives exclusively in the 3D editor's server-backed path — which is the one thing
  CasaPlazAI cannot copy as-is.
- **DXF server algorithm and its exact response contract.** Only the client's consumption of
  `{walls:[{a,b,thickness}]}` is observed; how the server decides which lines are walls, closes
  corners, snaps to a grid or handles arcs/inserts/layers is unknown (deliberately not exercised —
  it would mean uploading a file).
- **The 2D planner's modules are captured and read, but not its runtime.** Findings in §2.8 come
  from the shipped modules and HTML; the live trace-image flow (image sizes, viewport stretch at
  non-16:9 aspect) was not driven interactively, and `floorplanEditor`/`qSVG` were read only for
  scale constants.
- Exported-project sizes and behaviour at extremes (very large plan images, 50 levels, >25 MB DXF)
  were not measured.
- The `.babylon` import path is accepted by the extension list but was not exercised; how its scene
  hierarchy is renamed into the editor's vocabulary is inferred from the shared callback.
- `applyProject`'s per-element restore was read, not executed: which element kinds are most likely
  to fail a restore (schema drift) is not measured.
- The exact `api/share.php` payload shape (only the `format:"hp-bim"` check was observed) and
  whether the `__reopen__` reload path is used for share links too.

### Source index

- Vendor pages (**DOCUMENTED**): https://www.3dhouseplanner.com/ (FAQ q3: "export IFC4, DXF,
  GLB/glTF, OBJ, STL, SVG and CSV… and import IFC, DXF, GLB, OBJ, STL and images of…"),
  https://www.3dhouseplanner.com/app.php, https://www.3dhouseplanner.com/2D-Planner/index.php.
- Local evidence (**OBSERVED**): `evidence/01-import-ui.json`, `evidence/02/*.dom.html`
  (`settlePlanModal`, `importVisible`), `evidence/03-2dplanner.json`,
  `evidence/08-planner-modules.json` (2D-planner modules: `planner-main`, `uiShell`, `bridge3d`,
  `floorplanEditor`, `qSVG`, `objectCatalog`, `symbols`, `objectPalette`, `i18n`, `orientation3d`,
  `donate`); locally de-obfuscated copies under `notes/2d/*.deobf.js` and the live 2D planner HTML
  at `notes/2dplanner.html`; round-1 folder `bundles/js/*` + `bundles/deobf/*` and its `report.md`
  F1–F16; local helpers in `notes/`.
- Round-1 sources reused verbatim: `…/rea-3dhouseplanner-2026-10/07-07-save-export-share/{report.md,sources.json}`.
