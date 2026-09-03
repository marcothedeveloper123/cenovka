import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CSU_MATCHERS, matchStage, referenceUnitPrices } from './common/csu-map.ts';
import type { CanonicalDataset, Product, ReferenceDataset, Store } from './common/types.ts';

/**
 * Show what each ČSÚ matcher actually catches, so a mapping that drifts into
 * nonsense is visible in the CI log rather than on the site. Per item: keyword
 * hits, in-band hits, per-store counts, median and cheapest unit price against
 * the ČSÚ figure, the three cheapest names, and what the band rejected.
 *
 * Read this before and after touching `CSU_MATCHERS`.
 */

const CANONICAL_DIR = join('data', 'canonical');

export interface AuditRow {
  code: string;
  label: string;
  keywordHits: number;
  inBand: number;
  perStore: Partial<Record<Store, number>>;
  /** Kč per ČSÚ packaging (e.g. per kg), for the in-band set. */
  median?: number;
  cheapest?: number;
  reference: number;
  cheapestNames: string[];
  rejectedByBand: string[];
}

export function audit(canonical: CanonicalDataset, reference: ReferenceDataset): AuditRow[] {
  const refUnit = referenceUnitPrices(reference.items);
  const itemByCode = new Map(reference.items.map((i) => [i.code, i]));
  const live = canonical.products.filter((p) => p.available !== false);
  const rows: AuditRow[] = [];

  for (const m of CSU_MATCHERS) {
    const item = itemByCode.get(m.code);
    const ref = refUnit.get(m.code);
    if (!item || ref === undefined) continue;
    const scale = item.quantity ?? 1; // express unit prices per ČSÚ packaging
    const perUnit = (p: Product) => (p.price / (p.quantity as number)) * scale;

    const kw: Product[] = [];
    const ok: Product[] = [];
    for (const p of live) {
      const stage = matchStage(p, m, ref);
      if (stage === 'no') continue;
      kw.push(p);
      if (stage === 'band') ok.push(p);
    }
    ok.sort((a, b) => perUnit(a) - perUnit(b));
    const prices = ok.map(perUnit);
    const perStore: Partial<Record<Store, number>> = {};
    for (const p of ok) perStore[p.store] = (perStore[p.store] ?? 0) + 1;

    rows.push({
      code: m.code,
      label: item.label,
      keywordHits: kw.length,
      inBand: ok.length,
      perStore,
      median: prices.length ? prices[prices.length >> 1] : undefined,
      cheapest: prices[0],
      reference: item.history[0]?.price ?? Number.NaN,
      cheapestNames: ok.slice(0, 3).map((p) => `${p.store}: ${p.name}`),
      rejectedByBand: kw.filter((p) => !ok.includes(p)).slice(0, 2).map((p) => `${p.store}: ${p.name} (${perUnit(p).toFixed(0)})`),
    });
  }
  return rows;
}

export function format(rows: readonly AuditRow[]): string {
  const out: string[] = [];
  for (const r of rows) {
    const stores = Object.entries(r.perStore).map(([s, n]) => `${s}:${n}`).join(' ');
    const med = r.median === undefined ? '  -  ' : r.median.toFixed(0).padStart(5);
    const min = r.cheapest === undefined ? '  -  ' : r.cheapest.toFixed(0).padStart(5);
    out.push(`${r.label.padEnd(44)} kw ${String(r.keywordHits).padStart(4)}  band ${String(r.inBand).padStart(4)}  median ${med}  min ${min}  ČSÚ ${r.reference.toFixed(2).padStart(7)}  [${stores}]`);
    for (const n of r.cheapestNames) out.push(`    ${n}`);
    for (const n of r.rejectedByBand) out.push(`    ✕ ${n}`);
    if (r.inBand < 5) out.push(`    ! fewer than 5 in-band matches — consider unmapping or widening`);
  }
  return out.join('\n');
}

async function readJsonMaybeGz<T>(base: string): Promise<T> {
  try {
    return JSON.parse(gunzipSync(await readFile(`${base}.gz`)).toString('utf8')) as T;
  } catch {
    return JSON.parse(await readFile(base, 'utf8')) as T;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const canonical = await readJsonMaybeGz<CanonicalDataset>(join(CANONICAL_DIR, 'latest.json'));
  const reference = await readJsonMaybeGz<ReferenceDataset>(join(CANONICAL_DIR, 'reference.json'));
  console.log(format(audit(canonical, reference)));
}
