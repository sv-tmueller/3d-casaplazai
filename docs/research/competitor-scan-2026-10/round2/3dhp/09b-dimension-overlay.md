# 3D House Planner — Dimensions overlay: 4 categories, label layout/overlap rejection, room-area formatting & rounding (m / ft)

Round-2 deep dive for **CasaPlazAI**. Subject: **3D House Planner**, <https://www.3dhouseplanner.com/>
(browser editor, Babylon.js; embedded 2D planner at `2D-Planner/index.php`).

Read first (reused, read-only): round-1 report `~/dsh-workspaces/rea-3dhouseplanner-2026-10/09-09-measurements-levels/report.md`.
This round closes the gaps in that report's *Unknowns* **#2** ("numeric room-area output was never seen… rounding
behaviour… `OBSERVED` in code only") and parts of **#1**, and goes deeper on the four dimension categories, the label
layout / overlap rejection, and area number formatting + rounding. Round-1's established facts are not repeated
except where number formatting needs them.

**Method.** The site ships obfuscated (javascript-obfuscator) per-module bundles via `js.php?f=editor/*` and
`js.php?f=planner/*`. I re-ran round-1's string-array rotational deobfuscator on `editor/hp-dims` and confirmed the
result is **byte-identical** to round-1's `readonly/hp-dims.deob.js` (MD5 `95db26e9dada0409e0b8a210d8b2afe1`) —
so round-1's decoded dims source is trustworthy. I then wrote my own rotation-checked decoder
(`evidence/verification/decode-verified.mjs`), asserted the rotation target, and built a full index→string map for
all 121 referenced indices (`evidence/hp-dims.decodemap.json`). The two decoding paths agree on every index.

**Evidence tags.** `OBSERVED` = read out of JavaScript the site served to this machine, or seen in a captured
page/DOM. `DOCUMENTED` = stated by the vendor on a page I fetched. `INFERRED` = reasoning.
**Licence note.** 3D House Planner is proprietary (footer *"© 2022-2026. All rights reserved."*). Everything below
describes behaviour, algorithms, data shapes and UX in my own words; decoded bundles are kept only as local evidence
and are not reproduced here.

Local evidence: `evidence/` (decoded modules, decode map, verification harnesses), `evidence/live-dims/`,
`scenarios/`, `sources.json`.

---

## 1. Summary

- **Four categories are independent boolean options, not four renderers.** `hp-dims` keeps one options object
  `{walls:true, openings:false, rooms:false, heights:false}` (localStorage `hp-dims-opts`), a master `hp-dims` flag
  (localStorage `'1'`), and every category is a plain `if` guard around code that *adds geometry to a shared line
  array and text to a shared label list* (`OBSERVED`, decoded `hp-dims`; UI wiring in decoded `hp-render`).
- **`walls` is really two categories under one name**: per-wall dimension chains (with ticks and end-extension
  lines) *plus* the overall bounding-box width/depth chain; both are gated on `options.walls` (`OBSERVED`).
- **`rooms` counts real polygon area, subtracts holes, and shows name · area · perimeter** — shoelace signed area
  over the slab's polygon points, centroid by the standard `Σ(x_i+x_{i+1})·cross / (3·Σcross)` formula, hole rings
  subtracted with `|area|`, label text `"<name> · <area> · P <perimeter>"` (`OBSERVED`).
- **Label layout is viewport-space DOM projected each frame, with first-come-wins box rejection.** One
  `div.hp-dims-layer` (`position:fixed; inset:0; pointer-events:none; z-index:3`) shared with the free-hand
  Measure tool; each label a `span.hp-dim-label` (11.5 px semibold system-ui pill); the box is
  `3.3 px × textLength + 6 px` half-width and `±9 px` tall; boxes that are off-screen, behind the camera, or
  intersect an already-accepted box get `display:none`; the accepted-box list is **reset every frame**, so priority
  is draw order: overall size & heights → room areas → wall lengths → door/window gaps (`OBSERVED`).
- **Two different rounding engines produce the same nominal 2 decimals but disagree at half-cent boundaries.** The
  3D overlay uses `Number.toLocaleString(locale, {min/maxFractionDigits:2})` (locale-aware, *grouped*), while the
  2D planner uses `Number.toFixed(2)` (*ungrouped*). The mechanism is not "two different half-rules" but two
  different digit sources: `toFixed` rounds the exact binary value (`2.675` is stored as
  `2.6749999999999998224`, hence `2.67`), whereas `Intl` rounds the value's shortest decimal representation
  (`2.675`, hence `2.68`). So 2.675 m² prints **2.68 m²** in 3D and **2.67 m²** in 2D; 1,234.567 m² prints
  **1,234.57 m²** vs **1234.57 m²**. (`OBSERVED` in code; both engines executed locally,
  `evidence/verification/format-harness.mjs`.) In feet, lengths round to **whole inches** (`8'-8"`), never
  fractions, and areas use a truncated factor **10.7639**.

---

## 2. Findings

### 2.1 The four categories and exactly what each draws

Source: decoded `hp-dims` (`evidence/hp-dims.verified.pretty.js`, identical to round-1's
`readonly/hp-dims.deob.js`). Options object and persistence are as round-1 found; the details below are new.

The module builds three parallel arrays and one order list, then hands them to the renderer:

| array | contents | used for |
|---|---|---|
| `lines` | pairs of `Vector3` at `Y = levelBase(level) + 0.03` | the single Babylon `CreateLineSystem("hpDims")` |
| `dimLabels` | `[x, y, z, text]` records | DOM `span.hp-dim-label` |
| `overallLabels` | `[x, y, z, text]` records | same, but emitted **before** `dimLabels` |
| `overlay.add(...)` | appends a `span` to `div.hp-dims-layer` | the DOM projection loop |

Final label order is `overallLabels.concat(dimLabels)` (rooms are `unshift`-ed into `dimLabels`, so they come first
within that group).

**`walls: true` — per-wall chain plus overall size.**
For every element `listElements({kinds:['wall'], level})` whose mesh `id === 'wall'` and whose world endpoints give
`len >= 0.3 m`:
- the wall's own dimension line is drawn **offset outward** by `halfThickness + 0.45` along the wall normal, the
  normal being flipped to point away from the average wall centre (so dimension lines sit outside the plan);
- two short **extension lines** run from each endpoint to the dimension line;
- a **tick** (`0.09·(ux+nx)` by `0.09·(uz+nz)`, i.e. a 45° slash) is drawn at each endpoint;
- the value is the wall's straight length, **or its `curve.arcLength`** if the wall is curved (`isFinite`-guarded),
  so an arc wall is dimensioned by arc length, not chord;
- the label sits at the wall midpoint, `Y = levelBase + 0.03`.
Then, if the combined bounds span **more than 0.5 m in both X and Z**, an **overall chain** is drawn 1.4 m outside
the bounding box (two strips, one per axis), with corner ticks and two labels: overall width and overall depth.
All of this is inside `if (options.walls)`. `OBSERVED`.

**`openings: true` — dimensions the *wall segments between* doors and windows.**
This is the most surprising detail: the category is labelled *"Doors and windows"*, but the algorithm does not
measure doors/windows. For each door/window on the level it finds the host wall (`nearestWall` at the opening's
bounds centre, `maxDistance 0.6 m`), projects the opening's four bounding corners onto the wall axis to get two
`s` parameters (clamped to `[0, wallLen]`), and accumulates them into a per-wall `stops` array seeded with
`[0, wallLen]`. It then sorts, drops any stop within `0.02 m` of the previous one, draws one dimension line along
the wall at offset `halfThickness + 0.22` with ticks at every stop, **and emits a label for each consecutive pair
of stops more than 0.05 m apart** — i.e. the clear wall lengths either side of and between openings. So the number
you read is wall length, not opening width. `OBSERVED`.

**`rooms: true` — polygon area with holes, centroid, area + perimeter label.**
For every `slab` element with `mesh.metadata.hp.points` of `length >= 3`:
- signed shoelace sum `A = Σ (x_i·z_{i+1} − x_{i+1}·z_i)`; the centroid uses the standard formula
  `cx = Σ(x_i+x_{i+1})·cross / (3·Σcross)`, `cz = Σ(z_i+z_{i+1})·cross / (3·Σcross)`;
- area is `|A|/2`, then for each ring in `metadata.hp.holes` the shoelace term is computed and **subtracted**
  (`area -= |holeArea|/2`), so a stairwell or courtyard hole reduces the room area;
- degeneracy guard: if `|A| < 0.000001` the room is skipped entirely;
- perimeter is accumulated as `Σ hypot(dx, dz)`, i.e. the **outer ring only** (holes do not add perimeter);
- label text is built as `(roomName ? roomName + " · " : "") + formatArea(area) + " · P " + format(perimeter)`,
  with `roomName` taken from `mesh.metadata.bim.room.name` or `metadata.hp.name`;
- the room label is `unshift`-ed into the label array, so **room areas win the overlap contest** against wall
  lengths and opening gaps;
- the room label's height is `levelBase(level) + 0.12` (12 cm above the slab), versus `+0.03` for wall labels, so
  room text floats slightly above the dimension lines. `OBSERVED`.

**`heights: true` — ground-to-top and separately roof-to-top.**
Only when both X and Z bounds are finite:
- a vertical dimension is drawn at plan offset `(-0.8, -0.8)` from the bounds, from `minY` to `maxY` of the walls,
  with ticks, labelled `format(maxY − minY)`;
- then `listElements({kinds:['roof']})` (all levels — no level filter) and the maximum
  `worldBounds(root).max.y` over roofs is taken; if it is finite and **exceeds the wall top by more than 0.05 m**,
  a second, longer vertical dimension is drawn at `(-1.5, -1.5)` from `levelBase(0)` to the roof top, labelled with
  that height. So "Heights" gives you storey height *and* overall building height with the roof. `OBSERVED`.

**Category-adjacent guard rails observed:** wall labels need `len >= 0.3`; the overall chain needs both spans
`> 0.5`; the roof extension needs `> 0.05` above the wall top; opening gaps need `> 0.05`. `OBSERVED`.

### 2.2 Label layout and overlap rejection — exact algorithm

Source: decoded `hp-dims`, function that runs on `scene.onAfterRenderObservable`. Round-1 named the mechanism;
here is the precise algorithm and its consequences.

1. **One layer, many spans, shared with the free-hand measure tool.** A single `div.hp-dims-layer` is lazily created
   on `document.body`; each label is a `span` with class `hp-dim-label` (plus optional extra classes passed by the
   caller). Text is set via `textContent`. The `overlay(extraClass)` factory is exported as `HPDims.overlay`, and
   `hp-measure` calls it twice — `HPDims.overlay("hp-measure-label")` for pinned measurements and
   `HPDims.overlay("hp-measure-label hp-measure-live")` for the live readout — so **the measure labels and the
   automatic dimension labels live in the same layer, share the same per-frame projection, and compete in the same
   overlap rejection**; they are distinguished only by CSS class. `OBSERVED` (verified index `0xf6` =
   `"hp-dim-label"`, `0x140` = `"hp-dims-layer"`; `hp-measure` decoded).
2. **Per-frame projection.** On every rendered frame, the module caches `canvas.getBoundingClientRect()`,
   `camera.viewport.toGlobal(w, h)` and `scene.getTransformMatrix()`, then for each label does
   `BABYLON.Vector3.ProjectToRef(point, Matrix.IdentityReadOnly, transform, viewport, tmp)`. `OBSERVED`.
3. **Visibility test.** A label is a candidate only if `0 < z < 1` (in front of the camera, not beyond the far
   plane) **and** `x > -40 && y > -20 && x < width + 40 && y < height + 20` — i.e. a 40 px horizontal / 20 px
   vertical margin around the canvas. `OBSERVED`.
4. **Box size.** `halfWidth = 3.3 * textContent.length + 6` (pixels), `halfHeight = 9`. The box is
   `[x−halfWidth, y−9, x+halfWidth, y+9]`. So the estimate is a fixed per-character term (3.3 px/char) and does
   **not** measure the actual rendered text or the CSS font size. `OBSERVED`.
5. **Rejection rule (AABB overlap).** For each candidate in order, test against every already-accepted box:
   overlap iff `a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0`. On the first overlap the label is
   rejected. `OBSERVED`.
6. **Result.** Rejected or off-screen → `el.style.display = 'none'`; accepted → `el.style.display = ''` and
   `el.style.transform = 'translate(Xpx,Ypx) translate(-50%,-50%)'` where `X = rect.left + x`, `Y = rect.top + y`
   (toFixed(1)). The `translate(-50%,-50%)` is what centres the span on the projected point. `OBSERVED`.
7. **The accepted-box list is local to the frame** (`var placed = []` inside the draw call). Consequence: no
   hysteresis, so a label can flicker on/off as the camera moves, and **priority is purely iteration order**:
   overall width/depth and heights are added to the DOM first, then rooms (unshifted), then individual wall
   lengths, then door/window gaps. In a dense plan, room areas survive and wall lengths disappear. `OBSERVED`
   (ordering) + `INFERRED` (flicker).
8. **The DOM layer is never removed on disable.** `setEnabled(false)` clears the Babylon line mesh and the label
   list, but the `div.hp-dims-layer` (created once inside the overlay helper) stays in the DOM with all spans
   removed. `OBSERVED`.

**The CSS closes the box-size question** (fetched `assets/css/hp-ui.css`, `OBSERVED`):
- `.hp-dims-layer { position: fixed; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }` — a
  full-viewport, click-through overlay above the canvas;
- `.hp-dim-label { position: absolute; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,.9);
  color: #1d2330; font: 600 11.5px <hp-font, system-ui>; white-space: nowrap; box-shadow: 0 1px 2px
  rgba(0,0,0,.18); font-variant-numeric: tabular-nums; }`
- `.hp-dim-label.hp-measure-label { background:#1f6f68; color:#fff; }` and
  `.hp-dim-label.hp-measure-live { background:#ee7319; }` — so pinned measurements are dark teal and the live
  readout orange.

Because the font is **fixed at 11.5 px, semi-bold, system-ui, with `tabular-nums` and `nowrap`**, the 3.3 px/char
half-width is a fair estimate (digits in a tabular font advance ≈ 6.4 px, and the span adds 10 px of padding, so a
full width of `6.6·len + 10` tracks the real `6.4·len + 10` closely for numeric labels). It becomes inaccurate for
long non-numeric text — e.g. a room label such as `"Kitchen · 12.34 m² · P 14.10 m"`, where average advance is
narrower than the per-digit figure — and for any label the caller renders with a different class. **There is no
leader line and no nudge-away fallback: a rejected label simply vanishes.** `OBSERVED` (CSS) + `INFERRED`
(mis-measure magnitude).

### 2.3 Room-area number formatting and rounding in m² and ft²

**3D overlay formatter** (decoded `hp-dims`, `formatArea`), persisted-unit driven:

- metric: `v.toLocaleString(HPI18N.lang, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " m²"`;
- imperial: `(10.7639 * v).toLocaleString(HPI18N.lang, {min:2, max:2}) + " ft²"`.

**Length formatter** (`format`):
- metric: `v.toLocaleString(lang, {min:2, max:2}) + " m"`;
- imperial: `Math.round(v / 0.0254)` total inches → `Math.floor(inches/12) + "'-" + (inches % 12) + '"'`.

`HPI18N.lang` is the short language code (`en`, `pt`, …) and `HPI18N.locale` maps it to `en-US`, `de-DE`, …; the
formatter passes `lang` (not `locale`) to `toLocaleString`, and when it is undefined the browser default applies.
`OBSERVED` (the `get lang` / `get locale` accessors in decoded `hp-i18n`).

I executed both formatter bodies locally with a real locale (`evidence/verification/format-harness.mjs`,
`en-US`), reproducing the module's exact expressions. Results (`OBSERVED` by execution):

| input | m mode | ft mode |
|---|---|---|
| area 0.5 m² | `0.50 m²` | `5.38 ft²` |
| area 8.6666 m² | `8.67 m²` | `93.29 ft²` |
| area 12.5 m² | `12.50 m²` | `134.55 ft²` |
| area 20.25 m² | `20.25 m²` | `217.97 ft²` |
| area 100 m² | `100.00 m²` | `1,076.39 ft²` |
| area 1234.567 m² | `1,234.57 m²` | `13,288.76 ft²` |
| area 0.999 m² | `1.00 m²` | `10.75 ft²` |
| area 99.999 m² | `100.00 m²` | `1,076.38 ft²` |
| length 8.6666 m | `8.67 m` | `28'-5"` |
| length 2.645 m | `2.65 m` | `8'-8"` |
| length 0.125 m | `0.13 m` | `0'-5"` |
| length 0.755 m | `0.76 m` | `2'-6"` |
| length 0 | `0.00 m` | `0'-0"` |

Notable consequences, all `OBSERVED`:

- **Always exactly two decimals** for metric and for ft², at every magnitude — no precision tiering (no "3.5 m"
  for a door and "12.35 m" for a room). A 0.13 m dimension and a 1,234.57 m² area are formatted the same way.
- **Grouping is on in 3D** (`1,234.57 m²`, `1,076.39 ft²`) because `toLocaleString` is used; the separator follows
  the browser locale (in `de-DE`: `1.234,57 m²` and a decimal comma).
- **Feet-inches is rounded to whole inches only.** `Math.round(v/0.0254)` means 2.645 m → exactly `8'-8"`. There
  are no fractional inches (`8'-8½"` is unreachable), and sub-foot values render as `0'-5"`.
- **Areas and lengths round differently from feet-inches.** Areas and metric lengths go through the locale
  formatter (which rounds the shortest decimal representation); feet-inches goes through `Math.round` on the
  computed inch count.
- **The ft² factor is truncated:** `10.7639`, whereas 1 m² = 10.7639104167… ft². The bias is ≈ −0.0000104 ft² per
  m², i.e. about −0.01 ft² on a 1,000 m² house. `OBSERVED` (literal) + `INFERRED` (magnitude).

### 2.4 The 2D planner's own formatters — a second, disagreeing rounding engine

The embedded 2D planner (`2D-Planner/index.php`, `planner/*` bundles) keeps its own `units = {name, factor}` and
`meter = 60` px per metre, and its own formatters (decoded `planner-planner-main`):

- `fpShowNum(v, d)` = `window.fpNum ? window.fpNum(v, d) : Number(v).toFixed(d ?? 2)` — **and `window.fpNum` is
  never assigned anywhere in the planner or editor bundles** (I searched every shipped planner and editor bundle,
  the 2D HTML, and every inline script: zero definitions, only guarded reads). So the live path is always
  `Number(v).toFixed(2)`. `OBSERVED`.
- `formatLength(px) = fpShowNum(px/meter*units.factor, 2) + ' ' + units.name` → `6.00 m` / `19.69 ft`.
- `formatArea(px²) = fpShowNum(px²/(meter²)*units.factor², 2) + ' ' + units.name + '²'` → `24.00 m²` /
  `258.33 ft²` for a 6 × 4 m room. `OBSERVED` by executing the transcribed bodies.
- Unit labels in the 2D UI are set by writing `units.name` into every `.unit-label` and `units.name + '²'` into
  every `.area-unit-label`, i.e. the area unit is the length unit with a `²` appended, not a distinct symbol.
  `OBSERVED`.

**The two engines disagree.** `toLocaleString` and `toFixed` round differently at half-cent boundaries and differ
on grouping. I ran the same inputs through both (`evidence/verification/format-harness.mjs`):

| value | 3D `toLocaleString(2)` | 2D `toFixed(2)` |
|---|---|---|
| 2.675 | `2.68` | `2.67` |
| 1.005 | `1.01` | `1.00` |
| 8.665 | `8.67` | `8.66` |
| 24.005 | `24.01` | `24.00` |
| 100.005 | `100.01` | `100.00` |
| 1234.567 | `1,234.57` | `1234.57` |

So the **same room area can read 2.68 m² in the 3D overlay and 2.67 m² in the 2D plan**, and the 2D plan has no
thousands separator. `OBSERVED` (both engines executed).

**On-plan room label in 2D** (decoded `planner-floorplanEditor`, `roomMaker`):
- the computed area comes from `qSVG.areaRoom(...)`, which applies the shoelace formula and returns
  `Math.abs(shoelaceSum.toFixed(2)) / 2` — the **`toFixed(2)` is applied to the doubled (shoelace) sum, in canvas
  px², before halving**, so the stored area is quantised in steps of `0.005 px²`; divided by `meter²` (60² = 3600
  px²/m²) that is ≈ `1.4e-6 m²`, i.e. numerically negligible, and the sign is discarded. It does **not** change
  the displayed two-decimal value, but it does mean the stored `room.area` is not the full-precision quantity;
- the label is an SVG `<text>` at the polygon's visual centre, `text-anchor=middle`, font `roboto`, white stroke;
- if a **manual "real area"** was typed (`room.surface`), the label switches to
  `room.surface + ' ' + units.name + '²'` in **bold** — the typed string is used **verbatim**, bypassing
  `formatArea` and therefore any rounding or grouping;
- the label is only drawn when `room.showSurface` is true; the room name (if any) is drawn as a separate line
  above it, and when a name exists the area label's `y` is pushed down by `20` px. `OBSERVED`.
- Per-room properties exposed in the UI are `rs.showArea` *"Show area on the plan"*, `rs.countArea` *"Count in the
  total area"*, `rs.ignoreArea` *"Leave out of the total area"*, `rs.realArea` *"Real area, if you know it"*,
  `rs.areaLabel` *"Floor area"* (round-1 found these keys; the code above is what consumes them). `OBSERVED`.

### 2.5 Where the option UI lives

Round-1 established the four i18n labels. New this round: the panel is built **in `hp-render`**, not `hp-panels`.
The list is a hard-coded array `["walls","openings","rooms","heights"]` rendered as
`<input type="checkbox" data-dim-opt="<id>">` + `t("dims."+id)` inside `div.hp-dims-opts`, which is shown only
while the master `.hp-opt-dims` switch is on. The master checkbox title is `dims.toggle` *"Dimensions in 3D"* and
sits under the section title `render.sec.show` *"Show in the scene"* (alongside *Contour lines on the terrain* and
*Vegetation and water on the painted terrain*). Change handlers call `HPDims.setEnabled` / `HPDims.setOption(id, on)`,
and the panel re-syncs from `HPDims.enabled` / `HPDims.options` when the `hp:dims` event fires. `OBSERVED`.
**Live DOM confirms this exactly.** A bounded live capture with a software-GL Chrome wrapper
(`scenarios/chrome-swiftshader.sh`, `scenarios/dims-live2.json`) reached the *View and light* tab and captured the
real markup: `<div class="hp-section-title">Show in the scene</div><label class="hp-switch"><span>Dimensions in
3D</span><input type="checkbox" class="hp-opt-dims"></label><div class="hp-dims-opts" hidden=""><label><input
type="checkbox" data-dim-opt="walls">Walls and overall size</label>…` — see `evidence/live-dims-panel.html`.
The 3D module also exposes `HPDims.refresh`, `HPDims.overlay`, `HPDims.format`, `HPDims.formatArea` — the measure
module (`hp-measure`) reads `HPDims.format` to keep its readouts in the same notation. `OBSERVED`.

### 2.6 Rebuild triggers and cadence (round-1 confirmed)

Event types that schedule a rebuild: `created, deleted, moved, imported, level, ready, projectLoaded,
projectCleared`; plus `HPUnits.onChange`. Rebuilds are debounced with a **150 ms** `setTimeout`. The dims module is
attached either immediately (`window.HP3D` present) or on the `hp3d:ready` event. `OBSERVED`.

---

## 3. Ideas for CasaPlazAI

CasaPlazAI today: rectangle + polygon rooms, 0.5 m grid snapping, shared walls, doors/windows, a small furniture
palette with fit/collision, a measure tool, multiple floors, 3D walkthrough, blueprint underlay, PNG/JPEG export,
localStorage autosave, single-workspace UI (Plan / 3D / Walk, tool card, inspector). Each idea is tied to a finding
and, where relevant, to `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

### Tier 1 — high value, low effort

1. **One number-formatting module, one rounding engine — and never two.** *(finding 2.3, 2.4)* The competitor's
   most visible measurement bug is that its 3D overlay and its 2D plan round the same area differently and only one
   of them groups thousands. CasaPlazAI should ship exactly one `formatLength` / `formatArea` pair, used by the
   canvas labels, the inspector, the measure readout, the status bar and the PNG/JPEG export caption. Use
   `Intl.NumberFormat` (locale-aware, grouped, consistent) — never `toFixed` — and put the rounding policy in one
   place so a room's area cannot read 12.35 in one view and 12.34 in another.

2. **Two decimals for metric, whole inches for imperial — decided once.** *(finding 2.3)* Their behaviour is
   actually a good default: metric lengths and all areas get exactly 2 decimals; feet get whole inches
   (`8'-8"`). That is the notation on a real drawing. Adopt it in the formatter, but *document* the two exceptions
   they left implicit: sub-foot values become `0'-5"`, and areas still use `ft²` with 2 decimals. CasaPlazAI's plan
   is metric internally, so this is pure presentation.

3. **A dimension overlay with the same four categories and persisted options.** *(finding 2.1, 2.5)* Add one
   "Dimensions" master switch plus four sub-options — *Walls and overall size* (on), *Doors and windows* (off),
   *Room areas* (off), *Heights* (off) — persisted as `{enabled, options}` under one localStorage key. Draw all
   lines as a single non-pickable line system in the existing Three.js scene, and render the numbers as DOM or
   canvas labels. This gives the "looks like a plan" 3D view cheaply.

4. **Draw the dimension lines as offset chains with ticks and extension lines, not just a line between two
   points.** *(finding 2.1)* Their dimension line sits `wallThickness/2 + 0.45 m` outside the wall, with two
   extension lines from the wall endpoints and a 45° slash tick at each end, and the overall chain sits a further
   1.4 m out. That three-part construction (extension – line – tick) is what makes a number read as a *dimension*
   instead of a stray line, and it is a small amount of extra Three.js geometry. Also copy the guard rails: skip
   walls shorter than ~0.3 m, skip an overall chain when either span is under ~0.5 m, and label an arc wall by its
   arc length.

5. **Label de-clutter by screen-space AABB, first-come-wins.** *(finding 2.2)* Estimate each label's box from its
   text length (they use `3.3 px/char ± 9 px`), test it against the boxes already accepted **this frame**, and hide
   any that intersect. Reset the accepted list every frame. Improve on them in two ways: (a) measure the real text
   box (`measureText` or `getBoundingClientRect`) instead of a per-character constant, and (b) give priority
   explicitly — overall size and heights first, then room areas, then individual walls, then opening gaps — rather
   than inheriting it from array order. Their `unshift`-to-prioritise rooms is clever but invisible in the code.

6. **Share one projected-label layer between the measure tool and the automatic dimensions.** *(finding 2.2)*
   `HPDims.overlay(extraClass)` returns a label sink, and `hp-measure` calls it with `"hp-measure-label"` /
   `"hp-measure-label hp-measure-live"` so pinned and live measurements are projected, de-cluttered and styled by
   the same machinery as the dimensions, differing only by CSS class (teal pinned / orange live). Rebroadcasting one
   overlay API is far less code than a second DOM layer, and it means the free-hand measure readout and the
   automatic dimensions never overlap each other. CasaPlazAI's measure tool and Plan-mode dimension labels should
   share exactly one projector and one rejection list.

### Tier 2 — high value, medium effort

7. **Dimension the clear wall segments between openings, not the openings.** *(finding 2.1)* Their *"Doors and
   windows"* toggle actually labels the remaining wall runs on each wall, derived by projecting opening bounding
   boxes onto the wall axis and diffing against `[0, wallLength]`. That is the architecturally correct output and
   the algorithm is simple: build a sorted stop list per wall, drop stops within ~2 cm, and label each consecutive
   pair more than ~5 cm apart. It needs only the door/window positions CasaPlazAI already stores on room edges.

8. **Room area = polygon shoelace minus holes, with a centroid label of `name · area · perimeter`.** *(finding
   2.1)* Compute signed shoelace area over the room polygon, subtract `|holeArea|/2` for each interior ring (their
   slab holes cover stairwells and courtyards), skip degenerate rings (`|cross| < 1e-6`), and place the label at
   the polygon centroid. Include the perimeter (`Σ hypot`) — it is free and it is what people ask for when sizing
   skirting. CasaPlazAI has polygon rooms already, so this is a self-contained geometry helper over the existing
   room model; add `area`, `perimeter` and `centroid` to the room data in the schema.

9. **Per-room area options: show / count / exclude / manual override.** *(finding 2.4)* Their room properties are
   `showArea` (draw on plan), `countArea` vs `ignoreArea` (include or exclude from the level total) and `realArea`
   (a typed value that overrides the computed one). A `realArea` override that is used **verbatim** — no
   re-formatting, bold in the label — is exactly right, because a surveyed number must not be silently re-rounded.
   Model it in the schema as optional `areaOverride?: {value: number, unit: 'm'|'ft'}` with the *display* string
   derived at render time, and mark rooms with an override in the total-area breakdown so a user can see why the
   total does not match the drawing.

10. **A level total-area readout with its own unit label.** *(finding 2.4)* They show a running total
   (`#extension-floorplanner-areaValue`) and a printable *"Total surface"* plus a per-room report. CasaPlazAI
   already has multiple floors; add a per-floor total in the inspector and a whole-plan total in the status bar,
   summing only rooms where *count in total* is on and using `areaOverride` where present.

### Tier 3 — valuable but larger

11. **A "Heights" category that distinguishes storey height from overall height with roof.** *(finding 2.1)* Their
    implementation draws one dimension from the wall bottom to the wall top, then looks for any `roof` element
    anywhere in the model whose top is more than 5 cm above that, and if so draws a second, longer dimension from
    ground to roof top. Two numbers, two runs, one toggle — a clean way to answer both "how tall is the room" and
    "how tall is the house".

12. **Grouped, locale-aware numbers everywhere, with the locale from the UI language.** *(finding 2.3)* Their 3D
    overlay groups (`1,234.57`) and the 2D plan does not (`1234.57`), and their decimal separator follows the
    browser locale inside `toLocaleString` but the feet-inches path ignores locale entirely. If CasaPlazAI adds a
    language switcher, route every number through the one formatter with the active language's BCP-47 tag.

### Anti-patterns worth avoiding (learned this round)

- **Do not ship two rounding engines for the same number.** `toLocaleString` and `toFixed` disagree on 2.675,
  1.005, 24.005, 100.005 — every one of which is a plausible room area. Pick one.
- **Do not format to exactly two decimals at every scale.** 0.13 m and 1,234.57 m² sharing a precision rule is
  what forces the overlay to be noisy on small dimensions; a per-magnitude rule (mm/cm under 1 m) would read
  better.
- **Do not estimate label boxes from a per-character constant** if the font is not fixed; it mis-measures and
  makes labels flicker in and out while orbiting.
- **Do not leave a dead `window.fpNum` hook** guarded-but-never-assigned, and do not let a manual area override be
  re-formatted; both cause "the number changed by itself" support tickets.
- **Do not compute bounding boxes over all levels for a per-level overlay.** Their roof scan
  (`listElements({kinds:['roof']})`) has no level filter, so on a multi-storey project the "Heights" dimension can
  pick up a roof that belongs to another level.

---

## 4. Unknowns

1. **No live *visual* confirmation of the overlay this round — only live DOM of the panel.** The
   `capture-browser-scenario` contract (`dist/domain/browserScenario.js`, `browserScenarioValues.js` in the
   `rea-agents` package) supports only `goto, click, fill, press, select_option, check, uncheck, wait_for, request,
   wait_for_timeout` — there is **no `evaluate` action and no browser launch-argument field** (the `browser` union is
   only `launch{executable_path, headless}` or `connect{cdp_endpoint, target_id}`). A software-GL wrapper passed via
   `executable_path` got the app far enough to render the *View and light* panel (`evidence/live-dims-panel.html`,
   captured at four steps), but the `check` on `input.hp-opt-dims` never flipped the master switch: in all four DOM
   captures the sub-options stayed `hidden=""` and no `div.hp-dims-layer` or `span.hp-dim-label` ever appeared in the
   DOM. Either the checkbox was not actionable at that moment or `HPDims` was not yet attached. Everything in
   §2.1–2.5 is therefore `OBSERVED` in shipped code (plus the live panel markup in §2.5) and in locally executed
   formatter bodies, not in a rendered 3D screenshot.
2. **The exact CSS is now known for the layer and labels** (fetched `assets/css/hp-ui.css`; see §2.2). What is still
   unknown is the pixel accuracy of the 3.3 px/char estimate for *long text* labels (room labels carrying a name, an
   area and a perimeter) — I did not render one, and `getBoundingClientRect` on a live label would settle it.
3. **`window.fpNum`'s intended definition is unknown.** Every planner formatter guards on it and none assigns it;
   it may be a hook for an older or an embedded build. I cannot say whether any deployment defines it. If it did,
   the 2D rounding path would change to `HPI18N.num` (which localises via `localizeNumbers`) and my §2.4
   `toFixed` conclusion would not hold at that deployment.
4. **`qSVG.areaRoom`'s double rounding was not exercised numerically.** The code applies `toFixed(2)` to the
   shoelace sum before halving and before dividing by `meter²`; I did not run a full plan through the 2D pipeline,
   so the exact granularity of the stored room area is inferred from the source, not measured.
5. **The room `surface` (manual area) input is not validated in what I read.** The listener stores
   `room.surface = el.value.trim()` and the label concatenates it with the unit; I did not see parsing to a number
   or a range check, so `"about 12"` may render as `about 12 m²`. `OBSERVED` (no validation in the handler) +
   `INFERRED` (consequence).
6. **The `hp-dims-opts` merge is unchecked.** On load the module does `Object.assign(defaults, JSON.parse(...) ||
   {})`, so an old stored object with unknown keys is merged in; `setOption` only accepts the four known ids, so
   stray keys are inert but remain in the stored object. Low impact, unverified in a live session.
7. **Whether the four categories ever interact in the overlap list across levels.** The label list is shared for
   the whole scene, but each rebuild only populates the *current* level, so I expect no cross-level label
   competition; I did not verify a multi-level scene.
8. **Third-party reviews / third-party implementations** still could not be researched via web search; all
   external statements here come from pages I fetched directly (see `sources.json`).
