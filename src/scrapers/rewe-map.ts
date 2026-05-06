import {
  extractNuxtArray,
  findFirstWithKeys,
  readList,
  readNumber,
  readObject,
  readString,
  type NuxtArray,
} from '../common/nuxt-payload.ts';
import { parseQuantity, type Unit } from '../common/quantity.ts';
import type { Product, Store } from '../common/types.ts';

const PRODUCT_KEYS = ['sku', 'slug', 'productId', 'name'];

/**
 * Billa and Penny share the same REWE Nuxt 3 storefront. The product page
 * embeds a flat `__NUXT_DATA__` array; this maps it to a canonical Product.
 */
export function mapReweProduct(html: string, url: string, store: Store): Product | null {
  const arr = extractNuxtArray(html);
  if (!arr) return null;

  const node = findFirstWithKeys(arr, PRODUCT_KEYS);
  if (!node) return null;

  const name = readString(arr, node.name);
  const sku = readString(arr, node.sku);
  if (!name || !sku) return null;

  const price = readPrice(arr, node.price);
  if (price === undefined) return null;

  const brand = readBrandName(arr, node.brand);
  const category = readCategoryPath(arr, node.parentCategories);
  const { unit, quantity } = readQuantity(arr, node, name);

  return {
    store,
    id: sku,
    name,
    brand,
    category,
    price,
    currency: 'CZK',
    unit,
    quantity,
    available: true, // REWE storefront only renders published products
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function readPrice(arr: NuxtArray, priceRef: unknown): number | undefined {
  const priceObj = readObject(arr, priceRef);
  const regular = readObject(arr, priceObj?.regular);
  const halers = readNumber(arr, regular?.value);
  if (halers === undefined || !Number.isFinite(halers)) return undefined;
  // REWE stores prices in halers (CZK × 100). Round to 2 decimals.
  return Math.round(halers) / 100;
}

function readBrandName(arr: NuxtArray, brandRef: unknown): string | undefined {
  const brand = readObject(arr, brandRef);
  return brand ? readString(arr, brand.name) : undefined;
}

function readCategoryPath(arr: NuxtArray, ref: unknown): string | undefined {
  // parentCategories is array-of-arrays; the first inner array is the breadcrumb.
  const outer = readList(arr, ref);
  if (!outer || outer.length === 0) return undefined;
  const inner = readList(arr, outer[0]);
  if (!inner) return undefined;
  const names: string[] = [];
  for (const ref of inner) {
    const cat = readObject(arr, ref);
    const name = cat ? readString(arr, cat.name) : undefined;
    if (name) names.push(name);
  }
  return names.length > 0 ? names.join(' > ') : undefined;
}

function readQuantity(
  arr: NuxtArray,
  node: Record<string, unknown>,
  name: string,
): { unit?: Unit; quantity?: number } {
  // Prefer the structured weight (in kg) when packageLabelKey indicates weight unit
  const weightKg = readNumber(arr, node.weight);
  const labelKey = readString(arr, node.packageLabelKey);
  if (typeof weightKg === 'number' && weightKg > 0 && labelKey === 'kg') {
    return { unit: 'g', quantity: Math.round(weightKg * 1000) };
  }
  // Fall back to parsing from name
  const fromName = parseQuantity(name);
  return fromName ? { unit: fromName.unit, quantity: fromName.quantity } : {};
}
