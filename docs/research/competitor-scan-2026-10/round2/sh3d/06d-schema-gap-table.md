# Sweet Home 3D `Home.xml` ↔ CasaPlazAI `FloorplanData` v1 — field-by-field gap analysis

Job: `04-06d-sh3d-file-format-schema-gap` · Round 2, narrow follow-up to `rea-sweethome3d-2026-10/06-06-sh3d-file-format` (its `report.md` and evidence folder were read in full and reused read-only; nothing there was re-derived except where this report says "re-verified") · App: Sweet Home 3D 7.5.2, `HOME` XML `CURRENT_VERSION=7400`, GPL-2.0+ · Targets: <https://www.sweethome3d.com/de/> and <https://www.sweethome3d.com/SweetHome3DJSOnline.jsp> · Target schema: `~/dsh-workspaces/rea2-shared/casaplazai-schema.md` (read-only)

Evidence legend: **OBSERVED** = I parsed a live artefact / real file in this round and recorded the derived numbers here · **DOCUMENTED** = vendor DTD, shipped source javadoc, or release notes · **INFERRED** = my reasoning. Source files read this round live in the round-1 folder (GPL-2.0+ reference only) and the DTD copied to `evidence/Home.xml.dtd`; no code or data is copied into anything intended for reuse.

Method note: I built a structured model of the format by parsing the DTD's **32 `<!ELEMENT>` declarations, 31 of which carry an `<!ATTLIST>`** (431 attributes in total; `text` is PCDATA-only), and then cross-checking it against **8 real `Home.xml` files** (7 official examples v5500 + one shipping gallery file v7400). That yields a grounded distinction between *declared* and *actually used* fields: **219 of the 431 declared attributes appear in at least one real file; 212 never do** (`evidence/attr_file_presence.json`, `evidence/attrs_used_per_element.json`). Percentages below are mine. A by-product of that cross-check is itself a finding: real files contain exactly **one attribute not declared in the DTD** — `doorOrWindow@depthInPlan` (the rotated plan-AABB cache, §2.6), found only in the v7400 file — so the DTD is almost, but not perfectly, authoritative. **OBSERVED**

---

## 1. Summary (5 bullets)

- **CasaPlazAI's `FloorplanData` v1 covers about a quarter of the field surface of a real `Home.xml`**: 3 entity kinds (Room, Opening, FurnitureItem) and **26 distinct field names** vs Sweet Home 3D's 32 elements and **185 distinct attribute names, of which 109 are actually exercised by real files**. Only **6 names are shared** (`id`, `name`, `width`, `height`, `wallHeight`, `wallThickness`). Of the DTD's **431 declared attributes, 219 appear in at least one real file and 212 never do**. The missing surface is concentrated in three structural axes: **levels**, **walls as entities**, and **per-object presentation/metadata**. **OBSERVED/DOCUMENTED**
- **The single hardest incompatibility is that Sweet Home 3D has `level`, `wall`, `dimensionLine`, `label` and `polyline` as first-class entities with `id` + `level IDREF`, while CasaPlazAI has no level entity, no wall entity, and deliberately keeps measurements, labels and the blueprint underlay *out* of `FloorplanData`.** Walls in CasaPlazAI are inferred from room-polygon segments; in Sweet Home 3D a wall is an independent segment with its own `id`, `thickness`, joins and per-side finishes, and the room polygon is merely *inset* from it. **OBSERVED/DOCUMENTED**
- **Two concrete, load-bearing incompatibilities were measured, not assumed**: (a) Sweet Home 3D has **no polygon winding convention** — 52 of 70 real room polygons wind clockwise (74.3%), and the split is arbitrary even within one file (`3BedroomHouseWithMezzanine.xml`: 12 CW vs 11 CCW), so CasaPlazAI's `non-ccw-polygon` validator would reject ~74% of real rooms; (b) room vertices sit at the wall **face** (median offset ÷ half-thickness = **1.000**, 65.0% of vertices in [0.85,1.15]) but **17.4% sit on the centreline**, so the inset is *per-vertex*, not a single global offset. A naive import would fail validation most of the time and place every wall half a thickness off. **OBSERVED (this round: `evidence/room_winding.json`, `evidence/room_wall_inset.json`)**
- **Doors/windows are modelled on a different axis**: Sweet Home 3D stores a *free* `x`/`y`/`angle` plus six unitless **ratios** describing how the piece embeds into whatever wall it overlaps, and the hole is an SVG `cutOutShape` present on **192/192** real openings; CasaPlazAI stores `roomId` + `segmentIndex` + normalised `tCenter`. I verified the ratio is a **stored snapshot, not a live derivation**: for openings lying exactly on a wall axis, `wallThickness × pieceDepth` equals the wall thickness with **median error 0.001 cm** (22/27 exact), and the 5 exceptions are door frames deliberately thicker than their wall. **OBSERVED/DOCUMENTED**
- **The migration story is cheap and additive**: Sweet Home 3D already proves the versioned-format pattern (`version` integer + in-memory upgrade, handler accepts `5500` and current is `7400`), and CasaPlazAI's `registerTransform`/`SCHEMA_VERSION` machinery is *stricter and better specified* than Sweet Home 3D's. The work is adding entities and foreign keys (levels first, then `walls[]`, then opening ratios), not redesigning evolution — and the sh3d→CasaPlazAI convert step must normalise winding, resolve the per-vertex inset, synthesise ids for the entities that lack one (70% of rooms, 74% of furniture, 100% of dimension lines and labels), and pass through `validate()`. **DOCUMENTED/INFERRED**

---

## 2. Findings

### 2.0 How to read the gap tables

- "**SH3D field**" — attribute name exactly as written in the DTD, with its DTD default in parentheses. Sweet Home 3D *omits* any attribute equal to its default (`writeFloatAttribute(name, value, default)` in `HomeXMLExporter`), so absence means "default", not "unknown". **DOCUMENTED**
- "**Real-file use**" — occurrence count across the 8 files (out of 836 `pieceOfFurniture`, 395 `wall`, 192 `doorOrWindow`, 100 `room`, 13 `level`, 69 `light`, 229 `texture`, 95 `dimensionLine`, 11 `label`, 7 `polyline` elements). **OBSERVED**
- "**CasaPlazAI v1**" — the field in `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`, or `—` when absent.
- "**Verdict**" is one of `equivalent` · `same-concept-different-shape` · `missing-in-casaplazai` · `missing-in-sh3d` · `not-applicable`.
- Sweet Home 3D lengths are **centimetres**, angles **radians**; CasaPlazAI is **metres**/**degrees**. This is a one-line conversion at the boundary and is noted once here rather than repeated in every row. **DOCUMENTED**

### 2.1 Root / document envelope (`<home>`, 8 attributes)

| SH3D field | Real-file use | Meaning | CasaPlazAI v1 | Verdict | Migration note |
|---|---|---|---|---|---|
| `version` | 8/8 (`5500` in examples, `7400` shipping) | Format version; handler upgrades older payloads in memory | `schemaVersion: 1` (must equal `SCHEMA_VERSION` exactly) | **equivalent** | CasaPlazAI's rule is stricter: older→`migrate()`, newer→`future-version` reject. Sweet Home 3D silently upgrades. Keep CasaPlazAI's rule. |
| `name` | 8/8 (e.g. `Studio.sh3d`) | Document title | — | missing-in-casaplazai | Add optional `name` for export filenames / share-link titles. Trivial. |
| `camera` (`topCamera`) | 8/8 | Which camera view is "current" | — | not-applicable | Viewer state, not plan data. |
| `selectedLevel` | 4/8 | FK to the level being edited | — | missing-in-casaplazai | Follows from adding levels; UI state, belongs in the editor key not the contract. |
| `wallHeight` (`250.0`) | 8/8 | Global default clear height; per-wall `height` overrides it | `wallHeight` (m, >0) | **same-concept-different-shape** (units) | CasaPlazAI's global is fine; the gap is that it has **no per-wall override**. |
| `basePlanLocked` (`false`) | 0/8 declared (state is expressed by the missing attribute) | Lock the base/underlay image | — (underlay is out-of-schema, `casaplaza.underlay.v1`) | missing-in-casaplazai (deliberate) | Add a `locked` flag to the underlay's editor-local key, not to `FloorplanData`. |
| `furnitureSortedProperty`, `furnitureDescendingSorted` | 5/8 | Furniture-list sort UI state | — | not-applicable | Editor chrome; correctly outside the contract. |
| `property*` (`name`,`value`,`type` STRING\|CONTENT) | 42 uses | **Open key/value bag on the root and on most elements** | — (no extension bag anywhere) | missing-in-casaplazai | Highest-leverage cheap addition: `meta?: Record<string,string>` on the root. Note the real v7400 file stores 14 `com.eteks.*` UI keys (window geometry, divider positions, plan scale) in this bag — i.e. Sweet Home 3D itself uses the *document* to persist *editor chrome*. **OBSERVED** |

`environment`, `print`, `printedLevel`, `compass` and `backgroundImage` (root-level) are **all absent from CasaPlazAI**, and they split sharply by how often real files use them. `print`/`printedLevel` appear in **0/8** files (only defaults), `backgroundImage` in **0/8**, and `compass` in **8/8** (x, y, diameter, northDirection, longitude, latitude, timeZone — i.e. real geographic orientation on every example). `environment` appears in 8/8 but only through its colour/photo/video attributes; its `drawingMode`, `wallsAlpha`, `allLevelsVisible` and `observerCameraElevationAdjusted` are never written. `backgroundImage` is the direct analogue of CasaPlazAI's blueprint underlay (issue #99) — Sweet Home 3D models it as `image` + two scale-point pairs + origin + visibility, i.e. a **calibrated, persistent** underlay — yet it appears in none of the 8 files, because a `.sh3d` nobody has loaded a scan into simply has no such element. CasaPlazAI's underlay likewise lives outside the schema by design. **OBSERVED/DOCUMENTED**

### 2.2 `level` — the largest structural gap (8 attributes, 13 elements)

CasaPlazAI has **no level entity in `FloorplanData` at all**, although multi-floor editing is a shipped editor feature and the underlay is keyed by `floorId`. Sweet Home 3D's `level` is a complete storey record:

| SH3D field | Real-file use | Meaning | CasaPlazAI v1 | Verdict |
|---|---|---|---|---|
| `id` (ID `#REQUIRED`) | 13/13 | Level identity, target of every `level IDREF` | — | missing-in-casaplazai |
| `name` (`#REQUIRED`) | 13/13 (`Basement`, `1st floor`, `Attic`, `Roof`) | Storey name | — | missing-in-casaplazai |
| `elevation` (`#REQUIRED`) | 13/13 (`-150.0`, `0.0`, `112.0`, `262.0`, `374.0`, `524.0`) | Floor level in cm | — | missing-in-casaplazai |
| `floorThickness` (`#REQUIRED`) | 13/13, always `12.0` | Slab thickness; next storey typically starts at `elevation + height + floorThickness` (0 → 262 = 0+250+12) | — | missing-in-casaplazai |
| `height` (`#REQUIRED`) | 13/13, always `250.0` | Clear height of this storey | `wallHeight` is global | same-concept-different-shape — moved from global to per-storey |
| `elevationIndex` (`-1`) | 13/13, values `0` and `1` | Tie-break **ordering** for levels at the same elevation (v5.0: "Managed levels at the same elevation as layers with an order index") | — | missing-in-casaplazai |
| `visible` (`true`) | 7/13 | Shown in the plan | — | missing-in-casaplazai |
| `viewable` (`true`) | 0/13 | Rendered in 3D | — | missing-in-casaplazai |

**OBSERVED** by me: real files contain **0–4 levels** and, importantly, the number of levels is *not* derivable from room or wall data — `2BedroomApartment.xml` has walls/rooms/floors but **zero** `level` elements, while `2BedroomHouseWithBasement.xml` has three. So level information is genuinely optional and genuinely independent. The `Attic`/`Roof` pair share `elevation=524.0` and are separated only by `elevationIndex` (`0` vs `1`) — proof that `elevationIndex` is a real ordering device, not decoration. **OBSERVED/DOCUMENTED**

**INFERRED**: for CasaPlazAI the minimum viable addition is `levels: [{id, name, elevation, height, floorThickness, elevationIndex, visible}]` plus a `levelId` FK on rooms/openings/furniture, defaulting to a single implicit `L0` so existing payloads migrate with a pure `registerTransform` step.

### 2.3 `wall` — the second structural gap (18 attributes, 395 elements)

CasaPlazAI has **no wall entity**. A "wall" is a room-polygon segment plus one global `wallThickness`; "shared walls" are two rooms whose segments coincide, reinforced by the **two-row shared-door convention** (a door on a shared wall is emitted twice, mirrored). Sweet Home 3D takes the opposite approach:

| SH3D field | Real-file use | Meaning | CasaPlazAI v1 | Verdict |
|---|---|---|---|---|
| `id` (ID `#REQUIRED`) | 395/395 | Wall identity | — | missing-in-casaplazai |
| `level` (IDREF) | 283/395 | Owning storey | — | missing-in-casaplazai |
| `xStart`/`yStart`/`xEnd`/`yEnd` (`#REQUIRED`) | 395/395 | Wall centreline segment | implicit: consecutive room `polygon` vertices | **same-concept-different-shape** — CasaPlazAI's segment *is* the wall, but only via the room |
| `thickness` (`#REQUIRED`) | 395/395 (`7.5`, `10.0`, `20.0`, …) | Per-wall thickness | one global `wallThickness` | missing-in-casaplazai (per-wall) |
| `height` / `heightAtEnd` | 395/395 / 11/395 | Height, optionally tapering to a different height at the end point | `wallHeight` global, per-room `wallsOverride` by `segmentIndex` | **same-concept-different-shape** — CasaPlazAI overrides by room segment; Sweet Home 3D by wall end |
| `wallAtStart` / `wallAtEnd` (IDREF) | 285/395 each | **Explicit, symmetric joins to the walls at each end** | — (coincident vertices only) | missing-in-casaplazai |
| `arcExtent` | 1/395 | Curved wall (radius = length/|arc|) | — | missing-in-casaplazai (CasaPlazAI has no arcs) |
| `topColor`, `leftSideColor`, `rightSideColor`, `leftSideShininess`, `rightSideShininess` | 262 / 281 / 358 / 6 / 2 | Per-wall-face paint in plan and 3D | — | missing-in-casaplazai |
| `pattern` | 395/395 (!) | Hatch pattern drawn in plan | — | missing-in-casaplazai |
| child `texture` ×2 with `attribute='leftSideTexture'\|'rightSideTexture'` | 61 textures carry `attribute` | Per-side wall texture | room-level `floorTexture` enum only | missing-in-casaplazai |
| child `baseboard` ×2 with `attribute='leftSideBaseboard'\|'rightSideBaseboard'` | 374 baseboards | Skirting boards | — | missing-in-casaplazai |

**OBSERVED** highlights: `thickness` varies *within* a single file (7.5 cm interior vs 20 cm exterior), so a single global `wallThickness` cannot represent a real Sweet Home 3D plan. `pattern` is present on **395/395** walls — Sweet Home 3D writes it explicitly even though the DTD has no default, which means plan-hatch is considered part of the wall, not of the renderer. `heightAtEnd` (11 uses) is how a wall slopes/tapering is stored without a second entity. I also verified the join graph at corpus scale: of **400 join references, all 400 are symmetric** (the referenced wall points back) with **0 asymmetric and 0 dangling** — so the join invariant CasaPlazAI would need to maintain is genuinely enforced in the data, not merely documented. The single curved wall resolves to `chord=657.2 cm, arcExtent=0.6981317 rad (40.0°), radius=941.33 cm`, confirming round 1's `radius = length/|arcExtent|` formula on real values. **OBSERVED**

**INFERRED**: because CasaPlazAI already validates `wallHeight` and `wallsOverride.segmentIndex`, adding a `walls[]` array keyed by id and giving rooms an *optional* `walls: string[]` reference is an additive, non-breaking change; the existing segment-index override can remain as the fallback.

### 2.4 `room` (17 attributes, 100 elements) — closest match, three real divergences

| SH3D field | Real-file use | Meaning | CasaPlazAI v1 | Verdict |
|---|---|---|---|---|
| `id` (ID `#IMPLIED`) | 30/100 | Room identity — **optional in Sweet Home 3D** | `id` (required, unique among all entities) | CasaPlazAI is stricter; a strict subset of real SH3D data would need synthesised ids for 70/100 rooms |
| `name` (`#IMPLIED`) | 78/100 | Display name — **optional** | `name` (required, non-empty, `bad-name`) | CasaPlazAI stricter |
| `level` (IDREF) | 77/100 | Storey | — | missing-in-casaplazai |
| child `point+` (`x`,`y`) | 1123 points | Polygon vertices | `polygon: [x,y][]` | **same-concept-different-shape** — see winding + inset below |
| — | — | **Winding convention** | CCW mandatory (`non-ccw-polygon`) | **missing-in-sh3d** — measured **52 CW vs 18 CCW** |
| — | — | **Polygon ↔ wall relationship** | polygon = wall surface, openings parameterised on its segments | **divergent** — Sweet Home 3D polygon is *inset* from the wall: 65.0% of vertices on the wall face, 17.4% on the centreline, no single rule |
| `floorColor`, `floorShininess`, `floorVisible` | 62 / 0 / 6 | Floor paint / gloss / visibility | `floorTexture` enum (`wood\|tile\|carpet\|concrete\|null`) | **same-concept-different-shape** — arbitrary colour vs closed enum |
| `ceilingColor`, `ceilingShininess`, `ceilingVisible`, `ceilingFlat` | 53 / 0 / 22 / 30 | **Ceiling is a first-class surface** | — (no ceiling model at all) | **missing-in-casaplazai** |
| child `texture` ×2 (`attribute='floorTexture'\|'ceilingTexture'`) with `width/height/xOffset/yOffset/angle/scale/image` | 229 textures; 61 with `attribute` | Calibrated, tiled, rotated, offset image | enum only | missing-in-casaplazai |
| `nameAngle`, `nameXOffset`, `nameYOffset` | 2 / 46 / 44 | Label placement relative to polygon centre | — (labels are out-of-schema) | missing-in-casaplazai (deliberate) |
| `areaVisible`, `areaAngle`, `areaXOffset`, `areaYOffset` | 84 / 1 / 46 / 45 | Computed-area label placement | — | missing-in-casaplazai (deliberate) |
| child `textStyle` ×2 (`attribute='nameStyle'\|'areaStyle'`; `fontSize` 18/18, `attribute` 7/18) | 18 | Per-room text styling | — | missing-in-casaplazai (deliberate) |
| `property*` | frequent | Extension bag | — | missing-in-casaplazai |

Two measurements that change how a migration must be written:

**Winding.** I computed the shoelace signed area of every real room polygon: **52 clockwise (74.3%) vs 18 counter-clockwise (25.7%)**, 0 degenerate. CasaPlazAI's validator rejects `signed area <= 0` with `non-ccw-polygon`. Worse than a fixed skew, the sign is essentially **arbitrary and even splits within a single file** — `3BedroomHouseWithMezzanine.xml` has 12 CW vs 11 CCW rooms and `Studio.xml` has 2 CW vs 3 CCW. Sweet Home 3D simply has no winding convention. **Therefore ~74% of real Sweet Home 3D rooms would be rejected unmodified**, and the fix is a one-line winding normalisation at import. **OBSERVED** (`evidence/room_winding.json`)

Also confirmed while measuring: **no room polygon repeats its first vertex at the end** — which happens to match CasaPlazAI's "Polygons do NOT repeat the first vertex at the end" rule exactly. That rule is compatible; only the sign is not.

**Inset.** For every room vertex I found the nearest wall centreline and compared the perpendicular distance to half the wall thickness. Across the 8 files (883 vertices) the **median ratio is exactly 1.000**, and the distribution is concentrated and bimodal rather than uniform:

| ratio (vertex offset ÷ half-thickness) | share | meaning |
|---|---|---|
| ~0 (`< 0.05`) | **17.4%** | vertex sits **on the wall centreline** |
| 0.05–0.5 | 5.0% | part-way into the wall |
| 0.5–0.85 | 2.9% | approaching the face from inside |
| 0.85–1.15 | **65.0%** | vertex sits **on the wall face** — the dominant convention |
| 1.15–2.5 | 6.3% | inset beyond the face |
| > 2.5 | 3.3% | no relevant wall nearby (open boundary / junction) |

(883 vertices total, buckets sum to 99.99%; `p10=0.007, p25=0.748, p75=1.000, p90=1.082`.)

**This re-verifies round 1's single-file observation at corpus scale, and sharpens it**: Sweet Home 3D does *not* enforce one inset rule. Two thirds of vertices are pulled to the wall face, one sixth stay on the centreline (rooms the user drew along a wall axis and never recomputed), and the rest are non-wall boundaries. It matters because CasaPlazAI's `segmentIndex`/`tCenter` openings and `wallsOverride` are defined against the room polygon; if a Sweet Home 3D room is imported verbatim, the wall CasaPlazAI extrudes from that polygon will sit half a thickness outside where Sweet Home 3D put it, and openings will shift with it. A converter must therefore treat the inset as **per-vertex, not per-room**, and cannot use a single global offset. **OBSERVED** (`evidence/room_wall_inset.json`)

*(Caveat, honestly stated: the ratio is measured against the *nearest* wall, so vertices at a T-junction or bounded by a nearer unrelated wall contribute to the 3.3% tail. Restricting to vertices within 2 half-thicknesses of a wall (n=849) keeps the median at exactly 1.000 and gives 67.6% on the face / 18.7% on the centreline — the conclusion is robust to the cut.)*

### 2.5 `doorOrWindow` (51 attributes, 192 elements) vs `Opening`

CasaPlazAI `Opening`: `id`, `roomId`, `kind: "door"|"window"`, `segmentIndex`, `tCenter`, `width`, `sillHeight`, `headHeight`.

| SH3D field | Real-file use | Meaning (javadoc) | CasaPlazAI v1 | Verdict |
|---|---|---|---|---|
| `x`, `y` (`#REQUIRED`) | 192/192 | Free position — **not** a wall or room FK | `roomId` + `segmentIndex` + `tCenter` | **same-concept-different-shape** (1-D parameter vs free 2-D) |
| `angle` (`0`) | 159/192 | Free rotation | implied by the segment | same-concept-different-shape |
| `width` (`#REQUIRED`) | 192/192 | Opening width | `width` | equivalent |
| `depth` (`#REQUIRED`) | 192/192 | Piece depth (used as the denominator of the ratios) | — (implicit in wall thickness) | missing-in-casaplazai |
| `height` (`#REQUIRED`) | 192/192 | Piece height | `headHeight` − `sillHeight` | same-concept-different-shape |
| `elevation` (`0`) | 101/192 | **Sill height** (window) or 0 (door) | `sillHeight` (doors forced to 0) | **equivalent in meaning, different name** |
| — | — | `kind` discriminator | `kind: "door"\|"window"` (validated, `unknown-opening-kind`) | **missing-in-sh3d** — SH3D has one `doorOrWindow` type, disambiguated by model/elevation/sashes |
| `wallThickness` (`1`) | 116/192 | "thickness of the wall … **a value in percentage of the depth**" — i.e. fraction of the piece's own depth | — | missing-in-casaplazai |
| `wallDistance` (`0`) | 47/192 | "distance between the back side of this door or window and the wall … in percentage of the depth" | — | missing-in-casaplazai |
| `wallWidth`/`wallLeft` (`1`/`0`) | 0/192 | Width/left-offset of the wall *part* the piece occupies | — | missing-in-casaplazai (unused) |
| `wallHeight`/`wallTop` (`1`/`0`) | 0/192 | Height/top-offset of that wall part | — | missing-in-casaplazai (unused) |
| `cutOutShape` | **192/192** | SVG path (unit square 0..1) describing the hole cut in the wall | — (rectangular hole implied) | **missing-in-casaplazai** |
| `boundToWall` (`true`) | 52/192 | `false` ⇒ free-standing piece that merely shares the type | — | missing-in-casaplazai |
| `wallCutOutOnBothSides` (`false`) | 192/192 | Cut both wall faces (v5.5) | — | missing-in-casaplazai |
| `widthDepthDeformable` (`true`) | 3/192 | Whether width/depth may change independently | — | missing-in-casaplazai |
| child `sash*` (`xAxis`,`yAxis`,`width`,`startAngle`,`endAngle`) | 96 sashes | Movable panels of a door/window (hinge axis, swing arc) | — | **missing-in-casaplazai** — no notion of an opening panel/swing arc |
| `catalogId`, `model`, `icon`, `modelSize`, `dropOnTopElevation`, `color`, `shininess`, … | 192 for most | Catalogue + appearance (shared with `pieceOfFurniture`) | — | missing-in-casaplazai |

**Re-verified numeric claim** (round 1 asserted it from javadoc; I confirmed it in data): `wallThickness` **is** `wallThicknessCm / pieceDepthCm`, stored as a *snapshot* at author time. Restricting to the 27 openings that lie exactly on a wall axis (perpendicular offset < 1 cm, i.e. definitely the wall they were authored on), **22/27 = 81.5% satisfy `wallThickness × depth == wall thickness` with median error 0.001 cm** — exact reproduction, not approximation. Example: declared `0.110294` vs computed `0.110293`.

The 5 non-matching cases are all named `Door frame` / `Front door` / `French window` and are *deliberately* thicker than the wall they sit in (e.g. `wt×depth = 26.0` at a 16.0 cm wall) — the frame straddles the wall on purpose. So the ratio is **not** a live derivation from the wall; it is a stored property of the piece. That distinction matters for CasaPlazAI: adding `wallThicknessRatio` must be a *stored* field, not a computed one, or these intentional overhangs are lost. **OBSERVED**

An earlier, looser pass over all 104 openings-with-`wallThickness` (matching each to its *nearest* wall regardless of offset) reproduced the declared value in 88/104 cases within 0.06; the additional mismatches there come from openings nearest a junction/other wall. Both passes agree on the direction and the magnitude of the effect.

**A structural difference worth naming**: because Sweet Home 3D stores a *free* piece with wall-relative *ratios* and **no wall FK**, one `doorOrWindow` object represents a door in a shared wall. CasaPlazAI's convention emits **two mirrored `Opening` rows** for the same physical door (advisor ruling #2). So a round-trip must decide: is a shared door one persisted object or two? Sweet Home 3D's answer is one; CasaPlazAI's is two. Both can be right, but the choice must be explicit or the round trip doubles/halves doors. **OBSERVED/DOCUMENTED + INFERRED**

Also **OBSERVED**: doors project onto their nearest wall segment with parameter `t ∈ [0,1]` only **61.3%** of the time (87/142), and the perpendicular offset from the wall axis has median 2.19 cm and max 35.77 cm. Sweet Home 3D genuinely does not require an opening to lie *within* one wall segment — it is an overlap test, not a containment test. That is exactly the invariant CasaPlazAI's `tCenter ∈ [0,1]` + `opening-too-wide` validator enforces.

### 2.6 `pieceOfFurniture` (47 attributes, 836 elements) vs `FurnitureItem`

CasaPlazAI `FurnitureItem`: `id`, `type` (closed 7-member enum), `roomId`, `position`, `rotationDeg`, `footprint: [a,b]`.

| SH3D field | Real-file use | CasaPlazAI v1 | Verdict |
|---|---|---|---|
| `id` (`#IMPLIED`) | 218/836 | `id` (required) | CasaPlazAI stricter — but note **74% of real furniture has no id**, so ids must be synthesised on import |
| `name` (`#REQUIRED`) | 836/836 | — | missing-in-casaplazai (instance has no label) |
| `x`,`y` (`#REQUIRED`) | 836/836 | `position: [x,y]` | equivalent |
| `angle` (`0`) | 636/836 | `rotationDeg` (degrees; SH3D radians) | same-concept-different-shape |
| `width`,`depth`,`height` (`#REQUIRED`) | 836/836 | `footprint: [a,b]` — **no height** | **missing-in-casaplazai** (height) |
| `elevation` (`0`) | 211/836 | — (everything is floor-mounted) | missing-in-casaplazai |
| `level` (IDREF) | 549/836 | — | missing-in-casaplazai |
| **`type`** | — | closed enum of 7 | **missing-in-sh3d** — SH3D has no type field; the *catalogue model* is the type |
| `catalogId` (e.g. `eTeks#door`) | 836/836 | — (the enum plays this role) | **missing-in-casaplazai** — see §2.9 |
| `model`, `modelSize`, `modelRotation`, `modelCenteredAtOrigin`, `icon`, `planIcon`, `backFaceShown`, `modelFlags` | 836/836 for most | — | missing-in-casaplazai |
| `widthInPlan`, `depthInPlan`, `heightInPlan` | 4 / 7 / 12 | — | **missing-in-casaplazai** — cached *rotated* plan AABB (round 1 idea #7). Note: the DTD declares these on `pieceOfFurniture` only, yet the **v7400** shipping file also carries `doorOrWindow@depthInPlan` (2 instances) — the only attribute I found in the corpus that the DTD does not declare, suggesting newer versions extended plan caching to openings. |
| `pitch`, `roll` (`0`) | 6 / 4 | — | missing-in-casaplazai (horizontal-axis rotation) |
| `movable` (`true`), `visible` (`true`) | 125, 0 | — | missing-in-casaplazai (lock/hide) |
| `color`, `shininess` | 225, 78 | — | missing-in-casaplazai (per-instance recolour) |
| child `material*` (`name`,`key`,`color`,`shininess`) | 635 materials | — | missing-in-casaplazai (named per-face recolour slots) |
| child `texture*` | 229 textures overall | — | missing-in-casaplazai |
| `price`, `currency`, `valueAddedTaxPercentage` | 0/836 | — | not-applicable (out of scope) |
| `description`, `information`, `license`, `creator` | 0 / 0 / 54 / 836 | — | missing-in-casaplazai (free metadata) |
| `modelMirrored` (`false`) | 40 | — | missing-in-casaplazai |
| `resizable`,`deformable`,`texturable`,`horizontallyRotatable` | 0/836 | — | not-applicable |
| `dropOnTopElevation` (`1`) | 438 | — | missing-in-casaplazai (stacking on other objects) |
| `staircaseCutOutShape` | 5 | — | missing-in-casaplazai |
| child `property*`, `textStyle` | frequent | — | missing-in-casaplazai |
| — | — | `roomId` FK | **missing-in-sh3d** — Sweet Home 3D furniture has no room FK (only `level`), so **CasaPlazAI's `dangling-ref` is a constraint SH3D never had** |

**OBSERVED** structural facts: `catalogId`, `creator`, `model`, `icon`, `modelSize`, `name`, `width`, `depth`, `height`, `x`, `y` are present on **836/836** pieces — Sweet Home 3D furniture is *always* catalogue-backed. `color` on only 225 and `angle` on 636/836 prove that per-instance overrides are sparse and default-suppressed. `widthInPlan`/`depthInPlan` are rare (4/7) — they are a **cache that is only written when it differs from the unrotated box**, i.e. only for rotated pieces. That is a precise template for how CasaPlazAI could add a cached OBB without bloating stored plans.

### 2.7 `furnitureGroup`, `light`, `shelfUnit`, `sash`, `baseboard`, `texture`, `material`, `transformation`, `textStyle`

| SH3D element | Real-file use | CasaPlazAI v1 equivalent | Verdict | Why it matters |
|---|---|---|---|---|
| `furnitureGroup` (23 effective attrs) | 21 | — | missing-in-casaplazai | Composable nesting with its own aggregate `x/y/width/depth/height`. Direct fix for "bed + two nightstands as one unit". |
| `light` (+ `lightSource*`, `lightSourceMaterial*`) | 69 lights, 69 sources | — | missing-in-casaplazai | Parametric luminaires with `power`, colour, diameter — relevant to the 3D/walk modes. |
| `shelfUnit` / `shelf` | 0 / 0 | — | not-applicable | Declared but unused in all 8 files. |
| `texture` (`name`,`width`,`height`,`image`,`scale`,`creator`,`attribute`, `xOffset`,`yOffset`,`angle`,…) | 229 | `floorTexture` enum | missing-in-casaplazai | A texture is an image **plus calibration** (real-world size + tiling offset + rotation). |
| `material` (`name`,`key`,`color`,`shininess`) | 635 | — | missing-in-casaplazai | Named, *individually recolourable* slots inside one model. |
| `transformation` (`name`,`matrix`) | 0 | — | not-applicable | Declared but unused. |
| `textStyle` (`fontSize`,`attribute`,`fontName`,`bold`,`italic`,`alignment`) | 18 | — | missing-in-casaplazai | One reusable style object, addressed by `attribute` (nameStyle/areaStyle/lengthStyle). |
| `baseboard` (`attribute`,`thickness`,`height`,`color`) | 374 | — | missing-in-casaplazai | Only 4 attributes, always a child of a wall. Great value/effort ratio. |

### 2.8 Annotations: `dimensionLine`, `label`, `polyline`

| SH3D element | Real-file use | CasaPlazAI v1 | Verdict |
|---|---|---|---|
| `dimensionLine` (`xStart`,`yStart`,`xEnd`,`yEnd`,`offset` `#REQUIRED`; `elevationStart/End`,`endMarkSize`,`color`,`visibleIn3D`) | 95 | Out of schema — "Measurement annotations … persisted under their own key" | **missing-in-casaplazai (deliberate)** |
| `label` (`x`,`y`,`angle`,`elevation`,`pitch`,`color`,`outlineColor` + `textStyle` + `text`) | 11 | Out of schema | **missing-in-casaplazai (deliberate)** |
| `polyline` (`thickness`,`capStyle`,`joinStyle`,`dashStyle`,`dashPattern`,`start/endArrowStyle`,`closedPath`,`elevation`,`color` + `point+`) | 7 | Out of schema | **missing-in-casaplazai (deliberate)** |

**OBSERVED**: `dimensionLine.offset` (95/95) is a signed perpendicular displacement — the dimension line is drawn parallel to, and displaced from, the measured segment. `endMarkSize`, `color` and `visibleIn3D` are **all v7.2 additions** and appear in **0/8** files (the corpus predates them). `label` carries a real `text` child rather than an attribute.

**The deliberate omission is a genuine gap, not an oversight.** CasaPlazAI's schema states measurements and the underlay never cross the editor→viewer contract and are omitted from share links "BY CONSTRUCTION". Sweet Home 3D's `level IDREF` on `dimensionLine`/`label`/`polyline` shows the alternative — annotations are plan data, they carry the storey, and they therefore *do* survive export. Both are defensible; the decision should be made once, explicitly, because the two designs cannot be reconciled later without a schema bump. **DOCUMENTED + INFERRED**

### 2.9 Version → feature table (closes round-1 Unknown #4, as far as it affects this schema)

Round 1 could not obtain a version→feature map. I derived one from three sources: the `@since` tags in the model classes, the official version-history page, and the DTD defaults. **DOCUMENTED**

| Format/feature | Introduced | Evidence |
|---|---|---|
| `level`, `elevationIndex`, storeys | 3.0 (round walls) / 3.4 (`Level`) / 5.0 (`elevationIndex`, `viewable`) | `@since 3.4` on `Level`; v5.0 notes: "Managed levels at the same elevation as layers with an order index"; `@since 5.0` on `Level.getElevationIndex`/`setViewable` |
| `wall.topColor` | 4.0 | `@since 4.0` on `Wall.getTopColor`; v4.0 notes: "Pattern in plan and Top color in 3D view" |
| `cutOutShape` (getter) | 4.2 | `@since 4.2` |
| `polyline`, baseboards, `property` bag (`getProperty`/`setProperty`), `home.version` settable | 5.0 / 5.2 | `@since 5.0`, `@since 5.2` |
| `wallCutOutOnBothSides` | 5.5 | `@since 5.5`; v5.5 notes: "Made doors and windows always cut out the both sides of the walls" |
| `wallThickness`, `wallDistance`, `wallWidth`, `wallLeft`, `wallHeight`, `wallTop`, `sashes` | 6.0 | `@since 6.0` on each; v6.0 notes: "Added the ability to rotate and slide openings" |
| `id` on home objects ("Added IDs to home objects which may be modified") | 6.4 | v6.4 notes; `@since 6.4` on `Home.getHomeObjects`, `Wall.duplicate` |
| `cutOutShape` setter, `widthDepthDeformable` | 6.5 | `@since 6.5` |
| `ceilingFlat`, room bounds | 7.0 | `@since 7.0`; v7.0 notes |
| Dimension-line elevation/colour/end-mark/`visibleIn3D`, furniture sort/visible property *lists*, `additionalFurnitureProperties` | 7.2 | v7.2 notes: "Added Modify dimensions menu item to edit dimensions coordinates, color and font size. Handled dimensions display in 3D view. Added elevation dimensions" |
| `CURRENT_VERSION = 7400` | 7.4/7.5 era | `docs_src/Home.java:49` |

Two migration-relevant conclusions: (a) **`id` on objects is a relatively late addition (6.4, 2020)** — which is exactly why 70/100 rooms and 618/836 furniture pieces in the corpus carry none, and why any importer must synthesise ids; (b) the format has added **a handful of fields per release, never removed or repurposed one** — an *additive-only* discipline that CasaPlazAI's "barrel API stays additive / breaking edits to shipped types are forbidden" rule already matches.

### 2.10 What Sweet Home 3D models that CasaPlazAI has **no field** for (ranked by impact)

1. **`level`** — storey entity + `levelId` FK on everything. (§2.2)
2. **`wall`** — first-class wall with `id`, per-wall `thickness`/`height`, and `wallAtStart`/`wallAtEnd` joins. (§2.3)
3. **Ceiling** — `ceilingColor`/`ceilingVisible`/`ceilingFlat` + `ceilingTexture`. CasaPlazAI models only the floor surface. (§2.4)
4. **Per-object identity/metadata** — stable `id` on *every* entity, plus `name`, `visible`, `movable`, `description`, `license`, and an open `property` bag. (§2.1, §2.4, §2.6)
5. **Opening hole geometry & panels** — `cutOutShape` (SVG hole) and `sash` (hinge axis + swing arc). (§2.5)
6. **Wall-relative ratios** — `wallThickness`/`wallDistance` so an opening re-centres when the wall thickens. (§2.5)
7. **Catalogue indirection** — `catalogId`/`model`/`icon` instead of a closed 7-member `type` enum. (§2.6)
8. **Per-instance appearance** — `color`, `shininess`, named `material` slots, calibrated `texture`. (§2.6)
9. **Grouping** — `furnitureGroup` with aggregate extents. (§2.7)
10. **Annotations as plan data** — `dimensionLine`/`label`/`polyline` with `level` FKs. (§2.8)

### 2.11 What CasaPlazAI models that Sweet Home 3D does **not** (or models very differently)

1. **Winding invariant.** CasaPlazAI requires strictly CCW polygons (`non-ccw-polygon`); Sweet Home 3D has no winding rule — measured 52 CW / 18 CCW. CasaPlazAI's rule is the better engineering choice (it makes signed area, inward normals and origin-inside tests total), but it *is* a divergence.
2. **Room FK on openings and furniture.** CasaPlazAI requires `roomId` (`dangling-ref`); Sweet Home 3D has no room FK anywhere — only `level`.
3. **Closed enums.** `kind: door|window`, `type` (7 furniture types), `floorTexture` (5 values). Sweet Home 3D is open-ended via `catalogId`. CasaPlazAI's `unknown-*` error codes make the closedness a *contract*, not just a convention.
4. **`tCenter` (normalised along-segment parameter).** Elegant and grid-friendly; Sweet Home 3D's `x/y/angle` free placement is more general but has no natural 0.5 m-snap.
5. **`headHeight`** instead of Sweet Home 3D's `elevation + height`. Same information, but CasaPlazAI's pair is directly comparable against `wallHeight` for the roof/plate checks.
6. **Explicit two-row shared-door convention.** Deliberate duplication to keep each room's polygon self-contained; Sweet Home 3D stores one object and infers.
7. **`roofs` / `wallsOverride` per corridor segment.** A genuine CasaPlazAI feature (issue #83) with **no Sweet Home 3D analogue at all** — Sweet Home 3D would express a roof as furniture/`furnitureGroup` geometry and a wall-height change as `heightAtEnd`.
8. **Stricter migration contract.** `registerTransform` + `migration-gap` + `future-version`, versus Sweet Home 3D's silent in-memory upgrade with no recorded per-version transform chain.

### 2.12 Migration sketches (ordered, additive-only)

**M1 — levels (enabling step).** `levels: Level[]` with `{id, name, elevation, height, floorThickness, elevationIndex, visible}`, plus `levelId?: string` on `Room`/`Opening`/`FurnitureItem`. `registerTransform(1, …)` synthesises one `L0` from the payload's existing global `wallHeight` and stamps every entity with `levelId: "L0"`. Bumps to v2. Pure addition; every existing field keeps its meaning.

**M2 — per-entity `meta` + `visible`.** Add `meta?: Record<string,string>`, `name?`, `visible?: boolean` to Room/Opening/FurnitureItem. No transform needed (optional fields); the migration step is a no-op registration so the version chain stays honest.

**M3 — explicit `walls[]` (the bigger move).** `walls: Wall[]` with `{id, levelId, a:[x,y], b:[x,y], thickness, height?, heightAtEnd?, joinStart?, joinEnd?, leftColor?, rightColor?, topColor?, pattern?}` and an optional `walls?: string[]` on `Room`. Migration derives one wall per distinct undirected room-polygon segment, matching rooms that share a segment to the same wall id — exactly the join Sweet Home 3D stores explicitly and CasaPlazAI currently infers. Keep `segmentIndex`-based openings working by resolving them onto the derived wall at read time.

**M4 — opening fidelity.** Add optional `wallId?`, `wallThicknessRatio?`, `wallDistanceRatio?`, `cutOutShape?` (normalised path string), `panel?` (`{hingeAxis, width, startAngle, endAngle}` mirroring `sash`), `deformable?`. Keep `roomId`+`segmentIndex`+`tCenter` as the authoring form. This is round 1's idea #3, now grounded in the measured `wallThickness = cm/depth` relation.

**M5 — furniture catalogue fidelity.** Add optional `catalogId?`, `name?`, `size?: [w,d,h]`, `elevation?`, `color?`, `planExtent?: [a,b]` (the rotated AABB cache, written only when it differs — the `widthInPlan` pattern), `groupId?`. Keep the `type` enum as the v1 required field so nothing breaks.

**M6 — ceilings and annotations (optional, last).** `ceiling?: {color?, visible?, flat?}` on `Room`; and — only if the team decides annotations *should* cross the contract — a top-level `annotations` array with `levelId`, mirroring Sweet Home 3D's placement of `dimensionLine`/`label`/`polyline`.

A cross-cutting importer/preprocessor note: whichever of M1–M6 is adopted, the **sh3d→CasaPlazAI convert step must (a) normalise polygon winding to CCW, (b) decide whether the incoming polygon is a wall-face inset and, if so, offset it per vertex, (c) synthesise `id`s where absent — measured id coverage is 100% for walls and levels but only 30% for rooms, 26% for furniture/openings and 0% for dimension lines and labels, and (d) go through `validate()` because real Sweet Home 3D data violates `non-ccw-polygon`, `bad-id`, `bad-name` and `dangling-ref` by construction.**

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

| # | Idea | Tied to | Value | Effort | Why, concretely |
|---|---|---|---|---|---|
| 1 | **Add `levels[]` + `levelId` FK now** (single implicit `L0` for existing payloads) | §2.2, §2.11, M1 | High | Low | The app already has multi-floor and a `floorId`-keyed underlay; the *contract* is the only thing missing. One `registerTransform` step; unblocks per-storey `wallHeight` that Sweet Home 3D proved is per-`level.height`, not global. |
| 2 | **Add a `meta`/`name`/`visible` envelope on every entity** | §2.1, §2.6, M2 | High | Low | Sweet Home 3D puts an open `property` bag on the root *and* on rooms, walls and furniture, and real files use it for real data. Optional fields ⇒ no transform, no version bump. Enables locking, hiding and per-object notes without new error codes. |
| 3 | **Promote walls to `walls[]` with explicit `joinStart`/`joinEnd` ids** | §2.3, M3 | High | Medium | Per-wall `thickness` is *required* to represent real plans (7.5 cm vs 20 cm in one file). Explicit joins kill the floating-point-vertex-coincidence class of "shared wall" bug and make the shared-door convention unnecessary. |
| 4 | **Add optional `wallThicknessRatio`/`wallDistanceRatio` to openings, keeping `tCenter`** | §2.5, M4 | High | Medium | Grounded: `wallThickness × pieceDepth` reproduces the wall thickness exactly (median error 0.001 cm) in 22/27 openings that lie on a wall axis. Store it, don't compute it — real "Door frame" pieces intentionally exceed the wall. This is what lets a door *re-centre* when `wallThickness` changes; today a global thickness change silently shifts every opening. |
| 5 | **Add a per-room ceiling model** (`ceiling: {color, visible, flat}`) | §2.4 | High | Low | CasaPlazAI has no ceiling field at all; across the 100 real rooms, `floorColor` appears 62×, `ceilingColor` 53×, `ceilingFlat` 30× and `ceilingVisible` 22× — ceilings are edited as often as floors. Directly needed for the 3D/Walk modes and for the roof plate logic. |
| 6 | **Add the rotated-AABB cache (`planExtent`) written only when it differs** | §2.6 | Medium | Low | Sweet Home 3D writes `widthInPlan`/`depthInPlan` on only 4–7 of 836 pieces — the exact "cache only when non-default" pattern that keeps stored plans small while fixing rotated-furniture collision/fit. |
| 7 | **Add `cutOutShape` + an opening `panel` descriptor** | §2.5 | Medium | Medium | Real files carry `cutOutShape` on **192/192** openings — it is not an exotic feature, it is the default. Arched windows without a new entity type; `sash` gives doors a swing arc for 2D *and* 3D. |
| 8 | **Replace/augment the 7-member `type` enum with a `catalogId`** | §2.6, M5 | Medium | Medium | `catalogId` is present on **836/836** real pieces. Decouples the palette from the persisted shape so the palette can grow without schema bumps, and makes `unknown-furniture-type` disappear. |
| 9 | **Add `furnitureGroup`-style nesting (`groupId`)** | §2.7 | Medium | Medium | 21 groups in the corpus; solves "move the bed and nightstands together" without a new top-level collection. |
| 10 | **Explicitly ratify (or change) the annotations/underlay exclusion** | §2.8, §2.11 | Medium | Low | Sweet Home 3D carries `level` FKs on `dimensionLine`/`label`/`polyline`, so annotations *do* survive export there. CasaPlazAI currently loses measurements and underlay on share by construction. Either decision is fine; documenting it prevents a later schema bump. |
| 11 | **Add an sh3d→FloorplanData preprocessor with winding + inset normalisation** | §2.4, §2.12 | Medium | Medium | Only worth it if import is on the roadmap, but it is the only route to reusing real-world Sweet Home 3D plans as test data — and the measured 52-CW/18-CCW split says a naive importer fails on 74% of rooms. |
| 12 | **Add a root-level `property`-style bag with typed values (`STRING`/`CONTENT`)** | §2.1 | Low | Low | Sweet Home 3D's `property` bag on the root holds 14 real UI/chrome keys in one shipping file. Cheap extension point; `type` distinguishes inline text from content references. |

---

## 4. Unknowns

1. **I did not run the desktop app** (rules forbid installing it), so any *behavioural* claim about how a user edits a field is inferred from source + file data. All structural claims are grounded in the DTD, the shipped source, and 8 real files.
2. **No fresh REA run this round.** Round 1 already captured the JS bundle and network graph; my whole contribution is static/structural, so re-capturing the browser app would have added nothing to a *schema* question. Consequence: I have no new UI evidence about Sweet Home 3D's 2D editor UX (e.g. exactly what the wall-modification pane labels `leftSideColor`).
3. **`Home.xml` files from old versions.** My corpus is v5500 (examples) + v7400 (one shipping file). Claims about what appears at v3000–v5000 come from `@since` tags, not from files of those versions, so the version→feature table in §2.9 is DOCUMENTED rather than OBSERVED for anything ≤ 5.4.
4. **The `Home` binary ZIP entry** was not deserialised (round 1 explicitly left it too). Since the reader gives `Home.xml` priority, this cannot change the schema mapping, but a `.sh3d` with *only* the binary entry would need a different (Java) reader.
5. **`widthInPlan`/`depthInPlan` are too rare (4 and 7 instances) to fit a rule.** I can state "written only when it differs from the unrotated box" (the exporter's default-suppression pattern) but I did not invert the exact rotation formula from the data. Any CasaPlazAI `planExtent` should define its own formula and write it explicitly.
6. **`furnitureGroup` aggregate geometry.** Its `x/y/width/depth/height` are `#IMPLIED` and I did not verify whether real groups store them explicitly or recompute from children. The 21 groups in the corpus were not individually inspected.
7. **Web search was unavailable again** (`DEEPSEEK_API_KEY` missing, confirmed this round), and `sweethome3d.com/help/help.html` / the 6.4 blog post both 404 on direct fetch. Discovery relied on the sources round 1 had already archived plus direct URL probing; I added no new external page this round. The German user-guide page (`docs_html_de.html`) is a landing page, not the field-level manual.
8. **CasaPlazAI implementation details are out of reach** — I read only `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`. I cannot see `types.ts`, `validate.ts` or `migrate.ts`, so statements like "adding an optional field needs no transform" are **INFERRED** from the documented contract, not verified against code.
9. **Licensing.** Sweet Home 3D source is **GPL-2.0-or-later**; the example homes are **CC-BY-3.0 / GPL**; the shipping gallery file carries its own licence property. Nothing is copied into a deliverable — `Home.xml.dtd` and the derived statistics are *reference evidence* in this job folder only. Any implementation of the ideas above must be written independently from these behaviour descriptions.

---

## 5. Job folder contents (evidence map)

| Path | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list with access notes and licences |
| `evidence/Home.xml.dtd` | The authoritative DTD copied from round-1 evidence (reference only, GPL-2.0+) |
| `evidence/round1-proposed-json.schema.json` | Round-1's non-normative comparison schema, kept for contrast |
| `evidence/dtd_attlists.json` | Parsed DTD: 32 elements (31 with an `ATTLIST`) / 431 attributes with type + default (my tooling output) |
| `evidence/attr_file_presence.json` | Occurrence count of every (element, attribute) across the 8 real `Home.xml` files |
| `evidence/attrs_used_per_element.json` | Same data grouped by element, ranked by use |
| `evidence/room_winding.json` | Shoelace winding census of all real room polygons (52 CW / 18 CCW, with per-file breakdown) |
| `evidence/room_wall_inset.json` | Room-vertex offset ÷ half wall thickness: histogram + percentiles (median 1.000) |
| `evidence/id_coverage.json` | `id`-attribute coverage per entity type (walls/levels 100%, rooms 30%, furniture/openings 26%, annotations 0%) |
| `evidence/field_surface_comparison.json` | Distinct-name comparison: 185 SH3D attribute names (109 used) vs 26 CasaPlazAI field names, 6 shared |
| `evidence/wall_join_graph.json` | Wall join graph (400/400 symmetric) + the single curved wall's radius derivation |

Round-1 evidence (read-only, reused): `~/dsh-workspaces/rea-sweethome3d-2026-10/06-06-sh3d-file-format/` — `report.md`, `Home.xml.dtd`, `docs_src/*.java`, `examples/*.xml`, `sh3d_samples/blues/Home.xml`, `docs_html_history.html`, `sources.json`.
