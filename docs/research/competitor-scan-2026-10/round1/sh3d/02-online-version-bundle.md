# Sweet Home 3D — Online / Browser Version ("Sweet Home 3D JS Online")

Reverse-engineering notes prepared for **CasaPlazAI** (single-page web 2D/3D floorplanner, Vite/TypeScript/Three.js-style, no backend, localStorage autosave).

- Job folder: `~/dsh-workspaces/rea-sweethome3d-2026-10/02-02-online-version-bundle`
- Version analysed: **7.5.2** (asset query string `?version=7.5.2`; header comment in `sweethome3d.min.js`)
- Date of capture: 2026-10-31
- Tools: `rea` v6.8.0 (`inspect-web-page`, `capture-web-screenshot`, `capture-browser-scenario`, `analyze-web-bundle`, `list-browser-targets`), `curl`, local Playwright (`playwright-core` shipped with REA)
- No account was created, no form with personal data was submitted, nothing was purchased.
- Licensing note: Sweet Home 3D is GPL-2.0+; the bundles were read only to describe **behaviour, data models and UX patterns in my own words**. No source code was copied into this report or into any CasaPlazAI artefact.

Evidence tags used below:

| Tag | Meaning |
|---|---|
| **OBSERVED** | Seen directly in a fetched file / live page / REA evidence JSON in this job folder |
| **DOCUMENTED** | Stated by the vendor in official site text or manual |
| **INFERRED** | My reasoning from observed facts; not directly proven |

---

## 1. Summary (5 bullets)

- The "Online-Version" is reachable from `https://www.sweethome3d.com/de/online/` (button *Jetzt Demoversion testen*) at **`https://www.sweethome3d.com/SweetHome3DJSOnline.jsp`**, a single vanilla-JS page that hosts a **transpiled port of the Java desktop application** — verified by a `Generated from Java with JSweet 2.0.0-rc1` banner and by preserved `com.eteks.sweethome3d.*` class identities inside `sweethome3d.min.js`. **OBSERVED**
- Architecture is a **two-canvas app**: an HTML/CSS widget layer (`JSViewFactory`, `HomePane`, custom `JSComponent`/`JSDialog`/`JSTreeTable` classes) replacing Swing, a **2D plan canvas** drawn with ported AWT/Java2D (`graphics2d.min.js`, `stroke.min.js`, Batik SVG path parser, triangulator), and a **WebGL canvas** (`#home-3D-view`) using a hand-written `HTMLCanvas3D` renderer plus `gl-matrix` 2.3.2. **OBSERVED**
- Persistence is deliberately **pluggable and layered**: `URLContent` subclasses for `localstorage://` and `indexeddb://` resources, a `HomeRecorder` family (`DirectHomeRecorder`, `IncrementalHomeRecorder`, worker-based writes), an `AutoRecoveryManager` that keeps a "Recovery" object store in IndexedDB, and a **full-`XML`-of-the-home + incremental-edit-queue** save protocol against server JSP endpoints when logged in. **OBSERVED / INFERRED (protocol shape)**
- The home file format is a **ZIP container (`*.sh3x` / `*.sh3d`) holding `Home.xml`**, an explicit, readable, version-tagged scene graph (walls with *start/end wall ids*, rooms, doors/windows, furniture with materials, levels, dimension lines, labels, lights, camera and observer camera, compass). **OBSERVED**
- What a web floorplanner should steal: the **shared-wall graph**, **catalog-as-data with digests and adaptive device tiers**, **room-name/area annotation baked into the room model**, **one typed command/undo pipeline driving both 2D and 3D**, and **explicit edit tracking with an "unsaved changes" guard**. All of these are cheap to copy conceptually and expensive to retrofit later. **INFERRED**

---

## 2. Findings

### 2.1 Entry points and URLs

- German landing page `https://www.sweethome3d.com/de/online/` links the demo button directly to `/SweetHome3DJSOnline.jsp`; a separate *Online-Manager* area `/SweetHome3DOnlineManager.jsp` (301 → `https://www.sweethome3d.com/online-manager/`) is the registered-users back end with `/online/kcauth-login.jsp?register=1` for registration. **OBSERVED** — `online_de2.html`, `SweetHome3DJSOnline.jsp.html`, `SweetHome3DOnlineManager.jsp.html`
- The page self-describes as *"Sweet Home 3D JS Online"*, `softwareVersion 1.0`, `browserRequirements: "Requires JavaScript and WebGL"`, free (`price 0.00`), platform Web/Mobile. **OBSERVED** — JSON-LD `WebApplication` block in `SweetHome3DJSOnline.jsp.html`
- Vendor manual: *"Sweet Home 3D Online … auf jedem Gerät bearbeiten, das WebGL unterstützt"* and *"Die Online-Version hat keine Menüleiste, aber alle Menüpunkte … sind über die Kontextmenüs oder die Werkzeugleiste erreichbar, mit Ausnahme des Imports von 3D-Modellen sowie der Erstellung von Fotos und Videos."* **DOCUMENTED** — `manual_de.html` (German user manual)
- FAQ on the online page: works in Chrome/Firefox/Edge/Safari; **saving requires a free account**; designs can be exported for the desktop version. **DOCUMENTED** — `SweetHome3DJSOnline.jsp.html` (FAQPage JSON-LD)

### 2.2 Architecture: a Java desktop app transpiled to JavaScript

| Fact | Evidence | Tag |
|---|---|---|
| Banner `Generated from Java with JSweet 2.0.0-rc1 - http://www.jsweet.org` present in shipped lib | `bundle/batik-svgpathparser.min.js` | **OBSERVED** |
| JS preserves Java identity: `__class="com.eteks.sweethome3d.model.Home"`, `__interfaces=[…]`, and overload shims named `$com_eteks_sweethome3d_model_HomeRecorder_Type` | `bundle/sweethome3d.min.js` | **OBSERVED** |
| 282 distinct `__class` identities in the main bundle: `…sweethome3d.model` 52, `…sweethome3d.viewcontroller` 219 (incl. 110 `PlanController` inner state classes), `…sweethome3d.io` 9, plus non-namespaced `HomePane` and `JSViewFactory` | `bundle/sweethome3d.min.js` | **OBSERVED** |
| `core.min.js`, `geom.min.js`, `graphics2d.min.js`, `swingundo.min.js`, `stroke.min.js` carry **OpenJDK/Classpath-exception headers** → ports of `java.lang`/`java.awt.geom`/`java.awt.Graphics2D`/`javax.swing.undo` | headers of those files | **OBSERVED** |
| The whole JS toolchain is transpilation of Java, not a rewrite | combination of the above | **INFERRED** |
| Source tree is not on GitHub under `eteks/sweethome3d` (404); distribution is SourceForge | GitHub API search result; vendor links to `sourceforge.net/projects/sweethome3d/` | **OBSERVED** |

The important consequence for CasaPlazAI: Sweet Home 3D paid the price of porting a desktop MVC with controller state machines, `UndoableEdit` infrastructure and a Java model, and got a **shared, well-tested domain core** that renders both 2D and 3D from the same scene graph. CasaPlazAI is already TS-native, so the parity lesson is the *model shape*, not the toolchain.

### 2.3 Rendering: one model, two renderers

**OBSERVED** from `bundle/sweethome3d.min.js` and the page markup:

- **3D**: `function HTMLCanvas3D(canvasOrId, offscreen)` — obtains `canvas.getContext("webgl")`, falls back to `getContext("experimental-webgl")`, and throws `"No WebGL"` if both fail; creates a shader program with attributes `vertexPosition`, `vertexNormal`, `vertexTextureCoord` and uniforms `modelViewTransform`, `projectionTransform`, `planeS`, etc. It maintains `textures[]`, `sharedGeometries[]`, `sceneGeometries[]`, `backgroundGeometries[]`, `lights[]`, `fieldOfView`, `frontClipDistance`, `backClipDistance`, `projectionPolicy`.
- **3D math**: `gl-matrix` 2.3.2 bundled as a separate file (MIT, © Brandon Jones / Colin MacKenzie IV).
- **Scene nodes**: `Object3DBranch` / `Object3DBranchFactory` with concrete `HomePieceOfFurniture3D`, `Wall3D`, `Room3D`, `Label3D`, `DimensionLine3D`, `Polyline3D`, `DirectionalLight3D`, and `Indexed{Geometry,Triangle,Line}Array3D`; `Node3D` progress phases `READING_MODEL / PARSING_MODEL / BUILDING_MODEL / BINDING_MODEL` are reused by the loaders.
- **2D**: `PlanComponent` builds its own `<canvas>` inside the container (or reuses one), tracks `container`/`scrollPane`/`view`, uses `java.awt.BasicStroke`, `java.awt.geom.Ellipse2D.GeneralPath`, `Rectangle2D`, and constants such as `PlanComponent.HIDPI_SCALE_FACTOR = 2`, `MARGIN = 40`, `ALIGNMENT_LINE_OFFSET = 25`, `WALL_POINT`, `FURNITURE_ROTATION_INDICATOR`, `CAMERA_HUMAN_BODY`, `COMPASS_DISC`.
- SVG path support comes from a port of Apache Batik's `SVGPathParser`; polygon triangulation from a `triangulator` port; text/curve stroking from the ported `stroke` module.
- Page markup provides `#home-plan` (2D host), `<canvas id="home-3D-view" tabindex="2">`, `#level-selector`, `#furniture-catalog-list`, `#furniture-view`, splitters `#catalog-furniture-splitter`, `#furniture-plan-splitter`, `#plan-3D-view-splitter`, toolbars `#application-menu-toolbar`, `#home-pane-toolbar`, and ~12 hidden `.dialog-template` blocks (furniture, observer camera, 3D attributes, compass, level, wall, room, user preferences, polyline, dimension line, label).

**INFERRED**: 2D and 3D are two views of one observable model, with a shared selection/controller layer (`View.PointerType.MOUSE`, `PlanController` nested state classes). That is exactly the property CasaPlazAI needs so that "furnish a room", "collision/fit constraints" and "walk through in 3D" operate on one source of truth.

### 2.4 Model and data formats

**Home file = ZIP containing `Home.xml`** — **OBSERVED**, `bundle/Studio.sh3x` (5 415 B) and `bundle/EmptyHome.sh3x` (235 B) are ZIP archives; `unzip` yields `Studio_extracted/Home.xml` (31 077 B).

Root element and attributes (version-tagged, self-describing):

```
<home version='5500' name='...' camera='topCamera' wallHeight='250.0' furnitureSortedProperty='NAME'>
  <property name='Author' value='…'/> …
  <furnitureVisibleProperty name='NAME'/> …
  <environment groundColor='…' skyColor='…' lightColor='…' ceillingLightColor='…'
               photoWidth='…' photoHeight='…' photoAspectRatio='VIEW_3D_RATIO'
               photoQuality='2' videoWidth='…' videoAspectRatio='RATIO_4_3' videoQuality='0' videoFrameRate='25'/>
  <compass x=… y=… diameter=… northDirection=… longitude=… latitude=… timeZone='Europe/Paris'/>
  <observerCamera attribute='observerCamera' lens='PINHOLE' x=… y=… z=… yaw=… pitch=… fieldOfView=…/>
  <camera attribute='topCamera' …/>
  <observerCamera attribute='storedCamera' name='Kitchen' …/>
  <pieceOfFurniture catalogId='eTeks#armchair' name='Armchair' creator='eTeks'
       model='jar:http://…/models/armchair.zip!/armchair.obj' icon='…' x=… y=… angle=…
       width='87.0' depth='92.0' height='87.0' modelSize='104093' dropOnTopElevation='0.37…'>
      <material name='iris' color='FF00376B' shininess='0.0'/>
  </pieceOfFurniture>
  …
</home>
```

Element inventory of the Studio demo (counts): `point` 40, `pieceOfFurniture` 36, `material` 27, `wall` 16, `baseboard` 15, `dimensionLine` 8, `light` 7, `lightSource` 7, `doorOrWindow` 5, `room` 5, `sash` 4, plus single `environment`, `compass`, `camera`, `label`, `textStyle`, `text`. **OBSERVED**

Representative modelled concepts (**OBSERVED** in `Home.xml`):

- **Wall**: `id='wall0' wallAtStart='wall11' wallAtEnd='wall1' xStart/yStart/xEnd/yEnd height thickness pattern topColor rightSideColor leftSideColor` — i.e. a **wall-adjacency graph**, not free line segments. Child `baseboard`s and `sash`es.
- **Room**: `name nameXOffset nameYOffset areaVisible floorColor ceilingColor` + `point` polygon — the room **carries its own label placement, area visibility, floor and ceiling appearance**.
- **Door/Window**: `doorOrWindow catalogId='eTeks#sliderWindow126x200' model='jar:…/sliderWindow126x200.zip!/….obj'` with `width/depth/height` and (in the catalog) `dropOnTopElevation`, `elevation`, `sash` children, `modelRotation`.
- **Dimension line**: `xStart yStart xEnd yEnd offset`.
- **Label**: `x y color` + `textStyle` + `text`.
- **Level**: a `level` element type exists in the schema and `#level-selector` exists in the UI, though the Studio demo is single-level.
- **Catalog reference by id** (`eTeks#bed140x190`) with local model/icon URLs resolved through `jar:…zip!/entry` URIs.

**Catalogs are plain JSON keyed lookups** (**OBSERVED**, `bundle/*Catalog.json`):

- `DefaultFurnitureCatalog.json` — **94** pieces, 8 categories (Bathroom, Bedroom, Doors and windows, Kitchen, Lights, Living room, Miscellaneous, Staircases). Used on touch/small screens.
- `FurnitureCatalog.json` — **805** pieces, 12 categories (adds Characters, Exterior, Office, Vehicles).
- `TexturesCatalog.json` — **389** textures, 9 categories (Fabric, Floor, Miscellaneous, Roof, Rug, Sky, Wall, Wallpaper, Wood).
- Flat parallel fields per entry: `id#N, name#N, tags#N, category#N, icon#N, iconDigest#N, model#N, modelDigest#N, modelSize#N, multiPartModel#N, width#N, depth#N, height#N, movable#N, doorOrWindow#N, creator#N, license#N`, plus optional `dropOnTopElevation`, `elevation`, `shelfElevations`, `lightSourceX/Y/Z`, `modelRotation`. Note the **digests and declared byte sizes per asset**.

**Loading pipeline** (**OBSERVED**): `ModelLoader(modelExtension)` subclasses `OBJLoader` and `DAELoader`; `ZIPTools.getZIP` + `jsZip` unpack `jar:URL!/entry` references; `ModelManager` caches by shape name with special name prefixes (`sweethome3d_window_pane`, `…_window_mirror`, `…_light`, and a set of `…_mannequin_*` body-part prefixes). **INFERRED**: door/window and mannequin-aware rendering keys off those naming conventions.

### 2.5 Persistence, autosave and recovery

**OBSERVED** in `bundle/sweethome3d.min.js`, `bundle/recorderworker.min.js`, `bundle/resourceCache.js`, and the inline script of `SweetHome3DJSOnline.jsp.html`:

- `URLContent` is the central content abstraction, with `URLContent.fromURL()` dispatching on URI prefixes to `LocalStorageURLContent` (`localstorage://…`) or `IndexedDBURLContent` (`indexeddb://…`) or a plain URL; a global registry `URLContent.urlContents` deduplicates instances.
- `SweetHome3DJSApplication.getHomeRecorder()` picks a recorder at runtime from configuration keys:
  - no `readHomeURL` → `HomeRecorder` (local files),
  - `readHomeURL` only → `DirectHomeRecorder` (server read/write; `readHome` appends `&editionId=<id>`),
  - `writeHomeEditsURL` present → `IncrementalHomeRecorder` (initial full read, then **edit-queue writes** via `writeHomeEditsURL`, `checkPoint()` snapshot of known object ids, listener on the `UndoableEditSupport`, and wrap-around of `undoManager.undo/redo` so that undos are themselves stored and scheduled).
- `DirectHomeRecorder.writeHome()` walks the home's contents, collects local/JAR contents, writes the home **into a ZIP blob** (`writeHomeToZip(..., "blob", …)`), then POSTs the blob via `BlobURLContent.writeBlob(writeHomeURL, …)`. Progress callbacks `homeSaved/homeError/progression`.
- `AutoRecoveryManager` derives a base URI `indexeddb://<autoRecoveryDatabase>/<autoRecoveryObjectstore>` (defaults `SweetHome3DJS` / `Recovery`), subclasses `DirectHomeRecorder` with `writeHomeWithWorker: true`, recovers names matching `(.*).recovered`, and deletes a recovered entry 1 s after a home becomes unmodified.
- `recorderworker.min.js` is a separate worker script (it defines its own copy of `URLContent`, `LocalStorageURLContent`, `IndexedDBURLContent`, `ZIPTools`, etc.) — **the ZIP/XML save work runs off the main thread**.
- `resourceCache.js` is a **service worker** that caches `/online/readResource.jsp?…` responses in the Cache Storage bucket `RESOURCE_CACHE`, returning `503 "Offline"` when a fetch fails.
- The page guards navigation: a `beforeunload` listener added after load tests `application.getHomeRecorder().hasEdits(home)` and returns *"Some modifications have not been saved to the server yet. Do you want to leave the page now and lose them?"*; an `unload` listener calls `application.deleteHome(home)`.
- Inline config on the online page sets only catalog URLs, resource base paths and language. Notably `readHomeURL`/`writeHomeURL` are **absent** in the anonymous editor, i.e. the demo uses the local `HomeRecorder` plus IndexedDB auto-recovery; server persistence (server JSP endpoints) is what registration adds. **INFERRED (config keys absent + manual text about server saving)**
- Storage observed for the anonymous demo in the live browser: `localStorage` = `user_pseudo_id`; `sessionStorage` = `first_visit_logged`, `ip_address`; IndexedDB = `firebase-heartbeat-database`, `firebase-installations-database` only; no app home persisted yet. **OBSERVED** — `evidence/inspect-initial.json`, `evidence/inspect-live.json` (usage 8 840 B then 148 647 B after load)

### 2.6 UX patterns worth noting

- **No menu bar** in the web build; everything is toolbar + context menus (**DOCUMENTED**, manual). Toolbar/panes are resizable splitters around four regions: catalog, furniture list, plan, 3D view (**OBSERVED**, markup ids `catalog-furniture-splitter`, `furniture-plan-splitter`, `plan-3D-view-splitter`).
- **Adaptive catalog tiering**: the page chooses `DefaultFurnitureCatalog.json` (94 items) when the pointer is coarse and the viewport is small, else `FurnitureCatalog.json` (805 items). **OBSERVED** — inline script in `SweetHome3DJSOnline.jsp.html`
- **Demo-first onboarding**: 9 example homes (Empty home, Studio, 1/2/3-Bedroom apartment, Bow-window apartment, houses with basement/attic/mezzanine) as thumbnails with a privacy-relevant alert for the empty home: *"Keep in mind that your design won't be saved! If you want to save it, go first to Online page and register for free."* **OBSERVED** — `#demo-choice` markup + `viewHome()` script
- **Post-load housekeeping in the host page**: after `homeLoaded`, the page translates furniture names to the catalog names in the current language, sets the default group name, adds the home, and sets `preferences.setNewRoomFloorColor(0xFF9999A0)`. **OBSERVED** — inline `recorderObserver` in `SweetHome3DJSOnline.jsp.html`
- **Error surfaces mapped to user text**: `"No WebGL"` → *"Sorry, your browser doesn't support WebGL."*; `403 while requesting…` → *"User not logged in. Please log in to continue your design."*; `404 while requesting…` → *"This home doesn't exist."*; otherwise an error string plus `console.error(err.stack)`. Progress overlay `#progressDiv` with `<progress value="0" max="100">` and a label updated by `HomeRecorder.READING_HOME`. **OBSERVED**
- **Preference keys** referenced in code: `gridVisible`, `magnetismEnabled`, `rulersVisible`, `unit`, `newWallThickness`, `newWallHeight`, `newFloorThickness`, `furnitureModelIconSize`, `autoSaveDelayForRecovery`. `PlanComponent` has extensive magnetism/alignment machinery (`MAGNETISM` appears ~76×, `ALIGNMENT_LINE_OFFSET = 25`). **OBSERVED**
- **HiDPI handling** is explicit: `PlanComponent.HIDPI_SCALE_FACTOR = 2`; a `windowResizeListener` calls `revalidate()`; the 2D canvas is sized from `clientWidth/clientHeight`. **OBSERVED**
- Analytics/consent machinery is present but unrelated to the app core: Firebase (`sweet-home-3d-project`), Google Tag Manager `GTM-NZ4MP8HX`, Iubenda consent config per language. **OBSERVED**

### 2.7 What REA itself observed (tooling record)

- `list-browser-targets` at `http://127.0.0.1:9555` (Playwright's `chromium_headless_shell-1243`, Chrome for Testing 153) listed the page target. **OBSERVED** — evidence captured in-session; product/UA logged in `evidence/*.json`
- `inspect-web-page` succeeded twice: 23 scripts, DOM 2 108 nodes, 512 accessibility nodes, console events showing only analytics `fbEvent` logs (`wce_online_tool`, `wce_session_start`, `wce_first_visit`). Its completeness status was `policy_filtered` + `attach_limited`, with script sources deliberately withheld (`source capture was not selected`) — so source text had to be fetched separately. **OBSERVED** — `evidence/inspect-initial.json`, `evidence/inspect-live.json`
- `capture-web-screenshot` produced a 1 600×1 000 PNG (sha256 `ee5501…`) and a second scenario run produced per-step PNGs. **OBSERVED** — `assets/initial-viewport.png`, `evidence/screenshot-initial.json`, `evidence/scenario-studio3-result.json`
- `analyze-web-bundle` returned a usable **partial** result (route inventory of 20 analysed scripts, 888 679 AST nodes, only 1 low-confidence endpoint candidate `lang`, no parse failures) but **both runs ended with `cleanup_incomplete`/`deadlineExpired`** (first at the 120 s per-script deadline, second with a 600 s per-script / 4 GiB heap configuration). **OBSERVED** — `evidence/analyze-web-bundle.json`, `evidence/analyze-web-bundle2.json`
- `analyze-javascript-application` runs on a local directory only; two attempts on this 3 MB bundle set were still working at the time budget cutoff, so no local AST evidence is reported. **OBSERVED** — `evidence/analyze-js-app.err`
- `capture-browser-scenario` in **launch** mode with a role-based locator (`role: link, name: "Studio"`) never completed (824 s partial, no step retained); the successful run used a CSS locator `#demo-choice a:has-text("Studio")` and completed in ~53 s, then failed the click step with `status: "cancelled"`. **OBSERVED** — `evidence/scenario-studio-result.json`, `evidence/scenario-launch2-result.json`, `evidence/scenario-studio3-result.json`
- Connect mode against the manual Chrome on port 9555 consistently failed with `target_unavailable` because headless Chrome replaced its page target between discovery and use. **OBSERVED** — `evidence/scenario-connect-result.json`
- Network noise unrelated to the app: the site's own `md5.js` returns **410** and a Cloudflare beacon is connection-refused in this environment. **OBSERVED** — `evidence/scenario-studio-result.json`

### 2.8 Concrete behaviours a CasaPlazAI feature can map onto

| Sweet Home 3D behaviour | Evidence | CasaPlazAI counterpart |
|---|---|---|
| Wall objects join via `wallAtStart`/`wallAtEnd`; rooms are polygons over points; room carries label offset + area visibility | `Home.xml` | shared walls already exist; room label/area as first-class room fields is new |
| Fasteners (`doorOrWindow`) flagged in the catalog and dropped on walls, `dropOnTopElevation`, `elevation`, `sash` children | `Home.xml`, catalog JSON | door/window placement on walls + fit constraints |
| Catalog entries carry `width/depth/height`, `movable`, `doorOrWindow`, `modelDigest`, `modelSize` | catalog JSON | palette metadata + collision/fit constraints + cache validation |
| `magnetismEnabled`, `gridVisible`, `ALIGNMENT_LINE_OFFSET`, alignment lines | bundle | 0.5 m grid snapping already; alignment guides are a natural upgrade |
| Undoable-edit pipeline shared by 2D and 3D controllers, wrapped so undo/redo are also recorded for server sync | bundle (`swingundo`, `IncrementalHomeRecorder`) | a single typed command bus for drawing, furnishing, measuring |
| "Unsaved changes" guard via `hasEdits` + `beforeunload` | inline script + bundle | localStorage autosave already; a dirty-state guard is cheap |
| Off-thread ZIP/XML serialisation via a worker | `recorderworker.min.js` | export PNG/JPEG off the main thread; save serialisation |
| Service-worker caching of server resources | `resourceCache.js` | offline-first asset caching if CasaPlazAI ever ships a catalog of models |
| Adaptive catalog tiering by pointer/viewport | inline script | keep the small palette on touch, expand on desktop |

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranking: **V** = value for the current single-workspace redesign (1–5), **E** = implementation effort (1 = trivial, 5 = large). Score = V − E.

| # | Idea | Tied to finding | V | E | Notes |
|---|---|---|---|---|---|
| 1 | **Room as a first-class object with label offset + area visibility**, not just a polygon: store `name`, `nameOffset {x,y}`, `areaVisible`, `floorColor`, `ceilingColor`, and derive area from the polygon. Render the label/area in 2D and reuse the same fields for a 3D floor slab. | 2.4 `room` element; 2.6 `setNewRoomFloorColor` | 5 | 1 | One schema change unlocks dimension lines, area readouts and 3D floor tinting without parallel state. |
| 2 | **Command/undo bus as the single write path** for draw-room, place-wall, insert-door, move-furniture, measure. Every mutation goes through one typed command with an inverse; UI and 3D read from the resulting state. | 2.3 `PlanController` states; 2.5 `IncrementalHomeRecorder` wrapping `undoManager.undo/redo` | 5 | 3 | Retrofitting undo later is much more expensive. Also gives free edit-count/dirty-state. |
| 3 | **Dirty-state guard + explicit autosave badge.** Track a monotonic edit counter; show "all changes saved / unsaved"; wire `beforeunload` from the same counter. Keep localStorage autosave, add a "recover unsaved plan?" prompt on next load. | 2.5 `hasEdits`, `beforeunload`, `AutoRecoveryManager` | 4 | 1 | Small, high-perceived-quality win; mirrors the vendor's own wording about losing unsaved work. |
| 4 | **Palette metadata as typed data**, per item: footprint `width × depth`, height, `movable`, `kind: 'door' \| 'window' \| 'furniture'`, model ref, and a digest/size/version. Drive palette rendering, fit/collision tests and cache validation from this single table. | 2.4 catalog JSON (`width#N`, `doorOrWindow#N`, `modelDigest#N`, `modelSize#N`) | 5 | 2 | CasaPlazAI's 8-item palette makes this a one-file refactor now; it scales to many items later. |
| 5 | **Distance/alignment guides while dragging** in addition to 0.5 m grid snap: snap to wall faces, room centres, and other furniture edges, drawing the guide line with the same overlay pass used for dimension lines. | 2.3 `ALIGNMENT_LINE_OFFSET`, `MAGNETISM`, alignment indicators | 4 | 3 | Directly answers "does the sofa fit / is it centred?" pain. |
| 6 | **Doors/windows as wall children with a placement constraint and an elevation/clearance field**, kept distinct from free-standing furniture (a `doorOrWindow` flag rather than a separate collection). | 2.4 `doorOrWindow`, `elevation`, `dropOnTopElevation`, `sash` | 4 | 3 | Keeps one furniture list, one selection model, one inspector. |
| 7 | **Shared-wall graph made explicit for editing**: keep `wallAtStart`/`wallAtEnd`-style links or derive them on the fly, but expose an `areWallsJoined(a,b)` check so room redraws and wall splits cannot silently detach. Surface a join marker in 2D. | 2.4 `wall id/wallAtStart/wallAtEnd`; changelog note about "verbundene Wände trennen" | 4 | 3 | CasaPlazAI advertises shared walls; this hardens them. |
| 8 | **One scene description for 2D and 3D, with an explicit view-state layer** (camera, observer camera, level/section) separate from the plan state, so the 3D walkthrough cannot drift from the plan. | 2.3 `Object3DBranch` graph over the same `Home`; XML `camera`/`observerCamera`/`storedCamera` | 5 | 4 | Architectural, but CasaPlazAI already renders both; this is the prevention of divergence. |
| 9 | **Versioned, self-describing export/import container.** Extend the current PNG/JPEG export with an optional `*.json` (or zip) project file carrying a `version`, `units`, object ids and a per-object type tag; import validates the version and degrades gracefully. | 2.4 `home version='5500'` root attribute | 4 | 2 | Enables sharing/backup without a backend; the version attribute is what makes it safe over time. |
| 10 | **Adaptive palette rendering for touch vs pointer**: keep the full palette on desktop, collapse to a compact/tiered set or larger hit targets when `(pointer: coarse)`. | 2.6 `DefaultFurnitureCatalog` vs `FurnitureCatalog` | 3 | 2 | Matches the single-workspace redesign goal without a second UI. |
| 11 | **Off-main-thread export/serialisation** through a worker (PNG/JPEG encode today, project save later), with progress events. | 2.5 `recorderworker.min.js` | 3 | 3 | Only worth it if export jank is measurable; measure first. |
| 12 | **Error-to-copy mapping**: a single table translating internal failures (no WebGL, quota exceeded, corrupt save, unsupported model) into short user-facing sentences plus a "copy diagnostics" action. | 2.6 `homeError` mapping in the online page | 3 | 1 | Cheap polish; the vendor literally maps `403`/`404` strings to human text. |
| 13 | **Demo/starter-plan chooser** on first run (empty plan + 2–3 small starters) rather than a blank canvas, with an explicit note on whether the plan is persisted. | 2.6 9 demo homes + "your design won't be saved" alert | 3 | 2 | Helps first-run comprehension in the new single-workspace UI. |
| 14 | **Per-asset digest + declared size** in whatever catalog CasaPlazAI grows into, so a cached model can be validated and a corrupt download detected. | 2.4 `modelDigest#N`, `modelSize#N` | 2 | 2 | Low urgency at 8 hard-coded items; cheap insurance when models move to URLs. |
| 15 | **Plan/3D split ratio persistence** and remember last-used pane sizes, snapping toggle and grid visibility across reloads (same tiny preference store as autosave). | 2.6 splitters; preference keys `gridVisible`, `magnetismEnabled`, `rulersVisible` | 3 | 1 | One more key in the existing localStorage blob. |

**Do first (high value, low effort):** 1, 3, 4, 15, 12. Then 2 and 9, which are the structural bets.

Explicitly **not** recommended for CasaPlazAI: imitating the Java-to-JS transpilation, the Swing-shaped dialog-template layer, the `java.awt`-style 2D API, the analytics/consent stack, or server-side incremental edit syncing (CasaPlazAI has no backend by design).

---

## 4. Unknowns / what I could not verify

1. **No complete static-analysis record of the bundle.** `rea analyze-web-bundle` produced a partial result (`completeness.status: "partial"`, 20 scripts parsed) and then failed with `cleanup_incomplete` on both attempts; `rea analyze-javascript-application` had not finished when the budget expired. Exact import graph, route table and AST-level call graph of `sweethome3d.min.js` are therefore not certified. The claims above rest on the minified source text, file headers, the XML/JSON artefacts and the live page, not on a completed REA analysis.
2. **The full online server-side protocol is not observed.** `readHomeURL`, `writeHomeURL`, `readResourceURL`, `writeResourceURL`, `listHomesURL`, `deleteHomeURL`, `writeHomeEditsURL` are config keys consumed by the recorder classes, but the anonymous demo page does not define server endpoints and I did not register or log in, so the real URL shapes, payloads, size limits and the incremental-edit envelope were not captured. Only the recorder behaviour in the shipped JS is documented here.
3. **The 3D editor was not driven past the demo chooser.** Every browser-scenario attempt to click the "Studio" demo link failed (role-locator run never settled; CSS-locator run reported the click step `cancelled`). So I did not obtain a post-load DOM/accessibility snapshot of the editor, did not confirm the live `#home-3D-view` WebGL context strings, did not enumerate the runtime-generated toolbar buttons, and did not record model/texture request counts for a real home. Those are **INFERRED** from markup, class code and file structure only.
4. **The 2D plan canvas contents were not visually inspected.** The model reports no image input, so PNGs (`assets/initial-viewport.png`, scenario screenshots) were retained as artefacts but not read. Visual claims about the plan rendering, magnetism guides and dimension-line styling come from code constants and XML, not from looking at pixels.
5. **`indexeddb://` and `localstorage://` persistence semantics are only partly verified.** The URI scheme, the auto-recovery database/object-store defaults (`SweetHome3DJS` / `Recovery`), the `.recovered` naming pattern and the delete-after-clean logic are in the shipped code, but I never observed a real recovered home in the browser (IndexedDB held only Firebase databases).
6. **The service-worker cache was blocked in every REA/Playwright run** ("Service Worker registration blocked by Playwright"), so `resourceCache.js` behaviour — including the `/online/readResource.jsp` resource URLs it caches — was read from source only, never exercised.
7. **Duplicate/parallel source trees are unresolved.** The vendor changelog mentions classes added for *server, IndexedDB and local storage* and a JSP/PHP deployable editor; I saw only the JSP deployment. Whether the same `sweethome3d.min.js` is reused for the PHP deployment, and how `SweetHome3DJSViewer` differs from the editor, is not established.
8. **Version drift risk.** All observed assets are `?version=7.5.2` (2024). The website's marketing pages carry 2025/2026 dates and the online page's JSON-LD says `dateModified 2025-03-13`; a newer bundle may exist behind a different query string or cache state, and my capture only proves the state visible from this machine at this time.
9. **Mobile/touch behaviour is unverified.** The adaptive catalog branch was read from source; no coarse-pointer device profile or touch interaction was captured.
10. **Licence boundary.** Sweet Home 3D is GPL-2.0+ (or CC-BY for some models); the ideas in section 3 are behaviour-level patterns, not code. Before adopting anything that looks like a verbatim data format (e.g. the `Home.xml` element names), verify whether CasaPlazAI wants compatibility with `.sh3d`/`.sh3x` files at all — compatibility would carry format obligations, whereas "inspired by the model shape" does not.
