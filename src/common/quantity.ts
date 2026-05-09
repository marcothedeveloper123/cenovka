import type { Unit } from './types.ts';

const PIECE_WORDS = ['ks', 'kus', 'kusů', 'kusu', 'kapsle', 'kapslí', 'tablet', 'tablety', 'sáček', 'sáčků', 'sáčku'];
// Allow whitespace around the decimal separator: real Czech retail strings
// are sometimes formatted with a stray space ("Hennessy 0, 35l" → 0.35).
// Without this we'd parse only the right-hand digits and end up with 35 l.
const NUMBER = String.raw`\d+(?:\s*[.,]\s*\d+)?`;
// Trailing lookahead instead of `\b` because Czech non-ASCII letters (í, ů, č…)
// don't count as JS regex word characters and break boundary matching.
const PIECE_RE = new RegExp(`(${NUMBER})\\s*(?:${PIECE_WORDS.join('|')})(?=\\s|$|[,.;)])`, 'i');

const UNIT_MAP: Array<[RegExp, Unit, number]> = [
  [new RegExp(`(${NUMBER})\\s*kg\\b`, 'i'), 'g', 1000],
  [new RegExp(`(${NUMBER})\\s*dag\\b`, 'i'), 'g', 10],
  [new RegExp(`(${NUMBER})\\s*g\\b`, 'i'), 'g', 1],
  [new RegExp(`(${NUMBER})\\s*l\\b`, 'i'), 'ml', 1000],
  [new RegExp(`(${NUMBER})\\s*dl\\b`, 'i'), 'ml', 100],
  [new RegExp(`(${NUMBER})\\s*ml\\b`, 'i'), 'ml', 1],
  [new RegExp(`(${NUMBER})\\s*cm\\b`, 'i'), 'cm', 1],
  [new RegExp(`(${NUMBER})\\s*m\\b`, 'i'), 'm', 1],
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
      // Strip whitespace around the decimal separator before parsing.
      const raw = m[1]!.replace(/\s+/g, '').replace(',', '.');
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        return { unit, quantity: n * factor };
      }
    }
  }
  return undefined;
}
