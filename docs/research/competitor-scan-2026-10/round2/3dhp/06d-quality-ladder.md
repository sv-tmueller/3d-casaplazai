# 3D House Planner — render-quality ladder, performance tactics, post-processing & path-tracer integration

Target: <https://www.3dhouseplanner.com/> (editor `app.php`; 2D planner `2D-Planner/index.php`).
Renderer: **Babylon.js 6.38.0 over WebGL 2.0**; path tracing additionally uses a **separate three.js (`three-gpu-pathtracer`) renderer**.
Research date: 2026-10-31. **Round 2.**

Builds on the round-1 report at
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/report.md` (read-only) and reuses its evidence; it does not repeat the camera/lighting/sync material established there. Round 2 closes round-1 Unknowns **#2 (SSR really running)**, **#3 (`convertMaterials` body)**, **#9 (pathtrace/AI)** and adds the adaptive-degradation question.

**Tag legend**
- **OBSERVED** — read from the running page in this round, or from the vendor's shipped JavaScript. Evidence file named.
- **DOCUMENTED** — vendor's or upstream library's own published statement; URL named.
- **INFERRED** — my interpretation, stated as such.

**Evidence in this folder**
- `evidence/live_quality_ladder.txt` — live CDP probe of all four real-time tiers (headless Chrome 156 + SwiftShader, 1600×913).
- `evidence/render_i18n_strings.txt` — extracted `dict.render.*` strings (mode names, descriptions, cost, pathtrace dialog).
- `scratch/` — working tooling and readable views of the shipped modules: `render.readable.js` (beautified round-1 `deob/hp-render.js`), `pathtrace.readable.js` (beautified round-1 `deob/hp-pathtrace.js`), `decode_editor.js` (string-table decoder for `hp-editor.js`), `cdpx.py`, `probe_*.py`.
- Round-1 files reused read-only: `src/hp-*.js` (raw shipped scripts), `deob/*.js`, `hp_i18n_app.json`.

---

## 1. Summary

- **Six modes, two groups, one persisted key.** `draft · balanced · high · ultra` are the *Real-time quality* group and `pathtrace · ai` the *Photorealistic image* group; each carries a 1–4 "GPU cost" pip row, and the choice persists in `localStorage['hp-render-mode']` (**OBSERVED**, `scratch/render.readable.js` L65–88, L741, L786–804; `evidence/render_i18n_strings.txt`).
- **Draft is pure resolution scaling.** The whole lowest tier is `engine.setHardwareScalingLevel(max(1.5, original))` plus shadows-off plus glow-off — live **1600×913 → 1066×608** with no post chain at all (**OBSERVED**, `evidence/live_quality_ladder.txt`; `scratch/render.readable.js` L210).
- **The shadow map is the headline real-time knob**: off → 1024² blurred-ESM → 2048² PCF → 4096² contact-hardening, swinging bias 0.02 / 0.0015 / 0.0012 and enabling `autoCalcShadowZBounds` only above balanced (**OBSERVED**, live + `scratch/render.readable.js` L138–159).
- **High/Ultra stack a camera-attached `DefaultRenderingPipeline` (`hpPipeline`) + `SSAO2RenderingPipeline` (`hpSSAO`)** built and disposed per switch — MSAA 4, FXAA, ACES, bloom, sharpen, DoF-with-orbit-focus, plus vignette + non-animated grain on Ultra (live camera post-process count 0/0/46/102) (**OBSERVED**, `evidence/live_quality_ladder.txt`; `scratch/render.readable.js` L216–257).
- **The path tracer is a real, second engine**: `HPPathTrace.open()` dynamically imports `assets/vendor/three-pathtracer/three-pathtracer.min.js?v=0.0.26-3`, exports the Babylon scene to GLB via `GLTF2Export.GLBAsync`, re-loads it in **three.js** with `GLTFLoader`, points a `WebGLPathTracer` at it, and progressively accumulates 64/256/1024 samples at 960–3840 px with 3/5/8 bounces, a 0.25-scale low-res preview while compiling, `DenoiseMaterial` and `UnrealBloomPass` (**OBSERVED**, `scratch/pathtrace.readable.js`; live asset HTTP 200, 1 042 183 bytes, contains `WebGLPathTracer`, `DenoiseMaterial`, `EffectComposer`, `UnrealBloomPass`, version string `0.0.26`).
- **Nothing degrades automatically.** A 1 Hz watcher reads `engine.getFps()` and, after 3 s below 18 FPS, shows a one-shot toast *"The view is slow ({n} FPS). Try a lighter mode."* — it never changes mode, resolution or effects; a separate `HPRenderLoop` idle-throttle does skip rendering entirely when idle or hidden (**OBSERVED**, `scratch/render.readable.js` L84, L901–917; `scratch/renderloop.region.txt` via `scratch/decode_editor.js`).

---

## 2. Findings

### 2.1 The quality ladder as shipped

**OBSERVED** — `scratch/render.readable.js`, `evidence/render_i18n_strings.txt`, `evidence/live_quality_ladder.txt`.

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- The Visualisation popover splits them by membership in `['draft','balanced','high','ultra']`: those become `.hp-quality-btn` (icon + name + cost pips) under *Real-time quality*; the rest become large `.hp-photo-btn` cards (icon + name + tagline) under *Photorealistic image* (**OBSERVED**, L741, L786–804). Cost is drawn as four `<span>` pips, `on` for `idx <= cost` (**OBSERVED**, L791–794).
- Vendor descriptions (**OBSERVED**, `evidence/render_i18n_strings.txt`): draft "Fastest. Lower resolution, no shadows."; balanced "Original look. Soft shadows on the ground."; high "Shadows everywhere, ambient occlusion, tone mapping, depth of field."; ultra "Reflections, contact shadows, 4K shadow map. Needs a good GPU."; pathtrace "Real light bounces (global illumination) computed in your browser. From a few seconds to minutes."; ai "Photorealistic image of this camera made by AI (cloud)."
- `pathtrace` and `ai` are **not editor modes**: `setMode` short-circuits to `window.HPPathTrace.open()` / `openAiRender()` and never stores either in `hp-render-mode` (L279–283). A stale `pathtrace`/`ai` in storage is coerced back to `balanced` at load (L324). Round-1 read this correctly.
- `setMode` snapshots an `original` state **once** (image-processing flags, hardware scaling, hemi/hemi2/sun intensities, hemisphere ground colour, environment intensity, glow intensity, full shadow-generator settings incl. `autoZ/minZ/maxZ`), then every tier is expressed as an override of that baseline (L162–215). This is the mechanism that lets the tooltip say "Original look" for balanced: balanced literally restores the captured values.

### 2.2 Hardware scaling & resolution

**OBSERVED** — live `evidence/live_quality_ladder.txt`; engine construction from `src/hp-editor.js` (decoded with `scratch/decode_editor.js`).

| tier | `getHardwareScalingLevel()` | render size at a 1600×913 client |
|---|---|---|
| balanced | 1 | 1600×913 |
| draft | **1.5** | **1066×608** |
| high | 1 | 1600×913 |
| ultra | 1 | 1600×913 |

- The mode code is exactly `engine.setHardwareScalingLevel(mode==='draft' ? Math.max(1.5, original.scaling) : original.scaling)` — the `Math.max` guarantees draft is never *sharper* than the captured baseline (L210).
- The engine is built **without** `adaptToDeviceRatio`: `new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true})` (**OBSERVED**, decoded `hp-editor.js`; live `adaptToDeviceRatio:false`, `devicePixelRatio:1`). So scale is fully manual and draft can be pushed to 1.5 regardless of a HiDPI display — **INFERRED**: on a 2× display a scale of 1 already means one CSS pixel per device pixel here only because the app never multiplies by `devicePixelRatio`; the ladder's 1.5 is therefore a *relative* 66 % linear cut of whatever the baseline is.
- Engine creation is **lazy on a user gesture**: the canvas is created inside the click handler for the start dialog's "define floor" button (`#definefloor`), so WebGL context creation and shader compilation are deferred until the user commits to a project (**OBSERVED**, `scratch/probe_boot.py` — `hp3d` stayed `false` for 60 s until `#definefloor` was clicked, then `engines:1, hp3d:true, loop:true, scene:true` within 3 s). This is a meaningful startup-latency tactic **INFERRED**.
- Context loss is handled: `onContextLostObservable` → toast, `onContextRestoredObservable` → toast + `HPRenderLoop.wake()` (**OBSERVED**, decoded `hp-editor.js`).

### 2.3 Post-processing pipelines (high / ultra)

**OBSERVED** — `scratch/render.readable.js` L216–257; live `evidence/live_quality_ladder.txt`.

`hpPipeline` = `new DefaultRenderingPipeline('hpPipeline', true, scene, cameras)`:

| setting | high | ultra |
|---|---|---|
| `samples` | `engine.webGLVersion >= 2 ? 4 : 1` (MSAA) | same |
| `fxaaEnabled` | true (i.e. FXAA even when MSAA is on) | true |
| tone mapping | ACES, exposure 0.95, contrast 1.12 | ACES, exposure 1, contrast 1.2 |
| bloom | threshold 0.88, weight 0.15, kernel 48, scale 0.5 | weight 0.22 |
| sharpen | `edgeAmount` 0.18 | same |
| vignette | — | enabled, weight 1.4, stretch 0.2 |
| grain | — | enabled, intensity 4, **`animated = false`** |
| DoF | enabled, blur level Medium, f/2.8, `focalLength` 50 | same |
| DoF focus | `onBeforeRenderObservable` sets `focusDistance = Math.max(500, 1000 × orbitRadius)` every frame | same |

`hpSSAO` = `new SSAO2RenderingPipeline('hpSSAO', scene, {ssaoRatio, blurRatio}, cameras)`:

| setting | high | ultra |
|---|---|---|
| `ssaoRatio` / `blurRatio` | 0.5 / 0.5 | 0.75 / 1 |
| `totalStrength` | 1.2 | 1.4 |
| `samples` | 16 | 32 |
| `expensiveBlur` | false | true |
| shared | radius 1.6, base 0.15, maxZ 120, `minZAspect` 0.5 | same |

- Both pipelines are created with the **camera list** from the helper, so they attach to all three cameras; live camera post-process counts are **46 (high)** and **102 (ultra)** across the three cameras (`camPP`), confirming per-camera attachment (**OBSERVED**, `evidence/live_quality_ladder.txt`).
- Disposal is explicit before recreation: the mode switch disposes the pipeline/SSAO/SSR objects and also calls `postProcessRenderPipelineManager.removePipeline(name)`, and removes the DoF observer (L164–195, L195). **INFERRED** (round-1 §2.7.7 also inferred this): recreate-on-switch rather than toggling `isEnabled` avoids paying for inactive full-screen passes.
- Live `_prePassRenderer` becomes truthy at high/ultra (`prepass:true`). My live sample read `scene.autoClear === true` at **all** tiers, whereas round-1 recorded `autoClear` flipping to `false` at high/ultra — a genuine discrepancy I could not reconcile (the two probes read the flag at different points in the switch). Treat the `autoClear=false` optimisation as **unconfirmed by round 2**.
- `render.unsupported` = *"This effect is not supported by your browser / GPU."* exists but, per §2.4, is never surfaced for SSR.

### 2.4 SSR — is it really running? **(round-1 Unknown #2, answered)**

**OBSERVED** — `src/babylon.js` (shipped bundle), live probe.

- `hp-render.js` guards Ultra's SSR with `if (!BABYLON.SSRRenderingPipeline || !BABYLON.SSRRenderingPipeline.IsSupported) return null;` then, if it survives, builds `new BABYLON.SSRRenderingPipeline('hpSSR', scene, cameras, false, Constants.TEXTURETYPE_UNSIGNED_BYTE)` with `strength 0.6, reflectivityThreshold 0.05, thickness 0.4, maxDistance 60, maxSteps 600, step 1, selfCollisionNumSkip 2, blurDispersionStrength 0.03, roughnessFactor 0.2, enableSmoothReflections true, environmentTexture = scene.environmentTexture, attenuateScreenBorders + attenuateIntersectionDistance` (**OBSERVED**, L246–259).
- In the shipped Babylon 6.38.0 bundle the SSR class defines **only an instance `isSupported`** (`getCaps().drawBuffersExtension && getCaps().texelFetch`). Enumerating every `"IsSupported"` and `Object.defineProperty(...,"IsSupported")` in the bundle yields exactly **six** sites: the engine's own, WebGPU's, CSM, SSAO2, and the curvature post-process — **none for SSR** (**OBSERVED**, `src/babylon.js`). Live: `typeof BABYLON.SSRRenderingPipeline === 'function'` but `'IsSupported' in BABYLON.SSRRenderingPipeline === false`.
- Live, both capabilities the real check needs are present (`drawBuffersExtension:true, texelFetch:true`) and a **manual** `new BABYLON.SSRRenderingPipeline('probeSSR', scene, [activeCamera], false, …)` **constructed without throwing and auto-registered itself as `probeSSR`** in the pipeline manager (`evidence/live_quality_ladder.txt`).
- Yet after `setMode('ultra')` the registered pipelines are only `["hpPipeline","hpSSAO"]`, and `ssrRegistered:false` at every tier, in both runs.
- **Conclusion (OBSERVED + INFERRED):** the `!BABYLON.SSRRenderingPipeline.IsSupported` guard evaluates `!undefined === true`, so the Ultra SSR block returns `null` on every browser. The shipped *"Reflections … Needs a good GPU"* bullet is therefore inert on this build, and the user is never told (`render.unsupported` is not wired to this path). Round-1's open question — "unsupported on the software renderer, or simply not registered?" — resolves to **neither: the feature is dead code in the shipped bundle**, even though the GPU path is available.

### 2.5 Shadow ladder

**OBSERVED** — live `evidence/live_quality_ladder.txt`; `scratch/render.readable.js` L138–159.

| tier | sun shadow | map | filter | bias / normalBias / darkness |
|---|---|---|---|---|
| draft | **disabled** (`shadowEnabled=false`) | (left at 1024²) | ESM still flagged | baseline |
| balanced | enabled | 1024² | `useBlurExponentialShadowMap` (baseline) | 0.02 / 0 / 0 |
| high | enabled | **2048²** | `usePercentageCloserFiltering` + `QUALITY_HIGH` | 0.0015 / 0.02 / 0.15 |
| ultra | enabled | **4096²** | `useContactHardeningShadow`, `contactHardeningLightSizeUVRatio 0.03` | 0.0012 / 0.015 / 0.1 |

- Every tier first resets all three filter flags and then sets one, so filters never accumulate; only `base` also restores `blurBoxOffset`, which the others leave alone (**OBSERVED**, L143–147).
- `autoCalcShadowZBounds` is forced to `(tier !== 'base') || original.autoZ`, and `shadowMinZ/MaxZ` are only rewritten on balanced (L148–149). **INFERRED**: high/ultra let Babylon recompute the shadow frustum automatically because the quality tiers already pay for a large map; the cheap tier preserves the author's fixed bounds.
- Only the directional `sun` carries a shadow generator (round-1 §2.3); the shadow budget is therefore a single-map cost, not a per-light one.

### 2.6 Materials conversion (Standard → PBR) **(round-1 Unknown #3, answered)**

**OBSERVED** — `scratch/render.readable.js` L292–323.

- `HPRender.convertMaterials` is an **explicit user action**, not part of the tier switch: the *Sun and materials* section renders a button (`render.pbr.btn` = "Convert materials", hint "Turns the classic materials of walls, floors and objects into physically based ones (better with High / Ultra)") wired straight to `convertMaterials` (L839). This contradicts round-1's inference that it was invoked automatically from the high/ultra/pathtrace/ai path — it is user-triggered, and pathtrace/ai do **not** call it.
- Algorithm: walk `scene.meshes`; for each mesh in the building set (`HP3D.classify(mesh)` truthy and not `'plan'`, or `id === 'wallslaves'`) and not classified `terrain`, replace the material. `MultiMaterial` is handled by mapping `subMaterials`.
- A `StandardMaterial` is converted **unless** it has `disableLighting` or a `reflectionTexture`; conversions are memoised in a `Map` so shared materials convert once and the count returned is the number of *new* PBR materials.
- The converter is intentionally cheap and heuristic: `albedoColor = diffuseColor`, `albedoTexture = diffuseTexture`, `bumpTexture = bumpTexture`, `emissiveColor = emissiveColor`; `metallic = 0`; `roughness = clamp(0.9 − 0.6 × mean(specularColor), 0.35, 0.95)`; `alpha` copied; `backFaceCulling = false`; `subSurface.isRefractionEnabled = false` and `isTranslucencyEnabled = false`. The PBR material is named `'pbr'`.
- It finishes with a toast `render.pbr.done` = *"{n} materials converted to PBR"* and emits a `'material'` event. **INFERRED**: the event is what lets other modules (dims/sync/BIM) refresh.

### 2.7 Adaptive degradation — is anything automatic? **(new question)**

**OBSERVED** — `scratch/render.readable.js` L84, L901–917; live behaviour.

- State: `{mode, original, pipeline, ssao, ssr, receivers:Set, newMeshObserver, slowSince:0, warned:false}`.
- A `setInterval(…, 1000)` runs only while `mode` is `high` or `ultra`:
  - if `document.hidden` **or** `window.HPRenderLoop.isSettling()` → reset `slowSince`;
  - else `fps = engine.getFps()`; if `fps < 18`: if `slowSince` already set and `!warned` and `Date.now() − slowSince > 1770` → set `warned`, `HPUI.toast(t('render.slow', {n: Math.round(fps)}))`; else stamp `slowSince = Date.now()`. If `fps >= 18` → `slowSince = 0`.
- Outcome: **a single advisory toast after ~3 s below 18 FPS**, once per mode entry (`warned` is reset on every `setMode`, L273). There is **no** automatic drop of resolution, shadow size, post effects, or mode. The only "automatic" quality behaviour is the *display* conventions: the FPS readout is suppressed while settling (see §2.8), and the toast is suppressed while the tab is hidden or the loop is settling.
- Cross-check: round-1's negative finding stands — there is no FPS-driven downgrade. The `ui.fps` string is consumed only for the status-bar readout (round-1 §2.9), and `HPEfficiency` is a thermal report, not a scaler.

### 2.8 `HPRenderLoop` — the idle render scheduler

**OBSERVED** — decoded from `src/hp-editor.js` with `scratch/decode_editor.js` (see `scratch/renderloop.region.txt`).

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- `wake()` is registered (passive, capture) on `pointerdown pointermove pointerup wheel keydown keyup touchstart touchmove`, on `window resize`, on `document visibilitychange`, and is additionally added to the app's own `HP3D.events` bus. Modules call it after any edit (sun sliders, terrain painting, material brush, context restore, …).
- The single `engine.runRenderLoop(fn)` is the whole frame budget:
  1. return immediately if the scene's DOM node has `style.display === 'none'` — i.e. **the 2D plan view suspends 3D rendering entirely**;
  2. force `lastActive = now` while `scene.animatables.length` is non-zero or `window.HPAI.busy`;
  3. if idle (`now − lastActive > 3000`) **and** `now − lastRender < 500`, return **without rendering**; otherwise render and stamp `lastRender`.
- Result: an active edit renders at display rate; **an idle scene cost-caps to ~2 FPS and a hidden scene costs nothing**. `isSettling()` (idle, or within 1.5 s of going idle) is what gates the status-bar FPS text and the slow-view toast so that neither fires on the throttled frames.
- **INFERRED**: because `isSettling()` is true whenever idle, and the slow-view check is skipped while settling, the tool can never warn about the ~2 FPS it deliberately produces while idle — the two mechanisms are correctly coupled.

### 2.9 Path-tracer integration (`HPPathTrace`) **(round-1 Unknown #9, answered)**

**OBSERVED** — `scratch/pathtrace.readable.js` (beautified `deob/hp-pathtrace.js`), live asset check. Everything below is read from the shipped module unless tagged otherwise.

**Settings & persistence.** `localStorage['hpPathTraceProbe']` holds
`{quality:'good', size:0x500, bounces:5, sun:3, sky:1, emissive:30, bloom:0.6, exposure:1, denoise:true}`, validated on load to `quality ∈ {preview:64, good:256, final:1024} samples`, `size ∈ {960, 1280, 1920, 3840}`, `bounces ∈ {3, 5, 8}`.

**Engine, renderer, library.** On open it dynamic-imports
`assets/vendor/three-pathtracer/three-pathtracer.min.js?v=0.0.26-3` and builds a **second, independent** `new THREE.WebGLRenderer({canvas: <the dialog's own .hp-pt-image canvas>, antialias:false, preserveDrawingBuffer:false, powerPreference:'high-performance'})`, `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = exposure`. The chosen WebGL filters are deliberate: no MSAA (the path tracer resolves by accumulation), no `preserveDrawingBuffer` (the result is read from a render target), and `high-performance` to keep the discrete GPU selected. The vendored file is 1 042 183 bytes and contains `WebGLPathTracer`, `WebGPUPathTracer`, `DenoiseMaterial`, `FullScreenQuad`, `EffectComposer`, `UnrealBloomPass`, `lowResScale`, `dynamicLowRes`, `filterGlossyFactor`, `transmissiveBounces` and the version substring `0.0.26` (**OBSERVED**, live fetch).

**Tracer configuration** (L832–833):

| option | value | why (INFERRED) |
|---|---|---|
| `tiles.set(2, 2)` | 4 tiles | keeps a single dispatch inside driver time limits on a big image |
| `filterGlossyFactor` | 0.5 | blurry-glossy material filtering → less noise |
| `minSamples` | **1** | show *something* immediately |
| `renderDelay` | **0** | start accumulating at once |
| `fadeDuration` | **0** | instant swap, no fade |
| `dynamicLowRes` | **true** | internal low-res fallback image |
| `lowResScale` | **0.25** | low-res pass at ¼ linear |
| `bounces` | from settings (3/5/8) | UI control |
| `transmissiveBounces` | 10 | glass/water |

The library defaults are `renderDelay 100`, `minSamples 5`, `fadeDuration 500`, `dynamicLowRes false`, `lowResScale 0.25`, so the app consciously trades correctness-of-early-frames for latency (**OBSERVED** vendored source `src/core/WebGLPathTracer.js` @ v0.0.26, DOCUMENTED upstream: <https://github.com/gkjohnson/three-gpu-pathtracer>).

**Scene bridge: Babylon → GLB → three.** Because the two renderers cannot share buffers, the app exports the live Babylon scene with `BABYLON.GLTF2Export.GLBAsync(scene, 'scene', {shouldExportNode})`. The `shouldExportNode` filter includes a mesh iff it is non-disposed, enabled, visible with `visibility ≠ 0`, has vertices, is in the app's "building" classification (`classify !== 'plan'`), is not a terrain-detail mesh, or is the `wallslaves` mesh; terrain detail is temporarily materialised first via `HPTerrainDetail.prepareExport({center: activeCamera.globalPosition})` and restored in a `finally`. A probe `TransformNode` named `hpPathTraceProbe` in the exported graph carries two facts across the bridge: the camera's **flip signs** (`flip.x = 3·x < 0 ? −1 : 1`, `flip.z = 7·z < 0 ? −1 : 1` — i.e. the app derives the Babylon→three handedness from a marker position rather than assuming it) and it is removed before `setScene`.
The GLB is parsed with three's `GLTFLoader`, instanced meshes are **expanded to non-indexed buffer geometry** in a manual loop (three's path tracer cannot consume `InstancedMesh` directly), the scene gets `environment = background = HDRLoader.loadAsync('textures/environment.hdr')` with `EquirectangularReflectionMapping`, and the editor's own post-processes are migrated onto the converted camera.
DOCUMENTED upstream confirms the constraint set: only `MeshStandardMaterial`/`MeshPhysicalMaterial`, point/directional/spot lights "only supported with MIS", emissive materials supported without MIS (<https://github.com/gkjohnson/three-gpu-pathtracer>).

**Camera.** Babylon camera → three camera: orthographic → `OrthographicCamera` with the Babylon ortho box (or `±renderW/2, ±renderH/2`), perspective → `PerspectiveCamera(180·fov/π, aspect, minZ, maxZ)`, honouring `FOVMODE_HORIZONTAL_FIXED`; `up` copied in ortho, `(0,1,0)` otherwise; the orbit target is Babylon's `ArcRotateCamera.getTarget()` or a point 5 m ahead.

**Lights.** `DirectionalLight(0xfff3e0, night ? 0 : sun)` placed at `−1000 × normalize(sun.direction)`. Then an automatic lamp pass: any material with `emissiveMap` or `max(emissive) ≥ 0.15` is collected; for meshes whose bounding box is < 2.5 m, a weight `min(1.5, max(0.02, surfaceArea)) × emissivePeak` is computed, merged with any lamp within 0.3 m (`w += …`, colour `lerp 0.5`), the list is sorted by weight, **sliced to 40** and each becomes a `PointLight(colour, 0, 0, 2)` whose `userData.weight` drives intensity. Ceiling-trim `cove_open` LED strips become `RectAreaLight` segments (skipped below 0.05 m). So a furnished interior gets up to 40 area/point emitters — a real global-illumination cost that is bounded by construction.

**Progressive accumulation & interactivity.** A `requestAnimationFrame` loop calls `pathTracer.renderSample()`, updates the status text and progress bar, and stops at the target sample count; `pause` sets `pausePathTracing = true`, renders one sample, and resets the flag. `HPUI.range` sliders for sun/sky/emissive/bloom/exposure debounce 120 ms then write storage and call `updateEnvironment()` / `updateLights()` / reset; any camera move (`OrbitControls` `change`) sets a `moved` flag and calls `reset()` so accumulation restarts. `OrbitControls` is created on the dialog stage and clamped from the Babylon camera's `lowerBetaLimit`/`upperBetaLimit`/`lowerRadiusLimit`/`upperRadiusLimit`, with `maxPolarAngle ≤ π/2 − 0.01` untilted and rotation disabled for the orthographic camera. The status strings narrate the whole pipeline: *loading the path tracer → exporting the scene → preparing the geometry → compiling the shaders (the first time can take a while) → {n}/{total} samples · {s} s → Done: {n} samples in {s} s* (**OBSERVED**, `evidence/render_i18n_strings.txt`). While tracing, the editor's **own render loops are stopped** (`engine.stopRenderLoop()`, saving `engine._activeRenderLoops`) and restored on close or on any error (L990, L1506bb).

**Post chain in the tracer.** A `FullScreenQuad` with `DenoiseMaterial {map, blending: NoBlending, sigma 2.5, threshold 0.1, kSigma 1}` when "Reduce noise" is on, else a plain `MeshBasicMaterial` blit; `EffectComposer` with `setPixelRatio(1)`, `UnrealBloomPass(new Vector2(256,256), strength = bloom, 0.6, threshold 2.5)` and `OutputPass`. `renderToCanvasCallback` renders the denoise/blit quad into the composer's read buffer, then the composer runs (**OBSERVED**, L834–854). **INFERRED**: `Vector2(256,256)` is the internal bloom mip size, not the output size — bloom is computed at a fixed cheap resolution regardless of the 960–3840 px output.

**Failure paths.** Empty scene → throws `render.pt.empty` ("Nothing to render: the scene is empty."); no WebGL 2 → `render.pt.webgl2`; any other exception → `console.error('Path tracing failed', e)` plus `render.pt.error` on the dialog, and the editor loops are restored. Dialog is a `role="dialog"` with `aria-label`, a `role="status" aria-live="polite"` progress line, a pause button, a **Download PNG** button (disabled until at least one sample), and a close button on `Escape`.

### 2.10 AI render mode

**OBSERVED** — `scratch/render.readable.js` L325–466, L467+.

- `HPRender.openAiRender()` (`render.ai` = "AI photo") is a **cloud** path: it renders the current view offscreen via `BABYLON.Tools.CreateScreenshotUsingRenderTarget(engine, camera, {width:1536, height:…}, cb, 'image/png', 4, …)` (0x600 = 1536 px longest side), then crops/pads it on a 2D canvas to one of ten named aspect ratios `["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"]`, producing a JPEG **frame** and a PNG **view**.
- The handoff goes through `window.HPApi.ai.prompt("render_handoff", …)` with a before/after slider UI, model + style selectors, and Puter.js credits (`render.ai.credits` = "Not enough Puter credits. Recharge at puter.com…"), plus an "AI Studio" route (`index5.php`, HTTP 200). Out of scope here — no paid/AI calls were made.

### 2.11 Capture / export path (relevant to the ladder's top rung)

**OBSERVED** — `scratch/render.readable.js` L370–446.

- The share grid's "4K image" (`render.share.snapshot`) calls `captureView`, which finds the aspect ratio from `["1:1","2:3",…]` closest in log-space to the live render aspect, targets **1536 px on the longest side**, and calls `Tools.CreateScreenshotUsingRenderTarget` with **4 samples**, `image/png`.
- It **temporarily rewrites the active camera's `fov`** when the capture aspect differs from the viewport aspect so the framing matches the chosen ratio, and restores it in an `onAfterRenderObservable.addOnce`/`finally`. Orthographic cameras report `{ortho:true}` and skip the fov dance. This is the same "cold export" idea as the path tracer, just Babylon-native.

### 2.12 Scene-level toggles that are *not* part of the ladder

**OBSERVED** — `scratch/render.readable.js` L805–837.

- *Vegetation and water on the painted terrain* is a checkbox that calls `window.HPTerrainDetail.setEnabled(checked)` — a separate, persisted scene toggle, distinct from the quality mode. Round-1's thin-instance finding is this feature: the switch adds/removes a large batch of instanced detail props, so the user can claw back fill-rate without dropping tier.
- *Contour lines on the terrain* calls `HPSync.setContours3d`. **INFERRED**: the render popover is deliberately doubling as a low-risk "scene cost" panel, separate from the four-tier GPU-cost ladder.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort; each ties to a finding and, where it touches `FloorplanData`, to the schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`. CasaPlazAI is a single-page TS/Three.js planner with Plan / 3D / Walk modes, plan autosave to localStorage, and PNG/JPEG export.

| # | Idea | Ties to | Schema note | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Adopt an explicit, persisted 3-tier ladder — `draft · balanced · high` — with `draft` = render-scale ≈ 1.5 + shadows off + post off.** Persist under a NEW editor-local key (e.g. `casaplaza.render.quality.v1`). This is the single biggest win for laptop users and is exactly how the competitor handles its weakest tier. | §2.2, §2.1 | Out-of-schema state, like `casaplaza.snap.settings.v1` / `casaplaza.underlay.v1`: it is an editor preference and must **not** enter `FloorplanData` (which is the frozen 2D⇄3D contract). | High | Low |
| 2 | **Add an idle render throttle to the 3D and Walk modes** (`wake()` on pointer/wheel/key/touch/resize/visibility; `isIdle > ~3 s` ⇒ render at ≤ 2 fps) and **hard-stop the 3D loop while Plan mode is showing**. Three.js equivalent: skip `renderer.render()` in the rAF when hidden/throttled. | §2.8 | none | High | Low |
| 3 | **Gate the post chain on WebGL2 and fall back**: MSAA 4 only if `webgl2`, always keep an FXAA/cheap-AA path, and expose ACES exposure/contrast as the only tone controls at `high`. Build the `EffectComposer` per tier at switch time and dispose the previous composer, rather than leaving passes mounted and `enabled=false`. | §2.3 | none | High | Med |
| 4 | **Tier the shadow map instead of toggling shadows**: 0 → 1024 blurred-ESM → 2048 PCF. One directional light carries the only shadow map. | §2.5 | none | Med | Low–Med |
| 5 | **Keep the advisory slow-view toast, skip automatic degradation.** A 1 Hz `renderer.info`/FPS sampler that warns once after ~3 s below ~18 FPS — suppressed while the tab is hidden or the view is settling — told the user *what* to do without silently changing their document. Aligns with CasaPlazAI's autosave-everything philosophy. | §2.7 | none | Med | Low |
| 6 | **Show the cost as pips and name the trade-off in one line per tier** ("Fastest. Lower resolution, no shadows." etc.). The competitor's ladder is legible because the description states what you lose, not what the tier costs. | §2.1 | none | Med | Low |
| 7 | **Make material quality an explicit, idempotent action** ("Convert materials", count-toast on success) rather than a hidden side effect of a tier, and skip `disableLighting`/reflection materials and shared instances (memoise by material). Useful if CasaPlazAI moves from flat colours to `MeshStandardMaterial`/PBR for its seven furniture types. | §2.6 | `floorTexture` enum + per-`FurnitureItem.type` materials stay the source of truth | Med | Low–Med |
| 8 | **Separate "detail" cost from the quality tier**: a single *vegetation/furniture detail* toggle that adds/removes batched detail geometry, persisted next to the tier. In CasaPlazAI terms: toggle high-poly furniture meshes vs a cheap proxy, independent of shadows/post. | §2.12 | none (editor-local) | Med | Med |
| 9 | **Do not ship a capability claim you cannot deliver.** The competitor's "Ultra realistic — Reflections…" feature-detect is broken (`SSRRenderingPipeline.IsSupported` is `undefined` in its own Babylon bundle), so SSR never runs and the user is never told. If CasaPlazAI advertises SSR/reflections, feature-detect on the *instance* (`pipeline.isSupported`) **and** surface a visible "not supported on this GPU" state. | §2.4 | none | Med (guardrail) | Low |
| 10 | **If a photo mode is ever added, copy the cheap still-extraction first** (offscreen render target, longest side capped, aspect-corrected fov, 4 samples) before attempting a path tracer. It reuses the existing three.js scene and directly feeds the existing PNG/JPEG export. | §2.11, §2.10 | none | Med | Low–Med |
| 11 | **A path-tracer "photo render" mode is a real differentiator but a project, not a feature.** The reusable design points: (a) an explicit handoff dataset (competitor exports GLB and re-imports into a second engine; CasaPlazAI already has a serialisable `FloorplanData` + Three.js scene, so a compact mesh/light snapshot is enough); (b) progressive accumulation with a visible sample counter and honest timing; (c) an internal low-res preview at ¼ scale while shaders compile; (d) `minSamples=1, renderDelay=0, fadeDuration=0` to get a first pixel fast; (e) restart accumulation on camera move; (f) a denoise pass; (g) pause/download controls. Treat as a separate renderer, never inline in the editor loop. | §2.9 | export from `FloorplanData`, do not extend it | High (as a feature) | High |
| 12 | **Defer WebGL context creation until the user commits** (their engine is built inside the start dialog's confirm handler). If CasaPlazAI shows a landing/settings step before the canvas, lazy-init the renderer there. | §2.2 | none | Low–Med | Low |
| 13 | **Handle context loss**: toast + re-`wake()` the loop on `webglcontextrestored`; do not leave a black canvas. | §2.2 | none | Low | Low |

---

## 4. Unknowns

1. **`autoClear` discrepancy.** Round 1 recorded `scene.autoClear` flipping to `false` at high/ultra; my live sample read `true` at every tier while `_prePassRenderer` was truthy at high/ultra. I could not reconcile the two readings, so I do **not** assert the `autoClear=false` optimisation for this round.
2. **Real frame-time budgets.** All measurements are on SwiftShader (CPU), as in round 1; no GPU-timed cost per tier, per shadow size, or per post-pass. The ladder's relative expense is structural (resolution, map size, pass count), not measured.
3. **The path tracer was never observed running to completion.** The dialog import and configuration were read from the shipped module and the library asset was verified, but I did not execute a full trace (a 1024-sample interior trace on SwiftShader would exceed the time budget). Sampling rate, time-to-first-pixel and denoise quality are therefore unmeasured.
4. **`dynamicLowRes` visual behaviour.** The vendored library's low-res/resolve logic and the additive-blend fade were read from upstream v0.0.26 source (`src/core/WebGLPathTracer.js`), but the app sets `fadeDuration = 0`, so the intended cross-fade is effectively bypassed; the on-screen transition was not captured.
5. **`HPRenderLoop` interval exactness.** The decoded region is unambiguous about the 3000 ms idle threshold, the 500 ms idle frame gap, and the 1500 ms settling window, but adjacent tokens in the same region were obfuscated and a handful of property names had to be read from surrounding code; a numeric typo in a non-printing branch cannot be fully excluded.
6. **`convertMaterials` runtime effect.** The mapping code is fully read, but I did not measure the visual delta or the GPU cost of the resulting `PBRMaterial`s, nor whether `emit('material')` has consumers that re-upload textures.
7. **Whether the SSR guard is a Babylon version drift or an author bug.** The static `IsSupported` may exist in a different 6.x build; the app pins `6.38.0` in its bundle, and in *that* bundle the guard is dead. Also unresolved: whether the author intended `SSRRenderingPipeline.IsSupported` or the instance getter.
8. **`transmissiveBounces = 10` cost.** The app raises this well above the bounces setting; I did not verify how many transmissive surfaces an average plan contains, so its real cost is unknown.
9. **AI mode** was inspected statically only; no AI/cloud call was made (out of scope).
10. **Mobile/touch ladder behaviour** untested: whether `draft`'s 1.5 scale is chosen automatically on small devices is unverified — the shipped code makes `draft` a manual choice and I found no device-class detection in the mode module.
11. **`HPTerrainDetail` cost.** The detail toggle's geometry/texture budget (how many instances, which textures) was not quantified in this round; round 1 established only that it uses thin instances.

---

## 5. Sources

- Vendor app and shipped scripts: <https://www.3dhouseplanner.com/app.php>, `https://www.3dhouseplanner.com/js.php?f=editor/hp-render&v=09e7403a2c10f185`, `…/editor/hp-pathtrace&v=8081740c07cc13a9`, `…/editor/hp-editor&v=7868a06179c38d65` (fetched round 1, read-only here), `https://www.3dhouseplanner.com/assets/vendor/three-pathtracer/three-pathtracer.min.js?v=0.0.26-3` (**OBSERVED**, HTTP 200), `https://www.3dhouseplanner.com/textures/environment.hdr` (**OBSERVED**, HTTP 200, 5 948 899 bytes).
- Upstream library documentation: three-gpu-pathtracer repository and README, <https://github.com/gkjohnson/three-gpu-pathtracer>; released source `src/core/WebGLPathTracer.js` @ `v0.0.26` (**DOCUMENTED**).
- Babylon.js documentation: Screen Space Reflections Rendering Pipeline, <https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/SSRRenderingPipeline> (**DOCUMENTED**; the page confirms the pipeline exists as a feature, and the shipped bundle's own class is what carries the `isSupported` getter read here).
- Round-1 report and evidence: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/report.md` and its `src/`, `deob/`, `hp_i18n_app.json`.
- CasaPlazAI schema: `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.
