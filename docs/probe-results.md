# Phase 0 — Per-chain probe results

Run 2026-05-05. Method: single curl (no cookies, no JS) per request, with desktop Chrome User-Agent. Goal: §1 of feasibility plan — confirm whether structured product+price data is reachable without browser automation.

## Summary

| Chain | Status | Method | Catalog | Difficulty | Phase |
|---|---|---|---|---|---|
| **Tesco** (`nakup.itesco.cz`) | ✅ Pass | JSON-LD inline + sitemap | ~20k SKUs (4 sub-sitemaps × ~5k); **EAN/GTIN13 exposed** | Easy | MVP |
| **Rohlík** (`www.rohlik.cz`) | ✅ Pass | JSON-LD inline + sitemap | 21,727 products | Easy | MVP |
| **Košík** (`www.kosik.cz`) | ✅ Pass | `/api/front/product/slug/{slug}` JSON | 20,001 in `_01.xml` (more in `_02`) | Easy | MVP |
| **Lidl** (`www.lidl.cz`) | ✅ Pass | JSON-LD inline + gzipped sitemap | 12,383 SKUs (heavily non-food / weekly Aktion) | Easy, but **food coverage thin** | Phase 2 |
| **Billa** (`www.billa.cz`) | 🟡 Soft pass | Nuxt SSR `__NUXT_DATA__` + sitemap | 13,162 product URLs | Medium (custom Nuxt-payload deref parser) | Phase 2 |
| **Penny** (`www.penny.cz`) | 🟡 Soft pass | Same Nuxt platform as Billa | Sitemap looks limited (~50–100 product URLs visible) | Same parser as Billa once written | Phase 2 |
| **Kaufland** (`www.kaufland.cz`) | ❌ Fail | Cloudflare 403 on plain curl | unknown | Hard (would need headless browser + residential proxies) | Defer |
| **Globus** (`www.globus.cz`) | ⚠️ ToS issue | `robots.txt` explicitly disallows every per-store product path | unknown | Skip on principle | Skip |
| **Albert** (`www.albert.cz`) | ❌ Out | Online shop terminated 23 Dec 2025; replaced by Wolt + foodora partner pickup | n/a | n/a | Drop |

---

## Detailed findings

### Tesco — `nakup.itesco.cz` ✅
- **Robots.txt:** explicit Sitemap: `https://nakup.itesco.cz/sitemaps/cs-CZ/groceries/products-index.xml`. Disallows search-result and login URLs only; product URLs explicitly allowed.
- **Sitemap structure:** sitemap-index → 4 sub-sitemaps × 5000 product URLs = ~20k SKUs minimum.
- **Product URL pattern:** `https://nakup.itesco.cz/shop/cs-CZ/products/{numeric_id}`
- **Per-product data:** `<script type="application/ld+json">` block contains a Product entity with name, sku (= URL id), **gtin13** (real EAN, e.g. `00000000029339`), description, image, brand, aggregateRating, offers (price, currency, availability).
- **Currency bug worth noting:** offers reports `priceCurrency: "GBP"` but the price value is in CZK — has to be hardcoded as CZK in our normalizer.
- **CDN:** Akamai. No bot challenge observed.
- **EAN is the headline finding** — Tesco is the only CZ chain in this probe that exposes GTINs. That's a free cross-chain join key against future scrapers.

### Rohlík — `www.rohlik.cz` ✅
- **Robots.txt:** Allowlist for `ClaudeBot`, `GPTBot`, `OAI-SearchBot`, `Perplexity`, `ChatGPT-User`, `Google-Extended` etc — they're permissive to AI crawlers. Disallows `/regal/*` (specific section). Listed sitemap: `sitemap_products.xml`.
- **Sitemap:** 21,727 products. Largest assortment of any CZ chain. URL pattern: `https://www.rohlik.cz/{numeric_id}-{slug}`.
- **Per-product data:** clean JSON-LD `Product` block: name, description, image, sku (= URL id), brand (object), category (string), offers (price in CZK, currency, availability).
- **CDN:** Cloudflare, but did not block plain curl with browser UA.
- **No GTIN.** sku is internal.

### Košík — `www.kosik.cz` ✅
- **Robots.txt:** Disallows `/l*_c*` patterns (filter URLs); allows product canonical paths.
- **Sitemap index:** `products_01.xml` (20,001 URLs), `products_02.xml` (additional), `categories.xml`, `brands.xml`. Total likely 30–40k.
- **Product URL pattern:** `https://www.kosik.cz/p{id}-{slug}`
- **HTML page:** Vue SPA shell only ~6.6 KB, no inline product data.
- **API endpoint discovered in the JS bundle:** `https://www.kosik.cz/api/front/product/slug/{slug}` returns clean JSON: `breadcrumbs`, `product`, `categoryTree`, `returnableCarrier`. The `product` object includes id, name, cleanName, brand (id+name+url), price, recommendedPrice, percentageDiscount, isSale, unit, productQuantity (value+unit), pricePerUnit, mainCategory, image, countryCode, labels.
- **`breadcrumbs` give us full taxonomy hierarchy** for free — useful for category mapping.
- No auth, no cookies needed.

### Lidl — `www.lidl.cz` ✅ (with caveat)
- **Robots.txt:** Disallows `/cqe/*`, search and offset-based URLs.
- **Sitemap:** indirect. `https://www.lidl.cz/static/sitemap.xml` is a sitemap-index pointing to `https://www.lidl.cz/p/export/CZ/cs/product_sitemap.xml.gz` — gzipped, 12,383 product URLs.
- **Product URL pattern:** `https://www.lidl.cz/p/{slug}/p{id}`
- **Per-product data:** JSON-LD `Product` with sku, name, image, brand, offers (price, currency, availability).
- **Caveat: Lidl's CZ catalog is heavily skewed to non-food** — weekly Aktion with sports goods, garden tools, fashion, electronics. Of the 12k SKUs, the *grocery* slice is much smaller. Need to filter against grocery categories or accept that Lidl shows up as patchy on food searches.
- **CDN:** myracloud. No challenge observed.

### Billa — `www.billa.cz` 🟡
- **Robots.txt:** points to `https://www.billa.cz/sitemap.xml` (1.4 MB).
- **Sitemap:** 15,596 URLs total. Of those: **13,162 product URLs under `/produkt/`** — that's the actual catalog.
- **Product URL pattern:** `https://www.billa.cz/produkt/{slug}-{id}` where the trailing 8-digit ID is the chain-internal sku (e.g. `82316087`).
- **Per-product data:** Vue/Nuxt 3 SSR. The page is rendered server-side; `<script id="__NUXT_DATA__">` contains the full Nuxt payload as a flat array (~408 KB) with reference indices. JSON-LD blocks exist but parse poorly.
- **Verified:** can extract `name`, `sku`, `productId` (UUID), `slug`, `brand` (object), `category` (string), `parentCategories`, `amount`, `packageLabel`, `descriptionShort`, `images`, and a `price.regular` block. The price values themselves are nested via deeper refs and need a recursive resolver.
- **Implication:** scraping Billa needs a small Nuxt-payload deref utility (~1 day). Once written, the same code will extract Penny products too.

### Penny — `www.penny.cz` 🟡
- **Same Nuxt 3 platform as Billa** (REWE shared front-end). Server: `istio-envoy`. Same product object shape (`amount`, `packageLabel`, `category`, `parentCategories`, `productId`, etc.) verified on a sample product page.
- **Product URL pattern:** `https://www.penny.cz/products/{slug}-{id}` (note: `/products/`, plural, vs. Billa's `/produkt/` singular).
- **Sitemap concern:** the public `/sitemap.xml` only lists ~50 visible product URLs out of 777 total — most of the sitemap is recipes (338) and category pages (45). Either Penny doesn't publicly list its full SKU catalog in the sitemap, or the catalog is genuinely smaller (Penny is a discount format with a narrower assortment than Billa). Need to enumerate via category pages instead.
- **Once Billa parser is built, Penny is essentially free** — same code, different URL prefix.

### Kaufland — `www.kaufland.cz` ❌
- **Plain curl with browser UA returns HTTP 403** (Cloudflare challenge). `cf-ray` header present, server `cloudflare`.
- This is the load-bearing failure for the original "MVP = 4 chains" plan. Without headless browser + residential proxies, Kaufland is not scrapeable from a single VPS.
- Two paths forward:
  1. **Defer Kaufland** entirely until v1 is shipped, then evaluate.
  2. **Use a different intake** — Kaufland sometimes co-publishes pricing via Košík (Košík has a 2020 partnership). Verify: do products on Košík include a `kaufland` flag or origin field?
- Cost of going the headless route: a Playwright + proxy setup costs €10–€30/month minimum and adds significant maintenance burden. Not worth it for one chain in v1.

### Globus — `www.globus.cz` ⚠️
- **Robots.txt explicitly disallows every per-store product path:** dozens of lines like `Disallow: /praha-cakovice/hypermarket/*/p/`, one per Globus store.
- This is a clear "do not scrape products" signal. The site's HTML *can* be retrieved (200 status, Nuxt payload present), but doing so against the operator's stated wishes raises ToS and reputational risk that's not justified for a 2% market-share chain.
- **Skip.** Re-evaluate only if Globus changes their stance or if a journalism use-case explicitly requires their data.

### Albert — `www.albert.cz` ❌ (direct) → Wolt/foodora 🟡
- **`nakup.albert.cz` does not resolve (NXDOMAIN).**
- The `/albert-online` page confirms: **"k 23. prosinci 2025 skončila služba Albert Online"** — Albert's direct e-shop terminated 23 December 2025.
- Albert now routes customers to **Wolt** (`wolt.com/cs/discovery/albert`) and **foodora** (`foodora.cz/chain/ch3dr`) as third-party delivery platforms.
- Direct scraping is **not possible** anymore.
- Indirect via Wolt/foodora is **possible but limited and lower quality** — see below.

### Wolt as a backdoor for Albert (and others) 🟡
- `wolt.com/cs/discovery/albert` returns 200 and lists multiple Albert venues per city.
- Each venue page (e.g. `wolt.com/cs/cze/prague/venue/albert-vinohradska`) renders successfully and exposes menu items + prices in the browser.
- **Direct API access is gated.** `restaurant-api.wolt.com/v3/venues/slug/{slug}` returns HTTP 410 with `{"msg": "We've updated the Wolt app! ... please go to the App Store and download the latest update.", "error_code": 430}`. The web app must be passing a versioned `User-Agent` or `client-id` header that we haven't yet identified.
- Reverse-engineering the actual headers takes more time than allocated for Phase 0. A spike of 1-2 days could likely solve it.
- **Quality caveats** even if access works:
  - Wolt data is **per-store** (one "venue" per Albert location). Each Prague venue has its own SKU set and pricing — cross-store reconciliation would be a substantial extra step.
  - **Assortment is limited** — Wolt is a convenience-delivery format. Many of the ~tens-of-thousands of SKUs in a real Albert store don't appear in the Wolt menu.
  - **Pricing may differ from in-store prices** (delivery markup, platform fees baked into list price).
  - These three together mean Wolt-via-Albert is *not equivalent* to the direct Albert catalog Heisse-Preise had access to in Austria.

### foodora — also gated ❌
- `foodora.cz/chain/ch3dr` returns HTTP 403 on plain curl. Same anti-bot story as Kaufland.
- Robots.txt is permissive, but the actual server-side gate isn't.

### Recommendation on Wolt/foodora
**Don't include in MVP.** The combination of (a) per-venue fragmentation, (b) limited assortment, and (c) potentially-distorted pricing means data quality is fundamentally worse than direct e-shop scrapes. Mixing it into the same dataset as Tesco/Rohlik/Kosik would mislead users about what "Albert prices" actually mean.

Reconsider in Phase 3 if there's user demand for "what's available right now via delivery" as a *separate feature* from "what does X cost in store" — they're really two different products.

---

## Revised market-coverage estimate

Original plan target: ~80% of CZ grocery sales by volume.

Tractable set after probe (Tesco + Rohlík + Košík + Lidl + Billa + Penny):
- Lidl ~13% (largest by share, but only weekly food in scope)
- Billa + Penny (REWE) ~7% combined
- Tesco 3.1%
- Rohlík ~1% (online native, growing)
- Košík ~1% (online native)

**Effective coverage: ~25%.** The big miss is Kaufland (~9%) and Albert (~5.5%). Together that's ~14.5% of market unreachable from this probe.

**Implication for the plan:** the original "80% coverage" framing was over-optimistic given how much of the CZ market sits behind Cloudflare or has shut down its online shop. We are still useful for cross-chain price *comparison* (especially among the easy-pass chains), but we will need to be honest in the UI: "Tesco, Rohlík, Košík + 3 others" is not "all of Czech retail."

## Recommended MVP composition

Drop Albert (impossible) and Kaufland (defer). MVP becomes 3 chains:

1. **Tesco** — easy, full grocery, has EAN.
2. **Rohlík** — easy, biggest catalog.
3. **Košík** — easy, second pure-online.

Three chains × clean APIs is enough to:
- Validate the canonical schema, the unit/quantity parser, and the name-similarity sort against real Czech text.
- Build cross-chain comparisons (Rohlík vs. Košík is the obvious pair: both online-native, similar assortment).
- Test maintenance cadence honestly before adding more.

Phase 2 adds Lidl + Billa + Penny (one Nuxt parser handles both REWE chains).

Phase 3 revisits Kaufland with whatever tooling we've matured by then.

## Open follow-ups

1. **Verify Kosik `/api/front/product/slug/` rate limits.** Probably not unlimited; need to find the actual ceiling before writing a daily 30k-request scraper.
2. **Find Lidl food-only category IDs** so we don't ingest 8k SKUs of garden tools and lawn furniture.
3. **Build a Nuxt payload deref utility** as a shared library — used by Billa and Penny scrapers in Phase 2.
4. **Re-probe Kaufland** monthly via Cloudflare-bypass alternatives (residential proxy trial, timing variance) before committing to Playwright.
5. **Quietly verify Tesco, Rohlik, Kosik response times under repeated load** — a single curl tells us nothing about being a polite daily client. Run a 100-request burst from one IP and watch for soft-throttling.
