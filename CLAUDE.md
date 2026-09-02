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

## CI / pipeline
- **Check the calendar before debugging the job.** Data-commit dates clustering at the start of
  each month, plus 6–9 second job failures in between, means exhausted Actions minutes, not a
  broken scraper. `gh run list` conclusions against dates finds it in one command.
- **Carry `timeout-minutes` in the matrix entry**, not on the job. One shared value lets the
  slowest chain set the cost of every other chain's failure mode. A `plan` job that emits the
  matrix as JSON (`fromJson(needs.plan.outputs.matrix)`) makes the daily/weekly split and the
  per-chain budget explicit in one place.
- **Zero-byte output after a full timeout is a hang, not slowness.** Judge scrapers by artefact
  size, not duration, before reaching for a longer timeout.
- **Check `git rev-list --left-right --count HEAD...origin/main` when orienting.** Unpushed
  commits are invisible to CI; a fix that exists only locally is a fix that never shipped.
- **Binary conflicts during rebase already hold the upstream side in the worktree.** For
  regenerable build output (`data/canonical/*.gz`), `git add <path>` resolves correctly with no
  `--ours` needed. Verify with `git rev-parse HEAD:<path>` vs `origin/main:<path>`.

## Forecasting (settled — don't re-litigate)
- **TimesFM ties with "repeat last value" on grocery prices** at every context length from 1 to
  16 years, and accuracy plateaus around 8 years. It only beats naive when given the farm-gate or
  producer price of the same commodity, with `xreg_mode='xreg + timesfm'` (the other mode,
  `'timesfm + xreg'`, is dramatically *worse* than using no covariates at all).
- **Energy, fuel and fertiliser covariates add nothing.** Retrospective regression on 136 months
  shows the farm-gate price is already a sufficient statistic for the whole upstream chain;
  adding it explains +0.13 adjusted R² while energy and ag-inputs each contribute ≈0.
- **The benchmark is committed**: `research/timesfm/` has the scripts, the data and a README
  with every number below. Re-run it rather than re-deriving it from memory.
- **ČSÚ DataStat API**: `data.csu.gov.cz/api/dotaz/v1/data/sady/{kod}` returns JSON-stat 2.0, but
  serves only one default slice. Historical and alternate-frequency data lives behind *named
  selections* — find them via `api/katalog/v1/vybery`, then fetch
  `api/dotaz/v1/data/vybery/{vyberKod}?format=JSON_STAT`. The `data.csu.gov.cz/datastat/...` URL
  is the Angular shell, not data.

## Scraping / anti-bot
- **Client Hints are the discriminator on Akamai sites.** Tesco 403s a bare `User-Agent` +
  `Accept-Language` on product pages but returns 200 with `sec-ch-ua`, `sec-ch-ua-mobile` and
  `sec-ch-ua-platform` present. `fetch.ts` sends a full browser navigation header set by default;
  keep `sec-ch-ua`'s version in step with the Chrome version in `UA`. `fetchJson` overrides the
  Sec-Fetch trio to XHR values — a request claiming `Sec-Fetch-Dest: document` on an XHR looks
  like a browser lying about itself.
- **Sitemaps and product pages are protected separately.** Tesco's sitemaps stayed open the whole
  time its product pages were blocked, so URL collection succeeded and the crawl looked healthy.
  Probe an actual content page, not the index, when a scraper goes quiet.
- **Retry backoff turns a block into a silent burn.** Four retries at a 4 s base is ~60 s per
  URL; on a 20k-page catalogue at concurrency 3 that is 110 hours of failing. Wrap long crawls in
  `CircuitBreaker` (`src/common/circuit.ts`) so a systematic block trips in minutes and throws
  with the last error, rather than producing a zero-byte artefact at the timeout.

## TypeScript under `--experimental-strip-types`
- **Strip-only mode rejects any TS that needs code generation.** Parameter properties
  (`constructor(readonly x: number)`), enums, namespaces and decorators all fail at runtime with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` even though `tsc` accepts them. Declare the field and assign
  in the constructor body instead. `tsc --noEmit` will not catch this — the tests will.
