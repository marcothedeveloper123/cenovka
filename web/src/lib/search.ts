import type { MatchGroup, Product, Store } from './types.ts';
import { foldName, stripContainer } from './fold.ts';
import { normalize } from './format.ts';

export type SortKey =
  | 'unit-asc'
  | 'unit-desc'
  | 'price-asc'
  | 'price-desc'
  | 'name';

export interface Filters {
  q: string;
  stores: Set<Store>;
  categories: Set<string>;
  bioOnly: boolean;
  minQty?: number;
  showUnavailable: boolean;
  sort: SortKey;
}

export interface ResultEntry {
  rep: Product;
  /** Other matching chain members of the same group; cheapest-first, excluding `rep`. */
  alternates: Product[];
  /** Total members of the group in the full dataset (before filtering). */
  totalGroupSize: number;
}

/** Tight groups (≤ this) collapse to one row with alternates — the canonical
 *  "same product across chains" experience. */
const TIGHT_GROUP_SIZE = 10;
/** Broad groups (≤ this) collapse to one row PER CHAIN (cheapest in chain).
 *  The Porovnat button still works — it just points at a noisier group page.
 *  Above this we give up and let products show as singletons. */
const BROAD_GROUP_SIZE = 60;

export function emptyFilters(): Filters {
  return {
    q: '',
    stores: new Set(),
    categories: new Set(),
    bioOnly: false,
    showUnavailable: false,
    sort: 'unit-asc',
  };
}

// Match each query token against name + brand only — NOT the chain's category
// breadcrumb. Tesco categorizes peppers/chilli under "Ovoce a zelenina >
// Zelenina > Rajčata", so including the category text means "rajcata" matches
// every pepper. The canonical category is still used as a STRUCTURAL filter
// (the categories facet) but not for free-text search.
//
// TODO(search-relevance, #15): still substring-only — "maslo" matches
// "máslové" via substring; needs declension-aware stemming + score-weighted
// ranking (name 10× > brand 3×).
export function filterProducts(products: readonly Product[], f: Filters): Product[] {
  const tokens = tokenize(f.q);
  let out: Product[] = products.slice();

  if (!f.showUnavailable) out = out.filter((p) => p.available);
  if (f.stores.size > 0) out = out.filter((p) => f.stores.has(p.store));
  if (f.categories.size > 0) out = out.filter((p) => f.categories.has(p.categoryCanonical ?? ''));
  if (f.bioOnly) out = out.filter((p) => /\bbio\b/i.test(p.name));
  if (typeof f.minQty === 'number') out = out.filter((p) => (p.quantity ?? 0) >= f.minQty!);
  if (tokens.length > 0) {
    out = out.filter((p) => {
      const haystack = `${normalize(p.name)} ${normalize(p.brand ?? '')}`;
      return tokens.every((t) => haystack.includes(t));
    });
  }
  return out;
}

/** Filter, dedupe by match-group, sort. The Search page's main entry point. */
export function searchAndDedup(
  products: readonly Product[],
  groups: readonly MatchGroup[],
  f: Filters,
): ResultEntry[] {
  // Step 1: within-chain dedup. Some chains list the same product under
  // multiple SKU IDs (e.g., BILLA has two entries for "BILLA Spaghetti
  // 500g" at the same price). Collapse these to one before anything else.
  const filtered = collapseWithinChain(filterProducts(products, f));

  const groupSize = new Map<string, number>();
  for (const g of groups) groupSize.set(g.id, g.productKeys.length);

  const tight = new Map<string, Product[]>();
  const broad = new Map<string, Product[]>();
  const singletons: Product[] = [];
  for (const p of filtered) {
    const total = p.groupId ? groupSize.get(p.groupId) ?? 0 : 0;
    if (!p.groupId || total < 2) {
      singletons.push(p);
    } else if (total <= TIGHT_GROUP_SIZE) {
      pushInto(tight, p.groupId, p);
    } else if (total <= BROAD_GROUP_SIZE) {
      pushInto(broad, p.groupId, p);
    } else {
      singletons.push(p);
    }
  }

  const entries: ResultEntry[] = [];

  // Tight groups: one row, all chain members as alternates.
  for (const [gid, members] of tight) {
    const cheapest = members.slice().sort((a, b) => a.price - b.price);
    entries.push({
      rep: cheapest[0]!,
      alternates: cheapest.slice(1),
      totalGroupSize: groupSize.get(gid) ?? members.length,
    });
  }

  // Broad groups: the matcher over-clustered (e.g., all Budvar 500 ml SKUs).
  // First collapse to one product per chain (cheapest), then sub-group those
  // by container-stripped name so SAME-named products across chains collapse
  // to a single row with alternates while DIFFERENT variants stay separate.
  for (const [gid, members] of broad) {
    const total = groupSize.get(gid) ?? members.length;
    const byChain = new Map<string, Product>();
    for (const m of members) {
      const prev = byChain.get(m.store);
      if (!prev || m.price < prev.price) byChain.set(m.store, m);
    }
    const subByName = new Map<string, Product[]>();
    for (const m of byChain.values()) {
      const key = `${stripContainer(foldName(m.name))}|${m.quantity ?? ''}|${m.unit ?? ''}`;
      pushInto(subByName, key, m);
    }
    for (const sub of subByName.values()) {
      const cheapest = sub.slice().sort((a, b) => a.price - b.price);
      entries.push({
        rep: cheapest[0]!,
        alternates: cheapest.slice(1),
        totalGroupSize: total,
      });
    }
  }

  for (const s of singletons) {
    entries.push({ rep: s, alternates: [], totalGroupSize: 1 });
  }

  return sortEntries(entries, f.sort);
}

function pushInto<K, V>(m: Map<K, V[]>, key: K, value: V): void {
  const list = m.get(key);
  if (list) list.push(value);
  else m.set(key, [value]);
}

/** Collapse near-duplicate listings within the same chain — same store +
 *  same normalized name + same unit/quantity = same product. Keep the
 *  cheapest. */
function collapseWithinChain(products: readonly Product[]): Product[] {
  const seen = new Map<string, Product>();
  for (const p of products) {
    const key = `${p.store}::${normalize(p.name)}::${p.unit ?? ''}::${p.quantity ?? ''}`;
    const prior = seen.get(key);
    if (!prior || p.price < prior.price) seen.set(key, p);
  }
  return [...seen.values()];
}

function sortEntries(entries: ResultEntry[], sort: SortKey): ResultEntry[] {
  const arr = entries.slice();
  switch (sort) {
    case 'unit-asc':
      arr.sort((a, b) => (a.rep.unitPrice ?? Infinity) - (b.rep.unitPrice ?? Infinity));
      break;
    case 'unit-desc':
      arr.sort((a, b) => (b.rep.unitPrice ?? -Infinity) - (a.rep.unitPrice ?? -Infinity));
      break;
    case 'price-asc':
      arr.sort((a, b) => a.rep.price - b.rep.price);
      break;
    case 'price-desc':
      arr.sort((a, b) => b.rep.price - a.rep.price);
      break;
    case 'name':
      arr.sort((a, b) => a.rep.name.localeCompare(b.rep.name, 'cs'));
      break;
  }
  return arr;
}

function tokenize(q: string): string[] {
  return normalize(q)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export const CANONICAL_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'mlecne', label: 'Mléčné' },
  { id: 'maso', label: 'Maso a uzeniny' },
  { id: 'pecivo', label: 'Pečivo' },
  { id: 'ovoce-zelenina', label: 'Ovoce a zelenina' },
  { id: 'mrazene', label: 'Mražené' },
  { id: 'trvanlive', label: 'Trvanlivé' },
  { id: 'napoje', label: 'Nápoje' },
  { id: 'alkohol', label: 'Alkohol' },
  { id: 'kava-caj', label: 'Káva a čaj' },
  { id: 'sladke', label: 'Sladké' },
  { id: 'slane', label: 'Slané pochutiny' },
  { id: 'dite', label: 'Dítě' },
  { id: 'drogerie', label: 'Drogerie' },
  { id: 'domov', label: 'Domov' },
  { id: 'pet', label: 'Mazlíčci' },
];

export const STORE_LABELS: Record<Store, string> = {
  tesco: 'Tesco',
  rohlik: 'Rohlík',
  kosik: 'Košík',
  lidl: 'Lidl',
  billa: 'Billa',
  penny: 'Penny',
  globus: 'Globus',
  kaufland: 'Kaufland',
};
