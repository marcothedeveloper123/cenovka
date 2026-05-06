import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { mapReweProduct } from './rewe-map.ts';

/**
 * Smallest synthetic Nuxt payload that exercises the schema-aware deref path:
 * a product node whose values are all integer refs into the array.
 */
function buildPayload(): string {
  // Layout (indices):
  //  0: payload entry (unused here)
  //  1: name string
  //  2: sku string
  //  3: slug string
  //  4: productId string
  //  5: brand object   { name: 6, slug: 7 }
  //  6: brand.name string
  //  7: brand.slug string
  //  8: price object   { regular: 9 }
  //  9: regular object { value: 10 }
  // 10: price in halers (number)
  // 11: parentCategories outer  [[12]]   (array of inner-arrays)
  // 12: cat object    { name: 13 }
  // 13: cat.name string
  // 14: weight number 0.25 (kg)
  // 15: packageLabelKey "kg"
  // 16: product node — values are refs to the above
  const arr: unknown[] = [];
  arr[0] = ['ROOT'];
  arr[1] = 'BILLA Vaječné vafle 250g';
  arr[2] = '82-315860';
  arr[3] = 'billa-vafle';
  arr[4] = 'product-uuid';
  arr[5] = { name: 6, slug: 7 };
  arr[6] = 'BILLA';
  arr[7] = 'billa';
  arr[8] = { regular: 9 };
  arr[9] = { value: 10 };
  arr[10] = 4190;
  arr[11] = [12];
  arr[12] = [13];
  arr[13] = { name: 18 };
  arr[14] = 0.25;
  arr[15] = 'kg';
  arr[16] = {
    name: 1,
    sku: 2,
    slug: 3,
    productId: 4,
    brand: 5,
    price: 8,
    parentCategories: 11,
    weight: 14,
    packageLabelKey: 15,
  };
  arr[17] = 'unused';
  arr[18] = 'Pečivo';

  return `<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(arr)}</script>`;
}

describe('mapReweProduct', () => {
  test('extracts name, sku, brand, price (in CZK), category, qty', () => {
    const p = mapReweProduct(buildPayload(), 'https://www.billa.cz/produkt/x', 'billa');
    assert.equal(p?.id, '82-315860');
    assert.equal(p?.name, 'BILLA Vaječné vafle 250g');
    assert.equal(p?.brand, 'BILLA');
    assert.equal(p?.price, 41.9);
    assert.equal(p?.category, 'Pečivo');
    assert.equal(p?.unit, 'g');
    assert.equal(p?.quantity, 250);
  });

  test('returns null when payload absent', () => {
    assert.equal(mapReweProduct('<html></html>', 'https://x', 'penny'), null);
  });
});
