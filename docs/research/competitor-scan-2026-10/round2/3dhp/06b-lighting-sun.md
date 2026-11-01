# 3D House Planner — lighting deep dive (sun, shadows, sky/IBL, day–night)

Target: <https://www.3dhouseplanner.com/> — browser editor (`app.php`), Babylon.js **6.38.0** over WebGL 2.
Research round 2, job `02-06b-3d-view-walkthrough-lighting`. Research date 2026-10-31.

Round-1 report (read first, not redone): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/report.md`
— it established the four lights, the shadow-map tiering, the 512² `environment.hdr` IBL, the hidden `#lightcheck`
and the fact that "night sky is time-of-day driven by `hp-sun.js`". This report goes deep on exactly that.

**Tag legend** — **OBSERVED** (read from shipped JS or the live page; evidence file named) · **DOCUMENTED** (vendor
page, URL named) · **INFERRED** (my interpretation). Evidence files of this job live in `proof/`, `deob/`,
`tools/` (see `proof/README.md` for the index and `proof/sources.json` for machine-readable sources).

The `deob/*.js` modules (`hp-editor.js`, `hp-sun.js`, `hp-render.js`, `hp-bim.js`, `hp-pathtrace.js`) are **round
one's** string-substituted copies of the site's own shipped JavaScript, reused read-only from
`~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/deob/`. This job added
`deob/ed_strings.json` (the `hp-editor` string table, decoded here) and the live probes.

---

## 1. Summary

1. **The light rig is four lights, and only one of them ever casts a shadow** — two `HemisphericLight`s (up 0.5 /
   down 0.7 at the balanced tier) whose **`groundColor` is pure black**, one `DirectionalLight` named `DirLight`
   (intensity 0.5, position `(0, 300, 0)`) that owns the single `ShadowGenerator`, and a disabled `SpotLight`
   used as a selection highlight. The **only** shadow caster is `DirLight`; at high/ultra the first hemisphere
   also gains a warm `groundColor (0.32, 0.30, 0.27)`, the second stays black in every tier
   (**OBSERVED**, `proof/sun_probe2.out.json`, `proof/tier_probe.out.json`, `deob/hp-editor.js` light block).
2. **The "sun" is a GPU-free celestial calculation, not a slider.** `hp-sun.js` computes the sun's altitude and
   azimuth from the date, time, time zone, latitude/longitude and true north with a ~30-line solar ephemeris,
   then writes the resulting direction into `DirLight.direction`, into the **SkyMaterial's `sunPosition`**, and
   into the hidden `#lightcheck` to switch the sky at sunset. The vendor's own string says *"The sun of the study
   is the sun of the scene"* (**OBSERVED**, `deob/hp-sun.js`, `proof/sun_probe.out.json`).
3. **Day/night is a single hard step at −1° solar altitude, driven by one hidden checkbox** — a 5-minute sweep
   across sunset flips `lightcheck`, sun intensity `0.5 → 0.1`, the second hemisphere `0.7 → 0.2` and the skyBox
   material from `SkyMaterial` to a 6-face `corona_*.png` `CubeTexture`, all in one go. **`environmentIntensity`
   stays at 1, the sun direction is pinned to straight down `(0, -1, 0)`, and the shadow map keeps running**, so
   the IBL and the shadow never follow the sun's disappearance (**OBSERVED**, `proof/sweep_probe.out.json`,
   `proof/sun_probe.out.json`, `proof/sun_probe2.out.json`).
4. **IBL is a static 512×512 `environment.hdr`** on `scene.environmentTexture` with `environmentIntensity`
   1.0 / 0.9 / 1.1 for balanced / high / ultra, `scene.ambientColor` black, no fog (`fogMode 0`) and — at
   balanced — no tone mapping at all (**OBSERVED**, live).
5. **The sun study is a real analysis tool, and it runs**: it ships a sun-path diagram (SVG, 3 solstice/equinox
   curves + hour dots), "Play the day" / "Play the year" animations (day playback **OBSERVED** advancing
   07:01→10:16 local in 4 s), and a **"Hours of sun on the ground"** ray-cast map. A live run on a hand-built
   6 × 6 m room produced two overlay meshes (`hpSunMap` 54 × 54 ground grid, `hpSunMapRoom0` 36 × 36 room grid,
   each an unlit `DynamicTexture`) and reported *"up to 10.3 h of direct sun; grid of 0.35 m"* outside, *"up to
   4.7 h"* on the room floor (**OBSERVED**, `proof/map_probe2.out.json`, `proof/raf_probe.out.json`,
   `deob/hp-sun.js`, i18n `hp_i18n_app.json`).

---

## 2. Findings

### 2.1 The light rig

**OBSERVED** — live scene at the balanced tier (`proof/sun_probe2.out.json`), construction code in
`deob/hp-editor.js` (string table decoded in `deob/ed_strings.json`, indexed `deob/ed_strings_indexed.txt`).

| light | class | intensity | direction | notes |
|---|---|---|---|---|
| `HemiLight` | HemisphericLight | **0.5** | `(0, 1, 0.3)` | `groundColor` **black**, diffuse white |
| `HemiLight` (2nd) | HemisphericLight | **0.7** | `(0, -1, -0.3)` | a *downward* fill; also `groundColor` black |
| `DirLight` | DirectionalLight | **0.5** | solar ephemeris (see §2.3) | position `(0, 300, 0)`; the **only** shadow caster |
| `selectionLight` | SpotLight | **0** (disabled) | `(0, -1, 0)` | position `(0, 3, 0)`, local selected-object highlight |

Construction lines, decoded from `deob/hp-editor.js`:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

- The **degenerate two-hemisphere trick**: the first hemisphere lights from above, the second from below
  (`direction.y = -1`), which in Babylon means it lights the *undersides* — off the ground. They are given the
  same `name` (`HemiLight`), so `scene.getLightByName('HemiLight')` returns the first one; the app addresses them
  by captured closure variables, not by name (**OBSERVED**).
- The two hemi lights are **inside** the day/night handler; the sun and the sky are too (§2.5).
- Selectability filter: `selectionLight.diffuseColor` is `(1,1,1)`, its angle is 0.0873 rad, and it is turned on
  per selected element (`deob/hp-editor.js`, `selectionLight` string present in the decoded table) (**OBSERVED**).

### 2.2 The shadow generator — one light, four tiers

**OBSERVED** — live per-tier probe (`proof/sun_probe2.out.json`), construction code `deob/hp-editor.js`,
shipped JS `deob/hp-render.js` (also in round-1's `deob/hp-render.js`).

Construction, decoded:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Live-verified per render tier (`HPRender.setMode()` then re-read the generator). — **balcony** probe: state forced to summer-solstice noon **before** switching tiers, so the
night preset cannot contaminate the numbers (**OBSERVED**, `proof/tier_probe.out.json`):

| tier | `shadowEnabled` | map | filter | bias / normalBias / darkness | env | sun / hemi₁ / hemi₂ | tone map |
|---|---|---|---|---|---|---|---|
| draft | **false** | 1024² | blurred ESM (unused) | 0.02 / 0 / 0 | 1.0 | 0.5 / 0.5 / 0.7 | off |
| balanced | true | **1024²** | blurred ESM | 0.02 / 0 / 0 | 1.0 | 0.5 / 0.5 / 0.7 | off |
| high | true | **2048²** | PCF (`QUALITY_HIGH`) | 0.0015 / 0.02 / 0.15 | 0.9 | 0.85 / 0.48 / 0.3 | on (ACES) |
| ultra | true | **4096²** | contact-hardening (`lightSizeUVRatio 0.03`) | 0.0012 / 0.015 / 0.1 | 1.1 | 1.0 / 0.45 / 0.28 | on (ACES) |
| ultra → night | true | 4096² (kept) | contact-hardening (kept) | 0.0012 / 0.015 / 0.1 (kept) | **1.1 (kept)** | **0.1 / 0.5 / 0.2** (night handler) | on |

Two things the last row settles (**OBSERVED**):

- the night preset **wins over the tier's light values** (the handler fires after `setMode` and rewrites
  sun/hemi), but it does **not** restore the tier's `environmentIntensity` or the shadow map — those keep
  whatever `setMode` last left;
- only the **first** hemisphere gets the warm `groundColor (0.32,0.30,0.27)` in high/ultra; the down-facing
  second hemisphere keeps black in every tier, and the night handler never resets it — so after visiting ultra,
  night keeps the warm uplight on the first hemisphere.

- The high/ultra light overrides live in `deob/hp-render.js` and are **skipped when `#lightcheck` is checked** —
  i.e. the night preset wins over the render tier (**OBSERVED**).
- The shadow map is attached to `DirLight` and *re-used* across tier changes (`resize` + filter flags), rather
  than disposed and rebuilt; only the post-processing pipelines are thrown away and rebuilt (**OBSERVED**).
- `autoCalcShadowZBounds` is **false** and `shadowMinZ`/`shadowMaxZ` are both `null`. The ortho parameters read
  back as the **±`Number.MAX_VALUE` sentinels** (`orthoLeft 1.797e308`, `orthoRight −1.797e308`, `orthoTop
  −1.797e308`, `orthoBottom 1.797e308`), i.e. the app never sets them and Babylon derives the frustum itself from
  whatever is on the generator's render list (`renderList` was empty at probe time, before anything was built)
  (**OBSERVED**, `proof/north_probe.out.json`). So the shadow volume is *auto*, not authored — and it is never
  re-fitted when the plan changes on the app side (no BoundingBox recompute was found).
- `high`/`ultra` add a 1-second FPS watchdog that fires a toast when `engine.getFps() < 18` for more than
  1.77 s — but it only *warns*, it never downgrades the tier (**OBSERVED**, `deob/hp-render.js`; this closes
  round-1 unknown #10 with a negative).

### 2.3 `HPSun` — the solar-position engine

**OBSERVED** — `deob/hp-sun.js` (round-1 deobfuscation; no code copied into this report). Public surface is
`HPSun = { open, position, place, clearMap, apply, state, setState }`.

**The ephemeris** (`HPSun.position(epochMillis, lat, lon)`, signature read live):

- days since J2000 `= date/86400000 + 2440587.5 - 2451545`;
- mean anomaly `M = (357.528 + 0.9856003·d) mod 360`, ecliptic longitude
  `λ = (280.46 + 0.9856474·d) mod 360 + 1.915·sin M + 0.02·sin 2M`;
- obliquity `ε = 23.439 − 4e-7·d`; right ascension `α = atan2(cos ε · sin λ, cos λ)`, declination
  `δ = asin(sin ε · sin λ)`;
- local sidereal time from `18.697374558 + 24.06570982441908·d` plus clock time and time zone;
- hour angle `H = LMT·15 − α`; then the standard
  `alt = asin(sin φ sin δ + cos φ cos δ cos H)` and
  `az  = atan2(−sin H, tan δ cos φ − sin φ cos H)`.

It returns `{alt, az}` in **degrees** and is pure — it takes `(epochMillis, lat, lon)` and reads nothing from the
DOM. The signature was read live from `String(HPSun.position)` and confirmed empirically
(**OBSERVED**, `proof/pos_probe.out.json`):

| call | result | independent hand-check |
|---|---|---|
| `HPSun.position(Date.UTC(2026,11,21,12,0,0), 51.5, −0.13)` | `alt 15.06°, az 180.3°` | London winter-solstice noon = `90 − 51.5 − 23.44 = 15.06°`, due south — **exact** |
| `…(Date.UTC(2026,5,21,16,0,0), 38.9, −77.04)` | `alt 68.5°, az 131.0°` | 11:00 local ≈ solar noon − 1 h at that longitude |
| `…('2026-06-21', 38.9, −77.04)` | `{alt: null, az: null}` | a **string** date is not accepted — epoch ms only |

The October path (read from `state().date`), US fallback site, hour by hour — max **36.8°** at 12:00 local, which
matches `90 − 38.9 − 13.8` (October declination) to within half a degree; the sun rises at azimuth ~93° and sets
at ~269° (**OBSERVED**, `proof/pos_probe.out.json`).

The direction mapping was verified numerically: at `alt 30.795°, az 148.082°` the live `DirLight.direction` was
`(−0.4542, −0.5120, +0.7291)`, whose `y` is exactly `−sin(alt) = −0.5120` and whose horizontal pair has magnitude
`cos(alt) = 0.857` — i.e. `d = (·cos alt, −sin alt, ·cos alt)` with the azimuth rotated into the world grid and
then by `trueNorth` (**OBSERVED**).

**`trueNorth` is a plain Y-axis rotation by +N degrees.** Setting `HPBIM.setSite({trueNorth})` and re-reading the
live direction at the same date/time/site (21 Jun, 12:00, lat 38.9, lon −77.04) gives
(**OBSERVED**, `proof/north_probe.out.json`):

| trueNorth | direction x, y, z |
|---|---|
| 0° | `(−0.0401, −0.9631, +0.2661)` |
| 45° | `(+0.1598, −0.9631, +0.2166)` |
| 90° | `(+0.2661, −0.9631, +0.0401)` |
| 180° | `(+0.0401, −0.9631, −0.2661)` |
| 270° | `(−0.2661, −0.9631, −0.0401)` |

At 90° the horizontal pair is exactly `(z₀, x₀)` — the signature of `x' = x·cosN + z·sinN`, `z' = −x·sinN + z·cosN`
(Babylon's standard Y rotation), and `y` is untouched throughout, so `trueNorth` only yaws the sun, never tilts
it. The same call also proved `HPBIM.setSite` is the write path and that `HPSun.place()` immediately reports
`site: true` with the new `north` (**OBSERVED**).

`HPSun.place()` (read live as source) returns `{lat, lon, tz, north, site}`: a project `site` if one is set,
otherwise a **capital-city fallback table keyed by country code** (`BR, PT, US, GB, CA, AU, ES, MX, AR, CO, CL,
FR, BE, CH, DE, AT, IT, RU, BY, KZ, JP, CN, TW, KR`) whose entries are `[latitude, longitude, utcOffset]`, keyed
by `HPBIM.normsCountry()` and **defaulting to `'BR'`** (Brazil) when that is unavailable. Live with no site set,
the page reported `{lat: 38.9, lon: −77.04, tz: −5, north: 0, site: false}` — the **US** entry, chosen because
the headless browser's locale resolved to `US` (**OBSERVED**, `proof/pos_probe.out.json`,
`proof/sun_probe.out.json`).

**Time-zone resolution** (`_0x5dddde`): an explicitly chosen `tz` wins; otherwise, if a site exists, the browser's
own `−getTimezoneOffset()/60` is used when it is within 2 h of the longitude-implied offset, else `round(lon/15)`;
if no site exists, the country table's fixed offset is used.

**Application** (`HPSun.apply`, observed live and read in the shipped source):

- direction vector `d = (sin α·cos alt, sin alt, cos α·cos alt)` rotated about Y by `trueNorth` degrees
  (`_0x4ea8a3`);
- `DirLight.direction = d.alt > 0 ? d.scale(-1) : Vector3(0, −1, 0)` — i.e. **light travels from the sun toward
  the scene during the day, and straight down at night**;
- `skyBox.material.sunPosition = d.scale(300)` (a 300-unit lever arm for the sky shader);
- `document.getElementById('lightcheck').checked = (alt < −1)`, toggled by `.click()` only on a **state change**
  (`if (checked !== want) click()`), so the night transition happens once, at −1° altitude, not every frame.

**Live cross-check** — driving `HPSun.setState({minutes})` on 2026-10-31 at the US fallback site
(`proof/sun_probe.out.json`):

| local time | altitude state | `DirLight.direction` | `DirLight.intensity` | second hemi | skyBox material |
|---|---|---|---|---|---|
| 05:55 | below horizon | `(0, −1, 0)` | 0.1 | 0.2 | `StandardMaterial` (corona cube) |
| 09:00 | up | `(−0.660, −0.398, +0.637)` | 0.5 | 0.7 | `SkyMaterial`, sunPosition `(290, −62.7, −43.8)` |
| 12:00 | up | `(+0.035, −0.599, +0.800)` | 0.5 | 0.7 | `SkyMaterial`, sunPosition `(−10.5, 179.7, −240)` |
| 18:30–00:00 | below horizon | `(0, −1, 0)` | 0.1 | 0.2 | `StandardMaterial` (corona cube) |

The `(0, −1, 0)` night direction and the 0.1/0.2 intensities are **exactly** the constructor defaults of
`DirLight` and the second hemisphere — so night is a *reset to the model's default rig*, not a separately authored
night look (**INFERRED** from the coincidence of the two value sets, both **OBSERVED**).

**The transition is a single step, verified at 5-minute resolution.** Sweeping local minutes 1020→1100 and
1180→1260 (0.35 s settle each) at the US fallback site on 2026-10-31, the page's **only state change is between
17:00 and 17:10 local** — and DST-aware sunset for Washington DC on 31 October is ≈ 18:05 EDT = **17:05 EST**,
i.e. the step lands exactly on sunset, when the ephemeris crosses `alt < −1°`. The switch is atomic across all
four signals at once (**OBSERVED**, `proof/sweep_probe.out.json`):

| local time | `minutes` | sun | hemiB | `#lightcheck` | skyBox material | `DirLight.direction.y` |
|---|---|---|---|---|---|---|
| 17:00 | 1020 | 0.50 | 0.70 | false | `SkyMaterial` | −0.013 (sun grazes the horizon, **still lit**) |
| 17:10 | 1030 | 0.10 | 0.20 | **true** | `StandardMaterial` (corona cube) | **−1.000** |

Nothing else changes in either window (the 19:40→21:00 sweep was identical to 17:10), confirming there is exactly
one transition per day and no second "deep night" state.

There is no intermediate twilight state — a real dusk would fade over the whole `+6°…−6°` altitude band, which the
ephemeris already computes but the handler does not use (**OBSERVED** for the step; **INFERRED** as the missed
opportunity, and the basis of idea #5 below).

### 2.4 Season, date, time controls and the sun card

**OBSERVED** — `app_index.html`, `deob/hp-sun.js`, live DOM dump `proof/sun_probe2.out.json`, i18n `hp_i18n_app.json`.

Two mounts of the same state: an always-visible **card in the left tool pane** and a full **panel** opened from it.

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

The card (built at runtime, `#hpSunCard`) contains: a live clock, a **time range input** (`step=5`, `0…1439`),
a **date input**, three **season chips** (`data-sun-season="summer|equinox|winter"`), and a `data-sun-act="study"`
button that opens the panel. Live inventory (**OBSERVED**, `proof/sun_probe2.out.json`):

| control | `data-*` | value at probe time | notes |
|---|---|---|---|
| latitude | `data-sun="lat"` | 38.9 | `min=-90 max=90 step=any` |
| longitude | `data-sun="lon"` | −77.04 | `min=-180 max=180` |
| "Use my location" | `data-sun-act="locate"` | — | `navigator.geolocation.getCurrentPosition`, rounded to 5 decimals |
| date | `data-sun="date"` | 2026-10-31 | |
| Summer solstice | `data-sun-date="2026-06-21"` | — | year taken from the current date |
| Equinox | `data-sun-date="2026-03-20"` | — | |
| Winter solstice | `data-sun-date="2026-12-21"` | — | |
| time | `data-sun="time"` | 1380 | `0…1439 step=5` |
| Play the day | `data-sun-act="day"` | — | rAF, 12 000 ms for the whole day (`0x2ee0`) |
| Play the year | `data-sun-act="year"` | — | rAF, 15 000 ms (`0x3a98`), January→December |
| Rooms option | `data-sun-opt="rooms"` | checked | persisted in `localStorage['hp-sun-map']` |
| Compute the map | `data-sun-act="map"` | — | ray-cast study, §2.6 |
| Colour-scale sliders | `data-sun-scale="ground|rooms"` | — | quantised to 0.25 h steps |
| Same scale / Fit the floors | `data-sun-act="scaleAuto|scaleRooms"` | — | |

- **Season chips set the DATE, not a tilt**: `summer` → `YYYY-06-21` if `lat >= 0` else `YYYY-12-21`
  (Southern Hemisphere flip is built in), `winter` → the mirror image, `equinox` → `YYYY-03-20`
  (**OBSERVED**, `deob/hp-sun.js`). My live click test of the winter chip moved `HPSun.state().date` to
  `2026-12-21` and rebuilt `DirLight.direction` to `(−0.480, −0.359, +0.800)` at a fixed 10:00 local time —
  i.e. the sun is **lower in the sky at the same clock time in winter**, exactly as expected
  (**OBSERVED**, `proof/sun_probe3.out.json`).
- **"Play the day" works.** Pressing the panel's day button advanced `HPSun.state().minutes`
  `421 → 447 → 502 → 523 → 568 → 616` over 4.2 s of wall clock (≈ 07:01 → 10:16 local), i.e. a full
  rise→set sweep in the intended 12 s (`0x2ee0` ms) of animation time. The stepping is coarse (40–50 min per
  frame) because software rendering delivers only ~5–10 rAF ticks/s, but the animation itself is sound
  (**OBSERVED**, `proof/raf_probe.out.json`). The same button on the small left-dock card was not present in
  this DOM state (`querySelector('#hpSunCard [data-sun-act="day"]')` returned `no btn`), so playback was
  verified from the full panel only.
- Pressing "Play the day" a second time cancels the animation (`cancelAnimationFrame` + null the state), and the
  state it last reached is kept — the animation does not restore the pre-play time
  (**OBSERVED**, `deob/hp-sun.js`).
- Position read-out: the panel prints `"Azimuth {az}° · altitude {alt}°"` (`sun.position`), or
  *"The sun is below the horizon"* (`sun.below`) after sunset; it also prints `sunrise {rise} · sunset {set}`.
  In my probes `HPSun.position()` with **no arguments** returned `{alt: null, az: null}` and a string date was
  likewise rejected (`{alt: null, az: null}`), because the public method takes `(epochMillis, lat, lon)` and the
  internal call sites always pass them — neither the zero-arg nor the string-arg call is a supported use
  (**OBSERVED**, `proof/sun_probe4.out.json`, `proof/pos_probe.out.json`).

### 2.5 Day/night: how `#lightcheck` is actually driven

**OBSERVED** — `deob/hp-editor.js` (decoded), `deob/hp-sun.js`, `deob/hp-render.js`, `deob/hp-bim.js`,
`deob/hp-pathtrace.js`, live probes.

`#lightcheck` is a **hidden, master-less checkbox** — there is *no* UI control anywhere that flips it. Its two
writers are:

1. `hp-sun.js`, once per state change, from the sun altitude;
2. `hp-bim.js`, when a saved project is loaded: `settings.night` is compared with `lightcheck.checked` and a
   `.click()` is issued if they differ — i.e. **night state is part of the saved project**.

Reading it are four modules: `hp-editor.js` (the actual light/sky switch), `hp-render.js` (suppresses the
high/ultra light overrides), `hp-bim.js` (serialise/restore) and `hp-pathtrace.js` (zeroes the Three.js sun and
scales `environmentIntensity` by 0.03).

The handler itself, decoded from `deob/hp-editor.js`:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Two materials named `skyBox` exist for the whole session (**OBSERVED**, `proof/sun_probe2.out.json`):

- the **day** material — `BABYLON.SkyMaterial`, `backFaceCulling false`, `turbidity 1.5`, `luminance 0.8`,
  `useSunPosition true`, `rayleigh 1.3`, `mieDirectionalG 0.96`, `mieCoefficient 0.005`, initial
  `sunPosition (−210, 300, 0)`;
- the **night** material — `BABYLON.StandardMaterial` with `reflectionTexture` = a `CubeTexture` assembled from
  `./textures/corona_lf.png, corona_up.png, corona_ft.png, corona_rt.png, corona_dn.png, corona_bk.png`,
  `coordinatesMode = TEXTURE_CUBE_MAP` (a `SKYBOX_MODE`), `backFaceCulling false`, `disableLighting true`.

Both are attached to the same 24-vertex `skyBox` mesh (a single box, not a sphere, and **not**
`infiniteDistance`), with `isPickable = false` — so the sky can never intercept a click, and the sky mesh is
excluded from picking by name in `hp-measure.js` and `hp-sun.js` (**OBSERVED**).

**What does *not* change at night** — the important negative results (**OBSERVED**):

- `scene.environmentIntensity` stays **1.0** (it is only touched by the render tier and by path tracing);
- `scene.ambientColor` stays `(0,0,0)`, `clearColor` stays `(0,0,0)`, `fogMode` stays 0, and no tone mapping is
  added at balanced (`toneMappingEnabled false`, exposure 1, contrast 1);
- the **IBL never follows the sun** — `environmentTexture` remains the same
  `./textures/environment.hdr` (`getSize()` 512×512) and the night sky is a 6-face PNG cube, not an HDR;
- the shadow generator is untouched (still on, map still 1024² at balanced), so the night scene keeps casting a
  shadow from a 0.1-intensity straight-down light;
- **the legacy `#daytimebox` / `#sliderdaytime` controls do not exist in the shipped HTML**. `deob/hp-editor.js`
  still binds `$('#sliderdaytime').on('input', …)` and the handler still calls `$('#daytimebox').show()/hide()`,
  but `app_index.html` contains neither id (only `#lightcheck` and `#hpSunCard`) — so in this build the manual
  sun-rotation slider is dead code and the ephemeris is the *only* writer of the sun direction
  (**OBSERVED**, `app_index.html`, `deob/hp-editor.js`, `proof/sweep_probe.out.json`).

`hp-bim.js` records, in the saved project:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Live confirmation of a serialise with the sun at the summer solstice 12:00
(**OBSERVED**, `proof/sun_probe4.out.json`):
`{ settings: {floorHeight: 2.65, floorSize: 100, level: 0, renderMode: 'balanced', night: false, units: 'm'},
   sun: {date: '2026-06-21', minutes: 720, tz: null} }`.

The **path tracer** is the only renderer that treats night as a different lighting environment: it flips the
Three.js scene to `night ? 0.03 : 1` for both `environmentIntensity` **and** `backgroundIntensity`, sets its
directional light intensity to `night ? 0 : sun` (slider, default 3, range 0…8), and exposes `sun`, `sky`,
`emissive`, `bloom` and `exposure` sliders of its own. Its own HDR (`hdr`, loaded for the path-trace scene) is
flipped by `night ? 0.03 : 1` (**OBSERVED**, `deob/hp-pathtrace.js`).

### 2.6 The "Hours of sun" study map — observed running

**OBSERVED** — `deob/hp-sun.js`, live run `proof/map_probe2.out.json`, i18n strings `hp_i18n_app.json`.

I drove it end-to-end: four `HP3D.buildWall({x1,z1,x2,z2})` calls made a 6×6 m room, then the panel's **Compute
the map** button was clicked. Within a few seconds the scene contained exactly two new meshes and the panel
finished with *"10/31/2026: up to 10.3 h of direct sun; grid of 0.35 m. 1 room floors: inside the house the sun
reaches up to 4.7 h on this day."* (**OBSERVED**):

| mesh | verts | grid texture | material | alpha | y | bounds |
|---|---|---|---|---|---|---|
| `hpSunMap` | 2 916 | 54 × 54 `DynamicTexture` (`hpSunMapTex`) | `hpSunMapMat`, unlit, diffuse = emissive = texture | 0.82 | 0.00 | ±9.10 m (room bbox + 1.6× height) |
| `hpSunMapRoom0` | 4 | 36 × 36 `DynamicTexture` | `hpSunMapRoom0Mat`, `useAlphaFromDiffuseTexture` | 0.88 | 0.08 | exactly the 6 × 6 m room |

Algorithm as read (my own words):

1. **Bounding box** of every enabled, visible, non-terrain, non-plan, non-window mesh; ensure some content exists.
2. Grid pitch `step = max(0.35 m, longest bbox side / 90)` (clamped so the grid stays manageable), then expand the
   bbox by `1.6 × building height` on all four sides (6…19 m).
3. **Sample hours**: from `rise` to `set`, step **20 minutes**, keep the sample only when
   `alt > 1°` — so grazing sun is deliberately discarded.
4. For each grid cell: point-in-polygon against house/room polygons; then cast **one ray per sample** with a real
   Babylon `pickWithRay(scene, ray, predicate)`, counting non-hits as *sunlit*. The hit count is scaled
   `20 · hits / 60`, giving **hours of direct sun in the chosen day**.
5. Results are written into a **`DynamicTexture` sized exactly to the grid** (`NEAREST_SAMPLINGMODE`,
   `CLAMP_ADDRESSMODE`) and laid over a `MeshBuilder.CreateGround` with per-vertex Y pushed `+0.04` above the
   scene, using a `StandardMaterial` with `diffuseTexture = emissiveTexture = the DynamicTexture`,
   `disableLighting = true`, `alpha 0.82`, `backFaceCulling false`, `isPickable false`, `receiveShadows false`.
6. **A second pass per room floor** (`sun.mapRooms`): the same grid but only over each room's footprint, with
   `alpha 0.88`, `useAlphaFromDiffuseTexture`, and Y at `roomTop + 0.02` — so the same texture pipeline colours
   the interior floors by hours of sun coming through the windows.
7. Colour ramp: 5 stops from `rgb(38,52,120)` (0 h) through `rgb(43,140,190)` and `rgb(94,186,100)` to
   `rgb(250,214,60)` (≥ scale), with the scale slider quantised to 0.25 h and two scales ("ground" and "rooms")
   that can be shared ("Same scale for all") or fitted.
8. Persisted preference: `localStorage['hp-sun-map'] = { rooms: boolean }` only (**OBSERVED**); the computed map
   itself is *not* persisted and is disposed by `clearMap()`.

The panel labels it *"Hours of direct sun on the ground around the house on the chosen day (sampled every 20
minutes)"* and reports *"{date}: up to {max} h of direct sun; grid of {step} m."*, plus
*"{n} room floors: inside the house the sun reaches up to {max} h on this day."* (**DOCUMENTED** by the vendor's
own in-app copy, `hp_i18n_app.json`).

(A first attempt on an *empty* project produced nothing — consistent with the code's `io.nothing` guard, which
requires at least one qualifying mesh.)

### 2.7 Site, true north, geolocation and the country fallback

**OBSERVED** — `deob/hp-bim.js`, `deob/hp-sun.js`, `hp_i18n_app.json`, `proof/sun_probe2.out.json`.

- The site lives in the **BIM project**, not in the sun panel: `latitude`, `longitude`, `elevation` and
  `trueNorth` (degrees, `min=-360 max=360`) are Project-tab fields, alongside an `EPSG / eastings / northings /
  orthogonalHeight` CRS block and an IFC `IFCMAPCONVERSION` conversion. When an IFC is imported, `trueNorth` is
  *derived* from `atan2(xAxisOrdinate, xAxisAbscissa) · 180/π` rounded to 4 decimals.
- Both the BIM Project tab and the sun panel can set the site; the sun panel writes through
  `HPBIM.setSite({latitude, longitude})` and then `markDirty()`, and the panel's own "Use my location" button
  calls `navigator.geolocation.getCurrentPosition` and rounds to 5 decimals, setting the browser time-zone offset
  from `−getTimezoneOffset()/60`.
- **No site → country capital fallback.** With a US browser the model reported `lat 38.9, lon −77.04` — the US
  capital entry. The in-app wording is explicit: *"Approximate place (capital of the country): type the latitude
  and longitude of the site."* This is the pragmatic default that keeps the tool usable before the user types a
  location.
- The panel's location block also states *"True north {v}° (Project tab of the BIM panel)"* — one source of
  truth for orientation, in the BIM panel; the sun panel only displays it.
- The `sun.note` string documents the whole contract: *"The sun of the study is the sun of the scene: it stays
  when the panel closes and is saved with the project. After sunset the night sky comes on by itself."*

### 2.8 The environment/IBL

**OBSERVED** — live (`proof/sun_probe.out.json`, `proof/sun_probe2.out.json`), `deob/hp-editor.js`,
`deob/hp-render.js`.

- `scene.environmentTexture = './textures/environment.hdr'`, 512×512, **the same texture at every render tier
  and at night**; only `environmentIntensity` moves: **1.0** balanced → **0.9** high → **1.1** ultra (and 1.0
  again after the light reset when `#lightcheck` is on).
- `scene.ambientColor = (0,0,0)`; `scene.clearColor = (0,0,0)`; `fogMode 0` (fog fields exist but are off).
- The `SkyMaterial` is *decorative only*: it does not contribute to IBL. The only environment reflections come
  from the 512² HDR and from `SSRRenderingPipeline` at ultra, which is explicitly handed
  `environmentTexture = scene.environmentTexture` (**OBSERVED**, `deob/hp-render.js`).
- `HPRender.convertMaterials` (round-1 unknown #3) is now **observed**: it walks meshes, skips terrain, converts
  each `StandardMaterial` to `PBRMaterial` unless `disableLighting` or a `reflectionTexture` is set, copying
  `diffuseColor→albedoColor`, `diffuseTexture→albedoTexture`, `bumpTexture→bumpTexture`,
  `emissiveColor→emissiveColor`, and deriving `roughness = clamp(0.9 − 0.6 × mean(specularColor), 0.35, 0.95)`
  with `metallic = 0`, `backFaceCulling = false`, sub-surface refraction/translucency off. The night
  `StandardMaterial` (which *has* a `reflectionTexture`) is therefore **excluded** from the PBR conversion
  (**OBSERVED**, `deob/hp-render.js`).

### 2.9 Vendor documentation of the lighting features

- **DOCUMENTED** — <https://www.3dhouseplanner.com/>: *"Pick how much your computer should work: from a light
  draft mode for any laptop up to Ultra, with soft shadows, ambient occlusion, reflections and tone mapping"*;
  *"Add realistic feel with Physically Based Rendering (PBR) and Standard materials"*; *"Snapshot and recording
  capabilities"*; *"Terrain modeling and painting, with contour lines"*. Marketing bundles "soft shadows /
  ambient occlusion / reflections / tone mapping" under the quality ladder, which matches the shipped tier table
  in §2.2 exactly.
- **DOCUMENTED** — in-app copy (`hp_i18n_app.json`, shipped with the app itself): `render.draft.d` *"Fastest.
  Lower resolution, no shadows."*; `render.balanced.d` *"Original look. Soft shadows on the ground."*;
  `render.high.d` *"Shadows everywhere, ambient occlusion, tone mapping, depth of field."*; `render.ultra.d`
  *"Reflections, contact shadows, 4K shadow map. Needs a good GPU."*; `render.sec.light` *"Sun and materials"*;
  `render.sun.d` *"Date, time, shadows and sun path"*.
- **DOCUMENTED** — the landing page states the app is free *"also for commercial use"*, gives *"5
  visualization modes"*, and lists *"soft shadows, ambient occlusion, reflections and tone mapping"* under the
  quality ladder. **INFERRED** — I found no lighting- or sun-study-specific paywall, but I did not read a
  pricing/limits page to rule one out.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. "Gap" = the current single-workspace TS/Three.js planner (2D draw + 3D walk + PNG/JPEG
export, `localStorage` autosave, Plan/3D/Walk modes, tool card, inspector). The CasaPlazAI schema has **no**
orientation, sun or lighting fields today, so every idea below names the additive home for its state.

| # | Idea | Ties to | Value | Effort |
|---|---|---|---|---|
| 1 | **Ship a "sun card" in the 3D/Walk inspector, not a settings dialog.** One compact card in the tool-card slot: clock + time slider (5 min steps), date, three season chips, and a "Sun study…" button. This is the competitor's highest-delight widget and it needs no new schema. | §2.4 `#hpSunCard` | High | Low |
| 2 | **Make `#lightcheck` an internal derived state, never a user switch.** Compute `isNight = altitude < −1°` in one place and drive *everything* from it (sky, key light, fill, exposure) — the competitor does this correctly and it is why their day/night never desyncs. | §2.5 | High | Low |
| 3 | **Real solar position, one pure function.** A ~30-line ephemeris `sunPosition(dateLocal, tz, lat, lon) → {alt, az}` is enough to drive the key light direction and an orientation dial; no dependency needed. Add a `trueNorth` offset so the model's north can differ from world −Z. | §2.3 | High | Low–Med |
| 4 | **Persist sun/orientation beside the plan, additively.** `casaplaza.sun.v1 = {date, minutes, tz, trueNorth, latitude, longitude}` as editor state (mirroring how `casaplaza.snap.settings.v1` and `casaplaza.underlay.v1` are handled) — it is a viewport preference, not `FloorplanData`. If a per-floor `orientationDeg` ever needs to travel to the viewer, it belongs as an additive `FloorplanData` field via a `migrate.ts` transform, never a breaking edit. | §2.7, schema "Out-of-schema editor state" | High | Low |
| 5 | **A true day/night crossfade instead of a checkbox.** Because the competitor only swaps the sky material and three intensities, dusk is a hard cut. Three.js can lerp: `sunIntensity`, `hemiIntensity`, `backgroundIntensity` and `toneMappingExposure` between three anchors (civil twilight, golden hour, night) over the 0…±6° altitude band. Better-looking for ~30 lines. | §2.5 (their hard switch) | Med–High | Low |
| 6 | **Put the computed value on screen, not just a slider.** Show `"Azimuth 214° · altitude 38°"` and `sunrise 06:35 · sunset 17:09` — it makes the tool feel like a study instrument and costs nothing once the ephemeris exists. Their formula reproduces the textbook London winter-solstice noon altitude to 2 decimals, so a CasaPlazAI port is unit-testable the same way. | §2.3, §2.4 `sun.position`, `sun.riseSet` | Med | Low |
| 7 | **A country/capital fallback for the site** instead of blocking on a location prompt: if `latitude/longitude` are unset, derive a sensible default (browser locale → capital coordinates, or just the browser time zone). Show *"approximate place"* inline. | §2.7 | Med | Low |
| 8 | **Clip the shadow camera, do not leave it at defaults.** The competitor leaves `autoCalcShadowZBounds` false with a fixed 300 m light — cheap, but it wastes depth precision. For CasaPlazAI: set `directionalLight.shadow.camera` extents from the union bounding box of the plan (± a margin) and refresh them when the plan changes; keep the map 1024²/2048² tiered. | §2.1, §2.2 | Med | Low–Med |
| 9 | **Copy the four-step shadow tiering** — a persisted quality ladder where draft is *no shadows plus a 1.5× render scale*, balanced 1024² soft, high 2048² PCF, ultra 2048²–4096² contact-hardening, each also moving the key/fill intensities and the env intensity together. Store the tier next to the plan. | §2.2 | High | Med |
| 10 | **An "hours of sun" overlay is a genuinely differentiating feature and is cheap to approximate** — and I confirmed the competitor ships it and it runs: ground **and** per-room overlays, a grid pitch of `max(0.35 m, side/90)`, one ray per 20-minute sample with `alt > 1°`, hits → hours in an unlit `DataTexture`. Their whole pipeline is ~150 lines of shipped JS. Fully local, no server, no new schema field. | §2.6 (live) | High | Med–High |
| 11 | **A sun-path diagram is a ~1-hour SVG.** Circle + compass N/E/S/W + three polylines (21 Jun / 20 Mar / 21 Dec, one point per 10 min, broken where `alt < 0`) + hour dots. The competitor draws it inline in the panel; no library. | §2.6, §2.4 | Med | Med |
| 12 | **Day and year playback buttons** (`rAF`, 12 s for the day, 15 s for the year) are a demo-grade feature: they show shadows sweeping the plan and are trivial once the ephemeris is pure. Stop on interaction and restore the chosen time. | §2.4 | Med | Low–Med |
| 13 | **Make the IBL follow the sun once you have the ephemeris** — this is where the competitor falls short: they leave `environmentIntensity` at 1.0 and the same 512² HDR at midnight. Modulate `scene.environmentIntensity` (and optionally swap to a night HDR / lower-exposure env) from the same time-of-day value. | §2.5, §2.8 (their gap) | Med–High | Med |
| 14 | **Keep one ambient/fill pair and black ground colour** — the competitor's two-hemisphere rig (up 0.5 / down 0.7) plus directional key, with `groundColor` black, is a good, cheap archetype for `MeshStandardMaterial` scenes: no light-probe setup, pleasant interiors, and a single shadow caster. | §2.1 | Med | Low |
| 15 | **Guardrail: do not let the sun control touch the plan.** In their design the sun/sky is explicitly *"the sun of the scene"* — it is saved with the project but is not a per-room or per-opening property. Keeping it as one global viewport/study state avoids polluting the CasaPlazAI schema and share links. | §2.7 `sun.note`, schema | Low (guardrail) | Low |

---

## 4. Unknowns

1. **"Play the year" not exercised.** "Play the day" is now **OBSERVED** working
   (`proof/raf_probe.out.json`), but I did not press "Play the year"; the code path is the same rAF walker with a
   15 000 ms (`0x3a98`) span and the date — not the minutes — as the animated value (**OBSERVED** code,
   **unverified** behaviour). I also could not test the small card's play button, which was absent from the DOM
   in my capture state.
2. **The sun-map *values* are unvalidated.** The map now renders (**OBSERVED**, `proof/map_probe2.out.json`), but
   I only checked mesh count, sizes and the panel's headline numbers against the code — I did **not** verify the
   per-cell hour counts independently (e.g. compare a sampled cell against a hand-computed sun path for that grid
   point), so colour-ramp/scale correctness and the exact ray predicate are read, not measured. My first failing
   attempt used the wrong `HP3D.buildWall` signature (an object, not two `Vector3`s) — that, not the `io.nothing`
   guard, was the real cause.
3. **Dead-code risk**: `deob/hp-editor.js` still binds a `#sliderdaytime` manual sun-rotation slider and a
   `#daytimebox` show/hide, but **neither id exists in the shipped `app_index.html`** (verified by string count:
   `daytimebox 0`, `sliderdaytime 0`, `lightcheck 1`, `hpSunCard 1`). I read this as dead code in this build, but
   I could not rule out that another template version ships them.
4. **No authored shadow frustum.** The live ortho parameters were read and are the ±`Number.MAX_VALUE`
   sentinels, so the app never sizes the shadow camera explicitly and Babylon auto-derives it from the render
   list. I did **not** measure how far the shadow volume actually extends for a large plan (it depends on what
   Babylon puts on the render list), so shadow-acne/dropout at plan edges is untested.
5. **The final `night_extra` probe (sky `alpha`, `disableLighting`, live image-processing at night) failed with a
   syntax error in my own evaluate string**, so those three fields are read from the shipped code and from the
   earlier snapshots rather than from that specific call. The substance (material class, intensities, env) is
   nonetheless live-confirmed across three probes.
6. **`HPSun` code is string-decoded obfuscated JS**, so the ephemeris formulas are read with substituted string
   literals; variable *names* are still mangled. Formula-level transcription (all constants are numeric and
   therefore unambiguous) is higher confidence than the surrounding control flow.
7. **`environment.hdr` content unverified**: 512×512 is confirmed, but whether it is a sky-capture or an indoor
   studio probe is not — I cannot view images.
8. **`hp-bim.js` (454 KB) and `hp-editor.js` (674 KB) remain heavily mangled**; this round decoded `hp-editor`'s
   string table (`deob/ed_strings.json`, 1 721 strings) which resolved the light block, but other camera/scene
   setup in those two files is still opaque.
9. **`trueNorth` sign resolved but its UX convention is not.** The live sweep shows `trueNorth` is a Babylon
   Y-rotation by `+N` applied to the sun vector (**OBSERVED**), but whether the UI labels that as "true north is
   N° clockwise from world −Z" (the usual architectural convention) or the opposite is not something I read in
   the panel copy. With no site the fallback path reports `north: 0`, i.e. the default orientation is
   world-aligned.
10. **Time-zone table vs. DST**: the country table carries fixed UTC offsets; only the "site present" branch uses
    the browser's live offset. Whether a project saved in a DST zone restores the intended local time is untested.
11. **No GPU performance measurements.** All live numbers came from a SwiftShader (CPU) renderer, so the cost of
    the 4096² contact-hardening shadow map, the SSAO/SSR chain and the sun map is unmeasured here (round 1
    reached the same limitation).
