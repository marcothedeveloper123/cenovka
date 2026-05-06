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
