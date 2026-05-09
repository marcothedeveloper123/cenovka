import type { Store } from './types.ts';

export type CanonicalCategory =
  | 'mlecne'
  | 'maso'
  | 'pecivo'
  | 'ovoce-zelenina'
  | 'mrazene'
  | 'trvanlive'
  | 'napoje'
  | 'alkohol'
  | 'kava-caj'
  | 'sladke'
  | 'slane'
  | 'dite'
  | 'drogerie'
  | 'domov'
  | 'pet'
  | 'ostatni';

interface CanonicalDef {
  id: CanonicalCategory;
  /** keyword fragments to match against the chain's root category (lowercased, diacritic-folded) */
  keywords: string[];
}

// Keywords are stored pre-folded (lowercase, no diacritics) — they match against the folded input.
// Order matters: more-specific categories first. "Nápoje > Pivo > Lahvové"
// must hit alkohol (pivo) before napoje (napoj). Same for kava-caj.
const TAXONOMY: CanonicalDef[] = [
  // Frozen first — "Mražená zelenina" should be mrazene, not ovoce-zelenina.
  { id: 'mrazene', keywords: ['mrazene', 'mrazena', 'plant based', 'plant-based'] },
  // napoje BEFORE alkohol so non-alc keywords (limonad, energy, nealko, dzus,
  // voda, minerali) win when they coexist with alcohol-flavour names
  // (e.g. Rohlík "Hroznové víno > Limonády" or Tesco "Nealkoholické pivo").
  // Note: 'napoj' (umbrella token) is intentionally NOT here — it matches
  // every "Nápoje > …" path including alcohol.
  { id: 'napoje', keywords: ['limonad', 'dzus', 'voda', 'minerali', 'nealko', 'energy', 'cidr', 'cider', 'ledov'] },
  { id: 'kava-caj', keywords: ['kava', 'caj'] },
  { id: 'alkohol', keywords: ['lihovin', 'destilat', 'pivo', 'vino', 'sekt', 'sumive', 'sumiva', 'whisky', 'whiskey', 'rum', 'gin', 'vodka', 'tequila', 'liker', 'absinth', 'brandy', 'koniak', 'aperitiv', 'becherovka', 'fernet', 'becher', 'alkohol'] },
  { id: 'mlecne', keywords: ['mlecne', 'mleko', 'jogurt', 'syr', 'tvaroh', 'maslo'] },
  { id: 'maso', keywords: ['maso', 'uzeniny', 'lahudk', 'ryby'] },
  { id: 'pecivo', keywords: ['pecivo', 'pekarn', 'chleb'] },
  { id: 'ovoce-zelenina', keywords: ['ovoce', 'zelenina'] },
  { id: 'sladke', keywords: ['sladk', 'cokolad', 'cukrovinky', 'susenk'] },
  { id: 'slane', keywords: ['slane', 'chips', 'orisk', 'snack'] },
  { id: 'dite', keywords: ['dite', 'deti', 'kojen'] },
  { id: 'drogerie', keywords: ['drogerie', 'kosmetika', 'hygien'] },
  { id: 'pet', keywords: ['mazlic', 'krmiv', 'pejsk', 'kock'] },
  { id: 'domov', keywords: ['domov', 'domacnost', 'zabava', 'dum'] },
  { id: 'trvanlive', keywords: ['trvanl', 'konzerv', 'koreni'] },
];

/** Map a chain's category string to one canonical id, or undefined. */
export function classifyCategory(
  raw: string | undefined,
  _store: Store,
): CanonicalCategory | undefined {
  if (!raw) return undefined;
  const folded = fold(raw);
  // Globus combined "napoje-alkoholicke-a-nealkoholicke" mixes Becherovka
  // with Evian — default to napoje rather than misclassify mineral water
  // as alkohol. Real split would need to walk product names.
  if (folded.includes('alkoholicke') && folded.includes('nealkoholicke')) {
    return 'napoje';
  }
  // Word-tokenise once: split on any non-letter/digit run, drop empties.
  // We need word-boundary matching because raw substring is far too loose
  // — short Czech alc keywords (gin, rum, vino) match inside common Czech
  // words like 'original', 'potravinove', etc.
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);
  for (const def of TAXONOMY) {
    if (matchesAny(tokens, def.keywords)) return def.id;
  }
  return undefined;
}

/**
 * A keyword matches when it equals a token, OR is a prefix of a token
 * (so 'sumive' matches 'sumivave', 'pivo' matches 'piva'/'pivovar', etc.).
 * Prefix avoids needing to enumerate every Czech declension while still
 * preventing 'gin' from matching inside 'original'.
 */
function matchesAny(tokens: readonly string[], keywords: readonly string[]): boolean {
  for (const kw of keywords) {
    for (const t of tokens) {
      if (t === kw || t.startsWith(kw)) return true;
    }
  }
  return false;
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
