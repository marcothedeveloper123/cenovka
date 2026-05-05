import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { assemble, updateHistory } from './assemble-core.ts';
import type { CanonicalDataset, Product } from './types.ts';

const baseProduct: Product = {
  store: 'tesco',
  id: '1',
  name: 'Butter',
  price: 50,
  currency: 'CZK',
  available: true,
  url: 'https://example.com/1',
  scrapedAt: '2026-05-05T00:00:00Z',
};

const today = '2026-05-05';
const yesterday = '2026-05-04';

describe('updateHistory', () => {
  test('starts an empty history', () => {
    assert.deepEqual(updateHistory([], 50, today), [{ date: today, price: 50 }]);
  });

  test('no-op when latest entry matches today and price', () => {
    const h = [{ date: today, price: 50 }];
    assert.deepEqual(updateHistory(h, 50, today), h);
  });

  test('replaces same-day entry when price differs (re-run correction)', () => {
    const h = [{ date: today, price: 50 }];
    assert.deepEqual(updateHistory(h, 60, today), [{ date: today, price: 60 }]);
  });

  test('prepends when price changed from a prior date', () => {
    const h = [{ date: yesterday, price: 50 }];
    assert.deepEqual(updateHistory(h, 60, today), [
      { date: today, price: 60 },
      { date: yesterday, price: 50 },
    ]);
  });

  test('no-op when price unchanged from a prior date', () => {
    const h = [{ date: yesterday, price: 50 }];
    assert.deepEqual(updateHistory(h, 50, today), h);
  });
});

describe('assemble', () => {
  test('first run: every product is "appeared" with single-entry history', () => {
    const { dataset, metrics } = assemble([baseProduct], null, today);
    assert.equal(dataset.products.length, 1);
    assert.equal(dataset.products[0]!.priceHistory.length, 1);
    assert.equal(metrics.appeared, 1);
    assert.equal(metrics.disappeared, 0);
  });

  test('disappeared product is carried forward as unavailable', () => {
    const prior: CanonicalDataset = {
      schema: 1,
      generatedAt: yesterday,
      products: [{ ...baseProduct, priceHistory: [{ date: yesterday, price: 50 }] }],
    };
    const { dataset, metrics } = assemble([], prior, today);
    assert.equal(dataset.products.length, 1);
    assert.equal(dataset.products[0]!.available, false);
    assert.equal(metrics.disappeared, 1);
  });

  test('price increase is counted and history grows', () => {
    const prior: CanonicalDataset = {
      schema: 1,
      generatedAt: yesterday,
      products: [
        { ...baseProduct, price: 40, priceHistory: [{ date: yesterday, price: 40 }] },
      ],
    };
    const { dataset, metrics } = assemble([{ ...baseProduct, price: 50 }], prior, today);
    assert.equal(metrics.priceUp, 1);
    assert.equal(metrics.priceDown, 0);
    assert.equal(dataset.products[0]!.priceHistory.length, 2);
    assert.equal(dataset.products[0]!.priceHistory[0]!.price, 50);
  });
});
