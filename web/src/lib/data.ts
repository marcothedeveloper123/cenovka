// Loads the canonical scraper output and reshapes it into the UI's flat
// `Product` + `MatchGroup` schema. One-time fetch on app boot.

import type { Dataset, Product, Store, Unit, MatchGroup } from './types.ts';

interface RawCanonicalProduct {
  store: Store;
  id: string;
  name: string;
  brand?: string;
  category?: string;
  categoryCanonical?: string;
  ean?: string;
  price: number;
  unit?: Unit;
  quantity?: number;
  available: boolean;
  url: string;
  scrapedAt: string;
  priceHistory?: Array<{ date: string; price: number }>;
}

interface RawCanonical {
  schema: number;
  generatedAt: string;
  products: RawCanonicalProduct[];
}

interface RawGroup {
  id: string;
  category?: string;
  unit?: string;
  quantity?: number;
  members: Array<{ store: Store; id: string; name: string; price: number }>;
}

const STORE_NAMES: Record<Store, string> = {
  tesco: 'Tesco',
  rohlik: 'Rohlík',
  kosik: 'Košík',
  lidl: 'Lidl',
  billa: 'Billa',
  penny: 'Penny',
  globus: 'Globus',
  kaufland: 'Kaufland',
};

export async function loadDataset(): Promise<Dataset> {
  // Prefer the gzipped sibling (~8 MB vs 53 MB); fall back to plain JSON when
  // it isn't there (e.g., dev with stale data dir, browsers without DCS).
  const [canonical, groups] = await Promise.all([
    fetchMaybeGz<RawCanonical>('/data/latest.json'),
    fetchMaybeGz<RawGroup[]>('/data/groups.json').catch(() => [] as RawGroup[]),
  ]);

  const groupByKey = new Map<string, string>();
  const matchGroups: MatchGroup[] = groups.map((g) => {
    const productKeys = g.members.map((m) => `${m.store}::${m.id}`);
    for (const key of productKeys) groupByKey.set(key, g.id);
    return {
      id: g.id,
      category: g.category,
      unit: g.unit,
      quantity: g.quantity,
      productKeys,
    };
  });

  const products: Product[] = canonical.products.map((p) => {
    const id = `${p.store}::${p.id}`;
    const { unitPrice, unitPriceLabel } = computeUnitPrice(p.price, p.unit, p.quantity);
    return {
      id,
      store: p.store,
      storeName: STORE_NAMES[p.store],
      name: p.name,
      brand: p.brand,
      category: p.category,
      categoryCanonical: p.categoryCanonical,
      ean: p.ean,
      price: p.price,
      unitPrice,
      unitPriceLabel,
      unit: p.unit,
      quantity: p.quantity,
      available: p.available,
      url: p.url,
      history: p.priceHistory ?? [],
      groupId: groupByKey.get(id),
    };
  });

  return { generatedAt: canonical.generatedAt, products, groups: matchGroups };
}

function computeUnitPrice(
  price: number,
  unit: Unit | undefined,
  qty: number | undefined,
): { unitPrice?: number; unitPriceLabel?: 'ks' | '100g' | '100ml' } {
  if (typeof qty !== 'number' || qty <= 0) return {};
  if (unit === 'g') return { unitPrice: round2((price / qty) * 100), unitPriceLabel: '100g' };
  if (unit === 'ml') return { unitPrice: round2((price / qty) * 100), unitPriceLabel: '100ml' };
  if (unit === 'ks') return { unitPrice: round2(price / qty), unitPriceLabel: 'ks' };
  return {};
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function fetchMaybeGz<T>(url: string): Promise<T> {
  // Try .gz first when DecompressionStream is available; fall back to plain.
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const res = await fetch(`${url}.gz`, { cache: 'no-store' });
      if (res.ok && res.body) {
        const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        return JSON.parse(text) as T;
      }
    } catch {
      // fall through
    }
  }
  return fetchJson<T>(url);
}
