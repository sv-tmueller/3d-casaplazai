# Sweet Home 3D — file-format **versioning & migration**, compatibility and damage recovery

Job: `01-06a-sh3d-file-format-versioning` (Round 2 — deeper dive on one narrow question).
App: **Sweet Home 3D 7.5.x** — GPL-2.0+ Java desktop app + the HTML5 "Sweet Home 3D JS Online" built from the same Java core.
Target: <https://www.sweethome3d.com/de/> · browser edition <https://www.sweethome3d.com/SweetHome3DJSOnline.jsp>
Round-1 report reused read-only: `rea-sweethome3d-2026-10/06-06-sh3d-file-format/report.md` (its *Unknown #4* = my question). This report does **not** repeat §2.1–2.9 of that report except where needed to answer my question.

Evidence legend: **OBSERVED** = a live URL or a real, saved artefact in this folder · **DOCUMENTED** = shipped source / vendor page · **INFERRED** = my reasoning.

---

## 1. Summary (5 bullets)

- **One monotonic integer version, set on every write.** `<home version='7400'>` is *the* format version: `CURRENT_VERSION = 7400`, and the comment defines it as "each time the field list is changed… this number is increased". Its value looks like an app version (`major×1000+minor×100`) but is **not** one — the 7.5.2 release still writes `7400` because 7.5 changed no fields. The attribute is `#IMPLIED` (may be absent) and absent means "assume current". A **2024 build still reads and ships files written at `version='5300'`** — I confirmed a 5300→5500→6000→7000→7400 ladder across 12 live example files (`evidence/VERSION_SAMPLES.txt`), and the JS bundle and the Java core share the same constant and read logic. **OBSERVED** (`Home.java:44–49`, `sweethome3d.min.js` `CURRENT_VERSION=7400`, `evidence/sh3d/*.sh3d`).
- **Upgrades are in-memory, inline version comparisons — there is no published migration script table.** Reading runs `Home.readObject` (binary entry) and `HomeXMLHandler` (XML entry), each with a handful of `if (version < N)` fix-ups (`<=3400` darken ground colour; `<6400` recreate environment/compass/cameras with canonical IDs; `<5500` `modelCenteredAtOrigin` default; a self-referencing-wall guard for the v6.4 bug). The XML path has only **one** version check. **DOCUMENTED** (`Home.java:257–381`, `HomeXMLHandler.java:871,1398`).
- **Forward compatibility is "warn, don't block":** if `home.getVersion() > CURRENT_VERSION`, opening shows *"was created with a more recent version… could be lost if saved"*, and saving re-confirms with **Do not save** as the default. The SAX parser is **non-validating** and the handler silently ignores element/attribute names it does not know, so a newer file opens but unknown data is dropped. **OBSERVED** (`HomeController.java:379–390, 2578–2580`; `HomePane.java:4654`; `SAXParserFactory` usage at `DefaultHomeInputStream.java:370`; strings in `viewcontroller/package.properties`).
- **Backward compatibility on write is real but only for the binary ZIP entry.** `KEEP_BACKWARD_COMPATIBLITY = true`; before Java-serialising, `Home.writeObject` temporarily flattens furniture groups (`<2.3`), strips doors/windows into a separate list (`<1.7`), filters the sortable-property list to the original enum, and copies environment colours back onto legacy top-level fields, restoring the live object in a `finally` block. The XML entry is written as-is. **DOCUMENTED** (`Home.java:56, 482–556`).
- **Damage recovery is a first-class, three-way user decision backed by SHA-1 digests and ZIP salvage.** Since v4.4 the writer emits a `ContentDigests` entry; the reader re-hashes each referenced asset, silently substitutes a matching asset from user preferences, and if anything is still broken either flags the home as `repaired` (when digests let it fully verify) or raises `DamagedHomeIOException` to a dialog: **Remove damaged items / Replace damaged items (red placeholders) / Don't open**. A truncated ZIP is salvaged entry-by-entry into a temporary file. Saves go to a temp file, are disk-space-checked and prefix-checked, then replace the target, and a separate `AutoRecoveryManager` autosaves modified homes to `recovery/*.recovered` every 10 minutes for crash recovery. **OBSERVED/DOCUMENTED** (`DefaultHomeInputStream.java:217–341,390–526`, `HomeContentContext.java:78–202`, `HomeController.java:2100–2294`, `HomePane.java:4433–4454`, `HomeFileRecorder.java:176–352`, `AutoRecoveryManager.java`, `DefaultHomeOutputStream.java:177–193`).

---

## 2. Findings

### 2.1 The `version` attribute: where it lives, what it means, what is written

**Root attribute only.** The DTD (fetched live, see §2.9) declares:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

There is **no per-object version** and no format-name/namespace; one integer covers the whole document. `grep -i version` over the entire live DTD returns exactly one match outside the licence header — line 24, the `home` attribute. **OBSERVED** (`evidence/vendor/SweetHome3D.dtd`).

**The escape hatch that avoids most version bumps.** Beside `version`, the root carries an open key/value bag declared as:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

A `property` can hold a free string **or a content reference**. Round 1 observed the examples using it for `Author` / `Copyright` / `License` / `TotalArea`. **INFERRED:** this is the "additive metadata without touching the schema" channel — new *extensional* data rides in properties (ignored by readers that do not look for them), and only *structural* changes (new element/attribute shapes) force a `CURRENT_VERSION` bump. It is a useful pattern for CasaPlazAI: keep `schemaVersion` for structure, and provide one free-form `meta` bag for annotations so adding e.g. a "north angle" or "project notes" field never needs a migration.

**Semantics — "field list changed", not "feature added", and not the running app version.** The shipped comment is explicit:

> *"The current version of this home. Each time the field list is changed in `Home` class or in one of the classes that it uses, this number is increased."*
> — `Home.java:44–49`

So the version is a **model schema revision**, incremented when the serialised shape changes. Its *value* is `major×1000 + minor×100` of the release in which the last format change landed — which is why it reads like an app version but is **not** one: current release 7.5.2 still writes `7400`, because 7.5/7.5.2 changed no fields (the only data-shape fix in 7.5.2 was in the *furniture library* format, not `Home`). `getVersion()` is documented as *"useful to know with which Sweet Home 3D version this home was saved… [to detect] a home created by a more recent version"*. **DOCUMENTED** (`Home.java:1943–1951`). **INFERRED:** the upshot for a consumer is that the number is a *schema* level, so a reader should compare it against its own schema level, not against an app release string.

**Who sets it.**
| Path | Code | Effect |
|---|---|---|
| Java binary write | `Home.writeObject` first line: `this.version = CURRENT_VERSION;` | any save stamps the current version |
| XML write | `HomeXMLExporter` line 114–115: `home.setVersion(Home.CURRENT_VERSION); writer.writeAttribute("version", …)` | same |
| New in-memory home | `Home.init`: `this.version = CURRENT_VERSION` | absent attribute ⇒ treated as current |
| XML read | `HomeXMLHandler.createHome`: `Integer.parseInt(attributes.get("version"))`, `NumberFormatException` → `SAXException("Invalid value for integer attribute version")` | a non-numeric version is a hard parse failure |
| JS write | `HomeXMLExporter.writeAttributes…`: `d.setVersion(Home.CURRENT_VERSION)`; `CURRENT_VERSION=7400` | identical in the browser |

**OBSERVED** (`Home.java:432, 483`; `HomeXMLExporter.java:114–115`; `HomeXMLHandler.java:900–917`; `sweethome3d.min.js` at offsets 365565 and 1191943).

**Values seen in the wild — an eight-year ladder.** I downloaded 12 shipping example files from the live `https://www.sweethome3d.com/examples/` directory and read each one's `Home.xml` root tag. Every one declares a version, and the values span the whole history:

| File | `version` | binary `Home` entry | `ContentDigests` |
|---|---|---|---|
| `SweetHome3DExample.sh3d`, `…Example2/3/4/8.sh3d`, `userGuideExample.sh3d` | `5300` | yes | no |
| `SweetHome3DExample12-LoftWithOffice.sh3d` | `5500` | yes | no |
| `SweetHome3DExample13-AlpsHotel.sh3d`, `…Example15-HouseWithDormers.sh3d` | `6000` | yes | no |
| `SweetHome3DExample17-StudioWithMezzanine.sh3d` | `7000` | yes | no |
| `SweetHome3DExample19-MasProvencal.sh3d`, `…Example20-TinyHouse.sh3d` | `7400` | yes | only TinyHouse |
| bundled `examples/*.xml` (round 1) | `5500` | n/a | n/a |
| gallery `Blues.sh3d` (round 1) | `7400` | yes | yes |
| `.sh3x` demos `Studio`, `2BedroomApartment`, `3BedroomHouseWithAttic` | `5500` | **no** | no |
| `.sh3x` demo `EmptyHome` | **absent** | no | no |

This is direct evidence that (a) the attribute is honoured across a decade of files, (b) a **2024 build still ships and reads `version='5300'` files unchanged** — the files are never rewritten by the vendor — and (c) `ContentDigests` really is optional and appears only in newer/large files. The `EmptyHome.sh3x` demo carries **no** `version` at all. **OBSERVED** (`evidence/VERSION_SAMPLES.txt`, `evidence/sh3d/*.sh3d`, `evidence/sh3x/*.sh3x`).

**INFERRED:** because the default is "current", a document with a missing version cannot be distinguished from a modern one; the app trusts it. That is safe for a fresh/empty file but means a hand-edited file that loses its `version` attribute will be treated as current and get the current version written back on the next save.

**Type mismatch worth noting:** `Home.version` is a `long`, `setVersion(long)`, but the XML reader uses `Integer.parseInt` and the JS `parseInt` — so the practical domain is 32-bit integers. **OBSERVED** (`Home.java:1959`, `HomeXMLHandler.java:911`).

### 2.2 Read path: how an old file is upgraded

Two readers, two migration styles, joined by the "prefer `Home.xml`" rule from round 1.

**(a) Binary entry — `Home.readObject` is a migration routine.** It starts with `init(false)`, calls `in.defaultReadObject()`, then under `KEEP_BACKWARD_COMPATIBLITY`:

| Trigger | Fix-up | Source |
|---|---|---|
| always | reconcile `furnitureSortedProperty` ↔ `furnitureSortedPropertyName`; unknown enum constants ignored | `Home.java:200–227` |
| always | every wall with `height == null` inherits `home.wallHeight` | `:229–234` |
| always | restore doors/windows and groups from their side-channel fields (`furnitureWithDoorsAndWindows`, `furnitureWithGroups`) | `:236–248` |
| always | copy legacy top-level environment fields (`groundColor`, `groundTexture`, `skyColor`, `lightColor`, `wallsAlpha`) into `HomeEnvironment` | `:250–255` |
| **`version <= 3400`** | darken the ground colour by ¾ per channel (levels-era colour model change) | `:257–264` |
| always | assign `elevationIndex` 0/prev+1 for any level left at `-1` | `:266–283` |
| always | migrate a hard-coded list of ~30 "visual properties" (dialog positions, viewport, frame geometry, plan scale…) into plain string properties | `:285–313` |
| **`version < 6400`** | rebuild `environment`, `compass`, `topCamera`, `observerCamera` as *copies with canonical IDs* (`environment-homeEnvironment`, `compass-homeCompass`, `camera-homeTopCamera`, `observerCamera-homeObserverCamera`), preserving every field | `:315–381` |

**INFERRED:** this is why the v6.4 release note says "Added IDs to home objects which may be modified" — before 6400 the singleton objects had no stable IDs, so the loader re-creates them with the IDs the 6.4+ UI expects. This is an *id migration*, the classic case an application schema has to handle exactly once.

**(b) XML entry — deliberately thin.** `HomeXMLHandler` is a SAX handler built from a flat chain of `if ("elementName".equals(name))` branches; the **only** version comparison in the whole 2038-line class is:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `HomeXMLHandler.java:1398`

plus a defensive re-bind of wall joins that refuses self-references, with the comment *"Check wall doesn't point to itself (bug in version 6.4)"* (`:868–884`).

**Why so few checks?** The XML form was only introduced in **5.3** (§2.9), by which point the design had settled; the effort of reading old shapes was pushed into the DTD **defaults** (round-1 §2.3) and the exporter omitting any value equal to its declared default. Migration is therefore mostly *absence-handling*, not transformation.

**(c) The parser is NOT validating.** `DefaultHomeInputStream.readHomeXML` does:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `DefaultHomeInputStream.java:368–374`

No `setValidating(true)`, no schema/DTD feature flags. **OBSERVED from source.** Consequence (INFERRED): the shipped `SweetHome3D.dtd` is a *published contract and documentation*, not a runtime gate; malformed-but-parseable XML is accepted, and name/attribute mismatches are silently ignored by the if/else chain.

**No version→script table, and no lower-bound refusal.** `grep getVersion()` across the model/io layer returns exactly three call sites (the `Home.java` getter, the exporter write, and the `< 5500` check). Searching every Java file I hold for any numeric comparison against the version yields only:

```
HomeXMLHandler.java:1398   this.home.getVersion() < 5500
HomeController.java:381    this.home.getVersion() > Home.CURRENT_VERSION     // warn on open
HomeController.java:2578   this.home.getVersion() <= Home.CURRENT_VERSION    // allow save
```

There is **no minimum supported version and no "file too old" error path** — a `version='5300'` file (2016-era) is read by the 2024 build with no message at all, which the 12-file sample corroborates. There is no migration registry, no migration class per version, and no "applied migrations" bookkeeping. Migrations are **idempotent inline guards applied at load time**, not one-shot transforms, and they are not re-run on save — the next save simply stamps `7400` and writes the current shape. **OBSERVED.**

### 2.3 Forward compatibility: "warn, don't block"

Two guard rails exist, both user-facing and both *soft*.

**On open** (`HomeController.getView`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `evidence/src/HomeController_utf8.java:379–390`

The message (`viewcontroller/package.properties:81`):

> **"The home "%s" was created with a more recent version of Sweet Home 3D."**
> *"The information added to home in that version won't appear with the version of Sweet Home 3D you use now, and could be lost if this home is saved."*

**On save** (`HomeController.save`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `evidence/src/HomeController_utf8.java:2572–2580`

`HomePane.confirmSaveNewerHome` is a 2-button `YES_NO_OPTION` dialog whose **default is "Do not save"**:

> **"Do you want really to save home "%s"?"** — *"This home was created with a more recent version of Sweet Home 3D. The information added to home in that version will be lost if you save it with the version of Sweet Home 3D you use now."*
> Buttons: `Save` / `Do not save` (default).
— `evidence/src/HomePane_utf8.java:4654–4665`, strings at `swing/package.properties:1573–1582`

**The browser edition implements the identical two guards** — `getVersion() > Home.CURRENT_VERSION` → `showMessage(moreRecentVersionHome)` (bundle offset 990447) — proving the check is in shared model/controller logic, not desktop-only UI. **OBSERVED** (`sweethome3d.min.js`).

**INFERRED:** the design intent is *"a newer file is data you may read but must not silently re-save"*. It is not a schema-validation refusal: the parser will happily produce a `Home` from a document containing elements it has never heard of, dropping them, and the only protection against committing that loss is the save confirmation. The one hard failure is a non-numeric `version` attribute (§2.1), which throws `SAXException`.

### 2.4 Backward compatibility machinery when writing

The writer deliberately makes itself older-reader-friendly. `KEEP_BACKWARD_COMPATIBLITY = true` (`Home.java:56`) gates a block in `writeObject` (`:482–556`) that, in a `try/finally`, mutates the live object into a legacy shape, serialises it, and then restores it:

| Legacy field written | Compatibility target | Comment in source |
|---|---|---|
| `furnitureWithDoorsAndWindows` | readers **< 1.7** | "Serialize a furnitureWithDoorsAndWindows field that contains only HomePieceOfFurniture, HomeDoorOrWindow and HomeLight instances" |
| `furnitureWithGroups` | readers **< 2.3** | "Store referenced HomeFurnitureGroup instances in a separate field" |
| `furniture` (flattened, non-group pieces re-wrapped as plain `HomePieceOfFurniture`) | pre-groups readers | un-groups recursively via `getGroupFurniture` |
| `furnitureSortedProperty` / `furnitureVisibleProperties` (only members of the original enum survive) | first `HomePieceOfFurniture.SortableProperty` set | `isFurnitureSortedPropertyBackwardCompatible` returns true only for NAME, WIDTH, DEPTH, HEIGHT, MOVABLE, DOOR_OR_WINDOW, COLOR, VISIBLE, X, Y, ELEVATION, ANGLE |
| top-level `skyColor`, `groundColor`, `groundTexture`, `lightColor`, `wallsAlpha` | readers that predate `HomeEnvironment` | "Store environment fields in home fields for compatibility reasons" |

Fields are *still declared* purely for this purpose and annotated as such: `// The 5 following environment fields are still declared for compatibility reasons` (`Home.java:118–132`). **DOCUMENTED.**

**Important asymmetry (INFERRED):** *all* of this applies only to the binary `Home` ZIP entry. The `Home.xml` entry is exported straight from the current object; there is no "old-XML" mode. So backward compatibility exists to keep old **Java readers** alive, while old XML readers rely on the DTD defaults instead.

**Two synchronised version copies per file.** Because both writers stamp `CURRENT_VERSION`, a desktop `.sh3d` carries the version **twice** — once inside the serialised `Home` object (`writeObject`) and once as the XML attribute (`HomeXMLExporter:114`). The desktop app constructs its recorders with `preferXmlEntry = true` for both the uncompressed (level 0) and compressed (level 9) recorders (`SweetHome3D.java:196–214`), so it always writes *both* entries and prefers XML on read (round-1 §2.2). **INFERRED:** in a hand-edited or partially-repaired file the two can disagree, and the XML copy silently wins — a small but real single-source-of-truth risk that a JSON blob does not have.

**Also relevant:** writers **remove** nothing — the exporter *omits* values equal to the DTD default (round-1 §2.3), which is itself a backwards-compat strategy: a default-valued attribute simply does not appear, so old readers never see it.

### 2.5 Damaged-file recovery: digests, salvage, and the three-way dialog

This is the richest part of the answer and is spread across five classes.

**(a) The writer emits integrity metadata** — but only when there is content to protect:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `DefaultHomeOutputStream.java:177–193`. Format is a plain-text, blank-line-separated `Name:` / `SHA-1-Digest:` list with a `ContentDigests-Version: 1.0` header. digests exist "only from version 4.4" (comment at `HomeContentContext.java:112`), and empirically they are absent from most shipping files: of the 12 example `.sh3d` files I downloaded, only `SweetHome3DExample20-TinyHouse.sh3d` (7400, 394 entries) had one. **OBSERVED.**

**(b) The reader re-verifies every referenced asset** in `HomeContentContext.lookupContent` (`:127–179`):

1. can the entry be opened at all? (`isValid`)
2. is it a duplicate of already-read content from a file older than 4.4? (skip re-reading)
3. if a stored digest exists, does the re-computed digest match?
4. on any failure, look for **a content with the same digest in user preferences** and substitute it silently — "repair silently damaged entry";
5. otherwise record it in `invalidContents` and set `containsInvalidContents = true`.

**What "user preferences content" actually is** — `getUserPreferencesContent` (`:242–257`) walks the installed **furniture catalog** (`piece.getIcon()`, `piece.getModel()`, `piece.getPlanIcon()`) and **textures catalog** (`texture.getImage()`) and collects every `URLContent` into a set, which is then matched by **SHA-1 digest equality** (`findUserPreferencesContent`, `:216–230`). **INFERRED — and this is the elegant part:** every `.sh3d` embeds its own copy of each catalog model and texture, but on read the app prefers the identical local catalog copy. Two consequences: (i) a **damaged embedded model self-heals from the installed catalog** with no user interaction, because the file's own `ContentDigests` entry proves the local copy is byte-identical; (ii) the same content-addressed lookup doubles as deduplication, so a plan referencing a standard sofa 10 times does not load 10 copies. The `.sh3x` "plan-only" container (§2.9) leans on exactly this: it ships *no* assets at all, on the assumption that the reader resolves every model from its catalog.

`containsCheckedContents()` returns `contentDigests != null && invalidContents.size() == 0` — i.e. *"we had hashes to check with, and everything now matches (after possible substitution)"* (`:200–202`).

**(c) The reader decides between silent repair and an exception** (`DefaultHomeInputStream.readHome:317–324`):

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

So "repaired" is *strictly weaker* than the exception: it means the file's own hashes proved the substituted content is the right bytes. `HomeFileRecorder.readHome` converts the checked exception into `DamagedHomeRecorderException(damagedHome, invalidContent)` (`HomeFileRecorder.java:337–338`), and `Home` exposes `isRepaired()` / `isRecovered()` plus `Property.REPAIRED` / `Property.RECOVERED` events (`Home.java:73–76, 1457–1492`).

**(d) ZIP-level salvage before any of that.** `readHome` first tries to read *every* entry to the end with a `ZipInputStream`. If that throws (or the ZIP dictionary throws `IllegalArgumentException("MALFORMED")`), it falls back to:

- `isZipFileValidUsingDictionnary(File, validEntries)` — uses the ZIP central directory to enumerate entries **individually**, keeping the ones that read;
- then `createTemporaryFileFromValidEntries` (copy exactly the valid entries) or, if that yields fewer, `createTemporaryFileFromValidEntriesCount` (copy the first *N* valid entries) into a temp `.sh3d`;
- the temp file then becomes the `homeUrl` used for the rest of the read.

— `DefaultHomeInputStream.java:238–258, 390–526`. **INFERRED:** this is why a truncated download or a ZIP with one corrupt entry can still open with a partial plan, and why the subsequent asset validation matters — the missing entries are precisely what the digest/invalid-content machinery catches.

**(e) The user decides.** `HomeController.openDamagedHome` (`:2167–2183`) calls `view.confirmOpenDamagedHome`, a 3-button `WARNING_MESSAGE` dialog whose **default is "Don't open home"**:

| Answer | Handler | What it does |
|---|---|---|
| `REMOVE_DAMAGED_ITEMS` | `removeDamagedItems` (`:2188–2229`) | deletes furniture whose icon/plan-icon/model is invalid; nulls broken left/right wall textures, room floor/ceiling textures, environment ground/sky textures, home & per-level background images |
| `REPLACE_DAMAGED_ITEMS` | `replaceDamagedItems` (`:2283+`) | rebuilds each damaged piece as a `CatalogPieceOfFurniture` using bundled `repairedIcon.png`, `repairedImage.png`, `repairedModel.obj` (red placeholders) but keeps its width/depth/height/elevation/movable/etc. |
| `DO_NOT_OPEN_HOME` | — | abandons the open |

Only if the user did not choose "don't open" does the controller `setName(homeName); setRepaired(true); addHomeToApplication(damagedHome)`. The repaired flag is what triggers the post-open banner:

> **"The data of the home "%s" is damaged but Sweet Home 3D successfully repaired it. You should save it now to validate the repair."**
> — `HomeController.openRepairedHomeMessage` (`viewcontroller/package.properties:88`)

**OBSERVED**, all of the above.

**Version-history corroboration** (`docs_html_history.html`, extracted):

| Version | Entry |
|---|---|
| 3.6 (2012-09-06) | "Refused to open a corrupted SH3D file when it contains some unreachable furniture or textures." + "Fixed a bug that blocked program launch if some files to recover were invalid." |
| **4.4 (2014-06-12)** | "Added an option to repair damaged SH3D files with the ability to retrieve corrupted data from Sweet Home 3D catalogs, **to remove damaged 3D models and images, or to display them in red**." |
| 4.5 (2014-10-22) | "Fixed a bug that could interpret SH3D files with correct imported zipped 3D models as damaged files." |

That is the whole design in three lines: v3.6 hard-refused, v4.4 replaced refusal with the digest + dialog + red-placeholder flow, v4.5 fixed false positives. **OBSERVED** (`docs_html_history.html`).

### 2.6 Save-time safety: never destroy the last good file

`HomeFileRecorder.writeHome` (`:176–298`) is a textbook safe-save:

1. refuse if the target exists but is not writable;
2. **write the whole home to a temp file** (`OperatingSystem.createTemporaryFile("save", ".sweethome3d")`), not to the target;
3. check free disk space (`File.getUsableSpace` via reflection, Java 6) against `tempFile.length() - existingLength`; shortfall → `NotEnoughSpaceRecorderException` and the temp file is deleted;
4. open the destination and copy temp → destination, checking `isPrefixCorrect()` (first bytes `PK` or `<?xml`) on the way;
5. **re-open the finished target and check its prefix again**, with the comment: *"some users reported some files containing only 0 for unknown reasons"*.

The history entry for this is **v1.3 (2008-04-29)**: *"Changed the way to save homes to avoid the corruption of the previous version of a valid SH3D file, if current save ever fails."* **OBSERVED/DOCUMENTED.**

Additional save-path defences (all OBSERVED in `HomeController`):

- the live model is **cloned before the background save** (`this.home.clone()`, `:2584`); if cloning throws *"If home data is corrupted some way and couldn't be cloned"* → `saveError` is shown instead of writing garbage;
- `updateSavedHome(homeName, savedVersion, …)` sets `modified=false`, **`recovered=false`, `repaired=false`** and `version = savedVersion` — i.e. the recovered/repaired badges only clear after a successful save;
- on close/exit, a home that `isModified() || isRecovered() || isRepaired()` forces a save prompt (`confirmExit`, `:2874–2884`).

### 2.7 Autosave and crash recovery

`AutoRecoveryManager` (class doc: *"Manager able to automatically save open homes in recovery folder with a timer"*) — introduced **v3.0 (2010-11-30)**: *"Managed saving of homes data at regular time intervals in a private folder, with automatic recovery of homes in case the program crashed."* **DOCUMENTED/OSERVED.**

| Aspect | Behaviour | Source |
|---|---|---|
| Interval | `autoSaveDelayForRecovery`, default **600 000 ms = 10 min**; `0` disables. Hard floor `MINIMUM_DELAY_BETWEEN_AUTO_SAVE_OPERATIONS = 30 000 ms` | `DefaultUserPreferences.properties:90`; `AutoRecoveryManager.java:63, 239–251` |
| Location | private app folder + `/recovery`, files named `<original-name>.recovered` (or `<uuid>.recovered` for never-saved homes) | `:64–66, 289–310` |
| Threading | timer thread; **clones on the EDT**, saves on a single-thread `MINIMUM_PRIORITY` executor | `:85–91, 257–283` |
| Crash-window guard | after writing, the file is opened `FileOutputStream(file, true)` and `getChannel().lock()`-ed; other processes skip locked files (`isFileLocked`) so a half-written autosave is never read | `:314–334, 187–205` |
| Startup | `readRecoveredHomes()` lists `*.recovered` **newest first**, skips locked, reads each; sets `home.setRecovered(true)` when the stored name ≠ the file path; unreadable ones are renamed `.unrecoverable` so they are not retried | `:137–182` |
| Presentation | recovered homes are added as normal homes; `openRecoveredHomes()` renames a recovered home to `null` if a same-named home is already open (avoids a collision) | `:207–229` |
| Cleanup | the `.recovered` file is deleted the moment `isRecovered()` becomes false (i.e. after a real save); deleting the home also frees the lock and deletes the file; a shutdown hook stops the executor | `:104–123, 164–170` |

**INFERRED:** this is exactly the "unsaved-work" recovery layer CasaPlazAI's `localStorage` autosave needs — note it is deliberately **separate from the user's file**, keyed by name so it can shadow the last good save, and cleared only by a successful explicit save.

**Browser variant (v7.2, 2023-09-22):** *"Added new classes to Sweet Home 3D JS to store home data directly on a server, in IndexedDB or in local storage, with **auto recovery management in IndexedDB**."* Confirmed in the bundle: a JS `AutoRecoveryManager` builds `indexeddb://SweetHome3D/Recovery/content?name=%s.recovered` recorder URLs (`readHomeURL`, `writeHomeURL`, `listHomesURL` with regex `?name=(.*).recovered`, `deleteHomeURL`), sets `setRecovered(true)` on load, deletes the record when `RECOVERED` goes false, and is only instantiated when `configuration.autoRecovery` is set. **OBSERVED** (`sweethome3d.min.js` offsets 2611297, 2613108).

### 2.8 The browser edition is the same versioning machine

The 2.6 MB `sweethome3d.min.js` (v7.5.2) contains, verbatim, the same vocabulary and the same logic:

| Java construct | JS counterpart found in the bundle |
|---|---|
| `Home.CURRENT_VERSION = 7400` | `a.CURRENT_VERSION=7400` |
| `KEEP_BACKWARD_COMPATIBLITY = true` | `a.KEEP_BACKWARD_COMPATIBLITY=true` |
| canonical singleton IDs | `a.HOME_TOP_CAMERA_ID="camera-homeTopCamera"`, `a.HOME_OBSERVER_CAMERA_ID=…`, `a.HOME_ENVIRONMENT_ID=…`, `a.HOME_COMPASS_ID=…` |
| `writeObject → setVersion(CURRENT_VERSION)` | `d.setVersion(Home.CURRENT_VERSION); c.writeAttribute…("version", …)` |
| `parseInt(version)` on read | `setVersion(parseInt(d))` |
| forward-compat warning | `this.home.getVersion()>Home.CURRENT_VERSION` → `showMessage(localizedString("moreRecentVersionHome", …))` |
| `repaired` / `recovered` flags + events | `Home` ctor defaults `this.recovered=false; this.repaired=false`; `isRecovered/setRecovered/isRepaired/setRepaired` fire `"RECOVERED"`/`"REPAIRED"` |
| `OpenDamagedHomeAnswer {REMOVE, REPLACE, DO_NOT_OPEN}` | identical enum, values 0/1/2 |
| `DamagedHomeRecorderException(damagedHome, invalidContent)` | `DamagedHomeRecorderException` with `getDamagedHome()` / `getInvalidContent()` |
| `updateSavedHome` clears `modified/recovered/repaired`, sets version | `e.home.setModified(false); setRecovered(false); setRepaired(false); setVersion(d)` |

**OBSERVED** (`online_js/sweethome3d.min.js`, byte offsets as listed; I re-downloaded the live bundle on 2026-10-31 — 2 618 789 bytes, sha256 prefix `053e7d1ab0364712`, identical to the round-1 snapshot, so these constants are live and the snapshot is unmodified). **INFERRED:** because the model, version constant, migration comparisons and error classes are transpiled from the same Java, the desktop and browser editions cannot drift in *format* versioning — only the I/O back-ends differ (ZIP file vs. IndexedDB/localStorage/HTTP).

**Scope caveat — the JS client has *no* binary-migration branches, by construction.** The bundle contains **zero** occurrences of `readObject` / `defaultReadObject` / `writeObject` (Java serialisation is a JVM feature with no JS analogue), and the canonical singleton IDs appear only twice each — once in the constant definitions and once in `init` — never in a version-gated re-creation block. So the `< 6400` ID migration, the `<= 3400` ground-colour change and the `KEEP_BACKWARD_COMPATIBLITY` flattener are **desktop-only**. The JS client inherits the *outcome* of all of them for free, because it only ever parses the modern `Home.xml` (or reads what the desktop app last wrote). **INFERRED:** this is a strong argument for CasaPlazAI's single JSON format — Sweet Home 3D carries a permanent Java-serialisation compatibility tax in the desktop edition that its browser edition simply does not have. Also note the JS `Home.init` uses the same canonical IDs as the Java `init`, so a JS-created home is byte-compatible with a desktop-created one on the XML side.

**The browser re-implements the digest layer with WebCrypto.** `ContentDigestManager` (`sweethome3d.min.js` offset 2327238) computes a SHA-1 via the platform:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._

— i.e. the same *base64-encoded SHA-1* value the Java `Base64.encodeBytes(getContentDigest(...))` writes into `ContentDigests`, so a browser-written file's digests are checkable by the desktop app. Two details worth noting:

- the digest for a ZIP-entry content is computed over the **concatenation of significant entries only** — `isSignificant` excludes any entry named `LICENSE.TXT` (case-insensitive, including `/LICENSE.TXT` suffixes), so licence files never affect the hash;
- the **SHA-256 fallback is a latent compatibility gap (INFERRED):** if a browser lacks `subtle.digest("SHA-1")` (SHA-1 is being retired in some contexts) and falls back to SHA-256, the produced digest string can never equal the SHA-1 value stored in a desktop file, so every asset would be judged invalid and the repair dialog would fire. I did not observe this happening — it requires a browser where only the SHA-1 path throws.

**OBSERVED** (`online_js/sweethome3d.min.js` 2327238–2329900). The page also loads `cdn.jsdelivr.net/npm/crypto-js@4.2.0/index.min.js`, but the bundle contains **no** `CryptoJS` references — so crypto-js is not what computes these digests. **INFERRED:** it is loaded by the hosting page for another purpose (likely password/`md5.js` handling on the forum/registration parts of sweethome3d.com), and the recorder-worker (`recorderworker.min.js`, 35 122 B) contains no `SHA-1`/`ContentDigests` string at all.

### 2.9 The published DTD, and `.sh3x` — the "future container"

**The DTD is live.** `https://www.sweethome3d.com/SweetHome3D.dtd` returns HTTP 200, 13 359 bytes, GPL-2.0+ header, Copyright (c) 2024 Space Mushrooms; 32 `<!ELEMENT>` and 31 `<!ATTLIST>` — the same counts as the copy round-1 extracted from `HomeXMLHandler`'s Javadoc. **OBSERVED** (`evidence/vendor/SweetHome3D.dtd`; the German path `/de/SweetHome3D.dtd` is 404).

This refines round-1's §2.1 claim that there is "no standalone DTD URL" — there is one; it is just not under the docs tree. It also confirms the DTD has not diverged from the embedded copy (so round-1's `Home.xml.dtd` is current). Note again that the runtime parser does **not** validate against it (§2.2c).

**`.sh3x` is a first-class, user-selectable home extension — not a web-only artefact.** The version history says it outright:

> **v5.3 (2016-11-16):** *"Added a `Home.xml` entry validated by the DTD SweetHome3D.dtd to SH3D files, and added file association for **future SH3X files**."*

The desktop Open dialog already accepts it. `swing/FileContentManager` builds its `SWEET_HOME_3D` filter from two localized extensions:

```
FileContentManager.homeExtension=.sh3d
FileContentManager.homeExtension2=.sh3x
```
> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `swing/package.properties:173–174`, `evidence/src/FileContentManager_utf8.java:326–372, 458–461`

`homeExtension2` is a *localized* property and may be null in some locales, which is why all the code guards it with `!= null`. And the JS Online app loads its demos from `.sh3x`:

> _Code excerpt removed: derived from vendor source (proprietary or GPL). Behaviour is described in the surrounding text._
— `online_app.html:3082–3086`; 9 demo URLs `/examples/{EmptyHome,Studio,2BedroomApartment,…}.sh3x`

I downloaded them. **All nine are ZIP archives whose only entry is `Home.xml`** — no binary `Home`, no `ContentDigests`, no embedded models:

| File | Entries | `<home>` opening tag |
|---|---|---|
| `EmptyHome.sh3x` (235 B) | `Home.xml` only | `<home>` — **no version, no name, nothing** |
| `Studio.sh3x` | `Home.xml` only | `<home version='5500' name='Studio.sh3x' camera='topCamera' wallHeight='250.0' …>` |
| `2BedroomApartment.sh3x` | `Home.xml` only | `<home version='5500' …>` |
| `3BedroomHouseWithAttic.sh3x` | `Home.xml` only | `<home version='5500' … selectedLevel='level1' …>` |

**OBSERVED** (`evidence/sh3x/*.sh3x`). **INFERRED:** `.sh3x` is the "plan-only / interchange" flavour of the same schema — a shared, DTD-described single-entry archive that any consumer can read without the Java binary entry or the assets. It is the closest thing Sweet Home 3D has to a *portable* plan document, and it is the answer to "what would a web-friendly Sweet Home 3D plan look like". Round 1 concluded the online edition "loads `.sh3d` files"; the stronger, correct statement is that it loads **plan-only `.sh3x`**, and the desktop app accepts both extensions under the same `SWEET_HOME_3D` content type. **OBSERVED** (`evidence/src/FileContentManager_utf8.java`, `evidence/res/swing_package_utf8.properties`).

### 2.10 Version history: the documented migration milestones

From `docs_html_history.html` (official, extracted to text), the entries that bear on **format versioning/recovery**:

| Version | Date | Entry |
|---|---|---|
| 1.3 | 2008-04-29 | "Changed the way to save homes to avoid the corruption of the previous version of a valid SH3D file, if current save ever fails." |
| 3.0 | 2010-11-30 | "Managed saving of homes data at regular time intervals in a private folder, with automatic recovery of homes in case the program crashed." + "Added automatic deletion of temporary files created by Sweet Home 3D older than a week." |
| 3.4 | 2011-12-20 | Levels introduced (`Plan > Add level`); the loader's elevation-index fix-up and the `<=3400` ground-colour change belong to this era. |
| 3.6 | 2012-09-06 | "Refused to open a corrupted SH3D file…" + "Fixed a bug that blocked program launch if some files to recover were invalid." |
| **4.4** | 2014-06-12 | "Added an option to repair damaged SH3D files… remove damaged 3D models and images, or to display them in red." (ContentDigests introduced) |
| 4.5 | 2014-10-22 | "Fixed a bug that could interpret SH3D files with correct imported zipped 3D models as damaged files." |
| 5.3 | 2016-11-16 | "Added a `Home.xml` entry validated by the DTD SweetHome3D.dtd to SH3D files, and added file association for future SH3X files." |
| **5.5** | 2017-09-06 | "Made doors and windows always cut out the both sides of the walls…" → `HomeDoorOrWindow.wallCutOutOnBothSides` is commented `// false for version < 5.5` |
| 6.4 | 2020-07-21 | "Added IDs to home objects which may be modified." (the `< 6400` canonical-ID migration) |
| 7.2 | 2023-09-22 | "Added new classes to Sweet Home 3D JS to store home data directly on a server, in IndexedDB or in local storage, with auto recovery management in IndexedDB." |
| 7.4 | 2024-05-30 | `CURRENT_VERSION = 7400` |
| 7.5.2 | 2024-08-29 | current release; "Fixed the default value of `doorOrWindowWallThickness#` property and saving of `lightSourceMaterialName#` property containing commas" (a *furniture library* format fix, not the home format) |

**OBSERVED/DOCUMENTED.** **INFERRED:** the format went 15+ years without a breaking container change — v5.3 *added* a second entry alongside the binary one rather than replacing it, which is why even a 2024 app still reads a 2008-era `version='5300'` file. That additive-layering discipline (never remove, always add and default) is the real versioning strategy; the integer is only the annotation.

### 2.11 Mapping to CasaPlazAI's schema (read-only reference)

CasaPlazAI's `FloorplanData` v1 (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`) already specifies: `schemaVersion` exactly `1`; `migrate()` chains pure transforms registered per outgoing version; gaps fail with `migration-gap`; newer-than-reader fails with `future-version`; "breaking edits to shipped types are forbidden — the barrel API stays additive"; and editor-only state lives under its own versioned keys (`casaplaza.snap.settings.v1`, `casaplaza.underlay.v1`).

| Concern | Sweet Home 3D | CasaPlazAI v1 | Take-away |
|---|---|---|---|
| Version carrier | root `version` attr, int, #IMPLIED | `schemaVersion: 1`, required | same idea; SH3D's "absent ⇒ current" is a hazard CasaPlazAI avoids by requiring it |
| Version semantics | "field list changed"; value = release of last format change × 1000 | schema revision, decoupled from app release | CasaPlazAI's decoupling is cleaner for a web app that ships continuously; SH3D's coupling makes the number self-documenting |
| Migration mechanism | inline idempotent `if (version < N)` at load | registered pure transforms chained by `migrate()` | CasaPlazAI is stricter and more testable; SH3D's approach is cheaper for tiny fixes |
| Gap / future handling | **warn + confirm-save** (soft) | **fail loudly** (`migration-gap`, `future-version`) | both defensible; SH3D's soft path preserves user work, CasaPlazAI's hard path preserves contract integrity. See Idea 5 for the split |
| DTD / validation | published but **not enforced** at runtime | `validate.ts` runs and rejects with codes | CasaPlazAI is stronger; keep it |
| Repair on damage | digests + salvage + 3-way dialog + red placeholders | validation errors reject the payload | SH3D's repair path is the biggest transferable idea (Ideas 1, 3, 4, 7) |
| Save safety | temp → disk-space check → prefix check → replace → re-check | not described in the schema doc | adopt wholesale (Idea 3) |
| Crash recovery | 10-min autosave to `recovery/*.recovered`, locked, newest-first recovery, cleared on save | plan autosaves to `localStorage` | add the recovered/repaired status + separate recovery slot (Ideas 1, 2) |

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Each idea names the finding it comes from and the CasaPlazAI surface it touches.

| # | Idea | Tied to | Value | Effort | Concrete shape for CasaPlazAI |
|---|---|---|---|---|---|
| 1 | **Add `recovered` / `repaired` transient status flags that force a re-save** | §2.5, §2.7 | High | Low | Add two booleans to editor-internal state (not to `FloorplanData`; it is ephemeral, like SH3D's `transient` fields). Show a banner: *"Recovered from autosave — save to keep"* / *"Some items were repaired"*. Clear both only on a successful explicit save. Mirrors `updateSavedHome` exactly. |
| 2 | **Autosave into a *separate* recovery slot, not over the live plan** | §2.7 | High | Low–Medium | Currently plan autosaves to `localStorage`; keep the last-good user save under its own key and write periodic snapshots under `casaplaza.recovery.v1` (a small ring, newest-first). On boot, if a recovery record exists and is newer than the saved plan, offer *Recover / Discard*. SH3D's `recovery/*.recovered` + `isRecovered()` is the template. |
| 3 | **Make the localStorage write atomic and verified before it replaces the good plan** | §2.6 | High | Low | Serialise to a string in memory → validate with `validate()` → write to a staging key or a `{payload, checksum}` envelope → re-read and verify checksum + `schemaVersion` → only then promote to the primary key; keep the previous value as `lastGood`. This is the `temp file → prefix check → replace → re-check` pattern ported to `localStorage`. |
| 4 | **Cheap integrity digest on the autosave envelope with a "recover last good" path** | §2.5, §2.6 | Medium | Low | A tiny FNV-1a/32-bit hash (or `JSON.stringify` length + hash) of the payload stored beside it; mismatch ⇒ do not load, offer `lastGood`. Same role as `ContentDigests` but for one blob, so no SHA-1/crypto needed. |
| 5 | **Split compatibility policy: hard-reject for the interchange contract, soft-warn for the editor's own autosave** | §2.3, §2.11 | High | Low | Keep `future-version` as a *validation* error for imported/shared `FloorplanData` (schema doc rule 118). But when the editor reads **its own** `localStorage` payload that is newer than the running build (e.g. a stale tab after a redeploy), warn + offer *"open read-only / discard"* instead of wiping, exactly as SH3D does with `moreRecentVersionHome` + `confirmSaveNewerHome` (default = don't save). Prevents a deploy from destroying a user's in-progress plan. |
| 6 | **Record which migrations ran and from which version** | §2.2, §2.11 | Medium | Low | `migrate()` already chains transforms; have it return/produce `{from, applied: number[], to}` and stash that on the in-memory plan (and optionally in a `meta` bag). SH3D's `getVersion()` + release-stamped version is the coarse version of this; per-step logging makes `migration-gap` reports actionable and lets QA assert "a v1 payload always reports `applied: [1]`". |
| 6b | **Keep one free-form `meta`/`property` bag so extensional data never needs a version bump** | §2.1 | Medium | Low | Sweet Home 3D's `property name/value/type` is an EMPTY element usable for arbitrary STRING or CONTENT values; the examples use it for Author/Copyright/License/TotalArea. CasaPlazAI can add a `meta?: Record<string,string>` (additive, so the barrel API stays compatible) for project notes / north angle / source labels, reserving `schemaVersion` bumps for structural changes only. |
| 7 | **Partial salvage on parse failure instead of an all-or-nothing reject** | §2.5 | Medium | Medium–High | SH3D salvages entry-by-entry from a broken ZIP and then repairs assets. For a JSON plan the analogue is: if `JSON.parse` fails, try to recover the last complete object/array boundary; if `validate()` finds a small number of bad entities, open the plan with the valid ones and flag the rest for user review (SH3D's Remove/Replace choice). Only worth it once multi-floor/large plans are common. |
| 8 | **Bounded snapshot history (undo of sessions, not of edits)** | §2.7 | Medium | Medium | Keep N (e.g. 5) compact snapshots under `casaplaza.history.v1` with timestamps so "recover" is not limited to the single newest autosave. SH3D only keeps the newest autosave per home — a visible weakness for a browser app where a bad edit can persist through an autosave. |
| 9 | **Formalise per-key versioning for every out-of-schema store** | §2.11, §2.9 | Medium | Low | The schema doc already has `casaplaza.snap.settings.v1`, `casaplaza.underlay.v1`. Add a single helper (`readVersionedKey(key, current, migrate)`) and a table in the schema doc listing **every** `casaplaza.*` key, its version, and its owner. SH3D demonstrates the cost of ad-hoc legacy fields (5 environment fields kept alive for pre-`HomeEnvironment` readers, `Home.java:118–132`); a written inventory prevents that rot. |
| 10 | **`schemaVersion` in exported/share payloads + a visible version badge** | §2.1 | Low | Low | SH3D stamps `version` on every write (`writeObject`/XML exporter). Ensure CasaPlazAI's JSON/PNG-adjacent exports and share links always carry `schemaVersion`, and surface it in a debug/About panel so support can tell which build wrote a payload. |
| 11 | **Storage-quota guard on save** | §2.6 | Medium | Low | SH3D checks `getUsableSpace()` before replacing a file and surfaces `NotEnoughSpaceRecorderException`. In the browser, catch `QuotaExceededError` on every `localStorage.setItem`, keep the previous value intact, and prompt the user to export (and optionally prune the snapshot ring). Without this a full quota can silently lose the newest plan. |
| 12 | **A "plan-only / portable" export container as the interchange artefact** | §2.9 | Low–Medium | Medium | `.sh3x` = a ZIP containing only `Home.xml` — the minimal DTD-described plan, no binary entry, no assets. CasaPlazAI's equivalent is already JSON, so the useful part is the *policy*: define a documented "portable plan" subset (no editor-local state, no underlay) that is guaranteed importable by any version. The schema doc already ratifies graceful omission for underlay; make it explicit as the portable contract. |
| 13 | **Content-addressed palette items so a plan can repair itself from the built-in catalog** | §2.5 | Low–Medium | Medium | SH3D's killer recovery trick: each plan embeds its assets *and* a SHA-1 list, and on read a damaged asset is silently replaced by the byte-identical copy in the installed furniture/texture catalog. CasaPlazAI's palette is small and built-in, so the analogue is: store a short content hash per furniture/floor-texture reference; on load, if a referenced asset is missing or changed, re-resolve it from the current built-in palette by hash and only warn if no match exists. Turns "missing texture" from a data-loss event into a silent no-op, and enables a plan-only export that ships references instead of payloads. |

**Deliberately not recommended:** copying SH3D's inline `if (version < N)` migration style into `migrate.ts`. CasaPlazAI's registered-transform chain with `migration-gap`/`future-version` failures is strictly more testable and auditable for a web app; the ideas above take SH3D's *recovery and save-safety* lessons, not its migration mechanism.

---

## 4. Unknowns

1. **Per-class binary migrations are not enumerated.** I read `Home.readObject` in full, but the same `KEEP_BACKWARD_COMPATIBLITY` pattern almost certainly exists in `HomePieceOfFurniture`, `Wall`, `Room`, `HomeDoorOrWindow`, `Level`, `Label`, `Polyline` and `DimensionLine`. I did not fetch/read those; a document describing the *complete* older-binary→current mapping is therefore not in this report.
2. **No complete version→feature table.** I have every `getVersion()` call site in the four files I read (three) plus the release notes, but I cannot prove there are no other version comparisons elsewhere in the tree (e.g. in `HomePieceOfFurniture` or the swing package). The `// false for version < 5.5` comment in `HomeDoorOrWindow.java:47` shows the pattern exists outside the files I read.
3. **The DTD is published but I could not confirm any consumer validates against it.** `DefaultHomeInputStream` uses a default (non-validating) `SAXParserFactory`; the JS parser is `jsXmlSaxParser` with the same name-driven handler. The `.sh3x` demos are described as "validated by the DTD" in the release note, which may mean export-side conformance only. **UNVERIFIED**: whether any build tool or test actually validates `Home.xml` against `SweetHome3D.dtd`. (I did add the handler's `name`-branch tolerance as a source fact: element names with no branch fall through silently, and `getHome()` returns whatever root object was built for the first unrecognised element — the mechanism by which a newer file opens with unknown data dropped.)
4. **`.sh3x` vs `.sh3d` semantics are inferred from artefacts + one code path, not from a spec.** I confirmed nine real `.sh3x` files exist and are single-entry (`Home.xml`) ZIPs; I confirmed the desktop `SWEET_HOME_3D` filter accepts both extensions (`homeExtension=.sh3d`, `homeExtension2=.sh3x`); I did **not** find prose explaining the intended distinction, nor did I run the desktop app to see whether it writes `.sh3x` as a distinct "save as plan only" choice. Whether a `.sh3x` may legitimately contain asset entries is **untested**.
5. **Missing-`version` behaviour is inferred, not observed.** `Home.init` sets `version = CURRENT_VERSION`, so an absent attribute reads as current; I did not open `EmptyHome.sh3x` in a running client to confirm the visible outcome.
6. **No live UI observation.** Consistent with round 1: no screenshot of the desktop app, and the JS Online page is heavy. All dialog text, button labels and defaults in §2.3/§2.5 come from the shipped property bundles and Swing call sites (`HomePane.java`), which is direct evidence but not a rendered dialog. I did not re-attempt a headless capture.
7. **Web search remained unavailable** (the configured DeepSeek search API key is absent), so discovery again relied on the live sweethome3d.com URLs, the Debian source mirror and direct probing. The `SweetHome3D.dtd` and the `.sh3x` demos were found by probing `sweethome3d.com` paths suggested by the version history — a search index might have surfaced community documentation about repairing damaged SH3D files that I have not seen.
8. **Browser SHA-1→SHA-256 fallback is unobserved in practice.** I read the fallback in the bundle, but I could not exercise it (needs a browser where `subtle.digest("SHA-1")` throws) and therefore cannot say how Sweet Home 3D JS handles the digest mismatch it would produce. **UNVERIFIED.**
9. **`isSignificant`/`LICENSE.TXT` exclusion is read from the JS bundle only.** I did not confirm the equivalent filter in the Java `ContentDigestManager` (I did not fetch that class), so I cannot state that desktop and browser compute the *same* digest for a given ZIP-entry content — only that both target a base64 SHA-1.
10. **`recorderworker.min.js` was fetched but not analysed in depth.** It contains 17 `Digest` mentions but no `SHA-1`/`ContentDigests` string; its role (zipping/serialising off the main thread) is inferred from its name and the recorder API, not traced.
11. **Licensing.** Sweet Home 3D source is GPL-2.0+; the bundled examples and assets are CC-BY-3.0 / GPL; the DTD is GPL-2.0+. Everything in this folder is retained as *reference evidence only*, described in my own words; no code or schema text is copied into CasaPlazAI deliverables.

---

## 5. Job folder contents (evidence map)

| Path | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list with URLs, licences and how each was obtained |
| `evidence/VERSION_SAMPLES.txt` | **New**: the observed `version=` ladder (5300/5500/6000/7000/7400) + container facts for 12 `.sh3d` and 2 `.sh3x` files |
| `evidence/Home.java`, `DefaultHomeInputStream.java`, `DefaultHomeOutputStream.java`, `HomeXMLHandler.java`, `HomeXMLExporter.java`, `HomeFileRecorder.java`, `Level.java` | UTF-8 conversions of the round-1 source snapshots (read-only originals live in the round-1 folder) |
| `evidence/sh3d/*.sh3d` | **New**: 12 shipping example `.sh3d` files from the live examples directory |
| `evidence/src/HomeController_utf8.java`, `HomeView_utf8.java`, `HomePane_utf8.java` | **New in round 2**: desktop controller/view/panel source fetched from the Debian mirror — the forward-compat warning, the save-confirmation gate, and the three-way repair dialog |
| `evidence/src/AutoRecoveryManager_utf8.java` | **New**: autosave/crash-recovery implementation |
| `evidence/src/DamagedHomeIOException.java`, `HomeContentContext_utf8.java`, `ContentRecording.java` | **New**: digest verification, invalid-content tracking, silent-repair decision |
| `evidence/res/package.properties` / `package_de.properties`, `vc_package.properties` | **New**: exact English/German UI strings for `openDamagedHome`, `confirmSaveNewerHome`, `moreRecentVersionHome`, `openRepairedHomeMessage` |
| `evidence/vendor/SweetHome3D.dtd` | **New**: the live official DTD (HTTP 200, 13 359 B), confirming round-1's extracted copy |
| `evidence/sh3x/*.sh3x` | **New**: four real `.sh3x` demo archives, each a single-entry `Home.xml` ZIP |
| `evidence/res/DefaultUserPreferences.properties` | **New**: `autoSaveDelayForRecovery=600000` |
