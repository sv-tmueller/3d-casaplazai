# 3D House Planner — how openings cut wall meshes (CSG vs segmented), curved walls, sill/head heights in 3D
**Round-2 deep dive for CasaPlazAI · job `05-04c-doors-windows-wall-cutting`**

Target: <https://www.3dhouseplanner.com/> — editor `app.php` (Babylon.js), 2D planner embedded as
`2D-Planner/index.php?lang=en`. Round-1 report reused read-only:
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/04-04-doors-windows/report.md`.
Research date 2026-10-31. No source code copied; behaviour described in my own words.

**Method (new in this round).** Round 1 could only read the obfuscated bundles and therefore had to *infer* the
CSG cut. This round adds a **live instrumented session**: headless Chrome 156 (`--headless=new`, `--no-sandbox`,
`--use-angle=swiftshader --enable-unsafe-swiftshader`, CDP on port 9333) driven through the app's **own exposed
API** `window.HP3D` (a 107-member object the app publishes once the "Project settings" dialog is dismissed).
Every number below comes from real Babylon.js state read back over CDP — `getVerticesData`, `getTotalVertices`,
`subMeshes`, `BoundingInfo`, `scene.pickWithRay` — never from screenshots. Evidence: `raw/exp1.json` … `raw/exp24.json`,
`raw/notes-exp.md`; drivers `cdp.py`, `cdp3.py`, `ev.js`, `nav2.py`.

## 1. Summary

- **The wall is cut with real Babylon.js CSG boolean subtraction — not segmented geometry.** For each host wall
  the app builds a temporary box from each opening's world bounding box, converts the *running cut mesh* and the
  box to `BABYLON.CSG`, and calls `.subtract()`, re-meshing the result under the id `csg`. There is no
  pier/lintel/sill segmentation anywhere. *(OBSERVED — `src/hp-editor.deobf.js` `_0x4d5796`; live
  `raw/exp2.json`, `raw/exp4.json`)*
- **All openings of one wall are subtracted in a single chained pass, producing one mesh per wall.** Openings are
  grouped by `intersectsMesh` against each `wall` mesh; the source wall is then **disabled, not deleted**
  (`isEnabled() = false`) and replaced by one `csg` mesh plus 4 child `wallslaves` planes and one
  `windowrefplane` per opening. Live: a 4 m wall with 1 door + 1 window → one `csg` mesh, 708 verts / 236 tris,
  4 subMeshes with `materialIndex [2,3,0,1]`. *(OBSERVED — `raw/exp2.json`, `raw/exp5.json`, `raw/exp11.json`)*
- **The cut is a genuine through-hole, verified by ray-casting.** A ray grid cast through the cut wall finds
  *no hit* across exactly the opening rectangles — door `x 1.60–2.40, y 0.00–2.10`, window `x 0.25–1.35,
  y 1.00–2.10` — and finds solid wall everywhere else, including through the wall **edge** at `x = 4.00` and
  above the door head at `y = 2.25`. 3091/4374 sample rays solid. *(OBSERVED — `raw/exp4.json`, `raw/exp3.json`)*
- **Curved walls are faceted polylines that take the same CSG path, and one scalar carries the curvature.**
  A curved wall is re-meshed into `max(8, min(96, ceil(sweep / 4°)))` copies of the cross-section;
  `HP3D.wallEndpoints()` returns the full arc record (`center, radius, sweep, arcLength, s, mid, dir,
  startAngle, endAngle`) and `HP3D.wallPointAt(wall, t)` gives point + tangent yaw. Openings are placed by `t`
  and rotated to the arc tangent — verified on three doors: mesh yaw tracks the tangent yaw 1:1 at a constant
  +90° offset and positions match `wallPointAt` to the millimetre; a ray at the arc apex hits the door head at
  exactly `y = 2.10`. The plan state stores the curvature as the 2D wall's `bulge` in px, and the 3D
  `curve.s = bulge / meter` (live: −60 px / 60 → −1.0 m, same radius 5 m / sweep 1.287 rad arc).
  *(OBSERVED — `raw/exp6.json`, `raw/exp7.json`, `raw/exp13.json`, `raw/exp37.json`)*
- **Sill and height are parametric and clamped, head is derived, and `sill` never reaches the shared plan state.**
  Doors are forced to `sill = 0`; windows clamp `sill` to `[0, wallHeight − openingHeight − 0.05]` (a request for
  `1.5 m` came back at `1.4 m`; `4.0 m` also came back at `1.4 m`); height clamps to `wallHeight − 0.05` (door) /
  `wallHeight − 0.2` (window); width to `[0.4, wallLengthOrArcLength − 0.1]`. Head is always `sill + height` and
  no head field exists. Openings written back to `HPSync.getState()` carry exactly `family, class, type, x, y,
  angle, angleSign, size, thick, hinge, height3d, model, uid` at `meter = 60` px/m (a `1.2 m × 1.2 m` window
  serialises as `size:72, height3d:72`), and setting `sill:0.9` then re-projecting does **not** persist it — so
  `sill` is 3D-session-only. *(OBSERVED — `src/hp-editor.deobf.js` `placeOpening`; live `raw/exp8.json`,
  `raw/exp13.json`, `raw/exp33.json`, `raw/exp38.json`)*

## 2. Findings

### 2.1 Wall generation: overlap-and-merge, deliberately

A wall built through the app's own API is a box-like mesh with id `wall` and name `wall_merged`:

| Property | Live value (wall 0,0 → 4,0; thickness 0.2; height 2.65) |
|---|---|
| vertices / indices | 48 / 72 |
| subMeshes | 2 (the two long faces) |
| `scaling` | `L + thickness − 0.05`, `height`, `thickness` → `4.15, 2.65, 0.20` |
| `position` | mid-span, `baseY + height/2` → `(2, 1.325, 0)` |
| `rotation.y` | `atan2(dx, dz) − π/2` |

*(OBSERVED — `raw/exp1.json`; `src/hp-editor.deobf.js` `buildWall`)*

The `− 0.05` in the length is a deliberate 5 cm overlap so that collinear/joined walls leave no seam — this is
how **wall joints** are handled. It is emphatically *not* how openings are handled. Confusing the two would be an
easy mistake: round 1 listed `wall_merged` and `csg2` as wall-like ids and inferred subtraction; this round shows
the two mechanisms are separate and that the join mechanism is length overlap, while the opening mechanism is
boolean subtraction.

### 2.2 The cut pipeline, reduced from the shipped function `_0x4d5796`

Round 1 could only infer this from mesh ids. It is now read *and* executed:

```
for each mesh with id "wall":
    group every mesh with id "door_window" for which doorWindow.intersectsMesh(wall, true)
    (first match starts the group; a wall with no openings contributes no group)

for each group [ wall, opening_1 … opening_n ]:
    for each opening_i:
        bounds = union of that opening's subMesh world bounding boxes
        w = distance(bbox corner0, corner2)        # long axis (length)
        d = distance(bbox corner1, corner5)        # short axis (thickness)
        if w < d  ->  w *= 6      else  d *= 6     # deliberately over-deep cutter
        box = MeshBuilder.CreateBox("box", { width: w,
                                             height: 2 * bbox.extendSizeWorld.y,
                                             depth: d })
        box.position   = bbox.center
        box.rotation.y = signed angle between the bbox face normal and +X
        cutter = CSG.FromMesh(box)
        if first opening of this wall:
            target = CSG.FromMesh(wall)
        else:
            target = CSG.FromMesh(csgMesh)          # chain onto the previous result
            scene.removeMesh(csgMesh); csgMesh.dispose()
        result  = target.subtract(cutter)
        csgMesh = result.toMesh("csg", wall.material, scene, true)
        csgMesh.createNormals()
        # material slots: one per cut face, then the 2 ORIGINAL wall faces last
        for i in 0 … subMeshes.length-3:  subMeshes[i].materialIndex = i + 2
        subMeshes[len-2].materialIndex = 0
        subMeshes[len-1].materialIndex = 1
        csgMesh.slaves = 4 × Mesh.CreatePlane("wallslaves", DOUBLESIDE, parent = csgMesh)
            positions (±0.5001, 0, 0) and (0, ±0.5001, 0), rotations ±π/2
            materials copied from wall.getChildMeshes()   # texture continuity
        opening.name = "door_window_binding-<i><n>"
        opening.slaves[0] = MeshBuilder.CreateGround("windowrefplane",
                                { width: opening width, height: opening height })
            material = StandardMaterial, diffuseTexture "./textures/patternwindows.jpg",
            zOffset = 2, emissiveColor black, isPickable = false
            placed at the wall centreline, y = csgMesh.slaves[2].absY + 0.0003
        hide the source wall:  wall.isPickable = false;  wall.setEnabled(false)
        scene.removeMesh(box); box.dispose()
```

*(OBSERVED — `src/hp-editor.deobf.js` `_0x4d5796`, entered from `_0x2d4b33()`; the live runs `raw/exp2.json`,
`raw/exp5.json`, `raw/exp11.json` produced exactly the meshes, subMesh counts, material indices and child names
this code predicts)*

Live confirmation of the result of one door + one window on a 4 m wall:

| field | value |
|---|---|
| id / name | `csg` / `csg` |
| vertices / indices / tris | 708 / 708 / 236 |
| subMeshes | 4, `materialIndex = [2, 3, 0, 1]`, `verticesCount = [96, 72, 264, 276]` |
| child meshes | 4 × `wallslaves` |
| `isPickable` | `true` |
| original wall | `wall_merged`, `isEnabled() = false` (still in `scene.meshes`) |
| per opening | one `door_window_binding-<n>` mesh + one `windowrefplane` (disabled) |

*(OBSERVED — `raw/exp2.json`, `raw/exp5.json`, `raw/exp6.json`)*

`HP3D.classify()` names the new kind explicitly: `wall | wall_merged | csg2 → "wall"`, **`csg → "wall_cut"`**,
`door_window → {"door"|"window"}`. `HP3D.cutOfWall(wall)` and `HP3D.wallOfCut(csg)` exist as an explicit
back-pointer pair. Live: `cutOfWall(wall)` → the 708-vertex `csg`; `wallOfCut(csg)` → the 48-vertex disabled
`wall_merged`. *(OBSERVED — `raw/exp11.json`)*

### 2.3 The cut is real, and it is a bounding box, not a silhouette

Ray-cast a grid along −Z through the cut wall (0.00–4.00 m × 0.00–2.65 m at 5 cm) and test
`scene.pickWithRay` against `csg`:

```
y = 0.00 – 0.90   ..........                      hole x 1.60–2.40 only
y = 1.00 – 2.10   .[hole 0.25–1.35].[hole 1.60–2.40].
y = 2.15 – 2.65   ##############################   solid
```

Totals: **3091 solid / 1283 hole** out of 4374 rays. The door hole is `x 1.60–2.40, y 0.00–2.10`
(the placed door leaf measured `minX 1.55, maxX 2.45`, `minY 0.002`, `maxY 2.1`; the ray grid's 5 cm spacing
explains the 5 cm difference). The window hole is `x 0.25–1.35, y 1.00–2.10` (leaf `0.2–1.4` × `0.9–2.1`).
Cross-checks: a ray at `x = 4.00` (the exact wall end) hits solid; a ray at `y = 2.25` (above the door head)
hits solid; a ray at `y = 2.08` is open. *(OBSERVED — `raw/exp4.json`, `raw/exp3.json`)*

Corroboration inside the CSG mesh's own vertex data: in the door's X band the only Y values present are
`0, 0.875, 1.038, 1.05, 1.225, 1.612, 2.1, 2.65` — no horizontal edge between `0` and `0.875`, i.e. the wall
below/above the door was never re-split. A segmented rebuild would put edges at every pier boundary.
*(OBSERVED — `raw/exp3.json`)*

Because the cutter is the leaf's **bounding box** (not the GLB silhouette) grown by ×6 in the thin axis, the hole
is always the full rectangular envelope of the placed model. That is exactly what a schedule's `OpeningArea`
needs, but it also means a decorative frame or a non-rectangular model over-cuts. *(OBSERVED for the box
construction; the "always rectangular envelope" consequence is INFERRED and matches the ray map.)*

### 2.4 Curved walls

A curved wall is generated by re-meshing the flat wall mesh along an arc:

```
R, phi, sg  from  (chord L, bow s):  R = (L²/4 + s²) / (2s)
segments    = max(8, min(96, ceil(sweep / (π/45))))       # ~4° per segment
ringOuter   = arcPoints(R + sg*thickness/2, …)            # outer face
ringInner   = arcPoints(R − sg*thickness/2, …)            # inner face
ringMid     = arcPoints(R, …)                             # centreline for UVs
```

*(OBSERVED — `src/hp-editor.deobf.js` `_0x1fe53c`, `_0x62f832`, `_0xbd5953`, `_0x26a165`)*

Live measurements of four arcs confirm the formula exactly:

| bow `s` | chord | sweep (rad) | arc length | verts | tris | `ceil(sweep / 4°)` |
|---|---|---|---|---|---|---|
| 0.3 | 4.0 | 0.5956 | 4.060 | 176 | 152 | 9 |
| 1.0 | 6.0 | 1.2870 | 6.435 | 336 | 312 | 19 |
| 2.5 | 6.0 | 2.7790 | 8.476 | 672 | 648 | 40 |
| −1.5 | 3.0 | 3.1416 | 4.712 | 752 | 728 | 45 |

`HP3D.wallEndpoints(wall)` returns the full arc record:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

and `HP3D.wallPointAt(wall, t)` returns point **and** tangent for any normalised arc position:

| t | point (x, z) | yaw (rad) |
|---|---|---|
| 0.00 | 6.000, 0.000 | −0.6435 |
| 0.25 | 7.419, 0.743 | −0.3218 |
| 0.50 | 9.000, 1.000 | 0.0000 |
| 0.75 | 10.581, 0.743 | +0.3218 |
| 1.00 | 12.000, 0.000 | +0.6435 |

*(OBSERVED — `raw/exp6.json`)*

**Openings on curved walls use the same placement and the same cut.** In `placeOpening`, if the endpoint record
carries a `curve`, the linear interpolation is replaced by `wallPointAt(wall, t)` and the yaw comes from the
tangent; otherwise the yaw is the flat wall's yaw. Live verification of the rotation on three doors along a
6 m / 1 m-bow arc:

| t | mesh yaw (measured from `rotationQuaternion`) | tangent yaw | leaf position | `wallPointAt` point |
|---|---|---|---|---|
| 0.25 | 71.565° | −18.435° | 401.419, 0.743 | 401.419, 0.743 |
| 0.50 | 90.000° | 0.000° | 403.000, 1.000 | 403.000, 1.000 |
| 0.75 | 108.435° | +18.435° | 404.581, 0.743 | 404.581, 0.743 |

The mesh yaw is consistently `tangent yaw + 90°`, which is the app's own `+ (longAxis === 'z' ? π/2 : 0)`
convention — so **the leaf is correctly tangent to the arc**. Positions match `wallPointAt` to the millimetre.
*(OBSERVED — `raw/exp13.json`)*

**The boolean runs on the faceted arc wall.** The curved-wall test (6 m chord, 1 m bow, one 1.6 m door at
`t = 0.5`) produced a cut mesh of **3438 vertices / 3 subMeshes**, and a vertical ray at the arc apex
`(x = 9, z = 1)` hit the **door head at exactly y = 2.10** — the same clamp value as on a straight wall.
With a door + a window on that arc: 4746 verts / 1582 tris / 4 subMeshes, `materialIndex [2,3,0,1]`,
subMesh `verticesCount [420, 402, 2151, 1773]` — the last two (the original wall faces) dominate because the
arc's faceting multiplies their triangles. *(OBSERVED — `raw/exp7.json`, `raw/exp9.json`, `raw/exp12.json`)*

Two consequences worth flagging for CasaPlazAI:

* The ×6 cutter growth exists precisely so a **chord-shaped flat cutter** still passes fully through a wall whose
  two faces are not parallel (a curved wall). *(INFERRED from the observed `w *= 6 / d *= 6` branch plus the
  successful curved cut; I did not sweep bow heights to find the failure point.)*
* Cost is dominated by the faceting, not the boolean: identical openings cost 690 verts / 230 tris on a straight
  6 m wall but 4746 verts / 1582 tris on a 6 m chord with 1 m bow. *(OBSERVED — `raw/exp12.json`)*

### 2.5 Sill and head heights

`placeOpening({ kind, wall, t, level, width, height, sill, … })` clamps (reduced from
`src/hp-editor.deobf.js`):

```
width  = max(0.4,  min(requested ?? (door ? 0.9 : 1.2), wallLengthOrArcLength − 0.1))
height = min(requested ?? (door ? 2.1 : 1.2), wallHeight − (door ? 0.05 : 0.2))
sill   = (kind === "door") ? 0
                          : max(0, min(requested ?? 1.0, wallHeight − height − 0.05))
```

The mesh is then scaled so the **long** horizontal axis (`bbox.x >= bbox.z ? "x" : "z"`) gets `width`, the other
horizontal axis gets `max(wallThickness, 0.05)`, and `y` gets `height`; it is then seated by adjusting
`position.y` until the mesh's world `minimumWorld.y` equals `baseY + sill`, where
`baseY = wall.absY − wallHeight/2`. *(OBSERVED — `src/hp-editor.deobf.js` `placeOpening` + the `_0x15d686`
grounding helper)*

Live clamp results on a 2.65 m wall, window leaf requested at 1.2 m tall:

| requested sill | resulting `minimumWorld.y` (sill) | `maximumWorld.y` (head) |
|---|---|---|
| 0.0 | 0.0 | 1.2 |
| 0.5 | 0.5 | 1.7 |
| 0.9 | 0.9 | 2.1 |
| 1.5 | **1.4** (= 2.65 − 1.2 − 0.05) | 2.6 |
| 4.0 | **1.4** | 2.6 |

and on the **curved** wall, `sill: 3.0` also came back as `minY 1.4, maxY 2.6` — the clamp is against the host
wall's height, independent of curvature. Two more:

| request | result |
|---|---|
| door `height: 5.0` on a 2.65 m wall | `minY 0`, `maxY 2.6` (clamped to `2.65 − 0.05`) |
| door `width: 20.0` on a 4 m wall | `minX 30.05`, `maxX 33.95` → width clamped to `3.9 = wallLength − 0.1` |

*(OBSERVED — `raw/exp8.json`, `raw/exp13.json`)*

**Head height is never an independent variable.** It is `sill + height`. There is no `head`/`headHeight` key in
`placeOpening`, in the BIM opening property grid, or in the schedule columns. The shipped i18n dictionary has
exactly one vertical opening key, `bim.sill` = "Sill height", and no head key — consistent with round 1.
*(OBSERVED — `raw/exp8.json`, `src/hp-editor.deobf.js`, round-1 `raw/app.html` i18n)*

The BIM panel reads the **actual** sill back out of the mesh for its placeholder: the default-sill helper is
`bbox.minimumWorld.y − levelBaseY(level)`, i.e. the hole's true world height above the level floor, and the
`data-open="sill"` handler stores the user's typed value on `opening.sill` (or `delete`s it when cleared, falling
back to the derived value). *(OBSERVED — `src/hp-bim.deobf.js` `_0x42a881`, the `dataset.open` branch)*

**Sill lives only in the 3D editor's own metadata — it is NOT in the shared 2D↔3D plan state.** This is the
sharpest finding of the section. The app has a shared state object, `window.HPSync.getState()`, which is the
2D→3D handoff (`{plans:{"0":{meter, walls[], objects[], rooms[], polygons[]}}, meshless, roofs, meter}`). Every
opening written back to it has exactly these 13 fields:

```
family, class, type, x, y, angle, angleSign, size, thick, hinge, height3d, model, uid
```

— **no `sill`**. Live test: a window placed through `HP3D.placeOpening({sill: 0.9})` round-tripped through
`HPSync.projectNow()` into the shared state; `hasOwnProperty('sill')` was `false` both in the shared object and in
the `metadata.hp.rec` copy of it. Even setting `mesh.metadata.opening.sill = 0.9` and re-projecting did **not**
persist it. So `sill` survives only as long as the 3D scene does; a 2D-only reload loses it and the placement
falls back to the derived/placeholder value. *(OBSERVED — `raw/exp33.json`, `raw/exp38.json`)*

The same round-trip fixes the unit convention unambiguously: the shared state's `meter = 60` px/m and a window
placed at `width 1.2 m, height 1.2 m` serialised as `size: 72, height3d: 72` → `72/60 = 1.2 m` on both axes.
The opening record is therefore **pixel-denominated inside the plan state and metre-denominated in 3D**, and the
rectangular hole is `size × height3d` px. *(OBSERVED — `raw/exp38.json`)*

### 2.6 The 2D planner's opening model, and the real plan schema (closes a round-1 Unknown)

Round 1 never fetched the 2D planner. Switching the live page to the "2D plan" mode creates
`<iframe id="floorplanIframe" src="…/2D-Planner/index.php?lang=en">`, whose `contentWindow` is same-origin and
exposes `floorplanEditor`, `qSVG`, `FloorplanLibrary` and the constants round 1 saw only indirectly. Now observed:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

*(OBSERVED — `raw/exp18.json`, `raw/exp22.json`, `raw/exp23.json`, fetched in-page from
`planner%2Fplanner-main&v=86a810eb2efba432`)*

`floorplanEditor` exposes a wall/opening API that mirrors the 3D side conceptually:
`wallLength`, `wallParamOf(wall, pt)`, `wallFrameAt(wall, u)`, `clampOpeningU(wall, size, u)`,
`openingLimits`, `openingOnArc(wall, pt, heightPx)`, `placeOnWall(wall, obj, pt)`.
`wallParamOf` is the same normalised-`u` projection the 3D `t` uses, and `wallFrameAt` the same
point+tangent frame — with an `arcParam` / `arcNearest` / `arcTangentDeg` branch for `wallArc(wall)`, i.e. the
2D planner also has explicit arc support. `clampOpeningU` returns `min(uHalf/W, 1 − uHalf/W)` after rejecting
`uHalf/W > 0.5`, so an opening that would overrun the wall is refused rather than silently slid.
*(OBSERVED — `raw/exp19.json`, `raw/exp20.json` function sources read out of the live frame)*

**The 2D height constants disagree with the 3D clamp.** The 2D planner caps door height at **2.5 m** and window
height at **2.0 m**, while the 3D `placeOpening` cap is purely `wallHeight − {0.05, 0.2}`. On a 2.65 m level
those coincide for doors (2.6 vs 2.5) but not in general — a 3 m floor lets the 3D editor make a 2.95 m door while
the 2D planner would refuse 2.5 m+. *(OBSERVED for both constants; the divergence is a direct comparison of the
two observed numbers, so OBSERVED.)*

Note also that `floorplanEditor.openingLimits(a, b)` is **not** a size-limits function despite the name: it
returns the two endpoints of an opening's footprint (`{x,y}` ± half-width along the wall tangent). The size
limits are the `DOOR_HEIGHT_LIMITS` / `WINDOW_HEIGHT_LIMITS` module constants plus
`getDoorWindowHeightLimits(type)`. *(OBSERVED — `raw/exp19.json`, `raw/exp20.json`)*

**The persisted 2D plan is the authoritative opening data model.** The 2D planner autosaves to
`localStorage["extension-floorplanner-history"]` — a JSON array of snapshots, each
`{objData[], wallData[], roomData[]}` — and `localStorage["extension-floorplanner-currently-editing"]`. The live
snapshot held 14 `doorWindow` objects and 6 walls. Complete wall record:

```json
{ "uid":"whcvz4zu3x1", "type":"normal", "start":{"x":0,"y":0}, "end":{"x":240,"y":0},
  "thick":12, "angle":0, "backUp":false, "parent":null, "child":null,
  "equations":{"up":{"A":"h","B":-6},"down":{"A":"h","B":6},"base":{"A":"h","B":0}},
  "coords":[{"x":0,"y":-6},{"x":0,"y":6},{"x":240,"y":6},{"x":240,"y":-6}], "graph":{} }
```

and the *only* geometric extras an opening record carries beyond the shared-state fields are a `bbox`,
a `realBbox` (the 4 rotated footprint corners), a `params.resizeLimit`, and an `orientation3dHint`
(`{method:"2d-front-v2", yawDeg, symbolFrontDeg, userOffsetDeg, productOffsetDeg, longAxis2d,
footprint2d:{width,length,aspect}, modelFootprint3d}`). *(OBSERVED — `raw/exp29.json`, `raw/exp30.json`)*

**Curved walls in 2D are carried by a `bulge` field, and it maps 1:1 onto the 3D `curve.s`.** All six live wall
records carried `bulge` (two with `-60` px, four with `0`), the shared state preserved it verbatim, and
`HP3D.buildWall({curve:-1.0})` on a 6 m wall reproduced exactly the arc that `bulge: -60` implies. The mapping is
`bulge_px / 60 = bow_metres`, i.e. **`curve.s = bulge / meter`**:

| source | value |
|---|---|
| 2D `bulge` (px) | −60 |
| `meter` (px/m) | 60 |
| 3D `curve.s` (m) | −1.0 |
| derived `mid` | (1003, −1) — 1 m off the chord, on the −Z side |
| derived `radius` / `sweep` / `arcLength` | 5 m / 1.287 rad / 6.435 m |

So the sign of `bulge` selects which side the arc bows to (`curve.s` preserves it, and `wallEndpoints().curve.dir`
flips accordingly), and the whole arc geometry is derivable from `{start, end, bulge}`. That is the cleanest
possible confirmation that the 2D and 3D representations are the *same* edge model at two scales.
*(OBSERVED — `raw/exp31.json`, `raw/exp32.json`, `raw/exp37.json`)*

**2D-guided paste is refused on curved walls.** `pasteOpening` early-returns `false` with the message
*"A separation line has no wall to hold a door or window."* for walls whose `type === "separate"`, and separately
returns `false` for any wall where `floorplanEditor.wallArc(wall)` is truthy — i.e. you can copy an opening but
cannot paste it onto a curved wall. Curved-wall openings in 2D go through `openingOnArc` instead.
*(OBSERVED — `raw/exp26.json`, `raw/exp29.json` for the message text)*

**`HPSync` is the real bridge.** `window.HPSync` = `{enabled, level, requestLevel, buildAt, moveBuild,
rotateBuild, moveHandle, deleteBuild, refreshBuildLayer, projectNow, flush, applyPlan, updateContours,
contours, setContours3d, setRoof, getState, setState, stairFootprints}`. `projectNow()` is what materialises a
placed opening back into the shared plan state and stamps `metadata.hp.rec` + `metadata.hp.synced`
(`{x, y, z, yaw, sx, sy, sz, c}`) onto the mesh; before that call, a freshly placed opening's metadata has only
`{kind, level}`. This is the exact handshake round 1 could not see. *(OBSERVED — `raw/exp32.json`,
`raw/exp36.json`)*

### 2.7 Side-effects that keep the cut mesh usable

* **Material continuity across the rebuild.** A CSG rebuild normally loses the wall material. This app keeps the
  two original wall faces as the **last two subMeshes** (`materialIndex 0, 1`), gives each new cut face
  `materialIndex i + 2`, and parents four `wallslaves` planes carrying cloned child materials so the reveal and
  the new faces still shade correctly. *(OBSERVED — `raw/exp2.json`, `raw/exp5.json`; `_0x4d5796`)*
* **One `windowrefplane` per opening**, textured with `./textures/patternwindows.jpg`, `zOffset = 2`,
  `isPickable = false`, sitting at the wall centreline just above the top slave plane, used as an in-plan 3D
  reference and toggled by a global visibility flag. *(OBSERVED — `raw/exp6.json` `refMeshes`)*
* **Downstream geometry consumes the cut list.** `listElements` explicitly skips kinds `wall_cut` and `plan`;
  skirting and ceiling trim run off the wall list with gaps at doors. Round 1's `openingNoWall` /
  `openingOverlap` checks therefore stay meaningful even though the cut is geometric. *(OBSERVED —
  `src/hp-editor.deobf.js`; round-1 `raw/app.html`)*

### 2.8 Cost, idempotency and removal

* **Re-cut is idempotent and cheap at one-wall scale, but not at whole-scene scale.** On a scene with a single
  cut wall, `cutwalls()` took **4 / 3.4 / 2 ms** on three consecutive calls and the `csg` count stayed at 1.
  On an accumulated test scene (6 walls, 14 `door_window` meshes, 5 `csg` meshes) the same call took
  **241.7 ms**, and 172.6 ms on the immediately following call with no scene change — so re-cutting *every*
  wall is the hot path, and an incremental "re-cut only the walls whose openings moved" would be the obvious
  optimisation. Note the whole-scene call also drags in the CSG rebuild of every curved wall present in the
  test scene (see the faceting cost below). *(OBSERVED — `raw/exp10.json`, `raw/exp11.json`)*
* **Marginal cost grows with opening count**, measured on a single 20 m wall with 1 → 5 windows:

  | openings | `cutwalls()` ms | csg verts | csg tris | subMeshes |
  |---|---|---|---|---|
  | 1 | 4.2 | 384 | 128 | 3 |
  | 2 | 3.9 | 600 | 200 | 4 |
  | 3 | 6.8 | 1008 | 336 | 5 |
  | 4 | 14.7 | 1320 | 440 | 6 |
  | 5 | 10.5 | 1668 | 556 | 7 |

  So the mesh grows roughly linearly (≈320 verts and ≈110 tris per extra window) while the time is noisy but
  rising — consistent with the **chained** O(n) `CSG.FromMesh(runningResult)` re-meshing. The subMesh count is
  `openings + 2`, which is the material-slot bookkeeping made visible. *(OBSERVED — `raw/exp12.json`)*
* **Disposing an opening restores a solid wall.** `HP3D.disposeElement(window)` returned `true`; after re-cutting,
  the wall's cut mesh shrank from 708 to **288 verts / 3 subMeshes** (the window's hole gone, the door's kept),
  the ray at the window centre `(0.8, 1.5)` hit **solid**, and the ray at the door centre `(2.0, 1.0)` stayed
  **open**. The source `wall_merged` remained `isEnabled() = false` throughout. *(OBSERVED — `raw/exp11.json`)*
* **`csg2` was never observed in a live scene.** Round 1 lists it as a wall-like id and `classify` still maps it
  to kind `wall`; live scenes only ever produced `csg`. Whether `csg2` is a second-pass variant or a legacy id is
  unresolved. *(OBSERVED for its absence — `raw/exp10.json`, `raw/exp11.json`)*
* **Auto model pick scales the GLB rather than choosing by size.** `placeOpening` picks a default model —
  door: `≥2.2 m` prefers `/garage/i`, `≥1.3 m` prefers `/double/i`, else first entry; window: `≥1.6 m` prefers
  `/double/i`; paths matching `/gate|glassblock|accordion|fold|side/i` are excluded — then scales it
  non-uniformly (`scaling[longAxis] = width/bbox[longAxis]`, `scaling[y] = height/bbox.y`,
  `scaling[other] = max(thickness,0.05)/bbox[other]`). Live door scalings like `0.7622, 0.8447, 0.7993` are the
  result. *(OBSERVED — `raw/exp2.json`, `raw/exp8.json`; `src/hp-editor.deobf.js` `_0x105200`)*

### 2.9 Method / reproducibility

Everything above reproduces with the files in this folder:

```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --remote-debugging-port=9333 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-chrome-0504c/profile --no-sandbox --disable-gpu-sandbox \
  --disable-dev-shm-usage --disable-crash-reporter --disable-breakpad \
  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --no-first-run --no-default-browser-check --window-size=1600,1000 about:blank &
python3 nav2.py "https://www.3dhouseplanner.com/app.php" 30   # app.php redirects to index.php
python3 cdp.py evalfile setup.js        # click #definefloor -> window.HP3D appears
python3 ev.js exp2.js raw/exp2.json -async
```

Practical lessons that mattered, in case this is repeated:

* **`--no-sandbox` is mandatory here.** Without it the network service crash-loops and the page never becomes
  interactive; with it, `--headless=new` plus SwiftShader gives working WebGL (WebGL 2.0) and Babylon renders.
* **No rendered pixels were needed.** `window.HP3D` hands out the scene graph, the cut mesh, the vertex buffers
  and `scene.pickWithRay`, so every conclusion is a numeric read-back rather than a screenshot. This is a much
  better fit for this app than screenshot diffing.
* **`Runtime.evaluate` hangs for ~40 s after `Runtime.enable`** while the string-array-obfuscated bundles execute;
  use a long socket timeout and retry the probe rather than assuming the page is broken.
* **The app opens up to two page targets on the same URL and only one has `window.HP3D`.** Probe each target
  (`cdp3.py` does) instead of taking the first.
* **`window.HP3D` is only published after the "Project settings" dialog is dismissed** (`#definefloor`). Before
  that the page has `HPBIM`, `BABYLON` and `HP_BOOT` but no scene.
* **Fetching the planner scripts from the shell returns 403**; they must be fetched **in-page** from the iframe
  (`iframe.contentWindow.fetch(url, {credentials:'same-origin'})`), which is how §2.6 was obtained.
  *(OBSERVED — `raw/exp22.json`)*

## 3. Ideas for CasaPlazAI

Ranked by value / effort. Each names the finding it comes from and, where relevant, the CasaPlazAI schema field.

| # | Idea | From | Value | Effort |
|---|---|---|---|---|
| 1 | **Cut with CSG — but cut once per wall, not once per opening.** Build one cutter box per opening (bbox + a few cm) and chain `CSG.subtract` onto a single running mesh per wall, then re-mesh. One new mesh per wall keeps draw calls flat as openings multiply; per-opening subtraction would produce O(n) meshes and O(n²) merges. Measured: linear mesh growth, O(n) chained ops, ~3–15 ms per wall at 1–5 openings on a laptop. | §2.2, §2.8 | High | Medium |
| 2 | **Store `{sill, height}` in the plan schema and derive head — and unlike this app, actually persist `sill`.** 3D House Planner keeps `sill` only in the 3D session metadata (checked live: it is absent from the shared `HPSync` plan state and from the serialised opening record), so a 2D-only reload silently loses it and falls back to a derived value. CasaPlazAI should put `sill` in `opening` in the plan schema alongside `height`, expose "head" as a read-only computed `sill + height`, and clamp `sill ≤ wallHeight − height − 0.05`. That removes a whole class of contradictory states (head < sill) *and* survives reload. | §2.5, `raw/exp38.json` | High | Low |
| 3 | **Adopt the measured clamp constants.** `width = clamp(w, 0.4, wallLength − 0.1)`; `height = min(h, wallHeight − {0.05 door, 0.2 window})`; door `sill ≡ 0`. They are computed in the same routine that builds the hole, so plan and 3D can never disagree — and they are the numbers a validation rule would otherwise have to re-derive. | §2.5 | High | Low |
| 4 | **Make the wall arc record the single source of truth for curved walls.** Store `{a, b, bow s}` (CasaPlazAI `wall.bow` / `wall.curve`) and derive `{R, sweep, center}` with `R = (L²/4 + s²)/(2s)`. Then place openings by normalised arc position `t` and take leaf yaw from the arc tangent. Live verification: mesh yaw = tangent yaw + 90° exactly, positions matched `wallPointAt` to the millimetre. | §2.4, `raw/exp13.json` | High | Medium |
| 5 | **Facet arcs at a fixed angular step, not a fixed segment count.** `segments = clamp(ceil(sweep / 4°), 8, 96)`. Measured: 9 / 19 / 40 / 45 segments for 0.60 / 1.29 / 2.78 / 3.14 rad. A fixed count either under-tessellates tight arcs or explodes vertex counts on shallow ones. | §2.4, `raw/exp8.json` | Medium | Low |
| 6 | **Grow the cutter in the thin axis (×~6) so curved walls cut cleanly.** After building the opening bounding box, multiply the *shorter* horizontal dimension so the cutter always passes fully through a faceted or curved wall. This avoids per-segment intersection maths and is what makes the chained CSG work on arcs. | §2.2, §2.4 | Medium | Low |
| 7 | **Preserve materials across the CSG rebuild.** Keep the original wall faces as the last two subMeshes, give each cut face its own slot (`materialIndex = i + 2`), and parent four child planes with cloned materials. Without this, every opening turns the wall grey — the single most visible CSG regression. | §2.7, `raw/exp5.json` | Medium | Medium |
| 8 | **Disable the source wall mesh instead of deleting it.** This app leaves `wall_merged` in the scene with `isEnabled(false)`. It makes undo/redo and "delete opening restores wall" trivial — verified live: disposing the window restored solid wall at the window while the door hole stayed open (708 → 288 verts). Pair it with explicit `cutOfWall` / `wallOfCut` back-pointers. | §2.2, §2.8, `raw/exp11.json` | Medium | Low |
| 9 | **Expose an idempotent `cutWalls()` rebuild plus a `deferCut` flag on placement — and make the rebuild incremental.** Batch many placements then cut once; the app's own calls read `if (!opts.deferCut) cutwalls()`. But the live timing shows a whole-scene re-cut is the hot path (241.7 ms for 5 cut walls vs ~3 ms for one), so CasaPlazAI should dirty-flag only the walls whose openings or geometry changed. | §2.2, §2.8 | Medium | Low |
| 10 | **Keep the hole equal to the placed model's bounding box, and expose width/height overrides.** The bbox drives the cut, so schedule `OpeningArea` is trivially correct; but because CasaPlazAI's palette reuses a few GLBs, let the user override `width`/`height` (the app already does this through `placeOpening`, and scales the GLB non-uniformly to match). | §2.2, §2.3, §2.8 | Medium | Low |
| 11 | **Have the inspector show the *actual* sill read from geometry as the placeholder, and the stored value as the field.** The app computes the default from `mesh.minimumWorld.y − levelBaseY`. That makes the number the user sees always match what is rendered, even after a wall-height change. | §2.5 | Medium | Low |
| 12 | **Reconcile the 2D and 3D height caps.** The 2D planner caps door height at 2.5 m and window height at 2.0 m while the 3D clamp is `wallHeight − {0.05, 0.2}`. For CasaPlazAI, put one `openingLimits` table in the shared plan module and have both the 2D tool and the 3D placement read it, so a tall opening cannot be drawable in 2D but clampable in 3D. | §2.6, §2.5 | Medium | Low |
| 13 | **Refuse an opening that would overrun its wall instead of silently sliding it.** The 2D planner's `clampOpeningU` returns `null` when `halfWidth / wallLength > 0.5`; the 3D path instead clamps width to `wallLength − 0.1`. Pick the 2D refusal for interactive placement (with a live feedback hint) and keep the 3D clamp only for programmatic/AI input. | §2.6, §2.5 | Low | Low |
| 14 | **Raise the round-1 `openingOverlap` check at edit time for overlapping holes.** Two overlapping doors on one wall are subtracted independently here and produce a valid but odd merged cut (501-vertex mesh, outer bound 39.925→44.075). Geometrically fine, semantically wrong. | §2.2, `raw/exp9.json` | Low | Low |
| 15 | **Adopt a single scalar `bow` for curved walls in the plan schema.** This app stores `bulge` (px) in 2D and `curve.s` (m) in 3D and derives everything else; live-verified `curve.s = bulge / meter` reproduces the same arc. Carry `wall.bow` plus `{a, b}`, derive `{R, sweep, center}` on demand, and never serialise the derived values — it makes the plan file human-editable and keeps 2D/3D in lock-step. | §2.6, `raw/exp37.json` | Medium | Low |
| 16 | **Keep the 2D and 3D models as two views of one plan object, not two schemas.** The app's `HPSync.getState()` serves both; the opening record is pixel-denominated (`size`, `height3d` at `meter = 60`) and gets converted at the 3D boundary. CasaPlazAI already has a TS schema — picking one canonical unit (metres) and converting only at the renderer avoids the px/m² class of bug entirely. | §2.6, `raw/exp33.json`, `raw/exp38.json` | Medium | Medium |
| 17 | **Refuse a 2D paste onto a curved wall, but say why.** `pasteOpening` returns `false` on any `wallArc` wall; the app's own message for the analogous separation-line case is *"A separation line has no wall to hold a door or window."* Whatever CasaPlazAI does, the failure must be surfaced as a reason rather than a no-op. | §2.6, `raw/exp26.json` | Low | Low |

## 4. Unknowns

- **The 2D planner was inspected from the outside only.** Its `contentWindow` API, height constants, arc helpers,
  autosaved plan state (`exp29`/`exp30`), the `bulge` ↔ `curve.s` mapping and the `HPSync.projectNow()` handshake
  were all read live — but I did not drive the 2D placement *gesture* (no wall was drawn with the mouse in the 2D
  tool), so the click sequence and the per-catalogue default width remain unverified. The 2D record's origin is
  however now fully known: `objData[]` in `localStorage["extension-floorplanner-history"]`.
- **`DOOR_HEIGHT_LIMITS` / `WINDOW_HEIGHT_LIMITS` were read as pixel constants** (`min: 1.5*meter` etc., `meter = 60`)
  and converted to metres. The px-per-metre convention is now confirmed independently by the shared state
  (`size:72, height3d:72` for a 1.2 m × 1.2 m window → `meter = 60`), so the conversion is solid; the limits
  themselves were not exercised by an interaction.
- **`sill` persistence was tested only through the scripted `placeOpening` + `projectNow` path.** I verified it is
  absent from the shared state and does not survive a project pass, but I did not type a sill into the BIM panel
  through the DOM and then reload the page, so the exact loss mode the user sees is inferred from the schema.
- **`csg2` was never observed in a live scene**, only in the id lists and in `classify`. Its role is unresolved.
- **The ×6 cutter growth was read from code and shown to work at one bow height.** I did not sweep bow heights to
  find where a chord-shaped cutter under- or over-cuts a tight arc.
- **No absolute performance benchmark.** `cutwalls()` timings are from one headless session on this machine and
  the wall shapes named inline; they are indicative (single wall ~3 ms, five cut walls ~240 ms) rather than a
  benchmark, and were not profiled. The 240 ms figure includes every curved wall present in the accumulating test
  scene, so the per-wall share is unattributed.
- **Only the scripted API was exercised.** `HP3D.buildWall` / `placeOpening` are the app's own wrappers; the UI
  path may pass extra options (material, aspect, `hinge: "reverse"`, AI-import provenance) that this round did
  not exercise. Round 1's swing/mirror findings were not re-verified live.
- **Whether skirting genuinely stops at the new holes** was not measured; round 1 observed the i18n hint and the
  code path, and `listElements` does skip `wall_cut`, but no live skirting geometry was generated.
- **Doors were not tested with a non-zero sill** (the code forces 0); nor was an opening placed on a wall whose
  `height` differs from the level default, which is the case where the 2D and 3D caps in idea 12 would diverge.
- **No vendor documentation exists** for 3D House Planner. Every claim above is OBSERVED (with the named evidence
  file) or INFERRED. Licence: none observed; the shipped JavaScript is obfuscated and proprietary, and nothing was
  copied — behaviour is described in my own words.
