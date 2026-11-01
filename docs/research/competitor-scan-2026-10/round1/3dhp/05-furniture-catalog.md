# 3D House Planner — Furniture/Object Catalog Analysis

Job: `05-05-furniture-catalog` · Target: https://www.3dhouseplanner.com/ (editor at `/app.php`)
Method: passive captures with `rea capture-browser-scenario`, `rea`-exported page HTML/JS, local deobfuscation of the shipped modules, and one direct POST to the site's own search endpoint.

Legend: **OBSERVED** = seen in a capture or in shipped bytes (evidence file named) · **DOCUMENTED** = stated on a vendor page (URL) · **INFERRED** = my deduction, not directly measured.

---

## 1. Summary

- **The catalog is enormous and server-rendered into the page.** The editor HTML (`app.php`, fetched with the `visted=1` cookie) ships a complete catalog tree inline: **1 882 object/opening entries across 86 category buttons**, plus **456 texture entries**. Every entry is an `<a id="item<ID>">` / `<a id="texture<ID>">` with a `<title>` and a thumbnail `data-src` (OBSERVED: `catalog-aside.html`, `editor-page-raw.html`).
- **The catalog data model is a single inline JSON blob, `window.HP_BOOT`**, at the bottom of the editor HTML. It holds `objectOptions` (1 776), `doorOptions` (60), `windowOptions` (46), `objectCategories` (157, 1–2 levels), `floorplanTextureCatalog` (456), plus lookup maps `products` (1 882) and `textures` (456) (OBSERVED: `hp-boot.json`).
- **Models are glTF binaries loaded through Babylon.js `SceneLoader.ImportMesh`** from `/admin/objects/*.glb` — **1 881 of 1 882 entries are `.glb`, one is `.gltf`** — and the sample GLB is Draco-compressed (`KHR_draco_mesh_compression`), generator *Khronos glTF Blender I/O v3.5.30* (OBSERVED: `test.glb`, `test-glb-structure.json`, `deobf/hp-editor.deobf.js`).
- **Sizing and rotation are done with a Babylon `GizmoManager` in "bounding box" mode, restricted to Y-rotation and X/Z scaling**; free floor movement uses a `PointerDragBehavior` that rounds positions to a user-set grid ratio (default 1/0.125 = 8 per metre) while Shift is held (OBSERVED: `deobf/hp-editor.deobf.js`).
- **There is no physics engine and no true collision constraint for furniture.** Ammo/Cannon/Oimo are shipped as scripts but never referenced by any editor module; the only overlap logic lives in the **optional AI placement helper** (`window.HPAIPlace`), which scores placements and returns human-readable reasons like *"overlaps e<id>"*, *"intersects a wall"*, *"partly outside the room"* (OBSERVED: `deobf/hp-ai-place.deobf.js`, `js/*.js`).

---

## 2. Findings

### 2.1 Catalog categories and item counts

**OBSERVED** (`catalog-aside.html`, parsed from `editor-page-raw.html`; `hp-boot.json`).

The catalog drawer (`<aside id="mySidebar" class="hp-catalog">`) has **two tabs — "Objects" (`#tab1`) and "Textures" (`#tab2`)** — and each tab carries its own full category tree rendered server-side.

Objects tab, 86 category rows in a 1–2 level tree. Top-level categories with their advertised counts:

| Top-level | Count | Notable second level |
|---|---|---|
| Living room | 317 | Decoration 85, Electronics 21, Fixtures 14, Furniture 197 |
| Bedroom | 278 | Accessories 25, Electronics 35, Furniture 218 |
| Kitchen | 191 | Appliances 28, Fixtures 6, Furniture 106, Kitchenware 51 |
| Bathroom | 91 | Accessories 38, Fixtures 50, Furniture 3 |
| Doors and windows | 106 | Doors 67, Windows 39 |
| Stairs and railings | 53 | Indoor 37, Outdoor 16 |
| Lighting | 101 | — |
| Laundry and storage | 21 | Laundry 10, Storage 11 |
| Garden | 101 | Fences and gates 25, Garden furniture 14, Plants and trees 52, Other 10 |
| Leisure | 151 | Barbecue 7, Camping 11, Furniture 25, Games 6, Musical instruments 18, Playground 50, Pools and spa 10, Sports 24 |
| Vehicles and transport | 162 | Public spaces 81, Vehicles 81 |
| Tools and equipment | 29 | — |
| Other | 281 | Buildings 40, Geometric shapes 14, Gym 20, Hair salon 5, Healthcare 5, Infrastructure 23, Laboratory 3, Office 32, School 15, Shop 29, Miscellaneous 95 |

Textures tab, 28 category rows, e.g. Architecture 282 (Bricks 21, Concrete 15, Indoor tiles 72, Marble and granite 30, Outdoor tiles 19, Plaster 8, Roads and paving 30, Roofing 16, Stone walls 6, Wood 65) and Materials 119 (Carpet 9, Ceramic 1, Fabrics 52, Foam 4, Leather 8, Metals 40, Paper 2, Plastic 3), plus Nature 33.

Counts are self-consistent: the sum of the 16 object top-level counts is **2 316**, which equals 1 882 item anchors + 434 category-row repeats in the rendered tree. `HP_BOOT.objectCategories` has only **157 rows but 63 declared roots**, because the same leaf name (`Furniture`, `Electronics`, `Fixtures`, `Accessories`, `Other`) is reused under different parents — the category table is keyed by id, not name.

**Important caveat**: item ids in the tree are unique (1 882 `<a>` occurrences, 1 882 distinct ids, each appearing exactly once), so the tree is a partition, not a search index with duplicates.

### 2.2 The data model (`window.HP_BOOT`)

**OBSERVED** (`hp-boot.json`, parsed from the inline `window.HP_BOOT = {...}` in `editor-page-raw.html`; the editor reads it as `window['HP_BOOT']||{}` in `deobf/hp-editor.deobf.js`).

```
doorOptions[60]        {id, title, title_en, image, path, rotation_offset}
windowOptions[46]      {id, title, title_en, image, path, rotation_offset}
objectOptions[1776]    {id, title, title_en, image, path, slug, tokens[],
                        category, parent, grand_parent, door_window, rotation_offset}
objectCategories[157]  {id, category, category_en, parent, grand_parent}
floorplanTextureCatalog[456] {id, title, title_en, category, parent, featured, image, imagebump}
products{1882}         {id, file, model, doorWindow, door}       // keyed by id
textures{456}          {image, bump, occlusion, reflectivity, metallic}
suggestions{objects[], textures[]}
```

- `objectOptions` are the furnishable objects; `doorOptions`/`windowOptions` are wall openings and are **not** in `objectOptions` (0 overlap, verified), yet `products` (1 882) covers all three lists exactly — the union of the three lists is exactly the 1 882 tree item ids (0 difference both ways).
- `rotation_offset` is `null` for **every** one of the 1 882 entries as shipped (100 % null in `objectOptions`, `doorOptions` and `windowOptions`) — the field exists but is currently unused, i.e. per-item model orientation correction is a dormant hook.
- `door_window` is 0 for all `objectOptions` (openings never appear there).
- Object ids are non-contiguous in `objectOptions` (min 2, max 1907) because the same id space is shared with doors/windows; `products` is keyed by id and includes all of them.
- `products` is the fast model lookup: `{file, model, doorWindow, door}`; `model` is the absolute path `/admin/objects/<file>.glb`.
- `textures` is the map used when a texture thumbnail is clicked: `image` (albedo/color), optional `bump` (normal), `occlusion`, `reflectivity` (roughness) and `metallic`. Any of these may be `""` (the very first record has `metallic: ""`), and the editor guards each one before assigning it to the Babylon PBR material.
- `suggestions.objects` is a curated list of plain titles (e.g. "King bed with panelled headboard", "Red tufted leather two-seat sofa") that the AI assistant / autocomplete uses as a seed vocabulary.

### 2.3 Search

**OBSERVED** (`deobf/hp-panels.deobf.js`, `search-sofa.html`, `search-bed.html`, `search-chair.html`).

Search is **server-side, remote, and debounced**:

- Two search boxes exist — `#autocomplete-input` (Objects tab, `search_results`) and `#autocomplete-input2` (Textures tab, `search_results2`) — wired by the same factory; the query parameter is `search_term` and `search_term2` respectively.
- Input is debounced **220 ms** (`setTimeout(..., 0xdc)`), and **requires ≥ 2 characters** ("Type at least 2 characters"); 1 char clears results with `cat.minChars`.
- The request is `POST /parsers/search.php` with `application/x-www-form-urlencoded` body `search_term=<q>&lang=<lang>`. This is **the same origin** (`fetch("parsers/search.php", ...)`), so no CORS.
- A request-generation counter guards races; stale responses are dropped.
- The endpoint returns **raw HTML fragments** (`<a id="item_s<ID>" draggable="true">…<img…><b>Title</b></a>`). The client then promotes each result `a` to `role="button"`, `tabindex=0`, strips `class`/`style` from images and sets `loading="lazy"`.
- **`item_s<ID>` ids** are the search-result variant; the editor's delegated parser is `/^item(?:_s|_r)?(\d+)$/` — i.e. `_s` = search result, `_r` = recently used. All three map back to `products[id]`.
- **Result cap is 20 items** (I verified exactly 20 for `sofa`, `bed`, `chair`), and it is a **title/token substring search**: searching "bed" returns "White flatbed truck" and "Hospital bed", searching "chair" returns "Double school desk with chairs". No facets, no per-category filter, no sort control.
- Status messaging is explicit and localized: `cat.searching`, `cat.noResults` ("No results for “{q}”"), `cat.searchFailed` ("The search failed. Check your connection and try again."), `cat.recent` ("Recently used").
- **Recently-used strip**: the editor writes `localStorage['hp-catalog-recent']` (array of ids, `unshift`, capped at 12) whenever a catalog item is instantiated, dispatches a `hp-catalog-recent` window event, and the panel re-renders a `.hp-recent` block of up to **8** entries using `item_r<ID>` anchors. This is the only personalization in the catalog.
- Category navigation is a **drill-down with breadcrumbs** (`.hp-crumbs`), not a filter: clicking `.hp-cat-btn` pushes an entry `{ul, label}` and toggles `hp-path`/`hp-current` classes; there is an "All categories" (`cat.all`) crumb; empty lists get `hp-empty-list` + `data-empty="Nothing here yet"`. An internal builder creates `hp-recent` by *inserting before* `.hp-drill`, and hides the recent block when a level > 1 is open (`hp-recent-off`).
- Keyboard: Enter/Space on `.hp-item > a` or a result anchor triggers a click; Escape clears the search input.

### 2.4 Model formats and how models are loaded

**OBSERVED** (`hp-boot.json`, `test.glb`, `test-glb-structure.json`, `deobf/hp-editor.deobf.js`).

- **Content distribution**: `objectOptions` are 1 775 `.glb` + 1 `.gltf` (id 40, "Slim grey bottle vase", `/admin/objects/65xvase.gltf`); `doorOptions` 60/60 `.glb`; `windowOptions` 46/46 `.glb`. Total 1 881 GLB and 1 GLTF.
- **Thumbnails** are plain JPEG/PNG served from `/admin/imagedetails/<hash><name>.png|.jpg`; textures use `/admin/imagetextures/<hash><name>_1K_Color.jpg` etc. Ranges are 1K–2K by filename (`..._1K_albedo.jpg`, `..._2K_NormalDX.jpg`).
- **Load path** (editor): `BABYLON.SceneLoader.ImportMesh('', 'admin/objects/', <file>, scene, cb, null, errCb)` — the *relative* folder + filename form. `ImportMesh` is also used with an explicit split of a full path (`substring` up to the last `/` as root, remainder as scene filename) for project files and imports.
- **Every loaded model is flattened and merged**: sub-meshes with position data are re-materialed (`material.id = 'pbr'`, `backFaceCulling = false`), renamed `objsubmeshes`, and combined with `BABYLON.Mesh.MergeMeshes(list, true, true, null, false, false)` into a single mesh; doors/windows become id `door_window`, furniture becomes id `objmeshes`. Depth-sorted into `gizmoLists.objects`.
- **`loadModelTemplate(path)`** caches by path (`Map`) and returns the merged template mesh, so repeated instances of the same catalog item do not re-download or re-merge. `instantiateModel` clones/instantiates from that template.
- **Draco**: the sample GLB `r38bed.glb` (King bed, 415 520 bytes) declares `extensionsUsed: ["KHR_draco_mesh_compression"]` on all 8 primitives, has **0 images / 0 textures** (all materials are `pbrMetallicRoughness` colour factors, 8 materials, e.g. `baseColorFactor [0.239, 0.529, 0.0235, 1]`), 1 node, 1 mesh, and `generator: "Khronos glTF Blender I/O v3.5.30"`. So decoding depends on Babylon's Draco loader; the shipped `assets/babylonjs/babylonjs.loaders.js` contains the `draco_mesh_compression` / `dracoCompression` extension implementation and `js/hp-gltf.js` references `https://cdn.babylonjs.com/` and `https://cdn.jsdelivr.net/npm/` — note the actual Draco *decoder wasm* is a Babylon-CDN fetch, not a file in the shipped asset folder (INFERRED from `js/hp-gltf.js` constants; I did not observe the decoder request in a capture because no catalog model was placed during my capture window).
- The node has a non-trivial transform (`rotation: [0.7071,0,0,0.7071]`, `scale: [0.009696…]` uniform, `translation:[0,0,0.854]`), i.e. the models carry Blender's Z-up→Y-up correction and centimetre-ish authoring scale; the editor normalises this at placement time (see 2.5).
- Asset provenance is **DOCUMENTED** on the landing page (https://www.3dhouseplanner.com/): models come from Scopia / Resources.blogscopia, Andrew Kator & Jennifer Legaz (Kator Legaz), Blend Swap contributors, ArchiBit Generation, ArchiBase.net, "Free the models", and the **default catalog of Sweet Home 3D 7.0.2** — all stated as converted to **GLB**, under CC BY 3.0 / CC BY-NC-SA 2.5 IT / CC BY 3.0 US. (Relevant licensing risk for anyone copying the catalog, but not for behaviour re-implementation.)

### 2.5 Sizing, rotation and placement

**OBSERVED** (`deobf/hp-editor.deobf.js`, `deobf/hp-ux.deobf.js`, `editor-page-raw.html`).

- **Six dedicated `BABYLON.GizmoManager` instances** exist, one per element class: `objects`, `openings` (doors/windows), `walls`, `frames`, `roofs`, `polyRoofs`. Only one is attached at a time (`attachGizmo` detaches all others first, maps the mesh's class → manager).
- **Furniture gizmo config** (the `objects` manager, and the identical `openings` manager):
  - `boundingBoxGizmoEnabled = true`
  - `gizmos.boundingBoxGizmo.setEnabledRotationAxis('y')` → **yaw only**
  - `gizmos.boundingBoxGizmo.setEnabledScaling(true, true)` → non-uniform X/Z scaling enabled, Y locked
  - `boundingBoxDragBehavior.rotateDraggedObject = false`, `disableMovement = true` (`positionGizmoEnabled = false`, `rotationGizmoEnabled = false`)
  - `clearGizmoOnEmptyPointerEvent = true`
  - There is also a "roof-free" manager (`_0x82d17`) with scaling disabled and rotation axis `''` — used where objects must only be positioned.
- **Floor-plane dragging** is a separate `BABYLON.PointerDragBehavior({dragPlaneNormal: Vector3(0,1,0)})` attached to the selected mesh whenever a manager attaches. Its `validateDrag` rounds `x`/`z` to the grid ratio when the Shift key is held; `_0x2a7f7e` is set true on the Babylon `KeyboardEventTypes.KEYDOWN` for `"Shift"` and false on `KEYUP`/window blur.
- **Grid ratio** is a live slider (`snaptogridslider`, range 0.05–(floorHeight) step 0.05). Changing it sets `gridRatio = 1/value` and updates the label `gui.snap` = "Snap: {v} m". The **default is `gridRatio = 0.125`**, i.e. **0.125 m (12.5 cm)** snapping — *not* the 0.5 m used by CasaPlazAI. The slider is exposed in the Scene panel alongside wall height and thickness.
- **Numeric normalisation on drop**: `position.x = round(x * v) / v` with `v = Number(snapSlider.value)` — the same rounding is applied both in `validateDrag` and after the drop ray-cast (`createPickingRay` → `pickWithRay` against slabs of the current level, or a fallback ground-plane intersect, or a point 2.5 m in front of the camera).
- **Model normalisation at placement** (`placeObject`): the incoming record's `width`/`depth`/`height` are converted to **scale factors against the model's own bounding box** — `scaling.x = width/bbox.x`, `scaling.z = depth/bbox.z`, `scaling.y = height/bbox.y` — with an optional `uniformScale` `scaleInPlace(...)`. Rotation is `rotationQuaternion = Quaternion.RotationAxis(Axis.Y, rotation°·π/180)`, position `(x, 0, z)`, then `seatOnSupport(mesh, level)` sets Y.
- **`seatOnSupport(mesh, level)`** samples the support height at the object's centre and **four points at 40 % of its bounding half-extents** (corners), takes the **max** of those heights and drops the object onto it. That is how furniture sits on terrain, a slab or a floor.
- **`modelFootprint` / `modelAutoTurn`**: the editor can load a model *only to measure it* ("Failed to compute model footprint" / "Failed to load model for footprint detection" are the error strings), computes its min-area rectangle (`minAreaRect`, `polygonArea`, `polygonCentroid` helpers exist), stores `modelFootprint3d = {x, z, source}` and `modelAutoTurn`, and the floor-plan integration calls `FloorplanOrientation.footprintInSymbolFrame(size, offsetDeg)` / `resolveModelOffset({symbolFrontDeg, productOffsetDeg, userOffsetDeg, modelFootprint, target, autoTurn})`. So the catalog item's *symbol* (2D plan) footprint and its *3D* footprint are reconciled with a per-product rotation offset. This is the code that consumes the dormant `rotation_offset` field — and `_0x41ee5b` prefers the catalog's `rotation_offset` over a per-instance `productRotationOffset`.
- **Selection action bar** (`hp-ux.js`) exposes, per selection: `move` (key 1, legacy id `translate`, gizmo `positionGizmoEnabled`), `rotate` (key 2, legacy `rotate`, `rotationGizmoEnabled`), `box` (key 3, legacy `boundingbox`, `boundingBoxGizmoEnabled`), `focus` (key F), `props` (shown only if `window.HPBIM`), `ask` (AI, only if `window.HPAI`), `delete` (Del), `close` (Esc). The DOM also carries hidden legacy buttons `#translate`, `#rotate`, `#boundingbox`, `#delete` that the editor binds to — a compatibility layer between the old UI and the new one.
- **Copy/paste across floors**: `hp-editor` exposes copy/paste with a "paste to floor N" slider (`gui.copyHint`, `gui.pasteTo`, `copytofloorslider` 0–50), so a piece of furniture can be replicated onto other storeys.

### 2.6 Placement constraints, collision and overlaps

**OBSERVED** (`deobf/hp-editor.deobf.js`, `deobf/hp-ai-place.deobf.js`, `js/*.js` only for the presence of physics bundles).

- **There is no physics collider and no hard collision constraint in the manual placement flow.** I grepped the entire shipped JS and the deobfuscated output for `OimoJSPlugin`, `CannonJSPlugin`, `AmmoJSPlugin`, `PhysicsImpostor`, `checkCollisions` — **zero occurrences**, even though `assets/babylonjs/ammo.js`, `cannon.js` and `Oimo.js` are loaded as scripts by `app.php`. Placement is unconstrained: the drop handler just rounds x/z and calls `seatOnSupport`; nothing tests walls or other objects. You can therefore place a sofa halfway through a wall by hand.
- The **only** collision logic sits in `window.HPAIPlace` (`hp-ai-place.js`), the AI assistant's placement engine. It builds an oriented-box ("zone") per candidate, then `analyse`/`_0x44f0ae` returns a list of problems with kinds:
  - `{kind:'wall'}` — a footprint corner or edge is within `thickness/2 − 0.005` of a wall centreline (with a vertical overlap test against the wall's `baseY..baseY+height`).
  - `{kind:'outside_room'}` — not every footprint corner satisfies the room polygon test.
  - `{kind:'object', id:'e<uniqueId>'}` — oriented-box overlap (`_0x411140` with a 0.02 m epsilon) with another object at the same level, excluding the object's own support and flat items.
  - `{kind:'door', id}` — the box overlaps a door zone while `y0 < doorTop − 0.2`.
  - `{kind:'window', id}` — the box overlaps a window zone while `y1 > sill + 0.02` and `y0 < head`.
  and renders them as sentences: *"intersects a wall"*, *"partly outside the room"*, *"overlaps e<id>"*, *"blocks the door e<id>"*, *"covers the window e<id>"*.
- It also computes a **soft/hard penalty split**: `_0xf87d32` classifies problems into `{hard:[...], soft:number}` where, unless the target object is "tall", covering a **window is a soft penalty of 2.5** rather than a hard conflict; `_0x1e3960` adds **2.0 per overlapping low object** and **1.5 per near-wall corner**; `_0x1e3960`/`_0x315b21` quantise scores. Placement candidates are ranked by this score, i.e. it is a *scoring* system, not a boolean validator.
- The AI placement engine carries a **per-furniture-type rule table** (`window.HPAIPlace.TYPES`, ~45 entries, saved to `ai-place-types.txt`): each entry has `{id, k (regex over the item title in 10 languages), w:[min,max], d:[min,max], h:[min,max], place: 'wall'|'corner'|..., clear, back:'tall'|…, avoidDoorWall, rel:{to:[...], place:'facing'}, prio}`. Examples: `bed` → `place:'wall', clear:0.6, back:'tall', avoidDoorWall:true, prio:1`; `sofa` → `rel:{to:['tv','tv_stand'], place:'facing'}, clear:0.9`; `stairs` → `place:'wall', avoidDoorWall:true`; `car`/`motorcycle`/`bicycle` → vehicle rules. The regex includes Portuguese/Spanish/French/German/Russian/Chinese/Japanese/Korean terms, so it is *title*-driven, not id-driven.
- The AI **chat** tool (`hp-ai-chat.js`) has its own `place_object` and opening-placement paths that emit `warnings`, e.g. "overlaps another opening of the wall: no free space for this width" and "moved {n} m along the wall, clear of another opening (past a wall junction: now in the next room…)". So opening placement *is* validated and auto-nudged; furniture placement is only scored by AI, never blocked for the user.
- `hp-efficiency.js` uses `BABYLON.Ray.intersectsMesh` for **sun/shadow and tree-crown sampling**, not for furniture collision — it is a performance estimator, which reinforces that `intersectsMesh` in this codebase is for ray-casting/analysis, not rigid-body collision.

### 2.7 Custom import

**OBSERVED** (`deobf/hp-editor.deobf.js`, `editor-page-raw.html`, `deobf/hp-bim.deobf.js`).

- The public API is `HP3D.importFile(File)`; it returns a Promise and is invoked by the hidden `#import` button handler, by the BIM import dialog (`HPBIM.importFiles`) and by the AI chat (`importFile(file)` for a model the user attached).
- **Extension gate**: `['babylon','glb','gltf','obj','stl'].indexOf(ext) !== -1`, where `ext = file.name.split('.').pop().toLowerCase()`. Anything else is rejected. Note **no IFC or DXF** in this path — those go through the separate BIM/DXF pipelines, and the landing page advertises IFC/DXF/GLB/glTF/OBJ/STL import (DOCUMENTED, https://www.3dhouseplanner.com/ FAQ).
- Loading is `BABYLON.SceneLoader.ImportMesh('', '', file, scene, …)` — the **File object itself** as the scene source, i.e. a client-side blob URL, no upload.
- Post-processing mirrors the catalog loader but with import-specific ids: meshes with position data get `material.id='pbr'`; ids are re-tagged by name matching — `wall_merged`, `csg`, `door_window` (+ `door_window_binding_ref` for the binding plane), `4poly`, `wallslaves`, `polyt1/polyt2/polyt3` (renamed from `*_merged`), `ground2` → `ground2imp`, everything else → `objmeshes`. A `#merge` action exists that whitelists vertex-buffer *kinds* across meshes, zero-fills missing buffers, then `Mesh.MergeMeshes` the selection, marks it shadow-caster, ids it `objmeshes`, and hides the merge button.
- Imported models are registered as ordinary scene elements via `registerElement(mesh, kind, {level, meta, deferCut, silent})` with `kind` in `door|window|roof|object` — so an imported object behaves exactly like a catalog object (same `objmeshes` id, same selection bar, same gizmo manager, same save/export path). Metadata is written under `mesh.metadata.hp = {kind, level, name, …}`, and `mesh.metadata.hpModel`/`hpProductId` are stamped for catalog items.
- There is **no per-item import UI** (no "import into catalog", no favourites/custom library): the file is added to the current scene, and the only persistence is the project save. `localStorage['hp-catalog-recent']` is only written by the *catalog* click path, not by import.
- `hp-gltf.js` (`HPGltf`) is a **compression/export** helper, not the importer: `compressGlb`, `compressTextures`, `draco3d.encoder`, `draco_encoder.wasm` pulled from `https://cdn.jsdelivr.net/npm/` and `https://cdn.babylonjs.com/` (version string `"4.1.1"`), used by the BIM GLB exporter (`GLTF2Export.GLBAsync`) and the meshopt/draco dedup path.

### 2.8 Editor shell facts that shape the catalog UX

**OBSERVED** (`editor-page-raw.html`, `deobf/hp-panels.deobf.js`, `deobf/hp-ui.deobf.js`).

- **The editor is server-rendered PHP, not an SPA.** `app.php` returns a 2.09 MB HTML document containing the whole catalog tree, the whole i18n dictionary, and `window.HP_BOOT`; the UI is then progressively enhanced by ~29 `js.php?f=editor/…` modules that are byte-obfuscated (string-table + base64 accessor, aliased per function) and served with `?v=<hash>` cache-busting plus SRI `integrity` hashes.
- **The whole catalog HTML travels with every editor load** (≈741 KB of the 2.09 MB is the `<aside>` alone, `catalog-aside.html`). Thumbnails are lazy (`loading="lazy"` / lazyload instance, `textures/loading.gif` placeholder, `data-src` real URL).
- `app.php` on a *fresh* profile emits `<script>window.location.href='index.php'</script>` and serves the landing page — the editor only renders when the `visted` cookie is present. That is why a naive capture of `/app.php` shows the marketing page.
- i18n is a full inline dictionary with 10 languages (English, Português, Español, Français, Deutsch, Italiano, Русский, 中文, 日本語, 한국어), applied to the catalog via `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria`, `data-i18n-tip`. Every catalog string therefore has 10 translations (`cat.searchObjects`, `cat.minChars`, `cat.recent`, `cat.noResults`, `cat.groups`, etc.).
- The catalog is opened by `window.HPCatalog.open(tab)` (also aliased as legacy `window.w3_open`/`w3_close` from the old W3.CSS sidebar), with a `[data-catalog-close]` button, Escape-to-close, focus restore to the previously active element, and `body.hp-catalog-open` for layout. `document.getElementById('hpToolCatalog')` gets `.hp-active`. On viewports ≤700 px, choosing an item auto-closes the drawer (`matchMedia('(max-width: 700px)')`, 150 ms delay).
- Group headers exist inside leaf lists: `<li class="hp-item-group" role="presentation">Sofas</li>`, "Chairs", "Tables", "Bookcases", "Plants", "Vases", "Stones", "Decorative objects" — i.e. a **third level of grouping without navigation cost**, rendered as presentational rows inside the same `<ul>`.
- Numeric steppers (`.hp-stepper[data-for]`) wrap many range inputs with `−`/`+` buttons, press-and-hold auto-repeat (initial 380 ms delay, then 70 ms interval), an `aria-live` value readout and a diamond icon for non-length values. Sliders use `0.05` steps in metres for the snap grid.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each is tied to a finding above.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Add a "Recently used" strip at the top of the furniture palette**, persisted in `localStorage` (`hp-catalog-recent`, last 8–12 ids), re-rendered on a custom event. | 2.3, 2.8 | High — the palette currently has 7 items; recents is the cheapest way to make repeat furnishing fast. | Low |
| 2 | **Give the catalog a real data model with ids + a lookup map** (`products{id→{file, model}}`) rather than positional array indices, and keep per-item `slug`/`tokens` for search. | 2.2 | High — decouples search, recents, and project save/load from array order. | Low–Medium |
| 3 | **Move search client-side, over a prebuilt token index, with a 200 ms debounce and a 2-character minimum.** 3D House Planner's remote search caps at 20 title substrings and fails offline; CasaPlazAI has no backend, so an in-memory token index is both faster and consistent with the autosave-only architecture. | 2.3 | High — removes the round-trip and gives substring+fuzzy matching for free. | Medium |
| 4 | **Snap furniture to the same 0.5 m grid as rooms, and show the snap size as a labelled value** (their slider defaults to 12.5 cm and is labelled "Snap: 0.125 m"). Reuse the existing 0.5 m constant so furniture and walls agree. | 2.5 | High — one shared constant avoids the "furniture half-off the wall" class of bug. | Low |
| 5 | **Separate "move on floor" from "resize/rotate" in the interaction model**, the way 3D House Planner splits a floor-plane `PointerDragBehavior` from a Y-only-rotation / X-Z-only-scaling bounding-box gizmo (Y locked so nothing floats or sinks). | 2.5 | High — direct usability win, and it makes "no floating furniture" a structural guarantee rather than a physics problem. | Medium |
| 6 | **Seat furniture on the support surface by sampling the bounding-box footprint**, not just the centre point: sample the centre plus the four corners at 40 % of the half-extents and take the max. | 2.5 | Medium — prevents chairs sinking into sloped/flat-shaded floors and is ~15 lines. | Low |
| 7 | **Add a soft (non-blocking) collision/advisory layer for furniture**, modelled on the AI scorer: classify each conflict (wall / outside room / overlaps object / blocks door / covers window), split into hard vs soft penalties (a covered window is soft unless the item is tall), score candidates, and surface the reason sentence in a toast rather than refusing the placement. | 2.6 | High — gives the fit/collision UX without a physics engine, and keeps users unblocked. | Medium |
| 8 | **Express placement constraints as a small per-type rule table** (`place: wall|corner`, `clearance`, `back: tall`, `avoidDoorWall`, `rel: {to:[…], facing}`), keyed by a regex over the item title. Even a 10-entry table for bed/sofa/table/chair/counter/bathtub/toilet/cabinet would cover CasaPlazAI's whole palette, and it scales to a bigger catalog later. | 2.6 | High — makes "fit constraints" declarative and testable. | Medium |
| 9 | **Make openings (doors/windows) auto-nudge along the wall when they would overlap**, and report *why*: "moved 0.4 m along the wall, clear of another opening". | 2.6 | Medium–High — mirrors CasaPlazAI's shared-wall model and removes a common manual fiddle. | Medium |
| 10 | **Add group headers inside category lists** (`Sofas`, `Chairs`, `Tables` as presentational rows) so a large catalog stays scannable without another navigation level. | 2.8 | Medium — cheap once the catalog exceeds ~40 items. | Low |
| 11 | **Deep-link the palette state**: `open(tab)` an explicit tab, preserve the previously focused element, restore focus on close, close the drawer automatically on narrow viewports after a pick. | 2.8 | Medium — directly relevant to the single-workspace redesign (one workspace means the palette must not fight the canvas). | Low |
| 12 | **Normalise model units on import by measuring the bounding box and scaling to the requested W/D/H** (`scaling = target / bbox`), with an optional uniform scale. | 2.5 | Medium — makes arbitrary user glTF/GLB assets land at a predictable size. | Medium |
| 13 | **Support custom object import via `File` + in-memory loader, gated by extension, then treat the result as a first-class object** (same ids/metadata path as catalog items), with no upload and no separate library. | 2.7 | Medium — matches CasaPlazAI's no-backend constraint and needs no catalog write path. | Medium–High |
| 14 | **Persist a per-item yaw offset field now, even if unused.** 3D House Planner ships `rotation_offset` on all 1 882 records but every value is `null` — the hook exists and the reconciliation code (`productOffsetDeg` / `userOffsetDeg` / `autoTurn`) is already written around it. Adding the field to CasaPlazAI's catalog schema costs nothing today and avoids a migration later. | 2.2, 2.5 | Low–Medium | Very low |
| 15 | **Localise catalog strings from day one** with a keyed dictionary and `data-i18n*` attributes (they ship 10 languages). | 2.8 | Low now, high later | Low |
| 16 | **Serve thumbnails lazily with a placeholder and skeleton rows**; keep the palette data inline so first paint is one request. | 2.8 | Low–Medium — matters because their catalog DOM is ~740 KB on every load. | Low |

Anti-patterns to avoid, also tied to findings: do **not** ship multiple physics engines you never call (2.6); do **not** cap search at 20 server-side substring hits (2.3); do **not** encode the catalog as a server-rendered tree of 1 882 anchors (2.8); do **not** rely on a first-visit-cookie redirect to decide which page the user sees (2.8).

---

## 4. Unknowns / what I could not verify

1. **Live in-editor interaction was not observed.** My catalog-interaction scenario (`scenario-03-catalog.json` → `cap-03-catalog.json`) reached the editor and executed the first three steps (goto, settle, Escape press) with screenshots, but the run was cancelled before the catalog click, so I never captured a screenshot of the opened drawer, a search in flight, or a mesh being dragged. Everything in §2.4–2.7 is read from shipped bytes, not from watching the UI.
2. **Draco decoder runtime behaviour unconfirmed.** I did not observe a `/draco_decoder*.wasm` (or equivalent) request, nor a model fetch, in any capture — no catalog item was placed. The dependency is inferred from `js/hp-gltf.js` CDN constants plus the `draco_mesh_compression` code in the shipped `assets/babylonjs/babylonjs.loaders.js`. Whether the first catalog drop stalls on a CDN round-trip is untested.
3. **Search endpoint internals.** `/parsers/search.php` behaviour is only known from its HTML response for three queries. The ranking, whether `tokens`/`slug` are used server-side, the exact 20-cap rule, timeout behaviour and whether `lang` changes results are all unverified. I did not probe it further.
4. **`rotation_offset` semantics.** All shipped values are `null`; I can see the consuming code (`_0x41ee5b`, `modelFootprint`, `FloorplanOrientation.resolveModelOffset`) but not a single non-null example, so the sign convention and units (degrees vs radians, CW vs CCW) are unverified. Only the manual-placement path `rotation°·π/180` is confirmed for user rotation.
5. **BIM/IFC/DXF import paths.** I found `HPBIM.importFiles` and GLB/DXF/IFC export code, and the landing page claims IFC4/DXF/GLB/glTF/OBJ/STL import, but I did not analyse the IFC or DXF parsers (they are large: `hp-bim.js` is 484 KB) and cannot say how an imported IFC/DXF contributes objects to the catalog.
6. **No measurement of catalog size on disk or load time.** I have byte counts for the HTML (2 092 092 B) and the `<aside>` (740 929 B) and the sample GLB (415 520 B), but not the aggregate GLB weight of the 1 882 models, nor actual palette render timings.
7. **`objectCategories` anomalies unexplained.** 157 rows with 63 roots and heavy name reuse (`Furniture` appears as a root under several parents), while the rendered tree shows 86 buttons and 16 top-level object rows; I did not fully reconcile the id-based table with the rendered tree (the rendered tree's L1 list is clearly a *different* traversal from `HP_BOOT.objectCategories`'s `parent == 0` set).
8. **AI placement rules are read, not run.** The `TYPES` table and the scoring functions are transcribed from deobfuscated bytes; I did not execute `HPAIPlace.analyse` to confirm scores, units or the exact `_0x411140` overlap epsilon.
9. **Item-level `door_window` flag.** It is 0 for every `objectOptions` entry, and doors/windows live in separate lists — I could not find any code path where it is non-zero, so its purpose is unexplained.

---

## Evidence index

| File | What it is |
|---|---|
| `cap-01-home.json`, `home-*.png`, `home-settle2-dom.json` | Landing page capture (network, DOM, a11y, storage) |
| `cap-02-app.json`, `app-*.png`, `app-settle2-*.json` | `/app.php` capture — served the landing page (no `visted` cookie) |
| `cap-03-catalog.json` | Partial catalog-interaction scenario (cancelled after step 3) |
| `editor-page-raw.html` / `app-cookie.html` | 2.09 MB editor HTML (fetched with `visted=1`); source of `window.HP_BOOT`, the catalog `aside`, and all `#id` UI hooks |
| `app-page-raw.html` | `/app.php` without the cookie — shows the `window.location.href='index.php'` redirect |
| `catalog-aside.html` | The 741 KB `<aside id="mySidebar">` extracted for category/item parsing |
| `hp-boot.json` | Parsed `window.HP_BOOT` (all 7 keys, 1 882 + 456 records) |
| `ai-place-types.txt` | The `HPAIPlace.TYPES` per-furniture rule table |
| `js/*.js` | 29 shipped editor modules (obfuscated) |
| `deobf/*.deobf.js` | Deobfuscated output; `deobf.js` is my string-table deobfuscator |
| `test.glb`, `test-glb-structure.json` | Sample catalog model (King bed) and its parsed glTF JSON |
| `loaders.js` | `assets/babylonjs/babylonjs.loaders.js`, checked for the Draco extension |
| `search-sofa.html`, `search-bed.html`, `search-chair.html` | Raw `/parsers/search.php` responses (20 results each) |
| `http://www.3dhouseplanner.com/` (landing) | DOCUMENTED: features, FAQ, model attribution/licences |
