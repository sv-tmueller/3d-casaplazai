# Competitor matrix from official pages — pricing · free-tier limits · paywall points · platforms

Job: `07-10a-reviews-business-competitor` (Round 2) · Research date: 2026-10-31 · Started 15:19 CET
Subject: **3D House Planner** (https://www.3dhouseplanner.com/, browser editor, Babylon.js; 2D planner at `/2D-Planner/index.php`) vs **Planner 5D**, **Homestyler**, **Floorplanner**, **RoomSketcher**, **Sweet Home 3D**.
Question: build a competitor matrix **from official/vendor pages** covering **pricing, free-tier limits, paywall points, platforms**.

Round 1 (`rea-3dhouseplanner-2026-10/10-10-reviews-business/report.md`) established the *external review* picture. This round goes to the vendors' own pricing/plans/API surfaces and does **not** repeat the Trustpilot/Reddit analysis. It closes Round 1 unknowns #1, #3 (partly) and the "official plan limits" gap.

Legend: **[OBSERVED]** = seen directly on the vendor's own page/endpoint (URL + local evidence file). **[DOCUMENTED]** = vendor/help-centre documentation. **[INFERRED]** = reasoning from observed evidence.

---

## 1. Summary (5 bullets)

1. **The market is freemium-to-credit-metered, and 3D House Planner is the only genuinely free one.** Planner 5D (€4.99–€33.33/mo tiers), Homestyler (€6.27–€18.37/mo + coins + AI credits), Floorplanner (US$5–$599/mo + per-project credit upgrades), RoomSketcher (US$12–$35/mo + credit refills) all meter exports, catalog access or rendering; 3DHP charges nothing, has no account and no watermark for personal **and commercial** use. [OBSERVED]
2. **Every paid rival's free tier is throttled at a specific, documented paywall point** — Planner 5D: 50% of catalog and (per in-product modal) **1 active project**; Homestyler: **4K renders cost coins**, watermark retained, uploads capped; Floorplanner: **5 projects, 3 floors/3 designs, SD 960×540 exports with watermark**; RoomSketcher: **up to 2 projects, 2 starter credits, "Limited" furniture library, 3D Snapshots watermarked**, print/render behind credit purchase. [OBSERVED/DOCUMENTED]
3. **Floorplanner is the only vendor whose live pricing I could read from an official machine-readable endpoint** — `floorplanner.com/api/v2/payments/memberships/pricing.json` returns every plan's exact monthly/yearly prices, included credits and per-extra-credit price; `…/projects/levels.json` returns project-upgrade levels with their credit price and max resolutions. This is unusually transparent and is strong primary evidence. [OBSERVED]
4. **Sweet Home 3D is the outlier: free, GPL desktop software (Windows/macOS/Linux) plus a free WebGL "Online" edition, with a store edition that the vendor markets as a paid model bundle** — but the live Microsoft Store API returns **Price 0.0 / Free** (publisher Space Mushrooms, copyright "AI Photo Editor Lab"), while the official **mobile apps are now published by AI Photo Editor Lab SRL with weekly/yearly "premium" subscriptions**. The mobile route is the one place a "free" product hides a paywall. [OBSERVED/DOCUMENTED]
5. **The hidden cost of the "free" tiers is a content licence, not just a watermark.** Floorplanner's free-user terms grant the vendor a *perpetual, sub-licensable* right over the user's floor plans; RoomSketcher's free tier is explicitly personal-only with a separate commercial contract required; Homestyler keeps IP in the platform. Sweet Home 3D (GPL) and 3D House Planner (no account, local storage) are the only two where a free user keeps clean commercial rights — and 3DHP's generic terms template undercuts even that. [OBSERVED]

---

## 2. Findings (detailed, with sources)

### 2.0 Method and confidence

Primary evidence = the vendors' own pages, fetched with a browser User-Agent and saved locally under `evidence/` (raw HTML) and `evidence/txt/` (text projection). Where a page is client-rendered and leaves prices blank in HTML, I followed its own JavaScript to the vendor's pricing API and fetched that — this succeeded for Floorplanner (`evidence/fpjs/` → `evidence/fp_memberships_pricing.json`, `evidence/fp_project_levels.json`) and failed for Homestyler, whose `global-api.homestyler.com/api/v1/currency/product/configs` endpoint returns 404 without a session (documented in Unknowns). A fresh REA Playwright capture of the 3D House Planner editor DOM (2.3 MB) confirmed the 2D-planner button and toolbar; a click-through to the 2D planner timed out and is not relied on. `web_search` is unavailable (no DeepSeek API key), so discovery used direct URL knowledge plus page navigation; this is a limitation, not a blocker, because every claim below is a first-party URL.

Screenshot/JS state around the 2D planner and main editor is reused from Round 1 (read-only) only where this round did not re-verify it.

### 2.1 3D House Planner — the free baseline

| Item | Value | Evidence |
|---|---|---|
| Price | "100% free, also for commercial use"; "absolutely free for all" | landing page claims (OBSERVED) `evidence/tdhp_home.html` |
| Account | "No login required"; "No sign-up" | landing hero + FAQ (OBSERVED) `evidence/txt/tdhp_home.txt` |
| Watermark | "no watermark" | FAQ (OBSERVED) `evidence/txt/tdhp_home.txt` |
| Free-tier limits | None stated on the vendor pages: **50 floors per project**, 10+ import/export formats, 5 visualization modes, "thousands" of catalog objects, IFC4/DXF/GLB/OBJ/STL/SVG/PNG/CSV/JSON export | landing feature band + FAQ (OBSERVED) `evidence/txt/tdhp_home.txt` |
| Monetisation | AdSense (`ca-pub-4394403726538170`) + affiliate + PayPal donations (round 1) and **AI features billed to the user's own Puter.js credits** | round-1 `app.php.html`, `i18n_extract.txt`; AI page (OBSERVED) `evidence/tdhp_ai.html` |
| AI rendering cost point | "Runs in the cloud with Puter.js · uses your Puter account credits." Renders are "saved in this browser only." | `evidence/tdhp_ai.html` (OBSERVED) |
| Storage | Projects in browser IndexedDB, autosave + crash recovery; export/import files | FAQ + round 1 (OBSERVED/DOCUMENTED) |
| Sub-products | 2D Planner (MIT `homeRoughEditor`, free, PDF export) at `/2D-Planner` (linked as `index3.php`), Material Editor (`index2.php`), Home Finance calculators (`index4.php`), AI Rendering studio (`index5.php`) | `index3.php`/`index5.php`/`/2D-Planner` (OBSERVED); Round-2 DOM re-confirms the editor's **"Open the 2D planner (synced with 3D)"** button `#open2DPlanner` and the `2dplanner` script that drives it, but the exact iframe URL string is inside `hp-ui.js` (direct fetch returns 403), so "2D planner in an iframe at `2D-Planner/index.php`" is **[INFERRED]** from the button + the separate planner page |
| Platforms | **Web browser only.** No store app. A `manifest.json` PWA exists but is titled "3D Material Editor" and starts at `/app2.php`, not the main editor; `sw.js` is registered by the Material editor | `evidence/tdhp_manifest.json`, `evidence/tdhp_sw.js` (OBSERVED) |
| Languages | 10 UI languages (EN, PT, ES, FR, DE, IT, RU, ZH, JA, KO) | landing selector (OBSERVED) |

**Paywall points for 3DHP: none in the product.** The only "cost" gate is the external Puter.js AI credit balance. Independent verification: grepping the two i18n dictionaries Round 1 extracted from the live editor (`i18n_extract.txt`, `i18n_extract2.txt`) for `premium|subscribe|subscription|watermark|buy|purchase` returns **0 matches**, while the only credit-related string is `fx.aiCredits = "Your Puter AI credits are insufficient. Recharge your Puter account and try again."` — i.e. 3DHP ships no upsell UI at all, unlike every rival. [OBSERVED]

### 2.2 Planner 5D — official plans and limits

From `https://planner5d.com/pricing` and the vendor help centre. [OBSERVED/DOCUMENTED]

| Plan | Published price | Headline limits |
|---|---|---|
| **Free (Basic)** | €0 | Unlimited projects (marketing) · web + mobile · **50% of the furniture catalog**; free catalog items are editable; unlimited custom textures; unlimited draft screenshots |
| **Premium** | €4.99/mo stated in the plan card; **US$19.99/mo or US$59.99/yr** in the FAQ | Full 10 000+ catalog, AI plan recognition, import 3D models from photos, standard renders, Budget Widget; more AI-Studio allowance |
| **Professional (PRO)** | €33.33/mo stated in the card ("Pay 399.99 annually or 49.99 per month"); FAQ says **US$49.99/mo or US$399.99/yr** | Unlimited watermark-free 4K renders, custom model upload, **CAD export**, Specs & Docs Organizer, Price Estimator, branded profile, 360° walkthrough/panorama |
| **Enterprise** | Custom | White-label planner, own catalogue, APIs, cart/CRM/ERP integration |
| Education | Free for verified teachers/professors | program limits apply |
| AI Studio credits | separate allowance: Premium = 100 credits/mo (1 200/yr); PRO = 1 000 credits/mo (12 000/yr); top-up packs | credit-priced image/video generation |

**Paywall points (official):**
- **Free = 1 active project.** A modal string shipped on the vendor's own pages reads: *"You reached the limit of projects on a free plan. You can have 1 active project on a free plan."* This **contradicts** the pricing page's "unlimited amount of projects" bullet, and is the sharper, more likely real limit. [OBSERVED] `evidence/p5d_windows.html`, `evidence/p5d_education.html`
- **50% of catalog** locked behind Premium.
- **Watermark**: renders are watermarked without PRO — *"With a PRO subscription, you can create watermark-free renders."* [DOCUMENTED] https://support.planner5d.com/en/articles/8330658-how-to-remove-the-planner-5d-logo-from-renders
- **CAD export** behind Professional.
- **Render quotas**: Premium monthly = 5 renders, yearly = 60; trial = 1. PRO = unlimited renders (but 4K and 360 renders are listed as web-only PRO features). [DOCUMENTED] subscription-types article.
- **Trials**: 7-day PRO trial on web/iOS/Android/Windows; 3-day Premium trial on macOS and iPhone/iPad. *"After the trial ends you will be automatically charged… cancel at least 1 day before."* *"Trials can only be activated once."* [DOCUMENTED] https://support.planner5d.com/en/articles/5930218-is-there-a-trial-period
- **No refunds** for partial/full unused subscription days (per policy linked from the help centre). [DOCUMENTED]

**Platforms:** Web, iOS, Android, Windows, macOS, visionOS. Help centre publishes a platform-differences table (Android = weekly + yearly only; iOS = weekly/monthly/yearly; macOS = monthly/yearly Premium; web/Windows = monthly/yearly; Windows app and Android do not sync subscriptions with other platforms). [DOCUMENTED] https://support.planner5d.com/en/articles/15128965-planner-5d-subscription-types

### 2.3 Homestyler — official plans and limits

From `https://www.homestyler.com/pricing` and `/pricing/ai-boost`. [OBSERVED]

| Plan | Published price | Headline limits |
|---|---|---|
| **Basic** | Free | Cloud 3D floor planner · **unlimited 1K renders** · 4K render "needs to be purchased each time" (9 coins/render 2K, 49 coins/render 4K) · 100 000+ free models · roof editing with 3 free roof styles · **watermark retained** |
| **Pro+ (Individual)** | from **€6.27/mo** | Everything in Basic + **75 renders each for 2K & 4K per month**, unlimited speed previews, **watermark removal**, upload own 2D textures/3D models (up to 300 each), custom lighting, multi-floor, plumbing & electricity, parametric stairs/roofs/pools, Material Brush, Interior Modeling, custom furniture, **180 AI credits/mo**, export colored floor plan + BOM + construction drawings, all premium models/templates |
| **Master+** | from **€10.89/mo** | Everything in Pro+ + **unlimited 4K rendering**, uploads up to 500 each, more video quota, 8K 20/12K 2 renders per month, video seconds quotas, **380 AI credits/mo** (page card; i18n string says one of the plans carries "300 AI credits per month" — see Unknowns), designer directory, 0% payout fees |
| **Team** | from **€18.37/seat/mo** | Master+ + shared design space/library, sub-accounts, custom logo on renders, extra quota, **500 AI credit coupons/mo**, unlimited uploads |
| **Enterprise** | Custom | SSO, model creation, white label, API |
| **AI Boost** | from **€4.52/mo** | Separate membership: 1500 AI credits/mo (limited-time), priority processing, watermark removal on AI images, 10% off credit packs, download results. Credit packs observed on the same page (region-dependent currency): **₹93/100 credits (first-time), ₹948/200, ₹2 846/1 000, ₹4 744/2 000** — the page also ships stale USD strings from an older price model ($4.9 "Pro", $3.9/$12 "Styler", $29 "Pro Plus", $11.9 AI Boost) which do **not** match the live EUR cards |

**Paywall points (official):**
- **Rendering quality/tier** is the primary gate: 1K free/unlimited; 2K/4K cost **coins** on Basic; watermark persists until a paid tier.
- **Coin economy** on Basic: 2K = 9 coins/render, 4K = 49 coins/render, video 540p = 199, 720p = 399 coins; coins are earned by daily login/tasks (earning 6 000 coins is offered by bootcamps). [OBSERVED] pricing page comparison table.
- **Model/texture upload caps** by tier (300 / 500 / unlimited).
- **Turnkey features** locked: multi-floor, plumbing & electricity, parametric stairs, roofs, pools, tile flooring, BOM/colored-plan export — all Pro+.
- **AI is a separate meter**: AI Planner 15 credits/plan, AI Stager 10/image, AI Modeler 20/model, AI Render 25 (2K) / 35 (4K), AI Animator 10–12 credits/sec. Basic includes **3 AI credits**. [OBSERVED] `/pricing/ai-boost`
- A product card on the site advertises a **"7-day Free Trial"** for team/business. [OBSERVED] `evidence/hs_app.html` i18n `homepage.teamtry`

**Platforms:** Web ("no download required"), iOS, Android (phone + tablet), "one Homestyler account across web and mobile"; footer also lists a "Desktop Version" link → `/en/desktop` returned **404** at capture time. [OBSERVED] `evidence/hs_mobile.html`, `evidence/hs_home.html`

### 2.4 Floorplanner — official plans, credits and project levels

From `https://floorplanner.com/pricing`, `https://floorplanner.com/project-levels`, and the vendor's **live pricing API**. [OBSERVED]

**Free tier (SD-Lite):** *"You can make up to 5 free projects… limited to 3 floors with 3 designs total and can only export SD-quality images with a watermark"* (SD = 960×540 px). Free account retains 20 favourites and 5 product groups.

**Credit purchases without a subscription:** 5 credits US$8.15 · 10 US$16.30 · 30 US$48.90 · 100 US$163.00. [OBSERVED] pricing page.

**Subscription prices from the vendor's own JSON** (`/api/v2/payments/memberships/pricing.json`, USD, ex-VAT; credit column = price per extra credit):

| Plan | Monthly USD | Yearly USD | Included credits/mo | Price/extra credit |
|---|---|---|---|---|
| free | 0 | 0 | 0 | $1.63 |
| **plus** | **$5.00** | **$60.00** | 4 (55/yr) | $1.36 |
| **pro** | **$29.00** | **$348.00** | 25 (345/yr) | $1.18 |
| team | $59.00 | $708.00 | 54 (656/yr) | $1.08 |
| business | $179.00 | $2,148.00 | 182 (2,192/yr) | $0.98 |
| enterprise | $599.00 | $7,188.00 | 739 (8,875/yr) | $0.81 |
| education | $0 | $0 | 0 | $0 |

**Project upgrade levels from the vendor's own JSON** (`/api/v2/projects/levels.json`; the public page shows the credit count, the JSON shows the same credit count plus a currency price):

| Level | Credits | USD | EUR | 2D max | 3D max |
|---|---|---|---|---|---|
| SD-Lite | 0 | 0 | 0 | 960×540 | 960×540 |
| SD | 2 | $2.49 | €1.99 | 1920×1080 | 960×540 |
| HD | 5 | $5.99 | €4.99 | 3840×2160 | 1920×1080 |
| 4K | 10 | $12.49 | €9.99 | 3840×2160 | 3840×2160 |
| 8K | 20 | $24.99 | €19.99 | 3840×2160 | 7680×4320 |

**Paywall points (official):**
- **Project count**: 5 free projects.
- **Floor/design count**: 3 floors / 3 designs free → 7 floors with up to 10 designs/floor after upgrade.
- **Export resolution + watermark**: SD with watermark free; HD/4K/8K are one-time per-project credit fees that also remove the watermark and unlock link/FML/DXF sharing.
- **Advanced sharing**: 3D tours and public "Spaceplanner" links cost credits *after* a project is upgraded.
- **Export cooldown**: BASIC has a **10-minute cooldown** between exports; PLUS/PRO have none.
- **Productivity gates**: custom templates, custom roomtypesets and "premium projects by default" are PRO-only; unlimited favourites start at PLUS.
- **Credits expire per project** if not used — user-facing complaint in Round 1 ("if you spend credits in a project and delete it, you lost the credits"). [OBSERVED — pricing page wording "one-time fee per project"]

**Platforms:** browser ("You do not need to install anything, just create an account"); HTML5 web app used since 2007. No first-party mobile/desktop app surfaced on the personal/pricing pages; positioning is explicitly web-first. [OBSERVED] `evidence/txt/fp_personal.txt`

### 2.5 RoomSketcher — official plans and credits

From `https://www.roomsketcher.com/pricing/`, `/subscriptions/free/`, `/pricing/credits/`, `/download-app/`. [OBSERVED]

| Plan | Price | Includes |
|---|---|---|
| **Free** | $0, no card | **2 Credits to get started**, **"Up to two projects"** (10-project archive), 1 free AI floor-plan conversion, 2D and 3D floor plans\*, 3D Snapshots (low-res, with watermark), AI Render\*, **limited** furniture/symbol library (~4 000 items), app for computer/tablet only |
| **Pro** | **$12/mo billed $144/yr** (list $24/mo; "Save 50%") | 5 credits/mo, full catalog, 3D floor plans, 3D photos, 360 views, branding, print to scale, measurements + total area, discounts on orders |
| **Team** | **$35/mo billed $420/yr** (list $70/mo) | 5 users, 20 credits/mo, dedicated manager, onboarding, 500-project archive, collaboration |
| **Enterprise** | Custom | unlimited users, API, custom branding, SLA |
| **Premium (single-project upgrade)** | not published in the plan cards | "Premium is our single project upgrade and gives you Live 3D, Replace Materials, and 2D Floor Plans for one single project." This is the FAQ's recommendation for low-volume users and is a distinct product from Pro. [OBSERVED] `evidence/txt/roomsketcher_pricing.txt` |

**Credit price list (USD, ex-VAT):** DIY project 1 credit · AI Render **0.1 credit** · 3D Floor Plan / 3D Photo 1 credit · AI Convert 5 · FloorCapture 5 · 360 View 5 · **Share Live 3D (annual licence) 6**. Order-a-floor-plan service: 2D $38/floor free tier, from $18/floor Pro. **Credit refills:** Mini $35/10 · Small $150/50 · Medium $390/150 · Large $1 100/500 · XL $2 000/1 000 (i.e. $3.50 → $2.00 per credit).

**Paywall points (official):**
- **Credits are the universal meter** — projects, floor plans, 3D photos, 360 views, AI Convert, Live 3D sharing all consume credits.
- **Furniture library**: "Limited" on Free vs "Full Catalog" on Pro.
- **Watermark**: Free 3D Snapshots are watermarked; polished renders require credit purchase.
- **Print/download**: *"generating 2D and 3D Floor Plans requires an in-app purchase before you can print or download them."* [DOCUMENTED] `evidence/txt/rs_free.txt`
- **Refills stay valid only while the subscription is active.** [OBSERVED] credits page.
- **Live 3D and materials replacement** require Pro or credits.

**Platforms (official, JSON-LD `operatingSystem`):** "Windows, macOS, iPadOS, Android (Tablet), Web Browser". The download page clarifies: **no phone app** — drawing requires a Mac/Windows computer or an iPad/Android tablet; phones get the web portal for viewing/converting/ordering only. Projects are cloud-stored and sync, with offline editing. [OBSERVED] `evidence/txt/rs_download.txt`

### 2.6 Sweet Home 3D — the open-source outlier

From `sweethome3d.com` home/download/FAQ/license/online-manager. [OBSERVED/DOCUMENTED]

| Edition | Price | Notes |
|---|---|---|
| **Desktop installer (SourceForge)** | Free, GPL v2+ | Windows/macOS/Linux; free bundle ships **929 furniture pieces / 26 textures (macOS) and 100 furniture / 26 textures (Windows)** |
| **Sweet Home 3D Online** | Free (WebGL browser) | Java Web Start / web; fewer models than store edition; no plug-ins |
| **Store editions** (Microsoft Store / Mac App Store / Google Play / App Store) | Vendor FAQ says "buy and download"; **the live Microsoft Store listing is Free (price 0.0)** with the 10 000+ furniture bundle | FAQ markets the store edition as paid and better-stocked; the actual Windows listing (`ProductId 9NBLGGH2SMTQ`) reports `Price 0.0 / DisplayPrice Free`, publisher `Space Mushrooms`, copyright `© 2024 AI Photo Editor Lab`, and features list "Access 10,000+ furniture items and 3D models" plus PDF/PNG/JPEG/SVG/OBJ export |
| **Mobile apps** | Store app "Free · In-App Purchases" | Official download page links both `Sweet Home 3D Mobile` (id1178963471) and desktop Mac id669289700 |
| **Licence** | GNU GPL (free desktop/online editors); the *mobile/Sweet Home 3D JS* apps are under other licences | Documents you create may be published; code reuse is copyleft |
| **Current version** | 7.5 (last update 5 May 2025) | 29 languages |

**Paywall point (observed, and a genuine nuance):** the iOS/macOS listings for "Sweet Home 3D: Plan Your House" are **free with in-app purchases published by `AI Photo Editor Lab SRL`**, not Space Mushrooms, with a weekly/yearly premium subscription (e.g. weekly $2.99–$4.99; yearly $29.99–$69.99 on the Mac listing). The iTunes lookup API returns `sellerName = AI Photo Editor Lab SRL`, `formattedPrice = Free` for both id669289700 (mac) and id1178963471 (iOS). This is the main "hidden paywall" in an otherwise free product and contradicts the "free interior design application" framing for the mobile route. [OBSERVED] `evidence/sh3d_mobile_ios.html`, `evidence/sh3d_desktop_mac.html`, iTunes lookup JSON. On the Windows side, Microsoft's own storefront API (`storeedgefd.dsx.mp.microsoft.com/v9.0/products/9NBLGGH2SMTQ`) returns `Price 0.0`, `DisplayPrice Free`, `PublisherName Space Mushrooms` but `PublisherCopyrightInformation © 2024 AI Photo Editor Lab` — i.e. the same acquirer, a free listing for now, and the vendor FAQ's "paid store version" is out of date for Windows. [OBSERVED] `evidence/sh3d_ms_dsx.json`

**Platforms:** Windows, macOS, Linux (desktop installer + Java Web Start), WebGL browser (Online), iOS and Android (mobile), iPad/tablet. Minimum spec is famously low (400 MHz, 256 MB RAM, works on an iMac DV). [DOCUMENTED] FAQ.

### 2.7 Cross-vendor matrix (pricing & free tier)

| Vendor | Entry price | Top individual price | Free-tier project/floor cap | Free export | Account-free? |
|---|---|---|---|---|---|
| **3D House Planner** | **$0** | **$0** | none (50 floors) | PNG/JPEG/IFC/DXF/GLB/OBJ/STL/SVG/CSV/JSON | **Yes** (no login) |
| Planner 5D | $0 | $49.99/mo (PRO) | **1 active project** (in-product modal); 50% catalog | draft screenshots; renders watermarked | No |
| Homestyler | $0 | €10.89/mo (Master+), + AI Boost €4.52 | unlimited projects; **1K renders unlimited**, 2K/4K cost coins | 1K images, watermark | No |
| Floorplanner | $0 | $599/mo (Enterprise); individuals $29/mo (Pro), $5/mo (Plus) | **5 projects**, 3 floors/3 designs | SD 960×540 watermarked | No |
| RoomSketcher | $0 | $35/mo (Team); individual $12/mo (Pro) | **up to 2 projects**, 2 starter credits, limited library | watermarked snapshots; renders need credits | No |
| Sweet Home 3D | **$0** (GPL desktop/online) | store bundle price; mobile IAPs $2.99–$69.99 | none in GPL desktop; store/mobile bundling differs | full desktop export | **Yes** (desktop) |

### 2.8 Platforms matrix (official claims)

| Vendor | Web | Windows | macOS | Linux | iOS | Android | visionOS | Notes |
|---|---|---|---|---|---|---|---|---|
| 3D House Planner | ✔ (only) | — | — | — | — | — | — | PWA manifest exists for Material Editor only |
| Planner 5D | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | full platform-difference table published |
| Homestyler | ✔ | desktop link 404s at capture | desktop link 404s | — | ✔ | ✔ | — | mobile + web share one account |
| Floorplanner | ✔ | — | — | — | — | — | — | explicitly "no install", browser-first |
| RoomSketcher | ✔ (portal, view/order only on phone) | ✔ | ✔ | — | iPad only (tablet) | tablet only | — | no phone drawing app |
| Sweet Home 3D | ✔ (Online, WebGL) | ✔ | ✔ | ✔ | ✔ | ✔ | — | GPL desktop; store/mobile bundles |

### 2.9 Paywall points compared (the practical answer to "where do users hit a wall")

| Vendor | First wall a free user hits | Severity for a hobbyist | Evidence |
|---|---|---|---|
| 3D House Planner | none in product; AI rendering needs a Puter.js credit balance | **None** | `tdhp_ai.html` |
| Planner 5D | catalog half-locked immediately; second project blocked on free | High (catalog + project count) | pricing page + in-app modal string |
| Homestyler | 4K renders cost coins and images carry a watermark; advanced tools are Pro+ | Medium (1K design is usable) | pricing comparison table |
| Floorplanner | SD-only watermarked exports on 5 projects, 3-floor limit, 10-min export cooldown | High (export quality) | pricing + project-levels pages |
| RoomSketcher | up to 2 projects (free), limited furniture library; watermarked snapshots; render/print requires credits | High (renders are the product) | free-subscription page |
| Sweet Home 3D | mobile listings are Free-with-IAP (weekly $2.99–$4.99 / yearly $29.99–$69.99); Windows Store listing currently Free; free desktop/online is fully functional | Low on desktop, Medium on mobile | download + App Store listing + MS Store API |

### 2.10 The licence and privacy contract behind the price (new in Round 2)

Pricing tables hide the clause that actually costs the user. Reading each vendor's terms of use directly surfaces a consistent asymmetry. [OBSERVED — all first-party URLs quoted below]

| Vendor | What the user grants the vendor | Commercial use | Privacy posture |
|---|---|---|---|
| **3D House Planner** | "By displaying Your Content, you grant 3D House Planner a non-exclusive, worldwide irrevocable, sub licensable license to use, reproduce, adapt, publish, translate and distribute it in any and all media." Landing FAQ still promises "nothing uploaded" and IndexedDB local storage | Landing says free "for commercial use"; the generic Terms text nonetheless restricts "selling, sublicensing and/or otherwise commercializing any Website material" (a template artefact, not a considered policy) | Contradiction: local storage claim vs. broad content licence + AdSense/analytics cookies |
| **Planner 5D** | Full legal hub behind a JS shell; plan pages do not publish a content licence in the fetched HTML | Paid tiers implied; free trial terms are prominent | standard SaaS |
| **Homestyler** | Platform content (incl. "projects, images, files") belongs to Homestyler Group; the user gets only a "personal, royalty-free, non-assignable and non-exclusive license to use" the platform. Sharing/publishing lets "others … use, sell, reproduce, modify, distribute" the content, and **terminating access does not delete already-shared content** | not granted | governed by PRC law; parent = Alibaba Group + Easyhome |
| **Floorplanner** | For free users: "a perpetual, non-exclusive, transferrable license to publish, change amend, and use any floorplans created by User under the free use subscription … (including the right … to sublicense any designs)". Free subscriptions may be terminated "at any moment"; credits have a **2-year validity** (5 years for Enterprise bundles); no refunds on credits | free tier is personal; B2B via paid tiers | Netherlands law, Rotterdam court |
| **RoomSketcher** | Free use is "solely for your personal, non-commercial use" under a non-transferable licence; commercial use needs separate Commercial Terms. If content is public/shared, the user grants "an unrestricted, non-exclusive, royalty-free, irrevocable, worldwide right to sublicense the right to copy, modify, prepare derivative works from, and distribute" it; the vendor may revoke the licence at any time | **separate commercial licence required** | data may be processed in Norway, the US or elsewhere; cloud-stored projects |
| **Sweet Home 3D** | GPL desktop/online: the user keeps their files and the code is copyleft; documents created may be published by the user. Online Manager is a separate hosted service | GPL permits commercial use ("personal or commercial purpose") | documents stay local in the desktop edition; the vendor explicitly does not take a content licence |

**Why this matters for the matrix:** the *effective price* of the free tiers is not only "watermark + resolution + credits" but also **a broad IP licence over the user's own floor plans and, for RoomSketcher, a ban on commercial use without a separate contract.** 3D House Planner and Sweet Home 3D are the only two whose free edition lets a user keep commercial rights with no account; 3DHP's own terms text is a generic template that undercuts its marketing. [OBSERVED/INFERRED]

**Exact licence quotations and URLs**

- 3D House Planner: `https://www.3dhouseplanner.com/terms.php?terms=terms` — "You are granted limited license only for purposes of viewing the material contained on this Website" + the sub-licensable content grant above. [OBSERVED] `evidence/tdhp_terms.html`
- Homestyler: `https://www.homestyler.com/about/agreement` — clause 12.2 and clause 4 quoted above. [OBSERVED] `evidence/hs_terms.html`
- Floorplanner: `https://floorplanner.com/terms` — clause 12 (free user) and clause 4.3 (credits validity). [OBSERVED] `evidence/fp_terms.html`
- RoomSketcher: `https://www.roomsketcher.com/terms/` — personal/non-commercial licence grant and the public-content sublicence clause. [OBSERVED] `evidence/rs_terms2.html`

**Paywall-adjacent legal points:** Floorplanner credits are non-refundable and expire (2 years subscription-credited, 5 years Enterprise bundles) — the contractual basis for the Round 1 complaint "spend credits in a project, delete it, lose the credits". RoomSketcher requires separate commercial terms, so its $12/mo Pro is not automatically a commercial licence. Planner 5D's trial auto-renews and "trials can only be activated once" with no partial refunds. [OBSERVED/DOCUMENTED]

---

## 3. Ideas for CasaPlazAI (ranked by value/effort)

Each idea names the finding it answers and, where relevant, the CasaPlazAI schema hook (`~/dsh-workspaces/rea2-shared/casaplazai-schema.md`).

| # | Idea | Value | Effort | Ties to |
|---|---|---|---|---|
| 1 | **Make "Free · No account · No watermark · Nothing uploaded" a persistent status line in the new single-workspace chrome**, alongside the save state. Every paid rival's free tier hits a documented export/watermark/project wall; 3DHP's whole differentiation is that it doesn't. The redesign's inspector is the natural place for a fixed trust chip. | ★★★★★ | ★ | 2.1, 2.7 |
| 2 | **Never meter the core loop — export, floors, catalog, save.** Floorplanner caps free projects at 5 and 3 floors, RoomSketcher meters every render, Planner 5D at 1 active project. CasaPlazAI's schema already supports `rooms`, `openings`, `furniture`, multi-floor and PNG/JPEG export; keeping all of it unmetered is the single cheapest competitive weapon. | ★★★★★ | ★ | 2.2–2.5, 2.7 |
| 3 | **If a paid tier is ever added, gate *outputs*, not *drawing*** — e.g. 4K export, formula-free vector PDF, cloud sync — never the room count, wall tools, or the 2D→3D contract. Every rival gates outputs or catalog; the least-resented gate in the sample is Sweet Home 3D's "store bundle = more models", which is additive, not restrictive. | ★★★★☆ | ★★ | 2.4, 2.6 |
| 4 | **Ship a real PWA for the main editor, not just a manifest for a side tool.** 3DHP's `manifest.json` starts at `/app2.php` (Material Editor), so its main editor is not installable. A correct manifest + service worker for the single-page editor gives offline drafting and an install icon on desktop/mobile — the platform dimension where 3DHP is weakest, at low cost for a no-backend app. | ★★★★☆ | ★★ | 2.1, 2.8 |
| 5 | **Explicit multi-floor semantics in the UI to mirror the schema.** CasaPlazAI's `Room.wallsOverride`, `roofs` (topmost floor only) and the shared-door two-row convention map directly onto visible "floor" affordances. Rivals' worst review themes are second-floor resets (Floorplanner) and paywalled multi-floor (Homestyler); making floors first-class and free is a visible differentiator. | ★★★★☆ | ★★★ | 2.3, 2.4 |
| 6 | **Publish a plain-language "what's free" page and mirror it in-app.** Floorplanner and RoomSketcher are the most transparent in the sample (explicit SD/credit/level tables; a live JSON of every plan price). Copy the *clarity*, not the meter: a one-screen table of exactly what is free forever, exports included. | ★★★☆☆ | ★ | 2.4, 2.5 |
| 7 | **Use the schema's stable error codes as user-facing validation hints** (`opening-too-wide`, `non-ccw-polygon`, `roof-*`). Rivals hide geometry errors behind generic failure toasts; surfacing the specific code with a fix suggestion ("door is wider than its wall — shrink it or move it") turns a validator into a teaching tool. | ★★★★☆ | ★★ | schema §Validation |
| 8 | **Keep the export ladder additive and local: PNG/JPEG first, then project JSON, then SVG vector plan.** Floorplanner's free tier is SD-with-watermark and its DXF export is a known complaint; CasaPlazAI can leapfrog with a clean project-file round-trip (`FloorplanData` JSON) and a vector plan — no server needed. | ★★★★☆ | ★★★ | 2.4, 2.7 |
| 9 | **Add a "bring-your-own key / local-first AI" stance only if AI is added.** 3DHP's AI burns the *user's* Puter credits and renders are stored in-browser; Homestyler sells a whole separate AI-credit package. A no-AI, no-meter posture is defensible and cheaper to explain. | ★★★☆☆ | ★ | 2.1, 2.3 |
| 10 | **Match RoomSketcher's explicit device honesty.** It publishes "no phone app — draw on tablet/desktop, view on phone". CasaPlazAI's single-page editor should state its supported input (pointer + keyboard) rather than let mobile users discover breakage (a top Floorplanner complaint in Round 1). | ★★★☆☆ | ★ | 2.5, 2.8 |
| 11 | **State the ownership contract in one sentence and make it true: "Your plans stay yours and stay in your browser."** Floorplanner's free tier takes a perpetual, sub-licensable licence over user plans; RoomSketcher forbids commercial use without a separate contract; Homestyler keeps platform IP. A no-account, local-storage planner can credibly promise the opposite — but only if it does not add a template content-licence clause (3DHP's own terms do, which is a self-inflicted inconsistency). | ★★★★★ | ★ | 2.10 |
| 12 | **Give export and project-file portability a first-class UI, since rivals make it a paid feature and a legal lever.** `FloorplanData` JSON export/import makes lock-in structurally impossible and turns the schema's `migrate()`/`unsupported-version` rules into a user-visible "your file will keep working" guarantee. Floorplanner gates link/FML/DXF sharing behind a project upgrade and expires credits; CasaPlazAI can make round-trip free. | ★★★★☆ | ★★ | 2.4, 2.10, schema §Top level |

**Anti-patterns confirmed on official pages (avoid):** per-project credits that are consumed or expire (Floorplanner), coin meters on basic rendering (Homestyler), watermarks on the free export (Floorplanner, RoomSketcher, Planner 5D), catalog half-locked on the free plan (Planner 5D), "1 active project" free cap (Planner 5D in-product modal), render/print blocked behind an in-app purchase (RoomSketcher), auto-charging trials that can only be used once (Planner 5D), and a free-store listing whose IAP is actually a third-party weekly subscription (Sweet Home 3D mobile).

---

## 4. Unknowns

1. **Floorplanner's rendered plan names vs HTML.** The public pricing page left Plus/Pro monthly prices blank in static HTML (client-rendered); I recovered them from the vendor's own `memberships/pricing.json` (USD/EUR, ex-VAT). Whether the *displayed* checkout price matches (promos, region, VAT) is unverified. [OBSERVED limitation]
2. **Planner 5D's free project cap is contradictory.** The pricing page says "unlimited amount of projects"; a modal string shipped on planner5d.com says "1 active project on a free plan" (and help says projects cannot be saved at all without login). I could not create an account to see which governs checkout. Likewise the plan *card* shows Premium at **€4.99/mo** while the pricing-page FAQ says **US$19.99/mo or $59.99/yr** — the two figures on the same page disagree, so the authoritative price is unclear. [OBSERVED/INFERRED]
3. **Homestyler tier naming/price drift.** The live pricing page shows Basic/Pro+/Master+/Team at €6.27/€10.89/€18.37, while embedded strings still describe an older "$4.9 Pro", "$3.9/$12 Styler" and "$29 Pro Plus" model and the i18n says "100 AI credits" (Pro) / "300 AI credits" (Master) where the rendered card says 180 / 380. The rendered-card numbers are the OBSERVED ones; the post-login, region-specific checkout price and the authoritative credit allowances are unknown because I did not log in. [OBSERVED limitation]
4. **Homestyler desktop version** is linked in the footer but `/en/desktop` 404'd; whether a desktop app exists is unresolved. [OBSERVED]
5. **Sweet Home 3D store prices** are now partly resolved: the Microsoft Store listing is **Free** per Microsoft's storefront API, and the iOS/macOS listings are Free with IAP. What remains unknown is whether the vendor *intends* the Windows store edition to be free permanently or the FAQ text is simply stale, and what the exact paid one-off amounts are on the Mac App Store / Google Play for the bundle. [OBSERVED limitation]
6. **RoomSketcher's annual vs monthly toggle** shows both price sets ($12 vs $24; $35 vs $70) but I did not confirm what happens at renewal (the "pay for 6, get 12" promotion implies a 12-month commitment). [OBSERVED/INFERRED]
7. **Traffic, conversion and churn** were not measurable (SimilarWeb/Ahrefs blocked in Round 1); this matrix is about *published* pricing, not realised revenue.
8. **3D House Planner's own paywall is only theoretical** — the Puter.js AI credit cost per render was not exercised (no account creation allowed), so the effective AI cost is unknown. [OBSERVED limitation]
9. **No logged-in session for any vendor**, so prices shown to a signed-in user, regional pricing, taxes, and the exact checkout totals are all unverified.
10. **CasaPlazAI schema reference:** this round did not re-verify the schema; ideas cite the frozen v1 contract from `~/dsh-workspaces/rea2-shared/casaplazai-schema.md` read at the start of the job.

---

## Evidence files in this folder

| File | What it is |
|---|---|
| `report.md` | This report |
| `sources.json` | Machine-readable source list (URL, kind, access) — see note below |
| `evidence/*.html` | Raw first-party pages (pricing, plans, download, FAQ, licence, store listings) |
| `evidence/txt/*.txt` | Text projections of the above for grepping |
| `evidence/fp_memberships_pricing.json` | **Floorplanner's own pricing API** response (all plan prices, credits, extra-credit cost) |
| `evidence/fp_project_levels.json` | **Floorplanner's own project-levels API** (credits + USD/EUR + max resolutions) |
| `evidence/fpjs/*.js` | Floorplanner site JS chunks that revealed the pricing/levels endpoints |
| `evidence/hs_app.*.js`, `evidence/hs_index.*.js`, `evidence/hs_pricing.js` | Homestyler site JS: the `global-api.homestyler.com` endpoints and product-config call (returns 404 unauthenticated) |
| `evidence/tdhp_manifest.json`, `evidence/tdhp_sw.js` | 3DHP PWA manifest (Material Editor only) and service worker |
| `evidence/tdhp_editor_dom_round2.txt` | Round-2 live editor DOM (2.3 MB) re-captured with the Playwright scenario; confirms `#open2DPlanner`, catalog/toolbar i18n |
| `scen_iframe.json`, `scen_iframe_out.json` | Round-2 REA scenario + Evidence that captured the editor DOM |
| `evidence/sh3d_*.html` | Sweet Home 3D home/download/FAQ/licence/online + iOS/macOS store listings |
| `evidence/sh3d_ms_dsx.json` | **Microsoft storefront API** for Sweet Home 3D (Price 0.0 / Free; publisher; feature list) |
| `evidence/hs_ai.html`, `evidence/hs_terms.html`, `evidence/rs_terms2.html`, `evidence/fp_terms.html`, `evidence/tdhp_terms.html` | Terms-of-use pages used in §2.10 |
| `evidence/fp_support.html`, `evidence/fp_faq_jina.txt` | Floorplanner support page and help-centre index (help moved to `floorplanner.frontkb.com`) |
| `evidence/sh3d_mobile_*.html`, `evidence/sh3d_play.html` | Sweet Home 3D mobile store listings (developer identity, IAP prices) |
| `evidence/p5d_*.html`, `evidence/hs_*.html`, `evidence/rs_*.html`, `evidence/*.html` | Planner 5D, Homestyler, RoomSketcher raw pages |
| `evidence/fp_pricing_jina.txt` | Reader-proxy projection of the Floorplanner pricing page |

**Tooling note:** `web_search` is unavailable in this environment (no `DEEPSEEK_API_KEY`), so discovery relied on direct URLs plus navigation; `r.jina.ai` was tried once as a fallback. Store APIs (`itunes.apple.com/lookup`) provided machine-readable app identity for Sweet Home 3D. Round 1's evidence folder was read only, never modified.
