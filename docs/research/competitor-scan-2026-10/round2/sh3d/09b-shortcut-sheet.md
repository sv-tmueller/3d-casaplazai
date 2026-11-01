# Sweet Home 3D — complete keyboard shortcut sheet + Escape/Enter/double-click/arrow-key editing contract

Job folder: `04-09b-ui-workflow-shortcuts-shortc` · **Round 2**, narrow question.
Target: **Sweet Home 3D 7.5** (eTeks / Space Mushrooms, GPL) — desktop Java app (primary), browser edition
"Sweet Home 3D JS Online" (same Java core compiled to JS with GWT; `sweethome3d.min.js`), German portal
<https://www.sweethome3d.com/de/>. Round-1 report read and reused read-only:
`~/dsh-workspaces/rea-sweethome3d-2026-10/09-09-ui-workflow-shortcuts/report.md` (its F17, F25–F30, F33, F43, F44, F47, F49).

Evidence tags: **OBSERVED** = seen directly in a page/DOM/script/asset I captured (evidence file given).
**DOCUMENTED** = stated in vendor docs/manual/shortcut sheet (URL given).
**INFERRED** = reasoning from the two above, not directly stated by the vendor.

Round-1 took the shortcut sheet at face value and reconstructed only the Windows and macOS columns from
plain `pdftotext` (its F27). This round re-derived the sheet from the PDF's word coordinates, which exposes
the **Linux column contract** the round-1 summary missed, and it re-tested the Enter/Escape/double-click
contract live in the Online build, which round 1 left as an open unknown (its Unknowns §1).

---

## 1. Summary

- **The complete sheet is one 4-page PDF, still v7.0 and still the current one** — `/storage/SweetHome3DShortcuts.pdf` is what the German and English documentation pages both link today (md5 `db41ddc286887cce79b9bfc952a5c505`, byte-identical to round 1's copy), so *nothing in the published sheet changed between 7.0 and 7.5*. Version-history entries for 7.1–7.5.2 add **no** new keyboard combos; the only keyboard-adjacent entries in that window are a delete-key fix in the Online catalog search field (7.1), an up/down-arrow scrolling menu addition (7.3), and 3D-view/font bug fixes (7.4/7.5/7.5.2). — OBSERVED/DOCUMENTED §2.1, §2.7.
- **The Linux column is not a column of shortcuts — it is a column of *exceptions*.** Reconstructing the PDF by word x-coordinate (Windows 480–536 pt, Linux 536–571 pt, macOS 571–630 pt) shows the Linux cell is **blank on every row whose Linux shortcut is the same as the Windows one**; it is filled on only **four** rows: zoom in (`Ctrl +`), zoom out (`Ctrl -`), text size up (`Ctrl Alt +`), text size down (`Ctrl Alt -`). So on Linux everything is Windows-identical except the four `+`/`-` keys, where macOS/Windows use letters. — OBSERVED §2.2.
- **Escape is a per-state revert, not a global cancel.** In every creation state the `ESCAPE` action first reverts the object under construction (deletes the tentative wall, pops the dangling room/polyline point, drops the unfinished dimension) and then *validates* it. For a **mouse** pointer `validateDrawnWalls`/`validateDrawnRoom`/`validateDrawnPolyline`/`validateDrawnDimensionLine` all end by returning to the corresponding `…CreationState` (i.e. **back into the same tool, ready for the next object**) and only for a **touch** pointer do they return to `SelectionState`. It is a "cancel everything" only if you keep pressing it. — OBSERVED §2.3.
- **The Enter keyboard-dimension editor exists in the desktop code path but is inert in the Online build.** `PlanComponent.installDefaultKeyboardActions` binds `ENTER` → `ACTIVATE_EDITIION`; that calls `PlanController.setEditionActivated`, whose first act is `view.deleteFeedback()` (hiding the read-only tooltip) and whose second is `view.setToolTipEditedProperties([...])`. In the JS build `PlanComponent.prototype.setToolTipEditedProperties` is an **empty stub** and `installEditionKeyboardActions` is **defined but never called**, so Enter *does* visibly clear the tooltip (live-confirmed) but no editable field ever appears — matching the user guide's own caveat "(feature not available in Online and Mobile versions)". — OBSERVED §2.4.
- **Double-click is the mouse equivalent of Escape/Enter and it is not the same everywhere.** In Select mode a double-click opens the modification dialog for the single selected item (`modifySelectedItem`, dispatched by type: furniture / wall / room / polyline / dimension / label / compass). In Create-walls mode a double-click either finishes the wall chain or builds walls around a room; in Create-rooms mode it finishes the polygon or traces a closed surface; in Create-dimensions mode it measures the object under the cursor. **Arrow keys** move the selection by `dx/scale` model units — i.e. a **constant number of pixels**, not a fixed metric step — with Shift = 10× that. — OBSERVED §2.5–§2.6.

---

## 2. Findings

### 2.1 Provenance and version of the sheet

- **F1 (DOCUMENTED).** The shortcut sheet is one 4-page PDF, `https://www.sweethome3d.com/storage/SweetHome3DShortcuts.pdf`, linked as "the list of its shortcuts in **this document** (PDF)" from the English documentation page <https://www.sweethome3d.com/documentation/> and by the German page <https://www.sweethome3d.com/de/dokumentation/> — the *same* `/storage/SweetHome3DShortcuts.pdf` URL in both. I re-downloaded it this round: 163 613 B, 4 pages, md5 `db41ddc286887cce79b9bfc952a5c505`, **byte-identical** to the copy round 1 saved, and its footers still read "Version 7.0 © Copyright 2022 eTeks" on all four pages. — `raw/SweetHome3DShortcuts.pdf`, `raw/SweetHome3DShortcuts.txt`, `raw/shortcuts_bbox.html`.
- **F2 (OBSERVED).** The sheet does **not** cover the whole shortcut surface: it has no row for the pane-focus `Tab`/`Shift+Tab` navigation-into-pane order (only one "Transfer the focus to a pane" row), no row for the plan's own `DELETE`/`BACK_SPACE`, and no row for the 3D-view `Page Up`/`Page Down` pitch or `Home`/`End` elevation bindings that the bundle's `HomeComponent3D.inputMap` implements. The bundle is the authoritative superset; the PDF is a curated subset. — `evidence/plan_inputmaps.txt` vs `raw/SweetHome3DShortcuts.txt`.
- **F3 (OBSERVED, version drift cleared).** I read the 7.1–7.5.2 history entries in full. The only keyboard-touching changes are: 7.3 "Added up and down arrows to scroll the *Go to point of view* menu when it's too long on small screens" (a menu, not an editor shortcut); 7.5/7.5.2 are 3D-sync/font fixes; 7.4 is bug fixes; 7.2 adds *Modify dimensions* / elevation dimensions / 3D-mode editing but **no new combos**; 7.1 fixes delete keys in the catalog search field. The last combo additions are 5.5 (`Ctrl M` preferences, `Ctrl Alt M` modify visitor) and 4.0 (`Ctrl Alt Y` detach 3D view). — `raw/history.txt` lines 146–232; per-version mapping `P1`-style table above.
- **F4 (OBSERVED).** The sheet's platform model is "Windows | Linux | Mac OS X" for keys and "Windows | Linux | Mac OS X" again for mouse — but the *Linux mouse* column is used only to say "Swipe / trackpad" where Windows says "Mouse wheel". So the sheet is really a 2.5-platform document. — `evidence/shortcut_sheet_columns.txt`.

### 2.2 The full sheet, by section, with the Linux rule applied

All rows below are from `raw/SweetHome3DShortcuts.txt` (extracted) cross-checked against
`evidence/shortcut_sheet_columns.txt` (x-coordinate reconstruction). **`= Win` means the Linux cell is blank in
the PDF and therefore inherits the Windows binding** (F5).

**Platform key legend:** Win = Windows, Lin = Linux, Mac = macOS. "= Win" = Linux identical to Windows.

| # | Action | Menu | Win | Lin | Mac |
|---|--------|------|-----|-----|-----|
| | **FILE** | | | | |
| 1 | Open a new home | File > New | Ctrl N | = Win | cmd N |
| 2 | Open a previously saved home | File > Open… | Ctrl O | = Win | cmd O |
| 3 | Save the edited home | File > Save | Ctrl S | = Win | cmd S |
| 4 | Save the edited home under another name | File > Save as… | Ctrl Shift S | = Win | cmd shift S |
| 5 | Save and compress | File > Save and compress | Ctrl Alt S | = Win | cmd alt S |
| 6 | Close the edited home | File > Close | Alt F4 | = Win | cmd W |
| 7 | Display Page setup pane | File > Page setup… | Ctrl Shift P | = Win | cmd shift P |
| 8 | Print the edited home | File > Print… | Ctrl P | = Win | cmd P |
| 9 | Display Preferences pane | File > Preferences… | Ctrl M | = Win | cmd , (under Sweet Home 3D > Preferences…) |
| | **EDIT** | | | | |
| 10 | Transfer focus to a pane | — | Tab / Shift+Tab | = Win | Tab / Shift+Tab |
| 11 | Undo the last action | Edit > Undo | Ctrl Z | = Win | cmd Z |
| 12 | Redo the last undone action | Edit > Redo | Ctrl Y | = Win | cmd shift Z |
| 13 | Cut (copy + delete) selected items | Edit > Cut | Ctrl X | = Win | cmd X |
| 14 | Copy selected items to clipboard | Edit > Copy | Ctrl C | = Win | cmd C |
| 15 | Paste copied/cut items | Edit > Paste | Ctrl V | = Win | cmd V |
| 16 | Paste into the group selected in home | Edit > Paste to group | Ctrl Shift V | = Win | cmd shift V |
| 17 | Paste the style of the copied/cut item | Edit > Paste style | Ctrl Alt V | = Win | cmd alt V |
| 18 | Delete the selected items | Edit > Delete | Del | = Win | Back space |
| 19 | Select all items (list or plan) | Edit > Select all | Ctrl A | = Win | cmd A |
| | **FURNITURE** | | | | |
| 20 | Select a piece in catalog/list | — | Arrows ←↑↓→ | = Win | Arrows ←↑↓→ |
| 21 | Select contiguous pieces | — | Shift Arrows ←↑↓→ | = Win | Shift Arrows ←↑↓→ |
| 22 | Sort furniture list | Furniture > Sort by > Column | (click header once ↑, twice ↓) | | |
| 23 | Toggle selection of a piece | — | (Ctrl+Click) | (= Win) | (cmd+Click) |
| 24 | Add catalog piece to plan at (0,0) | Furniture > Add to home | Ctrl Shift F | = Win | cmd shift F |
| 25 | Display modification pane of selection | Furniture > Modify… | Ctrl E | = Win | cmd E |
| 26 | Create a group | Furniture > Group | Ctrl Shift G | = Win | cmd shift G |
| 27 | Ungroup | Furniture > Ungroup | Ctrl Shift U | = Win | cmd shift U |
| 28 | Align side by side | Furniture > Align side by side | Ctrl Shift B | = Win | cmd shift B |
| 29 | Reset elevation | Furniture > Reset elevation | Ctrl Shift Y | = Win | cmd shift Y |
| 30 | Import a 3D model as furniture | Furniture > Import furniture… | Ctrl Shift I | = Win | cmd shift I |
| 31 | Import an image as a texture | Furniture > Import texture… | Ctrl Alt I | = Win | cmd alt I |
| | **PLAN** | | | | |
| 32 | Switch to Select mode | Plan > Select | Ctrl L | = Win | cmd L |
| 33 | Move selected items pixel by pixel | — | Arrows ←↑↓→ | = Win | Arrows ←↑↓→ |
| 34 | Move selected items 10 px at a time | — | Shift Arrows ←↑↓→ | = Win | Shift Arrows ←↑↓→ |
| 35 | Toggle magnetism while moving | — | (Alt while dragging) | (Shift Alt) | (cmd) |
| 36 | Switch to Pan mode | Plan > Pan | Ctrl Alt P | = Win | cmd alt P |
| 37 | Pan in the plan | — | (Space + drag) | (= Win) | (Space + drag) |
| 38 | Pan up/down | — | Page up ⇞ / Page down ⇟ | = Win | Page up / Page down |
| 39 | Pan left/right | — | Ctrl ⇞ / ⇟ | = Win | Ctrl ⇞ / ⇟ |
| 40 | **Zoom in** | Plan > Zoom in | Ctrl K | **Ctrl +** | cmd + |
| 41 | **Zoom out** | Plan > Zoom out | Ctrl Shift K | **Ctrl -** | cmd - |
| 42 | Zoom centred on mouse cursor | — | (Ctrl + wheel) | (= Win) | (cmd + Wheel) |
| 43 | Lock base plan | Plan > Lock base plan | Ctrl Alt L | = Win | cmd alt L |
| 44 | Unlock base plan | Plan > Unlock base plan | Ctrl Alt L | = Win | cmd alt L |
| | **WALL** | | | | |
| 45 | Switch to Create-walls mode | Plan > Create walls | Ctrl Shift W | = Win | cmd shift W |
| 46 | **Enter wall dimensions with the keyboard** | (in mode) | **Enter** | = Win | **Enter** |
| 47 | **End drawing walls** | (in mode) | **Esc / Double-Enter in keyboard mode** | = Win | same |
| 48 | Display modification pane of selected walls | Plan > Modify walls… | Ctrl Shift E | = Win | cmd shift E |
| 49 | Join closest free ends of selected walls | Plan > Join walls | Ctrl Alt J | = Win | cmd alt J |
| | **ROOM** | | | | |
| 50 | Select Create-rooms mode | Plan > Create rooms | Ctrl Shift R | = Win | cmd shift R |
| 51 | **Enter room dimensions with the keyboard** | (in mode) | **Enter** | = Win | **Enter** |
| 52 | **End drawing a room** | (in mode) | **Esc / Double-Enter** | = Win | same |
| 53 | Display modification pane of selected rooms | Plan > Modify rooms… | Ctrl Alt E | = Win | cmd alt E |
| | **POLYLINE** | | | | |
| 54 | Switch to Create-polylines mode | Plan > Create polylines | Ctrl Shift J | = Win | cmd shift J |
| 55 | **Enter segment dimensions with the keyboard** | (in mode) | **Enter** | = Win | **Enter** |
| 56 | **End drawing a polyline** | (in mode) | **Esc / Double-Enter** | = Win | same |
| 57 | Display modification pane of selected polylines | Plan > Modify polylines… | Ctrl Alt Shift E | = Win | cmd alt shift E |
| | **DIMENSION** | | | | |
| 58 | Switch to Create-dimensions mode | Plan > Create dimensions | Ctrl Shift L | = Win | cmd shift L |
| 59 | **Enter dimensions with the keyboard** | (in mode) | **Enter** | = Win | **Enter** |
| | **TEXT** | | | | |
| 60 | Switch to Add-texts mode | Plan > Add texts | Ctrl Shift T | = Win | cmd shift T |
| 61 | Display modification pane of selected texts | (context: texts) | (Double-click on a text) | (= Win) | (Double-click on a text) |
| 62 | **Increase text size** (texts/rooms/dimensions) | Plan > Modify text style > Increase size | Ctrl Alt K | **Ctrl Alt +** | cmd ctrl + |
| 63 | **Decrease text size** | Plan > Modify text style > Decrease size | Ctrl Alt Shift K | **Ctrl Alt -** | cmd ctrl - |
| 64 | Toggle bold | Plan > Modify text style > Bold | Ctrl B | = Win | cmd B |
| 65 | Toggle italic | Plan > Modify text style > Italic | Ctrl I | = Win | cmd I |
| | **LEVEL** | | | | |
| 66 | Add a level | Plan > Add level | Ctrl Alt N | = Win | cmd alt N |
| 67 | Add a level at the same elevation | Plan > Add level at same elevation | Ctrl Shift N | = Win | cmd shift N |
| 68 | Select a level in plan | — | Arrows ← → with focus on tabs | = Win | Arrows ← → on tabs |
| 69 | Display modification pane of the selected level | Plan > Modify level… | Ctrl Alt B | = Win | cmd alt B |
| 70 | Make the selected level viewable/unviewable | Plan > Make level (un)viewable | Ctrl Shift H | = Win | cmd shift H |
| | **3D VIEW** | | | | |
| 71 | Switch to Aerial view mode | 3D view > Aerial view | Ctrl D | = Win | cmd D |
| 72 | Switch to Virtual visit mode | 3D view > Virtual visit | Ctrl Shift D | = Win | cmd shift D |
| 73 | Turn POV / visitor head | — | A D or Arrows ← → ⇞ ⇟ | = Win | same |
| 74 | Turn 5× faster | — | Shift A D or Shift Arrows ← → ⇞ ⇟ | = Win | same |
| 75 | Move forward/backward | — | W S or Arrows ↑ ↓ | = Win | same |
| 76 | Move forward/backward 5× faster | — | Shift W S or Shift Arrows ↑ ↓ | = Win | same |
| 77 | Move visitor up/down | — | Home / End | = Win | Home / End |
| 78 | Move visitor up/down 5× faster | — | Shift Home / End | = Win | Shift Home / End |
| 79 | Move visitor sideways | — | Alt Arrows ← → | = Win | Alt Arrows ← → |
| 80 | Move visitor sideways 5× faster | — | Shift Alt Arrows ← → | = Win | Shift Alt Arrows ← → |
| 81 | Display modification pane of the virtual visitor | 3D view > Modify virtual visitor… | Ctrl Alt M | = Win | cmd alt M |
| 82 | Store the current point of view | 3D view > Store point of view… | Ctrl Alt R | = Win | cmd alt R |
| 83 | Display the 3D view in a separate window (toggle) | 3D view > Display in separate window / main window | Ctrl Alt Y | = Win | cmd alt Y |
| 84 | Make all levels viewable in the 3D view | 3D view > Display all levels | Ctrl Alt A | = Win | cmd alt A |
| 85 | Make only the selected level and below viewable | 3D view > Display selected level | Ctrl Shift A | = Win | cmd shift A |
| 86 | Display modification pane of the 3D view | 3D view > Modify 3D view… | Ctrl Shift M | = Win | cmd shift M |
| | **HELP** | | | | |
| 87 | Display Sweet Home 3D help window | Help > Sweet Home 3D help | F1 | = Win | cmd ? |

- **F5 (OBSERVED).** The blank-Linux-cell rule is mechanical, not editorial: on the four divergent rows the Linux
  cell holds a *different* key (`Ctrl +`, `Ctrl -`, `Ctrl Alt +`, `Ctrl Alt -`); on all other key rows the Linux
  cell is empty and the Windows key stands. I verified this by splitting the PDF's `<word>` boxes into the four
  x-ranges and listing every row where the Linux range was non-empty — 4 key rows plus the header/mouse-flow
  rows. — `evidence/shortcut_sheet_columns.txt`.
- **F6 (OBSERVED / round-1 corrected).** Round 1's summary bullet 4 said "arrow keys nudge the selection **1 unit**
  (Shift = 10)", and its F27 listed "**Ctrl+K / Ctrl+Shift+K** zoom in/out" with no Linux exception — both read off
  the Windows column. The sheet's Linux column actually says `Ctrl +` / `Ctrl -`; the *history* file agrees
  independently: v1.5 "**Changed zoom shortcut keys under Linux (Ctrl + Ctrl -)**". So `Ctrl+K`/`Ctrl+Shift+K` is
  Windows-only and the Linux bindings are `+`/`-` (and `Ctrl Alt +` / `Ctrl Alt -` for text size). See F34 for the
  "1 unit" correction. — `raw/history.txt` line 1008; `evidence/shortcut_sheet_columns.txt`.
- **F7 (OBSERVED).** The bundle confirms the two-route design that makes this localizable: menu accelerators are
  resource strings read via `ResourceAction.readActionProperties` looking up `"<Prefix>.<Action>.AcceleratorKey"`
  first with a `.<OperatingSystem.getName()>` suffix and then without (so a macOS override is data, not code);
  and `HomePane.keydownListener` scans the `actionMap` for a matching `ACCELERATOR_KEY` **before** falling back
  to the component `inputMap`. — `raw/js/sweethome3d.min.js` (`ResourceAction.readActionProperties`, `HomePane.keydownListener`).
- **F8 (OBSERVED).** But the **Online** build only ships six accelerator resource entries, not 87:
  `HomePane.{CUT,COPY,PASTE,UNDO,REDO,DELETE}.AcceleratorKey` (+ `.Mac OS X` variants) — `control X/C/V/Z/Y`,
  `meta X/C/V/Z`, `REDO` macOS `meta shift Z`, `DELETE` = `DELETE` on Windows / `BACK_SPACE` on macOS. All the
  `Ctrl+Shift+W`, `Ctrl+L`, `Ctrl+K`, `Ctrl+Alt+P`, `Ctrl+Alt+L`, `Ctrl+M`, `Ctrl+Shift+R`, … bindings from the
  sheet are **menu accelerators of the desktop build**, and the Online build ships no menu bar (round-1 F44) and
  no resource rows for them. — `raw/localization.json` (only 12 `AcceleratorKey` entries; extracted list below).

  ```
  HomePane.CUT.AcceleratorKey                        = 'control X'
  HomePane.COPY.AcceleratorKey                       = 'control C'
  HomePane.PASTE.AcceleratorKey                      = 'control V'
  HomePane.UNDO.AcceleratorKey                       = 'control Z'
  HomePane.REDO.AcceleratorKey                       = 'control Y'
  HomePane.DELETE.AcceleratorKey                     = 'DELETE'
  HomePane.CUT.AcceleratorKey.Mac OS X               = 'meta X'
  HomePane.COPY.AcceleratorKey.Mac OS X              = 'meta C'
  HomePane.PASTE.AcceleratorKey.Mac OS X             = 'meta V'
  HomePane.UNDO.AcceleratorKey.Mac OS X              = 'meta Z'
  HomePane.REDO.AcceleratorKey.Mac OS X              = 'meta shift Z'
  HomePane.DELETE.AcceleratorKey.Mac OS X            = 'BACK_SPACE'
  ```

### 2.3 The Escape contract (state machine, verbatim)

- **F9 (OBSERVED).** The plan binds `ESCAPE` and `Shift+ESCAPE` → action `ESCAPE` in the **default** input map,
  and in the **edition** input map `ESCAPE`/`Shift+ESCAPE` plus (macOS) `alt+ESCAPE` or (Windows/Linux)
  `control+ESCAPE` also map to `ESCAPE`. — `evidence/plan_inputmaps.txt`; `raw/js/sweethome3d.min.js` (`installDefaultKeyboardActions`, `installEditionKeyboardActions`).
- **F10 (OBSERVED).** `ESCAPE` is **not one behaviour** — it delegates to `PlanController.escape()`, which calls
  the *current* state's `escape()`. Per state, from the bundle:
  - `WallDrawingState.escape()`: if a tentative wall exists, `home.deleteWall(newWall)` and splice it out of
    `newWalls`; then `validateDrawnWalls()`.
  - `RoomDrawingState.escape()`: if a room exists and no point is *being* placed, `removePoint(pointCount-1)`;
    then `validateDrawnRoom()`.
  - `PolylineDrawingState.escape()`: same shape — pop the dangling point, `validateDrawnPolyline()`.
  - `DimensionLineDrawingState.escape()`: delete the unfinished `newDimensionLine`; then, **for a mouse**
    (not touch) pointer, `setState(DimensionLineCreationState)` — i.e. stay in the mode for another dimension.
  - Drag/resize states (`PieceOfFurnitureRotationState`, `…ElevationState`, `ResizeState`, `LightPowerModificationState`,
    `WallResizeState`, `WallArcExtentState`, `RoomResizeState`, `RoomNameOffsetState`, `…RotationState`,
    `CameraYawRotationState`, `LabelRotationState`, `CompassRotationState`, …): each **restores the value it
    captured on entry** (`setAngle(oldAngle)`, `setX(oldX)`, `setElevation(oldElevation)`, `setPower(oldPower)`, …)
    and returns to the selection state. This is a true "abort this gesture".
  - `SelectionMoveState` (dragging) and `RectangleSelectionState`: `setState(getSelectionState())` — deselect-stage cancel.
  - The 3D camera state: `HomeController3D…CameraControllerState.escape()` → re-enters the plan's escape when
    "editing in 3D view" is enabled; otherwise a no-op.
  — `raw/js/sweethome3d.min.js` (every `prototype.escape=function` in the PlanController block).
- **F11 (OBSERVED).** `validateDrawnWalls`, `validateDrawnRoom`, `validateDrawnPolyline` and
  `validateDrawnDimensionLine` all end identically: if the last pointer was **TOUCH** → `setState(SelectionState)`;
  **else** → `setState(…CreationState)` (walls / rooms / polylines / dimension-line respectively). **Therefore with
  a mouse, Escape on an unfinished object finishes it and *stays in the same creation mode*** — the mode is only
  left via the toolbar/`Plan > Select`. The touch branch is the mobile-app behaviour (round-1 F49).
  — `raw/js/sweethome3d.min.js`.
- **F12 (OBSERVED, live, round-1 evidence re-read).** Round-1's `scenario4` gives an exact before/after pair for
  Escape in Create-walls mode. Entering the mode: *Lock base plan* **enabled**, no tooltip. After two plan clicks:
  *Lock base plan* **[disabled]** and the tooltip "Length: 0 cm Angle: 0° Thickness: 7.5 cm" appears — i.e. a wall
  edit is in progress and the base plan is protected. After `Escape`: *Lock base plan* is **enabled** again and the
  tooltip is **gone** — the tentative wall was deleted and the controller returned to the idle (creation) state.
  This is the live confirmation of F10/F11's wall branch. — `/…/09-09-ui-workflow-shortcuts/evidence/s4_mode_walls_a11y.txt`,
  `s4_wall_click2_a11y.txt`, `s4_escape_a11y.txt`; round-1 F30.
- **F13 (OBSERVED).** In the **3D view** the map binds `pressed ESCAPE` and `shift pressed ESCAPE` → `ESCAPE`
  (no per-state revert beyond that). — `evidence/plan_inputmaps.txt`.
- **F14 (OBSERVED).** Dialog-level Escape is a *separate, global* `document` keydown handler in the JS build:
  `if (key == "Escape" || keyCode == 27) { if (!JSComboBox.closeOpenedSelectionPanel()) { JSDialog.closeTopMostDialog(); JSPopupMenu.closeOpenedMenu() } }`.
  It closes an open combo box first, then the top-most `.dialog-container.visible`, then any popup menu. Because
  `HomePane.keydownListener` early-returns when `JSDialog.getTopMostDialog() !== null`, a dialog swallows editor keys.
  — `raw/js/sweethome3d.min.js`; round-1 F29 (re-confirmed).
- **F15 (OBSERVED, live, Online).** I tested that handler directly: after a double-click opened the furniture
  modification dialog (OK/Cancel present), a `press … key: "Escape"` **did not close it** — the dialog and its
  OK/Cancel were still in the tree on the next capture, and the same was true on a *second* Escape and on Enter.
  The dialog only disappeared when a subsequent step clicked a toolbar button. So in this headless Online run the
  dialog-Escape path was not reachable; whether that is a focus artefact of the synthetic key (the `document`
  listener should not care) or a genuine gap I could not separate. — `evidence/scenario_r2b.json`,
  `evidence/r2b_dblclick_row_a11y.txt` → `r2b_esc_on_dialog_a11y.txt` → `r2b_enter_on_dialog_a11y.txt`.

### 2.4 The Enter contract (keyboard dimension entry)

- **F16 (OBSERVED).** `PlanComponent.installDefaultKeyboardActions` binds `pressed ENTER` **and** `shift pressed ENTER`
  → `ACTIVATE_EDITIION` (the misspelling is in the shipped bundle); platform overlays add `alt+ENTER` (macOS),
  `control+ENTER` (Windows/Linux), and the Linux trio `alt shift ENTER` / `control alt shift ENTER`. The action map
  routes `ACTIVATE_EDITIION` → `setEditionActivated(true)`. — `evidence/plan_inputmaps.txt`.
- **F17 (OBSERVED).** `installEditionKeyboardActions` (the map that is *supposed* to be swapped in while a field
  is being edited) binds `ENTER`/`Shift+ENTER` and the platform variants → `DEACTIVATE_EDITIION`, and `ESCAPE` → `ESCAPE`.
  It is **defined but never called anywhere in the bundle** (one definition, zero call sites), so the edition map is
  dead code in the Online build. — `raw/js/sweethome3d.min.js`.
- **F18 (OBSERVED).** `setEditionActivated(true)` per creation state sets an **editable-property list** on the view:
  - walls: `["X","Y"]` before the first wall, else `["LENGTH","ANGLE","THICKNESS"]`, or `["ARC_EXTENT"]` for a curved wall;
  - rooms: `["X","Y"]` before the first point, else `["LENGTH","DIAGONAL","ANGLE"]` (≥3 points) or `["LENGTH","ANGLE"]`;
  - polylines: `["X","Y"]` or `["LENGTH","ANGLE"]`;
  - dimensions: `["X","Y"]`, then `["LENGTH","ANGLE"]`, then `["OFFSET"]`.
  `PlanController.updateEditableProperty(name, value)` is what consumes typed digits, clamping to the unit's
  min/max length. So the contract is: **Enter toggles between "point with the mouse" and "type the numbers", and
  which numbers you may type depends on how far the object has been drawn.** — `raw/js/sweethome3d.min.js`
  (`setEditionActivated`, `updateEditableProperty` for each state).
- **F19 (OBSERVED, decisive).** In the JS build `PlanComponent.prototype.setToolTipEditedProperties=function(c,b,a,d){}`
  is an **empty stub**. The *read-only* sibling `setToolTipFeedback` **is** implemented (it writes
  `this.tooltip.innerHTML`). Therefore in Online the tooltip can display "Length: N cm Angle: N° Thickness: N cm"
  but the Enter path cannot turn those fields editable. — `raw/js/sweethome3d.min.js`;
  `evidence/editing_contract.txt`.
- **F20 (DOCUMENTED).** The vendor says the same thing in prose twice, in both languages: English user guide
  "you may enter the length and the angle of the wall being created after pressing the enter key **(feature not
  available in Online and Mobile versions)**" and German "…nachdem Sie die **Eingabetaste** gedrückt haben
  (Funktion nicht in den Online- und Mobile-Versionen verfügbar)". — `raw/userguide.txt` l. 212;
  German guide <https://www.sweethome3d.com/de/sweet-home-3d-benutzerhandbuch/>.
- **F21 (OBSERVED).** The mode tips encode the same rule in richer wording, e.g. walls: *"As long as you don't
  double-click or press the Escape key, each new click indicates the opposite point of the current wall and the
  start point of the next wall. **When the plan has focus, you may switch to keyboard entry at any time by pressing
  the enter key.**"* — and the phrase "when the plan has focus" is the important precondition: the `ENTER` binding
  lives on the plan component's own `keydown` listener, not on the document. — `raw/localization.json`
  (`HomePane.CREATE_WALLS.tipMessage` … `CREATE_POLYLINES.tipMessage`).
- **F22 (OBSERVED, live — narrower than it first looks).** Live test: in Create-walls mode after two clicks the
  read-only wall tooltip "Length: 0 cm Angle: 0° Thickness: 7.5 cm" was present; after `press Enter` it was **gone**
  and stayed gone through `5`, `Enter`, `Escape`; the Undo button stayed **"Can't Undo"** throughout, so no wall was
  committed. That is exactly the signature of F19: `ENTER` **does** reach the handler and
  `setEditionActivated(true)` **does** run — and its very first statement is `view.deleteFeedback()`, which hides the
  read-only tooltip via `deleteToolTipFeedback()` — but the very next call, `view.setToolTipEditedProperties([...])`,
  is the empty stub, so no editable field is ever rendered and the typed `5` has nowhere to go. So Enter has a
  *partially observable* effect in Online (it clears the tooltip) and no usable one. — `evidence/scenario_r2.json`,
  `evidence/r2_wall_c2_a11y.txt` (tooltip present) vs `evidence/r2_enter_keyboard_a11y.txt` (absent);
  `raw/js/sweethome3d.min.js` (`WallDrawingState.setEditionActivated`, `PlanComponent.deleteFeedback`).
- **F23 (OBSERVED).** `Double-Enter in keyboard mode` in the sheet (F-table rows 47/52/56) is explained by the
  **state swap**: the first Enter enters edition mode (default map → `ACTIVATE_EDITIION`), the second Enter is
  handled by the edition map (`DEACTIVATE_EDITIION`) and commits. Because the Online build never installs the
  edition map, "Double-Enter in keyboard mode" has no Online meaning. — F16–F17.

### 2.5 The double-click contract

- **F24 (OBSERVED).** Double-click is delivered as `clickCount = 2`: the DOM `dblclick` listener sets
  `updateCoordinates(f,"mouseDoubleClicked")` and the coordinate normaliser stores `clickCount = 2` (single
  press/release → 1). The plan then calls `pressMouse(x, y, clickCount, shift, …)`; the `clickCount` argument is
  what every creation state branches on. — `raw/js/sweethome3d.min.js` (`mouseDoubleClicked`, `updateCoordinates`).
- **F25 (OBSERVED).** **Select mode**: `SelectionState.pressMouse` — on `clickCount === 2`, if an item is under
  the cursor and Shift is not held, call `modifySelectedItem()`. That dispatches by the *single* selected item's
  type: `HomePieceOfFurniture` → furniture dialog, `Wall` → wall dialog, `Room`, `Polyline`, `DimensionLine`,
  `Label`, `Compass`. This is the canonical "double-click an object to open its modification pane" from the sheet.
  — `raw/js/sweethome3d.min.js`.
- **F26 (OBSERVED, live).** Confirmed live in the Online build: double-clicking a furniture row in the furniture
  list opened the modification dialog (its accessibility tree gained `OK` / `Cancel` and the full
  name/description/price/location/angle/elevation/width/depth/height/colour/material controls; it was absent on the
  preceding single-click step). — `evidence/scenario_r2.json`, `evidence/r2_dblclick_row_a11y.txt`,
  `evidence/r2_select_row_a11y.txt`.
- **F27 (OBSERVED, live).** Double-clicking in the *plan* in Select mode is subject to hit-testing; my synthetic
  plan clicks in an earlier round-1 attempt produced no canvas action (round-1 Unknowns), and this round I used the
  list row for the dialog test. So F25's plan-side dispatch is bundle-verified, not live-observed. — `evidence/scenario_r2.json`.
- **F28 (OBSERVED).** **Create-walls mode** (`WallDrawingState.pressMouse`, `clickCount === 2`): if the selection is
  empty and the item under the cursor is a **Room**, `createWallsAroundRoom(room)` — "Create missing walls around a
  room"; otherwise finish the current chain (round the wall if needed) and `joinNewWallEndToWall` + `validateDrawnWalls()`.
  — `raw/js/sweethome3d.min.js`.
- **F29 (OBSERVED).** **Create-rooms mode** (`RoomDrawingState.pressMouse`, `clickCount === 2`): if no room is in
  progress, `computeRoomPointsAt(x, y)` and, if it returns a boundary, create the room from those points and select
  it; then `validateDrawnRoom()` — "double-click inside a closed surface to create that room". If a room *is* in
  progress, instead `endRoomSide()` — "double-click at the last corner". — `raw/js/sweethome3d.min.js`.
- **F30 (OBSERVED).** **Create-polylines mode** (`PolylineDrawingState.pressMouse`, `clickCount === 2`): if a
  polyline is in progress and the double-click lands on its **first point**, remove the last point and set
  `closedPath = true` — i.e. double-clicking the start closes the polygon; otherwise `validateDrawnPolyline()`.
  — `raw/js/sweethome3d.min.js`.
- **F31 (OBSERVED).** **Create-dimensions mode** (`DimensionLineDrawingState.pressMouse`): on the *first*
  double-click (`newDimensionLine == null && clickCount === 2`) it calls `getMeasuringDimensionLineAt(x, y, magnetism)`
  over furniture, walls and room sides and, on a hit, creates a dimension on that object's edge. — `raw/js/sweethome3d.min.js`.
- **F32 (OBSERVED).** **Furniture list**: a double-click on a row is *not* special-cased in the plan component —
  the live dialog (F26) comes from the list's own row listener, which is the same `modifySelectedItem` surface.
  — `evidence/scenario_r2.json`.
- **F33 (OBSERVED).** **Level tabs** and **texts** are the two other double-click surfaces the sheet calls out:
  book "Double-click on level tab" (Ctrl Alt B in the toolbar/menu) and "Double-click on a text". Both reduce to the
  same `modifySelectedItem` dispatch (F25) once the tab/text is the selected item. — `raw/SweetHome3DShortcuts.txt`.

### 2.6 The arrow-key contract

- **F34 (OBSERVED).** The plan binds the four arrows to `MOVE_SELECTION_{LEFT,UP,DOWN,RIGHT}` and
  `Shift+arrow` to the corresponding `MOVE_SELECTION_FAST_*`. The action objects are constructed as
  `new f(dx, dy)` with `(-1,0)/(0,-1)/(0,1)/(1,0)` and `(-10,0)/(0,-10)/(0,10)/(10,0)`, and
  `f.prototype.actionPerformed` calls **`controller.moveSelection(dx / getScale(), dy / getScale())`**. So an
  arrow press moves the selection by exactly **1 screen pixel worth of model units** (Shift: 10), and the metric
  distance therefore depends on the current zoom — confirming the sheet's "pixel by pixel / 10 pixels by 10 pixels"
  wording and **correcting round 1's "nudge the selection 1 unit"** (which is true only at scale 1; at the default
  zoom the step is whatever `1/scale` model units is). — `raw/js/sweethome3d.min.js`; `evidence/editing_contract.txt`.
- **F35 (OBSERVED).** `PlanComponent.getPixelLength()` returns `1 / getScale()`, so "1 px" is the plan's own model
  unit per pixel; this is the same quantity used elsewhere for magnetised hit detection. Zoom is clamped to
  `[0.01, 10]` and persisted as `PlanController.SCALE_VISUAL_PROPERTY`
  (`com.eteks.sweethome3d.SweetHome3D.PlanScale`), so the arrow key's *metric* step is a saved property of the home.
  — round-1 F15; `raw/js/sweethome3d.min.js`.
- **F36 (OBSERVED).** The move is only performed for items where `isItemMovable(item)`; it goes through
  `moveAndShowSelectedItems`, which moves, re-selects, makes the moved items visible (round-1 F25 note: the viewport
  scrolls only when a moved item would leave the screen) and posts an undoable `postItemsMove` edit labelled
  **"Undo Move"**. — `raw/js/sweethome3d.min.js`.
- **F37 (OBSERVED, live).** Confirmed in the Online build: with a furniture row selected, `ArrowRight` changed the Undo
  button from **"Can't Undo"** to **"Undo Move"**, and a following `Shift+ArrowUp` kept it at "Undo Move"; a `Delete`
  changed it to **"Undo"**. So arrow nudging is a first-class, undoable edit in the browser build. — `evidence/scenario_r2.json`,
  `evidence/r2_arrow_left_a11y.txt`, `r2_shift_arrow_up_a11y.txt`, `r2_escape_final_a11y.txt`.
- **F38 (OBSERVED).** Arrows are also overloaded, in mutually exclusive focus contexts: catalog/list browsing
  (`FURNITURE` rows 20–21), plan selection nudge (rows 33–34), level tabs (row 68), and the 3D camera (rows 73–80).
  The level-tab and list cases are *focus-scoped*, not mode-scoped. — `raw/SweetHome3DShortcuts.txt`.
- **F39 (OBSERVED).** The **3D-view** arrow map is separate and identical in structure to the sheet: `←/→` rotate
  yaw (with `Shift` = `ROTATE_CAMERA_YAW_FAST_*`), `↑/↓` move forward/backward, `Page Up/Page Down` pitch,
  `Home/End` elevate, `Alt+←/→` strafe, `W/A/S/D` aliases for the arrows, and every "fast" variant is the `Shift`
  prefix. There is **no `ENTER` and no `MOVE_SELECTION`** in the 3D map; `ESCAPE` maps to `ESCAPE`.
  — `evidence/plan_inputmaps.txt`.
- **F40 (OBSERVED).** The 3D navigation panel sprite (round-1 F47) synthesises these very key strings: its
  `data-simulated-key` attribute value is parsed and prefixed with the real modifier state
  (`if (u.ctrlKey || s.indexOf("control ")!=-1) u += "control "`, then `alt `, `meta `, `shift `) and then
  `u += "pressed " + s` is fed to `callAction`. So the on-screen arrows and the physical keyboard share one path —
  a pointer-only user gets the same map. — `raw/js/sweethome3d.min.js`.
- **F41 (OBSERVED).** The plan's `MOVE_SELECTION_*` and the plan's `ESCAPE` are **default-map-only**: they are not
  repeated in the edition map, reinforcing that while you are typing a dimension the arrows are consumed by the text
  field, not the plan. — `evidence/plan_inputmaps.txt`.

### 2.7 The two-route keyboard dispatch (and why Round 1's clipboard mystery is real, not a focus artefact)

- **F42 (OBSERVED).** Two independent handlers exist: (a) `HomePane.keydownListener` on `document`, which scans
  `actionMap` by `ACCELERATOR_KEY` (the six resource ones) and then the pane `inputMap`; and (b) `PlanComponent`'s
  own `keydown`/`keyup` listeners on the plan canvas, which only use the plan `inputMap`. Route (a) is what the
  sheet's 87 menu accelerators use on the desktop. — `raw/js/sweethome3d.min.js`.
- **F43 (OBSERVED, live, decisive).** I pressed `Control+Shift+W`, `Control+L`, `Control+K`, `Control+Alt+P`,
  `Control+Alt+L`, `Control+Shift+R`, `Control+M` and `Control+Z`/`Control+Y` at both the plan canvas and `body`.
  **None** produced any observable change: the mode buttons never gained `[pressed]`, *Lock base plan* never became
  disabled the way a real Create-walls entry makes it (compare `r2_mode_walls_a11y.txt`, where the click **did**
  disable it), the Preferences dialog never opened after `Ctrl+M`, and after an arrow-nudge had set Undo to
  "Undo Move" a `Ctrl+Z` left it unchanged (it stayed "Undo Move", it never became "Redo Move"). — `evidence/scenario_r2b.json`,
  `evidence/r2b_accel_*_a11y.txt`, `evidence/scenario_r2c.json`, `evidence/r2c_ctrl_z_plan_a11y.txt`.
- **F44 (INFERRED).** That closes Round 1's open question ("Why the clipboard accelerators didn't fire"). The
  answer is **the resource table, not focus**: the Online build ships only the six clipboard/undo accelerators, and
  in the headless Chromium run *even those* did not change state (round-1 F30 and my `Ctrl+Z` re-test), whereas the
  plan's own input-map keys (arrows, Delete, Escape) worked every time. So on the web, **the only reliable keyboard
  surface is the plan component's input map**; the document-level accelerator route is effectively inert in this
  build. This also means the round-1 speculation that it was "the list half of the accelerator route" (its F55) is
  too generous — the plan half is inert too.

### 2.8 Mouse column (the other half of the contract, for completeness)

- **F45 (OBSERVED).** The mouse column encodes a coherent contract that mirrors the keyboard: click to select,
  Shift+click to toggle, marquee drag to select all intersecting, **Shift+marquee** to toggle, right-click ▸
  *Select object* / *Toggle selection* for hidden items; Ctrl+drag (mac `alt`+drag) to duplicate, Ctrl+Shift+drag
  (mac `alt shift`) to duplicate along an axis; **Alt (Win) / Shift+Alt (Linux) / cmd (mac) while dragging** to
  bypass magnetism; Space+drag to pan in any mode; Ctrl+wheel (mac cmd+wheel) to zoom at the cursor; Shift+wheel or
  trackpad to pan horizontally; Page Up/Down or wheel to pan vertically; Shift while dragging the background-image
  scale line to force it horizontal/vertical. — `raw/SweetHome3DShortcuts.txt`; round-1 F28.
- **F46 (OBSERVED).** The bundle's hit-test modifiers agree with the sheet's three-column mouse cells:
  `isShiftDown` = `shiftKey && !altKey && !ctrlKey && !metaKey` (plain Shift+click = toggle selection);
  `isAlignmentActivated` = Windows/macOS `shiftKey`, else (`Linux`) `shiftKey && !altKey` (the sheet's
  "Shift+Click at the first mouse move" axis lock); **`isDuplicationActivated` = macOS `altKey`, else `ctrlKey`**
  (the sheet's "Ctrl + Drag … / alt + Drag" duplicate gesture — note Linux is *not* an exception here, its cell is
  blank = inherits Ctrl); and `isMagnetismToggled` = Windows `altKey`, macOS `metaKey`, else (`Linux`)
  `shiftKey && altKey` (the sheet's "Alt / Shift Alt / cmd while dragging" cell). — `raw/js/sweethome3d.min.js`
  (`isShiftDown`/`isAlignmentActivated`/`isDuplicationActivated`/`isMagnetismToggled`);
  `evidence/shortcut_sheet_columns.txt`.
- **F47 (OBSERVED).** Shift is *also* bound as a pure-press/release event (`shift pressed SHIFT` → `ACTIVATE_ALIGNMENT`,
  `released SHIFT` → `DEACTIVATE_ALIGNMENT`, with `Ctrl+Shift` / `Alt+Shift` overlays per OS), which is what makes
  "press Shift *after* the first mouse move" (the sheet's axis-lock gesture) work at all.
  — `raw/js/sweethome3d.min.js`.

### 2.9 Online vs Desktop: what actually survives into the browser

- **F48 (OBSERVED).** Browser-surviving keyboard surface (from the bundle and live tests): plan `DELETE`/`BACK_SPACE`,
  `ESCAPE`/`Shift+ESCAPE`, four arrows, `Shift+`arrows, `ENTER`/`Shift+ENTER` (**bound but inert**), the plan's
  magnetism/alignment/duplication modifier presses, and the 3D camera map. Browser-dead: every menu accelerator
  (F43), the edition map (F17), the editable-tooltip path (F19). — `evidence/plan_inputmaps.txt`,
  `evidence/scenario_r2*.json`.
- **F49 (OBSERVED).** Round 1 already established that Online drops the menu bar but keeps the same four panes and
  toolbar (its F44), stubs the tips (`showActionTipMessage` returns `false`, its F13/F45) and ships dialog templates
  for the modification panes (its F46). The shortcut picture fits that shape exactly: **Online keeps the pointer
  contract and the plan's mode keys, and quietly loses the accelerator layer and the typed-dimension layer.**
  — round-1 report; `evidence/scenario_r2.json`.
- **F50 (INFERRED).** The four platform-specific `AcceleratorKey` overrides that do exist (the clipboard six) are
  exactly the ones the Online build needs, because those are the only ones reachable without a menu bar. The
  desktop's 80-odd other menu accelerators were never worth porting because the menu wasn't ported. This is a
  coherent product decision, not an oversight — and it is why the German page, the English page and the PDF all
  describe a richer shortcut set than the web app actually honours.

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

CasaPlazAI is a single-workspace web floorplanner (TypeScript/Three.js, no backend, localStorage). Ranking =
value for that product, then effort. Each item names the finding it comes from and, where relevant, the schema hook.

| # | Idea | Why (finding) | Value | Effort |
|---|------|---------------|-------|--------|
| 1 | **Write down one editing contract and make it the same for every tool: `Escape` = abort/cancel this gesture (and on a second press, leave the mode); `Enter` = switch to typed dimensions; `double-click` = open the inspector for the thing under the cursor; `arrows` = nudge.** Publish it in-app (tooltip + a shortcut sheet modal). | F9–F14, F24–F37 — Sweet Home 3D's contract is *almost* this but has per-state exceptions (Escape finishes and *stays* in walls mode; double-click means "finish" in creation modes and "inspect" in Select mode). CasaPlazAI can be simpler and be honest about it. | High | Low |
| 2 | **Nudge by screen pixels, not by metres.** Store the nudge as `dx = ±1 (or ±10 with Shift) / zoom`, and let the snap grid re-quantise afterwards. | F34–F35 — pixel-based nudging feels identical at every zoom; a fixed 0.5 m arrow step is useless zoomed in and glacial zoomed out. `snap` already lives outside the schema (`casaplaza.snap.settings.v1`), so the nudge step belongs there too. | High | Low |
| 3 | **Make typed dimension entry first-class, not a desktop-only luxury.** After the first canvas point, let the user type a length/angle (and width/height) and commit with `Enter`; drive it from a single `editablePropertiesFor(tool, progress)` table modelled on Sweet Home 3D's `setEditionActivated` lists (`["X","Y"]` → `["LENGTH","ANGLE","THICKNESS"]`). | F16–F23 — this is the reference app's *best* precision affordance and it is exactly what its own web edition lost. It maps cleanly onto the schema's `polygon`/`wallThickness` and `tCenter` for openings. | High | Med |
| 4 | **Give every undo entry a human label and show it on the button** ("Undo Move", "Undo Delete door", "Undo Create wall", "Can't undo" when empty). | F36, F37 (live "Undo Move") and round-1 F19/F20 — the label is generated from a string template per operation, so each new tool costs one string. | High | Low |
| 5 | **Ship a real, complete shortcut sheet as a discoverable in-app surface** — and generate it from the same table that binds the keys, so it can never drift. | Paper. — F1–F8 — the reference app's own sheet drifted from its web build because the two tables were separate (F43, F48). Deriving the sheet from the binding table makes drift impossible. | Med–High | Low–Med |
| 6 | **Treat the OS modifier matrix as data, not code.** One binding table with a `mac`/`win`/`linux` override column; resolve `Cmd` vs `Ctrl` at bind time. | F7, F8, F46 — matches the reference app's `AcceleratorKey[.Mac OS X]` resource lookup, and it is the reason its macOS build gets `cmd` variants for free. CasaPlazAI has no mac-specific code today; this keeps it that way. | Med | Low |
| 7 | **Make `Escape` genuinely hierarchical: open combo/search → open dialog → in-progress geometry → selection.** | F14 and F15's live non-closure — the reference app *tries* this ordering (combo → dialog → menu) and its web build's dialog-Escape did not work in my run. A deterministic order is a small win that users notice. | Med | Low |
| 8 | **Double-click = "inspect" in every mode, and use an explicit modifier for "finish"** (or let double-click finish only when a chain is in progress). | F25 vs F28–F32 — Sweet Home 3D overloads double-click per state, which is why the sheet needs a separate "double-click to finish" row for every creation tool. CasaPlazAI has fewer tools and can afford one rule. | Med | Low |
| 9 | **Star the four `+`/`-` bindings as the *only* platform-divergent keys**, and test them on Linux. | F5, F6 — this is the one row of the whole sheet where Linux differs, and the reference app documents it by leaving the cell blank elsewhere. A `keybindings` unit test asserting "Windows ≡ Linux except zoom/text-size" is cheap insurance. | Med | Low |
| 10 | **Keep an on-screen navigation cluster for the 3D/Walk mode that synthesises the *same* key strings as the physical keys.** | F40 — the reference app's 3D arrow pad fakes `"pressed UP"` etc. and feeds the identical action path, so both input routes are guaranteed consistent. CasaPlazAI's Walk mode has no keyboard story; this is the cheapest way to add one that also works by pointer. | Med | Med |
| 11 | **Decide deliberately what the browser build drops, and grey out rather than hide.** Sweet Home 3D Online keeps the plan keys and silently loses the accelerators; a CasaPlazAI "Plan/3D/Walk" UI should mark unavailable actions `disabled` with a tooltip explaining why. | F43, F48, F49 — the reference's silent-drop is the cause of the sheet-vs-app mismatch and of its own bug reports. Round-1 F11 already recommends grey-out over hide. | Med | Low–Med |
| 12 | **Do not build a detached 3D window, a plug-in API, or a photo/video renderer in v1** — the reference's own web edition omits them (`Ctrl Alt Y` detach is stubbed to a no-op). | Round-1 F6/F44/F45; F-task rows 83 — negative recommendation, matches the reference's own restraint. | N/A (negative) | — |

---

## 4. Unknowns / what I could not verify

- **Why dialog-Escape and dialog-Enter did not fire live.** My synthetic `Escape`/`Enter` presses with the locator on
  `#home-furniture-dialog-template` (and on `body`) left the modification dialog open, even though the bundle's
  `document` keydown handler at `if (b.key=="Escape"||b.keyCode==27) … JSDialog.closeTopMostDialog()` should close
  it and the `keyCode==13` branch should click `.default-capable`. It may be that Playwright's `press` went to an
  element that stopped propagation, or that the dialog was rendered but not `.dialog-container.visible` when the key
  was dispatched. I could not distinguish these; F15 is OBSERVED-as-it-behaved, not a claim that the code path is
  broken.
- **Plan-canvas synthetic clicks did not move the plan cursor.** All my plan-plane actions used default
  `#home-plan` centre coordinates, so walls/rooms/dimensions were never actually drawn during the live runs; the
  creation-state behaviour (F10–F12, F28–F31) rests on the bundle, and the round-1 click evidence, not on new live
  geometry.
- **The desktop binary was not run.** Everything about the *desktop* accelerators (the 81 rows other than the six
  clipboard ones) is from the vendor PDF, the user guide and the shared localization/bundle, because this job may
  not download or run installers. So "`Ctrl+L` switches to Select mode on the desktop" is DOCUMENTED, not OBSERVED.
- **No macOS/Linux host.** The macOS/Linux branches of the input maps are read from the bundle's
  `OperatingSystem.isMacOSX()` / `isWindows()` conditionals; I could not exercise either OS. In particular the
  Linux `Shift+Alt` magnetism bypass and the Linux `Ctrl +`/`Ctrl -` zoom keys are code/doc-level only.
- **The mobile app's keyboard story.** Round 1 documented the mobile gestures (its F49) and I did not extend that;
  mobile has no hardware keyboard contract in the sheet, and I did not install the paid app.
- **`DefaultFurnitureCatalog` / other-language accelerators.** The Online build ran with `userLanguage = "en"`. I
  read the German *user guide* and the German documentation page (both link the same English PDF and both carry the
  German "Funktion nicht in den Online- und Mobile-Versionen verfügbar" caveat), but I did not exercise the app
  under `de`, so whether any key label is localised beyond the resource strings is untested.
- **Why only six `AcceleratorKey` rows ship in `localization.json`.** It is consistent with the missing menu bar
  (F50, INFERRED), but the Online build's resource bundle is generated from a subset of the desktop one I do not
  have, so I cannot prove the exclusion was deliberate.
- **Version drift is now narrow but not zero.** The sheet is v7.0 and current (F1), and 7.1–7.5.2 add no combos
  (F3); however, 7.2 added the *Modify dimensions* dialog and 3D selection/editing, and I did not enumerate whether
  those new dialogs introduced local-only default buttons (OK/Enter) that the sheet omits.

---

### Licence note

Sweet Home 3D is distributed under the **GNU General Public License** (eTeks / Space Mushrooms). The shortcut PDF is
© 2022 eTeks. This report quotes only short factual identifiers (action names, key strings, class/method/key names)
needed to cite behaviour, plus the vendor's own user-facing table rows and tooltip sentences; it contains **no source
code excerpts** and redistributes no Sweet Home 3D assets. CasaPlazAI and 3D House Planner are proprietary — nothing
here is copied into a deliverable for reuse. Per-URL licences are listed in `sources.json`.

### Evidence index (in this job folder)

- **Shortcut sheet:** `raw/SweetHome3DShortcuts.pdf` (md5 `db41ddc286887cce79b9bfc952a5c505`, 4 pages, v7.0),
  `raw/SweetHome3DShortcuts.txt` (`pdftotext -layout`), `raw/shortcuts_bbox.html` (`pdftotext -bbox-layout`),
  `evidence/shortcut_sheet_columns.txt` (per-row Windows/Linux/macOS/mouse columns reconstructed from word x-coords).
- **Bundle extracts:** `evidence/plan_inputmaps.txt` (plan default map, plan edition map, 3D map),
  `evidence/editing_contract.txt` (action map, arrow offsets, escape implementations, double-click branches,
  `setToolTipEditedProperties` stub). Source bundle (read-only copy from round 1):
  `/…/09-09-ui-workflow-shortcuts/raw/js/sweethome3d.min.js` and `raw/js/core.min.js` (`KeyStroke`).
- **Live scenarios:** inputs `raw/scenario_r2.json`, `raw/scenario_r2b.json`, `raw/scenario_r2c.json`;
  outputs `evidence/scenario_r2.json` (arrow/Delete/Escape + double-click dialog + wall tooltip),
  `evidence/scenario_r2b.json` (7 accelerators + dialog Escape/Enter), `evidence/scenario_r2c.json`
  (Ctrl+Z after an arrow move). Per-step accessibility trees: `evidence/r2_*_a11y.txt`, `evidence/r2b_*_a11y.txt`,
  `evidence/r2c_*_a11y.txt`.
- **Reused read-only (round 1):** `09-09-ui-workflow-shortcuts/report.md`, `…/raw/history.txt`, `…/raw/userguide.txt`,
  `…/raw/localization.json`, `…/evidence/s4_escape_a11y.txt`, `…/evidence/s4_wall_click2_a11y.txt`.
- **Fetched this round:** `https://www.sweethome3d.com/storage/SweetHome3DShortcuts.pdf`,
  `https://www.sweethome3d.com/de/dokumentation/`, `https://www.sweethome3d.com/de/sweet-home-3d-benutzerhandbuch/`.
