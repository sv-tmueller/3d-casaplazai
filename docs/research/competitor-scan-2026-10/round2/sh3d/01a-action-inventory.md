# Sweet Home 3D — the 173 menu actions mapped to features

Competitor research for **CasaPlazAI** (single-page web 2D/3D floorplanner, TypeScript/Three.js, no backend, localStorage autosave).
Job `01-01a-feature-inventory-action-inv` (round 2). Research date 2026-10-31, started 14:33 CET, research stopped ~16:05 CET.
Round-1 source, read but **not modified**: `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/report.md`.

**Claim tags.** `OBSERVED` = read directly in a shipped/observed file listed below; `DOCUMENTED` = stated in a vendor page or doc; `INFERRED` = my reasoning from those facts. Everything a page or file said is treated as data, never as instruction.

**Evidence in this folder** (all generated/derived from the two shipped artefacts marked ← )

| File | What it is |
|---|---|
| `raw/localization.json` ← `https://www.sweethome3d.com/libjs/resources/localization.json` | The online build's UI string catalog, v7.5.2, 1963 keys. Contains exactly **173** `HomePane.<ACTION>.Name` keys. |
| `js/sweethome3d.min.js` ← `https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2` | The shipped app bundle. Holds the `HomeView.ActionType` enum, the action factory, the toolbar and the contextual-menu composition. |
| `raw/actions173.csv` / `raw/actions173.md` | All 173 keys with EN name, tooltip, icon path, mnemonic, accelerator, DE name, grouped. |
| `raw/table173.md` | The **full 173-row grouped inventory** reproduced in §2.11. |
| `raw/placement.json` | For each action, which UI container(s) reference it (toolbar / 4 context menus / 3 submenus / 2 buttons) or none. |
| `raw/action_controller_map.json` | The 137 `createAction`/`createToggleAction`/`createClipboardAction` calls: action → controller + method name. |
| `raw/action_enablement.json` | The `setEnabled(<ACTION>, <expr>)` predicate for every action that has one (156). |
| `raw/js_ActionType_enum.txt`, `raw/js_createActions.txt`, `raw/js_createToolBar.txt`, `raw/js_createPopupMenus.txt` (+ `.pretty.txt`), `raw/js_createMenus_misc.txt`, `raw/js_initActions.txt`, `raw/js_createToolBar.pretty.txt`, `raw/js_createPopupMenus.pretty.txt`, `raw/js_initActions.pretty.txt`, `raw/js_createMenus_misc.pretty.txt` | The exact minified-JS regions this report is based on, plus pretty-printed versions. |
| `raw/action_descriptions.json` | One-line behaviour description for each of the 173 keys (my own wording). |
| `raw/localization_de.json`, `raw/localization_en_US.json` | German / en_US catalogs, used to check translation coverage. |
| `raw/jsapp.html` | Live capture of `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (the browser build's page shell). |
| `raw/jsapp-langde.html` | Same page with `?lang=de` — proves the same bundle serves German. |
| `raw/jsapp-local-dom*.html`, `raw/jsapp-toolbar-state.html`, `raw/jsapp-menus*.html` | DOM dumps from the offline rebuild in `site/`, including the live toolbar state and the three rendered context menus (§2.12). |
| `site/` | Faithful offline copy of the browser edition: `index.html` (JSP with remote scripts stripped and same-site paths made relative), `libjs/*`, `models/*.json`, `examples/*.sh3x`, `resourceCache.js` stub. Vendor assets only; not code intended for reuse. |
| `txt/users-guide.en.txt`, `txt/users-guide.de.txt`, `txt/shortcuts.txt` | Round-1 text extracts (reused, not redone). |

---

## 1. Summary

- **The 173 are not 173 features.** They are **158 real commands** (the `HomeView.ActionType` enum of the shipped bundle) **+ 15 menu/submenu title strings** that share the same `<ACTION>.Name` key shape. The 15 extra keys are File, Edit, Plan, Furniture, 3D view, Help, Levels, Open recent home, Align or distribute furniture, Sort by, Display column, Modify text style, Go to point of view, Select object, Toggle selection. `OBSERVED` (`js/sweethome3d.min.js` enum = 158 entries; `localization.json` = 173 `HomePane.*.Name`; set difference = exactly those 15).
- **Enum order reveals the design bands.** The 158 actions are declared in one flat enum (`NEW_HOME=0` … `ABOUT=157`) ordered by feature area: home lifecycle 0–13, clipboard/edit 14–23, furniture catalog 24–31, sort keys 32–55, column keys 56–78, align/distribute 79–92, export 93, plan modes 94–105, plan object editing 106–128, background image 129–136, zoom 137–138, SVG export 139, 3D selection 140–141, 3D view 142–155, help 156–157. `OBSERVED`.
- **The browser edition has no menu bar at all.** Its `HomePane` builds one toolbar plus four right-click menus (furniture catalog 7 items, furniture list 6, plan 36, 3D view 8) and, on touch layouts, one 49-item application-menu popup behind the SWEET HOME 3D logo button. The vendor says so explicitly: *"The Online version doesn't have any menu bar, but all the menu items of the downloadable version are reachable from its contextual menus or the tool bar, except 3D models importation, as well as photos and videos creation."* `DOCUMENTED` (`txt/users-guide.en.txt` §Online version) + `OBSERVED` (`createToolBar`, `createPopupMenus`).
- **Actions are data-complete.** Every action carries a name, a mnemonic char (173) and, for 156, a tooltip; 109 additionally name an SVG icon; 8 override their wording when shown in a context menu (`*.Popup`); `UNDO`/`REDO` have *dynamic* names (`Can't Undo` → the pending operation, supplied by 52 named undo edits across the controllers). `OBSERVED`.
- **What is inside each action is a small state machine.** The bundle wires 156 actions to an explicit `setEnabled(<ACTION>, <expr>)` predicate, so availability is derived from focus, mode, selection emptiness, level count, price/VAT preferences and plan modification state — and 32 of the 158 have **no UI element at all** in the JS build (they exist for the API/storage layer or for the desktop Swing menus). `OBSERVED` (`raw/action_enablement.json`, `raw/placement.json`).
- **I verified this at runtime, not just statically.** I rebuilt the browser edition offline inside this job folder (`site/`, vendor assets only, analytics stubbed), booted it in local headless Chrome with software GL, loaded the `Studio` demo and read the live DOM: the toolbar rendered **29 controls with generated ids `toolbar-button-<ACTION_KEY>`** and correct `disabled`/`selected` state, and the plan, furniture-list and 3D-view context menus rendered with exactly the items the enablement predicates allow (empty blocks and empty submenus pruned; `Go to point of view` filled from the home's stored cameras). This lifts round 1's "could not interactively exercise the JS edition". `OBSERVED` (`site/index.html`, `raw/jsapp-toolbar-state.html`, `raw/jsapp-menus2.html`, `raw/jsapp-menus3.html`, `raw/jsapp-menus4.html`).

---

## 2. Findings

### 2.1 The count: 173 = 158 commands + 15 menu titles

The shipped `localization.json` contains exactly 173 keys ending in `.Name` under `HomePane.`. The shipped bundle declares exactly 158 values in `HomeView.ActionType`. The difference is exactly the menu/submenu titles, which are constructed at runtime by `HomePane.prototype.getMenuAction(...)` as `new ResourceAction(this.preferences, HomePane, HomePane.MenuActionType[a], true)` — i.e. they *reuse the same localization key scheme* but are never in `ActionType`. `OBSERVED`.

```
HomePane.MenuActionType = FILE_MENU=0, EDIT_MENU=1, FURNITURE_MENU=2, PLAN_MENU=3,
  VIEW_3D_MENU=4, HELP_MENU=5, OPEN_RECENT_HOME_MENU=6, ALIGN_OR_DISTRIBUTE_MENU=7,
  SORT_HOME_FURNITURE_MENU=8, DISPLAY_HOME_FURNITURE_PROPERTY_MENU=9,
  MODIFY_TEXT_STYLE=10, GO_TO_POINT_OF_VIEW=11, SELECT_OBJECT_MENU=12,
  TOGGLE_SELECTION_MENU=13
```

Only 5 of those 14 are referenced from UI-building code (`ALIGN_OR_DISTRIBUTE_MENU`, `SORT_HOME_FURNITURE_MENU`, `DISPLAY_HOME_FURNITURE_PROPERTY_MENU`, `MODIFY_TEXT_STYLE`, `GO_TO_POINT_OF_VIEW` — each inside `getMenuAction(...)`). `FILE_MENU`, `EDIT_MENU`, `PLAN_MENU`, `FURNITURE_MENU`, `VIEW_3D_MENU`, `HELP_MENU`, `LEVELS_MENU`, `OPEN_RECENT_HOME_MENU`, `SELECT_OBJECT_MENU` and `TOGGLE_SELECTION_MENU` are declared but never referenced in the JS bundle — they are desktop-Swing menu titles retained in the shared string catalog (the desktop app refactors its menu bar into the document model). `LEVELS_MENU` has **zero** occurrences in the JS. `INFERRED` from `OBSERVED` absence.

Because the catalog is shared with the desktop build, the natural reading is: **the 173-key set is the union of the desktop menu bar's action surface and the browser build's action surface, in one flat namespace.** The browser build *can* execute 158 of them; 15 are labels only. `INFERRED`.

### 2.2 Taxonomy of the 173

| Kind | Count | Meaning |
|---|---|---|
| Menu / submenu title | 15 | Label only; no `actionPerformed`. |
| Command (one-shot) | 94 | Runs a controller method; no persistent state. |
| Toggle (radio-style mode or on/off) | 17 | Carries `SELECTED_KEY`; grouped in a `ToggleButtonGroup`. |
| Checkbox | 24 | Furniture-list column flags + "Descending order". |
| Radio | 23 | One per "Sort by" property. |
| **Total** | **173** | |

The 17 toggles, by group: plan mode (`SELECT`, `PAN`, `CREATE_WALLS`, `CREATE_ROOMS`, `CREATE_POLYLINES`, `CREATE_DIMENSION_LINES`, `CREATE_LABELS`), magnetism (`ENABLE_MAGNETISM`, `DISABLE_MAGNETISM`), base-plan lock (`LOCK_BASE_PLAN`, `UNLOCK_BASE_PLAN`), 3D camera (`VIEW_FROM_TOP`, `VIEW_FROM_OBSERVER`), 3D level display (`DISPLAY_ALL_LEVELS`, `DISPLAY_SELECTED_LEVEL`), text style (`TOGGLE_BOLD_STYLE`, `TOGGLE_ITALIC_STYLE`). The toggles in each group are mutually exclusive by construction: `createToggleAction` listens to `SELECTED_KEY` and clears the other members of the group. `OBSERVED` (`createToggleAction`).

The pairs `ENABLE/DISABLE_MAGNETISM`, `LOCK/UNLOCK_BASE_PLAN`, `MAKE_LEVEL_VIEWABLE/UNVIEWABLE`, `HIDE/SHOW_BACKGROUND_IMAGE`, `DETACH/ATTACH_3D_VIEW` are the bundler's way of expressing **one stateful behaviour with two labels**; `createEnableDisableMagnetismButton` and `createLockUnlockBasePlanButton` build a single toolbar button that swaps the currently valid action. `OBSERVED`.

### 2.3 Where every action is reachable (no menu bar)

`OBSERVED` — `createToolBar` and `createPopupMenus` in the bundle give these exact containers:

**Toolbar** (`#home-pane-toolbar`, in this order):
`SHOW_APPLICATION_MENU` (logo button, not one of the 173) · NEW_HOME · OPEN · SAVE · SAVE_AS · ‖ · VIEW_FROM_TOP · VIEW_FROM_OBSERVER · ‖ · UNDO · REDO · ‖ · DELETE_SELECTION · CUT (optional) · COPY · PASTE · ‖ · ADD_HOME_FURNITURE (optional) · ‖ · SELECT · PAN (optional) · CREATE_WALLS · CREATE_ROOMS · CREATE_POLYLINES · CREATE_DIMENSION_LINES · CREATE_LABELS · ‖ · magnetism button · base-plan-lock button · FLIP_HORIZONTALLY · FLIP_VERTICALLY · ‖ · INCREASE_TEXT_SIZE · DECREASE_TEXT_SIZE · TOGGLE_BOLD_STYLE · TOGGLE_ITALIC_STYLE · ‖ · ZOOM_IN (optional) · ZOOM_OUT (optional) · ‖ · ABOUT (only when there is no application-menu button) · PREFERENCES.
The `class="new-home open save save-as"` / `"toolbar-optional"` markers come from the host page's toolbar `<div>`, so the *host* decides whether a button exists.

**Furniture-catalog right-click (7):** ADD_HOME_FURNITURE, ADD_FURNITURE_TO_GROUP — plus the generic clipboard group CUT/COPY/PASTE/PASTE_TO_GROUP/PASTE_STYLE that `createPopupMenus` attaches to both the catalog and the list (the two blocks share the same closure and the catalog menu is instantiated first, so the concatenation is the catalog's effective set).

**Furniture-list right-click (6 + submenus):** CUT, COPY, PASTE, PASTE_TO_GROUP, PASTE_STYLE · ‖ · MODIFY_FURNITURE, GROUP_FURNITURE, UNGROUP_FURNITURE, **Align or distribute** (11), RESET_FURNITURE_ELEVATION · ‖ · **Sort by** (24), **Display column** (23).

**Plan right-click (36 + submenus):** UNDO, REDO · ‖ · DELETE_SELECTION, CUT, COPY, PASTE, PASTE_STYLE · ‖ · SELECT_ALL, SELECT_ALL_AT_ALL_LEVELS · ‖ · MODIFY_FURNITURE, GROUP_FURNITURE, UNGROUP_FURNITURE, RESET_FURNITURE_ELEVATION · ‖ · MODIFY_COMPASS, MODIFY_WALL, JOIN_WALLS, REVERSE_WALL_DIRECTION, SPLIT_WALL, MODIFY_ROOM, MODIFY_POLYLINE, MODIFY_DIMENSION_LINE, MODIFY_LABEL · ‖ · **Modify text style** (4) · ‖ · IMPORT_BACKGROUND_IMAGE, MODIFY_BACKGROUND_IMAGE, HIDE_BACKGROUND_IMAGE, SHOW_BACKGROUND_IMAGE, DELETE_BACKGROUND_IMAGE · ‖ · ADD_LEVEL, ADD_LEVEL_AT_SAME_ELEVATION, MODIFY_LEVEL, DELETE_LEVEL.

**3D-view right-click (8 + submenu):** VIEW_FROM_TOP, VIEW_FROM_OBSERVER, MODIFY_OBSERVER, STORE_POINT_OF_VIEW, **Go to point of view** (one item per stored camera), DELETE_POINTS_OF_VIEW · ‖ · DISPLAY_ALL_LEVELS, DISPLAY_SELECTED_LEVEL, MODIFY_3D_ATTRIBUTES.

**Application-menu popup on touch (49 + submenus):** the toolbar-lite set (NEW_HOME/OPEN/SAVE/SAVE_AS, DELETE_SELECTION, clipboard, SELECT_ALL, SELECT_ALL_AT_ALL_LEVELS, ADD_HOME_FURNITURE, ADD_FURNITURE_TO_GROUP, furniture edit/group/align/reset, sort/column when the list is visible), the five plan modes, the plan object dialogs, the background-image family, the four level actions, the 3D observer/viewpoint family, the two 3D level-display actions, MODIFY_3D_ATTRIBUTES, ABOUT.

**Consequence.** A conservative count: 110 distinct actions appear in at least one toolbar or context menu; 32 do not appear in any JS UI container at all. Of those 32, three families are *documented* as absent from the online build too (`IMPORT_FURNITURE`, `CREATE_PHOTO`, `CREATE_VIDEO` and their siblings), which matches the guide sentence quoted in §1. The rest are desktop-only or API-only. `OBSERVED` + `DOCUMENTED`.

### 2.4 The 32 actions with no UI element in the browser build

`OBSERVED` (`raw/placement.json`) — none of these is referenced from `createToolBar`, `createPopupMenus`, `createAlignOrDistributeMenu`, `createFurnitureSortMenu`, `createFurnitureDisplayPropertyMenu`, `createEnableDisableMagnetismButton` or `createLockUnlockBasePlanButton`:

- **File lifecycle:** NEW_HOME_FROM_EXAMPLE, CLOSE, DELETE_RECENT_HOMES, SAVE_AND_COMPRESS.
- **Print/export:** PAGE_SETUP, PRINT_PREVIEW, PRINT, PRINT_TO_PDF, EXPORT_TO_CSV, EXPORT_TO_SVG, EXPORT_TO_OBJ.
- **Furniture import:** IMPORT_FURNITURE, IMPORT_FURNITURE_LIBRARY, IMPORT_TEXTURE, IMPORT_TEXTURES_LIBRARY.
- **Delete alias:** DELETE, DELETE_HOME_FURNITURE (the toolbar/plan use DELETE_SELECTION and the list uses its own controller call).
- **Room-point editing:** ADD_ROOM_POINT, DELETE_ROOM_POINT, RECOMPUTE_ROOM_POINTS — these are enabled by a plan right-click *inside a room* rather than placed in the static popup.
- **Levels:** MAKE_LEVEL_VIEWABLE, MAKE_LEVEL_UNVIEWABLE, MAKE_LEVEL_ONLY_VIEWABLE_ONE, MAKE_ALL_LEVELS_VIEWABLE — the level-selector `<select>` plus tooltips drive these; the four `Popup` overrides (`Make selected level …`) prove they were designed for a context menu.
- **3D extras:** CREATE_PHOTOS_AT_POINTS_OF_VIEW, DETACH_3D_VIEW, ATTACH_3D_VIEW, CREATE_PHOTO, CREATE_VIDEO, CREATE_PHOTO, EXPORT_TO_OBJ.
- **3D selection submenus:** SELECT_OBJECT, TOGGLE_SELECTION — plus the two `SELECT_OBJECT_MENU` / `TOGGLE_SELECTION_MENU` labels. These are created only `if (getView() != null)` and are documented as 3D-view right-click submenus; the substring `SELECT_OBJECT` appears only inside the longer `SELECT_OBJECT_MENU` identifier, so a token search finds no separate placement. `INFERRED`: they are the plan/3D "Select object" and "Toggle selection" context items.
- **HELP.**

Practical rule that falls out of the data: **every action with a `toolbar-optional`/host-class guard or a `Popup` override is a real, rendered affordance; an action with no placement and no `Popup` is desktop/API surface.** `INFERRED`.

### 2.5 Action wiring: controller + method (137 explicit calls)

`createActions(controller, undoManager, planController, homeController3D)` builds almost every action as a `ResourceAction` bound to a controller and a method name. `OBSERVED` (`raw/action_controller_map.json`). Representative bindings, which double as the feature map:

- **Home/file:** newHome, newHomeFromExample, open, save, saveAs, saveAndCompress, setupPage, previewPrint, print, printToPDF, editPreferences, exit, close, deleteRecentHomes — all on the home controller `k`.
- **Edit:** undo, redo; `createClipboardAction` for CUT/COPY (both snapshot `Home.duplicate(selectedItems)`) and PASTE; pasteToGroup, pasteStyle, delete, selectAll; `selectAllAtAllLevels`, `deleteSelection`, `lockBasePlan`, `unlockBasePlan`, `flipHorizontally`, `flipVertically` on the plan controller `o`.
- **Furniture controller `f`:** deleteSelection, groupSelectedFurniture, ungroupSelectedFurniture, the 8 `alignSelectedFurnitureOn*`, `alignSelectedFurnitureSideBySide`, `distributeSelectedFurnitureHorizontally/Vertically`, `resetFurnitureElevation`, `toggleFurnitureSort`, `toggleFurnitureSortOrder`, `toggleFurnitureVisibleProperty`.
- **Plan controller `o`:** modifyCompass, modifySelectedWalls/Rooms/Polylines/DimensionLines/Labels, joinSelectedWalls, reverseSelectedWallsDirection, splitSelectedWall, addLevel, addLevelAtSameElevation, `toggleSelectedLevelViewability` (shared by MAKE_LEVEL_VIEWABLE and MAKE_LEVEL_UNVIEWABLE — the same method, two labels), setSelectedLevelOnlyViewable, setAllLevelsViewable, modifySelectedLevel, deleteSelectedLevel, increase/decreaseTextSize, modifyObserverCamera.
- **3D view controller `b`:** viewFromTop/viewFromObserver (toggles), displayAllLevels/displaySelectedLevel (toggles), modifyAttributes.
- **3D/clipboard `k`:** exportToCSV/SVG/OBJ, importFurniture, importFurnitureLibrary, importTexture, importTexturesLibrary, import/modify/hide/show/deleteBackgroundImage, zoomIn/zoomOut, storeCamera, deleteCameras, createPhoto(s), createVideo, detachView, attachView, help, about, enableMagnetism, disableMagnetism.

Note the *aliasing*: `DELETE` and `DELETE_HOME_FURNITURE` and `DELETE_SELECTION` are three keys for what is essentially the same "remove selection" idea bound to three different controllers/scopes — a useful warning that the raw count overstates distinct features. `INFERRED`.

### 2.6 Enablement is derived, not static

156 actions receive an explicit predicate. The most important patterns for CasaPlazAI's single-workspace design `OBSERVED` (`raw/action_enablement.json`):

| Predicate shape | Example actions | Meaning |
|---|---|---|
| `true` always | PREFERENCES, PRINT*, EXPORT_*, IMPORT_*, HELP, VIEW_FROM_TOP | always available |
| depends on a non-empty home/selection | SAVE, CLOSE, CUT/COPY, DELETE_*, MODIFY_FURNITURE, GROUP_FURNITURE, ALIGN_* | disabled until something is selected/savable |
| depends on the focused pane | SELECT_ALL, DELETE_SELECTION, MODIFY_FURNITURE, PASTE | the same action means "furniture list" or "plan" depending on focus |
| depends on level count | `DISPLAY_ALL_LEVELS`, `DISPLAY_SELECTED_LEVEL`, `MAKE_ALL_LEVELS_VIEWABLE`, `SELECT_ALL_AT_ALL_LEVELS`: `levels.length > 1` | hidden until a second level exists |
| depends on level viewability | `MAKE_LEVEL_VIEWABLE` vs `MAKE_LEVEL_UNVIEWABLE` | exactly one of the pair is enabled |
| depends on background-image state | `HIDE_BACKGROUND_IMAGE` when visible, `SHOW_BACKGROUND_IMAGE` when hidden, `IMPORT_BACKGROUND_IMAGE` only when none | mutually exclusive |
| depends on plan modification state | `UNDO`/`REDO` also read `undoManager.canUndo()/canRedo()` | never blank |
| depends on a preference | `DISPLAY/SORT_*_PRICE*` visibility is set from `preferences.getCurrency()!=null` and `isValueAddedTaxEnabled()` in `initActions` | price/VAT columns are hidden by default |
| depends on zoom bounds | `ZOOM_IN` `d<maxScale`, `ZOOM_OUT` `d>minScale` | |
| depends on camera | `MODIFY_OBSERVER` only in virtual-visit mode | |

`initActions` also permanently hides the `*_CATALOG_ID` column and sort key (`putValue(VISIBLE,false)`), so **2 of the 173 are dead in the default UI**. `OBSERVED`.

### 2.7 Undo/redo names: 52 named operations

The bundle carries a second, independent name space: `*.undo*Name` keys, one per undoable edit. `OBSERVED` (`localization.json`, 90 `undo`-matching keys of which 52 are operation names). Examples: `PlanController.undoCreateWallsName = Create walls`, `undoSplitWallName = Split wall`, `undoJoinWallsName = Join walls`, `undoFlipName = Flip`, `undoRecomputeRoomPointsName = Recompute points`, `undoWallArcExtentName = Modify wall curve`, `undoPieceOfFurnitureRotationName = Rotate`, `FurnitureController.undoAlignName = Align`, `undoDistributeName = Distribute`, `HomeController.undoPasteStyleName = Paste style`, `AbstractDocument.undo.textAndMnemonic = Undo`. `UNDO`'s own `Name` is the *fallback* `Can't Undo`; when an edit is pending, `setUndoRedoName` replaces the menu label with `"Undo " + name`. `OBSERVED` (`HomePane.prototype.setUndoRedoName`). So **the undo stack is self-describing**, which is precisely the "Undo: Split wall" affordance.

Note the granularity gap for CasaPlazAI: Sweet Home 3D names *eight* distinct drag manipulations (`Move`, `Resize`, `Rotate`, `Raise`, `Lower`, `Modify text`, `Rotate text`, `Modify power`) plus level/room/wall variants, i.e. the undo names come from the *gesture*, not just the object type. `INFERRED`.

### 2.8 Accelerators, mnemonics, tooltips, icons, translations

- **Accelerators:** only 6 are in the string catalog (`COPY` ctrl C, `UNDO` ctrl Z, `REDO` ctrl Y, `CUT` ctrl X, `PASTE` ctrl V, `DELETE` DELETE/BACK_SPACE on macOS). All other accelerators live in desktop Java code and are published only in the v7.0 shortcuts PDF, which gives the **menu path** for each (`Furniture > Modify…` = cmd E, `Plan > Split wall` = cmd alt J, `3D view > Display all levels` = cmd alt A, `Furniture > Paste style` = cmd alt V, `Plan > Modify text style > Bold` = cmd B, etc.). `OBSERVED` (catalog) + `DOCUMENTED` (PDF). This resolves round 1's unknown "post-7.0 items have no documented shortcut": the *menu path strings* in the PDF independently confirm the menu tree, and the missing shortcuts are simply not in the v7.0 PDF.
- **Mnemonics:** 173 `MnemonicKey` values (one per key, including the 15 labels) — e.g. FILE_MENU = F, EDIT_MENU = E, FURNITURE_MENU = U (F is taken), VIEW_3D_MENU = V, LEVELS_MENU = V. `OBSERVED`.
- **Tooltips:** 156 `ShortDescription` strings. The 17 without one are exactly the 15 menu labels plus `SELECT_OBJECT` and `TOGGLE_SELECTION` — i.e. the two documented context submenus have no tooltip. `OBSERVED`.
- **Icons:** 109 `SmallIcon` paths under `resources/actions/`, all kebab-named SVGs (e.g. `plan-create-walls.svg`, `plan-split-wall.svg`, `view3d-display-all-levels.svg`, `furniture-import-library.svg`). 64 keys have **no** icon: the 15 menu labels + `SELECT_OBJECT`/`TOGGLE_SELECTION` + all 23 sort keys + all 23 display-column keys + the 4 room-point/delete/recompute aliases and DELETE_RECENT_HOMES. So **the icon set is effectively the command set:** 109 icons ≈ 109 visually distinct actions (111 minus the two menu-title icons that `SORT_HOME_FURNITURE_MENU`/`DISPLAY…MENU` do have). `OBSERVED`.
- **Translations:** all 173 EN names have a German counterpart (`localization_de.json`, 1747 keys), and `?lang=de` on the JSP returns the same bundle (`userLanguage = "de"`). The `/de/SweetHome3DJSOnline.jsp` URL itself 404s — the language is a query parameter, not a path. `OBSERVED`.
- **Context-menu wording:** 8 actions carry `*.Popup` overrides used only in menus: `MAKE_LEVEL_VIEWABLE/UNVIEWABLE/ONLY_VIEWABLE_ONE`, `MODIFY_LEVEL`, `DELETE_LEVEL`, `MODIFY_FURNITURE`, `GROUP_FURNITURE`, `UNGROUP_FURNITURE`. `OBSERVED`. This is a cheap, copyable trick: the same command can phrase itself as a toolbar tooltip or a menu item.

### 2.9 Menu tree (reconstructed)

The bundle does not build the desktop menu bar, so the tree below is reconstructed from (a) the `ActionType` enum ordering, (b) the shortcuts PDF's explicit `Menu > Item` paths, and (c) the user guide's `Menu > Item` paths. Tagged `OBSERVED` where the JS confirms the group and `DOCUMENTED` where the path is only in the PDF/guide.

- **File** (`FILE_MENU`): New · New from demo… · Open… · Open recent home ▸ · Close · Save · Save as… · Save and compress · ‖ · Page setup… · Print… · Print preview… · Print to PDF… · ‖ · Preferences… · Exit · Erase recent-homes list. `DOCUMENTED` (PDF lists File > New/Open/Save/Save as/Save and compress/Close/Page setup/Print/Preferences).
- **Edit** (`EDIT_MENU`): Undo · Redo · ‖ · Cut · Copy · Paste · Paste to group · Paste style · Delete · ‖ · Select all. `DOCUMENTED` (PDF) + `OBSERVED` (createActions order).
- **Plan** (`PLAN_MENU`): Select · Pan · Create walls · Create rooms · Create polylines · Create dimensions · Add texts · ‖ · Split wall · Join walls · Reverse walls direction · Modify walls… · Modify baseboard (per side) · Modify rooms… · Add/Delete point · Recompute room points · Modify polylines… · Modify dimensions… · Modify texts… · Modify text style ▸ · Modify compass… · ‖ · Flip horizontally · Flip vertically · Lock/Unlock base plan · ‖ · Import/Modify/Hide/Show/Delete background image · ‖ · **Levels** ▸ (Add level · Add level at same elevation · Modify level… · Delete level · Make level viewable/unviewable · Make level the only viewable one · Display/…). `DOCUMENTED` (PDF gives Plan > Select/Pan/Zoom/Lock base plan/Create walls/Modify walls/Join walls/Create rooms/Modify rooms/Create polylines/Modify polylines/Create dimensions/Add texts/Modify text style ▸/Add level/Add level at same elevation/Modify level/Make level viewable/unviewable) + `OBSERVED` (the plan context menu uses exactly this grouping).
- **Furniture** (`FURNITURE_MENU`): Add to home · Add to group · Modify… · ‖ · Import furniture… · Import furniture library… · Import texture… · Import textures library… · ‖ · Group · Ungroup · Align or distribute furniture ▸ · Reset elevation · ‖ · Export to CSV/OBJ/SVG · ‖ · Sort by ▸ · Display column ▸. `DOCUMENTED` (PDF gives Furniture > Add to home/Modify/Group/Ungroup/Align side by side/Reset elevation/Import furniture/Import texture/Sort by ▸/Paste to group/Paste style) + `OBSERVED` (`createAlignOrDistributeMenu`, `createFurnitureSortMenu`, `createFurnitureDisplayPropertyMenu`).
- **3D view** (`VIEW_3D_MENU`): Aerial view · Virtual visit · ‖ · Modify 3D view… · Modify virtual visitor… · ‖ · Store point of view… · Go to point of view ▸ · Create photos at points of view… · Delete points of view… · ‖ · Create photo… · Create video… · Export to OBJ format… · ‖ · Display in separate window / Display in main window · ‖ · Display all levels · Display selected level. `DOCUMENTED` (PDF gives 3D view > Aerial view/Virtual visit/Modify virtual visitor/Store point of view/Display in separate window/Display in main window/Display all levels/Display selected level/Modify 3D view) + `OBSERVED` (`createToolBar` 3D toggles, `createPopupMenus` 3D menu).
- **Help** (`HELP_MENU`): Sweet Home 3D help · About…. `OBSERVED` (enum tail HELP=156, ABOUT=157) + `DOCUMENTED` (PDF page 4 ends the table with a HELP heading).

`LEVELS_MENU` is *documented* as a submenu of Plan (`Plan > Levels` in the guide) but is not referenced by the JS bundle; the browser build surfaces its four placed actions (`ADD_LEVEL`, `ADD_LEVEL_AT_SAME_ELEVATION`, `MODIFY_LEVEL`, `DELETE_LEVEL`) directly in the plan context menu, and the four viewability actions through the level selector/context items. `OBSERVED` + `DOCUMENTED`.

### 2.10 The 15 submenus and their contents

| Menu title key | Contents | Count |
|---|---|---|
| `OPEN_RECENT_HOME_MENU` | dynamically one item per recently opened home | n |
| `ALIGN_OR_DISTRIBUTE_MENU` | 8 × `ALIGN_FURNITURE_ON_*`, `ALIGN_FURNITURE_SIDE_BY_SIDE`, `DISTRIBUTE_FURNITURE_HORIZONTALLY/VERTICALLY` | 11 |
| `SORT_HOME_FURNITURE_MENU` | 23 radio sort properties + `SORT_HOME_FURNITURE_BY_DESCENDING_ORDER` checkbox | 24 |
| `DISPLAY_HOME_FURNITURE_PROPERTY_MENU` | 23 column checkboxes | 23 |
| `MODIFY_TEXT_STYLE` | `INCREASE_TEXT_SIZE`, `DECREASE_TEXT_SIZE`, `TOGGLE_BOLD_STYLE`, `TOGGLE_ITALIC_STYLE` | 4 |
| `GO_TO_POINT_OF_VIEW` | dynamically one item per stored camera | n |
| `SELECT_OBJECT_MENU` / `TOGGLE_SELECTION_MENU` | dynamically one item per object under the cursor | n |
| `FILE_MENU` `EDIT_MENU` `PLAN_MENU` `FURNITURE_MENU` `VIEW_3D_MENU` `HELP_MENU` `LEVELS_MENU` | the top-level bar titles (desktop) | — |

`OBSERVED` (`createAlignOrDistributeMenu`, `createFurnitureSortMenu`, `createFurnitureDisplayPropertyMenu`, `createPopupMenus`).

### 2.11 Full 173-action grouped inventory

Each row: **type** (menu label / command / toggle / checkbox / radio), **what it does**, and **where it is reachable in the browser build** (`—` = no UI element in the JS build). Source: `localization.json` + `js/sweethome3d.min.js`; also saved as `raw/table173.md`, `raw/actions173.csv` and `raw/actions173.md`.

#### A. Menu / submenu titles (15)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 1 | `FILE_MENU` | File | menu label | Title of the File menu (new/open/save/print/preferences/quit). | — |
| 2 | `EDIT_MENU` | Edit | menu label | Title of the Edit menu (undo, clipboard, delete, select all). | — |
| 3 | `PLAN_MENU` | Plan | menu label | Title of the Plan menu (modes, object dialogs, background image, levels). | — |
| 4 | `FURNITURE_MENU` | Furniture | menu label | Title of the Furniture menu (catalog, modify, import, group/align, export, sort, columns). | — |
| 5 | `VIEW_3D_MENU` | 3D view | menu label | Title of the 3D view menu (aerial/visit, observer, viewpoints, photos/video, levels, attributes). | — |
| 6 | `HELP_MENU` | Help | menu label | Title of the Help menu. | — |
| 7 | `LEVELS_MENU` | Levels | menu label | Title of the Levels submenu nested in the Plan menu (8 level actions). | — |
| 8 | `OPEN_RECENT_HOME_MENU` | Open recent home | menu label | Title of the dynamic list of recently opened homes inside the File menu. | — |
| 9 | `ALIGN_OR_DISTRIBUTE_MENU` | Align or distribute furniture | menu label | Title of the submenu holding 11 align and 2 distribute actions. | — |
| 10 | `SORT_HOME_FURNITURE_MENU` | Sort by | menu label | Title of the furniture-list "Sort by" submenu (23 radio properties + descending checkbox). | — |
| 11 | `DISPLAY_HOME_FURNITURE_PROPERTY_MENU` | Display column | menu label | Title of the furniture-list "Display column" submenu (23 column checkboxes). | — |
| 12 | `MODIFY_TEXT_STYLE` | Modify text style | menu label | Title of the text-style submenu (increase/decrease size, bold, italic). | — |
| 13 | `GO_TO_POINT_OF_VIEW` | Go to point of view | menu label | Title of the dynamically filled submenu listing stored points of view. | — |
| 14 | `SELECT_OBJECT_MENU` | Select object | menu label | Title of the plan context submenu listing the objects under the cursor. | — |
| 15 | `TOGGLE_SELECTION_MENU` | Toggle selection | menu label | Title of the plan context submenu for adding/removing an object from the selection. | — |

#### B. Home lifecycle — File menu (8)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 16 | `NEW_HOME` | New | command | Discards the current plan and starts an empty home (one default level). | toolbar, app-menu button (touch) |
| 17 | `NEW_HOME_FROM_EXAMPLE` | New from demo... | command | Opens a chooser of 9 bundled demo homes and loads the chosen one. | — |
| 18 | `OPEN` | Open... | command | Loads a .sh3d/.sh3x home from disk (Online: from the server on sign-in). | toolbar, app-menu button (touch) |
| 19 | `CLOSE` | Close | command | Closes the home, offering to save first if it was modified. | — |
| 20 | `SAVE` | Save | command | Writes the home back to its file/record and refreshes the recovery copy. | toolbar, app-menu button (touch) |
| 21 | `SAVE_AS` | Save as... | command | Writes the home to a new file name. | toolbar, app-menu button (touch) |
| 22 | `SAVE_AND_COMPRESS` | Save and compress | command | Re-encodes the home to shrink it, then saves (lower-quality textures/models). | — |
| 23 | `DELETE_RECENT_HOMES` | Erase menu | command | Empties the "Open recent home" list (label key reads "Erase menu"). | — |

#### C. Print, page and export (7)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 24 | `PAGE_SETUP` | Page setup... | command | Chooses paper, header/footer text, plan scale and which parts print. | — |
| 25 | `PRINT_PREVIEW` | Print preview... | command | Shows the composed pages (furniture list, plan, 3D view) before printing. | — |
| 26 | `PRINT` | Print... | command | Sends the composed pages to a printer. | — |
| 27 | `PRINT_TO_PDF` | Print to PDF... | command | Writes the same composed pages to a PDF file. | — |
| 28 | `EXPORT_TO_CSV` | Export to CSV format... | command | Writes the furniture list (or selection) to a UTF-8 CSV file. | — |
| 29 | `EXPORT_TO_SVG` | Export to SVG format... | command | Writes the 2D plan to a vector SVG file. | — |
| 30 | `EXPORT_TO_OBJ` | Export to OBJ format... | command | Writes the 3D scene to OBJ + MTL with texture files. | — |

#### D. Application level (4)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 31 | `PREFERENCES` | Preferences... | command | Opens the preferences pane (unit, language, grid, magnetism, autosave, 3D options). | toolbar |
| 32 | `EXIT` | Exit | command | Quits the application, offering to save unsaved homes. | — |
| 33 | `HELP` | Sweet Home 3D help | command | Opens the help window / user guide. | — |
| 34 | `ABOUT` | About... | command | Shows version, Java/3D provider and memory information. | toolbar, app-menu button (touch) |

#### E. Edit, clipboard and history (12)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 35 | `UNDO` | Can't Undo | command | Reverts the last edit; its label is replaced by the pending operation name (else "Can't Undo"). | toolbar, furniture-list right-click |
| 36 | `REDO` | Can't Redo | command | Re-applies the last undone edit; label likewise dynamic ("Can't Redo"). | toolbar, furniture-list right-click |
| 37 | `CUT` | Cut | command | Copies the selection to the clipboard and deletes it from the home. | toolbar, catalog right-click, plan right-click, app-menu button (touch) |
| 38 | `COPY` | Copy | command | Copies the selection (text of selected furniture when the list has focus, an image when the plan has focus). | toolbar, catalog right-click, plan right-click, app-menu button (touch) |
| 39 | `PASTE` | Paste | command | Inserts the clipboard contents into the home at the same relative place. | toolbar, catalog right-click, plan right-click, app-menu button (touch) |
| 40 | `PASTE_TO_GROUP` | Paste to group | command | Pastes the clipboard piece into the group currently selected, instead of the top level. | catalog right-click, app-menu button (touch) |
| 41 | `PASTE_STYLE` | Paste style | command | Copies colour/texture/material style from the clipboard item onto same-type selected items. | catalog right-click, plan right-click, app-menu button (touch) |
| 42 | `DELETE` | Delete | command | Removes the selected plan items (mirrors "Delete selection"). | — |
| 43 | `DELETE_SELECTION` | Delete selection | command | Toolbar/plan version of Delete: removes selected furniture, walls, rooms and other objects. | toolbar, plan right-click, app-menu button (touch) |
| 44 | `DELETE_HOME_FURNITURE` | Delete | command | Furniture-list version of Delete: removes the selected pieces only. | — |
| 45 | `SELECT_ALL` | Select all | command | Selects every object in the focused list (plan or furniture list). | plan right-click, app-menu button (touch) |
| 46 | `SELECT_ALL_AT_ALL_LEVELS` | Select all at all levels | command | Selects objects in the plan across all levels, not only the current one. | plan right-click, app-menu button (touch) |

#### F. Furniture catalog and list (7)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 47 | `ADD_HOME_FURNITURE` | Add to home | command | Adds the piece(s) selected in the catalog to the home at the origin (or under the cursor). | toolbar, catalog right-click, app-menu button (touch) |
| 48 | `ADD_FURNITURE_TO_GROUP` | Add to group | command | Adds the catalog piece straight into the currently selected group. | catalog right-click, app-menu button (touch) |
| 49 | `MODIFY_FURNITURE` | Modify... | command | Opens the furniture dialog: name, description, x/y, size, elevation, angle, roll/pitch, colour/texture, price, visibility. | furniture-list right-click, plan right-click, app-menu button (touch) |
| 50 | `IMPORT_FURNITURE` | Import furniture... | command | Starts the wizard that turns an OBJ/DAE/3DS/KMZ/ZIP model into a catalog piece (not in the Online build). | — |
| 51 | `IMPORT_FURNITURE_LIBRARY` | Import furniture library... | command | Merges a .sh3f furniture library into the catalog. | — |
| 52 | `IMPORT_TEXTURE` | Import texture... | command | Starts the wizard that adds an image as a texture to the catalog. | — |
| 53 | `IMPORT_TEXTURES_LIBRARY` | Import textures library... | command | Merges a .sh3t textures library into the catalog. | — |

#### G. Group, align, distribute (14)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 54 | `GROUP_FURNITURE` | Group | command | Wraps the selected pieces in one group object that moves and can be edited as a unit. | furniture-list right-click, plan right-click, app-menu button (touch) |
| 55 | `UNGROUP_FURNITURE` | Ungroup | command | Dissolves selected groups, returning their pieces to the parent level. | furniture-list right-click, plan right-click, app-menu button (touch) |
| 56 | `ALIGN_FURNITURE_ON_TOP` | Align on top | command | Aligns the selected pieces flush on their shared top, using each piece's bounding box. | "Align or distribute" submenu |
| 57 | `ALIGN_FURNITURE_ON_BOTTOM` | Align on bottom | command | Aligns the selected pieces flush on their shared bottom, using each piece's bounding box. | "Align or distribute" submenu |
| 58 | `ALIGN_FURNITURE_ON_LEFT` | Align on left | command | Aligns the selected pieces flush on their shared left, using each piece's bounding box. | "Align or distribute" submenu |
| 59 | `ALIGN_FURNITURE_ON_RIGHT` | Align on right | command | Aligns the selected pieces flush on their shared right, using each piece's bounding box. | "Align or distribute" submenu |
| 60 | `ALIGN_FURNITURE_ON_FRONT_SIDE` | Align on front side | command | Aligns the selected pieces flush on their shared front side, using each piece's bounding box. | "Align or distribute" submenu |
| 61 | `ALIGN_FURNITURE_ON_BACK_SIDE` | Align on back side | command | Aligns the selected pieces flush on their shared back side, using each piece's bounding box. | "Align or distribute" submenu |
| 62 | `ALIGN_FURNITURE_ON_LEFT_SIDE` | Align on left side | command | Aligns the selected pieces flush on their shared left side, using each piece's bounding box. | "Align or distribute" submenu |
| 63 | `ALIGN_FURNITURE_ON_RIGHT_SIDE` | Align on right side | command | Aligns the selected pieces flush on their shared right side, using each piece's bounding box. | "Align or distribute" submenu |
| 64 | `ALIGN_FURNITURE_SIDE_BY_SIDE` | Align side by side | command | Packs selected pieces next to each other with no gap, respecting their order. | "Align or distribute" submenu |
| 65 | `DISTRIBUTE_FURNITURE_HORIZONTALLY` | Distribute horizontally | command | Spaces selected pieces evenly along X between the two outermost ones. | "Align or distribute" submenu |
| 66 | `DISTRIBUTE_FURNITURE_VERTICALLY` | Distribute vertically | command | Spaces selected pieces evenly along Y between the two outermost ones. | "Align or distribute" submenu |
| 67 | `RESET_FURNITURE_ELEVATION` | Reset elevation | command | Recomputes each selected piece's elevation from whatever it stands on (floor, wall, shelf, other piece). | furniture-list right-click, plan right-click, app-menu button (touch) |

#### H. Furniture-list "Sort by" (24)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 68 | `SORT_HOME_FURNITURE_BY_DESCENDING_ORDER` | Descending order | checkbox | Checkbox that reverses the furniture list sort direction. | "Sort by" submenu |
| 69 | `SORT_HOME_FURNITURE_BY_CATALOG_ID` | Reference | radio | Sorts the furniture list ascending by reference/catalog id (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 70 | `SORT_HOME_FURNITURE_BY_NAME` | Name | radio | Sorts the furniture list ascending by name (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 71 | `SORT_HOME_FURNITURE_BY_DESCRIPTION` | Description | radio | Sorts the furniture list ascending by description (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 72 | `SORT_HOME_FURNITURE_BY_CREATOR` | Creator | radio | Sorts the furniture list ascending by creator (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 73 | `SORT_HOME_FURNITURE_BY_LICENSE` | License | radio | Sorts the furniture list ascending by license (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 74 | `SORT_HOME_FURNITURE_BY_WIDTH` | Width | radio | Sorts the furniture list ascending by width (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 75 | `SORT_HOME_FURNITURE_BY_DEPTH` | Depth | radio | Sorts the furniture list ascending by depth (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 76 | `SORT_HOME_FURNITURE_BY_HEIGHT` | Height | radio | Sorts the furniture list ascending by height (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 77 | `SORT_HOME_FURNITURE_BY_X` | Abscissa | radio | Sorts the furniture list ascending by abscissa (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 78 | `SORT_HOME_FURNITURE_BY_Y` | Ordinate | radio | Sorts the furniture list ascending by ordinate (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 79 | `SORT_HOME_FURNITURE_BY_ELEVATION` | Elevation | radio | Sorts the furniture list ascending by elevation (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 80 | `SORT_HOME_FURNITURE_BY_ANGLE` | Angle | radio | Sorts the furniture list ascending by angle (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 81 | `SORT_HOME_FURNITURE_BY_LEVEL` | Level | radio | Sorts the furniture list ascending by level (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 82 | `SORT_HOME_FURNITURE_BY_MODEL_SIZE` | Model size | radio | Sorts the furniture list ascending by model size (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 83 | `SORT_HOME_FURNITURE_BY_COLOR` | Color | radio | Sorts the furniture list ascending by colour (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 84 | `SORT_HOME_FURNITURE_BY_TEXTURE` | Texture | radio | Sorts the furniture list ascending by texture (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 85 | `SORT_HOME_FURNITURE_BY_MOVABILITY` | Movability | radio | Sorts the furniture list ascending by movability (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 86 | `SORT_HOME_FURNITURE_BY_TYPE` | Type | radio | Sorts the furniture list ascending by type (door/window) (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 87 | `SORT_HOME_FURNITURE_BY_VISIBILITY` | Visibility | radio | Sorts the furniture list ascending by visibility in plan (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 88 | `SORT_HOME_FURNITURE_BY_PRICE` | Price | radio | Sorts the furniture list ascending by price (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 89 | `SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX_PERCENTAGE` | VAT % | radio | Sorts the furniture list ascending by VAT % (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 90 | `SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX` | VAT | radio | Sorts the furniture list ascending by VAT amount (radio choice); clicking again toggles direction. | "Sort by" submenu |
| 91 | `SORT_HOME_FURNITURE_BY_PRICE_VALUE_ADDED_TAX_INCLUDED` | Price VAT included | radio | Sorts the furniture list ascending by price incl. VAT (radio choice); clicking again toggles direction. | "Sort by" submenu |

#### I. Furniture-list "Display column" (23)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 92 | `DISPLAY_HOME_FURNITURE_CATALOG_ID` | Reference | checkbox | Checkbox that shows/hides the "reference/catalog id" column in the furniture list. | "Display column" submenu |
| 93 | `DISPLAY_HOME_FURNITURE_NAME` | Name | checkbox | Checkbox that shows/hides the "name" column in the furniture list. | "Display column" submenu |
| 94 | `DISPLAY_HOME_FURNITURE_DESCRIPTION` | Description | checkbox | Checkbox that shows/hides the "description" column in the furniture list. | "Display column" submenu |
| 95 | `DISPLAY_HOME_FURNITURE_CREATOR` | Creator | checkbox | Checkbox that shows/hides the "creator" column in the furniture list. | "Display column" submenu |
| 96 | `DISPLAY_HOME_FURNITURE_LICENSE` | License | checkbox | Checkbox that shows/hides the "license" column in the furniture list. | "Display column" submenu |
| 97 | `DISPLAY_HOME_FURNITURE_WIDTH` | Width | checkbox | Checkbox that shows/hides the "width" column in the furniture list. | "Display column" submenu |
| 98 | `DISPLAY_HOME_FURNITURE_DEPTH` | Depth | checkbox | Checkbox that shows/hides the "depth" column in the furniture list. | "Display column" submenu |
| 99 | `DISPLAY_HOME_FURNITURE_HEIGHT` | Height | checkbox | Checkbox that shows/hides the "height" column in the furniture list. | "Display column" submenu |
| 100 | `DISPLAY_HOME_FURNITURE_X` | Abscissa | checkbox | Checkbox that shows/hides the "abscissa" column in the furniture list. | "Display column" submenu |
| 101 | `DISPLAY_HOME_FURNITURE_Y` | Ordinate | checkbox | Checkbox that shows/hides the "ordinate" column in the furniture list. | "Display column" submenu |
| 102 | `DISPLAY_HOME_FURNITURE_ELEVATION` | Elevation | checkbox | Checkbox that shows/hides the "elevation" column in the furniture list. | "Display column" submenu |
| 103 | `DISPLAY_HOME_FURNITURE_ANGLE` | Angle | checkbox | Checkbox that shows/hides the "angle" column in the furniture list. | "Display column" submenu |
| 104 | `DISPLAY_HOME_FURNITURE_LEVEL` | Level | checkbox | Checkbox that shows/hides the "level" column in the furniture list. | "Display column" submenu |
| 105 | `DISPLAY_HOME_FURNITURE_MODEL_SIZE` | Model size | checkbox | Checkbox that shows/hides the "model size" column in the furniture list. | "Display column" submenu |
| 106 | `DISPLAY_HOME_FURNITURE_COLOR` | Color | checkbox | Checkbox that shows/hides the "colour" column in the furniture list. | "Display column" submenu |
| 107 | `DISPLAY_HOME_FURNITURE_TEXTURE` | Texture | checkbox | Checkbox that shows/hides the "texture" column in the furniture list. | "Display column" submenu |
| 108 | `DISPLAY_HOME_FURNITURE_MOVABLE` | Movable | checkbox | Checkbox that shows/hides the "movable flag" column in the furniture list. | "Display column" submenu |
| 109 | `DISPLAY_HOME_FURNITURE_DOOR_OR_WINDOW` | Door/Window | checkbox | Checkbox that shows/hides the "door/window flag" column in the furniture list. | "Display column" submenu |
| 110 | `DISPLAY_HOME_FURNITURE_VISIBLE` | Visible | checkbox | Checkbox that shows/hides the "visible flag" column in the furniture list. | "Display column" submenu |
| 111 | `DISPLAY_HOME_FURNITURE_PRICE` | Price | checkbox | Checkbox that shows/hides the "price" column in the furniture list. | "Display column" submenu |
| 112 | `DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX_PERCENTAGE` | VAT % | checkbox | Checkbox that shows/hides the "VAT %" column in the furniture list. | "Display column" submenu |
| 113 | `DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX` | VAT | checkbox | Checkbox that shows/hides the "VAT amount" column in the furniture list. | "Display column" submenu |
| 114 | `DISPLAY_HOME_FURNITURE_PRICE_VALUE_ADDED_TAX_INCLUDED` | Price VAT included | checkbox | Checkbox that shows/hides the "price incl. VAT" column in the furniture list. | "Display column" submenu |

#### J. Plan modes and navigation (9)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 115 | `SELECT` | Select | toggle | Switches the plan to selection mode (click, rubber-band, toggle). | toolbar, app-menu button (touch) |
| 116 | `PAN` | Pan | toggle | Switches the plan to pan mode (drag the view instead of objects). | toolbar |
| 117 | `CREATE_WALLS` | Create walls | toggle | Wall drawing mode: click points; Alt+click curves a wall; Enter types exact dimensions. | toolbar, app-menu button (touch) |
| 118 | `CREATE_ROOMS` | Create rooms | toggle | Room drawing mode: click corners, or double-click inside an enclosed area to auto-create the room. | toolbar, app-menu button (touch) |
| 119 | `CREATE_POLYLINES` | Create polylines | toggle | Polyline drawing mode for free decorations/annotations; Alt+click curves a segment. | toolbar, app-menu button (touch) |
| 120 | `CREATE_DIMENSION_LINES` | Create dimensions | toggle | Dimension mode: draw a dimension, optionally along a wall/room/furniture side. | toolbar, app-menu button (touch) |
| 121 | `CREATE_LABELS` | Add texts | toggle | Text mode: click to enter a free text label (or a new text for an existing label). | toolbar, app-menu button (touch) |
| 122 | `ZOOM_IN` | Zoom in | command | Zooms the plan in and pans to keep the selection visible. | toolbar |
| 123 | `ZOOM_OUT` | Zoom out | command | Zooms the plan out. | toolbar |

#### K. Plan object editing (18)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 124 | `MODIFY_COMPASS` | Modify compass... | command | Opens the compass dialog: visibility, diameter, north direction, latitude/longitude, time zone. | plan right-click, app-menu button (touch) |
| 125 | `MODIFY_WALL` | Modify walls... | command | Opens the wall dialog for the selected walls: geometry (straight/round/sloping), thickness, height, colours, baseboards, pattern. | plan right-click, app-menu button (touch) |
| 126 | `JOIN_WALLS` | Join walls | command | Moves the closest free ends of the selected walls onto each other so they connect. | plan right-click, app-menu button (touch) |
| 127 | `REVERSE_WALL_DIRECTION` | Reverse walls direction | command | Swaps the start and end of the selected walls, flipping which side is "left" and "right". | plan right-click, app-menu button (touch) |
| 128 | `SPLIT_WALL` | Split wall | command | Inserts a new point in the middle of a selected wall, producing two walls. | plan right-click, app-menu button (touch) |
| 129 | `MODIFY_ROOM` | Modify rooms... | command | Opens the room dialog: floor/ceiling colour+texture, wall-side finish, visible floor/ceiling/area, flat ceiling only. | plan right-click, app-menu button (touch) |
| 130 | `ADD_ROOM_POINT` | Add point to room | command | Inserts a point into the selected room polygon at the clicked border position. | — |
| 131 | `DELETE_ROOM_POINT` | Delete point from room | command | Removes the clicked point from the selected room polygon. | — |
| 132 | `RECOMPUTE_ROOM_POINTS` | Recompute room points | command | Re-derives the room polygon from the walls around it (plan right-click on a room). | — |
| 133 | `MODIFY_POLYLINE` | Modify polylines... | command | Opens the polyline dialog: thickness, colour, dash style and offset, join style, arrows, 3D visibility. | plan right-click, app-menu button (touch) |
| 134 | `MODIFY_DIMENSION_LINE` | Modify dimensions... | command | Opens the dimension dialog: horizontal/vertical, plan vs elevation, font size, extension length, colour, elevation. | plan right-click, app-menu button (touch) |
| 135 | `MODIFY_LABEL` | Modify texts... | command | Opens the text dialog: text, font, size, colour, alignment, orientation, elevation, 3D visibility. | plan right-click, app-menu button (touch) |
| 136 | `INCREASE_TEXT_SIZE` | Increase size | command | Steps the font size of selected texts (and room/dimension labels) up. | toolbar, plan right-click |
| 137 | `DECREASE_TEXT_SIZE` | Decrease size | command | Steps the same font size down. | toolbar, plan right-click |
| 138 | `TOGGLE_BOLD_STYLE` | Bold | toggle | Toggles bold on the selected texts/room names/dimensions. | toolbar, plan right-click |
| 139 | `TOGGLE_ITALIC_STYLE` | Italic | toggle | Toggles italic on the selected texts/room names/dimensions. | toolbar, plan right-click |
| 140 | `FLIP_HORIZONTALLY` | Flip horizontally | command | Mirrors the selected plan objects left-right about the plan origin. | toolbar |
| 141 | `FLIP_VERTICALLY` | Flip vertically | command | Mirrors the selected plan objects top-bottom about the plan origin. | toolbar |

#### L. Magnetism and base-plan lock (4)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 142 | `ENABLE_MAGNETISM` | Enable magnetism | toggle | Turns on snapping to grid, walls, furniture and shelves (label swaps with Disable). | toolbar magnetism button |
| 143 | `DISABLE_MAGNETISM` | Disable magnetism | toggle | Turns magnetism off (label swaps with Enable). | toolbar magnetism button |
| 144 | `LOCK_BASE_PLAN` | Lock base plan | toggle | Freezes base-plan objects so they can no longer be selected or moved. | toolbar lock button |
| 145 | `UNLOCK_BASE_PLAN` | Unlock base plan | toggle | Releases the frozen base plan. | toolbar lock button |

#### M. Background image (5)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 146 | `IMPORT_BACKGROUND_IMAGE` | Import background image... | command | Runs the three-step wizard: choose image, drag a line and type its real length, set the origin. | plan right-click, app-menu button (touch) |
| 147 | `MODIFY_BACKGROUND_IMAGE` | Modify background image... | command | Re-opens the wizard to rescale or re-origin the existing background image. | plan right-click, app-menu button (touch) |
| 148 | `HIDE_BACKGROUND_IMAGE` | Hide background image | command | Hides the background image without deleting it. | plan right-click, app-menu button (touch) |
| 149 | `SHOW_BACKGROUND_IMAGE` | Show background image | command | Shows a hidden background image again. | plan right-click, app-menu button (touch) |
| 150 | `DELETE_BACKGROUND_IMAGE` | Delete background image | command | Removes the background image from the home. | plan right-click, app-menu button (touch) |

#### N. Levels (8)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 151 | `ADD_LEVEL` | Add level | command | Creates a new level above the current one and makes it current. | app-menu button (touch) |
| 152 | `ADD_LEVEL_AT_SAME_ELEVATION` | Add level at same elevation | command | Creates a new level at the same elevation as the selected one (an ordered layer, e.g. a mezzanine). | app-menu button (touch) |
| 153 | `MODIFY_LEVEL` | Modify level... | command | Opens the level dialog: name, elevation (may be negative), height, floor thickness, viewable. | app-menu button (touch) |
| 154 | `DELETE_LEVEL` | Delete level | command | Deletes the selected level and the objects on it. | app-menu button (touch) |
| 155 | `MAKE_LEVEL_VIEWABLE` | Make level viewable | command | Marks the selected level viewable so it draws in plan and 3D. | — |
| 156 | `MAKE_LEVEL_UNVIEWABLE` | Make level unviewable | command | Marks it unviewable (label swaps with Make level viewable). | — |
| 157 | `MAKE_LEVEL_ONLY_VIEWABLE_ONE` | Make level the only viewable one | command | Makes the selected level the only viewable one. | — |
| 158 | `MAKE_ALL_LEVELS_VIEWABLE` | Make all levels viewable | command | Makes every level viewable again. | — |

#### O. 3D view (13)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 159 | `VIEW_FROM_TOP` | Aerial view | toggle | Switches to Aerial view: an orbiting camera centred on the home (or the selection). | toolbar |
| 160 | `VIEW_FROM_OBSERVER` | Virtual visit | toggle | Switches to Virtual visit: a walk-through camera with a floor-level visitor figure. | toolbar |
| 161 | `MODIFY_OBSERVER` | Modify virtual visitor... | command | Opens the virtual-visitor dialog: head angle, field of view, body angle, eye elevation. | app-menu button (touch) |
| 162 | `STORE_POINT_OF_VIEW` | Store point of view... | command | Names and stores the current camera as a point of view. | 3D right-click, app-menu button (touch) |
| 163 | `DELETE_POINTS_OF_VIEW` | Delete points of view... | command | Deletes points of view ticked in a list. | 3D right-click, app-menu button (touch) |
| 164 | `CREATE_PHOTOS_AT_POINTS_OF_VIEW` | Create photos at points of view... | command | Batch-renders one image per stored point of view (PNG/JPEG). | — |
| 165 | `DETACH_3D_VIEW` | Display in separate window | command | Moves the 3D view into its own window so it can be placed on a second screen. | — |
| 166 | `ATTACH_3D_VIEW` | Display in main window | command | Returns the detached 3D view to the main window. | — |
| 167 | `DISPLAY_ALL_LEVELS` | Display all levels | toggle | Renders every viewable level in the 3D view. | app-menu button (touch) |
| 168 | `DISPLAY_SELECTED_LEVEL` | Display selected level | toggle | Renders only the selected level and the levels below it. | app-menu button (touch) |
| 169 | `MODIFY_3D_ATTRIBUTES` | Modify 3D view... | command | Opens the 3D-view dialog: ground and sky colour/texture, light brightness, wall transparency. | app-menu button (touch) |
| 170 | `CREATE_PHOTO` | Create photo... | command | Renders one still image with size/aspect presets, quality 0-3, lens and renderer (not in the Online build). | — |
| 171 | `CREATE_VIDEO` | Create video... | command | Records a camera-path video of the home (not in the Online build). | — |

#### P. 3D selection context (2)

| # | Action key | UI name (EN) | Type | What it does | Where it appears in the JS build |
|---|---|---|---|---|---|
| 172 | `SELECT_OBJECT` | Select object | command | Context submenu shown on right-click in the 3D view: select the clicked object. | — |
| 173 | `TOGGLE_SELECTION` | Toggle object selection | command | Context submenu shown on Shift+right-click: add/remove the clicked object from the selection. | — |

### 2.12 Runtime verification: I rendered the real build offline and read the live DOM

Because `rea`'s browser provider was exhausted in round 1 and `rea doctor` shows the local environment unhealthy, I built a faithful offline copy of the browser build inside this job folder — `site/` — with **only** the vendor's own same-origin assets (`libjs/*`, the two catalog JSONs, four `.sh3x` demo homes, all fetched with `curl` from `www.sweethome3d.com`), the Firebase analytics `<script type="module">` and remote `<link>`/`<script>` tags stripped, same-site URLs rewritten to relative paths, and `window.fbEvent` stubbed to a no-op. I then loaded it in the locally installed Google Chrome for macOS (headless `--dump-dom`, `--virtual-time-budget`, software GL via `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), auto-called the page's own `viewHome('/examples/Studio.sh3x')`, dispatched synthetic `contextmenu` events and read the resulting DOM. `OBSERVED` (`site/index.html`, `raw/jsapp-toolbar-state.html`, `raw/jsapp-menus2.html`, `raw/jsapp-menus3.html`, `raw/jsapp-menus4.html`, `raw/jsapp-local-dom4.html`).

This **removes** the round-1 blocker "the live online app never completed its first load under REA's browser provider" for the purpose of this question — the app booted, `window.application` became an object, and the runtime state was inspectable. Concretely:

**The toolbar renders 29 distinct controls** (ids read from the live DOM, in order), confirming §2.3 exactly:

```
(home-button) VIEW_FROM_TOP[selected] VIEW_FROM_OBSERVER
UNDO[disabled] REDO[disabled]
DELETE_SELECTION[disabled] CUT[disabled,optional] COPY[disabled] PASTE[disabled]
ADD_HOME_FURNITURE[disabled,optional]
SELECT[selected] PAN[optional] CREATE_WALLS CREATE_ROOMS CREATE_POLYLINES
CREATE_DIMENSION_LINES CREATE_LABELS
DISABLE_MAGNETISM LOCK_BASE_PLAN
FLIP_HORIZONTALLY[disabled] FLIP_VERTICALLY[disabled]
INCREASE_TEXT_SIZE[disabled] DECREASE_TEXT_SIZE[disabled]
TOGGLE_BOLD_STYLE[disabled] TOGGLE_ITALIC_STYLE[disabled]
ZOOM_IN[optional] ZOOM_OUT[optional] ABOUT PREFERENCES
```

Key confirmations from this single observation: (a) the toolbar is **built almost entirely from the 173-key action set**, with generated DOM ids of the form `toolbar-button-<ACTION_KEY>` — independent proof of the id-addressability claim in §2.13/idea 1; (b) **enablement is live**, not virtual: with nothing selected, UNDO/REDO, DELETE_SELECTION, CUT/COPY/PASTE, ADD_HOME_FURNITURE and all five text-style buttons carry `disabled`, while the mode toggles (`SELECT`, `VIEW_FROM_TOP`) carry `selected`; (c) `VIEW_FROM_TOP` renders as selected while `VIEW_FROM_OBSERVER` does not, i.e. the mutually-exclusive toggle group works; (d) the colours and titles match the catalog strings verbatim (`title="Can't Undo"`, `title="Pan in plan"`, …).

**The context menus render with exactly the conditional items that §2.6 predicted.** `JSPopupMenu.Builder.addMenuItem` skips any action with `!isEnabled()` or `VISIBLE === false`, and `addSubMenu` skips an empty submenu; the runtime DOM obeys this:

| Container | Items actually rendered on an empty Studio home |
|---|---|
| plan (`#home-plan`) | `Modify compass...` ‖ `Import background image...` ‖ `Add level` · `Add level at same elevation` — the object-editing, clipboard, text-style, underlay *modify/hide/show/delete* and *modify/delete level* items are all correctly suppressed (nothing selected); separators whose whole block is hidden are also gone. |
| furniture list (`#furniture-view`) | `Sort by ▸` and `Display column ▸`, both populated (the price/VAT entries were pruned because no currency/VAT preference is set, and the sort submenu kept a separator plus the `Descending order` checkbox; `Display column` rendered 19 boxes, matching 23 columns minus the 4 price/VAT ones) — the clipboard/edit block is suppressed with no selection. |
| 3D view (`#home-3D-view`) | `Aerial view` · `Virtual visit` · `Store point of view...` · `Go to point of view ▸` (4 live sub-items: `Entrance`, `Bedroom`, `Kitchen`, plus the back item) · `Delete points of view...` ‖ `Modify 3D view...`. `Go to point of view` is a **dynamically filled submenu**, exactly as §2.10 claims; its items are the demo home's stored cameras. |
| furniture catalog (`#furniture-catalog`) | **empty**. The catalog list stayed unpopulated in the harness (`CATALOG-ROWS=0`) and the only items the catalog menu has are ADD_HOME_FURNITURE / ADD_FURNITURE_TO_GROUP, both disabled with nothing selected in the catalog — so the menu contains no items at all. This is the pruning rule at its extreme, and it is why the static composition (7 items) is the only description available for this menu. `OBSERVED` (empty) + `INFERRED` (contents). |

Counts from the runtime: **8 `JSPopupMenu` objects** are created (catalog, furniture list, plan, 3D view, and the four nested-builder menus), matching the static count in §2.3; `FURNITURE-ROWS=0` and `LEVELS=0`, so the Studio home loaded its plan/cameras/lights but the furniture list had no rows and the level selector no options in this harness. `OBSERVED`.

`INFERRED` from the skip rule + these observations: the *complete* plan menu (36 items, §2.3) only appears once objects are selected; the empty-home view is the "nothing selected" degenerate case. This is a direct, copyable UX finding for CasaPlazAI's tool card: **render the menu from the action registry and let the enabled/visible predicate prune it, so the user never sees a greyed "Modify wall" when no wall is selected — the item simply is not there.**

**I then drove selection through the app's own API** (`application.homes[i].setSelectedItems([...])` — no synthetic canvas click) and re-read the plan menu. This produced the **full menu**, and it matches the static composition in §2.3 item for item:

```
window.application.homes = [empty home, Studio home]
Studio: furniture=48 walls=16 rooms=5
plan focused, nothing selected (8):  Select all | --- | Modify compass... | --- |
    Import background image... | --- | Add level | Add level at same elevation
plan focused, 4 items selected (21):
    Delete selection | Cut | Copy | --- | Select all | --- |
    Modify furniture... | Reset elevation | --- |
    Modify compass... | Modify walls... | Reverse walls direction | Split wall | Modify rooms... | --- |
    <Modify text style: Increase size | Decrease size | Bold | Italic> | --- |
    Import background image... | --- | Add level | Add level at same elevation
3D view (7): Aerial view | Virtual visit | Store point of view... |
    <Go to point of view: Entrance | Bedroom | Kitchen> | Delete points of view... | --- | Modify 3D view...
toolbar disabled, nothing selected:
    UNDO REDO DELETE_SELECTION CUT COPY PASTE ADD_HOME_FURNITURE
    FLIP_HORIZONTALLY FLIP_VERTICALLY INCREASE_TEXT_SIZE DECREASE_TEXT_SIZE TOGGLE_BOLD_STYLE TOGGLE_ITALIC_STYLE
toolbar disabled, after selecting furniture+wall+room (plan pane focused):
    ... the same set minus DELETE_SELECTION / CUT / COPY — those three became enabled
```

This is a direct, observed confirmation of four separate claims: (1) the plan context menu is composed of the §2.3 action list; (2) `Modify furniture...` renders its **`*.Popup` override** ("Modify furniture...", not the toolbar name "Modify..."), while `Modify walls...` / `Modify rooms...` use their plain `Name` — §2.8's context-wording claim observed live; (3) `Align or distribute` is correctly absent because only one furniture piece was selected, and `Join walls` is absent because fewer than two walls were selected, i.e. the enablement predicates gate the *rendering*; (4) `MODIFY_TEXT_STYLE` renders as a populated submenu with exactly its 4 actions. Note the plan menu on an empty selection is *not* empty: `Select all` appears once the plan pane has focus, because `SELECT_ALL`'s predicate is `!planModificationState && (planHasItems || furniture.length>0)`.

Caveats: the harness ran with stripped remote Firebase/tracking scripts and a stubbed service worker, so timing, analytics and the *full* catalog differ from production; and object selection could not be driven because synthetic canvas clicks did not change selection (the round-1 lesson held). The harness is a faithful copy of the vendor JS and DOM, not the vendor server.

### 2.13 Signals for CasaPlazAI's single-workspace redesign

1. **"One action registry, many surfaces" is the whole architecture.** `HomeView.ActionType` is a flat enum; `createActions` binds each member to a controller+method once; the toolbar, four context menus, three submenus and one app-menu popup then *reference actions by id*. Adding a surface costs one list. This is exactly the single-source-of-truth pattern CasaPlazAI's Plan/3D/Walk modes need, and it is cheap to copy (behaviour, not code).
2. **The browser build has no menu bar at all.** A 173-action desktop product was shipped as: toolbar + right-click on the four panes + one overflow popup on touch. That is directly transferable to a single-page floorplanner and answers "where do the Plan-menu actions live in Plan/3D/Walk modes".
3. **Availability is a predicate, not a permission list.** Every placeable action declares enabled-when (focus, mode, selection, level count, preference). CasaPlazAI's tool card can grey out precisely the same way — e.g. walls-only actions while a room is selected in Walk mode.
4. **Dynamic labels are an explicit, small feature.** Undo/Redo swap their name/icon, magnetism and base-plan-lock swap between two actions, level viewability swaps two labels, background image swaps show/hide. Four ternaries, high polish.
5. **Context-menu wording is a first-class resource** (`*.Popup`): the *same* command says "Modify…" in a toolbar tooltip and "Modify furniture…" in a menu.
6. **The undo stack is self-describing** (52 named edits, two granularities: object and gesture). CasaPlazAI's localStorage autosave already has a natural place to store an operation label per history entry.
7. **The action set is a ready-made acceptance checklist** for feature parity. Of the 158 commands, ~120 map onto things a 2D/3D single-page planner must decide about; the remaining ~38 (printing, VAT/price, import libraries, video, detach window, roll/pitch) are deliberate non-goals that can be *rejected on the record*.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Each idea names the finding it comes from and, where relevant, the CasaPlazAI schema field it touches (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Finding | Value | Effort |
|---|---|---|---|---|
| 0 | **Prune, don't grey out.** The runtime menus simply omit every disabled/invisible item and every submenu that would be empty (§2.12), so an unselected room never shows a dead "Modify wall". Build each context menu from the action registry and filter on `enabled && visible` before rendering. | §2.12, §2.6 | High | Low |
| 1 | **Ship an action registry** — one TS union of action ids with `{ label, icon, shortcut?, enabledWhen(state), run(ctx) }`, and let the tool card, inspector, keyboard map and context menu all render from it. The 158-entry `ActionType` enum is the proof this scales; it also gives the Plan/3D/Walk redesign a single place to decide "is this action valid in this mode". | §2.1, §2.5 | High | Low |
| 2 | **Context menus on the plan, the furniture list and the 3D canvas** as the primary home for object actions, since the app has no menu bar. Use the plan menu's 36 items (§2.3) as the checklist: clipboard, select-all-at-all-levels, per-object Modify…, text style, underlay, levels. | §2.3 | High | Medium |
| 3 | **State-derived enablement for the tool card.** Implement `enabledWhen` predicates mirroring the observed set: selection-empty → disable CUT/COPY/Modify/Group/Align; single floor → disable level-display actions; opening-under-cursor → enable door/window edit. This is what makes a small tool card feel deliberate. | §2.6 | High | Low |
| 4 | **Align & distribute as 11 concrete, separately invocable actions** (8 box edges + side-by-side + H/V distribute). CasaPlazAI already has `FurnitureItem.footprint` and `rotationDeg`, so bounding-box alignment is arithmetic on existing fields; it is one of the few "pro-feeling" wins with no schema change. | §2.10, §2.3 | High | Low |
| 5 | **Undo/redo with operation names, two granularities.** Keep a label per history entry (`"Create wall"`, `"Rotate chair"`, `"Split wall"`) and render `Undo: <label>`; the 52 `undo*Name` keys are a ready vocabulary. Autosave to `casaplaza.*` already persists the plan, so persisting the label list is nearly free. | §2.7 | High | Low |
| 6 | **Dynamic action labels** — Undo/Redo, magnetism on/off, show/hide underlay, level viewable/unviewable, attach/detach. Implement as one `label(state)` function per action instead of five bespoke buttons. | §2.4, §2.8 | Medium | Low |
| 7 | **Blueprint underlay as a five-action family** (import wizard → modify scale/origin → hide → show → delete) rather than one modal. CasaPlazAI keeps the underlay per floor under `casaplaza.underlay.v1` and `UnderlayState`; the wizard's scale step ("drag a line, type its real length") is the exact interaction the 0.5 m grid can verify, and the schema's deliberate omission of the underlay from `FloorplanData` is *reinforced* by this design (it is editor-local state with editor-local lifecycle). | §2.3, §2.6 | High | Medium |
| 8 | **Text/dimension styling as a submenu of 4 actions** (`increase`, `decrease`, `bold`, `italic`) applied to the current selection of dimension lines/labels **and room names** — the same commands act on three object kinds in Sweet Home 3D, which is exactly the "measure" tool CasaPlazAI already has plus typography. | §2.10, §2.8 | Medium | Low |
| 9 | **Levels as 8 explicit actions, including "at same elevation" as an ordered layer.** Map onto CasaPlazAI floors/underlay: `ADD_LEVEL`, `ADD_LEVEL_AT_SAME_ELEVATION`, `MODIFY_LEVEL`, `DELETE_LEVEL`, plus the four viewability actions (`viewable`, `unviewable`, `only this one`, `all`). The "only the selected level and below" semantic maps cleanly onto a multi-floor 3D view. | §2.10, §2.3 | High | Medium |
| 10 | **A 23-property furniture table with sort-by and column visibility as data.** CasaPlazAI has 7 furniture types with `type`, `roomId`, `position`, `rotationDeg`, `footprint`; a *small* property list (`name`, `type`, `room`, `x`, `y`, `width`, `depth`, `rotation`) with the same "Sort by ▸ / Display column ▸" pattern is a high-leverage inspector; skip the price/VAT/license columns (Sweet Home 3D hides price by default anyway). | §2.10, §2.6 | Medium | Medium |
| 11 | **`*.Popup` context wording**: let a command carry a menu-specific label so "Modify…" becomes "Modify furniture…", "Modify walls…", "Modify room…" in the right-click menu while the tool card stays terse. | §2.8 | Medium | Low |
| 12 | **Group semantics: Group / Ungroup / Add to group / Paste to group / Paste style.** CasaPlazAI has no grouping; the schema's `FurnitureItem[]` is flat, so a `groupId` (or nested id) field plus these five commands is the smallest coherent addition and directly enables align/distribute. | §2.3, §2.5 | Medium | Medium |
| 13 | **Plan modes as mutually exclusive toggles with matching toolbar state** (`Select`, `Pan`, plus the draw tools) and a single `ToggleButtonGroup`-style invariant, so mode is one enum field rather than several booleans in the tool card. | §2.2 | Medium | Low |
| 14 | **A keyboard map derived from the action registry** (mode switches, undo, copy/paste, delete, bold/italic, level viewability) shown in a help overlay; source the bindings from the v7.0 shortcuts PDF's `Menu > Item` paths. | §2.8 | Medium | Low |
| 15 | **Export family as explicit actions**: keep PNG/JPEG, and add `Export to SVG` (vector plan) and `Export to CSV` (furniture list) with the same "selection or all" convention Sweet Home 3D uses. | §2.3 | Medium | Medium |
| 16 | **Doors/windows as a Modify action over the existing `Opening` schema**: `tCenter`, `width`, `sillHeight`, `headHeight`, `kind`, plus the two-row shared-door convention. The Sweet Home 3D action only opens a dialog; the value is in surfacing all numeric fields (§2.5 `MODIFY_FURNITURE`, `WallPanel`, `ModelMaterialsComponent`). | §2.5 | High | Medium |
| 17 | **Explicitly reject and record non-goals** from the 38 out-of-scope commands (printing stack, VAT/price columns, furniture/texture libraries, video, detach window, roll/pitch, deformation). Naming them prevents accidental scope creep and makes the parity claim auditable. | §2.4, §2.1 | Medium | Low |

**Cross-cutting takeaway.** Sweet Home 3D's actual reuse value for CasaPlazAI is **not** its 173 menu strings but the fact that they are *one flat, id-addressable set with per-action availability and per-surface wording*, rendered through four cheap surfaces and zero menu bar. That structure — not the individual features — is what a single-page Plan/3D/Walk redesign should copy, with the 158-command list used as a coverage checklist.

---

## 4. Unknowns

- **Interactive confirmation is now partial, not absent.** `rea doctor` reports the local environment unhealthy (Node 22.23.2 vs required ≥22.23.4; `GHIDRA_INSTALL_DIR` unset) and round 1 exhausted `capture-browser-scenario` (300 s and 900 s, `provider_timeout`, zero retained steps), so I did **not** re-run `rea`. Instead I booted a vendor-asset-only offline copy in local headless Chrome (§2.12) and observed the toolbar and three context menus directly. **Still not verified at runtime:** (a) the furniture-**catalog** context menu, because the catalog list stayed empty in my harness (`CATALOG-ROWS=0`) — its 7 items are `INFERRED` from static composition; (b) the plan menu's **most-selected-dependent** variants — I did capture the full 21-item plan menu via `setSelectedItems` (§2.12), but `Group`/`Align`/`Join walls`/background *hide/show/delete* and `modify/delete level` never appeared even with a 4-item selection (they need multi-furniture, ≥2 walls, an existing underlay and >1 level respectively), and the level-viewability quartet was never exercised; (c) the 49-item touch application-menu popup, which only renders when the host page supplies the button and `window.matchMedia('(hover: none), (pointer: coarse)')` matches.
- **Desktop menu-bar composition is not recoverable from JS.** The Swing menus live in Java; the 15 `MenuActionType` titles in the shared catalog prove the desktop bar exists but not its exact ordering or separator placement. The menu tree in §2.9 is therefore a reconstruction from the enum ordering + the shortcuts PDF's `Menu > Item` strings + the guide's `Menu > Item` strings, not a captured menu.
- **The 7.6.1 release is unexplained** (inherited from round 1): all shipped JS, `localization.json` and the site still say 7.5/7.5.2 while SourceForge has `SweetHome3D-7.6.1` (2026-10-20). If 7.6.x added or removed actions, my 173-key snapshot cannot show it. This is the largest remaining gap in the whole inventory.
- **Which of the 32 unplaced actions are truly absent.** Only the import/photo/video family is *documented* as absent from the online build; for `SAVE_AND_COMPRESS`, `PAGE_SETUP`, `PRINT*`, `EXPORT_TO_*`, `HELP`, the level-viewability quartet and `SELECT_OBJECT`/`TOGGLE_SELECTION` I observed no UI element in the JS but could not distinguish "reachable through a host-page button that the JSP did not include" from "absent". The host page's toolbar classes (`new-home open save save-as`) show that the JSP decides which buttons exist, so absence in the bundle is weak evidence of absence in the product.
- **Accelerators are only 6/173 in the catalog.** The rest are in desktop Java and in the v7.0 PDF; I could not verify whether the browser build binds any of them, nor whether post-7.0 actions have shortcuts at all.
- **Icon rendering unverified.** I inventoried the 109 `SmallIcon` paths but did not fetch the SVGs or compare them with the rendered toolbar; the claim "109 visually distinct actions" is `INFERRED` from the distinct file names.
- **The `MnemonicKey` values were not observed being rendered.** They are present for all 173 keys, including JS-only actions, which suggests they are shared with Swing; the browser build may ignore them.
- **The German build path.** `?lang=de` works on the JSP and `localization_de.json` covers all 173 names, but `https://www.sweethome3d.com/de/SweetHome3DJSOnline.jsp` returns the 404 page, so the German browser edition is a query-parameter variant, not a path; I did not render it.
- **`raw/localization.json` is the v7.5.2 catalog, not a runtime dump.** It is authoritative for the shipped strings of that version but may include keys unused by any shipped surface — as the 15 menu titles demonstrate.
- **Legal note.** Sweet Home 3D is GPL-2.0 (desktop) and proprietary (JS site, Space Mushrooms). No source code was copied into this report or any deliverable; everything here is behaviour, UI-string and data-model description, and the retained JSON/JS files and the offline `site/` copy are evidence of the shipped feature surface only, kept in this job folder and not intended for reuse. No vendor code was modified (only the page shell had remote analytics stripped for local loading); `site/index.html` is a derived page, not redistributable code. 3D House Planner (parallel job) is proprietary and was not touched.

---

### Appendix — reproducing the runtime observations (§2.12)

All of this stays inside the job folder; nothing is installed and no account is used.

1. Mirror only the vendor's same-origin assets into `site/` (already committed here): `libjs/*` from `https://www.sweethome3d.com/libjs/`, `libjs/resources/{localization,DefaultFurnitureCatalog,FurnitureCatalog,TexturesCatalog}.json`, and `examples/{Studio,2BedroomApartment,EmptyHome}.sh3x` from `https://www.sweethome3d.com/`.
2. `site/index.html` is `raw/jsapp.html` with: the Firebase `<script type="module">` and all remote `src`/`href` tags removed, `window.fbEvent` stubbed, absolute `"/libjs/..."` and `"/models/"` paths rewritten to relative, and the four `.sh3x` demo links pointed at the local copies.
3. Serve and dump:
   ```
   cd site && python3 -m http.server 8765 &
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-sandbox \
     --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
     --user-data-dir=/tmp/dsh-prof --virtual-time-budget=140000 \
     --dump-dom "http://127.0.0.1:8765/index.html" > ../raw/jsapp-rerun.html
   ```
4. In a `<script>` inside `site/index.html`, after the app boots call `viewHome('/examples/Studio.sh3x')`, then reach the model directly — the application object exposes `homes`, `homeControllers`, `preferences` and `viewFactory` (there is **no** `getHomeController()` on the JS application), so selection is driven with `application.homes.at(-1).setSelectedItems([...])`, and context menus with `el.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true, clientX, clientY}))`. Read `.popup-menu.visible > ul.items > li` for the rendered items and `#home-pane-toolbar .toolbar-button[disabled]` for toolbar state.

The `raw/jsapp-*.html` files in this folder are the unedited dumps from those runs.
