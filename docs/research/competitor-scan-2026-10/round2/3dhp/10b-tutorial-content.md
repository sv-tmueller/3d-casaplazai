# 3D House Planner & Peers — Tutorial Content: What Users Are Taught First, Which Tasks Need Tutorials

Job: `08-10b-reviews-business-tutorial-co` · **Round 2** · Research date: 2026-10-31
Subject: **3D House Planner**, https://www.3dhouseplanner.com/ (browser editor, Babylon.js; 2D planner iframe at `2D-Planner/index.php`)
Question: **Tutorial content for 3D House Planner and its peers (YouTube titles/descriptions, help pages): what users are taught first and which tasks need tutorials.**
Predecessor (round 1, read-only, not modified): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/10-10-reviews-business/report.md` — its evidence files are reused and extended here; this report does **not** redo its review/pricing/business work.

Legend: **[OBSERVED]** = I saw it directly (URL + evidence file in `evidence/` or in the round-1 folder). **[DOCUMENTED]** = vendor/platform documentation page. **[INFERRED]** = my reasoning from observed evidence.

---

## 1. Summary (5 bullets)

1. **3D House Planner teaches almost nothing in long form and a great deal in-product.** Its entire public long-form curriculum is **one** 2026 tutorial video (12 chapters, 8:49) and **one** 2026 blog post ("10 Easy Steps"); both front-load the *interface tour* and *wall drawing*. [OBSERVED] Everything else is in-product: a 4-choice first-run panel, a **6-card tour**, per-tool **hint lines**, and a grouped **Keyboard shortcuts** sheet — but there is **no help centre, no user guide and no FAQ-of-tasks** anywhere on the site. [OBSERVED]
2. **The taught-first order is settled and near-identical across five peers**: (1) how to look around / interface, (2) choose a starting method, (3) draw walls and close rooms, (4) put doors & windows on walls, (5) furnish/finish, (6) levels, (7) view or render, (8) export/share. [DOCUMENTED ×5] The lesson CasaPlazAI should copy is not the order — it is that every peer *chooses a starting method before drawing* (scratch / template / upload a blueprint / AI). [DOCUMENTED]
3. **The tasks that need tutorials are the ones users ask about by name.** Google autocomplete, harvested per product, returns a tight, repeated top set: **walls (add/delete/resize), doors & windows (place/reverse/rotate), walls & rooms after the fact, levels/second floor, ceiling & wall height, camera/navigation, and scale of an uploaded blueprint**. [OBSERVED] `how to use` is the #1 query for *every* product surveyed. [OBSERVED]
4. **3DHP's own hint strings are a free, authoritative map of the hard parts.** While a tool is active the editor prints a one-line micro-tutorial naming every modifier (`Click: place points · Enter…: finish · Type a number: exact length (Tab: angle) · Backspace: undo · Shift: grid · Alt: no snapping`). [OBSERVED — round-1 `i18n_extract.txt`] This is the highest-leverage tutorial pattern found and the one CasaPlazAI can adopt immediately. [INFERRED]
5. **3DHP's teaching surface is real but statically unmaintained and nearly invisible** — 4 long videos on a 88-subscriber channel with 270 items, 45+ of them Shorts that are *design essays, not product tutorials* (top Short 322 views, the 2026 product tutorial 2 views, 0 comments); the site links no YouTube and the editor's "Help" button has no help-centre payload in the shipped HTML. [OBSERVED] Peers solve the same problem with **task-titled video libraries and live teaching**: Planner 5D runs a **92-video "How to Make" playlist** ("How to Add a Room… Beginner Tutorial", "How to add stairs", "How to create a kitchen island"), Floorplanner runs **annual intro + advanced webinars plus monthly feature notes**, RoomSketcher publishes a "**Watch This First**" intro, and Homestyler serialises advanced skills as a **Bootcamp Vol. 3** ("Drawing the Second Floor", "Creating Roofs"). 3DHP publishes no task-titled tutorial at all. [OBSERVED]

---

## 2. Findings (detailed, with sources)

### 2.1 Method & reuse from round 1

Round 1 established the product, its business model, its review corpus (~6 independent reviews) and its in-product surface by (a) saving the raw editor HTML and DOM to `app.php.html` / `editor_dom.txt` and extracting the embedded i18n dictionary, and (b) reaching YouTube only through a reader proxy. It left two relevant gaps in its "Unknowns": *no hands-on interaction with the editor*, and *tutorial/community content was only touched at the level of subscriber/view counts* (§4 items 4 and 3). [OBSERVED — round-1 report]

This round:
- **Reused** round-1's `app.php.html`, `editor_dom.txt`, `i18n_extract.txt`, `i18n_extract2.txt`, `app_dom.txt` for all in-product teaching copy, quoted verbatim with the round-1 file as evidence. [OBSERVED]
- **Added** the 2026 long-form tutorial (video page with chapter list and full description, via `r.jina.ai`), the channel listing and Shorts listing, the corporate blog's step-by-step post, and five peer help centres. [OBSERVED/DOCUMENTED]
- `web_search` is still unavailable in this environment (`DeepSeek search has no API key for "DEEPSEEK_API_KEY"`), so discovery again used `web_fetch` against DuckDuckGo HTML endpoints and `r.jina.ai`, plus **Google Suggest** (`suggestqueries.google.com/complete/search?client=firefox`) as an unfiltered demand signal. [OBSERVED]
- REA 6.8.0 was checked (`capture-browser-scenario --help`, `--schema`); its schema takes one `inputJson` string and the round-1 scenario files demonstrate the action vocabulary, but a fresh browser run was **not** needed: every teachable fact this question asks about is present as literal UI copy in the round-1 HTML, and the live pages fetched cleanly. Chromium/WebGL limits from round 1 therefore do not affect this report's claims. [OBSERVED]

### 2.2 3D House Planner's own teaching surface — what it teaches *first*, in-product

The app's first-run teaching is a four-choice "Start your project" panel, a dismissible tour, always-on tooltips, contextual hint lines and a shortcuts sheet. What the vendor *chose to put first* is directly readable from the copy. [OBSERVED — round-1 `i18n_extract.txt`, `editor_dom.txt`, `app.php.html`]

**2.2.1 First-run panel — the four ways to start** (verbatim copy):

| Key | Label | Teaching line (the *why*) |
|---|---|---|
| `ux.start.title` | **Start your project** | "Draw a plan, describe a house to the AI or open something you already have. Everything stays in this browser." |
| `ux.start.draw` | **Draw in 2D** | "Walls, doors and rooms appear in 3D as you draw" |
| `ux.start.wall` | **Draw walls in 3D** | "Turn on the wall builder" |
| `ux.start.open` | **Open / import** | "Projects, IFC, DXF, GLB, OBJ, images…" |
| `ux.start.ai` | **Ask the AI** | "'A 3-bedroom house with a gable roof'" |
| `ux.start.dismiss` | Hide | — |

[OBSERVED — round-1 `i18n_extract.txt` lines 19–28] Note the ordering and the sample prompt: the vendor teaches entry by *method choice*, exactly as Homestyler, Planner 5D, Floorplanner and RoomSketcher do (see §2.4), and it hands the user a **literal example of a good input** rather than explaining AI. [INFERRED]

**2.2.2 The first-run tour — six cards, in this order** (this is the app's explicit "what to learn first" list):

| # | Key | Card title | Body |
|---|---|---|---|
| 1 | `ux.tour.views` | Four ways to look | "Orbit around the model, walk inside at eye level, see it from above or draw on the 2D plan." |
| 2 | `ux.tour.plan` | Draw in 2D | "Walls, doors, windows and rooms drawn on the plan appear in 3D as you draw." |
| 3 | `ux.tour.catalog` | Furniture and textures | "Click an object to put it in the middle of the view, or drag it to the exact spot." |
| 4 | `ux.tour.frame` | **Lost in the scene?** | "This button (or the Home key) brings the whole project back into view." |
| 5 | `ux.tour.file` | Save and export | "Projects are saved in this browser (Ctrl+S). Export to IFC, GLB, DXF, PNG and more." |
| 6 | `ux.tour.ai` | AI assistant | "Describe a house or a change and the assistant builds it. It uses your free Puter account." |

[OBSERVED — round-1 `i18n_extract.txt` lines 57–72] Order: **modes → drawing → furnishing → recovery from being lost → saving → AI.** The recovery card is placed 4th, before AI and export — evidence that disorientation is a recognised failure mode. [INFERRED] The tour is re-openable via `ux.tour.open` = "Show the first steps tour". [OBSERVED]

**2.2.3 Contextual hint lines — the per-tool micro-tutorials.** This is the most explicit teaching content in the product and it names every modifier and escape hatch for each drawing tool. Verbatim:

- Wall chain: `wb.hint` = "Click: place points · Enter, double-click or right-click: finish · Click the first point: close · **Type a number: exact length (Tab: angle)** · Backspace / Ctrl+Z: undo · Esc: cancel, Esc again: exit · Shift: grid · Alt: no snapping" [OBSERVED — `i18n_extract2.txt`]
- Rectangle: `wb.hintRect` = "Click two opposite corners · Type a number: width (Tab: depth) · Backspace / Ctrl+Z: undo · Esc: cancel, Esc again: exit · Shift: grid · Alt: no snapping"
- Room-by-size: `wb.hintRoom` = "Move the room and click to drop it · Esc: cancel"
- Arc: `wb.hintArc` / `wb.hintArcBend` = chord/radius entry, bend, cancel
- Measure: `measure.start` "Click the first point", `measure.startAngle` "Click three points: the second one is the vertex", `measure.hint` "Snaps to the corners of walls, openings, floors and objects. Shift: along an axis · Esc: cancel"

[OBSERVED — round-1 `i18n_extract.txt` and `i18n_extract2.txt`] The vendor is effectively publishing a task-level tutorial at the moment of need; the same strings also appear inside the 2026 video script (see §2.3). [INFERRED]

**2.2.4 Reference teaching:** `keys.title` = "Keyboard shortcuts", grouped by `ux.keys.gApp` (Project), `ux.keys.gView` (View), `ux.keys.gEdit` (Editing), `ux.keys.gWalls` (Drawing walls); `ux.keys.title` = "New shortcuts". Content includes Save, Walk, snap-to-grid, copy/paste, multi-select, undo/redo, finish-walls, "Type the angle after the length", "Remove the last point". [OBSERVED — round-1 `i18n_extract.txt` lines 9–56]

**2.2.5 Tooltips on essentially every control** (`ui.view3dTip`, `ui.view2dTip`, `ui.walkTip`, `ui.levelTip`, `ui.unitsTip`, `ui.catalogTip`, `wb.*Tip`, `gui.*Tip`) and `ui.help` = "Help" on a top-bar Help button (`id="hpToolHelp"`, `aria-label="Help"`, Material icon `help_outline`). [OBSERVED — round-1 `editor_dom.txt`]

**2.2.6 What is missing (the gap).** Searching the entire saved editor HTML and both i18n extracts for `help`, `tour`, `guide`, `doc`, `manual`, `faq`, `tutorial`, `video`, `youtube`, `academy`, `learn` finds **no help centre, no FAQ, no user guide, no embedded video, and no link to the YouTube channel** — the only "Help" payload is the shortcuts sheet + tour, and the only `youtube` string in the whole product family lives on the marketing landing page (channel link `youtube.com/@3dhouseplanner563` in `app_dom.txt`). [OBSERVED — round-1 `app.php.html`, `editor_dom.txt`, `i18n_extract*.txt`, `app_dom.txt`; the landing page links only SourceForge/Slashdot/AlternativeTo/G2/PH/Capterra/GetApp/review badges as its "help/community" surface] The blog is corporate content marketing (renovation, colour, lifestyle), not product documentation. [OBSERVED — `evidence/blog` fetch; blog index lists 36 pages of lifestyle posts] The 2026 step-by-step post is the single exception. [OBSERVED]

### 2.3 3D House Planner's long-form curriculum (the actual tutorial content)

**2.3.1 The 2026 complete tutorial — chapter order is the product's declared curriculum.**

Video `Q_2c5YZnr8k`, "3D House Planner Tutorial: Design Your House in 3D for Free (Complete Guide)", published **30 Oct 2026**, 8:49, 88-subscriber channel, **2 views, 0 likes, 0 comments** at capture, YouTube "**How this was made: Made with AI**" label; narration "generated with AI (Kokoro TTS)", music "original track made for this video". [OBSERVED — `evidence/3dhp_youtube_complete_tutorial.md`]

| Timestamp | Chapter | What is taught |
|---|---|---|
| 0:00 | Welcome | promise: free, no install, no sign-up, no watermark |
| 0:17 | **Getting started** | interface / how to begin |
| 1:06 | **Drawing walls in 2D** | the first real task |
| 2:11 | **Doors, windows and rooms** | hosted openings cut automatically |
| 3:09 | Moving around in 3D | navigation (orbit / top / walk) |
| 4:03 | Furnishing with the catalog | placement |
| 4:49 | Materials and colors | finishes |
| 5:17 | Building tools, floors and roofs | levels, slabs, roofs |
| 5:55 | Measuring and sunlight | measure + sun study |
| 6:31 | Render quality, images and AR | visualisation and output |
| 7:02 | AI assistant | generative entry |
| 7:28 | Saving, exporting and sharing | persistence and hand-off |
| 8:28 | Your turn | call to action |

[OBSERVED — chapter list and description in `evidence/3dhp_youtube_complete_tutorial.md`]

Description text (excerpt, verbatim): *"In this complete tutorial we design a small house from scratch: draw the floor plan in 2D, add doors, windows and room finishes, explore it in 3D, furnish it from the catalog, change materials and textures, work with levels, measurements and sunlight, render photorealistic images, use the AI assistant, and export or share your project."* It closes with a feature enumeration ("2D floor planner with live 2D/3D sync, walls, arc walls and dividers, doors and windows, room styles, 3D orbit, top and walk views, furniture catalog with nearly 2,000 models … import and export (PDF, IFC, DXF, SVG, GLB, glTF, OBJ, STL, CSV, PNG), share view links, BIM panel and 10 languages"). [OBSERVED]

**2.3.2 The 2026 blog post — "10 Easy Steps", a second, independent ordering of the same curriculum.** Published 2023-09-15, updated for the 2026 UI; section list:

1. Open the editor and learn the interface (top bar = the four views + level selector + Frame all + File + Catalog + render quality + AI + BIM; **Floors & grid**; the three-tab tool panel **View and light / Build / Measure, copy and paint**; status bar)
2. Draw the walls with the Wall builder (modes Chain, Single, Rectangle, Arc; wall position Center/Inside/Outside; thickness & height; **"Type a number to set an exact length (press Tab to type the angle), hold Shift to snap to the grid"**; close the room → floor is created automatically)
3. Add floors, doors, windows and the roof (doors/windows come from the catalog and "when a door or a window touches a wall, the opening is cut automatically")
4. Work on the live 2D plan (left toolbar: Select, Walls, Arc wall, Divider, Joint, Doors, Windows, Stairs, Objects, Rooms, Text, Measure)
5. Furnish the house with the catalog (search, categories, click-to-centre or drag-to-spot, gizmo, Shift-snap)
6. Apply materials and textures (+ AI texture, material brush)
7. Let the AI assistant help you
8. Walk through and render your design (Draft → Balanced → High → Ultra → Path tracing → AI photo)
9. Check quantities and costs with BIM
10. Save, share and export

[OBSERVED — `evidence/3dhp_blog_stepbystep.md`]

**2.3.3 Video vs. blog convergence.** Both teach the same first three things — **interface → walls → doors/windows/rooms** — then diverge only in depth: the blog gives a 10-step task list; the video gives a 12-chapter walkthrough. The video adds *navigation* as an early chapter (3:09) where the blog folds it into step 1; the blog adds *BIM quantities* and *sun study* where the video mentions sun only inside "Measuring and sunlight". [INFERRED from the two orderings]

**2.3.4 Channel economics — the tutorial investment is small and short-lived.** Channel `youtube.com/@3dhouseplanner563`: **88 subscribers, 270 videos**. Long-form product videos = **4**: the 2026 tutorial (8:49, 2 views, 8 h old), "3D House Planner App" (2:50, 37 views, 1 y), "3D House Planner. A Free 3D home design APP" (3:36, 236 views, 1 y), and the 2023 promo "…See Updated Version Below" (7:43, **721 views, 3 y**). The other ~266 items are Shorts. [OBSERVED — `evidence/3dhp_youtube_channel.md`] The Shorts are **not product tutorials**: they are home-design/lifestyle essays — "How to Design a House That Maximizes Natural Airflow", "What Size Should Each Room Be?", "The One Rule Architects Never Break", "Catios & Outdoor Cat Enclosures" — each 2–322 views. [OBSERVED — `evidence/3dhp_youtube_shorts.md`] A dedicated `site:youtube.com "3dhouseplanner" tutorial OR review` search returns **no results**, i.e. no third-party tutorial exists. [OBSERVED — DuckDuckGo HTML]

**Reading:** the vendor has *one* deliberately produced, AI-assisted, current tutorial and a blog post, both aimed at a first-time user, and neither is surfaced in the product. Its teaching is therefore almost entirely in-product. [INFERRED]

**2.3.5 Peer YouTube curricula — titles reveal the real teaching agenda.** Because the question asks specifically about YouTube titles/descriptions, the peer channels were enumerated as well. [OBSERVED — `evidence/planner5d_youtube_howto_playlist.md`, `evidence/roomsketcher_youtube_videos.md`, `evidence/homestyler_youtube_videos.md`, `evidence/floorplanner_youtube_videos.md`]

| Channel | Shape | Representative titles (verbatim) | What that teaches |
|---|---|---|---|
| **Planner 5D** — "How to Make – Tutorials" playlist, **92 videos** | task-per-episode, evergreen, SEO-titled | "How to Add a Room in Planner 5D: 5 Easy Ways \| **Beginner Tutorial**"; "How to add stairs \| **Tutorial for beginners**"; "How to create a kitchen island"; "How to add a texture"; "How to create a glass ceiling"; "How to Build a Staircase"; "STOP Making Stairs Wrong in Planner 5D – Do THIS Instead!"; "You Won't Believe How Easy It Is to Build a **Dormer Roof** \| Tutorial"; "How To Make a **Skylight**"; "How To Add 3D Models"; "How To Make Awesome **360 Walkthroughs**"; "How to Set up Sunlight for Render"; "**Upload a plan**"; "6 Easy Ways to Start Your Interior Project Online"; "19 most popular tricks for Planner 5D: floor, walls, ceiling, sizing, renders" | the evergreen long tail: **stairs, roofs/skylights, ceilings, textures/models, render lighting, 360**, plus a beginner pair (add a room / add stairs) and an upload-a-plan video |
| **RoomSketcher** | few, deliberate, tutorial-first | "**New to RoomSketcher? Watch This First (4-Minute Tutorial)**"; "Quick Intro to RoomSketcher"; "**How to Create a Floor Plan with RoomSketcher (Step-by-Step Tutorial)**"; "Quick Guide to RoomSketcher Web Portal"; "**AI Powered Floor Plan Conversion: Complete Guide**"; "**How Do Credits Work?**"; "How to Create an **Electrical Floor Plan**"; "How to Read a House Plan (Floor Plan Symbols Explained)"; "The Easiest Way to Create a Floor Plan (**No CAD Needed**)" | exactly the two-track mental model from §2.4: **watch-first intro → step-by-step plan → portal → AI convert**, plus billing/credits and niche plan types |
| **Homestyler** — "**Homestyler Bootcamp Vol. 3**" | serialised cohort/bootcamp, one skill per episode | "Drawing the **Second Floor**"; "Creating **Roofs**"; "How to Plan & Draw **Outdoor Spaces**"; "How to Quickly Adjust **Camera Composition and Realistic Lighting**"; "5 Practical Interior Styling Tips"; "How to **publish your project** like a seasoned pro"; "How to Quickly Create a **Sloped Ceiling**" | the *advanced* half of the curriculum, delivered as a season: **levels, roofs, outdoor, camera/lighting, publishing**, plus one-off feature updates |
| **Floorplanner** | **teach-by-changelog** + annual intro | "**Introduction webinar 2023 / 2024 / 2025**"; "Advanced tools webinar 2023/2025"; "**2D 3D export settings webinar 2024**"; "**Subscriptions and Project levels** May 2025 / 2023"; "New Features" for ~24 consecutive months (Dec 2022 → May 2025); "How to: Using the group feature"; "How to use the new presentation feature" | release cadence is the teaching cadence: **one intro webinar per year + one advanced webinar per year + monthly feature notes** |

**Three takeaways:** (a) the tutorial *titles* match the demand clusters of §2.6.1 almost one-to-one — stairs/roofs/windows/levels/ceiling/render/upload are precisely what users ask for; (b) the beginner floor is tiny everywhere (one to three "beginner/first" videos) against a deep advanced tail; (c) **3DHP is the only channel of the five that does not publish task-titled videos** — its 8:49 tutorial is a single omnibus and its 45+ Shorts are lifestyle essays. [OBSERVED/INFERRED]

### 2.4 Peer tutorial surfaces — what each teaches first

**Planner 5D** — [DOCUMENTED] `support.planner5d.com/en/articles/15820080-first-steps-in-planner-5d-web`
- "First steps" is *seven entry points*, taught in order: **from scratch (one default room)** · **use a template** · **upload a plan** (automatic re-creation) · **Smart Wizard** (AI, by preferences) · **Moodboard** (collect style before drawing) · **Design Generator** (AI inspiration) · **hire a designer**. Note: the tutorial's *first* fact is the workspace concept ("Spaces" = a container per project).
- "Where can I learn the basics?" points to a **Design School**: a free 25-short-video course "How to use Planner 5D" whose stated outcomes are: "Create projects with several rooms · **Change wall and room dimension** · Add furniture and decor · Create houses with roofs, multiple stories, pools and balconies · Understand how to use Planner 5D features". [DOCUMENTED] `planner5d.com/interior-design-courses/how-to-use-planner-5d`
- Help-centre **Video Tutorials = 20 articles split "For beginners" (3) / "For advanced users" (17)**. Beginners: "Where can I learn the basics?", **split-level floors and raised platforms**, **foundation**. Advanced: floor trim & mouldings, skylights/roof windows, mezzanine, basement garage + outdoor lounge, ceiling beams, LED strip lights, view behind a window, triangular windows, L-shaped house with sloped roofs, open space between two floors, built-in shelves/wardrobe, beauty table & swing, kitchen island, garden decor, lake, sloped attic ceiling, custom fireplace. [DOCUMENTED] `support.planner5d.com/en/collections/3520614-video-tutorials`
- Interpretation: Planner 5D front-loads **entry-method choice + interior decorating outcomes**, and its advanced shelf is dominated by *"can I build this odd shape?"* requests. [INFERRED]

**Homestyler** — [DOCUMENTED] `homestyler.com/learn-help?lang=en_US`, `homestyler.com/learn/get-started`, `homestyler.com/learn/video-tutorials`
- **Onboarding carousel = 4 steps**: "**Create Room (1/4) → Adjust Camera View (2/4) → Decorate Room (3/4) → Render & Share Image (4/4)**".
- **Beginner's Tutorial** order: How to Create a New Project · **Introduction to Design Interface** · How to Set Preferences · **How To Create Room** · How to Find and Use Models · **How to Adjust Wall and Floor Materials** · How to render images · (then a 6-minute style build).
- **Video tutorials are numbered 1–13** in exactly that order: 1 Introduction to the Design Interface · **2 How to Draw Floor Plans and Create Rooms** · 3 Tile Flooring · 4 Customize Wall · 5 Customize Ceiling · 6 Customize Floor · 7 Interior Modeling 2.0 · 8 Rendering Interface · 9 Lights for Rendering · 10 Render Videos · 11 Upload 2D Textures and 3D Models · **12 How to build multi floors and draw outside area** · 13 Member-exclusive functions (lightmix, retouch, **watermark removal**).
- Help contents tab list (the documented topic taxonomy): Get Started · What's New · General Operations · **Floor Plan** · Full House Furnishing · Custom Furniture · Interior Modeling · Lighting and Rendering · Model Upload · Membership · Account and Point · Team License Tutorials · FAQ · Video Tutorials. Community "Bootcamps": Tomorrow's Creators ("Build a house in under 60 minutes"), Room Mastery (5 weeks, 5 rooms, coins + certificate). [DOCUMENTED]
- Interpretation: Homestyler's structure is *task-module based* (one numbered module per capability), and it teaches **rooms first, then finishes, then rendering**; billing/membership is a help category of its own. [INFERRED]

**Floorplanner** — [DOCUMENTED] `floorplanner.frontkb.com/en`
- Help centre top level: **Accounts (28) · Projects (37) · Working in the Editor (218 articles in 8 categories) · Credits (13) · Subscriptions (8) · Features Explained (2) · Floorscanner (7) · Marketplace (2) · Glossary (1) · Business Features**. It has a **Glossary** category ("A visual guide of all the interface elements") — the only peer with a named glossary. [DOCUMENTED]
- "Working in the Editor" leads with **Work Area ("the area where you draw your plan, also named canvas")**, then *display-option* how-tos (text box, dimension line, black-&-white view, undo/redo, auto dimensions, area-label outline, short/horizontal/interior dimensions, structural colour, labels, shadows, lights, fixtures, cameras, furniture, item outline, furniture colour, image smoothing, blueprint mode, lock icons, tape measure, pivot point, meters↔feet, zoom, grid), then a **Design** group ("My design loads zoomed out", "My design doesn't load at all", "How many designs can you save on one floor" = "SD Lite projects are limited to 1 floor/1 design, but all upgraded projects can have up to 7 floors/10 designs per floor", copy a design to another project/floor, design history, restore deleted design). [DOCUMENTED]
- "Projects" teaches **entry methods by name**: "How to start a new project with an existing FML file", "**How to start with Upload Image**", "**What is the Room Wizard?** — a shortcut to start a project from the Create Project icon. Room Wizard will guide creation with room shape selection, dimension room, …", "**What is a start as an Empty Plan?** … not implement the shortcuts of **Magic Layout** nor Upload Image", and FML = "Floorplanner Markup Language … the data format developed and maintained by Floorplanner". [DOCUMENTED]
- Interpretation: the largest help base in the survey is dominated by **view settings, project/level limits and recovery from a blank screen** — i.e. tutorials are demanded most where state is invisible. [INFERRED]

**RoomSketcher** — [DOCUMENTED] `help.roomsketcher.com/hc/en-us`, `.../articles/35581805358877`, `roomsketcher.com/webinars/`
- Home page is organised as a **decision tree, not a feature list**: "**How would you like to create your floor plan?** → Convert with AI · **Draw from Scratch** · **Trace Over** · Order Floor Plans · Capture a Space (LiDAR) · Share/Download/Print · Measurements and Total Area · AI and 3D Visualization · Customize Floor Plans · Account, Billing and Reports · Advice and Troubleshooting". [DOCUMENTED]
- "New to RoomSketcher? **Start here**" begins with a **two-part mental model** ("Web Portal = dashboard… RoomSketcher App = your drawing tool"), then **Step 1 Create your first project**, **Step 2 Choose your creation method** framed as one question — *"do you already have a blueprint?"* — with Yes/No branches, then "What happens after you choose?" and "When you're ready to visualize". [DOCUMENTED]
- **Free live beginner workshops** are the flagship teaching: "Getting Started: Draw from Scratch — you'll learn how to: **Draw walls and create rooms from scratch · Add doors, windows, furniture, and key details · Edit and export a print-ready floor plan**"; and "Getting Started: Upload a Blueprint — **Upload a floor plan or blueprint and set the scale · Use AI Convert and trace manually · Edit and export**". One-time advanced webinars cover a single feature per month (e.g. "Upload a Plan And Learn to Trace"). Testimonials explicitly credit the session for removing "our major barrier". [DOCUMENTED]
- Interpretation: RoomSketcher's curriculum is **walls → openings/furniture → export**, plus a dedicated **blueprint-scale** track; testimonials show live teaching converts. [INFERRED]

**Sweet Home 3D** — [DOCUMENTED] `sweethome3d.com/users-guide/`
- The user's guide publishes an explicit **"suggested steps of a home design"** (8 steps), which is the cleanest statement of a taught-first order in the survey:
  1. **Import the scanned blueprint** as a background image
  2. **Draw walls** upon it
  3. Edit walls (thickness, colours, textures)
  4. **Add doors and windows** ("don't take doors and windows into account while drawing walls, because Sweet Home 3D will automatically compute the holes")
  5. **Add furniture** (magnetism aligns/rotates it to walls; drop on a larger piece to elevate)
  6. **Draw rooms** and set floor/ceiling colour
  7. **Add levels and staircases**, then repeat steps 1–6 per level
  8. **Draw dimensions and add texts**, then print
- Before step 1 it teaches **preferences** (default unit, default wall thickness/height) and **the four panes** (catalog / furniture list / plan / 3D view). It also documents the background-image *scale* wizard in detail (match a known length, set the origin) — the peer treatment closest to CasaPlazAI's blueprint underlay. [DOCUMENTED]
- Interpretation: this is the closest analogue to CasaPlazAI's data model (walls, rooms, openings, furniture, levels, dims) and its teaching order is the best template. [INFERRED]

### 2.5 The common "taught first" curriculum (synthesis)

| Order | Task | 3DHP in-product tour | 3DHP 2026 tutorial | Sweet Home 3D guide | Homestyler | Planner 5D | Floorplanner | RoomSketcher |
|---|---|---|---|---|---|---|---|---|
| 1 | Interface / how to begin | card 1 "Four ways to look" | ch. 0:17 Getting started | panes + preferences | Step 1–2 (interface, preferences) | "Spaces", first steps | "Work Area" | portal vs app |
| 2 | **Choose a starting method** | start panel (4 choices) | implied | blueprint import | "Create a New Project" | **7 entry points** | Room Wizard / Upload Image / Empty Plan | **5 creation methods** |
| 3 | **Draw walls & close rooms** | card 2 "Draw in 2D" | ch. 1:06 | steps 2–3 | "Create Room" / video 2 | course outcome #1 | (construction category) | workshop bullet 1 |
| 4 | **Doors & windows** | (in card 2's sentence) | ch. 2:11 | step 4 | video 3+ (via tiles/wall) | course outcome | (editor category) | workshop bullet 2 |
| 5 | Furnish / finish | card 3 "Furniture and textures" | ch. 4:03, 4:49 | steps 5–6 | "Decorate Room" / "Find and Use Models" | course "Add furniture and decor" | — | workshop bullet 2 |
| 6 | Levels / second floor | — | ch. 5:17 | step 7 | video 12 | advanced articles | Projects category (limits) | AI/3D category |
| 7 | View / navigate / render | card 1 (walk) | ch. 3:09, 6:31 | 3D view section | "Adjust Camera View" / video 8 | "roofs, multiple stories" | — | "When you're ready to visualize" |
| 8 | Save / export / share | card 5 "Save and export" | ch. 7:28 | step 8 (print) | "Render & Share Image" | — | Projects category | Share/Download/Print |
| — | Recovery ("I'm lost / blank") | card 4 "Lost in the scene?" | — | — | — | — | Zoom Extents / "doesn't load" | "Advice and Troubleshooting" |

Sources: [OBSERVED] 3DHP columns (round-1 i18n + `evidence/3dhp_youtube_complete_tutorial.md`); [DOCUMENTED] peer columns (URLs in §2.4). [INFERRED] for the cross-mapping.

**Three lessons fall out of the table:**
- **The taught-first order is settled** (interface → start method → walls → openings → furnish → levels → view → export). CasaPlazAI does not need to research this again; it needs to *implement* it. [INFERRED]
- **Every peer teaches a "start method" before the first wall.** CasaPlazAI's current flow (draw room / polygon / underlay) is a start-method choice too, but presenting it as an explicit 3–4-way first screen is the peer consensus. [INFERRED, ties to §3 idea 1]
- **"Recovery" and "levels" are the two places the consensus thins out**, and they are exactly the two places user questions cluster (§2.6). [INFERRED]

### 2.6 Which tasks need tutorials — demand evidence

**2.6.1 Autocomplete demand (Google Suggest, harvested 2026-10-31).** This is raw query demand, unaffected by the vendor's own content strategy. [OBSERVED — `evidence/google_autocomplete.txt`]

| Product / seed | Top suggestions returned (abridged, in order) |
|---|---|
| `planner 5d how to` | **how to delete wall** · **how to add a wall** · how to use · **how to rotate objects** · how to save project · **how to cancel subscription** · how to draw walls · how to cancel free trial · **how to change room size** |
| `homestyler how to` | how to use · **how to change ceiling height** · **how to add stairs** · how to open doors · how to rotate window · how to change door color · how to add floor · **how to move room** · how to cancel subscription · how to change wall color |
| `floorplanner how to` | how to use · **how to scale background** · **how to add second floor** · how to move camera · how to start · **how to set scale** · **how to move a room** · place door · how to make a roof |
| `sweet home 3d how to` | **how to add floor** · **how to install plugin** · **how to add roof** · how to use · **how to add door** · how to create roof · how to · **how to move camera** · **how to import furniture** · **how to import models** |
| `floor planner how to` | **how to use floorplanner** · floor planner tool (free) · 3d floorplanner · floor planner 2d to 3d · floor planner ai tool |
| `how to draw a floor plan` | …with dimensions · for a house · **to scale** · for free · in autocad · on paper · in word · in sketchup · by hand |
| `how to make a floor plan` | …of your house · in canva · in autocad · layout · in sketchup · **for free** · in excel |
| `3d home design how to` | home design 3d how to **add second floor** · how to create 3d home design · how to make 3d home design **online free** · home design 3d how to use · **how to change wall height** · **how to add roof** |
| `3d house planner` | **3d house planner free** · online house planner 3d · free download · **free reddit** · ikea · free online · app · ai · web |

**Clusters that repeat across products** (ranked by how many products surface them):
1. **Walls & rooms, after the fact** — add/delete a wall, move/resize a room, change room size (Planner 5D, Homestyler, Floorplanner, Sweet Home 3D). [OBSERVED]
2. **Doors & windows as objects** — add door, place door, open doors, reverse/rotate a window, change door colour (Sweet Home 3D, Floorplanner, Homestyler, Planner 5D). [OBSERVED]
3. **Levels / multi-storey** — add second floor, add floor, how many floors (Floorplanner, Planner 5D, Homestyler, generic `3d home design`). [OBSERVED]
4. **Scale of an imported blueprint** — how to scale background, how to set scale, "to scale" (Floorplanner, generic). [OBSERVED]
5. **Heights** — ceiling height, wall height (Homestyler, generic `3d home design`). [OBSERVED]
6. **Camera/navigation** — move camera (Floorplanner, Sweet Home 3D). [OBSERVED]
7. **Furniture mechanics** — rotate objects, import furniture/models, find and use models (Planner 5D, Sweet Home 3D, Homestyler). [OBSERVED]
8. **Billing/cancellation** — cancel subscription / cancel free trial (Planner 5D, Homestyler) — a paywall artifact, not a skill; CasaPlazAI is free and should never create this demand. [OBSERVED]
9. **`how to use` is the #1 suggestion for all four named products** — i.e. the most common need is still "tour the UI", years after each product's launch. [OBSERVED]
10. **Roofs** (Sweet Home 3D, Floorplanner, generic `3d home design`) and **import models/plugins** (Sweet Home 3D). [OBSERVED]

**2.6.2 Corroboration from reviews and help taxonomies.** Round 1's review corpus independently names the same weak spots: Floorplanner's "**measure tool hopeless**", "**a second floor behaves like a brand-new empty project**", "**rooms can't be click-drag resized**", "exported DXF is a mess"; Homestyler's "**wrong furniture dimensions/counter heights**, walls/cabinets misbehaving"; Planner 5D's "**paywall pops up**". [OBSERVED — round-1 report §2.5] Floorplanner's help centre devotes whole article families to *"my design doesn't load / only the grid / blank space"* and to per-toggle display settings, and its Projects category must answer *"How many floors and designs can 1 project hold?"*. [DOCUMENTED] RoomSketcher's decision tree is built around **"do you already have a blueprint?"**, and two of its flagship workshops are trace/scale. [DOCUMENTED] Sweet Home 3D's step list calls out the counter-intuitive rule *"don't take doors and windows into account while drawing walls"*. [DOCUMENTED]

**2.6.3 Which tasks genuinely need tutorials (ranking).** Combining §2.6.1–§2.6.2 and the fact that the vendors wrote hint text for exactly these steps (`wb.hint*`, `measure.hint`, `p2d.frontHint`): [INFERRED]

| Rank | Task | Why it needs teaching | Evidence |
|---|---|---|---|
| 1 | **Drawing walls so rooms close correctly** (chain vs rect vs polygon; typed exact length; closing loop) | universal first task; wrong closure = no room = no 3D, and the failure is silent | §2.5 row 3; SH3D step 2; 3DHP `wb.hint*` |
| 2 | **Levels / a second floor** | every peer has a dedicated article/video; Floorplanner users report the floor resets; CasaPlazAI's per-floor schema makes it a first-class concept | autocomplete #3; Floorplanner articles; Homestyler video 12; round-1 §2.5 |
| 3 | **Doors/windows on edges** (place, host, reverse, resize) | openings are *derived* from an edge; users look for them as standalone objects | autocomplete #2; SH3D step 4; 3DHP ch. 2:11 |
| 4 | **Scaling and aligning a blueprint underlay** | requires a known reference length and origin; invisible state if wrong | autocomplete #4; SH3D wizard; RoomSketcher "Upload a Blueprint" |
| 5 | **Measuring and dimensioning** | users arrive with a tape measure and expect to *enter* dimensions, not just read them; rivals are criticised for weak measure tools | round-1 Floorplanner "measure tool hopeless"; 3DHP `measure.hint` |
| 6 | **Navigation / "I'm lost in the scene"** | 3D camera disorientation; all three 3DHP tour/keys entries include it | 3DHP tour card 4 + `ux.keys.frame`; autocomplete "move camera" |
| 7 | **Furniture placement & rotation with fit constraints** | rotation + wall alignment + footprint fitting; SH3D devotes four drag indicators to it | SH3D step 5; autocomplete "rotate objects" |
| 8 | **Rendering / export / share** | the payoff step; asked as "render images", "share image" | Homestyler step 4; 3DHP card 5 |
| 9 | **Heights & thicknesses** (wall height, ceiling, sill/head) | numeric and per-element; powers "can I fit this" | autocomplete #5 |
| 10 | **Roofs** (3DHP) | only relevant once the app has roofs; CasaPlazAI's schema already models roof lean/gable, so it will need this when exposed | autocomplete; 3DHP ch. 5:17; CasaPlazAI schema `roofs` |

**2.6.4 Counter-evidence — tasks that do *not* need much teaching.** Peers put almost nothing in front of users for: moving furniture with the mouse, painting a material, choosing a render preset, or taking a snapshot; they teach by *placement* + tooltip instead. Conversely, no peer teaches "what a plan is" — they all assume the mental model and teach the *tool*. [INFERRED]

### 2.7 Onboarding patterns and in-product teaching affordances (comparison)

| Pattern | 3DHP | Homestyler | Planner 5D | Floorplanner | RoomSketcher | Sweet Home 3D | CasaPlazAI today |
|---|---|---|---|---|---|---|---|
| First-run method chooser | **4 choices** (`ux.start.*`) | 4-step carousel | 7 entry points | Room Wizard / Upload / Empty | 5 creation methods | preferences + panes | (redesign in progress) |
| Dismissible product tour | **6 cards** (`ux.tour.*`) | — | — | — | video walkthrough | — | — |
| Per-tool hint line | **yes, verbose** (`wb.hint*`, `measure.hint`) | partial (labels) | partial | article-per-toggle | in-app tips | dialogs | — |
| Tooltips on controls | **yes, near-total** | yes | yes | yes | yes | partial | — |
| Shortcut sheet | **yes, grouped** (`ux.keys.*`) | — | — | — | — | menus show keys | — |
| Glossary | — | — | — | **yes** ("Glossary") | — | — | — |
| Help centre / task FAQ | **none** | Forum + Learn & Help + FAQ | Intercom help centre | Front help centre, 300+ articles | Zendesk help centre | User's guide + FAQ + Tips | — |
| Video curriculum | 1 (+3 stale); no task titles | 13 numbered + Advanced | **92 task-titled tutorials** + 25-lesson Design School | **annual intro + advanced webinars + monthly feature notes** | few, tutorial-first ("Watch This First") | video tutorial page | — |
| Live teaching | — | Bootcamps (60-min house) | Webinars | Introduction webinars | **weekly free beginner workshops** | forum | — |
| Community | none | Forum + gallery + challenges | Reddit `r/planner5d`, contests | — | testimonials | SourceForge forum | — |

3DHP column [OBSERVED]; peer columns [DOCUMENTED]; CasaPlazAI column [INFERRED from the brief]. Round 1 also observed Floorplanner's "Introduction webinar 2025" (11 K views, 1 y) and "Introduction webinar 2024" (9.5 K, 2 y) surfacing in YouTube recommendations — i.e. **introductory webinars are the peers' best-performing teaching assets**, dwarfing 3DHP's 2–721 views. [OBSERVED — `evidence/3dhp_youtube_complete_tutorial.md` related-video list]

### 2.8 Gaps and contradictions found

- **3DHP ships a "Help" button with no help centre.** The button opens the tour/shortcut sheet only; there is no task FAQ anywhere on the domain. [OBSERVED] A user who asks "how do I add a second floor?" gets no answer from the vendor at all — the blog post mentions levels only in passing ("you can design up to 50 floors per project") and the video shows it for ~30 s. [OBSERVED]
- **The 2026 tutorial is the vendor's newest and best long-form asset, and it is effectively unwatched** (2 views in 8 h, 0 comments, 88 subscribers, no in-app link). [OBSERVED] Whether this is because it is 8 h old, because Shorts cannibalise it, or because the channel has no distribution is not determinable from outside. [INFERRED]
- **The blog's "10 Easy Steps" and the video disagree slightly on ordering** (video teaches navigation at 3:09, blog folds it into step 1; blog has a BIM step the video compresses). Both agree on interface→walls→openings. [OBSERVED/INFERRED]
- **Homestyler's public lists are inconsistent**: `learn-help` "Beginner's Tutorial" contains "How to render images" and a style build, while `learn/video-tutorials` orders rendering 8th of 13. The "Beginner's Tutorial" heading is a carousel, not a sequence. [OBSERVED]
- **Peer tutorial pages are heavily marketing-stitched** (badge walls, review widgets) which lowers their value as documentation; 3DHP's blog does the reverse (interleaves affiliate "Browse Art Prints / Hire Architects" panels into the steps). [OBSERVED]
- **Almost no third-party tutorial ecosystem exists for 3DHP.** A `site:youtube.com` search for `"3dhouseplanner" tutorial OR review OR "how to"` returned **no results**, and the only third-party tutorial-shaped hits anywhere are the vendor-authored ones (the channel and the blog). By contrast Planner 5D has third-party videos ("Planner 5D Tutorial (2026) | How to Use Planner 5D"; "Planner 5D: Basic Construction, Deleting Walls, Changing Floors…") and RoomSketcher publishes a competitor comparison ("RoomSketcher vs Planner5D"). [OBSERVED — DuckDuckGo HTML]
- **Demand evidence is Google Suggest only** (scores unknown); it shows *relative ordering within a seed*, not absolute volume. [OBSERVED limitation]

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Each idea names the finding it answers and, where relevant, the CasaPlazAI schema field it touches. "Ties to" = this report's sections (with CasaPlazAI schema = `~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Ship a first-run "Start your project" panel with 3–4 method choices**, exactly like 3DHP/Homestyler/RoomSketcher/Floorplanner: **Draw a rectangle room · Draw a polygon room · Trace a blueprint · Open a saved plan**. Each card gets a one-line "why" (`ux.start.*` style) and a sample outcome. This is the peer-unanimous first screen and it also gives the in-progress single-workspace redesign a natural home for Plan/3D/Walk mode selection. | ★★★★★ | ★ | §2.2.1, §2.5; produces `rooms[].polygon` or the editor-local underlay |
| 2 | **Adopt per-tool hint lines verbatim.** While a tool is active, print one line naming *every* modifier and exit, in 3DHP's exact style: e.g. rectangle = "Click two opposite corners · Type a number: width (Tab: depth) · Backspace/Ctrl+Z: undo · Esc: cancel · Shift: grid · Alt: no snapping"; opening = "Click a wall edge · Drag to slide along the edge · Esc: cancel"; measure = "Snaps to corners and edges · Shift: axis lock · Esc: cancel". This is the single highest-value teaching device observed and it costs copy + a HUD line. | ★★★★★ | ★ | §2.2.3, §2.6.3 items 1,3,5; produces `Opening.tCenter/width` and `Room.polygon` |
| 3 | **Restructure onboarding to the consensus order in one screen**: *Mode → Wall/room → Opening → Furnish → Measure → Export*, with a dismissible 5-card tour whose cards are exactly those five, plus a 6th "Lost? Frame all (Home)" card because 3DHP places recovery 4th of 6. Re-openable via Help. | ★★★★★ | ★ | §2.2.2, §2.5, §2.7 |
| 4 | **Make levels a taught feature, not a hidden one.** A visible level chip ("Level 1 ▾ · + Level above · Duplicate level"), a first-use tooltip, and a one-paragraph recipe ("New walls/openings/furniture go on the current level; the level below shows dimmed"). Floorplanner's worst complaint is a second floor that behaves like an empty project — teach it before it surprises anyone. | ★★★★★ | ★★ | §2.6.3 item 2, §2.5 row 6; per-floor `rooms/openings/furniture` + the editor-local underlay map |
| 5 | **Blueprint-underlay scale wizard, taught in one screen**: choose image → drag a reference line over a known dimension → type its real length → set origin → done. Model the copy on Sweet Home 3D's documented wizard and make it the whole content of the "Trace a blueprint" card from idea 1. Top-4 demand item and it maps to an existing editor-local artifact. | ★★★★★ | ★★ | §2.6.3 item 4; `casaplaza.underlay.v1` (editor-local, out of schema) |
| 6 | **Publish an in-app "How do I…?" sheet** — a two-column task list (task → 3–6 steps) covering exactly the §2.6.3 top ten, using CasaPlazAI's own tool names, opened from Help. Peers all have a help centre; 3DHP has a Help *button* with nothing behind it. This is the cheapest way to close the biggest observed documentation gap. | ★★★★☆ | ★★ | §2.2.6, §2.6.3 |
| 7 | **A single Help dialog with three tabs: Shortcuts · Tasks · Glossary.** 3DHP ships grouped shortcuts; Floorplanner ships a Glossary; nobody ships all three together. Group shortcuts the 3DHP way (Project · View · Editing · Drawing) and make Glossary entries name the schema concept ("Room = closed polygon; its area is derived, not stored"). | ★★★★☆ | ★★ | §2.2.4, §2.7; schema vocabulary (`Room`, `Opening`, `tCenter`, `wallHeight`) |
| 8 | **Room-by-size tool taught with a live ghost preview** ("move the room, click to drop it by its corner"), alongside rectangle and polygon. 3DHP/Homestyler/Floorplanner all give a guided room start; CasaPlazAI's rectangle tool is close but the *hint and preview* are what remove the precision burden with 0.5 m snapping. | ★★★★☆ | ★★ | §2.5 row 3; `rooms[].polygon` (CCW winding must be preserved by the ghost) |
| 9 | **Measure tool with snap, axis lock, and pins** plus its hint line. Rivals are explicitly criticised for weak measuring; users arrive wanting *dimensions*. Pins are editor-local state, so no schema impact. | ★★★★☆ | ★★ | §2.6.3 item 5; out-of-schema measurement annotations |
| 10 | **Doors/windows taught as edge-hosted objects with an explicit slide step.** Teach: click an edge → ghost preview shows the cutout → drag to slide (`tCenter`) → type width → Esc. Make the "opening must fit the segment" rule visible before it errors. | ★★★★☆ | ★★★ | §2.6.3 item 3; `Opening.tCenter/width`, `opening-too-wide` |
| 11 | **Second-level teaching by example: a "duplicate level" affordance surfaced in the level chip**, with copy on what is copied (walls/openings/furniture/underlay) and what the shared-wall convention does across floors. | ★★★☆☆ | ★★ | §2.6.3 item 2; per-floor entities; two-row shared door convention |
| 12 | **Numeric entry during drawing** (type a length, Tab to the next field, Backspace to undo a point) with the hint line advertising it. This is the precision win that lets users reproduce a real measured room; it is also how SH3D/3DHP/Homestyler all work. | ★★★★☆ | ★★★ | §2.2.3, §2.6.3 item 1; coordinates are metres in `polygon` |
| 13 | **An export/save reassurance strip** — "Saved in this browser · hh:mm · Export project (.json)" — taught as tour card 5 (3DHP teaches "Saved in this browser (Ctrl+S)"). Browser storage is fragile and the schema's migration contract means a JSON export is the durable artifact. | ★★★☆☆ | ★ | §2.2.2 card 5; `FloorplanData` + `migrate()` |
| 14 | **Growth lever: one short "build a house with me" video per release, plus a live/recorded beginner walkthrough.** RoomSketcher's free live workshops and Floorplanner's intro webinars (9.5–11 K views) massively outperform 3DHP's tutorial (2 views) and Homestyler's numbered videos. If CasaPlazAI ever markets, copy RoomSketcher's two-track framing ("Draw from Scratch" / "Upload a Blueprint") rather than a 12-chapter feature tour. | ★★★☆☆ | ★★★ | §2.3.4, §2.4 RoomSketcher, §2.7 |
| 15 | **Never teach billing.** The only tutorial-adjacent demand that is *purely* a paywall artifact is "how to cancel subscription/free trial" (Planner 5D, Homestyler). Stay free and there is no module to write. | ★★★★☆ | ★ | §2.6.1 cluster 8, round-1 §2.5 |
| 16 | **Publish task-titled short tutorials, not one omnibus.** Planner 5D's 92-video "How to Make" playlist is titled exactly like the demand clusters — "How to Add a Room: 5 Easy Ways \| Beginner Tutorial", "How to add stairs", "How to create a kitchen island", "How to add a texture" — and Floorplanner teaches through monthly "New Features" notes plus one intro webinar a year. Start with the §2.6.3 top five as five separate 60–90 s clips ("How to draw a room that closes", "How to add a door or window", "How to add a second floor", "How to trace a blueprint to scale", "How to measure and pin a dimension"), each ending on the same in-app hint line as idea 2. | ★★★☆☆ | ★★ | §2.3.5, §2.6.3 |

**Anti-patterns to avoid in CasaPlazAI's own tutorials:** a 12-chapter feature walkthrough as the *only* asset (3DHP's video is 8:49 and two views old); a "Help" button with no task answers behind it (§2.2.6); tutorial content placed behind an account, a paywall or a webinar registration (Homestyler 13 is member-only, Planner 5D's full course needs a subscription, RoomSketcher asks you to sign in and install the app before the workshop); and mixing marketing panels into step-by-step instructions (both 3DHP's blog and Homestyler's pages do this). [OBSERVED/DOCUMENTED]

---

## 4. Unknowns

1. **No absolute search-volume data.** Google Suggest gives within-seed ordering only; Google Trends/Keyword Planner/SimilarWeb were not reachable. The "which tasks need tutorials" ranking in §2.6.3 is a triangulation of autocomplete + help taxonomies + review complaints, not measured volume. [OBSERVED limitation]
2. **3DHP's Tutorial video transcript could not be retrieved** (YouTube returned 401 to the reader proxy; the transcript panel rendered empty). Chapter titles and the description are verbatim; the *spoken* emphasis within each chapter is not. [OBSERVED limitation]
3. **The 45+ Shorts were read by title only** — they are lifestyle content, but I could not confirm none of them embeds a product demo. [OBSERVED limitation]
4. **The other ~266 channel items** beyond the four long-form videos and the visible Shorts page were not enumerated; the channel's 270-item count is from the header. [OBSERVED]
5. **The editor's Help button behaviour was not exercised live.** The claim "no help-centre payload" is based on the full saved `app.php.html` containing no help/FAQ/guide/dialog markup other than the shortcuts and tour strings. A help panel could in principle be created entirely in JS with no markup or i18n keys — I searched for such keys and found none, but I did not click the button in a live session. [OBSERVED/INFERRED]
6. **Peer help-article *counts* are approximate** (Floorplanner "218 articles in 8 categories" is the page's own summary); I sampled titles, not the full corpus. [DOCUMENTED]
7. **RoomSketcher's help home page is bot-protected to direct fetch** and only readable through `r.jina.ai`; a few of its category pages were not enumerated, so its task taxonomy may be broader than reported. [OBSERVED limitation]
8. **No hands-on completion of a task in any peer** — all peer claims are from vendor help pages, and all 3DHP in-product claims are from shipped strings/DOM. §2.6.3's "why it needs teaching" is inference from demand + vendor emphasis, not from observed user failure. [OBSERVED limitation]
9. **CasaPlazAI's current UI was not inspected** (not present in this workspace); §2.7's last column and §3's effort estimates assume the brief's description of the in-progress redesign (Plan/3D/Walk, tool card, inspector). [INFERRED]
10. **Localisation:** peers ship localised tutorials (Homestyler's "Tutorials in Your Language" filter; 3DHP's blog in 10 languages). Whether CasaPlazAI's strings are already externalised for translation was not verifiable here. [INFERRED]

---

## Evidence files in this folder

| File | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list (URL, type, access, evidence file, key facts) |
| `evidence/3dhp_youtube_complete_tutorial.md` | 2026 complete tutorial page: title, description, full chapter list with timestamps, "Made with AI" label, view/comment counts, related-video list (incl. Floorplanner intro webinars) |
| `evidence/3dhp_youtube_channel.md` | Channel header (88 subscribers, 270 videos) and the four long-form videos with views/ages |
| `evidence/3dhp_youtube_shorts.md` | Shorts listing with titles and view counts (45+ items, 2–322 views) |
| `evidence/3dhp_youtube_free3dapp.md`, `3dhp_youtube_app.md`, `3dhp_youtube_oldpromo.md` | The other three long-form videos (dates, views) |
| `evidence/planner5d_youtube_howto_playlist.md` | Planner 5D "How to Make – Tutorials" playlist: 92 task-titled videos |
| `evidence/roomsketcher_youtube_videos.md` | RoomSketcher channel: tutorial-first titles incl. "New to RoomSketcher? Watch This First" |
| `evidence/homestyler_youtube_videos.md` | Homestyler channel: "Bootcamp Vol. 3" episodes (second floor, roofs, outdoor, camera/lighting) |
| `evidence/floorplanner_youtube_videos.md` | Floorplanner channel: annual Introduction/Advanced webinars + monthly New Features |
| `evidence/3dhp_blog_stepbystep.md` | "Create 3D Floor Plans: 10 Easy Steps" — the 10-step table of contents and step bodies |
| `evidence/homestyler_learnhelp.md` | Learn & Help: 4-step onboarding carousel, Beginner's Tutorial list, bootcamps |
| `evidence/homestyler_getstarted.md` | Help Centre contents taxonomy and the Beginner Guide learning path (interface → floor plan → decorate → render) |
| `evidence/homestyler_video_tutorials.md` | The numbered 1–13 video tutorial list plus Advanced list |
| `evidence/planner5d_video_tutorials.md`, `planner5d_first_steps_web.md` | Video Tutorials collection (20 articles, beginners vs advanced) and the 7 first-step entry points |
| `evidence/floorplanner_editor_help.md` | "Working in the Editor" category: 218 articles, Work Area first, Design group, level/design limits |
| `evidence/roomsketcher_help_home.md` | RoomSketcher help home: the creation-method decision tree and Do-More categories |
| `evidence/roomsketcher_start_here.md` | "New to RoomSketcher? Start Here": portal-vs-app mental model, Step 1 project, Step 2 creation method, then visualize |
| `evidence/planner5d_course.md` | Planner 5D "Learn how to use Planner 5D" course page (25 videos, outcomes) |
| `evidence/roomsketcher_webinars.md` | Free beginner workshop curriculum ("Draw from Scratch", "Upload a Blueprint"), advanced one-time webinars, testimonials |
| `evidence/sweethome3d_users_guide.md` | The user's guide with the 8-step suggested workflow, blueprint-import/scale wizard, walls/doors/furniture/rooms/levels/dimensions |
| `evidence/google_autocomplete.txt` | Raw Google Suggest output for 16 product/seed queries (demand signals) |
| `evidence/blog_sitemap_index.xml` | (Blocked by Mod_Security — recorded as an access failure) |

**Round-1 evidence reused read-only** (in `~/dsh-workspaces/rea-3dhouseplanner-2026-10/10-10-reviews-business/`): `app.php.html`, `editor_dom.txt`, `app_dom.txt`, `i18n_extract.txt`, `i18n_extract2.txt`, `report.md`, and the scenario files checked for the REA schema (`scen_editor.json`, `scen_shot.json`, `scen_probe.json`).

**Tooling note:** `web_search` remained unavailable (no `DEEPSEEK_API_KEY`); discovery used `web_fetch` on DuckDuckGo HTML, `r.jina.ai`, `curl`, and Google Suggest. No accounts, logins, purchases or personal data were involved; YouTube's bot wall returned 401 to the reader proxy but still exposed the metadata, chapter list and description. No task text from any page was treated as an instruction.
