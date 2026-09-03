import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { classifyCsu, referenceUnitPrices } from './common/csu-map.ts';
import type { CanonicalDataset, ReferenceDataset } from './common/types.ts';

/**
 * Join scraped products to ČSÚ reference items.
 *
 * Writes `data/canonical/reference-members.json[.gz]`: `{ [csuCode]: ["store::id", …] }`.
 * A sidecar keyed by product key, like `groups.json`, so `latest.json` keeps
 * its schema and the web joins by key exactly as it does for match groups.
 * Runs after `assemble` and `match` in the daily finalize job.
 */

const CANONICAL_DIR = join('data', 'canonical');
const OUT_PATH = join(CANONICAL_DIR, 'reference-members.json');

export type ReferenceMembers = Record<string, string[]>;

export function buildMembers(canonical: CanonicalDataset, reference: ReferenceDataset): ReferenceMembers {
  const refUnit = referenceUnitPrices(reference.items);
  const out: ReferenceMembers = {};
  for (const p of canonical.products) {
    if (p.available === false) continue; // the list is "on shelves now"
    const code = classifyCsu(p, refUnit);
    if (!code) continue;
    (out[code] ??= []).push(`${p.store}::${p.id}`);
  }
  return out;
}

async function readJsonMaybeGz<T>(base: string): Promise<T> {
  try {
    return JSON.parse(gunzipSync(await readFile(`${base}.gz`)).toString('utf8')) as T;
  } catch {
    return JSON.parse(await readFile(base, 'utf8')) as T;
  }
}

async function main(): Promise<void> {
  const canonical = await readJsonMaybeGz<CanonicalDataset>(join(CANONICAL_DIR, 'latest.json'));
  const reference = await readJsonMaybeGz<ReferenceDataset>(join(CANONICAL_DIR, 'reference.json'));
  const members = buildMembers(canonical, reference);
  const json = JSON.stringify(members);
  await writeFile(OUT_PATH, json);
  await writeFile(`${OUT_PATH}.gz`, gzipSync(json));
  const codes = Object.keys(members).length;
  const total = Object.values(members).reduce((n, v) => n + v.length, 0);
  console.error(`[csu-join] ${total} products under ${codes} ČSÚ items → ${OUT_PATH}[.gz]`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
