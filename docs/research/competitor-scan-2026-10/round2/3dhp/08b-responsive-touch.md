# 3D House Planner (3dhouseplanner.com) — Responsive layout & touch/pointer handling

Round-2 deep dive for **CasaPlazAI** workspace-UI redesign.
Job folder: `10-08b-ui-layout-onboarding-respons`. Every write stays in this folder.

**Question.** App: 3D House Planner, https://www.3dhouseplanner.com/ (browser editor, Babylon.js,
2D planner iframe at `2D-Planner/index.php`). Responsive layout and touch: breakpoints,
phone/tablet viewport emulation, touch gestures and pointer handling.

**Reuse (read-only).** Round 1 (`rea-3dhouseplanner-2026-10/08-08-ui-layout-onboarding/report.md`
+ its `css/`, `js/`, `rea/` evidence) established the general shell, the first-run funnel and the
CSS breakpoint list. This round reuses its shipped bundles and **does not re-derive** those; it
adds: (a) a live width sweep of the *JS*-driven top-bar fitter, (b) real CDP touch gestures
against the Babylon canvas with camera-state deltas, (c) deobfuscation of every editor module so
the shipped strings are readable, (d) the 2D planner's own modern shell CSS.

**Evidence tags.** `OBSERVED` (seen in a capture or a shipped file), `DOCUMENTED` (vendor docs
URL), `INFERRED` (my reasoning). No screenshots are used as evidence: this session has no image
input, so all claims come from DOM geometry, computed style, JS state and shipped source.
`DOCUMENTED` anchors for this round: MDN
[`touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) and
[Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) (the
`touch-action`+pointer-listener contract), and the Babylon.js
[camera](https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction) and
[pointer-input](https://doc.babylonjs.com/features/featuresDeepDive/input/pointerEvents) pages
for the `ArcRotateCamera` input semantics.

**Time.** Started 2026-10-31 16:06 CET; research (including the phone-emulated and 2D-planner
runs) closed at 17:06, well inside the 120-minute cap.

---

## 1. Summary (5 bullets)

- **Breakpoints are three independent systems, not one scale.** CSS `@media` steps at
  1920/1600/1440/1366/1100/700/640/560/520/480/420 px (round 1, re-verified), plus a **JS
  top-bar fitter** in `hp-ui.js` that adds `hp-bar-c1…hp-bar-c4` by *measuring* the bar and
  moving tool buttons into a `hp-more` overflow menu — so the effective phone layout is decided by
  DOM measurement, not by a media query. (`OBSERVED`, `layout-sweep.json`, `layout-order-probe.json`)
- **The JS fitter is deterministic and order-independent**, but *not monotonic*: at 320 px it lands
  on the hardest step (`c1 c2 c3 c4`, 2 buttons + 6 overflow), at 360 px it lands on the softest
  (`no c1..c4`, all 8 inline) — a 40 px wider viewport gets *less* compacting, and the forward and
  reverse sweeps agree exactly. (`OBSERVED`, `layout-order-probe.json`)
- **The editor is genuinely multitouch-capable**: the Babylon camera is an `ArcRotateCamera`
  whose attached `ArcRotateCameraPointersInput` has `multiTouchPanAndZoom: true` and
  `multiTouchPanning: true`. Real CDP touch events on `#renderCanvas` orbit (1 finger), zoom
  (2-finger pinch) and pan (2-finger drag) — verified by camera `alpha`/`beta`/`radius`/`target`
  deltas. The pinch path leaves the **active** camera unclamped (`lowerRadiusLimit: null`), and a
  live pinch drove `radius` from `28.28` to **`−33.19`**; a scene inventory showed the radius-limit
  assignment exists but landed on an inactive `Camera2` (`lower = upper = 28.284`).
  (`OBSERVED`, `gesture-probe.json`, `camera-inventory.json`, `pep-check.json`)
- **Touch is driven by native Pointer Events; the PEP polyfill is loaded but inert.** The head
  loads `code.jquery.com/pep/0.4.2/pep.min.js` *before* Babylon, yet `window.PointerEvent` stays
  the native `[native code]` constructor and a real touch on the canvas fires the app's
  `pointerdown`/`pointermove`/`pointerup` listeners with `pointerType:"touch"` (a real mouse poll
  fires `pointerdown`; a real touch produced 0 hits in the isolated listener test). The polyfill
  is legacy insurance, not the working mechanism. (`OBSERVED`, `gesture-probe.json`,
  `pep-check.json`, `rea/editor-dom.html`)
- **Mobile is CSS + measurement reflow, not a mobile UI — and the 2D planner is its one
  gesture-complete surface.** There is **no `orientationchange` listener anywhere**, no
  `env(safe-area-inset-*)`, no `(hover: none)`/`(pointer: coarse)` **CSS** queries, and the only
  `matchMedia` call in the editor modules is a one-shot `(max-width: 700px)` check at boot that
  auto-collapses the left tool dock. A live portrait→landscape rotate confirmed the bug: the bar
  re-fit from 94 px to 54 px, but the dock stayed `hp-tools-collapsed` / `display:none`, and a
  phone-emulated census found **55 of 62 visible controls under 44 × 44 px**. The 2D planner, by
  contrast, opens as an embedded full-screen iframe (`fp-embedded fp-modern`) whose plan
  `viewBox` genuinely pans and pinch-zooms under real touch (412.5 → 108.55 wide on a pinch) and
  whose phone rail keeps 13 tool buttons at **47 × 44 px**. (`OBSERVED`,
  `editor_hp-ux.js` deobfuscated, `phone-emulation-probe.json`, `planner-gesture3-probe.json`)

## 2. Findings

### 2.1 Method and evidence files in this folder

| File | What it is |
|---|---|
| `report.md` | this report |
| `sources.json` | machine-readable source list (URLs, kind, evidence tag) |
| `layout-sweep.json` / `.log` | 21 widths × top-bar DOM/computed-style snapshot from a live editor (probe `probe-layout-sweep.mjs`) |
| `overflow-sweep.json` | `scrollWidth` vs `clientWidth` at each width — no horizontal overflow at any width |
| `layout-order-probe.json` / `layout-order.log` | forward + reverse sweep comparison, boot-at-390 and boot-at-768 snapshots, `hp-more` menu inventory (probe `probe-layout-order.mjs`) |
| `gesture-probe.json` / `gesture.log` | CDP touch/wheel gestures vs Babylon camera state, and event counters on `#renderCanvas` (probe `probe-gestures.mjs`) |
| `interaction-probe.json` | camera/input introspection, canvas geometry, 2D-planner iframe identity (probe `probe-interaction.mjs`) |
| `emulation-probe.json` | phone/tablet viewport-emulation attempt on the marketing page (it never booted the editor — see 2.8) |
| `phone-emulation-probe.json` / `phone-emulation.log` | full phone-emulated editor boot (iPhone UA, `isMobile`, `hasTouch`, dsf 3) at 390×844, portrait→landscape→portrait rotation, touch-target census (probe `probe-phone-emulation.mjs`) |
| `planner2d-probe.json` | 2D planner as embedded iframe at 1280 and 390 (probe `probe-2d-iframe.mjs`) |
| `evidence/2dplanner-modern.css` | the 2D planner's **modern shell** stylesheet, retrieved by plain HTTP GET with referer (125 KB) |
| `evidence/2dplanner-style.css` | the 2D planner's legacy stylesheet (71 KB) |
| `probe-*.mjs` | the Playwright probes actually run (reproducible; not application code) |
| `/tmp/deob4`, `/tmp/deob5` | deobfuscated copies of all 29 editor modules (working copies only; not needed as deliverables) |

**Obfuscation note.** Every editor module is string-obfuscated with a custom base64 variant, a
`- 0xdb`-style index offset and a rotated string array validated by a `parseInt` checksum. I
resolved the rotation (`435` for `hp-ui.js`) and substituted all `_0xNNN(0xHEX)` calls with their
real string, which is how the `hp-ui.js`/`hp-ux.js`/`hp-editor.js` quotes below are readable.
That extraction is my own analysis of the shipped bytes, not a copy of their source.

**Round-1 gaps this round closes** (from its §4): *"Touch not tested … actual behaviour (momentum
pan, pinch, hit accuracy) is unknown"* → §2.5/§2.6/§2.10; *"2D planner … whether it is embedded
(…) or opened as a separate navigation is inferred as separate navigation"* → **it is an embedded
iframe**, §2.7; *"Editor JS is obfuscated, so behaviour inside `hp-editor.js`/`hp-bim.js` was read
only where strings allowed"* → all 29 modules deobfuscated, which is what produced §2.3/§2.5. The
remaining round-1 gaps (the `app.php`-vs-`index.php` negotiation, undo/redo depth, IndexedDB vs
localStorage, exact shortcuts) are out of scope for this question and stay open.

### 2.2 The CSS breakpoint ladder (re-verified on the shipped bundles)

`OBSERVED`, `css/hp-ui.css`, `css/hp-panels.css`, `css/hp-io.css` (round-1 evidence, re-read).

| Query | What it changes |
|---|---|
| `max-width: 1920`…`1600` | `.hp-brand-name` hidden at ≤1600; non-primary tool labels hidden |
| `max-width: 1440` | `.hp-save-text` hidden; 1366 also narrows the project-name input to 150 px |
| `max-width: 1100` | all tool labels, `.hp-seg-btn span`, `.hp-level-label`, `.hp-brand-name` hidden; project name 130 px |
| `max-width: 700` | `.hp-save-state`, `.hp-status-fps` hidden; project name 90 px; top bar gap 4 px; `#hpToolCard` 150 px; `.hp-start-grid` 1 column; dialogs become bottom sheets (`.hp-dialog-card { border-radius: 18px 18px 0 0; max-height 92dvh }`) |
| `max-width: 640` | `.hp-lc-groups` 1 column |
| `max-width: 560` | `:root { --hp-topbar-h: 94px }`; `.hp-topbar { flex-wrap: wrap }` with explicit `order` 1/2/3 for left/right/center |
| `max-width: 520` | `.hp-grid3`, `.hp-qto-opts`, `.hp-cl-add`, `.hp-bulk-pset`, `.hp-tree-filters` → 1 column |
| `max-width: 480` | `.hp-texture-grid` min tile 64 px |
| `max-width: 420` | (2D planner) `.fp-*` narrowest step |
| `max-height: 720` / `560` | (2D planner) rail button height 44 px, compact rows |
| `prefers-reduced-motion: reduce` | transitions/animations off (dialogs, toasts, FAB menu) |
| `print` | top bar, status bar, panels, popovers, toasts, dialogs hidden |

Missing from the whole corpus: `env(safe-area-inset-*)`, `(hover: none)`, `(pointer: coarse)`,
`(orientation: portrait|landscape)`, `min-resolution`, `-webkit-tap-highlight-color`,
`-webkit-touch-callout`, `touch-action` on any DOM control other than the two canvases.
`overscroll-behavior: contain` appears 7× (panels/scroll areas) but never on `html`/`body`.

### 2.3 The JS top-bar fitter — how the real phone layout is chosen

`OBSERVED` — `hp-ui.js` (deobfuscated), reproduced live in `layout-sweep.json` and
`layout-order-probe.json`.

The header is built in JS at boot (`hp-topbar` → `hp-topbar-left` / `hp-topbar-center` /
`hp-topbar-right`), not authored in HTML. The right group always contains the 8 tool buttons
(`hpToolFile`, `hpToolCatalog`, `hpToolAi`, `hpToolFrame`, `hpToolRender`, `hpToolBim`,
`hpToolHelp`, `hpToolFullscreen`), plus a `.hp-more` wrapper holding a `more_vert` button and a
`.hp-more-menu` container.

Algorithm, in my words:

1. `measure(group)` (`_0x3aa4f0`) unions the client rects of every direct child **and**
   grandchild (`:scope > *, :scope > * > *`), skipping anything inside `.hp-more-menu`,
   `.hp-lang-menu` or `[hidden]`. It returns one bounding rect per top-level group.
2. `overflows()` (`_0x1588f0`) is true when either a group's rect escapes the bar
   (`l < -1 || r > clientWidth + 1`) **or** two groups overlap: horizontal overlap > −6 px
   **and** vertical overlap > 2 px. The `-6 px` slack and `> 2 px` vertical test are what let
   buttons sit in a wrapped second row without counting as a collision.
3. `fit()` (`_0x1a81e8`) resets to the widest state, then adds `hp-bar-c1`, `hp-bar-c2`,
   `hp-bar-c3` one at a time while `overflows()` stays true; then it moves buttons out of the bar
   into the `hp-more-menu` one at a time, in the fixed order
   `['hpToolFullscreen','hpToolHelp','hpToolBim','hpToolRender','hpToolFrame','hpToolFile']`;
   if it is *still* overflowing it adds `hp-bar-c4` and then reparents the moved buttons back
   into the bar.
4. `rows(enabled)` (`_0x4114ca`) toggles `hp-bar-rows` and sets
   `document.documentElement.style --hp-topbar-h = 94px` (else removes the property so CSS
   `--hp-topbar-h: 54px` applies). So the 94 px two-row bar is a **JS decision that mirrors the
   `max-width: 560` CSS rule**, not a media query.
5. The recompute (`_0x25f41d` → `_0x318cab`) is debounced **60 ms** and is triggered by
   `window resize`, a `MutationObserver` on the body, and `document.fonts.ready`. Before each
   pass it resets `hp-bar-rows`; a pass is skipped when `(clientWidth|movedCount|textContent)`
   is unchanged, so the fit is idempotent and cheap.

Live results (`layout-sweep.json`, one editor session, viewport height 900):

| width | classes added | bar h | inline/overflow | project input | notes |
|---|---|---|---|---|---|
| 320 | c1 c2 c3 c4 | 94 | 2 / 6 | 72 px | hardest step, two rows |
| 360 | *(none)* | 94 | 8 / 0 | 150 px | widest content state, two rows |
| 390–420 | c1 c2 c3 | 94 | 3 / 5 | 84 px | `hp-more` holds Frame/Balanced/BIM/Help/Fullscreen |
| 480 | c1 c2 c3 | 94 | 5 / 3 | 84 px | |
| 520 | c1 c2 c3 | 94 | 6 / 2 | 84 px | |
| 560 | c1 c2 c3 | 94 | 8 / 0 | 84 px | still two rows |
| 600–660 | c1 c2 c3 c4 | 54 | 2 / 6 | 72 px | one row; `hp-bar-c4` reached |
| 700 | c1 c2 c3 | 54 | 4 / 4 | 84 px | |
| 768–820 | c1 c2 c3 | 54 | 4–5 / 4–3 | 84 px | |
| 900 | c1 c2 c3 | 54 | 6 / 2 | 84 px | |
| 1024–1100 | *(none)* | 54 | 8 / 0 | 150 px | |
| 1280 | c1 | 54 | 8 / 0 | 150 px | segment labels visible again |
| 1440–1366 | *(none)* | 54 | 8 / 0 | 190 px | |
| 1600 | *(none)* | 54 | 8 / 0 | 190 px | save text + level label visible |
| 1920 | c1 | 54 | 8 / 0 | 190 px | brand name visible |

**Note on `hp-bar-rows`:** the class exists in the code (`css/hp-ui.css` styles it; `hp-ui.js`
toggles it and writes `--hp-topbar-h: 94px`) but it **never appeared in any of my sweeps**, yet the
bar measured 94 px tall at ≤560 px — because the CSS `@media (max-width: 560px)
{ :root { --hp-topbar-h: 94px } }` catches the same widths. So the two-row phone bar is
effectively CSS-driven today, while the JS row flag/`setProperty` path is dead weight that the
`fit()` loop would pick up only if `measure()` ever reported overflow. (`OBSERVED`,
`layout-sweep.json`; `INFERRED` on the dead path)

Two further facts stand out and matter for CasaPlazAI:

- **The classes are not monotonic in width.** At 320 px the fitter exhausts every step
  (`c1 c2 c3 c4`, 2 inline / 6 overflow), at 360 px it fits everything inline with no step at
  all, and at 600–660 px it jumps to the *hardest* step again. The steps are applied greedily
  until overflow stops, then the button eviction loop runs; because eviction removes the *widest*
  buttons first, a slightly wider viewport can cascade back to a smaller `c` class.
- **It is order-independent.** The reverse sweep (320 → 1920) produced byte-identical class
  strings and identical inline/overflow counts at every width
  (`layout-order-probe.json` `forward` vs `reverse`, all `SAME`). That is because `fit()` always
  starts from the widest state and re-derives from measurements.

Class effects are then pure CSS, so the measured layout and the stylesheet agree:
`.hp-bar-c2 input.hp-project-name { width: 120px }`, `.hp-bar-c3 … { 84px }`,
`.hp-bar-c4 … { 72px }` (`css/hp-ui.css` 1068–1083).

### 2.4 The `hp-more` overflow menu

`OBSERVED` — `layout-order-probe.json` `moreMenu`, `bootPhone390`.

- DOM: `.hp-more` (position: relative) → `.hp-tool.hp-more-btn` (`more_vert` icon,
  `aria-expanded`) + `.hp-more-menu` (absolutely positioned `right: 0; top: calc(100% + 8px)`,
  `min-width: 220px`, `z-index: 1000`, `[hidden]` attribute).
- Closed by tapping elsewhere: a document-level `pointerdown` handler closes it when the target is
  outside the `.hp-more` subtree — so the dismissal is pointer-based and therefore touch-safe.
- At 390 px the live menu was `220 × 222 px` at `(164, 51)` and contained 5 rows:
  *Frame all, Balanced, BIM, Help, Full screen*. **Inside the menu every `.hp-tool-label` is
  forced to `display: block`** (`.hp-more-menu .hp-tool .hp-tool-label { display: inline !important }`),
  i.e. the icon-only phone bar is backed by a labelled dropdown. That is a deliberate
  discoverability trade-off: labels are dropped from the bar but restored in the menu.
- At boot-at-768 the same menu held 4 items (Render, BIM, Help, Fullscreen) and the tool dock was
  **not** collapsed; at 390 it was collapsed.

### 2.5 Touch and pointer handling in the 3D editor

`OBSERVED` — `gesture-probe.json`, `css/boot-main.css`, `rea/editor-dom.html`.

- The canvas is `#renderCanvas` with `touch-action: none` (`boot-main.css`), and
  `html, body { overflow: hidden; width/height: 100% }` — so the app never relies on browser
  scrolling for gestures. A second canvas `#gizmoContainer` (80×80) sits over it.
- **PEP 0.4.2 is loaded but is a no-op in the browsers I could test.** The page head contains
  `https://code.jquery.com/pep/0.4.2/pep.min.js`, immediately followed by PEP's generated
  `<style>` with `[touch-action="none"]{ … }` etc. (`rea/editor-dom.html`; the same `<style>`
  shows up in the live DOM). PEP installs a `window.PointerEventsPolyfill` global with
  `{dispatcher, Installer, PointerEvent, PointerMap, targetFinding}`, but `window.PointerEvent`
  is still **the native `[native code]` constructor** (`PointerEvent.name === "PointerEvent"`,
  `.prototype` has `pointerType`/`width`/`isPrimary` and **no** `touches`), and `onpointerdown in
  window` is true. The decisive test (`probe-pep.mjs` → `pep-check.json`): one real CDP
  `touchStart`/`touchEnd` at the canvas centre produced **0 `touchstart` and 0 `pointerdown`
  listener hits**, while a real mouse press produced **1 `pointerdown`** — i.e. in this Chromium
  the native pointer pipeline is what the canvas sees, and PEP's touch-derived synthesis is not
  what drives it. (`OBSERVED`, `pep-check.json`)
  *Interpretation (`INFERRED`):* in a legacy WebKit that lacks Pointer Events, PEP would be the
  thing that makes the app work at all; in modern Chromium/Blink it is inert. So the shipped
  polyfill is real touch insurance, but it is **not** the mechanism behind my gesture results.
- The canvas event counters under real CDP touch (`gesture-probe.json`) show
  `pointerdown:1, pointermove:12, pointerup:1` **and** `touchstart:1, touchmove:11, touchend:1`,
  with `pointerType: "touch"` on the trusted events — both families fire, as they do natively for
  a touch screen (`touch*` bubbling + compat `pointer*`). The app consumes the `pointer*` stream.
- Only two `pointerType` branches exist in the whole editor UI layer, both in `hp-ui.js`:
  a **tooltip suppression** — `pointerover` shows `[data-tip]` tooltips only when
  `e.pointerType !== "touch"` (after a 450 ms delay) — and the shared dropdown dismissal on
  `pointerdown`. So a touch user gets **no hover tooltips**; labels are the only affordance.
- Other pointer wiring is ordinary: `hp-panels.js` implements press-and-hold repeat on
  +/− steppers with `pointerdown` → 380 ms delay → 70 ms interval and clears on
  `pointerup|pointerleave|pointercancel|blur`; `hp-ui.js` closes FAB/menus on `pointerdown`;
  `hp-sync.js`/`hp-bim.js` use `pointerdown`/`pointerup` for canvas drag interactions.
- There is **no `touchstart`/`touchmove`/`touchend` handler written by the app** anywhere in the
  editor bundle; the only `touchstart`/`touchmove` identifiers found after deobfuscation were
  decoy strings standing in for real property names (the obfuscator maps string-table slots, and
  some never-emitted entries decode to touch-event names). So 3D navigation touch support is
  100 % Babylon's own pointer input. Caveat: deobfuscation is lossy in places, so this is a strong
  `INFERRED` claim corroborated by round 1's independent code-level scan, not a byte-exact proof.
  (`INFERRED`; corroborated by round 1)

### 2.6 Babylon camera inputs — what the gestures actually do

`OBSERVED` — `gesture-probe.json`, `interaction-probe.json`.

```
engine  Babylon.js 6.38.0
camera  ArcRotateCamera "Camera"
inputs  keyboard, mousewheel, pointers
inputs.attached.pointers = ArcRotateCameraPointersInput
  pinchPrecision        12
  pinchDeltaPercentage  0
  useNaturalPinchZoom   false
  panningSensibility    1000
  multiTouchPanAndZoom  true
  multiTouchPanning     true
  buttons               [0, 1, 2]
  angularSensibilityX/Y 1000
camera  alpha -1.5707963  beta 0.7853982  radius 28.2843  target (0,0,0)
  wheelDeltaPercentage 0   panningInertia 0.9   inertia 0.9
  lowerRadiusLimit null    upperRadiusLimit null
```

Measured gesture deltas (all real CDP `Input.dispatchTouchEvent`, 12–14 move frames, 16 ms apart):

| gesture | observed change |
|---|---|
| 1-finger drag (+120 x, +36 y) | `alpha` −1.5708 → **−2.7397**, `beta` 0.7854 → **0.4347**, radius/target unchanged → **orbit** |
| 2-finger pinch out (spread ±112 px) | `radius` 28.284 → **−33.188**, target drifted (+0.008, −0.019) → **zoom, and the radius ran away past 0** |
| 2-finger drag together (+126 x, +70 y) | `target` x 0.008 → **1.038**, z −0.019 → **−0.933**, alpha/beta/radius changed only slightly → **pan** |
| mouse wheel (−800) | `radius` −35.06 → **−38.91**, target unchanged → **dolly**, monotonic per notch |

Two behavioural notes for CasaPlazAI:

- **`radius` goes negative on the live camera.** Because `pinchDeltaPercentage: 0` and
  `useNaturalPinchZoom: false`, the default `pinchPrecision: 12` path multiplies rather than
  normalises, and the **active** `Camera` has `lowerRadiusLimit: null`, so nothing clamps it. A
  live pinch drove it to `−33.188`; the camera keeps working (Babylon flips alpha through the
  target) but it is a degenerate state.
- **The clamp exists, but on the wrong camera.** A full scene inventory (`probe-cameras.mjs` →
  `camera-inventory.json`) found **one engine, one scene, three cameras**: the active
  `ArcRotateCamera "Camera"` (`lower/upperRadiusLimit` both `null`, `wheelPrecision: 50`,
  `beta` limits `0.01 … π−0.01`), an inactive `UniversalCamera` ("keyboard/mouse/touch/gamepad"
  inputs), and an inactive `ArcRotateCamera "Camera2"` whose `radius = 0.0001` and whose
  `lowerRadiusLimit === upperRadiusLimit === 28.2843` — i.e. the shipped code *does* assign a
  radius limit (matching the deobfuscated `lowerRadiusLimit` assignment in `hp-editor.js`), but it
  landed on a camera the user never controls. So the correct pattern is present in the code and
  simply mis-wired; that is a more useful lesson for CasaPlazAI than "they forgot to clamp".
  (`OBSERVED`, `camera-inventory.json`; the intent is `INFERRED`)
- **Pinch and pan are both on by default** (`multiTouchPanAndZoom`/`multiTouchPanning` true) and
  the app does not override them, so on a tablet a 2-finger gesture is ambiguous-by-design:
  Babylon disambiguates by whether the two touch points converge (zoom) or translate together
  (pan). No custom gesture layer exists on top.

### 2.7 The "2D planner iframe"

`OBSERVED` — `interaction-probe.json`, `rea/2dplanner.html`, `evidence/2dplanner-modern.css`.

- The 3D editor holds one `<iframe>` named `floorplanIframe` inside
  `#floorplanFrameContainer`, styled `position: fixed; inset: 0; width/height: 100%;
  background: rgba(0,0,0,.8); z-index: 1000` with `visibility`/`pointer-events` toggled to
  show/hide. So the 2D planner is an **in-editor full-screen overlay**, not a separate
  navigation — it resolves round 1's open question between "separate page" and "iframe".
- Its URL inside the editor is `2D-Planner/index.php?lang=en`; the iframe `#floorplanIframe` is
  `width:100%;height:100%;border:0`, unsandboxed, and its content root carries
  **`fp-embedded fp-modern`** — the `fp-embedded` variant exists precisely for the in-app case
  (`OBSERVED`, `planner2d-probe.json`). The container exposes `#open2DPlanner`, `#generate3D` and
  `#close2DPlanner` buttons; `#close2DPlanner` was live and visible after opening.
- **The planner loads and lays out even while the overlay is hidden.** At host width 1280 the
  iframe's inner window was 1280×800, `#extension-floorplanner-lin` measured 1204×718 with
  `viewBox="-752.5 -448.75 1505 897.5"`, the top bar was `fp-topbar` 52 px and the rail 76 px.
  After shrinking the host to 390×844 the inner window became 390×844, the root gained
  **`fp-topbar fp-bar-rows`** at 92 px tall, `--fp-rail-w` fell to 60 px, the labels hidden count
  went 0 → 17, and the plan `viewBox` narrowed to `"-206.25 -451.25 412.5 902.5"` — i.e. the
  planner re-fits its drawing to the new aspect ratio. (`OBSERVED`, `planner2d-probe.json`)
- `matchMedia` inside the iframe at 390 px: `(max-width:760/640/520/420)` all true,
  `(pointer: coarse)` true, `(max-height:560/720)` false — so the whole 760 px branch chain is
  live in the embedded case.
- **`fp-embedded` overrides exist for the host chrome**: `.fp-embedded .fp-statusbar
  { padding-right: 150px }` and `.fp-embedded .fp-welcome { right: 160px; right: 20px; bottom: 252px }`
  to clear the host's bottom-right "View in 3D"/donate card, and under `max-width: 760`
  `.fp-panel`/`#…-settings`/`#…-reportTools` are capped to `max(260px, calc(100vh - topbar - 268px))`
  so panels stop above that card. (`OBSERVED`, `evidence/2dplanner-modern.css`)
- The planner's embedded phone chrome is fully measured (`planner-gesture-probe.json`
  `plannerChrome`): the top bar carries a *File* button (54 × 34), two 34 × 34 icon buttons, two
  28 × 28 buttons, *3D build* (34 × 34), *AI* (36 × 34), an *80%* zoom read-out (44 × 34) and four
  more 34 × 34 buttons; the left rail is 13 tool buttons of **47 × 44 px** each
  (Select, Walls, Arc wall, Divider, Joint, Doors, Windows, Stairs, Objects, Rooms, Text, Measure,
  Layers). The rail is the one place that meets the 44 px target — the top bar does not (28–34 px).
  (`OBSERVED`)
- The planner's own touch surface is `#extension-floorplanner-lin` (382 `<svg>`, 0 `<canvas>`,
  532 `<button>`, 55 `<input>`), `touch-action: none`, `pointer-events: auto`. I got the overlay
  open on the phone profile (`planner-gesture-probe.json`, `planner-gesture3-probe.json`): the
  `hp-seg-btn` whose title is *"Open the 2D planner (synced with 3D)"* (and the hidden
  `#open2DPlanner`) shows `#floorplanFrameContainer` as `visibility: visible; pointer-events:
  auto` with the inner root `fp-embedded fp-modern`, topbar 92 px, rail 60 px.
- **First-run wizard:** opening the planner shows `#extension-floorplanner-newFileModal` — a
  two-step modal ("Start a new floorplan / Last chance to save…"): a name `INPUT` (340 × 38,
  prefilled "Floorplan name") then three plan-type buttons **Empty plan / Square room / L-shaped
  plan** (108 × 110 each). Selecting a plan type *is* the create action — there is no separate
  Create button; only after that does `d.elementFromPoint` return a plan `path` instead of
  `#extension-floorplanner-modals-container`.
- **Once a plan exists, the planner's SVG gesture layer works.** With the modal gone, real CDP
  touch on the plan changed the layer's `viewBox` every time (`planner-gesture3-probe.json`):
  one-finger drag moved it `-206.25 -451.25 412.5×902.5` → `-56.25 -376.25 412.5×902.5`
  (a pan of +150 x / +75 y in plan units), a two-finger pinch shrank the viewBox to
  `108.55 × 237.5` (≈3.8× zoom-in), and the mouse wheel changed it too. So the 2D planner is
  **pan-and-pinch zoomable directly on the plan**, with no scrollbars and no visible zoom control
  needed at phone width. (`OBSERVED`; the exact handler code is unread — see Unknowns)
- Inside, the planner is an **SVG** editor, not a canvas: `#extension-floorplanner-svg-container`
  → `#extension-floorplanner-lin` (`touch-action: none`, the single non-`auto` element), with
  ~382 `<svg>` nodes, 0 `<canvas>`. Layer groups are all prefixed
  `extension-floorplanner-box*` (boxgrid, boxSurface, boxRoom, boxSkirting, boxwall, boxcarpentry,
  boxEnergy, boxFurniture, boxbind, boxArea, boxRib, boxAngles, boxScale, boxText, boxMeasure,
  boxDebug).
- The planner declares `width=device-width, initial-scale=1.0, maximum-scale=1.0,
  user-scalable=no` — i.e. **zoom is disabled at the page level** so all pinch/zoom gestures
  belong to the plan. It has **no `@media` rules in the legacy `style.css`** (only height-keyed
  ones at 950/850/750/650/600/799 px and a width-keyed `(max-width: 850px)`), while the modern
  shell carries the responsive work.

### 2.8 The 2D planner's own responsive ladder (modern shell)

`OBSERVED` — `evidence/2dplanner-modern.css` (`js/uiShell.js`, "Modern shell for the 2D planner").

- Design tokens: `--fp-topbar-h: 52px`, `--fp-rail-w: 76px`, `--fp-status-h: 30px`.
- **`max-width: 1180`** — mode chips lose their text (`fp-mode-chip > span` hidden).
- **`max-width: 760`** (the planner's single main breakpoint, used ~13 times) —
  `--fp-rail-w: 60px`; `.fp-tool-label`, `.fp-brand-name`, `.fp-filename`, `.fp-hint`, `.fp-unit`
  all `display: none !important`; rail tool buttons fixed at 44 px height; top bar gap/padding
  shrink; the zoom stepper hides its − and + buttons (leaving the value and fit); the
  full-screen button hides; energy/palette tabs become a horizontally-scrollable nowrap strip.
- **`max-width: 640`** — the room-style panel (`#…-roomTools`) detaches to a bottom sheet:
  `top:auto; left/right:8px; bottom:8px; width:auto; max-height:78vh`, and its swatch grid
  becomes 6 columns of `minmax(36px,1fr)`.
- **`max-width: 520`, `max-width: 420`** — further swatch/chip tightening.
- **`max-height: 720` / `560`** — rail buttons to 44 px and labels to 9.5 px (short-viewport
  handling; the app cares about laptop landscape too).
- The modern shell also implements the *same* adaptive idea as the 3D top bar:
  `.fp-topbar.fp-bar-c1/.fp-bar-c2/.fp-bar-c3` and `.fp-topbar.fp-bar-rows`, with a comment
  "top bar fitted to its width (js/uiShell.js fitTopbar)". Two-row mode puts file/undo/zoom on
  row 1 and sync/level/3D-build/AI on row 2, makes the right group
  `overflow-x: auto; scrollbar-width: none` so it can scroll sideways instead of wrapping, and
  keeps the first child `margin-left: auto` so right-alignment survives scrolling.
- `#extension-floorplanner-tool-root.fp-modern` is the switch that enables all of this, so the
  legacy planner CSS still applies when the shell is absent.
- Live confirmation at 390×844 (`planner-gesture3-probe.json`): the top bar is 92 px with
  `fp-bar-rows`, the rail is 60 px, and the rail's 13 mode buttons each render **47 × 44 px** —
  the one place in either product that meets the 44 px touch target, while the same bar's
  undo/redo/level/3D-build/AI buttons are 28–36 px.

### 2.9 Phone/tablet viewport emulation — what I could and could not observe

- I ran six emulated profiles against the marketing page
  (`probe-emulation.mjs` → `emulation-probe.json`): desktop 1440×900, iPad 820×1180 and
  Android-tablet 768×1024, iPhone 390×844 and 360×640, and landscape 844×390, using CDP
  `Emulation.setDeviceMetricsOverride` + `setTouchEmulationEnabled` + a mobile UA.
  `matchMedia` reported exactly the expected values (`(pointer: coarse)` true,
  `(hover: none)` true, `(any-pointer: coarse)` true, `navigator.maxTouchPoints = 5`,
  `'ontouchstart' in window` true) — the emulation itself is OBSERVED-good.
  **But the landing CTA click timed out in every profile**, so those runs only ever measured the
  marketing page (`l-body`), never the editor.
- **I then made a dedicated phone-emulated editor run that did boot** (`probe-phone-emulation.mjs`
  → `phone-emulation-probe.json`): `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3`,
  iPhone Safari UA, 390×844. It reached `app.php`, dismissed the setup modal and produced the
  same phone layout as the desktop-UA sweep: `hp-bar-c1 hp-bar-c2 hp-bar-c3`, bar h **94 px**,
  `hp-tools-collapsed` with `#hpLeftDock: none`, 3 tools inline / 5 in `hp-more`, project input
  84 px, `dpr 3`, `visualViewport` 390×844 at `scale 1`, and `#renderCanvas touch-action: none`.
  `(pointer: coarse)` and `(hover: none)` were both true on the editor page too.
- **Rotation was tested directly** and confirms the one-shot bug. Rotating 390×844 → 844×390
  changed `matchMedia('(max-width:700px)')` from **true to false** and the bar from 94 px back to
  **54 px** (the `max-width:560` rule no longer applies), yet
  `document.body.classList.contains('hp-tools-collapsed')` stayed **true** and `#hpLeftDock`
  stayed `display:none`; rotating back to portrait left it collapsed as well. The top-bar class
  string was unchanged across the rotation (`layout-order-probe.json`,
  `phone-emulation-probe.json` `reEvaluation`). So the tool-dock state is a **boot-time-only**
  decision and the layout re-fit and the dock state disagree after a rotate.
- No `viewport-fit=cover` is present (`content="width=device-width, initial-scale=1.0"`), and no
  safe-area CSS exists anywhere in either product, so a notched-phone layout is identical to a
  flat-viewport one at the same width minus the inset handling.
- The read-only comparison is therefore: **CSS + JS measurement are well covered; engine-level
  `visualViewport` behaviour with a collapsing URL bar, and non-Chromium (WebKit) gesture quirks,
  remain unobserved.**

### 2.10 Toolbar geometry on a phone (touch-target sizes)

`OBSERVED` — `layout-order-probe.json` `dockAt390`, `layout-sweep.json`.

At 390×844 with the dock collapsed, the visible chrome measured:

| control | size |
|---|---|
| `#hpToolCatalog` | 38 × 36 px |
| `.hp-more-btn` | 40 × 36 px |
| `#hpViewSeg .hp-seg-btn` (4 view buttons) | 34 × 32 px each |
| `.hp-level .hp-icon-btn` (−/+) | 30 × 30 px |
| `.hp-seg-btn` (Top / 2D / Walk, wider variant) | 132–150 × 31 px |
| `.hp-tab` in the tool card | 182 × 40 px |
| `#hpToolCard` | 150 px wide (CSS) |
| `.hp-more-menu` row (`.hp-tool`) | 220 px wide, 40 px tall |

A full sweep of every visible interactive element at 390×844 found **62 distinct controls, 55 of
them below the 44 × 44 px guideline in at least one dimension** (`phone-emulation-probe.json`
`touchTargets`; the sample includes 30 px level buttons, 29–33 px `.hp-icon-btn`/`.hp-btn` and
40 px tabs). The status-bar **tool-dock toggle** (`.hp-tools-toggle`) was confirmed to work:
clicking it flipped `hp-tools-collapsed` to `false` and `#hpLeftDock` to `flex`. This is the only
mechanism by which a phone user can reach the Build/More tool card after boot.

## 3. Ideas for CasaPlazAI

Ranked by value/effort. Each ties back to a finding and, where relevant, to the
CasaPlazAI schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Clamp 3D camera radius and verify the clamp is on the camera you actually control.** Set `minDistance`/`maxDistance` on the *active* orbit control; the competitor's bundle assigns a radius limit, but to an inactive `Camera2` (`lower = upper = 28.284`), leaving the live `Camera` at `null` and its `radius` able to reach `−33.19`. A cheap unit test: after a simulated pinch, assert `radius > 0` on `scene.activeCamera`. | high (a broken camera is a hard fail on the mode users are most likely to try first on a phone) | S | §2.6 `radius → −33.188`, `camera-inventory.json` |
| 2 | **Make pinch/pan/orbit unambiguous and discoverable.** 1 finger = orbit/look, 2 fingers = pinch-zoom + two-finger pan, and surface a one-line hint the first time the user touches the canvas. 3D House Planner enables both `multiTouchPanAndZoom` and `multiTouchPanning` with no in-app hint at all. | high | S–M | §2.6, §1 bullet 3 |
| 3 | **One layout engine, not CSS media queries plus a JS measurer.** 3D House Planner has both a 560 px media query *and* a JS fitter writing the same `94px` variable, producing the non-monotonic 320→360→600 px classes. Prefer a single measured overflow model (ResizeObserver on the tool row) that drives one set of classes. | high | M | §2.3, §2.2 |
| 4 | **Overflow menu with restored labels, exactly as the phone bar does it.** Drop labels from the bar under pressure, restore them inside the `more` popover. 3D House Planner gets this right (`.hp-more-menu .hp-tool-label { display: inline !important }`, 5 labelled rows at 390 px) and it maps directly onto CasaPlazAI's "tool card" concept. | high | S | §2.4 |
| 5 | **Add an `orientationchange` + `visualViewport` path and re-derive the collapsed-dock state.** 3D House Planner's `hp-tools-collapsed` is decided once at boot from `matchMedia('(max-width: 700px)')` and never re-evaluated; a live rotate left the dock collapsed while the bar re-fit to 54 px. Re-evaluate on `orientationchange` *and* on `resize` of `visualViewport`. | medium-high | S | §2.9, §2.3 |
| 6 | **Pointer Events only; do not ship a PEP-style polyfill.** 3D House Planner still loads PEP 0.4.2, but it is inert in modern Chromium (native `PointerEvent` wins), so it is dead weight and a false sense of coverage. Use Pointer Events directly and set `touch-action` per surface (canvas `none`, sidebars `pan-y`, dialogs `auto`) instead of only on canvases. | medium | S | §2.5, §2.2 |
| 7 | **Suppress hover-only affordances on coarse pointers.** 3D House Planner gates tooltips on `e.pointerType !== "touch"` in JS but has no `(hover: none)` CSS, so hover styles remain in the cascade. Use `@media (hover: none) and (pointer: coarse)` to drop hover-only states (and restore the label/help affordances elsewhere, since a coarse-pointer user gets no tooltips at all). | medium | S | §2.5, §2.2 |
| 8 | **Enforce ≥ 44 px touch targets.** A live census at 390 × 844 found 55 of 62 visible controls below 44 px in at least one dimension (30 px level buttons, 34 × 32 view buttons, 40 px tabs). On a 0.5 m-grid planner a fat-finger mis-tap on a view/level button is a common failure. | medium | S | §2.10 |
| 9 | **Give the 2D planner a real mobile mode — and copy the good part.** The competitor's 2D planner is SVG + `user-scalable=no` + `touch-action:none` on the plan layer, and its plan surface genuinely pans + pinch-zooms (viewBox `412.5`→`108.55` wide on a pinch). Its 760 px branch hides nearly every label (17 labels hidden, `--fp-rail-w` 76→60 px) yet keeps 13 rail buttons at a full 47 × 44 px. For CasaPlazAI keep tool captions visible rather than hiding them, but adopt the 44 px rail. | medium | M | §2.7, §2.8 |
| 10 | **Add `viewport-fit=cover` + `env(safe-area-inset-*)` padding.** Neither product has it; on notched iPhones the status bar and bottom sheets will sit under the home indicator. A 3-line CSS change on the top bar and bottom sheets. | medium | XS | §2.9, §2.2 |
| 11 | **Keep viewport/UI flags out of the plan contract.** 3D House Planner persists UI state in-page only; CasaPlazAI's schema already puts snap settings and underlay under separate `casaplaza.*.v1` keys. Follow that precedent for any `toolsCollapsed`/`lastBreakpoint`-style flag — never add it to `FloorplanData` (then share links omit it by construction, mirroring the underlay ruling). | medium | XS | §2.9, schema §"Out-of-schema editor state" |

## 4. Unknowns

- **Full mobile-UA editor boot was not observed.** The 6-profile emulation only reached the
  marketing page (`emulation-probe.json`); phone-width editor behaviour was measured with
  `device_scale_factor: 1` in real viewports and with CDP touch emulation on desktop-class
  viewports. One full iPhone-UA phone-emulated boot *was* made later (`phone-emulation-probe.json`,
  §2.9) and matched the sweep, but it was a single profile and a single device family, so
  whether the server serves a different editor for other mobile UAs is still untested.
- **No `rea capture-browser-scenario` run for this question.** The scenario schema has no
  viewport-emulation or touch-action steps (only `goto/click/fill/press/select_option/check/
  wait_for/request/wait_for_timeout`), so it cannot express a pinch. Evidence here comes from my
  own Playwright probes. A future run could still use it for the DOM/accessibility side.
- **2D-planner JS internals were not read.** `js.php?f=planner/*` returns 403 to curl *and* to an
  in-page `fetch` with cookies and referer (`probe-2d-fetch.mjs`), and the planner URL redirects
  to `index3.php` under automation. Only `2dplanner.html` and the two CSS files were obtained, so
  claims about `fitTopbar`, the SVG pan/zoom code and the planner's own pointer handlers are
  inferred from CSS class names/comments and markup, not read from source.
- **Pinch/pan inside the 2D planner is now OBSERVED** (see §2.7 and `planner-gesture3-probe.json`),
  but the handler code that implements it was not read (`js.php` 403), so *how* it distinguishes
  pan from pinch, whether it clamps zoom, whether it supports rotation, and how it snaps are all
  inferred from the `viewBox` deltas only.
- **Whether the inactive cameras are ever promoted.** `camera-inventory.json` shows three cameras
  in the single scene; the two inactive ones (`UniversalCamera`, `Camera2`) may be used by a tour
  or an alternate mode I did not exercise, so their limits could matter in a path not covered here.
- **Physical-device behaviour.** Everything is emulated Chromium; Safari/iOS pinch quirks,
  `visualViewport` behaviour with the URL bar, and Android back-gesture conflicts are unverified.
  In particular the PEP-inert finding is Chromium-specific: on an older WebKit PEP might be the
  active path, and I could not install or drive a non-Chromium engine here.
- **A real touch on an emulated touch device produced 0 hits in the isolated listener test**
  (`pep-check.json`), whereas the earlier instrumented run (`gesture-probe.json`) recorded
  touch+pointer events and camera motion. The most likely explanation is that the second probe's
  listener ran after Babylon had already attached its own handling / the CDP touch sequence needs
  a `touchMove` before the point becomes live; I record the discrepancy rather than hide it. The
  camera-delta evidence in §2.6 is the primary proof of touch behaviour.
- **Layout sweep used one viewport height (900 px).** Short-landscape (e.g. 844×390) top-bar
  fitting was only checked at the emulation level, not swept.

## Appendix — evidence inventory (this folder)

| File | Produced by | Notes |
|---|---|---|
| `probe-layout-sweep.mjs`, `layout-sweep.log`, `layout-sweep.json`, `overflow-sweep.json` | live Playwright run | 21 widths; no horizontal overflow at any width |
| `probe-layout-order.mjs`, `layout-order.log`, `layout-order-probe.json` | live Playwright run | forward vs reverse sweep, boot@390, boot@768, `hp-more` inventory |
| `probe-gestures.mjs`, `gesture.log`, `gesture-probe.json` | live Playwright + CDP touch | camera deltas + canvas event counters |
| `probe-interaction.mjs`, `interaction.log`, `interaction-probe.json` | live Playwright | Babylon version/inputs, iframe identity |
| `probe-emulation.mjs`, `emulation-probe.json` | live Playwright + CDP emulation | six viewport/touch profiles (landing page only) |
| `probe-phone-emulation.mjs`, `phone-emulation.log`, `phone-emulation-probe.json` | live Playwright + CDP emulation | full iPhone-UA editor boot at 390×844, rotation test, 62-control touch-target census |
| `probe-2d-iframe.mjs`, `planner2d.log`, `planner2d-probe.json` | live Playwright | embedded planner at 1280 and 390; overlay open/closed geometry |
| `probe-planner-open.mjs`, `planner-open.log`, `planner-open-candidates.json` | live Playwright | located the real 2D-plan toggle among all "2D/planner" elements |
| `probe-planner-gesture.mjs`, `planner-gesture.log`, `planner-gesture-probe.json` | live Playwright + CDP touch | planner overlay open, embedded phone chrome (rail 47 × 44 buttons) |
| `probe-planner-gesture2.mjs`, `planner-gesture2.log` | live Playwright + CDP touch | modal-button enumeration attempt (name input + plan types) |
| `probe-planner-gesture3.mjs`, `planner-gesture3.log`, `planner-gesture3-probe.json` | live Playwright + CDP touch | completed the new-plan wizard; **plan pan + pinch zoom both changed the `viewBox`** |
| `probe-planner-gesture4.mjs`, `planner-gesture4.log` | live Playwright + CDP touch | first pass that reached the plan (square-room flow); pan/pinch confirmed |
| `probe-2d-fetch.mjs` | live Playwright | demonstrated `js.php` 403 in-page |
| `probe-cameras.mjs`, `cameras.log`, `camera-inventory.json` | live Playwright | all 3 cameras in the single scene + their zoom limits/pointer config |
| `probe-pep.mjs`, `pep.log`, `pep-check.json` | live Playwright | PEP-installed global vs native `PointerEvent`; touch-vs-mouse listener discrimination |
| `evidence/2dplanner-modern.css`, `evidence/2dplanner-style.css` | plain HTTP GET with referer | 2D planner shells |

Round-1 inputs reused read-only: `08-08-ui-layout-onboarding/{report.md, css/*.css, js/editor_*.js,
rea/editor-dom.html, rea/2dplanner.html, rea/i18n-app.json, rea/i18n-planner.json}`.
External: the live app at `https://www.3dhouseplanner.com/` and
`https://www.3dhouseplanner.com/2D-Planner/index.php`.
