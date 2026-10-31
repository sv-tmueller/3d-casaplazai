# Sweet Home 3D — Wall cut-out geometry: `cutOutShape` paths, both-sides cutting, 3-D hole generation, arches

Job: `04-04b-doors-windows-cutout-geometr` (round 2, narrow follow-up). Target: Sweet Home 3D
(`https://www.sweethome3d.com/de/`, GPL-2.0+ Java desktop) and the browser edition
`https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (same Java core, GWT-compiled to JS, v7.5.2).

Round-1 report read first and reused (not modified):
`~/dsh-workspaces/rea-sweethome3d-2026-10/04-04-doors-windows/report.md`.
Paths below are relative to **this** job folder unless they start with `R1:` (round-1 folder).

Claim tags: **OBSERVED** (live app / shipped bundle / vendor source, path given), **DOCUMENTED**
(vendor URL), **INFERRED** (my reading between the lines). No source code copied — behaviour and
data-model descriptions only. Sweet Home 3D is GPL-2.0+; its catalog assets are GPL/CC-BY.
Nothing here may be copied into CasaPlazAI; the patterns are described in my own words.

Research 14:33–15:20 CET 2026-10-31. Deliverables: `report.md`, `sources.json`, `evidence/`, `probe/`.

---

## 1. Summary

- **The cut-out shape is an SVG path string in a unit square with y down** — e.g.
  `M0,0 v1 h1 v-1 z` (the default full rectangle), `M0,1 a0.5,0.997 0 1,1 1,0 z` (half-round),
  `M0,0 v1 h1 z` (triangle), `M0,0.5 a0.5,0.5 0 1,0 1,0 a0.5,0.5 0 1,0 -1,0 z` (round).
  Products are optional: 49/66 shipped openings take the default, 6 (`SeberRider` items) carry
  none and fall back to the default, 11 carry a real shape. **OBSERVED**
  (`R1:bundles/FurnitureCatalog.json`; `evidence/frontarea-paths.json`; `evidence/Wall3D.java.txt`).
- **Two different 3-D algorithms depending on the shape.** A *rectangular* opening is cut as an
  axis-aligned slot: the wall's side polygon is split into a **left jamb, a right jamb and a
  lintel**, each extruded vertically (live: wall 0→400, door 100 wide → jamb 0–54.25, lintel
  208.5→250, jamb 145.75–400). A *non-rectangular* opening is opened as its **bounding rectangle**
  in pass 1, then **patched in pass 2** with a "surround" mesh built from the model's real front
  silhouette. **OBSERVED** (live, WebGL-enabled Chromium; `evidence/live3d-wallparts.json`,
  `evidence/live3d-scenarios.json`, `evidence/live3d-surround.json`; `evidence/Wall3D.java.txt`
  lines 543–648, 1024–1141).
- **"Cut on both sides" is a depth-inflation trick, not a separate mesh.** The cutting rectangle's
  plan depth is inflated by `4 × wallThickness` when `wallCutOutOnBothSides` is true and only
  `2 × baseboardThickness` otherwise, so the subtracted footprint pierces every wall layer
  (`R1` report §2.4; **OBSERVED** in `evidence/Wall3D.java.txt` lines 155–175). It is a
  **default-and-forgettable boolean**: 65/66 shipped openings are true, one (`Service hatch`) is
  false, and `HomeDoorOrWindow.duplicate()` re-initialises `wallWidth=1 / wallLeft=0 /
  wallHeight=1 / wallTop=0` from the catalog copy, so partial cut-outs are per-instance state.
  **OBSERVED**.
- **Rooms/arches are 3-D only.** The 2-D plan draws openings as *rectangles* clipped to the
  cut-out path's **bounds**, never as the path itself (live: half-round 91.146×25, round
  91.146×25, craftsman 85.361×11.6 — all bounding boxes). The arch appears only in 3-D, and only
  the arch *head* is added back: the four shipped arch shapes coincide with their bounding
  rectangle everywhere except a thin top strip (live: `Double arched window` surround = 1.0 ×
  0.035 of the opening). **OBSERVED** (`evidence/live3d-planrect.json`,
  `evidence/live3d-surroundcoords.json`).
- **Round 1's blocking gap is closed.** Headless Chromium *can* run this app's WebGL with
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --disable-gpu-sandbox`
  (ANGLE/Vulkan/SwiftShader). Live, the app rendered the 3-D pane with **116 draw calls /
  44 124 vertices**, and I constructed `new Wall3D(wall, home)` directly and captured the exact
  vertex arrays it emits. The only remaining gap is that `gl.readPixels` returns zeros
  (canvas is composited, not a readback buffer), so I have mesh-level rather than pixel-level
  proof. **OBSERVED** (`probe/*.js`, `evidence/live3d-drawcalls.json`).

---

## 2. Findings

### 2.1 The path language: SVG, unit square, y-down, `batik`

- The shipped JS exposes `ShapeTools.getShape(svgPathString)`; it parses the string with
  `org.apache.batik.parser.PathParser` + `AWTPathProducer`, falls back to a plain unit
  `Rectangle2D.Float(0,0,1,1)` on any parse error, and caches by string
  (`ShapeTools.parsedShapes`). Passing an array of points instead of a string builds a
  `GeneralPath` directly. **OBSERVED**
  (`R1:bundles/sweethome3d.min.js` around `ShapeTools.getShape=function(j,e,c)`).
- Coordinates are **normalised 0…1 across the opening's width (x) and height (y), with y growing
  downward** (a half-round window's flat side is at y=0 and its arc at y=1). The scale is applied by
  the consumers, not the string. **OBSERVED** (`evidence/frontarea-paths.json` bounds for each
  shipped path; consumers in `evidence/Wall3D.java.txt`).
- **Census of the 66 shipped openings** (`doorOrWindow=true`), grouped by
  `doorOrWindowCutOutShape` **OBSERVED** (`R1:bundles/FurnitureCatalog.json`):

  | count | path | items |
  |---|---|---|
  | 49 | `M0,0 v1 h1 v-1 z` (default rectangle) | Door, Door frame, most French/double windows, lift doors… |
  | 6 | *(absent)* → default rectangle | `SeberRider` Window, Small window, Front door, French window, Double window, Double French window |
  | 2 | arch: `M0,0.0352 a3.7,3.7 0 0,1 1,0 v0.9648 h-1 z` / `M0,0.139 a0.5,0.139 0 0,1 1,0 v0.861 h-1 z` | Double arched window 108.5 cm tall; Quadruple arched window |
  | 1 | half-round `M0,1 a0.5,0.997 0 1,1 1,0 z` | Half round window (91×46) |
  | 1 | circle `M0,0.5 a0.5,0.5 0 1,0 1,0 a0.5,0.5 0 1,0 -1,0 z` | Round window (91×91) |
  | 1 | triangle `M0,0 v1 h1 z` | Fixed triangle window (91×91) |
  | 1 | rounded-top door `M0,1 v-0.788 a0.5,0.2 0 1,1 1,0 v0.788 z` | Rounded door |
  | 1 | rounded frame `M0,1 v-0.8 a0.5,0.2 0 1,1 1,0 v0.8 z` | Round door frame |
  | 1 | inset frame `M0.078,0.037 v0.963 h0.846 v-0.964 z` | Craftsman door |
  | 1 | inset frame `M0.11,0.06 v0.875 h0.78 v-0.875 z` | Deep window |
  | 1 | keyhole/step `M0,0.044329 V1 h1 v-0.95567 h-0.109375 v-0.044329 h-0.78125 v0.044329 z` | Revolving door |

  So **7 of the 11 distinct non-default shapes use `a` (elliptical-arc) sub-paths**; the language
  is plain SVG path syntax, uppercase `V`/`H` being the absolute variants of `v`/`h`.
- The **`DEFAULT_CUT_OUT_SHAPE` constant is exactly `M0,0 v1 h1 v-1 z`**, and identity comparison
  (`!==` on the Java string / string equality in JS) is the "is this a plain rectangular opening?"
  test. `ModelManager.getFrontArea` normalises *any* non-null shape to the unit square
  (`-0.5…0.5`) by translating by the bounds centre and scaling by the bounds size; `null` triggers
  the expensive real-silhouette path; a parse failure or a >1 000 000-vertex model falls back to the
  full unit square. **OBSERVED** (`evidence/modelmanager-frontarea.pretty.js`,
  `evidence/frontarea-paths.json`).

### 2.2 Both-sides cutting: one boolean, one depth inflation

- `HomeDoorOrWindow` carries `wallThickness` (a **fraction** of the piece depth; catalog cm ÷ model
  width scale), `wallDistance` (another fraction, where in the wall the piece sits),
  `wallWidth / wallLeft / wallHeight / wallTop` (all defaults `1 / 0 / 1 / 0`), `wallCutOutOnBothSides`
  and `cutOutShape`. **OBSERVED** (`R1` report §2.1–2.2; `evidence/Wall3D.java.txt`).
- The **catalog ships no partial cut-outs**: `doorOrWindowWallWidth / WallLeft / WallHeight /
  WallTop` appear **0 times** among the 66 openings. Only `Service hatch` sets
  `doorOrWindowWallCutOutOnBothSides=false`; the rest are true. **OBSERVED**
  (`R1:bundles/FurnitureCatalog.json`; counts re-run here).
- The mechanism is visible verbatim in the vendor source: when `isWallCutOutOnBothSides()` the code
  clones the piece and runs `setDepthInPlan(depth + 4 * wall.getThickness())`, versus
  `depth + 2 * baseboard.getThickness()` when only a baseboard is being cut. The enlarged rectangle
  is what gets subtracted from the wall-side area, so it punches through the whole wall slab.
  **OBSERVED** (`evidence/Wall3D.java.txt` lines 155–175; the JS bundle has the identical branch).
- Live consequence (21 scenarios, `evidence/live3d-scenarios.json`): with a **7.5 cm** wall the
  `Door` opening's cut spans the full wall depth (`-3.75…+3.75` both sides); with a **20 cm** wall
  it spans `-10…+10`. Turning both-sides **off** left the default-door geometry numerically
  identical, because the default piece is already 14.5 cm thick with `wallDistance=1` (the deeper
  variant is a safety margin). The visible difference shows up with the **thin-piece** test: a door
  squashed to `depth = 1 cm` still produced **6** vertical parts (near face + far face) when the
  flag was true, but only **4** (the near face alone) when it was false — with the other-sided
  parts simply absent, because nothing reaches the far layer. **OBSERVED**
  (`evidence/live3d-surround.json` → `thinBoth` / `thinOneSide`).
- `HomeDoorOrWindow.duplicate()` copies a *fresh* set of wall fractions from the catalog
  (`wallWidth=1; wallLeft=0; wallHeight=1; wallTop=0`), i.e. the fractions are per-instance state
  layered on a catalog template. **OBSERVED** (the six duplicate overloads in
  `R1:bundles/sweethome3d.min.js`).

### 2.3 The 3-D hole, algorithm A — rectangular openings (axis-aligned slot)

Live capture with `new Wall3D(wall, home)`, `wall = (0,0)→(400,0)`, thickness 7.5, height 250, one
`Door` (`eTeks#door`, width 91.5, height 208.5, elevation 0) centred at x=100.
**OBSERVED** (`evidence/live3d-wallparts.json`, `evidence/live3d-scenarios.json` scenario A):

| generated vertical part | x range | y range (elevation) | wall side |
|---|---|---|---|
| left jamb | 0 → 54.25 | 0 → 250 | both (left `-3.75…0`, right `0…3.75`) |
| right jamb | 145.75 → 400 | 0 → 250 | both |
| lintel | 54.25 → 145.75 | 208.5 → 250 | both |

Opening span = 100 ± 91.5/2 = 54.25…145.75, head = 0 + 208.5. Wall thickness axis: near face
`y = -3.75`, far face `y = +3.75`, so the jamb quads are 3.75 cm wide (a half-thickness) and the
lintel fills the gap above the door to the 250 cm wall top. Each quad is extruded between
`minElevation` and the wall-top line `y = α·x + β`, which is how sloped/trapezoidal walls stay
correct (`createVerticalPartGeometry`, `evidence/Wall3D.java.txt` line 717).
- **Two wall-side passes**: `updateWallGeometry` rebuilds `WALL_LEFT_SIDE` and `WALL_RIGHT_SIDE`
  independently (each face gets its own texture and baseboard), which is why every part appears
  twice in the live capture. **OBSERVED** (`evidence/Wall3D.java.txt` lines ~105).
- **How the cut is computed.** `Area wallSideOrBaseboardArea = wall-side polygon`;
  for each visible opening whose elevation range overlaps the wall band and whose plan rectangle
  **intersects** the wall polygon, `wallSideOrBaseboardArea.subtract(pieceArea)`. The remaining
  area is walked with a `PathIterator`, and each closed sub-path becomes one vertical part
  (walls are *redundant*: one closed area per jamb/lintel). **OBSERVED**
  (`evidence/Wall3D.java.txt` lines 176–230, 415–500; identical in JS).
- Then **for each opening**, the intersection area is re-walked and, where the opening leaves a
  strip **below it** (a window sill) or **between stacked openings**, extra vertical parts are
  emitted: below-window, between-windows, above-window. Each of those also gets a horizontal
  "sill" cap (`createHorizontalPartGeometry(..., up=true)` for the underside, `up=false` for the
  top face) and a top-face part (`createTopPartGeometry`) only for the strip above the opening.
  **OBSERVED** (`evidence/Wall3D.java.txt` lines 440–540; mirrored in
  `evidence/wall3d-region.pretty.js` lines 546–637).
- **Superimposed openings** are handled by pairwise area intersection: overlapping
  `DoorOrWindowArea`s are split, and the shared remainder becomes a new area carrying the *list* of
  both openings. The list is sorted by ground elevation, and the code then emits: wall under the
  lowest opening, strips between consecutive openings (skipping any higher window entirely
  contained in a lower one), and wall above the highest. **OBSERVED**
  (`evidence/Wall3D.java.txt` lines 232–310; JS `wall3d-region.pretty.js` lines 494–521, 546–637).
- **Live verification of the stack rules** (`evidence/live3d-scenarios.json`):

  | scenario | opening | vertical parts (per wall side) | interpretation |
  |---|---|---|---|
  | `D_halfRound` | Half round window, elevation 210, h 46 → head 256 clipped to 250 | 3 | jambs + wall 0→210 (no head strip, opening reaches the wall top) |
  | `E_round` / `F_triangle` / `G_nullCut` | elevation 130, h 91 → 130/221 | 4 per side | jamb, jamb, **sill band 0→130**, **head band 221→250** — the middle opening is a full hole |
  | `M_twoStacked` | two `Small window` at 80 and 160 | 3 per side | jambs + band 0→80; the 80–160/160–… split is resolved by pair intersection (one shared area) |
  | `N_twoSideBySide` | two doors at x=100 and x=200 | 5 per side | jambs at 0/54.25/145.75/154.25/245.75/400 plus two lintels |
  | `O_serviceHatch` | 50×50 hatch, elevation 120 | 4 per side | jamb, jamb, band 0→120, band 170→250 — a *hole* in the middle of the wall (sill + head) |

  Horizontal cap count tracks the vertical parts, and the "up" flag is true for bottom/sill caps and
  false for the face under an overhang. **OBSERVED**.
- **Round walls**: the same polygon subtraction runs, but the top line is driven by the arc's
  circle and `createVerticalPartGeometry` switches from `Line2D.ptLineDistSq` to a radial distance
  for texture coordinates. Arches/openings-on-arcs still cut (the code ignores only
  `wall.isTrapezoidal()` special cases). **OBSERVED** (`evidence/Wall3D.java.txt` lines 735–780).

### 2.4 The 3-D hole, algorithm B — non-rectangular openings (the surround pass)

Trigger condition (live-confirmed): `!roundWall` **and** the opening is
`HomeDoorOrWindow` **and** `(cutOutShape !== DEFAULT || wallWidth !== 1 || wallLeft !== 0 ||
wallHeight !== 1 || wallTop !== 0)` **and** the wall is within `π/720` (¼°) of axis-aligned with the
opening. Otherwise the opening is treated as a plain rectangle. **OBSERVED**
(`evidence/Wall3D.java.txt` lines 543–575; `R1` report §2.4).

**Pass 1 (synchronous).** `createGeometriesSurroundingDoorOrWindow` is called only if a
`frontArea` for `(model, modelRotation, cutOutShape)` is already cached; otherwise the piece goes on
`missingModels` and nothing is generated this frame. Live: constructing `Wall3D` fired **0**
surround calls immediately, **2** after ~8 s (left + right wall side) once the model load
callback ran, and an extra 2 when `update()` was forced. This is a real, user-visible
**two-pass / repaint** behaviour, not an artefact. **OBSERVED** (`evidence/live3d-drawcalls.json`,
`evidence/live3d-surround.json`).

**Pass 2 (the patch).** Per wall side:
1. `fullFaceArea = FULL_FACE_CUT_OUT_AREA − frontArea`, where
   `FULL_FACE_CUT_OUT_AREA = Area(Rectangle2D.Float(-0.5, 0.5, 1, 1))` — note the **y +0.5**
   argument. Live, `frontArea('M0,0 v1 h1 v-1 z')` has bounds `-0.5, -0.5, 1, 1`; so the two
   rectangles coincide and `subtract` is empty, which is why **the default rectangle never triggers
   the surround code**. **OBSERVED** (`evidence/frontarea-paths.json`; `R1` report's
   `cutOutShape=null` uncertainty is now resolved: `null` follows the *silhouette* path, but a
   real SVG-string default does not).
2. When `modelTransformations != null` the front area is re-normalised by the piece's
   `wallWidth / wallLeft / wallHeight / wallTop` fractions. Live `getFrontArea` + that transform
   chain gave, for a default door: `[-0.5, -0.5, 1, 1]`; for `wallWidth=0.5, wallLeft=0.25`:
   `[-0.25, -0.5, 0.5, 1]`; for `wallTop=0.4`: `[-0.5, -0.9, 1, 1]`. **OBSERVED**
   (`evidence/live3d-planrect.json` → `surroundTransform`).
3. The wall strip is transformed into the piece's normalised space, clipped to the unit square, and
   `doorOrWindowFrontArea` is subtracted → the **surround area** (the wall material that fills the
   parts of the opening rectangle the model does not). Live `areaPoints` bounds: half-round
   `[-0.5, -0.491, 1, 0.861]`, round `[-0.5, -0.5, 1, 1]`, double-arched
   `[-0.5, 0.465, 1, 0.035]`, craftsman `[-0.5, -0.5, 1, 1]`. **OBSERVED**
   (`evidence/live3d-surround.json`, `evidence/live3d-surroundcoords.json`).
4. The points are extruded by a **half wall thickness** along the wall normal
   (`deltaXToWallMiddle`, `deltaZToWallMiddle`) to build:
   - the **surround side polygons** (`POLYGON_ARRAY`, one strip per contour);
   - a **border quad strip** along every edge that is *not* on the wall top line — this is the
     visible "reveal" / jamb thickness around an arch or an inset frame;
   - a **sloping-top quad strip** for edges that *are* on the wall top line (so the wall cap
     continues over the opening).
   `reversed` is computed as `frontOrBackSide > 0 XOR wallSide == WALL_RIGHT_SIDE XOR
   isModelMirrored()` to keep winding consistent. **OBSERVED** (`evidence/Wall3D.java.txt`
   lines 1098–1230; JS `wall3d-region.pretty.js` lines 987–1141).

**Live geometry proof for arches.** In every non-rectangular scenario the pass-1 vertical geometry
is the **bounding rectangle only**, and only the thin top strip differs once the surround pass runs.
**OBSERVED** (`evidence/live3d-scenarios.json`, `evidence/live3d-surround.json`,
`evidence/live3d-surroundcoords.json`):

| opening | shape | live bounds of the difference | meaning |
|---|---|---|---|
| Half round window | `M0,1 a0.5,0.997 0 1,1 1,0 z` | `[-0.5, -0.491, 1, 0.861]` | surround is the upper 86 % — the arch head plus the full width |
| Round window | two semicircles | `[-0.5, -0.5, 1, 1]` | corner slivers all round |
| Double arched window | `a3.7,3.7` arch | `[-0.5, 0.465, 1, 0.035]` | **only the 3.5 %-tall top strip** |
| Quadruple arched window | `a0.5,0.139` | `[-0.5, 0.465, 1, 0.035]` | same |
| Craftsman door | `M0.078,0.037 … 0.846 …` | `[-0.5, -0.5, 1, 1]` on the wall strip but `[-0.422, -0.5, 0.846, 0.964]` on the *model* front area | a narrow inset frame around an otherwise rectangular door |
| Fixed triangle window | `M0,0 v1 h1 z` | `[-0.5, -0.5, 1, 1]` | corner slivers |
| Revolving door | stair-step keyhole | `[-0.5, -0.5, 1, 1]` | full-height notch |

So "arched window" in Sweet Home 3D is **a rectangular hole with a curved head patch**, not a
free-form curved hole through the wall. The arch shape does not appear in the jamb/lintel
triangulation; it appears as the extra surface that fills the corners of the aperture.
- **Fallback**: if the model fails to load the front area is set to `FULL_FACE_CUT_OUT_AREA`, so
  the surround is empty and the opening degenerates to a plain rectangular hole. Same for a model
  with more than 1 000 000 vertices. **OBSERVED** (`evidence/Wall3D.java.txt` line 634–644;
  `evidence/modelmanager-frontarea.pretty.js`).

### 2.5 The 2-D plan rectangle is the cut path's *bounds*, never the path

Live `PlanComponent.getDoorOrWindowRectangle(piece, inPlan)` on real catalog items
(`evidence/live3d-planrect.json`; formula confirmed in `evidence/getDoorOrWindowRectangle.js`):
- `width/depth` in plan space: `Rectangle2D.Float(x − width/2 + wallLeft·width, y − depth/2 +
  depth·wallDistance, width, inPlan ? depth·wallThickness : depth)`.
- If the shape is non-default and non-null, the rectangle's **x offset and width are replaced by
  the path's `bounds2D` x/width scaled by the opening width** (mirrored as
  `(1 − a.x − a.width)·w` when `isModelMirrored()`). Only width/left are clipped — **the height is
  not**, which is why a round window still draws as a full rectangle.

| item | piece w×d | drawn plan rect (x, y, w, h) |
|---|---|---|
| Door (default shape) | 91.5 × 14.5 | 154.25, −6.25, 91.5, 7.5 (depth × wallThickness = 0.5172) |
| Half round window | 91 × 25 | 154.427, −12.5, **91.146**, 25 |
| Round window | 91 × 25 | 154.427, −12.5, **91.146**, 25 |
| Craftsman door | 100.9 × 18.7 | 157.42, −7.65, **85.361**, 11.6 |
| Revolving door | 384 × 300 | 8, −7.5, 384, 15 |
| Window (no shape → default) | 91 × 34 | 154.5, −17, 91, **25** (depth capped by the wall) |
| Door with `wallWidth=0.5, wallLeft=0.25` | 91.5 × 14.5 | 177.125, −6.25, **45.75**, 7.5 |

  The half-round/round cuts are *wider* than the nominal width because the batik path's arc
  control points overshoot the unit square (`0.997`, `0.5` radii → bounds 1.0015 / 1.0045);
  the craftsman door's rectangle **shrinks to 0.846 × width and 0.964 × height**.
  **OBSERVED** (`evidence/frontarea-paths.json` for the raw bounds).
- `paintDoorOrWindowWallThicknessArea` (the 2-D hint that the opening passes through the wall)
  is drawn **only when `isWallCutOutOnBothSides()`**: it intersects the piece's plan rectangle with
  each parallel wall and fills the union. **OBSERVED** (`R1:bundles/…` region dumped to
  `evidence/getDoorOrWindowRectangle.js`, further lines).
- The plan never draws the cut contour, so a user cannot see an arch in plan view — the arch is
  purely a 3-D/materials feature. **OBSERVED** + **INFERRED** (the painter only fills rectangles
  and sash arcs).

### 2.6 Sills, heads and elevations: where a hole sits vertically

- The opening's cut spans `[groundElevation, groundElevation + height]` where
  `groundElevation = piece.getElevation()` adjusted for the level's floor thickness
  (`getFloorThicknessBottomWall`, with a `LEVEL_ELEVATION_SHIFT = 0.1 cm` nudge so an upper-floor
  wall's bottom doesn't fight a room ceiling). **OBSERVED** (`evidence/Wall3D.java.txt`
  lines 1242–1300; `createWallGeometries`).
- Openings are considered only if `elevation + height > wallElevation` **and**
  `elevation < maxTopElevation`, so an opening entirely above or below the wall band is ignored,
  and one that crosses the top line is clipped by the trapezoidal-top test. **OBSERVED**.
- Live: `Small window` (sill 87), `Round window` (130), `Fixed triangle window` (130),
  `Half round window` (210), `Double arched window` (11) all produced the expected sill/lintel
  bands (see the table in §2.3); `Door` (0) produced no sill band. **OBSERVED**.
- `SubpartSizeUnderLight > 0` subdivides each vertical part into a ladder of quads (for nicer
  point-light shading) and is applied *before* the top line, so the split does not change the hole.
  **OBSERVED** (`createVerticalPartGeometry`, lines 724–742).

### 2.7 Performance and caching

- `Wall3D.rotatedModelsFrontAreas` is a `WeakHashMap` keyed by
  `ModelRotationTuple{model, rotation, cutOutShape}` so the expensive silhouette is computed once
  per (model, rotation, cut-out path). The JS bundle stores the same tuple as an object with
  `equals`. **OBSERVED** (`evidence/Wall3D.java.txt` line 1280+;
  `evidence/wall3d-region.pretty.js` `getRotatedModelFrontArea`).
- If the model is not yet loaded the code queues the piece and requests one repaint when all
  missing models for that side are done (`EventQueue.invokeLater` / `setTimeout`). **OBSERVED**.
- The **2-D plan** has its own cache (`doorOrWindowWallThicknessAreasCache`), invalidated on
  furniture/wall changes. **OBSERVED** (`evidence/getDoorOrWindowRectangle.js`).
- Wall geometry is rebuilt for **both** wall sides on every update (`updateWallGeometry`), and
  doors trigger it through `wallsDoorsOrWindowsModification → repaint`. **OBSERVED** (`R1` §2.4).

### 2.8 The desktop authoring surface for these properties

**DOCUMENTED**: the changelog records the cut-out shape's whole life —
- v4.2 (2014) "Added … to customize the cut out shape of doors and windows" (Furniture Library
  Editor text field); **DOCUMENTED** `https://www.sweethome3d.com/history/`.
- v5.2 (2015) "Changed the width of the rectangle of doors and windows in the plan to take into
  account the width of their `doorOrWindowCutOutShape` property when it's smaller" — exactly the
  `getDoorOrWindowRectangle` bounds rule measured in §2.5; **DOCUMENTED** + **OBSERVED**.
- v5.5 "Made doors and windows always cut out the both sides of the walls to which they are added"
  — the 4 × thickness inflation of §2.2 became the default; **DOCUMENTED** + **OBSERVED**.
- v7.5 "Handled the user interface of 3D model transformations …" and "fixed the default value of
  `doorOrWindowWallThickness`" — `modelTransformations` is the trigger that re-normalises the front
  area by the wall fractions; **DOCUMENTED** + **OBSERVED**.
- The property is **not** in the placed-item modification dialog (which exposes only
  width/depth/height/mirror/etc.); it is authored in the Furniture Library Editor, per `R1` §2.6/2.8.
  **DOCUMENTED** + **OBSERVED**.

### 2.9 Methodology notes (what is new vs. round 1)

- Round 1 could not render 3-D. Here, headless Chromium **for Testing 153** (Playwright
  `chromium-1243`) with software GL worked:

  ```
  --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist --disable-gpu-sandbox
  ```

   `canvas.getContext('webgl')` → `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)),
   SwiftShader driver)`. Without the flags the GPU process crashes with `GPU process isn't usable.
   Goodbye.` / `exit_code=6` (the symptom round 1 saw). **OBSERVED** (`probe/webgl-test.js`,
  `R1:chrome9555b.log`).
- With GL up, `application.getHomeController(new Home())` still returns `undefined` until the home
  is added, so the harness does `home.setName(); application.addHome(home);` first — then
  `getHomeController` → `LocalFileHomeController`, `getHomeController3D()` → an anonymous
  controller whose `getView()` is a `HomeComponent3D` with a live `canvas3D.gl`. **OBSERVED**
  (`probe/render4.js`).
- Instrumenting `WebGLRenderingContext.prototype.drawArrays/drawElements` proved the app really
  draws (116 calls, 44 124 vertices for one wall + one door). `gl.readPixels` then returned all
  zeros because the context is composited into the page, so I used mesh-level capture
  (`new Wall3D(wall, home)` plus monkeypatched `createVerticalPartGeometry` /
  `createGeometriesSurroundingDoorOrWindow`) instead. This is why the claims above are
  **OBSERVED-vertex** rather than **OBSERVED-pixel**. **OBSERVED**
  (`evidence/live3d-drawcalls.json`).

---

## 3. Ideas for CasaPlazAI

Ranked by value / effort. Each is tied to a finding and, where relevant, to
`~/dsh-workspaces/rea2-shared/casaplazai-schema.md` (v1 `FloorplanData`).

1. **Generalise `Opening` from `sillHeight`/`headHeight` to a full cut-out profile (H / M)** —
   findings §2.1, §2.4. Sweet Home 3D's `cutOutShape` is an SVG path in a unit square (y down), and
   11 distinct non-default shapes ship in the catalog. CasaPlazAI's `Opening` currently stores
   `kind`, `tCenter`, `width`, `sillHeight`, `headHeight` — a rectangle in the wall. Add
   `cutOutShape?: string` (normalised SVG path, default `M0,0 v1 h1 v-1 z`) to `Opening`, keep
   `sillHeight`/`headHeight` as the **bounding box**, and let the 3-D builder read the path. This
   is additive, matches the `migrate.ts` convention (register a pure transform under v1 →
   `schemaVersion: 2`, or add an optional field with a documented default), and unlocks arches,
   round windows and hatches without new `kind` values. **Ties to schema: `Opening`.**
2. **Cut holes by subtracting the opening footprint from the wall polygon (H / L)** — §2.3. The
   competitor's 3-D builder is: `wallSideArea.subtract(openingPlanArea)`, walk the resulting
   `PathIterator`, extrude each closed sub-path vertically between its band's elevation and the wall
   top. Live numbers (7.5 cm wall, 91.5 cm door at x=100): jamb 0–54.25, lintel 208.5–250, jamb
   145.75–400. This reproduces correct holes for sloped walls, shared walls and openings that cross
   the wall top, and it needs no CSG library — just a polygon `Area` subtraction plus polygon
   triangulation, both of which CasaPlazAI's Three.js stack already has to do for room floors.
   **Ties to schema: `Opening`, `Room.wallsOverride`.**
3. **Emit sill and lintel bands per opening, not one hole (H / M)** — §2.3, §2.6. A window must
   leave wall below it and above it; CasaPlazAI currently has a single opening interval. Walk
   `[floor, sill]`, `[sill, head]`, `[head, wallHeight]` and emit three wall parts, capping the
   underside (sill) and top (head) with horizontal quads. Sweet Home 3D also splits *between
   stacked* openings by pairwise area intersection and sorting by ground elevation — that is the
   exact algorithm for a "transom above a door" case. **Ties to schema: `Opening.sillHeight` /
   `headHeight`.**
4. **"Cut on both sides" as an explicit per-opening boolean + wall-fit invariant (H / L)** —
   §2.2. Add `cutThroughWall?: boolean` (default `true`) to `Opening`. In the 3-D builder, when
   true simply cut the opening's prism through the whole wall thickness (which is what CasaPlazAI
   almost certainly wants for every door/window); when false, cut only the near skin (the
   competitor's `Service hatch` case). Sweet Home 3D implements this by inflating the cutting
   footprint's depth by `4 × wallThickness`, but since CasaPlazAI owns the mesh, an explicit
   prism is cleaner and removes Sweet Home 3D's "the door does not re-fit when the wall thickens"
   defect that round 1 flagged (idea 1 there).
5. **Clip the 2-D plan rectangle to the cut path's bounds (M / L)** — §2.5. Even before you
   triangulate anything, replacing the plan rectangle's offset/width with the path's `bounds2D`
   (mirrored when the opening is mirrored) makes a round window read as a round-ish aperture and a
   craftsman door as a narrower frame. Sweet Home 3D's exact rule is measured in §2.5. This is a
   few lines in the 2-D renderer and is the single cheapest visual win; it needs only an optional
   `cutOutShape` field on `Opening` or a per-type constant table.
6. **Two-pass / repaint for the arch head patch (M / M)** — §2.4. Sweet Home 3D's pass 1 reserves
   the opening's **bounding rectangle**; pass 2 adds back a "surround" surface filling the corners
   the shape does not occupy, plus a `halfWallThickness`-deep border strip along every non-top
   edge. Port the *idea*: build the hole as its bounding box, then add a small "reveal" ring and
   corner fills. That keeps the wall triangulator simple (rectangles only) while still producing a
   visually correct arch — which is exactly what Sweet Home 3D does, and its surround for a
   double-arched window is only `1.0 × 0.035` of the opening. **Ties to schema: `Opening`.**
7. **Model partial cut-outs as four fractions, but only if you need them (L / L)** — §2.2, §2.4.
   `wallWidth / wallLeft / wallHeight / wallTop` (defaults `1 / 0 / 1 / 0`) let an opening occupy
   only part of its own footprint (a service hatch, a frame-only insert). The catalog ships
   **zero** items using them, so this is not needed for a small palette; it is the clean data model
   if CasaPlazAI ever adds a hatch or AC vent. Implement as optional per-`Opening` numbers that
   scale the cut path inside its rectangle. **Ties to schema: `Opening`.**
8. **Cache the cut silhouette per (profile, mirrored) (M / L)** — §2.7. Sweet Home 3D keys a
   `WeakHashMap` on `(model, modelRotation, cutOutShape)`. CasaPlazAI's procedural meshes have no
   model, so a `Map<shapeString, {bounds, polygon}>` (plus a mirrored variant) rebuilt only when
   the profile changes is enough and keeps the wall rebuild in the per-frame budget.
9. **Keep the cut-out profile a *type* property, not a primary inspector field (M / L)** —
   §2.8, `R1` §2.8. The competitor's placed-item dialog never exposes `cutOutShape`; it lives in the
   library editor as a per-type default. For CasaPlazAI's single-workspace redesign: the opening
   inspector should keep `width` (and maybe an "arched" toggle / preset picker), while an
   "Opening types" editor owns the path string. Matches the Plan/3D/Walk tool-card model and
   avoids a raw SVG text box in the main flow.
10. **Draw the through-wall hint in 2-D only for through-openings (L / L)** — §2.5. Sweet Home 3D
    fills the wall-thickness area in plan only when `isWallCutOutOnBothSides()`. A subtle hatch
    over the wall depth at each opening instantly communicates "this pierces the wall" and pairs
    with idea 4's flag.
11. **Keep the arch truth in 3-D, not in the plan (L / L)** — §2.5, §2.4. Because Sweet Home 3D
    never draws the arch contour in plan, its plans stay readable. CasaPlazAI should do the same:
    plan shows the (bounds-clipped) rectangle + swing arc, the 3-D view shows the real profile.

---

## 4. Unknowns

- **Pixel-level proof is still missing.** I closed round 1's WebGL gap (software GL works; the app
  rendered 116 draw calls / 44 124 vertices), but `gl.readPixels` returned zeros — the canvas is
  composited, not a readable framebuffer, and I cannot view screenshots anyway. All 3-D shape
  claims are **vertex-level OBSERVED** (captured geometry arrays), not rendered-frame OBSERVED.
- **Exact surround-mesh vertex winding and texture mapping at non-90° wall/door angles** (v4.4
  changelog mention) — read in the vendor source, not observed. `reversed` is computed and I did
  not verify the resulting normals or the texture-coordinate orientation on a curved/round wall.
- **`Service hatch` (`wallCutOutOnBothSides=false`) full end-to-end behaviour** — I proved the
  thin-piece single-side case numerically (4 vs 6 vertical parts per wall side) but did not place
  the actual `Service hatch` and confirm the wall is cut on exactly one face in a rendered view.
- **Desktop Furniture Library Editor UI** for the cut-out shape text field (v4.2) was not
  exercised; the desktop app was not installed (rules forbid downloads/installers). The field is
  DOCUMENTED in `history/` only.
- **`ModelManager.getFrontArea` for the 6 `SeberRider` items that carry no shape** — the live
  buckets show those items do enter the surround pass (`surrounding: 2`), but I did not capture
  their actual silhouette bounds; round 1's `cutOutShape = null` uncertainty is resolved
  structurally (the reverted `FULL_FACE` rectangle means the surround is empty for the default
  silhouette, non-empty for a modelled silhouette) but not per item.
- **Round-wall (`arcExtent != 0`) hole quality** — the code path exists and I read it; I only ran
  straight walls live.
- **Behaviour when a door's own `depth` no longer matches the wall** (round 1's known defect) is
  not re-measured here; the thin-piece test shows the *cut* still follows the wall, so the visual
  hole is fine even when the leaf is under-sized.
- **Licensing**: Sweet Home 3D is GPL-2.0+; its `FurnitureCatalog.json` paths and Java/JS code are
  GPL/CC-BY. Nothing was copied into this report; the vendor `Wall3D.java` was fetched read-only
  for algorithm facts and is retained as evidence text only. CasaPlazAI must not reuse those path
  strings or that code — only the behavioural patterns described here.

---

### Evidence index (all inside this job folder, `evidence/` unless noted)

| file | what it is |
|---|---|
| `Wall3D.java.txt` | vendor GPL source (`sourceforge.net/.../Wall3D.java`), the authoritative cut-out algorithm; the omitted middle was recovered from the fetch spill |
| `wall3d-region.pretty.js`, `wall3d-region.js` | the 3-D wall region of `R1:bundles/sweethome3d.min.js`, prettified |
| `getDoorOrWindowRectangle.js`, `plan-cut-rect-region.pretty.js` | the 2-D plan rectangle + wall-thickness-area painter |
| `modelmanager-frontarea.pretty.js` | `ModelManager.getFrontArea` (silhouette → unit-square normalisation) |
| `frontarea-paths.json` | live `ShapeTools.getShape` + `getFrontArea` bounds for all 12 shipped paths |
| `live3d-wallparts.json` | live `Wall3D` vertex capture for one door (jambs + lintel, exact ranges) |
| `live3d-scenarios.json` | 15 live scenarios: rectangles, arches, hatches, stacked and side-by-side openings, 20 cm wall, angle 90° |
| `live3d-surround.json` | pass-1 vs pass-2 surround calls, `areaPoints` bounds, thin-piece both-sides test |
| `live3d-surroundcoords.json` | surround vertex counts per shape; the 3.5 % arch-head strip |
| `live3d-planrect.json` | live 2-D plan rectangles for 9 real items + the wall-fraction transform chain |
| `live3d-drawcalls.json` | WebGL draw-call instrument: the app really renders (116 calls); surround pass-2 timing |
| `live3d-render-probe2.json`, `live3d-boot.json`, `live3d-protochain.json`, `live3d-api.json` | app boot, prototype chain, `Wall`/`Home` API discovery |
| `scenario-schema.json` | `rea capture-browser-scenario` input schema |
| `probe/` (job root) | the Playwright harnesses: `webgl-test.js`, `live3d*.js`, `render*.js`, `drawcalls.js`, `planrect.js`, `frontarea.js` |
| `sources.json` | machine-readable source and claim list |

Vendor URLs used: `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (live app, v7.5.2),
`https://www.sweethome3d.com/history/` (changelog), `https://www.sweethome3d.com/users-guide/`
(manual), `https://www.sweethome3d.com/libjs/FurnitureCatalog.json` (catalog, via round 1),
`https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/j3d/Wall3D.java`
(vendor source), `https://www.sweethome3d.com/de/` (German landing page).
