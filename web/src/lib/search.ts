import type { MatchGroup, Product, Store } from './types.ts';
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

/** Don't dedup groups bigger than this — they're almost certainly garbage from
 *  the matcher (e.g., one bucket of all 750 ml wines). */
const MAX_DEDUPABLE_GROUP_SIZE = 10;

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

// TODO(search-relevance): substring-everywhere over name+brand+category bleeds —
// "maslo" returns popcorn/margarine/oil/bread because their categories contain
// "máslo" (e.g., "Máslo a tuky") or names contain declined forms ("máslové").
// Replace with score-weighted matching (name >> brand >> category) + light
// Czech stemming. See docs/web-design.md "Known issues".
function filterProducts(products: readonly Product[], f: Filters): Product[] {
  const tokens = tokenize(f.q);
  let out: Product[] = products.slice();

  if (!f.showUnavailable) out = out.filter((p) => p.available);
  if (f.stores.size > 0) out = out.filter((p) => f.stores.has(p.store));
  if (f.categories.size > 0) out = out.filter((p) => f.categories.has(p.categoryCanonical ?? ''));
  if (f.bioOnly) out = out.filter((p) => /\bbio\b/i.test(p.name));
  if (typeof f.minQty === 'number') out = out.filter((p) => (p.quantity ?? 0) >= f.minQty!);
  if (tokens.length > 0) {
    out = out.filter((p) => {
      const haystack = [p.name, p.brand ?? '', p.category ?? '']
        .map((s) => normalize(s))
        .join(' ');
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

  const byGroup = new Map<string, Product[]>();
  const singletons: Product[] = [];
  for (const p of filtered) {
    const total = p.groupId ? groupSize.get(p.groupId) ?? 0 : 0;
    const dedupable = p.groupId && total >= 2 && total <= MAX_DEDUPABLE_GROUP_SIZE;
    if (dedupable) {
      const list = byGroup.get(p.groupId!);
      if (list) list.push(p);
      else byGroup.set(p.groupId!, [p]);
    } else {
      singletons.push(p);
    }
  }

  const entries: ResultEntry[] = [];
  for (const [gid, members] of byGroup) {
    const cheapestFirst = members.slice().sort((a, b) => a.price - b.price);
    entries.push({
      rep: cheapestFirst[0]!,
      alternates: cheapestFirst.slice(1),
      totalGroupSize: groupSize.get(gid) ?? members.length,
    });
  }
  for (const s of singletons) {
    entries.push({ rep: s, alternates: [], totalGroupSize: 1 });
  }

  return sortEntries(entries, f.sort);
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
