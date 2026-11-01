# Sweet Home 3D — furniture handling (catalog, import wizard, SH3F, sizing, list table, grouping, magnetism)

**Job:** `rea-sweethome3d-2026-10/05-05-furniture-catalog-import`
**App under study:** Sweet Home 3D — open-source Java desktop app, plus "Sweet Home 3D JS Online" v7.5.2 (web build).
**Homepage (German):** https://www.sweethome3d.com/de/ — the online JS app lives at https://www.sweethome3d.com/SweetHome3DJSOnline.jsp
**Licence:** Sweet Home 3D is GPL. **No source code was copied.** Everything below is behaviour, data shape and UX pattern described in my own words, with the observation evidence kept in this folder.
**Legend:** `OBSERVED` = seen in a file in this folder or in a live capture saved here · `DOCUMENTED` = stated by vendor docs/javadoc at the cited URL · `INFERRED` = my reasoning over the evidence.
Full source list: `sources.json`.

---

## 1. Summary

- Sweet Home 3D ships a **two-tier furniture catalog**: a large desktop/online library of **805 pieces in 13 categories** (`FurnitureCatalog.json`, 679 KB) and a trimmed **94-piece / 8-category** catalog (`DefaultFurnitureCatalog.json`) served to touch/small-screen clients; both use the *same* flat `prefix#index` resource-bundle encoding as the on-disk catalogue format [OBSERVED, `catalog_FurnitureCatalog.json`, `catalog_DefaultFurnitureCatalog.json`, `SweetHome3DJSOnline.html`].
- Each catalog piece is a **rich record**: id, name, description, tags, category, creator, license, creation date, icon + planIcon (+ SHA-1 digests), 3D model URL (+ digest, byte size), width/depth/height in **centimetres**, default elevation, `movable`, `doorOrWindow`, `dropOnTopElevation`, `modelRotation` 3×3 matrix, plus specialised fields for sashes, light sources, shelf boxes and staircase cut-out shapes [OBSERVED, `catalog_analysis2.txt`; DOCUMENTED, javadoc `DefaultFurnitureCatalog.PropertyKey`].
- The **import wizard** is a 4-step state machine (model → orientation → attributes → icon) covering **OBJ, DAE/Collada, 3DS, ZIP-of-those and KMZ**; the shipped JS build contains `OBJLoader("obj")`, `DAELoader("dae")` and `Max3DSLoader("3ds")` with a `ModelLoader` base class that also reads models out of ZIP entries (`archive.zip!/name.obj`) and `jar:` URLs [OBSERVED, `bundle_wizard_states.txt`, `js/sweethome3d.min.js`; DOCUMENTED, `docs/userguide.txt`, `docs/import-models.txt`].
- **SH3F** is the distributable furniture-library container: one catalog resource family plus referenced icon/model content, installed by double-click or *Furniture → Import furniture library*, and authored with the separate **Furniture Library Editor**; the JS `DefaultFurnitureCatalog(pluginFurnitureCatalogUrls, furnitureResourcesUrlBase)` constructor reads exactly such external families, and content URLs are built as `resourcesUrlBase + value` with `jar:` prefixing and `LICENSE.TXT` filtering [DOCUMENTED, `docs/userguide.txt`, `docs/import-models.txt`; OBSERVED, `bundle_library.txt` (no match for the literal "sh3f" in the web build), `bundle_loadbundles.txt`; INFERRED for the exact archive layout].
- Furniture is manipulated through a **single editable list/table** (`FurnitureTablePanel` on a `JSTreeTable`): ~23 built-in columns (CATALOG_ID, NAME, DESCRIPTION, WIDTH, DEPTH, HEIGHT, X, Y, ELEVATION, ANGLE, LEVEL, MOVABLE, DOOR_OR_WINDOW, COLOR, TEXTURE, VISIBLE, CREATOR, LICENSE, MODEL_SIZE, PRICE, VAT, VAT-INCLUDED…) that can be shown/hidden, sorted, and that **persist per home file** together with expanded group rows [OBSERVED, `bundle_furniture_table.txt`, `bundle_tablemodel.txt`, `bundle_jstreetable.txt`].
- **Grouping** is a first-class nested model (`HomeFurnitureGroup` holding child furniture), with group/ungroup undoable edits, an auto-named "group N" default, alignment (top/bottom/left/right/front/back/left-side/right-side), distribution and side-by-side tools; **magnetism** is a soft, rule-based assist — snap onto a wall, rotate the back face to the wall, drop objects on top of others, tuck objects beside others and inside shelf boxes — and **there is no hard collision enforcement**: overlapping furniture is allowed [OBSERVED, `bundle_groupmodel.txt`, `bundle_grouping.txt`, `bundle_magnetism.txt`, `bundle_elevation.txt`; DOCUMENTED, `docs/userguide.txt`; INFERRED for the "no collision" conclusion].

---

## 2. Findings

### 2.1 Default catalog structure

**Two shipped catalogs, one format.** [OBSERVED]
`SweetHome3DJSOnline.html` decides at load time which catalog the JS app reads:

```
if (coarse pointer && small viewport) applicationParams.furnitureCatalogURLs = ["/libjs/resources/DefaultFurnitureCatalog.json"];
else                                 applicationParams.furnitureCatalogURLs = ["/libjs/resources/FurnitureCatalog.json"];
applicationParams.furnitureResourcesURLBase = "/models/";
applicationParams.texturesCatalogURLs = ["/libjs/resources/TexturesCatalog.json"];
applicationParams.texturesResourcesURLBase = "/textures/";
```
Evidence: `SweetHome3DJSOnline.html`; notes in `sources.json` S1.

Downloaded and analysed:

| file | bytes | flat keys | entries | unique pieces | categories |
|---|---|---|---|---|---|
| `FurnitureCatalog.json` (desktop/online) | 679,206 | 16,490 | 1,740 | **805** | **13** |
| `DefaultFurnitureCatalog.json` (touch/small) | 127,949 | 3,433 | — | **94** | **8** |
| `TexturesCatalog.json` | 113,982 | — | — | — | — |

Evidence: `catalog_analysis.txt`, `catalog_analysis2.txt`, `catalog_mobile.txt`.

**Encoding.** [OBSERVED] The catalog is a *flat* JSON object whose keys are `property#index` (e.g. `id#1`, `name#1`, `category#1`, `width#1` …), with an index counter starting at 1 and running to 1,740 in the full catalog. A piece is the set of keys sharing one index. There is also a free-standing `Copyright` key: `Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>. All Rights Reserved.` The corresponding on-disk/desktop form is a localized `.properties` resource family, as the javadoc states: *"Furniture default catalog read from resources localized in .properties files"* [DOCUMENTED, `docs/jd_DefaultFurnitureCatalog.html`, S10].

**`ignored#N=true`.** [OBSERVED] 935 indices carry nothing but `{"ignored":"true"}` (e.g. indices 54, 56–60, …, directly after the light-source entries). The reader loop in `js/sweethome3d.min.js` treats a truthy `ignored#N` as "read only the content keys (icon/planIcon/model) for this index, create no piece". This is the mechanism behind multi-part models: 667 of 805 pieces carry `multiPartModel=true`, meaning their model file contains several parts that can be given individual materials/colours. [OBSERVED for the flag counts; INFERRED for the exact "part" semantics.]

**Category inventory (full catalog, unique pieces).** [OBSERVED, `catalog_analysis2.txt`]

| category | pieces | | category | pieces |
|---|---:|---|---|---:|
| Living room | 132 | | Bathroom | 50 |
| Miscellaneous | 130 | | Characters | 35 |
| Kitchen | 125 | | Lights | 32 |
| Exterior | 85 | | Office | 31 |
| Bedroom | 69 | | Vehicles | 27 |
| Doors and windows | 69 | | Staircases | 20 |

Mobile catalog subset: Living room 25, Doors and windows 21, Bedroom 11, Kitchen 10, Miscellaneous 10, Lights 8, Bathroom 6, Staircases 3 [OBSERVED, `catalog_mobile.txt`].

**Tags.** [OBSERVED, `catalog_analysis2.txt`] 801/805 pieces have a `tags` list (comma-separated). Top tags: `Blend Swap` 156, `Adjustable` 95, `Default` 94, `Outdoor` 81, `OKH` 63, `Appliance` 62, `Seat` 56, `Decoration` 56, `Garden` 48, `SCPTS` 42, `SNPS` 42, `Human`/`People` 30 each, `Cupboard` 28 … Tags are used by the catalog search (see 2.5).

**Per-piece field completeness (805 unique pieces).** [OBSERVED, `catalog_analysis2.txt`]

| field | count | mandatory? |
|---|---:|---|
| `id`, `name`, `category`, `icon`, `iconDigest`, `model`, `modelDigest`, `modelSize`, `width`, `depth`, `height`, `movable`, `doorOrWindow`, `creator`, `license` | 805 each | `id`/`iconDigest`/`modelDigest`/`modelSize`/`creator`/`license` are optional in the format but always present in this catalog |
| `tags` | 801 | optional |
| `creationDate` | 711 | optional |
| `multiPartModel` | 667 | optional |
| `dropOnTopElevation` | 440 | optional |
| `elevation` | 153 | optional |
| `doorOrWindowCutOutShape` | 60 | optional |
| `doorOrWindowWallThickness` | 45 | optional |
| `modelRotation` | 42 | optional |
| `doorOrWindowSash*` (5 keys) | 41 each | conditional |
| `shelfElevations` | 38 | optional |
| `lightSource*` (5 keys) | 31 each | conditional |
| `doorOrWindowWallDistance` | 20 | optional |
| `staircaseCutOutShape` | 20 | optional |
| `modelPresetTransformationsName_/_{1..13}` | 5–6 each | optional (e.g. mannequin poses) |
| `shelfBoxes` | 3 | optional |
| `planIcon`, `planIconDigest`, `deformable`, `texturable`, `horizontallyRotatable` | 2 each | optional |
| `doorOrWindowWallCutOutOnBothSides`, `lightSourceMaterialName` | 1 each | optional |
| `tage` (typo variant of `tags`) | 1 | data-quality note |

The javadoc explicitly marks **name, category, width, depth, height, movable, doorOrWindow, icon, model as mandatory**, and everything else optional with documented defaults (`resizable`/`deformable`/`texturable`/`horizontallyRotatable` default `true`; `doorOrWindowWallCutOutOnBothSides` default `true`; `doorOrWindowWidthDepthDeformable` default `true`) [DOCUMENTED, S8].

**Representative records.** [OBSERVED, `catalog_rawpattern.txt`]

```json
// ordinary piece
{"id":"eTeks#bed140x190","name":"Bed 140x190","tags":"Default, Double","category":"Bedroom",
 "icon":"bed140x190.png","iconDigest":"hABtlEaA5Sf/…","model":"bed140x190.zip!/bed140x190.obj",
 "modelDigest":"PYs+yIT+…","modelSize":"11821","width":"158","depth":"208","height":"70",
 "dropOnTopElevation":"48","movable":"true","doorOrWindow":"false","creator":"eTeks",
 "license":"GNU GPL / CC-BY or CC-BY"}

// door/window: fixed to wall, sits at 87 cm, cuts a hole in the wall
{"id":"eTeks#window85x123","name":"Small window","category":"Doors and windows",
 "width":"91","depth":"34","height":"134","elevation":"87","movable":"false","doorOrWindow":"true",
 "doorOrWindowCutOutShape":"M0,0 v1 h1 v-1 z","doorOrWindowWallThickness":"25",
 "doorOrWindowSashXAxis":"2","doorOrWindowSashYAxis":"25","doorOrWindowSashWidth":"86",
 "doorOrWindowSashStartAngle":"0","doorOrWindowSashEndAngle":"-90","dropOnTopElevation":"-1"}

// light: point light embedded in the model, unit-less multipliers
{"id":"eTeks#lightSource","name":"White light source","category":"Lights","elevation":"220",
 "movable":"true","deformable":"false","texturable":"false","horizontallyRotatable":"false",
 "lightSourceX":"5","lightSourceY":"5","lightSourceZ":"5","lightSourceColor":"#BBBBBB","lightSourceDiameter":"10",
 "planIcon":"lightSourcePlanIcon.png"}

// shelf unit and staircase
{"id":"eTeks#bedsideTable", … "shelfElevations":"11.2 38 50"}
{"id":"…filledBookcase", … "shelfBoxes":"2.3 1.4 5.4 53.2 33.8 33.5  21.8 1.4 34.8 …"}   // groups of 6
{"id":"…spiralStaircase","staircaseCutOutShape":"M0.71077,0.94769 L0.5,0.5 h0.5 A0.5,0.5 0 1,0 0.71077,0.94769 z"}

// 3×3 model orientation matrix, 9 floats
{"id":"eTeks#fittedBath", … "modelRotation":"0 0 -1 0 1 0 1 0 0"}

// mannequin with named armature presets
{"id":"…mannequin","modelPresetTransformationsName_1":"Standing",
 "modelPresetTransformations_1":"sweethome3d_mannequin_left_hip 1 0 0 0 …"}
```

**Normalised numeric conventions.** [OBSERVED in `js/sweethome3d.min.js`; verified against the JSON values]
- `width`/`depth`/`height`/`elevation`/`dropOnTopElevation` are centimetres.
- `dropOnTopElevation` is stored as a height relative to the piece and is read as `value / height` into the model; the default when absent is the piece height (i.e. "stack on the top face").
- Sash X/Y/width values are divided by width/depth; sash angles are strings in degrees and converted to radians.
- Light source X/Y/Z and diameter are divided by width/depth/height; `lightSourceColor` is either `#RRGGBB` or a decimal integer.
- `shelfElevations` values are divided by height; `shelfBoxes` are groups of six floats `xLower yLower zLower xUpper yUpper zUpper` divided by width/depth/height.
- `staircaseCutOutShape` / `doorOrWindowCutOutShape` are SVG path mini-syntax in a **0..1 normalised** box (`M0,0 v1 h1 v-1 z` = the full rectangle). The same syntax is used to cut wall openings and to cut upper levels under a staircase.

**Model/icon content addressing.** [OBSERVED] Model and icon values are relative names resolved against `furnitureResourcesUrlBase` (`/models/` online). The special `archive.zip!/inner.obj` syntax selects an entry inside a ZIP; a leading `jar:` is added when a value contains `!/` but does not already start with `jar:`. SHA-1 digests (`iconDigest`, `modelDigest`, `planIconDigest`) are base64 strings used by `ContentDigestManager` for change detection/caching. `modelSize` is the model byte count (804 distinct values).

**Desktop vs web differences.** [DOCUMENTED] The online version has no menu bar; all desktop menu items are reachable from the toolbar/context menus **except 3D-model importation, photo and video creation** (`docs/userguide.txt`). That matches the JS bundle, which contains the *parser/loader* classes and the wizard controller but is driven from the web UI. [OBSERVED, `classes.txt`: `ImportedFurnitureWizardController`, `OBJLoader`, `DAELoader`, `Max3DSLoader` are all present.]

### 2.2 Categories and the catalog pane UI

[OBSERVED, `bundle_catalogview.txt`, `bundle_catalogtree.txt`, `furniture_panes_html.txt`]
- The pane is `#catalog-furniture-pane` → `#furniture-catalog` → `#furniture-catalog-list` (the piece list) and a sibling `#furniture-view`. A splitter (`#catalog-furniture-splitter`) separates the catalog from the home-furniture list. `#plan-3D-view-pane` holds `#home-plan` and `#home-3D-view`. Layout evidence: `furniture_panes_html.txt`.
- `FurnitureCatalogListPanel` injects a filter strip into the list: a `<select id="furniture-category-select">` whose first option is the localized "no category" (i.e. *all categories*), followed by one option per `catalog.getCategories()` name; plus `<input id="furniture-search-field">` with search placeholder text.
- Search implementation (own words): the query is accent-normalised, regex metacharacters are replaced by spaces, and the first token must match while remaining tokens filter the concatenated string `name | category | tags join | creator`. So searching is effectively an AND over tokens across name, category, tags and creator, accent-insensitive.
- Filtering is done by toggling `style.display` on the DOM nodes that carry a `piece` reference; category header/separator rows get class names `furniture-category-label` / `furniture-category-separator` and are re-shown when more than one category is in view.
- Each piece can show a `.furniture-tooltip` popup (absolute-positioned, appended to `document.body`).
- A user preference switches the catalog between **tree** and **list** views (`UserPreferencesPanel.treeRadioButton` / `listRadioButton`, property `FURNITURE_CATALOG_VIEWED_IN_TREE`). Only `FurnitureCatalogListPanel` could be found in the web bundle, so [INFERRED] the web build may render both preferences through the same flat list; the desktop build has a genuine category tree (guide: "You can display the furniture of a category by clicking on the triangle beside its name") [DOCUMENTED, `docs/userguide.txt`].
- Related catalog preferences: furniture icon mode (**catalog icon thumbnail** vs **top view render**), icon size, and language/unit/currency/VAT settings.

### 2.3 The furniture import wizard

**Steps.** [OBSERVED, `bundle_wizard_states.txt`] The JS controller instantiates exactly four step states, entered in this order:

1. `FurnitureModelStepState` — choose the model file.
2. `FurnitureOrientationStepState` — orient the model so its front face is the front view (user guide: use the arrow buttons).
3. `FurnitureAttributesStepState` — name, size, elevation, colour, and whether the piece is movable / a door / a window / a staircase.
4. `FurnitureIconStepState` — turn the model with the mouse to choose the viewpoint baked into the catalog/list/plan icon, then **Finish**.

The same controller edits an existing catalog piece (`modifyFurnitureWizard.title` vs `importFurnitureWizard.title`); `FurnitureCatalogController.modifySelectedFurniture()` opens it for a selected **modifiable** catalog item, and `importFurniture(String)` opens it for a dropped/dragged file. The top-level title strings are `importFurnitureWizard.title` / `modifyFurnitureWizard.title` [OBSERVED]. After finishing, the new piece appears in the catalog and/or the plan and/or the list, depending on the chosen options [DOCUMENTED].

**Wizard-editable properties.** [OBSERVED, `bundle_wizard2.txt`, `bundle_wizard_controller.txt`] Controller accessors include `setModel`, `setModelSize`, `setModelRotation`, `setBackFaceShown`, `isEdgeColorMaterialHidden`/`setEdgeColorMaterialHidden`, `setName`, `setCreator`, `setWidth`/`setDepth`/`setHeight` (each with a `$float$boolean` overload that keeps proportions, matching the "keep proportions" checkbox), `setElevation`, `setMovable`, `setDoorOrWindow`, `setStaircaseCutOutShape`, and a `category` field.

**Supported formats.** [DOCUMENTED, `docs/userguide.txt`: *"Sweet Home 3D supports 3D model files at OBJ, DAE, 3DS format, ZIP files containing a file of this type, and KMZ files."*; DOCUMENTED, `docs/import-models.txt`] The site additionally recommends OBJ / DAE(Collada) / KMZ / 3DS exporters and notes that SKP must be converted to DAE in SketchUp. If a ZIP refuses to import, the site advises unzipping first. [OBSERVED, `js/sweethome3d.min.js`] Loader classes: `OBJLoader` (`modelExtension="obj"`, with a built-in default MTL material parser), `DAELoader` ("dae"), `Max3DSLoader` ("3ds"); `ModelLoader` picks the ZIP entry whose name matches `.<extension>$` and reports `"Empty file"` when nothing matches. [INFERRED] KMZ is handled by the same ZIP-entry mechanism (KMZ is a ZIP), so the loader looks for a model entry inside it.

**Drag & drop.** Under Windows/macOS a model file dropped on a Sweet Home 3D window launches the wizard; `dropFiles` / `FurnitureController.dropFiles` imports each dropped file and then places the added pieces at the drop point [DOCUMENTED for the gesture, OBSERVED for the `dropFiles` implementation].

**Sample model archive.** [OBSERVED, `model_armchair1.zip`] `armchair1.zip` contains `armchair1.obj`, `armchair1.mtl` and a licence HTML file — i.e. the distributed models are self-contained ZIPs with an OBJ + MTL + attribution, which is exactly what the `archive.zip!/inner.obj` catalog syntax points at.

### 2.4 SH3F furniture library format

[DOCUMENTED, `docs/userguide.txt`, `docs/import-models.txt`]
- *"The models proposed at the free 3D models page may also be imported by group of models stored in a SH3F file."*
- Install: double-click the `.sh3f`, or **Furniture → Import furniture library**. Uninstall: remove it from the *furniture plugin folder* and restart.
- Libraries are listed in the **"Libraries in use" pane**, reachable from the **Libraries…** button in the About dialog; clicking a listed SH3F reveals its folder, which also reveals the plugin folder path.
- The downloadable bundles are ZIPs that themselves contain a SH3F (`3DModels-Contributions-1.9.3.zip` 511 models, `3DModels-Scopia-1.9.3.zip` 500 models, `3DModels-BlendSwap-CC-0-1.9.3.zip` 175 public-domain models, `3DModels-Trees-1.9.3.zip` 10 models, etc.), each with a stated licence.
- Authoring: the separate **Furniture Library Editor** (SourceForge download) creates SH3F files.

[OBSERVED, `bundle_library.txt` + `bundle_loadbundles.txt`, `docs/jd_DefaultFurnitureCatalog.html`] The literal token `sh3f` does **not** appear anywhere in the web bundle; library handling therefore lives in the desktop `io`/`view` layers. But the reader is fully parameterised for external libraries: `DefaultFurnitureCatalog(pluginFurnitureCatalogUrls, furnitureResourcesUrlBase)` loads `loadResourceBundles(urlWithout.jsonExtension)` and resolves each content value as `resourcesUrlBase + value`, skipping `LICENSE.TXT`. The constructors `DefaultFurnitureCatalog(File furniturePluginFolder)`, `(File[] furniturePluginFolders)` and the constant `PLUGIN_FURNITURE_CATALOG_FAMILY` — *"The name of .properties family files in plugin furniture catalog files"* — are documented in the javadoc [DOCUMENTED, S8/S10].

[INFERRED, high confidence] Therefore an SH3F contains (a) one catalog resource family (`<Family>.properties` / localized variants, same `prefix#index` keys as §2.1), (b) the referenced icon / planIcon / model payloads, and (c) an optional `LICENSE.TXT`. It is effectively "a catalog fragment plus its assets", and it is installed simply by placing the file in the plugin folder. I could not download an SH3F in this session to verify the container directly (SourceForge direct downloads returned HTTP 403) — see §4.

### 2.5 Sizing, elevation, rotation

**On-plan editing (mouse).** [DOCUMENTED, `docs/userguide.txt`] A selected piece shows four corner indicators: a **rotation** indicator (drag to rotate; Alt toggles the 15° rotation magnetism), an **elevation** indicator (drag to change elevation from the floor), a **height** indicator, and a **size** indicator (drag to change width and depth). Doors/windows dropped on a wall are automatically oriented and resized to the wall's orientation and thickness when magnetism is on.

**Modify dialog.** [OBSERVED, `wizard_html.txt` / `furniture_panes_html.txt`; DOCUMENTED, `docs/userguide.txt`] `#home-furniture-dialog-template` contains named fields that map 1:1 to the model:
- name + "name visible" checkbox, description, price + VAT %, 
- **location**: X, Y, elevation, "mirrored model" checkbox, "base plan item" checkbox,
- **colour & texture**: default colour/texture | colour | texture | **model materials** (per-material editing on multi-part models), 
- **orientation**: vertical rotation (angle), horizontal rotation (pitch or roll with a radio choice), and a furniture orientation preview image,
- **size**: width, depth, height + "keep proportions" checkbox + a **"model transformations"** button (applies the catalog's `modelPresetTransformations`, e.g. mannequin poses),
- **shininess**: default | matt | shiny,
- **visible** checkbox.

Invisible furniture is not drawn in the plan or 3D view but **stays in the furniture list** so it can be made visible again [DOCUMENTED].

**Underlying model.** [DOCUMENTED, S9] `HomePieceOfFurniture` exposes `getWidth/getDepth/getHeight`, `getElevation` (bottom of the piece on its level), `getGroundElevation` (after the level's elevation), `getHeightInPlan`/`getDepthInPlan` (after pitch/roll), `getAngle` (radians around the vertical axis), `getPitch`, `getRoll`, `getDropOnTopElevation`, `getModelRotation` (3×3), `getModelTransformations`, `getModelFlags`, `getModelMaterials`, `getPoints` (the plan footprint corners), `containsPoint(x,y,margin)`, `getPriceValueAddedTaxIncluded`, `getLevel`, `getShininess`, `getNameAngle`/`getNameXOffset`/`getNameYOffset`/`getNameStyle`, and static `getFurnitureComparator(SortableProperty)`. `CatalogPieceOfFurniture` is the immutable catalog counterpart (subclasses `CatalogDoorOrWindow`, `CatalogLight`, `CatalogShelfUnit`) carrying `resizable`, `deformable`, `texturable`, `horizontallyRotatable`, `modifiable` and `isWidthDepthDeformable()` [OBSERVED, `classes.txt`, `bundle_jstreetable.txt`].

**Units and rounding.** [OBSERVED, `bundle_magnetizedlen.txt`] `LengthUnit` provides `getMagnetizedLength(value, tolerance)`; for metric units the helper doubles the tolerance and picks a rounding step of 0.1 / 0.5 / 1 / 5 / 10 / 100 cm depending on it, then rounds to that step (returning the original value if the rounded result would be 0 for a positive input). Metric step size is 0.5; maximum length 100000 units; maximum elevation = maxLength/10. Inch units round to 1/8, 1/4, 0.5, 1, 3 or 6 inch.

**Modify-attribute clamping.** [OBSERVED] `HomeFurnitureController.adjustFurnitureSizeAndElevation` re-rounds width, depth and height via `getMagnetizedLength(..., 0.1)` and elevation likewise for resizable, non-group pieces when magnetism is enabled; a door's depth is left alone when it is width/depth-deformable-sensitive.

### 2.6 The furniture list table

[OBSERVED, `bundle_furniture_table.txt`, `bundle_tablemodel.txt`, `bundle_jstreetable.txt`, `bundle_sortable.txt`]
- Implemented by `FurnitureTablePanel`, hosted in `#furniture-view`, which is a `JSTreeTable` — a DOM `<div class="tree-table">` with header/body rows, not a native `<table>`. (The DOM probe found the furniture view empty until a home is opened; the only real `<table>` in the page at load time is the demo-home chooser [OBSERVED, `dom_catalog.json`].)
- The full column catalogue defined by `createTableModel` is:

  `CATALOG_ID, NAME, DESCRIPTION, WIDTH, DEPTH, HEIGHT, MOVABLE, DOOR_OR_WINDOW, COLOR, TEXTURE, VISIBLE, X, Y, ELEVATION, ANGLE, MODEL_SIZE, CREATOR, LICENSE, PRICE, VALUE_ADDED_TAX, VALUE_ADDED_TAX_PERCENTAGE, PRICE_VALUE_ADDED_TAX_INCLUDED, LEVEL`

  each with a localized label from the `FurnitureTable` resource family and an optional `defaultWidth`. Extra per-home catalogue properties are appended dynamically.
- The default **visible** set, in order, is: `CATALOG_ID, NAME, DESCRIPTION, CREATOR, LICENSE, WIDTH, DEPTH, HEIGHT, X, Y, ELEVATION, ANGLE, LEVEL, MODEL_SIZE, COLOR, TEXTURE, MOVABLE, DOOR_OR_WINDOW, VISIBLE, PRICE, VALUE_ADDED_TAX_PERCENTAGE, VALUE_ADDED_TAX, PRICE_VALUE_ADDED_TAX_INCLUDED` (from `toggleFurnitureVisibleProperty`). Hiding a column removes it; the code re-inserts a new column at the position implied by that canonical order, falling back to the first column when nothing matches, and never lets the visible set become empty (it pushes `NAME`).
- **Sorting** is done by clicking a column title: `toggleFurnitureSort(property)` toggles ascending / descending / off; the state is stored **on the home** (`FURNITURE_SORTED_PROPERTY`, `FURNITURE_DESCENDING_SORTED`) so it is part of the saved file. Names are sorted through `HomePieceOfFurniture.getFurnitureComparator(SortableProperty)`.
- **Visible properties** are likewise stored on the home (`FURNITURE_VISIBLE_PROPERTIES`), so each home remembers its own table layout.
- **Expanded group rows** are persisted in a home property named `com.eteks.sweethome3d.SweetHome3D.ExpandedGroups` (`FurnitureTablePanel.EXPANDED_ROWS_VISUAL_PROPERTY`), only for home format version ≥ 5000.
- Selection is synchronised both ways: `home.addSelectionListener` pushes the selection into the table (`setSelectedRowsByValue`) and selecting a row selects the object in the plan/3D view; the table also expands the group containing a selected row and scrolls it into view.
- The table re-renders a single cell when a property changes (`updatePieceOfFurnitureData`) and rebuilds on sort/visible-property/furniture-collection/level changes. Listeners are attached recursively to every piece of every `HomeFurnitureGroup`.
- The guide states the same in prose: the list "contains the furniture of your home, where their name, size and other characteristics may be displayed. It may be sorted by clicking on each column title." [DOCUMENTED, `docs/userguide.txt`].

### 2.7 Grouping

[OBSERVED, `bundle_groupmodel.txt`, `bundle_grouping.txt`; DOCUMENTED, `docs/userguide.txt`]
- A group is a real model object, `HomeFurnitureGroup`, that *is* a `HomePieceOfFurniture` and holds `furniture[]` of child pieces (which may themselves be groups — `getFurnitureGroupCount` recurses, so nesting is supported). Construction copies the first child's position/angle, sets `catalogId/description/information/creator/icon/planIcon/model` to null, clears name visibility/offset/angle/style, sets `movable = AND(children.movable)`, `visible = OR(children.visible)`, and recomputes its location and size from the children (`updateLocationAndSize`). Groups declare `resizable/deformable/texturable = true` while keeping the parent `dropOnTopElevation` at 0.
- Creation names the group with a localized default `groupName` plus a running count: `createHomeFurnitureGroup` builds `new HomeFurnitureGroup(pieces, anchor, "Group " + (groupCount + 1))`.
- Operations are `FurnitureGroupingUndoableEdit` / `FurnitureUngroupingUndoableEdit`; `doGroupFurniture` = delete selected + add the group, `doUngroupFurniture` = delete group + re-add its children with their original per-level positions. Ungrouping recomputes each child's level and index so ordering/stacking is restored.
- **Alignment / distribution tools** are exposed as undoable edits on `FurnitureController`: alignment on top, bottom, left, right, front side, back side, left side, right side, plus "side by side" alignment, a distribution edit, and a "same elevation/size" style of bulk adjustment (`FurnitureDistributionUndoableEdit`, `FurnitureElevationResetUndoableEdit`, `FurnitureAlignmentUndoableEdit`). On the web page `HomeFurnitureGroup` is also used by the demo loader to rename groups to the localized default group name [OBSERVED, `SweetHome3DJSOnline.html`].
- A pasted selection can be pasted **into a selected group** (`pasteToGroup` → `addFurnitureToGroup`) [OBSERVED].

### 2.8 Magnetism and "collision" behaviour

**Preference and toggles.** [OBSERVED, `bundle_magnetism.txt`; DOCUMENTED, `docs/userguide.txt`] `UserPreferences.isMagnetismEnabled()` drives everything, is surfaced in the preferences dialog (`UserPreferencesPanel.magnetismCheckBox`), and can be toggled temporarily during a drag (the plan controller carries a per-mouse-press `magnetismToggled` flag; Alt toggles the 15° rotation magnetism, and walls snap to 15° multiples by default). Menu action ids `ENABLE_MAGNETISM` (104) / `DISABLE_MAGNETISM` (105) exist.

**The magnetise entry point.** When a single piece is dropped or dragged, `HomeFurnitureController` calls `PlanController.adjustMagnetizedPieceOfFurniture(piece, x, y)`, which applies up to four rules in order [OBSERVED, `bundle_magnetism.txt`]:

1. **Drop-on-top (elevation).** `adjustPieceOfFurnitureElevation(piece, false, ∞)` — for a piece whose default elevation is 0 (and which is not a door/window), find the highest surrounding piece under it and set the elevation to that piece's `dropOnTopElevation` position (or the next free shelf elevation / shelf-box lower Z of a `HomeShelfUnit`). The documented rule: *"a piece dropped on a larger one will be elevated to appear on the top of the latter, if its default elevation is at floor level."*
2. **Wall.** `adjustPieceOfFurnitureOnWallAt(piece, x, y, true)` — find the reference wall under the point (widened by a pixel margin converted to model units) and rotate the piece so its **back face lies along the wall**, taking the wall's arc extent into account.
3. **Side-by-side.** `adjustPieceOfFurnitureSideBySideAt(piece, alignAngle, ref)` — intersect the piece footprint with the footprint (or wall-offset band) of every overlapping candidate and tuck it flush beside the neighbour whose shared edge area is largest, optionally copying the neighbour's angle. Door/window candidates are treated as thin wall bands.
4. **Inside a shelf box.** `adjustPieceOfFurnitureInShelfBox(piece, alignAngle)` — if the piece's ground elevation matches a `shelfBoxes` lower Z of a nearby shelf unit, snap the piece into that box (again optionally copying the angle).

**Geometry and tolerances.** `PlanController.PIXEL_MARGIN = 4`, `INDICATOR_PIXEL_MARGIN = 5`, `WALL_ENDS_PIXEL_MARGIN = 2`; `getSelectionMargin()` returns `PIXEL_MARGIN / scale`, doubled for touch pointers. Wall/room snapping inside a drag uses the same idea: `updateMagnetizedPoint` compares squared distances to wall and room paths and accepts the snap when it is within `selectionMargin²` [OBSERVED].

**No hard collision.** [OBSERVED + INFERRED] None of the four rules prevents overlap: the side-by-side rule only *nudges* a piece flush when it already intersects a neighbour, and nothing rejects a placement. There is no fit/occupancy check anywhere in the plan controller's magnetise path, and overlapping pieces are simply drawn on top of each other. By contrast a door/window *does* cause a real geometric cut: `doorOrWindowCutOutShape` is subtracted from the wall (with `doorOrWindowWallThickness` / `doorOrWindowWallDistance`), and a room created by double-clicking inside walls automatically **includes the half doorstep of each door** placed on its walls so that adjacent rooms join correctly when doors are open [DOCUMENTED, `docs/userguide.txt`]. `staircaseCutOutShape` similarly cuts the upper level's floor under a staircase.

### 2.9 Language / loading plumbing (relevant to the data model)

[OBSERVED, `bundle_loadbundles.txt`] The catalog is loaded through `CoreTools.loadResourceBundles(base, locale)`, which reads an **array** of JSON documents in priority order: `<base>_<locale>.json`, optionally `<base>_<language>.json`, then `<base>.json`; `getStringFromKey` walks the array and returns the first bundle that has the key, applying `format` arguments. `UserPreferences.getResourceBundles("DefaultFurnitureCatalog")` defaults the base to `resources/DefaultFurnitureCatalog` and locally caches the bundles. `removeAccents` is used for search. This is the same lookup contract a plugin/SH3F family must satisfy.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each ties back to a finding in §2. "Palette" below means CasaPlazAI's current small set (bed, sofa, table, chair, counter, bathtub, toilet).

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Catalog search box + category filter chips/dropdown over the furniture palette** — accent-insensitive, multi-token AND across name, category, tags and maker, with an "All" default. Even with a 7-item palette this pays off the moment the palette grows, and it is the single cheapest item that scales. | §2.5 `FurnitureCatalogListPanel` category `<select>` + `#furniture-search-field`; §2.1 tags | High | Low |
| 2 | **Per-plan furniture-list layout that autosaves** — let the user show/hide columns and sort, and persist the choice in the plan's localStorage document (CasaPlazAI already autosaves the plan). Store `sortProperty`, `sortDescending`, `visibleColumns`, `expandedGroups`. | §2.6 `FURNITURE_VISIBLE_PROPERTIES` / `FURNITURE_SORTED_PROPERTY` / `ExpandedGroups` stored on the home | High | Low |
| 3 | **A "drop-on-top elevation" rule instead of only hard collision** — when a piece with default floor elevation is dropped over a taller piece, place it on that piece's top face (configurable top offset per catalogue item). This is the behaviour users expect and is a cheap way to make stacking/placing-on-counter feel smart. | §2.8 rule 1; §2.1 `dropOnTopElevation` | High | Low–Med |
| 4 | **Per-item "fits under / fits over" metadata + warning mode** — Sweet Home 3D ships no collision enforcement at all, so CasaPlazAI's fit/collision constraints are already a differentiator. Add a toggle: *block* (current) vs *warn and allow* (Sweet Home 3D-like freedom), and drive it from a per-piece footprint + `dropOnTopElevation` field. | §2.8 "no hard collision" + CasaPlazAI's existing collision constraints | High | Med |
| 5 | **Furniture grouping (nested) with a default group name** — group/ungroup selected pieces as a first-class, nested, undoable object whose bounding box derives from its children, and make the group a single list row that can be expanded/collapsed. Then add the alignment/distribution commands (align top/bottom/left/right, distribute evenly) as small extras on top. | §2.7 `HomeFurnitureGroup`, group naming, `FurnitureAlignment/Distribution` edits | High | Med |
| 6 | **A catalog import/export bundle format for CasaPlazAI** — mirror SH3F's idea: one `catalog.json` fragment plus referenced model/icon assets in a ZIP, resolvable against a resource base URL, installed by drag-and-drop. Gives third parties a way to contribute furniture without touching the app. | §2.4 SH3F = catalog family + assets; §2.1 `prefix#index` encoding | Med–High | Med |
| 7 | **Import wizard with an explicit "orientation" step and a "keep proportions" lock** — model file → orient the front face using arrows → attributes (name, width/depth/height, elevation, colour, is it a door/window) → choose the icon viewpoint. The explicit orientation step is the part most tools forget and it is what makes a catalog look consistent. | §2.3 four step states; §2.5 `setWidth$float$boolean` keep-proportions | Med–High | Med |
| 8 | **Magnetism assist set: wall-snap + back-face-to-wall, 15° rotation snap, side-by-side flush, shelf insertion** — implement as a `magnetize(piece, x, y)` resolver with the same rule order (elevation → wall → side-by-side → shelf box) and a `magnetismEnabled` preference plus a temporary toggle key. | §2.8 rules 1–4; §2.3 wall/thickness auto-fit for doors/windows | High | Med–High |
| 9 | **Per-instance appearance: colour, texture, mirrored model, material list, shininess (default/matt/shiny), visibility** — visibility being the notable one: an invisible piece disappears from the plan and 3D but stays in the list so it can be recovered. | §2.5 modify dialog fields; §2.6 list behaviour | Med | Med |
| 10 | **Express openings and levels as geometry, not just sprites** — a door/window carries a normalised cut-out path that is subtracted from the wall, and a room auto-includes the door's half doorstep so adjacent rooms join when the door is open; a staircase carries a cut-out path for the floor above. Even just the doorstep rule noticeably improves wall/room joins. | §2.8 cut-out shapes; §2.1 `doorOrWindowCutOutShape`, `staircaseCutOutShape` | Med | Med–High |
| 11 | **Unit-aware measurement/rounding layer** — a `getMagnetizedLength(value, tolerance)` helper that picks the rounding step from the zoom tolerance (0.1/0.5/1/5/10/100 cm) and a configurable unit (cm, m, mm, inch, foot). CasaPlazAI's 0.5 m grid could reuse exactly this for furniture dimensions and elevations. | §2.5 `LengthUnit` step/tolerance logic | Med | Low–Med |
| 12 | **"Model transformations" presets per catalogue item** (named poses/variants, e.g. a mannequin standing vs arms folded; a door open vs closed) chosen from the properties dialog. | §2.1 `modelPresetTransformationsName_N` / `_N` | Low–Med | High |

Anti-patterns worth **not** copying: the flat `prefix#index` key encoding is hard to read, hard to diff and produced at least one typo key (`tage`) in a shipped catalog — CasaPlazAI should use a plain array of objects with stable ids. Likewise, putting 23 columns into a furniture list by default is overwhelming; start with name, size, position, angle, visible and let users opt in.

---

## 4. Unknowns / what I could not verify

1. **SH3F container internals were not directly inspected.** SourceForge direct downloads returned HTTP 403 (`trees.zip` = 2-byte error, `pages/free-3d-models_` links 403), so I never got an actual `.sh3f` to unzip. The "catalog resource family + assets + optional LICENSE.TXT" conclusion (§2.4) is INFERRED from the javadoc, the user guide and the parameterised `DefaultFurnitureCatalog` reader. *Any claim about exact SH3F file names, manifest keys or compression should be re-checked against a real file.*
2. **`rea analyze-web-bundle` never produced evidence.** Every run was rejected for a missing `--view` argument, and after a `command_timeout_ms` of 90 s it hit `provider_timeout` against `sweethome3d.com` (the page keeps live network/WebGL work going). I therefore have no REA bundle-graph evidence; all JS facts come from reading the downloaded minified bundle (`js/sweethome3d.min.js`) directly plus `js/core.min.js`.
3. **`rea capture-browser-scenario` could not start on the target.** The same schema succeeded on `example.com` (evidence `probe_result.json`) but navigation to `SweetHome3DJSOnline.jsp` never completed within the 90 s provider deadline (`scenario_online_app2_result.json`), so I could not script the app's own UI through REA.
4. **The live furniture list and catalog pane stayed empty in my DOM probes.** `dom_catalog.json` shows `#furniture-catalog-list` with 0 children and `#furniture-view` empty; the app only populates them after a home is opened. My follow-up script that calls `viewHome('/examples/EmptyHome.sh3x')` then dumps the populated DOM (`cdp_dom2.js` / `cdp_dom3.js`) timed out on `Runtime.evaluate` (`cdp timeout Runtime.evaluate`), so the built row markup, the group-tree indentation and the per-column `data-name` attributes in the list are **read from code, not seen rendered**. The `#home-furniture-dialog-template` markup *was* observed directly.
5. **Exact JS mapping of the "tree" catalog view.** `FurnitureCatalogTreePanel` does not exist under that name in the web bundle, and the tree/list preference still exists, so how the web build renders "tree" is unresolved.
6. **`dropOnTopElevation: "-1"` semantics.** 440 pieces carry the key and many doors/windows carry exactly `"-1"`; the reader divides by height, which yields a small negative. The precise "negative means do not stack" rule is INFERRED, not documented in the pages I read.
7. **The 935 `ignored#N` entries.** Their "model part of a multi-part model" role is inferred from the reader loop plus `multiPartModel` counts; I did not correlate a specific part index to a specific rendered material.
8. **Desktop-only behaviour:** the 15° wall/rotation magnetism, the 15° Alt override, the plugin folder path, the double-click SH3F install, the Furniture Library Editor and the free-model library ZIPs are all taken from the user guide and the models page [DOCUMENTED] — they were not reproduced on a running desktop install (not permitted here).
9. **Mobile version** (iOS/Android) and the commercial "Sweet Home 3D Online Manager"/full version with 10,000 models and 400 textures were out of scope and not verified.
10. **Not verified:** whether CasaPlazAI's plan-format and this catalog could share a JSON schema (I only describe the shape here); and the actual render quality of the `planIcon` vs `icon` distinction.
