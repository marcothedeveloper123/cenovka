/** Lowercase, diacritic-fold, squash punctuation. "Budvar Nealko, pivo 0,5l"
 *  → "budvar nealko pivo 0 5l". Used for dedupe/equality keys. */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Czech retail container/packaging words. Stripped before computing dedupe
// keys so a bottle and a can of the same product collapse together.
const CONTAINER_TOKENS = new Set([
  'lahev', 'lahvi', 'lahve', 'flase', 'flaska', 'flasky',
  'plech', 'plechovka', 'plechovky', 'plechovek',
  'sklo', 'sklenena', 'skleneny', 'skleny',
  'pet', 'petka', 'petky',
  'karton', 'kartony',
  'tetrapak', 'tetra',
  'sacek', 'sacku', 'vrecko',
  'box', 'krabice',
  'doza', 'kelimek',
]);

/** Drop container/packaging tokens from a folded name so "lahev" / "plech"
 *  variants of the same product collide. */
export function stripContainer(folded: string): string {
  return folded
    .split(' ')
    .filter((tok) => !CONTAINER_TOKENS.has(tok))
    .join(' ');
}
