# Czech grocery price tracker — Plan

Working name: **levne-ceny.cz** (placeholder; see Open Questions §10).
Reference: heisse-preise.io / [badlogic/heissepreise](https://github.com/badlogic/heissepreise).

---

## 1. Goal

A non-commercial, open-source, Czech-language web app that lets a Czech consumer:

1. Search products across all major CZ grocery chains in one place.
2. See current price + full price history per product.
3. Compare like-for-like across chains (normalized units, fuzzy name match).
4. Build personal carts and watch their cost over time.
5. Download the underlying dataset (JSON/CSV) for journalism / research.

The tool wins if a Czech shopper can answer *"is butter cheaper at Albert or Kaufland this week, and how has it moved since spring?"* in under 10 seconds, on phone, with no signup.

## 2. Non-goals

- Not a deal-of-the-day / leaflet aggregator (Kupi.cz, Akcniceny.cz already do that).
- Not a shopping/checkout/loyalty integration.
- Not a recipe / nutrition app.
- Not multi-country in v1 (CZ only; Slovakia would be the obvious next step but is out of scope).
- No accounts, no email, no analytics. Carts live in `localStorage`.

## 3. Strategy: fork-then-rewrite vs. greenfield

**Decision: greenfield, but study the AT codebase first.**

Why:
- The template repo ([heisse-preise/heisse-preise-template](https://github.com/heisse-preise/heisse-preise-template)) is documented "TBD" — no real abstraction yet.
- The AT repo is a mature working system but tightly coupled to AT chains, AT category mapping, AT date conventions, and German-language UI strings.
- Czech-specific concerns (declension in product names, diacritics in search, koruna formatting, CZ category taxonomy) are pervasive enough that lifting the AT scrapers and adapting them is cheaper than abstracting them generically.
- Boring stack matches the AT one anyway: Node/TS server + Vite frontend + flat JSON files. No new infrastructure to learn.

We re-use:
- The canonical product schema (with CZ-relevant tweaks).
- The price-history compression strategy.
- The unit-normalization parsers.
- The name-similarity sort algorithm.
- The cart-as-URL sharing pattern.

We do not re-use:
- Per-chain scrapers (every CZ chain is different from every AT chain).
- Category taxonomy (build a CZ one from scratch, mapping each chain).
- UI copy.

## 4. Architecture

```
┌─────────────────┐     daily cron     ┌──────────────────────┐
│  scraper jobs   │  ────────────────► │  raw/<chain>-<date>  │  (one JSON file per chain per day)
│  (one per chain)│                    └──────────────────────┘
└────────┬────────┘                              │
         │                                       ▼
         │                              ┌──────────────────────┐
         │                              │   normalizer step    │  (parse units, map categories,
         │                              │                      │   merge into canonical)
         │                              └──────────┬───────────┘
         │                                         ▼
         │                              ┌──────────────────────┐
         │                              │  canonical/latest    │  (single big JSON, ~50-100 MB)
         │                              │  canonical/<date>    │  (daily snapshot for diff)
         │                              └──────────┬───────────┘
         │                                         ▼
         │                              ┌──────────────────────┐
         │                              │   static site build  │  (just serves canonical JSON +
         │                              │   (Vite, TS, Tailwind│    SPA — all search/sort/chart
         │                              │   no backend at runtime)│   runs in browser)
         │                              └──────────────────────┘
         │                                         ▼
         └──────────────────────────────►   levne-ceny.cz
```

Key properties:
- **Static site at runtime.** No DB query path. Browser downloads canonical JSON once (compressed, served via CDN) and does all search/sort/chart locally with AlaSQL — same as AT.
- **Scraper failures are isolated.** If Lidl breaks for a week, the dataset still ships with the other 9 chains.
- **Diff-friendly storage.** Daily canonical snapshots live in `data/canonical/YYYY-MM-DD.json`; price history is reconstructed from the chain of snapshots and persisted into `latest-canonical.json` to avoid the browser pulling all of history.

## 5. Data model (canonical product)

```ts
type Product = {
  store: 'albert' | 'lidl' | 'kaufland' | 'billa' | 'penny' | 'tesco' | 'globus' | 'rohlik' | 'kosik' | 'coop'
  id: string                    // chain-internal ID; primary key is (store, id)
  name: string                  // normalized: brand prefix where available
  category: string              // canonical CZ category (see §6)
  price: number                 // CZK, current
  unit: 'g' | 'ml' | 'ks' | 'wash'
  quantity: number              // in `unit`
  isBio: boolean
  isBudget: boolean             // private discount label (Clever, Albert Quality, K-Classic, etc.)
  isWeighted: boolean
  available: boolean
  url: string                   // canonical product page
  priceHistory: Array<{ date: string; price: number }>   // sorted, newest first
}
```

Decisions:
- **No EAN.** Most CZ shops don't expose it (same as AT). Cross-chain match is fuzzy name+quantity.
- **CZK as integer halers (×100)?** No — keep as float, follow AT precedent. Browsers handle 2-decimal CZK fine.
- **Diacritics in names** kept verbatim. Search indexes both folded and original.

## 6. Categories

Build one canonical taxonomy (~30 top-level categories) mirroring [the AT one](https://github.com/badlogic/heissepreise/blob/main/site/model/categories.js). Each chain's native categories get a hand-mapped lookup table. Unknowns fall back to name-similarity to already-categorized products. This is a one-day project per chain at first, then long-tail maintenance.

## 7. Per-chain plan

Priority is by (market share × scraping tractability). Numbers below are best-guess from research; *all need verification by an actual probe before being committed to a phase*.

| # | Chain | Share | Likely surface | Difficulty (guess) | Phase |
|---|---|---|---|---|---|
| 1 | Albert | 5.5% | nakup.albert.cz JSON API | Medium | MVP |
| 2 | Kaufland | ~9% | kaufland.cz product JSON | Medium | MVP |
| 3 | Lidl | largest | lidl.cz weekly leaflet + lidl-shop.cz | Hard (mostly promo) | MVP |
| 4 | Tesco | 3.1% | nakup.itesco.cz | Likely easy (mature e-shop) | MVP |
| 5 | Billa | 3.2% | shop.billa.cz | Medium | Phase 2 |
| 6 | Penny | 4.1% | penny.cz (Pilsen-only delivery, but full catalog browsable) | Medium-Hard | Phase 2 |
| 7 | Rohlík | online-only | rohlik.cz (well-structured API per MCP server) | Easy | Phase 2 |
| 8 | Košík | online-only | kosik.cz | Easy-Medium | Phase 2 |
| 9 | Globus | 2.0% | shop.globus.cz | Unknown | Phase 3 |
| 10 | COOP | 1.5% | fragmented, mostly leaflet | Hard | Skip v1 |

Each scraper is a small module exporting `fetchAll() => Promise<RawProduct[]>` plus `normalize(raw) => Product`. Run on a daily cron, write `raw/<chain>-<YYYY-MM-DD>.json`.

## 8. Phases

### Phase 0 — Probe (1 week)
- Hit each Tier-1 chain manually with curl/devtools. Document:
  - Whether there's a JSON API or if we have to parse HTML.
  - Whether the response is paginated, gated, rate-limited, Cloudflare-shielded.
  - Approximate full-catalog size.
  - Whether quantities/units are structured or only in the name string.
- Output: `docs/scrapers/<chain>.md` per chain, plus a go/no-go per chain.
- **Decision gate**: if 2+ Tier-1 chains are gated behind aggressive bot-detection, the project's effort goes from "weeks" to "months" — pause and reconsider whether to use Playwright + residential proxies (much higher ongoing cost) or scope down.

### Phase 1 — MVP (3-4 weeks after Phase 0)
- 4 scrapers (Albert, Kaufland, Lidl, Tesco). Each running daily, writing `raw/`.
- Normalizer pipeline producing `canonical/latest.json`.
- Static SPA: search, filters (chain, bio, budget, category, unit/quantity), result list with price-history bars, line chart, JSON/CSV export.
- Czech UI copy. Brand/visual identity TBD but minimal.
- Domain registered, hosted on Cloudflare Pages or similar (see §9).
- Internal-only — not announced. Run for 4 weeks of daily snapshots before any public announcement, to:
  - Catch scraper drift.
  - Build enough history (~30 days) that price-change features are meaningful.
  - Verify legal posture (see §10).

### Phase 2 — Expansion (4-6 weeks)
- Add Billa, Penny, Rohlík, Košík.
- Carts feature (URL-shareable, localStorage).
- Advanced search (`!` AlaSQL prefix, same as AT).
- "Preisänderungen" / Změny cen page.
- Diff view: today vs. yesterday across all products.
- **Soft launch**: post on r/czech, r/programming, Hacker News. No paid promotion.

### Phase 3 — Long tail
- Globus, COOP, Norma if relevant.
- Backfilled history if any open dataset exists (Czech statistical office? Dossier-equivalent?).
- API endpoints for journalists.
- Metabase-style charting if there's user demand.

## 9. Hosting / ops

| Component | Plan |
|---|---|
| Scraper jobs | A small VPS (Hetzner CX22, ~€4/mo) running cron + Node. Single host fine for v1. |
| Storage | Same VPS, flat JSON files in `/var/lib/prices`. Total <10 GB after a year. |
| CDN / static site | Cloudflare Pages (free tier). Build pulls latest `canonical.json`. |
| Domain | TBD; see Open Questions. |
| Monitoring | A simple "did the scraper produce >X products today" check + email-on-failure (Healthchecks.io free tier). |
| Backups | Daily rsync of `/var/lib/prices` to B2 or rsync.net. |

No accounts, no auth, no DB, no Redis, no Kubernetes. Same boring tech the AT version uses.

## 10. Open questions / decisions needed

1. **Domain name.** `levne-ceny.cz`? `prehled-cen.cz`? `cenovka.cz`? Need to confirm availability and check it doesn't infringe any existing trademark. Czech-native speakers should weigh in — connotations matter.
2. **Project name on GitHub.** Probably `prices-cz` or similar. Public from day one or private until Phase 2?
3. **Legal review.** ~1 hour with a Czech IP/competition lawyer before Phase 2 public launch. Specifically: ToS scraping risk per chain, image rights (we don't host images), database-rights / sui generis protection (CZ implements EU Database Directive — needs check), competition-law angle for cross-chain price publishing.
4. **Funding.** Self-hosted on Marco's bill, or set up an opencollective/donation page? Affects positioning ("non-commercial research project" works either way).
5. **Maintenance commitment.** Realistically how many hours/month? If <2, scrapers will rot and the site will become misleading. Need an honest answer before public launch.
6. **AT collaboration.** Reach out to Mario Zechner (badlogic) before starting? He'd likely be supportive — the template repo proves it. Could shortcut a lot of design questions.

## 11. First-week concrete actions

In order:

1. Set up the repo skeleton: `prices/{scrapers,common,server,site,data}` plus `.editorconfig`, `tsconfig`, `package.json`. No frameworks yet.
2. Write a one-page `docs/probe-template.md` listing the questions to answer per chain.
3. Probe Albert, Kaufland, Lidl, Tesco — devtools + curl, no code yet. Fill in `docs/scrapers/<chain>.md`.
4. Read the AT codebase end-to-end. Take notes on patterns to lift, things to skip.
5. Write a one-page LEGAL.md summarizing the AT precedent and the open CZ questions. Use it as input to the lawyer call in Phase 2.
6. Decide on domain (§10 Q1) and register it. Don't deploy yet — just hold the name.
7. Email Mario Zechner with a short note.

End of week 1: go/no-go decision on whether to proceed to Phase 1 build.

---

## Risks (ranked)

1. **Bot defense escalation.** If 2+ chains add Cloudflare/JS-challenges or rotating tokens, scraping cost balloons. Mitigation: probe early, scope down if needed.
2. **Maintenance burnout.** Scrapers break monthly. Without consistent attention, the site decays into a misleading historical artifact. Mitigation: automated freshness alerts; "last updated" prominent in UI; pull data offline if a chain is >7 days stale.
3. **Legal cease-and-desist.** Low probability based on AT precedent but non-zero. Mitigation: legal review pre-launch; non-commercial framing; respect robots.txt where possible without crippling coverage; never host product images.
4. **Name-similarity match quality on Czech declension.** "Máslo / másla / máslem" all refer to butter; product names mix nominative and genitive. Mitigation: test the AT name-similarity sort against a CZ sample early in Phase 0; consider a small Czech-stemming step if quality is poor.
5. **Single-VPS SPOF.** One host runs all cron jobs. If it dies for 24h we lose a day of snapshots forever. Mitigation: cheap, accept it. If it becomes load-bearing for journalism, add redundancy.

---

## Success criteria (12-week mark)

- 6+ chains scraped daily with <2 days of missing data per chain in the last 30 days.
- ~80%+ effective market coverage by sales volume.
- Site loads canonical dataset in <3s on Czech residential broadband.
- A search like "máslo >= 200 g" returns sensible cross-chain results.
- At least one Czech journalist or researcher has used the JSON/CSV export.
- The thing has a soul: a Czech consumer can land on it, search, and feel like it was made for them, not ported from somewhere else.
