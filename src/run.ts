import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scrapeKosik } from './scrapers/kosik.ts';
import { scrapeRohlik } from './scrapers/rohlik.ts';
import { scrapeTesco } from './scrapers/tesco.ts';
import type { ScrapeResult, Store } from './common/types.ts';

interface Runner {
  store: Store;
  run: (limit?: number) => Promise<ScrapeResult>;
}

const RUNNERS: Runner[] = [
  { store: 'tesco', run: (limit) => scrapeTesco({ limit }) },
  { store: 'rohlik', run: (limit) => scrapeRohlik({ limit }) },
  { store: 'kosik', run: (limit) => scrapeKosik({ limit }) },
];

const DATA_DIR = 'data';

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

  const results = await Promise.all(
    targets.map(async (r) => {
      const t0 = Date.now();
      console.log(`[${r.store}] starting${limit ? ` (limit ${limit})` : ''}`);
      try {
        const result = await r.run(limit);
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `[${r.store}] done in ${dt}s — ${result.products.length} products, ${result.errors.length} errors`,
        );
        return { store: r.store, result };
      } catch (err) {
        console.error(`[${r.store}] FAILED:`, err);
        return null;
      }
    }),
  );

  for (const entry of results) {
    if (!entry) continue;
    const dir = join(DATA_DIR, 'raw', entry.store);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${date}.jsonl`);
    const lines = entry.result.products.map((p) => JSON.stringify(p)).join('\n');
    await writeFile(path, lines + '\n');
    console.log(`[${entry.store}] wrote ${path}`);

    if (entry.result.errors.length > 0) {
      const errPath = join(dir, `${date}.errors.json`);
      await writeFile(errPath, JSON.stringify(entry.result.errors, null, 2));
    }
  }
}

await main();
