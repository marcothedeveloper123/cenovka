# Devlog

## 2026-05-06 — Web SPA: full pillar build-out

### Context
Foundational pillars (Search, Compare, Product detail) shipped earlier. Marco asked to expand the rest of the pillars from `docs/web-design.md` while Kaufland's full-catalog scrape runs in the background. No deploy yet.

### Done
- **Cart pillar (`/k`)** — `useCart` localStorage hook drives a list of items with qty steppers. Shared cheapest/priciest header strip, per-chain total sidebar (sorted by coverage then total — chains missing items fall to the bottom). Add-to-cart buttons live on Search rows and Product detail. URL-shareable: `?items=k1,k2*3` is parsed on first mount and merged into local cart, then stripped from the URL.
- **Favorites pillar (`/f`)** — `useFavorites` hook (already existed) wired to a star toggle on Search rows + Product detail. Page lists tracked products with cheapest snapshot, group spread %, and a "Porovnat →" link straight to Compare. Empty state pitches the feature.
- **Trends pillar (`/t`)** — Computes day-over-day price movers from each product's `priceHistory`. Falls back to a "data se sbírají" empty state when history depth < 2. Includes a basket-inflation strip (sum of cart's cheapest-per-day across history) — null when cart empty or history sparse. SVG sparklines per row.
- **Data + Export pillar (`/d`)** — Per-store stats table (count, available, brand%, EAN%, category%, median price) with traffic-light colour for coverage cols. JSON download links straight to `/data/*.json`; CSV is generated client-side via Blob (13 columns including `unit_price`/`unit_price_label`). Metadata block surfaces generatedAt + repo path + license.
- **About pillar (`/o`)** — Editorial layout: mission, methodology table (per-chain scrape technique), match algorithm summary, privacy stance, ODbL/MIT license. Ends with current dataset size + generation date.
- **Tweaks panel** — Fixed bottom-right drawer gated by `?tweaks=1` (existing `useTweaksEnabled` hook). Shows route, theme switcher (light/dark/sepia via `data-theme` attribute), dataset stats, per-store counts, localStorage state with destructive clear buttons (confirm() guarded).
- All routes wired in `App.tsx`. Hooks-of-rules violation in `Product.tsx` fixed (cart/fav hooks moved above the missing-product early return).

### Learned
- **Sharable cart via URL fragment + import-on-mount** beats round-tripping through a server. The `?items=...` is parsed once with a `useRef` guard, merged into existing localStorage cart (so the recipient doesn't lose their own items), then stripped via `history.replaceState` so a refresh doesn't re-import.
- **Empty-state-first pages aren't lipstick.** Trends with one day of data still feels useful when the empty state explains what's missing instead of showing a flat-line chart. Pattern: show structure even when data is sparse, but only when the structure carries information.
- **Per-chain coverage columns work better as percentages with a colour gate** (≥80 green, ≥40 ink-2, else red) than as raw counts. Lets the eye scan for gaps in a 7-row × 6-column table.
- **`flatMap` over `<Fragment>` for paired siblings in a CSS grid.** When you want each map iteration to emit two grid cells (label + value) you can't wrap in `<>` because Fragment doesn't accept a `key`. `.flatMap(x => [<a key/>, <b key/>])` keeps both keys honest.

### Next
- Search relevance bleed (open task #15): `maslo` → `máslové` substring fallback. Need declension stemming and score-weighted ranking.
- Wine/beer/energy-drink groups still over-cluster (80+ members) — variety-discriminator rule isn't catching all of them.
- Multipack normalization (`5×100g` parses as 100g, should be 500g).
- Penny brand still 0% — REWE Nuxt payload doesn't expose it; defer until we find another source.

### Proof
- `tsc --noEmit` clean across web; `vite build` produces 267 kB JS / 4.2 kB CSS / 80.6 kB gzip.
- All seven pillar routes resolve in `App.tsx` dispatcher: `/`, `/h`, `/c/`, `/p/`, `/k`, `/f`, `/t`, `/d`, `/o`.
- Tweaks panel only renders when `?tweaks=1` is in URL search (not hash) — verified in `useTweaksEnabled`.

## 2026-05-05 — Phase 0 probes through working pipeline

### Context
Fresh project. Goal: assess feasibility of a Heisse-Preise-style price tracker for Czech retail and, if viable, scaffold the smallest working pipeline.

### Done
- **Probe** of 9 candidate chains (Tesco, Rohlík, Košík, Lidl, Billa, Penny, Kaufland, Globus, Albert). Documented in `docs/probe-results.md`.
- **Verdict**: 3 viable for MVP — Tesco, Rohlík, Košík. Albert online shop terminated 23 Dec 2025; Kaufland behind Cloudflare 403; Globus robots.txt explicitly disallows products. Wolt/foodora as Albert backdoor: gated + per-store + price-distorted, not equivalent to direct e-shop data.
- **Plan + pipeline doc** at `PLAN.md`, `docs/pipeline.md`. Five-step pipeline: scrape → normalize → assemble → match → publish.
- **Scrapers**: Tesco (JSON-LD + EAN 95%), Rohlík (JSON-LD + textualAmount → qty 100%), Košík (`/api/front/product/slug` → qty 90%). All idempotent on re-run.
- **Validation**: EAN mod-10 checksum, price bounds, NBSP/zero-width hygiene, brand alias map, URL canonicalization (strips `utm_*`, `icid`, `gclid`, `fbclid`, `_ga`).
- **Assemble**: diff against prior canonical, reconstructs `priceHistory`, marks disappeared products unavailable instead of dropping. Idempotent same-day re-run.
- **Coverage report** with per-chain `% with quantity / brand / category / EAN / available`. Will form 30-day rolling trend once cron runs.
- **38 tests** across validate, EAN, quantity, jsonld, coverage, fetch, assemble-core, kosik-map.

### Learned
- **`textualAmount` is the magic field for Rohlík.** Their JSON-LD `Product` has no quantity, but the Next.js hydration payload has `"textualAmount":"1 l"` for every product. Single regex extraction lifted qty coverage from 11% to 100%.
- **Tesco's GTIN-13 is the only EAN source in CZ retail.** 95% coverage after validation rejected ~1% bad EANs. Cross-chain matching anchor for step 4.
- **Tesco JSON-LD reports `priceCurrency: "GBP"` while prices are CZK.** Hardcoded the currency override; do not trust the field across chains.
- **Quality-gate hook expects `foo.test.ts` next to `foo.ts`.** Refactoring without a co-named test file blocks the commit. Plan tests up front, not after.
- **FTA complexity cap is 50 (strict less-than).** Files at exactly 50 fail. Prefer extracting helpers into separate small files (e.g. `kosik-map.ts`) over inlining.
- **`import.meta.url === \`file://${process.argv[1]}\`` guard** lets CLI scripts be importable in tests without running their `main()`.

### Next
- Cron the daily cycle for ~1 week (no code; see `docs/pipeline.md` §recommended-sequence).
- Tesco gaps: qty 77% (extract from URL slug or page text), category 0% (breadcrumb scrape, JSON-LD doesn't carry it).
- Then step 2 (normalize) — cross-chain category mapping using a hand-built canonical taxonomy.

### Proof
- `npm run smoke` (20 products/chain) and `npm run scrape:all` (full catalog) both run clean.
- `npm test` (Node `--test`): 38/38 passing.
- `npm run assemble && npm run report` produces a coverage table on stdout.
- Verified end-to-end: simulated next-day price change → priceHistory grows correctly with newest-first ordering; simulated chain outage → products carried forward as `available: false`; restoration → flips back.
