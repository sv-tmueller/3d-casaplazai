# 3D House Planner — the `.hpbim.json` / IndexedDB `hp-bim` project document, section by section

Research job `rea2-3dhp-p3/05-07a-save-export-share-project-sc` · CasaPlazAI competitor research · 2026-10-31

**Scope (round 2).** Round 1 (`rea-3dhouseplanner-2026-10/07-07-save-export-share`, cited below as
**R1**) mapped *where* 3D House Planner keeps projects, the eleven export formats, and the share
flow, and listed the serializer's top-level key names as an unknown-depth item. This report closes
that gap: the **complete structure of the `.hpbim.json` document** (and of the two IndexedDB
`hp-bim` records that wrap it), section by section, with a real dumped example.

**Method.** Headless Chrome (Playwright, from the REA-bundled `playwright-core`) enters the editor
through `index.php` → `app.php`, launches with software GL
(`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, per the round-1
lesson that headless WebGL was otherwise dead), dismisses the `#definefloor` modal, and then calls
the **app's own exposed APIs** from `page.evaluate` — `HP3D.buildWall/buildSlab/buildRoof/
placeOpening/placeObject/importPlanImage/buildSkirting/addLevelCeilingTrim`, and
`HPBIM.serialize/save/listProjects/prepareReload/restore/setLevelName/setSite/setCurrency`. This
follows the round-1 lesson that synthetic canvas clicks do nothing and that page-exposed JS is the
reliable handle. The resulting JSON was written to `evidence/`. No account, no AI call, no share
link, no download.

**Evidence in this folder:** `evidence/project-A.hpbim.json` (two floors, walls + slabs),
`evidence/project-B.hpbim.json` (walls, slab, door, window, furniture, roof),
`evidence/project-C1.hpbim.json` / `project-C2.hpbim.json` (before/after a full-section round trip),
`evidence/project-C.full.json` (API surfaces + restore result), `evidence/project-D-idb.json`
(IndexedDB records after Save + recovery draft), `evidence/project-E-plan.json` (plan underlay,
settings, camera), `evidence/project-F-meta.json` (BIM metadata, skirting, ceiling trim),
`evidence/project-G-db-verify.json` (DB payload == serialize), `evidence/project-H-curve.json`
(curved walls, measure filtering), `evidence/project-I-validate.json` (format validation + minimal
envelope), `evidence/project-J-storage-keys.json` (editor storage keys),
`evidence/project-K-keys.json` (key union per kind + 2D-planner bridge),
`evidence/api-surface.json` (HP3D/HPLinear/HPMeasure/HPStairs surface),
`evidence/worked-example.hpbim.json` (complete minimal project, materials elided);
`tools/make*.mjs`, `tools/api2.mjs`, `tools/curve.mjs`, `tools/valid.mjs`, `tools/storage.mjs`,
`tools/keys.mjs` (the scripts that produced them).

Tags: **OBSERVED** (live page state, dumped JSON, or shipped JS with an evidence file) ·
**DOCUMENTED** (vendor URL) · **INFERRED**.

---

## 1. Summary

- **The file is a self-describing envelope of 24 top-level keys** — `format`, `version`, `app`,
  `meta`, `settings`, `camera`, `levels`, `levelInfo`, `site`, `norms`, `sun`, `tour`, `measures`,
  `efficiency`, `classification`, `ifc`, `types`, `budget`, `elements`, `terrain`, `plan`,
  `georef`, `check`, `sync` — produced by `HPBIM.serialize()` (exposed on `window`). `format` is the
  literal `"hp-bim"`, `version` is `1`, `app` is `"3D House Planner"`. *OBSERVED*
  (`evidence/project-B.hpbim.json`; function `_0x11c76b` in `R1 bundles/deobf/editor__hp-bim.js`).
- **`elements[]` is the whole model and is 96.5 % of the bytes** (109.5 KB of a 113.5 KB dump).
  Within an element, Babylon `material` serialization is 69 % and per-wall-face `faces` 25 %;
  the architecturally meaningful data (`wall`/`slab`/`model`/`hp`/`bim`) is a few hundred bytes per
  element. *OBSERVED* (`evidence/project-C1.hpbim.json`, byte census below).
- **Each element is a flattened union over `kind`** with a common `{kind, id, name, level, bim, hp,
  material}` core plus one per-kind payload: `wall` (+`faces`), `slab`, `model` (door/window/furniture
  via a GLB path), `geometry` (raw vertex buffers, for roofs and free-form meshes), `skirting`,
  `ceiling_trim`, `linear` (runs). *OBSERVED* (`evidence/project-C1.hpbim.json`,
  `evidence/project-K-keys.json`).
- **The document is lossless enough to round-trip through `HPBIM.restore()`**: patching
  `levelInfo`, `classification`, `georef`, `check`, `norms`, `ifc`, `efficiency` and `measures` by
  hand and calling `restore()` returned every field verbatim from a fresh `serialize()`. *OBSERVED*
  (`evidence/project-C2.hpbim.json`, `project-C.full.json`).
- **IndexedDB `hp-bim` v2 has exactly two stores, and the wrapper is thin.** `projects` holds
  `{id, name, created, updated, size, data}` where `data` is the JSON *string*; `index` holds
  `{id, name, created, updated, thumbnail(data:image/jpeg;base64), size, autosave}` for listing.
  A recovery draft is a second `projects` record with `id = "__recovery__"` carrying `ofId`.
  Parsing `data` yields byte-for-byte the same 24-key object as `HPBIM.serialize()`.
  *OBSERVED* (`evidence/project-D-idb.json`, `evidence/project-G-db-verify.json`).

---

## 2. Findings

### F1 — The envelope: all 24 top-level keys, with live values

Dumped from a real two-storey project (`evidence/project-B.hpbim.json`). Every key below was
present; the value shown is from that dump.

| Key | Type | Value observed / shape | Meaning |
|---|---|---|---|
| `format` | string | `"hp-bim"` | Selector the importer/share viewer tests before accepting a file. |
| `version` | number | `1` | Schema version of the envelope. |
| `app` | string | `"3D House Planner"` | Producer tag (string, not a URL). |
| `meta` | object | `{id:"pmvwgjc4rcjgjx", name:"Untitled project", created:1793454556203, updated:1793454583569, units:"m"}` | Project identity + unit name. `id` is generated as `"p" + Date.now().toString(36) + 5 random base-36 chars`. |
| `settings` | object | `{floorHeight:2.65, floorSize:100, level:0, renderMode:"balanced", night:false, units:"m"}` | Editable preferences. `floorSize` is the site/terrain size; `night` mirrors the `#lightcheck` checkbox; `units` is duplicated in `meta`. |
| `camera` | object | `{alpha:-1.5708, beta:0.7854, radius:28.28, target:[0,0,0]}` | Arc-rotate orbit camera angles, radius and target. |
| `levels` | object | `{}` or `{"0":"Ground floor","1":"First floor"}` | Sparse map level-index → user storey name. Empty until renamed. |
| `levelInfo` | object | `{}` or `{"0":{elevation:0.3,height:3.05}}` | Per-level override of elevation (`elevation`) and storey height (`height`); absent keys fall back to `floorHeight`. |
| `site` | object \| null | `null` or `{address:{street,number,city,zip,country}, name, crs:{name,eastings,northings,orthogonalHeight}}` | Site/address + CRS block; also carries `latitude`/`longitude` when derived from georef. |
| `norms` | object | `{country:null, lot:{}}` | Which norm/code system the project follows and lot metadata. |
| `sun` | object \| null | `{date:"2026-10-31", minutes:600, tz:null}` | Sun-study state: date, minutes past midnight, explicit tz offset. |
| `tour` | object \| null | `{points:[], seconds:4, continuous:true, hold:1}` | Camera-tour keyframes (`{pos:[x,y,z], target:[x,y,z]}`), clip length, loop, hold time. |
| `measures` | array | `[{kind:"dist", p:[[0,0,0],[6,0,0]]}]` (or `[]`) | Saved measure annotations; `kind` is `dist` (two XYZ points) or `angle` (three). |
| `efficiency` | object | `{}` or `{wall,roof,window,floor,color,zone,occupants,rain}` | Thermal-efficiency inputs. |
| `classification` | object \| null | `{system:"Uniclass 2015", edition, custom, codes:{IfcWall:"EF_25_10"}}` | Classification system + per-IFC-class code map. |
| `ifc` | object | `{schema:"IFC4", costSchedule:false}` | IFC export preference (IFC4 / IFC2X3) and cost-schedule toggle. |
| `types` | array | 4 default entries (see F6) | The project's construction **type catalog**: wall/slab/roof build-ups with layers. |
| `budget` | object | `{currency:"EUR", prices:{IfcWall:120}}` | Currency and per-type/class unit prices. |
| `elements` | array | the model (see F2–F5) | All placeable objects. |
| `terrain` | object \| null | `{modified, imported, textures:[{url,scale}x4], detail:[null,null,null]}` | Terrain heightfield-modification flag, imported flag, 4 splat textures with UV scale, 3 detail-slot overrides. |
| `plan` | object \| null | `{dataUrl, name, width, length, p, q, s, visible}` | The traced blueprint underlay (see F8). |
| `georef` | object \| null | `{source, lengthScale, offset:[x,y,z], frame, crs, storeys:[{guid,name,elevation,level,dy}]}` | Georeference: which import it came from, scale, offset, and the per-storey GUIDs. |
| `check` | object \| null | `{at, stale, issues:[{level,code,text,guid,other}]}` | Cached model-check results with element GUID cross-references. |
| `sync` | object | `{plans:{}, meshless:{}, roofs:{}, meter:60}` | 2D-planner bridge state (see F7). |

**Five** of these are literally `null` on a fresh project — `site`, `plan`, `georef`, `check`,
`classification` — and six more start empty (`levels` `{}`, `levelInfo` `{}`, `efficiency` `{}`,
`norms` `{country:null,lot:{}}`, `measures` `[]`, `tour` `{points:[]}`). A minimal valid document
is therefore roughly
`{format, version, app, meta, settings, camera, norms, sun, ifc, types, budget, elements, terrain, sync}`.

*OBSERVED — `evidence/project-A/B/C1.hpbim.json`; producer function `_0x11c76b()` in
`R1 bundles/deobf/editor__hp-bim.js`.*

**Settings are written unconditionally, without validating against the mode enum.** `HPRender`
declares six modes — `["draft","balanced","high","ultra","pathtrace","ai"]` — yet calling
`HPRender.setMode("quality")` (not in the list) was accepted and `settings.renderMode` then
serialized as `"quality"`. The serializer simply reads `window.HPRender.mode`; it does not check
membership. A consumer must therefore tolerate an unknown `renderMode` string.
*OBSERVED — `evidence/project-E-plan.json` (`renderMode:"quality"`), `evidence/api-surface.json`
(`HPRender.modes`).*

### F2 — `elements[]`: the common element core

Every element is one object with a shared core plus a per-kind payload. The core seen on every
kind is:

| Field | Type | Notes |
|---|---|---|
| `kind` | `wall \| slab \| door \| window \| object \| roof \| skirting \| ceiling_trim \| …` | Set from the element's classifier. |
| `id` | string | Babylon mesh id **class**, not unique: `"wall"`, `"poly"` (slab), `"door_window"`, `"objmeshes"`, `"autoRoof"`. Identity comes from `bim.guid`/`hp.uid`. |
| `name` | string | Babylon name: `"wall_merged"`, `"poly"`, `"door_window_binding-01"`, `"autoRoof"`. |
| `level` | int | Storey index (0-based, 0..50 clamped by `setLevel`). |
| `bim` | object | `{guid, name, ifcClass, psets, props, phase, unitPrice, notes}` — present on **every** element kind (see F5). |
| `hp` | object \| absent | App-private metadata, deep-cloned at serialize time; always has `kind`, usually `level` (see F5). **Absent entirely on `skirting` and `ceiling_trim`.** |
| `material` | object \| null | Babylon material serialization: `{multi:[{single:{…}}]}` for multi-material meshes, `{single:{…}}` otherwise, or `null`. This is the single largest contributor to file size. Also absent on `skirting`/`ceiling_trim`. |

Verified key union per kind (live dump, `evidence/project-K-keys.json`):

| kind | top-level keys | `hp` keys | `bim` keys |
|---|---|---|---|
| `wall` | kind,id,name,level,bim,hp,material,wall,faces | kind,uid,synced,level | all 8 |
| `slab` | kind,id,name,level,bim,hp,material,slab | kind,points,level,name,uid | all 8 |
| `door`/`window` | kind,id,name,level,bim,hp,material,model | kind,level,uid | all 8 |
| `object` | kind,id,name,level,bim,hp,material,model | kind,level,name | all 8 |
| `roof` | kind,id,name,level,bim,hp,material,geometry | kind,level,style,pitch,overhang,uv | all 8 |
| `skirting` | kind,id,level,bim,**skirting** | *(none)* | all 8 |
| `ceiling_trim` | kind,id,level,bim,**ceilingTrim** | *(none)* | all 8 |

`elements` is built by filtering out the `terrain` kind (terrain lives in its own section) and
mapping each remaining mesh through a per-kind serializer; any element whose serializer returns
`null` is dropped. *OBSERVED — `evidence/project-C.full.json`, `project-C1.hpbim.json`;
`_0x18fc72` in the round-1 bundle.*

### F3 — Per-kind payloads

**`wall`** — adds two keys:

- `wall: {a:{x,z}, b:{x,z}, thickness, height, baseY, curve?}` — the centreline (start/end points in
  metres on the ground plane), wall thickness and height, and the base elevation. `curve` is
  **optional and a plain number** — a signed curvature value (`s`) applied to the straight a→b
  segment. Verified live: `HP3D.setWallCurve(mesh, 0.5, 1)` wrote `hp.curve = {s:0.5}` and the
  serializer emitted `wall.curve = 0.5`; a second call with `-0.4` emitted `-0.4`. Both curved
  walls round-trip through the same `wall` block as straight ones.
  *OBSERVED — `evidence/project-H-curve.json`.*
- `faces: [material, …]` — the material of each wall face (observed length 4 for a plain wall:
  two long faces and two ends). With M:N wall-junction mitring this is how per-face finishes
  survive.

Real example: `wall:{a:{x:0,z:0}, b:{x:6,z:0}, thickness:0.2, height:2.7, baseY:2.4e-08}`.

**`slab`** — `hp.points` carries the outline already; the `slab` key repeats it with the drop
elevation: `slab:{points:[{x,z}...], level, y:0.01}`.

**`model`** (doors, windows, furniture, any GLB-backed mesh) —
`model:{path:"/admin/objects/e7bcouch1.glb", center:[x,z], minY, q:[x,y,z,w], s:[x,y,z]}`.
If no `model` is produced the serializer falls back to embedding a full `geometry` block (see
`roof`). Door/window elements share `id:"door_window"` and carry a Babylon binding suffix in
`name`; the model actually placed is resolved by `pickOpeningModel(kind,width)` which returned
`/admin/objects/9mpdoor.glb` for a 0.9 m door and `/admin/objects/z26window.glb` for a 1.2 m
window. *OBSERVED.*

**`roof`** — a *special* case: `edit` in the 3D scene is generated geometry, so a roof element has
no `model` key and instead carries the baked mesh as
`geometry:{positions, normals, uvs, indices, subMeshes, trs:{p,q,s}}`, with the authoring
parameters in `hp` (`{kind:"roof", level, style:"gable", pitch:30, overhang:0.4, uv:2}`).
Observed: 672 position floats / 224 indices for a 6×5 gable. *OBSERVED — `evidence/project-C1.hpbim.json`.*

**`skirting` / `ceiling_trim`** — two element kinds that are restored **after** all other
elements (the loader defers them into a second pass), and that store their data in a **dedicated
top-level key named after the kind** rather than in `hp`. Verified live dump
(`evidence/project-F-meta.json`):

```json
"skirting": {"side":1, "height":0.1, "depth":0.02, "color":"#ffffff", "texture":null,
             "clip":null, "src":"manual", "room":null, "wallUid":null,
             "wall":{"a":{"x":0,"z":0},"b":{"x":6,"z":0}}}
"ceilingTrim": {"type":"cove", "width":0.1, "height":0.06, "color":"#ffffff",
                "led":"#ffd9a0", "points":[…] 6×5 rectangle …], "src":"room", "room":"Living"}
```

`src` is `"manual"` for wall-picked skirting and `"room"` for a room-generated ceiling trim;
`wallUid` is null when the skirting was snapped at build time and set when it was derived from a
2D-planner wall. Neither kind has an `hp` object or a `material` object — verified by key union in
`evidence/project-K-keys.json`. *OBSERVED — `evidence/project-F-meta.json`.*

**`linear`** — a run element (kitchen counters, railings) with
`linear:{trs:{…}}` and `hp.linear.parts`; when `hp.linear.painted` is false the element's
top-level `material` is nulled to avoid storing generated paint. *OBSERVED* in the serializer.

### F4 — Units, coordinates and naming conventions

- **Model units are metres** (float). `meta.units` / `settings.units` are `"m"` or `"ft"` and
  switch only the display layer (`HPUnits.set`). With `HPUnits.set("ft")` the stored geometry still
  serialized in metre values. *OBSERVED — `evidence/project-E-plan.json`.*
- **Ground plane is XZ** in Babylon; the 2D planner mirror uses a bottom-left-ish origin with `y`
  negated (see F7).
- **`hp.synced`** on walls and slabs caches the 2D-planner transform:
  `{x, y, z, yaw, sx, sy, sz, c}` — position, yaw, scale on the 2D model, plus a sync counter `c`.
  *OBSERVED.*
- **GUIDs** are 22-char IFC-style base-64 ids (`/^[0-9A-Za-z_$]{22}$/`), generated per element and
  reused to match `check` issues back to elements on reload. The element's IFC class is derived
  from `kind` by a fixed map (`wall→IfcWall`, `slab→IfcSlab`, `roof→IfcRoof`,
  `skirting/ceiling_trim→IfcCovering`) unless `bim.ifcClass` overrides it. *OBSERVED* in the
  shipped bundle.

### F5 — `bim` (the BIM/IFC record) and `hp` (app-private state)

Every element carries a `bim` block; the wall example after I set metadata:

```json
"bim": {"guid":"1wYOjWbMh9kyh6REZJh_VO", "name":"Red mahogany panel door",
        "ifcClass":null, "psets":{}, "props":{}, "phase":"new",
        "unitPrice":null, "notes":""}
```

- `guid` — 22-char id, the join key used by `check.issues`, `georef.storeys` and BCF topics.
- `name` — the human name; auto-filled (`"Wall 1"`, `"Floor slab 1"`, `"Roof 1"`, catalogue product
  name for models).
- `ifcClass` — `null` by default; can be set to e.g. `IfcWallStandardCase`.
- `psets` — IFC property sets (nested objects, e.g. `Pset_WallCommon`).
- `props` — free-form key/value properties.
- `phase` — lifecycle phase; the allowed set is `["new","existing","demolish","temporary"]` and
  budget/export grouping filters to those four.- `unitPrice` — number or null; falls back to `budget.prices`.
- `notes` — free text.

`hp` is a **deep clone of the Babylon `metadata.hp` object** and is the app's own bookkeeping.
Recurring keys across kinds: `kind`, `level`, plus per-kind payloads (`points` for slabs, `synced`
for walls, `style`/`pitch`/`overhang`/`uv` for roofs, `uid`, `name`). **`hp` is absent altogether on
`skirting` and `ceiling_trim`** — those two kinds carry their data in a dedicated top-level key and
have only `kind`, `id`, `level`, `bim` besides it. Doors/windows keep a minimal `hp`
(`{kind,level,uid}`) because the placed model's identity is already in `model.path` + `bim.name`.
Furniture carries a rich `hp.rec` object that mirrors the 2D planner item
(`{family, class, type, x, y, angle, angleSign, size, thick, hinge, model, libraryProductId,
modelFootprint3d, modelAutoTurn, sizeVersion, uid}`) alongside `hp.synced`. *OBSERVED —
`evidence/project-B.hpbim.json`, `project-F-meta.json`, `project-K-keys.json`.*

**No `hp.typeId` link was observed.** In a project with all four default `types[]` present, no
element carried a `typeId`/type reference in `hp` — the type catalog is referenced only by the
editor's type-management UI, not (yet) persisted per element, so type→element association is
**INFERRED** to be name/base-thickness based rather than an explicit id. Do not design a competitor
schema assuming 3DHP stores a `typeId`; verify before relying on it.

### F6 — `types`: the construction type catalog

`types[]` seeds four editable wall/slab/roof build-ups at project creation and is stored with the
project. Each entry is `{id, name, ifcClass, layers:[{material, thickness}]}`:

| name | ifcClass | layers (material @ thickness m) |
|---|---|---|
| Masonry 14 cm + plaster | IfcWall | Plaster 0.02 / Ceramic block 0.14 / Plaster 0.02 |
| Drywall 9.5 cm | IfcWall | Gypsum board 0.0125 / Steel studs + mineral wool 0.07 / Gypsum board 0.0125 |
| Solid slab 10 cm + screed + flooring | IfcSlab | Ceramic floor tile 0.01 / Screed 0.03 / Reinforced concrete 0.1 |
| Ceramic tile roof | IfcRoof | Ceramic roof tile 0.015 / Timber battens 0.025 / Timber rafters 0.06 |

Type ids are `"t" + Date.now().toString(36) + random`. Users can add/duplicate/delete types; an
element's association with a type is **not** stored as a `typeId` in the dumped project (see F5) —
the catalog survives in the file, but the per-element link is resolved by the editor UI.
*OBSERVED — `evidence/project-B.hpbim.json`, `project-K-keys.json`;
`R1 bundles/deobf/editor__hp-bim.js`.*

### F7 — `sync`: the 2D-planner bridge state

`sync` is the editor-side mirror of the separate 2D planner page. The iframe is created dynamically
but was captured live: `#floorplanIframe` with
`src = "https://www.3dhouseplanner.com/2D-Planner/index.php?lang=en"`. The editor drives it through
`contentWindow.FloorplanBridge`, whose API is
`["version","getModel","setModel","onChange","ensureUids","newUid","setTopography","setStatus",
"setBuildLayer","refresh","isSilent"]`. **`FloorplanBridge.getModel()` returns exactly the same
shape the editor stores under `sync.plans[level]`** — live comparison of the two was identical
(same `meter:60`, same four walls with `thick:12`, same `rooms[].way/walls/area`), which confirms
`sync` is a straight copy of the bridge's model. Shape:
`{plans:{<level>:{meter, walls[], objects[], rooms[], polygons[]}},
meshless:{<level>:[uid,…]}, roofs:{<level>:{…}}, meter:60}`.

- **`meter` = 60 px per metre**, the 2D planner's drawing scale.
- **`walls[]`**: `{uid, start:{x,y}, end:{x,y}, thick, type:"normal", bulge:0}` in planner pixels;
  `uid` matches `element.hp.uid`, which is the join key between the two representations.
- **`objects[]`**: the same `hp.rec` shape as furniture elements (position in planner px,
  `size`, `thick`, `angle`, `libraryProductId`).
- **`rooms[]`/`polygons[]`**: traced outlines with triple coordinates (`coords`, `coordsOutside`
  offset by half the wall thickness, `coordsInside`), an ordered `way[]` of vertex indices, a
  `walls[]` list with `segment` back-references, `area` in px², a room `name`, fill `color` and
  `surface`.
- `meshless` and `roofs` are sparse per-level maps (meshless uids, and per-level roof params like
  `pitch`) that are converted to/from `Set`s on restore.

A 6 m × 5 m rectangle serialized as four walls of 360 px and a room of `area: 100224` px²
(≈ 6×5 m × 60² = 108000, reduced by the wall-thickness insets), confirming the scale.
*OBSERVED — `evidence/project-B.hpbim.json`, `project-A.hpbim.json`, `project-K-keys.json`;
`R1 bundles/deobf/editor__hp-sync.js`.*

### F8 — `plan`: the traced blueprint underlay

`HP3D.importPlanImage(dataUrl, sourceName, {width, length})` creates a Babylon `groundplan`
ground mesh whose `metadata.planImport` holds the image. The serializer turns it into:

```json
{"dataUrl":"data:image/png;base64,…", "name":"tiny-plan.png",
 "width":6, "length":5, "p":[0,0.01,0], "q":[0,0,0,1], "s":[1,1,1], "visible":true}
```

`width`/`length` are the real-world size in metres entered by the user (scale), `p`/`q`/`s` are the
mesh's position/quaternion/scale, and `visible` lets the user hide the underlay without deleting
it. The image is embedded as a data URL, which is why a plan underlay can balloon the file.
*OBSERVED — `evidence/project-E-plan.json`; `_0x26d7e9` in the round-1 bundle.*

### F9 — `terrain`, `norms`, `budget`, `ifc`, `sun`, `tour`, `measures`, `efficiency`, `classification`, `georef`, `check`

- **`terrain`**: `{modified, imported, textures:[{url,scale}×4], detail:[3 slots], heights?, paint?, geometry?}`.
  `heights` (a compressed height array) is written only when the terrain was sculpted; `geometry`
  only when an imported terrain mesh exists; `paint` is a PNG data URL of the painted splat map.
  Default texture set: `grass.jpg, rock.jpg, sand.jpg, grass.jpg` at scale 20.
- **`norms`**: `{country, lot:{}}`, default `{country:null, lot:{}}`.
- **`budget`**: `{currency, prices:{}, groupBy?, phases?, priceTable?}`. `currency` defaults to the
  localized `bim.currencyDefault`. `prices` is keyed by IFC class or type id.
- **`ifc`**: `{schema:"IFC4"|"IFC2X3", costSchedule:bool}`.
- **`sun`**: `{date:"YYYY-MM-DD", minutes:0..1439, tz:number|null}`.
- **`tour`**: `{points:[{pos:[x,y,z],target:[x,y,z]}], seconds:1..12, continuous:bool, hold:0..5}`.
- **`measures`**: `[{kind:"dist", p:[[x,y,z],[x,y,z]]} | {kind:"angle", p:[3 points]}]`. The setter
  filters aggressively on load: only `kind` `dist` with exactly 2 points or `kind` `angle` with
  exactly 3 points, each point an array of 3 finite numbers. Verified live:
  `HPMeasure.setState([dist, angle, {kind:"bogus"}])` retained only the two valid entries and
  `serialize().measures` returned exactly those two. *OBSERVED — `evidence/project-H-curve.json`.*
- **`efficiency`**: the eight thermal input slots `{wall, roof, window, floor, color, zone,
  occupants, rain}`, null slots omitted.
- **`classification`**: `{system, edition?, custom?, codes:{}}`; the built-in systems offered are
  `NBR 15965`, `Uniclass 2015` and `OmniClass` (default `NBR 15965`). The per-system code lists are
  also cached in localStorage under `hp-bim-cls:<systemName>` so a user's list survives projects.
- **`georef`**: `{source, lengthScale, offset:[x,y,z], frame, crs:{name,eastings,northings,
  orthogonalHeight}, storeys:[{guid,name,elevation,level,dy}]}` — created when an IFC is imported
  or coordinates are entered; the storey GUIDs line up with IFC building-storey ids.
- **`check`**: `{at:timestamp, stale:bool, issues:[{level, code, text, guid, other}]}` — the last
  model-check result, with `guid` pointing at the offending element and `other` at a second
  element for pairwise clashes. `stale` is set when the model changed after the check.

*OBSERVED — `evidence/project-B/C1/C2.hpbim.json`, `project-C.full.json`; the `restore()` function
`_0x4d0a8e` in the round-1 bundle.*

### F10 — The IndexedDB `hp-bim` document: two stores and a thin wrapper

Fresh open after building and saving a project (`evidence/project-D-idb.json`). Database
`hp-bim`, version **2**, stores `index` and `projects` (both `keyPath:"id"`).

**`projects`** — the payload store:

```json
{"id":"pmvwgxoa9ofrnj", "name":"DB probe", "created":1793455225137,
 "updated":1793455253947, "size":45325, "data":"<JSON string len 45325>"}
```

`rec.data` is a **string**; parsing it yields exactly the same 24-key object `HPBIM.serialize()`
returns (`dbMatchesLive: true`, `format:"hp-bim"`, `version:1`, same element count)
(`evidence/project-G-db-verify.json`). The record fields are exactly
`["id","name","created","updated","size","data"]`.

plus, after `HPBIM.prepareReload()` (or a dirty `beforeunload`), a **second record**:

```json
{"id":"__recovery__", "ofId":"pmvwgxoa9ofrnj", "name":"DB probe",
 "updated":…, "created":…, "size":45496, "data":"<JSON string>", "autosave":true}
```

So the recovery draft is a full copy of the same envelope under the reserved id `__recovery__`,
with `ofId` naming the saved project it shadows and an `autosave` flag.

**`index`** — the list rows that populate the Projects panel:

```json
{"id":"pmvwgxoa9ofrnj","name":"DB probe","created":…,"updated":…,
 "thumbnail":"data:image/jpeg;base64,… (27 539 bytes)","size":45325,"autosave":false}
```

- `thumbnail` is a JPEG data URL captured from the canvas at quality 0.7. It is stored **only** in
  `index`, never in `projects` (the put copies the record and deletes `thumbnail` before writing the
  payload; if a put arrives without a thumbnail it copies the previous one forward from `index`).
- `size` is `JSON.stringify(envelope).length` in characters, not bytes.
- `autosave` is true only on the `__recovery__` row in this capture; normal saves write `false`/omit.
- A third reserved id, `__reopen__`, is used for the "reopen after import" marker — the two reserved
ids are declared adjacently in the shipped module: `var _0x4d16d1="__recovery__",
_0xf823f0="__reopen__";`. Both stores are created with `keyPath:"id"`, no auto-increment, and no
secondary indexes (verified live: `keyPath:"id"`, `autoIncrement:false`, `indexNames:[]`).

`HPBIM.save()` returned the project id string (`"pmvwgxoa9ofrnj"`); `HPBIM.listProjects()`
returned the array of index rows (with the full thumbnail data URL) for the panel.
*OBSERVED — `evidence/project-D-idb.json`, `evidence/project-G-db-verify.json`;
`R1` F1/F3 established the store names and the autosave timers and are consistent with this.*

**localStorage holds almost nothing, by design.** After entering the editor and building a model,
localStorage contained exactly one key —
`extension-floorplanner-currently-editing = "true"` — and sessionStorage was empty
(`evidence/project-J-storage-keys.json`). The app's own preference keys (`hp-bim-autosave`,
`hp-share-links`, `hp-sync-prefs`, `hp-bim-cls:<system>`, `hp-bim-units`, …) are **lazily created
only when the corresponding feature is used**, not seeded at startup. The state that matters lives
in IndexedDB, not in localStorage — a contrast worth noting, since CasaPlazAI autosaves the plan to
localStorage. *OBSERVED.*

### F11 — Round-trip fidelity, and what `restore()` validates

I hand-patched a serialized project with every optional section populated and called
`HPBIM.restore(patched)`; a fresh `serialize()` returned all of them verbatim:

| section | written by hand | returned after restore |
|---|---|---|
| `levelInfo` | `{"0":{elevation:0.3,height:3.05},"1":{…}}` | identical |
| `classification` | `{system:"Uniclass 2015", edition, custom, codes:{IfcWall:"EF_25_10"}}` | identical |
| `georef` | `{source, lengthScale, offset, frame, crs, storeys:[…]}` | identical |
| `check` | `{at, stale, issues:[{level,code,text,guid,other}]}` | identical |
| `norms` | `{country:"PT", lot:{area:500,frontage:12}}` | identical |
| `ifc` | `{schema:"IFC2X3", costSchedule:true}` | identical |
| `efficiency` | 8 thermal slots | identical |
| `measures` | `[{kind:"dist", p:[[0,0,0],[6,0,0]]}]` | identical |

`restore()` therefore tolerates unknown/hand-authored data in these sections — it copies them into
module state and emits them again, **without schema validation**. The only hard validation is the
envelope: `format` must equal `"hp-bim"` or it throws the localized message
*"This file is not a 3D House Planner project."* (`bim.notProject`) — verified live for
`{format:"nope"}`, `{}` and `null`, all three rejected identically. Import of foreign JSON is
rejected with `bim.unknownJson`. **INFERRED consequence:** a `.hpbim.json` is a trust-the-producer
document; consumers (share viewer, importer) only check `format`. *OBSERVED —
`evidence/project-C.full.json`, `project-C2.hpbim.json`, `evidence/project-I-validate.json`.*

**A hand-written minimal envelope is accepted.** The document below (only `format`, `version`,
`app`, `meta`, `settings`, `elements`) was restored with `{"failed":0}`, and the *next*
`serialize()` returned all 24 keys, having auto-created `terrain` and `sync` and defaulted
everything else:

```json
{"format":"hp-bim","version":1,"app":"3D House Planner",
 "meta":{"id":"p-test","name":"Minimal","created":…,"updated":…,"units":"m"},
 "settings":{"floorHeight":2.5,"floorSize":100,"level":0,"renderMode":"balanced","night":false,"units":"m"},
 "elements":[{"kind":"wall","id":"wall","name":"w","level":0,
   "bim":{"guid":"AAAAAAAAAAAAAAAAAAAAAA","name":"W1","ifcClass":null,"psets":{},"props":{},
          "phase":"new","unitPrice":null,"notes":""},
   "hp":{"kind":"wall","level":0,"uid":"u1"},
   "wall":{"a":{"x":0,"z":0},"b":{"x":3,"z":0},"thickness":0.2,"height":2.5,"baseY":0}}]}
```

*OBSERVED — `evidence/project-I-validate.json`.* Also verified: `meta.created` is preserved across
serializations while `meta.updated` is set to `Date.now()` on every `serialize()` call, and the key
order is stable (insertion order of the returned object literal). *OBSERVED.*

### F12 — Size profile (why the file is big)

Byte census over `evidence/project-C1.hpbim.json` (113 503 bytes, walls+slab+door+window+furniture+roof):

```
109523  96.5%  elements
  1692   1.5%  sync
   992   0.9%  types
   320   0.3%  terrain
   160   0.1%  camera   … every other section < 0.2%
```

Within `elements`: `material` 75 097 B (69 %), `faces` 27 616 B (25 %), `geometry` 2 227 B,
`bim` 1 358 B, `hp` 991 B, `model` 576 B, `wall` 491 B, `slab` 107 B. The Babylon material dump
(≈40 near-constant boolean/number properties per material, often ×2 sub-materials ×4 wall faces)
is by far the dominant cost, and geometry is stored uncompressed as JSON float arrays. *OBSERVED.*

### F13 — Minimal worked example (materials/faces elided)

A complete, real 6 m × 5 m single-storey document with all four default wall types, four walls, a
slab, skirting, a ceiling trim and terrain — the file to hand to an engineer.
Full copy: `evidence/worked-example.hpbim.json`.

```json
{"format":"hp-bim","version":1,"app":"3D House Planner",
 "meta":{"id":"pmvwh6dbsllr5q","name":"Untitled project","created":1793455630840,
         "updated":1793455657348,"units":"m"},
 "settings":{"floorHeight":2.65,"floorSize":100,"level":0,"renderMode":"balanced",
             "night":false,"units":"m"},
 "camera":{"alpha":-1.5707963267948966,"beta":0.7853981633974484,"radius":28.284271247461902,
           "target":[0,0,0]},
 "levels":{}, "levelInfo":{}, "site":null,
 "norms":{"country":null,"lot":{}},
 "sun":{"date":"2026-10-31","minutes":600,"tz":null},
 "tour":{"points":[],"seconds":4,"continuous":true,"hold":1},
 "measures":[], "efficiency":{}, "classification":null,
 "ifc":{"schema":"IFC4","costSchedule":false},
 "types":[{"id":"tmvwh6dbruq7t","name":"Masonry 14 cm + plaster","ifcClass":"IfcWall",
           "layers":[{"material":"Plaster","thickness":0.02},
                     {"material":"Ceramic block","thickness":0.14},
                     {"material":"Plaster","thickness":0.02}]},
          {"id":"tmvwh6dbrv2fy","name":"Drywall 9.5 cm","ifcClass":"IfcWall","layers":[…]},
          {"id":"tmvwh6dbr0hce","name":"Solid slab 10 cm + screed + flooring",
           "ifcClass":"IfcSlab","layers":[…]},
          {"id":"tmvwh6dbrp3kl","name":"Ceramic tile roof","ifcClass":"IfcRoof","layers":[…]}],
 "budget":{"currency":"$","prices":{}},
 "elements":[
   {"kind":"wall","id":"wall","name":"wall_merged","level":0,
    "bim":{"guid":"0zI1I1EobolMUUx2MYRVq3","name":"Exterior wall",
           "ifcClass":"IfcWallStandardCase",
           "psets":{"Pset_WallCommon":{"IsExternal":true,"ThermalTransmittance":0.22},
                    "Custom":{"ref":"W-01"}},
           "props":{"FireRating":"REI 60"},"phase":"existing","unitPrice":95.5,
           "notes":"south facade"},
    "hp":{"kind":"wall"},
    "material":"<elided>",
    "wall":{"a":{"x":0,"z":0},"b":{"x":6,"z":0},"thickness":0.2,"height":2.7,"baseY":2.4e-08},
    "faces":"<elided>"},
   {"kind":"slab","id":"poly","name":"poly","level":0,
    "bim":{"guid":"30aRxcm30lpy2JSyE2jjQ3","name":"Floor slab 1","ifcClass":null,
           "psets":{},"props":{},"phase":"new","unitPrice":null,"notes":""},
    "hp":{"kind":"slab","points":[{"x":0,"z":0},{"x":6,"z":0},{"x":6,"z":5},{"x":0,"z":5}],
          "level":0,"name":"Living"},
    "material":"<elided>",
    "slab":{"points":[…same…],"level":0,"y":0.01}},
   {"kind":"skirting","id":"skirting","level":0,
    "bim":{"guid":"20vOB3NIeP1NwVf7FWQ6Z4","name":"Skirting board 1", …},
    "skirting":{"side":1,"height":0.1,"depth":0.02,"color":"#ffffff","texture":null,
                "clip":null,"src":"manual","room":null,"wallUid":null,
                "wall":{"a":{"x":0,"z":0},"b":{"x":6,"z":0}}}},
   {"kind":"ceiling_trim","id":"ceiltrim","level":0,
    "bim":{"guid":"0$im8gbs98y$ZkEf7_samu","name":"Ceiling trim 1", …},
    "ceilingTrim":{"type":"cove","width":0.1,"height":0.06,"color":"#ffffff",
                   "led":"#ffd9a0","points":[…],"src":"room","room":"Living"}}
 ],
 "terrain":{"modified":false,"imported":false,
   "textures":[{"url":"textures/terraintextures/grass.jpg","scale":20},
               {"url":"textures/terraintextures/rock.jpg","scale":20},
               {"url":"textures/terraintextures/sand.jpg","scale":20},
               {"url":"textures/terraintextures/grass.jpg","scale":20}],
   "detail":[null,null,null]},
 "plan":null,"georef":null,"check":null,
 "sync":{"plans":{},"meshless":{},"roofs":{},"meter":60}}
```

Note that `bim` key order is not stable across elements (the hand-edited wall has `ifcClass` first,
auto-created ones have `guid` first) — the document is consumed as a map, not by position.
*OBSERVED.*

### F14 — Side-by-side with CasaPlazAI's `FloorplanData` (what would map where)

| CasaPlazAI `FloorplanData` v1 | 3DHP `.hpbim.json` counterpart | Note |
|---|---|---|
| `schemaVersion` | `version` (+ `format:"hp-bim"`) | CasaPlazAI uses a number only; 3DHP pairs a string discriminator with it — the discriminator is what the importer actually checks. |
| `units:"meters"` | `meta.units` + `settings.units` | 3DHP duplicates the unit name in two places and also stores metres in geometry. |
| `wallHeight`, `wallThickness` (global) | `settings.floorHeight` + per-wall `wall.thickness`/`wall.height` | 3DHP's height is per level (`settings.floorHeight`, overridable per level via `levelInfo`) and per wall; thickness is per wall. |
| `rooms[].polygon` (CCW, no repeated vertex) | slab `hp.points` / `slab.points` (open ring) and `sync.plans[n].rooms[].coords` (closed ring, repeated first vertex) | **Two conventions in the same file.** The 3D geometry ring does not repeat the first vertex; the 2D bridge ring does. |
| `rooms[].id`, `name` | slab `bim.guid`, `hp.name` / `bim.name` | 3DHP identity is the 22-char GUID, not a slug. |
| `rooms[].wallsOverride` | `levelInfo[n].height` + per-wall `height` | 3DHP overrides by wall element, not by polygon segment index. |
| `rooms[].roofs` (lean) | `roof` element with `hp.style/pitch/overhang` + baked `geometry` | 3DHP has no lean-angle on a room segment; roofs are separate elements. |
| `openings[].segmentIndex` + `tCenter` (normalised) | opening `model:{path,center,minY,q,s}` + `wall` ref | 3DHP stores the placed transform, not a segment index/t. Opening→wall association is via the wall mesh, not a stored foreign key. |
| `openings[].sillHeight`,`headHeight` | encoded in `model.minY` and `s` (scale) | No explicit sill/head fields on the element. |
| two-row shared door convention | **no counterpart** — one opening element per door | 3DHP does not duplicate shared-wall openings. |
| `furniture[].type` (7-value enum) + `footprint` + `rotationDeg` | `model:{path,center,q,s}` + `hp.rec` (catalogue product, x/y/angle/size/thick) | 3DHP furniture is GLB-instance-based, not a closed enum. |
| `furniture[].roomId` | none stored | 3DHP does not store which room a piece is in. |

The two schemas are **not** interchangeable: 3DHP is mesh/transform-centric and
Babylon-serialization-heavy, `FloorplanData` is topology-centric and validator-friendly. The
transferable ideas are the *envelope*, the *catalogue*, the *index rows* and *stable ids* — not the
element encoding.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. CasaPlazAI today: Vite/TS/Three.js, no backend, plan autosaves to
`localStorage` under `casaplaza.*` keys, `FloorplanData` schema v1 (rooms/openings/furniture,
metres, CCW polygons), PNG/JPEG export, single-workspace UI redesign in progress.

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Split the persistence envelope from the interchange schema.** 3DHP's document is `{format,version,app,meta,settings,camera,…}` around `elements[]`; CasaPlazAI already has the frozen `FloorplanData` for the editor→viewer contract. Add a *separate* `.casaplan.json` envelope (`schemaVersion`, `app`, `meta{id,name,created,updated,units}`, `settings`, `camera`, `floors[]`, `floorplan:FloorplanData`) so the editor state (snap, underlay, measures) can travel with the project without touching the frozen schema. | High | Low–Med | F1, F4, schema §"Out-of-schema editor state" |
| 2 | **A construction "types" catalog, not per-wall thickness.** 3DHP stores 4 layered build-ups (`types[]` = name + ifcClass + layers[material,thickness]) and walls then store only centreline + thickness. CasaPlazAI has a single global `wallThickness`. Add an optional `wallTypes[]` + `typeId` on rooms/walls for renovation users, defaulting to one type so nothing breaks. (Caveat: 3DHP itself never persists a per-element `typeId` — see F5 — so define that link explicitly here.) | Med–High | Med | F6, F5 |
| 3 | **Persist the blueprint underlay inside the plan, per floor.** 3DHP stores the trace image + its real width/length + transform + `visible` in the document (`plan`), so it reloads with the project. CasaPlazAI currently keeps the underlay *out* of `FloorplanData` under `casaplaza.underlay.v1`. Promote it into the new project envelope (keyed by floorId), so a saved/shared project keeps its trace — while leaving `FloorplanData` untouched. | High | Low | F8, schema pkg 12.1 |
| 4 | **Separate "index" rows from payload rows in storage.** 3DHP's `index` store holds `{id,name,updated,thumbnail,size,autosave}` so the Projects panel never parses a whole plan. Mirror that for CasaPlazAI's plan list: a small `casaplaza.index.v1` manifest with a JPEG-canvas thumbnail (~20–30 KB, 0.7 quality — the same values 3DHP uses), so listing stays O(1) per row. | Med–High | Low | F10 |
| 5 | **Per-element stable ids for issue linking and diffing.** 3DHP gives every element a 22-char IFC-style GUID and uses it in `check.issues`, `georef.storeys` and BCF topics. CasaPlazAI already requires unique entity ids in `FloorplanData`; keep them stable across edits/reloads so validation warnings, underlay annotations and diffs can point at the same entity over time. | Med | Low | F5, F9 |
| 5b | **Normalise one polygon convention before sharing.** 3DHP's own document carries two: the 3D slab ring omits the repeated first vertex while the 2D bridge ring repeats it. Pick one for CasaPlazAI's export (the schema already says CCW, no repeat) and normalise on both read and write so downstream tools never have to guess. | Med | Low | F14 |
| 6 | **Project-check results as part of the document.** 3DHP caches `{at, stale, issues[]{level,code,text,guid,other}}` in the file with a `stale` flag. CasaPlazAI could persist the last validation/overlap run the same way (id-keyed), so reopening a plan shows the previous warnings instead of an empty panel, and a `stale` flag tells the user to re-run. | Med | Low | F9, F11 |
| 7 | **Version the envelope and migrate on load.** 3DHP writes `version:1` and `format:"hp-bim"` and its importer only checks `format`. CasaPlazAI should write `schemaVersion`/`app` and route older payloads through an explicit `migrate()` (the schema doc already implies this) — the cheapest insurance against future field changes. | Med | Low | F1, F11 |
| 8 | **Trim the serialized material/geometry payload.** 3DHP's file is ~96 % `elements`, of which ~69 % is a near-constant Babylon material dump and 25 % is per-face copies of it, plus uncompressed float arrays. For CasaPlazAI: store material by *reference* (a named palette entry) and round geometry coordinates, so a plan stays small enough for a URL-payload share or a localStorage quota. | Med | Med | F12 |
| 9 | **Site / georef / norms blocks (optional, later).** 3DHP keeps `site`, `georef` (with per-storey GUIDs and a CRS) and `norms` in the document. Only relevant once CasaPlazAI exports to IFC/CAD; park the shape in the envelope now (`site`, `crs`) and fill it when those exports arrive. | Low–Med | Low | F9 |
| 10 | **Per-floor view state.** 3DHP stores `levels` (names), `levelInfo` (elevation/height overrides), the active `settings.level`, and a `camera` orbit. CasaPlazAI's multi-floor work should decide deliberately whether level names/heights and the camera live in the project document (3DHP's choice, good for "reopen exactly as I left it") or stay editor-local. | Med | Low | F1, F9 |

Lower priority: replicating 3DHP's `efficiency` thermal slots, `budget` price tables and
`classification` code systems — all three are region-/vendor-specific and only pay off once
CasaPlazAI has an IFC or cost workflow.

---

## 4. Unknowns

- **`terrain.heights` / `terrain.paint` / `terrain.geometry`** were not exercised live (they need
  sculpting or an imported terrain). Their writer is read in the shipped code
  (`{modified, imported, textures, detail, heights?, paint?, geometry?}`) but the compression of the
  `heights` array (`_0x290e6f`) was not decoded, so the array length/encoding is unknown.
- **Opt-out / feature flags and editor-local tripwires.** 3DHP names eight localStorage/sessionStorage
  tripwires (`hp-bim-autosave`, `hp-share-links`, `hp-sync-prefs`, `hp-bim-cls:<system>`,
  `hp-bim-terrain-qty`, `hp-bim-units`, an AI handoff key, and a `prepareReload` reload key). Some
  exist to survive a reload and their interaction with a saved project was not exhaustively mapped.
- **`check` is normally produced only by running the model check.** Its persistence shape is
  confirmed by round trip; the issue `code` vocabulary was not enumerated.
- **`skirting` / `ceiling_trim` / `linear` element JSON** — skirting and ceiling trim are now
  verified from a live dump (`evidence/project-F-meta.json`) including their dedicated top-level
  keys. Remaining gap: the `linear` kind (kitchen runs, railings, `HPLinear.buildRun`) was not
  produced live; `HPLinear.kits` shows the run system is a piece-stack
  (`{id,file,ends}` pieces merged into one mesh) stored as `linear:{trs}` + `hp.linear.parts`, but
  a serialized example was not captured. Curved walls are now verified
  (`evidence/project-H-curve.json`).
- **`georef` is normally produced only by an IFC import.** The shape above is from a hand-patched
  restore, so the field set is confirmed but the *values* the IFC importer writes (e.g. real
  `frame`, `lengthScale`, storey `dy`) were not observed from a real import.
  The IFC importer does clearly read `IFCBUILDINGSTOREY.Elevation/GlobalId/LongName`, and maps an
  `IFCSITE` to `site.{guid,name,latitude,longitude}`, so the observed field names line up with those
  IFC attributes. *OBSERVED (code) / INFERRED (values).*
- **`__reopen__` record's exact fields** (used after importing a project) were inferred from the
  write call: `{id:"__reopen__", name, created, updated, size, data, thumbnail:null}`; I did not
  trigger that code path live. The `__recovery__` id is now confirmed and observed in the DB, and
  both reserved ids are declared adjacently in the shipped module.
- **The `2D-Planner` iframe** embed URL and the `FloorplanBridge` API are now observed
  (`2D-Planner/index.php?lang=en`; 11 methods), and its `getModel()` output was confirmed identical
  to `sync.plans[level]`. Not verified: the planner's *own* on-disk file format, and the semantics
  of `rooms[].inside`, `way[]` and `bulge` (curve) inside the iframe's own UI.
- **`budget.priceTable`, `budget.groupBy`, `budget.phases`** appear only in the export/schedule path,
  not in the plain `serialize()` output, so their persisted shape is untested.
- **Whether the server-side export/share endpoints re-validate the document** remains unknown
  (round 1 already flagged the server responses as unexercised); the client treats the envelope as
  trusted.
- **Byte sizes**: `size` in the DB and in `index` rows is measured in UTF-16 code units
  (`string.length`), so quota calculations based on it will be off by up to 2×.
- **GUID generator algorithm** (OBSERVED for project ids in the shipped bundle): project id
  `'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,7)`; element GUIDs are
  22-char IFC-style ids matched by `/^[0-9A-Za-z_$]{22}$/`. The exact alphabet/algorithm of the
  element GUID generator was not decoded (it is not a UUID).

---

### Source index

- Vendor pages (DOCUMENTED): https://www.3dhouseplanner.com/ ,
  https://www.3dhouseplanner.com/app.php , https://www.3dhouseplanner.com/index.php .
- Round 1 (reused, read-only): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/07-07-save-export-share/`
  — `report.md`, `bundles/deobf/editor__hp-bim.js`, `bundles/deobf/editor__hp-editor.js`,
  `bundles/deobf/editor__hp-sync.js`.
- Local evidence (OBSERVED, this folder): `evidence/project-A.hpbim.json`,
  `evidence/project-B.hpbim.json`, `evidence/project-B.full.json`,
  `evidence/project-C1.hpbim.json`, `evidence/project-C2.hpbim.json`,
  `evidence/project-C.full.json`, `evidence/project-D-idb.json`,
  `evidence/project-E-plan.json`, `evidence/project-F-meta.json`,
  `evidence/project-G-db-verify.json`, `evidence/project-H-curve.json`,
  `evidence/project-I-validate.json`, `evidence/project-J-storage-keys.json`,
  `evidence/project-K-keys.json`, `evidence/api-surface.json`,
  `evidence/worked-example.hpbim.json`, `evidence/probe2/4/5/6.json`;
  scripts in `tools/`.
- CasaPlazAI schema: `~/dsh-workspaces/rea2-shared/casaplazai-schema.md` (read-only).
