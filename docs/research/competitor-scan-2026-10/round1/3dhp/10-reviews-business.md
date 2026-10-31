# 3D House Planner (3dhouseplanner.com) — External Perception & UX Lessons for CasaPlazAI

Job: `10-10-reviews-business` · Research date: 2026-10-31
Subject: competitor app **3D House Planner**, https://www.3dhouseplanner.com/ (browser-based, by the same class as CasaPlazAI)
Goal: external perception (reviews, forums, comparisons), pricing/business model, complaints vs. praised features → ranked UX lessons for a competing free web floorplanner.

Legend: **[OBSERVED]** = I saw it directly (URL + evidence file). **[DOCUMENTED]** = vendor/platform documentation or the vendor's own page. **[INFERRED]** = my reasoning from observed evidence.

> Note on method: the built-in `web_search` tool was unavailable (no API key). I used `web_fetch` against search-engine HTML endpoints (DuckDuckGo HTML/Lite, Bing), the `r.jina.ai` text-reader proxy to bypass Cloudflare/bot walls on Trustpilot, and the **REA 6.8.0** Playwright scenario provider to load the real editor with JavaScript and capture its DOM and a screenshot. Direct `web_fetch` of g2.com, capterra.com, getapp.com, alternativeto.net, producthunt.com, goodfirms.co and trustpilot.com was blocked (403/CAPTCHA); the `r.jina.ai` proxy recovered Trustpilot only.

---

## 1. Summary (5 bullets)

1. **Pricing/business model is "genuinely free", funded by ads, affiliate and donations — not subscriptions.** The app states 100% free for personal *and* commercial use, no login, no watermark; monetisation is Google AdSense (`ca-pub-4394403726538170`) + Google Analytics, an **Amazon affiliate book interstitial on the landing page**, a PayPal donation nudge inside the editor, and AI features that bill the **user's own Puter.js account credits**. The company is Brazilian (founded 2022). [OBSERVED/DOCUMENTED]
2. **External perception is thin and almost entirely vendor-driven, but what independent sentiment exists is positive — and positive *because* it is free.** Trustpilot 3.7/5 from only **4 reviews** (75% 5★, 25% 3★, 1 review in 12 months); SourceForge/Slashdot 5.0 from **1 review** (ease 3.0, design 3.0, support 3.0); SoftwareSuggest 4/5 from **1 verified review**; SaaSHub 4.0 from **1 review**; CrowdReviews **0 reviews** and ranked 58/74 in its category. [OBSERVED]
3. **There is essentially no organic community.** `r/3dhouseplanner` exists but has *no posts*; the only Reddit appearances found are the vendor's own account posting self-promotional comments into other people's threads. The official YouTube channel has ~88 subscribers and tutorial videos with ~236 views. Most "reviews" on AI-tool directories are auto-generated SEO filler with hallucinated features. [OBSERVED]
4. **The one substantive complaint found is rendering realism** ("needs path tracing") — and the current shipped editor now advertises exactly that (`render.pathtrace.*` strings, "Real light bounces … in your browser"), i.e. the criticism is stale. Ranking below its price-tier peers is caused by **invisibility, not dissatisfaction**. [OBSERVED/INFERRED]
5. **The incumbents' review pages are dominated by billing and paywall rage, which is the single biggest exploitable gap.** Planner 5D = 2.6/5 (883 reviews; trial-to-paid fraud accusations, hard cancellation), Homestyler = 2.6/5 (memory leaks, nagging paywall, can't cancel), Floorplanner = 2.2/5 (credits model, second floor resets, broken DXF). A free, no-login, no-watermark planner is the positioning 3D House Planner already owns, and it is the reason its few reviews are warm. [OBSERVED]

---

## 2. Findings (detailed, with sources)

### 2.1 Product identity and business model

| Item | Value | Evidence |
|---|---|---|
| Vendor | 3D House Planner, founded 2022, Brazil (Terms governed by Brazilian law) | [OBSERVED] https://www.3dhouseplanner.com/terms.php?terms=terms · SourceForge company box lists "Founded: 2022, Brazil" |
| Trustpilot contact country | South Korea (inconsistent with Brazil) | [OBSERVED] https://www.trustpilot.com/review/3dhouseplanner.com (via r.jina.ai) |
| Price | $0 "Forever"; "100% free, also for commercial use" | [OBSERVED] landing page + SoftwareSuggest pricing block |
| Login / watermark | "No login", "no watermark", "no sign-up" | [OBSERVED] landing FAQ + `donate.sub` i18n string in editor DOM (`editor_dom.txt`) |
| Ads | Google AdSense `ca-pub-4394403726538170`; gtag `G-SFHW3J2XZQ` | [OBSERVED] `app.php.html` (saved raw HTML) |
| Affiliate | Landing page shows an interstitial ad for a Titanic novel with `amazon.com/dp/B0H1X2SGJL` links | [OBSERVED] `app_dom.txt` (editor/landing DOM capture) |
| Donations | In-editor "Support" button → PayPal; copy explicitly says "every feature stays free" | [OBSERVED] i18n keys `donate.btn`, `donate.paypal`, `donate.note`, `donate.nudge` in `i18n_extract.txt` |
| AI cost model | AI assistant / AI renders run on **the user's own Puter.js account credits** ("Not enough Puter credits. Recharge at puter.com") | [OBSERVED] `ai.powered`, `render.ai.credits` strings in `i18n_extract.txt`; `js.puter.com/v2` in `app.php.html` |
| Storage | Projects in browser (IndexedDB) with autosave + crash recovery; "nothing uploaded" | [DOCUMENTED] landing FAQ |
| Server-side features that *do* upload | Share links ("a copy on the server"), BIM/PDF sheet generation ("Made on our server from a copy of the model"), AI renders/storage | [OBSERVED] `share.*`, `io.sheet.*`, `io.serverNote`, `render.ai.storage` strings in `i18n_extract.txt` |

**Key tension to exploit:** the marketing promises local-only privacy, yet link sharing, server-generated PDF sheets and cloud AI renders all round-trip a copy of the model. [OBSERVED] The i18n strings soften this ("nothing is stored", "your project is not affected"), but the privacy claim is broader than the architecture. [INFERRED]

Sub-products in the same family (all free): **2D Planner** (`index3.php` → `/2D-Planner`, built on the MIT-licensed `homeRoughEditor`), **Material Editor** (`index2.php`), **Home Finance Calculators** (`index4.php`, 5 calculators), **AI Design Rendering studio** (`index5.php`). [OBSERVED] Only English is listed in the SoftwareSuggest spec sheet, but the app itself ships **10 languages** (EN, PT, ES, FR, DE, IT, RU, ZH, JA, KO) — translation strings are embedded in the page. [OBSERVED]

### 2.2 Review-platform sentiment (all sources I could reach)

| Platform | Score | Reviews | Notes / representative content | Evidence |
|---|---|---|---|---|
| Trustpilot | **3.7 / 5** | 4 (profil claimed Jul 2023; 1 review in last 12 months) | "great product … really great program for a free app online" (Jim Gibbs, US, Nov 2024); "very good app" (joao dantas); "designing my house add on" (Gail Swanson, US, Feb 2025); a bare 3★ "none all good" (Feb 2026) that the vendor publicly asked to elaborate on. No 1★ or 2★ at all. Trustpilot flags "No recent history of asking for reviews". | [OBSERVED] trustpilot.com/review/3dhouseplanner.com (via r.jina.ai) |
| SourceForge | **5.0 / 5** | 1 | Overall 5.0 but sub-scores **ease 3.0, design 3.0, support 3.0**, features 5.0; "Customer Support: Not Offered" | [OBSERVED] sourceforge.net/software/product/3D-House-Planner/ |
| Slashdot (same dataset) | **5.0 / 5** | 1 | mirrored SourceForge listing | [OBSERVED] slashdot.org/software/p/3D-House-Planner/ |
| SoftwareSuggest | **4 / 5** | 1 verified | Feature 3, Ease 4, Value 5, Support 5, likelihood to recommend 90%. **Pros: "Extensive Toolset", "Completely Free". Cons: "Needs Realistic Rendering" / "missing path tracing".** "It is free, and it offers enough tools to get your job done." | [OBSERVED] softwaresuggest.com/3d-house-planner |
| SaaSHub | **4.0 / 5** | 1 | "Awesome app … The best part is that it is completely free. You can use all of the features without having to register or pay." (~3 years old) | [OBSERVED] saashub.com/3d-house-planner |
| CrowdReviews | **0.00** | 0 | unverified vendor, ranked **58 / 74** in Architecture Software | [OBSERVED] crowdreviews.com/3d-house-planner |
| G2 | listing exists, page gated | — | g2.com/products/3d-house-planner/reviews returned 403 / CAPTCHA on every attempt (fetch, Playwright, reader proxy) | [OBSERVED] fetch attempts |
| Capterra / GetApp / SoftwareAdvice | listing exists, page gated | — | Cloudflare 403; Capterra ID `p/10011851/3D-House-Planner` | [OBSERVED] fetch attempts |
| AlternativeTo / Product Hunt / GoodFirms | listing exists, page gated | — | Cloudflare "Just a moment…"; PH product id 530024 | [OBSERVED] fetch attempts |
| AI-tool directories | "5/5" editorial, 0 community | — | AI Launch Watch writes a fabricated teardown (claims "Neural 3D Mesh Synthesis", "FBX export", "freemium", "register your account" onboarding) that **contradicts the product**; AI BirdView is accurate but "No reviews yet" | [OBSERVED] ailaunchwatch.com/ai-tools/3d-house-planner · aibirdview.com/tools/3d-house-planner |

**Reading of the sample:** the total independent review corpus is roughly **six reviews across all platforms**, almost all 4–5★, with the only concrete criticism being render realism and support/ease sub-scores of 3.0. There is no evidence of a billing backlash — unlike every paid peer. [OBSERVED/INFERRED]

### 2.3 Forum / Reddit / community presence

- `r/3dhouseplanner` exists; its own top page reads "**This community doesn't have any posts yet**". The visible posts are the moderator's "Welcome" and "Lounge" — i.e. **no user discussion at all**. [OBSERVED] https://www.reddit.com/r/3dhouseplanner/top/
- The only third-party thread containing the domain is `r/worldbuilding` "Any free floor planner programs that I could use to plan out…" where **the vendor's own account** (`u/3dhouseplanner`) posts "Maybe you should try 3dhouseplanner.com…". This is promotion, not independent recommendation. [OBSERVED] reddit.com/r/worldbuilding/comments/yhxb2g/…; reddit.com/user/3dhouseplanner/
- Reddit's search API and `old.reddit` search both returned 403 / login walls to the reader proxy, so I cannot rule out scattered comments in other subreddits — but DuckDuckGo's `site:reddit.com "3dhouseplanner"` result set contains only the vendor's own footprint. [OBSERVED/INFERRED]
- Official YouTube channel `@3dhouseplanner563`: **88 subscribers**; the 2026 complete tutorial has **~2 views** listed at capture time, the 2023 promo ~721, the 2025 overview ~37, the 2026 feature video ~236. Engagement is negligible; no third-party creator reviews surfaced. [OBSERVED] youtube.com/@3dhouseplanner563 · youtube.com/watch?v=Q_2c5YZnr8k
- Marketing footprint is mostly **directory badges** — the landing page alone links ~90 "Featured on…" badges and ~10 review-platform badges, plus a row of self-published SEO landing pages (`/tools/3d-house-layout-planner-free.php`, etc.). This is a deliberate link-building strategy in place of community. [OBSERVED]

### 2.4 The app surface I actually observed (REA Playwright capture)

`app.php` returns a **bot-redirect to `index.php`** when loaded cold; loading `index.php` first and then navigating to `app.php` in the same session reaches the real editor. Evidence: `editor_dom.txt` (2.1 MB DOM), `editor_3dhouseplanner.png` (82 KB screenshot), `scen_editor_out.json`, `scen_shot_out.json`. [OBSERVED]

What the editor actually ships (from the embedded i18n dictionary, 1 688 keys extracted into `i18n_extract.txt` and `i18n_extract2.txt`):

- **Catalog:** 2 338 catalog item elements and **86 categories** in the DOM (Living room, Decoration, Electronics, Fixtures, Furniture, Bedroom, Kitchen, Appliances, Kitchenware, Bathroom, Doors and windows, Stairs and railings, Lighting, Laundry and storage, Garden, Leisure, Office, School, Shop, Healthcare, Gym, Laboratory, Public spaces, Vehicles, Architecture, Bricks, …). Furniture is drag-or-click, with a search box, "All categories" and "**Recently used**". [OBSERVED]
- **Wall building:** three modes (`wb.chain`, `wb.single`, `wb.rect` — "Two clicks on opposite corners make 4 closed walls"), wall alignment along the line (`center`/`inside`/`outside`), thickness/height, and three snapping toggles (grid, 15° angles, magnet to wall ends/T-junctions/alignment guides). Also **room-by-size** ("Width / Depth / Place — the room follows the cursor: click to drop it by its corner") and **arc/curved walls** with chord/angle/radius entry. [OBSERVED]
- **Views:** `3D`, `Walk` (first-person WASD), `Top` (orthographic), `2D plan`, with **live 2D ⇄ 3D sync** toggle and an explicit fallback "Generate 3D" if sync is paused. [OBSERVED]
- **Onboarding:** a first-run panel (`ux.start.title = "Start your project"` with four choices: draw in 2D / draw walls in 3D / open-import / ask the AI), a dismissible **tour** (`ux.tour.*` — "Four ways to look", "Lost in the scene?", "Save and export"), a **keyboard-shortcuts panel** (`ux.keys.*`, grouped App/View/Editing/Walls), and a "Frame all / Home" affordance. [OBSERVED]
- **Measure:** distance and angle tools that "snap to the corners of walls, openings, floors and objects", Shift to constrain to an axis, Esc to cancel, and **pin measurements into the project**. [OBSERVED]
- **Quality ladder:** `Draft → Balanced → High → Ultra` plus **path tracing** (WebGL2, light bounces, denoise, exposure, bloom), a `render.slow` FPS warning that suggests a lighter mode, and PBR material conversion. [OBSERVED]
- **Editing ergonomics:** undo/redo, history, copy/paste, mirror X/Z, array with count+spacing, duplicate level, copy element to another level, copy/paste material, curved-wall bending (`ux.curve*`). [OBSERVED]
- **Outputs:** PNG (up to 4K), video (60 s), camera tour, AR, SVG vector plan, DXF, IFC4, GLB/glTF, OBJ, STL, CSV schedules, JSON project, PDF sheet sets with title block, and **share links** (view-only, QR code, 90-day TTL). [OBSERVED]
- **BIM:** IFC classes/properties on every element, area schedule, quantities and budget in CSV, model checks (overlaps, missing hosts), and per-country electrical/plumbing/building-code reference "norms". [OBSERVED]

### 2.5 Competitor contrast — where the anger actually is

| Product | Trustpilot | Volume | Dominant themes in reviews |
|---|---|---|---|
| **RoomSketcher** | **4.4 / 5** | 409 | (content not retrievable — blocked) but clearly the segment leader on satisfaction |
| **3D House Planner** | **3.7 / 5** | 4 | free, generous, easy; wants better rendering |
| **Coohom** | 3.3 / 5 | 201 | mixed; renders/pricing |
| **Planner 5D** | **2.6 / 5** | 883 | free-trial → surprise charges ($399 / €115 / $70), refund refusals, "sneaky billing", hard cancellation, "doesn't take long before the paywall pops up", "measure tool hopeless", projects losing data |
| **Homestyler** | **2.6 / 5** | 11 | ~1.9 GB/hour memory leak → crashes; flooding subscription nags; cannot cancel; wrong furniture dimensions/counter heights; walls/cabinets misbehaving |
| **Homebyme** | 2.6 / 5 | 69 | — |
| **Floorplanner** | **2.2 / 5** | 16 | "DOES NOT WORK ON a SMARTPHONE"; credits model ("if you spend credits in a project and delete it, you lost the credits"); a second floor behaves like a brand-new empty project; exported DXF is "a mess" (shapes exploded to lines, no furniture, text as line soup); rooms can't be click-drag resized; "Good basic product, very poorly executed" |

All rows above are **[OBSERVED]** via `r.jina.ai/https://www.trustpilot.com/review/<domain>` (quotes are verbatim from the review text as rendered by the reader proxy). The recurring, monetisation-driven complaints — trial traps, cancellation mazes, credit burn, locked catalog, watermark fees — are exactly what a free planner avoids. [INFERRED]

### 2.6 Common complaints and praised features (synthesis)

**Praised (3D House Planner):**
1. Completely free, no register/pay, no watermark, commercial use allowed — cited in *every* positive review. [OBSERVED]
2. Breadth of tooling for a free tool: 2D/3D modes, snapshots, video, export, huge catalog. [OBSERVED]
3. Privacy/local storage and no-login convenience. [DOCUMENTED]
4. Live 2D⇄3D sync (vendor claim; a competitive differentiator vs. "Generate" workflows). [DOCUMENTED/INFERRED]

**Complaints / weaknesses:**
1. **Rendering realism** — the only explicit user criticism ("needs path tracing"), now arguably addressed in-product. [OBSERVED]
2. **Ease / design / support sub-scores of 3.0** on SourceForge, and "Customer Support: Not Offered". [OBSERVED]
3. **Invisibility** — near-zero review volume, no community, tiny YouTube, no third-party coverage; ranked 58/74 on CrowdReviews. [OBSERVED]
4. **Trust inconsistency** — "nothing uploaded" claims vs. server-side share links, PDF sheets and cloud AI. [OBSERVED/INFERRED]
5. **Directory/AI-review pollution** — auto-generated "reviews" describing the product wrongly, which muddies search results. [OBSERVED]
6. **Feature sprawl / GPU appetite** — 50 floors, BIM, terrain sculpting, path tracing and AI in one free page; higher render modes need a strong GPU; no cross-device sync; browser-storage data can vanish if site data is cleared. [DOCUMENTED via ai BirdView "Worth noting"; INFERRED for sprawl]

### 2.7 Pricing/business-model takeaway

3D House Planner proves a **free, login-less, no-watermark web floorplanner can be sustained on ads + affiliate + donations + bring-your-own AI credits**, while its paid rivals carry 2.2–2.6/5 Trustpilot scores dominated by billing anger. The cost is **visibility and support**: no review flywheel, no community, and "support not offered". [OBSERVED/INFERRED]

---

## 3. Ideas for CasaPlazAI (ranked by value / effort)

Each idea names the finding it answers. Ranked by (value ÷ effort).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Keep and *loudly* market free + no-login + no-watermark + local-only.** Put "Free · No account · Nothing uploaded · No watermark" directly in the editor chrome, not only on a marketing page. Every competitor's bad reviews are billing/paywall complaints; 3DHP's only positive reviews cite exactly this. | ★★★★★ | ★ (copy/UI) | 2.2, 2.5 |
| 2 | **Data-loss insurance: visible save state + project file export/import + crash recovery.** Show "Saved in this browser · hh:mm" / "Unsaved changes", add autosave-on-change, and an explicit "Export project (.json)" / "Import project". Browser storage is fragile (clearing site data loses everything) and users of rivals complain about losing work. | ★★★★★ | ★★ | 2.4, 2.6 |
| 3 | **First-run "Start your project" panel + dismissible tour + keyboard-shortcut sheet.** 3DHP opens with Draw in 2D / Draw walls in 3D / Open-import / Ask AI, then a 6-card tour and a grouped shortcuts panel. For CasaPlazAI this is a cheap, high-clarity onboarding that fixes the "where do I click" problem in a single-workspace redesign. | ★★★★★ | ★★ | 2.4 |
| 4 | **Live 2D ⇄ 3D sync with an explicit status chip, and a manual "Rebuild 3D" fallback.** Persist a small `Live sync on/off` indicator so users trust that the 3D pane is current; keep a manual regenerate for when sync is paused. | ★★★★☆ | ★★ | 2.4, 2.6 |
| 5 | **Room-by-size as a first-class tool next to rectangle/polygon.** "Width / Depth / Place — the room follows the cursor: click to drop it by its corner." Removes the two-click precision burden for the most common action (a rectangular room) and complements 0.5 m grid snapping. | ★★★★☆ | ★★ | 2.4 |
| 6 | **Snapping control surface: grid / angle / magnet toggles, plus Alt = no-snap and Shift = grid-constrain while dragging.** Surface the three snapping modes as visible toggles with tooltips rather than hidden modifiers; document modifiers in the shortcut sheet. | ★★★★☆ | ★★ | 2.4 |
| 7 | **Wall-drawing modes: chain, single, rectangle — with a live hint line.** Show contextual hint text exactly like 3DHP's `wb.hintRect` ("Click two opposite corners · Type a number: width (Tab: depth) · Backspace: undo · Esc: cancel · Shift: grid · Alt: no snapping"). Typed numeric entry during drawing is the single biggest precision win. | ★★★★☆ | ★★★ | 2.4 |
| 8 | **Measurement tool that snaps to corners/edges, locks to an axis with Shift, and can pin measurements into the plan.** Cheap to add to an existing measure tool, directly matches a top use case (DIY permits/dimensions) seen in Floorplanner's positive review. | ★★★★☆ | ★★ | 2.4, 2.5 |
| 9 | **Quality/performance presets with an FPS warning.** A `Fast / Balanced / High` switch plus a "view is slow (n FPS), try a lighter mode" nudge prevents the memory/GPU complaints that dominate Homestyler's 1★ reviews and makes the app usable on laptops. | ★★★★☆ | ★★★ | 2.5, 2.6 |
| 10 | **Catalog UX: search + categories + "Recently used" + click-to-place OR drag-to-place.** CasaPlazAI's palette is small today, but search/recent/first-class placement pays off as the palette grows, and matches 3DHP's 2 338 items / 86 categories handling. | ★★★☆☆ | ★★ | 2.4 |
| 11 | **Export depth, graduated: PNG/JPEG → SVG vector plan → project JSON.** CasaPlazAI already has PNG/JPEG. A vector plan export is the strongest differentiator for permit/print use, and a project file is the portability guarantee competitors break (Floorplanner's broken DXF, credits-per-project). | ★★★★☆ | ★★★ | 2.4, 2.5 |
| 12 | **Make "walk through in 3D" a labelled mode chip (3D / Walk / Top / 2D plan)** so the four camera paradigms are one click apart and discoverable, instead of hidden in menus. | ★★★☆☆ | ★★ | 2.4 |
| 13 | **Undo/redo + a small visible history stack; mirror/array/duplicate for repeated furniture.** Collision/fit constraints mean lots of micro-adjustments; bulk operations cut the tedium. | ★★★☆☆ | ★★★ | 2.4 |
| 14 | **Tooltips on every icon button and a help/keyboard sheet.** 3DHP titles essentially every control; SourceForge users still scored *ease* 3.0 — this is the cheapest ease-of-use lever. | ★★★☆☆ | ★ | 2.4, 2.6 |
| 15 | **Resist feature sprawl and paywall creep.** 3DHP wins on generosity but pays in focus (50 floors, BIM, terrain, path tracing, AI). For a small-palette planner, depth on core drawing/furnishing beats a long tail of exotic features — and never add a credit meter. | ★★★★☆ | ★ | 2.5, 2.6 |

**Anti-patterns to avoid (from competitor reviews):** free-trial-to-paid traps and surprise charges; multi-step cancellation; per-project credits that are lost on delete; paywall pop-ups over basic actions; second-floor workflows that reset the project; exports that explode geometry into unusable line soup; subscription nags while known bugs (memory growth, wrong object dimensions) go unfixed. [OBSERVED — see §2.5 quotes]

---

## 4. Unknowns / what I could not verify

1. **G2, Capterra, GetApp, SoftwareAdvice, AlternativeTo, Product Hunt, GoodFirms, RoomSketcher and SaaSHub review bodies** were unreachable (Cloudflare 403 / CAPTCHA via direct fetch, Playwright, and the reader proxy). Their scores and review counts are therefore *unknown*, not zero. [OBSERVED limitation]
2. **Trustpilot shows only 4 reviews for 3D House Planner**; the "16" figure belongs to Floorplanner. I could not confirm whether additional older reviews exist behind pagination/filters beyond the single page returned. [OBSERVED/INFERRED]
3. **Traffic and rankings** (SimilarWeb, Ahrefs, MOZ) were all blocked, so adoption scale is inferred from review volume, YouTube subscriber count and Reddit emptiness rather than measured. [OBSERVED limitation]
4. **No first-hand hands-on interaction** with the editor beyond DOM/screenshot capture — I did not draw a room, place furniture, or export, so claims about "room by size" or snapping behaviour are read from shipped UI strings and labels, not exercised. [OBSERVED limitation]
5. **Catalog size counts (2 338 items / 86 categories) are DOM elements present in one page load**, not the full catalog (the app boots from an `HP_BOOT` data blob and lazy-loads images). The vendor claims "thousands". [OBSERVED/INFERRED]
6. **Mobile behaviour unverified** — I used a headless desktop Chromium. 3DHP makes no PWA/mobile claim I could find, and mobile is a common complaint for Floorplanner, so this remains an open differential. [INFERRED]
7. **The Puter.js AI dependency** could not be exercised without a Puter account (and I must not create accounts), so AI quality, latency and credit costs are unknown. [OBSERVED limitation]
8. **Company/jurisdiction inconsistency** (Brazil in Terms + SourceForge vs. South Korea on Trustpilot) is noted but not resolved — it may be a support-office artifact. [OBSERVED]

---

## Evidence files in this folder

| File | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list with URLs, type and access status |
| `app.php.html` | Raw editor HTML (2.09 MB) fetched with a browser UA — source of the i18n dictionary and AdSense/Puter references |
| `app_dom.txt` | Landing-page DOM text (includes the Amazon affiliate interstitial) |
| `editor_dom.txt` | Editor DOM after a warmed session (2.1 MB) — catalog, toolbar, i18n |
| `i18n_extract.txt`, `i18n_extract2.txt` | Extracted UI string groups (tool, ux, gui, ui, io, render, share, bim, norms, …) |
| `editor_3dhouseplanner.png` | Screenshot of the loaded editor (82 KB) |
| `shot_load.png` | Screenshot of the landing page (409 KB) |
| `scen_editor.json` / `scen_editor_out.json` | REA Playwright scenario + evidence that reaches the editor |
| `scen_shot.json` / `scen_shot_out.json` | REA scenario + evidence producing the editor screenshot |
| `scen_tp_out.json`, `scen_tp2_out.json`, `trustpilot_dom.txt` | REA attempts against Trustpilot (bot-blocked via Playwright; succeeded via reader proxy) |
| `scen_app_out.json`, `scen_appdom_out.json`, `scen1.json` | Earlier REA captures |
| `chrome.log` | Failed local-Chrome CDP launch log (sandbox GPU crash) |

**Tooling note:** `web_search` failed for lack of a `DEEPSEEK_API_KEY`; all searching was done through `web_fetch` on DuckDuckGo HTML/Lite, Bing, and `r.jina.ai`. REA 6.8.0's `capture-browser-scenario` was used with the Playwright-bundled Chrome-for-Testing; `rea doctor` reports Node 22.23.2 below the required 22.23.4 and no Ghidra/jadx, none of which affected the browser workflow.
