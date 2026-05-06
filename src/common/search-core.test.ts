import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { normalise, searchProducts, tokenize, unitPriceOf } from './search-core.ts';
import type { CanonicalProduct } from './types.ts';

function product(extra: Partial<CanonicalProduct>): CanonicalProduct {
  return {
    store: 'tesco',
    id: '1',
    name: 'Máslo 250 g',
    price: 60,
    currency: 'CZK',
    available: true,
    unit: 'g',
    quantity: 250,
    url: 'https://example.com/1',
    scrapedAt: '2026-05-06T00:00:00Z',
    priceHistory: [{ date: '2026-05-06', price: 60 }],
    ...extra,
  };
}

describe('normalise', () => {
  test('folds Czech diacritics and lowercases', () => {
    assert.equal(normalise('Máslo Žlučník čaj'), 'maslo zlucnik caj');
    assert.equal(normalise('1.35 L'), '1.35 l');
  });
});

describe('tokenize', () => {
  test('splits on whitespace and drops empties', () => {
    assert.deepEqual(tokenize('  Máslo  Selské  '), ['maslo', 'selske']);
    assert.deepEqual(tokenize(''), []);
  });
});

describe('unitPriceOf', () => {
  test('CZK per 100g for grams', () => {
    const u = unitPriceOf(product({}));
    assert.deepEqual(u, { value: 24, per: '100g' });
  });

  test('CZK per 100ml for ml', () => {
    const u = unitPriceOf(product({ price: 50, unit: 'ml', quantity: 500 }));
    assert.deepEqual(u, { value: 10, per: '100ml' });
  });

  test('returns undefined when quantity unknown', () => {
    assert.equal(unitPriceOf(product({ quantity: undefined })), undefined);
  });
});

describe('searchProducts', () => {
  const items = [
    product({ id: 'a', name: 'Máslo Selské 250 g', brand: 'Madeta' }),
    product({ id: 'b', name: 'Mléko Plnotučné 1 l', unit: 'ml', quantity: 1000, price: 30 }),
    product({ id: 'c', name: 'Margarín 500 g', price: 40 }),
  ];

  test('matches all tokens across name/brand/category', () => {
    assert.equal(searchProducts(items, 'maslo').length, 1);
    assert.equal(searchProducts(items, 'madeta').length, 1);
    assert.equal(searchProducts(items, 'maslo selske').length, 1);
    assert.equal(searchProducts(items, 'maslo selske 250').length, 1);
  });

  test('returns empty for no-match', () => {
    assert.equal(searchProducts(items, 'kakao').length, 0);
  });

  test('empty query returns empty', () => {
    assert.equal(searchProducts(items, '').length, 0);
  });
});
