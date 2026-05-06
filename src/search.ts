import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { searchProducts, type SearchHit } from './common/search-core.ts';
import type { CanonicalDataset, Store } from './common/types.ts';

const LATEST_PATH = join('data', 'canonical', 'latest.json');

async function loadDataset(): Promise<CanonicalDataset> {
  const body = await readFile(LATEST_PATH, 'utf8');
  return JSON.parse(body) as CanonicalDataset;
}

function parseArgs(argv: string[]): { query: string; limit: number } {
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : 10;
  const query = argv.filter((a, i) => !a.startsWith('--') && i >= 2 && argv[i - 1] !== '--limit').join(' ').trim();
  return { query, limit };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function fmtPrice(p: number): string {
  return p.toFixed(2);
}

function fmtUnit(hit: SearchHit): string {
  if (!hit.unitPrice) return '';
  return `${fmtPrice(hit.unitPrice.value)}/${hit.unitPrice.per}`;
}

function printHits(hits: SearchHit[], store: Store): void {
  if (hits.length === 0) return;
  console.log(`\n${store}: ${hits.length} match${hits.length === 1 ? '' : 'es'}`);
  for (const h of hits) {
    const p = h.product;
    const flag = p.available ? ' ' : '✗';
    const line = `  ${flag} ${pad(fmtPrice(p.price), 7)} CZK  ${pad(fmtUnit(h), 14)}  ${p.name}`;
    console.log(line);
  }
}

async function main(): Promise<void> {
  const { query, limit } = parseArgs(process.argv);
  if (!query) {
    console.error('usage: tsx src/search.ts <query> [--limit N]');
    process.exit(1);
  }

  const dataset = await loadDataset();
  const all = searchProducts(dataset.products, query)
    .filter((h) => h.product.available)
    .sort((a, b) => {
      const av = a.unitPrice?.value ?? a.product.price;
      const bv = b.unitPrice?.value ?? b.product.price;
      return av - bv;
    });

  if (all.length === 0) {
    console.log(`No matches for "${query}"`);
    return;
  }

  console.log(`"${query}" — ${all.length} matches across ${dataset.products.length} products\n`);

  const stores: Store[] = ['tesco', 'rohlik', 'kosik', 'lidl', 'billa', 'penny'];
  for (const store of stores) {
    const hits = all.filter((h) => h.product.store === store).slice(0, limit);
    printHits(hits, store);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
