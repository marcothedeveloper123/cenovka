import { useMemo } from 'react';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
  productId: string; // "store::id"
}

export function ProductDetail({ dataset, productId }: Props): React.ReactElement {
  const productById = useMemo(() => new Map(dataset.products.map((p) => [p.id, p])), [dataset.products]);
  const product = productById.get(productId);

  if (!product) {
    return (
      <div className="container" style={{ padding: '64px 28px', textAlign: 'center' }}>
        <div className="meta" style={{ color: 'var(--up)' }}>PRODUKT NENALEZEN</div>
        <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
          <span className="mono">{productId}</span> není v aktuálním datasetu.{' '}
          <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>Zpět na vyhledávání</a>.
        </p>
      </div>
    );
  }

  const sameProduct = useMemo(() => sameProductMembers(dataset, product), [dataset, product]);
  const samePackaging = useMemo(() => samePackagingMembers(dataset, product, sameProduct), [dataset, product, sameProduct]);
  const sameBrand = useMemo(() => sameBrandMembers(dataset, product), [dataset, product]);
  const cheaperInCategory = useMemo(() => cheaperInCategoryMembers(dataset, product), [dataset, product]);

  const cheapest = sameProduct.length > 0 ? sameProduct[0]! : product;
  const overpayPct = product.price > cheapest.price ? ((product.price / cheapest.price) - 1) * 100 : 0;

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta" style={{ marginBottom: 8 }}>
        <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>← výsledky</a>
        {' · '}{product.storeName} <span className="mono">{product.id}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          <div className="meta">{categoryLabel(product.categoryCanonical) ?? 'PRODUKT'}</div>
          <h1 className="display" style={{ fontSize: 34, lineHeight: 1.15, margin: '4px 0 12px' }}>
            {product.name}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 14, color: 'var(--ink-3)', marginBottom: 24 }}>
            {product.brand && <span><strong style={{ color: 'var(--ink-2)' }}>{product.brand}</strong></span>}
            {product.unit && product.quantity != null && <><span>·</span><span>{product.quantity} {product.unit}</span></>}
            {product.ean && <><span>·</span><span>EAN <span className="mono">{product.ean}</span></span></>}
            {!product.available && <><span>·</span><span style={{ color: 'var(--up)' }}>NEDOSTUPNÉ</span></>}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 32,
              padding: '20px 0',
              borderTop: '2px solid var(--ink)',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <div>
              <div className="meta">CENA NA {product.storeName.toUpperCase()}</div>
              <div className="num display" style={{ fontSize: 48, lineHeight: 1, marginTop: 4 }}>
                {fmtCZK(product.price)}
              </div>
              {product.unitPrice != null && product.unitPriceLabel && (
                <div className="num" style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                  {fmtCZK(product.unitPrice)} / {product.unitPriceLabel}
                </div>
              )}
            </div>
            {sameProduct.length >= 1 && cheapest.id !== product.id && (
              <div>
                <div className="meta" style={{ color: 'var(--accent)' }}>NEJLEVNĚJŠÍ JINDE</div>
                <div className="num display" style={{ fontSize: 26, color: 'var(--accent)', marginTop: 4 }}>
                  {fmtCZK(cheapest.price)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  {cheapest.storeName} · ušetříš {fmtCZK(product.price - cheapest.price, 0)} ({overpayPct.toFixed(0)} %)
                </div>
              </div>
            )}
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ marginLeft: 'auto', height: 44, padding: '0 18px', fontSize: 14 }}
            >
              Otevřít v {product.storeName} ↗
            </a>
          </div>

          {sameProduct.length >= 1 && (
            <Section title={`Stejný produkt v ${sameProduct.length + 1} řetězcích`} more={product.groupId ? `#/c/${product.groupId}` : undefined}>
              <RelatedList products={[product, ...sameProduct].sort((a, b) => a.price - b.price)} highlightId={product.id} />
            </Section>
          )}
          {samePackaging.length > 0 && (
            <Section
              title={`Stejné balení (${product.quantity} ${product.unit}) — ${samePackaging.length}`}
              more={`#/c/p:${encodeURIComponent(product.id)}?scope=bucket`}
            >
              <RelatedList products={samePackaging.slice(0, 8)} highlightId={product.id} />
            </Section>
          )}
          {sameBrand.length > 0 && product.brand && (
            <Section title={`Více od ${product.brand} — ${sameBrand.length}`} more={`#/h?q=${encodeURIComponent(product.brand)}`}>
              <RelatedList products={sameBrand.slice(0, 8)} highlightId={product.id} />
            </Section>
          )}
          {cheaperInCategory.length > 0 && (
            <Section
              title={`Levněji za jednotku v kategorii — ${cheaperInCategory.length}`}
              more={`#/c/p:${encodeURIComponent(product.id)}?scope=category`}
            >
              <RelatedList products={cheaperInCategory.slice(0, 8)} highlightId={product.id} />
            </Section>
          )}
        </div>

        <aside>
          <div style={{ border: '1px solid var(--rule-2)', padding: 16, background: 'var(--bg)' }}>
            <div className="meta">SDÍLET</div>
            <input
              readOnly
              className="mono"
              value={`${window.location.origin}/#/p/${product.id}`}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%',
                marginTop: 8,
                height: 32,
                padding: '0 8px',
                border: '1px solid var(--rule-2)',
                fontSize: 12,
                background: 'var(--bg-2)',
              }}
            />
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-3)' }}>
            Cena se může lišit od ceny v aplikaci nebo prodejně — data jsou stažena jednou denně z webu řetězce.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  more,
  children,
}: {
  title: string;
  more?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginTop: 32 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderTop: '2px solid var(--ink)',
          padding: '12px 0 8px',
          marginBottom: 8,
        }}
      >
        <h2 className="display" style={{ fontSize: 18, margin: 0 }}>{title}</h2>
        {more && <a href={more} className="meta" style={{ borderBottom: '1px solid currentColor' }}>VŠE →</a>}
      </div>
      {children}
    </section>
  );
}

function RelatedList({ products, highlightId }: { products: Product[]; highlightId: string }): React.ReactElement {
  if (products.length === 0) return <p style={{ color: 'var(--ink-3)' }}>—</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {products.map((p) => {
        const active = p.id === highlightId;
        return (
          <li
            key={p.id}
            style={{
              padding: '10px 12px',
              margin: '0 -12px',
              borderBottom: '1px solid var(--rule)',
              background: active ? 'var(--accent-soft)' : undefined,
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 16,
              alignItems: 'baseline',
            }}
          >
            <div>
              {active ? (
                <span style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</span>
              ) : (
                <a href={`#/p/${p.id}`} style={{ fontWeight: 500, fontSize: 14, borderBottom: '1px solid transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = 'currentColor')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                >
                  {p.name}
                </a>
              )}
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                <strong>{p.storeName}</strong>
                {p.unit && p.quantity != null && <> · {p.quantity} {p.unit}</>}
                {p.brand && <> · {p.brand}</>}
              </div>
            </div>
            <span className="num display" style={{ fontSize: 16 }}>{fmtCZK(p.price)}</span>
            <span className="num" style={{ color: 'var(--ink-3)', fontSize: 12, minWidth: 100, textAlign: 'right' }}>
              {p.unitPrice != null && p.unitPriceLabel
                ? `${fmtCZK(p.unitPrice)} / ${p.unitPriceLabel}`
                : '—'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function sameProductMembers(dataset: Dataset, product: Product): Product[] {
  if (!product.groupId) return [];
  const productById = new Map(dataset.products.map((p) => [p.id, p]));
  const group = dataset.groups.find((g) => g.id === product.groupId);
  if (!group) return [];
  return group.productKeys
    .map((k) => productById.get(k))
    .filter((p): p is Product => Boolean(p) && p!.id !== product.id)
    .sort((a, b) => a.price - b.price);
}

function samePackagingMembers(dataset: Dataset, product: Product, sameProduct: Product[]): Product[] {
  if (!product.categoryCanonical || !product.unit || product.quantity == null) return [];
  const exclude = new Set([product.id, ...sameProduct.map((p) => p.id)]);
  return dataset.products
    .filter(
      (p) =>
        p.available &&
        !exclude.has(p.id) &&
        p.categoryCanonical === product.categoryCanonical &&
        p.unit === product.unit &&
        p.quantity === product.quantity,
    )
    .sort((a, b) => a.price - b.price);
}

function sameBrandMembers(dataset: Dataset, product: Product): Product[] {
  if (!product.brand) return [];
  const folded = product.brand.toLowerCase();
  return dataset.products
    .filter(
      (p) =>
        p.available &&
        p.id !== product.id &&
        p.brand?.toLowerCase() === folded,
    )
    .sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
}

function cheaperInCategoryMembers(dataset: Dataset, product: Product): Product[] {
  if (!product.categoryCanonical || product.unitPrice == null) return [];
  return dataset.products
    .filter(
      (p) =>
        p.available &&
        p.id !== product.id &&
        p.categoryCanonical === product.categoryCanonical &&
        p.unitPriceLabel === product.unitPriceLabel &&
        p.unitPrice != null &&
        p.unitPrice < product.unitPrice!,
    )
    .sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
}

function categoryLabel(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const labels: Record<string, string> = {
    mlecne: 'MLÉČNÉ',
    maso: 'MASO A UZENINY',
    pecivo: 'PEČIVO',
    'ovoce-zelenina': 'OVOCE A ZELENINA',
    mrazene: 'MRAŽENÉ',
    trvanlive: 'TRVANLIVÉ',
    napoje: 'NÁPOJE',
    alkohol: 'ALKOHOL',
    'kava-caj': 'KÁVA A ČAJ',
    sladke: 'SLADKÉ',
    slane: 'SLANÉ POCHUTINY',
    dite: 'DÍTĚ',
    drogerie: 'DROGERIE',
    domov: 'DOMOV',
    pet: 'MAZLÍČCI',
  };
  return labels[c] ?? c.toUpperCase();
}
