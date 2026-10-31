# Sweet Home 3D — the 66 shipped openings: categories, sizes, default elevations, catalog fields

Job `06-04d-doors-windows-opening-catalo` (round 2). Target: Sweet Home 3D 7.5.2, GPL Java desktop app;
browser edition `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` built from the same Java core via GWT.

Round 1 (`~/dsh-workspaces/rea-sweethome3d-2026-10/04-04-doors-windows/report.md`, read-only) established
the *behaviour* of doors/windows: the two-level data model, wall magnetism, wall cutting, mirroring, sash arcs,
model transformations. **This round does not redo any of that.** It answers the narrower question — the **catalog
inventory of the 66 shipped openings** (categories, sizes, default elevations, describing fields) — and closes the
round-1 Unknowns that touch openings.

Tags: **OBSERVED** (live app state or a file saved in this folder / round-1 folder), **DOCUMENTED** (vendor
javadoc / changelog URL), **INFERRED** (my reading between the lines). No source code or model assets were
copied; only behavioural and data-model descriptions, in my own words. All writes are inside this job folder.

---

## 1. Summary

- **All 66 openings live in exactly one catalog category, `Doors and windows`** — 69 records there, of which 66
  carry `doorOrWindow=true`; the other 3 (flat-roof skylight bubble, window shutter, screen door) are decorations
  that do **not** cut walls. `doorOrWindow=true` is the authoritative discriminator, not the category.
  **OBSERVED** (`evidence/catalog-openings.json`, `evidence/live-catalog.json`).
- **Sizes vary by two orders of magnitude**: width 21–441.2 cm (median 104.7), depth 8.3–300 cm (median 25),
  height 46–245.4 cm (median 208.5). The clean discriminator is the **sill, not the height**: 30 records have
  sill 0 (all ≥ 200 cm tall — doors, frames, garage/elevator doors) and 36 have a positive sill (windows,
  hatches, glass block, 13 of which are themselves ≥ 200 cm tall French/patio windows).
  **OBSERVED**.
- **Default elevations are pure sill heights, 11–210 cm**, and **only 36 of 66 carry the `elevation` key** — the
  other 30 (every one ≥ 200 cm tall) default to elevation 0, i.e. floor level. All 30 sampled sills of 0 are
  doors, frames and garage/elevator doors; the 19 distinct positive sills cluster at 11 (×11), 87 (×4), 95 (×2),
  111 (×2) and 130 (×2). **OBSERVED** live (all 66 elevations survive a drop onto a wall).
- **An opening is described by 16 core keys present on all 66, plus 10 opening-only keys**
  (`doorOrWindowCutOutShape`, `…WallThickness`, `…WallDistance`, `…WallCutOutOnBothSides`,
  `…WidthDepthDeformable`, and the 5 `…Sash*` keys), plus 4 more (`multiPartModel`, `elevation`,
  `dropOnTopElevation`, `creationDate`) that only some openings write. Most are absent on most records and fall
  back to type defaults; the values are stored in raw cm/degrees and normalised to **fractions of the piece's own
  width/depth** at load. **OBSERVED** (live `CatalogDoorOrWindow` getters) + **DOCUMENTED** (javadoc).
- **Round-1 Unknowns closed for openings:** `widthDepthDeformable=false` **is** enforced on drop (2 catalog
  items keep their catalog depth instead of stretching to `wallThickness / ratio`); `cutOutShape=null`
  **is** meaningful (6 SeberRider items: the 3-D builder derives the hole from the model silhouette, and the 2-D
  plan paints a full rectangle); **no opening re-fits when its wall thickness changes** (both directions tested).
  **OBSERVED**.

---

## 2. Findings

### 2.1 Catalog census: where the 66 openings live

Source: `https://www.sweethome3d.com/libjs/resources/FurnitureCatalog.json` (the one URL the Online app declares
in `applicationParams.furnitureCatalogURLs`; OBSERVED live). The file is a flat `key#N` map. **805 numbered
records are real pieces; 935 entries are `ignored=true` tombstones** (the loader reads `ignored#N` and skips the
record — OBSERVED, the `readFurniture` loop in `bundles/sweethome3d.min.js`). 1740 = 805 + 935.
**OBSERVED** (`evidence/catalog-census.json`).

| category | pieces | openings |
|---|---:|---:|
| Living room | 132 | 0 |
| Miscellaneous | 130 | 0 |
| Kitchen | 125 | 0 |
| Exterior | 85 | 0 |
| Bedroom | 69 | 0 |
| **Doors and windows** | **69** | **66** |
| Bathroom | 50 | 0 |
| Characters | 35 | 0 |
| Lights | 32 | 0 |
| Office | 31 | 0 |
| Vehicles | 27 | 0 |
| Staircases | 20 | 0 |

12 categories, 805 live pieces. The 3 non-openings sitting in the "Doors and windows" category are
`OlaKristianHoff#window_flat_roof_skylight_bubble` (100×100×45, elevation 250), `OlaKristianHoff#window_shutter`
(43.9×2.9×129, elevation 92) and `Kator Legaz#screen-door` (87.6×9.7×200) — furniture you hang near a window,
not wall cutters. **OBSERVED** raw file + live (`application.getUserPreferences().getFurnitureCatalog()`).

Localisation is a **sidecar, not a second catalog**: `FurnitureCatalog_de.json` / `…_fr.json` are same-numbered
overlays carrying only `name`, `tags`, `category` (and posture names), 805 records each. The German site loads the
same 66 items under German names (`eTeks#window85x123` → "Kleines Fenster", `eTeks#serviceHatch` →
"Durchreiche"). **OBSERVED** (`evidence/FurnitureCatalog_de.json`, `evidence/opening-names-i18n.json`).

### 2.2 Sizes of the 66

Live `CatalogDoorOrWindow` getters (`evidence/live-catalog.json`, `evidence/openings-table.json`):

| quantity | min | median | mean | max |
|---|---:|---:|---:|---:|
| width | 21.0 | 104.7 | 134.2 | 441.2 |
| depth | 8.3 | 25.0 | 31.2 | 300.0 |
| height | 46.0 | 208.5 | 180.3 | 245.4 |
| elevation | 11.0 | 86.0 | 69.7 | 210.0 |

Width histogram: `<50` 1, `50–100` 25, `100–150` 22, `150–200` 10, `>200` 8. The >200 group is dominated by
garage/industrial doors (250, 298, 384, 391, 441.2) and the deep shop window (300).

Height alone is a **bad** discriminator: 43 records are ≥ 200 cm tall, but 13 of those are tall French/patio
windows (up to 229 cm) with a positive sill, not doors. The reliable split for a floorplanner palette is
`sill > 0` (36 windows/hatches/glass block) vs `sill = 0` (30 doors, frames, garage/elevator/revolving doors) —
and it is exact in both directions: **every** item with sill > 0 has height < 230, and **every** item with sill 0
is ≥ 200 cm tall. **OBSERVED**.

Notable outliers to keep as "special" entries rather than defaults:
`OlaKristianHoff#revdoor` (384×300×230 — a revolving door whose 300 cm depth is the whole turning circle),
`Scopia#elevator` (185.6×189.6×245.4), `Scopia#garage-door2` (441.2×32×216.7),
`eTeks#serviceHatch` (50×8.3×50 — a wall hatch, not a door), `RonnieTantriady#glassblock` (21×8.8×168).

### 2.3 Default elevations (sills)

`elevation` presence: **36 of 66**. The remaining 30 all default to 0 cm (floor level) and are doors, frames,
garage doors, elevator doors, the revolving door and the emergency glass door. No opening explicitly writes
`elevation=0`; 0 is the type default. **OBSERVED** (`evidence/openings-table.json`).

Distribution of the 36 shipped sills:

| sill (cm) | count | examples |
|---:|---:|---|
| 11 | 11 | French windows (`eTeks#frenchWindow85x200`), Scopia 2x1/2x3/2x4/3x1/4x1/4x3/4x5, slider window |
| 20 | 1 | glass blocks |
| 29 | 1 | Scopia double window 4 panes |
| 35 | 1 | shop window |
| 47 | 2 | `eTeks#window85x163`, double window 163 |
| 80 | 1 | deep window (`OlaKristianHoff#window_deep`) |
| 85 | 1 | Scopia double window with large pane |
| 87 | 4 | `eTeks#window85x123`, double small window, fixed window, outward-opening window |
| 91 | 1 | `Kator Legaz#window-08` |
| 93 | 1 | `eTeks#doubleHungWindow80x122` |
| 95 | 2 | both SeberRider windows |
| 101 | 1 | stain-glass window |
| 104 | 1 | Scopia turn window |
| 111 | 2 | both Ola-Kristian Hoff 2x3 windows |
| 120 | 1 | service hatch |
| 130 | 2 | fixed triangle window, round window |
| 145 | 1 | SeberRider small window |
| 161 | 1 | Ola-Kristian Hoff fixed small window |
| 210 | 1 | `eTeks#halfRoundWindow` (transom/clerestory, head 256 cm) |

The sill is **preserved exactly on placement** — all 66 dropped onto a 7.5 cm wall kept their catalog elevation to
the last float (`evidence/live-drop-all66.json`). **OBSERVED**. Only `eTeks#halfRoundWindow` has a head above the
250 cm default wall height (210 + 46 = 256), so one item is designed to poke through a standard wall top.
**OBSERVED**; this is the one case where clamping the sill to fit would visibly damage the design.

### 2.4 The catalog field inventory that describes an opening

Schema authority: the app's own `DefaultFurnitureCatalog.PropertyKey` enum in the shipped 7.5.2 bundle
(`bundles/sweethome3d.min.js`), 1:1 with the JSON keys, plus the vendor javadoc for
`CatalogDoorOrWindow` / `DoorOrWindow` / `Sash` / `PieceOfFurniture`
(`https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/CatalogDoorOrWindow.html`).
`DoorOrWindow extends PieceOfFurniture`, so an opening is a **furniture record plus a property bag**.
**DOCUMENTED** + **OBSERVED**.

Keys present on **all 66** (the furniture core):

| key | meaning (javadoc / observed) |
|---|---|
| `id` | `creator#slug` identity, e.g. `eTeks#door`; also the duplicate-suppression key at load |
| `name`, `category`, `tags`, `creator`, `license` | display + provenance (`license` since 7.2) |
| `icon`, `iconDigest`, `model`, `modelDigest`, `modelSize` | content references (URL + optional digest) and model byte size |
| `width`, `depth`, `height` | bounding box in **cm** |
| `movable` | always `false` for all 66 openings (a door cannot be dragged onto a shelf) |
| `doorOrWindow` | `true` = wall cutter |

Opening-only keys and how many of the 66 actually write them:

| key | written | default when absent | loader normalisation |
|---|---:|---|---|
| `doorOrWindowCutOutShape` | 60 | `null` (see §2.5) | none; SVG `d` path in a unit square |
| `doorOrWindowWallThickness` | 45 | `depth` (→ ratio 1.0) | `÷ depth` |
| `doorOrWindowWallDistance` | 20 | `0` | `÷ depth` |
| `doorOrWindowWallCutOutOnBothSides` | 1 | `true` | — |
| `doorOrWindowWidthDepthDeformable` | 2 | `true` | — |
| `doorOrWindowSashXAxis` / `YAxis` / `Width` / `StartAngle` / `EndAngle` | 41 each | `[]` (no sash) | x,width `÷ width`; y `÷ depth`; angles `×π/180` |
| `multiPartModel` | 45 | `false` | flags the model as having movable nodes |
| `elevation` | 36 | `0` | — |
| `dropOnTopElevation` | 57 | `height` | `÷ height` (so raw `-1` → a small negative fraction) |
| `creationDate` | 45 | `null` | `YYYY-MM-DD` → epoch ms |

Keys **never** written by any of the 66, hence type defaults: `resizable` (→true), `deformable` (→true),
`texturable` (→true), `horizontallyRotatable` (**→false for doors/windows**, live-verified: 66/66 return `false`,
which is what stops a door being tipped onto its side), `modelRotation` (→ identity 3×3), `modelFlags` (→ 0),
`planIcon`, `price`, `currency`, `valueAddedTaxPercentage`, `staircaseCutOutShape`, all `lightSource*`, all
`shelf*`. **OBSERVED** live (`evidence/live-catalog.json`) + **DOCUMENTED** (javadoc lists these as
`PieceOfFurniture` members). The flags `resizable`/`deformable`/`texturable`/`horizontallyRotatable` appear in only
2 non-opening records in the whole catalog, so the JSON omits them whenever the default holds.

`modelPresetTransformations_1..13` exist in the file but **on none of the 66 openings** — only on the 5 mannequin
records in `Characters`/`Miscellaneous`. So "preset postures" is a characters feature, not an opening feature;
openings use raw instance-level `modelTransformations` (round 1 §2.7). **OBSERVED**.

### 2.5 Cut-out shapes, sashes and wall-fit values

**Cut-out shapes.** 13 distinct normalised values across the 66 (`evidence/live-catalog.json`): the default unit
rectangle `M0,0 v1 h1 v-1 z` on 49 items; `null` on the 6 SeberRider items; and 11 hand-authored shapes covering
arches (3 items), half-rounds/rounds (3), a triangle, a keyhole-ish revolving-door shape, an inset frame
(`M0.078,0.037 v0.963 h0.846 v-0.964 z`, craftsman door) and a window inset with a reveal
(`M0.11,0.06 v0.875 h0.78 v-0.875 z`, deep window). The javadoc is explicit: a shape in the syntax of an SVG path
`d` attribute "that fits in a square spreading from (0, 0) to (1, 1) which will be scaled afterwards to the real
size" — i.e. **normalised 0..1 coordinates in the piece's width × depth space**. **DOCUMENTED** + **OBSERVED**.

**Sashes.** 41 of 66 ship sash data (20 single, 21 double); 25 have none (fixed windows, frames, hatches, garage
doors, elevator doors). Angles collapse to **7 distinct (start,end) pairs** — `(0°,−90°)` ×28,
`(180°,270°)` ×25, `(−90°,−180°)` ×4, `(−90°,0°)` ×2, plus three one-offs `(90°,−90°)`, `(90°,0°)`,
`(180°,90°)`. The 180°-pair is the *second leaf* of double doors/windows, mirrored relative to the first. Sash
`xAxis` is a fraction of width, `yAxis` a fraction of depth (hinge position *through* the wall), `width` a
fraction of width (leaf length): e.g. `eTeks#door` → x 0.0546, y 0.5862, w 0.8907. **OBSERVED** raw-file angles +
live normalised values; **DOCUMENTED** javadoc for the fraction semantics.

**Wall fit.** `wallThickness` is "the default thickness of the wall in which this door or window should be placed
… in percentage of the depth" (**DOCUMENTED**). Because the loader divides the raw cm by the piece depth, the
stored value is exactly `wall_cm / depth_cm`, so the shorthand "add a 7.5 cm door from a 20 cm library" means a
record with `depth=20, wallThickness=7.5`. Across the 66: 22 have ratio 1.0 (no key → the opening fills its whole
depth), 20 sit in 0.75–1, 12 in 0.5–0.75, 8 in 0.25–0.5 and 4 below 0.25 (the slim glass doors, elevator,
revolving door). `wallDistance` is "the default distance that should lie outside" the opening, also a depth
fraction (**DOCUMENTED**); 20 items write it, values 0–0.89 (`Scopia#elevator` 168.1 cm / 189.6 = 0.887).
`wallWidth/wallLeft/wallHeight/wallTop` are **instance** fields with the same 1/0/1/0 default on all 66 — no
catalog item ships a partial cut-out (the one partial case, `eTeks#serviceHatch`, switches both-sides off
instead). **OBSERVED** live.

`dropOnTopElevation`: 57 write it; 54 of those normalise to a small **negative** fraction (raw `-1`, i.e. "never
allow stacking a piece on top of me"), 2 are positive small fractions (deep window raw 10 cm / 150 = 0.067; the
Ola-Kristian Hoff sill window raw 3 cm / 110 = 0.027) and 1 is 0 (`Scopia#elevator`). The 9 items that omit the key
fall back to a default of **1.0** (= the piece height), which means "stack on top of my full height" — so for 63
of 66 openings stacking a second piece on top is effectively blocked, and only the elevator explicitly allows it
(round 1's "−1 on most openings" is right in effect but not the whole story). Confirmed across all 57 written
values: `dropOnTopElevation == raw / height`. **OBSERVED**.

Creator/licence spread of the 66: Scopia 23, eTeks 21, Ola-Kristian Hoff 9, Seber Rider 6, Kator Legaz 3,
RonnieTantriady 2, Siath 1, Mchnz 1; licences `CC-BY` 26, `GNU GPL / CC-BY` 21, `Free Art` 10,
`Free Art / CC-BY` 9. The *models* are therefore not all GPL — a mixed CC-BY/GPL/Free-Art set, which matters if
CasaPlazAI ever looks at the assets (it must not). **OBSERVED**.

### 2.6 Live cross-check inside the browser app

I launched my own headless Chromium (Playwright `chromium-1243`) with `--no-sandbox --use-angle=swiftshader
--enable-unsafe-swiftshader --ignore-gpu-blocklist`, which produced a working **WebGL 2.0** context (round 1's
headless Chrome had died on "sandbox initialization failed" → "GPU process isn't usable. Goodbye."). I then drove
the page's own JS API (`application`, `HomeDoorOrWindow`, `PlanController.adjustMagnetizedPieceOfFurniture`) from
`page.evaluate` rather than synthetic clicks. **OBSERVED** (`evidence/live-webgl.json`).

- Live category tree: 12 categories, 805 pieces, 69 in "Doors and windows". **OBSERVED**.
- Every catalog value above was read from the **live** `CatalogDoorOrWindow` getters, not from the JSON, and
  matches the raw file 66/66 (after the loader's normalisation). **OBSERVED** (`evidence/live-catalog.json`).
- Instantiating all 66 as `HomeDoorOrWindow` in an empty home: the instance copies the catalog
  width/depth/height/elevation exactly, copies `wallThickness`/`wallDistance`/`cutOutShape`/`bothSides`/
  `widthDepthDeformable`, and starts with `boundToWall=false`, `modelMirrored=false`, and
  `wallWidth/wallLeft/wallHeight/wallTop = 1/0/1/0`. **OBSERVED** (`evidence/live-instances.json`).
- Dropping all 66 (one at a time) onto a 7.5 cm straight wall with the app's own magnetiser, then re-reading state:
  - all 66 snapped and became `boundToWall=true`;
  - all 66 kept the catalog **elevation** to the last float;
  - angle forced to the wall direction (0 here);
  - for the 64 deformable items, final `depth = 7.5 / wallThickness` (max error 0.001 cm) and
    `y = −t/2 + depth/2 − depth·wallDistance` (64/64) — the same formulas round 1 derived, now confirmed on the
    full set;
  - for the 2 non-deformable items the catalog depth is kept instead (see §2.7).
  **OBSERVED** (`evidence/live-drop-all66.json`).
- `HorizontallyRotatable` is `false` for 66/66 live. **OBSERVED**.

### 2.7 Round-1 Unknowns that this round closes (opening-related)

1. **`widthDepthDeformable=false` *is* enforced on drop.** Round 1 could not reproduce the v5.5 rule because it
   called the magnetiser on already-placed pieces. Dropping them fresh onto 7.5 / 20 / 30 cm walls
   (`evidence/live-wdd-wallfit.json`) shows the two flagged items are **not** stretched:
   `eTeks#openDoor` stays at depth 68 cm on all three walls (naive ratio would be 68 / 181.3 / 272) and
   `OlaKristianHoff#revdoor` stays at 300 cm (naive 150 / 400 / 600). The 64 deformable items do follow the ratio
   exactly at every thickness. The javadoc gives the second half of the semantics: when
   `isWidthDepthDeformable()` is false "this door or window will also make a hole in the wall when it's placed
   **whatever its depth** if its boundToWall flag is true" — so the guard is a *wall-cutting* guarantee, not just a
   sizing rule. **OBSERVED** + **DOCUMENTED**.
2. **`cutOutShape=null` *is* meaningful and means "derive the hole from the model".** The 6 SeberRider items
   return `null`. The 3-D wall builder's surround-geometry guard is
   `DEFAULT_CUT_OUT_SHAPE != shape || wallWidth!=1 || wallLeft!=0 || wallHeight!=1 || wallTop!=0`, and `null`
   passes that guard, so a full-front area is computed from the loaded model's silhouette
   (`ModelManager.getFrontArea(null, tree)` → `computeBottomOrFrontArea`, cached per model + rotation +
   cutOutShape); a different item can reuse that cache only when the shape string is identical. The 2-D painter
   instead treats `null` like the full rectangle. The javadoc states the return is "`null` or a shape …".
   **OBSERVED** + **DOCUMENTED**.
3. **No opening re-fits when its wall thickness changes.** With a placed, bound opening I changed the wall from
   7.5→20, 7.5→30 and 20→7.5 cm: `depth`, `y`, `depthInPlan` and elevation were **identical before and after** in
   all three cases. Round 1 had this for one door; now confirmed for a window and in the shrinking direction too.
   **OBSERVED** (`evidence/live-wallchange.json`).
4. **3-D is still not visually observable**, but the reason is now known precisely, and it is *not* headless
   WebGL: the app's own `HTMLCanvas3D` constructor calls `canvas.getContext("webgl")` (WebGL 1) and throws
   `"No WebGL"` on failure; my diagnostic `getContext("webgl2")` calls on the app's canvases poisoned them for
   WebGL 1. On a clean load a fresh canvas happily gives WebGL 2, and the app constructs `HomeComponent3D`
   (`hc.getHomeController3D().getView()`), but the scene graph is not reachable from `page.evaluate` (no exposed
   `getHomeTree`/`numChildren`) and the app's `createView3D` factory path needs internal controller wiring. So all
   3-D statements remain code-read. **OBSERVED (mechanism)** / **not re-verified (3-D visuals)**.

---

## 3. Ideas for CasaPlazAI

Ranked by value / effort. Each is tied to a finding above and, where relevant, to the CasaPlazAI schema
(`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

1. **Ship an opening *type catalog* with the same field set, not per-instance opening objects (H / M).** From
   §2.4/§2.6: an opening is a furniture record plus a small property bag, and the placed instance starts as an
   exact copy. CasaPlazAI's schema has openings as plan entities; add a frozen `openingTypes` list
   (`kind: door|window`, `defaultWidth/Height`, `sill`, `cutoutPath`, `sash`, `wallFillRatio`, `wallInset`) and
   have the inspector edit only instance overrides. **Value:** every door/window gets correct defaults with zero
   per-instance UI, and plans stay small.
2. **Preload the *empirical* size/sill clusters instead of guessing (H / L).** From §2.2/§2.3: use
   width 91 / 132 / 108.5, height 208.5 / 210 / 134, sill 0 / 11 / 87 as the default door- and window-type
   presets, plus the long tail (garage 250–441, hatch 50×50 at 120, glass block 21×168 at 20). These are the
   numbers users of the market leader expect to see. **Value:** instantly plausible plans.
3. **Store `wallFillRatio` per opening type and *re-fit live* when the host wall changes (H / M).** From §2.7
   item 3: Sweet Home 3D explicitly does **not** re-fit — an already-placed door keeps its depth after the wall
   is thickened. CasaPlazAI has shared walls users edit, so `depth = wallThickness / wallFillRatio` recomputed on
   wall edit (with an "unlink from wall" escape hatch) is a visible quality win over the competitor. Round 1's
   idea #1; now backed by a measured negative on the competitor.
4. **Make the cut-out an SVG-like normalised path from day one (H / M).** From §2.5: 13 distinct shapes exist
   across just 66 items (arches, half-rounds, a triangle, a round window, a keyhole revolving door, two inset
   frames), all authored in a unit square and scaled at use. One `cutoutPath` string field buys CasaPlazAI
   arches and round windows without special-casing geometry; bounds give the 2-D plan clip (v5.2 behaviour) and
   the path is the 3-D subtraction mask.
5. **Split swing data into a hinge fraction + 2 angles, and put it on the type (H / L).** From §2.5: 41 openings
   carry `sash{x,y,width,startAngle,endAngle}` and only **7 angle pairs** exist in the entire shipped catalog —
   so a tiny enumerated `swing` set (`left/right/in/out` + double-leaf) covers ~90 % of real doors. This is the
   cheap version of round 1's idea #2 and feeds the 3-D walkthrough.
6. **Model "is this opening adjustable?" as a tag, not a field (M / L).** From §2.5: 45 of 66 are tagged
   `Adjustable`, and 38 of the 41 with sash data are tagged `Adjustable` — but the correlation is not perfect
   (3 items have a sash without the tag; 7 are tagged adjustable with no sash). **Add the sash and you get the
   semantics for free**; the tag is redundant metadata. Keep one explicit `openable` boolean in CasaPlazAI and
   ignore tag folklore.
7. **Keep sill as the *live* default and never clamp it to the wall (M / L).** From §2.3: the sill survives
   placement unchanged on all 66, and `eTeks#halfRoundWindow` (sill 210, head 256) deliberately exceeds a 250 cm
   wall. If CasaPlazAI clamps height to the wall it will mangle transoms; instead warn and let the user raise the
   wall. **Value:** avoids a class of "why did my window shrink" bugs.
8. **One boolean "stacks on top" instead of `dropOnTopElevation` (L / L).** From §2.5: 54 of the 57 explicit
   values mean "never stack on me" (raw `-1`), the 9 omissions default to "stack at my full height", and only
   `Scopia#elevator` (value 0) is a genuine "stack on me". A single `allowStackOnTop` flag per opening type
   matches the real usage and removes a float field from the schema.
9. **Both-sides cut-through as the default; expose the escape hatch only in the type editor (M / L).** From
   §2.5/§2.7: 65/66 cut through both faces, and v5.5 made it unconditional — so the *only* shipped exception
   (`eTeks#serviceHatch`, a one-sided service hatch) is the model for a rare `cutoutBothSides:false`. Default
   true in CasaPlazAI; surface the toggle only where a hatch/vent is defined.
10. **Partial cut-outs as four fractions, only if a hatch/vent ever ships (L / M).** From §2.4: the loader
    supports `wallWidth/wallLeft/wallHeight/wallTop` with defaults 1/0/1/0 and **no shipped opening uses them**.
    It is the right data model but premature for a small palette — leave the fields in the schema, no UI.
11. **Store the licence/creator per opening type and show it (L / L).** From §2.5: the shipped set is a mix of
    `CC-BY`, `GNU GPL / CC-BY` and `Free Art` from 8 creators. CasaPlazAI's own catalog can bake provenance in
    the same way, and it costs nothing.
12. **Sidecar localisation of the catalog, not duplicated types (L / L).** From §2.1: German/French names live
    in `FurnitureCatalog_<lang>.json` keyed by record number, carrying only name/tags/category. If CasaPlazAI ever
    localises its palette, a per-locale overlay avoids forking the geometry-bearing type list.

---

## 4. Unknowns

- **3-D visuals still unobserved.** I got a working WebGL context and the app built a `HomeComponent3D`, but the
  scene graph is not reachable from `page.evaluate` and `createView3D` needs internal controller wiring, so the
  hole geometry, sash animation and the model-derived cut area for the 6 `null`-shape items remain read from code.
- **Exact 3-D wall hole for `cutOutShape=null`.** The code path (model silhouette → `getFrontArea`) is clear; the
  cache is keyed by model + rotation + shape string, but I could not render a frame to confirm the hole shape.
- **`wallWidth/wallLeft/wallHeight/wallTop` have no shipped example.** No catalog member sets them, so their
  runtime effect is known only from the code and javadoc, not from a real item.
- **Desktop / Furniture-Library-Editor authoring UI not exercised** (rules: no installers). The field list comes
  from the JSON schema, the shipped bundle and the javadoc; the editor's labels were not observed.
- **Whether the online catalog equals the desktop default catalog.** The Online app loads a single generated
  `FurnitureCatalog.json`; the desktop app ships `.properties` resources I could not fetch from GitHub raw. The
  *shape* (key names, normalisation) is shared, so the 66-record inventory is very likely identical, but I did not
  verify the desktop file.
- **Contributed library openings.** Users can add `.sh3f` libraries with their own doors/windows; those are not
  in the shipped 66 and were not sampled (the `import-models.jsp` page yielded no usable text).
- **CasaPlazAI caveat:** Sweet Home 3D is GPL-2.0+ and its catalog models are a mixed CC-BY / GPL / Free-Art set
  from 8 authors. Nothing was copied here — no code, no path strings reused as assets, no model files. Only
  behavioural and data-model descriptions.

---

### Evidence index (all inside this job folder unless noted)

| file | what it is |
|---|---|
| `report.md` | this report |
| `sources.json` | machine-readable source & claim list |
| `evidence/catalog-openings.json` | the 66 raw catalog records (selected fields) |
| `evidence/openings-table.json` | consolidated 66-row table: names, sizes, sills, ratios, flags |
| `evidence/catalog-census.json` | per-category counts, 805 real / 935 ignored records |
| `evidence/live-catalog.json` | all 66 read from live `CatalogDoorOrWindow` getters (v7.5.2) |
| `evidence/live-instances.json` | 66 `HomeDoorOrWindow` instances: instance defaults vs catalog |
| `evidence/live-drop-all66.json` | all 66 dropped on a 7.5 cm wall, one at a time: snap, depth, y, elevation |
| `evidence/live-wdd-wallfit.json` | `widthDepthDeformable` enforcement at 7.5 / 20 / 30 cm walls |
| `evidence/live-wallchange.json` | no re-fit when the host wall thickness changes |
| `evidence/live-3d-probe.json`, `evidence/live-webgl.json` | WebGL availability + 3-D view probe |
| `evidence/FurnitureCatalog_de.json`, `…_fr.json`, `evidence/opening-names-i18n.json` | localisation overlays |
| `javadoc/txt/*.txt` | vendor javadoc for CatalogDoorOrWindow, DoorOrWindow, Sash, PieceOfFurniture, HomeDoorOrWindow |
| `evidence/history.txt` | vendor changelog text (v1.7, v4.2, v5.2, v5.5, v7.5 opening entries) |
| `probe-*.js`, `reload.js`, `eval-cdp.js` | scripts used to drive the live app (kept for reproducibility) |
| (round 1, read-only) `bundles/FurnitureCatalog.json`, `bundles/sweethome3d.min.js`, `users-guide.html`, `history.txt` | reused source of the raw catalog, bundle code and vendor docs cited above |
