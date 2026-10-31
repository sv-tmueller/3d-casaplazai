# Sweet Home 3D — the Virtual Visitor, deep dive (controls, eye height, collisions, level following, 2D-plan drawing/editing)

Job: `rea2-sh3d-p3/06-07b-3d-view-rendering-virtual-vi`
Target: **Sweet Home 3D** — GPL Java/Java3D desktop interior-design app, https://www.sweethome3d.com/de/ , plus the browser edition https://www.sweethome3d.com/SweetHome3DJSOnline.jsp built from the same Java core.
Round 2: builds on `rea-sweethome3d-2026-10/07-07-3d-view-rendering/report.md` (read-only), reuses its evidence, and goes deeper on the **virtual visitor / Virtual visit** only: controls, eye height, collisions, level following, and how the visitor is drawn and edited in the 2D plan.

Evidence convention: **[OBSERVED]** = seen live / in shipped JS / downloaded artifacts (file or URL given); **[DOCUMENTED]** = official Sweet Home 3D page or official javadoc/help (URL); **[INFERRED]** = my deduction. No source code is reproduced (GPL project; our repo is proprietary) — behaviour described in my own words.

Round-1 evidence reused (read-only, from `~/dsh-workspaces/rea-sweethome3d-2026-10/07-07-3d-view-rendering/`):
`localization.json` (all UI strings), `libjs-sweethome3d.min.js` (shipped JS 7.5.2), help-page snapshots, `sh3x/Home.xml`, `probe*.json`.

---

## 1. Summary

- **The virtual visitor is the observer camera.** `Virtual visit` makes `home.getObserverCamera()` the active camera; the same object is the "visitor" drawn in the 2D plan. Default pose in a new home: x=50, y=50, z=170 cm, yaw=7π/4, pitch=π/16, fov=63°. **[OBSERVED]** bundle `Home` constructor; `sh3x/Home.xml`.
- **Eye height is the camera Z, and the drawn body height is 15/14 of it** — a fixed "human proportions" rule, not a separate property. Default 170 cm eyes = 182.1 cm body. **[OBSERVED]** bundle `ObserverCamera.getHeight` etc.; **[DOCUMENTED]** javadoc.
- **Collision: there is none.** The visitor walks through walls, doors, furniture; walls are never queryable for blocking. The official help says so outright ("Nothing prevents the virtual visitor from being inside a wall or very far from home"), and the shipped JS contains no collision code. The only "anti-collision" in SH3D is *furniture-to-wall magnetism during drag*, unrelated to the visitor. **[OBSERVED]** bundle keyword scan; **[DOCUMENTED]** editing3DView.html; round-1 history line 726.
- **Level following is one checkbox with arithmetic, not a physics system.** `Adjust eyes elevation according to selected level` (default on) makes the camera Z a **relative** offset: changing the selected level adds/subtracts its elevation, and changing a level's elevation does the same; an absolute floor of 10 cm + first level elevation is always enforced. **[OBSERVED]** bundle `HomeController3D$1/$2`, `ObserverCameraController.modifyObserverCamera`; **[DOCUMENTED]** editing3DView.html.
- **In the 2D plan the visitor is a live symbol with three drag handles and a field-of-view wedge** — four indicators in SH3D's own words. A body + head shape scaled by eye height (or a fixed camera icon when the plan is small or the home is multi-level), drag-editable for body angle, head angle and eyes elevation, with a live tooltip ("Body angle: 45°", "Eyes elevation: 170 cm", "Visitor height: 1.82 m"). **[OBSERVED]** bundle `paintCamera`, `paintCameraRotationIndicators`, localization; **[DOCUMENTED]** editing3DView.html.

---

## 2. Findings

### A. Controls of the virtual visitor

**A1. Mouse controls (documented + code-confirmed).** In Virtual visit: left-drag horizontally turns the **body** (yaw); left-drag vertically turns the **head** (pitch); the **mouse wheel moves the visitor forward/backward** (not a zoom), i.e. the wheel is a walk control. Holding **alt** while dragging forwards/backwards does the same as the wheel. In both modes left/right arrows act like mouse lateral movement, Page Up/Page Down like mouse forward/backward, Up/Down like the wheel, and in Virtual visit **Home/End move the point of view up/down** and **alt+left / alt+right move it sideways**. **Shift** multiplies the effect of keys/mouse/wheel. **WASD** = arrows. **[DOCUMENTED]** https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/editing3DView.html (and its German, WordPress rendering at https://www.sweethome3d.com/de/ — "Abbildung 17. Maus- und Tastaturaktionen im virtuellen Besuchsmodus"). **[OBSERVED]** the same mappings as an explicit input map in the bundle (see A2).

**A2. The 3D component has a declarative input map + action map.** Input map: `pressed UP`/`pressed W` → MOVE_CAMERA_FORWARD, `shift …` → FAST_FORWARD, `pressed DOWN/S` → BACKWARD, `alt pressed UP/DOWN` → forward/backward, `pressed LEFT/A` and `pressed RIGHT/D` → yaw rotate, `alt pressed LEFT/RIGHT` → sideways move, `pressed PAGE_UP/PAGE_DOWN` → pitch rotate, `pressed HOME/END` → elevate up/down, `pressed ESCAPE` → escape. Action map deltas: forward **+6.5 cm**, fast **+32.5 cm**, backward **−6.5 / −32.5**, sideways **±2.5 / ±10 cm**, elevate **±2.5 / ±10 cm**, yaw **±π/60 (3°) / ±π/12 (15°)**, pitch **±π/120 (1.5°) / ±π/24 (7.5°)**. **[OBSERVED]** bundle `HomeComponent3D.installKeyboardActions`.

**A3. Walk movement is eased, and the step sizes are fixed constants.** The keyboard step and the wheel step both fold into the same `moveCamera`; the wheel converts its delta as `−(delta/4) × 2.5 cm` (×5 with Shift) and then calls the identical walk method. Movement is an animation, not a teleport: `updateViewPlatformTransform(camera, /*animate*/ true)` sets up a **75 ms** eased interpolation of X, Y, Z, yaw and pitch, driven by `requestAnimationFrame`; only a camera *swap* (e.g. switching to Aerial view) is applied instantly (`false`). Separately, `HomeEnvironment` has `videoSpeed` (Float attribute, default **2400/3600 = 0.667 m/s**) which is a *video-path* property, not the walk step — the walk constants (6.5 / 32.5 cm, 3° / 15°, 1.5° / 7.5°) are hard-coded in the 3D component's action map. **[OBSERVED]** bundle `mouseWheelMoved/zoomCamera`, `moveCameraWithAnimation`, `interpolateUntilAlphaEquals1`, `HomeComponent3D` camera listeners, `HomeEnvironment` default/writer.

**A4. Wheel = walk, and it auto-selects the visitor in the plan.** The help states that rolling the wheel (which moves the visitor) automatically selects and reveals the visitor in the plan, unless the preference "Select visitor in plan at 3D move" is off. That is implemented in `ObserverCameraState.selectCamera()`, which fires only when that preference is true and (when 3D editing is enabled) only if nothing else is selected. **[DOCUMENTED]** editing3DView.html; **[OBSERVED]** bundle `ObserverCameraState.selectCamera`; round-1 `UserPreferencesPanel.observerCameraSelectedAtChangeCheckBox.text = 'Enabled'` and live default `true`.

**A5. There is no 3D-navigation collision, gravity, or step-up.** Because movement is pure trigonometry on X/Y/Z, the visitor can pass through walls and furniture, walk off a floor, and go below 0 (deliberately, to visit underground levels). See section C. **[OBSERVED]** bundle `ObserverCameraState.moveCamera`; **[DOCUMENTED]** history 3.5 "Enabled the virtual visitor to go below elevation 0 to visit underground levels".

### B. Eye height and elevation model

**B1. Default pose.** A new `Home` builds `new ObserverCamera(id, 50, 50, 170, 7π/4, π/16, 63°)`: x=50 cm, y=50 cm, **eyes elevation z=170 cm**, yaw=315°, pitch=11.25°, **field of view 63°**. Serialised as `<observerCamera attribute='observerCamera' x='…' y='…' z='…' yaw='…' pitch='…' fieldOfView='…' lens='PINHOLE' time='…'/>` (radians in the file). **[OBSERVED]** bundle `Home` constructor and `sh3x/Home.xml`.

**B2. Human-proportions rule: body height = eyes × 15/14.** The model methods (identical in the shipped JS and in the Java source, whose comments state the intent) are:
- `getHeight() = z × 15/14` — the Java comment reads *"Eyes are 14 / 15 of an adult height"*,
- `getWidth()`: if free-size, `clamp(z × 4/14, 20, 62.5)` cm — *"Adult width is 4 times the distance between head and eyes location"*,
- `getDepth()`: if free-size, `clamp(z × 8/70, 8, 25)` cm — *"Adult depth is equal to the 2 / 5 of its width"*,
- if `fixedSize` **or** `planScale > 1`, the constants are instead **46.6 cm wide, 18.6 cm deep, 175 cm tall**, each multiplied by `planScale`.
So the default 170 cm eyes → 182.1 cm body, 48.6 cm wide, 19.4 cm deep. **[OBSERVED]** bundle `ObserverCamera.getWidth/getDepth/getHeight` + `src-ObserverCamera.java` (lines 170–210); **[DOCUMENTED]** javadoc (`getHeight` = "the height of this observer camera according to human proportions with an eyes elevation at z"). Round 1's Studio snapshot measured 43.6 × 17.5 × 163.7 cm at z=152.8 cm — same rule.

**B3. Elevation is clamped three ways.** (a) `elevateCamera` clamps to `[minimumElevation, lengthUnit.getMaximumElevation()]`, where `minimumElevation = 10 cm + levels[0].elevation` (or 10 cm with no levels) and `MaximumElevation = MaximumLength/10` (metric: 10000 cm = 100 m). (b) The plan's `CameraElevationState.moveMouse` applies the same clamp. (c) `setZ` is not itself clamped, so a file can carry any z; the clamps live in the controllers. **[OBSERVED]** bundle `ObserverCameraState.elevateCamera`, `getMinimumElevation`, `CameraElevationState.moveMouse`, `LengthUnit.getMaximumElevation`.

**B4. The maximum visitor height is historic; today it is just the unit ceiling.** History raised it twice: **1.2.1** from 2.5 m to **10 m** ("the observer point of view still remains at the 13/14 of its height"), then **2.4** to **26.78 m (eyes at 25 m)** — and the comment in the raised-1.2.1 note says 13/14 even though the Java source says 14/15 (see B2; the source is authoritative). The *current* Java source has **no visitor-specific cap**: both the plan elevation state and the 3D elevate action clamp to `preferences.getLengthUnit().getMaximumElevation()`, which `LengthUnit` defines as `getMaximumLength() / 10` — **10000 cm = 100 m** for metric units and `footToCentimeter(3280)/10` for imperial units (the bundle matches: `MaximumLength` is 100000 metric / 3280 ft). The "25 m eyes" figure is therefore a historical UI limit, not a current constant. **[DOCUMENTED]** history (1.2.1, 2.4) + `src-LengthUnit.java`/`src-HomeController3D.java`; **[OBSERVED]** bundle `getMaximumElevation`.

**B5. Elevation tooltip exposes both eye height and body height.** While dragging the elevation indicator, the tooltip shows `"Eyes elevation: %s"` and, **only when the figure is free-size and z is between 70 cm and 218.75 cm**, appends `"Visitor height: %s"` computed as `z × 15/14`. **[OBSERVED]** bundle `CameraElevationState.getToolTipFeedbackText`; `localization.json` (`PlanController.cameraElevationToolTipFeedback`, `PlanController.observerHeightToolTipFeedback = 'Visitor height: %s'`).

**B6. The modification pane.** "Modify virtual visitor" (double-click the visitor in the plan, or **3D view > Modify virtual visitor…**, shortcut **Ctrl+Alt+M / cmd+alt+M**, added in 5.5) has two titled groups: **Location** (X, Y, Eyes elevation) and **Angles** (Body angle, Head angle, Field of view), plus the checkbox **"Adjust eyes elevation according to selected level"**. Labels carry units via a format string: `X (%s):`, `Y (%s):`, `Eyes elevation (%s):`, `Body angle (°):`, `Head angle (°):`, `Field of view (°):`. All angle fields are edited in **degrees** (integer) while the model stores radians (the controller converts via `Math.toRadians`/`toDegrees`). The Swing spinner ranges are now known from source: **Body angle −10000…10000 step 5°**, **Head angle −90…90 step 5°**, **Field of view 2…120 step 1° (added 5.4, default 10 in the spinner)**, and **Eyes elevation from `getMinimumElevation()` to `getMaximumElevation()`** as a nullable length spinner. **[OBSERVED]** bundle `ObserverCameraController` + `src-ObserverCameraPanel.java`; live template `observer-camera-dialog-template` in round-1 `online-app.html`; **[DOCUMENTED]** editing3DView.html + history 5.4/5.5.

**B7. Elevation-adjust semantics (the subtle bit).** The checkbox is *not* a stored field of the camera; it is `HomeEnvironment.observerCameraElevationAdjusted`. `ObserverCameraController` shows the **relative** elevation while the checkbox is on (`setElevation(z − selectedLevel.elevation)`), stores back `z = relative + selectedLevel.elevation`, and only allows the checkbox to be edited when `levels.size() > 1` (`isObserverCameraElevationAdjustedEditable`, DTD-confirmed and source-confirmed). So a home with one level always behaves as "adjusted", with the level at 0. **[OBSERVED]** bundle `ObserverCameraController` + `src-ObserverCameraController.java` (lines 111–124, 230–232); round-1 live `observerCameraElevationAdjusted = true`.

**B8. Level-relative following has two triggers.** (1) Selecting a different level: `HomeController3D$2` adds `newLevel.elevation − oldLevel.elevation` to the camera Z, floored at the minimum. (2) Editing a level's elevation: `ObserverCameraState$0` (a per-level `ELEVATION` listener) calls `updateCameraMinimumElevation()`, which sets `z = max(z, 10 + levels[0].elevation)`. Neither does anything when the preference is off. **[OBSERVED]** bundle.

### C. Collisions

**C1. There is no collision detection for the visitor.** The official help is explicit: *"Nothing prevents the virtual visitor from being inside a wall or very far from home."* Its only guidance is to roll the wheel so the plan scrolls/selects the visitor. The shipped JS contains **zero** collision identifiers in every module I scanned (`libjs-sweethome3d`, `libjs-core`, `libjs-geom`, `libjs-graphics2d`, `libjs-viewmodel`, `libjs-triangulator`, `libjs-swingundo`). Movement is X = X − sin(yaw)·n, Y = Y + cos(yaw)·n with a Z clamp; nothing consults walls, rooms or furniture. **[DOCUMENTED]** editing3DView.html; **[OBSERVED]** bundle scan.

**C2. "Anti-collision" in SH3D means furniture magnetism, not the visitor.** History 3.5: "Improved magnetism of furniture along walls (including round walls) with anti collision system." That belongs to the 2D furniture-drag behaviour. **[DOCUMENTED]** history.

**C3. What *does* constrain the visitor.** Only three things: the Z floor `10 + levels[0].elevation`, the Z ceiling `LengthUnit.getMaximumElevation()`, and pitch clamped to ±90° (both in the 3D state and as the Swing spinner's range). Yaw is unconstrained and wraps; X/Y are unbounded. The Java source of `HomeController3D` contains **no** occurrence of "collision", nor do `PlanController` or `Home`. **[OBSERVED]** bundle `ObserverCameraState` + `src-ObserverCameraPanel.java` + `src-HomeController3D.java`; **[DOCUMENTED]** editing3DView.html.

**C4. Inferred UX consequence (INFERRED).** With no collision, SH3D relies on (a) the plan symbol to tell the user where the visitor is, (b) the auto-select-on-move preference, and (c) wall transparency in Aerial view. A wall-clipping walk mode is a CasaPlazAI opportunity (see Ideas). **[INFERRED]** from C1 + A4 + round-1 C5.

### D. Level following

**D1. One preference, two code paths, arithmetic only.** See B7/B8. The name in the UI is `Adjust eyes elevation according to selected level`; in the data model the flag is `observerCameraElevationAdjusted` on `HomeEnvironment`, not on the camera, so it travels with the home's environment. The DTD declares the attribute with default **true**, and the Studio example's `<environment …>` element omits it (groundColor/skyColor/lightColor/ceillingLightColor + photo/video size and quality only) — consistent with the default. **[OBSERVED]** bundle + `SweetHome3D.dtd` + `sh3x/Home.xml`; **[DOCUMENTED]** javadoc (since 3.5).

**D2. Level visibility is separate from visitor elevation.** `HomeController3D$3` walks levels front-to-back setting each `visible` until it reaches the selected level, honouring `ALL_LEVELS_VISIBLE` — that is the "Display all levels / Display selected level" pair, and it does **not** move the visitor. **[OBSERVED]** bundle round-1 + this pass.

**D3. Underground levels are explicitly supported.** The visitor may go below elevation 0 (history 3.5), the minimum elevation is `10 + levels[0].elevation` (so a level at −100 cm gives a floor of −90 cm), and the 3D ground plane hides itself when the camera is at or below Z=0 (round-1 G1). **[DOCUMENTED]** history; **[OBSERVED]** bundle.

### E. The visitor in the 2D plan (drawing, selection, editing)

**E1. It is painted only while it is the active camera.** `PlanComponent.paintCamera` begins by reading `home.getObserverCamera()` and only draws `if (observerCamera === home.getCamera())` — so the visitor symbol appears in the 2D plan **only while Virtual visit is the active camera**, and disappears in Aerial view. (The method is called once, from the plan's main paint routine, so there is a single call site.) **[OBSERVED]** bundle `paintCamera`. (Consistent with the German guide: "Wenn der Modus Virtueller Besuch ausgewählt ist, wird im Grundriss auch ein virtueller Besucher von oben gezeichnet.")

**E2. Drawing algorithm.** Translate to (x, y), rotate by yaw. Take the visitor's `getPoints()` rectangle, measure its width A and depth e, and scale two pre-built Java2D shapes to that rectangle:
- **body** = `CAMERA_HUMAN_BODY` (an Area union of three ellipses: torso −0.5..0.5 × −0.425..0.425, plus two arm ellipses at ±(0.26..0.5) × −0.3..0.3) when `planScale ≤ 1`;
- **head** = `CAMERA_HUMAN_HEAD` (a long ellipse −0.18..0.18 × −0.45..0.55 with a small triangular nose at the front) when `planScale ≤ 1`;
- when `planScale > 1` (zoomed out small) it uses **`CAMERA_BODY`** (a shoulder-shaped polygon with a flat front) and **`CAMERA_BUTTON`** for the head — that is the "camera symbol at a fixed size when the visitor gets too small" from history line 235.
Body is filled with the normal foreground colour, outlined; if the visitor is selected, the outline is drawn in the selection colour with a thicker stroke and the **union of body+head** is outlined. Then the **field-of-view wedge**: two lines from the eyes scaled by `sin(fov/2)`/`cos(fov/2)` at 0.9× and 2.2× the body depth. **[OBSERVED]** bundle `paintCamera` + `CAMERA_HUMAN_BODY`/`CAMERA_HUMAN_HEAD`/`CAMERA_BODY`/`CAMERA_BUTTON` geometry.

**E3. Three drag handles plus the FOV wedge = SH3D's "four indicators".** `paintCameraRotationIndicators` draws only when the visitor is the **single selected item** (`selectedItems.length === 1 && selectedItems[0] === observerCamera`) and the resize indicators are visible. It draws three handles:
1. at the midpoint of edges 0–3 (the back edge), the **body-angle** rotate indicator (`CAMERA_YAW_ROTATION_INDICATOR`, the furniture rotate glyph rotated −45°);
2. at the midpoint of edges 1–2, the **head-angle** rotate-pitch indicator (`CAMERA_PITCH_ROTATION_INDICATOR`, the furniture pitch glyph rotated 180°);
3. at the midpoint of edges 0–1, an **eyes-elevation** indicator (`CAMERA_ELEVATION_INDICATOR`, a vertical line with a bar and an arrow), preceded by a small round point marker.
The fourth indicator in the official figure is the **field-of-view wedge** drawn as part of E2. **[OBSERVED]** bundle `paintCamera`/`paintCameraRotationIndicators`/`getIndicator`; **[DOCUMENTED]** editing3DView.html (its four numbered items: head angle, field of view, body angle, eyes elevation).

**E4. Drag states and tooltips.** Three dedicated controller states, each entered by pressing within `getIndicatorMargin()` of a handle and each showing live feedback:
- `CameraYawRotationState` — computes an angle from the visitor position to the mouse and applies the delta to yaw; tooltip `Body angle: %d°`.
- `CameraPitchRotationState` — applies `(dy·cos(yaw) − dx·sin(yaw))·π/360`, clamped to ±π/2; tooltip `Head angle: %d°`.
- `CameraElevationState` — applies `−dy` in cm, clamped to `[10 + levels[0].elevation, MaximumElevation]`; tooltip `Eyes elevation: …` (+ `Visitor height: …` when the size is free and within 70–218.75 cm).
All three: `escape` restores the old value; `exit` clears the tooltip and hides the resize indicators. **[OBSERVED]** bundle.

**E5. Moving the visitor from the plan.** The help: drag and drop it, or select it and use the keyboard arrows; the visitor is moved like any other plan object. The generic move path goes through `ObserverCamera.move(dx, dy)` / `setX`/`setY`, which also invalidate the shape cache (so the symbol redraws). Arrow-key behaviour differs depending on whether the plan or the 3D view has focus. **[DOCUMENTED]** editing3DView.html; **[OBSERVED]** bundle `ObserverCamera.move/setX/setY` (cache invalidation) and `ObserverCameraState` (`selectCamera` on move).

**E6. Hit-testing.** `getShape()` returns a rotated ellipse of width×depth for `planScale ≤ 1`, else the rotated rectangle; `containsPoint(x, y, margin)` uses it (with a margin-aware intersects test). Three separate hit tests exist for the three handles: `getYawRotatedCameraAt` (back edge midpoint), `getPitchRotatedCameraAt` (front edge midpoint), `getElevatedCameraAt` (side-edge midpoint), each requiring the visitor to be the single selected `Camera` and each rejecting hits *inside* the body (`!containsPoint`) so the handles don't fight the body drag. **[OBSERVED]** bundle.

**E7. Plan scale and the "too small" rule.** `setPlanScale(scale)` and `setFixedSize(bool)` both invalidate the shapes and re-fire WIDTH/DEPTH/HEIGHT changes (so the plan repaints). Both calls live in **`PlanController`**: on plan zoom it does `getObserverCamera().setPlanScale(scale < 0.4 ? 0.4/scale : 1)` (so the figure never shrinks below a readable size), and at construction plus on every `LEVELS` collection change it does `setFixedSize(home.getLevels().length >= 2)` — so **multi-level homes always draw the fixed-size figure (46.6×18.6×175 cm)** while single-level homes draw the proportional figure. Separately, **`HomePane`** subscribes to the observer camera and repaints the plan when `X`, `Y`, `FIELD_OF_VIEW`, `YAW`, `WIDTH`, `DEPTH` or `HEIGHT` changes, which is how the 2D symbol and the 3D view stay in lockstep on every move. **[OBSERVED]** bundle (`PlanController` scale/levels handlers; `HomePane` camera listener + `addPropertyChangeListener("CAMERA", …revalidate)`); **[DOCUMENTED]** history 3.5 (plan-scale fix), history 6.6 (camera symbol at fixed size).

**E8. The 2D "visitor" is also how you find it.** Since the plan symbol vanishes in Aerial view and the camera can be far away, the wheel-move auto-select (A4) is the designed recovery path. **[DOCUMENTED]** editing3DView.html.

### F. Mouse / keyboard / touch control surface

**F1. Keyboard (3D view focus):** arrows/WASD move & turn as in A2; Page Up/Down pitch; Home/End elevate; Shift = fast; Alt+left/right = strafe; Alt+drag forward/back = wheel. **Documented as not undoable**: "The moves in the 3D view and the modification of the virtual visitor aren't considered as undoable operations", but the current 3D position **is saved with File > Save**. **[DOCUMENTED]** editing3DView.html.

**F2. Keyboard (plan focus):** arrows move the selected visitor like any other object. Same keys, different effect by focus — called out explicitly in the help. **[DOCUMENTED]** editing3DView.html; **[OBSERVED]** round-1's probe15 confirmation of the toolbar/menu.

**F3. Touch.** The 3D component has a full touch path: `touchStarted/touchMoved/touchEnded`, single-finger drag = look/move, pinch distance = zoom/move, a **long-touch** gesture with a visible timer overlay (a CSS ring + a ⇪ glyph) whose delay differs when dragging (`LONG_TOUCH_DELAY_WHEN_DRAGGING` = **400 ms** vs `LONG_TOUCH_DELAY` = **200 ms**, animating for `LONG_TOUCH_DURATION_AFTER_DELAY` = **800 ms**), and double-long-touch. This is the mechanism behind the mobile/Online edition's context menus and editing. **[OBSERVED]** bundle `startLongTouchAnimation`/`touchStarted` and constants.

**F4. Navigation arrows overlay.** A 56×61 px image with an HTML `<map>` of UP/LEFT/DOWN/RIGHT/PAGE_UP/PAGE_DOWN hotspots that synthesise keystrokes; hidden by default, enabled by preference "3D navigation arrows: Visible". The help adds that the two small centre arrows are Page Up/Page Down. **[OBSERVED]** round-1 A6 + bundle `createNavigationPanel`; **[DOCUMENTED]** editing3DView.html.

### G. Data model and serialisation

**G1. Class hierarchy.** `ObserverCamera extends Camera extends HomeObject`. `Camera` holds `name, x, y, z, yaw, pitch, fieldOfView, time, lens, renderer`; `ObserverCamera` adds `fixedSize`, `planScale` and cached shapes (`__transients = ["planScale","shapeCache","rectangleShapeCache","lens","propertyChangeSupport"]`). **[OBSERVED]** bundle; **[DOCUMENTED]** javadoc ObserverCamera/Camera.

**G2. XML.** `<observerCamera attribute='observerCamera' … >` is the live visitor; `<observerCamera attribute='storedCamera' name='…' …>` are stored points of view (same element, different `attribute`). On **load**, `setCameraAttributes` parses each camera element and, for the `observerCamera` attribute, copies pose/time/lens into the live visitor and applies `fixedSize`; `storedCamera` elements are appended to the stored list; `cameraPath` elements go to the environment's video path. The DTD makes `fixedSize` (default false) an **observerCamera-only** attribute (`<camera>` has no such attribute). So **the visitor's pose, FOV, time-of-day, lens and fixed-size flag are all persisted**, but `planScale` is transient (recomputed). Note the round-1 observation that the file records the *active* camera as `<home camera='topCamera'>`. **[OBSERVED]** bundle `setCameraAttributes`; `SweetHome3D.dtd`; `sh3x/Home.xml`.

**G3. Elevation-adjust flag lives in the environment**, and the visitor's Z in the file is **absolute** (Studio's observerCamera z=152.76 cm on a single-level home). On a multi-level home with the checkbox on, the controller converts between the absolute stored Z and the level-relative display Z. **[OBSERVED]** bundle `ObserverCameraController`.

**G4. Undo and recording.** 3D moves and visitor edits are excluded from the undo stack, but a home recorder tracks `topCamera`/`observerCamera` changes per edit and writes them incrementally (`IncrementalHomeRecorder` … `b.observerCamera=f.getObserverCamera().duplicate()`). Two additional source-verified protections keep the visitor from being destroyed or treated as plan content: `PlanController.isItemDeletable` returns false for any `Camera` (so the visitor and stored viewpoints survive Delete), and `isItemPartOfBasePlan` returns false for an `ObserverCamera` (so "lock base plan" and base-plan-only selection never freeze or filter it). **[OBSERVED]** bundle `IncrementalHomeRecorder` + `src-PlanController.java` (lines 986–992, 1088–1094); **[DOCUMENTED]** help "not undoable … saved".

### H. Browser-edition specifics

**H1. The whole visitor model is present in the web build.** The shipped `libjs/sweethome3d.min.js` (v7.5.2) contains `ObserverCamera`, `ObserverCameraState`, `ObserverCameraController`, `ObserverCameraPanel` strings, `paintCamera`, the human-body shapes, the indicator geometry, the input/action maps and the touch path. Only the *dialog chrome* differs (HTML template `observer-camera-dialog-template` with data-name inputs instead of a Swing panel). **[OBSERVED]** bundle + round-1 `online-app.html`.

**H2. The web dialog is a two-column card layout:** left column "Location" with X, Y, Eyes elevation; right column "Angles" with Body angle, Head angle, Field of view; below, the elevation-adjust checkbox. **[OBSERVED]** round-1 `online-app.html` `#observer-camera-dialog-template`.

**H3. Web keyboard handling reuses the same names.** The Online page binds the same `MOVE_CAMERA_*`/`ROTATE_CAMERA_*`/`ELEVATE_CAMERA_*` action names, so the desktop and browser editions behave identically for the visitor. **[OBSERVED]** bundle input/action maps (single code base compiled with GWT).

**H4. What I could not re-verify live this round.** My headless Chromium session loaded the Online JSP URL but the page never finished initialising (`typeof application === 'undefined'`, `document.title === ''`, no canvases, and the DevTools `Runtime.evaluate` channel stopped answering), and I could not get `rea capture-browser-scenario` to complete either; so the *web* claims above rest on the shipped bundle + the round-1 live captures, not on a live session of mine this round. See Unknowns. **[OBSERVED]** my own probe attempts.

### I. Evidence inventory (this job folder)

All paths relative to this job folder. Hashes are SHA-256, first 16 hex chars.

| File | Bytes / SHA-256[:16] | What it is |
|---|---|---|
| `report.md` | this report | — |
| `sources.json` | machine-readable source list with tiers and what each was used for | — |
| `SweetHome3D.dtd` | 13359 / `50db3b47b44f8356` | official file-format DTD: `observerCamera` attributes (`fixedSize` default false), `cameraCommonAttributes`, `environment/@observerCameraElevationAdjusted` default true, `home/@camera` default topCamera, `level/@elevation` |
| `javadoc-ObserverCamera.html` | 34336 / `e21339a9b3d6fa5d` | official 7.5 javadoc: human-proportions getters, `fixedSize`, `planScale`, `getPoints`, `containsPoint`, `move` |
| `javadoc-Camera.html` | 35926 / `2034e2dffbc1b488` | official 7.5 javadoc: pose/FOV/time/lens/renderer, `setCamera` |
| `javax-env.html` | 61518 / `da35a908fc2ba5d5` | official 7.5 `HomeEnvironment` javadoc: `isObserverCameraElevationAdjusted` (since 3.5) |
| `viewer.jsp` | 40978 / `75a4a6f0e7af7e55` | Sweet Home 3D JS Viewer page (reference for the Viewer-specific camera parameters) |
| `src-ObserverCamera.java` | 9745 / `a8f5f1c096bb22b5` | official Java source: human-proportions getters + comments ("Eyes are 14 / 15 of an adult height", "Adult width is 4 times the distance between head and eyes location", "Adult depth is equal to the 2 / 5 of its width"), fixed-size constants 46.6 / 18.6 / 175 |
| `src-ObserverCameraController.java` | 13145 / `050c886c52a347a9` | official Java source: min elevation `10 + levels[0].elevation`, `isObserverCameraElevationAdjustedEditable` (levels > 1), degree/radian edit fields |
| `src-HomeController3D.java` | 63179 / `fbb845d9039a0817` | official Java source: level-elevation and selected-level listeners, `getObserverCameraMinimumElevation`, `selectCamera()`, elevate clamp to `getMaximumElevation()`, zero occurrences of "collision" |
| `src-ObserverCameraPanel.java` | 17303 / `f5184bb942d1fa70` | official Java source: Swing panel spinner ranges (yaw ±10000 step 5°, pitch ±90 step 5°, FOV 2–120 step 1°) and the adjust checkbox |
| `src-Home.java` | 94063 / `7a6ae130be41cc89` | official Java source: default `new ObserverCamera(id, 50, 50, 170, 7π/4, π/16, 63°)` construction |
| `src-LengthUnit.java` | 36076 / `455283b85a99a674` | official Java source: `getMaximumElevation() = getMaximumLength()/10`, metric max length 100000 cm |
| `src-PlanController.java` | 663 KB / `e81b47f5177cfa3b` | official Java source: `isItemPartOfBasePlan` (false for `ObserverCamera`), `isItemDeletable` (false for any `Camera`), selection/editing state machine |
| `cdp.mjs`, `ev.mjs`, `nav.mjs`, `nav2.mjs`, `wstest.mjs`, `probe_smoke.mjs`, `live.mjs`, `live2.mjs` | — | my Chrome-DevTools-Protocol probe scripts (tooling, kept for reproducibility of the live attempt) |
| `chrome-sh3d*.log` (in `/tmp`) | — | Chrome launch logs from the failed live attempts |

The `src-*.java` files are GPL Sweet Home 3D source downloaded read-only from SourceForge; **no source code is reproduced in this report** — they are kept only so every structural claim (constants, clamps, listener wiring) is verifiable.

Round-1 files reused read-only (not copied here): `libjs-sweethome3d.min.js` (7.5.2), `localization.json`, `online-app.html`, `sh3x/Home.xml`, `history.txt`, `de-userguide.html`, `faq_.txt`, `probe*.js`, `rea-out/*`.

---

## 3. Ideas for CasaPlazAI

Context: single-page Vite/TypeScript/Three.js app; `FloorplanData` (v1) is meters-only with `rooms[]{polygon,floorTexture,wallsOverride,roofs}`, `openings[]`, `furniture[]{position,rotationDeg,footprint}`, plus the deliberately out-of-schema keys `casaplaza.snap.settings.v1`, the measurement key, and `casaplaza.underlay.v1`. CasaPlazAI already has a Walk mode; the question is what SH3D's visitor teaches about it.

**Tier 1 — high value, low effort**

1. **Store walk state as out-of-schema editor state first, not as a schema field.** *Ties to G1–G3.* SH3D keeps the visitor as a first-class model object, but the valuable bit is the *shape* of it: `{x, y, eyesHeight, yaw, pitch, fovDeg}`. In CasaPlazAI the safest analogue is a new `casaplaza.walk.v1` key (same pattern as `casaplaza.underlay.v1`/snap), so share links omit it BY CONSTRUCTION and the frozen `FloorplanData` contract is untouched. Only if walk state must be shared should it become a schema v2 addition through `migrate.ts`. *Effort: low. Value: high — walk state survives reload without a migration.*

2. **Eye height as a first-class, editable number with a human-proportions readout.** *Ties to B2, B5.* SH3D's whole model is "z = eyes", with body size *derived* (14/15 body-to-eyes, clamped 20–62.5 cm wide, 8–25 cm deep) and a tooltip that shows the implied body height when z is in a sane range. CasaPlazAI should keep one authoritative `eyesHeight` (default **1.70 m**, matching SH3D's default) and derive a body figure for the mini-map/plan symbol — never store both. Add a slider/number field labelled in metres and, if a body avatar is drawn, show "visitor height 1.83 m" exactly as SH3D does. *Effort: low. Value: high.*

3. **Give Walk mode a real mouse grammar, not just drag-look.** *Ties to A1, A2.* SH3D's split is memorable: **horizontal drag = body yaw, vertical drag = head pitch, wheel = walk forward/back**, plus Page Up/Down for pitch, Home/End for eye height, Alt+←/→ to strafe. Copy that mapping verbatim; it costs nothing and removes the "how do I move?" moment. Keep step sizes similar in spirit (SH3D: 6.5 cm normal / 32.5 cm fast, 3°/15° yaw, 1.5°/7.5° pitch) but re-derive in metres and make Shift the fast modifier. *Effort: low. Value: very high — this is the core of walk UX.*

**Tier 2 — high value, medium effort**

4. **Add collision — this is where CasaPlazAI can beat SH3D, not match it.** *Ties to C1–C4; uses `FloorplanData` directly.* SH3D has **no** visitor collision at all ("Nothing prevents the virtual visitor from being inside a wall"), relying on the plan symbol to recover. CasaPlazAI already has exactly the geometry needed: each `Room.polygon` is CCW, `openings[]` carry `segmentIndex`/`tCenter`/`width`, and `wallHeight` is global. A cheap walk collider = (a) keep the visitor inside the union of room polygons (point-in-polygon with a body radius), (b) treat `room.polygon` segments as walls unless an opening's cutout interval (computed per the schema convention `[tCenter*L ± width/2]`) overlaps the crossing point, (c) slide along the wall instead of stopping. This turns Walk mode from "clip through everything" into something usable, and it is pure derived data — no schema change. *Effort: medium. Value: very high (a genuine differentiator).*

5. **Auto-reveal the visitor on the 2D plan whenever the user moves in 3D.** *Ties to A4, E8.* SH3D's preference "Select visitor in plan at 3D move" (default on) exists precisely because with no collision the user gets lost. CasaPlazAI's Plan/3D/Walk mode switch plus a mini-map means a "you are here" marker that appears/centres the moment a walk input arrives. Since the redesign already has mode tabs, this can be a transient overlay rather than a preference. *Effort: low-medium. Value: high — prevents the "where am I?" dead end.*

6. **Level-relative eye height, copied exactly.** *Ties to B7, B8, D1–D3.* SH3D's rule is elegant: the stored Z is **absolute**, but the edit dialog shows a **relative** offset while "Adjust eyes elevation according to selected level" is on; changing the selected level adds `newElevation − oldElevation`, and a per-level `ELEVATION` listener floors the camera at `0.10 m + levels[0].elevation`. CasaPlazAI is multi-floor: adopt the same split — store `eyesHeight` absolute per floor, but when the user picks a different floor while in Walk mode, translate the visitor by the floor delta and clamp to `0.10 m + minFloorElevation` so the camera never drops under the floor. The out-of-schema walk state from idea 1 can carry the `adjustPerLevel: boolean` flag, mirroring `environment.observerCameraElevationAdjusted` (default true, DTD-confirmed). *Effort: medium. Value: high for multi-storey plans.*

7. **Draw the visitor in the 2D plan as a scaled body with four real handles.** *Ties to E1–E7.* SH3D's plan symbol is only shown while Virtual visit is active, and it is a proportionally-scaled figure (body+head, arms) whose size tracks the eye height, with a **field-of-view wedge** for yaw+fov. On top of that sit three drag handles: body-angle (back edge), head-angle (front edge), eye-height (side edge). For CasaPlazAI this is a natural fit with the new "tool card / inspector" UI: when Walk mode is active, render the visitor at `position` rotated by `yaw` in the plan, scaled from `eyesHeight`, plus a FOV wedge, and make the three handles drag-edit `yaw`/`pitch`/`eyesHeight` with a live tooltip ("Body angle: 45°", "Eyes elevation: 1.70 m"). Reuse the room polygon hit-test helpers already in the editor. *Effort: medium. Value: high — it makes Walk mode editable without leaving the plan.*

8. **A fixed-size fallback symbol when zoomed out or multi-floor.** *Ties to E7.* SH3D switches from the proportional figure to a fixed **46.6 × 18.6 × 175 cm** figure when `planScale > 1` (zoomed out) or whenever the home has ≥2 levels. CasaPlazAI should do the same: below a zoom threshold, or on a multi-floor plan, draw a constant-size marker (with a distinct icon) rather than a 1-pixel figure. *Effort: low. Value: medium-high — small detail, large usability gain at plan scale.*

**Tier 3 — valuable, higher effort**

9. **Walk-through camera path → WebM, reusing the walk controls.** *Ties to A1, A2, E3; complements round-1 idea 8.* SH3D's video is a recorded list of camera poses (position, 2 angles, FOV) replayed through an offline renderer. Since CasaPlazAI will already have a visitor pose model from idea 1, a "record walk" mode can sample that pose (plus per-key eye height) and interpolate. Note SH3D's 3D moves are **not undoable** but are saved with the home — the same split works here: keep walk poses out of the undo stack, persist them under the editor-local key. *Effort: medium-high. Value: high.*

10. **Expose walk step size as one documented constant.** *Ties to A3.* SH3D's steps are hard-coded in the 3D component's action map (6.5 / 32.5 cm; 3° / 15°; 1.5° / 7.5°) and each move is eased over a fixed 75 ms; its `videoSpeed` (default 0.667 m/s) is a *separate* property that only drives video paths. CasaPlazAI should define one `walkSpeedMps` (default ~0.67 m/s for a natural pace) and derive both the per-key step and the animation from it, so "walk speed" is one number in settings rather than several hard-coded constants — while keeping the clear distinction SH3D does not make explicit. *Effort: medium. Value: medium.*

### Explicit anti-patterns to avoid (learned from SH3D's visitor)

- **Don't ship a walk mode with no collision and no recovery.** SH3D's only recovery is the wheel + the "Select visitor in plan at 3D move" preference. CasaPlazAI should have collision (idea 4) *and* the auto-reveal marker (idea 5); either alone leaves a dead end. *Ties to C1, A4.*
- **Don't fragment eye height across the model.** SH3D stores Z on the camera and derives width/depth/height; the *only* place a second number appears is the "14/15" derivation and the tooltip. Storing both `eyesHeight` and `bodyHeight` invites drift. *Ties to B2.*
- **Don't hide the level-adjust flag where it can't be found.** SH3D puts it on the `environment` object but edits it from the visitor dialog, and disables the checkbox on single-level homes. If CasaPlazAI makes it a preference, keep it next to the Walk controls and grey it out when there is one floor. *Ties to B7, D1.*
- **Don't reuse the generic object-move path without thought.** SH3D explicitly excludes the visitor from "base plan" items (`isItemPartOfBasePlan` returns false for `ObserverCamera`) and from the undo stack, while still saving it. CasaPlazAI should decide the same three questions explicitly for its walk pose. *Ties to G4.*

---

## 4. Unknowns

1. **No live web session this round.** My headless Chromium (Chrome for Testing 153, `--use-angle=swiftshader --enable-unsafe-swiftshader`, `--remote-allow-origins=*`) loaded the Online JSP URL but never initialised the app (`typeof application === 'undefined'`, empty title, 0 canvases, then `Runtime.evaluate` stopped answering), and `rea capture-browser-scenario` did not complete either. So *web-runtime* claims (H1–H3) rest on the shipped `libjs-sweethome3d.min.js` 7.5.2 and round-1's live captures, not on a fresh live observation. The *desktop* behaviour is read from the same compiled bundle plus official help/javadoc.
2. **Exact Java-side numeric constants I could not see.** Resolved for the human-proportions getters, the default pose, the minimum elevation and the general unit ceiling by reading the Java source (B2, B4, D1). Still open: whether any *Java3D renderer* code separately clamps the visitor height (the "26.78 m / 25 m eyes" figure is history-stated and I did not find a matching constant in the model/controller/panel/LengthUnit files I read).
3. **Where the elevation clamp actually bites in the desktop UI.** The plan drag state and the 3D keyboard state both clamp; `setZ` does not. I did not test a hand-edited file with z above the unit maximum to see what the renderer does.
4. **The shape of the desktop Swing panel.** I now have the exact Swing widget ranges from `ObserverCameraPanel.java` (B6) and the web template, but I did not see the Java Swing panel render, so its *visual* layout (grouping/spacing) is inferred from the web template + string names.
5. **Touch gesture mapping details.** I confirmed the touch path and the long-touch constants (200 ms idle / 400 ms while dragging, 800 ms animation) in the bundle, but I did not observe which touch gesture maps to which camera action in the Online/mobile UI.
6. **`planScale` semantics at zoom.** I read `setPlanScale(scale < 0.4 ? 0.4/scale : 1)` and that `planScale > 1` forces the fixed-size symbol; I did not verify the exact plan-zoom ranges or whether the threshold feels right at typical widths.
7. **German vs English wording.** Spot-checked the visitor paragraph in the German builder guide (matches the English help); the rest of the German user-guide chapter is a WordPress rendering whose anchors (`#editing3dView`) are JS-driven, so I could not read it as flat text.
8. **The `cameraPath` serialisation.** The DTD allows `attribute='cameraPath'` on `<camera>`/`<observerCamera>` and the reader routes it to `environment.videoCameraPath` (round-1 E1 territory, not the live visitor). I did not check whether the recorder also stores a path *through* the observer camera.
9. **Whether stored points of view capture the elevation-adjust flag.** They capture x/y/z/yaw/pitch/fov/time/lens/renderer (round-1 B2), but the flag lives on the environment, so a stored point is absolute. I did not test "go to point of view" on a multi-level home to confirm the resulting Z.
10. **Visitor visibility on hidden levels.** I confirmed the plan symbol is drawn only when the observer camera is active, and that `HomeController3D$3` controls level visibility; I did not test whether the visitor is filtered when its level is not visible.

---

## Sources

- Official help (English, from source tree): https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/editing3DView.html — the authoritative description of Virtual visit controls, indicators, eye-height-vs-level adjust, and the no-collision statement.
- Official German product site: https://www.sweethome3d.com/de/ (userguide pages; "3D-Ansicht > Virtueller Besuch", four indicators).
- Official javadoc 7.5: `ObserverCamera` (https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/ObserverCamera.html), `Camera` (…/Camera.html), `HomeEnvironment` (…/HomeEnvironment.html — `isObserverCameraElevationAdjusted`, since 3.5).
- Official DTD: https://www.sweethome3d.com/SweetHome3D.dtd — `observerCamera` attribute set incl. `fixedSize` (default false) and `observerCameraElevationAdjusted` (default true).
- Official history: https://www.sweethome3d.com/history/ — visitor height raises (1.2.1 → 10 m; later → 26.78 m / 25 m eyes), level-adjust option, underground levels, fixed-size camera symbol, small-scale plan fix, Ctrl+Alt+M shortcut.
- Shipped web bundle (7.5.2): https://www.sweethome3d.com/libjs/sweethome3d.min.js — behaviour read via round-1's copy (read-only).
- Example home: https://www.sweethome3d.com/examples/Studio.sh3x (`sh3x/Home.xml`), via round-1 evidence.
