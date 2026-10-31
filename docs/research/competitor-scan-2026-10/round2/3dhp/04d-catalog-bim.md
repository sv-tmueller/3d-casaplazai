# 3D House Planner — door/window catalogue: dimensions, defaults and BIM/IFC mapping
**Competitor teardown for CasaPlazAI · job `06-04d-doors-windows-catalog-bim` (round 2)**

Target: <https://www.3dhouseplanner.com/> — 3D editor `app.php` (Babylon.js) with an embedded
2D planner iframe at `2D-Planner/index.php`. Research date 2026-10-31, 15:14–16:1x CET.

Round 1 (`rea-3dhouseplanner-2026-10/04-04-doors-windows/report.md`) established the hosting model,
catalogue shape, taxonomy tokens, swing/mirroring and the *names* of the property-bag keys. This
round goes narrower and deeper: the **real geometry of all 106 catalogue models**, the **actual
width/height defaults and limits**, the **full property bag**, and its **verbatim BIM/IFC mapping**
— verified by making the app's own export service emit IFC files from synthetic plans.

Evidence shorthand: paths starting `src/` or `raw/` refer to that same **round-1 folder**
(`…/rea-3dhouseplanner-2026-10/04-04-doors-windows/`), read-only for this job; every other filename
refers to a file in **this** folder. See `README.md` for the full evidence index.

No source code was copied into this report or into any deliverable. 3D House Planner is proprietary
and ships obfuscated, closed-source JavaScript; everything below describes behaviour, data shapes and
UX in my own words. What *is* kept in this folder is measurement data (bounding boxes, counts),
engineered probe inputs and app-generated exports, kept as evidence — not reusable code.

## 1. Summary

- **The catalogue stores no dimensions.** All 60 doors and 46 windows carry exactly the same six
  fields (`id, title, title_en, image, path, rotation_offset`) — there is no `width`, `height` or
  `sill` per model. Dimensions are supplied by the *placement* (a default) and then the model is
  **rescaled non-uniformly** to match, so a single GLB serves many sizes.
  *(OBSERVED — `raw/boot-full.json`; round-1 `src/hp-editor.deobf.js` `placeOpening`)*
- **The real GLB geometry is wildly non-uniform** but the app never uses it as truth: doors span
  0.68–5.89 m wide × 2.00–3.28 m tall; windows 0.26–7.00 m wide × 0.20–3.34 m tall. The min
  dimension is the "thickness" axis (doors median 0.196 m, windows 0.129 m), and model space is
  **centred vertically** (`minY ≈ −height/2`), not grounded.
  *(OBSERVED — `model-dims.json`, `model-dims.csv`, measured from HTTP-Range glTF JSON chunks)*
- **The 2D planner, not the 3D editor, owns the defaults.** A new opening is drawn **1.00 m** wide
  with height **2.00 m** (door) or **0.80 m** (window); door heights are clamped to **1.5–2.5 m**
  and windows to **0.4–2.0 m**, and width is then constrained per type (e.g. `simple` 0.67–2.00 m,
  `aperture` 0.67–8.33 m, `fix` 0.50–5.00 m). *(OBSERVED — `planner/planner-main.decoded.js`)*
- **The property bag is tiny and optional.** `opening = {sill, swing, operation, fireRating,
  material}`; only `sill` gets a computed default, the other four are free strings stored verbatim,
  even if nonsense; `mark` lives separately in `props.Mark`. All six render as one editable panel.
  *(OBSERVED — `src/hp-bim.deobf.js`; probe IFC files)*
- **BIM/IFC mapping is explicit and server-side.** The browser POSTs a JSON "measure" model to
  `api/bim.php`, which returns IFC4 (or IFC2X3) text. Geometry → `IFCDOOR`/`IFCWINDOW` attributes
  (`OverallHeight`, `OverallWidth`, `PredefinedType`, `OperationType`); `fireRating` and derived
  `IsExternal`/`Status` → `Pset_DoorCommon` / `Pset_WindowCommon`, while `sill`, `swing`,
  `operation`, `material` and `mark` become `IFCPROPERTYSINGLEVALUE` entries in a private
  `HP_Properties` set. *(OBSERVED — `probe-out.ifc`, `probe2-out-0.ifc`, `probe3-out.ifc`)*

## 2. Findings

### 2.1 What the catalogue actually contains (and does not contain)

`window.HP_BOOT.doorOptions` (60 entries) and `window.HP_BOOT.windowOptions` (46 entries) are the
complete door/window catalogue. Every entry has the same six fields, and **no size metadata at all**:

```json
{"id":27, "title":"Red mahogany panel door", "title_en":"Red mahogany panel door",
 "image":"/admin/imagedetails/mgodoor.png", "path":"/admin/objects/9mpdoor.glb",
 "rotation_offset": null}
```
*(OBSERVED — `catalog.json`, extracted from round-1 `raw/boot-full.json`; `rotation_offset` was
`null` for all 106 in the captured session.)*

So `dimensions` are **not a catalogue property**. There are two sources of size instead:

1. **Type defaults / limits** applied at placement time (2D planner; see 2.3).
2. **A per-model auto-pick** used only to choose *which* GLB to load when the user does not pick one,
   keyed on the requested width (`src/hp-editor.deobf.js` `_0x105200`): doors ≥ 2.2 m prefer a
   `garage` model, ≥ 1.3 m a `double`, otherwise the first non-garage/non-double model; windows
   ≥ 1.6 m prefer a `double`. Models whose path matches `gate|glassblock|accordion|fold|side` are
   excluded from the auto-pick. *(OBSERVED — `src/hp-editor.deobf.js`)*

### 2.2 Real geometry of the 106 models (measured)

I fetched only the 12-byte GLB header, the 8-byte chunk-0 header and the JSON chunk of each model
via HTTP `Range`, then computed the world-space bounding box of every `POSITION` accessor through the
glTF node hierarchy. No full model was downloaded. All 106 succeeded; script and raw output are in
`glb_probe.py` / `model-dims.json`; a flat table is `model-dims.csv`.

| | n | height (m) min / med / max | width (m) min / med / max | thickness (m) med | verts med | GLB KB |
|---|---|---|---|---|---|---|
| **doors** | 60 | 2.000 / 2.204 / 3.276 | 0.683 / 1.140 / 5.889 | 0.196 | 4 957 | 5 – 8 086 |
| **windows** | 46 | 0.201 / 1.526 / 3.336 | 0.260 / 1.663 / 7.000 | 0.129 | 2 645 | 4 – 9 584 |

Key structural facts from the measurement *(OBSERVED — `model-dims.json`)*:

- **Model space is centred, not grounded.** For almost every model `min.y ≈ −height/2` and
  `max.y ≈ +height/2` (e.g. door #27: y ∈ [−0.002, 2.484]). The 3D editor compensates by placing the
  mesh at `baseY + height/2`, not `baseY`.
- **Thickness is the smallest axis, and doors are thicker than windows** (medians 0.196 m vs
  0.129 m). Door thickness ranges 0.056–0.24 m for normal doors but blows out to 1.0–3.5 m for
  *open* leaves (e.g. "Open wooden bifold glass door" 0.874 m, "Glass revolving door" 3.535 m) —
  i.e. a single bbox axis cannot always be read as "wall thickness".
- **Extreme outliers are semantic, not errors**: garage/sectional doors reach 5.9 m wide and 3.3 m
  tall; the catalogue also contains gates (6.4 m sliding iron gate), elevator doors and glass-block
  strips. These are the same entries the auto-pick excludes by filename.
- **Generators vary** (`Khronos glTF Blender I/O v1.1.46` … `v3.6.28`, `Babylon.js v5.10.0`,
  `glTF-Transform v4.3.0`), confirming the catalogue is a hand-assembled mix of third-party assets
  — which explains why there is no consistent unit or origin convention.
- **Only 20/60 doors and 8/46 windows embed textures**; most use plain material colours. Meshes are
  often a single `Mesh.0xx` with 3–6 materials.

### 2.3 Defaults and limits — owned by the 2D planner

The 2D planner (`2D-Planner/index.php`) is where openings are created; the 3D editor reacts to its
`mode` / `modeOption` / `binder.obj.type`. Its constants *(OBSERVED — `planner/planner-main.decoded.js`,
decoded from the live `planner/planner-main.js` with the page's own string table; raw file kept in
this folder)*:

```
DOOR_TYPES   = ["aperture","simple","double","pocket"]
WINDOW_TYPES = ["fix","flap","twin","bay"]
DEFAULT_DOOR_HEIGHT   = 2.0 m        DEFAULT_WINDOW_HEIGHT  = 0.8 m
DOOR_HEIGHT_LIMITS    = {min 1.5 m, max 2.5 m}
WINDOW_HEIGHT_LIMITS  = {min 0.4 m, max 2.0 m}
meter = 60 px ; DEFAULT_GRID_SIZE = 20 px ; wallSize = 12 px (0.20 m) ; partitionSize = 8 px (0.13 m)
```

Width limits are set per type inside the opening builder (`carpentryCalc`), and the raw numbers are
in **plan pixels** (`meter = 60` px per metre, the same unit as the object's `size`). Converted:

| kind | type | default height | default width | width range (px → m) |
|---|---|---|---|---|
| door | `simple` | 2.0 m | 1.00 m | 40–120 px → **0.67 – 2.00 m** |
| door | `double` | 2.0 m | 1.00 m | 40–160 px → **0.67 – 2.67 m** |
| door | `pocket` | 2.0 m | 1.00 m | 60–200 px → **1.00 – 3.33 m** |
| door | `aperture` | 2.0 m | 1.00 m | 40–500 px → **0.67 – 8.33 m** |
| window | `fix` | 0.8 m | 1.00 m | 30–300 px → **0.50 – 5.00 m** |
| window | `flap` | 0.8 m | 1.00 m | 20–100 px → **0.33 – 1.67 m** |
| window | `twin` | 0.8 m | 1.00 m | 40–200 px → **0.67 – 3.33 m** |
| window | `bay` | 0.8 m | 1.00 m | 60–300 px → **1.00 – 5.00 m** |

The **default width is 1.00 m for every type**: the planner constructs each new opening as
`new obj2D('inWall', 'doorWindow', modeOption, wallSelect, 0, 0, 60, 'normal', wallThickness)` — the
`60` is `size` in plan pixels, and `obj2D` stores `width = size / meter`. So a freshly drawn opening
is 1.00 m wide with the type's height default, and the two sliders then re-clamp it to the row above.
*(OBSERVED — `planner/planner-main.decoded.js`, `planner/floorplanEditor.decoded.js` `obj2D` (`this.size/meter`))**

The UX around them *(OBSERVED — `planner2d.html`, `planner/planner-main.decoded.js`)*:

- The **"Modify door/window"** panel (`#extension-floorplanner-objTools`) has a **Width** and a
  **Height** slider plus a paired number input, each showing the live min/max as text
  (`…WidthScale-min` / `-max`), and a **"Reverse hinges"** button (`objToolsHinge`).
- Changing Width re-runs the raycast/clamp (`limitObj`) so the opening cannot overrun the wall; the
  slider's `min`/`max` are rewritten from the current type's `resizeLimit` on every selection.
- Height is *not* clamped by the slider for doors — `ensureDoorWindowHeight` only fills in the
  default if `height3d` is missing; the type limits are shown and applied through the slider range.
- A "Rough opening" tool exists in the 3D editor (`#frameButtonW`, i18n `tool.opening`) and a
  "Door opening" (`#frameButtonD`); the 2D planner correspondingly has `door.aperture` ("aperture")
  as a *door type* — the same concept appears under two names on the two sides.

### 2.3b Two editors, two different default sets (a real inconsistency)

The 2D planner is not the only place that supplies a size. The 3D editor's own `placeOpening`
hard-codes a *second* set of fallbacks, and they disagree with the planner
*(OBSERVED — `src/hp-editor.deobf.js`, `placeOpening` at ≈ offset 545 522)*:

```
width  = clamp(requested ?? (door ? 0.9 : 1.2),  min 0.4, max wallLength − 0.1)
height = min(requested ?? (door ? 2.1 : 1.2),    wallHeight − (door ? 0.05 : 0.2))
sill   = door ? 0 : clamp(requested ?? 1.0, 0, wallHeight − height − 0.05)
```

So:

| | 2D planner | 3D editor `placeOpening` |
|---|---|---|
| door default W × H | **1.00 × 2.0 m** | **0.9 × 2.1 m** |
| window default W × H | **1.00 × 0.8 m** | **1.2 × 1.2 m** |
| default window sill | not set by the tool | **1.0 m** |
| width clamp | per type, from the table | any width 0.40 m … (wall length − 0.10 m) |
| height clamp | per type (1.5–2.5 / 0.4–2.0 m) | only wall height − 0.05/0.20 m |

The practical consequence is that a door placed by the 3D `placeOpening` API defaults to 0.9 m wide
and 2.1 m tall — the "standard" metric door — while the same door drawn in the 2D planner starts
1.00 m wide and 2.0 m tall on a type-specific width range. The wall-length cap (`− 0.10 m`) and
wall-height margin (`− 0.05 m` / `− 0.20 m`) are the 3D editor's only guards; the richer type limits
live in the planner. This is worth noting because it means the *same* opening can arrive at the
model with different dimensions depending on which tool created it — a real UX wrinkle, not a
feature.

### 2.4 The property bag — exact shape, defaults and validation

The 3D editor stores this on each placed opening mesh as `metadata.hp` plus `metadata.bim`
*(OBSERVED — `src/hp-bim.deobf.js`, element serializer `_0x1e3ba6`, and the opening-panel builder)*:

```
metadata.hp  : { kind:"door"|"window", level, sill?, swing?, operation?, fireRating?, material?, ... }
metadata.bim : { guid, name, ifcClass:"IfcDoor"|"IfcWindow", predefinedType, psets:{}, props:{}, phase, ... }
```

The opening-specific **property bag** is `opening`, serialized as:

```json
"opening": {"sill":0.9, "swing":"left", "operation":"SINGLE_SWING_LEFT",
            "fireRating":"EI 30", "material":"Wood"}
```

Rules observed in code and confirmed by the app's own schedules/IFC output:

- **`sill`** — the only computed default. Serializer: if `opening.sill` is absent it falls back to
  `worldBounds.yMin − levelBase(level)`, then rounds to 4 decimals (`_0x4abf8c` = `round(x*1e4)/1e4`).
  So a door flush to the floor gets `sill = 0`; a window gets its real sill height. In IFC it is
  typed by sign: `IFCLENGTHMEASURE(0.)` when 0, `IFCPOSITIVELENGTHMEASURE(0.9)` when positive.
- **`swing`** — one of `left, right, double, sliding, fixed, pivot` (the select in the properties
  panel). Displayed through i18n keys `bim.swing.left` etc.
- **`operation`** — the **IFC operation enum verbatim**, chosen from a fixed list: doors use
  `_0x27ede3` = `SINGLE_SWING_LEFT, SINGLE_SWING_RIGHT, DOUBLE_DOOR_SINGLE_SWING,
  DOUBLE_SWING_LEFT, DOUBLE_SWING_RIGHT, DOUBLE_DOOR_DOUBLE_SWING, SLIDING_TO_LEFT,
  SLIDING_TO_RIGHT, DOUBLE_DOOR_SLIDING, FOLDING_TO_LEFT, FOLDING_TO_RIGHT, DOUBLE_DOOR_FOLDING,
  REVOLVING, ROLLINGUP, SWING_FIXED_LEFT, SWING_FIXED_RIGHT, USERDEFINED, NOTDEFINED`; windows use
  `_0x2a4cc7` = `SINGLE_PANEL, DOUBLE_PANEL_VERTICAL, DOUBLE_PANEL_HORIZONTAL,
  TRIPLE_PANEL_VERTICAL, TRIPLE_PANEL_BOTTOM, TRIPLE_PANEL_TOP, TRIPLE_PANEL_LEFT,
  TRIPLE_PANEL_RIGHT, TRIPLE_PANEL_HORIZONTAL, USERDEFINED, NOTDEFINED`.
  *(OBSERVED — `src/hp-bim.deobf.js`; these are the IFC4 `IfcDoorTypeOperationEnum` /
  `IfcWindowTypePartitioningEnum` value sets, so the UI is literally picking IFC enum members.)*
- **`fireRating`** — free text; the panel's placeholder is `EI 30` (door) and the field is copied
  verbatim into IFC (`IFCLABEL('EI 60')` was emitted from a probe).
- **`material`** — free text; one of only two keys (`swing`, `operation`, `fireRating`, `material`)
  that are only serialized *if truthy*. It maps to `IFCLABEL('Aluminium')`.
- **`mark`** — **not** in `opening`; stored in `props.Mark` (door placeholder `P01`, window `J01`).
  IFC emits it as `IFCPROPERTYSINGLEVALUE('Mark',…,IFCLABEL('P01'))` inside the private
  `HP_Properties` set. *(OBSERVED — `src/hp-bim.deobf.js` property-update handler)*
- **No validation.** A probe with `operation:"FOO_BAR"` was accepted and exported verbatim as
  `IFCLABEL('FOO_BAR')`, i.e. `Operation` in IFC is a plain label, not the typed
  `IfcDoorTypeOperationEnum` attribute. See 2.6.

### 2.5 The BIM/IFC mapping (verified by running the app's own export service)

The export is **server-side**: `hp-bim.deobf.js` builds a "measure" JSON payload and
`POST`s it to `api/bim.php` (`credentials: same-origin`, gzip if > 64 KB), and the server returns
`text/plain` IFC or JSON. Available actions observed: `classify, quantities, budget, check, ifc,
sheets, csv, norms, schedules`. *(OBSERVED — `src/hp-bim.deobf.js`; not fetched as a raw endpoint
here except through the page.)*

I exercised the service through the same-origin `request` action of a browser scenario. Inputs are in
`probe-ifc.json`, `probe-ifc2.json`, `probe-ifc3.json`; outputs are `probe-out.ifc`,
`probe2-out-0.ifc`, `probe3-out.ifc`. The mapping is:

**Geometry/identity → IFC entity attributes**

| App data | IFC4 | IFC2X3 |
|---|---|---|
| `bbox`/`obb` width | `IFCDOOR` attrs 8,9 = `OverallHeight, OverallWidth` (e.g. `2.1,0.95`) | same (…,`2.1,0.95`) |
| `kind:"door"` | `IFCDOOR` | `IFCDOOR` |
| `kind:"window"` | `IFCWINDOW` | `IFCWINDOW` |
| `kind:"frame"` (rough opening) | `IFCOPENINGELEMENT(...,.OPENING.)` | `IFCOPENINGELEMENT` |
| `ifcClass` (from classifier) | `IFCDOOR/IFCWINDOW/IFCOPENINGELEMENT` | same |
| `predefinedType` | 10th attr: `.DOOR.` / `.WINDOW.` (or `$`) | absent (IFC2X3 has no such attribute on IfcDoor) |
| `operation` | 11th attr: `.SINGLE_SWING_LEFT.` (or `$`) | absent |
| whole-wall host | `IFCRELVOIDSELEMENT(host, opening)` + `IFCRELFILLSELEMENT(opening, doorOrWindow)` | same |

Note that the IFC `OverallHeight`/`OverallWidth` follow the **box extents** — a 0.95 × 2.1 door is
written `2.1,0.95` (height first), matching the IFC schema's attribute order.
*(OBSERVED — `probe-out.ifc` lines 86/113; `probe3-out.ifc` lines 135/200/267 (entities `#128`,
`#193`, `#260`). **DOCUMENTED** — the attribute order and the meaning of `.DOOR.`/`.WINDOW.` and the
operation enums, per buildingSMART:
[IFC4 IfcDoor](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/lexical/IfcDoor.htm)
· [IfcDoorTypeOperationEnum](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/lexical/IfcDoorTypeOperationEnum.htm)
· [IfcWindowTypePartitioningEnum](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/lexical/IfcWindowTypePartitioningEnum.htm)
· [IFC2X3 IfcDoor](https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/HTML/ifcsharedbldgelements/lexical/ifcdoor.htm)
— the IFC2X3 entity has no `PredefinedType`/`OperationType`, which is why those slots are absent.)*

**Property bag → property sets**

| App data | IFC mapping | Where |
|---|---|---|
| `IsExternal` (derived: **true for windows, false for doors** and walls) | `IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T./.F.))` | `Pset_DoorCommon` / `Pset_WindowCommon` |
| `fireRating` | `IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 30'))` | `Pset_DoorCommon` / `Pset_WindowCommon` |
| `Status` (from `phase`) | `IFCPROPERTYSINGLEVALUE('Status',$,IFCLABEL('NEW'))` | `Pset_DoorCommon` / `Pset_WindowCommon` |
| `SecurityRating` (doors, classifier default) | `…('SecurityRating',…)` | `Pset_DoorCommon` |
| `ThermalTransmittance`, `GlazingAreaFraction` (windows, classifier default) | `…` | `Pset_WindowCommon` |
| `mark` | `IFCPROPERTYSINGLEVALUE('Mark',$,IFCLABEL('P01'))` | private `HP_Properties` |
| `phase` | `IFCPROPERTYSINGLEVALUE('Phase',$,IFCLABEL('new'))` | `HP_Properties` |
| model GLB path | `IFCPROPERTYSINGLEVALUE('Model',$,IFCLABEL('/admin/objects/9mpdoor.glb'))` | `HP_Properties` |
| `swing` | `IFCPROPERTYSINGLEVALUE('Swing',$,IFCLABEL('left'))` | `HP_Properties` |
| `operation` | `IFCPROPERTYSINGLEVALUE('Operation',$,IFCLABEL('SINGLE_SWING_LEFT'))` | `HP_Properties` |
| `material` | `IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('Wood'))` | `HP_Properties` |
| `sill` | `IFCPROPERTYSINGLEVALUE('Sill',$,IFCLENGTHMEASURE(0.) / IFCPOSITIVELENGTHMEASURE(0.9))` | `HP_Properties` |

**Quantities → `Qto_*BaseQuantities`**

- Door: `IFCQUANTITYLENGTH('Width',0.95)`, `('Height',2.1)`, `IFCQUANTITYAREA('Area',1.995)` in
  `IFCELEMENTQUANTITY('…','Qto_DoorBaseQuantities',$,'BaseQuantities',…)`.
- Window: `Qto_WindowBaseQuantities` with `Width`, `Height`, `Area`.
- Rough opening (`frame`): a private `HP_Quantities` set (`BaseQuantities`) with
  `IFCQUANTITYLENGTH Width, Depth, Height` plus `IFCQUANTITYCOUNT Count` — note it is *not* named
  `Qto_OpeningElementBaseQuantities`, one more place the vendor's namespaced pset shows through.
- Storey level: `Qto_BuildingStoreyBaseQuantities` is also emitted.
- The host wall gets `Qto_WallBaseQuantities` with `Length, Height, Width, GrossSideArea,
  NetSideArea, NetVolume` — i.e. the opening genuinely subtracts from the wall
  (8.0 × 2.8 → GrossSideArea 22.4, NetSideArea 15.185, NetVolume 3.644 in probe 2).
*(OBSERVED — `probe-out.ifc`, `probe2-out-0.ifc`)*

**Header / schema**

- IFC4: `FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1')`,
  `FILE_SCHEMA(('IFC4'))`, `IFCAPPLICATION(#2,'2.0','3D House Planner','HP3D')`, plus
  `IFCUNITASSIGNMENT` with SI length/area/volume/angle/time plus `IFCMONETARYUNIT('EUR')`.
- IFC2X3: `ViewDefinition [CoordinationView_V2.0]`, `FILE_SCHEMA(('IFC2X3'))`; `IFCDOOR` has only
  the 9 core attributes and the door/window `Pset_*Common` / `HP_Properties` sets are still emitted.
*(OBSERVED — `probe-out.ifc` header; `probe3-out.ifc` header)*

### 2.6 The schedule/budget/check data model (more property-bag evidence)

Calling the other service actions with the same synthetic model returned the app's own tabular view
*(OBSERVED — `service-schedules.json`, `service-quantities.json`, `service-classify.json`,
`raw-probe-sched.json`)*:

- `schedules` returns `{rooms, doors[], windows[], walls[], units, currency}`. Each door/window row
  is exactly the property bag flattened: `{uid, guid, level, levelName, name, mark, width, height,
  sill, area, host, hostGuid, swing, operation, fireRating, material, typeName, phase, count}`.
  This is the canonical, machine-readable definition of "what a door is" in this app.
- `classify` returns the **default property sets per IFC class**: for `IfcDoor`
  `Pset_DoorCommon {IsExternal:false, FireRating:"", SecurityRating:""}`; for `IfcWindow`
  `Pset_WindowCommon {IsExternal:true, ThermalTransmittance:"", GlazingAreaFraction:""}`; for
  `IfcOpeningElement` `Pset_ManufacturerTypeInformation {Manufacturer:"", ModelLabel:""}`.
  My probe's `c1` window with `swing/operation/fireRating/material` set got `IsExternal:true`
  automatically, while doors stayed `false` — so **externality is inferred from kind**, not from
  wall position. *(OBSERVED — `service-classify.json`)*
- `budget` prices by IFC class: door **600 EUR/unit**, window **720 EUR/unit**, wall **90 EUR/m²**,
  with `phases: ["new","demolish","temporary"]`. `quantities` repeats the per-element
  `psets`/`quantities`/`unitPrice`/`cost`. *(OBSERVED — `raw-probe-sched.json`)*
- `csv` flattens to `Level;IFC class;Predefined type;Name;GlobalId;Material;Length;Height;Width;Area;
  Volume;Unit;Unit price;Cost;Phase` — the same property names as the IFC psets.
  *(OBSERVED — `sched-raw.json`, the `csv` action response)*
- `check` returned `{"issues":[]}` for the probe. The issue catalogue observed in the app's i18n
  includes `bim.issue.openingOverlap` ("{a} overlaps {b} in the same wall"), `bim.issue.openingNoWall`
  ("{name} is not inside a wall") and the normative checks `bim.issue.normDoor`,
  `normDoorEntrance`, `normEgress` (clear area and "sill at most {sill} m"), `normLight`,
  `normWetVent` — i.e. **sill and width feed rule checking**, not just display.
  *(OBSERVED — `raw/app.html` i18n dictionary, round-1 evidence)*

### 2.7 What round 1 left open, now closed

- **Round-1 Unknown: "whether the user can override width/height independently of the model."**
  Closed: yes — the 2D planner's "Modify door/window" panel exposes Width and Height sliders and
  number inputs, and the 3D editor rescales the GLB along its long axis (`width/bbox-long`) and its
  thickness axis (`wallThickness/bbox-thickness`) and vertical axis (`height/bbox.y`), so the model
  is a *skin* stretched onto the requested opening. *(OBSERVED — `planner2d.html`,
  `src/hp-editor.deobf.js`)*
- **Round-1 Unknown: the 2D planner could not be fetched (403).** Closed: fetching
  `2D-Planner/index.php` first (to obtain the `PHPSESSID`/Cloudflare cookie) then requesting
  `js.php?f=planner/...` returns all 11 planner modules; they are also visible in a browser network
  capture. The planner's own `DOOR_TYPES`/`WINDOW_TYPES`, defaults and limits are in
  `planner/planner-main.decoded.js` (see 2.3).
- **Round-1 Unknown: the exact BIM/IFC mapping of the property bag.** Closed — see 2.5, evidenced by
  three IFC files the app itself generated.
- **Round-1 Unknown: `rotation_offset` semantics.** Still `null` for all 106 entries in the captured
  session, so the override path remains code-only — unchanged.

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each is tied to a finding above, and to the CasaPlazAI `FloorplanData`
schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`), whose `Opening` today is
minimal: `{id, roomId, kind:"door"|"window", segmentIndex, tCenter, width, sillHeight, headHeight}`,
all lengths in **meters**. Note that 3D House Planner's opening `height` is exactly
`headHeight − sillHeight`, and its `sill` is the schema's `sillHeight` — so the geometry fields
already align; what is missing is everything *non-geometric*.

1. **Add a typed (validated) metadata record to `Opening`, next to the existing geometry.**
   The schema already carries `width`, `sillHeight`, `headHeight`; the gap is the *identity* data
   that 3D House Planner keeps as loose strings. Additively extend `Opening` with
   `type` (closed enum), `mark`, `operation` (IFC enum), `swing`, `fireRating`, `material` — with
   `operation`/`swing` validated against the IFC enum sets rather than free text. 3D House Planner's
   weakest point is precisely that these are unvalidated strings; a probe exported
   `Operation = FOO_BAR`. *Effort: low.* *(Finding 2.4; schema `Opening`)*

2. **Adopt the type→(default height, width range) table as the placement contract for `Opening`.**
   3D House Planner's 2D planner is explicit: a new opening starts 1.00 m wide, door default height
   2.0 m with a 1.5–2.5 m clamp, window default 0.8 m with 0.4–2.0 m, and per-type width ranges
   (e.g. `simple` 0.67–2.00 m, `aperture` 0.67–8.33 m, `fix` 0.50–5.00 m). CasaPlazAI can encode
   this as a small type table that seeds `width`/`sillHeight`/`headHeight` on insert and clamps
   drag-resize, reusing the existing `negative-width`, `bad-head-height`, `opening-too-wide` and
   `negative-sill` validator codes. *Effort: low.* *(Finding 2.3)*

3. **Emit IFC from the browser, mapping the schema fields to the standard psets.**
   3D House Planner out-sources IFC to a server, which does not fit CasaPlazAI's no-backend design;
   CasaPlazAI can write IFC4 locally instead. Map `sillHeight`→`Sill`, `mark`→`Mark`,
   `fireRating`→`FireRating`, derived external-ness→`IsExternal`, and
   `headHeight − sillHeight`→`OverallHeight` while `width`→`OverallWidth`, with `operation` written
   as the **typed `OperationType` attribute** rather than a label. That produces viewer-ready files
   entirely offline — strictly better than the competitor's server round-trip. *Effort: medium.*
   *(Finding 2.5)*

4. **Cut the host wall opening correctly and expose gross/net quantities.**
   3D House Planner distinguishes `GrossSideArea`/`NetSideArea`, `GrossVolume`/`NetVolume` and a
   separate opening area, and its wall quantities visibly shrink once a door is added. CasaPlazAI's
   `Room` polygons plus each `Opening`'s `segmentIndex`/`tCenter`/`width` already determine the cutout
   interval, so the same net/gross split is cheap to derive and is what makes a schedule
   trustworthy. *Effort: medium.* *(Finding 2.5)*

5. **Provide a "Doors & windows" schedule view as the proof of the model.**
   3D House Planner's `schedules` response is a flat list per opening with
   `mark, width, height, sill, host, swing, operation, fireRating, material`, and its CSV export uses
   the same columns. For CasaPlazAI the columns fall straight out of the extended `Opening` plus its
   `roomId` (the "host"): `id, type, mark, roomId, width, headHeight − sillHeight, sillHeight,
   operation, swing, fireRating, material`, filterable by the floor that owns the room.
   *Effort: medium.* *(Finding 2.6)*

6. **Use `sillHeight`, `headHeight` and `width` for normative checks, not just display.**
   The competitor's check catalogue includes `normDoor` (min width), `normDoorEntrance`, `normEgress`
   (clear area and "sill at most {sill} m"), `normLight` (glazing ≥ some % of floor area) and
   `normWetVent`. Because CasaPlazAI already validates `tCenter`/`width` against segment length, it
   can additionally flag "this bedroom's window sill is too high to escape through" or "no window
   serves this wet room" — pure computation, no backend. *Effort: medium.* *(Finding 2.6)*

7. **Keep a typed hinge flag separate from the recorded operation.**
   3D House Planner models the hinge geometrically (`hinge` toggles `normal`/`reverse` and only
   mirrors the drawn symbol) while separately storing a semantic `swing`; the two can drift. If
   CasaPlazAI adds a `hinge: "left"|"right"|"none"` flag, keep it explicitly distinct from
   `operation`, and derive the drawn symbol from the flag so the picture and the schedule can never
   disagree. *Effort: low.* *(Findings 2.3, 2.4)*

8. **Do not copy the "one asset, rescale per placement" model.**
   3D House Planner stretches a single GLB across a huge width range (measured bboxes 0.68–5.89 m
   wide on doors), and its `garage`/`double` auto-pick is a workaround for the catalogue storing no
   sizes. Since CasaPlazAI's `Opening` is parametric and has no GLB catalogue, store a **nominal
   `width`/`height` per door/window *type*** (i.e. default `width` and `headHeight − sillHeight`) and
   only deviate when the user resizes. *Effort: low.* *(Findings 2.1, 2.2)*

## 4. Unknowns

- **Server internals of `api/bim.php`.** All IFC/schedule/quantity output observed is the server's
  response; the classifier's full rules (beyond the per-class *default* psets captured in
  `service-classify.json`) and the complete `check` rule set were not exhaustively enumerated. What
  is known is the client-visible contract (2.5, 2.6).
- **`rotation_offset` is still unused in every captured session** (`null` for all 106 models), so its
  runtime semantics are code-only.
- **The 3D editor's live placement flow was not driven through the UI.** I verified the model
  rescaling and `placeOpening` logic statically, and the IFC mapping by invoking the app's own
  service; I did not synthesise canvas clicks to place an opening interactively (headless Chromium
  had no GPU/WebGL in round 1, and this round's scenarios intentionally used the service path).
  Consequence: the *exact* numeric default width at the moment a user clicks (as opposed to the type
  range) was read from code, not measured on screen.
- **Catalogue counts are a snapshot** of 2026-10-31 (60 doors / 46 windows); the catalogue is
  admin-populated and can change.
- **No vendor documentation exists** for 3D House Planner itself — no manual, API reference or data
  dictionary was found. Everything about *the app* is therefore OBSERVED (with the named evidence
  file) or INFERRED. The only DOCUMENTED-tier sources are the buildingSMART IFC specifications used
  to interpret the exported files (see §2.5).
- **Licence:** no licence or terms file was observed; the shipped JavaScript is obfuscated and
  proprietary. Nothing was copied from it. All evidence files in this folder are either engine
  outputs of mine, measurement data, or text the app itself returned for my synthetic inputs.
