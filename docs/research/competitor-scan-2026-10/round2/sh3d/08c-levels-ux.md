# Sweet Home 3D — Levels UX deep dive (round 2)

**Job:** `rea2-sh3d-p4/01-08c-dimensions-levels-levels-ux`
**Question:** Levels UX of Sweet Home 3D (GPL Java desktop app, <https://www.sweethome3d.com/de/>;
browser edition <https://www.sweethome3d.com/SweetHome3DJSOnline.jsp> built from the same Java core
compiled to JS): level tabs, adding levels at the same elevation, viewable/visible, selecting objects
across levels, 3D display of other levels.

**Method.** Round 1 (`~/dsh-workspaces/rea-sweethome3d-2026-10/08-08-dimensions-levels/report.md`
+ `report-plan-features.md`) supplied the vendor docs. This round adds: (a) re-reading the round-1 raw
`docs/`, `res/` and `examples/` evidence, (b) static analysis of the **official browser edition's shipped
JavaScript bundle** (`libjs/sweethome3d.min.js`, v7.5.2, read-only in the round-1 folder) for the compiled
behaviour of levels, (c) live driving of that bundle's own JS API through Chrome DevTools Protocol against
a running `SweetHome3DJSOnline.jsp` page, and (d) targeted vendor javadoc page fetches. Live measurements
are saved as `evidence/levels-live.json`, `evidence/levels-extra.json`,
`evidence/levels-3d-gating.json`, `evidence/levels-delete.json`, `evidence/levels-selection.json` and
`evidence/levels-first-level.json` (scripts `evidence/measure_level_ux.py`,
`evidence/measure_level_extra.py`, `evidence/measure_3d_gating.py`, `evidence/measure_delete.py`,
`evidence/measure_selection.py`, `evidence/measure_first_level.py`).
No code is copied into deliverables;
all descriptions are in my own words. Tags: **OBSERVED** (I read/fetched/measured it), **DOCUMENTED**
(vendor docs), **INFERRED** (my reasoning).

## 1. Summary (5 bullets)

- **A level is a horizontal slab, not a container.** `Level` stores `name`, `elevation` (= the bottom
  surface of that level, i.e. the walking plane), `floorThickness`, `height`, plus an `elevationIndex`
  used only to order levels that share the same elevation, and a per-level plan `backgroundImage`.
  Objects belong to a level through the `Elevatable` interface (`getLevel()/setLevel`), so walls, rooms,
  furniture, labels and dimension lines each carry a level reference — there is no nesting and no
  "floor" array (OBSERVED bundle + javadoc; `…/model/Level.html`, `…/model/Home.html`).
- **Two orthogonal flags decide whether a level is drawn.** `viewable` is user-intent and persists;
  `visible` is transient and recomputed by the current display mode. `isViewableAndVisible()` is the
  single predicate both the plan and the 3D view use for "show this level's stuff" (OBSERVED
  `libjs/sweethome3d.min.js` `isViewableAndVisible`, `HomePieceOfFurniture3D.isVisible`,
  `PlanController.isViewableAtLevel`; DOCUMENTED as `Since 5.0`).
- **"Tabs" became a dropdown in the browser edition.** Desktop Java paints one tab per level plus a `+`
  tab (`MultipleLevelsPlanPanel.ADD_LEVEL.SmallIcon='resources/tab-add-level.png'`, user guide: "clicking
  on the + tab that appears when a home has more than one level"); the browser bundle contains neither
  class nor string and instead rebuilds a `<select id="level-selector">` (CSS `position:absolute; top:3px;
  right:20px`) that is hidden (`display:none`) below two levels and shown as `inline` from two levels up.
  The level commands (add / add at same elevation / modify / delete) live in the **plan right-click
  menu**, and "display all levels" / "display selected level" live in the **3D view right-click menu**
  (OBSERVED `libjs/sweethome3djs.css`, bundle `createPopupMenus`, live DOM + context-menu capture;
  DOCUMENTED blog 3.4 for the desktop tabs).
- **Viewability is gated centrally, and the 3D view has an extra mode.** `MAKE_LEVEL_VIEWABLE` /
  `UNVIEWABLE`, `MAKE_LEVEL_ONLY_VIEWABLE_ONE`, `MAKE_ALL_LEVELS_VIEWABLE` edit the persisted `viewable`
  flag through undoable edits; `DISPLAY_ALL_LEVELS` / `DISPLAY_SELECTED_LEVEL` flip the *transient*
  `HomeEnvironment.allLevelsVisible`. In "selected level" mode the selected level **and every level below
  it** become `visible`, everything above becomes hidden; live 3D object counts confirm this
  (all-levels: 69/45/2/6 visible per level; selected = 1st floor: 69/0/0/0) and un-viewable levels drop
  to 0 even in "display all levels" (OBSERVED `evidence/levels-live.json`, bundle
  `HomeController3D … propertyChange` + `HomeComponent3D.addLevelListener`).
- **Cross-level work is explicit, not implicit.** `selectAll` = current level only (plus staircase-like
  furniture whose top reaches into it), `SELECT_ALL_AT_ALL_LEVELS` = every item on every *viewable*
  level (live on the same home: 211 items at all levels vs 97 for `selectAll` on the 2nd floor — 95 there,
  the reaching Staircase from the 1st floor, and the compass) and sets `allLevelsSelection`; picking an
  object does **not** auto-switch
  the level — only `selectAndShowItems` (used by Find/zoom-style flows) runs `selectLevelFromSelectedItems`
  and moves the selected level to the picked item. Plan view of the level below is drawn greyed
  (`#808080` at alpha 0.1/0.2) to make tracing over it possible, and copy/paste of an item across levels
  keeps its plan coordinates (live: "Rounded door" copied 2nd floor → 1st floor landed at the same
  x/y/elevation) (OBSERVED bundle + `evidence/levels-live.json`, `evidence/levels-extra.json`;
  DOCUMENTED user guide "Adding levels").

## 2. Findings

### 2.1 The level data model

**DOCUMENTED** (`docs/…`, round-1 `docs/`; javadoc `…/model/Level.html`, `…/model/Home.html`):
`Level(String name, float elevation, float floorThickness, float height)` (since 3.4); accessors
`getName/setName`, `getElevation/setElevation` ("elevation of the bottom of this level"),
`getFloorThickness/setFloorThickness`, `getHeight/setHeight`, `isVisible/setVisible`,
`isViewable/setViewable` (since 5.0), `isViewableAndVisible`, `getElevationIndex/setElevationIndex`
("index of this level used to order levels at the same elevation", since 5.0),
`getBackgroundImage/setBackgroundImage` ("plan background image of this level"). `Level.Property` =
`NAME, ELEVATION, FLOOR_THICKNESS, HEIGHT, VIEWABLE, VISIBLE, BACKGROUND_IMAGE, ELEVATION_INDEX`.
`Home.getLevels()` returns a `List<Level>` with `addLevel`, `deleteLevel`, `addLevelsListener`,
`getSelectedLevel`; `Home.Property` includes `SELECTED_LEVEL` and `ALL_LEVELS_SELECTION`.

Live read-back of `3BedroomHouseWithAttic.sh3x` (OBSERVED `evidence/levels-live.json` `snapshot`):

| id | name | elevation | elevationIndex | floorThickness | height | viewable | visible |
| --- | --- | --- | --- | --- | --- | --- | --- |
| level0 | 1st floor | 0 | 0 | 12 | 250 | true | true |
| level1 | 2nd floor | 262 | 0 | 12 | 250 | true | true |
| level2 | Attic | 524 | 0 | 12 | 250 | true | false |
| level3 | Roof | 524 | 1 | 12 | 250 | true | false |

Two levels (`Attic`, `Roof`) deliberately share elevation 524 and are disambiguated only by
`elevationIndex` — this is the "same elevation" case the UI exposes. `visible` is `false` for both even
though `viewable` is `true`, because the page opened in "display selected level" mode with the 2nd floor
selected (levels above the selection are hidden). **INFERRED** from the model + mode logic in 2.4.

Ordering: OBSERVED bundle `LEVEL_ELEVATION_COMPARATOR` sorts by `getElevation()`, then by
`getElevationIndex()`, and `Home.addLevel` binary-inserts the new level at that sorted position and fires
a `CollectionEvent.Type.ADD`. So level order is always (elevation, elevationIndex) — the UI never lets a
user drag a level to an arbitrary order, only nudge its index within its own elevation group (2.8).

### 2.2 Level selection UI: desktop tabs vs browser dropdown

**DOCUMENTED** (round-1 user guide, `docs/sh3d-userGuide.txt` / `de-userGuide.txt` line ~231, blog
`docs/blog3_4.txt`, javadoc `docs/swing_MultipleLevelsPlanPanel.html`): "Each level is represented by a
tab displayed at the top of the plan view and used to select the level into which new walls, furniture
and other objects will be added… you can create the additional levels … by clicking on the + tab that
appears when a home has more than one level." The Java class is
`com.eteks.sweethome3d.swing.MultipleLevelsPlanPanel` ("A panel for multiple levels plans where users
can select the displayed level"). Localization still ships its `+` tab icon:
`MultipleLevelsPlanPanel.ADD_LEVEL.SmallIcon = resources/tab-add-level.png` (OBSERVED `res/localization.json`).

**OBSERVED** browser substitution: the strings `MultipleLevelsPlanPanel`, `JSMultipleLevels` and
`tab-add-level` do **not** occur in `libjs/sweethome3d.min.js` (grep count 0), while
`document.getElementById("level-selector")` does (16 hits). The bundle rebuilds the selector on every
`SELECTED_LEVEL` change and on level `NAME`/`ELEVATION`/`ELEVATION_INDEX` changes. The rebuild, described
in my own words (no code reproduced): it clears the element, hides it with `display:none` when the home
has fewer than two levels, otherwise recreates one `<option>` per level in `Home.getLevels()` order with
`value` = the array index and text = the level name, marks the selected level's option as selected, and
sets `display:inline`.

Live DOM confirms the runtime shape (OBSERVED `evidence/levels-live.json` `tabs`): `#level-selector`
exists, `display:inline`, options `1st floor / 2nd floor / Attic / Roof` with the 2nd floor `selected`.
Rename test (OBSERVED `evidence/levels-extra.json` `selectorRebuildOnRename`): setting a level name to
`ZZ-Test-Rename` immediately re-rendered the option text, and restoring the old name re-rendered it back
— so the selector is a pure projection of `Home.getLevels()`. With exactly one level the live selector
had `display:none` and 0 options (`selectorHidesWithOneLevel`), matching the documented "+ tab appears
when a home has more than one level". Unlike a canvas-drawn tab strip it is a native HTML `<select>`
(INFERRED: therefore keyboard/screen-reader accessible for free, and constrained to one visible line of
text no matter how many levels exist).

CSS (OBSERVED `libjs/sweethome3djs.css` lines 185–188 and 340–343): `#level-selector { position:absolute;
z-index:10; top:3px; right:20px; }` inside the `#home-plan` container — i.e. it floats over the plan
canvas in the top-right corner.

**Where the commands live in the browser.** The bundle wires `createPopupMenus`; the plan context menu
(`planPopupMenu`) ends with `… import background image / modify / hide / show / delete …; separator;
ADD_LEVEL; ADD_LEVEL_AT_SAME_ELEVATION; MODIFY_LEVEL; DELETE_LEVEL`, and the 3D view context menu
(`view3DPopupMenu`) contains `…; DISPLAY_ALL_LEVELS; DISPLAY_SELECTED_LEVEL; MODIFY_3D_ATTRIBUTES`
(OBSERVED bundle). Live `contextmenu` dispatch on the plan canvas produced (OBSERVED, whitespace
collapsed):

```
× Select all at all levels | Reset elevation | Modify compass… | Modify text style ▸ | Import background image… |
Add level | Add level at same elevation | Modify selected level… | Delete selected level
```

Note the browser context-menu wording is **"Modify selected level…" / "Delete selected level"** (the
`HomePane.MODIFY_LEVEL.Popup` / `DELETE_LEVEL.Popup` strings, OBSERVED `res/localization.json`), while
the action's toolbar/menu name is `MODIFY_LEVEL.Name = "Modify level…"`; the dialog title itself is
`LevelPanel.level.title = "Modify level"`. There
is no `Plan > Levels` menu bar in the browser edition: `LEVELS_MENU` has 0 hits in the bundle (OBSERVED),
while it exists as `HomePane.LEVELS_MENU.Name = "Levels"` / DE "Niveaus" in localization — the desktop
menu was not ported, so its four commands were folded into the plan context menu. **INFERRED** that this
is a deliberate browser simplification, since the selector itself replaces the tab bar.

Action inventory and enablement (OBSERVED bundle `createActions`/`enableLevelActions`, and live
`evidence/levels-extra.json` `levelMenuActions`): `ADD_LEVEL`, `ADD_LEVEL_AT_SAME_ELEVATION`,
`MAKE_LEVEL_VIEWABLE`, `MAKE_LEVEL_UNVIEWABLE`, `MAKE_LEVEL_ONLY_VIEWABLE_ONE`,
`MAKE_ALL_LEVELS_VIEWABLE`, `MODIFY_LEVEL`, `DELETE_LEVEL`, `DISPLAY_ALL_LEVELS`,
`DISPLAY_SELECTED_LEVEL`, `SELECT_ALL_AT_ALL_LEVELS` — all present and enabled in a 6-level home with
names "Add level", "Add level at same elevation", "Modify level…", "Delete level", "Make level viewable",
"Make level unviewable", "Make level the only viewable one", "Make all levels viewable", "Display all
levels", "Display selected level", "Select all at all levels". Enablement rules read from the bundle:
`ADD_LEVEL` / `ADD_LEVEL_AT_SAME_ELEVATION` are disabled while an edit is in progress (`MODIFICATION_STATE`);
`SELECT_ALL_AT_ALL_LEVELS` needs >1 level and no edit in progress; `MAKE_LEVEL_VIEWABLE/UNVIEWABLE`,
`MODIFY_LEVEL`, `DELETE_LEVEL` need >1 level **and** a selected level; `MAKE_LEVEL_ONLY_VIEWABLE_ONE`,
`MAKE_ALL_LEVELS_VIEWABLE`, `DISPLAY_ALL_LEVELS`, `DISPLAY_SELECTED_LEVEL` need >1 level.
`displaySelectedLevel()`/`displayAllLevels()` are toggle actions bound to
`HomeEnvironment.allLevelsVisible` and updated by an `ALL_LEVELS_VISIBLE` property listener.

### 2.3 Adding levels (and what happens to existing objects)

**OBSERVED** bundle `PlanController.addLevel$boolean` semantics (round-1 static read, re-verified live):
the default new elevation is the last level's `elevation + preferences.newWallHeight + preferences.newFloorThickness`;
the "same elevation" variant copies the selected (or just-created) level's elevation, floorThickness and
height. Live on a home at that moment holding `1st floor@0`, `2nd floor@262`, `Roof@524`, with the 2nd
floor selected, two successive same-elevation adds inserted into **that** level's group with increasing
`elevationIndex` (OBSERVED `evidence/levels-live.json` `sameElevationAdd`):

```
1st floor@0[idx=0] | 2nd floor@262[idx=0] | Level 3@262[idx=1] | Roof@524[idx=1]
… second addLevel(true) →
1st floor@0[idx=0] | 2nd floor@262[idx=0] | Level 3@262[idx=1] | Level 4@262[idx=2] | Roof@524[idx=1]
```

The default-add path is separately confirmed: after the same-elevation levels existed, a plain `addLevel()`
on that same home created `Level 6` at **786** = the then-last level's 524 + `newWallHeight` 250 +
`newFloorThickness` 12 (OBSERVED `evidence/levels-live.json` `defaultAdd`). The shipped examples exhibit
the same arithmetic throughout: 262 = 0 + 250 + 12, 374 = 112 + 250 + 12.

Naming: OBSERVED `PlanController.levelName = "Level %d"` (DE `Niveau %d`) with the current
`levels.length`, so repeated same-elevation adds produce "Level 3", "Level 4", … — exactly the "same
elevation" workflow the German short description calls *"Ein Niveau auf derselben Höhe über dem Boden wie
die markierte Ebene hinzufügen"* (OBSERVED `res/localization_de.json`).

**First level adopts the whole home (and one add can create two levels).** The compiled `addLevel`
has a special first-level path: when `levels` is empty it creates a level at elevation 0 named
`levelName(0)` ("Level 0"), **moves every home item onto it**, gives it the home's plan background image,
clears the home background, and then continues to create the *requested* new level — so a single default
`addLevel()` on a fresh 0-level home produces **two** levels. Live confirmation (OBSERVED
`evidence/levels-first-level.json` `defaultAddOnZeroLevelHome`): `Studio.sh3x` opened with 0 levels,
16 walls / 5 rooms / 48 furniture (all 16 walls with `level == null`); after one `addLevel()` the home had
`Level 0@0` and `Level 1@262`, where `Level 0` had taken all 16 walls and 48 furniture and the new
`Level 1` at 262 = 0 + 250 + 12 held none — and the selector appeared with 2 options. `addLevel(true)`
(same elevation) on a 0-level home instead creates the target at the **same** elevation 0
(`Level 0@0`, `Level 1@0`), because the compiled code falls back to the just-created level as the copy
source. The "adopts everything" path only triggers for the empty-levels case; a home whose items merely
carry `level == null` while levels already exist is not re-parented (live: `movedWalls=0 movedFurn=0`).
This is the migration rule for pre-3.4 files (INFERRED but strongly determined by the code path).

**Deleting a level deletes its contents.** OBSERVED bundle `deleteSelectedLevel`: it collects the
selected level's furniture and its `Elevatable` walls/rooms/dimension lines/labels, posts a delete for
them (respecting base-plan lock and `allLevelsSelection`), then `home.deleteLevel(level)`. Live
(OBSERVED `evidence/levels-delete.json` `deletePopulatedLevel`, on a freshly reloaded 4-level attic home):
deleting `Attic` (10 of the home's 58 walls on it) dropped the home to 48 walls, 11→10 rooms and 115→113
furniture, leaving levels `1st floor / 2nd floor / Roof` and moving the selection to the 2nd floor. An
earlier pass confirmed the same direction (4→3 levels, walls 58→48, rooms 11→10). Undo is a
`LevelDeletionUndoableEdit` that also restores the previous elevation+viewable when the deleted level was
the second-to-last one.

**The last level cannot be deleted.** Bundle `deleteSelectedLevel`, after `home.deleteLevel`:
`if (levels.length === 1) { level.setElevation(0); level.setViewable(true) }`. Live: deleting down to one
level left the remaining level named "1st floor" at elevation 0 / `viewable=true` / `visible=true`, the
selector `display:none` with 0 options, **and `DELETE_LEVEL` reported `isEnabled() === false`**
(OBSERVED `evidence/levels-delete.json` `deleteLastLevelReset`) — so the normal UI cannot remove the last
level. In one separate experimental run the delete action's `actionPerformed()` was invoked
programmatically while a single level remained; the observable result was `levels=0`, `walls=0`,
`furniture=0`, `selected=null`, i.e. the model can be driven into an inconsistent zero-level Home only by
bypassing enablement. Re-adding a level on that broken home created `Level 0@0` without re-adopting
anything. This is best treated as an edge-case artefact of driving the action map directly, not a
reachable UI state — **INFERRED**, flagged in Unknowns.

### 2.4 `viewable` vs `visible` — the two flags and the display modes

**DOCUMENTED** (`…/model/Level.html`): `isVisible()` "Returns true if this level is visible";
`isViewable()` "Returns true if this level is viewable" (Since 5.0); `isViewableAndVisible()` "Returns
true if this level is viewable and visible". **OBSERVED** bundle: `isViewableAndVisible = this.viewable &&
this.visible`. Persistence (OBSERVED `examples/*/Home.xml` and bundle XML writer): `<level … visible='false'/>`
is written *only* when false, and `viewable` likewise only when false — both default true on load. In the
shipped examples: `2BedroomHouseWithBasement` has Basement −150 / 1st floor 112 / Roof 374 with
`Roof visible='false'`; `3BedroomHouseWithMezzanine` marks 2nd floor and Roof `visible='false'`;
`3BedroomHouseWithAttic` marks Attic and Roof `visible='false'` and keeps the two same-elevation indices.

User-intent actions (OBSERVED bundle, all undoable):

| Action | Effect |
| --- | --- |
| `toggleSelectedLevelViewability` | flips selected level's persisted `viewable` |
| `setSelectedLevelOnlyViewable` | sets every other level `viewable=false`, selected `true` |
| `setAllLevelsViewable` | sets every level `viewable=true` |

Mode actions: `displayAllLevels()` → `environment.setAllLevelsVisible(true)`; `displaySelectedLevel()`
→ `false`. The 3D visibility listener (OBSERVED bundle `HomeController3D$3.propertyChange`): for each
level set `visible = true`, then when the iterated level **is** the selected level and we are *not* in
all-levels mode, set `visible = false` — because levels are ordered bottom-up, this yields "selected
level and all levels below are visible; all above are hidden". Note this matches the 3D menu wording
"Dispay selected level" whose DE short description is *"Das ausgewählte Niveau in der 3D-Ansicht
anzeigen"*; DOCUMENTED javadoc for `displaySelectedLevel()`: "Makes the selected level and below
visible."

Live proof (OBSERVED `evidence/levels-live.json` `displayAllLevels`,
`displaySelectedLevel_perLevel`; counts from the page's own `homeObjects3D` user data and each object's
`isVisible()`):

| level | objects total | visible, display-all | visible, selected=1st floor | selected=2nd floor | selected=Attic | selected=Roof |
| --- | --- | --- | --- | --- | --- | --- |
| 1st floor | 99 | 69 | 69 | 69 | 69 | 69 |
| 2nd floor | 95 | 45 | 0 | 45 | 45 | 45 |
| Attic | 17 | 2 | 0 | 0 | 2 | 2 |
| Roof | 6 | 6 | 0 | 0 | 0 | 6 |

Some branch objects per level are non-`Elevatable` or individually invisible (plan-only objects,
switched-off doors/windows), which is why "visible" is lower than "total" (e.g. 30 of the 99 1st-floor
branch objects never report visible in display-all mode). The monotone cumulative behaviour is exactly the
"selected and below" rule. Additionally, un-checking `viewable` on Attic and Roof while in **display-all**
mode drove their visible counts to 0 (OBSERVED `evidence/levels-3d-gating.json`
`3dVisibleCounts_allMode_viewableGating`: Attic 2→0, Roof 6→0 with the 1st/2nd-floor counts unchanged) —
so `viewable` gates the 3D
view in *both* modes. The per-object 3D predicate is `isVisible() && (level == null ||
level.isViewableAndVisible())` (HomePieceOfFurniture3D.isVisible; Label3D similar). The 3D component also
reacts to level property changes with a targeted update: `VISIBLE`/`VIEWABLE` updates the objects that
`isAtLevel(level)`, `ELEVATION`/`ELEVATION_INDEX` update all objects, `FLOOR_THICKNESS` updates walls +
rooms, `HEIGHT` updates rooms (OBSERVED bundle `HomeComponent3D.addLevelListener`).

**Plan-side gating** (OBSERVED bundle): `PlanController.isViewableAtLevel(item, level) = level == null ||
(level.isViewable() && item.isAtLevel(level))`; `addViewableItems` keeps `level == null ||
level.isViewable()`. Live check (OBSERVED `evidence/levels-extra.json` / final probe): setting the 1st
floor `viewable=false` while the 2nd floor was selected removed exactly the one cross-level 1st-floor
item from `getVisibleItemsAtSelectedLevel()` (95 2nd-floor + 1 "(none)"), and
`selectAllAtAllLevels` dropped from 211 items to 114 (2nd floor 95, Attic 17, Roof 1, "(none)" 1) —
un-viewable levels are fully excluded from plan display, detection and select-all.

**Walls alpha.** `HomeEnvironment.wallsAlpha` (int, default 0, XML `wallsAlpha` written only when not 0)
is a *separate* 3D-attribute that fades walls when drawing, adjusted in "3D view options" via a slider
`wallsAlpha = value/255`; it is not the level-visibility mechanism (OBSERVED bundle
`setWallsAlpha`, `HomeComponent3D.addEnvironmentListeners` updating walls+rooms). Worth separating in the
write-up because round 1 flagged `wallsAlpha` near the level discussion; live it did not change when
toggling display modes (OBSERVED: `allLevelsVisible` flipped, `wallsAlpha` stayed 0.5).

### 2.5 Plan view of the other level: grey ghosting and trace-over detection

**DOCUMENTED** user guide / DE guide: *"Walls and ceilings of the lower level are displayed with a light
color in the plan view to help you use wall or room drawing tools more easily. If needed you may also
copy / paste some objects from an other level to the selected level."*

**OBSERVED** bundle `PlanComponent.paintOtherLevels` + `getDetectableRoomsAtSelectedLevel` /
`getDetectableWallsAtSelectedLevel`:

- The adjacent level shown is determined by position: if the selected level is the **first level of its
  elevation group**, the next level **above** is shown (so the selected level's ceiling is the neighbour's
  floor); otherwise the level **below** is shown. Practically this means a level whose elevation matches
  the one below shows the level below, and the bottom-most level(s) show the level above.
- Only **viewable** neighbour levels contribute. Rooms count when the relevant surface is visible —
  `isFloorVisible()` when looking up (selected is the lower one), `isCeilingVisible()` when looking down —
  and walls are filtered by `isViewableAtLevel(item, selectedLevel)` so already-visible walls are not
  double-drawn.
- Painting: rooms filled `#808080` with alpha `0.2` when the grid is shown, otherwise `0.1`; the same
  alpha is applied to the neighbour's wall fill/draw. Caches (`otherLevelsRoomsCache`,
  `otherLevelsWallsCache`, plus area caches) avoid recomputation, and `setTransparency` returns the prior
  alpha so it can be restored.
- Detection (`getDetectableRooms/WallsAtSelectedLevel`) returns current-level items **plus** the adjacent
  level's rooms whose floor/ceiling is visible and whose walls `isAtLevel(adjacentLevel)`.

This is the mechanism that lets a user draw a new level's walls directly over the floor below — a
strong reference for CasaPlazAI's underlay/ghost idea, since SH3D achieves it from the model
(topology-aware adjacency + alpha) rather than from a bitmap.

### 2.6 Selecting objects across levels

**DOCUMENTED** javadoc (`docs/viewcontroller_PlanController.html`): `selectAll()` "Selects all visible
items in the selected level of home"; `selectAllAtAllLevels()` "Selects all visible items in all levels
of home"; `getVisibleItems`/`getSelectableViewableItems` are not public.

**OBSERVED** bundle + live:

- `selectAll()` populates from `getVisibleItemsAtSelectedLevel()` and sets `allLevelsSelection=false`.
  Non-furniture `Elevatable` items are kept when `item.isAtLevel(selectedLevel)`; furniture additionally
  goes through `isPieceOfFurnitureVisibleAtSelectedLevel = isVisible() && (level == null ||
  level.isViewable()) && (level === selected || isAtLevel(selected))`.
- `selectAllAtAllLevels()` populates from `getSelectableViewableItems()` — every wall/room/polyline/
  dimension line/label whose level is `null` or `viewable`, every visible furniture on a viewable or
  null level, plus the compass — and sets `allLevelsSelection=true`.
- Live counts: select-all at all levels = **211** items `{1st floor 97, 2nd floor 95, Attic 17, Roof 1,
  (none) 1}`; `selectAll()` on the 2nd floor = 95 items on the 2nd floor plus **1 item on the 1st floor**
  (the `Staircase`, a `com.eteks.sweethome3d.model.HomePieceOfFurniture` on the 1st floor at elevation 0
  with height 362, whose top reaches the 2nd floor's 262 walkable plane)
  and 1 "(none)" (compass) — OBSERVED `evidence/levels-live.json` `snapshot`/`planVisibleItems_perLevel`.
  This is the `isAtLevel` cross-level reach in action: a staircase physically belongs to the lower level
  but is selectable/visible at the level it reaches into.
- **Cross-level reach rules** (OBSERVED bundle, per class):
  - `Wall`: `elevation` comparison uses `getWallMaximumHeight()` = `max(height, heightAtEnd)` (or 0 when
    an arc extends it), so a wall is "at" a level if its top reaches that level.
  - `HomePieceOfFurniture`: `isTopAtLevel`: `level.elevation + elevation + heightInPlan >= target.elevation`
    when `staircaseCutOutShape != null` (stairs, i.e. inclusive), otherwise a strict `>` — so odd-shaped
    floor cut-outs and staircases can reach up into the next level while ordinary furniture does not.
  - `Room`/`Polyline`: same level, or the same elevation with a lower `elevationIndex`.
  - `Label`: same level, same-elevation-lower-index, or `(this.level.elevation < e.elevation &&
    level.elevation + this.elevation > e.elevation)` (a raised text at an in-between elevation).
  - `DimensionLine`: uses `max(elevationStart, elevationEnd)`.
- **No implicit level switch on plain selection.** `PlanController.selectItems(list)` (Home
  `setSelectedItems` too) does **not** change the selected level: live with the Attic selected, calling
  `selectItems` on a 1st-floor "Double small window" left the selected level at **Attic**. Only
  `selectAndShowItems(list)` (and `makeSelectionVisible`) runs `selectLevelFromSelectedItems()`: if no
  selected `Elevatable` item is at the current level, the selected level moves to the **first** selected
  item's level — live, `selectAndShowItems` on the same window switched the selected level to **1st
  floor** (OBSERVED `evidence/levels-selection.json` `selectItemsVsSelectAndShowItems`, and the same
  pattern earlier in `evidence/levels-live.json` `autoSwitchOnSelection`).
- **Copy/paste across levels** (DOCUMENTED user guide; OBSERVED live): `HomeController.paste()` is the
  method (there is no `copy()` on the controller — the context-menu action map's `COPY` is the way).
  Live with the action map: copied "Rounded door" from the 2nd floor, switched selected level to the 1st
  floor, invoked `PASTE` → furniture on the target went 67 → 68, the pasted object's name stayed
  "Rounded door", and x/y/elevation were unchanged (227.41 / 61.68 / 0) — paste keeps plan coordinates and
  only re-parents to the target level. The same worked for a wall: 16 → 17 walls on the 1st floor
  (OBSERVED `evidence/levels-extra.json` `crossLevelCopyPasteWall`). So "select items across levels" in
  SH3D is really (a) select-all-at-all-levels to act on many, or (b) copy on one level / paste on another.

### 2.7 3D display of other levels

- `DOCUMENTED`: `HomeController3D.displayAllLevels()` "Makes all levels visible";
  `displaySelectedLevel()` "Makes the selected level and below visible". Both are exported as actions and
  appear in the 3D view context menu (2.2).
- `HomeEnvironment.allLevelsVisible` defaults to **false** (bundle XML reader: default false when absent;
  writer writes `allLevelsVisible` only when true; round-1 example files use `allLevelsVisible='true'` in
  some examples). So the out-of-box 3D behaviour is "selected level and below".
- Live numbers in 2.4 prove both modes and show that Roof (a same-elevation sibling above Attic) is
  hidden unless selected, while being fully drawn in display-all mode. Non-viewable levels are drawn 0
  objects in either mode — i.e. `viewable` is a hard gate, `allLevelsVisible` only decides the *range*.
- **Observer camera elevation follows the level change**: the bundle adds a `SELECTED_LEVEL` listener
  that, when `environment.isObserverCameraElevationAdjusted()`, adds `new.elevation − old.elevation` to
  the camera z, clamped to at least `observerCameraMinimumElevation = (levels empty ? 10 : 10 +
  levels[0].elevation)`. Live (OBSERVED `evidence/levels-live.json` `observerCameraOnLevelSwitch`,
  adjusted=true): z 134.29 → 396.29 (2nd floor +262) → 658.29 (Attic +262) and stayed at 658.29 for the
  same-elevation Roof. This is a subtle but reusable interaction: switching levels in the plan also lifts
  the virtual-visitor camera in 3D.
- **Level properties affect 3D directly**: `ELEVATION`/`ELEVATION_INDEX` rebuild all objects,
  `FLOOR_THICKNESS` rebuilds walls and rooms, `HEIGHT` rebuilds rooms, `BACKGROUND_IMAGE` rebuilds the
  ground (OBSERVED `HomeComponent3D.addLevelListener`). So editing a level in the dialog is visible in
  3D without touching the plan.

### 2.8 The "Modify level" dialog (browser)

**DOCUMENTED** (round-1 `docs/swing_LevelPanel.html`; javadoc `LevelController.modifyLevels` "Controls
the modification of selected level in the edited home", `isPropertyEditable(property)`). **OBSERVED**
live DOM on `SweetHome3DJSOnline.jsp` (template in round-1 `evidence/tmpl_level-dialog-template.html`):

- Fields: a **Viewable** checkbox (DE "Sichtbar"), **Name**, **Elevation (cm)**, **Floor thickness (cm)**,
  **Height (cm)** — all in the user's length unit.
- Below them a **summary table** "Levels summary (the edited level is selected):" (DE "Zusammenfassung der
  Niveaus (das bearbeitete ist ausgewählt):") with columns **Name / Elevation / Floor thickness / Height**,
  rows sorted **descending** by level order, the edited row carrying class `selected`. The lowest level's
  floor-thickness cell is rendered blank (live: 1st floor row cells `1st floor, 0, (blank), 250`).
- Two elevation-index buttons (`increase-elevation-index-button` up / `decrease-elevation-index-button`
  down, `go-up.svg` / `go-down.svg`, DE "Niveau nach oben schieben" / "…nach unten schieben") are enabled
  only when the level actually has a neighbour **at the same elevation**: increase enabled when
  `index < n-1 && levels[index].elevation == levels[index+1].elevation`; decrease when
  `index > 0 && levels[index].elevation == levels[index-1].elevation` (OBSERVED bundle
  `createLevelView`). Live (OBSERVED `evidence/levels-extra.json` `dialogEnablement_perLevel`): on the
  bottom-of-group "2nd floor" (elevation 262, three same-elevation levels above it) the increase button
  was enabled and the decrease disabled; on "Level 4" (middle) both were enabled; on the group's top or a
  singleton both were disabled. The **floor-thickness input is disabled exactly for the lowest ground
  level** (`level.elevation == levels[0].elevation`); live on the 1st floor it was disabled while the
  elevation and height inputs stayed editable (OBSERVED, same evidence). All other fields remained
  editable in every case tested (`isPropertyEditable` gates visibility via CSS `display`).
- Rows for **un-viewable** levels are rendered with a `disabled` attribute (live after "make only this
  viewable": the selected 2nd floor row was enabled, every other row was `disabled`) — the summary table
  itself communicates which levels are hidden (OBSERVED `evidence/levels-extra.json`
  `unviewableRowsInDialog`).
- **Apply semantics** (OBSERVED bundle `LevelController.modifyLevels` / `doModifyLevel`): name →
  `setName`; viewable → `setViewable` **and** the current selection is pruned to
  `getViewableSublist(selection)`; elevation → `updateLevelElevation` which recomputes the
  `elevationIndex` within the new elevation group and shifts the following same-elevation levels down;
  elevationIndex → `updateLevelElevationIndex` swaps indices within the group; floorThickness/height →
  setters. If not in all-levels-visible mode it then re-derives the transient `visible` flags
  ("selected and below"). Everything posts a `LevelModificationUndoableEdit` that restores level, selected
  level and previous selection.
- **Renaming via the dialog** (INFERRED from the optimistic in-dialog table in round 1) is not
  separately testable here; but the `<select>`-rebuild evidence (2.2) shows a committed rename
  immediately propagates to the level selector, and a rename that is only typed into the dialog does not
  touch the model until OK.

### 2.9 Persistence, migration and localization

**OBSERVED** (`examples/*/Home.xml` in the round-1 folder + bundle XML reader/writer):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

`elevationIndex` is always written; `visible` and `viewable` only when false (default true).
`<home … selectedLevel='level1' wallHeight='250.0'>` names the selected level by id. The reader looks up
the level by id (`this.levels[attr("id")]`) before `home.addLevel`, and the `selectedLevel` attribute is
resolved after all levels are read. `printedLevel` elements exist for print output (round-1 Print
finding: `HomePrint` has `getPrintedLevels()` and the printable exposes `{$level}`), so level identity
also drives which levels appear in a plan print.

Localization (OBSERVED `res/localization.json` / `res/localization_de.json`): all level strings are
externalized, e.g. `HomePane.ADD_LEVEL.Name = "Add level"` / DE "Niveau hinzufügen",
`HomePane.ADD_LEVEL_AT_SAME_ELEVATION.Name = "Add level at same elevation"` / DE "Niveau auf selber Höhe
hinzufügen", `HomePane.DELETE_LEVEL.Name = "Delete level"` / DE "Niveau löschen",
`HomePane.MAKE_LEVEL_VIEWABLE.Name = "Make level viewable"` / DE "Niveau sichtbar machen",
`PlanController.levelName = "Level %d"` / DE "Niveau %d", `LevelPanel.viewableCheckBox.text = "Viewable"`
/ DE "Sichtbar", `LevelPanel.level.title = "Modify level"` / DE "Niveau bearbeiten",
`LevelPanel.levelsSummaryLabel.text` as above, columns Name/Elevation/Floor thickness/Height /
"Erhebung"/"Bodendicke"/"Höhe". The presence of `PlanController.undoAddLevelName`/`undoModifyLevelName`/
`undoModifyLevelViewabilityName` in both languages shows each level operation is a single undoable step.

### 2.10 Desktop vs browser feature parity for levels

| Aspect | Desktop Java | Browser edition |
| --- | --- | --- |
| Level chooser | `MultipleLevelsPlanPanel`: one tab per level + `+` tab (`resources/tab-add-level.png`) | native `<select id="level-selector">` floating top-right, hidden below 2 levels |
| Add level | `Plan > Levels > Add level` menu + `+` tab | "Add level" in the plan context menu |
| Add at same elevation | `Plan > Levels > Add level at same elevation` | "Add level at same elevation" in the plan context menu |
| Modify/delete level | `Plan > Levels > …` menu | "Modify selected level…" / "Delete selected level" in the plan context menu |
| Make viewable / only / all viewable | level menu / contextual menu bound to tabs (blog 6.5) | action map (reachable through the level/view menus that were ported); 3D display mode also in the 3D context menu |
| Display all / selected in 3D | `3D view > …` | 3D view context menu (`DISPLAY_ALL_LEVELS`, `DISPLAY_SELECTED_LEVEL`) |
| Select all at all levels | `Edit > Select all at all levels` | plan context menu (live: present in the captured menu) |

**INFERRED**: the browser build keeps the same controller/model layer and only swaps the Swing tab strip
for a `<select>`; `MultipleLevelsPlanPanel`, the `+` tab image and the `LEVELS_MENU` string are absent from
the JS bundle, and the level command strings that *are* present are the `HomePane` action names used by
the context menus. So the level data model and all level operations are identical across the two builds —
only the affordance differs.

## 3. Ideas for CasaPlazAI

Ranked by value-to-effort. Each idea cites the finding it comes from and how it lands on
`~/dsh-workspaces/rea2-shared/casaplazai-schema.md` (v1). The schema today has **no level/floor
entity**: `FloorplanData` = `schemaVersion`, `units`, `wallHeight`, `wallThickness`, `rooms`, `openings`,
`furniture`; roofs may only exist on the TOPMOST floor's rooms (`roof-not-top-floor`); the underlay is
editor-local `casaplaza.underlay.v1` keyed by `floorId` (`{ [floorId]: UnderlayState }`) and is
deliberately out of the document. So any level work needs a small schema addition plus editor-local
selection state.

1. **Add an explicit `floors` array + `floorId` on rooms/openings/furniture (HIGH value, MEDIUM effort).**
   Finding 2.1: SH3D succeeds because every `Elevatable` item stores a stable `level` reference and the
   level owns `elevation` (bottom), `floorThickness`, `height`, `elevationIndex`. CasaPlazAI already has
   editor-local `floorId` underlay keys but no persisted floor list; `FloorplanData` currently relies on
   "topmost floor" being implicit. A minimal v2 addition —
   `floors: { id, name, elevation, floorThickness, height, elevationIndex }[]` plus a `floorId` on each
   room/opening/furniture — would make roofs' `roof-not-top-floor` check computable (topmost = highest
   `(elevation, elevationIndex)`), give the underlay a persisted owner, and let the renderer/editor sort
   floors exactly as SH3D does. Keep `floorId` optional (`null` = legacy / single-floor) with a migration
   hook, mirroring the schema's existing migration convention.

2. **Split level state into persisted `viewable` and transient `visible` (HIGH value, LOW effort).**
   Finding 2.4: `viewable` is user intent and survives save/load (written only when false), while
   `visible` is derived from the display mode and is never persisted. CasaPlazAI should store only a
   `viewable` boolean per floor (editor-local, or in `floors` if it should round-trip) and compute
   `visible = viewable && modeAllows(floor, selectedFloor, allFloorsMode)` on every render, so a mode
   switch never mutates saved data and undo stays clean. SH3D's `isViewableAndVisible()` single predicate
   is the pattern to copy: one helper used by plan, 3D and hit-testing.

3. **"Display selected floor and below" as the default 3D mode (HIGH value, LOW effort).**
   Finding 2.7: `allLevelsVisible` defaults to false and the derived rule is "selected floor and every
   floor below is visible; everything above is hidden", with "display all floors" as an opt-in. This is
   the cheapest way to make multi-storey 3D legible without occlusion, and it needs only the floor sort +
   one boolean mode. Give it a 3D-view toggle exactly as SH3D does (`Display all levels` /
   `Display selected level`).

4. **Draw the adjacent floor as grey ghosting for trace-over drawing (HIGH value, MEDIUM effort).**
   Finding 2.5: SH3D picks the level above (when the selected level is the first of its elevation group)
   or below, filters it to `viewable`, and fills rooms `#808080` at alpha 0.1/0.2 with walls outline — a
   topology-aware alternative to a raster underlay. CasaPlazAI already has CSS-style styling and a
   `floorTexture` per room; the same trick (draw the neighbour floor's polygons behind the current floor
   at ~10–20 % opacity, skipping anything already drawn) would make cross-floor tracing much easier and
   complements issue #99's `casaplaza.underlay.v1` image underlay rather than replacing it.

5. **Two selection scopes + explicit cross-floor copy/paste (MEDIUM value, LOW effort).**
   Finding 2.6: `selectAll` (current floor, with staircase-like reach) vs `SELECT_ALL_AT_ALL_LEVELS`
   (`allLevelsSelection=true`), and copy-on-A / paste-on-B keeps plan coordinates. In CasaPlazAI terms:
   `Ctrl+A` selects the current floor (plus any object whose footprint reaches into it), a second command
   "select all on all floors" selects everything on viewable floors, and Paste re-parents to the current
   floor without moving the object. This is a small amount of hit-test/selection code and prevents the
   common "select all did something across my whole building" surprise.

6. **Reach rules for staircases and tall openings (MEDIUM value, LOW effort if data exists).**
   Finding 2.6: a piece of furniture is at the upper level when its top reaches that level's floor
   elevation; staircases use `>=` because of `staircaseCutOutShape`, while ordinary furniture uses `>`.
   For CasaPlazAI, the equivalent is "an opening/furniture belongs to the floor whose walkable band
   `[elevation, elevation + height)` contains the relevant edge", and stairs should be allowed to reach
   through `wallHeight`. If `FurnitureItem` gains an optional `floorSpan`/`reachesFloorId`, level
   hit-testing and 3D floors stay consistent.

7. **Elevation-index reordering for same-elevation floors, with an editable summary table (MEDIUM value,
   LOW-MEDIUM effort).** Finding 2.8: two levels may share an elevation (Attic + Roof at 524) and only
   `elevationIndex` orders them; the dialog exposes up/down buttons enabled solely when a same-elevation
   neighbour exists, plus a table of Name/Elevation/Floor thickness/Height with the lowest row's floor
   thickness blanked and un-viewable rows marked. CasaPlazAI's level dialog can follow this exact layout:
   sort-floors summary, disable floor thickness for the ground floor, and only allow reordering within an
   equal-elevation group.

8. **Cascade the selection when a floor becomes un-viewable (LOW value, LOW effort).** Finding 2.8
   `doModifyLevel`: after a viewability change the current selection is pruned to viewable items. Without
   this, un-checking a floor leaves invisible selected objects that later edits would touch.
   A one-line `selection.filter(isViewable)` on floor-viewability change prevents this class of bug.

9. **Lift the walk/fly camera by the elevation delta when the active floor changes (LOW-MEDIUM value, LOW
   effort).** Finding 2.7: SH3D adds `new.elevation − old.elevation` to the observer camera z (clamped
   above `10 + lowest level elevation`) when moving between levels, and never for same-elevation siblings.
   CasaPlazAI's Walk mode would benefit from the same "you are now on floor N, eye height follows" rule,
   with the clamp to avoid going under the ground floor.

10. **Reuse the level strings and undo granularity (LOW value, LOW effort).** Finding 2.9: one undoable
    step per level op (`undoAddLevelName`, `undoModifyLevelViewabilityName`, `undoModifyLevelName`) and
    fully externalized strings. CasaPlazAI should make "add floor", "rename floor", "toggle viewable"
    each a single undo entry, and keep the German strings mapped ("Niveau", "Niveau auf selber Höhe
    hinzufügen", "Sichtbar") if the app is bilingual.

**Note on roofs and schema constraints:** because `roofs` are only allowed on the TOPMOST floor
(`roof-not-top-floor`), adding the `floors` array (idea 1) should make "topmost" explicit rather than
inferred by list order, and the validator should recompute it from `(elevation, elevationIndex)`. That
also removes the current ambiguity when two floors share an elevation.

## 4. Unknowns

- **Exact undo/redo UI wording and enablement in the browser edition** for level ops was not exercised
  end-to-end (only the compiled undoable-edit classes and localization keys were read). The browser has no
  visible menu bar, so where Undo/Redo surface is unresolved (INFERRED: toolbar/keyboard only).
- **The zero-level state** was produced once **only** by calling `DELETE_LEVEL.actionPerformed()` after a
  single level remained; in that state `DELETE_LEVEL.isEnabled()` is `false` and the compiled code has an
  explicit "keep one level, reset it to elevation 0 / viewable true" branch (measured in
  `evidence/levels-delete.json`). So the intended invariant is "exactly one level always exists"; whether
  any keyboard accelerator or scripted path can still reach zero levels in the real UI is Unknown.
- **Level dialog "optimistic" table update**: round 1 noted the in-dialog table reordering before OK;
  this round's probes could not reproduce that reliably (the table read back consistently with the model,
  and reordering was only observed after apply). Treat "the table is optimistic/local" as unconfirmed.
- **Screen-reader semantics of the desktop Swing tabs** (JTabbedPane accessibility) — not examined; the
  browser `<select>` is inherently accessible, the Java tab strip is only DOCUMENTED as a `JPanel`
  (`MultipleLevelsPlanPanel`), not as a `JTabbedPane` (OBSERVED javadoc), so "real tabs" is partly
  INFERRED from the user guide and the `tab-add-level.png` asset.
- **Browser "Make level viewable/unviewable" reachability in the UI**: the actions exist and are enabled
  (2.2) but were only invoked through the action map, not clicked in a rendered menu; the plan context
  menu captured live did **not** list them (only add/modify/delete), so they may be reachable via the
  level selector's own context menu (not probed) or a toolbar overflow. Flagged for a future pass.
- **Mobile/touch behaviour** of the level selector (`@media (hover: none), (pointer: coarse)` guards the
  Swing popup menus in the bundle) was not tested; whether the `<select>` is repositioned on small
  viewports is unverified.
- **Exact staircase cut-out geometry rule** (`staircaseCutOutShape` + `isTopAtLevel` inclusive `>=`) is
  read from the compiled predicate; the source-level `StaircaseCutOutShape` shape semantics are in round 1
  and were not re-derived here.
- No `web_search` was available this round (search provider had no API key); all external evidence is
  direct-fetch (javadoc, product/German pages, shipped bundle, saved round-1 docs).
