import { useMemo } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { useCart } from '../lib/storage.ts';
import type { Dataset, Product } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

interface Mover {
  product: Product;
  oldPrice: number;
  newPrice: number;
  pctChange: number;
  daysCovered: number;
}

export function Trends({ dataset }: Props): React.ReactElement {
  const cart = useCart();
  const movers = useMemo(() => computeMovers(dataset.products), [dataset.products]);
  const fallers = useMemo(() => movers.filter((m) => m.pctChange < 0).slice(0, 20), [movers]);
  const risers = useMemo(() => [...movers].filter((m) => m.pctChange > 0).reverse().slice(0, 20), [movers]);
  const historyDepth = useMemo(() => maxHistoryDepth(dataset.products), [dataset.products]);
  const cartTrend = useMemo(() => computeCartTrend(dataset, cart.items), [dataset, cart.items]);

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta">TRENDY</div>
      <h1 className="display" style={{ fontSize: 36, margin: '4px 0 8px' }}>
        Co se hýbe na cenovkách
      </h1>
      <p style={{ color: 'var(--ink-3)', maxWidth: 680, marginBottom: 32 }}>
        Sledování změn cen den po dni. Čím déle Cenovka běží, tím bohatší trendy budou — graf
        ceny za posledních pár měsíců, sezónní křivky, inflační index nákupního košíku.
      </p>

      {historyDepth < 2 ? (
        <EmptyHistory />
      ) : (
        <>
          {cartTrend && (
            <Section title={`Tvůj košík v čase (${cartTrend.lines} položek)`}>
              <BasketStrip points={cartTrend.points} />
              <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
                Suma cen položek z košíku v nejlevnějším řetězci za každý den, kdy máme data.
              </p>
            </Section>
          )}

          <Section title={`Největší propady cen (posledních ${historyDepth} dní)`}>
            <MoversTable movers={fallers} kind="down" />
          </Section>

          <Section title={`Největší růsty cen (posledních ${historyDepth} dní)`}>
            <MoversTable movers={risers} kind="up" />
          </Section>
        </>
      )}
    </div>
  );
}

function EmptyHistory(): React.ReactElement {
  return (
    <div
      style={{
        border: '2px dashed var(--rule-2)',
        padding: '40px 24px',
        textAlign: 'center',
        background: 'var(--bg-2)',
      }}
    >
      <div className="meta">SBÍRÁME DATA</div>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: 480, margin: '12px auto 0' }}>
        Trendy potřebují alespoň dva dny historie. Vrať se zítra — Cenovka stahuje data
        každou noc.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 className="display" style={{
        fontSize: 20,
        margin: 0,
        borderTop: '2px solid var(--ink)',
        padding: '12px 0 12px',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MoversTable({ movers, kind }: { movers: Mover[]; kind: 'up' | 'down' }): React.ReactElement {
  if (movers.length === 0) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Žádné významné pohyby.</p>;
  }
  const arrowColor = kind === 'down' ? 'var(--accent)' : 'var(--up)';
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--rule-2)', textAlign: 'left' }}>
          <th style={{ padding: '8px 0', width: '40%' }}>Produkt</th>
          <th style={{ padding: '8px 0' }}>Řetězec</th>
          <th style={{ padding: '8px 0', textAlign: 'right' }}>Předtím</th>
          <th style={{ padding: '8px 0', textAlign: 'right' }}>Teď</th>
          <th style={{ padding: '8px 0', textAlign: 'right' }}>Změna</th>
          <th style={{ padding: '8px 0', width: 80, textAlign: 'right' }}>Trend</th>
        </tr>
      </thead>
      <tbody>
        {movers.map((m) => (
          <tr key={m.product.id} style={{ borderBottom: '1px solid var(--rule)' }}>
            <td style={{ padding: '8px 0' }}>
              <a href={`#/p/${m.product.id}`} style={{ fontWeight: 500 }}>{m.product.name}</a>
            </td>
            <td style={{ padding: '8px 0', color: 'var(--ink-3)' }}>{m.product.storeName}</td>
            <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: 'var(--ink-3)', textDecoration: 'line-through' }}>
              {fmtCZK(m.oldPrice)}
            </td>
            <td className="num" style={{ padding: '8px 0', textAlign: 'right', fontWeight: 500 }}>
              {fmtCZK(m.newPrice)}
            </td>
            <td className="num" style={{ padding: '8px 0', textAlign: 'right', color: arrowColor }}>
              {m.pctChange > 0 ? '+' : ''}{m.pctChange.toFixed(1)} %
            </td>
            <td style={{ padding: '8px 0', textAlign: 'right' }}>
              <Sparkline history={m.product.history} kind={kind} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sparkline({ history, kind }: { history: { date: string; price: number }[]; kind: 'up' | 'down' }): React.ReactElement {
  if (history.length < 2) return <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>—</span>;
  const W = 70;
  const H = 22;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - ((h.price - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = kind === 'down' ? 'var(--accent)' : 'var(--up)';
  return (
    <svg width={W} height={H} style={{ display: 'inline-block', verticalAlign: 'middle' }} aria-hidden>
      <polyline fill="none" stroke={stroke} strokeWidth={1.5} points={points} />
    </svg>
  );
}

function BasketStrip({ points }: { points: { date: string; total: number }[] }): React.ReactElement {
  if (points.length === 0) return <p style={{ color: 'var(--ink-3)' }}>—</p>;
  const W = 600;
  const H = 80;
  const totals = points.map((p) => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const range = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * W;
      const y = H - ((p.total - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const change = first.total > 0 ? ((last.total - first.total) / first.total) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div className="num display" style={{ fontSize: 28 }}>{fmtCZK(last.total, 0)}</div>
        <div className="num" style={{ color: change > 0 ? 'var(--up)' : 'var(--accent)' }}>
          {change > 0 ? '+' : ''}{change.toFixed(1)} % · od {first.date}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} aria-hidden>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
      </svg>
    </div>
  );
}

function computeMovers(products: readonly Product[]): Mover[] {
  const out: Mover[] = [];
  for (const p of products) {
    if (p.history.length < 2) continue;
    const oldest = p.history[0]!;
    const newest = p.history[p.history.length - 1]!;
    if (oldest.price === newest.price) continue;
    const pctChange = ((newest.price - oldest.price) / oldest.price) * 100;
    if (Math.abs(pctChange) < 1) continue;
    out.push({
      product: p,
      oldPrice: oldest.price,
      newPrice: newest.price,
      pctChange,
      daysCovered: p.history.length,
    });
  }
  return out.sort((a, b) => a.pctChange - b.pctChange);
}

function maxHistoryDepth(products: readonly Product[]): number {
  let max = 0;
  for (const p of products) if (p.history.length > max) max = p.history.length;
  return max;
}

function computeCartTrend(
  dataset: Dataset,
  items: Record<string, number>,
): { lines: number; points: { date: string; total: number }[] } | null {
  const productById = new Map(dataset.products.map((p) => [p.id, p]));
  const groupById = new Map(dataset.groups.map((g) => [g.id, g]));

  const lineProducts: Array<{ qty: number; products: Product[] }> = [];
  for (const [key, qty] of Object.entries(items)) {
    if (qty <= 0) continue;
    const group = groupById.get(key);
    if (group) {
      const ms = group.productKeys.map((k) => productById.get(k)).filter((p): p is Product => p !== undefined);
      if (ms.length > 0) lineProducts.push({ qty, products: ms });
    } else {
      const p = productById.get(key);
      if (p) lineProducts.push({ qty, products: [p] });
    }
  }
  if (lineProducts.length === 0) return null;

  const dates = new Set<string>();
  for (const lp of lineProducts) {
    for (const p of lp.products) for (const h of p.history) dates.add(h.date);
  }
  if (dates.size < 2) return null;

  const sortedDates = [...dates].sort();
  const points: { date: string; total: number }[] = [];
  for (const date of sortedDates) {
    let total = 0;
    let covered = 0;
    for (const lp of lineProducts) {
      const cheapestOnDate = lp.products
        .map((p) => p.history.find((h) => h.date === date)?.price)
        .filter((x): x is number => typeof x === 'number');
      if (cheapestOnDate.length === 0) continue;
      total += Math.min(...cheapestOnDate) * lp.qty;
      covered += 1;
    }
    if (covered > 0) points.push({ date, total });
  }
  if (points.length < 2) return null;
  return { lines: lineProducts.length, points };
}
