import { fetchText } from '../common/fetch.ts';
import { consoleProgress, mapPool } from '../common/pool.ts';
import { parseSitemapUrls } from '../common/sitemap.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';
import { mapGlobusProducts } from './globus-map.ts';

const SITEMAP_INDEX = 'https://www.globus.cz/sitemap.xml';
const STORE = 'globus' as const;

// Only listing paths under the canonical (city-agnostic) tree.
// Robots.txt disallows per-city paths and any /p/{slug} detail page.
const ALLOWED_PATH = /\/globus\/hypermarket\/cela-nabidka\//;

export interface GlobusOptions {
  limit?: number;
  concurrency?: number;
  onProduct?: (p: Product) => void;
}

export async function scrapeGlobus(opts: GlobusOptions = {}): Promise<ScrapeResult> {
  const { limit, concurrency = 6, onProduct } = opts;
  const startedAt = new Date().toISOString();

  const urls = await collectListingUrls(limit);

  const byKey = new Map<string, Product>();
  const errors: ScrapeResult['errors'] = [];

  await mapPool(
    urls,
    concurrency,
    async (url) => {
      try {
        const html = await fetchText(url);
        for (const raw of mapGlobusProducts(html, url)) {
          const { product } = cleanProduct(raw);
          if (!product) continue;
          // Dedupe across listings: prefer EAN, fall back to id.
          const key = product.ean ?? `id:${product.id}`;
          if (byKey.has(key)) continue;
          byKey.set(key, product);
          onProduct?.(product);
        }
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    },
    { onProgress: consoleProgress(STORE) },
  );

  return {
    store: STORE,
    startedAt,
    finishedAt: new Date().toISOString(),
    products: [...byKey.values()],
    errors,
  };
}

async function collectListingUrls(limit: number | undefined): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX);
  const subSitemaps = parseSitemapUrls(indexXml);
  const urls: string[] = [];
  for (const sub of subSitemaps) {
    const xml = await fetchText(sub);
    for (const u of parseSitemapUrls(xml)) {
      if (ALLOWED_PATH.test(u)) urls.push(u);
    }
    if (limit && urls.length >= limit) break;
  }
  return limit ? urls.slice(0, limit) : urls;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const result = await scrapeGlobus({ limit });
  console.error(`[globus] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
