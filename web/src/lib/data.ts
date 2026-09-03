// Loads the canonical scraper output and reshapes it into the UI's flat
// `Product` + `MatchGroup` schema. One-time fetch on app boot.

import type {
  Dataset,
  MatchGroup,
  Product,
  ReferenceDataset,
  ReferenceItem,
  ScrapeLog,
  Store,
  Unit,
} from './types.ts';

/** ČSÚ code → product ids, as written by `src/csu-join.ts`. */
type RawReferenceMembers = Record<string, string[]>;

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
  const [canonical, groups, scrapeLog, reference, referenceMembers] = await Promise.all([
    fetchMaybeGz<RawCanonical>('/data/latest.json'),
    fetchMaybeGz<RawGroup[]>('/data/groups.json').catch(() => [] as RawGroup[]),
    fetchMaybeGz<ScrapeLog>('/data/coverage.json').catch(() => undefined),
    // ČSÚ national averages. Soft-fails like the others: only latest.json is
    // allowed to throw, so a deploy without this file still boots.
    fetchMaybeGz<ReferenceDataset>('/data/reference.json').catch(() => undefined),
    fetchMaybeGz<RawReferenceMembers>('/data/reference-members.json').catch(() => undefined),
  ]);

  // Invert ČSÚ code → ids into id → code, the same way groups become groupId.
  const csuByKey = new Map<string, string>();
  for (const [code, keys] of Object.entries(referenceMembers ?? {})) {
    for (const key of keys) csuByKey.set(key, code);
  }

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
      csu: csuByKey.get(id),
    };
  });

  return {
    generatedAt: canonical.generatedAt,
    products,
    groups: matchGroups,
    scrapeLog,
    reference,
    referenceMembers,
  };
}

/**
 * A ČSÚ item's price in the same unit-price basis as `Product.unitPrice`
 * (Kč per 100 g / 100 ml / ks), so the two can sit side by side. Uses the
 * latest month.
 */
export function csuUnitPrice(item: ReferenceItem): { unitPrice?: number; unitPriceLabel?: 'ks' | '100g' | '100ml' } {
  const latest = item.history[0];
  if (!latest) return {};
  return computeUnitPrice(latest.price, item.unit, item.quantity);
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
  // Prefer the .gz sibling, but don't assume it arrives still compressed.
  // A static host that sets `Content-Encoding: gzip` on .gz files (vite preview
  // and Cloudflare Pages both do) makes the browser decode the body for us;
  // one that treats it as an opaque download does not. Piping already-decoded
  // JSON through DecompressionStream throws, which is how the first production
  // build failed while dev worked. Sniff the gzip magic bytes instead of
  // trusting the header, which browsers report inconsistently.
  try {
    const res = await fetch(`${url}.gz`, { cache: 'no-store' });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
      const isGzip = head[0] === 0x1f && head[1] === 0x8b;
      if (!isGzip) return JSON.parse(new TextDecoder().decode(buf)) as T;
      if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text()) as T;
      }
    }
  } catch {
    // fall through to the uncompressed sibling
  }
  return fetchJson<T>(url);
}
