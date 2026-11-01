# 3D House Planner — Material & Texture System

**Focused question (round 2):** the 456 textures, Standard→PBR conversion, wall/floor painting UX, and how finishes are stored.
Target: <https://www.3dhouseplanner.com/> — editor `app.php`, 2D planner `2D-Planner/index.php`.
Research date: 2026-10-31. All new evidence lives in **this** job folder; `r1:` = the round-1 folder `~/dsh-workspaces/rea-3dhouseplanner-2026-10/06-06-3d-view-walkthrough/` (read-only).

**Tag legend**
- **OBSERVED** — read live from the running page (CDP, SwiftShader WebGL 2) or from shipped JavaScript; evidence file named.
- **DOCUMENTED** — the vendor's own published claim; URL named.
- **INFERRED** — my interpretation, stated as such.

**Method for this round's new code evidence.** Round-1's string-table decode was lossy for `hp-editor.js` (1721 strings, rotated table) and unusable for parts of `hp-bim.js`. I wrote a pure-Python decoder (`pydec.py`) that base64-decodes the obfuscator's token array with its own custom alphabet, percent-decodes each token, and applies the array-rotation shift solved by **replaying the obfuscator's own checksum guard** in Python (`solve_shift`). For `hp-editor.js` the guard uniquely identifies shift = 368. The result (`pydeob/hp-editor-s368.js`) resolves material identifiers coherently (`bumpTexture` ×23, `uScale` ×24, `floorplanTextureCatalog`, `PBRMaterial`, `StandardMaterial`); I cross-checked every claim below against round-1's clean decode or against a live probe.

---

## 1. Summary

- The "456 textures" are exactly **456 catalogue entries** — the same array is shipped **twice** in `HP_BOOT`: `floorplanTextureCatalog` (id/title/category/parent/image/imagebump) for the 2D planner, and `textures` (keyed by the same id) with five map slots `image / bump / occlusion / reflectivity / metallic` for 3D (**OBSERVED**, `live_mat.json` globals `{textures:456, floorplanTextureCatalog:456}`, `r1:hp_boot.json`).
- They are **PBR-map-ready 1K/2K scans** — 333× 1K, 95× 2K, 3× 4K; 456/456 have a colour map, 455 a NormalDX bump, 454 a Roughness map, 295 an Ambient-Occlusion map, only 87 a Metalness map — arranged in a **3-group taxonomy that sums exactly to 456**: Architecture 282 (Bricks 21, Concrete 15, Indoor tiles 72, Marble and granite 30, Outdoor tiles 19, Plaster 8, Roads and paving 30, Roofing 16, Stone walls 6, Wood 65), Materials 119 (Carpet 9, Ceramic 1, Fabrics 52, Foam 4, Leather 8, Metals 40, Paper 2, Plastic 3), Nature 33, Other 22 (**OBSERVED**, `r1:hp_boot.json`, `texture_categories.json`).
- Painting a surface is a **single shared click handler** `$("[id^=texture]")` that regex-matches `texture(\d+)` / `texture_s(\d+)`, looks the id up in `HP_BOOT.textures`, and assigns maps **according to the currently selected material class**: `StandardMaterial` gets `diffuseTexture` (+`bumpTexture`); `PBRMaterial` gets `albedoTexture`, `bumpTexture`, `ambientTexture`, `reflectivityTexture`, `metallicTexture` (**OBSERVED live — applying entry 217 set `diffuseTexture.url=/admin/imagetextures/ngpPaintedBricks004_1K_Color.jpg, uScale=4` and `HPBIM.serialize()` recorded it; `live_paint.json`, `live_schema.json`; code in `pydeob/hp-editor-s368.js`**).
- `HPRender.convertMaterials()` is the Standard→PBR switch: it walks scene meshes, converts each `StandardMaterial` (skipping `disableLighting`/`reflectionTexture` ones) to a `PBRMaterial` with `metallic=0`, `roughness=clamp(0.9−0.6·meanSpecular, 0.35, 0.95)`, copies `diffuseColor→albedoColor`, `diffuseTexture→albedoTexture`, `bumpTexture`, `emissiveColor`, `alpha`, `backFaceCulling=false`, and memoises per material in a `Map`, rewiring `MultiMaterial.subMaterials`; it toasts a count and re-emits `material` (**OBSERVED**, `r1:deob/hp-render.js`; live: PBR material count 67→139 after one call, `live_final.json`).
- Finishes are stored as **two parallel representations**: the compact semantic form `room.finishes = {floor, wall, ceiling}` (texture **title** strings) used by IFC/BIM bulk edits, and — for walls — the **full Babylon material serialisation** under each element's `material.multi[].single` (url, uScale/vScale, gamma uAng…), plus a per-face `faces[]` clone for side-specific painting (**OBSERVED**, `r1:deob/hp-bim.js`; `live_schema.json`), all inside the `.hpbim.json` project blob (`format:"hp-bim", version:1`, 401 KB for a one-room sample).

---

## 2. Findings

### 2.1 The texture catalogue — what the 456 entries actually are

**OBSERVED** — `live_mat.json` (`globals`), `r1:hp_boot.json`, `texture_categories.json`, `live_final.json` (`cat217`).

`window.HP_BOOT` carries two parallel views of one table:

| key | count | per-entry fields |
|---|---|---|
| `floorplanTextureCatalog` | 456 | `id, title, title_en, category, parent, featured, image, imagebump` |
| `textures` | 456 (same ids) | `image, bump, occlusion, reflectivity, metallic` |

Example entry (id 217, applied live in §2.3):

```json
"217": {"image":        "/admin/imagetextures/ngpPaintedBricks004_1K_Color.jpg",
        "bump":         "/admin/imagetextures/37gPaintedBricks004_1K_NormalDX.jpg",
        "occlusion":    "/admin/imagetextures/f2jPaintedBricks004_1K_AmbientOcclusion.jpg",
        "reflectivity": "/admin/imagetextures/cswPaintedBricks004_1K_Roughness.jpg",
        "metallic":     ""}
```

Map coverage across all 456 (computed from `r1:hp_boot.json`):

| map slot | non-empty | meaning |
|---|---|---|
| `image` | 456 | base colour, always present |
| `bump` | 455 | a **NormalDX** (DirectX, Y-down) normal map |
| `reflectivity` | 454 | actually a **roughness** map (filename suffix `_Roughness`) |
| `occlusion` | 295 | ambient occlusion |
| `metallic` | 87 | metalness (filename suffix `_Metalness`) — the metal surfaces only |

Resolution mix, parsed from filenames: **1K ×333, 2K ×95, 4K ×3** (4K entries are glass curtain-wall facades). Filenames are *not* the upstream asset names — each asset is stored under a **randomised 3-character prefix** before the family token (`oimWoodFloor052_2K_Color`, `gpyBricks059_2K_Color`, `csw…Roughness`). **INFERRED:** the random prefix is a hotlink-scramble for `/admin/imagetextures/`; extension-side consistency (every map of one asset shares `PaintedBricks004_1K_`) confirms the set was generated by one batch conversion.

Categories (**OBSERVED**, `texture_categories.json`, scraped from the *Textures* pane `#tab2` alone — the object pane `#tab1` has a separate tree): a 2-level tree of **3 parent groups and 25 leaves + 1 "Other"**, whose counts reconcile exactly to 456:

```
Architecture 282 → Bricks 21, Concrete 15, Indoor tiles 72, Marble and granite 30,
                   Outdoor tiles 19, Plaster 8, Roads and paving 30, Roofing 16,
                   Stone walls 6, Wood 65                        (sum = 282 ✓)
Materials 119    → Carpet 9, Ceramic 1, Fabrics 52, Foam 4, Leather 8, Metals 40,
                   Paper 2, Plastic 3                            (sum = 119 ✓)
Nature 33        → Bark 4, Rocks 8, Sand 3, Soil 13, Vegetation 3, Water and ice 2
                                                                 (sum = 33 ✓)
Other 22
282 + 119 + 33 + 22 = 456 ✓
```

(My first scrape accidentally concatenated both catalog panes and produced a misleading 86-row list; the 28 rows above are the complete texture taxonomy. Note the catalogue's own `parent` ids number 29 because a few parents are sub-parents not rendered as separate count rows.)

The palette itself is a **tree of buttons** rendered server-side into the page: `<a id="texture217" role="button" tabindex="0" draggable="true" title="Blue-grey painted brick wall"><img data-src="…_Color.jpg" class="lazy">…</a>`, grouped by `<li class="hp-item-group">Bricks</li>`, with three-thumbnail previews on every category row. `lazyLoadInstance` fills `data-src` on scroll. There are **456 such `<a id="textureNNN">` nodes** in the initial HTML (**OBSERVED**, `live_mat.json` palette `count:456, thumbs:456`).

### 2.2 Standard → PBR conversion (`HPRender.convertMaterials`)

**OBSERVED** — `r1:deob/hp-render.js` (clean decode), reproduced in full below; live effect from `live_final.json`.

`HP3D` constructs **StandardMaterial everywhere by default** (`HP3D.stdMaterial(len)` new `StandardMaterial('std')`, `backFaceCulling=false`). A 1:1 conversion is the only PBR path for existing geometry:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

Key properties, all **OBSERVED**:

- **Idempotent and cached** — a `Map` keyed on the original material means re-running does not duplicate; the counter `n` counts *newly converted* materials only.
- **Texture objects are shared, not copied** — the PBR material points at the *same* `BABYLON.Texture` instance, so UV state (`uScale` etc.) survives the switch, but the `ambient/reflectivity/metallic` slots, which `StandardMaterial` cannot hold, arrive **empty**. Live confirmation: one `HPRender.convertMaterials()` call took the scene from **67 to 139 `PBRMaterial` instances** (+72 conversions), and the four newly converted materials I sampled all showed `metallic:0`, `roughness:0.553`, and no `ambient`/`reflectivity`/`metallicTexture` (**OBSERVED**, `live_final.json`). Note the sample values are consistent with a *solid-colour* Standard source: those four had no `diffuseTexture` either (`albedo:false`), because `convertMaterials()` only carries by reference what the source already had, and the conversion is **not** catalogue-aware. A wall that was painted through the palette *does* keep its colour map as `albedoTexture` (same object), but the roughness/AO/metalness maps of the catalogue entry are **not** wired by the bulk converter (**OBSERVED** from the code path `r1:deob/hp-render.js`; cf. §2.3 where the palette handler *does* wire all five).
- **`MultiMaterial` is rewired in place** (`subMaterials = subMaterials.map(...)`), which is how the shared `wall_merged` wall keeps its multiple faces consistent.
- Roughness is derived from the old `specularColor`, clamped to **[0.35, 0.95]**; `metallic` is hard-coded **0** for everything including the 87 metal catalogue entries. **INFERRED:** the converter is a "make it not look flat" pass, not a physically calibrated one.
- The **converse switch** is the tool-card radio pair **Standard / PBR** (i18n `gui.std` / `gui.pbr`, tips "Apply a standard material" / "Apply a physically based (PBR) material") — a two-button `role=radiogroup` built in `hp-panels.js`. Selecting **PBR** over a multi-submesh selection rebuilds a fresh `MultiMaterial` and replaces the selected sub-mesh with `new PBRMaterial("pbr")` configured `metallic=0, indexOfRefraction=1.4, roughness=0.9, alpha=1, backFaceCulling=false, subSurface.isTranslucencyEnabled=true`; selecting **Standard** builds `new StandardMaterial("std")` with `backFaceCulling=false` (**OBSERVED**, `pydeob/hp-editor-s368.js` `materialbutton`/`materialbutton2 onIsCheckedChangedObservable`; `r1:deob/hp-panels.js` for the UI). The two directions are asymmetric — the radio pair *creates a blank material*, while `convertMaterials()` is the only thing that *carries textures across*.

### 2.3 Wall/floor painting UX and the exact assignment it performs

**OBSERVED** — `pydeob/hp-editor-s368.js` (handler + helpers), `live_paint.json`, `live_schema.json`.

The palette click handler is a single delegated listener:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

So **the same catalogue drives both material classes**: `image→diffuse` or `image→albedo`, `bump→bump` in both, and the extra `occlusion/reflectivity/metallic` maps are **PBR-only**. Note the *double meaning* of `reflectivity`: the JSON key says reflectivity, the asset is a roughness map, and it lands on `PBRMaterial.reflectivityTexture` (Babylon's packed reflectivity texture, whose channels are conventionally R=reflection/G=glossiness) — a naming bake-off the site never resolves. **INFERRED.**

The equivalent programmatic helpers are exported on `HP3D` (**OBSERVED**, `live_apply.json` `fn_arity`, code in `pydeob/hp-editor-s368.js`):

- `HP3D.applyTexture(mesh, textureEntry, opts)` (arity 3) — resolves the mesh through the element root, then for **each target material** sets the map pair; live call with entry 217 returned `2` (two materials of the shared wall were painted) and the wall's `diffuseTexture.uScale` became **4**.
- `HP3D.makeTexture(url, uvScale)` (arity 2) — a bare `new BABYLON.Texture(url, scene)` with `wrapU=wrapV=WRAP_ADDRESSMODE`, `uScale=vScale=uvScale`. Live call reported the arity but threw when passed a catalogue object instead of a URL string (`t.substr is not a function`) — i.e. **`makeTexture` takes the image URL, not the entry**.
- `HP3D.stdMaterial(len)` (arity 1), `HP3D.cloneMaterial(mat)` (arity 1 — deep-copies `MultiMaterial` and its `subMaterials`), `HP3D.pickTexture(space, roomType)` (arity 2), `HP3D.searchTextures(query, limit)` (arity 2, accent-folding/normalising token search), `HP3D.paint` (terrain paint context).

Because a wall's material is the **project-wide shared `wall_merged` MultiMaterial**, painting targets the **sub-mesh under the cursor** (`selected._currentMaterial` when `subMeshCount > 1`), not the whole wall; the site avoids breaking other walls by **cloning per face** rather than mutating the shared material (**INFERRED** from `cloneMaterial` + per-submesh assignment; consistent with the per-wall `faces[]` array in §2.4).

**The finish-editor panel.** The tool card builds a material section (i18n `gui.material`) containing, in order (**OBSERVED**, `r1:deob/hp-panels.js`): the Standard/PBR radio group; a colour label + swatch picker + native colour input + hex text field; an **"uScale"** slider (`min 0.05, max 10, step 0.05, value 1, 2 decimals`); an **"vScale"** slider (same range); a **"Texture angle"** slider (`0…2π`); **"Metallic"** slider (`0…1`, default 0.5); a **"Glass"** checkbox; a **"Refraction index"** slider (`1…1.7`, default 1.4); a **"Roughness"** slider (`0…1`); a **"Transparency"** slider (`0.1…1`); and an **"Emissive"/"Translucency"** checkbox whose caption swaps with the material class (the label literally renames itself from `Emissive` to `Translucency` when the material becomes PBR — the code compares the English strings). Helpers near it: **`copyMaterial`** (clipboard icon `format_paint`, shortcut **Ctrl+C**) and **`pasteMaterial`** (`format_color_fill`, **Ctrl+V**) in the tool card, plus an identical pair in the GUI dock. The i18n hint `gui.copyHint` explains the model: the tool card can copy *walls, floors, doors/windows or material* — material is one of four **copy-able aspects**, which is how finishes move between rooms/floors.

**The UV model.** `applyTexture`'s helper creates a fresh Texture per material with `uScale=vScale=opts.uvScale ?? 0.5`; the panel's sliders then edit those two values live. This means tiling is **stored per-material as a scalar pair** (`uScale`/`vScale`), not as a world-space unit — a 1 m and a 3 m wall painted with the same texture at the same `uScale` show different tile sizes. **INFERRED** from the code and from the serialised `uScale:4`.

**Terrain painting is a separate system.** The "Terrain painter" switch (`#terrainpaintercheck`) reveals `#painttexturepanel` with **three paint layers**, each a radio (`name="painttexture"`, values `#FF0000 / #00FF00 / #0000FF` — i.e. an **R/G/B splat mask**), a thumbnail button (`#terraintextureimgN` → `data-hp-open="modalpaintterrain"`), and its own **UV-scale range `#uvtextureN` (`min 1, max 150, step 2`, default 20 in the saved data)**. Each layer also has a **`<select class="hp-paint-detail" data-slot="N">`** ("Vegetation of this texture", i18n `tool.detail`) with options *Automatic (by texture) / None / Grass and flowers / Dry grass / Pebbles / Sand (shells) / Mud (twigs) / Bog (reeds) / Water (realistic surface)* — a **detail-overlay** channel that decides which scatter layer to render on top of the base ground texture. The dialog (`#modalpaintterrain`) offers a **32-entry terrain texture library** (`.terraintextureselect`, `textures/terraintextures/thumbs/*.jpg`: grass, drygrass, rock1–3, sand, pebbles, cobblestone1–2, asphalt, concrete, blocks1–4, mud, bog, ice1–2, snow…), an upload path, and an **AI texture generator** (`paint.aiTitle`, `paint.promptPh` "Rocky cliff with mossy details"). The hint is `fx.paintHint` "Left-click to paint terrain". This is a dedicated **3-channel splat-map painter** for the ground plane, distinct from the wall/floor material system; its state is persisted as a `{url, scale}[]` list plus a `detail[]` list (see §2.4).

### 2.4 Data storage of finishes

**OBSERVED** — `live_schema.json`, `live_schema2.json`, `live_final.json`, `live_apply.json` (`serialize_keys`), `r1:deob/hp-bim.js`.

**Project blob.** `HPBIM.serialize()` returns the save format, whose top-level keys are:

```
format:"hp-bim", version:1, app:"3D House Planner",
meta{id,name,created,updated,units}, settings{floorHeight,floorSize,level,renderMode,night,units},
camera, levels, levelInfo, site, norms, sun, tour, measures, efficiency, classification,
ifc{schema:"IFC4",costSchedule}, types[], budget, elements[], terrain, plan, georef, check, sync
```

The same blob is what `HPBIM.save/open/listProjects/saveCopy` write; projects also live in **IndexedDB `hp-bim` (version 2)** (**OBSERVED**, `live_mat.json` `indexeddb`; matches round-1's unknown #10 — the DB name/version are now confirmed but the object stores were not enumerated).

**Per-element material.** Each `elements[]` entry is `{kind, id, name, level, bim, hp, material, wall, faces}`. The `material` block is the **Babylon serialiser output**, not a compact id:

```json
"material": { "multi": [ { "single": {
    "tags": null,
    "diffuseTexture": { "url":"/admin/imagetextures/ngpPaintedBricks004_1K_Color.jpg",
                        "uOffset":0, "vOffset":0, "uScale":4, "vScale":4,
                        "uAng":0, "vAng":0, "wAng":0,
                        "wrapU":1, "wrapV":1, "samplingMode":3, "gammaSpace":true, … },
    "ambient":[0,0,0], "diffuse":[1,1,1], "specular":[1,1,1], "emissive":[0,0,0],
    "specularPower":64, "roughness":0, "indexOfRefraction":0.98,
    "alpha":1, "backFaceCulling":true, "transparencyMode":null, … } } ] }
```

Notable: the saved texture block is the full `BABYLON.Texture` state (≈100 fields per map), the **texture is identified only by URL** — the catalogue id is *not* stored — and there is a **separate `faces[]` array** holding per-face single-material clones, which is how "paint only this side of the wall" survives a reload. Colour is stored as `[r,g,b]` floats, so an unpainted wall saves as `diffuse:[1,1,1]` and can be re-derived to a hex (`HPBIM`'s `b1fee1`/`210f85`/`10540c` helpers turn a mesh's material back into `{name, color:[…], textured}` for the schedule/BIM panel).

**Reverse lookup.** On read, `hp-bim.js` finds the catalogue entry by **matching the material texture URL against every `catalog.textures[].image`** (prefix-tolerant `indexOf`); if it matches it reports the human title, `data:` URLs become "AI texture", and otherwise it falls back to the decoded last path segment. That is exactly how the BIM/schedule table can say *"Light chevron parquet"* instead of a filename (**OBSERVED**, `r1:deob/hp-bim.js`).

**Compact semantic form.** Rooms additionally carry a small, portable descriptor:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

The BIM panel exposes bulk fields `data-bulk="finishFloor"`, `data-bulk="finishWall"`, `data-bulk="finishCeiling"` (i18n `bim.finishFloor/Wall/Ceiling`, group label `bim.finishes` — "Finishes"), so **finish-by-room** is a first-class, editable property independent of the per-mesh material. **INFERRED:** the two representations are complementary — `finishes` is the semantic/scheduling layer (a *title*), `material` is the rendered layer (a *URL + UV transform*); they can drift, and nothing in the writer I read keeps them in lock-step.

**Terrain.** `terrain` stores the splat state:

```json
{"modified":false,"imported":false,
 "textures":[{"url":"textures/terraintextures/grass.jpg","scale":20},
             {"url":"textures/terraintextures/rock.jpg","scale":20},
             {"url":"textures/terraintextures/sand.jpg","scale":20},
             {"url":"textures/terraintextures/grass.jpg","scale":20}],
 "detail":[null,null,null]}
```

i.e. a `textures[]` list mirroring the palette's **three** R/G/B layers — each `{url, scale}` matching the per-layer `#uvtextureN` slider (1–150; the saved sample is 20) — plus a separate **3-element `detail[]`** array for the per-layer detail-overlay choice. Note the persisted sample has **four** `textures[]` entries while the panel exposes three layers; **INFERRED:** the 4th entry is a legacy/unused slot kept for backward compatibility (or a base layer), since the UI only ever writes three radios.

**2D⇄3D sync of finishes.** The 2D planner's polygon model carries `skirting{}` and (per the plan) wall/floor images; the bridge copies them across as `HP3D.applyTexture(mesh, wallImage, {side: HP3D.wallSideFacing(mesh, x, z)})`, and for skirting passes `{texture: skirting.image, meta:{src:'plan', room, textureId}}` to `addRoomSkirting` (**OBSERVED**, `r1:deob/hp-sync.js`). So the **2D planner stores a `textureId`**, and the **3D side records it in `meta`** while the rendered texture is applied per side — meaning texture identity *is* preserved across the bridge even though the 3D save stores URLs (**OBSERVED** for the code path; the 2D SVG payload's exact key names were not re-verified this round).

**Room-type auto-finishing.** When the 2D plan is projected onto 3D, rooms with no explicit finish are assigned a catalogue texture by a **scoring heuristic** (**OBSERVED**, `pydeob/hp-editor-s368.js`, `_0x54488e`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

This is a deterministic "which catalogue entry best matches *kitchen floor*"-resolver, memoised per `space:roomType`, used by `HP3D.pickTexture(space, roomType)` and by the plan-projection path. **INFERRED:** the `category`/`parent` ordering is the swatch order in the palette, so the heuristic tends to pick the *first* suitable tile/wood in the library unless a title keyword or `featured` flag overrides it.

### 2.5 Texture loading, formats, and quality knobs

**OBSERVED** — `live_schema.json` (`samplingMode:3`, `anisotropicFilteringLevel:4`, `gammaSpace:true`, `wrapU/V:1`, mip settings), `pydeob/hp-editor-s368.js`, `r1:deob/hp-panels.js`.

- Textures load as plain `new BABYLON.Texture(url, scene)` — **no `.env`/KTX2/DDS**, just JPG/PNG from `/admin/imagetextures/`. `samplingMode:3` is **TRILINEAR**, mipmaps on, `anisotropicFilteringLevel:4` set on painted textures. **INFERRED:** 4× anisotropy is the default the serialiser captured; the panel exposes no anisotropy control.
- Wrap is **repeat** (`wrapU=wrapV=1`) on both axes; tiling is the `uScale`/`vScale` pair described in §2.3.
- The project's `settings.renderMode` persists the 6-step quality ladder (`draft/balanced/high/ultra/pathtrace/ai`) that round-1 established; `localStorage['hp-render-mode']` is that value's mirror. There is also an **`io.maxTexture`** ("Max. texture size") import/export setting and an **`aiObjectTextureQuality`** key used by the AI-object pipeline (**OBSERVED**, `r1:hp_i18n_app.json`).
- AI textures bypass the catalogue entirely: the generated image becomes a `data:` URL, and `HPBIM`'s reverse lookup special-cases `data:` → i18n `gui.aiTexture`. `fx.textureUploaded` ("Texture uploaded and applied!") and `fx.noTextureSupport` ("The selected object cannot accept textures") bound the other two input paths. **INFERRED:** the palette is therefore not the only source — upload and AI-generated textures coexist with catalogue URLs in the same `diffuseTexture.url` slot.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. "Schema" refers to `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`.

**1. Ship a small, curated texture library with all five PBR maps, and one shared "apply" path (value: high, effort: medium).**
3D House Planner's decisive move is that *one* 456-entry table serves both a plain material and a PBR one, and one click handler knows how to fan it out to five maps (§2.1, §2.3). CasaPlazAI already ships Three.js with no backend; a bundled set of, say, 40–60 CC0 1K scans (colour + normal + roughness + AO, metalness only on metals) with a JSON manifest `{id,title,category,parent,image,bump,occlusion,reflectivity,metallic}` costs almost nothing to host and gives users an immediate "professional" look. Store the manifest in `assets/textures/catalog.json`. *Ties to: finding §2.1; CasaPlazAI schema — add `textureId` to the finish record (below).*

**2. Persist a compact, semantic finish record — do NOT serialise the whole Three.js material (value: high, effort: low).**
The single biggest lesson from §2.4 is a warning: 3D House Planner saves ~100 fields of Babylon texture state per map, per face, per element (a one-room project is **401 KB**), and its own BIM code has to reverse-engineer the catalogue id by string-matching texture URLs. CasaPlazAI should store:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

This is ~10× smaller than the Babylon dump, survives a Three.js upgrade, and makes finishes queryable (schedules, totals). Keep the *rendered* material as derived state that is rebuilt from `Finish` on load. *Ties to: finding §2.4; CasaPlazAI schema — extend the room/wall records, keep `localStorage` payload small (the current autosave is a single JSON blob).*

**3. A "finish by room type" resolver, but data-driven (value: high, effort: low/medium).**
The scoring heuristic in §2.4 (`10·categoryIndex − 5·keyword − 2·featured + id/1e6`) is a neat example of zero-cost "smart defaults" that make a plan look finished the moment it is 3D-projected. CasaPlazAI can do the same with a tiny table keyed on its own room types:

```
floor: bathroom→tile.white, kitchen→tile.*, living/bedroom→wood.*, garage→concrete.*
wall : bathroom/kitchen→paint.white, garage→concrete.*, other→plaster.*
```

Add a "featured" flag and a keyword regex per entry so the first-painted swatch is never arbitrary. This is a strong differentiator for a no-backend app and costs one JSON table plus a memo. *Ties to: finding §2.4; CasaPlazAI schema — room records already need a `roomType`; use it as the resolver key.*

**4. Paint at the *face* level with a copy/paste material buffer (value: high, effort: medium).**
3D House Planner paints the sub-mesh under the cursor and keeps a per-wall `faces[]` clone array, and it exposes **Ctrl+C / Ctrl+V "copy material"** as one of four copy aspects (walls, floors, doors/windows, material). For CasaPlazAI's shared-wall model this matters: a room's wall is often shared, so "paint this wall" must be per-side. Implement:
- `EyedropperTool` / `PaintTool`: hit-test → resolve room+face → write `finish` on that face record.
- `Ctrl+C` copies `{finish, uv}` to a clipboard slot displayed next to the tool card; `Ctrl+V` applies to the current selection. Per the redesign's tool card, this belongs as a small "Material" row with copy/paste icons. *Ties to: findings §2.3, §2.4; CasaPlazAI schema — add optional `faceFinish` to wall records (shared-wall sides are already distinguishable if the schema stores a wall side/room ref).*

**5. Make the Standard→PBR switch a real, reversible toggle that carries the texture (value: medium, effort: medium).**
`convertMaterials()` (§2.2) is a one-way, lossy pass: it reuses the colour map but drops the roughness/AO/metalness opportunities and hard-codes `metallic=0`. CasaPlazAI should do better and cheaper: because idea 2 stores the *semantic* finish, a "Standard ⇄ PBR" toggle becomes a pure re-materialisation — `MeshStandardMaterial` (already PBR in Three.js) vs `MeshLambertMaterial`/`MeshPhongMaterial` — with all maps reattached from `textureId`. Derive roughness from the map if present, else from an explicit field; never from `specularColor` averages. *Ties to: finding §2.2; CasaPlazAI is Three.js, so the "Standard" tier maps to `MeshLambertMaterial`/`MeshBasicMaterial` and "PBR" to `MeshStandardMaterial`.*

**6. Give tiling real units, not just a scalar (value: medium, effort: low).**
3D House Planner's `uScale`/`vScale` sliders (0.05–10) are per-material scalars, so the same texture tiles differently on a 1 m and a 3 m wall (§2.3). For a floorplanner that advertises a **0.5 m grid**, offer a "tile size (m)" control that converts to `repeat = length / tileSize` per face, and expose a **rotation** control (3D House Planner has "Texture angle" 0…2π). This is a visible quality win and is trivial on top of `Finish.uv`. *Ties to: finding §2.3, §2.5.*

**7. Keep a separate terrain/underlay splat system with three layers (value: low/medium, effort: medium).**
The terrain painter (§2.3, §2.4) is a genuinely different system: **three** R/G/B layers, each `{textureId, scale, detail}`, painted with a brush into what is effectively a **3-channel splat mask**. CasaPlazAI's blueprint-underlay and any garden/terrain use could reuse that shape — store `layers: [{textureId, scale, detail}]` plus a splat mask texture (an RGB canvas is enough for three layers and matches 3D House Planner's own R/G/B radio values). The **detail-overlay** channel is a nice touch: a separate scatter map (grass tufts, pebbles, water sheen) chosen per layer, giving a much richer ground than a flat texture for almost no data. Only worth it if outdoor/terrain is on the roadmap. *Ties to: finding §2.4 (terrain block).*

**8. Small UX steals worth copying (value: medium, effort: low).**
- **Draggable swatches:** the palette `<a>` nodes are `draggable="true"` and drop onto `#renderCanvas` (`dragover` handler) — drag-a-swatch-onto-a-surface is a faster gesture than select-then-click.
- **Grid + category tree + search:** 456 entries are shown as a lazily-loaded thumbnail tree with counts on every parent (Architecture 282 / Bricks 21 / …), plus `HP3D.searchTextures(query, limit)` which accent-folds and tokenises. For a smaller library, a flat searchable grid may suffice, but keep the "category → count" affordance.
- **Live preview on the real surface:** clicking a swatch paints the selected mesh immediately (no modal confirm), and the panel's sliders then edit the just-applied material. *Ties to: findings §2.1, §2.3.*

---

## 4. Unknowns

1. **IndexedDB `hp-bim` v2 object-store layout** — only the DB name/version were observed live; stores, key paths and autosave cadence for the material blob remain unverified (extends round-1 unknown #10).
2. **`plan` block of the save file** — `HPBIM.serialize()` was captured for a plan-projected scene (`hasPlan:false`, no `slab`/`room` elements present at capture time). The exact per-room `finishes` + `textureId` keys written by the *2D planner* side were read from the sync code, not from a real saved 2D-origin project.
3. **`HP3D.paint` internals** — the terrain splat-map structure (mask resolution, and how the three R/G/B layers are packed) was not decompiled; only the `{url, scale}[]` + `detail[]` persistence shape is observed.
4. **`hp-editor.js` was only partially decoded.** My pure-Python decoder solved the array rotation for that file (shift 368) and the material identifiers resolve coherently, but ~1.5 % of indices fall outside the token range and remain numeric, and I did not exhaustively re-verify every non-material string. Claims above all rest on identifiers I could cross-check live or against `r1:deob/hp-render.js` / `r1:deob/hp-panels.js` / `r1:deob/hp-bim.js`.
5. **`reflectivityTexture` channel convention** — the catalogue file is named `…_Roughness.jpg` but is assigned to `reflectivityTexture`; whether Babylon treats it as packed R/G (reflection/glossiness) or as a single roughness channel in this app was not verified by rendering.
6. **`metallic` map wiring when the PBR radio (not the converter) is used** — the click handler tests `if (cat.metallic)`, but only 87/456 entries have one and none of my live probes selected such an entry.
7. **`io.maxTexture` semantics** — the import/export "Max. texture size" setting: whether it downsamples on import or clamps on export was not traced.
8. **Category taxonomy licensing/provenance** — filenames (`PaintedBricks004`, `WoodFloor052`, `PavingStones070`, `Metal032`) look like a commercial scan library; I did not verify the vendor's texture licence, only that the maps are served from `/admin/imagetextures/`.

---

### Evidence index (this folder)

| file | what it proves |
|---|---|
| `live_mat.json` | 456 textures / 456 catalogue entries live; 456 palette nodes with titles; IndexedDB `hp-bim` v2; scene material count |
| `live_paint.json` | palette click path; HP3D API key list; 23 elements (7 walls, 6 doors, 9 windows, terrain) |
| `live_apply.json` | `applyTexture/makeTexture/stdMaterial/cloneMaterial/pickTexture/searchTextures` arities + bodies; `HPBIM.serialize()` top-level schema |
| `live_schema.json`, `live_schema2.json` | wall element `{kind,id,name,level,bim,hp,material,wall,faces}`; the serialised `diffuseTexture` block incl. `uScale:4`; terrain splat block |
| `live_final.json` | `faces[]` per-face clone; catalogue entry 217 all five maps; `convertMaterials()` live 67→139 PBR, `metallic=0`, `roughness=0.553` |
| `texture_categories.json` | the 86-row palette category tree with counts |
| `pydeob/hp-editor-s368.js` | rotation-corrected decode: click handler, PBR/Standard radios, `applyTexture`/UV helpers, room-type scoring table |
| `pydec.py`, `deob2.py`, `ctx.py` | the decode tooling (pure-Python token/rotation solver) |
| `live_boot.json`, `live_console.json`, `boot_editor.py` | live boot recipe: seed `index.php` → `app.php` → click `#definefloor` → SwiftShader WebGL 2 |
| `r1:hp_boot.json` | the authoritative 456-entry catalogue (`textures`, `floorplanTextureCatalog`) |
| `r1:deob/hp-render.js` | full `convertMaterials()` body |
| `r1:deob/hp-panels.js` | the Standard/PBR radio group and the whole finish-editor panel builder |
| `r1:deob/hp-bim.js` | `finishes:{floor,wall,ceiling}`, URL→catalogue reverse lookup, `copyMaterial`, bulk finish fields |
| `r1:deob/hp-sync.js` | 2D→3D texture application (`applyTexture` per side, skirting `textureId`) |
