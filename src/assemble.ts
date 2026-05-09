import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { assemble } from './common/assemble-core.ts';
import type { CanonicalDataset, Product, Store } from './common/types.ts';
import { cleanProduct } from './common/validate.ts';

const DATA_DIR = 'data';
const RAW_DIR = join(DATA_DIR, 'raw');
const CANONICAL_DIR = join(DATA_DIR, 'canonical');
const LATEST_PATH = join(CANONICAL_DIR, 'latest.json');
const STORES: Store[] = ['tesco', 'rohlik', 'kosik', 'lidl', 'billa', 'penny', 'globus'];

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readRaw(date: string): Promise<Product[]> {
  const all: Product[] = [];
  for (const store of STORES) {
    all.push(...(await readChainFile(store, date)));
  }
  return all;
}

async function readChainFile(store: Store, date: string): Promise<Product[]> {
  const file = join(RAW_DIR, store, `${date}.jsonl`);
  let body: string;
  try {
    body = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const out: Product[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as Product);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

async function readPriorCanonical(): Promise<CanonicalDataset | null> {
  // The committed form is `latest.json.gz` (8 MB vs 53). The uncompressed
  // sibling is gitignored, so it's only present when assemble has run
  // locally already. Try both — gz first since it's the source of truth.
  try {
    const buf = await readFile(`${LATEST_PATH}.gz`);
    return JSON.parse(gunzipSync(buf).toString('utf8')) as CanonicalDataset;
  } catch {
    /* fall through */
  }
  try {
    const body = await readFile(LATEST_PATH, 'utf8');
    return JSON.parse(body) as CanonicalDataset;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const dateArg = process.argv.indexOf('--date');
  const date = dateArg >= 0 ? process.argv[dateArg + 1]! : todayDate();

  const todays = await readRaw(date);
  const prior = await readPriorCanonical();

  // Re-clean all products at the assemble boundary. Scrapers ran cleanProduct()
  // when they wrote the raw file, but cleanProduct may have been updated since
  // (e.g., EAN normalization), so old raw rows would otherwise carry the legacy
  // form into canonical. Re-running here is idempotent for already-clean rows
  // and applies any new normalization to legacy rows.
  for (let i = 0; i < todays.length; i++) {
    const cleaned = cleanProduct(todays[i]!);
    if (cleaned.product) todays[i] = cleaned.product;
  }
  if (prior) {
    for (let i = 0; i < prior.products.length; i++) {
      const cleaned = cleanProduct(prior.products[i]!);
      if (cleaned.product) prior.products[i] = cleaned.product;
    }
  }

  if (todays.length === 0 && !prior) {
    console.error(`No raw data for ${date} and no prior canonical. Nothing to do.`);
    process.exit(1);
  }

  const { dataset, metrics } = assemble(todays, prior, date);
  await mkdir(CANONICAL_DIR, { recursive: true });
  const json = JSON.stringify(dataset);
  // Plain JSON for local browsing/debug; gzipped sibling is what the SPA
  // and cron commits use (~6× smaller, 8 MB vs 53 MB at current scale).
  await writeFile(LATEST_PATH, json);
  await writeFile(`${LATEST_PATH}.gz`, gzipSync(json));
  await writeFile(
    join(CANONICAL_DIR, `metrics-${date}.json`),
    JSON.stringify(metrics, null, 2),
  );

  console.log(`[assemble] ${dataset.products.length} products written to ${LATEST_PATH}`);
  console.log(
    `[assemble] price changes: +${metrics.priceUp} / -${metrics.priceDown}, ` +
      `appeared ${metrics.appeared}, disappeared ${metrics.disappeared}`,
  );
  for (const store of STORES) {
    const m = metrics.perChain[store];
    if (m.today === 0 && m.yesterday === 0) continue;
    console.log(`[assemble]   ${store}: ${m.today} today (${m.yesterday} yesterday)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
