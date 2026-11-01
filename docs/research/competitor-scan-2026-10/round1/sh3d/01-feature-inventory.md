# Sweet Home 3D — Complete Feature Inventory

Competitor research for **CasaPlazAI** (single-page web 2D/3D floorplanner).
Job folder: `01-01-feature-inventory`. Research date: 2026-10-31.

**Claim tags used throughout:** `OBSERVED` = seen directly in the live site, shipped JS, or a saved evidence file in this folder; `DOCUMENTED` = stated in a vendor page/doc; `INFERRED` = my reasoning from observed facts.

**Primary sources**
- Official EN site: https://www.sweethome3d.com/ · DE site: https://www.sweethome3d.com/de/
- User guide EN: https://www.sweethome3d.com/users-guide/ · DE: https://www.sweethome3d.com/de/sweet-home-3d-benutzerhandbuch/ (local copies `raw/users-guide.en.html`, `raw/users-guide.de.html`, `txt/users-guide.*.txt`)
- FAQ EN: https://www.sweethome3d.com/faq/ · DE: https://www.sweethome3d.com/de/faq/
- Version history EN: https://www.sweethome3d.com/history/ · DE: https://www.sweethome3d.com/de/versionsverlauf/
- Features: https://www.sweethome3d.com/features/ · Documentation: https://www.sweethome3d.com/documentation/
- Shortcuts PDF (v7.0): https://www.sweethome3d.com/storage/SweetHome3DShortcuts.pdf → `raw/SweetHome3DShortcuts.pdf`, `txt/shortcuts.txt`
- Online JS app: https://www.sweethome3d.com/SweetHome3DJSOnline.jsp → `raw/jsapp.html`, `raw/jsapp-rendered.html` (headless-Chrome DOM dump)
- Shipped JS (v7.5.2): https://www.sweethome3d.com/libjs/sweethome3d.min.js → `js/sweethome3d.min.js`
- **UI string catalog (v7.5.2):** https://www.sweethome3d.com/libjs/resources/localization.json (1963 keys) and `localization_de.json` (1747 keys) → `raw/localization.json`, `raw/localization_de.json`
- Default catalogs: https://www.sweethome3d.com/libjs/resources/DefaultFurnitureCatalog.json (100 models) and `DefaultTexturesCatalog.json` (26 textures)
- Plug-ins: https://www.sweethome3d.com/plugins/ · Free models: https://www.sweethome3d.com/free-3d-models/
- SourceForge release stream: https://sourceforge.net/projects/sweethome3d/rss?path=/SweetHome3D → `raw/sf-rss.xml`; best-release API → `raw/best-release.json` (captured inline)

---

## 1. Summary

- **Product & reach.** Sweet Home 3D is a GPL open-source interior-design app: a Java/Swing desktop program (Windows, macOS, Linux, Solaris), a paid mobile app (iOS/Android), and a **JavaScript/WebGL browser edition** ("Sweet Home 3D JS Online") that reuses the same core logic. Translated into **29 languages**; current site version **7.5** (footer: "Last update: May 5, 2025"), shipped JS labelled **7.5.2**. `OBSERVED` (`raw/features.html`, `raw/jsapp.html`, `raw/localization.json`).
- **Core loop.** Four resizable panes — furniture catalog, furniture list, 2D plan (grid + rulers), live 3D view — plus a toolbar. Every 2D edit updates 3D simultaneously; all plan edits are undo/redoable. `DOCUMENTED` (user guide) + `OBSERVED` (pane ids `#catalog-furniture-pane`, `#furniture-view`, `#home-plan`, `#home-3D-view`).
- **Tools.** Five drawing modes (walls, rooms, polylines, dimensions, texts) plus Select and Pan; walls support straight/round/sloping geometry; rooms auto-detect enclosed areas on double-click; doors/windows cut holes automatically; multi-level homes with per-level elevation/height/floor thickness. `OBSERVED` (localization action list) + `DOCUMENTED` (user guide).
- **Scale of feature surface.** The v7.5.2 `localization.json` exposes **173 menu actions**, **156 toolbar tooltips**, **109 toolbar/menu icons**, and dialog panels for walls, rooms, levels, furniture, 3D attributes, observer camera, polylines, dimensions, labels, compass, materials, baseboards and additional properties. `OBSERVED`.
- **Version-history caveat.** The official history page stops at **7.5.2 (2024-08-29)**, but SourceForge has shipped **SweetHome3D-7.6.1 (2026-10-20)** with no matching entry on the site or history page at capture time. `OBSERVED` (`raw/sf-rss.xml`; SourceForge best-release API date `2026-10-20 16:35:51`).

---

## 2. Findings

### 2.1 Application architecture and platforms

| Aspect | Detail | Tag |
|---|---|---|
| Desktop | Java app; MVC architecture; extensible via Java plug-ins | `DOCUMENTED` (features, developer guide) |
| Web edition | "Sweet Home 3D JS Online" at `/SweetHome3DJSOnline.jsp`, runs in any WebGL browser; **no menu bar** — all menu items reachable from contextual menus/toolbar, except 3D-model import, photo creation and video creation | `DOCUMENTED` (user guide §Installation, online page) + `OBSERVED` |
| Web app libraries | `libjs/sweethome3d.min.js` (2.6 MB), `core`, `geom`, `graphics2d`, `swingundo`, `gl-matrix`, `jszip`, `triangulator`, `viewmodel`; the desktop Swing model/controller layer is ported to JS | `OBSERVED` (`raw/jsapp.html` script list) |
| Mobile | Sweet Home 3D Mobile (App Store / Google Play), paid, 10,000+ models / 400 textures | `DOCUMENTED` (download page) |
| Storage | Desktop saves `.sh3d`; Online auto-saves on server once registered; JS also supports saving to a server, **IndexedDB** or **localStorage**, with auto-recovery in IndexedDB | `DOCUMENTED` (FAQ; v7.2 history) |
| PDF/JS Editor deployment | Prebuilt JSP and PHP web-app versions; JSP records edits incrementally (used by Online), PHP saves directly on Save | `DOCUMENTED` (v7.2 blog/history) |

Minimum requirements (FAQ): Windows 98→11, Mac OS X 10.4→macOS 14, various Linux, Solaris; 400 MHz, 256 MB. `DOCUMENTED`.

### 2.2 The workspace panes and toolbar

`OBSERVED` — the rendered online DOM contains exactly these app containers and canvases:
`#home-pane`, `#application-menu-toolbar`, `#home-pane-toolbar`, `#catalog-furniture-pane`, `#furniture-catalog`, `#furniture-catalog-list`, `#furniture-view`, `#plan-3D-view-pane`, `#home-plan` (with `#level-selector`), `#home-3D-view` (`<canvas>`), `#compass-dialog-template` … etc.
The JS online app's analytics code also names the five primary toolbar buttons: `toolbar-button-CREATE_WALLS`, `CREATE_ROOMS`, `CREATE_POLYLINES`, `CREATE_DIMENSION_LINES`, `CREATE_LABELS`. `OBSERVED` (`raw/jsapp.html`, lines around the `TRACK TOOLBAR EVENTS` block).

Each pane can take focus (Tab / Shift+Tab or click); the focused pane is shown by a coloured border, and some operations depend on which pane has focus. `DOCUMENTED` (user guide).

### 2.3 Complete menu inventory (173 actions, from `localization.json` v7.5.2)

All names below are the shipped English UI strings (`OBSERVED`). German equivalents were also extracted and match (`raw/localization_de.json`).

**File menu** — New · New from demo… · Open… · Open recent home · Close · Save · Save as… · Save and compress · Page setup… · Print… · Print preview… · Print to PDF… · Preferences… (macOS: Sweet Home 3D > Preferences) · Exit · Erase recent-homes list.

**Edit menu** — Undo · Redo · Cut · Copy · Paste · Paste to group · Paste style · Delete · Select all · Select all at all levels.

**Plan menu (tools + object editing)**
- Modes: **Select** · **Pan** · **Create walls** · **Create rooms** · **Create polylines** · **Create dimensions** · **Add texts**.
- Wall editing: Split wall · Join walls · Reverse walls direction · Modify walls… · Modify baseboard (per side) · Modify 3D view.
- Room editing: Modify rooms… · Add point to room · Delete point from room · Recompute room points.
- Other objects: Modify polylines… · Modify dimensions… · Modify texts… · Modify compass… · Modify text style (Increase size / Decrease size / Bold / Italic).
- Background image: Import background image… · Modify background image… · Delete background image · Hide background image · Show background image.
- Global transforms: Flip horizontally · Flip vertically · Lock base plan / Unlock base plan.
- **Levels submenu:** Add level · Add level at same elevation · Modify level… · Delete level · Make level viewable / unviewable · Make level the only viewable one · Display all levels · Display selected level.

**Furniture menu**
- Add to home · Add to group · Modify… · Import furniture… · Import furniture library… · Import texture… · Import textures library…
- Group · Ungroup · Align side by side · Align or distribute furniture (**Align on left / right / top / bottom / left side / right side / front side / back side; Distribute horizontally / vertically**) · Reset elevation.
- Export to CSV format… · Export to OBJ format… · Export to SVG format…
- Sort by (≈26 sort keys) · Display column (≈26 column toggles).

**3D view menu** — Aerial view · Virtual visit · Modify 3D view… · Modify virtual visitor… · Store point of view… · Go to point of view · Create photos at points of view… · Delete points of view… · Create photo… · Create video… · Export to OBJ format… · Display in separate window / Display in main window · Display all levels / Display selected level.

**Help menu** — Sweet Home 3D help · About…

`INFERRED`: the 26 "Sort by" / "Display column" keys correspond to furniture-list columns (name, description, width, depth, height, elevation, angle, level, color, texture, price, VAT, VAT %, price incl. VAT, creator, license, reference/catalog id, model size, movable, door/window, visible, x, y).

### 2.4 Drawing & geometry model

| Feature | Detail | Tag |
|---|---|---|
| Wall types | Rectangular, **sloping** (height at start / height at end), **round** (arc extent in degrees) | `DOCUMENTED` (guide, FAQ) + `OBSERVED` (`raw/localization.json` → `WallPanel`) |
| Wall attributes | Thickness, height, left/right side colour, texture, matt/shiny, top colour in 3D, pattern in plan, baseboards (height, thickness, colour/texture, or "same as wall side") | `OBSERVED` (`WallPanel`, `BaseboardChoiceComponent`) |
| Wall drawing aids | Tooltip while drawing, alignment lines, zoom buttons, type length+angle with `Enter`, magnetism in 15° multiples, temporary dimension lines along a resized wall (v6.3) | `DOCUMENTED` |
| Rooms | Point-by-point polygon, or **double-click inside a closed surface** to auto-create a room; a double-click room includes each door's half doorstep so rooms join correctly in 3D; per-room floor/ceiling colour+texture+matt/shiny, wall-sides finish, display floor/ceiling/area toggles, **Flat ceiling only** (sloping-ceiling computation), "Recompute walls" | `DOCUMENTED` + `OBSERVED` (`RoomPanel`) |
| Polylines | Thickness, colour, dash style, dash offset (%), join style, arrows, visible in 3D view | `OBSERVED` (`PolylinePanel`) |
| Dimensions | Horizontal or vertical, plan or **elevation** dimension, font size, extension-line length, colour, elevation, distance-between-end-points; drawn freely or snapped to a wall/furniture/room side | `OBSERVED` (`DimensionLinePanel`) |
| Texts | Text, font, size, colour, left/centre/right alignment, horizontal/vertical orientation, elevation, visible in 3D | `OBSERVED` (`LabelPanel`) |
| Compass | Visible in plan, diameter, north direction (°), latitude/longitude, time zone | `OBSERVED` (`CompassPanel`) |
| Levels | Name, elevation (negatives = underground), height, floor thickness, viewable; levels shown as tabs; lower levels drawn in light colour; levels at the same elevation managed as ordered layers | `DOCUMENTED` + `OBSERVED` (`LevelPanel`) |
| Measurement entry | Numeric fields accept **math expressions** (v6.3) | `DOCUMENTED` |

Units: millimetre, centimetre, metre, inch/decimals, inch/fraction, foot/inch/fraction, foot/decimals. `OBSERVED` (`UserPreferencesPanel.unitComboBox.*`).

### 2.5 Furniture, openings, materials and groups

- **Catalog** is category-organised and searchable; can be viewed as category folders or a searchable list; icon size configurable; icons can be catalog icons, top view, or monochrome. `OBSERVED` (`UserPreferencesPanel`, `FurnitureCatalogListPanel` — "Search:", "Category:", "All").
- **Default free catalog** contains **100 models in 8 categories** with **26 textures in 3 categories** (Floor 12, Wall 11, Sky 3). `OBSERVED` (`raw/DefaultFurnitureCatalog.json`, `raw/DefaultTexturesCatalog.json`).
  Categories (model counts): Living room 25, Doors and windows 21, Bedroom 11, Kitchen 10, Miscellaneous 10, Lights 8, Bathroom 6, Staircases 3.
- **Store/full version** ships 10,836 (Windows) – 10,894 (macOS) models and 423 textures; mobile 10,000+/400+; the free 3D-models page adds 1,602 downloadable ZIP models. `DOCUMENTED`.
- **Doors/windows** snap to a wall, orient/resize to wall thickness, cut holes automatically; opening side (inward/outward) follows the wall side dropped on; rotation axis can be flipped via **Mirrored shape**; "Modify openings…" exposes per-model opening parameters. `DOCUMENTED` (FAQ, guide) + `OBSERVED` (`HomeFurniturePanel.modelTransformationsButton`, `WallPanel`, furniture properties `doorOrWindowWallThickness`, `staircaseCutOutShape` in JS).
- **Furniture editing** (`HomeFurniturePanel`): name, description, x/y, width/depth/height, elevation, angle, **roll/pitch** (rotation about Y/X axes), visible, display name in plan, mirrored shape, part of base plan, colour / texture / model materials / matt-shiny, **light power**, price, VAT %, "Modify posture…" (mannequin articulation), keep proportions, "Other properties…".
- **In-plan manipulation indicators:** drag corner handles to resize, rotate (15° magnetism, Alt toggles), change elevation, change height. Magnetism also rotates furniture back to a wall, stacks pieces, and (from 7.2) magnetises onto **shelf units** (`shelfElevations`, `shelfBoxes`). `DOCUMENTED` (guide) + `OBSERVED` (JS property names).
- **Groups**: Group / Ungroup, Add to group, Paste to group; group members can be selected/edited/deleted without ungrouping; Align/Distribute. `OBSERVED` (menu list).
- **Model materials**: per-material colour/texture, Matt/Shiny, **Invisible** (v5.2) to hide parts; material picking from the 3D preview (v7.0). `OBSERVED` (`ModelMaterialsComponent`).
- **Model deformation**: "Modify deformation" panel with preset shapes, drag-and-drop parts, front/side/top views, "Reset shape", and per-shape move-prefix conventions. `OBSERVED` (`ModelTransformationsPanel`, `ModelTransformationsPanel.title = "Modify deformation"`).
- **User-defined furniture properties** can be surfaced in the table/panel. `DOCUMENTED` (v7.2).
- **Prices**: currency, optional VAT, Price + VAT % per item, totals below the list; "Ignore prices" option. `OBSERVED` (`HomeFurniturePanel`, `FurnitureTablePanel` — Total price / Total VAT / Total VAT included).

### 2.6 Import / export and file formats

`OBSERVED` (`FileContentManager.*`) + `DOCUMENTED`:

| Format | Direction | Notes |
|---|---|---|
| `.sh3d` / `.sh3x` | Home save/open | ZIP-based; checks ZIP magic; repair-friendly temp-file save | 
| `.sh3f` | Furniture library | double-clickable; import via Furniture menu |
| `.sh3t` | Textures library | " |
| `.sh3p` | Plug-in | " |
| `.sh3l` | Language library | " |
| OBJ (+MTL + textures), DAE, 3DS, KMZ, ZIP-wrapped model | Import | Furniture import wizard; Mac App Store build requires ZIP/KMZ |
| OBJ + MTL | Export 3D view | "Export to OBJ format…" |
| SVG | Export plan | "Export to SVG format…" |
| CSV | Export furniture list | UTF-8 forced (v6.0) |
| BMP/JPEG/GIF/PNG | Import background image & textures | |
| PNG / JPEG | Export 3D-view photos | Photo pane, JPEG quality % |
| QuickTime video | Export 3D camera path | Video pane |
| PDF | Print to PDF | |

### 2.7 3D views, rendering and photo/video

- Two navigation modes: **Aerial view** (orbit/turn around the scene; centred on home bounds by default, or on selection via a preference) and **Virtual visit** (walk-through with a visitor figure drawn in the plan, with four handles: head angle, field of view, body angle, eyes elevation). `DOCUMENTED` + `OBSERVED` (`View_FROM_TOP`/`VIEW_FROM_OBSERVER`).
- 3D-view attributes: ground colour/texture, sky colour/texture, **light brightness**, **wall transparency**, background image visible on ground. `OBSERVED` (`Home3DAttributesPanel`).
- **Create photo…** — width/height in pixels, aspect-ratio presets (3D view, 4:3, 3:2, 16:9, 2:1, 2.40:1, square), quality levels **0–3** (0 = same as 3D view, 1 = + floor shadows, 2 = fast global illumination, 3 = global illumination), **lens** (Default / Depth of field / Fisheye / Spherical), **renderer** (SunFlow default / **YafaRay** from v7.0), date, time, ceiling lights. `OBSERVED` (`PhotoPanel`, `PhotoSizeAndQualityPanel`).
- **Create video…** — same quality/renderer model; the user walks the 3D view and drops waypoints on a camera path, then Create → Save. `OBSERVED` (`VideoPanel`).
- **Create photos at points of view…** — batch-render photos at stored viewpoints, PNG or JPEG. `OBSERVED` (`PhotosPanel`).
- Store / go-to / delete named **points of view** (`Store point of view…`). `OBSERVED`.
- **Display 3D view in a separate window** and re-attach. `OBSERVED` (menus; v7.3/v7.4 bug fixes reference it).
- Only one Create-photo pane open at a time; home stays editable during a long render. `DOCUMENTED` (guide).
- Performance guidance: best quality levels are CPU-only (GPU not used), so prefer YafaRay, more RAM, fewer/simpler lights and textures, smaller images. `DOCUMENTED` (FAQ).

### 2.8 Printing and page setup

`OBSERVED` (`PageSetupPanel`) + `DOCUMENTED`:
- Print / Print preview / Print to PDF; by default prints furniture list + plan + current 3D view.
- Page format, header format, footer format with variables, print toggles for plan / furniture list / 3D view.
- Plan scale: **best fit** or explicit `1 / N`; **Print levels** — selected level only or all levels (multi-level printing from v7.2).
- Page-setup pane not available in Online/Mobile. `DOCUMENTED`.

### 2.9 Preferences inventory

`OBSERVED` — every `UserPreferencesPanel.*.text` string:
- Unit; Language; Default font; Icon size; Catalog view (**Category folders** / **Searchable list**); Furniture icons in plan (**Catalog icons** / **Top view** / **Monochrome**); Room rendering in plan (**Floor colour or texture** / …); Wall pattern in plan.
- Magnetism (**Enabled**); Rulers (**Visible**); Grid (**Visible**); New walls thickness / height / pattern; New levels floor thickness.
- 3D navigation arrows (**Visible**); **Selection and editing in 3D view** (v7.2); **Aerial view centered on selection** (Enabled); **Select visitor in plan at 3D move** (Enabled).
- Currency; **Use VAT**; Save home data for recovery every N minutes; Check updates at launch.
- Language choices: 29 languages.

### 2.10 Wizards

- **Import furniture**: choose model (OBJ/DAE/KMZ/3DS/ZIP), orient with front/right/top/perspective views (Shift = fine steps), invert back/front faces, hide model edges (DAE), set name/size/elevation/colour, flags Movable / Door or window / Staircase, category (editable — typing a new name creates a category), creator, add-to-catalog, then rotate the model to choose its catalog/plan icon. `OBSERVED` (`ImportedFurnitureWizardStepsPanel`) + `DOCUMENTED`.
- **Import texture**: choose image (BMP/JPEG/GIF/PNG), set name, real-world width/height, category, creator. `OBSERVED`.
- **Import background image**: choose image, set scale by dragging a line and entering its real length, set plan origin (x/y). `OBSERVED` (`BackgroundImageWizardStepsPanel`) + `DOCUMENTED`.
- Generic wizard chrome: `< Go back` / `Continue >` / `Finish` / `Cancel`. `OBSERVED` (`WizardPane`).

### 2.11 Shortcuts (v7.0 PDF, `raw/SweetHome3DShortcuts.pdf`)

Representative entries (`DOCUMENTED`/`OBSERVED` from PDF text):
- **File:** Ctrl+N/O/S, Ctrl+Shift+S, Ctrl+Alt+S (save & compress), Ctrl+W, Ctrl+Shift+P (page setup), Ctrl+P, Ctrl+, (prefs).
- **Edit:** Ctrl+Z / Ctrl+Y, Ctrl+X/C/V, Ctrl+Alt+V (paste style), Ctrl+Shift+V (paste to group), Del, Ctrl+A.
- **Furniture:** Ctrl+E (modify), Ctrl+Shift+G/U (group/ungroup), Ctrl+Shift+B (align side by side), Ctrl+Shift+Y (reset elevation), Ctrl+Shift+I (import furniture), Ctrl+Alt+I (import texture), drag-and-drop a model file.
- **Plan:** Ctrl+L select, Ctrl+Alt+P pan, Ctrl+Shift+W walls, Ctrl+Shift+R rooms, Ctrl+Shift+J polylines, Ctrl+Shift+L dimensions, Ctrl+Shift+T texts, Ctrl+K / Ctrl+Shift+K zoom, Ctrl+Alt+L lock base plan, Ctrl+Shift+E modify walls, Ctrl+Alt+J join walls, Ctrl+Alt+E modify rooms, Ctrl+Alt+Shift+E modify polylines, Ctrl+Alt+B modify level, Ctrl+Shift+H toggle level viewable, Ctrl+B / Ctrl+I bold/italic.
- **3D view:** Ctrl+D aerial, Ctrl+Shift+D virtual visit, Ctrl+Shift+M modify 3D view, Ctrl+Alt+M virtual visitor, Ctrl+Alt+R store point of view, Ctrl+Alt+Y detach/attach window, Ctrl+Alt+A all levels, Ctrl+Shift+A selected level.
- Alt+click draws a curved wall; Enter enters wall/room dimensions; Shift+Alt+drag constrains movement to one axis.
- Note: the shortcuts PDF is dated **v7.0**, so features added after 7.0 (e.g. "Modify dimensions…") are not listed there. `OBSERVED`.

### 2.12 Plug-ins and companion tools

`DOCUMENTED` (plugins page, `txt/plugins.txt`), all installable by double-clicking a `.sh3p`:
- Space Mushrooms: CopyAsNewFurniture, ShapeGenerator (3D shape from 8 vertices), StaircaseGenerator, TerrainGenerator (terrain from selected rooms), SideView, ExportPlanImage (PNG/JPEG), ExportToSH3F, ExportToSH3T, ExportToHTML5, UpdateRoadLinesPlugin, EvidenceMarkerGenerator.
- Third party: AdvancedEditing (rotate/move/flip/resize, edit room points, connect walls), Multiplier, AutoDimensioning, GenerateRoof (slope angles), AdvancedSettings/PhotoRendering, PhotoVideoRendering (Enko Nyito).
- Tools: **Furniture Library Editor** 2.2, **Textures Library Editor** 2.1, HugeFileCleaner, **Tape Measure** (iOS, creates a scaled floorplan for import).
- Exported-homes manager hosts `.sh3d` files on sweethome3d.com. `DOCUMENTED`.

### 2.13 Version-history highlights (official history page, `txt/history.en.txt`)

Timeline of version headers `OBSERVED`: 7.5.2, 7.5, 7.4, 7.3, 7.2, 7.1, 7.0.2, 7.0, 6.6.4, 6.6.2, 6.6, 6.5.2, 6.5, 6.4.2, 6.4, 6.3, 6.2, 6.1.2, 6.1, 6.0, 5.7, 5.6, 5.5.2, 5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.6 … down to 1.3 (2008). Highlights of the last major releases:

- **7.5.2 — 2024-08-29.** Fixed a JS/JS-Viewer/JS-Online bug that prevented displaying a home in some browsers.
- **7.5 — 2024-08-21.** 3D-view sync fixes when detached in a second window; underground-level render fix; Thai font fix; door/window-wall-thickness default and light-source material name fixes in Furniture Library Editor; copyright changed after **Space Mushrooms took over the project**.
- **7.4 — 2024-05-30.** Fix for elevation of furniture rotated about a horizontal axis; multi-monitor detach/re-attach fixes; allow resetting a furniture description; CSV export fix for empty description/license.
- **7.3 — 2024-04-04.** Go-to-point-of-view scroll arrows; mirroring fixes; import models with missing deformation groups; fixed dimension font; catalog handling of untranslated plug-ins; ignore plug-ins incompatible with the running Java; **category + multi-word search in the JS Online catalog**; removed macOS support from the portable build; German help updated.
- **7.2 — 2023-09-22.** **Modify dimensions** dialog (coords, colour, font size); dimensions in 3D view; **elevation dimensions**; **Selection and editing in 3D view** preference; shelf magnetism (`shelfElevations`, `shelfBoxes`); user-defined furniture properties; preset postures; **multi-level printing**; Recompute room points; Description and License columns; 3D updates paused when hidden. Same features added to JS Online; JS gained server/IndexedDB/localStorage home storage with auto-recovery; JS Editor deployable on JSP/PHP.
- **7.1 — 2023-03-03.** Furniture **description** field; description in catalog tooltips; Java 3D/JOGL updates; Portuguese (Portugal) vs Brazilian Portuguese split; JAR executables double-clickable on Java ≥16.
- **7.0.2 — 2022-07-31.** Import-wizard layout, transparent-room rendering, SVG room transparency, split-wall connection fixes.
- **7.0 — 2022-07-13.** **YafaRay** renderer selectable at the two best photo/video qualities; `lightSourceMaterialName#`; decimals in light power; resizable photo/video dialogs; toolbar **magnetism** toggle; Levels moved to a submenu; material picking in the 3D preview; room tooltip diagonal editing; units **Inch/Fraction** and **Foot/Decimals**; hide model edges; more model-orientation options; **Flat ceiling only** for sloping ceilings; MakeHuman/DAE controller+skin support.
- **6.6 family (2021).** New icon set by madudesign, HiDPI icon optimization; JS Online gained catalog search, furniture list, splitters, modification dialogs, contextual menus, texture/background wizards.
- **6.5 — 2021-03-02.** Java/Java 3D provider info in About; `singleInstance` property; **Apple Silicon (ARM) native support**; notarized macOS installer; Azul OpenJDK bundling; JOGL 2.4 for Java 9+.
- **6.4 — 2020-07-21.** Home objects gained modifiable **IDs**; **editing home plans in Sweet Home 3D JS** with saving to a JSP server; JS Viewer iOS touch fixes.
- **6.3 — 2020-04-15.** Select/Toggle-selection in the 3D-view context menu; drag-and-drop reordering in the furniture list; temporary dimension lines while resizing walls and moving room points; higher max zoom; **math expressions** in plan tooltips.
- **6.2 — 2019-07-10.** Searchable "Adjustable" tag; further fixes.
- **6.1 — 2019-01-22.** Selection toggling without losing other selections; mirror-on-hinge / mirror-on-rail shape prefixes; memory usage in About.
- **6.0 — 2018-10-11.** **Rotate and slide openings and light spots**; articulated **mannequin**; **price management** (currency, VAT, Price/VAT% fields, list totals); math expressions; **Flip horizontally / vertically**; multi-line and aligned texts; texture X/Y offset; multi-select material editing; polyline dash offset; **polylines visible in 3D**; background image on the 3D ground; level-menu separation; Ctrl-modifier resize along one axis; curved-wall indicator mid-wall; sloping walls down to 0 at one end; 2.40:1 ratio; saved column widths; 24-bit Z-buffer; equirectangular sky mapping; CSV UTF-8.
- **5.x highlights.** 5.5 (2017): Join walls, horizontal-axis furniture rotation, per-texture scale, Creator fields, decimals in angle spinners. 5.3: translucent walls over background image; `Home.xml` + `.sh3x` association; `HomeObject` superclass. 5.2: **Invisible** material option; `resolutionScale`; HiDPI Java Web Start build; new logo. 5.0 (2015): **polylines**, **baseboards**, layers at same elevation, **Paste style**, add/delete room point, select-and-edit inside groups, Add to group/Paste to group, default font preference, free-text font/colour and display in 3D.
- **4.x / earlier.** 4.4 (2014): SH3D import/export in the Online version, file repair. 3.4 (2011): multi-level support (`Plan > Levels > Add level`). 3.2 (2011): **Sweet Home 2D** mode (`-Dcom.eteks.sweethome3d.no3D=true`) disabling all 3D features.

`DOCUMENTED` — release notes linked from history page:
- https://www.sweethome3d.com/blog/2024/08/21/sweet_home_3d_7_5_by_space_mushrooms.html
- https://www.sweethome3d.com/blog/2024/04/04/sweet_home_3d_7_3.html
- https://www.sweethome3d.com/blog/2023/09/25/sweet_home_3d_7_2.html
- https://www.sweethome3d.com/blog/2022/07/13/sweet_home_3d_7_0.html

### 2.14 The browser edition in detail (`OBSERVED`)

- Bootstrapped from `SweetHome3DJSOnline.jsp`; loads ~20 JS files plus `SweetHome3D.js` helper; registers a **service worker** (`/resourceCache.js`) to cache resources offline. `OBSERVED` (`raw/jsapp.html` inline script).
- Demo chooser offers: **Empty home, Studio, 1-Bedroom apartment, 2-Bedroom apartment, 3-Bedroom apartment, Apartment with bow window, 2-Bedroom house with basement, 3-Bedroom house with attic, 3-Bedroom house with mezzanine**. `OBSERVED` (`#demo-choice` in `raw/jsapp-rendered.html`; guide links `examples/…png`).
- The JSP embeds **dialog templates as `<div>` elements** (`home-furniture-dialog-template`, `wall-`, `room-`, `level-`, `observer-camera-`, `home-3Dattributes-`, `compass-`, `polyline-`, `dimension-line-`, `label-`, `user-preferences-dialog-template`) whose labels are `@{Section.key}` placeholders resolved from `localization.json`. `OBSERVED`.
- JS version differences vs desktop: no menu bar; no 3D-model import; no photo/video creation; homes auto-save server-side when registered. `DOCUMENTED` (user guide) + `OBSERVED` (templates omit photo/video/import).
- `OBSERVED` — the online app supports editing in the **3D view** ("editingIn3DViewCheckBox") and reports `SweetHome3DJSApplication.confirmRecoverHome` ("The document wasn't saved during the last edition…"), i.e. recovery after a crash.
- `INFERRED`: the browser build is the same feature engine as desktop, minus imports and rendering; this makes it the closest structural analogue to CasaPlazAI's own SPA.

### 2.15 REA observations

- `rea capture-browser-scenario` launched an owned Chromium 156.0.8078.74 in headless mode against `https://www.sweethome3d.com` and cleaned up its process, but the JS app's initial load exceeded both a 300 s and a 900 s server/provider deadline; both captures ended with `provider_timeout` and **zero retained steps**. Evidence: `out-boot.json`, `out-app.json`, `out-app.err`. `OBSERVED`.
  - `INFERRED`: the online app is a heavy first-load (≈2.6 MB main script + many textures/models over a service worker) — relevant for CasaPlazAI's own load budget.
- A plain headless-Chrome DOM dump with a 120 s virtual-time budget **did** render the app shell and all dialog templates, and is the source of `raw/jsapp-rendered.html`. `OBSERVED`.
- All UI strings were obtained statically from the shipped `localization.json` / `localization_de.json`, which is more complete than scraping the rendered UI. `OBSERVED`.

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranking = value to a user-drawing-on-a-0.5-m-grid single-page floorplanner ÷ effort. "Finding" links to §2.

| # | Idea | Finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Auto-room from enclosed walls (double-click inside a closed surface)** — infer a room polygon from surrounding walls, magic-wand style, instead of forcing the user to trace every room corner. | §2.4 (`RoomPanel`/guide) | High | Medium |
| 2 | **Live 2D→3D coupling of the same objects, with focus-aware panes** — Sweet Home 3D's strongest UX: every 2D edit is instantly reflected in 3D, and the *focused* pane is highlighted because operations differ per pane. CasaPlazAI should give the plan and the 3D preview visual focus states. | §2.2, §2.1 | High | Low |
| 3 | **Wall drawing with numeric entry + angle/dimension tooltips** — while drawing, show live length/angle; let the user type an exact length/angle; snap angle to 15° multiples (CasaPlazAI uses a 0.5 m grid, so add explicit length entry and a magnetism toggle). | §2.4, §2.11 | High | Medium |
| 4 | **Automatic wall openings for doors/windows** — dropping a door/window on a wall should cut the hole, auto-size to wall thickness, and flip inner/outer side by which wall face it was dropped on. CasaPlazAI already places openings on walls; auto-sizing and side-flip are the differentiators. | §2.5 | High | Medium |
| 5 | **Corner-handle manipulation model (resize / rotate / elevate / height)** — Sweet Home 3D gives each selected object four distinct drag handles, with Alt toggling 15° rotation magnetism. Extends CasaPlazAI's existing fit/collision constraints with direct manipulation. | §2.5 | High | Medium |
| 6 | **Undo/redo that names the operation, plus "Paste style"** — every edit undoable, labelled ("Add level", "Split wall"), and a Paste-style action to copy appearance (colour/texture) between same-type objects. Cheap and very visible. | §2.3, §2.11 | High | Low |
| 7 | **Levels with elevation, tab UI, and lower-level ghosting** — a tab strip at the top of the plan, per-level elevation/height/floor thickness, lower-level walls drawn in light colour to guide drawing. Natural next step after CasaPlazAI's shared-wall support. | §2.4 | High | High |
| 8 | **Full furniture property panel** (name, description, x/y, w/d/h, elevation, angle, roll/pitch, visible, mirrored, colour/texture, price) and a **sortable/column-toggleable furniture list** with a searchable, category-filtered catalog. CasaPlazAI's palette is small; the panel + list UI is the leverage. | §2.5, §2.3 | High | Medium |
| 9 | **Export plan to SVG/PNG and furniture to CSV; import/export a portable project file** — plus a "print/export PDF" path with header/footer variables and best-fit or 1:N scale. CasaPlazAI already exports PNG/JPEG; SVG (vector) and CSV are new. | §2.6, §2.8 | Medium | Medium |
| 10 | **Photo-quality presets with camera lenses and batch photo-at-viewpoints** — a small quality ladder (view / +shadows / global illumination) plus aspect-ratio presets and named stored viewpoints. Cheaper than full offline rendering and matches the "export PNG/JPEG" need. | §2.7 | Medium | Medium |
| 11 | **Measurement/text annotation toolset** (polylines with dash styles, dimension lines that snap to wall/room/furniture sides, free texts with font/alignment, compass with north + lat/long) — CasaPlazAI has "measure"; snapping dimensions and an elevation dimension type are the upgrades. | §2.4 | Medium | Medium |
| 12 | **Preferences panel** exposing units (incl. inch/fraction and foot/decimals), grid & ruler visibility, magnetism, icon size, catalog view mode, room rendering and autosave-for-recovery interval. CasaPlazAI autosaves to localStorage already; expose the interval. | §2.9 | Medium | Low |
| 13 | **Magnetism as an explicit, toolbar-toggleable behaviour** with modifier overrides (Alt to disable, Shift+Alt to constrain to an axis) — rather than an always-on 0.5 m grid. | §2.4, §2.11 | Medium | Low |
| 14 | **Group / align / distribute** for furniture (align on 8 sides, distribute horizontally/vertically, reset elevation, group/ungroup). | §2.5 | Medium | Medium |
| 15 | **Invisible materials and per-part material editing** so users can hide parts of a model; plus a per-object **Invisible** flag that keeps it in the list. CasaPlazAI's fixed palette makes this lower priority. | §2.5 | Low | Medium |
| 16 | **Model-deformation panel with preset shapes** — a differentiable "wow" feature for parametric furniture. High effort; only after the core is solid. | §2.5 | Low | High |
| 17 | **Named stored viewpoints (store/go-to/delete) and a detachable 3D view** — a single-workspace UI redesign makes "detach" awkward; storing viewpoints for export is the useful half. | §2.7 | Low | Low |
| 18 | **Keyboard-shortcut map** mirroring the documented set (mode switches for wall/room/select/pan, zoom, undo, paste-style) exposed in a help panel. | §2.11 | Medium | Low |
| 19 | **Import a scanned blueprint as a scaled, positionable background under the plan** — three-step wizard: choose image → drag a line and type its real length → set origin. CasaPlazAI's 0.5 m grid makes the scale step easy to verify. | §2.10 | High | Medium |
| 20 | **Catalog search with multi-word + category filter**, and a category-grouped tree/list toggle. | §2.5, §2.13 (7.3) | Medium | Low |

**Cross-cutting takeaways `INFERRED`:** (a) Sweet Home 3D's moat is *depth of the object model* (levels, materials, dimensions, prices, deformation) layered over a very simple 4-pane shell — CasaPlazAI can copy the shell cheaply and grow the model incrementally. (b) Its browser build is the same engine minus import/photo/video, so CasaPlazAI can benchmark feature-parity against the JS edition rather than the desktop one. (c) Its biggest observed weakness is first-load weight (the online app did not finish booting inside 300 s in a headless capture) — a direct opportunity for CasaPlazAI's no-backend, localStorage-first SPA.

---

## 4. Unknowns / what I could not verify

- **Version 7.6.1 is unexplained.** SourceForge has `SweetHome3D-7.6.1` (2026-10-20, Windows + macOS installers ≈122 MB each, `raw/sf-rss.xml`, best-release API), but the official history page, footer, `SweetHome3DUpdates.xml` and the shipped JS all still say **7.5 / 7.5.2**, and I found **no 7.6.x release notes, blog post or localized history**. I could not download the 7.6.1 `README.TXT` (SourceForge returns an HTML interstitial rather than the 714-byte text file), and its release-notes URL is `null` in the API. **Therefore the 7.6.1 feature deltas are unverified.** This is the single biggest gap in the inventory.
- **No release notes for anything after 7.5.2** on the site, so any 7.6.x features (if real) are absent from §2.13.
- **The live online app never completed its first load** under REA's browser provider (300 s and 900 s deadlines both hit; `out-boot.json`, `out-app.json`). I could not interactively exercise the JS edition (draw a wall, open a room dialog, inspect live object state). All JS-edition findings come from its static HTML/DOM templates, shipped JS and resource bundles rather than interaction.
- **Screenshots are unusable by me** — this model has no image input, so `shots/online-app.png` was captured but not visually analysed; findings rest on the DOM dump and static bundles.
- **The shortcuts PDF is v7.0**, so post-7.0 menu items (e.g. "Modify dimensions…", shelf magnetism) have **no documented keyboard shortcut** in my sources; I could not confirm whether the in-app help has them.
- **Exact toolbar button order and the full icon set** were not recovered: the online DOM exposes only the five analytics-tracked button ids (walls/rooms/polylines/dimensions/texts) plus the 109 `HomePane.*.SmallIcon` resource names; the actual on-screen arrangement beyond those five is unverified.
- **The 7.2+ "Selection and editing in 3D view" interaction details** (how selection, move and rotation work in 3D on desktop vs touch) are known only from release notes, not exercised.
- **Plugin behaviour** is catalogued but not executed (installers are forbidden and unnecessary for this task); individual plug-in feature depth beyond the one-line descriptions is unverified.
- **Pricing/store specifics** (Mac App Store vs Microsoft Store vs Amazon prices, current store model counts) were taken from the download page and FAQ at capture time and can change; mobile "10,000+ models / 400+ textures" is a vendor marketing figure.
- **Mobile apps** (iOS/Android) could not be installed or inspected; their behaviour is described only from the site and the v7.2 note that "furniture can be elevated in the 3D view after a long touch … and rotated with a second finger".
- **Legal note:** Sweet Home 3D is GPL-2.0; no source code was copied. Everything here is behaviour, UI-string and data-model description. The extracted `localization.json`/catalog JSON are retained only as evidence of the shipped UI/feature surface.

---

### Evidence index (files in this job folder)

- `report.md` (this file), `sources.json`
- `raw/features.html`, `raw/documentation.en.html`, `raw/documentation.de.html`, `raw/download.en.html`, `raw/download.de.html`
- `raw/users-guide.en.html`, `raw/users-guide.de.html`, `raw/faq.en.html`, `raw/faq.de.html`, `raw/history.en.html`, `raw/history.de.html`, `raw/history2.html`, `raw/tips.en.html`, `raw/tips.de.html`, `raw/online.en.html`, `raw/online.de.html`, `raw/online-manager.html`, `raw/plugins.html`, `raw/free-3d-models.html`, `raw/import-models.html`, `raw/import-textures.html`, `raw/gallery.html`
- `raw/SweetHome3DShortcuts.pdf` → `txt/shortcuts.txt`
- `txt/*.txt` — text extractions of the above
- `raw/jsapp.html` (server shell), `raw/jsapp-rendered.html` (headless-Chrome DOM), `raw/jsapp.headers`
- `js/SweetHome3D.js`, `js/sweethome3d.min.js`, `js/core.min.js`, `js/geom.min.js`, `js/graphics2d.min.js`, `js/swingundo.min.js`
- `raw/localization.json` (7.5.2 UI strings), `raw/localization_de.json`, `raw/localization_en_US.json`, `raw/SweetHome3D.json` (404)
- `raw/DefaultFurnitureCatalog.json`, `raw/DefaultTexturesCatalog.json`
- `raw/SweetHome3DUpdates.xml`, `raw/sf-rss.xml`, `raw/sourceforge-files.html`, `raw/sf761b.html`, `raw/page-sitemap.xml`, `raw/post-sitemap.xml`, `raw/post-sitemap2.xml`
- `shots/online-app.png` (captured, not visually analysed by this model)
- `scenario-boot.json`, `scenario-app.json`, `out-boot.json`, `out-app.json`, `out-app.err`
