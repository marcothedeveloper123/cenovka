# Devlog

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
