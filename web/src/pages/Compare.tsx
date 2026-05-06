import { fmtCZK } from '../lib/format.ts';
import type { Dataset, Product } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
  groupId: string;
}

export function Compare({ dataset, groupId }: Props): React.ReactElement {
  const group = dataset.groups.find((g) => g.id === groupId);
  if (!group) {
    return (
      <div className="container" style={{ padding: '64px 28px', textAlign: 'center' }}>
        <div className="meta" style={{ color: 'var(--up)' }}>SKUPINA NENALEZENA</div>
        <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
          Match-skupina <span className="mono">{groupId}</span> neexistuje.{' '}
          <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>Zpět na vyhledávání</a>.
        </p>
      </div>
    );
  }

  const productById = new Map(dataset.products.map((p) => [p.id, p]));
  const members = group.productKeys
    .map((k) => productById.get(k))
    .filter((p): p is Product => Boolean(p))
    .sort((a, b) => a.price - b.price);

  if (members.length === 0) {
    return (
      <div className="container" style={{ padding: '64px 28px' }}>
        <p style={{ color: 'var(--ink-3)' }}>Skupina je prázdná.</p>
      </div>
    );
  }

  const cheapest = members[0]!;
  const priciest = members[members.length - 1]!;
  const spreadPct = ((priciest.price - cheapest.price) / cheapest.price) * 100;
  const otherGroups = dataset.groups
    .filter((g) => g.id !== group.id && g.productKeys.length >= 2 && g.productKeys.length <= 8)
    .slice(0, 6);

  return (
    <div className="container" style={{ padding: '32px 28px 56px' }}>
      <div className="meta" style={{ marginBottom: 8 }}>
        <a href="#/h" style={{ borderBottom: '1px solid currentColor' }}>← výsledky</a>
        {' · '}skupina <span className="mono">{group.id}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          <div className="meta">SROVNÁNÍ ŘETĚZCŮ</div>
          <h1
            className="display"
            style={{ fontSize: 32, lineHeight: 1.15, margin: '4px 0 8px' }}
          >
            {cheapest.name}
          </h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink-3)', fontSize: 14, flexWrap: 'wrap' }}>
            {cheapest.unit && cheapest.quantity != null && (
              <span>{cheapest.quantity} {cheapest.unit}</span>
            )}
            {cheapest.ean && (
              <>
                <span>·</span>
                <span>EAN <span className="mono">{cheapest.ean}</span></span>
              </>
            )}
            <span>·</span>
            <span>{members.length} řetězců</span>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat label="ROZDÍL" value={`${spreadPct.toFixed(1)} %`} accent />
            <Stat label="NEJLEVNĚJI" value={fmtCZK(cheapest.price, 1)} sub={cheapest.storeName} />
            <Stat label="NEJDRAŽEJI" value={fmtCZK(priciest.price, 1)} sub={priciest.storeName} />
          </div>

          <ChainGrid members={members} cheapest={cheapest} />

          <div style={{ marginTop: 32 }}>
            <SectionHead title="Tabulka" meta="ŘAZENO PODLE CENY" />
            <table className="data" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <th style={th}>#</th>
                  <th style={th}>Řetězec</th>
                  <th style={th}>Cena</th>
                  <th style={th}>CZK / jednotka</th>
                  <th style={th}>vs. nejlevnější</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {members.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      background: i === 0 ? 'var(--accent-soft)' : undefined,
                    }}
                  >
                    <td className="mono" style={{ ...td, color: 'var(--ink-3)' }}>{i + 1}</td>
                    <td style={td}>{p.storeName}</td>
                    <td className="num mono" style={{ ...td, fontWeight: 500 }}>{fmtCZK(p.price)}</td>
                    <td className="num" style={{ ...td, color: 'var(--ink-3)', fontSize: 12 }}>
                      {p.unitPrice != null && p.unitPriceLabel
                        ? `${fmtCZK(p.unitPrice)} / ${p.unitPriceLabel}`
                        : '—'}
                    </td>
                    <td className="mono" style={{ ...td, color: i === 0 ? 'var(--accent)' : 'var(--ink-3)', fontSize: 12 }}>
                      {i === 0 ? '—' : `+${(((p.price / cheapest.price) - 1) * 100).toFixed(1)} %`}
                    </td>
                    <td style={td}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, borderBottom: '1px solid currentColor' }}>
                        otevřít →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <div style={{ border: '1px solid var(--rule-2)', padding: 16, background: 'var(--bg)' }}>
            <div className="meta">SDÍLET</div>
            <input
              readOnly
              className="mono"
              value={`${window.location.origin}/#/c/${group.id}`}
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
            <hr className="rule" style={{ margin: '16px 0' }} />
            <div className="meta">DALŠÍ SKUPINY</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {otherGroups.map((g) => {
                const seed = productById.get(g.productKeys[0] ?? '');
                const seedPrices = g.productKeys
                  .map((k) => productById.get(k)?.price)
                  .filter((p): p is number => typeof p === 'number');
                const sp = seedPrices.length >= 2
                  ? ((Math.max(...seedPrices) / Math.min(...seedPrices)) - 1) * 100
                  : 0;
                return (
                  <li key={g.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                    <a
                      href={`#/c/${g.id}`}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}
                    >
                      <span style={{ flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {seed?.name ?? g.id}
                      </span>
                      <span className="mono" style={{ color: 'var(--ink-3)' }}>+{sp.toFixed(0)} %</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-3)' }}>
            Match-skupiny jsou tvořeny bucketem (kategorie + jednotka + množství) a Jaccard
            shodou tokenů názvu ≥ 0,4. Algoritmus se postupně zpřísňuje — některé skupiny mohou
            obsahovat falešné shody, zejména u vína a velkých kategorií.
          </p>
        </aside>
      </div>
    </div>
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

function ChainGrid({ members, cheapest }: { members: Product[]; cheapest: Product }): React.ReactElement {
  const cols = Math.min(members.length, 4);
  return (
    <div
      style={{
        marginTop: 24,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12,
      }}
    >
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
              <span
                className="meta"
                style={{ color: 'var(--accent)', borderTop: '1px solid var(--accent)', paddingTop: 8 }}
              >
                NEJLEVNĚJŠÍ
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                +{overpay.toFixed(1)} %
              </span>
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
  );
}

function SectionHead({ title, meta }: { title: string; meta: string }): React.ReactElement {
  return (
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
      <h2 className="display" style={{ fontSize: 20, margin: 0 }}>{title}</h2>
      <span className="meta">{meta}</span>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px 10px 0',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 500,
};

const td: React.CSSProperties = {
  padding: '10px 12px 10px 0',
  verticalAlign: 'top',
};
