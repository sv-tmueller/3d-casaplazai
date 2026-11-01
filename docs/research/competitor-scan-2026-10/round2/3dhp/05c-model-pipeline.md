# 3D House Planner — Catalog Model Pipeline (GLB sampling, decoding, caching, LOD, aggregate weight)

Job: `09-05c-furniture-catalog-model-pipe` · Target: <https://www.3dhouseplanner.com/> (editor `/app.php`, models at `/admin/objects/*.glb`, 2D planner `2D-Planner/index.php`)
Round 2: builds on the round-1 report `<workspace>/rea-3dhouseplanner-2026-10/05-05-furniture-catalog/report.md` (read-only). Round-1 facts are reused, not re-derived; this report closes round-1 **Unknowns #2 (Draco decoder runtime behaviour), #6 (aggregate catalog weight and load time)**, and the model-pipeline half of **#4 (`rotation_offset` semantics)**.

Legend: **OBSERVED** = seen in a capture, HTTP response, downloaded byte stream or live JS state (evidence file named) · **DOCUMENTED** = stated on a vendor page (URL) · **INFERRED** = my deduction.

Method: (a) a full-catalog HTTP `HEAD` census of all 1 882 model URLs (`sizes/*`); (b) a stratified download of 26 GLBs — 20 objects across the 10 largest categories plus 3 doors and 3 windows — parsed at container/accessor/scene-graph level (`glbs/`, `glb_parse.py`, `glb_world.py`); (c) static extraction from the app's shipped Babylon.js 6.38.0 and the round-1 deobfuscated editor; (d) **a live headless-Chrome session driving the real editor over CDP with software GL** (`cdp-*.cjs`, `live-*.json`), in which I identified the lazy engine bootstrap, placed models, and measured the load pipeline end-to-end.

---

## 1. Summary

- **The catalog weighs 2 541 645 058 B ≈ 2.54 GB / 2.37 GiB across 1 882 GLBs** — objects ≈2.36 GB, doors ≈47 MiB, windows ≈17 MiB. Median model 321 KB, mean 1.35 MB, max 31.3 MB; 515 models are <64 KB and 112 exceed 5 MB (OBSERVED: `sizes/all.tsv`, `sizes/census-joined.json`).
- **Draco is mixed per-file (21/26 sampled) and its payoff ranges from 43× to 0.42×.** Four exporter vintages coexist (Blender I/O v1.1.46/v3.3.27 uncompressed, v3.5.30 and v3.6.27/28 Draco) plus one glTF-Transform file, so the loader must handle both paths. On tiny meshes Draco *inflates* the file (`8drframe8` 0.42×, `eldtvstand` 0.79×) while the poly-heavy tail compresses 5–43× (OBSERVED: `glb-analysis.json`, `glb-world.json`).
- **Models are authored in centimetres with a non-origin-centred origin and rely entirely on the loader to re-seat them.** All 26 sampled files put the file origin *above* the lowest vertex (floor gap −0.05 m to −4.58 m) and the X/Z centre off the model centre; the loader bakes XZ to zero and drops minY to the support. Reading accessor `min`/`max` without applying the node TRS gives the wrong box for 26/26 (OBSERVED: `glb-world.json`; live `live-pipe.json` confirms the world boxes and that live `worldMinY` is uniform at the floor).
- **The Draco decoder is real and was observed being fetched**: Babylon.js 6.38.0, `DecoderAvailable = true`, 4 workers, decoder pulled from **`cdn.babylonjs.com`** (`draco_decoder_gltf.wasm` 192 420 B + `draco_wasm_wrapper_gltf.js` ×4 parallel) on the first Draco model — the app never overrides the default config (OBSERVED: `live-pipe.json`, `live-cache.json`, `assets/babylon.js`).
- **There is no LOD at all, and caching is broken in the hot path.** Zero `LOD`/`addLODLevel`/`simplify`/`decimat*` in any shipped module; and although a path-keyed template cache exists and works when called directly (`loadModelTemplate` second call = 0 ms, 0 requests), the **catalog click handler bypasses it and calls `SceneLoader.ImportMesh` directly**, so the same GLB is re-downloaded and re-decoded on every click (OBSERVED: `live-cache.json`; static `_0x147a48` vs `_0x250a8e`). Measured: 9 ms → 3.1 s decode, and **20.1 s for the 19 MB `l6kTree` (3.5 M vertices)** (OBSERVED: `live-timing.json`, `live-big2.json`).

---

## 2. Findings

### 2.1 Sample set and method

**OBSERVED.**

1. **Full census.** All 1 882 model URLs in `HP_BOOT` (`objectOptions` + `doorOptions` + `windowOptions`; round-1 §2.2) were `HEAD`-requested: 1 882/1 882 rows, all HTTP 200 (`sizes.sh`, `sizes/all.tsv`). Sizes are byte-exact because Cloudflare serves GLB with a correct `Content-Length` and no transfer compression.
2. **Stratified download.** 26 GLBs seed-selected from the 10 largest object categories plus 3 doors and 3 windows, downloaded with URL-encoding for the 297 catalog paths that contain spaces (`sample_glbs.py`, `sample-list.json`, `sample-meta.json`).
3. Parsers: `glb_parse.py` (container/extensions/materials/textures/topology), `glb_world.py` (scene-graph-aware world bbox, origin convention, Draco byte accounting).
4. **Live editor session.** Headless Chrome 156 launched with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, driven over CDP with `playwright-core` from the `rea` package. Headless Chrome on this host **does** expose WebGL 2.0 via SwiftShader (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)))`, OBSERVED `live-probe.json`), so round 1's "no WebGL" limitation is resolved; the real blocker was that the engine is created lazily (see §2.9).

### 2.2 Aggregate catalog weight

**OBSERVED** (`sizes/all.tsv`, `sizes/census.json`, `sizes/census-joined.json`).

| Statistic | Bytes |
|---|---|
| **Total catalog** | **2 541 645 058 B ≈ 2.37 GiB / 2.54 GB** |
| Mean / Median | 1 350 502 / 321 022 |
| p75 / p90 / p95 / p99 | 1 390 956 / 3 836 488 / 5 755 948 / 13 706 956 |
| Min / Max | 1 704 (`Tetrahedron`) / 32 788 428 |
| Top 10 / 50 / 100 share | 9.3 % / 27.7 % / 40.8 % |
| Count >1 / >2 / >5 MiB | 569 / 342 / 112 |
| Count <64 KiB | 515 |

By kind — objects: 1 776 files, 2 474 169 998 B (mean 1 393 114); doors: 60 files, 49 380 036 B; windows: 46 files, 18 095 024 B.

Heaviest models (OBSERVED, joined to `HP_BOOT.title_en`):

```
31.27 MB  id 1666  Buildings            Grey high-rise apartment complex
24.86 MB  id 1660  Buildings            Grey office building on plot
23.80 MB  id 1690  Furniture            Wood kitchen with red worktop
23.19 MB  id 1672  Buildings            Log cabin with barbecue terrace
22.53 MB  id 1538  Plants and trees     Mesquite tree
21.93 MB  id 1740  Kitchenware          Orange meal tray with dishes
21.54 MB  id 1356  Outdoor              Classic stone staircase with balusters
21.04 MB  id 1540  Decoration           Bushy shrub in white pot
```

Lightest: `Tetrahedron` 1 704 B, `Yellow wooden crate` 1 932 B, `Square pyramid` 1 992 B, `Grey three-rail fence` 2 020 B.

Weight by category (object only, top rows): Furniture 549 files / 692 MB (mean 1.29 MB) · Plants and trees 52 / 187.8 MB (mean 3.70 MB) · Buildings 40 / 168.8 MB (mean 4.32 MB) · Pendant and ceiling lights 61 / 150.1 MB · Decoration 85 / 133.4 MB. **So the tail is nature, buildings and lighting, not furniture** — but Furniture alone is still 692 MB.

Round 1 measured the catalog *tree* shipped inline on every editor load (741 KB). The model bytes are lazy, but ≈2.54 GB makes any "download the catalog for offline use" design impractical — and that is before the 456 texture sets (not measured here).

### 2.3 Container, topology, Draco and the per-file mix

**OBSERVED** (`glb-analysis.json`, `glb-world.json`).

All 26 sampled files are valid GLB v2 with a single embedded BIN chunk and **zero external `buffer.uri` references**, so a model is exactly one HTTP fetch with no sidecar `.bin`. No skins, animations or cameras in any sample; all primitives are triangle-mode.

| file | bytes | Draco | prims | mats | images | image B | est. tris |
|---|---|---|---|---|---|---|---|
| `l6kTree N090818.glb` | 19 195 424 | yes | 3 | 3 | 0 | 0 | 1 166 058 |
| `jeqbush.glb` | 7 935 460 | yes | 1 | 1 | 0 | 0 | 381 491 |
| `uywpendant.glb` | 7 723 672 | **no** | 9 | 9 | 0 | 0 | 185 486 |
| `pvcRack kitchen 1 N140119.glb` | 2 369 260 | yes | 2 | 2 | 1 | 2 334 768 | 2 725 |
| `12aDoor3.glb` | 1 175 228 | **no** | 4 | 4 | 0 | 0 | 44 829 |
| `w8nchair2.glb` | 575 096 | **no** | 2 | 2 | 0 | 0 | 21 600 |
| `8drframe8.glb` | 82 416 | yes | 5 | 5 | 3 | 75 491 | 88 |
| `6q2tableBasse.glb` | 4 212 | yes | 2 | 2 | 0 | 0 | 312 |

Structural facts:

- **Four exporter vintages coexist**: `Khronos glTF Blender I/O v1.1.46` and `v3.3.27` are **uncompressed** (`12aDoor3`, `w8nchair2`, `lusreflex_cameraf`, `uywpendant`); `v3.5.30` and `v3.6.27/28` are Draco; `kulwindow2.glb` is `glTF-Transform v4.3.0` (uncompressed). Extensions track the vintage — newer files add `KHR_materials_ior` and `KHR_materials_specular`; `kulwindow2` adds `KHR_materials_volume` for real glass.
- **21/26 use `KHR_draco_mesh_compression`, 5/26 do not.** The editor cannot assume either.
- **Textures are rare and cheap; geometry dominates.** Only 7/26 files embed any image; total embedded image bytes in the sample ≈2.66 MB vs ≈34.6 MB of geometry. `pvcRack kitchen 1` is the extreme (2 334 768 of 2 369 260 B = 98.5 % is one texture). No sampled primitive used `COLOR_0`; many models use only `pbrMetallicRoughness` factors.
- **Material density varies 1–30** (`9nqlocomotive` has 30). Live measurement shows this survived merging as a `MultiMaterial` with 2–15 subMeshes per placed object (`live-pipe.json`), i.e. **one merge does not mean one draw call**.
- **297 of 1 882 catalog paths contain a literal space** and 386 have uppercase in the filename (OBSERVED by counting `HP_BOOT`). The live loader handles both correctly (`live-big2.json`: `/admin/objects/l6kTree N090818.glb` → 200, 19 195 424 B), but the app's own 404 page is returned for a mismatched path with no fallback.

### 2.4 Draco effectiveness: measured, not assumed

**OBSERVED** (`glb-world.json`; ratio = estimated uncompressed / actual compressed).

| file | ratio | compressed B | est. uncompressed B |
|---|---|---|---|
| `2gxrack10.glb` | **43.4×** | ~5.4 k | ~234 k |
| `b6rticketmachine.glb` | 17.0× | ~3.7 k | ~62 k |
| `goecontainership.glb` | 11.9× | ~12.3 k | ~147 k |
| `6q2tableBasse.glb` | 11.9× | ~0.2 k | ~2.1 k |
| `x2pdoor6.glb` | 8.8× | ~3.2 k | ~28 k |
| `6rwGlass wine…` | 7.1× | ~13 k | ~93 k |
| `l6kTree N090818.glb` | 7.0× | ~2.7 MB | ~19.2 MB |
| `jeqbush.glb` | 5.1× | ~1.6 MB | ~7.9 MB |
| `pvcRack kitchen 1` | 3.1× | ~10 k | ~32 k |
| `eldtvstand.glb` | **0.79×** | ~14 k | ~11 k |
| `8drframe8.glb` | **0.42×** | ~1.8 k | ~0.8 k |

Draco is a large win exactly where the 2.54 GB lives (the poly-heavy tail) and a loss on tiny meshes where container/index overhead dominates. That is an argument for a size threshold rather than blanket compression (§3 #6).

### 2.5 Units, origin and orientation — and why the loader has to fix them

**OBSERVED** (`glb-world.json`, `glb-analysis.json`; confirmed live in `live-pipe.json`).

- **Authoring scale is centimetres.** Raw `POSITION` bounds are tens-to-thousands; each file carries a compensating uniform node `scale` (`6q2tableBasse` raw 120 × 50 × 45, scale 0.02014; `8drframe8` raw 25.4 × 3.0 × 52.5, scale 0.02421; `pvcRack kitchen 1` raw 0.015, scale 23.8; `goecontainership` scale 1.57 as an outlier). **World size is only correct after applying the node TRS** — reading accessor `min`/`max` alone is wrong for 26/26.
- **Axis correction is in the node rotation.** 20/26 carry `rotation ≈ [0.7071, 0, 0, 0.7071]` (+90° about X, Blender Z-up → glTF Y-up). Others are free: `eldtvstand` ≈ −90° about Y, `8mlSconce` an arbitrary 3-axis quaternion, `kulwindow2` a **180° Z flip with `scale [1,−1,1]` (a mirror)**, `b6rticketmachine`/`n64Window` −90° about X.
- **The file origin is not the floor centre and not the model centre.** World-space boxes show the origin sits *above* the lowest vertex in every sample: loft bed `8zubunkbed5` 1.32 × 2.09 × 2.81 m with floor gap −1.07 m; Tulip chair 0.58 × 0.90 × 0.71 m, gap −0.41 m; `4pbdoor3` 0.83 × 2.20 × 0.20 m, gap −1.12 m; `l6kTree N090818` 5.18 × 7.05 × 4.58 m, gap **−4.58 m**; `goecontainership` 41.96 × 267.93 × 265.70 m, gap −33.97 m.
- **The loader re-normalises both**, in two places:
  - `_0x7cf4ee` (template build), after merging: `refreshBoundingInfo()` → `boundingBox.center` → **if |cx| > 1e-4 or |cz| > 1e-4 then `bakeTransformIntoVertices(Matrix.Translation(-cx, 0, -cz))`** → refresh again. X/Z centre is baked to zero; Y is deliberately untouched.
  - `_0x15d686(obj, supportY)`: `minimumWorld.y` → **`obj.position.y += supportY − minWorldY`**.
- Live confirmation (`live-pipe.json`, three placed objects): local box == world box == the sample's computed world box to 4 dp (bed 3.1293 × 1.4583 × 2.2691 m), `worldMinY = −0.06` for **all** of them (a uniform 6 cm dip — consistent with `HP3D.supportYAt(0,0,0) = −0.06` on bare terrain), `scaling ≈ 1.0` (no per-instance normalisation), `rotationQuaternion = [0,0,0,1]`, and **localMin.x/z = ±half-extent** exactly, proving the XZ bake.
- Net convention: **`file → apply node TRS → merge → bake XZ centre to 0 → keep Y → drop so minY = supportY → apply user yaw / W-D-H scaling`**.
- **The bed is not placed at its catalog dimensions.** Live `localBox` is 3.13 × 1.46 × 2.27 m, but a King bed's nominal W/D/H should be ~2.0 × 2.1 m. So the palette path does **not** scale the model to declared dimensions: the model lands at its raw world size. This is now explained exactly (OBSERVED): the parameterised API `placeObject(rec)` *does* size-normalise — `scaling.x = rec.width / bbox.x`, likewise depth/height, with optional `uniformScale` (`_0x54e3c9` measures the box, then each axis is scaled only if the corresponding `rec` field is > 0) — **but `HP_BOOT.objectOptions` records carry no `width`/`depth`/`height` fields at all** (keys are exactly `category, door_window, grand_parent, id, image, parent, path, rotation_offset, slug, title, title_en, tokens`), and the palette click handler `_0x147a48` never calls `placeObject` in the first place. So round 1's "target W/D/H scaling" belongs to the **AI/BIM/`placeObject`** path, and there is nothing to scale to at palette-click time.

### 2.6 Decoder loading — OBSERVED end-to-end

**OBSERVED** (`live-pipe.json`, `live-cache.json`, `assets/babylon.js`).

The first Draco model placed produced this exact sequence (timestamps in `live-pipe.json`):

```
/admin/objects/r38bed.glb            200  415520 B
https://cdn.babylonjs.com/draco_decoder_gltf.wasm      200  192420 B  application/wasm
https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js   200  ×4 parallel (one per worker)
```

- Babylon.js **6.38.0** is served first-party from `/assets/babylonjs/babylon.js` (4 964 149 B, saved as `assets/babylon.js`).
- Live `BABYLON.DracoCompression.Configuration.decoder` = `{wasmUrl: cdn.babylonjs.com/draco_wasm_wrapper_gltf.js, wasmBinaryUrl: …/draco_decoder_gltf.wasm, fallbackUrl: …/draco_decoder_gltf.js}`; `DecoderAvailable === true`; `GetDefaultNumWorkers() === 4` (`min(floor(hardwareConcurrency/2), 4)`, `navigator.hardwareConcurrency = 18`); `BABYLON.Tools.ScriptBaseUrl === ""`.
- **The app never overrides this.** `grep` for `ScriptBaseUrl` / `DracoCompression` in `editor-page-raw.html` and all 29 shipped `js/*.js` returns nothing; only `hp-gltf.js` mentions Draco, for its *encoder*.
- **The decoder is fetched once and re-used across models** (OBSERVED: the second and third model loads trigger only the wrapper scripts, no further `.wasm` request), because Babylon caches the module. So the CDN dependency is a one-time cold-start cost per session — but it means 21/26-model-format support is **offline-broken** until that fetch succeeds (INFERRED).
- Measured round-trip: wasm 192 420 B in ~200 ms; the four parallel wrapper requests are ~30 ms each from the same edge.
- **Draco decode timings** (`live-timing.json`, cold template cache, `performance.now()` around `HP3D.loadModelTemplate`):

| model | file B | verts | indices | ms |
|---|---|---|---|---|
| `12aDoor3.glb` (raw) | 1 175 228 | 28 194 | 134 487 | 238 |
| `6q2tableBasse.glb` (Draco) | 4 212 | 390 | 936 | 211 |
| `r38bed.glb` (Draco) | 415 520 | 80 314 | 350 934 | 510 |
| `w8nchair2.glb` (raw) | 575 096 | 13 850 | 64 800 | 718 |
| `jeqbush.glb` (Draco) | 7 935 460 | 1 144 473 | 1 144 473 | 3 102 |
| `l6kTree N090818.glb` (Draco) | 19 195 424 | 3 498 174 | 3 498 174 | **20 137** |
| cached re-request (all of the above) | — | — | — | **0** |

The 19 MB tree is ≈4× slower than the bush for ≈3× the vertices, so the tail is roughly linear in decoded vertex count with a base of ~200 ms. Note the raw `jeqbush` decode expands to 1.14 M vertices from 7.9 MB — i.e. this is not a "compressed-file-only" problem.

### 2.7 Caching — three mechanisms, and the hot path misses all of them

**OBSERVED** (`sizes/census.json`, `live-cache.json`, `live-timing.json`; static `_0x7cf4ee`, `_0x250a8e`, `_0x147a48`).

**A. HTTP — broken by the server.** Of all 1 882 model responses, **0 return `Cache-Control` and 0 return an `ETag`**; the only cache-adjacent headers are `last-modified` and Cloudflare `cf-cache-status: DYNAMIC`. `Accept-Encoding: gzip, deflate, br` produced **no `Content-Encoding`** (GLB is served raw), which is why the census is exact. The browser can only use heuristic freshness from `Last-Modified` (files are ~3.5 years old, so usually re-used within a session, never validated). The **decoder CDN**, by contrast, does send `cache-control: max-age=3600, s-maxage=86400`.

**B. In-memory template cache — exists, correct, and bypassed by the palette.** The loader holds a module-scoped `Map` keyed by path and stores the **Promise**, so concurrent duplicates coalesce:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

The cached artefact is an **invisible, unregistered template** (`id/name = "hp_template"`, `doNotSerialize = true`, `metadata.hpTemplate = path`, `setEnabled(false)`, `isPickable = false`, `removeMesh` from the scene). `instantiateModel` does `template.clone("objmeshes", null, true)` and clones the material.

Direct-call verification (`live-cache.json`):

| call | requests | ms |
|---|---|---|
| `loadModelTemplate('/admin/objects/r38bed.glb')` 1st | 12 (GLB + Draco + others) | 510 |
| `loadModelTemplate(same path)` 2nd | **0** | **0** |
| `instantiateModel(same path)` | **0** | — |
| `instantiateModel(same path)` again | **0** | — |

**C. The catalog click path bypasses B entirely.** The delegated handler parses `id` with `/^item(?:_s|_r)?(\d+)$/`, looks up `HP_BOOT.products[id]`, and calls a dedicated function `_0x147a48` which does **its own `SceneLoader.ImportMesh('', "admin/objects/", record.file, scene, cb)`**, re-materials/re-ids sub-meshes, merges, sets `metadata.hpModel`/`hpProductId`, writes the recents entry, and never touches the `Map`. Bigger models go through `instantiateModel` (→ the cache) only from the parameterised `placeObject` API used by AI/BIM/import paths. Measured consequence (`live-cache.json`):

| action | GLB requests |
|---|---|
| Direct `loadModelTemplate` (1st) | 1 |
| Direct `loadModelTemplate` (2nd, same path) | **0** |
| **Real 1st catalog click on `#item2`** | **1** |
| **Real 2nd catalog click on the same `#item2`** | **1 (re-downloaded, cf-cache-status: DYNAMIC)** |

So **placing the same bed twice downloads 415 520 B twice and Draco-decodes it twice**, and `Scenes.meshes` ends with 4 `objmeshes` for 2 logical placements. Independent cross-check from the earlier run: 6 GLB requests for 6 placements of 3 distinct models. The two mechanisms `loadModelTemplate` and `_0x147a48` are literally two different merge pipelines (`hp_template`+`objmeshes` vs `objsubmeshes`→`objmeshes`, material id `import` vs `pbr`), i.e. duplicated code that drifted apart.

**D. Nothing is persisted.** The cache is an in-memory `Map`; no IndexedDB, no Cache Storage and no service worker on this origin across 121+ responses. A reload re-downloads everything.

### 2.8 LOD — none

**OBSERVED** (`grep` over all 29 shipped modules + `editor-page-raw.html`; `glb-analysis.json`).

- Word-boundary `LOD` → **0 matches** across every shipped module. `addLODLevel`, `simplify`, `decimat*` → 0. No sampled GLB declares `MSFT_lod` or `MSFT_variants`. There is no runtime decimation and no distance-based mesh swap.
- The only reductions are (a) **Draco**, a load-time size cut (§2.4), and (b) **`Mesh.MergeMeshes`**, a draw-call cut that live measurement shows leaves 2–15 subMeshes per object — so it is a partial cut at best.
- LOD-adjacent code exists only for **props**: `hp-terrain-detail.js` uses `thinInstanceCount`/`thinInstanceSetBuffer` for terrain scatter; `hp-efficiency.js` does ray-based shadow/crown sampling. `createInstance` appears once, for a selection-marker sphere. **No placed catalog object is instanced or thinned.**
- Consequence: a placed tree is drawn at 3.5 M vertices at every distance, and N copies are N full geometry clones (the cache stores one template per path, but each instance is a deep clone). With 112 models >5 MB this is the pipeline's biggest scalability gap.

### 2.9 Editor bootstrap, and the 2D planner bridge

**OBSERVED** (`live-floor.json`, `live-pipe.json`, `live-controls.json`; static round-1 deobf).

- **The Babylon engine does not exist until the user starts designing.** My first four headless runs all showed `BABYLON.Engine.Instances.length === 0`, `HP3D === undefined`, and 1 882 catalog anchors present. The engine is created inside the `#definefloor` ("Start designing") click handler: `B = new BABYLON.Engine(renderCanvas, false, {preserveDrawingBuffer: true, stencil: true})`. After that click: `engine = 1`, `HP3D` appears with ~120 public members, `canvas` is resized to the viewport (1600 × 913), and catalog clicks place meshes. This is why round 1 never saw a model fetch — and it is a genuinely useful UX fact (nothing 3D is paid for until the user commits).
- **`HP3D` is a large documented-by-inspection API**: `catalog {doors 60, windows 46, objects 1776, categories 157, textures 456}`, `floorHeight() = 2.65`, `levelBase(0)=0`, `levelBase(1)=2.65`, `defaultWallHeight()=2.65`, `defaultWallThickness()=0.2`, `supportYAt(0,0,0) = −0.06`, plus `loadModelTemplate` / `instantiateModel` / `placeObject` / `importFile` / `worldBounds` / `footprintOf` / `minAreaRect` / `seatOnSupport` / `gizmoManagers`.
- **The 3D view switch is a hidden legacy checkbox.** The visible top-bar control is a `.hp-seg-btn` group with `data-view` in {`3d`, `walk`, `top`, `2d`}; it drives `#viewcheck` (2D/top) and `#cameracheck` (Walk) and a class toggle. The editor also has a first-class tool-card layout (`#hpToolCard` with `viewtab` / `tooltab` / `extensiontab`), consistent with round 1's "single-workspace" reading.
- **The 2D planner is a same-origin iframe** (`#floorplanFrameContainer`, `2D-Planner/index.php`) synced through `window.HPSync`: `buildAt/moveBuild/rotateBuild/deleteBuild` operate on a mesh by `uniqueId`, and `projectNow()` extracts a plan via a function that, for catalog objects, resolves `products[path]` → `FloorplanCatalog.bestItemForProduct` → `resolveModelOffset({symbolFrontDeg, productOffsetDeg, userOffsetDeg})` → `footprintInSymbolFrame({x: |bbox.x*sx|, z: |bbox.z*sz|}, offsetDeg)`. The 2D symbol therefore comes from the **model's real world bounding box × current scaling**, not from nominal dimensions — which is only sane because §2.5's bake made the box trustworthy.
- `rotation_offset` (round 1: `null` on all 1 882 records) is preferred over a live `productRotationOffset`, is treated as **degrees**, and is passed through `isQuarterTurnOdd`. With every value `null` it never fires; the hook is exactly where round 1 said it was. My attempt to read a composed plan record live failed (`HP3D.listElements` needs different arguments than I passed — `TypeError`), so the end-to-end 2D symbol was still not observed.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each is tied to a finding and, where relevant, to the CasaPlazAI plan schema.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Make the palette click path and the programmatic path use one cached loader.** This is the single highest-value finding: their cache works but the palette bypasses it, so the same asset is re-fetched and re-decoded on every click (verified 4 re-downloads for one bed). One `getTemplate(path)` returning a cached `Promise<Mesh>` + `template.clone()`, used by *both* the palette and import, and a unit test asserting `requests == 1 for two placements of the same item`. | 2.7 | **Very high** — turns a 3 s / 20 s repeat cost into ~0. | Low |
| 2 | **Store `{bytes, triangles, hasDraco, loadMs}` per catalog record** and show a size badge / sort by size. The weight is concentrated (top 100 = 40.8 %) and the worst case is 20 s; warn before that drop, or offer a "lite" palette view. Store it in the catalog type so it survives into the saved plan's provenance. | 2.2, 2.4, 2.6 | High — pure metadata, prevents the worst UX cliff. | Low |
| 3 | **Normalise on import by measuring the *world* box after node TRS, then re-centring X/Z and seating minY = support** — the `bakeTransformIntoVertices(Translation(-cx,0,-cz))` + `position.y += supportY − minWorldY` pair. Never read accessor `min`/`max` as the box: 26/26 need the transform and one file carries a mirror (`scale [1,−1,1]`). Bake the result, not the raw numbers. | 2.5 | High — the single bug class that makes arbitrary glTF float, sink, or sit off-centre. | Medium |
| 4 | **Persist the normalised box in the plan, not the file numbers.** When furniture is autosaved to `localStorage`, store `{sizeX,sizeY,sizeZ,minY}` already world-normalised, so reopening a plan never re-depends on the source file's scale/axis quirks — and so a catalog update can't silently resize existing plans. | 2.5, 2.9 | High — plan round-trip integrity. | Low |
| 5 | **Serve models with `Cache-Control: max-age=31536000, immutable` + a content-hash name and `ETag`.** They ship 0/1882 with either. Add the in-memory `Map<path, Promise>` template cache with failure eviction (their `map.delete` on null is the right detail, keep it). | 2.7 | High — with 2.54 GB of models this is the highest-leverage server-side fix. | Low–Medium |
| 6 | **Bundle the decoder locally; never depend on a CDN for a mandatory decoder.** Their `DecoderAvailable` is `true` purely because `cdn.babylonjs.com` is reachable, and the config is never overridden — one line from a total Draco outage. Vendor the 192 KB `.wasm` + 57 KB wrapper, or at least preload lazily on first palette hover and degrade to "this item can't render" with a clear message. | 2.6 | High — deterministic and offline-safe; also removes a cold-start round-trip. | Low |
| 7 | **Add LOD, because they have none.** Generate 2–3 decimated variants by triangle budget (>200 k, >50 k, else none) and swap by distance/instance count; or hard-substitute a billboard/box for >500 k-triangle items beyond N metres. Zero `addLODLevel`/`simplify` anywhere plus a 3.5 M-vertex tree is the clearest opening, and it is what protects Walk mode's frame rate. | 2.8, 2.2 | High — the only structural fix for large scenes. | Medium–High |
| 8 | **Decide Draco per model by measured size, not blanket.** Their own data shows 0.42× and 0.79× on small meshes, 43× on heavy ones. Use a threshold (keep raw below ~8 k triangles / ~20 KB), record the measured ratio, and verify the decoder is present before choosing. | 2.4, 2.3 | Medium — cheap and measurable; avoids shipping *larger* files. | Low |
| 9 | **Merge for memory, but count draw calls.** Their merge still yields a `MultiMaterial` with 2–15 subMeshes per object (one had 30 materials), so merging did not achieve one draw call. Aim for one material/submesh per catalog item at bake time. | 2.3, 2.8 | Medium — real render-cost win, easy to measure. | Medium |
| 10 | **Collide on the normalised footprint**, reusing round-1's AI-scorer kinds (`object`/`wall`/`outside_room`/`door`/`window`) but computed from the merged box (post-bake XZ centre + centre offsets), matching how they derive the 2D symbol from `worldBounds` × scaling. | 2.5, 2.9 | Medium — makes the collision model agree with what the user sees. | Medium |
| 11 | **Keep one model = one fetch.** 26/26 sampled GLBs embed their BIN and 20/26 embed no image, so a single request is the norm; don't split geometry and textures into sidecars for small items. | 2.3 | Medium — simplifies the loader and the cache key. | Low |
| 12 | **Add the per-item yaw-offset field now, unused.** They ship `rotation_offset` on all 1 882 records with every value `null`, yet the consuming code already exists (degrees, modulo `isQuarterTurnOdd`). Adding it to CasaPlazAI's catalog type costs nothing and prevents a migration. | 2.9 | Low–Medium | Very low |
| 13 | **Don't create the 3D engine until the user commits.** Their `#definefloor` bootstrap is a genuinely good pattern for a single-page app: the palette, plan and inspector are instantly usable and no WebGL context or Babylon payload is spent until "Start designing". Worth mirroring explicitly in the Plan/3D/Walk redesign — create the engine on the first switch to 3D or Walk, and keep a clear fallback if WebGL is absent. | 2.9 | Medium — start-up cost and battery, plus graceful degradation. | Low |
| 14 | **URL-encode model paths at the catalog boundary and provide a fallback.** 297 catalog paths contain literal spaces; their own server 404s a mismatched path and the loader logs "Model could not be loaded". A single encode step plus a thumbnail placeholder on failure avoids a silently empty room. | 2.3 | Low–Medium | Very low |

Anti-patterns to avoid, tied to findings: do **not** keep two divergent model-merge pipelines where one skips the cache (2.7); do **not** rely on a third-party CDN for a mandatory decoder (2.6); do **not** ship a 3.5 M-vertex model with no LOD (2.8); do **not** serve models without `Cache-Control`/`ETag` (2.7); do **not** read accessor `min`/`max` as the world box (2.5); do **not** blanket-Draco tiny meshes (2.4).

---

## 4. Unknowns

1. **The 2D planner iframe was never opened or measured.** I read the bridge (`HPSync`, `resolveModelOffset`, `footprintInSymbolFrame`) statically and my live attempt to dump a composed plan record threw (`HP3D.listElements` argument mismatch). Whether `2D-Planner/index.php` ships its own copy of the catalog, its own loader, or its own `meter` constant is unverified.
2. **Only 26 of 1 882 models were parsed.** The Draco rate (21/26), "no external buffers", the origin-above-floor rule and the material/texture mix are stated for the sample and extrapolated where `HP_BOOT` supports it. The per-file Draco flag exists only for the sample.
3. **Draco ratios are estimates.** `dracoEstUncompressedBytes` assumes 12 B/position, 12 B/normal, 16 B/tangent, 8 B/uv, 4 B/colour and 3 indices/triangle; actual Babylon output may differ (quantised attributes expand to floats). The *live* vertex counts (e.g. 3 498 174 for the tree vs my accessor estimate 1 166 058 triangles) show the estimators measure different things and should not be compared directly.
4. **Decode timing is single-run and single-host.** 20 137 ms for the tree, 3 102 ms for the bush, 510 ms for the bed were each measured once with a warm HTTP cache; number of runs, CPU contention and Cloudflare edge warm-up are uncontrolled. The 6 cm `supportYAt` dip is likewise one terrain state.
5. **`rotation_offset` sign convention still unverified.** All values are `null`; I can see it is degrees and passes through `isQuarterTurnOdd`, but with no non-null example the direction and whether it is absolute or additive to `symbolFrontDeg` remain open.
6. **Texture-set weight was not measured.** The 456 `floorplanTextureCatalog` entries are outside this census; only the 7 embedded textures inside GLBs. The true "all assets" weight exceeds 2.54 GB by an unknown amount.
7. **The heaviest models were not downloaded.** I know the sizes and titles of the top items (31.3 MB apartment complex, 24.9 MB office building) but not their geometry or decode cost; the 20 s figure is for the largest *sampled* file (19 MB), not the largest in the catalog.
8. **No per-frame or memory measurement.** I did not capture FPS, GPU memory, or Babylon `scene.getEngine().getFps()` with many objects placed, so the LOD argument (2.8) rests on vertex counts, not on a measured frame budget.
9. **Cache-path coverage is read, not exhaustively enumerated.** I confirmed the palette handler (`_0x147a48`) bypasses the template cache and that `instantiateModel` uses it; I did not enumerate every caller of `importFile`/`placeObject` to map which user actions hit which pipeline.
10. **`objectOptions` carries no W/D/H fields in `HP_BOOT` — confirmed OBSERVED.** The live bed landed at 3.13 × 1.46 × 2.27 m, and `placeObject` scales only when `rec.width/depth/height > 0`, so the palette path cannot normalise. Where the `rec` objects with those fields are constructed (AI/BIM only?) I did not trace to ground.

---

## Evidence index

| File | What it is |
|---|---|
| `sizes.sh`, `sizes/part1.tsv`, `sizes/part2.tsv`, `sizes/all.tsv`, `sizes/census.json`, `sizes/census-joined.json` | Full 1 882-model HTTP HEAD census: bytes, status, `Cache-Control`, `ETag`, joined to titles and category names |
| `all-urls.tsv` | The 1 882 model URLs (id, kind, parent, quoted path, title) derived from round-1 `hp-boot.json` |
| `sample_glbs.py`, `sample-list.json`, `sample-meta.json` | Stratified sampler; the 26 downloaded models with byte sizes |
| `glbs/` (26 files, 39 MB) | The downloaded GLB sample |
| `glb_parse.py`, `glb-analysis.json` | Container / topology / material / texture / extension census |
| `glb_world.py`, `glb-world.json` | Scene-graph world bbox, origin & floor-gap convention, Draco byte ratio, material detail |
| `assets/babylon.js` | Babylon.js 6.38.0 as shipped (Draco default config, worker count) |
| `cdp-probe.cjs`, `live-probe.json`, `live-01-editor.png` | First live run: WebGL/SwiftShader facts, Babylon version, Draco config, catalog DOM count |
| `cdp-find3d.cjs`, `live-controls.json` | 3D-view hunt and the `data-view` control inventory |
| `cdp-floor.cjs`, `live-floor.json`, `live-floor-pre.json` | Discovery that `#definefloor` creates the engine; first model placements |
| `cdp-pipe.cjs`, `live-pipe.json` | Live instance geometry, materials, scaling/rotation, engine API survey, GLB+decoder network log |
| `cdp-cache.cjs`, `live-cache.json` | Decisive cache test: direct template cache (0 requests) vs real catalog clicks (re-download each time) |
| `cdp-timing.cjs`, `live-timing.json` | Cold vs cached `loadModelTemplate` timings for 6 models; page-weight breakdown |
| `cdp-big.cjs`/`cdp-big2.cjs`, `live-big.json`, `live-big2.json` | Space-in-filename handling and the 20 s / 3.5 M-vertex heavy-model load |
| `chrome2.log`, `chrome3.log` | Chrome launch logs (SwiftShader / CDP) |
| `~/dsh-workspaces/rea-3dhouseplanner-2026-10/05-05-furniture-catalog/` | Round-1 evidence, read-only: `hp-boot.json`, `editor-page-raw.html`, `deobf/hp-editor.deobf.js`, `loaders.js`, `test.glb` |
| <https://www.3dhouseplanner.com/> | DOCUMENTED: features, FAQ, model attribution/licences (from round 1) |
