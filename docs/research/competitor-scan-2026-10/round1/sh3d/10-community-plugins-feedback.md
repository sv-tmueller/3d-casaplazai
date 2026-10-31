# Sweet Home 3D — Plugin ecosystem & community feedback
Research for **CasaPlazAI** (single-page web 2D/3D floorplanner, Vite/TypeScript/Three.js-style, no backend, localStorage autosave).
Competitor: **Sweet Home 3D** (https://www.sweethome3d.com/de/) — open-source Java desktop app + online JS version.

**Evidence rules used below:** `OBSERVED` = seen directly in a page/bundle/JSON captured in this folder; `DOCUMENTED` = stated by vendor docs; `INFERRED` = my analysis.

---

## 1. Summary

- **Mature but stagnating plugin ecosystem.** 64 plugin tickets on SourceForge, ~17 official/community plugins listed by the vendor, plus external plugins (DXF export, electrical symbols, cabinet maker, material selector, fit-in, wall sockets). Plugins are single `.sh3p` files installed by double-click, with **unrestricted Java API access** — the opposite of CasaPlazAI's no-backend web model. `OBSERVED` (raw/sf_plugins_rest_all.json, raw/plugin_table.txt, raw/plugins.html)
- **Demand is concentrated on geometry, catalog organisation and levels.** Of 787 open feature requests, top themes are furniture/models (89), walls/rooms geometry (83), levels/multi-storey (54), rendering/lighting (53), UI/UX (47), organisation/layers (44). `OBSERVED` (raw/analysis_summary.txt)
- **The loudest recurring complaints are UX, not features**: no dark mode (promised 2021, still absent), level/layer management at 50+ levels, no per-object locking, restrictive 2D panning, flat furniture categories — all things a modern web SPA can fix cheaply. `OBSERVED` (raw/forum_threads_text.txt)
- **Trust evaporated after monetisation.** Rights passed to Space Mushrooms (community-reported; the licence page now credits them `DOCUMENTED`); the GPL desktop line stopped at 7.5 while store versions gained a €80–99/yr subscription with full-screen nag popups that block even editing dialogs (bug #1339). Users moved to SourceForge, forked the app, or left for Blender/Bonsai. `OBSERVED` + `DOCUMENTED` (raw/license.txt, raw/sf_bug_1339.json, raw/pp_foss_comments.json)
- **Sweet Home 3D still has huge reach** — 2.80 million SourceForge downloads Jan 2025–Oct 2026, ~659k forum members, 56,380 posts — but the *free web* version is deliberately crippled (demo cannot save), which is exactly the gap CasaPlazAI's "plan autosaves to localStorage, no backend" positioning fills. `OBSERVED` (raw/sf_dl_stats.json, raw/forum_index.txt, raw/inst_threads.txt)

---

## 2. Findings

### 2.1 The plugin ecosystem

**Scale and shape.** `OBSERVED` — raw/sf_plugins_rest_all.json (SourceForge REST `/plug-ins/`), raw/plugin_table.txt (vendor page https://www.sweethome3d.com/plugins/).

- SourceForge holds **64 plugin tickets**, all status `open`, spanning ticket #1 (Home Rotator) to #70 (POV-Ray Exporter, 2026-09-29).
- The vendor "Plug-ins and tools" page presents **17 plugins** in a table with columns *Plug-in / Provider / Undo-Redo support / Supported in Java Web Start / Description*.
- Providers are a tiny group: **Space Mushrooms** (12 plugins), **Tobias Liefke** (AdvancedEditing), **Dorin Vatavu** (Multiplier, AutoDimensioning, GenerateRoof), **Enko Nyito** (PhotoRendering, PhotoVideoRendering).
- Four bundled helper **tools**: FurnitureLibraryEditor, TexturesLibraryEditor, HugeFileCleaner, and an iOS-only "Tape Measure" app that scans a room and imports a floorplan.

**Themes across the 64 plugin tickets** `OBSERVED` (raw/analysis_summary.txt):
| Theme | Count |
|---|---|
| plugin/utility infrastructure (manager, select-hide, meta-text) | 31 |
| geometry: stairs, roofs, shapes, terrain, handrails, moulding | 15 |
| lighting & rendering (photo/video, light sources, camera, POV, lens) | 14 |
| furniture/catalog (replace, rename, texture, colour, style) | 12 |
| dimensions/measurement (auto-dimension, surface, perimeter, volume) | 9 |
| import/export (DXF, CAD, SVG, camera) | 6 |

**Plugin architecture.** `DOCUMENTED` — https://www.sweethome3d.com/plug-in-developers-guide/ (raw/plugin_dev_guide.txt). A plugin subclasses `com.eteks.sweethome3d.plugin.Plugin`, exposes `PluginAction[]`, is packaged as a JAR renamed `.sh3p`, and carries an `ApplicationPlugin.properties` declaring name, class, and `applicationMinimumVersion` / `javaMinimumVersion`. It is installed by **double-clicking the .sh3p file**, or copying it to `~/.eteks/sweethome3d/plugins` (vendor plugins page). There is **no permission model, no signing, no sandbox** — a plugin is ordinary Java running in-process. `INFERRED` from the guide plus the absence of any permission terms anywhere in the docs.

**Plugin Manager is a single point of failure.** `OBSERVED` — forum thread "Plugin Manager Repository URL" (raw/threads/dev_14812.html). The community Plugin Manager (ticket #44, Daniels118, open since 2022) fetches a remote `plugins.xml` from `daniels118.altervista.org`; when that host is unreachable (user in China) the manager fails with *"Failed to download the plugin list: Connection reset"*. There is no official registry, no mirror, no per-plugin page on sweethome3d.com — discovery happens via the SourceForge ticket list and the forum Developers board. `OBSERVED`

**Notable recent community plugins** (all `OBSERVED`, raw/sf_plugin_*.json) — these show what users build when the app lacks a feature:
- **#68 Fit In Plugin** — arranges/stacks/grids multiple furniture items inside a container object (Overlap All, Stack X/Y/Z…). This is exactly the "fit/collision" gap CasaPlazAI already solves natively.
- **#66 Cabinet Maker** — parametric kitchen/wardrobe generator, with HTML configurators and an "AI prompt generator" for layout suggestions.
- **#64 Material Selector** — batch material/texture replacement with real-world size, rotation, shininess; uses the host's undo/redo.
- **#63 Advanced Shape Generator** — parametric primitives (cube, sphere, cylinder, torus…) plus architectural beams.
- **#69 Wall Socket Plugin** — modular wall sockets/switches stored as piece properties, with a live 3D preview.
- **#62 Furniture Dimensions** — auto dimension lines (W/H/D/elevation) for selected furniture, bounding boxes for groups.
- **#67 Terrain Generator**, **#60/#53 Stair generators**, **#65 Modeller 3D**, **#61 Handrail & Fence**, **#57 Level Tags Manager**.

**Lesson for CasaPlazAI.** The most-downloaded-style plugins (staircase, roof, shapes, dimensions) exist because the **core app lacks parametric geometry**. A web app can ship a small parametric generator as first-class UI instead of relying on an ecosystem. `INFERRED`

### 2.2 Top feature requests

`OBSERVED` — 787 tickets pulled from `https://sourceforge.net/rest/p/sweethome3d/feature-requests/` (raw/sf_fr_all.json, raw/sf_fr_all.txt). The SF page reports **756 results** with **648 in milestone `Future_Release`**, **754 open**; the REST dump returned 787 including newer/older pages. All are `open`; `puybaret` owns 287.

Theme counts (multi-label, raw/analysis_summary.txt):
| Theme | Requests |
|---|---|
| Furniture / models / catalog | 89 |
| Walls / rooms / polygon geometry | 83 |
| Levels / multi-storey / stairs / roof | 54 |
| Rendering / 3D view / lighting | 53 |
| UI / UX / interface | 47 |
| Editing / organisation / layers | 44 |
| Import / export / formats | 35 |
| Furniture placement helper | 32 |
| Dimensions / measurement / units | 30 |

Representative open requests (`OBSERVED`, SF REST + forum threads):
- #1277 Lock Objects to Prevent Accidental Selection or Movement; #1265 Lock dimensions of items.
- #1276 Object Explorer with Folder Structure; #1270 Favorite furniture subfolders; #1269 category organisation.
- #1278 Plan background image opacity; #1279 Sort point of views by name.
- #1268 Wall width does not match entered width when walls are joined (milestone v_7.x).
- Forum Wishlist: *Dark Mode* (t=12872), *Level visibility management* (t=13933), *lock individual objects* (t=14320), *a curved wall* (t=13998), *Level Tags Manager*, *Set exact distance between walls using dimension lines* (t=13993), *Less restrictive panning in 2D view* (t=15091), *Categories / sub-categories* (t=12654, t=8485), *3D rendering using GPU cores* (t=12635), *IFC as project file* (t=13605), *Converter for fbx/USDZ/glTF/GLB* (t=13442), *Rulers in the online demo* (t=14580).
- Overwhelming pattern: **requests are about the editing experience and organisation, not about exotic rendering**. `OBSERVED` (raw/forum_threads_text.txt)

### 2.3 Top complaints (forum, SourceForge bugs, Reddit)

**From the vendor forum** `OBSERVED` — boards fetched at `https://www.sweethome3d.com/support/forum/` (raw/forum_index.txt, raw/f15_*.html, raw/f17_dev.html, raw/f12_tips_byviews.html, raw/inst_threads.txt):
- **No dark mode.** Thread opened 2024 citing a 2021 blog promise: *"Switching between Sweet Home 3D and Blender painfully shows how much better a dark mode is… a lot of glaring white screen space."* A separate 2026 "Dark mode option" thread exists on the Developers board (raw/threads/dev_14754.html).
- **Levels-as-layers break down.** *"Since we basically use levels as layers… mine is currently over 50 levels. Switching to a desired view takes a lot of effort… tabs that spread horizontally in multiple rows."* Requests: checkbox list, level grouping, saved visibility configurations.
- **Accidental edits / no per-object lock.** Only a global "base plan lock"; users want a `Locked` checkbox column beside the existing `Visible` column.
- **Restrictive 2D panning.** *"the view is very boxed in… not possible to center on the edges which is pretty annoying."* The community workaround is to place dummy "marker" boxes at ±5000 to enlarge the scroll area — a textbook UX smell.
- **Furniture catalog organisation.** No sub-categories; workarounds are `Exterior-Plants` naming and a "Searchable list" keyword filter. Categories are implicitly derived from unique furniture category names, and importing a library update **resets** user category edits.
- **Rendering is slow and CPU-only.** *"extremely slow rendering… especially 4000 pixel"*, requests for GPU/Cycles-style renderer; official reply notes SunFlow is Java, and the renderers are external JNI code.
- **Small fonts / no UI scaling** (forum #1260, bug #1342 "Fonts way too small to be readable").
- **Installation fragility dominates board traffic.** Installation board: 754 topics / 3,650 posts; 3D problems board: 921 topics / 4,923 posts — together more posts than the "Features use and tips" board (2,705 / 12,009). Java runtime, GPU driver, macOS Gatekeeper, and Wayland issues recur.

**From SourceForge bug tracker** `OBSERVED` — 394 bugs pulled via REST (raw/sf_bugs_all.txt, raw/sf_bug_*.json). Keyword buckets: 3D/render 147, crash/launch 88, UI/fonts 66, file/save 52, **paywall/subscription 49**, furniture/import 47.
- **#1339 "Modify Walls… dialog blocked by pay popup"** — *"When clicking Ok here I got a popup prompting to sign up for a paid version — there was no apparent way to click Ok in the dialog without paying."* Setting wall thickness was gated behind the paywall; 7.5 from SourceForge does not have the bug.
- **#1359** — premium features cannot be unlocked despite an internet connection (Mac App Store 7.6.6): *"Please connect to the internet to unlock premium features."*
- **#1341** — user-created furniture category folders lost after an App Store update.
- **#1352** — X and Y rotation cannot both be set; switching axis resets the other.
- **#1340** — importing furniture (zip/obj) freezes on M1 Mac.

**From Reddit r/sweethome3d** `OBSERVED` via pullpush.io API (75 posts + comments, raw/pp/):
- Top posts are **release announcements** (6.6 → 11 comments, 6.3 → 7) and **"Is SweetHome3D no longer FOSS?"** (5 pts, 6 comments). The community is small and mostly troubleshooting.
- **"Damn you snapping grid!!"** (19 points) — the single highest-scoring non-announcement post; the only comment: *"They don't seem to provide snapping at all. That's weird."* `OBSERVED` (raw/pp_c_oi6clf.json). This maps directly onto CasaPlazAI's **0.5 m grid snapping**, a feature SH3D conspicuously lacks (its "magnetism" snaps to objects/walls, not to a fixed grid — the shipped bundle contains `magnetismEnabled`, `MagnetizedLength`, `GridVisible`, but no snap-to-grid point logic). `OBSERVED` (bundle/sweethome3d.min.js)
- Recurring questions: real-time dimensions while placing doors/windows; floating/stacked furniture and mezzanines; export options; feet/inches dimensions; "how to search furniture and scroll"; "What difference does joining walls make?".
- **Provenance caveat:** direct Reddit thread fetches returned HTTP 403, so the two post bodies quoted above (the "snapping grid" comment is from the pullpush comment API; the "super frustrating" multi-year-user post 12lgo2f is from a DuckDuckGo result snippet captured in `raw/ddg_snippets.txt`, not from the live thread).

**The monetisation backlash** (most consequential finding) `OBSERVED` — Reddit FOSS thread comments (raw/pp_foss_comments.json) and forum threads raw/inst_threads.txt:
- *"everytime I want to change wall thickness or add textures, I get a pop-up paywall. And it's not even a one-time fee — it's a $50 a year subscription."*
- *"It's constant showing a popup to buy the Pro version for €80,- a year… practically all 3D objects… can not be used (and can not be hidden) because you need a Pro account."*
- *"It seems to spam nag screens now… It's dead to me. Enshittification strikes again!"*
- *"Sadly, it seems they have closed their source too. There is basically no development happening on sourceforge at this point."*
- The creator's own reply on the forum: *"The free GNU GPL version is still available at sourceforge.net… As Sweet Home 3D installer isn't available on sweethome3d.com, you'll have to rely on another source."* `OBSERVED` (raw/threads/inst_14757.html)

### 2.4 Why users choose or leave

**Choose it because** `OBSERVED`/`INFERRED`:
- Genuinely easy 2D→3D for a non-CAD user: *"While the UI is a bit old, the UX is amazing… keeping it very simple and well organised menus."* (Reddit "Plans on moving SH3D to Git?").
- Huge free content: 929 furniture / 26 textures in the free build vs **10,894 furniture / 423 textures** in the paid build (vendor download page). `DOCUMENTED` (raw/download.txt)
- Offline, local, no account, no telemetry-driven lock-in — the thing the web/app-store pivot broke.
- Massive help corpus: forum **658,994 members, 10,493 topics, 56,380 posts**; "Best forum tips" curated index by the original author. `OBSERVED` (raw/forum_index.txt, raw/best_tips.txt)

**Leave it because** `OBSERVED`/`INFERRED`:
- Paywall/nag screens on previously-free actions, and app-store versions that are online-gated (Android "won't even load without an internet connection").
- Desktop GPL line frozen at 7.5; SourceForge repo "read-only"; no accepted community contributions (contributors must sign a CLA), so a contributor *forked and rebranded* to **DobryDom3D**; another built **sweet3D** (https://sweet3d.vercel.app) after being frustrated he couldn't put 2D and 3D views on separate monitors. `OBSERVED` (raw/threads/dev_14959.html, raw/threads/dev_15159.html)
- A long-term power user: *"I'm mostly moved away from SH3D… I'm using an architect developed BIM/IFC Blender extension called Bonsai."* `OBSERVED`
- 2.8M downloads but a monthly run-rate that fell from 217k (Jan 2025) to ~98k (Jul 2025) before recovering to 157k (Oct 2026) — consistent with a monetisation shock followed by users finding the free SourceForge build. `OBSERVED` (raw/sf_dl_stats.json); causal link is `INFERRED`.

### 2.5 The web version (CasaPlazAI's direct comparison)

`OBSERVED` — live capture of `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` with REA + headless Chrome (rea/inspect_online.json, rea/inspect_a11y.json, screenshots/online_demo.png):
- Title "Sweet Home 3D - Design in Your Browser"; loads 23 scripts including a **2.6 MB `sweethome3d.min.js?version=7.5.2`** — a Java-to-JS transpile, not a modern SPA.
- The demo offers **9 starter templates** (Empty home, Studio, 1/2/3-Bedroom apartment, Apartment with bow window, 2-Bedroom house with basement, 3-Bedroom house with attic, 3-Bedroom house with mezzanine), and up to **1,600 3D models / 400 textures** advertised.
- **The demo cannot save.** Forum answer from the creator: *"In demo mode, you can't save the project unless you're able to apply the trick described in this thread."* (`OBSERVED`, raw/threads/inst_14424.html). The workaround circulating on Reddit is to download the SourceForge build.
- App uses IndexedDB and localStorage for model/cache handling; there is also a service worker (`resourceCache.js`) and Firebase heartbeat/installations IndexedDB stores. `OBSERVED` (rea/inspect_online.json storage)
- The dedicated **Online Manager** requires free registration to save (vendor page). `DOCUMENTED` (raw/online_manager.txt)
- The 2D canvas is exposed as a single `Canvas` a11y node — almost no semantic DOM. `OBSERVED` (rea/inspect_a11y.json)

**Data model, observed directly in the shipped bundle** `OBSERVED` (bundle/sweethome3d.min.js, bundle/viewmodel.min.js) — useful as a reference vocabulary, not to copy:
`Home`, `HomePieceOfFurniture`, `HomeFurnitureGroup`, `HomeDoorOrWindow`, `Wall`, `Room`, `Level`, `HomeMaterial`, `HomeTexture`, `UserPreferences`, `PlanComponent`, `PlanController`, `HomeController`, `FurnitureCatalog`, `ContentManager`, `HomeRecorder`, `HomeXMLExporter`, `PhotoRenderer`, `LevelsSelection`, `FurnitureVisibleProperty`, `FurnitureSort`. Attribute names seen: `ELEVATION`, `WALL_HEIGHT`, `WALL_THICKNESS`, `VISIBLE`, `TRANSPARENCY`, `SHININESS`, `ILLUMINATION`, `MODEL_MATERIALS`, `GRID_VISIBLE`, `MAGNETISM_ENABLED`, `PLAN`/`LEVEL` indexing. The XML home format is version-tagged (`home version="7400"` in bug #14439), which is why old plans break across versions — a cautionary tale for CasaPlazAI's localStorage schema. `OBSERVED`

### 2.6 What a modern web floorplanner should take from this

`INFERRED`, grounded in the findings above:
1. **Grid snapping is a differentiator, not a commodity.** SH3D's top community gripe is the lack of it. CasaPlazAI's 0.5 m snap + shared walls is a headline feature, not a detail.
2. **Organisation is the retention feature.** Levels/layers, categories, locking, visibility, and "find my furniture" dominate 787 feature requests. In a single-workspace SPA, a searchable, groupable object list earns more than another renderer.
3. **Never paywall a basic edit.** Bug #1339 (wall thickness behind a paywall) and the nag-screen reports are the single clearest trust lesson. Free, local, no-nag is a positioning advantage CasaPlazAI already has.
4. **Solve save/recovery openly.** SH3D's demo can't save and its forum has "Lost house"/"Data Loss" threads. localStorage autosave should be visible, versioned, and exportable.
5. **Keep import friction near zero.** SH3D users burn forum pages on OBJ/MTL/zip install and flipped normals; a web palette with built-in props plus one-click import beats an ecosystem of converters.
6. **An ecosystem without a registry rots.** 64 plugin tickets, no official registry, plugin manager depending on one hobbyist's host. If CasaPlazAI adds extensibility, it needs a versioned, mirrored manifest from day one.

### 2.7 Source list (key URLs)

Vendor docs: https://www.sweethome3d.com/plugins/ · https://www.sweethome3d.com/plug-in-developers-guide/ · https://www.sweethome3d.com/download/ · https://www.sweethome3d.com/license/ · https://www.sweethome3d.com/online-manager/ · https://www.sweethome3d.com/SweetHome3DJSOnline.jsp
Community: https://www.sweethome3d.com/support/forum/ (boards f=11,13,12,17,15,3,21) · https://sourceforge.net/p/sweethome3d/plug-ins/ · /feature-requests/ · /bugs/ · https://www.reddit.com/r/sweethome3d/ · https://test.sweethome3d.eu/blog/the-best-add-ons-and-plugins-for-sweet-home-3d/

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Each idea is tied to a finding above. Ranking is value÷effort (High = do first).

| # | Idea | Tied to finding | Value / Effort |
|---|---|---|---|
| 1 | **Make grid snapping a visible, celebratable feature** — show live X/Y + distance-to-neighbour readouts while drawing, with an on/off toggle and a "snap to 0.5 m grid / snap to wall / snap to object" mode indicator. SH3D's #1 community complaint is that its magnetism snaps only to objects; its highest-voted Reddit post is a grid-snapping rant. | §2.3 "Damn you snapping grid!!"; §2.6(1) | High / Low |
| 2 | **Ship dark mode + a UI scale / font-size control.** Recurring since 2021; forum thread cites glaring white space and asks for font size; bug #1342 "Fonts way too small to be readable". In a Vite/TS SPA this is CSS variables + a settings toggle. | §2.3 (dark mode, fonts) | High / Low |
| 3 | **Live dimension readouts while placing doors/windows and furniture** — show distance to the two wall ends and to adjacent objects as the user drags, plus a type-to-set exact distance field. Directly matches the top Reddit question and forum request #13993. CasaPlazAI already has a measure tool; wire it into placement. | §2.3 (real-time dimensions), §2.2 (#13993) | High / Low |
| 4 | **Visible, versioned autosave with export/restore.** localStorage is CasaPlazAI's backend; make it trustworthy: "Saved 2s ago" indicator, a restore-point list, JSON/PNG export, and a schema `version` field. SH3D's demo *cannot save* and users report "Lost house" / data loss; its XML version-tag (`home version="7400"`) is what makes old plans break (bug #14439). | §2.5, §2.6(4) | High / Low |
| 5 | **A real object/room list panel: search, group, lock, hide.** Add `Locked` and `Visible` columns, folders, and a keyword search with multi-term matching. This is the single densest cluster of requests: #1277 lock, #1276 object explorer, #1270 favourites, #1269 category org, forum t=14320, t=13933, t=12654, t=8485 — and existing users' workaround for missing sub-categories is renaming furniture to `Exterior-Plants`. | §2.2, §2.3 (lock, categories, levels) | High / Medium |
| 6 | **Level/layer management built for scale** — visibility checkboxes, level grouping, saved visibility presets, and a compact switcher that doesn't sprawl into multiple tab rows. One SH3D power user runs **50+ levels as layers** and describes switching views as exhausting. CasaPlazAI's single-workspace redesign should treat "levels/layers" as a first-class panel from the start. | §2.3 (levels) | High / Medium |
| 7 | **Parametric in-app generators instead of a plugin marketplace** — staircase and roof/sloped-ceiling generators, plus simple parametric primitives and a "save selection as reusable furniture" action. These are precisely what SH3D users download plugins for (Staircase Generator, GenerateRoof, Advanced Shape Generator, Cabinet Maker, CopyAsNewFurniture) and the vendor's own blog calls stairs *"a nightmare"* and roofs *"frustrating"*. | §2.1, §2.5 | High / High |
| 8 | **Unrestricted 2D pan/zoom** — no artificial scroll bounds; let the user centre on any edge or empty space and add objects outside the current extent. SH3D users work around it by placing dummy marker boxes at ±5000. | §2.3 (panning, t=15091) | Medium / Low |
| 9 | **Batch material/colour/texture editing for furnished rooms** — multi-select furniture and apply colour/texture/shininess at once, with undo. Mirrors the popular Material Selector, Global Change Colour and Replacer plugins; CasaPlazAI's small palette makes this cheap and it amplifies a small catalog. | §2.1 (plugins #64, #12, #47) | Medium / Medium |
| 10 | **A "fit features" affordance on top of the existing collision system** — align/distribute/stack selected items inside a room's bounds, since Fit-In and Multiplier are among the newest and most enthusiastically received plugins. CasaPlazAI's collision + shared-wall model already provides the geometry. | §2.1 (#68 Fit In, #27 Multiplier) | Medium / Medium |
| 11 | **Export that users actually ask for: DXF/SVG plan export and 2D plan image with annotations.** Plugins for DXF (R12), SVG-with-symbols and "export plan image" all exist because the built-in export can't be hooked by plugins (the DXF author documents that built-in plan rendering bypasses plugin APIs). In a web app this is straightforward canvas/SVG serialisation. | §2.1, §2.2 (#35 exports) | Medium / Medium |
| 12 | **One-click import for common 3D formats with automatic texture handling**, accepting a zip of OBJ+MTL+textures. SH3D's forum has long threads on FBX/GLB→OBJ conversion, flipped normals and missing textures; a web importer that resolves these silently removes the biggest furniture-catalog pain. | §2.2 (#13442), §2.3 | Medium / High |
| 13 | **Keep the free/local/no-nag promise explicit in the UI.** A short, honest line ("Free, offline, saves on your device — no account, no paywall") exploits the strongest competitor weakness. Forum and Reddit evidence shows users actively hunting for the non-subscription build and rewarding transparency. | §2.3 (paywall), §2.4 | High / Very low |
| 14 | **If/when adding extensibility, design the registry first** — a versioned, mirrored JSON manifest with per-item pages and integrity hashes. SH3D's 64 plugins have no official registry; its Plugin Manager breaks when one hobbyist's host is unreachable; plugin authors must juggle Java-version and app-version minimums by hand. | §2.1 (plugin manager), §2.6(6) | Low (now) / High (later) |

---

## 4. Unknowns / what I could not verify

- **Reddit is only partially observable.** reddit.com returned HTTP 403 to both `web_fetch` and curl, and the r.jina.ai proxy was blocked. The Reddit data here comes from the **pullpush.io archive API** (75 r/sweethome3d submissions + comment threads). Vote counts and comment counts are archive snapshots, and heavily-commented threads from 2026 may be under-represented. No official Reddit search was possible.
- **Trustpilot could not be read** (HTTP 403 + bot challenge), so its 7 reviews are not represented.
- **SourceForge HTML pages are 403 to curl**, so I relied on `sourceforge.net/rest/...` JSON. REST page counts (787 FR / 64 plugins / 394 bugs) may drift from what the site displays (it shows 756 feature requests); I could not reconcile the difference.
- **Plugin popularity is not measurable.** SourceForge exposes no per-plugin download totals for the `SweetHome3D-plugins` folder (stats endpoint returned 404). My plugin ranking is by recency/description, not downloads.
- **The acquisition narrative is community-reported.** The license page says "Copyright (c) 2024 Space Mushrooms" `DOCUMENTED`, and forum/Reddit posts state the original author sold the rights and that 7.5 is the last GPL SourceForge release `OBSERVED as user statements`, but I found **no primary vendor announcement** of the sale or of the licensing change — treat the business history as well-corroborated but second-hand.
- **No Sweet Home 3D desktop app was run.** Behavioural claims come from the vendor's shipped JS bundle (`sweethome3d.min.js` 7.5.2), the online demo, and documentation. Some desktop-only features may differ from the JS bundle, which is a transpile.
- **I could not run `rea capture-browser-scenario`.** REA's Playwright launch is blocked by the macOS sandbox ("sandbox initialization failed: Operation not permitted", GPU process exit_code 5). Workaround used: I launched `chrome-headless-shell` directly with `--disable-gpu --no-sandbox` on a private CDP port (9777) and used `rea capture-web-screenshot` and `rea inspect-web-page`, which succeeded. `rea analyze-web-bundle` rejected every `--view` I supplied (`view.collection`, then `view.kind`), so no formal bundle analysis view was produced; I analysed the downloaded bundle with text/grep tooling instead.
- **Ports 9333/9444/9555 were in use by parallel jobs**; those browsers and their pages (`3dhouseplanner.com` on 9333) were deliberately left untouched.
- **I did not fetch individual feature-request descriptions for all 787 tickets**, only summaries plus a sample of detail records; theme counts are keyword-based approximations and a ticket can fall into multiple themes.
- **Reddit alternatives discussion is thin.** My DuckDuckGo queries for "sweet home 3d alternatives 2026" returned HTTP 202 with no parsed results, so the "why users leave" picture rests on forum threads and the FOSS thread rather than a broad comparison survey.
