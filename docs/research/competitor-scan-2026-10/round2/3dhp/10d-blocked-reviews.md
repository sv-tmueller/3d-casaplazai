# Round 2 — 3D House Planner: recovering the review data that was blocked in round 1

Job: `10-10d-reviews-business-blocked-rev` · Research date: 2026-10-31 · Round 2 of the 3dhouseplanner thread.
Subject: **3D House Planner**, https://www.3dhouseplanner.com/ (browser editor, Babylon.js; 2D planner iframe at `/2D-Planner/index.php`).

**Question.** Round 1 could not reach G2, Capterra, Trustpilot (beyond 4 reviews), Reddit search and several
directory listings (Cloudflare / CAPTCHA / 403). This round retries those sources through **alternative
legitimate routes** — Wayback Machine CDX + snapshots, `r.jina.ai` reader, search-engine HTML endpoints,
the public PullPush Reddit archive API — and summarises the themes for **free web floor planners**.

Round-1 baseline (read-only, not modified): `~/dsh-workspaces/rea-3dhouseplanner-2026-10/10-10-reviews-business/report.md`.
No round-1 finding is repeated here unless this round changed it.

Legend: **[OBSERVED]** = saw it directly (URL + evidence file in this folder). **[DOCUMENTED]** = vendor/platform documentation. **[INFERRED]** = my reasoning from observed evidence.

---

## 1. Summary (5 bullets)

1. **G2's question is answered: the listing has no reviews at all.** The archived G2 page (Wayback 2023‑06‑14) literally renders *"There are not enough reviews of 3D House Planner for G2 to provide buying insight"*, with only a fake "Write a Review" prompt and a list of *alternative* products. Round 1 could only say "gated, unknown" — the truth is **zero**, not hidden. [OBSERVED — `g2_wayback_2023.html`, `g2_wayback_2023.txt`]
2. **Two more review-platform numbers were recovered but were wrong in round 1's picture, and one new one appeared.** SoftwareAdvice (Gartner Digital Markets, the same company as Capterra/GetApp) shows **4.5/5 from 4 verified reviews**, not "blocked". AlternativeTo shows **4/5 from 3 user ratings**, Product Hunt **4.0 from 1 review**, GoodFirms **"No reviews submitted yet"**; the newly surfaced **Tekpon** shows **3.5/5** "based on User Sentiment from reviews and public chatter". Trustpilot is confirmed complete at **3.5/5 from exactly 4 reviews** (75% 5★, 25% 3★) — round 1 read 3.7/5. [OBSERVED — `swadvice_2026.txt`, `altto_2025.txt`, `ph_wb_reviews.txt`, `goodfirms_jina.txt`, `tekpon.txt`, `tp_round2.txt`]
3. **The four SoftwareAdvice reviews are the richest independent testimony that exists about this product** — and they say something different from "it's free so it's fine": real users praise the *drafting* tools and the *free, no-registration* access, and criticise **catalog depth/realism, missing path tracing, missing a lasso tool, weak multilingual support, and no manual**. [OBSERVED — `swadvice_2026.txt` §4]
4. **Reddit, unblocked via the PullPush archive API, confirms the community is 100% vendor-made.** 77 comments and 7 submissions mention the brand; **73 of 77 comments and 4 of 7 submissions are the vendor's own `u/3dhouseplanner`**, copy-pasting the same "free web apps" list into ~40 unrelated subreddits and posting **PromeAI links carrying an affiliate parameter** (`?vsource=i_83area6a67`). The handful of non-vendor hits never recommend it — one is a joke, the others recommend Sweet Home 3D instead. [OBSERVED — `pp_c_3dhp.json`, `pp_s_3dhp.json`]
5. **For free web floor planners the recurring Reddit themes (834 comments mined) are: brand-name recommendation (63%), ease/learning-curve (21%), measurement precision (21%), whether the free tier is enough (18%), browser-vs-install (17%), crashes/data loss (15%), paywall/credit locks (11%), export/print limits (11%).** The pattern that wins praise is *"free version does enough, and I can export without paying"*; the pattern that draws anger is *"locked behind a paywall / credits burned / HQ export gated"* — exactly the axis 3D House Planner competes on, and the axis on which it has **no organic advocates at all**. [OBSERVED — theme count over `pp_*.json`; INFERRED]

---

## 2. Findings (detailed, with sources)

### 2.1 Route map — what actually worked

Search was done with `web_fetch`/`curl` because the built-in `web_search` tool is still dead ("no API key for `DEEPSEEK_API_KEY`"). Which endpoints answered:

| Source | Round-1 status | Route tried this round | Result |
|---|---|---|---|
| **G2** | 403 / CAPTCHA everywhere | Wayback **CDX** found 2 snapshots (2023‑06‑14); fetched snapshot | ✅ **0 reviews**; page text recovered [OBSERVED] |
| **SoftwareAdvice** | 403 | Wayback CDX + snapshots (2024‑11‑12, 2026‑02‑15) **and** `r.jina.ai` live fetch | ✅ **4.5/5, 4 reviews**, all 4 review bodies |
| **AlternativeTo** | "Just a moment…" | Wayback snapshots 2025‑10‑14 and 2025‑05‑13 | ✅ **4/5 from 3 ratings**, likes/comments/alternatives counts |
| **Product Hunt** | Cloudflare | Wayback CDX + 3 snapshots incl. `?review=98503` | ✅ **4.0 from 1 review**; review body not in archived HTML |
| **GoodFirms** | Cloudflare | Wayback 2025‑08‑05 + `r.jina.ai` live | ✅ **"No reviews submitted yet"**, claimed profile |
| **Trustpilot** | 4 reviews via reader | `r.jina.ai` again, plus `?page=2` | ✅ **complete** — 4 reviews, one page, all bodies |
| **Reddit search / subreddit** | 403 / login wall | **`api.pullpush.io`** public archive (comments + submissions) | ✅ 77 comments, 7 submissions, comment bodies |
| **Capterra** | 403 | CDX (0 captures), direct, `r.jina.ai`, `archive.today`, `archive.ph`, REA Playwright | ❌ still Cloudflare; only *existence* of a `.de` mirror is known from a Brave snippet |
| **GetApp** | 403 | CDX (0), `r.jina.ai` | ❌ still Cloudflare |
| **Tekpon / SideProjectors** | not tried in round 1 | Brave Search HTML → `r.jina.ai` | ✅ new listing found (Tekpon 3.5/5, HQ Brazil) |
| **DuckDuckGo HTML/Lite, Mojeek, Startpage, Marginalia** | DDG worked | retried | ❌ DDG now returns the JS-anubis interstitial (14288 bytes, no results); Mojeek 403; Startpage anubis; Marginalia 302. **Bing returned a German generic page** with no result text. **Brave Search HTML worked** (200, full result list) |
| **archive.today / archive.ph / archive.is / .li / .md / .vn** | not tried | all tried on Capterra | ❌ 404 / connection refused (keys don't exist) |

**[INFERRED] Method lesson:** for this job the reliable "legitimate secondary" routes are (a) **Wayback CDX
enumeration then snapshot fetch, retried through the recurring "Temporarily Offline" page**, (b) the
**`r.jina.ai` reader** on Gartner Digital Markets properties (SoftwareAdvice passed; Capterra/GetApp/AlternativeTo
did not), and (c) the **PullPush Reddit archive** for anything Reddit. Brave Search HTML is the only general
engine still returning result text to an unauthenticated fetcher. Playwright is *worse* than all of these for
Cloudflare-protected pages — REA's Chromium hit the same "Attention Required!" page (see §2.6).

### 2.2 G2 — the listing has zero reviews

The archived page (`https://web.archive.org/web/20230614164559/https://www.g2.com/products/3d-house-planner/reviews`)
states, verbatim in the rendered text:

> "There are not enough reviews of 3D House Planner for G2 to provide buying insight. Below are some alternatives with more reviews: CertifID 4.8 (102) … **Planner 5D 4.6 (30)** …"

Other facts recovered: the profile is **"Claimed"** (but "limited features"); the **Seller is "Matheus de Assis
Rabelo"**; the category breadcrumb is *Real Estate Software → Other Real Estate Software*; the vendor's own
product description claims a texture library with albedo/normal/AO/metalness/roughness maps and model
import/export. G2 also shows the neighbour **Planner 5D at 4.6/5 from 30 reviews** — i.e. G2's *user base*
rates the paywalled competitor highly even though Trustpilot rates it 2.6/5. [OBSERVED — `g2_wayback_2023.html`, `g2_wayback_2023.txt`; INFERRED for the cross-platform sentiment split]

### 2.3 Gartner Digital Markets: SoftwareAdvice recovered, Capterra/GetApp still walled

**SoftwareAdvice** (the Gartner property that *did* open) is the single most useful recovery of this round:

- Overall **4.5/5 from 4 reviews**; breakdown **5★ 50%, 4★ 50%, 3/2/1★ 0%**.
- Secondary scores: **Ease of use 4.5 · Value for money 4.8 · Customer support 4.5 · Functionality 4.0.**
- All four are **"Verified reviewer"**, dated Aug 2023 – Dec 2023, every one "**Used weekly/monthly for less than 6 months**" — i.e. this is early-adopter experience, not long-term.
- Review bodies (summarised): a self-employed mining/metals user wants **better, more realistic templates/library and more languages**; an arts-and-crafts user calls the **3D render "the best feature … real house feeling"** and asks for a **lasso tool**; a designer praises "**completely free … without having to register or pay**" and lists 2D/3D switch, snapshots, video, model export, wide catalog — but says the app needs **path tracing for realistic visualisation**; a corporate user notes it is **"easy and fast… does not need much training"** and asks for **manuals**.
- Listing metadata: pricing "available upon request", **Free Trial + Free Version** flags, features tagged 2D/3D Designing, Component Library, Rendering, Room Visualization. [OBSERVED — `swadvice_2026.txt`, `swadvice_2024.html`]

The **2024 snapshot also showed "( 4 )" reviews**, so the count has been stable at 4 for ~2 years. [OBSERVED — `swadvice_2024.txt`]

**Capterra / GetApp remain unrecoverable.** CDX has **no captures at all** for `capterra.com/p/10011851*` or
`getapp.com/all-software/a/3d-house-planner*`; direct fetch, `r.jina.ai`, `archive.today`/`archive.ph` (no key),
and a REA Playwright run all returned Cloudflare. A Brave Search result did surface a **German mirror**
(`capterra.com.de › startseite › grundrissplaner › 3d house planner`), proving the listing family exists, but that
mirror is equally walled. [OBSERVED — `scen_capterra_out.json`, `capterra_jina.txt`, CDX output]

### 2.4 Other directories: two new numbers and one new site

| Site | Score | Volume | Notes | Evidence |
|---|---|---|---|---|
| **AlternativeTo** | **4 / 5** | **3 ratings** | 4 likes, 3 comments, 67 alternatives; **Licence "Free • Proprietary"**; "No registration required" listed as a property; AlternativeTo's own copy infers the CDN-hosted app is **"not Customizable"**; links 3DHP to 2D Planners and 3D modellers. | `altto_2025.txt`, `altto_about_2025.txt` |
| **Product Hunt** | **4.0** | **1 review** | "The community submitted **1 review**"; **Founder Reviews: "No reviews yet"**; launch **2023**, **3 followers**, "Upvote • 3 points", product tagline "Home sketch web application". The archived `?review=98503` page carries a review id and a display name in its embedded JSON, but the **review body itself is not present in any snapshot** (it is rendered client-side). | `ph_wb_reviews.txt`, `ph_wb_prod.txt` |
| **GoodFirms** | — | **0** | "**No reviews submitted yet.** Be the first one to review"; **claimed profile**; address "304 S. Jones Blvd #520" (a known US virtual/registered-agent address). | `goodfirms_jina.txt`, `goodfirms_2025.html` |
| **Tekpon** (new) | **3.5 / 5** | 0 user reviews | Score described as "**based on User Sentiment from reviews and public chatter**… we weight volume, recency, and consistency"; **HQ Brazil**; "free web-based… users can support through donations"; "**Account creation required to leave a review**". Featured comparisons list Revit 4.4, RoomSketcher 4.5, SketchUp 4.6, AutoCAD 4.6. | `tekpon.txt` |

### 2.5 Trustpilot — the sample is complete, and the score moved

The live reader fetch this round returned **TrustScore 3.5 / 5 from 4 reviews**, with distribution **5★ 75%,
4★ 0%, 3★ 25%, 2★ 0%, 1★ 0%** and "**1 review in the last 12 months**". The four reviews, in full, are:

1. **Phil (FR, 2 reviews) — 3★, 5 Feb 2026, "none all good"**; vendor reply 6 Feb 2026: *"Could you share a bit more detail about what you didn't like in the app?"* (The review body is literally empty — Trustpilot's "Unprompted review".)
2. **joao dantas (SA, 1 review) — 5★, 8 May 2025, "very good app"** (no body).
3. **Gail Swanson (US, 1 review) — 5★, 11 Feb 2025, "designing my house add on"** (no body); vendor reply: a heart emoji.
4. **Jim Gibbs (US, 2 reviews) — 5★, 19 Nov 2024, "great product"**: *"This is a really great program for a free app online."*; vendor reply: *"Thank you for the review. We are committed to improve the app even more"*.

There is **no page 2** (`?page=2` returns Trustpilot's 404) — so round 1's #2 unknown ("could not confirm whether
older reviews exist behind pagination") is now **closed: there are none**. Round 1 reported 3.7; the page today
renders 3.5 — Trustpilot recomputes a 4-review score on a Bayesian/smoothed basis, so treat 3.5–3.7 as the
same tiny sample, not a decline. [OBSERVED — `tp_round2.txt`, `tp_round2_p2.txt`]

### 2.6 REA Playwright vs. Cloudflare — a negative result worth recording

Following the round-1 lessons, I ran a REA 6.8.0 `capture-browser-scenario` against
`https://www.capterra.com/p/10011851/3D-House-Planner/` with the Playwright Chrome-for-Testing binary, headless,
a 25 s wait, and full DOM capture. Out of curiosity I first tried to pass software-GL args in `browser.args`;
the scenario schema's `launch` variant accepts only `mode`, `executable_path`, `headless` (`unknown_argument`
error) — **so there is no supported way to inject `--use-angle=swiftshader` etc. through this provider**, which
explains round 1's headless-WebGL problem and means 3D-heavy scenarios need `mode: "connect"` to a CDP browser
launched separately. The run itself succeeded (`exit 0`, 26.7 s, Chromium 153.0.8010.12) but the captured DOM was
Cloudflare's **"Attention Required!"** interstitial — 5 581 bytes, no review content. [OBSERVED — `scen_capterra.json`, `scen_capterra_out.json`; INFERRED for the schema limit]

### 2.7 Reddit, unblocked: the community is entirely vendor-made

`https://www.reddit.com/search.json` still returns a 403 HTML wall and `old.reddit.com/*.json` 302-redirects, so I
used the **public PullPush archive API** (`api.pullpush.io/reddit/search/{comment,submission}`). Queries run:
`3dhouseplanner`, `"3d house planner"`, `3dhouseplanner.com`, `"free floor planner"`. Author counts:

- **77 comments** matching `"3d house planner"` → **73 by `u/3dhouseplanner`**, 1 each by `PopularDemand213`, `fakepla5tictrees`, `breid7718`, `wicked_one_at`.
- **7 submissions** → **4 by `u/3dhouseplanner`**, 2 by `Chance-Assignment208`, 1 by `Interesting_Bit5995`.
- 17 further comments contain the literal domain — **all 17 are the vendor**.

**What the vendor account does** (all [OBSERVED] in `pp_c_3dhp.json` / `pp_sub_3dhp.json`): it pastes a numbered
list — "1. Sweet Home 3D … 2. 3D House Planner …" — into roughly **forty unrelated subreddits**
(r/blender, r/Architects, r/floorplan, r/software, r/gamedev, r/Sketchup, r/Homebuilding, r/AusPropertyChat, …),
repeatedly in the same hour (e.g. 6 posts on 2024‑06‑13, 8 on 2024‑06‑25), nearly word-for-word identical; and it
promotes **PromeAI** in r/ArtificialInteligence, r/aiArt, r/AItoolsCatalog and r/interiordecorating with a link
containing `?vsource=i_83area6a67` — an **affiliate/referral parameter** — while also linking its own blog post.
This is undisclosed promotion and undisclosed affiliate linking, and it is the *entire* Reddit footprint.

**The non-vendor mentions** are all neutral-to-negative for the brand:

- r/McMansionHell, Dec 2025: *"Can someone please build this in one of those 3D House Planner apps?"* — a joke about bad layouts, i.e. the brand name is being used generically/mockingly.
- r/ifyoulikeblank, Jul 2023 (1 upvote-class thread): the answer recommends **Sweet Home 3D**, not 3DHP.
- r/HomeImprovement, Mar 2022: generic "3d house planner software used to also allow landscaping".
- r/thesims, Jul 2020: *"the game should be renamed to 3D House Planner"* — a coincidence of wording, not the product.
- **Two fresh accounts**, `Chance-Assignment208` (posting since 11 Jul 2023) submitted the identical title *"3D House Planner - Free 3D floor planner on the web"* to r/HomeDecorating and r/Home **one minute apart** (05:01 and 05:00 UTC), each scoring 1 with **0 comments**. That pattern is consistent with sockpuppet/astroturf seeding rather than a community. [OBSERVED; INFERRED for the sockpuppet reading]
- r/AskReddit, Jun 2023: *"Do you know a 3D House planner + realistic rendering app?"* by `Interesting_Bit5995` → **removed by AutoModerator** (Rule 3), the only comment is the removal notice. Round 1 cited this thread; the archive shows it produced **no answer**. [OBSERVED — `pp_c_askreddit.json`]

### 2.8 Themes across free-web-floor-planner discussion (834 Reddit comments mined)

I mined every planner-brand and "free floor planner" query above (RoomSketcher 100, Homestyler 100, Planner 5D 100,
Sweet Home 3D 100, Coohom, plus `paywall`, `lost my floor plan`, `floor planner browser` sets) and counted regex
buckets over 834 comment bodies:

| Theme | Share of comments |
|---|---|
| Names a specific brand (RoomSketcher / Homestyler / Planner 5D / Sweet Home 3D / Floorplanner / Coohom) | **63%** |
| Ease of use / learning curve / "clunky" | 21% |
| Measurement, to-scale, dimensions, snapping | 21% |
| Free tier is adequate ("free version does enough") | 18% |
| Browser vs. install | 17% |
| Crash / performance / **lost work** | 15% |
| Paywall, credits, locked catalogue, gated export | 11% |
| Export / print / HQ download | 11% |
| Login / registration | 4% |

**[OBSERVED counts; INFERRED reading]** Representative verbatim fragments (short excerpts, attributed to their Reddit threads):

- **Homestyler** — *"some of the models are locked unless you pay but the free account does enough for you to get a feel"*; *"Very easy to use, lots of free assets and features. Best one i've tried so far"*; *"You can use everything free basically."* → the "**free enough to be useful, paid for the extras**" line is what earns warmth. [r/bathrooms 2026‑09‑30; r/InteriorDesign 2026‑08‑16]
- **Floorplanner** — *"free to design in but HQ exporting is behind a paywall. Which you can circumvent by taking screenshots of your work"* (r/HomeImprovement, 2018). The export gate is the remembered friction point even years later.
- **RoomSketcher** — regularly recommended, sometimes **by its own employees who say so** (*"I work there, and we launched…"*, r/floorplan 2026‑10‑02; r/DIYweddings 2026‑08‑31). *"It's a free download and you can make up to 5 plans. There are some things you have to pay to upgrade."* Free tier + disclosed affiliation.
- **Planner 5D** — *"they have a free version and a paid one"*; *"it's meh. Not as easy as I'd like to move walls and such."*
- **Sweet Home 3D** — the default open-source answer: *"free and open source and shows the 2D plan and the 3D view side by side, which is about as beginner-friendly as…"*; but *"the models themselves are quite old now"*, and one user *"started in Sweet Home 3D but found it was too limited so I exported that to Blender"*. [r/CanadianTeachers 2026‑10‑07; r/IndianHomeDecor 2026‑10‑04; r/homeassistant 2026‑10‑07]
- **Data loss is a live fear, not a hypothetical** — an r/floorplan user in 2023: *"I had completely drawn out your floorplan accurately and then accidentally closed the tab."* (r/floorplan, 2023‑11‑19). This is the *same* failure mode as the browser-storage risk round 1 flagged for 3D House Planner.
- **A new free entrant is being recommended in 2026**: *"I am using Gridsnap. It's free to draw and export plans, have a 3D view and can even add roofs"* (r/floorplan, 2026‑08‑28). The free-with-export niche is being actively contested. [OBSERVED]

**Brand-level synthesis.** On Reddit the free web planners that get named without prompting are
RoomSketcher, Homestyler, Floorplanner, Planner 5D and Sweet Home 3D — **3D House Planner is never named by a
non-vendor account.** Its own reviews (SoftwareAdvice, Trustpilot, Product Hunt) are thin but *positive*, and the
positive reason is uniformly "free, no registration, generous toolset". The negative reason is uniformly
"rendering realism / catalog depth / polish". [OBSERVED + INFERRED]

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Ranked by value ÷ effort; each ties to a finding above and, where relevant, to the CasaPlazAI schema
(`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Make "free, and the export is free" the literal on-screen promise.** SoftwareAdvice's only 5★-with-text review and the SaaSHub/round-1 quotes all praise *"completely free … without having to register or pay"*; Reddit's bitterest memory is Floorplanner's *"HQ exporting is behind a paywall"*. Put a one-line chip in the toolbar: **"No account · No watermark · PNG/JPEG export unlimited"**, and never gate a resolution tier. | ★★★★★ | ★ | §2.3, §2.8 |
| 2 | **Ship project file export/import and a visible save-state chip** ("Saved in this browser · hh:mm"). The Reddit data-loss anecdote and round 1's browser-storage risk show this is the #1 silent trust-killer; CasaPlazAI already autosaves to localStorage, so a `SaveState` field + `Export .json`/`Import .json` on the plan schema is cheap. | ★★★★★ | ★★ | §2.8 (data loss), round-1 §2.4 |
| 3 | **Invest in catalog depth and realism — that is the one substantive criticism of 3D House Planner from *verified* reviewers.** SoftwareAdvice users ask for "more realistic templates/library" and explicitly "path tracing". CasaPlazAI's palette is small; prioritise *fewer, better* items with correct real-world dimensions (also a Homestyler complaint) over raw count. | ★★★★★ | ★★★ | §2.3, §2.8 (measurement/dimensions) |
| 4 | **First-class measurement/annotation** (snap to corners/edges, Shift to lock an axis, pin measurements into the plan). Measurement precision is the joint most-mentioned practical need in the Reddit sample (21%), and round 1's Floorplanner positives cite it. | ★★★★☆ | ★★ | §2.8, round-1 §2.5 |
| 5 | **Ease-of-use surface: tooltips on every control, a keyboard-shortcut sheet, a short in-app manual/help panel.** SoftwareAdvice's corporate reviewer's only ask was *"If manuals can be provided. Then more better"*, and "ease" scored lowest (with functionality) in the verified set. | ★★★★☆ | ★ | §2.3 |
| 6 | **Onboarding that teaches the 0.5 m grid + shared-wall model in 30 seconds.** "Ease / learning curve" is 21% of the discussion and every reviewer of 3DHP was <6-months in. A 4-card first-run panel (draw rectangle / draw polygon / place a door / export) matches the single-workspace redesign. | ★★★★☆ | ★★ | §2.3, §2.8 |
| 7 | **Localisation is an unmet request, and it is cheap.** A verified reviewer asked for "other languages" and the vendor reply in 2026 shows the app shipping 10. CasaPlazAI's own UI strings are few; extract them into a `strings` map now so a second language is a data change, not a refactor. | ★★★☆☆ | ★★ | §2.3 |
| 8 | **Lasso/marquee multi-select** was an explicit feature request ("Some new tool can be added like lasso tool"). For CasaPlazAI it also solves the furniture micro-adjust pain (fit/collision constraints) by letting users move/copy groups. | ★★★☆☆ | ★★ | §2.3 |
| 9 | **Undo/redo + a small history stack + duplicate/mirror.** With collision/fit constraints users make many micro-adjustments; this is the cheapest antidote and no recovered review complains that 3DHP lacks it (round 1 observed it ships one). | ★★★☆☆ | ★★ | round-1 §2.4 |
| 10 | **Earn visibility legitimately, because the competitor's is fabricated.** The only Reddit footprint is a vendor account spamming ~40 subreddits and two 2023 sockpuppet posts; its directories are half-empty. CasaPlazAI should publish honest thought-comparison content, answer genuine "free floor planner" threads **with disclosure**, and target the *review flywheel* (invite reviewers, keep the profile fresh) that Trustpilot notes 3DHP has abandoned ("No recent history of asking for reviews"). | ★★★★☆ | ★★★ | §2.4, §2.7 |
| 11 | **Avoid the 3DHP trap of unverifiable claims.** Round 1 found "nothing uploaded" claims contradicted by share links/PDF/AI. CasaPlazAI is genuinely local-only; say exactly that, and say what *is* local (`localStorage`), rather than a broad privacy claim. | ★★★☆☆ | ★ | round-1 §2.1, §2.7 |
| 12 | **Watch the emerging free-with-export competitors** (Gridsnap, OpenPlan3D, Coohom free tier). The niche 3DHP occupies with no advocates is being actively claimed. | ★★★☆☆ | ★ | §2.8 |

**Anti-patterns confirmed by the new data:** credits that are lost on delete; model libraries that are locked
"unless you pay"; HQ export behind a paywall; forced account creation to review *or* to export; and
browser-only storage with no export path. [OBSERVED — §2.4, §2.8]

---

## 4. Unknowns

1. **Capterra and GetApp review bodies remain unverified.** No Wayback capture exists and every live route is Cloudflare. Their *existence* is known (Capterra ID `10011851`, plus a `capterra.com.de` mirror surfaced via Brave), and the sister site SoftwareAdvice shows 4 reviews — Capterra/GetApp commonly syndicate the **same** reviewer pool, so the number is probably also 4, but that is an **[INFERRED]** guess, not observed.
2. **The Product Hunt review text is not in the archive.** The archived page proves 4.0/1 review and a review id/display name, but the body was rendered client-side and is absent from all three snapshots. Would require an authenticated Product Hunt session.
3. **No traffic/ranking numbers.** SimilarWeb/Ahrefs remain blocked; brand visibility is inferred from review volume, followers (PH 3 followers; YouTube ~88 from round 1) and Reddit emptiness.
4. **Discussion forums outside Reddit are unmined.** PullPush covers Reddit only; hobbyist forums, YouTube comments, Discord/Slack communities and non-English boards (the vendor is Brazilian, so Portuguese-language sites are likely) were not covered. This is the largest remaining gap.
5. **The two 2023 ascend accounts could be genuine new users**, not sockpuppets — the evidence is timing and identical titles only. [INFERRED]
6. **Reddit's own search API is still unusable** (403 / redirect); PullPush is a third-party mirror with imperfect coverage (one query returned HTTP 429 and was never retried successfully). Comment counts should be read as a floor, not a census.
7. **The Trustpilot score displays as either 3.5 or 3.7** depending on the fetch (round 1 vs round 2) for the same 4 reviews; Trustpilot's exact rounding/smoothing for very low counts is not documented on the page.
8. **I did not exercise the 3DHP editor this round** (no drawing/exporting), so all behavioural claims about it remain round 1's DOM-derived observations.

---

## Evidence files in this folder

| File | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list with URL, type, access status, evidence file |
| `g2_wayback_2023.html` / `.txt` | Archived G2 reviews page (2023‑06‑14) — **"not enough reviews… to provide buying insight"** |
| `g2_wayback_2023b.html` | Second G2 snapshot (same day), confirming the empty state |
| `swadvice_2026.html` / `.txt` | Archived SoftwareAdvice page (2026‑02‑15) — 4.5/5, 4 reviews + bodies |
| `swadvice_2024.html` / `.txt` | Archived SoftwareAdvice page (2024‑11‑12) — still "( 4 )" reviews |
| `swadvice_alt_2024.html` | Archived SoftwareAdvice "alternatives" page |
| `altto_2025.html` / `.txt` | Archived AlternativeTo listing (2025‑10‑14) — 4/5 from 3 ratings, 67 alternatives |
| `altto_about_2025.html` / `.txt` | Archived AlternativeTo "about" page (2025‑05‑13) — licence, properties |
| `goodfirms_2025.html` / `.txt`, `goodfirms_jina.txt` | GoodFirms (Wayback 2025‑08‑05 + live reader) — **no reviews** |
| `ph_wb_reviews.html` / `.txt`, `ph_wb_rev98503.*`, `ph_wb_prod.*` | Archived Product Hunt product + reviews pages (2026‑04‑23, 2024‑05‑08) — 4.0, 1 review |
| `tp_round2.txt`, `tp_round2_p2.txt` | Trustpilot full page (3.5/5, 4 reviews, all bodies) + 404 on page 2 |
| `tekpon.txt` | Tekpon listing — score 3.5/5 "user sentiment", HQ Brazil, donations |
| `pp_c_3dhp.json`, `pp_s_3dhp.json` | PullPush Reddit: 77 comments / 7 submissions mentioning the brand |
| `pp_c_dom.json` | 17 comments carrying the literal domain (all vendor) |
| `pp_roomsketcher.json`, `pp_homestyler.json`, `pp_planner5d.json`, `pp_sh3d.json`, `pp_coohom.json`, `pp_paywall.json`, `pp_lost.json`, `pp_browser.json`, `pp_c_freefloor.json`, `pp_s_floorplanner.json` | PullPush theme corpora (834 comment bodies counted) |
| `pp_c_askreddit.json` | The r/AskReddit thread's only comment: AutoModerator removal |
| `br_review.html` / `.txt`, `br_complaints.*`, `br_freefloor.*`, `br_reddit.*` | Brave Search HTML result pages (the only engine that still returned text) |
| `scen_capterra.json`, `scen_capterra_out.json`, `scen_capterra_err.txt` | REA Playwright attempt on Capterra → Cloudflare interstitial; documents the `browser.args` schema limit |
| `g2_wayback_2023.txt`, `extract.py` | Local HTML→text extractor used for all archived pages |

**Method note.** `web_search` is still unavailable (missing `DEEPSEEK_API_KEY`). All fetching was `curl`/`web_fetch` against Wayback CDX + snapshots, `r.jina.ai`, Brave Search HTML, `api.pullpush.io`, and REA 6.8.0 `capture-browser-scenario`. No accounts, logins, payments or share-link creation. No source code was copied: product behaviour is described in my own words; review text is quoted only as short attributed excerpts.
