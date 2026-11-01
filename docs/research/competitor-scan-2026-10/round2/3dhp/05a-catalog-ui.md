# 3D House Planner — Catalog UI Deep Dive (drawer, category tree, search, thumbnails, favourites/recents)

Job: `07-05a-furniture-catalog-catalog-ui` · Target: https://www.3dhouseplanner.com/ (3D editor `/app.php`, 2D planner iframe `2D-Planner/index.php`)
Round 2 — builds on `rea-3dhouseplanner-2026-10/05-05-furniture-catalog/report.md` (read-only) and closes its "Unknowns" that touch catalog UI.

Legend: **OBSERVED** = seen in a capture / shipped bytes / live endpoint response (evidence file named) · **DOCUMENTED** = stated on a vendor page (URL) · **INFERRED** = my deduction, not directly measured.

Started 2026-10-31 15:41 CET. All evidence files are in this folder.

## 1. Summary

- **The drawer is server-rendered HTML, not a client data grid.** `/app.php` ships the whole catalog as pre-built markup inside `<aside id="mySidebar" class="hp-catalog">`: **13 top-level categories → 58 category buttons → 1 882 `<a id="item<ID>">` anchors**, plus **456 `<a id="texture<ID>">`** in the Textures tab, and **2 592 `<img src="textures/loading.gif" data-src="…" class="lazy">`** (OBSERVED: `editor-app.php.html`, `catalog-aside.html`).
- **Navigation is a client-side "drill-down" over that static tree** — no per-category fetch. One delegated click handler pushes `{ul,label}` frames, toggles `.hp-current` / `.hp-path`, builds breadcrumbs (`cat.all` → … , with a back chevron), and re-runs `lazyLoadInstance.update()` (OBSERVED: `deobf/hp-panels.deobf.js`, `css/hp-panels.css`).
- **Search is a single POST to `/parsers/search.php`** with `search_term=<≥2 chars>` (objects) or `search_term2=` (textures) and `lang=`; it is debounced **220 ms**, has a **2-character minimum** (`cat.minChars`), a **request-sequence guard** against out-of-order responses, and returns **server-rendered `<a id="item_s<ID>">`/`<a id="texture_s<ID>">` cards, hard-capped at 20 results** ordered by **ascending product id = catalog-insertion order** (worst-possible ranking) (OBSERVED: `deobf/hp-panels.deobf.js`, `probe*/`, `search-*.html`).
- **Matching is a case-insensitive substring test on the *localized* title only** — no tokenisation, no AND/OR, no fuzzy, no synonyms, no cross-language fallback: `"red sofa"` returns **0 results** and `"couch"`/`"settee"` return **nothing**, while `"the"` matches 20 items (OBSERVED: probes vs `hp-boot.json` titles). The 2D planner, by contrast, has a *client-side* scorer with exact/prefix/token/substring weights, alias and exclusion lists in 8 languages (OBSERVED: `deobf/objectCatalog.deobf.js`).
- **There are no favourites and no bookmarking anywhere**, but there *is* a **"Recently used" strip**: a single `localStorage["hp-catalog-recent"]` array of product-id strings, deduped latest-first, **capped at 12 stored / 8 rendered**, injected above the tree, hidden while searching or while drilled into a sub-category, and re-rendered live from a `hp-catalog-recent` `CustomEvent` (OBSERVED: `deobf/hp-editor.deobf.js`, `deobf/hp-panels.deobf.js`, `css/hp-panels.css`). And the payload is hugely redundant: the drawer is 35 % of a 2.09 MB document, and in `HP_BOOT` the `products` map (246 KB) and `textures` map (131 KB) are 100 % derivable from `objectOptions`/`floorplanTextureCatalog`, while `suggestions` (70 KB) plus the per-item `tokens`/`slug` (111 KB) are dead or derivable — **≈558 KB (27 % of the document) is removable with zero behaviour change** (OBSERVED: measured byte counts, `hp-boot.json`, `deobf/hp-editor-tail.deobf.js`).

## 2. Findings

### 2.1 The drawer: geometry, triggers, tabs

**OBSERVED** (`css/hp-panels.css`, `editor-app.php.html`, `deobf/hp-panels.deobf.js`, `strings/hp-panels.txt`).

- Markup: `<aside id="mySidebar" class="hp-catalog" aria-hidden="true" aria-label="Catalog">`; the same `<aside>` holds **two panes**, `#tab1` (Objects, `data-kind="objects"`) and `#tab2` (Textures, `data-kind="textures"`), switched by a `data-hp-tabs` tab strip (`HPUI.tabs`).
- CSS: fixed to the right, `top: var(--hp-topbar-h)`, `bottom: var(--hp-status-h)`, `width: min(380px, 100vw)`, `z-index: 984`; **hidden by `transform: translateX(105%)` + `visibility: hidden`**, opened by adding `.hp-open` (`.22s ease`). At `max-width: 700px` it becomes `width: 100vw` (a full-screen sheet); `@media print` removes it.
- Open/close is the **`HPCatalog` singleton** exposed as `window.HPCatalog` plus the legacy globals `window.w3_open()` / `window.w3_close()`; `open()` adds `.hp-open` to the drawer, sets `aria-hidden="false"`, adds `body.hp-catalog-open` (which shifts the material panel `right: calc(min(380px,100vw)+12px)`), marks `#hpToolCatalog` `.hp-active`, remembers `document.activeElement` and restores focus on close. `close()` is bound to `[data-catalog-close]` and to `Escape` on the drawer.
- **The launcher does not exist in the static HTML.** `grep` over the whole 2.09 MB document returns **zero** occurrences of `hpToolCatalog`; it is *created at runtime* by the tool-button factory in `hp-ui.js`: `_0x536e31({id:'hpToolCatalog', icon: <'chair'|'texture'>, label: i18n('ui.catalog'), title: i18n('ui.catalogTip'), order: 10, onClick: () => window.HPCatalog ? HPCatalog.toggle() : w3_open()})`. The dock button therefore only exists after `hp-ui` boots, and it calls `toggle()` (not `open()`). `#hpToolCard` *is* in the HTML (the dock card container) — that is the only "tool card" id present.
- The **Textures** tab carries an extra AI entry point: `#tab2` opens with a full-width `data-hp-open="modalAiTexture"` button ("Generate texture with AI", `cat.aiTexture`) — **I did not invoke any AI feature** (rule).

### 2.2 Category tree: shape, drill-down, breadcrumbs, previews, group headers

**OBSERVED** (`catalog-aside.html`, `cat-tree.json`, `deobf/hp-panels.deobf.js`, `css/hp-panels.css`, `hp-boot.json`).

- Rendered tree is **2 levels deep at most**: 13 level-1 categories (each `<li class="hp-cat"><button class="hp-cat-btn">` with `<span class="hp-cat-name">`, `<small class="hp-cat-count">`, a `<span class="hp-cat-thumbs">` and a `chevron_right`), each with 0–11 level-2 children, **58 category buttons in tab 1 and 28 in tab 2**.
- The leaves are `<ul class="hp-cat-list hp-items level-4 hp-items-grouped">` containing both `<li class="hp-item-group" role="presentation">Bookcases</li>` headers and `<li class="hp-item">` rows; **64 group headers** across tab 1. Group headers are emoji-free uppercase labels rendered by CSS as `grid-column: 1 / -1` section titles (`hp-items .hp-item-group`), so one title covers the whole 3-column grid.
- **Level-1 counts are exact subtree cardinalities** (sum = 1 882 and 1 882 anchors total): Living room 317, Bedroom 278, Other 281, Kitchen 191, Vehicles and transport 162, Leisure 151, Doors and windows 106, Lighting 101, Garden 101, Bathroom 91, Stairs and railings 53, Tools and equipment 29, Laundry and storage 21 (OBSERVED, `cat-tree.json`). The 106 "Doors and windows" = the 60 `doorOptions` + 46 `windowOptions` from `HP_BOOT` (OBSERVED, `hp-boot.json`).
- **The count is a precomputed label, not a live filter.** `HP_BOOT.objectCategories` encodes the hierarchy instead through `parent`/`grand_parent`, and the leaf category ids do **not** follow the rendered nesting (e.g. `Living room` has *no* rows with `parent=5`; its "Furniture" child is category 83, whose children are 113–117 Sofas/Tables/Chairs/TV stands/Bookcases; `Decor..` is 52 → 53 Plants, 66 Vases, 67 Stones, 70 Decorative objects). **INFERRED**: the PHP renderer walks a category path (grand_parent → parent → category) and emits one `<ul>` per level, while `HP_BOOT` flattens the same tree as three scalar columns.

**Preview thumbnails on category buttons**: every `hp-cat-btn` shows **up to 3 images** in a fanned, negative-margin stack (`.hp-cat-thumbs img { width:30px;height:30px;margin-left:-10px;border:2px solid #fff }`). They are **the first three catalog items of that subtree in catalog (id) order** — verified 55/58 exactly (the 3 mismatches are the Doors/Windows branches, whose items are injected from `doorOptions`/`windowOptions` and therefore not in `HP_BOOT.products`) (OBSERVED: `cat-tree.json` vs `hp-boot.json`).

**Drill-down behaviour** (OBSERVED, `deobf/hp-panels.deobf.js` @ `.hp-drill` handler):

| Action | Effect |
|---|---|
| Click a `.hp-cat-btn` with a child `<ul>` | push `{ul, label}` onto a frame stack; `lazyLoadInstance.update()`; focus first child |
| `hp-path` class | all ancestor `<ul>`s stay `display:block` but their non-path `<li>` and `.hp-cat-btn` are hidden |
| `hp-current` class | the active `<ul>` becomes `display:flex` (categories) or `display:grid` 3 columns (items) with `hp-pop .14s` |
| Breadcrumbs | rebuilt as buttons + `chevron_right` separators, first crumb `cat.all`; a `.hp-crumb-back` chevron button pops a frame; the last crumb gets `aria-current="page"` |
| `.hp-drill-nested` | class toggled on `.hp-drill` when depth > 1 (drives the `.hp-cat-thumbs` "same-preview" collapse in CSS) |
| Empty `<ul>` | receives `data-empty="Nothing here yet"` and `.hp-empty-list`; CSS injects the label via `::after { content: attr(data-empty) }` |
| Keyboard | delegated `keydown` on the drawer: `Enter`/`Space` on `.hp-item > a, .hp-results a, .hp-recent-list a` calls `.click()` |

### 2.3 Search: endpoint, parameters, debounce, ranking, cap

**OBSERVED** (`deobf/hp-panels.deobf.js` @ `_0x5eddde`, `probe*/`, `search-*.html`, `hp-i18n-app.json`).

Request (page: `_0x5eddde(inputId, resultsId, paramName)`):

```
POST /parsers/search.php
Content-Type: application/x-www-form-urlencoded
body: search_term=<query>&lang=<current UI lang>          (Objects tab, #autocomplete-input → #search_results)
      search_term2=<query>&lang=<current UI lang>         (Textures tab, #autocomplete-input2 → #search_results2)
```

- **Parameter is `search_term` for objects and `search_term2` for textures**; a missing/unknown parameter returns a **1-byte response** (`200`, body `\x0a`) — the server never errors. Adding `limit`, `count`, `offset`, `page`, `start`, `n`, `numrows` changes nothing: **the cap is fixed server-side at 20**.
- **Minimum query length 2** (checked client-side; a 1-char query also returns 1 byte server-side). Below 2 chars the UI shows `cat.minChars` ("Type at least 2 characters"). Whitespace-only queries are trimmed and treated as empty.
- **Debounce = 220 ms** (`setTimeout(..., 0xdc)` on `input`), plus immediate execution on `change`, on `Enter`, and on clear (the clear button or `Escape` inside the field).
- **Race guard**: a monotonically increasing sequence number is captured per request; responses are applied only when `seq === latest` (also used for the error path).
- Response is **raw HTML fragments** (not JSON): `<a class=" w3-col s4 w3-center" draggable="true" id="item_s<ID>"><img src="/admin/imagedetails/…" style="width:100%" …><div class="w3-small"><b>Title</b></div></a>` for objects, and `<a class=" w3-col s4" id="texture_s<ID>" title="…"><img src=… alt=…></a>` for textures. The client injects it with `innerHTML`, then rewrites each `<a>` to `role="button" tabindex="0"`, **removes its `class`**, and rewrites each `<img>` to `loading="lazy"` after **removing both `class` and `style`** — i.e. the endpoint's Bootstrap `w3-*` classes are deliberately discarded and re-skinned by `hp-results` CSS.
- **Ranking**: results come back in **ascending id order**, which is catalog-insertion order — verified byte-for-byte for every probe (`sofa`→4,11,34…; `bed`→2,30,76…; `black`→7,10,15…; `the`→4,10,49…; `table lamp`→35,68,120…). There is **no relevance, popularity, recency or personalisation signal**. Same for textures (`brick`→3,12,24…) and across `lang=de`/`pt`/`es`.
- **Matching rule (INFERRED from 20+ probes, 100 % consistent)**: for the Objects endpoint, `WHERE lower(localized_title) LIKE '%<query>%'` over the union of `objectOptions` ∪ `doorOptions` ∪ `windowOptions`, ordered by product id, `LIMIT 20`. Confirmed by exhaustive prediction against all 1 882 titles: `tufted`→11, `table lamp`→9, `sofa`→65, `the`→20 hits, and non-matches `couch`/`settee`/`"red sofa"`/`"so fa"`/`so%`/`100` → 0. Queries are matched against **the localized title of the requested `lang`** (the Spanish/Portuguese/German pages return translated titles), so the shipped `HP_BOOT.tokens` / `slug` fields are **not** used by this endpoint.
- **No fuzzy/prefix/synonym behaviour**: `"so"` matches by substring (99 candidates, first 20 shown), `"s"` does not (1-char). Spaces are literal, so multi-word queries only match contiguous substrings. Searching `"tisch"` with `lang=en` → 0; with `lang=de` → 13. Search `"Holzschrank"` `lang=de` → 2 (`Glänzender Holzschrank mit Spiegel`, `Kirschholzschrank mit Schublade`) while `lang=en` → 0.
- Texts of the states (OBSERVED `hp-i18n-app.json`): `cat.searching` "Searching…" (into an `aria-live="polite"` `.hp-results-status` element), `cat.noResults` "No results for “{q}”", `cat.searchFailed` "The search failed. Check your connection and try again.", `cat.minChars`. The pane gets `.hp-searching`, which **hides breadcrumbs, the drill tree and the recent strip** and shows `.hp-results` as a **3-column grid with the same card skin as the tree**.
- **The server ignores the per-item `tokens`/`slug` index that ships with every item — only the AI-placement module touches it, and only as an unreachable fallback.** Each `objectOptions` entry carries `slug` (e.g. `kingbedwithpanelledheadboard`) and a pre-split `tokens` array (`["king","bed","with","panelled","headboard"]`): **70 964 B for `tokens` + 40 196 B for `slug` = ~111 KB**. `hp-ai-place.js` is the *only* consumer in any shipped module (verified by grepping all 40 modules for the literals), and it reads them only as the *last* alternatives in a display-name fallback chain `title_en || title || slug.replace(/-_/g,' ') || tokens.join(' ')` for naming a model it is about to place — and since **all 1 776 `objectOptions` entries have both `title` and `title_en` (0 exceptions)**, the `slug`/`tokens` branches are unreachable. A spot-check of the first 400 items shows `tokens` equals `split(normalize(title_en))` exactly (0 mismatches), so it is 100 % derivable anyway. **INFERRED**: the payload was clearly designed for a token index (AND-of-tokens would give far better recall — `"bed wooden"` → **6 hits as AND-of-tokens vs 0 as a contiguous substring**, `"king headboard"` → 1 vs 0), but the `search.php` endpoint never uses it. (Note: `hp-ai-place.js` is an AI-assisted placement module; I read its code as data but never invoked any AI feature.)
- No `datalist`/typeahead is wired: `HP_BOOT.suggestions` (1 877 object titles + 456 texture titles) exists in the payload and *is* passed to `HPCatalog.setSuggestions`, but the method is an empty stub (2.3b).

### 2.3b Autocomplete suggestions: the plumbing exists but the hook is an empty stub

**OBSERVED** (`deobf/hp-editor-tail.deobf.js`, `deobf/hp-panels.deobf.js`, `modules/hp-panels.js`, `hp-boot.json`).

- `HP_BOOT.suggestions` ships **1 877 object titles + 456 texture titles** in the page payload, and `hp-editor-tail.js` *does* wire it on `DOMContentLoaded`:
  `window.HPCatalog && HPCatalog.setSuggestions(HP_BOOT.suggestions.objects, HP_BOOT.suggestions.textures)`.
- But in `hp-panels.js` the `HPCatalog` object literal ends with `{'open':…, 'close':…, 'isOpen':…, 'toggle':…, 'showTab':…, 'setSuggestions':function(){}}` — the exported method is a **`function(){}` no-op** that ignores both arguments.
- **INFERRED**: autocomplete/typeahead was planned (the payload is generated and the call site written) but never implemented; it is dead weight of roughly **90 KB of duplicated titles** in every page load. There is no `<datalist>` in the markup either.

### 2.4 Thumbnails and lazy loading

**OBSERVED** (`catalog-aside.html`, `css/hp-panels.css`, `deobf/hp-editor-tail.deobf.js`, `deobf/hp-panels.deobf.js`, `modules/hp-panels.js`, curl samples).

- Library: **`vanilla-lazyload@17.8.4`** from `cdn.jsdelivr.net`; the page sets `window.lazyLoadOptions = {}` (pure defaults) and grabs the instance from the `LazyLoad::Initialized` event into `window.lazyLoadInstance`.
- Every catalog image is `<img src="textures/loading.gif" data-src="/admin/imagedetails/<hash>.png" class="lazy" alt="">` — a hard-coded **2 993-byte GIF placeholder**, with a **relative, page-absolute path** (no CDN, same origin, served by Cloudflare with `last-modified` dates from 2023-04).
- **There is a second, independent warm-up pass**: on `DOMContentLoaded` the page counts `document.images`, then creates `new Image()` per element and preloads **`img.src`** (i.e. the placeholder, not `data-src`) just to drive a `#progstat` percentage counter — so the "loading" bar never actually measures the real thumbnails (OBSERVED `deobf/hp-editor-tail.deobf.js`).
- **`lazyLoadInstance.update()` is called on every drill-down** and on `hp:tab`, which is what makes newly revealed off-screen thumbnails load. Recents images bypass lazy loading: the recent-list builder copies `img.getAttribute('data-src') || img.src` straight into a fresh `<img>` with **no `loading` attribute at all**.
- Format/size survey (decoded dimensions of a random sample in `thumbs/`, plus `hp-boot.json`): the drawer's 2 592 `<img>` **tags** resolve to **2 338 distinct files**; the 2 336 *catalog* thumbs are **1 869 PNG / 13 JPG** and the 456 texture thumbs are **403 JPG / 53 PNG**. Object thumbs live in `/admin/imagedetails/` and are typically **4–45 KB**, with inconsistent pixel sizes — `640×480`, `640×640`, `500×500` all appear in the sample — and CSS forces `width:100%; aspect-ratio:1; object-fit:contain` (or `cover` for textures), so the browser letterboxes whatever arrives. **No `srcset`, no `_1K_/_2K_` variants for object thumbs, no WebP/AVIF.**
- Texture thumbnails are the **full-resolution PBR colour maps** (`/admin/imagetextures/…_1K_Color.jpg`, 333 are `_1K_`, 95 `_2K_`, 3 `_4K_`, 25 untagged): measured samples are **352 KB and 441 KB at 2048×2048** for a 90-pixel grid cell — the app downloads the real material to draw the swatch. `HP_BOOT.floorplanTextureCatalog` also carries `imagebump` (the normal map) but the catalog never requests it.
- **Duplicate tags**: 2 592 `<img>` tags point at **2 338 unique files** — 2 126 files are referenced once, 170 twice and **42 three times**, giving exactly **254 redundant tags**. The 170 "twice" files are the `hp-cat-thumbs` previews that are *also* the item's own thumbnail (previews are re-used, not re-hosted); the 42 "thrice" files are 14 triples that are simultaneously the level-1 preview, the level-2 child's preview and the item thumbnail (e.g. `ix7framwe.png`, `vdqaquarium.png`, `wgcaquarium.png`), which happens whenever a parent's first three subtree items all sit in the same first child. The HTTP cache absorbs the requests, but the document still parses 254 extra `<img>` elements — measured at **~26 KB of redundant markup** (254 tags × 103 B average).

### 2.5 Favourites, recents and persistence

**OBSERVED** (`deobf/hp-editor.deobf.js` @ `_0x147a48`, `deobf/hp-panels.deobf.js` @ `_0x5125dc`, `css/hp-panels.css`, `strings/*.txt`, `hp-i18n-app.json`).

- **No favourites / bookmark / star / wishlist feature exists.** No `favorite`, `bookmark`, `star`, `heart` or `wishlist` key, class, attribute or i18n string appears in the catalog path (the only `favorite` hit is a Material Icons glyph name in `hp-donate.js`'s donate button; `heart` in the 2D palette is a *decor item* called "Heart"). The catalog is a pure picker.
- **Recents: `localStorage["hp-catalog-recent"]`**, a JSON array of **id strings** (not objects).

| Aspect | Behaviour (OBSERVED) |
|---|---|
| Write trigger | Only when a catalog item is **actually placed** into the scene (inside the `SceneLoader.ImportMesh` success callback) — not on click/hover. Products placed via the 2D planner bridge do not write it. |
| Eviction | The placed id is filtered out, `unshift`ed to the front, then `slice(0, 12)` — **latest-first, deduped, 12 stored**. |
| Read/render | A `.hp-recent` block (`<p class="hp-recent-title">` + `<ul class="hp-recent-list">`) is built **once per pane** and inserted *before* `.hp-drill`; it reads the array, slices to the **first 8**, looks up `document.getElementById('item'+id)` in the already-rendered tree, and clones that anchor's title and thumbnail into a new `<a id="item_r<id>" draggable="true" role="button" tabindex="0">`. |
| Live update | `window.dispatchEvent(new CustomEvent('hp-catalog-recent'))` after each write; the drawer listens and re-renders instantly (no reload). |
| Visibility | Hidden entirely when empty (`hidden` attr), hidden while a search is active (`.hp-catalog-pane.hp-searching .hp-recent`), and hidden when drilled deeper than the root (`.hp-recent-off` toggled when frame depth > 1). |
| Layout | 4-column grid (`repeat(4, minmax(0,1fr))`), 6 px gap, square `object-fit: contain` images — so 8 recents = 2 rows above the tree. |
| Robustness | Missing/renamed ids are skipped silently; parsing is wrapped in `try/catch`. |

- Other catalog-adjacent persistence in the same drawer: `hp-mat-collapsed` (material panel state) and `#autocomplete-input`'s **active tab is not persisted** (`data-hp-tabs` resets to `tab1`).
- Full storage surface I could enumerate from shipped sources (for the schema/compare work): `hp-catalog-recent`, `hp-ai-model`, `hp-bim-autosave`, `hp-bim-cls:`, `hp-mat-collapsed`, `hp-lang`, `hp-units`, `hp-tools-collapsed`, `hp-start-dismissed`, `hp-wallbuilder-opts`, plus `fp-help-seen` and the 2D planner's `extension-floorplanner-{settings,history,floorplans,current-filename,currently-editing,palette-group}`.

### 2.6 The 2D planner iframe (`2D-Planner/index.php`) — a *different* catalog

**OBSERVED** (`twod-2D-Planner_index.php`, `planner-modules/objectCatalog.js`, `deobf/objectCatalog.deobf.js`, `deobf/objectPalette.deobf.js`, `planner-i18n.json`).

This is a genuinely separate implementation, and it is the more interesting one for UI ideas:

- **Its own taxonomy**, not the server's 13/58: `GROUPS` = 5 tabs (`living`, `kitchen`, `bathroom`, `laundry`, `technic`) → **45 sub-sections** → **271 curated items**, each with `label`, `icon` (emoji), default size `w`×`d` in cm, search `kw` keywords, `alias` synonyms (Portuguese/Spanish accents visible: `sofá`, `faca`, `tábua`, `geladeira`), `ex` exclusion keywords, and a `wall` snap flag. `dbCategory` links each group to a server category id.
- **The entire catalog is client-side** (`objectCatalog.js` ships a hardcoded array). No search request at all.
- **Search is a real relevance scorer** (`searchItems`): normalise (lowercase, NFD strip diacritics, `&amp;`→`&`, non-alphanumerics→space); if the query is non-empty, split on spaces and require **every** term to be present in the concatenation of `label + label_en + id-with-separators-as-spaces + sub.title(_en) + group.title(_en) + kw + alias`; hidden items are always dropped. A **separate** model-scoring path (`matchModels`, used to attach real GLB products to palette symbols) is a weighted ranker: exact keyword 300, whole-word 200, `kw`-substring 80, **+1000 for a category match**, disqualification via `ex` exclusion, ties broken by `localeCompare(title)` then id — a much better ranking model than the server's `LIMIT 20 ORDER BY id`.
- **Interaction**: flat, filterable, all-at-once (no drill-down). Group tabs filter by `data-fp-group` and toggle `aria-selected`; the search input filters `style.display` on `button[data-fp-type]`, hides empty sections, and shows a `palette.noMatch` ("No item matches this search.") paragraph when nothing matches. The active group is persisted under `localStorage["extension-floorplanner-palette-group"]`.
- **Progressive disclosure**: each section can lazily fetch `../parsers/objects_catalog.php` (JSON: `{lang, categories[157], products[1776]}`, 490 KB) and open a **"library" sub-panel** listing *real 3D models* grouped by DB category with `palette.modelsOf`/`palette.libraryHint` copy and a "Back" button — i.e. the 2D tool can place a *specific* model, not just a generic symbol.
- Its thumbnails are **SVG symbols drawn on the fly** from `symbols.js` (`parts`/`box`/`path`, `viewBox` fitted with 6 % padding) — no raster thumbnails at all for the palette itself; the library panel uses `<img loading="lazy">` on `/admin/imagedetails/…`.
- Vendor copy confirms the coupling: *"Categories follow the 3D library. Symbols are drawn at real size; the small triangle on a selected object marks its front, which is the side the 3D model faces."* (`palette.note`, OBSERVED in the page i18n JSON).

### 2.7 Accessibility and keyboard model

**OBSERVED** (`catalog-aside.html`, `css/hp-panels.css`, `deobf/hp-panels.deobf.js`).

- Drawer: `aria-hidden` toggled true/false; `aria-label="Catalog"`; tabs are `role="tab"`-ish buttons (`role="tablist"`… via `HPUI.tabs`) but **the panes have no `role="tabpanel"` / `aria-controls`**; the drawer is **not** `role="dialog"` and has **no focus trap** — `HPUI.isolateKeys(el)` is applied to the drawer (the `strings/hp-ui.txt:81` key) to keep editor shortcuts from firing while it is open.
- All 2 338 `item*`/`texture*` anchors get `role="button" tabindex="0" draggable="true"`; category lists use `<ul>/<li>` with `<button>`s, but **`role="list"`/`role="listitem"` are absent** and group headers are `role="presentation"`, so a screen reader gets 1 882 buttons in document order with no list boundaries and no grouping announcement for the 64 section titles.
- **The results status is the only `aria-live` region** (built dynamically with `aria-live="polite"`); the pre-rendered tree has none, and neither does the recent strip.
- Keyboard: `Enter`/`Space` activate items (delegated handler); `Escape` closes the drawer or clears the search field; Tab order follows DOM order (crumbs → back button → categories/items); images are `alt=""` (decorative) with the name carried by `title` + `.hp-item-title`, so accessible names come from the anchor text/title.
- Missing on the server-rendered tree: `aria-expanded`/`aria-controls` on category buttons (they never appear), `aria-current` is only set on the active breadcrumb, and there is **no count announcement** when search results change other than the polite status text.

### 2.8 Payload accounting and performance characteristics

**OBSERVED** (measured: `editor-app.php.html`, `catalog-aside.html`, `hp-boot.json`).

Byte budget of the shipped editor document (**2 092 041 B**):

| Slice | Bytes | Share |
|---|---:|---:|
| `<aside id="mySidebar">` (the whole drawer, both tabs) | 740 930 | 35.4 % |
| `window.HP_BOOT` JSON | 1 199 962 | 57.4 % |
| everything else (Babylon scripts, dialogs, CSS links, i18n) | ≈154 000 | 7.4 % |

The drawer breaks down as 58 `hp-cat-btn` + 28 texture `hp-cat-btn` + 1 882 item anchors + 456 texture anchors + **2 592 `<img>` tags** (all with `src="textures/loading.gif"`). Of the 2 592 tags, 254 are `hp-cat-thumbs` previews, and 212 files are referenced more than once (170 twice + 42 thrice), so **the markup carries exactly 254 redundant `<img>` elements for 2 338 unique files**.

`HP_BOOT` is itself 35 % redundant or dead weight:

| Key | Bytes | Share of HP_BOOT | Verdict |
|---|---:|---:|---|
| `objectOptions` | 655 023 | 54.6 % | needed (the source of truth) |
| `products` | 246 520 | 20.5 % | **100 % derivable** — `products[k].model` equals `objectOptions[k].path` for all 1 882 entries |
| `textures` | 130 665 | 10.9 % | **100 % derivable** — `textures[k].image` equals `floorplanTextureCatalog[k].image` for all 456 entries |
| `floorplanTextureCatalog` | 121 587 | 10.1 % | needed |
| `suggestions` | 69 567 | 5.8 % | **dead** — `setSuggestions` is an empty stub (2.3b) |
| `tokens` inside `objectOptions` | 70 964 | 5.9 % | **effectively dead + derivable** — read only by `hp-ai-place.js` as an unreachable fallback; equals `split(title_en)` |
| `slug` inside `objectOptions` | 40 196 | 3.4 % | **effectively dead + derivable** — same, one branch earlier in the fallback chain |
| `doorOptions`+`windowOptions`+`objectCategories` | 38 500 | 3.2 % | needed |

**INFERRED**: de-duplicating the two lookup maps and dropping `suggestions`, `tokens` and `slug` would cut **≈558 KB (47 %) of the JSON and ≈27 % of the whole document** with no behaviour change, and would shrink the drawer by the **~26 KB** of preview markup that re-emits the same images at every level (2.4).

Other observations:

- Initial editor HTML is dominated by duplicate data; the `<aside>` alone is ~35 % of the document.
- **Zero extra requests to browse categories** (everything is in the document), and **one request per search** — a deliberate trade (huge first paint, instant navigation) that only works because the catalog is small enough to inline.
- Dominant cost at runtime is **image decoding**, mitigated by vanilla-lazyload defaults plus manual `update()` calls; texture swatches are the worst offender (a 2 048² JPEG for a 90 px cell).
- Search round-trip is a **full HTML fragment**, not a diff — 20 cards ≈ 5.7 KB, but the 1-byte failure body means a wrong parameter name fails silently and looks like "no results".
- **INFERRED**: because the endpoint both filters and renders Bootstrap classes that the client immediately strips, the server is doing presentation work twice; and because `ORDER BY id` is applied before `LIMIT 20`, a common word like `the` shows the 20 *oldest* catalog entries rather than the 20 best.

### 2.9 Round-1 "Unknowns" closed (and what remains)

| Round-1 unknown (05-05) | Status in this round |
|---|---|
| What the drawer UI is really like (tabs, tree, drill-down) | **Closed** — see 2.1/2.2 (server-rendered 2-level tree, drill-down frames, breadcrumbs, 3-thumb previews, group headers). |
| How search is invoked and ranked | **Closed** — see 2.3 (POST `/parsers/search.php`, `search_term`/`search_term2`+`lang`, 220 ms debounce, ≥2 chars, 20-cap, id-ascending, substring-only on localized title). |
| Thumbnail hosting/laziness | **Closed** — see 2.4 (vanilla-lazyload 17.8.4 + `textures/loading.gif`, `/admin/imagedetails` 500–640 px PNG/JPG, full-res `_1K_/_2K_` texture swatches). |
| Whether there are favourites/recents | **Closed** — no favourites; recents = `hp-catalog-recent`, 12 stored/8 shown, id-strings, place-triggered (2.5). |
| Whether the 2D planner shares the catalog | **Closed** — it does *not*; it ships its own 5×45×271 curated taxonomy with a client-side relevance scorer and an optional JSON model library (2.6). |
| Exact server ranking SQL / index | Still **INFERRED** (behavioural black box): results are fully explained by `LIKE '%q%'` on the localized title + order by id + limit 20, but I never saw the PHP. |
| Whether other endpoints (e.g. `suggest.php`) exist | **Not found** — no other catalog endpoint is referenced by any shipped module. `HP_BOOT.suggestions` *does* have a consumer (`HPCatalog.setSuggestions`) but it is an empty stub (2.3b). |
| Whether the inline catalog payload is size-efficient | **Closed (new)** — it is not: ≈558 KB (47 %) of `HP_BOOT` and ≈27 % of the whole document is duplicated or dead weight (2.8). |

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each is tied to a finding and, where relevant, to the CasaPlazAI schema (a `FurnitureItem` has only `id/type/roomId/position/rotationDeg/footprint`, with a **7-member type enum** — so any catalog richness has to live outside `FloorplanData`).

| # | Idea | Value / Effort | Tied to |
|---|---|---|---|
| 1 | **Ship a curated client-side catalog with a relevance scorer, not a search endpoint.** CasaPlazAI is backend-less with a *small* palette, so mirror the 2D planner's `searchItems`: normalise (lowercase + NFD diacritic strip + punctuation→space), require every query term, index `label + type + keywords + synonyms + category`. This gives prefix/exact/whole-word tiers (300/200/80 + 1000 for category) instead of 3DHP's `LIKE '%q%' ORDER BY id`. | **High / Low** — a pure function over a static array; ~150 lines; no network. | 2.3 vs 2.6; `FurnitureItem.type` stays the closed 7-enum while keywords/aliases live in the catalog module |
| 2 | **Give the catalog a persisted, per-type favourites AND recents strip.** 3DHP proves the recents pattern is cheap: one `localStorage` array of id strings, dedupe + unshift + cap, a `CustomEvent` for live refresh, 4-column grid above the tree, hidden while searching. Add the **favourites toggle 3DHP lacks** (a `★` on each card) and store it the same way. Use the CasaPlazAI key convention (`casaplaza.catalog.favourites.v1`, `casaplaza.catalog.recents.v1`) and make ids schema-safe strings, never array indices. | **High / Low–Medium** | 2.5; editor-local keys, deliberately out of `FloorplanData` like the underlay key |
| 3 | **Keep the two-level category tree with breadcrumbs and frame-stack drill-down, but add the missing a11y.** 3DHP's model is good (ancestors visible, siblings hidden, `hp-current` on the active list, back chevron + `aria-current="page"`); add `role="list"/"listitem"`, `aria-expanded`/`aria-controls` on category buttons, `role="tabpanel"` + `aria-controls` on panes (3DHP has none), and keep an `aria-live="polite"` result/status line (3DHP's one good a11y move). | **High / Low** | 2.2, 2.7 |
| 4 | **Three-image category previews + an exact subtree count on each category button.** Neither is expensive and both make an all-inline tree scannable: derive the previews from the first N catalog items in a stable order, and count the subtree at build time so the badge can never drift. Do the counting **at build time from the same source of truth as the tree** (3DHP recomputes it in PHP and duplicates the hierarchy in `HP_BOOT`, which is why it needs 3 columns `grand_parent/parent/category` to re-derive). | **Medium / Low** | 2.2 |
| 5 | **Lazy-load every catalog thumbnail with an explicit placeholder and one `update()` per UI change.** Reuse the *pattern* (not the library): `loading="lazy"` + a tiny inline SVG/`data:` placeholder + re-scan on drawer open/tab switch/drill-down. Then **cap texture swatch resolution** — 3DHP ships 2 048² JPEGs for 90 px cells; CasaPlazAI should request a `_256` variant (or generate a canvas-downscaled poster) and `object-fit: cover`. | **Medium / Low** | 2.4 |
| 6 | **Search-state machine worth copying: debounce + monotonic sequence guard + distinct empty states.** 220 ms debounce, ignore stale responses, and three separate messages (`minChars`, `noResults`, `failed`) with a polite live region. Even with idea #1's local search, the debounce + sequence guard is what keeps a fast typist from seeing flicker. | **Medium / Low** | 2.3 |
| 7 | **Do not repeat 3DHP's ranking failure**: never `ORDER BY insertion_id LIMIT n` for a user query. Rank, then cap; surface the total hit count ("67 matches") instead of silently truncating at 20. | **Medium / Low** | 2.3, 2.8 |
| 8 | **A "Browse models" second level.** 3DHP's 2D planner already separates *symbol* (generic, real-size, wall-snap flag) from *specific GLB model* (`objects_catalog.php` library sub-panel). If CasaPlazAI ever grows more than 7 furniture types, keep the schema's `type` enum as the coarse taxonomy and let the catalog offer a per-type model variant list with its own small preview — attribute it entirely outside `FloorplanData`. | **Medium / Medium** | 2.6; `FurnitureItem.type` unchanged, `id` carries the specific variant |
| 9 | **Make the catalogue fit CasaPlazAI's `footprint`.** 3DHP's palette stores `w`×`d` per item in cm and draws "symbols at real size" with a front-direction triangle; CasaPlazAI's `footprint` is `[extentA, extentB]` unrotated, rotated by `rotationDeg`. Pre-populating the palette with per-type default footprints (and a front marker) drops straight into `FurnitureItem` and makes placement/collision checks start from real sizes. | **Medium / Low** | `FurnitureItem.footprint` + `rotationDeg`; 2.6 |
| 10 | **Inline the catalog into the built bundle rather than fetching it.** 3DHP spends 35 % of a 2 MB document on catalog markup and gets instant navigation; CasaPlazAI's single-page bundle can do better by shipping a **data array + a few DOM builders**, so search/drill-down never touches the network and the tree stays virtualisable if the palette grows. | **Medium / Medium** | 2.1, 2.8 |
| 11 | **De-duplicate the shipped catalog payload before it is emitted.** 3DHP ships 1.20 MB of `HP_BOOT` of which 377 KB are two lookup maps fully derivable from the arrays beside them, plus a 70 KB `suggestions` block consumed by an empty stub — measured ≈21 % of the whole document. CasaPlazAI's catalog module should emit **one** canonical array plus index maps built at load time (`new Map(items.map(i=>[i.id,i]))`), and any future payload should be size-checked in CI. | **Medium / Low** — a build-time transform plus a bundle-budget test. | 2.3b, 2.8 |

## 4. Unknowns

- **Server-side SQL and index** behind `/parsers/search.php` — the ranking is fully explained behaviourally (`LIKE '%q%'` on the localized title, `ORDER BY id`, `LIMIT 20`) but not directly observed; the 1-byte empty body also means the failure mode (bad parameter, DB error, no rows) is indistinguishable from the client.
- **Whether `search.php` ever paginates** — no parameter I tried (`limit/count/offset/page/start/n/numrows`) changed the 20-result cap, but a different parameter name (or a POST/GET variant, or a header) is not ruled out.
- **The exact PHP that builds the tree** — I inferred the renderer walks `grand_parent → parent → category` because the rendered nesting and `HP_BOOT`'s scalar columns disagree; the renderer itself was not readable (server-side) and only `objects_catalog.php` (the JSON twin) was fetchable.
- **`HP_BOOT.suggestions` was never implemented** — 1 877 + 456 titles (70 KB) ship in the payload and `hp-editor-tail.js` calls `HPCatalog.setSuggestions(...)` with them, but the exported method is `function(){}` (OBSERVED). I cannot rule out that a deferred/lazy chunk overrides `setSuggestions` at runtime, but no such chunk is referenced by the served page.
- **No live browser click-through of the drawer.** The harness itself works — a robots.txt scenario returns in seconds (`tiny.json`), and a 5-action 2D-planner scenario `scenario-2d-palette.json` **completed all five actions** (`cap-2d.json`, `duration_ms: 399446`) before its final DOM capture exceeded my per-run timeout, which confirms the 2D planner boots and `#extension-floorplanner-energy-search` accepts programmatic input and re-filters. Against `/app.php` (with the `visted=1` cookie), however, three attempts did not reach a captured drawer: the page is 2.09 MB with 46 scripts plus Babylon/Draco, and it gates the UI behind a `#progstat` loading overlay that only clears after a `document.images` preload pass — so I never observed the drawer open/hover/focus states or the `hp-catalog-recent` write with my own eyes. All drawer/search/recents findings above therefore rest on shipped bytes, decoded modules and live HTTP probes rather than a live click-through. An `evaluate`/JS-eval action that could have called `window.HPCatalog.open()` **does not exist** in this `rea` version's schema (`goto/click/fill/press/select_option/check/uncheck/wait_for/request/wait_for_timeout` only); a `mode:'connect'` CDP endpoint would be the way around it.
- **Texture-search ranking** — 20 of 21 `brick` matches returned, ascending id, same rule as objects; but the `search_term2` result body also carries an extra `<a>` wrapper (no `w3-center`/`draggable`), and I did not confirm whether a 4th+ level of category exists behind `/parsers/objects_catalog.php`'s 157 categories.
- **Localization coverage of the search index** — `lang=de` returns German titles and German-language matches; I did not enumerate all 10 advertised languages, so per-language gaps (e.g. a title untranslated in one locale) are untested.
- **No favourite/bookmark feature was found**, but absence of evidence in shipped bytes is not proof that no experimental flag or admin-only surface exists.

## Evidence index

| File | What it is |
|---|---|
| `editor-app.php.html` | `/app.php` fetched with the `visted=1` cookie (2 092 041 B) — the full server-rendered editor |
| `catalog-aside.html` | The 740 930 B `<aside id="mySidebar">` extracted verbatim |
| `cat-tree.json` | Parsed rendered tree: 13 top categories, 58 buttons, 1 882 items, 64 group headers, 3 preview thumbs each |
| `hp-boot.json` | `window.HP_BOOT` parsed (1 199 962 B: 1 776 `objectOptions`, 60 door + 46 window, 157 `objectCategories`, 456 `floorplanTextureCatalog`, the duplicated `products`/`textures` lookup maps, 1 877+456 `suggestions`) |
| `hp-i18n-app.json`, `planner-i18n.json` | The two i18n dictionaries (`cat.*` and `palette.*` strings quoted in the report) |
| `objects_catalog.json` | `/parsers/objects_catalog.php` JSON (490 KB) used by the 2D planner's model library |
| `modules/*.js` | 29 shipped 3D-editor modules (obfuscated) |
| `planner-modules/*.js` | 11 shipped 2D-planner modules (obfuscated) |
| `deobf/*.deobf.js`, `deobf.js`, `dump-strings.js` | Deobfuscated modules (string-table rotation reversed) + the string-table dumper |
| `strings/*.txt` | Index→literal string tables for every module |
| `css/hp-panels.css`, `css/hp-ui.css` | Catalog drawer/card/recents CSS (all quoted rules) |
| `twod-2D-Planner_index.php` | The 2D planner page with its `HP_I18N_DATA["planner"]` payload |
| `search-*.html`, `probe*/` | Raw `/parsers/search.php` responses (objects: `sofa`,`bed`,`chair`,`red`,`the`,`tufted`,…; textures: `brick`,`Holz`,`Ziegelwand`; negative and language probes) |
| `thumbs/`, `thumb-sample.txt`, `tex-sample.txt` | Sampled thumbnails and measured pixel sizes |
| `scenario-catalog.json`, `scenario-catalog-lean.json`, `tiny.json`, `scenario-2d-palette.json`, `scenario-2d-palette-lean.json`, `cap-2d.json` | The `rea` browser scenarios. `tiny.json` (robots.txt) completes in seconds and proves the harness works; `cap-2d.json` is the **partial** 2D-planner observation (all 5 actions succeeded, then the run was cut off during the final DOM capture) — it confirms the palette page boots and the `#extension-floorplanner-energy-search` field accepts input, but carries no DOM snapshot |
| `hpkeys.txt`, `modlist.txt`, `plannermods.txt` | Key/module inventories used for the storage and bundle sweeps |
| `http://www.3dhouseplanner.com/` (landing, `landing.html`) | DOCUMENTED vendor copy (features/FAQ); vendor pages also linked from round-1's report |
| `cap-lean.json`, `cap-2d-lean.json` (0 B / cancelled) | Killed scenario runs — retained only to document that the `/app.php` and lean-2D scenarios exceeded the time budget |
| `probe6/`, `probe5/` | Cross-language search probes: `st2=Holz`/`Ziegelwand`, `obj=Holzschrank`, `obj=Schrank` with `lang=en`/`de` — the evidence for "matching is on the *localized* title, no cross-language fallback" |
