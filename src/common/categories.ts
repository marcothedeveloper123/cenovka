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
  { id: 'kava-caj', keywords: ['kava', 'caj'] },
  { id: 'alkohol', keywords: ['lihovin', 'destilat', 'pivo', 'vino', 'sekt', 'sumive', 'sumiva', 'whisky', 'whiskey', 'rum', 'gin', 'vodka', 'tequila', 'liker', 'absinth', 'cidr', 'cider', 'brandy', 'koniak', 'aperitiv', 'becherovka', 'fernet', 'becher', 'alkohol'] },
  { id: 'mlecne', keywords: ['mlecne', 'mleko', 'jogurt', 'syr', 'tvaroh', 'maslo'] },
  { id: 'maso', keywords: ['maso', 'uzeniny', 'lahudk', 'ryby'] },
  { id: 'pecivo', keywords: ['pecivo', 'pekarn', 'chleb'] },
  { id: 'ovoce-zelenina', keywords: ['ovoce', 'zelenina'] },
  { id: 'napoje', keywords: ['napoj', 'limonad', 'dzus', 'voda', 'minerali'] },
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
  // Globus has a single combined "napoje-alkoholicke-a-nealkoholicke" bucket
  // — alcohol AND mineral water + non-alc beer mixed. The breadcrumb alone
  // can't tell them apart, so default the whole batch to napoje (safer than
  // wrongly tagging Evian as alkohol). Real classification would need to
  // walk the product name, which we don't do here.
  if (folded.includes('alkoholicke') && folded.includes('nealkoholicke')) {
    return 'napoje';
  }
  // Walk every segment (folded full path) and pick the first taxonomy hit.
  // pickRoot used to look at one segment only — Tesco "Nápoje > Pivo >
  // Lahvové" matched napoje and never reached alkohol.
  for (const def of TAXONOMY) {
    if (def.keywords.some((kw) => folded.includes(kw))) return def.id;
  }
  return undefined;
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
