# Sweet Home 3D — Printing, PDF and SVG export: page setup, plan scale, multi-level printing, header/footer variables

Round 2 deep-dive for CasaPlazAI, question D: **printing, PDF and SVG export — page setup, plan
scale, multi-level printing, header/footer variables**.

App: **Sweet Home 3D 7.5** (GPLv2+ Java desktop app, `https://www.sweethome3d.com/de/`) and its
browser edition **Sweet Home 3D JS Online 7.5.2** (`https://www.sweethome3d.com/SweetHome3DJSOnline.jsp`),
built from the same Java core by transpiling to JavaScript.

Method / evidence base:
- Round-1 report `rea-sweethome3d-2026-10/08-08-dimensions-levels/report.md` and its
  `docs/`, `res/localization*.json`, `libjs/`, `bundle/` evidence — reused read-only, never
  re-collected.
- Own evidence in this folder:
  - `src/*.java` — verbatim **GPLv2+ source** of Sweet Home 3D 7.5 (`7.5+dfsg-1`), fetched from
    Debian `sources.debian.org` (see `sources.json`). Together with the copyright header in each
    file this satisfies GPL §1 (source *inspection*); **no code from these files is reproduced in
    this report or in any CasaPlazAI deliverable** — only behaviour is described in my own words.
  - `raw/js-online.html` — live page of Sweet Home 3D JS Online 7.5.2.
  - `raw/users-guide.txt`, `raw/*_PageSetupPanel.txt`, `raw/swing_PlanComponent.txt` — javadoc and
    user-guide text extracted from the vendor site.
- Tags: **OBSERVED** (I fetched and read it; file named), **DOCUMENTED** (vendor docs state it),
  **INFERRED** (my reasoning).

Time: started 14:33 CET, research stopped ~15:25, report finalised ~15:30 (well inside 120 min).

## 1. Summary

- **Page setup is a single dialog** (paper format button; three print toggles for furniture list /
  plan / 3D view; best-fit *or* user scale `1 / N` spinner; a **Print levels** section that appears
  only when the home has more than one level; header and footer free-text fields; and a toolbar of
  8 one-click variable-insert buttons).
  (OBSERVED `src/PageSetupPanel.java`, `src/HomePrintableComponent.java`; DOCUMENTED
  https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/PageSetupPanel.html)
- **Plan scale is stored as a single float `planScale` in the `HomePrint` object** — the reciprocal
  of the "1 / N" value, `null` = "best fit". User scale range is 1–10000, step 10, default 100.
  (OBSERVED `src/HomePrint.java`, `src/PageSetupPanel.java`)
- **The 8 header/footer variables are `$pageNumber`, `$pageCount`, `$planScale`, `$date`, `$time`,
  `$name` (home presentation name), `$file` (home file name) and `$level`** — `$level` was added in
  5.0, and `PageSetupPanel.INSERT_<VAR>` actions insert the user code at the caret of the focused
  field. (OBSERVED src `Variable` enum, `res/localization.json`; DOCUMENTED javadoc + history)
- **Multi-level printing (7.2) works by page ordering**: with a user scale, `printedLevels` cycles
  fastest-to-slowest as level → page row → page column, so a 3-level plan at 1/50 becomes blocks of
  tiled pages, one level per block; with best-fit scale each level gets exactly one page. `$level`
  is filled per page, but is blanked when several levels are printed and tiles span pages.
  (OBSERVED `src/PlanComponent.java#print`, `src/HomePrintableComponent.java`)
- **Print-to-PDF is not a separate renderer**: `HomePDFPrinter` replays the *same* `Printable` page
  sequence into an iText `PdfTemplate` via `createGraphicsShapes` (iText's Java2D shape backend,
  so the page content is vector graphics rather than a rasterised image),
  so page setup, scale, levels and header/footer apply identically. **SVG export is by contrast a
  differently-scoped path**: single level (the selected one), fixed scale 1 (1 unit = 1 cm), sized
  to the bounding box of current items, no page frame, no header/footer, and no multi-level choice —
  and the browser edition exposes neither SVG export nor any page setup at all (its print/export
  methods are empty stubs and both of its dialogs resolve to a no-op `dummyDialogView`).
  (OBSERVED source + `libjs/sweethome3d.min.js`; DOCUMENTED user guide)

## 2. Findings

### 2.1 The page-setup dialog — exact control set

**OBSERVED** `src/PageSetupPanel.java` (7.5, GPL source) and the German/English UI strings in
`rea-sweethome3d-2026-10/08-08-dimensions-levels/res/localization*.json`.

The panel is created from `PageSetupController` and contains exactly:

| Group | Control | Field / property | Notes |
| --- | --- | --- | --- |
| Paper | `pageFormatButton` "Page format" / "Papierformat" | `pageFormat` | Opens the platform page dialog; result is decomposed into orientation + paper size + 4 margins |
| Content | `furniturePrintedCheckBox` "Print furniture list" | `furniturePrinted` bool | |
| Content | `planPrintedCheckBox` "Print plan" | `planPrinted` bool | gates the scale radios and the level radios |
| Content | `view3DPrintedCheckBox` "Print 3D view" | `view3DPrinted` bool | hidden when `com.eteks.sweethome3d.no3D`; disabled when off-screen canvas unsupported |
| Scale | `bestFitPlanScaleRadioButton` "Best fit scale" / "An Seitengröße anpassen" | `planScale = null` | |
| Scale | `userPlanScaleRadioButton` "Scale: 1 /" + `userPlanScaleSpinner` | `planScale = 1/N` | spinner model `(10, 1, 10000, 10)`; `DEFAULT_SCALE = 100` when switching to user scale with an empty spinner |
| Levels | `printedLevelsLabel` "Print levels:" / "Niveaus drucken:" | — | **added to the layout only if `printedLevelsList.getModel().getSize() > 1`** |
| Levels | `selectedLevelRadioButton` "Selected level" / "Ausgewählte Niveau" | `printedLevels = null` | |
| Levels | `printedLevelsRadioButton` "Levels:" + multi-select `printedLevelsList` | `printedLevels = List<Level>` | list shows up to 5 rows (`setVisibleRowCount(min(n,5))`), `MULTIPLE_INTERVAL_SELECTION` |
| Header/footer | `headerFormatTextField` / `footerFormatTextField` | `headerFormat` / `footerFormat` strings | both trimmed when written back; empty string ⇒ no header/footer |
| Variables | `variableButtonsToolBar` | — | one button per `HomePrintableComponent.Variable`, enabled only while a text field has focus |

Behavioural details worth copying (OBSERVED):
- **Every change immediately calls `updateController`**, which rebuilds a fresh immutable
  `HomePrint` and pushes it into the controller; the dialog's own listeners are temporarily removed
  and re-added around each update to avoid feedback loops (`removeActionListener` … `updateController`
  … `addActionListener`).
- The panel is a *preview* of a value object: `HomePrint` is **immutable** (all fields `final`); an
  edit constructs a new `HomePrint`. Undo is a `HomePrintModificationUndoableEdit` posted to the
  undo support under `PageSetupController.undoPageSetupName` ("Modify page setup" / "Seite
  einrichten") — i.e. **page setup itself is undoable and applies to the whole home**.
- Margins are recorded *derived from* the page format, not typed: `paperTopMargin = paper.getImageableY()`,
  `paperLeftMargin = paper.getImageableX()`, bottom/right computed as
  `height − imageableHeight − imageableY` / `width − imageableWidth − imageableX`.
- When `planScale == null` the spinner shows no number (`setNullable(true)`); selecting the user
  scale with a null value snaps to `DEFAULT_SCALE = 100`.
- `view3DPrintedCheckBox` is also used to decide whether to clear the current selection before
  printing, so the printed 3D image never contains selection outlines
  (OBSERVED `src/HomePane.java#showPrintDialog`).

### 2.2 Plan scale semantics — `1 / N`, best fit and page tiling

**HomePrint stores the scale as a *float ratio*, not as an `N`** (OBSERVED `src/HomePrint.java`):
`planScale` is "the scale used to print home plan or `null` if no special scale is desired";
the dialog converts with `1f / spinnerValue` and back with `Math.round(1 / planScale)`.

**Print engine** (OBSERVED `src/PlanComponent.java#print`, lines ~2293–2369):

```
if planScale == null:
    printScale = getPrintPreferredScale(g, pageFormat) * cmToInch(72)
    pagesPerRow = pagesPerColumn = 1
    one page per printed level
else:
    printScale = planScale * cmToInch(72)         // 72 units/inch
    pagesPerRow    = ceil(boundsWidth  * printScale / imageableWidth)
    pagesPerColumn = ceil(boundsHeight * printScale / imageableHeight)
    pages = pagesPerRow * pagesPerColumn * printedLevels.size()
```

`getPrintPreferredScale` (OBSERVED, lines ~2224–2241) computes the **largest integer reciprocal**
that still fits the imageable area:

```
extraMargin = getStrokeWidthExtraMargin(paintedItems, PaintMode.PRINT)   // half the widest stroke
scaleInverse = ceil(max((boundsWidth  + 2*extraMargin)/preferredWidth,
                        (boundsHeight + 2*extraMargin)/preferredHeight))
return 1f / scaleInverse
```

The margin is not a paper margin but exactly enough to guarantee the widest line stroke (border,
wall, room, polyline or dimension line, arrowed polylines counting 1.5× thickness) survives at the
plan edge — `BORDER_STROKE_WIDTH = 1` is the floor. (OBSERVED `getStrokeWidthExtraMargin`.)

so "best fit" always yields a *round* 1:N scale at a fixed clean step (…1/20, 1/25, 1/50…), rather
than an arbitrary decimal. It is measured on `getPaintedItems()` = `home.getSelectableViewableItems()`
(walls, rooms, dimension lines, polylines, labels, visible furniture) — **not** on a fixed paper
frame. Consequently:

- **The printed sheet shows exactly one scale**, i.e. it is *not* a fixed 1:100 with extra blank
  paper; the plan is centred inside the imageable rect and, where the layout has spare room, centred
  with `Math.max(0, …)` offsets so it never shifts into the margin.
- **Tiling**: for a user scale, `rowIndex`/`columnIndex` are derived from `pageIndex`, and the paper
  transform is `translate(imageableX − column*imageableWidth, imageableY − row*imageableHeight)`.
  The scale is applied *before* the translation, so adjacent pages tile the plan edge-to-edge with
  no overlap and no gutter. (OBSERVED lines ~2336–2352.)
- **Stroke widths are divided by the print scale** so symbol line weight stays constant in page
  terms; separate `PaintMode.PRINT` branches additionally halve wall/room stroke width
  (`getStrokeWidth` multiplies by `0.5f`) and force **white room fill** (`defaultFillPaint =
  Color.WHITE` vs `Color.GRAY` on screen) and `Color.BLACK` foreground. Wall *patterns* are painted
  at an **effective 150 dpi**: `wallPaintScale = planScale / 72 * 150`. (OBSERVED.)
- The plan's **axes/compass/observer camera** are *not* drawn in `PRINT`/`EXPORT` paint modes;
  grid, rulers and "other levels" ghosting are explicitly `if (paintMode == PaintMode.PAINT)`.
  (OBSERVED `paintContent` lines ~2908–2960.)
- A **fixed print margin escape hatch** exists as a system property:
  `com.eteks.sweethome3d.swing.fixedPrintMargin` (centimetres) forces the imageable area when a
  driver/page dialog returns nonsense (OBSERVED `src/HomePrintableComponent.java#print`; release
  note "Added `com.eteks.sweethome3d.swing.fixedPrintMargin` system property…", OBSERVED round-1
  `docs/history.txt`).
- The **round-1 history timeline** is confirmed by this source: "Added the ability to choose the
  print scale of the plan in page setup pane" (1.5), "Managed the printing of the plan on more than
  one page for big scales" (3.1), "Reduced line thickness in prints" (4.0), "Increased the maximum
  scale in the plan" — the 1–10000 spinner range (OBSERVED round-1 `docs/history.txt` +
  `src/PageSetupPanel.java`).

### 2.3 Multi-level printing (added in 7.2)

**OBSERVED** `src/HomePrint.java` (`@since 7.2` overload), `src/PageSetupController.java`
(`getPrintableLevels()` = `home.getLevels()`), `src/PlanComponent.java`, plus round-1
`docs/history.txt` ("Added multi level printing support", 7.2) and the vendor 7.2 blog
(round-1 `docs/blog7_2.txt`): *"when your home contains more than a level, a new section Print
levels appears in the page setup dialog box to let you choose the levels you want to print during
the same printing printing session."*

Semantics:
- `HomePrint.printedLevels` is `List<Level>` or `null`. `null` ⇒ **only the selected level**
  (`Arrays.asList(home.getSelectedLevel())`). Non-null ⇒ that exact list, in list order.
  (OBSERVED `PlanComponent#print` line 2307.)
- The list is **sorted by elevation, not by click order**: the model is `home.getLevels()`, and
  `Home.addLevel` inserts with `Collections.binarySearch` against a `LEVEL_ELEVATION_COMPARATOR`
  (elevation, then `elevationIndex` as tie-break), re-sorting on load as well. `getSelectedValues()`
  then walks the selection from its minimum to maximum index. So page order is **ascending
  elevation** regardless of the order in which the user ticked the rows — basement, ground, upper.
  (OBSERVED `src/PageSetupPanel.java#updateController`, `src/Home.java` lines 58–67, 645–660.)
- **Page layout is `level` → `row` → `column`** (fastest index last):
  `pageIndex / (pagesPerRow * pagesPerColumn)` selects the level, and within a level
  `rowIndex = idx % (ppr*ppc) / ppr`, `columnIndex = idx % (ppr*ppc) − row*ppr`. On a
  single-page-per-level (best-fit) run, pages are simply one per level in list order.
- Before each level's content is painted, **`clearLevelCache()` is called whenever
  `printedLevel != home.getSelectedLevel()`**, and again after — the plan caches per-level room,
  wall and furniture lists, so printing several levels re-derives those caches on entry/exit.
  (OBSERVED lines ~2355–2362.)
- **The 3D view and the furniture list honour the same level choice.** The furniture `Printable` is
  wrapped in a filter that prints a piece only when
  `printedLevels == null ? piece.isAtLevel(selectedLevel) : printedLevels.contains(piece.getLevel())`
  and `piece.getLevel() == null || piece.getLevel().isViewable()`. (OBSERVED
  `HomePrintableComponent` lines ~330–339.) This is the interesting design point: **multi-level
  printing is a filter applied to the furniture list, not just to the plan sheet.**
- Deleting a level **prunes it from `printedLevels`** and rebuilds the immutable `HomePrint`
  (OBSERVED `src/Home.java` `deleteLevel`-adjacent code, lines ~714–724).
- **No level-count cap exists in this path.** `printedLevelsList` uses
  `setVisibleRowCount(Math.min(printableLevels.size(), 5))` — that is only how many rows are shown
  before the list scrolls, *not* a limit on selection. Round-1 concluded "maximum number of levels
  is not documented; INFERRED to be effectively unbounded" (round-1 `report-plan-features.md`
  §5/line 67), and this code supports that. (OBSERVED `src/PageSetupPanel.java` line 194; the
  round-1 statement is OBSERVED there.) Round-1's 3.4 blog evidence also notes the level tabs are
  "always maintained in the elevation order" — consistent with the elevation sort above.

### 2.4 Header/footer variables — the exact contract

**OBSERVED** `src/HomePrintableComponent.java` `enum Variable` and `getMessageFormat`.

```
PAGE_NUMBER            "$pageNumber"  -> "{0, number, integer}"
PAGE_COUNT             "$pageCount"   -> "{1, number, integer}"
PLAN_SCALE             "$planScale"   -> "{2}"
DATE                   "$date"        -> "{3, date}"
TIME                   "$time"        -> "{3, time}"
HOME_PRESENTATION_NAME "$name"        -> "{4}"
HOME_NAME              "$file"        -> "{5}"
LEVEL_NAME             "$level"       -> "{6}"
```

Value bindings (OBSERVED `formatHeaderFooter`, lines ~482–508):

| Variable | Value |
| --- | --- |
| `$pageNumber` | `page + 1` — the *physical* page index across the whole print job |
| `$pageCount` | `getPageCount()` — computed by **printing the whole document into a 1×1 dummy image first** and counting pages until `NO_SUCH_PAGE`; cached in `pageCount` |
| `$planScale` | `1/round(1/planScale)` when a user scale is set; otherwise `1/round(1/planView.getPrintPreferredScale(imageableWidthCm, imageableHeightCm))` — so header scale always matches what is drawn |
| `$date` / `$time` | a single `printDate` captured on `page == 0` and reused for every page and both fields |
| `$name` | `controller.getContentManager().getPresentationName(homeName, SWEET_HOME_3D)`; for `SWEET_HOME_3D` that is the plain **file name with extension** (`FileContentManager`) |
| `$file` | `home.getName()`, or `""` when the home has no name |
| `$level` | the level name for this page (see below) |

Template grammar (OBSERVED `getMessageFormat`):
- The user text is converted to a `java.text.MessageFormat` pattern.
- **`$$` is the escape for a literal `$`** (sentinel-substituted before and after the rewrite).
- Single quotes are doubled (`'` → `''`) and `{` → `'{'` (MessageFormat's own escaping), so a user's
  literal braces/quotes survive; unmatched braces are therefore tolerated.
- All eight user codes are then replaced by their `{n}` format code; **unknown `$foo` is left as
  literal text** (no error).
- The formatted result is `.trim()`ed and, if empty, the header/footer is suppressed entirely and
  its band is *not* reserved — the plan gets the space back (`if (header.length() > 0)`).
- Font is the application default font at **11 pt** (`headerFooterFont = defaultFont.deriveFont(11f)`),
  and there is a `HEADER_FOOTER_MARGIN = 0.2 cm` in points between band and plan. Header/footer are
  **horizontally centred on the full paper width**, not on the imageable rect (`xHeader =
  (pageFormat.getWidth() − stringWidth)/2`).
- Two bands are supported: a free user header/footer (drawn as plain text) and an optional
  **fixed header/footer** supplied by an (absent-by-default) `HomePrintableComponent.properties`
  bundle, which can differ for the first page (`fixedFirstPageHeader`/`fixedFirstPageFooter`); these
  are JLabels (so they may contain an image/logo) and they *do* shrink the imageable height. In the
  stock build no such properties file exists — early OBSERVED evidence: no `fixedHeader*` key in
  `res/localization*.json`, and `Package`-level resources in Debian contain no such file.
  (INFERRED for the "unused in stock build" conclusion; the mechanism itself is OBSERVED.)
- Buttons `PageSetupPanel.INSERT_<VAR>` are all disabled until a text field gains focus, then all 8
  are enabled; clicking one **replaces the selection** in that field with the code and re-selects the
  inserted code (`textField.replaceSelection`, then select the inserted range). Strings are OBSERVED
  in round-1 `res/localization*.json` (`INSERT_DATE`, `INSERT_HOME_NAME`,
  `INSERT_HOME_PRESENTATION_NAME`, `INSERT_LEVEL_NAME`, `INSERT_PAGE_COUNT`,
  `INSERT_PAGE_NUMBER`, `INSERT_PLAN_SCALE`, `INSERT_TIME`, each with an icon
  `resources/icons/{date,homeFile,homeName,levelName,pageCount,pageNumber,planScale,time}.png`).

**`$level` is subtler than the docs suggest** (OBSERVED `HomePrintableComponent` lines 253–405):
- The default is the **selected level's name**.
- For a *furniture-list* page: if `printedLevels != null`, `$level` is that level's name only when
  exactly one level was selected, **else it is `""`**.
- For a *plan* page: if best-fit scale is used, `$level = printedLevels.get(page − furniturePageCount).getName()`
  (one page per level ⇒ correct name per page). If a user scale is set (i.e. the plan is tiled), it
  again degrades to the single-level name or `""`.
- So: **`$level` is only reliably per-level when each level occupies exactly one page.** This is the
  7.3 fix "Fixed the printed level name in header and/or footer of the pages showing the plan"
  (OBSERVED round-1 `docs/history.txt`) — before it, level pages could carry the wrong name.

### 2.5 Print, Print preview and Print to PDF — one renderer, three front ends

**OBSERVED** `src/HomePane.java`, `src/HomePDFPrinter.java`, `src/HomePrintableComponent.java`,
`src/PrintPreviewPanel.java`, `src/HomeController2.java` (7.5 `viewcontroller/HomeController.java`).

- **`File ▸ Print…`** builds a `PageFormat` from `homePrint` and sets a `HomePrintableComponent` as
  the `Printable` of a real `PrinterJob`; the system print dialog is shown via `printDialog()`.
  The job name is localised `HomePane.print.jobName` = **"Sweet Home 3D"** (`= 'Sweet Home 3D'`,
  round-1 `res/localization.json`), and when the home has a name, `" - " + presentationName` is
  appended. Job runs in a `ThreadedTaskController` with a progress dialog ("Printed page {0}...").
  Note the historical rename "Renamed print process as *Sweet Home 3D* followed by home name"
  (round-1 history) — matches the source.
- **`File ▸ Print preview…`** shows no new renderer either: `PrintPreviewPanel` embeds the very same
  `HomePrintableComponent` as a Swing component (`paintComponent` scales it into the component) with
  a toolbar pair *previous/next page* and a `pageLabel` = `"Page %1$d/%2$d"`; keyboard
  Left/Up/PageUp and Right/Down/PageDown are bound. Next/Prev are enabled by comparing the current
  page with `getPageCount() − 1`.
- **`File ▸ Print to PDF…`** asks for a target file (`ContentManager.ContentType.PDF`) and writes an
  **iText** document whose page rectangle equals the `HomePrint` page format; for every page it
  creates a `PdfTemplate`, calls the *same* `HomePrintableComponent.print(g, pageFormat, page)` into
  it and adds the template to the content byte. Metadata: author = `user.name`, creator =
  `pdfDocument.creator` = **"Sweet Home 3D"** (OBSERVED `src/HomePDFPrinter.properties` — file says
  "do not localize"), creation date, title = presentation name of the home with the PDF content
  type (**file name without extension**, per `FileContentManager` default branch).
  ⇒ **PDF is a faithful print, not an export**: identical pagination, scale, level set and headers.
- Page ordering in one job is **furniture list pages → plan pages → 3D-view page**, with
  `furniturePageCount`/`planPageCount` used to offset the `page` argument given to each
  sub-`Printable` (`page − furniturePageCount` for the plan,
  `page − planPageCount − furniturePageCount` for the 3D view). A page is only marked printed once
  (`printablePages` Set) — this is what stops double-counting. (OBSERVED `src/HomePrintableComponent.java`.)
- **3D-view page** is a 150-dpi offscreen render: `printedImageSize = printSize/72*150`, explicitly
  square (min of imageable width/height), centred, and if off-screen Java 3D is unsupported the
  page simply reports `NO_SUCH_PAGE` — which is why the release note says the "Print 3D view"
  checkbox is hidden/disabled when `com.eteks.sweethome3d.no3D` or offscreen canvas is unavailable.
  (OBSERVED `src/HomeComponent3D.java#print`, `src/PageSetupPanel.java`.)
- **Anti-surprise details** worth stealing: selection is cleared (on the EDT) before printing when
  the 3D view will be printed and "editing in 3D view" is on, then restored; `Thread.interrupted()`
  is checked between pages so the Abort button can stop a long print; the paper's original
  `PageFormat` is restored after each page (`pageFormat.setPaper(oldPaper)`).

### 2.6 SVG export — a different beast, with hard limits

**OBSERVED** `src/PlanComponent.java` (`isFormatTypeSupported`, `exportData`, `exportToSVG`,
`SVGSupport`), `src/HomePane.java#exportToSVG`, javadoc; DOCUMENTED user guide ("Plan > Export to
SVG format…").

- Implemented with **FreeHEP** `SVGGraphics2D` (the Debian build patches only the
  `org.freehep.util` → `org.freehep.graphicsbase.util` package move; the SVG writer itself is the
  same library — OBSERVED `debian/patches/FreeHEP.patch`).
- **Export region = bounding box of the currently painted items**, plus a stroke-width margin, not
  the page. `getItemsBounds(null, getPaintedItems())`; if null, an empty rectangle. The SVG size is
  `ceil(bounds + 2*extraMargin)`. The canvas is then translated by `−minX + extraMargin`.
- **Scale is hard-wired to `svgScale = 1f`** — i.e. **1 SVG user unit = 1 cm** (the plan's internal
  unit). No `1/N`, no page setup, no `width`/`height` in mm, no viewBox-to-paper mapping. A 10 m
  room exports as a 1000-unit shape.
- **Single level: `home.getSelectedLevel()`** is passed to `paintContent` and `PaintMode.EXPORT` is
  used — so the **multi-level print selection is ignored** by SVG export; you get exactly the level
  selected in the UI.
- `PaintMode.EXPORT` behaves like `PRINT` for colours (black on white) but **not** for the wall
  pattern dpi tweak (that branch tests `PaintMode.PRINT` only), and it *is* interruptible
  (`InterruptedIOException` → the partial file is deleted by `HomePane.exportToSVG`'s finally
  block, OBSERVED).
- **No header/footer, no paper frame, no title block, no north arrow**; the compass *is* an item,
  so it is exported as geometry if visible on the plan, but the grid/rulers/other-level ghosting
  are `PAINT`-only and absent.
- FreeHEP properties set: `STYLABLE=true` (CSS classes instead of inline attributes),
  `WRITE_IMAGES_AS = ImageConstants.PNG` (floor textures and background image become **raster
  PNGs embedded** in the SVG), `TITLE = home name or ""`, `FOR = user.name`. The header is written
  with `Locale.ENGLISH` temporarily forced "to avoid wrong encoding when localized dates contain
  accentuated letters" (OBSERVED; this matches round-1 history "Fixed a bug that generated wrong
  SVG files for plans containing texts with the default font" (5.1) and "Fixed transparency of
  rooms in SVG export").
- Save dialog title is `HomePane.exportToSVGDialog.title` = "Export to SVG" and the menu item is
  **`Plan ▸ Export to SVG format…`**, not File — i.e. it reads as a *plan* action while print lives
  under *File*. (OBSERVED `res/localization.json`; the menu location matches the 1.8 release note.)

### 2.7 The browser edition (Sweet Home 3D JS Online 7.5.2) — no print, no page setup, no SVG

**OBSERVED** `raw/js-online.html` (live page) and round-1 `libjs/sweethome3d.min.js` (7.5.2 bundle).

- The page loads the transpiled core `/libjs/sweethome3d.min.js?version=7.5.2` and declares
  `<link rel="stylesheet" href="/libjs/sweethome3djs.css?version=7.5.2">`; `<html lang>` / `?lang=`
  drive the language.
- **Every print/export entry point is a no-op stub.** The JS `HomePane` prototype (the pane class
  used by the applet/online app) contains:
  `showPrintDialog = function(){return null}`, `showPrintToPDFDialog = function(a){return null}`,
  `printToPDF = function(a){}`, `showExportToSVGDialog = function(a){return null}`,
  `exportToSVG = function(a){}`, and likewise for CSV/OBJ; and `HomePane.prototype.setupPage`,
  `previewPrint`, `print` on the controller side are empty. (OBSERVED bundle strings.)
- The JS `JSViewFactory` returns a **shared `dummyDialogView = {displayView:function(a){}}`** for
  `createPageSetupView` and `createPrintPreviewView` — so even if a menu item were wired, the
  page-setup and print-preview dialogs could never appear. (OBSERVED bundle.)
- Actions **are** registered for `PAGE_SETUP`, `PRINT_PREVIEW`, `PRINT`, `PRINT_TO_PDF`,
  `EXPORT_TO_SVG` and `enableDefaultActions` sets them **enabled**, but their handlers are the
  stubs above — consistent with the user guide's umbrella disclaimer: *"Choose File > Page setup…
  … (feature not available in Online and Mobile versions)"* (OBSERVED `raw/users-guide.txt`).
- **The page's own print affordance is CSS-only**: a `@media print` block in `raw/js-online.html`
  hides `#mainHeader, #application-menu-toolbar, #home-pane-toolbar, #catalog-furniture-pane,
  .pane-splitter`, sets `#home-pane * { visibility: hidden }` and then makes only
  `#home-plan canvas` and `#home-3D-view` visible at `width:100%`, plus shows `#mainFooter`
  (the "Sweet Home 3D JS Online / Version 7.5.2" copyright line) as a block. So **a browser
  Ctrl+P prints the raw canvas(es) at 100 % width with a fixed footer line** — no scale control,
  no paper size, no header variables, no level selection, and both the plan and the 3D canvas get
  printed if both are in the DOM. This is the *whole* of the online edition's "printing".
  (OBSERVED `raw/js-online.html`.)
- Consequence of the CSS `#home-pane * {visibility: hidden}` + `canvas {visibility: visible}` trick:
  hidden elements still occupy layout space (visibility, not display), so page breaks are
  unpredictable. (INFERRED.)

### 2.8 What round-1 left open, and how this narrows it

Where round-1's Unknowns touched this question:
- **"Exact per-pixel print algorithm"** — now answered: bounds = painted items; best-fit = ceil of
  the max ratio reciprocal; user scale = cm→1/72 in, page counts by ceil, centring by `max(0, …)`.
- **"Header/footer variable codes"** — now answered exactly (8 codes, `$$` escape, MessageFormat
  semantics, `$level` degradation rule).
- **"What the online/mobile editions offer instead"** — answered: nothing but a `@media print` CSS
  canvas dump; all print/SVG methods are stubbed out and both dialogs are the no-op
  `dummyDialogView`.
- **"Whether `$level` is in the SH3D file"** — answered for the *print attributes*: the
  `print` XML element persists `headerFormat`/`footerFormat`/`planScale`/the three `*Printed`
  booleans/paper size+margins+orientation, plus one `<printedLevel level="ID"/>` child per selected
  level. The header/footer *strings* are persisted verbatim (with `$` codes), not pre-expanded.
  (OBSERVED `src/HomeXMLExporter.java#writePrint`, `src/HomeXMLHandler.java` DTD comment —
  round-1 had only the javadoc.)

### 2.9 German UI wording (`sweethome3d.com/de/`)

Relevant strings (OBSERVED round-1 `res/localization_de.json`, cross-checked against the German
user guide `de-userGuide.txt`):

| English | German |
| --- | --- |
| Page setup | *Seite einrichten* |
| Page format | *Papierformat* |
| Print furniture list | *Mobiliarliste drucken* |
| Print plan | *Plan drucken* |
| Print 3D view | *3D-Ansicht drucken* |
| Best fit scale | *An Seitengröße anpassen* |
| Scale: 1 / | *Maßstab: 1 /* |
| Print levels: | *Niveaus drucken:* |
| Selected level | *Ausgewählte Niveau* (1) |
| Levels: | *Niveaus:* |
| Header: / Footer: | *Kopf: / Fuß:* |
| Variables: | *Variablen:* |
| Print... / Print preview... / Print to PDF... | *Drucken... / Druckvorschau... / Drucken als PDF...* |

(1) The German string is grammatically off ("Ausgewählte Niveau"); CasaPlazAI's German copy should
use *Ausgewähltes Niveau* — a localisation bug our redesign should not inherit. (INFERRED from
grammar; the string itself is OBSERVED.)

### 2.10 Persistence / data-model contrast with CasaPlazAI

This is the part the CasaPlazAI schema team should copy deliberately:

| Sweet Home 3D | CasaPlazAI today |
| --- | --- |
| `HomePrint` is a **first-class, immutable, saved value object** on the Home: paper size, orientation, 4 margins, 3 content toggles, plan scale float, printed-level list, header/footer strings. Serialized into the `.sh3d` XML `print` element, so **page setup is part of the document**. | Print/export settings are absent from `FloorplanData`; editor state like snap and underlay lives under `casaplaza.*` localStorage keys. There is **no print model at all**. |
| `planScale` is a reciprocal **ratio** (`0.01` for 1/100), nullable for best-fit. | No metre↔page concept; PNG/JPEG export only. |
| Levels are separate entities; printing selects a **subset** by reference. | `rooms` carry polygons; the schema has no `Level` entity — floors are an editor concept persisted under `casaplaza.underlay.v1` by `floorId`. |
| `$$` escape + MessageFormat pattern language | none |

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Ranked by (value to a single-page 2D/3D web planner) ÷ (implementation effort). Each cites the
finding it comes from and, where relevant, the CasaPlazAI schema.

**Tier 1 — small effort, high value**

1. **Add a `print` block to the plan schema, mirroring `HomePrint`** *(finding 2.1, 2.4;
   schema §"Top level" / `migrate.ts`)*. A `PrintSettings` value object with
   `{ paperOrientation, paperWidthMm, paperHeightMm, marginsMm, planScale (number|null),
   printedFloorIds (string[]|null), includePlan/includeFurnitureList/include3D, headerFormat,
   footerFormat }`, added under a bumped `SCHEMA_VERSION` with a registered transform. Because
   Sweet Home 3D persists this, "the plan prints the same way tomorrow" is a *document* property,
   not a device property — exactly the kind of frozen-contract value the schema already handles
   well. Effort: one type + one migration; no renderer change. **Highest value/effort ratio.**
2. **A `scale: 1/N` control with a "best fit" default, computed as Sweet Home 3D does**
   *(finding 2.2)*: `N = ceil(max(contentWidthCm/imageableWidthCm, contentHeightCm/imageableHeightCm))`,
   then render at `1/N`. Using `ceil` on the *reciprocal* (not `round` on N) is what makes the
   printed scale a clean round number. Effort: ~30 lines given an existing PNG exporter.
3. **Header/footer variables with the same 8 codes and `$$` escape** *(finding 2.4)*. Reuse the
   exact strings `$pageNumber $pageCount $planScale $date $time $name $file $level` — they are
   short, mnemonic, and already familiar to the competitor's users; `$$` for a literal `$` and
   "unknown code = literal text" are the two rules that avoid support tickets. Effort: a regex
   replace over 8 tokens + a per-page value binder.

**Tier 2 — moderate effort, high value**

4. **Tile big plans across pages instead of shrinking them** *(finding 2.2)*. `pagesPerRow =
   ceil(contentWidth*scale/imageableWidth)`, then translate by `−col*imageableWidth` etc. This is
   what makes a real 1:50 print of a whole flat usable; the tiny effort is the loop and the
   "centre only if there is spare room" (`max(0, …)`) guard.
5. **Print the level subset, and apply it to the furniture list too** *(finding 2.3)*. When the
   user ticks several floors, filter both the plan sheets **and** the furniture schedule by the same
   `printedFloorIds` set. Sweet Home 3D does exactly this through a `FurnitureFilter`; doing it for
   the schedule is the part most competitors forget and it is what makes a multi-storey printout
   internally consistent. Ties to CasaPlazAI's per-floor underlay keyed by `floorId` — reuse
   `floorId` as the level identifier in `printedFloorIds`.
6. **Make the plan/furniture/3D toggles one "output sections" model with deterministic page
   order** *(finding 2.5)*: furniture list → plan pages → 3D page, with page counters used to offset
   each sub-printer. This makes `$pageCount` and a preview possible before rendering, and it is the
   structure needed for a print-preview dialog.
7. **Preview by reusing the export renderer, not by screenshotting the canvas** *(finding 2.5)*.
   Sweet Home 3D's preview embeds the *same* `Printable` and only scales it; Next/Prev just call
   `setPage`. For CasaPlazAI: render the page sequence once into offscreen canvases and page through
   them. Date/scale/level in the header then cannot drift from the actual print.

**Tier 3 — higher effort, differentiator**

8. **Emit a real SVG for the plan, deliberately scoped** *(finding 2.6)*. Copy the *good*
   decisions: bounding-box-sized viewBox, 1 user unit = 1 cm (so 1:100 is `width:100mm` for a
   10 m wall), CSS-stylable shapes, embedded PNG for textures/underlay. Then *beat* it on the
   limitations: keep all floors as `<g id="floor-...">` layers (Sweet Home 3D exports only the
   selected level), keep the underlay as a single `<image>` layer, and add a `<title>`. The
   competitive gap is clear: the incumbent's SVG ignores its own multi-level print selection.
9. **Put page setup where the plan lives, not under File** *(finding 2.6/2.1)*. Sweet Home 3D's
   split — SVG export under *Plan*, print under *File* — is an artefact of a 2007 desktop menu bar.
   In CasaPlazAI's single-page redesign this maps naturally to the **tool card / inspector**: an
   "Export & print" card with Plan (PNG/SVG/JPEG) and Print (PDF) sections, the scale and
   header/footer fields in an expandable "Page setup" group, and the level checklist inside it.
   Ties directly to the in-progress Plan/3D/Walk + inspector redesign.
10. **A "fixed print margin" escape hatch** *(finding 2.2)* — Sweet Home 3D has
    `com.eteks.sweethome3d.swing.fixedPrintMargin` because *printer drivers lie*. A web analogue
    is a user-overridable safe margin (e.g. 5 mm default, "force margins" toggle) rather than
    trusting CSS `@page`. Cheap insurance for PDF output.
11. **Guard the online/print path**: if CasaPlazAI ever offers a browser-native print, do **not**
    copy the JS Online `@media print` + `visibility:hidden` trick (finding 2.7) — it prints
    whatever canvas happens to be in the DOM, in DOM order, with no scale or header control, and
    leaves hidden elements occupying layout space. Instead drive printing from the export renderer.

## 4. Unknowns

- **Whether the level list can be re-sorted by the user**: `getLevels()` is always
  elevation-sorted (`LEVEL_ELEVATION_COMPARATOR`) and the print code honours it, so print order
  tracks elevation. Whether 7.5 also exposes a manual level reordering that changes elevation is
  not verified. (OBSERVED list order; the UI affordance is unverified.)
- **The stock `HomePrintableComponent.properties`** (fixed header/footer with logo, and the
  first-page variants) is not in the Debian `+dfsg` source tree — the DFSG repack may have removed
  it, or upstream ships it only in the binary. I could not verify whether the official download
  shows a logo in the header of every page. No such key exists in the localisation resources.
- **Whether the current 7.5.x desktop download is newer than the `7.5+dfsg-1` sources** used here:
  the JS Online page is served as `version=7.5.2`, and the sources are `7.5+dfsg-1` (Aug 2024).
  Any 7.5.1/7.5.2 print changes are not covered.
- **Exact PDF page geometry on non-integer paper**: `HomePDFPrinter` uses
  `new Rectangle(pageFormat.getWidth(), pageFormat.getHeight())` in points; how iText rounds for
  A4 vs Letter, and whether the PDF is tagged/vector for text, was not tested by rendering a file
  (no Java runtime / iText in this environment).
- **`$pageCount` cost**: it is computed by a full dry-run print into a 1×1 image before the first
  page. For a 40-page tiled plan the real cost (and whether the progress dialog covers it) is
  unmeasured. (OBSERVED algorithm, INFERRED cost.)
- **Printing "all levels" as one combined sheet** (all floors drawn on one plan) is *not* a print
  mode — the plan always prints one level at a time. Whether users work around it with
  `Display all levels` ghosting is not established. (OBSERVED absence in print path.)
- **Mobile editions (iOS/Android)** — out of scope; the user guide's "not available in Online and
  Mobile versions" is the only vendor statement I have.
- **Live browser capture failed**: my headless Chromium could not complete page loads against
  `sweethome3d.com` (navigation left `about:blank`; the site registers a service worker and
  redirects, and the harness sandbox blocked full network-service startup). All browser-edition
  claims therefore rest on the static page HTML + the served 7.5.2 bundle (both fetched with
  `curl` and saved in `raw/`), not on a rendered session. Round-1's `evidence/inspect-live.json`
  (OBSERVED, title/url present) shows the same page did load for them.

## Evidence index (files written in this job folder)

| File | What it is | Source URL |
| --- | --- | --- |
| `raw/js-online.html` | live Sweet Home 3D JS Online page (7.5.2), incl. `@media print` block | https://www.sweethome3d.com/SweetHome3DJSOnline.jsp |
| `raw/users-guide.html`, `raw/users-guide.txt` | user guide Print section | https://www.sweethome3d.com/users-guide/ |
| `raw/faq.html` | FAQ | https://www.sweethome3d.com/faq.jsp |
| `raw/swing_PageSetupPanel.html/.txt` | javadoc for `PageSetupPanel` | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/PageSetupPanel.html |
| `raw/swing_PlanComponent.html/.txt` | javadoc for `PlanComponent` (SVG/paint modes) | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/PlanComponent.html |
| `raw/model_HomePrint.html/.txt` | javadoc for `HomePrint` | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/HomePrint.html |
| `raw/swing_HomePrintableComponent.html` | javadoc for `HomePrintableComponent` (`Variable` enum) | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/HomePrintableComponent.html |
| `raw/swing_HomePDFPrinter.html/.txt` | javadoc for `HomePDFPrinter` | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/HomePDFPrinter.html |
| `raw/swing_PageSetupController.html`, `raw/swing_PrintPreviewController.html` | javadoc for the two print controllers | https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/swing/PageSetupController.html |
| `src/PageSetupPanel.java`, `src/PageSetupController.java`, `src/HomePrintableComponent.java`, `src/HomeComponent3D.java`, `src/HomePDFPrinter.java`, `src/HomePDFPrinter.properties`, `src/HomeComponent3D.properties`, `src/package.properties`, `src/HomePrint.java`, `src/Home.java`, `src/HomeXMLExporter.java`, `src/HomeXMLHandler.java`, `src/HomeFileRecorder.java`, `src/PlanComponent.java`, `src/PrintPreviewPanel.java`, `src/PrintPreviewController.java`, `src/HomePane.java`, `src/HomeController.java`, `src/ContentManager.java`, `src/FileContentManager.java` | Sweet Home 3D 7.5 **GPLv2+** sources (inspection only; no code reused) | `https://sources.debian.org/data/main/s/sweethome3d/7.5%2Bdfsg-1/src/com/eteks/sweethome3d/…` |
| `sources.json` | machine-readable source list with per-fact provenance | — |
| `cdp_eval.py`, `loadtest2.py`, `nav2.py` | attempted live-CDP helpers (see Unknowns) | — |

Reused round-1 evidence (read-only, not modified):
`~/dsh-workspaces/rea-sweethome3d-2026-10/08-08-dimensions-levels/`
— `report.md`, `docs/history.txt`, `docs/blog7_2.txt`, `docs/userGuide_stripped.txt`,
`docs/jdoc_HomePrint.txt`, `docs/jdoc_HomePrintableComponent.txt`, `docs/jdoc_HomePrintableComponent.Variable.html`,
`docs/jdoc_HomePDFPrinter.txt`, `docs/jdoc_PageSetupController.html`, `docs/faq.txt`,
`res/localization.json`, `res/localization_de.json`, `libjs/sweethome3d.min.js`,
`bundle/*.js`, `evidence/inspect-live.json`.
