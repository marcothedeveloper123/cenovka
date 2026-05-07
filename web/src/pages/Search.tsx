import { useEffect, useMemo, useState } from 'react';
import { fmtCZK } from '../lib/format.ts';
import { navigate, type Route } from '../lib/route.ts';
import {
  brandKey,
  CANONICAL_CATEGORIES,
  filterProducts,
  searchAndDedup,
  STORE_LABELS,
  type Filters,
  type ResultEntry,
  type SortKey,
} from '../lib/search.ts';
import { useCart, useFavorites } from '../lib/storage.ts';
import type { Dataset, Store } from '../lib/types.ts';

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

  const results = useMemo(
    () => searchAndDedup(dataset.products, dataset.groups, filters),
    [dataset.products, dataset.groups, filters],
  );
  const visible = useMemo(() => results.slice(0, pageLimit), [results, pageLimit]);

  // Faceted counts. Each facet excludes its own filter so the user sees
  // "how many results if I added this." Categories: filter by everything
  // except categories. Chains: filter by everything except chains.
  const categoryCounts = useMemo(() => {
    const filtered = filterProducts(dataset.products, { ...filters, categories: new Set() });
    const m = new Map<string, number>();
    for (const p of filtered) if (p.categoryCanonical) m.set(p.categoryCanonical, (m.get(p.categoryCanonical) ?? 0) + 1);
    return m;
  }, [dataset.products, filters]);

  const chainCounts = useMemo(() => {
    const filtered = filterProducts(dataset.products, { ...filters, stores: new Set() });
    const m = new Map<Store, number>();
    for (const p of filtered) m.set(p.store, (m.get(p.store) ?? 0) + 1);
    return m;
  }, [dataset.products, filters]);

  // Brand counts (excluding the brand filter itself). Pick a display label
  // per folded key — usually the most common spelling across the result set.
  const brandFacet = useMemo(() => {
    const filtered = filterProducts(dataset.products, { ...filters, brands: new Set() });
    const counts = new Map<string, number>();
    const labelVotes = new Map<string, Map<string, number>>();
    for (const p of filtered) {
      if (!p.brand) continue;
      const key = brandKey(p.brand);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      let votes = labelVotes.get(key);
      if (!votes) labelVotes.set(key, (votes = new Map()));
      votes.set(p.brand, (votes.get(p.brand) ?? 0) + 1);
    }
    const labels = new Map<string, string>();
    for (const [key, votes] of labelVotes) {
      const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      labels.set(key, winner);
    }
    return { counts, labels };
  }, [dataset.products, filters]);

  const update = (next: Filters) => {
    setFilters(next);
    setPageLimit(PAGE_SIZE);
    navigate('/h', filtersToParams(next));
  };

  const toggle = (key: 'stores' | 'categories' | 'brands', value: string) => {
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
        {results.length.toLocaleString('cs')} unikátních produktů z {dataset.products.length.toLocaleString('cs')} celkem
      </p>

      {/* min-height keeps the grid taller than the viewport even when filters
          shrink the result list to a few rows — otherwise the page collapses,
          window scroll clamps to 0, and the sidebar (sticky top:80) jumps up,
          taking the brand the user just clicked out of view. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 32,
          alignItems: 'start',
          minHeight: 'calc(100vh - 200px)',
        }}
      >
        <Sidebar
          filters={filters}
          chainCounts={chainCounts}
          categoryCounts={categoryCounts}
          brandCounts={brandFacet.counts}
          brandLabels={brandFacet.labels}
          onUpdate={update}
          onToggle={toggle}
        />
        <div>
          <SortBar sort={filters.sort} onChange={(sort) => update({ ...filters, sort })} count={results.length} />
          {visible.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', padding: '40px 0' }}>
              Žádné produkty neodpovídají dotazu. Zkus uvolnit filtry.
            </p>
          ) : (
            <ResultsList entries={visible} />
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

const BRANDS_INITIAL = 12;

function Sidebar({
  filters,
  chainCounts,
  categoryCounts,
  brandCounts,
  brandLabels,
  onUpdate,
  onToggle,
}: {
  filters: Filters;
  chainCounts: Map<Store, number>;
  categoryCounts: Map<string, number>;
  brandCounts: Map<string, number>;
  brandLabels: Map<string, string>;
  onUpdate: (f: Filters) => void;
  onToggle: (key: 'stores' | 'categories' | 'brands', value: string) => void;
}): React.ReactElement {
  const [showAllBrands, setShowAllBrands] = useState(false);

  // Show only chains/categories that have at least one match in the current
  // result set (excluding their own filter). Sort by count desc.
  const visibleChains = (Object.keys(STORE_LABELS) as Store[])
    .filter((s) => filters.stores.has(s) || (chainCounts.get(s) ?? 0) > 0)
    .sort((a, b) => (chainCounts.get(b) ?? 0) - (chainCounts.get(a) ?? 0));
  const visibleCategories = CANONICAL_CATEGORIES.filter(
    (c) => filters.categories.has(c.id) || (categoryCounts.get(c.id) ?? 0) > 0,
  ).sort((a, b) => (categoryCounts.get(b.id) ?? 0) - (categoryCounts.get(a.id) ?? 0));

  const allBrandKeys = [...brandCounts.entries()]
    .filter(([k]) => k.length > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  // Always include selected brands so the user can untick them.
  const selected = new Set(filters.brands);
  const visibleBrandKeys = (showAllBrands ? allBrandKeys : allBrandKeys.slice(0, BRANDS_INITIAL))
    .concat(allBrandKeys.filter((k) => selected.has(k) && !showAllBrands && allBrandKeys.indexOf(k) >= BRANDS_INITIAL));
  const showBrandsSection = allBrandKeys.length > 1;

  return (
    <aside
      style={{
        position: 'sticky',
        top: 80,
        fontSize: 14,
        // Keep the sidebar scrollable when long brand lists overflow.
        // 80px header + 16px breathing room.
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
        // Subtle right padding so the inline scrollbar doesn't crowd content.
        paddingRight: 4,
      }}
    >
      {visibleChains.length > 0 && (
        <>
          <div className="meta" style={{ marginBottom: 8 }}>ŘETĚZCE</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
            {visibleChains.map((s) => (
              <FacetRow
                key={s}
                label={STORE_LABELS[s]}
                count={chainCounts.get(s) ?? 0}
                checked={filters.stores.has(s)}
                onToggle={() => onToggle('stores', s)}
              />
            ))}
          </ul>
        </>
      )}

      {visibleCategories.length > 0 && (
        <>
          <div className="meta" style={{ marginBottom: 8 }}>KATEGORIE</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
            {visibleCategories.map((c) => (
              <FacetRow
                key={c.id}
                label={c.label}
                count={categoryCounts.get(c.id) ?? 0}
                checked={filters.categories.has(c.id)}
                onToggle={() => onToggle('categories', c.id)}
              />
            ))}
          </ul>
        </>
      )}

      {showBrandsSection && (
        <>
          <div className="meta" style={{ marginBottom: 8 }}>ZNAČKY</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
            {visibleBrandKeys.map((k) => (
              <FacetRow
                key={k}
                label={brandLabels.get(k) ?? k}
                count={brandCounts.get(k) ?? 0}
                checked={filters.brands.has(k)}
                onToggle={() => onToggle('brands', k)}
              />
            ))}
          </ul>
          {allBrandKeys.length > BRANDS_INITIAL && (
            <button
              type="button"
              onClick={() => setShowAllBrands((v) => !v)}
              className="meta"
              style={{
                marginBottom: 24,
                color: 'var(--ink-3)',
                borderBottom: '1px dotted var(--ink-4)',
                cursor: 'pointer',
              }}
            >
              {showAllBrands
                ? `↑ ZOBRAZIT MÉNĚ`
                : `↓ ZOBRAZIT VŠECH ${allBrandKeys.length}`}
            </button>
          )}
        </>
      )}

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

function FacetRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <li style={{ padding: '4px 0' }}>
      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          cursor: 'pointer',
          opacity: count === 0 && !checked ? 0.4 : 1,
        }}
      >
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span style={{ flex: 1 }}>{label}</span>
        <span className="num" style={{ color: 'var(--ink-3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {count.toLocaleString('cs')}
        </span>
      </label>
    </li>
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
    { value: 'relevance', label: 'Relevance' },
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

function ResultsList({ entries }: { entries: ResultEntry[] }): React.ReactElement {
  const cart = useCart();
  const favs = useFavorites();
  return (
    <ul className="results" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {entries.map((entry) => {
        const key = entry.rep.groupId ?? entry.rep.id;
        return (
          <Row
            key={entry.rep.id}
            entry={entry}
            inCart={(cart.items[key] ?? 0) > 0}
            isStarred={favs.has(key)}
            onAddToCart={() => cart.add(key)}
            onToggleStar={() => favs.toggle(key)}
          />
        );
      })}
    </ul>
  );
}

function Row({
  entry,
  inCart,
  isStarred,
  onAddToCart,
  onToggleStar,
}: {
  entry: ResultEntry;
  inCart: boolean;
  isStarred: boolean;
  onAddToCart: () => void;
  onToggleStar: () => void;
}): React.ReactElement {
  const { rep, alternates, totalGroupSize } = entry;
  const hasAlternates = alternates.length > 0;
  // "Broad" group: this row is one chain's representative inside a big match
  // group. No alternates here, but the Porovnat link still works.
  const isBroadGroupRow = !hasAlternates && rep.groupId != null && totalGroupSize > 1;
  const priciest = hasAlternates ? alternates[alternates.length - 1]! : rep;
  const overpayPct = hasAlternates ? ((priciest.price / rep.price) - 1) * 100 : 0;
  const savedKc = hasAlternates ? priciest.price - rep.price : 0;
  return (
    <li style={{ padding: '16px 0', borderBottom: '1px solid var(--rule)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <button
            type="button"
            onClick={onToggleStar}
            aria-label={isStarred ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
            title={isStarred ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
            style={{
              color: isStarred ? 'var(--accent)' : 'var(--ink-4)',
              fontSize: 16,
              padding: '0 6px 0 0',
              lineHeight: 1,
            }}
          >
            {isStarred ? '★' : '☆'}
          </button>
          <a
            href={`#/p/${rep.id}`}
            style={{ fontSize: 15, fontWeight: 500, borderBottom: '1px solid transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = 'currentColor')}
            onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
          >
            {rep.name}
          </a>
          <a
            href={rep.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 8, color: 'var(--ink-4)', fontSize: 13 }}
            title={`Otevřít v ${rep.storeName}`}
          >
            ↗
          </a>
          {!rep.available && (
            <span className="meta" style={{ marginLeft: 8, color: 'var(--up)' }}>NEDOSTUPNÉ</span>
          )}
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              gap: 12,
              fontSize: 13,
              color: 'var(--ink-3)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: hasAlternates ? 'var(--accent)' : 'var(--ink-2)' }}>
              {hasAlternates ? '★ ' : ''}
              <strong>{rep.storeName}</strong>
            </span>
            {rep.unitPrice != null && rep.unitPriceLabel && (
              <span className="num">
                {fmtCZK(rep.unitPrice)} / {rep.unitPriceLabel}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="num display" style={{ fontSize: 22, lineHeight: 1.2 }}>
            {fmtCZK(rep.price)}
          </div>
          {hasAlternates && (
            <div className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              až {fmtCZK(priciest.price)} jinde
            </div>
          )}
          <button
            type="button"
            onClick={onAddToCart}
            className="btn"
            style={{
              height: 28,
              padding: '0 10px',
              fontSize: 12,
              borderColor: inCart ? 'var(--accent)' : 'var(--rule-2)',
              color: inCart ? 'var(--accent)' : 'var(--ink-2)',
            }}
            title={inCart ? 'Přidáno (klik = +1)' : 'Do košíku'}
          >
            {inCart ? '✓ V košíku' : '+ Do košíku'}
          </button>
        </div>
      </div>

      {hasAlternates && rep.groupId ? (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <a
            href={`#/c/${rep.groupId}`}
            className="btn"
            style={{
              height: 36,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
              background: 'var(--accent-soft)',
            }}
          >
            Porovnat {alternates.length + 1} řetězců →
          </a>
          {overpayPct >= 5 && (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              ušetři až <strong className="num" style={{ color: 'var(--accent)' }}>{fmtCZK(savedKc, 0)}</strong>
              {' '}({overpayPct.toFixed(0)} %)
            </span>
          )}
          <span style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
            {alternates.slice(0, 4).map((alt) => (
              <span key={alt.id} className="num">
                {alt.storeName} <strong>{fmtCZK(alt.price, 0)}</strong>
              </span>
            ))}
            {alternates.length > 4 && (
              <span style={{ color: 'var(--ink-4)' }}>+{alternates.length - 4}</span>
            )}
          </span>
        </div>
      ) : isBroadGroupRow ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a
            href={`#/c/${rep.groupId}`}
            className="btn"
            style={{
              height: 32,
              padding: '0 12px',
              fontSize: 12,
              fontWeight: 500,
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
              background: 'var(--accent-soft)',
            }}
          >
            Porovnat všech {totalGroupSize} balení →
          </a>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            široký match — různé varianty produktu
          </span>
        </div>
      ) : rep.categoryCanonical && rep.unit && rep.quantity != null ? (
        <div style={{ marginTop: 8 }}>
          <a
            href={`#/c/p:${encodeURIComponent(rep.id)}?scope=bucket`}
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              borderBottom: '1px dotted var(--ink-4)',
            }}
          >
            Porovnat s podobnými {rep.quantity} {rep.unit} v kategorii →
          </a>
        </div>
      ) : null}
    </li>
  );
}

function filtersFromRoute(route: Route): Filters {
  const p = route.params;
  const q = p.get('q') ?? '';
  // Default sort: 'relevance' when there's a query (so search ranks by match
  // quality), 'unit-asc' otherwise (browsing by best ¢/unit).
  const defaultSort: SortKey = q ? 'relevance' : 'unit-asc';
  return {
    q,
    stores: new Set(((p.get('chains') ?? '').split(',').filter(Boolean)) as Store[]),
    categories: new Set((p.get('cats') ?? '').split(',').filter(Boolean)),
    brands: new Set((p.get('brands') ?? '').split(',').filter(Boolean)),
    bioOnly: p.get('bio') === '1',
    minQty: p.get('minQty') ? Number(p.get('minQty')) : undefined,
    showUnavailable: p.get('all') === '1',
    sort: ((p.get('sort') as SortKey | null) ?? defaultSort),
  };
}

function filtersToParams(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.stores.size > 0) out.chains = [...f.stores].join(',');
  if (f.categories.size > 0) out.cats = [...f.categories].join(',');
  if (f.brands.size > 0) out.brands = [...f.brands].join(',');
  if (f.bioOnly) out.bio = '1';
  if (typeof f.minQty === 'number') out.minQty = String(f.minQty);
  if (f.showUnavailable) out.all = '1';
  const defaultSort: SortKey = f.q ? 'relevance' : 'unit-asc';
  if (f.sort !== defaultSort) out.sort = f.sort;
  return out;
}
