import { useMemo } from 'react';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product, ScrapeLog, Store } from '../lib/types.ts';

const STORE_NAMES: Record<Store, string> = {
  tesco: 'Tesco',
  rohlik: 'Rohlík',
  kosik: 'Košík',
  lidl: 'Lidl',
  billa: 'Billa',
  penny: 'Penny',
  globus: 'Globus',
  kaufland: 'Kaufland',
};

interface Props {
  dataset: Dataset;
}

export function Data({ dataset }: Props): React.ReactElement {
  const stats = useMemo(() => computeStats(dataset.products), [dataset.products]);
  // Prefer the explicit scrape log committed by the cron; fall back to the
  // priceHistory-derived proxy when the log isn't available (older datasets).
  const coverage = useMemo(
    () => (dataset.scrapeLog ? fromScrapeLog(dataset.scrapeLog) : computeFreshness(dataset.products)),
    [dataset.scrapeLog, dataset.products],
  );
  const groupedCount = dataset.groups.reduce((s, g) => s + g.productKeys.length, 0);
  const groupCoverage = dataset.products.length > 0 ? (groupedCount / dataset.products.length) * 100 : 0;

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta">DATA</div>
      <h1 className="display" style={{ fontSize: 36, margin: '4px 0 8px' }}>
        Otevřený dataset cen
      </h1>
      <p style={{ color: 'var(--ink-3)', maxWidth: 680, marginBottom: 32 }}>
        Cenovka stahuje veřejně dostupné ceny každý den, čistí je a publikuje pod licencí
        ODbL. Stáhni si surová data, hraj si s nimi, postav si nad nimi cokoli.
      </p>

      <section style={{ marginBottom: 40 }}>
        <h2 className="display" style={{ fontSize: 20, margin: '0 0 12px', borderTop: '2px solid var(--ink)', paddingTop: 12 }}>
          Stahování
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <DownloadCard
            title="Aktuální ceny (JSON)"
            sub={`${stats.total.toLocaleString('cs')} produktů · ${formatBytes(estimateJsonSize(dataset))}`}
            href="/data/latest.json"
            filename="cenovka-latest.json"
          />
          <DownloadCard
            title="Aktuální ceny (CSV)"
            sub="Sloupce: store, id, name, brand, price, …"
            onDownload={() => downloadBlob('cenovka-latest.csv', 'text/csv;charset=utf-8', toCsv(dataset.products))}
          />
          <DownloadCard
            title="Páry napříč řetězci (JSON)"
            sub={`${dataset.groups.length.toLocaleString('cs')} skupin`}
            href="/data/groups.json"
            filename="cenovka-groups.json"
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>
          Dataset je publikován pod licencí{' '}
          <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer" style={{ borderBottom: '1px solid currentColor' }}>
            ODbL 1.0
          </a>
          . Při použití uveďte zdroj „<strong>cenovka.cz</strong>" a respektujte licence
          jednotlivých řetězců.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 className="display" style={{ fontSize: 20, margin: '0 0 12px', borderTop: '2px solid var(--ink)', paddingTop: 12 }}>
          Pokrytí napříč řetězci
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule-2)', textAlign: 'left' }}>
              <th style={{ padding: '8px 0' }}>Řetězec</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Produktů</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Dostupných</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Značka %</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>EAN %</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Kategorie %</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Medián cena</th>
            </tr>
          </thead>
          <tbody>
            {stats.byStore.map((row) => (
              <tr key={row.store} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '8px 0', fontWeight: 500 }}>{STORE_NAMES[row.store]}</td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right' }}>
                  {row.count.toLocaleString('cs')}
                </td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: 'var(--ink-3)' }}>
                  {row.available.toLocaleString('cs')}
                </td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: pctColor(row.brandPct) }}>
                  {row.brandPct.toFixed(0)}
                </td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: pctColor(row.eanPct) }}>
                  {row.eanPct.toFixed(0)}
                </td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: pctColor(row.catPct) }}>
                  {row.catPct.toFixed(0)}
                </td>
                <td className="num" style={{ padding: '8px 0', textAlign: 'right' }}>{fmtCZK(row.medianPrice, 0)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 500 }}>
              <td style={{ padding: '8px 0' }}>Celkem</td>
              <td className="num" style={{ padding: '8px 0', textAlign: 'right' }}>{stats.total.toLocaleString('cs')}</td>
              <td className="num" style={{ padding: '8px 0', textAlign: 'right' }}>{stats.totalAvailable.toLocaleString('cs')}</td>
              <td colSpan={3}></td>
              <td className="num" style={{ padding: '8px 0', textAlign: 'right' }}>{fmtCZK(stats.medianAll, 0)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>
          Páry napříč řetězci pokrývají <strong className="num">{groupCoverage.toFixed(1)} %</strong>{' '}
          všech produktů ({groupedCount.toLocaleString('cs')} v {dataset.groups.length.toLocaleString('cs')} skupinách).
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 className="display" style={{ fontSize: 20, margin: '0 0 12px', borderTop: '2px solid var(--ink)', paddingTop: 12 }}>
          Status sběru dat (posledních {coverage.dates.length} dní)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 12px' }}>
          {dataset.scrapeLog
            ? 'Počet produktů stažených z webu řetězce ten den. Prázdná buňka = scrape ten den neproběhl nebo selhal úplně.'
            : 'Počet produktů, kterým se v ten den změnila cena (proxy — kompletní log scrapů zatím není v datech).'}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule-2)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px 8px 0' }}>Řetězec</th>
                {coverage.dates.map((d) => (
                  <th key={d} style={{ padding: '8px', textAlign: 'right', minWidth: 64 }}>
                    {fmtShortDate(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.rows.map((row) => (
                <tr key={row.store} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>
                    {STORE_NAMES[row.store]}
                  </td>
                  {coverage.dates.map((d) => {
                    const n = row.byDate.get(d) ?? 0;
                    return (
                      <td
                        key={d}
                        className="num"
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: freshColor(n, row.expectedPerDay),
                        }}
                      >
                        {n === 0 ? '—' : n.toLocaleString('cs')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="display" style={{ fontSize: 20, margin: '0 0 12px', borderTop: '2px solid var(--ink)', paddingTop: 12 }}>
          Metadata
        </h2>
        <dl style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>
          <Row label="Vygenerováno">{new Date(dataset.generatedAt).toLocaleString('cs')}</Row>
          <Row label="Schéma">v1 (canonical product)</Row>
          <Row label="Zdroj">
            <a href="https://github.com/marco/cenovka" target="_blank" rel="noopener noreferrer" style={{ borderBottom: '1px solid currentColor' }}>
              github.com/marco/cenovka
            </a>
          </Row>
          <Row label="Cesta v repu"><span className="mono">data/canonical/latest.json</span></Row>
          <Row label="Frekvence">denně, v noci</Row>
        </dl>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', borderBottom: '1px solid var(--rule)', padding: '4px 0' }}>
      <dt className="meta">{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

function DownloadCard({
  title,
  sub,
  href,
  filename,
  onDownload,
}: {
  title: string;
  sub: string;
  href?: string;
  filename?: string;
  onDownload?: () => void;
}): React.ReactElement {
  const common = {
    style: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 8,
      padding: 16,
      border: '1px solid var(--rule-2)',
      background: 'var(--bg)',
      textAlign: 'left' as const,
      cursor: 'pointer',
      width: '100%',
    },
  };
  const inner = (
    <>
      <div className="meta">STÁHNOUT ↓</div>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} download={filename} {...common}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onDownload} {...common}>
      {inner}
    </button>
  );
}

interface StoreStats {
  store: Store;
  count: number;
  available: number;
  brandPct: number;
  eanPct: number;
  catPct: number;
  medianPrice: number;
}

interface FreshnessRow {
  store: Store;
  byDate: Map<string, number>;
  /** Used to size "did the scrape look healthy?" — chain catalog size. */
  expectedPerDay: number;
}
interface Freshness {
  /** Up to last 14 days of dates, ascending. */
  dates: string[];
  rows: FreshnessRow[];
}

function fromScrapeLog(log: ScrapeLog): Freshness {
  const dateSet = new Set<string>();
  const rows: FreshnessRow[] = [];
  for (const [storeKey, days] of Object.entries(log.perChain)) {
    if (!days) continue;
    const store = storeKey as Store;
    const byDate = new Map<string, number>();
    let max = 0;
    for (const [d, cell] of Object.entries(days)) {
      byDate.set(d, cell.products);
      dateSet.add(d);
      if (cell.products > max) max = cell.products;
    }
    rows.push({ store, byDate, expectedPerDay: max });
  }
  rows.sort((a, b) => b.expectedPerDay - a.expectedPerDay);
  const dates = [...dateSet].sort().slice(-14);
  return { dates, rows };
}

function computeFreshness(products: readonly Product[]): Freshness {
  // For each chain, count how many products had a priceHistory entry on each date.
  const perStore = new Map<Store, { byDate: Map<string, number>; total: number }>();
  const allDates = new Set<string>();
  for (const p of products) {
    if (!p.available) continue;
    let bucket = perStore.get(p.store);
    if (!bucket) perStore.set(p.store, (bucket = { byDate: new Map(), total: 0 }));
    bucket.total += 1;
    for (const h of p.history) {
      bucket.byDate.set(h.date, (bucket.byDate.get(h.date) ?? 0) + 1);
      allDates.add(h.date);
    }
  }
  const dates = [...allDates].sort().slice(-14);
  const rows: FreshnessRow[] = [...perStore.entries()]
    .map(([store, b]) => ({ store, byDate: b.byDate, expectedPerDay: b.total }))
    .sort((a, b) => b.expectedPerDay - a.expectedPerDay);
  return { dates, rows };
}

function freshColor(n: number, expected: number): string {
  if (n === 0) return 'var(--up)';
  // Healthy = within 5% of the chain's typical catalog size. Below ⅔ of
  // typical = suspicious (partial scrape). Zero = failed.
  const ratio = expected > 0 ? n / expected : 0;
  if (ratio >= 0.95) return 'var(--accent)';
  if (ratio >= 0.66) return 'var(--ink-2)';
  if (ratio > 0) return 'var(--up)';
  return 'var(--up)';
}

function fmtShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.`;
}

function computeStats(products: readonly Product[]): { byStore: StoreStats[]; total: number; totalAvailable: number; medianAll: number } {
  const groups = new Map<Store, Product[]>();
  for (const p of products) {
    const arr = groups.get(p.store) ?? [];
    arr.push(p);
    groups.set(p.store, arr);
  }
  const byStore: StoreStats[] = [...groups.entries()]
    .map(([store, ps]) => ({
      store,
      count: ps.length,
      available: ps.filter((p) => p.available).length,
      brandPct: pct(ps, (p) => Boolean(p.brand)),
      eanPct: pct(ps, (p) => Boolean(p.ean)),
      catPct: pct(ps, (p) => Boolean(p.categoryCanonical)),
      medianPrice: median(ps.map((p) => p.price)),
    }))
    .sort((a, b) => b.count - a.count);
  return {
    byStore,
    total: products.length,
    totalAvailable: products.filter((p) => p.available).length,
    medianAll: median(products.map((p) => p.price)),
  };
}

function pct(ps: Product[], pred: (p: Product) => boolean): number {
  if (ps.length === 0) return 0;
  return (ps.filter(pred).length / ps.length) * 100;
}

function pctColor(p: number): string {
  if (p >= 80) return 'var(--accent)';
  if (p >= 40) return 'var(--ink-2)';
  return 'var(--up)';
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function toCsv(products: readonly Product[]): string {
  const cols = ['store', 'id', 'name', 'brand', 'category_canonical', 'price', 'unit', 'quantity', 'unit_price', 'unit_price_label', 'ean', 'available', 'url'] as const;
  const lines = [cols.join(',')];
  for (const p of products) {
    const id = p.id.split('::').slice(1).join('::');
    lines.push([
      p.store,
      esc(id),
      esc(p.name),
      esc(p.brand ?? ''),
      esc(p.categoryCanonical ?? ''),
      String(p.price),
      esc(p.unit ?? ''),
      p.quantity != null ? String(p.quantity) : '',
      p.unitPrice != null ? String(p.unitPrice) : '',
      esc(p.unitPriceLabel ?? ''),
      esc(p.ean ?? ''),
      p.available ? '1' : '0',
      esc(p.url),
    ].join(','));
  }
  return lines.join('\n');
}

function esc(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(filename: string, type: string, text: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function estimateJsonSize(dataset: Dataset): number {
  // Rough: ~250 bytes per product after compression. Used only for display.
  return dataset.products.length * 250;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
