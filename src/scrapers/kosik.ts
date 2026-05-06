import { fetchJson, fetchText } from '../common/fetch.ts';
import { consoleProgress, mapPool } from '../common/pool.ts';
import { parseSitemapUrls } from '../common/sitemap.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';
import { extractKosikSlug, mapKosikApi, type KosikApiResponse } from './kosik-map.ts';

const SITEMAPS = [
  'https://www.kosik.cz/products_01.xml',
  'https://www.kosik.cz/products_02.xml',
];
const API = 'https://www.kosik.cz/api/front/product/slug';
const STORE = 'kosik' as const;

export interface KosikOptions {
  limit?: number;
  concurrency?: number;
}

export async function scrapeKosik(opts: KosikOptions = {}): Promise<ScrapeResult> {
  const { limit, concurrency = 8 } = opts;
  const startedAt = new Date().toISOString();
  const slugs = await collectSlugs(limit);

  const products: Product[] = [];
  const errors: ScrapeResult['errors'] = [];

  await mapPool(
    slugs,
    concurrency,
    async (slug) => {
      const url = `https://www.kosik.cz/${slug}`;
      try {
        const data = await fetchJson<KosikApiResponse>(`${API}/${slug}`);
        const raw = mapKosikApi(data, url);
        if (!raw) return;
        const { product } = cleanProduct(raw);
        if (product) products.push(product);
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    },
    { onProgress: consoleProgress(STORE) },
  );

  return { store: STORE, startedAt, finishedAt: new Date().toISOString(), products, errors };
}

async function collectSlugs(limit: number | undefined): Promise<string[]> {
  const urls: string[] = [];
  for (const map of SITEMAPS) {
    const xml = await fetchText(map);
    urls.push(...parseSitemapUrls(xml));
    if (limit && urls.length >= limit) break;
  }
  const slugs = urls.map(extractKosikSlug).filter((s): s is string => Boolean(s));
  return limit ? slugs.slice(0, limit) : slugs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const result = await scrapeKosik({ limit });
  console.error(`[kosik] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
