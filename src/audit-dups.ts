/**
 * Duplicate auditor — scans the canonical dataset for cases where two SKUs
 * almost certainly represent the same product but the matcher disagrees.
 *
 * Surfaces three classes of issues:
 *   A) BIG_GROUP: a single group has > N members → over-clustering.
 *   B) MISSING_LINK: two products with identical (brand, folded-stripped name,
 *      qty, unit) but in DIFFERENT groups, or one grouped + one ungrouped.
 *   C) DEAD_BRAND: two products with the same folded name+qty+unit, different
 *      stores, both ungrouped — usually a missing brand on one side.
 *
 * Run: `npm run audit:dups` or `tsx src/audit-dups.ts`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Product {
  store: string;
  id: string;
  name: string;
  brand?: string;
  categoryCanonical?: string;
  unit?: string;
  quantity?: number;
  price: number;
  available: boolean;
}

interface RawCanonical { products: Product[] }
interface RawGroup { id: string; members: { store: string; id: string }[] }

const CONTAINER_TOKENS = new Set([
  'lahev', 'lahvi', 'lahve', 'flase', 'flaska', 'flasky',
  'plech', 'plechovka', 'plechovky', 'plechovek',
  'sklo', 'sklenena', 'skleneny', 'skleny',
  'pet', 'petka', 'petky',
  'karton', 'kartony', 'tetrapak', 'tetra',
  'sacek', 'sacku', 'vrecko', 'box', 'krabice',
  'doza', 'kelimek',
]);

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function key(p: Product): string {
  const name = fold(p.name)
    .split(' ')
    .filter((t) => !CONTAINER_TOKENS.has(t))
    .join(' ');
  return `${fold(p.brand ?? '')}|${name}|${p.quantity ?? ''}|${p.unit ?? ''}`;
}

function main(): void {
  const root = resolve(process.cwd(), 'data/canonical');
  const canon: RawCanonical = JSON.parse(readFileSync(`${root}/latest.json`, 'utf8'));
  const groups: RawGroup[] = JSON.parse(readFileSync(`${root}/groups.json`, 'utf8'));

  const groupOf = new Map<string, string>();
  const groupSize = new Map<string, number>();
  for (const g of groups) {
    groupSize.set(g.id, g.members.length);
    for (const m of g.members) groupOf.set(`${m.store}::${m.id}`, g.id);
  }

  const products = canon.products.filter((p) => p.available);

  // --- A) BIG_GROUP --------------------------------------------------------
  const bigThreshold = 10;
  const big = [...groupSize.entries()]
    .filter(([, n]) => n > bigThreshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  // --- B/C) Equivalence-by-key cross check ---------------------------------
  const byKey = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.brand && !p.name) continue;
    const k = key(p);
    if (!k.startsWith('|')) {
      // need at least a brand OR a name
    }
    const arr = byKey.get(k) ?? [];
    arr.push(p);
    byKey.set(k, arr);
  }

  type Issue = { kind: 'MISSING_LINK' | 'DEAD_BRAND'; key: string; products: Product[] };
  const missingLinks: Issue[] = [];
  const deadBrands: Issue[] = [];

  for (const [k, arr] of byKey) {
    if (arr.length < 2) continue;
    const groupIds = new Set(arr.map((p) => groupOf.get(`${p.store}::${p.id}`) ?? ''));
    const stores = new Set(arr.map((p) => p.store));
    if (stores.size < 2) continue; // only across-chain dups matter for matcher

    if (groupIds.size > 1) {
      // multiple groups (or some grouped + some not) for the same key
      missingLinks.push({ kind: 'MISSING_LINK', key: k, products: arr });
    } else if (groupIds.size === 1 && groupIds.has('')) {
      // all ungrouped — usually a missing brand keeps them apart
      deadBrands.push({ kind: 'DEAD_BRAND', key: k, products: arr });
    }
  }

  // --- Report --------------------------------------------------------------
  console.log(`# Duplicate auditor — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Dataset: ${products.length} available products in ${groups.length} groups\n`);

  console.log(`## A) BIG_GROUP — over-clustering (members > ${bigThreshold})`);
  console.log(`Total groups affected: ${big.length}\n`);
  for (const [gid, n] of big.slice(0, 15)) {
    const sample = products.find((p) => groupOf.get(`${p.store}::${p.id}`) === gid);
    console.log(`  ${n.toString().padStart(3)} · ${gid}${sample ? ` (e.g. "${sample.name.slice(0, 60)}")` : ''}`);
  }
  if (big.length > 15) console.log(`  ... +${big.length - 15} more`);

  console.log(`\n## B) MISSING_LINK — same key, different groups (matcher missed)`);
  console.log(`Total: ${missingLinks.length}\n`);
  for (const issue of missingLinks.slice(0, 20)) {
    console.log(`  key="${issue.key}"`);
    for (const p of issue.products.slice(0, 5)) {
      const g = groupOf.get(`${p.store}::${p.id}`) ?? '—';
      console.log(`    ${p.store.padEnd(8)} ${p.price.toString().padStart(7)} Kč  g=${g}  ${p.name.slice(0, 60)}`);
    }
    console.log();
  }
  if (missingLinks.length > 20) console.log(`  ... +${missingLinks.length - 20} more\n`);

  console.log(`## C) DEAD_BRAND — same key, all ungrouped (likely missing brand)`);
  console.log(`Total: ${deadBrands.length}\n`);
  for (const issue of deadBrands.slice(0, 20)) {
    const stores = [...new Set(issue.products.map((p) => p.store))];
    console.log(`  ${stores.join('+')} · key="${issue.key}"`);
    for (const p of issue.products.slice(0, 4)) {
      console.log(`    ${p.store.padEnd(8)} brand=${(p.brand ?? '∅').padEnd(20)} ${p.name.slice(0, 50)}`);
    }
    console.log();
  }
  if (deadBrands.length > 20) console.log(`  ... +${deadBrands.length - 20} more`);

  console.log('\n## Summary');
  console.log(`  big-groups:    ${big.length}`);
  console.log(`  missing-links: ${missingLinks.length}`);
  console.log(`  dead-brands:   ${deadBrands.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
