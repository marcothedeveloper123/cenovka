import { useEffect, useMemo, useState } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { navigate, type Route } from '../lib/route.ts';
import {
  applyFilters,
  CANONICAL_CATEGORIES,
  STORE_LABELS,
  type Filters,
  type SortKey,
} from '../lib/search.ts';
import type { Dataset, Product, Store } from '../lib/types.ts';

const PAGE_SIZE = 100;

interface Props {
  dataset: Dataset;
  route: Route;
}

export function Search({ dataset, route }: Props): React.ReactElement {
  const [filters, setFilters] = useState<Filters>(() => filtersFromRoute(route));
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  // Sync from URL when route changes (e.g., header search box updates URL)
  useEffect(() => {
    setFilters(filtersFromRoute(route));
    setPageLimit(PAGE_SIZE);
  }, [route]);

  const results = useMemo(() => applyFilters(dataset.products, filters), [dataset.products, filters]);
  const visible = useMemo(() => results.slice(0, pageLimit), [results, pageLimit]);

  const update = (next: Filters) => {
    setFilters(next);
    setPageLimit(PAGE_SIZE);
    navigate('/h', filtersToParams(next));
  };

  const toggle = (key: 'stores' | 'categories', value: string) => {
    const next = new Set(filters[key]) as Set<string>;
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update({ ...filters, [key]: next as Set<Store> });
  };

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta" style={{ marginBottom: 8 }}>VYHLEDÁVÁNÍ</div>
      <h1 className="display" style={{ fontSize: 36, margin: '0 0 16px' }}>
        {filters.q ? <>Výsledky pro „<span style={{ color: 'var(--accent)' }}>{filters.q}</span>"</> : 'Hledat v cenovce'}
      </h1>

      <p className="num" style={{ color: 'var(--ink-3)', margin: '0 0 24px' }}>
        {results.length.toLocaleString('cs')} z {dataset.products.length.toLocaleString('cs')} produktů
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 32, alignItems: 'start' }}>
        <Sidebar filters={filters} onUpdate={update} onToggle={toggle} />
        <div>
          <SortBar sort={filters.sort} onChange={(sort) => update({ ...filters, sort })} count={results.length} />
          {visible.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', padding: '40px 0' }}>
              Žádné produkty neodpovídají dotazu. Zkus uvolnit filtry.
            </p>
          ) : (
            <ul className="results" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visible.map((p) => (
                <Row key={p.id} product={p} />
              ))}
            </ul>
          )}
          {visible.length < results.length && (
            <button
              type="button"
              className="btn"
              style={{ marginTop: 24 }}
              onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
            >
              Načíst dalších {Math.min(PAGE_SIZE, results.length - visible.length)} produktů
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  filters,
  onUpdate,
  onToggle,
}: {
  filters: Filters;
  onUpdate: (f: Filters) => void;
  onToggle: (key: 'stores' | 'categories', value: string) => void;
}): React.ReactElement {
  return (
    <aside style={{ position: 'sticky', top: 80, fontSize: 14 }}>
      <div className="meta" style={{ marginBottom: 8 }}>ŘETĚZCE</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
        {(Object.keys(STORE_LABELS) as Store[]).map((s) => (
          <li key={s} style={{ padding: '4px 0' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.stores.has(s)}
                onChange={() => onToggle('stores', s)}
              />
              {STORE_LABELS[s]}
            </label>
          </li>
        ))}
      </ul>

      <div className="meta" style={{ marginBottom: 8 }}>KATEGORIE</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
        {CANONICAL_CATEGORIES.map((c) => (
          <li key={c.id} style={{ padding: '4px 0' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.categories.has(c.id)}
                onChange={() => onToggle('categories', c.id)}
              />
              {c.label}
            </label>
          </li>
        ))}
      </ul>

      <div className="meta" style={{ marginBottom: 8 }}>OSTATNÍ</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={filters.bioOnly}
          onChange={(e) => onUpdate({ ...filters, bioOnly: e.target.checked })}
        />
        Pouze bio
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={filters.showUnavailable}
          onChange={(e) => onUpdate({ ...filters, showUnavailable: e.target.checked })}
        />
        Včetně nedostupných
      </label>
    </aside>
  );
}

function SortBar({
  sort,
  onChange,
  count,
}: {
  sort: SortKey;
  onChange: (s: SortKey) => void;
  count: number;
}): React.ReactElement {
  const options: Array<{ value: SortKey; label: string }> = [
    { value: 'unit-asc', label: 'Nejlevnější za jednotku' },
    { value: 'unit-desc', label: 'Nejdražší za jednotku' },
    { value: 'price-asc', label: 'Nejlevnější celkem' },
    { value: 'price-desc', label: 'Nejdražší celkem' },
    { value: 'name', label: 'Abecedně' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        borderTop: '2px solid var(--ink)',
        borderBottom: '1px solid var(--rule)',
        padding: '12px 0',
        marginBottom: 0,
      }}
    >
      <div className="meta">{count.toLocaleString('cs')} výsledků</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="meta">SEŘADIT</label>
        <select
          value={sort}
          onChange={(e) => onChange(e.target.value as SortKey)}
          style={{ height: 32, border: '1px solid var(--rule-2)', background: 'var(--bg)', padding: '0 8px' }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Row({ product }: { product: Product }): React.ReactElement {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr auto auto',
        alignItems: 'baseline',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <span className="meta">{product.storeName}</span>
      <span>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ borderBottom: '1px solid transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = 'currentColor')}
          onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
        >
          {product.name}
        </a>
        {!product.available && (
          <span className="meta" style={{ marginLeft: 8, color: 'var(--up)' }}>NEDOSTUPNÉ</span>
        )}
      </span>
      <span className="num" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
        {product.unitPrice != null && product.unitPriceLabel
          ? `${fmtCZK(product.unitPrice)} / ${product.unitPriceLabel}`
          : ''}
      </span>
      <span className="num display" style={{ fontSize: 18 }}>
        {fmtCZK(product.price)}
      </span>
    </li>
  );
}

function filtersFromRoute(route: Route): Filters {
  const p = route.params;
  return {
    q: p.get('q') ?? '',
    stores: new Set(((p.get('chains') ?? '').split(',').filter(Boolean)) as Store[]),
    categories: new Set((p.get('cats') ?? '').split(',').filter(Boolean)),
    bioOnly: p.get('bio') === '1',
    minQty: p.get('minQty') ? Number(p.get('minQty')) : undefined,
    showUnavailable: p.get('all') === '1',
    sort: ((p.get('sort') as SortKey | null) ?? 'unit-asc'),
  };
}

function filtersToParams(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.stores.size > 0) out.chains = [...f.stores].join(',');
  if (f.categories.size > 0) out.cats = [...f.categories].join(',');
  if (f.bioOnly) out.bio = '1';
  if (typeof f.minQty === 'number') out.minQty = String(f.minQty);
  if (f.showUnavailable) out.all = '1';
  if (f.sort !== 'unit-asc') out.sort = f.sort;
  return out;
}
