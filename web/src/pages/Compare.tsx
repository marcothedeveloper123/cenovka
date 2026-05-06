import { useMemo } from 'react';
import { fmtCZK, nameTokens, sharedTokenCount } from '../lib/format.ts';
import { navigate } from '../lib/route.ts';
import type { Dataset, MatchGroup, Product } from '../lib/types.ts';

type Scope = 'group' | 'bucket' | 'category';

interface Props {
  dataset: Dataset;
  /** Either a groupId, or "p:storeId" to compare a singleton by bucket. */
  groupId: string;
  scope: Scope;
}

export function Compare({ dataset, groupId, scope }: Props): React.ReactElement {
  const productById = useMemo(() => new Map(dataset.products.map((p) => [p.id, p])), [dataset.products]);

  const productKey = groupId.startsWith('p:') ? groupId.slice(2) : null;
  const fromProduct = productKey ? productById.get(productKey) ?? null : null;
  const group = !productKey ? dataset.groups.find((g) => g.id === groupId) : null;
  const effectiveScope: Scope = productKey ? (scope === 'group' ? 'bucket' : scope) : scope;

  if (!group && !fromProduct) {
    return (
      <div className="container" style={{ padding: '64px 28px', textAlign: 'center' }}>
        <div className="meta" style={{ color: 'var(--up)' }}>NENALEZENO</div>
        <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
          <span className="mono">{groupId}</span> neexistuje.{' '}
          <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>Zpět na vyhledávání</a>.
        </p>
      </div>
    );
  }

  const groupMembers = useMemo<Product[]>(() => {
    if (!group) return [];
    return group.productKeys
      .map((k) => productById.get(k))
      .filter((p): p is Product => Boolean(p))
      .sort((a, b) => a.price - b.price);
  }, [group, productById]);

  const rep = groupMembers[0] ?? fromProduct;
  if (!rep) {
    return <div className="container" style={{ padding: 64 }}>Žádná data.</div>;
  }

  const counts = useMemo(() => computeScopeCounts(dataset.products, rep), [dataset.products, rep]);

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta" style={{ marginBottom: 8 }}>
        <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>← výsledky</a>
        {group ? <> {' · '}skupina <span className="mono">{group.id}</span></> : null}
      </div>

      <div className="meta">SROVNÁNÍ</div>
      <h1 className="display" style={{ fontSize: 32, lineHeight: 1.15, margin: '4px 0 8px' }}>
        {rep.name}
      </h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink-3)', fontSize: 14, flexWrap: 'wrap' }}>
        {rep.unit && rep.quantity != null && (
          <span>{rep.quantity} {rep.unit}</span>
        )}
        {rep.brand && (
          <>
            <span>·</span>
            <span>{rep.brand}</span>
          </>
        )}
        {rep.ean && (
          <>
            <span>·</span>
            <span>EAN <span className="mono">{rep.ean}</span></span>
          </>
        )}
      </div>

      <ScopeTabs
        scope={effectiveScope}
        urlKey={group ? group.id : `p:${rep.id}`}
        counts={counts}
        hasGroup={Boolean(group && groupMembers.length >= 2)}
        hasBucket={Boolean(rep.categoryCanonical && rep.unit && rep.quantity != null)}
      />

      {effectiveScope === 'group' && group && <GroupView members={groupMembers} />}
      {effectiveScope === 'bucket' && (
        <BucketView dataset={dataset} rep={rep} groupId={group?.id ?? ''} />
      )}
      {effectiveScope === 'category' && (
        <CategoryView dataset={dataset} rep={rep} groupId={group?.id ?? ''} />
      )}
    </div>
  );
}

function ScopeTabs({
  scope,
  urlKey,
  counts,
  hasGroup,
  hasBucket,
}: {
  scope: Scope;
  urlKey: string;
  counts: { group: number; bucket: number; category: number };
  hasGroup: boolean;
  hasBucket: boolean;
}): React.ReactElement {
  const tabs: Array<{ id: Scope; label: string; sub: string; count: number; disabled?: boolean }> = [
    { id: 'group', label: 'Stejný produkt', sub: 'shoda názvu + značky', count: counts.group, disabled: !hasGroup },
    { id: 'bucket', label: 'Stejné balení', sub: 'stejná kategorie + velikost', count: counts.bucket, disabled: !hasBucket },
    { id: 'category', label: 'Stejná kategorie', sub: 'libovolná značka i velikost', count: counts.category },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        margin: '32px 0 24px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {tabs.map((t) => {
        const active = scope === t.id;
        const handler = (e: React.MouseEvent) => {
          if (t.disabled) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          navigate(`/c/${urlKey}`, t.id === 'group' ? {} : { scope: t.id });
        };
        return (
          <a
            key={t.id}
            href="#"
            onClick={handler}
            style={{
              padding: '12px 16px 10px',
              marginBottom: -1,
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              color: t.disabled ? 'var(--ink-4)' : active ? 'var(--ink)' : 'var(--ink-2)',
              opacity: t.disabled ? 0.5 : 1,
              cursor: t.disabled ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 200,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {t.label}
              <span className="num" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{t.count}</span>
            </span>
            <span className="meta" style={{ fontSize: 10 }}>{t.sub}</span>
          </a>
        );
      })}
    </div>
  );
}

function GroupView({ members }: { members: Product[] }): React.ReactElement {
  const cheapest = members[0]!;
  const priciest = members[members.length - 1]!;
  const spreadPct = ((priciest.price - cheapest.price) / cheapest.price) * 100;
  const cols = Math.min(members.length, 4);

  return (
    <>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
        <Stat label="ŘETĚZCŮ" value={String(members.length)} />
        <Stat label="ROZDÍL" value={`${spreadPct.toFixed(1)} %`} accent />
        <Stat label="NEJLEVNĚJI" value={fmtCZK(cheapest.price, 1)} sub={cheapest.storeName} />
        <Stat label="NEJDRAŽEJI" value={fmtCZK(priciest.price, 1)} sub={priciest.storeName} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
        {members.map((p, i) => {
          const isCheapest = i === 0;
          const overpay = isCheapest ? 0 : ((p.price / cheapest.price) - 1) * 100;
          return (
            <div
              key={p.id}
              style={{
                border: isCheapest ? '2px solid var(--accent)' : '1px solid var(--rule-2)',
                padding: 14,
                background: isCheapest ? 'var(--accent-soft)' : 'var(--bg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div className="meta">{p.storeName}</div>
              <div className="num display" style={{ fontSize: 26, letterSpacing: '-0.01em' }}>
                {fmtCZK(p.price)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {p.unitPrice != null && p.unitPriceLabel
                  ? `${fmtCZK(p.unitPrice)} / ${p.unitPriceLabel}`
                  : '—'}
              </div>
              {isCheapest ? (
                <span className="meta" style={{ color: 'var(--accent)', borderTop: '1px solid var(--accent)', paddingTop: 8 }}>
                  NEJLEVNĚJŠÍ
                </span>
              ) : (
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>+{overpay.toFixed(1)} %</span>
              )}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ height: 30, justifyContent: 'center', marginTop: 4, fontSize: 13 }}
              >
                Otevřít
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BucketView({
  dataset,
  rep,
  groupId,
}: {
  dataset: Dataset;
  rep: Product;
  groupId: string;
}): React.ReactElement {
  if (!rep.categoryCanonical || !rep.unit || rep.quantity == null) {
    return (
      <p style={{ color: 'var(--ink-3)' }}>
        Tento produkt nemá dostatek metadat (kategorie + velikost) pro porovnání balení.
      </p>
    );
  }
  const repTokens = nameTokens(rep.name);
  const candidates = dedupeListings(
    dataset.products.filter(
      (p) =>
        p.available &&
        p.categoryCanonical === rep.categoryCanonical &&
        p.unit === rep.unit &&
        p.quantity === rep.quantity,
    ),
  );
  const ranked = candidates
    .map((p) => ({ p, shared: sharedTokenCount(repTokens, nameTokens(p.name)) }))
    .sort((a, b) => b.shared - a.shared || a.p.price - b.p.price);

  const similar = ranked.filter((r) => r.shared >= 1).map((r) => r.p);
  const rest = ranked.filter((r) => r.shared === 0).map((r) => r.p);

  return (
    <RankedList
      similar={similar}
      rest={rest}
      dataset={dataset}
      highlightGroup={groupId}
      sortLabel="PODOBNÉ NÁZVU + CENA"
    />
  );
}

function CategoryView({
  dataset,
  rep,
  groupId,
}: {
  dataset: Dataset;
  rep: Product;
  groupId: string;
}): React.ReactElement {
  if (!rep.categoryCanonical) {
    return <p style={{ color: 'var(--ink-3)' }}>Tento produkt nemá kanonickou kategorii.</p>;
  }
  const repTokens = nameTokens(rep.name);
  const candidates = dedupeListings(
    dataset.products.filter(
      (p) => p.available && p.categoryCanonical === rep.categoryCanonical && p.unitPrice != null,
    ),
  );
  const ranked = candidates
    .map((p) => ({ p, shared: sharedTokenCount(repTokens, nameTokens(p.name)) }))
    .sort((a, b) => b.shared - a.shared || (a.p.unitPrice ?? Infinity) - (b.p.unitPrice ?? Infinity));

  const similar = ranked.filter((r) => r.shared >= 1).slice(0, 200).map((r) => r.p);
  const rest = ranked.filter((r) => r.shared === 0).slice(0, 200).map((r) => r.p);

  return (
    <RankedList
      similar={similar}
      rest={rest}
      dataset={dataset}
      highlightGroup={groupId}
      sortLabel="PODOBNÉ NÁZVU + CZK ZA JEDNOTKU"
    />
  );
}

function RankedList({
  similar,
  rest,
  dataset,
  highlightGroup,
  sortLabel,
}: {
  similar: Product[];
  rest: Product[];
  dataset: Dataset;
  highlightGroup: string;
  sortLabel: string;
}): React.ReactElement {
  return (
    <>
      <p className="meta" style={{ marginBottom: 8 }}>
        ŘAZENO PODLE {sortLabel} · {similar.length} PODOBNÝCH
        {rest.length > 0 && ` · +${rest.length} OSTATNÍCH V BALENÍ`}
      </p>
      {similar.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--rule)' }}>
          {similar.map((p) => (
            <ProductRow key={p.id} p={p} dataset={dataset} highlightGroup={highlightGroup} />
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--ink-3)' }}>Žádné jasně podobné produkty.</p>
      )}
      {rest.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary
            className="meta"
            style={{ cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}
          >
            ZOBRAZIT VŠECHNY OSTATNÍ ({rest.length})
          </summary>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rest.map((p) => (
              <ProductRow key={p.id} p={p} dataset={dataset} highlightGroup={highlightGroup} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ProductRow({
  p,
  dataset,
  highlightGroup,
}: {
  p: Product;
  dataset: Dataset;
  highlightGroup: string;
}): React.ReactElement {
  const groupSizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of dataset.groups) m.set(g.id, g.productKeys.length);
    return m;
  }, [dataset.groups]);
  const isHighlight = p.groupId === highlightGroup;
  const groupSize = p.groupId ? groupSizes.get(p.groupId) ?? 1 : 1;
  return (
    <li
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--rule)',
        background: isHighlight ? 'var(--accent-soft)' : undefined,
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 16,
        alignItems: 'baseline',
      }}
    >
      <div>
        <a href={`#/p/${p.id}`} style={{ fontSize: 14, fontWeight: 500 }}>
          {p.name}
        </a>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          <strong>{p.storeName}</strong>
          {p.brand && p.brand !== p.storeName && <> · {p.brand}</>}
          {p.unit && p.quantity != null && <> · {p.quantity} {p.unit}</>}
          {groupSize > 1 && p.groupId && (
            <>
              {' '}·{' '}
              <a href={`#/c/${p.groupId}`} style={{ color: 'var(--accent)', borderBottom: '1px dotted var(--accent)' }}>
                +{groupSize - 1} dalších
              </a>
            </>
          )}
        </div>
      </div>
      <span className="num display" style={{ fontSize: 18 }}>
        {fmtCZK(p.price)}
      </span>
      <span className="num" style={{ color: 'var(--ink-3)', fontSize: 13, minWidth: 110, textAlign: 'right' }}>
        {p.unitPrice != null && p.unitPriceLabel
          ? `${fmtCZK(p.unitPrice)} / ${p.unitPriceLabel}`
          : '—'}
      </span>
      <span style={{ minWidth: 24, textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>
        {isHighlight ? '★' : ''}
      </span>
    </li>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }): React.ReactElement {
  return (
    <div>
      <div className="meta">{label}</div>
      <div className="num display" style={{ fontSize: 28, color: accent ? 'var(--accent)' : 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div>}
    </div>
  );
}

function computeScopeCounts(products: readonly Product[], rep: Product): { group: number; bucket: number; category: number } {
  let group = 0;
  let bucket = 0;
  let category = 0;
  for (const p of products) {
    if (!p.available) continue;
    if (p.groupId && p.groupId === rep.groupId) group += 1;
    if (
      rep.categoryCanonical &&
      rep.unit &&
      rep.quantity != null &&
      p.categoryCanonical === rep.categoryCanonical &&
      p.unit === rep.unit &&
      p.quantity === rep.quantity
    ) {
      bucket += 1;
    }
    if (rep.categoryCanonical && p.categoryCanonical === rep.categoryCanonical) category += 1;
  }
  return { group, bucket, category };
}

// Match group import for type help (used implicitly via Dataset.groups).
type _UnusedMatchGroup = MatchGroup;

/**
 * Collapse two kinds of duplicate listings:
 *   1) Cross-chain: products in the same `groupId` → keep cheapest member.
 *   2) Within-chain: same store + same name + same quantity (different SKU
 *      IDs that point at effectively the same listing) → keep cheapest.
 *
 * Sort by price asc first so "cheapest wins" falls out for free.
 */
function dedupeListings(products: readonly Product[]): Product[] {
  const sorted = [...products].sort((a, b) => a.price - b.price);
  const seenGroup = new Set<string>();
  const seenChainKey = new Set<string>();
  const out: Product[] = [];
  for (const p of sorted) {
    if (p.groupId) {
      if (seenGroup.has(p.groupId)) continue;
      seenGroup.add(p.groupId);
    } else {
      // Within-chain dedupe key: store + folded name + qty/unit.
      const key = `${p.store}|${foldName(p.name)}|${p.quantity ?? ''}|${p.unit ?? ''}`;
      if (seenChainKey.has(key)) continue;
      seenChainKey.add(key);
    }
    out.push(p);
  }
  return out;
}

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
