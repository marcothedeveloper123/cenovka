import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { computeCoverage, pct } from './coverage.ts';
import type { Product } from './types.ts';

const base: Product = {
  store: 'tesco',
  id: '1',
  name: 'X',
  price: 10,
  currency: 'CZK',
  available: true,
  url: 'https://example.com/1',
  scrapedAt: '2026-01-01T00:00:00Z',
};

describe('pct', () => {
  test('formats percentages right-padded', () => {
    assert.equal(pct(1, 10).trim(), '10%');
    assert.equal(pct(0, 0).trim(), '-');
  });
});

describe('computeCoverage', () => {
  test('groups products by store and counts feature coverage', () => {
    const products: Product[] = [
      { ...base, id: '1', brand: 'A', ean: '8720181334740', quantity: 100 },
      { ...base, id: '2', brand: 'B', category: 'Food' },
      { ...base, id: '3', store: 'rohlik', category: 'X', quantity: 50 },
    ];
    const cov = computeCoverage(products);
    assert.equal(cov.tesco?.total, 2);
    assert.equal(cov.tesco?.withBrand, 2);
    assert.equal(cov.tesco?.withEan, 1);
    assert.equal(cov.tesco?.withQuantity, 1);
    assert.equal(cov.rohlik?.total, 1);
    assert.equal(cov.rohlik?.withCategory, 1);
  });

  test('counts unavailable products separately', () => {
    const products: Product[] = [
      { ...base, id: '1' },
      { ...base, id: '2', available: false },
    ];
    const cov = computeCoverage(products);
    assert.equal(cov.tesco?.total, 2);
    assert.equal(cov.tesco?.available, 1);
  });
});
