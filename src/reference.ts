import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { type JsonStatDoc, mergeSeries, parseJsonStat } from './common/csu.ts';
import { fetchJson } from './common/fetch.ts';
import type { ReferenceDataset } from './common/types.ts';

/**
 * Ingest the Czech Statistical Office's average consumer prices for 86 food and
 * drink items — a national reference series to compare our scraped shelf prices
 * against. Monthly, published mid-following-month, so this runs on its own
 * monthly workflow rather than in the daily scrape.
 */

const CANONICAL_DIR = join('data', 'canonical');
const OUT_PATH = join(CANONICAL_DIR, 'reference.json');

/**
 * The series is split across two named selections with unrelated code schemes.
 * `mergeSeries` joins them on normalised label. Find replacements when ČSÚ
 * retires one via `api/katalog/v1/vybery` (see CLAUDE.md).
 */
const SELECTIONS = {
  /** 2024-12 … 2025-12, field-survey vintage. */
  historical: 'CEN0101DT01',
  /** 2026-01 … current, scanner-data vintage. */
  current: 'CEN0101NT01',
} as const;

const API = 'https://data.csu.gov.cz/api/dotaz/v1/data/vybery';

export async function buildReference(): Promise<ReferenceDataset> {
  const [older, newer] = await Promise.all([
    fetchJson<JsonStatDoc>(`${API}/${SELECTIONS.historical}?format=JSON_STAT`),
    fetchJson<JsonStatDoc>(`${API}/${SELECTIONS.current}?format=JSON_STAT`),
  ]);
  const items = mergeSeries(parseJsonStat(older), parseJsonStat(newer));
  return { schema: 1, source: 'csu', generatedAt: new Date().toISOString(), items };
}

async function main(): Promise<void> {
  const dataset = await buildReference();
  await mkdir(CANONICAL_DIR, { recursive: true });
  const json = JSON.stringify(dataset);
  // Plain JSON for local inspection (gitignored); the gzipped sibling is what
  // the SPA fetches and what CI commits.
  await writeFile(OUT_PATH, json);
  await writeFile(`${OUT_PATH}.gz`, gzipSync(json));

  const months = dataset.items.flatMap((i) => i.history.map((h) => h.month)).sort();
  console.error(
    `[reference] ${dataset.items.length} items, ${months[0]} … ${months.at(-1)} → ${OUT_PATH}[.gz]`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
