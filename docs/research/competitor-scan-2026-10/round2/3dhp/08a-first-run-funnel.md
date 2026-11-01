# 3D House Planner — first-run funnel detail (settings modal → start card → 6-step tour)

Round 2, narrow question: **the exact first-run funnel** of `https://www.3dhouseplanner.com/` —
settings modal copy, "Start your project" card, 6-step tour steps, skip/dismiss behaviour, and how
"seen" is persisted. Builds on round 1
(`rea-3dhouseplanner-2026-10/08-08-ui-layout-onboarding/report.md`, read-only).

Evidence tags: **OBSERVED** (live capture / shipped file I read), **DOCUMENTED** (vendor docs),
**INFERRED** (my reasoning). All evidence files for this round live in this job folder.

**Time started:** 2026-10-31 15:45 CET. **Time budget:** 120 min.

---

## 1. Summary (5 bullets)

- **The funnel is two moments, not three in a row.** A **non-dismissible "Project settings" modal
  (`#modal1`)** appears on *every* editor boot (name · floor height 2.65 m · plan size 100 m ·
  m/ft · "Start designing"), then — only if the scene is empty — the dismissible **"Start your
  project"** 4-tile card (Draw in 2D / Ask the AI / Draw walls in 3D / Open-import). The **6-step
  spotlight tour does NOT auto-run for a brand-new user**: it fires only once the scene becomes
  non-empty (first wall/room/object); a wall created via `HP3D.buildWall()` triggered it ~3 s
  later. (`OBSERVED`, live Playwright probes `rea/funnel2–8.mjs`)
- **The tour's six steps and copy are now exact** (1/6 "Four ways to look" → `#hpViewSeg`; 2/6
  "Draw in 2D"; 3/6 "Furniture and textures" → `#hpToolCatalog`; 4/6 "Lost in the scene?" →
  `#hpToolFrame`; 5/6 "Save and export" → `#hpToolFile`; 6/6 "AI assistant" → `#hpToolAi`, button
  flips **Next → Start**), each with a **Skip** and a primary next button, rendered as
  `.hp-tour` with `.hp-tour-target` on the highlighted element. (`OBSERVED`,
  `rea/tour-steps.json`, `rea/tour-step1.html`)
- **Persistence is deliberately asymmetric:** `localStorage['hp-tour-done']='1'` (written by Skip
  or by finishing step 6, permanent) vs `sessionStorage['hp-start-dismissed']='1'` (Hide button or
  any tile click, current tab only). The settings modal has **no** seen-flag and re-appears on
  every reload even when a saved project is silently restored behind it; the help dialog's
  injected **"Show the first steps tour"** button re-opens the tour and bypasses `hp-tour-done`.
  (`OBSERVED`, `rea/funnel3/5/8/10/11/13.mjs`)
- **There is no "welcome back / Restore" recovery prompt** in the live flow (contra round 1's
  i18n-only inference): saved state lives in `extension-floorplanner-history` /
  `-floorplans` and returns silently under the settings modal. A new tab *does* show the start
  card again (session scope) while `hp-tour-done` persists. (`OBSERVED`)
- **Bonus — round 1's biggest unknown is solved:** `app.php` served directly redirects to
  `index.php` **unless the non-HttpOnly cookie `visted=1` is present**; the landing CTA sets it
  and then `app.php` stays. Proven by a clean A/B with a seeded cookie
  (`rea/funnel12.mjs`, `rea/cookies.mjs`). `OBSERVED`

---

## 2. Findings

Method note for this round: all first-run states below were captured **live** by driving the real
site with a Playwright persistent-context probe (images in `rea/funnel*.mjs`, raw JSON in
`rea/stage1-modal.*`, `rea/stage2-startcard.json`, `rea/tour-steps.json`). Chromium was launched
with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; the editor
booted and `window.HP3D` was fully usable, so 3D state could be queried directly. Where static
reading of the shipped (obfuscated) `hp-ux.js` was used it is labelled **OBSERVED (static)**.

### 2.1 The three-stage funnel (with the real trigger)

The funnel is **not** three consecutive stages on first load — it is two different moments:

| Stage | When it appears | Blocking? | Seeded "seen" flag |
|---|---|---|---|
| 1. "Project settings" modal `#modal1` | on **every** editor boot, before the scene is usable; user must press **Start designing** | yes (`data-dismissible="false"`, `aria-modal="true"`) | **none** — it re-appears on every reload |
| 2. "Start your project" card `.hp-start` | immediately after pressing *Start designing* **if the scene is empty** | no; auto-hides as soon as anything is created | `sessionStorage['hp-start-dismissed'] = '1'` |
| 3. 6-step spotlight tour `.hp-tour` | only **after the scene becomes non-empty** (first wall/room/object) and only if the tour was never finished/skipped | no | `localStorage['hp-tour-done'] = '1'` |

`OBSERVED` (live): with an empty scene the start card stayed visible for >6 s and the tour never
fired; after `window.HP3D.buildWall(...)` succeeded the tour appeared ~3 s later
(`rea/funnel8.mjs`). This corrects round 1's reading that the tour simply follows the card.

The two gates are independent: the card is suppressed by `hp-start-dismissed` (session), the tour
by `hp-tour-done` (local). `OBSERVED`.

### 2.2 Stage 1 — "Project settings" modal: exact copy and controls

Captured markup: `rea/stage1-modal.html`; control dump: `rea/stage1-modal.json`. All strings are
also in `i18n-app.json` under `setup.*` and re-rendered through `data-i18n` attributes.

- Container: `#modal1.hp-dialog.hp-dialog-setup.hp-open`, `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby="modal1-title"`, `data-dismissible="false"`, inline `z-index: 1102`.
- Header: icon `architecture`; title **"Project settings"**; sub **"Set the basics of your new
  project. Everything else can be changed while you design."**
- **Project name (optional)** — `input#setupProjectName.hp-input`, `maxlength=80`,
  placeholder **"My house"**, `autocomplete="off"`.
- **Floor-to-floor height** — `input#floorheight[type=range]`, `value=2.65`, `min=2`, `max=5`,
  `step=.01`; badge `#numvalue` "2.65 m"; hint **"Vertical distance between two levels, slab
  included. New walls use this height."**
- **Floor plan size** — `input#floorsize[type=range]`, `value=100`, `min=50`, `max=1000`,
  `step=10`; badge `#numvalue2` "100 m"; hint **"Side of the square ground and grid you will build
  on."**
- **Units** — radiogroup `aria-labelledby="unitsLabel"`, two radios `name="units"`: `value="m"`
  (**"Meters (m)"**, checked by default) and `value="ft"` (**"Feet (ft)"**).
- Footer: hidden progress row `#setupProgress` (spinner + **"Preparing the scene…"**, only shown
  while the scene builds) and primary button `#definefloor` **"Start designing"** with a trailing
  `arrow_forward` icon.

**Dismissal behaviour (tested):** non-dismissible in practice. `Escape` leaves
`display:flex` and class `hp-open`; clicking the backdrop does nothing; there is no close control
inside the modal. `OBSERVED` (`rea/funnel2.mjs`, `rea/funnel9.mjs`). The only way out is the
primary button (and `window.HPBIM` etc. are not yet initialised before it).

**Recurrence (important):** the modal is shown again on **every** page load, including reloads
where a saved project already exists in `localStorage`
(`extension-floorplanner-history`, `extension-floorplanner-floorplans`). After `Ctrl+S`, reloading
and pressing *Start designing* again, the wall count came back as 1, i.e. the project was restored
behind the modal. `OBSERVED` (`rea/funnel10.mjs`, `rea/funnel11.mjs`). There is **no**
"settings seen" flag; the project name typed in stage 1 is not written to `localStorage` as a
separate key. `INFERRED` from the storage dumps: no `hp-setup-*`/`hp-settings-seen`-style key was
ever present.

### 2.3 Stage 2 — "Start your project" card: exact copy and tiles

Captured markup: `rea/stage2-startcard.json`. Size 520×288 px at a 1440×900 viewport, centred
(x=460, y=306). `OBSERVED`.

- Root: `div.hp-start.hp-visible` (hidden state is simply the absence of `hp-visible`).
- Top-right close button `.hp-start-close`, `aria-label="Hide"`, `title="Hide"`, `close` icon.
- Title: **"Start your project"**.
- Body: **"Draw a plan, describe a house to the AI or open something you already have. Everything
  stays in this browser."**
- 2×2 grid of `button.hp-start-btn` (`<span class="hp-start-ic">` icon + `<span
  class="hp-start-label"><b>title</b><small>hint</small>`), each with `data-start`:

| `data-start` | Icon | Title | Sub-copy | Accent class | Action it triggers |
|---|---|---|---|---|---|
| `draw` | `grid_on` | **Draw in 2D** | "Walls, doors and rooms appear in 3D as you draw" | `hp-c-teal` | opens the 2D plan (click on the 2D segment / `open2DPlanner`) |
| `ai` | `auto_awesome` | **Ask the AI** | "“A 3-bedroom house with a gable roof”" | `hp-c-ai` | `window.HPAI` open |
| `wall` | `view_in_ar` | **Draw walls in 3D** | "Turn on the wall builder" | `hp-c-orange` | switches the tool card to the Build tab and activates the wall tool |
| `open` | `folder_open` | **Open / import** | "Projects, IFC, DXF, GLB, OBJ, images…" | `hp-c-blue` | opens the file/open dialog |

`OBSERVED` (live DOM) + `INFERRED` for the per-tile action (read from the deobfuscated branch
structure in `hp-ux.js` and from the visible state change when the tile was clicked; the exact
handler bodies were not all re-verified live).

**Dismissal:** clicking `.hp-start-close` writes `sessionStorage['hp-start-dismissed']='1'` and
removes `hp-visible` (root class becomes `hp-start`). Clicking any tile *also* writes the same
session key first, then closes the card, then performs its action. `OBSERVED`
(`rea/funnel3.mjs`, `rea/funnel2.mjs`).

**When it stops showing on its own:** the card is re-evaluated continuously. In the captured code
it re-shows while the scene has **no** elements (`listElements` of wall/room/slab/door/window/
object/roof/stairs/… returns 0) and the 2D-plan frame is not open; once an element exists, or the
2D plan is open, it hides. `OBSERVED (static)` + `OBSERVED` (live: card disappeared after a wall
was created).

### 2.4 Stage 3 — the 6-step first-steps tour: exact copy, targets, buttons

Evidence: `rea/tour-steps.json` (captured by forcing the tour through `window.HPTour.run()`, which
is the same entry point the Help dialog uses) and a live screenshot sequence. The tour element is
`div.hp-tour` with `role="dialog"` and `aria-live="polite"`; a step is
`<div class="hp-tour-step">N / 6</div><div class="hp-tour-title">…</div><p class="hp-tour-text">…</p>`
plus an actions row with **Skip** and a primary **Next**/**Start** button. Each step adds
`.hp-tour-target` to exactly one existing element and positions the popover under it. `OBSERVED`
(verbatim first step: `rea/tour-step1.html`).

| # | Title | Body copy (verbatim) | Target element | Button |
|---|---|---|---|---|
| 1 | **Four ways to look** | "Orbit around the model, walk inside at eye level, see it from above or draw on the 2D plan." | `#hpViewSeg` (the 3D/Walk/Top/2D segmented control) | Next |
| 2 | **Draw in 2D** | "Walls, doors, windows and rooms drawn on the plan appear in 3D as you draw." | the 2D segment button inside `#hpViewSeg` | Next |
| 3 | **Furniture and textures** | "Click an object to put it in the middle of the view, or drag it to the exact spot." | `#hpToolCatalog` (top-right tool) | Next |
| 4 | **Lost in the scene?** | "This button (or the Home key) brings the whole project back into view." | `#hpToolFrame` | Next |
| 5 | **Save and export** | "Projects are saved in this browser (Ctrl+S). Export to IFC, GLB, DXF, PNG and more." | `#hpToolFile` | Next |
| 6 | **AI assistant** | "Describe a house or a change and the assistant builds it. It uses your free Puter account." | `#hpToolAi` | **Start** |

Notes:
- Step 1's target `#hpViewSeg` is a *container* (`hp-seg`), step 2 highlights the 2D button inside
  it — so the tour deliberately points twice at the same control, first the whole switch then the
  specific "2D plan" option. `OBSERVED`.
- On the last step the primary button label changes from `ux.tour.next` ("Next") to
  `ux.tour.done` ("Start"). `OBSERVED` (live) and `OBSERVED (static)` (`ux.tour.done` key).
- The popover is clamped to the viewport: `width = max(300, innerWidth-24)`, `left` clamped to
  ≥12 px, `top = max(innerHeight-200, target.bottom+12)`. `OBSERVED (static)`.
- The tour only includes steps whose target element exists **and** is non-null at
  `offsetParent` (i.e. actually rendered); missing targets are dropped before numbering. In the
  captured build all six were present, so the count was 6/6. `OBSERVED (static)` + `OBSERVED`
  (live: exactly 6).
- At start of each step all previous `.hp-tour-target` classes are removed and only the current
  target gets the highlight. `OBSERVED`.

### 2.5 Skip / dismiss / re-open behaviour

- **Skip** button (`[data-tour="skip"]`) → calls the same finish routine as completing the tour:
  writes `localStorage['hp-tour-done']='1'`, removes the `.hp-tour` element and clears every
  `.hp-tour-target`. `OBSERVED` (`rea/funnel5.mjs`: after Skip, `tour present=false`, all targets
  removed, key written).
- **Finish** (primary button on step 6, label "Start") → identical routine (“Start” is just the
  final step's Next). `OBSERVED`.
- **Escape / backdrop** — not wired for the tour; only the two buttons drive it. `INFERRED`
  (no `keydown`/backdrop handler for `.hp-tour` was found in the readable code region; not
  exhaustively tested).
- **Re-open:** the Help dialog `#modalkey` gets an extra injected button
  `.hp-keys-tour` labelled **"Show the first steps tour"** (icon `school`); clicking it closes the
  Help dialog and calls the tour entry point after a 250 ms delay, **bypassing**
  `hp-tour-done`. `OBSERVED` (live: tour re-opened from Help even with `hp-tour-done=1` set) and
  `OBSERVED (static)` (`ux.tour.open`).
- There is also a global `window.HPTour = { run() { … } }` which forces the tour regardless of
  the flag — useful for testing, and effectively what the Help button calls. `OBSERVED`.

### 2.6 Persistence of "seen" (storage keys, scopes, lifetimes)

| Key | Store | Value | Written when | Lifetime |
|---|---|---|---|---|
| `hp-tour-done` | **localStorage** | `'1'` | Skip, or completing step 6 | survives reload/tab close; cleared only by clearing site data or "Reset onboarding"-style action |
| `hp-start-dismissed` | **sessionStorage** | `'1'` | Hide button, or clicking any start-card tile | current tab session only; a new tab/closing the tab shows the card again |
| (none) | — | — | Project-settings modal | **not persisted**; re-shown on every boot |

`OBSERVED` (live, `rea/funnel3.mjs`, `rea/funnel5.mjs`, `rea/funnel8.mjs`). The keys were read
back from the page with `Object.keys(localStorage/sessionStorage)` and by direct `getItem`.
Note the asymmetry: the tour is remembered across sessions, the start card is deliberately
per-tab only, and the settings modal is always shown. Neither key is namespaced/versioned
(no app version or user id in the key), so a future content change cannot invalidate them.

**Recovery prompt:** a *"A project from your last session was found."* / **Restore** prompt was
**not** observed anywhere in the live flow (three reloads after saving, plus an in-tab
`goto app.php`). What happens instead is that the project is stowed in `localStorage`
(`extension-floorplanner-history`, `extension-floorplanner-floorplans`,
`extension-floorplanner-current-filename`) and silently restored behind the always-shown
Project-settings modal. `OBSERVED` (`rea/funnel10.mjs`, `rea/funnel11.mjs`) — this refines
round 1's i18n-only inference. The `bim.recover` strings exist in the dictionary but did not
surface in this flow; whether they are used in a rare state is still open (§4).

### 2.7 Gating conditions — when the tour does *not* auto-run

The auto-run gate is composite. It fires only when **all** of these hold — `OBSERVED (static)`
read of the scheduled check plus `OBSERVED` live confirmations:

1. `localStorage['hp-tour-done']` is not `'1'` (if the check throws, the code treats it as
   already-done and never auto-runs);
2. the start card is **not** currently visible (`hp-visible` absent) — the tour waits while the
   card is up;
3. the 2D-plan frame container is not open;
4. the editor is not in a "headless/hidden" state and no modal dialog is open (it retries on a
   timer, up to ~900 attempts at 2 s intervals);
5. the scene is **not** empty — `listElements` over wall/room/slab/roof/object/stairs/door/window
   etc. must return at least one element;
6. no blocking overlay flag is set (the code probes a set of check-elements for an active state).

In plain terms: **a brand-new user who just presses "Start designing" is never shown the tour
automatically** — they get the start card instead, and the tour only offers itself once they have
drawn/imported something, which most first-time users will do by clicking a start-card tile.
`OBSERVED`: empty scene for 6+ s → no tour; `window.HP3D.buildWall(...)` → tour after ~3 s
(`rea/funnel8.mjs`). With `hp-tour-done=1` pre-set, creating a wall produced no tour, while the
Help-dialog re-open still worked (`rea/funnel9.mjs`).

### 2.8 Bonus: the `app.php` → `index.php` gate (round 1's top unknown)

Round 1 could not explain why a direct fetch/launch of `app.php` always redirected to `index.php`
while clicking the landing CTA kept the editor at `app.php`. Answer:

- `app.php` returns HTTP 200 and its first bytes are
  `<script>window.location.href = 'index.php'</script>`, but it is only *executed* when the
  request carries no `visted` cookie.
- `index.php` sets `visted=1` (non-HttpOnly, `SameSite=Lax`, ~24 h expiry). With that cookie
  present, `app.php` serves the editor without the redirect line.
- **A/B proof:** fresh profile + direct `app.php` → lands on `index.php`; same fresh profile with
  only `visted=1` seeded → `app.php` (status 200). `OBSERVED` (`rea/funnel12.mjs`).
- The `PHPSESSID` and `__cf_bm` cookies are also set but were unchanged across the redirect, so
  `visted` is the gate. `INFERRED` for "the only gate" (only `visted` was A/B-tested),
  `OBSERVED` for the cookie being set and for the A/B result.
- Practical consequence for hand-off/QA: the editor cannot be reached by typing
  `https://www.3dhouseplanner.com/app.php` in a clean browser; it is a funnel-only entry point.

### 2.9 The landing→editor hop

`index.php` → `app.php` is a **full page navigation**, not an SPA route: the CTA
`a.l-btn-primary` ("Sketch now") has `href="https://www.3dhouseplanner.com/app.php"`; the editor
document then loads ~29 ES modules plus Babylon. The first paint the user sees is a solid loader
`#modal0` (`data-dismissible="false"`) followed by `#modal1`. `OBSERVED` (`rea/funnel2.mjs`,
round-1 DOM). The pairing of the `visted` cookie with this hop means the redirect line in
`app.php` is effectively "you must come through the landing page at least once". `INFERRED`.

---

## 3. Ideas for CasaPlazAI

Ranked by value/effort, each tied to a finding and, where relevant, to the CasaPlazAI plan schema
(`~/dsh-workspaces/rea2-shared/casaplazai-schema.md` — grid 0.5 m, rooms = rectangles +
polygons, walls shared, levels). Effort assumes the existing Vite/TS/Three.js single-page app.

| # | Idea | Ties to | CasaPlazAI mapping | V/E |
|---|---|---|---|---|
| 1 | **First-run "New plan" modal that maps 1:1 onto your schema.** Project name (optional, `maxlength=80`, placeholder), **grid size** (their 100 m ⇔ your canvas extent, but you snap to 0.5 m so offer 10/20/40/100 m presets), **wall height** (their 2.65 m floor-to-floor ⇔ your wall height default), **Units m/ft**. Keep their exact info-hint style under each control. One decision per field, no scrolling. | §2.2 | `gridSize`, `unit`, `wallHeight`, plan meta | High / Low |
| 2 | **Do NOT repeat their settings modal on every load.** They re-ask on each boot even with a saved project; that is a regression users will feel. Persist a `settingsSeen` flag and only show the modal for a brand-new plan; for a returning plan show a **"Welcome back — Restore / Start new"** prompt instead. This is where you beat them. | §2.2, §2.6 | plan autosave to localStorage | High / Low |
| 3 | **Six-step spotlight tour with the target/step model, but gate it on real work.** Their tour only fires after the scene is non-empty (`listElements > 0`). Mirror that: fire the tour after the user's **first room is drawn**, so every step has something to point at. Suggested steps for your modes: (1) Plan/3D/Walk switch, (2) rectangle vs polygon tool, (3) 0.5 m grid snap + shared walls, (4) door/window on an edge, (5) furnish + collision fit, (6) export PNG/JPEG. | §2.1, §2.4, §2.7 | modes, tools, rooms, openings, palette | High / Med |
| 4 | **Two-tier persistence exactly as they do it, but explicit.** `localStorage` for irreversible "tour done" and `sessionStorage` for the per-tab start card. Additionally key them by schema version (`casaplazai.tour.v1`) so a future redesign can re-onboard without stale flags. | §2.6 | localStorage plan store | High / Low |
| 5 | **"Start your project" 4-tile card with the same information shape** (bold title + one-line outcome), adapted: **Draw a room** ("Rectangle or polygon on the 0.5 m grid"), **Add doors & windows** ("Snap them onto any wall"), **Furnish** ("Fits and collisions handled for you"), **Open / import** ("Trace a blueprint underlay"). Include the "Everything stays in this browser" trust line. | §2.3 | tools, openings, palette, underlay | Med–High / Low |
| 6 | **Re-open the tour from Help** with a single injected button (their `.hp-keys-tour`, "Show the first steps tour") — cheap, and it makes the tour skippable without guilt. Also expose `window.__tour.run()` for QA. | §2.5 | — | Med / Low |
| 7 | **Make the primary tour button's label change on the last step** ("Next" → "Got it" / "Start") as they do; small but it signals the end. Combine with an N/6 counter above the title. | §2.4 | — | Low / Low |
| 8 | **Skip = finish, not "ask again next time".** Their Skip writes the same done-flag as completing. Adopt that, but offer a one-time "Show me later" that only sets the session flag if you want a second chance. | §2.5 | — | Med / Low |
| 9 | **Do NOT copy:** the `visted`-cookie gate that makes the editor unreachable by direct URL (hostile to bookmarks/QA), the non-dismissible-every-load settings modal, and the un-versioned storage keys. | §2.2, §2.6, §2.8 | — | High (avoid) / Low |
| 10 | **Landing CTA language to borrow:** they keep the hop to the editor as a normal navigation with "Sketch now" / "Start designing — free". Your single-page app can skip the hop entirely, but keep a **plain URL contract** (`?new=1`, `#plan/new`) so the "start fresh" state is linkable — the opposite of their cookie gate. | §2.9 | routing | Med / Low |

## 4. Unknowns

- **Which exact branch drops/keeps tour steps** when a target is missing. I read the filter
  (`target != null && offsetParent != null`) and observed 6/6, but never hid a tool button to see
  a 5-step tour. `INFERRED`.
- **Whether the tour can be closed by Escape or backdrop click.** No such handler was found in
  the readable region; only fuzzed by clicking buttons. `INFERRED (not exhaustively tested)`.
- **The `bim.recover` / "Restore" flow.** Its strings exist in the i18n dictionary, but three
  reloads after saving and an in-tab re-navigation never surfaced it; the project returned
  silently behind the settings modal. Maybe it needs a partial/corrupt save or a different
  IndexedDB state; not reproduced.
- **What exactly the settings modal writes.** Only `extension-floorplanner-currently-editing` and
  the plan-history keys appeared; no dedicated settings key. The modal's field values are
  presumably applied to the in-memory scene and only reach storage via the autosave payload — I
  did not diff the saved JSON before/after changing height/size/units.
- **The first-load `#modal0` loader's timing and copy** (spinner + percentage) were not re-timed
  in this round; round 1 covered it and it is transitional.
- **Mobile behaviour of the tour popover** (`width = max(300, innerWidth-24)`, clamped left/top)
  was read from code but not rendered at a phone viewport in this round.
- **`visted` cookie semantics beyond the A/B:** whether it is set by landing JS or by a server
  header, whether any value other than `1` works, and whether it is also required for other
  `*.php` tool pages. Only `visted=1` was tested.
- **The exact tour auto-run retry budget** (I read a countdown initialised to `0x384` ≈ 900 and a
  2 s interval, plus a 1.5 s re-check) was not exhausted to see the final give-up state.

## Appendix — evidence inventory (this round)

| File | What it is |
|---|---|
| `rea/funnel*.mjs` | Live Playwright probes (13 scripts) that produced every live claim |
| `rea/stage1-modal.html` / `.json` | Project-settings modal markup + control inventory |
| `rea/stage2-startcard.json`, `rea/start-card.html` | "Start your project" card DOM/copy |
| `rea/tour-steps.json`, `rea/tour-step1.html` | All 6 tour steps: title, body, target, button label |
| `rea/help-dialog.json` | Help dialog with the injected "Show the first steps tour" button |
| `rea/reload-state.json` | State after reload with a saved project |
| `rea/cookies.mjs`, `rea/funnel12.mjs` | `visted`-cookie A/B proving the `app.php` gate |
| `shots/r2-01..10-*.png` | Screenshots (captured, **not** visually inspected — no image input) |

Round-1 evidence reused read-only from
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/08-08-ui-layout-onboarding/`
(`rea/i18n-app.json`, `rea/editor-dom.html`, `js/editor_hp-ux.js`, `rea/app.php.html`).

**Time finished:** 2026-10-31 16:38 CET (~53 min used of the 120 min budget). All research states
in §2 were captured live; the report is complete and self-contained.
