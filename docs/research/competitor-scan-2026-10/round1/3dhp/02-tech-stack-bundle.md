# 3D House Planner (3dhouseplanner.com) — Technology Stack & Bundle Analysis

**Job:** `rea-3dhouseplanner-2026-10/02-02-tech-stack-bundle`
**Target:** https://www.3dhouseplanner.com/app.php (the 3D editor) and https://www.3dhouseplanner.com/ (marketing page)
**Observed:** 2026-10-31, headless Google Chrome 156.0.8078.74 (SwiftShader WebGL 2.0), REA v6.8.0.
**Companion files:** `sources.json`, `evidence/`, `js/` (modules for static inspection), `screenshots/`, raw REA JSON `ev_*.json`.

---

## 1. Summary

- **Rendering engine: Babylon.js 6.38.0 (not Three.js, not Unity, not Flash).** Proof: `window.BABYLON.Engine.Version === "6.38.0"` and a live engine whose `webGLVersion` is `2` (OBSERVED, `ev_probe1.json`, `ev_probe10.json`). The site loads the classic UMD `assets/babylonjs/babylon.js` bundle (~4.96 MB minified, ~1.56 MB brotli) plus `materials`, `proceduralTextures`, `postProcess`, `loaders`, `serializers` add-ons (OBSERVED, `ev_inspect_page.json`, `ev_coldstart.json`).
- **Physics: three engines shipped, one selected at runtime.** `ammo.js` (1.80 MB), `cannon.js` (393 KB) and `Oimo.js` (156 KB) are all loaded; the live scene reports `physicsEnabled: true` while `getPhysicsEngine()` is falsy on an empty project, so the active plugin could not be confirmed without placing furniture (OBSERVED/INFERRED, `ev_probe10.json`).
- **No SPA framework.** No React/Vue/Angular/THREE globals exist; the only third-party framework is **jQuery 3.2.1** plus `pep.js` (pointer events shim) (OBSERVED, `ev_probe2.json`). The app is a hand-rolled multi-file architecture: 29 PHP-proxied ES/UMD modules under the `editor/hp-*` namespace, each attaching one `window.HP*` global (OBSERVED, `evidence/app.php.html`, `ev_probe12.json`).
- **The heaviest payload is not JavaScript — it is a 1.2 MB inline JSON catalog (`window.HP_BOOT`)** embedded in the HTML: 1 776 furniture objects, 456 floor-plan textures, 60 doors, 46 windows, 157 categories, each a GLB path under `/admin/objects/`. Total HTML ≈ 2.09 MB, of which ~1.275 MB is inline script (OBSERVED, `ev_probe12.json`, `evidence/hp_boot_summary.json`).
- **Persistence is browser-local, as advertised, but structured as a mini "BIM document" store.** IndexedDB database **`hp-bim` v2** with two object stores (`projects`, `index`), both keyed by `id`; project records carry a JPEG-thumbnail data URL and a `data` string containing a 23-section JSON document (`format:"hp-bim"`, `meta`, `settings`, `camera`, `levels`, `site`, `sun`, `tour`, `measures`, `efficiency`, `classification`, `ifc`, `types`, `budget`, `elements`, `terrain`, `plan`, `georef`, `check`, `sync`). A second IndexedDB `puter_cache` belongs to the third-party Puter SDK. `localStorage` holds only flags (`hp-donate`, `extension-floorplanner-currently-editing`) (OBSERVED, `ev_probe11.json`, `ev_probe4.json`).
- **Cold load: 127 requests / ~4.7 MB transfer / ~13.0 MB decoded, load event ~1.8 s**, dominated by Babylon core (4.96 MB decoded) and physics; the render modules are obfuscated and server-gated (`js.php?f=…` returns 403 without a browser session), and there are **no source maps** (OBSERVED, `ev_coldstart.json`, curl probes).

---

## 2. Findings

### 2.1 Rendering engine and 3D pipeline

| Item | Value | Tag / source |
|---|---|---|
| Engine | Babylon.js **6.38.0** (`BABYLON.Engine.Version`) | OBSERVED — `ev_probe1.json` |
| Context | WebGL **2.0** (SwiftShader in test env; `webGLVersion: 2`) | OBSERVED — `ev_probe10.json`, `ev_probe18.json` |
| Canvas | single `<canvas id="renderCanvas">`, sized to viewport (1600×913), plus a small `<canvas id="gizmoContainer">` (2D context) | OBSERVED — `ev_probe10.json` |
| Scene graph (empty project) | 6 meshes, 7 materials, 13 textures, 13 transform/root nodes, 4 lights (2× Hemispheric, 1× Directional, 1× Spot), `ArcRotateCamera` | OBSERVED — `ev_probe10.json` |
| Physics | `physicsEnabled: true`; Ammo/Cannon/Oimo all downloaded | OBSERVED — `ev_probe10.json`, `ev_inspect_page.json` |
| Shader authoring | Node Material graph blocks used extensively in `hp-editor` (`TextureBlock`, `ScaleBlock`, `AddBlock`, `ColorMergerBlock`, `VectorSplitterBlock`, …) | OBSERVED — `js/hp-editor.js` grep |
| Add-on modules | `babylonjs.materials.min.js`, `babylonjs.proceduralTextures.min.js`, `babylonjs.postProcess.min.js`, `babylonjs.loaders.js`, `babylonjs.serializers.min.js`, `earcut.min.js` | OBSERVED — `evidence/app.php.html` |

The engine API surface exposed to page code is broad (PBR/`BackgroundMaterial`, `AssetsManager`, `AnimationGroup`, gizmos, `AssetsProgressEvent`), i.e. the project leans on stock Babylon rather than a bespoke renderer. `BABYLON.SceneLoader` is registered with `GLTFFileLoader`, `SceneSerializer` and `SerializationHelper` are present, and `BABYLON.EngineStore.Instances` holds exactly one engine / one scene (OBSERVED — `ev_probe5.json`, `ev_probe11.json`).

**A second renderer exists for photo-real mode:** decoded runtime strings and module code reference `assets/vendor/three-pathtracer/three-pathtracer.min.js`, `WebGLPathTracer`, `THREE`, `HDRLoader`, `textures/environment.hdr` (5.95 MB) and `render` modes `draft | balanced | ultra | pathtrace` — i.e. an **on-demand Three.js-based path tracer** loaded only when the user picks the Ultra/pathtrace mode, next to the Babylon realtime pipeline (OBSERVED strings + HTTP 200 on the asset; the mode-to-asset wiring is INFERRED from `hp-render`/`hp-pathtrace` strings).

### 2.2 Framework, language and module architecture

- **No SPA framework, no bundler on the app side.** No React/Vue/Angular/THREE/Webpack runtime in the app modules; the only webpack marker REA found (`bundle_runtime: webpack`, `ev_bundle_partial.json`) is inside **Babylon's own `babylonjs.loaders.js`** (which literally starts with `webpackUniversalModuleDefinition`) — a false positive for the app itself (OBSERVED).
- **jQuery 3.2.1** is loaded first and used for DOM events (`$(...).on(...)` appears throughout `hp-editor`), joined by `code.jquery.com/pep/0.4.2/pep.min.js` for pointer events (OBSERVED — `ev_probe1.json`, `ev_probe2.json`, console/request logs).
- **29 app modules** are served through a PHP shim `js.php?f=editor/<name>&v=<hash>` with `integrity="sha384-…"` and `defer`; one script (`hp-editor`) is `type="module"` and the rest are classic globals. Module namespaces are feature-oriented: `hp-ux, hp-ui, hp-panels, hp-app, hp-editor, hp-editor-tail, hp-sync, hp-render, hp-pathtrace, hp-terrain-detail, hp-linear, hp-stairs, hp-measure, hp-dims, hp-tour, hp-sun, hp-bim, hp-gltf, hp-ar, hp-share, hp-copy, hp-efficiency, hp-donate, hp-ai-chat, hp-ai-place, hp-api, hp-i18n, hp-house-planner, floorplan-ai-vectorizer` (OBSERVED — `evidence/app.php.html`).
- **Global-namespace contract.** Each module attaches one object: `HPUI, HPPanels, HPCatalog, HPRender, HPTerrainDetail, HPPathTrace, HPGltf, HPBIM, HPHousePlanner, HPStairs, HPLinear, HPAIPlace, HPAI, HPAR, HPSun, HPCameraTour, HPDims, HPMeasure, HPShare, HPCopy, HPEfficiency, HPDonate, HPSync, HPUnits, HPI18N, HPApi, HP_BOOT` (OBSERVED — `ev_probe12.json`; method-level API inventories captured there, e.g. `HPBIM` exposes ~70 methods including `undo/redo, save/open/listProjects/serialize/restore, quantities, schedule, exportIfc/Dxf/Svg/Csv/Xlsx/Bcf, georef, rules/check`).
- **Code is heavily obfuscated** (javascript-obfuscator-style: rotated base64 string tables, hex-named helper `hxxxxxx_0x…`). All app modules lack `sourceMappingURL`. This blocked cheap source reading; findings here come from runtime introspection and REA static analysis, not from readable source (OBSERVED).
- **`js.php` is server-gated:** direct curl returns `403 text/plain` with `x-robots-tag: noindex, nofollow` and `cache-control: no-store`, while the same URLs load fine inside the page (OBSERVED — curl probes, `evidence/headers_app.txt`).

### 2.3 Bundle size, transfer and load behaviour

Cold-cache measurement on the editor page (cache cleared, `cacheDisabled`, hard reload; OBSERVED — `ev_coldstart.json`, `evidence/coldstart_metrics.json`):

| Metric | Value |
|---|---|
| Requests | 127 |
| Transfer (compressed, br/gzip) | **4 748 589 B ≈ 4.75 MB** |
| Encoded body | 4 712 589 B |
| Decoded body | **12 964 433 B ≈ 13.0 MB** |
| Navigation TTFB / load event | ~728 ms / ~1 800 ms |
| Scripts | 46 requests, 3.75 MB transfer, 11.7 MB decoded |
| Images | 71 requests, 750 KB transfer |
| Inline `HP_BOOT` JSON | 1 174 925 B (~1.12 MB) inside the 2.09 MB HTML |

Largest decoded scripts: `babylon.js` 4 964 149 B, `ammo.js` 1 804 243 B, `babylonjs.loaders.js` 1 609 871 B, `hp-editor` 691 230 B, `hp-bim` 483 859 B, `cannon.js` 393 458 B, `hp-linear` 127 460 B, `hp-ai-chat` 115 265 B (OBSERVED — `ev_coldstart.json`). Compression saved ~63 % (4.75 MB transferred vs 13.0 MB decoded). Static assets (`assets/**`) carry `cache-control: max-age=14400`; HTML and `js.php` responses are `no-store` (OBSERVED — curl HEAD probes). Fonts: Material Icons woff2 (124 KB) is the largest CSS-side asset; `assets/bootstrap/css/Roboto-Regular.ttf` is mis-declared as a stylesheet and produces a console MIME error in Chrome (OBSERVED — `ev_scenario_editor.json` console events).

**Asset loading strategy.**
- **Catalog metadata is eager, model geometry is lazy.** The catalog is inlined into the page as `window.HP_BOOT` (doors/windows/objects/textures/categories with *thumbnail image path* + *GLB path*), while the thumbnails use `data-src` + `vanilla-lazyload@17.8.4` and the GLBs load on demand (`/admin/objects/*.glb`) (OBSERVED — `evidence/app.php.html`, `ev_probe12.json`).
- **Dynamic ESM imports for compression/encoding tooling:** `meshoptimizer@0.22.0/+esm`, `fflate@0.8.2/+esm`, `draco_encoder_wasm_wrapper.js`, plus a jsDelivr-loaded `xlsx@0.18.5` for schedules, and `web-ifc-api-iife.js` for IFC (OBSERVED decoded strings — `ev_probe15.json`, `ev_probe14.json`).
- `earcut.min.js` is present for polygon triangulation (used for floors/roofs) (OBSERVED).
- Watermark console banner from the **Puter** SDK (`js.puter.com/v2/`) — a third-party browser AI/storage SDK pulled from a CDN, not part of the app bundle (OBSERVED — console events in `ev_scenario_editor.json`).

### 2.4 Persistence and data model

**IndexedDB `hp-bim` (version 2), no server round-trip for projects** (OBSERVED — `ev_probe4.json`, `ev_probe11.json`):

- `projects` store, `keyPath: "id"`, rows: `{id, name, created, updated, size, data}` where `data` is a **stringified JSON document** (~2.1 KB for an empty project, measured 2 118 B).
- `index` store, `keyPath: "id"`, rows: `{id, name, created, updated, thumbnail (data:image/jpeg;base64…), size, autosave}` — a project-list/index record with a screenshot thumbnail (25 780 B in the measurement, dominated by the JPEG).
- Both stores are created via `indexedDB.open("hp-bim", 2)` + `createObjectStore(name, {keyPath:'id'})` (OBSERVED in `js/hp-bim.js`, one `indexedDB.open` call site).
- `HPBIM.listProjects()` returns `[{id, name, created, updated, thumbnail}]`; `HPBIM.save()` succeeded in the live page and produced exactly one record in each store (OBSERVED — `ev_probe11.json`).

Serialized project document top-level keys (`HPBIM.serialize()`, empty project): `format, version, app, meta, settings, camera, levels, levelInfo, site, norms, sun, tour, measures, efficiency, classification, ifc, types, budget, elements, terrain, plan, georef, check, sync` (OBSERVED — `ev_probe11.json`). `HPBIM.snapshot()` (BIM view) returns `version, name, id, floorHeight, levels[{n,name,elevation,height}], budget{currency,prices,groupBy,phases}, elements[], norms{country,lot}, types[{id,name,ifcClass,layers[{material,thickness}]}], ifc{schema}, contours[]` — i.e. a real IFC-flavoured model with a wall-type layer library and cost norms (OBSERVED).

Other keys:
- `localStorage`: `hp-donate` (JSON `{used,next}`), `extension-floorplanner-currently-editing` = `"true"` (a marker written for/consumed by a browser extension), and from decoded strings the app also uses `hp-units`, `hp-lang`, `hp-render-mode`, `hp-ai-model`, `hp-ai-history`, `hp-catalog-recent`, `hp-bim-autosave`, `hp-resume-after-reload`, `hp-pt-*`, `hp-tour` (OBSERVED/INFERRED keys: names observed in decoded string tables and module cross-references; only `hp-donate` was present on the fresh profile).
- Cookies: `PHPSESSID`, `__cf_bm` (Cloudflare), `visted`, `hp_lang` (OBSERVED, hashed — `ev_scenario_editor3.json`).
- Service workers: not registered; `caches` API exists but no cache entries (OBSERVED — `ev_probe16.json`, `ev_inspect_page.json` `cache_names: []`).
- Autosave/crash recovery: strings `hp-bim-autosave`, `hp-resume-after-reload`, `keepRecovery`, `prepareReload` and a `hp-bim-autosave`/`recovery` toast path in `hp-bim` (OBSERVED strings, mechanism INFERRED).

**Server usage is limited to non-project features** (OBSERVED endpoints decoded from the live page, `ev_probe14.json`): `api/ai.php` (`?action=config&scope=…`, `?action=assistant`, `?action=prompt`), `parsers/2dto3dfloorplanapi.php`, `parsers/search.php`, `api/terrain.php?action=contours`, `api/bim.php`, `api/ar.php`, `api/share.php[?id=]`, `api/efficiency.php`, plus `js.puter.com/v2` for the AI/image SDK and `api/house.php?lang=` in `hp-house-planner`. Marketing copy states "Projects … live in your browser storage. No account, no upload, no database" (DOCUMENTED — https://www.3dhouseplanner.com/), which matches the observed IndexedDB behaviour.

### 2.5 UI architecture and interactions (relevant to a single-workspace redesign)

- **DOM/CSS architecture:** custom `hp-*` CSS class system (`hp-ui.css` 104 KB decoded, `hp-panels.css`, `hp-io.css`) over a Bootstrap-era base (`main.css`, `icon.css`, Material Icons font). Visible class inventory captured: `hp-topbar`, `hp-dock`, `hp-dockcard`, `hp-tabs`, `hp-seg`, `hp-seg-btn`, `hp-dialog`, `hp-dialog-card`, `hp-statusbar`, `hp-catalog`, `hp-toast`, `hp-tooltip`, `hp-switch`, `hp-range`, `hp-color`, … (OBSERVED — `ev_probe6.json`, `ev_probe14.json`).
- **Modal-first onboarding:** the editor opens with a blocking "Project settings" dialog (name, floor-to-floor height 2.65 m, floor-plan size 100 m, units Meters/Feet, "Start designing"); `document.body.className` includes `hp-dialog-open` (OBSERVED — `ev_probe6.json`, `ev_probe9.json`, `screenshots/step1_settle.png`).
- **View switcher is 4 segmented buttons with `data-view`**: `3d` (orbit, "Orbit around the model"), `walk` (first-person, "WASD / arrows"), `top` (orthographic), `2d` ("Open the 2D planner (synced with 3D)") (OBSERVED — `ev_probe9.json`).
- **2D plan is SVG-based** (`createSvgTag`, `svgPlan`, `image/svg+xml`, `-plan.svg` export strings; 9 inline `<svg>` in the live DOM and exactly one 2D canvas which is the gizmo) with a `floorplanIframe`/`pushTo2d`/`hpFrom3d`/`hp3d:ready` bridge to the 3D side — i.e. **2D ⇄ 3D live sync via an SVG plan layer**, not a second WebGL scene (OBSERVED strings `ev_probe14.json`/`ev_probe15.json` + `ev_probe18.json`; the iframe was not present in the editor DOM at capture time, so the bridge wiring is INFERRED).
- **Big-catalog UX:** 2 426 catalog-related DOM nodes already rendered before any interaction (`ev_probe18.json`); the catalog is a tabbed drill-down (`hp-catalog-head`, `hp-crumb`, `hp-cat-list`, `hp-items-grouped`, `hp-recent`, search box) fed from the inline `HP_BOOT` data.
- **Feature depth advertised and visible in APIs:** AI assistant (`HPAI.send/tools/toolDefinitions/runTool`), AI furniture placement solving (`HPAIPlace.analyse/solve/applyPlacement`), path-traced renders (`HPPathTrace`, `HPRender.modes` ×6), sun study (`HPSun`), terrain painter (`HPTerrainDetail`), stairs (`HPStairs`), linear runs/railings (`HPLinear`), camera tour (`HPCameraTour`), dimension overlay (`HPDims`), efficiency/area metrics (`HPEfficiency`), BIM exports incl. IFC4/BCF/XLSX (`HPBIM`) (OBSERVED — `ev_probe12.json`, DOCUMENTED — https://www.3dhouseplanner.com/).

### 2.6 Caveats encountered during capture

- `rea analyze-web-bundle` never completed a full pass: with a 180 s per-script deadline it still hit `deadlineExpired` and returned `cleanup_incomplete`/`partial_observation` for the 41 captured scripts (23 analyzed). The **partial** result is still useful: 41 script nodes with SHA-256 identities, 3 `require("babylonjs")` chunk edges from Babylon add-on bundles, and the single webpack inference that traces to `babylonjs.loaders.js` (OBSERVED — `ev_bundle_complete.json`, `ev_bundle_partial.json`). Bundle-completeness must be treated as partial.
- The site's own HTML `<script>` tag for `js.puter.com/v2/` is *not* integrity-checked; Google Analytics/AdSense are blocked in the capture environment (`ERR_CONNECTION_REFUSED`), so those contribute nothing to the measured timings (OBSERVED — `ev_scenario_editor.json` console events).
- Headless WebGL required `--use-angle=swiftshader --enable-unsafe-swiftshader`; without it the editor throws `Error: WebGL not supported` from `babylon.js` and the 3D canvas stays blank (OBSERVED — page-error event in `ev_scenario_editor2.json`, fixed in `ev_scenario_editor3.json`).
- Earlier CDP sessions were contaminated by a parallel job driving the same Chrome instance (targets switched to `sweethome3d.com`); measurements in this report come from a private Chrome on port 9366 with its own profile (OBSERVED — `logs_chrome2.txt`, target listings).

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

| # | Idea | Tied to finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Keep Babylon.js/Three-style "one engine, one scene" but make the model a document, not a blob.** Adopt the observed pattern of an explicit serialized document with named sections (`settings/camera/levels/site/plan/elements`) instead of an ad-hoc `{rooms, furniture}` object, so versioning, migration and partial loading are trivial. | §2.4 project JSON shape | High | Medium |
| 2 | **Put the palette in a lazy, paged catalog layer, not in the bundle.** 3D House Planner ships a 1.12 MB inline catalog + 1 776 GLB paths; CasaPlazAI's small palette can stay inline, but the *mechanism* (metadata eager with `image` + `glb` path, thumbnails via `IntersectionObserver`, GLB on drop) scales cleanly as the palette grows — use `vanilla-lazyload`-style deferred thumbs. | §2.3 asset loading | High | Low |
| 3 | **IndexedDB (`<app>-planner` DB) with a `projects` store + a lightweight `index` store carrying a thumbnail.** The twin-store design gives a project browser ("Open project") with previews for free; autosave writes to `projects`, the recover-after-reload flag goes to a small key. This is a direct upgrade over a single localStorage blob. | §2.4 stores `projects`/`index` | High | Medium |
| 4 | **Render the 2D plan as an SVG layer, synced to the Three.js scene, rather than rebuilding a second 3D scene.** Observed `createSvgTag`/`svgPlan` + `pushTo2d`/`hpFrom3d`/`hp3d:ready` events show a workable pattern: one source of truth, SVG for plan, events for the bridge. | §2.5 SVG plan + event bridge | High | Medium |
| 5 | **Fixed view-mode segmented control** (`3D / Walk / Top / 2D`) with `data-view` attributes instead of scattered toolbar buttons. It is one small markup contract that a single-workspace redesign can hang keyboard shortcuts and URL state on. | §2.5 `hp-seg-btn[data-view]` | Medium | Low |
| 6 | **Split heavy optional features behind dynamic `import()`.** Observed: path tracer (1.04 MB) + 5.95 MB HDR only load on demand, `meshoptimizer`/`fflate`/`xlsx`/`web-ifc` come from dynamic ESM imports. Mirror that for export (PNG/JPEG) and any future IFC/measure modules so first paint stays fast. | §2.3 dynamic imports | Medium | Low |
| 7 | **A single `HP*`-style namespace contract per feature module** (`PlannerPlan`, `PlannerCatalog`, `PlannerPersistence`, …) so features are independently testable and nothing reaches into another module's internals. The observed 29-module `hp-*` split, each attaching exactly one global object with a documented method list, is a maintainable pattern even without a framework. | §2.2 namespace contract | Medium | Low |
| 8 | **Add hotkey/dimension/measure overlays as first-class toggles** (`HPDims.enabled/options`, `HPMeasure.state`) — cheap wins for perceived capability parity, and CasaPlazAI already has measure. | §2.5 API inventories | Medium | Low |
| 9 | **Give the project document a `camera`, `units` and `levels` section from day one**, so saved plans restore view state and unit preference — 3D House Planner stores camera `{alpha, beta, …}` and `units: "m"` in `settings`/`camera`. | §2.4 serialized doc | Medium | Low |
| 10 | **Do not copy their bundle sizing.** ~13 MB decoded, 46 script requests and a 4.96 MB Babylon core is the main KPI to beat; a Vite-bundled, tree-shaken Three.js app can plausibly land an order of magnitude smaller. Treat their compressed ~4.75 MB first load as the baseline to undercut. | §2.3 cold-load table | Medium | Medium |

---

## 4. Unknowns / what could not be verified

- **Which physics plugin is actually active.** All three (Ammo/Cannon/Oimo) are downloaded; the empty scene reports `physicsEnabled: true` but `getPhysicsEngine()` is falsy, so the selection code path was not triggered.
- **Full bundle static analysis.** `analyze-web-bundle` returned `cleanup_incomplete` / `partial_observation` after 180 s per-script; 23 of 41 scripts were analyzed. Route/endpoint inventories from that pass are empty (`routes: []`, `endpoints: []`) and must not be read as "no endpoints".
- **The `js.php` module contents beyond the 14 saved files** (`hp-ux`, `hp-panels` extras, `hp-ai-chat` internals, etc. were saved; `hp-render`/`hp-pathtrace` bodies were not re-downloaded before the budget ended). Some conclusions about the path-tracer wiring are INFERRED from strings.
- **The path-tracer integration details** (how `HPRender.setMode` maps to loading `three-pathtracer.min.js` and the 5.95 MB `environment.hdr`) — asset existence and string references are OBSERVED, the trigger is INFERRED.
- **Exact 2D⇄3D bridge protocol.** `floorplanIframe`, `pushTo2d`, `hpFrom3d`, `hp3d:ready` exist in strings, but no iframe was in the DOM during capture; the message contract (postMessage schema) is unverified.
- **Whether project data ever leaves the browser.** Vendor FAQ says no upload (DOCUMENTED), cookies/PHPSESSID and `api/*.php` endpoints exist for AI/terrain/BIM/share features; no project-payload request was observed, but the share path (`api/share.php?id=`) implies server-stored shares when explicitly used — not exercised here.
- **Autosave interval and crash-recovery UX.** Key names (`hp-bim-autosave`, `hp-resume-after-reload`, `keepRecovery`) are OBSERVED; the timer cadence and recovery dialog flow were not reproduced.
- **Ad/analytics contribution** to real-world load is unmeasured (AdSense/GA were network-blocked in this environment).
- **Licence position.** The site credits CC-BY and CC-BY-NC-SA model sources (Scopia, Kator Legaz, Blend Swap, ArchiBit, ArchiBase, Sweet Home 3D 7.0.2) for its GLB catalog (DOCUMENTED — https://www.3dhouseplanner.com/). CasaPlazAI must not reuse those assets; only the behavioural patterns above are transferable. No app source code was copied; module files were retained solely as evidence for size/hash/behaviour claims (see `evidence/sha256_modules.txt`).
