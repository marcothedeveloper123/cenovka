import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openProductWriter, type ProductWriter } from './common/product-writer.ts';
import type { Product, ScrapeResult, Store } from './common/types.ts';
import { scrapeBilla } from './scrapers/billa.ts';
import { scrapeGlobus } from './scrapers/globus.ts';
import { scrapeKaufland } from './scrapers/kaufland.ts';
import { scrapeKosik } from './scrapers/kosik.ts';
import { scrapePenny } from './scrapers/penny.ts';
import { scrapeRohlik } from './scrapers/rohlik.ts';
import { scrapeTesco } from './scrapers/tesco.ts';

interface Runner {
  store: Store;
  run: (limit: number | undefined, onProduct: (p: Product) => void) => Promise<ScrapeResult>;
}

const RUNNERS: Runner[] = [
  { store: 'tesco', run: (limit, onProduct) => scrapeTesco({ limit, onProduct }) },
  { store: 'rohlik', run: (limit, onProduct) => scrapeRohlik({ limit, onProduct }) },
  { store: 'kosik', run: (limit, onProduct) => scrapeKosik({ limit, onProduct }) },
  { store: 'billa', run: (limit, onProduct) => scrapeBilla({ limit, onProduct }) },
  { store: 'penny', run: (limit, onProduct) => scrapePenny({ limit, onProduct }) },
  { store: 'globus', run: (limit, onProduct) => scrapeGlobus({ limit, onProduct }) },
  { store: 'kaufland', run: (limit, onProduct) => scrapeKaufland({ limit, onProduct }) },
];

const DATA_DIR = 'data';

async function runOne(
  runner: Runner,
  limit: number | undefined,
  date: string,
): Promise<{ store: Store; result: ScrapeResult; written: number } | null> {
  const t0 = Date.now();
  const path = join(DATA_DIR, 'raw', runner.store, `${date}.jsonl`);
  console.log(`[${runner.store}] starting${limit ? ` (limit ${limit})` : ''} → ${path}`);

  let writer: ProductWriter | null = null;
  try {
    writer = await openProductWriter(path);
    const result = await runner.run(limit, (p) => writer!.write(p));
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[${runner.store}] done in ${dt}s — ${result.products.length} products, ${result.errors.length} errors`,
    );
    return { store: runner.store, result, written: writer.count };
  } catch (err) {
    console.error(`[${runner.store}] FAILED:`, err);
    return null;
  } finally {
    if (writer) await writer.close();
  }
}

async function main(): Promise<void> {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : undefined;

  const date = new Date().toISOString().slice(0, 10);
  const targets = only ? RUNNERS.filter((r) => r.store === only) : RUNNERS;

  if (targets.length === 0) {
    console.error(`No runner matched --only ${only}`);
    process.exit(1);
  }

  const results = await Promise.all(targets.map((r) => runOne(r, limit, date)));

  for (const entry of results) {
    if (!entry || entry.result.errors.length === 0) continue;
    const errPath = join(DATA_DIR, 'raw', entry.store, `${date}.errors.json`);
    await writeFile(errPath, JSON.stringify(entry.result.errors, null, 2));
    console.log(`[${entry.store}] wrote ${errPath} (${entry.result.errors.length} errors)`);
  }
}

await main();
