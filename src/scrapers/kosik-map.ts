import type { Product, Unit } from '../common/types.ts';

export interface KosikApiResponse {
  product: {
    id: number;
    name: string;
    brand?: { name?: string };
    price: number;
    unit?: string;
    productQuantity?: { value?: number; unit?: string };
    mainCategory?: { name?: string };
    /** Object when in stock, null for delisted/phantom items still served by the slug API. */
    availability?: unknown;
  };
  breadcrumbs?: Array<{ name: string }>;
}

const UNIT_TABLE: Record<string, Unit> = {
  g: 'g', gram: 'g', kg: 'g',
  ml: 'ml', l: 'ml',
  ks: 'ks', kus: 'ks', kusů: 'ks',
  m: 'm',
  cm: 'cm',
};

export function extractKosikSlug(url: string): string | null {
  const m = /\/(p\d+-[^/?#]+)/.exec(url);
  return m ? m[1]! : null;
}

export function mapKosikApi(data: KosikApiResponse, url: string): Product | null {
  const p = data.product;
  if (!p || typeof p.id !== 'number' || typeof p.price !== 'number') return null;
  // Košík's slug API returns 200 even for delisted/phantom products. Their
  // search UI hides those (and so should we). The signal is `availability`:
  // it's an object for in-stock items, null for delisted ones.
  if (p.availability == null) return null;
  return {
    store: 'kosik',
    id: String(p.id),
    name: p.name,
    brand: p.brand?.name,
    category: pickCategory(data),
    price: p.price,
    currency: 'CZK',
    unit: normaliseUnit(p.productQuantity?.unit ?? p.unit),
    quantity: p.productQuantity?.value,
    available: true,
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function pickCategory(data: KosikApiResponse): string | undefined {
  const breadcrumb = data.breadcrumbs?.map((b) => b.name).filter(Boolean).join(' > ');
  return breadcrumb || data.product.mainCategory?.name;
}

function normaliseUnit(raw: string | undefined): Unit | undefined {
  return raw ? UNIT_TABLE[raw.toLowerCase()] : undefined;
}
