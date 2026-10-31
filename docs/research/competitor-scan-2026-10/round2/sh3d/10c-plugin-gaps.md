# Sweet Home 3D — Popular plugins as evidence of core-product gaps

Round 2 research for **CasaPlazAI** (single-page web 2D/3D floorplanner, TypeScript/Three.js, no backend, localStorage autosave).
Narrow question: **which Sweet Home 3D plugins are popular, what does each add, and what core-product gap does that reveal?**

Round-1 report reused read-only (`~/dsh-workspaces/rea-sweethome3d-2026-10/10-10-community-plugins-feedback/report.md` and its `raw/`, `bundle/`, `rea/` files). I did not redo what it established; I went after the one thing it called out as unmeasurable — **per-plugin popularity** — and found a primary source for it.

**Evidence tags:** `OBSERVED` (seen directly in a page/JSON/bundle captured in *this* job folder, or a round-1 evidence file named explicitly) · `DOCUMENTED` (vendor doc URL) · `INFERRED` (my analysis).

Research window 2026-10-31 15:53 → 16:25 CET (start-time `date` noted; report finalised well inside the 120-minute budget).

---

## 1. Summary

- **A primary popularity source exists after all.** Round 1 concluded plugin popularity was unmeasurable (SF exposes no per-plugin download totals). The community **Plugin Manager** publishes a public *"active installations in the last 30 days"* leaderboard for **61 plugins**: Plugins Manager 477, Advanced plan editing 291, Pan3dView 273, AutoDimensioning 260, Roof Generator 257, … down to 0; 5,502 installs total, median 72. `OBSERVED` (raw/pm_statistics.php, raw/pm_stats_joined.json). This is a *self-selected* sample (only users who opted into anonymous telemetry) so it ranks rather than counts the population.
- **The top of the list is dominated by things the core app does not do**: find/update plugins at all (477 installs just to get a plugin catalogue), edit objects beyond the basic verbs (291), navigate the 3D view (273), auto-dimension walls (260), and **generate a roof (257)**. `OBSERVED` (raw/pm_statistics.php).
- **Two outright core absences are proven independently of plugins**: the word **"roof" appears zero times in SH3D's entire published version history** (2.x→7.5, 2006–2024), and a photo/video/HTML5 rendering ecosystem exists only because the built-in renderer is thin. `OBSERVED` (raw/www.sweethome3d.com_history_.html, raw/plugins_text.txt).
- **The web edition — CasaPlazAI's direct comparison — cannot run any of these plugins.** The shipped JS bundle contains world-class core classes but **zero** plugin runtime (`PluginManager`, `PluginAction`, `PluginController`, `PluginClassLoader`, `sh3p` all count 0; the only match is a `ContentType.PLUGIN = 13` enum). Plugins are `.sh3p` JVM JARs; a GWT/Java-to-JS transpile cannot load JVM bytecode. `OBSERVED` (round-1 bundle/sweethome3d.min.js, bundle/viewmodel.min.js, bundle/core.min.js) + `INFERRED` mechanism.
- **The ecosystem is fragile in a way a web app should not copy**: no official registry, plugin binaries are scattered as 64 individual SourceForge *ticket attachments* (there is no `SweetHome3D-plugins` download folder), one hobbyist's `plugins.xml` is the single index (it 404s for users behind blocking networks), and the catalogue's own dev guide requires files to be hosted **on SourceForge only**. `OBSERVED` + `DOCUMENTED` (raw/sf_plugins_folder.html, raw/forum_dev_14812.html, raw/pm_dev_quick_start.php).

---

## 2. Findings

### 2.1 Method: how plugin popularity can be measured at all

Round 1 correctly established that SourceForge gives **no per-plugin download counts** (`/files/SweetHome3D-plugins/stats/json` → 404, `sf_dl_plugins.json` is a 403 HTML page). I did not repeat that. Instead:

- The **Plugin Manager** (`#44` on SourceForge, by Daniels118, open since 2022) is an in-app search/install/update UI. Its landing page advertises *"See how many people use each plugin!"* `OBSERVED` (raw/daniels118.altervista.org_sh3d_pluginmanager_).
- It publishes `statistics.php` — **"the number of the active installations of each plugin in the last 30 days"** — with 61 rows, each linking to a per-plugin `plugin_stats.php?id=N` page with **version** and **UI-language** breakdowns. `OBSERVED` (raw/pm_statistics.php, raw/pm_plugin/*.html).
- It also publishes a machine-readable catalogue, `plugins.xml` — **60 plugins, 236 KB, including every historical release** (1–27 releases per plugin) with dates, providers, licences, file sizes, minimum app/Java versions and SourceForge attachment URLs. `OBSERVED` (raw/daniels118.altervista.org_sh3d_pluginmanager_plugins.xml).
- Collection is **opt-in anonymous telemetry**: "the version of Sweet Home 3D in use, the list of the installed plugins, your language settings, the country you are located in", aggregated by language and country. `OBSERVED` (raw/pm_usage_data_policy.php).

**Caveat carried into every number below (`INFERRED`):** this is a self-selected sample of users who installed the Plugin Manager *and* opted in. It measures *relative* popularity among engaged, plugin-aware users. The absolute count is a floor, not the installed base — e.g. 291 installs for Advanced plan editing does not mean only 291 people use it.

### 2.2 The popularity leaderboard, with what each plugin adds and the gap it reveals

All counts from `OBSERVED` (raw/pm_stats_joined.json; raw/pm_statistics.php). Descriptions from the plugin's SourceForge ticket (`raw/sf_tickets/N.json`) or the vendor/extended catalogue page (`raw/plugins_text.txt`, `raw/daniels118...plugins.xml`).

| # | Installs | Plugin (provider) | What it adds | Core gap it reveals |
|---|---|---|---|---|
| 1 | 477 | **Plugins manager** (Daniels118) | In-app search, one-click install/update of other plugins, "new plugin" notifications | **There is no plugin store in the core app.** The most-installed plugin is the one that makes the other plugins findable — the catalogue has to be bolted on. |
| 2 | 291 | **Advanced plan editing** (Tobias Liefke) | `Resize` selected objects, `Edit room points` in a dialog, `Join walls`; also Rotate/Move/Flip/Elevate | **Core editing verbs are missing**: multi-object numeric resize, editing a room polygon's vertices after creation, and merging walls are all plugin actions. `OBSERVED` (#4 description) |
| 3 | 273 | **Pan3dView** (Daniels118) | Pan the 3D view with the middle mouse button (and it is a *dependency* for #6 and #7) | **3D view navigation is incomplete** — panning, and every 3D-overlay plugin, hangs off this one patch. Developer notes it "uses reflection to access private code" and breaks across versions. `OBSERVED` (#39) |
| 4 | 260 | **AutoDimensioning** (Dorin Vatavu) | Auto-generates dimension lines for all/selected walls into a new level | **Dimensions are not automatic.** Core only got editable dimensions in 7.2 (Sep 2023); auto-placement is still a plugin. `OBSERVED` (#34) + version history |
| 5 | 257 | **Roof Generator** (Dorin Vatavu) | Generates a roof with adjustable slopes from the selected rooms' shape | **Roofs are absent from the core product entirely.** See §2.4 — "roof" is missing from the whole version history. `OBSERVED` (#40, updated to 5.3 on 2026-10-25) |
| 6 | 174 | **Wirings** (Daniels118) | 3D polylines snapping to floors/walls/ceilings for electrical, plumbing, decorations | **No in-3D annotation layer.** Requires Pan3dView. `OBSERVED` (#41) |
| 7 | 158 | **3D dimension lines** (Daniels118) | Dimension lines that snap to floors, walls and ceilings in the 3D view, any direction | Same gap as #4 but in **3D**; core dimension handling is 2D-first. `OBSERVED` (#42) |
| 8 | 146 | **Export plan image** (eTeks/Space Mushrooms) | Exports the plan to PNG/JPEG at a chosen size | Core export is print/SVG-oriented; **arbitrary-resolution raster export of just the plan** is a plugin. `OBSERVED` (vendor table) |
| 9 | 138 | **Rooms Informations** (Dorin Vatavu) | Adds per-room **perimeter** and **wall surface** columns | **Room metrics stop at area.** Perimeter and wall-area are not core; the clue is in the core `Room` model vocabulary (area yes, perimeter as a derived convenience at most). `OBSERVED` (#28) |
| 10 | 134 | **Copy as new furniture** (eTeks) | Copies selected plan objects into a new reusable furniture item | **Composite objects cannot be saved/reused.** Users rebuild the same furniture cluster every project. `OBSERVED` (vendor table + EU blog) |
| 11 | 134 | **Photo-video rendering** (Enko Nyito) | Consolidates photo/multiple-photo/video rendering + advanced settings, progress %, ETA, external-brightness | **Rendering is a first-class gap**: 27 releases of churn on one plugin. Core's *Create photo* panel is thin. `OBSERVED` (#18) |
| 12 | 133 | **Multiplier** (Dorin Vatavu) | Multiply/copy-and-shift selected objects, with a toolbar action | **No array/pattern duplicate** in core (core "Multiple paste" was partial). `OBSERVED` (#31) |
| 13 | 132 | **Staircase generator** (eTeks) | Builds a staircase 3D shape from number of stairs + size | **No parametric stair generator.** See §2.4: stairs exist in the core only as a *furniture category* with a `staircaseCutOutShape` cut-out property. `OBSERVED` (#50, vendor table) |
| 14 | 125 | **Side view** (eTeks) | Renders and saves a side elevation of the edited home | **No elevation/section view.** Core is plan + 3D only. `OBSERVED` (#50 area / vendor table) |
| 15 | 125 | **Terrain Generator** (eTeks) | Builds a 3D terrain shape from selected rooms, then sculptable; later fork adds height-map import/export | **No site/terrain model.** `OBSERVED` (#67, vendor table) |
| 16 | 115 | **Advanced settings of photo rendering** (Enko Nyito) | Exposes the renderer's advanced properties | Built-in renderer settings are **hidden/insufficient**. `OBSERVED` (#13) |
| 17 | 109 | **Select Hide Utility** (Dorin Vatavu) | Bulk select, hide/show selected, copy/delete/paste of selections | **No selection algebra and no per-object hide.** `OBSERVED` (#23; note its own "Redo NOT" warning) |
| 18 | 102 | **SVG Tuner** (Daniels118) | Silently swaps the SVG export's PNG writer for one that compresses | **Built-in SVG export produces bloated files.** A no-UI, behaviour-only patch ranking 18th is a strong signal. `OBSERVED` (#43) |
| 19 | 100 | **View light sources** (Enko Nyito) | Visualises light sources in the plan | **Lighting is invisible in 2D.** `OBSERVED` (#38 area) |
| 20 | 97 | **Automate lights rendering** (Enko Nyito) | Renders one image per lighting combination for home-automation use | A **workflow gap** created by a manual render loop; users automate the renderer to get a gallery. `OBSERVED` (#33, created from forum demand thread 10648) |

Below the top 20 the same pattern continues: `Shape Generator` 93 and `Advanced shape generator` 36 (no parametric primitives), `Sweet Home Lights` 92 / `Replace light sources` 80 (light placement), `Home Rotator` 88 (whole-plan rotation), `Moulding` 85 and later `Handrail & Fence Generator` (no trim/procedural railings), `Export to SH3F` 77 + `Export to SH3T` 40 (library management), `Furniture Dimensions` 64 (per-item W/H/D/elevation), `Level Tags Manager` 39 (tag-based level visibility - a community step toward round 1's "50 levels" complaint), `Cabinet Maker` 38, `Material Selector` 28, `Replacer` 28, `Modeller 3D` 32, `SurroundRoom` 35, `Distribue elevation` 64, `Print room list` 64, `Compute the remaining volume` 14. `OBSERVED` (raw/pm_stats_joined.json, raw/sf_tickets/*).

### 2.3 What the ranked list says as a whole

Grouping the 60 catalogue plugins by theme (`OBSERVED`, raw/daniels118...plugins.xml, my classification):

| Theme | Plugins | Example = gap |
|---|---|---|
| Geometry / parametric generation | 12 | stairs, roofs, shapes, terrain, moulding, railings, "regular room" (N-sided) |
| Import / export / annotation | 11 | DXF-in, plan-image out, SH3F/SH3T library out, evidence markers, level tags |
| Catalog / material / furniture operations | 10 | batch material replace, replacer, rename, copy-as-new-furniture, multiplier, select-hide |
| Measurement / dimension / area | 9 | auto-dimensioning, rooms info, room perimeter, area sum, remaining volume, room list |
| Lighting / rendering | 9 | photo/video rendering, advanced render settings, POV-Ray, Yafaray, light placement |
| View / navigation | 6 | 3D pan, side view, home rotator, camera export/import, video path editor, stereo |
| Infrastructure / plugin management | 2 | the plugin manager itself, advanced plan editing |

Three structural observations (`INFERRED`, grounded in the counts above):

1. **The top of the leaderboard is *method*, not *content*.** #1 (manager), #2 (editing verbs), #3 (navigation), #12 (multiplier), #17 (select/hide) are all about *how you operate the app*, not about adding designs. Feature-request evidence agrees: round 1 found requests dominated by UI/UX, organisation and locking rather than exotic rendering.
2. **Parametric generation is the single biggest *content* gap.** Roof Generator is #5 with 13 releases and a same-day-as-capture update; Staircase generator #13; Shape Generator #22; Terrain Generator #15; and the 2026 wave adds Handrail & Fence, Advanced Shape Generator, Cabinet Maker, Modeller 3D. The vendor's own EU blog calls stairs *"a nightmare to get the steps even"* and says *"roofs might not be the easiest thing to implement"* — i.e. **the vendor markets the plugins that patch the product.** `OBSERVED` (raw/eu_best_plugins.html).
3. **Measurement is chronically bolted on.** Nine of sixty catalogue plugins deal with dimensions/area/perimeter/volume, and 26 open feature requests mention "dimension" (`raw/sf_fr_all.json`, round 1). Core shipped editable dimensions only in 7.2 (2023) and still has no auto-dimension.

### 2.4 Core absence proven *inside the product*, not just inferred from plugins

Plugins are circumstantial evidence. Three independent core-side checks:

**(a) Version history: "roof" never appears.** I downloaded the full published version history (2.x → 7.5.2, Aug 2024 — `OBSERVED`, raw/www.sweethome3d.com_history_.html) and searched it:
- `roof` / `Roof`: **0 occurrences across the entire history**. Roofs have never been a core feature line; they arrive via the GenerateRoof plugin.
- `stair`: only as a **furniture category** — `staircaseCutOutShape` "to define the shape used to cut out the ceiling and the floor of upper levels when it intersects with a staircase", plus a *Staircase* checkbox in the furniture-import wizard. There is no stair generator in the core history.
- `dimension`: editable dimensions and elevation dimensions are a **7.2 (Sep 2023)** addition, and even then as a manual "Modify dimensions" menu item.
- `plugin` / `plug-in`: the plug-in architecture (2008/2009) and one bug fix ("Placed menu items of untranslated plug-ins in existing known menus", 7.3) — **the core app is not where features are added any more.**

**(b) The shipped JS bundle cannot host plugins.** Cross-checking the round-1 captured bundle (round-1 `bundle/`, read-only) for the Java plugin classes that any real plugin target requires:

| Symbol | sweethome3d.min.js | viewmodel.min.js | core.min.js |
|---|---|---|---|
| `PluginManager` | 0 | 0 | 0 |
| `PluginAction` | 0 | 0 | 0 |
| `PluginController` | 0 | 0 | 0 |
| `PluginClassLoader` | 0 | 0 | 0 |
| `sh3p` | 0 | 0 | 0 |

The only `PLUGIN` hit in the whole bundle is a content-type enum: `c[c.PLUGIN=13]="PLUGIN"` (a library-import file-type slot). By contrast the bundle *does* carry `PLAN`, `Export to SVG`, `exportToOBJ`, `PhotoRenderer`, `POLYLINE`, `HomeXMLExporter` etc. So the **web edition inherits the core UI but none of the extensibility** — `OBSERVED` (grep counts over the round-1 bundle), mechanism `INFERRED` (a Java→JS transpile cannot execute uploaded JVM bytecode; the vendor installs `.sh3p` by double-click / copying into `~/.eteks/sweethome3d/plugins`, which has no browser analogue — `DOCUMENTED` https://www.sweethome3d.com/plugins/).

**(c) No registry, no mirror, no integrity.** Confirmed from the ecosystem's own plumbing:
- SourceForge's plugin "folder" is not a download folder — the `/files/` listing contains `SweetHome3D`, `-source`, `-models`, `-textures`, editors … **but no `SweetHome3D-plugins` directory**. Plugin binaries are **attachments to individual tickets** (`/p/sweethome3d/plug-ins/40/attachment/GenerateRoof.sh3p`). `OBSERVED` (raw/sf_plugins_folder.html, raw/sf_plugin40_attach.json).
- The Plugin Manager developer guide states: *"The file have to be hosted on SourceForge, no other hosting service is accepted."* `DOCUMENTED/OBSERVED` (raw/pm_dev_quick_start.php).
- The single catalogue URL is a hobbyist's host. A 2026 forum thread from a user in China: *"Failed to download the plugin list: Connection reset … Unable to reach daniels website."* The suggested fix was to manually mirror `plugins.xml` to SourceForge. `OBSERVED` (raw/forum_dev_14812.html).
- Licences are near-uniformly GPL (59 of 60 latest releases are GNU GPL-family or a link to the GPL text; 1 is declared "demo"), i.e. the ecosystem is legally open but **operationally centralised on one person's server**. `OBSERVED` (raw/daniels118...plugins.xml, raw/pm_dev_quick_start.php).
- 9 of 60 catalogue entries declare `applicationMinimumVersion="7.2"`, while others declare 1.5–6.5 — plugin authors must hand-manage app+Java version compatibility. `OBSERVED`.

### 2.5 Independent corroboration of *which* plugins matter

Because the install leaderboard is self-selected, I corroborated the ranking three ways:

1. **Vendor/partner editorial "community favourites"** — the sweethome3d.eu blog (Nov 2025) picks exactly **Copy As New Furniture, Staircase Generator, Generate Roof, Advanced Editing, Shape Generator**, and frames each as fixing a limitation ("you have to recreate it from scratch every time"; "designing stairs manually … a nightmare"; "no roof to cover it"; "the default editing tools … are somewhat limited"). `OBSERVED` (raw/eu_best_plugins.html). **4 of those 5 overlap my measured top-25**, and the 5th (Shape Generator) is #22.
2. **GitHub activity** — the most-starred third-party SH3D work is not an editor feature but an **integration**: `shmuelzon/home-assistant-floor-plan` (1,137★, updated the day of capture). Next: `grimashevich/sweethome3d-mcp-server` 75★ (an embedded MCP server so an LLM can drive SH3D — updated 2026-10-30), `adizanni/ExportToHASS` 70★, `liefke/sh3d-advanced-editing` 12★ (the #2 plugin's source). `OBSERVED` (raw/gh_*.json). *Gap:* users want their plans to **drive and be driven by other systems**, which the core does not do; and the #2 plugin has a public source mirror.
3. **Release cadence vs staleness** — the leaderboard mixes *active* and *frozen* plugins in a way that separates "still a gap" from "gap now filled in core". Roof Generator shipped 5.3 on 2026-10-25; Select Hide 1.7 on 2026-09-07; Level Tags 1.0.7 on 2025-09-24. Meanwhile several high-rank plugins are years stale yet still installed: Advanced plan editing (1.7, 2022-03-15), Wirings (4.4 beta, 2023-09-03), Moulding (1.0, 2022), Home Rotator (1.3, 2023), `Calculate room perimeter` (1.0, **2014**), Stereo points of view (1.0, **2013**). `OBSERVED` (raw/pm_stats_joined.json). *Interpretation (`INFERRED`):* a stale-but-installed plugin means the gap is real and the user has accepted an unmaintained patch — a bigger opportunity for a maintained core feature.

### 2.6 The web edition: what CasaPlazAI's direct competitor actually gives a browser user

Re-checked against the live page and round-1 captures:
- The online demo (`SweetHome3DJSOnline.jsp`) loads 19 scripts, including `sweethome3d.min.js?version=7.5.2`, `core.min.js`, `geom.min.js`, `triangulator.min.js`, `graphics2d.min.js` — a Java-to-JS transpile of the same core. `OBSERVED` (raw/online_page.html).
- It warns on load: *"Keep in mind that your design won't be saved!"*, and there is no plugin menu, no `.sh3p` loading, no plugin runtime in the bundle (§2.4b). `OBSERVED` (raw/online_page.html inline `viewHome()`).
- A teacher's 2026 forum thread asks for **rulers in the online demo version** because schools moved to Chromebooks and the desktop Linux build was *"a real hustle"* — i.e. the browser edition is the version people want, and it is the one that lacks even the basic aids. `OBSERVED` (raw/thread_14580.html).

So the competitive picture for CasaPlazAI is unusually clean: **Sweet Home 3D's extensibility story and its web story are mutually exclusive.** Everything the 61 plugins fix (roofs, stairs, auto-dimensions, 3D pan, 3D annotation, terrain, mass material editing, plan-image export) is unavailable to the browser user, and the browser user is exactly CasaPlazAI's target. `INFERRED` from §2.4 and §2.6, grounded in the OBSERVED counts.

### 2.7 Correlated community pain (re-used from round 1, re-verified where cheap)

The plugin gaps line up with the wishlist, which strengthens the causal reading:
- **Levels as layers / visibility**: forum thread `t=13933` proposes replacing level tabs with a checkbox list; a reply in Sep 2025 says *"Thanks to Shlomo Swidler there is the first step"* — that first step is the **Level Tags Manager plugin** (39 installs). A core gap being patched by a 39-install plugin. `OBSERVED` (raw/thread_13933.html; raw/pm_stats_joined.json).
- **Per-object locking**: `t=14320` — only a global base-plan lock exists; users want a per-object `Locked` flag (*"I also support this request"*). No plugin fully closes it. `OBSERVED` (raw/thread_14320.html).
- **Restrictive 2D panning**: `t=15091`, workaround is placing dummy marker boxes at ±5000 so the view has extent. `OBSERVED` (raw/thread_15091.html).
- **Curved/oval walls**: `t=13998`; the workaround is to draw a line and back, then set an arc angle. `OBSERVED` (raw/thread_13998.html).
- Plugin-adjacent feature requests stay open: **#1007 "Roofs Plugin"**, #779 "Roofs – a common request", #796, #864, #983 "Domed roof", #1169 "Staircase generator plug-in upgrade", #618 "Simple stairs generator", #886 "middle mouse button for dragging 2d view", #376 "Export to DXF", #532/#638 SVG export size/quality. `OBSERVED` (round-1 raw/sf_fr_all.json).

### 2.8 What the *plugin API itself* tells us about the required feature set

The vendor developer page and the Plugin Manager's data model are an accidental spec of what "a feature" means in this product. `DOCUMENTED` (https://www.sweethome3d.com/plug-in-developers-guide/) + `OBSERVED` (raw/daniels118...plugins.xml):
- A plugin is a JAR renamed `.sh3p` with `ApplicationPlugin.properties` (`name`, `class`, `applicationMinimumVersion`, `javaMinimumVersion`), installed by double-click or dropped into a per-user `plugins` folder. **No signing, no sandbox, no permission model, no version negotiation beyond a minimum-version string.**
- The catalogue stores **one record per release** and warns authors: *"If you don't add old releases … the Plugin Manager won't be able to recognize it and won't notify the users of the new releases. Moreover if the user installs the new release, the Plugin Manager won't uninstall the previous release, bringing to unexpected results."* — i.e. plugin identity/upgrade is done by hand in a 3rd-party XML file.
- Per-plugin pages show real fragmentation: Pan3dView has **15 concurrently-installed versions** (4.2 = 191 of 273, but 21 users still on 3.7.5, 17 on 4.1…); Plugins manager has 8 concurrent versions. `OBSERVED` (raw/pm_plugin/*.html). A web app that shipped features instead of a plugin API would not inherit this.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Every row is tied to a finding and, where relevant, to the CasaPlazAI schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

| # | Idea | Tied to finding | Schema hook | Value / Effort |
|---|---|---|---|---|
| 1 | **Ship the parametric generators as first-class UI, not a plugin API.** Concretely, in priority order: (a) **roofs** — a shed/gable generator driven by two opposing `RoofSpec` leans; (b) **stairs** — number of steps + riser/tread + direction, emitted as a generated furniture/geometry item; (c) simple parametric primitives (box/cylinder/prism) and an I/T/L-beam profile. Roofs are #5 overall (257 installs) and **never existed in 25 years of core history**; stairs are #13 and #24. | §2.2 #5/#13/#24, §2.3(2), §2.4(a) | The schema **already has roofs**: `Room.roofs: {segmentIndex, leanDeg}[]` with `roof-invalid-gable`, `roof-no-ridge`, `roof-unsupported-config` validators, plus `wallsOverride` and `leanDeg ∈ [0,75]`. A generator UI that writes `roofs` is pure editor-side work — no schema change. Stairs are not in the 7-type `FurnitureItem` enum, so either add a `"stairs"` type (additive via `migrate.ts`) or model as a generated room-local solid. | **High / Medium** (roofs), High / High (stairs) |
| 2 | **Make measurement a live, always-on readout instead of a tool.** Show wall length, room area, and **perimeter** while drawing/dragging; auto-dimension the whole plan on demand into a toggleable overlay. Nine of sixty plugins are measurement plugins, AutoDimensioning is #4, `Rooms Informations` (perimeter + wall surface) is #9, and 26 open requests mention dimensions. | §2.2 #4/#9, §2.3(3), §2.7 | Measurement annotations are **deliberately out of schema** (`casaplaza.*` keys per the schema doc's "Out-of-schema editor state"), so auto-dimensions are editor-local and cannot corrupt `FloorplanData`. Room `polygon` already supports shoelace area; perimeter is a trivial derive. | **High / Low** |
| 3 | **An "arrange & duplicate" block: multiply, align, distribute, stack, fit-in, surround.** One panel with `Multiply (n × Δx,Δy)`, `Align left/centre/right`, `Distribute evenly`, `Stack`, and `Repeat around a room's perimeter` (the SurroundRoom use case). Multiplier is #12, Fit-In is one of the newest/most enthusiastically described tickets, SurroundRoom #35, Distribute elevation #33. | §2.2 #12, §2.2 tail, §2.7 | Operates on existing `FurnitureItem[]`: `position`, `rotationDeg`, `footprint`, `roomId`. Multiply = N appends with new ids; **no schema change**. | **High / Medium** |
| 4 | **Batch material/texture/colour editing on multi-select.** Select many furniture items and apply texture/colour/shininess at once, with undo. Mirrors Material Selector (#54), Global change color (#31), General Change Texture (#37), Change Texture (#53), Replacer (#55) — five plugins filling one hole. | §2.2 tail, §2.3(1) | Today `Room.floorTexture` is the only material field, and furniture has no material slot. Either extend the `FurnitureItem` type additively or (cheaper) treat it as an editor-side *style* overlay keyed by id. | **High / Low–Medium** |
| 5 | **A proper object/room inspector with lock + hide + tags.** Per-object `Locked` and `Hidden` flags, group/folder tree, keyword search, and **tag-based bulk visibility**. This is the densest wishlist cluster (round-1 #1277, #1276, t=14320, t=13933) and the community had to write a 39-install **Level Tags Manager** plugin for the tagging half. | §2.7, §2.2 tail | `Hidden`/`Locked` are editor state, not render state — keep them out of `FloorplanData` exactly as snap settings are ("Out-of-schema editor state" section). Tags likewise. Keeps share/export contracts clean. | **High / Medium** |
| 6 | **Unrestricted 2D pan/zoom with a "fit to content" and edge-centring.** No artificial scroll bounds. SH3D's workaround is dummy boxes at ±5000; the wishlist is open (t=15091). | §2.7 | None. Pure camera. | **High / Very low** |
| 7 | **Plan-only raster export at arbitrary resolution, plus SVG/DXF.** "Export plan image" is #8 (146 installs); SVG Tuner (#18) exists purely because built-in SVG is bloated; DXF export is an open request (#376). Offer full-plan PNG/JPEG at chosen DPI, an SVG with real vector walls, and DXF R12. | §2.2 #8/#18, §2.7 | Export reads `FloorplanData`; nothing stored. | **Medium-High / Medium** |
| 8 | **Save a selection as reusable furniture ("copy as new furniture").** Users compose a kitchen from 10 pieces, then must rebuild it next project; this is #10 and a vendor-blog favourite. | §2.2 #10, §2.5(1) | Needs a **new** user-library concept (id list + relative transforms), stored editor-side. Additive if it later joins the schema. | **Medium / Medium** |
| 9 | **3D navigation + in-3D annotation.** Middle-mouse (or trackpad) pan in 3D, and placeable 3D dimension lines / routed polyline runs (electrical, plumbing) that snap to floor/wall/ceiling. Pan3dView #3 (and a *dependency* for #6/#7) plus 3D dimension lines #7 and Wirings #6 are three of the top seven. | §2.2 #3/#6/#7 | 3D annotations are editor-side overlays; if they must survive share links, add an additive `annotations3d` array via `migrate.ts`. | **Medium / Medium-High** |
| 10 | **Whole-plan rotate and side/elevation view.** Rotate the entire plan 90° (Home Rotator #25, #1 ticket in the tracker) and render a saved side elevation (Side view #14). | §2.2 #14/#25 | Plan rotate is a pure transform over every `position`/`rotationDeg`/`polygon` — a clean schema-preserving operation and a good unit-test target (must preserve CCW winding!). | **Medium / Low** |
| 11 | **Terrain / site surface from selected rooms.** Terrain Generator is #15 and its 2026 fork added height-map import. A floor planner that stops at the exterior wall cannot show a garden, and the wishlist agrees (#746, #511, #743). | §2.2 #15, §2.7 | New entity type — a genuine `schemaVersion: 2` candidate via `migrate.ts`, not an editor-local hack, because the 3D viewer must see it. | **Medium / High** |
| 12 | **One honest line of positioning in the UI: "Everything here works in your browser — no plugins, no installs, no account."** The competitor's 61-plugin ecosystem is desktop-only by construction; its own browser edition cannot save and lacks rulers. | §2.4(b), §2.5(3), §2.6 | None. Copy + a small "works offline / saves on your device" badge. | **High / Very low** |
| 13 | **If extensibility is ever added, design the registry first.** A versioned, mirrored JSON manifest with per-item pages, integrity hashes, and **semver range matching for app versions** — instead of a single hobbyist URL, files-as-ticket-attachments, GPL-only, and hand-managed multi-release records. | §2.4(c), §2.8 | Manifest versioning should ride the same additive discipline as `migrate.ts`. | **Low now / High later** |

**Deliberately not recommended:** replicating a plugin API. The evidence is that SH3D's plugin ecosystem is a *symptom* of core gaps (§2.3, §2.4a) and a maintenance liability (§2.4c, §2.8). For a no-backend web SPA, shipping the ten highest-ranked plugin features natively is both cheaper and safer than any in-browser extension model.

---

## 4. Unknowns

- **The install leaderboard is opt-in and self-selected.** It measures users who installed the Plugin Manager *and* accepted anonymous telemetry (§2.1). It ranks plugins against each other well; it does not tell us what share of the installed base uses any plugin. The "active installations in the last 30 days" figure is a floor. `OBSERVED as method, INFERRED as population estimate.`
- **No per-plugin download totals from SourceForge.** I confirmed (rather than merely repeated) that the plugin binaries are ticket *attachments* with no stats endpoint; the `/files/` tree has no plugins folder. So there is no independent second popularity metric to cross-validate the leaderboard. I substituted GitHub stars and the vendor/partner blog, which are different populations again.
- **The statistics page has no visible "as of" timestamp.** I captured it 2026-10-31; the numbers are a rolling 30-day window, so a re-read will differ. Some ranking churn near ties (133/134/138) should not be over-interpreted.
- **My theme classification of the 60 catalogue plugins is my own**, one-theme-per-plugin and keyword-based; a plugin can legitimately belong to two themes (e.g. "Roof Generator" is geometry *and* an export-adjacent shape). Treat §2.3's table as indicative, not exact.
- **I did not run the Sweet Home 3D desktop app**, so "what each plugin adds" rests on the authors' ticket text, the vendor table and the Plugin Manager catalogue — not on hands-on use. Plugin behaviour descriptions are therefore `OBSERVED as published claims`, not independently verified. Two ticket fetches returned non-JSON (#45, #49) and one SF record came back as ticket #676 "brick"; I dropped them rather than guess.
- **The JS-bundle plugin-runtime check is a negative from grep over a minified transpile.** I searched `PluginManager`, `PluginAction`, `PluginController`, `PluginClassLoader`, `sh3p` and found zero, and the only `PLUGIN` token is a `ContentType` enum. That is strong evidence but not proof that no code path exists; the mechanism argument (JVM bytecode cannot run in a browser) is `INFERRED`. I did not execute a plugin-loading attempt in the browser edition.
- **Per-plugin geometry/stat pages** expose version and language breakdowns but no time series, so I cannot say whether a given plugin is growing or decaying — only how stale its last release is.
- **Plugin Manager catalogue completeness.** It lists 60 plugins while SourceForge holds 64 tickets and the vendor page lists 17; the differences are genuinely different sets (tickets include tools and dead plugins; the vendor page lists only "the most interesting"). I did not reconcile the three one by one.
- **`plugins.xml` is one person's curated file** and its host is the known single point of failure (§2.4c). Any catalogue-level claim in this report inherits that.
- **Reddit/Trustpilot remain unreadable** (round-1 HTTP 403 constraints), so community sentiment here comes from the vendor forum, SourceForge and one partner blog, not from open social platforms.
- **Round-1 environment constraints still apply**: `rea capture-browser-scenario` was blocked by the macOS sandbox, and `web_search` failed in this round with a missing `DEEPSEEK_API_KEY`; I used `web_fetch` plus DuckDuckGo HTML/lite endpoints (the latter returned HTTP 202 with no parsed results). No REA capture command was needed for this round's question, which is entirely documentary.
