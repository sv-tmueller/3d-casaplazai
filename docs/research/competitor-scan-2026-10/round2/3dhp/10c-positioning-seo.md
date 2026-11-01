# 3D House Planner — Marketing, Positioning, Claimed-vs-Shipped Features, Keywords & SEO

Job: `09-10c-reviews-business-positioning` · Round 2 · Research date: 2026-10-31
Subject: **3D House Planner**, https://www.3dhouseplanner.com/ (browser editor, Babylon.js; 2D planner at `/2D-Planner/index.php`)
Question: landing copy and positioning; claimed features vs. what the app actually ships (cross-checked against round-1 evidence); keywords and SEO structure.
Round-1 report read first and reused: `~/dsh-workspaces/rea-3dhouseplanner-2026-10/10-10-reviews-business/report.md` (read-only). This report does **not** redo pricing/business model, review sentiment, Reddit/YouTube footprint or competitor Trustpilot analysis except where needed as cross-check.

Legend: **[OBSERVED]** = I saw it directly (URL + evidence file in this folder). **[DOCUMENTED]** = vendor docs/page states it. **[INFERRED]** = my reasoning.
Discipline: no competitor code is copied; behaviour, data model and UX are described in my own words.

---

## 1. Summary (5 bullets)

1. **The landing page sells one product ("Free 3D Home Design Software on the Web") with a three-chip trust strip — `No login / Nothing to install / Projects stay in your browser` — and a four-number stat strip `100% free (also commercial) · 50 floors per project · 10+ import/export formats · 5 visualization modes`.** Every number is a claim to check, and the strongest ones are the vague ones. [OBSERVED `home_raw.html`, `home_text.txt`]
2. **Most claims survive the cross-check, but three do not.** Free/no-login/no-watermark, 11 real export+import formats, live 2D⇄3D, BIM/IFC, Draft→Ultra render modes and browser storage are all backed by shipped code. Broken or unverifiable: **"5 visualization modes"** (4 camera modes + 1 AI render), **"50 floors"** (no cap literal anywhere in shipped JS), and **"thousands of ready-to-use furniture templates"** (1,882 objects + 456 textures total, across 86 categories). [OBSERVED `app.php.html`, `editor_js/hp-editor.js`]
3. **The two biggest claim-vs-reality gaps are both about where your data goes.** The home FAQ promises "Nothing is uploaded to our servers", yet AR uploads the model (48 h TTL), share links POST the project to the vendor server (`share.uploading`, `X-HP-Share-Key`), and AI rendering spends **the user's own Puter account credits** — a fact disclosed on `index5.php`/`app2.php` but **never on the landing page** (0 hits for "Puter"/"credits-account"). The privacy policy never mentions IndexedDB, localStorage, Puter, cloud or uploads. [OBSERVED `home_raw.html`, `privacy.html`, `editor_js/hp-share.js`, `editor_js/hp-ar.js`]
4. **SEO is a large, well-executed, templated long-tail machine with real compliance strengths (self-referencing canonicals, 11-link hreflang incl. `x-default`, FAQPage JSON-LD that exactly mirrors visible FAQ, unique titles/descriptions) and real weaknesses (near-duplicate tools pages at 0.921 median body similarity, `?lang=` variants inflating the sitemap to 314 URLs, `/tools/` cluster barely linked from the home page, no `aggregateRating` despite 12 review-platform badges, and `app.php` in the sitemap with no canonical or social tags).** [OBSERVED `sitemap.xml`, `tools_html/*`, `home_raw.html`]
5. **Positioning is deliberately competitor-free and funnel-shaped: 25 `/tools/` pages act as five product "fronts", each with a hero CTA straight into the matching app, while the blog carries the affiliate monetisation.** For CasaPlazAI the exploitable wedge is not a feature race — it is **verifiable honesty**: publish the real caps, disclose exactly where each byte goes, and ship plans as a schema-validated open JSON payload, which is something 3D House Planner cannot currently match. [OBSERVED, INFERRED §3]

---

## 2. Findings

### 2.1 Landing-page messaging architecture

**Above the fold** [OBSERVED `home_raw.html`, `home_text.txt`]

| Element | Exact copy |
| --- | --- |
| H1 | "Free 3D Home Design Software on the Web" |
| Eyebrow | "New: AI assistant, live 2D ⇄ 3D sync and BIM" |
| Sub-headline | "Draw the plan, describe it to the AI or import a file, then walk through it in realistic 3D." |
| Primary CTA | "Start designing — free" |
| Secondary CTA | "Open the 2D planner" |
| Nav CTA (×2) | "Sketch now" |
| Trust chips | "No login · Nothing to install · Projects stay in your browser" |
| Stat strip | "100% free, also for commercial use · 50 floors per project · 10+ import / export formats · 5 visualization modes" |
| Mode chips | "3D · Walk · Top · 2D plan · ✦ AI" |
| Tech chips | "IFC4 · DXF · GLB · BIM export · 2D ⇄ 3D Always in sync" |

**Full heading outline** [OBSERVED]

- H2s: *From idea to BIM model · Turn your idea into a 3D model · Powerful Features · More free tools · Help 3D House Planner Grow · Questions? Answers. · Made with the help of great creators · Ready to design your home? · Select the platform of your preference to leave a review.*
- Supporting H3s: *AI design assistant AI · Live 2D ⇄ 3D · From draft to photo-real · BIM in the browser · Saved in your browser · Import and export anything · Draw, describe or import · Furnish and finish · Visualize and share · About this App · Free to Use · More Than a Home Sketcher · Simple and Fast Sketch · Freedom in Customization · Save Your Work · Privacy Matters.*

**Narrative structure.** The page runs a strict **capability → proof → objection** loop:
1. *Positioning claim* ("Free 3D Home Design Software").
2. *Four-step story* "Draw, describe or import → Furnish and finish → Visualize and share" — note that the first step embeds the AI assistant as the headline act, not as a power feature.
3. *Three technical pillars* presented as differentiators: AI assistant, live 2D⇄3D, BIM/IFC.
4. *Privacy block* ("Privacy Matters", "No cloud storage - your designs remain private", "Your work remains completely private").
5. *Objection-handling FAQ* of exactly 5 `<details>` items: free? where saved? other BIM/CAD? how does the AI work? powerful computer? [OBSERVED]
6. *Social-proof strip*: 12 external review-platform badges.
7. *Footer CTA* "Ready to design your home?" plus a second review solicitation.

**Notable and unusual:** the very first text node in the document body — before the nav — is a **paid interstitial**: "The Unsinkable: A Historical Mystery Thriller Set Aboard the Titanic" with a "📖 View on Amazon" link (`amzn.to`/`amazon.com/dp/B0H1X2SGJL`). This is an Amazon affiliate ad placed above the product's own hero. [OBSERVED `home_raw.html`]

### 2.2 Claimed features vs. shipped features (claim-by-claim cross-check)

Method: every landing/tools claim was matched against round-1 shipped evidence (`app.php.html` i18n + editor DOM, `editor_js/*`, `planner_js/*`) already captured read-only. Claims with no code trace are flagged, not presumed false.

| # | Claim (source) | Verdict | Shipped evidence |
| --- | --- | --- | --- |
| 1 | Free, also for commercial use, no login, no watermark (home hero/FAQ; tools pages) | **TRUE** | 0 watermark strings in all 29 editor + 11 planner modules; no auth flow; [OBSERVED] |
| 2 | "No login", no install | **TRUE** | Editor is an anonymous page; no sign-in form in `app.php.html` [OBSERVED] |
| 3 | "10+ import / export formats" | **TRUE (exactly 11)** | Editor i18n `io.desc.*` = `csv, dxf, glb, gltf, ifc, obj, pdf, png, project, stl, svg`; `io.fmt.*` = `dxf, ifc, image, model, project` [OBSERVED] |
| 4 | Import IFC, DXF, GLB, OBJ, STL + plan images (home FAQ) | **TRUE** | Literal accept list `'.glb .gltf .obj .stl .babylon'` + `.ifc`, `.dxf`, `image/*` in `editor_js/hp-bim.js` (`.babylon` is an **undocumented extra**) [OBSERVED] |
| 5 | IFC4 BIM export, DXF, GLB; PDF sheet with title block | **TRUE** | `io.sheet.*` = author, auto, client, contents, cover, drawing, elevations, license, notes, objects, paper, plans, preparing, scale, sections [OBSERVED] |
| 6 | Live 2D ⇄ 3D, "always in sync" | **TRUE** | `HPSync` bridge: the editor hosts the 2D planner in an `<iframe>` and bridges via `window.parent.HPSync` / `HPAI`; `planner_js/bridge3d.js` reads `window.parent` [OBSERVED] |
| 7 | "5 visualization modes" (stat strip) | **MISLEADING** | Topbar `hpViewSeg` exposes exactly 4 camera modes: `data-view` = `3d, walk, top, 2d`. The 5th chip in the hero graphic is the **AI photo render**, a different kind of thing [OBSERVED] |
| 8 | "50 floors per project" (home stat; also verbatim in a tools-page FAQ: "you can design up to 50 floors") | **UNVERIFIED** | No numeric floor cap literal found in any shipped module; only `gui.visibleFloors` = "Visible floors: up to {n}". Not exercisable via the capture tool (no `evaluate`) [OBSERVED claim / INFERRED unverified] |
| 9 | "Thousands of objects and textures" (home); "thousands of ready-to-use furniture templates" (tools page) | **OVERSTATED** | Catalog `tab1` (objects) = **1,882** unique `hp-item` anchors; `tab2` (textures) = **456** unique anchors; total **2,338** items across **86** `hp-cat-name` categories; 2,592 `data-src` images (objects+textures). "Low thousands" is fair for objects **and** textures combined; "thousands of furniture templates" is not [OBSERVED] |
| 10 | Realistic render modes: "Draft … up to Ultra" (home FAQ) | **TRUE** | `render.draft` / `render.balanced` / `render.high` / `render.ultra`, plus `render.pt.quality` and ray-traced path tracing (`render.pathtrace.*`) [OBSERVED] |
| 11 | "Projects are saved in your own browser (**IndexedDB**) with automatic recovery" (home FAQ) | **PARTLY TRUE / INCONSISTENT** | Only **one** `indexedDB` reference in the 29 editor modules (`hp-bim.js`); the 2D planner has **zero** — it writes plans to plain **localStorage** under `extension-floorplanner-floorplans` / `extension-floorplanner-settings`. Two different storage stories presented as one [OBSERVED] |
| 12 | "Nothing is uploaded to our servers" (home FAQ); "No cloud storage - your designs remain private" | **FALSE for 3 named features** | (a) **AR**: the model is uploaded to the vendor server, share/QR TTL 48 h (`share.point.ttl`, `hp-ar.js`). (b) **Share links**: `fetch()` POST to vendor endpoint with `X-HP-Share-Key`, state strings `share.uploading`, `share.tooLarge`, `share.tooMany`. (c) **AI render**: image sent to Puter (`render.ai.credits` = "Not enough Puter credits. Recharge at puter.com"). [OBSERVED] |
| 13 | "How does the AI assistant work?" — framed as a built-in free assistant | **INCOMPLETE DISCLOSURE** | AI runs on **Puter.js and the user's own Puter account/credits**: `ai.powered` = "AI by Puter.js · your account"; `ux.tour.aiText` = "…It uses your free Puter account." The word "Puter" appears **0 times** on the landing page (`index5.php`/`app2.php` do disclose it). This is the single largest claim-vs-marketing gap [OBSERVED] |
| 14 | "Runs directly in your browser on desktop **or mobile devices**" (tools pages) | **WEAKLY SUPPORTED** | No PWA manifest, no `apple-touch-icon`, no `theme-color` on the editor; only 2 touch-event references across all editor modules. [OBSERVED/INFERRED — mobile layout not verified] |
| 15 | "No powerful computer needed" | **TRUE** | Draft mode lowers resolution and disables shadows (`render.draft.d`) [OBSERVED] |
| 16 | Watermark-free exports | **TRUE** | 0 watermark code paths across all fetched modules [OBSERVED] |
| 17 | "Contour lines" / terrain | **TRUE** | `contour` ×5, `terrain` ×7 on the home page; terrain + contour modules shipped [OBSERVED] |
| 18 | Camera tour, snapshots, video | **TRUE but UNDER-SOLD** | Shipped: `tour.title`, `.webm` recording with 60 s cap, snapshots. Landing says only "take snapshots and videos" in one prose line; "tour" = 0 hits [OBSERVED] |
| 19 | AR ("augmented reality"), QR sharing | **SHIPPED BUT NOT MARKETED** | `ar.title` shipped; "AR" = 0 hits and "QR" = 0 hits on the landing page [OBSERVED] |
| 20 | Measurement tools, stairs, skirting/crown | **SHIPPED BUT NOT MARKETED** | `measure`/`measurement` = **0** hits on landing; editor ships 8 measure strings, 4 stair strings, `skirt.title`; separate modules `hp-measure.js`, `hp-stairs.js`, `hp-dims.js`, `hp-linear.js`, `hp-panels.js` [OBSERVED] |
| 21 | CSV / PDF / PNG exports | **TRUE** | `io.desc.csv`, `io.desc.pdf`, `io.desc.png`; 2D planner also has `print_floorplan()` and an SVG download path (`extension-floorplanner-svg-download-button`) [OBSERVED] |
| 22 | JPEG export | **NOT OFFERED** | No `jpg`/`jpeg` string anywhere in the editor i18n; PNG only. (Relevant to CasaPlazAI, which does export JPEG) [OBSERVED] |
| 23 | "Commercial Export Rights" for AI renders (tools page) | **DOCUMENTED only** | Vendor copy, no code proof; Puter ToS may govern generated image rights [DOCUMENTED / INFERRED] |

**Score:** of 23 distinct claims, 12 verified exactly, 2 overstated, 2 incomplete/misleading, 1 outright false as written (data uploads), 6 shipped-but-unmarketed in the other direction. The pattern is **not** broad deception — it is *selective vagueness*: precise where the code is rigorous (formats, IFC4, render modes), vague exactly where the code is weak (floor cap, object count, where data goes, AI cost).

### 2.3 Product family positioning: how the sub-apps are framed

Five public "fronts", all under one brand: [OBSERVED `sitemap.xml`, `home_raw.html`, `blog_home.html`]

| Path | Framed as | Role |
| --- | --- | --- |
| `/index.php` | **3D House Planner** — "Free 3D Home Design Software" | Flagship; the landing page itself |
| `/index2.php` | **3D Material Editor** | "View any 3D model online and edit its materials and textures" |
| `/index3.php` | **2D Planner** | "Draw floor plans with rooms, doors, windows and dimensions" |
| `/index4.php` | **Home Finance Tools** | Mortgage/renovation/energy calculators |
| `/index5.php` | **AI Design Rendering** | "Turn sketches and photos into interior and exterior renders" |
| `/app.php`, `/app2.php` | unnamed editor URLs | The real working editors, both in the sitemap at priority 0.80 |

**Funnel asymmetry (a real defect):** the home page's "More free tools" block links 4 of the 5 fronts and **never links `index4.php`** (0 occurrences of `index4` in `home_raw.html`), while the tools hub links it and the blog nav links all 5. Internal app links from home: `app.php` ×5, `index2.php` ×2, `index3.php` ×3, `index5.php` ×1, `index4.php` ×0. Home also links only **5 of its own 25** `/tools/` pages. [OBSERVED]

**The `/tools/` cluster is the real marketing surface.** All 25 pages are pure landing pages with **0 `<form>`, 0 `<input>`, 0 `<canvas>`** — they contain no tool at all, only copy, FAQ, JSON-LD and a CTA into the matching app. Each page repeats one of five "Why Choose Our …?" identities, five pages per front: [OBSERVED]

- *3D House Planner* ×5 · *2D Planner* ×5 · *AI Design Rendering* ×5 · *3D Material Editor* ×5 · *Home Finance Tools* ×5.

Each page's hero CTA deep-links to the matching app: `3D House Planner → ../index.php`, `2D Planner → ../index3.php`, `AI Design Rendering → ../index5.php`, `Material Editor → ../index2.php`, `Home Finance Tools → ../index4.php`. This is the clearest statement of the intended product taxonomy. [OBSERVED]

**Blog as the top-of-funnel:** `blog.3dhouseplanner.com` is a WordPress site (`generator: auto-sizes 1.8.0`, `dominant-color-images`) with 36 paginated pages, 10-language hreflang and a repeated app nav linking all five fronts. Its own article bodies do **not** link back into the app — the only 10 return links are the duplicated nav. Monetisation there is a 10-item Amazon affiliate carousel (`amzn.to`, "Amazon Product" badges: Kindle, Roku, Acer, iPad, PS5, Switch, AirPods, MacBook Air, air fryer) plus a Bybit referral banner (`bybit.com/invite?ref=BB1NM6V`). [OBSERVED `blog_home.html`]

**Domain flip to watch:** the blog and its nav point at bare `3dhouseplanner.com`, while the main site canonicalises to `www.3dhouseplanner.com`. [OBSERVED]

### 2.4 Keyword and SEO structure

**Sitemap shape.** 314 `<url>` entries from **35 unique paths** — the multiplier is `?lang=`. Priority tiers: [OBSERVED `sitemap.xml`]

| Priority | Changefreq | Entities |
| --- | --- | --- |
| 1.00 | daily | `/` |
| 0.90 | weekly | `index2.php`–`index5.php` (the 4 sub-apps) |
| 0.80 | weekly | `app.php`, `app2.php`, `/tools/` |
| 0.70 | weekly | the 25 `/tools/*.php` pages |
| 0.50 | monthly | terms |

`lastmod` dates: tools pages `2026-10-09`, root and sub-apps `2026-10-10`, `app.php`/`app2.php` stale at `2026-07-13`.

**Robots/meta.** `robots.txt` is maximally permissive (`User-agent: * / Allow: /` + sitemap). Landing and tools pages carry `index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1`. `app.php` carries **only** a meta description — no robots meta, no canonical, no OG/Twitter — yet is in the sitemap. [OBSERVED]

**Internationalisation.** Home and every tools page carry **11 `<link rel="alternate" hreflang>` entries** in `<head>`: `en, pt, es, fr, de, it, ru, zh, ja, ko` plus `x-default`. Localisation is real, not machine-appended: `/?lang=pt` renders `<html lang="pt-BR">`, a translated H1 ("Projete sua casa em 3D, grátis, no navegador"), translated title/meta/JSON-LD and a **self-referencing per-language canonical** (`…/?lang=pt`). Tools pages are localised too, e.g. pt "Planejador de casa 3D grátis online", ja "無料の3D間取り作成ソフト｜3D House Planner". [OBSERVED `home_pt.html`, `tools_lang_*.html`]

**Slug and title craft.** Long-tail descriptive slugs dominate (`free-2d-floor-plan-creator-no-watermark.php`, `mortgage-affordability-calculator-dti-guidelines.php`, `pbr-texture-generator-3d-model.php`), with commercial-intent modifiers "free", "no watermark", "online". Across the 27 sampled landing/tools pages: **27/27 unique titles** (44–59 chars, median 52) and **27/27 unique meta descriptions** — no duplicate-title problem. `naver-site-verification` is present alongside Google verification. [OBSERVED]

**Meta keywords are still populated** — deprecated, but deliberate: home = "3D home design, floor planner, house design, online sketcher, web application, AI house design, BIM, IFC"; tools pages use 4-phrase long-tail sets ("3D house layout planner, free home design software, browser room modeler, floor planner online"). Only 4 phrases repeat across ≥2 pages. `app2.php` reuses off-topic keywords ("Online Sketcher, build apartments and houses, house plan, 3D web application"). [OBSERVED]

**Link graph.** Each tools page links exactly **6** other tools pages → **150** internal edges, but the home page links only **5** of 25 tools pages and the tools hub links **30**. Median pairwise body-text similarity across the 25 tools pages is **0.921** — they are near-duplicates with the category and topic nouns swapped. [OBSERVED]

**Outbound link policy.** 103 distinct outbound hosts and 123 outbound anchors, **all followed** — `nofollow` appears **0** times; `rel="dofollow"` is written explicitly on 14 anchors (13 plain, 1 `dofollow noopener`) and is not a real directive. The badge set is a directory/listicle pattern rather than editorial citation. [OBSERVED `home_raw.html`]

**Competitor naming.** **Zero** mentions of Planner 5D, Homestyler, Floorplanner, RoomSketcher, SketchUp, Coohom, HomeByMe, MagicPlan or Chief Architect on any page fetched. The only competitor-adjacent name is "Sweet Home 3D" ×2, used as a **model-asset credit**, not as a comparison. The tools-page copy instead contrasts against a generic "high-end architectural CAD licenses cost thousands of dollars". [OBSERVED]

### 2.5 Technical SEO / crawl / structured data

**Structured data — the strongest part of the setup.** [OBSERVED]

- Home: 4 separate JSON-LD blocks — `WebSite`, `WebPage`, `SoftwareApplication` (with `offers.price = 0 USD` and a `featureList` string), and `FAQPage`.
- Each tools page: a single `@graph` = `WebSite` + `WebPage` + `BreadcrumbList` + `WebApplication` (`applicationCategory: DesignApplication`, `operatingSystem: Web browser`, `browserRequirements: "Requires JavaScript and WebGL"`, `offers.price = 0 USD`, `publisher` = Organization) + `FAQPage`.
- **FAQ discipline is correct:** the JSON-LD FAQ count exactly matches the visible `<details class="tools-faq">` count — 3 on the main 3D page, 2 on the others.
- **Missing rich-result opportunity:** `aggregateRating`, `reviewCount` and `ratingValue` appear **0 times** on the home page (`home_raw.html`) and every tools page, even though the home page displays **12 review-platform badges**. Off-site ratings are deliberately not marked up (which also avoids Google's self-serving-review policy risk), but it leaves the star ratings on the page unmonetised in SERP.

**Crawl friction (self-inflicted).** [OBSERVED] Direct non-browser fetches of: any `?lang=` variant of home/tools/index3, `ads.txt`, `blog.3dhouseplanner.com/sitemap.xml`, `api/house.php`, `api/i18n.php` → all return **HTTP 406 "Not Acceptable! … Mod_Security"**. Googlebot is presumably allow-listed, but this blocks verification tools, third-party crawlers and localisation QA across the board, and it is the main limit on this report's international evidence.

**Soft-guard chain (conversion + duplicate-URL risk).** [OBSERVED]

1. `app.php` contains a hard `window.location.href = 'index.php'` redirect when the `visited=true` cookie is absent.
2. `2D-Planner/index.php` mirrors it: without the cookie it navigates the top window to `https://3dhouseplanner.com/index3.php` (confirmed by browser scenario: `/2D-Planner/` → `https://3dhouseplanner.com/index3.php`; after the cookie is set, `/2D-Planner/index.php` stays).
3. The `/2D-Planner/` directory index is `<meta name="robots" content="noindex">` + a JS replace to `index.php`.
4. `2D-Planner/index.php` has **no canonical**, and the redirect chain crosses `www.` → bare domain → `www.` — a textbook duplicate-URL knot for exactly the page the 2D-planner SEO keywords target.

**Other signals.** Google Analytics `G-SFHW3J2XZQ`; AdSense `ca-pub-4394403726538170` (`adsbygoogle` present once on home and once on `index3.php`, **absent from all tools pages** — so the SEO cluster is deliberately ad-free, consistent with it being a pure funnel); `naver-site-verification`; Google verification `VKA36ZZlNSgRqaerYC0Vw68FGLChOwBb3xA3I6IZD24`. [OBSERVED]

**Performance/asset evidence:** the editor page ships a 2.09 MB HTML document (2,338 catalog anchors inlined), the homepage has a 4.5 MB `sample.mp4` capability video and a 220 KB `project.jpg`. [OBSERVED]

### 2.6 Copy voice, funnel and conversion mechanics

**Voice.** Second-person, benefit-first, imperative fragments. Short verb-phrase feature headers dominate: "Draw, describe or import", "Furnish and finish", "Visualize and share", "Sketch now". Absolute claims ("Free", "Always in sync", "No login", "Nothing to install") are balanced by concrete technical nouns (IFC4, DXF, GLB, BIM) — the copy is at its most trustworthy when it is most specific. [OBSERVED]

**Tools-page copy is a different register** — superlative-heavy listicle English: "Premium Capabilities Included", "The Advanced … Handbook", "The Master Manual for …", "Immense Object Catalog", "state-of-the-art models", "Unlimited 3D modeling and rendering", "create unlimited custom home projects without restrictions". Each page follows the identical H2 skeleton: *Why Choose Our X? → Premium Capabilities Included → <topic> Guide → Ready to realize your design vision? → Frequently asked questions → More free tools*. [OBSERVED]

**Unlimited-language risk:** "Unlimited 3D modeling and rendering" and "unlimited custom home projects without restrictions" appear on multiple tools pages, while the real constraint (the claimed 50-floor cap, browser memory, GPU limits in Ultra mode) is never stated. [OBSERVED]

**Funnel map.** [OBSERVED]

```
blog (WordPress, affiliates)  ──nav──►  index.php / index2–5.php
        │
home hero ─► "Start designing — free"  ─► index.php (3D editor)
           └► "Open the 2D planner"    ─► index3.php
25 /tools/ pages ──hero CTA──► matching app (index.php / index2–5.php)
tools hub (/tools/) ──30 links──► the 25 tools pages
app.php ──no `visited` cookie──► index.php
```

**Review solicitation is concentrated, not distributed.** Copy like "Select the platform of your preference to leave a review" appears **8×** on the home page (12 distinct platform links) and **4×** on `index3.php` (13 distinct platform links — the home 12 plus SaaSHub), and **0×** on `index2.php`, `index4.php`, `index5.php`, `app2.php`, the tools hub and **every one of the 25 tools pages**. The ask is placed only where the vendor most wants the rating to land: the two highest-traffic surfaces. The links are also not passive badge images — they are deep links to the *write-a-review* endpoints (`/write-review`, `#submit-review-form`, `/reviews/new`, `/evaluate/<domain>`) across 12–13 platforms. [OBSERVED]

**The AI funnel is the weak link.** The assistant is the #1 "What's new" item and the first word of the narrative ("describe it to the AI"), the FAQ promises it "builds walls, doors, windows, floors, roofs and furniture with the same tools of the editor, so everything stays editable" — but the landing page never says the render step consumes the user's own Puter credits. A visitor who arrives for a "free AI assistant" and hits "Not enough Puter credits. Recharge at puter.com" inside the product has been set up to feel baited. [OBSERVED]

### 2.7 On-page proof and trust devices

**What the page uses as proof:** [OBSERVED]

1. **Honesty-by-specificity** — the format matrix, IFC4 standard, "JavaScript and WebGL" requirement, Draft→Ultra naming.
2. **Privacy block as a trust pillar** — H3 "Privacy Matters", "Your data stays with you", "No cloud storage - your designs remain private", explicit "No login required".
3. **12 review-platform badges** (Trustpilot, Capterra, G2, GetApp, GoodFirms, Product Hunt, SaaSHub, SoftwareSuggest, CrowdReviews, Crozdesk, AlternativeTo, SourceForge/Slashdot family) — mostly via third-party badge SVGs and widgets. Some assets could not be verified: `assets.capterra.com/badge/...svg` → HTTP 302 empty; `getapp.com` widget → HTTP 403; `ads.txt` → 406. The badges are therefore *displayed* but not all *resolvable* by a third party. [OBSERVED]
4. **Asset-credit attribution** — H3 "Made with the help of great creators" crediting Scopia, Kator Legaz, Blend Swap, ArchiBit Generation, ArchiBase.net, "Free the models" and Sweet Home 3D. This is a genuine licensing-hygiene signal (and round-1 established the 2D planner is built on the MIT-licensed `homeRoughEditor` project).
5. **Media proof** — a 4.5 MB `sample.mp4` and a 220 KB hero image.

**What is missing:** no named team, no company address, no founding date on the landing page (round-1 established the vendor is Brazilian, founded 2022), no case studies, no customer quotes with attribution, no `aggregateRating` markup, no uptime/security statement, and no page that reconciles the privacy FAQ with the AR/share/Puter data flows. Round-1 sentiment (Trustpilot 3.7/5 from only 4 reviews; SourceForge 5.0 from 1; CrowdReviews 0; no organic community) means the badge wall's *volume* outruns the underlying *substance* — the visible social proof is the weakest-evidenced thing on the page. [OBSERVED, cross-referencing round-1]

**The trust asymmetry worth remembering for CasaPlazAI:** this vendor's credibility is high exactly where it shows verifiable technical detail and low exactly where it substitutes adjectives and badge counts. Copying the *shape* of that landing page while refusing the vague parts is a cheap, durable advantage.

---

## 3. Ideas for CasaPlazAI

Ranked by value ÷ effort. Each is tied to a finding above and, where relevant, to the frozen `FloorplanData` v1 contract (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`). The schema gives CasaPlazAI a genuine edge: it is a *published, validatable contract* with named error codes, which no competitor exposes.

| # | Idea | Tied to | Effort | Value |
| --- | --- | --- | --- | --- |
| **1** | **Landing page states real, schema-derived numbers and nothing else.** Derive the strip from the schema instead of adjectives: "meters-only · CCW-validated polygons · 30+ named validation rules · 7 furniture types (bed, sofa, table, chair, counter, bathtub, toilet) · unlimited floors up to browser memory". If a cap exists, print the tested number. | §2.2 #8, #9; §2.6 | S | **High** — directly neutralises 3DHP's three vaguest claims without a feature race |
| **2** | **"Your plan is a file you own" positioning.** Market `FloorplanData` JSON export/import as a first-class feature: "Every plan is open, versioned JSON — `schemaVersion` 1, meters, validated before it renders." The schema is additive-only with a documented `migrate()` chain, so "plans you made in v1 still open in v2" is a defensible, checkable promise. | §2.2 #11; §2.5 | S–M | **High** — an open, versioned contract is a category differentiator versus browser-locked saves and opaque project files |
| **3** | **One honest data-flow page** (replace 3DHP's privacy gap): a short "Where your data goes" table, one row per feature — *editor: local only* / *export: your machine* / *share link (if any): our server, TTL X* / *AI (if any): provider, whose account*. Mirror it in the FAQ so the page and the product cannot drift. | §2.2 #12, #13; §2.7 | S | **High** — 3DHP's single biggest failure; costs almost nothing to win |
| **4** | **Publish the validation model as a trust feature.** "We reject the plan and tell you why" — surface the named codes (`non-ccw-polygon`, `opening-too-wide`, `dangling-ref`, `roof-unsupported-config`). An in-app validator panel that shows these live is both a real UX aid and unfakeable proof of rigour. | §2.2 #1; schema §Validation | M | **High** — 3DHP has no equivalent; turns an internal invariant into marketing |
| **5** | **Specific engineering claims in the copy where 3DHP is specific.** Where 3DHP earns trust with "IFC4 · DXF · GLB", CasaPlazAI can earn it with "door and window widths measured to the centimetre, `tCenter`-anchored so both sides of a shared wall always align" (the two-row shared-door convention) and "shed and gable roofs composed from the top floor only, ridge derived, never stored". | §2.2 #5; schema §Opening/§Roof | S | **Medium–High** — precise, verifiable, and nobody else says it |
| **6** | **Copy the FAQPage + visible-FAQ pattern exactly, then add what 3DHP omits.** Keep the JSON-LD count == rendered count (3DHP does this correctly). Extend the FAQ to the questions 3DHP refuses to answer: "Can I use exports commercially?", "What happens to my plan if the browser is cleared?", "Do you have an account or cloud?" (`null` answers — provable). | §2.5 | S | **Medium** — cheap rich-result eligibility plus differentiation inside the SERP snippet |
| **7** | **If adding languages, use path prefixes (`/pt/…`) not `?lang=`.** 3DHP's 314-URL sitemap for 35 real pages is mostly parameter duplication, and its `?lang=` URLs are Mod_Security-406'd to non-browsers, making localisation QA and third-party auditing impossible. Also, canonicals cross `www.`/bare-domain on the 2D planner. Ship one canonical host, one canonical per language. | §2.4, §2.5 | M | **Medium** — avoids inheriting a dilutive, crawl-hostile IA |
| **8** | **A small, genuinely distinct SEO cluster — not 25 near-duplicates.** 3DHP's tools pages sit at 0.921 median similarity (doorway-page exposure) and only 5 of 25 are reachable from the home page. Ship 6–8 pages with real substance (e.g. "2D floor planner with no watermark", "floor plan JSON schema", "meters-only plan format") and link them from home + a hub. | §2.4 | M | **Medium** — keeps the long-tail upside without the duplication liability |
| **9** | **Onboarding in the same 3-beat rhythm, with an honest third beat.** 3DHP's "Draw, describe or import → Furnish and finish → Visualize and share" is good structure; CasaPlazAI has no AI, so use "Draw → Furnish → Walk through it in live 3D" and make the 2D⇄3D contract (one `FloorplanData`, one renderer) the headline instead of an assistant. | §2.1, §2.6 | S | **Medium** — borrows a proven page skeleton without an unsupported claim |
| **10** | **Put a testable capability asset on the landing page.** 3DHP ships a 4.5 MB `sample.mp4`; a short, silent loop of *2D edit → instant 3D* is the single most convincing proof of the product's core differentiator and costs one recording session. | §2.7 | S | **Medium** |
| **11** | **Keep monetisation off the canvas and out of the hero.** 3DHP leads the document with a Titanic/Amazon affiliate ad and runs an affiliate carousel on its blog. If CasaPlazAI ever monetises, keep it out of the editor and below the fold; state it plainly. | §2.1, §2.3 | S | **Medium** — protects the "clean, no-nonsense" position |
| **12** | **Avoid the "unlimited" reflex.** Do not write "unlimited floors/objects/renders" without a test; 3DHP's "unlimited 3D modeling" and untested "50 floors" are exactly what a sceptical reader catches. A stated limit with a reason ("performance-bounded, see the validator") reads stronger. | §2.2 #8, #9; §2.6 | S | **Medium** — cheap credibility, no engineering cost |
| **13** | **Ship JPEG export and say so.** 3DHP offers PNG only (no `jpg`/`jpeg` anywhere in its i18n). CasaPlazAI exporting PNG **and** JPEG is a concrete, checkable advantage for shared plans. | §2.2 #22 | S | **Low–Medium** — small, real, easy to verify |
| **14** | **Add genuine first-party proof instead of badge volume.** 3DHP stacks 12 review badges over 4–6 total reviews and marks up no ratings. Collect and mark up real first-party ratings (`aggregateRating`) only once they exist; until then use author/version/changelog and the schema's `schemaVersion` history as proof. | §2.7 | M | **Medium** — the badge wall is the competitor's softest surface |

**Do-not-copy list (from the same evidence):** the solo "50 floors + thousands of objects + 5 modes" stat strip; the "Nothing is uploaded" absolute while shipping AR/share/cloud AI; putting a partner's credit requirement (Puter) behind a "free AI" headline; `rel="dofollow"` badge walls; `?lang=` URL proliferation; and a 2D planner that saves to a different store (localStorage) than the one advertised (IndexedDB). Consistency between the stated data model and the implemented one is the cheapest moat on offer.

---

## 4. Unknowns

1. **The "50 floors per project" cap is unverified.** No numeric cap literal exists in any fetched module (only `gui.visibleFloors` = "Visible floors: up to {n}"), and the capture tool cannot `evaluate` JS to increment levels and observe a failure. Treated as an unproven claim, not a proven falsehood.
2. **"5 visualization modes" is inferred, not witnessed.** The topbar exposes exactly 4 (`3d, walk, top, 2d`); the 5th hero chip is the AI render. I could not drive the UI to confirm whether some further mode is reachable from a menu.
3. **Translated-page evidence covers 5 of 10 languages.** `/tools/*.php?lang=*` and `/?lang=*` return HTTP 406 Mod_Security to plain `curl`, so localisation was read from pre-captured copies: `home_pt.html` (full pt landing) and `tools_lang_{pt,es,de,ja}.html`. The `fr, it, ru, zh, ko` variants were verified only as hreflang/chip declarations, not as rendered copy.
4. **Whether Googlebot is allow-listed past Mod_Security** is unknown; if it is not, the `?lang=` half of the sitemap (279 of 314 URLs) may be effectively uncrawlable.
5. **The 2D planner's PDF/print export path is unresolved.** `planner-main.js` contains 6 obfuscated `pdf` hits and a `print_floorplan()` function, but the string-array obfuscation prevented decoding which formats the 2D page itself emits versus which are the 3D editor's.
6. **AR/share endpoint identity and exact payloads** were not resolved: the share `fetch()` URL is assembled from an obfuscated constant, `api/*.php` returns 406, and I did not publish a share link or trigger an AR upload (both are prohibited actions and would consume vendor resources).
7. **AI render economics and quality** were not tested — that requires the user's own Puter account and is out of scope. The disclosure gap is established from shipped strings and page copy only.
8. **Traffic, conversion and ranking data are unavailable**; no analytics access, and `aggregateRating` is absent, so no third-party rating series could be cross-checked beyond round-1's snapshot.
9. **Mobile/tablet usability is not verified.** The claim is only weakly supported by the code (no PWA manifest, no touch-oriented UI evidence), but headless captures could not assess layout on small screens.
10. **`ads.txt` (406) and the blog sitemap (406)** were unreachable, so the AdSense publisher declaration and the blog's full article inventory could not be confirmed; the 36-page pagination and 23 sampled posts are observed, not exhaustive.

---

## Evidence files in this folder

Fetched/derived in `~/dsh-workspaces/rea2-3dhp-p4/09-10c-reviews-business-positioning/`:

| File | What it is |
| --- | --- |
| `home_raw.html`, `home_text.txt` | Landing page HTML + extracted text (hero, stats, FAQ, privacy block, interstitial) |
| `headers_home.txt` | Response headers for the landing page |
| `robots.txt`, `sitemap.xml`, `tool_urls.txt`, `tools_meta.json` | Crawl directives; 314-URL sitemap; tools URL list with titles/descriptions/priority |
| `tools_hub.html`, `tools_html/*.php` (25 pages) | Every tool landing page, used for claim extraction, JSON-LD, cross-linking and similarity analysis |
| `tools_lang_pt.html`, `tools_lang_es.html`, `tools_lang_de.html`, `tools_lang_ja.html`, `home_pt.html` | Localised copies (source for the i18n findings); `home_pt.html` renders `<html lang="pt-BR">` with a self-referencing `?lang=pt` canonical |
| `privacy.html`, `ads.txt` | Privacy policy text; AdSense declaration attempt (406) |
| `app_cold.html`, `app_now.html`, `appphp_headers.txt`, `page_app2.php.html` | Editor page + its head (canonical/robots/OG audit) and `app2.php` |
| `page_index2.php.html` … `page_index5.php.html`, `page_index*.html` | The four sub-app landing pages (note: no flat `page_index*.html` files exist — the sub-app captures are exactly `page_index2.php.html`–`page_index5.php.html`) |
| `page_2D-Planner_index.php.html`, `page_2D-Planner_.html`, `scen_2dplanner.json`, `scen_2d_funnel.json` + `_out.json`, `planner2d_dom2.html` | 2D-planner guard/redirect chain, funnel test, final rendered DOM (573 KB) |
| `editor_js/*.js` (29 modules) | Shipped editor code: `hp-bim` (import accept list), `hp-share` (POST/share upload), `hp-ar`, `hp-editor` (iframe host), `hp-ui`, `hp-measure`, `hp-stairs`, `hp-dims`, `hp-linear`, `hp-panels` |
| `planner_js/*.js` (11 modules) | 2D planner code: `planner-main` (localStorage, print, SVG download), `bridge3d` (`window.parent.HPSync`) |
| `blog_home.html`, `blog_sitemap.xml` | Blog home (WordPress, affiliates, nav) and sitemap attempt (406) |
| `badges/{capterra.svg, ph.svg, getapp.html, scrolllaunch.svg}` | Review-badge asset verification attempts (302/403/empty) |
| `cj.txt`, `ctx.py` | Warmed cookie jar; context-printing helper used for evidence extraction |
| `~/dsh-workspaces/rea-3dhouseplanner-2026-10/10-10-reviews-business/` | **Read-only round-1 evidence reused:** `report.md`, `app.php.html` (2,092,092 B with full i18n JSON), `editor_dom.txt`, `i18n_extract*.txt`, `scen_editor.json`, `scen_shot.json`, `trustpilot_dom.txt` |
| `~/dsh-workspaces/rea2-shared/casaplazai-schema.md` | **Read-only** `FloorplanData` v1 contract used for §3 |
