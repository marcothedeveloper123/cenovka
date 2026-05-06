import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMatchGroups } from './common/match-core.ts';
import type { CanonicalDataset } from './common/types.ts';

const LATEST_PATH = join('data', 'canonical', 'latest.json');
const GROUPS_PATH = join('data', 'canonical', 'groups.json');

async function main(): Promise<void> {
  const body = await readFile(LATEST_PATH, 'utf8');
  const dataset = JSON.parse(body) as CanonicalDataset;
  const groups = buildMatchGroups(dataset.products);

  await writeFile(GROUPS_PATH, JSON.stringify(groups, null, 2));
  console.log(`[match] ${groups.length} cross-chain groups written to ${GROUPS_PATH}`);

  if (groups.length === 0) return;
  console.log(`[match] sample groups:`);
  for (const g of groups.slice(0, 5)) {
    console.log(`  ${g.id}`);
    for (const m of g.members) {
      console.log(`    ${m.store.padEnd(7)} ${m.price.toFixed(2).padStart(7)} CZK  ${m.name}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
