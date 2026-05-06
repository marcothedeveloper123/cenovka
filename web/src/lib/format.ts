/** Czech CZK formatter. Single decimal by default; integer when whole. */
export function fmtCZK(n: number | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = n.toFixed(dec).replace('.', ',');
  return `${v} Kč`;
}

const CZ_MONTHS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

export function fmtDate(d: Date): string {
  return `${d.getDate()}. ${CZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtPercent(n: number, sign = false): string {
  const v = (n * 100).toFixed(1).replace('.', ',');
  if (!sign) return `${v}%`;
  return n >= 0 ? `+${v}%` : `${v}%`;
}

/** Czech-aware diacritic-insensitive normalization for search. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Significant tokens for name-similarity ranking: lowercased, diacritic-folded,
 *  ≥3 chars, no Czech stopwords or generic packaging/qty words. */
const STOPWORDS = new Set([
  'a', 'i', 'o', 's', 'k', 'v', 'z', 'na', 'do', 'po', 'pro',
  'bio', 'eko', 'ml', 'kg', 'ks', 'kus',
  'cerstve', 'utrzeno', 'vanicka', 'sacek', 'sacku', 'kus', 'kusy',
  'balena', 'balenie', 'ks',
]);

export function nameTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(s).split(/[\s,()/.-]+/)) {
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // pure numbers (qty)
    if (/^\d/.test(w)) continue; // alphanumeric qty like "500g"
    out.add(w);
  }
  return out;
}

export function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}
