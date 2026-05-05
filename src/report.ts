import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pct } from './common/coverage.ts';
import type { AssembleMetrics } from './common/types.ts';

const METRICS_DIR = 'data/canonical';

async function loadMetrics(): Promise<AssembleMetrics[]> {
  const entries = await readdir(METRICS_DIR);
  const files = entries.filter((f) => /^metrics-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const out: AssembleMetrics[] = [];
  for (const f of files) {
    try {
      const body = await readFile(join(METRICS_DIR, f), 'utf8');
      out.push(JSON.parse(body) as AssembleMetrics);
    } catch {
      // skip malformed
    }
  }
  return out;
}

function printToday(m: AssembleMetrics): void {
  console.log(`\nCoverage report for ${m.date}\n`);
  const stores = Object.keys(m.coverage).filter(
    (s) => m.coverage[s as keyof typeof m.coverage].total > 0,
  );
  const header = ['chain', 'total', 'qty', 'brand', 'cat', 'EAN', 'avail'];
  const rows: string[][] = [header];
  for (const s of stores) {
    const c = m.coverage[s as keyof typeof m.coverage];
    rows.push([
      s,
      String(c.total),
      pct(c.withQuantity, c.total),
      pct(c.withBrand, c.total),
      pct(c.withCategory, c.total),
      pct(c.withEan, c.total),
      pct(c.available, c.total),
    ]);
  }
  printTable(rows);

  console.log(
    `\nDiff vs. yesterday: +${m.priceUp} prices up, -${m.priceDown} down, ` +
      `${m.appeared} appeared, ${m.disappeared} disappeared`,
  );
}

function printTrend(history: AssembleMetrics[]): void {
  if (history.length < 2) return;
  console.log(`\nRolling history (${history.length} days)\n`);
  const stores = new Set<string>();
  for (const m of history) {
    for (const s of Object.keys(m.coverage)) {
      if (m.coverage[s as keyof typeof m.coverage].total > 0) stores.add(s);
    }
  }
  const header = ['date', ...[...stores].flatMap((s) => [`${s}.n`, `${s}.qty%`])];
  const rows: string[][] = [header];
  for (const m of history) {
    const row = [m.date];
    for (const s of stores) {
      const c = m.coverage[s as keyof typeof m.coverage];
      row.push(String(c?.total ?? 0));
      row.push(c && c.total > 0 ? pct(c.withQuantity, c.total) : '  - ');
    }
    rows.push(row);
  }
  printTable(rows);
}

function printTable(rows: string[][]): void {
  if (rows.length === 0) return;
  const cols = rows[0]!.length;
  const widths = new Array(cols).fill(0);
  for (const r of rows) {
    for (let i = 0; i < cols; i++) widths[i] = Math.max(widths[i], r[i]!.length);
  }
  for (const r of rows) {
    console.log(r.map((cell, i) => cell.padStart(widths[i])).join('  '));
  }
}

const history = await loadMetrics();
if (history.length === 0) {
  console.error('No metrics files found in', METRICS_DIR);
  process.exit(1);
}
const latest = history[history.length - 1]!;
printToday(latest);
printTrend(history);
