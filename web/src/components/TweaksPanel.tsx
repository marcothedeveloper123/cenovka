import { useEffect, useState } from 'react';
import type { Dataset, Store } from '../lib/types.ts';
import { useCart, useFavorites } from '../lib/storage.ts';

interface Props {
  dataset: Dataset;
  routePath: string;
}

const THEMES = ['light', 'dark', 'sepia'] as const;
type Theme = (typeof THEMES)[number];

export function TweaksPanel({ dataset, routePath }: Props): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') as Theme) || 'light');
  const cart = useCart();
  const favs = useFavorites();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const byStore = new Map<Store, number>();
  for (const p of dataset.products) byStore.set(p.store, (byStore.get(p.store) ?? 0) + 1);

  const grouped = dataset.groups.reduce((s, g) => s + g.productKeys.length, 0);
  const coverage = dataset.products.length > 0 ? (grouped / dataset.products.length) * 100 : 0;

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        background: 'var(--bg)',
        border: '1px solid var(--ink)',
        zIndex: 100,
        fontSize: 12,
        fontFamily: 'var(--mono, monospace)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        maxWidth: 360,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          padding: '6px 12px',
          textAlign: 'left',
          background: 'var(--ink)',
          color: 'var(--bg)',
          fontWeight: 500,
          letterSpacing: '0.06em',
        }}
      >
        {open ? '▼' : '▲'} TWEAKS
      </button>
      {open && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Block label="Route">
            <span className="mono">{routePath || '/'}</span>
          </Block>

          <Block label="Theme">
            <div style={{ display: 'flex', gap: 4 }}>
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid var(--rule-2)',
                    background: theme === t ? 'var(--ink)' : 'var(--bg)',
                    color: theme === t ? 'var(--bg)' : 'var(--ink)',
                    fontSize: 11,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </Block>

          <Block label="Dataset">
            <div>{dataset.products.length.toLocaleString('cs')} produktů</div>
            <div>{dataset.groups.length.toLocaleString('cs')} skupin · {coverage.toFixed(1)}% pokrytí</div>
            <div style={{ color: 'var(--ink-3)' }}>{dataset.generatedAt}</div>
          </Block>

          <Block label="Per-store">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px' }}>
              {[...byStore.entries()]
                .sort((a, b) => b[1] - a[1])
                .flatMap(([s, n]) => [
                  <span key={`${s}-l`}>{s}</span>,
                  <span key={`${s}-n`} className="num" style={{ textAlign: 'right' }}>{n.toLocaleString('cs')}</span>,
                ])}
            </div>
          </Block>

          <Block label="Local storage">
            <div>cart: {Object.keys(cart.items).length} klíčů, {cart.total} ks</div>
            <div>favs: {favs.count}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Vyprázdnit košík?')) {
                    for (const k of Object.keys(cart.items)) cart.remove(k);
                  }
                }}
                style={{ padding: '2px 6px', border: '1px solid var(--rule-2)', fontSize: 11 }}
              >
                clear cart
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Smazat všechna oblíbená?')) {
                    localStorage.removeItem('cenovka-favs');
                    location.reload();
                  }
                }}
                style={{ padding: '2px 6px', border: '1px solid var(--rule-2)', fontSize: 11 }}
              >
                clear favs
              </button>
            </div>
          </Block>
        </div>
      )}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <div style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div>{children}</div>
    </div>
  );
}
