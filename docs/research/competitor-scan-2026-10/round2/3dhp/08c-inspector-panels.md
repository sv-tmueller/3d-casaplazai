# 3D House Planner — inspector / properties-panel patterns per selection type

Round 2 competitor research for **CasaPlazAI** (single-workspace UI redesign: Plan / 3D / Walk modes,
tool card, inspector). Job folder: `01-08c-ui-layout-onboarding-inspect`.
Question: **How does 3D House Planner's inspector behave per selection type — wall, room/floor,
opening (door/window), object, level — and what fields, grouping and live-vs-apply editing does it offer?**

Round-1 report (read first, not redone): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/08-08-ui-layout-onboarding/report.md`.
Round 1's §4 listed **"Property panels not exercised live"** as an unknown; that gap is what this round closes.

**Method.** Live runs of the editor in headless Chromium 1243 with **software WebGL**
(`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; Babylon.js reported
`v6.38.0 - WebGL2`, so round 1's "no WebGL" blocker is solved). I drove the page through its own exposed
JS APIs (`HP3D.buildWall`, `HP3D.buildSlab`, `HP3D.placeOpening`, `HP3D.select`, `HPBIM.elementInfo`,
`HPBIM.openPanel`, `HPUI.*`) and read back DOM, live JavaScript objects and computed styles — synthetic
canvas clicks are still unreliable, so I used the APIs. Static reading of the read-only round-1 copies of
`js/editor_hp-panels.js`, `js/editor_hp-editor.js`, `js/editor_hp-ui.js`, `css/hp-panels.css`,
`css/hp-ui.css` and `rea/i18n-app.json` complemented the live work. Scripts and JSON evidence are in
`rea/`; **screenshots were again not inspected** (no image input) — everything below is DOM/JS/CSS text.

**Evidence tags:** `OBSERVED` (live capture or shipped file I read), `DOCUMENTED` (vendor docs URL),
`INFERRED` (my reasoning).

---

## 1. Summary (5 bullets)

- **There is no single per-selection inspector. There are two, used at different depths.** The everyday
  one is a *floating, read-mostly card* anchored bottom-right (`#hpMaterialPanel`, 264 px, `.hp-fcard.hp-mat`)
  plus a *contextual action bar* (`.hp-selbar`, bottom-left) and a *one-line readout* in the status bar;
  a much deeper *BIM dock panel* (`#hpBimPanel`, 440 px, 10 tabs) carries the real field-per-type
  property forms. (`OBSERVED` §2.1–2.4)
- **Selection type is expressed mostly by the status readout and the action set, not by different
  panels.** The status line is `Kind · Name · W × D × H · Level n` and is built from a width/depth/height
  triple per element (`Wall · 6.00 × 0.20 × 2.65 m · Level 0`, `Floor slab · Floor slab 1 · 6.00 × 4.00 × 0.10 m`,
  `Door · Red mahogany panel door · 0.90 × 0.20 × 2.10 m`). (`OBSERVED` §2.2)
- **The BIM "Properties" tab is a single scroll page with a fixed section grammar**: Name / IFC class /
  Predefined type / Phase → identity key–values (Level, Material, GlobalId) → Type → a *type-specific*
  block → Classification → Quantities → a second type-specific block (skirting/ceiling trim) → Cost →
  Property sets → Notes → actions. Walls, slabs/rooms and doors share the grammar; only the middle blocks
  change. (`OBSERVED` §2.3)
- **Editing is live (commit-on-change), not apply-on-confirm** for text/number/select/checkbox fields:
  renaming a wall to `ProbeWallX` updated `HPBIM.elementInfo` immediately, with no Apply button anywhere in
  the inspector (the only Apply-family button in the whole DOM belonged to an unrelated AI-terrain
  dialog). The floating material card's own commit path could not be confirmed because the card stayed
  hidden. (`OBSERVED` §2.5)
- **Levels are not selected objects.** A level is managed by the top-bar stepper (`.hp-level`, `− 0 +`)
  and by the "Floors & grid" dock card (`Visible floors`, `Current floor`, `Snap to grid`, `Wall height`,
  `Wall thickness`); per-element level is read-only (`Level 0` key–value) except through IFC re-class /
  move operations. (`OBSERVED` §2.6)

## 2. Findings

### 2.1 Panel inventory — what exists, and which is the "inspector"

Several distinct surfaces respond to a selection (`OBSERVED` live DOM + `js/editor_hp-editor.js`):

| Surface | Selector / element | Placement | Role |
|---|---|---|---|
| Selection action bar | `.hp-selbar` → `.hp-selbar-btn` ×9 | fixed, bottom-left, above status bar | verbs only: Move, Rotate, Scale, Curve, Copy, Focus, Properties, Ask AI, Delete, clear |
| Curve popover | `.hp-curvepop` | fixed, above the selbar | wall mode, mirror ↔/↕, array + spacing (opened by `Curve`) |
| Status readout | `.hp-status-sel` inside `footer.hp-statusbar` | fixed bottom bar | one-line identity string, toggles `.hp-has-sel` |
| Material card | `#hpMaterialPanel` (`section.hp-fcard.hp-mat`) | fixed right, 264 px, above status bar | appearance: material + texture + colour + PBR sliders |
| BIM panel | `#hpBimPanel` (`aside.hp-panel`, `--hp-panel-w:440px`) | fixed right dock (a `.hp-panel`) | the real form: 10 tabs incl. **Properties** |
| Wall height card | `HPPanels.gui.heightPanel` (`#hpHeightPanel`) | dock card | drag-time height editing for walls/frames |
| Position chip | `HPPanels.gui.positionPanel` (`.hp-position-readout`) | floating chip | x/y/z while dragging |

`HP3D.gui` exposes exactly seven runtime GUI panels — `texture, levelPanel, materialPanel, copyPanel,
positionPanel, heightPanel, measureBox` (`OBSERVED`, live `Object.keys(HP3D.gui)`). Wall, opening, object
and room selections therefore do **not** each get their own panel; they share these. (`INFERRED`)

**Selection drives visibility by CSS `:has()`.** `css/hp-ui.css` contains
`.hp-modern-body:has(.hp-mat:not(.hp-hidden)) .hp-selbar { max-width: calc(100vw - 312px); }` — i.e. the
product's own stylesheet treats the material card as *the* panel that appears with a selection, and
re-flows the action bar around it (and around `#hpBimPanel` when `.hp-panel-open`). The selbar itself is
hidden with `opacity:0; visibility:hidden` and revealed by `.hp-visible`; at ≤1100 px the button labels are
dropped and only the icons remain, and at ≤700 px the card is taken out of the width calculation.
(`OBSERVED`, `css/hp-ui.css`)

**Round-1 correction.** Round 1 (§2.4) described the properties area as built by `hp-panels.js`. Live
observation shows `hp-panels.js` only supplies the *floating cards* (`HPPanels.createEditorGui`) plus an
`Observable`; the material card is present in the initial document rather than created on selection, and
the deep forms live in `hp-bim.js`. (`OBSERVED`)

### 2.2 The action bar is the same for every type

Measured live for **wall, slab and door** — identical 10 buttons, identical order and titles
(`OBSERVED`, `rea/live-panels2.json`):

`Move (1)` · `Rotate (2)` · `Scale (3)` *(shown active)* · `Curve` · `Copy element (Ctrl+D)` ·
`Focus (F)` · `Properties` · `Ask AI` · `Delete (Del)` · `Clear selection (Esc)`.

The bar's own markup carries no `data-i18n`, only `title`/`aria-label`, and each button is
`<i class="material-icons">…</i><span>Label</span>`. The `Curve` button is wall-shaped but is also
rendered for a slab and a door — the type gating happens in JS, not in the markup. (`OBSERVED`)

The status readout **is** type-aware (`OBSERVED`):

```
Wall       → ads_click | Wall · 6.00 × 0.20 × 2.65 m · Level 0
Floor slab → ads_click | Floor slab · Floor slab 1 · 6.00 × 4.00 × 0.10 m · Level 0
Door       → ads_click | Door · Red mahogany panel door · 0.90 × 0.20 × 2.10 m · Level 0
(empty)    → ads_click | Nothing selected
```

### 2.3 The BIM "Properties" tab — the actual per-type field forms

Entry: `#hpBimPanel` opens via `HPBIM.openPanel()`; its `.hp-tabs` are **Model, Properties, Types,
Quantities, Schedules, Check, Codes, Efficiency, Project, Projects** (`OBSERVED`, `rea/live-panels2.json`).
The Model tab is a tree — `Untitled project → Site → Building → Level 0` → IFC class groups
(`IfcDoor (3)`, `IfcSlab (1)`, `IfcWall (6)`, `IfcWindow (2)`) → item buttons with `data-act="select"` and
`data-uid`, per-class hide buttons, a Bulk block, and filters for class/level/phase plus a free-text
search; the hint is "Ctrl / ⌘ + click or Shift + click to select several elements." (`OBSERVED`)

**Shared top block** (all types): `Name` text field; `IFC class` select (~35 IFC classes: IfcWall,
IfcDoor, IfcWindow, IfcSlab, IfcRoof, IfcStair, IfcFurniture, IfcSpace, …); `Predefined type` select
(e.g. wall: STANDARD / SOLIDWALL / PARTITIONING / PARAPET / POLYGONAL / USERDEFINED …); `Phase` select
(New / Existing / To demolish / Temporary); then **read-only key–value rows** `Level`, `Material`
(a hex string, e.g. `#FFFFFF`), `GlobalId`. (`OBSERVED`)

**Per-type field sets** (`OBSERVED`, `rea/live-typeprops.json`; section titles in caps):

**Wall** — `TYPE` (`Type` select: (no type) / "Masonry 14 cm + plaster (18 cm)" / "Drywall 9.5 cm (9.5 cm)"),
`CLASSIFICATION` (system select NBR 15965 / Uniclass 2015 / OmniClass + code + name + add), `QUANTITIES`
(`Length 6.15 m`, `Height 2.65 m`, `Width 0.2 m`, `Gross side area 16.3 m²`, `Net side area 14.41 m²`,
`Net volume 2.88 m³`), then a wall-only **`SKIRTING BOARD`** block (`Height (cm)`, `Thickness (cm)`,
`Color`, `Both faces / Face A / Face B` select, `Add`) with an empty state "No skirting board on this
wall.", `COST` (`Unit price ($/m²)`), `PROPERTY SETS` (`Pset_WallCommon` with `IsExternal`,
`LoadBearing`, `FireRating`, `AcousticRating`, plus an editable `HP_Properties` set), `Notes` textarea,
then `Zoom` / `Delete`.

**Floor slab / room** — the same head, then `ROOM` (a room-identity block: `Number`, `Room name`, `Use`,
`Ceiling height (m)`, an `External` switch, and a `hp-grid3` of `Floor finish`, `Wall finish`,
`Ceiling finish`), `CLASSIFICATION`, `QUANTITIES` (`Area 24 m²`, `Perimeter 20 m`, `Depth 0.1 m`,
`Volume 2.4 m³`), then a room-only **`CEILING (CROWN MOULDING / COVE)`** block (`Type`: Crown moulding /
Cove (closed) / Open cove with LED, `Projection (cm)`, `Height on the wall (cm)`, `Color`), `COST`,
`PROPERTY SETS` (`Pset_SlabCommon`), `Notes`. Room naming/use vocabulary comes from the app's own room
catalogue (`bim.roomName`, `bim.roomUse`, `norms.room.*`: Living room, Kitchen, Bathroom, Corridor,
Garage, …). (`OBSERVED`)

**Door** — head, then `OPENING` (`Sill height (m)` number, `Swing` select: — / Left / Right / Double /
Sliding / Fixed / Pivot, `Operation (IFC)` select with the full IFC enumeration SINGLE_SWING_LEFT …
REVOLVING / ROLLINGUP), `CLASSIFICATION`, `QUANTITIES` (`Width 0.9 m`, `Height 2.1 m`, `Area 1.89 m²`),
`COST` (`Unit price ($/un)`), `PROPERTY SETS` (`Pset_DoorCommon`: `IsExternal`, `FireRating`,
`SecurityRating`), `Notes`. Windows resolve to the same `IfcWindow` form. (`OBSERVED`)

**Object / furniture** — I could not create one (`HP3D.placeObject` failed to resolve a model), so this row
is the weakest. The candidate everyday inspector for an object is the `.hp-mat` floating material card
(material, colour, PBR, texture); inside the BIM panel an object enters through the Model tree as
`IfcFurniture` (I saw the class filter option but created no instance) with the IFC/phase/psets grammar
above. Whether the card is gated specifically to `kind.object` is **unverified** — see §4. (`INFERRED`)

### 2.4 The floating material card — appearance, not identity

`#hpMaterialPanel` (`section.hp-fcard.hp-mat.hp-hidden`, `OBSERVED` full markup, `rea/live-panels2.json`)
is one long scroll body:

- header `palette | Material | ⌄` (collapse toggles `.hp-collapsed`),
- a segmented **Standard / PBR** radio group,
- `Color` → 16 preset swatch buttons + a native `<input type=color>` + a hex text input (`maxlength=7`),
- range+number pairs (`hp-range` + `.hp-range-number`): **U scale** (0.05–10, step 0.05), **V scale**
  (same), **Texture angle** (0–2π, step any), **Metallic** (0–1), **Roughness** (0–1), a **Glass**
  switch, **Refraction index** (1–1.7), **Transparency** (0.1–1), **Emissive** switch with an inline
  number,
- two actions: `Textures` (library) and `AI texture` (`data-hp-open="modalAiTexture"`).

Every numeric control is a paired **range + number input** whose label is rendered *with its current
value in the label text*, e.g. `Visible floors: up to 50`, `Snap to grid: 0.125 m`, `Wall height: 2.65 m`.
`HPUI.range({label,min,max,step,decimals})` builds exactly this and auto-derives decimals from the step;
`HPUI.enhanceRange` then patches the `HTMLInputElement.value` setter on range inputs so that *any*
programmatic write repaints the CSS fill (`--hp-fill`). (`OBSERVED` source + DOM)

**Reaching the card is not obvious — a notable negative result.** Across wall, slab and door selections,
clicking the selbar `Properties` button, and clicking `every` material/texture/brush/colour control in the
tool card (all three tabs), `#hpMaterialPanel` kept its `hp-hidden` class in every run
(`OBSERVED`, `rea/live-mat.json`). The tool-card "material" controls turned out to belong to terrain
painting and the ceiling-trim LED (`Material brush`, `Terrain painter`, `Change texture` on
`.terraintextureforpaint` swatches, `LED colour`). So in the UI I could reach, **wall/slab/door appearance
has no visible entry point** — the card is plausibly gated to furniture (`kind.object`) or to a
double-click/context gesture on the canvas that synthetic events could not reproduce. (`OBSERVED` +
`INFERRED`)

### 2.5 Live vs apply editing — the answer is "live"

`OBSERVED`, `rea/live-live.json`:

- Renaming a selected wall in the BIM Properties tab (`Name` → `ProbeWallX`) changed
  `HPBIM.elementInfo(wall).name` from `Wall 1` to `ProbeWallX` on the `change` event, with
  `HPBIM.changeSeq` advancing **5 → 6**. The Babylon mesh name stayed `wall_merged`, i.e. the label is
  BIM metadata, not the mesh name.
- The `IsExternal` checkbox under `Pset_WallCommon` is wired to a pset value; my click did not flip the
  underlying JSON in that run, so the exact write path for psets is only partly observed.
- There is **no Apply / Save / Update / Done button** anywhere in the 3D inspector. The only Apply-family
  button found in the whole document was `Apply to terrain` (an AI-terrain dialog, and it was `.disabled`).
- **Material card edits were NOT confirmed as live**, because the card never became visible in my runs
  (`hp-hidden` stayed on, `hexBefore` was empty and the colour input was therefore never found). Driving
  its `range`/`colour` elements only changed the DOM value, not the material. See §4.
- Undo is not a user-visible stack in the inspector: `HPBIM.canUndo()` returned `null` while
  `HPBIM.undoData()` returned `[]` before any user-level commit; the undo/redo **buttons** live in the
  `#hpBimPanel` header (`data-undo="undo"` / `data-undo="redo"`, both `disabled` when the stack is empty)
  and are the only persistent undo affordance seen in the 3D editor.

`INFERRED`: the pattern is **optimistic local commit + autosave + undo**, i.e. every field is its own
transaction, which is why no dirty/OK/Cancel triad appears. Round 1's open question "whether the 3D
editor ever renders undo buttons after an edit" is answered: yes — but only inside the BIM panel header.

### 2.6 Level handling

- Top bar centre: `.hp-level` = `Level` label + `−` button (`.hp-level-down`) + `.hp-level-value` +
  `+` button (`.hp-level-up`), title "Current level: new walls, floors and objects go here". Clicking `+`
  changed the rendered `.hp-level-value` from `0` to `1`, and `−` returned it; the level stepper is the
  only level-selection affordance. (`OBSERVED`, `rea/live-misc.json`)
- The level API is exposed as **functions, not properties**: `HP3D.currentLevel()` reads the active level
  and `HP3D.setLevel(n)` writes it, clamping to `0…50` (`Math.max(0, Math.min(50, Math.round(n)))`);
  `HP3D.floorHeight()` is the per-level height getter. (A plain `HP3D.currentLevel` read is a function
  object, which is why early JSON dumps dropped it.) (`OBSERVED` source + API surface)
- Left dock card **`#hpLevelPanel` "Floors & grid"** holds `Visible floors: up to 50` (range 1–50) and
  `Snap to grid: 0.125 m` (range 2–16, read as index 8) permanently, while `Current floor: 0`,
  `Wall height: 2.65 m`, `Wall thickness: 0.20 m`, `Terrain radius`, `Terrain strength`, `Brush radius`,
  `Brush strength` live in the same card but `.hp-hidden` until the matching tool is active. (`OBSERVED`)
- The dock card footer injects the `Duplicate level…` button (`copy.level.title`) and the level-rename
  control; level names are edited in the BIM panel (`data-act="renamelevel"`) or via `HPBIM.setLevelName`.
  (`OBSERVED` + i18n)

### 2.7 Grouping, disclosure and control-vocabulary patterns

- Card grammar: `.hp-fcard-head` (icon + title + collapse caret) → `.hp-fcard-body`; empty states use
  `data-hint` rendered as a CSS `::before` on `.hp-fcard-empty`. (`OBSERVED` CSS + `#hpCopyPanel` markup)
- The BIM form uses repeated `.hp-section-title` headers (icon + CAPS text), `.hp-kv` label/value rows,
  `.hp-field` label+control, and layout helpers `hp-grid2` / `hp-grid3` / `hp-row`. (`OBSERVED`)
- The **Properties** tab is a single long scroll (measured `scrollHeight` ≈ 2× client height), so the
  inspector relies on section titles rather than tabs-within-tabs. (`OBSERVED`)
- Read-only facts (Level, Material, GlobalId, all quantities) are rendered as `key: value` **text**, while
  editable facts are real inputs — a deliberate read/edit visual split. (`INFERRED` from markup)

### 2.8 No-selection state

`OBSERVED` (`rea/live-misc.json`): with nothing selected the status bar reads `Nothing selected`, the
action bar is hidden by `visibility` (no `.hp-visible` class; its computed rects are non-zero, so my first
`getClientRects()` check mis-read it — the CSS is the authority), `#hpMaterialPanel` keeps `hp-hidden`, and
`#hpBimPanel` reverts to plain `hp-panel` (closed). Multi-selection: the selection API
accepts an array, the tree hint advertises Ctrl/⌘+click and Shift+click, and `bim.selectedN`
(`{n} elements selected`) plus `bim.clearSel` exist — but the action bar markup does not change between
one and many, so the N-selection inspector is a JS-driven variant. (`OBSERVED` + `INFERRED`)

### 2.9 2D planner inspector, for contrast

The 2D planner is embedded as `#floorplanIframe` (`https://www.3dhouseplanner.com/2D-Planner/index.php?lang=en`)
and uses a *different, modal-style* inspector idiom (`OBSERVED`, round-1 `rea/2dplanner.html`):

- Panels are `div.extension-floorplanner-leftBox.fp-panel` with `.fp-panel-head` title + `.fp-panel-close`,
  `.fp-panel-body`, `.fp-panel-foot`, e.g. *"Modify the wall"* (`#extension-floorplanner-wallTools`) and
  *"Modify object"* (`#extension-floorplanner-objBoundingBoxScale`).
- Controls are `.fp-field` → `.fp-label` + `.fp-range-row` = `input[type=range]` **plus** `input[type=number]`
  plus a `.fp-num-unit` unit span, with `.fp-minmax` showing the slider bounds — the same range+number
  pairing as the 3D material card, but the value is *not* repeated inside the label.
- Wall panel fields: `Thickness`, `Curve` (bulge) with a live `Curve: "Straight wall"` hint and a
  `Straighten` button, then action buttons `Paste door / window`, `Cut`, invisible-wall toggle.
  Object panel fields: `Width`, `Height`, rotation, steps-in-array, plus a trash action.
- Settings panels end with an explicit **`Done`** footer button (`#extension-floorplanner-applySettings`,
  `onclick="close_floorplanner_settings()"`) — i.e. the 2D planner *does* use apply-on-close for its
  settings sheet, unlike the 3D inspector. (`OBSERVED`)

### 2.10 Round-2 corrections / additions to round 1

- **WebGL works headless** with SwiftShader; round 1's "3D never rendered" blocker is environmental.
  (`OBSERVED`)
- The "properties area built at runtime by `hp-panels.js`" claim is only half true: the floating cards are
  shipped in the initial DOM / built by `HPPanels.createEditorGui`, while the deep forms are `hp-bim.js`.
  (`OBSERVED`)
- Undo/redo *is* surfaced as header buttons — inside `#hpBimPanel`. (`OBSERVED`)
- The 2D planner is **embedded in an iframe** in the same workspace (round 1 inferred "separate
  navigation"). (`OBSERVED`)

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each ties to a finding and, where relevant, to the CasaPlazAI schema
(`~/dsh-workspaces/rea2-shared/casaplazai-schema.md` — read-only; it defines the plan document
with rooms/walls/openings/objects per floor, 0.5 m grid, shared walls).

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Make the inspector a single scroll column with the section grammar** `Identity → Geometry → Appearance → Type-specific → Quantities → Notes`, using the same headers for wall / room / opening / object. CasaPlazAI already has these entities in the schema, so one renderer + a per-kind field descriptor replaces four bespoke panels. | §2.3, §2.7 | High | Med |
| 2 | **Commit-on-change, never apply-on-confirm**, with one undo entry per field edit and a debounced autosave. Match the observed pattern (rename and every BIM select/text field live; no OK/Cancel anywhere in the 3D inspector) — and combine it with the local-storage autosave CasaPlazAI already has. | §2.5 | High | Low |
| 3 | **A persistent selection action bar** (Move · Rotate · Scale · Duplicate · Focus · Properties · Delete) plus a one-line status readout `Kind · Name · W × D × H · Level n`. This is the cheapest possible "inspector" and it already answers "what did I click" before any panel opens. | §2.1, §2.2 | High | Low |
| 4 | **Expose per-entity geometry as editable number fields with the range+number pairing** (thickness, height, length, sill height, position), showing the unit suffix and keeping the range and the typed number as two views of one value. CasaPlazAI's 0.5 m snapping makes a range slider natural for wall length/thickness on a bounded scale. | §2.3, §2.4, §2.9 | High | Med |
| 5 | **Put undo/redo buttons in the inspector header** (disabled when the stack is empty, tooltip with the shortcut and a live count). Round 1 flagged the missing chrome undo; the competitor hides it in the BIM panel header — don't repeat that mistake, but do borrow the disabled-state + tooltip pattern. | §2.5 | Med–High | Low |
| 6 | **Separate read-only facts from editable facts visually** (`key: value` text rows for computed things like room area, perimeter, level, GlobalId; real inputs for name/use/thickness). Prevents users from trying to type into derived quantities. | §2.7 | Med | Low |
| 7 | **Room/floor editing deserves its own type block**, not just a rectangle: name, use-picker (bedroom/kitchen/…), external switch, ceiling height, and floor/wall/ceiling finishes — the competitor treats a slab as a room with identity, and CasaPlazAI's "furnish rooms" flow needs the same anchor. | §2.3 | Med–High | Med |
| 8 | **Do not copy the 10-tab BIM panel.** It is a professional QTO/IFC surface (Model/Properties/Types/Quantities/Schedules/Check/Codes/Efficiency/Project/Projects) and is far beyond a lightweight floorplanner. Adopt the *section grammar* (idea 1), not the tab count. Also skip `GlobalId`/classification/IFC enumerations in the main inspector — keep them behind an "advanced/BIM" disclosure if at all. | §2.3, §2.8 | High (avoid) | Low |
| 9 | **Type-specific blocks as opt-in sub-cards**: wall → skirting; room → ceiling trim; opening → swing/operation. These are exactly the "finishing" features a floorplanner can show only when relevant, keeping the default inspector short. | §2.3, §2.7 | Med | Med |
| 10 | **Unify the Plan-mode inspector with the 3D inspector.** The competitor uses one panel style (`.fp-field`, range+number, unit span) in 2D and another (`hp-range`, value-in-label) in 3D — the value-in-label variant is the nicer one; use it in both of CasaPlazAI's modes so muscle memory transfers. | §2.4, §2.9 | Med | Med–Low |
| 11 | **Level stepper in the top bar + a "Floors & grid" dock card**, with the current floor, snap size, wall height and wall thickness in one place. CasaPlazAI has multiple floors and 0.5 m snapping; a stepper plus a grid card matches the observed mental model (levels are context, not selected objects). | §2.6 | Med | Low |
| 12 | **Empty-state text inside the card body** (`data-hint` → a muted sentence, e.g. "No skirting board on this wall.") rather than hiding the block. Keeps the inspector's shape stable across selections so the user learns where things are. | §2.7, §2.8 | Med | Low |
| 13 | **Multi-select handled by the same bar, with a count badge and a reduced field set** (common fields editable, per-type fields shown only when homogeneous). The competitor advertises Ctrl/Shift multi-select and a `{n} elements selected` string but keeps one bar; a count chip + "mixed values" placeholder is the natural upgrade. | §2.8 | Med | Med |
| 14 | **Keep appearance inside the one inspector column — do not copy the floating material card.** For walls/slabs/doors the competitor's material card had no reachable trigger in my runs, so appearance is effectively hidden; put Material/Colour/PBR/Texture as just another section in the same scroll as geometry, shown for objects and (optionally) surfaces. | §2.1, §2.4, §4 | Med–High | Low |

## 4. Unknowns

- **Object/furniture inspector not exercised end-to-end.** `HP3D.placeObject({option})` threw
  "Model could not be loaded: undefined" because the catalog option needs a resolved model path/level
  context I did not reproduce; object findings are therefore the material card (observed) plus the BIM
  Model tree (observed) and are marked `INFERRED` where combined.
- **Multi-selection UI not observed with ≥2 real elements.** `HP3D.select([a,b])` was accepted by the API
  but `getSelection()` still returned a single mesh; Ctrl/Shift-click synthesis on the canvas is exactly
  the kind of synthetic event round 1 found unreliable. The `bim.selectedN` / `bim.clearSel` /
  tree-hint evidence is strings + code, not a captured multi-selection state.
- **Which control unhides `#hpMaterialPanel`** was not pinned down. A patient health-checked probe
  (`rea/probe-13.mjs`) tried: selecting a wall/slab/door, the selbar `Properties` action, every
  material/texture/brush/colour/id-matching control in `#hpToolCard`, and each of the three tool-card tabs
  in turn — the class stayed `hp-card hp-mat hp-hidden` throughout, so the observed "material/texture"
  controls are terrain/ceiling-trim features (`Material brush`, `Terrain painter`, `.terraintextureforpaint`
  swatches, `LED colour`). Remaining candidates: a furniture/object selection (`kind.object`, which I could
  not create), or a canvas double-click / context gesture that synthetic events cannot reproduce. The
  card's field vocabulary is fully observed; its *trigger* is not.
- **Event-handler semantics for the BIM fields.** I confirmed commit-on-`change` for a text field but did
  not confirm whether `input` (per-keystroke) also commits for every numeric/range field, nor whether
  there is a debounce. One undo entry per keystroke vs per blur is unresolved.
- **`HPBIM.canUndo()` returned `null`** even though the API exists and `undoData()` returned `[]`; the real
  return shape / stack semantics were not established.
- **`std` / `stdMaterial` / `applyTexture` / `pickTexture` call conventions** were not decoded, so the
  material card's write path is inferred from DOM alone; my live colour/slider probe did not commit
  (the card stayed `hp-hidden`), so material editing remains unverified.
- **`#hpHeightPanel` exposed no markup** in the captured state (`HP3D.gui.heightPanel.el` rendered empty);
  the wall-height-while-dragging card is known to exist but its field layout was not read. The similar
  `#hpHeightPanel` i18n strings (`gui.height`, `gui.length`, `gui.width`, `gui.distFloor`) describe it.
- **Obfuscation.** `hp-panels.js`, `hp-editor.js` and `hp-bim.js` are string-array obfuscated
  (`_0x…` + base64 lookup). Behaviour below the DOM was reconstructed from the DOM, live objects and
  i18n keys; no code was copied and no hard-coded string arrays were decoded beyond the class names that
  appear verbatim in the DOM/CSS.
- **Not verified on touch or on a real device** — same limitation as round 1; this round is desktop
  Chromium at 1600×1000 only.

## Appendix — evidence inventory (this job folder)

| File | What it is |
|---|---|
| `rea/boot.mjs` | Reusable Playwright boot: landing CTA → `app.php` → Project settings → editor, with SwiftShader GL |
| `rea/probe-globals.mjs`, `rea/globals.json`, `rea/globals-deep.json`, `rea/panels-dom.json` | Global-namespace discovery (`HP3D`, `HPBIM`, `HPUI`, `HPPanels`, …) and initial panel scan |
| `rea/probe-api.mjs`, `rea/api-keys.json`, `rea/HPPanels-src.json` | API surface of the exposed namespaces |
| `rea/probe-1.mjs`, `rea/api-probe1.json` | Element model, `classify`, `listElements`, selection sources |
| `rea/probe-2.mjs`, `rea/api-probe2.json` | `HP3D.gui` panel map and builder signatures |
| `rea/probe-3.mjs`, `rea/live-panels.json` | First build+select of wall/slab; GUI panel visibility |
| `rea/probe-4.mjs`, `rea/live-selmatrix.json` | Door/window openings, `HPBIM.elementInfo` per kind, status readouts |
| `rea/probe-5.mjs`, `rea/live-diff.json` | DOM diff per selection; `.hp-status-sel`, `.hp-selbar`, tour overlay |
| `rea/probe-6.mjs`, `rea/live-panels2.json` | Full HTML of selbar / material card / copy card / level card / tool card / BIM panel |
| `rea/probe-7.mjs`, `rea/live-props.json` | BIM Properties field inventory; first live-edit attempt |
| `rea/probe-8.mjs`, `rea/live-live.json` | Live-vs-apply test (rename, checkbox, colour, sill); undo/header buttons |
| `rea/probe-9.mjs`, `rea/live-typeprops.json` | Per-type Properties sections (wall / slab-room / door) + material-card live test |
| `rea/probe-10.mjs`, `rea/live-misc.json` | No-selection state, multi-select attempt, level stepper, iframe discovery |
| `rea/probe-11.mjs`, `rea/probe-12.mjs` | Failed runs (flaky boot: `window.HP3D` undefined) — kept for honesty; results superseded by probe-13 |
| `rea/probe-13.mjs`, `rea/live-mat.json` | Health-checked material-card trigger search across all tool-card controls and tabs (negative result) |
| Round-1 read-only inputs reused | `js/editor_hp-*.js`, `css/hp-panels.css`, `css/hp-ui.css`, `rea/i18n-app.json`, `rea/2dplanner.html`, `rea/i18n-planner.json` |
