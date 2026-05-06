import { fetchText } from '../common/fetch.ts';
import { consoleProgress, mapPool } from '../common/pool.ts';
import { readProductJsonLd } from '../common/product-jsonld.ts';
import { parseQuantity, type ParsedQuantity } from '../common/quantity.ts';
import { parseSitemapUrls } from '../common/sitemap.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';

const SITEMAP = 'https://www.rohlik.cz/sitemap_products.xml';
const STORE = 'rohlik' as const;

export interface RohlikOptions {
  limit?: number;
  concurrency?: number;
}

export async function scrapeRohlik(opts: RohlikOptions = {}): Promise<ScrapeResult> {
  const { limit, concurrency = 6 } = opts;
  const startedAt = new Date().toISOString();

  const xml = await fetchText(SITEMAP);
  let urls = parseSitemapUrls(xml);
  if (limit) urls = urls.slice(0, limit);

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

function mapPage(html: string, url: string): Product | null {
  const ld = readProductJsonLd(html);
  if (!ld) return null;
  const qty = parseQuantity(ld.name) ?? extractTextualAmount(html);
  return {
    store: STORE,
    id: ld.sku,
    name: ld.name,
    brand: ld.brand,
    category: ld.category,
    price: ld.price,
    currency: 'CZK',
    unit: qty?.unit,
    quantity: qty?.quantity,
    available: ld.available,
    url,
    scrapedAt: new Date().toISOString(),
  };
}

/** Pull the package size from Rohlík's Next.js hydration payload. */
function extractTextualAmount(html: string): ParsedQuantity | undefined {
  const m = /"textualAmount"\s*:\s*"([^"]+)"/.exec(html);
  if (!m) return undefined;
  return parseQuantity(m[1]!);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const result = await scrapeRohlik({ limit });
  console.error(`[rohlik] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
