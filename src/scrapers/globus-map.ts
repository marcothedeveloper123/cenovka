import {
  extractNuxtArray,
  readList,
  readNumber,
  readObject,
  readString,
  type NuxtArray,
} from '../common/nuxt-payload.ts';
import { parseQuantity } from '../common/quantity.ts';
import type { Product } from '../common/types.ts';

/**
 * Globus embeds ~10 products' full data per category-listing page in
 * __NUXT_DATA__. Robots.txt disallows product detail pages (`/p/{slug}`)
 * but allows listing pages — we only need listings.
 */
export function mapGlobusProducts(html: string, listingUrl: string): Product[] {
  const arr = extractNuxtArray(html);
  if (!arr) return [];
  const products: Product[] = [];
  for (const item of arr) {
    if (!isProductNode(item)) continue;
    const p = mapNode(arr, item, listingUrl);
    if (p) products.push(p);
  }
  return products;
}

function isProductNode(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const keys = item as Record<string, unknown>;
  return 'ean' in keys && 'calculatedPrice' in keys && 'name' in keys;
}

function mapNode(
  arr: NuxtArray,
  node: Record<string, unknown>,
  listingUrl: string,
): Product | null {
  const name = readString(arr, node.name);
  const vanr = readString(arr, node.vanr);
  if (!name || !vanr) return null;

  const cp = readObject(arr, node.calculatedPrice);
  const price = readNumber(arr, cp?.currentPrice);
  if (price === undefined || !Number.isFinite(price) || price <= 0) return null;

  const ean = readEan(arr, node.ean);
  const brand = readBrandName(arr, node.brand);
  const sellUnit = readString(arr, node.sellUnitSizeText);
  const qty = parseQuantity(sellUnit ?? name);

  return {
    store: 'globus',
    id: vanr,
    name,
    brand,
    ean,
    price,
    currency: 'CZK',
    unit: qty?.unit,
    quantity: qty?.quantity,
    available: true,
    url: listingUrl,
    scrapedAt: new Date().toISOString(),
  };
}

function readEan(arr: NuxtArray, ref: unknown): string | undefined {
  // Globus wraps EAN in a single-element array: [refIndex] → arr[refIndex] = string
  const list = readList(arr, ref);
  if (!list || list.length === 0) return undefined;
  return readString(arr, list[0]);
}

function readBrandName(arr: NuxtArray, ref: unknown): string | undefined {
  const brand = readObject(arr, ref);
  if (!brand) return undefined;
  const name = readString(arr, brand.name);
  // Globus uses "Normální" for unbranded house items — treat as no brand.
  return name && name !== 'Normální' ? name : undefined;
}
