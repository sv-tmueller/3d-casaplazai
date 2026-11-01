# 3D House Planner — Autosave, crash recovery, versioning/migration, thumbnails, multi-project management

Round 2 · job `06-07b-save-export-share-autosave-r` · CasaPlazAI competitor research · 2026-10-31, 15:08–16:45 CET

Builds on round 1 (`rea-3dhouseplanner-2026-10/07-07-save-export-share/report.md`, reused read-only). Round 1
established the storage model, the File menu, `.hpbim.json`, export and share. This round goes deeper on
**autosave mechanics, crash recovery, document versioning/migration, thumbnail generation and multi-project
management**, and closes the round-1 gap "IndexedDB was never observed live".

**Method.** Round-1 bundles were re-read with local character-window extractors (`evidence/win.js`,
`evidence/grab.js`). Because a page's shipped bundle is minified and partly string-table obfuscated, the decisive
work was done live: `evidence/cdp.js` is an observation-only DevTools-protocol driver that launches the locally
installed Chrome headless (SwiftShader so WebGL works), loads the app, runs a list of page-side steps
(`evidence/steps-*.js`) and reports what the page itself exposes — `localStorage`/`sessionStorage`, IndexedDB
schema/stores/records, the page's own `HPBIM`/`HPUI`/`HP3D` APIs, WebGL, console and page errors. It can also
install an early hook (`evidence/hook2.js`) before any page script runs, which was needed to see fragments that
are removed before a later probe. Raw results: `evidence/1*.json` … `evidence/3*.json`.

Tags: **OBSERVED** (live page / shipped JS with an evidence file), **DOCUMENTED** (vendor docs), **INFERRED**.

---

## 1. Summary

- **Two-tier, browser-local storage.** Full `.hpbim.json` payloads live in IndexedDB `hp-bim` **v2** store
  `projects`, mirrored into a lightweight `index` store (`id/name/created/updated/thumbnail/size/autosave`).
  Listing reads only `index`, so it never deserializes plans. The **2D planner is a second, independent
  persistence stack** on `extension-floorplanner-*` `localStorage` keys. *OBSERVED*
- **Autosave = user toggle + trailing-edge debounce with a 30 s ceiling, not a fixed interval.** Marking dirty
  schedules a save 1 388 ms out, or immediately once the dirty period exceeds 30 s; a write happens only if the
  change counter moved. An autosave that runs within 60 s of the last capture reuses the old thumbnail. A real
  model event plus idle time *did* produce an automatic normal-record write, ~5 s out, in my run. *OBSERVED*
- **Crash recovery is real but has two mutually-exclusive entry points.** A reserved `__recovery__` record is
  written on `beforeunload` while dirty and by autosave while the project is unsaved; the startup scan offers a
  Restore toast only if the draft is **< 14 days** old and only when no `sessionStorage["hp-resume-after-reload"]`
  record exists. That session record (10-minute TTL, written by `prepareReload()` before a deliberate reload)
  **silently reopens the project and suppresses the toast** — which is exactly why my plain-reload attempts never
  saw it. Opening a recovery draft restores the original project identity but leaves the state *unsaved*. A normal
  save then **deletes** the draft. *OBSERVED*
- **Versioning is a hard-coded `version: 1` with no migration path.** The loader checks only
  `format === "hp-bim"`; a document declaring `version: 99` restored with `failed: 0`, came back as `version: 1`,
  and its **unknown top-level field was silently dropped**. Missing `settings`/`elements` also restored without
  error. Invalid `format` throws "This file is not a 3D House Planner project." *OBSERVED*
- **Thumbnails are a 320 px-wide JPEG snapshot of the live 3D canvas**, `toDataURL("image/jpeg", 0.7)`, stored as
  a `data:` URL in both stores; my 1600×1000 viewport produced **320×199, ~17 KB decoded (22 723-char string)**.
  Cards validate the `data:image/` prefix before rendering it and otherwise show a placeholder icon. *OBSERVED*

## 2. Findings

### F1 — IndexedDB schema and the `index` projection — OBSERVED

`indexedDB.open("hp-bim", 2)`. `onupgradeneeded` creates store `projects` (`keyPath:"id"`) and, if absent, store
`index` (`keyPath:"id"`), then back-fills `index` by cursor over every `projects` record using the projection

```
{ id, name, created, updated, thumbnail: t || null, size: s || 0, autosave: !!a }
```

The `data` payload is deliberately **not** copied into the index. `onversionchange` closes the handle and nulls
the cached promise; `onblocked` logs "hp-bim database upgrade blocked by another tab" and toasts `bim.dbBlocked`.
A missing `indexedDB` rejects with `bim.noStorage`.

Live confirmation (scenario 16, `evidence/16-save.json`): database `hp-bim` **version 2**, stores `index` and
`projects`, both `keyPath:"id"`, **no secondary indexes**. A co-resident `puter_cache` database (v1, stores
`expireTimes`, `store`) belongs to the third-party Puter AI SDK, not the planner.

`listProjects()` reads the whole `index` store, filters to `id === "__recovery__" || !id.startsWith("__")`, then
sorts by `updated` descending — reserved `__*` records are hidden from the panel while recovery stays addressable.
Evidence: `evidence/01-indexeddb.txt`, `evidence/16-save.json`, `evidence/07-listprojects.txt`.

### F2 — `save()` in detail — OBSERVED

`save(opts)` accepts `{asNew, quiet, auto, recovery, keepRecovery}`:

- In share-viewer mode it flips the document to editable, clears the `hp-viewer` body class, strips `share=` from
  the URL and forces `asNew` + `keepRecovery`.
- `{recovery:true}` writes **only** the `__recovery__` record:
  `{id:"__recovery__", ofId:<current id|null>, name, updated, created, size, data, autosave:true}`; errors toast
  `bim.recoveryFail`. Confirmed live: `save({recovery:true})` returned `"__recovery__"` (scenario 32).
- Otherwise: chip → *saving*; look the id up in `index`; if absent (record deleted elsewhere) mint a fresh
  `"p" + Date.now().toString(36) + Math.random().toString(36).slice(2,7)` and reset `created`.
- Thumbnail: `if (opts.auto && project.stored && Date.now() - lastThumbAt < 60000) skip` — autosaves within 60 s
  of the previous capture pass `thumbnail: undefined`, and the write helper then copies the old thumbnail from the
  `index` row when the new record has none.
- Write `{id, name, created, updated, thumbnail, size, data}`, mark stored, clear the partial flag, refresh the
  chip, toast `bim.saved` unless quiet, **delete `__recovery__` unless `keepRecovery`**, refresh the list.
- On failure: `bim.saveFail`, chip back to *unsaved*.

Evidence: `evidence/05-save.txt`, `evidence/04-thumbgen.txt`, `evidence/32-recid.json`, `evidence/33-lifecycle.json`.

### F3 — Autosave scheduling — OBSERVED

- **Enable flag** `localStorage["hp-bim-autosave"]`, read once at boot as `'0' !== getItem(...)` (default on); the
  Projects-panel checkbox writes `"1"`/`"0"`. It is consulted at fire time, so switching off takes effect at once.
- **Debounce:** `markDirty()` → `clearTimeout(t); if (!firstDirtyAt) firstDirtyAt = now;
  t = setTimeout(fire, now - firstDirtyAt > 30000 ? 0 : 1388)`. Rapid edits keep resetting the 1 388 ms timer; once
  the dirty period passes 30 s the next schedule fires immediately.
- **`fire()`** acts only if dirty **and** `changeSeq !== lastSavedSeq`; on success it advances `lastSavedSeq` so a
  no-op tick does not rewrite.
- **Triggers:** (a) the editor's own 3000 ms `setInterval` recomputes a cheap signature over
  `uniqueId:position:rotation:scaling` strings and calls `markDirty()` when it changes; (b) a model-event listener
  on `created/deleted/moved/material/terrain/imported/level` debounces ~400 ms (skipped while an import/restore is
  in flight); (c) canvas `pointerup` schedules at 500 ms.
- **Decision at fire time:** `autosaveEnabled && project.stored && !partial ? save({quiet:true, auto:true})
  : save({recovery:true})` — an unsaved project never auto-writes a normal record, only a recovery copy.

**Live results.** Scenario 34 (`evidence/34-autoreal.json`) is the positive case: after `save()` + emitting a
genuine model event, `changeSeq` went 0→1 and the chip showed *Unsaved changes*; after a further idle period of
~9 s the project's `index` row had been **rewritten automatically** (`ageMs ≈ 4000` at the end of the wait,
`autosave:false`, i.e. a real normal-record autosave, not a recovery copy). Scenario 17 (`evidence/17-autosave.json`)
is the negative control: a bare `markDirty()` with **no** model event left the row byte-identical for 9 s of idle
time. Both are OBSERVED; the trigger distinction (model-event path vs a manual dirty flag with no geometry change)
is INFERRED. What is certain from code plus runs: autosave is enabled by default, debounced, counter-gated, and it
writes.

### F4 — Crash recovery: the `__recovery__` draft — OBSERVED

- `beforeunload`: if dirty and not a viewer, fire `save({recovery:true})` (errors swallowed) and return a value so
  the browser shows its own leave prompt.
- Startup path: `listProjects()` → find the `__recovery__` row → if
  `Date.now() - row.updated < 0x48190800` (1 209 600 000 ms = **14 days**) append a
  `.hp-toast.hp-toast-action.hp-visible` with `bim.recover` ("A project from your last session was found.") and a
  `bim.recoverBtn` ("Restore") button; the toast auto-dismisses after `0x4e20` = **20 000 ms**.
- Restore calls `open("__recovery__")`. Live (scenario 24, `evidence/24-recovery5.json`): after seeding a fresh
  draft, `open("__recovery__")` returned `failed: 0`, the **project identity switched back to the draft's `ofId`**
  (`pmvwjdebmccslb`, the original project), the project name became the draft name, the chip showed *Unsaved
  changes* and `changeSeq` advanced to 1 — i.e. the draft is loaded but not yet committed.
- Age gate measured precisely: a draft seeded 15 days old reported `ageMs 1296000001`, `ageDays 15.00` against
  `maxDays 14` and `withinWindow: false` (scenario 24).
- Lifecycle completed in scenario 33 (`evidence/33-lifecycle.json`): after `save({recovery:true})` the `index` held
  a `__recovery__` row (`autosave:true`, `thumb:0`); a subsequent **normal** `save()` removed it, leaving only the
  real project rows. So drafts are cleaned up on successful save, exactly as coded.
- The recovery row is rendered in the Projects panel with a `⟲ ` prefix and gets no rename/duplicate buttons.
- The **toast itself was never caught on screen** (see Unknowns): the only appended `.hp-toast` fragment my early
  hook recorded in cold boots was the empty container itself. The 20 s timer and the 14-day gate are code-read and
  the gate arithmetic is confirmed; the branch is guarded by the condition in F5.

Evidence: `evidence/22-bootbranch.txt`, `evidence/18-boot.txt`, `evidence/21-recovery3.json`,
`evidence/24-recovery5.json`, `evidence/31-hook2read.json`, `evidence/33-lifecycle.json`.

### F5 — Reload resume vs crash recovery (`hp-resume-after-reload`) — OBSERVED

`prepareReload()` is the "about to reload this tab" hook. If the project is dirty it first writes a recovery copy,
then always writes

```
sessionStorage["hp-resume-after-reload"] = JSON.stringify({
  at: Date.now(), settings: {floorHeight, floorSize, units, name},
  id, projectId, stored, created })
```

On next boot that record is accepted only if `id` is present and `Date.now() - at < 0x927c0` = **600 000 ms =
10 minutes**; it is consumed (`removeItem`) and the project re-opens with `noResize`. When its id is `__reopen__`
the record is deleted after use.

Live confirmation (`evidence/17-autosave.json`): after `prepareReload()` the key held
`{"at":…,"settings":{"floorHeight":2.65,"floorSize":100,"units":"m","name":""},"id":"__recovery__","projectId":"pmvwhyfoqjjl4p","stored":true,"created":…}`
and `index` gained a `__recovery__` row with `autosave:true`.

**The boot branch is `if (resume) { open(resume.id, {noResize:true}) } else { listProjects(); recovery toast }`**
(`evidence/22-bootbranch.txt`) — the two mechanisms are mutually exclusive, so a plain reload restores silently and
**never shows the Restore toast**. The toast is therefore for a genuinely cold start (new tab, crashed tab, or a
later session). `__reopen__` serves the same idea for a project that must survive a reload triggered by a
terrain-size change or an import.

Evidence: `evidence/22-bootbranch.txt`, `evidence/18-boot.txt`, `evidence/12-reopen.txt`, `evidence/17-autosave.json`.

### F6 — Versioning and migration: format gate only — OBSERVED

Serialization emits `format:"hp-bim"`, `version: 1`, `app:"3D House Planner"` (live `serialize()` keys, scenario 16:
`format, version, app, meta, settings, camera, levels, levelInfo, site, norms, sun, tour, measures, efficiency,
classification, ifc, types, budget, elements, terrain, plan, georef, check, sync`). The only gate on load is
`if (!data || data.format !== "hp-bim") throw`, whose string was observed live as
"This file is not a 3D House Planner project." (scenario 19).

**There is no `version` comparison anywhere.** Grepping the shipped `hp-bim` bundle for `migrat*`, `legacy*`,
`upgradeFrom`, `schemaVersion`, `formatVersion` returns nothing (re-confirmed against the *currently shipped*
bundle fetched from inside the page, scenario 28: `hasMigrate:false`, `hasSchemaVersion:false`,
`versionLiteral: "version':0x1"`).

Live probe (scenario 19, `evidence/19-recovery.json`): take a serialized project, set `version = 99`, set the name,
add an unknown top-level `futureField`, then `restore()`. Result: `failed: 0`; the re-serialized document had
`version: 1`, the new name, and **no `futureField`** (24 keys instead of 25). Deleting `settings` and `elements`
also restored with `failed: 0`. Consequences:

- a **newer** document is not rejected — it is accepted and quietly re-stamped version 1 (forward-compat data loss);
- unknown fields vanish because the loader rebuilds the document field by field through the scene rather than
  merging the parsed object;
- a missing settings/elements block does not throw.

The only migration-shaped behaviour is a **terrain-size guard**: if the stored `settings.floorSize` differs from the
current editor's by more than 0.5, the app asks `bim.confirmResize` ("This project was made on a {size} terrain. The
page reloads to rebuild the terrain at that size, then the project opens. Reload now?"); on accept it stashes the
project under `__reopen__` plus the session resume record and calls `location.reload()`.

Evidence: `evidence/04-thumbgen.txt`, `evidence/03-thumbnail.txt`, `evidence/19-recovery.json`,
`evidence/28-shipped.json`, `raw/app.php.html` i18n.

### F7 — Thumbnail generation — OBSERVED

```
canvas = HP3D.canvas
c = document.createElement("canvas")
c.width  = 320
c.height = round(320 * canvas.height / max(1, canvas.width))
HP3D.scene.render()
c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height)
lastThumbAt = Date.now()
c.toDataURL("image/jpeg", 0.7)     // null on any exception
```

A 4:3 viewport therefore gives 320×240; my 1600×1000 viewport gave **320×199** and a `data:image/jpeg;base64,…`
string of **22 723 characters ≈ 17.0 KB decoded**, measured by loading the data URL into an `Image` (scenario 19).
Autosaves within 60 s reuse the stored thumbnail (F2); the duplicate path copies the source row's thumbnail
verbatim rather than re-rendering (F8).

Presentation: the card tests `/^data:image\//` before emitting `<img src>`, else renders a `.hp-thumb-empty` house
icon; each card shows a locale-short date/time and `max(1, round(size/1024))` KB. Confirmed live: saved project rows
carry a 22 723-char thumbnail while a `__recovery__` row has `thumb:0` (scenarios 16, 24, 33).

Evidence: `evidence/04-thumbgen.txt`, `evidence/19-recovery.json`, `evidence/11-projmgmt2.txt`, `evidence/33-lifecycle.json`.

### F8 — Multi-project management — OBSERVED

Project ids are local: `"p" + Date.now().toString(36) + Math.random().toString(36).slice(2,7)`. The Projects panel
(`bim.recent` "Projects in this browser"; empty state `bim.noProjects`; footer `bim.storage` "Stored in this browser
only (IndexedDB) – export a project file to keep a copy.") offers:

| Action | `data-act` | Behaviour |
|---|---|---|
| Open | `open` | If dirty, `bim.confirmOpen`, then `open(id)` |
| Rename | `renameproject` | Inline prompt; rewrites `meta.name` **and** row `name`, recomputes `size`, puts both stores |
| Duplicate | `dupproject` | Parse JSON, new `meta.id`, `meta.name` = `bim.copyName` ("{name} (copy)"), new `created`/`updated`, **thumbnail copied from the source row** |
| Delete | `delproject` | `bim.confirmDelete` (danger); deletes from **both** stores; if the deleted id is live, it is marked not stored |
| Save / Save as… / New | `data-fileact` | `save()` / prompt → `save({asNew:true})` / `bim.confirmNew` → `newProject()` |

`newProject()` resets the scene, clears the 2D bridge with `setModel({walls:[],objects:[],rooms:[]})`, mints a fresh
id, sets the name to `""`, marks *unsaved*, and emits `projectCleared`. There is **no cap** on project count, no
cross-project search and no export-all.

Live confirmation (scenario 33): three project rows coexisted in `index`; renaming/creating rows reuses the same
22 723-char thumbnail; `listProjects()` returned the ordered rows.

Evidence: `evidence/11-projmgmt2.txt`, `evidence/10-projmgmt.txt`, `evidence/07-listprojects.txt`,
`evidence/16-save.json`, `evidence/33-lifecycle.json`.

### F9 — Multi-tab and storage-failure UX — OBSERVED

- `onversionchange` closes the DB handle; `onblocked` toasts `bim.dbBlocked` ("Projects stay unavailable while
  another tab of the planner (older version) is open: close it or reload it.").
- **No `storage` event listener was found**, so two tabs of the *same* version do not warn each other; the guard
  only bites when the DB version must change.
- Failure strings: `bim.noStorage`, `bim.saveFail`, `bim.storageFail`, `bim.recoveryFail`, `bim.notFound`.
- No quota-exceeded handling was found in the editor bundle (contrast the 2D planner's `dlg.storageFull`).

Evidence: `evidence/01-indexeddb.txt`, `evidence/05-save.txt`, `raw/app.php.html`.

### F10 — The 2D planner is a second, separate persistence stack — OBSERVED

`2D-Planner/index.php` (fetched live into `evidence/2dplanner.html`) is a standalone page whose modules are served
via `js.php?f=planner/…` and **403 to direct fetch** (hotlink protection); it loads only inside the app. Its UI
keeps its own `extension-floorplanner-*` `localStorage` keys. Live evidence (scenario 25,
`evidence/25-history.json`): the editor embeds it as `#floorplanIframe` with `src="2D-Planner/index.php?lang=en"`
(756×469, same-origin); after it initialised, `localStorage` held
`extension-floorplanner-currently-editing = "true"` and, in the earlier save scenario, a large
`extension-floorplanner-history` array of `{objData, wallData, roomData}` snapshots. `FloorplanBridge` exists in the
**iframe's** window (`parent.FloorplanBridge` is undefined), so the editor drives it through `contentWindow`.

Its menus are Save / Save as… / New plan / Saved plans / Delete this plan / Clear plan / Import–export project
(.json), with `settings.autosave` "Auto-save" and `settings.autosaveHint` "Automatically save each change you make."
and `dlg.storageFull` "The browser storage is full: export your plan or delete old plans so you do not lose work."

Implication: 3DHP keeps the 2D plan (walls/objects/rooms) and the 3D BIM project in **two independent stores**, synced
at runtime through a bridge rather than one document.

Evidence: `evidence/2dplanner.html`, `evidence/25-history.json`, round-1 `F16`.

### F11 — Entry-flow quirk — OBSERVED

Requesting `https://www.3dhouseplanner.com/app.php` in a fresh profile **redirects to `index.php`**; the editor is
reached by clicking the landing page's primary link, after which `app.php` stays put. INFERRED: a session/cookie gate
on the shell.

Evidence: `evidence/13-app-baseline.json` (final URL `…/index.php`, no `HP*` globals),
`evidence/15-editor-wait.json`.

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort, each tied to a finding and to the CasaPlazAI schema where relevant. CasaPlazAI today:
Vite/TS single page, no backend, plan autosaves to `localStorage`, PNG/JPEG export, `FloorplanData` v1 with
`schemaVersion`, a real `migrate.ts`/`validate.ts`, multiple floors, and separate editor-local keys
(`casaplaza.snap.settings.v1`, `casaplaza.underlay.v1`).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Split storage into `projects` + an `index` projection.** Persist each floorplan's `FloorplanData` under its own id and keep a small metadata row (`id`, `name`, `updated`, `size`, `thumbnail`, `autosave`). Listing then never deserializes plans — worth more for CasaPlazAI than for 3DHP because plans are multi-floor. Add a reserved `__recovery__` id. | High | Low–Med | F1, F8 |
| 2 | **Trailing-edge autosave with a ceiling, not a fixed interval.** Debounce edits ~1–1.5 s but fire immediately once the dirty period passes ~30 s; skip the write when the change counter has not advanced; suppress the toast for automatic saves; keep a cheap periodic signature poll to catch edits that bypass your model events. This removes both the write-per-keystroke and the "lost the last 5 s" failure. | High | Low | F3 |
| 3 | **Reject *newer* documents explicitly and stop dropping unknown fields.** CasaPlazAI already has `future-version` in `migrate.ts`; 3DHP does not — it accepts `version: 99`, re-stamps it 1 and silently discards unknown top-level keys, which is forward-compat data loss. Keep the strict gate, surface the code, and diff unknown keys so additive data survives a round trip. | High | Low | F6 |
| 4 | **320 px JPEG thumbnail captured at save time, stored in the index row only.** Render one frame, draw the canvas into a 320-px-wide 2D canvas, `toDataURL("image/jpeg", 0.7)`; skip regeneration within 60 s of the last capture; copy the previous thumbnail forward on autosave. Cheap, and it makes a projects list feel real. | Med–High | Low | F7 |
| 5 | **Separate the two recovery paths and label them.** (a) `beforeunload` writes a `__recovery__` draft when dirty; a **cold** start offers "Restore last session" if the draft is younger than a bounded window (3DHP: 14 days). (b) A deliberate reload hands off through `sessionStorage` with a short TTL (3DHP: 10 min) and reopens silently. 3DHP lets (b) suppress (a), which is why its recovery is hard to reason about — decide and document the precedence. | High | Med | F4, F5 |
| 6 | **Confirm a plan-size/settings mismatch instead of silently reinterpreting.** 3DHP compares stored vs current `floorSize` and only then offers "reload to rebuild the terrain". Do the analogue for grid pitch and wall-height defaults: if a stored plan's assumptions differ from the editor's current settings, ask before reinterpreting geometry. | Med | Low | F6 |
| 7 | **Index-only fast paths for rename/duplicate/delete.** Rename should rewrite the small row, not the whole plan; duplicate should copy the thumbnail rather than re-render; delete removes payload and index row in one transaction. | Med | Low | F8 |
| 8 | **Handle quota exhaustion explicitly.** 3DHP's editor has no quota path (its 2D planner does: "The browser storage is full: export your plan or delete old plans so you do not lose work."). With multi-project IndexedDB storage, catch `QuotaExceededError` and offer export/delete instead of a generic failure toast. | Med | Low | F9, F10 |
| 9 | **Keep one source of truth.** 3DHP splits the 2D plan (planner `localStorage`) from the 3D project (IndexedDB) and bridges them at runtime — two histories, two autosaves, two failure modes. CasaPlazAI's schema is deliberately one `FloorplanData`; keep it, and treat editor-only state (snap, underlay) as durable keys that are explicitly non-exported, as the schema doc already ratifies. | Med | Low | F10 |
| 10 | **Multi-tab guard that works for same-version tabs.** 3DHP only warns when the DB version changes; two same-version tabs can clobber each other. Add a `BroadcastChannel`/`storage` lease per plan id and warn before a second tab autosaves over the first. | Med | Low–Med | F9 |

## 4. Unknowns

- **The Restore toast was never observed on screen.** Its markup, the 14-day gate and the 20 s auto-dismiss are
  read from shipped code; the gate arithmetic was confirmed by seeding a 15-day draft (`withinWindow:false`). My
  cold-boot runs (fresh profile, and a persistent profile with `__recovery__` seeded and
  `hp-resume-after-reload` cleared) captured only the empty `.hp-toasts` container and no append. Because the live
  bundle reads its string table through a decoder, I could not statically prove the guard evaluated true, so I
  cannot rule out that a further session/URL condition also gates the toast. **Treat the on-screen toast as
  code-read, not observed.**
- **Real crash drafts.** `beforeunload` does not fire on SIGKILL, so whether a hard crash leaves a usable
  `__recovery__` draft was not tested.
- **The 2D planner's own persistence** is read from `localStorage` residue and its UI strings; its modules 403 to
  direct fetch, so its autosave cadence, version fields and plan format are unverified, and `FloorplanBridge` is
  still only described from the editor side plus key names.
- **Partial-restore path** (`bim.partialNote`, `bim.restoreFailed`, `bim.confirmPartialSave`) was not triggered:
  forcing element-restore failures needs real geometry, which this synthetic run did not build.
- **Real geometry end-to-end** was not exercised: per-project sizes with rooms/furniture, thumbnail quality with a
  populated scene, autosave cadence under sustained editing and the 60 s thumbnail-reuse rule are inferred from code
  plus the small runs above.
- Sharing (`app.php?share=`) interacting with `__recovery__`/`__reopen__` was not exercised (that would mean
  publishing a link — out of scope by the rules).
- Whether the editor uses `sessionStorage` beyond `hp-resume-after-reload` was not exhaustively proven.

### Source index

- Round 1 (read-only): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/07-07-save-export-share/` —
  `report.md`, `bundles/deobf/editor__hp-bim.js`, `bundles/deobf/editor__hp-share.js`, `raw/app.php.html`.
- Live observations (this job, all in `evidence/`): `13-app-baseline.json`, `15-editor-wait.json`,
  `16-save.json`, `17-autosave.json`, `19-recovery.json`, `21-recovery3.json`, `24-recovery5.json`,
  `25-history.json`, `28-shipped.json`, `31-hook2read.json`, `32-recid.json`, `33-lifecycle.json`,
  `34-autoreal.json`, `2dplanner.html`.
- Extractors and drivers: `evidence/win.js`, `evidence/grab.js`, `evidence/cdp.js`, `evidence/hook2.js`,
  `evidence/steps-*.js`.
- Vendor pages: <https://www.3dhouseplanner.com/>, <https://www.3dhouseplanner.com/app.php>,
  <https://www.3dhouseplanner.com/2D-Planner/index.php>
