# 3D House Planner (www.3dhouseplanner.com) — Save / Load / Export / Share

Research job: `07-07-save-export-share` · CasaPlazAI competitor research · 2026-10-31

**Method.** The app is a single-page Babylon.js editor served from `app.php`. Public marketing
copy was read from the landing page; the shipped JavaScript was captured from the live page with
REA browser scenarios (network response bodies), then de-obfuscated locally so behaviour could be
described. The live File menu and Export dialog were driven with REA and their DOM/screenshots
saved. Every claim below is tagged **OBSERVED** (live page or shipped JS, with an evidence file),
**DOCUMENTED** (vendor page) or **INFERRED**.

Evidence is in this folder: `raw/` (saved HTML), `bundles/js/` (captured scripts),
`bundles/deobf/` (locally de-obfuscated), `evidence/` (scenario JSON, DOM, screenshots),
`scenarios/` (the REA scenario inputs), `tools/` (local analyses).

---

## 1. Summary

- **Everything lives in the browser.** Projects are stored in an IndexedDB database named
  `hp-bim` (v2) with a `projects` object store plus an `index` metadata store; nothing is uploaded
  for normal saving. Manual Save (Ctrl+S), Save as…, New, Open and an Autosave toggle sit in a
  single **File** menu. *OBSERVED* (`bundles/deobf/editor__hp-bim.js`,
  `evidence/06-file-menu.dom.html`)
- **The editable project file is `.hpbim.json`.** It is a self-describing JSON envelope
  (`format`/`version`/`app`/`meta`/`settings`/`camera`) that carries elements, levels, BIM data,
  budget, terrain, site, sun, measurements and even the imported plan image. Import only accepts
  this format for projects; other files go through separate model/CAD/image importers. *OBSERVED*
- **Eleven export formats**, split between the browser and the vendor's server: `project`,
  `glb`, `gltf`, `obj`, `stl`, `png` are produced locally; `pdf`, `ifc`, `dxf`, `svg`, `csv` are
  rendered **on the server** (`api/bim.php`, "Made on our server from a copy of the model; nothing
  is stored"). A live export dialog lists all eleven with descriptions and per-format options.
  *OBSERVED* (`evidence/07b/exportForm.dom.html`)
- **Floor-plan trace-over + AI vectorisation.** A plan image is imported as a scaled underlay
  (width/length in real units) stored in the project as `plan`; an optional AI "floor plan
  converter" traces walls and detects doors/windows/room types. *OBSERVED*
- **Sharing is a vendor-hosted view-only link.** `api/share.php` returns a URL with a 32-hex id;
  the key is kept client-side (`localStorage` `hp-share-links`). The recipient opens
  `app.php?share=<id>` in a read-only viewer and can "Save a copy to edit". Marketing claims the
  app is 100% free, no login, no watermark; no paywall gating exists in the client, only
  donation prompts and third-party AI credits. *OBSERVED* + *DOCUMENTED*

---

## 2. Findings

### F1 — Where projects are stored (IndexedDB schema) — OBSERVED

Shipped code opens `indexedDB.open("hp-bim", 2)`. On upgrade it creates:

- store **`projects`**, `keyPath: "id"` — full project payloads;
- store **`index`**, `keyPath: "id"` — lightweight list rows built by copying every `projects`
  record into the shape `{id, name, created, updated, thumbnail, size, autosave}`.

A project id is generated locally as `"p" + Date.now().toString(36) + <random>`. The index store is
what populates the Projects panel and the "recent projects" list, so listing does not deserialize
whole projects. Evidence: `bundles/deobf/editor__hp-bim.js`; `evidence/03-editor-enter.json`
(storage section); UI copy `bim.storage` "Stored in this browser only (IndexedDB) – export a
project file to keep a copy." in `raw/app.php.html`.

Key `localStorage` keys seen in the shipped code: `hp-bim-autosave` (autosave on/off), `hp-units`
(metric/imperial), `hp-io-import` (last import options, e.g. DXF wall thickness), `hp-share-links`
(published-link records).

### F2 — Project list / Save-as lifecycle — OBSERVED

The File menu `#hpFileMenu` (observed live) contains, in order: **New project**, **Open…**,
**Save** (with `Ctrl S` hint), **Save as…**, **Share view link**, separator, **Import…**
(subtitle "IFC, DXF, GLB, OBJ, STL, JSON"), **Import floor plan**, **Import terrain color map**,
**Export…**, then a grid of eleven format chips, then up to four recent projects.

The Projects panel (BIM side panel → "Projects" tab) adds Save / Save as… / New, the Autosave
toggle, and a card list where each card shows an image thumbnail (or a house placeholder), the
name, a locale-formatted date, and size in KB, with per-card **rename** and **duplicate** buttons.
A row whose id is `__recovery__` is rendered with a `⟲` prefix. Evidence:
`evidence/06-file-menu.dom.html`, `raw/app.php.html` (`bim.save`, `bim.saveAs`, `bim.rename`,
`bim.duplicate`, `bim.delete`, `bim.confirmDelete`, `bim.confirmOpen`, `bim.confirmNew`).

Top bar shows a project-name text field plus a save-state chip that cycles
**saved / unsaved / saving** with a coloured dot ("Unsaved changes" observed).

### F3 — Autosave, recovery and multi-tab guard — OBSERVED

- Autosave is a user toggle persisted at `localStorage["hp-bim-autosave"]` (default on).
- A 3000 ms (`0xbb8`) interval compares a change signature and marks the model dirty; a
  model-event handler schedules an autosave with a 400 ms (`0x190`) debounce; a canvas
  `pointerup` schedules one at 500 ms (`0x1f4`).
- Two reserved records exist: a **recovery draft** (`__recovery__`) and a reopen marker
  (`__reopen__`). Recovery is written on `beforeunload` when the project is dirty, and also when a
  shared plan is converted to an editable copy.
- On startup, if a `__recovery__` record exists and is newer than **14 days**
  (`0x48190800` ms), a toast offers "A project from your last session was found. → Restore".
- If a save replaces a project whose elements could not all be restored, the stored project is
  kept and changes go to a recovery copy until the user saves (copy `bim.partialNote`,
  `bim.restoreFailed`, `bim.confirmPartialSave`).
- Multi-tab: on `versionchange` the DB connection is closed and the UI shows "Projects stay
  unavailable while another tab of the planner (older version) is open: close it or reload it"
  (`bim.dbBlocked`). Missing IndexedDB → `bim.noStorage` "This browser cannot store projects
  (IndexedDB unavailable)."
- Save errors surface as `bim.saveFail` / `bim.storageFail`.

Evidence: `bundles/deobf/editor__hp-bim.js`, `raw/app.php.html`.

### F4 — The `.hpbim.json` project format — OBSERVED

Serialization is one JSON object. Top-level keys observed in the serializer: `format` (`"hp-bim"`),
`version` (1), `app` ("3D House Planner"), `meta` (`id`, `name`, `created`, `updated`, `units`),
`settings` (`floorHeight`, `floorSize`, `level`, `renderMode`, `night`, `units`), `camera`
(`alpha`, `beta`, `radius`, `target`), `levels`, `levelInfo`, `site`, `norms`, `sun`, `tour`
(camera tour viewpoints), `measures`, `efficiency`, `classification`, `ifc`, `types`, `budget`,
`elements[]`, `terrain`, `plan`, `georef`, `check` (model-check results) and `sync`.

So the "project file" is a complete editable snapshot, including presentation state. The export
footer for this format reads "Everything: elements, levels, BIM data, budget, terrain and camera."
and "Files are created in your browser." Import validation rejects other JSON:
"Unknown JSON file: only 3D House Planner projects (.hpbim.json) can be imported." Evidence:
`evidence/07b/exportForm.dom.html`, `bundles/deobf/editor__hp-bim.js`, `raw/app.php.html`.

### F5 — File naming and download mechanics — OBSERVED

A shared download helper builds a `Blob`, `URL.createObjectURL`, a temporary `<a download>`,
clicks it, removes it, and revokes the URL after 4000 ms (`0xfa0`). The file-name helper strips a
known extension set (`.hpbim.json`, `json`, `ifc`, `glb`, `gltf`, `obj`, `stl`, `dxf`, `svg`, `csv`,
`png`, `zip`) and sanitises the rest, defaulting to `project`. When a multi-file set is exported
with the "Single .zip package" option, the client tries to zip them; if zipping is unavailable it
falls back to downloading the files one by one with 300 ms spacing and a single toast.

Default file name observed live: `Untitled-project` with a fixed, non-editable extension chip
`.hpbim.json` beside the field (the chip changes per selected format). Evidence:
`evidence/07b/exportForm.dom.html`, `bundles/deobf/editor__hp-bim.js`.

### F6 — The File menu (observed live) — OBSERVED

Opened by clicking the top-bar **File** tool (`#hpToolFile`); the popover carries `id="hpFileMenu"`.
The full observed item set is quoted in F2. The canonical export format list and icons observed in
the code are:
project, pdf, ifc, glb, gltf, obj, stl, dxf, svg, csv, png. Evidence:
`evidence/06-file-menu.dom.html` (menu), `evidence/07b/exportForm.dom.html` (dialog),
`bundles/deobf/editor__hp-bim.js`. Screenshot: `evidence/06-file-menu.png`.

### F7 — Export dialog: formats, options and client-vs-server split — OBSERVED

A live export dialog (`#hpExportDialog`) lists each format as a radio card with an icon, a bold
name and a one-line description. Observed descriptions include:

| Format | UI label | Description shown |
|---|---|---|
| project | Project (.hpbim.json) | Complete editable project, reopen it here |
| pdf | PDF sheets | Plans, sections and elevations with title block |
| ifc | IFC 4 (BIM) | BIM exchange (Revit, ArchiCAD, BIMcollab…) |
| glb | GLB | Single-file 3D model (web, AR, Blender) |
| gltf | glTF | 3D model as .gltf + .bin + textures |
| obj | OBJ | Meshes and materials (.obj + .mtl) |
| stl | STL (3D print) | Solid mesh for 3D printing |
| dxf | DXF plan (CAD) | CAD plan of one level |
| svg | SVG plan | Vector plan of one level (rooms, dimensions) |
| csv | CSV schedule | Quantities and costs (spreadsheet) |
| png | PNG image | High resolution image of the view |

Options exposed per format (from the serializer and the dialog builder): file name; level / all
levels; selection only; terrain; vegetation & water; visible elements only; geometry compression
(none / Draco / Meshopt); texture handling (keep / same-format-smaller / WebP / JPEG) plus max
texture size (512 / 1024 / 2048 / 4096 / no limit) and a 40–100 % quality slider; "Single .zip
package"; PNG width presets up to 5120 px; IFC schema (IFC4 / IFC2X3 Coordination View 2.0) and a
cost-schedule toggle; and a PDF sheet builder (paper, scale incl. "Automatic (largest that fits)",
Cover / Floor plans / Sections A-A & B-B / four elevations with position sliders, title block
client / designer / registration, and per-sheet notes).

**Client vs server is signalled in the dialog footer.** For `pdf, ifc, dxf, svg, csv` the footer
shows a cloud icon and "Made on our server from a copy of the model; nothing is stored"; for the
others it shows a padlock and "Files are created in your browser." The server path is a single
`fetch("api/bim.php", {method:"POST", credentials:"same-origin"})` with a gzip body when the
payload exceeds 64 KB; it returns either JSON or a binary blob, and the download file name is read
from `Content-Disposition`. A 413 maps to `io.tooLarge` ("The model is too large to send
(25 MB)."). Observed extensions: `.hpbim.json`, `-sheets.pdf`, `.ifc`, `.glb`, `.gltf`, `.obj`,
`.stl`, `.dxf`, `-plan.svg`, `-schedule.csv`, `.png`. Evidence:
`evidence/07b/exportForm.dom.html`, `bundles/deobf/editor__hp-bim.js`.

### F8 — CSV / spreadsheet export — OBSERVED

Two paths exist: a server `csv` action producing `<name>-schedule.csv`
(`text/csv;charset=utf-8`), and a client-side workbook export using a spreadsheet library that
writes an `.xlsx` budget/QTO workbook with a "Budget" sheet plus a sheet per schedule, titled with
the project name and author "3D House Planner". Evidence: `bundles/deobf/editor__hp-bim.js`.

### F9 — Images and video — OBSERVED

- **PNG** export = "High resolution image of the view" with a width choice (observed code offers
  widths up to 5120 px, with a "4K" label at 4096).
- A separate **snapshot (4K)** action exists in the action bar.
- **Path-traced render** can be downloaded as `render-path-tracing.png`.
- **Video**: a camera tour can record `.webm` (`-tour.webm`, "the video downloads when the tour
  ends; keep this tab in front while it records"), plus a 60 s record action in the action bar.
- **AI photo** renders are produced via Puter.js and downloadable.

### F10 — Import: formats, drag-and-drop and options — OBSERVED

Import dialog (`hp-io-import`) groups: **Project** `.hpbim.json`; **IFC (BIM)** `.ifc`;
**3D models** `.glb .gltf .obj .stl .babylon`; **DXF plan: lines become walls** `.dxf`;
**Plan image to trace** `.png .jpg .webp`. The file input is `multiple` and the hint says several
files at once may be dropped (a `.gltf` with its `.bin` and textures, an `.obj` with its `.mtl`).
The canvas itself accepts drops ("Drop to import into the scene"). Options include an
**Import onto level** selector and a **DXF wall thickness (cm)** field (min 2, max 80, default from
the plan's default wall thickness) persisted to `localStorage["hp-io-import"]`. IFC, DXF, model and
image imports are all client-side in this dialog (footer note "Files are created in your browser").
Evidence: `bundles/deobf/editor__hp-bim.js`, `raw/app.php.html` (`io.fmt.*`, `io.dropHint`).

### F11 — Trace-over of floor-plan images — OBSERVED

An imported plan image becomes a `groundplan` mesh whose metadata carries
`planImport: {dataUrl, sourceName}`; the project serializer stores it as `plan` with
`{dataUrl, name, width, length, p, q, s, visible}`, i.e. position, rotation quaternion, scale and
visibility survive save/reload. The picker asks for the image's **real width and length**, so the
underlay is to scale before tracing. The image is read with `FileReader.readAsDataURL`. Evidence:
`bundles/deobf/editor__hp-bim.js`; UI copy `plan.width` / `plan.length`
("Image width/length in real scale") in `raw/app.php.html`.

### F12 — AI floor-plan converter (trace → walls) — OBSERVED

A separate module `editor/floorplan-ai-vectorizer` and a modal `modalplan` ("Bring in a floor
plan"): upload an image or generate one with AI, then run "AI floor plan converter" with options
**AI vision model**, **No AI (image analysis only)**, **Insert detected doors and windows**, and
**Apply wall and floor textures by room type**. Progress strings show a staged pipeline: preparing
the image, analysing on the server, detecting walls, reconstructing geometry, inserting doors and
windows. Failure copy covers "No walls detected in this floor plan" and "AI check unavailable,
walls detected from the image only". Evidence: `bundles/js/editor__floorplan-ai-vectorizer.js`,
`bundles/deobf/editor__hp-bim.js`, `raw/app.php.html` (`fpai.*`, `fx.fp.*`).

### F13 — Share view link (server-hosted, view-only) — OBSERVED

- Entered via File menu → **Share view link**; dialog `hpShareDialog` explains "Anyone with the
  link sees the project in 3D, without editing", "Only people with the link can see it".
- Publish posts the project to `api/share.php` (`Content-Type` from the blob) and returns
  `{url, expires, size}` plus a `key`. The key is sent back as the `X-HP-Share-Key` header on
  update/delete and is cached in `localStorage["hp-share-links"]` as `{id:{id,key,url,published,
  expires,size}}`.
- Opening: `app.php?share=<32-hex>` is detected in `location.search`; the page fetches
  `api/share.php?id=<id>` (`same-origin`, `cache:"no-store"`). 404 → `share.notFound`; a non
  `"hp-bim"` `format` → `bim.notProject`. The viewer adds a `hp-viewer` body class, shows
  "Shared project · view only" with **Save a copy to edit**, and strips `share=` from the URL on
  failure via `history.replaceState`.
- **Update / stale**: republishing updates the same link; the UI badges "Changes made since then
  are not in the link yet" until the change counter matches.
- **TTL / limits**: "The link stays active while it is opened at least once every 90 days. You can
  delete it at any time." and "Active until {date}, renewed at every view". Client code defaults a
  maximum size of `0x1400000` bytes ≈ 20 MiB (`share.tooLarge`) and handles HTTP 429
  (`share.tooMany`). A QR code is rendered to SVG with a QR library loaded from cdnjs
  (`qrcode-generator` 1.4.4) for the "QR code of the link" panel.
- Evidence: `bundles/deobf/editor__hp-share.js`, `bundles/deobf/editor__hp-bim.js`,
  `raw/app.php.html` (`share.*`).

### F14 — Print and PDF — OBSERVED

There is **no browser-print path for plans**. PDF is server-generated: `api/bim.php` action
`"sheets"` receives the geometry parts plus an optional cover image and returns
`application/pdf`, saved as `<name>-sheets.pdf`. The only `window.print()` in the code is used for
a standalone BIM schedule/QTO HTML table (opened in a popup and printed). Whether the generated
PDF is vector or raster was not verified. Evidence: `bundles/deobf/editor__hp-bim.js`.

### F15 — Free vs paid — DOCUMENTED + OBSERVED

- DOCUMENTED (landing page, https://www.3dhouseplanner.com/): "**100%** free, also for commercial
  use"; "No login", "Nothing to install", "Projects stay in your browser"; FAQ — "Yes. The app is
  free for personal and commercial use, with no login and no watermark. Donations help us keep
  improving it."; "Where are my projects saved? — Projects are saved in your own browser
  (IndexedDB) with automatic recovery. Nothing is uploaded to our servers, and you can export
  files at any time."
- OBSERVED: no subscription, licence check, watermark or feature gate in any shipped bundle. The
  only "credit" language is for third-party AI (Puter.js): `fx.aiCredits` "Your Puter AI credits
  are insufficient…", `render.ai.credits`. There is a donation dialog and a PayPal hosted button
  (`donate.*`, button id `WC26LEM8WMDQN` observed in the live DOM).
- INFERRED: the server-side export and share endpoints are the only vendor infrastructure that
  could later be rate-limited or gated; today the client treats their failures as transient
  (`io.serverDown`, `share.tooMany`) rather than as paywall prompts.

### F16 — Supporting architecture (context) — OBSERVED

Same-origin endpoints referenced by the client: `api/bim.php`, `api/share.php`, `api/ai.php`,
`api/house.php`, `api/i18n.php`, `api/terrain.php`, `api/ar.php`, `api/efficiency.php`, plus
`parsers/2dto3dfloorplanapi.php` and `parsers/search.php`. Third-party: `js.puter.com` (AI),
`cdnjs.cloudflare.com` (QR), Babylon.js runtimes and `cdn.jsdelivr.net`. The 2D planner is a
separate page (the "2D Planner" tool, `index3.php`) embedded as `#floorplanIframe` and driven
through a `contentWindow.FloorplanBridge` model-sync API (`setModel({walls, objects, rooms})`);
"Open the 2D planner once to export its SVG plan" (`io.svgUnavailable`) indicates the SVG plan is
built from 2D-planner vector data. Evidence: `bundles/deobf/*.js`, `raw/app.php.html`,
`raw/index3.php.html`, `evidence/03-editor-enter.dom.html`.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort, each tied to a finding. CasaPlazAI today: single-page Vite/TS/Three.js,
no backend, plan autosaves to localStorage, PNG/JPEG export only, single-workspace UI redesign in
progress, small furniture palette.

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Projects panel + Save as…/New/Open/Rename/Duplicate/Delete with thumbnails.** Keep the plan blobs in IndexedDB with a lightweight metadata index (id, name, updated, size, thumbnail, autosave) so listing never deserializes full plans. Reuses the existing localStorage/IDB story and gives users multiple plans. | High | Low–Med | F1, F2 |
| 2 | **Explicit autosave + crash recovery.** Keep a reserved draft record separate from the saved plan; on load, offer "Restore last session" if the draft is recent (3DHP uses 14 days). Add a `beforeunload` recovery write and a visible saved/unsaved dot. Prevents silent data loss — directly relevant since CasaPlazAI already autosaves to localStorage. | High | Low | F3 |
| 3 | **Versioned JSON project file (`.casaplan.json`) with envelope + import validation.** `{format, version, app, meta, settings, elements…}` so plans can be backed up, mailed and re-opened, and so future schema changes can migrate. Reject foreign JSON with a clear message. This is the single biggest portability gap versus 3DHP. | High | Low–Med | F4, F5 |
| 4 | **Collapse File actions into one "File" menu + Export dialog.** During the single-workspace redesign, group New / Open / Save / Save as / Import / Export / recent plans in one popover, and present formats as cards with a one-line description, a file-name field with a fixed extension suffix, and a footer saying where the file is produced. Cheap, high perceived polish. | High | Low | F6, F7 |
| 5 | **High-resolution view image export.** Add width presets (e.g. 1920 / 2560 / 3840 px, labelled "4K") plus PNG/JPEG choice and quality — an easy upgrade from today's fixed PNG/JPEG, and it matches what users expect for client presentations. | Med–High | Low | F9 |
| 6 | **Floor-plan underlay (trace-over).** Let users import a plan image, enter its real width/length to set scale, lock it under the grid, and snap walls to it; persist the underlay in the plan so it reloads. This is the most requested 2D feature and is pure client-side work in Three.js/canvas. | High | Med | F11 |
| 7 | **Vector plan export (SVG) + DXF of one level.** SVG for prints/marketing, DXF so a plan can be opened in CAD. Both are client-side generatable from the existing room/wall/opening geometry without a server. | Med–High | Med | F7, F16 |
| 8 | **Schedule / quantities CSV.** Export walls, floors, openings and furniture as a CSV/spreadsheet (areas, lengths, counts) — small, self-contained, and a differentiator for renovation users. | Med | Low–Med | F8 |
| 9 | **View-only share link (optional, needs a tiny backend or URL payload).** CasaPlazAI has no backend, so start with a compressed plan in the URL `#hash` for small plans (view-only mode + "Save a copy to edit"), and only add a minimal upload endpoint if plan size demands it. If added, mirror 3DHP's TTL wording and a size cap, and never block the local workflow on it. | High | High | F13 |
| 10 | **Multi-tab safety.** Listen to `storage`/DB version-change events and warn "another tab has this plan open" before overwriting, so two tabs cannot silently clobber each other's autosave. | Med | Low | F3 |

Lower priority for the current scope: AI floor-plan vectorisation (F12) depends on an external
vision model and credits, and client-side IFC/PDF generation (F7, F14) is a large effort whose
value for a no-backend app is lower than the items above.

---

## 4. Unknowns / what I could not verify

- **Server response payloads** for `api/bim.php` and `api/share.php` were not exercised (that
  would mean publishing a link or uploading a model). Their request shapes, headers, gzip rule,
  413/429 handling and `Content-Disposition` parsing are **OBSERVED** in client code, but the
  actual responses, output quality and the server-enforced size/TTL are **unverified**.
- **No generated export file was opened.** IFC/DXF/SVG/CSV/PDF correctness, unit conventions and
  whether the PDF is vector or raster are unknown.
- **Share TTL** ("90 days", renewed on view) comes from UI copy (`share.point.ttl`) only; the
  server-side expiry policy is unconfirmed. The size cap observed in client code is a default of
  ≈20 MiB and may be server-overridable.
- **AI floor-plan converter** was not run (external Puter.js vision model, credits required), so
  accuracy on real plan images is unknown.
- **The 2D planner iframe URL** is created dynamically and was not captured directly;
  `index3.php` is the standalone 2D Planner page, and the `FloorplanBridge` contract is inferred
  from the editor side.
- **Donation frequency / UX timing** (whether a donate nudge appears after N actions) was not
  measured.
- **Import of real IFC / DXF / GLB / OBJ / STL files** was not tested, so importer fidelity and
  the DXF "lines become walls" heuristic are unverified.
- **Exact browsable tier limits, if any** are not stated anywhere public; "free, no watermark" is
  vendor marketing plus the absence of gating code, not a contractual guarantee.
- The keyboard-shortcut catalogue (`ux.keys.*`) and the full PDF sheet layout algorithm were only
  partially read.

---

### Source index

- Vendor pages (DOCUMENTED): https://www.3dhouseplanner.com/ (landing, FAQ, "Save Your Work"),
  https://www.3dhouseplanner.com/app.php (editor shell + full i18n dictionary),
  https://www.3dhouseplanner.com/index3.php (2D Planner landing).
- Local evidence (OBSERVED): `raw/app.php.html`, `raw/index.php.html`, `raw/index3.php.html`;
  `bundles/js/*`, `bundles/deobf/*`; `evidence/01-baseline.*`, `evidence/03-editor-enter.*`,
  `evidence/04-key-bundles.json`, `evidence/06-file-menu.{json,png,dom.html}`,
  `evidence/07b/exportForm.dom.html`, `evidence/07b/*.png`; scenario inputs in `scenarios/`;
  local analyses in `tools/`.
