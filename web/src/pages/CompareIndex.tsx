import { useMemo } from 'react';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product } from '../lib/types.ts';

const MAX_ROWS = 40;
const MIN_GROUP = 2;
const MAX_GROUP = 8;

interface Props {
  dataset: Dataset;
}

interface IndexRow {
  groupId: string;
  name: string;
  storeCount: number;
  cheapest: Product;
  priciest: Product;
  spreadPct: number;
}

export function CompareIndex({ dataset }: Props): React.ReactElement {
  const rows = useMemo<IndexRow[]>(() => buildRows(dataset), [dataset]);

  return (
    <div className="container" style={{ padding: '32px 28px 56px', maxWidth: 920 }}>
      <div className="meta">SROVNÁNÍ</div>
      <h1 className="display" style={{ fontSize: 36, margin: '4px 0 8px' }}>
        Co se kde nejvíc liší
      </h1>
      <p style={{ color: 'var(--ink-3)', maxWidth: 640, marginBottom: 24 }}>
        Skupiny stejného produktu napříč řetězci, seřazené podle rozdílu mezi nejlevnějším
        a nejdražším. Klikni pro srovnávací pohled. Začneš nejlépe ze{' '}
        <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>vyhledávání</a>.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '2px solid var(--ink)' }}>
        {rows.map((r) => (
          <li
            key={r.groupId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 16,
              padding: '14px 0',
              borderBottom: '1px solid var(--rule)',
              alignItems: 'baseline',
            }}
          >
            <div>
              <a href={`#/c/${r.groupId}`} style={{ fontSize: 15, fontWeight: 500 }}>
                {r.name}
              </a>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                ★ {r.cheapest.storeName} {fmtCZK(r.cheapest.price)} · až{' '}
                {r.priciest.storeName} {fmtCZK(r.priciest.price)} · {r.storeCount} řetězců
              </div>
            </div>
            <span className="num display" style={{ fontSize: 18, color: 'var(--accent)' }}>
              +{r.spreadPct.toFixed(0)} %
            </span>
            <a
              href={`#/c/${r.groupId}`}
              className="btn"
              style={{ height: 28, padding: '0 10px', fontSize: 12 }}
            >
              Porovnat →
            </a>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p style={{ color: 'var(--ink-3)', padding: '40px 0' }}>
          Žádné skupiny napříč řetězci zatím nejsou. Jak se sbírá více dat, naplní se to.
        </p>
      )}
    </div>
  );
}

function buildRows(dataset: Dataset): IndexRow[] {
  const productById = new Map(dataset.products.map((p) => [p.id, p]));
  const out: IndexRow[] = [];
  for (const g of dataset.groups) {
    if (g.productKeys.length < MIN_GROUP || g.productKeys.length > MAX_GROUP) continue;
    const members = g.productKeys
      .map((k) => productById.get(k))
      .filter((p): p is Product => p !== undefined && p.available);
    if (members.length < MIN_GROUP) continue;
    const cheapest = members.reduce((a, b) => (a.price <= b.price ? a : b));
    const priciest = members.reduce((a, b) => (a.price >= b.price ? a : b));
    if (cheapest.price <= 0) continue;
    const spreadPct = ((priciest.price / cheapest.price) - 1) * 100;
    if (spreadPct < 5) continue;
    out.push({
      groupId: g.id,
      name: cheapest.name,
      storeCount: members.length,
      cheapest,
      priciest,
      spreadPct,
    });
  }
  return out.sort((a, b) => b.spreadPct - a.spreadPct).slice(0, MAX_ROWS);
}
