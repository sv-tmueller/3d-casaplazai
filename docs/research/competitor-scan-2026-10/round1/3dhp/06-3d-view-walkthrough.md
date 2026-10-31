# 3D House Planner — 3D view, camera modes, lighting, materials, performance, 2D⇄3D sync

Target: <https://www.3dhouseplanner.com/> (editor at `app.php`, 2D planner at `2D-Planner/index.php`).
Research date: 2026-10-31. All evidence files live in this job folder.

**Tag legend**
- **OBSERVED** — read from the running page or its shipped JavaScript; evidence file named.
- **DOCUMENTED** — vendor's own published claim; URL named.
- **INFERRED** — my interpretation, stated as such.

Renderer: Babylon.js **6.38.0** over **WebGL 2.0**, `BABYLON.EngineStore.Instances[0]` (**OBSERVED**, `scene_profile.json`).

---

## 1. Summary

- The 3D view is a single full-viewport Babylon canvas (`#renderCanvas`) behind fixed chrome (54 px top bar, 30 px status bar, 210 px left dock); **four view modes — 3D / Walk / Top / 2D plan — are one segmented control** (`#hpViewSeg`, `data-view=…`, `hp-active`) in the top bar (**OBSERVED**, `topbar.json`, `shots/view_*.png`).
- Three cameras are pre-built: an **ArcRotateCamera** (orbit), a **UniversalCamera** at 1.54 m eye height (walk), and a second **ArcRotateCamera in ORTHOGRAPHIC mode** with alpha/beta/radius locked for the top view — so "Top" is a real orthographic camera, not a tilted perspective one (**OBSERVED**, `view_states.json`, `ortho_probe.json`).
- Lighting is **2 hemispheric lights + 1 directional "sun" carrying the only shadow map, + 1 disabled spotlight used as a selection highlight**; IBL comes from a small 512² `environment.hdr` cubemap (**OBSERVED**, `scene_profile.json`).
- A **6-step quality ladder** (`draft / balanced / high / ultra / pathtrace / ai`, each with a 1–4 "cost") is persisted in `localStorage['hp-render-mode']`; draft renders at **hardware scaling 1.5 with shadows and glow off**, high/ultra build a `DefaultRenderingPipeline` (`hpPipeline`) plus `SSAO2RenderingPipeline` (`hpSSAO`), and ultra adds **SSR, vignette, grain, ACES tone mapping, contact-hardening 4096² shadows** (**OBSERVED** live + **shipped JS** `deob/hp-render.js`).
- 2D⇄3D sync is a **direct cross-frame object bridge** (`floorplanIframe.contentWindow.FloorplanBridge`) with an imperative API (`projectNow`, `applyPlan`, `getState`, `requestLevel`) and debounced, signature-cached projection — **not** `postMessage` (**OBSERVED**: 0 messages captured while switching views; `deob/hp-sync.js`).

---

## 2. Findings

### 2.1 View-switching and layout

**OBSERVED** — `topbar.json`, `probe_topbar.py`, `probe2.py`, `dom_app.json`.

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- The active mode is marked by the `hp-active` class on the segment button (**OBSERVED**).
- The old controls are retained but hidden: `<div class="hp-legacy-hidden">` wraps `#viewcheck` (2D), `#cameracheck` (Walk) and a **hidden** `#lightcheck` (**OBSERVED**, `app_index.html`; the HTML comment says *"3D / top / walk views are switched from the top bar (hp-ui.js drives these checkboxes)"*).
- Layout around the canvas: `#hpLeftDock` is `position:fixed` at (12, 64), 210 px wide, holding `#hpLevelPanel` and `#hpToolCard`; the render canvas fills the viewport behind them (**OBSERVED**, `modes_probe.json`).
- **"2D plan" is a full swap, not a split view.** Clicking it instantiates `<iframe id="floorplanIframe" src="…/2D-Planner/index.php?lang=en">` at exactly canvas size, and the 3D engine's render size drops to 0×0 (**OBSERVED**, `probe_2d.py`, `shots/2d_view.png`).
- The status bar exposes a units toggle (m/ft), selection summary, a "tools" toggle and a support/donate link; `data-i18n` attributes show the UI is fully translated (`window.HP_I18N_DATA["app"]`) (**OBSERVED**, `app_index.html`).

### 2.2 Camera modes

**OBSERVED** — live `scene.cameras` after each mode switch (`view_states.json`, `ortho_probe.json`, screenshots `shots/view_*.png`).

| | 3D (orbit) | Walk | Top |
|---|---|---|---|
| object | `ArcRotateCamera` "Camera" | `UniversalCamera` | `ArcRotateCamera` "Camera2" |
| projection | perspective, fov 0.8 | perspective, fov 0.8 | **orthographic** (`mode = 1`) |
| position model | alpha −1.571, beta 0.785, radius 28.28 about target (0,0,0) | free position, eye at y = **1.54** | alpha/beta/radius all clamped to constants |
| clamps | lowerBeta 0.01, upperBeta π−0.01 (no pole flip) | — | lowerBeta = upperBeta = 0; lowerAlpha = upperAlpha = −π/2; lowerRadius = upperRadius ≈ 28.28 |
| ortho extents | n/a | n/a | left/right ±20, top/bottom ±10.93 |
| zoom | `wheelPrecision 50` (radius) | `speed 0.2` | `wheelPrecision 3` → wheel changes ortho extents |
| pan | `panningSensibility 1000`, `panningInertia 0.9` | — | same |
| inputs | keyboard, mousewheel, pointers | keyboard, mouse, touch, gamepad | keyboard, mousewheel, pointers |
| collision | `checkCollisions false` | ellipsoid (0.5, 1, 0.5), `checkCollisions false`, `applyGravity false` | — |
| keys | arrows 38/40/37/39 | `keysUp [33]`/`keysDown [34]` (PageUp/PageDown), `keysUpArrow [38]`/`keysDownArrow [40]`, `angularSensibility 2000` | arrows |

- All three cameras share `minZ 1`, `maxZ 10000` and `fov 0.8`; a fourth camera named `hpCapture` is filtered out of the list while the app takes a snapshot (**OBSERVED**, `RPRender` `capture` helper in `deob/hp-render.js`).
- **INFERRED**: the walk camera explicitly has collisions and gravity off, so you can walk through walls — the tooltip promises walking, not physical blocking.
- The tooltip says "WASD / arrows", but the exposed key arrays are PageUp/PageDown (vertical) and arrows (forward/back) — see §4.
- `ux.keys.walk` = *"Walk (first-person view; arrows too)"*, `ui.view3dTip` = *"Orbit around the model"*, `ui.viewTopTip` = *"Orthographic top view of the 3D scene"*, `ui.walkTip` = *"First-person camera (WASD / arrows)"* (**OBSERVED**, `app_index.html` i18n blob).

### 2.3 Lighting

**OBSERVED** — `scene_profile.json` (initial balanced state), `deob/hp-render.js` (per-tier overrides).

| light | class | intensity (balanced) | notes |
|---|---|---|---|
| `HemiLight` | `HemisphericLight` | 0.5 | direction (0, 1, 0.3); groundColor **black** |
| `HemiLight` (2nd) | `HemisphericLight` | 0.7 | direction (0, −1, −0.3) — a second, downward hemi fill |
| `DirLight` | `DirectionalLight` | 0.5 | direction (−0.454, −0.512, 0.729); position (0, 300, 0); **the only light with a shadow generator** |
| `selectionLight` | `SpotLight` | 0 (disabled) | angle 0.0873 rad (5°), exponent 1, position (0, 3, 0) — local highlight for the selected element |

- High/ultra override: hemi 0.48/0.45, hemi2 0.3/0.28, sun 0.85/1.0, hemi groundColor (0.32, 0.3, 0.27) — and these overrides are **skipped when `#lightcheck` is checked** (day/night path) (**OBSERVED**, `deob/hp-render.js`).
- Night sky is time-of-day driven by `hp-sun.js`, not a switch: HTML comment *"night sky: no switch, the time of the day turns it on and off (hp-sun.js); the editor's lights still follow it"*; `#lightcheck` is a hidden input and `#hpSunCard` hosts the sun/time/season card (**OBSERVED**, `app_index.html`).
- Environment: `environmentTexture = ./textures/environment.hdr` (512×512 cubemap), `environmentIntensity` 1 (balanced) → 0.9 (high) → 1.1 (ultra); `scene.ambientColor` (0,0,0); fog **disabled** (`fogMode 0`) although fog params exist (start 0, end 1000, density 0.1, colour 0.2/0.2/0.3) (**OBSERVED**).
- No post-process and no render pipeline exists in `balanced` (`scene.postProcesses == []`, `pipelineObjs == []`) (**OBSERVED**, `quality_modes.json`).

### 2.4 Shadows

**OBSERVED** — `scene_profile.json`, `quality_modes.json`, `deob/hp-render.js`.

- One `ShadowGenerator` on `DirLight`; balanced = **blurred exponential shadow map, 1024², blurKernel 1, bias 0.02, normalBias 0, darkness 0, transparencyShadow true**.
- Tier behaviour (from shipped JS `_0x36ef29` and confirmed live):
  - `draft` → `sun.shadowEnabled = false` (shadows off entirely);
  - `balanced` ("base") → restores the captured original (ESM, 1024²);
  - `high` → resize to **2048²**, `usePercentageCloserFiltering = true`, `filteringQuality = QUALITY_HIGH`, bias 0.0015, normalBias 0.02, darkness 0.15;
  - `ultra` → resize to **4096²**, `useContactHardeningShadow = true`, `contactHardeningLightSizeUVRatio 0.03`, bias 0.0012, normalBias 0.015, darkness 0.1.
- Live confirmations: map 1024 (balanced), 2048 (high), 4096 (ultra) (**OBSERVED**, `quality_modes.json`).

### 2.5 Materials and textures

**OBSERVED** — `probe_meshes2.py` output, `scene_profile.json`.

- Material families in the base scene: `StandardMaterial` (skybox face `corona_bk.png`, 1024²), a `SkyMaterial`, `GridMaterial` (the ground plane), a custom **`MixMaterial`** for terrain, and `std` for interaction props.
- `terrainMaterial` (MixMaterial) layers: blend map 512² + tiled `grass.jpg` 2048², `rock.jpg` 1024², `sand.jpg` 1024²; `specularColor` black; `backFaceCulling = false`; `receiveShadows = true` on `ground2` (10 201 verts / 20 000 tris).
- Textures carry per-texture `anisotropicFilteringLevel`, `gammaSpace`, `wrapU/V`, `uScale/vScale`, `coordinatesIndex` — i.e. tiling is per-material-instance, not baked into the image (**OBSERVED**).
- The ground is a **2-triangle `GridMaterial` plane** (4 verts) rather than a tessellated grid — the grid is a shader effect (**OBSERVED**, `probe_meshes2.py`).
- `HPRender.convertMaterials` exists as a public entry point and is invoked from the high/ultra/pathtrace/ai path; **INFERRED** that it swaps Standard materials to PBR for the prettier tiers (I did not isolate its body).
- The asset catalogue ships in `window.HP_BOOT`: **1 776 object options in 157 categories, 456 textures / floor-plan textures, 60 door options, 46 window options, 1 882 catalogue products** (**OBSERVED**, `hp_boot.json`, extracted from `app_index.html`); GLB loading uses `hp-gltf.js` plus `assets/babylonjs/babylonjs.loaders.js`.
- DOCUMENTED marketing matches this: "Physically Based Rendering (PBR) and Standard materials", "Texture Library with a wide range of high quality textures" (<https://www.3dhouseplanner.com/>).

### 2.6 Quality / visualisation modes

**OBSERVED** — `HPRender.modes` live = `["draft","balanced","high","ultra","pathtrace","ai"]`; mode list with icons and costs read verbatim from shipped JS `deob/hp-render.js`:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Mode is persisted in `localStorage['hp-render-mode']` and broadcast as a `renderMode` event; the toolbar button label mirrors it (`aria-label="Balanced"`) (**OBSERVED**, `probe2.py`, `deob/hp-render.js`).

Effect stack per tier (shipped JS, confirmed live by `pipeline_modes.json` / `post_probe.json`):

| tier | hardware scaling | shadows | post / pipelines |
|---|---|---|---|
| draft | **max(1.5, previous)** — observed 1.5 | **off** | glow layer disabled |
| balanced | 1 | ESM 1024² | none |
| high | 1 | PCF 2048² | `hpPipeline`: MSAA 4 (WebGL2), FXAA, ACES tone mapping (exposure 0.95, contrast 1.12), bloom (threshold 0.88, weight 0.15, kernel 48, scale 0.5), sharpen (edge 0.18), DoF (Medium, f/2.8, focus distance = `max(500, 1000·orbitRadius)` updated every frame); `hpSSAO` (radius 1.6, strength 1.2, base 0.15, 16 samples, maxZ 120, ssaoRatio 0.5, blurRatio 0.5) |
| ultra | 1 | contact-hardening **4096²** | same pipeline with exposure 1, contrast 1.2, **vignette** (weight 1.4, stretch 0.2), **grain** (intensity 4, not animated), bloom weight 0.22; SSAO ssaoRatio 0.75, blurRatio 1, strength 1.4, **32 samples**, expensive blur; plus **`hpSSR`** (strength 0.6, thickness 0.4, maxDistance 60, maxSteps 600, roughnessFactor 0.2, attenuated screen borders/intersections, env texture = scene HDR) when `SSRRenderingPipeline.IsSupported` |
| pathtrace | delegates to `HPPathTrace.open()` | | |
| ai | delegates to `HPRender.openAiRender()` | | |

- Live pipeline names/effects observed at ultra: **`hpPipeline`** = *depth of field, bloom, ImageProcessingPostProcessEffect, SharpenPostProcessEffect, GrainPostProcessEffect, FxaaPostProcessEffect*; **`hpSSAO`** = *SSAOOriginalSceneColor + SSAORenderEffect + SSAOBlurH/V + SSAOCombine* (**OBSERVED**, `post_probe.json`).
- `autoClear` flips from `true` (draft/balanced) to `false` (high/ultra) and `_prePassRenderer` appears — the framebuffer is not redundantly cleared when a full-screen post chain owns the composition (**OBSERVED**, `quality_modes.json`).
- The three cameras each carry the post-process chain (`scene.cameras[i]._postProcesses` shows 19 entries at ultra), i.e. pipelines are camera-attached and re-created on mode change (**OBSERVED**, `post_probe.json`; `deob/hp-render.js` disposes/sets them per switch).

### 2.7 Performance tricks

**OBSERVED** (live flags in `scene_profile.json` / `quality_modes.json`; code in `deob/hp-terrain-detail.js`).

1. **Resolution scaling instead of feature toggling** for the weakest tier: draft sets `engine.setHardwareScalingLevel(max(1.5, previous))`, i.e. ~66 % linear resolution, and disables shadows and the glow layer.
2. **Shadow budget is the headline knob**: 0 → 1024² ESM → 2048² PCF → 4096² contact-hardening.
3. **`scene.skipPointerMovePicking = true`** — no pick ray on every pointer move (picking is done on demand).
4. **`sample := thin instances`** for repeated detail props: `thinInstanceSetBuffer('matrix', Float32Array, 16, false)` + `thinInstanceRefreshBoundingInfo(false)` + `doNotSyncBoundingInfo = true` + `setEnabled(false)` while empty; hundreds of blades/props become one draw call and skip bounding-info sync (**OBSERVED**, `deob/hp-terrain-detail.js`).
5. **`autoClear = false` + pre-pass** when a post chain is active (avoids a full-screen clear pass).
6. **Cheap environment**: a 512² HDR cube rather than a large cubemap; terrain uses 1024–2048² tiling textures.
7. **Pipeline disposal/recreation** on mode switch instead of running all effects and toggling `isEnabled` (the `hpPipeline`/`hpSSAO`/`hpSSR` closures null and re-create) — **INFERRED** from the code path.
8. `blockMaterialDirtyMechanism`, `freezeActiveMeshes`, `skipFrustumClipping` remain **off** — the app does *not* use Babylon's material-freeze or active-mesh freezing (**OBSERVED**, `scene_profile.json`).
9. **Negative finding:** `HPEfficiency` is **not** a graphics auto-scaler. Its exported surface is `render / recalc / state / setState / last / analyze` and its tables are wall U-values (`ceramicBlock 2.39`, `concrete 4.4`, `aac 0.6`, …), window U/g-values and energy labels A+…G. So despite the name, it computes the **building energy/thermal report**, not renderer degradation (**OBSERVED**, `deob/hp-efficiency.js`; **INFERRED** on purpose).
10. I found **no FPS-driven automatic quality downgrade** in the shipped modules I decoded; draft/balanced/high/ultra are user-selected only. An `ui.fps: "{n} FPS"` string exists and `engine.getFps()` is available, but no consumer of it that changes quality (**OBSERVED** for the string; **INFERRED** negative for auto-degrade).

Caveat: FPS readings in this environment are not meaningful — the page ran on a software rasteriser (SwiftShader), so the observed "60 FPS" on an empty scene and 14 FPS right after a resize are not comparative performance data.

### 2.8 2D ⇄ 3D sync

**OBSERVED** — `probe_sync.py`, `deob/hp-sync.js`, `probe_2d.py`, `probe_2dsync.py`.

- The 3D app exposes `window.HPSync`: `enabled, level, requestLevel, buildAt, moveBuild, rotateBuild, moveHandle, deleteBuild, refreshBuildLayer, projectNow, flush, applyPlan, updateContours, contours, setContours3d, contours3d, setRoof, getState, setState`.
- Preferences persist in `localStorage['hp-sync-prefs'] = {enabled, autoSlabs, contours3d}`; **`enabled` defaults to `true`**.
- The transport is a **direct cross-frame object reference**, not `postMessage`: the 3D side resolves `document.getElementById('floorplanIframe').contentWindow.FloorplanBridge`. Hooking `window.postMessage` and an iframe `message` listener recorded **0 messages** across view switches. The iframe window additionally exposes `syncPointerTo`, `syncViewportSize` and `scale` (**OBSERVED**).
- 3D → 2D: `projectNow()` is debounced (its timer handles are module state), builds a per-level projection, compares it against a cached copy with a **signature comparison** (`walls.length` + per-uid hash) and only rebuilds the plan layer when the signature changes. `getState()` returns `{plans, meshless, roofs, meter}`; the default plan scale `meter = 0x3c = 60` (px per metre) (**OBSERVED**, `deob/hp-sync.js`).
- 2D → 3D: `applyPlan(level, data)` is `async`, diffs the incoming walls/objects **by `uid`**, calls `disposeElement(..., {silent:true, deferCut:true})` for elements no longer in the plan, and rebuilds added/changed ones (walls vs objects routed through separate maps). `flush()` coalesces a pending plan push and re-arms a 300 ms timer while a projection is in flight (**OBSERVED**, `deob/hp-sync.js`).
- Sync is user-toggleable — i18n strings `ui.syncOn` = *"Live 2D ⇄ 3D sync on"* / `ui.syncOff` = *"Live 2D ⇄ 3D sync off"* — and the 2D planner is also a standalone route (`index3.php`, "Open the 2D planner (synced with 3D)") (**OBSERVED**).
- The 2D planner itself is a separate SVG editor: `2D-Planner/index.php` loads `planner/qSVG`, `planner/floorplanEditor`, `planner/orientation3d`, `planner/symbols`, `planner/objectCatalog`, `planner/objectPalette`, `planner/planner-main`, `planner/uiShell`, `planner/bridge3d`. Its element IDs are all prefixed `extension-floorplanner-*`, and `localStorage` contains `extension-floorplanner-currently-editing` — the 2D planner is a repurposed browser-extension floor-plan editor with a `bridge3d` module and an `orientation3d` mini-indicator (**OBSERVED**).
- DOCUMENTED match: "Draw in 2D and see it in 3D, move a wall in 3D and the plan follows. No more 'Generate'." (<https://www.3dhouseplanner.com/>).

### 2.9 Scene composition at load, and HUD

- Initial scene: 6 meshes / 3 cameras / 4 lights / 7 materials / 13 textures, 10 526 vertices total — `skyBox`, `ground` (GridMaterial), a second `ground` at `visibility 0`, `ground2` (terrain, 20 000 tris), `myPlane` (`visibility 0`), `inpacttorus` (disabled) (**OBSERVED**, `probe_meshes2.py`, `scene_profile.json`).
- HUD affordances relevant to the 3D view: FPS readout (`ui.fps: "{n} FPS"`), "Frame all" / Home (`ux.frameAll`, `ux.frameEmpty: "Nothing built yet"`), a keyboard cheat-sheet rendered from `textures/hotkeys.svg` in `#modalkey` with groups *View / Editing / Drawing walls / Project*, and a non-dismissible "Project settings" dialog at start (floor-to-floor height **2.65 m**, plan size **100 m**, units m/ft) (**OBSERVED**, `app_index.html`, `probe5.py`, `shots/p1_landing_modal.png`).
- Persistence: IndexedDB databases `hp-bim` (v2) and `puter_cache` (v1); `localStorage` keys `hp-render-mode`, `hp-sync-prefs`, `extension-floorplanner-currently-editing`, `hp-donate` (**OBSERVED**, `probe_sync.py`). DOCUMENTED: "Projects are saved in your own browser (IndexedDB)".
- Cold-load quirk: `app.php` emits `window.location.href='index.php'` unless a PHP session cookie already exists, so a scripted run must visit `index.php` first (**OBSERVED**, `app_index.html`, `app2.html`).

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each is tied to a finding above. "Gap" = what CasaPlazAI lacks today (single-workspace Vite/TS/Three.js planner with 2D drawing, 3D walkthrough, PNG/JPEG export, localStorage autosave).

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **One segmented view switcher** in the top bar — `3D · Walk · Top · 2D` as `data-view` buttons with one active class, driving which camera/panel is live. Replace scattered toggles with a single source of truth. | §2.1 `#hpViewSeg` | High | Low |
| 2 | **A dedicated orthographic top camera** (locked alpha/beta/radius; wheel changes ortho extents) rather than tilting the orbit camera to 90°. Gives a true plan-like, distortion-free overhead view and a natural place to overlay 2D annotation. | §2.2 `Camera2` | High | Low |
| 3 | **A proper FPS walk camera**: fixed eye height (1.54 m), ellipsoid ≈ (0.5, 1, 0.5), low `speed` (0.2), arrows/PageUp-Down for forward/height, and an explicit decision on collisions (3D House Planner ships them **off**). | §2.2 `UniversalCamera` | High | Low |
| 4 | **A persisted quality ladder with a "draft" floor**: draft = render-scale 1.5× + shadows off + no post; balanced = no post; high = bloom/FXAA/ACES/SSAO + 2048 shadows. Store the choice in `localStorage` next to the plan. This is the single biggest win for laptops. | §2.6, §2.7(1) | High | Low–Med |
| 5 | **Surface the current mode + FPS** on the toolbar and status bar (CasaPlazAI already knows its FPS; the competitor shows the mode name right on the button). | §2.9, §2.6 | Med | Low |
| 6 | **Frame-all (Home) with an empty-state toast** ("Nothing built yet") so users can always recover the model. | §2.9 | Med | Low |
| 7 | **Tier the shadow map instead of toggling shadows**: 0 → 1024² blurred-ESM → 2048² PCF → 4096² contact-hardening, keyed off the same quality setting. One directional light with the only shadow generator. | §2.4 | Med | Med |
| 8 | **Small-HDR IBL + two hemispheres**: a 512² equirect/cube environment plus a down-facing hemisphere fill; gives three.js `MeshStandardMaterial` believable fill without a light-probe setup. | §2.3 | Med | Med |
| 9 | **One post-processing assembly line, camera-scoped**: FXAA + ACES tone mapping + bloom + sharpen (+ DoF whose focus follows orbit radius), plus SSAO2; build/dispose on mode change and set `autoClear=false` when it is active. | §2.6, §2.7(5) | Med | Med |
| 10 | **Batch repeated props with `InstancedMesh` and skip bounding-info sync**; keep a disabled pool and enable on demand (same idea as their thin instances). Directly helps a furnished plan with many chairs/plants. | §2.7(4) | Med | Med |
| 11 | **Micro-optimisations**: skip pointer-move raycasts (`skipPointerMovePicking`), and keep the 2-triangle grid floor (shader grid) instead of tessellating one. | §2.7(3), §2.5 | Med | Low |
| 12 | **An explicit, imperative 2D⇄3D bridge** with `projectNow()` (debounced, signature-cached per level) and `applyPlan(level, data)` diffing **by stable element uid**, disposing removed elements. Avoids full-scene regeneration and makes edits round-trip. | §2.8 | High | Med–High |
| 13 | **Make 2D a real mode swap (or a docked second canvas) with a 3D orientation indicator** in the 2D view, and keep a single level + uid as the join key. | §2.1, §2.8 | High | High |
| 14 | **Do not copy their toggling of lights with day/night**: if CasaPlazAI adds a sun control, drive light intensity/colour and `environmentIntensity` together from one time-of-day value (they explicitly keep the editor lights in sync with the sky). | §2.3 | Low | Low |
| 15 | **Do not build an "efficiency" module by name alone** — theirs is a thermal U-value/A–G report, not a performance system. If CasaPlazAI wants auto-degrade, build it separately from any sustainability panel. | §2.7(9–10) | Low (guardrail) | Low |

---

## 4. Unknowns / what I could not verify

1. **WASD binding.** The tooltip claims "WASD / arrows", but the exposed camera key arrays are `keysUp [33]`/`keysDown [34]` (PageUp/PageDown) and `keysUpArrow [38]`/`keysDownArrow [40]`. I did not probe `camera.inputs.attached.keyboard.keysUp/keysDown/…`, so WASD support is unconfirmed.
2. **SSR actually running.** The shipped code constructs `hpSSR` for ultra when `SSRRenderingPipeline.IsSupported`; my live ultra probe of `postProcessRenderPipelineManager._renderPipelines` listed only `hpPipeline` and `hpSSAO`. Whether SSR was unsupported on the software renderer or simply not registered in that manager is unresolved.
3. **`HPRender.convertMaterials` body** — I only saw the exported key and the call sites from the high/ultra/pathtrace/ai path; the actual material conversion (Standard → PBR) is inferred, not read.
4. **Deep internals of `HPSync`** — the projection/diff logic is read as obfuscated-but-string-decoded code; exact data shapes for walls/objects/roofs, and the signature algorithm, are inferred from variable use, not from a schema.
5. **`hp-editor.js` (674 KB) and `hp-bim.js` (454 KB)** are heavily mangled even after string substitution; I did not audit their camera/geometry code. Some camera-setup logic may live there.
6. **REA static bundle analysis failed** (per-script deadline, `bundle_app.json` = `cleanup_incomplete`), so there is no semantic function graph; all code findings come from string-table decoding plus live probes.
7. **Performance numbers are not comparable.** The page ran on SwiftShader (CPU), so FPS figures (60 empty / 14 post-resize) say nothing about real GPU cost. I have no GPU-timed frame budget for any tier.
8. **Mobile/touch behaviour** unverified: I only set device metrics; no touch events were dispatched. `UniversalCamera` registers a `touch` input, and `useNaturalPinchZoom` is false, but the UX is untested.
9. **Pathtrace and AI modes** were not observed running — I read that they delegate to `HPPathTrace.open()` and `HPRender.openAiRender()`; the AI render path appears to call an external service (out of scope; no accounts/paid calls).
10. **IndexedDB schema** (`hp-bim` v2) — object stores, key paths and autosave cadence unverified; only the database name/version and the `HPBIM` API surface (`save/open/listProjects/serialize/restore`) were observed.
11. **2D planner source is incomplete**: `planner/qSVG`, `planner/i18n`, `planner/objectPalette`, `planner/donate` returned `Forbidden` on direct fetch and I did not capture them through the page; the SVG editor internals are therefore only partly observed (`planner-main`, `bridge3d`, `uiShell`, `symbols`, `objectCatalog`, `orientation3d`, `floorplanEditor`).
12. **Layout measurements are viewport-specific**: chrome was measured at a 1600×900 emulated viewport and a 756×413 canvas; responsive breakpoints below/above were not explored.
13. **Whether Walk re-enables collisions/gravity on entry** — I read the arrays after switching to Walk and they were still false, but I did not trace the switch handler, so a later re-application cannot be excluded.
