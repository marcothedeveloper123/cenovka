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

/** TF-IDF style threshold on weighted Jaccard score. Each token contributes
 *  log(N/freq) — common descriptors get tiny weight, distinguishing variety
 *  tokens dominate. */
const SIMILARITY_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.8;
const MIN_SHARED_TOKENS = 2;
const MIN_BUCKET_FOR_IDF = 8;

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
  const rootBrands = new Map<number, Set<string>>();
  for (let i = 0; i < items.length; i++) {
    const b = items[i]!.brand;
    if (b) rootBrands.set(i, new Set([foldBrand(b)]));
  }
  const weights = bucketWeights(tokenSets);

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      if (!canPairUnion(items[i]!, items[j]!, tokenSets[i]!, tokenSets[j]!, weights)) continue;
      const ri = find(parent, i);
      const rj = find(parent, j);
      if (ri === rj) continue;
      const merged = mergedBrands(rootBrands.get(ri), rootBrands.get(rj));
      if (merged.size > 1) continue;
      union(parent, i, j);
      const newRoot = find(parent, i);
      if (merged.size > 0) rootBrands.set(newRoot, merged);
      else rootBrands.delete(newRoot);
    }
  }
  return parent;
}

/** Token weights for the bucket: log(N / freq) + 1, with smoothing.
 *  For tiny buckets (<MIN_BUCKET_FOR_IDF) returns weight 1 for every
 *  token — IDF estimates aren't meaningful at low N. */
function bucketWeights(tokenSets: Set<string>[]): Map<string, number> {
  const weights = new Map<string, number>();
  if (tokenSets.length < MIN_BUCKET_FOR_IDF) return weights;
  const freq = new Map<string, number>();
  for (const ts of tokenSets) {
    for (const t of ts) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const N = tokenSets.length;
  for (const [t, c] of freq) {
    weights.set(t, Math.log(N / Math.max(1, c)) + 1);
  }
  return weights;
}

function tokenWeight(weights: Map<string, number>, t: string): number {
  return weights.get(t) ?? 1;
}

/**
 * Two products may pair iff:
 *   1. Same brand OR at most one has a brand (no conflict on the pair),
 *   2. AND token signal is strong: Jaccard ≥ threshold, OR one set is ⊆ the
 *      other (containment ≥ 0.8) — this catches "RUMMO Spaghetti" ↔
 *      "Rummo Spaghetti semolinové těstoviny 500g" cases where Jaccard alone
 *      drops below threshold because of long descriptive names.
 *   3. AND ≥2 shared tokens (kills 1-token coincidences).
 */
/** Tokens with weight > this are "distinguishing": they appear in <5%
 *  of the bucket. A token's weight = log(N/freq) + 1, so weight > 4
 *  means freq/N < e^-3 ≈ 0.05. */
const DISTINGUISHING_WEIGHT = 4;

function canPairUnion(
  a: CanonicalProduct,
  b: CanonicalProduct,
  ta: Set<string>,
  tb: Set<string>,
  weights: Map<string, number>,
): boolean {
  if (a.brand && b.brand && !brandsEqual(a.brand, b.brand)) return false;
  const shared = sharedCount(ta, tb);
  if (shared < MIN_SHARED_TOKENS) return false;

  // Variety-discriminator rule: if BOTH products have at least one unique
  // distinguishing (bucket-rare) token the other lacks, they're different
  // varieties — even if shared descriptors push the score up. This kills
  // wine-vintner / beer-brand / energy-drink-flavor over-clustering.
  let distA = 0;
  let distB = 0;
  for (const t of ta) if (!tb.has(t) && tokenWeight(weights, t) > DISTINGUISHING_WEIGHT) distA += 1;
  for (const t of tb) if (!ta.has(t) && tokenWeight(weights, t) > DISTINGUISHING_WEIGHT) distB += 1;
  if (distA >= 1 && distB >= 1) return false;

  const score = weightedJaccard(ta, tb, weights);
  if (score >= SIMILARITY_THRESHOLD) return true;
  const cont = Math.max(shared / Math.max(1, ta.size), shared / Math.max(1, tb.size));
  return cont >= CONTAINMENT_THRESHOLD;
}

function weightedJaccard(a: Set<string>, b: Set<string>, weights: Map<string, number>): number {
  let intersect = 0;
  let union = 0;
  for (const t of a) {
    const w = tokenWeight(weights, t);
    union += w;
    if (b.has(t)) intersect += w;
  }
  for (const t of b) {
    if (a.has(t)) continue;
    union += tokenWeight(weights, t);
  }
  return union === 0 ? 0 : intersect / union;
}

function mergedBrands(a: Set<string> | undefined, b: Set<string> | undefined): Set<string> {
  const out = new Set<string>();
  if (a) for (const v of a) out.add(v);
  if (b) for (const v of b) out.add(v);
  return out;
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
