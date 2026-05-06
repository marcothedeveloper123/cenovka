import { useMemo } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { useFavorites } from '../lib/storage.ts';
import type { Dataset, Product } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

interface FavLine {
  key: string;
  members: Product[];
  cheapest: Product;
  priciest: Product;
  groupSize: number;
}

export function Favorites({ dataset }: Props): React.ReactElement {
  const favs = useFavorites();
  const productById = useMemo(() => new Map(dataset.products.map((p) => [p.id, p])), [dataset.products]);
  const groupById = useMemo(() => new Map(dataset.groups.map((g) => [g.id, g])), [dataset.groups]);

  const lines = useMemo<FavLine[]>(() => {
    const out: FavLine[] = [];
    const ids = dataset.products
      .map((p) => p.groupId ?? p.id)
      .filter((id) => favs.has(id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const group = groupById.get(id);
      const members = group
        ? group.productKeys.map((k) => productById.get(k)).filter((p): p is Product => p !== undefined && p.available)
        : [productById.get(id)].filter((p): p is Product => p !== undefined && p.available);
      if (members.length === 0) continue;
      const cheapest = members.reduce((a, b) => (a.price <= b.price ? a : b));
      const priciest = members.reduce((a, b) => (a.price >= b.price ? a : b));
      out.push({ key: id, members, cheapest, priciest, groupSize: members.length });
    }
    return out.sort((a, b) => a.cheapest.name.localeCompare(b.cheapest.name, 'cs'));
  }, [dataset.products, favs, productById, groupById]);

  if (lines.length === 0) {
    return (
      <div className="container" style={{ padding: '64px 28px', maxWidth: 720 }}>
        <div className="meta">OBLÍBENÉ</div>
        <h1 className="display" style={{ fontSize: 40, margin: '8px 0 16px' }}>
          Zatím nemáš žádné oblíbené
        </h1>
        <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>
          Klikni na hvězdičku u jakéhokoli produktu a budeš sledovat cenu napříč řetězci.
          Cenovka tě upozorní, když cena spadne (jakmile bude historie delší).
        </p>
        <a href="#/h" className="btn btn-primary" style={{ height: 44, padding: '0 24px' }}>
          Najít první produkt →
        </a>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta">OBLÍBENÉ · {lines.length}</div>
      <h1 className="display" style={{ fontSize: 36, margin: '4px 0 24px' }}>Tvé sledované ceny</h1>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '2px solid var(--ink)' }}>
        {lines.map((line) => (
          <FavRow key={line.key} line={line} onUnstar={() => favs.toggle(line.key)} />
        ))}
      </ul>
    </div>
  );
}

function FavRow({ line, onUnstar }: { line: FavLine; onUnstar: () => void }): React.ReactElement {
  const { cheapest, priciest, groupSize } = line;
  const spread = cheapest.price > 0 ? ((priciest.price / cheapest.price) - 1) * 100 : 0;
  const showSpread = groupSize > 1 && spread >= 1;
  return (
    <li
      style={{
        padding: '14px 0',
        borderBottom: '1px solid var(--rule)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16,
        alignItems: 'baseline',
      }}
    >
      <button
        type="button"
        onClick={onUnstar}
        aria-label="Odebrat z oblíbených"
        title="Odebrat z oblíbených"
        style={{ color: 'var(--accent)', fontSize: 20, lineHeight: 1, padding: 0, alignSelf: 'center' }}
      >
        ★
      </button>
      <div>
        <a href={`#/p/${cheapest.id}`} style={{ fontSize: 15, fontWeight: 500 }}>
          {cheapest.name}
        </a>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          ★ {cheapest.storeName} {fmtCZK(cheapest.price)}
          {groupSize > 1 && (
            <> · v {groupSize} řetězcích</>
          )}
          {cheapest.unit && cheapest.quantity != null && (
            <> · {cheapest.quantity} {cheapest.unit}</>
          )}
        </div>
      </div>
      {showSpread ? (
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>rozpětí</div>
          <div className="num" style={{ fontSize: 14, color: 'var(--accent)' }}>
            +{spread.toFixed(0)} %
          </div>
        </div>
      ) : (
        <span />
      )}
      {groupSize > 1 ? (
        <a
          href={`#/c/${line.key}`}
          className="btn"
          style={{ height: 28, padding: '0 10px', fontSize: 12 }}
        >
          Porovnat →
        </a>
      ) : (
        <a
          href={cheapest.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ height: 28, padding: '0 10px', fontSize: 12 }}
        >
          Otevřít ↗
        </a>
      )}
    </li>
  );
}
