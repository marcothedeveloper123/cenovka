import { csuUnitPrice } from '../lib/data.ts';
import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product } from '../lib/types.ts';

interface Props {
  product: Product;
  dataset: Dataset;
}

/**
 * Third cell in the product price band: the ČSÚ national average for the item
 * this product is listed under, beside this product's own unit price. Two facts
 * side by side — deliberately no percentage, because our catalogue skews premium
 * and a derived "X % above average" would read as a verdict it cannot support.
 */
export function CsuCell({ product, dataset }: Props): React.ReactElement | null {
  if (!product.csu || !dataset.reference) return null;
  const item = dataset.reference.items.find((i) => i.code === product.csu);
  if (!item) return null;
  const ref = csuUnitPrice(item);
  if (ref.unitPrice == null || !ref.unitPriceLabel) return null;

  return (
    <div>
      <div className="meta" style={{ whiteSpace: 'nowrap' }}>PRŮMĚR ČR · ČSÚ</div>
      <div className="num display" style={{ fontSize: 26, marginTop: 4, whiteSpace: 'nowrap' }}>
        {fmtCZK(ref.unitPrice)} <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>/ {ref.unitPriceLabel}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {item.name}
        {product.unitPrice != null && product.unitPriceLabel === ref.unitPriceLabel && (
          <> · tento produkt {fmtCZK(product.unitPrice)} / {product.unitPriceLabel}</>
        )}
        {' · '}
        <a href={`#/r/${item.code}`} style={{ borderBottom: '1px solid currentColor' }}>
          všechny produkty →
        </a>
      </div>
    </div>
  );
}
