# Sweet Home 3D — `ContentDigests`, asset embedding, de-duplication, and catalog-vs-embedded model resolution

Job: `03-06c-sh3d-file-format-asset-embed` (round 2) · App studied: Sweet Home 3D 7.5.x (GPL Java desktop)
and Sweet Home 3D JS Online (HTML5 build of the same core) · Target: <https://www.sweethome3d.com/de/> ·
<https://www.sweethome3d.com/SweetHome3DJSOnline.jsp>

Round 1 (`rea-sweethome3d-2026-10/06-06-sh3d-file-format/report.md`) established the `.sh3d` ZIP layout, the
`Home.xml` DTD/model, and that `ContentDigests` is a `ContentDigests-Version: 1.0` + `Name` / `SHA-1-Digest`
text file. **This round goes deeper on exactly one axis:** how assets are embedded, how they are de-duplicated,
and how a model/content is resolved on load from the embedded file vs. the installed catalog (preferences) —
plus the equivalent machinery in the JS online build. Round-1 findings are reused, not repeated; the
cross-references are marked.

Evidence legend: **OBSERVED** = fetched/parsed a live artefact or real file, retained in this folder ·
**DOCUMENTED** = shipped GPL source / vendor docs · **INFERRED** = my own reasoning.

---

## 1. Summary (5 bullets)

- **`ContentDigests` is the load-time *repair ledger*, not a checksum-of-everything.** Its producer
  (`DefaultHomeOutputStream`) writes one `Name`/`SHA-1-Digest` pair per **saved content entry** —
  `Name` is exactly the ZIP entry path stored in the XML (e.g. `1/stairs…/stairs….obj` or `0`), digest is
  base64 of a **SHA-1** over the content's bytes, and for a *multi-part* content over the **concatenation of
  the sorted member bytes**, ignoring `LICENSE.TXT`. **DOCUMENTED** (`src/ContentDigestManager.java`,
  `src/DefaultHomeOutputStream.java`) + **OBSERVED** (262 entries in `evidence/blues_ContentDigests.txt`).
- **The digest has exactly three consumers, all in `HomeContentContext.lookupContent`:** (1) *validity* — if a
  named entry cannot be opened at all it is invalid; (2) *integrity* — if a `ContentDigests` digest exists for
  that exact entry name and the re-computed digest differs, the entry is treated as damaged; (3) *repair* — a
  damaged entry is silently swapped for the installed-catalog file whose digest matches, else it is collected
  into `invalidContents` and the user is asked what to do. **DOCUMENTED** (`src/HomeContentContext.java`
  lines 127–230) + **OBSERVED** (the three-option dialog exists: remove / replace / don't open,
  `src/app_HomeController.java` lines 2163–2183).
- **Unlike a generic content-addressed store, the digest is only a *secondary* key here.** Identity is the
  **entry path** (`URLContent.equals` compares URLs). De-duplication on *save* is a linear
  digest-equality scan (`ContentDigestManager.equals`), so two contents are merged only if their bytes match;
  independence is proven empirically: the Blues home contains **268 furniture pieces but only 121 distinct
  models** — a model reused up to 22× — and `ContentDigests` holds **exactly one entry per distinct content
  (262) with zero duplicate digest values**. **OBSERVED** (`evidence/analysis_digests.json`) +
  **DOCUMENTED** (`src/DefaultHomeOutputStream.java` lines 361–424).
- **Catalog-vs-embedded resolution is a two-branch, digest-gated rule.** On load, the XML content attribute
  (`model="…"`, `icon="…"`, `image="…"`) is either an absolute URL (kept as-is) or a **relative entry name**
  resolved against the home's own ZIP (`lookupContent`). If a *same-digest* file exists in the installed
  furniture/texture catalogs and `preferPreferencesContent` is on, the **catalog object replaces the embedded
  one** (so the running app shares one instance across homes); if the entry is damaged, the catalog object is
  used **regardless** of that flag. The desktop app hard-wires `preferPreferencesContent=false`: catalog files
  are used only for repair, never to shadow a good embedded model. **DOCUMENTED** (`src/SweetHome3D.java`
  line 199) + **DOCUMENTED** (`HomeXMLHandler.java` lines 1929–1992, `HomeContentContext.java` 127–179).
- **The HTML5 build keeps the same digest/identity semantics but a different persistence strategy.** The page
  loads extra scripts round 1 never analysed: `recorderworker.min.js` (the real container reader/writer),
  a **service worker** `resourceCache.js` (HTTP `Cache` API keyed by request URL, `/online/readResource.jsp?`),
  and `crypto-js`. The JS `ContentDigestManager` has **async callbacks, `permanentContents` pinning, an
  extracted-blob slow path, and a byte-identical `isSignificant` rule**, and — uniquely — it can absorb
  pre-computed catalogs: `FurnitureCatalog.json` ships **805 `modelDigest` + 805 `iconDigest` (all 20-byte
  base64 SHA-1), 667 of them flagged `multiPartModel`**, which is how the browser avoids downloading every
  model just to hash it. **OBSERVED** (`js/recorderworker.min.js`, `js/FurnitureCatalog.json`,
  `evidence/furniture_catalog_analysis.txt`).

---

## 2. Findings

### 2.1 Round-1 ground truth (reused, with the one correction that matters here)

Round 1 §2.2 established: ZIP order `Home` → `Home.xml` → `ContentDigests` → content entries; `Home.xml` has
priority on read; content entries are named by index, or `<index>/<folder>/<file>` for multi-file models. All
of that is confirmed again here. The correction/refinement that this round adds is **where the digest value
actually comes from and what it covers** (§2.2), and the fact that round 1's phrase "SHA-1 digests of embedded
assets" is right but incomplete: for a multi-part model the digest is not the `.obj` file's hash but a hash of
the whole folder. **DOCUMENTED** (`src/ContentDigestManager.java` lines 152–245).

### 2.2 `ContentDigests` — exact grammar, producer and consumer

**Producer** (`DefaultHomeOutputStream.writeHome`, lines 177–223). A dry-run `ObjectOutputStream`
(`HomeContentObjectsTracker`) walks the `Home` graph with `enableReplaceObject(true)` and, for every `Content`
that will be saved, allocates a **name** and stores it in a `LinkedHashMap<Content,String>`; duplicates are
caught here (§2.3). Then:

```
"ContentDigests-Version: 1.0\n\n"          // note: the version line carries ONE trailing \n then a blank line
for each distinct saved content entry (insertion order):
    "Name: " + entryName + "\n"
    "SHA-1-Digest: " + base64(sha1(content)) + "\n"
    "\n"                                    // blank line terminator
```

The whole entry is written only `if (savedContentNames.size() > 0)` — a home with no embedded assets has **no
`ContentDigests` entry at all**. **DOCUMENTED**.

**Grammar, precisely** (the consumer is deliberately sloppy): `HomeContentContext.readContentDigests`
(lines 78–122) reads the entry as UTF-8, requires the first non-null line to `trim().startsWith(
"ContentDigests-Version: 1")`, then scans line-by-line for `line.startsWith("Name:")` and
`line.startsWith("SHA-1-Digest:")`, **not** trimmed-prefix, so the keys must be at column 0. A
`SHA-1-Digest` line without a preceding `Name` throws `IOException("Missing entry name")`. `Name` values are
`.trim()`ed before use. Any `IOException` while reading the ledger is **swallowed** ("this entry exists only
from version 4.4") and the map becomes `null`. **DOCUMENTED** + **OBSERVED**
(`evidence/blues_ContentDigests.txt` begins `ContentDigests-Version: 1.0` then a blank line).

**What a digest covers** (`ContentDigestManager`):

| Content kind | Digest input | Source |
|---|---|---|
| Plain URL / single file | SHA-1 of the file bytes | `computeContentDigest` (line 336) |
| `ResourceURLContent` multipart (SH3F/classpath) | SHA-1 over the concatenation of **all entries in the same directory**, taken in `Collections.sort` name order, excluding `LICENSE.TXT` | lines 152–202 |
| `HomeURLContent` multipart (inside a `.sh3d`) | same, but entries come from the home ZIP and the directory prefix is `entryName` up to the **first** `/` | lines 207–229 |
| Generic zip content | SHA-1 over every significant entry of the zip whose URL *is* the content's jar base | lines 234–245 |

`isSignificant(name)` is literally: not `LICENSE.TXT` and not ending in `/LICENSE.TXT` (lines 251–256) —
**byte-identical** to the JS implementation (`js/recorderworker.min.js`, see §2.7). Entries are always sorted
before hashing so the value is source-order independent. **DOCUMENTED** + **OBSERVED**.

**Consumer map keys.** `readContentDigests` builds `Map<HomeURLContent, byte[]>` keyed by objects created as
`URLContent("jar:" + homeUrl + "!/" + entryName)` (line 101) — i.e. **exact entry-name strings**. So a lookup
only succeeds when the XML's `model=`/`icon=`/`image=` value names the *same* ZIP entry that the ledger names.
Bare-name lookups always miss. Since the exporter writes exactly the saved name (`getExportedContentName`,
lines 904–927), this holds for every file Sweet Home 3D itself wrote. **DOCUMENTED**.

**Observed ledger.** `Blues.sh3d` (v7400, 51.9 MB): 262 `Name`/`SHA-1-Digest` pairs; 141 are index-only
(`0`, `2`, …, `261` — icons and single-file textures) and 121 are multi-part model directories
(`5/wooden-door/wooden-door.obj`, …); the highest index is 261, indices are contiguous 0…261; **262 distinct
digest values, zero collisions**; the set of `Name` values equals the set of `model`/`icon`/`image` values
referenced in `Home.xml` **exactly** (no extras, no misses). **OBSERVED**
(`evidence/analysis_digests.json`).

### 2.3 Asset embedding and de-duplication on save

**Entry naming.** `HomeContentObjectsTracker.replaceObject` (lines 361–424) monotonically increments
`savedContentIndex` and builds `homeContentPath = index + subEntryName`, where the suffix is:

| Source content | Suffix | Result example |
|---|---|---|
| Multipart resource in a JAR (SH3F) | `/` + filename from the last `/` | `12/kitchen-island-classic-3.obj` (dir part written separately) |
| Multipart `HomeURLContent` (nested `.sh3d`) | path after the first `/` | `13/…` |
| Non-simple zip entry | `/` + full entry name | `5/wooden-door/wooden-door.obj` |
| Single file | `""` | `0`, `2`, … |

Note that for a multi-part model the *content* is the `.obj`, but `writeHomeZipEntries`/`writeResourceZipEntries`
write **every sibling entry in the same directory** under the same numeric prefix (`.mtl`, `.jpg` textures) —
so the prefix is a *directory*, not a file. This is the rule that answers round-1 Unknown #5.
**DOCUMENTED** + **OBSERVED** (`evidence/blues_ziplisting_head.txt`: `5/wooden-door/Door_006.mtl`,
`5/wooden-door/Wood_36.jpg`, `5/wooden-door/wooden-door.obj`).

**De-duplication is content-equality only.** `replaceObject` scans the already-saved map and, on the first
entry where `ContentDigestManager.equals(urlContent, existing)` is true, reuses the existing name and stops.
`equals` compares SHA-1 **bytes** and refuses to equate anything whose digest is `INVALID_CONTENT_DIGEST`
(`{}`), so unreadable content is never silently merged. The whole mechanism is therefore
**content-addressed deduplication with a linear scan**, implemented on top of a URL-keyed identity.

**Empirical proof of the effect** — `Blues.sh3d` (`evidence/analysis_digests.json`):

| Quantity | Value |
|---|---|
| `<pieceOfFurniture>`+`<doorOrWindow>` elements | 268 |
| distinct `model=` values | 121 |
| distinct `icon=` values | 121 |
| distinct `image=` values | 20 |
| `ContentDigests` entries | 262 = 121 + 121 + 20 |
| duplicate digest values | 0 |
| hottest model | `9/doppio/doppio.obj`, referenced 22× |

So 268 placed pieces produced 121 model blobs. Version history corroborates that this was designed as **one
coherent 4.4 feature set**: the `Version 4.4, June 12, 2014` block contains, in adjacent sentences, "Avoided
data duplicates in SH3D files during saving" and "Added an option to repair damaged SH3D files with the
ability to retrieve corrupted data from Sweet Home 3D catalogs, to remove damaged 3D models and images" —
i.e. **dedup + `ContentDigests` + the three-way recovery dialog shipped together**, matching the code comment
that the ledger "exists only from version 4.4". **OBSERVED** + **DOCUMENTED** (`docs_html_history.html`,
`Version 4.4` block).
**Round-1 §2.2 said "ContentDigests stores SHA-1 digests of embedded assets"; §2.3 here is the missing half:
the same digests are also the dedup key.**

### 2.4 `modelSize` — a separate, cheap integrity signal

`Home.xml` also persists `modelSize` per piece (`<pieceOfFurniture … modelSize='164615'`). I checked its
semantics: for **116 of 121 models it equals the byte length of the main model file** (e.g.
`1/stairs…/stairs….obj` = 164615 = stored value), and it equals the *directory* total for only 1 (the
`rug`), with 4 outliers (small window frames off by ~24 bytes of an `.mtl` sibling; two files whose stored
value matches neither). **INFERRED**: `modelSize` is the *main file's* uncompressed ZIP size
(`ZipEntry.getSize()`), persisted so the UI can warn about a missing/oversized model **without opening or
hashing it**, and the four outliers are models edited/re-saved in place after the catalogue entry was built.
`DefaultHomeInputStream.checkModelSizes` back-fills `modelSize` when absent (lines 532–548), and
`DefaultFurnitureCatalog` reads the catalogue's own `modelSize` key precisely to "avoid … watching content
stored on a server" (lines 820–827). **OBSERVED** + **DOCUMENTED**.

### 2.5 Load-time resolution: embedded vs. installed catalog

This is the core of the question. The path is: `HomeXMLHandler.parseContent` →
`HomeContentContext.lookupContent`. Two layers, and they behave differently.

**Layer 1 — the XML attribute** (`parseContent`, lines 1929–1979):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

`isSameContent` (lines 1984–1992) compares by **entry name**: for a JAR-entry catalog resource it requires
`getJAREntryName().equals(contentFile)`; for a file resource it requires the URL to end with `"/" + contentFile`.
So the third branch is the "XML-only file next to a catalog" path (used when reading a bare `Home.xml` with no
container, or in applet mode). **DOCUMENTED**.

**Layer 2 — `HomeContentContext.lookupContent(contentEntryName)`** (lines 127–179), in evaluation order:

1. Build `urlContent = jar:<homeUrl>!/<entryName>`.
2. **Validity gate.** `if (!isValid(urlContent))` → `containsInvalidContents = true`; try
   `findUserPreferencesContent(urlContent)`; if a preferences file has the digest the ledger claims for this
   name, **return it and repair silently**; else add `urlContent` to `invalidContents` and return it.
3. **Dedup gate (legacy files only).** Scan `validContentsNotInPreferences` for an existing content with an
   equal digest and return that instead — comment: *"coming from files older than version 4.4"* (i.e. files
   written before the ledger existed, so the writer could not dedup).
4. **Integrity gate.** Only if `contentDigests != null` **and** a digest exists **for this exact entry name**:
   if `!isContentDigestEqual(urlContent, digest)` → damaged; try `findUserPreferencesContent`; else record as
   invalid and return.
5. **Sharing gate.** If `preferencesContentsCache != null && preferPreferencesContent`, scan every catalog
   icon/model/planIcon/texture image for a digest-equal file and **return the catalog instance**.
6. Otherwise keep `urlContent` and remember it in `validContentsNotInPreferences`.

**How the gates are switched on** (`src/SweetHome3D.java` line 199, `HomeFileRecorder` javadoc lines 119–128):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

So in the shipping desktop app: **catalog content is used *only* for repair** (step 2/4), and step 5 is dead.
The flag exists because the same recorder class also serves scenarios (applet/URL mode) where the embedded copy
is worthless and sharing the installed catalog is preferable. **DOCUMENTED**.

**`preferencesContentsCache`** is just a `HashSet<URLContent>` built from every catalog piece's icon, model and
planIcon plus every `CatalogTexture` image (`getUserPreferencesContent`, lines 242–263) — a *flat candidate
list*, deliberately not indexed by digest (the digest is computed lazily and cached per content in a
`WeakHashMap`). **DOCUMENTED**.

**One more resolution rule on the identity side:** the online page, after loading a home, walks every piece,
looks up its `catalogId` in the *current* catalog and **overwrites the piece name with the catalog name**
(`online_app.html`, `recorderObserver.homeLoaded` → `renameToCatalogName`). That is the UI-level half of
"catalog vs embedded": the file stores `catalogId` + embedded geometry + fallback name, and the app re-binds
the *display* identity from the catalog when the id still exists. `catalogId` is also what makes the
container-independent branch of `parseContent` possible. **OBSERVED**.

### 2.6 Damaged-home repair and the three-way recovery dialog

If any content was invalid and no catalog substitute existed, `readHome` throws
`DamagedHomeIOException(home, contentContext.getInvalidContents())`, which `HomeFileRecorder.readHome` wraps as
`DamagedHomeRecorderException` (retaining the partially-built home). `HomeController.openDamagedHome`
(lines 2163–2199) asks the user and then either deletes the objects referencing the invalid content
(`removeDamagedItems`) or replaces them (`replaceDamagedItems`), sets `home.setRepaired(true)` and opens the
home. Two distinct flags are surfaced: `containsInvalidContents()` (something was invalid, whether or not it
was substituted) and `containsCheckedContents()` (`contentDigests != null && invalidContents.isEmpty()`, i.e.
the ledger was present and nothing failed) — the latter is what guards the "repaired" flag in
`readHome` lines 317–324. `Home.isRepaired()` is a *transient* property, so it never round-trips into a saved
file. **DOCUMENTED** + **OBSERVED**.

Note also the pre-flight in `readHome` (lines 238–258): before parsing, the stream is scanned twice for ZIP
validity (`isZipFileValidUsingInputStream`, then `isZipFileValidUsingDictionnary`) and, if truncated, a
**temporary `.sh3d` copy containing only the readable entries** is built with stored entries only. So the
container tolerates a physically truncated tail independent of `ContentDigests`. **DOCUMENTED**.

### 2.7 The HTML5 / JS Online build (round-1 gap; this round found the missing scripts)

Round 1 analysed `sweethome3d.min.js` + 8 libs and could not find `ContentDigests`. That file indeed does
**not** contain the string `ContentDigests` — because the container reader/writer is a **separate script**,
`/libjs/recorderworker.min.js?version=7.5.2a`, which round 1 did not download. Re-fetching the page's script
list (which now also includes a service worker and `crypto-js`) closed the gap. **OBSERVED**.

Now retained in `js/`:

| Script | Role |
|---|---|
| `recorderworker.min.js` (35 KB) | `HomeRecorder`, `ZIPTools`, `LocalURLContent`, `BlobURLContent`, `LocalStorageURLContent`, `IndexedDBURLContent`. Contains the `"Home.xml"` literal and the whole home read/write pipeline. |
| `resourceCache.js` (1.2 KB) | Service worker; on `fetch`, if the URL contains `/online/readResource.jsp?`, answers from a `Cache` storage bucket `RESOURCE_CACHE` keyed by the request URL, else fetches and stores a clone (only on `response.ok && status === 200`), and returns `503 Offline` on network error. |
| `SweetHome3D.js` (3.8 KB) | Site chrome only (platform images, search placeholder). **It contains no `.sh3d` logic at all** — worth recording so nobody re-analyses it. |
| `FurnitureCatalog.json` (679 KB) | The JS furniture catalog, with pre-computed digests (below). |

**JS `ContentDigestManager`** (`recorderworker.min.js`, single minified statement, verbatim behaviour):

- cache key is always `content.getURL()` (a string), value is the **base64 digest string**;
- `equals(a,b)` is `cache[a.url] === cache[b.url]` — so it is *false* until at least one side's digest has been
  computed, and it treats two contents as equal when both map to the same digest string (no `INVALID_CONTENT`
  sentinel as in Java);
- `setContentDigest(content, digest)` also records `permanentContents[digest] = content` — the JS port's
  addition for the blob-extraction path;
- `getContentDigest(content, observer)` is **asynchronous** with `digestReady(content, digest)` /
  `digestError(...)` callbacks; if the digest is already cached it calls back synchronously;
- `getZipContentDigest`: opens the ZIP, takes entries matching `^<dir>.*`, sorts them, and concatenates their
  bytes (skipping the directory entry itself and `!isSignificant(name)`), then hashes the concatenation — the
  same "hash the folder" rule as Java;
- `getURLContentDigest`: `XMLHttpRequest` with `responseType = "arraybuffer"`, then
  `crypto.subtle.digest("SHA-1", …)` with a `catch` that falls back to `"SHA-256"`, base64 via
  `btoa(String.fromCharCode(...))`;
- `isSignificant(name)`: not `LICENSE.TXT`, not ending in `/LICENSE.TXT` — identical rule.

**Pre-computed digests in the catalog.** `FurnitureCatalog.json` is a flat property map with keys `name#index`
(a `ResourceBundle`-style layout, `getKey(k,i) => k+"#"+i`). Analysis of the live file
(`evidence/furniture_catalog_analysis.txt`):

| Quantity | Value |
|---|---|
| indexed records | 1740 (805 with an `id`) |
| `iconDigest` keys | 805 |
| `modelDigest` keys | 805 |
| `planIconDigest` keys | 2 |
| `multiPartModel` keys | 667 (i.e. most models are folders, not single files) |
| digest key/value pairs | 1612 |
| values that are **not** 20-byte base64 (SHA-1) | 0 |
| distinct digest values | 1610 of 1612 |

This is the catalog half of `ContentDigests`: the browser can populate its digest cache at catalogue-load
time (`setContentDigest` from `iconDigest`/`modelDigest`) and therefore **never has to download a model just
to identify or compare it**. The desktop `DefaultFurnitureCatalog` does exactly the same from `.properties`
keys (`ICON_DIGEST("iconDigest")`, `PLAN_ICON_DIGEST`, `MODEL_DIGEST`; `getContent` lines 961–974), and the
code comments say why: *"it's not recommended to store digests in sh3f and imported files. Missing digests
will be computed on demand, ensuring it will be updated in case content is damaged."* **OBSERVED** +
**DOCUMENTED**.

**Read path in JS** (`HomeRecorder.readHome`, `parseHomeXMLEntry`, `replaceHomeContents`):

1. `readHome(url, observer)` forces the entry name to the literal `"Home.xml"` and, if the URL starts with
   `jar:`, splits `jar:<zip>!/<entry>` and uses `<entry>` as the entry name — so the JS build** reads only
   `Home.xml`, never the binary `Home` entry**.
2. It opens the ZIP via `ZIPTools.getZIP` and errors with `"No <entry> entry in <url>"` if absent.
3. It parses the text with the SAX parser after `g.replace(/'/g, '"')` — i.e. it normalises the single-quoted
   XML attribute syntax that the desktop exporter emits. The handler is given `homeUrl = <the zip url>`, and
   `HomeXMLHandler.parseContent` (in `sweethome3d.min.js`) resolves a non-`://` attribute as
   `new HomeURLContent("jar:" + homeUrl + "!/" + f)`.
4. `replaceHomeContents` optionally seeds the digest cache from a **cache-listing service**
   (`listCacheResourcesURL` + `readCacheResourceURL`), three interchangeable backends: `localStorage`,
   `indexedDB`, or an HTTP `GET … ?requestId=<uuid>` returning `[{name, digest}, …]`. Digests are written back
   with `setContentDigest`.
5. `replaceOrExtractHomeContents` finds every `HomeURLContent`; for each, it either matches a
   `getPermanentContentDigest` previously seeded object, or **extracts** it: a single image is written to the
   cache as a plain blob, a multi-part model is re-zipped (`writeHomeZipEntries` + `generateZip`) and written
   as an `application/zip` blob, and a non-image single file is wrapped as a tiny zip entry named `data`
   (hence URLs like `…!<uuid>.extract`). Only contents **not** matched are extracted, which is the browser's
   equivalent of `validContentsNotInPreferences`.
6. `agent` note: `HomeRecorder.cacheResourcesStoredInContentDigestManager` is a static flag guarding a
   one-shot seeding of the cache.

**Write path in JS** (`generateHomeZip`) is the clearest statement of the design trade-off: it builds a
`JSZip`, always does `zip.file("Home.xml", xml)`, then for each saved content writes either the sibling group
(`writeHomeZipEntries`) or one entry (`writeZipEntry`) under the `savedContentNames` map. It **never writes a
`ContentDigests` entry** and there is no `ContentDigests` literal anywhere in `js/` or `online_js/`. So the
browser edition is a **writer of ledger-less `.sh3d` files and a reader of ledger-ful ones**: it consumes
`ContentDigests` through the desktop path only via its async digest seeding, and it produces files for which
the desktop app must fall back on the "older than version 4.4" dedup scan and on ZIP-validity pre-flight.
**OBSERVED** (absence is evidence here: `grep -rl ContentDigests js/ online_js/` returns nothing).

De-dup on the JS save path mirrors Java: for each content it hashes it, then scans the previously-kept list
and, on a digest match with a *different* URL, reuses the earlier `savedContentNames` value and removes the
duplicate from the list. **OBSERVED**.

### 2.8 What the file format does *not* store (also part of the answer)

- No ledger entry for `Home`, `Home.xml` or `ContentDigests` themselves.
- No per-object `contentRef` inside `Home.xml` beyond the `model`/`icon`/`planIcon`/`image` attribute — the
  attribute *is* the reference, and it is a name, not a hash. Hash equality is never used for XML lookup.
- No compression metadata: the writer passes `zipOut.setLevel(compressionLevel)` and stores/`DEFLATE`s
  uniformly; the JS writer chooses `"STORE"` when level `=== 0`, else `"DEFLATE"` with the level.
- No MIME type per entry: the JS extraction path sniffs PNG/GIF/JPEG/BMP by magic bytes
  (`ZIPTools.isPNGImage` etc.) to decide whether a content can be cached as a plain image.
  **DOCUMENTED** + **OBSERVED**.

### 2.9 Behavioural rules worth stealing (stated independently, no code copied)

1. **Reference assets by a stable *name/path*, and keep a separate *digest* only for repair and dedup.**
   Names are cheap to write and diff; digests are only consulted when something is already suspect.
2. **One digest per *asset bundle*, not per file** — the folder is the unit (`.obj` + `.mtl` + textures).
   Exclude licence/readme files from the hash so they can change freely.
3. **Persist asset sizes next to the plan** so the UI can flag "model missing / wrong size" without re-reading
   or hashing anything.
4. **De-duplicate on save, by content equality, first-match-wins** — and *never* merge contents whose digest
   could not be computed.
5. **Make catalog lookup a *fallback*, ordered after the embedded copy, and gate the aggressive
   "prefer the catalog" behaviour behind an explicit flag** — because the correct answer depends on whether
   the app is a local editor (embedded wins) or a thin client (catalog wins).
6. **A three-way recovery prompt (remove / replace / don't open) beats failing the load** once you have a
   partial object graph in hand.
7. **Pre-compute digests into the catalog** when the catalog is a server resource, so the client never
   downloads to compare.

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Context used: CasaPlazAI is a single-page app, no backend, `FloorplanData` (`schemaVersion: 1`, metres) in
localStorage; furniture is a closed `type` enum of 7 pieces with `footprint`; textures are a 3-value enum
(`wood|tile|carpet|concrete`); the blueprint underlay is deliberately **out of schema** under
`casaplaza.underlay.v1`. Findings above are cited per row.

| # | Idea | Tied to | Value | Effort | Why / how, concretely for CasaPlazAI |
|---|---|---|---|---|---|
| 1 | **Write a `contentManifest` block next to `FloorplanData`** (`{ assetKey: {mime, bytes, sha256} }`) covering the underlay image and any future imported model, with the *digest used only for recovery*. | §2.1–2.2, §2.9.1 | High | Low | The underlay is already an out-of-schema per-floor blob in localStorage with no integrity story; a manifest entry per asset keyed by the same key the schema uses gives "detect + recover last good" for free without touching `FloorplanData`. Matches the SH3D rule that identity is the name, digest is the audit trail. |
| 2 | **Recovery flow on digest/parse mismatch: remove / replace-with-builtin / discard, never a blank app.** | §2.6, §2.9.6 | High | Low | CasaPlazAI autosaves with no undo of a *bad* save. The three-option prompt plus a "last good" slot is exactly SH3D's `openDamagedHome`; for a palette of 7 built-ins, "replace" maps to the built-in type's default footprint. |
| 3 | **Content-addressed dedup for repeated assets across floors** — one hash-keyed blob store, per-floor keys reference it. | §2.3, §2.9.4 | High | Medium | localStorage ~5 MB: the same traced blueprint or a repeated texture should be stored once. SH3D's proof (268 pieces → 121 blobs) is the model. Use SHA-256 like the JS fallback path; skip hashing anything you cannot read. |
| 4 | **Introduce a stable `catalogId` on `FurnitureItem` distinct from `type`**, plus an optional `assetRef` fallback. | §2.5, §2.9.5 | High | Low | The closed 7-type enum is fine for the palette but bakes display identity into the file. `catalogId` (slug) + `type` keeps validation working and lets a plan survive renaming/re-styling a palette item, exactly like SH3D's `catalogId` + `renameToCatalogName`. |
| 5 | **Persist a `footprint`-independent asset size per palette item** and show "missing/odd size" in the inspector without re-rendering. | §2.4, §2.9.3 | Medium | Low | Cheap: the palette is code, so sizes are constants; the win is the pattern (validate cheap metadata before expensive work) and it extends to any user-imported model later. |
| 6 | **Store per-item thumbnails as digests, not blobs, in `FurnitureItem`** — two visual surfaces (3D thumb + plan symbol), like `icon` vs `planIcon`. | §2.7 | Medium | Medium | SH3D persists both; the CasaPlazAI inspector/tool card will want a plan symbol and a 3D thumb. Storing `iconDigest`/`planIconDigest` into the built-in table avoids duplicating image data per plan. |
| 7 | **Version the asset namespace, not just the plan**: `schemaVersion` gates `FloorplanData`, but asset keys need their own `assetsVersion`. | §2.1, §2.9.2 | Medium | Low | SH3D's `ContentDigests-Version: 1.0` is checked with `startsWith(...)`, so old ledgers remain readable; CasaPlazAI should read unknown asset versions leniently and reject only `FloorplanData` versions. |
| 8 | **Cache the built-in palette in the Service Worker / Cache API** if the app ever moves assets out of the JS bundle. | §2.7 (`resourceCache.js`) | Low (now) | Medium | The pattern — cache only `response.ok && status === 200`, serve `503 Offline` on failure, key by request URL — is directly reusable and is the cheapest offline story for a backend-less app. |
| 9 | **Export an `.sh3d`-like archive later (JSON + assets + manifest)** rather than embedding binaries in localStorage. | §2.2, §2.3 | Low | High | Out of scope for the redesign; worth noting that the manifest+digest design in idea 1 is the on-ramp. |

---

## 4. Unknowns

1. **`ContentDigests` is not a formal spec.** There is no DTD/schema for it (the DTD covers only `Home.xml`),
   and the reader is whitespace-lenient (`startsWith("Name:")` at column 0, `.trim()` on the value). Any
   independent implementation should treat it as a de-facto convention. **I did not find a vendor document
   describing it** — everything here is from the shipped GPL source plus a real file.
2. **Version→feature table still incomplete** (round-1 Unknown #4). I verified by block position that
   "Avoided data duplicates in SH3D files during saving" and "Added an option to repair damaged SH3D files"
   both sit inside the `Version 4.4, June 12, 2014` block of the history page, which is the only in-source
   statement I have; I did not check it against release tags or a changelog file.
3. **`modelSize` outliers unresolved.** 116/121 match the main `.obj` file size exactly, but `rug.obj`,
   `doubleHungWindow80x122.obj`, `fixedWindow85x123.obj` and `black-toilet-3.obj` do not match either the file
   or the directory total. My "re-saved after cataloguing" reading is **INFERRED**, not verified.
4. **The browser-side `ContentDigests` reader path is inferred from absence + async plumbing.** I confirmed
   the string `ContentDigests` appears nowhere in the shipped JS, and that `HomeRecorder.readHome` hard-codes
   `"Home.xml"`. I could **not** confirm by execution whether some other code path checks per-content digests
   against `serverDigest` after parsing; the async `replaceOrExtractHomeContents` machinery clearly *can*, and
   `recorderworker.writeHome` never writes the ledger. A runtime trace of a real in-browser `.sh3d` load would
   settle it.
5. **`listCacheResourcesURL` / `readCacheResourceURL` for the live online app were not resolved.** The
   registered `/online/` page redirected (301) without credentials and I did not create an account (per task
   rules), so I could not see whether the anonymous edition seeds digests from a server list, an IndexedDB
   database, or nothing. The three backends are all present in the code; which one is configured is unknown.
6. **No runtime execution of the JS container logic.** I did not run `rea capture-browser-scenario` against
   the online page: round 1 recorded that this page exceeds the provider's 200 s deadline, and my question is
   fully answerable from the shipped scripts. All JS claims are static-analysis **OBSERVED**.
7. **Desktop app not installed or run** (GPL / task rules); desktop behaviour is from source + real files.
8. **Licensing.** Sweet Home 3D and its format descriptions are **GPL-2.0-or-later**; catalog assets/gallery
   homes are **CC-BY / GPL**; the site's JS is proprietary site code over a GPL-derived bundle. Everything in
   this folder is retained as reference evidence for behavioural description only. **No code is copied into
   any CasaPlazAI deliverable.**

---

## 5. Evidence map for this job

| Path | What it is |
|---|---|
| `src/ContentDigestManager.java` | **Primary source.** Digest computation, multi-part folder hashing, `isSignificant`, `equals`, size lookup, `ZipEntryData` sort/binary-search |
| `src/HomeContentContext.java` | **Primary source.** `readContentDigests` grammar, `lookupContent` gate ordering, `findUserPreferencesContent`, `getUserPreferencesContent` |
| `src/DefaultHomeOutputStream.java` | Digest entry writer, `HomeContentObjectsTracker` naming/dedup, sibling-file writing |
| `src/DefaultHomeInputStream.java` | Entry priority, ZIP-VALIDITY pre-flight, `checkModelSizes`, `jar:file:temp!/` rewrite |
| `src/URLContent.java`, `src/ResourceURLContent.java`, `src/HomeURLContent.java`, `src/SimpleURLContent.java`, `src/TemporaryURLContent.java`, `src/Content.java`, `src/ContentRecording.java` | The content class family and the `INCLUDE_ALL/TEMPORARY/NO_CONTENT` recording modes |
| `src/DefaultFurnitureCatalog.java`, `src/DefaultTexturesCatalog.java` | Catalog `iconDigest`/`planIconDigest`/`modelDigest`/`imageDigest` keys and `setContentDigest` seeding |
| `src/SweetHome3D.java`, `src/app_HomeController.java`, `src/app_HomePane.java` | Recorder flags (`preferPreferencesContent=false`, `preferXmlEntry=true`), damaged-home dialog, remove/replace repair |
| `src/CatalogPieceOfFurniture.java`, `src/CatalogTexture.java` | Catalog content accessors used by `preferencesContentsCache` |
| `js/recorderworker.min.js` | Shipped JS container reader/writer: `HomeRecorder`, `ZIPTools`, `LocalStorageURLContent`, `IndexedDBURLContent`, `BlobURLContent`, async `ContentDigestManager` |
| `js/resourceCache.js` | Shipped service worker (Cache API, `/online/readResource.jsp?`) |
| `js/SweetHome3D.js` | Shipped page-chrome script — confirmed to contain no `.sh3d` logic |
| `js/FurnitureCatalog.json` | Live JS catalog with 805 `modelDigest` + 805 `iconDigest` + 667 `multiPartModel` flags |
| `evidence/analysis_digests.json` | Machine-readable correlation of `Blues` `ContentDigests` vs `Home.xml` (262 = 121+121+20, 0 dup digests, 268→121 pieces→models) |
| `evidence/furniture_catalog_analysis.txt` | Key census of the live JS `FurnitureCatalog.json` and its digest values |
| `evidence/blues_ContentDigests.txt` | Verbatim copy of the real `ContentDigests` entry (grammar proof) |
| `evidence/blues_Home_head.xml`, `evidence/blues_ziplisting_head.txt` | Head of the real `Home.xml` and ZIP inventory, showing `model=`/`icon=` names and the `<index>/<folder>/` layout |
| Round-1 folder (read-only) | `docs_src/HomeXMLHandler.java` (lines 1929–1992 = the catalog-vs-embedded branch), `docs_src/HomeFileRecorder.java`, `docs_src/HomeXMLExporter.java`, `docs_html_history.html` |

Nothing in the round-1 folder was modified. All new files are inside this job folder.
