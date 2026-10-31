# 3D House Planner — the 2D planner (`2D-Planner/index.php`): tech, data model and the FloorplanBridge contract

**Job:** `rea2-3dhp-p1/08-02d-tech-stack-bundle-2d-planner` (round 2, narrow follow-up)
**Target:** https://www.3dhouseplanner.com/2D-Planner/index.php — the SVG 2D planner embedded as `#floorplanIframe` in the Babylon.js 3D editor.
**Round-1 base:** `~/dsh-workspaces/rea-3dhouseplanner-2026-10/02-02-tech-stack-bundle/report.md` (read-only; reused, not repeated). Round 1 established the 3D side (Babylon.js 6.38.0, `hp-bim` IndexedDB, `HP_BOOT` catalog) and could only see the strings `FloorplanBridge` / `FloorplanCatalog` / `FloorplanOrientation` from the editor page; this round opens the 2D page itself.
**Observed:** 2026-10-31 16:06–16:55 CET. Headless Google Chrome 156.0.8078.74 driven over CDP; REA v6.8.0 for schema/command docs.
**Evidence:** `evidence/` (`planner-js/` = raw modules, `deob/` = string-inlined modules, `probe4..probe11.json` = live page probes (probes 1–3 and later duplicates were not retained; `probe11.json` also serves the capture originally written as `probe12.json`), `2dplanner_index.html`), `sources.json`.

**Tag legend.** Every factual claim carries **OBSERVED** (seen directly in a saved evidence file or live page state), **DOCUMENTED** (a vendor/official-documentation URL), or **INFERRED** (my reasoning from observed facts). This target is proprietary and ships no public documentation for the planner, so the report contains **no DOCUMENTED claims** — every statement is OBSERVED or INFERRED, and the licence position is recorded under §4.

---

## 1. Summary (5 bullets)

- **The 2D planner is 100% hand-rolled SVG — no library, no canvas, no framework.** A single `<svg id="extension-floorplanner-lin" class="extension-floorplanner-current-svg">` holds everything, with `defs` plus **17 named top-level z-layer `<g>` groups**; the geometry kernel is a home-grown `qSVG` object (~60 KB minified) with Euclidean, SVG-path, polygon-tracing and circular-arc maths (`polygonize`, `segmentTree`, `arcFromBulge`, `wallCrossings`) (OBSERVED — `probe4.json`, `probe11.json`, `evidence/planner-js/planner_2FqSVG_*.js`).
- **Units and coordinates: pixels, 60 px = 1 m (`meter`), y-down, with a *dynamic* pan/zoom viewBox** (`preserveAspectRatio="xMidYMin slice"`). Two captures of the same page gave `-952.5 -519.375 1905 1038.75` and `-1000 -570.625 2000 1141.25`, so the viewBox is recomputed from the container size and pan offset, not fixed (OBSERVED — `probe4.json` vs `probe11.json`; `applyViewBox()`/`recentreViewboxToRooms()` in `evidence/deob/planner_2Fplanner-main_*.deob.js`). The grid is a `<pattern>` pair (minor 20 px, major 60 px) driven by `settings.snap_to_grid` + `settings.grid_size`.
- **The plan is a three-representation document**: editor globals `WALLS[]` / `OBJDATA[]` / `ROOM[]` (rich, cyclic, with SVG nodes and `parent`/`child` adjacency), a derived topology graph `Rooms = {polygons, vertex}` from `qSVG.polygonize` (rooms < 360 px² discarded), and a **flattened projection** `{meter, walls, objects, rooms, polygons}` that is the only thing that crosses to 3D (OBSERVED — `probe6.json`/`probe7.json` (`getModel()` always returns exactly these five keys), `probe8`, `probe10`, `evidence/deob/planner_2Fbridge3d_*.deob.js`).
- **`FloorplanBridge` is a same-origin JavaScript object, not a message protocol**: `window.FloorplanBridge = {version:1, getModel, setModel, onChange, ensureUids, newUid, setTopography, setStatus, setBuildLayer, refresh, isSilent}` (OBSERVED — the `window["FloorplanBridge"]={…}` literal in `evidence/deob/planner_2Fbridge3d_*.deob.js`, plus a live capture of `Object.keys(window.FloorplanBridge)`); there is **zero `postMessage` anywhere**. The 3D parent reaches it via `document.getElementById('floorplanIframe').contentWindow.FloorplanBridge`, and the 2D child reaches up via `window.parent.HPSync` / `HPUnits` / `HPI18N` (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`, `evidence/deob/hp-sync.deob.js`).
- **The loop is push + read-back + debounce**: 3D→2D is `setModel(plan)` then an immediate `getModel()` to detect the 2D editor's normalisation; 2D→3D is an `onChange` callback that is suppressed while applying (`isSilent()`) and debounced 350 ms, with a **600 ms signature poll** on the 3D side and a 250 ms iframe-visibility poll on the 2D side; coordinates convert as `x2d = x3d·meter`, `y2d = −z3d·meter`, rounded to 1/64 px (OBSERVED — extracted bodies in `evidence/deob/hp-sync.deob.js` and `evidence/deob/planner_2Fbridge3d_*.deob.js`, §2.4).

---

## 2. Findings

### 2.1 How the 2D planner is reached and what it is made of

- The 2D planner is a **separate PHP page** delivered into an iframe by the 3D editor. The editor builds a full-screen `#floorplanFrameContainer` (`position:fixed`, rgba overlay, `z‑index:1000`, `visibility:hidden`) whose `innerHTML` contains `<iframe id="floorplanIframe" src="2D-Planner/index.php?lang=<lang>" style="width:100%;height:100%;border:0">`, plus its own 3D-overlay chrome (OBSERVED — `evidence/deob/hp-editor.deob.js`, quoted source).
- The 2D page itself **redirects top-level visitors**: inline script #0 does `if (!document.cookie.includes('visited=true')) { if (window.self == window.top) window.location.href = 'https://3dhouseplanner.com/index3.php'; }`. That is why a direct CDP navigation landed on a marketing page (title "2D Planner - Free 2D Floor Planner on the Web") until I set the cookie and reused the same tab (OBSERVED — `evidence/2dplanner_index.html`, `probe4.json`; the iframe case is unaffected because `self !== top`).
- The page loads **11 `js.php?f=planner/*` modules**; `js.php` is server-gated — plain `curl` gets HTTP 403 "Forbidden", the in-page `fetch` gets 200 (OBSERVED — status codes reproduced with `cdp_fetch.mjs`; module list and sizes in `evidence/2dplanner_index.html` and `evidence/planner-js/`). All modules are obfuscated in the jsjiami-v2 style (rotated base64 string table + alias chain) with **no source maps**; I rebuilt readable copies under `evidence/deob/`.

| Module | Raw bytes | Public global it attaches | Role |
|---|---|---|---|
| `i18n` | 7 010 | `FPI18N` | planner dictionary + `t()` |
| `qSVG` | 60 514 | `qSVG` | SVG/2D geometry kernel |
| `floorplanEditor` | 72 676 | `floorplanEditor` | wall/room/opening model + editing ops |
| `orientation3d` | 6 846 | `FloorplanOrientation` | 2D-front → 3D-yaw maths |
| `symbols` | 55 631 | `FloorplanSymbols` | 2D symbol library |
| `objectCatalog` | 85 164 | `FloorplanCatalog` (+ `FloorplanLibrary` in practice) | product ↔ footprint catalog, wall-snap |
| `objectPalette` | 21 334 | `FloorplanLibrary` | palette wiring |
| `planner-main` | 502 850 | *(many globals)* | app, tools, DOM, undo, persistence |
| `uiShell` | 62 666 | `FloorplanUI` | toast/help/refresh |
| `bridge3d` | 62 883 | **`FloorplanBridge`** | bridge + 3D-orientation top bar |
| `donate` | 14 541 | — | donation nudge |

(OBSERVED — module URLs in `evidence/2dplanner_index.html`; byte counts are the sizes of the saved files in `evidence/planner-js/` as fetched.)

Live globals on the page (OBSERVED — `probe11.json` `globals` block, `probe5.json` `state`, `probe7.json`, and the module `window[…] = {…}` literals in `evidence/deob/`): `qSVG`, `floorplanEditor`, `FloorplanOrientation`, `FloorplanSymbols`, `FloorplanCatalog`, `FloorplanLibrary`, `FloorplanUI`, `FloorplanBridge`, `WALLS`, `ROOM`, `OBJDATA`, `HISTORY`, `Rooms`, `meter`, `grid`, `factor`, `mode`, `settings`, `floorplannerTextureMap`, `RS_FLOOR_COLORS`, `RS_DEFAULT_FLOOR`, `FLOORPLAN_ROOM_TYPES`, `HISTORY_LIMIT`, `DOOR_TYPES`, `WINDOW_TYPES`, and many `floorplan*`/`*_mode` functions.

### 2.2 Rendering tech: hand-rolled SVG

- **No canvas element exists** (0 `<canvas>`, 378 `<svg>`, of which 1 is the plan canvas and the rest are icons) (OBSERVED — `probe4.json`). The page's only `<script src>` tags are the 11 `js.php?f=planner/*` modules plus AdSense/GA — **no d3, no Snap.svg, no Konva/Fabric, no jQuery** (OBSERVED — script tags in `evidence/2dplanner_index.html`; the `d3` substring matches inside the modules are hex fragments such as `d36`, not `d3.select`/`d3.path` calls).
- The plan SVG has a **fixed layer stack in z-order**: `boxgrid`, `boxpath`, `boxSurface`, `boxRoom`, `boxSkirting`, `boxwall`, `boxcarpentry`, `boxEnergy`, `boxFurniture`, `boxbind`, `boxArea`, `boxRib`, `boxAngles`, `boxScale`, `boxText`, `boxMeasure`, `boxDebug` (17 top-level layer groups + `defs` = 18 direct children) (OBSERVED — `probe11.json`, and the serialized `svg_data`).
- `defs` contains all appearance primitives: 12 named `linearGradient`s (`gradientWhite` default), image `pattern`s (`grass`, `wood`, `tiles`, `granite` pointing at `/extensions/floorplanner/images/*.jpg`), the two grid patterns, a hatch, and an axis-arrow marker (OBSERVED — serialized `svg_data` in `probe11.json`).
- **Grid**: `<pattern id="…-smallGrid" width="60" height="60" patternTransform="scale(0.3333333333333333)">` and `<pattern id="…-grid" width="180" height="180" patternTransform="scale(0.33333…)">` — i.e. effective 20 px and 60 px spacing. With `meter = 60`, the major grid is exactly 1 m and the minor grid ⅓ m (OBSERVED — `probe11`). Live `grid = 20` (`probe11.json`); the defaults are `{auto_save:true, multi_line:true, dark_mode:false, snap_to_grid:false, grid_size:DEFAULT_GRID_SIZE}` (`normalizeSettings()`, which also coerces a non-boolean `snap_to_grid` back to `false`), and snapping is applied only when the toggle is on and `grid > 0` (`function _0xf9e97b(){ … settings.snap_to_grid && typeof grid=="number" && grid>0 ? grid : 0 }`) (OBSERVED — `evidence/deob/planner_2Fplanner-main_*.deob.js`, `evidence/deob/planner_2Fbridge3d_*.deob.js`).
- **Camera/zoom** is a hand-rolled viewBox pan/zoom, not an SVG transform on the content. The editor keeps `{width_viewbox, height_viewbox, ratio_viewbox, originX_viewbox, originY_viewbox, zoom, factor}`: `width_viewbox`/`height_viewbox` start as the container's `getBoundingClientRect()` size, `ratio_viewbox = height/width`, `originX/Y = -width/2, -height/2` (or the last offset after panning), `zoom` defaults to `9`, and `factor` is derived as `width_viewbox / taille_w`. `applyViewBox()` writes the string `originX originY width height` to every `svg.extension-floorplanner-current-svg`. `recentreViewboxToRooms(rooms)` unions each room's `coordsOutside`+`coords`, adds a 600 px (0x258) margin, takes `max(width, height/ratio)`, and re-centres - this is the fit-to-plan behaviour. The 3D bridge overlay reads the same `factor` (`_0x2d8167()` returns it when finite and > 0) (OBSERVED - `evidence/deob/planner_2Fplanner-main_*.deob.js`, `evidence/deob/planner_2Fbridge3d_*.deob.js`, `probe11.json`).
- `qSVG`'s surface is the whole geometry library: `create, angleDeg, angle, getAngle, middle, triangleArea, measure, gap, pDistance, nearPointOnEquation, circlePath, createEquation, perpendicularEquation, angleBetweenEquations, intersectionOfEquations, vectorXY, vectorAngle, vectorDeter, btwn, nearPointFromPath, getNodeFromPath, polygonIntoWalls, polygonIntoCurvedWalls, area, areaRoom, perimeterRoom, junctionList, vertexList, arrayCompare, vectorVertex, segmentTree, polygonize, diffArray, diffObjIntoArray, rayCasting, polygonVisualCenter, ARC_MIN_BULGE, angleNorm, arcFromBulge, wallArc, arcAngleAt, arcPointAt, arcTangentAt, arcTangentDeg, arcParam, arcNearest, arcSteps, arcPoints, bulgeFromPoints, clampBulge, subArcBulge, arcBandContains, arcSegmentIntersections, arcArcIntersections, wallCrossings, arcWallPath, wallCentrePath, textOnDiv` (OBSERVED — the `qSVG` object literal and its call sites in `evidence/deob/planner_2FqSVG_*.deob.js` and `evidence/deob/planner_2FfloorplanEditor_*.deob.js`; method names are plain strings in the object literal, not obfuscated).
- `qSVG.ARC_MIN_BULGE = 0.5` (OBSERVED — `probe5`): a wall is an arc only when `|bulge| ≥ 0.5`.

### 2.3 Data model: walls, rooms, openings

The 2D planner keeps **three representations**, in increasing order of portability.

**(a) Editor globals (rich, cyclic, not serialisable as-is)**

`WALLS[]` — wall objects whose live key set is
`{thick, start:{x,y}, end:{x,y}, type, parent, child, angle, equations:{up,down,base}, coords:[4 points], backUp, uid, graph, bulge?}` (OBSERVED — the real `wallData` in `probe11.json` carries `parent:3, child:1`; the `setModel`-synthesised `wallData` in `probe10.json` carries `parent:null, child:null`, `equations:{}`, `coords:[]`).

- `parent` / `child` are **indices into `WALLS`** (e.g. wall 0 has `parent:3, child:1`): the shared-wall / closed-loop topology is stored as a doubly-linked ring, not recomputed from coordinates (OBSERVED — `wallData` in `probe11`).
- `equations` = `{up:{A:'h'|'v', B:number}, down:{…}, base:{…}}` — the three axis-aligned lines of the wall band (two faces + centreline). This is why `qSVG` needs only a tiny `A/B` linear-equation solver for intersections (OBSERVED — `probe11`; `qSVG.createEquation`, `intersectionOfEquations`).
- `coords` = the four miter-joined corners of the wall polygon (e.g. `[{-4.5,-4.5},{4.5,4.5},{595.5,4.5},{604.5,-4.5}]` for a 9 px thick wall from (0,0) to (600,0)) (OBSERVED — `probe11`).
- `type` is `"normal"` or `"separate"`; the "Make separation" tool sets `type='separate'`, backs up `thick` into `backUp` and forces `thick = 0.07` — a **divider is just a very thin wall of another type**, not a separate entity (OBSERVED — `floorplanEditor.invisibleWall`/`visibleWall` source in `evidence/deob/planner_2FfloorplanEditor_*.deob.js`).
- `bulge` (optional, signed scalar) turns the straight segment into a circular arc; arcs participate in `wallFrameAt` via `arcTangentDeg`, so openings can be seated on curved walls (OBSERVED — `floorplanEditor.wallFrameAt`/`placeOnWall` and the `qSVG` arc family in `evidence/deob/planner_2FfloorplanEditor_*.deob.js` and `.../planner_2FqSVG_*.deob.js`).

`OBJDATA[]` — every placed item, in two families (OBSERVED — live objects from `probe8.json`):

```
free furniture: {family:'free', class:'energy', type:'bed', x, y, angle, angleSign,
                 size, thick, hinge:'normal', model:'/admin/objects/r38bed.glb',
                 modelFootprint3d:{x:3.129, z:2.269, source:'…/r38bed.glb'},
                 modelAutoTurn:false, libraryProductId:2, sizeVersion:2, uid}
door / window:  {family:'doorWindow', class:'door'|'window', type:'simple',
                 x, y, angle, angleSign, size, thick, hinge:1, value:1,
                 limit:[{x,y},{x,y}], height3d:2.05, uid}
```

`ROOM[]` / `Rooms.polygons` — a room record (OBSERVED — `probe8.json`):

```
{ coords[], coordsOutside[], coordsInside[], inside[], way[],
  walls:[{x1,y1,x2,y2,segment}], area, surface, name, color,
  wallTexture, showSurface, action, orientation3dHint?, frontMarker? }
```

- `coords` is the **centreline** polygon; `coordsOutside` / `coordsInside` are the same ring offset by ±thick/2 (for the drawn wall band); `way` is the closed vertex cycle as strings, with the first index repeated at the end (`['1','0','2','3','1']`) (OBSERVED — `probe8`).
- `area` is stored in **px²** and is the **inner (inside-face) area**, not the centreline area: the 600×400 px centreline room has `coordsInside` 591×391 = `231081` px², and the rendered label is `231081/60² = 64.19 m²` — I verified the arithmetic against the live `64.19 m²` text (OBSERVED — `probe8`/`probe11`). Wall dimensions are labelled *outside face to outside face*: the same 600 px centreline wall is drawn `10.15 m`, i.e. `(600+9)/60` — centreline length + one wall thickness (OBSERVED — `probe11` `<text>10.15 m</text>` and `600+9 = 609 = 10.15 × 60`). Both are worth copying as deliberate measurement conventions.
- `Rooms = {polygons:[…], vertex:[…]}` is the output of `qSVG.polygonize(WALLS)`: it builds `junctionList` → `vertexList` → walks `segmentTree` paths, **drops contours whose area < 0x168 = 360 px²**, sorts by signed area, and produces `coords/coordsInside/coordsOutside` via `polygonIntoWalls` (OBSERVED — `qSVG.polygonize` body, `evidence/deob/planner_2FqSVG_*.deob.js`).

**(b) The bridge projection** — see §2.4.

**(c) Persistence** — `localStorage` keys on the 2D page (OBSERVED — `probe7.json`):

- `extension-floorplanner-floorplans` — a map `name → {index, name, svg_data, floorplan}`; `svg_data` is the whole serialized plan SVG and `floorplan` is a JSON string `{objData[], wallData[], roomData[]}` (the same three arrays as history). Live sample had one entry `"Plan 3D"` (28 427 chars) — the map shape implies multiple named plans (OBSERVED, `probe7`/`probe11`).
- `extension-floorplanner-history` — the undo stack; capacity `HISTORY_LIMIT = 50` (`HISTORY.index`, `HISTORY.length` maintained; `setModel` splices and trims it).
- `extension-floorplanner-current-filename`, `extension-floorplanner-currently-editing`, `hp-donate`.

So the 2D planner already writes a **mini-BIM document** to localStorage; this is separate from the 3D side's `hp-bim` IndexedDB (round-1 finding) — the two are joined only by the bridge, not by storage. (INFERRED from the two storage systems being disjoint.)

**Opening vocabulary** (OBSERVED — `planner-main` source, `evidence/deob/planner_2Fplanner-main_*.deob.js`; live defaults in `probe5`):

| Constant | Value |
|---|---|
| `DOOR_TYPES` | `["aperture","simple","double","pocket"]` |
| `WINDOW_TYPES` | `["fix","flap","twin","bay"]` |
| `DEFAULT_DOOR_HEIGHT` | `2 * meter` px (2 m) |
| `DEFAULT_WINDOW_HEIGHT` | `0.8 * meter` px |
| `DOOR_HEIGHT_LIMITS` | min `1.5 * meter`, max `2.5 * meter` |
| `WINDOW_HEIGHT_LIMITS` | min `0.4 * meter`, max `2 * meter` |

- `limit` is **derived**, not authoritative: `openingLimits(frame, size)` returns the two points `frame ± tangent · size/2`, and `placeOnWall(wall, obj, t)` sets `obj.x/y` from `wallFrameAt(wall, t)`, `obj.angle = frame.deg + (angleSign === 1 ? 180 : 0)`, then recomputes `limit` (OBSERVED — `floorplanEditor.placeOnWall`/`openingLimits` source; live door `limit:[{180,0},{240,0}]` around centre 210 with size 60 in `probe8.json`).
- `hinge` is numeric in serialized data (`1`) and is normalised to `±1` internally (`"hinge"]? 0x1 : -0x1`) — the door-swing side.
- `angleSign ∈ {0,1}` flips the opening 180° on the wall.
- Room-level extras (skirting, ceiling/LED/crown) live on the room and are **normalised on export** through `window.normalizeRoomSkirting` / `normalizeRoomCeiling` (OBSERVED — `_0x58392`/`_0x517827` in `evidence/deob/planner_2Fbridge3d_*.deob.js`).

**Texture resolution**: `floorplannerTextureMap` is keyed `extension-floorplanner-texture-<n>` and stores an `{image}` URL; numeric or bare ids are normalised into that namespace (`_0x5b0942`) (OBSERVED — `probe11` keys, `evidence/deob/planner_2Fbridge3d_*.deob.js`).

### 2.4 The FloorplanBridge contract (2D ⇄ 3D)

**Shape.** `window.FloorplanBridge` is defined at the end of `bridge3d` behind an existence guard (`if (!window["FloorplanBridge"]) { … }`) (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`; the live key set was confirmed by `Object.keys(window.FloorplanBridge)`):

| Member | Signature / behaviour (from the deobfuscated body) |
|---|---|
| `version` | `1` |
| `getModel()` | Ensures uids, then returns the flattened projection (§ below) |
| `setModel(model, opts)` | Writes the plan into the 2D editor; returns `false` if `floorplanLoad`/`HISTORY` are missing; `opts.fit` triggers `zoomToFit()` |
| `onChange(cb)` | Pushes `cb` into a listener array |
| `ensureUids()` | Assigns `w…`/`o…` uids to walls/objects that lack one |
| `newUid(prefix)` | `prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2,6) + counter.toString(36)` |
| `setTopography(spec)` | Sets `_0x142966` and (re)builds the `fp-topo` contour overlay |
| `setStatus({enabled,busy,level})` | Toggles `fp-sync-off` / `fp-sync-busy`, updates the sync pill text, shows `· Level n` |
| `setBuildLayer({level,items})` | Starts the 2D transform handle overlay (draggable/rotatable build items) |
| `refresh()` | `ensureUids()` + fires `onChange` listeners with a fresh `getModel()` |
| `isSilent()` | `true` while a `setModel` application is in progress (a re-entrancy counter) |

**The projection — what actually crosses the bridge.** `getModel()` returns exactly five keys:

```
{ meter: 60,                 // px per metre (falls back to 0x3c = 60)
  walls:   [ {uid, start:{x,y}, end:{x,y}, thick,
              type: w.type || 'normal', bulge: Number(w.bulge) || 0} ],
  objects: [ {…whitelist…} ],   // OBJDATA minus class 'boundingBox' and 'measure'
  rooms:   [ …every ROOM[i] key except `graph`, deep-cloned… ],
  polygons:[ {coords, area, name, color, floorImage, wallImage, skirting, ceiling} ] }
```

`rooms` and `polygons` are **parallel arrays over the same rooms**: `rooms` is the editor record (styling included), while `polygons` is a lean, render-oriented view derived from `Rooms.polygons` whose `coords` are keyed (`_0x2f3720`) against `ROOM[].coords` to merge the matching room's `name`, `color`, `wallTexture`, skirting and ceiling. Object `limit`/`height3d` and room `walls`/`way` therefore appear only in `rooms`/`objects`, never in `polygons` (OBSERVED — `_0x558613` body, `probe7.json`).

(OBSERVED — live `probe6/7/8/9/10.json` and the extracted `getModel` body.)

- **Walls are deliberately minimised**: only `uid/start/end/thick/type/bulge`, with `type` defaulted to `'normal'` and `bulge` coerced to a number (`Number(x) || 0`, so a straight wall is `0`, not absent). `parent`, `child`, `angle`, `equations`, `coords`, `backUp` are all editor-internal and are **rebuilt on the other side** — a clean "store only what you cannot recompute" boundary (OBSERVED — `_0x558613` wall mapper, `evidence/deob/planner_2Fbridge3d_*.deob.js`; live wall shape in `probe6.json`).
- **Objects are filtered then whitelisted**: `OBJDATA.filter(o => o.class !== 'boundingBox' && o.class !== 'measure')` removes editor helper records before the field whitelist runs (OBSERVED — `_0x558613`, `evidence/deob/planner_2Fbridge3d_*.deob.js`; live `probe7.json` `OBJDATA_classes`). The literal list in the module is:
  `["family","class","type","x","y","angle","angleSign","size","thick","hinge","value","limit","height3d","model","uid","modelYawOffset","modelFootprint3d","modelAutoTurn","libraryProductId","productRotationOffset","sizeVersion","linear"]`
  and everything else (bboxes, `graph`, `scale`, `params`, `designBox`, `opacity`, …) is dropped — `_0x193482` copies a field only when it is neither `undefined` nor a `function`, deep-cloning each value with `_0xfadaeb` (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`).
- **Rooms are passed wholesale minus `graph`** (which holds SVG node references); then `polygons` additionally resolves textures to URLs and normalises skirting/ceiling (OBSERVED — `_0x558613` + `_0x58392`/`_0x517827`, `evidence/deob/planner_2Fbridge3d_*.deob.js`; live `probe7.json` `Rooms`/`model.rooms` key sets).
- **Everything is deep-cloned** through `_0xfadaeb(x) = JSON.parse(JSON.stringify(x))` — used both by the object whitelist and by the room/polygon projections — so no live object crosses the boundary.

**`setModel` in detail** (OBSERVED — extracted `setModel` body, `evidence/deob/planner_2Fbridge3d_*.deob.js`):

1. Guard: `typeof floorplanLoad !== 'function' || typeof HISTORY === 'undefined'` → return `false`.
2. If the incoming model has walls or objects: start the floorplanner if needed, and dismiss `#extension-floorplanner-newFileModal` (assigning a default filename if none) — i.e. the bridge can **cold-start the 2D UI** from a 3D-side plan.
3. Build a history snapshot `{objData, wallData, roomData}` where `wallData` walls are synthesised as
   `{thick, start, end, type:'normal', parent:null, child:null, angle:0, equations:{}, coords:[], backUp:false, uid}` and `bulge` is re-attached only when `|bulge| ≥ 0.5`.
4. Splice the redo tail, push, trim to `HISTORY_LIMIT` (50), write `localStorage['extension-floorplanner-history']`, then `floorplanLoad(HISTORY.length-1)` — so **a bridge push is an undoable history entry**.
5. Reset the undo button, regenerate the object list, and `zoomToFit()` when `opts.fit`.
6. Guarded by the silent counter so the change does not echo back.

**How the two sides find each other** (OBSERVED — extracted `hp-sync` bodies, `hp-editor` source):

- 3D parent → 2D child: `document.getElementById('floorplanIframe').contentWindow` → `FloorplanBridge` (and `FloorplanCatalog` for symbol lookup). `hp-editor` builds the iframe; `hp-sync` exposes `_0x212060()`/`_0x1f436f()`/`_0x49f276()` = iframe / its `contentWindow` / `contentWindow.FloorplanBridge`.
- 2D child → 3D parent: `window.parent` → `HPSync`, `HPUnits`, `HPI18N`, `HPAI`. All wrapped in `try/catch` because the page also runs standalone.
- **No `postMessage` and no `message` event listener exist in either direction** — the contract is plain same-origin function calls. (OBSERVED: 0 `postMessage` occurrences and no `message` listener in `evidence/deob/planner_2Fbridge3d_*.deob.js`, `.../planner_2Fplanner-main_*.deob.js`, `evidence/deob/hp-sync.deob.js`, `evidence/deob/hp-editor.deob.js`.)

**The 3D-side façade `window.HPSync`** — the methods the 2D bridge actually calls (OBSERVED — `evidence/deob/hp-sync.deob.js` object literal):

`enabled`, `stairFootprints()`, `setEnabled()`, `level` (getter), `requestLevel(n)`, `buildAt(kind,x,y)`, `moveBuild(uid,dx,dy)`, `rotateBuild(uid,deg)`, `moveHandle(uid,key,x,y)`, `deleteBuild(uid)`, `refreshBuildLayer()`, `projectNow()`, `flush()`, `applyPlan()`, `updateContours()`, `contours`, `setContours3d()`, `contours3d`, `setRoof()`, `getState()`, `setState(state)`.

- `getState()` / `setState()` serialise a `{plans, meshless, roofs, meter}` snapshot — the 3D side keeps a **per-level copy of the 2D plan** (`plans[level]`) plus the set of items that only exist in 3D (`meshless`), and re-projects when it changes.
- `buildAt` places native 3D build items (e.g. roof/stair shapes) at a level, converting 2D px→m through `meter` and returning the mesh's `uniqueId` as the bridge uid.
- `requestLevel(n)` returns the level the 3D viewer accepted (clamped 0..50 by the 2D stepper).
- `stairFootprints()` walks all levels' plans, finds objects with `class === 'stair'`, and computes their 4 rotated footprint corners in metres plus `y0/y1` level heights.

**Direction, echoing and cadence** (OBSERVED — extracted `hp-sync`/`bridge3d` bodies; INFERRED where noted):

- **3D → 2D** (`projectNow`, debounced): 3D walks its Babylon meshes, reconstructs walls (`wallEndpoints`, arc mid-point → `bulge` via the perpendicular-offset formula, endpoint snap within 4 px), classifies objects (`doorWindow` + `DOOR_TYPES` → door, `WINDOW_TYPES` → window, `class ∈ {text,measure,stair,boundingBox,socle}` → skipped, else object) and calls `FloorplanBridge.setModel(plan)`. It then **immediately calls `getModel()`** and compares against its own copy — walls with a uniform 0.6 px tolerance on every endpoint coordinate, the arc mid-point and `thick`, plus orientation-insensitive matching (either endpoint order), `type` compared with a `'normal'` default, and finally a whole-plan signature (`_0x11504c`) — to decide whether to rebuild slabs / roofs / ceiling trims. That read-back is the **reconciliation** step.
- **2D → 3D**: `FloorplanBridge.onChange` is wired once (`_0x1480c7`); the handler ignores the callback when `isSilent()`, otherwise stores `pendingPlan`/`pendingLevel`, clears a timer, shows the busy state, and schedules apply after **0x15e = 350 ms**. `floorplanSave`, `floorplanner_undo` and `floorplanner_redo` are monkey-patched at bridge-init time so that every save/undo/redo notifies the 3D side. When the timer fires (`_0x1dc3d7` → `_0x2be460`) during a 300 ms window (`setTimeout(_0x1dc3d7, 0x12c)`), the 3D side diffs walls/objects by uid and creates/updates/deletes the corresponding 3D meshes.
- **3D signature poll**: `setInterval(_0x120b1f, 0x258)` = **600 ms** — watches the 2D page's plan for external changes and re-projects.
- **2D UI poll**: `setInterval(…, 0xfa)` = **250 ms** — toggles the `fp-b3d-inert` class on the 3D overlay and re-measures handles; it does **not** poll the plan.
- **Unit loop-guard**: the 2D `<select id="unitSelector">` change handler pushes to `parent.HPUnits.set(value,{from2d:true})`; when the *parent* changes units, the 2D side writes `unitSelector.dataset.hpFrom3d='1'`, dispatches `change`, then deletes the flag so the handler skips the push-back (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`).
- **Coordinate conversion** (OBSERVED — `evidence/deob/hp-sync.deob.js` `from2d`/`to2d`):
  `from2d({x,y}, meter) → {x: x/meter, z: −y/meter}`; `to2d({x,z}, meter) → {x: round64(x·meter), y: round64(−z·meter)}` where `round64(v) = Math.round(64·v)/64` (1/64 px). Wall thickness and object `size`/`thick` convert the same way. **The y-axis flip is the crucial convention**: 2D is y-down screen px, 3D is right-handed x/z metres.
- **Multi-level**: `setStatus({level})` and `setBuildLayer({level, items})` carry the storey; the 2D toolbar renders a level stepper (`−`/`+`, `aria-live` value, disabled at 0 and 50) that calls `HPSync.requestLevel(n)` (OBSERVED — bridge source, `probe4` button list).
- **Topography/contours**: `setTopography(spec)` stores a `{lines[]}` spec and builds an `fp-topo` overlay group; the contour toggle button is only shown when topography exists (`_0x142966.lines.length > 0`) (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`).
- **3D orientation of 2D items**: separate from the plan contract, `FloorplanOrientation` computes `{yawDeg, symbolFrontDeg, userOffsetDeg, productOffsetDeg, longAxis2d, footprint2d}` (seen live in `probe11`'s `orientation3dHint` with `"method":"2d-front-v2"`), and `FloorplanCatalog.computeWallSnap`/`designBox` govern products that must snap to a wall (OBSERVED — `probe11` `orientation3dHint`, `probe5` `catalog`, `evidence/deob/planner_2FobjectCatalog_*.deob.js`).

### 2.5 Editing UX and tools

- **12 tool modes** are toolbar buttons `#extension-floorplanner-<tool>_mode`, switched by assigning the global `mode`: `select_mode`, `line_mode` (walls), `partition_mode` (divider), `arc_mode` (arc wall), `node_mode` (joint), `distance_mode` (measure), `door_mode`, `window_mode`, `stair_mode`, `room_mode`, `object_mode`, `text_mode`; plus editing states `edit_wall_mode`, `edit_door_mode`, `edit_window_mode`, `edit_room_mode`, `edit_boundingBox_mode`, `bind_mode` (and the report view's own `report_mode`) (OBSERVED — the 12 distinct `*_mode` toolbar ids in `evidence/2dplanner_index.html`, where `object_mode` is the only one rendered twice (toolbar + palette); the other `*_mode` ids (`full_mode`, `nofull_mode`, `layer_mode`, `report_mode`) are view/panel toggles, not drawing tools. Live `mode='select_mode'` in `probe11.json`; modes assigned throughout `evidence/deob/planner_2Fplanner-main_*.deob.js`).
- Tool labels come from `FPI18N` (`tool.select/walls/divider/joint/doors/windows/objects/stairs/rooms/text/measure/layers/arcWall`) with `.tip` keys for the status/hint line (OBSERVED — `2dplanner_index.html` inline dict, 690 extracted key/value pairs).
- Wall-specific commands are a dedicated inspector: `Straighten`, `Paste door / window`, `Cut`, `Make separation`, `Make wall`, `Delete wall` (OBSERVED — `probe4`).
- Settings dialog: `auto_save`, `multi_line`, `dark_mode`, `snap_to_grid`, `grid_size`, units (metric/imperial) — defaults from `normalizeSettings()` in `evidence/deob/planner_2Fplanner-main_*.deob.js`; labels from the inline `settings.*` dictionary in `evidence/2dplanner_index.html`; the controls are `#extension-floorplanner-auto-save-checkbox`, `-multi`, `-dark-mode`, and the grid-size/snap setters `setGridSnapEnabled`/`setGridSize`.
- Undo/redo buttons `#extension-floorplanner-undo` / `-redo`, disabled class `extension-floorplanner-disabled`, driven by the `HISTORY` stack (limit 50). Bridge wraps both so the 3D side is notified (OBSERVED — `evidence/deob/planner_2Fbridge3d_*.deob.js`, `#extension-floorplanner-undo` in `probe4.json`).
- Room appearance is edited from a room inspector: floor colour/texture (`RS_FLOOR_COLORS`, 12 gradients; default `gradientWhite`), wall texture, skirting/crown + LED (`rs.ceiling.*` i18n keys), surface visibility (OBSERVED — `probe11`, inline dict).
- Measurement: `distance_mode`, `boxMeasure` layer, `boxRib` per-wall dimension texts (`10.15 m` etc.), plus a live room area label (`64.19 m²`) (OBSERVED — `probe11` `svg_data`).
- Arc walls are entered with `arc_mode` and edited through the arc family (`msg.arcStart`, `msg.arcEnd`, `msg.arcBend` i18n keys) (OBSERVED — inline `dict` in `evidence/2dplanner_index.html`).

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

All ideas are behaviour-level; no 3D House Planner code is reusable (proprietary) and its bundled models are CC-BY/CC-BY-NC-SA.

| # | Idea | Tied to | Effort | Value |
|---|---|---|---|---|
| 1 | **Add a runtime bridge façade over `FloorplanData`** — a `window.casaplazaBridge = {version:1, getModel, setModel, onChange, isSilent}` published by the Plan mode. `getModel()` projects the editor state through the schema (dropping editor-only fields) and `setModel()` validates + applies atomically. This is exactly 3DHP's split between rich editor state and a whitelisted projection, and it makes the already-frozen `types.ts` contract enforceable at runtime, not only by import discipline. | §2.4; schema "Frozen interchange contract" | M | High |
| 2 | **Make the projection a whitelist, not a dump.** Mirror 3DHP's explicit field list: when serialising, copy only the frozen top level (`schemaVersion, units, wallHeight, wallThickness, rooms, openings, furniture`) and, per entity, only the documented fields — drop SVG refs, cached bboxes and derived topology. Prevents accidental schema leakage and matches the "out-of-schema editor state" rule. **Two 3DHP conventions to invert, not copy:** its polygons repeat the first vertex (CasaPlazAI forbids that and requires CCW), and its room `area`/opening `limit` are stored redundantly. | §2.4 object whitelist; schema top level + `non-ccw-polygon` | S | High |
| 3 | **Reconciliation on apply (compare + tolerance + silent guard).** When the 3D viewer ever pushes back (e.g. "apply viewer edits"), follow 3DHP: apply behind an `isSilent()` counter, then re-read and diff with a metric tolerance (3DHP uses a uniform 0.6 px ≈ 1 cm on endpoints, arc mid-point and thickness, with orientation-insensitive endpoint matching) before rebuilding; skip the echo. Without this a push/pull pair oscillates. | §2.4 `setModel`→`getModel` read-back | M | High |
| 4 | **Coalesce notifications, don't rebuild per event.** Use 3DHP's shape: debounce the plan-apply by ~350 ms and run a low-frequency (600 ms) signature poll for out-of-band changes, while UI-only affordances poll faster (250 ms). Map to CasaPlazAI: debounce 3D re-render on `FloorplanData` change and keep autosave on its own timer; only the *signature* (cheap hash) is polled. | §2.4 cadence constants | S | High |
| 5 | **Arc walls as one signed scalar per segment (`bulge`) with a cut-off.** 3DHP encodes a curved wall with a single number and a floor of `|bulge| ≥ 0.5`; everything else (tangent, frame, opening seating, area) is derived. If CasaPlazAI ever adds curved walls, this is the minimal storage shape and belongs in `schemaVersion 2` through `migrate.ts` (never by breaking the v1 `polygon`). | §2.2 `ARC_MIN_BULGE`; §2.3 `bulge`; schema migration hook | L | Medium (future) |
| 6 | **Keep derived geometry derived — store intent only.** 3DHP stores the opening centre plus a *derived* `limit` clamp that it recomputes every placement, and stores room `area` redundantly. CasaPlazAI already stores `tCenter` (intent) and validates the cutout interval (`opening-too-wide`) — keep that and add the same "recompute, never trust" rule for future fields (e.g. never persist opening corner points). | §2.3 `openingLimits`; schema `tCenter` rules | S | Medium |
| 7 | **Normalise optional room sub-objects on read, not in storage.** 3DHP calls `normalizeRoomSkirting`/`normalizeRoomCeiling` at the boundary so the stored form can stay minimal and legacy. If CasaPlazAI adds skirting/ceiling/LED to a Room v2, put a pure `normalizeRoomExtras()` in `src/shared/schema` and keep the stored payload sparse. | §2.3/§2.4 `_0x58392`/`_0x517827`; schema additive-only rule | S | Medium |
| 8 | **Derive shared-wall topology instead of storing it.** 3DHP stores `parent`/`child` indices on walls and `way` cycles on rooms — powerful but easy to desynchronise (which is why it validates by signature). CasaPlazAI already derives shared walls from coincident endpoints; keep that, and if you need room↔wall linkage (for openings), compute indexes on demand like `junctionList`/`vertexList` rather than persisting. | §2.3 `WALLS[i].parent/child`, `way` | M | Medium |
| 9 | **A "divider" as a thin wall of another type, not a new entity.** 3DHP's `type:'separate'` + `thick=0.07` keeps the data model and room tracing unchanged. If CasaPlazAI wants visual-only partitions, prefer an editor-local flag that changes rendering/thickness, leaving `FloorplanData.rooms[].polygon` untouched — no schema change. | §2.3 `invisibleWall` | S | Medium |
| 10 | **Add a bridge `version` + capability probe.** One integer plus optional feature flags (e.g. `supportsArcs`, `supportsLevels`) lets the viewer degrade gracefully; 3DHP does only the version, which is why it relies on try/catch everywhere. | §2.4 `version:1` | S | Low |
| 11 | **If the Plan canvas is SVG: adopt a fixed z-layer group stack.** 3DHP's 17 named `<g>` layers (grid → rooms → walls → furniture → measurement → debug) make hit-testing, redraw and feature toggles trivial and keep DOM updates local. Convert to a canvas equivalent (one offscreen layer per class) if CasaPlazAI renders on canvas. | §2.2 layer stack | M | Low–Medium |
| 12 | **Single unit source of truth with an explicit loop-guard.** 3DHP bridges units with a one-shot dataset flag to avoid a change→set→change ping-pong — a real risk precisely because it supports metric *and* imperial. CasaPlazAI's schema fixes `units: "meters"` and rejects `bad-units`, so the best move is to keep the unit toggle out of the schema entirely and derive display formatting from that constant. | §2.4 `hpFrom3d` guard; schema `units`/`bad-units` | S | Low |

Non-ideas (explicitly avoid): copying the `qSVG` kernel (proprietary), reusing their pattern textures (`/extensions/floorplanner/images/*.jpg`), or mirroring the 60 px/m duality — CasaPlazAI's schema is metres-only and should stay so.

---

## 4. Unknowns

- **Exact production flow of `setModel`.** I proved `setModel` works and returns `true` from the console (`probe10.json`), but did not observe a real 3D→2D sync on a live `app.php` session (the 3D editor is heavy and the iframe loads lazily). Whether `setModel` is called on iframe load, on every 3D edit, or only on an explicit action, (INFERRED from the 600 ms poll plus the debounced project path.)
- **The full `qSVG` algorithms.** `polygonize`'s `segmentTree` traversal, `polygonIntoWalls` offsetting and the arc-interaction routines are described only from their call sites; I did not reconstruct them line-by-line.
- **`Rooms` vs `ROOM` vs `Rooms.polygons` vs `Rooms.vertex` semantics** beyond the field shapes — in particular the exact `bypass`/`inside`/`way` invariants and how holes (islands) are represented.
- **Multi-plan management.** localStorage holds a map of named plans, but on a fresh session only `"Plan 3D"` exists; how the 2D planner and the 3D editor agree on plan names, and whether the 2D standalone page shares the same `extension-floorplanner-*` keys as the embedded one, is unverified.
- **Measured performance** of the 600 ms poll and the 350 ms debounce under a large plan (I never built more than a 4-wall, 8-object plan).
- **`orientation3dHint.method = "2d-front-v2"`** details: I have the field shape and the `FloorplanOrientation` API surface, but not the rules that pick `longAxis2d`, nor how `productRotationOffset` from `/admin/objects` metadata is resolved.
- **Licence of the planner code itself** — not stated on the page; the surrounding product is proprietary and the iframe is same-origin, so treat it as proprietary. The referenced `/extensions/floorplanner/images/*.jpg` textures were not fetched or analysed.
- **The close path.** The 3D editor's `#close2DPlanner` button in `hp-sync` hides `#floorplanFrameContainer`, restores `#renderCanvas` and calls the apply routine; I did not exercise it live, so whether closing the 2D view pushes a final plan back is (INFERRED) to be yes.

**Round-1 unknown now closed:** the earlier note that the "message contract (postMessage schema) is unverified" can be resolved — there is no `postMessage` contract. The bridge is direct same-origin object access (OBSERVED: 0 `postMessage` occurrences and no `message` event listener in the planner `bridge3d`/`planner-main` modules or in `hp-sync`/`hp-editor`; `contentWindow.FloorplanBridge` in the parent, `window.parent.HPSync` in the child).
