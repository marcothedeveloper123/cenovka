import type { Product, Store } from './types.ts';

export interface ChainCoverage {
  total: number;
  withQuantity: number;
  withBrand: number;
  withCategory: number;
  withEan: number;
  available: number;
}

export type CoverageReport = Record<Store, ChainCoverage>;

export function computeCoverage(products: readonly Product[]): CoverageReport {
  const byStore = new Map<Store, Product[]>();
  for (const p of products) {
    let bucket = byStore.get(p.store);
    if (!bucket) byStore.set(p.store, (bucket = []));
    bucket.push(p);
  }
  const out = {} as CoverageReport;
  for (const [store, items] of byStore) {
    out[store] = {
      total: items.length,
      withQuantity: items.filter((p) => typeof p.quantity === 'number').length,
      withBrand: items.filter((p) => Boolean(p.brand)).length,
      withCategory: items.filter((p) => Boolean(p.category)).length,
      withEan: items.filter((p) => Boolean(p.ean)).length,
      available: items.filter((p) => p.available !== false).length,
    };
  }
  return out;
}

export function pct(num: number, den: number): string {
  if (den === 0) return '  - ';
  return `${((num / den) * 100).toFixed(0).padStart(3)}%`;
}
