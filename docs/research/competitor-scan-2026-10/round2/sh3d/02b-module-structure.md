# Sweet Home 3D (browser edition) — module structure of `sweethome3d.min.js` and companion libs

**Job:** `rea2-sh3d-p1 / 06-02b-online-version-bundle-module` (round 2). Narrow question on top of round 1.
**Question answered here:** *Structure of `sweethome3d.min.js` and companion libs: class inventory, Java-to-JS port pattern, size breakdown per subsystem.*

**App:** Sweet Home 3D, browser edition — `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (also `SweetHome3DJSViewer`, `SweetHome3DJS` editor, same core).
**Licence:** GPL-2.0-or-later, with Oracle "Classpath" exception on the ported OpenJDK files; `triangulator` carries the Sun BSD notice; `batik-svgpathparser` Apache-2.0; `gl-matrix` MIT; `jszip` MIT/GPL; `big.js` MIT. **Only behaviour, data models and UX are described here in my own words; no code is copied into this report or into any CasaPlazAI artefact.**
**Round-1 report reused read-only** (`~/dsh-workspaces/rea-sweethome3d-2026-10/02-02-online-version-bundle/report.md` + `bundle/`, `evidence/`); that folder was not modified.

Timing: started 2026-10-31 15:02 CET, research stopped 15:48, report finalised straight after.

Evidence tags: **OBSERVED** (file/URL/evidence in a job folder), **DOCUMENTED** (vendor docs), **INFERRED** (my reasoning).

---

## 1. Summary (5 bullets)

- The browser edition ships **13 `<script>` files + 1 worker (3.44 MB raw / 582 KB gzip)**; **76 % of the bytes sit in one file**, `sweethome3d.min.js` (2 618 789 B raw, 425 728 B gzip). The file contains **282 classes that carry a JSweet `__class` identity** plus **74 named-but-unmarked classes**, so **356 class-like entities** in total, and my accounting is a **true partition of all 2 618 789 bytes** — 357 segments, 0 gaps, 0 overlaps (`evidence/size-accounting.json`, `evidence/class-inventory-main.json`). **OBSERVED**
- The port pattern is **JSweet**: classes are emitted as `var x=(function(){…}()); x.__class="com.eteks.sweethome3d.…"`, inheritance is the TypeScript-style `__extends` helper (210 uses) or `prototype=Object.create` (69+), interfaces are string arrays in `x.__interfaces`, overloads get Java-signature-suffixed shims (`m$java_lang_Object$int`), and enums are JS objects. **Four files still carry the `Generated from Java with JSweet …` banner** (`batik-svgpathparser`, `geom` 2.3.8-SNAPSHOT, `stroke` 2.0.0, `swingundo` 2.0.0-rc1). **OBSERVED**
- **The single most important structural fact** the class list reveals: Sweet Home 3D's **plan editor is one `PlanController` class with 110 marked inner classes — 48 editing states and 53 `…UndoableEdit` classes — plus 8 anonymous inner classes** — i.e. the drawing/editing UX *is* an explicit state machine, and each editing verb has a first-class invertible edit object. That block is 451 274 B / 17.2 % of the main bundle (292 149 B of it inner classes). The full exact ranking of the file (357 segments, 0 gaps, 0 overlaps) is: **model 621 709 B (23.7 %) → non-Plan controllers 556 161 B (21.2 %) → PlanController 451 274 B (17.2 %) → 3D engine + scene graph 362 052 B (13.8 %) → PlanComponent 143 535 B (5.5 %) → JSViewFactory 128 535 B (4.9 %) → DOM widgets 100 628 B (3.8 %) → IO/XML 68 942 B (2.6 %) → formats/preferences 51 874 B (2.0 %) → app/recorders 42 774 B (1.6 %) → magnetism 41 178 B (1.6 %) → HomePane 30 543 B (1.2 %) → catalog loaders 19 584 B (0.7 %)**. **OBSERVED**
- Two clean architectural seams justify the whole port: (a) **one model, two renderers** — `PlanComponent` (2D, Java2D port) and `HomeComponent3D`/`HTMLCanvas3D` (3D, a *re-implemented* Java3D API over WebGL with no `javax.media.j3d` dependency); (b) **one persistable object tree** — `HomeXMLHandler`/`HomeXMLExporter` (XML) behind pluggable `URLContent` back-ends (`localstorage://`, `indexeddb://`, blob, HTTP) plus an off-thread ZIP writer. **OBSERVED / INFERRED**

---

## 2. Findings

### 2.1 The shipped bundle: files, sizes and load order

**OBSERVED** — live script tags extracted from `evidence/live-page.html` (fetched 2026-10-31 from the live JSP; `?version=7.5.2`, worker `7.5.2a`) and `evidence/livejs/` (all files re-downloaded and **byte-identical** to the round-1 copies, `evidence/livejs-checksums.txt`). Live HTTP `Last-Modified`: libs 2025-06-14, `recorderworker`/`mobile-detect` 2025-08-14, `sweethome3d.min.js` 2025-10-18 → the served build is **7.5.2 (Aug 2024) re-issued in 2025**, not a newer version number.

| # | script (load order) | raw B | gzip B | Java identity / role |
|---|---|---|---|---|
| – | *inline* `<script>` in the JSP (page bootstrap) | ~2.1 KB | – | `SweetHome3DJSOnlineApplication` subclass + `viewHome()` |
| 1 | `libjs/big.min.js` | 7 582 | 3 140 | third party, big.js 3.1.3 |
| 2 | `libjs/gl-matrix-min.js` | 54 213 | 11 495 | third party, gl-matrix **2.3.2** |
| 3 | `libjs/jszip.min.js` | 80 025 | 24 459 | third party, ZIP writer/reader |
| 4 | `libjs/jsXmlSaxParser.min.js` | 67 547 | 14 709 | third party SAX parser (N. Debeissat) |
| 5 | `libjs/core.min.js?v=7.5.2` | 15 387 | 4 345 | **ported OpenJDK** `java.lang`/`java.util`/`java.text`/`java.beans` subset (Oracle Classpath header) |
| 6 | `libjs/geom.min.js?v=7.5.2` | 346 778 | 48 915 | **ported** `java.awt.geom` + `sun.awt.geom` — 68 `__class` identities |
| 7 | `libjs/stroke.min.js` | 65 252 | 14 051 | **ported** `java.awt.BasicStroke` + `sun.java2d.pipe/pisces` — 15 classes |
| 8 | `libjs/swingundo.min.js?v=7.5.2` | 16 792 | 3 877 | **ported** `javax.swing.undo` + `javax.swing.event` — 8 classes |
| 9 | `libjs/batik-svgpathparser.min.js` | 83 194 | 10 786 | **ported** Apache Batik `SVGPathParser` — 27 classes |
| 10 | `libjs/triangulator.min.js?v=7.5.2` | 34 324 | 8 503 | **ported** Sun `Triangulator` (ear-clipping, BSD notice) |
| 11 | `libjs/graphics2d.min.js?v=7.5.2` | 10 713 | 3 139 | `java.awt.Graphics2D` shim over the HTML canvas (5 types, no `__class`) |
| 12 | `libjs/recorderworker.min.js?v=7.5.2a` *(id="recorder-worker")* | 35 122 | 9 309 | worker build; 6 `__class` identities under `com.eteks.sweethome3d.tools/.io` |
| 13 | `libjs/sweethome3d.min.js?v=7.5.2` | **2 618 789** | **425 728** | **the app: 282 marked classes** |
| 14 | `SweetHome3D.js` (site helper, not app) | 3 781 | 1 031 | printer-friendly view / platform image switch |
| 15 | `/resourceCache.js` (service worker, `scope:'/'`) | 1 191 | 551 | caches `*/online/readResource.jsp?*` in Cache Storage `RESOURCE_CACHE`, answers `503 "Offline"` |
| — | `mobile-detect.min.js` | – | – | third party (device sniffing for the catalog tier) |
| — | `cdn.jsdelivr.net/npm/crypto-js@4.2.0` | – | – | third party (login page) |
| — | **TOTAL of the app's own scripts + worker** | **3 435 718** | **582 456** | main bundle = 76.2 % raw / 73.1 % gzip of the total |

* **No ES modules, no bundler, no `import`/`export`/`require` anywhere** — every lib defines plain globals consumed by later scripts, so **load order is the dependency graph** (verified: `import:`/`export:` counts are 0 in all 13 files). **OBSERVED**
* The **worker is spawned from a `Blob`** inside the *worker script itself*, not from the main bundle: `recorderworker.min.js` reads `document.getElementById("recorder-worker").src`, builds `new Blob(["importScripts('…jszip.min.js');importScripts('…recorderworker.min.js');onmessage = function(ev){ new HomeRecorder(ev.data.recorderConfiguration).generateHomeZip(...) }"])` and `new Worker(URL.createObjectURL(a))`. The main bundle never mentions `postMessage`/`onmessage` — the worker file is loaded twice (tag + `importScripts`) precisely because the main bundle has no worker glue. **OBSERVED**
* The **model size lesson**: 2.6 MB raw for a full-featured planner is ~425 KB gzip; today's Vite/Three.js baseline would produce a comparable *compressed* figure, so Sweet Home 3D's payload is not the anomaly — its **class count and coupling** are. **INFERRED**

### 2.2 The Java-to-JS port pattern (JSweet) — verified emission rules

All of the following are **OBSERVED** in `sweethome3d.min.js` and the companion libs (grep/offset counts reproducible with `tools/`):

| Java construct | Emitted JS | Count in the bundle |
|---|---|---|
| class | `var x=(function(b){__extends(a,b); function a(){…} … return a}()); a.__class="com.eteks.…"` — **169** zero-arg + **403** parametrised IIFE forms, plus **178** `var X=function(` ; the *body precedes* the `__class` marker | 282 marked classes |
| class (hand-written port) | `function HomePane(…){…} … HomePane.__class="HomePane"` at the **end** of the body | 17 such classes |
| inheritance | `__extends(a,b)` helper (defined at file top, `Object.setPrototypeOf`) — **210** uses; or `X.prototype=Object.create(Y.prototype)` — **≥69** uses; **0** uses of `X.prototype=new Y()` (that is the *older* hand-port style and it is absent) | 210 `__extends` |
| interface | `X.__interfaces=["com.eteks.sweethome3d.viewcontroller.View", …]` (string arrays, never used for dispatch) | **152 assignments / 186 names / 24 distinct interfaces**; top: `javax.swing.undo.UndoableEdit` ×89, `viewcontroller.Controller` ×28, `model.Selectable` ×12, `model.Elevatable` ×10 |
| constructor with defaults | two `if (arguments.length==…)` branches that re-run field initialisation (`HomeXMLHandler` shows the pattern in full) | ubiquitous |
| method overloading | resolved by **name mangling**: `fireCollectionChanged$java_lang_Object$int`, `getHomeRecorder$com_eteks_sweethome3d_model_HomeRecorder_Type`, `pressMouse$float$float$int$boolean$…` — 74 prototype shims; the last arg `…_Type` is a stub "signature object" so overloads can be selected reflectively | 6 `_Type` stubs |
| enums | JS object with reverse mapping `Ctor[Ctor.NAME=0]="NAME"` | 33 enum member assignments; named: `PlanComponent.ActionType`, `PlanComponent.PaintMode`, `HomePane.MenuActionType`; the rest are minified (`a`,`c`,`d`,`e`,`f`,`g`,`h`,`j`,`l`,`o`) |
| static constants | `Func.STATIC="…"`, `Class.ENUM_OBJECT[i]="…"` (a `KeyStroke.KEY_CODE_TEXTS` table of ~100 codes is present) | many |
| Java `String`/`Object` | not emulated — plain JS strings; `hashCode` is a real method in `core` (`return this.hashCode`) | — |
| `main()` / `System.out` | a `StringWriter` port exists in `core.min.js` — used to build XML/DAE text in memory | — |
| runtime level | **ES5-style `var`/`function` only**: `=>` 0, `let` 0, `class` 4 (third-party), **`Promise` 0**, `then(` 2, `setTimeout` 63, `requestAnimationFrame` 7, `addEventListener` 178 — the only async primitives are DOM events, timers and `XMLHttpRequest` (20) | — |

**Marker-count paradox (explains round 1's "282 distinct `__class`" reading):** there are **282 `__class=` assignments over 196 distinct minified receivers** (the minifier reuses short names like `a`, `b`, `c` for unrelated classes — receiver `a` carries 18 different FQNs), and **84 receivers expose `prototype.*` methods while carrying no marker at all**. Counting `__class` strings therefore **under-reports the true class inventory by ~30 %**: the file holds **282 marked + 74 named-but-unmarked = 356 class-like entities**. **OBSERVED**

**Library/provenance split inside the main bundle** (the dir names in the vendor source tree are still visible in the identifier context, and the `__class` namespaces confirm it):

* `com.eteks.sweethome3d.*` — the app's own Java packages (extended with `…tools`, `…model`, `…io`, `…viewcontroller`).
* `java.awt.geom` / `java.awt.BasicStroke` string **types** survive as *string arguments* in the app bundle (`java.awt.geom` ×589, `java.awt.BasicStroke` ×77, `java.util` ×178, `javax.swing` ×113) — e.g. `new BasicStroke(…)`, `Ellipse2D`);
* **`sun.awt.geom`, `sun.java2d.pisces`, `javax.swing.undo`, `org.apache.batik`** live only in the companion files.
* Consequence: because JSweet's `core`/`geom`/`stroke` build defines **`Locale`, `BasicStroke`, `GeneralPath`, `Rectangle2D`, `Point2D`… as real globals**, `core.min.js` exports **no `__class` markers at all** even though it contains ~30 types (`Locale`, `DecimalFormat`, `PropertyChangeSupport`, `KeyStroke`, `UUID`, `System`, …). **OBSERVED**

### 2.3 Class inventory of `sweethome3d.min.js` (282 marked + 74 unmarked)

Complete machine-readable list with offsets and per-class byte estimates: **`evidence/class-inventory-main.json`**. Package census (marked classes):

| package | classes | notes |
|---|---|---|
| `…viewcontroller.PlanController` | **110** | 48 `…State`, 53 `…UndoableEdit`, plus `Mode`, `ControllerStateDecorator`, `WallPointWithAngleMagnetism`, `PointWithAngleMagnetism`, `RoomPointWithAngleMagnetism`, `PointMagnetizedToClosestWallOrRoomPoint`, `ResizedPieceOfFurniture`, `JoinedWall` |
| `…model` | **52** | the persistable domain (below) |
| `…viewcontroller` (top level) | **29** | `HomeController`, `HomeController3D`, `FurnitureController`, `FurnitureCatalogController`, `HomeFurnitureController`, `RoomController`, `WallController`, `PolylineController`, `DimensionLineController`, `LabelController`, `LevelController`, `CompassController`, `ObserverCameraController`, `PhotoController(s)`, `VideoController`, `UserPreferencesController`, `Home3DAttributesController`, `PageSetupController`, `WizardController`, `ImportedFurnitureWizardController`, `ImportedTextureWizardController`, `BackgroundImageWizardController`, `TextureChoiceController`, `BaseboardChoiceController`, `ModelMaterialsController`, `AbstractPhotoController`, `LocalizedUndoableEdit`, + views `View`/`View3D`/`ExportableView`/`TransferableView` |
| `…io` | **9** | `HomeXMLHandler`, `HomeXMLExporter` (+`PieceOfFurnitureExporter`), `ObjectXMLExporter`, `XMLWriter`, `DefaultFurnitureCatalog`, `DefaultTexturesCatalog`, `DefaultPatternTexture` |
| unmarked `Home` / `JSViewFactory` / `HomePane` | 3 | `HomePane.__class="HomePane"`; `JSViewFactory.__class="JSViewFactory"` |
| unmarked Java3D-port + view + format classes | **87** | see below |

**`…model` (52)** — `AspectRatio, BackgroundImage, Baseboard, BoxBounds, Camera, CatalogDoorOrWindow, CatalogLight, CatalogPieceOfFurniture, CatalogShelfUnit, CatalogTexture, CollectionChangeSupport, CollectionEvent, Compass(+GeographicPoint), DamagedHomeRecorderException, DimensionLine, FurnitureCatalog, FurnitureCategory, Home, HomeApplication, HomeDescriptor, HomeDoorOrWindow, HomeEnvironment, HomeFurnitureGroup(+LocationAndSizeChangeListener), HomeLight, HomeMaterial, HomeObject, HomePieceOfFurniture, HomePrint, HomeShelfUnit, HomeTexture, IllegalHomonymException, InterruptedRecorderException, Label, Level, LightSource, NotEnoughSpaceRecorderException, ObjectProperty, ObserverCamera, PatternsCatalog, Polyline(+DashStyle), RecorderException, Room, Sash, SelectionEvent, TextStyle, TexturesCatalog, TexturesCategory, Transformation, Wall`.

**Unmarked classes (the cost of not using `__class`):** 48 in the 3D block (`Node3D, Shape3D, Background3D, Light3D, AmbientLight3D, DirectionalLight3D, Group3D, BranchGroup3D, SharedGroup3D, Link3D, TransformGroup3D, Appearance3D, Indexed{Geometry,Line,Triangle}Array3D, BoundingBox3D, Box3D, GeometryInfo3D, IncorrectFormat3DException, HTMLCanvas3D, Chunk3DS, ChunksInputStream, ModelLoader, OBJLoader, OBJGroup, DAELoader, DAEHandler, DoorOrWindowArea, Max3DSLoader, ModelManager, ModelPreviewComponent, HomeComponent3D, Object3DBranch, Object3DBranchFactory, HomePieceOfFurniture3D, Room3D, Wall3D, Ground3D, Polyline3D, DimensionLine3D, Label3D, TextureManager, MeterFamilyFormat, SquareMeterAreaFormatWithUnit, SquareFootAreaFormatWithUnit, InchFractionFormat, InchDecimalsFormat, FootDecimalsFormat`), 33 elsewhere (`PlanComponent, MagnetismChangeListener, UserPreferences, DefaultUserPreferences, RecordedUserPreferences, ResourceAction, ColorButton, IndicatorType, Builder, ContentDigestManager, JSComponent, JSDialog, JSTreeTable, JSComboBox, JSSpinner, JSPopupMenu, JSColorChooser, JSColorChooserDialog, JSTextureDialog, JSWizardDialog, JSImageResizingDialog, JSModelMaterialsSelectorDialog, ModelMaterialsComponent, TextureChoiceComponent, FurnitureCatalogListPanel, FurnitureTablePanel, PieceOfFurniture{Model,Plan,TopView}Icon, HomePieceOfFurnitureTopViewIconKey, UserPreferencesChangeListener` + 2 minified), and 6 in the tail (`AutoRecoveryManager, DirectHomeRecorder, IncrementalHomeRecorder, LocalFileHomeController, DirectRecordingHomeController, SweetHome3DJSApplication`).

**Ratio that matters for CasaPlazAI:** marked classes = **282**, named unmarked = **74**, so the "readable" identity coverage is **79 %**, and **all 3D classes plus all 13 DOM widget classes are in the unreadable 21 %** — precisely the subsystems a CasaPlazAI developer would most want to name. **OBSERVED / INFERRED**

### 2.4 What the class list says about the architecture (and the seams of the port)

**(a) The plan editor is an explicit state machine with first-class undoable edits.** `PlanController` = 110 inner classes: **48 states** (`SelectionState`, `WallCreationState`, `WallDrawingState`, `AbstractWallState`, `WallResizeState`, `RoomCreationState`, `RoomDrawingState`, `AbstractRoomState`, `RoomResizeState`, `RoomNameOffsetState`, `RoomNameRotationState`, `RoomAreaOffsetState`, `RoomAreaRotationState`, `LabelCreationState`, `DimensionLineCreationState`, `PolylineCreationState`, `PieceOfFurnitureResizeState`, `PieceOfFurnitureRotationState`, `DragAndDropState`, `PanningState`, `RectangleSelectionState`, `Camera…`, `Compass…`, `LightPowerModificationState`, `AbstractModeChangeState`, …) and **53 `…UndoableEdit` classes** (`WallsCreationUndoableEdit`, `WallSplittingUndoableEdit`, `WallsJoiningUndoableEdit`, `WallsDirectionReversingUndoableEdit`, `RoomsCreationUndoableEdit`, `RoomPointAddition/Deletion`, `RoomPointsModificationUndoableEdit`, `ItemsMoving/Deletion/DeletionStart/DeletionEnd/AdditionEnd`, `DuplicationStart/EndUndoableEdit`, `FlippingUndoableEdit`, `Locking/Unlocking`, `LevelAddition/Deletion`, `…NameOffset/Rotation`, `TextStyleModificationUndoableEdit`, `AllLevelsViewabilityModificationUndoableEdit`, …). Also two interesting non-state helpers: `ControllerStateDecorator` (state interception) and the magnetisms `PointWithAngleMagnetism` / `WallPointWithAngleMagnetism` / `RoomPointWithAngleMagnetism` / `PointMagnetizedToClosestWallOrRoomPoint`. **OBSERVED**

**(b) 3D is a *re-implementation* of the Java3D API over WebGL, not a port of Java3D.** The block contains **zero `javax.media.j3d` / `com.sun.j3d` strings**; instead hand-written `Node3D`, `BranchGroup3D`, `TransformGroup3D`, `Appearance3D`, `Shape3D`, `Background3D`, `Group3D`, `SharedGroup3D`, `Link3D`, `Indexed{Geometry,Line,Triangle}Array3D`, `GeometryInfo3D`, `BoundingBox3D`, `Box3D`, `Light3D`, `AmbientLight3D`, `DirectionalLight3D`, and a renderer `HTMLCanvas3D` that owns the WebGL context, shader attributes/uniforms (`vertexPosition`, `vertexNormal`, `vertexTextureCoord`, `modelViewTransform`, `projectionTransform`), and `ModelLoader`/`OBJLoader`/`DAELoader`/`Max3DSLoader` subclasses. Maths uses `gl-matrix` (`mat4.` ×255, `vec3.` ×415). **OBSERVED**

**(c) 2D is a ported Java2D renderer.** `PlanComponent` (143 535 B, 165 prototype methods — the *largest method count* in the file) depends on `java.awt.geom` (`GeneralPath`, `Ellipse2D`, `Rectangle2D`, `Area`), `java.awt.BasicStroke`, the Batik SVG path parser and the triangulator. `graphics2d.min.js` is only a **10.7 KB adapter**: `Graphics2D.prototype.{draw,fill,drawImage,clear,getClip,setClip,createPathFromShape,drawImageWithSize}` calling into the HTML canvas — i.e. the *whole* Java2D API was **not** ported; only the ~8 calls the plan renderer actually uses. **OBSERVED / INFERRED**

**(d) IO is layered and pluggable.** `core.min.js` is a **15 KB hand-picked OpenJDK subset** (`Locale`, `DecimalFormat`, `Currency/IntegerFormat`, `NumberFormat`, `ParsePosition`, `PropertyChangeSupport/Event`, `KeyStroke`, `EventObject`, `StringWriter`, `System`, `UUID`, `Format`, 5 exception classes) — i.e. the vendor ported *exactly the `java.*` surface the app touches* and nothing more. The main bundle's IO package is XML-only (`HomeXMLHandler` reader with a SAX-style `buffer/elements/attributes/groupsFurniture/properties/textStyles/levels/joinedWalls/textures/materials/transformations/sashes/lightSources/shelfBoxes/points` state, `HomeXMLExporter`, `XMLWriter`), while the *content* abstractor `URLContent` (with `SimpleURLContent`, `HomeURLContent`, `BlobURLContent`, `LocalStorageURLContent`, `IndexedDBURLContent`) is **duplicated inside `recorderworker.min.js`** (6 classes) so the worker can unpack/repack without the main bundle. **OBSERVED / INFERRED**

**(e) The HTML widget layer is hand-written, not generated, and is the third-largest subsystem of the file** — the exact partition measures the whole "replace Swing" stratum at **300 884 B / 11.5 %**: `JSViewFactory` **128 535 B** (28 methods, each constructing a concrete widget: `createFurnitureCatalogView`, `createFurnitureView`, `createPlanView` → `PlanComponent`, `createView3D` → `HomeComponent3D`, `createWizardView`, …; it is the **largest single non-controller class**), **100 628 B** of `JS*`/panel widgets (`JSModelMaterialsSelectorDialog` 14 473, `FurnitureTablePanel` 13 183, `FurnitureCatalogListPanel` 11 149, `JSTreeTable` 10 064, `JSTextureDialog` 9 804, `JSSpinner` 6 847, `JSPopupMenu` 6 826, `JSColorChooser` 5 850, `JSDialog` 3 792, `JSComboBox` 3 393, `JSWizardDialog` 3 151, `ContentDigestManager` 3 037, `JSComponent` 2 635, `TextureChoiceComponent` 1 611, `ColorButton` 1 490, `JSImageResizingDialog` 1 269, `JSColorChooserDialog` 1 089, `ModelMaterialsComponent` 965), `MagnetismChangeListener` 41 178, and `HomePane` 30 543. There are 58 `new JSSpinner(...)` call sites alone — i.e. SH3D spends **~3× more bytes replacing Swing than on XML persistence**. **OBSERVED**

**(f) The tail is the app/recorder layer** (`~42 774 B` of named classes, plus 5 anonymous `JS*` subclasses): `DirectHomeRecorder` 10 211, `IncrementalHomeRecorder` 13 655, `AutoRecoveryManager` 5 485 (extends `DirectHomeRecorder`, `writeHomeWithWorker:true`, `?name=(.*).recovered`), `LocalFileHomeController` 4 238, `DirectRecordingHomeController` 6 640 (extends `HomeController`), `SweetHome3DJSApplication` 2 545 (extends `HomeApplication`). 13 `prototype=Object.create` links prove the inheritance chain in that region. **OBSERVED**

### 2.5 Size breakdown per subsystem — method and results

Both measurements come from the byte-exact live file (`evidence/livejs/sweethome3d.min.js`, sha256 `053e7d1a…`). **Method choice mattered**: my first two attempts used "find depth-0 declarations" scanners and did not reconcile (one briefly double-counted a 393 KB run). The file is minified and its **brace depth never returns to 0** (nested function expressions), so depth-based "top-level" detection is unreliable. The final method uses two exact, complementary partitions:

1. **Head — marker chain.** From byte 0 to `function Node3D(` the file is pure JSweet output, and a class body **ends at** its `X.__class="FQN"` marker, so `[marker_end(i-1), marker_end(i))` *is* class *i*'s byte span. One run is "mixed" (a marker closes a run that also holds an unmarked class) and is cut at an explicit offset I verified by reading the source.
2. **Tail — declaration partition.** From `function Node3D(` to EOF every class body begins with a `function <Name>(` declaration whose name is 2+ characters (the minifier reserves single letters for closures nested inside method bodies, e.g. `HomeController3D.prototype.createActions` contains `function f(g){…}`). Cutting at those offsets gives an exact per-class span for the whole hand-written 3D + view + tail region.

**Result: 357 segments, 2 618 789 / 2 618 789 bytes covered, 0 gaps, 0 overlaps** — a true partition of the file (`tools/byte-accounting.mjs` → `evidence/size-accounting.json`).

3. **Method-body accounting (independent cross-check)** — `tools/method-body-accounting.mjs` → `evidence/method-bodies.json`: sums every `X.prototype.m=function(){…}` / `X.s=function(){…}` body per receiver with a brace matcher that skips comments, strings and (heuristically) regex literals — **125 receivers, 4 483 prototype methods + 486 static/instance assignments, 1 848 376 B = 70.6 %** of the file are method bodies. It confirms the ordering and supplies method counts; it *disagrees by design* per class where constructors do the work (`JSViewFactory`: 28 methods but 128 KB of body; `PlanComponent`: 165 methods for 144 KB).

**Aggregated result (exact partition):**

| subsystem | bytes | % of file | representative members |
|---|---|---|---|
| **model** (Home/Wall/Room/furniture/catalogs) | **621 709** | **23.7 %** | `CatalogPieceOfFurniture` 103 213, `Home` 62 025, `HomePieceOfFurniture` 58 477, `CatalogDoorOrWindow` 50 820, `Compass` 40 895, `Wall` 34 965, `HomeFurnitureGroup` 33 076, `Polyline` 26 332, `HomeEnvironment` 24 723; 52 classes |
| **controllers, non-Plan** | **556 161** | **21.2 %** | `HomeController` 64 184, `HomeFurnitureController` 44 949, `ImportedFurnitureWizardController` 41 694, `FurnitureController` 37 916, `WallController` 29 160, `RoomController` 27 510, `UserPreferencesController` 16 446; 109 classes |
| **PlanController** | **451 274** | **17.2 %** | outer class 159 125 + **110 marked inner classes** (48 `…State`, 53 `…UndoableEdit`) + **8 anonymous inner classes** (`PlanController$0..$7`, 5 850 B) → inner classes total **292 149 B / 11.2 %** |
| **3D engine + scene graph** | **362 052** | **13.8 %** | 43 unmarked `function` declarations: `HomeComponent3D` 65 932, `HTMLCanvas3D` 45 432, `ModelManager` 34 759, `Wall3D` 24 812, `OBJLoader` 23 060, `DAEHandler` 21 566, `TextureManager` 20 312, `Max3DSLoader` 19 837, `ModelPreviewComponent` 18 695, `HomePieceOfFurniture3D` 15 051, `Room3D` 13 859, `Ground3D` 8 794 … |
| **PlanComponent (2D plan renderer)** | **143 535** | **5.5 %** | single class, **165 prototype methods** (the largest method count in the file) |
| **JSViewFactory** | **128 535** | **4.9 %** | 28 `create*View`/`create*StepsView` factories; the single biggest DOM-facing class |
| **HTML/DOM widget classes replacing Swing** | **100 628** | **3.8 %** | `JSModelMaterialsSelectorDialog` 14 473, `FurnitureTablePanel` 13 183, `FurnitureCatalogListPanel` 11 149, `JSTreeTable` 10 064, `JSTextureDialog` 9 804, `JSSpinner` 6 847, `JSPopupMenu` 6 826, `JSColorChooser` 5 850, `JSDialog` 3 792, `JSComboBox` 3 393, `JSWizardDialog` 3 151, `ContentDigestManager` 3 037, `JSComponent` 2 635 + 5 more |
| **IO / XML / catalogs** | **68 942** | **2.6 %** | `HomeXMLHandler` 43 038, `HomeXMLExporter` + `PieceOfFurnitureExporter` (segments), `XMLWriter`, `ObjectXMLExporter`; the `URLContent` family lives in the worker, not here |
| **formats / i18n / preferences** | **51 874** | **2.0 %** | `RecordedUserPreferences` 22 454, `UserPreferences` 16 982, `DefaultUserPreferences` 2 104, `InchFractionFormat` 3 264, `ResourceAction` 3 150, `DefaultPatternTexture` 851 |
| **app bootstrap + recorders (tail)** | **42 774** | **1.6 %** | `IncrementalHomeRecorder` 13 655, `DirectHomeRecorder` 10 211, `DirectRecordingHomeController` 6 640, `AutoRecoveryManager` 5 485, `LocalFileHomeController` 4 238, `SweetHome3DJSApplication` 2 545 + 5 anonymous `JS*` subclasses |
| **magnetism / alignment** | **41 178** | **1.6 %** | `MagnetismChangeListener` (+ the `PlanController` magnet helpers `PointWithAngleMagnetism` 3 424, `WallPointWithAngleMagnetism` 1 989, `RoomPointWithAngleMagnetism` 1 856, counted under PlanController) |
| **HomePane (view assembly)** | **30 543** | **1.2 %** | the Swing-`JFrame` replacement that wires menu/toolbar/tool cards to `JSViewFactory` |
| **catalog loaders** | **19 584** | **0.7 %** | `DefaultFurnitureCatalog` 16 344, `DefaultTexturesCatalog` 3 240 |

*(Breakdown of the `PlanController` row: outer class 159 125 B / 6.1 %, 110 marked inner classes 286 299 B / 10.9 %, 8 anonymous inner classes 5 850 B / 0.2 %.)*

**Read across the measurements:** the *behaviour* is roughly **38 % controllers** (556 161 + 451 274 = 1 007 435 B) and **24 % model**; **rendering is 19 %** (3D 362 052 + 2D 143 535); persistence/XML is only 2.6 % in the main bundle because URL/blob/ZIP work is duplicated into the worker; the **browser-specific UI replacement** (`JSViewFactory` + `HomePane` + the `JS*` widgets + `MagnetismChangeListener`) totals **300 884 B / 11.5 %** — i.e. SH3D spends about **3× more on replacing Swing than on XML persistence**. **INFERRED from the measurements.**

**Companion-lib breakdown** (`evidence/companion-libs.json`):

| file | bytes | classes | subsystem |
|---|---|---|---|
| `geom.min.js` | 346 778 | 68 | Java2D geometry; top classes `AffineTransform` 58 404, `Path2D` 42 684, `CubicCurve2D` 27 978, `Arc2D` 24 388, `QuadCurve2D` 21 358, `Rectangle2D` 15 380, `Line2D` 15 152, `sun.awt.geom.Curve` 14 247, `Crossings` 10 932, `AreaOp` 9 551 — i.e. **mostly an `Area`/boolean-path engine** |
| `batik-svgpathparser.min.js` | 83 194 | 27 | SVG path grammar → `GeneralPath` |
| `jszip.min.js` | 80 025 | – | third party |
| `jsXmlSaxParser.min.js` | 67 547 | – | third party |
| `stroke.min.js` | 65 252 | 15 | stroke expansion (`BasicStroke`, pisces) |
| `gl-matrix-min.js` | 54 213 | – | third party |
| `recorderworker.min.js` | 35 122 | 6 | duplicated `URLContent` family + `HomeRecorder` |
| `triangulator.min.js` | 34 324 | – | ear-clipping polygon triangulation |
| `swingundo.min.js` | 16 792 | 8 | `UndoManager`/`UndoableEditSupport`/events |
| `core.min.js` | 15 387 | 0 markers | JDK `java.lang/util/text/beans` subset |
| `graphics2d.min.js` | 10 713 | 0 markers | HTML-canvas 2D context adapter |
| `big.min.js` | 7 582 | – | third party decimal |
| `SweetHome3D.js`, `resourceCache.js` | 3 781 / 1 191 | – | site helper + service worker |

**Total companion (non-app) bytes: 816 929 B raw / 23.8 % of the payload.** The **Java-compatibility tax** of the port (core + geom + stroke + swingundo + graphics2d + batik + triangulator) is **572 440 B raw / 93 616 B gzip = 16.7 % of the whole payload** — **1.6× the entire 3D subsystem**. That is the central cost/benefit datum of the JSweet strategy. **OBSERVED**

### 2.6 Runtime wiring checks (what REA and a live browser confirmed)

* `rea analyze-javascript-application` on the five small companion files completed the **syntax** phase: 12 relevant files, 112 338 text bytes read, 5 parsed, 0 parse failures, 30 567 AST nodes visited, 20 findings (`evidence/aja-core-summary.json`). It emitted a 31 MB evidence bundle, and both the command's exit code (1) and `aja-core.err` show the run **died in the worker `close()` phase** — i.e. round 1's `cleanup_incomplete` failure is *not* specific to whole pages; the 5-file analysis had already produced its summary before the post-processing step crashed. Semantic coverage stayed `partial` (7590 semantic unknowns), which is an explicit "unknown", not an absence. **OBSERVED** — `evidence/aja-core*.json`, `evidence/aja-core.err`
* Live-page globals probe (`tools/probe-globals.mjs`, Playwright + software GL, analytics hosts blocked → `evidence/probe-globals.json`): the app's classes **are real `window` globals** — `SweetHome3DJSApplication`, `HomePane`, `JSViewFactory`, `PlanComponent`, `HTMLCanvas3D`, `URLContent`, `DirectHomeRecorder`, `IncrementalHomeRecorder`, `AutoRecoveryManager`, `HomeXMLHandler`, `Home`, `Node3D`, `ModelManager`, `DefaultFurnitureCatalog`, `JSComponent`, `JSDialog`, `JSTreeTable`, `ZIPTools`, `CoreTools`, `UserPreferences`, `DefaultUserPreferences`, `Object3DBranchFactory`, `HomeComponent3D` all present; **92 globals carry a Java class identity** (e.g. `URLContent = com.eteks.sweethome3d.tools.URLContent`, `HomeTexture = com.eteks.sweethome3d.model.HomeTexture`). This closes round 1's unknown #3 (post-load runtime state) and confirms the class list is not just static text. **OBSERVED**
* Same probe: 17 script tags in the live DOM (matching the JSP order), no page errors, `document.title = "Sweet Home 3D - Design in Your Browser"`. `#demo-choice`, `#home-3D-view` and `#home-pane-toolbar` were **absent in that particular load** (the page's own bootstrap had not yet produced them; the body text was empty at probe time), and `SweetHome3DJSOnlineApplication` is *not* a global because it is declared inside the page's inline script closure. So DOM-level editor assertions are still weaker than class-level ones. **OBSERVED**
* `rea capture-browser-scenario` **rejects** the round-1 assumption that launch args can be passed: its schema only allows `browser.mode/executable_path/headless` and its action vocabulary is exactly `goto|click|fill|press|select_option|check|uncheck|wait_for|request|wait_for_timeout` — **no `evaluate` action**. Software-GL flags therefore cannot be injected through that tool (they had to go through a direct Playwright script), and page-internal JS APIs cannot be called through it either. That closes round 1's lesson (b) with a hard negative: `capture-browser-scenario` **cannot** drive the app's JS API. **OBSERVED** — `evidence/probe-result.json` (`unknown_argument` for `browser.args`, `invalid_value` for `action:"evaluate"`)
* Vendor-side history (**DOCUMENTED**, `changelog_de.html`): the JS build is tracked as its own product line ("Sweet Home 3D JS", "Sweet Home 3D JS Viewer", "Sweet Home 3D JS Online"); v7.5.2 fixed "a bug … that prevented displaying a house in some browsers" across all three; the entry that introduced *"new classes to Sweet Home 3D JS to save home data directly on a server, in IndexedDB or in local storage, with automatic recovery management in IndexedDB"* corresponds exactly to the `URLContent`/`*HomeRecorder`/`AutoRecoveryManager` classes measured in §2.4(d)/(f); a JSP **and** a PHP deployable editor were added to the repository. **OBSERVED in the fetched changelog**
* Provenance/versioning oddity worth recording: the served banners are mixed — `sweethome3d/core/geom/graphics2d/swingundo/triangulator/recorderworker` = 7.5.2 (geom additionally `JSweet 2.3.8-SNAPSHOT`), but **`stroke.min.js` says "version 6.0"** and `batik-svgpathparser.min.js` says `JSweet 2.0.0-rc1`. So the browser build is a **union of artifacts transpiled at different times/toolchain versions**, not a single clean 7.5.2 regeneration. **OBSERVED**

### 2.7 What is *not* in the browser bundle (scope cut vs desktop)

**OBSERVED by absence** in the 282-class inventory + companion files: no `javax.media.j3d`/`com.sun.j3d` (Java3D replaced), no `java.awt.Component`/`JFrame`/Swing widget classes (replaced by `JS*`), no `javax.imageio`, no `java.awt.print` beyond `HomePrint`/`PageSetupController` stubs, no `com.eteks.sweethome3d.j3d` package name, no `PhotoRenderer`/`SunFlow` (the desktop's raytracer), no `VideoRenderer` classes (only a `VideoController` that orchestrates and delegates), no `SweetHome3DViewer` app class (separate JSP), no `java.util` collections package (arrays/objects used directly), no `Promise`/`fetch`. Manual (**DOCUMENTED**) confirms the user-visible cut: the online version has no menu bar and lacks **3D-model import and photo/video rendering**; the changelog adds that photo/video *controllers* exist in the JS build, so the cut is in the renderer back-ends, not in the UI. **OBSERVED / DOCUMENTED**

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranking: **V** = value for the in-progress single-workspace redesign (1–5), **E** = effort (1 = trivial, 5 = large). Score = V − E. Each row names the finding it comes from and, where relevant, the CasaPlazAI schema field it touches.

| # | Idea | Tied to finding | V | E | Concrete form in CasaPlazAI |
|---|---|---|---|---|---|
| 1 | **Freeze the *undo edit object* as the only way to mutate the plan.** Sweet Home 3D has 53 first-class `…UndoableEdit` classes for exactly the verbs CasaPlazAI has (create/split/join/reverse walls, add/delete/move room points, move/rotate/flip/lock furniture, name/area offsets, level add/delete/visibility). Introduce a `PlanEdit` union type next to `FloorplanData` (`addRoom`, `moveRoomPoint`, `splitWall`, `placeOpening`, `moveFurniture`, `setRoofLean`, …) with `apply`/`invert`, and route **every** tool through it. | §2.3, §2.4(a) | 5 | 3 | `src/editor/model/edits.ts`; state stays `FloorplanData` v1, edits are an editor-local journal (like the underlay key) |
| 2 | **Give the tool a named state enum, and make the inspector render it.** The 48 `…State` classes are the reason SH3D can show "Wall drawing / Room drawing / Piece resize" without ad-hoc flags. CasaPlazAI's Plan mode can hold one `editorState: 'idle'\|'wallDraw'\|'roomDraw'\|'openingPlace'\|'furnitureMove'\|'measure'\|'pan'` and drive cursor, tool card and inspector from it. | §2.4(a) | 5 | 2 | editor-local store; no schema change |
| 3 | **Keep exactly one `Magnetism`/alignment module and make grid pitch a field of it.** SH3D keeps magnetism/alignment in a dedicated 41 KB `MagnetismChangeListener` plus magnet helpers inside `PlanController` (`PointWithAngleMagnetism`, `PointMagnetizedToClosestWallOrRoomPoint`), and the renderer in a separate 143 KB `PlanComponent` — i.e. *snapping is its own module, not part of drawing*. It includes per-object-type magnets (wall vs room vs furniture). CasaPlazAI has 0.5 m grid snapping; extend the same module with wall-face/room-centre/furniture-edge candidates and expose it as one `snap(point, context)` API. | §2.5, round-1 §2.6 | 4 | 3 | `casaplaza.snap.settings.v1` gains pitch/toggles; behaviour only |
| 4 | **Budget the payload of each subsystem explicitly.** The measured split (model 23.7 %, controllers 38 %, renderers 19 %, PlanComponent+JSViewFactory 10 %, DOM widgets 3.8 %, IO/XML 2.6 %, and a **572 KB ported-Java compatibility layer = 16.7 % of the whole payload (23.8 % of all companion scripts)**) is a ready-made checklist to watch in CasaPlazAI's own bundle — but invert the lesson: CasaPlazAI should *not* grow a compatibility layer. | §2.1, §2.5 | 4 | 1 | CI budget: analyse the Vite bundle and fail above per-chunk kB budgets |
| 5 | **One serialiser, two consumers.** `HomeXMLHandler` (read) and `HomeXMLExporter`/`XMLWriter` (write) are separate classes over the same `Home` object, and the worker duplicates them for off-thread use. For CasaPlazAI: one `serialize(FloorplanData)/parse(unknown)` pair (the schema's `migrate()` hook) used by export, autosave, share links and import — no second path. | §2.4(d), schema §Migration hook | 4 | 2 | `src/shared/schema/serialize.ts` beside `validate.ts` / `migrate.ts` |
| 6 | **Named enum constants instead of bare literals for tool/mode values.** SH3D emits 33 enums including `PlanComponent.ActionType`, `PlanComponent.PaintMode`, `HomePane.MenuActionType`; the `ActionType` enum is what the toolbar, context menu and keyboard map all index into. CasaPlazAI's `Room.floorTexture`, `Opening.kind`, `FurnitureItem.type` are already closed enums — add the *editor-side* mode/tool enums with `as const` and reuse them for tool cards, shortcuts and analytics. | §2.2 (enum row) | 3 | 1 | `src/shared/schema/types.ts` (additive) |
| 7 | **Progressive asset tiering keyed off one capability probe.** The page picks `DefaultFurnitureCatalog.json` (94 items) vs `FurnitureCatalog.json` (805) from pointer/viewport; the port also feature-detects WebGL (`"No WebGL"`). CasaPlazAI can adopt a single `detectCapabilities()` returning `{webgl, coarsePointer, reducedMotion}` and let the palette and the 3D tab read it. | §2.1, round-1 §2.6 | 3 | 2 | one module + palette metadata |
| 8 | **Separate "model size" from "method count" when reviewing a file.** Two classes in the same bundle show the two extremes: `JSViewFactory` has 28 methods but 128 KB of body, `PlanComponent` has 165 methods for 144 KB. Put both metrics in the perf review template. | §2.5 | 2 | 1 | dev note in `AGENTS.md` |
| 9 | **Version the exported project file.** SH3D's `home version='5500'` is the only thing that makes old saves loadable. CasaPlazAI's `SCHEMA_VERSION` already exists — surface it in the exported JSON and in the `.png`/`.jpeg` sidecar naming, and log a one-line "upgraded from v0" toast on `migrate()`. | schema §Top level / §Migrate | 4 | 2 | export path only |
| 10 | **Don't copy the transpiled-DOM pattern.** `JSViewFactory`'s 28 `createXView` factories + 13 `JS*` widget classes exist only because Swing had to be replaced — together **229 KB / 8.7 %** of the file. A TS-native app that imitates this pays that price plus a fake widget hierarchy for nothing; prefer direct components and keep the factory at most as a thin "parse a chunk, render a chunk" boundary. | §2.4(e) | 3 | 2 | architectural guidance / ADR |
| 11 | **Off-thread serialisation behind a capability check.** The Blob-worker trick (worker script loaded twice, `importScripts` inside a `Blob`) shows how far a browser-only app will go to keep the UI responsive while zipping/XML-serialising. Worth it for CasaPlazAI only when exporting a large plan or PNG on a low-end device; gate on `typeof Worker !== 'undefined'` and fall back synchronously. | §2.1, §2.4(d) | 2 | 2 | `src/editor/io/exportWorker.ts` |
| 12 | **Track licence/provenance per file, not per project.** The bundle mixes GPL-with-Classpath (OpenJDK files), BSD (`triangulator`), Apache-2.0 (`batik`) and MIT (`gl-matrix`, `big.js`) under one product. Keep a `LICENSES.md` table with file → licence → source URL for any third-party code so a future reuse audit is one file. | §2.1, §2.5 | 2 | 1 | repo hygiene |

**Do first (high value, low effort):** 1, 2, 4, 6, 9. **Do not copy:** the JSweet transpilation itself, the Java2D/Java3D API emulation, the `JS*` Swing-shaped widget layer, or the duplicated-in-worker IO classes (§2.6/§2.7).

---

## 4. Unknowns

1. **The 21 % of classes with no `__class` marker cannot be verified by identity.** My "unmarked" list (84 prototype-bearing receivers + 74 named classes) is derived from `X.prototype.m=` receivers and `function Name(` declarations; some may be helper closures, and the minifier reuses short names like `a`, `b`, `c` across unrelated classes (marked receiver `a` alone carries 18 different FQNs), so a per-name mapping is impossible. Names and sizes for the 3D engine, the 13 `JS*` widgets and the tail app/recorders rest on identifier + prototype + call-site evidence, not on `__class` strings. I also had to abandon brace-depth "top-level" detection: the file's brace depth never returns to 0, so my first two accounting attempts were wrong and were replaced by the two exact partitions in §2.5. **Limitation of the method, not of the code.**
2. **Byte attribution is per class body, not per method.** The primary accounting is an exact partition (357 segments, 0 gap, 0 overlap), and the tail half is cut at every `function Name(` declaration. The residual softness is (a) anonymous inner classes, which sit inside their enclosing class's span (8 such in `PlanController`, ~5.9 KB), and (b) the one mixed head run I cut by hand. The method-body metric (§2.5 measurement 3) is the cross-check and can differ by 2× for classes whose constructor does the work (`JSViewFactory`).
3. **No completed REA static analysis.** `analyze-javascript-application` on five small companion files finished the syntax/projection phase but the run exited 1 while tearing down the worker (`aja-core.err`), and semantic coverage was `partial` with 7 590 unknowns; `analyze-web-bundle` was not re-run on the live page in round 2. Therefore **no certified import graph, route table or AST call graph** for `sweethome3d.min.js`. The class inventory, byte counts and port pattern are grep/offset/schema-based and independently reproduced.
4. **Local-variable provenance of the tail classes is inferred.** `DirectHomeRecorder`/`IncrementalHomeRecorder`/`AutoRecoveryManager`/`SweetHome3DJSApplication` exist as named `function` declarations (globals) with clear `Object.create` inheritance, but the 6 anonymous `JSComponent`/`JSDialog` subclasses in the same tail were not mapped to UI purpose.
5. **`core.min.js` type inventory is name-based only.** Because that file emits no `__class` markers, its ~30 types (`Locale`, `DecimalFormat`, `KeyStroke`, `PropertyChangeSupport`, …) are identified from `X=function(` assignments and usage in the app; a few may be internal helpers.
6. **The desktop-vs-web class delta was not measured.** I did not obtain the desktop JAR (`sourceforge.net` download returned HTTP 403 to this client), so "the browser bundle is 282 classes vs N desktop classes" cannot be stated. Whether the JS build shares one source tree with the desktop app, and which classes are browser-only, remains unverified.
7. **3D runtime state still unverified.** The live probe reached the page's globals but that particular load had no `#demo-choice`/`#home-3D-view` in the DOM (its bootstrap had not produced them yet) and no page errors, so I did not observe a WebGL context string, real model/texture request counts, or the 3D editor in a working state. `capture-browser-scenario` cannot help here (no `evaluate` action, no browser args — §2.6), so a custom Playwright run would be needed.
8. **Worker and service-worker behaviour were read, not exercised.** The Blob/`importScripts` construction and the `RESOURCE_CACHE` service worker were read from source (and `resourceCache.js` is byte-identical to the live one); I never observed a worker save or a cache hit.
9. **Version drift / mixed toolchains.** All files are served under `?version=7.5.2` but `stroke.min.js` self-reports 6.0 and `batik-svgpathparser.min.js` reports JSweet 2.0.0-rc1 while `geom.min.js` reports 2.3.8-SNAPSHOT; and `sweethome3d.min.js` was `Last-Modified` 2025-10-18 with a 7.5.2 banner. A later build may exist behind a different query string or a CDN cache; my numbers are exact for the bytes served on 2026-10-31 15:18 CET (`evidence/livejs-checksums.txt`).
10. **Licence boundary.** Sweet Home 3D is GPL-2.0-or-later with an Oracle Classpath exception on the ported OpenJDK portions; some models are CC-BY. Every idea in section 3 is a behaviour/architecture-level pattern expressed in my own words; no code, XML element names or data structures are copied into any CasaPlazAI artefact. Before any `.sh3d`/`.sh3x` compatibility work, the format obligations must be reviewed separately.

---

### Evidence index (this job folder)

| path | content |
|---|---|
| `report.md` | this report |
| `sources.json` | machine-readable source + evidence list |
| `evidence/live-page.html` | live `SweetHome3DJSOnline.jsp` fetched 2026-10-31 15:18 CET |
| `evidence/livejs/*.js` | the 12 lib/worker files + `resourceCache.js` as served |
| `evidence/livejs-checksums.txt` | sha256 comparison live ↔ round-1 copy (all identical) |
| `evidence/class-inventory-main.json` | 282 marked classes (FQN, offset, exact bytes) + 74 named unmarked classes |
| `evidence/companion-libs.json` | per-file size, banner, class count, packages |
| `evidence/size-accounting.json` | exact byte partition (357 segments, 0 gap, 0 overlap) + per-class and per-subsystem totals |
| `evidence/method-bodies.json` | per-class method counts and method-body bytes (independent cross-check) |
| `evidence/probe-globals.json` | live globals probe (92 Java-class globals, script list) |
| `evidence/probe-result.json` + `probe.err` | proof that `capture-browser-scenario` allows neither `browser.args` nor `evaluate` |
| `evidence/aja-core*.json`, `evidence/aja-core.err` | REA `analyze-javascript-application` run on 5 companion libs |
| `evidence/app-dir/` | the staged 12-file app directory used for that run |
| `tools/README.md` | what each analysis script does and how to re-run it |
| `tools/*.mjs` | the analysis scripts (documented, reproducible) |
