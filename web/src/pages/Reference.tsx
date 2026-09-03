import { useMemo, useState } from 'react';
import { PriceChart } from '../components/PriceChart.tsx';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, ReferenceItem } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

/**
 * Czech Statistical Office national average prices — 86 representative food and
 * drink items, monthly. This is reference data, deliberately *not* joined to our
 * scraped products: our catalogue skews BIO and premium, so a naive per-product
 * comparison reads 17–79% high and would be quietly wrong.
 */

/** COICOP class prefix → Czech section heading. */
const GROUPS: Array<{ prefix: string; label: string }> = [
  { prefix: '0111', label: 'Pečivo a obiloviny' },
  { prefix: '0112', label: 'Maso' },
  { prefix: '0113', label: 'Ryby' },
  { prefix: '0114', label: 'Mléko, sýry, vejce' },
  { prefix: '0115', label: 'Oleje a tuky' },
  { prefix: '0116', label: 'Ovoce' },
  { prefix: '0117', label: 'Zelenina' },
  { prefix: '0118', label: 'Cukr a sladkosti' },
  { prefix: '0119', label: 'Ostatní potraviny' },
  { prefix: '0122', label: 'Káva' },
  { prefix: '0123', label: 'Čaj' },
  { prefix: '0125', label: 'Minerální vody' },
  { prefix: '0126', label: 'Nealkoholické nápoje' },
  { prefix: '0211', label: 'Lihoviny' },
  { prefix: '0212', label: 'Víno' },
  { prefix: '0213', label: 'Pivo' },
];

function change(item: ReferenceItem, monthsBack: number): number | undefined {
  const now = item.history[0];
  const then = item.history[monthsBack];
  if (!now || !then || then.price === 0) return undefined;
  return (now.price - then.price) / then.price;
}

function Delta({ value }: { value: number | undefined }): React.ReactElement {
  if (value == null) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  const pct = (value * 100).toFixed(1).replace('.', ',');
  const up = value > 0;
  const flat = Math.abs(value) < 0.001;
  return (
    <span style={{ color: flat ? 'var(--ink-3)' : up ? '#b23' : '#176' }}>
      {flat ? '0,0%' : `${up ? '+' : ''}${pct}%`}
    </span>
  );
}

/** Min/max-normalised polyline, oldest → newest. */
function Spark({ item }: { item: ReferenceItem }): React.ReactElement {
  const pts = [...item.history].reverse();
  if (pts.length < 2) return <svg width={70} height={22} />;
  const vals = pts.map((p) => p.price);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const d = pts
    .map((p, i) => `${(i / (pts.length - 1)) * 68 + 1},${21 - ((p.price - lo) / span) * 20}`)
    .join(' ');
  const rising = vals[vals.length - 1]! >= vals[0]!;
  return (
    <svg width={70} height={22} aria-hidden>
      <polyline points={d} fill="none" stroke={rising ? '#b23' : '#176'} strokeWidth={1.5} />
    </svg>
  );
}

export function Reference({ dataset }: Props): React.ReactElement {
  const ref = dataset.reference;
  const [selected, setSelected] = useState<string | null>(null);

  const sections = useMemo(() => {
    if (!ref) return [];
    return GROUPS.map((g) => ({
      ...g,
      items: ref.items.filter((i) => i.coicop.startsWith(g.prefix)),
    })).filter((g) => g.items.length > 0);
  }, [ref]);

  const latestMonth = ref?.items[0]?.history[0]?.month;
  const chosen = ref?.items.find((i) => i.code === selected);

  if (!ref) {
    return (
      <div className="container" style={{ padding: '40px 28px 64px', maxWidth: 900 }}>
        <div className="meta">NÁRODNÍ PRŮMĚR</div>
        <h1 className="display" style={{ fontSize: 40, lineHeight: 1.1, margin: '8px 0 20px' }}>
          Data se připravují.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          Referenční řada ČSÚ zatím nebyla vygenerována. Spusťte <code>npm run reference</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 28px 64px', maxWidth: 900 }}>
      <div className="meta">NÁRODNÍ PRŮMĚR&nbsp;· ČSÚ</div>
      <h1 className="display" style={{ fontSize: 40, lineHeight: 1.1, margin: '8px 0 16px' }}>
        Průměrné ceny v celé ČR
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', marginBottom: 8 }}>
        {ref.items.length} reprezentativních položek, které Český statistický úřad počítá z
        pokladních dat všech českých řetězců. Měsíční řada od {ref.items[0]?.history.at(-1)?.month}
        {latestMonth ? ` do ${latestMonth}` : ''}.
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-3)', marginBottom: 28 }}>
        Tato čísla záměrně neporovnáváme s jednotlivými produkty v katalogu — náš sortiment je
        posunutý k BIO a prémiovým variantám, takže by srovnání vycházelo zkresleně vysoko.
      </p>

      {chosen && (
        <section style={{ marginBottom: 32 }}>
          <h2
            className="display"
            style={{ fontSize: 20, margin: 0, borderTop: '2px solid var(--ink)', padding: '16px 0 8px' }}
          >
            {chosen.label}
          </h2>
          <PriceChart
            series={[
              {
                label: 'ČSÚ průměr ČR',
                color: '#b23',
                points: [...chosen.history]
                  .reverse()
                  .map((h) => ({ date: h.month, price: h.price })),
              },
            ]}
            yLabel="Kč"
            height={200}
          />
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--ink-2)',
              borderBottom: '1px solid currentColor',
              font: 'inherit',
              fontSize: 13,
            }}
          >
            zavřít graf
          </button>
        </section>
      )}

      {sections.map((g) => (
        <section key={g.prefix} style={{ marginBottom: 28 }}>
          <h2
            className="display"
            style={{ fontSize: 18, margin: 0, borderTop: '2px solid var(--ink)', padding: '14px 0 6px' }}
          >
            {g.label}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: 'var(--ink-3)', textAlign: 'left' }}>
                <th style={{ fontWeight: 400, padding: '6px 0' }}>Položka</th>
                <th style={{ fontWeight: 400, textAlign: 'right' }}>Cena</th>
                <th style={{ fontWeight: 400, textAlign: 'right' }}>m/m</th>
                <th style={{ fontWeight: 400, textAlign: 'right' }}>r/r</th>
                <th style={{ fontWeight: 400, textAlign: 'right', width: 80 }}>Vývoj</th>
                <th style={{ fontWeight: 400, textAlign: 'right', width: 90 }}>Produkty</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((item) => (
                <tr
                  key={item.code}
                  onClick={() => setSelected(item.code === selected ? null : item.code)}
                  style={{ borderTop: '1px solid var(--rule)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '7px 0' }}>
                    {(dataset.referenceMembers?.[item.code]?.length ?? 0) > 0 ? (
                      <a
                        href={`#/r/${item.code}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ borderBottom: '1px solid var(--rule)' }}
                      >
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    )}{' '}
                    <span style={{ color: 'var(--ink-3)' }}>[{item.packaging}]</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCZK(item.history[0]?.price)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <Delta value={change(item, 1)} />
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <Delta value={change(item, 12)} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Spark item={item} />
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)' }}>
                    {dataset.referenceMembers?.[item.code]?.length ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 24 }}>
        Zdroj: Český statistický úřad, datová sada „Průměrné spotřebitelské ceny vybraných druhů
        zboží“. Aktualizace měsíčně.
      </p>
    </div>
  );
}
