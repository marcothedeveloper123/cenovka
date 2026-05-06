import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import type { Product } from './types.ts';
import { cleanProduct, cleanString, normalizeEan } from './validate.ts';

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

  test('normalizes Tesco-style padded GTIN-14 to canonical EAN-13', () => {
    // Tesco emits "08593837256846" (14-digit GTIN with leading zero).
    // Globus emits "8593837256846" (raw 13-digit). Both must canonicalize
    // to the same string so the matcher / EAN-link logic finds them equal.
    const tesco = cleanProduct({ ...baseProduct, ean: '08593837256846' });
    const globus = cleanProduct({ ...baseProduct, ean: '8593837256846' });
    assert.equal(tesco.product?.ean, globus.product?.ean);
    assert.equal(tesco.product?.ean, '8593837256846');
  });
});

describe('normalizeEan', () => {
  test('strips leading zeros and re-pads to 13', () => {
    assert.equal(normalizeEan('08593837256846'), '8593837256846');
    assert.equal(normalizeEan('8593837256846'), '8593837256846');
  });
  test('leaves EAN-8 alone (different scheme, not padded EAN-13)', () => {
    assert.equal(normalizeEan('40156886'), '40156886');
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
