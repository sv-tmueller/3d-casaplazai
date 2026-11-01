# Competitor Feature Inventory — 3D House Planner (https://www.3dhouseplanner.com/)

**Job:** 01-01-feature-inventory · **Target:** 3D House Planner, browser-based 3D/2D home design app
**For:** CasaPlazAI (single-page Vite/TypeScript/Three.js 2D/3D floorplanner, no backend, localStorage autosave)
**Method:** live page capture with REA 6.8.0 (`rea capture-browser-scenario`, Playwright/Chrome 156, 1600×950, headless, en-US), DOM + accessibility-tree + screenshot extraction, plus static reading of the bootstrap data embedded in the shipped page (`window.HP_BOOT`), plus vendor pages.
**Evidence:** all raw captures, screenshots and extracted text are in `./evidence/`, scenarios in `./scenarios/`, sources in `./sources.json`.

Legend for every claim below:
- **OBSERVED** — I captured it live and it is in an evidence file (file named).
- **DOCUMENTED** — text published by the vendor (page copy, tooltip, accessible name); *not verified by operating the feature*.
- **INFERRED** — my own reasoning/analogy, not stated or shown by the target.

> Scope note: no account was created, nothing was uploaded/downloaded, no form was submitted, no purchase made. Explored the landing page and the editor (`app.php`) reachable without login. The AI features, path tracing and cloud rendering were **not executed** (that would consume the vendor's AI credits / an external account); they are recorded as documented UI only.
> Licensing note: this site credits Sweet Home 3D 7.0.2's default catalog models (CC BY 3.0) and `homeRoughEditor` (MIT). Nothing from that codebase was copied; only behaviour, data shapes and UX patterns are described in my own words.

---

## 1. Summary

- **OBSERVED** 3D House Planner is a *free, no-login, no-install* browser editor backed by a PHP/Cloudflare server, but it behaves like a local app: projects live in browser storage (autosave + crash recovery), and identity is a `PHPSESSID` cookie only (`evidence/landing_settle_accessibility.txt`, `evidence/landing_probe.json`).
- **OBSERVED** Its editor shell is far richer than a floorplanner: a top bar (view modes, level stepper, 7 tools), a **left dock of 3 card tabs** (View and light / Build / Measure-copy-paint), a status bar, and a right-side catalog drawer with **1,776 catalog objects, 106 doors+windows, 456 textures across 157 categories** (`evidence/hp_boot.json`, `evidence/tabs_a11_catalog_accessibility.txt`).
- **OBSERVED** The Build tab alone exposes Wall builder (4 drawing modes, center/inside/outside wall-line position, thickness, height, 3 snapping toggles, room-by-size), skirting boards, crown/cove mouldings, a parametric **roads/rails/fences** generator, **terrain sculpting** and a 3-layer **terrain painter** (`evidence/tabs_a07_build_accessibility.txt`, `evidence/panel_rest.txt`).
- **OBSERVED** Everything is reachable without an account, including AI (Puter.js, 6 selectable models), BIM/IFC4 panels, render quality presets up to path tracing, 4K image/video/camera-tour/AR capture, and 12 export formats — the free tier is unusually wide rather than gated (`evidence/panel_file_render_level.txt`, `evidence/editor_ready.json`).
- **OBSERVED** Its onboarding is a **project-settings dialog first** (name, floor-to-floor height 2.65 m, 100 m plan size, m/ft units) followed by a 4-button "Start your project" empty state (Draw in 2D / Ask the AI / Draw walls in 3D / Open-import) — a pattern CasaPlazAI can adopt at near-zero cost (`evidence/editor_open_boot_accessibility.txt`, `evidence/tabs_a03_ready_accessibility.txt`).

---

## 2. Findings

### 2.0 Evidence index

| Evidence file | What it is |
|---|---|
| `evidence/landing_settle_screenshot.png` | **Landing page screenshot** (1440×900, settled) |
| `evidence/landing_settle_accessibility.txt`, `evidence/landing_settle_dom.html` | Landing page a11y tree + full DOM |
| `evidence/landing_probe.json` | Raw REA evidence for landing (cookies, storage, screenshot hashes) |
| `evidence/editor_open_scenario_start_screenshot.png` | **Editor screenshot, pre-start** (project-settings dialog over the 3D canvas) |
| `evidence/editor_open_boot_accessibility.txt` | Editor pre-start a11y tree |
| `evidence/ready_d03_ready_screenshot.png` | **Editor screenshot after "Start designing"** |
| `evidence/tabs_a05_view_screenshot.png` | Editor with **View and light** pane open |
| `evidence/tabs_a07_build_screenshot.png` | Editor with **Build** pane open |
| `evidence/tabs_a09_measure_screenshot.png` | Editor with **Measure, copy and paint** pane open |
| `evidence/tabs_a11_catalog_screenshot.png` | Editor with **Catalog drawer** open (13 categories) |
| `evidence/tabs_a13_help_screenshot.png` | Editor with **Keyboard shortcuts** dialog |
| `evidence/menus_b11_file_screenshot.png` | Editor with **File menu** open (import/export list) |
| `evidence/menus_b20_render_screenshot.png` | Editor with **render popover** open |
| `evidence/ready_d03_ready_dom.html` | Full post-boot editor DOM — every panel present in the DOM (2.1 MB) |
| `evidence/editor_ready.json`, `evidence/editor_tabs.json`, `evidence/editor_menus.json`, `evidence/editor_open.json` | Raw REA evidence for each scenario |
| `evidence/hp_boot.json` | Parsed `window.HP_BOOT` — the entire shipped catalog + PBR texture table (1.45 MB) |
| `evidence/panel_*.txt`, `evidence/editor_boot_text.txt`, `evidence/_leftdock_text.txt` | Plain-text dumps of every panel (readable without the 2.1 MB DOM) |
| `scenarios/*.json` | The exact reproducible REA scenarios (viewport, actions, capture settings) |

---

### 2.1 App family, technology and business model

- **OBSERVED** The site is four separate apps behind one brand (`evidence/landing_settle_accessibility.txt` §Tools):
  - 3D House Planner — `app.php` ("complete 3D editor with AI, BIM and live 2D plan")
  - 2D Planner — `index3.php` ("rooms, doors, windows and dimensions")
  - Material Editor — `index2.php` (a 3D model viewer/material editor at `app2.php`)
  - AI Rendering — `index5.php` (sketch/photo → render)
- **OBSERVED** Technology stack, read from the shipped HTML/JS references in `evidence/editor_open_boot_dom.html`:
  - Rendering: **Babylon.js** + `ammo.js`/`cannon.js`/`Oimo.js` physics + `earcut` + `babylonjs.loaders/serializers/postProcess/proceduralTextures`.
  - UI: **jQuery 3.2.1**, Bootstrap-ish CSS, `pep.js` for touch, `vanilla-lazyload`.
  - AI: **`https://js.puter.com/v2/`** ("AI by Puter.js · your account", `evidence/panel_rest.txt`).
  - **~35 separate deferred scripts**, each cache-busted and SRI-hashed via `js.php?f=editor%2F<hp-…>&v=…&integrity=sha384-…`; the module entry is `hp-editor`.
  - **No bundler** for the app code (per-module `js.php` includes) — the opposite of CasaPlazAI's Vite bundle.
  - Ad/analytics: Google AdSense `ca-pub-4394403726538170`, GA `G-SFHW3J2XZQ`.
- **OBSERVED** Monetisation: **donation-only** ("Free, no sign-up, no watermark", `evidence/editor_boot_text.txt`); an in-app `Support` button opens a PayPal donation dialog (`evidence/ready_d03_ready_dom.html`, `hp-status-donate`). No paywall, no account, no watermark.
- **DOCUMENTED** The landing page claims: "100% free, also for commercial use", "50 floors per project", "10+ import / export formats", "5 visualization modes", "2D ⇄ 3D always in sync", "Projects stay in your browser", "No login / Nothing to install" (`evidence/landing_settle_accessibility.txt`).
- **OBSERVED** Storage model: landing page set `PHPSESSID` (HttpOnly/Secure), a first-party `visted` cookie and Cloudflare `__cf_bm`; **`localStorage` and `sessionStorage` were empty** on the landing page (`evidence/landing_probe.json` → `normalized_result.steps[2].artifacts.storage`).
- **INFERRED** Because the model catalog (`HP_BOOT`, 1.45 MB of JSON) is **inlined into the page**, the server is a catalog host + AI proxy; the editing itself is client-side, same shape as CasaPlazAI but with a server-side object library.

---

### 2.2 Landing page (`https://www.3dhouseplanner.com/`)

**OBSERVED** — `evidence/landing_settle_screenshot.png`, `evidence/landing_settle_accessibility.txt`, `evidence/landing_settle_dom.html`.

- **Header:** logo → `./`; nav `What's new` (#new), `Features` (#features), `Tools` (#tools), `Contribute` (#donate), `Attribution` (#credit), `Blog` (external subdomain); **native `<select>` language picker with 10 languages** (EN, PT, ES, FR, DE, IT, RU, ZH, JA, KO); two persistent CTAs `Sketch now` and `Start designing — free`, both → `app.php`.
- **Hero:** H1 "Free 3D Home Design Software on the Web"; announcement strip "New: AI assistant, live 2D ⇄ 3D sync and BIM"; three trust chips (No login · Nothing to install · Projects stay in your browser); a paper-doll of capability stats; secondary CTA "Open the 2D planner" → `index3.php`.
- **"From idea to BIM model"** — six feature articles, each an h3 + paragraph (+ nested `<ul>`):
  1. *AI design assistant* — "Describe a room, a house or the furniture… attach a plan, a photo or a model. The assistant builds with the same tools as you."
  2. *Live 2D ⇄ 3D* — "No more 'Generate'."
  3. *From draft to photo-real* — quality dial from light draft to Ultra (soft shadows, AO, reflections, tone mapping) plus AI photos of the current view.
  4. *BIM in the browser* — IFC classes/properties on every wall/slab/opening/object; IFC4 import+export with property sets; areas, volumes, schedules and budget in CSV; model check (overlaps, missing hosts, empty levels).
  5. *Saved in your browser* — "Projects, autosave and crash recovery live in your browser storage… export everything at any time."
  6. *Import and export anything* — chips: IFC DXF GLB glTF OBJ STL SVG PNG CSV JSON.
- **"How it works"** — 3 steps: Draw/describe/import → Furnish and finish (thousands of objects, doors and windows that cut walls, roofs, terrain, paths) → Visualize and share (walkthrough, render, snapshots and videos, BIM/CAD/3D-print export).
- **"About / Free to Use / More Than a Home Sketcher"** cards (vendor copy).
- **"Powerful Features"** — 4 cards (Simple and Fast Sketch, Freedom in Customization, Save Your Work, Privacy Matters) each with a 5-item checklist; notable: "Design up to 50 floors", "Terrain modeling and painting, with contour lines", "No cloud storage", "Snapshot and recording capabilities", "We don't collect any design data".
- **"More free tools"** — 4 app cards (3D House Planner, 2D Planner, Material Editor, AI Rendering).
- **Donate block** — PayPal button + `Leave a Review` button that expands a **review-platform list**: SourceForge, Slashdot, AlternativeTo, G2, Product Hunt, Capterra, GetApp, Trustpilot, Clutch, SoftwareSuggest, GoodFirms, CrowdReviews, Crozdesk, SaaSHub.
- **FAQ** — 5 `<details>`-style groups: really free? / where are projects saved? / can I open it in BIM or CAD software? / how does the AI assistant work? / do I need a powerful computer? (Bodies are collapsed in the capture; only the first answer is expanded.)
- **Attribution** — Scopia, Kator Legaz, Blend Swap, ArchiBit Generation, ArchiBase.net, Free the models, **Sweet Home 3D 7.0.2 default catalog** (all CC BY 3.0 variants).
- **Footer + related-tools links** — 5 SEO landing pages (`tools/3d-house-layout-planner-free.php`, `tools/online-3d-home-design-software.php`, `tools/best-free-room-designer-3d.php`, `tools/free-apartment-design-tool-online.php`, `tools/architectural-house-design-software-free.php`), Terms, Privacy, blog, mailto, Instagram/Facebook/YouTube; plus a fixed **cookie-consent bar** ("Accept").
- **OBSERVED** Sibling landing pages (`https://www.3dhouseplanner.com/index3.php`, `index2.php` — fetched as documents): the 2D Planner CTA is `/2D-Planner`; its attribution names **`homeRoughEditor` under the MIT licence**; the Material Editor's editor lives at `app2.php`.

---

### 2.3 Editor entry and onboarding

**OBSERVED** — `evidence/editor_open_boot_accessibility.txt`, `evidence/editor_open_scenario_start_screenshot.png`, `evidence/ready_d03_ready_accessibility.txt`.

1. **Boot:** body class `hp-dialog-open`; a `hp-dialog-loading` overlay (`#modal0`, text "Preparing the scene…") then a modal **"Project settings"** (`#modal1`):
   - `Project name (optional)` — placeholder "My house"
   - `Floor-to-floor height` — slider, default **2.65 m**; helper "Vertical distance between two levels, slab included. New walls use this height."
   - `Floor plan size` — slider, default **100 m**; helper "Side of the square ground and grid you will build on."
   - `Units` — radio group `Meters (m)` / `Feet (ft)`
   - footer button **"Start designing"**
2. **Post-start empty state** ("Start your project" card, `evidence/tabs_a03_ready_screenshot.png`): paragraph "Draw a plan, describe a house to the AI or open something you already have. Everything stays in this browser." + **4 large buttons**:
   - `Draw in 2D` — "Walls, doors and rooms appear in 3D as you draw"
   - `Ask the AI` — prefilled "A 3-bedroom house with a gable roof"
   - `Draw walls in 3D` — "Turn on the wall builder"
   - `Open / import` — "Projects, IFC, DXF, GLB, OBJ, images…"
   - plus a `Hide` button.
3. **Guided tour:** Help → **"Show the first steps tour"** (`evidence/tabs_a13_help_accessibility.txt`).
4. **OBSERVED** `evidence/ready_d03_ready_dom.html` also contains a **`#setupProgress`** element and `#definefloor` button — the wizard is resumable/scripted.

**INFERRED** The settings-first wizard is how they get a sane default grid size and unit system before the user draws; CasaPlazAI's fixed 0.5 m grid has no equivalent moment.

---

### 2.4 Editor chrome — top bar and status bar

**OBSERVED** — `evidence/ready_d03_ready_accessibility.txt`, `evidence/ready_d03_ready_dom.html`.

**Top bar (`hp-topbar`), left → right:**
| Control | id / type | Detail |
|---|---|---|
| Brand | `a.hp-brand` | → `index.php` (leaves the editor) |
| Project name | `input.hp-project-name` (aria "Project name") | inline rename, default "Untitled project" |
| Save state | text | "Unsaved changes" |
| History group | `role="group"` labelled **History** | `Undo` / `Redo`, both `[disabled]` on a fresh project |
| View segment | `#hpViewSeg` `role="group"` | **3D · Walk · Top · 2D plan** |
| Level stepper | `Level` + `−` `0` `+` | numeric level, also `#hpLevelPanel` |
| Tools | buttons | `Frame all` (`#hpToolFrame`, title "Show the whole project (Home)") · `File` (`#hpToolFile`) · `Catalog` (`#hpToolCatalog`) · `Balanced` (`#hpToolRender`, aria = current quality) · `AI assistant` (`#hpToolAi`, **primary-styled**, title "AI assistant (Ctrl+K)") · `BIM` (`#hpToolBim`) · `Help` (`#hpToolHelp`) · `Full screen` (`#hpToolFullscreen`) |

**Status bar (`hp-statusbar`):**
| Control | Detail |
|---|---|
| `Tools` (`handyman`) | opens the status-bar tool popover |
| selection indicator | icon + text, e.g. **"Nothing selected"** |
| `2D⇄3D` | non-interactive `hp-status-sync` div, title "Live 2D ⇄ 3D sync on" |
| units `m` | `hp-status-units` button, toggles m/ft for **both** 3D and the 2D plan |
| `60 FPS` | live FPS readout |
| `Support` | donation dialog trigger |
| `EN` | language menu, 10 `menuitemradio` entries with checkmarks |

**OBSERVED toasts:** `#hp-toasts` container; **tooltip singleton** `#hpTooltip role="tooltip"`.

**INFERRED** The status bar is the single cheapest high-perceived-quality element to copy: it always answers "what is selected, what units, is sync on, is it fast?".

---

### 2.5 Left dock — the three-card tool system

**OBSERVED** — `evidence/tabs_a05/a07/a09_*`, `evidence/panel_rest.txt`, `evidence/panel_cards.txt`.

The dock (`#hpLeftDock`) stacks a **"Floors & grid"** card on top of a **3-tab card** (`#hpToolCard`, `role="tablist"`).

#### 2.5.1 "Floors & grid" card (`#hpLevelPanel`)
- `Visible floors: up to 50` slider (default 50, "up to 50")
- `Current floor: 0`
- `Snap to grid: 0.125 m` slider (index 8) — **note: 12.5 cm default, not 0.5 m**
- `Wall height: 2.65 m`, `Wall thickness: 0.20 m`
- Terrain/brush live readouts: `Terrain radius: 5.00 m`, `Terrain strength: 0.01`, `Brush radius: 0.8 m`, `Brush strength: 1`
- `Duplicate level…` button
- Collapse button (`hp-fcard-collapse`, aria "Collapse")

#### 2.5.2 Tab **View and light** (`#viewtab`)
- `2D` button — "Open the 2D planner (synced with 3D)" (id `open2DPlanner`)
- `Walk` button
- `Time of day` slider (default 10:00 / 600) with tick marks at **06:35, 11:52, 17:09**
- `Date` textbox (2026-10-31)
- Season presets `Summer` · `Equinox` · `Winter`
- `Sun study…` button
- `Floors & grid` / `Duplicate level…` sit above it (2.5.1)

#### 2.5.3 Tab **Build** (`#tooltab`)
Top-level toggles (each a checkbox, sub-panel expands in place):
| Toggle | Sub-panel contents (OBSERVED) |
|---|---|
| **Wall builder** (`#wallbuilderopts`) | *Drawing mode*: `Chain`, `Single`, `Rectangle`, `Arc` — tooltips: "Continuous walls: each click ends a wall and starts the next one", "One wall per two clicks", "Two clicks on opposite corners make 4 closed walls", "Curved walls: click the start and the end, then move the mouse to bend the wall and click". *Wall position on the line*: `Center` ("the drawn line is the center line"), `Inside` ("walls inside the drawn outline"), `Outside`. *Thickness* 0.20 m, *Height* 2.65 m. *Snapping*: `Grid` (tooltip mentions holding **Shift** mid-draw), `Angles` ("snap directions to 15° steps (0°, 45° and 90° first), also relative to the previous wall"), `Magnet` ("snap to wall ends, onto walls (T-junctions) and to alignment guides"). *Room by size*: width × depth inputs in m + `Place` ("the room follows the cursor: click to drop it by its corner"). |
| **Skirting board on the walls** (`#wallskirtopts`) | `Height (cm)`, `Color` |
| **Crown / cove** (`#ceiltrimtools`) | `Type` = Crown moulding / Cove (closed) / Open cove with LED; `Projection (cm)`, `Height on the wall (cm)`, `Color`, `LED colour`; helper "Moulding where the walls meet the ceiling, mitred at the corners… click the floor of a room in the 3D view to add it (clicking again replaces it). Esc or the switch turns it off."; bulk actions `All rooms of the level`, `Remove from the level` |
| **Roads, rails & fences** (`#lineartools`) | `Type` = Railway / Road 2 lanes / Road 1 lane / Fence-railing; placement `Row` / `Piece`; alignment `Auto` / `Straight` / `Curve`; crossing presets `90° corner`, `Switch`, `Crossing`; **`Curve radius` presets Tight R 26 m / Medium R 51 m / Wide R 101 m**; fence `Model` picker (e.g. "Pine picket fence panel") + `Posts at the joints` / `No posts`; `Whole panels` / `Follow the terrain` / `Around a floor`; street-light model + `Every … m`; `Use a scene object`; `Undo`, `End run`; helper "Pieces of the catalog joined end to end. The rings are free ends: click one to go on from it." |
| **Terrain sculpting** (`#terraintools`) | `Draw path` toggle with `Width` 4.00 m and `Subd. len.` 5.00 m; `Terrain painter` toggle |
| **Terrain painter** (`#painttexturepanel`) | **3 independent paint layers**, each with: texture button (label "Paint with this layer", `Change texture`), **UV scale** = Automatic (by texture) / a numeric value, and a **Vegetation** `<select>`: None, Grass and flowers, Dry grass, Pebbles, Sand (shells), Mud (twigs), Bog (reeds), Water (realistic surface) |
| **Floor** (`#floorButton`) | `Floor edges` stepper + slider, default **4** |
| **Roof** (`#roofButton`) | `Roof edges` stepper + slider, default **4** |
| **Rough opening** (`#frameButtonW`) | `Wall length` stepper + slider, default **4.00 m** |
| **Door opening** (`#frameButtonD`) | `Wall length` stepper + slider, default **4.00 m** |
| **Hip roof** (`#roofButtonPoly`), **Gable roof** (`#roofButtonPoly2`) | one-click roof types |

**OBSERVED** Terrain-texture picker modal (`#modalpaintterrain`) with **35 built-in ground textures** — Grass, Dry grass, Wet rock, Bog, Rock, Rock 1–7, Dirty rock, Rock and snow, Sand, Sand 2, Ice, Ice 2, Snow, Snow 2, Water, Water 2, Mud, Pebbles, Asphalt, Blocks, Blocks 2/3/4, Cobblestone, Cobblestone 2, Concrete — plus `Upload image` and `Generate with AI` tabs.

#### 2.5.4 Tab **Measure, copy and paint** (`#extensiontab`)
- **Measure** toggle → `#hpMeasureOpts`: mode `Distance` / `Angle`; prompt **"Click the first point"**; helper "Snaps to the corners of walls, openings, floors and objects. Shift: along an axis · Esc: cancel"; checkbox **"Keep the measurements in the project"**; group **"Dimensions in 3D"** with checkboxes `Walls and overall size`, `Doors and windows`, `Room areas`, `Heights`; **`Stats`** button.
- **Material brush** toggle → `#hpMaterialPanel`: `Material` segmented `Standard` / `PBR`; `Color` (with preset swatches `#ffffff #f5f0e6 #d6c7a1 #a47551 #6b4f3a #9e9e9e`, `evidence/ready_d03_ready_dom.html`); `U scale`, `V scale`, `Texture angle`; PBR sliders `Metallic`, `Glass` switch, `Refraction index` (1–1.7), `Roughness`, `Transparency` (0.1–1), `Emissive` (+ inline number); actions `Textures` ("Open the texture library") and **`AI texture`** ("Generate a texture with AI").
- **Copy panel** (`#hpCopyPanel`): `Copy to another floor`, `Paste to floor 0`, `Paste`, `Copy material`, `Paste material`.

**INFERRED** The single most interesting structural idea is that **every Build tool is a checkbox toggle whose parameters appear inline**, rather than a modal wizard or a separate mode screen — one dock, one scroll, no context switch.

---

### 2.6 Catalog drawer (objects + textures)

**OBSERVED** — `evidence/tabs_a11_catalog_accessibility.txt`, `evidence/ready_d03_ready_dom.html`, `evidence/hp_boot.json`.

- Drawer `aside#mySidebar.hp-catalog`, `aria-label="Catalog"`, close button; opened from `Catalog` in the top bar.
- Two tabs: **Objects** / **Textures** (`data-tab="tab1"` / `"tab2"`).
- **Search** input per tab (`autocomplete-input`, `autocomplete-input2`, placeholder "Search objects"), with a **clear** button and a live `aria-live="polite"` results-status region; result container `#search_results` / `#search_results2`.
- **Breadcrumb drill-down** (`nav.hp-crumbs` + list levels 1→4) — example paths observed: `Living room → Decoration → …`, `Architecture → Bricks → …`, `Architecture → Indoor tiles → Ceramic → …`. "All categories" resets.
- **Recently used** section (`#hp-recent`, `hidden` when empty).
- Category counts, all **OBSERVED** in the Objects tab:

| Category | Count | Category | Count |
|---|---|---|---|
| Living room | 317 | Lighting | 101 |
| Bedroom | 278 | Garden | 101 |
| Kitchen | 191 | Leisure | 151 |
| Bathroom | 91 | Vehicles and transport | 162 |
| Doors and windows | 106 | Tools and equipment | 29 |
| Stairs and railings | 53 | Other | 281 |
| Laundry and storage | 21 | | |

- **OBSERVED data model (`window.HP_BOOT`, `evidence/hp_boot.json`):**
  - `objectOptions`: **1,776** entries — `{id, title, title_en, image, path, slug, …}`. File formats: **1,775 `.glb` + 1 `.gltf`**.
  - `doorOptions`: **60** doors — e.g. `{id:27, title:"Red mahogany panel door", image:"/admin/imagedetails/mgodoor.png", path:"/admin/objects/9mpdoor.glb", rotation_offset:null}`.
  - `windowOptions`: **46** windows — e.g. `{id:14, title:"White sliding window pair", …}`.
  - `objectCategories`: **157** rows `{id, category, category_en, parent, grand_parent}` → 63 roots (Kitchen, Garden, Bathroom, Bedroom, Living room, Electronics, Furniture, Appliances, Doors and windows, Lighting, Decoration, Outdoor, Indoor, School, Office, Shop, Healthcare, Hair salon, Laboratory, Public spaces, Geometric shapes, Buildings, Pools and spa, Games, Fences and gates, …). Several root names repeat at different ids (`Furniture` ×5, `Fixtures` ×3, `Other` ×2) — a flat table with `parent`, not a clean tree.
  - `floorplanTextureCatalog`: **456** textures `{id, title, category, parent, featured, image, imagebump, …}` — floor/wall materials with a featured flag.
  - `products`: map `id → {id, file, model, doorWindow, door}`.
  - `textures`: map `id → PBR set {image, bump, occlusion, reflectivity, metallic}`.
  - `suggestions`: `{objects: [...], textures: [...]}` — pre-seeded search/quick-pick lists.
- **OBSERVED** Catalog images are lazy-loaded from `/admin/imagedetails/*.png|jpg` and models from `/admin/objects/*.glb`.

**INFERRED** The catalog is a **flat `id → GLB` map plus a flat category table with parent pointers and up-front counts** — a shape that would drop into a localStorage/IndexedDB app without a backend as long as the GLB set is bundled or fetched on demand.

---

### 2.7 File menu — project I/O and export

**OBSERVED** — `evidence/menus_b11_file_accessibility.txt`, `evidence/panel_file_render_level.txt`, `evidence/menus_b11_file_screenshot.png`.

`#hpFileMenu` (top-bar `File`, title "Projects, import and export (saved in this browser)") is a two-part popover:

**Project / input**
- `New project`
- `Open…`
- `Save` (shortcut shown **Ctrl S**)
- `Save as…`
- `Share view link`
- `Import…` — subtitle "IFC, DXF, GLB, OBJ, STL, JSON"
- `Import floor plan`
- `Import terrain color map`

**Export (`file_download`) — exactly 12 formats**
`Project (.hpbim.json)` · `PDF sheets` · `IFC 4 (BIM)` · `GLB` · `glTF` · `OBJ` · `STL (3D print)` · `DXF plan (CAD)` · `SVG plan` · `CSV schedule` · `PNG image`

**OBSERVED** The menu items are implemented as `button.hp-menu-chip[data-fileact="ex…"]` — a single delegated click handler with a `data-fileact` verb, not a routing table (`evidence/ready_d03_ready_dom.html`).

**OBSERVED related modal (`#modalplan`, "Bring in a floor plan"):** two modes — *Upload an existing floor plan* (JPG, PNG, BMP, GIF, SVG; `Image width/length in real scale` default 50.00 m) and *Generate a new plan with AI* (Prompt + `AI model` picker + `Quality` Low/Medium/High + `Generate preview` / `Insert into scene`).
**OBSERVED related modal (`#modalheightmap`, "Bring in a terrain color map"):** `Max height` 10.00 m, real-scale width/length 50.00 m, upload or AI-generate; supported JPG, PNG, BMP, GIF, SVG, **WEBP**; "Get height maps from real-world terrain data"; `Create terrain preview`.

**INFERRED** Export is a **chip list, not a settings dialog** — no format-options step, no file-size/quality choice before download. Very low friction; also low control.

---

### 2.8 Render / visualization popover

**OBSERVED** — `evidence/menus_b20_render_accessibility.txt`, `evidence/panel_file_render_level.txt`, `evidence/menus_b20_render_screenshot.png`.

`#hpRenderPopover` (top-bar quality button, `aria-label` = current quality), sections:
1. **Real-time quality** — four segmented choices: `Draft` · `Balanced` · `High` · `Ultra realistic`; helper "Original look. Soft shadows on the ground. Photorealistic image".
2. **`Path tracing`** — "Real bounced light, in the browser".
3. **`AI photo`** — "Generated by AI in the cloud".
4. **Show in the scene** — checkboxes `Dimensions in 3D`, `Contour lines on the terrain`, `Vegetation and water on the painted terrain`.
5. **Sun and materials** → `Sun study` row ("Date, time, shadows and sun path") and **`Realistic materials (PBR)`** ("Best with High / Ultra") with a `Convert materials` button.
6. **Capture and share** → `Share view link` ("Anyone with the link sees the project in 3D, without editing"), `4K image`, `Video`, `Camera tour`, `AR`.

**OBSERVED** A separate record/video badge `#stop.hp-rec-badge` exists in the DOM.

**INFERRED** "5 visualization modes" (landing copy) maps onto Draft/Balanced/High/Ultra (+ path tracing); the popover is the app's single "how good should this look, and how do I capture it" surface.

---

### 2.9 2D ⇄ 3D sync and the embedded 2D planner

**OBSERVED** — `evidence/ready_d03_ready_dom.html`.
- The editor embeds a **full-screen 2D planner frame** (`#floorplanFrameContainer`, `position:fixed`, hidden by default) with its own local toolbar containing **`Live sync 2D ⇄ 3D`** (`#hpSyncToggle`) and **`Floors follow the rooms`** (`#hpSyncSlabs`) checkboxes, plus `View in 3D` (`#generate3D`) and `Close` (`#close2DPlanner`).
- Status bar mirrors the state as a read-only `2D⇄3D` item ("Live 2D ⇄ 3D sync on").
- **DOCUMENTED** (landing copy): "Draw in 2D and see it in 3D, move a wall in 3D and the plan follows. No more 'Generate'."

**INFERRED** The 2D planner is a *separate app* (homeRoughEditor, MIT) mounted inside the 3D editor, with two integration checkboxes plus a fallback "View in 3D" button for when sync is off. CasaPlazAI has one canvas for both; the valuable idea is the **explicit, user-visible sync toggle plus a "floors follow the rooms" derivation rule**.

---

### 2.10 AI layer

**OBSERVED** — `evidence/panel_rest.txt` (`#hpAiPanel`), `evidence/editor_boot_text.txt` (dialogs), `evidence/editor_open_boot_dom.html` (i18n tool names).

- **Assistant panel** (`#hpAiPanel`, opened by the primary `AI assistant` tool, also **Ctrl+K**):
  - model selector with **6 models**: `Claude Sonnet 5.5`, `Claude Opus 5.5`, `GPT-5.5`, `GPT-6.1 Sol`, `Gemini 3.1 Pro`, `Gemini 3.8 Flash (fast)`
  - header `add_comment`, close; greeting: *"Hi! I build and edit the project with the same tools as you: rooms and whole houses, walls, doors, windows, roofs, furniture from the catalog, textures, terrain and BIM data. Attach a floor plan, a photo or a file to start from it."*
  - **5 canned prompts**: "Create a house with 2 bedrooms, living room, kitchen and bathroom" · "Furnish the living room" · "Wood floor in every bedroom" · "Put a gable roof on the house" · "Make a sloped terrain around the house" · "Check the BIM model and estimate the cost"
  - `attach_file` button, send button, footer "AI by Puter.js · your account"
- **OBSERVED tool taxonomy** — the i18n table declares **32 assistant tools** (`ai.t.*`), which is effectively their internal scene-editing API:
  `get_scene_info`, `list_elements`, `select_element`, `get_room_layout`, `search_catalog`, `check_layout`, `create_house`, `create_walls`, `create_floor`, `create_roof`, `furnish_room`, `place_object`, `create_custom_object`, `transform_element`, `set_color`, `apply_texture`, `generate_texture`, `add_opening`, `add_skirting`, `remove_skirting`, `delete_elements`, `set_level`, `set_view`, `sculpt_terrain`, `convert_floorplan_image`, `import_attachment`, `save_project`, `export_model`, `bim_elements`, `bim_summary`, `bim_check`, `bim_set_property`, `bim_set_price`.
- **OBSERVED AI modals:** *AI floor plan converter* (`#modalfloorplanai`) — "Walls are traced from the image; the AI model checks them, finds doors, windows and room types"; model list includes `Gemini 3.1 Pro (default, most precise)`, `Gemini 3.8 Flash (faster)`, `Claude Opus 5.5`, `Claude Sonnet 5.5`, `GPT-5.5`, `GPT-6.1 Sol`, `GPT-6 Astra`, `Qwen 3.7 Plus`, `No AI (image analysis only)`; checkboxes "Apply wall and floor textures by room type", "Insert detected doors and windows"; note "If the selected model is unavailable, the other models are tried automatically." — *terrain height-map* (`#modalheightmap`) and *terrain texture* (`#modalpaintterrain`) and *object texture* (`#modalAiTexture`) each also expose prompt + AI model + Quality + preview.

**INFERRED** The assistant is not a separate code path — it is a **tool-calling client over the same scene-editing primitives the UI uses** (the greeting says so explicitly). The observable contract is a good template for how to expose CasaPlazAI's own editor to an LLM later.

---

### 2.11 BIM layer

**OBSERVED** — `evidence/panel_rest.txt` (`#hpBimPanel`).

Top-bar `BIM` opens a panel with own `undo`/`redo`/`close` and **10 tabs**:
`Model` · `Properties` · `Types` · `Quantities` · `Schedules` · `Check` · `Codes` · `Efficiency` · `Project` · `Projects`.

**DOCUMENTED** (landing copy, `evidence/landing_settle_accessibility.txt`): every wall, slab, opening and object carries IFC classes and properties; IFC4 import **and** export with property sets; areas, volumes, schedules and budget in CSV; model check for overlaps, missing hosts and empty levels.

**INFERRED** `Codes` + `Efficiency` suggest rule-based building-code checks and an energy/efficiency score; I could not open those tab bodies (they render on demand), so their content is unverified.

---

### 2.12 Help, shortcuts and accessibility

**OBSERVED** — `evidence/tabs_a13_help_accessibility.txt`, `evidence/tabs_a13_help_screenshot.png`.

`Help` → modal **"Keyboard shortcuts"** with a **"Show the first steps tour"** button and three groups:
- **View** — `Home` show the whole project · `F` focus camera on selection · `W A S D` walk (first-person; arrows too) · `Esc` close panels/menus
- **Editing** — `1 / 2 / 3` move/rotate/scale gizmo · `Shift` hold while moving: snap to grid · `Ctrl + C` copy · `Ctrl + V` paste at the last clicked point · `Ctrl + click` select several objects · `Del` delete selection · `Ctrl + Z` undo · `Ctrl + Y` redo
- **Drawing walls** — `Enter` finish the walls (or double-click) · `Tab` type the angle after the length · `Backspace` remove the last point
- **Project** — `Ctrl + S` save project in browser · `Ctrl + K` AI assistant
- Footer `Got it`.

**OBSERVED accessibility quality:** real `role="tablist"`/`role="tabpanel"`/`aria-selected`/`tabindex` on tabs; `role="group"` for view and history; `aria-label` on icon-only buttons; `aria-live="polite"` on search results; `aria-haspopup="dialog"`/`"menu"` and `aria-expanded` on popovers; `aria-hidden="true"` + `translate="no"` on every Material icon; `data-i18n` on user-visible strings; `#hpTooltip role="tooltip"` singleton; a11y tree is clean enough that a text dump is a usable spec.

**INFERRED** There is essentially **no keyboard-first 2D drawing path** — no shortcut for rectangle/polygon/room tools; `Enter`/`Tab`/`Backspace` only work once the wall builder is active.

---

### 2.13 Data, persistence and privacy (as observable without an account)

- **OBSERVED** No login, no account UI anywhere: header, editor top bar and status bar contain no sign-in affordance. Landing copy confirms "No login required".
- **OBSERVED** `PHPSESSID` + `visted` + Cloudflare `__cf_bm` cookies only; landing-page `localStorage`/`sessionStorage` empty (`evidence/landing_probe.json`).
- **DOCUMENTED** "Projects, autosave and crash recovery live in your browser storage. No account, no upload, no database — and you can export everything at any time." and "No cloud storage - your designs remain private".
- **OBSERVED** The editor tells the user the storage state continuously: **"Unsaved changes"** in the top bar and a `Ctrl S` / `Save` / `Save as…` File-menu path.
- **OBSERVED** Project interchange format is a single JSON file, extension **`.hpbim.json`** ("Project (.hpbim.json)"), plus a **Share view link** (needs a server to host the shared view).
- **INFERRED** Since the whole catalog is inlined on every editor load (1.45 MB JSON + Babylon.js), the app is *not* offline-first, but the *project* is local — same privacy posture as CasaPlazAI, minus the server-side catalog.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Each idea names the finding it comes from. `S` = small (hours), `M` = medium (days), `L` = large (week+).

### Tier 1 — high value, low effort (do first)

| # | Idea | Effort | Finding |
|---|---|---|---|
| 1 | **Persistent status bar** with live `Nothing selected` context, `2D⇄3D` sync badge, `m/ft` unit toggle, FPS, and a `Support`/feedback slot. This is pure chrome and it makes the app feel finished. | S | §2.4 |
| 2 | **Consolidate view modes into one segmented control**: `3D · Walk · Top · 2D` instead of separate mode buttons. One control, one mental model, keyboard `1..4`. | S | §2.4 |
| 3 | **4-button empty state** ("Draw rooms in 2D", "Draw walls", "Furnish a room", "Open / import") shown when the plan is empty, dismissible, with a `Hide` action and a "show the tour" link. | S | §2.3 |
| 4 | **Full keyboard-shortcut dialog + implement the set**: `Home`/`F` for framing, `Esc` to cancel, `Del`, `Ctrl+Z/Y`, `Ctrl+C/V`, `1/2/3` for gizmo, `Shift` to force grid snap mid-drag, and for wall drawing `Enter` finish / `Tab` type angle / `Backspace` undo last point. | S–M | §2.12 |
| 5 | **Group File operations like a real app**: New / Open / Save / Save as… / Import… / Export ▸ (flat chip list of formats, grouped by "project" vs "CAD/3D/plan/image"). No options dialog. | S | §2.7 |
| 6 | **"Unsaved changes" indicator + editable project name in the top bar**, wired to the existing localStorage autosave. Explicitly show "Saved · 12:04" so autosave is legible. | S | §2.4, §2.13 |
| 7 | **Undo/Redo buttons with disabled states** in the top bar next to the view segment (CasaPlazAI already has history; this exposes it). | S | §2.4 |
| 8 | **Wall-line position: Center / Inside / Outside** for the rectangle and polygon tools. Users otherwise get a 0.2 m systematic error on every room dimension. | S | §2.5.3 |
| 9 | **Angle snapping toggle (15° steps, 45°/90° first) plus a "magnet" toggle** snapping to wall ends, onto walls (T-junctions) and to alignment guides — layered on top of the existing 0.5 m grid snap, with `Shift` as the temporary override. | S–M | §2.5.3 |
| 10 | **"Room by size"**: type width × depth, then click to drop the room by its corner. Kills the most common precision complaint for rectangle rooms. | S | §2.5.3 |
| 11 | **Export as SVG** (vector plan) and **CSV** (object/room schedule: name, room, x, y, w, d, m²) alongside PNG/JPEG. Both are near-free from existing plan data and immediately useful. | S | §2.7 |
| 12 | **Recently used + category counts in the furniture palette.** CasaPlazAI's palette is small — but "recently used" plus counts is what makes a small palette feel sufficient. | S | §2.6 |
| 13 | **Adaptive grid snap readout** in the "Floors & grid" sense: show the current snap size as a labelled value the user can change (0.05 / 0.1 / 0.25 / 0.5 m), not a hidden constant. | S | §2.5.1 |

### Tier 2 — high value, medium effort

| # | Idea | Effort | Finding |
|---|---|---|---|
| 14 | **Three-card left dock** (`View & light` / `Build` / `Measure & edit`) where each tool is a **checkbox with inline parameters** instead of a modal or separate screen. This is the single biggest structural UX win available and it directly supports the in-progress single-workspace redesign. | M | §2.5 |
| 15 | **Open / Save project as a local `.json` file** (`Save as…`, `Open…`) in addition to localStorage. Removes the "my browser ate my plan" risk and matches the competitor's `.hpbim.json` story. | M | §2.7, §2.13 |
| 16 | **Render quality presets** `Draft / Balanced / High` mapped to Three.js renderer flags (shadows on/off, shadow map size, AA, tone mapping, pixel ratio). Three named presets beat one "quality" slider. | M | §2.8 |
| 17 | **Sun study**: time-of-day slider + date + season presets driving the existing directional light, plus a "show sun path" checkbox. CasaPlazAI already has a sun; this is mostly UI + shadow recalculation. | M | §2.5.2, §2.8 |
| 18 | **Dimension overlays toggle**: "Walls and overall size", "Doors and windows", "Room areas", "Heights" — drawn in the 3D view, derived from the measure tool's data. High perceived value for almost no new geometry. | M | §2.5.4 |
| 19 | **Distance / Angle measure modes with corner snap + `Shift` axis constraint + "keep measurements in the project"**, plus a `Stats` readout (total area, room count, object counts). | M | §2.5.4 |
| 20 | **Per-object material/color editing with swatches + PBR sliders** (roughness, metalness, transparency, emissive). Maps 1:1 onto `MeshStandardMaterial`; swatches are the cheap 80 %. | M | §2.5.4 |
| 21 | **Copy / Paste material and Copy / Paste to another level.** "Copy material" is trivial; the floor variant prepares the (currently absent) level concept. | M | §2.5.4 |
| 22 | **Fit/collision feedback upgrade** for furniture placement: show the competitor-style magnet/alignment guides while dragging and a live footprint outline, on top of the existing collision constraint. | M | §2.5.3, §2.6 |
| 23 | **GLB export of the current scene** (Three.js `GLTFExporter` on the existing scene graph) — unlocks every downstream 3D tool and is a genuinely differentiating "free, no watermark" feature. | M | §2.7 |
| 24 | **PDF plan sheet export** (plan + dimensions + title block) generated client side. A single-page PDF is what people actually print and hand to a builder. | M | §2.7 |
| 25 | **Search box + category tree over the furniture palette**, even for ~10 items: search by name/synonym with an `aria-live` result count, and category chips with counts. | M | §2.6 |
| 26 | **Skirting board and ceiling trim as parametric per-room options** (height, color; then crown/cove with projection + height). Both read as "the room is finished" and are cheap geometry. | M | §2.5.3 |

### Tier 3 — worth noting, larger effort (do only with a concrete plan)

| # | Idea | Effort | Finding |
|---|---|---|---|
| 27 | **Levels/floors** (up to N, `+`/`−` stepper, "Duplicate level…", "floors follow the rooms" derivation). Large because it touches the room/wall data model, but the competitor's 50-floor ceiling shows it is a headline feature. | L | §2.4, §2.9 |
| 28 | **Roof tools** (hip/gable one-click with an edges stepper, pitch input). High visual payoff; needs a roof geometry generator. | L | §2.5.3 |
| 29 | **Terrain sculpting + 3-layer terrain painting with vegetation select.** Very large; only pursue if outdoor/landscape is a target segment. | L | §2.5.3 |
| 30 | **Parametric paths** (roads, rails, fences with curve radius presets and auto placement every N m). Large and niche. | L | §2.5.3 |
| 31 | **AI assistant as a tool-calling client over the editor's own primitives.** The competitor's 32-tool taxonomy (`get_scene_info`, `create_walls`, `furnish_room`, `check_layout`, …) is a ready-made contract to copy conceptually. Also introduces the app's only backend dependency — gate it behind an opt-in. | L | §2.10 |
| 32 | **BIM/IFC4 export with property sets, schedules, budget and model check.** Large; only worth it if the target user is a professional/permitting audience. The export *list* (IFC4, DXF, STL, PDF, CSV) is the cheapest way to signal the capability later. | L | §2.11 |
| 33 | **Collaboration-free "Share view link"** requires hosting a read-only snapshot — contradicts the no-backend constraint. Alternative: **export a self-contained HTML viewer** (single file inlining plan + Three.js scene) and "share" that by attaching the file. | L | §2.7, §2.8 |
| 34 | **4K image, Video, Camera tour, AR capture.** Camera tour (scripted keyframe path through rooms) is the most transferable and fits "walk through the plan in 3D". | L | §2.8 |
| 35 | **Onboarding project wizard** (name, default wall height, plan extent, units) before the first draw. Cheap to build, but CasaPlazAI's fixed 0.5 m grid means less value than for a 100 m terrain app; keep it to a 3-field inline panel rather than a blocking modal. | S–M | §2.3 |

### Anti-patterns to avoid (from the same findings)

- **Not** a blocking settings modal before the canvas is usable (§2.3) — CasaPlazAI is a lightweight SPA; the 4-button empty state alone gets most of the benefit.
- **Not** 35 separate un-bundled scripts with per-file cache-busting and ad/analytics tags in the editor shell (§2.1).
- **Not** a 1.45 MB catalog inlined on every load (§2.6) — CasaPlazAI's no-backend constraint means the palette should stay small and local, or load lazily from bundled chunks.
- **Not** 63 root categories with duplicate names (§2.6) — the catalog's category table is visibly organically grown; CasaPlazAI should keep a hand-curated shallow taxonomy.

---

## 4. Unknowns / what I could not verify

1. **Panel bodies that render on demand were only partially reachable.** `#hpBimPanel` exposes 10 tab labels (`Model`, `Properties`, `Types`, `Quantities`, `Schedules`, `Check`, `Codes`, `Efficiency`, `Project`, `Projects`) but I could not enumerate their contents; likewise the Material-Brush preset list and some `Build` sub-panels beyond their initial state. **OBSERVED: labels only; contents unverified.**
2. **AI features were not executed.** No prompt was sent, no model was called, no floor-plan image was converted. All model names, quality options and copy are **DOCUMENTED UI text**, not tested behaviour. The claim that the assistant "builds with the same tools as you" is vendor copy plus the presence of 32 `ai.t.*` i18n keys — I did not confirm a single tool call.
3. **"Share view link" was not exercised** (would have published a project). Whether it needs an account, expires, or is editable is unknown.
4. **Path tracing, 4K image, Video, Camera tour and AR** were not run — GPU/time cost, and capture would not have shown the user-facing result reliably.
5. **Two capture attempts failed and are recorded as failures, not findings:** a scenario that aborted on an ambiguous Playwright selector (`Balanced` matched both the toolbar button and a quality chip — `evidence/editor_menus.json`, steps `b22`+), and a longer panel scenario (`evidence/editor_panels3.json`, 0 bytes) that I killed after it exceeded the time budget. Consequently I have **no screenshot of the AI assistant, BIM or Tools popover in their open state** — those panels are described from `evidence/ready_d03_ready_dom.html`, which contains their markup regardless of visibility.
6. **Ad/analytics scripts were present but not studied.** AdSense and GA load in the editor; I did not determine whether ads are actually displayed in the editor viewport (none appear in the captured screenshots' accessibility tree).
7. **The 2D Planner, Material Editor and AI Rendering apps** were read only as landing pages; their editors (`/2D-Planner`, `app2.php`, `index5.php`) were not opened.
8. **Pricing/limits:** everything observed was free and ungated, including AI model selection. I did not test whether AI usage is metered through the user's own Puter.js account or hits a quota — the footer "AI by Puter.js · your account" suggests user-owned credentials, but this is **INFERRED**.
9. **Exact grid/snap semantics** (0.125 m default slider value, whether snapping is per-axis or planar, whether it changes with the unit switch) were not exercised by drawing geometry.
10. **Screenshots were captured but not visually inspected** — the analysing model in this session has no image input. All layout/visual claims above come from the DOM and accessibility tree plus screenshots saved as evidence for a human or an image-capable model to review (`evidence/*_screenshot.png`).
11. **Server-side behaviour** (Cloudflare rules, ModSecurity blocking direct `js.php` fetches, the `.hpbim.json` schema, the Share-link backend) is unverified beyond the 403 I received when fetching a script directly; no source was copied.
12. **Accessibility conformance** (keyboard-only completeness, focus trapping in dialogs, screen-reader flow through the 3D canvas) was not tested — only the accessibility *tree* was observed.
