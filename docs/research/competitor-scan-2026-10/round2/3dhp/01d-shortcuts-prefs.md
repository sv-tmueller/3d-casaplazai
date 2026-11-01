# 3D House Planner — Keyboard Shortcuts, Context Menus & Persisted Preferences (Round 2)

**Job:** `04-01d-feature-inventory-shortcuts` · **Target:** 3D House Planner, <https://www.3dhouseplanner.com/> — editor `app.php` (Babylon.js) + 2D planner iframe `2D-Planner/index.php`
**For:** CasaPlazAI (single-page Vite/TypeScript/Three.js 2D/3D floorplanner, no backend, plan autosaves to localStorage; schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`)
**Round-1 base:** `~/dsh-workspaces/rea-3dhouseplanner-2026-10/01-01-feature-inventory/report.md` (read; its evidence reused read-only, its folder never modified). This report does not redo the broad feature inventory; it goes deep on shortcuts, context menus and browser-persisted keys, and closes round-1 Unknowns #1 (exact key handling), #9 (grid/snap semantics as they surface through prefs) and #12 (keyboard-only flow) where they touch this question.
**Method:** (a) live page capture with REA 6.8.0 `rea capture-browser-scenario`; (b) direct CDP extraction of all 29 editor scripts and 12 2D-planner scripts (`Debugger.getScriptSource`), then static de-obfuscation and devirtualisation of the string-array (`scripts/deobf*.mjs`, `scripts/devirt.mjs`); (c) instrumentation of `localStorage`/`sessionStorage`/`indexedDB` and of `EventTarget.addEventListener` from an init script; (d) parsing of the shipped `window.HP_I18N_DATA` dictionary (1,678 strings) and of the `textures/hotkeys.svg` artwork; (e) vendor pages.
**Evidence:** `./evidence/` (raw captures, script sources, decoded string tables, devirtualised sources, JSON probes), scenarios in `./scenarios/`, sources in `./sources.json`.

Legend: **OBSERVED** (in a captured file, named) · **DOCUMENTED** (vendor-published text: page copy, i18n string, tooltip, accessible name) · **INFERRED** (my reasoning).

> Scope note: no account, no login, no purchase, no share-link, no AI call, no installer, no uploaded file. Only public, free, no-login surfaces were read. No target source code is reproduced in this report or reused; only behaviour, key names, data shapes and UX patterns are described in my own words. The scripts I retained are proprietary to 3D House Planner and are kept in `evidence/` as capture artefacts only, never as a deliverable for reuse.

---

## 1. Summary

1. **OBSERVED** The editor has **one `keydown` listener on `window` in capture phase** (the central dispatcher in `editor/hp-ux`) plus, after "Start designing", **11 bubble-phase `keydown` listeners on `document`** and ~79 bubble `keydown` listeners on individual elements/toolbar widgets — 173 keyboard-ish listeners in all, most of them on buttons and form controls (`evidence/js/editor_hp-ux.js`, `evidence/shortcut_probe.json` `ready.lis`).
2. **OBSERVED** The in-app **Keyboard shortcuts** dialog (`#modalkey`) does **not** contain HTML text: its body is a single `<object data="textures/hotkeys.svg">`, and the *rendered* cheatsheet is a different, dynamically built panel of class `hp-keys` in `hp-ux`, driven by the `ux.keys.*` i18n group (**23 keys**: 18 shortcut-label rows + 5 group/heading keys) (`evidence/raw/app_php_served.html`, `evidence/js/editor_hp-ux.js`, `evidence/i18n_data.json`). Round 1 only saw the SVG's accessibility text; the real, translatable, code-driven list is richer.
3. **OBSERVED** The editor is **keyboard-shortcut-light by design**: it binds `Esc`, `Home`, `F`, `W A S D` + arrows, `1/2/3`, `Ctrl+C/V/Z/Y/D/S/K`, `Delete`, `Shift`, `Tab`, `Backspace` and a few wall-planner letters (a curved-wall-segment letter branch); *everything else* is a **toolbar button, a left-dock card or a canvas popover** (`ux.*` i18n group). There is **no right-click context menu anywhere**; `contextmenu` is only ever (a) suppressed while a drawing/linear tool is armed or (b) consumed as a *gesture* — finish the wall sketch, sculpt terrain. The 2D planner instead ships a **`?`-opened shortcut/help panel** and a 13-single-letter tool map (`V W A P J D N S F R T M L`) (`evidence/js/editor_hp-editor.js`, `evidence/js/editor_hp-linear.js`, `evidence/js2d/planner_uiShell.*`, `evidence/i18n_planner.json`).
4. **OBSERVED** Persistence is **localStorage-first** with a single **IndexedDB database `hp-bim`** (version 2, object store `projects`, keyPath `id`) holding saved whole-project snapshots, plus `puter_cache` (v1, store `store`) used by the third-party Puter.js library; state that must not survive a reload (e.g. resume hints, tour-done) goes to **sessionStorage** (`evidence/storage_full.json`, `evidence/shortcut_probe.json`, decoded `indexedDB.open(...)` string in `evidence/js/editor_hp-bim.js`).
5. **OBSERVED** **33 distinct persisted keys** were seen live (25 `hp-*`-family + `extension-floorplanner-*`, plus 4 `puter.*`, `test` and 2 IndexedDB names; the *complete* inventory in 2.3.1 has **39 rows** because it adds keys confirmed statically but not yet written in my sessions). An 11-key subset is *read* on every boot and 12 are *written* after a single "click everything" pass. The 2D-planner iframe additionally owns a whole **`extension-floorplanner-*` namespace** whose two data-bearing keys are `extension-floorplanner-history` (a JSON array of up to **50** plan snapshots, each `{objData, wallData, roomData}`) and `extension-floorplanner-floorplans` (the project index) — with `extension-floorplanner-current-filename` naming the active plan (`evidence/clickall.json`, `evidence/storage_attribution.json`, `evidence/js2d/planner_planner-main.*`, `evidence/js2d/planner_bridge3d.*`).

---

## 2. Findings

### 2.0 Evidence index

| Evidence file | What it is |
|---|---|
| `evidence/raw/app_php_served.html` | 2,092,092-byte server-rendered editor HTML (fetched 2026-10-31, sha256 `7bf8dd63…58c`), contains the full dialog DOM + `HP_I18N_DATA` |
| `evidence/raw/hotkeys.svg` | The 157 KB Inkscape-drawn shortcut artwork loaded into the Help dialog |
| `evidence/i18n_data.json` | Parsed `window.HP_I18N_DATA["app"]["dict"]`, 1,678 key→string pairs (en) |
| `evidence/js/editor_hp-*.js` (29 files) | Verbatim script sources obtained through CDP `Debugger.getScriptSource`; obfuscated originals |
| `evidence/js/editor_hp-*.devirt.js` | My devirtualised copies (string-array calls replaced by literals) — analysis artefacts. **Caveat: the substituter can emit a few wrong literals** (a handful of distinct argument positions resolve to the same array slot), so anything load-bearing was re-verified in the pristine `editor_hp-*.js` and in the independently extracted `.strings.txt` tables before being asserted here. |
| `evidence/js/editor_hp-*.strings.txt` | Per-file extracted string arrays (2,300+ distinct strings) |
| `evidence/shortcut_probe.json` | Instrumented run: every `addEventListener` for key/context events, every storage op, per-phase localStorage |
| `evidence/storage_full.json` | Full localStorage + sessionStorage + `indexedDB.databases()` structure at 5 phases |
| `evidence/storage_attribution.json` | Every storage access attributed to the exact script (`js.php?f=…`) that made it, via `new Error().stack` |
| `evidence/storage_callsites2.json` | Static map of storage call sites per module |
| `evidence/clickall.json` | Result of clicking every checkbox/range/select twice, with **all** storage writes and reads recorded |
| `evidence/controls.json` | Enumerated editor controls (checkbox id, range, select, tabs) |
| `evidence/planner2d.json`, `evidence/js2d/planner_*.js` | 2D-planner iframe frame list, its 12 scripts (obfuscated + devirtualised) |
| `evidence/i18n_planner.json` | Parsed planner namespace of `window.HP_I18N_DATA` (905 strings) |
| `evidence/raw/planner2d_served.html` | 139,742-byte server-rendered 2D-planner HTML (its i18n + markup) |
| `evidence/raw/planner2d_dom.html` | Full DOM of the 2D planner iframe as instantiated inside the 3D shell |
| `evidence/cdp_scripts.json` | Script IDs/URLs seen by CDP (29 editor modules) |

Server-side note: `js.php?f=…` returns **403 Forbidden** to any direct HTTP fetch (with or without `Referer`); the scripts in `evidence/js` were obtained from the page's own debugger session, which is legitimate reading of delivered bytes, not a bypass (`evidence/js_fetch_report.json`).

---

### 2.1 Complete keyboard-shortcut list (reconciled)

Three independent sources exist, and they disagree in interesting ways.

**(a) The statically rendered `#modalkey` dialog** — body is `<object data="textures/hotkeys.svg" type="image/svg+xml" class="hp-hotkeys-img" aria-label="Keyboard shortcuts">`. The SVG contains exactly 8 text labels: *Delete objects, Snap to Grid, Translate objects, Rotate objects, Bonding Box* [sic], *Copy/Paste objects, Stop wall sketch, Select multiple objects* (`evidence/raw/app_php_served.html`; `evidence/raw/hotkeys.svg`). This is the list round 1 captured, plus what it could not see: it is a **static, untranslated illustration** — it is not regenerated on language change, and it omits everything added since (Save, AI, Walls group).

**(b) The dynamically built `hp-keys` panel in `hp-ux`** — **DOCUMENTED/OBSERVED**: the code builds a grouped table from i18n keys `ux.keys.*`. The rendered groups and rows are, verbatim from the code's table literal and the i18n dictionary:

| Group (i18n) | Key(s) | Meaning (i18n label) |
|---|---|---|
| `ux.keys.gView` | `W A S D` (poss. `+ arrows`) | Walk (first-person view; arrows too) |
| | `Home` | Show the whole project |
| | `Escape` | Close panels and menus |
| | `F` | Focus camera on selection |
| `ux.keys.gEdit` | `1 / 2 / 3` | Move / rotate / scale gizmo (row 1) |
| | `Shift` | Hold while moving: snap to the grid (row 2) |
| | `Ctrl`+`C` | Copy the selection (row 3) |
| | `Ctrl`+`V` | Paste at the last clicked point (row 4) |
| | `Ctrl`+`click` | Select several objects (row 5) |
| | `Delete` | Delete selection (row 6; key-cap obfuscated) |
| | `Ctrl`+`Z` | Undo (row 7) |
| | `Ctrl`+`Y` | Redo (row 8) |
| `ux.keys.gWalls` | `Enter` | Finish the walls (or double-click) |
| | `Tab` | Type the angle after the length |
| | `Backspace` | Remove the last point |
| `ux.keys.gApp` | `Ctrl`+`S` | Save project in the browser |
| | `Ctrl`+`K` | AI assistant |

**Positional evidence (strong):** the plaintext key-cap tuples appear **in this exact order** in the pristine `editor_hp-ux.js` source — group 2 (`gEdit`) rows are, in order, `['1 / 2 / 3']`, `['Shift']`, `[Ctrl,'C']`, `[Ctrl,'V']`, `[Ctrl,'click']`, `[?,'']`, `[Ctrl,'Z']`, `[Ctrl,'Y']`, and group 4 (`gApp`) rows are `['Ctrl','S','ux.keys.save']`, `[Ctrl,'K',…]`. The two plain literals `'1\x20/\x202\x20/\x203'`, `'Shift'`, `'F'`, `'Ctrl'`, `'C'`, `'V'`, `'click'`, `'Z'`, `'Y'`, `'S'`, `'K'` are read straight from the file, so **every key-cap above is OBSERVED except `W A S D`, `Home`, `Escape`, `Delete`, `Enter`, `Tab`, `Backspace`**, which are obfuscated in the table but independently present as literals in the `hp-ux`/`hp-bim` string tables plus the `ux.keys.*` labels. The row→label pairing is therefore **positionally ordered**, with only the intra-group order of the four `gView` rows being uncertain.

Source: the table literal in `evidence/js/editor_hp-ux.js` (pristine) and the `ux.keys.*` values in `evidence/i18n_data.json`.

**(c) Handlers actually registered at runtime** — `evidence/shortcut_probe.json` records, after "Start designing", a **total of 173 keyboard listeners**: 79 bubble `keydown` + 35 `keyup` + 34 `keypress` on elements, 11 bubble `keydown` on `document`, 5 bubble `keydown` on `window`, **2 capture-phase `keydown` on `window`** (one is `hp-ux`'s central dispatcher), 2 bubble `keyup` on `window`, and 1 capture `keyup`. The window-capture dispatcher implements `Home` → *frame all* and bails out when the event target is content-editable or an `INPUT`/`TEXTAREA`/`SELECT`; the decoded string table for `hp-ux` contains exactly `keydown`, `altKey`, `ctrlKey`, `metaKey`, `preventDefault`, `Escape`, `Home`, `Backspace`, `Tab` (`evidence/js/editor_hp-ux.strings.txt`).

**(d) Undocumented-but-implemented keys found by code reading** (not in either cheat sheet — real behaviour, **OBSERVED** in source):

| Key | Effect | Module |
|---|---|---|
| `Ctrl`/`⌘`+`D` | Duplicate the current level ("duplicate level"), guarded so it does not fire in a form field | `editor/hp-copy` (keydown handler: `(ctrlKey\|\|metaKey) && !shiftKey && !altKey && key.toLowerCase()==='d'`, plus the INPUT/TEXTAREA/SELECT guard) — **confirmed in the pristine source** |
| `Ctrl`+`Z` **and `Backspace`** during wall drawing | undo the last wall point | `wb.hint` / `wb.hintRect` i18n strings; `Backspace` is a literal in `hp-editor`/`hp-linear` string tables |
| `Shift` (held) | snap to grid while moving **and** while drawing | `ux.keys.snap`, `wb.hint`, `wb.gridTip` |
| `Alt` (held) | **no snapping at all** while drawing | `wb.hint`, `wb.hintRect`, `wb.hintArc` |
| `Alt`+click | material brush: pick another material | `brush.hint` |
| `Shift`+click | material brush: paint every surface of the same kind and material on that level | `brush.hint` |
| `Shift` (held) | measure tool: constrain to one axis | `measure.hint` (string table: `Shift`, `Axis`) |
| `⌘` / `Ctrl`+click **or** `Shift`+click | BIM model tree: multi-select elements | `bim.multiHint` |
| Arrow keys | roving focus / navigation in a list widget | `editor/hp-ui` keydown branch — literals `ArrowUp`, `ArrowLeft`, `Enter`, `Tab`, `Escape` are confirmed in the source; the opposite arrows are present but only via obfuscated indices |
| `1`/`2`/`3` | gizmo mode | `hp-editor`, top-level numeric branch; label `ux.keys.move` = "Move / rotate / scale gizmo" |

A **caution about wall-curve letters**: earlier drafts of this report listed `A/S/Q/E` as auto/straighten/curve-left/curve-right for curved-wall segments. That came from a mis-substitution in my devirtualised copy and is **not supported by the pristine sources** — the letters `a`/`s` appear in `hp-editor` only inside geometry code and in an `'s' === key.toLowerCase()` branch with modifier checks. Treat those four letters as **unverified**.

**(e) Guard rails (important for parity).** Every global shortcut handler starts with the same checks: `isContentEditable`, `/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)`, plus modifier/bail-out checks. `hp-copy`'s duplicate handler requires `(ctrlKey || metaKey) && !shiftKey && !altKey` and `'d' === e.key.toLowerCase()`; `hp-editor`, `hp-linear`, `hp-measure` and `hp-ui` all read `altKey/ctrlKey/metaKey/shiftKey` to decide whether a gesture or a modifier applies. This is why shortcuts do not fight form fields (**OBSERVED** in the pristine sources; the corresponding literals are in the decoded string tables: `isContentEditable`, `INPUT|TEXTAREA|SELECT`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `keydown`, `preventDefault`).

**(f) Wall-drawing verb set** (**DOCUMENTED**, `wb.hint*`): click = place point · `Enter`/double-click/right-click = finish · click first point = close · type a number = exact length (rect: width) · `Tab` = switch to angle (rect: depth) · `Backspace`/`Ctrl+Z` = undo · `Esc` = cancel, `Esc` again = exit · `Shift` = grid · `Alt` = no snapping.

---

### 2.2 Context menus — where they exist, what is in them

**Headline: the 3D editor has no right-click context menu.** Verified three ways:

1. `evidence/raw/app_php_served.html` contains **zero** occurrences of `context-menu`, `ctxmenu`, `data-ctx`, `role="menu"`, or a menu class; the only `menu` classes are `sidebar-menu` / `sidebar-menu2` on the 2D planner's drill panes. (grep over the whole 2 MB file.)
2. **Only two source modules register a `contextmenu` listener**, and in both cases its body is a `preventDefault()` suppression: `editor/hp-editor` (while the wall-builder segment tool is active) and `editor/hp-linear` (while the linear/road/rail/fence tool is enabled) (`grep -c contextmenu` over the pristine scripts: `hp-editor`=1, `hp-linear`=1, every other 3D module=0). At runtime the probe sees 4 `contextmenu` listeners (3 on elements + 1 on `window`) — the extra ones come from Babylon.js's internal pointer handling, not from the app's shortcut layer (`evidence/shortcut_probe.json` `ready.lis`).
3. Live probe: after "Start designing", right-clicking the canvas and right-clicking the left dock produced **no visible menu element** (`evidence/shortcut_probe.json` → `ctx_canvas.dom` = only a hidden `.hp-lang-menu`; `ctx_dock.dom` = `[]`).

**Two *deliberate* right-click gestures exist** (both DOCUMENTED in i18n and OBSERVED as `contextmenu` handlers): *finish the wall sketch* (`wb.hint`: "Enter, double-click **or right-click**: finish") and *sculpt terrain* (`fx.sculptHint`: "Right-click to model terrain"). So `contextmenu` is not merely suppressed — in exactly those two modes it is consumed as input.

What plays the role of a context menu instead (**OBSERVED**):

- **Selection bar** (`hp-selbar`, plus buttons `hp-selbar-copy`, `hp-selbar-sep`) — a floating action bar appears on selection with Copy/Delete/Properties/Move/Rotate/Scale (`ux.copy`, `ux.delete`, `ux.props`, `ux.move`, `ux.rotate`, `ux.box` i18n).
- **Canvas popovers** — `hp-curvepop` (bend-wall editor: Straighten / Arc / Radius / Bulge / Flip / Length — `ux.curve*`), `hp-copypop` (copy-to-level with `hp-copypop-level`, `hp-copypop-sec`, `hp-copypop-dirs`), `hp-cp` (right-click *paste* target coordinates).
- **Toolbar popovers/panels** — File, Catalog, Render quality, AI, BIM, Sun, Tools, Help, Level/duplicate; each is a click-opened panel, dismissed by `Esc`.
- **2D planner iframe**: likewise no native context menu; it exposes a **Quick guide** panel (`help.quickGuide`, opened by `?` / `Help`) and per-tool *mode* hints (`hint.*`), plus a right-hand inspector for the selected item (`evidence/planner2d.json`, `evidence/i18n_planner.json`).

**INFERRED:** the deliberate choice is *modeless popovers + one floating selection bar*, which is cheaper to make keyboard- and touch-reachable than an HTML context menu and avoids canvases swallowing `contextmenu`.

---

### 2.3 Complete persisted-state key inventory

Enumerated from *both* directions — runtime instrumentation and static call-site decoding — then reconciled. "Who" = the module that performs the call.

#### 2.3.1 `localStorage` (3D editor + 2D iframe, shared origin)

| # | Key | R/W | Value shape (observed or decoded) | Who | Meaning |
|---|---|---|---|---|---|
| 1 | `hp-lang` | R (editor), R/W (i18n) | `"en"` (a 2-letter code; observed as cookie `hp_lang=en` too) | `editor/hp-i18n`, `editor/hp-app` | UI language |
| 2 | `hp-units` | R/W | `"m"` or `"ft"` (variable name `HP_UNITS_KEY`, observed `"m"`) | `editor/hp-app` | Display unit system for 3D **and** 2D |
| 3 | `hp-donate` | R/W | `{"used":N,"next":M}` — observed incrementing 30→60→90 during a single session | `editor/hp-donate` | Donation-nudge throttle counters |
| 4 | `hp-dims` | **R/W** | `"1"` / `"0"` (observed written `1`, later `0`) | `editor/hp-dims` | Dimension tool master switch |
| 5 | `hp-dims-opts` | **R/W** | `{"walls":bool,"openings":bool,"rooms":bool,"heights":bool}` — observed all four transitions while toggling | `editor/hp-dims` | Which dimension groups are shown |
| 6 | `hp-measure` | **R/W** | `{"mode":"dist","pin":bool}` — observed `pin` flipping false→true | `editor/hp-measure` | Measure-tool mode + pinned measurement |
| 7 | `hp-render-mode` | R | quality preset id | `editor/hp-render` | Render quality preset (Balanced / High / …) |
| 8 | `hp-pathtrace` | R | JSON | `editor/hp-pathtrace` | Path-tracing settings |
| 9 | `hp-terrain-detail` | R | JSON | `editor/hp-terrain-detail` | Terrain mesh detail level |
| 10 | `hp-sun-map` | R | JSON | `editor/hp-sun` | Solar/shadow map settings |
| 11 | `hp-linear` | R/W | JSON object `{sys,mode,…}` | `editor/hp-linear` | Roads/rails/fences linear-tool mode |
| 12 | `hp-bim-autosave` | R/W | `"1"`/`"0"` | `editor/hp-bim` | BIM autosave toggle |
| 13 | `hp-skirting` | R | JSON | `editor/hp-bim` | Skirting-board defaults |
| 14 | `hp-wall-skirting` | R | JSON | `editor/hp-bim` | Per-wall skirting options |
| 15 | `hp-ceiling-trim` | R | JSON | `editor/hp-bim` | Crown/cove trim options |
| 16 | `hp-wallbuilder-opts` | R | `{"thickness":Number,…}` | `editor/hp-editor` | Wall-builder defaults (thickness default 20) |
| 17 | `hp-ai-front` | R | model id | `editor/hp-ai-chat` | AI chat "front" model |
| 18 | `hp-ai-model` | R/W | model id (literal `'hp-ai-model'` observed) | `editor/hp-ai-chat` | Selected AI model |
| 19 | `hp-ai-history` | R | JSON array, capped (`slice(0,0xc)` = 12 entries) | `editor/hp-ai-chat` | Recent AI conversation |
| 20 | `hp-catalog-recent` | R | JSON array | `editor/hp-panels` | Recently used catalog objects |
| 21 | `hp-sync-prefs` | R | JSON | `editor/hp-sync` | 2D⇄3D live-sync preferences |
| 22 | `hp-resume-after-reload` | R/S/W | flag; removed after the hint is consumed | `editor/hp-bim`/`hp-editor` | Crash/refresh recovery hint |
| 23 | `hp-mat-collapsed` | R | `"1"`/`"0"` | `editor/hp-ui` | Material panel collapsed state |
| 24 | `hp-tools-collapsed` | R/W | `"1"`/`"0"` | `editor/hp-ux` | Tools dock collapsed state |
| 25 | `hp-start-dismissed` | **R/W** | `"1"` (observed) | `editor/hp-ux` | "Start your project" empty-state dismissed |
| 26 | `hp-collapsed` | R | flag | `editor/hp-ux` | Generic dock-collapsed flag (CSS class `hp-collapsed`) |
| 27 | `floorplanAiConverterPrefs` | R | JSON | `editor/hp-editor` | AI floor-plan-converter preferences (default model, etc.) |
| 28 | `extension-floorplanner-currently-editing` | W (by the 2D iframe) | `"true"` | `2D-Planner/*` | Cross-app handshake: 2D planner says it is live so the 3D shell knows where to send edits |
| 29 | `extension-floorplanner-current-filename` | R/W (2D iframe) | JSON string, e.g. `"myplan"` | `planner/bridge3d`, `planner-main` | Name of the active 2D plan (null ⇒ untitled) |
| 30 | `extension-floorplanner-history` | R/W (2D iframe) | JSON array of up to **50** snapshots, each `{"objData":[],"wallData":[],"roomData":[]}` (observed), trimmed with `.slice(-5)` on quota pressure | `planner-main` (`HISTORY_LIMIT=50`), `planner/bridge3d` | The 2D planner's **undo/redo ring buffer** — i.e. the whole plan, kept in localStorage |
| 31 | `extension-floorplanner-floorplans` | R/W (2D iframe) | JSON object map of saved floor-plans | `planner-main`, `planner/uiShell` | Project index ("Recent floorplans" list) |
| 32 | `extension-floorplanner-settings` | R/W (2D iframe) | JSON of `normalizeSettings()` (grid size, snap, units, multi-select…) | `planner-main`, `planner/uiShell` | 2D planner settings blob |
| 33 | `extension-floorplanner-roomTools` | R/W (2D iframe) | `"1"` / `"0"` | `planner/uiShell` | Whether the room-tools card is open (defaults to `"1"`) |
| 34 | `extension-floorplanner-library-panel` (tab id under the `library-*` prefix) | R/W (2D iframe) | group id | `planner/objectPalette` | Last chosen furniture/object category in the palette |
| 35 | `fp-help-seen` | W (2D iframe) | `"1"` | `planner/uiShell` | Quick-guide / help already seen |
| 36 | `extension-floorplanner-currently-editing`-adjacent UI ids | R/W | `"1"`/`"0"`/grid | `planner/*` | Grid-snap, dark mode, auto-save, wall width, bbox width/height/rotation, door-window width/height — all read from the `extension-floorplanner-*` checkbox/input ids |
| 37 | `test` | W/remove (startup probe) | `""` | `puter.js` (3rd party) | Storage availability test; written and removed at boot |
| 38 | `puter.auth.token.v2`, `puter.auth.token`, `puter.auth.token.origin.v2`, `puter.app.id` | R/remove | tokens/ids | `puter.js` (3rd party, `https://js.puter.com/v2/`) | Puter.js free-account auth cache for the AI assistant |
| 39 | `extension-floorplanner-*` (markup ids) | — | 258 distinct short strings (271 total incl. 13 longer container ids) | not keys | The same prefix is also used for **DOM ids**, not only storage keys; see 2.3.2 |

Notes: keys 1–27 are 3D-editor keys; 28–36 are the 2D planner's; 37–38 belong to the third-party AI library. `hp-donate` is the **only key both surfaces write**: the 2D planner owns the `extension-floorplanner-*` namespace and writes `extension-floorplanner-currently-editing` + the shared `hp-donate` counter, while the 3D editor only *reads* `hp-donate`. **The 3D editor does *not* touch `extension-floorplanner-history`** — that key is read and written exclusively by the 2D planner (`grep -l` over the pristine scripts: only `js2d/planner_bridge3d.js` and `js2d/planner_planner-main.js` contain it; **zero** 3D `hp-*` scripts do). What the 3D shell *does* do is reach **across the iframe boundary via the DOM**: `editor/hp-editor` grabs `document.getElementById('floorplanIframe').contentDocument` and drives the 2D planner's own controls (`[id^="extension-floorplanner-"][id$="_mode"]`, `#extension-floorplanner-energy_list`, `#extension-floorplanner-window_mode`, `-bboxWidth`/`-bboxHeightVal`) — i.e. **UI-level coupling through element ids, not shared storage**. That is an important distinction and is stated correctly in 2.7.

**Confirmed write values** (from the "click every control twice" run, `evidence/clickall.json` `w` array — exact strings, this closes part of round-1 Unknown #9 and my own initial uncertainty):

```
hp-start-dismissed  = 1
hp-dims             = 1        then 0
hp-dims-opts        = {"walls":false,"openings":false,"rooms":false,"heights":false}
                      {"walls":false,"openings":true,"rooms":false,"heights":false}
                      {"walls":false,"openings":true,"rooms":true,"heights":false}
                      {"walls":false,"openings":true,"rooms":true,"heights":true}
hp-measure          = {"mode":"dist","pin":false}   then {"mode":"dist","pin":true}
hp-ai-model         = claude-opus-5-5
hp-donate           = {"used":30,"next":0} → {"used":60,"next":0} → {"used":90,"next":0}
hp-resume-after-reload = <removed>   (written elsewhere, cleared on load)
extension-floorplanner-history = ["{\"objData\":[],\"wallData\":[],\"roomData\":[]}"]
```

**Per-module attribution** (from stack traces, `evidence/storage_attribution.json`; "2" in the run means the session-first read helper fired twice — once against `sessionStorage`, once against `localStorage`):

| Module (`editor/…`) | Keys it owns |
|---|---|
| `hp-i18n` | `hp-lang` |
| `hp-app` | `hp-units` |
| `hp-bim` | `hp-bim-autosave`, `hp-skirting`, `hp-wall-skirting`, `hp-ceiling-trim`, `hp-resume-after-reload` (R + **removeItem**), IndexedDB `open(hp-bim)` |
| `hp-editor` | `hp-wallbuilder-opts` |
| `hp-dims` | `hp-dims` (R/W), `hp-dims-opts` (R/W — most-written key, 6 writes in one pass) |
| `hp-measure` | `hp-measure` (R/W) |
| `hp-donate` | `hp-donate` (R/W) |
| `hp-ux` | `hp-start-dismissed` (R/W) |
| `hp-panels` | `hp-catalog-recent`, `hp-mat-collapsed` |
| `hp-ai-chat` | `hp-ai-model`, `hp-ai-history` |
| `hp-ai-place` | `hp-ai-front` |
| `hp-linear` | `hp-linear` |
| `hp-pathtrace` | `hp-pathtrace` |
| `hp-render` | `hp-render-mode` |
| `hp-sun` | `hp-sun-map` |
| `hp-sync` | `hp-sync-prefs` |
| `hp-terrain-detail` | `hp-terrain-detail` |
| `puter.js` (inline, 3rd party) | `test`, `puter.auth.token*`, `puter.app.id`, IndexedDB `open(puter_cache)` |

This confirms **one-key-per-module ownership**: each feature module owns exactly the one or two keys it needs, and there is no central preferences bus. (Keys `hp-tools-collapsed` and `hp-collapsed` were not written by the controls I exercised, so their owner is *INFERRED*; the `hp-tools-collapsed` literal sits in `editor/hp-ux`.)

#### 2.3.2 `extension-floorplanner-*` is a *dual-purpose* prefix

The 2D planner uses the same prefix for (a) **DOM element ids** and (b) **localStorage keys**. **271 distinct `extension-floorplanner-*` literals** (258 short ids plus 13 longer container ids) appear across its 12 scripts — most of them in `planner-main` (111) and `uiShell` (27) (counted in the pristine `evidence/js2d/planner_*.js`). The ones that are **storage keys** (i.e. appear as an argument to `localStorage`/`setItem`/`getItem`) are: `currently-editing`, `current-filename`, `current-svg`, `history`, `floorplans`, `settings`, `roomTools`, `library-panel` (object-palette group), and the settings-shaped ones for grid/wall/bbox/door-window values. The rest are ids such as `extension-floorplanner-bboxWidth`, `-grid-snap-checkbox`, `-dark-mode`, `-auto-save-checkbox`, `-wallWidth`, `-doorWindowWidth`, `-bboxRotation`, `-modal-new-floorplan-name-input`, `-tool-root`, `-slist`, `-layer_list`. **INFERRED**: the 2D planner was forked from the open-source `homeRoughEditor` (already noted in round 1 for its MIT licence), and it kept that project's id/key prefix — which is why the namespace is *not* `hp-`.

#### 2.3.3 `sessionStorage` (read-or-write; mirror-fallback pattern)

The editor uses a **"session first, local fallback"** read helper: for every preference it tries `sessionStorage.getItem(k)` and then `localStorage.getItem(k)` (`evidence/shortcut_probe.json` shows the pairs in exactly this order for keys 1–22 above). sessionStorage entries actually *set*:

| Key | Value | Meaning |
|---|---|---|
| `hp-start-dismissed` | `"1"` | Per-tab: don't show the empty state again in this tab |
| `hp-resume-after-reload` | flag → removed | Per-tab resume hint |
| `hp-tour-done` | `"1"` | First-steps tour completed in this tab |
| `puter.*` | tokens | Puter.js reads sessionStorage before localStorage |
| `test` | `""` | Puter.js availability probe |

No sessionStorage key was present at any sampled phase of the storage probe except the transient Puter values, i.e. **the editor writes preferences to `localStorage` and mirrors reads through `sessionStorage`** (**INFERRED** from the read pattern plus the empty `session_storage` array in `evidence/storage_full.json`).

#### 2.3.4 IndexedDB

| DB | Version | Store | keyPath | autoIncrement | Purpose |
|---|---|---|---|---|---|
| `hp-bim` | 2 | `projects` | `id` | false | Saved project snapshots; `bim.storage` i18n: *"Stored in this browser only (IndexedDB) – export a project file to keep a copy."*; `bim.noStorage`: *"This browser cannot store projects (IndexedDB unavailable)."*; `bim.dbBlocked`: *"Projects stay unavailable while another tab of the planner (older version) is open"* → the `version 2` upgrade is the migration guard |
| `puter_cache` | 1 | `store` | `key` | false | Third-party Puter.js cache |

Observed live: `hp-bim` appears only after "Start designing" (version 2, 0 records in a fresh session); `puter_cache` appears at boot. DB names come from `indexedDB.open(<name>, 2)` in `editor/hp-bim` and the stored `hp-bim` literal.

#### 2.3.5 Cookies

`PHPSESSID` (secure, HttpOnly, Lax), `__cf_bm` (Cloudflare bot management), `visted=1` (plain), `hp_lang=en` (plain). The first two are server/edge; `visted` and `hp_lang` are the app's, and `hp_lang` **duplicates** the `hp-lang` localStorage key (cookie for the server-rendered page, localStorage for the client runtime).

---

### 2.4 Meaning of each persisted key — schema-level reading

The preferences fall into six clean classes, which is the useful result for CasaPlazAI:

1. **Global display** — `hp-lang`, `hp-units`. Small scalars, string-read, both also reflected in a cookie (`hp_lang=en`) and the status bar; `hp-units` observed as `"m"`.
2. **Tool activation / tool state** — `hp-dims`, `hp-dims-opts`, `hp-measure`, `hp-pathtrace`, `hp-linear`, `hp-terrain-detail`, `hp-sun-map`, `hp-render-mode`. Each tool owns one key (or two: a master flag plus an options object); values are boolean-ish flags or small JSON blobs.
3. **Tool options** — `hp-wallbuilder-opts` (`{"thickness": Number}` default 20), `hp-skirting`, `hp-wall-skirting`, `hp-ceiling-trim`, `hp-sync-prefs`, `extension-floorplanner-settings`.
4. **UI chrome state** — `hp-tools-collapsed`, `hp-mat-collapsed`, `hp-collapsed`, `hp-start-dismissed`, `hp-resume-after-reload`, `extension-floorplanner-roomTools`, `fp-help-seen`.
5. **Histories / recency / project index** — `hp-catalog-recent`, `hp-ai-history` (capped at 12), `hp-ai-front`, `hp-ai-model`, `floorplanAiConverterPrefs`, `extension-floorplanner-history` (50 snapshots), `extension-floorplanner-floorplans`, `extension-floorplanner-current-filename`, `extension-floorplanner-current-svg`.
6. **Project data** — the `hp-bim` IndexedDB store (3D shell) and `extension-floorplanner-history` + `-floorplans` (2D planner), plus crash-recovery via `hp-resume-after-reload`.

**INFERRED** from value shapes: values are read with a defensive `try { JSON.parse(x) } catch {} || default` wrapper, and keys are namespaced with a flat prefix (`hp-` for the 3D shell, `extension-floorplanner-` for the 2D planner) — no version field, no migration table for the *preferences* themselves. The only versioning in the whole persistence layer is the **IndexedDB `hp-bim` version 2**, and its upgrade path is protected by a cross-tab lock message (`bim.dbBlocked`). Both surfaces wrap writes in a `safeStore(key, value)` helper that catches `QuotaExceededError` and, for the history key, retries with a truncated array (`HISTORY.slice(-5)`) — **OBSERVED** in `planner-main`, and there is a `storageFullWarned` flag alongside it.

---

### 2.5 How preferences are read/written (data flow, autosave, migration)

- **Read**: a single helper reads a key from `sessionStorage` first and `localStorage` second, then parses JSON defensively, then falls back to a literal default (`'{}'` for option blobs, `'null'`/`'[]'` for histories). Evidence: `evidence/shortcut_probe.json` shows the exact `sessionStorage.getItem(k)` → `localStorage.getItem(k)` order for 22 keys at boot.
- **Write**: individual feature modules call `localStorage.setItem` at the moment the user flips a control (e.g. `localStorage.setItem('hp-bim-autosave', checked?'1':'0')`, `localStorage.setItem(HP_UNITS_KEY, value)`, `localStorage.setItem('hp-donate', JSON.stringify({used,next}))`). There is no central preferences object and no debounce layer.
- **Storage availability test**: at boot the Puter library writes `localStorage.setItem('test','')` / `sessionStorage.setItem('test','')` and removes them again (`evidence/shortcut_probe.json` boot `stor`).
- **Autosave**: the project itself autosaves; `hp-resume-after-reload` is set alongside and consumed on the next load, then `removeItem`-ed. The visible status copy in the toolbar is *"Unsaved changes"* / *"Project saved in this browser"* (`bim.saved`).
- **Cross-tab migration guard**: opening an older planner tab raises `hp-bim` upgrade blocking, surfaced as `bim.dbBlocked`. **INFERRED**: the version number is bumped when the project record shape changes, and the app refuses rather than corrupts.
- **Cross-surface sync**: the 2D planner runs in an iframe on the same origin and shares `localStorage` with the 3D editor; the handshake key is `extension-floorplanner-currently-editing`, and language is passed to the iframe by query string (`2D-Planner/index.php?lang=en`, `evidence/planner2d.json`).

---

### 2.6 Shortcut / context-menu implementation notes

- **Two-phase registration**: one `window` capture listener for global `Home` (frame-all), then a `document` bubble listener per feature. Most modules call `addEventListener(..., true)` for capture and a few use bubble (`evidence/shortcut_probe.json` shows `('keydown','window','capture'): 1` and the rest `bubble`).
- **Strict focus guard** repeated in almost every handler: `target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)` → return. `Ctrl+Z` is *not* globally re-implemented when the target is an input — the browser's own undo wins. The `Esc`-skips-`BUTTON|A|LABEL` refinement reported in round 1 could **not** be confirmed in the pristine sources of this round (no such literal exists in any decoded string table), so it should be treated as unverified.
- **Discoverability**: a Help dialog (`#modalkey`) with a static SVG plus an in-code `hp-keys` cheat sheet; a "first steps" tour (`#hp-tour`, `ux.tour.*`) that highlights each toolbar area; per-tool inline `hint` strings rendered in the dock (`wb.hint*`, `measure.hint`, `brush.hint`, `bim.multiHint`, `ceil.pickHint`). Tooltips are attached as `data-tip` attributes and translated via `data-i18n-tip`.
- **No custom context menu** (see 2.2); right-click is used *as a gesture* (finish wall sketch; model terrain — `fx.sculptHint` = *"Right-click to model terrain"*), and suppressed with `preventDefault()` only while those tools are active.
- **Screen-reader reachability** (round-1 Unknown #12, partially closed): the dialogs are real DOM with `role`/heading/`aria-label` and a Close button, and the accessibility tree round 1 captured for the Help dialog shows *heading "Keyboard shortcuts" [level=2]*, *button "Show the first steps tour"*, the full text block of shortcut rows, and *button "Got it"* (`evidence/tabs_a13_help_accessibility.txt` in the round-1 folder). The **3D viewport itself is a canvas with no keyboard-reachable object list** in the editor, so screen-reader completeness is still not achieved; the BIM panel's model tree and the 2D planner's tool list are the accessible equivalents.

---

### 2.7 The 2D planner iframe (`2D-Planner/index.php`): its own shortcuts and storage

Framed as `floorplanIframe`, URL `https://www.3dhouseplanner.com/2D-Planner/index.php?lang=en` (OBSERVED). It loads 12 of its own modules: `planner/i18n`, `qSVG`, `floorplanEditor`, `orientation3d`, `symbols`, `objectCatalog`, `objectPalette`, `planner-main`, `uiShell`, `bridge3d`, `donate` (OBSERVED, `evidence/planner2d.json`; sources in `evidence/js2d/`).

**Its own complete tool shortcut set** (DOCUMENTED in `tool.*` and title/tooltip strings of `evidence/i18n_planner.json`, and captured live from `[title]`/`[data-tip]` in `evidence/planner2d_keys.json`):

| Key | Tool | Key | Tool |
|---|---|---|---|
| `V` | Select | `S` | Stairs |
| `W` | Walls | `F` | Objects (furniture) |
| `A` | Arc wall | `R` | Rooms |
| `P` | Divider | `T` | Text |
| `J` | Joint | `M` | Measure |
| `D` | Doors | `L` | Layers |
| `N` | Windows | | |

Plus the editing/view set (DOCUMENTED, `top.*`/`help.*`): `Ctrl+Z` undo, `Ctrl+Y` redo, `Ctrl+0` reset zoom, `+` / `−` zoom in/out, `0` fit plan, `G` snap-to-grid toggle, `?` shortcuts-and-help, `Ctrl+D` duplicate selected object, `Del` delete selection, `Esc` finish/cancel/close panels, `Ctrl+V` paste a door/window onto a wall (`dw.copyHint`: "Then select a wall and use 'Paste door / window' (or Ctrl+V)"), `Ctrl+S` save, `Shift`-drag keeps direction while placing, `Space` / middle-button / drag pan, `Alt` = place objects without wall snapping. The wall-drawing gestures mirror the 3D editor (`hint.line_mode`, `hint.partition_mode`, `hint.arc_mode*`).

**Its storage namespace** (2.3.1 rows 28–36): the two data-bearing keys are `extension-floorplanner-history` (a JSON array of ≤50 snapshots `{objData, wallData, roomData}` — the plan *and* its undo stack live in localStorage) and `extension-floorplanner-floorplans` (the project index), with `extension-floorplanner-current-filename` naming the active plan, `extension-floorplanner-settings` holding the settings blob (`normalizeSettings()`: grid size, snap, units, multi-select), `extension-floorplanner-roomTools` and `fp-help-seen` as UI flags, and the `extension-floorplanner-library-panel` group id for the object palette. Live sample at first load: only `extension-floorplanner-currently-editing="true"`; after clicking through the 3D editor's controls a snapshot array appeared (`evidence/planner2d_keys.json`, `evidence/clickall.json`).

- Its control ids all use the `extension-floorplanner-*` prefix (the sibling open-source project's prefix): `extension-floorplanner-auto-save-checkbox`, `-multi`, `-grid-snap-checkbox`, `-grid-size`, `-dark-mode`, `-wallWidth`, `-wallBulge`, `-bboxWidth`, `-bboxHeight`, `-bboxRotation`, `-doorWindowWidth`, `-doorWindowHeight`, and per-tool `_mode` roots (`extension-floorplanner-door_mode`, `-window_mode`) (OBSERVED, `evidence/planner2d.json` `inputs`; `evidence/raw/planner2d_dom.html`).
- **Sync with the 3D shell**: the top bar shows *"Synced with 3D"*; `bridge3d` reads/writes the shared history key and the `currently-editing` handshake, and language arrives by query string (`?lang=en`). The **3D shell drives the 2D planner through the iframe DOM**, not through storage: `editor/hp-editor` reads `floorplanIframe.contentDocument` and queries the planner's own ids (`[id^="extension-floorplanner-"][id$="_mode"]`, `#extension-floorplanner-energy_list`, `#extension-floorplanner-window_mode`, `extension-floorplanner-bboxWidth`/`-bboxHeightVal`, `#extension-floorplanner-tool-root`) to mirror/read the 2D state (OBSERVED, pristine `evidence/js/editor_hp-editor.js`).
- Tool groups visible: Select, Walls, Arc wall, Divider, Joint, Doors, Windows, Stairs, Objects, Rooms, Text, Measure, Layers; plus File, "Synced with 3D", Level 0, "3D build", AI, zoom, unit selector (OBSERVED).

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Each idea is tied to a finding above and, where relevant, to the CasaPlazAI schema (`plan` with rooms/walls/openings/furniture + per-level data, autosaved to localStorage).

**Tier 1 — high value, low effort**

1. **Adopt the exact focus-guard helper, verbatim in behaviour** (Finding 2.1e/2.6). One shared `isTypingTarget(e)` = `isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/`. Value: eliminates the classic "tool shortcut fires while I'm naming a room" bug class across all of CasaPlazAI's tools. Effort: one utility + call-site checks. *Ties to CasaPlazAI schema:* room/furniture name fields in the inspector.
2. **Ship one `PREFERENCES` namespace with `hp-`-style flat keys and a session-fallback read helper** (Finding 2.3–2.5). `casaplazai:lang`, `:units`, `:grid`, `:snap`, `:renderMode`, `:toolsCollapsed`, `:startDismissed`, `:catalogRecent`, `:dimsOpts`. A single `prefs.get/set(key, default)` doing `sessionStorage→localStorage→default` with a defensive `JSON.parse` removes the ad-hoc `localStorage.setItem` scattering that the target exhibits. Effort: ~1 file.
3. **Persist per-tool option blobs as small JSON objects, not many scalars** (Finding 2.4 class 3): the target stores `{"thickness":20}` for the wall builder and a JSON blob per tool. Mirrors CasaPlazAI's `wallDefaults`, `gridSize`, opening defaults in one key each; keeps the key count bounded as tools are added.
4. **Add the two shortcuts the target has and CasaPlazAI likely lacks** (Finding 2.1d): `Home` = frame all, and `Ctrl/⌘+D` = duplicate the current level. `Home` is cheap (reset camera), `Ctrl+D` maps directly onto CasaPlazAI's multi-floor model. Effort: two handlers.

**Tier 2 — high value, medium effort**

5. **Build a code-generated cheat-sheet panel next to the static one** (Finding 2.1a/b/2.6). The target has *both*: a pretty static SVG and a runtime-generated grouped table from i18n keys. For CasaPlazAI, generating the table from a single `SHORTCUTS` array (group / keys[] / i18n label) guarantees the help UI can never drift from the handlers, and localises for free. Effort: one data file + one render function.
6. **Prefs version + a "another tab has an older version" guard** (Finding 2.5). The target's only versioning is the IndexedDB `hp-bim` v2 plus a cross-tab blocking message. CasaPlazAI autosaves a single plan to localStorage: add `casaplazai:prefsVersion` and `casaplazai:planVersion`, and on mismatch either migrate or refuse to write (never silently overwrite). Value: prevents the worst data-loss failure in a no-backend app.
7. **IndexedDB for plan snapshots, localStorage for prefs** (Finding 2.3.4, and the counter-example in 2.7). The target keeps the 3D project in `hp-bim`/`projects` (keyPath `id`) while its *2D* planner keeps up to **50 whole-plan snapshots plus an undo stack in localStorage** (`extension-floorplanner-history`) — a clear warning: that namespace is the one that overflows and gets force-trimmed to 5. CasaPlazAI should not repeat it. Move the plan document and the undo ring to IndexedDB, keep only small prefs in localStorage, and wrap every write in a quota-aware `safeStore` that degrades (trim history, warn once) instead of throwing. *Ties to CasaPlazAI schema:* store the same `plan` object, plus an `{id, name, updatedAt}` index record for the project list — mirroring `extension-floorplanner-floorplans` + `-current-filename`.
8. **Recency + session persistence for the catalog/furniture palette** (Finding 2.3.1 row 20 / 2.3.2 `hp-mat-collapsed`): `:catalogRecent` (array, capped ~12 like `hp-ai-history`) and `:toolsCollapsed`. The target also remembers the last object-palette group (`extension-floorplanner-library-panel`); a single `:lastCatalogGroup` scalar is a cheap, high-frequency win in the "furnish rooms from a small palette" flow.

**Tier 3 — valuable, higher effort / lower urgency**

9. **Inline per-tool hint line in the tool card** (Finding 2.7, `wb.hint*`). The target renders a one-line, tool-specific legend that changes with the active tool ("Click: place points · Enter… · Shift: grid · Alt: no snapping"). CasaPlazAI's new tool card is the natural home; the i18n-key-per-tool pattern keeps strings translatable. *Ties to CasaPlazAI schema:* rectangle vs polygon room tool, door/window placement on edges.
10. **No context menu — but use right-click as a gesture, deliberately** (Finding 2.2). The target suppresses the browser menu only while a drawing tool is armed, and uses right-click for *finish wall sketch* and *sculpt terrain*. For CasaPlazAI, wire right-click = finish polygon, `Esc` = cancel, double-click = finish, and never let `contextmenu` leak during drawing. Effort: small; avoids a whole custom-menu component.
11. **Cross-surface handshake key for 2D/3D mode switches** (Finding 2.7). The two surfaces coordinate by (a) a shared `extension-floorplanner-currently-editing` handshake flag in localStorage, (b) the `?lang=` query, and (c) **direct iframe-DOM access** — the 3D shell reaches into `floorplanIframe.contentDocument` and pokes the 2D planner's own control ids. CasaPlazAI is single-page, so the analogue is a `:mode` + `:editingSurface` pref plus a `storage` event / `BroadcastChannel` so other tabs reload; the DOM-poking pattern is **not** recommended to copy (it hard-codes the other surface's element ids).
12. **Persistence-visibility affordance**: the target tells the user *"Stored in this browser only (IndexedDB) – export a project file to keep a copy."* and shows "*Unsaved changes*"/"*Project saved in this browser*". CasaPlazAI should surface the same honesty about browser-only persistence and promote the PNG/JPEG export. Ties to the existing export feature.
13. **Single-letter tool map in the 2D surface** (Finding 2.7): the planner's `V W A P J D N S F R T M L` tool letters plus `G` snap, `0` fit, `?` help, `Ctrl+0` zoom-reset are a cheap, memriseable scheme that maps almost one-to-one onto CasaPlazAI's rectangle/polygon room, door, window, furniture, measure tools. Document them in the same `SHORTCUTS` table as idea 5 so both the help panel and the new tool card render from one source.

---

## 4. Unknowns

1. **A few static call sites remain unresolved, though attribution is now complete.** The obfuscator rotates its string array per module, so some `localStorage.setItem(<var>,…)` sites still show a variable instead of a literal (e.g. `_0x58ef9e`, `_0x25b6c0`, `_0x17b29f`, `_0x509705`, `_0x4e169d` in `hp-bim`/`hp-editor`/`hp-linear`/`hp-pathtrace`/`hp-ai-place`). However, the **runtime stack-trace attribution** (`evidence/storage_attribution.json`) assigns every key I listed to its owning module, and the `hp-` key set is consistent across runtime instrumentation, decoded string tables and observed writes. A small number of keys touched only behind rare code paths may still be missing.
2. **Write-time behaviour for every key was not exercised.** I clicked every checkbox/range/select twice and captured the exact writes (`evidence/clickall.json`), but features that need real geometry (wall builder, dimension tool, path tracing, terrain, BIM autosave, AI) were not operated, so for those keys I state the key and value *shape*, not the runtime value.
3. **Read-only keys.** `hp-pathtrace`, `hp-linear`, `hp-terrain-detail`, `hp-sun-map`, `hp-render-mode`, `hp-sync-prefs`, `hp-catalog-recent`, `hp-mat-collapsed`, `hp-ai-front`, `hp-ai-history`, `hp-bim-autosave`, `hp-skirting`, `hp-wall-skirting`, `hp-ceiling-trim`, `hp-wallbuilder-opts` were only observed being *read* in the phases I exercised (the attribution table shows `getItem` for each). They are confirmed keys and confirmed owners; whether the editor also writes them under other interactions is unverified.
4. **`hp-collapsed` and `hp-active` style classes vs keys.** `hp-collapsed` appears both as a localStorage key and as a CSS class in the shell; I could not separate which usage the string belongs to in every case. `hp-active` appears only as a class/CSS name, not as a key.
5. **The 2D planner's quick-guide panel was not expanded.** Its full shortcut set is nonetheless recovered from its shipped i18n dictionary (`evidence/i18n_planner.json`: `top.*`, `help.*`, `hint.*`, `tool.*`) and from live `[title]`/`[data-tip]` attributes (`evidence/planner2d_keys.json`), which agree; but the rendered panel itself was not screenshotted, and the exact value set written for every `extension-floorplanner-*` control beyond `currently-editing`, `history` and `settings` was not individually captured.
6. **IndexedDB `hp-bim` record schema is unverified.** `projects` was empty (keyPath `id`, autoIncrement false) in every fresh session; I did not create/save a project, so the record fields, the v1→v2 migration, and the cross-tab lock mechanics are unknown. Contrast: the *2D* planner's record shape **is** known (`{objData, wallData, roomData}` snapshots).
7. **`puter_cache` and `puter.*` keys belong to a third-party library** (`js.puter.com`); their lifecycle beyond the observed boot reads/removes is out of scope and unverified.
8. **The static SVG cheat sheet is a single asset.** `textures/hotkeys.svg` has 9 `<text>` elements (8 labels) and no `inkscape:label`s; whether the site ships per-language variants was not checked (only that one URL was fetched). The *dynamic* cheat sheet built in `hp-ux` is the localised one.
9. **Server-side/session behaviour** (Cloudflare, ModSecurity 403 on `js.php`, the `visted` cookie's role in the `app.php` redirect) is unverified beyond: `app.php` returns the full 2 MB editor HTML whose first bytes are a JS redirect to `index.php`, and the page is served regardless of the cookies I sent.
10. **No image inspection.** `textures/hotkeys.svg` was parsed as XML text; screenshots were captured but not visually reviewed (no image input in this session). All visual-layout claims above come from DOM, accessibility trees, decoded strings or the SVG's own XML.
11. **Accessibility conformance was not re-tested** beyond reading the round-1 accessibility tree and the source-level focus guards; focus trapping in dialogs, full keyboard-only completion, and screen-reader flow through the Babylon canvas remain unverified. What *is* now established is that the shortcut dialog is real DOM (headings/buttons/`aria-label`) whose body is a non-textual `<object>`.
12. **Round-1 Unknowns #9 (exact grid/snap semantics)** is only partially closed: `Shift` = snap-to-grid while moving *and* drawing, `Alt` = no snapping at all while drawing, `G` = toggle grid snap in the 2D planner, and the 3D grid slider defaults to 0.125 m with 8 steps (`tabs_a13_help_accessibility.txt`). The per-axis/planar mechanics and whether the unit switch changes the snap step were still not exercised by drawing geometry.
