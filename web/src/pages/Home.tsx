import { useState } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { navigate } from '../lib/route.ts';
import type { Dataset } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

export function Home({ dataset }: Props): React.ReactElement {
  const [q, setQ] = useState('');
  const stats = computeStats(dataset);

  return (
    <div className="container" style={{ padding: '64px 28px 40px' }}>
      <div className="meta" style={{ marginBottom: 16 }}>DENNÍ POROVNÁNÍ CEN · {dataset.products.length.toLocaleString('cs')} produktů</div>
      <h1
        className="display"
        style={{ fontSize: 56, lineHeight: 1.05, margin: '0 0 24px', maxWidth: 900 }}
      >
        Kolik stojí mléko, máslo, chléb. Dnes.
      </h1>
      <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 720, marginBottom: 32 }}>
        Porovnání cen napříč {stats.chains} řetězci — bez přihlášení, bez sledování, denně aktualizováno.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate('/h', { q: q.trim() });
        }}
        style={{ display: 'flex', gap: 8, maxWidth: 640, marginBottom: 64 }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="máslo, mléko, kávové kapsle…"
          aria-label="Hledat"
          style={{ flex: 1, height: 52, padding: '0 18px', border: '1px solid var(--ink)', fontSize: 18, background: 'var(--bg)' }}
        />
        <button type="submit" className="btn btn-primary" style={{ height: 52, padding: '0 28px', fontSize: 16 }}>
          Hledat
        </button>
      </form>

      <hr className="rule" style={{ margin: '0 0 32px' }} />

      <section>
        <div className="meta" style={{ marginBottom: 12 }}>DATASET</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
          <Stat label="Produkty" value={dataset.products.length.toLocaleString('cs')} />
          <Stat label="Řetězce" value={String(stats.chains)} />
          <Stat label="Cross-chain skupiny" value={dataset.groups.length.toLocaleString('cs')} />
          <Stat label="S EAN" value={`${pct(stats.withEan, dataset.products.length)}`} />
        </div>
      </section>

      <hr className="rule" style={{ margin: '40px 0 32px' }} />

      <section>
        <div className="meta" style={{ marginBottom: 12 }}>NEJVĚTŠÍ ROZDÍLY MEZI ŘETĚZCI</div>
        {stats.topSpreads.length === 0 ? (
          <p style={{ color: 'var(--ink-3)' }}>
            Žádné cross-chain skupiny zatím nedávají jasný rozdíl. Zkus znovu, až cron poběží další den.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {stats.topSpreads.map((s) => (
              <li key={s.groupId} style={{ borderBottom: '1px solid var(--rule)', padding: '14px 0' }}>
                <a
                  href={`#/c/${s.groupId}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}
                >
                  <span style={{ flex: 1 }}>
                    <strong>{s.label}</strong>
                    <span style={{ color: 'var(--ink-3)', marginLeft: 12, fontSize: 13 }}>
                      {s.cheapestStore} {fmtCZK(s.cheapest)} → {s.priciestStore} {fmtCZK(s.priciest)}
                    </span>
                  </span>
                  <span className="num" style={{ color: 'var(--up)', fontWeight: 600 }}>
                    +{Math.round(s.spreadPct * 100)}%
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="meta">{label}</div>
      <div className="num display" style={{ fontSize: 36, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function pct(num: number, den: number): string {
  if (den === 0) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

interface SpreadRow {
  groupId: string;
  label: string;
  cheapest: number;
  cheapestStore: string;
  priciest: number;
  priciestStore: string;
  spreadPct: number;
}

function computeStats(dataset: Dataset): {
  chains: number;
  withEan: number;
  topSpreads: SpreadRow[];
} {
  const chainSet = new Set(dataset.products.map((p) => p.store));
  const withEan = dataset.products.filter((p) => p.ean).length;

  const productById = new Map(dataset.products.map((p) => [p.id, p]));
  const spreadRows: SpreadRow[] = [];
  for (const g of dataset.groups) {
    if (g.productKeys.length < 2 || g.productKeys.length > 8) continue; // skip over-clustered
    const prods = g.productKeys.map((k) => productById.get(k)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (prods.length < 2) continue;
    const cheapest = prods.reduce((a, b) => (a.price <= b.price ? a : b));
    const priciest = prods.reduce((a, b) => (a.price >= b.price ? a : b));
    if (cheapest.price <= 0) continue;
    const spreadPct = (priciest.price - cheapest.price) / cheapest.price;
    if (spreadPct < 0.05) continue;
    spreadRows.push({
      groupId: g.id,
      label: cheapest.name,
      cheapest: cheapest.price,
      cheapestStore: cheapest.storeName,
      priciest: priciest.price,
      priciestStore: priciest.storeName,
      spreadPct,
    });
  }
  spreadRows.sort((a, b) => b.spreadPct - a.spreadPct);
  return { chains: chainSet.size, withEan, topSpreads: spreadRows.slice(0, 8) };
}
