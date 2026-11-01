# Sweet Home 3D — room area/perimeter computation, label & text styles, readability at zoom

Job 10-08b (round 2). Reuses round-1 evidence **read-only** from
`~/dsh-workspaces/rea-sweethome3d-2026-10/08-08-dimensions-levels/`
(its `report.md`, `report-plan-features.md`, `evidence/tmpl_*.html`, `libjs/sweethome3d.min.js`
v7.5.2, `res/localization*.json`, `examples/*.sh3x`). I added my own empirical probe:
the vendor's shipped JS bundle was loaded in a stubbed DOM under Node and its public model
API was called directly (`tools/load_bundle.js`, `tools/probe_api.js`; raw output in
`evidence/probe_api_output.txt`). This round I also drove the **live browser edition** in
headless Chrome (`live/`, see §2.5) — round 1 could not. Every claim is tagged
**OBSERVED** (I fetched/read/ran it, with file or URL), **DOCUMENTED** (vendor docs state it)
or **INFERRED**. Bare paths like `docs/…`, `libjs/…`, `res/…` and `examples/…` refer to the
round-1 folder just named unless they start with `live/` or `evidence/` (which are this
job's own). All writes are confined to this job's folder.

## 1. Summary

- **Area is computed, perimeter is not.** `Room.getArea()` returns **cm²** from the shoelace
  formula over the polygon points; it first calls `java.awt.geom.Area(...).isSingular()`,
  and for a non-singular area it walks the `PathIterator` and accumulates the signed area of
  each sub-path (no final `Math.abs` on that branch — the `Area` already normalises
  winding). The cm²→m² division happens only in the *formatter* (`/10000`). **There is no
  `getPerimeter()` in the whole 7.5.2 bundle** (grep + runtime `typeof` = `undefined`). (OBSERVED)
- **Area is a first-class text object, not a derived readout.** Each room carries two
  independent movable/rotatable texts — name and area — each with its own offset from the
  room's *centre*, its own angle and its own `TextStyle`; only `areaVisible` gates the area.
  (OBSERVED bundle + javadoc, DOCUMENTED javadoc)
- **Text is drawn in "plan units" and therefore scales with the plan zoom.** `paintComponent`
  applies one `ctx.scale(scale × HiDPI)` to the canvas, then `setFont(fontSize + "px")` with
  no minimum/cull logic — a 24 pt room label at zoom 2.0 renders at 48 px, at zoom 0.01 at
  0.24 px. Readability is managed by the *user* through zoom controls and the global
  "Increase/Decrease size" actions (×1.1 / ÷1.1 per press), not by the renderer. (OBSERVED:
  code + Node emulation; `getFontSize()/scale` and any minimum-font guard are absent)
- **The two style defaults are constants**: generic text/label/dimension `TextStyle(18)` and
  room name/area `TextStyle(24)`; alignment defaults to `CENTER` and font name to `null`
  (= user's default font). Room name's *default* Y offset is −40 cm (area's is 0), so the
  area lands at the room centre and the name 40 cm above it. (OBSERVED runtime)
- **Round-1 gaps closed for this question**: the exact area-algorithm branch and its
  non-singular handling, the unit-format strings (`"4 m²"`, `"43 sq ft"`, +10000/+929.0304
  divisors), the absence of a perimeter API, and the concrete zoom-scaling mechanism
  (single canvas transform + px font, no compensating logic). The browser edition was also
  driven live for the first time this round: the plan canvas is a 2× backing store
  (`width="2592"` for `width:1296px`), the toolbar exposes INCREASE/DECREASE_TEXT_SIZE and
  TOGGLE_BOLD/ITALIC, and three `ZOOM_OUT` clicks changed the drawing but left the median
  glyph height at 6 px. (OBSERVED, §2.5)

## 2. Findings

### 2.1 Room area & perimeter computation

**Area algorithm (OBSERVED, `libjs/sweethome3d.min.js` @ 7.5.2, offset ~586450; javadoc
`docs/jdoc_Room.html`):**

1. `getArea()` is cached in `areaCache` and invalidated on any `POINTS` change.
2. It builds `new java.awt.geom.Area(this.getShape())` where `getShape()` is the polygon
   `GeneralPath` (moveTo first point → lineTo each next → closePath). (bundle, same file)
3. If `area.isSingular()` is true it returns `Math.abs(getSignedArea(points))`.
4. Otherwise it iterates the Area's `PathIterator`; on each `SEG_CLOSE` it takes the
   accumulated sub-path and **adds** `getSignedArea(subPath)`. Because `Area` normalises
   winding, a multi-sub-path result already encodes holes/overlaps, and the outer sum is not
   wrapped in `Math.abs` again.
5. `getSignedArea(pts)` is the classic shoelace accumulated in a loop, `d/2` at the end.
   `isClockwise()` is literally `getSignedArea(points) < 0`.

Verified numerically by running the vendor bundle in Node (**OBSERVED**,
`evidence/probe_api_output.txt`):

| Polygon (cm) | `getArea()` | Meaning |
| --- | --- | --- |
| 400×300 rectangle | `120000` | 12 m² = 400×300 |
| same rectangle, reversed winding | `120000` | sign-independent |
| L-shape 600×400 minus 200×200 | `200000` | 20 m², correct |
| 600×400 with 200×400 + 200×200 notch | `200000` | correct |
| two-point degenerate `Room` | `0` | `isSingular()` true, area 0 |
| bow-tie `[[0,0],[400,400],[0,400],[400,0]]` | threw `invalid overload` in the JS `Area` path | JS `Area.isSingular` edge case; desktop Java returns a value |

Units: coordinates are **centimetres**; the shoelace result is therefore cm². I also made
progress on round 1's `TotalArea` mystery (OBSERVED, `examples/2BedroomHouseWithBasement.sh3x`):
the stored `<property name='TotalArea' value='1008068'/>` is **100.8068 m²**, while my own
shoelace over the file's 13 room polygons gives 141.27 m². I brute-forced subsets of the 13
polygon areas and found **exactly one** that lands within 1 cm² of the stored value: the 10
middle rooms, i.e. **all except `Terrace` (21.83 m²), `Garage` (16.50 m²) and the one room
whose only distinguishing attribute is `floorVisible='false'` (2.13 m²)**. So `TotalArea` is
*not* the geometric sum of every polygon; it is a filtered figure. I could not confirm the
*intended* predicate (candidates like "exclude `ceilingVisible='false'`" or "exclude
unnamed" both give different sums — 113.96 m² and 88.87 m²), so the exclusion rule remains
**INFERRED from one file**, and `TotalArea` is computed outside the `Room` model (no
`getTotalArea()` API exists). CasaPlazAI has no levels/floors concept in the schema, so this
is a pattern to note (a "habitable area" statistic) rather than to port.

**Perimeter: does not exist** — OBSERVED:
- `grep -i perimeter` over all 15 shipped JS files returns **0 hits** (also `circumference`).
- At runtime `typeof room.getPerimeter === "undefined"` and there is no `getPerimeter` in
  `Room`'s method list; the official 7.5 `Room` javadoc
  (`https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/Room.html`) contains the
  string "perimeter" **0 times** (OBSERVED, re-fetched). Round 1 flagged this absence; it is
  confirmed both statically and at runtime.
- Consequence for the product: Sweet Home 3D has **no** "perimeter / wall-length per room"
  readout at all. Users who want skirting-board lengths use dimension lines or wall lengths.

**Area formatting (OBSERVED runtime + bundle offsets ~2050146 / 2054447 / 2060740):**
- `LengthUnit.getAreaFormatWithUnit()` returns a `DecimalFormat` subclass:
  - metric: pattern `"0.##"`, grouping on, `format(areaCm2) => text(areaCm2 / 10000) + " " + squareMeterUnit` →
    `40000` ⇒ `"4 m²"`, `123400` ⇒ `"12.34 m²"`, `120000` ⇒ `"12 m²"`,
    `12345678` ⇒ `"1,234.57 m²"` (grouping separator present), `40` cm² ⇒ `"0 m²"`,
    `100` cm² ⇒ `"0.01 m²"`.
  - imperial: `format(areaCm2) => text(areaCm2 / 929.0304) + " " + unit` (sq ft), with
    pattern `"0"` for `INCH` (⇒ `"43 sq ft"`) and `"0.###"`-style decimals for
    `INCH_DECIMALS`/`FOOT_DECIMALS` (⇒ `"43.06 sq ft"`).
- The unit symbol is a **localised string** looked up via `LengthUnit.getLocalizedUnit("squareMeterUnit")`
  / `"squareFootUnit"` — so it is `m²` / `sq ft` in English and localised elsewhere. All six
  unit options (mm, cm, m, inch, inch/decimals, foot/decimals) share the same area formatter
  choice: metric area is always m², imperial always sq ft (OBSERVED runtime: `CENTIMETER`
  and `MILLIMETER` both yield `"4 m²"`).
- Length formatting is separate (`getFormatWithUnit()`): e.g. `123.4 cm` ⇒ `"1.234 m"` in
  metre mode, `"123.4 cm"` in cm, `"4'0⅝\""` in foot/inch mode (`InchFractionFormat`).

### 2.2 Room name / area text: placement, offsets, rotation, visibility

(OBSERVED javadoc `docs/jdoc_Room.html`, `docs/jdoc_Room.Property.html`; bundle
`paintRoomsNameAndArea` @ ~2192455, `paintHomeItems` @ ~2187238; XML in
`examples/*.sh3x`; UI strings in `res/localization.json`.)

- `Room` stores **offsets from the room centre**, not absolute text positions:
  `nameXOffset/nameYOffset/nameAngle`, `areaXOffset/areaYOffset/areaAngle`, plus
  `nameStyle`/`areaStyle` (`TextStyle`) and `isAreaVisible()/setAreaVisible()`.
  There is **no** `getNameX()/getAreaX()` — round 1 established this; confirmed.
- `getXCenter()/getYCenter()` are the midpoint of the polygon's **axis-aligned bounding
  box** (min+max)/2, not the centroid (OBSERVED code). Text is placed at
  `(center + offset)`, rotated by `angle`.
- Defaults measured at runtime (OBSERVED `evidence/probe_api_output.txt`):
  - `nameXOffset=0`, **`nameYOffset=−40`**, `nameAngle=0`
  - `areaXOffset=0`, `areaYOffset=0`, `areaAngle=0`
  - `areaVisible` is **true for a freshly constructed `Room`** — the generated field block
    initialises `areaVisible=false`, then the constructor body overrides it to `true`
    alongside `nameYOffset=-40`. But the **XML reader** does
    `setAreaVisible("true" === attrs["areaVisible"])`, so a *missing* attribute deserialises
    to `false`, and the **XML writer** emits the attribute only when it differs from
    `false`. Round-trips survive (the writer always emits `true` when it is true), yet the
    constructor default and the deserialisation default disagree. Small but real footgun to
    avoid in CasaPlazAI: one default per field, shared by factory and parser.
  - Consequence of the two offsets: by default the **area sits on the room centre and the
    name 40 cm above it** — the reason every SH3D screenshot shows the two lines stacked.
- `Room.Property` constants relevant here: `NAME, NAME_X_OFFSET, NAME_Y_OFFSET, NAME_STYLE,
  NAME_ANGLE, POINTS, AREA_VISIBLE, AREA_X_OFFSET, AREA_Y_OFFSET, AREA_STYLE, AREA_ANGLE`.
  A change to any of them in the JS bundle clears `sortedLevelRooms`, the other-level area
  caches and revalidates (OBSERVED listener at ~2137668).
- Paint order (OBSERVED): `paintHomeItems` paints shapes first (`paintRooms`, `paintWalls`,
  `paintFurniture`, `paintPolylines`, `paintDimensionLines`) and then all annotation text in
  the order **`paintRoomsNameAndArea` → `paintFurnitureName` → `paintLabels`**. So room
  name/area sits on top of furniture shapes but *under* furniture names and free labels. `paintRoomsNameAndArea` iterates only rooms of the selected
  level (`sortedLevelRooms`) and, per room, paints the name (if non-blank after trim) then
  the area if `isAreaVisible()` **and `getArea() > 0.01`** (cm²), i.e. rooms under 1 cm² get
  no area text (OBSERVED).
- Rotation/offset editing is by direct manipulation: `paintTextIndicators` draws a
  `TEXT_LOCATION_INDICATOR` (small arc + stem) at the text anchor for dragging the offset
  and a `TEXT_ANGLE_INDICATOR` (concentric arcs) for rotating; `RoomNameOffsetState`,
  `RoomAreaOffsetState`, `RoomNameRotationState`, `RoomAreaRotationState` are the controller
  states, and undo names are `PlanController.undoRoomAreaOffsetName = "Move area"`,
  `undoRoomAreaRotationName = "Rotate area"` (OBSERVED bundle + `res/localization.json`).
  Round 1 noted the guide's "change the location of its area and of its name with the
  indicators drawn under texts" (DOCUMENTED, `docs/userGuide_stripped.txt` line 222).
- Room dialog UI (OBSERVED `evidence/tmpl_room-dialog-template.html` + `localization.json`):
  the only name/area controls are `Name:` text input and a `Display area` checkbox;
  title `Name and area`. **There is no font/size/colour control for a room's own name/area**
  in the dialog — those go through the global text-style actions on the selection (§2.4).
- Multiline: `paintText` splits the string on `\n` after stripping trailing newlines and
  draws the lines bottom-up, so **room names may contain newlines** and stack; the area
  string is always a single line. `getLineCount` (which ignores trailing newlines) is used
  only to size the drag/rotate **indicator**, not the text layout — the indicator call sites
  are the room name (`paintRoomNameOffsetIndicator`) and the furniture name. (OBSERVED code)

### 2.3 Label + TextStyle model and text style UI

(OBSERVED javadoc `docs/jdoc_Label.html`, `docs/jdoc_TextStyle.html`,
`docs/jdoc_TextStyle.Alignment.html`; bundle `paintLabels` @ ~2224343, `paintText` @
~2193142; `evidence/tmpl_label-dialog-template.html`; `res/localization.json`; XML in
`examples/*.sh3x`.)

**Label model** (a free text object placed by the "Add texts" tool, not tied to a room):

| Member | Notes |
| --- | --- |
| `text` | plain string, **newlines allowed** (painted per line) |
| `x`, `y` | plan coordinates in cm |
| `style` | `TextStyle`, nullable → falls back to `UserPreferences.getDefaultTextStyle(Label)` |
| `color` | nullable `Integer` ARGB; null → theme foreground |
| `outlineColor` | **nullable ARGB; when set, `paintText` draws a stroked halo behind the fill** |
| `angle` | radians, in-plan rotation |
| `elevation` | for 3D display |
| `pitch` | **nullable**; non-null is what makes a `Label` eligible for the 3D view |
| `level` | owning floor |

The `outlineColor` halo is worth calling out (OBSERVED `paintText`): when set, the code
builds `new BasicStroke(fontSize*0.05)`, derives a style at `fontSize − lineWidth` for the
halo, and additionally sets a thinner font for the fill so the outline does not eat the
glyphs — then draws stroke-then-fill per line. This is exactly the "readable over any
background" trick, and it is **only** available on free `Label`s, not on room name/area
(those pass `outlineColor = null` from `paintRoomsNameAndArea`). The `.sh3x` writer emits
`outlineColor` only when non-null (OBSERVED XML exporter). The Label dialog template
exposes no outline-colour control, and the 7.5.2 `LabelController` in the bundle has
`setColor` but **no** `setOutlineColor` (OBSERVED) — so the field is model/XML-level only in
this build (INFERRED: reachable via plug-ins or a later release). Only the *fill* colour is
editable, which matters because the halo would be the more useful control over a busy floor.

**3D labels take a completely different path** (OBSERVED `Label3D`/`Appearance3D` in the
bundle). A `Label` shown in 3D is rasterised once into a canvas texture at a **fixed
raster height of 50 px** (`m = 50`, inflated ×1.18 for non-Times/Serif/Helvetica families),
sized to the label's own aspect ratio, then mapped onto geometry scaled by
`h/(fontSize)` and `l/(fontSize)` and positioned by `pitch`/`elevation`. So 3D labels do not
inherit the plan's zoom behaviour at all — they have their own fixed-resolution raster
budget, and the same `\n`-splitting and LEFT/CENTER/RIGHT alignment logic appears a second
time. The practical lesson is the one CasaPlazAI wants: **separate the label renderer from
the plan-scale transform**.

**TextStyle** (immutable value object, `Serializable`, OBSERVED javadoc + runtime):
- fields: `fontName` (String, nullable), `fontSize` (float), `bold`, `italic`,
  `alignment` (`TextStyle.Alignment` = `LEFT=0, CENTER=1, RIGHT=2`; **default CENTER**).
- constructors: `(fontSize)`, `(fontSize, bold, italic)`, `(fontName, fontSize, bold,
  italic)`, `(fontName, fontSize, bold, italic, alignment)` — the 5-arg one is "Since 5.0".
- derived copies: `deriveStyle(float fontSize)`, `deriveStyle(String fontName)`,
  `deriveStyle(Alignment)`, `deriveBoldStyle(boolean)`, `deriveItalicStyle(boolean)`.
  Runtime check: `new TextStyle(24)` ⇒ size 24, not bold, not italic, font `null`,
  alignment `CENTER(1)`.
- Defaults (OBSERVED constants in `UserPreferences`): `DEFAULT_TEXT_STYLE = new TextStyle(18)`
  (labels, furniture names, dimension lengths) and
  `DEFAULT_ROOM_TEXT_STYLE = new TextStyle(24)` (room names **and** areas);
  `getDefaultTextStyle(Class)` picks the room one when `a.name == "Room"`.

**Where the style lives in the file format** (OBSERVED `examples/*.sh3x`, verbatim excerpts
of the shipped sample homes): styles are written as sibling elements, not attributes, and
*omitted* when equal to the default:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

`attribute` is the unique key (`nameStyle`, `areaStyle`, `lengthStyle`) and is absent for a
label's single style. Observed non-default sizes in the shipped examples: `nameStyle`
15.0/20.0/22.0, `areaStyle` 20.0/22.0, labels 30.0 — so real files routinely differ from the
18/24 defaults. The Kitchen room above is a good illustration of §2.2: `areaVisible='true'`
with a *non-zero* `nameYOffset` **and** `areaYOffset` — once a user drags one text, the
other stops being tidy.

**Label dialog UI** (OBSERVED template, i18n in `localization.json`):
- *Text and style* card: `Text:` textarea (4 rows), `Alignment:` (Left/Center/Right radio),
  `Font:` select, `Size (%s)` numeric, `Color:` colour button.
- *3D rendering* card (title `LabelPanel.rendering3DPanel.title`): `Visible in 3D view`
  checkbox, `Orientation:` Horizontal / Vertical radio (mapped to `pitch` 0 / 90°), and
  `Elevation (%s)` numeric.
- So per-instance font/size/colour/alignment/rotation are all reachable in the label dialog,
  unlike the room dialog which only offers name + "Display area".

### 2.4 How text stays readable at different zoom levels

This was the round-1 unknown. The answer from the code is simple and deliberate
(OBSERVED `PlanComponent.prototype.paintComponent` @ ~2177022, `paintText` @ ~2193142,
`getFont`/`getFontMetrics` @ ~2175193/2175901; runtime emulation in
`evidence/probe_api_output.txt`):

1. **One canvas transform scales everything, text included.** `paintComponent` does
   `b.translate(...); b.scale(scale × resolutionScale, scale × resolutionScale)` and then
   paints. `resolutionScale` is `PlanComponent.HIDPI_SCALE_FACTOR` (=2) when the plan is in a
   scroll pane and 1 otherwise; the *canvas backing store* is sized
   `clientWidth × resolutionScale` with a CSS size of `clientWidth`. So HiDPI is handled by
   a 2× backing-store transform, not by a larger font.
2. **Fonts are set in "plan px", i.e. cm-equivalent**: `getFont(font, style)` builds
   `"<style> <weight> <size>px <family>"` from `TextStyle.getFontSize()` directly, with no
   division by the plan scale and no clamp, and **memoises the result in a map keyed by the
   `TextStyle` instance** (`this.fonts`), so a given style string is computed once. Measured
   by intercepting the emulated `Graphics2D`: setting `font = "24px"` after
   `scale(2.0, 2.0)` yields an effective 48 px on the canvas.
3. Because the same `scale` multiplies both geometry and glyphs, **text keeps a constant
   size relative to the plan, not to the screen**. At high zoom the text grows with the
   room; at low zoom it shrinks below legibility. There is *no* minimum-font, no
   screen-space label rendering and no text-culling branch in the bundle
   (`grep` for a minimum-font clamp / `fontSize < …` returns 0 hits).
4. **Readability is the user's job, via two independent controls:**
   - **Plan zoom** (`Zoom in`/`Zoom out`, mouse wheel, ctrl+wheel): `PlanController`
     clamps `setScale` to `getMinimumScale() = 0.01` and `getMaximumScale() = 10` (OBSERVED
     bundle). The published `SCALE_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.PlanScale"`
     is where the current scale is stored as a visual property (OBSERVED).
   - **Text size actions** that write new `TextStyle`s into the **selected items**:
     `increaseTextSize()` = `applyFactorToTextSize(1.1)`, `decreaseTextSize()` =
     `applyFactorToTextSize(1/1.1)`; per object it does
     `deriveStyle(Math.round(fontSize × factor))`. For a `Room` this is applied to **both**
     `nameStyle` and `areaStyle`; for a `Label`/`HomePieceOfFurniture` to the single style;
     for a `DimensionLine` to `lengthStyle`. Bold/italic toggles similarly flip the state of
     the whole selection, and if a room's name and area disagree the toggle resolves to a
     tri-state default (OBSERVED code). Measured effects (OBSERVED runtime):
     24→26 (×1.1), 26→29, 18→20; 24→22 (÷1.1). Applying `Math.round(size × 1.1)` repeatedly
     from the 24 pt default gives 24, 26, 29, 32, 35, 38, 42, 46 — ~7 presses to roughly
     double, which is a sensible step size to copy.
   - Both the menu (`Plan ▸ Modify text style`) and the toolbar expose these four actions
     (`Increase size`, `Decrease size`, `Bold`, `Italic`; icons `format-text-*.svg`;
     OBSERVED `res/localization.json` `HomePane.*_TEXT_SIZE.*` and the toolbar builder in
     the bundle). Actions are enabled only for item classes that have a text style
     (`Room`, `Label`, `HomePieceOfFurniture`, `DimensionLine`).
5. **Alignment is anchored to the text's own origin**, not the bounding box: `paintText`
   computes `q = 0 / −width / −width/2` per line for LEFT/RIGHT/CENTER and translates by
   `q` before drawing, then `−getHeight()` per line to stack downward. `getTextBounds`
   uses the same rule, so hit-testing matches what is drawn: `isItemTextAt` converts the
   pointer to model cm, asks the view for `getTextBounds`, and intersects the text polygon
   with a small box of `± selectionMargin/2` (the call passes `L`, defined as
   `getSelectionMargin()/2`; `PlanController.PIXEL_MARGIN` is a separate 4-cm constant used
   for other snapping). So on-screen click targets for room/label text agree with the
   rendered text — no "ghost text" hit area. (OBSERVED)
6. **Print/SVG do not change the text policy.** `getStrokeWidth` halves wall/room stroke
   widths for `PaintMode.PRINT` (and `paintRooms` uses black outlines in print), but the
   font path is shared, so text keeps its plan-relative size. The JS browser build's
   `getPrintPreferredScale` simply returns 1 (OBSERVED `sweethome3d.min.js` ~2177836),
   while the desktop `PlanComponent` javadoc documents it as "the preferred scale to ensure
   [the plan] can be fully printed on the given print zone" (DOCUMENTED) — i.e. the desktop
   print path can shrink the whole plan to fit, but that scales text and geometry together.
   Print scale is a page-setup choice (`Best fit scale` / `Scale: 1 / <n>` per
   `res/localization.json`), not a text-scaling mechanism. (OBSERVED / DOCUMENTED)
7. **Practical consequence** (INFERRED from 1–6): zooming out to fit a whole floor makes
   every annotation shrink proportionally; Sweet Home 3D's answer is to keep them legible
   by *enlarging the style once* (global action) or by keeping zoom high. There is no
   "labels stay screen-sized" mode. This is a genuine, exploitable weakness versus a modern
   web planner.

### 2.5 Live verification in the browser edition (this round's new evidence)

Round 1 could not drive the live page. I found the failure was a **schema mistake, not a
provider limitation**: the older file
(`/opt/homebrew/lib/node_modules/rea-agents/dist/domain/browserScenarioValues.js` is not the
authoritative one — `dist/domain/browserScenario.js` is) requires
`browser.executable_path`, a `step_id` per action, `duration_ms` (not `timeout_ms`) and
`capture.at_end` as an **array** of snapshot kinds. With the correct shape, and Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, the live editor drove
successfully. Evidence: `live/scen3.json`, `live/scen_zoom2.json`,
`live/live_session_transcript.json`, `live/artifacts/*.png`, `live/artifacts/*_dom.html`.

What the live run confirms (**OBSERVED**):

- **Bundle and version**: the page loads the same `libjs/*.min.js?version=7.5.2` files I
  statically analysed, so the Node-bundle findings describe this deployment. The live
  toolbar (populated only once a home is open) contains buttons with ids
  `toolbar-button-INCREASE_TEXT_SIZE`, `…-DECREASE_TEXT_SIZE`, `…-TOGGLE_BOLD_STYLE`,
  `…-TOGGLE_ITALIC_STYLE`, plus `…-ZOOM_IN` / `…-ZOOM_OUT` — exactly the actions §2.4
  derives from the bundle (29 toolbar buttons in total).
- **The enablement rule is visible in the DOM**: in the settled Studio state the four text
  buttons carry `disabled=""` (title *"Increase the size of selected texts"* etc.), while
  `ZOOM_OUT` does not. That is the live counterpart of §2.4 point 4 — the text actions are
  selection-dependent, so with nothing selected there is no per-item text style to scale.
  This also explains why my first attempted text-size run was abortive: clicking a disabled
  button does nothing, so the plan never changed.
- **The action titles are verbatim UI strings**: `title="Increase the size of selected
  texts"`, `"Decrease the size of selected texts"`, `"Toggle bold style in selected texts"`,
  `"Zoom out"` — consistent with the `HomePane.*` keys in `res/localization.json`.
- **The plan is a scaled canvas with a 2× backing store**: after choosing the *Studio* demo
  the DOM shows
  `<canvas id="home-plan.canvas" width="2592" style="width: 1296px; height: 458px; …font: 14px sans-serif…">`
  — i.e. CSS size 1296×458 with a 2592×916 backing store. The ratio is 2.0 at both
  `device_scale_factor` 1 and 2 (I ran both), which matches `HIDPI_SCALE_FACTOR = 2`
  unconditionally when the plan has a scroll pane — **not** the display's DPR. This is a
  concrete, checkable number for §2.4 point 1.
- **The live Room dialog is exactly the template I read**: the DOM carries
  `… name="name-input" … name="area-visible-checkbox"` inside
  `data-name="name-and-area-panel"` under the heading `@{RoomPanel.nameAndAreaPanel.title}`,
  with **no** font/size/offset/angle control — confirming §2.2 from the live app rather than
  from a saved template.
- **Zoom changes the rendering but not the glyph size in the plan pane**: clicking
  `ZOOM_OUT` three times produced materially different screenshots (`live/artifacts/z_4…z_9`,
  pairwise plan-band pixel deltas ~9–20 M), while the distribution of glyph-component
  heights stayed at a **median of 6 px with p90 12 px** before and after. That is the live
  confirmation of the central claim: zooming changes *how much plan* is visible, not the
  text's size relative to the plan. (Caveat: headless Chrome's screenshot layout is 1×, so
  these are CSS-pixel measurements of the 2×-backed canvas downscaled to CSS size.)
- **Storage is fully hashed and includes pseudo-identifiers** (`user_pseudo_id`, an
  `ip_address` session key, analytics cookies). I stopped that capture at once, deleted the
  raw file, and did not analyse it; the JSON I keep (`live_session_transcript.json`) contains
  only URLs, step metadata and screenshot byte counts.

### 2.6 Round-1 "Unknowns" closed for this question

Round 1's reports did not have a literal "Unknowns" heading, but the open ends they left that
touch my question were: the exact area algorithm/branch, the area unit strings, the
missing-perimeter claim, the zoom-compensation mechanism, and *any* live observation of the
browser edition. All five are now closed with static, runtime **and live** evidence (the live
part in §2.5). Round 1's separate unknowns (Levels API, SVG export internals, staircases) are
outside my question and untouched. Still open for me: the exact predicate behind the `.sh3x`
`TotalArea` property, and `outlineColor` reachability in a newer Label dialog (§4).

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each cites the finding it comes from and, where relevant, the
CasaPlazAI schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

1. **Compute perimeter as a derived, per-room readout — do not store it.** *(F2.1 "no
   perimeter"; high value, low effort.)* SH3D's gap is real and cheap to beat. `Room.polygon`
   is CCW and non-repeating, so perimeter = `Σ |p[i+1] − p[i]|` over `mod n`; exposed in the
   inspector next to a live area. Keep it **out** of `FloorplanData` (like snap settings and
   the underlay) so the editor→viewer contract stays frozen, or add it only under a new
   editor-local key. Zero schema change.
2. **One default per field, shared by the factory and the parser.** *(F2.2
   `areaVisible` footgun; high value, very low effort.)* In SH3D `new Room(points)` starts
   with `areaVisible = true`, but the XML reader sets it to `"true" === attrs["areaVisible"]`,
   so a file with the attribute absent deserialises to `false`. Round-trips happen to work
   only because the writer always emits the attribute when true. CasaPlazAI already funnels
   every payload through `validate.ts`/`migrate.ts` — keep it that way by deriving parser
   defaults from the same exported constant the editor uses (e.g. a `DEFAULT_ROOM` or
   `emptyFloorplan()` builder), so a missing optional field can never mean two things.
3. **Derived `area`, `perimeter` and `centroid` computed once per room, cached on the
   polygon's array identity.** *(F2.1 "areaCache" + POINTS-invalidation listener.)* SH3D
   caches on `POINTS` changes and clears caches on every room mutation. In CasaPlazAI the
   editor already owns polygons; a `useMemo`-style cache keyed by the polygon reference (and
   invalidated on drag) gives free live readouts and lets the label layer reuse them. Store
   in the schema? No — derived. This is a pure editor concern.
4. **Screen-space labels with a constant on-screen size, with plan-anchored position.**
   *(F2.4, the direct counter to SH3D's weakness; high value, medium effort.)* SH3D scales
   glyphs with the plan because it paints into one scaled canvas. CasaPlazAI's 2D view can
   render room name/area/labels in a separate, unscaled overlay (or divide the font size by
   zoom) so a whole-floor view stays readable. Keep the anchor in world metres (per
   `Room.polygon` + a text offset in metres) and apply the inverse zoom only to the glyphs.
   F2.3 supplies a second precedent for the same separation: SH3D's 3D labels are rasterised
   into a fixed 50 px texture and then transformed, so they are already decoupled from the
   plan-scale transform — the 2D overlay is the equivalent move. This is the single most
   valuable UX differentiator found in this round.
5. **Per-room area visibility plus a name/area offset and rotation, defaulting to a stacked
   pair.** *(F2.2; medium value, low effort.)* Mirror SH3D's proven arrangement: area at the
   room centre, name 40 cm above it, each independently draggable/rotatable. In the schema
   this is editor-local annotation state (like the measurement annotations already persisted
   separately), or new optional `Room` fields if it must reach the 3D viewer; either way it
   is additive.
6. **Adopt a real `TextStyle` value object (font, size, bold, italic, alignment) with
   defaults of 18 for notes and 24 for room name/area.** *(F2.3; medium value, low effort.)*
   SH3D's constants and `deriveStyle` variants are a clean, testable model. In CasaPlazAI
   this is one discriminated-union-free interface, stored in the editor-local annotation
   key; the frozen `FloorplanData` is untouched unless the 3D walk-through must show labels.
7. **Global "Increase / Decrease size" and Bold/Italic actions applied to the current
   selection, with a ×1.1 step.** *(F2.4; medium value, very low effort.)* SH3D's behaviour
   is exactly `deriveStyle(Math.round(size × 1.1))`; it beats per-object dialogs for bulk
   annotation work and is trivially undoable. Round the result to an integer to match the
   observed sequence (24→26→29→32…).
8. **Outline (halo) colour on labels for readability over the blueprint underlay.**
   *(F2.3 `outlineColor` + `paintText` halo; high value **for CasaPlazAI specifically**
   because of the traced-blueprint feature, medium effort.)* SH3D's halo = stroke with
   `lineWidth = fontSize × 0.05`, draw stroke-then-fill, and shrink the fill font by the
   stroke width so glyphs keep their weight. Implement that on the overlay text layer so
   labels stay legible over a dark or busy underlay. Pure editor-local annotation styling.
9. **Format area with a single `Intl`-backed formatter and no stored text.**
   *(F2.1 formatting; low value, very low effort.)* SH3D hard-codes metric=m²/imperial=sq ft
   and 4-decimal cm precision with grouping. CasaPlazAI is metres-only per the schema, so
   `new Intl.NumberFormat(locale, {maximumFractionDigits: 2}) + " m²"` reproduces the
   observed `"12.34 m²"` while being locale-correct for free. Never store the formatted
   string; it changes with locale.
10. **Do not add a bow-tie/self-intersecting area branch.** *(F2.1 non-singular branch +
   CasaPlazAI `non-ccw-polygon` validation; low value, negative effort.)* The schema already
   rejects non-CCW and degenerate polygons with `non-ccw-polygon`/`too-few-vertices`, so the
   multi-sub-path `Area` walk SH3D needs is unnecessary. Document that the shoelace over the
   validated CCW polygon is sufficient and skip the `java.awt.geom.Area` emulation entirely.
11. **Keep the 3D walk-through's labels opt-in and elevation/pitch aware, but as a texture,
    not geometry.** *(F2.3 Label `pitch`/`elevation`/`visibleIn3D`; low value now, medium
    effort.)* SH3D gates 3D labels on `getPitch() != null` and `visibleIn3D`. If CasaPlazAI
    later shows labels in 3D, render them as a camera-facing sprite/texture so they never
    scale with distance the way SH3D's plan text scales with zoom.

## 4. Unknowns

- **`TotalArea` predicate, and whether it is user-visible** — narrowed but not closed. In
  `2BedroomHouseWithBasement.sh3x` the stored 100.8068 m² equals the sum of the 10 rooms
  other than `Terrace`, `Garage` and the one `floorVisible='false'` room, and that subset is
  the unique one within 1 cm² of the target. What I could *not* determine is the intended
  rule (candidate predicates give 113.96 m² / 88.87 m², so they are wrong) nor whether the
  desktop UI ever shows this number; no `getTotalArea()` exists in the model package, so it
  is computed in the export/preferences layer, which I did not trace. One file is not enough
  to generalise. Adjacent to my question, not central.
- **Bow-tie behaviour on desktop Java** — the JS bundle throws inside its emulated
  `java.awt.geom.Area` path for the self-intersecting polygon I fed it; real Java's `Area`
  would return a value. I could not run the desktop app (no installer downloads allowed),
  so the non-singular branch is verified by reading, not by executing Java.
- **`outlineColor` reachability in the UI** — the model and the `.sh3x` writer support it
  and `paintText` renders the halo, but the Label dialog template I read exposes no
  outline-colour control in 7.5.2. Whether a menu action or a newer release adds one is
  unverified.
- **Font-family list and metric fallback** — the `Font:` select's contents are built at
  runtime (the template ships an empty `<select>`), and `FontMetrics.compute` falls back to
  an approximation when `measureText` lacks `fontBoundingBoxAscent`. I did not enumerate the
  offered families.
- **No `evaluate` action exists, so JS cannot be invoked directly.** The scenario schema
  (authoritative copy: `dist/domain/browserScenario.js` + `dist/domain/browserScenarioValues.js`)
  supports `goto/click/fill/press/select_option/check/uncheck/wait_for/wait_for_timeout/request`
  and snapshot kinds `screenshot/dom/accessibility/url/history/storage` — but no arbitrary
  script evaluation, and the `browser` object has only `mode`/`executable_path`/`headless`
  for launch. So I could not, in the live page, call an internal API or read a computed style
  from JS; every live conclusion in §2.5 comes from DOM text, element attributes and
  screenshot pixels. My *deeper* model facts still come from running the vendor bundle under
  Node (`tools/probe_api.js`, `evidence/probe_api_output.txt`), which is deterministic but is
  a stubbed DOM, not the real page.
- **Glyph-height measurement is approximate.** The live zoom test (§2.5) compares connected
  components in screenshots; median glyph height stayed at 6 px across three zoom-out
  clicks, but small anti-aliased glyphs and the 1× headless screenshot layout limit the
  precision. The *qualitative* result (text size does not change with zoom) is solid because
  the scaled-canvas mechanism is read directly in the code; the exact pixel figures are not.
- **Desktop-only behaviour unverified.** Everything here is the 7.5.2 Java core as shipped
  in the browser edition. I did not run the desktop app (no installer downloads allowed), so
  desktop-specific paths — `getPrintPreferredScale(Graphics, PageFormat)` fit-to-page,
  Swing `FontMetrics`, `InchFractionFormat` rendering — are DOCUMENTED or read from the
  shared Java code, not executed. Round 1's own live capture had failed with
  `Scenario navigation failed before the initial state was captured`; that is fixed here.
