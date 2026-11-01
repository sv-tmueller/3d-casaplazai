# Sweet Home 3D (web build) — persistence deep-dive

**Recorders · IndexedDB / localStorage URLContents · AutoRecoveryManager · server endpoints**

Round 2 of the Sweet Home 3D competitor research for **CasaPlazAI** — a single-page TypeScript/Three.js 2D/3D floorplanner whose plan autosaves to localStorage and which has *no backend*.

| | |
|---|---|
| Job folder | `~/dsh-workspaces/rea2-sh3d-p1/07-02c-online-version-bundle-persis` |
| Round-1 report (read-only, reused) | `~/dsh-workspaces/rea-sweethome3d-2026-10/02-02-online-version-bundle/report.md` + its `bundle/`, `evidence/` |
| Target | `https://www.sweethome3d.com/SweetHome3DJSOnline.jsp` (anonymous demo) and the registered backend under `https://www.sweethome3d.com/online/` |
| Version analysed | **7.5.2** (bundle banner + live `application.getVersion()`) |
| Date | 2026-10-31, 15:10–16:5x CET |
| Licence | Sweet Home 3D is **GPL-2.0-or-later** (© Space Mushrooms / Emmanuel Puybaret). Server JSP sources fetched from SourceForge SVN are the same licence. No code is copied here; only behaviour, data models, URL grammars and identifier names are described. |
| Rules honoured | no account, no login, no registration, no purchase, no POST to the production server, no personal data. All production probes were plain `GET`s. |

Tag legend:

| Tag | Meaning |
|---|---|
| **OBSERVED** | I read it in a file / live page / live browser session in this job folder, or in the round-1 evidence folder. Evidence path or URL given. |
| **DOCUMENTED** | Stated by the vendor in site text, manual, FAQ, changelog or a developer forum post. |
| **INFERRED** | My reasoning over observed facts; not directly proven. |

---

## 1. Summary (5 bullets)

- The web build has **four independent persistence paths**, selected purely by which URLs are present in the `applicationParams` configuration object: (a) a **generic `URLContent` abstraction** with `localstorage://`, `indexeddb://`, `blob:` and HTTP back-ends; (b) the **`HomeRecorder` family** (`HomeRecorder`, `DirectHomeRecorder`, `IncrementalHomeRecorder`) that turns a home into a ZIP and writes it through that abstraction; (c) the **`AutoRecoveryManager`**, which runs a `DirectHomeRecorder` against a dedicated `indexeddb://SweetHome3DJS/Recovery` object store; (d) **server JSPs** (`readHome`, `writeHomeEdits`, `writeResource`, preferences) used only by the registered edition. **OBSERVED**
- The anonymous page `SweetHome3DJSOnline.jsp` ships a configuration containing **only catalog URLs** — no `readHomeURL`, no `writeHomeEditsURL`, no `autoRecovery` — so it instantiates the *bare* `HomeRecorder`, never creates an `AutoRecoveryManager`, and demonstrably writes **nothing** to localStorage or IndexedDB (only a Firebase `user_pseudo_id` remains). Loading the demo, editing, and reloading loses everything. **OBSERVED** (live Playwright probe) / **DOCUMENTED** (vendor alert text)
- The recovery machinery is real but is **gated on `configuration.autoRecovery && configuration.writeHomeEditsURL === undefined`** — i.e. it belongs to the *direct-recorder* (offline/file) deployment, **not** to the incremental server deployment (the JSP README says explicitly "Auto recovery not available for incremental recorder"). I proved the whole loop works when invoked manually: one row per home in object store `Recovery` of database `SweetHome3DJS`, keyPath `name`, fields `name | content(Blob, application/zip, 8 685 B) | date(ms)`, carrying a valid ZIP whose `Home.xml` is the plan. **OBSERVED**
- The write pipeline is **deliberately pluggable and cheap to mirror**: `URLContent.writeBlob(<url template>, key, observer)` parses the scheme, then either `localStorage.setItem(key, "data:<mime>;base64,…")`, or an IndexedDB `put({name, content, date})` (creating DB/store/keyPath lazily), or an XHR `POST`. URL grammar: `indexeddb://<db>/<store>?keyPathField=name&contentField=content&dateField=date&<extraField>=<value>` to write, `indexeddb://<db>/<store>/<contentField>?<keyPathField>=<key>` to read. **OBSERVED**
- What CasaPlazAI should take from this, ranked: an **explicit `schemaVersion`-aware recovery store with a visible `[Recovered]` state and a "use the recovered version?" prompt**; **debounced autosave that skips work when nothing changed**; **content-addressed resource dedupe** (SHA-1 digests so a texture used twice is serialised once); and a **quota-aware wrapper that degrades to "download the file" instead of silently failing**. All four map onto the existing `FloorplanData` schema and the current editor-local keys. **INFERRED**

---

## 2. Findings

### 2.1 The four persistence layers at a glance

**OBSERVED** in `evidence/sweethome3d.min.js` (7.5.2), `evidence/recorderworker.min.js`, `evidence/src-jsp-web/trunk-SweetHome3DJS/src/*.js`, and the live page `evidence/live-online-en.html`.

| Layer | Type / class (JS) | Java identity | Role |
|---|---|---|---|
| Storage abstraction | `URLContent` → `SimpleURLContent`, `HomeURLContent`, `LocalURLContent` → `BlobURLContent`, `LocalStorageURLContent`, `IndexedDBURLContent` | `com.eteks.sweethome3d.tools.*` | one uniform "give me a Blob / write this Blob" API over `localstorage://`, `indexeddb://`, `blob:`, `http(s)://`, `jar:` |
| Home (de)serialisation | `HomeRecorder` (+ `XMLWriter`, `HomeXMLHandler`, `HomeXMLExporter`, `SAXParser`, JSZip) | `com.eteks.sweethome3d.io.*` | home ⇄ ZIP containing `Home.xml` |
| Recorders | `HomeRecorder` (read-only), `DirectHomeRecorder` (full write), `IncrementalHomeRecorder` (edit stream) | `com.eteks.sweethome3d.io.*` | choose *where* the plan goes and *how much* of it |
| Recovery | `AutoRecoveryManager` + inner `AutoRecoveryRecorder` (subclass of `DirectHomeRecorder`) | `com.eteks.sweethome3d.SweetHome3DJSApplication` (inner) | timer-driven snapshot of modified, unsaved-by-file homes into IndexedDB |
| Preferences | `RecordedUserPreferences` / `DefaultUserPreferences` | `com.eteks.sweethome3d.io.*` | possibly-server JSON of user settings (separate from the plan) |
| Resource dedupe | `ContentDigestManager` | `com.eteks.sweethome3d.io.ContentDigestManager` | SHA-1 (fallback SHA-256) content digests so identical textures/blobs are stored once |
| Off-thread save | Blob-URL `Worker` built from `#recorder-worker` (`recorderworker.min.js`) | — | ZIP generation without blocking the UI |
| Offline HTTP cache | Service worker `resourceCache.js` + Cache API `RESOURCE_CACHE` | — | caches `/online/readResource.jsp?...` responses only |

Round 1 established the general architecture; this report goes into the persistence mechanics.

### 2.2 `URLContent`: the storage abstraction, exactly

**OBSERVED**, `evidence/recorderworker.min.js` (classes `URLContent`, `LocalURLContent`, `BlobURLContent`, `LocalStorageURLContent`, `IndexedDBURLContent`) and `evidence/src-jsp-web/trunk-SweetHome3DJS/src/URLContent.js`.

Class shapes (all present, 100 % confirmed in the live bundle too — see §2.10):

- `URLContent.fromURL(url)` is a **factory with a cache** keyed by URL; it dispatches on the prefix to `LocalStorageURLContent`, `IndexedDBURLContent`, or plain `URLContent`. It also rewrites `http(s)://` URLs whose host differs from the script host only in the `www.` or port, so the app keeps working from a mirror.
- `LocalURLContent` (abstract) adds `savedContent` — a pointer to where the blob was last persisted — and the single, central write method `writeBlob(writeBlobUrlTemplate, blobName, observer)`.
- `BlobURLContent` wraps an in-memory `Blob` (used both for freshly exported ZIPs and for canvas `toBlob` images).
- `LocalStorageURLContent.LOCAL_STORAGE_PREFIX = "localstorage://"`; `IndexedDBURLContent.INDEXED_DB_PREFIX = "indexeddb://"`.

**Write path** — `LocalURLContent.prototype.writeBlob(urlTemplate, blobName, observer)` **OBSERVED**:

1. Resolve the blob of `this`.
2. Substitute `blobName` into the template after `CoreTools.format` (the `%s` convention; several args allowed).
3. Branch on the resulting URL:
   - `localstorage://<key>` → the blob is base64-encoded by a `FileReader.readAsDataURL` (`convertBlobToBase64`) and stored with `localStorage.setItem(key, "data:<mime>;base64,<…>")`. **Every value in `localstorage://` is therefore ≥ 4/3 the byte size of the blob.**
   - `indexeddb://<db>/<store>?keyPathField=…&contentField=…&dateField=…&<extra>=<value>` → parse fields, open `<db>` (create DB and object store with `keyPath` lazily, bumping `version + 1` when the store is missing), then `store.put(record)` where `record[keyPathField] = key`, `record[contentField] = <Blob>`, `record[dateField] = Date.now()`, plus any extra `*Field`-less parameters (e.g. nothing else here).
   - anything else → `XMLHttpRequest POST` to the URL with the raw blob body.
4. On success the observer's `blobSaved(content, blobName)` fires; on failure `blobError(code, message)`.

**Read path**:

- `LocalStorageURLContent.getBlob` reads the key, splits `data:<mime>;base64,<payload>` at the first `;` and `,`, `atob`s the payload into a `Uint8Array`, builds a `Blob`, and caches a `blobUrl` via `URL.createObjectURL`. It then creates and revokes object URLs — a leak-prone pattern worth avoiding. Missing key ⇒ `urlError(1, "No key '<k>' in localStorage")`. **OBSERVED**
- `IndexedDBURLContent.getBlob` parses `indexeddb://<db>/<store>/<contentField>?<keyPathField>=<key>`, opens the DB, `store.get(key)`, assigns `blob = row[contentField]`, and **copies every other row field onto the Blob object as ad-hoc properties** (`blob[name]`, `blob[date]`). Missing key ⇒ `blobError(-1, "Blob with key <k> not found")`. This "fields travel on the Blob" trick is how the auto-recovery reader can show a `date`. **OBSERVED**

**Live verification** (Playwright, `evidence/live-persist-probe4.json`):

| Probe | Result |
|---|---|
| write → read via `URLContent.fromURL('localstorage://probe-read')` | class `LocalStorageURLContent`, 13 bytes, text `HELLO-PERSIST`, raw value `data:application/octet-stream;base64,SEV…` |
| write → read via `indexeddb://probeDB/probeStore/content?name=entry-a` | class `IndexedDBURLContent`, 11 bytes, text `IDB-PAYLOAD` |
| URL grammar parse of the four canonical shapes | `indexeddb://SweetHome3DJS/Recovery/content?name=Home.sh3x.recovered` → db `SweetHome3DJS`, store `Recovery`, contentField `content`, keyField `name`, key `Home.sh3x.recovered` |

Two gotchas found live: (a) `LocalURLContent.prototype.getStreamURL` **throws `UnsupportedOperationException`** by design — only subclasses implement it; calling it on the base class is an error, not a fallback. (b) The write grammar is *order-sensitive*: the parser assumes `…/store?keyPathField=…&contentField=…&dateField=…&name=…`, and only strips parameters whose name ends in `Field`. **OBSERVED**

### 2.3 The `HomeRecorder` family: which recorder you get, and why

**OBSERVED** `evidence/src-jsp-web/trunk-SweetHome3DJS/src/SweetHome3DJSApplication.js` (lines 540–648) and its minified twin.

`SweetHome3DJSApplication.getHomeRecorder()` is a pure configuration dispatch:

| Configuration | Recorder instantiated | Writes to |
|---|---|---|
| `readHomeURL === undefined` | `HomeRecorder` (base) | nowhere — read-only, can still read from an arbitrary URL/ZIP |
| `readHomeURL` defined, `writeHomeEditsURL === undefined` | `DirectHomeRecorder` | `writeHomeURL` (whole `.sh3x`/`.sh3d` ZIP) + `writeResourceURL` (blobs) |
| `readHomeURL` + `writeHomeEditsURL` defined | `IncrementalHomeRecorder` | edit stream to `writeHomeEditsURL` (+ resources) |

Documented in the constructor JSDoc (**OBSERVED**): *"If `writeHomeEditsURL` and `readHomeURL` are missing, application recorder will be an instance of `HomeRecorder`. If `writeHomeEditsURL` is missing, application recorder will be an instance of `DirectHomeRecorder`. Auto recovery not available for incremental recorder."*

The **anonymous demo never sets any of these**, so it gets `HomeRecorder` — the read-only one. Live confirmation (`evidence/live-persist-probe4.json`, stage `B-hasEdits-type`): `constructor.name === "HomeRecorder"`, `typeof rec.hasEdits === "undefined"`, `typeof rec.deleteHome === "undefined"`. Only `readHome`, `writeHome`, the ZIP helpers and `searchContents` exist on it.

`DirectHomeRecorder` adds:

- `readHome(url, observer)` — if `readHomeURL` is set, formats it with the home name and appends `&editionId=<home-…uuid>`. Live-observed URL: `https://example.invalid/online/readHome.jsp?home=my-home.sh3x&editionId=home-5a7354d5-…`. **OBSERVED**
- `writeHome(home, name, observer)` — collects local-only contents, optionally uploads them through `saveContents`, builds a ZIP (`writeHomeToZip`), wraps it in a `BlobURLContent`, then `writeBlob(configuration.writeHomeURL, name, …)`.
- `saveContents` / per-resource `writeBlob(configuration.writeResourceURL, <uuid>.<png|jpg|dat>, …)`. Note the special case for `/Recovery` object stores: an object stored *inside* a recovery store is not re-uploaded into a non-recovery store and vice versa; the string `"/Recovery"` is hard-coded as the discriminator, overridable by `configuration.autoRecoveryObjectstore`. **OBSERVED**
- `getAvailableHomes(observer)` — `listHomesURL` branch: `localstorage://<regexp>` enumerates `localStorage` keys with `Object.getOwnPropertyNames(localStorage)` and matches the (unescaped part of the) URL against them, returning the first capture group or the whole key; `indexeddb://<db>/<store>?<keyPathField>=<regexp>` opens a cursor. HTTP branch: plain `GET` with `&requestId=<uuid>` appended.
- `deleteHome(name, observer)` — `localstorage://` ⇒ `localStorage.removeItem`; `indexeddb://` ⇒ `store.delete(key)`; HTTP ⇒ `GET` with `&requestId=<uuid>`.

`IncrementalHomeRecorder` (see §2.9) adds `addHome`/`removeHome`, an undo-edit listener, `storeEdit`, `scheduleWrite`, `sendUndoableEdits`, `hasEdits`, plus a `pingURL` liveness poll every **10 000 ms**.

### 2.4 `AutoRecoveryManager` — the crash-recovery store, in full

**OBSERVED** `evidence/sweethome3d.min.js` (function `AutoRecoveryManager`, ~offset 2 613 099) and the readable original `evidence/src-jsp-web/trunk-SweetHome3DJS/src/SweetHome3DJSApplication.js` lines 680–934.

**Gate.** Created only when `configuration.autoRecovery` is truthy **and** `configuration.writeHomeEditsURL === undefined`; construction is deferred with `setTimeout`. On the live anonymous page `typeof window.application.autoRecoveryManager === "undefined"` (**OBSERVED**, `evidence/live-persist-probe5.json` / `probe3.json`). Defaults are database `SweetHome3DJS`, object store `Recovery`, overridable via `configuration.autoRecoveryDatabase` / `configuration.autoRecoveryObjectstore`.

**URL base and recorder config.** `autoRecoveryDatabaseUrlBase = "indexeddb://" + db + "/" + store`, and the inner `AutoRecoveryRecorder` is a `DirectHomeRecorder` with (verbatim shapes read from the live object, `evidence/live-recovery-loop.json` stage `A-recovery-loop`):

```
readHomeURL     indexeddb://SweetHome3DJS/Recovery/content?name=%s.recovered
writeHomeURL    indexeddb://SweetHome3DJS/Recovery?keyPathField=name&contentField=content&dateField=date&name=%s.recovered
readResourceURL indexeddb://SweetHome3DJS/Recovery/content?name=%s
writeResourceURL indexeddb://SweetHome3DJS/Recovery?keyPathField=name&contentField=content&dateField=date&name=%s
listHomesURL    indexeddb://SweetHome3DJS/Recovery?name=(.*).recovered
deleteHomeURL   indexeddb://SweetHome3DJS/Recovery?name=%s.recovered
writeHomeWithWorker  true
```

The `.recovered` suffix is the whole "is this a recovery snapshot?" marker. Note `writeHomeWithWorker: true` — recovery snapshots are always zipped **off the main thread** (see §2.5).

**Key path and record shape.** The store is created with `keyPath: "name"`; each snapshot is one record:

```
{ name: "<home name>.recovered", content: Blob(application/zip, ~8.7 kB for the Studio demo),
  date: <Date.now() epoch ms> }
```

Live proof (`evidence/live-recovery-loop.json`): after `saveRecoveredHomes()` the store contained `count: 1`, key `recovery-loop-test.sh3x.recovered`, `content: blob(8685)`, `date: number`; magic bytes `50 4b 03 04` ⇒ a real ZIP; `application.getHomes()[0]` re-read from that blob through the recorder's own `readHome` returned the same home. A second tab opening the page sees `SweetHome3DJS v1` in `indexedDB.databases()` — the database **persists across page loads**, which is the entire point. **OBSERVED**

**Timer.** `restartTimer()` is called on construction and whenever the preference `AUTO_SAVE_DELAY_FOR_RECOVERY` changes. It `setInterval`s at `getAutoSaveDelayForRecovery()` ms and, inside the tick, only calls `saveRecoveredHomes()` when `Date.now() - lastAutoSaveTime > 5000` — a 5 s minimum re-save spacing on top of the configured interval. `0` disables the timer entirely. `lastAutoSaveTime` is monotonic (`Math.max`). **OBSERVED**

**What gets saved.** For every open home: if `name != null` and `isModified()` ⇒ `writeHome(home, name)`; if the home is *not* modified and is not in `recoveredHomeNames`, its snapshot is **deleted**. So the store tracks "unsaved work" rather than history. **OBSERVED**

**Startup recovery flow** (homes listener, `ADD`):

1. `autoSaveRecorder.getAvailableHomes()` lists `*.recovered` names.
2. If a stored name matches the new home's name (comparison strips either `.sh3x`- or `.sh3d`-style extension via the two localised `FileContentManager.homeExtension*` strings), it either asks the user — `confirm(localized("SweetHome3DJSApplication","confirmRecoverHome"))` — or proceeds silently when `configuration.silentAutoRecovery` is set.
3. On accept, the recovered home is read, `setRecovered(true)`, the freshly-opened home is closed, and the recovered home is added. If the user declines, the snapshot is deleted.
4. `RECOVERED`/`MODIFIED`/`NAME` property listeners keep `recoveredHomeNames` and the store consistent: un-modifying a recovered home deletes its snapshot after a **1 000 ms** grace (comment: user may be stepping through undo/redo); renaming moves the snapshot.

**Localised UX strings** (**OBSERVED** in the vendor-served bundle `evidence/raw/localization.json`, `localization_de.json`, `localization_fr.json`):

| Key | EN |
|---|---|
| `HomeFramePane.recovered` | `[Recovered]` (DE `[Wiederhergestellt]`) |
| `SweetHome3DJSApplication.confirmRecoverHome` | "The document wasn't saved during the last edition. Do you prefer to use the recovered version?" |
| `UserPreferencesPanel.autoSaveDelayForRecoveryCheckBox.text` | "Save home data for recovery every:" |
| `UserPreferencesPanel.autoSaveDelayForRecoveryUnitLabel.text` | "minutes" |

**Default delay.** The base `UserPreferences` field defaults to `0` (disabled) and `DefaultUserPreferences` explicitly does `setAutoSaveDelayForRecovery(60000)` ⇒ **60 000 ms**. `RecordedUserPreferences` parses the persisted value with `parseInt`, with the `DefaultUserPreferences` value as fallback. Live: `getAutoSaveDelayForRecovery() === 60000`. The preference panel labels the unit "minutes" while the getter documents "a delay in milliseconds"; I did **not** locate the ÷/× 60 conversion in the web bundle (the preferences panel is a desktop-port view class and appears not to be shipped in the minified web build). **OBSERVED** for the values; **INFERRED** that the web build exposes no UI for this setting.

**Cleanup.** `deleteRecoveredHome(name)` deletes the row and, when `recoveredHomeNames` becomes empty, runs a second pass with `listHomesURL = base + "?name=.*"` and `deleteHomeURL = base + "?name=%s"` to purge **any** leftover rows in the store — including orphaned resource rows. **OBSERVED**

### 2.5 Off-thread ZIP generation (`recorderworker.min.js`)

**OBSERVED** `evidence/recorderworker.min.js`, `evidence/src-jsp-web/trunk-SweetHome3DJS/src/HomeRecorder.js` lines ~640–720, and the live page.

- `HomeRecorder.writeHomeToZip` (when `configuration.writeHomeWithWorker` is true and the browser isn't IE) lazily creates a `Worker` from an inline **Blob** whose source is a short bootstrap string:

  ```
  importScripts('<scriptFolder>/jszip.min.js');
  importScripts(<src of <script id="recorder-worker">>);
  onmessage = function(ev){ new HomeRecorder(ev.data.recorderConfiguration).generateHomeZip(...); postMessage(...); };
  ```

- The `<script src="/libjs/recorderworker.min.js?version=7.5.2a" id="recorder-worker">` tag is present in the live page; the worker file defines `URLContent`, `LocalStorageURLContent`, `IndexedDBURLContent`, `BlobURLContent`, `SimpleURLContent`, `HomeURLContent`, `ZIPTools` and `HomeRecorder` (it is a **standalone bundle**, not just a worker shim). The main bundle, by contrast, only carries a *reference* to `#recorder-worker`; `grep` shows **zero** occurrences of `localstorage://` and one of `indexeddb://` in `sweethome3d.min.js`, but the worker re-declares both prefixes. **OBSERVED**
- Message contract: `postMessage({recorderConfiguration, homeXmlEntry, homeContents, homeContentTypes, savedContentNames, dataType})`; the worker replies with either the ZIP (`homeSaved`) or `{status, error}` (`homeError`). `homeContentTypes` is the **constructor name** of each content object, and the worker rehydrates by name (`SimpleURLContent`, `HomeURLContent`, `BlobURLContent`, otherwise `URLContent.fromURL`). **Explicitly rejected: `LocalStorageURLContent`** — `"Data from localstorage not supported in workers"`. So a plan whose resources live in localStorage can only be saved off-thread after the resources have been copied elsewhere. **OBSERVED**
- The worker instance is **kept alive between saves**; it is terminated on `abort()`. **OBSERVED**
- Live probe (`evidence/live-recovery-loop.json` stage `D-zip-paths`): `HomeRecorder` write returned `application/zip` at ~505 kB (no worker, all 48 furniture models inlined) and ~8.4 kB with `writeHomeWithWorker: true`. My `zipMagic` check read `b[0]` of a Blob directly (Blobs aren't `Uint8Array`), so that flag is meaningless — the recovery round-trip in stage A is the authoritative ZIP proof (`50 4b 03 04`). **OBSERVED** (with that caveat noted).

### 2.6 Service worker: an HTTP-only resource cache

**OBSERVED** `evidence/resourceCache.js` + live `navigator.serviceWorker.getRegistrations()`.

- The page registers `serviceWorker.register('/resourceCache.js', {scope:'/'})`. Live: one registration, scope `https://www.sweethome3d.com/`, active script `https://www.sweethome3d.com/resourceCache.js`, state `activated`, and it is the document `controller`.
- The fetch handler matches **only** `event.request.url.indexOf("/online/readResource.jsp?") >= 0`. On a hit it returns the cached response from cache `"RESOURCE_CACHE"`; on a miss it fetches, and if `response.ok` it clones and `cache.put`s it; on a network throw it returns a synthetic `503 "Offline"`. It caches the resource **by full URL including query string**, so cache keys are per-resource-name.
- Live after loading the demo + assets: `caches.keys()` was **empty** and the registration only accounted for 5.5 kB of IndexedDB… i.e. `usageDetails` showed `indexedDB: 6862`, `serviceWorkerRegistrations: 1191`, `quota: ~2.9 GB`. The cache stayed empty because this session used the static `/models/...` and `/textures/...` paths, not `/online/readResource.jsp` (that endpoint is auth-gated: 403). **OBSERVED**
- Storage accounting on this machine: `navigator.storage.estimate()` ⇒ quota ≈ **2.94 GB**, usage ≈ **8 kB** before any recovery write. Useful as an order of magnitude for the browser-storage ceiling a web planner can assume. **OBSERVED**

### 2.7 User preferences persistence (separate from the plan)

**OBSERVED** `RecordedUserPreferences` in `evidence/sweethome3d.min.js` (~2 086 369) and `evidence/src-jsp-web/trunk-SweetHome3DJS/src/UserPreferences.js`.

- `RecordedUserPreferences(configuration)` reads `readPreferencesURL` (falling back to `readResourceURL`) and writes `writePreferencesURL` (falling back to `writeResourceURL`); **the same three-branch dispatch** applies: `localstorage://` ⇒ `localStorage.getItem/setItem`, `indexeddb://` ⇒ `IndexedDBURLContent.getBlob` (read via `FileReader.readAsText`) / a `BlobURLContent.writeBlob`, otherwise `GET`/`POST` XHR with `&requestId=<uuid>` / `&updateId=<uuid>`.
- Format: **flat JSON of property→value**, e.g. `{"language":"en","unit":"…","gridVisible":"true","magnetismEnabled":"true","newWallThickness":"7.5","autoSaveDelayForRecovery":"60000","recentHomes#1":"…","textureImage#3":"…","ignoredActionTip#2":"…"}`. Everything is stringly-typed and parsed back with `parseInt`/`parseFloat`; booleans are the literal strings `"true"`/`"false"`. **OBSERVED**
- The property-name constants are explicit: `language, unit, currency, valueAddedTaxEnabled, defaultValueAddedTaxPercentage, furnitureCatalogViewedInTree, navigationPanelVisible, editingIn3DViewEnabled, aerialViewCenteredOnSelectionEnabled, observerCameraSelectedAtChange, magnetismEnabled, rulersVisible, gridVisible, defaultFontName, furnitureViewedFromTop, furnitureModelIconSize, roomFloorColoredOrTextured, wallPattern, newWallPattern, newWallThickness, newHomeWallHeight, newWallBaseboardThickness, newWallBaseboardHeight, newFloorThickness, autoSaveDelayForRecovery, recentHomes#, ignoredActionTip#, textureName#/textureCreator#/textureCategory#/textureImage#/textureWidth#/textureHeight#`. Indexed families (`recentHomes#N`, `ignoredActionTip#N`, texture `#N`) are **numbered suffixes for list-valued settings**. **OBSERVED**
- Writes are **debounced 100 ms** and re-tried after **10 000 ms** on failure; a second write while one is in flight is coalesced. Changes to a whitelist of ~20 property names mark the preferences dirty. **OBSERVED**
- Live: on the anonymous demo `writePreferencesUrl`/`readPreferencesUrl` are `null`, `getProperties()` is `{}`, and the defaults are `gridVisible: true`, `magnetism: true`, `autoSaveDelayForRecovery: 60000`, `newWallThickness: 7.5` (cm, metric) — i.e. the demo keeps preferences purely in memory. **OBSERVED**

### 2.8 Server endpoints — what the client code says, what the server answers

#### (a) Endpoints the client builds

**OBSERVED** in the client code (`sweethome3d.min.js`, `IncrementalHomeRecorder`, `DirectHomeRecorder`, `RecordedUserPreferences`) and, for the registered deployment, in the official server web-app source fetched from SourceForge (**OBSERVED** by the sub-investigation, files under `evidence/src-jsp-web/`). The registered JSP configuration object (`evidence/src-jsp-web/trunk-SweetHome3DJS/deployIncrementalHomeRecorder/raw-index.jsp`) is:

| config key | URL template | verb / notes |
|---|---|---|
| `readHomeURL` | `<base>/readHome.jsp?home=%s` | GET; client appends `&editionId=<home-uuid>` |
| `writeHomeEditsURL` | `<base>/writeHomeEdits.jsp` | POST, `application/x-www-form-urlencoded` |
| `closeHomeURL` | `<base>/closeHome.jsp?home=%s` | GET |
| `pingURL` | `<base>/ping.jsp` | GET, polled every 10 s to drive online/offline UI |
| `writeResourceURL` | `<base>/writeResource.jsp?path=%s` | POST blob |
| `readResourceURL` | `<base>/userResources/%s` | GET (service-worker cached) |
| `writePreferencesURL` | `<base>/writeResource.jsp?path=userPreferences.json` | POST JSON |
| `readPreferencesURL` | `<base>/userResources/userPreferences.json` | GET JSON |
| `autoWriteDelay` | `1000` (ms) | edit-stream batching delay |
| `autoWriteTrackedStateChange` | `true` | also persist camera/view state changes |

`listHomesURL` / `deleteHomeURL` are **not** part of the JSP config — only the PHP and storage-backed recorders use them. The client's generic query-string decorations are: `?requestId=<uuid>` on reads, `&updateId=<uuid>` on the preferences POST, `&editionId=<uuid>` on `readHome` and inside the writeHomeEdits body. **OBSERVED**

#### (b) Live production probes (plain GET only, no bodies, no credentials)

**OBSERVED** — raw responses under `evidence/server-probes/` (`.headers` + `.body`), summarised:

| Path | Status | Content-Type | Size | Reading |
|---|---|---|---|---|
| `/SweetHome3DJSOnline.jsp` | 200 | text/html | 99 559 | the anonymous demo (same bytes as the round-1 snapshot) |
| `/online/readHome.jsp` (`?home=…`, `?name=…`, no param) | 200 | `application/sweethome3d` | 0 | endpoint exists; returns nothing for an unsupplied/unknown home (also observed in the Wayback CDX for 2011) |
| `/online/writeHomeEdits.jsp` | **403** | text/html | 627 | Apache Tomcat 9.0.58 "Forbidden" — auth-gated; the incremental path is **unavailable to an anonymous client** |
| `/online/writeResource.jsp`, `/online/readResource.jsp?name=…` | **403** | text/html | 627 | auth-gated |
| `/online/writeHome.jsp` | 200 | text/plain | 1 | body `0` — legacy endpoint, reachable but a no-op without a body |
| `/online/listHomes.jsp` | 200 | text/plain | 0 | legacy endpoint, empty list |
| `/online/deleteHome.jsp` | 200 | text/plain | 3 | body `0` |
| `/online/readPreferences.jsp` | 200 | `application/xml` | 0 | empty, `no-store` cache headers |
| `/online/writePreferences.jsp` | 200 | text/plain | 1 | body `0` |
| `/online/ping.jsp`, `/online/closeHome.jsp` | 404 | | | in the public SVN JSP app, **not** in production |
| `/online/kcauth-login.jsp` | 302 | | | → Keycloak realm `sweethome3d`, PKCE (from the sub-investigation's probe log) |
| `/online/abcdefgh.jsp` (control) | 404 | | | confirms 200s above are real endpoints, not a catch-all |
| `/online/readEditedHome.jsp` | **200** | `application/sweethome3d` | 595 | returns a ZIP with a 924-byte stub `Home.xml` (`version='7400'`, empty plan: one `topCamera`, one `observerCamera`, compass, environment) — the anonymous "new home" template |
| `/online/readEditedHome.jsp?id=<n>&editionId=<uuid>` | **403** | text/html | 627 | a specific home is auth-gated |
| `/online/readExportedHome.jsp?id=<n>` | **200** | `application/sweethome3d` | 1.06 MB / 1.59 MB | an **unauthenticated public read** of an "exported home". `id=1` and `id=164` both return full `.sh3x` ZIPs (containing `Home.xml` plus model folders); `id=99999` ⇒ 404; no `id` ⇒ 404. This is the client-side-visible mechanism behind shared/exported homes. |
| `/online/readEditedHome.jsp` vs `…/readExportedHome.jsp` | | | | `readEditedHome` = the live collaborative home; `readExportedHome` = a frozen published copy. Named by the client code as `readHomeURL` targets only for the *incremental* server deployment; the anonymous demo does not use them at all. |

Round-1 already recorded the German online landing pages and the Online Manager marketing copy; the relevant sentence there is **DOCUMENTED**: *"…if you want to be able to save your design, register first for free, then log in"* (`https://www.sweethome3d.com/online-manager/`). The bundled `examples/*.sh3x` used by the demo are static files, and the demo's `viewHome()` explicitly alerts: *"Keep in mind that your design won't be saved! If you want to save it, go first to Online page and register for free."* **OBSERVED/DOCUMENTED**.

#### (c) Server-side implementation (from the official SourceForge SVN sources)

Full detail and raw files: `evidence/subagent-server-source.md`, `evidence/src-jsp-web/**`. Condensed, all **OBSERVED** from those GPL sources (behaviour described, not code copied):

- **JSP edition** `trunk/SweetHome3DJS/deployIncrementalHomeRecorder/`: flat files under a server-side homes directory; **no database**. The server keeps a per-session working copy of each opened home and refuses to write one it hasn't served (`"<home> not opened by client"`).
- **Write protocol**: `POST writeHomeEdits.jsp` with `home`, `editionId`, `version` and `edits` = URL-encoded JSON array. Each edit is the serialised Java `UndoableEdit`: `_type` (fully-qualified class name), `_undoableEditId` (client UUID), `_action:"undo"` when it came from an undo, optional `_newObjects` (objects created by the edit, applied in a second pass), and otherwise raw Java field names resolved reflectively. Existing home objects are represented by their bare `id` string; enums as ordinals; `BigDecimal` as `{value, _type}`. Response is `{"result": <n>}` and the client commits only if `n === edits.length`.
- **Idempotency / ordering**: the server stores the last applied `_undoableEditId` per home in an application attribute, scans the incoming array backwards for it, drops that prefix, and applies only the new tail — so a retried request is not double-applied. Writes are serialised per home. There is **no version/ETag check: last write wins.**
- **Client retry**: a failed edit update is retried after 10 000 ms; only one in-flight update per `editionId`.
- A newer registered-user edition is a **PHP** app (`branches/develop-SweetHome3D-7.7-Online/SweetHome3D/deploy/{login,readHome,writeHome,readResource,writeResource,listHomes,deleteHome}.php`), and there is an older direct-recorder PHP edition in `trunk/SweetHome3DJS/deployDirectHomeRecorder/`.
- **Negative evidence**: no table names/schema, no documented size limit, no anonymous-home expiration, and no `web.xml` in the public source; the production build differs from SVN (it has `listHomes.jsp`, `deleteHome.jsp`, `login.jsp`, `writeHome.jsp`, `readResource.jsp`, `kcauth-*.jsp`, and lacks `ping.jsp`/`closeHome.jsp`), so production behaviour is tagged OBSERVED-only.

### 2.9 The incremental edit stream (client side)

**OBSERVED** in `IncrementalHomeRecorder` (`evidence/sweethome3d.min.js` ~2 586 021) and `evidence/src-jsp-web/trunk-SweetHome3DJS/src/IncrementalHomeRecorder.js`; envelope captured live in `evidence/live-persist-probe4.json` (stage `A-incremental-envelope`).

- Construction starts a `pingURL` GET every **10 000 ms**; the result flips `this.online` and drives `writingObserver.connectionFound/connectionLost`.
- `addHome(home, controller)` attaches an `UndoableEditListener` to the controller's undo support, **monkey-patches `undoManager.undo`/`redo`** so user-driven undo/redo is also recorded, and records a **checkpoint map of existing object ids** (`checkPoint`, refreshed after each non-view edit) so that "existing vs newly created" objects can be told apart.
- `storeEdit` serialises the edit through `substituteIdentifiableObjects`, which walks arrays/objects, replaces known-`id` objects with their id string, emits `_newObjects` for first-seen objects, converts `BigDecimal` to `{value,_type}`, uploads `LocalURLContent` blobs (naming them `<uuid>.<png|jpg|dat>` and remembering `resourceFileName`), and finally stamps `_undoableEditId = UUID.randomUUID()` and pushes to `this.queue`.
- `scheduleWrite(home, delay = getAutoWriteDelay())` debounces: it clears any pending timer and re-arms it; when it fires and the recorder is online and `hasEdits`, `sendUndoableEdits` runs and the timer re-arms while the delay is > 0. Server-configured `autoWriteDelay` = **1 000 ms**.
- `hasEdits(home)` = `queue.length > 0 || (autoWriteTrackedStateChange && trackedStateChanges !== undefined)`.
- `DEFAULT_TRACKED_HOME_PROPERTIES` (live-observed) mixes real model properties (`CAMERA`, `STORED_CAMERAS`, `SELECTED_LEVEL`, furniture sort/visibility, observer-camera elevation, all-levels-visible) with **UI viewport properties** (`…PlanViewportX`, `…PlanViewportY`, `…MainPaneDividerLocation`, `…PlanPaneDividerLocation`, `…CatalogPaneDividerLocation`, `…PlanScale`, `…ExpandedGroups`) — so scroll position and panel sizes are part of the saved state.
- `beginUpdate`/`commitUpdate`/`rollbackUpdate` implement a single in-flight update per edition with a "rejected update ⇒ reschedule at 0" rule; the retry on failure is **10 000 ms**.
- Live captured envelope (my synthetic edit, stubbed XHR — no network call):

  ```
  POST /online/writeHomeEdits.jsp
  Content-Type: application/x-www-form-urlencoded
  home=Studio.sh3x&editionId=home-57f1ebc5-…&version=7.5.2&edits=%5B%7B%22_type%22%3A%22com.eteks.sweethome3d.model.HomeWallAddition%22,…
        %22_undoableEditId%22%3A%22e9c4fc0a-…%22%7D%5D
  ```

  i.e. the envelope is exactly `{_type, …java fields…, _undoableEditId}` — matching the server-side description in §2.8(c). This is the **only** network path by which an edit reaches the server; there is no whole-plan PUT during editing. **OBSERVED**

### 2.10 Two real defects worth knowing about (they are also design lessons)

1. **`hasEdits` is called on recorders that do not have it.** The live anonymous page installs a `beforeunload` handler that does `if (application.getHomeRecorder().hasEdits(home)) return "…unsaved…"`. Because the demo gets the base `HomeRecorder`, which has no `hasEdits`, the handler **throws** `TypeError: application.getHomeRecorder(...).hasEdits is not a function`. I reproduced this by dispatching a `beforeunload` event and again on an actual `page.reload()`, and captured the uncaught error in `evidence/live-unload-guard.json` (`errorsOnUnload`). Consequence: **the demo's "you will lose your changes" guard never fires** — the browser unload prompt is effectively dead. The same page also logs `TypeError: Cannot read properties of null (reading 'addEventListener')` twice (a DOM element the handler expects is absent). **OBSERVED**
2. **Auto-recovery is switched off exactly where it would matter most.** The gate `autoRecovery && writeHomeEditsURL === undefined` means: registered users who rely on the server's incremental save get *no local recovery snapshot*, and if the network write fails their edits live only in `IncrementalHomeRecorder.queue` in memory. The developer's own forum answer (**DOCUMENTED**, `t=10403` / `t=13125`, see `evidence/subagent-docs.md`) confirms that a logged-out home is unrecoverable after reload and that the server save "each time you modify something" is what protects registered users. **OBSERVED** (gate) + **DOCUMENTED** (forum).

### 2.11 Serialisation details that touch persistence

**OBSERVED** (`evidence/sweethome3d.min.js`, `evidence/recorderworker.min.js`, round-1 `Studio_extracted/Home.xml`).

- A plan is a **ZIP** (`*.sh3x` for the web/JS flavour, `*.sh3d` for the desktop flavour) whose first entry is `Home.xml`, plus one entry per referenced resource. The root element is `<home version='7400' …>`; round 1 catalogued walls/rooms/doors/windows/furniture/levels/dimension lines/labels/lights/cameras/compass.
- `generateZip` chooses `STORE` when `compressionLevel === 0` and `DEFLATE` otherwise, and JSZip's `type` is `"blob"` in the browser paths.
- **Content dedupe**: `ContentDigestManager` computes `crypto.subtle.digest("SHA-1", bytes)` (falling back to `SHA-256` if SHA-1 is rejected), base64-encodes it, and caches it per URL in `contentDigestsCache`. `equals()` compares digests, and `getPermanentContentDigest` keeps a reverse map digest→content so the same physical blob is written once even when referenced from several furniture items. A failed digest is a warning, not a fatal error. **OBSERVED**
- The auto-recovery reader/writer re-uses the **application recorder's** `getHomeXMLHandler()` and `getHomeXMLExporter()` (`AutoRecoveryRecorder.prototype.getHomeXMLHandler = … application.getHomeRecorder().getHomeXMLHandler()`), guaranteeing that a snapshot and a normal save share one serialiser. **OBSERVED**
- `HomeRecorder.readHome` also accepts a `jar:`-prefixed URL to pick a non-default entry name (`jar:<zip>!/<entry>`), and `replaceHomeContents` can rewrite stored resource URLs against a cache store using `listCacheResourcesURL` / `readCacheResourceURL` — neither of which appears in the JSP or the demo config; they belong to desktop/local deployments. **OBSERVED**

### 2.12 What Sweet Home 3D does *not* do (as far as I could establish)

- No localStorage/IndexedDB use by the **anonymous** demo: after load + demo + edit, `Object.keys(localStorage)` = `["user_pseudo_id"]` (Firebase analytics) and IndexedDB contains only Firebase databases. `applicationParams` has only `furnitureCatalogURLs`, `furnitureResourcesBase`, `texturesCatalogURLs`, `texturesResourcesBase`, `userLanguage`. **OBSERVED**
- No canvas clicks were needed — the demo exposes `window.viewHome(url)` and `window.application`, which I used throughout; 3D did render with software GL (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), which also resolved round-1's WebGL problem. **OBSERVED**
- No multi-tab/conflict handling in any client code I read: only `editionId` + `_undoableEditId`; no revision, no ETag, no "modified since", no 409 path. **OBSERVED** (client) — and no documentation of one (**NOT FOUND**).
- No documented retention/expiry for server homes, no documented quota beyond a localised size-error string and a developer forum remark that the max was 20 MB at the time. **DOCUMENTED/INFERRED** (see `evidence/subagent-docs.md`).

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each is tied to a finding above and, where relevant, to `casaplazai-schema.md`. All are behaviour-level; nothing is copied.

| # | Idea | Tied to | Effort | Value |
|---|---|---|---|---|
| 1 | **Make autosave explicit and observable.** Keep the existing `casaplaza.*` autosave, but add a persisted `lastSavedAt` + `dirty` flag and a tiny status chip ("Saved 12:04" / "Unsaved changes") in the new tool card. Sweet Home 3D's whole web value proposition is "no Save button"; CasaPlazAI's invisible localStorage write is the same promise **without** the feedback that makes users trust it. | §2.4 timer + §2.10 defect 2 | S | high |
| 2 | **Add a second, independent recovery snapshot keyed like `indexeddb://SweetHome3DJS/Recovery`.** Write the whole `FloorplanData` (or better, the serialised editor document) into `casaplaza.recovery.v1` with `{id, savedAt, schemaVersion, payload}` either in IndexedDB (preferred: no 5 MB string limit, structured clone of a Blob) or as a compact JSON in localStorage. On boot, if a snapshot exists for the current plan id, show a `[Recovered]`-style badge and one non-blocking "restore the recovered version?" prompt — the SH3D pattern of `confirmRecoverHome` + a visible `[Recovered]` state. Keep the primary autosave untouched so the recovery copy can be throttled (e.g. every 60 s) without hurting normal saving. | §2.4 (store shape, startup flow, badge/prompt strings) | M | high |
| 3 | **Debounce + change-detection on the save path.** SH3D's `scheduleWrite` coalesces bursts (1 000 ms server delay, 10 s retry backoff) and `hasEdits` skips work when nothing changed; the recovery timer additionally enforces a 5 s floor between writes. CasaPlazAI should debounce on a *structural* hash of `FloorplanData` rather than on every mouse-move, and skip the write when the hash is unchanged. This is the single cheapest fix for janky large-plan editing. | §2.9 `scheduleWrite`, §2.4 `>5000` guard | S–M | high |
| 4 | **Version the recovery payload with `schemaVersion` and fail soft.** SH3D tags every XML with `version='7400'` and the ZIP knows its flavour (`.sh3x`/`.sh3d`). CasaPlazAI already has `schemaVersion` + `migrate()` + `future-version`. Run the recovery snapshot through the same `migrate()` on restore; if the snapshot is from a **newer** version than the reader, don't discard it — keep it, mark it unreadable, and offer "export the raw JSON" instead of `future-version`-failing. | schema `Top level` + `Migration hook convention` | S | high |
| 5 | **Content-addressed resource dedupe.** `ContentDigestManager` stores SHA-1 (base64) per resource URL and writes a blob once even when reused. CasaPlazAI's palette is small today, but floor textures / blueprint underlays / furniture thumbnails are exactly the things that will bloat localStorage. A `digest → blob` side table plus a `digest` reference in the plan would also make the underlay (`casaplaza.underlay.v1`, explicitly omitted from share links) storable once per floor. | §2.11 digests; schema "Out-of-schema editor state" | M | medium-high |
| 6 | **Quota-aware writes with a real fallback.** SH3D catches `QuotaExceededError` from `localStorage.setItem` and surfaces it through `blobError` — but for recovery it just `console.log`s. CasaPlazAI should (a) call `navigator.storage.estimate()` (observed quota here ≈ 2.9 GB, but localStorage is ~5 MB separately), (b) pre-flight a size check before writing the underlay/plan, and (c) if it will not fit, fall back to a **file download** rather than losing the session. This mirrors SH3D's own export-to-file escape hatch. | §2.2 write path, §2.6 estimate, §2.11 | M | high |
| 7 | **Keep editor view state in the plan-adjacent save, not in the schema.** SH3D persists `PlanViewportX/Y`, divider locations, scale, expanded groups, selected level, camera and stored cameras as *tracked properties*. CasaPlazAI should persist the equivalent (2D pan/zoom, active mode Plan/3D/Walk, inspector tab, selected floor) under `casaplaza.view.v1` — never inside `FloorplanData`, so share links stay clean. | §2.9 `DEFAULT_TRACKED_HOME_PROPERTIES`; schema "Out-of-schema editor state" | S | medium |
| 8 | **A "Recovered" indicator that survives a rename.** SH3D repairs the store when a home is renamed or its extension changes (name-change listener moves the `.recovered` row) and deletes the snapshot once the user un-does back to a clean state (with a 1 000 ms grace so undo/redo browsing doesn't destroy it). CasaPlazAI should key recovery by a **stable plan id**, not by a user-visible name, and only clear the snapshot on an explicit save or on becoming clean. | §2.4 listeners, cleanup | S | medium |
| 9 | **Export/import a single-file bundle.** Because a plan is a ZIP with one `Home.xml` plus resources, SH3D can move a whole design between web, desktop and mobile. CasaPlazAI exports PNG/JPEG only; adding a `.casaplaza` ZIP (a `plan.json` + `underlay.png` + optional thumbnails) would give users an offline backup and a migration path when `schemaVersion` bumps — and it is a natural counterpart to idea 2's recovery snapshot. | §2.11, §2.2; schema v1 interchange | M | medium |
| 10 | **Off-thread serialisation when plans grow.** SH3D zips in a Blob-URL `Worker` and keeps it alive between saves; it also discovered that localStorage-backed resources cannot be rehydrated inside that worker. If CasaPlazAI ever serialises more than a trivial JSON, move `JSON.stringify`/compression into a module worker and pass a plain, structured-cloneable payload (no class instances, no `File` handles) — pre-empt the exact bug SH3D hit. | §2.5 | M–L | medium (future) |
| 11 | **Don't repeat the unload-guard bug.** Route the `beforeunload` guard through a single `hasUnsavedChanges()` that is guaranteed to exist on every persistence mode, and test it for each mode. SH3D's demo silently lost its warning because the guard called a method only the incremental recorder implements. | §2.10 defect 1 | S | medium |

---

## 4. Unknowns

1. **The exact production build.** `/online/` answers with Tomcat 9.0.58 and behaves differently from the public SVN JSP app (`ping.jsp`/`closeHome.jsp` 404, `listHomes.jsp`/`deleteHome.jsp`/`login.jsp`/`writeHome.jsp`/`kcauth-*.jsp` present). The registered deployment could be a newer JSP revision or the PHP edition behind a reverse proxy. All production behaviour above is therefore OBSERVED-only, not source-verified. See `evidence/subagent-server-source.md` §7.
2. **No authenticated surface was exercised.** `writeHomeEdits.jsp`, `writeResource.jsp` and `readResource.jsp` return 403 to an anonymous client, so the registered runtime `configuration`, the `editor` Keycloak client details, and the exact `userPreferences.json` shape were not read (registration/login is forbidden by the task rules).
3. **The minutes↔milliseconds conversion for `autoSaveDelayForRecovery`.** The localisation bundle labels the unit "minutes" while `getAutoSaveDelayForRecovery` documents milliseconds; the preferences-panel view class that would contain the ×60 conversion is not present in the minified web bundle. I could not determine whether the web build exposes this setting at all.
4. **Resource-cache lifetime.** The service worker caches `/online/readResource.jsp` responses in `RESOURCE_CACHE`, but the cache was empty in my session (that endpoint is auth-gated). Cache eviction, size caps and versioning of `RESOURCE_CACHE` are unverified.
5. **Retention and quota on the server.** No public source states a home-size limit, retention period or anonymous-expiry policy. A localised `homeLengthError` string implies a server-side maximum; a developer forum remark (2022) mentions 20 MB. Not verifiable without an account.
6. **Multi-tab / conflict semantics.** Client code carries only `editionId`/`_undoableEditId`; the server source shows last-write-wins with an idempotency marker and no version check. What the UI actually shows when two tabs edit the same home is unverified.
7. **`readExportedHome.jsp?id=<n>` semantics.** It returns full ZIPs anonymously, with sequential-looking numeric ids (`1`, `164` work; `99999` 404s), and no parameter was echoed into the response headers. Whether "exported" means "user chose to publish" or "any home in the manager" is INFERRED from the privacy-policy wording ("Homes data is private unless the user explicitly agrees to share it publicly") — the enumeration risk deserves its own note but not exploitation.
8. **Storage of the *blueprint* and *measurement* overlays** has no SH3D analogue (SH3D has no underlay feature in this bundle); that part of CasaPlazAI's persistence design cannot be informed by this competitor.

---

## Appendix — evidence produced by this job

| Path | What it is |
|---|---|
| `report.md` | this report |
| `evidence/sweethome3d.min.js` | copy of the 7.5.2 main bundle used for offline analysis (GPL header intact) |
| `evidence/recorderworker.min.js` | the standalone worker bundle (defines `URLContent`, `LocalStorage…`, `IndexedDB…`, `HomeRecorder`) |
| `evidence/resourceCache.js` | the service worker |
| `evidence/live-online-en.html` | live anonymous demo page, byte-identical in size to the round-1 snapshot |
| `evidence/live-persist-probe*.json` | Playwright runs: config/recorder identity, IDB databases, IndexedDB recovery write, localStorage/IndexedDB round-trips, edit envelope capture |
| `evidence/live-recovery-loop.json` | full auto-recovery write → read-back loop, IDB row shape, worker/no-worker ZIP paths, second-tab state |
| `evidence/live-sw-and-unload.json` | service-worker registration + cache state, storage estimate, `beforeunload` reproduction |
| `evidence/live-unload-guard.json` | the `hasEdits` uncaught-TypeError reproduction across a real reload |
| `evidence/live-editor.png` | screenshot artefact (not visually interpreted; no image input) |
| `evidence/subagent-server-source.md` + `evidence/src-jsp-web/**` | official server web-app sources (SourceForge SVN, JSP + PHP editions, server Java), endpoint table, edit protocol |
| `evidence/subagent-docs.md` + `evidence/raw/**` | vendor documentation: user guide, FAQ, privacy policy, changelog, forum posts, localization bundles |
| `evidence/server-probes/**` | raw response bodies/headers for the production endpoint probes |
| `evidence/cdx-online*.txt` | Wayback CDX listings that name the historical endpoint set |
| `evidence/probe-readResource-403.html`, `evidence/theme-script.min.js`, `evidence/viewmodel.min.js` | ancillary captures (403 body, WordPress theme + 3D preview viewer scripts) |
| `tools/persist-probe*.mjs`, `tools/ctx.py` | the read-only observation/probe scripts used above |

Round-1 files were used read-only from `~/dsh-workspaces/rea-sweethome3d-2026-10/02-02-online-version-bundle/`; nothing there was modified.
