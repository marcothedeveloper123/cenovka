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
const TAXONOMY: CanonicalDef[] = [
  { id: 'mlecne', keywords: ['mlecne', 'mleko', 'jogurt', 'syr', 'tvaroh', 'maslo'] },
  { id: 'maso', keywords: ['maso', 'uzeniny', 'lahudk', 'ryby'] },
  { id: 'pecivo', keywords: ['pecivo', 'pekarn', 'chleb'] },
  { id: 'ovoce-zelenina', keywords: ['ovoce', 'zelenina'] },
  { id: 'mrazene', keywords: ['mrazene', 'mrazena', 'plant based', 'plant-based'] },
  { id: 'kava-caj', keywords: ['kava', 'caj'] },
  { id: 'alkohol', keywords: ['alkohol', 'lihovin', 'pivo', 'vino'] },
  { id: 'napoje', keywords: ['napoj', 'limonad', 'dzus', 'voda'] },
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
  store: Store,
): CanonicalCategory | undefined {
  if (!raw) return undefined;
  const root = pickRoot(raw, store);
  if (!root) return undefined;
  const folded = fold(root);
  for (const def of TAXONOMY) {
    if (def.keywords.some((kw) => folded.includes(kw))) return def.id;
  }
  return undefined;
}

/** Some chains nest leaf-first (Rohlík), others root-first (Tesco, Košík). */
function pickRoot(raw: string, store: Store): string | undefined {
  const segments = raw.split(' > ').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return undefined;
  if (store === 'rohlik') return segments[segments.length - 1];
  return segments[0];
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
