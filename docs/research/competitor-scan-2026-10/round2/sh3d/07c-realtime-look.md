# Sweet Home 3D (web) — the real-time 3D look in the browser build: lights, textures, ground & sky, wall/floor transparency, level visibility

Job: `rea2-sh3d-p3/07-07c-3d-view-rendering-realtime-l` — Round 2, narrow question.
Target: **Sweet Home 3D**, https://www.sweethome3d.com/de/ (GPL Java desktop app) and its WebGL browser edition
**Sweet Home 3D JS Online 7.5.2** at https://www.sweethome3d.com/SweetHome3DJSOnline.jsp,
built from the same Java core by transpilation to JS (the page exposes Java-like classes on `window`).
Round-1 report reused read-only: `~/dsh-workspaces/rea-sweethome3d-2026-10/07-07-3d-view-rendering/report.md`.
I did **not** redo round 1: cameras, stored viewpoints, SunFlow/YafaRay, video, and the product-level feature set are taken as given there.

Evidence convention: **[OBSERVED]** = I verified it in the live page by scripting the running app / shipping JS (file named);
**[DOCUMENTED]** = stated on an official Sweet Home 3D page, official help, or official javadoc (URL given);
**[INFERRED]** = my deduction. Behaviour and data model are described in my own words; no source code is reproduced (GPL project, our repo is proprietary). Quotes are of *UI strings*, not source.

Method note: round 1's unknown #1 was "headless Chromium often had no WebGL". I fixed that by launching Chrome
(`--headless=new`) with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, which gives a working
**WebGL 1.0 / Angle-SwiftShader** context (`getParameter(UNMASKED_RENDERER_WEBGL)` =
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)) SwiftShader driver)`). That let me (a) drive the app's own
JS objects still live in the page, and (b) call `canvas3D.drawScene()` and `gl.readPixels(...)` to *measure* the rendered
image instead of looking at screenshots.

---

## 1. Summary

- **The real-time "look" in the web build is one fixed, non-configurable lighting rig plus four renderer settings.** Five lights are built once per home: three grey `DirectionalLight3D` and one from above, plus an `AmbientLight3D(0.2,0.2,0.2)`. There is **no** point light, spot light, sun, or shadow anywhere in the bundle. The only user-tunable lighting is the single **"Light brightness"** slider, which scales the *colour of the four directional lights only* and leaves the ambient term untouched. **[OBSERVED]** live `component3D.sceneLights` (5 entries, exact colours/directions), `canvas3D.shaderProgram` uniforms, and pixel A/B tests.
- **Lighting is done by a custom, tiny WebGL 1.0 shader, not by a 3D engine.** The live program (extracted with `gl.getShaderSource`) hard-codes up to **16** directional lights, an ambient term, optional texture, a diffuse/specular term and a scalar `alpha`. **Emissive colour is a no-op** (the term is never read), so per-object lights cannot brighten anything; only directional lights and ambient contribute. **[OBSERVED]** shader source from the running context; `lightingEnabled=false` objects fall through to a flat diffuse colour.
- **Ground and sky are two unlit colour/texture primitives, and both are data in the plan.** Sky = a double-sided 48-segment half-sphere with `lightingEnabled=false` (so it renders the literal sky colour); ground = a 4-corner, 2-triangle quad (6 indices) at **y = −0.20** whose colour is applied to *both* diffuse and ambient. Sky and ground each have **Color** or **Texture** radios plus a "Background image visible in 3D view" checkbox. Verified with pixels: setting the sky colour to pure red turned the whole upper half of the observer view `(255,0,0)`; the ground colour A/B shifted the top view from warm brown to green/blue; and assigning a real `HomeTexture` built from the live catalog changed a flat white ground band from `(253.5,253.5,253.5)` to a patterned `(234.2,225.9,206.4)`. **[OBSERVED]** + **[DOCUMENTED]** help: "change the color or the texture of the ground and the sky".
- **"Walls transparency" is really "walls (and floors) transparency" — one 0–255 slider mapped to a 0–1 alpha.** It is applied to *every* wall side mesh **and to each room's floor and ceiling mesh**, but never to furniture, ground or sky. The value lives in the environment, is persisted, and has an exact pixel effect (opaque vs invisible changed the top view average by ~20 RGB units; 0.5 sat between). An accompanying rule hides the flat horizon **backdrop** slab whenever camera Z < 0 (the visible ground mesh keeps drawing; I separated the two by pixel A/B while looking straight down from above and below). **[OBSERVED]** live appearance values at α = 0 / 0.5 / 1, pixel A/B, and the background backdrop's `visible=false` at camera Z = −40; **[DOCUMENTED]** help text "walls (and floors) transparency".
- **Level visibility is a two-flag model with a "selected level and below" command.** Each `Level` has an independent **`viewable`** flag and a **`visible`** flag; an object is drawn only when its level `isViewableAndVisible()`. The two actions are **"Display all levels"** (`isAllLevelsVisible()` true) and **"Display selected level"** ("Display selected level and below in the 3D view") which the controller implements by walking levels in order, setting `visible=true` until it reaches the selected level, then `false`. Both the per-level flag change and the all-levels flag recompute the scene through a `VISIBLE`/`VIEWABLE` property-change listener. Measured: with the top level hidden, visible furniture dropped from **122 → 114**, and re-enabling restored 122. **[OBSERVED]** live level objects, the controller listener in the bundle, and the before/after visible-object counts; **[DOCUMENTED]** toolbar strings.

---

## 2. Findings

### A. The rendering pipeline (what actually draws the 3D view)

**A1. It is a hand-written mini renderer, not Three.js/Java3D.** `component3D.canvas3D` is an `HTMLCanvas3D` with custom fields
`scene`, `textures`, `sharedGeometries`, `sceneGeometries`, `backgroundGeometries`, `lights`, `shaderProgram`,
`viewPlatformTransform`, `framesPerSecond`. In the loaded attic example `sceneGeometries` held **2656** geometry records built
from **325** shared geometries; `backgroundGeometries` held exactly **3** records (sky outer, sky inner, ground quad).
**[OBSERVED]** live object inspection (`rea-out/probe-summary.json`, `scripts/p_render.js`, `scripts/p_bg.js`).

**A2. One shader pair, up to 16 directional lights, no shadows.** The live fragment shader declares
`uniform vec3 lightDirections[16]; uniform vec3 directionalLightColors[16]; uniform int directionalLightCount;` and loops
`for (int i = 0; i < 16; i++) { if (i >= directionalLightCount) break; ... }`. `MAX_DIRECTIONAL_LIGHT = 16` in the bundle.
Directional lights are uploaded as two flattened `vec3` arrays, zero-padded to 16; lights beyond the cap are folded into the
ambient sum instead (`vec3.add(b, b, g.color)`), so overflow degrades gracefully rather than being lost. There is **no**
shadow term, no light attenuation, no gamma correction and no normal-map support. **[OBSERVED]** shader source
(`rea-out/shaders.json`) and the uniform-upload code; **[OBSERVED]** `PointLight` 0 / `SpotLight` 0 occurrences in
`libjs-sweethome3d.min.js` (sha256 `053e7d1a…66d89`).

**A3. The shader's lighting equation.** For lit geometry the fragment colour is
`ambient + Σ_i dirColor_i·max(dot(n, dir_i), 0)` times the vertex diffuse colour, plus an optional Blinn-Phong-ish specular
term `dirColor_i·pow(max(dot(reflect(−dir_i, n), eye), 0), shininess)` that is only evaluated when the vertex specular
colour is non-zero. Textured fragments multiply the sampled texture by the same `lightWeight`; the final alpha is
`texture.a · alpha`. **The `emissiveColor` field exists on the appearance class but never reaches the shader**, i.e. it is
inert in the browser build. **[OBSERVED]** `scripts/p_shadersrc.js` output and `Appearance3D.setEmissiveColor` in the bundle.

**A4. Antialiasing and context.** The context is created with `antialias: true, alpha: true, depth: true,
premultipliedAlpha: true, stencil: false, preserveDrawingBuffer: false`, WebGL 1.0 (no WebGL 2), **24-bit depth**, and
`MAX_TEXTURE_SIZE = 8192` in my SwiftShader run. Transparent geometry is drawn after opaque geometry, back-to-front, sorted
by view-space Z, with `gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` (premultiplied-alpha blending). **[OBSERVED]** live GL
attributes (`rea-out/probe-summary.json`) and the two-pass draw loop in the bundle.

**A5. Frame rate is honest but modest.** `getFramesPerSecond()` is computed once per wall-clock second from the drawn-frame
count. Under SwiftShader with a 1096×365 canvas I measured **0.1–2.4 fps**, which is a SwiftShader artefact, not a product
claim; the desktop/web figure on real GPUs will be far higher. **[OBSERVED]** `canvas3D.getFramesPerSecond()`.

### B. Lights: exactly five, and per-object lights do nothing in real time

**B1. The rig is hard-coded.** `createLights()` builds:
`DirectionalLight3D(0.9,0.9,0.9)` from `(1.5,−0.8,−1)`, `DirectionalLight3D(0.9,0.9,0.9)` from `(−1.5,−0.8,−1)`,
`DirectionalLight3D(0.9,0.9,0.9)` from `(0,−0.8,1)`, `DirectionalLight3D(0.7,0.7,0.7)` from `(0,1,0)` (above),
and `AmbientLight3D(0.2,0.2,0.2)`. This corroborates round 1's finding C1 and adds the live numbers. **[OBSERVED]**
live `component3D.sceneLights` returned exactly these five with `getDirection()` values matching; **[OBSERVED]** the same
constructor list in `libjs-sweethome3d.min.js` (`HomeComponent3D.prototype.createLights`).

**B2. "Light brightness" scales only the four directional lights.** `updateLightColor(light)` recomputes
`light.color = defaultColor · lightColor_RGB/255`. With the default `lightColor = 0xD0D0D0` the three `0.9` lights render at
`0.734` and the top light at `0.571` — exactly what the live objects reported. Changing `lightColor` to `0xFFFFFF` raised all
four to their defaults (0.9 / 0.7); to `0x404040` it lowered them to 0.226 / 0.176; the **ambient light stayed at 0.2**
throughout. **[OBSERVED]** `scripts/p_light2.js` (ladder of `lightColor` values with the resulting per-light colours), and the
bundle's `updateLightColor`.

**B3. The brightness slider is 0–255, greyscale, and applied live.** The template contains
`input[name="brightness-slider"]` (range 0–255) and the handler does
`env.setLightColor((value<<16)|(value<<8)|value)` — i.e. the slider is a **grayscale** multiplier, so the "Light brightness"
control cannot tint the scene. A companion `<datalist>` is filled with ticks at 0,17,34,…,255 for both the brightness and the
walls-transparency sliders. **[OBSERVED]** the live input elements and the live 17-step datalist-filling code in the bundle;
**[DOCUMENTED]** `Home3DAttributesPanel.brightnessLabel.text = "Light brightness:"`, `darkLabel = "Dark"`, `brightLabel = "Bright"`.

**B4. Per-object lights have no effect on the real-time web image.** The attic example ships **HomeLight** furniture, yet
`sceneLights` remains 5 and no point/spot light type exists in the bundle. The only trace of a light's power in the 3D path
is `HomeEnvironment.getSubpartSizeUnderLight()` (default **0**, and my live read confirmed 0), which is a photo-renderer
tessellation hint ("size of subparts under home lights"), not a real-time effect. So the round-1 statement that lights are
only evaluated in the expensive renderer holds strictly for the browser build. **[OBSERVED]** live (5 lights, subpart size 0),
`PointLight`/`SpotLight` counts 0, `getSubpartSizeUnderLight` only read/written by the environment property plumbing;
**[DOCUMENTED]** javadoc HomeEnvironment "Returns the size of subparts under home lights in this environment."

**B5. The compass/sun does not drive the real-time light.** The four directional directions are constants (they never read the
compass), and there is no sun-position code in the render path. The compass exists in the model (`getCompass`) and in the XML,
but in the browser build it cannot move the real-time sun. This closes part of round 1's unknown #9 for the *live* view.
**[OBSERVED]** constant light directions before/after camera and colour changes, and no compass reference in
`createLights`/`updateLightColor`/the shader.

### C. Ground and sky

**C1. Sky is an unlit double-sided half-sphere.** `createBackgroundNode` builds a `BranchGroup3D` containing
`Shape3D(createHalfSphereGeometry(true), skyAppearance)` plus an inner half-sphere with a fresh appearance. The live sky
geometry had **3456 vertices**, `mode=4` (GL_TRIANGLES), `lightingEnabled=false`, and the generator uses `x = 48` segments.
Because lighting is off, the shader falls
through to `lightWeight = vertexDiffuseColor`, so the sky plane renders the *literal* `skyColor`. **[OBSERVED]** live
background geometry attributes and the exact pixel result below.

**C2. Sky colour is applied verbatim — proven with pixels.** With the observer camera placed at the home centre looking
horizontally (`yaw=0, pitch=0, z=150`), the top four eighths of the framebuffer read exactly the default sky colour
`(204,228,252)` (= `0xCCE4FC`). Setting `skyColor` to `0xFF0000` made the same bands read `(255,0,0)`; `0x0000FF` made them
`(0,0,255)`; restoring brought back `(204,228,252)`. Sky is therefore **unlit and untinted by brightness or by textures**
unless a sky texture is chosen. **[OBSERVED]** `rea-out/probe-sky.json`.

**C3. The sky has a texture path with an X-offset-only transform.** `updateBackgroundColorAndTexture` first sets the sky's
diffuse colour from `skyColor`, then if a sky texture exists loads its image and sets a texture transform that is a pure
translation by `(−texture.xOffset, 0)` — the sky texture is scrolled horizontally, and its `yOffset`/`angle`/`scale` are not
used for the sky (unlike walls/rooms). This matches the round-1 note about the sky texture mirror at the horizon.
**[OBSERVED]** the bundle's `updateBackgroundColorAndTexture`; **[OBSERVED]** live `getSkyTexture() = null` with no texture
applied (`env.setSkyTexture` is only wired to the dialog when a texture is chosen).

**C4. Ground is a 4-corner, 2-triangle quad, translated to y = −0.20, with colour used as both diffuse and ambient.** `createGroundNode`
wraps a `Ground3D` (or a fallback box when no structure) in a `TransformGroup3D` whose live matrix was
`translation(0, −0.2, 0)`. `updateBackgroundColorAndTexture` sets the ground's **diffuse and ambient** colour from
`groundColor`, and if a ground texture exists it applies a *generated* texture mapping with
`planeS = (100000,0,0,0)`, `planeT = (0,0,100000,0)` — i.e. a 100 000-unit planar projection across the XZ plane (the same
trick round 1 found). **[OBSERVED]** live ground transform and `Ground3D` construction, plus the bundle code.

**C5. Ground colour is visible and measurable from the top camera.** Top-view framebuffer averages: with the plan's default
`groundColor = 0xA8A8A8`, `(126.5, 119.6, 79.7)`; with `0xFF0000`, `(179.1, 86.8, 73.4)`; with `0x0000FF`,
`(99.5, 86.8, 153.0)`. The ground fills a large part of the top view, so it dominates the aerial look. **[OBSERVED]**
`rea-out/probe-final.json`.

**C6. A "ground plane" is hidden whenever the camera is at or below Z = 0 — but the one that hides is the flat *backdrop* quad inside the sky node, not the visible `Ground3D`.** The background node contains three shapes: the outer sky half-sphere, the inner sky half-sphere, and a large flat quad at y = −0.01. The camera-Z listener calls `setVisible(camera.getZ() >= 0)` on **that backdrop quad only**. Measured: moving the observer camera to `z = −40` flipped just the third background shape to `visible=false` (the two sky shells stayed visible), and moving back to `z = 150` restored it. **[OBSERVED]** `rea-out/probe-bgquad.json`, `rea-out/probe-groundvis.json`.

**C6b. The real `Ground3D` mesh is *not* governed by that camera-Z rule — proven by colour A/B from below when the ground fills the view.** With the observer camera above the floor (`z = 300, pitch = −80`), the framebuffer read `(193,193,193)` and `(122,122,122)`; setting `groundColor = 0xFF0000` turned it `(232,6,6)` / `(142,28,28)`. With the camera *below* the floor (`z = −50`, still looking steeply down) the frame read a uniform `(211,211,211)`, and `0xFF0000` still turned it **fully** `(255,0,0)` — the backdrop quad was `visible=false` at that moment yet the ground still rendered. The `Ground3D` extent is a 100 000 × 100 000 plane centred at (−50000, −50000). One caveat I measured to keep the claim honest: at a *shallower* pitch from below (`z = −60, pitch = −40`) the frame is dominated by the **sky** `(204,228,252)` and is unaffected by `groundColor` — because the ground simply is not in view from that angle, not because it stopped drawing. So the two effects are: (i) the backdrop slab is *toggled* by camera Z; (ii) the ground mesh is always eligible but only contributes when geometry puts it in view. **[OBSERVED]** `rea-out/probe-ground2.json`, `rea-out/probe-c6c.json`. The practical carry-over is the *backdrop* rule (hide the flat horizon slab below the floor so it does not cut the view), while the actually-visible ground surface keeps rendering. **[INFERRED]** on intent.

**C7. The 2D plan background image can be projected onto the 3D ground.** `Ground3D.update` reads
`isBackgroundImageVisibleOnGround3D()`; when true it prefers the background image of the visible level whose elevation is 0,
scales the texture to the image size × the image's `scale`, and centres it with `(n/2 − xOrigin, l/2 − yOrigin)`. The live
default is `false`, and the checkbox is `Background image visible in 3D view` (wrapped over two lines in the template).
**[OBSERVED]** live `isBackgroundImageVisibleOnGround3D() = false`, the checkbox in the live template, and the bundle code;
**[DOCUMENTED]** javadoc "Returns true if the background image should be displayed on the ground in 3D."

**C8. Ground can be a colour *or* a texture, and I verified the texture path end-to-end with pixels.** When a ground texture is set the
ground is drawn with `DEFAULT_COLOR` and the texture image; when it is null the ground uses `groundColor` for both diffuse and
ambient and clears the texture. The same two-state choice exists for the sky (`TEXTURED` vs `COLORED` radios in the dialog).
**[OBSERVED]** the bundle's `Ground3D.updateGround` and `updateBackgroundColorAndTexture`; **[DOCUMENTED]** dialog radio
labels `Home3DAttributesPanel.groundColorRadioButton.text = "Color:"`, `groundTextureRadioButton.text = "Texture:"`.

**C9. I closed round 1's texture gap by constructing a `HomeTexture` from the live texture catalog and assigning it to the
ground.** The catalog is reachable at `application.getUserPreferences().getTexturesCatalog()` (9 categories; the first is
"Fabric", 85 × 85 "Beige fabric" by Scopia), and `new HomeTexture(catalogTexture)` yields
`{width:85, height:85, scale:1, angle:0, xOffset:0, yOffset:0}`. With the observer camera looking steeply down and sampling
only the **bottom 20 % of the frame** (the near ground, clear of the house), the ground rendered a perfectly flat
`(253.5, 253.5, 253.5)` with `groundColor = 0xFFFFFF`. Assigning that `HomeTexture` and waiting for the image to decode
changed the same band to a **patterned `(234.2, 225.9, 206.4)` with 5 distinct colour buckets** (vs 2 flat), and removing it
returned exactly `(253.5, 253.5, 253.5)`. So the ground-texture path is real, not merely code-observed. **[OBSERVED]**
`rea-out/probe-texture8.json`, `probe-texture7.json`, `probe-texclass.json`. Note the *sampled pixel band* matters: a
steeply-angled view samples the sky (204,228,252) instead, which is how I isolated the effect. The 100 000-unit generated
`planeS`/`planeT` projection also means a texture's own `scale`/`xOffset` are ignored for the ground; the code-observed
`textureCoordinatesGeneration` I read back from the ground appearance was `null` while a texture was bound, consistent with a
separate generated-coordinates path. **[OBSERVED]** for the pixel effect; **[INFERRED]** for "ignored for the ground".

### D. Wall / floor transparency

**D1. One value drives walls and rooms.** `HomeEnvironment.setWallsAlpha(float)` fires `WALLS_ALPHA`; each `Wall3D` side
appearance is assigned `transparency = wallsAlpha` (or `0` when `wallsAlpha == 0`), and each `Room3D` floor **and ceiling**
part is assigned `transparency = wallsAlpha` (or `0` when 0). Furniture, ground and sky are untouched. Note the asymmetry in
the bundle: walls *always* get `transparency = wallsAlpha`, whereas rooms/walls take the `== 0 → 0` shortcut to stay fully
opaque in the common case. **[OBSERVED]** live `Room3D` appearance values at α = 0, 0.5 and 1.0 (floor and ceiling parts read
0 → 0.5 → 1.0), and the bundle's `updateRoomPartAppearance` / `Wall3D` code.

**D2. The slider is 0–255 but the model is 0–1.** The dialog does `env.setWallsAlpha(value/255)` on input and
`slider.value = env.getWallsAlpha()*255` on refresh, with a 17-step datalist of ticks. My live default read was
`getWallsAlpha() = 0`. The slider's HTML default is `128`, i.e. a freshly opened dialog shows mid-slider until the
property-change listener syncs it. **The `input` listener is installed when the dialog is actually displayed**, not merely
when the template exists: I found the slider input in the DOM, set `value=204` and dispatched `input`, and
`getWallsAlpha()` stayed `0`. That is consistent with lazy dialog construction. **[OBSERVED]** the live input attributes and
the unchanged env value; **[DOCUMENTED]** `Home3DAttributesPanel.wallsTransparencyLabel.text = "Walls transparency:"`,
`opaqueLabel = "Opaque"`, `invisibleLabel = "Invisible"`.

**D3. It has a real, measured pixel effect on the aerial view.** Top-camera frame averages: α = 0 → `(126.5, 119.6, 79.7)`,
α = 0.5 → `(112.8, 120.0, 71.6)`, α = 1 → `(106.9, 120.0, 68.3)`. The near walls of the *far* side bleed through the near
walls, which is the whole point of the feature. The number of transparently-blended geometry records rose from **28** at
α = 0 to **981** at α = 0.5/1.0 (out of 2656), so the toggle also measurably changes the draw path. **[OBSERVED]**
`rea-out/probe-final.json`, `rea-out/probe-alpha-scale.json`.

**D4. Even at α = 0, 28 geometry records are semi-transparent at 0.5.** These are scene items with their own transparency
(e.g. glazing/selection shapes), independent of the wall setting. The histogram at α = 0 was `{1: 2628, 0.5: 28}`.
**[OBSERVED]** `rea-out/probe-texture2.json`.

**D5. The help is authoritative on scope.** The official editing-3D-view help says the "Modify 3D view…" pane "lets you
change the color or the texture of the ground and the sky, the light brightness and walls (and floors) transparency" —
confirming that floors are in scope and furniture is not. **[DOCUMENTED]**
https://sourceforge.net/p/sweethome3d/code/HEAD/tree/trunk/SweetHome3D/src/com/eteks/sweethome3d/viewcontroller/resources/help/en/editing3DView.html

**D6. Texture transforms and "shiny" are per-surface material properties, not global.** Wall and room appearances carry
`ambientColor`, `diffuseColor`, `specularColor`, `shininess`, `textureImage`, `transparency`, `visible`; the live wall shapes
showed `textureImage` present on some sides and `null` on others. Roughly 2465 of 2656 geometry records were
`lightingEnabled=true` and 191 `false` (background/labels). "Shiny" surfaces are simply those with a non-zero specular
colour, which the shader then highlights. **[OBSERVED]** live appearance fields and the shader specular branch.

### E. Level visibility in 3D

**E1. Two independent flags per level: `viewable` and `visible`.** The live `Level` objects expose `isViewable()`,
`setViewable()`, `isVisible()`, `setVisible()`, `isViewableAndVisible()` (returns `viewable && visible`, with each setter
firing a `VIEWABLE` / `VISIBLE` property change) and `getElevationIndex()`. `visible` means "draw it in the 3D view now";
`viewable` means "this level is allowed to be drawn". The plan reader makes their defaults explicit: it parses a level's
`visible` and `viewable` attributes as `!== "false"`, so **both default to true when absent**. Object visibility is gated on
`level == null || level.isViewableAndVisible()`. **[OBSERVED]** live level API and the gating predicate in
`HomePieceOfFurniture3D.prototype.isVisible`; `Wall3D`/`Room3D`/`Polyline3D`/`DimensionLine3D`/`Label3D` all share the
same `getLevel()==null || getLevel().isViewableAndVisible()` test in the bundle; the level attribute parser
(`setLevelAttributes`) is in the bundle too.

**E2. "Display all levels" vs "Display selected level" is a single boolean plus a re-walk.** `HomeEnvironment` stores
`allLevelsVisible`. The "Display selected level" command's listener walks the levels in order, sets `visible=true` on each
until it reaches the selected level, then sets `visible=false` for the rest. The toolbar strings are **"Display all levels"**
("Display all viewable levels in the 3D view") and **"Display selected level"** ("Display selected level and below in the 3D
view"). **[OBSERVED]** the live behaviour (below) and the controller code named `HomeController3D$3`; **[DOCUMENTED]**
`localization.json`.

**E3. Measured effect on the actual scene.** In the official `3BedroomHouseWithAttic.sh3x` example (4 levels: 1st floor@0,
2nd floor@262, Attic@524, Roof@524; each with `floorThickness = 12`) with 122 furniture-derived 3D objects: applying the
"display selected level" walk hid the Attic and Roof and the count of `isVisible()` furniture fell to **114**; restoring all
levels brought it back to **122**. Toggling a single level's `viewable` flag on/off did **not** change the visible count in
that home (the hidden levels were hidden by `visible`, not `viewable`, at that moment), which cleanly separates the two
flags' roles. **[OBSERVED]** `rea-out/probe-levels-attic.json`.

**E4. Level `visible`/`viewable` are persisted plan data.** In the freshly loaded attic example, "Attic" and "Roof" came up
with `visible=false` while `viewable=true` — the plan file carried them. The parser confirms this explicitly: a level's
`visible` and `viewable` XML attributes are read as `!== "false"` (both default true). The Studio example
(`Studio.sh3x`) has **no `<level>` elements at all** (its `Home.xml` declares only the environment and cameras), so all its
objects are level-less and always drawn — a useful reminder that "level" is optional in this data model.
**[OBSERVED]** `sh3x/Home.xml` (`Studio.sh3x`, 31077 bytes, zero `<level>` tags), the live level list, and
`setLevelAttributes` in the bundle.

**E5. Level visibility and the ground are coupled.** Turning a level off re-runs `groundChangeListener`, because the ground
may need to stop showing that level's background image. Changing a level's **elevation** or **elevation index** triggers a
full `updateObjects(homeObjects)`; changing its **height** updates rooms; changing **floor thickness** updates walls and
rooms. That is a compact, explicit invalidation table worth imitating. **[OBSERVED]** `addLevelListener` in the bundle.

### F. The "Modify 3D view…" dialog (the whole surface for the real-time look)

**F1. It is a three-column card laid out in the page template.** The live `#home-3Dattributes-dialog-template` contains:
Ground (Color / Texture radios + a "Background image visible in 3D view" checkbox), Sky (Color / Texture radios),
3D rendering (Light brightness Dark…Bright + Walls transparency Opaque…Invisible). The panel is titled **"Modify 3D view"**.
**[OBSERVED]** live template HTML and `localization.json` (`Home3DAttributesPanel.home3DAttributes.title`).

**F2. It raises no direct 3D action on the URL bar / no WebGL side channel.** Everything in it is a plain property change on
`HomeEnvironment`; the 3D component listens to `SKY_COLOR`, `SKY_TEXTURE`, `GROUND_COLOR`, `GROUND_TEXTURE`,
`BACKGROUND_IMAGE_VISIBLE_ON_GROUND_3D`, `LIGHT_COLOR`, `WALLS_ALPHA`, plus camera `Z` and level `VISIBLE`/`VIEWABLE`.
**[OBSERVED]** the listener registrations in `createBackgroundNode`, `createLights`, `addLevelListener` and the walls path.

**F3. The instrumented toolbar has the view-mode buttons but no dedicated "Modify 3D view" button in the Online build's
toolbar dump.** I found `toolbar-button-VIEW_FROM_TOP` ("View from a top point of view") and
`toolbar-button-VIEW_FROM_OBSERVER` ("View from a human observer point of view") among 118 buttons, but no level or
3D-attributes toolbar button in the launcher bar — those live in the application/plan menu. **[OBSERVED]**
`rea-out/probe-toolbar.json`.

### G. The environment data model (as far as it is visible in the plan)

From `Studio.sh3x`'s `Home.xml` **[OBSERVED]**, `sh3x/Home.xml`:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

The exporter writes `groundColor`, `backgroundImageVisibleOnGround3D` (only when non-default), `skyColor`, `lightColor`,
`wallsAlpha` (only when non-zero, with default 0), `allLevelsVisible` (only when non-default), `observerCameraElevationAdjusted`,
`ceillingLightColor`, `drawingMode`, `subpartSizeUnderLight` (only when non-default, default 0), plus the photo/video fields.
Note `wallsAlpha == 0` is omitted from the file, which is why the Studio file shows no `wallsAlpha` attribute. The 3D
attributes controller's `modify3DAttributes` is the single write path and posts one undoable edit
(`Home3DAttributesModificationUndoableEdit`) containing the old ground color/texture/bg-image flag/sky/light/alpha and the new
set — an elegant "one undo covers the whole dialog" design. **[OBSERVED]** the exporter and `Home3DAttributesController` in
the bundle.

### H. What the browser build genuinely shares with the desktop build

The JS classes are the Java classes transpiled: `HomeEnvironment`, `HomeComponent3D`, `Home3DAttributesController`,
`Room3D`, `Wall3D`, `Ground3D`, `Background3D`, `Appearance3D`, `HTMLCanvas3D`. The real-time 3D view is fully functional in
the browser (round-1 D8 already established `createView3D` returns a real component); only the *photo* renderer (SunFlow)
and video are missing. So everything in this report about the real-time look is **shared behaviour**, while the photo/video
differences stay as round 1 described. **[OBSERVED]** the live class names and a working rendered image; **[INFERRED]** for
the desktop parity claim (I did not run the desktop app).

---

## 3. Ideas for CasaPlazAI

CasaPlazAI is a single-page Vite/TypeScript/Three.js floorplanner with `FloorplanData` v1 (meters, CCW polygons, rooms,
openings, furniture) autosaved to localStorage. "Effort" is relative to that stack. Each idea names the finding it comes from.

### Tier 1 — high value, low effort

1. **A "3D view" settings panel with exactly these four controls, nothing more.** *Ties to F1, C2, C5, D1.*
   Ship **Sky colour**, **Ground colour**, **Light brightness** (0–100 %, greyscale multiplier) and **Walls transparency**
   (0–100 % → material opacity), plus a **"Show plan underlay on the 3D ground"** checkbox. That is the entire real-time look
   surface of a mature competitor; it is a few dozen lines in Three.js (`scene.background`, a ground mesh material, a
   directional-light intensity, wall `material.opacity` + `transparent`) and it answers "my 3D view is too dark / I can't see
   into the room". Because CasaPlazAI has a plan schema, this can be a small additive `view3d` object rather than free-form
   editor state. *Effort: low–medium. Value: very high.*

2. **Make wall transparency also fade floors — and say so.** *Ties to D1, D5.* SH3D's slider is documented as "walls (and
   floors) transparency" and in the code the same alpha is pushed to room floor and ceiling meshes. The aerial-view win is
   real: once the near walls fade, the **floor** of the room you are inspecting becomes readable, not just its furniture.
   Implement as one shared `wallAlpha` applied to wall + floor (+ optional ceiling) materials, and label it "Walls and floors
   transparency". *Effort: low. Value: high.*

3. **Hide the flat horizon slab when the camera goes below floor level — but keep the real ground.** *Ties to C6, C6b.* SH3D
   flips `visible` on the flat backdrop quad inside the sky node on `camera.z >= 0`, while the textured/lit ground mesh keeps
   drawing. That pairing is the useful bit: the horizon slab is what looks wrong from underneath (a giant grey plane cutting
   the view), whereas removing the lit ground entirely would create a hole. In Three.js, keep the ground mesh visible and give
   the sky/horizon disc a `camera.position.y >= 0` visibility toggle. *Effort: very low. Value: medium-high.*

4. **Two-level visibility flags, not one.** *Ties to E1–E3.* Copy the exact split: a persistent, per-floor **`viewable`**
   flag (which floors this plan is allowed to show) and a transient **`visible`** flag for the current mode. Add the two
   commands verbatim in meaning — **"Show all floors"** and **"Show selected floor and below"** — because "selected floor and
   below" is the thing that makes multi-storey edits legible, and it falls out of one ordered walk over the floor list.
   In `FloorplanData` terms — where v1 has no top-level floor entity (rooms carry floor identity) — the per-floor `viewable`
   flag would be an additive, defaulted-true field on whatever floor record CasaPlazAI settles on, while `allLevelsVisible`
   belongs in the editor's 3D-view state, not the schema (it is a view preference, like SH3D's environment flag).
   *Effort: low. Value: high.*

5. **Do not invent a point/spot light for the live view.** *Ties to B4, A2, A3.* SH3D ships a full light model but the
   real-time web renderer ignores it entirely, because a forward renderer with per-object point lights is expensive and the
   results are hard to keep consistent. For CasaPlazAI, resist adding "place a lamp" to the live view until there is a
   *quality/presentation* render mode that can afford it. If lights are added, cap the count (SH3D's cap is 16 directional
   lights) and degrade overflow into the ambient term rather than dropping it. *Effort: n/a (a decision). Value: high.*

### Tier 2 — high value, medium effort

6. **Give `FloorplanData` a tiny additive "view3d" block, migrated properly.** *Ties to C1–C8, D1, G.* The whole real-time
   look that users expect to travel with a plan is: `{ skyColor, groundColor, skyTextureId?, groundTextureId?,
   backgroundImageOnGround, lightBrightness, wallAlpha }`. SH3D stores exactly this in `<environment>` and omits defaults.
   CasaPlazAI's migration hook (`registerTransform(1, …)` + atomic `SCHEMA_VERSION` bump) is the right vehicle: register the
   transform, keep every new field optional with a documented default, and reject unknown future versions as it already does.
   *Effort: medium. Value: high — it makes the 3D look shareable and testable instead of per-device.*

7. **Texture transforms as four numbers on floors and walls.** *Ties to D6, C7.* SH3D's `HomeTexture` exposes
   `xOffset, yOffset, angle, scale, width, height, fittingArea`; the browser build applies generated planar texture
   coordinates for the ground (`100000`-unit planes) and a translation-only transform for the sky. CasaPlazAI can expose a
   simpler, honest subset — **scale** and **rotation** for room floors — mapping directly onto Three.js `texture.repeat`
   and `texture.rotation` with `wrapS/T = RepeatWrapping`. *Effort: medium. Value: medium-high; big perceived-quality jump
   for the fixed `floorTexture` enum (`wood | tile | carpet | concrete`).*

8. **Presentation/"quality" mode driven by the same settings, with the honest trade-off.** *Ties to A2, B2, B4.* The
   competitor separates the *live* look (fixed rig, no shadows) from the *expensive* look (global illumination, per-object
   lights, sun). CasaPlazAI's PNG/JPEG export is the natural home for the expensive pass: reuse the exact same environment
   fields, then render offscreen with soft shadows and (optionally) progressive accumulation while the UI stays responsive.
   Label the options exactly as SH3D labels its four levels do — with a rough time estimate. *Effort: medium. Value: high.*

9. **A "project the plan underlay onto the 3D ground" toggle.** *Ties to C7.* CasaPlazAI already has a per-floor blueprint
   underlay (`casaplaza.underlay.v1`, `{ [floorId]: UnderlayState }`) that is deliberately outside `FloorplanData`. SH3D's
   "Background image visible in 3D view" does exactly this: it projects the visible ground-level floor's background image
   onto the 3D ground, scaled to the image size × its scale, centred on its origin. That is a strong 2D→3D continuity
   feature that reuses an asset CasaPlazAI already has, without moving the underlay into the schema.
   *Effort: medium. Value: medium-high.*

### Tier 3 — lower value / later

10. **Brightness as a plain grayscale multiplier, not a colour.** *Ties to B3.* SH3D's slider writes
    `(v<<16)|(v<<8)|v`, so the light is always neutral; the *colour* of the sun/sky is a separate control. Copy that
    separation — it avoids the "why is my room orange?" bug class. *Effort: very low. Value: medium.*

11. **A level invalidation table instead of a global "rebuild the scene".** *Ties to E5.* SH3D maps each changed property to
    the minimum affected set: `visible`/`viewable` → that level's objects + ground; `elevation`/`elevationIndex` → all
    objects; `height` → rooms; `floorThickness` → walls + rooms; `backgroundImage` → ground. In a React/Three app this is the
    difference between a smooth multi-floor editor and a janky one. *Effort: medium-high. Value: medium (matters once plans
    are large).*

12. **Deterministic draw order for translucent surfaces.** *Ties to A4.* SH3D draws opaque geometry first, then sorts the
    transparent set back-to-front by view-space Z and blends with `ONE / ONE_MINUS_SRC_ALPHA` (premultiplied). With a
    transparency slider, CasaPlazAI will hit exactly this problem; the simple sort is a proven-enough answer and avoids a
    full OIT pipeline. *Effort: medium. Value: medium.*

### Anti-patterns to avoid (learned from SH3D's rough edges)

- **Don't let the sky be affected by the light-brightness control.** In SH3D the sky is unlit (`lightingEnabled=false`), so
  dragging brightness to black leaves the sky (and the exported look) unchanged; users may find that surprising or find it
  *reassuring* — but the behaviour should be a deliberate, documented choice. *Ties to C2, B2.*
- **Don't leave a slider's HTML default out of sync with the model.** SH3D's dialog ships `value="128"` and only syncs to
  `getWallsAlpha()*255` through a property listener, so a value of 0 briefly renders as "half transparent". Initialize from
  the model, always. *Ties to D2, [OBSERVED].*
- **Don't reuse a "texture" field for two different transforms.** SH3D's sky texture uses only `xOffset` while walls/rooms
  use the full transform and the ground uses generated planar coordinates — three different interpretations of one struct.
  Pick one primitive (offsetX, offsetY, rotation, scale) and apply it consistently. *Ties to C3, C7, D6.*
- **Don't expose a light count the renderer cannot honour.** SH3D silently degrades past 16 directional lights into the
  ambient term; a CasaPlazAI light budget should be either enforced in the UI or visibly surfaced, never silent.
  *Ties to A2.*

---

## 4. Unknowns

1. **I did not run the desktop build.** Everything here was verified in the browser (7.5.2) and in the shared bundled code.
   The claim that the desktop real-time view behaves identically is **[INFERRED]** from the shared class names and the
   transpilation, not observed on the Java/Java3D side.
2. **Frame-rate numbers are SwiftShader-only.** My 0.1–2.4 fps readings are a software-rasteriser artefact and say nothing
   about real-GPU performance; I could not measure GPU timing.
3. **I verified the ground *texture* path with pixels but not the sky texture path.** I built a real `HomeTexture` from the
   live catalog and measured its effect on the ground (C9). The **sky** texture route uses a different transform (translation
   by `−xOffset` only) and I did not apply one, so the sky-texture visual result is documented + code-observed only. Texture
   transforms on walls/rooms are likewise code-observed only, and my earlier "no textures" reading was a false negative caused
   by the example homes shipping texture-free surfaces.
4. **"Shiny" (specular) was not visually isolated.** I read the shader's specular branch and the per-surface `specularColor`
   field, but the plan's default surfaces all had `specular = 0`, so I never saw a highlight and cannot quantify it.
5. **The `viewable`-vs-`visible` semantics are observed, not documented.** My reading — "viewable = allowed to be drawn,
   visible = drawn now" — comes from the `isViewableAndVisible()` predicate and the live flag behaviour. The official help
   describes the UI commands but not the two-flag data model in these words.
6. **Why exactly 28 geometry records carry transparency 0.5 at `wallsAlpha = 0`** is unresolved. Candidates are door/window
   glazing and selection outlines; I did not trace each record back to its plan object.
6b. **Why SH3D hides the flat backdrop quad below floor level while leaving the `Ground3D` mesh visible from underneath** is
   a behaviour I measured but can only *infer* the intent of (avoid the horizon slab cutting the view). The visible
   from-below ground surface is fully lit, which may or may not be intended.
7. **The `wallsAlpha == 0` special case.** Walls get `transparency = wallsAlpha` unconditionally while rooms/walls take a
   `wallsAlpha == 0 → 0` shortcut; whether this is a deliberate optimisation or a subtle inconsistency I could not tell from
   behaviour alone (both render opaque at 0).
8. **The ceiling part's `visible` flag.** In the live `Room3D`, child 2 (selection) was `visible=false`, and the ceiling
   part was constructed only when the child count exceeded 2; the exact conditions under which a ceiling is omitted for
   level-less rooms are code-read, not exhaustively exercised.
9. **Antialiasing quality.** The context requests `antialias:true`, and depth was 24-bit in my run, but I did not measure
   MSAA sample counts or compare AA images; on SwiftShader the answer may differ anyway.
10. **The remaining Desktop-only surfaces** (photo quality panes, SunFlow tunables, video) stay as round 1 left them; this
    job deliberately did not re-open them.
11. **The 3D-attributes dialog's numeric defaults** (`brightness` 128, `walls-transparency` 128 in the HTML) were read from
    the template while the dialog was not displayed; I did not observe a user opening it, so I cannot confirm the exact
    on-screen slider positions or the full datalist tick count at display time.

---

## Appendix: Evidence inventory (this job folder)

| File | What it is |
|---|---|
| `report.md` | This report |
| `libjs-sweethome3d.min.js` (2.62 MB, sha256 `053e7d1a…66d89`) | Shipped Sweet Home 3D JS 7.5.2 bundle, copied from round 1 for reproducible static reading (GPL; not reproduced in this report) |
| `localization.json` (1963 keys) | The app's English UI string table as served to the browser |
| `Studio.sh3x`, `sh3x/Home.xml` | Official example home + its plan XML (no `<level>` elements; environment attributes quoted above) |
| `rea-out/shaders.json` | **Live vertex + fragment shader source extracted from the running WebGL context** (`gl.getShaderSource`) |
| `rea-out/probe-summary.json` | Version, GL context, the 5 live lights, the 16-light cap, environment values, level list |
| `rea-out/probe-final.json` | Pixel A/B for walls alpha (0/0.5/1), ground colour, sky colour, top camera below/above Z=0 |
| `rea-out/probe-sky.json` | Observer-camera sky colour A/B (default → red → blue) proving the sky is unlit |
| `rea-out/probe-lit.json` | Light-brightness ladder on lit geometry (white / 0x303030 / 0xD0D0D0 / black) |
| `rea-out/probe-bgquad.json` | Background-backdrop `visible` flag vs camera Z (true at 150, false at −40; sky shells stay true) |
| `rea-out/probe-groundvis.json`, `probe-ground2.json` | Separation of the backdrop quad from the always-drawn `Ground3D`; ground colour A/B above vs below Z = 0 |
| `rea-out/probe-verify.json` | Re-confirmation: 16-light cap in the live shader, no emissive uniform, 5 lights, WebGL 1.0 |
| `rea-out/probe-texclass.json`, `probe-texfind.json` | Live texture catalog reachability (9 categories, "Beige fabric" 85×85) and the finding that both example homes ship texture-free surfaces |
| `rea-out/probe-texture8.json`, `probe-texture7.json`, `probe-texture4.json` | **Pixel proof of the ground texture path**: flat `(253.5,253.5,253.5)` → patterned `(234.2,225.9,206.4)` with a real `HomeTexture` → restored |
| `rea-out/probe-alpha-scale.json`, `probe-roomapp.json`, `probe-floors.json` | Wall + floor/ceiling appearance transparency at α = 0 / 0.5 / 1 |
| `rea-out/probe-levels-attic.json` | The definitive level-gating measurement: display-selected → 114/122 furniture visible; display-all → 122/122 |
| `rea-out/probe-levels4.json` | "Display selected level and below" walk over the level list |
| `rea-out/probe-texture2.json` | Scene geometry histogram (2656 records; 2465 lit; transparency `{1:2628, 0.5:28}`) |
| `rea-out/probe-reload-levels.json`, `probe-homes` (via `scripts/p_homes.js`) | Home/level inventory; `Studio.sh3x` has no levels |
| `rea-out/probe-toolbar.json` | 118 live toolbar buttons incl. `VIEW_FROM_TOP` / `VIEW_FROM_OBSERVER` |
| `rea-out/probe-attr-dialog.json`, `probe-ground-texture.json` | 3D-attributes slider attributes; ground-texture probing (negative result recorded) |
| `rea-out/javadoc-HomeEnvironment.html` | Official 7.5 javadoc for the environment data model |
| `docs/editing3DView.html` | Official help "Editing 3D view" (quotes "walls (and floors) transparency") |
| `docs/www.sweethome3d.com_users-guide_.html`, `docs/de-home.html` | Official users guide and German landing page |
| `scripts/cdp.mjs` + `scripts/p_*.js` | The exact CDP driver and in-page probes used, so every [OBSERVED] claim is reproducible |
| `chrome.log` | Launch log of the SwiftShader-enabled headless Chrome on port 9223 |

**Licences / provenance.** Sweet Home 3D is GPL; the JS bundle was downloaded once and is retained only for static
keyword/API reading — no source is copied into this report. `Studio.sh3x` and `3BedroomHouseWithAttic.sh3x` are the vendor's
official example homes (CC-BY, per the `License` property inside `Home.xml`). All quotes are UI strings or vendor
documentation, not source code.
