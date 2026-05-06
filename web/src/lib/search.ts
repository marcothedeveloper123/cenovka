import type { Product, Store } from './types.ts';
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
const TOKEN_FIELDS = ['name', 'brand', 'category'] as const;

export function applyFilters(products: readonly Product[], f: Filters): Product[] {
  const tokens = tokenize(f.q);
  let out: Product[] = products.slice();

  if (!f.showUnavailable) out = out.filter((p) => p.available);
  if (f.stores.size > 0) out = out.filter((p) => f.stores.has(p.store));
  if (f.categories.size > 0) out = out.filter((p) => f.categories.has(p.categoryCanonical ?? ''));
  if (f.bioOnly) out = out.filter((p) => /\bbio\b/i.test(p.name));
  if (typeof f.minQty === 'number') out = out.filter((p) => (p.quantity ?? 0) >= f.minQty!);
  if (tokens.length > 0) {
    out = out.filter((p) => {
      const haystack = TOKEN_FIELDS.map((field) => normalize(String(p[field] ?? ''))).join(' ');
      return tokens.every((t) => haystack.includes(t));
    });
  }

  return sortProducts(out, f.sort);
}

function tokenize(q: string): string[] {
  return normalize(q)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function sortProducts(products: Product[], sort: SortKey): Product[] {
  const arr = products.slice();
  switch (sort) {
    case 'unit-asc':
      arr.sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
      break;
    case 'unit-desc':
      arr.sort((a, b) => (b.unitPrice ?? -Infinity) - (a.unitPrice ?? -Infinity));
      break;
    case 'price-asc':
      arr.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      arr.sort((a, b) => b.price - a.price);
      break;
    case 'name':
      arr.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
      break;
  }
  return arr;
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
