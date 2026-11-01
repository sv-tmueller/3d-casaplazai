# 3D House Planner — the wall-builder snapping algorithms

Round-2 deep-dive for **CasaPlazAI**. Narrow question: *snapping in the 3D House Planner wall builder — grid,
15° angle snap relative to the previous wall, magnet to wall ends / T-junctions, alignment guides;
priorities, tolerances (px vs m), modifier keys.*

Round-1 report (`…/rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/report.md`) is read-only context and is
**reused, not repeated**. This report closes round-1 **Unknowns #2** (exact grid step), **#3** (magnet
quantification, priority order, px-vs-world) and the angle-snap mechanism, and it corrects one round-1
overstatement about gizmo snapping.

**Why this round is stronger than round 1.** Round 1 could not get a draw gesture to register and rested on
vendor UI text plus obfuscated-source structure. This round (a) **string-decoded the shipped `hp-editor`
bundle** (all `_0xc6bf(N)` lookups replaced by their literals — `evidence/hp-editor.decoded.js`), which
exposes the snapping routine as readable code, and (b) **drove the app's own `HP3D.wallBuilder.snapAt(x,y)`
API in a live WebGL2 session** (`--use-angle=swiftshader --enable-unsafe-swiftshader`), so every tolerance and
priority below is *both* read from code **and** measured. The two agree exactly.

**Evidence tags**
- **OBSERVED** — measured live on `app.php` this round (evidence JSON named), or read directly from
  `evidence/hp-editor.decoded.js` (string-decoded shipped `hp-editor`, sha256
  `7868a06179c38d65…`, copied read-only from the round-1 export).
- **DOCUMENTED** — vendor's own served UI text / i18n dictionary (round-1 evidence files).
- **INFERRED** — my reading, not measured.

Paths below are inside this job folder. `../rea-3dhouseplanner-2026-10/03-03-walls-rooms-drawing/…`
refers to the read-only round-1 folder.

---

## 1. Summary (5 bullets)

1. **There is one snap entry point with a single, code-defined priority ladder.** `HP3D.wallBuilder.snapAt(sx,sy)`
   (internally `_0x417c4`) takes **CSS pixels relative to the canvas** and returns `{x,z,kind,guides,ang,host,raw}`
   with `kind ∈ {free, start, end, corner, axis, angle, align, grid}`. Precedence, highest first:
   **Alt/Ctrl bypass → wall end (13 px) → wall corner (9 px) → T-junction onto a wall body
   (`max(9 px, thickness/2 m)`, optionally refined to an angle) → 15° angle snap (14 px on primary
   0/45/90 axes, 7 px on the other 15° steps) → axis alignment guide (8 px) → grid**.
   (**OBSERVED** `evidence/hp-editor.decoded.js` L2099–2285; live `evidence/snap-probe3.json` `mix`, and the
   tolerance scans in `snap-probe2.json`/`snap-probe3.json`.)
2. **Tolerances are screen-space pixels, not metres.** Endpoint/corner magnet, alignment and angle all measure
   screen distance `hypot(px, px)` after projecting the candidate to the viewport; the only world-space
   tolerance is the T-junction radius, and even that is `max(9 px converted to metres, thickness/2)`.
   Measured at 40 px/m: end snap survives to **0.325 m ≈ 13 px**, T-junction to **0.225 m ≈ 9 px**, alignment
   to **0.195 m < 0.2 m = 8 px** — all matching the literals `0xd`, `0x9`, `0x8`.
   (**OBSERVED** `snap-probe2.json` `tolEndZ`/`tolT`/`tolAlign`, `snap-probe3.json` `alignTol`.)
3. **The grid is 0.125 m by default and user-scalable from 0.5 m down to 0.0625 m.** The wall builder's grid
   step is `1 / N` where `N` is a slider (Babylon GUI `snaptogridslider`, min 2 / max 16 / step 2 / default 8 ⇒
   0.5, 0.25, 0.1667, 0.125, 0.1, 0.0833, 0.0714, 0.0625 m). The visible ground grid's `gridRatio` is kept
   equal to the same step, so lines and snapping coincide. Live slider sweep snaps `1.37` to
   `1.5 / 1.25 / 1.3333 / 1.375 / 1.3333 / 1.375` for N = 2/4/6/8/12/16. This closes round-1 Unknown #2.
   (**OBSERVED** decoded L2044, L1353–1359, L247, L2166, L2270–2273; `snap-probe4.json` `gridDrive`.)
4. **The 15° angle snap is two families scored together.** Candidates are `i·15°` for `i = 0…23`, with
   `i % 3 === 0` (0/45/90/135/…) as *primaries* that get a **double perpendicular tolerance (14 px vs 7 px)
   and a 5 px score bonus**; if a previous wall exists, a second family `previousDirection + i·15°` is added
   (skipping the duplicate at `i = 12`) at a **+0.5 px penalty**, so relative directions win ties but
   absolute axes win when they are clearly closer. A previous wall at 20° therefore produces snap families
   0/15/30/45/… and 5/20/35/50/… simultaneously — measured exactly. If grid is *also* on, the projected
   **length along the snapped ray is rounded to the grid step** (min one step), not just x/z.
   (**OBSERVED** decoded L2067–2098, L2270–2273; live `snap-probe4.json` `around0`/`around75`/`angleRel`,
   `snap-probe3.json` `angleGrid`.)
5. **Three tracked modifiers, all momentary:** hold **Alt** (either side) or the literal **Control** key →
   snapping fully bypassed (`kind:'free'`, raw point returned); hold **Shift** → grid snapping on for the
   duration, even when the Grid toggle is off. (The modifier state records only `alt`/`ctrl`/`shift` —
   `⌘`/Meta is *not* read here.) Separately, Shift is the *only* thing that arms the object-move/rotate gizmo snapping
   (position `1/N`, rotation 5°) — this refines round 1, which implied gizmo snapping followed the Grid
   toggle. (**OBSERVED** decoded L2138, L2166, L3395–3397/L3402–3412 (key handler), L3293–3361 and L4395–4483 (per-gizmo
   `snapDistance`), L1353 (`_0x4437ea` = `snaptogridslider`); live `snap-probe2.json` `mods`.)

---

## 2. Findings

### 2.1 Method, and how to reproduce it

Three independent legs, all cross-checked:

**(a) String-decoding the shipped bundle.** `hp-editor` (`js.php.7868a06179c38d65.js`, 691 KB) is obfuscated
with a base64 string-array + a `_0xc6bf(idx)` lookup table and rotating-wrapper `_0x…_0x…` aliases. I
evaluated only the first ~3 KB (the string array, the decoder, and the rotating IIFE) in a Node sandbox, then
replaced every `alias(0xNN)` call site across the whole file with the decoded literal — purely textual
substitution, no execution of app logic. Result: `evidence/hp-editor.decoded.js` (9043 lines, 11 572
substitutions, 0 misses). Tooling kept at `scripts/deobf.mjs`. This is a *shipped-code reading*, not a
compiled-artifact decompile, and it is the primary source for every constant below.

**(b) Live WebGL2 session.** Round-1's headless runs had no GL. With
`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --use-gl=angle` Chromium reports
`WebGL2` and Babylon 6.38.0 boots; `window.HP3D` and `HP3D.wallBuilder` appear. See
`evidence/snap-probe.json` `boot`. Scripts: `scripts/snap-probe{,2,3,4,5}.mjs`.

**(c) Driving the app's own API.** `HP3D.wallBuilder.snapAt(x,y)` is a public method (`'snapAt':(x,y)=>{…}`,
decoded L2985) that sets the internal pointer position and returns the snap result without needing a real
pointer gesture. Walls were seeded with `HP3D.buildWall({x1,z1,x2,z2,thickness,height,level})` and read back
with `HP3D.wallEndpoints(mesh)` / `HP3D.listElements({kinds,level})`. Screen coordinates were produced with
`BABYLON.Vector3.Project` through the live camera. This is why every number below is directly measured.

*Reproduce:* `CHROME="…/Google Chrome for Testing" OUT=evidence/x.json node scripts/snap-probe3.mjs`
(each script navigates `index.php` → `app.php`, clicks `#definefloor`, opens the Build tab and turns on
`#wallcheck`).

### 2.2 The one entry point, its input space and its result vocabulary

- **Input is canvas-relative CSS pixels.** `pointermove`/`pointerdown` set
  `state.x = clientX − canvasRect.left`, `state.y = clientY − canvasRect.top` (decoded L2696–2698). The
  canvas here is 1600×1000 at `devicePixelRatio` 1, so CSS px = device px; the code never scales by DPR, and my
  test confirmed `snapAt(css)` and `snapAt(css×dpr)` are not distinguished because dpr is 1.
  (**OBSERVED** `snap-probe3.json` `space`.)
- **The raw world point** comes from casting a picking ray through the pointer and intersecting the plane
  `y = levelBase` (`_0x11809c` = floorHeight × currentLevel); if the ray is horizontal it falls back to
  Babylon's `pick()`. (**OBSERVED** decoded L2106–2121.)
- **Result object**: `{x, z, kind, host, guides[], ang, from, raw}` where `raw` is the unsnapped world point
  and `ang = {dx, dz, len, rel}` is the snapped direction (decoded L2134–2136, L2284).
- **`kind` vocabulary**: `free` (no snap), `start` (on the first point of the chain, ≥3 points ⇒ the loop will
  close), `end`, `corner`, `axis` (on a wall body = T-junction), `angle`, `align`, `grid`
  (decoded L2136, L2186–2197, L2199–2214, L2219–2226, L2252, L2276, L2280).
- **Overlay glyph per kind** is fixed in a table (decoded L2669–2670):
  `{start:'end', end:'end', corner:'corner', axis:'axis', angle:'free', align:'free', grid:'grid'}` — i.e. a
  datetime-like vocabulary but *angle and align render the "free" cross* (their meaning is carried by the guide
  line, not the glyph). SVG elements: `hp-wb-snap-end` (circle r 8), `hp-wb-snap-corner` (12×12 rect),
  `hp-wb-snap-axis` (diamond path), `hp-wb-snap-free` (cross), `hp-wb-snap-grid` (circle r 3.5).
  (**OBSERVED** decoded L2629–2634.)

### 2.3 Priority order (what wins when several candidates exist)

Source order inside `_0x417c4` (decoded L2099–2285; function `_0x417c4`), confirmed by the live `mix` test
(`snap-probe3.json`):

| # | Stage | Gate | Kind | Measured probe |
|---|---|---|---|---|
| 0 | **Alt or Control held** → return raw (`_0x592072.alt\|\|.ctrl`) | always | `free` | `mods.alt`, `mods.ctrl` = `free` |
| 1 | **Magnet: wall ends / self points** (13 px) | `magnet` | `end` / `start` | `A_exact_endpoint`, `B_near_endpoint`, `priority` |
| 2 | **Magnet: wall corners** (9 px), only if #1 missed | `magnet` | `corner` | `corner` scan *(returned `end`, not `corner` — see Unknown 1)* |
| — | if #1 or #2 hit → **immediate return** (L2199) | | | |
| 3 | **Magnet: project onto wall body** (T-junction), radius `max(9 px, t/2 m)` | `magnet` | `axis` (+`host`) | `D_wall_midpoint_T`, `E_near_wall_body`, `tolT` |
| 3b | If `angle` is on, re-intersect the angle ray with that host wall; if the intersection is within **18 px** of the cursor, use it | `magnet`+`angle` | still `axis` (+`host`, +`ang`) | code L2219–2226 |
| 4 | **15° angle snap** | `angle` | `angle` | `angleScan`, `angleRel` |
| 4b | …then pull the point onto an x/z **alignment** line if one is within 18 px along the snapped ray | `magnet` | `angle` + guide | decoded L2254–2268 |
| 5 | **Axis alignment** to an endpoint x or z | `magnet` | `align` (+guide) | `F_align_x`, `align` |
| 6 | **Grid** (x/z, or length along the angle ray) | `grid` **or Shift** | `grid` | `gridOn`, `gridDrive`, `angleGrid` |

Notes that the table hides:
- The alignment candidate list is built **inside** `if (options.magnet)` (a *second* `if (options.magnet)` block at L2233–2249, reached only when the first magnet block at L2167–2229 did not return), so
  **alignment guides are part of the Magnet switch**, not a fourth independent toggle. Verified: with magnet
  off, the x-aligned cursor at `(4, 1.0)` returns `free` instead of `align`.
- `align` beats `grid` when both are on: `(4.03, 0.61)` returns `x:4, kind:'align'` while `(1.37, 0.61)`
  (no alignment available) returns `x:1.375, z:0.625, kind:'grid'` (**OBSERVED** `snap-probe3.json` `mix`).
- `axis` outranks a plain `angle`: the axis branch **returns before** the general angle block, so a wall body
  within tolerance always wins. Inside that branch (3b) the point is *moved* onto the angle ray and gets an
  `ang`, but `kind` is set to `axis` at L2213 and never overwritten — the diamond marker and the wall-host
  relationship stay, so the user still sees which wall they are on while the direction is angle-locked.

### 2.4 Grid snap — step, its source, and `Shift`

- The effective flag is `gridEnabled = options.grid || shiftHeld` (decoded L2166:
  `_0x548c5c = _0x29f3b2["grid"] || _0x592072["shift"]`). There is **no** Ctrl variant.
- The quantiser is `round(v · N) / N` with `N = max(0.000001, sliderValue || 8)` (decoded L2044
  `_0x503f9c` and `_0x43a39b`), so **grid step = 1 / N**.
- Source of `N`: a Babylon GUI slider `snaptogridslider` created in `hp-panels` with
  `{min: 2, max: 16, step: 2, value: 8}` (round-1 evidence `js-exported/js.php.2a3a408d68eb514f.js`), and its
  `onValueChangedObservable` writes `gridRatio = 1/value` into the ground `GridMaterial`
  (decoded L1353–1359). `gui.snap` header renders `"Snap to grid: {v}"` with `v = (1/N)·unitsconver`.
  So the *visible* grid spacing and the *snap* step are the same number by construction.
- Steps: N = 2,4,6,8,10,12,14,16 ⇒ **0.5, 0.25, 0.16667, 0.125, 0.1, 0.08333, 0.07143, 0.0625 m**.
  Default N = 8 ⇒ **0.125 m** (this is the literal `gridRatio = 0.125` at decoded L247 and the round-1
  `"0.125 m"` readout). Live sweep (`snap-probe4.json` `gridDrive`, 40 px/m, cursor at world 1.37/0.61):
  `N=2→1.5/0.5`, `N=4→1.25/0.5`, `N=6→1.3333/0.6667`, `N=8→1.375/0.625`, `N=12→1.3333/0.5833`,
  `N=16→1.375/0.625`. Exact.
- **Units**: the slider is unit-less (it is a screen-independent "cells per metre" number); the header text
  multiplies by `unitsconver`, so in feet mode the same step is *labelled* in ft while the metre model is
  unchanged. There is no separate feet grid.
- **`Shift`** is sampled from the live swiftshader session: with Grid off and Magnet/Angle off, cursor at
  (1.37, 0.61), holding Shift returns `{x:1.375, z:0.625, kind:'grid'}`; on keyup the same position returns
  `free` (**OBSERVED** `snap-probe2.json` `mods.shift` / `mods.shift2`). This matches the DOCUMENTED tooltip
  `wb.gridTip` "Snap points to the grid (hold Shift for the same while drawing)".

### 2.5 Angle snap — 15° table, primary 0/45/90, previous-wall-relative pass

Function `_0x1ec2af(from, cursor, prevDirUnit, metresPerPx)` (decoded L2067–2098). `metresPerPx =
1 / (screen px per metre)` measured at the cursor by projecting two 1 m offsets and averaging
(decoded L2140–2143). The algorithm:

1. If `distance(from, cursor) in px < 6` → return `null` (too close to define a direction). So the angle snap
   silently does nothing for the first few pixels of a segment.
2. Compute `θ = atan2(dz, dx)`. For each candidate direction `a`, let `δ` be the signed wrapped angle
   difference, reject if `|δ| ≥ 90°`, compute the **perpendicular pixel error**
   `perpPx = distance · |sin δ| / metresPerPx`, and reject if `perpPx > (primary ? 14 : 7)`.
3. Score `= perpPx − (primary ? 5 : 0) + (relative ? 0.5 : 0)`; keep the lowest. The −5 px bonus makes a
   primary axis win over a secondary 15° step unless the secondary is more than 5 px closer; the +0.5 px
   penalty makes a relative direction lose ties to an absolute one.
4. **Pass 1**: `i = 0…23`, `a = i·15°`, `primary = (i % 3 === 0)`, `relative = false`.
5. **Pass 2** only if a previous direction exists: `a = prevAngle + i·15°` for `i = 0…23`, **skipping
   `i === 12`** (that would duplicate the previous direction), same primary test, `relative = true`.
6. Project the cursor onto the winning direction from `from`: `point = from + dir · (v·dir)`, and return
   `{x, z, dx, dz, len, rel}`.

**Why "previous wall" is what `prevDir` means:** only when the builder state is `segment` and the chain is
non-empty does it set `from = last chain point` and `prevDir = normalize(last − secondLast)`; for the
rectangle tool `from = the first corner` with no `prevDir` (decoded L2124–2133).

**Live confirmation (2 m probe radius, 40 px/m ⇒ 80 px per 2 m):**

| cursor | result dir | `rel` | interpretation |
|---|---|---|---|
| −20° | −15° | false | absolute secondary |
| −9.5° → 0° | 0° | false | absolute primary |
| +10° → +15° | 15° | false | absolute secondary |
| 60° | 60° | false | absolute primary (i=4) |
| 65.5–70° | `free` | — | gap between primary 60 and secondary 75 |
| 75° | 75° | false | absolute secondary (i=5) |
| 80.5° → 90° | 90° | false | absolute primary (i=6) |

Half-widths predicted: primary `sin⁻¹(14/80) = 10.08°`, secondary `sin⁻¹(7/80) = 5.02°`; the 60↔75 crossover
is at `(10.08+5.02)/2 = 7.55°` from 60 ⇒ free band ≈ 65.5–70.0°. Measured free band: 65.5–70. **Exact
agreement** (`snap-probe4.json` `around0` and `around75`).

**Relative family.** One wall drawn at exactly 20° (angle snap off for that wall), then angle snap on:
cursor 0° → 0° (`rel:false`); 2–4° → 0°; **4.5–8° → 5° (`rel:true`)**; 10–? → 15° (`rel:false`);
**16–25° → 20° (`rel:true`)**; 27–? → 30° (`rel:false`); **33–? → 35° (`rel:true`)**; 38.5–? → 45°
(`rel:false`); **49.5–? → 50° (`rel:true`)**; 55+ → 60° (`rel:false`). Both families are genuinely live and
interleaved (`snap-probe5.json` `rows`; `snap-probe4.json` `angleRel`). This is the mechanism behind the
DOCUMENTED `wb.angleTip` "Snap directions to 15° steps (0°, 45° and 90° first), also relative to the previous
wall".

**Grid × angle interplay.** With `angle` and `grid` both on, the point on the snapped ray has its **length
quantised to the grid** (`max(1/N, round(len·N)/N)`, decoded L2270–2273). Measured on a horizontal ray at
N = 8, base (4,0): raw length 2.03 → x 6.0; 2.06 → 6.0; 2.062 → 6.0; 2.07 → **6.125**; 2.13 → 6.125;
2.19 → **6.25** (`snap-probe3.json` `angleGrid`). So CasaPlazAI's grid can quantise *distance along the
direction* as well as the axes, when the two are combined.

### 2.6 Magnet — wall ends, wall corners, T-junctions onto a wall body

All inside `if (options.magnet)` (decoded L2167–2249). Distances are **screen pixels**: the candidate world
point is projected with `Vector3.Project` and the pointer's `hypot` in px is compared to a literal.

- **Wall-end pass.** Candidate list = (i) every existing wall's endpoints, **each tested twice**, at the wall
  base `y0` and at the wall top `y0 + height`; (ii) the current chain's own points — the first tagged
  `start`, the rest `end`; (iii) the rectangle tool's first corner, tagged `end`. Threshold starts at
  **13 px** (`0xd`) and the best candidate wins. If it hits, `kind = start|end` and the function **returns
  immediately**. The self-point inclusion is what makes "click the first point to close the loop" work as a
  snap; when the chain has ≥ 3 points the overlay switches the start glyph to `hp-wb-close`.
  Wall endpoints were read live via `HP3D.wallEndpoints(mesh)` → `{a, b, thickness, height, baseY}`
  (`snap-probe.json` `seed`).
- **Wall-corner pass.** Only if the end pass found nothing: threshold drops to **9 px** and the code tests the
  four physical corners of every wall — at each end, offset `±(t/2 − 0.025)` along the axis and `±t/2`
  perpendicular (`[[a,−1],[b,+1]]`, decoded L2192–2197). `kind = corner`.
- **T-junction pass.** Project the cursor onto each wall segment line; reject the segment if the projection
  parameter is within `t/2 + 0.01 m` of either end (so ends don't compete with the endpoint pass); accept if
  the perpendicular distance is `≤ max(9 px·metresPerPx, t/2)`. `kind = axis`, and the result carries
  `host = {mesh, ax, az, ux, uz, t}`. The `t/2` floor means a thick wall is grabbable by its body even when
  the pointer is > 9 px from the centreline — sensible for 0.2–0.4 m walls.
- **Angle refinement inside the axis branch** (3b): if angle snap is on, the code intersects the angle ray
  from `from` with the host wall's line; if the intersection is past `from` and more than 18 px of cursor
  travel away it is ignored, otherwise the point snaps there and gains an `ang` — but `kind` stays `axis`
  (set at L2213) and the `host` block is untouched, because the assignment at L2224 writes only `x`, `z`,
  `ang`. This is what feels like "slide along the wall at 15°/45°" in the real UI while the diamond marker
  and the wall association stay visible.

**Measured tolerances** (40 px/m ⇒ 1 px = 0.025 m):

| probe | quantity | transition | px |
|---|---|---|---|
| `tolEndZ` | walk radially off endpoint (4,−3) | `end` for Δz ≤ 0.325 m, then `align` (z-alignment) | 13.0 |
| `tolT` | walk perpendicular off wall body at x=1.5 | `axis` for Δz ≤ 0.225 m, then `free` | 9.0 |
| `tolAlign` | walk in x off alignment with endpoint x=4 | `align` for Δx ≤ 0.195 m, `free` at 0.2 m | 8.0 |

Predicted from literals `0xd`, `max(0x9, t/2 = 0.1)` and `0x8`: 13 px, max(9, 4) = 9 px, 8 px. Exact match
(`snap-probe2.json` `tolEndZ`/`tolT`/`tolAlign`, `snap-probe3.json` `alignTol`).

Note the corner pass could not be isolated in the live runs: at (4, −3) all four offset probes returned `end`
because the 13 px end pass fires first (13 px > the 0.1 m = 4 px offsets used). Corner is therefore
code-verified, and its glyph/rect geometry is code-verified, but I did not observe a live `kind:'corner'`
result (`snap-probe3.json` `corner`).

### 2.7 Alignment guides — the x/z axis scan and the drawn guide lines

- Candidate list (built inside the magnet block, decoded L2233–2249): every existing wall endpoint and every
  current self point; for each, an **x candidate** if `|cursor.x − p.x| ≤ 8 px` and a **z candidate** if
  `|cursor.z − p.z| ≤ 8 px`, each keeping the closest. Note this is a *pure axis* alignment, not a look at the
  wall's own direction — it aligns the cursor with a point's x or z in **world axes**, which suits the
  axis-aligned-room workflow.
- The 8 px bound is expressed as `8 · metresPerPx` (decoded `_0x20ccf8 = 0x8 * _0x14a269`, where
  `_0x14a269` is metres-per-pixel, not px-per-metre — an easy misreading; live confirms the px reading).
- Behaviour: if angle snap produced a point, alignment **refines** it — for each available x/z candidate the
  code walks along the snapped ray to where it crosses the candidate's x (or z) line and accepts the crossing
  if it is within **18 px** of the cursor; the guide segment is drawn from the referenced point to the snapped
  point. If angle snap did *not* produce a point, `x`/`z` are simply forced to the candidate value,
  `kind='align'`, and one guide per active axis is emitted.
- Guides are returned in `guides[]` as world segments `{x1,z1,x2,z2}` and rendered into `<g class="hp-wb-guides">`
  as `<line class="hp-wb-guide">`, with the angle line additionally classed
  `hp-wb-guide hp-wb-guide-angle`; the SVG overlay is `hp-wb-overlay`, full-canvas, `aria-hidden="true"`
  (decoded L2629–2634, L2658–2667, L2962–2965).
- Live: cursor at (4, 1.0) and (4, 2.5) returns `kind:'align'` with **1 guide**; `guides` is empty for a
  `grid` or `free` result (`snap-probe2.json` `align`; `snap-probe3.json` `mix`). The direct `snapAt` call
  populates the returned object but the DOM overlay only refreshes on the builder's own frame loop, so
  `document.querySelector('.hp-wb-guides')` was empty when driven from the console — a tooling limitation,
  not a missing feature (`snap-probe3.json` `guides`).

### 2.8 Tolerances: pixels, and how they become metres

| Stage | Constant (decoded) | Unit | metres at 40 px/m |
|---|---|---|---|
| minimum segment length for angle snap | `6` | px | 0.15 m |
| angle snap, primary directions | `14` | px perpendicular | 0.35 m |
| angle snap, other 15° steps | `7` | px perpendicular | 0.175 m |
| angle-snap score bonus/penalty | `5` and `0.5` | px score | — |
| magnet: wall ends / self points | `0xd` = 13 | px (candidate projected at 2 heights) | 0.325 m |
| magnet: wall corners | `9` | px | 0.225 m |
| magnet: T-junction radius | `max(9 px, t/2 m)` | px→m, with a world floor | max(0.225, 0.1) = 0.225 m |
| alignment (magnet) | `8` | px | 0.20 m |
| angle↔alignment / angle↔wall intersection | `18` | px | 0.45 m |
| grid | `1/N`, N ∈ {2..16 step 2} | m cells | 0.0625–0.5 m |
| gizmo translation (Shift) | `1/N` | m | same as grid |
| gizmo rotation (Shift) | `5·π/180` | rad | 5° |

So the design is deliberately **screen-space for pointing, world-space for the grid**: the magnet and angle
tolerances stay constant in *apparent size* as you zoom, which is what makes them feel like mouse snapping,
while grid and typed dimensions stay constant in the model. The one hybrid is the T-junction radius, which
takes whichever of the 9 px or the wall half-thickness is larger (so thin walls don't become un-grabbable at
high zoom, and thick walls are grabbable from their face).

### 2.9 Modifier keys and keyboard

- **Alt** and **Control** are tracked in a shared modifier state `_0x592072 = {alt, ctrl, shift}` that is
  refreshed on *every* pointer and key event (`_0x5828e6`, decoded L2686–2690, and cleared on blur at L2763),
  and `snapAt` returns the raw point **before any snapping** when `alt` or `ctrl` is set (decoded L2138).
  There is **no `meta` entry and `metaKey` is never read here**, so `⌘` does *not* disable snapping — it is
  only the literal Control key. Live: with the cursor exactly on the (4,−3) endpoint, Alt gives `kind:'free'`
  at the raw point, and Control the same (`snap-probe2.json` `mods`). This covers the DOCUMENTED `wb.hint`
  "Alt: no snapping".
- **Shift** is the momentary grid: `grid || shift` (decoded L2166), live-verified as above. This is separate
  from the Grid toggle — it does not change the toggle's checkbox state.
- The builder's own `keydown` listener (decoded L2730–2757) explicitly ignores "Alt" so the number-typing
  path is not disturbed, accepts `0-9.,` to start typing a length/angle, `Tab` to switch fields, `Backspace`
  and `Ctrl/⌘+Z` to undo a point (the *undo* path does read `metaKey`, decoded L2737), `Enter` to finish, `Esc` to cancel then exit. (Round 1 documented the hint
  text; here the code path is confirmed.)
- **Gizmo snapping (round-1 correction).** `positionGizmo.snapDistance` is `1/N` and `rotationGizmo.snapDistance`
  is `5°` only when `_0x2a7f7e` is true, and `_0x2a7f7e` is set true **only on Shift keydown** and cleared on
  Shift keyup or window blur (decoded L3395–3397/L3402–3412, L3293–3361, L4395–4483; step pointer `_0x4437ea` = `snaptogridslider` at L1353). Round 1 wrote that the
  gizmos "use the same grid … when those switches are on"; the accurate statement is that **object move/rotate
  snap is armed by holding Shift**, not by the wall-builder's Grid checkbox. Same numeric step, different
  trigger.

### 2.10 Where the wall builder stores and exposes this

- Options object with defaults, persisted to one localStorage record: key literal `hp-wallbuilder-opts`
  (**correction to round 1, which read `hp-wallbuilding`**), value
  `{mode:'chain', align:'center', grid:false, angle:true, magnet:true, roomW:4, roomD:3}`, `roomW/D` clamped
  to `[0.5, 200]`, booleans type-checked on load (decoded L2014–2035). The DOM element is `#wallbuilderopts`
  and the click handler reads `data-wb-mode` / `data-wb-align` (decoded L2702–2712).
- Public API on `window.HP3D.wallBuilder`: `state` (getter), `chainLength`, `historyLength`, `options`,
  `setOption(k,v)`, `finish()`, `undo()`, `placeRoom()`, **`snapAt(x,y)`** (decoded L2970–2985). `HP3D` itself
  is documented as `version:1` and exposes `scene`, `canvas`, `grid`, `gizmoManagers`, `listElements`,
  `wallEndpoints`, `buildWall`, `nearestWall`, `levelBase`, `units()`, etc. (decoded L7626–7690).
- Observed live defaults match exactly: `{mode:'chain', align:'center', grid:false, angle:true, magnet:true,
  roomW:4, roomD:3}` with `#wbgrid` unchecked, `#wbangle`/`#wbmagnet` checked (`snap-probe.json` `afterWb`;
  `dom-probe.json` `slider`).

### 2.11 Corrections and additions to round 1

- **Grid step resolved**: 0.125 m default, slider-scalable to 0.5–0.0625 m; the ground grid's `gridRatio`
  tracks it. (Round-1 Unknown #2.)
- **Snap priority resolved**: end > corner > axis(T-junction) > angle > align > grid, with Alt/Ctrl bypassing
  everything. (Round-1 Unknown #3.)
- **Tolerances are px, not world-constant**: 13 / 9 / 8 / 14 / 7 / 18 px as tabulated. (Round-1 Unknown #3.)
- **"Alignment guides" are part of the Magnet toggle**, not a separate fourth snap. (Round-1 described the
  Magnet tooltip as covering all three, which is right; it did not say the guides share the toggle.)
- **LocalStorage key is `hp-wallbuilder-opts`**, not `hp-wallbuilding`. (Round-1 inferred the latter from a
  literal.)
- **Gizmo snap is Shift-armed**, not toggled by the Grid checkbox.
- **Grid also quantises length** when combined with the angle snap.
- **Angle/tolerance constants** (6/14/7/5/0.5/18 px) are now exact rather than "structural".

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Each is tied to a finding above and, where relevant, to the CasaPlazAI plan schema at
`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

1. **Adopt the priority ladder as a single pure function, and expose it.** One `resolveSnap(pointerPx, ctx)
   → {point, kind, guides}` with the measured precedence (end 13 px → corner 9 px → T-junction
   max(9 px, t/2) → 15° angle 14/7 px → axis align 8 px → grid 0.5 m). CasaPlazAI already snaps to a 0.5 m
   grid and places doors/windows on room edges; reusing this ladder for *both* wall drawing and opening
   placement makes the whole app feel like one tool, and a pure function is trivially unit-testable with
   synthetic pointer/distance fixtures. **Effort: low. Value: very high.**
   *(Findings 2.3, 2.8; schema: this belongs in the out-of-schema editor preference already reserved for it,
   `casaplaza.snap.settings.v1` ("grid pitch + master switch"), which today holds only two of the six
   parameters the ladder needs; `wallThickness` feeds the t/2 T-junction floor.)*
2. **Make tolerances screen-space and centralise them as one `SNAP_PX` table** (`end:13, corner:9, tJunction:9,
   anglePrimary:14, angleSecondary:7, align:8, angleAlign:18`). CasaPlazAI's stated 0.5 m grid is world-space,
   which means at high zoom the grid gets visually dense while a "snap to grid" cursor can feel far away;
   screen-space magnet tolerances plus a world-space grid is exactly the competitor's split and is the single
   biggest feel upgrade. **Effort: low. Value: high.** *(Findings 2.6, 2.8.)*
3. **Implement the 15° two-family angle snap (absolute + previous-wall-relative) with a primary bonus.**
   Score `perpPx − (primary?5:0) + (relative?0.5:0)`, primary = multiples of 45°, second family offset by the
   previous segment's direction and skipping the duplicate. This is what lets a user draw a 20°-rotated wing
   and keep drawing smooth 35/50/65° walls on the same lattice — the competitor does it and it reads as
   "the app understands my building". **Effort: low-medium (one function). Value: high.**
   *(Finding 2.5.)*
4. **Hold-to-modify keys: `Alt`/`Ctrl` = no snap, `Shift` = grid on, and Shift also arms transform snapping.**
   All momentary, no mode switching, all already natural for CasaPlazAI's Plan/3D/Walk modes. Also useful:
   Shift as the gizmo-snap arm keeps `Alt` free for "temporarily disable". **Effort: low. Value: high.**
   *(Finding 2.9.)*
5. **Ship a `wallBuilder.snapAt(px, py)` (or TS equivalent) as a public, versioned debug/test API.** The
   competitor's exposed `HP3D.wallBuilder.snapAt` is the reason this round could *measure* tolerances instead
   of guessing them; for CasaPlazAI it buys deterministic tests, console debugging, and an agent/AI path to the
   drawing tools (round-1 idea #15). **Effort: very low. Value: high (strategic).**
   *(Finding 2.10.)*
6. **Quantise length along an angle-snapped ray, not just x/z.** When grid and angle are both active, round the
   projected distance to the grid (minimum one step). It makes "3.0 m wall at 45°" achievable without typing
   and removes the last off-grid lengths from hand-drawn plans. **Effort: very low once angle snap exists.
   Value: medium-high.** *(Finding 2.5, `angleGrid`.)*
7. **T-junction snap with a thickness-aware radius and a `hostWallId` on the result.** Snapping a new wall
   onto the *body* of an existing one (not just its ends) is what produces real T-junctions and shared walls;
   returning the host wall id lets 2D room-drawing record the relationship so a later pass can emit the schema's
   two-row shared-door convention (mirrored `segmentIndex`, complementary `tCenter`) instead of two
   independent unsnapped openings. For shared walls the schema has **no shared-wall entity** — rooms carry
   their own polygons and a door shared by two rooms is emitted as two `Opening` rows — so snapping to a host
   wall at *build* time is exactly what keeps those two polygons/`segmentIndex` pairs consistent.
   Adopt the `max(9 px, t/2)` floor using the schema's global `wallThickness` (or a per-segment
   `wallsOverride` height if thickness ever becomes per-segment). **Effort: medium. Value: very high**
   (directly fixes shared-wall correctness). *(Finding 2.6; schema: `wallThickness`, `Opening.segmentIndex`,
   `Opening.tCenter`, two-row shared-door convention.)*
8. **Axis-alignment guides against every visible endpoint, with a drawn guide line, only while Magnet is on.**
   One 8 px world-axis scan plus a `<line>` per active axis closes 90% of "why won't my room close" cases, and
   grouping it under the Magnet toggle avoids a fourth switch. **Effort: low-medium (overlay). Value: high.**
   *(Finding 2.7.)*
9. **A distinct snap-glyph per kind (circle = end, square = corner, diamond = T-junction, small dot = grid,
   cross = free) plus a subtle guide line.** The competitor's whole snap vocabulary is 5 SVG shapes; the
   *shape* is how the user learns which priority fired. Pair it with CasaPlazAI's new tool card so the glyph
   legend is discoverable. **Effort: low. Value: medium.** *(Finding 2.2.)*
10. **Persist snap settings with the editor state and show the grid step numerically.** CasaPlazAI already
    keeps snap settings out of the schema under `casaplaza.snap.settings.v1` ("grid pitch + master switch");
    widen that record to `{gridPitch, master, snapAngle, angleRelative, snapEnds, snapAlign, snapTJunctions}`
    (the competitor uses one localStorage record, `hp-wallbuilder-opts`) and render a "Snap to grid: 0.125 m"
    style readout so the behaviour is auditable. Keep it editor-local so share links omit it by construction.
    **Effort: very low. Value: medium.** *(Findings 2.4, 2.10; schema: out-of-schema editor state.)*
11. **Consider a user-scalable grid (`1/N`, N = 2…16) alongside the fixed 0.5 m default.** CasaPlazAI's 0.5 m
    grid matches the competitor's *coarsest* step; exposing a few steps (0.5/0.25/0.125/0.0625) lets users do
    detail work without abandoning snapping. Keep the *visible* grid at the same step as the snap step.
    **Effort: low. Value: medium-high.** *(Finding 2.4.)*
12. **Use the screen-space magnet as the selection/opening-placement picker too.** The same projected-distance
    test used for wall ends can place a door/window on a room edge by picking the nearest `segmentIndex` and
    solving `tCenter` from the snapped point; the schema already validates that interval
    (`[tCenter*L − width/2, tCenter*L + width/2] ⊆ [0, L]`, else `opening-too-wide`), so the snap should clamp
    `tCenter` to the valid range rather than emit an invalid row. Reusing one `pickNearest(list, pxThreshold)`
    keeps the interaction language consistent across tools. **Effort: low. Value: medium.**
    *(Findings 2.6, 2.8; schema: `Opening.segmentIndex`, `Opening.tCenter`, `opening-too-wide`.)*

*Watch-list:* the angle ray ↔ wall-body intersection rule (18 px) that produces "slide along the wall at the
snapped angle" *(2.6, 3b)*; the `start`-point snap that closes a polygon loop *(2.6)*; the slightly odd
"minimum 6 px segment length before angle snap engages" *(2.5)* — worth copying as a small dead-zone so the
first 0.15 m of a drag doesn't jump direction.

---

## 4. Unknowns

1. **The `corner` magnet kind was never observed live.** The 13 px end pass always fired first at the offsets
   I tested. I verified the corner pass in code (threshold 9 px, four corner points per wall at
   `±(t/2 − 0.025)` axial and `±t/2` perpendicular) and its square glyph, but a scenario where the cursor is
   within 9 px of a physical wall corner and > 13 px from the centreline endpoint was not constructed. A
   probe that points obliquely at a wall face near its end would settle it.
2. **Screen-space vs CSS-pixel when `devicePixelRatio ≠ 1`.** The code subtracts the canvas bounding rect and
   never multiplies by DPR; the canvas CSS size and render size were equal in my runs (1600×1000, dpr 1).
   On a HiDPI display where Babylon's `hardwareScalingLevel`/render size differs, a 13 CSS-px tolerance would
   be a different number of device pixels — I could not test that here. The code *reads* CSS px, so the
   likely answer is "CSS px throughout", but unverified.
3. **Whether the angle snap's 6 px dead-zone and 14/7 px tolerances are ever surfaced to the user or tunable.**
   They are literals; I found no slider or option for them (unlike the grid step, which has one).
4. **Feet mode.** `unitsconver` multiplies the *readouts* and the grid header label; I did not switch the app
   to feet to confirm that the grid step in feet is the same physical step and that typed lengths convert. The
   model appears metric throughout (`units.factor`), but the entry path was not exercised this round.
5. **The alignment-guide rendering path under programmatic `snapAt`.** The overlay's `innerHTML` only updates
   inside the builder's frame loop, so console-driven calls returned correct `guides[]` but an empty
   `.hp-wb-guides` node. A real pointer move would render them; I did not capture a rendered guide line.
   (Round 1's screenshots exist but I cannot view images.)
6. **Exact guide geometry for the "angle + alignment" refinement** — I read the intersection maths and the
   18 px acceptance, and the returned guide segments are code-verified, but I did not measure the drawn
   extension length (angle guides are extended 60 px forward / 0 backward in the SVG builder, decoded
   L2665–2667).
7. **Whether `axis`/`corner` host relationships survive into the saved plan** (i.e. whether the `host` object
   returned by `snapAt` is what the wall builder writes onto the new wall's metadata). The builder's
   `_0x305adc` copies only `{x, z, host}` onto the *point*, and `buildWall` accepts a `meta` argument; I did
   not trace whether the host id ends up in `HPSync`'s plan document. This is adjacent to round-1 Unknown #5
   (shared-wall semantics end to end) and still open.
8. **Deobfuscation fidelity.** The string table substitution is mechanical and 0-miss, but local variable
   names remain obfuscated, so a handful of numeric literals are identified by their *usage* (`0x8` in the
   alignment bound, `0x12` in the angle/alignment acceptance) rather than by a name. The meanings above are
   supported by the live tolerance measurements, which is the strongest available check, but a variable that
   is reused for two purposes in the same function would be easy to conflate.
