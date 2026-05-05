import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import type { Product } from './types.ts';
import { cleanProduct, cleanString } from './validate.ts';

const baseProduct: Product = {
  store: 'tesco',
  id: '1',
  name: 'Test',
  price: 10,
  currency: 'CZK',
  available: true,
  url: 'https://example.com/p/1',
  scrapedAt: '2026-01-01T00:00:00Z',
};

describe('cleanString', () => {
  test('collapses NBSP and zero-width chars', () => {
    assert.equal(cleanString('Tesco Finest'), 'Tesco Finest');
    assert.equal(cleanString('a​b'), 'ab');
    assert.equal(cleanString('  hello   world  '), 'hello world');
  });
});

describe('cleanProduct', () => {
  test('rejects products with non-positive or absurd price', () => {
    assert.equal(cleanProduct({ ...baseProduct, price: 0 }).product, null);
    assert.equal(cleanProduct({ ...baseProduct, price: -1 }).product, null);
    assert.equal(cleanProduct({ ...baseProduct, price: 999_999 }).product, null);
  });

  test('drops invalid EAN but keeps the product', () => {
    const out = cleanProduct({ ...baseProduct, ean: '1234567890123' });
    assert.equal(out.product?.ean, undefined);
    assert.match(out.warnings[0]!, /invalid EAN/);
  });

  test('keeps valid EAN', () => {
    const out = cleanProduct({ ...baseProduct, ean: '8720181334740' });
    assert.equal(out.product?.ean, '8720181334740');
  });

  test('canonicalizes brand alias', () => {
    const out = cleanProduct({ ...baseProduct, brand: 'TESCO' });
    assert.equal(out.product?.brand, 'Tesco');
  });

  test('strips tracking query params from url', () => {
    const out = cleanProduct({
      ...baseProduct,
      url: 'https://example.com/p/1?utm_source=foo&icid=bar&keep=me',
    });
    assert.equal(out.product?.url, 'https://example.com/p/1?keep=me');
  });
});
