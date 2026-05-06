# Web design — what we want to show

Two parts: what we can do with the data right now (no UI), and the eventual web app.

---

## Part 1 — Analyses we can run today

With ~79k products on disk after the first full-catalog scrape, one-shot analyses are already meaningful and would inform design before we commit to building UI.

- **CZK/100g distributions per category, per chain.** Tells us "is Lidl actually cheapest for dairy, or just *feels* like it?"
- **Same-EAN spread (Tesco ↔ Globus).** Both expose EANs, so we can compute exact-match price differentials without waiting on the fuzzy matcher.
- **Cross-chain match yield.** Run `npm run match` against the full dataset. ≥1k groups → comparison feature is viable. <100 → name-similarity needs work.
- **Bio premium per category.** Filter products with "bio" in name/category, compare medians. Punchy chartable insight.
- **Penny ≟ Billa.** They share the REWE platform — are prices identical or do they segment? Quick test of pipeline correctness too.
- **Catalog overlap matrix.** What % of Tesco's catalog has a counterpart at Rohlík (by name + qty)? Sets realistic expectations for the comparison view.
- **Brand concentration.** Top brands by SKU count per chain reveals private-label share.

Each is a 50-line script. Ship as `npm run insights` printing top findings as a dashboard. **The outputs become the default content of the homepage.**

---

## Part 2 — Web design

### Audiences

1. **Cost-pressed shopper** — "where's mléko cheapest right now?" One search, one answer. No setup.
2. **Journalist / researcher** — basket inflation, cross-chain spreads, methodology you can cite. Wants exports.
3. **Power saver** — tracks a recurring shopping list, watches for drops, plans by week.

Serve those three and we serve everyone else by accident.

### Five pillars for v1

#### 1. Search (the front door)
A single box. Type `máslo`. Rows: name, qty, chain badge, price, CZK/100g, ▾ inline price-history bar chart (per HP — denser than a sparkline, readable on mobile), source link. Filters as a sidebar (chain, category, bio, available-only, qty range). Sort default: CZK/100g asc.

URL encodes everything → share = copy URL.

**Advanced query mode** (stolen from HP): a `!` prefix enters AlaSQL-style syntax — `!price < 50 and unit='g' and quantity >= 200 order by numPrices desc`. Power-user feature beloved by journalists; one weekend's work; ships in v1.

#### 2. Cross-chain comparison (the killer feature)
When a search row belongs to a match group, expand inline to show every chain's price for the *same logical product*. Highlight cheapest. Sortable by chain, CZK/per-unit, % drop today.

This is what differentiates from Kupi.cz / Akcniceny. The whole project lives or dies on whether this view is trustworthy. Match quality is the load-bearing investment.

#### 3. Trends (the science layer)
- **Per product**: 30/90/365-day price chart with chain badges on the line.
- **Per category aggregate**: "how have dairy prices moved over Q1?" — useful for press.
- **Basket inflation index**: top 100 staples, fixed weights, single number per day. Becomes the headline number journalists cite. Simple, reproducible methodology — published.

#### 4. Carts (the personal layer)
- Add products to a personal cart, stored in `localStorage` (no account).
- Cart total at each chain — "your typical week is 740 Kč at Tesco vs. 698 Kč at Lidl".
- Cart total over time (sparkline of "your basket inflation").
- **Per-chain price-sum overlay** (stolen from HP's Diagramme): one chart, one line per chain, x = date, y = "what this exact basket would cost there". Visually argues which chain is cheapest *for your basket*, not in the abstract. Strong storytelling.
- Cart shareable via URL (state encoded). Friends compare carts.

#### 5. Export (the trust layer)
- Download today's dataset (JSON, CSV).
- Per-search export.
- A documented `latest.json` URL — anyone can repeat our analysis. This is what makes journalists trust us, not us.

### Cut from v1

- Accounts / login / email
- Notifications / alerts (need backend)
- Reviews / ratings / community
- Per-store geo (no data anyway)
- Mobile app wrapper

---

## Comparison to Heisse-Preise

We're not innovating on UX shape. HP is the model. This is an honest read of where we match, diverge, steal, lag.

### Where we're identical (the load-bearing 80%)

- Search-first interaction. One box, no frame.
- URL = state. Every search/sort/filter lives in the URL → "easy to share" by construction.
- `localStorage` carts.
- JSON/CSV per-result and full-dataset export.
- Static SPA, no backend at runtime.
- No accounts, no analytics, privacy-as-absence.
- Daily-changes view (HP: "Preisänderungen", us: today's movers on home).
- Per-product price history visualization.

### Where we'd diverge

| | Heisse-Preise | Us |
|---|---|---|
| Cross-chain identity | Implicit, via "name-similarity" sort | Explicit match-groups (`/c/:groupId`) as first-class objects |
| Inflation as a number | Per-cart total over time | Published "basket inflation index" — fixed 100-staples, weighted, single citable number |
| URL aesthetic | Long query strings (`?f=…&l=…&c=…`) | Five-char paths (`/h?q=…`, `/k`, `/c/:id`) |
| Czech-aware text | N/A (German doesn't need it) | Diacritic folding + light stemming for declension (`máslo` / `másla`) |

### Stolen from HP into v1

These are HP features that would've been mistakes to omit. Now in the pillars above:

1. **AlaSQL `!` advanced search** — power-user query syntax in pillar 1.
2. **Inline price-history bar chart** per result row — denser than a sparkline; pillar 1.
3. **Per-chain price-sum overlay chart** — Diagramme's killer view, pillar 4.
4. **First-class "show unavailable" toggle** — surfaced as a primary filter, not buried in settings.

### Where we'll be weaker for a while

- **History depth.** HP has 2017→present for Billa/Spar (donated by Dossier and @h43z). We have day 1. Trends, charts, "did mléko really go up" — all need months of accumulation. Only fix is cron + patience.
- **Maturity.** HP has been hammered by real users since 2023. The mapping between visible affordances and what users click is dialed in. Ours will need iteration.

### Where we could be better

- **Czech market.** They're AT-only. The whole point.
- **Czech text handling.** We have to do it right; HP didn't have to think about it.
- **Match groups as artifact.** Small UX upgrade. Better defaults than relying on user-triggered "name-similarity" sort.
- **Citable inflation index.** A single number for press is something HP doesn't expose cleanly.
- **Methodology page in plain Czech.** Its own minor artifact for a country that doesn't have one yet.

### Known issues from first run-through

- **Search relevance bleeds.** Typing `maslo` returns popcorn, margarine, oil, bread alongside butter. Cause: query is substring-matched across `name + brand + category` joined into one string, so anything in the *butter shelf category* matches, plus `máslové` (declension) matches `máslo` as substring. Needs score-based ranking (name >> category) and Czech-aware light stemming. Tracked separately.

### Honest read

The differentiators are: country, four small UX upgrades, the inflation number. That's not a moat. The reason to build is "Czech consumers don't have one yet" — sufficient on its own, but worth being clear about so we don't oversell.

The risk-bearing investments are:
1. **Match quality.** Groups are only useful if they're right.
2. **Czech text normalization.** Without it, search misses real products.
3. **Discipline to publish the inflation index reliably.** Becomes the recurring press hook — most of the long-term value comes from journalists citing it.

### URL structure

```
/                      home: today's biggest movers + search + cart shortcut
/h?q=...               search results (URL state holds everything)
/p/:store/:id          single product page: history + chain matches
/c/:groupId            match group: side-by-side chains
/k                     cart (local; sharable as ?c=encoded-state)
/t                     trends: category aggregates, basket inflation
/o                     about: methodology, sources, limits
/d                     data: downloads + API
```

Five-character routes; URLs short enough to share verbally.

### Layout posture

Single-page Vite app downloading one compressed `latest.json` (+ `groups.json`).

- No backend at runtime. No analytics. Local-first carts.
- Czech UI by default, English toggle later.
- TS + Tailwind. No shadcn or framer — keep it light.

### What "easy to compose" actually means

Every UI state is a URL. No "save as" needed; URL *is* the save.
- A search + filters + sort = shareable.
- A cart = shareable.
- A match group = shareable.
- A custom basket = shareable.
- Eventually: mini-embed for blogs (`<iframe src="…"`). Out for v1, easy later.

---

## Open design questions

These need a decision before/during build.

1. **Multipack quantity** (`2 × 500 ml` vs. `1 l`). Today's parser picks 500. Cross-chain compare on packs is broken until fixed. Affects how confident we let users be in the comparison view.
2. **Promo vs. shelf price.** Globus exposes both `currentPrice` and `normalPrice`. Display the discount (-15%) as a badge? Use shelf price for trends and current price for "what you'd pay today"?
3. **Disappeared products.** Show or hide? Proposed: ghosted with last known price + "naposledy YYYY-MM-DD". Journalists want it; shoppers can hide via filter.
4. **Match confidence threshold.** Today: Jaccard 0.4. Need false-positive review at scale.
5. **Homepage philosophy** — three honest options:
   - **Search-first** (Heisse-Preise model): blank box, you came with intent, type.
   - **News-first**: today's biggest movers + cart + nav. The "what's interesting" angle.
   - **Hybrid**: prominent search + below-fold movers + footer with about/data.

   I'd pick hybrid, but it should be a deliberate call, not a default.

---

## Recommended sequencing

1. **Run Part 1 analyses first.** They tell us whether the dataset *is what we think it is* before we sink weeks into UI.
2. **Decide the homepage philosophy.** One conversation.
3. **Build pillar 1 (search)** as a static SPA against `latest.json`. Two days of focused work.
4. **Add pillar 2 (compare)** once we trust the matcher.
5. **Pillars 3-5** roll in as price history accumulates over weeks.

What I'd push back on if you tried to skip step 1: the data we have now might not support the experience you're imagining. Better to find out from a script in an hour than from a user in week six.
