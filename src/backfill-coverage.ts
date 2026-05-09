/**
 * One-shot backfill: walk every data/raw/<chain>/<date>.jsonl, count rows +
 * any sibling errors.json, and append cells to coverage.json.gz. Idempotent
 * — re-running just refreshes the same cells.
 *
 * Run with `npx tsx src/backfill-coverage.ts`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readScrapeLog, recordScrapeDay, writeScrapeLog } from './common/scrape-log.ts';
import type { Store } from './common/types.ts';

const STORES: Store[] = ['tesco', 'rohlik', 'kosik', 'billa', 'penny', 'globus', 'kaufland'];
const PATH = 'data/canonical/coverage.json.gz';

async function main(): Promise<void> {
  const log = await readScrapeLog(PATH);
  for (const store of STORES) {
    const dir = `data/raw/${store}`;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (!m) continue;
      const date = m[1]!;
      const body = await readFile(join(dir, f), 'utf8');
      const products = body.split('\n').filter(Boolean).length;
      let errors = 0;
      try {
        const e = await readFile(join(dir, `${date}.errors.json`), 'utf8');
        const arr = JSON.parse(e) as unknown[];
        errors = Array.isArray(arr) ? arr.length : 0;
      } catch {
        /* no errors file */
      }
      recordScrapeDay(log, store, date, { products, errors });
      console.log(`  ${store.padEnd(8)} ${date}  ${String(products).padStart(6)} prod  ${errors} err`);
    }
  }
  await writeScrapeLog(PATH, log);
  console.log(`\nlastUpdated: ${log.lastUpdated}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
