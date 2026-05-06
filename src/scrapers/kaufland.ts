import { chromium, type BrowserContext, type Page } from 'playwright';
import { consoleProgress } from '../common/pool.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';
import { mapKauflandTile, type KauflandTilesResponse } from './kaufland-map.ts';

const ROOT_CATEGORY_URL = 'https://www.kaufland.cz/c/potraviny/~1311/';
const TILES_API = 'https://www.kaufland.cz/api/product-tiles/v1/product-tiles-information';
const HUB_API = 'https://www.kaufland.cz/backend/category-pages/v1/is-category-hub?categoryId=';
const TILE_BATCH = 30;
const STORE = 'kaufland' as const;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface KauflandOptions {
  limit?: number;
  /** Cap on category leaves to walk (useful for smoke tests). */
  maxLeaves?: number;
}

export async function scrapeKaufland(opts: KauflandOptions = {}): Promise<ScrapeResult> {
  const { limit, maxLeaves } = opts;
  const startedAt = new Date().toISOString();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'cs-CZ' });
  const page = await ctx.newPage();

  const products: Product[] = [];
  const errors: ScrapeResult['errors'] = [];

  try {
    await warmup(page);

    const leaves = await findLeafCategories(page, ROOT_CATEGORY_URL, maxLeaves);
    console.error(`[kaufland] ${leaves.length} leaf categories`);

    const productIds = await collectProductIds(page, leaves, limit);
    console.error(`[kaufland] ${productIds.length} unique product ids`);

    await fetchProductDetails(ctx, productIds, products, errors);
  } finally {
    await browser.close();
  }

  return { store: STORE, startedAt, finishedAt: new Date().toISOString(), products, errors };
}

async function warmup(page: Page): Promise<void> {
  await page.goto('https://www.kaufland.cz/', { waitUntil: 'domcontentloaded' });
}

interface Leaf {
  id: string;
  url: string;
}

async function findLeafCategories(
  page: Page,
  rootUrl: string,
  maxLeaves: number | undefined,
): Promise<Leaf[]> {
  const queue: string[] = [rootUrl];
  const seen = new Set<string>([rootUrl]);
  const leaves: Leaf[] = [];

  while (queue.length > 0) {
    const url = queue.shift()!;
    const id = extractCategoryId(url);
    if (!id) continue;

    const isHub = await isCategoryHub(page, id);
    if (!isHub) {
      leaves.push({ id, url });
      if (maxLeaves && leaves.length >= maxLeaves) break;
      continue;
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const subUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/c/"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => /\/c\/.+\/~\d+\/?/.test(h));
    });
    for (const sub of subUrls) {
      if (!seen.has(sub)) {
        seen.add(sub);
        queue.push(sub);
      }
    }
  }
  return leaves;
}

function extractCategoryId(url: string): string | null {
  const m = /~(\d+)\/?(?:$|\?)/.exec(url);
  return m ? m[1]! : null;
}

async function isCategoryHub(page: Page, id: string): Promise<boolean> {
  const res = await page.request.get(`${HUB_API}${id}`);
  if (!res.ok()) return false;
  return (await res.text()).trim() === 'true';
}

async function collectProductIds(
  page: Page,
  leaves: readonly Leaf[],
  limit: number | undefined,
): Promise<number[]> {
  const ids = new Set<number>();
  const onProgress = consoleProgress('kaufland-leaves', 5);
  let done = 0;
  for (const leaf of leaves) {
    await collectFromLeaf(page, leaf.url, ids, limit);
    done += 1;
    onProgress?.(done, leaves.length);
    if (limit && ids.size >= limit) break;
  }
  return [...ids];
}

async function collectFromLeaf(
  page: Page,
  baseUrl: string,
  ids: Set<number>,
  limit: number | undefined,
): Promise<void> {
  for (let pageN = 1; pageN <= 50; pageN++) {
    const target = pageN === 1 ? baseUrl : `${baseUrl}?page=${pageN}`;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
    // Wait for product tiles to render (or short timeout if none on this page)
    await page.waitForSelector('a[href*="/product/"]', { timeout: 10_000 }).catch(() => undefined);
    const pageIds: number[] = await page.evaluate(() => {
      const html = document.documentElement.outerHTML;
      const matches = html.match(/\/product\/(\d{6,12})\//g) || [];
      return [...new Set(matches.map((m: string) => Number(m.replace(/\/product\/|\//g, ''))))];
    });
    if (pageIds.length === 0) return;
    const before = ids.size;
    for (const id of pageIds) ids.add(id);
    if (ids.size === before) return; // no new ids — reached the end
    if (limit && ids.size >= limit) return;
  }
}

async function fetchProductDetails(
  ctx: BrowserContext,
  ids: readonly number[],
  out: Product[],
  errors: ScrapeResult['errors'],
): Promise<void> {
  const onProgress = consoleProgress('kaufland-tiles', 5);
  const batches = batchIds(ids, TILE_BATCH);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    try {
      const res = await ctx.request.post(TILES_API, {
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        data: {
          products: batch.map((id) => ({ id })),
          additionalRopdAttributes: [],
          includeProductConditions: ['new'],
          includeOptionalData: [],
          omitSellerCompanyNames: true,
          includeIneligibleProducts: false,
          includeSoldOutProducts: false,
          widgetVersion: '6.6.1',
        },
      });
      if (!res.ok()) {
        errors.push({ url: TILES_API, error: `${res.status()} ${res.statusText()}` });
        continue;
      }
      const body = (await res.json()) as KauflandTilesResponse;
      for (const tile of body.products ?? []) {
        const raw = mapKauflandTile(tile, `https://www.kaufland.cz/product/${tile.id}/`);
        if (!raw) continue;
        const { product } = cleanProduct(raw);
        if (product) out.push(product);
      }
    } catch (err) {
      errors.push({ url: TILES_API, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i + 1, batches.length);
  }
}

function batchIds(ids: readonly number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const maxLeavesArg = process.argv.indexOf('--max-leaves');
  const maxLeaves = maxLeavesArg >= 0 ? Number(process.argv[maxLeavesArg + 1]) : undefined;
  const result = await scrapeKaufland({ limit, maxLeaves });
  console.error(`[kaufland] ${result.products.length} products, ${result.errors.length} errors`);
  for (const p of result.products.slice(0, 3)) console.error(JSON.stringify(p, null, 2));
}
