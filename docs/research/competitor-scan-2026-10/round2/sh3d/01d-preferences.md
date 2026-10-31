# Sweet Home 3D — Preferences dialog: every preference, default value and effect

Round-2 deep dive for **CasaPlazAI** (single-page web 2D/3D floorplanner, plan autosaved to localStorage).
Job folder: `04-01d-feature-inventory-preference`. Research date: 2026-10-31 (started 14:33 CET, finalised ~15:05 CET).
App: **Sweet Home 3D** (GPL-2.0 Java desktop), https://www.sweethome3d.com/de/ · browser edition "Sweet Home 3D JS Online" built from the same core: https://www.sweethome3d.com/SweetHome3DJSOnline.jsp

**Claim tags**
- `OBSERVED` — read directly in shipped JS/resources or a saved evidence file (path/URL given).
- `DOCUMENTED` — stated by vendor documentation (URL given).
- `INFERRED` — my reasoning from observed facts.

**Round-1 reuse (read-only).** Broad inventory: `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/report.md`. Its §2.9 listed the preference *labels* and its "Unknowns" flagged that (a) the live JS edition never finished booting under REA's browser provider, and (b) 7.6.x deltas were unverified. This report does not redo the inventory; it adds the **exact preference keys, types, defaults, persistence, per-preference effect**, and closes the parts of those unknowns that touch Preferences. Round-1 files are symlinked here (read-only) as `evidence/round1-raw`, `evidence/round1-txt`, `evidence/round1-js`.

**Primary new evidence (this job)**
- `evidence/round1-js/sweethome3d.min.js` — the shipped JS-Online core, **v7.5.2**, GPL-2.0 header. All code facts below are static reads of this file (`OBSERVED`). Byte offsets are noted where useful.
- `evidence/round1-raw/jsapp.html` (server shell, contains the preferences dialog template verbatim) and `evidence/round1-raw/jsapp-rendered.html` (headless-Chrome DOM).
- `evidence/round1-raw/localization.json` (EN) and `localization_de.json` (DE) — every `UserPreferencesPanel.*` string.
- `evidence/round1-txt/users-guide.en.txt`, `faq.en.txt`, `history.en.txt`, `shortcuts.txt` (all round-1 captures).
- **New artefact:** `evidence/preferences-inventory.json` — machine-readable table of field defaults, stored property names and unit ladders extracted in this job.

---

## 1. Summary

- Sweet Home 3D keeps preferences in a **flat, typed `UserPreferences` object** whose fields are read by the controllers, not in a generic key/value bag: controllers call `preferences.isMagnetismEnabled()`, `getNewWallThickness()`, etc., and repaint on named property-change events. `OBSERVED` (`sweethome3d.min.js`, base-class ctor at ~2 066 000 and `UserPreferencesController.updateProperties` at ~339 900).
- The class **hard default is metric** (cm, 7.5 cm walls, 250 cm walls high, 12 cm floor slab), but that is *not* what a first-time user sees: `DefaultUserPreferences` branches on the locale. Under **en_US** it selects **inch**, 7.62 cm walls, 243.84 cm height, ~1 cm baseboard, and enables **Aerial view centered on selection** plus a **60 000 ms (1 min) recovery autosave**; under every other locale it selects **centimetre**, 7.5 / 250 / 1 / 7 and keeps the recovery default at 0 (off) — the JS-Online shell then explicitly sets the delay itself. `OBSERVED` (ctor at ~2 084 900).
- The dialog exposes **~20 controls**, but the stored representation is wider and narrower at the same time, and **the browser edition has dead controls**: `newWallBaseboardThickness` / `newWallBaseboardHeight` are persisted and applied to new walls yet have no pane control; `CHECK_UPDATES_ENABLED`, "Reset the display of tips" and the language-library import exist only on the desktop (no-ops in JS); and the *Furniture catalog view* (tree/list) and *Rulers* controls are created then hidden by `&& false` guards, matching `PlanComponent.getHorizontalRuler()` throwing `"No rulers"` — so the JS catalog is always a searchable list and the JS plan has no rulers. `OBSERVED`.
- Several preferences are **pure rendering/painting switches** with precise, readable geometry behind them: the plan grid chooses a 1/2/5/10/… cm minor ladder and a 100/200/… cm major ladder (imperial: inches and feet) so lines never crowd; **magnetism rounds lengths to 0.1/0.5/1/5/10/100 cm (or 1/8…6 inch) and angles to 15° multiples (24 steps per circle)**. `OBSERVED` (`PlanComponent.getGridSize`, `getMainGridSize`, `LengthUnit.getMagnetizedMeterLength`, `PointWithAngleMagnetism.CIRCLE_STEPS_15_DEG = 24`).
- Preferences **persist as JSON** under a stable property-name map, over a pluggable URL: server POST/GET, **`localStorage:`** or **`IndexedDB:`** prefix, with 10 s read timeout and a write queue that retries and debounces. This is the closest analogue to CasaPlazAI's own localStorage autosave. `OBSERVED` (`RecordedUserPreferences.readPreferences` / `writePreferences`, ~2 092 300–2 095 300).

---

## 2. Findings

### 2.1 Where preferences live: data model, names, persistence

| Aspect | Detail | Tag |
|---|---|---|
| Class | `UserPreferences` (abstract base, holds field defaults + getters/setters), `DefaultUserPreferences` (desktop/first-run defaults + catalogs), `RecordedUserPreferences` (property bag loaded from a URL, used by the JS Online/Editor builds) | `OBSERVED` |
| Shape | **One typed field per preference**, not a dictionary. `RecordedUserPreferences` wraps it with a `properties` object and get/set per key. | `OBSERVED` |
| Change notification | `PropertyChangeSupport`; controllers register on named events such as `MAGNETISM_ENABLED`, `GRID_VISIBLE`, `WALL_PATTERN`, `AUTO_SAVE_DELAY_FOR_RECOVERY`, `UNIT`, `LANGUAGE`. Booleans are fired with the **negated** old value (e.g. `firePropertyChange("GRID_VISIBLE", !b, b)`), a Javaland idiom. | `OBSERVED` |
| Where the controller clamps | `UserPreferencesController.updateProperties()` re-clamps `newWallThickness` to `[unit.min, unit.max/10]`, `newWallHeight` to `[unit.min, unit.max]`, `newFloorThickness` to `[unit.min, unit.max/10]` **on every load**. | `OBSERVED` |
| Storage keys | Stable camelCase property names, e.g. `magnetismEnabled`, `newWallThickness`, `newHomeWallHeight` (note: the *stored* name for wall height differs from the field name `newWallHeight`), `recentHomes#1…`, `ignoredActionTip#1…`, `textureName#1…`. Full table in `evidence/preferences-inventory.json`. | `OBSERVED` |
| Storage transports | Read: `localStorage:` prefix, `IndexedDB:` prefix, or `XMLHttpRequest GET <url>?requestId=<uuid>` with a **10 000 ms timeout**; on any failure it falls back to default catalogs. Write: `localStorage.setItem`, IndexedDB blob, or `XMLHttpRequest POST <url>?updateId=<uuid>`; writes are **serialised** (a pending write re-schedules itself after 100 ms) and retried after 10 s on failure. | `OBSERVED` |
| Desktop file locations (for comparison) | Windows `%APPDATA%\eTeks\Sweet Home 3D`, macOS `~/Library/Application Support/eTeks/Sweet Home 3D` (+ `com.eteks.sweethome3d.plist`), Linux `~/.eteks/sweethome3d`; since 3.0 preferences live in an own file "independent from Operating System preferences" and the folders are settable with `com.eteks.sweethome3d.preferencesFolder` / `applicationFolders`. | `DOCUMENTED` (FAQ https://www.sweethome3d.com/faq/) + `OBSERVED` (history 3.0) |
| Language | `getLanguage()` / `setLanguage()`; changing it clears cached resource bundles and **rebuilds the furniture/texture catalogs** in the new language. `isLanguageEditable()` allows an embedder to lock the UI language (the Online shell passes `userLanguage`). Locale detection uses `navigator.language` in JS and `Locale.getDefault()` in Java. | `OBSERVED` |
| Recent/aux state also in preferences | `recentHomes` (max **10**, `getRecentHomesMaxCount`), `storedCameras` (max **50**, `getStoredCamerasMaxCount`), `ignoredActionTips`, `autoCompletionStrings`, `recentColors`, `recentTextures`, `homeExamples`. | `OBSERVED` |

### 2.2 The two default sets (this is the crux)

`OBSERVED` — `UserPreferences` base constructor field initialisers (~2 066 000) and `DefaultUserPreferences` constructor (~2 084 900). Note the *conflict* between the two: the base class initialisers look metric, but `DefaultUserPreferences` overwrites unit + wall values by locale.

| Preference (field) | Base field default | `DefaultUserPreferences` when locale = `en_US` | `DefaultUserPreferences` otherwise | One-line effect |
|---|---|---|---|---|
| `unit` (`getLengthUnit`) | `null` | `INCH` (Foot/Inch/Fraction) | `CENTIMETER` | All showing/parsing of lengths; grid ladder; spinner format/step |
| `newWallThickness` | 7.5 | 7.62 | 7.5 | Thickness of every newly drawn wall (= 3 inch under en_US) |
| `newWallHeight` | 250 | 243.84 | 250 | Height of every newly drawn wall (= 8 ft under en_US) |
| `newWallBaseboardThickness` | 1 | 0.9525 | 1 | Baseboard thickness for new walls (**no pane control**) |
| `newWallBaseboardHeight` | 7 | 6.35 | 7 | Baseboard height for new walls (**no pane control**) |
| `newFloorThickness` | 12 | 12 | 12 | Floor slab of every newly created level |
| `wallPattern` | `null` | `hatchUp` | `hatchUp` | Pattern for plan walls without an explicit pattern |
| `newWallPattern` | `null` | = `wallPattern` | = `wallPattern` | Pattern pre-selected for **new** walls |
| `navigationPanelVisible` | `true` (base) then set `false` by the desktop ctor | `false` | `false` | 3D navigation arrows shown in the 3D view |
| `aerialViewCenteredOnSelectionEnabled` | `false` then set `true` | `true` | `true` | Aerial-view orbit centre follows the selection |
| `autoSaveDelayForRecovery` | `0` then set `60000` | 60000 | 60000 | Auto-recovery interval (ms) |
| `magnetismEnabled` | `true` | `true` | `true` | All snapping (walls, rooms, furniture, dimensions) |
| `rulersVisible` | `true` | `true` | `true` | Plan rulers (no-op in JS) |
| `gridVisible` | `true` | `true` | `true` | Plan grid |
| `furnitureViewedFromTop` | `true` | `true` | `true` | Plan furniture drawn as top view vs catalog icon |
| `furnitureModelIconSize` | 128 | 128 | 128 | Pixel size of generated top-view icons |
| `roomFloorColoredOrTextured` | `true` | `true` | `true` | Room floor painted colour/texture vs monochrome |
| `observerCameraSelectedAtChange` | `true` | `true` | `true` | Select the virtual visitor in the plan on each 3D move |
| `editingIn3DViewEnabled` | `false` | `false` | `false` | Select/move/rotate in the 3D view (7.2+) |
| `furnitureCatalogViewedInTree` | `false` | `false` | `false` | Catalog as category folders (tree) vs searchable list |
| `currency` | `null` | `null` | `null` | Currency code; `null` ⇒ prices ignored |
| `valueAddedTaxEnabled` | `false` | `false` | `false` | Use VAT on prices |
| `defaultValueAddedTaxPercentage` | `null` | `null` | `null` | VAT % seeded into an item's VAT field (**no pane control**) |
| `defaultFontName` | `null` | `null` | `null` | Default font for plan texts/dimensions (`null` = system default) |
| `newRoomFloorColor` | `null` | `null` | `null` | Floor colour of new rooms; the Online shell overrides it to `0xFF9999A0` |
| `checkUpdatesEnabled` | `false` | `false` | `false` | Update check at launch (**desktop pane only**, no-op in JS) |

**`DOCUMENTED` cross-check.** The user guide tells the beginner to open Preferences first "to check the default unit, the default thickness and height of walls, and other preferences" (EN guide line 93, DE line 93) — i.e. the vendor itself regards the *new-wall* values as the primary preferences. The 4.0 history note says "Set **Top view** and **Floor color or texture** as the options at first launch for Furniture icons in plan and Room rendering in plan user preferences under Windows and Mac OS X", and "Under other systems" implies a different default there — consistent with the tree/list and top-view differences; my JS snapshot only gives one platform's defaults. `OBSERVED` (history) + `INFERRED` (platform variance).

### 2.3 Complete control-by-control inventory of the dialog

The dialog is built from a single template `#user-preferences-dialog-template` with a two-column `label-input-grid`. The **JS build** (browser edition) creates exactly these controls `OBSERVED` (`JSViewFactory.createUserPreferencesView`, ~2 471 700–2 489 200); the **desktop** pane adds a few more `OBSERVED` (localization keys exist, JS-Online template omits them).

| # | Label (EN) | Label (DE) | Control | Stored key | Default | Committed when |
|---|---|---|---|---|---|---|
| 1 | Language: | Sprache: | `<select name="language-select">` | `language` | locale-derived | Apply |
| 2 | Unit: | Maßeinheit: | `<select name="unit-select">` — Millimeter, Centimeter, Meter, Foot/Inch/Fraction, Inch/Fraction, Inch/Decimals, Foot/Decimals | `unit` | cm (inch under en_US) | Apply |
| 3 | Currency: | Währung: | `<select name="currency-select">` — "Ignore prices" + **156 ISO codes** with symbol strings (AED…ZWL, EUR, USD, GBP, …) | `currency` | null (ignore) | Apply |
| 4 | Use VAT | Umsatzsteuer benutzen | `<input type="checkbox" name="value-added-tax-checkbox">` — **disabled while currency = Ignore prices** | `valueAddedTaxEnabled` | false | Apply |
| 5 | Furniture catalog view: | Mobiliarkatalogansicht: | radio `tree` (Category folders / Katalogordner) · `list` (Searchable list / Durchsuchbare Liste) | `furnitureCatalogViewedInTree` | list (`false`) | Apply — **hidden in the JS build (`&& false` guard)** |
| 6 | 3D navigation arrows: | 3D-Navigationspfeile: | checkbox `navigation-panel-checkbox` (Visible / Sichtbar) | `navigationPanelVisible` | false in Default ctor | Apply |
| 7 | Selection and editing in 3D view: | Auswahl und Bearbeitung in 3D-Ansicht: | checkbox `editing-in-3D-view-checkbox` | `editingIn3DViewEnabled` | false | Apply |
| 8 | Aerial view centered on selection: | Luftansicht auf Auswahl zentrieren: | checkbox `aerial-view-centered-on-selection-checkbox` | `aerialViewCenteredOnSelectionEnabled` | true | Apply |
| 9 | Select visitor in plan at 3D move: | Besucher im Plan auswählen bei 3D-Bewegung: | checkbox `observer-camera-selected-at-change-checkbox` | `observerCameraSelectedAtChange` | true | Apply |
| 10 | Magnetism: | Magnetismus: | checkbox `magnetism-checkbox` (Enabled / Aktiv) | `magnetismEnabled` | true | Apply |
| 11 | Rulers: | Lineal: | checkbox `rulers-checkbox` (Visible / Sichtbar) | `rulersVisible` | true | Apply — **hidden in the JS build (`&& false` guard)** |
| 12 | Grid: | Gitter: | checkbox `grid-checkbox` (Visible / Sichtbar) | `gridVisible` | true | Apply |
| 13 | Default font: | Standardschriftart: | `<select name="default-font-name-select">` — first entry **"System default"** (`FontNameComboBox.systemFontName`), then every font reported by the browser/`loadAvailableFontNames` | `defaultFontName` | null = system | Apply |
| 14 | Furniture icons in plan: | Möbeldarstellung im Plan: | radio `catalog` (Catalog icons / Mobiliarbilder) · `topView` (Top view / Draufsicht) **+ "Icon size:" `<select name="icon-size-select">` — 128×128, 256×256, 512×512, 1024×1024** (size select is disabled unless Top view is chosen) | `furnitureViewedFromTop`, `furnitureModelIconSize` | topView (true), 128 | Apply |
| 15 | Room rendering in plan: | Rendering des Raums im Plan: | radio `monochrome` (Monochrome / Schwarz-Weiß) · `floorColorOrTexture` (Floor color or texture / Bodenfarbe/-textur) | `roomFloorColoredOrTextured` | floorColorOrTexture | Apply |
| 16 | New walls pattern in plan: | Neues Wandmuster im Plan: | custom pattern combo (`new-wall-pattern-select`) over the **8 built-in patterns** (foreground, reversedHatchUp, reversedHatchDown, reversedCrossHatch, background, hatchUp, hatchDown, crossHatch; thumbnail = pattern PNG as background image) | `newWallPattern` | hatchUp | Apply |
| 17 | New walls thickness: | Standarddicke für Wände: | `JSSpinner` `new-wall-thickness-input`, base min 0 / max 100000, step = unit step | `newWallThickness` | 7.5 cm / 7.62 cm | Apply |
| 18 | New walls height: | Standardhöhe für Wände: | `JSSpinner` `new-wall-height-input` | `newWallHeight` | 250 / 243.84 | Apply |
| 19 | New levels floor thickness: | Standarddicke für Böden: | `JSSpinner` `new-floor-thickness-input` | `newFloorThickness` | 12 | Apply |
| D1 | Check updates at program launch | Bei Programmstart nach Updates suchen | checkbox `checkUpdatesCheckBox` | `checkUpdatesEnabled` | false | Apply — **desktop only** (JS base class makes the setter a no-op) |
| D2 | Check now | Jetzt prüfen | button `CHECK_UPDATES_NOW` | — | — | click — **desktop only** |
| D3 | Reset the display of tips | Anzeige der Tipps zurücksetzen | button `RESET_DISPLAYED_ACTION_TIPS` | clears `ignoredActionTips` | — | click — **desktop only** |
| D4 | (icon) Import language library file | Sprachbibliotheksdatei importieren | button `IMPORT_LANGUAGE_LIBRARY` | installs `.sh3l` | — | click — **desktop only** |
| — | Wall pattern in plan: | Wandmuster im Plan: | label exists (`wallPatternLabel.text`) — the pane sets `wallPattern` **indirectly**: editing it also updates the current `newWallPattern`; there is no separate control in the JS template | `wallPattern` | hatchUp | — |

`OBSERVED` from `localization.json` / `localization_de.json`, `jsapp.html`, and `sweethome3d.min.js`. Note the German label quirks: `newWallPatternLabel` = "Neues Wandmuster im Plan" while `wallPatternLabel` = "Wandmuster im Plan"; `furnitureIconLabel` = "Möbeldarstellung im Plan"; the German mnemonics differ from English (e.g. language `S` vs `G`).

**Dialog chrome:** the label column carries single-letter mnemonics; controls follow a shared grid; the JS dialog is a `JSDialog` with **Apply/Cancel-style commit via an applier** — in `createUserPreferencesView` the applier reads every control (guarded by `isPropertyEditable` and by visibility) and calls `u.modifyUserPreferences()`. `OBSERVED`.

### 2.4 Per-preference effect in the code (what actually changes)

| Preference | Observed effect | Tag |
|---|---|---|
| `unit` | `PlanComponent.getGridSize`/`getMainGridSize` pick the metric or imperial ladder (below); every spinner gets `setFormat(unit.getFormat())` and `setStepSize` (metric: unit step, height step = 20× cm step; imperial: inch step, height step = 16× inch step); `LengthUnit.getMinimumLength` becomes the spinner minimum and can raise the value. Changing it re-clamps the three new-object lengths. | `OBSERVED` |
| `magnetismEnabled` | Gates `HomeController.adjustFurnitureSizeAndElevation`, `PlanController.adjustMagnetizedPieceOfFurniture`, `WallPointWithAngleMagnetism`, `RoomPointWithAngleMagnetism` and dimension-line angle magnetism; also decides whether dropping a piece snapped to the top of another also switches the selected level. A toolbar button toggles it (7.0) and **Alt/cmd (Shift+Alt on Linux) temporarily inverts it** while dragging or rotating. | `OBSERVED` + `DOCUMENTED` (guide line 130, shortcuts line 115) |
| `rulersVisible` | Registers as a preference listener on `PlanComponent`, but the component's `getHorizontalRuler`/`getVerticalRuler` **throw `UnsupportedOperationException("No rulers")`**; the control is hidden with an `&& false` guard. Effect: none in the JS edition; desktop-only in practice. | `OBSERVED` |
| `gridVisible` | `paintContent` calls `paintGrid` only `if (this.preferences.isGridVisible())`; it also controls the alpha of "other level" room areas and walls (**0.2 when the grid is visible, 0.1 when it is not**), i.e. only called inside the `backgroundPainted` PaintMode.PAINT branch. | `OBSERVED` |
| `furnitureViewedFromTop` | In `paintPieceOfFurniture`: if true and the piece has a plan icon (or is a door/window) draw the top view, else fall back to the catalogue icon; if false always draw the catalogue icon; default true. | `OBSERVED` |
| `furnitureModelIconSize` | Passed to `PlanComponent.PieceOfFurnitureModelIcon` to rasterise the top-view icon; options are 128/256/512/1024 px; only relevant when Top view is on. | `OBSERVED` |
| `roomFloorColoredOrTextured` | Plan room fill switches between floor colour/texture and a fixed monochrome fill. A related `PlanComponent.UserPreferencesChangeListener` invalidates the caches on change. | `OBSERVED` |
| `wallPattern` / `newWallPattern` | Walls store `pattern` nullable; when null the renderer substitutes `preferences.getWallPattern()` (and `getNewWallPattern()` for the current drawing), so changing either repaints all default-pattern walls (`WALL_PATTERN` listener clears `wallAreasCache`). New walls get the pattern passed into `new Wall(..., getNewWallPattern())`. | `OBSERVED` |
| `newWallThickness` / `newWallHeight` | `PlanController.createWall` constructs `new Wall(x1,y1,x2,y2, prefs.getNewWallThickness(), prefs.getNewWallHeight(), prefs.getNewWallPattern())`; `new Home(prefs.getNewWallHeight())` for a fresh home; `createLevel` uses `getNewFloorThickness()` and `getNewWallHeight()`. | `OBSERVED` |
| `newFloorThickness` | Passed to every newly created level; also the max for the level-pane floor-thickness spinner is `unit.max/10`. | `OBSERVED` |
| `aerialViewCenteredOnSelectionEnabled` | Read by `HomeController3D`'s aerial-view state to choose the orbit centre (`updateAerialViewBounds…`), and pushed into the top-camera state via the user-preferences listener. `DOCUMENTED` context: FAQ says by default the aerial rotation centres on the home bounding-box and this option moves the centre to the selection. | `OBSERVED` + `DOCUMENTED` (FAQ) |
| `observerCameraSelectedAtChange` | `HomeController3D.selectCamera()` selects the observer only if the preference is true (and, from 7.2, not while editing is enabled with a non-empty selection), which is what draws/selects the visitor in the plan. | `OBSERVED` |
| `editingIn3DViewEnabled` | Enables plan-controller Copy/Cut/Delete actions while the 3D view has focus and enables 3D selection/move/rotate; also part of the `selectCamera` condition. | `OBSERVED` |
| `navigationPanelVisible` | Shows/hides the 3D navigation arrows overlay (`navigationPanel`). | `OBSERVED` |
| `defaultFontName` | Used by `PlanComponent` text/dimension painting (`if fontName == null use preferences.getDefaultFontName()`, fallback `sans-serif`) and as the initial `fontName` of a new `LabelController`; changing it clears font caches and revalidates. History 7.3 fixed "the font of dimensions in the 3D view to the one set in preferences". | `OBSERVED` |
| `currency` + `valueAddedTaxEnabled` | `setCurrency(null)` forces `valueAddedTaxEnabled = false`; the VAT checkbox is disabled while the currency is "Ignore prices". `HomeFurnitureController` writes `preferences.setDefaultValueAddedTaxPercentage(...)` back when the user edits a VAT %; when a single item's price is set and its VAT % is null, the stored default is seeded in. | `OBSERVED` |
| `autoSaveDelayForRecovery` | `AutoRecoveryManager` reads it (ms); `> 0` starts a `setInterval` that writes unsaved homes to the auto-recovery recorder (skipping if the last save was < 5 s ago); `0` disables; a property-change listener on `AUTO_SAVE_DELAY_FOR_RECOVERY` restarts the timer. | `OBSERVED` |
| `furnitureCatalogViewedInTree` | The catalog controller registers a `FurnitureCatalogViewChangeListener` when the preference is provided, switching between category tree and searchable list. Default `false` = searchable list. | `OBSERVED` |
| `language` | Reloads all resource bundles and — via a `LANGUAGE` listener — `updateDefaultCatalogs()` (deletes non-modifiable entries and re-adds the localised defaults); also forces JDK locale for number formatting. | `OBSERVED` |
| `checkUpdatesEnabled` | Desktop-only: the base JS class implements `is/setCheckUpdatesEnabled` as empty functions, so the Online build can never persist it. | `OBSERVED` |

### 2.5 The unit system in detail (drives the unit preference)

`OBSERVED` (`LengthUnit.*` in the bundle). Internal unit is **centimetres**. `getMinimumLength` / `getMaximumLength` / `getStepSize` / `getMaximumElevation` are the values the pane clamps to and the spinners step by.

| Unit (enum) | UI label (EN / DE) | Metric? | min length | max length | max elevation | step | Format |
|---|---|---|---|---|---|---|---|
| `MILLIMETER` | Millimeter / Millimeter | yes | 0.1 cm | 100000 cm | 10000 cm | 0.5 cm | `0` mm |
| `CENTIMETER` | Centimeter / Zentimeter | yes | 0.1 | 100000 | 10000 | 0.5 | `0.#` cm |
| `METER` | Meter | yes | 0.1 | 100000 | 10000 | 0.5 | `0.00#` m |
| `INCH` | Foot/Inch/Fraction / Fuß/Zoll/Bruchteil | no | 0.125 in = 0.3175 cm | 3280 ft ≈ 99974.4 cm | ≈9997.44 cm | 0.125 in | inches + nearest 1/8 fraction |
| `INCH_FRACTION` | Inch/Fraction / Zoll/Bruchteil | no | 0.3175 | 99974.4 | 9997.44 | 0.3175 | same, always fraction |
| `INCH_DECIMALS` | Inch/Decimals / Zoll/Dezimalzahlen | no | 0.3175 | 99974.4 | 9997.44 | 0.3175 | `0.###` inches |
| `FOOT_DECIMALS` | Foot/Decimals / Fuß/Dezimalzahlen | no | 0.3175 | 99974.4 | 9997.44 | 0.3175 | `0.###` feet |

Separate **area** formats accompany each family (`m²`, `ft²`/`sq ft`). `UNITS_LOCALIZATION` renames units per language (e.g. de `inch`/`ft`/`ft²`; fr `pouce`/`pied`; sv `tum`; ru `дюйм`; zh_CN `英寸`). Millimetre/centimetre/metre all share the meter-family magnetisation.

**Magnetised length algorithm** (`getMagnetizedMeterLength` / `getMagnetizedInchLength`), `OBSERVED`:
- take a pixel-size argument `a`, double it, then choose a rounding bucket `b`: metric → 0.1 / 0.5 / 1 / 5 / 10 / 100 cm for progressively larger pixel sizes (>100 px ⇒ 100 cm, >10 ⇒ 10, >5 ⇒ 5, >1 ⇒ 1, >0.5 ⇒ 0.5, else 0.1); imperial → 1/8, 1/4, 1/2, 1, 3, 6 inch for >6 / >3 / >1 / >0.5 / >0.25.
- round to the nearest multiple of `b`; **if the result is 0 but the input was > 0, keep the input** (so objects never collapse to zero).
- Angle magnetism is separate: `CIRCLE_STEPS_15_DEG = 24` ⇒ 15° multiples, applied by `PointWithAngleMagnetism` (also snapping to walls/room points within the selection margin).

### 2.6 Plan grid and rulers

`OBSERVED` (`PlanComponent.getGridSize` / `getMainGridSize`, `paintGridLines`):
- Minor grid candidates (metric, cm): **1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000**; major: **100, 200, 500, 1000, 2000, 5000, 10000**. Imperial is expressed in cm but built from inches: minor 1,2,3,6 in then 1,3,6,12,24,48,96,192,384 ft; major 1,3,6,12,24,48,96,192,384 ft.
- The chosen size is the first candidate whose on-screen size clears a threshold — **10 px for minor lines, 50 px for major lines** — and the unit preference chooses which ladder is used.
- Minor lines are drawn at stroke width `0.5/scale`, major at `1.5/scale`; if the two coincide the major pass is skipped.
- **Rulers**: requested via `getHorizontalRuler()`/`getVerticalRuler()` on the plan, but the JS `PlanComponent` throws `UnsupportedOperationException("No rulers")`, and the ruler painting code switches on `LANGUAGE` / `UNIT` to repaint them. So *Rulers: Visible* is a desktop-only preference in practice.

### 2.7 Persistence mechanics in detail (the closest analogue to CasaPlazAI)

`OBSERVED` (`RecordedUserPreferences`, ~2 086 000–2 095 500):

1. **Read.** If `readPreferencesUrl` starts with a `localStorage:` prefix → `localStorage.getItem(name)`; if `IndexedDB:` → `IndexedDBURLContent.getBlob` + `FileReader.readAsText`; otherwise XHR GET `<url>?requestId=<uuid>`. JSON is parsed and merged over an in-memory `properties` object, then `updatePreferencesFromProperties(properties, language, true)` runs; any failure falls back to `updateDefaultCatalogs()` and still adds listeners.
2. **Defaults during merge.** Each field is read with a string default taken from a fresh `DefaultUserPreferences(false, locale)` — e.g. `magnetismEnabled` defaults to the literal `"true"`, grid/rulers to the default object's booleans, lengths parsed with `parseFloat`/`parseInt`.
3. **Write.** `write()` serialises only **changed** properties (`writtenPropertiesUpdated` flag) — a dirty-flag debounce. Property names written include the full `USER_PREFERENCES` map, `recentHomes#1..10`, and `ignoredActionTip#n`. `writePreferences()` then JSON-stringifies and writes via localStorage / IndexedDB blob / XHR POST `?updateId=<uuid>`, guarded by a `writingPreferences` flag so at most one write is in flight (a new write waits 100 ms); success clears the flag after 500 ms, failure retries after 10 s. Texture blobs (`textureImage#n`) that are still uploading delay the write by 1 s.
4. **Language split.** `RecordedUserPreferences` takes `defaultUserLanguage` from the server config, falling back to the current language; the JS-Online shell sets `applicationParams.userLanguage = "en"` (with `pt` → `pt_BR`).

### 2.8 Version history of the Preferences pane

`OBSERVED` (`history.en.txt`) and `DOCUMENTED` (vendor URLs). Timeline of *preference-relevant* entries only:

| Version | Change |
|---|---|
| 0.14 | Rulers added, "may be rendered invisible by editing preferences" (the first preference) |
| 1.1 | Grid visibility checkbox; UI-language selection moved into preferences |
| 1.7 | Fixed a bug that reset default wall height/thickness when the unit changed |
| 2.0 | New plan-rendering preferences: furniture from top, room floor colour/texture, wall pattern; **units Meter and Millimeter** added |
| 2.3 | **Category folders / Searchable list** catalog options; 3D-navigation-arrows option; SH3L language plug-ins |
| 3.0 | Autosave for crash recovery at regular intervals; preferences saved to a file independent of the OS |
| 3.4 | **New floors thickness** field; **button to import language libraries**; stronger drawing magnetism |
| 4.0 | `Wall pattern` replaced by `New walls pattern` + 3 new patterns; **Inch/Decimals** unit; `Inch` renamed Foot/Inch/Fraction; **Check updates at program launch** + Check-now button; **Aerial view centered on selection**; first-launch defaults set to Top view + Floor color or texture; Shift keeps axis-aligned moves and the magnetism-toggle key became Alt/cmd |
| 5.0 | **Default font** option |
| 5.5 | **Furniture icon size in pixels**; **Select visitor in plan at 3D move**; Ctrl+M (Win/Linux) opens preferences |
| 6.0 | Price management: currency choice + optional sales tax in the pane; Price/VAT% fields; totals |
| 7.0 | **Toolbar magnetism toggle**; **Inch/Fraction** and **Foot/Decimals** units |
| 7.2 | **Selection and editing in 3D view** option; (JS Online gains the same dialogs incl. preferences) |
| 7.3 | Fixed dimension font in 3D to the one set in preferences |

Also `OBSERVED`: v1.1 of the pane shipped grid visibility; the shortcut list (`shortcuts.txt`) documents **`cmd ,` / `Ctrl M`** to open Preferences and **Alt while dragging** to toggle the preference-set magnetism.

### 2.9 The browser edition: what is actually different

`OBSERVED` (template `#user-preferences-dialog-template` in `jsapp.html` / `jsapp-rendered.html` vs `JSViewFactory.createUserPreferencesView`):

- The template contains **all 19 numbered controls** (including the tree/list radios and the rulers checkbox) but the JS view function:
  - guards the catalog-view radio with `if (u.isPropertyEditable("FURNITURE_CATALOG_VIEWED_IN_TREE") && false)` → always hides it,
  - guards the rulers checkbox with `if (u.isPropertyEditable("RULERS_VISIBLE") && false)` → always hides it,
  - omits the desktop-only check-updates row, the Check-now button, the tips-reset button and the language-library import,
  - appends uses `Intl.DisplayNames` for language names with a hard-coded fallback map (19 languages: bg, cs, de, el, en, es, fr, it, ja, hu, nl, pl, pt, pt-BR, ru, sv, vi, zh-CN, zh-TW),
  - builds the currency list as 156 ISO currency codes with symbol strings,
  - builds the unit list from the enum order MILLIMETER, CENTIMETER, METER, INCH, INCH_FRACTION, INCH_DECIMALS, FOOT_DECIMALS,
  - appends icon sizes 128/256/512/1024 and disables the size select unless Top view is checked.
- Accessibility/structural note: the dialog is plain HTML with `<label>`-wrapped inputs, no `aria-*`; labels come from `localization.json` via `@{…}` placeholders.
- Storage in the Online build: the JSP sets `applicationParams` with catalog URLs / resource bases / `userLanguage` only; it does **not** set `readPreferencesURL`/`writePreferencesURL` in the captured shell, and the app constructs `RecordedUserPreferences(this.configuration)`; when `readPreferencesURL` is absent it runs `updatePreferencesFromProperties(properties, language, true)` and `addListeners()` **without reading** — i.e. in the plain public Online page preferences are session-local unless a deployer configures a store. The shell also calls `preferences.setNewRoomFloorColor(0xFF9999A0)` after a home loads. `OBSERVED` + `INFERRED`.

### 2.10 Desktop-only API surface worth knowing

`OBSERVED`: `UserPreferences` also exposes `isImportedImageResizedWithoutPrompting()` (returns `true`), `getStoredCamerasMaxCount()` (50), `getRecentHomesMaxCount()` (10), `getDefaultTextStyle(owner)` (18 px normal text, 24 px room text), `addAutoCompletionString`/`getAutoCompletionStrings` (free-text suggestions saved in preferences), `getRecentColors()`, `getRecentTextures()`, `getHomeExamples()`, `getProperties()`, `isLanguageEditable()`, and the library-management calls (`addFurnitureLibrary`, `addTexturesLibrary`, `addLanguageLibrary`, `languageLibraryExists`, `furnitureLibraryExists`, `getLibraries`) which **throw `UnsupportedOperationException`** in `RecordedUserPreferences` — i.e. the JS edition cannot install libraries from the pane.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort for a single-page, localStorage-only 2D/3D floorplanner. "Finding" points at a §2 sub-section; where the CasaPlazAI schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`) has a matching field, it is named. Nothing here copies code; all are behaviour/data-model descriptions.

| # | Idea | Finding | Schema link | Value | Effort |
|---|---|---|---|---|---|
| 1 | **Ship the same "preference → typed field → change event" shape.** One typed field per preference with a getter, a setter that fires a named change event, and subscribers that repaint only what they own. CasaPlazAI already keeps snap settings out of `FloorplanData` under `casaplaza.snap.settings.v1` — extend that pattern into a `casaplaza.prefs.v1` object whose keys mirror the editor's real switches. Avoids a generic bag and makes "which UI updates when a pref changes" explicit. | §2.1 | out-of-schema editor state (like the existing snap key) | High | Low |
| 2 | **Two default sets, locale-aware — and make them visible on first run.** SH3D does not show the raw field defaults: its constructor picks an **en_US set (inch, 7.62 / 243.84, baseboard ≈1)** vs a **metric set (cm, 7.5 / 250)**. CasaPlazAI is meters-only by schema, but should still pick sensible first-run *values* and expose them (its `wallHeight`/`wallThickness` are currently global defaults, not preferences). | §2.2 | `wallHeight`, `wallThickness` (top-level) | High | Low |
| 3 | **Expose the new-object defaults separately from the schema globals.** SH3D's most-used preferences are exactly "what a *newly created* object gets": `newWallThickness`, `newWallHeight`, `newWallPattern`, `newFloorThickness`. Give CasaPlazAI a Preferences section "New walls / New rooms / New furniture", defaulting from the current plan, and have the wall tool read it at creation time. | §2.2, §2.4 | `wallThickness`, `wallHeight`, `opening.width/headHeight/sillHeight` | High | Low |
| 4 | **Make magnetism an explicit, round-trippable switch with modifier override.** Store `magnetismEnabled` (default true) plus the grid pitch; apply it to wall/room/furniture/dimension drawing; let **Alt** temporarily invert it while dragging or rotating, and round lengths to a coarse bucket when the pointer moves fast / zoom is small (SH3D uses 0.1→100 cm as the pixel footprint grows). CasaPlazAI already has 0.5 m grid snapping — this is the "why and when" around it. | §2.4, §2.5 | `casaplaza.snap.settings.v1` | High | Low |
| 5 | **Make the plan grid a two-level ladder, not a single pitch.** Minor lines at 1/2/5/10/20/50 cm …, major every 10× that, chosen so minor ≥ ~10 px and major ≥ ~50 px at the current zoom, with different stroke weights. Even at a fixed 0.5 m snap, the *drawn* grid can be finer/coarser than the snap; CasaPlazAI can mirror SH3D's "grid stays readable at any zoom". | §2.6 | — (rendering) | High | Low |
| 6 | **Persist the whole preference set as JSON with a dirty flag and a single in-flight write.** SH3D serialises only changed properties (debounce), queues writes so at most one is in flight, retries on failure, and reads back with a 10 s timeout then falls back to defaults. That is a ready recipe for CasaPlazAI's localStorage autosave, and it survives future migration to a backend by swapping the URL. | §2.7 | `FloorplanData.schemaVersion` + `migrate()`; prefs under `casaplaza.prefs.v1` | High | Medium |
| 7 | **Add `wallPattern`-style "pattern/appearance default" only when the 2D renderer needs it.** SH3D stores a nullable per-wall `pattern` and substitutes the preference when null, so changing the pref retroactively repaints all default walls (and invalidates the wall-area cache). If CasaPlazAI later gains wall hatching, the null-means-default indirection is what makes a global pref cheap. | §2.4 (`wallPattern`) | `Room.wallsOverride` is analogous (per-segment override of a global) | Medium | Medium |
| 8 | **Unit preference: offer the same seven formats, but keep the schema meters.** SH3D's seven units (mm, cm, m, ft/in/fraction, in/fraction, in/decimals, ft/decimals) all convert to a centimetre core at the boundary; the schema stays meters. CasaPlazAI can add display-only units with a conversion function and per-unit **min / max / step** clamps (SH3D's imperial step is 1/8 inch). Ship "meters" + "cm" + "mm" first; imperial formats are a nice-to-have. | §2.5 | `units: "meters"` (keep); display layer only | Medium | Low |
| 9 | **Copy the "Show/hide" trio plus debounced autosave into a small Preferences card in the new tool-card UI.** Grid, rulers, 3D navigation arrows — three checkboxes with immediate effect and no Apply button is the SH3D-shaped answer; CasaPlazAI's single-workspace redesign can put them in the inspector rather than a modal. | §2.2, §2.4 | — | Medium | Low |
| 10 | **Add "Aerial view centered on selection" and "Select visitor in plan at 3D move" as two independent 3D preferences.** Both default *on* and are cheap: the first moves the orbit centre to the selection (SH3D's FAQ explains the default centres on the home bounding box), the second decides whether the walk-mode figure is drawn/selected in plan. CasaPlazAI has Plan/3D/Walk modes — these map directly onto 3D/Walk. | §2.4 | — | Medium | Low |
| 11 | **A "Default font" style preference for labels and dimensions.** One nullable font name (null = system) used by every new text and dimension, with a cache invalidation on change (SH3D clears font caches and revalidates). CasaPlazAI's measurement/annotation layer stores its own key already; add the font there. | §2.4 | measurement annotations key | Low | Low |
| 12 | **"Furniture icons in plan": top view vs icon, with 4 discrete icon sizes.** SH3D stores a boolean plus a pixel size (128/256/512/1024) and only enables the size select when "Top view" is chosen — a neat pattern for progressive disclosure. With CasaPlazAI's small palette this is mostly a polish item. | §2.3 (#14), §2.4 | — | Low | Medium |
| 13 | **If/when prices appear: currency + optional VAT, with `currency = null` meaning "ignore prices".** SH3D disables the VAT checkbox while the currency is ignored and seeds `defaultValueAddedTaxPercentage` into an item when its price is first edited. CasaPlazAI's schema has no price field, so this is future work. | §2.4 | not in schema v1 | Low | Medium |
| 14 | **Crash-recovery interval as an explicit preference.** SH3D defaults to 1 min when enabled (its own constructor writes 60 000 ms), 0 disables, `AutoRecoveryManager` skips saves within 5 s of the last one, and the timer is restarted on change. CasaPlazAI autosaves the plan to localStorage anyway — surfacing the interval (and a "recovered your last plan" banner, which SH3D has: `confirmRecoverHome`) is cheap trust-building. | §2.4, §2.7 | localStorage persistence | Medium | Low |

**Cross-cutting `INFERRED` takeaway.** SH3D's pane is small but its *preference object* is large and entirely typed, with a clean split: (a) hard defaults in the base class, (b) locale/platform defaults chosen in `DefaultUserPreferences`, (c) a stored property-name map for round-tripping. The only places it leaks are the hidden/dead controls (tree/list and rulers in the browser; baseboard and default-VAT values stored but unexposed). CasaPlazAI can take the good half — typed fields, change events, locale defaults, debounced single-write persistence — and avoid the leak by generating the pane from the preference schema so no stored preference is unreachable.

---

## 4. Unknowns

- **7.6.x deltas remain unverified for Preferences.** Round 1 found `SweetHome3D-7.6.1` on SourceForge (2026-10-20) with no matching history entry; I re-confirmed that the *shipped JS* still says `getVersion() = "7.5.2"` (~2 611 400), that the official history page ends at 7.5.2, and that the SourceForge tree's `tags` folder is at `r9030 Released version 7.5.2` while `trunk` last changed 2024-12-19. `evidence/round1-raw/README-761.txt` is the download-page HTML, not the release notes (my grep for "preference" only matched a Google link), so **I could not confirm any new preference in 7.6.1**. `OBSERVED` + gap.
- **I did not obtain the Java source** to cross-check the desktop pane. SourceForge's code browser returns 404s for direct raw/tree paths (`/p/sweethome3d/code/HEAD/tree/trunk/src/...` and `?format=raw`), GitHub has no `eteks/sweethome3d` repo at the URL I tried, and the vendor ships only the minified JS. My desktop-pane statements come from the shipped `localization.json` keys and the JS class structure, which is a faithful port but not proof of the Swing layout.
- **I could not interactively exercise the browser edition's Preferences dialog.** REA's `capture-browser-scenario` (round 1) timed out twice on the Online app, and `rea doctor` reports the environment unhealthy (Node 22.23.2 below the required 22.23.4) before any browser provider is used; my attempt at `--schema` returned only the envelope (`inputJson`) with no documented `evaluate` action, and I could not confirm a software-GL launch-argument field. So every JS-edition fact here is a **static** read of `sweethome3d.min.js`, `jsapp.html` and the round-1 DOM dump, not a live session. In particular I could not verify the *rendered* preferences dialog's control order, the disabled states at runtime, or that the Apply button writes where I predict.
- **Screenshots are unusable by me** (no image input), so I did not analyse any captured PNG.
- **Exact pixel thresholds** in the grid ladder ("minor ≥ 10 px", "major ≥ 50 px") are read from the JS `while` conditions (`a*c<10`, `c*b<50`) where `c`/`b` is the model-length-per-pixel scale; I am confident of the comparison but have not measured against a live canvas, so the *observed* threshold in device pixels could differ with DPR.
- **Platform-specific first-launch defaults.** History 4.0 says Top view + Floor color or texture were set "under Windows and Mac OS X" for Furniture icons/Room rendering, implying a different default (Catalog icons / Monochrome) elsewhere; my JS snapshot shows `furnitureViewedFromTop = true`, `roomFloorColoredOrTextured = true`, which matches Windows/macOS. The Linux/Solaris first-run values are unverified. `INFERRED`.
- **Whether the toolbar shows a magnetism toggle button** in the browser edition is unverified: the action names `ENABLE_MAGNETISM` / `DISABLE_MAGNETISM` and the `TOGGLE_MAGNETISM_ON/OFF` input map exist and history 7.0 documents the button, but the Online DOM dump (round 1) does not include an id for it, and I could not run the app.
- **`newRoomFloorColor`** is set by the Online shell to `0xFF9999A0` after loading a home and exists as a preference field, but I found **no pane control** for it; whether newer desktop versions expose it is unverified.
- **The `Intl.DisplayNames` language-name path** in the JS pane depends on the browser; the fallback map is hard-coded, so on an older browser the dropdown may show raw codes. Cosmetic, unverified live.
- **Legal.** Sweet Home 3D is GPL-2.0 and the JS bundle carries the GPL header; **no source code was copied into this deliverable**. Everything above is behaviour, data-model and UI-string description. The extracted `localization*.json` files are round-1 evidence retained for UI-string facts only; 3D House Planner and CasaPlazAI are proprietary and nothing was taken from them.

---

### Evidence index (files in this job folder)

- `report.md` (this file), `sources.json`
- `evidence/preferences-inventory.json` — new, machine-readable preference/defaults/unit tables
- `evidence/round1-raw/…` → read-only symlink to the round-1 `raw/` folder (containing `localization.json`, `localization_de.json`, `jsapp.html`, `jsapp-rendered.html`, `jsapp.headers`, `history*.html`, `faq*.html`, `users-guide*.html`, `SweetHome3DShortcuts.pdf`, `DefaultFurnitureCatalog.json`, `DefaultTexturesCatalog.json`, `README-761.txt`, …)
- `evidence/round1-txt/…` → read-only symlink to the round-1 `txt/` folder (`users-guide.en/de.txt`, `faq.en.txt`, `history.en.txt`, `shortcuts.txt`, …)
- `evidence/round1-js/…` → read-only symlink to the round-1 `js/` folder (`sweethome3d.min.js` v7.5.2 — the primary source for this report — plus `core.min.js`, `geom.min.js`, `graphics2d.min.js`, `swingundo.min.js`, `SweetHome3D.js`)
