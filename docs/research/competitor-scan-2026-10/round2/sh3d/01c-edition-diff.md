# Sweet Home 3D — Edition Differences (Desktop / Online-JS / Mobile) and the Free Online Demo's Limits

Competitor research for **CasaPlazAI** (single-page web 2D/3D floorplanner, TypeScript + Three.js, no backend, localStorage autosave).
Job folder: `03-01c-feature-inventory-edition-di`. Research date: 2026-10-31. **Round 2** — builds on `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/report.md` (round 1, `01-01-feature-inventory`), whose evidence files are reused read-only.

**Claim tags:** `OBSERVED` = seen directly in the live site / shipped files / a saved evidence file in this or the round-1 folder; `DOCUMENTED` = stated in a vendor page/doc; `INFERRED` = my reasoning from observed facts.

**Question:** feature differences between **desktop**, **online (JS)** and **mobile** editions, including what the **free online demo cannot do**.

Round 1 established the shared feature inventory and the shared data model (§2.1–2.13 of that report). This report therefore focuses on **what differs between the editions**, and closes round 1's relevant unknowns: the live JS edition was never exercised, the JS Viewer/JS Editor were only mentioned, and mobile was described only from marketing copy.

---

## 1. Summary

- **There is one shared engine per platform, not three products.** Sweet Home 3D ships as a Java/Swing **desktop** app (free SourceForge build *and* paid Microsoft/Mac App Store builds), an **HTML5/JS browser editor** ("Sweet Home 3D JS Online"; the same engine ships as a self-hosted **JS Editor** for JSP/PHP servers), a **read-only JS Viewer** embed, and a **paid HTML5/JS mobile app** for iOS/Android — six distributables, two engines. `OBSERVED` + `DOCUMENTED` (download/documentation pages; history 6.4/7.2/5.5; shipped JS).
- **Mobile is literally the same JS engine as Online.** The mobile app is "Developed in HTML5 / JavaScript / WebGL … benefits of the reliability of Sweet Home 3D Online"; it runs **offline and without registration**, is **paid**, and differs mainly in layout and input (adaptive toolbar at the bottom, ☰ menu, long-press = Shift/double-click, two-finger rotate). `DOCUMENTED` (`blog/sweet-home-3d-mobile-app/`).
- **Online is the same engine with capability stubs and a shorter UI.** The minified JS (v7.5.2) registers **157 of the 158 desktop actions** and implements most dialogs, but `JSViewFactory` returns a **no-op stub view** for Page setup, Print preview, Photo, Photos-at-viewpoints and Video, and `null` for the 3D-model import wizard; those actions are then left off both the toolbar and every context menu, so they are **registered but unreachable**. The hosted demo also renders no `new-home`/`open`/`save`/`save-as` buttons (those are enabled by CSS classes for the self-hosted editor build). `OBSERVED` (static analysis of `js/sweethome3d.min.js`).
- **The free online demo cannot: save, import a `.sh3d`, export a `.sh3d`, or run offline.** It loads from `/examples/EmptyHome.sh3x`, shows a browser alert that the design won't be saved, and its controller is `LocalFileHomeController` (new/open/save only). Saving/importing/exporting `.sh3d` is gated behind a **free registration + login** (`403 while requesting` → "User not logged in"). `OBSERVED` (live CDP session + inline bootstrap of `SweetHome3DJSOnline.jsp`).
- **All three editions share the same home model and `.sh3d`/`.sh3x` file format**, and mobile exports `.sh3x` (because it omits the `Home` entry pre-5.3) — so a plan started anywhere can be finished on desktop (including the features the mobile/online builds lack). `DOCUMENTED` (mobile blog; FAQ on SH3D import).

---

## 2. Findings

### 2.1 The edition map — how many builds actually exist

| # | Build | Runtime | Where | Price | Tag |
|---|---|---|---|---|---|
| A | **Desktop, free** | Java/Swing + Java 3D/JOGL | SourceForge: Windows/macOS/Linux installers, Java Web Start, portable 7-zip, executable JAR | Free (GPL-2.0) | `DOCUMENTED` |
| A′ | **Desktop, store** | same | Microsoft Store, Mac App Store, Amazon | Paid | `DOCUMENTED` |
| B | **JS Online (hosted)** | HTML5 Canvas + WebGL, JS | `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` | Free; saving needs free registration | `OBSERVED` |
| C | **JS Editor (self-hosted)** | same engine as B | SourceForge zip + prebuilt JSP and PHP web apps | Free/GPL | `DOCUMENTED` (history 7.2) |
| D | **JS Viewer (embed)** | same 3D canvas, read-only | `SweetHome3DJSViewer-7.5.2.zip` on SourceForge; embedded on vendor pages | Free/GPL | `DOCUMENTED` (download + history 5.5/6.4) |
| E | **Mobile app** | **HTML5/JS/WebGL (same as B)** | Apple App Store, Google Play | **Paid** | `DOCUMENTED` (mobile blog) |

- B, C, D, E are **one JS code base in different wrappers/configuration**; A/A′ are the separate Java code base and the reference implementation. `INFERRED` from the evidence in §2.2–2.4.
- The vendor's own "Online" landing page (EN and DE) calls B a **"Demo version"** and steers to the full download for "over 10,000 3D models, 400 textures"; it also says the desktop app can **import, view 2D/3D, modify and export** homes made online. `OBSERVED` (`raw/online.en.html`, `raw/online.de.html`; text `txt/online.en.txt`, `txt/online.de.txt`).
- There is a fifth not-a-build: **an enterprise/white-label offering** on the same engine ("import your own materials, textures, floor plans, 3D models and branded furniture", "branded catalogues", "extensible plug-in ecosystem"), which the vendor markets to retailers and manufacturers. `OBSERVED` (`raw/enterprise.html`).

### 2.2 Desktop: free SourceForge build vs. paid store build

The **only** functional delta the vendor states is **content + plug-ins**:

- Content bundled: free SourceForge build = **100 pieces of furniture and 26 textures**; paid Windows Store / Mac App Store = **10,836 / 10,894 pieces and 423 textures**; mobile = "10,000+ pieces / 400+ textures". `DOCUMENTED` (`raw/download.en.html`, round-1 `txt/download.en.txt`).
  - Corollary: **the free desktop build is already a "demo" on content**, exactly like the online demo, but it *can* import furniture/texture libraries and plug-ins to grow, which online/mobile cannot. `INFERRED` from §2.5.
- Plug-ins: the store build "allows you to import plug-ins to add functionalities" in contrast to the online version — i.e. plug-ins are a desktop-only capability (store and free desktop alike; the FAQ contrasts them specifically with Online). `DOCUMENTED` (FAQ "What's the advantage of downloading the store version?").
- Everything else (all 158 actions, photo/video rendering, printing, OBJ/SVG/CSV export, model import) is identical between the free and paid desktop builds. `INFERRED` (no other deltas are documented).

A related desktop-only mode: **Sweet Home 2D**, launched with `-Dcom.eteks.sweethome3d.no3D=true`, which drops the 3D view, the 3D-view menu, photo/video creation and single-model import while keeping the 2D plan and library import. `DOCUMENTED` (FAQ).

### 2.3 Online editions — JS Online demo, registered JS Online, JS Editor, JS Viewer

**Boot configuration is visible in the page and is edition-defining.** `SweetHome3DJSOnline.jsp` subclasses the generic engine and passes `applicationParams`; the hosted demo sets:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

`OBSERVED` (inline bootstrap in round-1 `raw/jsapp.html`; confirmed live: `applicationParams` returned exactly this via CDP).

- **Two catalog tiers exist at the same URL base.** `FurnitureCatalog.json` holds **805 models in 12 categories**; `DefaultFurnitureCatalog.json` holds **94 models in 8 categories**. The demo picks the small one for coarse-pointer/small-viewport clients. `OBSERVED` (downloaded both; counted `id#`/`category#` keys). See §2.3.1.
- The generic application class is **`SweetHome3DJSApplication`**; the hosted demo is **`SweetHome3DJSOnlineApplication`**, and the defaults live in `applicationParams`/`configuration`. The same class serves the editor and viewer deployments — that is why the full desktop action enum survives in the bundle even though the demo binds only some of it. `OBSERVED` (live: `application.getVersion()` → `"7.5.2"`; prototype chain `SweetHome3DJSOnlineApplication → SweetHome3DJSApplication`).
- **Recorder/controller layer differs by configuration**, not by separate builds: `SweetHome3DJSApplication.prototype.createHomeController` returns `LocalFileHomeController` when no `readHomeURL` is configured, `HomeController` when `writeHomeEditsURL` is configured (incremental server recording), else `DirectRecordingHomeController`. `OBSERVED` (bundle; live the empty-home demo had exactly `LocalFileHomeController` with methods `newHome/open/save/saveAs/close`).
- **The editor build is switched on by CSS classes on the toolbar element.** `createToolBar` conditionally adds `NEW_HOME`, `OPEN`, `SAVE`, `SAVE_AS` only "if `#home-pane-toolbar` has class `new-home` / `open` / `save` / `save-as`". The hosted demo's toolbar lacks them (live: 29 buttons, none of those), which is why an unregistered user sees no Save at all; the PHP JS-Editor build is documented to add Save/New/Open. `OBSERVED` (bundle) + `DOCUMENTED` (blog 7.2).
- A **service worker** (`/resourceCache.js`, scope `/`) caches resources for offline reuse; `HomeRecorder` also supports **IndexedDB and localStorage** storage and an `AutoRecoveryManager` uses `indexeddb://SweetHome3DJS/Recovery` with `.recovered` keys and a confirmation string "The document wasn't saved during the last edition…". `OBSERVED` (bundle; live localStorage held only `user_pseudo_id` for the unregistered demo).
- The **JS Viewer** is a different *purpose*, not a different feature depth: it renders an existing `.sh3d`/`.sh3x` in a WebGL canvas (no 2D plan editor), with configurable cameras/levels (`camera`, `selectableCameras`, `level`, `selectableLevels`, `activateCameraSwitchKey`) and iOS touch support. `DOCUMENTED` (history 4.4/5.5/6.4/6.5.2).
- The **JS Editor** deploys on JSP or PHP; the JSP variant "records user's modifications in the edited home with an incremental recorder" and is *the* build behind JS Online, while the PHP variant adds **Save** (plus New and Open) to the toolbar. `DOCUMENTED` (history 7.2; blog 7.2: "the PHP version records directly home files on the server when the user clicks on the Save button added to the tools bar of this version … along with New and Open buttons").
- A **SaaS white-label** of the online editor (sweethome3d.online, Cinchéo + eTeks) existed from Oct 2020 but the partnership **stopped on 2023-10-31** "because of a lack of success"; custom versions are by arrangement. `DOCUMENTED` (`raw/blog-online-all-websites.html`).

#### 2.3.1 The demo catalogue is 805 of 1,740 slots — the rest are `ignored`

Analysing `FurnitureCatalog.json` shows **805 real models** and **935 entries of the form `"ignored#N": "true"`**, covering contiguous id ranges 1…1740 with **no gaps**: every id is either shown or explicitly ignored. `OBSERVED`.

- The ignored set is not scattered: whole id ranges are excluded (e.g. 54, 56–60, 101–105, …).
- **`DefaultFurnitureCatalog.json`'s 94 ids are a subset of the online 805** (checked: `pres2 ⊆ pres`, no missing). `OBSERVED`.
- `TexturesCatalog.json` = **389 textures in 9 categories** vs `DefaultTexturesCatalog.json` = **26 in 3 categories**. `OBSERVED`.
- **Interpretation:** `ignored#N` is the vendor's mechanism for shipping a **paid-tier catalogue manifest with the paid items masked** into the free build — the data slot exists, the model record does not. `INFERRED`, consistent with the FAQ's "the store version … includes over 10,000 3D models and 400 textures". This is a directly reusable pattern for CasaPlazAI (see §3).

#### 2.3.2 The exact "missing feature" mechanism: stub views + omitted menu entries

This is the cleanest architectural finding of the round, and it corrects an easy mis-reading of the minified bundle. The online engine registers **157 of 158** actions in `HomePane.createActions`, including `PAGE_SETUP`, `PRINT`, `PRINT_PREVIEW`, `PRINT_TO_PDF`, `CREATE_PHOTO`, `CREATE_PHOTOS_AT_POINTS_OF_VIEW`, `CREATE_VIDEO`, `EXPORT_TO_OBJ`, `EXPORT_TO_SVG`, `EXPORT_TO_CSV`, `IMPORT_FURNITURE`, `IMPORT_TEXTURE`, `IMPORT_FURNITURE_LIBRARY`, `SAVE`, `OPEN`, `NEW_HOME`, `DETACH_3D_VIEW`, … So "is the action declared?" is **not** the test for "does the browser edition support it?" `OBSERVED`.

The real gates are two:

1. **Stub view objects.** `JSViewFactory.prototype.createPageSetupView`, `createPrintPreviewView`, `createPhotoView`, `createPhotosView` and `createVideoView` all `return this.dummyDialogView` (an object whose only method is a no-op `displayView`). `createImportedFurnitureWizardStepsView` returns **`null`**. Everything else — furniture/wall/room/level/polyline/dimension/label/compass/observer-camera/preferences dialogs, texture choice, baseboard choice, **model materials**, and the background-image, imported-**texture** and (non-null) imported-**model** wizards — has a real implementation. `OBSERVED`.
2. **Menu/toolbar membership.** `createToolBar` and `createPopupMenus` explicitly enumerate which actions appear; `PAGE_SETUP`, `PRINT*`, `CREATE_PHOTO(S)`, `CREATE_VIDEO`, `EXPORT_TO_*`, `IMPORT_FURNITURE`, `IMPORT_TEXTURE`, `IMPORT_FURNITURE_LIBRARY`, `IMPORT_TEXTURES_LIBRARY`, `SAVE*`, `NEW_HOME*`, `OPEN`, `CLOSE`, `EXIT`, `HELP`, `DETACH/ATTACH_3D_VIEW`, `MAKE_*_VIEWABLE` are **not added anywhere**. `OBSERVED`.

Consequences worth noting for accuracy:

- `IMPORT_TEXTURE` **is** registered and *is* reachable in the live UI (via the texture dialog), and the imported-texture wizard has a real implementation — the online edition does allow importing **texture images**, it only forbids importing **3D models** and **libraries**. `OBSERVED` + corroborated by the 2021 article ("buttons to manage imported textures", "Texture import wizard"). This refines the plain "no import in Online" summary.
- `JSViewFactory.createModelMaterialsView` is real, so per-material colour/texture editing exists online; `createImportedFurnitureWizardStepsView` being `null` is what makes model import impossible. `OBSERVED`.
- **Toolbar composition is fixed and short** (live and in code, same order): `☰ · [New|Open|Save|Save as] · Aerial · Virtual-visit · Undo · Redo · Delete · Cut(optional) · Copy · Paste · Add-furniture(optional) · Select · Pan(optional) · Walls · Rooms · Polylines · Dimensions · Texts · Magnetism-toggle · Base-plan lock · Flip-H · Flip-V · Text+ · Text− · Bold · Italic · Zoom-in(optional) · Zoom-out(optional) · About · Preferences`. Buttons marked `toolbar-optional` collapse on coarse-pointer/small screens, and `About` is omitted entirely when the ☰ menu exists (touch). `OBSERVED` (code + live DOM).
- **Context menus are state-dependent and short.** In the live empty-home demo the plan menu showed only `Modify compass…`, `Import background image…`, `Add level`, `Add level at same elevation`. The code confirms the catalogue: the full plan menu adds undo/redo/clipboard, select-all, furniture modify/group/align/reset, wall/room/polyline/dimension/label modification, text-style submenu, background-image actions and level actions — but **never** print/photo/video/export/import. `OBSERVED`.
- **One genuine desktop-only action slips through**: `RECOMPUTE_ROOM_POINTS` (the 7.2 "Recompute room points") is in the 158-value enum and is referenced by the enablement logic, but it is **not created by `createActions` and not added to any toolbar or menu**, so `getAction(RECOMPUTE_ROOM_POINTS)` is undefined and the JS editions have no way to invoke it. (The other enum members that are not `HomeView.ActionType` values are `SaveAnswer.*`, `DamagedHomeRecovery.*` and `CollectionEvent.Type.*`, which happen to live in the same numeric run and inflate naive counts — my enum parse gives 164 raw numbers, of which exactly 158 are `HomeView.ActionType`.) `OBSERVED`.

### 2.4 Mobile — same engine, different shell, different content

Source: vendor blog "Introducing the Sweet Home 3D Mobile App" (2023-09-06), `raw/blog-mobile.html`; store listings (current pages are now third-party — see §2.4.1). `DOCUMENTED` unless marked.

- **Platform/engine:** "Developed in HTML5 / JavaScript / WebGL, Sweet Home 3D Mobile App benefits of the reliability of Sweet Home 3D Online"; runs **without an Internet connection and without registering on sweethome3d.com** to save. Requires iOS 11 / Android 7.1. **Paid.**
- **Supported vs. desktop:** "The features proposed by Sweet Home 3D Mobile App are similar to the ones of Sweet Home 3D explained in its user's guide, **except that printing, photo and video creation, plug-ins are not supported**"; the escape hatch is to open the same file on desktop.
- **But mobile > online on two points:** mobile **can import 3D models** ("from a ZIP file containing files at OBJ, DAE or 3DS format", via *Import furniture*) and **can import background images and texture images**; the online demo cannot import models. Mobile also offers **New / Open / Save** buttons and edits **more than one home**, with the current one auto-saved and restored.
- **Catalog:** "contains **800 models** at the moment" — matching the online `FurnitureCatalog.json` (805) rather than the 94-model default, i.e. mobile ships the full free-tier catalogue, and its search/filter is emphasised. `DOCUMENTED` + `OBSERVED` (counts).
- **Layout adapts to device:** phones → toolbar at the **bottom**, catalogue + plan above it in portrait, catalogue + plan + 3D in one row in landscape; tablets → the desktop-like 4-pane arrangement with resizable separators.
- **Toolbar is scrollable** on small screens ("swipe your finger on the toolbar to view the hidden tools"); a ☰ sandwich button at the bottom-left holds less-common actions (alignment, modification dialogs, level management) and its contents **depend on the current selection**.
- **Gestures replacing mouse/keyboard:** long-press ≈ Shift (multi-select, axis-constrained move, selection rectangle, and — with "Selection and editing in 3D view" on — elevation change in 3D, with a **second finger to rotate**); 1-second long touch ≈ double-click (create walls around a room, create a room in a closed surface, create a dimension line along an edge); double tap opens the modification dialog.
- **File I/O via the OS share layer:** Open → Import, Save → Export; exported to the **`SweetHome3D` folder of the iOS Files app** or `Android/data/com.eteks.sweethome3d.mobile/files` on Android, with the **`.sh3x`** extension (no `Home` entry, needed only pre-5.3).
- **Warnings:** slow processors / less memory → don't abuse large 3D model files; small screens may clip modification dialogs (scroll to reach hidden fields).

#### 2.4.1 Store-listing caveat (important, and new since round 1)

The store pages the site links to **no longer resolve to the eTeks app**:

- `https://apps.apple.com/us/app/sweet-home-3d-mobile/id1178963471` (the ID the site links from `download`, `users-guide`, FAQ) now serves **"Sweet Home 3D: Plan Your House", vendor `AI Photo Editor Lab SRL`**. The original eTeks bundle id `com.eteks.sweethome3d.mobile.SweetHome3DMobile` still appears in the page's embedded data, and an **In-App Purchases** section is present. (The page also contains "Free trial: only on selected subscriptions", but that is Apple's generic template string, not evidence about this app specifically.) `OBSERVED` (2026-10-31, `raw/appstore-ios.html`).
- `https://apps.apple.com/us/app/sweet-home-3d/id669289700` (the desktop Mac link) likewise serves **AI Photo Editor Lab SRL**, not eTeks, and again shows an In-App Purchases section. `OBSERVED` (`raw/appstore-mac.html`).
- `https://play.google.com/store/apps/details?id=com.eteks.sweethome3d.mobile` still uses the original package id but the page's developer is **"AI Photo Editor Lab srl"**, an **In-app purchases** section is present, and a user review complains that the mobile app "now charges for trival things like changing wall colour" and about the hard-coded Android export path. `OBSERVED` (`raw/playstore.html`; the quoted complaint is user-generated content and is reported as such, not as vendor fact).
- Historical check: a Wayback snapshot of the same App Store URL from **2024-12-25** carried the eTeks-era description ("Since its launch in 2006, Sweet Home 3D has become a trusted choice for millions worldwide, with over 50 million downloads"), so the listing change happened after that. `OBSERVED` (`raw/wayback-ios-mobile-2024.html`).
- **What this means:** the *behaviour* in §2.4 is the vendor's documented description (blog + guide, 7.5 era). The *current* store listings describe a different, third-party product riding the name and ids, so pricing/IAP claims are **not** reliable descriptions of eTeks' mobile app. `INFERRED` — treat any live store claim as unverified. (Round 1's unknown "mobile could not be inspected" persists, now with a concrete reason.)

### 2.5 Feature matrix (desktop vs. online-JS vs. mobile)

Legend: ✅ present · ❌ absent · ⚠️ present but constrained/different. "Desktop" = free & store builds are identical except content/plug-ins (see §2.2).

| Capability | Desktop (A/A′) | JS Online demo (B) | Mobile (E) | Tag |
|---|---|---|---|---|
| 2D plan editing: walls, rooms, polylines, dimensions, texts, levels | ✅ | ✅ | ✅ | `DOCUMENTED`/`OBSERVED` |
| Furniture placement, modification dialogs, contextual menus | ✅ | ✅ (since JS 6.6.2) | ✅ (☰ menu + double tap) | `DOCUMENTED` |
| Colour / texture / material dialogs incl. RAL palette, texture search, **texture import**, per-material editing | ✅ | ✅ (since 6.6.2; `createTextureChoiceView`/`createModelMaterialsView` are real) | ✅ | `DOCUMENTED` + `OBSERVED` |
| Furniture catalog search + category filter (+ multi-word since 7.3) | ✅ | ✅ | ✅ | `DOCUMENTED` |
| Furniture **list** with columns, sort, totals | ✅ | ✅ (table model with CATALOG_ID, name, size, price incl. VAT columns present in JS) | ✅ | `OBSERVED` (JS `FurnitureTablePanel`) |
| Background image (blueprint) underlay + wizard | ✅ | ✅ | ✅ (imports images) | `DOCUMENTED` |
| Import **3D model** (OBJ/DAE/3DS/ZIP/KMZ) | ✅ | ❌ (`createImportedFurnitureWizardStepsView` returns `null`; action not in any menu) | ✅ (ZIP only) | `OBSERVED` + `DOCUMENTED` |
| Import **texture image** | ✅ | ✅ (texture dialog + real wizard steps view) | ✅ | `OBSERVED` + `DOCUMENTED` |
| Import furniture **library** `.sh3f` / textures `.sh3t` / plug-ins `.sh3p` | ✅ | ❌ | ❌ | `DOCUMENTED` + `OBSERVED` |
| Import/export `.sh3d`/`.sh3x` | ✅ | ❌ unregistered / ✅ registered | ✅ (as `.sh3x`, via Files/share) | `OBSERVED`/`DOCUMENTED` |
| **Save** | ✅ `.sh3d` file | ❌ demo (alert "your design won't be saved"); ✅ once registered (auto-save to server) | ✅ local file, more than one home | `OBSERVED`/`DOCUMENTED` |
| Auto-save / crash recovery | ✅ (recovery interval preference) | ✅ IndexedDB auto-recovery (registered editor build) | ✅ auto-saved + auto-restored | `OBSERVED`/`DOCUMENTED` |
| Export **PNG photo** | ✅ (SunFlow/YafaRay, lenses, quality 0–3, aspect presets) | ❌ (`createPhotoView` → no-op stub) | ❌ | `DOCUMENTED` + `OBSERVED` |
| Export **video** (camera path) | ✅ QuickTime | ❌ (`createVideoView` → no-op stub) | ❌ | same |
| Batch photos at stored points of view | ✅ | ❌ (`createPhotosView` → no-op stub) | ❌ | same |
| Export **OBJ + MTL** (3D view) | ✅ | ❌ | ❌ | `DOCUMENTED` |
| Export **SVG** (plan) | ✅ | ❌ | ❌ | `DOCUMENTED` |
| Export **CSV** (furniture list) | ✅ | ❌ | ❌ | `DOCUMENTED` |
| **Print / Print preview / Print to PDF / Page setup** | ✅ (incl. per-level printing, header/footer variables, 1:N scale) | ❌ (`createPageSetupView`/`createPrintPreviewView` → no-op stubs; actions never placed in toolbar or menus) | ❌ | `OBSERVED` |
| Type exact wall **length/angle** (`Enter` while drawing) | ✅ | ❌ | ❌ | `DOCUMENTED` (guide) |
| **Plug-ins** (.sh3p) | ✅ | ❌ | ❌ | `DOCUMENTED` |
| Text/UI languages | 29 | 22 `localization*.json` bundles shipped; the online landing page offers 19 locales; language switchable in preferences | follows device/app | `DOCUMENTED` + `OBSERVED` |
| Run **offline** | ✅ | ❌ (needs site for first load; service-worker cache only) | ✅ | `DOCUMENTED` |
| Store content (models/textures) | free 100/26 · paid 10,836–10,894/423 | 805/389 live; 94/26 on small touch screens | ~800/…+ | `OBSERVED`/`DOCUMENTED` |
| Multi-level homes, sloping/round walls, baseboards, compass, dimensions in 3D | ✅ | ✅ | ✅ | `DOCUMENTED` |
| Selection & editing **in the 3D view** (7.2) | ✅ | ✅ | ✅ (long-touch + second finger) | `DOCUMENTED` |
| Multi-window / detached 3D view | ✅ | ❌ (`DETACH_3D_VIEW` registered, never placed in a menu) | ❌ | `OBSERVED` |

**Cross-edition note:** online and mobile are best understood as "desktop minus I/O-heavy authoring, plus touch/adaptive shell"; mobile is "online plus model import, image import and local file I/O, minus registration" — i.e. **mobile is the most feature-complete non-desktop edition**. `INFERRED`.

### 2.6 What the free online demo cannot do — exhaustive, with the mechanism

Verified live on 2026-10-31 by driving the real page in an owned headless Chromium (software WebGL via `--use-angle=swiftshader`, CDP `Runtime.evaluate`; see §2.8). The demo was booted then loaded with `viewHome('/examples/EmptyHome.sh3x')`.

1. **It cannot save your design.** The bootstrap calls `viewHome("/examples/EmptyHome.sh3x")` and, only for that URL, shows `alert("Keep in mind that your design won't be saved! If you want to save it, go first to Online page and register for free. ")`. `OBSERVED` (inline script, `raw/jsapp.html`).
2. **It cannot import or export a `.sh3d` file.** Those are the `AppletApplication.IMPORT_FROM_SH3D` / `EXPORT_TO_SH3D` actions; the FAQ says "Importing and exporting services are available only to the users who are registered and logged in" (since 4.4). The bootstrap's `homeError` handler maps a **`403 while requesting`** error to the message **"User not logged in. Please log in to continue your design."** and a `404` to "This home doesn't exist." `DOCUMENTED` (FAQ) + `OBSERVED`.
3. **It cannot import 3D models.** Confirmed three ways: the guide's caveat ("feature not available in Online version"); `JSViewFactory.prototype.createImportedFurnitureWizardStepsView` **returns `null`** (so there is literally no view to show); and `IMPORT_FURNITURE` / `IMPORT_FURNITURE_LIBRARY` / `IMPORT_TEXTURES_LIBRARY` are added to no toolbar or context menu. The online page's dialog templates cover `home-furniture`, `wall`, `room`, `level`, `observer-camera`, `home-3Dattributes`, `compass`, `polyline`, `dimension-line`, `label`, `user-preferences` — and of the model-import wizard only a single leftover key survives (`ImportedFurnitureWizardStepsPanel.keepProportionsCheckBox.text`). The vendor's own 2021 article states it plainly: "It's still not possible to import furniture 3D models, print or compute photos and videos from Sweet Home 3D JS". `OBSERVED` + `DOCUMENTED`. (Importing **texture images** *is* possible — see §2.3.2 — so the restriction is specifically on 3D models and libraries.)
4. **It cannot print** — no Print, Print preview, Print to PDF or Page setup. The guide marks page setup "not available in Online and Mobile versions", `createPageSetupView`/`createPrintPreviewView` return the no-op `dummyDialogView`, and those actions appear in no toolbar or context menu. `OBSERVED` + `DOCUMENTED`.
5. **It cannot create photos or videos.** `createPhotoView`, `createPhotosView` and `createVideoView` all return the no-op `dummyDialogView`; the actions are registered but never surfaced. The only photo-ish leftovers are the action names and a `createPhoto` identifier passed to `createAction`. `OBSERVED`.
6. **It cannot export OBJ, SVG or CSV.** `EXPORT_TO_OBJ`, `EXPORT_TO_SVG` and `EXPORT_TO_CSV` are registered actions with real controller methods, but `createToolBar`/`createPopupMenus` never add them; the online toolbar (below) exposes none of them. `OBSERVED`.
7. **It has no menu bar** — replaced by per-pane contextual menus (right-click / ctrl-click) and the toolbar; all desktop menu items are "reachable … except 3D models importation, as well as photos and videos creation". `DOCUMENTED` + `OBSERVED`.
8. **It cannot type exact wall length/angle** while drawing (`Enter` entry is desktop-only) and cannot use plug-ins. `DOCUMENTED`.
9. **It does not persist anything client-side for an unregistered user** other than an analytics pseudo-id: after loading the empty home, `localStorage` held only `user_pseudo_id`, `sessionStorage` `first_visit_logged`/`ip_address`, and IndexedDB contained only Firebase databases. `OBSERVED`.
10. **It is not the full catalogue.** The demo serves 805/389 models/textures (94/26 on coarse-pointer small screens) against the paid desktop app's >10,000/423; the masked-out items are explicitly `ignored#N` in the manifest. `OBSERVED` (§2.3.1).
11. **It is slow to boot.** Round 1 could not finish a Playwright scenario in 300 s or 900 s; in this round the app needed roughly 20–45 s of wall time before `application` existed and a demo home rendered under software WebGL. `OBSERVED` (round 1 `out-app.json`; this round's `out-cdp*.json`).

**The online toolbar, as actually rendered (empty home, desktop viewport).** `OBSERVED` (live DOM, 29 ids):

`SHOW_APPLICATION_MENU` (☰) · `VIEW_FROM_TOP` · `VIEW_FROM_OBSERVER` · `UNDO` · `REDO` · `DELETE_SELECTION` · `CUT` · `COPY` · `PASTE` · `ADD_HOME_FURNITURE` · `SELECT` · `PAN` · `CREATE_WALLS` · `CREATE_ROOMS` · `CREATE_POLYLINES` · `CREATE_DIMENSION_LINES` · `CREATE_LABELS` · `DISABLE_MAGNETISM` · `LOCK_BASE_PLAN` · `FLIP_HORIZONTALLY` · `FLIP_VERTICALLY` · `INCREASE_TEXT_SIZE` · `DECREASE_TEXT_SIZE` · `TOGGLE_BOLD_STYLE` · `TOGGLE_ITALIC_STYLE` · `ZOOM_IN` · `ZOOM_OUT` · `ABOUT` · `PREFERENCES`.

Notably absent from the toolbar, consistent with §2.6: **no Save, Save as, Open, New, Print, Print preview, Page setup, Export (SVG/OBJ/CSV), Create photo, Create video, Import furniture.** The live DOM marks exactly five buttons `toolbar-optional` — `CUT`, `ADD_HOME_FURNITURE`, `PAN`, `ZOOM_IN`, `ZOOM_OUT` — so those are the ones that collapse on small/coarse-pointer screens; on a 390 px phone viewport the toolbar becomes a horizontally scrollable strip (content ~1,073 px wide) and `ABOUT` is dropped entirely because the ☰ menu exists. `OBSERVED` (code `createToolBar` + live DOM).

**Menu/contextual items actually offered (empty home, faint canvas focus):** `Modify compass…`, `Import background image…`, `Add level`, `Add level at same elevation` — i.e. the contextual menu is **state-dependent and short**. `OBSERVED`. The vendor describes the mobile ☰ menu the same way ("the items that the menu lists depends on the current state and selection of your home plan"). `DOCUMENTED`.

### 2.7 Data model / file interop across editions

- All editions write/read the same **ZIP-based home file**; `.sh3x` is the modern extension, `.sh3d` the legacy one (which additionally contains a `Home` entry, required only before v5.3). `DOCUMENTED` (history 5.3; mobile blog).
- Desktop can import an online-created home and export it back; the FAQ frames this as the migration path. Online **checks which 3D models and textures are available on the server** to shrink the stored home, and rejects homes whose data exceeds the server limit. `DOCUMENTED` (history 4.4).
- The JS engine also abstracts *where* the home lives behind URL prefixes — `indexeddb://…`, `localstorage://…` and server URLs — used by the auto-recovery and browser-storage recorders; the desktop recorder writes to the filesystem. `OBSERVED` (bundle: `IndexedDBURLContent`, `LocalStorageURLContent`, `AutoRecoveryManager`).
- The **mobile `.sh3x` export path is hard-coded** to an app-private folder (`Android/data/com.eteks.sweethome3d.mobile/files`), which users report as a usability problem. `OBSERVED` (Play Store review text) + `DOCUMENTED` (mobile blog).
- Object-model features that are online/mobile-capable but only *exposed* by desktop I/O: levels & elevation, sloping/round walls, baseboards, materials, dimensions, texts, prices/VAT, shelf magnetism. `OBSERVED` (shared `localization.json` keys and the shipped JS implementing them).

### 2.8 Evidence / method (this round)

- **Live JS-edition exercise (new).** An owned headless Chrome 156.0.8078.74 was launched with `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --remote-debugging-port=9487`; `Runtime.evaluate` was used to call the page's **own** JS (`viewHome`, `application.getVersion()`, `applicationParams`, recorder/controller prototypes, storage APIs) and to dump rendered DOM. WebGL reported `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`, so 3D code paths were genuinely available. Raw evidence: `out-cdp1.json`, `out-cdp2.json`, `out-cdpA.json` … `out-cdpM.json`, `steps*.json`, `cdp.py`.
  - Better path than round 1's Playwright attempts: `rea capture-browser-scenario` **does not expose browser launch arguments** in its JSON contract (I probed it: `browser.args`, `launch_args`, `channel`, `environment.user_agent`, … are all `unknown_argument`), so software GL could not be requested there. Driving an owned Chrome over CDP worked. Do **not** assume a shared debugging port: another job in this batch already occupied 9333, and my first session was hijacked by it — use a job-unique port.
  - One earlier attempt was accidentally lost mid-session because of that port collision (the app target was replaced by a parallel job's page); the evidence files above are from the run on port 9487.
- **Static bundle analysis (new).** `js/sweethome3d.min.js` (v7.5.2, 2.6 MB) was parsed for (a) the `HomeView.ActionType` enum (158 values), (b) the actions registered inside `HomePane.prototype.createActions` (157), (c) which actions `createToolBar`/`createPopupMenus` actually place in the UI, and (d) the implementations returned by `JSViewFactory.prototype.create*View` (real class vs `dummyDialogView` vs `null`) and by `LocalFileHomeController`/`HomeController`/`AutoRecoveryManager`. Results in §2.3.2/§2.5/§2.6. Script: inline in this session; reproducible with `grep`/`python3` over the round-1 copy.
- **Catalog manifests (new).** `FurnitureCatalog.json`, `DefaultFurnitureCatalog.json`, `TexturesCatalog.json`, `DefaultTexturesCatalog.json` downloaded from `https://www.sweethome3d.com/libjs/resources/` and counted by key family (`id#`, `ignored#`, `category#`); the directory listing (`raw/libjs-resources-index.html`, 130 files) also shows the per-language catalogue/localization variants the engine loads via `CoreTools.loadResourceBundles("resources/localization", …)`.
- **Vendor pages (new).** `raw/blog-mobile.html`, `raw/blog-online-all-websites.html`, `raw/online-manager.html`, `raw/online.en.html`, `raw/online.de.html`, `raw/register.html`, `raw/online-manager-headless.html`, `raw/enterprise.html`, `raw/documentation.html`, `raw/appstore-ios.html`, `raw/appstore-mac.html`, `raw/playstore.html`, `raw/wayback-ios-mobile-2024.html`; text extractions in `txt/`.
- **Blocked / not done:** SourceForge `SweetHome3DJSViewer-7.5.2.zip` and the JS Editor archives returned 403/Cloudflare interstitials (so the Viewer/Editor internals are **documented only**); no accounts were created, so the **registered** online variant and its home manager were not exercised; mobile apps were not installed.

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranking = value to a no-backend, localStorage-first single-page floorplanner ÷ effort. Each idea is tied to a finding here (and, where relevant, to the CasaPlazAI schema at `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Tied to | Value | Effort |
|---|---|---|---|---|
| 1 | **Ship one engine, many "editions" via a config object.** Sweet Home 3D's real architecture is a single JS app (`SweetHome3DJSApplication`) whose behaviour is decided by `applicationParams`/`configuration` (catalog URLs, `readHomeURL`/`writeHomeEditsURL`, `autoRecoveryDatabase`). CasaPlazAI should express "demo vs. full", "local vs. cloud", "desktop vs. touch" as one typed `AppConfig`, not forks — exactly the online/mobile relationship. | §2.1, §2.3 | High | Low |
| 2 | **A demo mode that is honest, not crippled-at-random.** The demo disables only *persistence and I/O* (no save, no `.sh3d` import/export, no offline) and says so with one clear alert; all authoring stays free. Map to CasaPlazAI: an "unsaved demo" state that still lets every drawing tool work, with a persistent banner and a one-click "keep this plan" that moves it into localStorage. | §2.6(1)(2)(9) | High | Low |
| 3 | **Mask a paid catalogue with explicit `ignored#N` slots, not by deleting records.** This is the single most reusable data-model trick found: the free manifest names 1,740 slot ids, marks 935 `ignored`, and ships 805 models; the default/coarse-pointer manifest is a strict subset (94). CasaPlazAI's palette could keep stable slot ids between demo and full tiers so saved plans never break when a tier changes. | §2.3.1 | High | Low |
| 4 | **Storage abstraction behind URL-like prefixes, with IndexedDB auto-recovery.** The JS engine already treats `indexeddb://…`/`localstorage://…`/server as interchangeable recorder locations and keeps a `.recovered` copy with a confirm-on-next-launch prompt ("wasn't saved during the last edition"). CasaPlazAI autosaves to localStorage — add a second, crash-only IndexedDB recovery slot and a restore prompt; this is a genuinely cross-edition feature in the competitor. | §2.3, §2.7 | High | Medium |
| 5 | **A touch "edition" of the same UI, selected by capability queries.** `matchMedia('(hover: none), (pointer: coarse)')` + a small-viewport check already change the *catalogue* in the live app, and mobile swaps in a bottom scrollable toolbar, a ☰ selection-dependent menu, long-press=Shift, long-press-1s=double-click and two-finger rotation. CasaPlazAI's Plan/3D/Walk single-workspace can gain these mappings cheaply for tablets/phones. | §2.3, §2.4 | High | Medium |
| 6 | **Keep authoring cheap, gate only export.** The cleanest line in the matrix: *editing* is available in all non-desktop editions; *rendering/printing/export* is desktop-only. For CasaPlazAI, make PNG/JPEG export work everywhere (it already does) and consider which of SVG/OBJ/CSV/print are worth a web implementation versus one clear "not in the browser edition" message. | §2.5, §2.6 | Medium | Low |
| 7 | **Make the toolbar set contextual and visibly scrollable.** The live demo exposes 29 ids, exactly five of which (`CUT`, `ADD_HOME_FURNITURE`, `PAN`, `ZOOM_IN`, `ZOOM_OUT`) are marked `toolbar-optional` for small/coarse-pointer screens, `ABOUT` is dropped when the ☰ menu exists, and the contextual menu for an empty home offers just four items. CasaPlazAI's tool card can follow the same rule: primary tools always visible, the rest revealed by selection and overflow. | §2.3.2, §2.6 | Medium | Low |
| 8 | **Exact numeric entry while drawing, web-first.** The desktop build lets you type wall length/angle after `Enter`; the vendor explicitly withholds this from online and mobile. CasaPlazAI's 0.5 m grid (`casaplaza.snap.settings.v1`, deliberately outside `FloorplanData`) makes this *easier* than Sweet Home 3D's free-angle model — offer a type-to-exact-length path plus 15°-style angle snapping while drawing, i.e. turn a competitor gap into a differentiator without touching the interchange schema. | §2.5, §2.6(8) + schema "Out-of-schema editor state" | High | Medium |
| 9 | **One portable project file with a legacy/modern variant rule.** `.sh3x` exists precisely because older desktop builds *required* a `Home` entry; new builds emit the leaner form and keep reading the old. CasaPlazAI already has the right instinct (`schemaVersion` + `migrate()` with `migration-gap`/`future-version` failures) — extend it to whole-file variants: keep the versioned `FloorplanData` payload, and let the container carry the *editor-local, deliberately-out-of-schema* keys (`casaplaza.snap.settings.v1`, the measurement key, `casaplaza.underlay.v1`) as optional sibling sections that older readers may drop by construction. | §2.7 + schema "Out-of-schema editor state" / "Migration hook convention" | Medium | Medium |
| 10 | **Model capability tiers as data, and keep the schema tier-neutral.** Because every Sweet Home 3D edition is one engine, the shared object model must be expressible even where it cannot be authored. CasaPlazAI's `FloorplanData` is already the right shape (openings may be empty, `wallsOverride`/`roofs` optional, `floorTexture` nullable). The additions to plan for are exactly the competitor's cross-edition features: **levels/floorId**, **per-segment wall height** (cf. `wallsOverride`), **roof lean** (cf. `roofs`), and **furniture price/VAT** — each as an optional, additive field registered through `migrate.ts`, never as a breaking edit, with the demo/full palette distinction held outside the geometry schema. | §2.3, §2.5, §2.7 + schema "Top level"/"Room"/"FurnitureItem" | Medium | Medium |
| 11 | **Show the per-level/per-feature "not here" reason inline.** The competitor's mechanism is a `homeError` handler that maps `403` → "not logged in", `404` → "doesn't exist", and an `alert` for the unregistered demo. CasaPlazAI has no backend; still, adopt explicit, specific unavailability messages instead of hiding buttons. | §2.6 | Medium | Low |
| 12 | **Beware names/ids that outlive the vendor.** The App Store ids the site still links to now resolve to a third-party subscription app. For CasaPlazAI, own your file extension, schema id and content hash so a future rename or store change never invalidates user data. | §2.4.1 | Medium | Low |
| 13 | **Ship a read-only viewer variant of the same bundle.** Sweet Home 3D's JS Viewer is a config of the same engine (render a home, choose cameras/levels, no editor). A CasaPlazAI "view only" URL parameter would cost almost nothing on top of the SPA and enables sharing/preview. | §2.3 | Low | Low |
| 14 | **Budget first-load weight explicitly.** This is round 1's cross-cutting point and it is a *consequence* of the single-engine strategy: the hosted app needed tens of seconds even with a warm vendor CDN, and its catalogue manifests alone are 679 KB + 114 KB (vs 128 KB + 58 KB defaults). CasaPlazAI should lazily fetch palette tiers and measure the demo path. | §2.3.1, §2.6(11) | High | Low |

**Cross-cutting takeaways `INFERRED`:** (a) the competitor's edition strategy is **"one engine + configuration + content tier"**, which is directly portable to CasaPlazAI's no-backend SPA; (b) the free/paid line is drawn at **content** (models/textures) and **I/O** (save/import/export/print/render), never at core authoring; (c) the clearest, least-controversial gaps to exploit are the browser edition's missing **exact numeric wall entry**, missing **SVG/OBJ/CSV export**, and absence of any **offline-first project persistence for unregistered users**.

---

## 4. Unknowns

- **No live inspection of SourceForge archives.** `SweetHome3DJSViewer-7.5.2.zip` and the JS Editor JSP/PHP archives returned HTTP 403 / Cloudflare "Just a moment…" interstitials from this network, so the Viewer's and Editor's exact feature sets and configuration knobs are **documented-only** (history + download page). Their READMEs were not read.
- **The registered online variant was not exercised.** No account was created (forbidden), so server-side auto-save, the home manager (create/duplicate/delete/export), the `.sh3d` import/export round trip, the server home-length limit, and the `403/404` error UX are known only from docs and from the error strings in the page's own handler.
- **Mobile was never run.** No device/emulator, no installer; behaviour comes from the vendor's 2023 blog (written for the eTeks app) and the user guide. The store pages that the site links now belong to a different vendor, so current pricing/IAP/feature claims about the mobile app could not be verified.
- **The `DefaultFurnitureCatalog.json` selection rule** is confirmed to trigger on `(hover: none), (pointer: coarse)` **and** `max-width:743px,max-height:511px`, but I did not verify whether it is re-evaluated on resize/rotation after boot (i.e. whether a desktop browser narrowed below the threshold swaps catalogues without reload).
- **`ignored#N` semantics** are my inference from a perfect 1,740-slot partition; the vendor never documents the field. I could not confirm whether ignored slots correspond exactly to the store catalogue's extra models (only that the counts are consistent: 1,740 slots vs "over 10,000" store models, so the store catalogue is clearly not this manifest).
- **The version-7.6.1 gap from round 1 remains.** I found no 7.6.x release notes; SourceForge was inaccessible for file downloads, so any per-edition changes in 7.6.x are unverified, and the shipped JS still reports 7.5.2.
- **Exact tablet layout breakpoints** for the online app (vs. the mobile app's tablet layout) were not measured beyond the phone emulation in §2.6.
- **The relationship between the current third-party store listings and the historical eTeks apps** (rename? acquisition? name-squatting?) is unresolved; I only established that the vendor's own links now land on `AI Photo Editor Lab SRL` pages carrying the original bundle/package ids.
- **No screenshots were analysed** (this model has no image input); all live findings come from DOM/JS state, not pixels.
- **Legal note:** Sweet Home 3D is GPL-2.0 (desktop/JS). No source code, minified code or catalogue record was copied into this report; only behaviour, shipped UI strings, counts and data-model shapes are described. Downloaded manifests and pages exist here solely as evidence.

---

### Evidence index (this job folder)

Round-1 files (`raw/jsapp.html`, `raw/jsapp-rendered.html`, `js/sweethome3d.min.js`, `txt/users-guide.*.txt`, `txt/history.en.txt`, `txt/faq.en.txt`, `txt/download.en.txt`) live under `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/` and were read there, unmodified.

- `report.md` (this file); round-1 report reused read-only at `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/report.md`.
- Vendor pages: `raw/blog-mobile.html`, `raw/blog-online-all-websites.html`, `raw/more-modification-capabilities-in-sweet-home-3d-online.html`, `raw/online-version-sweet-home-3d.html`, `raw/archionline-interview.html`, `raw/blog-7_2b.html`, `raw/online-manager.html`, `raw/online-manager-headless.html`, `raw/online.en.html`, `raw/online.de.html`, `raw/register.html`, `raw/enterprise.html`, `raw/documentation.html`, `raw/sf-viewer-listing.html`.
- Store listings: `raw/appstore-ios.html`, `raw/appstore-mac.html`, `raw/playstore.html`, `raw/wayback-ios-mobile-2024.html`.
- Catalog manifests: `raw/FurnitureCatalog.json` (805 shown / 935 `ignored`), `raw/DefaultFurnitureCatalog.json` (94), `raw/TexturesCatalog.json` (389), `raw/DefaultTexturesCatalog.json` (26).
- Text extractions: `txt/blog-mobile.txt`, `txt/blog-online-all-websites.txt`, `txt/more-modification-capabilities-in-sweet-home-3d-online.txt`, `txt/online-version-sweet-home-3d.txt`, `txt/archionline-interview.txt`, `txt/online-manager.txt`, `txt/online.en.txt`, `txt/online.de.txt`, `txt/documentation.txt`, `txt/enterprise.txt`.
- Live JS-edition CDP evidence: `cdp.py`, `steps1.json`…`stepsM.json`, `out-cdp1.json`, `out-cdp2.json`, `out-cdpA.json`, `out-cdpB.json`, `out-cdpC.json`, `out-cdpD.json`, `out-cdpE.json`, `out-cdpF.json`, `out-cdpG.json`, `out-cdpH.json`, `out-cdpI.json`, `out-cdpJ.json`, `out-cdpK.json`, `out-cdpL.json`, `out-cdpM.json`, `chrome.log`.
