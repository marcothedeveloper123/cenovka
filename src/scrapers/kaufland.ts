import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { consoleProgress } from '../common/pool.ts';
import type { Product, ScrapeResult } from '../common/types.ts';
import { cleanProduct } from '../common/validate.ts';
import { isChallengeMarkup, safeGoto, solveCloudflareChallenge } from './kaufland-cf.ts';
import { mapKauflandTile, type KauflandTilesResponse } from './kaufland-map.ts';

const ROOT_CATEGORY_URL = 'https://www.kaufland.cz/c/potraviny/~1311/';
const TILES_API = 'https://www.kaufland.cz/api/product-tiles/v1/product-tiles-information';
const TILE_BATCH = 30;
const STORE = 'kaufland' as const;

const DEFAULT_PROFILE_DIR = resolve('data', '.kaufland-profile');

// Mirrors the launch args the Playwright MCP server uses for its own Chrome
// (visible via `ps aux | grep chrome`). Empirically this combo passes
// Cloudflare's automation challenge; subsets of it do not.
const CHROME_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-back-forward-cache',
  '--disable-background-timer-throttling',
  '--disable-breakpad',
  '--force-color-profile=srgb',
  '--lang=en-US',
  '--no-sandbox',
];

export interface KauflandOptions {
  limit?: number;
  /** Cap on category leaves to walk (useful for smoke tests). */
  maxLeaves?: number;
  /** Persistent Chrome user-data-dir; reused across runs to keep CF clearance. */
  profileDir?: string;
  onProduct?: (p: Product) => void;
}

export async function scrapeKaufland(opts: KauflandOptions = {}): Promise<ScrapeResult> {
  const { limit, maxLeaves, profileDir = DEFAULT_PROFILE_DIR, onProduct } = opts;
  const startedAt = new Date().toISOString();
  await mkdir(profileDir, { recursive: true });

  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    locale: 'cs-CZ',
    viewport: { width: 1280, height: 900 },
    args: CHROME_ARGS,
    // Without this, Chrome shows the "controlled by automated test software"
    // banner AND sets navigator.webdriver = true + chrome.cdc_* signatures.
    // Cloudflare reads all of those.
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const products: Product[] = [];
  const errors: ScrapeResult['errors'] = [];

  try {
    await warmup(page);
    console.error(`[kaufland] warmed up. title: ${await page.title()}`);

    const productIds = await walkCategoryTree(page, ROOT_CATEGORY_URL, limit, maxLeaves);
    console.error(`[kaufland] ${productIds.length} unique product ids`);

    await fetchProductDetails(page, productIds, products, errors, onProduct);
  } finally {
    await ctx.close();
  }

  return { store: STORE, startedAt, finishedAt: new Date().toISOString(), products, errors };
}

async function warmup(page: Page): Promise<void> {
  await safeGoto(page, 'https://www.kaufland.cz/', { timeout: 60_000 });
  // Light pause so any post-clearance JS can run before the first scan.
  await page.waitForTimeout(2_000);
}

/**
 * Walk every category page reachable from `rootUrl` BFS-style and collect
 * product IDs from each. Treats every category as both potentially listing
 * products and potentially containing subcategories — the is-category-hub
 * API turned out to be unreliable.
 */
async function walkCategoryTree(
  page: Page,
  rootUrl: string,
  limit: number | undefined,
  maxLeaves: number | undefined,
): Promise<number[]> {
  const queue: string[] = [rootUrl];
  const seenCats = new Set<string>([rootUrl]);
  const ids = new Set<number>();
  const onProgress = consoleProgress('kaufland-cats', 5);
  let done = 0;

  while (queue.length > 0) {
    const url = queue.shift()!;
    const { newSubs, hadProducts } = await scanCategory(page, url, ids, limit);
    for (const sub of newSubs) {
      if (!seenCats.has(sub)) {
        seenCats.add(sub);
        queue.push(sub);
      }
    }
    done += 1;
    onProgress?.(done, done + queue.length);
    if (hadProducts && maxLeaves && done >= maxLeaves) break;
    if (limit && ids.size >= limit) break;
  }
  return [...ids];
}

/** Visit one category URL: harvest sub-category links + product IDs (paginated). */
async function scanCategory(
  page: Page,
  baseUrl: string,
  ids: Set<number>,
  limit: number | undefined,
): Promise<{ newSubs: string[]; hadProducts: boolean }> {
  let hadProducts = false;
  let newSubs: string[] = [];
  for (let pageN = 1; pageN <= 50; pageN++) {
    const target = pageN === 1 ? baseUrl : `${baseUrl}?page=${pageN}`;
    await safeGoto(page, target, { waitUntil: 'networkidle', timeout: 30_000 });
    const harvest = await page.evaluate(() => {
      const html = document.documentElement.outerHTML;
      const productMatches = html.match(/\/product\/(\d{6,12})\//g) || [];
      const productIds = [...new Set(productMatches.map((m: string) => Number(m.replace(/\/product\/|\//g, ''))))];
      const subUrls = Array.from(document.querySelectorAll('a[href*="/c/"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h: string) => /\/c\/.+\/~\d+\/?$/.test(h.split('?')[0]!));
      return { productIds, subUrls: [...new Set(subUrls)] };
    });
    if (pageN === 1) newSubs = harvest.subUrls;
    if (harvest.productIds.length === 0) break;
    const before = ids.size;
    for (const id of harvest.productIds) ids.add(id);
    if (ids.size > before) hadProducts = true;
    if (ids.size === before) break;
    if (limit && ids.size >= limit) break;
  }
  return { newSubs, hadProducts };
}

async function fetchProductDetails(
  page: Page,
  ids: readonly number[],
  out: Product[],
  errors: ScrapeResult['errors'],
  onProduct: ((p: Product) => void) | undefined,
): Promise<void> {
  const onProgress = consoleProgress('kaufland-tiles', 5);
  const batches = batchIds(ids, TILE_BATCH);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    try {
      let result = await callTilesApi(page, batch);
      if (!result.ok && isChallengeMarkup(String(result.body).slice(0, 4000))) {
        // Cloudflare interrupted us. Surface a real page in the visible
        // browser to let the challenge render, solve it, retry once.
        console.error('[kaufland] tiles fetch hit Cloudflare; triggering visible challenge');
        await safeGoto(page, `https://www.kaufland.cz/product/${batch[0]}/`, { timeout: 30_000 });
        await solveCloudflareChallenge(page);
        result = await callTilesApi(page, batch);
      }
      if (!result.ok) {
        const err = `${result.status} — ${String(result.body).slice(0, 200)}`;
        errors.push({ url: TILES_API, error: err });
        console.error(`[kaufland] tiles call failed: ${err}`);
        continue;
      }
      const body = result.body as KauflandTilesResponse;
      for (const tile of body.products ?? []) {
        const raw = mapKauflandTile(tile, `https://www.kaufland.cz/product/${tile.id}/`);
        if (!raw) continue;
        const { product } = cleanProduct(raw);
        if (!product) continue;
        onProduct?.(product);
        out.push(product);
      }
    } catch (err) {
      errors.push({ url: TILES_API, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i + 1, batches.length);
  }
}

interface TilesResult { ok: boolean; status: number; body: unknown }

async function callTilesApi(page: Page, ids: readonly number[]): Promise<TilesResult> {
  // Use the browser's own fetch so cookies + TLS fingerprint match what
  // Cloudflare expects from a real session. ctx.request.post() bypasses
  // the browser stack and gets blocked.
  return page.evaluate(
    async ({ url, ids }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          products: ids.map((id: number) => ({ id })),
          additionalRopdAttributes: [],
          includeProductConditions: ['new'],
          includeOptionalData: [],
          omitSellerCompanyNames: true,
          includeIneligibleProducts: false,
          includeSoldOutProducts: false,
          widgetVersion: '6.6.1',
        }),
      });
      const body = res.ok ? await res.json() : await res.text();
      return { ok: res.ok, status: res.status, body };
    },
    { url: TILES_API, ids: [...ids] },
  );
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
