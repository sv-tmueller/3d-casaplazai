# 3D House Planner — Performance Deep-Dive (cold-load waterfall, caching, lazy loading, scene cost)

**Job:** `rea2-3dhp-p1/07-02c-tech-stack-bundle-performanc` (round 2, narrow question: performance)
**Target:** https://www.3dhouseplanner.com/app.php (3D editor); 2D planner at `/2D-Planner/index.php`
**Started:** 2026-10-31 16:02 CET · **Observed with:** own headless Chrome 156.0.8078.74 on port 9377, `--use-angle=swiftshader --enable-unsafe-swiftshader`, CDP driver `evidence/cdp.mjs`, REA v6.8.0.
**Round-1 base:** `~/dsh-workspaces/rea-3dhouseplanner-2026-10/02-02-tech-stack-bundle/report.md` (read-only; reused, not repeated).
**Evidence:** this folder — `report.md`, `sources.json`, `evidence/` (raw JSON + probe scripts).
**Tags:** OBSERVED (with URL/evidence file) · DOCUMENTED (vendor docs URL) · INFERRED.

> **Method note / two capture regimes.** (a) **Load measurements** were taken with the target brought to the foreground (`Page.bringToFront`), so `document.visibilityState === "visible"` and the numbers are comparable to a real user visit (`evidence/coldload_vis.json`, `warmload_vis.json`). (b) **Render-loop / idle measurements** were taken on a backgrounded page (`visibilityState === "hidden"`), where `requestAnimationFrame` is throttled (`evidence/out_raf.json`: rAF 0 frames in 3.8 s vs 29 frames in 2.2 s once visible, `evidence/out_raf2.json`). Per-frame *scene cost* is therefore reported as **draw calls + forced-render ms**, which are independent of rAF; the one place this matters is the FPS-style idle figure, flagged inline. A hidden page also stops Babylon's loop entirely, which is what made the `HPRenderLoop` gate unusually easy to observe.

---

## 1. Summary

- **Cold load is one 2.09 MB no-store HTML document plus ~4.75 MB transfer / ~12.96 MB decoded across 127 requests; TTFB ≈ 720 ms of the 1.76 s `load`.** The HTML body is 2.09 MB decoded, of which **1.175 MB is the inline `HP_BOOT` JSON catalog** and **744 KB is the pre-rendered `.hp-catalog` DOM** (2 592 `<img class="lazy">` placeholders) — so ~1.9 MB of the 2.09 MB document is catalog payload, not markup or app logic (OBSERVED — `evidence/coldload_vis.json`, `evidence/out_lazy.json`).
- **Caching is split by resource class: versioned app code is immutable for a year, `/assets/**` only 4 h, GLBs have no `cache-control` at all.** `/js.php?f=editor/…&v=<hash>` → `private, max-age=31536000, immutable`; Babylon core + CSS + textures + thumbnails → `max-age=14400` (4 h); `/admin/objects/*.glb` → no cache header; the document → `no-store`. A warm repeat visit transfers **0 bytes** (everything is memory/disk cache) yet saves only **~420 ms**, because parse/execute of 11.7 MB of JS and 29 origin-bound `js.php` calls remain (OBSERVED — `evidence/coldload_run.json`, `evidence/warmload_vis.json`).
- **Lazy loading is real but narrower than it looks: the catalog *metadata* (1.18 MB) and *all 2 592 thumbnail `<img>` nodes* are eager, and only the image *bytes* are deferred.** `vanilla-lazyload@17.8.4`, `threshold: 300`, selector `.lazy`, `use_native: false`, fetched only **36–39 of 2 592** thumbnails on load (≈ 385 KB decoded) — exactly the visible ones; the other ~2 553 stay as `loading.gif` placeholders. **GLB model geometry is fully lazy**: 0 `/admin/objects/*.glb` requests at load, and the whole 2D planner loads on demand (OBSERVED — `evidence/out_verify.json`, `evidence/out_vis.json`, `evidence/coldload_vis.json`).
- **Scene cost scales linearly with furniture, and multi-material models plus two extra passes dominate it.** Empty: 11 draw calls / ~0.3 ms. 4 walls: 84 draw calls / 1.8 ms. +20 furniture: 46 meshes / **149 materials** / 1 046 006 verts → **501 draw calls / 69 ms**. Measured by toggling passes: 6 identical beds → **156 draw calls = 52 main + 48 shadow + 56 glow**, i.e. **each placement costs (submeshes × 3 passes) = 24 draw calls**, and sharing material objects changes nothing (OBSERVED — `evidence/out_dc_empty.json`, `evidence/out_scale.json`, `evidence/out_decomp.json`, `evidence/out_sub.json`).
- **The 3D loop is gated off when nothing changes (`HPRenderLoop`), and the whole 2D planner is loaded on demand as a leaner document.** `isIdle()` after **>3 s** (0xBB8) without a wake, `isSettling()` while `now() − lastWake < 1.5 s` (0x5DC); the page rendered **0 frames in 15 s** idle while `getFps()` read 60. Clicking the 2D view inserts `iframe#floorplanIframe` → `/2D-Planner/index.php` (26 requests / 433 KB / 1.31 MB decoded, **no Babylon**) and hides the 3D canvas — **0 planner requests at editor cold load** (OBSERVED — `evidence/out_idle.json`, `evidence/out_live.json`, `evidence/coldload_2d.json`, `evidence/out_iframe.json`).

---

## 2. Findings

### 2.1 Cold-load waterfall

Cold-cache navigation of `https://www.3dhouseplanner.com/app.php` on a **foregrounded** page (own Chrome, cache cleared + `cacheDisabled`, h3/QUIC) — OBSERVED, `evidence/coldload_vis.json`:

| Phase | Value |
|---|---|
| DNS / TCP+TLS / request start | 2 ms / 13 ms / 13 ms |
| **HTML TTFB (`responseStart`)** | **755 ms** (background runs: 718 / 955 ms) |
| HTML `responseEnd` | 983 ms (2.09 MB decoded, `zstd`) |
| `domInteractive` | ≈ 1 579 ms (separate foreground sample, `evidence/out_navtiming_vis.json`) |
| `domContentLoaded` → `load` | 1 744 → **1 758 ms** |
| Requests / transfer / encoded / decoded | 127 / 4 748 849 B / 4 712 849 B / 12 964 433 B |

(**Foreground vs background caveat.** The table above is the foregrounded run, where `load` is ~1.76 s. An identical backgrounded run reports `domInteractive` 24 711 ms / `load` 24 931 ms — the difference is entirely Chrome's rAF/timer throttling of a `hidden` page stalling app init, not network (`evidence/coldload_run.json`). The foreground number is the one comparable to a real user; both agree on bytes, requests and TTFB.)

The first ~720 ms of the waterfall is **21 requests that all start at the same instant** (CSS, jQuery, the whole Babylon family, `earcut`, `Oimo`, `loading.gif`) — the document is render-blocking on 7 stylesheets and parser-blocking on 10+ classic scripts, so the browser cannot start the app-tier modules until Babylon has parsed (OBSERVED — `evidence/waterfall_sorted.txt`):

| Start | Requests |
|---|---|
| 723 ms | `icon.css`, `main.css`, `hp-ui.css`, `jquery-3.2.1.min.js`, `pep.min.js`, `earcut.min.js`, `Oimo.js`, `cannon.js`, `ammo.js`, `babylon.js`, `Assets.js`, + 10 smaller |
| 1066–1095 ms | 29 × `/js.php?f=editor/…&v=…` (app modules, only after Babylon parses) — 2 341 949 B decoded / 830 108 B transfer total |
| 1449–1450 ms | ~20 terrain thumbnails fired by the terrain panel building (~150 KB) |
| 1715–1747 ms | catalog thumbnails begin (first lazy-lib batch, ~730 KB; 39 images, all visible) |

Largest decoded scripts (OBSERVED, same file): `babylon.js` 4 964 149 B, `ammo.js` 1 804 243 B, `babylonjs.loaders.js` 1 609 871 B, `hp-editor` 691 230 B, `hp-bim` 483 859 B, `cannon.js` 393 458 B; aggregate totals match round 1 (`02-02` §2.3).

**The `js.php` shim is the one server-side tail-latency source.** Each of the 29 PHP-proxied modules reports `receiveHeadersStart ≈ 189–305 ms` in the CDP timing even though `sendEnd` is < 1 ms — the PHP process adds **~190–300 ms** before first byte, and all 29 were issued together at 1095 ms, so the tail is the slowest module, not the sum (OBSERVED — `evidence/coldload_run.json` timing objects). They are classic `<script defer>` globals, not ESM, so they cannot be flattened by an import graph.

**Nothing heavy is eager that could have been deferred.** A check of all 122 request URLs shows **zero** requests for `meshoptimizer`, `fflate`, `draco*`, `xlsx`, `web-ifc*`, `three-pathtracer` or `environment.hdr` at load — those round-1 "dynamic ESM import" assets are genuinely demand-loaded. The eager payload is all first-party: Babylon core, three physics engines, and the inline catalog (OBSERVED — `evidence/coldload_run.json`; cross-checks round-1 §2.3).

### 2.2 Caching headers by resource class

Response headers captured per request (`evidence/coldload_vis.json`, `evidence/coldload_run.json`) and re-confirmed on a second (warm-cache) run (`evidence/warmload_vis.json`, `evidence/warmload_run.json`):

| Resource class | `cache-control` | `cf-cache-status` | Revalidators |
|---|---|---|---|
| `app.php` (document) | **`no-store, no-cache, must-revalidate`** (+ `pragma: no-cache`, `expires: 1981`) | DYNAMIC | — |
| `/js.php?f=editor/<mod>&v=<hash>` (29 app modules) | **`private, max-age=31536000, immutable`** | DYNAMIC | `x-robots-tag: noindex, nofollow`, `vary: Accept-Encoding` |
| `/assets/babylonjs/*.js`, `/assets/css/*.css`, `/textures/**`, `/admin/imagedetails/**` | **`max-age=14400`** (4 h) | **HIT** | `last-modified`, `age` |
| `/admin/objects/*.glb` (furniture) | **none** (header absent) | **DYNAMIC** | `last-modified`, `accept-ranges: bytes` |
| `cdn.jsdelivr.net/…/lazyload.min.js` | `public, max-age=31536000, s-maxage=31536000, immutable` | HIT | — |
| `fonts.gstatic.com/…woff2` | `public, max-age=31536000` | — | — |
| `assets.babylonjs.com/generated/Assets.js` | `max-age=3600, s-maxage=86400` | — | — |
| `js.puter.com/v2/` (3rd-party SDK) | `public, max-age=0, s-maxage=31536000` | — | — |

Consequences (OBSERVED + INFERRED):
1. **The hash-versioned `js.php` modules cache perfectly** — and note that `no-store` is sent only when the request has no browser session (round-1 §2.2); inside the page the same URL is cacheable and `immutable`.
2. **The 4-hour window on `/assets/**` is the real repeat-visit tax.** Those 17 `/assets/**` responses total **2 981 358 B transfer**, of which the Babylon family alone is **2 886 101 B** (`babylon.js` 1 559 208, `ammo.js` 525 145, `loaders` 504 570, `cannon.js` 122 160, `materials` 69 986, `Oimo` 49 581, `serializers` 34 259, `proceduralTextures` 12 253, `postProcess` 5 520, `earcut` 3 419) plus `/assets/css/**` 52 564 B and Bootstrap/jQuery 40 627 B. A user returning after >4 h re-downloads all of it even though the files never change (`last-modified` fixed at build time, 2026-10-30; the capture saw `age: 2973` on a Cloudflare HIT). This is the highest-leverage caching defect measured (INFERRED from header values; `last-modified`/`age` and the byte split OBSERVED).
3. **GLB models get no `cache-control` at all** — `cf-cache-status: DYNAMIC`, only `last-modified` and `accept-ranges: bytes` — so each distinct furniture model is a full ~0.4–2.2 MB re-fetch whenever it is placed (OBSERVED; `curl -sI .../r38bed.glb`).
4. **`app.php` being `no-store` is correct** (it embeds a per-page bootstrap + PHP session) but it is also the 2.09 MB document, so first paint cannot be made cheap by caching the document — the only lever is shrinking it (§2.3, Ideas 1–2).

**Warm/repeat-visit measurement (visible page, foregrounded).** Re-navigating with the HTTP cache enabled in the same profile (`evidence/coldload_vis.json` → `evidence/warmload_vis.json`):

| | Cold (cache cleared) | Warm (cache enabled) |
|---|---|---|
| Requests / responses | 127 / 125 | 125 / 124 |
| HTML TTFB | 755 ms | 713 ms |
| `domContentLoaded` / `load` | 1 744 / **1 758 ms** | 1 324 / **1 336 ms** |
| `transferSize` (whole page) | 4 748 849 B | **0 B** |
| Responses flagged `fromDiskCache` | 0 | **38 of 124** (all 36 catalog PNGs + 2 SVGs, each `cached=36/36` for `image/png`) |
| `encodedBodySize` still reported | 4 712 849 B | 4 688 897 B |

So the repeat visit is **genuinely free in bytes** (HTML `transferSize` 0 means the `no-store` document itself came from the memory cache within the session) but it saves only **~420 ms of `load`** — because the *parse and execute* of 11.7 MB of already-downloaded JavaScript, plus the 2.09 MB HTML parse and the 29 sequential `js.php` calls that still hit the network (~190–300 ms of server time each), remains on the critical path (OBSERVED). `js.php` responses are never in `fromDiskCache` in this run — they are re-fetched from the origin every navigation. **The practical lesson: for a repeat visitor the bottleneck moves from bandwidth to CPU + origin latency, and the app pays both every time.**

The earlier backgrounded warm run (`evidence/warmload_run.json`) showed the same byte story (`transfer: 0`) but inflated `dcl`/`load` (~24.8 s) from rAF throttling; the foregrounded numbers above supersede it.

### 2.3 Lazy loading: catalog metadata, thumbnails, GLB models

Three distinct tiers, measured separately.

**Tier 1 — catalog metadata: fully eager, and it is the largest single item on the page.** `window.HP_BOOT` is inlined in the HTML; re-serialised from the live page it is **1 174 925 B** (OBSERVED, `evidence/out_boot.json`):

| Key | Entries | Bytes | Per-entry fields |
|---|---|---|---|
| `objectOptions` | 1 776 | 606 254 | `id, title, title_en, image, path, slug, tokens[], category, parent, grand_parent, door_window, rotation_offset` |
| `products` | (nested) | 225 809 | — |
| `textures` | (nested) | 125 650 | — |
| `floorplanTextureCatalog` | 456 | 114 292 | `id, title, image, imagebump, category, parent, featured` |
| `suggestions` | — | 67 123 | — |
| `objectCategories` | 157 | 14 063 | `id, category, parent, grand_parent` |
| `doorOptions` | 60 | 12 160 | `id, title, image, path, rotation_offset` |
| `windowOptions` | 46 | 9 438 | same as doors |
| **Total** | | **1 174 925** | |

`path` (the GLB URL) is present eagerly for every door/window/object and `tokens[]` (the search index) is inlined too — ~600 KB is furniture metadata + GLB URLs, and search works with no round-trip (OBSERVED, `evidence/out_boot.json`).

**Tier 2 — thumbnails: DOM eager, bytes lazy (and the lazy part works correctly).** The catalog panel is built at load and contains **2 633 `<img>` elements, 2 592 of them `class="lazy"` with a `data-src`** pointing at `/admin/imagedetails/*.png`; the initial `src` is `/textures/loading.gif` (2 993 B, fetched once). `vanilla-lazyload@17.8.4` is configured `{elements_selector: ".lazy", threshold: 300, data_src: "src", use_native: false}`. Re-measured on a **foregrounded** page (OBSERVED — `evidence/out_vis.json`, `evidence/out_scroll2.json`):
- **39 images had loaded, and all 39 are exactly the visible ones** (`visible: 39`, `hidden: 2553`, `loadedVisible: 39`; a later sample `evidence/out_verify.json` shows 36 loaded / 384 803 B decoded) — the observer is doing precisely its job, and my earlier "scrolling changed nothing" was a hidden-page artefact.
- **536 of the 2 592 images live inside a `display: none` tab** (`hp-catalog-pane hp-tab-hidden`) — tiles for a tab the user has not opened, constructed up front regardless.
- The `.hp-catalog` subtree is **743 918 B of HTML, 2 592 `<img>` of 11 350 total DOM nodes**; the catalog's own declared height is 829 px while it holds 2 592 tiles, i.e. the tiles exist as DOM but are laid out inside small scroll panes.
- **Net effect:** image *bytes* are well deferred (~385 KB of thumbnails fetched, of a catalogue whose full thumbnail set would be tens of MB), but the **DOM construction cost and 744 KB of markup are paid up front**, and lazy-loading helps with neither.
- **No `<link rel=preload>`, `rel=prefetch`, `rel=modulepreload`, or `decoding="async"` is used anywhere** (OBSERVED — grep over `02-02/evidence/app.php.html`: all counts 0). 32 `loading="lazy"` attributes exist in the served DOM, but none of them are on the `.lazy` catalogue tiles (`evidence/out_verify.json`: 0 of 2 592) and the lazy-lib is configured `use_native: false`, so native lazy-loading contributes nothing to the catalogue.

**Tier 3 — GLB geometry: fully lazy, on placement.** **Zero** `/admin/objects/*.glb` requests during the cold load. When I called the page's own `HP3D.placeObject({model: '<glb>', …})` API, the first use of each model triggered exactly one `SceneLoader.ImportMesh` fetch, after which the model was reused from a module-level template map (repeat placements of the same path produced no new request) (OBSERVED — `evidence/coldload_run.json` (0 GLB), `evidence/out_populate2.json`, `evidence/out_scale.json`):

| Model | Bytes | Verts |
|---|---|---|
| `/admin/objects/r38bed.glb` (bed) | 415 520 | 80 314 |
| `/admin/objects/a4oTV.glb` (TV) | 797 508 | 20 088 |
| `/admin/objects/slgSofa.glb` (sofa) | 2 206 688 | 55 391 |

Model bytes are **not** proportional to vertex count (the 0.8 MB TV has 20 k verts; the 2.2 MB sofa has 55 k), i.e. the GLBs carry heavy textures/attributes relative to geometry, so per-model download dominates first-placement cost, not tessellation (OBSERVED, same files).

### 2.4 Scene cost: empty vs populated

Measured by forcing `scene.render()` and reading `engine._drawCalls.current` immediately before and after each frame (the engine's own counter), plus `scene.getActiveMeshes()`, vertex/index totals, material/texture counts, compiled-effect count and `performance.memory.usedJSHeapSize`.

**Empty project** (fresh editor, no room drawn; OBSERVED, `evidence/out_dc_empty.json` and `evidence/out_scene_empty.json`):

| Metric | Value |
|---|---|
| Meshes / enabled | 6 / 5 (`skyBox`, 2× `ground`, `ground2`, `myPlane`, disabled `inpacttorus`) |
| Materials / textures / lights | 7 / 13 / 4 (2× Hemispheric, 1× Directional, 1× disabled Spot) |
| Active meshes | 3 |
| Vertices / indices | 10 526 / 61 788 |
| Geometries | 6 |
| Compiled effects (shader programs) | 7 |
| **Draw calls per frame** | **11** |
| Forced-render ms | **0.3** |
| `usedJSHeapSize` | ≈ 73–90 MB |
| Shadow map | 1024², render list 0 casters |
| Effect layers | 1 (glow, blur kernel 32) |

The base scene is a 100 m² terrain `GroundMesh` (`ground2`, 10 201 verts / 60 000 indices) with a `MixMaterial` and 5 textures including two 2048² terrain maps; GPU texture footprint at empty state is dominated by **`textures/target.png` (1610², ~10.4 MB), two 2048² terrain maps (~16.8 MB each) and the 512² HDR cube (~1 MB)** — ~45 MB of texture memory before the user draws anything (OBSERVED — `evidence/out_scene_empty.json`).

**Populated project** — I built a 5×4 m room (4 walls) and placed 20 furniture models via the page's own API, measuring after each tranche (OBSERVED — `evidence/out_scale.json`):

| Scene | Meshes | Materials | Textures | Active meshes | Verts | Indices | Programs | **Draw calls** | **ms/frame** | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|
| empty | 6 | 7 | 13 | 3 | 10 526 | 61 788 | 7 | **11** | **0.3** | 73.2 |
| 4 walls | 26 | 31 | 14 | 23 | 10 846 | 62 268 | 11 | **84** | **1.8** | 82.2 |
| + 1 furniture | 27 | 41 | 15 | 24 | 30 934 | 137 172 | 11 | **94** | **1.5** | 82.9 |
| + 5 furniture | 31 | 74 | 15 | 28 | 267 041 | 1 127 220 | 13 | **186** | **16.1** | 89.5 |
| + 10 furniture | 36 | 96 | 15 | 33 | 498 313 | 2 054 514 | 13 | **288** | **22.5** | 89.8 |
| + 20 furniture | 46 | **149** | 15 | 43 | 1 046 006 | 4 322 790 | 13 | **501** | **69.1** | 96.9 |

**Where the draw calls actually go: three passes per submesh, and every model is multi-material.** Placing **six copies of one and the same model** (`r38bed.glb`) took the scene from 11 → **156 draw calls** for 12 meshes — but the GLB was fetched **once** (geometry-template reuse works). Inspecting the six placed meshes (all named `objmeshes`) shows each carries **8 submeshes backed by 8 distinct sub-materials (`wire_*` names) inside one MultiMaterial**. Toggling passes in the live scene gives an exactly additive, fully consistent decomposition (OBSERVED — `evidence/out_decomp.json`, `evidence/out_dedupe.json`, `evidence/out_sub.json`):

| Configuration | Draw calls | Delta | Explanation |
|---|---|---|---|
| baseline (6 beds, shadows + glow on) | **156** | — | base scene (12) + beds (144) |
| shadow map render list cleared | **108** | **−48** | one shadow pass per submesh (6 beds × 8) |
| glow layer disabled | **100** | **−56** | 48 from the beds (8 submeshes × 6) + 8 from base meshes |
| shadows **and** glow off | **52** | **−104** | the two deltas add exactly (48 + 56) |
| all 6 placed beds disabled | **12** | **−144** | the beds are the whole scene: **24 draw calls each** = 8 submeshes × 3 passes |
| sharing the material *object* across the 6 beds | 156 | **0** | sharing a material object does not reduce draw calls — cost is per **submesh** |

So the cost structure is: **placements × submeshes-per-model × number-of-passes** (main + shadow + glow). Two consequences:

- **Multi-material GLBs are the hidden multiplier, and shadows+glow triple the cost.** A "simple" bed with 8 material slots costs 8 main + 8 shadow + 8 glow = **24 draw calls per placement**; 20 such items ≈ 480–500 draw calls, matching the 501 measured in the scaling table. Atlas-combining the sub-materials (one texture, one material, one submesh) would cut this up to ~8×.
- **Shadows + glow together are ~67 % of draw calls in a small furnished scene** (104 of 156). Everything placed is auto-registered as a shadow caster (`addShadowCaster`, `evidence/out_place.json`) and the shadow map has `refreshRate: 1` (every frame, `evidence/out_wall.json`); the glow layer is on by default. Setting the shadow map to re-render only when geometry/light/camera changes, and enabling glow only for selection/hover, removes **104 of 156** draw calls for an unmoving scene with no visual loss to a static view.

Readings:
- **Draw calls grow ~25 per furniture item** (501−11)/20 ≈ 24.5, consistent with the 24 per placement measured in the 6-bed decomposition. Each placed GLB becomes **one root mesh** named `objmeshes` (`getChildMeshes()` returns 0 — the imported hierarchy is flattened into a single mesh) carrying its own **MultiMaterial with 8 sub-material slots**; it is neither merged nor instanced, and material objects are per placement (unique ids `multi#512…`).
- **Walls are cheap in vertices but expensive in draw calls.** Four 3 m walls cost **73 draw calls** (84−11): by default each wall is a `wall_merged` mesh plus a `wallslaves` mesh *per wall side* — I counted 1 `wall_merged` + 4 `wallslaves` per wall, so 5 meshes × ~4 draw calls (with the shadow and glow passes) per wall. The wall geometry is only 48 verts (merged) per wall (OBSERVED — `evidence/out_populate2.json` mesh list, `evidence/out_decomp.json` for the pass multiplier).
- **Material count is a symptom, not the cause.** `materials` reaches **149** for 46 meshes (~3.2 per mesh) because every placement allocates its own MultiMaterial (8 sub-material slots each). Sharing the material *object* between identical placements does **not** reduce draw calls (measured: 156 → 156), because Babylon issues one draw call per **submesh**; the win comes from reducing submeshes (atlas the model) or from instancing, not from deduplicating material objects (OBSERVED — `evidence/out_sub.json`, `evidence/out_decomp.json`).
- **Forced-render ms stays low until ~10 items** (0.3 → 22.5 ms), then degrades sharply at 20 (69 ms). On SwiftShader this is CPU rasterisation; the *draw-call and material counts* are the hardware-independent, transferable numbers.
- **JS heap grows only ~24 MB from empty to 20 items** (73 → 97 MB) — geometry lives in GPU buffers, not the JS heap; much of the 73 MB baseline is catalog strings, DOM and Babylon itself (OBSERVED).

**Render-loop gating (the best performance idea on the site).** `HPRenderLoop` exposes `wake()`, `isIdle()`, `isSettling()`; decompiled bodies (OBSERVED, `evidence/out_loop.json`):
- `wake` = `() => { const t = performance.now(); if (t - lastActive > 0xbb8) lastActive = t; lastWake = t; }` (0xBB8 = 3000 ms)
- `isIdle` = `() => performance.now() - lastActive > 0xbb8`
- `isSettling` = `() => isIdle() || performance.now() - lastWake < 0x5dc` (0x5DC = 1500 ms)

So the render loop is throttled to zero after 3 s without a wake and stays "settling" for 1.5 s after the last interaction. In the capture the page rendered **0 frames in 15 s** while idle, even though `engine.getFps()` still reported 60, and a synthetic `pointermove`/`pointerdown` on the canvas flipped `isIdle()` to `false` (OBSERVED — `evidence/out_idle.json`, `evidence/out_idle2.json`). This is a deliberate, measurable CPU/battery optimisation for a static editor scene.

**Tier 4 — the whole 2D planner is lazy and created on demand.** The editor does **not** ship the 2D planner at load: cold-load captures contain **0** requests for `2D-Planner/*` or `planner/*` modules. After clicking the `2D` view control, an `iframe#floorplanIframe` is inserted with `src = /2D-Planner/index.php?lang=en`, sized to the full viewport (1600 × 913) and same-origin (its `contentDocument` is reachable), and **only then** do the 2D document + its `planner/**` modules load (OBSERVED — `evidence/coldload_vis.json` (0 requests), `evidence/out_2dbtn.json`, `evidence/out_iframe.json`, `evidence/out_2dcost.json`). While the 2D view is active the 3D `renderCanvas` is hidden (`visible: false`) and the Babylon loop stays idle, so the two views are mutually exclusive rather than rendering simultaneously; in my backgrounded capture the 3D side recorded 0 frames over 2 s while 2D was open, consistent with `HPRenderLoop` idling a hidden canvas (OBSERVED).

### 2.5 Other measured cost facts

- **The 2D planner is a completely separate, much lighter document — and the right template for CasaPlazAI's plan view.** `https://www.3dhouseplanner.com/2D-Planner/index.php` loads in **26 requests / 433 KB transfer / 1.31 MB decoded, TTFB 731 ms, `load` 1 519 ms** versus the 3D editor's 127 requests / 4.75 MB / 13.0 MB and 1 758 ms. Its DOM is small, it ships **no Babylon at all** (13 scripts, largest `planner-main` 503 KB decoded, then `objectCatalog` 30 KB, `bridge3d` 24 KB, `uiShell` 24 KB, `floorplanEditor` 22 KB) and it parses quickly enough that `dcl` (1 499 ms) is close to TTFB (731 ms). It is a standalone same-origin document with `planner/**` modules instead of `editor/**` and an explicit `bridge3d` module for the 2D⇄3D link; the editor embeds it in `iframe#floorplanIframe` **only when Plan mode is first opened** (see §2.3 Tier 4) (OBSERVED — `evidence/coldload_2d.json`, `evidence/out_2dperf.json`, `evidence/out_iframe.json`).
- **Physics is downloaded but idle.** `ammo.js` (1.80 MB decoded), `cannon.js` (393 KB) and `Oimo.js` (156 KB) are all fetched at cold load — **2.35 MB decoded / ~700 KB transfer** — yet the empty scene reports `physicsEnabled: true` with `getPhysicsEngine()` falsy, and my wall/furniture placements never triggered a physics step (OBSERVED — `evidence/coldload_run.json`, `evidence/out_state2.json`). Pure cold-load weight for the common case.
- **Textures are heavy before any content exists.** Empty state holds 13 textures ≈ 45 MB of GPU texture memory, dominated by `textures/target.png` (1610×1610) and two 2048² terrain maps; `ground2` alone is a 10 201-vert terrain mesh with a `MixMaterial` and 5 textures (OBSERVED — `evidence/out_scene_empty.json`).
- **Third-party SDKs on the critical path.** `js.puter.com/v2/` loads at 1062 ms as a page `<script>` with no `integrity` and `cache-control: public, max-age=0`; `assets.babylonjs.com/generated/Assets.js` is a second external dependency at 723 ms (OBSERVED — `evidence/coldload_run.json`).
- **CSS is three files, two of them large.** `hp-ui.css` (104 500 B decoded), `hp-panels.css` (35 141 B), `hp-io.css` (8 999 B) over Bootstrap-era `icon.css`/`main.css`; no critical-CSS inlining (OBSERVED).
- **A font file is mis-declared as a stylesheet** (`assets/bootstrap/css/Roboto-Regular.ttf`, requested at 723/769 ms) and produces a MIME error (round-1 console events; OBSERVED there).

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

| # | Idea | Tied to finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Cap catalog metadata and keep it out of the HTML.** 3D House Planner inlines 1.175 MB of `HP_BOOT` for 1 776 objects + 456 textures, making the `no-store` document 2.09 MB / ~2.0 MB of which is catalog payload. CasaPlazAI's palette is small: inline only the *visible* first page (say 100 items) and fetch the rest as a static, long-cached JSON (`public, max-age=31536000, immutable`) with a content hash. Target: initial HTML under ~150 KB. | §2.1, §2.3 Tier 1 | **Very high** | Low–Medium |
| 2 | **Virtualise the catalog DOM; do not create 2 592 `<img>` nodes.** The catalog subtree is 744 KB / 2 592 images at load, of which only the **39 visible ones** ever fetch. Render only items in/near the viewport (windowed list) so the browser creates/destroys rows. Removes ~744 KB of markup and ~2.4 k DOM nodes from first paint *and* makes the lazyload threshold unnecessary. | §2.3 Tier 2 | **Very high** | Medium |
| 3 | **Give static assets a real cache lifetime.** `/assets/**` (2.98 MB transfer, of which 2.89 MB is the unchanging Babylon family) is capped at `max-age=14400`, so a >4 h return re-downloads it; GLBs have *no* `cache-control` at all. Fingerprint the bundle and serve it `max-age=31536000, immutable`; give model/thumbnail files a long TTL. Cheapest repeat-visit win available. | §2.2 | **High** | Low |
| 4 | **Gate the render loop when the scene is static.** Copy `HPRenderLoop`: stop `requestAnimationFrame` after ~3 s with no input/change, start it on pointer/keyboard/plan-mutation (`wake()`), keep a ~1.5 s settling window so animations finish. Measured 0 frames in 15 s idle while `getFps()` still read 60 — a large CPU/battery saving for a page users leave open. Drive `wake()` from the same mutation event that marks the plan dirty for autosave. | §2.4 | **High** | Low |
| 5 | **Defer or drop the physics engines.** 2.35 MB decoded / ~700 KB transfer of Ammo + Cannon + Oimo downloads even when no physics runs (`ammo.js` alone is 1.8 MB). CasaPlazAI's fit/collision checks are geometric; if physics is ever needed, load one engine behind `await import()` on first use. | §2.5 | **High** | Low |
| 6 | **One material + one submesh per palette model; instance repeats.** Measured: each placed bed costs **24 draw calls** (8 submeshes × 3 passes); 6 identical beds → **156 draw calls**; 20 mixed items → 149 materials and 501 draw calls. Two rules fix most of it: (a) **atlas the model's sub-materials** so a placed item is 1 submesh, and (b) use thin instances for repeats. Draw calls then scale with distinct models, not placements × material slots × passes. | §2.4 | **High** | Medium |
| 6b | **Make shadows static and glow on-demand.** Shadows + glow are **104 of 156 draw calls (67 %)** in a 6-item scene, measured by toggling each pass. Set `shadowGenerator.getShadowMap().refreshRate = RENDERONCE` and re-render only when geometry or the light moves, and enable the glow layer for selection/hover instead of always-on. Biggest fixed cost in a small scene, no geometry work needed. | §2.4 | **High** | Low |
| 7 | **Model the scene budget as draw calls + materials and expose it in dev.** Add a debug HUD for `scene.meshes`, `materials`, `getActiveMeshes()`, `getTotalVertices()` and a forced-render draw-call delta — the exact measurement used here. CasaPlazAI has an inspector in progress; a "Scene stats" tab makes regressions visible. | §2.4 | Medium | Low |
| 8 | **Keep the wall representation merged.** 4 walls cost 73 draw calls because each wall is `wall_merged` + 4 × `wallslaves`. Merge a whole wall run into one mesh and render wall sides with one material; walls are the first thing every user draws, so this is the highest-frequency scene cost. | §2.4 | Medium | Medium |
| 9 | **Avoid the per-module PHP tail.** App modules are served by a PHP shim adding ~190–300 ms server time each and, as classic deferred scripts, they serialise. CasaPlazAI is a single Vite bundle: keep it to 1–2 hashed JS files plus a hashed CSS file so the waterfall is 3 requests, not 46 scripts. | §2.1 | Medium | Low |
| 10 | **Budget the empty scene's texture memory.** 13 textures / ~45 MB at empty state, dominated by 2048² terrain maps and a 1610² utility texture. If CasaPlazAI keeps a ground plane, use a small tiled texture (512²) or lazy-load hi-res terrain only when the terrain tool opens. | §2.5 | Medium | Low |
| 11 | **Inline critical CSS and preload the renderer chunk.** No `rel=preload`/`modulepreload`/critical CSS is used; the head is render-blocking on 7 stylesheets. Inline the shell CSS (<10 KB) and `<link rel="modulepreload">` the Three.js chunk so 3D starts as early as possible. | §2.1, §2.2 | Medium | Low |
| 12 | **Keep the document tiny and validatable.** `app.php` is correctly `no-store` (it embeds bootstrap data) but is 2.09 MB. CasaPlazAI has no server: its `index.html` should be short-cacheable (`no-cache` + `ETag`) with all data in IndexedDB, so a repeat visit costs ~0 HTML bytes. | §2.2 | Medium | Low |
| 13 | **Treat the 2D planner as its own lightweight entry point, loaded on demand.** 3D House Planner lazily inserts an `iframe#floorplanIframe` → `/2D-Planner/index.php` (26 requests / 433 KB / 1.31 MB decoded, **no Babylon**) only when Plan mode is chosen, and hides the 3D canvas while it is open. For CasaPlazAI this validates the mode split: keep the Plan bundle free of the 3D renderer and load Three.js only when 3D/Walk is entered (`await import()`), so a user who only draws a floor plan never pays for the renderer — and never run two renderers at once. | §2.3 Tier 4, §2.5 | **High** | Medium |
| 14 | **Optimise for the repeat visit's CPU, not its bytes.** A warm revisit transfers 0 bytes but `load` only improves ~420 ms because parse/execute of 11.7 MB + 29 origin calls dominate. For CasaPlazAI that means: ship a small bundle (parse cost), avoid many small HTTP calls (origin cost), and keep startup work proportional to the plan's size (defer palette building until the catalog panel opens). | §2.2, §2.3 | **Medium** | Medium |

*Schema tie-ins:* Ideas 1–2 map to the CasaPlazAI palette in `casaplazai-schema.md` (furniture entries reference a catalog id + transform — keep the catalog out of the plan document and version it separately). Idea 4's `wake()` should be driven by the same mutation events that mark the plan dirty for autosave, so idleness and dirty-tracking share one signal. Idea 7's "Scene stats" tab fits the in-progress inspector. Ideas 3/5/6 need no schema change.

---

## 4. Unknowns

- **The warm-cache byte story is solid; the warm-cache *timing* is approximate.** The foregrounded warm run (`evidence/warmload_vis.json`) shows `transferSize` 0 and 38 `fromDiskCache` responses, so "repeat visits cost no bytes" is OBSERVED. But the same run still reports nonzero `encodedBodySize` for every resource and the OS memory cache (not the HTTP disk cache) is doing the work, so the ~420 ms saving is a single sample, not a distribution. A lab-style repeat (multiple cold/warm pairs, `Page.reload` semantics documented, `encodedDataLength` from `Network.loadingFinished`) would firm up the delta.
- **Real-GPU frame cost is unmeasured.** All ms/frame numbers come from SwiftShader software rasterisation; draw-call and material counts are hardware-independent, the absolute ms is not. No GPU WebGL was available headless (round-1 caveat still applies).
- **Why `getActiveMeshes()` was 0 on the empty scene in some probes.** In the fresh-page runs `activeMeshes` read 0 until a forced `render()` populated the frustum cache; the "3 active meshes" figure is post-render. The gating interaction (`HPRenderLoop` idle + stale frustum) is understood in outline, not fully.
- **Whether the catalog IntersectionObserver really fires below the fold.** Resolved as a hidden-page artefact: on a foregrounded page **all 39 visible lazy images are loaded and all 2 553 off-screen ones are not** (`evidence/out_vis.json`), i.e. the observer works. What remains open is the *cost* of the 536 tiles built inside `display: none` tabs, and whether a real scroll through all 2 592 tiles produces a smooth (incremental) or bursty (batched) image fetch pattern.
- **2D planner load and lazy-iframe creation are measured; the sync traffic is not.** `/2D-Planner/index.php` cold load (26 requests / 433 KB / `load` 1 519 ms), its script inventory, and the fact that it is inserted as an on-demand same-origin `iframe#floorplanIframe` (0 requests at editor cold load) are OBSERVED (`evidence/coldload_2d.json`, `evidence/out_2dperf.json`, `evidence/out_iframe.json`). What I did **not** exercise is the actual 2D⇄3D sync: no plan was drawn in the 2D editor, so the `bridge3d` `postMessage` payloads, their frequency, and the 3D-side cost of applying a live 2D edit are unmeasured. Round 1 left the same protocol unverified.
- **Autosave/IndexedDB write cost and cadence.** Round 1 established the `hp-bim` schema; write amplification (a JPEG-thumbnail data URL per save, ~25.8 KB per index record) and the timer cadence were not measured here — a plausible long-session cost.
- **Path-tracer and export costs remain demand-only.** `three-pathtracer` (1.04 MB) + `environment.hdr` (5.95 MB) never loaded; the actual cost when Ultra mode is chosen is unmeasured (round-1 INFERRED wiring).
- **The 4 h TTL may be a Cloudflare-zone default**, not an app decision; if the origin sends `max-age=14400` deliberately, Idea 3 needs the site's own hashing story (its `?v=<hash>` on CSS shows a versioning scheme already exists and could carry a longer TTL).
- **No 3D House Planner source was copied.** All code observations are runtime introspection and decompiled strings used as evidence for behaviour/size claims; licence position is unchanged from round 1 (proprietary; catalog assets CC-BY/CC-BY-NC-SA and Sweet Home 3D 7.0.2 — must not be reused).
