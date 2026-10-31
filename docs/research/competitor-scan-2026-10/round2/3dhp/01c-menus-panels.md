# 3D House Planner — Deep Dive: File, Render, Level, BIM and AI panels

**Job:** 03-01c-feature-inventory-menus-pane (ROUND 2) · **Target:** 3D House Planner editor (`app.php`), https://www.3dhouseplanner.com/
**Question:** List every entry in the **File, Render, Level, BIM and AI** panels and what each does — from code and DOM (no AI called, nothing shared/uploaded).
**Reuses:** `~/dsh-workspaces/rea-3dhouseplanner-2026-10/01-01-feature-inventory/report.md` (round 1) + its evidence, read-only. This round closes its **Unknown #1** (BIM tab contents) and extends its §2.5.1 (File), §2.7 (Render), §2.8 (Level), §2.10 (AI), §2.11 (BIM).

**Legend and tagging convention:**
- **OBSERVED** — read directly from the vendor's shipped code or from a captured DOM; the specific evidence file is named in the sentence or in §2.0 / the tables. **Unless a claim is explicitly tagged otherwise, it is OBSERVED, and the nearest named evidence file is its source.** This is the default because every panel entry below was extracted from de-obfuscated source, and code identifiers are given so each claim can be re-checked.
- **DOCUMENTED** — the vendor's own user-facing copy (label, `title` tooltip, placeholder, `aria-label`), quoted verbatim. Quoted i18n values are DOCUMENTED even when I found them in code, because they are the vendor's words.
- **INFERRED** — my reasoning, explicitly flagged, used for anything the code cannot settle on its own (units factor, backend behaviour, server-side schemas).

> **Method (new this round).** Round 1's captures retained no script bytes, and the app's `js.php` refused a bare `curl` (**403**, logged round 1). In this round a single `curl -L` of `app.php` returned **HTTP 200** with a `PHPSESSID` cookie; replaying the same request with that cookie and a `Referer: .../app.php` header returned every `js.php?f=editor/...` script with **HTTP 200**. All 29 editor scripts were downloaded, de-obfuscated (obfuscator.io string-array with a rotation IIFE), and their string pools resolved to English through the page's own `window.HP_I18N_DATA["app"].dict` (1,678 keys embedded in `app.php`). Every panel entry below is therefore read from the vendor's shipped code, not inferred from a screenshot.
> **Nothing was executed against the vendor's servers beyond loading the page and downloading its own static scripts.** No AI request was sent, no file uploaded, no share link created, no account used.

---

## 1. Summary

- **OBSERVED** The **File panel** (`#hpFileMenu`, 320 px popover) is built in `hp-bim.js` as a literal HTML menu plus a `data-fileact` dispatcher. It has **5 file commands** (`new`, `open`, `save` with `Ctrl-S`, `saveas`, `share view link`), **3 import entries** (`import`, `import floor plan`, `import terrain color map`) and an **11-chip export grid** whose formats are the literal array `["project","pdf","ifc","glb","gltf","obj","stl","dxf","svg","csv","png"]`; it also appends up to **4 "recent project" buttons** (`hp-bim.inline2.js`, evidence `inline/hp-bim.inline2.js`).
- **OBSERVED** Every export format has its own **options whitelist** in code — e.g. `ifc` offers `schema, costSchedule, level, selection, terrain`; `glb/gltf` add `vegetation, visible, compression, textures`; `dxf/svg` only `dxfLevel`; `csv` `level, selection`; `png` `pngWidth` with the fixed steps **1920 / 2560 / 3840 / 5120 px**; `pdf` exposes a full sheet set with title-block fields (`hp-bim.inline2.js`, `io.*` keys).
- **OBSERVED** The **Render popover** (`#hpRenderPopover`, 360 px) is data-driven from one 6-row table: `draft(bolt,cost 1), balanced(tune,2), high(wb_sunny,3), ultra(auto_awesome,4), pathtrace(flare,4), ai(photo_camera,0)` — the cost is a 1–4 "GPU cost" dot strip in the DOM; mode is persisted under `localStorage["hp-render-mode"]` default `balanced` (`hp-render.inline2.js`, `evidence/dom/pretty_hpRenderPopover.txt`).
- **OBSERVED** The **Level panel** (`#hpLevelPanel`, "Floors & grid") is a stack of `hp-range.hp-gui-slider` rows built in `hp-panels.js` with **exact ranges**: visible floors 1–50 (step 1), current floor 0–50 (step 1, label hidden), snap 2–16 (step 2, default 8, displayed **reciprocally** as `1/value` ⇒ "0.125 m"), wall height 0.05–`floorheight` (2.65), wall thickness 0.1–0.4 (0.01), terrain radius 1–30, terrain strength ±0.1, brush radius 1–40, brush strength 0–1, plus `Duplicate level…` injected by `hp-copy.js` with a 7-group "What to copy" checklist.
- **OBSERVED** The **BIM panel** (`#hpBimPanel`, 440 px) has **ten tabs** in code order `model, props, types, qto, schedules, check, norms, efficiency, project, projects`, each delegating to one renderer function (`_0x3c05c2…_0x4cd0bf`); the **AI panel** (`#hpAiPanel`, 440 px) is a chat with a server-driven model `<select>`, 6 canned suggestions, attachment intake, and a **33-entry tool vocabulary** (`ai.t.*`) executed through `window.HPHousePlanner`/`HPAIPlace` against the same scene API as the manual tools (`hp-bim.inline2.js`, `hp-ai-chat.inline2.js`).

---

## 2. Findings

### 2.0 Evidence index (this round)

| Evidence file | What it is |
|---|---|
| `evidence/app.php.html` | Full editor shell HTML fetched with `curl` (2.0 MB); script tags, modals, `window.HP_I18N_DATA`. |
| `evidence/hp_i18n_tables.json` | `{"app":{"lang":"en","dict":{…1678 keys…}}}` extracted from `app.php`. |
| `evidence/hp-bim.json` | Decoder output for `hp-bim.js`: `{raw:{hex→string}, en:{hex→English}, base, rot}`, 2,195 entries (2,192 resolved). |
| `evidence/inline/hp-bim.inline2.js` | `hp-bim.js` with all string/property accesses inlined — File menu, export table, all 10 BIM tabs. |
| `evidence/inline/hp-render.inline2.js` | Render popover: preset table and per-mode scene effects. |
| `evidence/inline/hp-panels.inline2.js` | Level card slider construction. |
| `evidence/inline/hp-ai-chat.inline2.js` | AI panel, model select wiring, tool dispatch loop. |
| `evidence/inline/hp-api.inline2.js` | `window.HPApi` (`api/ai.php`). |
| `evidence/inline/hp-house-planner.inline2.js` | `window.HPHousePlanner` (`api/house.php`). |
| `evidence/dom/pretty_hpFileMenu.txt` | Round-1 DOM of the File popover (all 11 export chips). |
| `evidence/dom/pretty_hpRenderPopover.txt` | Round-1 DOM of the Render popover. |
| `evidence/dom/pretty_hpLevelPanel.txt` | Round-1 DOM of the Level card (ids, ranges, labels). |
| `evidence/dom/pretty_hpBimPanel.txt` | Round-1 DOM of the BIM panel head + all 10 tab buttons. |
| `evidence/dom/pretty_hpAiPanel.txt` | Round-1 DOM of the AI panel (6 model options, 6 suggestions). |
| `evidence/dom/hp*Panel.html`, `hpFileMenu.html`, `hpRenderPopover.html` | Raw HTML subtrees pulled from round-1's `ready_d03_ready_dom.html` (copied here as `round1_ready_d03_dom.html`). |
| `evidence/i18n_*.txt` | The vendor's own English labels, grouped by panel. |

Static profile: 29 `editor/*` scripts; Babylon.js 156 + `ammo/cannon/Oimo/earcut`; jQuery 3.2.1; HPApi/HPSync/HPShare/HPBIM/HPEfficiency/HPAIPlace/HPHousePlanner globals; `PHPSESSID`-only identity (matches round 1).

---

### 2.1 FILE panel — every entry and what it does

`#hpFileMenu` is a `div.hp-popover` of width **320 px** created by `HPUI.createPopover({id,width})` and rendered by `_0x17f808()` in `hp-bim.js`. That function assigns one literal `<div class="hp-menu">…</div>` template (`hp-bim.inline2.js`), in this order: `new`, `open`, `save` (`<kbd>Ctrl S</kbd>`), `saveas`, then a `share` button **only if `window.HPShare` exists**, then `<div class="hp-menu-sep">`, `import` (with `<small>IFC, DXF, GLB, OBJ, STL, JSON</small>`), `data-hp-open="modalplan"`, `data-hp-open="modalheightmap"`, one `export` button, then a `<div class="hp-export-grid">` produced by mapping the format array, and finally a `bim.recent` block that maps the first 4 saved projects. It then binds `[data-fileact]` → the dispatcher, `[data-open]` → open-project, and `[data-hp-open]` → just closes the popover (so the modal is opened by whatever observes that attribute elsewhere).

**Commands** (handler `_0x2909f4(verb)` dispatches on the `data-fileact` value; `hp-bim.inline2.js`):

| # | Label (DOM/DOCUMENTED) | `data-fileact` | What the code does |
|---|---|---|---|
| 1 | **New project** (`note_add`) | `new` | Confirms first — `bim.confirmNew` = "Start a new project? Unsaved changes of the current one will be lost." — then calls `_0x19a879()` to reset the project. |
| 2 | **Open…** (`folder_open`) | `open` | Switches the BIM panel to the `"projects"` tab, opens the panel and calls the project picker (`_0x86fff3`). |
| 3 | **Save** (`save`, `Ctrl S`) | `save` | Calls `_0xfcb50d()` (save to browser storage). |
| 4 | **Save as…** (`save_as`) | `saveas` | Dialog pre-filled with `HPUI.getProjectName()`; on OK calls `setProjectName(v)` then saves. |
| 5 | **Share view link** (`share`) | `data-share-link` | Only emitted when `window.HPShare` exists; label key `share.menu`, sub-copy `share.menu.d` = "Anyone with the link sees the project in 3D, without editing". I did **not** create a link. |
| 6 | **Import…** (`upload_file`) | `import` | `<small>` advertises **IFC, DXF, GLB, OBJ, STL, JSON**; calls `_0x5dd0dd()` (the import modal). |
| 7 | **Import floor plan** (`business`) | `data-hp-open="modalplan"` | Label `fab.importPlan` = "Import floor plan"; targets `#modalplan` (the AI floor-plan converter; see 2.5). |
| 8 | **Import terrain color map** (`terrain`) | `data-hp-open="modalheightmap"` | Label `fab.importColorMap` = "Import terrain color map"; targets `#modalheightmap`. |
| 9 | **Export…** (`file_download`) | `export` | Label `io.exportMenu` = "Export…"; opens the export dialog (`_0x18d0e1`) with the format grid below. |

**Export grid — 11 chips** (all 11 verified in the round-1 DOM as `data-fileact="export:<fmt>"`, plus the parent `data-fileact="export"` menu item). Literal array in code: `["project","pdf","ifc","glb","gltf","obj","stl","dxf","svg","csv","png"]`. Each chip's label is the i18n key `bim.fmt.<fmt>`:

**OBSERVED** labels: `Project (.hpbim.json)`, `PDF sheets`, `IFC 4 (BIM)`, `GLB`, `glTF`, `OBJ`, `STL (3D print)`, `DXF plan (CAD)`, `SVG plan`, `CSV schedule`, `PNG image`.

Two parallel code tables describe each format (`hp-bim.inline2.js`):

- **Icons:** `project:save, pdf:picture_as_pdf, ifc:account_tree, glb:view_in_ar, gltf:layers, obj:category, stl:print, dxf:architecture, svg:timeline, csv:table_view, png:image`.
- **Default file names (`_0xc8f660`):** `.hpbim.json`, `-sheets.pdf`, `.ifc`, `.glb`, `.gltf`, `.obj`, `.stl`, `.dxf`, `-plan.svg`, `-schedule.csv`, `.png`.

**Five formats are server-made, the rest are local.** `_0x28860=["pdf","ifc","dxf","svg","csv"]` is the "server" list: when the selected format is in it, the dialog footer shows `io.serverNote` — *"Made on our server from a copy of the model; nothing is stored."* with a `cloud` icon; otherwise it shows `io.localNote` — *"Files are created in your browser."* with a `lock` icon. So `project, glb, gltf, obj, stl, png` are pure client-side downloads, while the CAD/BIM/spreadsheet outputs involve a round-trip. **INFERRED:** the server formats are posted to the same PHP host that serves `api/ai.php`; the copy also implies a `io.tooLarge` guard (25 MB), `io.serverDown`/`io.serverError` states, and progress strings (`io.sheet.preparing`, `io.sheet.drawing`, `io.compressing`). I did not trigger any server export.

**Per-format options (`_0x33352c`), read from code** — the export dialog renders a checkbox/select per key:

| Format | Options in code | Reading |
|---|---|---|
| `project` | *(none)* | whole project; note `io.note.project`: "Everything: elements, levels, BIM data, budget, terrain and camera." |
| `pdf` | `sheet` | sheet set: cover+area schedule, floor plans, sections A-A/B-B, four elevations, objects, scale, paper, title block. `io.sheet.*` + `sheet.*`: author, client/licence, notes, section positions as % of the building, A4…A0/letter/Tabloid. |
| `ifc` | `schema, costSchedule, level, selection, terrain` | IFC schema choice, include `IfcCostSchedule`/`IfcCostItem` budget lines, level filter, selection-only, include terrain. Label `io.desc.ifc`: "BIM exchange (Revit, ArchiCAD, BIMcollab…)". |
| `glb` | `level, selection, terrain, vegetation, visible, compression, textures` | single-file model for web/AR/Blender. |
| `gltf` | `level, selection, terrain, vegetation, visible, compression, textures, zip` | `.gltf + .bin + textures`. |
| `obj` | `level, selection, terrain, visible, zip` | meshes + `.mtl`. |
| `stl` | `level, selection, terrain, visible` | solid mesh for 3D printing. |
| `dxf` | `dxfLevel` | "CAD plan of one level"; `io.fmt.dxf` = "DXF plan: lines become walls"; `io.dxfThickness` cm. |
| `svg` | `dxfLevel` | `io.note.svg`: "The current level, drawn by the 2D planner"; blocked until the 2D planner has run (`io.svgUnavailable`). |
| `csv` | `level, selection` | quantities + costs spreadsheet. |
| `png` | `pngWidth` | fixed choices `1920 px (Full HD) / 2560 px / 3840 px (4K) / 5120 px`; `io.quality` image quality. |

**Shared export controls** (from code + `io.*`): format radio list (`input[name="hpIoFormat"]`), level `<select>` (`io.allLevels`, "All levels"), `io.selectionOnly` "Selected element only", `io.visibleOnly`, `io.terrain`, `io.vegetation` (greyed unless terrain; `io.vegetationOff` hint), geometry compression `io.comp.none / meshopt / draco`, textures `io.tex.keep / io.tex.resize`, `io.maxTexture` (`io.noLimit`), `io.zip`, `io.fileName`, footer **Cancel** / **Export** (`data-io="cancel"|"export"`). The last-used settings are persisted to `localStorage["hp-io-export"]`, with `fileName` deleted before storing.

**Recent projects:** `_0x8b1b8c` (the cached project list) is rendered after the export grid under a `bim.recent` heading (= "Projects in this browser") — up to **4** buttons (`slice(0,4)`) with `data-open="<id>" data-name="<name>"`, using icon `restore` for the currently-active id and `home_work` otherwise. Clicking one calls `_0x3b4a3e(id, name)`, which closes the menu, asks `bim.confirmOpen` ("Open \"{name}\"? Unsaved changes of the current project will be lost.") only when there are unsaved edits (`_0x5065cc`), then loads the project. (The same list also backs the BIM panel's `projects` tab. Round-1's File-menu DOM had no such buttons because it was captured on a fresh profile with no saved projects — the block is conditional on `_0x8b1b8c.length`.)

---

### 2.2 RENDER panel — every entry and what it does

`#hpRenderPopover` is a `div.hp-popover` of width **360 px** (`HPUI.createPopover({id:"hpRenderPopover",width:0x168})`) built from the array `_0x1b4314` in `hp-render.js` and the section titles `render.sec.quality / photo / show / light / share` (`render.sec.share` = "Capture and share").

**Real-time quality — 6 presets, one table** `{id, icon, cost}`, rendered as `button.hp-quality-btn[data-mode]` with the tooltip and a `span.hp-cost[title="GPU cost"]` containing **4** `<span>` pips toggled by class `on` (confirmed in the DOM: `draft` has 1 `on`, `balanced` has 2):

| Preset | id | icon | GPU-cost dots | Tooltip (DOCUMENTED via `title=`) |
|---|---|---|---|---|
| Draft | `draft` | `bolt` | 1 | "Fastest. Lower resolution, no shadows." |
| Balanced *(default)* | `balanced` | `tune` | 2 | "Original look. Soft shadows on the ground." |
| High | `high` | `wb_sunny` | 3 | "Shadows everywhere, ambient occlusion, tone mapping, depth of field." |
| Ultra realistic | `ultra` | `auto_awesome` | 4 | "Reflections, contact shadows, 4K shadow map. Needs a good GPU." |
| Path tracing | `pathtrace` | `flare` | 4 | "Real light bounces (global illumination) computed in your browser. From a few seconds to minutes." |
| AI photo | `ai` | `photo_camera` | 0 | "Photorealistic image of this camera made by AI (cloud)." |

The popover keeps one `hp-active` class on the current preset; mode persists in `localStorage["hp-render-mode"]` (default `balanced`). `hp-render.js` also has a "view is slow ({n} FPS), try a lighter mode" warning (`render.slow`).

**Scene effects per preset** (OBSERVED in `hp-render.inline2.js`):
- `draft` → `lights[...].shadowEnabled = false`; nothing else.
- `balanced` → shadow map kept at original size; `useBlurExponentialShadowMap` restored from the saved `original.shadow` snapshot.
- `high` → `usePercentageCloserFiltering = true`, `filteringQuality = ShadowGenerator.QUALITY_HIGH`, `bias 0.0015`, `normalBias 0.02`, `darkness 0.15`.
- `ultra` → contact-hardening shadows (`contactHardeningLightSizeUVRatio 0.03`), shadow map resized to **4096**; `high` uses **2048**, otherwise the original size; plus image-processing (**tone mapping**, exposure saved/restored in `original.imageProcessing`), **bloom** (`bloomThreshold 0.88`, `bloomWeight 0.15/0.22`, `bloomKernel 48`), and **depth of field** (`DepthOfFieldEffectBlurLevel.Medium`), reflections/SSR, SSAO. Meshes get `receiveShadows=true` via a `onNewMeshAddedObservable` observer so new geometry joins the shadow pass.
- `pathtrace` / `ai` are not engine modes — they open dedicated surfaces (`render.pt.*` and `render.ai.*`).

**Photorealistic image — 2 entries:** `Path tracing` (`data-mode="pathtrace"`, subtitle "Real bounced light, in the browser") opens the path-traced view with its own controls (`render.pt.bounces`, `.samples`, `.denoise`, `.bloom`, `.exposure`, `.image size`, `.download PNG`, quality steps preview/good/final); `AI photo` (`data-mode="ai"`, subtitle "Generated by AI in the cloud") opens the cloud render (`render.ai.prompt/style/model`, styles Automatic/Dusk/Exterior/Interior/Sketch, before/after slider, `render.ai.credits`). **I did not invoke either.**

**Show in the scene — 3 switches:**
1. `Dimensions in 3D` (`hp-opt-dims`) — reveals a 4-checkbox sub-panel (`hp-dims-opts`): Walls and overall size, Doors and windows, Room areas, Heights.
2. `Contour lines on the terrain` (`hp-opt-contours`).
3. `Vegetation and water on the painted terrain` (`hp-opt-veg`) — needed by the `vegetation` export option.

**Sun and materials — 2 entries:**
- `Sun study` (`hp-opt-sun`, `chevron_right`) → date/time/shadows/sun-path panel (`hpSunCard`, `sun.*`: 21 Dec/21 Jun/Equinox, play day/year, hours-of-sun ground/room maps, true north from the Project tab).
- `Realistic materials (PBR)` (`hp-opt-pbr`) → "Convert materials" button; `render.pbr.hint`: turns classic wall/floor/object materials into physically based ones ("Best with High / Ultra"), reports "`{n}` materials converted to PBR".

**Capture and share — 5 entries:** `Share view link` (`hp-opt-link`) + 4 capture buttons `hp-share-btn`:
`4K image` (`data-capture="snapshot"`), `Video` (60 s), `Camera tour`, `AR`. DOCUMENTED titles: "Snapshot (4K)", "Record video (60 s)", "Camera tour", "View in augmented reality".

---

### 2.3 LEVEL panel — every entry and what it does

`#hpLevelPanel` is `section.hp-fcard.hp-dockcard` titled **"Floors & grid"** (`gui.scene` = "Floors & grid", `layers` icon) — created by the local helper `_0x3614dd(id, extraClasses, title, icon)` in `hp-panels.js`, which returns `<section class="hp-fcard …"><div class="hp-fcard-head">…</div><div class="hp-fcard-body">…`. The sliders are built by `_0x547e34(headerText, opts)`; each call returns `[headerLabel, slider]` and the object `_0x567071` exposes them by name. Exact options (**OBSERVED**; the min/max/step below were cross-checked against the round-1 DOM's rendered `<input type="range">` attributes):

| Slider (code id) | Label key | min | max | step | default |
|---|---|---|---|---|---|
| `floorvisibilityheader` / `floorvisibilityslider` | `gui.visibleFloors {n}` — "Visible floors: up to 50" | 1 | 50 | 1 | 50 |
| `floorheader` / `floorslider` *(block shown, label hidden)* | `gui.currentFloor {n}` — "Current floor: 0" | 0 | 50 | 1 | 0 |
| `snaptogridheader` / `snaptogridslider` | `gui.snap {v}` — "Snap to grid: 0.125 m" | 2 | 16 | 2 | 8 |
| `wallheightheader` / `wallheightslider` *(hidden)* | `gui.wallHeight {v}` — "Wall height: 2.65 m" | 0.05 | `floorheight` (2.65) | 0.05 | floor height |
| `wallthicknessheader` / `wallthicknessslider` *(hidden)* | `gui.wallThickness {v}` — "Wall thickness: 0.20 m" | 0.1 | 0.4 | 0.01 | 0.2 |
| `terrainradiusheader` / `terrainradiusslider` *(hidden)* | `gui.terrainRadius {v}` — "Terrain radius: 5.00 m" | 1 | 30 | 1 | 5 |
| `terrainstrengthheader` / `terrainstrengthslider` *(hidden)* | `gui.terrainStrength {v}` — "Terrain strength: 0.01" | −0.1 | 0.1 | 0.01 | 0.01 |
| `terrainpaintradiusheader` / `terrainpaintradiusslider` *(hidden)* | `gui.brushRadius {v}` — "Brush radius: 0.8 m" | 1 | 40 | 1 | 5 |
| `terrainpaintstrengthheader` / `terrainpaintstrengthslider` *(hidden)* | `gui.brushStrength {v}` — "Brush strength: 1" | 0 | 1 | 0.1 | 1 |
| `copytofloorheader` / `copytofloorslider` *(hidden, in the separate **Copy to another floor** card)* | `gui.pasteTo {n}` — "Paste to floor 0" | 0 | 50 | 1 | 0 |

**Only three slider blocks render by default.** The round-1 DOM markup confirms: the `Visible floors`, `Current floor` and `Snap to grid` blocks are emitted *without* `hp-hidden`, while `Current floor`'s own `<label>` carries `hp-hidden` (its input still exists in the DOM) and every other block carries `hp-hidden` on both the block and its label. So the card effectively shows **Visible floors** and **Snap to grid**, with the geometry and terrain rows revealed by the tool card as the matching tool becomes active.

**Units are formatted by `hp-editor.js`, and not all rows are plain metres.** From the `onValueChangedObservable` handlers (and `hp-app.js`, which re-fires `snaptogridslider / wallheightslider / wallthicknessslider / terrainradiusslider / terrainpaintradiusslider` after boot):
- `Snap to grid` = `(1/value * unitsconver).toFixed(3)` → the displayed number is the **reciprocal** of the slider value.
- `Wall height` = slider value × `unitsconver`, `.toFixed(2)`, initialised to the `floorheight` input (default **2.65**, range 2–5, step 0.01).
- `Wall thickness` = value × `unitsconver`, `.toFixed(2)`.
- `Terrain radius` = value × `unitsconver`, `.toFixed(2)`.
- `Terrain strength` = value `.toFixed(1)` (unitless, no `unitsconver`).
- `Brush radius` = `floorSize × (value / 600) × unitsconver`, `.toFixed(1)` (where `#floorsize` defaults to **100**, range 50–1000, step 10).
- `Brush strength` = value `.toFixed(1)`.

**The DOM's `--hp-fill` percentages let me *derive* the raw slider values and cross-check the table above** (since `fill = (value−min)/(max−min)`): Snap = 42.857% ⇒ `(v−2)/14 = 3/7` ⇒ **v = 8**, and the label reads **0.125 = 1/8**, so the reciprocal relation is confirmed observationally, not just inferred. Likewise Wall thickness 33.333% ⇒ v = 0.2; Terrain radius 13.793% ⇒ v = 5; Wall height 100% ⇒ v = 2.65 (its max); Brush radius 10.256% ⇒ v = 5, and `100 × 5/600 = 0.83` matches the "0.8 m" label; Brush strength 100% ⇒ v = 1. Every default in the table is therefore confirmed twice — once in code, once in the rendered DOM.

**INFERRED:** `unitsconver` is 1 for metres and ≈3.28 for feet (matching the `m`/`ft` toggle), so the same sliders re-label in feet; since the whole panel was captured in metres, the ft branch is unverified. Round-1 Unknown #9 (snap value vs. metres) is now **narrowed to the unit factor only**: the reciprocal relation and the raw value are both confirmed, but I did not draw geometry to observe the grid itself. (The round-1 phrasing "0.5 m grid" referred to the raw value 8, not the displayed 0.125 m.)

**Also in the card:**
- **`Duplicate level…`** button. It is *not* in the static card: `hp-copy.js` injects `button.hp-btn.hp-btn-sm.hp-level-copy` (`library_add` + `copy.level.btn`) into `#hpLevelPanel .hp-fcard-body`. Clicking it creates dialog `#hpLevelCopyDialog` (`.hp-dialog`), whose "What to copy" group list is the **7-row array** `_0x4fcd53` — id, icon, default-on:
  `walls` (`view_week`, on), `openings` (`door_front`, on), `floors` (`grid_on`, on), `finishes` (`border_bottom`, on), `objects` (`chair`, **off**), `stairs` (`stairs`, **off**), `roofs` (`roofing`, **off**).
  Each row is a `checkbox[data-group]` with a count; a group is `disabled` with the empty class when the source level has no elements of that kind. Labels come from `copy.group.*` (`finishes` = "Skirting and cornices"). The dialog also has **From / To** selects (`data-lc="from"|"to"`), where the first `to` option is `copy.level.new` = "New level above ({name})" and the rest are existing levels; the destination mode is a radio pair `name="hpLcMode"` = **`add`** ("Add to them") or **`replace`** ("Replace them") shown only when the target already has elements (`copy.level.busy` = "{name} already has {n} elements of these kinds."). Intro text `copy.level.intro` = "Copy walls, openings and floors of a level to another one, for example to start the upper floor."; button `copy.level.go` = "Duplicate"; results `copy.level.done` ("{n} elements copied to {name}") and `copy.partial` ("{n} elements could not be copied").
- The degree-like sliders all start `hp-hidden`; they are revealed by the tool card while the matching tool is active (`copy.el.*`/`gui.*` copy-and-paste affordances: `gui.copyMaterial`, `gui.pasteMaterial`, `gui.copyHint` = "Choose what to copy in the tool card: walls, floors, doors/windows or material."). That is why round-1's DOM saw only 3 visible rows.

**Top-bar Level stepper** (in `hp-ui.js`, outside the card): `.hp-level-down` → `setLevel(currentLevel()-1)`, `.hp-level-up` → `setLevel(currentLevel()+1)`, `.hp-level-value` shows the number, `ui.levelTip` = "Current level: new walls, floors and objects go here". The same file wires the **2D/3D/Walk** view buttons (`data-view`) to the `viewcheck`/`cameracheck` checkboxes, and the **2D planner** button clicks `#open2DPlanner` (the round-1 `2D-Planner/index.php` iframe). Unit indicator (`m`/`ft`) sits in `[data-unit]`.

---

### 2.4 BIM panel — every entry and what it does

`#hpBimPanel` is an `aside.hp-panel` `role="dialog"` `aria-label="BIM model"` (`account_tree`), width **440 px** (`HPUI.createPanel({id:"hpBimPanel",width:0x1b8,title:"BIM model",icon:"account_tree"})`), created in `hp-bim.js`. **Head:** title, **Undo** (`data-undo="undo"`, title `Undo (Ctrl+Z)`) and **Redo** (`data-undo="redo"`, `Redo (Ctrl+Shift+Z)`), both `disabled` on an empty project, and **Close**. The **ten tabs** are literal buttons `data-tab=…`; the dispatch chain in code maps each to one function:

| # | Tab (i18n) | `data-tab` | Renderer | What it shows / does |
|---|---|---|---|---|
| 1 | **Model** | `model` | `_0x3c05c2` | IFC-classifies elements (async if missing), then renders a **tree**: site `landscape` → building `domain` with a **"show all"** (`data-act="showall"`, `bim.showAll`) and one `<details class="hp-tree-level">` per level, each element a `hp-tree-node`. Empty → `bim.empty` ("Draw walls, open the 2D planner or ask the AI assistant…"). |
| 2 | **Properties** | `props` | `_0x31964b` | Inspector for the selected element: Name (`data-field="name"`), **Class** select, IFC class, **material** (`data-open="material"`), **fire rating** (`data-open="fireRating"`), **sill** (`data-open="sill"`), **swing** (`bim.swing.double/fixed/left/pivot/right/sliding`), room fields (`data-room="name/number/ceilingHeight/finishes.wall/finishes.floor/finishes.ceiling"`), **layers** (`bim.layers`, `data-act="ly-add"/"ly-del"`, material + category + thickness, with `layerOrderWall` "exterior (side A) to the interior" / `layerOrderSlab` "top to bottom"), **unit price**, **Measurements/quantities** table (`bim.q.*`), and **Add/Delete property** (`data-act="addprop"/"delprop"`). |
| 3 | **Types** | `types` | `_0x2e7d7f` | Layered wall/slab/roof/covering types (`bim.typesHint`): class `<select class="hp-ty-newclass">` + **New type** (`data-act="ty-add"`, `bim.typeNew`, `bim.typeNewName`), grouped by IFC class, each with `bim.typeUsed` element count and delete (`bim.typeDeleteConfirm`). Seed names: `bim.typeSeed.masonry/drywall/slab/roof` (Masonry 14 cm + plaster, Drywall 9.5 cm, Solid slab 10 cm + screed + flooring, Ceramic tile roof). |
| 4 | **Quantities** | `qto` | `_0x2a27e8` → `_0x2fd612` | Computes quantities (`bim.calculating`) and renders **collapsible rows** (`data-act="qto-expand"`). Quantity vocabulary `bim.q.*`: Count, Length, Width, Height, Depth, Thickness, Area, Perimeter, Radius, Volume, Gross/Net/Cut/Fill volume, Gross footprint/side area, Inner/Outer/Net side area, Opening area. Footer buttons in code: `data-act="csv"` (`table_view` + `bim.exportCsv`), `data-act="qto-xlsx"` (`grid_on` + "XLSX"), `data-act="print"` (`print`). Toggle "not in total" (`bim.notInTotal`). |
| 5 | **Schedules** | `schedules` | `_0x5878a7` → `_0x48b37a` | Schedule "by class": `bim.sched.walls/doors/windows/rooms`, group-by (`bim.groupBy.class/level/phase/room`), phases (`bim.phase.existing/new/demolish/temporary`, `bim.allPhases`), sorting (`data-act="sched-sort"`), reload (`sched-reload`), export CSV/XLSX (`sched-csv`/`sched-xlsx`, `bim.exportCsv`/`bim.exportXlsx`), `bim.schedUnavailable`. |
| 6 | **Check** | `check` | `_0x1a89ed` → `_0x90a459` | Model check. Header: title + optional **"Stale"** badge (`bim.stale`, `bim.staleHint` on the checked date) and a **Check the model / Check again** button (`data-act="runcheck"`, `bim.runCheck`/`bim.rerunCheck`, `bim.checkedAt`). Issues (`bim.issue.*`): duplicate wall, duplicate element, floating, level with rooms but no door, room without window, opening not in a wall, opening overlap, element overlap, very short/thin wall; each row has `data-act="issue"` (zoom to it) plus a `.hp-issue-other` "select other" affordance. **BCF (BIM Collaboration Format)**: `data-act="bcf-export"` (`bim.bcfExport`), `data-act="bcf-import"` (`bim.bcfImport`), and a topics panel with `data-act="bcf-topic"` (`bim.bcfTopics`, `bim.bcfLoaded`, `bim.bcfNotFound`, `bim.bcfNothing`); the package is a `.bcfzip` and topics may carry a thumbnail (`bcf-thumb`). |
| 7 | **Codes** (norms) | `norms` | `_0x4074de` → `_0x19d519` | Building-code advisor. **Country** select (`data-norms="country"`, `norms.countryHint` = "Rules, reference prices and model checks follow this country."), **Lot**: area / max coverage / max FAR (`data-norms="lot.area|lot.coverage|lot.far"`), per-room-type minima (`norms.room.*` — bedroom, bathroom, kitchen, corridor, entrance, garage…; `norms.req.area/width/height/light/vent`), **Electrical** (`norms.electrical`; dedicated circuits `norms.ded.*`, 26 labels such as "20 A bathroom circuit", "induction hob (200 V)"), **Plumbing** (`norms.plumbing`; fixtures `norms.fix.*` — basin, bathtub, bidet, dishwasher, shower, kitchen sink, laundry sink, washing machine), **Reference prices** (`norms.prices`; `norms.currencySet`), **Export CSV** (`data-act="norm-csv"`), per-issue select (`norm-sel`), and `norms.disclaimer` ("Reference values summarised from the standards cited…"). |
| 8 | **Efficiency** | `efficiency` | `window.HPEfficiency.render` | Delegates to `hp-efficiency.js`. Six category tabs (`eff.cat.space/solar/light/vent/energy/renew`) and sections `eff.sec.space/rooms/solar/energy/pv/rain/recs`: gross/net floor area, compactness, net÷gross, façade segments, form factor, wet-room stacking; sun on each façade (kWh/m²·y); daylight columns (daylit floor, glazing, shade, hot/cold season, sun/yr); ventilation; heating/cooling need per m² and an estimated class A+–G; PV area/cost/payback; rainwater catchment and dry months; "What to improve". `eff.disclaimer` says it is a simplified estimate. |
| 9 | **Project** | `project` | `_0x3c57ad` | IFC project data: **Storeys** table (`bim.storeyLabel`, Name, `bim.elevation`, `bim.storeyHeight`; rename via `data-act="renamelevel"`), **Site and location** (`site.name`, `site.elevation`, `site.latitude`, `site.longitude`), **Address** (`addr.city/region/postalCode/country/number/street`), **CRS** (`crs.epsg/northings/orthogonalHeight`), **Classification** (`cls.system` select, `cls.edition`, `cls.custom`; `data-act="proj-georef"`, `bim.crsTitle`/`crsHint`), **Ifc schema** (`ifc.schema` IFC4/IFC2X3), **cost schedule** toggle (`ifc.costSchedule`), **true north** (`bim.trueNorth`, consumed by the Sun study), level elevation/height rows (`lvelev`/`lvheight`), and export/budget grouping (`bim.groupBy`, `bim.phasesIncluded`, `sheetBudget`). |
| 10 | **Projects** | `projects` | `_0x4cd0bf` | Browser project manager: **Save / Save as… / New** buttons (same `data-fileact` verbs as the File menu), an **Autosave** switch (`bim.autosave`, persisted to `localStorage["hp-bim-autosave"]`), `bim.partialNote` warning, a `bim.recent` list of saved projects with thumbnails (`data:image/…`), dates and rename/delete/duplicate (`data-act="renameproject/delproject/dupproject"`), `bim.noProjects`. |

**Cross-panel plumbing (OBSERVED):** the File menu's `open` verb jumps to the `projects` tab; `bim.levelName`, `bim.rename`, `bim.delete`, `bim.duplicate`, `bim.guid`, `bim.host`, `bim.focus`, `bim.isolate`, `bim.hide`, `bim.show`, `bim.clearSel`, `bim.selectedN` are the row/tree affordances; storage failures surface as `bim.storageFail`, `bim.noStorage`, `bim.dbBlocked`, `bim.scriptFail`.

---

### 2.5 AI panel — every entry and what it does

`#hpAiPanel` is `aside.hp-panel.hp-chat-panel` `role="dialog"` `aria-label="AI assistant"` (`auto_awesome`), width **440 px** (`HPUI.createPanel({id:"hpAiPanel",width:0x1b8})`), `data-drop-text="Drop files to attach them"` (drag-and-drop target). It is **not** a static HTML form: `hp-ai-chat.js` builds it via `HPUI.createPanel` and fills the actions bar.

**Head actions:**
- **Model `<select class="hp-input browser-default hp-model-select">`**, `title="Model"`. It starts **`disabled`**, then `HPApi.ai.assistant()` (GET `api/ai.php?action=assistant&lang=…`) returns a `models` array of `[id, human-name]` pairs and a `default_model`; the code rebuilds the options and selects the current id (falling back to `default_model` if the stored id is absent), persisting the choice to `localStorage["hp-ai-model"]`. The six options visible in round-1's DOM (`Claude Sonnet 5.5` selected, `Claude Opus 5.5`, `GPT-5.5`, `GPT-6.1 Sol`, `Gemini 3.1 Pro`, `Gemini 3.8 Flash (fast)`) are therefore **server-configured**, with values `claude-sonnet-5-5`, `claude-opus-5-5`, `gpt-5.5`, `gpt-6.1-sol`, `gemini-3.1-pro-preview`, `gemini-3.8-flash`. (The separate `#floorplanAiModel` select in `app.php` is the floor-plan converter's vision-model list, not this one.)
- **New conversation** (`button.hp-new-chat`, icon `add_comment`, `ai.newChat` → clears the log), and the standard panel **Close** button.

**Body:** `<div class="hp-chat-list" aria-live="polite">` (the live region). On an empty conversation it holds:
- Greeting `ai.hello` ("Hi! I build and edit the project with the same tools as you: rooms and whole houses, walls, doors, windows, roofs, furniture from the catalog, textures, terrain and BIM data. Attach a floor plan, a photo or a file to start from it.").
- **6 canned suggestions** as `button.hp-suggestion` inside `div.hp-suggestions`, from the keys `ai.s1…ai.s6`: create a 2-bed house; furnish the living room; wood floor in every bedroom; gable roof; sloped terrain; "Check the BIM model and estimate the cost".
- While running: `ai.thinking`, cancellable (`ai.stop` button icon flips `arrow_upward`→`stop`, class `hp-stop`, panel class `hp-running`, `ai.stopped`, `ai.error`, `ai.done`).

**Footer / composer** (`hp-panel-footer` = `.hp-chat-status` + `.hp-chat-atts` + `.hp-composer`):
- **Attach files** (`button.hp-attach`, icon `attach_file`, `title` = `ai.attach`: "images, plans, IFC, DXF, models, text"); drop handler on the panel (`data-drop-text` = `ai.drop`). Attachments are typed by extension; images are read with `FileReader` and described by a **vision model** (`_0x40864d.vision_model`) via `puter.ai.chat(describe_image, file, false, {model})` — i.e. image understanding runs in the browser through **Puter.js**, while text/plan/IFC files are read as text and passed as project context.
- `textarea.hp-chat-input` (rows 1, `placeholder` = `ai.placeholder` "Describe what to build or change…") and the send button (icon `arrow_upward`, `title` = `ai.send`).
- Footer note **`ai.powered` = "AI by Puter.js · your account"** — the model calls go to the user's own Puter account, not to the vendor.

**Tool vocabulary (OBSERVED, exact).** The local executor is the object literal `_0xc7ed66 = { name: function(args){…}, … }`. Parsing its keys yields **exactly 33 tools**, and the set is *identical* to the 33 `ai.t.*` progress keys — no name in one list is missing from the other. The registry keys (executor) are: `get_scene_info, list_elements, search_catalog, create_house, create_walls, add_opening, place_object, create_custom_object, get_room_layout, check_layout, furnish_room, apply_texture, set_color, generate_texture, create_roof, create_floor, transform_element, delete_elements, set_level, select_element, sculpt_terrain, bim_summary, bim_elements, bim_set_property, bim_set_price, bim_check, export_model, save_project, set_view, import_attachment, add_skirting, remove_skirting, convert_floorplan_image`. Their human labels (`ai.t.*`) are the activity strings shown while a tool runs:

`get_scene_info` (Reading the scene), `get_room_layout` (Reading the room layout), `list_elements` (Listing elements), `search_catalog` (Searching the catalog), `create_house` (Building the house), `create_walls` (Drawing walls), `create_floor` (Making a floor slab), `create_roof` (Building the roof), `add_opening` (Inserting a door / window), `place_object` (Placing an object), `furnish_room` (Furnishing the room), `move/transform_element` (Moving an element), `delete_elements` (Deleting), `select_element` (Selecting), `set_color` (Changing a color), `apply_texture` (Applying a texture), `generate_texture` (Generating a texture with AI), `create_custom_object` (Building a custom object), `add_skirting` / `remove_skirting`, `sculpt_terrain` (Shaping the terrain), `set_level` (Changing level), `set_view` (Changing the view), `check_layout` (Checking the layout), `save_project` (Saving the project), `export_model` (Exporting), `import_attachment` (Importing the file), `convert_floorplan_image` (Converting the floor plan image), and the BIM group `bim_summary` (Reading the BIM model), `bim_elements` (Reading BIM elements), `bim_set_property` (Updating BIM properties), `bim_set_price` (Updating unit prices), `bim_check` (Checking the model).

**Two adjacent AI surfaces belong to the same family** and are opened from the **File** panel, not the AI panel: the **AI floor-plan converter** (`#modalplan`, `fpai.*`: vision-model select, `fpai.openings` insert detected doors/windows, `fpai.textures` apply textures by room type, `fpai.start` "Generate 3D", `fpai.noAi` image-analysis-only) and the **AI texture** dialog (`#modalAiTexture`, `aitex.*`). I did not run them.

**The tool schemas are server-side, not in the code.** The chat wrapper `_0x5a0051` builds each request as `{model, tools: _0x40864d.tools}`, where `_0x40864d` is the cached `HPApi.ai.assistant()` response. So the function.json schemas come from `api/ai.php`; the client only ships the 33 executors. There is also a **degraded mode**: if a chat call throws with a message matching `/tool|function/i`, the code sets a flag, **re-issues the same step with no `tools` parameter**, and thereafter prepends a system note built from the key `no_tools` (templated with the comma-joined tool names) so the model still knows what it can ask for in prose. Attachment text is inlined up to **15,000 chars** (`slice(0,0x3a98)` + "…(truncated)"), and PDF/image attachments are first described by the vision model (`describe_image`, `image_failed` on error). **NOTE — a real limitation:** `no_tools`, `describe_image`, `image_failed`, `attachment_image`, `attachment_model` and `attachment_unknown` are *not* among the 1,678 keys of `HP_I18N_DATA["app"].dict` that `app.php` embeds, and `HPI18N.t()` falls back to returning the key itself, so with the shipped English table those internal strings would render literally (e.g. "describe_image"). **INFERRED:** either an English-keyed table is fetched per language at runtime, or these are latent bugs in the English build.

**Client/server contract (OBSERVED):** `window.HPApi` wraps `api/ai.php` with `get`/`post` (`credentials:"same-origin"`, `Accept: application/json`) and exposes `ai.config(scope)`, `ai.assistant()`, `ai.prompt(kind, params)`; errors carry `error`/`status`/`code` and a `server` flag. `window.HPHousePlanner` wraps `api/house.php` with `plan(options)` (returns `{rooms, walls, doors, windows}`, each room given its caller-supplied `spec`) and `roomType(name)` (memoised). These are the only AI endpoints referenced by the panels.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each ties to a finding above; `FloorplanData` fields are cited where they apply.

1. **Add a real File menu with a format→options table (high value, low effort).** CasaPlazAI already has a PNG/JPEG export. Mirror the *shape* of 3D House Planner's model: one array of formats, an icon map, a filename-suffix map, and a per-format options whitelist so the dialog only shows relevant controls (§2.1). For CasaPlazAI that becomes `png | jpeg | svg | json` (`FloorplanData`) with `pngWidth` steps 1920/2560/3840 and a "created in your browser" footer — no server needed. **Fits:** `schemaVersion`, `units`, `wallHeight`, `wallThickness`, `rooms/openings/furniture` are already exactly what a `.json` project export carries; reuse the same validator/migrator on import (`unsupported-version`/`bad-*` codes) to get "Project (.json)" round-tripping.
2. **Persist panel preferences per key, not in the schema (high value, low effort).** The competitor keeps `hp-render-mode`, `hp-io-export`, `hp-bim-autosave` in `localStorage`, separate from the project. CasaPlazAI's schema doc already ratifies this pattern for `casaplaza.snap.settings.v1` and `casaplaza.underlay.v1`; add `casaplaza.export.settings.v1` and `casaplaza.view.settings.v1` the same way (§2.1, §2.2, §2.4). Zero schema churn, immediately useful.
3. **Rebuild the Level panel as a data-driven slider card (high value, medium effort).** CasaPlazAI has multiple floors and already persists a "grid pitch + master switch" preference (`casaplaza.snap.settings.v1`). Copy the *pattern*: one builder `slider(labelKey, {min,max,step,value,hidden}) → [label,input]`, keep rarely-used rows hidden until their tool is active, and expose a `Duplicate level…` flow with an explicit "What to copy" group list (walls / openings / floors / furniture / finishes) and New-above / Add / Replace choices (§2.3). **Fits:** duplication must rewrite ids because `Room.id`/`Opening.id`/`FurnitureItem.id` are globally unique and `Opening.roomId` is a hard reference (`dangling-ref`); the competitor's group list is a ready-made checklist for that remap.
4. **Ship a lightweight, honest "Quantities" panel (medium value, medium effort).** From `rooms[].polygon` CasaPlazAI can compute the same vocabulary the competitor exposes (`Area, Perimeter, Length, Width, Height, Volume, Count`) with zero new schema; group by room / floor / texture, allow CSV export, and repeat the competitor's own disclaimer verbatim in spirit ("reference values; check local requirements") (§2.4/Quantities, §2.4/Codes). This is the highest-value BIM idea that needs **no** IFC/backend.
5. **Add a "Check" tab driven by existing validation rules (medium value, low effort).** The competitor's issue list is a superset of what CasaPlazAI's validator already knows: duplicate/degenerate geometry, opening-overlap, opening-not-in-wall, very short/thin wall, room without window/door. Surface `validate()` results as a list with click-to-zoom, plus a derived check: `tCenter ± width/2` outside `[0,L]` (`opening-too-wide`), `wallsOverride` below `wallHeight`, roof rules on non-topmost floors (`roof-not-top-floor`, `bad-lean`, `roof-length-mismatch`). **Fits:** the schema's error codes are already stable machine identifiers — render them as the labels.
6. **Adopt the 6-preset render story with an explicit GPU-cost affordance (medium value, medium effort).** CasaPlazAI's Three.js viewer can expose `draft / balanced / high / ultra` as one table `{id, icon, cost}` with a 1–4 dot strip and per-preset tooltips, then implement the same deltas the competitor uses: shadows on/off, PCF vs contact-hardening, shadow-map 2048→4096, tone mapping, SSAO, bloom, depth of field (§2.2). Users get to trade quality for speed on a weak laptop without guessing.
7. **Make "AI" a first-class, sandboxed tool layer over the same editor API (medium value, higher effort).** The competitor's key architectural move is that the AI panel *and* the manual tools call one scene API, and AI tools carry a human-readable progress label (§2.5). For a no-backend app, implement an offline/"assistant-lite" version: a named tool registry (`createRoom`, `addOpening`, `placeFurniture`, `setFloorTexture`, `checkLayout`) that the redesigned **tool card** can also drive, with a structured `tool → JSON` transcript. This keeps AI optional and auditable, and the 33-label vocabulary is a good checklist for what a floorplanner assistant must be able to do. Do **not** ship cloud AI without a clear, user-owned credential story (`ai.powered`: "AI by Puter.js · your user account").
8. **Reuse the competitor's panel shell pattern (low value, low effort).** `createPanel({id,title,icon,width,toolId,onOpen})` + `isOpen()`/`close()`/`body`/`foot`/`actions`, a single `Escape`/outside-click close loop, and a tool bar where each entry is `{id,icon,label,title,order,onClick}` (§2.1/§2.4/§2.5 evidence). CasaPlazAI's "tool card + inspector" redesign maps onto this directly.

---

## 4. Unknowns

1. **No AI call, no upload, no share link, no account** — so the AI tool registry's *parameter schemas*, the `api/ai.php`/`api/house.php` payloads and the share-link backend are documented from code signatures and UI copy only, never exercised. The 33 `ai.t.*` labels are the vendor's own progress strings, not proof that each tool exists server-side.
2. **The AI model list is server-provided.** The six options in round-1's DOM came from `HPApi.ai.assistant()`; the code rebuilds the `<select>` from that response, so the live set can differ at any time. The `#floorplanAiModel` select in `app.php` (Gemini/GPT/Claude vision models) is a *different* list.
3. **Snap-slider units.** The code proves the display is `1/value × unitsconver` and the slider domain is 2–16; the DOM shows "0.125 m" with `--hp-fill` 42.857% (= 6/14, consistent with `value = 8`). The exact metres-per-unit factor (`unitsconver`) was not exercised by drawing geometry, so this narrows rather than fully closes round-1 Unknown #9. (Relatedly: `Brush radius` is a *derived* readout, `floorsize × value/600`.)
4. **Render/export runtime behaviour was not executed.** Shadow-map sizes, bloom constants and path-trace quality steps are read from source; I did not watch a render. "4K image", "Video (60 s)", "Camera tour" and "AR" are DOCUMENTED buttons whose implementations live in `hp-share.js`/`hp-tour.js`/`hp-ar.js` (downloaded but only skimmed).
5. **De-obfuscation remit.** I decoded the string pools of all 29 scripts, but `hp-editor.js` (691 KB, the engine) and `hp-bim.js`'s large async blocks were only sampled. Property *values* that are produced by arithmetic inside the string-array rotation IIFE could in principle be mis-resolved; I spot-checked the values I cite against the round-1 DOM and against the page i18n table, but a full symbolic pass is out of scope.
6. **BIM IFC mapping depth.** The Model/Properties/Types/QTO tabs clearly build an IFC-flavoured model (`IfcDoor`, `IfcSpace`, `IFCELEMENTQUANTITY`, `IFC2X3/IFC4`, psets, GlobalId, BCF), but the exact class table, pset names and quantity formulas live in very large arrays inside `hp-bim.js` that I sampled rather than enumerated.
7. **Codes/Efficiency data provenance.** `norms.*` and `eff.*` are large per-country rule sets and climate estimates; the source standards are cited in UI copy (`norms.disclaimer`) but the actual tables were not mapped key-by-key.
8. **Accessibility and keyboard behaviour** of these five panels (focus trapping in `hp-popover`/`hp-panel`, screen-reader flow) was not tested — only DOM/`role`/`aria-label` structure was read.
9. **Screenshots were not viewed** (no image input); layout claims come from DOM, CSS class names and code.

---

## 5. Sources

Primary (all fetched this round, HTTP 200): `https://www.3dhouseplanner.com/app.php`; `js.php?f=editor/hp-bim` `hp-render` `hp-panels` `hp-ai-chat` `hp-api` `hp-share` `hp-copy` `hp-dims` `hp-ui` `hp-ux` `hp-sun` `hp-efficiency` `hp-pathtrace` `hp-house-planner` `hp-editor` `hp-editor-tail` `hp-app` `hp-i18n` `hp-ar` `hp-gltf` `hp-linear` `hp-measure` `hp-stairs` `hp-sync` `hp-terrain-detail` `hp-tour` `hp-donate` `floorplan-ai-vectorizer`. Round 1 (`~/dsh-workspaces/rea-3dhouseplanner-2026-10/01-01-feature-inventory/`) supplied the DOM captures reused for §2.1–§2.5 layout facts. Full list in `sources.json`.

**Licensing:** 3D House Planner is proprietary; Sweet Home 3D is GPL; CasaPlazAI is proprietary. No vendor code is reproduced; only behaviour, data shapes and UX are described in my own words.
