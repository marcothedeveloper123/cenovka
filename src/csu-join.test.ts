import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CanonicalDataset, ReferenceDataset } from './common/types.ts';

test('csu-join is importable without running main, and groups by ČSÚ code', async () => {
  const { buildMembers } = await import('./csu-join.ts');
  const reference: ReferenceDataset = {
    schema: 1, source: 'csu', generatedAt: 'x',
    items: [{ code: '01152001', label: 'Máslo [1 kg]', name: 'Máslo', packaging: '1 kg', unit: 'g', quantity: 1000, coicop: '01152', history: [{ month: '2026-07', price: 117.54 }] }],
  };
  const canonical: CanonicalDataset = {
    schema: 1, generatedAt: 'x',
    products: [
      { store: 'tesco', id: 'a', name: 'Máslo 250g', price: 48, currency: 'CZK', unit: 'g', quantity: 250, available: true, url: 'u', scrapedAt: 's', categoryCanonical: 'mlecne', priceHistory: [] },
      { store: 'billa', id: 'b', name: 'Máslo 250g', price: 52, currency: 'CZK', unit: 'g', quantity: 250, available: false, url: 'u', scrapedAt: 's', categoryCanonical: 'mlecne', priceHistory: [] },
      { store: 'kosik', id: 'c', name: 'Rama Máslová příchuť', price: 45, currency: 'CZK', unit: 'g', quantity: 400, available: true, url: 'u', scrapedAt: 's', categoryCanonical: 'mlecne', priceHistory: [] },
    ],
  };
  const members = buildMembers(canonical, reference);
  assert.deepEqual(members, { '01152001': ['tesco::a'] }, 'unavailable and margarine excluded');
});
