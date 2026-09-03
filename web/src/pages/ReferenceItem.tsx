import { useMemo } from 'react';
import { PriceChart } from '../components/PriceChart.tsx';
import { csuUnitPrice } from '../lib/data.ts';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product, Store } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
  code: string;
}

const STORE_ORDER: Store[] = ['tesco', 'rohlik', 'kosik', 'billa', 'globus', 'kaufland', 'penny', 'lidl'];

/**
 * One ČSÚ item: its national average and trend, then every product we scraped
 * that is listed under it, grouped by chain and sorted by unit price. This is a
 * browse list, not a like-for-like sample — the sentence at the top says so.
 */
export function ReferenceItem({ dataset, code }: Props): React.ReactElement {
  const item = dataset.reference?.items.find((i) => i.code === code);
  const ref = item ? csuUnitPrice(item) : {};

  const byStore = useMemo(() => {
    const ids = new Set(dataset.referenceMembers?.[code] ?? []);
    const groups = new Map<Store, Product[]>();
    for (const p of dataset.products) {
      if (!ids.has(p.id)) continue;
      (groups.get(p.store) ?? groups.set(p.store, []).get(p.store)!).push(p);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
    }
    return STORE_ORDER.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!] as const);
  }, [dataset, code]);

  const total = byStore.reduce((n, [, list]) => n + list.length, 0);

  if (!item) {
    return (
      <div className="container" style={{ padding: '40px 28px 64px', maxWidth: 900 }}>
        <div className="meta">NÁRODNÍ PRŮMĚR · ČSÚ</div>
        <h1 className="display" style={{ fontSize: 36, margin: '8px 0 16px' }}>Položka nenalezena.</h1>
        <a href="#/r" style={{ borderBottom: '1px solid currentColor' }}>← Všechny položky</a>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 28px 64px', maxWidth: 900 }}>
      <div className="meta">
        <a href="#/r" style={{ borderBottom: '1px solid currentColor' }}>NÁRODNÍ PRŮMĚR</a> · ČSÚ
      </div>
      <h1 className="display" style={{ fontSize: 36, lineHeight: 1.1, margin: '8px 0 12px' }}>
        {item.name} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>[{item.packaging}]</span>
      </h1>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', padding: '16px 0', borderTop: '2px solid var(--ink)', borderBottom: '1px solid var(--rule)' }}>
        <div>
          <div className="meta">PRŮMĚR ČR · {item.history[0]?.month}</div>
          <div className="num display" style={{ fontSize: 40, lineHeight: 1, marginTop: 4 }}>
            {fmtCZK(item.history[0]?.price)}
          </div>
          {ref.unitPrice != null && (
            <div className="num" style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              {fmtCZK(ref.unitPrice)} / {ref.unitPriceLabel}
            </div>
          )}
        </div>
        <div>
          <div className="meta">V NAŠEM KATALOGU</div>
          <div className="num display" style={{ fontSize: 26, marginTop: 4 }}>{total} produktů</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {byStore.map(([s, l]) => `${STORE_LABEL[s]} ${l.length}`).join(' · ') || 'zatím žádné'}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-3)', margin: '16px 0 24px' }}>
        Seznam vzniká párováním názvů, ne stejného zboží: náš sortiment je posunutý k BIO a
        prémiovým variantám, takže není vzorkem toho, co ČSÚ oceňuje. Ceny za jednotku jsou
        fakta vedle sebe, ne procento nad průměrem.
      </p>

      <section style={{ marginBottom: 32 }}>
        <PriceChart
          series={[{
            label: 'ČSÚ průměr ČR',
            color: '#b23',
            points: [...item.history].reverse().map((h) => ({ date: h.month, price: h.price })),
          }]}
          yLabel="Kč"
          height={180}
        />
      </section>

      {total === 0 && (
        <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          Tuto položku zatím nepřiřazujeme k produktům — buď názvy nenesou rozlišení, které ČSÚ dělá,
          nebo ji řetězce, které sledujeme, nenabízejí.
        </p>
      )}

      {byStore.map(([store, list]) => (
        <section key={store} style={{ marginBottom: 28 }}>
          <h2 className="display" style={{ fontSize: 18, margin: 0, borderTop: '2px solid var(--ink)', padding: '14px 0 6px' }}>
            {STORE_LABEL[store]} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {list.length}</span>
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              {list.map((p) => {
                const below = ref.unitPrice != null && p.unitPrice != null && p.unitPriceLabel === ref.unitPriceLabel && p.unitPrice < ref.unitPrice;
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--rule)' }}>
                    <td style={{ padding: '7px 0' }}>
                      <a href={`#/p/${encodeURIComponent(p.id)}`} style={{ borderBottom: '1px solid var(--rule)' }}>{p.name}</a>
                      {p.brand && <span style={{ color: 'var(--ink-3)' }}> · {p.brand}</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtCZK(p.price)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: below ? '#176' : 'var(--ink-2)', width: 130 }}>
                      {p.unitPrice != null ? `${fmtCZK(p.unitPrice)} / ${p.unitPriceLabel}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 24 }}>
        Zelená jednotková cena je pod průměrem ČSÚ pro tuto položku. Zdroj průměru: Český statistický úřad.
      </p>
    </div>
  );
}

const STORE_LABEL: Record<Store, string> = {
  tesco: 'Tesco', rohlik: 'Rohlík', kosik: 'Košík', lidl: 'Lidl',
  billa: 'Billa', penny: 'Penny', globus: 'Globus', kaufland: 'Kaufland',
};
