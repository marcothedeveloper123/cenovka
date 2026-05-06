/**
 * One-shot pass that re-runs cleanProduct on existing raw JSONL files,
 * picking up any improvements to validate.ts / categories.ts / scraper-side
 * derivations without re-scraping. Useful when a mapping bug is fixed and
 * we want today's data reclassified without paying the network cost.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { categoryFromListingUrl } from './scrapers/globus-map.ts';
import type { Product, Store } from './common/types.ts';
import { cleanProduct } from './common/validate.ts';

const STORES: Store[] = ['tesco', 'rohlik', 'kosik', 'lidl', 'billa', 'penny', 'globus', 'kaufland'];

async function reclassifyChain(store: Store, date: string): Promise<{ before: number; after: number }> {
  const path = join('data', 'raw', store, `${date}.jsonl`);
  let body: string;
  try {
    body = await readFile(path, 'utf8');
  } catch {
    return { before: 0, after: 0 };
  }
  const lines = body.split('\n').filter((l) => l.trim());
  let kept = 0;
  const out: string[] = [];
  for (const line of lines) {
    const raw = JSON.parse(line) as Product;
    // Globus-specific: derive `category` from the listing URL on re-pass.
    if (store === 'globus' && !raw.category) {
      const cat = categoryFromListingUrl(raw.url);
      if (cat) raw.category = cat;
    }
    const { product } = cleanProduct(raw);
    if (product) {
      kept += 1;
      out.push(JSON.stringify(product));
    }
  }
  await writeFile(path, out.join('\n') + '\n');
  return { before: lines.length, after: kept };
}

async function main(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  for (const store of STORES) {
    const r = await reclassifyChain(store, date);
    if (r.before === 0) continue;
    console.log(`[reclassify] ${store}: ${r.after}/${r.before}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
