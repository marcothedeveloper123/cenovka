import { normalise } from './search-core.ts';
import type { CanonicalProduct, Store } from './types.ts';

export interface MatchGroup {
  id: string;
  category?: string;
  unit?: string;
  quantity?: number;
  members: Array<{ store: Store; id: string; name: string; price: number }>;
}

const STOPWORDS = new Set([
  'a', 'i', 'o', 's', 'k', 'v', 'z', 'na', 'do', 'po', 'pro',
  'bio', 'eko', 'ml', 'l', 'g', 'kg', 'ks', 'kus',
]);

const SIMILARITY_THRESHOLD = 0.55;
const MIN_SHARED_TOKENS = 2;

/**
 * Group products that look like the same logical item across chains.
 * Bucketing by (category, unit, rounded-quantity) narrows the search;
 * within each bucket, Jaccard token similarity ≥ threshold unions products.
 */
export function buildMatchGroups(products: readonly CanonicalProduct[]): MatchGroup[] {
  const buckets = new Map<string, CanonicalProduct[]>();
  for (const p of products) {
    if (!p.available) continue;
    const key = bucketKey(p);
    if (!key) continue;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(p);
  }

  const groups: MatchGroup[] = [];
  for (const [key, items] of buckets) {
    if (items.length < 2) continue;
    const tokenSets = items.map((p) => tokens(p.name, p.brand));
    const parent = unionByJaccard(tokenSets, items);
    appendGroups(groups, key, items, parent);
  }
  return groups;
}

function bucketKey(p: CanonicalProduct): string | undefined {
  if (!p.categoryCanonical || !p.unit || typeof p.quantity !== 'number') return undefined;
  // Exact quantity bucketing for now. Tolerance can come later if real data shows 248g/250g drift.
  return `${p.categoryCanonical}::${p.unit}::${p.quantity}`;
}

export function tokens(name: string, brand: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const word of normalise(`${brand ?? ''} ${name}`).split(/[\s,()/-]+/)) {
    if (word.length < 2) continue;
    if (STOPWORDS.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    out.add(word);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  return intersect / (a.size + b.size - intersect);
}

function unionByJaccard(
  tokenSets: Set<string>[],
  items: CanonicalProduct[],
): number[] {
  const parent = tokenSets.map((_, i) => i);
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      if (canUnion(items[i]!, items[j]!, tokenSets[i]!, tokenSets[j]!)) {
        union(parent, i, j);
      }
    }
  }
  return parent;
}

/**
 * Two products union into the same logical-product group iff:
 *   1. Their normalized name+brand tokens share Jaccard ≥ threshold AND ≥2 tokens,
 *   2. AND if both have a brand, brands must match (case + diacritic insensitive).
 *
 * The brand-equality constraint kills the over-clustering we saw with wine,
 * juice, and other generic-token-heavy categories where many SKUs share
 * tokens like "víno", "ryzlink", "suché" but are different bottles.
 */
function canUnion(
  a: CanonicalProduct,
  b: CanonicalProduct,
  ta: Set<string>,
  tb: Set<string>,
): boolean {
  if (a.brand && b.brand && !brandsEqual(a.brand, b.brand)) return false;
  const score = jaccard(ta, tb);
  if (score < SIMILARITY_THRESHOLD) return false;
  return sharedCount(ta, tb) >= MIN_SHARED_TOKENS;
}

function brandsEqual(a: string, b: string): boolean {
  return foldBrand(a) === foldBrand(b);
}

function foldBrand(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]!]!;
    i = parent[i]!;
  }
  return i;
}

function union(parent: number[], a: number, b: number): void {
  parent[find(parent, a)] = find(parent, b);
}

function appendGroups(
  out: MatchGroup[],
  bucketKey: string,
  items: CanonicalProduct[],
  parent: number[],
): void {
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(parent, i);
    let list = clusters.get(root);
    if (!list) clusters.set(root, (list = []));
    list.push(i);
  }
  for (const [, indices] of clusters) {
    if (indices.length < 2) continue;
    const stores = new Set(indices.map((i) => items[i]!.store));
    if (stores.size < 2) continue; // require cross-chain
    const sample = items[indices[0]!]!;
    out.push({
      id: `${bucketKey}::${sample.id}`,
      category: sample.categoryCanonical,
      unit: sample.unit,
      quantity: sample.quantity,
      members: indices.map((i) => {
        const p = items[i]!;
        return { store: p.store, id: p.id, name: p.name, price: p.price };
      }),
    });
  }
}
