# Sweet Home 3D — background-image import wizard (scale, origin, per-level) vs CasaPlazAI blueprint underlay

Job folder: `06-09d-ui-workflow-shortcuts-backgr` (round 2, deep dive on one narrow question).
Target: **Sweet Home 3D 7.5** (eTeks / Space Mushrooms, GPL) — desktop Java app; browser edition
`https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (same Java core compiled with GWT).

Round-1 report reused read-only:
`~/dsh-workspaces/rea-sweethome3d-2026-10/09-09-ui-workflow-shortcuts/report.md` — this round
builds on its F34–F36 (§2.7 "Background image tracing") and does not redo §2.1–2.6, §2.8–2.10.

Evidence tags: **OBSERVED** = directly seen in a bundle/page/DOM/data file I captured (evidence file
given). **DOCUMENTED** = stated in vendor docs/manual/changelog (URL given). **INFERRED** = my reasoning
from the two above, not vendor-stated.

Round-1 evidence reused read-only is cited as `09-09:raw/...` or `09-09:evidence/...`; new evidence for
this round is under `raw/` and `evidence/` in this folder.

Bundle identity: the codes I cite come from the live browser bundle
`https://www.sweethome3d.com/libjs/sweethome3d.min.js?version=7.5.2`, which I re-downloaded
(`raw/sweethome3d-7.5.2.min.js`, 2 618 789 B, md5 `ddd3e02cc49db40f17058fcc98cade99`, sha256
`053e7d1a…66d89`). It is byte-identical to round 1's `09-09:raw/js/sweethome3d.min.js`, so every byte
offset cited below is reproducible in either copy; the bundle self-reports `CURRENT_VERSION = 7400`
(7.4.0 file format) while the page is served as 7.5.2 (OBSERVED).

---

## 1. Summary

- **The over-size prompt is desktop-only in practice.** The wizard checks the decoded image's pixel
  area: below 10 000 000 px it is used as-is; at or above that it is resampled to an ~8-megapixel copy.
  On desktop a modal offers *Reduce size / Keep unchanged / Cancel*; the browser build's
  preference `isImportedImageResizedWithoutPrompting()` is hard-coded `true`, so the web edition
  downscales without asking. (OBSERVED — bundle + `09-09:raw/js/sweethome3d.min.js`.)
- **The scale step is a free 2-point measuring line, not a "type the image DPI" field.** The wizard
  defaults the line to 10 %→90 % of image width at mid-height, the user drags either endpoint (10 px
  grab radius, Shift locks it horizontal or vertical), and types the *real* length of that line in the
  current unit. The model then stores the pixel line plus that length. (OBSERVED — bundle, and an actual
  shipped home file.)
- **Scale is one derived number applied uniformly, and the canvas is scaled *after* the origin
  translation.** `getScale() = scaleDistance / pixelDistance(line)`; the plan applies
  `translate(-xOrigin,-yOrigin)` then `scale(s,s)`, and because the Java2D port post-multiplies, the
  resulting mapping is **`plan = s·pixel − origin`** — image pixel (0,0) lands at `(−xOrigin,−yOrigin)`,
  i.e. not at plan (0,0) unless the origin is itself zero. The 3D ground plane agrees (a unit quad
  scaled to `(s·w, s·h)`, then translated so the same corner lies at `(−xOrigin,−yOrigin)`); on the plan
  the image is composited at a fixed 70 % alpha under the grid. There is no separate X/Y scale, no
  rotation, no opacity control.
  (OBSERVED — the `translate`/`scale` bodies in `09-09:raw/js/geom.min.js` show post-multiplication.)
- **Origin is a translation offset in current-unit coordinates, not the plan position of image pixel
  (0,0).** *Origin* is subtracted after scaling, so the image's top-left corner sits at
  `(−xOrigin,−yOrigin)`; the guide's "the origin of the image in the plan, i.e. the point in the image
  matching the point (0, 0) in the home plan" is therefore the image pixel at `(xOrigin/s, yOrigin/s)`,
  ~42×32 px in the tutorial. The origin step is a click-to-place canvas plus X/Y spinners in the current
  unit, rounded to one decimal; the plan bounds and scrollbars grow to include the image footprint as
  soon as the bitmap is cached.
  (OBSERVED — bundle + `09-09:raw/history.txt` v1.4; guide wording `09-09:raw/userguide.txt`.)
- **Per-level, with automatic inheritance at level creation.** A background image is a property of a
  `Level`, and the home itself can carry one as the pre-level case. Each of Import / Modify / Hide / Show /
  Delete is a separate gated, undoable action; when the *first* level is created the home's image moves
  onto it, and a newly imported image copies the scale line + origin of the nearest neighbouring level's
  image when they fit. (OBSERVED — bundle, history v5.3.)

## 2. Findings

### 2.1 The data model: exactly eight fields

- **F1 (OBSERVED).** The whole feature is one immutable value object with eight fields — `image`
  (content reference), `scaleDistance`, `scaleDistanceXStart`, `scaleDistanceYStart`,
  `scaleDistanceXEnd`, `scaleDistanceYEnd`, `xOrigin`, `yOrigin` — plus an `invisible` flag. Defaults:
  all numbers 0, `invisible` false. — `09-09:raw/js/sweethome3d.min.js`, class `BackgroundImage`
  (`__class="com.eteks.sweethome3d.model.BackgroundImage"`), byte offset ≈ 51 354.
- **F2 (OBSERVED, real artifact).** A shipped example home (`userGuideExample.sh3d`, the tutorial home
  from the user guide) contains exactly that record as one XML element whose child-of-home position and
  attribute names match the model:
  `<backgroundImage image='0' scaleDistance='474.0' scaleDistanceXStart='70.4' scaleDistanceYStart='800.0'
  scaleDistanceXEnd='630.6' scaleDistanceYEnd='803.0' xOrigin='35.5' yOrigin='27.1'/>`.
  `image='0'` is the ZIP entry name of the embedded blueprint JPEG. No `visible` attribute is written
  because `true` is the default. — `raw/_extracted/userGuideExample-Home.xml` (extracted from
  `raw/userGuideExample.sh3d`), verified byte-identical in intent to the writer at bundle offset
  ≈ 384 600 (`writeAttribute("image",…); writeFloatAttribute("scaleDistance",…); …;
  writeBooleanAttribute("visible", v.isVisible(), true)`).
- **F3 (OBSERVED).** The numbers are in the document's **current length unit**, not in a fixed unit:
  that home is a centimetre home (`wallHeight='250.0'`), and the wizard's scale/origin spinners are
  constructed from `getLengthUnit().getFormat()`, `getMinimumLength()`, `getMaximumLength()` and
  `getStepSize()`, so the same file opened under a metre preference is re-interpreted by the shared
  LengthUnit converters. The default unit itself comes from the browser: `Locale.getDefault()` maps
  `navigator.language` (`de-DE` → `de_DE`) and `DefaultUserPreferences` picks **inch** for `en_US`
  (wall height 243.84, thickness 7.62) and **centimetre** for everything else (wall height 250,
  thickness 7.5). A German visitor therefore gets a centimetre wizard, an American one an inch wizard,
  and the number the user types means a different unit in each. — `raw/_extracted/userGuideExample-Home.xml`;
  bundle offsets ≈ 2 084 678 (`en_US` inch default), ≈ 2 452 204 (scale-distance spinner),
  ≈ 2 456 565 (X/Y origin spinners); `09-09:raw/js/core.min.js` (`Locale.getDefault`).
- **F4 (OBSERVED, real artifact, arithmetic).** The record reproduces the on-screen calibration exactly.
  For the tutorial blueprint (`userGuideBluePrint.jpg`, 694 × 936 px): the stored line
  (70.4, 800.0)→(630.6, 803.0) px is 560.208 px long, declared as 474.0 cm, giving
  **s = 0.84611 cm/px**. With the transform order from F16, the image's plan footprint is
  x ∈ [−35.5, +551.7] cm and y ∈ [−27.1, +764.9] cm, which contains the drawn walls' bounding box
  x ∈ [2.7, 543.6] cm, y ∈ [0.0, 734.9] cm. The tutorial author's calibration therefore is internally
  consistent and the image is not rotated (plain axis-aligned draw). The image pixel that the author
  pinned to plan (0,0) is `(35.5/s, 27.1/s) = (41.96, 32.03)` px, i.e. the origin is a small nudge
  inward from the image corner, consistent with a scanned page whose wall drawing is inset from the
  paper edge. — `raw/userGuideBluePrint.jpg` (694×936 header), `raw/_extracted/userGuideExample-Home.xml`.

### 2.2 The wizard: three steps, two gates

- **F5 (OBSERVED).** `BackgroundImageWizardController` extends a generic `WizardController` and exposes
  `Step = { CHOICE: 0, SCALE: 1, ORIGIN: 2 }` with three step-state objects
  (`imageChoiceStepState`, `imageScaleStepState`, `imageOriginStepState`). Transitions: CHOICE →(next)
  SCALE; SCALE →(back) CHOICE, →(next) ORIGIN; ORIGIN is the last step (back → SCALE, Finish enabled
  unconditionally). Window title = `BackgroundImageWizardController.wizard.title` ("Background image
  wizard"); the step icon is `resources/backgroundImageWizard.png`; the controller is `resizable(true)`.
  — bundle offsets ≈ 1 045 774 (constructor) – 1 048 787 (origin step state).
- **F6 (OBSERVED).** Step gating is data-driven, not validated at Finish: **Next is enabled on CHOICE
  only when an image is loaded** (`setNextStepEnabled(getImage() != null)`, refreshed by an `IMAGE`
  property listener) and **on SCALE only when `scaleDistance != null`** (refreshed by a
  `SCALE_DISTANCE` listener). The ORIGIN step hard-enables Next/Finish. — bundle offsets ≈ 1 048 706
  (`ImageChoiceStepState`), ≈ 1 048 868 (`ImageScaleStepState`), ≈ 1 048 787 (`ImageOriginStepState`).
- **F7 (OBSERVED).** The wizard's own view is built client-side from an inline HTML template by
  `JSViewFactory.createBackgroundImageWizardStepsView`, with three sibling sections
  (`div[choiceStep]`, `div[scaleStep]`, `div[originStep]`) shown/hidden by `updateStep()`. The CHOICE
  section is an `<img>` preview plus a hidden `<input type='file' accept='image/*'>` and a
  "Choose image…" / "Change image…" button, and it accepts **drag-and-drop of an image file onto the
  preview** (`drop` / `dragover` listeners). — bundle offset ≈ 2 448 531.
- **F8 (DOCUMENTED).** Entry points: `Plan > Import background image…` (menu), and the plan's right-click
  menu. `Home > ActionType` indices 124–128 are `IMPORT_BACKGROUND_IMAGE`, `MODIFY_BACKGROUND_IMAGE`,
  `HIDE_BACKGROUND_IMAGE`, `SHOW_BACKGROUND_IMAGE`, `DELETE_BACKGROUND_IMAGE`; "Modify" simply re-opens
  the same wizard (`modifyBackgroundImage() { this.importBackgroundImage() }`). Round 1 observed
  "Import background image…" live in the browser context menu. — bundle offsets ≈ 312 684 (enum),
  ≈ 1 029 610 (handlers), ≈ 2 293 727 (Plan menu) and ≈ 2 296 957 (plan context menu); `09-09:evidence/s5_ctx_plan_a11y.txt`
  lines 1919–1925; `09-09:raw/userguide.txt` ("Importing home blueprint").
- **F9 (OBSERVED).** Gating is a single predicate over the *current image slot*
  (`selectedLevel != null ? selectedLevel.getBackgroundImage() : home.getBackgroundImage()`):
  IMPORT is enabled when there is **no** image for that slot; MODIFY / HIDE / SHOW / DELETE are enabled
  when there **is** one, provided the selected level is viewable (`d == null || d.isViewable()`); HIDE
  when it is visible, SHOW when it is not. — bundle offset ≈ 993 529 (`enableBackgroungImageActions`), ≈ 987 690 (initial full enable pass).

### 2.3 The scale line: geometry the user manipulates

- **F10 (OBSERVED).** On loading a new image with no usable reference, the wizard seeds
  `scaleDistance = null`, the line at `(0.1·w, h/2) → (0.9·w, h/2)` and origin `(0,0)` — i.e. a
  horizontal 80 %-width line across the middle, deliberately oriented so most users only have to drag
  one endpoint. If a reference level image exists whose four line coordinates are each **less than the
  new image's width/height** (no lower bound is checked), the new image inherits that image's
  `scaleDistance`, all four line coordinates **and** its origin instead. The reference is found by
  walking outward from the selected level's index — every lower level first, then every higher one — and
  taking the first image encountered, so "closest level" means index distance, not elevation distance.
  — bundle offset ≈ 2 461 164 (`updateController`), ≈ 1 045 774 (constructor) and ≈ 2 451 764 (`initScaleStep`).
- **F11 (OBSERVED).** Image size handling on load: if `w·h < 10 000 000` the decoded image is used
  directly; otherwise the wizard builds a proportional copy of about 8 000 000 px via a canvas
  `drawImage` + `toDataURL`. When no resize is needed **and** the picked file is already JPEG or PNG,
  the original blob is kept as-is (no re-encode, so no generation loss); otherwise the canvas is
  re-encoded, picking PNG when the image already carries alpha and JPEG when it does not — the alpha
  test scans every pixel's alpha byte of the full-size canvas for any value `< 255` (`isImageWithAlpha`
  → `isCanvasWithAlpha`). — bundle offsets ≈ 1 769 257 (`ImageTools.isImageWithAlpha`,
  `isCanvasWithAlpha`, `ImageTools.resize`) and ≈ 2 462 090 (`checkImageSize`).
- **F12 (OBSERVED).** The desktop modal (`BackgroundImageWizardStepsPanel.reduceImageSize.*`) reads
  *"The image you selected is %dx%d pixels. A large background image might greatly reduce program
  performances if it's not reduced to a smaller size. Should it be reduced to %dx%d pixels?"* with
  **Reduce size / Keep unchanged / Cancel**. In the JS build the dialog is constructed but the branch is
  unreachable: `UserPreferences.prototype.isImportedImageResizedWithoutPrompting = function(){return true}`
  — the browser edition silently downsizes. — `09-09:raw/localization.json`;
  bundle offsets ≈ 2 083 325 and ≈ 2 462 090.
- **F13 (OBSERVED).** Line editing on the scale canvas: mousedown/mousemove/mouseup and
  touchstart/move/end; an endpoint is grabbed when the pointer is within `10 px` (constant `c = 10`) in
  **canvas CSS pixels** (endpoints are converted from image px to canvas px before the test); a drag is
  only applied once `distanceSq(endpoint, pointer) >= 4` — again in canvas px, i.e. a ~2 px dead zone;
  the moved endpoint is then written back in **image pixels**. **Shift**
  constrains the move: the angle from the *opposite* endpoint is measured and, if
  `45° < |angle| <= 135°`, the dragged point keeps the opposite endpoint's x (vertical lock), otherwise
  it keeps the opposite endpoint's y (horizontal lock). Blue line with 5-px butt caps; zoom in/out
  multiplies the preview canvas width by ×2 / ÷2. — bundle offset ≈ 2 451 764.
- **F14 (OBSERVED).** While the scale step is shown, the controller holds `scaleDistance` (a length in
  current units) *and* four pixel coordinates, and both are persisted: the coordinates describe the
  measured line, the scalar carries what the user typed. Re-opening the wizard restores all five so the
  line is redrawn where the user left it. — bundle offsets ≈ 1 045 774 (controller fields/accessors),
  ≈ 384 600 (XML writer), `raw/_extracted/userGuideExample-Home.xml` (F2).

### 2.4 Origin and the model→plan transform

- **F15 (OBSERVED).** The origin step renders the image again on a canvas and marks the image pixel
  that currently maps to plan (0,0) — given F16 that is image pixel `(xOrigin/s, yOrigin/s)`, drawn as a
  small blue disc plus a crosshair; clicking/dragging on the canvas moves it. The pixel→model conversion
  is `origin = round( (clickPixel / k) * 10 ) / 10`, where
  `k = (canvasWidth / imageWidth) / BackgroundImage.getScale(...)` — i.e. **screen px → image px → model
  units, rounded to one decimal of the current unit**. The click handler stores `origin = clickPixel·s`,
  so the clicked image pixel lands exactly on plan (0,0); that rounding is the entire "snap" of the
  origin step. — bundle offset ≈ 2 456 116 (`initOriginStep`), ≈ 2 459 213 (`repaintOriginCanvas`).
- **F16 (OBSERVED, cross-checked).** `getScale()` is exactly `scaleDistance / java.awt.geom.Point2D.distance(xStart,
  yStart, xEnd, yEnd)` — a single scalar. The painter calls `translate(-xOrigin,-yOrigin)` and then
  `scale(s,s)`; the ported `AffineTransform.translate` post-multiplies (`m02 = tx·m00 + ty·m01 + m02`,
  `m12 = tx·m10 + ty·m11 + m12`) and `scale` left-multiplies the linear part, so the net map is
  **`plan = s·pixel − origin`**: image pixel (0,0) → `(−xOrigin,−yOrigin)`, and image pixel (px,py) →
  `(px·s − xOrigin, py·s − yOrigin)`. The origin is thus a plain translate offset applied *after*
  scaling, and `xOrigin`/`yOrigin` are **not** the plan coordinates of a corner. The 3D ground path
  builds the same map independently: it scales a ±0.5 unit quad by `(s·w, 1, s·h)` **and then**
  translates by `(s·w/2 − xOrigin, 0, s·h/2 − yOrigin)`, giving the identical footprint.
  — bundle offsets ≈ 54 861
  (`BackgroundImage.getScale`), ≈ 2 178 879 (`PlanComponent.paintBackgroundImage`), ≈ 2 017 994
  (3D `Ground3D.update`). The same order is independently confirmed on the canvas side, where
  `Graphics2D.translate`/`scale` forward to that `AffineTransform` and to the 2D context in the same
  order. — `09-09:raw/js/geom.min.js` (`AffineTransform.translate`/`scale`),
  `09-09:raw/js/graphics2d.min.js` (`Graphics2D.translate`/`scale`).
- **F17 (OBSERVED).** The plan painter draws the background first, with fixed **70 % alpha**
  (`setTransparency(g, 0.7)`), under the grid and under the walls — consistent with round 1's F36
  observation that walls are drawn semi-transparent while a background image is active.
  — bundle offset ≈ 2 178 879.
- **F18 (OBSERVED).** The image contributes to `PlanComponent.getPlanBounds()`, alongside items and the
  observer camera: for every level with an image the bounds absorb `(−xOrigin, −yOrigin)` and
  `(w·s − xOrigin, h·s − yOrigin)` (using whichever decoded image is currently cached). Note the
  enclosing guard: bounds are only padded while `backgroundImageCache != null`, i.e. the image has been
  loaded into the texture cache — before that a very large underlay can temporarily leave the scroll
  area too small. This is the mechanism behind history v1.4 "Took into account the background image size
  to compute correctly scroll bars surrounding the plan". — bundle offsets ≈ 2 169 592
  (`getPlanBounds`) and ≈ 2 169 871 (the image term); `09-09:raw/history.txt` v1.4.

### 2.5 Per-level semantics and selection

- **F19 (OBSERVED).** An image lives either on a `Level` (`level.getBackgroundImage()` /
  `setBackgroundImage()`, property change `"BACKGROUND_IMAGE"`) or on the `Home` (used while a home has
  no levels). The XML writer for `Level` calls `writeBackgroundImage`, i.e. the same element nests under
  `<level>`; the example home shows the `Home`-level form directly under `<home>`. Round-1 F35 already
  noted `level.setBackgroundImage`. — bundle offsets ≈ 541 172 (`Level` class), ≈ 393 896 (level writer),
  ≈ 384 600 (home writer), `raw/_extracted/userGuideExample-Home.xml`.
- **F20 (OBSERVED).** Which image the *plan* paints is resolved by a search **from the topmost level
  down** for a level that (a) has the same elevation as the level being painted, (b)
  `elevationIndex <= paintedLevel.elevationIndex`, (c) is viewable, (d) has an image, (e) that image is
  visible. If no level matches, it falls back to the home image. So images are effectively matched by
  *elevation*, with `elevationIndex` breaking ties between stacked levels, and invisible/unviewable
  levels' images are skipped. — bundle offset ≈ 2 178 879.
- **F21 (OBSERVED).** The **3D ground plane** uses a different rule: it considers only levels with
  `getElevation() == 0` and `isViewableAndVisible()`, searched top-down, and only if the environment
  flag `BACKGROUND_IMAGE_VISIBLE_ON_GROUND_3D` is set; a home-level image is the fallback for
  level-less homes. The plane is a unit quad scaled to `(s·w, 1, s·h)` and translated by
  `(s·w/2 − xOrigin, 0, s·h/2 − yOrigin)` — the same origin/scale semantics as plan. This matches
  history v6.0 ("Added an option in 3D view modification pane to view background image in 3D view at
  ground level") and the online checkbox `background-image-visible-on-ground-3D-checkbox` whose label is
  *"Background image visible in 3D view"*. — bundle offsets ≈ 2 017 994 (ground plane) and ≈ 530 494
  (property); see F16 for the exact matrix; `09-09:raw/sh3d-online.jsp.html`; `09-09:raw/localization.json`
  (`Home3DAttributesPanel.backgroundImageVisibleOnGround3DCheckBox.text`).
- **F22 (OBSERVED).** Creating the **first level** migrates the home image onto it: `addLevel()` creates
  the level, moves all home items to it, `newLevel.setBackgroundImage(homeImage)`, then
  `home.setBackgroundImage(null)`; the matching `LevelAdditionUndoableEdit` reverses exactly that on
  undo/redo. — bundle offsets ≈ 1 327 200 and ≈ 1 417 546.
- **F23 (DOCUMENTED).** History v5.3: *"Initialized the scale and origin of background images imported at
  new levels with the values of the background image available at the closest level."* — implemented by
  the reference-image logic in F10, which walks strictly neighbouring indices first downward then upward
  from the selected level and takes the first image found. — `09-09:raw/history.txt` v5.3; bundle
  offset ≈ 1 045 774 (constructor).

### 2.6 Actions, undo and the browser edition

- **F24 (OBSERVED).** Five distinct undo entry types keep the feature honest, each storing the affected
  level and re-selecting it:
  (1) `BackgroundImageWizardController.BackgroundImageUndoableEdit` — labelled
  `undoImportBackgroundImageName` when there was no previous image, else `undoModifyBackgroundImageName`
  (the wizard decides with `var c = (oldImage == null)`); restores old/new image on the stored level;
  (2) `HomeController.BackgroundImageVisibilityTogglingUndoableEdit` (`undoHideBackgroundImageName` /
  `undoShowBackgroundImageName`) — clones the value object with flipped `invisible`;
  (3) `HomeController.BackgroundImageDeletionUndoableEdit` (`undoDeleteBackgroundImageName`) — stores the
  removed image. — bundle offsets ≈ 1 052 274 (wizard edit), ≈ 1 036 207 (visibility-edit constructor), ≈ 1 037 564 (deletion edit), ≈ 1 029 610 (handlers).
- **F25 (OBSERVED).** Hide/show is implemented as an undoable *edit* rather than view state, and the
  cloned image preserves `scaleDistance`, all four line coordinates and both origin values exactly
  (F24(2) rebuilds from the current object's accessors). — bundle offset ≈ 1 030 379 (`doToggleBackgroundImageVisibility`, reusing the object's own accessors).
- **F26 (OBSERVED).** In the **browser edition** the wizard is real code in the served bundle
  (`JSViewFactory.prototype.createBackgroundImageWizardStepsView`, F7) and the wizard dialog is created
  through `createWizardView`, while several other desktop secondary surfaces are stubbed in round 1's
  findings (F45). The change log confirms the intent: *"Added in Sweet Home 3D JS Online … dialog boxes
  to modify objects and preferences, contextual menus and **wizards for texture and background image
  import**"* (v6.6.2). The online page exposes no toolbar button for it (`#toolbar-button-*` has no
  `IMPORT_BACKGROUND_IMAGE`); the entry point is the plan context menu. — bundle offsets ≈ 2 448 531 (steps view), ≈ 2 296 957 (plan context menu assembly); `09-09:evidence/studio_dom.html`; `09-09:raw/sh3d-online.jsp.html`;
  `09-09:raw/history.txt` v6.6.2; `09-09:evidence/s5_ctx_plan_a11y.txt`.
- **F27 (OBSERVED, negative).** My own live attempt to reproduce it end-to-end did not complete: a
  5-action scenario (load Studio demo → right-click the plan canvas) ran under
  `rea capture-browser-scenario` and was still executing when I cancelled it at ~23 minutes
  (`evidence/scenarioA.json` `code: "cancelled"`, `cleanup: "complete"`), and a 1-action smoke scenario
  hit REA's 120 s provider deadline before its first step settled (`evidence/scenarioB.json`,
  `code: "provider_timeout"`). Round 1's equivalent scenario5 (same demo, right-click on `#home-plan`)
  *did* succeed and produced the plan context menu including "Import background image…", so the feature's
  reachability online rests on that round-1 observation, not on a new one. Chromium reported here was
  **153.0.8010.12** (Playwright's bundled headless shell, `chromium_headless_shell-1243`).
  — `evidence/scenarioA.json`, `evidence/scenarioB.json`, `raw/scenarioA.json`, `raw/scenarioB.json`.

### 2.7 Chronology and cross-cutting inferences

- **F28 (DOCUMENTED).** Feature history from the vendor changelog: v0.15 added
  *Plan > Import background image…* and its wizard; v1.4 made plan scrollbars account for the image
  size; v1.8 added Hide/Show without deleting; v3.0 made print/copy/export include a displayed image;
  v3.6 forced blue for selections drawn over the image in the wizard; v4.2 added wizard Zoom in/out and
  the Shift horizontal/vertical constraint on the scale line; v5.0 added the size check with the
  downscale offer; v5.3 added the neighbour-level scale/origin inheritance; v6.0 added the 3D
  ground-plane option; v6.6.2 brought the wizard to the browser edition; v7.0 mirrored the image at the
  sky/horizon for best-quality renderings. — `09-09:raw/history.txt` lines 1138, 1039, 961, 830, 711,
  621/622, 527, 469, 372, 264, 246.
- **F29 (DOCUMENTED).** The user guide's framing is deliberately minimal: import a *rotated-correct*
  blueprint, don't import a huge file ("this image is supposed to be a helper, not some art!"), drape a
  coloured line over a known length, type that **real** length (at the current unit), click where plan
  (0,0) is, Finish; fix mistakes later via *Plan > Modify background image…*. It also suggests generating
  a blueprint on an iPhone with a tape-measure app — i.e. the vendor treats "I have no blueprint" as the
  common case, not the exception. — `09-09:raw/userguide.txt` "Importing home blueprint".
- **F29b (DOCUMENTED).** The FAQ turns the scale step into the feature's known failure mode: *"Check the
  size you chose during the second step of the Import background image wizard. The entered value must
  match the size of the line drawn below in the real life, not its size at screen or on the paper you
  scanned. If the current unit is centimeter or inch, this value will be probably much larger than
  100."* The German user guide carries the identical three-step wording
  (*Hintergrundbild importieren*; *Länge der gezeichneten Linie*; *Ursprung … Punkt (0, 0)*), so the flow
  is not an English-only idiom. — `09-09:raw/faq.txt` lines 233–234 (`raw/faq.html`);
  `09-09:raw/de-userguide.txt` lines 193–201 (from `https://www.sweethome3d.com/de/`,
  re-fetched this round as `raw/sm3d-de.html`, HTTP 200, title
  *"Sweet Home 3D: Kostenlose Software für Innenarchitektur für alle"*; the `de/` site tree has no
  online-editor page — `https://www.sweethome3d.com/de/SweetHome3DJSOnline.jsp` returns 404 — and the
  editor's own strings come from the bundle's localisation lookup, which I only read in `en`).
- **F30 (INFERRED).** The eight-field record is deliberately *complete but minimal*: the two line
  endpoints exist not because the renderer needs them (only `scaleDistance`/`getScale()` and the origin
  are used to draw) but so that re-opening the wizard can show the user the line they drew. Storing
  derived state (a `scale` scalar) would have been smaller but would have thrown away the calibration UI
  affordance — the reason the fields are in the save file at all.
- **F31 (INFERRED).** Because the plan painter and the 3D ground plane both reduce the record to
  `(scale, xOrigin, yOrigin, width, height)`, the feature is axis-aligned by construction: there is no
  rotation field in the record (F1) and no rotate call in either painter (F16, F21). A scanner-skewed or
  landscape-rotated blueprint must be rotated outside the app — exactly what F29 tells the user to do.
- **F32 (INFERRED).** The elevation-based image lookup (F20) and the `elevationIndex` tiebreak imply the
  intended mental model is "one tracing plane per storey", even though the field technically lives on
  `Level`: two levels at the same elevation can each carry their own image and be distinguished only by
  `elevationIndex`. In practice this is how mezzanine/attic homes (F23's neighbour lookup) get per-floor
  tracings without a separate "underlay per floor" entity.
- **F33 (INFERRED).** Because IMPORT is gated on the *absence* of an image for the current slot (F9),
  the UI never offers "replace" — replacing is expressed as MODIFY, and the wizard's own Choose-again
  button becomes "Change image…" (F7). One wizard, two verbs, no divergent code path, and one place for
  the reference-image inheritance rule (F10/F23) to live.

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Ranking = value for a single-workspace web floorplanner whose underlay is per floor
(`{ [floorId]: UnderlayState }` under `casaplaza.underlay.v1`, absent from `FloorplanData` by design —
`casaplazai-schema.md`, "Out-of-schema editor state"). Each item names the finding it comes from.

| # | Idea | Why (finding) | Value | Effort |
|---|------|----------------|-------|--------|
| 1 | **Keep CasaPlazAI's underlay per floor and make the "new floor" default inherit the neighbouring floor's underlay transform** (its calibration reference, not necessarily its image), plus expose a one-click "use same calibration as ground floor". This is the exact behaviour Sweet Home 3D added in v5.3 and it is the single biggest win for 2-storey tracing. | F10, F22, F23, F32 | High | Low |
| 2 | **Store the calibration as a two-point measuring line in image pixels + a real length, not as a raw DPI/scale number** — same eight-field record shape, with the line kept so re-opening the calibration re-draws the line the user drew. `UnderlayState` gains `imageWidth/imageHeight`, `p1`, `p2`, `realLength` (metres), `origin`. Keep it under `casaplaza.underlay.v1`, NOT in `FloorplanData`: the schema note already ratifies share links omitting the underlay, so calibration must never be a load-bearing input to validation or 3D — only an editor aid. | F1, F2, F10, F14, F30; `casaplazai-schema.md` (underlay is out-of-schema by construction) | High | Low |
| 3 | **Seed the scale line automatically at 10 %→90 % of image width, mid-height, so the common case is dragging one endpoint.** Add a **Shift** modifier that locks the dragged endpoint to horizontal/vertical relative to the other end. | F10, F13, F28 | High | Low |
| 4 | **Derive and cache a single scalar `metresPerPixel = realLength / pixelDistance(p1,p2)`, then render by *canvas translate then scale* so the net map is `plan = s·pixel − origin`** — one transform for the 2D canvas, and the same `s`/`origin` reused for the 3D ground quad if the underlay is ever shown in 3D. Do **not** add per-axis scale or rotation to `UnderlayState`. | F16, F21, F31 | High | Low |
| 5 | **Store origin as a translation offset subtracted *after* scaling (image top-left at `(−xOrigin,−yOrigin)`), placed by clicking the preview and editable as X/Y in metres, rounded to 1 cm** — matching the reference app exactly, and avoiding the subtle bug of treating origin as "position of pixel (0,0)" (which would double-apply the scale). Grow the plan's scrollable extent by the image footprint so a badly-placed underlay can always be scrolled back to. | F15, F16, F17, F18 | High | Low |
| 6 | **Downscale over-large images on import, silently-but-visibly**: cap the decoded bitmap at ~8 Mpx (triggered at a 10 Mpx threshold), re-encode as PNG only when alpha is present, and show a small non-blocking notice ("resized 8000×6000 → 3300×2475") rather than a modal. | F11, F12 | Med–High | Low |
| 7 | **One undoable entry per underlay verb, with typed labels** ("Import underlay", "Move underlay", "Hide underlay", "Delete underlay"), all storing the floor id and re-selecting it on undo — consistent with round-1 F20's typed-undo pattern and cheap because `UnderlayState` is one small immutable object. | F24, F25 | Med–High | Low |
| 8 | **Gate the five verbs on the current floor's underlay slot** (Import ⇔ no underlay; Calibrate / Hide / Show / Delete ⇔ underlay exists), and use a single "Calibrate underlay" verb that re-opens the same three-step flow for both first import and later adjustment. | F8, F9, F33 | Med | Low |
| 9 | **Make Hide/Show a persisted field inside `UnderlayState`** (an `invisible` boolean) so it survives reload with the rest of the editor-local state and does not require a separate localStorage key. | F1, F25 | Med | Low |
| 10 | **Three-step wizard shell** (Choose → Calibrate → Position origin), reusing one component for import and recalibration; drag-and-drop onto the preview in step 1; next-step disabled until an image exists / calibration is non-null, finish enabled on step 3. | F5, F6, F7 | Med | Med |
| 11 | **Picture-in-picture calibration canvas with zoom in/out (×2 / ÷2) and a 10 px grab radius** on endpoints (scale the grab radius by device pixel ratio in the browser), with the line drawn in a high-contrast colour; move a selection-coloured overlay behind the calibration line. | F13, F28 (v3.6/v4.2) | Med | Med |
| 12 | **Add an explicit "underlay visible on 3D floor" toggle on the underlay inspector**, off by default, restricted to ground-floor/`elevation 0` semantics, and documented as "one underlay may appear on the 3D ground". | F21 | Med (later) | Med |
| 13 | **Refuse the "helper, not art" trap in-product**: reject images above a hard pixel cap with a readable error; after the user types the line length, show the derived metres-per-pixel and the resulting plan footprint ("this image covers 5.9 m x 7.9 m") so a wrong-unit entry is obvious immediately — the reference app's own FAQ documents this as the top confusion, and its rule of thumb is "if the unit is cm, expect a number well over 100". CasaPlazAI works in metres only (`units: "meters"`), so it can display the derived m/px plus a plain "plan measures 11.8 m x 15.8 m" and sidestep the inch/cm ambiguity entirely. | F3, F4, F12, F16, F29, F29b; `casaplazai-schema.md` (`units: "meters"`) | Med–High | Low |
| 14 | **Do not add**: image rotation/skew, per-axis scale, mouse-wheel zoom of the underlay independent of the plan, or a separate "underlay layer" entity. The reference product has none of these and directs users to rotate the scan before importing; matching that keeps `UnderlayState` small and the schema untouched. | F1, F16, F31, F29 | N/A (negative rec.) | — |

---

## 4. Unknowns

**Round-1 Unknowns closed or touched by this round** (from
`09-09:report.md` §4): *"Whether the Online context menus are complete"* — partially closed: the
"Import background image…" item round 1 saw live is confirmed as genuinely wired in the bundle
(`createAction(d.IMPORT_BACKGROUND_IMAGE, …)`), and the exact plan-menu order around it is now known
from the bundle (F8). *"3D-view mode details"* — still open: I read the 3D ground-plane transform from
code (F21) but could not render or view it. *"Version drift"* — narrowed: the live bundle is 7.5.2
(md5 `ddd3e02c…`), the docs are 7.0-era.

- **End-to-end wizard behaviour in the browser edition was not reproduced live by me.** Round 1 observed
  "Import background image…" in the plan context menu, and I confirmed the wizard's full code path and
  markup are inside the served JS bundle (F7, F26), but my own scenarios A and B were cancelled /
  timed out before completing a load (`evidence/scenarioA.json`, `evidence/scenarioB.json`; Chromium
  153.0.8010.12, REA 6.8.0 with a 120 s provider deadline). I did not open the wizard dialog, so its
  online layout, spinner behaviour, file-input acceptance and the touch path (`touchstart`/`touchmove`)
  are asserted from code, not from a live DOM.
- **Which exact DOM/CSS the wizard dialog renders online** (sizing, whether the `[choiceStep]` /
  `[scaleStep]` / `[originStep]` sections inherit the `.dialog-template` styles, and whether the
  preview canvases get the `preview-panel`/`preview-controls` classes styled) is not verified; round 1's
  `09-09:evidence/studio_dom.html` was captured with no wizard open and contains no
  `background-image-wizard` element.
- **Field-level tolerance in `getScaleDistancePoints`.** I read the Shift-constraint and 10 px grab
  radius from code, but the live pointer behaviour (especially with `resolutionScale`/HiDPI, where the
  subclass multiplies by `devicePixelRatio`) was not exercised.
- **Whether any shipped `.sh3x` other than the tutorial uses a level-scoped image.** I checked
  `userGuideExample.sh3d` (home-scoped) and three multi-level examples
  (`2BedroomHouseWithBasement`, `3BedroomHouseWithAttic`, `3BedroomHouseWithMezzanine`) — none contains a
  `<backgroundImage>` element at all, so the `<level>`-nested serialisation is asserted from the writer
  (F19) and the parser, never from a real level-scoped file I inspected.
- **Exact 3D ground appearance.** Round 1's F37 unknown still applies: the 3D canvas is WebGL and my
  headless Chromium had no useful GL path. The 3D ground mapping in F21 is read from the bundle's scene
  graph code (scale/translate matrices, texture transform), not from a rendered image, and I could not
  view screenshots anyway.
- **Locale-derived default unit.** I read `Locale.getDefault()` and the `en_US`-vs-else branch from the
  bundle, but I did not run the wizard under a German browser locale, so whether the *served* app sets
  `window.defaultLocaleLanguageAndCountry` before preferences are constructed (which would override the
  navigator-derived value) is unverified.
- **Whether the origin coordinate is stored in the *document* unit rather than a canonical unit on save**
  when the user's preference unit differs mid-session: the parser/writer pass raw floats and the
  LengthUnit conversion happens in the spinners, so a unit change between import and save is
  theoretically lossless-looking but I did not test a save/reload across a unit switch.
- **`scaleDistance` semantics when the image has been silently resized.** F11 resizes the decoded bitmap
  *before* `setImage`, and the default line coordinates are computed from the resized image's dimensions,
  so the stored coordinates should be in resized-image pixels; I did not verify this with an actual
  >8 Mpx image, and it is a plausible source of calibration drift in the reference app.
- **Version drift.** The online bundle I read is live and serves itself as 7.5.2 (`CURRENT_VERSION`
  7400), but the user guide, FAQ and German guide reused from round 1 are 7.0-era documents; their
  screenshots/wording may predate current wizard chrome even though the three-step model is unchanged.
- **Localisation of the wizard.** I read the `en` strings in `09-09:raw/localization.json` and confirmed
  the German *user guide* wording (F29b), but I did not fetch the German properties bundle for the editor
  itself (the site exposes no `resources/localization_de.properties` at the URL I tried — 404), so whether
  the German in-wizard hints differ from English is unverified.

---

### Licence note

Sweet Home 3D is distributed under the **GNU General Public License**. This report contains no source
code excerpts beyond short factual identifiers (class/method/key/attribute names) needed to cite
behaviour, and no Sweet Home 3D assets are redistributed except the two vendor example files I
downloaded for inspection (`raw/userGuideExample.sh3d`, `raw/userGuideBluePrint.jpg`, both published by
the vendor on the public user-guide page) and three vendor example homes. The tutorial home carries
`License = CC-BY Creative Commons Attribution 3.0 Unported license or GNU General Public License`.
Per-URL licences are listed in `sources.json`.

### Evidence index (this job folder)

- `report.md` (this file), `sources.json`.
- New raw inputs: `raw/scenarioA.json` (context-menu scenario, cancelled), `raw/scenarioB.json`
  (smoke scenario, provider timeout).
- New evidence: `evidence/scenarioA.json` (cancelled partial — Chromium 153.0.8010.12, owned process
  terminated, cleanup complete), `evidence/scenarioB.json` (provider_timeout partial), plus
  `evidence/scenarioA.err`, `evidence/scenarioB.err` (empty).
- Downloaded vendor artifacts: `raw/userGuideExample.sh3d` (+ extracted `raw/_extracted/userGuideExample-Home.xml`),
  `raw/userGuideBluePrint.jpg` (694×936 JPEG), `raw/2BedroomHouseWithBasement.sh3x`,
  `raw/3BedroomHouseWithAttic.sh3x`, `raw/3BedroomHouseWithMezzanine.sh3x` (the 124 embedded binary
  entries of `userGuideExample.sh3d` were not kept; only `Home.xml` was extracted).
- Re-downloaded live editor bundle: `raw/sweethome3d-7.5.2.min.js` (2 618 789 B; md5
  `ddd3e02cc49db40f17058fcc98cade99` — identical to `09-09:raw/js/sweethome3d.min.js`); German site
  homepage `raw/sm3d-de.html` (HTTP 200, 404 683 B).
- Round-1 read-only sources reused: `09-09:raw/js/sweethome3d.min.js`, `09-09:raw/localization.json`,
  `09-09:raw/userguide.txt`, `09-09:raw/history.txt`, `09-09:raw/sh3d-online.jsp.html`,
  `09-09:raw/js/geom.min.js`, `09-09:raw/js/graphics2d.min.js`, `09-09:raw/js/core.min.js`,
  `09-09:raw/studio/Home.xml`, `09-09:evidence/s5_ctx_plan_a11y.txt`,
  `09-09:evidence/studio_dom.html`, `09-09:report.md`.
