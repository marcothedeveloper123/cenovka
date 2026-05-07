import { normalise } from './search-core.ts';
import type { CanonicalProduct, Store } from './types.ts';
import { multipackHint, varietyConflict, varietyTokensOf } from './varieties.ts';

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
  // Phase 1: cluster by normalized EAN (strongest signal). Tesco + Globus
  // publish EAN-13 / GTIN-14; validate.normalizeEan() canonicalizes both to
  // 13 digits so they match exactly. ~7000 cross-chain pairs.
  //
  // Phase 2: bucket-by-(category, unit, quantity) + Jaccard for everything
  // (including EAN-grouped products), then merge any bucket cluster that
  // overlaps with an existing EAN cluster — pulls in EAN-less Billa/Rohlík
  // products that share the bucket with EAN'd Tesco/Globus twins.
  const items: CanonicalProduct[] = [];
  for (const p of products) {
    if (!p.available) continue;
    items.push(p);
  }
  const parent = items.map((_, i) => i);
  const groupBrands = new Map<number, Set<string>>();
  for (let i = 0; i < items.length; i++) {
    const b = items[i]!.brand;
    if (b) groupBrands.set(i, new Set([foldBrand(b)]));
  }

  unionByEan(items, parent, groupBrands);
  unionByBuckets(items, parent, groupBrands);

  return materializeGroups(items, parent);
}

function unionByEan(
  items: readonly CanonicalProduct[],
  parent: number[],
  groupBrands: Map<number, Set<string>>,
): void {
  const byEan = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const ean = items[i]!.ean;
    if (!ean) continue;
    let list = byEan.get(ean);
    if (!list) byEan.set(ean, (list = []));
    list.push(i);
  }
  for (const indices of byEan.values()) {
    if (indices.length < 2) continue;
    const seed = indices[0]!;
    for (let k = 1; k < indices.length; k++) {
      tryUnion(parent, groupBrands, seed, indices[k]!, /*allowBrandClash=*/false);
    }
  }
}

function unionByBuckets(
  items: readonly CanonicalProduct[],
  parent: number[],
  groupBrands: Map<number, Set<string>>,
): void {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const key = bucketKey(items[i]!);
    if (!key) continue;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  // Per-product variety hints (sweetness / colour / flavour / etc.) and
  // multipack count, computed once and used in both pairwise checks and
  // cluster-level guards (so transitive bridges can't smuggle a conflict in).
  const variety: Map<string, Set<string>>[] = items.map(() => new Map());
  const groupVariety = new Map<number, Map<string, Set<string>>>();
  const packHint: number[] = items.map((p) => multipackHint(p.name));
  for (const [, idxs] of buckets) {
    if (idxs.length < 2) continue;
    const tokenSets = idxs.map((i) => tokens(items[i]!.name, items[i]!.brand));
    for (let k = 0; k < idxs.length; k++) {
      variety[idxs[k]!] = varietyTokensOf(tokenSets[k]!);
    }
    const weights = bucketWeights(tokenSets);
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const ia = idxs[a]!;
        const ib = idxs[b]!;
        if (varietyConflict(variety[ia]!, variety[ib]!)) continue;
        if (packHint[ia]! !== packHint[ib]!) continue;
        if (!canPairUnion(items[ia]!, items[ib]!, tokenSets[a]!, tokenSets[b]!, weights)) continue;
        tryUnion(parent, groupBrands, ia, ib, false, groupVariety, variety);
      }
    }
  }
}

function tryUnion(
  parent: number[],
  groupBrands: Map<number, Set<string>>,
  i: number,
  j: number,
  allowBrandClash: boolean,
  groupVariety?: Map<number, Map<string, Set<string>>>,
  variety?: Map<string, Set<string>>[],
): void {
  const ri = find(parent, i);
  const rj = find(parent, j);
  if (ri === rj) return;
  const merged = mergedBrands(groupBrands.get(ri), groupBrands.get(rj));
  if (!allowBrandClash && merged.size > 1) return;

  // Cluster-level variety guard: prevent transitive bridging via products
  // with no token on a given axis. E.g. "Bohemia Sekt Nealkoholický" has no
  // sweetness token, so a pair with "Brut" merges fine; then that cluster
  // has sweetness={brut}, and a later merge with "Demi Sec" would mix
  // sweetness — which we reject here.
  let mergedVariety: Map<string, Set<string>> | undefined;
  if (groupVariety && variety) {
    const va = groupVariety.get(ri) ?? variety[i] ?? new Map();
    const vb = groupVariety.get(rj) ?? variety[j] ?? new Map();
    mergedVariety = mergeVariety(va, vb);
    for (const tokens of mergedVariety.values()) {
      if (tokens.size > 1) return;
    }
  }

  union(parent, i, j);
  const newRoot = find(parent, i);
  if (merged.size > 0) groupBrands.set(newRoot, merged);
  else groupBrands.delete(newRoot);
  if (groupVariety && mergedVariety) groupVariety.set(newRoot, mergedVariety);
}

function mergeVariety(a: Map<string, Set<string>>, b: Map<string, Set<string>>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [axis, set] of a) out.set(axis, new Set(set));
  for (const [axis, set] of b) {
    const cur = out.get(axis);
    if (cur) for (const t of set) cur.add(t);
    else out.set(axis, new Set(set));
  }
  return out;
}

function materializeGroups(items: readonly CanonicalProduct[], parent: number[]): MatchGroup[] {
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(parent, i);
    let list = clusters.get(root);
    if (!list) clusters.set(root, (list = []));
    list.push(i);
  }
  const out: MatchGroup[] = [];
  for (const [, indices] of clusters) {
    if (indices.length < 2) continue;
    const stores = new Set(indices.map((i) => items[i]!.store));
    if (stores.size < 2) continue;
    const sample = items[indices[0]!]!;
    const id = chooseGroupId(items, indices);
    out.push({
      id,
      category: sample.categoryCanonical,
      unit: sample.unit,
      quantity: sample.quantity,
      members: indices.map((i) => {
        const p = items[i]!;
        return { store: p.store, id: p.id, name: p.name, price: p.price };
      }),
    });
  }
  return out;
}

function chooseGroupId(items: readonly CanonicalProduct[], indices: readonly number[]): string {
  // Prefer a shared EAN if all EAN'd members agree; else fall back to a
  // bucket-style key from the first member.
  const eans = new Set<string>();
  for (const i of indices) {
    const e = items[i]!.ean;
    if (e) eans.add(e);
  }
  if (eans.size === 1) return `ean::${[...eans][0]}`;
  const sample = items[indices[0]!]!;
  const bucket = bucketKey(sample);
  return bucket ? `${bucket}::${sample.id}` : `mix::${sample.store}::${sample.id}`;
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
/** Tokens with weight > this are "distinguishing". weight = log(N/freq) + 1.
 *  Weight > 2 means freq/N < e^-1 ≈ 0.37, so any token that's NOT in the
 *  bulk of the bucket counts as a variant marker. Lowered from 4 (which
 *  meant <5% — too restrictive) so flavor/variant tokens like "jablko" /
 *  "Original" / "Nealko" / "Classic" are properly treated as splitters in
 *  large 100+ member buckets. */
const DISTINGUISHING_WEIGHT = 2;

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

