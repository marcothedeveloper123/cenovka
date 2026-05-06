import { useEffect, useMemo, useRef } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { useCart } from '../lib/storage.ts';
import type { Dataset, Product, Store } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

interface CartLine {
  /** Stable key — either a groupId (cross-chain product) or a product.id (singleton) */
  key: string;
  qty: number;
  /** Members across chains for grouped items, or [singleton] for ungrouped */
  members: Product[];
  /** Visible name (cheapest member's name) */
  name: string;
  /** Cheapest available across chains right now */
  cheapest: Product;
}

export function Cart({ dataset }: Props): React.ReactElement {
  const cart = useCart();
  const productById = useMemo(() => new Map(dataset.products.map((p) => [p.id, p])), [dataset.products]);
  const groupById = useMemo(() => new Map(dataset.groups.map((g) => [g.id, g])), [dataset.groups]);

  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;
    const hash = window.location.hash;
    const q = hash.split('?')[1];
    if (!q) return;
    const params = new URLSearchParams(q);
    const raw = params.get('items');
    if (!raw) return;
    for (const tok of raw.split(',')) {
      if (!tok) continue;
      const [k, q2] = tok.split('*');
      const qty = q2 ? parseInt(q2, 10) : 1;
      if (k && qty > 0) cart.add(k, qty);
    }
    history.replaceState(null, '', hash.split('?')[0] || '#/k');
  }, [cart]);

  const lines = useMemo<CartLine[]>(() => buildLines(cart.items, productById, groupById), [cart.items, productById, groupById]);

  if (lines.length === 0) {
    return (
      <div className="container" style={{ padding: '64px 28px', maxWidth: 720 }}>
        <div className="meta">KOŠÍK</div>
        <h1 className="display" style={{ fontSize: 40, margin: '8px 0 16px' }}>Tvůj košík je prázdný</h1>
        <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>
          Přidej produkty z vyhledávání nebo z detailu produktu. Cenovka pak spočítá, kolik tě
          týdenní nákup vyjde u každého řetězce.
        </p>
        <a href="#/h" className="btn btn-primary" style={{ height: 44, padding: '0 24px' }}>
          Začít vyhledáváním →
        </a>
      </div>
    );
  }

  const totals = computeChainTotals(lines);
  const cheapestStore = totals.length > 0 ? totals[0]! : null;
  const priciestStore = totals.length > 0 ? totals[totals.length - 1]! : null;
  const spread = priciestStore && cheapestStore && cheapestStore.total > 0
    ? ((priciestStore.total / cheapestStore.total) - 1) * 100
    : 0;

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta">KOŠÍK · {lines.length} {pluralPolozka(lines.length)}</div>
      <h1 className="display" style={{ fontSize: 36, margin: '4px 0 24px' }}>Tvůj nákupní seznam</h1>

      {cheapestStore && priciestStore && spread >= 1 && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            padding: '16px 20px',
            border: '2px solid var(--accent)',
            background: 'var(--accent-soft)',
            marginBottom: 32,
          }}
        >
          <div>
            <div className="meta" style={{ color: 'var(--accent-2)' }}>NEJLEVNĚJI</div>
            <div className="num display" style={{ fontSize: 28, color: 'var(--accent-2)' }}>
              {fmtCZK(cheapestStore.total, 0)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {cheapestStore.storeName} · {cheapestStore.covered}/{lines.length} položek
            </div>
          </div>
          <div>
            <div className="meta">NEJDRAŽEJI</div>
            <div className="num display" style={{ fontSize: 28 }}>
              {fmtCZK(priciestStore.total, 0)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {priciestStore.storeName} · {priciestStore.covered}/{lines.length} položek
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="meta">UŠETŘÍŠ</div>
            <div className="num display" style={{ fontSize: 28, color: 'var(--accent)' }}>
              {fmtCZK(priciestStore.total - cheapestStore.total, 0)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{spread.toFixed(0)} %</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '2px solid var(--ink)' }}>
            {lines.map((line) => (
              <CartRow
                key={line.key}
                line={line}
                onSetQty={(q) => cart.set(line.key, q)}
                onRemove={() => cart.remove(line.key)}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              for (const line of lines) cart.remove(line.key);
            }}
            className="btn"
            style={{ marginTop: 24 }}
          >
            Vyprázdnit košík
          </button>
        </div>

        <aside>
          <div style={{ border: '1px solid var(--rule-2)', padding: 16, background: 'var(--bg)' }}>
            <div className="meta" style={{ marginBottom: 12 }}>POROVNÁNÍ NÁKLADŮ</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {totals.map((t, i) => (
                <li
                  key={t.store}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--rule)',
                    color: i === 0 ? 'var(--accent)' : undefined,
                    fontWeight: i === 0 ? 500 : 400,
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    {i === 0 && '★ '}
                    {t.storeName}
                    <span className="meta" style={{ marginLeft: 6, fontSize: 10 }}>
                      {t.covered}/{lines.length}
                    </span>
                  </span>
                  <span className="num">{fmtCZK(t.total, 0)}</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>
              Položky bez ceny v daném řetězci se nezapočítávají do součtu.
            </p>
          </div>
          <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--rule-2)' }}>
            <div className="meta">SDÍLET KOŠÍK</div>
            <input
              readOnly
              className="mono"
              value={`${window.location.origin}/#/k?items=${encodeCart(cart.items)}`}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: '100%', marginTop: 8, height: 32, padding: '0 8px', border: '1px solid var(--rule-2)', fontSize: 12, background: 'var(--bg-2)' }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CartRow({
  line,
  onSetQty,
  onRemove,
}: {
  line: CartLine;
  onSetQty: (q: number) => void;
  onRemove: () => void;
}): React.ReactElement {
  const cheapest = line.cheapest;
  return (
    <li
      style={{
        padding: '14px 0',
        borderBottom: '1px solid var(--rule)',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 16,
        alignItems: 'baseline',
      }}
    >
      <div>
        <a href={`#/p/${cheapest.id}`} style={{ fontSize: 15, fontWeight: 500 }}>
          {line.name}
        </a>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          ★ <strong>{cheapest.storeName}</strong> {fmtCZK(cheapest.price)}
          {line.members.length > 1 && (
            <> · k mání u {line.members.length} řetězců</>
          )}
          {cheapest.unit && cheapest.quantity != null && (
            <> · {cheapest.quantity} {cheapest.unit}</>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          className="btn"
          style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }}
          onClick={() => onSetQty(Math.max(0, line.qty - 1))}
          aria-label="Méně"
        >
          −
        </button>
        <span className="num" style={{ minWidth: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {line.qty}
        </span>
        <button
          type="button"
          className="btn"
          style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }}
          onClick={() => onSetQty(line.qty + 1)}
          aria-label="Více"
        >
          +
        </button>
      </div>
      <span className="num display" style={{ fontSize: 18, minWidth: 80, textAlign: 'right' }}>
        {fmtCZK(line.qty * cheapest.price)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        style={{ color: 'var(--ink-4)', fontSize: 13, padding: '0 6px' }}
        aria-label="Odebrat"
        title="Odebrat z košíku"
      >
        ×
      </button>
    </li>
  );
}

function buildLines(
  items: Record<string, number>,
  productById: Map<string, Product>,
  groupById: Map<string, { id: string; productKeys: string[] }>,
): CartLine[] {
  const out: CartLine[] = [];
  for (const [key, qty] of Object.entries(items)) {
    if (qty <= 0) continue;
    const group = groupById.get(key);
    if (group) {
      const members = group.productKeys
        .map((k) => productById.get(k))
        .filter((p): p is Product => p !== undefined && p.available);
      if (members.length === 0) continue;
      const cheapest = members.reduce((a, b) => (a.price <= b.price ? a : b));
      out.push({ key, qty, members, name: cheapest.name, cheapest });
    } else {
      const p = productById.get(key);
      if (!p) continue;
      out.push({ key, qty, members: [p], name: p.name, cheapest: p });
    }
  }
  return out;
}

interface ChainTotal {
  store: Store;
  storeName: string;
  total: number;
  covered: number;
}

function computeChainTotals(lines: readonly CartLine[]): ChainTotal[] {
  const totals = new Map<Store, { name: string; total: number; covered: number }>();
  for (const line of lines) {
    for (const m of line.members) {
      const t = totals.get(m.store) ?? { name: m.storeName, total: 0, covered: 0 };
      t.total += m.price * line.qty;
      t.covered += 1;
      totals.set(m.store, t);
    }
  }
  return [...totals.entries()]
    .map(([store, v]) => ({ store, storeName: v.name, total: v.total, covered: v.covered }))
    .sort((a, b) => b.covered - a.covered || a.total - b.total);
}

function pluralPolozka(n: number): string {
  if (n === 1) return 'položka';
  if (n >= 2 && n <= 4) return 'položky';
  return 'položek';
}

function encodeCart(items: Record<string, number>): string {
  return Object.entries(items)
    .filter(([, q]) => q > 0)
    .map(([k, q]) => (q === 1 ? k : `${k}*${q}`))
    .join(',');
}
