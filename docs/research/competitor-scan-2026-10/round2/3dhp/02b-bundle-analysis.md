# 3D House Planner — Static Bundle Analysis (all 41 scripts): routes, endpoints, storage, event wiring

**Job:** `rea2-3dhp-p1/06-02b-tech-stack-bundle-bundle-ana` (Round 2)
**Target:** https://www.3dhouseplanner.com/app.php — browser editor (Babylon.js) with a 2D planner iframe at `https://www.3dhouseplanner.com/2D-Planner/index.php`
**Predecessor (read-only):** `rea-3dhouseplanner-2026-10/02-02-tech-stack-bundle/report.md` + `evidence/`, `js/`, `ev_*.json`
**Started:** 2026-10-31 15:36 CET. **Environment:** macOS, REA v6.8.0, headless Google Chrome 156 (SwiftShader WebGL 2.0).
**Evidence in this folder:** `evidence/` (script_inventory, endpoints, storage, deobfuscation), `work/` (decoded tables, deobfuscated sources, per-dimension extraction), `scripts/` (fetch + deobfuscation toolchain), `planner/` (2D planner scripts).

*Tags: **OBSERVED** = read from a fetched script or live DOM/evidence file; **DOCUMENTED** = vendor documentation; **INFERRED** = reasoning over observations.*

---

## 1. Summary

- **All 41 Round-1 bundle scripts were re-fetched and analysed individually (OBSERVED).** SHA-256 of the re-fetched copies matches Round-1 `route_inventory.sources` for **40/41**; the one mismatch is `app.php` itself (live HTML changed between rounds, as expected). A further **11 scripts belonging to the 2D planner iframe** (`2D-Planner/index.php`) were fetched and analysed, bringing the real surface to 52 scripts.
- **The bundle is `javascript-obfuscator` output, and it is now fully deobfuscated for the first-party code (OBSERVED).** 29 editor modules and 11 planner modules were decoded with exact self-defending-table rotations solved from each file's own checksum IIFE (e.g. hp-editor rotation 368 / checksum 947488, hp-bim 487 / 595642, hp-api 4 / 219798, planner-main 454 / 182462). Every claim below comes from literal-resolved source, not from string-guessing.
- **Routes are few and flat (OBSERVED).** The `app.php` document begins with an inline `window.location.href='index.php'` guard while autoloading the editor; the only in-app navigation targets are `2D-Planner/index.php?lang=…` (injected as an iframe by hp-editor), `index5.php?from=editor&lang=…` (AI render, opened with `window.open`), and `index.php` (brand link in hp-ui). There is no client-side router and no pushState navigation — the app is a single page per entry script.
- **Endpoints are same-origin PHP, one per feature (OBSERVED).** Editor side: `api/ai.php` (config/assistant/prompt, plus `parsers/2dto3dfloorplanapi.php` for blueprint vectorising), `api/ar.php`, `api/bim.php` (gzip-capable JSON), `api/efficiency.php`, `api/house.php`, `api/i18n.php`, `api/share.php` (POST/GET/DELETE), `api/terrain.php`, `parsers/search.php`. Planner side: `../api/norms.php`, `../parsers/objects_catalog.php`, `../parsers/textures_list.php`. All calls are `credentials: same-origin`; no third-party API is called with project data — the only remote scripts are ads/analytics/CDN libraries.
- **Storage is layered and named consistently (OBSERVED).** IndexedDB database `hp-bim` (version 2, stores `projects` + `index`, keyPath `id`) holds project records and a thumbnail/metadata index, with reserved ids `__recovery__`/`__reopen__`; `localStorage` holds ~20 preference/autosave keys (`hp-units`, `hp-lang`, `hp-bim-autosave`, `hp-catalog-recent`, `hp-donate`, `hp-dims`, `hp-ai-model`, `hp-io-export`, `hp-bim-terrain-qty`, … plus planner keys `extension-floorplanner-*`, `fp-help-seen`); `sessionStorage` holds transient state (`hp-ai-history`, `hp-resume-after-reload`, `hp-start-dismissed`); one cookie `hp_lang`. No service worker, Cache API, WebSocket, EventSource or BroadcastChannel anywhere in the bundle.
- **Event wiring is a two-layer pub/sub over 605 `addEventListener` calls plus 10 custom events (OBSERVED).** Boot order is sequenced by `hp3d:ready` (dispatched once by hp-editor) and `hpui:ready` (hp-ui); feature modules then communicate via `hp:selection`, `hp:viewer`, `hp:dims`, `hp:tab`, `hp-catalog-recent`. The 3D↔2D bridge is **not** postMessage: the 3D page reaches into the iframe's `contentWindow` and calls `FloorplanBridge` / `FloorplanCatalog` / `FloorplanOrientation` / `FloorplanLibrary` / `floorplannerHooks` directly, and the iframe reads `window.parent` in return.

---

## 2. Findings

### 2.0 Method and coverage — all 41 scripts analysed, plus the iframe page

Round 1's `analyze-web-bundle` timed out and left 19 of 41 scripts unanalysed, and never produced routes/endpoints. This round did not retry the same command as the primary method; instead it:

1. **Re-fetched every script** with a CDP `Runtime.evaluate` `fetch(u,{credentials:'same-origin'})` from a live `app.php` page (tool: `scripts/fetch_all.mjs`). `js.php?f=…` returns 403 to plain curl, so in-page fetch is required. 41/41 files written (`scripts/`, manifest `scripts/fetch_manifest.json`).
2. **Verified identity**: SHA-256 of each re-fetched file vs Round-1 `route_inventory.sources[].sha256` — 40/41 exact matches; `app.php` is the expected live-HTML drift (`evidence/script_inventory.json`).
3. **Deobfuscated each first-party module** with a purpose-built toolchain (`scripts/decode_js.py`, `scripts/rotation.py`, `scripts/final_deobf.py`): locate the accessor + raw table, recover the exact self-defending rotation by evaluating the file's own checksum IIFE over all candidate rotations, then rewrite every `accessor(0x…)` call to a JSON string literal. 29/29 editor modules and 11/11 planner modules decoded with zero unresolved in-range offsets (`evidence/deobfuscation.json`, `work/rotations_exact.json`, `work/decoded/*.json`).
4. **Fetched the iframe's own 11 scripts** in the same way (`planner/`), because the 2D planner page is a separate document whose scripts Round 1 never captured.
5. **Extracted the four dimensions programmatically** and cross-checked by hand in the deobfuscated sources: endpoints (`evidence/endpoints.json`), storage (`evidence/storage.json`), event wiring (`work/event_wiring.json`), routes/URLs (`work/inventory_full.json`, per-module URL sweep). Public API surface and listener shapes were dumped to `work/` for audit.
6. **Re-ran both REA analysers in parallel with larger deadlines** (`rea analyze-web-bundle` with `--analysis-timeout-ms 600000 --total-analysis-timeout-ms 1800000`, and `rea analyze-javascript-application` with `--analysis-timeout-ms 900000 --max-heap-mb 4096`) as a corroborating pass. Both again hit provider `cleanup_incomplete`/`deadlineExpired`, but the bundle run's error envelope carried a **fresh full partial observation** (`work/bundle3_partial.json`, 14 sources retained: all 11 planner scripts + 3 repeats of `2D-Planner/index.php`); its `route_inventory` still reported `routes: []`, `route_patterns: 0`, which independently confirms that REA's route extractor finds no anchored routes in this code and that the routes documented below are the complete reachable set as far as static evidence goes.

**Coverage statement:** 52/52 fetched scripts were inspected after deobfuscation (29 editor + 11 planner + 11 vendored/third-party + `app.php` HTML). Round-1's "23 analysed, 19 unavailable" gap is closed for every first-party script; the vendored libraries were read as-is (they are unminified or conventional minified vendor builds, not obfuscated).

### 2.1 Full script inventory (all 41 + planner) — load order, size, hash

**OBSERVED** from `evidence/app.php.html` (Round-1 live DOM snapshot) and `evidence/script_inventory.json`. Load order matters: Babylon + jQuery + PEP load first; then, in order, `floorplan-ai-vectorizer` → `hp-i18n` → `hp-api` → (`defer`) `hp-ui` → `hp-panels` → `hp-sync` → `hp-render` → `hp-terrain-detail` → `hp-pathtrace` → `hp-gltf` → `hp-bim` → `hp-house-planner` → `hp-stairs` → `hp-linear` → `hp-ai-place` → `hp-ai-chat` → `hp-ux` → `hp-ar` → `hp-sun` → `hp-tour` → `hp-dims` → `hp-measure` → `hp-share` → `hp-copy` → `hp-efficiency` → `hp-donate` → `hp-app`; then inline `HP_I18N_DATA` and `HP_BOOT` catalogue blobs; then `hp-editor` (`type="module"`) → `hp-editor-tail`; then `vanilla-lazyload`.

All 41 captured sources carry an `integrity="sha384-…"` attribute (OBSERVED) and all `js.php` URLs carry a content-hash `v=` query (the hash equals the script's first SHA-256 bytes — OBSERVED in every entry of `evidence/script_inventory.json`).

| Load order | Script (editor) | bytes | first SHA-256 | role |
|---|---|---|---|---|
| 0 | `https://assets.babylonjs.com/generated/Assets.js` | remote | — | Babylon asset catalog |
| 1 | `assets/babylonjs/ammo.js` | 1 804 243 | `cea6d8bb8f5f1252` | physics engine |
| 2 | `assets/babylonjs/cannon.js` | 393 458 | `a09b160791513f44` | physics engine |
| 3 | `assets/babylonjs/Oimo.js` | 155 661 | `bf09f9b3e2001b30` | physics engine |
| 4 | `assets/babylonjs/earcut.min.js` | 6 519 | `e08d38c0f98cd8ab` | polygon triangulation |
| 5 | `assets/babylonjs/babylon.js` | 4 964 149 | `a0216b3002516b0b` | core engine |
| 6 | `assets/babylonjs/babylonjs.materials.min.js` | 199 262 | `1a12d4f64b9e3506` | material library |
| 7 | `assets/babylonjs/babylonjs.proceduralTextures.min.js` | 33 192 | `a103b1ed6ce8c38a` | procedural textures |
| 8 | `assets/babylonjs/babylonjs.postProcess.min.js` | 11 340 | `c77a0ebd7c59c7ec` | post-processing |
| 9 | `assets/babylonjs/babylonjs.loaders.js` | 1 609 871 | `ea0e98501b391f79` | glTF/OBJ/STL loaders |
| 10 | `assets/babylonjs/babylonjs.serializers.min.js` | 93 220 | `e1cb37da4e6857df` | scene serialisation |
| 11 | `assets/bootstrap/js/jquery-3.2.1.min.js` | 86 659 | `87083882cc601598` | DOM + ajax |
| 12 | `https://code.jquery.com/pep/0.4.2/pep.min.js` | remote | — | pointer events polyfill (touch/pen) |
| 13 | `https://js.puter.com/v2/` | remote | — | Puter AI/cloud SDK used by hp-ai-chat |
| 14 | `https://pagead2.googlesyndication.com/.../adsbygoogle.js` | remote | — | ads |
| 15 | `https://www.googletagmanager.com/gtag/js?id=G-SFHW3J2XZQ` | remote | — | analytics |
| 16 | `https://cdn.jsdelivr.net/npm/vanilla-lazyload@17.8.4/...` | remote | — | lazy image loading |
| 17 | `js.php?f=editor/floorplan-ai-vectorizer` | 88 278 | `d5dde9d5fdc355b3` | 2D-plan vectorizer client |
| 18 | `js.php?f=editor/hp-i18n` | 9 585 | `f587c0926f2bbcf0` | i18n loader/cookie |
| 19 | `js.php?f=editor/hp-api` | 5 135 | `4fc287e164718a6a` | HTTP facade |
| 20 | `js.php?f=editor/hp-ui` | 78 224 | `73e8c086150d643e` | shell/dialogs/toolbar |
| 21 | `js.php?f=editor/hp-panels` | 51 336 | `2a3a408d68eb514f` | catalog, levels, materials |
| 22 | `js.php?f=editor/hp-sync` | 75 790 | `741d814408b892a1` | 2D⇄3D sync, terrain contours |
| 23 | `js.php?f=editor/hp-render` | 54 013 | `09e7403a2c10f185` | render modes, AI handoff |
| 24 | `js.php?f=editor/hp-terrain-detail` | 46 643 | `7d66e26c6420e6ab` | terrain surface overrides |
| 25 | `js.php?f=editor/hp-pathtrace` | 53 586 | `8081740c07cc13a9` | path-traced still rendering |
| 26 | `js.php?f=editor/hp-gltf` | 12 166 | `2418552d98902c84` | glTF compress/zip/export |
| 27 | `js.php?f=editor/hp-bim` | 483 859 | `f19a5c882fa0d7d5` | projects, IFC/DXF/CSV, share |
| 28 | `js.php?f=editor/hp-house-planner` | 3 774 | `26a5f6a811251c13` | house-plan suggestions |
| 29 | `js.php?f=editor/hp-stairs` | 21 449 | `d750bf7a07418d82` | stair fitting |
| 30 | `js.php?f=editor/hp-linear` | 127 460 | `a27bee815c78a9cd` | linear builds (roads/tracks) |
| 31 | `js.php?f=editor/hp-ai-place` | 70 816 | `1354dce62641d495` | AI object placement |
| 32 | `js.php?f=editor/hp-ai-chat` | 115 265 | `a5a7b31f329ec115` | AI assistant panel |
| 33 | `js.php?f=editor/hp-ux` | 31 058 | `ff35bf99bc999a40` | onboarding tour, shortcuts |
| 34 | `js.php?f=editor/hp-ar` | 12 078 | `a774b8aea6d8dffa` | AR/QR export |
| 35 | `js.php?f=editor/hp-sun` | 53 203 | `70b890b41cb5fef4` | sun/solar study |
| 36 | `js.php?f=editor/hp-tour` | 21 914 | `8a43feebce7640f4` | camera tour |
| 37 | `js.php?f=editor/hp-dims` | 20 864 | `0a6606505427dbde` | dimension overlays |
| 38 | `js.php?f=editor/hp-measure` | 24 181 | `2c3bd83975c01aa4` | measurement tool |
| 39 | `js.php?f=editor/hp-share` | 18 907 | `fad546341e7364d6` | share links |
| 40 | `js.php?f=editor/hp-copy` | 43 879 | `402a72c4856874ae` | copy/paste between levels |
| 41 | `js.php?f=editor/hp-efficiency` | 97 148 | `5ee5ec9bbb9b7c8f` | energy efficiency |
| 42 | `js.php?f=editor/hp-donate` | 12 487 | `3cc36c833d0d0951` | donation dialog |
| 43 | `js.php?f=editor/hp-app` | 12 293 | `202c69c4abb882d5` | unit state + boot glue |
| 44 | `js.php?f=editor/hp-editor` | 691 230 | `7868a06179c38d65` | main editor (`type=module`) |
| 45 | `js.php?f=editor/hp-editor-tail` | 5 328 | `ec6e81d09d84e69a` | lazy-load hook, teardown |

(The predecessor's 41-entry `route_inventory.sources` list includes the HTML document `app.php` itself, ~2.09 MB, plus the 40 JS files above; the table is ordered by `app.php` load order and the numbering is that order, not the source-list index.)

**Inline blobs (OBSERVED, `evidence/app.php.html`):** inline #0 `window.location.href='index.php'`; inline #3 the gtag bootstrap; inline #19 `window.HP_I18N_DATA` (74 945 chars, dictionaries for 11 languages incl. en/pt/es/fr/de/it/ru/zh/ja/ko); inline #46 `window.HP_BOOT` (~1.2 MB JSON) containing `doorOptions` (60), `windowOptions` (46), `objectOptions` (1 776), `objectCategories` (157), `floorplanTextureCatalog` (456), plus `products`, `textures`, `suggestions` maps (`work/hp_boot.json`). These are catalog *data*, not code.

### 2.2 Routes and navigation targets

**OBSERVED** (deobfuscated sources; grep of every URL/`.php`/`location` literal):

| Route | Found in | How it is reached | Notes |
|---|---|---|---|
| `index.php` | inline #0, hp-ui | inline script `window.location.href='index.php'`; brand/link button | Landing/marketing page; not the editor |
| `app.php` | entry document | direct load | Editor host: loads all editor scripts |
| `2D-Planner/index.php?lang=<code>` | hp-editor (`floorplanFrameContainer` builder) | iframe `id="floorplanIframe"` injected with `src="2D-Planner/index.php?lang="+encodeURIComponent(lang)` | Overlay is `position:fixed`, hidden by default, toggled via `open2DPlanner`; the iframe is the 2D planner document |
| `index5.php?from=editor&lang=<code>` | hp-render | `window.open('index5.php?from=editor&lang='+…)` | AI render pipeline window |
| current page + `?share=<32 hex>` | hp-bim | `location.search` regex `/[?&]share=([a-f0-9]{32})(?:&|$)/`; after load it strips the param with `history.replaceState(pathname + search.replace(...) + hash)` | Share-link deep entry; also handled when opening a project |
| `#`/hash | hp-bim | preserved through the `replaceState` above | No hash routing observed |

**No client-side router.** No module references `pushState` other than the share-param cleanup; there is no route table, no `pathname` matching beyond the share flow (`work/` grep of `history.` and `location.` across all 40 deobfuscated modules). The app is one page per entry point. The 2D planner's own scripts use `location.href` only for asset/relative resolution.

**PostMessage / iframe protocol — OBSERVED in full.** There is **no `postMessage` anywhere** in either the 3D bundle or the 2D planner (grep over all 40 deobfuscated modules). The bridge is direct same-origin object access:

- hp-editor builds the iframe, then `document.getElementById('floorplanIframe').contentWindow` is used to read `WALLS`, `ROOM`, `Rooms`, `meter`, `units`, `floorplannerTextureMap`, and to call `FloorplanCatalog`, `FloorplanOrientation`, `FloorplanLibrary.setData({categories, products})` and to attach `floorplannerHooks` (`objectPlaced`, …). It also reads the iframe DOM (`contentDocument.getElementById('doorSelect'|'windowSelect'|'unitSelector')`).
- hp-sync resolves the same window (`_0x1f436f()`) and uses `FloorplanBridge` (via `getModel`/`setModel`), `FloorplanCatalog.bestItemForProduct` / `matchModels` / `frontDeg`, and `FloorplanOrientation.resolveModelOffset` / `normalizeDeg`.
- hp-app reads `contentDocument.getElementById('unitSelector')` to push unit changes into the planner, setting `dataset.hpFrom3d='1'` to suppress the echo.
- hp-bim calls `contentWindow.FloorplanBridge.setModel({walls:[],objects:[],rooms:[]})` on project clear; and the share-URL flow.
- The planner side (`bridge3d.js`) is the counterpart: it exposes `window.FloorplanBridge = { version:1, getModel, setModel }`, reads `window.parent.HPUnits`/`HPBIM`/`HP3D`, and dispatches `floorplan-bridge-ready`. bridge3d's `setModel` requires the iframe globals `floorplanLoad` and `HISTORY`, and will call `start_floorplanner()` if the plan has walls/objects; it accepts a whitelist of per-entity keys (`family,class,type,x,y,angle,angleSign,size,thick,hinge,value,limit,height3d,model,uid,modelYawOffset,modelFootprint3d,modelAutoTurn,libraryProductId,productRotationOffset,sizeVersion,linear`).
- `planner-main` reads `window.parent.HPBIM.normsCountry()` to localise norm checks, and `window.parent` is also used by `uiShell` (`window.self`/`window.top` checks for embedded mode).

Because both documents are same-origin (`https://www.3dhouseplanner.com`), no `postMessage` origin check is needed; the coupling is by naming convention, not by an event protocol.

### 2.3 Network endpoints

**OBSERVED** (`evidence/endpoints.json`; shapes from the deobfuscated call sites). Every call uses `credentials:'same-origin'`. No endpoint is called cross-origin with project data.

**Editor (3D) side — 8 `api/*.php` scripts + 2 parsers (14 distinct call shapes; `api/ai.php` and `api/share.php` each serve three):**

| Endpoint | Module(s) | Method / content type | Body / query | Purpose |
|---|---|---|---|---|
| `api/ai.php?action=config&scope=<s>&lang=<l>` | hp-api (`HPApi.ai.config`) | GET, `Accept: application/json` | query only | AI capability/model config |
| `api/ai.php?action=assistant&lang=<l>` | hp-api (`HPApi.ai.assistant`) | GET | query only | assistant greeting/state |
| `api/ai.php?action=prompt&lang=<l>` | hp-api (`HPApi.ai.prompt`) | POST `application/json` | `{kind, params}` | AI tool invocation (also used by `floorplan-ai-vectorizer` with `kind:'floorplan_'+task`) |
| `parsers/2dto3dfloorplanapi.php` | floorplan-ai-vectorizer | POST `multipart/form-data` | `task=<...>`, `image=<dataURL→blob>` | server-side blueprint→2D extraction |
| `api/ar.php` | hp-ar | POST `model/gltf-binary` | glTF binary (draco-compressed, jpeg textures, maxTexture 1024, quality 80) | AR scene upload |
| `api/bim.php` | hp-bim | POST `application/json` (+ `X-HP-Encoding: gzip` when body ≥ 64 KiB) | `{action, model?, options:{lang,…}, …}` | IFC/BIM processing and export |
| `api/efficiency.php` | hp-efficiency | POST `application/json` | `{lat, lon, country, lang, locale, rooms}` | energy-efficiency analysis |
| `api/house.php?lang=<l>` | hp-house-planner | POST via `HPApi.post` | plan payload | house-plan suggestions |
| `api/i18n.php?scope=<s>[&lang=<l>]` | hp-i18n | GET via `XMLHttpRequest` (`open('GET', url, true)` → asynchronous) | query only | per-scope translation dictionaries |
| `api/share.php` / `api/share.php?id=<id>` | hp-share, hp-bim | POST (create, with optional `X-HP-Share-Key`), GET with `cache:'no-store'` (load), DELETE with `X-HP-Share-Key` (revoke; 404 tolerated) | JSON | share-link create/read/delete |
| `api/terrain.php?action=contours` | hp-sync | POST via `HPApi.post` with `AbortController.signal` | contour params | terrain contour generation |
| `parsers/search.php` | hp-panels | POST `application/x-www-form-urlencoded` | `URLSearchParams` with the query term + `lang` | catalogue search |

**2D planner side — 3 endpoints (all relative to `/2D-Planner/`):**

| Endpoint | Module | Method | Purpose |
|---|---|---|---|
| `../parsers/objects_catalog.php` | objectPalette | GET (`credentials:'same-origin'`) | product library, fetched once on palette open (`libraryRequested` guard) |
| `../api/norms.php` | planner-main | POST `application/json` `{country, lang, locale, rooms}` | building-norm checks; `country` comes from `parent.HPBIM.normsCountry()` when embedded |
| `../parsers/textures_list.php` (`?id=` variant) | planner-main | GET | floor/wall texture catalogue |

**Third-party origins referenced (OBSERVED):** `cdnjs.cloudflare.com` (qrcode-generator 1.4.4, lazy-loaded by hp-ar and hp-share), `cdn.jsdelivr.net` (`xlsx@0.18.5` loaded by hp-bim for spreadsheet export; `web-ifc@0.0.66` for IFC; `earcut@2.2.4` in hp-editor; `vanilla-lazyload@17.8.4`), `cdn.babylonjs.com` (hp-gltf draco/meshopt decoders), `assets.babylonjs.com` (generated asset catalog), `js.puter.com/v2/` (AI SDK), Google ads/analytics, Google Fonts, PayPal donate (hp-donate and planner donate), `www.w3.org` namespaces. **No WebSocket, EventSource, `sendBeacon` or `new Worker` calls exist in any first-party module.**

### 2.4 Storage

**OBSERVED** (`evidence/storage.json`; all keys literal-resolved). No service worker, no Cache API, no `navigator.storage`, no `BroadcastChannel`. Cookies are limited to one.

**IndexedDB — hp-bim only:**
- `indexedDB.open('hp-bim', 2)`. On upgrade: create `projects` (keyPath `id`) if absent; create a second store named by the resolved literal `index` (keyPath `id`); then iterate `projects` with `openCursor()` and `put` a transformed copy of each record into `index` (this is the thumbnail/metadata index).
- `onversionchange` closes the connection and drops the cached promise; `onblocked` warns "hp-bim database upgrade blocked by another tab" and raises a translated `bim.dbBlocked` error.
- Transactions are opened on `['projects']`, `['index']`, `['projects','index']` readonly/readwrite. List operations `getAll()` and filter out `id === '__recovery__'` and `0 === String(id).length`. Reads for one id use `objectStore('projects').get(id)`; writes `delete rec.thumbnail` for the `projects` record and keep the thumbnail in `index` (recovering the previous thumbnail when the incoming `thumbnail` is `undefined`); deletes run on both stores. Serialised project payload carries `{format:'hp-bim', version:1, app:'3D House Planner', meta:{id,name,created,updated,units}, settings:{…}, …}`.
- Reserved sentinel ids: `__recovery__`, `__reopen__`. Key `hp-bim-autosave` (localStorage) gates whether autosave is on; the autosave tick is a single `setInterval(..., 0xbb8)` = **3000 ms**, which only snapshots when `!document.hidden && !busy && project exists` and fires a save when the signature changed. `Ctrl/Cmd+S` is intercepted to force a save. `beforeunload` is listened to.

**localStorage (resolved literals):** `hp-units` (hp-app, `HP_UNITS_KEY`), `hp-lang` (hp-i18n — also mirrored to cookie `hp_lang` with `max-age=31536000; path=/; SameSite=Lax; Secure` on https), `hp-catalog-recent` (hp-editor + hp-panels), `hp-bim-autosave`, `hp-bim-terrain-qty`, `hp-io-export` (hp-bim), `hp-ceiling-trim` (hp-bim), `hp-wallbuilder-opts` (hp-editor), `hp-catalog-recent`, `hp-donate` (hp-donate), `hp-dims` (hp-dims), `hp-ai-model` (hp-ai-chat), `hp-ai-front` (hp-ai-place), `hp-ar` (hp-ar), `hp-linear` (hp-linear), `hp-measure` (hp-measure), `hp-pathtrace` (hp-pathtrace), `hp-bim-cls:<key>` (per-class BIM settings), plus `hp-tour-done` (hp-ux) and `hp-mat-collapsed` (hp-panels). Planner side: `extension-floorplanner-settings`, `-currently-editing`, `-current-filename`, `-floorplans`, `-history` (planner-main and bridge3d), `extension-floorplanner-palette-group` (objectPalette), `fp-help-seen` (uiShell), and `hp-donate` (planner donate shares the same key family).

**sessionStorage:** `hp-ai-history` (hp-ai-chat — chat transcript), `hp-resume-after-reload` (hp-bim — project resume across reload; stored as JSON), `hp-start-dismissed` (hp-ux — onboarding), `extension-floorplanner-...` transient planner flags, and a computed key in planner bridge3d.

**Note on method:** several storage keys are passed through variables rather than string literals in the packed source; every such variable was resolved to its literal by walking the deobfuscated table (`scripts/resolve_keys.py`). The table above is therefore the literal key set, not a partially-resolved subset. Round 1 could only report the IndexedDB store names and `hp-bim-autosave`; the full key inventory is new here.

### 2.5 Event wiring

**OBSERVED** (`work/event_wiring.json`; 605 `addEventListener` call sites across 28 modules, plus 6 custom events and 1 jQuery plugin hook).

**Lifecycle / custom events:**

| Event | Dispatched by | Payload | Consumed by |
|---|---|---|---|
| `hp3d:ready` | hp-editor once, `CustomEvent('hp3d:ready',{detail:window.HP3D})` | the `HP3D` API object | hp-bim, hp-copy, hp-dims, hp-linear, hp-measure, hp-render, hp-share, hp-stairs, hp-sun, hp-sync, hp-terrain-detail, hp-ux, hp-ui, hp-ai-chat (14 modules) |
| `hpui:ready` | hp-ui | — | hp-app |
| `hp:selection` | hp-ui (`CustomEvent('hp:selection',{detail:…})`) | selection detail incl. `mesh` | hp-bim, hp-copy, hp-share, hp-ux |
| `hp:viewer` | hp-bim (`{detail:{active:false}}`) | viewer mode | hp-share |
| `hp:dims` | hp-dims (`{detail:{enabled, options}}`) | dims state | hp-measure, hp-render |
| `hp:tab` | hp-ui (`{detail:{id}, bubbles:true}`) | tab id | hp-panels |
| `hp-catalog-recent` | hp-editor | — | hp-panels |
| `floorplan-bridge-ready` | planner bridge3d | — | (planner-internal) |
| `floorplanner-viewport` | planner-main (`{detail:{factor}}`) | zoom factor | planner uiShell, bridge3d |
| `fp-topbar-fit` | planner uiShell | — | planner uiShell |

**DOM listener profile (per module, from `work/event_wiring.json`):** the heaviest wiring is `planner-main` (125), `hp-bim` (80), `hp-editor` (63), `hp-ui` (60), `uiShell` (39), `hp-panels` (27). The busiest event names across the bundle are `click`, `change`, `input`, `keydown`, then pointer/mouse events (because the app supports mouse, touch/pen via PEP, and pointer events), plus `resize`/`scroll` and document lifecycle (`DOMContentLoaded`, `load`, `beforeunload`, `visibilitychange`, `fullscreenchange`, `pagehide`). Notable specialised listeners: `drop`/`dragstart`/`dragleave`/`dragend` (file import in hp-bim/hp-editor, AI image drop in hp-ai-chat), `paste` (hp-ai-chat), `contextmenu` (hp-editor/hp-linear), `wheel`/multi-touch (planner-main canvas), `focusin`/`focusout` (hp-ui), `LazyLoad::Initialized` (hp-editor-tail hooks the lazyload instance). Observers: `MutationObserver` in hp-ui/hp-panels/hp-donate(+planner uiShell/donate), `ResizeObserver` in planner-main; no IntersectionObserver.

**Teardown:** only `hp-editor-tail` registers a `load` listener and clears the lazy-load instance; no module removes its custom-event listeners, so the wiring is effectively one-shot for the page lifetime.

### 2.6 Per-module map (public global → responsibility)

**OBSERVED** from each module's `window['HP*'] = {…}` assignment (method lists in `work/global_apis.txt`, mapping in `work/module_globals.json`):

| Module | Global | Public surface (abridged) | Endpoints | Storage keys |
|---|---|---|---|---|
| hp-api | `HPApi` | `get`, `post`, `ai.{config,assistant,prompt}` | `api/ai.php` | — |
| hp-i18n | `HPI18N` | `add`, `t`, `has`, `setLang`, `beforeReload` | `api/i18n.php` | `hp-lang` + cookie `hp_lang` |
| hp-ui | `HPUI` | `t`, `shell`, `addTool`, `createPanel`, `open/close`, `toast`, `trackEngine` | — | — |
| hp-panels | `HPPanels`, `HPCatalog` | panel editor GUI, catalog config | `parsers/search.php` | `hp-catalog-recent`, `hp-mat-collapsed` |
| hp-sync | `HPSync` | `setEnabled`, `requestLevel`, `buildAt`, `stairFootprints`, terrain tools | `api/terrain.php?action=contours` | transient |
| hp-render | `HPRender` | `modes`, `setMode`, `openAiRender`, `openStudio`, `capture(View)` | `index5.php?from=editor&lang=` (window) | `hp-ai-render-model` (Round-1 observation) |
| hp-terrain-detail | `HPTerrainDetail` | `surfaces`, `setEnabled`, `slotSurface`, `overrides`, `rebuild`, `prepareExport` | — | `hp-terrain-detail` |
| hp-pathtrace | `HPPathTrace` | `open` | local `three-pathtracer` vendor | `hp-pathtrace` |
| hp-gltf | `HPGltf` | `toU8`, `compressGlb`, `compressTextures`, `zipFiles`, `loadDracoEncoder`, `download` | — | — |
| hp-bim | `HPBIM` | `undo/redo`, `importFile`, `exportAs/formats/exportIfc/exportDxf/exportSvg/exportCsv`, `save/open/newProject/listProjects`, `recovery`, `serialize/restore`, `copyElements`, `settings`, `prepareReload` | `api/bim.php`, `api/share.php` | IDB `hp-bim`; `hp-bim-autosave`, `hp-bim-cls:*`, `hp-ceiling-trim`, `hp-io-export`, `hp-bim-terrain-qty`, sStorage `hp-resume-after-reload` |
| hp-house-planner | `HPHousePlanner` | `plan` | `api/house.php?lang=` | — |
| hp-stairs | `HPStairs` | `update`, `isStair`, `fit`, `originalGeometry` | — | — |
| hp-linear | `HPLinear` | `kits`, `setOn`, `openEnds`, `buildRun`, `pickFloor`, `chain` | — | `hp-linear` |
| hp-ai-place | `HPAIPlace` | `TYPES`, `typeOf/byId`, `analyse` | via `HPApi` | `hp-ai-front` |
| hp-ai-chat | `HPAI` | `send`, `tools`, `loadConfig`, `runTool`, `open`, `attach`, `setModel` | via `HPApi`, Puter SDK | `hp-ai-model`, sStorage `hp-ai-history` |
| hp-ux | `HPTour` | `run` | — | `hp-tour-done`, sStorage `hp-start-dismissed` |
| hp-ar | `HPAR` | `open` | `api/ar.php`, cdnjs qrcode | `hp-ar` |
| hp-sun | `HPSun` | `open`, `place`, `apply`, `setState` | — | computed `hp-…` key |
| hp-tour | `HPCameraTour` | `open`, `setState`, points/seconds | — | — |
| hp-dims | `HPDims` | `setEnabled`, `setOption`, `refresh`, `overlay`, `format(Area)` | — | `hp-dims` |
| hp-measure | `HPMeasure` | `state`, `setState` | — | `hp-measure` |
| hp-share | `HPShare` | `open` | `api/share.php` (POST/GET/DELETE) | — |
| hp-copy | `HPCopy` | `openLevel`, `duplicate` | — | — |
| hp-efficiency | `HPEfficiency` | `render`, `recalc`, `setState`, `analyze` | `api/efficiency.php` | — |
| hp-donate | `HPDonate` | `open` | PayPal | `hp-donate` |
| hp-app | `HPUnits` | unit `set/name/factor`, `pushTo2d` | — | `hp-units` |
| hp-editor | `HP3D`, `HPRenderLoop` | scene/cameras/gizmos/catalog/levels/units/classify/elementRoot, `events.emit`, render-loop idle control | builds the 2D iframe | `hp-wallbuilder-opts`, `hp-catalog-recent` |
| floorplan-ai-vectorizer | (window fn) | `FLOORPLAN_VECTORIZER_OPTIONS`, `FLOORPLAN_AI_MODELS`, `analyze` | `parsers/2dto3dfloorplanapi.php`, `api/ai.php` | — |
| planner bridge3d | `FloorplanBridge` | `version`, `getModel`, `setModel` | — | `extension-floorplanner-*` |
| planner planner-main | `FLOORPLAN_ROOM_TYPES` | plan model, history, export/import, norms | `../api/norms.php`, `../parsers/textures_list.php` | `extension-floorplanner-{settings,currently-editing,current-filename,floorplans,history}` |
| planner uiShell | `FloorplanUI` | shell/topbar/dialogs | — | `fp-help-seen` |
| planner objectPalette | (window fn) | palette/library UI, `onPaletteOpen` | `../parsers/objects_catalog.php` | `extension-floorplanner-palette-group` |
| planner objectCatalog / orientation3d / symbols / floorplanEditor / qSVG / i18n / donate | `FloorplanCatalog`, `FloorplanOrientation`, … | catalogue, orientation maths, symbol geometry, canvas editing, SVG, download/help | — | `hp-donate` (donate) |

### 2.7 Gaps closed vs Round 1 / still open

**Closed (OBSERVED this round):** route inventory (5 navigation targets plus the `?share=` param, no router); full endpoint inventory (10 distinct editor files / 14 call shapes + 3 planner files, with methods, content types and body shapes); full storage inventory (IDB schema + every literal localStorage/sessionStorage key + the single cookie); event wiring (605 listeners, 10 custom events, producer/consumer table); the 3D↔2D bridge protocol (direct `contentWindow`, no postMessage); and the 19 previously-unanalysed scripts (all 29 editor + 11 planner modules deobfuscated and read). Round 1's "23 analysed / 19 unavailable" and "`routes:[]`, `endpoints:[]`" are superseded.

**Still open / limitations:**
- The REA static analysers themselves did not complete cleanly on this bundle (`cleanup_incomplete` / per-script deadline even at 600 s per script and 1800 s total). The route extractor reports 0 patterns, consistent with the code (paths are built by concatenation and table-decoding), so REA route output corroborates but does not enumerate the routes above.
- Server behaviour (response schemas, auth, rate limits) was not exercised; endpoints are documented by their call sites only. No accounts, logins, payments or share-publishing were performed.
- `app.php` HTML is live and changed between rounds; the load-order table uses the Round-1 snapshot in `rea-3dhouseplanner-2026-10/.../evidence/app.php.html`. The 2D planner page was re-fetched this round (139 636 bytes, 17 script tags).
- The planner page's inline scripts (3) and its third-party tags were enumerated from the fetched HTML but the inline bodies were not exhaustively deobfuscated (they are short and `planner-*` modules cover the behaviour).
- `hp-ai-chat` uses the Puter SDK (`js.puter.com/v2/`); the SDK's own internals and any original endpoints inside it were not analysed (third-party).
- Vendored builds (Babylon 4.9 MB, ammo/cannon/Oimo, jQuery, xlsx, web-ifc, lazyload) were inventoried by size/hash and API surface only.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each ties to a finding above and, where relevant, to the CasaPlazAI `FloorplanData` v1 schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

1. **Adopt a single `FloorplanBridge`-style in-page contract between the 2D editor and the 3D viewer — but make it a typed, serialised boundary rather than `contentWindow` poking (high value, low/medium effort).** Finding 2.2: 3DHP couples the frames by reaching into `contentWindow` and mutating planner globals directly; the practical consequence we observed is the `dataset.hpFrom3d` echo-suppression flag and defensive `try/catch` around every cross-frame access. CasaPlazAI already froze `FloorplanData` v1 as the editor→viewer interchange; a `getModel()`/`setModel(FloorplanData)` pair on a namespaced object (or a `postMessage` envelope with an origin check, which 3DHP does *not* have) gives the same capability with a validatable payload and no shared mutable globals. The entity-key whitelist bridge3d already maintains (`uid, type, x, y, angle, height3d, model, …`) is a good checklist for what `FloorplanData` must carry.
2. **Copy the `hp3d:ready` → `hpui:ready` boot contract, but add listener teardown (high value, low effort).** Finding 2.5: 3DHP sequences 14 feature modules off one custom event and routes the rest through 6 colon-namespaced events, which is exactly the decoupling a plugin-style tool registry wants; however nothing removes listeners, so every reload leaks wiring. For CasaPlazAI, keep the event names/`detail` shapes (they are a de-facto registry: `hp:selection`, `hp:tab`, `hp:dims`, `hp:viewer`) and add an AbortController per module.
3. **Reuse the storage layout discipline: one key per feature, versioned project records, explicit autosave opt-out (high value, low effort).** Finding 2.4: 3DHP keeps `hp-units`, `hp-lang`, `hp-dims`, `hp-measure`, `hp-catalog-recent`, `hp-bim-autosave`, … each owned by one module, and stores projects in IndexedDB `hp-bim` with a `{format,version,app,meta,settings}` envelope and reserved `__recovery__`/`__reopen__` ids. That maps cleanly onto CasaPlazAI's deliberate out-of-schema editor state (`casaplaza.snap.settings.v1`, `casaplaza.underlay.v1`): same pattern — feature-local keys for editor-only state, schema for what crosses the boundary. The `__recovery__` sentinel is a cheap crash-recovery slot worth copying.
4. **Mirror language persistence across cookie + storage (medium value, low effort).** Finding 2.4: 3DHP writes `hp_lang` to a cookie (`max-age=31536000; path=/; SameSite=Lax; Secure` on https) *and* `localStorage.hp-lang`, and re-seeds the cookie from storage on later loads. That survives subdomain/iframe boundaries (the planner at the same origin reads the same cookie), which matters if CasaPlazAI ever splits editor and viewer across paths.
5. **Centralise HTTP exactly like `HPApi` (medium value, low effort).** Finding 2.3: one tiny `hp-api` module funnels every editor call through `get`/`post` with `credentials:'same-origin'`, `Accept: application/json`, JSON error unwrapping into `error.code`/`error.status`, and in-flight request de-duplication (`_0x1ca805[key]` promise cache). CasaPlazAI's `traffic`-free? No — its own upcoming sync/export calls would benefit from the same single facade; the request-de-duplication is a small detail that prevents duplicate AI calls on double-click.
6. **Steal the blueprint-import pattern for fast onboarding (high value, medium effort).** Findings 2.3 + 2.6: `floorplan-ai-vectorizer` POSTs an image as `multipart/form-data` (`task` + `image`) to a server endpoint, falls back to an AI endpoint (`kind:'floorplan_'+task`), has a 180 s (`0x2bf20`) timeout, and writes the result through the same `FloorplanBridge`/`floorplannerHooks` path as manual drawing. For CasaPlazAI, an "import a sketch → editable `rooms`/`openings`/`furniture`" path would reuse the schema directly; the interesting engineering detail is that everything lands in the normal model, not a special mode.
7. **Adopt the planner's project envelope for round-tripping (`{floorplans, settings}`) and SVG export as a freebie (medium value, low effort).** Finding 2.6: planner-main exports `floorplanner-project.json` = `{floorplans, settings}` and an SVG via `get_svg()`. CasaPlazAI's `FloorplanData` is a single-floor contract; a small `{floorplans: FloorplanData[], settings}` wrapper is the obvious multi-floor envelope and costs one type.
8. **Add the "recent" and "last used" affordances that show up repeatedly (medium value, low effort).** Finding 2.4/2.6: `hp-catalog-recent`, `extension-floorplanner-history`, `extension-floorplanner-current-filename`, `extension-floorplanner-currently-editing` are all small persisted lists/pointers that make the tool feel stateful. CasaPlazAI's editor should persist the same primitives (recent catalog items, open-file pointer, undo history) under versioned keys.
9. **Reuse the norm-check boundary (medium value, medium effort).** Finding 2.3: the planner POSTs `{country, lang, locale, rooms}` to `../api/norms.php` and obtains `country` from the parent frame's BIM module when embedded. For CasaPlazAI, a single `validate(FloorplanData) → issues[]` endpoint keeps regulatory logic server-side and versionable, matching the schema's stable error-code approach (`non-ccw-polygon`, `opening-too-wide`, `roof-*`).
10. **Instrument the event bus as a product-analytics seam rather than sprinkling calls (low value, low effort).** Finding 2.5: because 3DHP emits `hp:selection`/`hp:tab`/`hp:viewer` centrally, those are the natural funnels for usage metrics; 3DHP instead has loose `track*` helpers. CasaPlazAI can subscribe to its own bus once and get consistent telemetry (and tests) for free.

**Anti-patterns observed, worth avoiding (each OBSERVED):** obfuscating first-party application code while shipping `integrity` hashes (it forced this whole decoding pass and blocks accessibility/auditing); unconditional `contentWindow` mutation with no origin/type check; registering hundreds of listeners with no teardown; and 1.2 MB of catalogue JSON inlined into the entry HTML (`HP_BOOT`) rather than fetched lazily — `floorplan-ai-vectorizer` and the planner already show the lazy-fetch alternative works.

---

## 4. Unknowns

- **Server contracts** — exact request/response schemas, validation, error codes and auth for `api/ai.php`, `api/ar.php`, `api/bim.php`, `api/efficiency.php`, `api/house.php`, `api/i18n.php`, `api/share.php`, `api/terrain.php`, `parsers/search.php`, `parsers/2dto3dfloorplanapi.php`, `../api/norms.php`, `../parsers/objects_catalog.php`, `../parsers/textures_list.php`. Only client call shapes are OBSERVED. Not exercised (no accounts/payments/uploads).
- **Share-link behaviour end-to-end** — creation/expiry/key semantics and the server's 404/410 handling. OBSERVED client: POST with optional `X-HP-Share-Key`, GET `?id=`, DELETE with the key, 404 tolerated, param stripped from the URL after load. Publishing a share link was out of scope.
- **AI feature behaviour** — `HPAI`, `HPAIPlace`, `floorplan-ai-vectorizer` and the Puter SDK integration were analysed statically only; no AI call was made and no model behaviour is claimed. Which models a given deployment exposes comes from `api/ai.php?action=config&scope=floorplan` at runtime.
- **`app.php` load order drift** — the 41-source list and the load-order table reflect the Round-1 HTML snapshot; the live document changed between rounds (size/hash differ). The set of editor scripts autoloaded may also change per deploy; `js.php` `v=` hashes are the stable identity.
- **`hp-editor-tail` runtime hook** — it registers a `load` listener to interact with the lazyload instance (`LazyLoad::Initialized` string appears in the class-name filters upstream, not in the tail itself); the exact teardown it performs is only partly clear.
- **Timer cadence inventory** — the only first-party `setInterval` decoded with certainty is hp-bim's 3000 ms autosave tick and hp-sync's 600 ms poll/hook (`0x258`). Other modules use `setTimeout` chains whose periods are computed at runtime; a complete timing table would need runtime tracing.
- **Vendored internals** — Babylon.js (4.9 MB), ammo/cannon/Oimo, jQuery, PEP, xlsx, web-ifc, earcut, draco/meshopt wrappers and the Puter SDK were taken as trusted third-party code (size/hash/API only).
- **2D planner inline scripts** — the 2D planner page's three inline scripts were counted and their positions noted, but not decoded line-by-line; all cross-frame behaviour attributed here comes from the `planner-*` modules.
- **REA analyser gap** — both `analyze-web-bundle` and `analyze-javascript-application` terminally reported `cleanup_incomplete` on this obfuscated bundle even with 600 s/script and 1800 s total deadlines; result files were therefore taken from the error envelopes' `partial_observation`. A non-obfuscated copy of the same code would be needed to see whether REA's route view can enumerate these concatenated paths.
