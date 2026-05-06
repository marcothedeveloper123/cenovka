import type { Unit } from './types.ts';

const PIECE_WORDS = ['ks', 'kus', 'kusů', 'kusu', 'kapsle', 'kapslí', 'tablet', 'tablety', 'sáček', 'sáčků', 'sáčku'];
// Trailing lookahead instead of `\b` because Czech non-ASCII letters (í, ů, č…)
// don't count as JS regex word characters and break boundary matching.
const PIECE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${PIECE_WORDS.join('|')})(?=\\s|$|[,.;)])`, 'i');

const UNIT_MAP: Array<[RegExp, Unit, number]> = [
  [/(\d+(?:[.,]\d+)?)\s*kg\b/i, 'g', 1000],
  [/(\d+(?:[.,]\d+)?)\s*dag\b/i, 'g', 10],
  [/(\d+(?:[.,]\d+)?)\s*g\b/i, 'g', 1],
  [/(\d+(?:[.,]\d+)?)\s*l\b/i, 'ml', 1000],
  [/(\d+(?:[.,]\d+)?)\s*dl\b/i, 'ml', 100],
  [/(\d+(?:[.,]\d+)?)\s*ml\b/i, 'ml', 1],
  [/(\d+(?:[.,]\d+)?)\s*cm\b/i, 'cm', 1],
  [/(\d+(?:[.,]\d+)?)\s*m\b/i, 'm', 1],
  [PIECE_RE, 'ks', 1],
];

export interface ParsedQuantity {
  unit: Unit;
  quantity: number;
}

export type { Unit };

/** Best-effort extraction of `(quantity, unit)` from a product name string. */
export function parseQuantity(text: string): ParsedQuantity | undefined {
  for (const [re, unit, factor] of UNIT_MAP) {
    const m = re.exec(text);
    if (m) {
      const raw = m[1]!.replace(',', '.');
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        return { unit, quantity: n * factor };
      }
    }
  }
  return undefined;
}
