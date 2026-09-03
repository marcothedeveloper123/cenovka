import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CanonicalDataset, ReferenceDataset } from './common/types.ts';

test('csu-audit is importable without running main and counts stages', async () => {
  const { audit, format } = await import('./csu-audit.ts');
  const reference: ReferenceDataset = {
    schema: 1, source: 'csu', generatedAt: 'x',
    items: [{ code: '01152001', label: 'Máslo [1 kg]', name: 'Máslo', packaging: '1 kg', unit: 'g', quantity: 1000, coicop: '01152', history: [{ month: '2026-07', price: 117.54 }] }],
  };
  const canonical: CanonicalDataset = {
    schema: 1, generatedAt: 'x',
    products: [
      { store: 'tesco', id: 'a', name: 'Máslo 250g', price: 48, currency: 'CZK', unit: 'g', quantity: 250, available: true, url: 'u', scrapedAt: 's', categoryCanonical: 'mlecne', priceHistory: [] },
      // quantity parsed as 1 g → 48 000 Kč/kg, a keyword hit the band must reject
      { store: 'kosik', id: 'b', name: 'Máslo', price: 48, currency: 'CZK', unit: 'g', quantity: 1, available: true, url: 'u', scrapedAt: 's', categoryCanonical: 'mlecne', priceHistory: [] },
    ],
  };
  const rows = audit(canonical, reference).filter((r) => r.code === '01152001');
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.keywordHits, 2);
  assert.equal(r.inBand, 1);
  assert.equal(r.median, 192); // 48 / 250 g × 1000
  assert.equal(r.rejectedByBand.length, 1);
  assert.match(format(rows), /Máslo \[1 kg\].*kw {4}2 {2}band {4}1/);
  assert.match(format(rows), /fewer than 5/);
});
