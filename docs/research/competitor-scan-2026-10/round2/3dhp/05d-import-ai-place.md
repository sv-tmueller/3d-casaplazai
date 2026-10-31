# 3D House Planner — Custom Model Import + HPAIPlace Placement Scorer (Round 2)

Job: `10-05d-furniture-catalog-import-ai` · Target: https://www.3dhouseplanner.com/ (editor `/app.php`, 2D planner `2D-Planner/index.php`)
Round-1 base: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/05-05-furniture-catalog/report.md` (read-only, reused)
Method: static reading of the shipped (obfuscated) modules copied from round 1 into `evidence/`, plus **execution of `HPAIPlace` itself** in `node`/`vm` against a synthetic scene and the real catalog titles. One live page load of `app.php` was captured too, to check which File/import UI actually exists on a fresh visit (§2.1).

Legend: **OBSERVED** = seen in a capture, in shipped bytes, or in the output of a program I ran (evidence file named) · **DOCUMENTED** = stated on a vendor page (URL) · **INFERRED** = my deduction, not directly measured.

I read the code and ran it; **I did not call any AI feature, create an account, or upload a file.** Every claim below carries one of the three tags. The one page load I performed was an unauthenticated GET of the public editor with the site's own `visted=1` cookie (the same cookie the site sets for any visitor); no form was submitted, no file was dropped into the live page, and no AI endpoint was touched.

---

## 1. Summary

- **Two independent import paths exist and they gate different extensions.** The editor's low-level `HP3D.importFile(File)` accepts `babylon|glb|gltf|obj|stl` only; the user-facing dialog (`openImportDialog` → `HPBIM.importFiles`) additionally accepts `json|hpbim|ifc|dxf|png|jpg|jpeg|webp` plus the sidecar set `bin|mtl|png|jpg|jpeg|webp|ktx2|tga|bmp|dds`. IFC is parsed by the in-browser **web-ifc** WASM via `IfcAPI.OpenModel(bytes,{COORDINATE_TO_ORIGIN:true})`; DXF is parsed **server-side** (`HPBIM.importFiles` posts the bytes and calls the parser service, receiving a wall list with `a`,`b`,`thickness`). (OBSERVED: `evidence/hp-editor.pretty.js`, `evidence/hp-bim.pretty.js`)
- **Nothing is uploaded for 3D models, nothing enters the catalog, and the model loaders are deliberately separate.** `SceneLoader.ImportMesh` is called three different ways — an uploaded `File` object (`importFile`, root `''`), a cached catalog *template* path (`loadModelTemplate`/`instantiateModel`, with a bounding-box-centre bake and a `Map` cache), and the 2D-bridge `admin/objects/` path. None writes to the catalog. After load, meshes are re-tagged by *name* (`wall_merged`, `objmeshes`, `door_window`, …) and registered via `registerElement`, so an imported object behaves exactly like a catalog item (same `objmeshes` id, same gizmo, same save/export path); only node names containing the magic tokens become walls/doors. Persistence is the project save only — `io.localNote` says *"Files are created in your browser."* (OBSERVED: `evidence/hp-editor.pretty.js`, `evidence/editor-page-raw.html` i18n)
- **HPAIPlace is a 57-entry rule table plus a soft scorer; it never throws on a bad placement.** `solve()` returns a `{x,z,y,y0,y1,facing,rule,warnings,hard,support…}` record. Instead of failing it walks a fixed candidate lattice (0.15 m centre grid × 2 orientations; 0.1 m wall sampling × 2 inward normals; 16-angle radial nudge rings 0.1→1.6 m), picks the minimum-cost wall/centre candidate, and returns the best-effort result with a warning if nothing is clean. Two sub-paths are *first-fit* rather than best-fit: the relation lattice (`beside/front_of/around/on`) returns the first candidate with no hard problems, and the numeric-position branch nudges outward from the asked point and returns the first free ring. (OBSERVED, run: `evidence/hp-ai-place.pretty.js`, `evidence/aiplace-solve-results.json`)
- **The scorer is a weighted sum with one quantised asymmetry.** Hard problems (`wall`, `outside_room`, `object`, `door`) contribute `20` each; a window overlap is *hard* for `tall` furniture but only *soft* (`2.5`) otherwise; `nearWindow` gives a `−1` bonus; `avoidDoorWall` gives a `+2.5` penalty; corner-seeking adds `1.2·min(dist-to-each-end)`; wall-length preference adds `0.6`/`0.15` per metre of unused wall. Overlap uses a **separating-axis test on the 4 box axes with a fixed `0.02 m` tolerance** (a gap must exceed `0.02` to be clean: my scan reports `overlaps e<id>` at gaps `0, 0.01, 0.015, 0.019, 0.0199, 0.02` and clean from `0.0200001` up — exactly `0.02` lands on the overlap side because the comparison is `>=` and the candidate coordinate is a float sum); the per-type `clear` is a separate *soft* clearance strip in front of the item (ghost box of depth `clear`), scoring `+2` per object it overlaps and `+1.5` per probe inside a wall. (OBSERVED, run: `evidence/hp-ai-place.pretty.js`, §2.7)
- **The rule table is deliberately best-effort and interplay-limited.** 965/1776 catalog titles classify; 811 fall through to `null` (no type). `outdoor` and `modular` are **never read by `hp-ai-place.js` at all**, and `prio` is only read by `hp-ai-chat.js` (placement ordering); `clear`, `flat`, `tall`, `back`, `elev`, `avoidDoorWall`, `nearWindow` and `fallback` are the keys the scorer itself uses. (OBSERVED, run: `evidence/aiplace-classify.json`, `evidence/hp-ai-place.deobf.js`)

## 2. Findings

### 2.1 Two import entry points, one extension gate each

**OBSERVED** (`evidence/hp-editor.pretty.js` @ `importFile`; `evidence/hp-bim.pretty.js` @ `_0x1cce2a` / `_0x4e75d6` / `_0x5dd0dd`).

| | `HP3D.importFile(File)` | `HPBIM.importFiles(FileList, opts)` / Import dialog |
|---|---|---|
| Gate | `['babylon','glb','gltf','obj','stl'].indexOf(ext) !== -1`, `ext = name.split('.').pop().toLowerCase()` | `_0x52d5cb = ['json','hpbim','ifc','dxf'].concat(_0x3fcad6, images)` where `_0x3fcad6 = ['glb','gltf','obj','stl','babylon']`, `_0x3aab2a = ['png','jpg','jpeg','webp']` |
| Sidecars | none | `_0x34a0ce = ['bin','mtl','png','jpg','jpeg','webp','ktx2','tga','bmp','dds']` (only accepted when a model file is also in the same drop) |
| What it does | Babylon `ImportMesh`, name re-tagging, `registerElement` | Dispatch by extension: `.json`/`.hpbim` → project restore; `.ifc` → web-ifc; `.dxf` → server parser; images → `importPlanImage` (trace underlay); models → `HP3D.importFile` |
| Returns | `Promise<mesh[]>`, rejects `new Error("Unsupported 3D model: ."+ext)` | `Promise<result[]>` with `{kind:'project'\|'ifc'\|'dxf'\|'plan-image'\|'model'\|'error', …}` |
| Uploads? | **No** — the `File` object is passed straight to `SceneLoader` | `.ifc` bytes and `.dxf` text go to the app's own parser endpoint (`_0x240c6f('dxf-import', …)`); model files do not leave the browser |

**The advertised format list** matches the dialog, and the on-screen type strip is `_0x19974c = [['project','save','.hpbim.json'], ['ifc','account_tree','.ifc'], ['model','view_in_ar','.glb .gltf .obj .stl .babylon'], ['dxf','architecture','.dxf'], ['image','image','.png .jpg .webp']]` — i.e. the UI groups the five 3D formats under one "3D models" card. (DOCUMENTED landing page: https://www.3dhouseplanner.com/ FAQ lists IFC/DXF/GLB/glTF/OBJ/STL import; OBSERVED in shipped bytes for the exact arrays.)

Dialog behaviour (`_0x5dd0dd`): a drop-zone (`role="button"`, `tabindex=0`, Enter/Space = open picker, `dragenter/dragover/dragleave/drop` handlers toggling `.hp-over`), `multiple` file input with `accept=".json,.hpbim,.ifc,.dxf,.glb,.gltf,.obj,.stl,.babylon,.png,.jpg,.jpeg,.webp,.bin,.mtl,.ktx2,.tga,.bmp,.dds"`, an **"Import onto level"** `<select>` (default = current level) and a **"DXF wall thickness (cm)"** number input (i18n `io.dxfThickness`, `min=2 max=80 step=1`, default `20`, converted to metres and clamped to `[0.02, 0.8]` as `(Number(v)||20)/100`). Import height is a per-session preference persisted to `localStorage`, not to the plan. The footer has a lock icon plus `io.localNote` = *"Files are created in your browser."*, an `io.cancel` button and an `io.choose` = "Choose files" button. The five format cards render as `io.fmt.project`="Project", `io.fmt.ifc`="IFC (BIM)", `io.fmt.model`="3D models", `io.fmt.dxf`="DXF plan: lines become walls", `io.fmt.image`="Plan image to trace". (OBSERVED: `evidence/hp-bim.pretty.js`, `evidence/editor-page-raw.html`)

**How the dialog is reached.** Not from a hard-coded button: the whole BIM bootstrap `_0x521477()` is guarded by `if (HPUI && project && !hpBimPanel)`, and *inside* it the module creates the BIM panel plus the **File popover** (`createPopover({id:'hpFileMenu', width:320})`) and the toolbar button (`addTool({id:'hpToolFile', icon:'folder', label:i18n('bim.file'), title:i18n('bim.fileTip'), order:5, onClick: … _0x17f808(); popover.toggle(anchor)})`). The `_0x17f808()` menu-body builder runs `if (popover)` and is also what the toolbar click calls first — and the popover body is the `data-fileact` menu: `new / open / save / saveas / [share] / sep / **import** / importFloorPlan / importColorMap / export / export chips / recent projects`. The import item's own caption is `i18n('bim.import')` = *"Import…"* with the sub-label *"IFC, DXF, GLB, OBJ, STL, JSON"* (a static string in the markup, so it is English even in other locales). Clicking it calls the same `_0x2909f4('import')` → `_0x5dd0dd()`. There is additionally a hidden legacy `<button id="import">` that a document-level capture click handler maps to the same dialog. (OBSERVED: `evidence/hp-bim.pretty.js`, `evidence/hp-ui.pretty.js` `createPopover`, `evidence/editor-page-raw.html`)

**Live check.** I drove the real editor once (`rea capture-browser-scenario`, 16 s settle, `visted=1`) and captured the full 2.1 MB DOM: it contains the i18n table (`bim.import`, `io.fmt.ifc/dxf/model`) and the toolbar scaffolding, but **no `hpToolFile`/`hpFileMenu`/`hpToolBim` node and no `data-fileact` attribute** — i.e. the File menu and the BIM panel are *not* present until a project/scene exists, which is exactly what the `_0x1d493e() && _0xca6502() && !_0x59ca11` guard says. That is a live confirmation of the guard, not of the dialog markup. (OBSERVED: `evidence/live-dom.html`, `evidence/live-accessibility.json`; the same pattern appears in round-1's `app-settle2-dom.json`.)

`accept` also lists `.bin/.mtl/...`, which are **not** in the dispatch list: they exist so a multi-file drop of a `.gltf + .bin + textures` or `.obj + .mtl` selects all files at once — the dialog hint `io.dropHint` says exactly that: *"Several files at once: a .gltf with its .bin and textures, an .obj with its .mtl…"*. The `obj`/`gltf` exporter option tables (`_0x33352c`) also derive from the same per-format sidecar lists. (OBSERVED)

### 2.2 Model loading, name re-tagging and element registration

**OBSERVED** (`evidence/hp-editor.pretty.js` @ `importFile`). There are in fact **three** `ImportMesh` call sites, and it is worth naming them because they differ:

- **A. `importFile` (this one, §2.1–2.2)** — root `''`, rootUrl `''`, subject = a `File` object; the user-drop path.
- **B. `loadModelTemplate(path)`** — roots split at the last `/`, subject = a catalog relative path like `admin/objects/foo.glb`; loads the *template* once, merges sub-meshes into a single `objsubmeshes` mesh, **bakes away any X/Z bounding-box-centre offset** (`bakeTransformIntoVertices(Matrix.Translation(-cx,0,-cz))`), names it `hp_template`, disables/unpickables it, sets `doNotSerialize=true`, removes it from the scene, and caches the `Promise` per path in a `Map`. `instantiateModel(path)` then **clones** the cached template as `objmeshes`, adds it back to the scene, gives it `metadata.hpModel = path` and a fresh PBR material. This is the catalog→place path the AI uses; it never touches `registerElement`'s import branch and never stores a local file.
- **C. The 2D-bridge path** (`_0x147a48`, root `admin/objects/`, used by the `data-model` bridge in §2.10) which merges everything into `import` material.

So a reimplementation should keep *uploaded model* and *catalog template* as separate loaders: only A needs `FilesInputStore`/sidecars; only B needs the centring bake and the template cache.

1. `BABYLON.SceneLoader.ImportMesh('', '', file, scene, onSuccess, onProgress, onError)` with the `File` **object** as root URL and an *empty* root (not `admin/objects/`). This is Babylon's `FilesInputStore` path — the engine registers the `File` under `file.name.toLowerCase()`; `hp-bim.js` pre-seeds that store (`BABYLON.FilesInputStore.FilesToLoad[name] = file`) for every model in a multi-file drop, which is why a `.gltf` can find its `.bin` and textures without a server. `importFile` returns a `Promise` that rejects with `Unsupported 3D model: .<ext>` for a bad extension (or `Import failed` from Babylon) and calls `HP3D.emit('imported',{file,count})` on success; it also calls `addShadowCaster` on the merged results.
2. For every imported mesh that has `VertexBuffer.PositionKind`:
   - `mesh.material.id = 'pbr'` (forces the shared PBR material path);
   - `mesh.id.includes('wall_merged')` → id `wall_merged`;
   - `…includes('csg')` → id `csg2`;
   - `…includes('door_window')` → id `door_window`, but if it also includes `door_window_binding_ref` it becomes `door_window_binding_ref`, `setParent(null)`, and (unless a flag is set) `isPickable=false`, `setEnabled(false)` — i.e. the binding reference plane is loaded but invisible/unpickable;
   - `'4poly'` → unparented, pushed to the poly-floor list, registered as a shadow caster;
   - `wallslaves` → left alone;
   - `polyt1_merged|polyt2_merged|polyt3_merged` → id `polyt1|polyt2|polyt3` but **`mesh.name` keeps the `_merged` suffix**;
   - `ground2` → the previous ground is disposed, this becomes `ground2imp`, vertices marked updatable, `backFaceCulling=false`, `roughness=1`;
   - everything else → id/name `objmeshes`; if it has a non-`__root__` parent, the parent is renamed `objmeshes` too; if the parent **is** the `__root__` node it is unparented and pushed to the object list with a shadow caster.
   - Meshes without position data are logged as `"problems with: " + name` and dropped.
3. A second pass over `scene.getNodes()` merges `door_window*` children into one mesh named `door_window`, merges `wall*` children, and so on — so a `.glb` that was authored as a full scene can be re-assembled into the app's element vocabulary.
4. `#merge` action: across a user selection it whitelists vertex-buffer *kinds*, zero-fills missing buffers, `Mesh.MergeMeshes` the selection, tags the result shadow-caster/`objmeshes`, and hides the merge button. A "custom object" path in the AI layer does the same for imported models, setting `metadata.hp = {name, custom:true}`.

Because the post-processing is name-matching, an imported model only becomes a door/window/wall/roof if its **node names** contain the corresponding tokens. Otherwise it is an `objmeshes` object, which is exactly how catalog furniture is represented.

**Compression is asymmetric (round-1 Unknown #2, partial).** The editor ships `assets/babylonjs/babylonjs.loaders.js` (the glTF/OBJ/STL loader bundle, which includes the Draco *decoder*) and never calls `DracoCompression.Configuration`-style setup anywhere in the 29 modules or the live DOM; there is also no local `draco_decoder*` file. So a Draco-compressed `.glb` is decoded through Babylon's **default** decoder configuration — i.e. the loader fetches the Draco wasm at runtime unless the default resolves locally. (OBSERVED: script list, absence of any config; **INFERRED**: the default decoder is used.) The *export* side is the opposite and explicit: a separate module `hp-gltf.js` (gltf-transform, `window.HPGltf`) supplies `toU8/zipFiles/compressGlb`, and the export dialog offers `compression ∈ {none, draco ("Draco (smallest file)"), meshopt ("Meshopt (fast loading)")}` with `textures ∈ {keep, resize, webp, jpeg}` and `maxTexture` (default 2048) — when `draco` is chosen the encoder is fetched on demand from `https://cdn.babylonjs.com/` (`draco_encoder_wasm_wrapper.js` + `draco_encoder.wasm`). So the app can *write* Draco and *read* Draco, via two different mechanisms. (OBSERVED: `evidence/hp-gltf.pretty.js`, `evidence/hp-bim.pretty.js`, `evidence/live-dom.html` i18n `io.comp.*`.)

**How an imported object gets a type (the fallback chain).** Every *other* object in the room is typed lazily by `elementBox`'s `type` resolver, in this order: `metadata.hp.aiType` → lookup in the type-by-id map; else the `modelPathOf(mesh)` is searched in `HP3D.catalog.objects` and the found entry goes through `typeOfProduct(catalogEntry, query)`; else `metadata.bim.name` → `typeOf`; else `metadata.hp.name` → `typeOf`; else `null`. So a hand-imported `.glb` that only sets `metadata.hp.name` is classified by its *file/object name*, and a model with no metadata or an unrecognised name is simply invisible to the scorer (no `type`, so `flat`/`tall`/`clear`/`avoidDoorWall` are all falsy and the default `clear` 0.4 applies). Note the candidate neighbour set is itself filtered: with a room, an object counts only if its centre is inside the room polygon **or** within **12 m** of the room centroid. (OBSERVED: `evidence/hp-ai-place.deobf.js` `_0x193ec6`, `_0x132c88`.)

**Auto-normalisation (on the AI layer, not on import).** The raw `importFile` path does no scaling; it is the AI placement wrapper in `hp-ai-chat.js` that calls `HPAIPlace.plausibleScale(dims, type)` and `HPAIPlace.sizeAndScale(dims, type, {width,depth,height,stretch})` before `applyPlacement`. Both are pure functions I executed (§2.9). An unclassified model gets a **unit-aware guess** (`plausibleScale` with no type: `max>30 ⇒ 30/max·0.3`, `min<0.03 ⇒ 0.3/max`, else `1`), i.e. an 1800-unit model is shrunk to 0.3 and a 0.005-unit model blown up ×60 — a millimetre/centimetre/metre rescue, not a real unit field. Note this matters only if the AI assistant is used and the type is unknown. (OBSERVED, run: `evidence/run-scale.js`, `evidence/run-scale.out.txt`.)

### 2.3 IFC and DXF import (round-1 Unknown #5)

**OBSERVED** (`evidence/hp-bim.pretty.js` @ IFC branch ~4758–5266 and DXF branch ~5268–5294).

**IFC** — loaded lazily, all client-side:
- Script `web-ifc-api-iife.js` is injected into the page on first use (`<script src>` appended), then `new WebIFC.IfcAPI()`, `SetWasmPath(<base>, true)`, `await Init()`; the API object is memoised for the session.
- `OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: true })` → `modelID`. `CloseModel` in a `finally`.
- Geometry is streamed with `StreamAllMeshes(modelID, cb)`; a second pass uses `StreamAllMeshesWithTypes(modelID,[IFCSPACE],cb)` when available. For each geometry the code pulls `GetVertexArray/GetIndexArray`, and transforms vertices/normals with the geometry `flatTransformation` (a `BABYLON.Matrix.FromArray`), **negating Z** (`push(x, y, -z)`) to convert IFC's right-handed Z-up into the planner's Y-up left-handed space.
- Type mapping is a **special case first, then a general classifier**. `IFCSPACE` (exact string) is special-cased to `{kind:'slab', id:'polyt1_ifc'}` — spaces *are* the rooms. For everything else the classifier uppercases `GetLineType` and tests: `^IFCWALL*`/`IFCCURTAINWALL` → `{kind:'wall', id:'wall_merged'}`; `IFCDOOR`/`IFCDOORSTANDARDCASE` → `{kind:'door', id:'door_window'}`; `IFCWINDOW`/`IFCWINDOWSTANDARDCASE` → `{kind:'window', id:'door_window'}`; `^IFCSLAB*`/`IFCCOVERING`/`IFCPLATE`/`IFCFOOTING` → `{kind:'slab', id:'polyt1_ifc'}`; `IFCROOF` → `{kind:'roof', id:'polyt3_ifc'}`; `^IFCOPENING*`/`IFCANNOTATION`/`IFCVIRTUALELEMENT` → **skipped** (`null`, no mesh); everything else → `{kind:'object', id:'objmeshes'}`. Note `IFCSPACE` also appears in the general skip list, but that branch is unreachable because the special case runs first. (OBSERVED: `evidence/hp-bim.pretty.js`.)
- **Storeys** are the `IFCBUILDINGSTOREY` lines; each gets `{guid, name (LongName→Name), elevation = Elevation · unitScale, minY: +∞, count: 0}` and an id→storey map. For every mesh that is *not* an `IFCSPACE`, the code walks `container`/`parent` relations up to **8 hops** to find its storey, then folds the mesh's min-Y into that storey's `minY` and increments its `count`. A storey's Y is `elevation + (median of the mesh minYs)` (or the mesh `minY` when the storey has no elevation, or the model min-Y as a last resort); storeys are sorted by Y and the import level defaults to the dialog's `level` select (else the current level). (OBSERVED: `evidence/hp-bim.pretty.js`.)
- Relations walked into side maps after the mesh pass: `psets`, `type`, `material`, `container`, `parent`, `voidHost`, `fillOpening`. At the end, if any door/window landed, `cutwalls()` is called so openings actually cut the wall solids.
- Result: `{kind:'ifc', count}` and a toast `bim.imported {name} ({n})`; the plan is marked dirty.

**DXF** — deliberately *not* parsed in the browser:
- `_0x240c6f('dxf-import', null, {thickness}, {dxf: <text>})` — the file text is sent to the app's own parser endpoint, which returns `{walls:[{a:[x,y], b:[x,y], thickness}]}`. The client then calls `level.buildWall({x1,z1,x2,z2, thickness, silent:true})` per wall and emits `created {kind:'wall', count}`. So "DXF plan: lines become walls" (`io.fmt.dxf`) is a **server-side line-to-wall fitting pass**; nothing else (text, blocks, doors) is mapped. The wall-thickness field in the dialog feeds this call. (OBSERVED)

**Plan images** — `importPlanImage(dataURL, name)` stores the image as a tracing underlay (`kind:'plan-image'`), the same mechanism the CasaPlazAI schema calls a per-floor underlay. (OBSERVED)

**Why the "IFC" in `HP3D.importFile` is absent:** the low-level gate is the 5-extension list; `.ifc` only ever reaches `HPBIM.importFiles`. Round 1's observation is confirmed and explained.

**Import vs catalog.** Imported models are *never* written into the catalog: the catalog is server-rendered from `window.HP_BOOT` (§2.4) and the only client-side catalog stores are `hp-catalog-recent` (click path) and the AI front-memo `hp-ai-front`. The import dialog's own hint says it. (OBSERVED; round-1 also established `HP_BOOT` and `hp-catalog-recent`.)

### 2.4 HPAIPlace — public surface and where it is used

**OBSERVED, run** (`evidence/run-place.js` printed the export keys). `window.HPAIPlace` exports exactly:

`TYPES`, `typeOf`, `typeOfProduct`, `typeById`, `analyse`, `frameDims`, `sizeAndScale`, `plausibleScale`, `rememberFront`, `frontMemo`, `findRoom`, `roomFaces`, `openings`, `furniture`, `elementBox`, `problems`, `describeProblem`, `solve`, `applyPlacement`, `buildCustomMesh`, `floorTop`, `ceilingY`, `pointInPoly`, `angDeg`, `yawToward`.

Callers found in the shipped set (**verified by grepping every module for `window.HPAIPlace`**): only `hp-ai-chat.js` references it, via one accessor `_0x336e55()` that returns `window.HPAIPlace`. That accessor is used for `typeOf`, `typeOfProduct`, `typeById`, `analyse`, `sizeAndScale`, `solve`, `applyPlacement`, `angDeg`, `rememberFront`, `buildCustomMesh`, `findRoom`, `floorTop`, `ceilingY`, `openings`, `furniture`, `elementBox`, `problems`, `describeProblem`, `roomFaces`, `pointInPoly`, `yawToward`. `hp-editor.js`/`hp-ui.js` never mention it, and `frameDims`/`plausibleScale` have **no external caller at all** — `plausibleScale` is called once *inside* the module from `sizeAndScale`'s unsatisfiable-envelope branch (verified by locating `_0x3000f7(` in the deobfuscated body). So the scorer in practice is reached only through the AI assistant's `place_object` and `furnish_room` tools (32 tool handlers total, e.g. `create_walls`, `place_object`, `furnish_room`, `bim_summary`). **`hp-ai-place.js` itself, however, is loaded unconditionally** (it is in the page's `<script>` list and executes its table-building IIFE at load), so the rule table and `analyse` memo are always in memory even if `solve` is not called. (OBSERVED: `evidence/editor-page-raw.html` script list, `evidence/hp-ai-chat.pretty.js`, `evidence/hp-ai-place.deobf.js`.)

### 2.5 The `TYPES` table — schema and semantics

57 entries. The `place` histogram is `wall` 24, `corner` 8, `wallmount` 6, `center` 5, `free` 3, `beside` 3, `front_of` 2, `on` 2, `ceiling` 2, `around` 1, `facing` 1 (57 total), and 10 entries carry a `rel` relation. `typeOf(name)` lowercases, strips diacritics (`NFD` + combining-mark strip) and returns the **first** rule whose `k` regex matches — order matters, so `sofa_corner` precedes `sofa`, `office_chair` precedes `chair`, `bunk_bed` precedes `bed`. `typeById(id)` is an id map built from the same array. (OBSERVED, run.)

Keys actually present and their meaning (columns as parsed in `evidence/aiplace-types-resolved.json`):

| key | type | meaning | read by `hp-ai-place.js`? |
|---|---|---|---|
| `id` | string | type name; also the `metadata.hp.aiType` round-trip key | yes |
| `k` | RegExp | title matcher (multi-language: pt/es/fr/de/it/ru/zh/ja/ko terms are embedded) | yes |
| `w`,`d`,`h` | `[min,max]` | plausible extent envelope in **metres** (per-axis plausible size band, used for scaling and the `analyse` envelope filter) | yes (scaling) |
| `place` | enum | preferred rule: `wall`,`corner`,`center`,`free`,`front_of`,`around`,`beside`,`on`,`facing`,`wallmount`,`ceiling` | yes |
| `rel` | `{to:[ids], place}` | relation target list + rule | yes |
| `clear` | number | **soft** clearance strip depth in front of the item; used only by the `clearanceContribution` term (§2.7), not by collision | yes |
| `flat` | bool | rugs etc.; own flat objects never collide and don't block openings | yes |
| `tall` | bool | only `wardrobe`,`bookshelf`,`fridge`; a window overlap counts as *hard* for these, *soft* for every other type | yes |
| `back` | `'tall'` | only `bed`,`sofa`,`sofa_corner`,`armchair`,`chair`,`office_chair`,`toilet` set it; in `analyse` it lowers the profile threshold from `0.3` to `0.12` and it locks the depth axis via the envelope filter | yes |
| `avoidDoorWall` | bool | `stairs`,`bed`; `+2.5` penalty on any wall that carries a door | yes |
| `nearWindow` | bool | `desk`,`kitchen_sink`; `−1` bonus on a wall with a window, `+0.5` otherwise | yes |
| `elev` | number | mounting height above floor for `wallmount`/`ceiling` mounts (`wall_cabinet` 1.45, `sconce` 1.7, `air_conditioner` 2.05, `mirror` 0.9, `picture` 1.1, `tv` 0.8); default `1.2` | yes |
| `fallback` | `'wallmount'` | `tv` only; if no `on`-target is found, mount on the wall | yes |
| `modular` | bool | wardrobe/dresser/bookshelf/tv_stand/sideboard/kitchen_cabinet/wall_cabinet/cabinet | **no** (chat layer) |
| `prio` | 0–9 | sort key for the chat layer's multi-item furnish pass (missing → `5`); does **not** exist in `hp-ai-place.js` | **no** (chat layer) |
| `outdoor` | bool | `tree`,`pool` | **no** (nothing reads it) |

The key union in the parsed, JSON-serialised table is `id, re, w, d, h, place, clear, avoidDoorWall, rel, prio, back, nearWindow, tall, modular, fallback, elev, outdoor, flat`, where `re` is my harness's string form of the literal's **`k`** RegExp (raw bytes: `{'id':'stairs','k':/stair|staircase|…/,'w':[0.6,3.5],…}`). Counted against the module body (table literal stripped out): `place` 8, `flat` 6, `rel` 5, `elev` 4, `support` 4, `clear` 2, `fallback` 2, `avoidDoorWall` 1, `nearWindow` 1, `tall` 1, `back` 1, and **`outdoor` 0, `modular` 0, `prio` 0**. (OBSERVED, run: `evidence/run-place.js`, `evidence/aiplace-types-resolved.json`.)

`clear` is *not* a hard clearance: `problems()` uses a fixed `0.02` object tolerance (and `0` for openings/ghost) and only consults `flat`/`tall` and the mount; `clear` feeds only the soft `clearanceContribution` term, and is not even used by the relation lattice (which tests plain `problems()`). This corrects the intuitive reading of "clearance" and is a fact worth copying carefully.

### 2.6 The TYPES table applied to the real catalog

**OBSERVED, run** (`evidence/run-place.js`, output `evidence/aiplace-classify.json`, unmatched list `evidence/aiplace-unmatched.json`).

- 1776 `objectOptions` titles classified with the module's own `typeOf`: **965 matched (54.3 %)**, **811 unmatched (45.7 %)**.
- Top types: `chair` 73, `bed` 50, `sofa` 50, `desk` 46, `ceiling_light` 42, `kitchen_cabinet` 38, `stairs` 38, `table` 36, `tree` 35, `wardrobe` 33, `tv_stand` 33, `bookshelf` 30, `sofa_corner` 26, `armchair` 26, `washbasin` 24.
- The 811 misses are dominated by the long tail of `Other` (Buildings 40, Infrastructure 23, Office 32, School 15, Shop 29, Misc 95), vehicles/public-space models, and any English title where the rule's anchor word is missing (e.g. "Cooker hood", "Pool table", "3D printer"). A full list is in `aiplace-unmatched.json`.
- **`typeOfProduct(product, query)`** has a second, softer fallback: it types the product by `title_en`/`title` (call this `primary`), and types the *query* the user typed (split on `|`). If the query has alternatives and one of them types to the same id as `primary`, `primary` wins; otherwise the **first** query alternative is used. Independently it computes a `secondary` guess from `title_en`/`title`/**`slug` (with `-`/`_` → space)**/**`tokens.join(' ')`**. The return is `secondary` unless the chosen type's id is in `{table, cabinet, chair, bench}` **and** `secondary` exists — in that case it returns the *query-derived* type instead, i.e. a real "Table" catalog title beats the word the user typed, but a generic catalog title does not. (OBSERVED, run: `evidence/run-place.js`; read: `_0x230194` is exactly `{table:1,cabinet:1,chair:1,bench:1}`.)

### 2.7 `solve()` — candidate generation and the exact cost function

**OBSERVED, run, and read** (`evidence/hp-ai-place.pretty.js` lines 613–1000; `evidence/hp-ai-place.deobf.js`). `solve({level, room, type, w, d, h, place?, x?, z?, facing?, exact?, near?, mount?, strict?})` returns `{x, z, y, y0, y1, facing (rad), rule, warnings[], hard?, support?, supportW?, supportD?, wall?}`.

**Rule selection** (first match wins; `place` may be overridden by the caller, by `type.place`, or by a relation):
1. `place:'ceiling'` → room centroid, yaw 0, rule `ceiling`; `y` from `ceilingY(level, room)` = `max(wall.baseY + wall.height)` over the level's walls whose midpoint is within **30 m** of the room centroid, else `levelBase(level)`.
2. `place:'center'|'free'` **or** no room → grid-sweep the room bounding box at **0.15 m** steps, for the two orientations `base` and `base+90°` (`base` chosen so the item's long axis lies along the room's long axis), score every in-polygon point, keep the cheapest; if the cheapest still has a hard problem, emit `no free space in the middle of the room` + the hard problems and return it anyway. `rule:'center'`.
3. **Resolve the neighbour.** If the caller passed `near=<mesh>` use it verbatim. Else, only when `type.rel` exists, a room exists and the caller did **not** pass `place`, scan the room's other objects for one whose inferred type id is in `rel.to` *and* whose centre is inside the room polygon, sort them by the index of their id in `rel.to` (i.e. the table's own preference order), and take the first. If a neighbour was found, adopt `rel.place` as the rule (e.g. `sofa` + a `tv`/`tv_stand` present → `facing`). If none was found and `type.fallback === 'wallmount'`, set `mount='wall'` instead (this is `tv`'s fallback).
4. `place:'facing'` → convert to a wall placement facing the target and clear `near` (`faceTarget`).
5. `place ∈ {beside, front_of, around, on}` and a target exists → generate the **relation lattice** (guide: the 10 `rel`-bearing types are `sofa→tv|tv_stand (facing)`, `tv_stand→sofa|sofa_corner|bed (facing)`, `tv→tv_stand|sideboard|dresser (on)`, `tv`'s fallback `wallmount`, `coffee_table→sofa|sofa_corner (front_of)`, `office_chair→desk (front_of)`, `chair→dining_table|table|desk (around)`, `nightstand→bed|bunk_bed (beside)`, `side_table→sofa|armchair (beside)`, `floor_lamp→sofa|armchair (beside)`, `table_lamp→nightstand|side_table|desk|dresser|sideboard (on)`):
   - `beside`: 2 candidates (left/right of the target, offset `target.hw + w/2 + 0.04`, lateral shift `−target.hd + d/2`).
   - `front_of`: offsets `0, ±0.15, ±0.3, ±0.45` along the target's `u` axis × `0, +0.1, −0.08` in front (`front gap` = `0.35` default, `0.42` for a coffee table, `−0.15` for an office chair), facing `targetYaw+π`.
   - `around`: `max(1, floor(2·halfMajor/0.6))` seats per long side + 2 end seats, facing outward.
   - `on`: place on the support top (`y0 = target.y1`, `y1 = y0 + h`), `rule:'on'`, `support` set.
   Candidate selection for the relation rules is **first-fit, not best-fit**: the lattice is walked in generation order, each candidate is run through `problems()`/`classify()`, and the **first candidate with zero hard problems** is returned. If none is clean, the warning `no free spot <beside|front of|around|on> the target` is pushed and the rule falls through to the wall/centre logic. For `around` and for `front_of` on a `chair|stool`, the target is registered as the `support` (so it is excluded from collision) and `on` additionally returns `support`, `supportW = 2·target.hw`, `supportD = 2·target.hd`.
6. Otherwise the **wall sweep**, in two stages:
   - `roomFaces(room)` first *measures* the usable inside face of every straight wall of the level. For each of the two normals it walks the wall at `thickness/2 + 0.12` from the axis in ~5 cm steps (`max(4, ceil(length/0.05))` probes) and keeps the **first and last** probe that fall inside the room polygon (not a contiguity check — a wall with an interior gap still spans it). A face is kept only if `last − first ≥ 0.3 m`; it stores `{wall, dir, inward, u0, u1, len, a, b}` where `a`/`b` are the run ends pushed out to the wall's surface.
   - Each kept face is then swept from `w/2 + 0.02` to `len − w/2 − 0.02` in `max(1, round((len − 2·margin)/0.1))` steps (so **≈ 0.1 m**, snapped), the candidate centre being `face.a + dir·s + inward·(baseOffset + d/2)` with `baseOffset = mount==='wall' ? 0.005 : 0.02`. Faces with `len < w + 0.04` are skipped. Each sample is scored and the cheapest wins → `rule:'corner'` if `type.place==='corner'`, else `'wall'` (or `'wallmount'` when `mount==='wall'`).

**Cost function.** For a candidate box `B` (centre `c`, axes `u,v`, half-extents `hw,hd`, `y0,y1`) against the scene:

```
problems = []
for each probe p in [4 corners + centre + 4 edge midpoints] of B, and each wall W:
    if mount is unset/floor/ceiling and nearestWall(p, maxDistance 1).distance < W.thickness/2 − 0.005
       and W's baseY..baseY+height overlaps B: problems.push({kind:'wall'}); break
if context.room and not all 4 corners inside room polygon: problems.push({kind:'outside_room'})
for each other object O:
    if both flat, OR vertical gap, OR O is the designated support: skip
    if SAT(B, O, eps = 0.02): problems.push({kind:'object', id:'e'+O.mesh.uniqueId})   # separated iff |proj| >= extA+extB+eps
for each opening (door/window) with a zone:
    if flat: skip
    door:    B.y0 < door.y1 − 0.2  and SAT(B, zone, 0):     problems.push({kind:'door'})
    window:  B.y1 > win.y0 + 0.02 and B.y0 < win.y1 and SAT(B, zone, 0): problems.push({kind:'window'})
```

`openings(level)` builds one record per element of kind `door`/`window`: `{mesh, kind, c, width, y0, y1, wall, dir, p, t, zone}`. `c` is the opening's world-bounds centre, `width = max(boundsSize.x, boundsSize.z)` (these are axis-aligned doors/windows, so its width is the larger footprint axis), `y0/y1` its world Y extent, and `wall`/`p`/`t` come from `nearestWall(c, level, {maxDistance:0.6})`. Only when that wall was found is a **zone** attached: `zone.u = dir` (the wall direction unit vector), `zone.v = perpendicular`, `zone.c = p` (the *wall's* nearest point to the opening, not the opening centre), `zone.hw = (width + 0.1)/2`, `zone.hd = t/2 + reach` with `reach = min(1, max(0.7, width))` for a door and a flat `0.35` for a window. Openings further than `0.6 m` from a wall therefore have **no zone** and are ignored by `problems()`. (OBSERVED: `_0x1664d5`.)

`classify(problems, type)` (`_0xf87d32`): a problem is **hard** if its kind is not `window`, **or** if the type is present and `type.tall`; a `window` problem for a non-tall/untyped item is **soft** and contributes `2.5` each. So: window overlaps are hard for tall items (wardrobes, fridges…), soft for low ones (beds, sofas, rugs).

Wall sweep cost (per sample position `s` on face of wall `W` with free length `len`, inward normal `n`, room midpoint `mid`, reference `maxLen = max face length`):

```
cost  = hard.length * 20 + soft
cost += (place==='corner') ? 1.2 * min(s − margin, len − margin − s)
                          : 0.8 * |s − len/2|
cost += (maxLen − len) * (w > 1.2 ? 0.6 : 0.15)
cost += (type.avoidDoorWall && W has a door) ? 2.5 : 0
cost += (type.nearWindow) ? (W has a window ? −1 : +0.5) : 0
if faceTarget:                     # 'facing' rule, e.g. sofa → tv
    cost += 3 * (1 − cos(angle between inward normal and direction to target))
    cost += 0.6 * |component of (target − s) along W|
if mount !== 'wall':
    cost += clearanceContribution(B, …)     # full weight in the wall sweep
```

`clearanceContribution(B, level, ctx, clear)` builds a **ghost strip of the item's width and depth `clear`, pushed `clear/2` beyond the item's front face** (`ghost.c = B.c + B.v·(B.hd + clear/2)`, `ghost.hw = B.hw`, `ghost.hd = clear/2`) and returns:

```
for each other object O:
    if O not flat and O.y0 < B.y0 + 0.5 and SAT(ghost, O, 0):  cost += 2
for each probe p in [ghost.c, ghostCorner2, ghostCorner3]:      # the two far corners
    nw = nearestWall(p, maxDistance = 1)
    if nw and nw.distance < wallThickness/2:                    cost += 1.5
```

so it penalises *things in front of* the item and probes that land inside a wall — a "is its front blocked" term, not a distance-to-wall attractor. It is added with **full weight in the wall sweep** and with `0.5` weight in the centre-of-room sweep, and it is skipped entirely when `mount === 'wall'`; `clear` defaults to `0.4` when the type does not define it.

Centre-of-room scoring is `cost = hypot(P − roomCentroid) + 0.6·orientationIndex + 0.5·clearance + soft + 20·hard.length` where `orientationIndex` is `0` or `1` (the two 90° orientations); if a dining/`table` candidate has no hard problem it is additionally tested against a box inflated by `+0.3/+0.6` and gets `+3·hard` of that test.

**Hard-failure behaviour.** `solve` never rejects. Exact order, read from the tail of the function:
0. **Numeric-position branch** — if the caller gave a numeric `x`/`z`: when no `facing` is supplied, find the nearest wall within `max(w,d)/2 + 0.6` and yaw toward it (except under `free`/`center`/`exact`), pulling the point out to `thickness/2 + (mount==='wall'?0.005:0.02) + d/2` from the wall surface. Compute `problems()`; if there are none, or `exact`, return `rule:'position'` with the problem strings as warnings. Otherwise run the radial nudge (below); if every ring fails, return the asked point `rule:'position'` with `hard:true`.
1. **Resolve the neighbour and try the relation lattice** (§2.7 rule 3–5). If a relation candidate wins, return it immediately.
2. **No room** (and no numeric position) → place beside the whole scene (`x = maxX + 1.5 + w/2`, `z = scene Z mid`, yaw `3π/2`), warning `no room given: placed next to the model (give room or x/z)`, `rule:'outside'`.
3. `place:'ceiling'` → room centroid, yaw 0.
4. `place:'center'|'free'` → centre grid sweep (warning `no free space in the middle of the room` when the winner is dirty).
5. `roomFaces(room)`: if it is empty, warning `the room has no straight walls: placed in the middle`, centroid, yaw 0, `rule:'center'`.
6. **Wall sweep** (`rule` = `corner`/`wallmount`/`wall`). If the winner has **no hard problems** it is returned, with the `in front of a window` warning if its soft score came from a window.
7. Else, if `mount !== 'wall'` **and not `strict`**, it recurses with `{place:'center', x:undefined, z:undefined}`. If that recursion returns **no warnings at all**, the result is returned with the extra warning `no free wall space for this size: placed in the room`.
8. Else it pushes `no free spot for this size`, appends one `describeProblem` string per remaining hard problem, and returns the best hard candidate with `hard:true` (`rule:'wall'`); if the sweep produced nothing at all it returns the room centre facing the first wall's inward normal (`rule:'center'`, `hard:true`).

When `strict` is true step 2 is skipped, so a strict caller always gets a wall candidate. `exact:true` short-circuits even earlier: the asked `x/z` is used verbatim and the problems are reported as warnings instead of being nudged (step 0 of the numeric branch, before the ring search). And at the very top, if the requested position already collides, it **radially nudges**: rings `r = 0.1 … 1.6` in `0.1 m` steps × 16 angles (`θ = i/16·2π`), first free spot wins, warning `moved <r> m from the asked position to a free spot`. (OBSERVED, read + run: `moved …` never fired in my probes because my scenes always had a free spot; the rings are tried **ascending 0.1 → 1.6 m** so the closest free spot wins, and `r` is emitted rounded to 2 dp by `round2`.)

**Mount elevation** (`solve`'s `y` resolver): `mount==='wall'` → `y = floorTop + (elev ?? type.elev ?? 1.2)` (so `tv`'s `elev:0.8`, mirror `0.9`, picture `1.1`, wall_cabinet `1.45`); `mount==='ceiling'` → `y = ceilingY(level, room) − h`. **That is the only place `type.elev` is read** — a `wallmount`/`ceiling` item asks the caller for a `mount`, it is not derived from `type.place` alone. (OBSERVED.)

**Reason strings** (`describeProblem` + the warnings array), complete list found in the module:
`intersects a wall`, `partly outside the room`, `overlaps e<uniqueId>`, `blocks the door e<id>`, `covers the window e<id>`, `no free space in the middle of the room`, `no free spot for this size`, `no free wall space for this size: placed in the room`, `no room given: placed next to the model (give room or x/z)`, `the room has no straight walls: placed in the middle`, `in front of a window`, `moved <r> m from the asked position to a free spot`, the four relation failures `no free spot beside the target` / `no free spot front of the target` / `no free spot around the target` / `no free spot on the target` (built as `'no free spot ' + place.replace('_',' ') + ' the target'`), and from `furnish_room` in the chat layer `made <n>% narrower to fit` / `made <n>% smaller to fit`. (OBSERVED, read.)

### 2.8 `analyse()` — front detection (the `frontYaw` guessing game)

**OBSERVED, read + run** (`evidence/run-analyse2.js`, `evidence/probe-bed.js`). `analyse(mesh, type, modelPath)` returns `{dims:{x,y,z}, w,d,h (axis-swizzled by front), front, frontBy, frontYaw}`.

- Bounding box → raw `dims`. Vertex positions are then sampled (stride `max(1, floor(count/30000))`).
- For each of the four walls of the box, vertices within `18 %` of that face (`18 % of dims.x` for the ±x faces, `18 % of dims.z` for the ±z faces) are collected with a normalised height `(y − minY)/dims.y`; the side score is the **90th percentile** of those heights (`sorted[floor(0.9·n)]`), i.e. "how tall is the furniture near this side".
- **Envelope filter (the important discovery).** When a `type` is supplied, the module first compares `pen(dims.z, type.w)+pen(dims.x, type.d)+pen(dims.y, type.h)` against `pen(dims.x, type.w)+pen(dims.z, type.d)+pen(dims.y, type.h)`, where `pen(v,[min,max]) = log(min/v)` below the range, `log(v/max)` above it and `0` inside (the two penalties are applied twice — once with `w,d` as the envelope for `z,x`, once swapped — and the shared `h` term cancels). If the two differ by **more than 0.15** it concludes the item's depth runs along a specific axis and **restricts profile detection to that axis' two faces**. Verified numerically: for a 1.6×2.0×0.5 bed (`w:[0.85,2.45]`, `d:[1.85,2.45]`) the two penalties are `0.838` vs `1.471` (Δ `0.633 > 0.15`), so only the ±x faces are considered.
- `back` detection: among the considered faces, the side whose 90th-percentile exceeds its opposite by more than `0.3` (or `0.12` when `type.back==='tall'`) wins; the winner is flipped to become the *front* (`+z→−z`, etc.); `frontBy='profile'`.
- If `type.back !== 'tall'` and no profile winner exists, a second test compares the *counts* of near-face vertices on the axis chosen by the filter (`1.35×` ratio) → `frontBy='detail'`.
- Otherwise `front=+z`, `frontBy='convention'`. Final yaw map: `{'+z':0, '-z':π, '+x':−π/2, '-x':+π/2}`.
- The result is memoised in a `Map` keyed by model path, and a **second** `{path: yaw}` object is loaded from `localStorage['hp-ai-front']` at module load. `rememberFront(path, yaw)` writes into that object (yaw rounded to 4 dp) *and* `delete`s the Map entry, so the next `analyse` recomputes and reports `frontBy:'remembered'`; `frontMemo()` returns a copy of the stored map. `analyse` checks the Map first (covering both memo and remembered). (OBSERVED: `evidence/hp-ai-place.deobf.js`.)
- `yawToward(dx,dz)=atan2(dx,dz)`, `angDeg(rad)=round(10·((180/π)·rad mod 360))/10` with negative wrap to `[0,360)`.
- **Consequence I measured**: for the *same* 1.6×2.0×0.5 mesh, `analyse(mesh, null, path)` correctly detects a dense back on all four sides (`frontBy:'profile'`), while `analyse(mesh, bed, path)` returns `frontBy:'convention'` for a back at ±z because the bed envelope restricted detection to ±x. So the type hint is a **double-edged** input: it disambiguates the depth axis but *disables* the profile heuristic on the other two faces, and any furniture whose real proportions disagree with the table's envelope silently gets the `convention` front. (OBSERVED, run: `evidence/probe-bed.js`.)
- My run reproduced `profile` for dense-back synthetic meshes with `back:−z → front:+z` and `back:+z → front:−z` (no type), and **`convention` for an unclassified/`flat` type**. (OBSERVED, run.)

### 2.9 Placement facts a reimplementation must not miss

- **Everything is metres.** `angDeg` returns degrees; `solve.facing` is radians; `applyPlacement` composes `facing + frontYaw` into a Babylon `Quaternion.RotationAxis(Y, angle)`.
- `frameDims(dims, frontYaw)` **swizzles** `w`/`d` whenever `|round(sin(yaw))| === 1` (i.e. yaw ≈ ±90°), so every downstream overlap uses the model's *facing-adjusted* footprint, not the raw AABB. `sizeAndScale` does the same and returns `{s:{x,y,z}, w,d,h, scaled}`.
- `sizeAndScale` has three modes: `stretch:true` stretches each axis independently (and swaps x/z when the front is on ±x); otherwise it takes the **minimum** of the requested/available ratios (preserve aspect), and a `depth` request that conflicts with that minimum is silently ignored — my run: asking `{width:2, depth:0.6}` on a 1.8×0.5×2.1 bed returned `w:2, d:0.556, h:2.33`, i.e. **the requested depth never appears** because the uniform ratio came from width. `scaled` is the rounded uniform factor for the aspect-preserving mode (`1.36` for no request, `1.11` for `{width:2}`), the string `'stretch'` in stretch mode, `'narrower'` in the chat layer's modular-shrink path, or a rounded number for the shrink path in `applyPlacement`.
- `plausibleScale` with no type clamps to a unit-rescue heuristic: `max>30 → 30/max·0.3`; `max<0.03 → 0.3/max`; else `1`. With a type it fits `[w,d,h]` into the type's `[min,max]` envelopes and, when the envelope is unsatisfiable, minimises the **log-distance** `Σ log(ratio)` instead — a robust fallback. (OBSERVED, run: `evidence/run-scale.js`, `evidence/run-scale.out.txt`; a 1800×500×2100 model reads `none=0.0043` but `bed=0.0014`; a 180×50×210 model reads `0.0429` vs `0.0136`; a 1-unit cube reads `none=1.0`, `bed=1.85`; a 0.005 cube blows up ×60/×370.)

### 2.10 2D planner integration (context; not the focus)

**OBSERVED** (`evidence/hp-editor.pretty.js`). The 2D planner is an **iframe** `2D-Planner/index.php?lang=<encodeURIComponent(lang)>` inside a full-screen `#floorplanFrameContainer` overlay built as `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; visibility:hidden; pointer-events:none`, with a small floating control card (bottom-right, `z-index:1100`) containing `#autoRoofToggle`, `#autoRoofPitch` (`type=number min=5 max=60 step=1 value=30`, hidden until the toggle is on), `#offsetToggle`, `#offsetX`/`#offsetY`, `#generate3D` and `#close2DPlanner`. The 3D side reaches into the iframe via `HP3D.plannerWindow()`, which is literally `document.getElementById('floorplanIframe').contentWindow` — a same-origin window handle, not a messaging API. (OBSERVED)

**Round-1 Unknown #4 (`rotation_offset`) is resolved here.** The catalog's `rotation_offset` (and its per-model sibling `productRotationOffset`) is the **2D-symbol rotation** applied when a 3D catalog model is projected into the 2D plan. The editor composes it in `resolveModelOffset` and **delegates the decision to the iframe**:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

So the precedence is **catalog override → product default → user nudge**, with the symbol front and an "auto turn" flag that is only honoured when the model footprint came from the same source as the target. The actual angle math (`FloorplanOrientation.resolveModelOffset`, `FloorplanCatalog.frontDeg`) lives in the iframe's own bundle, which I did not capture — see Unknown #11. (OBSERVED for the bridge; the iframe internals are not captured.)

## 3. Ideas for CasaPlazAI

Ranked by value / effort; each ties to a finding and to `casaplazai-schema.md` (read-only).

| # | Idea | Ties to | Schema touch | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Make the unit-rescue explicit and overridable.** Port the idea, not the code: on import compute the bbox and offer a one-click "interpret as mm / cm / m" with the auto guess pre-selected; never silently scale. 3DHP's `plausibleScale` has the right shape (ratio clamp + log-distance fallback) but no UI. | §2.2, §2.9 | add nothing to schema; keep the chosen real footprint in `FurnitureItem.footprint` | High | Low |
| 2 | **Add a placement *reason* string to the editor.** `describeProblem`-style sentences ("intersects a wall", "blocks the door", "no free wall space: placed in the room") make a soft-error UX legible; CasaPlazAI currently has fit/collision constraints but the schema has no annotation channel. Keep the messages in-memory (inspector banner), not in `FloorplanData`. | §2.7 | out of schema (inspector-only), like measurements/underlay | High | Low |
| 3 | **A small per-type rule table is a cheap win.** 57 entries × ~8 fields, first-match regex, multi-language synonyms. Even a 15-entry table (bed/sofa/table/chair/wardrobe/tv/rug/desk/counter/toilet/bathtub/…) would let a "furnish room" action place the seven schema types with the right wall/corner preference, `avoidDoorWall` for beds, `nearWindow` for desks. | §2.5, §2.6 | maps to the 7-type enum in `FurnitureItem.type` | High | Med |
| 4 | **Score, don't reject: a candidate lattice for auto-placement.** If CasaPlazAI ever adds a "suggest a spot" affordance, use the three-lattice structure (centre-grid 0.15 m × 2 orientations; wall sampling 0.1 m over the valid span with a `w/2` margin; radial nudge rings 0.1…1.6 m) and pick the min-cost candidate, degrading to centre with a warning — far more useful than a boolean `fits`. | §2.7 | computes `FurnitureItem.position`/`rotationDeg` only | High | Med |
| 5 | **Split "import model" from "import plan/document".** Give the furniture import a single narrow gate (`.glb/.gltf/.obj/.stl`) and a separate "trace underlay" import for images, exactly as 3DHP does. Add a *sidecar* drop set (`.bin`, `.mtl`, textures) that is accepted only when a model is in the same drop. | §2.1 | `underlay` key already exists outside `FloorplanData`; imported model becomes a `FurnitureItem` | Med | Low |
| 6 | **One orientation resolver with explicit precedence.** For the Plan-mode redesign: keep *catalog default → imported-model default → user override* as an ordered triple (3DHP's `rotation_offset ?? productRotationOffset` then `modelYawOffset`) and resolve the plan symbol's yaw in exactly one place. 3DHP even cross-checks the footprint source before honouring an "auto turn" flag, which is the right guard against an auto-rotate guess fighting a manual one. | §2.10 | `rotationDeg` is already the single angle; a per-model default would be new out-of-schema state | Med | Low |
| 7 | **Fix the Draco/decoder configuration explicitly.** 3DHP's read/write asymmetry is a maintenance trap: it decodes Draco implicitly through Babylon's *default* configuration, while its encoder needs a runtime CDN fetch. For CasaPlazAI — which must work offline with no backend — configure one decoder path and ship (or lazy-load once and cache) the wasm, rather than depending on a CDN at import time. | §2.2 | none (loader config) | Med | Low |
| 8 | **Collision = SAT with a fixed epsilon, clearance = a soft term.** Separate the two concerns the way `problems()` does: hard overlap uses SAT + a small fixed epsilon (0.02), while a per-type `clear` becomes a *soft* penalty (ghost box + distance-to-wall probes). This is directly portable to the existing fit/collision code without new schema. | §2.7 | none | Med | Med |
| 9 | **Two-row shared-door convention already matches their door zone idea.** 3DHP builds an opening *zone* = a box centred on the opening with `hw = (openingWidth+0.1)/2` and `hd = wallThickness/2 + reach`, where `reach = min(1, max(0.7, openingWidth))` for a door and a flat `0.35` for a window; a door blocks furniture only when `item.y0 < door.y1 − 0.2`, a window only when the item's `[y0,y1]` overlaps the window's. The opening→wall search radius is `0.6 m` and the zone is skipped entirely when no wall is near. CasaPlazAI's two-row shared-door (`openings` mirrored on both rooms) can reuse exactly that zone model so a door on a shared wall blocks furniture from both sides. **Caveat:** the 3DHP test also needs the *item's* vertical extent (`B.y0/y1`), and `FurnitureItem` has no height field — so port the door test using `headHeight` against a schema-level assumption (e.g. treat every item as reaching `wallHeight`), or skip the height test and use the plan-only footprint rule. | §2.7 | `openings` has `segmentIndex/tCenter/width/sillHeight/headHeight`; `FurnitureItem` has **no height** | Med | Med |
| 10 | **`flat` is a real category.** Rugs (and underlays) must never collide and must not block openings. The 7-type enum has no rug; if a rug ever appears, either add a boolean `flat` to `FurnitureItem` (schema change, `schemaVersion` bump) or keep it editor-side. Note this is the one finding that *would* touch the frozen schema. | §2.7 | `FurnitureItem` — new optional field or a new type | Low | Med |
| 11 | **Auto-front detection is skippable.** 3DHP's vertex-percentile front heuristic is clever but it needed a memo, a manual override and a `convention` fallback, and my run showed it misfiring on ambiguous meshes. CasaPlazAI's `rotationDeg` (explicit, unconstrained) is the better contract; if a front guess is added, expose it as an editable "facing" field. | §2.8 | `rotationDeg` already exists | Low | Low |
| 12 | **DXF/IFC are out of scope, and should stay out.** An IFC path drags in a WASM parser, relation walking, storey resolution and a Z-flip; and 3DHP's own DXF support is a *server-side* line-to-wall fitter, which is incompatible with a no-backend app. If blueprints matter, the underlay + manual tracing already in scope is the honest 80 %. | §2.3 | `underlay` | Med (negative) | High |

## 4. Unknowns

1. **Live import was not observed end-to-end.** I loaded the editor live (DOM/accessibility captured, `evidence/live-dom.html`) and confirmed the File menu is *absent* until a project exists — matching the guard — but I did not get a project open and drive the dialog; the dialog HTML/ids and the post-processing are read from shipped bytes. A `.glb` whose node names do *not* contain `wall_merged`/`objmeshes`/etc. is predicted to become an `objmeshes` object; unverified in the browser.
2. **The `#merge` action's exact UI trigger** is read but not driven; the whitelist of vertex-buffer kinds and the zero-fill rule are known, whether it is reachable for an imported object is not.
3. **`web-ifc` version and WASM path.** `SetWasmPath(base,true)` is called with a constant I did not resolve to a URL; the `StreamAllMeshesWithTypes(IFCSPACE)` branch is wrapped in try/catch and may be a no-op on some builds.
4. **The DXF parser is server-side and unexamined**: whether it snaps to a grid, how it decides thickness, and how it handles arcs/polylines/DXF units are all unknown from the client.
5. **`rotation_offset` is explained in §2.10** (round-1 #4, now closed): it is the 2D-symbol yaw offset, composed as *catalog override → `productRotationOffset` → `modelYawOffset`* and resolved by the iframe's `FloorplanOrientation.resolveModelOffset`. `hp-ai-place.js` itself never reads it.
6. **`objectCategories` anomalies** (round-1 #7) untouched — outside this round's question.
7. **The exact `moved …` path in `solve`** never fired in my probes (my scenes always had a free spot); the ring count/order is read from code, not exercised.
8. **`support`-aware `on` placement** (lamp on a nightstand) is exercised through my synthetic `near=` probes, where it correctly returned `rule:'on'`; the auto-discovery path (`rel.to` match) worked for `tv→tv_stand` in my run. The `supportW/supportD` shrink lives in `hp-ai-chat.js`, not in `HPAIPlace`: when `rule==='on'` and the placed box is wider than `0.95·supportW` or deeper than `0.95·supportD`, it scales uniformly by `min(0.9·supportW/w, 0.9·supportD/d, 1)` provided the result still clears `0.8·type.h[0]`; I read this but did not exercise it at runtime.
9. **`analyse` threshold semantics are now read correctly, but not run against real models.** The `18 %` face band, the 90th percentile, the `0.15` envelope filter and the `1.35×` detail ratio were re-derived from the raw bytes and reproduced on synthetic meshes (`evidence/probe-bed.js`); I still did not run them against the real 1776 Draco-compressed GLBs (that needs a Draco decoder and Babylon in a JS runtime — out of budget).
10. **Round-1 Unknowns #1/#6/#9** (live drawer interaction, aggregate GLB weight/load time, item-level `door_window` flag) remain untouched by this round. **#4 is closed** (§2.10) and **#2 is half-closed** (§2.2: Draco is read via Babylon's default decoder and written via an on-demand `cdn.babylonjs.com` encoder; what I could *not* determine offline is whether the default decoder resolves locally or always fetches its wasm, since that decision lives inside `babylonjs.loaders.js`, which round 1 did not copy into `evidence/`).
11. **The 2D planner iframe bundle was not captured**, so `FloorplanOrientation.resolveModelOffset`, `FloorplanCatalog.frontDeg` and `FloorplanCatalog` at large are known only by their call signature from the parent. The 2D planner's own file/format handling (it is a separate PHP app) is out of scope for this round.

## Evidence index (this folder)

| File | What it is |
|---|---|
| `report.md` | this report |
| `sources.json` | machine-readable source list with tags |
| `evidence/run-place.js`, `evidence/run-place.out.txt`, `evidence/aiplace-types-resolved.json`, `evidence/aiplace-classify.json`, `evidence/aiplace-unmatched.json` | the harness that loaded the shipped `HPAIPlace` and classified all 1776 catalog titles |
| `evidence/harness.js`, `evidence/run-solve.js`, `evidence/run-solve2.js`, `evidence/aiplace-solve-results.json`, `evidence/run-solve*.out.txt` | synthetic-scene harness; reproduces `solve()`/`problems()`/relationship rules |
| `evidence/run-scale.js`, `evidence/run-analyse.js`, `evidence/run-analyse2.js`, `evidence/run-scale.out.txt`, `evidence/run-analyse2.out.txt` | `plausibleScale` / `sizeAndScale` / `frameDims` / `analyse` runs |
| `evidence/beaut.js`, `evidence/*.pretty.js` | local JS beautifier and beautified review copies of the 29 shipped modules |
| `evidence/deobf/*.deobf.js`, `evidence/deobf.js` | round-1 deobfuscator + deobfuscated module sources |
| `evidence/hp-ai-place.deobf.js`, `evidence/hp-ai-place.js`, `evidence/ai-place-types.txt` | `HPAIPlace` module (deobfuscated, original, and the round-1 TYPES dump) |
| `evidence/deobf/hp-editor.deobf.js` | `importFile`, `loadModelTemplate`/`instantiateModel`, `registerElement` and the 2D bridge |
| `evidence/hp-boot.json`, `evidence/catalog-aside.html` | the server-rendered catalog data and markup used for the classification run |
| `evidence/live-dom.html`, `evidence/live-accessibility.json` | the 2.1 MB DOM/accessibility of one live `app.php` load, used to confirm the File menu guard |
| `evidence/live-import-ui.json`, `evidence/live-import-dialog.json`, `evidence/scenario-import-ui*.json` | the live-capture requests themselves (partial/aborted; kept for honesty) |
| `evidence/probe-bed.js` | focused `analyse()` probe that exposed the 0.15 envelope filter |
| `evidence/run-*.out.txt` | plain-text transcripts of every harness run quoted above |
| `evidence/js/*.js` | the 29 shipped (obfuscated) editor modules |
