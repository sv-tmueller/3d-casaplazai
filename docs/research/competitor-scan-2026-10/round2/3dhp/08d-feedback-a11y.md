# 3D House Planner — status bar, toasts, undo/redo, errors/empty states, accessibility

Round-2 deep dive for **CasaPlazAI** workspace-UI redesign.
Job folder: `02-08d-ui-layout-onboarding-feedbac`. Round-1 report:
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/08-08-ui-layout-onboarding/report.md` (read-only, reused; evidence files there are referenced as `R1:`).

**Scope of this round.** The narrow question: status bar, toasts, undo/redo stack, error and
empty states, accessibility (ARIA roles, focus management, keyboard reachability) in
`https://www.3dhouseplanner.com/` (Babylon.js editor) and in its 2D planner iframe
`2D-Planner/index.php`.

**New evidence produced this round** (all under `evidence/` of this folder):
live Playwright probes of the running editor and of the planner *inside the iframe* (`probe_*.mjs`
+ `probe_*.out.json`), planner module sources pulled in-page (`evidence/planner-js/`, ~915 KB),
planner CSS (`evidence/planner-modern.css`, `evidence/planner-style.css`), plus round-1's i18n
dictionaries copied in for querying (`evidence/round1-i18n-app.json`, `evidence/round1-i18n-planner.json`).

**Evidence tags.** `OBSERVED` = seen in a live capture (named `probe_*.out.json`) or read in a
shipped file; `DOCUMENTED` = vendor says it; `INFERRED` = my reasoning.
Screenshots were captured but **not visually inspected** (no image input); every claim below comes
from DOM/JS/state, never from pixels.

---

## 1. Summary (5 bullets)

- **The status bar is informative but silent.** The editor's 30 px `footer.hp-statusbar` carries
  the selection readout, a 2D⇄3D sync chip, an m/ft toggle, FPS, Support and a language menu —
  yet the selection readout, the sync chip and the save-state chip have **no `aria-live`/`role`**,
  so a screen reader is never told what is selected or that the project saved
  (`OBSERVED`, `probe_f`/`probe_j`/`probe_e`).
- **Toasts are a real, well-built system** — `aria-live=polite` container, `role=status` toasts,
  `role=alert` + red skin for errors, ~3.5 s (error ~6 s) auto-dismiss, hard cap of 4 (oldest
  silently dropped), optional HTML icon markup. Gaps: severity is not distinguishable in the 2D
  planner (single grey pill), and an unused `.hp-toast-action` style hints at a never-finished
  "action in toast" (Undo) affordance (`OBSERVED`, bundle + CSS + live probes).
- **Undo/redo is fully built but discovered late.** `HPBIM.canUndo/canRedo` exist; after the first
  edit the top bar grows a `role="group" aria-label="History"` pair of icon buttons
  (`Undo (⌘Z)`/`Redo (⇧⌘Z)`, localised `aria-label`, disabled when the stack is empty) and each
  action toasts an icon + "Undone"/"Redone" (`role=status`). Round-1 saw only the pre-edit DOM and
  wrongly concluded no buttons exist — they are **runtime-built**, not in the static HTML
  (`OBSERVED`, `probe_n`, `probe_q`; fixes R1 §2.5 and its Unknowns).
- **Empty states are plain text and mostly good**: an empty project shows "The model is empty.
  Draw walls, open the 2D planner or ask the AI assistant to build something." inside the BIM model
  panel, the catalog has "Nothing here yet" + "Type at least 2 characters", the 2D planner offers
  Empty/Square/L-shape starters. But the editor's `ux.frameEmpty` ("Nothing built yet") toast did
  **not** reproduce in a live empty-scene Home press (`OBSERVED`, `probe_k`), contradicting R1.
- **Accessibility is half-done and inconsistent between the two apps.** Both apps set `lang`,
  provide many `aria-label`s, `role=dialog aria-modal`, tab/tabpanel semantics and `focus-visible`
  styles; the 2D planner even implements a roving-tabindex grid and named tool buttons. But in the
  editor **focus is not moved into dialogs, is not trapped there (Tab walks the background), and
  the background is never `inert`/`aria-hidden`**; the 3D canvas is a bare `tabindex="1"` (positive!)
  with no role or name; the 2D-planner iframe has no `title`; and Escape does not close the catalog
  drawer despite the in-app hint promising it (`OBSERVED`, `probe_d`, `probe_f`, `probe_j`,
  `probe_n`, `probe_h`).

---

## 2. Findings

### 2.1 Status bar

**Editor (`footer.hp-statusbar`).** Fixed, full width, `height: var(--hp-status-h)` = 30 px,
`z-index: 980`, translucent white with a top border, 12 px muted text (R1 CSS + `OBSERVED`
`probe_a`). Live DOM after boot (`probe_a`, `probe_e`):

`<button .hp-tools-toggle>Tools</button> · .hp-status-sel (ads_click icon + "Nothing selected") ·
spacer · .hp-status-sync "2D⇄3D" · button.hp-status-units "m" · .hp-status-fps "3 FPS" ·
button.hp-status-donate "Support" · .hp-lang (EN menu)`

- **Selection readout** `.hp-status-sel`: icon + text; the class flips to `hp-has-sel` (bold, full
  text colour) when something is selected. `HPUI.setSelectionInfo('PROBE: Wall 4.00 m')` updated
  the text and class exactly as expected (`OBSERVED`, `probe_f`).
  **It is not a live region**: `aria-live` and `role` are both `null` (`OBSERVED`).
- **2D⇄3D sync chip** `.hp-status-sync`: `title="Live 2D ⇄ 3D sync on"`, green when live
  (`--hp-ok`) vs muted `.hp-off`, `cursor:pointer`. State is conveyed by **colour + title only**;
  the visible label "2D⇄3D" never changes and there is no `aria-pressed`/`aria-label`
  (`OBSERVED` live + CSS `.hp-status-sync{color:var(--hp-ok)}` / `.hp-off{color:var(--hp-muted)}`).
- **Units toggle** `button.hp-status-units`: text `m`/`ft`, labelled
  *"Units of the 3D and of the 2D plan: click to switch meters / feet"* in both `title` and
  `aria-label`; `data-unit="m"`. The accessible name describes the **action**, not the current
  state (`OBSERVED`, `probe_f`/`probe_i`).
- **FPS readout** `.hp-status-fps`: plain text "3 FPS" — no label, no live region; hidden at
  `≤700 px` together with the save chip (`OBSERVED`, CSS `@media (max-width:700px)`).
- **Support** `button.hp-status-donate`: `aria-haspopup="dialog"`, opens `#hpDonateDialog`; the
  label text "Support" is hidden at narrow widths, leaving an icon with an `aria-label`
  (`OBSERVED` + R1 CSS).
- **Language menu** `.hp-lang`: button `#hpLangBtn` with `aria-haspopup="menu"`,
  `aria-expanded`, `aria-controls="hpLangMenu"`, `aria-label="Language: English"`; the menu is
  `role="menu"` opened **upwards**, items `role="menuitemradio"` with `aria-checked` and
  `tabindex="-1"`, each language name carrying `lang="pt"` etc. Opening moves focus to the
  current item; `ArrowDown` moves to the next; `Escape` closes and returns focus to `#hpLangBtn`
  (`OBSERVED`, `probe_d`).
- **Runtime-injected `button.hp-tools-toggle`** (handyman icon + "Tools"), inserted by
  `hp-ux.js` to collapse the tool dock; it carries **no `aria-label`, no `aria-pressed`, no
  `title`** (`OBSERVED`, `probe_f`). It is the only status-bar control with no accessible name
  beyond its text.
- The editor status bar is **not** a landmark: `footer` has no `role`, and the whole bar is
  `display:none` in `@media print` (`OBSERVED`).

**2D planner (`div.fp-statusbar`, inside the iframe).** Fixed bottom strip with, left→right:
`.fp-hint` (a static one-line instruction), `#extension-floorplanner-boxinfo.fp-message`
(dynamic action message), spacer, `#extension-floorplanner-areaValue.fp-area`,
`#extension-floorplanner-mousePosition.fp-coords` (two `<span title="Distance east/west…">`
readouts), unit label (`OBSERVED`, `probe_g`/`probe_k`; CSS `.fp-modern .fp-statusbar` at
`evidence/planner-modern.css:411`).

- The `.fp-message` node — which is where per-action guidance ("Draw a wall first", "Select a
  room", "Wall added") would go — was **empty in every probe** and has **no `role`/`aria-live`**
  (`OBSERVED`). The same strings exist in i18n (`msg.*`, 44 keys, `evidence/round1-i18n-planner.json`).
- Only the mouse-coordinate readout and the level readout are live: `aria-live="polite"` on
  `#extension-floorplanner-mousePosition` and `.fp-level-value`; `#extension-floorplanner-boxinfo`
  is not (`OBSERVED`).
- The default `.fp-hint` text is *"Click an item to edit it · drag the empty plan to move the view ·
  scroll to zoom"* — mouse-worded (same class of problem R1 found for the whole app).

`INFERRED`: because the selection/action feedback channels are visual-only in both apps, the
status bar is effectively decoration for assistive tech; only the coordinate/level readouts announce.

### 2.2 Toasts / notifications

**Editor (`div.hp-toasts`).** Container appended to `body` at boot with `aria-live="polite"` and
**no `role`**; CSS: centred above the status bar
(`bottom: calc(var(--hp-status-h) + 16px)`), `z-index:2000`, `pointer-events:none` on the container
and `auto` per toast, `max-width: min(520px, calc(100vw - 32px))`, dark `#0f172a` skin, fade +
8 px slide (`OBSERVED` live + CSS `hp-ui.css:272-276`).

The one function behind it is `HPUI.toast(...)` (also exposed as `window.M.toast` for a
Materialize compatibility shim). Signature reconstructed from the bundle
(`js/editor_hp-ui.js`, `_0x4e7e2c`) and confirmed live (`probe_a`, `probe_i`, `probe_j`):

| Input | Result |
|---|---|
| `HPUI.toast('text')` | `div.hp-toast` with `role="status"` |
| `HPUI.toast('text','error')` | adds `hp-toast-error`, `role="alert"` |
| `HPUI.toast('text','ok')` | adds `hp-toast-ok` |
| `M.toast({message, classes:'red'})` | text from `message`, and `classes` containing `red` ⇒ error skin |
| object form | `{ message \| text, type, timeout \| duration, action? }` (timeout overrides duration) |

Confirmed behaviour (`OBSERVED`):

- **Roles:** `role="status"` normally, `role="alert"` for the error skin (`probe_a`, `probe_i`).
- **Durations** decoded from the bundle: `error ? 0x1770 : 0xdac` ⇒ **6000 ms / 3500 ms**,
  overridable. Live: all toasts were removed within ~4 s of a non-error batch (`probe_i`).
- **Cap of 4:** the function loops `while (container.children.length > 4) removeChild(children[0])`
  — oldest silently discarded. Live: after pushing 10, the container held exactly 4, containing
  only "stack 4"…"stack 7" (`OBSERVED`, `probe_i`).
- **Icon markup is injected as HTML**, not text. The real undo toast is
  `<div class="hp-toast hp-visible" role="status"><i class="material-icons" …>undo</i><span>Undone</span></div>`
  and the interceptor log shows the raw HTML string passed to `HPUI.toast`
  (`OBSERVED`, `probe_q`). So the toast body is not plain text; a text-node filter is applied to
  interpolated values in the code, but literal HTML is trusted.
- **Dead affordance:** `.hp-toast-action` is styled (`hp-ui.css:542`) but no code path constructs
  it — the `action` object I passed through was ignored (`probe_i`, `probe_j`).

**2D planner (`div.fp-toast`).** A **single** pill: `role="status"`, **no `aria-live`**,
`pointer-events:none`, dark `#111827` pill (`border-radius:999px`), fixed above the planner status
bar, `z-index:60` in-frame (`OBSERVED` DOM + `evidence/planner-modern.css:527-543`).

- Text is written via `.innerText` and the element is shown by adding `fp-visible`, then removing it
  after `0x898` = **2200 ms** (`FloorplanUI.toast`, `evidence/planner-js/planner_uiShell.js`).
- Exposed as `window.FloorplanUI.toast(text)` (also `FloorplanUI.help(bool)`,
  `FloorplanUI.refresh()`), which is what the planner's own UI calls (e.g. the Save button handler
  calls `toast(t('msg.planSaved'))`) (`OBSERVED` in the module + `probe_n`).
- **No severity variants** exist for `fp-toast`; errors (`rs.texturesError = "The textures could not
  be loaded."`, `report.normsError = "The rules of the country could not be loaded."`) use the same
  neutral pill (`OBSERVED` i18n + CSS grep, `INFERRED` for the visual result).
- The planner i18n has 44 `msg.*` strings intended for this channel: `planSaved`, `gridOn/gridOff`,
  `snapOn/snapOff`, `wallAdded`, `elementAdded`, `objectAdded`, `measureAdded/Deleted`,
  `openingCopied/Pasted`, `arcAdded`, `snappedToWall`, `noSeparation`, `pasteNoRoom`, …
  (`OBSERVED`, `evidence/round1-i18n-planner.json`).

### 2.3 Undo/redo stack

**Editor (3D).** `window.HPBIM` exposes `undo()`, `redo()`, getters `canUndo`/`canRedo`, and
`undoData()`/`redoData()` (`OBSERVED` live enumeration, `probe_b`). The state lives in the editor
bundle as

```
{ cur:null, undo:[], redo:[], timer:0, inputSeq:0, mark:0, applying:false, terrainDirty:false,
  cache:new Map(), MAX:0x3c }   // MAX = 60
```

(`OBSERVED` in `js/editor_hp-bim.js`). `undo()` pops the previous snapshot, re-applies it to every
mesh, pushes the current snapshot onto `redo`, marks the project dirty, updates the history buttons
and calls the toast helper with an `undo`/`redo` icon + `Undone`/`Redone`
(`OBSERVED`, `_0x858c3d` / `_0x3251a8` in the bundle).

- The **strings tell the same story**: `ui.undo/redo/undone/redone/history` and `bim.undo/redo`
  exist, and a grep of the 29 shipped modules shows several of them (`bim.undone`,
  `bim.redone`, `ui.undone`, `ui.redone`, `ui.history`, `ux.frameEmpty`) referenced **nowhere in
  JS** — dead i18n left behind by the Materialize-era UI, matching the CSS-only
  `.hp-toast-action` (`OBSERVED` grep over `js/editor_*.js`).
- **Buttons are built at runtime into the top bar**, inside `.hp-topbar-left`, right after the
  save-state chip:

  ```html
  <div class="hp-history" role="group" aria-label="History">
    <button class="hp-icon-btn hp-history-btn" title="Undo (⌘Z)" aria-label="Undo" …>undo</button>
    <button class="hp-icon-btn hp-history-btn" title="Redo (⇧⌘Z)" aria-label="Redo" disabled>redo</button>
  </div>
  ```

  The accelerator in the `title` is platform-detected (`Mac|iPhone|iPad` → ⌘, else Ctrl). The
  buttons are enabled by `canUndo`/`canRedo` and **disabled when a stack is empty** (`OBSERVED`,
  `probe_n`, `probe_q`; CSS `hp-ui.css:103-105`). They are **absent from the static served HTML** —
  which is why R1 missed them.
- **Live behaviour:** drew a rectangle with the wall tool → Undo enabled; clicking the button
  produced `canUndo:false, canRedo:true` and the toast
  `<i>undo</i><span>Undone</span>` as `role=status`; `Ctrl+Y` produced the equivalent "Redone"
  toast (`OBSERVED`, `probe_n`, `probe_q`).
- **Second surface:** the BIM panel header (`HPBIM.openPanel('model')`) repeats a
  `data-undo="undo"` / `data-undo="redo"` pair with `title="Undo (Ctrl+Z)"` /
  `"Redo (Ctrl+Shift+Z)"`, `aria-label` "Undo"/"Redo", `disabled` when empty (`OBSERVED`, `probe_q`).
- **Shortcuts:** `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Y` and `Ctrl/Cmd+Shift+Z` redo, handled at document
  level with guards that skip `contentEditable`, `TEXTAREA`/`SELECT`, and `INPUT` unless it is
  checkbox/radio/range/button/color — so typing in the project-name field keeps native undo
  (`OBSERVED`, bundle + `probe_f` where `Ctrl+Z` inside the name input produced no app toast).
- **Empty-stack presses are silent:** `Ctrl+Z` / `Ctrl+Y` with nothing to undo do nothing — no
  toast, no console error (`OBSERVED`, `probe_f`).
- **Stack depth 60**, no grouping evidence: the state has a `timer`, and `markDirty` debounces
  autosave ~1.3–2 s, but I did not verify whether a drag coalesces into one history entry
  (`INFERRED`, see §4).
- **The 3D history does not see the 2D plan.** The 2D planner is loaded lazily as an **iframe
  overlay** (`#floorplanFrameContainer` → `<iframe id="floorplanIframe"
  src="2D-Planner/index.php?lang=en">`, injected by `hp-editor.js` when the "2D plan" segment is
  chosen) and it keeps its **own** `HISTORY` (`OBSERVED`, `probe_e`, `probe_l`). After drawing in
  2D and returning to 3D, `HPBIM.canUndo` stayed `false` (`OBSERVED`, `probe_l`).

**2D planner.** Real stack: global `HISTORY` (array of snapshots) + `HISTORY_LIMIT`, functions
`floorplanner_undo()` / `floorplanner_redo()`, header buttons `#extension-floorplanner-undo` /
`-redo` initially carrying `.extension-floorplanner-disabled` and titles *"Undo (Ctrl+Z)"* /
*"Redo (Ctrl+Y)"* (`OBSERVED`, `rea/2dplanner.html`, `evidence/planner-js/planner_planner-main.js`).

- Keyboard: `Ctrl+Z` undo, `Ctrl+Y` redo, plus `Ctrl+Shift+Z`; a guard skips the handler when focus
  is in an input. New edits after an undo truncate the redo tail (`HISTORY.splice(index, …)`),
  and the redo button is disabled again on a fresh edit (`OBSERVED` in the bundle).
- The stack is **persisted to `localStorage['extension-floorplanner-history']`** (with `index` and
  `length`), and restored on load (`floorplanLoad(HISTORY[index]-1,'boot')`); a parse failure is
  caught, the key removed and the plan cleared — with `console.error` but **no user-visible error**
  (`OBSERVED`, bundle).
- Undo/redo themselves produce **no toast**; only the enable/disable state of the two buttons
  changes (`OBSERVED`, `probe_l`/`probe_m`). The planner's toast channel is used for other actions.

### 2.4 Error states

**Strings.** The editor dictionary has 26 error/failure keys
(`evidence/round1-i18n-app.json`): `ai.error`, `ai.serverError`, `bim.importFail`,
`bim.saveFail`, `bim.storageFail`, `bim.recoveryFail`, `bim.restoreFailed`, `bim.scriptFail`,
`bim.confirmPartialSave`, `io.serverError`, `io.exportFail`, `io.compFail` (a warning),
`fx.pasteError`, `fx.imageFailed`, `render.ai.error`, `render.pt.error`, `share.fail`,
`share.openFail`, `copy.fail`, `ar.fail`, `ar.page.failed`, `sun.locateFail`, `sun.mapFail`,
`cat.searchFailed`, `eff.*` loading errors (`OBSERVED`, dictionary).

**Presentation.** Errors are surfaced through `HPUI.toast(message,'error')` (red skin +
`role=alert`) and/or `console.error`. Example from the bundle: an import failure does
`console.error(...)` and `toast(t('bim.importFail',{e:...}),'error')` before re-throwing
(`OBSERVED`, `js/editor_hp-bim.js`). There is **no error log, no status-history and no retry
button**; toasts are the whole error surface and they vanish after ~6 s.

**Storage errors.** `bim.storageFail = "Browser storage error: {e}"` is used when IndexedDB is
unavailable — the code checks `window.indexedDB` and, if missing, rejects with an error that is
then toasted; when a listing call fails it re-renders the message asynchronously
(`OBSERVED`, bundle). `bim.recoveryFail` covers "the recovery copy could not be saved in this
browser: {e}"; `bim.restoreFailed` covers a partial restore ("{n} element(s) could not be
restored. The stored project is kept as it was: your changes go to a recovery copy…").

**Loading / blocking.** `#modal0` (`hp-dialog hp-dialog-loading hp-dialog-solid`,
`data-dismissible="false"`, `role=dialog aria-modal=true`) stays in the DOM with
`aria-hidden="true"` after boot and its card is `role="status" aria-live="polite" tabindex="-1"`
(`OBSERVED`, R1 DOM + `probe_b`). There is **no `aria-busy`** anywhere in the app
(`OBSERVED` grep: 0 occurrences).

**Storage mechanism (resolves R1 §4).** The 3D editor stores projects in **IndexedDB**, database
`hp-bim` version 2, with two object stores (one keyed by `id`, snapshots `{id,name,created,updated,
thumbnail,size,autosave}`). `indexedDB.databases()` after boot returns `hp-bim` and
`puter_cache` (`OBSERVED`, `probe_o`). `localStorage` holds only the 2D planner's
`extension-floorplanner-currently-editing` and its history; the editor plan is **not** in
localStorage. The Materialize-era text "in this browser" is accurate but imprecise.

**Recovery.** `HPBIM.listProjects()` returns projects; an autosave entry is stored under the id
`__recovery__` with `autosave:true` — observed after a single edit even without an explicit save
(`OBSERVED`, `probe_q`). The `bim.recover` / `bim.recoverBtn` prompt ("A project from your last
session was found." / "Restore") exists in the dictionary and a `sessionStorage` handoff key
`hp-resume-after-reload` is written by `prepareReload()`, but **I could not make the prompt appear**:
reloading within the same browser profile lands on the *blocking* "Project settings" modal again,
and after "Start designing" no recovery UI appeared (`OBSERVED`, `probe_p`, `probe_q`, `probe_r`).
See §4.

### 2.5 Empty states

**Editor.**
- **Empty model**: `bim.empty = "The model is empty. Draw walls, open the 2D planner or ask the AI
  assistant to build something."` In a fresh project, `HPBIM.openPanel('model')` renders exactly
  that text in the panel body (`OBSERVED`, `probe_p`). The panel is `.hp-panel.hp-open`,
  `role="dialog"`, `aria-label="BIM model"`, `tabindex="-1"` — but opening it does **not** move
  focus into it (`OBSERVED`: `focusInside:false`, active element was the planner iframe).
- **Frame-all**: `ux.frameEmpty = "Nothing built yet"` exists for the Home/Frame-all action.
  R1 recorded this as observed; my live probe pressed `Home` with the canvas focused on the same
  empty scene and saw **no toast at all** (`OBSERVED`, `probe_k`). The string is real but the
  trigger condition is unresolved (§4).
- **Catalog**: search results area has a live status `.hp-results-status` (`aria-live=polite`,
  `role` absent) and gates on "Type at least 2 characters"; `cat.empty = "Nothing here yet"`,
  `cat.searchFailed = "The search failed. Check your connection and try again."`; zero root
  categories show as an empty list rather than a message (`OBSERVED`, R1 DOM + i18n).
- **Start card**: `.hp-start` (4 tiles, "Draw a plan, describe a house to the AI or open something
  you already have. Everything stays in this browser.") is appended to `body` at boot, closable
  via `.hp-start-close`, dismissal persisted in `sessionStorage` (`OBSERVED`, `probe_a`,
  `probe_c`).
- Other empty strings: `render.pt.empty`, `eff.empty`, `brush.empty`, `tour.empty`,
  `bim.bulkNothing`, `io.nothing`, `lin.nothingFound`, `bim.noProjects` ("No project saved yet."),
  `bim.bcfNothing` (`OBSERVED`, dictionary).
- The BIM panel's Projects list renders the store contents; with nothing saved it shows the
  `bim.noProjects` copy (`INFERRED` from the string + render path; I only ever saw one entry, in
  `probe_p`/`probe_q`).

**2D planner.** `newPlan.*` offers three starters — **Empty plan / Square room / L-shaped plan** —
inside a proper modal; an empty plan shows the static status-bar hint plus a dismissible
`.fp-welcome` card ("New here? Walls (W), doors (D), objects (F)… see all tools and shortcuts."
+ "Quick guide"), gated by a `localStorage` flag (`OBSERVED`, `rea/2dplanner.html`,
`evidence/planner-js/planner_uiShell.js`, `probe_k`).

### 2.6 Accessibility

#### 2.6.1 Editor — what is in place (`OBSERVED` unless noted)

- `<html lang="en" dir="ltr" class="hp-modern">`; language names carry `lang` attributes.
- Decorative icons are consistently hidden: **280** `aria-hidden="true"`.
- **52** `aria-label`, **15** `data-i18n-aria` (labels are localised on open by `applyI18n`),
  **9** `aria-labelledby`, **9** `role="dialog"` + **9** `aria-modal="true"`, **9** `role="status"`,
  **1** `role="tooltip"`, **2** `aria-haspopup`, **1** `aria-controls`, **1** `aria-expanded`,
  **7** `aria-pressed`, **5** `role="tab"` / **5** `role="tablist"` / **5** `role="tabpanel"`,
  **10** `aria-checked`, **5** `aria-selected`, **9** `aria-live`.
- **Tabs** (tool card, catalog, and the `upload`/`heightmap`/`terrain` mode switches) use
  `role=tablist` → `role=tab` with `aria-selected` and `tabindex` 0/−1 roving. Arrow keys work on
  the tool card: `ArrowRight` moved focus `tooltab → extensiontab` with `aria-selected=true` and
  `ArrowLeft` moved it back (`OBSERVED`, `probe_i`). **Home/End do not move focus** and there is no
  `aria-controls`/`aria-labelledby` linking tabs to their panels (`OBSERVED`, `probe_i`;
  5 `tabpanel`s but the panels have no `aria-labelledby`).
- **Dialogs**: each `role=dialog` is `aria-modal=true` with an `aria-labelledby` title, an overlay,
  body class `hp-dialog-open`, a `tabindex="-1"` card and a `keydown` handler that wraps Tab from
  the last to the first focusable **when focus is inside the card**
  (`OBSERVED` in bundle + `probe_d`).
- **Focus restore on close**: `close()` returns focus to the element that was active when the
  dialog opened (observed: after closing Help with Escape, focus returned to `#hpToolHelp`;
  `aria-hidden` back to `true`) (`OBSERVED`, `probe_d`/`probe_c`).
- **Focus visibility**: 13 `:focus-visible` rules — accent-coloured 2 px outlines on tools, icon
  buttons, segmented buttons, status-bar buttons, range thumbs, radio/switch/file labels, plus an
  inset ring for language menu items (`OBSERVED`, `hp-ui.css`).
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` removes transitions on dialogs,
  tooltips and toasts (`OBSERVED`, `hp-ui.css:1010`).
- **Keyboard shortcuts** (document-level): Home, F, 1/2/3, Shift (grid snap), Ctrl+C/V, Ctrl+click,
  Del, Ctrl+Z/Y, Esc, Ctrl+S, Ctrl+K, WASD/arrows in Walk, wall-tool Enter/Backspace/Tab — from the
  generated help list in `hp-ux.js` and the `ux.keys.*` strings (`OBSERVED`; R1 §2.6).

#### 2.6.2 Editor — what is missing (`OBSERVED`)

- **Focus is not moved into a dialog on open.** `HPUI.dialog(...).open()` records the previous
  active element and *intends* to focus `[autofocus]` or the card in a `requestAnimationFrame`
  callback, but the move does not take effect: clicking Help left focus on the background
  `#hpToolHelp` both immediately and after 600 ms (`inHelp:false`); Support left focus on the
  background `.hp-status-donate` (`inDonate:false`); calling the documented
  `HPUI.dialog(el).open()` directly also left `activeElement` outside the dialog; and the setup
  modal opened with focus on `BODY`. The dialog markup therefore asserts modality the runtime does
  not implement on open (`OBSERVED`, `probe_d`, `probe_s`). Focus *restore* on close does work
  (Help closed with Escape returns focus to `#hpToolHelp`), so only the open half is broken.
- **Focus is not trapped.** With the Help dialog open, 14 consecutive `Tab` presses walked the
  *background* chrome and never entered the dialog:
  `#hpToolFullscreen → status-bar buttons → #hpLangBtn → .hp-start-close → .hp-start-btn×4 →
  #renderCanvas → two range inputs → .hp-btn → …` (`OBSERVED`, `probe_d`). The `Tab` wrap
  only activates once focus is already inside the card.
- **Background is never made inert.** While `#hpDonateDialog` was open, the canvas, top bar,
  status bar and tool dock all remained focusable with `inert=false` and no `aria-hidden`;
  `inert` appears **0 times** in the DOM, CSS and JS (`OBSERVED`, `probe_j`; 0 grep hits).
- **Escape does not close the catalog drawer or the BIM panel**, despite `ui.hint` saying
  "Esc: Close panels and menus": `#mySidebar` stayed `hp-open`, `aria-hidden=false`, focus stayed
  on `#hpToolCatalog`; `#hpBimPanel` stayed `display:flex` (`OBSERVED`, `probe_j`, `probe_p`).
  Escape *does* close the modal dialogs and the language menu.
- **The 3D canvas is not accessible.** `<canvas id="renderCanvas" data-engine="Babylon.js v6.38.0"
  tabindex="1" touch-action="none">` — a **positive tabindex** (the only one on the page), no
  `role`, no `aria-label`, no `title`, no keydown handler on the element (`OBSERVED`, `probe_f`,
  `probe_j`). There is therefore no ARIA representation of the scene, no announced selection
  (status bar is silent), and the canvas is the first Tab stop of the page.
- **Segmented view control is a plain button group**: the 3D/Walk/Top/2D buttons in `#hpViewSeg`
  have no `role`, no `aria-pressed`, no `aria-selected`; the active one is `hp-active` class only
  (`OBSERVED`, `probe_e`).
- **Save-state chip is silent**: `.hp-save-state` (".hp-state-unsaved/-saving/-saved", title
  "Unsaved changes"/"Saving…"/"Saved in this browser") has no `role` and no `aria-live`
  (`OBSERVED`, `probe_f`/`probe_j`).
- **Toasts are the only announced transient feedback**, but the container repeats the semantics:
  `aria-live=polite` on `.hp-toasts` *and* `role=status` per toast (double announcement is likely
  in some AT configurations) (`OBSERVED`).
- **No skip link** (only `ux.tour.skip` matches "skip") and **no landmark roles**: no `<main>`,
  `role="main"`, or `role="navigation"`; `nav` elements do carry `aria-label` on the catalog
  breadcrumb (`OBSERVED`, R1 DOM).
- Hover-only tooltips: `#hpTooltip` is `role="tooltip"` and positioned from `data-tip` on hover;
  there is no `aria-describedby` (0 occurrences) tying it to its trigger, and it is not shown on
  focus (`OBSERVED`, R1 + `probe_j` where it was display:block but empty).

#### 2.6.3 2D planner (iframe) — what is in place (`OBSERVED`, live in-frame probes)

- Positives: `<html lang="en" dir="ltr">`; **87** `aria-label`s; roles: 2 tablist / 19 tab /
  1 tabpanel, 5 radiogroup / 72 radio, combobox/listbox, 2 menu + 6 menuitem, 1 toolbar,
  2 status, **1 `role="alert"`** (`#extension-floorplanner-plan-exists-warning`), 9 dialog,
  2 document, 1 tooltip (`probe_g`).
- **Tool buttons are named with their shortcuts**: `Select (V)`, `Walls (W)`, `Arc wall (A)`,
  `Divider (P)`, `Joint (J)`, `Doors (D)`, `Windows (N)`, `Stairs (S)`, `Objects (F)`,
  `Rooms (R)`, `Text (T)`, `Measure (M)`, `Layers (L)`.
- **Roving-tabindex grid**: `rsRovingKeys()` implements ArrowLeft/Right (±1), ArrowUp/Down (±row
  columns via `rsGridColumns`), Home, End for a grid of items — the exact pattern the editor's own
  tabs lack (`OBSERVED`, `evidence/planner-js/planner_planner-main.js`).
- **Help is a real HTML dialog**: `.fp-help` has `role="dialog"` and
  `aria-label="Shortcuts and help"`, containing a `Quick guide`, a "Start in 3 steps" list and a
  shortcut table with `<kbd>` elements; opened from the `.fp-welcome-open` "Quick guide" button.
  There is no longer a single SVG image (`OBSERVED`, `probe_n`, `probe_k`, CSS).
- **Live regions**: `#extension-floorplanner-mousePosition` (polite), `#extension-floorplanner-wallCurveInfo`
  ("Straight wall"), `#extension-floorplanner-bboxStepsVal`, `#extension-floorplanner-textureLoading`
  (`role=status`), `.fp-level-value` (polite) (`OBSERVED`).
- `focus-visible` outlines on buttons, chips, steppers, plan-type cards, switches; reduced-motion
  blocks; print hides top/status bars, tooltip, toast and help (`OBSERVED`, planner CSS).
- The new-plan modal is `role=dialog aria-modal=true tabindex=-1 aria-labelledby=…`, with a
  `role=document` dialog body and the `role=alert` duplicate-name warning (`OBSERVED`, DOM).

#### 2.6.4 2D planner — what is missing (`OBSERVED`)

- **The iframe has no `title`** (`<iframe id="floorplanIframe" src="2D-Planner/index.php?lang=en"
  style="…">`), so assistive tech announces an unnamed frame — a hard WCAG 2.4.1/4.1.2 failure for
  the "2D plan" mode.
- **`.fp-help` has no `aria-modal`**, focus is not moved into it (opened via the Quick-guide button:
  `active=BODY`, `inside=false`; only one focusable, the close `.fp-topbtn`), and pressing
  `Escape` left it open (`display:flex`) (`OBSERVED`, `probe_n`).
- **The dynamic action message is not announced**: `.fp-message` (`#extension-floorplanner-boxinfo`)
  has no `role`/`aria-live` and was empty in every capture (`OBSERVED`).
- **`.fp-toast` has no `aria-live`** and no error variant; a single slot means a rapid second
  message silently replaces the first (`OBSERVED` module + CSS).
- **Tooltips are hover-driven** (`mouseover`/`mouseout` on `[data-fp-tip]`); the `role=tooltip`
  element is not focus-synced (`OBSERVED` module).
- Disabled undo/redo are real `<button disabled>` at runtime (Playwright reported "element is not
  enabled"), but the visible `title` is dropped when `uiShell` rebuilds the buttons
  (`title:null` while `aria-label` remains "Undo (Ctrl+Z)") (`OBSERVED`, `probe_g`, `probe_h`).
- Keyboard `?` did not open the help in my capture and `Escape` did not close it; the module shows
  a global keydown guard for `?` and a `Space` pan handler, so the key path may depend on the
  canvas having focus or a mode flag (`OBSERVED`+`INFERRED`; see §4).
- No skip link; no landmark roles inside the planner besides `role=toolbar` on one strip.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort (V/E). Each ties to a finding and, where relevant, to the CasaPlazAI plan
schema (rooms/walls/elements at `casaplazai-schema.md`). Effort assumes the Vite/TS/Three.js
single-page app.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Make the status-bar selection readout a live region**: `role="status" aria-live="polite"` on the selection summary, updated whenever `selectedId` changes ("Wall 4.00 m selected", "Nothing selected"). One attribute + one state hook. | §2.1 | High | Low |
| 2 | **Put undo/redo in the chrome with state**: icon buttons with `aria-label="Undo (Ctrl+Z)"`, real `disabled` at stack ends, a `role="group" aria-label="History"` wrapper, and a toast "Undone (2 items)" with an inline **Undo** action (finish the affordance 3D House Planner styled but never built). Back it with a snapshot stack over `rooms[]`/`walls[]`/`elements[]` (cap ~60, coalesce a drag into one entry). | §2.3 | High | Low–Med |
| 3 | **Toast contract**: `role="status"` for info, `role="alert"` (assertive) for errors, ~3.5 s info / ~6 s error, cap 4 with FIFO eviction, and a `{ text, type, timeout, action }` signature. Keep the live region on the container *or* per toast, not both, to avoid double announcements. | §2.2 | High | Low |
| 4 | **Fix the dialog focus contract**: on open, move focus to the card/first control; keep focus trapped (cycle Tab/Shift+Tab); on close restore to the opener; set `inert` (or `aria-hidden`) on the background shell while a dialog is open. Do the same for the inspector/panel overlays. | §2.6.2 | High | Med |
| 5 | **Kill the positive tabindex / name the 3D canvas**: `tabindex="0"` and a `role="img"` (or `application`) with a visually hidden live description of camera mode and selection; provide a DOM mirror of the plan (a simple element list) as the accessible alternative to the 3D scene. | §2.6.2 | High | Med |
| 6 | **Announce save state**: make the "Unsaved / Saving… / Saved in this browser" chip `role="status"` so autosave is audible; keep it visible at all widths (or move it into the status bar). | §2.1/2.6.2 | Med–High | Low |
| 7 | **Empty states from state, not vibes**: when `rooms.length === 0` show the start card and disable Furnish/Export tool entries; render the empty message as real DOM text (not a toast that vanishes), mirroring `bim.empty` copy; make "Frame all" answer "Nothing built yet" deterministically. | §2.5 | Med–High | Low |
| 8 | **Give the 2D-plan mode one shell and one feedback system** instead of an overlay iframe: a titled route/mode (`title` on any frame if you keep one), one history stack shared with 3D, one toast queue, one live region. | §2.3/2.6.4 | High | Med |
| 9 | **Complete the WAI-ARIA tabs pattern** in the tool card: `aria-controls` + `aria-labelledby` for each `tabpanel`, and Home/End in addition to Left/Right (the planner's `rsRovingKeys` is a ready-to-port reference for grid lists). | §2.6.1 | Med | Low |
| 10 | **Segmented control semantics**: model Plan/3D/Walk as a `radiogroup` (or buttons with `aria-pressed`) so the active mode is announced, not just coloured. CasaPlazAI's 3-mode redesign maps 1:1. | §2.6.2 | Med | Low |
| 11 | **Turn tooltips into accessible hints**: wire `data-tip` text through `aria-describedby` and show the tooltip on `focus`, not only hover; add a per-tool hint line (what Enter/Backspace/Esc do *now*). | §2.6.1/2.6.4 | Med | Low–Med |
| 12 | **Escape semantics that match the hint**: make Esc close every transient surface (catalog drawer, inspector, menus, toasts) and return focus to the trigger — 3D House Planner promises this in its own hint text and fails. | §2.6.2 | Med | Low |
| 13 | **Harden the storage/error path**: catch `QuotaExceededError`/storage-disabled, show a persistent, dismissible banner (not a 6 s toast) with the raw reason, and offer "Download a copy" as the escape hatch; for localStorage-only CasaPlazAI add a crash-recovery dialog with Restore/Discard. | §2.4 | High | Med |
| 14 | **Do NOT copy**: positive `tabindex` on the canvas, `role=dialog` without real focus trapping or `inert`, the silent selection/save chips, the unnamed iframe, the single-slot planner toast with no severity, and the dead `.hp-toast-action` CSS. | §2.2/2.6 | High (avoid) | Low |

---

## 4. Unknowns

- **Recovery prompt never reproduced.** `HPBIM.listProjects()` showed an autosave entry id
  `__recovery__`, and `bim.recover`/`bim.recoverBtn` plus the `hp-resume-after-reload` session key
  exist, but a reload always re-opened the blocking "Project settings" modal and no Restore UI
  followed (`probe_p`/`probe_q`/`probe_r`). The condition that surfaces it (crash, viewer link,
  "resume without setup"?) is unresolved.
- **The `ux.frameEmpty` string is dead i18n** (`ux.frameEmpty -> 0 modules`), which explains why
  R1's claim does not reproduce: the message exists in the dictionary but nothing in the shipped
  JS emits it (`OBSERVED`, grep over `js/editor_*.js` + `probe_k`). Treat R1's §2.5 empty-state
  bullet as superseded here.
- **Undo grouping / stack depth**: `MAX = 60` snapshots is read from the bundle, but whether a
  drag or a multi-wall rectangle commits as one entry, and how `undoData`/`redoData` (data-only
  histories) differ from the geometry stack, were not exercised.
- **2D planner direct interaction failed in my captures**: synthetic canvas clicks never produced a
  wall in `WALLDATA` (`WALLDATA` was undefined in the iframe scope, `HISTORY.length` stayed 0), so
  the planner undo/redo *behaviour* is evidenced by source (`floorplanner_undo/redo`, splice,
  localStorage persistence) rather than by a successful live edit.
- **`?` to open the planner help** did not visibly trigger; `FloorplanUI.help(true)` works from the
  console and the Quick-guide button works, but the keyboard path and the claim that "Esc closes
  it" could not be confirmed (Esc left it open in `probe_n`).
- **No screen-reader run**: the announcement order of `.hp-toasts[aria-live]` + per-toast
  `role=status`, and the experience of the positive-tabindex Babylon canvas, are reasoned from
  markup only (no AT in this environment).
- **Colour/contrast not measured**: the model has no image input and I did not compute contrast;
  the status bar is 12 px `--hp-muted` on 94 % white, toasts are white on `#0f172a`, error skin
  `#991b1b`, ok skin `#065f46` (`OBSERVED` CSS, contrast unverified).
- **Editor strings `bim.undone/bim.redone`** ("Undone ({n} element(s))") are in the dictionary but
  the runtime toast uses only "Undone"/"Redone" with an icon and no count (`OBSERVED`, `probe_q`) —
  whether the count variant is used elsewhere is unverified.
- **Mobile/AT at ≤560 px**: the status bar hides the save chip and FPS by CSS; I did not probe
  whether those nodes leave the accessibility tree cleanly or whether the wrapped top bar remains
  operable.
- The 2D planner's `#extension-floorplanner-plan-exists-warning` `role=alert` and the
  `newFileModal` focus behaviour were inspected statically only; the modal's open-focus behaviour
  was not live-verified beyond seeing focus land in its name input after an unrelated Escape.

---

## Appendix — evidence inventory (this job folder)

| File | What it is |
|---|---|
| `evidence/round1-i18n-app.json`, `evidence/round1-i18n-planner.json` | Copies of R1's extracted dictionaries (1678 + 905 keys) for querying |
| `evidence/probe_a.out.json` … `probe_r.out.json` | Live Playwright probe outputs (editor + in-iframe planner) |
| `evidence/probe_a.mjs` … `probe_r.mjs` | The probe scripts (persistent contexts under `evidence/profile*`) |
| `evidence/shots/*.png` | Screenshots captured but not visually inspected |
| `evidence/planner-js/planner_*.js` | The 11 planner modules fetched in-page (js.php needs the page context; plain curl is 403) |
| `evidence/planner-modern.css`, `evidence/planner-style.css` | Planner stylesheets (toast/status/help/focus/reduced-motion) |

Key live probes this round: `probe_e` (2D plan iframe + segmented control), `probe_d` (dialog
focus/ARIA/language menu), `probe_f` (status bar, live regions, save chip, canvas), `probe_i`/`probe_j`
(toast severity/stacking, tabs, donate, background inertness, catalog Esc), `probe_k` (empty-state
Home, planner welcome/help), `probe_n` (history buttons + undo/redo toasts live), `probe_q` (toast
argument log, BIM panel undo pair, autosave/recovery entry), `probe_o` (IndexedDB), `probe_p`/`probe_r`
(BIM empty state, save + reload).
