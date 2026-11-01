# Sweet Home 3D — 3D view deep dive (aerial vs virtual visitor, cameras, lighting, SunFlow, video, textures, ground/sky, performance)

Job: `rea-sweethome3d-2026-10/07-07-3d-view-rendering`
Target: **Sweet Home 3D**, https://www.sweethome3d.com/de/ — open-source Java/Java3D desktop interior-design app (GPL) plus a **Sweet Home 3D JS Online** WebGL edition at https://www.sweethome3d.com/SweetHome3DJSOnline.jsp.
Evidence convention: **[OBSERVED]** = I saw it in the live app / shipped JS / downloaded artifact myself (file names given); **[DOCUMENTED]** = stated on an official Sweet Home 3D page or official javadoc (URL given); **[INFERRED]** = my deduction from the above.
All quotes are of *UI text*, not source code; no source code is reproduced (GPL project, our repo is proprietary).

---

## 1. Summary

- **Two camera modes with a genuine second camera object:** `3D view > Aerial view` and `3D view > Virtual visit` swap between a *top/aerial* camera that auto-fits the home bounding box and a *human-eye* visitor camera with independent X/Y/elevation, body angle (yaw), head angle (pitch) and field of view. **[OBSERVED]** in the live app (`camera='topCamera'` in `sh3x/Home.xml`; `viewFromTop()`/`viewFromObserver()`; toolbar buttons "View from a top point of view" / "View from a human observer point of view").
- **Named, persistent viewpoints are a first-class model object.** "Store point of view…" duplicates the current camera (position, angles, FOV, **time of day and lens**) under a user name; the Studio demo ships 3 (`Entrance`, `Bedroom`, `Kitchen`); the cap is **50** per home. They serialise into the plan file as `<observerCamera attribute='storedCamera' name=…>`. **[OBSERVED]** + **[DOCUMENTED]**.
- **Lighting is a three-tier model:** (a) a hard-coded real-time rig — 4 directional lights + a fixed `AmbientLight(0.2,0.2,0.2)` tinted by one "light brightness" colour; (b) per-object **light sources** with a 0–100 % **power** and a colour/diameter, stored as a percentage of the furniture's own bounding box; (c) implicit **ceiling lights** auto-placed at room centres, only in the 2 best render qualities, toggled by "Add ceiling lights". Sun direction comes from **Plan > Modify compass…** (latitude, longitude, time zone, North). **[OBSERVED]** (real-time rig, power 0.5 defaults, compass fields) + **[DOCUMENTED]** (ceiling lights, sun).
- **Photo-realistic rendering is a desktop-only, offline CPU batch job.** SunFlow is the default engine, YafaRay an optional faster alternative; both only exist in the Java build — the shipped web bundle contains **zero** occurrences of "SunFlow"/"YafaRay"/renderer classes, and the Online factory returns a stub view for Create photo / Create video. Quality is a 4-step Fast→Best slider, plus lens choice (Default / Depth of field / Fisheye / Spherical) and renderer choice at the 2 best steps. **[OBSERVED]** (bundle keyword counts, `createPhotoView → dummyDialogView`) + **[DOCUMENTED]**.
- **Video = a recorded camera path replayed through the same renderer.** Points are captured live with position, 2 angles and FOV; output is a **QuickTime file**, silent, at size/aspect/frame-rate presets from 176×132@12 up to 7680×4320@25; per-point date/time enables sunlight animations. Estimated time is shown as "N / M – Estimated remaining time". Not available in Online/Mobile. **[DOCUMENTED]** + **[OBSERVED]** (UI strings).

---

## 2. Findings

### A. Aerial view vs. Virtual visit

**A1. Two distinct camera objects, one active camera.** The home model exposes `getTopCamera()`, `getObserverCamera()`, `getCamera()`, `setCamera()`, plus fixed ids `camera-homeTopCamera` / `observerCamera-homeObserverCamera`. The home XML records the active one: `<home version='5500' … camera='topCamera'>`. **[OBSERVED]** — live app probe (`rea-out/probe9.json`), file `sh3x/Home.xml` (from `Studio.sh3x`, sha of the unzipped `Home.xml` is 31 077 chars).

**A2. Menu and shortcut wording.** `3D view > Aerial view` / `3D view > Virtual visit`; short descriptions "View from a top point of view" / "View from a human observer point of view"; the *visitor* dialog is "Modify virtual visitor". Toolbar buttons with those exact titles are present in the live HTML. **[OBSERVED]** (`localization.json` keys `HomePane.VIEW_FROM_TOP.Name`, `HomePane.VIEW_FROM_OBSERVER.Name`, `ObserverCameraPanel.observerCamera.title`; live toolbar dump in `rea-out/probe15.json`). **[DOCUMENTED]**: https://www.sweethome3d.com/users-guide/ and https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/editing3DView.html (shortcuts Ctrl+D / Ctrl+Shift+D).

**A3. Aerial camera is an auto-fitting orbit rig.** The top-camera state accumulates a bounding box over walls, rooms, furniture, polylines, dimension lines and labels, then clamps the orbit distance to `radius × 1.05` minimum and `max(5 × min, 5000)` maximum (cm). There is a preference "Aerial view centered on selection: Enabled" (default **true** in the live app) that recentres the orbit on the selection instead. **[OBSERVED]** in the shipped bundle (`TopCameraState.updateCameraIntervalToAerialViewCenter`, `aerialViewBounds…`, `HomeController3D$3` level-visibility listener; live `isAerialViewCenteredOnSelectionEnabled() === true`). **[DOCUMENTED]** FAQ "Is it possible to manually set the rotation center…": https://www.sweethome3d.com/faq/ .

**A4. Virtual-visitor camera is constrained like a body.** Walking moves `x -= sin(yaw)·n`, `y += cos(yaw)·n`; pitch is clamped to ±90°; FOV is clamped to **2°–120°**; elevation is clamped to `[10 cm + lowest level elevation, unit maximum]` ("Eyes elevation"). `getObserverCameraMinimumElevation()` returns `10 + levels[0].elevation` (10 cm when there are no levels). "Adjust eyes elevation according to selected level" shifts Z when a level changes. **[OBSERVED]** (`ObserverCameraState.*`, live env flag `observerCameraElevationAdjusted = true`). **[DOCUMENTED]** default eyes elevation 170 cm, default FOV 63°, min FOV 2° (source `model/Home.java`, `swing/ObserverCameraPanel.java`, history entry "Set the minimum value of visitor's field of view to 2°").

**A5. The visitor is a real plan object with a footprint.** The observer camera reports `getWidth()/getDepth()/getHeight()` and a rectangle shape used for hit-testing in the plan (the Studio snapshot: 43.6 × 17.5 × 163.7 cm at Z = 152.8 cm, i.e. a 1.63 m tall visitor), and it can be selected/moved from the plan. **[OBSERVED]** (`rea-out/probe9.json`). **[DOCUMENTED]** — history 6.6: "Displayed the virtual visitor with a camera symbol at a fixed size when the virtual visitor gets too small in the plan."

**A6. Navigation UI: an optional on-canvas arrow map.** The 3D component can create a navigation panel: a 56×59 px image with an HTML `<map>` containing `UP / LEFT / DOWN / RIGHT / PAGE_UP / PAGE_DOWN` hotspots that synthesise keystrokes. It is hidden by default (`isNavigationPanelVisible() === false` in the live app) and enabled by the preference "3D navigation arrows: Visible". **[OBSERVED]** (`HomeComponent3D.createNavigationPanel`, live `probe28`: 18 simulated key elements, default false). **[DOCUMENTED]** preferences help.

### B. Stored camera / point-of-view system

**B1. Actions.** `STORE_POINT_OF_VIEW` ("Store point of view…", dialog title "Store point of view", prompt "Give a name to the current point of view:"), `GO_TO_POINT_OF_VIEW` ("Go to point of view"), `DELETE_POINTS_OF_VIEW` ("Delete points of view…", with a "Delete points of view" confirmation listing "Points of view to delete:"), `CREATE_PHOTOS_AT_POINTS_OF_VIEW`. **[OBSERVED]** live action map (`rea-out/probe23.json`, `STORE_POINT_OF_VIEW enabled=true`, `CREATE_PHOTOS_AT_POINTS_OF_VIEW enabled=false` while no viewpoint was selected) + `localization.json`.

**B2. What a stored viewpoint captures.** `storeCamera(name)` **duplicates the active camera** — so X, Y, Z, yaw, pitch, field of view, **time**, **lens** and renderer all travel with it — then de-duplicates (same name, or identical position/angles/FOV/time/lens/renderer replace the old entry), inserts newest-first, and truncates to `preferences.getStoredCamerasMaxCount()`. **[OBSERVED]** in the bundle and live (`getStoredCamerasMaxCount() === 50`). **[DOCUMENTED]**: max 50 since 4.5 (https://www.sweethome3d.com/history/); each point keeps date/time/lens (creatingPhotos.html).

**B3. Serialisation.** In `Home.xml` a stored point is another `<observerCamera>` with `attribute='storedCamera'` and `name=…`:
`<observerCamera attribute='storedCamera' name='Entrance' lens='PINHOLE' x='268.3578' y='444.17062' z='152.75717' yaw='-2.9197562' pitch='0.1793462' fieldOfView='1.5707964' time='1491480000000'/>`
**[OBSERVED]** `sh3x/Home.xml`.

**B4. "Go to point of view" is a jump, not a blend.** `goToCamera(camera)` copies the camera into the *observer* camera (`setCamera`, `setTime`, `setLens`, `setRenderer`) and switches the view to Virtual visit when the target is the observer camera; it also moves the target to the front of the list. **[OBSERVED]** bundle + `localization.json` `PlanController.cameraElevationToolTipFeedback = "Eyes elevation: %s"`.

### C. Lighting and light sources

**C1. Real-time rig is fixed and non-GUI-configurable.** The 3D component builds exactly 5 lights: 3 grey directional lights (`0.9,0.9,0.9`) from `(1.5,-0.8,-1)`, `(-1.5,-0.8,-1)`, `(0,-0.8,1)`, one `(0.7,0.7,0.7)` from `(0,1,0)` (i.e. from above), and `AmbientLight3D(0.2,0.2,0.2)`. Each directional light's colour is the product of its default colour and the environment `lightColor` (`0xD0D0D0` by default). **[OBSERVED]** in the shipped bundle (`HomeComponent3D.createLights` / `updateLightColor`) and live (`env.lightColor = 0xd0d0d0`, `ceillingLightColor = 0xd0d0d0`).

**C2. Per-object lights with a 0–100 % slider.** `HomeLight extends HomePieceOfFurniture` and adds `lightSources[]`, `lightSourceMaterialNames[]` (since 7.0, for models whose *materials* act as emitters) and `power` (**default 0.5**). A `LightSource` is a point given as a **percentage of the piece's width/depth/height**, with a colour and a diameter. The Studio home shows 7 lights (Wall uplight ×3, Spotlight ×2, Pendant lamp, Work lamp) all at `power='0.5'`, e.g. `<lightSource x='0.5' y='0.6666667' z='0.7307692' color='00998764' diameter='0.29166666'/>`. **[OBSERVED]** `sh3x/Home.xml`, live probe, bundle (`getLightSources`, `setPower`). **[DOCUMENTED]** javadoc: https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/model/HomeLight.html ("Each light source point is a percentage of the width, the depth and the height of this light").

**C3. Light power is a percentage, not Watts.** UI string `HomeFurniturePanel.lightPowerLabel.text = "Light power (%%):"` and tooltip feedback `PlanController.lightPowerToolTipFeedback = "Power: %s%%"`. **[OBSERVED]** `localization.json`. (This corrects the brief's assumption about Watts.)

**C4. Ceiling lights are implicit.** At the 2 best quality levels each room gets a light in the middle of its ceiling, governed only by the **"Add ceiling lights"** checkbox in the photo/video panes; the colour is the environment `ceillingLightColor` (spelled with a double-l in the data model), default `0xD0D0D0`. There is **no** ceiling-light control in the "Modify 3D view" dialog. **[OBSERVED]** `localization.json` (`PhotoPanel.ceilingLightEnabledCheckBox.text`, `VideoPanel.ceilingLightEnabledCheckBox.text`), `HomeEnvironment.getCeillingLightColor`. **[DOCUMENTED]** creatingPhotos.html.

**C5. Real-time light brightness and wall transparency are one dialog.** "Modify 3D view…" contains "Light brightness: Dark…Bright" and "Walls transparency: Opaque…Invisible", both sliders with range 0–255 (data model `lightColor`, `wallsAlpha`). The live dialog text I captured is exactly: *"Modify 3D view — Ground: Color / Texture / Background image visible in 3D view — Sky: Color / Texture — 3D rendering: Light brightness Dark Bright, Walls transparency Opaque Invisible — OK / Cancel"*. **[OBSERVED]** live (`rea-out/probe25`) + screenshot `shots/04-modify-3d-view-dialog.png`; template `id="home-3Dattributes-dialog-template"` in `online-app.html`.

**C6. Sun and daylight are data, not a light.** The compass stores `x`, `y`, `diameter`, `northDirection`, `longitude`, `latitude`, `timeZone` (Studio: `northDirection='2.9146998'`, `latitude='0.8528843'`, `longitude='0.040724345'`, `timeZone='Europe/Paris'`), and cameras store `time` (Studio: `1491480000000`). A camera defaults to **midday** (`Camera.midday()` zeroes the clock at 12:00). The model even carries sidereal-time/JD maths for solar position. **[OBSERVED]** `sh3x/Home.xml`, bundle `Camera.midday`, `Compass.toSiderealTime` / `computeJulianDay`. **[DOCUMENTED]** https://www.sweethome3d.com/blog/how-to-simulate-sunlight-in-sweet-home-3d/ — the sun affects the rendered photo/video, and the compass is edited via **Plan > Modify compass…** ("Modify compass", panels "Compass rose" and "Geographic location": X/Y, Diameter, North direction, Latitude, Longitude, Time zone, "Visible in plan").

### D. Photo-realistic rendering (SunFlow / YafaRay)

**D1. Four quality levels, described in the UI itself.** `PhotoSizeAndQualityPanel` carries the strings:
- q0 "Same rendering as in the 3D view"
- q1 "Same rendering as in the 3D view with shadows under furniture placed at floor level"
- q2 "Fast global illumination with shadows computed from lights placed in the plan and optional lights in the middle of ceilings"
- q3 "Global illumination with shadows computed from lights placed in the plan and optional lights in the middle of ceilings"
Slider ends are labelled **Fast** and **Best**. **[OBSERVED]** `localization.json`. **[DOCUMENTED]** creatingPhotos.html.

**D2. Engines: SunFlow default, YafaRay optional.** javadoc: `PhotoRenderer` = "A renderer able to create a photo realistic image of a home based on SunFlow rendering engine"; `YafarayRenderer` = "implemented with YafaRay rendering engine called with JNI"; `AbstractPhotoRenderer.createInstance(rendererClassName, …)` resolves a pluggable engine class, falling back to `PhotoRenderer`, and `getAvailableRenderers()` lists what is installed; `AbstractPhotoRenderer.Quality` = `{LOW, HIGH}` (the older two-value enum, now superseded by the 4-step UI). **[DOCUMENTED]** https://www.sweethome3d.com/javadoc/com/eteks/sweethome3d/j3d/AbstractPhotoRenderer.html , `…/PhotoRenderer.html`, `…/YafarayRenderer.html`; YafaRay "generally about twice as fast", no Spherical lens (https://www.sweethome3d.com/blog/sweet-home-3d-7-0-update/ , https://www.sweethome3d.com/blog/yafaray-rendering-plug-in/).

**D3. Lenses.** `Camera.Lens` enum = `PINHOLE(0), NORMAL(1), FISHEYE(2), SPHERICAL(3)`; the UI labels are **Default**, **Depth of field**, **Fisheye**, **Spherical**. Choosing Spherical forces a 2:1 aspect ratio and Fisheye forces square. There is **no "door eye"/peephole lens** in this version. **[OBSERVED]** bundle enum + `PhotoPanel.lensComboBox.*` strings; **[DOCUMENTED]** choosing the best levels only.

**D4. Size/aspect presets.** `AspectRatio` = `FREE_RATIO, VIEW_3D_RATIO, RATIO_4_3, RATIO_3_2, RATIO_16_9, RATIO_2_1, SQUARE_RATIO`; the photo pane offers "3D view", "Square", "4:3", "3:2", "16:9", "2:1", "2.40:1" plus width/height pixel spinners and an "Apply proportions" checkbox. The Studio home defaults to `photoWidth='400' photoHeight='233' photoAspectRatio='VIEW_3D_RATIO' photoQuality='2'`. **[OBSERVED]** `localization.json` + `sh3x/Home.xml`.

**D5. Output and batch.** Single photo → **Save…** with PNG or "JPEG - Quality %d%%" (`PhotosPanel.fileFormatComboBox`). Batch: "Create photos at points of view…" pre-selects stored viewpoints ("Selected points of view:"), asks for a folder ("Select photos folder"), and reports "Computing %1$d / %2$d photos". **[OBSERVED]** `localization.json`, `PhotosPanel.*`, live action map.

**D6. Cost expectations are surfaced, and the GPU is not used.** FAQ: at the two best levels an image "may take a few minutes" and the graphic card "isn't used at all"; the speed-up checklist is: more max memory (`-Xmx`), smaller image / lower quality, **turn off useless lights**, less-detailed models, lower-resolution textures, faster CPU, and choosing YafaRay. **[DOCUMENTED]** https://www.sweethome3d.com/faq/ (also `VideoPanel.outOfMemory.message = "No more memory to complete")`.

**D7. Renderer tunables are escape hatches, not UI.** History entries record `samplerAlgorithm` / `filter` **renderer properties** for SunFlow, and general "parameterization of the SunFlow rendering engine with properties retrieved from a resource properties file or from System properties". So advanced quality is configured outside the UI. **[DOCUMENTED]** https://www.sweethome3d.com/history/.

**D8. None of this exists in the web build.** Keyword counts in the shipped `libjs/sweethome3d.min.js` (v7.5.2, 2.62 MB): `SunFlow` **0**, `YafaRay` **0**, `PhotoRenderer` 4 (only `getPhotoRenderer`/`setPhotoRenderer` preference plumbing), `createPhotoView`/`createPhotosView`/`createVideoView` all **`return this.dummyDialogView`**, and `createImportedFurnitureWizardStepsView` returns `null`. `createView3D` does return a real `HomeComponent3D`, so the WebGL view itself is fully functional. **[OBSERVED]** my bundle greps and the factory dump; corroborated by [DOCUMENTED] "no menu bar … except 3D models importation, as well as photos and videos creation" (users-guide; German guide line 164). Live confirmation: the toolbar has no photo/video button, the actions exist but `CREATE_PHOTO`/`CREATE_VIDEO` produced no dialog (and firing `CREATE_PHOTO` wedged the page on a modal alert — I aborted that probe).

### E. Video creation

**E1. A recorded path, then a replay.** `VideoController` holds `aspectRatio, frameRate, width, height, quality, speed, cameraPath[], time, renderer, ceilingLightColor`; `getQualityLevelCount()` = 4. Recording controls: "Add current camera location to animation" (RECORD), "Delete last recorded camera location", "Delete recorded camera path", plus playback/pause/seek/skip. Each recorded point keeps elevation, 2 rotation angles and FOV; at the 2 best levels you can set a **different hour per point** → sunlight animation. **[OBSERVED]** bundle `VideoController`, `localization.json` `VideoPanel.*`. **[DOCUMENTED]** creatingVideos.html.

**E2. Speed is a first-class property.** `HomeEnvironment.getVideoSpeed()` — "the preferred speed of movements in videos **in m/s**"; the Observer camera's default speed constant observed live is `0.6667` (and the Studio file stores `videoQuality='0' videoFrameRate='25' videoWidth='320' videoAspectRatio='RATIO_4_3'`). **[OBSERVED]** live env + `Home.xml`; **[DOCUMENTED]** javadoc HomeEnvironment.

**E3. Format.** The format combo reads `"%1$dx%2$d pixels - %3$s - %4$d frames/second"`; presets run 176×132@12 through 7680×4320@25 (per the source the research pass read: 320×240, 480×360, 640×480, 720×540, 1024×768, 1280×960, 720×405, 1280×536, 1280×720, 1920×800, 1920×1080, 3840×2160, 4096×1728, 7680×4320). Output is a **QuickTime** file (users guide: save "in a QuickTime file", watch in VLC or transcode). No audio track is documented or implied. **[OBSERVED]** the format string in `localization.json`; **[DOCUMENTED]** creatingVideos.html + users guide + history.

**E4. Time and failure messaging.** `VideoPanel.progressStartLabel.format = "%1$d images to generate - Video duration: %2$s"`, `progressLabel.format = "%1$d / %2$d - Estimated remaining time: %3$s"`, `confirmStopCreation`, quality 2/3 descriptions warn "might take a long time to compute" / "might take hours to compute". **[OBSERVED]** `localization.json`.

### F. Textures and colours

**F1. Texture editing has numeric transform fields.** The texture-choice component exposes **X offset (%)**, **Y offset (%)**, **Angle (°)** (with quick 0/45/90 buttons) and **Scale (%)**, plus Import…/Modify…/Delete…, a searchable "Available textures" list and "Recent textures" (max recent count constant present). **[OBSERVED]** `localization.json` (`TextureChoiceComponent.*`, `MAX_RECENT_TEXTURES`). **[DOCUMENTED]** https://www.sweethome3d.com/import-textures/ and history entries "Added X offset and Y offset spinner", "Added the ability to set the scale of a texture", "Replaced 0°/45°/90° radio buttons … by a spinner".

**F2. Surfaces are coloured/textured per surface, with Matt/Shiny.** Furniture dialog: name, rotation, location, elevation, size, **color or texture**, visibility, mirrored, and (if it holds lights) light power. Rooms: floor + ceiling panels each with Color/Texture + **Matt/Shiny** and show/hide; walls: "Left side"/"Right side" each Color/Texture + Matt/Shiny, plus a "Top color in 3D view" pattern; the template in the live page shows `RoomPanel.floorMattRadioButton`, `RoomPanel.floorShinyRadioButton`, `RoomPanel.ceilingMattRadioButton`, `RoomPanel.ceilingShinyRadioButton`, `RoomPanel.wallSidesMattRadioButton`… **[OBSERVED]** `online-app.html` templates + `localization.json`. **[DOCUMENTED]** users guide ("its color or its texture"; the German guide: colours/textures of left and right wall sides).

**F3. Shininess has a real material meaning.** "Shiny" corresponds to a specular/highlight appearance used by the photo renderer ("matt / shiny appearance of surfaces" improved at the best quality levels); the JS `ModelMaterialsComponent` dialog exposes a **Shininess** panel (`JSModelMaterialsSelectorDialog.initShininessPanel`). **[OBSERVED]** bundle + `localization.json` history entry; **[DOCUMENTED]** history 4.0-era entry "Improved photo rendering at the two best quality levels (… matt / shiny appearance of surfaces)".

**F4. Catalog plumbing.** The online tool loads `/libjs/resources/{FurnitureCatalog,TexturesCatalog,localization}.json` with locale fallback (`_en_US.json`, `_en.json`, then bare `.json`), furniture models from `/models/*.zip` (OBJ inside a zip, referenced as `jar:…/wallUplight.zip!/wallUplight.obj`), and texture images from `/textures/`. Textures catalog is swappable (400 bundled textures in the paid/full bundle). **[OBSERVED]** live resource log (`rea-out/probe12.json`) and `Home.xml` model URIs; **[DOCUMENTED]** online-manager page.

### G. Ground and sky

**G1. Sky = a textured half-sphere; ground = a plane 20 cm below zero.** The 3D component builds a 48-segment half-sphere for the sky (double-sided) plus a large ground polygon; the ground plane is set **invisible while the camera is at or below Z = 0** (`setVisible(camera.getZ() >= 0)`) so that a below-floor camera does not see the ground from underneath. The ground polygon is translated `-0.2` in Y. **[OBSERVED]** bundle `createBackgroundNode` / `createGroundNode`.

**G2. Sky/ground each have colour + texture + transform.** `updateBackgroundColorAndTexture` sets the diffuse colour from `skyColor` (`0xCCE4FC` default) / `groundColor` (`0xA8A8A8` default), and when a texture is set, applies a translation by `-texture.getXOffset()` for the sky and a generated 100000-unit plane texture mapping for the ground. The background **image** of the 2D plan can optionally be drawn on the 3D ground ("Background image visible in 3D view"). **[OBSERVED]** bundle + `Home.xml` environment + live dialog text. **[DOCUMENTED]** editing3DView.html.

**G3. Sky texture behaviour is mode-dependent.** The research pass read creatingPhotos.html: at the two best quality levels a **day-time sky image is computed from the chosen hour**, while a user sky texture is always used in Virtual visit mode; history adds "sky image mirror at bottom of background image to avoid possible line at the horizon". **[DOCUMENTED]** https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/creatingPhotos.html , history.

**G4. There is no 3D grid toggle.** History/FAQ space says to display a grid in 3D you apply a grid **texture** (to the ground or to room floors). **[DOCUMENTED]** https://www.sweethome3d.com/blog/how-to-print-a-grid-in-the-plan-or-display-it-in-3d/ (URL verified reachable in the same domain).

### H. Performance options and preferences

**H1. The preference pane is short.** The 3D-relevant preferences are: "3D navigation arrows: Visible", "Selection and editing in 3D view: Enabled" (`editingIn3DViewEnabled`), "Aerial view centered on selection: Enabled", "Select visitor in plan at 3D move: Enabled" (`observerCameraSelectedAtChange`). The live defaults I read: navigation arrows **false**, editing in 3D **false**, aerial-centred **true**, select-visitor **true**. **[OBSERVED]** live preference probe (`rea-out/probe13.json`, `probe14.json`) + `online-app.html` preference template; **[DOCUMENTED]** editingPreferences.html.

**H2. Anti-aliasing is automatic.** There is no AA checkbox; history 3.7 says "Used antialiasing in the 3D view when possible", and the Java build requests a preferred scene-AA template for offscreen rendering. On the web the context is created with `antialias: true` (live WebGL context attributes: `{alpha:true, antialias:true, depth:true, premultipliedAlpha:true, stencil:false, preserveDrawingBuffer:false}`), WebGL 1.0 / OpenGL ES 2.0. **[OBSERVED]** live context attributes in `rea-out/probe21` output; **[DOCUMENTED]** history.

**H3. Real performance levers are elsewhere.** Max heap `-Xmx` (the About box shows the limit), the offscreen-3D detection flag `-Dcom.eteks.sweethome3d.j3d.checkOffScreenSupport=false`, launching "Sweet Home 2D" (no 3D view, no photo/video/imports), "Display in separate window" vs "Display in main window" for the 3D view, and per-level visibility ("Make all levels viewable" / "Make level the only viewable one"). **[DOCUMENTED]** FAQ + users guide + `localization.json` `HomePane.*`; **[OBSERVED]** the level actions in the live action map (`MAKE_ALL_LEVELS_VIEWABLE enabled=false` when the home has a single level).

**H4. The web build's extra cost is asset weight.** A Studio demo load pulls ~1 MB of JS (core/geom/graphics2d/sweethome3d/triangulator/viewmodel/etc.), the catalog JSONs, and ~22 OBJ-in-zip models before the 3D view is complete; models are fetched lazily per item. **[OBSERVED]** `rea-out/probe12.json` resource list, `rea-out/scenario-app.json` network events.

### I. Data model cheat-sheet (all from `sh3x/Home.xml`, an official example home, v5500)

```
<home version='5500' name='Studio.sh3x' camera='topCamera' wallHeight='250.0' …>
  <environment groundColor='00A8A8A8' skyColor='00CCE4FC' lightColor='00D0D0D0'
               ceillingLightColor='00D0D0D0' photoWidth='400' photoHeight='233'
               photoAspectRatio='VIEW_3D_RATIO' photoQuality='2'
               videoWidth='320' videoAspectRatio='RATIO_4_3' videoQuality='0'
               videoFrameRate='25'/>
  <compass x='-137.8389' y='-28.975006' diameter='100.0'
           northDirection='2.9146998' longitude='0.040724345' latitude='0.8528843'
           timeZone='Europe/Paris'/>
  <camera attribute='topCamera' lens='PINHOLE' x=… y=… z=… yaw=… pitch=…
          fieldOfView='1.0995575' time='1491480000000'/>
  <observerCamera attribute='observerCamera' lens='PINHOLE' …/>
  <observerCamera attribute='storedCamera' name='Entrance' lens='PINHOLE' …/>
  <light catalogId='eTeks#wallUplight' … power='0.5'>
     <lightSource x='0.5' y='0.6666667' z='0.7307692' color='00998764' diameter='0.29166666'/>
  </light>
```
**[OBSERVED]** — `sh3x/Home.xml` extracted from https://www.sweethome3d.com/examples/Studio.sh3x . Angular units in the file are radians; `time` is epoch ms.

### J. Evidence inventory (this job folder)

| File | What it is |
|---|---|
| `rea-out/inspect-app-page.json` (1.9 MB) | REA `inspect-web-page` evidence for the live Online editor (DOM, accessibility, resources, network, console, storage, limitations) |
| `rea-out/scenario-app.json` | REA `capture-browser-scenario` partial capture of the Online page load (183 events: requests, console, 3 page errors from a blocked service worker + Firebase beacon) |
| `rea-out/shot2.json`, `rea-out/shot-home.json` | REA `capture-web-screenshot` evidence (success + input-schema error kept for the record) |
| `shots/01-online-manager-top.png` … `06-virtual-visit-entrance.png` | Page screenshots incl. aerial 3D, the live "Modify 3D view" dialog, and two Virtual-visit framings of the Studio demo (sha256 in `EVIDENCE.md`) |
| `libjs-sweethome3d.min.js` (2.62 MB), `libjs-core.min.js`, `libjs-geom.min.js`, `libjs-graphics2d.min.js`, `libjs-viewmodel.min.js`, `libjs-triangulator.min.js`, `libjs-swingundo.min.js` | Shipped Sweet Home 3D JS 7.5.2 bundles, downloaded once for static keyword/API reading (GPL; not copied into the report) |
| `localization.json` (1963 keys) | The app's full English UI string table, as served to the browser |
| `online-app.html`, `online-manager.jsp`, `headless.html`, `uidevice.html`, `faq_.html`, `features_.html`, `import-textures_.html`, `tips_.html`, `history.html`, `de-userguide.html` (+ `.txt` conversions) | Official pages snapshots used as quotation sources |
| `javadoc-HomeEnvironment.html`, `javadoc-Camera.html`, `javadoc-HomeLight.html`, `javadoc-Compass.html`, `javadoc-PhotoRenderer.html`, `javadoc-AbstractPhotoRenderer*.html`, `javadoc-YafarayRenderer.html` | Official 7.5 API docs |
| `Studio.sh3x`, `sh3x/Home.xml` | Official example home + its plan XML |
| `probe*.js`, `probe2.json`…`probe16.json` | The exact in-page probes I ran (kept so every [OBSERVED] claim is reproducible) |

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Context: single-page Vite/TypeScript/Three.js app, no backend, plan autosaves to localStorage. "Effort" is relative to that stack.

### Tier 1 — high value, low effort (do first)

1. **Aerial ⇄ Walk toggle with two persistent camera objects and named bookmarks.** *Ties to A1, A3, B1–B4.* Keep `aerialCamera` and `visitorCamera` as separate serialisable objects (the plan already serialises to localStorage, so bookmarks cost almost nothing: `{name, position, yaw, pitch, fov, timeOfDay}`). Add a "Store viewpoint" button that clones the *current* camera, de-duplicates by name/pose, and caps the list (SH3D's cap is 50 — a good precedent). Add "Go to" and "Delete" entries. *Effort: low. Value: very high — it makes 3D state part of the plan instead of ephemeral.*

2. **Thumbnail each stored viewpoint on save.** *Ties to B2.* When a viewpoint is stored, render one small frame offscreen (`WebGLRenderTarget` or a second short frame at low res) and store it as a data URL next to the bookmark. The list then becomes a storyboard, which is exactly what SH3D's "Create photos at points of view" pane is for, but live. *Effort: low-medium. Value: high — turns an abstract list into a UI.*

3. **Walls-transparency slider in the 3D-view settings.** *Ties to C5.* SH3D's "Walls transparency: Opaque…Invisible" is the single cheapest fix for the classic aerial-view problem (near walls hide the room you are looking at). In Three.js this is one material/opacity uniform applied to wall meshes, with `transparent`/`depthWrite` handled carefully. *Effort: low. Value: high.*

4. **On-canvas navigation arrows (optional).** *Ties to A6.* A small D-pad overlay that synthesises the same key events the keyboard handlers already listen to; hidden by default behind a preference, exactly as SH3D does. *Effort: low. Value: medium-high for touch/discoverability.*

5. **"Light brightness" slider that scales a colour multiplier instead of adding lights.** *Ties to C1.* SH3D's real-time look is 4 fixed directional lights × one brightness colour + a 0.2 ambient term. Reproducing that in Three.js (hemisphere/ambient + directional, one multiplier) gives users the "my render is too dark/bright" fix without a lighting engine. *Effort: low. Value: medium-high.*

### Tier 2 — high value, medium effort

6. **First-class light sources on furniture (power % + colour), plus implicit per-room ceiling lights.** *Ties to C2, C3, C4.* Model a `Light` as a child of a furniture item with an offset expressed as a **percentage of the item's bounding box** (this is the elegant part of SH3D's design: it survives rescaling/mirroring), a 0–100 % power and a colour. Add an "add ceiling lights" toggle that spawns one light per room at ceiling centre. In Three.js, cap the number of shadow-casting lights and fall back to unshadowed point lights — SH3D itself only evaluates lights in the expensive renderer, never in the live view. *Effort: medium. Value: high.*

7. **Compass + sun position driving a daylight slider.** *Ties to C6, G2, G3.* CasaPlazAI already has rooms and walls; adding `{northAngle, latitude, longitude, timeZone}` to the plan lets one directional light be positioned by a simple solar-elevation approximation, and lets "time of day" drive sky colour. This is a differentiator for presentations ("my flat at 5 pm in winter") and is cheap once the compass object exists. *Effort: medium. Value: high.*

8. **Camera-path recorder → WebM export.** *Ties to E1, E2, E4.* SH3D's video is a recorded list of camera poses replayed through an offline renderer, saved as QuickTime. The browser gives a better deal: record poses (position, 2 angles, FOV, optional per-key time of day), interpolate with easing, play back in the live view, and export with `MediaRecorder`/`canvas.captureStream()`. Surface the "N / M frames — estimated remaining" progress text pattern. *Effort: medium. Value: high — a shareable walkthrough is a strong CasaPlazAI feature the current export (PNG/JPEG) lacks.*

9. **Texture transform fields (X %, Y %, angle, scale) instead of only "pick a texture".** *Ties to F1.* Expose the UV repeat/offset/rotation on wall/floor materials. SH3D's four numbers are the whole feature; in Three.js it is `texture.wrapS/T`, `repeat`, `offset`, `rotation`. *Effort: medium. Value: medium-high (big perceived-quality jump for floors).*

10. **Export dialog with explicit "quality / time" trade-off.** *Ties to D1, D5, D6.* Instead of one "Export PNG", offer "Same as 3D view" (instant) vs "High quality (a few seconds/minutes)" using a higher-resolution render target, soft shadows and optional progressive accumulation (render N frames offscreen while the UI stays responsive, à la SH3D's non-modal Create-photo pane). Label each option with a rough time estimate the way SH3D labels its four levels. *Effort: medium. Value: high — it matches the existing PNG/JPEG export and sets honest expectations.*

### Tier 3 — valuable, higher effort

11. **Lens presets for the exported image / walkthrough.** *Ties to D3.* "Default / Depth of field / Fisheye / Spherical" maps cleanly onto Three.js: a `PerspectiveCamera` plus post-processing for DoF, a cube/equirect render for Fisheye and Spherical (SH3D forces square/2:1 aspect ratios when those lenses are chosen — copy that constraint, it prevents broken output). Spherical/2:1 exports feed VR viewers. *Effort: medium-high. Value: medium.*

12. **Sky/ground as data with colour *and* texture, plus "plan background image on the 3D ground".** *Ties to G1, G2.* Fifty lines of settings (two colours, two optional textures, wall alpha, brightness) that dramatically change how a plan reads. The "show the 2D plan background image on the 3D ground" trick is a nice continuity feature between the 2D and 3D views, and the `camera.z >= 0` visibility rule (hide the ground plane when the camera dips below it) is a small detail worth copying to avoid the ground blocking walk-mode views. *Effort: medium. Value: medium.*

13. **Level visibility commands ("all levels" vs "only this level").** *Ties to H3.* Not strictly in scope for this question, but the aerial camera and the level commands interact: SH3D recomputes the aerial bounding box from *visible* items and can show only the selected level. If CasaPlazAI grows multi-storey plans, this belongs next to the camera model. *Effort: medium-high. Value: medium (later).*

### Explicit anti-patterns to avoid (learned from SH3D's rough edges)

- **Don't invent a Watt-based light unit.** SH3D uses 0–100 %; users understand "50 %". *Ties to C3.*
- **Don't hide renderer choice in system properties.** SH3D's SunFlow quality knobs (`samplerAlgorithm`, `filter`) are only reachable via properties files — a documented source of confusion. If CasaPlazAI exposes a "quality" control, put it in the export dialog. *Ties to D7.*
- **Don't ship buttons whose dialog does not exist.** The Online build keeps `CREATE_PHOTO`/`CREATE_VIDEO` enabled while their views are stubs (`dummyDialogView`), so the actions silently do nothing; I got a wedged modal trying one. Disable or hide unsupported actions. *Ties to D8, [OBSERVED].*
- **Don't let a stored viewpoint silently drop state.** SH3D stores *pose + time + lens + renderer* together and de-duplicates aggressively — mimic that, because a "bookmark" that forgets the lens or the time of day surprises users. *Ties to B2.*

---

## 4. Unknowns / what I could not verify

1. **The desktop photo/video panes themselves.** They are Java Swing dialogs; I could only read their exact strings from the shipped bundle's string table and from official source-derived help. I never saw the panes render, so the *layout* (ordering of Quality / Size / Lens / Renderer / Date / Time / Add-ceiling-lights) is inferred from string-name grouping, not observed.
2. **Real render times.** "A few minutes" / "minutes to hours" are vendor statements (FAQ, UI warnings). I did not render anything on desktop or web.
3. **SunFlow/YafaRay behaviour in the web build.** Confirmed absent by keyword counts and stubbed views; I cannot say whether the web bundle ever had them (the file is minified and versioned 7.5.2, so absence in this build is all I can state).
4. **Video output details.** QuickTime container and "no audio" come from official help/source descriptions; I did not produce or inspect a video file, and I could not test the documented size/frame-rate preset list myself (it comes from the research pass reading `swing/VideoPanel.java`).
5. **YafaRay availability and the exact renderer dropdown contents.** The renderer list is populated at runtime from what is installed (`getAvailableRenderers()`), so the live list is machine-dependent and I could not enumerate it.
6. **Anti-aliasing quality.** The web context requests `antialias: true` and history says "when possible" for Java; I did not measure MSAA samples or compare images.
7. **Ambient light.** The real-time rig's `0.2` ambient is from the bundle; I did not verify whether any preference or plug-in can change it, and there is no UI for it.
8. **Light power limits.** Default is 0.5 and the UI is a percentage with a spinner; I did not verify the numeric min/max (a history entry mentions "Allowed decimals in Light power spinner" only).
9. **The compass solar model's accuracy.** The bundle contains Julian-day/sidereal-time maths and a timezone→geographic-point table, but I did not validate the sun position against reality, nor did I confirm how much of it the JS renderer actually uses (the JS build has no photo renderer, so sun-driven lighting may only affect sky colour there, if at all).
10. **`CREATE_PHOTO` in the web build.** Firing it appeared to open a modal that blocked the page; I aborted the probe rather than keep clicking. So the *exact* user-visible result of clicking a stubbed photo action is not fully characterised beyond "no photo dialog appeared".
11. **Texture `Scale (%)` semantics.** Whether it means UV repeat or real-world size is not confirmed from the string alone; SH3D's history says "set the scale of a texture", which reads like UV scale, but I did not verify.
12. **The `2.40:1` preset vs `RATIO_2_1`.** Two different ratios exist in the model/UI (`RATIO_2_1`, and a "2.40:1" label in the size panel); I did not confirm how 2.40:1 is represented internally.
13. **German-vs-English wording deltas** are untested beyond spot checks (the German guide was fetched and its 3D/photo/video chapters read consistently with the English one).
