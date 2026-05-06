import { fetchText } from '../common/fetch.ts';
import { readBreadcrumb } from '../common/jsonld.ts';
import { consoleProgress, mapPool } from '../common/pool.ts';
import { readProductJsonLd } from '../common/product-jsonld.ts';
import { parseQuantity } from '../common/quantity.ts';
import { parseSitemapUrls } from '../common/sitemap.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';

const SITEMAP_INDEX = 'https://nakup.itesco.cz/sitemaps/cs-CZ/groceries/products-index.xml';
const STORE = 'tesco' as const;

export interface TescoOptions {
  limit?: number;
  concurrency?: number;
}

export async function scrapeTesco(opts: TescoOptions = {}): Promise<ScrapeResult> {
  const { limit, concurrency = 6 } = opts;
  const startedAt = new Date().toISOString();
  const urls = await collectUrls(limit);

  const products: Product[] = [];
  const errors: ScrapeResult['errors'] = [];

  await mapPool(
    urls,
    concurrency,
    async (url) => {
      try {
        const html = await fetchText(url);
        const raw = mapPage(html, url);
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

async function collectUrls(limit: number | undefined): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX);
  const subSitemaps = parseSitemapUrls(indexXml);
  const urls: string[] = [];
  for (const sub of subSitemaps) {
    const xml = await fetchText(sub);
    urls.push(...parseSitemapUrls(xml));
    if (limit && urls.length >= limit) break;
  }
  return limit ? urls.slice(0, limit) : urls;
}

function mapPage(html: string, url: string): Product | null {
  const ld = readProductJsonLd(html);
  if (!ld) return null;
  const qty = parseQuantity(ld.name);
  const category = readBreadcrumb(html);
  return {
    store: STORE,
    id: ld.sku,
    name: ld.name,
    brand: ld.brand,
    category,
    ean: ld.ean,
    price: ld.price,
    currency: 'CZK', // Tesco JSON-LD reports GBP but actual prices are CZK
    unit: qty?.unit,
    quantity: qty?.quantity,
    available: ld.available,
    url,
    scrapedAt: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const result = await scrapeTesco({ limit });
  console.error(`[tesco] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
