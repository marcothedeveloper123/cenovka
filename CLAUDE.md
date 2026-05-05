# Czech grocery price tracker

Open-source non-commercial price tracker for CZ grocery chains, modelled on heisse-preise.io.

## Stack
- Node ≥22, TypeScript via `tsx`. ESM only.
- No frontend yet. No DB. Flat JSON files.
- `node --test --experimental-strip-types` for tests.

## Layout
- `src/scrapers/{tesco,rohlik,kosik}.ts` — per-chain entry points; each is thin and delegates parsing to a `*-map.ts` helper or `common/product-jsonld.ts`.
- `src/common/` — pure libraries (validate, quantity, jsonld, sitemap, fetch, assemble-core, coverage).
- `src/run.ts` — multi-chain runner; writes `data/raw/{chain}/{date}.jsonl`.
- `src/assemble.ts` — reads raw, diffs against prior canonical, writes `data/canonical/latest.json` and `metrics-{date}.json`.
- `src/report.ts` — pretty-print coverage + diff trend.
- `data/` is gitignored.

## Conventions
- Each scraper exports `scrape{Chain}(opts) -> Promise<ScrapeResult>` and has a CLI guard at the bottom: `if (import.meta.url === \`file://${process.argv[1]}\`) { ... }`. Lets the file be imported in tests without running `main`.
- Every source file has a co-named `*.test.ts` next to it (the project's quality-gate hook enforces this). Test bodies are tight; split into multiple test files when one grows over the FTA complexity cap of 50.
- All prices are in CZK. Tesco's JSON-LD reports `priceCurrency: "GBP"` — ignore it; hardcode CZK.
- Primary product key everywhere is `(store, id)`. Never use URL or name.
- Validation runs inline in scrapers via `cleanProduct()`. Don't add a separate "clean" directory unless storage of pre-clean output is needed for forensics.
- Don't host product images. Only hot-link to chain CDNs.

## Reusable patterns
- **JSON-LD extraction**: use `extractJsonLd(html)` + `findProduct(node)` from `common/jsonld.ts`. Walks `@graph` recursively.
- **Inline state extraction (Next.js / Nuxt)**: when JSON-LD is missing fields, look for them in inline hydration scripts. Rohlík's `textualAmount` is an example — single regex over the HTML body, no JSON parse needed.
- **Sitemap-first scraping**: prefer `robots.txt` → sitemap → product URLs. Don't iterate categories unless sitemap is incomplete (Penny is the known exception).
- **EAN validation**: `isValidEan()` does mod-10 checksum (GTIN-8/12/13/14). Rejects typo'd or padded EANs.
- **Pipeline idempotency**: every step must be safely re-runnable on the same date. `assemble` uses same-day correction (replace) vs. cross-day diff (prepend) for `priceHistory`.

## Don't
- Don't use `--no-verify` to bypass the quality gate.
- Don't drop disappeared products from canonical — mark `available: false` and keep history.
- Don't add Wolt/foodora to MVP. Per-venue fragmentation + price distortion makes the data semantically different from direct e-shop scrapes.
- Don't scrape Globus (robots.txt forbids products). Don't scrape Kaufland yet (Cloudflare 403; revisit only with headless browser + residential proxies).
