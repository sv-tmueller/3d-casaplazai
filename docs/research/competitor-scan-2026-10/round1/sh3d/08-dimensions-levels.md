# Sweet Home 3D documented data model & APIs (v7.5 javadoc, Aug 2024)

Primary pages saved under `docs/`: `allclasses-frame.html`, `jdoc_*.html` (DimensionLine, Room,
Label, TextStyle, Compass, Level, LengthUnit, UserPreferences, HomePrint,
HomePrintableComponent, HomePDFPrinter, PlanComponent, Home, HomePieceOfFurniture,
HomeEnvironment, Polyline, PageSetupController…), `history.txt` (history.jsp),
`userGuide_stripped.txt` (users-guide/), `plugins.txt` (plugins.jsp), `faq.txt` (faq.jsp),
`pidevguide.txt` (plug-in-developers-guide/). Javadoc base:
`https://www.sweethome3d.com/javadoc/<path>`.

## 1. Dimension lines — `com.eteks.sweethome3d.model.DimensionLine`
DOCUMENTED: `class DimensionLine extends HomeObject implements Selectable, Elevatable`
("A dimension line in plan"), so it belongs to the plan, not the 3D view. Constructor
`DimensionLine(float xStart, float yStart, float xEnd, float yEnd, float offset)` plus an
overload adding `elevationStart`/`elevationEnd` (and `id` variants). Getters/setters:
`getXStart/setXStart`, `getYStart/setYStart`, `getXEnd/setXEnd`, `getYEnd/setYEnd`,
`getElevationStart/setElevationStart`, `getElevationEnd/setElevationEnd`, `getOffset/setOffset`,
`getEndMarkSize/setEndMarkSize`, `getPitch/setPitch` (radians, rotation about its axis),
`getLength()`, `getColor/setColor`, `getLengthStyle/setLengthStyle`, `getLevel/setLevel`,
`isVisibleIn3D/setVisibleIn3D`, `isElevationDimensionLine()`, `getPoints()` (corners of the
rectangle enclosing line + extension lines), `move`, `containsPoint`. `/…/model/DimensionLine.html`.
`DimensionLine.Property` = `X_START, Y_START, ELEVATION_START, X_END, Y_END, ELEVATION_END,
OFFSET, END_MARK_SIZE, PITCH, LENGTH_STYLE, COLOR, VISIBLE_IN_3D, LEVEL`.
**No FILL/OUTLINE on `DimensionLine`**: `DrawingMode` (`FILL, FILL_AND_OUTLINE, OUTLINE`) belongs
to `HomeEnvironment.DrawingMode` for 3D drawing; the plan's `PlanComponent.PaintMode` =
`CLIPBOARD, EXPORT, PAINT, PRINT`. Snapping is DOCUMENTED in the user guide: click two arbitrary
points **or** hover "the border of a piece of furniture, the wall side or the room side …,
double-click … then click a third time after choosing the size of its extension lines."
`DimensionLineController.DimensionLineOrientation` = `DIAGONAL, ELEVATION, PLAN`;
`PlanController.Mode` includes `DIMENSION_LINE_CREATION`.

## 2. Rooms — `com.eteks.sweethome3d.model.Room`
DOCUMENTED: `class Room extends HomeObject implements Selectable, Elevatable`, "A room or a
polygon"; `Room(float[][] points)`. Polygon: `getPoints()` (`float[][]` of (x,y)), `getPointCount()`,
`setPoints`, `addPoint(x,y[,index])`, `setPoint(x,y,index)`, `removePoint(index)`,
`getPointIndexAt`. Area/perimeter: there is **no `getPerimeter()` and no `getFloorArea()`** in the
7.5 API (OBSERVED absence); the computed value is `getArea()`, with `isClockwise()`,
`isSingular()`, `getXCenter()/getYCenter()`.
Name and area are independent movable texts: name via `getName/setName`,
`getNameXOffset/setNameXOffset`, `getNameYOffset/setNameYOffset`,
`getNameAngle/setNameAngle` (radians, since 3.6), `getNameStyle/setNameStyle`; area via
`getAreaXOffset/setAreaXOffset`, `getAreaYOffset/setAreaYOffset`, `getAreaAngle/setAreaAngle`,
`getAreaStyle/setAreaStyle`, `isAreaVisible()/setAreaVisible(boolean)`. The API stores **offsets
from the room centre**, not absolute `getAreaX()/getNameX()` (those names do not exist).
`Room.Property` = `NAME, NAME_X_OFFSET, NAME_Y_OFFSET, NAME_STYLE, NAME_ANGLE, POINTS,
AREA_VISIBLE, AREA_X_OFFSET, AREA_Y_OFFSET, AREA_STYLE, AREA_ANGLE, FLOOR_*, CEILING_*, LEVEL`.
Area units: `LengthUnit.getAreaFormatWithUnit()` "format[s] areas with their localized unit" →
m² for metric, square feet for imperial (INFERRED for the exact strings). Guide: for a selected
room you "change the location of its area and of its name with the indicators drawn under texts."

## 3. Labels / free texts — `com.eteks.sweethome3d.model.Label`
DOCUMENTED: `Label(String text, float x, float y)`; `getText/setText`, `getX/setX`, `getY/setY`,
`getAngle/setAngle` (radians about vertical axis), `getStyle/setStyle` (returns `TextStyle`),
`getColor/setColor`, `getOutlineColor/setOutlineColor`, `getElevation/setElevation` (since 5.0),
`getGroundElevation()`, `getPitch/setPitch` (`Float`, rotate about horizontal axis in 3D),
`getLevel/setLevel`. `Label.Property` = `TEXT, X, Y, ANGLE, STYLE, COLOR, OUTLINE_COLOR,
ELEVATION, PITCH, LEVEL`. `TextStyle`: `getFontName()`, `getFontSize()`, `isBold()`, `isItalic()`,
`getAlignment()`, `deriveStyle(fontName|fontSize|Alignment)`, `deriveBoldStyle`,
`deriveItalicStyle`; `TextStyle.Alignment` = `LEFT, CENTER, RIGHT`. No line-spacing field in 7.5
(OBSERVED).

## 4. Compass — `com.eteks.sweethome3d.model.Compass`
DOCUMENTED: "A compass used to locate where a home is located and how it's oriented towards
North", `Since: 3.0`, `Compass(float x, float y, float diameter)`. `getX/setX`, `getY/setY`,
`getDiameter/setDiameter`, `isVisible/setVisible`, `getNorthDirection/setNorthDirection`
(**radians**), `getLatitude/setLatitude` (radians), `getLongitude/setLongitude` (radians),
`getTimeZone/setTimeZone` (identifier), `getPoints()`, `getSunAzimuth(long date)`,
`getSunElevation(long date)` (radians, ms since Epoch). `Compass.Property` = `X, Y, DIAMETER,
VISIBLE, NORTH_DIRECTION, LATITUDE, LONGITUDE, TIME_ZONE`. It belongs to the home/plan:
`Home.getCompass()` "Returns the compass associated to this home"; **no `Home.setCompass`** is
listed (OBSERVED). Editing: `CompassController` exposes `getNorthDirectionInDegrees()`,
`getLatitudeInDegrees()`, `getLongitudeInDegrees()`, `getTimeZone()`, `modifyCompass()`;
`CompassPanel` is the "Compass editing panel". History (v3.0): "Added a compass displayed in the
plan as a compass rose and associated to the geographic location of the home"; v2-era/v3.0 also
"sun orientation depending on the chosen hour and date" (photo rendering). No "New compass tool
in plan"/"Modify compass" phrasing appears in the current history page (OBSERVED); the
`Plan > Modify compass…` wording is INFERRED.

## 5. Levels — `com.eteks.sweethome3d.model.Level`
DOCUMENTED: `Level(String name, float elevation, float floorThickness, float height)`
(`Since 3.4`); `getName/setName`, `getElevation/setElevation` ("elevation of the bottom of this
level"), `getFloorThickness/setFloorThickness`, `getHeight/setHeight`, `isVisible/setVisible`,
`isViewable/setViewable` (since 5.0), `isViewableAndVisible`, `getElevationIndex/
setElevationIndex`, `getBackgroundImage/setBackgroundImage` (`BackgroundImage`, "plan background
image of this level"). `Level.Property` = `NAME, ELEVATION, FLOOR_THICKNESS, HEIGHT, VIEWABLE,
VISIBLE, BACKGROUND_IMAGE, ELEVATION_INDEX`. `Home.getLevels()` returns `List<Level>`, with
`addLevel`, `deleteLevel`, `addLevelsListener(CollectionListener<Level>)`, `getSelectedLevel()`;
`Home.Property` includes `ALL_LEVELS_SELECTION, SELECTED_LEVEL`. Objects link to a level via the
`Elevatable` interface `getLevel()/setLevel(Level)` on `HomePieceOfFurniture`, `Wall`, `Room`,
`Label`, `DimensionLine` (each class page).

## 6. Units — `LengthUnit`, `UserPreferences`
DOCUMENTED: only `com.eteks.sweethome3d.model.LengthUnit` is public (the all-classes index lists
no `Unit`, `AreaUnit` or `VolumeUnit` — OBSERVED). Constants: `MILLIMETER, CENTIMETER, METER,
INCH` ("Foot/Inch unit followed by fraction"), `INCH_FRACTION` (since 7.0), `INCH_DECIMALS`
(since 4.0), `FOOT_DECIMALS` (since 7.0). Methods: `getFormat()`, `getFormatWithUnit()`,
`getAreaFormatWithUnit()` (all `java.text.Format`), `getName()`, `isMetric()`, `getStepSize()`,
`getMinimumLength()`, `getMaximumLength()`, `getMaximumElevation()`,
`getMagnetizedLength(length, maxDelta)`, static `centimeterToInch/centimeterToFoot/
inchToCentimeter/footToCentimeter`, abstract `centimeterToUnit/unitToCentimeter`.
`UserPreferences.getLengthUnit()` / `setUnit(LengthUnit)` ("Changes the unit currently in use"),
plus `getCurrency/setCurrency`, `getDefaultFontName`, `isMagnetismEnabled`. The out-of-box default
unit is not stated in the javadoc (INFERRED); history (v5.0) documents the fractional-inch entry
"1/8 1/4 3/8 1/2 5/8 3/4 7/8" for the "Foot/Inch/Fraction" unit.

## 7. Print / PDF / SVG export
DOCUMENTED: `HomePrint` holds print attributes — constructor
`HomePrint(PaperOrientation, paperWidth, paperHeight, top/left/bottom/right margins,
furniturePrinted, planPrinted[, printedLevels], view3DPrinted, Float planScale, headerFormat,
footerFormat)`; getters `isFurniturePrinted()`, `isPlanPrinted()`, `isView3DPrinted()`,
`getPrintedLevels()`, `getPlanScale()` ("scale used to print home plan or null if no special
scale is desired"), `getHeaderFormat()`, `getFooterFormat()`, paper size/margins in 1/72 in,
`getPaperOrientation()`; nested `HomePrint.PaperOrientation`. So page setup selects
paper/orientation/margins, whether to print furniture list, plan and/or 3D view, a plan scale, and
header/footer text.
`HomePrintableComponent implements java.awt.print.Printable` ("print or preview the furniture,
the plan and the 3D view") with `print(g, pageFormat, page)`, `getPageCount()`,
`getPageFormat(HomePrint)`, and nested `Variable` = `DATE, HOME_NAME, HOME_PRESENTATION_NAME,
LEVEL_NAME, PAGE_COUNT, PAGE_NUMBER, PLAN_SCALE, TIME` (allowed header/footer variables, each
with `getFormatCode()`/`getUserCode()`, `getMessageFormat(format)`).
PDF: `com.eteks.sweethome3d.swing.HomePDFPrinter` — "PDF creation is implemented with iText";
`write(OutputStream)` "Writes … the print of a home in PDF format." History v1.0: "Added iText
library to manage print to PDF" / "Managed home print with Print…, Page setup…, Print preview…
and Print to PDF… items of File menu".
SVG export is in the **core** app: `PlanComponent.exportToSVG(OutputStream)` and
`isSVGFormat(Format)` ("Writes this plan … at SVG (Scalable Vector Graphics) format"); also
`exportToImage`. Fit-to-page: `getPrintPreferredScale(float preferredWidth,…)` and
`getPrintPreferredScale(Graphics, PageFormat)` "to make it fill pageFormat imageable size".
History v1.8 attributes SVG to the FreeHEP library ("Plan > Export to SVG format…"). The plugins
page lists no SVG plug-in (OBSERVED). Guide: "File > Print… or File > Print to PDF…" and page
setup modifi[es] "the scale of the printed plan, the header and the footer." A literal "1:50"
example is INFERRED from `getPlanScale()`.

## 8. Stairs / staircases
DOCUMENTED: there is **no `isStaircase()`** on `HomePieceOfFurniture`. Instead
`PieceOfFurniture`/`HomePieceOfFurniture` expose `getStaircaseCutOutShape()/setStaircaseCutOutShape
(String)` — "the shape used to cut out upper levels when they intersect with the piece like a
staircase" (getter since 3.4, setter since 6.5). Stairs are otherwise ordinary furniture
(`HomePieceOfFurniture`), flagged at import: the wizard asks "whether this model is movable, is a
door, a window or a staircase." History v3.4: "Added a new property for staircases in furniture
catalog to define the shape used to cut out the ceiling and the floor of upper levels …" and
"Added a Staircase check box in Import furniture wizard and in Furniture Library Editor." The
door/window flag is separate: `isDoorOrWindow()` + the `DoorOrWindow` interface;
`HomePieceOfFurniture.SortableProperty` has `DOOR_OR_WINDOW` but no staircase constant (OBSERVED).
"Cut at level" = staircase cut-out shape on upper-level floors plus `isAtLevel(Level)` logic.
