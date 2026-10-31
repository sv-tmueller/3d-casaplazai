# 3D House Planner — `hp-*` module & `window.HP*` global architecture map

**Job:** `rea2-3dhp-p1/05-02a-tech-stack-bundle-module-map` (Round 2, narrow question)
**Target:** https://www.3dhouseplanner.com/ — 3D editor `app.php`, 2D planner `2D-Planner/index.php`
**Round-1 base (read-only, reused):** `~/dsh-workspaces/rea-3dhouseplanner-2026-10/02-02-tech-stack-bundle/report.md`, `evidence/`, `js/`, `ev_*.json`
**Observed:** 2026-10-31, REA v6.8.0 + own headless Chrome 156.0.8078.74 (SwiftShader WebGL 2.0) on CDP 9377.
**Evidence in this folder:** `js2/` (7 editor modules fetched in round 2), `js2d/` (all 11 planner modules), `strings/` (decoded string tables for 40 modules), `ev_*.json` (runtime probes), `dep_matrix.txt`, `api_surface.txt`, `evidence-2d-planner.html`.

**Method note (why this round could go deeper than round 1).** Round 1 stopped at "29 `hp-*` modules, each attaching one `window.HP*` global" (R1 §2.2) because `js.php` is server-gated and the code is obfuscated. This round (a) fetched every `js.php?f=…` module *from inside the page* via `fetch()` so the Cloudflare/session gate was satisfied — all 18 previously-missing modules came back 200 (`probe_modules.json`, `probe_2d.json`); (b) cracked the obfuscator's **custom base64 alphabet** (lowercase-first `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=`, not the standard one) so every module's string table decodes (`decode3.mjs`); (c) read the live page's globals, event bus and cross-frame bridge directly over CDP; and (d) **proved which file defines which global** by installing an `Object.defineProperty` setter hook on every candidate name *before any page script ran* (`Page.addScriptToEvaluateOnNewDocument`) and recording the assignment stack — the exact defining `js.php?f=…` URL is in the stack (`defhook.js` + `defdriver*.mjs`, results in `ev_deflog.json`, `ev_deflog_started.json`, `ev_iframelog.json`). Tags: **OBSERVED** (with evidence file), **DOCUMENTED** (vendor URL), **INFERRED**.

> **Relation to round 1 (which claims were reused, which superseded).** Reused unchanged: Babylon 6.38.0 + WebGL2, no SPA framework, jQuery 3.2.1/pep, obfuscation with no source maps, `js.php` server-gating, `HP_BOOT` inline catalog, IndexedDB `hp-bim` v2 (`projects`/`index`), localStorage flag keys, the `HP*` method inventories in `ev_probe12.json`, the cold-load budget, and the vendor's "no account, no upload" claim. **Superseded by this round:** the "*29 modules each attaching one `HP*` global*" model (it is 40 modules in two namespaces with 3 global-less editor modules and 3 multi-global ones), the ownership of `HPCatalog` (`hp-panels`), `HPUnits` (`hp-app`) and `HPTour` (`hp-ux`), the claim that the 2D planner's bridge wiring is INFERRED (it is now OBSERVED, including the concrete `setModel`/`setStatus` payloads), and the round-1 §4 unknown "*exact 2D⇄3D bridge protocol*" (now resolved: method calls parent→child, `postMessage` child→parent).

> **Reading caveat for the log files.** The hook creates an enumerable property for every candidate name, so `Object.keys(window)` lists hook artefacts that were never assigned (`HPUX`, `HP_UNITS_FACTOR`, `FloorplanEditor`, `FloorplanPalette` in `ev_deflog_started.json`/`ev_iframelog.json`). Only entries present in the `deflog` object are *real* assignments; everywhere below, globals come from that object, not from the key list.

---

## 1. Summary (5 bullets)

1. **The app is 40 hand-rolled modules in two namespaces, not one bundle.** The 29 `editor/*` modules produce **32 `window.HP*` assignments** (27 at load, 3 more when the editor starts, plus 2 inlined by the HTML), and **three modules attach nothing at all** (`hp-ux`, `hp-editor-tail`, and the non-`hp` helper `floorplan-ai-vectorizer` — they only wire DOM/`window` handlers or extend an existing global); the 11 `planner/*` modules inside the `#floorplanIframe` produce **9 assignments** (8 of their own plus the shared `HP_I18N_DATA`). There is no framework, no DI and no module loader — a **shared mutable singleton namespace on `window` is the entire architecture**, ordered only by script-tag order (OBSERVED: `evidence/app.php.html`, `evidence-2d-planner.html`, `module-attribution.md`).
2. **`window.HP3D` is the god object (~120 members)** — `scene, canvas, engine, cameras, lights, gui, terrain, grid, gizmoManagers, events, emit, catalog, plannerWindow`, plus the geometry verbs `buildWall, buildSlab, buildRoof, placeOpening, placeObject, registerElement, moveElement, rotateElement, moveHandle, disposeElement, nearestWall, wallEndpoints, footprintOf, minAreaRect, polygonArea, focusOn, frameAll, select, importPlanImage`. `hp-editor` defines it **only after "Start designing"** (t≈20.9 s) and every other module reaches the scene through it (OBSERVED: `ev_deep.json`, `ev_deflog_started.json`).
3. **Feature modules are thin, on-demand plugins.** A typical module exposes a ≤8-method "open this UI" facade (`HPSun`, `HPPathTrace`, `HPShare`, `HPDonate`, `HPCopy`, `HPAR` — 1–8 keys) or no global at all (`hp-ux`, `hp-editor-tail`, `floorplan-ai-vectorizer`, `floorplanEditor`, `objectPalette`, `planner-main`, `donate`) and self-registers into the DOM. The one heavyweight is `HPBIM` (70 keys, 484 KB) (OBSERVED: `ev_runtime_api.json`, `api_surface.txt`).
4. **`HPBIM` is the document/undo/BIM hub and the persistence layer**: `serialize/restore/save/open/newProject/listProjects/prepareReload`, `undo/redo`, `elements/elementsAsync/snapshot/select/find/guidOf`, `quantities/schedule/budget/georef/check`, and exports `ifc/dxf/svg/csv/xlsx/bcf/glb` (IndexedDB `hp-bim`). Everything else calls *into* it; the only other shared state is `HPSync.getState()` — the 2D mirror `{plans, meshless, roofs, meter}` (OBSERVED: `ev_runtime_api.json`, `ev_deep.json`; R1 `ev_probe11.json`).
5. **Coupling runs through exactly three channels**, and the 2D⇄3D bridge is *method-call, not message-passing*: parent calls `iframe.contentWindow.FloorplanBridge.setModel({meter,walls,objects,rooms,polygons})` and `setStatus({enabled,level,busy})`, the iframe calls back via `postMessage` (`hpFrom3d`, `sync.levelUp`); inside the iframe `HP3D`/`HPSync`/`HPBIM` are `undefined`, so the dependency is deliberately one-way (OBSERVED: `ev_bridge2.json`, `ev_iframe2.json`).
---

## 2. Findings

### 2.1 Module inventory: files, load order, globals

**A. Editor page (`app.php`) — 29 `editor/*` modules + 1 helper, in tag order** (OBSERVED, `evidence/app.php.html`, `ev_runtime_api.json`; sizes = decoded bytes from `ev_coldstart.json`/R1 §2.3):

| # | module (`js.php?f=editor/…`) | tag | size (dec) | **defining global(s)** (proved by stack hook) | glue only |
|---|---|---|---|---|---|
| 0 | `floorplan-ai-vectorizer` | classic | 88 278 | *(none — helper)* | – |
| 1 | `hp-i18n` | classic | 9 585 | `HPI18N` @1:6202 | – |
| 2 | `hp-api` | classic | 5 135 | `HPApi` @1:2670 | – |
| 3 | `hp-ui` | defer | 78 224 | `HPUI` @1:55338 | – |
| 4 | `hp-panels` | defer | 51 336 | `HPPanels` @1:18113, **`HPCatalog` @1:51129** | material panel, recent list |
| 5 | `hp-sync` | classic | 75 790 | `HPSync` @1:64394 | 2D↔3D bridge glue |
| 6 | `hp-render` | defer | 54 013 | `HPRender` @1:53598 | render loop, popover |
| 7 | `hp-terrain-detail` | defer | 46 643 | `HPTerrainDetail` @1:39159 | – |
| 8 | `hp-pathtrace` | defer | 53 586 | `HPPathTrace` @1:17217 | – |
| 9 | `hp-gltf` | defer | 12 166 | `HPGltf` @1:829 | – |
| 10 | `hp-bim` | defer | 483 859 | `HPBIM` @1:473123 | – |
| 11 | `hp-house-planner` | defer | 3 774 | `HPHousePlanner` @1:2556 | – |
| 12 | `hp-stairs` | defer | 21 449 | `HPStairs` @1:20897 | – |
| 13 | `hp-linear` | defer | 127 460 | `HPLinear` @1:113767 | – |
| 14 | `hp-ai-place` | defer | 70 816 | `HPAIPlace` @1:32775 | – |
| 15 | `hp-ai-chat` | defer | 115 265 | `HPAI` @1:104713 | – |
| 16 | `hp-ux` | defer | 31 058 | **`HPTour` @1:~** (alias, t≈21.0 s) | keymap, tool card, start overlay, curve popover |
| 17 | `hp-ar` | defer | 12 078 | `HPAR` @1:9547 | – |
| 18 | `hp-sun` | defer | 53 203 | `HPSun` @1:42865 | – |
| 19 | `hp-tour` | defer | 21 914 | `HPCameraTour` @1:16347 | – |
| 20 | `hp-dims` | defer | 20 864 | `HPDims` @1:20239 | – |
| 21 | `hp-measure` | defer | 24 181 | `HPMeasure` @1:23303 | – |
| 22 | `hp-share` | defer | 18 907 | `HPShare` @1:12835 | – |
| 23 | `hp-copy` | defer | 43 879 | `HPCopy` @1:36213 | – |
| 24 | `hp-efficiency` | defer | 97 148 | `HPEfficiency` @1:86314 | – |
| 25 | `hp-donate` | defer | 12 487 | `HPDonate` @1:8881 | – |
| 26 | `hp-app` | classic | 12 293 | **`HPUnits` @1:5819, `HP_UNITS_KEY` @1:5647** | fullscreen, unit selector, 2D/3D glue |
| 27 | `hp-editor` | **`type=module`** | 691 230 | **`HP3D` @1:~ (t≈20.9 s)**, **`HPRenderLoop` @1:~** | scene, gizmos, builder |
| 28 | `hp-editor-tail` | classic | 5 328 | *(none)* | lazy-load + catalog finalisation |

Column 6 (`glue only`) is what a module does beyond defining globals — it wires handlers on `window`/DOM or adds methods to an existing global. Three round-1 attributions are corrected here: `HPCatalog` is defined by **`hp-panels`** (not `hp-editor-tail`/`hp-ui`); `HPUnits`/`HP_UNITS_KEY` by **`hp-app`** (not `hp-editor`); and `HPTour` is *not* defined by `hp-tour` (which defines `HPCameraTour`) but by **`hp-ux`** — a late alias assigned at t≈21.0 s, i.e. only once the editor is ready. Evidence: `ev_deflog.json` (pre-start), `ev_deflog_started.json` (post-start), `ev_iframelog.json` (iframe).

Non-app scripts loaded before these (context): jQuery 3.2.1 → pep.js → Babylon Assets → ammo.js → cannon.js → Oimo.js → earcut → babylon.js + 5 add-ons → Puter SDK → then the module list → `vanilla-lazyload@17.8.4` (async) (OBSERVED, `ev_runtime_api.json` `scripts`).

**B. 2D planner page (`2D-Planner/index.php`) — 11 `planner/*` modules, in tag order** (OBSERVED, `evidence-2d-planner.html`, `ev_iframe2.json`):

| # | module (`js.php?f=planner/…`) | size (dec) | **defining global(s)** (proved by stack hook) |
|---|---|---|---|
| 1 | `i18n` | 7 010 | `FPI18N` |
| 2 | `qSVG` | 60 514 | `qSVG` |
| 3 | `floorplanEditor` | 72 676 | *(none — geometry kernel)* |
| 4 | `orientation3d` | 6 846 | `FloorplanOrientation` |
| 5 | `symbols` | 55 631 | `FloorplanSymbols` |
| 6 | `objectCatalog` | 84 674 | `FloorplanCatalog` |
| 7 | `objectPalette` | 21 331 | **`FloorplanLibrary`** (consumes `FloorplanCatalog`) |
| 8 | `planner-main` | 500 317 | *(none — app; consumes all of the above)* |
| 9 | `uiShell` | 62 664 | `FloorplanUI` |
| 10 | `bridge3d` | 62 876 | **`FloorplanBridge`** (the 3D-in-2D overlay + sync client) |
| 11 | `donate` | 14 541 | *(none — consumes `FloorplanUI`)* |

Round-1's "29 app modules / 29 globals" needs exactly this correction: the *editor* has 29, the *2D planner* has **11 more**, and the live global inventory is **32 editor assignments** (`HP3D, HPRenderLoop, HPBIM, HPUI, HPPanels, HPCatalog, HPI18N, HPApi, HPUnits, HP_UNITS_KEY, HPSync, HPRender, HPTerrainDetail, HPPathTrace, HPGltf, HPStairs, HPLinear, HPSun, HPCameraTour, HPTour, HPDims, HPMeasure, HPShare, HPCopy, HPEfficiency, HPDonate, HPAR, HPAI, HPAIPlace, HPHousePlanner` + the inlined `HP_BOOT`, `HP_I18N_DATA`) plus **9 planner assignments** (`FPI18N, qSVG, FloorplanOrientation, FloorplanSymbols, FloorplanCatalog, FloorplanLibrary, FloorplanUI, FloorplanBridge` + the shared `HP_I18N_DATA`) (OBSERVED `ev_deflog_started.json`, `ev_iframelog.json`; R1 §2.2 superseded on this point).

### 2.2 Module responsibilities and public API

Method inventories below are **OBSERVED** at runtime (`ev_runtime_api.json`, `ev_iframe2.json`). Multi-word strings quoted in "responsibility" come from the module's own decoded table (`strings/`).

**Editor core**

- **`hp-i18n` → `HPI18N`** `{add, t, has, setLang, beforeReload, normalize, num, localizeNumbers, decimal, scope, lang, dir, locale, langs, dict}`. Reads the inline `HP_I18N_DATA` plus a per-language fetch, persists the choice in `hp-lang` (localStorage) and the `hp_lang` cookie, sets `dir` for RTL, and exposes `prepareReload`/`beforeReload` so a language change can flush and reload the page. *Uses:* `HPBIM` (to flush unsaved work before reload), `HP_I18N_DATA` (OBSERVED `strings/hp-i18n.json`).
- **`hp-api` → `HPApi`** `{get, post, ai}`: the only fetch wrapper (`credentials`, `signal`, `headers`, `JSON.stringify`, `lang`). *Uses:* nothing (*no* `HP*` deps) — it is the bottom of the graph except `HPI18N` (OBSERVED `strings/r1-hp-api.json`).
- **`hp-ui` → `HPUI`** `{t, shell, setSelectionInfo, trackEngine, icon, esc, el, addTool, createPanel, createPopover, toast, bar, statusBar, setProjectName, renameProject, getProjectName, onProjectRename, setSaveState, refreshSelection, dialog, openDialog, closeDialog, tabs, segmented, range, enhanceRange, colorInput, switchInput, select, speedDial, autocomplete, isolateKeys, applyI18n, hideTooltip}`. The widget kit + status bar. *Uses:* `HPSync`, `HPRenderLoop`, `HPUnits`, `HP3D`, `HPCatalog` (OBSERVED `strings/r1-hp-ui.json`).
- **`hp-panels` → `HPPanels` `{createEditorGui, gui, Observable}` and `HPCatalog` `{open, close, isOpen, toggle, showTab, setSuggestions}`** (two globals — proved by the stack hook, `ev_deflog.json`). `gui` is a **Babylon GUI** tree (`headermaterial`, `wallheightslider`, `panelposition`, `materialbutton`, `glasscheckbox`, `textdistanceangle`, `filedragdrop`, …) — i.e. the in-canvas 3D panels for wall height / position / material; it also owns the **catalog drawer** (tabbed drill-down, `hp-catalog-head`, `hp-crumb`, `hp-cat-list`, `hp-items-grouped`, `hp-recent`, search, `lazyLoadInstance`) and the localStorage-backed "recent" list. *Uses:* `HPUI`, `HPI18N`, `HP3D`. (Round 1 attributed `HPCatalog` to `hp-editor-tail`; that is wrong — the definition stack points at `hp-panels`.)
- **`hp-editor` (module, 691 KB) — the MVP.** Creates `BABYLON.Engine` + scene and publishes **`HP3D`** (assigned at t≈20.9 s, i.e. only after "Start designing"; OBSERVED `ev_deflog_started.json`): `{version, scene, canvas, engine, cameras, lights, shadowGenerator, glowLayer, skybox, terrain, grid, gui, orientationGizmo, gizmoLists, gizmoManagers, catalog, events, emit, floorHeight, currentLevel, setLevel, levelBase, levelOf, defaultWallHeight, defaultWallThickness, units, classify, elementRoot, listElements, wallEndpoints, cutOfWall, wallOfCut, nearestWall, modelPathOf, worldBounds, yawOf, buildWall, wallBuilder, buildSlab, buildRoof, buildTool, moveElement, rotateElement, shapeHandles, moveHandle, footprintOf, minAreaRect, polygonArea, polygonCentroid, placeOpening, placeObject, registerElement, instantiateModel, loadModelTemplate, disposeElement, buildSkirting, addRoomSkirting, removeSkirting, listSkirting, refreshSkirting, buildCeilingTrim, addLevelCeilingTrim, removeCeilingTrim, listCeilingTrim, refreshCeilingTrims, ceilingTrimOutlines, ceilingTrimLedSegments, terrainExport, miterWalls, setWallCurve, curveVertexData, wallPointAt, cutwalls, refreshVisibility, applyTexture, applyColor, makeTexture, stdMaterial, cloneMaterial, searchTextures, searchProducts, pickTexture, pickOpeningModel, attachGizmo, focusOn, frameAll, getSelection, clearSelection, select, importFile, importPlanObject, importPlanImage, convertPlanImage, plannerWindow}` (OBSERVED `ev_deep.json`, `ev_deflog_started.json`). The same file also publishes **`HPRenderLoop`** = `{wake, isIdle, isSettling}` (assigned 15 ms after `HP3D` on the same stack), and reads `HPPanels`, `HPUI`, `HPRenderLoop`, `HPMeasure`, `qSVG`, `FloorplanLibrary`, `HPI18N`, `HPBIM`, `HPApi` (OBSERVED `strings/r1-hp-editor.json`). `HP3D.events` is a Babylon `Observable` and `HP3D.emit` is its notify function.
- **`hp-app` (classic) → `HPUnits`** `{name, factor, set, toggle, pushTo2d, refreshLabels, onChange}` **and the constant `HP_UNITS_KEY = "hp-units"`** (both proved by the stack hook, `ev_deflog.json`). It also owns the app shell wiring: fullscreen (`hpToolFullscreen`, `requestFullscreen`), `unitSelector`, `snaptogridslider`, `wallheightslider`, project rename, `hpFrom3d` / `from2d` / `floorplanIframe` glue, `addTool`, `closeDialog` (OBSERVED `strings/r1-hp-app.json`). *Uses:* `HPUI`, `HPPanels`.
- **`hp-editor-tail`** — post-MVP tail: builds the lazy-load instance (`lazyLoadOptions`), wires `linearcheck`, `terrainpaintercheck`, `ceiltrimcheck` checkboxes, calls `HPCatalog.setSuggestions(...)` and reads `HP_BOOT` (OBSERVED `strings/r1-hp-editor-tail.json`). A deliberate ordering hack: heavy DOM wiring is split off the `type=module` script so it runs after all deferred globals exist.

**Persistence / model**

- **`hp-bim` → `HPBIM`** (484 KB, 70 methods) — the document, undo stack and BIM/IFC/cost engine: `serialize, restore, save, open, newProject, listProjects, saveCopy, prepareReload, undo, redo, canUndo, canRedo, elements, elementsAsync, snapshot, select, find, guidOf, hostedBy, bimOf, forkMetadata, types, site, setSite, quantities, schedule, schedulesData, summary, check, elementInfo, setPrice, setCurrency, budget, setLevelName, georef, normsCountry, skirting, changeSeq, markDirty, newGuid, copyElements, removeElements, importFile, importFiles, canImport, importBcf, exportAs, exportIfc, exportDxf, exportSvg, exportCsv, exportXlsx, exportBcf, lastXlsx, lastBcf, lastBcfZip, showBcfTopic, glbBlob, openPanel, openExportDialog, openImportDialog, exportOptions, viewer, projectId, levelName, busy, undoData, redoData, ask`. IndexedDB `hp-bim`; `formats = ["project","pdf","ifc","glb","gltf","obj","stl","dxf","svg","csv","png"]`; `projectId` is a short random slug (e.g. `pmvwgjscx8piej`). *Uses:* `HPSync`, `HP3D`, `HPTerrainDetail`, `HPRender`, `HPStairs`, `HPLinear`, `HPSun`, `HPCameraTour`, `HPShare`, `HPMeasure`, `HPUnits`, `HPEfficiency`, `HPGltf`, `HPUI`, `HPI18N`, `FloorplanBridge` (OBSERVED `strings/r1-hp-bim.json`; R1 `ev_probe11.json`).

**Geometry / analysis / domain services** (thin facades over `HP3D`)

- **`hp-sync` → `HPSync`** `{enabled, stairFootprints, setEnabled, level, requestLevel, buildAt, moveBuild, rotateBuild, moveHandle, deleteBuild, refreshBuildLayer, projectNow, flush, applyPlan, updateContours, contours, setContours3d, contours3d, setRoof, getState, setState}` — **the 3D↔2D synchroniser**. `getState()` returns the whole plan mirror: `{plans: {"0": {meter, walls, objects, rooms, polygons}}, meshless, roofs, meter}`; `applyPlan(state)` pushes it into the iframe; `flush()`/`projectNow()` project the current 3D scene into that state (OBSERVED `ev_deep.json`, `ev_bridge2.json`). Strings confirm `floorplanIframe`, `open2DPlanner`, `close2DPlanner`, `setBuildLayer`, `setModel`, `setTopography`, `hpFrom3d` (OBSERVED `strings/r1-hp-sync.json`).
- **`hp-render` → `HPRender`** `{mode, modes, setMode, convertMaterials, openAiRender, openStudio, capture, captureView}` with `modes = ["draft","balanced","high","ultra","pathtrace","ai"]` (default `balanced`). Owns post-processing pipelines (`SSAO2RenderingPipeline`, `SSRRenderingPipeline`, `DepthOfFieldEffectBlurLevel`), image processing (`toneMappingEnabled`, `colorGradingEnabled`, `vignetteEnabled`, `bloomKernel`), and the render popover. **`HPRenderLoop`** `{wake, isIdle, isSettling}` is the on-demand render scheduler. *Uses:* `HPSync`, `HPAR`, `HP3D`, `HPTerrainDetail`, `HPPathTrace`, `HPSun`, `HPCameraTour`, `HPDims`, `HPShare`, `HPI18N`, `HPApi` (OBSERVED `ev_deep.json`, `strings/hp-render.json`).
- **`hp-pathtrace` → `HPPathTrace`** `{open, close}` — the Three.js `three-pathtracer` + `HDRLoader` offscreen renderer; sets `render.pt.*` strings, `render-path-tracing.png`, `toNonIndexed`, `setPixelRatio`, `sigma`, `raf`. *Uses:* `HP3D`, `HPTerrainDetail`, `HPI18N` (OBSERVED `strings/hp-pathtrace.json`; R1 §2.1).
- **`hp-terrain-detail` → `HPTerrainDetail`** `{enabled, count, surfaces, setEnabled, slotSurface, setSlotSurface, overrides, setOverrides, rebuild, isDetail, isExportMesh, water, prepareExport, finishExport, surfaceOfUrl}` — paints/instantiates grass, reeds, flowers, pebbles (thin instances, `VertexBuffer`, `getImageData` classification). *Uses:* `HPRenderLoop` (OBSERVED `strings/hp-terrain-detail.json`).
- **`hp-stairs` → `HPStairs`** `{update, isStair, fit, originalGeometry, stairs}` — CSG (`ExtrudePolygon`, `CSG`, `subtract`, `stairHole`, `stairCut`) to carve stair openings; stores `_hpStairOrig`/`_hpStairSig` metadata on meshes. *Uses:* `HP3D`, `HPSync` (OBSERVED `strings/hp-stairs.json`).
- **`hp-linear` → `HPLinear`** `{kits, isOn, setOn, openEnds, state, radius, buildRun, isRun}` — fences, railings and other linear runs. *Uses:* none detected (OBSERVED R1 `ev_probe12.json`).
- **`hp-copy` → `HPCopy`** `{openLevel, duplicate}` — duplicate floor / level.
- **`hp-house-planner` → `HPHousePlanner`** `{plan, roomType}` — the server-side plan generator (`api/house.php?lang=`): posts `{rooms, walls, doors, windows, type}` and gets a plan back. *Uses:* `HPApi`, `HPI18N` (OBSERVED `strings/r1-hp-house-planner.json`).
- **`hp-efficiency` → `HPEfficiency`** `{render, recalc, state, setState, last, analyze}` and **`hp-dims` → `HPDims`** `{enabled, options, setEnabled, setOption, refresh, overlay, format, formatArea}` and **`hp-measure` → `HPMeasure`** `{active, state, setState}` — the three overlay/analysis modules.

**AI**

- **`hp-ai-chat` → `HPAI`** `{send, tools, toolDefinitions, loadConfig, runTool, open, attach, history, busy, setModel}` — an LLM tool-calling loop where each **tool is a call into another module** (strings show it calling `HPBIM.*`, `HP3D.buildWall/focusOn/attachGizmo/refreshVisibility`, `HPAIPlace`, `HPRender`). Uses the third-party Puter SDK and `api/ai.php`. *Uses:* `HPBIM`, `HPAIPlace`, `HPHousePlanner`, `HPRender`, `HPUI`, `HPSync`, `HPI18N`, `HPApi` (OBSERVED R1 `ev_probe12.json`, `strings/r1-hp-ai-chat.json`).
- **`hp-ai-place` → `HPAIPlace`** `{TYPES, typeOf, typeOfProduct, typeById, analyse, frameDims, sizeAndScale, plausibleScale, rememberFront, frontMemo, findRoom, roomFaces, openings, furniture, elementBox, problems, describeProblem, solve, applyPlacement, buildCustomMesh, floorTop, ceilingY, pointInPoly, angDeg, yawToward}` — furniture auto-placement solver (collision/fit reasoning).
- **`floorplan-ai-vectorizer`** (88 KB, no global) — raster→vector: `deskew, bridgeOpenings, comps, maxGap, minLen, maxWorkSize, aiEndpoint, serverEndpoint`, room labels/area scoring. It is loaded first so `hp-ai-chat` can call it.

**Optional features**

- **`hp-ux`** (no global) — keyboard shortcut table (`ux.keys.paste/move/walk/ai/redo/esc/multi/click/wallTab/gView/gEdit`), start overlay (`ux.start.title/dismiss`), curve popover (`#hpToolCard [data-tab="tooltab"]`, `.hp-curvepop-range`), and the **tool-card/view-segment DOM wiring** for the redesign-relevant `#hpViewSeg [data-view="2d"]`, `open2DPlanner`, `hp-keys`. *Uses:* `HPUI`, `HPBIM`, `HPAI`, `HP3D`, `HPI18N` (OBSERVED `strings/hp-ux.json`).
- **`hp-ar` → `HPAR`** `{open}` — QR + WebXR/AR: `qrcode`, `glbBlob`, `clipboard.writeText`, `arOpt`, `hpArDialog`. *Uses:* `HPBIM`, `HPI18N`, `HPUI`.
- **`hp-sun` → `HPSun`** `{open, position, place, clearMap, apply, state, setState}` and **`hp-tour` → `HPCameraTour`** `{open, state, setState}` (the sibling alias `HPTour` is defined by `hp-ux`, not by `hp-tour` — OBSERVED `ev_deflog_started.json`).
- **`hp-share` → `HPShare`** `{open}` — `api/share.php`, `serialize`, `projectId`, `changeSeq`, QR codes, short/long link, `viewer`, `published`.
- **`hp-donate` → `HPDonate`** `{open}` — reads/writes `hp-donate` `{used,next}`, `donate_nudge`, `donate_paypal_click`, `gtag`.
- **`hp-gltf` → `HPGltf`** `{toU8, compressGlb, compressTextures, zipFiles, loadGltfTransform, loadDracoEncoder, loadMeshopt, loadFflate, download}` — lazily loads draco/meshopt/fflate to compress and export GLB.
- **`hp-editor-tail`** and **`hp-panels`** have already been described.

**2D planner modules** (`Free 2D floor planner` page; `evidence-2d-planner.html`)

- **`i18n` → `FPI18N`** `{num, t, html, has, apply, escape, lang, dir, langs, setLang}`; shares `HP_I18N_DATA` with `HPI18N` but has a `[data-i18n]`-driven `apply()` and `fpNum`.
- **`qSVG`** (60 KB, `{create, angleDeg, angle, getAngle, middle, triangleArea, measure, gap, pDistance, nearPointOnEquation, circlePath, createEquation, perpendicularEquation, angleBetweenEquations, intersectionOfEquations, vectorXY, vectorAngle, vectorDeter, btwn, nearPointFromPath, getNodeFromPath, polygonIntoWalls, arcNeighbours, polygonIntoCurvedWalls, area, areaRoom, perimeterRoom, junctionList, vertexList, arrayCompare, vectorVertex, segmentTree, polygonize, diffArray, diffObjIntoArray, rayCasting, polygonVisualCenter, ARC_MIN_BULGE, angleNorm, arcFromBulge, wallArc, arcAngleAt, arcPointAt, arcTangentAt, arcTangentDeg, arcParam, arcNearest, arcSteps, arcPoints, bulgeFromPoints, clampBulge, subArcBulge, arcBandContains, arcSegmentIntersections, arcArcIntersections, wallCrossings, arcWallPath, wallCentrePath, textOnDiv}`) — **the 2D geometry kernel**: no global, pure functions over wall graphs, with *bulge* (arc) wall support (`ARC_MIN_BULGE`, `arcFromBulge`, `clampBulge`).
- **`floorplanEditor`** (73 KB, no global) — wall/room drawing primitives: `makeWall, wallParamOf, miter, boxRoom, placeOnWall, arcBandContains, nearestVertice, intersecting`, `#extension-floorplanner-boxArea/boxAngles/boxScale/front-marker` debug/overlay layers, `fpT`, `wallTexture`.
- **`orientation3d` → `FloorplanOrientation`** `{ELONGATED_RATIO, normalizeDeg, snapQuarter, isQuarterTurnOdd, hasOffset, resolveModelOffset, footprintInSymbolFrame, computeObjectTransform, computeDoorWindowYaw, frontVector2d}` — maps a 3D model's footprint/yaw onto a 2D symbol frame.
- **`symbols` → `FloorplanSymbols`** `{get, has, list}` — the 2D furniture SVG symbol library (hundreds of hand-drawn symbols: `sofa-table, bunk-bed, punching-bag, vending-machine, drum-kit, soccer-goal, …`, each with fill/stroke colours).
- **`objectCatalog` → `FloorplanCatalog`** `{GROUPS, SIZE_VERSION, items, getItem, resolveType, symbolFor, frontDeg, wantsWallSnap, defaultSizePx, legacyDefaultPx, normalizeText, matchModels, bestItemForProduct, searchItems, productsForSub, coverageReport, computeWallSnap, designBox}` — resolves a 3D product (`title_en`, `category_en`) to a 2D symbol + default size; *uses* `FPI18N`, `FloorplanSymbols`, `qSVG`.
- **`objectPalette`** (no global) — renders the catalogue drawer (`extension-floorplanner-object`, `…-palette-tab`, `…-library-panel`, energy section); *uses* `FPI18N`, `FloorplanCatalog`.
- **`planner-main`** (500 KB, no global) — the 2D app: SVG canvas (`#extension-floorplanner-lin…`), tools `select/room/wall/arc/object/node/text/full/layer`, `snap_to_grid`, rulers, room reports (`report.atLeast/noLabel`), background image underlay, compass/`trueNorth`, auto-save checkbox, and the `FloorplanLibrary` data bridge. *Uses* `FPI18N`, `FloorplanCatalog`, `FloorplanSymbols`, `FloorplanBridge`, `HPBIM` (yes: the iframe also carries a `HPBIM` reference string — the parent is reachable as `parent`).
- **`uiShell` → `FloorplanUI`** `{toast, help, refresh}` — topbar/menus/tooltips (`fp-topbar-*`, `fp-menu`, `tool.rooms.tip`, `help.*`, `extension-floorplanner-*_mode`, `svg-download-button`).
- **`bridge3d`** (63 KB, no global) — the **3D-in-2D layer** and the sync client: strings `hpFrom3d`, `fp-b3d-*`, `fp-sync-*`, `sync.b.delete/rotateLeft/rotateRight/place`, `sync.levelUp`, `ui.level`, `modelAutoTurn`, `modelFootprint3d`; calls the iframe API (`FloorplanBridge.setModel`), posts back level changes, and draws the swing/ridge/roof handles in the plan. *Uses* `FPI18N`, `HPI18N`, `HPSync`, `HPUnits`, `FloorplanBridge`.
- **`donate`** (no global) — the in-planner donate dialog; *uses* `FPI18N`, `FloorplanUI`.

### 2.3 Dependency graph and architecture diagram (text)

Dependencies were derived from three independent sources, all consistent: membership of each module's decoded string table (`strings/*`, `dep_matrix.txt`), round-1 runtime key inventories, and round-2 cross-frame wrapping (`ev_bridge2.json`). "→" = *reads* (calls into).

```
                        ┌───────────────────────── external ─────────────────────────┐
                        │ jQuery 3.2.1 · pep.js · Babylon 6.38 + 5 add-ons · ammo/    │
                        │ cannon/Oimo · earcut · Puter SDK · vanilla-lazyload · xlsx  │
                        └────────────────────────────────────────────────────────────┘
                                            │ (globals: $, BABYLON, puter, lazyload, XLSX)
                                            ▼
   ┌──────────────── LAYER 0 · leaf modules (no HP/FP dependency) ──────────────────┐
   │  hp-api       hp-gltf        hp-linear      hp-copy      floorplan-ai-vectorizer│
   │  HPApi        HPGltf         HPLinear       HPCopy       (none)                 │
   │  (HPI18N → HPBIM is the one upward edge here)  qSVG · floorplanEditor (none)   │
   └───────────────┬───────────────────────────────────────────────────────────────┘
                   │
   ┌───────────────▼──────────── LAYER 1 · UI kit & shell ──────────────────────────┐
   │  hp-app     DEFINES HPUnits, HP_UNITS_KEY   → HPUI HPPanels                    │
   │  hp-ui      DEFINES HPUI                    → HPSync HPRenderLoop HPUnits HP3D │
   │  hp-panels  DEFINES HPPanels + HPCatalog    → HPUI HPI18N HP3D   [Babylon GUI] │
   │  hp-donate  DEFINES HPDonate                → HPUI HPSync                      │
   │  hp-ux      (no global; defines HPTour alias when HP3D exists)                  │
   │             → HPUI HPBIM HPAI HP3D HPI18N   [keymap, tool card, #hpViewSeg 2D]  │
   │  hp-editor-tail (none) → HPUI HPCatalog HP_BOOT  [lazy-load, catalog finalise]  │
   └───────────────┬───────────────────────────────────────────────────────────────┘
                   │
   ┌───────────────▼──────── LAYER 2 · the 3D core (created at "Start designing") ──┐
   │  hp-editor (type=module)  ──DEFINES──▶ HP3D (scene·canvas·engine·cameras·       │
   │                                        events·emit·buildWall·placeOpening·      │
   │                                        placeObject·registerElement·             │
   │                                        gizmoManagers·catalog·plannerWindow)     │
   │                           ──DEFINES──▶ HPRenderLoop {wake,isIdle,isSettling}    │
   │                           ──reads──▶ HPUI HPPanels HPBIM HPI18N HPApi          │
   │                                       HPMeasure qSVG FloorplanLibrary HP_BOOT   │
   └───────────────┬───────────────────────────────────────────────────────────────┘
                   │  every layer-3 module reaches the scene via HP3D / the model via HPBIM
   ┌───────────────▼──────────── LAYER 3 · feature plugins ─────────────────────────┐
   │  hp-render (HPRender) → HPSync HPAR HP3D HPTerrainDetail HPPathTrace HPSun      │
   │                         HPCameraTour HPDims HPShare HPI18N HPApi                │
   │  hp-terrain-detail (HPTerrainDetail) → HPRenderLoop                             │
   │  hp-pathtrace (HPPathTrace)          → HP3D HPTerrainDetail HPI18N              │
   │  hp-stairs (HPStairs) → HP3D HPSync ·  hp-tour (HPCameraTour) · hp-sun (HPSun)  │
   │  hp-dims (HPDims) · hp-measure (HPMeasure) · hp-efficiency (HPEfficiency)        │
   │  hp-ar (HPAR) → HPBIM HPI18N HPUI · hp-share (HPShare) → HPBIM HPI18N HPUI HP3D │
   │  hp-house-planner (HPHousePlanner) → HPApi HPI18N                              │
   └───────────────┬───────────────────────────────────────────────────────────────┘
                   │
   ┌───────────────▼──────── LAYER 4 · document, sync, AI hubs ─────────────────────┐
   │  hp-bim (HPBIM · 70 methods · IndexedDB hp-bim) → HPSync HP3D HPTerrainDetail   │
   │        HPRender HPStairs HPLinear HPSun HPCameraTour HPShare HPMeasure HPUnits  │
   │        HPEfficiency HPGltf HPUI HPI18N FloorplanBridge                          │
   │  hp-sync (HPSync) → HPUI HPAI HPApi HPBIM HP3D FloorplanBridge  [mirror state]  │
   │  hp-ai-place (HPAIPlace)                                                        │
   │  hp-ai-chat (HPAI) → HPBIM HPAIPlace HPHousePlanner HPRender HPUI HPSync HPI18N │
   └───────────────┬───────────────────────────────────────────────────────────────┘
                   │  parent → child: FloorplanBridge.setModel / setStatus  (method calls)
                   │  child → parent: postMessage  hpFrom3d / sync.levelUp
   ┌───────────────▼──────── LAYER 5 · 2D planner iframe (own namespace, pure SVG) ──┐
   │  i18n (FPI18N) · qSVG · floorplanEditor (none) · orientation3d (FloorplanOrient)│
   │  symbols (FloorplanSymbols) · objectCatalog (FloorplanCatalog)                  │
   │  objectPalette (FloorplanLibrary) → FloorplanCatalog                            │
   │  planner-main (none) → FPI18N FloorplanCatalog FloorplanSymbols                │
   │                        FloorplanBridge HPBIM(string only; parent is reachable)  │
   │  uiShell (FloorplanUI) → FPI18N · donate (none) → FloorplanUI FPI18N            │
   │  bridge3d (FloorplanBridge) → FPI18N HPI18N HPSync HPUnits                      │
   └───────────────────────────────────────────────────────────────────────────────┘
```

**Fan-in / fan-out (OBSERVED, `dep_matrix.txt`).** Most-depended-on globals: `HPI18N` (13 modules), `HPUI` (11), `HP3D` (9), `FPI18N` (7), `HPBIM`/`HPSync` (6 each), `HPUnits` (5), `HPTerrainDetail`/`FloorplanCatalog`/`FloorplanBridge` (4 each). Largest fan-out: `hp-bim` (16 globals), `hp-render` (12), `hp-ai-chat` (10), `hp-editor` (11), `hp-ux` (5). The **only cycles** are the expected ones between the hub modules: `hp-bim ↔ hp-sync`, `hp-bim ↔ hp-render`, `hp-ui ↔ hp-sync`, `hp-render ↔ hp-pathtrace`/`hp-terrain-detail`, and `hp-ai-chat ↔ hp-ai-place` (all resolved by lazily calling at event time, never at load time).

### 2.4 The `window.HP*` global contract and bootstrap sequence

There is no module system: each file assigns its object(s) to `window` during its top-level run. This is not inferred — the assignment stack, including the defining `js.php?f=…` URL and the byte offset inside that file, was captured for every global (`defhook.js`, `ev_deflog.json`, `ev_deflog_started.json`, `ev_iframelog.json`; the full table is in `module-attribution.md`).

Bootstrap order (OBSERVED, `ev_deflog*.json` + `ev_runtime_api.json` + `ev_deep.json`):

1. `app.php` inlines `window.HP_BOOT` (t≈1.30 s, `app.php:830:24`; **1 174 925 B**: `doorOptions` 60, `windowOptions` 46, `objectOptions` 1 776, `objectCategories` 157, `floorplanTextureCatalog` 456, `products` 1 882, `textures` 456, `suggestions` 2) and `window.HP_I18N_DATA` (t≈1.14 s, `app.php:95:28`).
2. Babylon + physics load; the module list runs in tag order. The whole editor namespace is **defined on the setup dialog, before the user does anything** — `HPI18N` (t=1.15 s), `HPApi` (1.15), `HPSync` (1.16), `HPUnits`+`HP_UNITS_KEY` (1.16, on the same stack, from `hp-app`), `HPUI` (1.32), `HPPanels` (1.33), `HPCatalog` (1.33, from `hp-panels`), `HPRender` (1.34), `HPTerrainDetail`, `HPPathTrace`, `HPGltf`, `HPBIM` (1.37), `HPHousePlanner`, `HPStairs`, `HPLinear`, `HPAIPlace`, `HPAI`, `HPAR`, `HPSun`, `HPCameraTour`, `HPDims`, `HPMeasure`, `HPShare`, `HPCopy`, `HPEfficiency`, `HPDonate` (all by t≈1.42 s). Feature modules therefore only *define* themselves at load; they open their UI on demand.
   - Only **three** globals are defined later, and all three are defined on the same call stack inside `hp-editor`'s start handler: **`HP3D` @t≈20.90 s**, **`HPRenderLoop` @t≈20.91 s**, and (from `hp-ux`) the **`HPTour` alias @t≈21.00 s** (`ev_deflog_started.json`; `ev_deflog.json`, captured 22 s after load without clicking, contains none of them). A `HP_BOOT` key list and three globals is the entire pre-start/post-start difference.
3. Clicking `.hp-dialog-setup .hp-btn-primary` flips `document.body.className` from `hp-modern-body hp-app hp-dialog-open` to `hp-modern-body hp-app hp-ready`, instantiates the Babylon engine/scene, creates the `#floorplanIframe` (`src="2D-Planner/index.php?lang=en"`, 756×413) and fires `hp3d:ready` on the document. `planner-main`, `hp-sync`, `hp-bim`, `hp-stairs` and `hp-terrain-detail` reference that event (strings in `strings/r1-hp-sync.json`, `strings/hp-stairs.json`, `strings/hp-terrain-detail.json`).
4. **The `type="module"` tag on `hp-editor` plus the `defer` attribute on 20 feature tags is what makes the whole scheme work**: a `defer` script is guaranteed to run after the document is parsed and in tag order, and a module script runs after its dependency graph is resolved — so by the time focused code runs, `hp-bim`/`qSVG`/`FloorplanLibrary` are already defined. `hp-editor` is the only module that also *reads* its siblings at top level, hence it is the one tagged `type=module` and placed near the end; `hp-editor-tail` (classic, after it) then patches the UI once the `HP_BOOT`-driven DOM exists.
5. **Nothing checks readiness at load time.** Almost every cross-module reference sits inside an event handler or an `open()` call, so the contract is softer than a dependency graph: a module may be *defined* long before the global it uses is *ready*. `HP3D`'s late assignment is the extreme case, which is why `hp3d:ready` exists.

Runtime global families found in the live editor after start (OBSERVED `ev_started.json`, `ev_deep.json`, `ev_deflog_started.json`):
`HP3D` (+`HPRenderLoop` = `{wake,isIdle,isSettling}`, +`HPTour` alias), `HPBIM`, `HPUI`, `HPPanels`, `HPCatalog`, `HPI18N`, `HPApi`, `HPUnits`, `HP_UNITS_KEY="hp-units"`, `HPSync`, `HPRender`, `HPTerrainDetail`, `HPPathTrace`, `HPGltf`, `HPStairs`, `HPLinear`, `HPSun`, `HPCameraTour`, `HPDims`, `HPMeasure`, `HPShare`, `HPCopy`, `HPEfficiency`, `HPDonate`, `HPAR`, `HPAI`, `HPAIPlace`, `HPHousePlanner`, `HP_BOOT`, `HP_I18N_DATA`.

### 2.5 2D planner iframe — module map and the actual bridge protocol

`2D-Planner/index.php` is a **separate hand-rolled app** (own `planner/*` namespace, own `fp-*` CSS, own `extension-floorplanner-*` ids) embedded as `<iframe id="floorplanIframe" src="2D-Planner/index.php?lang=en">` inside a container (`#floorplanFrameContainer`; OBSERVED `ev_deep.json`, `strings/r1-hp-sync.json`). It is a **pure SVG planner** — the live iframe DOM has zero `<canvas>` and 6 `<svg>` roots (OBSERVED `ev_iframe2.json`).

**Bridge protocol (OBSERVED by wrapping both sides — `ev_bridge2.json`).** The parent calls *methods on the child object* (`iframe.contentWindow.FloorplanBridge`), not `postMessage` for the plan payload:

| direction | call | payload | effect |
|---|---|---|---|
| parent → child | `FloorplanBridge.setModel(model)` | `{meter, walls, objects, rooms, polygons}` | replaces the 2D plan document for the current level; triggers a re-render |
| parent → child | `FloorplanBridge.setStatus({enabled, level, busy})` | `{enabled:true, level:0, busy:true/false}` | sync toggle, current level, busy overlay (called twice per projection: busy→ready) |
| parent → child | `FloorplanBridge.setBuildLayer(…)`, `setTopography(…)`, `refresh()`, `ensureUids()` | build overlay, terrain | strings + method list |
| child → parent | `FloorplanBridge.onChange(cb)` | callback registration | 2D edits notify the parent |
| child → parent | `bridge3d` posts `hpFrom3d` / level change | `sync.levelUp`, `ui.level` | level switching + 3D-in-2D overlay |
| parent internal | `HPSync.applyPlan(state)` → `projectNow()`/`flush()` → `HPUnits.pushTo2d()` | `HPSync.getState()` | full projection chain |

Triggering the chain (`HPSync.applyPlan(HPSync.getState()); HPSync.flush(); HPSync.projectNow();`) produced exactly `setModel(model)` + `setStatus({enabled:true,level:0,busy:…})` on the iframe and nothing else — so **the 2D model is the single source of truth for the plan**, while `HPBIM` remains the source of truth for the 3D document (OBSERVED `ev_bridge2.json`). `FloorplanBridge.version === 1` (OBSERVED `ev_iframe2.json`).

Inside the iframe the reverse direction is a **deliberate non-dependency**: `W.HPSync`, `W.HPUnits`, `W.HP3D`, `W.HPBIM` are all `undefined`; only `W.parent`/`W.top` are reachable (OBSERVED `ev_bridge2.json`). So 3D→2D is method calls on the child, and 2D→3D is `postMessage` to `parent`.

### 2.6 Cross-cutting mechanisms

- **Event bus.** `HP3D.events` is a Babylon `Observable` (`_observers`, `notifyIfTriggered`, `_hasNotified`) with `HP3D.emit` as the notify wrapper (OBSERVED `ev_deep.json`). Feature modules subscribe (`HPUI.trackEngine`, `hp-panels` `onValueChangedObservable`, `hp-render` render loop). A parallel `document`-level event `hp3d:ready` marks scene readiness (strings in 4 modules).
- **DOM contract.** UI is a `hp-` class system over a `fp-`/`extension-floorplanner-` sibling inside the iframe. Key ids found live: `#hpToolCard` (`data-tab` = `viewtab|tooltab|extensiontab`, 30 buttons), `#hpToolCatalog`, `#hpToolFile`, `#hpViewSeg` (`data-view` = `3d|walk|top|2d`), `#hpToolFrame`, `#mySidebar`, `#hpSyncToggle`, `#hpSyncSlabs` (OBSERVED `ev_dom2.json`, `ev_deep.json`, `strings/hp-ux.json`).
- **State keys.** `localStorage`: `hp-units` (via `HP_UNITS_KEY`), `hp-lang`, `hp-render-mode`, `hp-catalog-recent` (`HP-BOOT`-independent recent list, used by `hp-panels`), `hp-donate`, `hp-bim-autosave`, `hp-keys` (shortcut overrides in `hp-ux`). IndexedDB: **`hp-bim` v2** (`projects`, `index`) owned solely by `HPBIM` (R1 §2.4; reconfirmed by `HPBIM` method list).
- **JavaScript coupling style.** `hp-editor` alone references `HPUI` 61 times, `HP3D` is referenced by 9 modules, and `HPSync` by 6 — but almost all references are *inside event handlers*, so load order only has to guarantee *definition*, not *readiness*. The three classic (non-defer) module tags (`hp-i18n`, `hp-api`, `hp-sync`) plus the final `type=module` tag are the deliberate ordering pins.
- **Obfuscation & licensing.** All 40 modules are javascript-obfuscator output (rotated string table, hex helpers `hxxxxxx_0x…`), no source maps (R1 §2.2). **No code was copied into this report**; module files are kept only as evidence for size/hash/behaviour (`strings/`, `dep_matrix.txt` are derived metadata). 3D House Planner is proprietary; the model catalogue credits CC-BY/CC-BY-NC-SA third parties (R1 §4).

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Each idea names the finding that motivates it and, where relevant, the CasaPlazAI schema field it touches.

| # | Idea | Motivated by | CasaPlazAI schema hook | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Split "document" from "scene" from "sync" as three named layers with a single owner each.** 3DHP has exactly one writer per concern: `HPBIM` owns the serialised document + undo, `HP3D` owns the Babylon scene/build verbs, `HPSync` owns the 2D projection, `HPUI` owns the DOM. CasaPlazAI's `FloorplanData` already plays the `HPBIM` role; give the Three.js scene and the localStorage autosave their own single-owner modules and forbid anything else from writing `casaplaza.*` keys. | §2.3 graph, §2.6 | `FloorplanData` top level stays the only persisted plan shape | High | Medium |
| 2 | **Make autosave a store-level operation, not a component concern.** 3DHP routes *all* persistence through `HPBIM.save()`/`prepareReload()` and keeps a `markDirty`/`changeSeq` counter; nothing else touches IndexedDB. CasaPlazAI autosaves to localStorage — wrap it in one `persistence` module exposing `save/load/list/clearThumbnail` and a `changeSeq`, so the Plan/3D/Walk redesign can add "unsaved changes" affordances without new plumbing. | §2.2 `HPBIM`, §2.6 keys | `casaplaza.plandata.v1` (or whatever the autosave key is) + a separate small index key | High | Low |
| 3 | **Adopt the `meter`-per-level 2D mirror as the plan↔viewer contract.** 3DHP's `HPSync.getState()` = `{plans:{<level>:{meter,walls,objects,rooms,polygons}}, roofs, meshless}` is a clean, level-keyed, renderer-agnostic projection of the 3D scene. CasaPlazAI already has multiple floors; a `{ [floorId]: PlanMirror }` structure built *from* `FloorplanData` would let the Plan tool card, the 3D viewer and any future minimap share one derived shape instead of re-walking rooms. | §2.5 bridge, §2.4 | Derived from `rooms/openings/furniture`; `wallsOverride`, `roofs` map naturally onto `walls`/`roofs` | High | Medium |
| 4 | **Keep the 2D plan in one renderer, and make the mode switch a pure view change.** 3DHP's 2D planner is a **separate SVG app** (zero `<canvas>` in the iframe) that is *not* a second Babylon scene; `#hpViewSeg [data-view]` simply shows/hides it. For CasaPlazAI's Plan/3D/Walk redesign, render Plan as SVG/DOM (or a 2D ortho camera) and never spin up a second WebGL context — Three.js allows one context cheaply, two expensively. | §2.5, §2.6 | unaffected (view state stays out of schema) | High | Medium |
| 5 | **Give every optional feature module a ≤8-method `open/close/state/setState` facade.** 3DHP's `HPSun`, `HPPathTrace`, `HPShare`, `HPDonate`, `HPCopy`, `HPAR` are uniformly tiny; the heavy lifting is inside. This is the cheapest way to keep a no-framework TypeScript codebase honest: each feature exports exactly one object, and its tests only need that object. | §2.2 facades, §2.4 contract | n/a (code shape) | High | Low |
| 6 | **Model the underlay/blueprint as an *editor-local* key, exactly as `HPSync` does with its own `plans` map.** CasaPlazAI's schema doc already rules the underlay out of `FloorplanData` (persisted under `casaplaza.underlay.v1`). 3DHP's 2D planner stores its wall/room/texture state in its own `extension-floorplanner-*` DOM layer and a `FloorplanLibrary` data bridge, so the 3D document never carries 2D-only styling. Keep it that way — do not let the redesign pull underlay/measure annotations into the schema "because they're per-floor". | §2.1 planner modules, §2.5 | `casaplaza.underlay.v1` stays separate (already ratified) | Medium | Low |
| 7 | **Use a single Observable/event bus with a documented emit list, and name readiness explicitly.** `HP3D.events` is a Babylon `Observable`, `HP3D.emit` is the only notifier, and a document-level `hp3d:ready` gates four modules. A typed `PlanEvents` emitter (`plan:changed`, `view:changed`, `selection:changed`, `viewer:ready`) gives the Plan/3D/Walk modes the same decoupling without bespoke callbacks. | §2.6 event bus | n/a | Medium | Low |
| 8 | **Defer the catalog/thumbnail layer with `IntersectionObserver`, keeping only metadata eager.** 3DHP inlines a 1.12 MB catalog but lazy-loads thumbnails (`vanilla-lazyload`) and GLBs. CasaPlazAI's palette is small, so this is optional now — but if the redesign adds "recent"/search across a bigger palette, the eager-metadata + lazy-thumbnail split is the pattern to copy. | R1 §2.3, §2.2 `hp-panels` | n/a (palette is not in schema) | Medium | Low |
| 9 | **Do not copy the bridge's `setModel` whole-document replacement.** It is simple but it re-sends the entire level on every projection (`JSON.stringify(model)`), and 3DHP compensates with `busy` flags. If CasaPlazAI ever splits the plan into a worker/iframe, diff the change set instead of replacing the document. | §2.5 bridge | n/a | Low | Low |
| 10 | **Keep the bundle under an order of magnitude of theirs.** 3DHP ships ~4.75 MB compressed / ~13 MB decoded with 46 script requests because it loads three physics engines and a 4.96 MB Babylon core; CasaPlazAI (Three.js, tree-shaken, Vite) can stay 10× smaller — treat that as a KPI, not an accident. | R1 §2.3 | n/a | Medium | Medium |

---

## 4. Unknowns

- **The three globals that no hook saw assigned.** `HPUX` was never created (so `hp-ux` genuinely has no global; round-1's `surf(window.HPUX)` returned `null` for the same reason), `HP_UNITS_FACTOR` was never created (only `HP_UNITS_KEY`), and `FloorplanPalette` was never created (so `objectPalette` is global-less). These are *negative* observations from a hook that fired for 30/30 other names, which is strong but not absolute proof — a `var`-style assignment inside a module's own scope could have escaped the `window` setter.
- **`hp-ux` internals.** It is the module most relevant to the redesign (keyboard shortcuts, tool card, `#hpViewSeg[data-view="2d"]`, `open2DPlanner`, curve popover) but it defines no global, so its API is only observable through the DOM it touches. Its exact keymap table (`ux.keys.*`) was read from strings, not exercised key by key.
- **The full `hp-bim` ↔ `hp-sync` ↔ `hp-render` call graph.** Fan-in/out is measured at string-table level (`dep_matrix.txt`); a precise call graph would need both modules executed with instrumented globals, which the obfuscation makes expensive. The cycles listed in §2.3 are inferred from mutual string references plus runtime key reads, not from traced calls.
- **`planner-main`'s internals.** 500 KB with no global and heavy DOM coupling; its tool state machine (`select/room/wall/arc/object/node/text`), snap grid and room-report logic were read from strings only. The exact `snap_to_grid` pitch and the arc/bulge tolerance (`ARC_MIN_BULGE`) are not pinned down.
- **`FloorplanBridge` versioning.** `version === 1` is observed, but whether the parent checks it, and what a version bump would do, is unverified. Likewise `onChange`'s exact callback payload (2D → parent) was not exercised because the reverse path needs a real user edit in the iframe.
- **Level/multi-floor semantics of the bridge.** `setStatus({level:0})` and `HPSync.getState().plans` is keyed by level, but with an empty project only `plans["0"]` exists; how higher levels are keyed (`"1"`, `"L1"`, elevation strings) and how `roofs`/`meshless` are populated was not observed.
- **Whether `HP3D.events` has a fixed event-name set.** The Observable's internals are visible but the event *names* passed to `HP3D.emit` were not enumerated; only `hp3d:ready` (document-level) and the `sync.*`/`ui.level` string constants were captured.
- **Which physics engine wins.** Unchanged from round 1: Ammo/Cannon/Oimo are all downloaded and `scene.physicsEnabled` is `true`, but `getPhysicsEngine()` is falsy on an empty project (R1 §4).
- **Licence/asset reuse.** 3D House Planner is proprietary and its catalogue carries CC-BY/CC-BY-NC-SA model credits (R1 §4). Nothing here is reusable as code or assets; only the architectural patterns above are transferable.

---

## Appendix: evidence index (this folder)

| File | What it is |
|---|---|
| `report.md` | this report |
| `module-attribution.md` | verified module → global table (the core new result) |
| `dep_matrix.txt` | module × global matrix from decoded string tables (fan-in/out) |
| `api_surface.txt` | full `window.HP*` key inventory + script tags from the live editor |
| `evidence-2d-planner.html` (this folder) + `evidence/app.php.html` (R1 folder) | raw planner / editor HTML (script order, ids, `HP_BOOT` inline) |
| `js2/*.js` (7 editor modules), `js2d/*.js` (all 11 planner modules) | fetched-in-page sources (evidence only; not for reuse) |
| `strings/*.json` | decoded string tables per module (`r1-*` = round-1 `js/`) |
| `ev_runtime_api.json` | live globals + their method lists (setup-dialog state) |
| `ev_started.json`, `ev_deep.json` | after "Start designing": `HP3D`, `HPRenderLoop`, `HPSync.getState()`, iframe, tool-card tabs |
| `ev_dom2.json` | DOM/CSS landmark inventory (`#hpToolCard`, `#hpViewSeg`, canvases, iframes) |
| `ev_iframe2.json` | 2D planner globals + method lists (`FloorplanBridge`, `qSVG`, …) |
| `ev_bridge2.json` | instrumented 3D→2D bridge calls (`setModel`, `setStatus`, `refresh`) |
| `ev_deflog.json` / `ev_deflog_started.json` / `ev_iframelog.json` | definition stacks (which script created which global, pre/post start, iframe) |
| `probe_modules.json`, `probe_2d.json` | in-page `fetch()` of the 18 gated modules (HTTP 200 proof) |
| `decode3.mjs`, `defhook.js`, `defdriver*.mjs`, `oracle2.mjs`, `attrib.mjs`, `cdp*.mjs` | tools written for this round |
