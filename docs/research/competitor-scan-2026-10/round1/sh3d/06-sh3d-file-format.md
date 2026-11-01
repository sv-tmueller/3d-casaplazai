# Sweet Home 3D — `.sh3d` file format & `Home.xml` data model

Job: `06-06-sh3d-file-format` · App studied: Sweet Home 3D 7.5.x (Java desktop **and** JS/HTML5 "Sweet Home 3D JS Online") · Target URL: <https://www.sweethome3d.com/de/> (German landing page) / <https://www.sweethome3d.com/SweetHome3DJSOnline.jsp>

Evidence legend: **OBSERVED** = I fetched/parsed the live artefact or a real file and recorded it in this folder · **DOCUMENTED** = vendor/official documentation or shipped source · **INFERRED** = my own reasoning.

---

## 1. Summary (5 bullets)

- **The `.sh3d` file is a plain ZIP container** holding at minimum a binary Java-serialised `Home` entry, and — in every modern file — a second `Home.xml` entry that is the **canonical, DTD-described XML data model**; a third `ContentDigests` entry stores SHA-1 digests of embedded assets, and all furniture models / textures are stored as further ZIP entries referenced by path from the XML. **OBSERVED** (`sh3d_samples/Blues_ziplisting.txt`, real gallery `.sh3d`) and **DOCUMENTED** (`docs_src/DefaultHomeOutputStream.java` lines 157–180).
- The `Home.xml` model is **level-centric and geometry-first**: one `home` root with an ordered list of `level` rows (storeys), then walls, rooms, openings, furniture, dimensions, labels, polylines, cameras and a `compass`. Unlike CasaPlazAI's current "rooms own their edges" model, **walls are first-class objects with their own IDs, thickness, height, textures and explicit `wallAtStart`/`wallAtEnd` join attributes**, while rooms are independently-inset polygons. **DOCUMENTED** (`Home.xml.dtd` extracted verbatim from official source) + **OBSERVED** (7 official example homes).
- **Openings are not "on a room edge"** — every door/window is a `doorOrWindow` piece of furniture with free `x`/`y`/`angle` placement plus *numeric ratios* `wallThickness`/`wallDistance`/`wallWidth`/`wallHeight`/`wallTop` that describe how the piece embeds itself into whatever wall it overlaps; there is no stored `wallId` foreign key. **DOCUMENTED** (`HomeDoorOrWindow.java` javadoc: "a value in percentage of the depth") + **OBSERVED** (real doors carry `wallThickness='0.79…'`, `wallDistance='0.0147…'`).
- **The same XML model runs in the browser**: the official HTML5 version loads `sweethome3d.min.js` (2.6 MB) which contains `CURRENT_VERSION=7400` and the full model class set (`Home`, `Wall`, `Room`, `Level`, `HomeDoorOrWindow`, `Polyline`, `DimensionLine`, `Label`, `Compass`, `ObserverCamera`, `FurnitureGroup`, `Light`), using `jszip` + `jsXmlSaxParser` — so `.sh3d` files interoperate desktop↔browser. **OBSERVED** (`online_js/sweethome3d.min.js`, `rea/online_capture_summary.json`).
- **For CasaPlazAI the highest-value transferable ideas are**: (a) level/storey as a first-class entity, (b) explicit wall joins + wall thickness so shared walls are stable, (c) openings as parametric wall-relative ratios rather than absolute room-edge indices, (d) per-object display/identity metadata (`id`, `name`, `visible`, `movable`, `level` FK) which makes undo/redo, locking and persistence trivial, and (e) a `version` integer on the root for forward/backward migration. **INFERRED** (mapped to findings below).

---

## 2. Findings

### 2.1 Where the format is actually specified

There is **no standalone `sweethome3d.com/…/Home.xml.dtd` URL** (I probed several, all 404). The authoritative DTD is embedded as a Javadoc comment in the official source class `HomeXMLHandler`, and the export side is `HomeXMLExporter`. **DOCUMENTED / OBSERVED**

| Artefact | Where I got it | Licence |
|---|---|---|
| `Home.xml.dtd` (32 `<!ELEMENT>`, 31 `<!ATTLIST>`, 4 `<!ENTITY>`) | Extracted verbatim from `HomeXMLHandler.java`; saved to `Home.xml.dtd` | GPL-2.0+ (Sweet Home 3D) — **reference only, described not copied into our code** |
| `docs_src/HomeXMLHandler.java`, `HomeXMLExporter.java`, `HomeFileRecorder.java`, `DefaultHomeInputStream.java`, `DefaultHomeOutputStream.java` | Debian source mirror (see 2.7) | GPL-2.0+ |
| 7 official example `Home.xml` files (v5500) | `examples/` (Debian source `io/resources/examples/`) | CC-BY 3.0 / GPL |
| 1 real shipping gallery `.sh3d` (v7400) | `sh3d_samples/` (Blues, from sweethome3d.com gallery) | CC-BY / GPL per embedded `License` property |

Note on the two versions: the bundled example homes are `version='5500'`; the shipped gallery file and the model class both report **`CURRENT_VERSION = 7400`** (`docs_src/Home.java` line 49; `CURRENT_VERSION=7400` in the JS bundle). The handler accepts `version CDATA #IMPLIED` and upgrades older files in memory. **OBSERVED/DOCUMENTED**

### 2.2 The `.sh3d` container

**OBSERVED** from a real 51.9 MB gallery file (`sh3d_samples/Blues_ziplisting.txt`):

```
Home                189681 bytes   Java serialization data, version 5
Home.xml            232027 bytes   XML, version='7400'
ContentDigests       18632 bytes   "ContentDigests-Version: 1.0" + "Name: <entry>" + "SHA-1-Digest: <base64>"
0                    12864
1/stairs_180_circular_notopstep_rail/…obj / .mtl
2, 3, 4, 6, 8, 10 …  numeric names = embedded textures/icons
5/wooden-door/…obj
…
```

**DOCUMENTED** write order (`DefaultHomeOutputStream`): `Home` (if binary serialisation enabled) → `Home.xml` → `ContentDigests` → one entry per referenced content, where the XML stores a *content name* per asset. **DOCUMENTED** read order (`DefaultHomeInputStream` lines 271–327): the reader scans the ZIP for `Home` and `Home.xml`, and **"Give a higher priority to Home.xml entry"** (line 286); if only the binary entry exists it deserialises the `Home` object; if neither, `IOException("Missing entry \"Home\" or \"Home.xml\"")`.

Practical consequences **INFERRED**: `.sh3d` is self-contained (models travel inside), the XML is human-diffable/repairable, and the binary `Home` entry is a legacy/robustness fallback rather than the primary format.

### 2.3 The `Home.xml` element model

Root and ordering (**DOCUMENTED**, DTD):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Complete element list (32 elements, grouped by concern) — **DOCUMENTED** (DTD) and **OBSERVED** in the examples (`examples/*.xml`):

| Group | Elements | Key idea |
|---|---|---|
| Envelope | `home`, `property`, `furnitureVisibleProperty` | root `version`, `name`, `camera`, `selectedLevel`, `wallHeight`, `furnitureSortedProperty`, `basePlanLocked`, `furnitureDescendingSorted`; `property name/value` is an open key-value bag (the examples use it for Author/Copyright/License/TotalArea) |
| Presentation | `environment`, `backgroundImage`, `print`, `printedLevel` | ground/sky/light colours, 3D drawing mode, photo/video export geometry & quality, `wallsAlpha`, `subpartSizeUnderLight`; print layout + paper margins |
| Orientation | `compass` | `x`,`y`,`diameter`,`northDirection`,`longitude`,`latitude`,`timeZone`,`visible` |
| Viewpoints | `camera`, `observerCamera` | shared entity `cameraCommonAttributes` (`lens` PINHOLE/NORMAL/FISHEYE/SPHERICAL, x/y/z, yaw, pitch, fieldOfView, time) plus `attribute` discriminator (`topCamera` \| `observerCamera` \| `storedCamera` \| `cameraPath`); `storedCamera` rows are **named saved viewpoints** |
| Storeys | `level` | `id ID`, `name`, `elevation`, `floorThickness`, `height`, `elevationIndex`, `visible`, `viewable`; may own its own `backgroundImage` |
| Structure | `wall`, `baseboard` | see 2.4 |
| Space | `room`, `point` | see 2.5 |
| Fittings | `doorOrWindow`, `sash`, `window`-like pieces | see 2.6 |
| Furnishings | `pieceOfFurniture`, `furnitureGroup`, `light`, `lightSource`, `lightSourceMaterial`, `shelfUnit`, `shelf` | shared `furnitureCommonAttributes` + `pieceOfFurnitureCommonAttributes` + `pieceOfFurnitureHorizontalRotationAttributes` |
| Surfaces | `texture`, `material`, `transformation`, `textStyle` | texture = image + scale/offset/angle + which face (`attribute`); material = named colour/shininess slot; transformation = named 3×3 matrix |
| Annotation | `dimensionLine`, `label`, `text`, `polyline` | see 2.5 |

Design points worth noting **INFERRED**:
- **Everything selectable carries an `id` and a nullable `level IDREF`** — a single flat object list per storey, not a deep tree, except `furnitureGroup`, which *does* nest its children to express "treat these as one unit".
- **`attribute`-named children are a deliberate pattern**: `textStyle attribute="nameStyle|areaStyle|lengthStyle"`, `texture attribute="floorTexture|ceilingTexture|leftSideTexture|…"`, `baseboard attribute="leftSideBaseboard|rightSideBaseboard"`, `camera attribute="topCamera|storedCamera"`. One element type is reused and a discriminator says *which field of the parent* it fills. This is compact and reuses parsing code (`HomeXMLHandler` line 79 comment: "Attributes named `attribute` indicate the names of the object fields where some elements should be stored").
- **Units are centimetres** throughout (angles in radians, thicknesses/offsets in cm; `Wall` doc and `Home` constructor comment "height equal to 250 cm"; example `wallHeight='250.0'`). Ratios (`wallThickness`, `dropOnTopElevation`) are unitless 0–1 fractions. `LengthUnit` exists only for *display*. **DOCUMENTED**
- **Defaults are encoded in the DTD** (`"1"`, `"0"`, `"true"`, `"VIEW_3D_RATIO"`, …): the writer omits any value equal to the default, which is why real files are terse. **DOCUMENTED** (`writeFloatAttribute(name, value, default)` pattern in `HomeXMLExporter`).

### 2.4 Walls, joins and thickness

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

**OBSERVED** in the real gallery file:

- A closed rectangular circuit is stored as four walls whose `wallAtStart`/`wallAtEnd` **mutually reference each other's IDs** (e.g. `wall-f08e…` has `wallAtEnd=wall-5961…`, and `wall-5961…` has `wallAtStart=wall-f08e…`). So the graph is explicit and symmetric. The handler defends against self-references ("bug in version 6.4"). **OBSERVED + DOCUMENTED**
- `thickness='7.5'` (cm) on interior walls; `arcExtent='0.6981317'` (0.2 rad ≈ 40°) turns a straight wall into a circular arc (`1BedroomApartmentWithRoundWall.xml`, wall7) — i.e. **a curved wall is the same element with an arc extent**, not a separate type (`Wall.getLength()` returns `abs(arcExtent) * radius`). **OBSERVED**
- Walls have **independent side colours** (`leftSideColor`/`rightSideColor`), a `topColor` and a hatch `pattern` — the plan view paints each wall face separately. **OBSERVED**
- `baseboard` is a child of the wall with `thickness`, `height`, `color` and an `attribute` naming which side. **DOCUMENTED**

### 2.5 Rooms, points, annotations

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- A room is a **closed polygon of `point x y` vertices** with its own floor/ceiling colour, texture, and separate label placement for name and area. **DOCUMENTED**
- **Rooms do not reference the walls they sit inside.** Rooms and walls are two independent views of the same plan, and in real files the room polygon is visibly *inset* from the wall centreline. **OBSERVED**: in `Blues/Home.xml` a wall runs on centreline `x=299.5` with `thickness=7.5`, and the adjacent room's edge is `x=303.25` — i.e. the room boundary is pulled to the **inner face** of the wall (299.5 + 7.5/2 = 303.25). The room is not derived from the wall; both are authored geometry.
- **A room can be non-contiguous** — `Room.getArea()` handles a `java.awt.geom.Area` that is "not singular" by summing the signed area of each sub-path, so one room object may describe several disjoint polygons. **DOCUMENTED** (`docs_src/Room.java` lines 698+).
- Annotations:
  - `dimensionLine`: `xStart/yStart/xEnd/yEnd` + `offset` (perpendicular displacement of the dimension line from the measured segment). **OBSERVED**: `xStart='-16.4' yStart='-16.9' xEnd='856.6' yEnd='-16.9' offset='-46.5'`.
  - `label`: `x`,`y`,`angle`,`elevation`,`pitch`,`color`,`outlineColor` + a `textStyle` child + a `<text>` child holding PCDATA. **OBSERVED** (`<label …><textStyle fontSize='30.0'/><text>1st floor</text></label>`).
  - `polyline`: `point+` with `thickness`, `capStyle` (BUTT/SQUARE/ROUND), `joinStyle` (BEVEL/MITER/ROUND/CURVED), `dashStyle` (SOLID/DOT/DASH/DASH_DOT/DASH_DOT_DOT/CUSTOMIZED) + `dashPattern`, `startArrowStyle`/`endArrowStyle` (NONE/DELTA/OPEN/DISC), `closedPath`. **OBSERVED** a leader line with `endArrowStyle='OPEN'`.

### 2.6 Doors and windows: wall-relative, not edge-bound

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

This is the single most important structural difference from an "opening on a room edge" schema:

- The opening stores a **free `x`, `y`, `angle`**, exactly like a sofa. It does **not** store a `wallId`. Instead it records *how* it should be embedded: `wallThickness` is "the thickness of the wall in which this door or window should be placed… **a value in percentage of the depth of the door or the window**", and `wallDistance` is "the distance between the back side of this door or window and the wall… **in percentage of the depth**". **DOCUMENTED** (`HomeDoorOrWindow.java` javadoc, lines 121–152).
- Real files show the ratios: `wallThickness='0.7936508'`, `wallDistance='0.014705882'`, `wallCutOutOnBothSides='true'`, `cutOutShape='M0,0 v1 h1 v-1 z'`. **OBSERVED**
- `boundToWall='false'` appears on some pieces (e.g. a door frame) meaning it is a *free-standing* furniture-like piece even though it shares the `doorOrWindow` type. **OBSERVED**
- Geometry of the *hole* is a **normalised SVG path** in `cutOutShape` (unit square 0..1), so the wall cut-out shape is data-driven, not hard-coded to a rectangle. One shipped gallery door carries a full inline SVG document as its `cutOutShape`. **OBSERVED**
- `sash` children describe the movable panels: `xAxis`, `yAxis`, `width`, `startAngle`, `endAngle` — enough to animate/draw an opening panel. Present on most doors, absent on fixed windows. **OBSERVED** (e.g. 18 doors with sashes in `3BedroomHouseWithAttic.xml`).

**INFERRED**: this design lets a user drag a window a few cm along any wall and have it "snap" into the wall thickness automatically, without the document having to be re-linked. It also survives the wall being deleted/moved, at the cost of some geometry recomputation.

### 2.7 Furniture and catalog indirection

`pieceOfFurniture` carries **both** a lightweight identity and a 3D payload reference:

- Identity/placement: `id`, `name`, `creator`, `level` (FK), `x`, `y`, `elevation`, `angle`, `width`, `depth`, `height`, `modelMirrored`, `pitch`/`roll`, `horizontallyRotatable`, `widthInPlan`/`depthInPlan`/`heightInPlan` (the *rotated* AABB used for plan-view hit-testing), `movable`, `visible`, `nameVisible`, `nameAngle`, `nameXOffset`, `nameYOffset`, `price`, `currency`/`valueAddedTaxPercentage`, `description`/`information`/`license`.
- Payload: `catalogId` (e.g. `eTeks#door`), `model` (path inside the container), `icon`, `planIcon`, `modelSize`, `modelRotation` (a 3×3 matrix string), `modelCenteredAtOrigin`, `dropOnTopElevation`, `staircaseCutOutShape`.
- Appearance: `color`, `shininess`, `texture?`, `material*`, `transformation*` children; `material` has a `name` + `key` + `color` + `shininess`, i.e. a **named slot** (e.g. `material name='white' color='FF010101'`) so a catalog model's faces can be recoloured individually. **OBSERVED**
- `light` = `pieceOfFurniture` + `power` + `lightSource*` children (`x,y,z,color,diameter`), and `lightSourceMaterial*` references. `furnitureGroup` = a `pieceOfFurniture` whose children are other pieces, with its own aggregate `x/y/width/depth/height` — **a composable grouping primitive**. `shelfUnit`/`shelf` add parametric shelving (`elevation`, `xLower/yLower/zLower`, `xUpper/yUpper/zUpper`). **DOCUMENTED/OBSERVED**

**OBSERVED** example: a "Main roof" `furnitureGroup` contains beams with `roll='0.4887'` (a rotated roof plane) plus explicit `widthInPlan='473.9'` / `heightInPlan='265.9'` — proof that the *stored plan footprint* is cached separately from the 3D bounding box.

### 2.8 The companion JS/HTML5 implementation (OBSERVED via REA)

The "online" version is the same format in the browser:

- `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` loads a fixed library set, including `jszip.min.js`, `jsXmlSaxParser.min.js`, `jszip`-based container handling, `geom.min.js`, `graphics2d.min.js`, `triangulator.min.js`, `batik-svgpathparser.min.js` (for `cutOutShape`!) and **`sweethome3d.min.js` (2 618 789 bytes, version 7.5.2)**. **OBSERVED** (`online_app.html`; `rea/online_capture_summary.json` shows 78 hits each for every library on the page).
- Inside `sweethome3d.min.js`: `CURRENT_VERSION=7400`, and the full entity vocabulary is present as string literals — `"level"`, `"wall"`, `"room"`, `"doorOrWindow"`, `"pieceOfFurniture"`, `"dimensionLine"`, `"label"`, `"polyline"`, `"point"`, `"compass"`, `"observerCamera"`, `"sash"`, `"baseboard"`, `"furnitureGroup"` — plus classes `Home`, `Wall`, `Room`, `Level`, `HomeDoorOrWindow`, `ObserverCamera`, `HomeFurnitureGroup`, `HomeLight`, `Polyline`, `DimensionLine`, `Compass`, `Label`, and `readHome`/`XMLHandler` entry points. **OBSERVED**
- REA capture evidence: a headless Chromium 156 scenario against the online page recorded the app's real network graph and a console trace; the page's scripts are served from `/libjs/…?version=7.5.2`. (Screenshots could not be produced — see §4.) **OBSERVED** (`rea/online_capture.json`, `rea/online_capture_summary.json`).

### 2.9 Comparison with a simple JSON plan schema

A minimal CasaPlazAI-style plan could look like the (proposed, non-normative) `casaplazai-plan.schema.json` in this folder:

```jsonc
{ "version": 1, "units": "m", "grid": { "step": 0.5 },
  "levels": [ { "id": "L0", "elevation": 0, "height": 2.5, "floorThickness": 0.12 } ],
  "rooms":  [ { "id": "r1", "levelId": "L0", "name": "Kitchen", "polygon": [[x,y],…],
                "floor": {"color":"#fff"}, "ceiling": {"color":"#fff"} } ],
  "walls":  [ { "id": "w1", "levelId": "L0", "a": [x,y], "b": [x,y], "thickness": 0.1,
                "height": 2.5, "joinStart": "w4", "joinEnd": "w2", "arcExtent": 0 } ],
  "openings": [ { "id": "o1", "wallId": "w1", "type": "door", "offsetAlongWall": 1.4,
                  "width": 0.9, "height": 2.05, "sillHeight": 0, "openAngle": 1.57 } ],
  "furniture": [ { "id": "f1", "levelId": "L0", "kind": "bed", "x": 2, "y": 3, "angle": 1.57,
                   "w": 1.4, "d": 1.9, "h": 0.5, "color": "#aab" } ],
  "annotations": { "dimensions": [ { "a":[x,y],"b":[x,y],"offset":0.5 } ],
                   "labels": [ { "x":1,"y":1,"text":"Entry","size":0.3 } ] } }
```

| Concern | Sweet Home 3D `Home.xml` | Simple JSON schema | Which is better for CasaPlazAI |
|---|---|---|---|
| Root versioning | `version` integer, handler upgrades 5500→7400 | `version` integer | Same idea; **adopt** |
| Units | cm, angles rad | m (SI) | JSON in metres is friendlier for a Three.js app **INFERRED** |
| Storeys | `level` entities, everything has `level IDREF` | `levels[]` + `levelId` FK | **Adopt** — currently likely missing |
| Walls | first-class, `wallAtStart/End` IDREF joins, `thickness`, per-side colours, `arcExtent` | `walls[]` with `joinStart/joinEnd` | **Adopt joins+thickness**; arcs optional |
| Rooms | independent inset polygon, disjoint sub-areas allowed, no wall FK | independent polygon | Same shape; **add** "room is inset from wall face" rule |
| Openings | free x/y/angle + **ratios** (`wallThickness`, `wallDistance`), SVG `cutOutShape`, `sash` | `wallId` + `offsetAlongWall` | **Hybrid**: keep `wallId`+offset for editability, add ratio/thickness so it re-centres when the wall thickens |
| Furniture | catalog ref + instance transform + per-face named `material` slots + `furnitureGroup` nesting + cached `widthInPlan/depthInPlan` | flat `kind` + transform | **Adopt**: catalogId indirection, group nesting, plan-cached AABB |
| Metadata | `id`, `name`, `visible`, `movable`, `description`, `price`, open `property` bag | minimal | **Adopt** `id`+`name`+`visible`+`locked`; keep a free `meta` bag |
| Cameras | `observerCamera`/`storedCamera` named viewpoints + `topCamera` | absent (web app has its own 3D camera) | **Adopt** named saved viewpoints for walkthrough |
| Directives | `environment`, `print`, `compass` | absent | Adopt a small `view`/`scene` block; skip `print`/compass |
| Assets | models/textures **inside** the ZIP, referenced by entry name, with SHA-1 digests | not applicable (small built-in palette) | **Take the digest idea** for localStorage robustness, not binary embedding |

### 2.10 Ideas for CasaPlazAI (ranked by value / effort)

Each idea is tied to a finding above.

| # | Idea | Tied to | Value | Effort | Why |
|---|---|---|---|---|---|
| 1 | **Add `level`/storey entity + `levelId` on every object**, even if v1 only has "Ground floor" | §2.3, §2.9 | High | Low | Unblocks multi-storey later without a schema migration; matches Sweet Home 3D's single flat list |
| 2 | **Promote walls to first-class objects with `joinStart`/`joinEnd` IDs and a `thickness`** instead of inferring shared edges from coincident room vertices | §2.4 | High | Medium | Floating-point vertex coincidence is the classic source of "shared wall" bugs; IDs make joins explicit and editable; enables per-side wall colours and 3D wall extrusion |
| 3 | **Make openings wall-relative and re-centring**: store `wallId` + `offsetAlongWall` *and* a `wallThicknessRatio`, and model the hole as a normalised `cutOutShape` path (or at least a rect+arc descriptor) | §2.6 | High | Medium | Doors/windows survive wall thickening and wall drags; SVG-path cut-outs are what lets Sweet Home 3D support arched/triangular windows with no new code |
| 4 | **Add `version` to the localStorage plan + a migration switch** | §2.1, §2.9 | High | Low | The app is mid-redesign; a single integer + `migrate()` prevents wiping users' autosaved plans |
| 5 | **Give every entity a stable `id` (UUID) plus `name`, `visible`, `locked`/`movable`** | §2.3 | High | Low | Enables undo/redo by reference, layer visibility, selection across the single-workspace UI, and stable React/Three.js keys |
| 6 | **`furnitureGroup` nesting + a catalogId indirection** (palette item id + instance transform, rather than only a `kind` string) | §2.7 | Medium | Medium | Lets users group a "bed + two nightstands", and lets the palette grow without changing the persisted shape |
| 7 | **Cache the rotated plan AABB per furniture piece** (`widthInPlan`/`depthInPlan`) and use it for hit-testing/collision | §2.7 | Medium | Low | Fixes rotated-furniture collision/fit bugs cheaply and avoids recomputing the OBB every drag frame |
| 8 | **Named saved viewpoints** (`camera` with `attribute='storedCamera'`, `name`, x/y/z/yaw/pitch/fov) | §2.3 | Medium | Low | Directly upgrades the 3D walkthrough; named "Entrance/Bedroom/Kitchen" cameras come for free from one array |
| 9 | **Per-object `textStyle` defaults with an `attribute` discriminator** (nameStyle/areaStyle/lengthStyle) | §2.3, §2.5 | Medium | Low | One styling object reused everywhere instead of three ad-hoc style fields |
| 10 | **A `ContentDigests`-style integrity check for localStorage autosave** (hash the serialised plan; on mismatch offer "recover last good") | §2.2 | Medium | Low | Cheap insurance; the desktop app writes digests precisely to support "damaged home" repair |
| 11 | **Annotation primitives as first-class entities**: `dimensionLine` with a perpendicular `offset`, `label` with free angle/colour, `polyline` with cap/join/dash/arrow enums | §2.5 | Medium | Medium | CasaPlazAI already measures; these enums make leader lines, room labels and dashed guides trivial |
| 12 | **Curved walls via an `arcExtent` on the wall element** rather than a new entity type | §2.4 | Low | Medium | Same element, same joins; worth deferring past the redesign |
| 13 | **Open `property` key/value bag on the root** for author/licence/notes | §2.3 | Low | Low | Zero-schema-cost extensibility; Sweet Home 3D uses it for Author/Copyright/License |
| 14 | **Self-contained export**: extend PNG/JPEG export to a JSON+embedded-assets archive with digests | §2.2, §2.9 | Low | High | Out of scope for a 0.5 m-grid web planner, but a nice "share my plan" end-state |

---

## 3. Unknowns / what I could not verify

1. **No live screenshot of the online JS app.** REA's `capture-browser-scenario` launches its own Chromium 156 and reached the page (network + console events captured), but the heavy page (2.6 MB app bundle + 9 example thumbnails + analytics + iubenda consent + a Cloudflare insights beacon) exceeded the provider's built-in **200 s** deadline twice (`code: provider_timeout`, `rea/online_shot2.json`), and my own headless Chrome launch crashed under the workspace sandbox (`Trace/BPT trap: 5`). I therefore have **no PNG of the app's UI**; all online-version claims come from its shipped JavaScript and the recorded network graph, which is still direct evidence. **UNVERIFIED**: exact current UI layout/labels of Sweet Home 3D JS Online.
2. **I did not open the desktop app** (no installer run, per the task rules and the GPL "describe, don't copy" constraint). Desktop behaviour is inferred from source + file evidence.
3. **`Home` binary entry contents** were only inspected as a magic/type check, not deserialised — I confirmed `com.eteks.sweethome3d.model.Home` and Java serialisation v5 but did not map every field (the XML is the documented model anyway).
4. **`version` changelog per number**: I confirmed `CURRENT_VERSION=7400` and that the handler upgrades old files, and saw a comment about "wallCutOutOnBothSides // false for version < 5.5"; I did **not** obtain a complete version→feature table. Any migration CasaPlazAI writes should be its own, based on its own schema.
5. **The `3DS`/`DAE`/`OBJ` model-in-container details** (which `.mtl`/texture siblings get pulled in) are documented in `DefaultHomeOutputStream`'s writing logic but I did not trace every branch.
6. **Licensing**: Sweet Home 3D source and format descriptions are **GPL-2.0+** and the bundled examples/assets are **CC-BY-3.0 / GPL**. Nothing here is copied into our codebase; `Home.xml.dtd` and the example/real files are retained as *reference evidence* only. Any implementation must be written independently from these behaviour descriptions.
7. **Web search was unavailable** (no `DEEPSEEK_API_KEY` configured), so discovery relied on the sweethome3d.com sitemap, the Debian source mirror, and direct URL probing rather than a search index. The legacy SourceForge code browser and GitHub mirror are gone/Cloudflare-blocked (403), which is why the Debian mirror was used.

---

## 4. Job folder contents (evidence map)

| Path | What it is |
|---|---|
| `Home.xml.dtd` | The authoritative DTD, extracted verbatim from `HomeXMLHandler` (reference only) |
| `docs_src/*.java` | Official source: `HomeXMLHandler`, `HomeXMLExporter`, `HomeFileRecorder`, `DefaultHomeInputStream/OutputStream`, `Home`, `Room`, `Wall`, `Level`, `DimensionLine`, `HomeDoorOrWindow`, `LengthUnit` |
| `examples/*.xml` | The 7 official example homes (v5500) shipped with Sweet Home 3D |
| `sh3d_samples/Blues_ziplisting.txt`, `sh3d_samples/Modern_Flat_ziplisting.txt` | ZIP entry inventories of two **real shipping** `.sh3d` files (v7400) |
| `sh3d_samples/blues/Home.xml`, `…/ContentDigests` | Extracted XML + digest file proving the container layout |
| `online_js/sweethome3d.min.js` (+8 libs) | The shipped HTML5 app bundle; source of the "same model in the browser" claim |
| `online_app.html`, `gallery.html`, `page-sitemap.xml` | Live pages used to locate the JS app and the downloadable `.sh3d` samples |
| `docs_html_plugin.html`, `docs_html_de.html`, `docs_html_history.html` | Official plug-in developer's guide, German user guide, version history |
| `rea/online_capture.json`, `rea/online_capture_summary.json` | REA scenario evidence against `SweetHome3DJSOnline.jsp` (network graph, console, browser identity) |
| `rea/online_shot*.json`, `rea_scenario.json`, `rea_shot*.json` | REA runs/inputs incl. the two provider-timeout results |
| `casaplazai-plan.schema.json` | Proposed comparison schema (not Sweet Home 3D's format) |
| `sources.json` | Machine-readable source list with access notes and licences |
