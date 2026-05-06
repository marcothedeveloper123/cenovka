import type { CanonicalProduct, Unit } from './types.ts';

export interface SearchHit {
  product: CanonicalProduct;
  unitPrice?: { value: number; per: '100g' | '100ml' | 'ks' };
}

const SEARCH_FIELDS = ['name', 'brand', 'category'] as const;

export function searchProducts(
  products: readonly CanonicalProduct[],
  query: string,
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const out: SearchHit[] = [];
  for (const p of products) {
    if (matches(p, tokens)) out.push({ product: p, unitPrice: unitPriceOf(p) });
  }
  return out;
}

function matches(p: CanonicalProduct, tokens: readonly string[]): boolean {
  const haystack = SEARCH_FIELDS.map((f) => normalise(p[f] ?? '')).join(' ');
  return tokens.every((t) => haystack.includes(t));
}

export function tokenize(input: string): string[] {
  return normalise(input)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Lowercase + strip Czech diacritics for accent-insensitive search. */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function unitPriceOf(p: CanonicalProduct): SearchHit['unitPrice'] {
  if (typeof p.quantity !== 'number' || p.quantity <= 0) return undefined;
  const per = perFor(p.unit);
  if (!per) return undefined;
  const factor = per === '100g' || per === '100ml' ? 100 : 1;
  const value = (p.price / p.quantity) * factor;
  return { value: round2(value), per };
}

function perFor(unit: Unit | undefined): '100g' | '100ml' | 'ks' | undefined {
  if (unit === 'g') return '100g';
  if (unit === 'ml') return '100ml';
  if (unit === 'ks') return 'ks';
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
