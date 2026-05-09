/**
 * Per-chain per-day scrape log. Persisted at data/canonical/coverage.json.gz
 * so the SPA can render an explicit "did this chain scrape on this day?" grid
 * instead of inferring it from priceHistory churn.
 *
 * Append-only: each call to recordScrapeDay mutates one (chain, date) cell.
 * Old days are never rewritten — keeps the file diff stable for git.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Store } from './types.ts';

export interface ScrapeDay {
  /** Number of cleaned products written to raw .jsonl that day. */
  products: number;
  /** Number of per-URL errors recorded that day, if any. */
  errors: number;
  /** Optional human-readable note (e.g., "skipped: IP blocked"). */
  note?: string;
}

export interface ScrapeLog {
  schema: 1;
  /** Most recent date recorded across any chain. */
  lastUpdated: string;
  perChain: Partial<Record<Store, Record<string, ScrapeDay>>>;
}

const EMPTY: ScrapeLog = { schema: 1, lastUpdated: '', perChain: {} };

export async function readScrapeLog(path: string): Promise<ScrapeLog> {
  try {
    const buf = await readFile(path);
    const json = path.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return JSON.parse(json) as ScrapeLog;
  } catch {
    return { ...EMPTY, perChain: {} };
  }
}

export async function writeScrapeLog(path: string, log: ScrapeLog): Promise<void> {
  const json = JSON.stringify(log);
  if (path.endsWith('.gz')) {
    await writeFile(path, gzipSync(json));
  } else {
    await writeFile(path, json);
  }
}

/** Insert/update one (chain, date) cell. Mutates and returns. */
export function recordScrapeDay(
  log: ScrapeLog,
  store: Store,
  date: string,
  cell: ScrapeDay,
): ScrapeLog {
  if (!log.perChain[store]) log.perChain[store] = {};
  log.perChain[store]![date] = cell;
  if (date > log.lastUpdated) log.lastUpdated = date;
  return log;
}
