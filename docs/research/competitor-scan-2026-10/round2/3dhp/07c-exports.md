# 3D House Planner — the export formats: client-side vs server-side, and what the files actually contain

Research job: `07-07c-save-export-share-exports` (round 2, deep dive on exports) · CasaPlazAI competitor research · 2026-10-31

**Scope and method.** Round 1 (`~/dsh-workspaces/rea-3dhouseplanner-2026-10/07-07-save-export-share/report.md`)
established the save/load/share picture and *claimed* that `pdf, ifc, dxf, svg, csv` are rendered on
`api/bim.php` while `project, glb, gltf, obj, stl, png` are produced in the browser, but left
"No generated export file was opened" as an explicit Unknown. This round closes that gap. I drove the
live editor with the `playwright-core` bundled inside `rea-agents` (no installs), forced software GL
(`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, which **did** render —
WebGL was available and `HP3D.engine` was live), built a tiny 5 m x 4 m four-wall room by calling the
page's own `HP3D.buildWall`, then invoked the page's own exported `HPBIM.exportAs` / `exportDxf` /
`exportSvg` / `exportCsv` / `exportIfc` / `exportBcf` / `exportXlsx` APIs. Every produced file was
saved and opened.

Legend: **OBSERVED** = live page, shipped JS, or an actual produced artefact (evidence file cited) ·
**DOCUMENTED** = vendor page · **INFERRED** = conclusion drawn from observed facts.

Evidence in this folder: `artifacts/` (the files the app produced), `evidence/` (network exchanges,
API surface, run logs), `tools/` (the probe drivers), `notes/`. Round-1 evidence is read-only and is
not duplicated here.

---

## 1. Summary

- **The export dialog enumerates 11 formats, not 12** — `project, pdf, ifc, glb, gltf, obj, stl, dxf,
  svg, csv, png` — and there are three further export surfaces outside that dialog: a client-side
  **XLSX** workbook button in the schedule/QTO panel, a client-side **BCF** topic package, and the
  separate **2D planner page** (`2D-Planner/index.php`) which downloads its own `.svg` and `.json`.
  The "12" is best read as the dialog's 11 plus one of these. *OBSERVED*
- **Client-side (6): `project, png, stl, obj, glb, gltf`.** All six completed with **zero**
  `api/bim.php` traffic and produced files in the browser. *OBSERVED* (`evidence/r2-export-results.json`,
  `evidence/r2-api-exchanges.json`)
- **Server-side (5): `pdf, ifc, dxf, svg, csv`.** All five issued `POST api/bim.php` and the response
  body came back from the vendor's server; every response carried a
  `Content-Disposition: attachment; filename="…"` header that the client uses to name the download.
  *OBSERVED* (`evidence/r2-api-exchanges.json`)
- **All 11 produced real, valid files from the tiny plan**, and I opened them: a 20.0 m² room with
  four 2.6 m walls serialised correctly into IFC4 **and** IFC2X3 STEP, an SVG with separate
  `rooms`/`walls`/`windows`/`doors`/`furniture`/`labels`/`dimensions`/`sheet` groups, an R12 DXF with
  `LINE` per wall edge on a `WALLS` layer, a semicolon+UTF-8-BOM CSV schedule with per-element
  quantities and costs, a **vector** A3 PDF (2 pages, real `m`/`l`/`c` path operators, one embedded
  raster image), a binary STL (120 triangles), a GLB and a glTF+bin, and an OBJ+MTL. The two extra
  client-side surfaces also worked: a valid 5-sheet XLSX and a second SVG from the 2D planner.
  *OBSERVED* (`artifacts/`)
- **The server is a pure render-on-demand endpoint, not storage.** Round 1's footer wording is
  confirmed literally: the client hard-codes `["pdf","ifc","dxf","svg","csv"]` as the "cloud" set and
  `io.serverNote` = "Made on our server from a copy of the model; nothing is stored." Request bodies
  under 64 KB were sent **uncompressed** (`X-HP-Encoding` absent); only the PDF request exceeded the
  threshold and carried `X-HP-Encoding: gzip`. *OBSERVED*

---

## 2. Findings

### F1 — The format inventory and the dispatcher — OBSERVED

The dialog renders one radio per entry of a hard-coded array and the per-format option set comes from
a second hard-coded map (read from the shipped bundle
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/07-07-save-export-share/bundles/deobf/editor__hp-bim.js`,
not redistributed; my extracted annotation is in `notes/`). Quoting the *structure* I read:

- order: `project, pdf, ifc, glb, gltf, obj, stl, dxf, svg, csv, png` (11 entries);
- the **cloud/server set is a literal list**: `["pdf","ifc","dxf","svg","csv"]`; the dialog footer
  chooses a cloud icon + `io.serverNote` when the selected format is in that list, otherwise a
  padlock + `io.localNote` ("Files are created in your browser.").
- default download extensions: `.hpbim.json · -sheets.pdf · .ifc · .glb · .gltf · .obj · .stl · .dxf ·
  -plan.svg · -schedule.csv · .png`.

The dispatcher is a single chain of `if/else` over the format string; each branch calls a builder. The
**client** builders are:
`project` → `JSON.stringify(serialize())`; `png` → Babylon
`Tools.CreateScreenshotUsingRenderTargetAsync` at the requested pixel width; `stl` → Babylon
`STLExport.CreateSTL` (binary, `binary:true`); `obj` → a hand-written OBJ+MTL writer; `glb`/`gltf` →
Babylon `GLTF2Export.GLBAsync` / `GLTFAsync`. The **server** builders all funnel through one helper
that `POST`s to `api/bim.php`. *OBSERVED*

The live dialog radios were independently confirmed in round 1
(`…/evidence/07b/exportForm.dom.html`: `input[name="hpIoFormat"]` values = the 11 above; the menu chips
`data-fileact="export:*"` = the same 11).

### F2 — Client vs server, proven by network capture and artefacts — OBSERVED

I exported all 11 formats from one session and recorded every `api/bim.php` exchange
(`evidence/r2-api-exchanges.json`, `evidence/r2-export-results.json`):

| Format | Produced by | `api/bim.php` seen? | File produced (bytes) | HTTP content-type / disposition |
|---|---|---|---|---|
| project | browser | no | `Untitled-project.hpbim.json` (46 958) | — |
| png | browser (WebGL render target) | no | `Untitled-project.png` (1 269 104 → 6 205 019 @5120) | — |
| stl | browser (Babylon STLExport) | no | `Untitled-project.stl` (6 084) | — |
| obj | browser | no | `Untitled-project.zip` (2 339, default); `{zip:false}` → `ProbeOBJ.obj` 9 642 + `ProbeOBJ.mtl` 491 | — |
| glb | browser (Babylon GLTF2Export) | no | `Untitled-project.glb` (19 296) | — |
| gltf | browser (Babylon GLTF2Export) | no | `Untitled-project.zip` (2 558) → `.gltf` 17 625 + `.bin` 9 120 | — |
| **dxf** | **server** | **yes** | `Untitled-project-level0.dxf` (2 316) | `application/dxf` + `attachment; filename="Untitled-project-level0.dxf"; filename*=UTF-8''…` |
| **svg** | **server** | **yes** | `Untitled-project-level0-plan.svg` (2 262) | `image/svg+xml; charset=utf-8` + disposition |
| **csv** | **server** | **yes** | `Untitled-project-schedule.csv` (573) | `text/csv; charset=utf-8` + disposition |
| **ifc** | **server** | **yes** | `Untitled-project.ifc` (15 436) | `application/x-step` + disposition |
| **pdf** | **server** | **yes** | `Untitled-project-sheets.pdf` (521 236) | `application/pdf` + disposition |

The nine recorded `api/bim.php` calls break down as: three `budget` (the earlier panel opening, not an
export), one each of `dxf`, `svg`, `csv`, `ifc`, `pdf`, and one `classify` (the model-check/BIM
classification call). **The five export actions are exactly `dxf, svg, csv, ifc, pdf`** — matching the
hard-coded cloud list and the dialog footer. No other format touched the network.

### F3 — The client-side builders: what they actually emit — OBSERVED

- **project (`format:"project"`)** — the editable snapshot (`format:"hp-bim"`, `version:1`). My 5-element
  export was 46 958 bytes; top level `format, version, app, meta, settings, camera, levels, levelInfo,
  site, norms, sun, tour, measures, efficiency, classification, ifc, types, budget, elements, terrain,
  plan, georef, check, sync` (matches round 1's F4). Note the default Mongo-ish id
  `pmvwimib8syivu` and that **element material is dumped as full Babylon material JSON** (every
  `PBRMaterial`/`StandardMaterial` flag), which is why a 5-element plan is already ~46 KB. *OBSERVED*
  (`artifacts/Untitled-project.hpbim.json`)
- **png** — a Babylon render-target screenshot of the current view, width = the `pngWidth` option,
  height = width x `canvas.height/canvas.width`. Measured: canvas 1440x900 → `1600x1000`,
  `1024x640`, and `5120x3200` (the 5120 export was 6.2 MB, RGBA PNG type 6). Widths are presets in
  the dialog (round 1 recorded up to 5120 px / "4K" at 4096). *OBSERVED*
- **stl** — binary STL (`model/stl`): 84-byte header, `uint32` triangle count + 50 bytes/triangle.
  My four-wall room = 120 triangles, 6 084 bytes = 84 + 120x50, exactly consistent. *OBSERVED*
  (`artifacts/Untitled-project.stl`)
- **obj** — by default zipped: the `.obj` text plus a `.mtl` (`newmtl …`, `Kd/Ka/Ks`, `illum 2`,
  `map_Kd` for textures) and any texture images. `mtllib <name>.mtl` in the OBJ header; faces are
  emitted with `v/vt/vn` indices. With `{zip:false}` it downloads `ProbeOBJ.obj` (9 642) + `ProbeOBJ.mtl`
  (491) as two files. *OBSERVED*
- **glb / gltf** — Babylon `GLTF2Export`, generator string `"Babylon.js v6.38.0"`. For the 4-wall
  room the GLB contained 5 nodes named `wall_merged` x4 + `poly` (the auto-slab), 5 meshes and a
  material named `std`. glTF default is zipped (`.gltf` + `.bin`). *OBSERVED*
  (`artifacts/Untitled-project.glb`; JSON chunk parsed)
- **xlsx** — **client-side but not in the dialog**. A "XLSX" button in the schedule/QTO panel calls
  `HPBIM.exportXlsx`; it lazy-loads **SheetJS 0.18.5 from `cdn.jsdelivr.net`** and writes
  `Untitled-project.xlsx` (14 754 bytes) with 5 sheets: **Budget, Rooms, Doors, Windows, Walls**.
  *OBSERVED* (`artifacts/Untitled-project.xlsx`, `evidence/r2-probe5.json`)
- **bcf** — `HPBIM.exportBcf()` builds an in-memory BCF 2.1 package from the model-check issues
  (`bcf.version`, `project.bcfp`, per-topic `<guid>/markup.bcf`, plus a 640x360 render-target
  snapshot per topic). With no issues present it toasts and returns `null`. It is a real export path
  but not one of the 11 dialog formats. *OBSERVED*

### F4 — The server export contract (`POST api/bim.php`) — OBSERVED

One helper is used by all five server formats. Observed request/response facts:

- Request: `POST api/bim.php` with `credentials:"same-origin"`, `Content-Type: application/json`,
  `Accept: application/json, */*`. Body =
  `{"action": <dxf|svg|csv|ifc|pdf>, "model": {…}, "options": {…}}` (plus `drawing`/`image` extras for PDF).
- **`model` is a reduced, geometry-bearing document**, not the whole `.hpbim.json`: observed keys
  `version, name, id, floorHeight, levels, budget, elements, norms, types, ifc` (+ `contours:true` for
  dxf/svg). No `camera`, `sun`, `terrain` etc. Elements carry `uid, kind, level, bim{guid,name,
  ifcClass,psets,props,phase,unitPrice,notes}, model, hint, material, geometry`.
- `options` observed: `{lang:"en", fileName:"Untitled-project"}`; `+level:0` for dxf/svg;
  `+schema:"IFC4", costSchedule:false` for ifc; `+sheet:{…}` and `drawing:{parts:[…]}` for pdf.
- **Size/gzip rule confirmed**: only the PDF request exceeded 64 KB and it carried
  `X-HP-Encoding: gzip`; every smaller model was sent as plain JSON. (Round 1 read this rule from the
  code; this is the live confirmation.)
- Response: for the four "text" formats the body **is the file** (`application/dxf`,
  `image/svg+xml`, `text/csv`, `application/x-step`), each with
  `Content-Disposition: attachment; filename="X"; filename*=UTF-8''X`; the client reads the file name
  from that header (round 1's F7). PDF returns `application/pdf` the same way.
- Separately, `action:"classify"` returns JSON element→IFC-class assignments
  (e.g. `IfcWall`, `IfcSlab`) and `action:"budget"` returns a priced row set in JSON — these are the
  BIM/costing calls, not exports, and they fire while the UI is open.

### F5 — The produced artefacts, inspected — OBSERVED

The plan for all of these was the same tiny rectangle: corners (0,0)-(5,0)-(5,4)-(0,4), wall
thickness 0.2 m, height 2.6 m. Files are in `artifacts/`.

**SVG** (`Untitled-project-level0-plan.svg`, 2 262 B) — a *sheet*, not just outlines:
`viewBox="-170 -630 840 880"`, a white background rect, then named groups in a fixed order:
`rooms` (the floor polygon, `#f4efe4`), `walls` (one filled polygon per wall face, `#2f3440`),
`windows`, `doors`, `furniture`, `labels` (the `20.00 m²` room-area text), `dimensions`
(extension lines + `5.20 m` / `4.20 m` texts with a rotated label), and `sheet` (title text, a
two-segment scale bar with `0` and `2 m` ticks, and a north arrow path + `N`). Coordinates are in
centimetres on an inverted-Y (SVG) plane. **The four wall polygons are the 4 x 2.6 m halves of the
shared walls: 507.5 x 10 units etc. — this is a real, to-scale plan drawing.**
*OBSERVED* (`artifacts/Untitled-project-level0-plan.svg`)

**DXF** (`Untitled-project-level0.dxf`, 2 316 B) — AutoCAD **R12** ASCII (`$ACADVER = AC1009`),
`$INSUNITS = 6` (metres), `$EXTMIN/-0.1,-0.1` … `$EXTMAX 5.1,4.1` (the model extents). TABLES define
8 layers: `WALLS(7) DOORS(1) WINDOWS(5) FURNITURE(8) ROOMS(3) ROOFS(30) …`. The ENTITIES section of
my room contains **20 `LINE`s + 1 `TEXT`**, and nothing else: 16 lines on layer `WALLS` (4 lines per
wall, i.e. the two faces + two end caps, including the mitred 0.075 overhang at corners) and 4 on
`ROOMS`, plus one `TEXT` `"20 m2"` at (2.5, 2.0). Layers for doors/windows/furniture/roofs exist but
had no entities because my plan had none. **Everything is on the XY plane (Z=0)** — it is a 2D CAD
plan of one level, not a 3D DXF. *OBSERVED* (`artifacts/Untitled-project-level0.dxf`)

**CSV** (`Untitled-project-schedule.csv`, 573 B) — UTF-8 **with BOM**, `;`-separated, header
`Level;IFC class;Predefined type;Name;GlobalId;Material;Length;Height;Width;Area;Volume;Unit;Unit price;Cost;Phase`.
Five data rows for my 5 elements (4 walls + auto-slab), e.g.
`0;IfcWall;;Wall 1;21wRkkln0k_9UMo48mdsPw;#FFFFFF;5.15;2.6;0.2;13.39;2.678;m²;95;1272.05;new` and
`0;IfcSlab;;Floor slab 1;…;#D9D1C2;;;;20;2;m²;110;2200;new`. It is a **quantities-and-cost schedule**,
not a raw geometry dump: choosable unit price (95/m² walls, 110/m² slab here from the server's
reference price table) and computed `Cost`, plus an IFC `Phase` column. *OBSERVED*

**IFC** (`Untitled-project.ifc`, 15 436 B) — ISO-10303-21 STEP, `FILE_SCHEMA(('IFC4'))` and
`FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'))`; `IFCAPPLICATION(#2,'2.0','3D House
Planner','HP3D')`, `IFCPROJECT`, `IFCSITE`, `IFCBUILDING`, `IFCBUILDINGSTOREY('Level 0',…,0.)` with
`IFCELEMENTQUANTITY Qto_BuildingStoreyBaseQuantities(IFCQUANTITYLENGTH('GrossHeight',…,2.65))`,
`IFCSIUNIT` metre/area/volume/radian/second, `IFCMONETARYUNIT('USD')`. Choosing the IFC2X3 option
produced a second file with `FILE_SCHEMA(('IFC2X3'))` and
`FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'))` — so the schema choice changes the
view definition too. *OBSERVED* (`artifacts/Untitled-project.ifc`, `artifacts/ProbeIFC-ifc2x3.ifc`)

**PDF** (`Untitled-project-sheets.pdf`, 521 236 B) — `%PDF-1.6`, **2 pages** (A3, `MediaBox
0 0 1190.551 841.89` = 420x297 mm), one embedded TrueType font (`FontFile2`) and **at least one embedded raster image** (XObject image data is present and a `Do` operator is invoked on the cover page).
Decoding the Flate content streams shows **real vector operators** — page 2's stream opens
`2.835 0 0 2.835 0 0 cm 1 j 1 J` then `q 22 60 386 225 re W n`, filled room polygons with
`m/l/h f*`, and strokes with `S`; the cover page has `BT … /F1 9 Tf … Tj` text runs. So the PDF is
**vector line work + text + one embedded bitmap**, not a screenshot dump. *OBSERVED*

**STL / GLB / glTF / OBJ / PNG / XLSX** — all opened and structurally valid as described in F3.

### F6 — The other export surfaces (the 12th, 13th…) — OBSERVED

- **XLSX** — client-side, 5 sheets (F3). Triggered from the schedule panel, not the export dialog.
- **BCF 2.1 zip** — client-side, built from model-check issues (F3).
- **2D planner SVG** — the editor embeds a second page, `2D-Planner/index.php?lang=en`, as
  `#floorplanIframe`. That page exposes `FloorplanBridge` (`setModel, getModel, refresh, setStatus,
  setTopography, setBuildLayer, ensureUids, version, onChange, isSilent, newUid`) and its own toolbar
  with `#extension-floorplanner-svg-download-button`, `#extension-floorplanner-print-button` and
  `#extension-floorplanner-export-project-button`; its menu strings include
  `"menu.downloadSvg":"Download image (.svg)"`, `"menu.export":"Export project (.json)"` and
  `"menu.print":"Print"`. Clicking the SVG button downloaded **`floorplanner.svg`** (10 413 B), a
  self-contained SVG with the 2D planner's own gradient defs and layer groups
  (`…-boxwall`, `…-boxRoom`, `…-boxFurniture`, `…-boxMeasure`, `…-boxText`, `…-boxTopo`, …). This is a
  **second, independent client-side vector plan export**, and it is the one the editor's own string
  `io.svgUnavailable` = "Open the 2D planner once to export its SVG plan" refers to.
  *OBSERVED* (`artifacts/floorplanner.svg`, `notes/2dplanner.html`, `evidence/r2-probe5.json`)
- **Print** — the 2D planner has a `#…-print-button`; the editor's only `window.print()` path is a
  standalone BIM schedule table in a popup (round 1, F14). Not exercised this round. *INFERRED* from
  markup.

So "12 export formats" is best read as the dialog's **11** plus one of {XLSX, BCF, 2D-planner SVG}.

### F7 — Per-format options and defaults — OBSERVED

The option set per format is a hard-coded map (read from the bundle; my annotation is in `notes/`):

| Format | Options exposed |
|---|---|
| project | *(none)* |
| pdf | `sheet` (paper, scale, Cover / Floor plans / Sections A-A & B-B / Elevations, title block, per-sheet notes) |
| ifc | `schema` (IFC4 / IFC2X3), `costSchedule`, `level`, `selection`, `terrain` |
| glb | `level`, `selection`, `terrain`, `vegetation`, `visible`, `compression`, `textures` |
| gltf | glb's set **+ `zip`** |
| obj | `level`, `selection`, `terrain`, `visible`, `zip` |
| stl | `level`, `selection`, `terrain`, `visible` |
| dxf | `dxfLevel` (single level only) |
| svg | `dxfLevel` (single level only) |
| csv | `level`, `selection` |
| png | `pngWidth` |

Defaults observed in the shipped bundle: `level:"all"`, `selectionOnly:false`, `terrain:"auto"`,
`vegetation:true`, `visibleOnly:false`, `compression:"none"`, `textures:"keep"`, `maxTexture:2048`,
`quality:85`, `zip:true`, `pngWidth:2560`. Compression choices are none/Draco/Meshopt; textures
keep/resize/WebP/JPEG with a 512–4096/no-limit cap. These are the options that decide whether a
download is one file or several (see F3 obj/gltf).

---

## 3. Ideas for CasaPlazAI

CasaPlazAI today: single-page Vite/TS/Three.js, no backend, plan autosaves to localStorage, PNG/JPEG
export only, single-workspace UI redesign in progress. The schema is `FloorplanData` v1
(`rooms[].polygon` CCW in metres, `openings[]` on a `segmentIndex` with normalised `tCenter`,
`furniture[]` with `footprint`/`rotationDeg`, `wallHeight`/`wallThickness`, plus out-of-schema
underlay at `casaplaza.underlay.v1` and snap settings).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Server-free SVG plan export.** The single highest-leverage export for a no-backend app: 3DHP's SVG is a *sheet* (rooms fill, wall polygons, opening symbols, area labels, dimension lines with rotated text, scale bar, north arrow, title) and every input exists in `FloorplanData`. Derive wall faces from `rooms[].polygon` + `wallThickness` exactly as the renderer already does, place openings at `tCenter*L ± width/2` on each `segmentIndex`, emit `<g id="rooms|walls|doors|windows|furniture|labels|dimensions|sheet">` in that order so downstream consumers (print, Inkscape, Illustrator) can toggle layers. One function, no dependency. | High | Low–Med | F5, F2 |
| 2 | **Per-format option matrix + a single export dialog.** Copy the *pattern* of a hard-coded `{format: [optionKeys]}` map driving one dialog with a format radiogroup, a file-name field with a fixed extension suffix, and a footer that states where the file is produced. Even with only PNG/JPEG/SVG/CSV today this makes the export area extensible and self-describing during the UI redesign. | High | Low | F1, F4 |
| 3 | **CSV quantity/cost schedule.** 3DHP's CSV is a flat, BOM'd, delimiter-per-locale table with `Level;IFC class;Name;GlobalId;Material;Length;Height;Width;Area;Volume;Unit;Unit price;Cost;Phase`. Recompute the same quantities from `FloorplanData`: wall area = segment length x `wallHeight` (minus opening cut-outs, which the schema makes exactly computable), room area from the shoelace of the CCW `polygon`, furniture counts by `type`. Emit `,`/`;` and BOM by locale. Cheap and a differentiator for renovation users. | Med-High | Low | F5 |
| 4 | **Width presets + PNG/JPEG quality on the existing canvas export.** 3DHP renders the PNG off a Babylon render target at a chosen pixel width and scales the height to the canvas aspect (verified: 1024→1024x640, 5120→5120x3200, 6.2 MB). CasaPlazAI can do the same with a `WebGLRenderTarget` at 1920/2560/3840/5120 and keep the current PNG/JPEG toggle. | Med-High | Low | F3 |
| 5 | **DXF R12 of one level.** 3DHP's DXF is deliberately minimal and therefore easy to imitate: `$ACADVER AC1009`, `$INSUNITS 6`, `$EXTMIN/$EXTMAX` from the plan bounds, one `LAYER` table, and the whole plan as 2D `LINE`s (two faces + two end caps per wall, mitred) plus one `TEXT` for the room area. No 3D entities. For CasaPlazAI this is ~150 lines of string building over the same wall-face derivation used for PNG, and it opens in every CAD package. | Med | Med | F5 |
| 6 | **Sheet-style PDF via the browser's own print pipeline (or a tiny vector PDF writer).** 3DHP's PDF is genuinely vector (`m/l/c/f/S` + `Tj`), so a screenshot-PDF would be a visible downgrade. If a backend is off the table, emit the same SVG as idea 1 and let the user "print to PDF" from the browser at A3/A4 with the SVG's `@page` CSS — zero dependencies, vector output, and the SVG doubles as the print artefact. | Med | Low–Med | F5 |
| 7 | **XLSX-style multi-sheet workbook as a "richer CSV".** 3DHP ships Budget/Rooms/Doors/Windows/Walls sheets, lazily loading SheetJS from a CDN. For CasaPlazAI a single-sheet CSV (idea 3) captures most of the value; a multi-sheet workbook is only worth it if budget/pricing is added, and a CDN dependency contradicts the no-backend stance. | Low | Low-Med | F3 |
| 8 | **IFC export — defer.** 3DHP's IFC is a real, standards-conformant IFC4 file (project/site/building/storey hierarchy, unit assignment, quantity sets, view definition) and it is generated *server-side*. Reproducing it client-side is a large, error-prone effort (schema versioning, GUIDs, representation contexts, psets) for an app whose geometry is 2D rooms + a closed 7-type furniture enum. Not worth it until BIM exchange is a stated user need. | Low | High | F5, F4 |
| 9 | **"Where is this file made?" footer + explicit provenance.** 3DHP states the production locus in the UI ("Files are created in your browser." vs "Made on our server…"). Since CasaPlazAI is 100% local, say so in the export dialog — it is a trust feature that costs one line of copy and matches a competitor's clearest UX signal. | Med | Very low | F1, F4 |
| 10 | **Blueprint-underlay in the SVG export.** 3DHP's SVG omits the imported plan image. CasaPlazAI's underlay is deliberately outside `FloorplanData` (`casaplaza.underlay.v1`, omitted from share links by construction), so an SVG export must decide explicitly: either embed the underlay as a base64 `<image>` at its traced transform, or omit it and say so in the dialog. Decide once, in the export code, rather than letting it silently disappear. | Med | Low | F5 (schema note) |

Lower priority: BCF (issue packages need a model-check subsystem first) and the AI vectoriser fall
outside this question.

---

## 4. Unknowns

- **The exact "12th format".** The dialog enumerates 11; I verified three *additional* export
  surfaces (XLSX, BCF, 2D-planner SVG). Which one the "12 formats" figure counts is not stated
  anywhere in the UI or docs, so the count is ambiguous rather than wrong.
- **Server-side output quality on a real model.** All artefacts here come from a 5 m x 4 m, 5-element
  plan. I did not test a multi-storey plan, curves, roofs, terrain, a selection-only export, a
  section/elevation PDF, Draco/Meshopt compression, or a texture-heavy glTF, so the fidelity of those
  paths is unverified.
- **Server limits.** The 25 MB/413 wording, 429 rate-limit handling and any server-side size cap are
  read from client code (round 1) and were not exercised; no request came close to the limit.
- **PDF sheet layout detail.** I confirmed 2 pages, A3, vector primitives and one embedded raster, but
  not which of the cover/plan/section/elevation toggles produced which page (I requested cover+plans
  only), nor the automatic-scale algorithm.
- **Whether the same server endpoint is used for other actions.** I saw `budget` and `classify` on
  `api/bim.php`; other actions (e.g. a geometry pre-pass) may exist behind options I did not set.
- **BCF completeness.** I read that BCF builds markup + snapshot per issue, but with no model-check
  issues present the package was empty and I did not inspect a populated `markup.bcf`/viewpoint.
- **XLSX cell contents.** I confirmed the five sheet *names* (Budget, Rooms, Doors, Windows, Walls) and
  the file validity, but not the per-cell formulas/formatting inside those sheets.
- **2D-planner↔editor sync fidelity.** I confirmed the iframe URL, the `FloorplanBridge` method names
  and that its SVG download works, but not how faithfully `setModel/getModel` round-trips the 3D
  model (the iframe in my session showed no walls).
- **Print path.** The 2D planner's `#…-print-button` and the editor's schedule `window.print()` popup
  were seen in markup but not driven.

---

### Source index

- Vendor pages (DOCUMENTED): https://www.3dhouseplanner.com/ (features, FAQ, "Import and export
  anything: IFC DXF GLB glTF OBJ STL SVG PNG CSV JSON", "10+ import / export formats",
  "Export to files and continue later by importing them"), https://www.3dhouseplanner.com/app.php
  (i18n dictionary: `bim.fmt.*`, `io.desc.*`, `io.serverNote`, `io.localNote`, `io.svgUnavailable`),
  https://www.3dhouseplanner.com/2D-Planner/index.php (2D planner markup + `menu.downloadSvg`).
- Round-1 evidence, read-only (OBSERVED):
  `~/dsh-workspaces/rea-3dhouseplanner-2026-10/07-07-save-export-share/` —
  `bundles/deobf/editor__hp-bim.js` (dispatcher, format list, cloud set, option map, builders,
  `HPBIM` public API), `bundles/deobf/editor__hp-editor.js` (`HP3D.buildWall`),
  `raw/app.php.html`, `evidence/07b/exportForm.dom.html`.
- Round-2 evidence (OBSERVED, this folder): `artifacts/` (11 exported files + XLSX + 2D-planner SVG
  + OBJ/MTL/glTF/bin variants), `evidence/r2-api-exchanges.json` (9 `api/bim.php` calls with
  request bodies, response content-types and `Content-Disposition`), `evidence/r2-export-results.json`,
  `evidence/r2-api-surface.json` (`HP3D`/`HPBIM`/`HPGltf`/`HPUI`/`HPSync` surfaces),
  `evidence/r2-probe4.json`, `evidence/r2-probe5.json`, `notes/2dplanner.html`; drivers in `tools/`.

### Licensing note

All observations are of third-party shipped behaviour and of files that app produced for me from my
own trivial plan. No source code was copied into this deliverable; behaviour, data models and UX are
described in original words, and only minimal artefact excerpts (SVG/DXF/IFC lines, CSV rows) are
quoted as evidence. 3D House Planner is proprietary.
