import { parseQuantity } from '../common/quantity.ts';
import type { Product } from '../common/types.ts';

export interface KauflandTile {
  id: number;
  ean?: string;
  title?: string;
  category?: { id?: number; name?: string };
  manufacturer?: string;
  prices?: { price?: number; currency?: string; basePrice?: { amount?: number } };
  packaging?: { content?: { value?: number; unit?: string } } | null;
  shipping?: { isAvailable?: boolean };
}

export interface KauflandTilesResponse {
  products?: KauflandTile[];
}

/** Map a Kaufland product-tile payload to a canonical Product. */
export function mapKauflandTile(t: KauflandTile, listingUrl: string): Product | null {
  if (typeof t.id !== 'number' || !t.title) return null;
  const price = t.prices?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;

  const qty = readQuantity(t) ?? parseQuantity(t.title);

  return {
    store: 'kaufland',
    id: String(t.id),
    name: t.title,
    brand: t.manufacturer || undefined,
    category: t.category?.name,
    ean: t.ean,
    price,
    currency: 'CZK',
    unit: qty?.unit,
    quantity: qty?.quantity,
    available: t.shipping?.isAvailable !== false,
    url: listingUrl,
    scrapedAt: new Date().toISOString(),
  };
}

function readQuantity(t: KauflandTile): { unit: import('../common/quantity.ts').Unit; quantity: number } | undefined {
  const c = t.packaging?.content;
  if (!c || typeof c.value !== 'number' || !c.unit) return undefined;
  const u = c.unit.toLowerCase();
  if (u === 'g' || u === 'gram') return { unit: 'g', quantity: c.value };
  if (u === 'kg') return { unit: 'g', quantity: c.value * 1000 };
  if (u === 'ml') return { unit: 'ml', quantity: c.value };
  if (u === 'l') return { unit: 'ml', quantity: c.value * 1000 };
  if (u === 'ks' || u === 'piece' || u === 'st') return { unit: 'ks', quantity: c.value };
  return undefined;
}
