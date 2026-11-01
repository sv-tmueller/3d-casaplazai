# Sweet Home 3D — Release History (last 5 major releases) and the 7.6.1 SourceForge release

Round 2 competitor research for **CasaPlazAI** (single-page web 2D/3D floorplanner, TypeScript/Three.js, no backend).
Job folder: `02-01b-feature-inventory-version-hi`. Research date: **2026-10-31**.
Round-1 report reused read-only: `~/dsh-workspaces/rea-sweethome3d-2026-10/01-01-feature-inventory/report.md`.

**Question:** history of the last 5 major releases of Sweet Home 3D, and the 7.6.1 SourceForge release (what changed, who publishes it).

**Claim tags**
- `OBSERVED` — seen directly on a live page / in a feed / in a shipped file now saved as evidence in this folder.
- `DOCUMENTED` — stated by a vendor-controlled document (official version history, vendor update manifest, SourceForge project pages, vendor download page, store listing).
- `INFERRED` — my reasoning from the above.

**Round-1 gaps this closes**
- Round 1: *"Version 7.6.1 is unexplained … the 7.6.1 feature deltas are unverified. This is the single biggest gap."* → Now **resolved**: the 7.6.1 `README.TXT` and the official update manifest are recovered (SourceForge renders the README inline on the release-folder page; `SweetHome3DUpdates.xml` carries a `SweetHome3D#SourceForge` 7.6.1 entry).
- Round 1: *"No release notes for anything after 7.5.2 on the site."* → **Confirmed and explained**: 7.6.1 is documented only on SourceForge (release-folder README + SourceForge news post + update manifest), never on sweethome3d.com's history page or blog.

---

## 1. Summary

- **The last five *major* releases are 7.5, 7.4, 7.3, 7.2 and 7.1** (only one patch-level release sits in that window, 7.5.2, on 2024-08-29). Dates: 7.5 — 2024-08-21; 7.4 — 2024-05-30; 7.3 — 2024-04-04; 7.2 — 2023-09-22; 7.1 — 2023-03-03. The next release after the window is **7.6.1**, a content/onboarding update rather than a feature release. `OBSERVED` (`txt/history.en.txt`).
- **7.5 is the ownership break-point**: the 7.5 blog post (2024-08-21) announces that **Space Mushrooms**, a ~20-person Italian software company (Milan, founded 2021 by Andrea Terdich, Daniel Zanchi and Filippo Bozzoli Parasacchi), took over the project from original author **Emmanuel Puybaret** (eTeks), under GPL. `DOCUMENTED` (`txt/blog-7.5.txt`).
- **The 7.6.1 SourceForge release (published 2026-10-20 16:35 UTC)** is a **content release, not a feature release**: it adds **78 new 3D models to the default furniture catalog, with a new "Exterior" category**, adds **a short first-launch presentation of the main features** and **a link to the "full" (paid) version**. `DOCUMENTED` — `README.TXT` (recovered via the SourceForge release-folder page, `txt/sf761-README-and-folder.txt`) and `SweetHome3DUpdates.xml`.
- **7.6.1 is a split release.** The official update manifest defines it as its own channel `SweetHome3D#SourceForge` with **only Windows and macOS** installers; the manifest's own comment says *"its own parent update keeps Linux, JAR, portable and Java Web Start users on 7.5."* `OBSERVED` (`raw/dl-SweetHome3DUpdates_xml.txt`). Consequently Linux/JAR/portable/Java-Web-Start users are still on 7.5 and the site footer, version-history page, download page and the JS browser edition all still say **7.5 / 7.5.2**. `OBSERVED`.
- **Who publishes it:** the GPL desktop release is published on the **Sweet Home 3D SourceForge project** (project owners: `puybaret` + `space-mushrooms`); the files are uploaded by the project's *"Sweet Home 3D"* account and announced by **Filippo Bozzoli Parasacchi** (Space Mushrooms). Branding: *"© Copyright 2026 Space Mushrooms"*. The separate paid apps are published by **"AI Photo Editor Lab SRL"** (Apple) / **"Space Mushrooms"** (Microsoft Store). `OBSERVED` (`raw/dl-feed.txt`, `raw/sf-news-761.html`, store APIs).

---

## 2. Findings

### 2.1 Release timeline and who owns the project

| Version | Date | Type | Headline |
|---|---|---|---|
| **7.6.1** | 2026-10-20 | SourceForge-only content release | 78 new default-catalog models + new **Exterior** category; first-launch feature tour; "full version" link. Windows + macOS only. |
| **7.5.2** | 2024-08-29 | patch (JS only) | Fixed a JS / JS-Viewer / JS-Online bug that prevented showing a home in some browsers. |
| **7.5** | 2024-08-21 | major | Bug fixes; **copyright notices changed after Space Mushrooms took over**; Furniture Library Editor 2.2 alongside. |
| **7.4** | 2024-05-30 | major | Fix regression from 7.2 (elevation of furniture rotated about a horizontal axis); multi-monitor detach/attach fixes; CSV fix for empty description/license. |
| **7.3** | 2024-04-04 | major | Mirroring/mirrored-group fixes; plug-in menu handling; Windows file-dialog fix; **category + multi-word catalog search in JS Online**; macOS dropped from the *portable* build. |
| **7.2** | 2023-09-22 | major (feature-heavy) | Modify-dimensions dialog, dimensions in 3D, elevation dimensions, **selection & editing in 3D view** preference, **shelf magnetism** (`shelfElevations`, `shelfBoxes`), user-defined furniture properties, preset postures, **multi-level printing**; JS gains server/IndexedDB/localStorage storage with IndexedDB auto-recovery and a deployable JSP/PHP JS Editor. |
| **7.1** | 2023-03-03 | major | Furniture **description** field; catalogue tooltips show it; Java 3D/JOGL driver fixes; Portuguese (Portugal) vs Brazilian split; JARs double-clickable on Java ≥16. |
| 7.0.2 | 2022-07-31 | patch | Import-wizard layout, transparent-room rendering, SVG room transparency, joined-wall fixes. |
| 7.0 | 2022-07-13 | major | **YafaRay renderer** at the two best photo/video qualities; materials picked in the 3D preview; levels submenu; **Flat ceiling only**; new units Inch/Fraction and Foot/Decimals; toolbar magnetism toggle. |

`OBSERVED`/`DOCUMENTED` — official history page `https://www.sweethome3d.com/history/` (`raw/history.html`, `txt/history.en.txt`; German page `raw/history.de.html` agrees on every date) plus the blog posts `raw/blog-sweet-home-3d-7-{0,1,2,3,4}-update.html` and `raw/blog-75.html`.

**Project ownership trail** `OBSERVED`/`DOCUMENTED`:
- The version history explicitly says under 7.5: *"Changed copyright notices after Space Mushrooms taking over Sweet Home 3D project."*
- The 7.5 blog post carries Space Mushrooms' introduction and Puybaret's hand-over note (*"After 19 years spent on the development of this amazing project … it's probably time for me to try new things, but I will remain around to ensure the best transfer ever"*).
- SourceForge project page: *"Brought to you by: [puybaret] and [space-mushrooms]"*; footer *"© Copyright 2026 Space Mushrooms — All rights reserved"*; site distributed *"under GNU General Public License"*.
- Puybaret is still active in the SourceForge ticket tracker as of 2026 (e.g. comments on tickets #1360, #566, #1280, #66 in the 2026 activity feed) `OBSERVED` (`raw/dl-feed.txt`).

**Patch/paid-version note:** there is **no 7.5.1, 7.5.3–7.5.11 etc. on SourceForge** for the free desktop app; those numbers belong to the paid store builds. Apple's `itunes.apple.com/lookup` reports the **Mac** app at **7.6.6 (2026-04-18)** and the **iOS** app at **7.5.11 (2025-10-23)**, both under seller *"AI Photo Editor Lab SRL"* `OBSERVED` (`raw/itunes-669289700.json`, `raw/itunes-1178963471.json`). The Mac App Store version-history feed shows a fast cadence (7.5.1 → 7.6.6 across 2024-08 → 2026-04, ~25 entries) `OBSERVED` (`raw/mas-mac.html`).

### 2.2 The 7.6.1 SourceForge release — what actually changed (round-1 gap closed)

SourceForge renders the 714-byte `README.TXT` inline on the release-folder page, which is why the release text is recoverable even though the raw download is Cloudflare-gated. The page states `OBSERVED` (`raw/sf761-folder.html` → `txt/sf761-README-and-folder.txt`):

> *"These installers are useful to run Sweet Home 3D version 7.6.1 … This new version of Sweet Home 3D brings **78 new 3D models in the default furniture catalog, a short presentation of its main features at first launch, and a link to Sweet Home 3D full version**."*

The SourceForge news post (announced 2026-10-20 16:51 UTC by **Filippo Bozzoli Parasacchi**, user `space-mushrooms`) says `DOCUMENTED` (`https://sourceforge.net/p/sweethome3d/news/2026/10/sweet-home-3d-version-761--released---/`):

> *"The version 7.6.1 includes now **100 new 3D furniture models and a new exterior models category**."*

The official updater manifest `https://www.sweethome3d.com/SweetHome3DUpdates.xml` independently says `OBSERVED` (`raw/dl-SweetHome3DUpdates_xml.txt`):

> `<update id="SweetHome3D#SourceForge" version="7.6.1" date="2026-10-20">` … *"Sweet Home 3D **7.6.1** brings **78 new 3D models in the default furniture catalog, with a new Exterior category**."*

**Reconciling 78 vs 100** `INFERRED`: the manifest/README count describes the *default* catalog shipped inside the installer (78 new); the news-post count (100) likely includes the new **Exterior** models delivered as a separate downloadable model library (`SweetHome3D-models/3DModels-*` on SourceForge). I verified the **web-facing** default catalog `libjs/resources/DefaultFurnitureCatalog.json` is **unchanged at 94 model entries in 8 categories, no "Exterior" category** `OBSERVED` (`raw/v761-DefaultFurnitureCatalog.json`) — identical to the copy round 1 saved. So the 78/100 models are distributed with the desktop installers/library, not via the web catalogue.

**Artifacts and exact metadata of the release** `OBSERVED` (`raw/sf-rss.xml`, `raw/sf761-folder.html`):

| File | Modified (UTC) | Size | MD5 |
|---|---|---|---|
| `SweetHome3D-7.6.1/README.TXT` | 2026-10-20 16:43 | 714 B | `b625d3224773a44b8a3a43619e1d3ef1` |
| `SweetHome3D-7.6.1/SweetHome3D-7.6.1-windows.exe` | 2026-10-20 16:36 | 122,383,112 B | `8a77cd101c5b71f6350ecaa49e2df3b1` |
| `SweetHome3D-7.6.1/SweetHome3D-7.6.1-macosx.dmg` | 2026-10-20 16:35 | 122,476,463 B | `1cbf818ce96a17a84c91f092a98de5a9` |
| `SweetHome3D-source/SweetHome3D-7.6.1-src/SweetHome3D-7.6.1-src.zip` | 2026-10-20 16:22 estimate | 90.1 MB | — |

- Installer descriptions on the folder page: the Windows exe is *"an installer for 32-bit and 64-bit Windows bundled with private Java and OpenJDK runtimes"*; the DMG contains the app *"bundled with a private OpenJDK runtime able to run on Intel Mac OS X 10.9 to 26 and on ARM macOS 11 to 26."* `DOCUMENTED`.
- **Source is still published under GPL** (`SweetHome3D-7.6.1-src.zip`, 90.1 MB). `OBSERVED`.
- Installer size jumped from ~84.9 MB (7.5 Windows) to ~122.4 MB (7.6.1) — consistent with bundling many more models. `OBSERVED`, `INFERRED` for the cause.
- Weekly download counts at capture: 13,378 for the 7.6.1 release folder vs 11,719 for 7.5 — the new release is already being downloaded more than the old one. `OBSERVED`.

### 2.3 7.6.1 is a split release: who gets it, who does not

`SweetHome3DUpdates.xml` (fetched live, `raw/dl-SweetHome3DUpdates_xml.txt`) is the clearest statement of intent. It contains **two parallel update trees**:

- `SweetHome3D#JavaWebStart version="7.5"` → inherited by `SweetHome3D#ExecutableJar`, `SweetHome3D#Installer` (Windows/macOS/Linux), `SweetHome3D#Portable`.
- `SweetHome3D#SourceForge version="7.6.1" date="2026-10-20"` → inherited only by **two** `SweetHome3D#Installer` entries with `operatingSystem="Windows.*"` and `operatingSystem="Mac OS X"`.

The manifest even carries an explanatory comment `DOCUMENTED`:

> *"Sweet Home 3D 7.6.1 released on SourceForge for Windows and macOS only: its own parent update keeps Linux, JAR, portable and Java Web Start users on 7.5."*

Consequences I verified `OBSERVED`:
- **Website still says 7.5**: every page footer reads *"Sweet Home 3D® version 7.5 — Last update: May 5, 2025"* (`raw/features.html`, `raw/download.en.html`, `raw/home.de.html`). The **history page still ends at 7.5.2 (2024-08-29)**; there is no 7.6.x entry (`txt/history.en.txt`).
- **Download page still offers 7.5**: it links `SweetHome3D-7.5-…` installers and says *"all the released versions up to the current version 7.5"*; the embedded JS still points Linux users at `…/SweetHome3D-7.5/`. `OBSERVED`.
- **No WordPress blog post for 7.6.x**: the `/blog/tag/version/` archive’s newest release post is still 7.5 (2024-08-21); the October 2026 blog archive contains only marketing posts (Oct 12–16 2026); `/blog/sweet-home-3d-7-6-update/`, `…-7-6-1-update/` and `…-version-7-6-1-released/` all return **404** `OBSERVED` (`raw/blog-tag-version.html`, `raw/blog-2026-10.html`).
- **There is no 7.6.0** on SourceForge for the desktop app; the free-desktop version series jumps 7.5 → 7.6.1 (the 7.6.x numbers belong to the paid Mac build). `OBSERVED`, `INFERRED`.
- SourceForge's own **"Download Latest Version"** button still points at `SweetHome3D-7.5.jar (47.4 MB)`, even though the newest folder is 7.6.1 `OBSERVED` — a structural quirk: the `.jar` build is part of the older 7.5 tree, so "latest" is computed from the latest *file* pattern, not the newest folder.

**The browser/JS edition did NOT move to 7.6.x** `OBSERVED`:
- `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` still loads every script with `?version=7.5.2` (`core.min.js`, `geom.min.js`, `swingundo.min.js`, `triangulator.min.js`, `graphics2d.min.js`, `recorderworker.min.js?version=7.5.2a`, `sweethome3d.min.js`) — `raw/v761-SweetHome3DJSOnline.jsp`.
- `libjs/resources/DefaultFurnitureCatalog.json` is byte-for-byte the same 94-model / 8-category catalog as round 1 captured, `Copyright (c) 2024 Space Mushrooms`, and contains **no Exterior category** (`raw/v761-DefaultFurnitureCatalog.json`).
- `libjs/sweethome3d.min.js` (2.6 MB) contains no new version banner; its 7.6/7.7/7.8 substrings are all inside time-zone coordinate tables, OBJ material data and unit constants, not version markers `OBSERVED`.

### 2.4 Who publishes it — precise answer

| Question | Answer | Tag |
|---|---|---|
| Which account uploaded the files? | The SourceForge project account **"Sweet Home 3D"** (activity items read *"Sweet Home 3D released /SweetHome3D/SweetHome3D-7.6.1/…"*). | `OBSERVED` (`raw/dl-feed.txt`) |
| Who announced it? | **Filippo Bozzoli Parasacchi**, SF user `space-mushrooms`, one of Space Mushrooms' three founders. Posted 2026-10-20 in *"Sweet Home 3D News"*, label `3d models`. | `DOCUMENTED` |
| Who owns the project now? | SourceForge lists **both `puybaret` (original author, eTeks) and `space-mushrooms`** as "brought to you by". Puybaret is still answering tickets in 2026. | `OBSERVED` |
| Copyright / branding | Site footer *"© Copyright 2026 Space Mushrooms — All rights reserved"*; GPL-2.0 distribution. | `OBSERVED` |
| Paid editions (different publisher) | Mac App Store + iOS seller **"AI Photo Editor Lab SRL"**; Microsoft Store publisher **"Space Mushrooms"**, Microsoft Store `LastUpdateDateUtc 2026-10-29`, publisher copyright field `© 2024 AI Photo Editor Lab`. | `OBSERVED` |
| Is it still open source? | Yes — `SweetHome3D-7.6.1-src.zip` (90.1 MB) is published alongside the binaries. | `OBSERVED` |

### 2.5 What 7.6.1 does *not* contain (feature deltas)

I found **no evidence of any code/feature change** in 7.6.1 beyond the catalogue and onboarding additions. Evidence: the release README lists only three changes (models, first-launch presentation, full-version link); the update manifest repeats only the models; the official history page has no 7.6.x entry; no 7.6.x blog post exists; and the web JS bundles are still stamped 7.5.2. `OBSERVED` + `INFERRED` (absence of evidence).

**Relevance to CasaPlazAI:** the whole payload of the newest release of a 19-year-old competitor is *content + onboarding*. That is a strong signal that for a mature floorplanner, catalog breadth and first-run guidance — not new geometry tools — are what sustain releases.

### 2.6 Evidence and method

- All raw pages/feeds/JSON are in `raw/`; plain-text extractions are in `txt/`. See the evidence index at the end.
- Blocked or failed probes (recorded for honesty): `best_release.json` and `/rest/p/sweethome3d` return **403**; `downloads.sourceforge.net` returns a **Cloudflare "Just a moment"** challenge for `README.TXT` and all tested mirrors (`master.dl`, `phoenixnap.dl`) return **403**; `sourceforge.net/p/sweethome3d/news/` and `…/bugs/1359/` return **403** to `curl` but succeed through the fetch tool / are irrelevant. The winning route for release text was the **release-folder HTML page** (`https://sourceforge.net/projects/sweethome3d/files/SweetHome3D/SweetHome3D-7.6.1/`), which embeds the README, plus the **project activity feed** and **SweetHome3DUpdates.xml**.
- No `rea` deep-capture was needed for this question; a single `curl`/fetch pass over vendor-controlled HTTPS endpoints answered it. (Round 1 already established the web-app capture problems and this question is documentary.)

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranking = user value to a single-page, localStorage-first floorplanner ÷ implementation effort. Each item is tied to a finding above and, where relevant, to the CasaPlazAI `FloorplanData` schema (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Finding | Value | Effort |
|---|---|---|---|---|
| 1 | **Ship a "What's new" card on first run, keyed to a build version stored in localStorage.** Compare a `casaplaza.build.version` key against the running build; if it changed, show a short modal naming the additions (new furniture types, new catalog items, new tools). Sweet Home 3D's newest release ships *"a short presentation of its main features at first launch"* — same idea, cheaper, and it makes every deploy feel like a release without new code. | §2.2 | High | Low |
| 2 | **Treat the furniture palette as versioned *data*, not code.** SH3D's 7.6.1 payload is 78 new models plus an "Exterior" category, delivered as catalog/library data. CasaPlazAI's `FurnitureItem.type` is a closed 7-value enum (`bed/sofa/table/chair/counter/bathtub/toilet`). Add a **`catalogId` + optional `catalogVersion`** on `FurnitureItem`, and keep the enum for *behaviour* (collision/fit) while new models ride a data catalogue. New models then stop requiring a schema migration at all. | §2.2, §2.5; schema `FurnitureItem` | High | Medium |
| 3 | **Separate app version from schema version explicitly in the UI.** SH3D's confusion (site 7.5, history 7.5.2, SourceForge 7.6.1, Mac 7.6.6, iOS 7.5.11, JS 7.5.2) is exactly what a single-deliverable SPA can avoid. Surface `SCHEMA_VERSION` in an About panel next to the build version and label autosaves with both. Consumers already reject newer payloads with `future-version`; make that visible ("this plan was made with a newer CasaPlazAI"). | §2.3, §2.4; schema `schemaVersion` / `migrate.ts` | High | Low |
| 4 | **Never let a release be half-shipped: one source of truth for the version constant.** SH3D's 7.6.1 is Windows/macOS only; Linux/JAR/portable stay on 7.5 and the website still advertises 7.5. Derive the displayed version from `package.json` at build time, assert it in CI, and include it in the exported PNG/JPEG metadata so a plan can always be traced to the build that made it. | §2.3 | High | Low |
| 5 | **Recovery-aware autosave (migrate-on-load, never lose a plan).** SH3D 7.2 added server/IndexedDB/localStorage storage with **auto recovery**, and 7.5.2 was a JS-only fix to *"a bug which prevented displaying a home in some browsers."* CasaPlazAI autosaves to localStorage: on load, if the snapshot fails validation, run `migrate()`, and if that fails with `future-version` or a `roof-*`/`*-out-of-range` code, keep the raw payload under a recovery key and offer "open read-only / export JSON" rather than silently discarding. This directly protects the schema's additive-evolution promise. | §2.1 (7.2, 7.5.2); schema migration hook & error codes | High | Medium |
| 6 | **Publish an in-app build/updater manifest for the PWA.** SH3D uses `SweetHome3DUpdates.xml` to let installed copies self-update per OS and to carry release comments. A no-backend SPA can ship a static `release.json` (build, date, highlights) that the service worker revalidates; if it differs, show item #1. Cheap and gives offline users a controlled upgrade path. | §2.3 | Medium | Low |
| 7 | **Keep a real, dated version-history page.** SH3D's history page is a first-class artifact (68 dated entries back to 2009) and the only reason I could reconstruct this timeline. CasaPlazAI should keep `CHANGELOG.md` in the repo *and* render it at a `/changelog` route, one entry per shipped schema/app version. | §2.1, §2.6 | Medium | Low |
| 8 | **Use "catalogue growth" as the release lever, but make categories data-driven.** If/when new furniture types arrive (garden/outdoor, stairs), prefer a `category` string on the catalog item over widening the `type` enum — mirroring SH3D's move to an *Exterior* category without a file-format change. Protects the frozen interchange contract in `casaplazai-schema.md`. | §2.2; schema `unknown-furniture-type` | Medium | Medium |
| 9 | **A single, explicit "full version" upsell hook — never in the middle of editing.** SH3D's 7.6.1 adds *"a link to Sweet Home 3D full version"* at first launch. If CasaPlazAI ever monetises, the same pattern (one link at first run + one in About) beats feature gates that block core drawing. | §2.2 | Medium | Low |
| 10 | **Bundle weight budget as a release gate.** 7.6.1's installers grew ~44% (84.9 MB → 122.4 MB) purely from models, and round 1 showed the online JS app could not finish booting in a 300 s capture. CasaPlazAI is a web app: cap the initial bundle, lazy-load catalog assets behind the tool card, and track the number in CI as a versioned metric. | §2.2, §2.5; round-1 §2.15 | High | Medium |
| 11 | **Cross-check competitor release claims against the artifact, not the marketing page.** The 7.6.1 case shows a vendor release that is real but absent from the vendor's own history page, and whose stated counts disagree (78 vs 100). Any CasaPlazAI competitive dashboard should pin claims to a source URL + retrieval date (as `sources.json` here does). | §2.2, §2.3 | Low | Low |

**Cross-cutting takeaway `INFERRED`:** Sweet Home 3D's *release process* is weaker than its product — split channels, stale website, two publishers, three version series. CasaPlazAI's one-deliverable web SPA can turn that into a trust advantage (idea #3/#4) while copying the parts that clearly work: content-driven releases (#2/#8) and first-run guidance (#1).

---

## 4. Unknowns

- **Code-level deltas of 7.6.1 are unverified.** I recovered the release README, the update manifest and the news post — all three mention only catalogue/onboarding changes. I did **not** download or diff the 90.1 MB source ZIP (over budget and unnecessary), so any non-catalogue code changes are unproven. Absence of a 7.6.x history entry strongly suggests there were none. `INFERRED`.
- **78 vs 100 new models is unresolved.** README + update manifest say 78 default-catalog models with a new *Exterior* category; the SourceForge news post says 100 models. I could not enumerate either set (the desktop catalogue is inside the installers; SourceForge raw downloads are Cloudflare-gated).
- **No 7.6.0 exists in the free-desktop SourceForge tree**, but I cannot rule out internal/paid 7.6.0 builds. The paid Mac app is at 7.6.6, so a 7.6.0 almost certainly shipped in the App Store line first. `INFERRED`.
- **The website's 7.5 vs SourceForge 7.6.1 drift may be intentional or stale.** The update manifest separates channels deliberately (Windows/macOS only), but the download page, footer and history page have not been refreshed since May 2025; whether Space Mushrooms plans to back-port 7.6.x to Linux/JAR or to publish 7.6.x history is unknown.
- **Whether the browser/JS edition will ever be bumped past 7.5.2 is unknown.** At capture it is still 7.5.2 with an unchanged 94-model catalogue and no Exterior category. For CasaPlazAI, which is itself a browser-only product, the JS edition is the relevant benchmark and it now trails the desktop free build by two releases.
- **No official "7.6.1 release date" statement exists on sweethome3d.com.** The 2026-10-20 date comes from SourceForge file timestamps and the update manifest, not a vendor-dated release note.
- **Roadmap is unknown.** Round 1's lists of blog/plug-in activity suggest Space Mushrooms is currently investing in content marketing (many Oct 2026 posts) and paid-store model packs rather than new desktop geometry features. That is an inference from publication dates, not a stated plan.
- **Legal/scope note.** Sweet Home 3D is GPL-2.0. No source code was copied into this report; everything is behaviour, release metadata and data-model description. Evidence files are retained only to substantiate claims.

---

### Evidence index (files in this job folder)

- `report.md` (this file), `sources.json`
- `raw/history.html`, `raw/history.de.html` → `txt/history.en.txt`, `txt/history.de.txt` (official version history)
- `raw/blog-75.html` → `txt/blog-7.5.txt` (Space Mushrooms takeover)
- `raw/blog-sweet-home-3d-7-{0,1,2,3,4}-update.html` (release blog posts 7.0–7.4)
- `raw/blog-tag-version.html` → `txt/blog-tag-version.txt`; `raw/blog-2026-10.html` → `txt/blog-2026-10.txt` (proof there is no 7.6.x blog post)
- `raw/dl-SweetHome3DUpdates_xml.txt` → `txt/SweetHome3DUpdates.txt` (**7.6.1 update manifest: 78 models, Exterior category, Windows/macOS-only channel**)
- `raw/sf761-folder.html` → `txt/sf761-README-and-folder.txt` (**7.6.1 README text, file sizes, dates, descriptions**)
- `raw/sf-rss.xml`, `raw/sf-parent-folder.html`, `raw/sf-rss-models.xml` (403 capture) → SourceForge version listing and file metadata
- `raw/mas-mac.html`, `raw/itunes-669289700.json`, `raw/itunes-1178963471.json`, `raw/ms-store.json` → paid-store versions and publishers
- `raw/dl-feed.txt` (project activity feed: uploader + announcement author), `raw/sf-news-761.html` / Fetch-tool capture of the 7.6.1 news post
- `raw/download.en.html`, `raw/download.html` → `txt/download.en.txt` (site still advertises 7.5; free vs full model counts)
- `raw/features.html`, `raw/home.de.html` (footer still 7.5)
- `raw/v761-SweetHome3DJSOnline.jsp`, `raw/v761-sweethome3d.min.js`, `raw/v761-DefaultFurnitureCatalog.json`, `raw/v761-localization.json` (JS edition still 7.5.2; catalogue unchanged)
- `raw/post-sitemap.xml`, `raw/post-sitemap2.xml`, `raw/page-sitemap.xml` (no 7.6.x blog URL)
- `raw/sf-news.html` (403 capture), `raw/best-release.json` / `raw/sf-project.json` (403 captures) — recorded blocked probes
