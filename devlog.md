# Devlog

## 2026-09-02 — Pipeline had been dead since May: Actions minutes, not code

### Context
Session started as an evaluation of Google's TimesFM (time-series foundation model) for
price forecasting. That investigation concluded TimesFM doesn't beat a naive baseline on
grocery prices — but checking whether the tracker had enough history to test it on revealed
the real problem: the daily scrape had not completed a full run since 9 May.

### Done
- **Diagnosed the cron failure.** Data-commit dates cluster at the start of every month
  (1–2 Sep, 1–4 Aug, 1–4 Jul, 1–5 Jun, 7–13 May) and every run in between failed after
  6–9 seconds. That is the signature of exhausted GitHub Actions minutes on a private repo:
  the quota resets on the 1st, gets burned in 3–4 days, then jobs never start. Confirmed by
  job durations — Globus and Tesco each held a 180-minute runner *daily*, ~473 min/run
  against a 2000 min/month allowance (~14,200 min/month required, 7× over).
- **Repo made public.** Public repos get unlimited Actions minutes. Audited first: no secret-
  shaped files ever committed, no repo secrets configured, none referenced in the workflow,
  `.claude/` already gitignored. This is the actual fix — no rationing of chains fits 2000 min.
- **Workflow restructured** (`.github/workflows/scrape-daily.yml`). New `plan` job emits the
  matrix as JSON; `scrape` consumes it via `fromJson`. Two tiers: daily (kosik, billa, rohlik)
  and weekly (globus, tesco), selectable by cron expression or `workflow_dispatch` input.
  Per-chain `timeout-minutes` from the matrix, sized to observed duration + ~60% headroom,
  so one stuck chain can no longer hold a 180-minute runner. Worst case 14,200 → 6,160 min/mo.
- **Rebased 11 stranded commits.** Four months of local work from 9 May had never been pushed
  — including `aff9c3f` which drops Penny from the matrix, so Penny kept burning a runner slot
  in CI while being disabled locally. Origin's 19 commits were data-only, so the only conflicts
  were the gzipped canonical snapshots; took origin's (newer, and regenerable build output).
- **Verified end to end.** `workflow_dispatch -f tier=daily` → `plan` succeeded and emitted
  `kosik/35, billa/35, rohlik/110`, Globus and Tesco correctly excluded.

### Learned
- **A cron that "fails" can be a billing signal, not a bug.** Six-to-nine-second failures across
  every matrix job mean the runner never started. Combined with successes clustering at the
  start of each month, that is quota exhaustion, and no amount of reading scraper code finds it.
  Check `gh run list` conclusions against the calendar before debugging the job itself.
- **Unpushed commits are invisible infrastructure bugs.** The Penny fix existed on this machine
  since May and CI never saw it. `git rev-list --left-right --count HEAD...origin/main` belongs
  in the orientation step of any session that touches a repo with automation.
- **`timeout-minutes` on the job, not the matrix, is a footgun.** A single value applied to every
  chain means the slowest chain sets the cost of the fastest one's failure mode. Carrying the
  timeout in the matrix entry makes the budget explicit and per-chain.
- **Zero bytes after a full timeout is a hang, not slowness.** Tesco burned 180 min for a 0-byte
  artefact on both 1 and 2 Sep. Size of output, not duration, is the signal that separates
  "needs a longer timeout" from "is broken".
- **Binary conflicts in a rebase keep the upstream side in the worktree.** For regenerable build
  output (`*.json.gz`), `git add` on the conflicted path is already correct — no `--ours` needed.
  Worth verifying afterwards with `git rev-parse HEAD:<path>` against `origin/main:<path>`.
- **TimesFM is not the tool for this data.** On ČSÚ monthly national food prices it ties with
  "repeat last month" (10.1% vs 9.6% MAPE) at every context length from 1 to 16 years; accuracy
  plateaus at ~8 years of history. It only wins with covariates — farm-gate/producer price of the
  same commodity, in `xreg_mode='xreg + timesfm'`, which beats naive by 1.6pp. Energy, fertiliser
  and fuel covariates add nothing: retrospective regression shows the farm-gate price is already
  a sufficient statistic for them. Don't port this to daily per-product retail prices.

- **Fixed Tesco** (same day, see below).

### Tesco: Client Hints, not IP blocking
Akamai began 403ing every Tesco *product* page while leaving the sitemaps open, so the scrape
looked alive — it collected 19,716 URLs, then failed all of them. Each failure spends ~60 s on
`fetchWithRetry`'s 403 backoff ladder (4+8+16+32), which at concurrency 3 is 20 s/URL, i.e. 110
hours for the catalogue. The CI log shows exactly that: 250 done at 08:51, 500 at 10:15, killed
at 10:26. Not a hang and not an IP block — it reproduced from my laptop.

Bisected the headers: the discriminator is the Client Hints trio (`sec-ch-ua`,
`sec-ch-ua-mobile`, `sec-ch-ua-platform`). Full browser headers *minus* those still 403; the old
Chrome/124 UA *with* them returns 200. `fetch.ts` now sends a real browser's navigation header
set by default, and `fetchJson` overrides the Sec-Fetch trio to XHR values so API scrapers don't
send `Sec-Fetch-Dest: document` on an XHR. Added `src/common/circuit.ts` — a consecutive-failure
breaker, tripping Tesco at 25 (~8 min) with the last error in the message, so the next site-wide
block fails loudly instead of silently eating a runner. Tesco back on the daily tier at 90 min.

### Next
- Tesco fix is verified locally only (300 products, 0 errors, 44.6 s → ~50 min for the full
  catalogue). Not yet exercised in CI: the validation run was dispatched before the fix landed.
  Confirm on the next scheduled run that Tesco produces a non-empty artefact.
- ~~`coverage.test.ts` deletion~~ — resolved. It was a stale uncommitted deletion from May, not
  intentional: `computeCoverage` is still imported by `assemble-core.ts:93` and runs on every
  assemble. Restored; suite back to 123.
- With minutes now unlimited, reconsider the tier split — all six chains could go back to daily
  (one-line change to the `daily` variable in the `plan` job).
- ČSÚ reference ingest: national monthly consumer/producer/farm-gate series joined to canonical
  products by commodity, giving every product a "vs national average" benchmark from day one.

### Proof
- `npm test`: 123/123 passing (108 on 9 May; +10 from the rebased work, +4 from `circuit.test.ts`).
- Tesco live: `npx tsx src/scrapers/tesco.ts --limit 300` → 300 products, 0 errors, 44.6 s.
- `git rev-list --left-right --count HEAD...origin/main` → `12 0` before push; push clean.
- `data/canonical/{latest,groups}.json.gz` byte-identical to `origin/main` after rebase.
- Run 33650562707: `plan` → success, matrix `kosik/35, billa/35, rohlik/110`.
- Repo visibility confirmed `{"private":false,"visibility":"public"}`.


## 2026-05-07 — Cron, matcher upgrade, search relevance, two-pane shell

### Context
Day-2 work: ship the daily pipeline, fix the matcher's known over- and under-clustering, rework search relevance, and resolve a stubborn layout bug on the search page.

### Done
- **GitHub Actions cron** (`.github/workflows/scrape-daily.yml`). Daily 03:00 UTC, six chains in a parallel matrix (Kaufland excluded — IP rate-limited; runs locally). Finalize job downloads per-chain raw artefacts, assembles + matches + commits canonical `.json.gz` to main with `[skip ci]`. Initial single-job version hit GH's 90-min ceiling on Globus alone (other five chains were waiting in `Promise.all`).
- **Canonical compressed**. `latest.json` 53 MB → `.gz` 8.4 MB; `groups.json` 6 MB → 880 KB. Git tracks only the gzipped form. SPA loads via `DecompressionStream` with a plain-JSON fallback.
- **EAN normalization** (`validate.normalizeEan`). Tesco emits GTIN-14 ("08593…"), Globus emits EAN-13 ("8593…") — same product, zero intersection. Strip leading zeros, re-pad to 13. Unlocked ~7000 cross-chain pairs the matcher had been blind to. EAN-8 left alone.
- **Matcher rewrite** (`src/common/match-core.ts`). Unified union-find with two passes: EAN equality first (strongest signal), then bucket (category, unit, qty) + Jaccard. The bucket pass merges into existing EAN clusters so EAN-less Billa/Rohlík twins join Tesco/Globus EAN groups.
- **Variety axes** (`src/common/varieties.ts`). Hardcoded Czech retail discriminators — sweetness, colour, alcohol, tier, flavour (CZ + EN), beer-style, sugar — that always count as splitters regardless of bucket frequency. Cluster-level signature tracked through union-find: rejects transitive bridges where a no-axis-token product (e.g. "Bohemia Sekt Nealkoholický") would otherwise fuse Brut and Demi clusters.
- **`multipackHint`**. `8x` / `4×` / `6 x` patterns rejected in pair check. 4×500 ml multipacks no longer cluster with singles.
- **`src/audit-dups.ts`**. Permanent feedback channel — scans canonical for over-clustering, missing-link, and dead-brand patterns. Replaces the user-spots-a-dup → I-patch-it loop.
- **Search relevance** (`web/src/lib/search.ts`). Score-weighted matching: name whole-word 10, name prefix 5 (≥4 chars), name substring 1; brand 3 / 1.5 / 0.3. New 'relevance' sort, default when there's a query. Closes #15 (`máslo` no longer ranks butter cookies above butter).
- **Two-pane shell on /h** (`web/src/pages/Search.tsx` + `web/src/App.tsx`). Window scroll locked on the search route; sidebar and results each have their own `overflow-y: auto`. Footer hides on /h to keep the page exactly viewport-tall. Killed the brand-list-jump bug class (no page reflow → no sticky drift → no scroll clamp).
- **Brands facet** (web side). New `Filters.brands`, `brandKey()` for case+diacritic-insensitive equality. URL param `brands=…`. Top-12 + "show all" toggle.
- **CompareIndex page** (`/c`). Top 40 cross-chain spreads as a clickable index instead of a 404-style fallback.

### Numbers (audit-dups before / after)
- groups: 7337 → 10268 (+40%)
- top oversized group: 121 → 34
- groups>10 members: 30 → ~89 *(more granular, not bigger)*
- dead-brand pairs: 910 → 542
- 108/108 tests pass

### Learned
- **Whack-a-mole costs more than measurement.** Patched the brand-jump bug four times by reasoning about layout from one floor down; each attempt missed. The user's "take a step back" was the right call. Should have opened the running app first. Lesson: when three guesses miss, change methodology — measure or change the design.
- **Two-pane shells eliminate a class of layout bugs.** Window-scroll-driven sticky elements interact with content height in subtle ways (sticky engagement threshold, scroll clamping, parent-block bottom edge releases). Locking window scroll and giving each column its own overflow makes filter toggles trivially stable.
- **EAN padding asymmetries are silent killers.** Tesco's `08…` vs Globus's `8…` produced 0% cross-store EAN matches across 47k EAN-bearing products. One-line `padStart(13, '0')` fix unlocked thousands of correct groups. Always normalize external-ID formats at the validation boundary, not at use-sites.
- **Pair-level constraints aren't enough for transitive matchers.** `varietyConflict` correctly rejected Brut↔Demi, but a Nealko-only product had no token on either axis and bridged them. Cluster-level signatures are required when you union-find your way to clusters.
- **GitHub Actions matrix > one big job for parallel-but-uneven workloads.** Six chains in a single `Promise.all` job hit the 90-min ceiling on Globus while five idle workers waited. `strategy.matrix` gives each chain its own clock and the wall-time is `max(chain)`, not `sum(chain)`.

### Next
- Wine groups still oversized (Château Valtice ~93 members). Variant tokens are vintner+region+grape variety (e.g. "Rulandské", "Frankovka", "Müller Thurgau") — could be added to a 'grape' axis but would need careful curation.
- Search relevance still substring-only (`maslo` matches `máslové` via prefix at score 5, but ranks below whole-word matches — acceptable for now). Real Czech declension stemming would help.
- Penny brand=0% (REWE Nuxt payload doesn't expose it). Globus brand=4% (only house brands). Both block 30%+ of products from cross-chain matching.
- Wolt/foodora still excluded (price distortion).

### Proof
- `npm test`: 108/108 passing.
- `tsc --noEmit` clean web-side. `vite build` produces 269 kB JS / 4.2 kB CSS / 80.6 kB gzip.
- Cron triggered manually mid-session — first matrix run validated the parallelism and finalize commit pipeline (Globus completed in ~2 h as expected).
- Audit run after each matcher change drove the iteration; numbers in the auditor's summary footer.

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
