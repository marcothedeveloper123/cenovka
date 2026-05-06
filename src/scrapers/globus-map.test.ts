import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { categoryFromListingUrl, mapGlobusProducts } from './globus-map.ts';

function buildPayload(): string {
  // Synthetic Globus product node — values are integer refs into the array.
  // Layout:
  //  0: payload entry
  //  1: name
  //  2: vanr
  //  3: brand object         { name: 4, brandId: 5 }
  //  4: brand.name
  //  5: brand.brandId
  //  6: ean wrapper           [7]
  //  7: ean string
  //  8: calculatedPrice obj   { currentPrice: 9, normalPrice: 10 }
  //  9: currentPrice number
  // 10: normalPrice number
  // 11: sellUnitSizeText
  // 12: product node
  const arr: unknown[] = [];
  arr[0] = ['ROOT'];
  arr[1] = 'Termosáček Globus 25x35 cm 1 ks';
  arr[2] = '00920194001';
  arr[3] = { name: 4, brandId: 5 };
  arr[4] = 'Globus';
  arr[5] = 99;
  arr[6] = [7];
  arr[7] = '2001800060063';
  arr[8] = { currentPrice: 9, normalPrice: 10 };
  arr[9] = 6.9;
  arr[10] = 0;
  arr[11] = '1 ks';
  arr[12] = {
    name: 1,
    vanr: 2,
    brand: 3,
    ean: 6,
    calculatedPrice: 8,
    sellUnitSizeText: 11,
  };
  return `<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(arr)}</script>`;
}

describe('mapGlobusProducts', () => {
  test('extracts a product with name, vanr, ean, brand, price, unit', () => {
    const html = buildPayload();
    const products = mapGlobusProducts(html, 'https://www.globus.cz/globus/hypermarket/cela-nabidka/x');
    assert.equal(products.length, 1);
    const p = products[0]!;
    assert.equal(p.id, '00920194001');
    assert.equal(p.ean, '2001800060063');
    assert.equal(p.brand, 'Globus');
    assert.equal(p.price, 6.9);
    assert.equal(p.unit, 'ks');
    assert.equal(p.quantity, 1);
  });

  test('drops the "Normální" placeholder brand', () => {
    const arr: unknown[] = ['root'];
    arr[1] = 'X';
    arr[2] = 'V1';
    arr[3] = { name: 4, brandId: 5 };
    arr[4] = 'Normální';
    arr[5] = 0;
    arr[6] = [7];
    arr[7] = '1234567890128';
    arr[8] = { currentPrice: 9, normalPrice: 10 };
    arr[9] = 10;
    arr[10] = 0;
    arr[11] = { name: 1, vanr: 2, brand: 3, ean: 6, calculatedPrice: 8 };
    const html = `<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(arr)}</script>`;
    const products = mapGlobusProducts(html, 'https://x');
    assert.equal(products[0]?.brand, undefined);
  });

  test('returns empty when no payload', () => {
    assert.deepEqual(mapGlobusProducts('<html></html>', 'https://x'), []);
  });
});

describe('categoryFromListingUrl', () => {
  test('extracts breadcrumb segments after cela-nabidka', () => {
    assert.equal(
      categoryFromListingUrl('https://www.globus.cz/globus/hypermarket/cela-nabidka/mlecne-vyrobky/jogurty'),
      'mlecne-vyrobky > jogurty',
    );
  });

  test('skips the "top-produkty" prefix', () => {
    assert.equal(
      categoryFromListingUrl('https://www.globus.cz/globus/hypermarket/cela-nabidka/top-produkty/drogerie'),
      'drogerie',
    );
  });

  test('returns undefined for non-listing URLs', () => {
    assert.equal(categoryFromListingUrl('https://www.globus.cz/'), undefined);
  });
});
