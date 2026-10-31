# 3D House Planner — wall geometry: alignment, thickness/height, arc walls, mitring, T-junctions

Round-2 deep-dive for **CasaPlazAI** (single-page 2D/3D floorplanner, TypeScript/Three.js, no backend).
App: <https://www.3dhouseplanner.com/> — 3D editor `app.php` (Babylon.js 6.38 / WebGL2) plus a separate
**2D planner** at `https://www.3dhouseplanner.com/2D-Planner/index.php`.

**My question:** *wall geometry: centre/inside/outside alignment, thickness/height, arc walls, corner joins and
mitring, T-junction handling in the generated 3D mesh.*

Round-1 report reused read-only: `rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/report.md`.
This round does **not** redo round 1. It closes round-1 **Unknowns #2 (grid step)**, **#5 (shared-wall
outcome)** and **#9 (arc walls)**, and adds the wall-geometry layer round 1 named but did not open.
Round 1's Unknown #1 ("I never completed an end-to-end draw") is **resolved**: this round did complete
rect and single-wall draws headlessly (software GL) and read the resulting meshes.

**Tags used below**
- **OBSERVED** — I executed the live app and read the values, or decoded the shipped bytes myself. Evidence file named.
- **DOCUMENTED** — the vendor's own served text (UI strings, tooltips, i18n dictionary) or a vendor URL.
- **INFERRED** — my reading of shipped code structure, not confirmed by executing the feature.

All evidence is in `evidence/`; per-file inventory in `sources.json`. Neither round-1's folder nor anything
outside this job folder was modified.

---

## 1. Summary (5 bullets)

1. **A wall is one scaled box.** `HP3D.buildWall({x1,z1,x2,z2,thickness,height,baseY,curve,level,texture})`
   places a unit box at the mid-point at `baseY + height/2`, scales it to `(length + thickness − 0.05,
   height, thickness)` and rotates `y = atan2(dx,dz) − π/2`; walls shorter than 1 cm are rejected
   (`return null`). The extra `thickness` in the length and the constant **`−0.05`** are a blanket corner
   overlap computed before any joint is known; the box's `scaling.x` is *never* subsequently changed — a later
   mitre pass instead rewrites the **end-ring vertex positions** (for a 0.3 m wall the end ring moves from
   normalized `x = 0.500` on both corners to roughly `0.435`/`0.506`). `wallEndpoints` therefore recovers the
   true centre-line length as `|scaling.x| − |scaling.z| + 0.05`. (**OBSERVED** `evidence/geo1.json`,
   `evidence/geo2.json`, `evidence/geo7.json`; decoded source `work/hp-editor.read.js` lines 7689–7714,
   6171–6192, 6450–6459.)
2. **`length` is always the wall's *centre-line* length**, and the alignment switch works by *offsetting the
   whole wall*, not by re-cutting it. With an 8 m × 6 m rectangle drawn at thickness 0.4 m: Centre gives
   centre-line spans 8 × 6 at x = ±4, Inside gives 7.6 × 5.6 at ±3.8, Outside gives 8.4 × 6.4 at ±4.2 — each
   shift is exactly `thickness/2`, and the wall's **box scaling is unchanged** (only position moves).
   (**OBSERVED** `evidence/geo5.json`.)
3. **Corner mitring is a per-wall-*end* 2-D parameter pair, applied by rewriting the end ring of vertices.**
   `miterWalls()` groups wall ends that are within `max(0.06, 0.5·min(t₁,t₂))` of each other, snaps the group to
   its centroid, sorts the incident walls by departure angle, then for each end computes `{plus, minus}` = the
   signed position where *this* wall's face line crosses the *adjacent* wall's face line; a pass mapped by
   local `x` sign resizes the end ring, `x = (plus+minus)/2 + (plus−minus)·clamp(z, −0.5, 0.5)`. Verified vertex
   for a 0.3 m L-corner: both walls' end rings become the identical 6 points `(±0.15, 0)` and `(4, ±0.15)` —
   i.e. a **shared mitre line** with no gap and no third cap mesh. (**OBSERVED** `evidence/geo2.json`,
   `evidence/geo1.json`; decoded source lines 5842–6319.)
4. **Arc walls are chord + signed bulge, `metadata.hp.curve = { s }`, in metres**, rounded to 1 mm
   (0.004 → straight; abs ≥ 0.005 required). On a 4 m chord, `s = 1.0` gives radius 2.5 m, mid-point (2, 1),
   sweep 106.3°, arc length 4.64; `s = −1.5` gives the mirrored arc (mid (2, −1.5), R 2.083); caller values
   are **clamped to ±L/2** and the wall must satisfy `L > t + 0.1` or the curve is silently dropped. Curves are
   meshed by a dedicated generator (max 96, min 8 segments), and a **curved wall is excluded from mitring
   entirely** — it gets a *clamped extension* of its own arc instead. (**OBSERVED** `evidence/geo1.json`,
   `evidence/geo7.json`; decoded source lines 5857–5980, 6049, 6149–6169.)
5. **T-junctions are left *full*, not trimmed or unioned** — the stem's end ring is not mitred at all. In the
   interactive draw, a 0.2 m-thick stem running up to a 0.2 m-thick host has its **centre-line** end pulled to
   the host's *near face* (z = 0.101 = host axis 0.001 + t/2); its `_hpMiter` stays neutral (`±0.5`), as does
   the host's, and **no cap is produced**. The stem's *mesh*, however, is still built 5 cm too long overall
   (`scaling.x = 2.9 + 0.2 − 0.05 = 3.05`), so it physically reaches z = 0.026 — **0.075 m = t/2 − 0.025 into
   the host's body**, a deliberate anti-gap overlap. A `wallJointCap` is created **only when 3 or more
   wall-ends meet at one point**, and such an experiment did produce a single 4-vertex fan listed against those
   3 walls. (**OBSERVED** `evidence/geo6.json`, `evidence/geo2.json`, `evidence/geo1.json`; decoded source
   lines 6188–6191, 6222–6289.)

---

## 2. Findings

### 2.1 The wall solid — `buildWall` (thickness, height, length, rotation, yaw)

**OBSERVED** live via `window.HP3D.buildWall(...)` (the editor exposes it on the `window.HP3D` object it
assigns at `work/hp-editor.read.js:7651`), then read back with `HP3D.wallEndpoints(mesh)`.
Files: `evidence/geo1.json`, `evidence/geo2.json`, `evidence/geo7.json`.

The decoded implementation (`work/hp-editor.read.js` lines 7689–7714) is:

- `thickness` defaults to `HP3D.defaultWallThickness()` (live: **0.2 m**), `height` to
  `HP3D.defaultWallHeight()` (live: **2.65 m**, = the project floor-to-floor height).
- `dx = x2−x1`, `dz = z2−z1`, `length = hypot(dx,dz)`; **if `length <= 0.01` → `return null`** (no wall).
- position = `((x1+x2)/2, baseY + height/2, (z1+z2)/2)`.
- **scaling = `(length + thickness − 0.05, height, thickness)`**.
- `rotation.y = atan2(dx, dz) − π/2`.
- every child mesh gets `(uvScaleX = thickness, uvScaleY = floorHeight)`; `metadata.hp = { kind:'wall', … }`.
- if a curve survives validation, `metadata.hp.curve = { s: round(s·10000)/10000 }` (1 mm precision).

Two independent derivations of `length` exist and **they use the same formula**, which is why the numbers
round-trip exactly:
- `HP3D.wallEndpoints(mesh)` (line 6450) returns `length = max(0.01, |scaling.x| − |scaling.z| + 0.05)`.
- the mitre pass `_0x5a3d7f` (line 6092) recomputes `max(0.01, |scaling.x| − |scaling.z| + 0.05)`.

**Measured examples** (all `OBSERVED`, thickness 0.2, height 2.65):

| input | `scaling` | `wallEndpoints` |
|---|---|---|
| `(0,0)→(4,0)` | `(4.15, 2.65, 0.2)` | a `(0, 0.000001)`, b `(4, 0.000001)`, len 4 |
| `(0,0)→(6,0)` | `(6.15, 2.65, 0.2)` | len 6 |
| `(0,0)→(4,0)` with `curve: 1.0` | `(4.15, 2.65, 0.3)`* | a `(0,0)` b `(4,0)`, plus a full `curve` record |

*A curved wall keeps `scaling.z` as given; the curved mesh is **not** the scaled box — `getTotalVertices()`
goes 48 → 464 (s = 1.0), 624 (s = −1.5), 752 (s = 2.0, the clamped value). See §2.4.

**OBSERVED** live `wallEndpoints` record shape (the exact keys the app itself uses):

```
{ a:{x,z}, b:{x,z}, length, thickness, height, baseY, yaw,
  curve: null | { s, mid:{x,z}, center:{x,z}, radius, sweep, dir, startAngle, endAngle, arcLength } }
```

Distances: `a`/`b` are the **centre-line** endpoints. `yaw = atan2(dx,dz) − π/2` (same formula as the mesh
rotation), and `baseY = position.y − |scaling.y|/2`. `b − a` is along the local **+X** axis of the box, which
is the wall's length axis. (**OBSERVED**, `work/hp-editor.read.js:6451–6459`.)

**Centre vs inside vs outside is implemented as a position offset, not a geometry change.** In the wall
builder, the drawn polyline is first turned into a point list, then every point is pushed perpendicular by a
single signed amount (`work/hp-editor.read.js:2286–2291`, `_0x11af1a`):

```
offset = 0                                                   if align === 'center' or < 2 points
signed area A of the polygon  (shoelace)
sign   = A < -1e-9 ? -1 : 1
offset = (align === 'inside' ? +1 : -1) * sign * thickness/2
point' = (x − dz·offset,  z + dx·offset)      // 90° left/right of the segment direction
```

So the *whole* polyline (and its corners) is shifted sideways by `t/2`; the walls themselves are then built
between shifted points as usual. **OBSERVED** consequence with a 4 m × 3 m half-extent rectangle
(`evidence/geo5.json`):

| align | thickness | `wallEndpoints` spans |
|---|---|---|
| centre | 0.2 | x `[−4, 4]`, z `[−3, 3]` *(derived: same as the drawn rectangle; the 0.2 centre draw was swallowed by the tool's warm-up — see §2.8)* |
| inside | 0.2 | x `[−3.9, 3.9]`, z `[−2.899, 2.901]` |
| outside | 0.2 | x `[−4.1, 4.1]`, z `[−3.099, 3.101]` |
| centre | 0.4 | x `[−4, 4]`, z `[−2.999, 3.001]` |
| inside | 0.4 | x `[−3.8, 3.8]`, z `[−2.799, 2.801]` |
| outside | 0.4 | x `[−4.2, 4.2]`, z `[−3.199, 3.201]` |

Every shift is exactly `t/2` inward/outward (all rows observed except the centre-0.2 one, which is the
identity case). Wall `scaling` is identical across all six cases for a given
thickness (e.g. `(8.15, 2.65, 0.4)`), confirming it is a translation only. **Vendor wording matches**
(**DOCUMENTED**, `rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/evidence/app-ui.html`): "Walls inside the drawn outline (the line is their outer face)" /
"Walls outside the drawn outline (the line is their inner face)" / "The drawn line is the center line of the
wall". **INFERRED:** for two rooms sharing an edge, `outside` puts both walls' *inner* faces on the drawn line
and they occupy disjoint intervals `[L−t/2, L+t/2]` vs `[L−t/2, L+t/2]` — i.e. two coincident walls stacked on
the same strip; a single shared wall can be produced with `inside` on the first room and `outside` on the
second (both then place the wall's centre on the *inside* of each room). I did not execute that two-room case.

**Wall height vs storey height.** Live: `thickness` slider `0.1–0.4`, step 0.01, default 0.2; `height` slider
`0.05–2.65`, step 0.05, default 2.65; project floor-to-floor height 2–5 m, default 2.65; plan size 50–1000 m,
default 100. Changing floor-to-floor height does **not** rewrite existing walls (each wall stores its own
`scaling.y`); new walls use the current value. `metadata.hp.level` is optional and, for walls, *derived* from
position (`levelOf` line 6446), not stored. (**OBSERVED** markup + live sliders `rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/evidence/app-ui.html`,
`evidence/geo5.json`; **OBSERVED** code `work/hp-editor.read.js:5837`.)

### 2.2 Corner joins — the `−0.05` allowance and real mitring

**Step 0 (build time).** `buildWall` always adds `thickness − 0.05` to the wall length (§2.1). The 5 cm is a
*constant for every wall regardless of thickness* — so it is an anti-gap overlap, not a geometric mitre:
**OBSERVED** a straight unjoined wall reads back with `len = 4.0` (not 4.15) at `t = 0.2`
(`evidence/geo7.json`). Where no mitre is ever computed the extra length simply interpenetrates the neighbour
(§2.3); the `miterWalls()` pass below is what replaces it with a true end-ring cut.

**Step 1 (joint time) — `HP3D.miterWalls()`.** Decoded source `work/hp-editor.read.js:6205–6319`
(`_0x365199`). Behaviour, in order:

1. Guarded by a signature (`busy`/`sig`) so it only re-runs when wall transforms changed; signature can be
   forced with `miterWalls()` (the public wrapper passes `true`).
2. Collect every wall's both ends as records `{f: wallRecord, which:'a'|'b', p: endpoint}`.
3. **Group ends by proximity**: two ends group if they belong to *different* walls and
   `hypot(Δx, Δz) <= max(0.06, 0.5·min(t₁, t₂))` — i.e. the joint tolerance is **half the thinner wall**,
   floored at 6 cm. Vertically, walls must overlap: `min(y1a,y1b) − max(y0a,y0b) >= 0.05`.
4. Each group's point is set to the **centroid** of its ends (all walls are snapped onto one point).
5. **Angle-sort** the incident ends by their outward direction (angle uses the *other* end as the reference
   direction, negatives swapped where needed), then link them as a circular `next`/`prev` chain.
6. **Groups of 3 or more** are recorded and later get a **cap** (lines 6266–6289): for each *adjacent pair* in
   the angle-sorted ring the cap takes the intersection of their two inner-face offset lines (`_0x357222`),
   falling back to the raw offset point when the intersection is missing or farther than `3·max(t₁,t₂)` from
   the joint centre. A `wallJointCap` `BABYLON.Mesh` is then built as a triangle fan from the group centroid
   at height `min(y1) + 0.0004`, with a black `StandardMaterial('wallJointCapMat')`
   (`diffuseColor=specularColor=black`, `backFaceCulling = false`), `isPickable = false`,
   `doNotSerialize = true`, and `_hpWalls` listing the walls it covers.
7. **Per wall** `{plus, minus}` are then computed for each end (`_0x49e911`, lines 6123–6148); with no
   neighbour (`b` null) it returns the neutral `{plus: t/2, minus: t/2}`:
   - project the end onto its own axis `d`;
   - take the candidate face-line intersection `X = intersect(P_A, d_this, P_B, e_next)` where `P_A` is that
     wall's own *rotated* half-thickness offset point;
   - `int(X) = clamp((X−c)·d / scaling.x, −3t, +0.45·len)` — i.e. the displacement is **capped at 3× thickness
     and 45 % of the wall length**;
   - pick `plus = int(next)` or `int(prev)` depending on which side the end faces;
   - if the fallback `X` is not a real intersection, use `P_A` directly;
   - **clamp each to ≥ 0.02 (or ≤ −0.02) in the sign direction** so an end never inverts.
   `ends[i].next/prev` are attached to every wall end (OBSERVED `_hpMiter` on the mesh).
8. **Apply** (`_0x5a2756`, lines 6171–6192): for every **vertex** of the wall mesh convert it into wall-local
   space, take `zLocal = clamp(z, −0.5, 0.5)`, and set
   **`x = (plus + minus)/2 + (plus − minus)·zLocal`** — a linear ramp across the wall thickness, so the *face*
   moves as a rigid offset while the *end ring* is skewed to the mitre line. Diffing the new positions also
   tells the caller whether anything moved, so it can skip re-meshing. Child meshes (openings) are remapped
   with a tiny `0.0001` epsilon against the main mesh to avoid z-fighting.

**OBSERVED verification.** Build two 0.3 m walls `(0,0)→(4,0)` and `(4,0)→(4,3)`, call `miterWalls()`
(`evidence/geo2.json` §A):

- wall 1 `_hpMiter` = `a{−0.5,−0.5}`, `b{+0.4353, −0.5059}`; wall 2 = `a{−0.4154,−0.5077}`, `b{+0.5,+0.5}`.
- **Both** walls' end rings (raw `+X` face of wall 1, raw `−X` face of wall 2) are the *same six world points*:
  `(3.85, 0, 0.15)`, `(3.85, 2.65, 0.15)`, `(4, 2.65, 0)`, `(4, 0, 0)`, `(4.15, 0, −0.15)`,
  `(4.15, 2.65, −0.15)`.

  That is exactly `(4,0) ± 0.15·(edge direction)`: `(4,0)+(0.15,0,0.15)` and `(4,0)+(0.15,0,−0.15)`. The two
  walls share a mitre line, there is no wedge-shaped gap, and **no cap mesh is needed**.
- The same experiment at 45° (`evidence/geo2.json` §B) gives the shorter joint `±0.0621` in x — correct for a
  45° mitre of a 0.3 m wall (`0.15/√2 = 0.1060` along each face captured as `(4,0) ± (0.0621, 0.0621)`).
- **`_hpMiter` is only written when mitring runs** — a freshly built wall has `_hpMiter === null`
  (`evidence/geo1.json` §C `"miter": null`).

**`cutwalls()` / `cutOfWall` / `wallOfCut`.** `HP3D.cutwalls()` (line 8496) re-runs the sibling pass
`_0x2d4b33` (line 5842) that first forces world matrices on `wall` and `door_window` meshes and then triggers
`_0x294138` (line 6325) — which re-applies mitres and re-derives vertex normals for **curved** walls. A
`csg` mesh maps to its `wall` mesh and back by **exact position equality**
(`cutOfWall`, `wallOfCut`, lines 6475–6482) — that is the door/window boolean-cut path round 1 described
(`wall_merged` / `csg` / `csg2`), and it is *identification by identical transform*, not a stored host id.

**Miter failure is non-fatal.** The whole pass is wrapped in `try { … } catch { console.warn('Wall joints
failed', e) }`, and `_hpMiter` (or `_hpCurveExt`) is left `null` on failure. (**OBSERVED** code.)

### 2.3 T-junctions in the generated mesh

**OBSERVED** end-to-end: build a 6 m host along `z=0` (t = 0.2) and then draw a chain from `(3,0,3)` to a
point *near but not on* the host — the magnet snapped the click onto the host wall's axis
(`evidence/geo6.json`, `snapPreview` shows `state: "segment"` before the click), and the finished scene was:

```
host: pos (3, 1.325, 0.001)  scaling (6.15, 2.65, 0.2)
stem: pos (3, 1.325, 1.551)  scaling (3.05, 2.65, 0.2)
```

Read back through `wallEndpoints`, the stem reads `a = (3, 3.001) → b = (3, 0.101)`: its **centre-line** end
stops at **z = 0.101 = host axis (0.001) + t/2 (0.1)**, i.e. exactly on the host's near face. So the wall
builder does *not* run the stem to the host's centre-line even though the magnet snaps the cursor onto the
axis (`work/hp-editor.read.js:2216–2224`: the `'axis'` snap writes the axis projection and records the host in
`p.host = {mesh, ax, az, ux, uz, t}`). The attached end is then pulled onto the host *face* by
`_0x1b575e` (`work/hp-editor.read.js:2302–2315`, called at 2355 for the first/last chain point): it offsets
that point along the *wall's own* direction until its normal-distance from the host axis equals
`sign(side)·t_host/2`, bailing out if the needed shift exceeds 0.9× the wall length or the wall is nearly
parallel to the host (`|dot| < 0.2`). Neither wall gets a real mitre — both `_hpMiter` values stay neutral
(`a{−0.5,−0.5}`, `b{+0.5,+0.5}`; `evidence/geo1.json` §D). The stem *mesh* is still the standard box,
`scaling.x = 2.9 + 0.2 − 0.05 = 3.05`, so it spans **z ∈ [0.026, 3.076]** — reaching
**0.075 m = t/2 − 0.025 *past* the host face and into the host's body**. That overlap is the whole T-junction
treatment: no boolean, no trim, no cap, just an interpenetrating box.
**No `wallJointCap` was created** for a T (a cap requires 3+ incident ends).

**OBSERVED** 3-way joint does get a cap (`evidence/geo2.json` §C): walls east `(0,0)→(4,0)`, north
`(4,0)→(4,3)`, and a diagonal `(4,0)→(6,−2)` produced exactly **one** `wallJointCap` with 4 vertices
`(4,0), (3.9379,−0.15), (4.15, 0.0621), (3.85, 0.15)` and `_hpWalls.length === 3`. So:
- **2 incident ends → mitre only, no cap**;
- **3+ incident ends → mitre + a cap fan spanning the incident walls' corner points.**

**Duplicate / shared walls are *not* merged in the mesh.** **OBSERVED** (`evidence/geo2.json` §D): building the
same wall twice leaves **2** `wall` meshes at the identical position with identical scaling, **0** caps, and
`HPBIM.check()` returns `{}` (an empty object, not a list). Round 1's `bim.issue.dupWall` string is therefore
**only** produced by the BIM model-check UI, not by the geometry pipeline — so the answer to round-1 Unknown #5
is: **two rooms sharing an edge get two coincident wall meshes unless the user uses the alignment switch to
place a single wall.** (**OBSERVED** geometry; **DOCUMENTED** `bim.issue.dupWall` in round-1's
`evidence/i18n-app.json`.)

### 2.4 Arc walls — bulge in metres, chord-anchored, excluded from mitring

**INPUT: `curve` = signed bulge `s` in metres** — the perpendicular distance from the **chord midpoint** to the
arc's mid-point, positive toward the wall's local `−Z` (the "left"). Validation (line 5857–5866):

```
valid(s) = isFinite(s) && |s| >= 0.005   (i.e. 0.5 cm)
then      s = sign(s) · min(|s|, L/2)               // caller value is clamped, not rejected
and       valid again only if  L > t + 0.1          // chord must exceed thickness + 10 cm
```

**OBSERVED** live: `curve: 0.004` → wall stays straight (48 verts, `metadata.hp.curve` deleted);
`curve: 10` on a 4 m chord → stored `s = 2` (clamped to L/2); `curve: 1.0` → stored `s = 1`;
`curve: −1.5` → stored `s = −1.5`. Rounding is `round(10000·s)/10000` (1 mm). (**OBSERVED** `evidence/geo1.json`.)

**Derived arc (`_0x62f832`, line 5867) and reported record (`_0x4dab6a`, line 6056):**

```
R     = (L²/4 + s²) / (2|s|)                    radius
phi   = atan2(L/2, R − s)                       half sweep
sg    = sign(s)
cz    = sg·(s − R)                              centre offset from chord mid
sweep = 2·phi                                   (always positive)
len   = 2·phi·R                                 arc length
```

**OBSERVED** numeric check for `L = 4, s = 1.0` (`evidence/geo1.json`, `evidence/geo7.json`):

| quantity | value |
|---|---|
| radius | 2.5 |
| mid-point | (2, 1) — exactly chord-mid + s |
| centre | (2, −1.5) |
| sweep | 1.85459 rad = **106.26°** |
| dir | −1 |
| arcLength | **4.6365** |
| `wallPointAt(w, 0.5)` | (2, 1) |
| `wallPointAt(w, 0)` | (0,0), dir (0.6, 0.8) |
| `wallPointAt(w, 1)` | (4,0), dir (0.6, −0.8) |

`wallPointAt(mesh, u)` (line 6068) maps `u ∈ [0,1]` along the arc and returns the point **plus a unit tangent**
(`dirX/dirZ`) — i.e. the app's own "position + frame at parameter t on a wall", used for placing
openings/objects on curved walls. A straight wall returns the linear interpolation.

**Chord ends, not arc ends.** `wallEndpoints` keeps `a`/`b` at the original two points
(`(0,0)` and `(4,0)`), regardless of the bulge; only `curve` describes the arc. So walls still *close rooms*
on their chords, and a room with a bowed wall has a straight-chord room polygon.

**The curved mesh is generated, not scaled.** `_0x26a165` (line 5912) builds it in pieces:
- `_0xbd5953` (line 5899) samples a ring of `n+1` angles from `−phi` to `+phi`, placing each point at
  `x = radius·sin(α)`, `z = cz + sg·radius·cos(α)`, then **offsets the two chord ends** along the ring's
  tangent by the `plus`/`minus` miter parameters — so the arc miter is baked in at sampling time.
- `_0x26a165` runs that sampling twice: on rings `R + sg·t/2` and `R − sg·t/2` (outer and inner face), and
  emits one `SubMesh` descriptor (`{v0, vc, i0, ic}`) **per ring** — the two `subMeshes` seen live.
- `slaves` = four extra flat patches: `_0x5d5fc5(0, −1)` and `_0x5d5fc5(n, +1)` are the two **curved end
  caps** (at parameter 0 and n), while `_0x47fb93(h/2 + 0.0003, +1)` and `_0x47fb93(−h/2 − 0.0003, −1)` are
  the **top and bottom horizontal bands** (`h/2` with a 0.3 mm offset). Those four are the wall's remaining
  faces, and they are the child meshes the later mitre ramp moves.
- **Segment count** `n = max(8, min(96, ceil(sweep/(π/45))))` (line 5915) — **one segment per ~4° of sweep,
  clamped to 8…96**. This `n` is the value passed as the sample count to `_0xbd5953` (line 5899, which loops
  `0…n` inclusive), so it *is* the arc's tessellation density. **OBSERVED** mesh vertex totals do not scale monotonically with `sweep`
  in my three samples — `s = 1.0` (sweep 1.855) → 464 vertices; `s = −1.5` (sweep 1.018) → 624;
  `s = 2.0` (sweep π) → 752; every curve build reports exactly **2 sub-meshes** — so the final vertex count is
  also driven by the slave patches and the subsequent mitre/cut pass, and I did not fully account for it
  (see Unknown 10).

**End extension instead of mitring (`_0x28652e`, lines 6149–6169).** The miter pass **skips arc walls**
(`if (wall.arc) { wall._hpCurveExt = {a: …, b: …}; wall._hpMiter = null; return; }` — line 6293). Instead it
computes a *clamped tangent extension* at each end: project the neighbouring wall's offset point onto the arc
end's **tangent** direction, clamp to `[−3t, +0.45·arcLength]`, and require the extension point to be within
`3·max(t₁,t₂)` of the joint centre, else fall back to the raw offset point. The resulting `{plus,minus}` pair
is then consumed by the *same* vertex ramp as a straight wall, so a curved wall's end is **extended along its
own tangent** rather than mitred against a straight neighbour. **OBSERVED** (`evidence/geo2.json` §E): an arc
joined to a straight wall gave the arc `_hpCurveExt = {a:{0,0}, b:{−0.45,+0.45}}` (a 0.45 m tangential
extension, the 0.45·arcLength clamp for a 4.64 m arc) and the straight wall a normal `_hpMiter`
`a{−0.323,−0.600}`. `_hpCurveExt` therefore caches the *arc's* miter parameters under a different name;
`setWallCurve` also has a fallback (`_0x4b15c2`, line 6005) that rebuilds the box mesh if a wall is
straightened in place, guarded by a signature string built from `s, sx, h, t, plus/minus` of both ends.

**Changing the bulge after the fact**: `HP3D.setWallCurve(mesh, s, {silent})` (line 8473) validates through the
same clamp, writes `metadata.hp.curve`, then calls `miterWalls(true)` and `cutwalls()` if the wall has a cut.
**OBSERVED** live on a straight 4 m wall with `s = 1.2`: 48 → 528 vertices, `_hpCurved = true`, and
`wallEndpoints().curve` reported radius 2.267, mid (2, 1.201), sweep 123.8°, arcLength 4.900.

### 2.5 The alignment switch, exactly

Already quantified in §2.1. Two implementation notes worth keeping:

- The offset uses the **polygon's own winding sign** so that "inside" always means the interior of the shape
  being drawn, whatever direction the user traced it (`work/hp-editor.read.js:2329–2330`). A degenerate
  polygon falls back to sign `+1`.
- The shift is applied to **all** points **before** walls are created, including the closing point; the
  closing point is stored once and the four rect walls are emitted as
  `[p0→p1, p1→p2, p2→p3, p3→p0]` (`_0x272866`, lines 2364–2372) — the **last** wall wraps back to the
  (already shifted) first point.
- For a non-closed chain only the first and last points get the "host" projection (`_0x1b575e`,
  lines 2302–2315), used when the chain started or ended *on an existing wall*.

### 2.6 The 2D planner's own wall model (the `2D-Planner/index.php` iframe)

I fetched and decoded the 2D planner's own bundles (previously 403; needs a `visited=true` cookie context —
`scripts/p2d.mjs`). Files under `evidence/2d/`. This module set is **separate from the 3D editor** and encodes
a richer 2-D wall vocabulary (**DOCUMENTED** = served i18n strings; **OBSERVED** = decoded identifiers):

- **Its own tooltip set for wall geometry** (**DOCUMENTED**; quoted from the served page
  `evidence/2dplanner-index.html`, whose inline i18n dictionary also backs the curated extract
  `evidence/2dplanner-i18n-wall.json`):
  `wall.thickness` "Thickness", `wall.curve` "Curve", `wall.curveHint` "How far the middle of the wall is
  from a straight line. You can also drag the handle in the middle of the wall.", `wall.curveStraight`
  "Straight wall", `wall.straighten` "Straighten", `wall.cut` "Cut the wall:", `wall.cutBtn` "Cut",
  `wall.cutHint` "A cut will be made at each wall encountered.", `wall.separation` "Separation wall:",
  `wall.separationHint` "Transform the wall into simple separation line.",
  `wall.toWallHint` "The thickness will be identical to the last known.",
  `tool.joint.tip` "Add a joint to a wall to bend or move a part of it",
  `msg.addJointNote` "Note: this may remove windows or doors already on that wall.",
  `hint.edit_wall_mode` "Wall selected: change its thickness or curve, or delete it (Del) · drag it to move ·
  drag its middle handle to bend it".
- **Two wall kinds**, both read from the decoded editor (`OBSERVED` `work/fpe.read.js`):
  `makeWall(path)` renders a wall as an SVG `<path>` with `fill: colorWall`, `stroke-width: 1` and
  `stroke-linejoin: 'miter'`, while `invisibleWall()` converts the selected wall to a **separation line** by
  setting `type = 'separate'`, stashing the real thickness in `backUp` and forcing `thick = 0.07`;
  `visibleWall()` restores it (`type = 'normal'`, `thick = backUp`). Rooms treat a separation line as a
  boundary but it is not a thick wall — a concept worth borrowing for open-plan/zone dividers.
  (**DOCUMENTED** the matching UI strings `wall.toSeparationBtn` "Make separation",
  `wall.separationHint` "Transform the wall into simple separation line.",
  `wall.toWallHint` "The thickness will be identical to the last known.".)
- **Arc math is a first-class, independent implementation** (`OBSERVED` `work/qSVG.read.js` / `work/fpe.read.js`;
  identifiers quoted below are literal property names in the shipped bundle): `qSVG.ARC_MIN_BULGE: 0.5` is the
  minimum `|bulge|` that `qSVG.arcFromBulge(a, b, s)` will accept, and `arcFromBulge` returns
  `{a, b, s, L (length), n (unit chord normal), mid (chord mid), m (arc mid), c (centre), r (radius),
  sweep, a0 (start angle), dir (signed turn), length}`. Around it sit `arcAngleAt`, `arcPointAt(arc, u,
  offset)`, `arcTangentAt`, `arcTangentDeg`, and in the editor `wallArc`, `wallLength`,
  `createEquationFromWall`, `wallParamOf(wall, point)`, `wallFrameAt(wall, u)` → `{x, y, t (unit tangent),
  deg}`, `splitCurvedWall(wall)` — which walks every other `WALLS` entry, takes `qSVG.wallCrossings` between
  the two walls, keeps only crossings whose `wallParamOf` is more than **2 internal units** from either end,
  sorts by parameter and drops near-duplicates — plus `wallCrossings`, `arcSegmentIntersections`,
  `pointInWall`, `inWall`, `subArcBulge` and the wall↔separation conversions above.
  (Numeric unit caveat: the 2-D planner's internal length unit is set by `meter = 60` per metre, so "2 units"
  ≈ 3.3 cm, and `wallSize = 12` ≈ 0.20 m.)
- **Thickness is a 2-D slider in centimetres, min 1, max 50, default 20** (`OBSERVED` decoded
  `work/pmain.read.js`). On selecting a wall the panel does
  `wallWidth.setAttribute('min', 1)`, `wallWidth.setAttribute('max', 50)`,
  `wallWidthScale.textContent = '1-50'` and sets the slider to `binder.wall.thick / meter · 100`, and the
  handler maps back `binder.wall.thick = parseInt(value)/100 · meter` (with a snap of `value = 20` at
  start-up, `rotation_snappyness = 5`). The DOM is
  `<input type="range" id="extension-floorplanner-wallWidth" step="0.1">` plus a numeric twin
  `step="0.01"` whose label is computed as `value/100 · units.factor` → e.g. `0.20`
  (`OBSERVED` `evidence/2dplanner-index.html`, `work/pmain.read.js`). Crucially the 2-D module set defines
  **`meter = 0x3c = 60`** internal units per metre and `units = {name:'m', factor:1}`
  (`OBSERVED` literal, `work/pmain.read.js`), with `wallSize = 12`, `partitionSize = 8` — so
  `slider 20 → 20/100·60 = 12` internal units = **0.20 m**, and a door literal of `0x64 = 100` (100 cm) is
  the same unit. So the 2D planner's thickness is in **centimetres** (20 cm default) while the 3D editor's is
  in metres (0.2 m default) — **the same physical default expressed in two different units and two different
  internal scales**, which is a real interop hazard the bridge must handle.
- **Its own "Snap to grid" with a user-set grid size** (**DOCUMENTED**, all keys present in
  `evidence/2dplanner-index.html`): `settings.snap` "Snap to grid",
  `settings.snapHint` "Lock wall drawing to grid intersections.", `settings.gridSize` "Grid size:",
  `help.snap` "Snap to grid on / off", `top.snap` "Snap to grid (G)", plus a **help grid** distinct from the
  snap grid: `grid.on` / `grid.off`, `msg.gridOn` "Help grid on", `msg.gridOff` "Help grid off",
  `msg.snapOn` "Snap to grid on", `msg.snapOff` "Snap to grid off". The 2-D default is
  `DEFAULT_GRID_SIZE = 0x14 = 20` in its own internal units (`OBSERVED` `work/pmain.read.js`).
  This **closes round-1 Unknown #2**: the 3D editor's builder grid is the *global* snap grid, default
  **0.125 m** — `gridRatio = 0.125` at the ground-grid material, and the `snaptogridslider` is created with
  `{min: 0x2, max: 0x10, step: 0x2, value: 0x8}` (2…16, default 8) with the label
  `(1/value · unitsFactor).toFixed(3)` and `gridRatio = 1/value` (`OBSERVED` decoded literal
  `{min:2,max:16,step:2,value:8}` in round-1's `evidence/inspect-app.json`; `work/hp-editor.read.js`).
  So the 3D grid is **0.125 m by default and user-adjustable from 0.5 m (value 2) down to 0.0625 m
  (value 16)**; it is **not** a fixed 0.5 m. CasaPlazAI's 0.5 m grid is the *coarsest* setting this app
  offers, not its default.

### 2.7 Wall textures and the mesh's UV contract

**OBSERVED** `work/hp-editor.read.js:1608–1627` (`_0x3a43e4`): for a straight wall,
`uv = (x·thickness, y·floorHeight)` in local space; for floors/openings (`planar = false`) it is the raw local
`(x, z)`. The call sites confirm the two: `applyUV(child, true, thickness, floorHeight())` and
`applyUV(wall, true, wall.scaling.x, wall.scaling.y)` for the whole wall (line 7695). **INFERRED:** the intent
is **1 texture tile per metre** — multiplying local metres by the thickness/height factors normalises both
faces to `[−1,1]` for the `uvScale 0.5` default seen in the material records. `_0x3a43e4` returns early for
any wall with `_hpCurved = true`, which is why curve builds are immediately followed by a lookup-table-driven
re-mesh. Practical note for CasaPlazAI: **state the UV convention per surface explicitly** (u = along length,
v = up, scale = 1/uvScale tiles per metre) or textures will drift between straight and curved walls.

### 2.8 Live-operation recipe (useful for the next round)

The editor exposes enough on `window` to drive it without a single synthetic canvas click
(**OBSERVED**, `evidence/geo0.json` `hp3dKeys`, `evidence/geo7.json`):

```
BABYLON.Engine.Instances[0].scenes[0]         // scene
window.HP3D.buildWall({x1,z1,x2,z2,thickness,height,baseY,curve,silent})
window.HP3D.wallEndpoints(mesh) / .wallPointAt(mesh,u) / .defaultWallThickness() / .defaultWallHeight()
window.HP3D.miterWalls() / .cutwalls() / .setWallCurve(mesh,s) / .nearestWall(x,z) / .worldBounds(m)
window.HP3D.wallBuilder.options / .setOption(k,v) / .state / .chainLength / .snapAt(x,y)
window.HP3D.gizmoLists.walls        // every wall mesh ever registered
```

**WebGL/3D now works headlessly**: `--use-angle=swiftshader --enable-unsafe-swiftshader
--ignore-gpu-blocklist` gave a live canvas, and `BABYLON.Engine.Instances[0]` was usable — the round-1
"no WebGL in headless" limitation no longer applies (evidence `evidence/geo0.json`). Synthetic **canvas
clicks do register** for the wall builder once the tool is enabled *and* `wallBuilder.setOption('mode','rect')`
has been called through the API; a first "warm-up" draw right after enabling the tool is swallowed, so draw
once and discard (evidence `evidence/geo7.json`, `warmup: []` then a successful `rect_center`).

### 2.9 Licence facts (recorded exactly, per workspace rules)

- The 2D planner at `2D-Planner/index.php` is a modified fork of an **MIT-licensed** project:
  "MIT License, Copyright (c) 2018 Patrick Raspino" (`https://www.3dhouseplanner.com/2D-Planner/LICENSE`,
  round-1 evidence). Its shipped modules (`planner/qSVG`, `planner/floorplanEditor`, …) show a full
  re-implementation in that lineage, including a distinct `ARC_MIN_BULGE` constant.
- Some 3D models come from the **Sweet Home 3D 7.0.2 free version default catalog, CC BY 3.0**, plus
  Scopia / Kator Legaz / Blend Swap (CC BY 3.0), ArchiBit Generation (CC BY-NC-SA 2.5 IT), ArchiBase.net,
  "Free the models" (round-1 `evidence/01-dom.html`).
- **No source code was copied into this deliverable.** The decoded bundles under `work/` and `evidence/2d/`
  are verbatim browser-captured shipped scripts retained as evidence for analysis; everything in this report
  is a behavioural/algorithmic description in my own words, plus identifier names.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Ranked highest value-per-effort first. Each idea names the finding it comes from and the exact anchor in
CasaPlazAI's frozen schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`). The schema's shape
drives the ranking: **walls are not entities in CasaPlazAI** — a wall is a `Room.polygon` segment rendered with
the global `wallThickness` / `wallHeight`. So several of the competitor's wall features are *drawing-aid* or
*compiler* concerns that need **no schema change at all**, which is exactly where the cheap wins are.

1. **Implement centre/inside/outside as a draw-time offset of the polygon, needing no schema change.**
   *(Findings 2.1/2.5.)* The competitor stores nothing about alignment: it translates the drawn point list by
   `±t/2` (signed by the polygon winding) and then builds walls between the shifted points. CasaPlazAI's
   schema already mandates **strictly CCW polygons** (`non-ccw-polygon`, "the shoelace signed area must be
   strictly positive"), so the interior is unambiguous — `inside` is simply `+t/2` along the inward normal,
   `outside` is `−t/2`, and the stored `polygon` is always the centre-line. This makes rooms come out the size
   the user actually typed, and shared walls expressible with no new field. Expose it as an editor-local
   preference next to the snap settings (the schema already ratifies snap/underlay as out-of-schema state).
   **Effort: low. Value: very high.** *(Watch-out: the offset must be applied before the CCW check, or the
   `non-ccw-polygon` rejection fires on the raw trace.)*
2. **Make the 2D/3D wall-mesh compiler a pure, idempotent function of `FloorplanData`, and cache on a
   transform signature.** *(Findings 2.1–2.4; the competitor's `busy`/`sig` guard on `miterWalls` and its
   `_hpCurveSig`.)* Because `FloorplanData` is a frozen interchange contract, `(FloorplanData) → meshes` can be
   a pure function: same input, same geometry, testable in Node with no browser. A signature over
   `{segment endpoints, wallThickness, wallsOverride, curve}` skips re-meshing an unchanged wall during a drag.
   This is the foundation the other ideas sit on. **Effort: medium. Value: very high.**
3. **Real per-segment mitring in the compiler, replacing any blanket end overlap.**
   *(Findings 2.2/2.3.)* The competitor builds every wall `t − 0.05` too long and then fixes corners; CasaPlazAI
   can implement the fix directly. For each polygon vertex, the two incident segments each need an end-ring
   parameter pair `{plus, minus}` = the signed crossing of that segment's two face lines with the neighbour's,
   clamped to `±3t` and `±0.45·L`, applied as
   `x = (plus+minus)/2 + (plus−minus)·clamp(z,−0.5,0.5)` across the thickness. One pure function per vertex,
   producing the shared mitre line that makes corners look fabricated. Applies to `wallsOverride` heights too
   (the clamp is 2-D; no vertical mitre is needed). **Effort: medium. Value: very high.**
4. **Guard the `segmentIndex`↔`tCenter` coupling when a vertex is inserted (the competitor's "joint" tool is
   exactly this hazard).** *(Findings 2.6; `tool.joint`, `msg.addJointNote` "this may remove windows or doors
   already on that wall".)* In CasaPlazAI an `Opening` is `{roomId, segmentIndex, tCenter, width}`; adding a
   vertex to a room polygon — which is how a user would create a T-stem, a bay, or a joint — **renumbers every
   later segment index** and silently repoints or orphans openings. The schema already defines the fault codes
   (`segment-out-of-range`, `tcenter-out-of-range`, `opening-too-wide`) but not the *repair*. Write one function
   that re-maps openings across a vertex insertion (rebasing `tCenter` into the new sub-segment) and call it
   from the joint/split tool. **Effort: low-medium. Value: very high** — this is a live correctness bug class,
   and the competitor explicitly warns users about it rather than preventing it.
5. **Define the abutting/shared-wall rule explicitly and test it: two coincident polygon segments, or one?**
   *(Findings 2.3, NEGATIVE result: the competitor leaves two coincident wall meshes, and its
   `HPBIM.check()` returned `{}`.)* CasaPlazAI's schema already has the precedent for "shared edge = two rows":
   the **two-row shared door convention** (mirrored `segmentIndex`, complementary `tCenter`). A shared *wall*
   should follow the same rule — each room carries its own segment and its own thickness — and the compiler
   must decide whether to draw one strip or two. Write the test now: two adjacent rooms, assert the exact
   segment count and rendered wall count. **Effort: very low. Value: very high** (it is the correctness
   contract for the sharing feature).
6. **Joint detection by proximity, with a thickness-scaled tolerance, for whichever primitives need merging.**
   *(Finding 2.3.)* `max(0.06, 0.5·min(t₁,t₂))`, group to the centroid, angle-sort, and emit a fan cap when
   3+ ends meet. In CasaPlazAI this matters less for rooms (adjacency is explicit in the topology) but matters
   for furniture-anchored partitions and for the 3D mesh where three room corners coincide. Implement it in the
   compiler, keyed on final vertex positions. **Effort: medium. Value: medium-high.**
7. **Add an additive per-segment `curve` (signed bulge in metres) for arc walls — the one wall feature that
   genuinely needs a schema field.** *(Finding 2.4.)* `Room.polygon` segments are straight by definition, so a
   bowed wall cannot be expressed today. The clean additive shape mirrors `wallsOverride`:
   `curves?: { segmentIndex, bulge }[]` on `Room`, with `bulge` = perpendicular distance from the chord
   mid-point to the arc mid-point, meters, signed. Validate `|bulge| >= 0.005`, `L > wallThickness + 0.1`, and
   clamp to `±L/2`; derive `R = (L²/4 + s²)/(2|s|)`, `sweep = 2·atan2(L/2, R−s)`, `arcLength = R·sweep`. Because
   the polygon vertices stay the chord endpoints, **every existing rule keeps working**: `tCenter` stays a
   normalized parameter along the segment, but its physical meaning must be upgraded to arc-length (or the
   opening drifts on a bowed wall — a new migration note, not a new error code). Also add
   `curve-*` error codes and a `registerTransform(1, …)` step. **Effort: medium-high** (it is a contract
   change). **Value: high** — curved walls are a visible differentiator.
8. **Do not mitre arcs: extend them along their own tangent, clamped to `0.45·arcLength`.**
   *(Finding 2.4.)* The single trick that lets a curved wall meet a straight one without a notch, and it plugs
   straight into idea 3's ramp. **Effort: low. Value: high** (conditional on idea 7).
9. **Segment curved walls by angle, not by a fixed count: `max(8, min(96, ceil(sweep/(π/45))))`.**
   *(Finding 2.4.)* One tessellation segment per ~4°, bounded 8…96 — cheap, deterministic, and good for both
   shallow and near-semicircular arcs. Pairs with the pure compiler of idea 2. **Effort: very low.
   Value: medium-high.**
10. **One `arcInfo(segment)` helper feeding dimensions, opening placement and furniture seating.**
    *(Finding 2.4; the competitor's `wallPointAt` / `wallFrameAt` / `wallParamOf` and its `arc.measure`
    "Radius {radius} · Arc {length}" label.)* Derive `{R, sweep, arcLength, mid, centre, dir}` lazily in one
    place instead of re-deriving trig in the measure tool, the opening placer and the 3D compiler.
    **Effort: low. Value: high** *(conditional on idea 7).*
11. **"Separation line" for open-plan zones — no thickness, no mitre, rooms still respect it.**
    *(Finding 2.6; `wall.toSeparationBtn` "Make separation" / `wall.separationHint` "Transform the wall into
    simple separation line".)* Today every polygon edge becomes a `wallThickness`-thick wall, so kitchen ↔
    living dividers are fake thin walls. An additive per-segment `kind: "wall" | "separation"` (or a floor-level
    list) would express them honestly and let zones stay separate rooms. **Effort: medium. Value: medium-high.**
12. **Per-segment wall thickness and height as *additive* overrides.** *(Findings 2.1/2.2: every competitor
    wall carries its own thickness and height.)* `wallsOverride` already proves the pattern for height;
    extend it to `thickness` (and reuse `bad-wall-thickness`). The competitor shows why it is needed: a 0.1 m
    partition beside a 0.4 m exterior wall, and a half-height garden wall. Keep the globals as the default.
    **Effort: medium. Value: medium-high.**
13. **Reject degenerate segments visibly at the geometry boundary.** *(Finding 2.1: `length <= 0.01` →
    `null`.)* A sub-centimetre polygon segment or a zero-area sliver should be refused when the user draws it,
    not silently rendered as an invisible box; surface it as a tool hint. Ties to the existing
    `too-few-vertices` / `non-ccw-polygon` family. **Effort: very low. Value: medium** (data hygiene and
    testable invariants).
14. **Declare the wall UV convention once in the compiler (`u = along segment / arc length`, `v = height`,
    `1/uvScale` tiles per metre) and normalise arcs the same way.** *(Finding 2.7.)* The competitor maps
    straight walls as local `(x·t, y·h)` and skips re-mapping curved walls, which is where texture stretch
    comes from. CasaPlazAI has no wall-texture field in the schema (only `floorTexture`), so this is purely a
    compiler convention — cheap, and it prevents a class of "the texture stretches on the bay window" bugs.
    **Effort: very low. Value: medium.**
15. **Expose a small versioned debug/authoring API over the compiler and the editor model.**
    *(Finding 2.8.)* I drove the competitor's entire wall system through its own `HP3D` object with zero clicks
    and read exact numbers back — that is what made this round's verification possible. CasaPlazAI gets the
    same for free: deterministic tests, console debugging, and agent/AI authoring ("build me a 4×3 room") on
    top of the frozen schema. Keep it out of `FloorplanData` (the schema's out-of-schema-state convention
    applies). **Effort: low. Value: high (strategic).**

*Watch-list:* the 2D planner's separate centimetre scale (`meter = 60` internal units; §2.6) as an interop
hazard for any import path; the competitor's official array of wall i18n categories; floor-plan image → walls
conversion; per-wall skirting/ceiling trim (round 1).

---

## 4. Unknowns

1. **Mitre fallback for near-parallel walls.** The mitre uses `intersect(...)` with a `|denominator| <
   0.000001` bail (line 6117) and a `|denominator| < 0.02` bail in the builder's face-line helper (line 2296).
   I did not measure the behaviour at these thresholds (e.g. two walls meeting at 0.5°, or a 179° corner);
   in the fallback the end stays at `P_A` and could still overlap or leave a sliver.
2. **The T-junction rule is proven for one equal-thickness pair only.** **OBSERVED** for a 0.2 m stem on a
   0.2 m host the centre-line end lands exactly on the host face (`hostAxis + t_host/2`). Since the snap code
   offsets by the *host's* half-thickness while the mesh overlaps by the *stem's* `t − 0.05`, I have **not**
   swept unequal thicknesses (e.g. a 0.1 m partition on a 0.4 m host) to confirm which thickness governs each
   term, nor verified `_hpMiter` at a T for asymmetric cases (it stayed neutral in the one observed case).
3. **No opening-adjacent mitre test.** `cutwalls()`/`_0x294138` re-applies mitres and rebuilds normal data for
   curved walls, but I did not place a door near a corner and measure whether the end ring ramp distorts the
   opening's child vertices (the code applies the same ramp to children with a `0.0001` epsilon; the
   consequence is unmeasured).
4. **Two-room shared-wall end-to-end.** I did not draw two adjacent rectangular rooms and count the resulting
   walls/caps. The single-wall (`inside` + `outside`) construction is inferred from the offset geometry, not
   executed.
5. **The 2D planner's wall-width slider bounds are only partly nailed down.** The markup omits `min`/`max`
   (they are set from JS at wall-selection time) and I did not read that assignment directly; I confirmed the
   *scale label* literal `1-50` and the handler `thick = value/100 × meter` with `meter = 60`, which pins the
   physical meaning (value 20 → 0.20 m) but not the slider's own range attributes.
6. **Which miter values actually reach the mesh in the normal UI flow.** My numbers come from calling
   `HP3D.miterWalls()` and `HP3D.buildWall()` directly. The interactive path also runs mitering on drag and
   after `cutwalls()`; I did not confirm the ordering/frequency there.
7. **`wallJointCap` normals and material in the rendered result.** I read the geometry and material
   (`StandardMaterial` black, `backFaceCulling = false`) but not whether the cap is visible on screen at a
   normal camera angle, nor how it interacts with wall textures.
8. **Arc wall + opening placement.** `wallPointAt` returns a tangent (the obvious basis for placing an opening
   on a curved wall), but I did not place a door on a curved wall and inspect the resulting child mesh.
9. **`_hpMiter` persistence.** `_hpMiter`, `_hpCurved`, `_hpCurveExt` and `_hpCurveSig` are plain JS
   properties on the Babylon mesh (not in serialised `metadata`), so they are recomputed rather than saved.
   I did not confirm which of the project's serialisation paths (IndexedDB record, `HPSync.getState()`) keeps
   `curve.s` only — I only verified `metadata.hp.curve` itself is present on the mesh.
10. **Curved-mesh vertex totals do not match my model.** For `s = 1.0` (sweep 1.855) the mesh has 464
    vertices, but `s = −1.5` (sweep 1.018) has 624 and clamped `s = 2.0` (sweep π) has 752 — the count does not
    fall out of the `n+1` sample points per ring plus four slaves, so at least one ring is sampled with a
    different count than `max(8, min(96, ceil(sweep/(π/45))))` (or the count is rebuilt after mitring). I did
    not instrument `_0x26a165` to read the actual per-ring counts.

---

*Report written 2026-10-31, started 14:33:38 CET. New research stopped at the 95-minute mark; the remaining
time went to verification and finalising this report. Every claim above is tagged OBSERVED / DOCUMENTED /
INFERRED, and each is reproducible from the scripts and evidence named with it. No file outside this job
folder was created or modified; round-1 evidence was read only, and no competitor or CasaPlazAI source code
was copied into any deliverable.*
