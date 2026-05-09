import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { extractKosikSlug, mapKosikApi, type KosikApiResponse } from './kosik-map.ts';

describe('extractKosikSlug', () => {
  test('extracts slug from canonical URL', () => {
    assert.equal(
      extractKosikSlug('https://www.kosik.cz/p138487-jelen-kondicioner-1-35l'),
      'p138487-jelen-kondicioner-1-35l',
    );
  });

  test('returns null for non-product URLs', () => {
    assert.equal(extractKosikSlug('https://www.kosik.cz/'), null);
    assert.equal(extractKosikSlug('https://www.kosik.cz/c123-cat'), null);
  });
});

describe('mapKosikApi', () => {
  const url = 'https://www.kosik.cz/p1-test';

  test('maps a complete product response', () => {
    const data: KosikApiResponse = {
      product: {
        id: 1,
        name: 'Test',
        brand: { name: 'Brand' },
        price: 50,
        productQuantity: { value: 250, unit: 'g' },
        mainCategory: { name: 'Foo' },
        availability: { inStock: true },
      },
      breadcrumbs: [{ name: 'A' }, { name: 'B' }],
    };
    const p = mapKosikApi(data, url);
    assert.equal(p?.id, '1');
    assert.equal(p?.brand, 'Brand');
    assert.equal(p?.unit, 'g');
    assert.equal(p?.quantity, 250);
    assert.equal(p?.category, 'A > B');
  });

  test('falls back to mainCategory when no breadcrumbs', () => {
    const data: KosikApiResponse = {
      product: { id: 2, name: 'X', price: 10, mainCategory: { name: 'Drogerie' }, availability: {} },
    };
    assert.equal(mapKosikApi(data, url)?.category, 'Drogerie');
  });

  test('returns null for malformed responses', () => {
    assert.equal(
      mapKosikApi({ product: { id: 'x' as unknown as number, name: '', price: 0 } }, url),
      null,
    );
  });

  test('drops delisted/phantom products (availability=null)', () => {
    // Real example: Marila Standard 70g (Košík id 260184) — slug API returns
    // 200 with a product object but availability=null; the search UI hides it.
    // Without this guard the matcher EAN-merges it into the Tesco group and
    // shows an absurd 269 Kč alternate.
    const data: KosikApiResponse = {
      product: {
        id: 260184,
        name: 'Marila Standard káva mletá',
        brand: { name: 'Marila' },
        price: 269,
        availability: null,
      },
    };
    assert.equal(mapKosikApi(data, url), null);
  });
});
