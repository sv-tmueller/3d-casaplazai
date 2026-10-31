# 3D House Planner — Top Bar Behaviour (view modes, level stepper, 7 tools)

**Job:** `01-01a-feature-inventory-topbar-tools` · **Round 2**, narrow follow-up to
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/01-01-feature-inventory/report.md` (read-only; reused, not repeated).
**Target:** https://www.3dhouseplanner.com/ — editor `app.php` (Babylon.js), sibling 2D planner iframe at `/2D-Planner/index.php`.
**Question:** exact behaviour of the top bar — view-mode segment (3D / Walk / Top / 2D), the level stepper, and each of the 7 tools; what each changes in app state.
**Method:** `rea capture-browser-scenario` 6.8.0 (Playwright/Chrome 156, 1600×950, en-US, headless, software GL via `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`) + direct Playwright state probes of the page's own exposed JS API (`window.HP3D`, `HPUI`, `HPSync`, `HPRender`, `HPCatalog`, `HPAI`, `HPBIM`, `HPMeasure`).
**Evidence:** `./evidence/` (runtime DOM, accessibility per step, screenshots, raw rea JSON), scenarios `./scenarios/`, raw captures `./raw/`, probes `./scripts/`. Sources: `./sources.json`.

Claim tags: **OBSERVED** (captured live, evidence file named) · **DOCUMENTED** (vendor-written text/tooltip/accessible name) · **INFERRED** (my reasoning).

> **Round-1 reuse.** Round-1 §2.4 listed the top-bar *labels* (`#hpViewSeg`, `Level` stepper, `#hpToolFrame/File/Catalog/Render/Ai/Bim/Help/Fullscreen`) and the status bar. This report does not re-derive that list. It adds: the redirect gate needed to reach the editor, the exact app-state mutation of every control (traced through the page's own API), the camera objects behind each view mode, the level-clamp semantics, the panel-coordination model, and the accessibility gaps.

---

## 1. Summary

- **OBSERVED** `https://www.3dhouseplanner.com/app.php` serves a **session-gated redirect to `index.php`** to a cold client; the editor only loads after first visiting `index.php` (cookie `visted=1`). This blocked direct fetching and is the reason round-1 fetches of `js.php` returned 403. With the cookie, every editor module downloads normally. (`scripts/probe3.mjs`, `raw/cj.txt`, `raw/app_authed.html`)
- **OBSERVED** The top bar is **built by JavaScript**, not present in the served HTML (`grep hp-topbar raw/app_authed.html` → 0). Observed runtime markup: `evidence/observed_topbar_dom.html` (4 264 B). Three zones: brand+project-name+save-state+history (left), `#hpViewSeg` + `.hp-level` (centre), `.hp-tools` with **8 buttons** (right).
- **OBSERVED** The view segment is **three camera modes plus one launcher**: 3D → `ArcRotateCamera "Camera"` (perspective, r≈28.3); Walk → `UniversalCamera` (first-person, eye 1.54 m, speed 0.2, ellipsoid [0.5,1,0.5], no gravity/collision); Top → `ArcRotateCamera "Camera2"` (**orthographic**, straight down; half-height 11.875 m on an empty plan, then auto-fitted to content and aspect ratio). **2D plan does not change the camera or the segment highlight at all** — it un-hides a full-viewport `#floorplanFrameContainer` iframe (`2D-Planner/index.php?lang=en`, z-index 1000) that intercepts every pointer event. (`raw/probe6.out`, `raw/probe7.out`, `raw/probe17.out`, `raw/probe20.out`)
- **OBSERVED** The level stepper writes `HP3D.currentLevel` in **0…50 inclusive** (`setLevel` is `max(0, min(50, round(n)))`; it *returns* the clamped value), mirrors it into `HPSync.level`, updates the `.hp-level-value` text, and emits a decoupled `HP3D.events` event `{type:'level', data:{level}}`. The `−`/`+` buttons are **never disabled**, even at the 0 and 50 bounds — the clamp is silent. New geometry lands on the selected level at `y = level × 2.65 m` (observed `level:2` slab at `y = 5.31`), but **all levels keep rendering** when you switch — the stepper changes the edit target only, not visibility. (`raw/probe8.out`, `raw/probe25.out`, `raw/probe32.out`)
- **OBSERVED** The **8 tool buttons** are 2 actions + 6 stateful surfaces: *Frame all* (`#hpToolFrame`, also `Home`) is a genuine fit-to-content (with a slab it restored `target=(3,0.01,2.5)` and `radius=9.76` from a forced radius 900, and adding the slab re-framed automatically) though it stays enabled and silently no-ops on an empty plan; *Full screen* calls `requestFullscreen()`. The rest form **four UI kinds with two exclusion groups**: popovers *File* (`#hpFileMenu`) and *Render* (`#hpRenderPopover`) exclude each other; side panels *AI* (`#hpAiPanel`) and *BIM* (`#hpBimPanel`) exclude each other; the *Catalog* drawer (`#mySidebar`) and the *Help* modal (`#modalkey`) are independent and can be open simultaneously with the others. Each tool is a **toggle** (re-click closes); `Escape` closes popovers/panels/dialogs but not the 2D overlay. (`raw/probe31.out`, `raw/probe9.out`, `scripts/probe10.mjs`, `raw/probe23.out`)

---

## 2. Findings

### 2.0 Evidence index

| Evidence | What it is |
|---|---|
| `evidence/observed_topbar_dom.html` | **Runtime `outerHTML` of `.hp-topbar`** (built by JS; ids, titles, aria-labels) |
| `evidence/observed_statusbar_dom.html` | Runtime `.hp-statusbar` DOM |
| `evidence/observed_level_panel_dom.html` | `#hpLevelPanel` ("Floors & grid") DOM |
| `evidence/observed_panels.json` | Runtime DOM of the File and Render popovers in their open state |
| `evidence/static_topbar_markup.html` | Empty (0 B) — **proves the bar is not in the served HTML** (kept as negative evidence) |
| `evidence/rea_*.accessibility.txt` | **37-step canonical `rea` accessibility trace** (one file per step); `rea_a05_ready`, `rea_a10..a15` (view modes), `rea_a20..a23` (level), `rea_a30..a33` (File), `rea_a40..a43` (Catalog), `rea_a50..a53` (Render), `rea_a60..a63` (AI, BIM), `rea_a70..a73` (Help) |
| `raw/rea_topbar.json` | Raw rea Evidence envelope (capture failed at cleanup, `partial_observation` retained all 37 steps of accessibility artifacts) |
| `raw/probe6.out` … `raw/probe23.out` | Raw output of the state probes (camera objects, level events, panel states, render modes, file chips) |
| `scenarios/topbar_rea.json` | Reproducible canonical scenario (36 actions) |
| `raw/app_authed.html` | `app.php` HTML fetched *with* the `visted` cookie (2.09 MB) |
| `raw/cj.txt` | Cookie jar proving `visted=1` is the gate |
| `scripts/lib.mjs`, `scripts/fp.mjs`, `scripts/probe*.mjs` | Driver + fingerprint + probes (compute only; every factual claim also has an artefact above) |

> Canonical `rea` run result: the capture **completed all 37 steps** but the envelope reports `cleanup_incomplete` (`cleanup_failed`: `browser_transport`, `browser_profile`) because the rea-owned Chrome did not confirm teardown within its 30 s deadline. The accessibility artifacts are intact and are the primary citable evidence here. Screenshots were not requested in that run to keep it fast; the direct probes saved PNGs (`evidence/p4_ready.png`, `evidence/p7_2d_open.png`).

---

### 2.1 Reaching the editor (prerequisite finding)

**OBSERVED** — `raw/app.php.html`, `raw/app_authed.html`, `raw/cj.txt`, `scripts/probe3.mjs`.

- A cold `GET /app.php` returns HTTP 200 but the body opens with `<script>window.location.href = 'index.php'</script>` followed by the full editor HTML (2.09 MB). The browser therefore lands on the **landing page**, not the editor. Round-1 evidence shows `ready_d03_ready_dom.html` with `<body class="hp-modern-body hp-app hp-ready">` and title `3D House Planner - Free 3D floor planner on the web`, while `editor_open_*` shows `l-body` and title `...Free 3D Floor Planner on the Web` — consistent with the editor DOM being *served* but the script bouncing the *document* on a first visit.
- The gate is a **cookie**, not a header: `curl` with a cookie jar primed by one `GET /index.php` (which sets `visted=1`, plus `PHPSESSID` and Cloudflare `__cf_bm`) receives the editor body with **no redirect script** and the same 2 092 041 bytes.
- **Consequence (useful for round 3):** every `js.php?f=editor%2F…` module is fetchable **only** with that cookie; without it all 29 modules return a 9-byte `403`. With it, all 29 download (e.g. `hp-editor` 691 230 B, `hp-ui` 78 224 B). Modules are stored in `./modules/` (analysis artefacts, not deliverables).
- **INFERRED** The check is a soft onboarding gate ("did this client ever see the landing page?") — it is trivially bypassed by a first-party visit, which is exactly what a human user does.

### 2.2 Top-bar DOM contract

**OBSERVED** — `evidence/observed_topbar_dom.html`, `evidence/rea_a05_ready.accessibility.txt`.

`<header class="hp-topbar" role="toolbar">` = `.hp-topbar-left` + `.hp-topbar-center` + `.hp-topbar-right`.

| Zone | Control | id | role / aria | Default |
|---|---|---|---|---|
| left | brand → `index.php` | `.hp-brand` | link | — |
| left | project name | `.hp-project-name` | `textbox` "Project name" | "Untitled project" |
| left | save state | `.hp-save-state` | text (title "Unsaved changes") | "Unsaved changes" |
| left | history | `.hp-history` | `role="group"` "History" | Undo+Redo `[disabled]` |
| centre | view segment | `#hpViewSeg` | `role="group"` (no label) | 4 buttons |
| centre | level stepper | `.hp-level` | title "Current level: new walls, floors and objects go here" | `Level − 0 +` |
| right | tools | `.hp-tools` | 8 `button`s | see §2.4 |

**OBSERVED** the served HTML contains **no** `.hp-topbar` (`grep -c hp-topbar raw/app_authed.html` → 0; `evidence/static_topbar_markup.html` was written empty). The bar is constructed at runtime, so scraping `app.php` for chrome is useless — it must be observed live or read from `hp-ui`/`hp-editor` (which are string-array-obfuscated: `modules/hp-ui.js`, `modules/hp-editor.js`).

**INFERRED** CasaPlazAI's single-workspace redesign will likewise build chrome from a state model; the useful lesson is that this competitor keeps a *stable id contract* (`#hpTool…`, `#hpViewSeg`, `.hp-level-value`) even though the markup is generated — which is what makes delegated handlers and LLM tool-calling possible.

### 2.3 View-mode segment (`#hpViewSeg`)

**OBSERVED** — `source: observed_topbar_dom.html`, traces `raw/probe6.out`, `raw/probe17.out`, `raw/probe19.out`, `raw/probe21.out`.

Markup (each button `data-view`, icon, label, `title`):

| Button | `data-view` | title (DOCUMENTED, vendor tooltip) | Active by default |
|---|---|---|---|
| 3D | `3d` | "Orbit around the model" | **yes** (`.hp-active`) |
| Walk | `walk` | "First-person camera (WASD / arrows)" | no |
| Top | `top` | "Orthographic top view of the 3D scene" | no |
| 2D plan | `2d` | "Open the 2D planner (synced with 3D)" | no |

Selection is expressed **only** by the class `.hp-active` — no `role="radio"`, no `aria-pressed`, no `aria-checked`, no `tabindex` (all `null`, `raw/probe19.out`). The container is `role="group"` with no accessible name. Keyboard digits `1`–`4` do **not** switch views (OBSERVED: camera stayed `Camera`, segment stayed `3d*` for all four presses).

#### 2.3.1 3D

**OBSERVED** `HP3D.scene.activeCamera` = `ArcRotateCamera` named **`Camera`**, `mode 0` (perspective), `fov 0.8`, `inertia 0.9`, `radius 28.28`, position (0, 20, −20), target (0, 0, 0). Arrow keys configured via `keysUp/Down/Left/Right = [38,40,37,39]`. This is the boot camera and the default segment.

#### 2.3.2 Walk

**OBSERVED** clicking Walk switches the scene's active camera to a **`UniversalCamera`**:
- position **(0, 1.54, 0)** → an eye height of 1.54 m above the level floor;
- `speed 0.2`, `inertia 0.9`, `fov 0.8`;
- `ellipsoid [0.5, 1, 0.5]` (a 1 m-radius-ish body), but `applyGravity: false` and `checkCollisions: false` — **collision is configured but not enabled**;
- `keysUp/Down/Left/Right = [38,40,37,39]` → arrow keys; the tooltip adds WASD (DOCUMENTED).

**OBSERVED (negative)** synthetic `page.keyboard.down('w')` for 2 s did not move the camera (position stayed (0, 1.54, 0)); `document.pointerLockElement` was `null`. **INFERRED** movement requires real key events to the focused canvas (Babylon `attachControl` on the canvas), which headless synthetic page-level keys bypass — the binding exists but I could not drive it. I therefore report the *configuration* as observed and the *walk motion* as untested.

**OBSERVED** `Escape` while in Walk does **not** leave the mode (segment stayed `walk*`, camera stayed `UniversalCamera`) — contrary to a common "Esc exits walk" convention.

#### 2.3.3 Top

**OBSERVED** clicking Top switches to an `ArcRotateCamera` named **`Camera2`** with `mode 1` (**orthographic**), looking straight down (position y ≈ 328.3). On the **empty** project `orthoTop = 11.875` / `orthoBottom = −11.875` (a ≈23.75 m plan span) with the camera at the origin. `radius` stays 28.28 in every case.

**OBSERVED — the orthographic extents *do* track content, and they account for the camera aspect ratio.** Trace (`raw/probe34.out`), camera aspect = 1600/950 ≈ 1.684:

| scene | `orthoTop` | camera x/z |
|---|---|---|
| empty | 11.875 (default) | (0, ·, 0) |
| + one 6×5 m slab | **3.5625** (auto-fitted to that slab) | (3, ·, 2.5) = slab centre |
| + a second 40×30 m slab | 3.5625 (unchanged — no auto-refit) | (3, ·, 2.5) |
| after `frameAll()` (button, or API) | **15.4375** | (20, ·, 15) = centre of the 40×30 bounds |

So `frameAll` fits the content bounds through the **viewport aspect ratio** (`getRenderWidth()/getRenderHeight() = 1600/950 = 1.684`), not the raw extent, and adds a margin. **INFERRED, partially matched:** across the cases above `orthoTop ≈ (width/2)/aspect × 1.3` fits 6×5→2.32 (observed 3.56 ✗), 40×30→15.44 (✓), 20×8→7.72 (✓), 50×50→19.30 (✓) — four of five, so the exact fit function is **not determined**. What *is* OBSERVED is that the extents are content- and aspect-derived and that `frameAll` is the re-fit trigger. A quick isolated check is left as future work (each fresh case costs a full ~45 s app reload because slabs accumulate across API calls).

**OBSERVED (negative)** changing the level did **not** change `orthoTop`/`orthoBottom` or the camera position — the extents track *geometry*, not *floor*. (`raw/probe17.out`, `raw/probe34.out`)

#### 2.3.4 2D plan — a launcher, not a mode

**OBSERVED** — `raw/probe7.out`, `raw/probe20.out`, `raw/probe21.out`, `evidence/rea_a05_ready.accessibility.txt` (no 2D entry appears in any post-2D step because that scenario did not click it; the probes did).

- Clicking `2D plan` changes `#floorplanFrameContainer` from `visibility:hidden` to `visible`. The container is `position:fixed`, covers the entire viewport (rect 0,0,1600,950), `z-index 1000`, and holds `iframe#floorplanIframe` at `https://www.3dhouseplanner.com/2D-Planner/index.php?lang=en` (iframe `title` = **"2D Planner"**).
- **The segment highlight does not change**: after clicking 2D the active button remained whatever was active before (`3d*` in my runs). So `2D plan` is a *launcher* for a separate app, not a fourth camera mode — the segment is effectively "three modes + one action".
- The overlay **intercepts all pointer events**: Playwright's `page.click('.hp-level-up')` timed out with "`<iframe id="floorplanIframe"> … subtree intercepts pointer events`" while it was open. So the 3D top bar is non-interactive while the 2D planner is open.
- **Close paths (OBSERVED):** `#close2DPlanner` exists in the parent document (rect ~1422,862–1574,896) and closing it (force-click, since the overlay covers it) returns the container to `hidden`. `#generate3D` does the same. **`Escape` does not close it** (container stayed `visible`). The overlay is opened with `visibility`, not `display`, so no layout transition is visible in the a11y tree.
- **OBSERVED parent-document sync controls (in the hidden overlay shell):** `#hpSyncToggle` ("Live sync 2D ⇄ 3D", checked) and `#hpSyncSlabs` ("Floors follow the rooms", checked). `window.HPSync.enabled === true`. The status-bar item `.hp-status-sync` carries `title="Live 2D ⇄ 3D sync on"`; its vendored handler toggles `HPSync.setEnabled(!enabled)` and swaps the title between `ui.syncOn`/`ui.syncOff` (read from the obfuscated `hp-ui`, plus OBSERVED `HPSync` exposing `setEnabled/level/requestLevel/projectNow/flush/applyPlan`).
- **OBSERVED negative:** no `postMessage` traffic was observed on `window` when opening the overlay (`raw/probe20.out`, `msgs: []`) — the two apps talk through `HPSync`'s direct iframe access (`HP3D.plannerWindow`), not a message bus.

**INFERRED** This is the *hybrid* CasaPlazAI should think carefully about: the competitor gets "live 2D ⇄ 3D" by mounting a **second, independent editor** full-screen and syncing through a shared façade, whereas CasaPlazAI renders both views from one `FloorplanData` in one canvas. The transferable idea is the **explicit user-visible sync toggle + "floors follow the rooms" derivation flag**, not the iframe architecture.

### 2.4 The seven tools (eight buttons)

**OBSERVED** — `evidence/observed_topbar_dom.html`, `raw/probe9.out`, `scripts/probe10.mjs`, `raw/probe14b.out`, `raw/probe22.out`, `raw/probe23.out`, `evidence/rea_a31_file.accessibility.txt`, `evidence/rea_a51_render.accessibility.txt`, `evidence/rea_a63_bim.accessibility.txt`, `evidence/rea_a71_help.accessibility.txt`.

Handlers were traced by **wrapping the page's own exported API functions** and recording which fired (compute-only trace; the effects are also visible in DOM/state).

| # | Button (label) | id | title (vendor) | Observed handler / effect | UI kind |
|---|---|---|---|---|---|
| 1 | **Frame all** | `hpToolFrame` | "Show the whole project (Home)" | `HP3D.frameAll()` (traced). `Home` key → same call (traced). | action |
| 2 | **File** | `hpToolFile` | "Projects, import and export (saved in this browser)" | toggles popover `#hpFileMenu` (`.hp-open`); exclusive with Render; Esc closes | popover |
| 3 | **Catalog** | `hpToolCatalog` | "Objects and textures library" | `HPCatalog.toggle()` (traced) → drawer `#mySidebar` gets `.hp-open` + `aria-hidden=false`, `body` gets `hp-catalog-open`; independent of popovers | drawer |
| 4 | **Balanced** (label = quality) | `hpToolRender` | "Visualization" | toggles popover `#hpRenderPopover`; exclusive with File; Esc closes | popover |
| 5 | **AI assistant** (primary style) | `hpToolAi` | "AI assistant (Ctrl+K)" | toggles side panel `#hpAiPanel`; exclusive with BIM; `Ctrl+K` → same (traced); `body` gets `hp-panel-open` | side panel |
| 6 | **BIM** | `hpToolBim` | "BIM model" | toggles side panel `#hpBimPanel`; exclusive with AI | side panel |
| 7 | **Help** | `hpToolHelp` | "Help" | opens modal `#modalkey` "Keyboard shortcuts"; independent (opened *over* an open BIM panel) | modal |
| 8 | **Full screen** | `hpToolFullscreen` | "Full screen" | `document.documentElement.requestFullscreen()` (traced); `document.fullscreenElement` became non-null; Esc exits (browser-native) | action |

Note: round-1 called this "7 tools" (excluding Full screen, which is styled `hp-tool-icon`). I report all 8 buttons.

#### 2.4.1 Frame all

**OBSERVED** `frameAll` is a real fit-to-content, and the button is **enabled even when there is nothing to frame**. I first tested it on the terrain-only empty project (one element, `{kind:'terrain', level:0, mesh:'ground2'}`) and it correctly made no change. I then created a real element through the exposed API and retested:

1. `HP3D.buildSlab({points:[{x:0,z:0},{x:6,z:0},{x:6,z:5},{x:0,z:5}]})` added a `slab` (element count 1 → 2). *Note: the argument key is `points` with `{x, z}` vertices — discovered by brute-forcing 23 candidate keys (`raw/probe29.out`); `polygon`, `vertices` and `{x, y}` all silently return `null`.*
2. The slab's appearance **itself re-framed the camera to the content**: target became (3, 0.01, 2.5) — the slab centroid — with `radius 9.76`.
3. I forced the camera away by mutating the properties `ArcRotateCamera` actually derives position from (`camera.target = (500,0,500)`, `camera.radius = 900` → position (596.61, 882.06, 650.46)). Clicking `#hpToolFrame` returned target to **(3, 0.01, 2.5)** and `radius` to **9.76**; calling `HP3D.frameAll()` did the same; pressing `Home` did the same. (`raw/probe31.out`)
4. In **Top** mode it also fits the union of all content and the viewport aspect: with a 6×5 m and a 40×30 m slab present, `frameAll()` set the camera to the union centre (20, ·, 15) and `orthoTop` to 15.4375 (= half of 30, the binding axis, + margin) — whereas it had been auto-fitted to just the first slab (3.5625) until then. (`raw/probe34.out`)

**Methodological caveat (important for anyone re-testing):** an `ArcRotateCamera` computes `position` from `target`/`alpha`/`beta`/`radius`, so *writing* `position` alone is not a reliable way to displace it — Babylon recomputes it on the next frame. My first "camera didn't move" result (`scripts/probe13.mjs`) was measured that way and was therefore **inconclusive, not a negative**; the retest above mutates `target`/`radius` and is the valid one. The vendor tooltip ("Show the whole project") and the source guard `if(!target || !hasBounds(target)) return;` are both consistent with what is now observed.

#### 2.4.2 File (`#hpFileMenu`)

**OBSERVED** — `raw/probe22.out`, `evidence/rea_a31_file.accessibility.txt`.

Chip list (runtime DOM, in order): `New project` · `Open…` · `Save` (shows `Ctrl S`) · `Save as…` · `Share view link` · `Import…` (subtitle "IFC, DXF, GLB, OBJ, STL, JSON") · `Import floor plan` · `Import terrain color map` | **Export…** → `Project (.hpbim.json)` · `PDF sheets` · `IFC 4 (BIM)` · `GLB` · `glTF` · `OBJ` · `STL (3D print)` · `DXF plan (CAD)` · `SVG plan` · `CSV schedule` · `PNG image`. This matches round-1 §2.7; the new observation is that the menu is a **toggle popover that excludes the Render popover** and closes on Esc.

#### 2.4.3 Catalog (`#mySidebar`)

**OBSERVED** — `raw/probe9.out`, `evidence/rea_a41_catalog.accessibility.txt`. `HPCatalog.toggle()`; drawer becomes `complementary "Catalog"` with `aria-hidden="false"`, `body.hp-catalog-open`, tablist Objects/Textures, searchbox "Search objects", category counts, `Close` button. Clicking the top-bar button again closes it (traced `toggle` both times). Opening File while Catalog is open leaves **both** open (`raw/probe22.out` `AFTER-CATALOG {file:true, cat:true}`) — the drawer is explicitly not part of the popover group.

#### 2.4.4 Render / visualization (`#hpRenderPopover`)

**OBSERVED** — `raw/probe22.out`, `evidence/rea_a51_render.accessibility.txt`, `evidence/observed_panels.json`.

- `HPRender.mode` at boot = `"balanced"`; `HPRender.modes = ["draft","balanced","high","ultra","pathtrace","ai"]`.
- Popover contents (runtime DOM): quality buttons **Draft · Balanced · High · Ultra realistic**; **Path tracing** ("Real bounced light, i…"); **AI photo** ("Generated by AI in…"); checkboxes **Dimensions in 3D** with sub-options *Walls and overall size*, *Doors and windows*, *Room areas*, *Heights*; *Contour lines on the terrain*; *Vegetation and water on the painted terrain*; **Sun study** ("Date, time, shadows a…"); **Convert materials**; and Capture/share: **Share view link**, **4K image**, **Video**, **Camera tour**, **AR**.
- **OBSERVED state mutation:** clicking `Draft` set `HPRender.mode = "draft"` and the **toolbar button label became "Draft"** (so the button *displays the current quality*).
- **OBSERVED bug:** the button's `aria-label` **stayed "Balanced"** after switching to Draft. Screen-reader users get a stale value. Same class of defect as the view segment's missing state semantics.

#### 2.4.5 AI assistant (`#hpAiPanel`) and 2.4.6 BIM (`#hpBimPanel`)

**OBSERVED** — `raw/probe9.out`, `raw/probe23.out`, `evidence/rea_a61_ai.accessibility.txt`, `evidence/rea_a63_bim.accessibility.txt`.

- Both are `.hp-panel` overlays that gain `.hp-open`; `body` gains `hp-panel-open`. Opening one **closes** the other (traced AI→BIM→AI→BIM).
- AI panel exposes `dialog "AI assistant"` with a `combobox "Model"`, the greeting paragraph (round-1 §2.10) and five canned prompt buttons. `Ctrl+K` opens it (traced; the AI panel's `.hp-open` became true).
- BIM panel exposes `dialog "BIM model"` with tabs `Model`, `Properties`, `Quantities` and empty-state text "The model is empty. Draw walls, open the 2D planner or ask the AI assistant to build something." (round-1 documented 10 tabs; the tool's own `openPanel` was the only BIM function I wrapped and it did not appear in the trace list, so **the exact call used for BIM was not identified** — the panel simply opened).
- Both persist until Esc or a re-click; Esc closed the AI panel (`scripts/probe10.mjs` C5) and did not close BIM (BIM stayed open across the later Help test).

#### 2.4.7 Help (`#modalkey`) and 2.4.8 Full screen

**OBSERVED** — `evidence/rea_a71_help.accessibility.txt`, `raw/probe9.out`, `raw/probe14b.out`.
- Help opens `dialog "Keyboard shortcuts"` with a `Show the first steps tour` button and the groups round-1 documented (View / Editing / Drawing walls / Project / footer). It is an **independent modal** — it opened while `#hpBimPanel` stayed `.hp-open`. Esc closes it (aria-hidden returned to `true`).
- Full screen calls the **unprefixed** `document.documentElement.requestFullscreen()`; `document.fullscreenElement` became non-null (OBSERVED). Esc leaves fullscreen through the browser, not app code.

### 2.5 Panel-coordination model

**OBSERVED** — `raw/probe23.out` (single sequential run).

```
File open      -> file:true  render:false ai:false bim:false cat:false
then Render    -> file:false render:true  ai:false bim:false cat:false   (popovers exclude)
then File      -> file:true  render:false ai:false bim:false cat:false
Escape         -> all false
BIM            -> bim:true
Help over BIM  -> bim:true   + dialog open                            (modal is independent)
Esc help       -> bim:true   + dialog closed
AI             -> ai:true    bim:false                                 (panels exclude)
Catalog + File -> file:true  cat:true                                  (drawer independent)
```

**OBSERVED** from the obfuscated `hp-ui` source that this is two shared managers: `HPUI.createPopover({id})` (open() closes all other popovers in `_34a7aa`) and `HPUI.createPanel({id})` (open() closes the previously open panel). **INFERRED** The model is therefore:

| Layer | Members | Exclusion |
|---|---|---|
| popover | File, Render | at most one popover |
| side panel | AI, BIM | at most one panel |
| drawer | Catalog | free |
| modal | Help (and all `#modal*` dialogs) | free, focus-trapping |

`Escape` is handled globally and closes the topmost dismissible dialog first, else popovers/panels; it does **not** touch the 2D overlay (OBSERVED `raw/probe7.out`, `scripts/probe10.mjs`).

### 2.6 Level stepper (`.hp-level`)

**OBSERVED** — `raw/probe8.out`, `raw/probe19.out`, `scripts/probe13.mjs` (setLevel source), `evidence/observed_level_panel_dom.html`, `evidence/rea_a21_lvlup.accessibility.txt`.

Markup: `<div class="hp-level" title="Current level: new walls, floors and objects go here">` → `<span class="hp-level-label">Level</span>` + `<button class="hp-icon-btn hp-level-down" aria-label="-">` + `<span class="hp-level-value">0</span>` + `<button class="hp-icon-btn hp-level-up" aria-label="+">`.

State mutation on each `+`/`−` click:

1. `HP3D.setLevel(n)` runs `Math.max(0, Math.min(50, Math.round(n)))` and **returns** the clamped value. **OBSERVED** directly (`raw/probe25.out`):

   | input | returned / `currentLevel` / bar text | note |
   |---|---|---|
   | `80` | `50` | clamped |
   | `51` | `50` | clamped |
   | `50` | `50` | bound |
   | `49` | `49` | |
   | `1.9` | `2` | **rounded** |
   | `-1`, `-5` | `0` | clamped |
   | `null`, `undefined` | `0` | treated as 0 |

2. `HP3D.currentLevel` updates; `.hp-level-value` text updates; `HPSync.level` mirrors it (0→1→2→3→2→1→0 observed).
3. A decoupled event fires: `HP3D.events` delivered `{type:'level', data:{level:n}}` for **every** change (6 events captured). Round-1 saw the same event consumed by the status bar (`'level'===e.type && refresh`) — so the level is a **broadcast state change**, not a direct call into the 2D planner.
4. **Buttons never disable**: at level 0 and at level 50 both `.hp-level-down` and `.hp-level-up` had `disabled:false` and no `aria-disabled`. Over-clicking the bound is silently ignored.
5. Level 0 is the minimum; there is no negative/basement level through this control (the vendor's `Duplicate level…` and "Visible floors: up to 50" live in the left-dock `#hpLevelPanel`, not the stepper).

**OBSERVED** `#hpLevelPanel` (left dock, round-1 §2.5.1) is the parameter side of levels: `Visible floors: up to 50` slider (50), `Snap to grid: 0.125 m` slider, wall height/thickness readouts, `Duplicate level…`. **INFERRED** the top-bar stepper selects *which* level you edit; the panel configures the level system; both act on `HP3D.currentLevel`.

**OBSERVED — new geometry does land on the selected level.** With `currentLevel = 2`, `HP3D.buildSlab({points:[{x:0,z:0},{x:4,z:0},{x:4,z:3},{x:0,z:3}]})` produced an element with `level: 2` and `mesh.position.y = 5.31`. With the vendor's default floor-to-floor height of **2.65 m** (round-1 §2.3), `2 × 2.65 = 5.30` — so the placement is `y = level × floorToFloorHeight` (plus a ~1 cm slab offset). `HP3D.listElements({level:2})` returned exactly that 1 element while `{level:0}` returned 0, so the element's level is a first-class filter. This makes the tooltip ("new walls, floors and objects go here") **OBSERVED**, not merely documented. (`raw/probe32.out`)

**OBSERVED (surprising) — the stepper does NOT filter visibility.** After switching `currentLevel` from 2 back to 0, the level-2 slab remained `mesh.isVisible === true` and `isEnabled() === true`, alongside the level-0 terrain. **All levels render at once**; the top-bar stepper selects the *edit target only*. Hiding other floors is a separate control — the left-dock `#hpLevelPanel`'s "Visible floors: up to 50" slider (round-1 §2.5.1), which I did not exercise. **INFERRED** CasaPlazAI should keep that separation explicit too (edit floor ≠ visible floor), and should make it visible in the UI, because "which floor am I editing" and "which floors can I see" being the same-looking number is a real source of user error.

**OBSERVED** the placement path is `level → HP3D.setLevel` → `y = levelBase(level)`; the API exposes `levelBase()`, `supportYAt()`, `levelOf()`, `levelOfY()` for exactly this, and `HP3D.floorHeight` is not populated on the terrain-only scene (returned `undefined`).

### 2.7 Accessibility and UX defects worth not copying

**OBSERVED** — `raw/probe19.out`, `raw/probe22.out`, `evidence/observed_topbar_dom.html`.

1. **View segment has no state semantics.** Only `.hp-active`; no `role="radio"`/`aria-pressed`/`aria-checked`/`tabindex`; container `role="group"` with no label. An a11y tree reader (like the round-1 method) cannot tell which view is active — round-1's dump shows four plain buttons.
2. **Stale render aria-label.** `#hpToolRender` `aria-label` stayed `"Balanced"` after the mode became `draft`; the visible label updated.
3. **Level bounds are silent.** The stepper cannot signal "you are at the top/bottom floor".
4. **2D overlay traps the whole viewport** and is not dismissible with `Escape`; the top-bar controls beneath it stop responding and a11y-invisible.
5. **No keyboard path for the view segment** (`1`–`4` do nothing), even though the app has an extensive shortcut dialog — an inconsistency round-1 also noted for 2D drawing.
6. **Escape does not exit Walk**, so the only way out is the mouse on the segment.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Effort: **S** hours · **M** days · **L** week+. Each idea names its finding. Schema references are to `casaplazai-schema.md` (`FloorplanData` v1).

### Tier 1 — high value, low effort

| # | Idea | Effort | Finding / schema |
|---|---|---|---|
| 1 | **One view segmented control `Plan · 3D · Walk` (+ optional `Top`)** with real state: `role="tablist"`/`aria-selected`, or `role="radiogroup"` + `aria-checked`, and `1/2/3` shortcuts. The competitor's visual-only `.hp-active` is the exact defect to avoid — but the *single control instead of separate mode buttons* is the right call and already matches the CasaPlazAI redesign. | S | §2.3, §2.7.1 |
| 2 | **Give Walk concrete camera numbers**: eye height **1.54 m** above the level floor, `speed 0.2`, `inertia 0.9`, body ellipsoid `[0.5, 1, 0.5]`, arrows+WASD, and **deliberately enable collision** (`checkCollisions`/gravity) which the competitor configures but leaves off — walking through walls is their bug, not a feature. CasaPlazAI already has rooms/openings, so it can collide against wall segments. | S–M | §2.3.2 |
| 3 | **`Esc` must exit Walk** and return to the previous view; the competitor's Esc does nothing in Walk. Persist the previous mode so the toggle is reversible. | S | §2.3.2, §2.7.6 |
| 4 | **"Frame all" as an explicit button + `Home`**, implemented as *fit-to-content* over `rooms[].polygon` + `furniture[].position` (both already in the schema) → camera target + radius. The competitor does exactly this and it works (observed), **but leaves the button enabled on an empty plan where it silently no-ops** — disable it there, or frame the default floor extents. | S | §2.4.1 |
| 5 | **Level stepper with honest bounds**: `−`/`+` **disabled at the ends**, `aria-disabled`, and the value announced. Use the competitor's `0…50` clamp as the bound, but expose it. | S | §2.6, §2.7.3 |
| 6 | **Make the toolbar emit a `level-changed` event, not call the scene directly.** Their `HP3D.events {type:'level'}` fan-out is a clean decoupling: toolbar → event → 3D visibility + 2D sync + status bar all subscribe. CasaPlazAI's editor store can do this in three lines and it removes toolbar↔scene coupling. | S | §2.6.3 |
| 7 | **Group the tool buttons by UI kind with exactly two exclusion groups**: at most one *popover* (File, Render/Settings) and at most one *side panel* (Inspector), while a *drawer* (furniture palette) and a *modal* (shortcuts/help) float free. This is a concrete, cheap information architecture for the in-progress tool card + inspector. | S | §2.5 |
| 8 | **Every tool button is a toggle that reflects state** (re-click closes; `aria-expanded` tracks it). The competitor gets this right for File/Catalog/Render/AI/BIM. | S | §2.3–§2.5 |
| 9 | **Put the current quality in the button label and the `aria-label`** (Draft/Balanced/High). Copy their *label-as-state*, fix their stale aria-label. | S | §2.4.4, §2.7.2 |

### Tier 2 — medium effort

| # | Idea | Effort | Finding / schema |
|---|---|---|---|
| 10 | **Orthographic Top view that fits the plan bounds through the viewport aspect ratio, and re-fits on demand.** The competitor gets the hard part right: `orthoTop` went 11.875 (empty) → 3.5625 (first slab) → 15.4375 (after `frameAll` over a 6×5 ∪ 40×30 union), i.e. the extents are content- and aspect-derived, and the camera recentres on the AABB centre of `rooms[].polygon` ∪ `furniture[].position`. Its flaw is that a *later* addition does not re-fit until the user presses Frame all — CasaPlazAI should re-fit on plan mutation (debounced) as well. (Exact fit function not determined; see §2.3.3.) | M | §2.3.3 |
| 11 | **Levels as a first-class, schema-safe concept.** `FloorplanData` v1 has no per-floor grouping (top level is `rooms/openings/furniture`), yet roofs already reason about the "TOPMOST floor" (`roof-not-top-floor`). Adding floors means an **additive `migrate.ts` transform** introducing e.g. `levels: [{id,name,elevation}]` + a `levelId` on entities, with `schemaVersion` bumped atomically. The competitor's `y = levelBase(level)` model (stepper + `Floors & grid` panel + `Duplicate level…`) is the reference UX; the migration is the real cost. | M–L | §2.6; schema `roof-not-top-floor`, "evolve only through `migrate.ts`" |
| 12 | **A "2D plan" affordance that is honestly a launcher**, not a fake fourth mode. The competitor's `2D plan` button leaves the segment highlight unchanged and opens a full-viewport second editor that traps pointer events and cannot be dismissed with Esc. CasaPlazAI is one canvas, so make the segment strictly `Plan / 3D / Walk` and put "open plan view" wherever it belongs — never a segment entry that lies about state. | M | §2.3.4, §2.7.4 |
| 13 | **"Live sync" badge as a toggle with a derivation rule.** Their status-bar `2D⇄3D` item toggles a real boolean (`HPSync.enabled`) and the overlay adds "Floors follow the rooms". For a single-canvas app the analogue is a **2D↔3D projection toggle plus a `floorsFollowRooms` derivation flag** (rooms drive slab height) — cheap, visible, and it maps to `wallsOverride`/`roofs` which are already derived-capable. | M | §2.3.4; schema `wallsOverride`, `roofs` |
| 14 | **Toolbar-triggered render presets `Draft / Balanced / High`** backed by Three.js flags (shadow on/off, shadow-map size, AA, tone mapping, pixel ratio), with a fourth "photo" path deliberately out of scope for a no-backend SPA. Their `HPRender.modes` list (`draft,balanced,high,ultra,pathtrace,ai`) is a ready-made ranking; take the first three. | M | §2.4.4 |
| 15 | **Full-screen as a top-level action** (`requestFullscreen`, unprefixed) — trivial, and the competitor treats it as a peer of the other tools. Add `Escape` handling and a state indicator. | S–M | §2.4.8 |

### Tier 3 — larger / differentiators

| # | Idea | Effort | Finding |
|---|---|---|---|
| 16 | **Keyboard-shortcut dialog that is actually wired to the shortcuts it lists.** The competitor ships a rich shortcut modal (round-1 §2.12) but no keyboard path for the view segment, levels, or 2D drawing — the dialog over-promises. For CasaPlazAI, list *only* implemented shortcuts and add `1/2/3` views, `Home` frame, `Esc` cancel/exit-walk. | M | §2.4.7, §2.7.5 |
| 17 | **Expose the editor API as an LLM tool surface**, mirroring the competitor's `window.HP3D.*` / `HPAI.tools` split: a small, documented, stable set of verbs (`setView`, `setLevel`, `frameAll`, `select`, `buildWall`, …) that both the toolbar and any future assistant call. Their toolbar literally calls the same exported functions the AI tool-calling layer uses — a good contract, and testable. | M–L | §2.4.1, §2.4.5, §2.6.3 |
| 18 | **AR / 4K / video / camera-tour capture** as a post-MVP surface (their `Capture and share` section). Only "camera tour" fits CasaPlazAI's existing Walk mode; the rest needs render hardware far beyond a no-backend SPA. | L | §2.4.4 |

### Anti-patterns observed (do not copy)

- A view segment whose only state is a CSS class (§2.7.1).
- A tool button whose `aria-label` disagrees with its visible label (§2.7.2).
- Bound-clamped steppers that never disable or announce the bound (§2.7.3).
- A full-screen overlay that swallows all pointer events and ignores `Escape` (§2.7.4).
- Building the chrome entirely in JS with **no** static markup — it makes the app un-scrapable and untestable without a browser; CasaPlazAI's Vite/TSX shell should keep chrome in the component tree.
- Serving the editor behind an onboarding redirect that a cold client cannot distinguish from the landing page — it cost real investigation time (§2.1).

---

## 4. Unknowns

1. **Walk motion untested.** The `UniversalCamera` and its key/ellipsoid/speed configuration are observed, but synthetic page-level key events did not reach the canvas and pointer lock never engaged, so I cannot report that WASD actually moves the camera. (Configuration is OBSERVED; motion is not.)
2. **Wall/room creation via the top-of-stack API was not achieved.** `HP3D.buildWall(...)` in four argument shapes, and `HP3D.wallBuilder.placeRoom()`, produced no element; the working primitive I found is `HP3D.buildSlab({points:[{x,z}…]})`. I did **not** discover the equivalent primitive for walls or for `HP3D.wallBuilder`'s pointer-driven path, so wall placement (as opposed to slab placement) is not observed.
3. **`#hpLevelPanel` "Visible floors: up to 50" was not exercised** — so the hypothesis that *it* (not the stepper) controls per-floor visibility is INFERRED from the fact that the stepper demonstrably does not.
4. **Does clicking `+` at level 50 actually attempt `51` (then clamp) or refuse?** The bound is enforced in `setLevel` and the button is never disabled; I did not instrument the click to see whether the handler guards before calling. Either way the observable result is a silent no-op at the bound.
5. **BIM panel's exact open call** was not identified — I wrapped `HPBIM.openPanel` and it did not fire, yet `#hpBimPanel` opened. The toolbar uses a different entry point (likely `HPUI.createPanel`) whose instance I did not capture.
6. **The `hp-panel`/`hp-popover` managers' full exclusion matrix** is inferred from three observed cases plus the decompiled managers; I did not test every ordered pair (e.g. Render while AI is open, Catalog while Help is open).
7. **Screenshots were not visually inspected** (no image input in this session); `evidence/p4_ready.png` and `evidence/p7_2d_open.png` are saved as raw artefacts. All layout claims come from DOM/accessibility/JS state.
8. **No AI, BIM-export, render or share action was executed** — out of scope and would touch vendor credits; only panel *opening* was observed.
9. **The `rea` scenario envelope reported `cleanup_incomplete`** (`browser_transport`, `browser_profile` not confirmed released). All 37 step artefacts were retained and are usable, but a future run should budget more teardown time or use a narrower capture set.
10. **`2D-Planner/index.php` internals** (its own grid snap, "Make wall", scale tools) were only enumerated as DOM; its behaviour and its sync protocol with the parent were not exercised. Round 1 also left the 2D planner unopened.
