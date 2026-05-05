# Data pipeline

Pipeline for turning scraped pages into a canonical, queryable dataset. Five sequential steps; each idempotent on a given date; each writes to disk so a failure in step N never invalidates step N-1.

```
1. SCRAPE     per chain, daily          → data/raw/{chain}/{date}.jsonl
2. NORMALIZE  per chain                  → data/normalized/{chain}/{date}.jsonl
3. ASSEMBLE   merge + price-history     → data/canonical/latest.json
4. MATCH      cross-chain identity       → data/canonical/groups.json
5. PUBLISH    compress + ship to CDN    → served to the SPA
```

Each step is a small Node script. The whole thing reruns on a daily cron. Re-running the same date doesn't corrupt anything.

---

## 1. Scrape (built)

Per-chain modules in `src/scrapers/{chain}.ts` produce `Product[]` and write to `data/raw/{chain}/{YYYY-MM-DD}.jsonl`.

Currently running: **Tesco**, **Rohlík**, **Košík**.

Output shape: `Product` from `src/common/types.ts`.

---

## 2. Normalize (next)

Per-chain pass that fixes chain-specific quirks the raw scraper didn't:

- **Quantity backfill.** Rohlík names don't include qty (current coverage ~10%); pull it from description / OG meta / additional JSON-LD fields. Target 80%+.
- **Unit harmonization.** Košík sometimes returns `productQuantity` in usage units (e.g. *54 doses*) instead of mass/volume (e.g. *1.35 L*). When both are available, prefer the value parsed from the product name.
- **Availability flagging.** Products that come back as HTTP 200 but with no JSON-LD Product block (the 7 missing Rohlík hits in the smoke test) are out-of-stock or delisted, not bad data. Record them as `available: false`, don't drop.
- **Category mapping.** Each chain's native category string gets looked up in a hand-mapped table at `src/common/categories/{chain}.ts`. Unmapped categories fall through to `Unknown`. The canonical taxonomy lives at `src/common/categories/canonical.ts`.

Output: `data/normalized/{chain}/{date}.jsonl`. Same shape as raw, cleaned.

---

## 3. Assemble (load-bearing)

Merges every chain for a given date into one canonical file, *and* reconstructs price history.

```
diff(yesterday's canonical, today's normalized) ─┐
                                                  ├─→ today's canonical
yesterday's canonical priceHistory ───────────────┘    (history extended only on change)
```

Rules:

- Primary key is `(store, id)`.
- If today's price === yesterday's, `priceHistory` unchanged.
- If today's price !== yesterday's, prepend `{ date, price }` to `priceHistory`.
- If product is **missing today but present yesterday**, mark `available: false`, keep history.
- If product is **new today**, create entry with `priceHistory: [{ date, price }]`.

Output: `data/canonical/latest.json` — single file with the full state. The `priceHistory` array inside each product carries all history; no need for separate per-date archives unless we want point-in-time forensics.

This is also the step that produces metrics consumed by step 6 (observability):
- count of products changed (price up / price down)
- count appeared / disappeared today
- per-chain product counts vs. yesterday

---

## 4. Match (cross-chain identity)

Produces "logical products" — a butter is a butter regardless of which chain. Builds groups, doesn't mutate the canonical product list.

Three tiers, applied in order:

1. **EAN match.** Tesco exposes GTIN13 on ~96% of products. Any Rohlík/Košík product whose name+brand+quantity strongly suggests the same EAN gets joined to the Tesco product.
2. **Fuzzy name + quantity match.** Heisse-Preise's name-similarity algorithm, with a Czech preprocessing layer (diacritic folding + light stemming) so `máslo`/`másla` cluster correctly. Match requires `(unit, quantity)` agreement.
3. **Brand + quantity heuristic.** For private-label products like *Albert Bio rýže 500 g* — name varies, brand+qty is reliable.

Output: `data/canonical/groups.json` — an array of groups: `{ groupId, productKeys: [{store, id}, ...] }`. The SPA uses this for the "compare across chains" view. Groups are advisory; the canonical dataset is unchanged.

This is also where the §3 feasibility question (does Czech name-similarity hold up?) gets its real answer. If it doesn't, the whole cross-chain comparison feature is degraded and we need to invest in a real Czech NLP step or accept lower coverage.

---

## 5. Publish

- Gzip `data/canonical/latest.json` and `data/canonical/groups.json`.
- Upload to CDN (Cloudflare Pages bucket, R2, or B2 + bunny.net — whichever's chosen in §9 of PLAN.md).
- The SPA fetches one file once and does all search / filter / sort in the browser — same as Heisse-Preise. No backend at runtime.

---

## Orthogonal concerns

These bolt onto the pipeline; they aren't "step 6" because they run independently.

### Freshness check
After step 5, hit the published file from outside our infra and assert `today's date` is present. If not, page someone (Healthchecks.io free tier).

### Diff observability
Step 3 emits a small JSON of yesterday→today metrics. Trend it. Big jumps (e.g. Rohlík product count drops 70% overnight) almost always mean a scraper broke.

### Coverage observability
Per chain: % of products with quantity, brand, EAN, category. Trend daily. If Rohlík qty drops below 60%, something changed in their HTML and step 2 needs an update.

---

## Recommended sequence

Build in this order. Each step takes 1-3 days of focused work:

1. **Step 3 (assemble) skeletally.** Even without step 2, a single canonical file with `priceHistory` growing daily is what unblocks the UI, alerts, and exports. ~50 lines. **Do this first.**
2. **Cron steps 1+3** for one week. Validate the daily cycle actually holds before adding complexity.
3. **Step 2 (normalize).** Adds data quality but not new capability. Adds Czech-aware extraction for the chains that need it.
4. **Step 4 (match).** Only meaningful once step 2 lifts Rohlík quantity coverage — fuzzy match without quantity is misleading.
5. **Step 5 (publish)** once there's a UI to publish to. Until then, `data/canonical/latest.json` is fine to consume locally.

Skipping step 2 to do step 4 is the obvious-looking shortcut that bites — don't.

---

## Open questions

- **Where does `priceHistory` get truncated?** Heisse-Preise keeps full history back to 2017. For us, indefinite is probably fine until `latest.json` gets unwieldy (>50 MB compressed). At that point, push old history to a sidecar file.
- **Image hosting.** The plan is to *not* host product images (copyright + storage cost). The SPA can hot-link to chain CDNs, accepting that link rot will happen.
- **Schema versioning.** When we change `Product`, do we re-run all historical data, or version `latest.json`? Probably version it: `{ schema: 2, products: [...] }`.
