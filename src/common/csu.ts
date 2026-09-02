import { parseQuantity } from './quantity.ts';
import type { MonthlyPrice, ReferenceItem } from './types.ts';

/**
 * Parsing for the Czech Statistical Office's average-consumer-price series,
 * served as JSON-stat 2.0 from data.csu.gov.cz.
 *
 * The series is split across two "named selections" with unrelated code
 * schemes, so everything here joins on the human-readable label instead. See
 * `normalizeLabel` for why that is safe and `mergeSeries` for the join.
 */

/** Minimal shape of the JSON-stat 2.0 documents ČSÚ returns. */
export interface JsonStatDoc {
  id: string[];
  size: number[];
  value: Array<number | null> | Record<string, number | null>;
  dimension: Record<
    string,
    {
      label?: string;
      category: {
        index: Record<string, number>;
        label?: Record<string, string>;
      };
    }
  >;
}

/** The item dimension is whichever one ČSÚ named `CENREP*` in this vintage. */
function findItemDimension(doc: JsonStatDoc): string {
  const found = doc.id.find((d) => d.startsWith('CENREP') || d.startsWith('REPRCEN'));
  if (!found) throw new Error(`no CENREP* dimension in [${doc.id.join(', ')}]`);
  return found;
}

function findTimeDimension(doc: JsonStatDoc): string {
  const found = doc.id.find((d) => d.toLowerCase().startsWith('cas'));
  if (!found) throw new Error(`no Cas* dimension in [${doc.id.join(', ')}]`);
  return found;
}

/**
 * One entry per ČSÚ item, months newest-first.
 *
 * The `value` array is row-major over `size`, and the dimension order differs
 * between vintages (CEN0101D is item-major, CEN0101N is not), so the flat index
 * is computed from `id`/`size` rather than assumed.
 */
export function parseJsonStat(doc: JsonStatDoc): Map<string, { code: string; label: string; history: MonthlyPrice[] }> {
  const itemDim = findItemDimension(doc);
  const timeDim = findTimeDimension(doc);
  const pos = new Map(doc.id.map((d, i) => [d, i]));

  const items = doc.dimension[itemDim]!.category;
  const times = doc.dimension[timeDim]!.category;
  const itemLabels = items.label ?? {};

  const months = Object.keys(times.index).sort(); // ascending; reversed at the end
  const out = new Map<string, { code: string; label: string; history: MonthlyPrice[] }>();

  for (const code of Object.keys(items.index)) {
    const history: MonthlyPrice[] = [];
    for (const month of months) {
      const coord = new Array(doc.id.length).fill(0);
      coord[pos.get(itemDim)!] = items.index[code]!;
      coord[pos.get(timeDim)!] = times.index[month]!;
      let flat = 0;
      for (let d = 0; d < coord.length; d++) flat = flat * doc.size[d]! + coord[d]!;
      const raw = Array.isArray(doc.value) ? doc.value[flat] : doc.value[String(flat)];
      // ČSÚ leaves seasonal items (carp outside December) null; skip rather
      // than interpolate — a gap is information, a made-up price is not.
      if (typeof raw === 'number') history.push({ month, price: raw });
    }
    const label = itemLabels[code] ?? code;
    out.set(normalizeLabel(label), { code, label, history: history.reverse() });
  }
  return out;
}

/**
 * Join key across ČSÚ vintages.
 *
 * 83 of the 86 items have byte-identical labels between the pre-2026 and
 * from-2026 selections. The other three differ only cosmetically —
 * `Vepřová pečeně [1kg]` vs `[1 kg]`, `(Tuzemák)` vs `(tuzemák)`, and a
 * trailing ` - od 2015` validity suffix — so folding case, whitespace and that
 * suffix joins all 86. Codes cannot be used: the two schemes are unrelated and
 * deriving one from the other succeeds for only 12 of 83.
 *
 * Whitespace is removed outright rather than collapsed: the `[1kg]` / `[1 kg]`
 * pair differs by an *absent* space, which collapsing cannot fix.
 */
export function normalizeLabel(label: string): string {
  return label
    .replace(/\s+-\s+(?:od|do)\s+\d{4}/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export interface ParsedLabel {
  name: string;
  packaging: string;
  unit?: ReferenceItem['unit'];
  quantity?: number;
}

/**
 * Split `"Máslo [1 kg]"` into its name and packaging, normalising the packaging
 * to the project's base units via `parseQuantity` (kg→g, l→ml, ks as-is).
 */
export function parseLabel(label: string): ParsedLabel {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(label);
  if (!m) return { name: label.trim(), packaging: '' };
  const name = m[1]!.trim();
  const packaging = m[2]!.trim();
  const qty = parseQuantity(packaging);
  return qty ? { name, packaging, unit: qty.unit, quantity: qty.quantity } : { name, packaging };
}

/** ČSÚ codes are COICOP-derived; the leading 5 digits are the class. */
export function coicopClass(code: string): string {
  return code.slice(0, 5);
}

/**
 * Merge the historical and current selections into one series per item.
 *
 * Throws when the two vintages disagree on which items exist. A ČSÚ rename
 * should surface as a failed run, not as a dataset that quietly shrinks.
 */
export function mergeSeries(
  older: ReturnType<typeof parseJsonStat>,
  newer: ReturnType<typeof parseJsonStat>,
): ReferenceItem[] {
  const missing = [...newer.keys()].filter((k) => !older.has(k));
  const dropped = [...older.keys()].filter((k) => !newer.has(k));
  if (missing.length || dropped.length) {
    throw new Error(
      `ČSÚ item sets diverged — ${missing.length} only in current ` +
        `(${missing.slice(0, 3).join('; ')}), ${dropped.length} only in historical ` +
        `(${dropped.slice(0, 3).join('; ')}). Labels likely changed; update normalizeLabel.`,
    );
  }

  const out: ReferenceItem[] = [];
  for (const [key, cur] of newer) {
    const prev = older.get(key)!;
    const byMonth = new Map<string, number>();
    // Older first, then current overwrites any overlapping month.
    for (const p of prev.history) byMonth.set(p.month, p.price);
    for (const p of cur.history) byMonth.set(p.month, p.price);
    const history = [...byMonth.entries()]
      .map(([month, price]) => ({ month, price }))
      .sort((a, b) => (a.month < b.month ? 1 : -1)); // newest first

    const parsed = parseLabel(cur.label);
    out.push({
      code: cur.code,
      label: cur.label,
      name: parsed.name,
      packaging: parsed.packaging,
      unit: parsed.unit,
      quantity: parsed.quantity,
      coicop: coicopClass(cur.code),
      history,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
