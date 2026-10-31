# Sweet Home 3D — furniture catalog JSON field list, the two catalog tiers, and how the app chooses between them

**Job:** `rea2-sh3d-p2/07-05a-furniture-catalog-import-cat` (round 2, narrow follow-up)
**Round-1 base (read-only, reused, not redone):** `rea-sweethome3d-2026-10/05-05-furniture-catalog-import/report.md`
**App under study:** Sweet Home 3D — GPL Java desktop app; homepage https://www.sweethome3d.com/de/ ; browser edition "Sweet Home 3D JS Online" v7.5.2 at https://www.sweethome3d.com/SweetHome3DJSOnline.jsp (same Java core compiled to JS).
**Licence:** Sweet Home 3D is GPL. **No source code was copied into this deliverable.** Everything is behaviour, data shape and UX described in my own words; catalog JSON, javadoc, page HTML and live browser probes are kept as evidence in `evidence/`.
**Legend:** `OBSERVED` = seen in a file in `evidence/` (or a clearly cited round-1 evidence file) · `DOCUMENTED` = stated by vendor docs/javadoc at the cited URL · `INFERRED` = my reasoning over the evidence.

---

## 1. Summary

- **Two tiers share one encoding.** The desktop/online catalog `FurnitureCatalog.json` (679,206 B) holds **805 pieces in 12 categories**; the small-screen catalog `DefaultFurnitureCatalog.json` (127,949 B) holds **94 pieces in 8 categories**. Both files use the *same* flat resource-bundle encoding `prefix#index` → string value, both have 1,740 indices, and the 94 small-tier pieces have **byte-identical values at byte-identical indices** as in the full file [OBSERVED, `evidence/catalog_FurnitureCatalog.json`, `evidence/catalog_DefaultFurnitureCatalog.json`, `evidence/catalog_tier_correspondence.txt`].
- **Membership is a positional prefix, not a flag.** The small tier is exactly the **indices 1–100** of the full file (six holes at 54/56–60, which are `ignored` in both); every piece at index ≥ 101 is switched to `ignored#N=true` in the small file. Equivalently: the 711 dropped pieces are *exactly* the pieces carrying a `creationDate`, and *exactly* the pieces contributed by third-party libraries (Scopia, Blend Swap, Kator Legaz, …) rather than the built-in `eTeks` core [OBSERVED, `evidence/tier_criterion.txt`, `evidence/catalog_ignored_structure.txt`; INFERRED for the intent].
- **The full per-piece field list is 53 documented keys**, of which **52 are in the shipped JS enum** (`DefaultFurnitureCatalog.PropertyKey`) and `MODEL_FLAGS` is only in the 7.5 javadoc — and the shipped data actually populates only **~48** of them; `description`, `information`, `grade`, `resizable`, `price`, `valueAddedTaxPercentage`, `currency`, `modelFlags` never appear in either shipped JSON [OBSERVED, `evidence/bundle_propertykey_full.txt`, `evidence/schema_vs_data.txt`, `evidence/jd_propertykey.html`; DOCUMENTED, javadoc `DefaultFurnitureCatalog.PropertyKey`].
- **Tier choice is one hard-coded `if` in the host page, and a live 2×2 probe confirms it is an AND.** `window.matchMedia("(hover: none), (pointer: coarse)").matches && window.matchMedia("(max-width: 743px), (max-height: 511px)").matches` picks the small file, otherwise the full file; it is baked into the static JSP, so there is no runtime re-evaluation and no persistence. Measured: desktop viewport + mouse → 805; desktop viewport + touch → 805; 375×667 + mouse → 805; 375×667 + touch → 94, read back from the app's own `applicationParams.furnitureCatalogURLs` and `getFurnitureCatalog().getCategories()` [OBSERVED, `evidence/SweetHome3DJSOnline.html` lines 3098–3103, `evidence/probe_desktop.json`, `evidence/probe_mobile.json`, `evidence/probe_touch_large.json`, `evidence/probe_narrow_desktop.json`].
- **A second, orthogonal overlay axis exists: regional unit variants.** On top of the translation overlays there is a `_en_US` variant that rewrites `name` plus `width/depth/height/elevation` with *inch-native* figures (independently authored, not a `base/2.54` conversion), and it ships for the small tier only. It pairs with the app switching `LengthUnit.INCH` and inch wall defaults when the locale is `en_US`, and the mobile probe proves it is actually merged: `eTeks#door` loaded at `91.44 / 14.605 / 208.28` in, not the base `91.5 / 14.5 / 208.5` cm [OBSERVED, `evidence/en_us_variant_overlay.txt`, `evidence/en_us_live_confirmation.txt`, `evidence/bundle_catalog_reader.txt`].

---

## 2. Findings

### 2.1 The two tiers as shipped

| Property | Full / desktop tier | Small-screen tier |
| --- | --- | --- |
| File | `FurnitureCatalog.json` | `DefaultFurnitureCatalog.json` |
| URL | `https://www.sweethome3d.com/libjs/resources/FurnitureCatalog.json` | `…/resources/DefaultFurnitureCatalog.json` |
| Bytes on disk | 679,206 | 127,949 |
| Indices (`prefix#N` keys) | 1,740 (`#1`…`#1740`) | 1,740 (identical set) |
| `ignored#N=true` markers | **935** | **1,646** |
| Real pieces | **805** | **94** |
| Categories (real pieces only) | **12**: Bedroom 69, Living room 132, Bathroom 50, Doors and windows 69, Kitchen 125, Staircases 20, Miscellaneous 130, Lights 32, Office 31, Exterior 85, Vehicles 27, Characters 35 | **8**: Bedroom 11, Living room 25, Bathroom 6, Doors and windows 21, Kitchen 10, Staircases 3, Miscellaneous 10, Lights 8 |
| Top-level `Copyright` | `Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>. All Rights Reserved.` | identical |
| Door/window pieces | 66 | 21 |
| ZIP-embedded models (`x.zip!/x.obj`) | 805 / 805 | 94 / 94 |

[OBSERVED, `evidence/final_field_facts.txt`, `evidence/tier_facts.txt`; note **round-1's "13 categories" came from counting the `ignored` entries' leftover `category` strings** — the true counts for real pieces are 12 and 8, see §2.4.]

**The `ignored` mechanism.** `ignored#N=true` is not a data blob — it is a *hole marker* the reader checks first. When set, the reader still fetches that index's `icon`, `planIcon` and `model` content (so attributions/downloads for assets shared with a visible piece keep working) but creates no catalog entry. This is why 935 holes in the full file and 1,646 in the small file exist at all: the shipped file keeps one flat index space across *all* historically published assets, and the two tiers are simply two different hole patterns over that same fixed index space. [OBSERVED, `evidence/bundle_readPieceOfFurniture.txt` (`readFurniture` loop), `evidence/raw_ignored_examples.txt`; the "same index space" reading is INFERRED from the identical 1,740-index sets.]

**The authoring format stays `.properties`-shaped.** The same encoding exists as a `#key`-indexed Java `ResourceBundle` family on the desktop side: an index is addressed as `<family>_<lang>.properties` plus a base `<family>.properties`, and `PLUGIN_FURNITURE_CATALOG_FAMILY = "PluginFurnitureCatalog"` is the family name for a plugin/SH3F library. The online build simply serves the same flat map as JSON. [DOCUMENTED, `DefaultFurnitureCatalog` javadoc ("Furniture default catalog read from resources localized in `.properties` files") and constant-values page; OBSERVED, `evidence/libjs_resources_index.html` showing exactly the `_de`, `_fr`, `_en_US`, `_pt_BR`, … family files.]

**Two independent overlay layers sit on top of each base file.** (a) A **translation** overlay per language carrying only `name`, `tags`, `category` and `modelPresetTransformationsName_N` at the same indices — `_de` is 10,137 B / 297 keys for the small tier and 80,930 B / 2,469 keys for the full tier. (b) A **regional unit/dimension variant** overlay, `_en_US`, which exists **only for the small tier** (`DefaultFurnitureCatalog_en_US.json`, 5,432 B, exactly the 52 contiguous indices 1–52; `FurnitureCatalog_en_US.json` is 404). It overrides `name` plus `width`, `depth`, `height` and `elevation` with inch-native values — 0 of 168 numbers equal `base/2.54`, because they are *rounded* inch figures, not conversions. This layer is not a translation: it has no `category` and no `tags`. The loader asks for `Family_en_US.json`, then `Family_en.json` (locale split on `_`), then `Family.json`, merging in that order, so the base supplies geometry/flags and each overlay patches only the keys it carries. [OBSERVED, `evidence/localized_bundles.txt`, `evidence/en_us_variant_overlay.txt`, `evidence/locale_coverage.txt`, `evidence/libjs_resources_index.html`; merge order OBSERVED in the shipped `CoreTools.loadResourceBundles`.]

**Why `_en_US` patches dimensions at all.** The same preferences constructor branches on the locale: for `en_US` it sets `LengthUnit.INCH` and inch-domain construction defaults, otherwise `LengthUnit.CENTIMETER` with metric defaults — and the inch defaults are exact inch multiples (`wall thickness 7.62 cm = 3 in`, `wall height 243.84 cm = 96 in`, `baseboard thickness 0.9525 cm = 0.375 in`, `baseboard height 6.35 cm = 2.5 in`), versus `7.5 / 250 / 1 / 7` for metric. So for en_US the catalog needs inch-native piece dimensions as well, and that is exactly what the 52-index overlay provides. The app's own UI localisation family also has `en_AU`, `en_CA` and `en_US` members while the furniture overlays have only `en_US`, which fits a US-market unit variant rather than a language. [OBSERVED, `evidence/bundle_catalog_reader.txt` (the `LengthUnit.INCH` branch); the "US unit variant" reading is INFERRED from those two facts lining up.]

**The base small-tier catalog is metric-rounded; the `_en_US` layer is independently authored, not a conversion.** Of the 282 dimension values at indices 1–100, **246 land on exact half-centimetre multiples** in the base file and **0 land on half-inch multiples**. In the `_en_US` overlay the reverse holds (131 of 168 on half-inch multiples, none equal to `base/2.54`). Example, piece 19 (`eTeks#door`): base `width/depth/height = 91.5 / 14.5 / 208.5` (metric-rounded), overlay `91.44 / 14.605 / 208.28` (= 36 / 5.75 / 82 in). Piece 1 (`eTeks#bed140x190`) is base `158 / 70 / 208` but overlay `152.4 / 207.01 / 69.85` **and** a different name, `Double bed` — i.e. the US entry is a real US-size bed, not a unit-converted metric bed. [OBSERVED, `evidence/en_us_variant_overlay.txt`.]

**Live confirmation that the unit overlay is actually applied.** All four probes launched Chromium with `locale: 'en-US'` [OBSERVED, `evidence/probe_tier.js` line 25]. The mobile probe instantiated `eTeks#door` with `width/depth/height = 91.44 / 14.605 / 208.28` — exactly the `_en_US` overlay values, not the base file's `91.5 / 14.5 / 208.5`. So the `_en_US` file is not merely shipped, it is merged and used by the running app under an `en_US` locale. [OBSERVED, `evidence/en_us_live_confirmation.txt`; the desktop probe instantiated the contributor piece `Mchnz#craftsmanDoorClosed` at its base value `100.9 / 18.7 / 209.6`, consistent with the full tier having no `_en_US` overlay.]

### 2.2 Complete per-piece JSON field list

The authoritative list is the `DefaultFurnitureCatalog.PropertyKey` enum: **53 constants** in the 7.5 javadoc, **52** in the shipped JS build (it lacks `MODEL_FLAGS`). Each JSON key is literally the enum's lowerCamel string with `#<index>` appended, e.g. `doorOrWindowSashXAxis#12`. [OBSERVED, `evidence/bundle_propertykey_full.txt`, `evidence/final_field_facts.txt`; DOCUMENTED, `evidence/jd_propertykey.html`.]

Grouped by role, with the observed incidence in the full 805-piece file:

| Group | JSON key | Mandatory per javadoc | Occurs in full 805 | Read into (field) |
| --- | --- | --- | --- | --- |
| Identity | `id` | optional | 805 | `id` |
| | `name` | **yes** | 805 | `name` |
| | `description` | optional | **0** | `description` |
| | `information` | optional | **0** | `information` |
| | `license` | optional | 805 | `license` |
| | `tags` | optional | 801 | `tags[]` (split on `\s*,\s*`) |
| | `creationDate` | optional | 711 | `creationDate` (`yyyy-MM-dd` → ms epoch) |
| | `grade` | optional | **0** | `grade` (float) |
| | `category` | **yes** | 805 | `FurnitureCategory` name |
| Media | `icon` (+`iconDigest`) | **yes** (digest opt.) | 805 / 805 | `Content`; SHA-1 Base64 digest |
| | `planIcon` (+`planIconDigest`) | optional | 2 / 2 | plan-view icon `Content` |
| | `model` (+`modelDigest`, `modelSize`, `multiPartModel`) | **yes** | 805 / 805 / 805 / 667 | 3D model `Content`; size in bytes |
| Geometry | `width`, `depth`, `height` | **yes** each | 805 each | cm, converted to the user unit |
| | `elevation` | optional (default 0) | 153 | cm above floor |
| | `dropOnTopElevation` | optional | 440 | stored **divided by height** → a fraction |
| | `modelRotation` | optional | 42 | 9 floats → 3×3 matrix |
| | `modelFlags` | optional | **0** | int flags (dead in the web build, §2.4) |
| | `staircaseCutOutShape` | optional | 20 | SVG-path-like `d` string |
| Behaviour | `movable` | **yes** | 805 | boolean |
| | `doorOrWindow` | **yes** | 805 | boolean (selects the `CatalogDoorOrWindow` subclass) |
| | `resizable` | optional (true) | **0** | boolean |
| | `deformable` | optional (true) | 2 | boolean |
| | `texturable` | optional (true) | 2 | boolean |
| | `horizontallyRotatable` | optional (true) | 2 | boolean |
| Door/window | `doorOrWindowCutOutShape` | optional | 60 | SVG `d` in a unit square |
| | `doorOrWindowWallThickness` | optional | 45 | cm, divided by depth → fraction |
| | `doorOrWindowWallDistance` | optional | 20 | cm, divided by depth → fraction |
| | `doorOrWindowWallCutOutOnBothSides` | optional (true) | 1 | boolean |
| | `doorOrWindowWidthDepthDeformable` | optional (true) | 2 | boolean |
| | `doorOrWindowSashXAxis`, `…YAxis`, `…Width`, `…StartAngle`, `…EndAngle` | X optional, others coupled | 41 each | 5 parallel space-separated lists → `Sash[]` |
| Light | `lightSourceX`, `…Y`, `…Z`, `…Color`, `…Diameter` | X optional, others coupled | 31 each | space-separated lists → `LightSource[]` |
| | `lightSourceMaterialName` | optional | 1 | space-separated list of 3D shape names |
| Shelf | `shelfElevations` | optional | 38 | space-separated cm list |
| | `shelfBoxes` | optional | 3 | `x y z w h d` sextuples |
| Commerce | `price` | optional | **0** | `BigDecimal`, always a string |
| | `valueAddedTaxPercentage` | optional | **0** | `BigDecimal` |
| | `currency` | optional | **0** | ISO 4217 string |
| Dynamic | `modelPresetTransformationsName_<n>` + `modelPresetTransformations_<n>` | optional | 6 pieces, n up to 13 | named 3×4 matrices, space-separated, 13 tokens per matrix (name + 12 floats) |

Sources for the incidences: `evidence/catalog_fields_analysis.txt`; for the value encodings: `evidence/bundle_readPieceOfFurniture.txt`, `evidence/bundle_reader_methods.txt`; for the semantics: `evidence/propertykey_javadoc_table.txt`.

Three value-encoding details worth copying conceptually:

- **`dropOnTopElevation` is stored normalised.** The reader does `getOptionalFloat(dropOnTopElevation, height) / height`, so the JSON carries centimetres but the model keeps a *fraction of the piece's own height* — the "where does a dropped object sit on this piece" hint is height-relative, not absolute. [OBSERVED, `evidence/bundle_readPieceOfFurniture.txt`.]
- **Boolean and optional defaults are decoded permissively.** `parseBoolean` is literally `"true" == value`, so anything else (including a missing key caught and defaulted) reads as false; the three capability keys default to `true` via `getOptionalBoolean(present, true)`. All values are strings because the underlying container is a resource bundle. [OBSERVED, `evidence/bundle_catalog_reader.txt`, `evidence/bundle_readPieceOfFurniture.txt`.]
- **Any key can be added.** A key whose prefix is not a known enum constant is treated as an *additional property*, with an optional `:Type` suffix after the index (`modelPresetTransformations_1#1033`). These are round-tripped into the home file and surfaced as extra furniture-list columns. So the 53 constants are the *fixed vocabulary*, not a closed schema. [OBSERVED, `evidence/bundle_reader_methods.txt` (`getCatalogAdditionalProperties`, `isDefaultProperty`); DOCUMENTED via round-1 `bundle_furniture_table.txt` for the dynamic columns.]

### 2.3 How the app chooses between the tiers

The choice happens **once, statically, in the host page before the app object is constructed**. Reproduced verbatim structure of that block (page text, not app code):

```
if (window.matchMedia("(hover: none), (pointer: coarse)").matches
    && window.matchMedia("(max-width: 743px), (max-height: 511px)").matches) {
  applicationParams.furnitureCatalogURLs = ["/libjs/resources/DefaultFurnitureCatalog.json"];
} else {
  applicationParams.furnitureCatalogURLs = ["/libjs/resources/FurnitureCatalog.json"];
}
```

[OBSERVED, `evidence/SweetHome3DJSOnline.html` lines 3098–3103. The German online page at https://www.sweethome3d.com/de/online/ does not embed the app at all — it links to `/SweetHome3DJSOnline.jsp` (which is served with `userLanguage="en"`), so German users get the English-marked page and choose their language inside the app. `evidence/de_online.html`, and the `userLanguage`/`pt → pt_BR` lines next to the tier block. INFERRED: localisation therefore cannot influence the tier either.]

- **Two independent signals are ANDed**, not ORed: a *pointer/hover* signal `(hover: none), (pointer: coarse)` and a *size* signal `(max-width: 743px), (max-height: 511px)`. Each is itself a comma-separated OR list. The size breakpoints 743×511 match the CSS block at line 726 of the same page (`.pane-splitter { display: none }`, `#furniture-catalog { height: 100% }`), and the same pointer query is reused all over the page's own chrome (toolbar horizontal scrolling, hiding About, hiding popup menus, a resize listener that re-lays-out only for coarse pointers). [OBSERVED, `evidence/SweetHome3DJSOnline.html` lines 612, 726, 966, 1020, 1112, and the bundle's own `window.matchMedia("(hover: none), (pointer: coarse)")` uses in `HomePane`.]
- **There is no runtime switch.** `furnitureCatalogURLs` is read once when the preferences object is built (`RecordedUserPreferences` copies `b.furnitureCatalogURLs` into `this.furnitureCatalogUrls`) and then the `DefaultFurnitureCatalog(urls, resourcesUrlBase)` constructor reads those URLs. Resizing the window or plugging in a mouse after load does not change the loaded catalog. [OBSERVED, `evidence/bundle_catalog_reader.txt`; INFERRED from there being no re-read of `applicationParams`.]
- **Desktop (Java) has no such gate.** The Java `DefaultFurnitureCatalog` has constructors for "resources in the package of this class", a plugin folder, and an explicit `URL[] pluginFurnitureCatalogUrls (+ resourcesUrlBase)`; the resources are read from the classpath `.properties` family `DefaultFurnitureCatalog` plus the plugin family `PluginFurnitureCatalog` ("resources in the package of this class", "read only from resources"). So on the desktop the catalog is the classpath default plus installed libraries, and the "small screen" file is a *web-only* optimisation rather than a product edition. [DOCUMENTED, `DefaultFurnitureCatalog` javadoc constructors and `PLUGIN_FURNITURE_CATALOG_FAMILY`; OBSERVED, `evidence/bundle_catalog_reader.txt` for the JS wiring. INFERRED: the web build ships the same Java class, so the two `applicationParams` URLs are the web equivalent of "classpath default".]

**Live 2×2 confirmation.** I drove headless Chromium (software GL flags on, per the round-1 lesson) against the real page, let the app load, then read back both the network requests and the app's own state:

| Probe | `matchMedia` coarse | `matchMedia` small | Viewport | `applicationParams.furnitureCatalogURLs` | `getCategories()` | Pieces |
| --- | --- | --- | --- | --- | --- | --- |
| `probe_desktop.json` | false | false | 1280×720, no touch | `FurnitureCatalog.json` | 12 | **805** |
| `probe_touch_large.json` | **true** | false | 1280×800, touch | `FurnitureCatalog.json` | 12 | **805** |
| `probe_narrow_desktop.json` | false | **true** | 375×667, no touch | `FurnitureCatalog.json` | 12 | **805** |
| `probe_mobile.json` | true | true | 375×667, touch | `DefaultFurnitureCatalog.json` | 8 | **94** |

The network logs match the choice exactly: the desktop-class probes request `FurnitureCatalog_en_US.json`, then `FurnitureCatalog_en.json`, then `FurnitureCatalog.json`; the mobile probe requests the `DefaultFurnitureCatalog_*` triple. The same trio is requested for textures. This is a live demonstration of the overlay-merge order in §2.1 and it also proves the loader **always** asks for both `_en_US` and `_en` regardless of tier — so the missing `FurnitureCatalog_en_US.json` and the missing `*_en.json` are both harmless 404s, not an error path. [OBSERVED, all four probe JSONs plus `evidence/probe_touch_large.log` and `evidence/probe_narrow.log`.]

### 2.4 What differs between the tiers, measured

Everything below is measured on the two shipped files, not inferred from vendor docs:

- **The small tier is a positional prefix, and the file is not regenerated.** The two files have **identical index sets** (1…1740) and the 94 visible small-tier indices are exactly `1…100` minus the six holes 54, 56, 57, 58, 59, 60. The smallest dropped index is **104**; every index ≥ 101 is `ignored` in the small file. [OBSERVED, `evidence/tier_criterion.txt`, `evidence/catalog_ignored_structure.txt`.]
- **The cut is "built-in core vs contributed libraries", not "big vs small".** All 94 kept pieces are `creator: "eTeks"` and all 94 carry `license: "GNU GPL / CC-BY"` (one piece reads `"GNU GPL / CC-BY or CC-BY"`). The 711 dropped pieces have `license` only from `CC-BY` (380), `Free Art` (131), `Free Art / CC-BY` (108), `CC-0` (92) and creators such as Scopia (264), Blend Swap CC-0 (92), Blend Swap CC-BY (64), OlaKristianHoff (63), Kator Legaz (28), LucaPresidente (25), Reallusion (24) — i.e. exactly the downloadable contributor/plugin libraries listed on the import-models page. **The dropped set is also exactly the set carrying a `creationDate`** (711/711, zero symmetric difference). [OBSERVED, `evidence/tier_criterion.txt`, `evidence/catalog_core_vs_libraries.txt`; the library names cross-check against `docs/import-models.txt`.]
- **No field is added, removed or changed in the small tier.** For the 94 shared indices, every key that is present in the full file is present in the small file with the *same value* — a per-key, per-index diff found **zero** differences, and the field-histogram over the kept 94 is identical key-for-key. The only two differences between the files are (a) which indices are `ignored` and (b) the bytes saved by removing the 711 dropped records. [OBSERVED, `evidence/catalog_tier_correspondence.txt`, `evidence/catalog_tier_diff_summary.txt`.]
- **Categories are dropped as a consequence, not by a category rule.** The small tier keeps a strict subset of the 8 "indoor" categories and drops 4 entirely: **Office, Exterior, Vehicles, Characters** (31 + 85 + 27 + 35 = 178 pieces). The remaining drops spread across all 8 kept categories. So a small-screen user never sees a category that is empty. [OBSERVED, `evidence/tier_criterion.txt`; INFERRED for the "no empty category" consequence.]
- **The round-1 "13 categories" figure was an artefact.** Counting the leftover `category#N` strings that survive on `ignored` indices gives an extra phantom bucket (round 1 saw `None: 935`); counting only real pieces gives **12** in the full file and **8** in the small one. [OBSERVED, `evidence/catalog_ignored_entries.txt`, `evidence/tier_criterion.txt`.]
- **Two reader bugs/quirks visible in the shipped web build.**
  1. `MODEL_FLAGS` is missing from the JS enum, so the reader's `PropertyKey.MODEL_FLAGS` is `undefined` and the composed key is `"undefined#N"` — `modelFlags` can never load in the browser (and the shipped catalogs never set it anyway). The javadoc and the desktop Java enum both have it. [OBSERVED, `evidence/model_flags_gap.txt`; DOCUMENTED, javadoc.]
  2. One piece carries the misspelled key `tage#N` instead of `tags#N` — which, per the "any unknown prefix becomes an additional property" rule, becomes a per-piece extra property rather than a tag list. [OBSERVED, `evidence/final_field_facts.txt`.]
- **A fresh browser session is treated as metric unless the locale is `en_US`.** The unit is chosen from `Locale.getDefault() != "en_US"`, so the inch catalog and inch wall defaults only apply to US-English users; everyone else gets centimetres and the metric values from the base file. Combined with the tier rule this means the *catalog file* and the *unit overlays* are two orthogonal axes. [OBSERVED, `evidence/bundle_catalog_reader.txt`; INFERRED for the orthogonality, since the tier selector never mentions locale.]
- **`ignored` holes still download assets.** In both files the reader explicitly resolves `icon`, `planIcon` and `model` for an ignored index; some ignored indices carry a full asset triple and no other metadata at all (e.g. full-file index 61 and the small-file holes at 54, 56–60). This is asset pre-attribution/keep-alive, not a hidden piece. [OBSERVED, `evidence/raw_ignored_examples.txt`, `evidence/bundle_readPieceOfFurniture.txt`.]

### 2.5 Positioning relative to round 1

Round 1 established the catalog *as a rich record* (its §2.1) and the import wizard/SH3F/list-table/grouping/magnetism. This round adds, and where it conflicts corrects:

1. The **exact membership rule of the two tiers** (positional prefix 1–100; equivalent to "has `creationDate`" / "is a contributed library piece") — round 1 only reported the two counts and the selection query.
2. The **complete 53/52-key field list with per-key incidence** in the shipped data, plus which eight documented keys are never populated.
3. The **tier selector proven as an AND of two signals**, with a four-way live experiment, and the fact that the desktop Java build has no equivalent gate.
4. The **correction** from 13 → 12 / 8 true categories.
5. The **two-layer overlay model** (§2.1): per-language translation overlays (name/tags/category/preset names, same indices) *plus* a `_en_US` regional **unit variant** overlay that rewrites the numeric geometry with rounded inch values and ships for the small tier only — round 1 did not cover either layer. A note for anyone reusing round-1's folder: the files there named `dl_libjs_resources_*` and `dl_resources_*` are **404 HTML pages**, not catalog data (I verified their first bytes); the real catalog data is `catalog_FurnitureCatalog.json` / `catalog_DefaultFurnitureCatalog.json`, which are the files I reused.
6. The **two shipped-build quirks** (`MODEL_FLAGS` absent from the JS enum; a `tage` typo).

---

## 3. Ideas for CasaPlazAI

CasaPlazAI is a single-page TypeScript/Three.js floorplanner with **no backend**, plan autosaved to `localStorage`, a frozen `FloorplanData` schema whose `FurnitureItem.type` is a closed seven-member enum (`bed | sofa | table | chair | counter | bathtub | toilet`) plus `footprint: [a,b]`, `position`, `rotationDeg`, and a "single-workspace UI redesign in progress (Plan / 3D / Walk modes, tool card, inspector)". Each idea names the finding it comes from and, where relevant, the schema field it touches.

| # | Idea | Tied to finding | Value / effort | Schema / code touchpoint |
| --- | --- | --- | --- | --- |
| 1 | **Give the furniture palette two tiers selected by the same two-signal AND, but at render time.** Keep one small default catalog for coarse-pointer *or* small viewport and lazy-load the rest only when the user opens the full catalog. Use exactly `(hover: none), (pointer: coarse)` AND `(max-width: 743px), (max-height: 511px)` semantics so a tablet in landscape (touch, large) still gets the full set — my probe shows that is the app's own behaviour. | §2.3 | **High value / low effort.** CasaPlazAI has no backend, so the win is *bundle size and first-paint*, not server bytes: ship ~20–30 core items in the main bundle, dynamic-`import()` the long tail. | `src/editor/model/…` palette module; no schema change. |
| 2 | **Make the palette an index-addressed catalog with explicit holes, not a per-tier file.** One flat array of pieces addressed by stable index; tiering flips indices on/off with a marker instead of duplicating the list. This is what makes the two SH3D files diff to *zero* shared-value differences — a property worth having, because a duplicated small catalog is guaranteed to drift. | §2.1, §2.4 | **High value / low effort.** One data file, one `visibleIn: "core" \| "full"` flag; a test can assert the core list is a strict prefix. | New `src/shared/catalog/` module; feed `FurnitureItem.type` from it. |
| 3 | **Adopt height-relative drop elevation as a first-class item attribute.** SH3D stores `dropOnTopElevation` normalised by the piece's own height (`/height`), so "put a lamp on this counter" survives the counter being resized. This is directly useful for CasaPlazAI's `counter` and `table` types, where users will stack small items. | §2.2 | **High value / medium effort.** Adds one optional number and a resolver; pairs naturally with the existing fit/collision constraints. | Additive optional field on the furniture payload (e.g. `dropOnTopElevationRatio?: number`) — additive, so no `SCHEMA_VERSION` bump needed under the barrel API convention. |
| 4 | **Let the seven `FurnitureItem.type`s carry capability flags instead of hard-coding behaviour.** SH3D's `resizable / deformable / texturable / horizontallyRotatable / widthDepthDeformable` (all default `true`, all decode as "anything but `true` is false") are what let one generic piece renderer handle 805 heterogeneous pieces. CasaPlazAI's closed enum currently forces per-type branches. | §2.2 | **Medium value / medium effort.** A capability record per type removes `switch (type)` growth as types are added. | Extend the closed enum's companion metadata (not the enum itself) in `src/shared/schema/types.ts`; keep `validate.ts`'s `unknown-furniture-type` behaviour. |
| 5 | **Use the `prefix#index` flat-map encoding for the future catalog.** If the catalog later ships as a static JSON asset, the `key#index → string` map is trivially diffable, mergeable with translation overlays by index, and language-agnostic. It is also a natural fit for the support-many-languages overlay pattern in §2.1. | §2.1, §2.2 | **Medium value / low effort** at current catalog size (well under 100 items). | Catalog asset format only. |
| 6 | **Persist table/palette layout per plan, the way SH3D persists visible columns and sort on the home.** CasaPlazAI already has a "workspace layout not in `FloorplanData`" precedent (snap settings, measurements, underlay). Sorting and visible palette columns belong in that editor-local family of keys. | round-1 §2.6 + §2.3 (persistence model) | **Medium value / low effort**, and it keeps the frozen schema frozen. | New editor-local `localStorage` key (e.g. `casaplaza.catalog.prefs.v1`), mirroring `casaplaza.snap.settings.v1`. |
| 7 | **Mirror the two-layer overlay split when i18n *and* unit systems arrive.** Base catalog = geometry + flags at stable indices; one overlay per language for `name`/`tags`/`category`; a separate overlay family for regional *unit variants* that patches numeric geometry, kept out of the translation files. SH3D's `_en_US` file proves the two concerns must not be mixed — its unit variant has no `category`/`tags`, and its translations have no numbers. | §2.1 | **Medium value / low effort** once either i18n or imperial units is needed; skip until then. Note CasaPlazAI's schema is metres-only, so an imperial *display* layer would be the right place for this, not the schema. | Catalog asset split only; `units: "meters"` in `FloorplanData` stays untouched. |
| 8 | **Guard against the "unknown key becomes an additional property" footgun.** SH3D's permissiveness is why the shipped file contains a `tage#N` typo and a dead `modelFlags#N` path. If CasaPlazAI ever accepts user/imported catalog JSON, validate keys against a known set and reject or warn instead of silently storing extras. | §2.2, §2.4 | **Medium value / low effort.** A strict parse at the import boundary; the frozen `validate.ts` already has the error-code idiom to reuse. | New catalog-import validator alongside `src/shared/schema/validate.ts`; no change to `FloorplanData`. |
| 9 | **Two-tier the *3D assets* too, not just the metadata.** SH3D's tiers keep the same model URLs and only remove records, so a piece's 3D asset is tier-independent. For CasaPlazAI, the analogous cheap win is a low-poly placeholder for the core palette and the full mesh only on selection/3D mode. | §2.4 | **Low–medium value / medium effort**, but directly relevant to a no-backend single-page app that must stay small. | Asset pipeline; no schema change. |
| 10 | **Do not copy the static-bake approach for the mode switch.** SH3D's tier is fixed before app construction and never re-evaluated, which is exactly wrong for a workspace whose Plan/3D/Walk modes change device posture mid-session. Prefer a reactive `matchMedia` listener on the redesign's tool card/palette. | §2.3 | **Low value / low effort** as an explicit design note / lint guard. | UI redesign; no schema touch. |

---

## 4. Unknowns

1. **Desktop Java catalog contents were not enumerated.** The 805/94 counts come from the *web* resources. The desktop JAR's classpath `DefaultFurnitureCatalog.properties` family plus `PluginFurnitureCatalog.properties` may differ in membership (it is the same code path, but I could not download and unpack the JAR/DMG in scope — SourceForge download endpoints returned HTML, and desktop installers are out of scope by the task rules). [Javadoc confirms the family names; membership counts are INFERRED to match.]
2. **Exact SH3F container layout is still not verified here** (round 1 flagged the same). I confirmed the *family name* `PluginFurnitureCatalog` and that the JS constructor accepts `URL[] pluginFurnitureCatalogUrls` + `furnitureResourcesUrlBase`, but I did not open an `.sh3f`.
3. **Whether the 1–100 split is intentional or historical.** The evidence is strong that the kept set is exactly the `eTeks`-created core (94/94 creators are `eTeks`, 711/711 dropped are non-`eTeks`), but the *choice* of index 100 as the boundary — rather than a `core#`/`library#` prefix or a flag — is INFERRED to be a build-time convention; I found no vendor statement describing the tier rule.
4. **The tier rule is not documented anywhere I could find.** `DefaultFurnitureCatalog`'s javadoc is silent on tiers; the user guide's furniture section does not mention a reduced catalog; the FAQ entry only says "it works on mobile devices, but for a better experience a desktop browser is recommended". The mechanism is therefore OBSERVED (page source + live probe) and not DOCUMENTED.
5. **The `_en_US` unit variant is only half-understood.** I confirmed it exists for the small tier only, covers exactly indices 1–52, overrides `name/width/depth/height/elevation`, and that its values are rounded inch figures rather than `base/2.54` conversions (131 of 168 land on exact half-inch multiples). I did **not** establish why it stops at index 52 (i.e. why the piece at 53 and the 42 kept pieces from 55 upward have no US variant) — 55–61 are the light sources, and `elevation` is overridden for 12 of the 52. Whether the missing 42 simply fall back to metric values, or were never rebuilt, is unknown.
6. **Whether the language overlay and the unit overlay compose.** The loader's order is `_en_US` → `_en` → base, so for an `en_US` user the unit variant wins. For a hypothetical `de_US`-style locale the split-on-`_` behaviour would request `_de` and never `_en_US`; I did not probe a non-English locale with a US region.
7. **`modelFlags` semantics on desktop are unknown.** The field is documented and referenced by the reader but absent from the shipped JS enum and from both shipped catalogs, so I can describe it only as "optional int flags" without saying what any bit means.
8. **Whether any other host page picks a different tier.** I checked `SweetHome3DJSOnline.jsp` (the app) and `/de/online/` (a landing page that links to it). Other embedders (e.g. the "SweetHome3DJSViewer" distribution, or third-party sites) could pass other `furnitureCatalogURLs`; those were not sampled.
9. **Not verified:** how the desktop Furniture Library Editor *writes* catalogs (i.e. whether it preserves the index/hole convention), and whether installing an SH3F can extend the small-screen tier on a mobile client.

---

## Evidence index

| File | What it shows |
| --- | --- |
| `evidence/catalog_FurnitureCatalog.json` | Full desktop/online tier, 679,206 B (round-1 download, copied here unchanged) |
| `evidence/catalog_DefaultFurnitureCatalog.json` | Small-screen tier, 127,949 B (round-1 download, copied here unchanged) |
| `evidence/SweetHome3DJSOnline.html` | Host page; lines 3098–3103 are the tier selector |
| `evidence/catalog_fields_analysis.txt` | Per-key histograms of both files |
| `evidence/catalog_tier_correspondence.txt` | Identical index sets; zero value differences on shared indices |
| `evidence/catalog_tier_diff_summary.txt` | Kept/dropped split and per-key parity table |
| `evidence/tier_criterion.txt` | Proof that the kept set = indices 1–100 = `eTeks` core = no `creationDate` |
| `evidence/catalog_ignored_structure.txt` | `ignored` run-length structure of both files |
| `evidence/raw_ignored_examples.txt` | Raw keys of representative `ignored` and real indices |
| `evidence/catalog_small_membership.txt` | The 94 small-tier pieces by category |
| `evidence/bundle_propertykey_full.txt` | The 52-entry JS `PropertyKey` enum literal, verbatim |
| `evidence/bundle_catalog_reader.txt` | `parseBoolean`, `getKey`, catalogue constructor region |
| `evidence/bundle_readPieceOfFurniture.txt` | The full per-piece reader — every field read and its transform |
| `evidence/bundle_reader_methods.txt` | `getContent`, sashes, light sources, shelves, additional properties |
| `evidence/bundle_ignored_reader.txt` | Context of the `ignored#N` hole handling |
| `evidence/model_flags_gap.txt` | `MODEL_FLAGS` missing from the JS enum |
| `evidence/schema_vs_data.txt` | Enum vs shipped-data key comparison |
| `evidence/propertykey_javadoc_table.txt` | All 53 documented keys with their javadoc descriptions |
| `evidence/jd_propertykey.html`, `evidence/jd_textureskey.html` | Javadoc snapshots (furniture + textures `PropertyKey`) |
| `evidence/localized_bundles.txt` | `_de` translation overlays carry only name/tags/category/preset names |
| `evidence/en_us_variant_overlay.txt` | The `_en_US` unit-variant overlay: 52 indices, name+dimensions, rounded inches |
| `evidence/en_us_live_confirmation.txt` | The `_en_US` values actually used by the running app (`eTeks#door` = 91.44/14.605/208.28) |
| `evidence/locale_coverage.txt` | Overlay family matrix per tier; `_en_US` exists for the small tier only |
| `evidence/libjs_resources_index.html` | Server directory listing: full `_locale` family set, `localization_en_AU/_en_CA/_en_US` |
| `evidence/overlays/` | All 37 downloaded overlay files (translation + unit variants) |
| `evidence/tier_facts.txt`, `evidence/final_field_facts.txt` | Size/category/field counts used in §2.1–2.2 |
| `evidence/catalog_core_vs_libraries.txt` | Creators, licences and id-prefixes of the 711 dropped pieces |
| `evidence/probe_tier.js` | Read-only Playwright probe (evaluates the page's own JS state) |
| `evidence/probe_desktop.json`, `probe_touch_large.json`, `probe_narrow_desktop.json`, `probe_mobile.json` | The four live tier experiments |
| `evidence/de_online.html`, `evidence/download.html`, `evidence/features.html`, `evidence/importModels.jsp.html`, `evidence/plugins.html` | Vendor pages consulted (German landing, download/source links, features, model libraries, plug-ins) |
| `sources.json` (folder root) | Machine-readable source list |

**Sources (URLs):**
- https://www.sweethome3d.com/de/ — German homepage (landing only; links to the online app) [OBSERVED]
- https://www.sweethome3d.com/SweetHome3DJSOnline.jsp — browser edition v7.5.2, tier selector inline [OBSERVED]
- https://www.sweethome3d.com/libjs/resources/FurnitureCatalog.json — full tier [OBSERVED]
- https://www.sweethome3d.com/libjs/resources/DefaultFurnitureCatalog.json — small-screen tier [OBSERVED]
- https://www.sweethome3d.com/libjs/resources/ — directory listing of the `_locale` families [OBSERVED]
- https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2 — Java-to-JS build (read for behaviour only) [OBSERVED]
- https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/io/DefaultFurnitureCatalog.PropertyKey.html — 53 key constants [DOCUMENTED]
- https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/io/DefaultFurnitureCatalog.html — catalog constructors, `.properties` family, `PluginFurnitureCatalog` [DOCUMENTED]
- https://www.sweethome3d.com/javadoc/constant-values.html — `PLUGIN_FURNITURE_CATALOG_FAMILY = "PluginFurnitureCatalog"` [DOCUMENTED]
- https://www.sweethome3d.com/users-guide/ and https://www.sweethome3d.com/import-models/ — user guide / model-library page [DOCUMENTED]
- https://www.sweethome3d.com/de/download/ — download page listing the source distribution [OBSERVED]

**Round-1 evidence reused read-only:** `js/sweethome3d.min.js`, `js/core.min.js`, `classes.txt`, `docs/*`, `catalog_analysis*.txt`, `catalog_mobile.txt`. No file in `rea-sweethome3d-2026-10/` was modified.
