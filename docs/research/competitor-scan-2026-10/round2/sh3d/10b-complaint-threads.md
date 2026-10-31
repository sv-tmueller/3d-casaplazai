# Sweet Home 3D — top forum complaint threads: concrete UX pain points

Round-2 deep dive for **CasaPlazAI** (single-page web 2D/3D floorplanner, TypeScript/Three.js, no backend, plan
autosaves to localStorage; Plan / 3D / Walk modes; rectangle + polygon rooms; 0.5 m grid snapping; shared walls;
doors/windows on room edges; furniture palette with fit/collision; measure; multiple floors; blueprint underlay;
PNG/JPEG export).

Competitor: **Sweet Home 3D** — GPL Java desktop app (https://www.sweethome3d.com/de/ , German entry page) plus a
browser edition transpiled from the same Java core
(https://www.sweethome3d.com/SweetHome3DJSOnline.jsp).

Round-1 report (read first; its evidence reused read-only):
`~/dsh-workspaces/rea-sweethome3d-2026-10/10-10-community-plugins-feedback/report.md`.
Round-1 output folder is never modified; new evidence lives in this folder's `raw/` and `evidence/`.

**Evidence tags.** `OBSERVED` = seen directly in a page/JSON/bundle captured here or in round-1 evidence (path given);
`DOCUMENTED` = vendor docs; `INFERRED` = my analysis. Sweet Home 3D is GPLv2+; no source code is copied into this
report — only behaviour, data shapes and UX patterns, described in my own words (short speaker fragments are quoted
for attribution).

**Scope of this round.** The *forum complaint threads themselves*: which ones dominate by attention, what concretely
goes wrong for the user in each, what workaround the community has adopted, and what the vendor/creator answers. Only
where it bears directly on a complaint do I also report the shipped JS behaviour.

---

## 1. Summary

- **The most-viewed complaint threads are not feature requests — they are workflow blockers.** The board's
  attention leaders are "Pan tool in 3D and 2D view?" (112 replies, 816k views, 2014→2026), "Weird 3D Artifacts"
  (108 replies, 356k), "3d View suddenly impossibly slow" (108 replies, 248k), "DirectX driver issues" (53 replies,
  241k) and "Hide elements" (2 replies, 439k): i.e. *moving the camera, seeing the model, and getting an object out
  of the way*. `OBSERVED` (raw/thread_index.json, raw/threads_all.txt)
- **Precision complaints are the oldest and the most repeated.** The 2010 "Snap to grid feature" thread was answered
  by the creator with *"buildings in real life don't snap to a grid"*; 15 years later users still ask for grid/smart
  snap, exact wall-to-wall distance, dimension input and wall-length display, and describe the same cost each time:
  time wasted nudging corners and re-entering numbers. `OBSERVED` (raw/threads_all.txt §T1526, T4341, T5456,
  T13993, T4327, T4285)
- **Organisation complaints cluster on one missing control: a per-object lock, and one missing layout: a level tree
  instead of level tabs.** A power user runs "50+ levels" as layers and calls level visibility management *"the
  biggest limitation of SH3D"*; another wants a `Locked` checkbox column beside the existing `Visible` column; a
  third wants levels and groups unified into one tree. `OBSERVED` (raw/threads_all.txt §T13917, T14320, T13933)
- **The community's default answer to most wishes is a workaround, not a feature** — dummy marker boxes at ±5000 to
  enlarge the 2D scroll area, transparent PNG textures to fake hidden group members, splitting a wall into three
  pieces to delete the joint, building electrical symbols on a separate level, exporting a room as furniture to get
  a solid. Each workaround is a precise, quantified UX defect. `OBSERVED` (raw/threads_all.txt, raw/threads_verified.txt)
- **The browser edition is the same product with the sharpest edges exposed.** I verified in the shipped web bundle
  that rulers are stubbed out (`getHorizontalRuler()` throws `"No rulers"`), the rulers preference is hard-disabled
  in the preferences panel, and the grid pitch list starts at 1 cm with no user-set pitch. Conversely, the *online*
  build does render a visible furniture search field with multi-term matching, which the desktop build hides behind a
  preference — the online and offline builds of the same product disagree about their own UI. `OBSERVED` (round-1
  bundle/sweethome3d.min.js; raw/bundle_ux_snippets.txt, raw/bundle_prefs_snippets.txt, raw/bundle_catalog_snippets.txt;
  round-1 raw/js_online.jsp.html; thread T12663)

---

## 2. Findings

### 2.0 Method, and one caveat about the numbers

I enumerated the *Wishlist* board (f=15, 701 topics) sorted by views and by replies, plus the high-traffic boards
(3 Open discussions, 12 Features use and tips, 13 3D problems, 17 Developers, 22 3D models, 19 other languages),
parsed the topic rows into `raw/thread_index.json` (959 topics) and then fetched **89 threads in full, with every
page**, into `raw/th_<tid>_<start>.html` and extracted their post text into
`raw/threads_all.txt` (and the per-batch `raw/threads_extract*.txt`). Reply/view counts and dates below come from each topic's
schema.org `DiscussionForumPosting` JSON-LD block, which phpBB emits on page 1. `OBSERVED`
(raw/thread_index.json; scripts/parse_forum.py; scripts/extract_threads.py)

**Caveat.** The forum was migrated to "a new, more powerful platform" on 2026-10-22, and members openly suspect the
six-figure view counts are partly bot traffic — a 2025 thread discusses "strange thousands of views" and the count
only inflating for topics currently on page 1 (raw/threads_all.txt §T14202). I therefore use views only as a
*rough* attention proxy and give reply counts as well; every individual claim below is grounded in the post text, not
in the counter. `OBSERVED` + `INFERRED`

### 2.1 The complaint threads, ranked

Views/replies as of 2026-10-31; all links are `https://www.sweethome3d.com/support/forum/viewtopic.php?t=<tid>`.
Every row is `OBSERVED` from the captured thread.

| # | Thread (tid) | Started | Replies / views | The complaint in one line |
|---|---|---|---|---|
| 1 | Pan tool in 3D and 2D view? (5072) | 2014-05-27 | 112 / 816,515 | The camera cannot be panned freely; the centre of rotation cannot be moved |
| 2 | Hide elements (13620) | 2024-12-08 | 2 / 439,460 | Objects (a roof) must be deleted to work underneath them; no per-view hide |
| 3 | Weird 3D Artifacts (11888) | 2022-08-07 | 108 / 356,240 | 2D and 3D both render garbage until GPU/driver archaeology is done |
| 4 | connecting SH3D and AI for work (14496) | 2026-01-19 | 57 / 729,710 | Not a complaint — an elaborate documented workaround for weak renders |
| 5 | Dodecagon (13236) | 2024-06-29 | 114 / 698,242 | A third-party model site absorbing demand the core catalogue does not meet |
| 6 | Review of the last 14 months (14202) | 2025-11-03 | 14 / 326,533 | Maintainer abandonment + closed source; users told to keep the old download safe |
| 7 | ROOF WINDOW / VELUX WINDOWS (12135) | 2022-12-02 | 31 / 299,498 | Roof windows cannot be fitted to a sloped roof without a plugin and tricks |
| 8 | Custom Model Editing Using Walls & Floors (14451) | 2026-01-17 | 14 / 286,898 | Getting a solid shape means exporting an elevated room and re-importing it |
| 9 | Understanding the Concept of SH3D — Roofs and Sloped Walls (14156) | 2025-10-16 | 8 / 257,508 | Wall lengths are measured on the centreline; levels heights confuse new users |
| 10 | Unable to store POV (14380) | 2025-12-24 | 4 / 253,516 | A stored camera position never returns to exactly the same place |
| 11 | Dark Mode (12872) | 2024-01-13 | 34 / 248,609 | Promised 2021, never shipped; glaring white UI; no simple font-size control |
| 12 | 3d View suddenly impossibly slow (7640) | 2017-04-08 | 108 / 247,578 | 3D collapses to unusable on large plans; CPU-bound, not GPU |
| 13 | Space mushrooms! Get to work! (14667) | 2026-03-12 | 12 / 240,246 | Forum overrun by spam bots; moderators volunteer rather than the vendor |
| 14 | Split Wall, how to separate the two ends (14139) | 2025-10-02 | 9 / 230,395 | A split wall stays elastically joined; separating it needs cut/paste hacking |
| 15 | How do I create irregular polygonal shapes… (14151) | 2025-10-10 | 2 / 227,882 | No polygon/solid tool; only plugin-generated shapes or room-export tricks |
| 16 | attic renovation — inclined ceilings (1065) | 2009-09-06 | 3 / 225,769 | Sloped ceilings work only through sloped-wall height differences |
| 17 | dimensions on height or 3d view (5746) | 2015-03-10 | 8 / 222,126 | No dimensions in 3D; the community places a measuring object instead |
| 18 | Display electrical outlets on design view and print (10530) | 2020-09-20 | 2 / 213,994 | No symbol layer; solved by burning a level for electrical symbols |
| 19 | Show walls in the items list (13182) | 2024-05-21 | 5 / 67,898 | Walls are invisible in the object list; sizes must be checked dialog by dialog |
| 20 | Level visibility management (13933) | 2025-04-29 | 2 / 66,843 | 50+ level tabs in several rows; switching views is manual tab-clicking |
| 21 | Save configurations of visible levels (13917) | 2025-04-15 | 6 / 8,388 | Same problem; asks for saved visibility presets, gets a plugin pointer |
| 22 | Rulers in the online demo version (14580) | 2026-02-09 | 0 / 69,262 | Rulers missing from the browser build; students can't judge scale |
| 23 | Feature Request: exact distance between walls (13993) | 2025-07-06 | 2 / 41,660 | No numeric/snap distance between a wall and another wall |
| 24 | Snap to grid feature (1526) | 2010-05-28 | 5 / 28,280 | No user-set grid; magnetism snaps only to the nearest cm/inch |
| 25 | Magnetism / snap to distance / symmetry (4341) | 2013-08-22 | 4 / 19,031 | Walls never align exactly; windows should snap to stud spacing |
| 26 | WishList: lock individual objects (14320) | 2025-12-04 | 3 / 87,907 | Only a global base-plan lock; no per-object `Locked` column |
| 27 | Less restrictive panning in 2D view (15091) | 2026-10-10 | 1 / 4,047 | The 2D view is "boxed in"; cannot centre on the plan edge |
| 28 | Categories (12654) | 2023-09-06 | 36 / 21,167 | No sub-categories; renaming library items is undone by a library update |
| 29 | Group furniture items in category (8485) | 2018-04-08 | 34 / 13,951 | Same; a user writes a plugin with a tree view to fix the catalogue |
| 30 | Folders for Items (13189) | 2024-05-29 | 14 / 13,751 | Folders refused by the creator on the forum: "Don't hope for these folders" |
| 31 | Toggle visibility INSIDE grouped items (6334) | 2015-11-18 | 18 / 31,571 | Cannot hide a member of a group without exploding the group |
| 32 | Negative elevation of an object (8897) | 2018-09-21 | 17 / 27,876 | Objects cannot sit below the floor (recessed lights, railings) |
| 33 | a curved wall (13998) | 2025-07-12 | 6 / 84,481 | Arcs yes, ellipses/ovals no |
| 34 | Smart guides, snap to object (5456) | 2014-11-06 | 7 / 13,162 | Wants Illustrator-style smart guides; also asks for per-object lock |
| 35 | Toggle the display of wall lengths on plan (4327) | 2013-08-13 | 10 / 21,887 | Wall lengths are not shown on the plan; a plugin is the answer |
| 36 | inability to insert a window by drag (5678) | 2015-02-11 | 1 / 266,384 | A dragged window flips vertical and refuses to land on the wall |
| 37 | Keller in 3D unter Niveau 0 nicht sichtbar (14329) | 2025-12-05 | 2 / 65,673 | Basement below level 0 appears hidden in 3D |
| 38 | Costruire muri con distanze corrette (13597) | 2024-11-24 | 5 / 4,136 | Wall thickness is not auto-accounted; "my PC nearly flew out the window" |
| 39 | Abbonamento PRO (15061) | 2026-09-30 | 0 / 6,144 | A user cannot find or cancel the PRO subscription they activated |

### 2.2 The workaround culture (the strongest signal in the data)

Across all 89 threads the *answer to a wish is almost always a procedure, not a feature*. These are the ones that
recur, each with the thread it comes from (`OBSERVED`):

- **Enlarge the 2D scroll area with dummy boxes** — place two "marker" boxes at X,Y = −5000,−5000 and 5000,5000 so
  the plan can be panned anywhere; alternatively drag an object off to the side and Ctrl-Z. The helper notes the
  markers distort the 3D view's zoom, so they must not be too big. (T15091)
- **Split a wall into three and delete the middle** to get two truly separate walls, then "pull the two ends" into
  place; one poster: *"Stupid that a hack like that is necessary."* (T14139)
- **Export an elevated room and re-import it as furniture** to obtain a solid shape: set the level elevation > 0,
  untick the ceiling, select the room, export, import, then adjust height. (T14451, T14151, T14160)
- **Burn a whole level for a symbol layer** — electrical outlets and switches are drawn on a duplicate level that can
  be toggled or printed separately. (T10530)
- **Place a dimensioned object** in the plan so that a 3D view shows a size at all. (T5746)
- **Fake hidden group members with a fully transparent PNG texture**, because the per-item visibility checkbox is
  disabled inside a group. (T6334)
- **Draw an arc twice at 180°** to get a circle, because the polyline tool has no ellipse. (T13998)
- **Measure with template boxes**: stick a 100×100 box to one wall and a 50×100 box to another, then align the sofa
  to the boxes, because there is no numeric "place at exact distance". (T13993)
- **Turn on a hidden preference to get catalogue search on the desktop.** The complaint thread asks for a
  filter/search; the creator answers with the non-obvious *File → Preferences → Furniture catalog view → "Searchable
  list"*, and the resolution is that the user simply did not know it existed — including a German user who searched
  the help for "Suche" and found nothing (T4751, T12663). `OBSERVED`
- **Fake sub-categories by renaming items** (`Exterior-Plants`, `Interior-Living-Kitchen`, …) and matching multiple
  search words, because categories are only flat strings and a library update resets hand edits. (T12654, T8485)
- **Search is not actually missing online.** I checked the shipped bundle this round and the *online* catalogue pane
  constructs its own `#furniture-search-field` plus a category `<select id="furniture-category-select">`, and filters
  by matching all whitespace-separated terms against `name | category | tags | creator` (accent-insensitive). So the
  same product both hides search (desktop preference) and shows it (online field) — a discoverability failure rather
  than a missing one. `OBSERVED` (raw/bundle_catalog_snippets.txt) — this corrects the round-1 report's implication
  that search was absent. `OBSERVED`

### 2.3 Theme A — snapping, precision and wall geometry

- **The oldest complaint thread on the board** (T1526, 2010). Opener: snap-to-grid is "an obvious and essential one.
  I seriously wonder why it is not in a v2." The creator's reply is the key answer to remember: *"Because buildings
  in real life don't snap to a grid"* — with magnetism active, drawing snaps to the nearest cm/inch according to
  zoom (added in v1.4). A later poster asks for Wing3D-style numeric constraints (Ctrl = 1 unit, Shift = 5, …) and,
  in 2015, for Shift+Alt drag to snap a wall end to another wall's end: *"One of the huge time wasters when using
  SH3D is tweaking walls so that they line up exactly. And usually they don't actually end up exact."* `OBSERVED`

**Where that leaves users** (T4341, 2013→2017): "adjustable magnetism to default lengths" so members land on a local
stud interval (e.g. 30 cm); one reply is blunt — *"all the walls NEVER ALIGN EXACTLY … so much time is wasted getting
corners to align exactly."* Another: it would be "wonderful to let the windows snap". A later poster wants snap-to-grid
but *"I do know I can manually enter numbers … but this is very slow and I prefer a point & click grid method"*, and
asks for a **larger magnetic hit area** because they "miss by 1 mm". `OBSERVED`

**Smart guides** (T5456): wants Illustrator-style smart guides and boolean intersect/subtract; another user asks for
snap-to-edge on Alt-drag; the creator answers simply that objects already snap via magnetism, and the user replies
*"Yes they do! I need to learn to be more gentle."* — i.e. the feature exists but is not discoverable or predictable.
`OBSERVED` + `INFERRED`

**Exact distances** (T13993, 2025): place a wall or object at a precise distance from another wall, by numeric input
or by snapping to dimension lines. There is no such core feature; the accepted answer is the template-box ritual.
Related: T4285 asks for **numerical input of a dimension line's value** (dimension lines are drawn and read, but not
typed). `OBSERVED`

**Wall lengths on the plan** (T4327): you cannot show lengths next to walls; you must hover/resize each wall or draw
dimension lines on a throwaway level; the community points to the third-party `DimensionLines.jar`. `OBSERVED`

**Centreline geometry surprises CAD-trained users** (T14156, 2025; T13597, 2024). A new user coming from LibreCAD
finds that snap points connect wall centrelines, so typed inner/outer dimensions change, and "with sloped walls it
turns into a trial-and-error game". The community's canonical answer is *"the fact that walls are measured using the
center line is discussed a thousand times here and appears to resurface every two weeks"* — and it "won't change".
The Italian thread is the same complaint with a frustrated user who nearly threw their PC out of the window and was
finally pointed to the community `Regular room` plugin. `OBSERVED`

**Join/split walls** (T2655, 2011; T14139, 2025). Splitting is easy, un-joining is not; there is a `Join walls` menu
command but it will not disconnect two already-connected halves, so the three-piece delete trick persists across 14
years. `OBSERVED`

**Walls are not in the object list** (T13182, 2024): the wish is to see walls beside furniture so a mis-sized wall can
be spotted and fixed without opening each wall's dialog; the creator refuses on the grounds that wall columns do not
match furniture columns and "it would be quite strange to mix walls and furniture in the same list". A commenter adds
that wall selection, grouping and invisibility are all missing. `OBSERVED`

### 2.4 Theme B — organisation: visibility, locking, levels, catalogue

**Hide elements** (T13620, 439k views) is the single most-viewed Wishlist thread, and it is not really a missing
feature — the answer explains the existing `Visible` checkbox column. The opener's real problem is that they *delete
and re-draw a roof to work underneath it* because they never found the checkbox, and the follow-up question in 2026
is sharper still: can the roof be hidden **in the plan only** while staying visible in 3D? Today the visibility flag
applies to both. `OBSERVED` + `INFERRED`

**Per-object locking** (T14320, 2025; T13190, 2024; T1720, 2010). The only lock is "base plan", and membership is a
per-item `Part of base plan` flag: you can lock walls/rooms *or* furniture, but only globally. Keet's wish: a
`Locked` checkbox column beside `Visible`, covering objects and groups, without having to lock the whole base plan. The
history is instructive: the 2010 request (T1720) was only for a per-object flag saying *whether* an item locks with the
base plan — and that is exactly what shipped as `Part of base plan`; the later requests (T13190 2024, T14320 2025) want
a truly independent per-object lock, and that is still unbuilt after 15 years. `OBSERVED`

**Level visibility** (T13933 and T13917, 2025). Levels function as layers, so one user's project reached **50+
levels**; switching a view means hunting among "tabs that spread horizontally in multiple rows", clicking each tab.
The requests are the same set a modern app would ship by default: replace tabs with a checkbox list, allow level
grouping, and save/restore visibility configurations (presets); a third user adds sub-levels/trees comparable to
Inkscape or Blender, and radio-button exclusivity inside a group to flip between alternatives in one click. The
first answer arrived only in 2025 as a community plugin — **Level Tags Manager**, SourceForge ticket
[#57](https://sourceforge.net/p/sweethome3d/plug-ins/57/) — credited in the thread itself by name, not shipped in the
app. `OBSERVED` (thread) + `OBSERVED` (round-1 `raw/plugin_table.txt`, for the plugin name and ticket id)

**Group visibility** (T6334, 2015→2024): the `Visible` checkbox is disabled for items inside a furniture group, so
working on one cabinet at the bottom of a stack means ungroup → hide the top pieces → edit → regroup; or apply a fully
transparent texture. Repeatedly requested for nine years; the creator explains the underlying model reason (a
partially visible group has ambiguous size/bounding box). `OBSERVED`

**Catalogue organisation** (T12654, 36 replies; T8485, 34; T13189, 14; T4751): sub-categories do not
exist; the category list is derived from unique category-name strings. The recommended workaround is naming items
`Exterior-Plants`, `Exterior-Vehicles`, … and using the "Searchable list" preference with multi-term matching. Editing
categories of a downloaded library must be done in a separate Furniture Library Editor, and **importing a library
update resets those edits**. A user's plugin (SH3DFurnGrouper) was prototyped in 2018 with a tree view and known bugs.
`OBSERVED`

**Folders** (T13189, 2024). A user asks for real folders in the furniture list, separate from groups, with per-item
visibility inside them. The creator's answer is a flat refusal with the model reason: *"Don't hope for these folders.
The main problem is how to make something visible again if it's not listed somewhere."* The user's counter — invisible
items would just be greyed out, not removed — is never accepted in the thread. `OBSERVED`

**Objects below the floor** (T8897): elevation cannot be negative, so recessed ceiling lights and railings "float on
the floor"; the workaround is to put them on the lowest level's ceiling. `OBSERVED`

**A per-view hide split** is exactly what a modern single-workspace SPA can express as separate Plan/3D/Walk
visibility state — the T13620 follow-up is the clearest statement of demand for it. `INFERRED`

### 2.5 Theme C — viewport, rulers/grid, panels, look and feel

**Panning.** T5072 ("Pan tool in 3D and 2D view?", 2014→2026, 112 replies) is the longest-running camera thread: the
plan supports a Pan tool (menu or space bar) but 3D aerial view panning is refused because it "only turns around the
centre"; the eventual fix for 3D was a community plugin (Pan3dView) that had its own startup crash and pan/zoom-reset
bugs; the installer-less user had to read Java stack traces to help. T15091 (2026) is the 2D restatement: the view is
"very boxed in", cannot centre on the edges, and the accepted answer is the ±5000 dummy-box trick. `OBSERVED`

**Rulers and grid.** T14580 (2026, 0 replies, 69k views): a teacher on Chromebooks moved a class from the Linux
desktop build to the online demo and the only missing feature is the ruler around the floor plan — students can no
longer judge scale. This is corroborated in the shipped web bundle: the plan component's ruler accessors throw
`UnsupportedOperationException("No rulers")`, and in the preferences UI the rulers checkbox is guarded by
`isPropertyEditable("RULERS_VISIBLE") && false`, so it is always rendered disabled; the grid pitch ladder is a fixed
1/2/5/10/20/50/100… cm sequence, with no user-set pitch. A related 2024 thread (T13505, "small icon") is answered by
pointing to an FAQ about tiny toolbar icons. `OBSERVED` (raw/bundle_ux_snippets.txt, raw/bundle_prefs_snippets.txt;
round-1 bundle/sweethome3d.min.js) + `DOCUMENTED` (thread T14580)

**Panels and screen real estate.** T4566 and T6007 (2013–2015): the 3D view cannot be truly hidden or minimised, only
dragged small; on a slow laptop the 3D analysis keeps consuming CPU even when the panel is collapsed, and the fix is
to save with the view closed and reopen — "less than ideal". T5746 is the same story from the other side: no
dimensions in 3D. `OBSERVED`

**Dark mode and UI scale.** T12872 ("Dark Mode", 34 replies, 248k views, 2024→2026). Quotes and facts worth keeping:
the request cites a 2021 blog promise; the UI and 2D view have "a lot of glaring white screen space"; a reply says
using it on a 60″ TV is rough on photosensitive eyes and asks for a **simple way to adjust font size**. The creator's
answer, relayed in the thread, is effectively "build it yourself" — change `getBackgroundColor`/`getForegroundColor` in
the plan component from source, *"otherwise this might be difficult"* — plus a SourceForge ticket pointer. A community
member then demonstrates a FlatLaf dark theme by dropping a JAR into the install's lib directory and passing a JVM
flag, but the packaged launcher hangs after the splash, the theme only applies when started from the JAR with a long
`-classpath`/`-Djava.library.path` incantation, and users need several rounds of quoting help to get it running; the
same user then has to rebuild the icon set too ("dark-mode is not all you need … otherwise you won't see ANYTHING if
the icons are dark"). Nine months later a legally-blind user posts that they *"literally cannot use the app at all
without a dark mode … I'm completely cut off"*, and the last post (2026) asks the vendor to make it a normal
selectable install option. `OBSERVED`

### 2.6 Theme D — 3D performance and hardware fragility

These are the threads with the most replies per topic, and they are where the app loses people:

- **T7640 (108 replies, 2017→2020) "3d View suddenly impossibly slow"**: users compare the desktop app unfavourably
  with the HTML5 export and report the 3D view becoming unusable on plans with a few furnished rooms. Key dated
  finding: several users tied it to a Windows 10 update and fixed it by installing a newer Windows build; the creator
  asked for a run with an older Java 3D (`-Dcom.eteks.sweethome3d.j3d.version=1.5.2`) — i.e. diagnosis is
  *stack-dependent*. `OBSERVED`
- **T11888 (108 replies, 2022→2024) "Weird 3D Artifacts"**: both the plan and the 3D view show shattered geometry
  after an upgrade; reverting the version and reinstalling GPU drivers does not help. `OBSERVED`
- **T6206 (53 replies, 241k views) "DirectX driver issues in windows 10"**: the app exits with a fatal 3D-rendering
  error on an integrated Intel chip that otherwise passes 3D tests. `OBSERVED`
- **T13959 (45 replies) file-open slowness**: the community explanation is that walls are "heavy CPU eating objects",
  many textures hurt, and the 3D view re-computes on every edit **on the CPU, not the GPU**; advice is to close the
  3D view before saving so the next open is faster, and to split off unused levels. `OBSERVED`
- **T10926 (51 replies) importing models freezes** the app and the Furniture Library Editor at the "Model
  Orientation" step with any `.dae`/SketchUp-derived model. `OBSERVED`

The through-line (`INFERRED`): a Java/Java3D desktop stack makes rendering quality hostage to the local GPU driver,
and there is no low-quality/CPU fallback the user can choose. The browser edition sidesteps driver installs but
inherits the CPU-bound scene graph (see 2.9).

### 2.7 Theme E — geometry the core cannot draw

Recurring across the last two years of high-view threads: no solid/boolean tool ("I know there is no solid tool in
SH3D", T14160), no arbitrary polygon ("how do I create irregular polygonal shapes … that can be modified with
textures?", T14151), no ellipse (T13998), roof windows cannot be angled into a roof without a plugin (T12135),
sloped ceilings only via per-wall start/end heights (T1065, and the 2025 T14156 follow-up where a user cannot work out
which level a room belongs to), and getting a curved room-as-model requires the export/import trick (T14451). The
vendor's own catalogue then compensates with third-party shapes: the Dodecagon thread (114 replies, 698k views)
announces 500+ free models and manuals, and the Shape/Roof Generator plugin threads are among the most-viewed plugin
threads on the board. `OBSERVED`

### 2.8 Theme F — trust, moderation and monetisation (context for positioning)

- **T14202 "Review of the last 14 months…" (2025-11)**: a long-time member concludes the GPL app is no longer being
  developed, that the rights holder can legitimately go closed-source, and advises everyone to download 7.5 and keep
  it safe. Later in the same thread users analyse the inflated view counters. The vendor finally replies with a
  general statement about backend work and promises transparency. `OBSERVED`
- **T14667 (2026-03→04)**: forum-flooding spam and AI-generated filler replies; a volunteer moderator says they delete
  about a dozen posts a day, members say reports are ignored, and the original creator intervenes in the thread to
  remove reported posts — the community is self-policing around an absent vendor. `OBSERVED`
- **T14359 (2025-12→2026-06) is the single most-viewed thread I captured (972k views)**: the vendor announces a
  website maintenance update and the thread becomes a bug list — the home page renders "completely blank" apart from
  the top bar and animation in Firefox ESR and even a one-year-old browser, and old blog month links "all redirect to
  the homepage". A member's line sums up the trust cost: *"That the site doesn't display correctly with a one year old
  browser is unacceptable … It's a simple site!"* `OBSERVED`
- **T15138 (2026-10-22) the forum migration**: the announcement post collects replies from users who cannot install
  and a purchaser demanding a refund after a virus warning. `OBSERVED`
- **T15061 (Italian, 2026-09)**: a user who activated the PRO trial cannot find how to cancel it in the Microsoft
  account, payment history or PayPal; no confirmation e-mail arrived. `OBSERVED`
- **T14496 (57 replies, 730k views)**: one of the most-viewed 2026 threads is a detailed recipe for masking SH3D's
  render quality — model in SH3D with coloured boxes, render at 4000 px with local colours, then feed that render to
  an external AI image tool with reference photos. `OBSERVED`

None of this is floor-planning UI, but it is the demand environment CasaPlazAI sells into: users reward "local, free,
no account" and punish nagging. `INFERRED`

### 2.9 What the browser edition actually does about the same complaints

Verified against the captured online editor (`SweetHome3DJSOnline.jsp`) and the web bundle, both from round 1, plus
this round's bundle snippets:

| Complaint | Browser edition state |
|---|---|
| Rulers (T14580) | **Absent.** `getHorizontalRuler()`/`getVerticalRuler()` throw `"No rulers"`; the rulers checkbox is hard-disabled in the preferences markup; only grid + magnetism toggles exist. `OBSERVED` |
| Grid snap (T1526) | Grid is drawn at a zoom-derived fixed ladder (1/2/5/10/… cm); magnetism bends to the nearest length unit step, not to a user pitch. No pitch setting. `OBSERVED` |
| Catalogue search (T12663) | **Present** — the bundle builds a visible `#furniture-search-field` next to a category `<select>`, matching all terms against name/category/tags/creator. The web preferences also expose the tree/list radio. The failure is therefore discoverability in the *desktop* build, not absence online. `OBSERVED` |
| Level management (T13933) | Online toolbar has add-level / add-level-at-same-elevation and a `<select id="level-selector">`; the level dialog has a `viewable-checkbox` plus name/elevation/floor-thickness/height. That is the same one-level-at-a-time model, with a dropdown instead of tabs. `OBSERVED` |
| Per-object lock (T14320) | No lock column anywhere in the online editor markup or bundle; only `basePlanLocked` / `PartOfBasePlan` exist. `OBSERVED` |
| Hide elements (T13620) | Dialogs do have per-object `visible-checkbox` flags (furniture, camera, compass, room floor/ceiling/area), but there is no Plan-only vs 3D-only visibility split. `OBSERVED` |
| Dark mode (T12872) | The online editor hard-codes `#home-plan { background-color:#FFFFFF; color:#000000 }` and a `#CCCCCC` 3D canvas; no theme switch. `OBSERVED` |
| Panning (T15091) | Pan is a touch gesture on the plan; the same plan-bounds/scrolling model applies. Nothing in the markup suggests free unbounded panning. `OBSERVED` + `INFERRED` |
| Save | Automatic, server-side, per modification, for logged-in users; the demo cannot save. `DOCUMENTED` (round 1: creator's forum answer) |

The relevant conclusion (`INFERRED`): the web edition is a faithful transpile of the desktop UX, so it inherits every
complaint above instead of fixing it — while adding server dependency, a login to save, and a demo that cannot save.
CasaPlazAI's localStorage autosave is a direct, defensible answer to that.

### 2.10 Cross-check against the CasaPlazAI schema

Read-only reference: `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`. The complaints map onto slots the
schema already has (or deliberately keeps outside it) (`INFERRED`):

- **Exact distances (T13993, T4285, T4327).** `Opening.tCenter` is normalised and `Room.polygon` vertices are metres,
  so a "distance to the opposite wall" readout is a pure derivative; a wall-length label is the segment length of a
  polygon edge. No schema change needed — a measure/annotation layer can live outside `FloorplanData`, exactly like
  the existing measurement annotations key.
- **Panning / rulers (T15091, T14580).** Viewport state (scale, origin, ruler visibility, snap pitch) is already
  out-of-schema editor preference (`casaplaza.snap.settings.v1`). Rulers and a free-pan origin are the same class of
  state; adding them does not touch the interchange contract.
- **Per-object lock (T14320).** The cleanest home is an editor-local property (like the underlay key), or an additive
  field; a `locked` flag on `Room`/`FurnitureItem` would be a schema-version bump under the `migrate.ts` convention,
  so shipping it as editor state first avoids a version churn and keeps share links clean.
- **Plan-only vs 3D-only visibility (T13620).** Same conclusion: view flags are presentation, not geometry. Keeping
  them out of `FloorplanData` also keeps the 3D viewer contract stable.
- **Levels (T13933).** The schema here is single-floor, but the context says CasaPlazAI has multiple floors; the
  lesson is to model floors as a structure with names/order + a visibility preset list, not as tab order.
- **Roofs/sloped segments and polygons (T14156, T14151, T14160).** `Room.roofs` with `leanDeg` is exactly the
  primitive SH3D lacks; polygonal rooms already cover the irregular-shape request. No need for a plugin ecosystem to
  get there.
- **Furniture footprint + rotationDeg (placement).** Already richer than SH3D's group-visibility problem, since
  collision/fit is explicit; the SH3D complaint (group bounding boxes of partially visible groups) does not arise if
  visibility is purely a render flag on a typed item.

---

## 3. Ideas for CasaPlazAI (ranked by value ÷ effort)

Each row names the finding it comes from and, where relevant, how it lands on the CasaPlazAI schema. High = do first.

| # | Idea | Tied to | Value / Effort |
|---|---|---|---|
| 1 | **Make snapping the headline.** Show a live X/Y and distance-to-neighbour readout while drawing/moving, with an explicit mode chip ("grid 0.5 m · wall · object · free") and a keyboard bypass. SH3D's answer to the grid request was that real buildings don't snap; its users then spent 15 years nudging corners and asking for a bigger magnetic hit area. | §2.3 T1526, T4341, T5456 | High / Low |
| 2 | **A per-object `Locked` flag, exposed as a column next to visibility, plus lock-all of a selection.** 2010 request, still unbuilt in 2025; the only competitor affordance is a global base-plan lock with an inheritance flag. Keep it as editor state first (like the underlay key) to avoid a schema bump. | §2.4 T14320, T13190, T1720; schema §"out-of-schema editor state" | High / Low |
| 3 | **Plan-only vs 3D-only visibility.** One checkbox per object/room is the competitor's whole answer; users explicitly ask to hide a roof from the 2D plan while it stays in 3D. In CasaPlazAI this is a second flag (or a per-mode set) rendered by the 3D viewer as an input, not part of `FloorplanData`. | §2.4 T13620, T6334 | High / Low |
| 4 | **Exact-distance entry while placing doors/windows/furniture.** Drag shows distances to both wall ends and to the nearest neighbour; typing a number commits it. This is T13993 plus the T4341 stud-spacing request; it needs no schema change because `tCenter` is normalised and derivable. | §2.3 T13993, T4285; schema `Opening.tCenter` | High / Low |
| 5 | **Always-visible search over the furniture palette with multi-term matching, plus a lock/hide column layout.** The competitor's online build does have the field and accent-insensitive multi-term matching, but the desktop build hides exactly that behind a preference — its users rename items to fake sub-categories and lose those edits on library update. Ship the field, not the preference. | §2.4 T12654, T8485, T4751, T12663; raw/bundle_catalog_snippets.txt | High / Low |
| 6 | **Free, unbounded pan with a one-click "fit plan" and a "centre on selection".** The competitor's viewport is bounded; its users place dummy boxes at ±5000 to work around it. Pure viewport state. | §2.5 T15091, T5072 | High / Low |
| 7 | **Rulers on by default + a visible grid-pitch control (0.5 m default).** The browser edition literally throws "No rulers"; a teacher on 1366×768 Chromebooks cannot judge scale. CasaPlazAI already stores a snap pitch; surface it. | §2.5 T14580; §2.9; schema `casaplaza.snap.settings.v1` | High / Low |
| 8 | **A level/floor panel that scales: named list, checkbox visibility, and saved visibility presets.** A competitor power user runs 50+ levels as layers and calls this the app's biggest limitation; the fix shipped as a community plugin. | §2.4 T13933, T13917 | High / Medium |
| 9 | **Dark mode + UI scale/font-size setting, shipping selected by default.** Recurring for five years, including a legally-blind user locked out of the app; the only workaround is a JVM flag and an extra JAR. CSS variables in a Vite/TS SPA. | §2.5 T12872 | High / Low |
| 10 | **Never let the 3D view block a 2D edit, and offer a cheap render mode.** Competitor users close the 3D pane, save, and relaunch to make editing usable; its own helper says re-computation is CPU-bound. In a Three.js SPA this means a render-on-demand/quality toggle and a pause when Plan mode is active. | §2.6 T7640, T13959, T4566, T6007 | High / Medium |
| 11 | **On-plan dimensions and a printable/exportable annotated view.** Wall lengths are not shown in the competitor's plan; its users install a third-party JAR or draw throwaway dimension levels. CasaPlazAI has a measure tool and PNG/JPEG export — make annotations part of the export. | §2.3 T4327, T5746; §2.7 | High / Medium |
| 12 | **First-class solid/polygon/parametric shapes instead of a plugin economy.** Irregular polygon rooms already exist; add simple solids/primitives and a "save selection as reusable furniture". The competitor's most-viewed recent threads are people teaching each other the room-export trick, and its most-used plugins are shape/stair/roof generators. | §2.7 T14160, T14151, T14156 | High / High |
| 13 | **Roof/sloped-ceiling controls with live validation.** `Room.roofs[].leanDeg` already exists with derived ridges; surface it in the inspector with the error codes as friendly messages (the competitor's users cannot work out level heights for sloped rooms at all). | §2.7 T14156, T1065; schema roof codes | High / Medium |
| 14 | **Guard against accidental deletion of an edge/opening: make "split" reversible and "join" explicit.** The competitor cannot un-join a split wall; the accepted method is cut → paste or split-into-three and delete the middle. A simple unlink/relink on shared-wall segments is cheap. | §2.3 T14139, T2655 | Medium / Low |
| 15 | **Say the quiet part in the UI: "Saved 4 s ago on this device — free, offline, no account, no paywall."** The competitor's most-viewed 2025–2026 threads are about abandonment, closed source, an unmoderated spam-ridden forum, subscription confusion and a demo that cannot save. | §2.8, §2.9 | High / Very low |
| 16 | **Treat the 3D view as a separate, pausable consumer.** One-click "hide 3D" and "open Plan full width" for small screens; competitor users work around the fixed split with window dragging and relaunching. | §2.5 T4566, T6007 | Medium / Low |
| 17 | **Publish short, in-app recipes for the 5 most common "how do I…" questions** (hide one piece, lock a wall, put a light below the floor, make a shape, measure between walls). The forum's answer to almost every wish is a procedure; documenting the procedure in context beats shipping an ecosystem. | §2.2, §2.4 | Medium / Low |

---

## 4. Unknowns

- **No SH3D desktop binary was run in this round.** Behavioural claims are grounded in captured forum posts, the
  vendor's shipped web bundle (7.5.2, round 1) and the online editor markup. The desktop build may differ where the
  transpile stubs features (rulers being the clearest case). `INFERRED` caveat.
- **View counts are contaminated.** The forum migration (2026-10) and suspected bot traffic inflate views; members
  discuss this openly. I ranked with views only as a proxy and always reported replies and dates, but "top by
  attention" is not "top by distinct users". Exact per-thread unique-reader data does not exist on the board.
- **I sampled 89 threads in full, not all 959 indexed topics.** I covered every board's by-views leaderboard and the
  Wishlist by-views and by-replies leaderboards, but a complaint that never accumulated views (or lives in a language
  board I did not page through) may be missing. The German-language board is not separate; German threads live in
  f=19 alongside Italian/Spanish/Russian ones, and I only sampled its most-viewed topics.
- **Reply counts from JSON-LD vs the paginated thread text can differ by one or two** (deleted/spam posts are removed
  but the JSON-LD counter can lag). I used the JSON-LD value for the table and the post text for the argument.
- **A few threads have unusable text.** Some posts are image-only or contain dead image/Mega/Yandex links (for
  example the dark-theme screenshots and BYDMA's theme archive), and forum search could not be used to find every
  follow-up, so the visual outcome of community fixes could not be inspected.
- **`rea capture-browser-scenario` still fails in this environment.** Playwright launches a provider-owned Chromium
  153 but navigation never captures the initial state and the run is cancelled after ~120–150 s (no scenario steps,
  `"Scenario navigation failed before the initial state was captured"`), with or without SwiftShader launch flags —
  and the schema does not accept custom `browser.args`, only `executable_path`. I therefore did not obtain a fresh
  live DOM of the online demo this round and relied on round-1 captures plus the raw page source. Evidence:
  `evidence/scen_online.out.json`, `evidence/scen_online2.out.json`. `rea doctor` also reports the host Node build is
  below REA's minimum and no Ghidra/IDA/JADX engines are configured, so no static analysis beyond script text was
  possible.
- **No Reddit/Trustpilot/search-engine sweep in this round.** The session's `web_search` provider had no API key
  (`DEEPSEEK_API_KEY`), DuckDuckGo's HTML endpoint returned HTTP 202 with no parsed results, and Bing returned a page
  with no extractable result list. The Reddit gap round 1 documented therefore remains open; my picture rests on the
  vendor forum, which is the question's focus anyway.
- **Monetisation/dark-mode/level-management motives are user testimony, not vendor statements.** Space Mushrooms'
  only first-party replies I saw are the 2025 reassurance post and the 2026 spam cleanup, both quoted above as
  `OBSERVED` (their own forum accounts), not as an official roadmap.

### Key URLs used

Vendor/software: https://www.sweethome3d.com/de/ ·
https://www.sweethome3d.com/SweetHome3DJSOnline.jsp ·
https://www.sweethome3d.com/support/forum/ (boards f=15 Wishlist, f=12 use&tips, f=13 3D problems, f=3 open
discussions, f=17 developers, f=19 other languages) ·
individual topics `viewtopic.php?t=<tid>` for every tid in §2.1.

Round-1 evidence reused read-only: `bundle/sweethome3d.min.js` (7.5.2), `raw/js_online.jsp.html`,
`raw/f15_wishlist_byviews.html`, `raw/f15_wishlist_byreplies.html`, `rea/inspect_online.json`,
`rea/inspect_a11y.json`, `report.md`.
