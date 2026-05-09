import { describe, it } from 'node:test';
import assert from 'node:assert';
import { recordScrapeDay, type ScrapeLog } from './scrape-log.ts';

describe('recordScrapeDay', () => {
  it('inserts a new (chain, date) cell', () => {
    const c: ScrapeLog = { schema: 1, lastUpdated: '', perChain: {} };
    recordScrapeDay(c, 'tesco', '2026-05-09', { products: 19112, errors: 0 });
    assert.equal(c.perChain.tesco?.['2026-05-09']?.products, 19112);
    assert.equal(c.lastUpdated, '2026-05-09');
  });

  it('updates an existing cell in place', () => {
    const c: ScrapeLog = {
      schema: 1,
      lastUpdated: '2026-05-08',
      perChain: { tesco: { '2026-05-08': { products: 1, errors: 0 } } },
    };
    recordScrapeDay(c, 'tesco', '2026-05-08', { products: 19086, errors: 0 });
    assert.equal(c.perChain.tesco?.['2026-05-08']?.products, 19086);
    assert.equal(c.lastUpdated, '2026-05-08');
  });

  it('does not move lastUpdated backwards', () => {
    const c: ScrapeLog = { schema: 1, lastUpdated: '2026-05-09', perChain: {} };
    recordScrapeDay(c, 'tesco', '2026-05-07', { products: 19086, errors: 0 });
    assert.equal(c.lastUpdated, '2026-05-09');
  });
});
