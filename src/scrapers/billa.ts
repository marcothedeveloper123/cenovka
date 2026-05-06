import { fetchText } from '../common/fetch.ts';
import { mapPool } from '../common/pool.ts';
import { parseSitemapUrls } from '../common/sitemap.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';
import { mapReweProduct } from './rewe-map.ts';

const SITEMAP = 'https://www.billa.cz/sitemap.xml';
const STORE = 'billa' as const;

export interface BillaOptions {
  limit?: number;
  concurrency?: number;
}

export async function scrapeBilla(opts: BillaOptions = {}): Promise<ScrapeResult> {
  const { limit, concurrency = 6 } = opts;
  const startedAt = new Date().toISOString();

  const xml = await fetchText(SITEMAP);
  const all = parseSitemapUrls(xml).filter((u) => /\/produkt\//.test(u));
  const urls = limit ? all.slice(0, limit) : all;

  const products: Product[] = [];
  const errors: ScrapeResult['errors'] = [];

  await mapPool(urls, concurrency, async (url) => {
    try {
      const html = await fetchText(url);
      const raw = mapReweProduct(html, url, STORE);
      if (!raw) return;
      const { product } = cleanProduct(raw);
      if (product) products.push(product);
    } catch (err) {
      errors.push({ url, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return { store: STORE, startedAt, finishedAt: new Date().toISOString(), products, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const result = await scrapeBilla({ limit });
  console.error(`[billa] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
