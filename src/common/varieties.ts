/**
 * Hard-coded variety axes for Czech retail. Two products that pick different
 * tokens from the same axis are different SKUs even if their names overlap
 * heavily — the bucket-frequency weighted-Jaccard rule misses these because
 * common variants like "brut" or "jablko" sit at ~30-40% of a category bucket
 * and weight just below the dynamic threshold.
 *
 * Tokens here are stored in their normalised form (lowercase, no diacritics,
 * matching `normalise()` from search-core).
 */

export interface VarietyAxis {
  /** Short label for diagnostics. */
  name: string;
  /** Tokens that belong to this axis. Membership is exclusive. */
  tokens: ReadonlySet<string>;
}

export const VARIETY_AXES: readonly VarietyAxis[] = [
  // Wine / sekt sweetness
  { name: 'sweetness', tokens: new Set(['brut', 'demi', 'sec', 'sladke', 'polosuche', 'suche', 'polosladke']) },
  // Liquid colour
  { name: 'colour', tokens: new Set(['svetly', 'svetle', 'tmavy', 'tmave', 'rose', 'ruzove', 'bily', 'bile', 'cervene', 'cerveny']) },
  // Alcoholic vs not
  { name: 'alcohol', tokens: new Set(['nealko', 'nealkoholicky', 'nealkoholicke', 'free', 'bezalkoholicky']) },
  // Brand-tier variants
  { name: 'tier', tokens: new Set(['original', 'classic', 'reserve', 'prestige', 'select', 'premium', 'gold', 'silver', 'limited']) },
  // Flavour (broad, generic; covers juice / yogurt / energy drinks).
  // Includes both Czech and English forms — energy drinks are usually marked
  // in English even on Czech retail sites.
  { name: 'flavour', tokens: new Set([
    // Czech
    'jablko', 'jablkovy', 'jablkove', 'pomeranc', 'pomerancovy', 'banan', 'bananovy',
    'jahoda', 'jahodovy', 'borovka', 'borovkovy', 'malina', 'malinovy',
    'visen', 'visnovy', 'mango', 'broskev', 'broskvovy',
    'ananas', 'maracuja', 'citron', 'citronovy', 'multivitamin',
    'meruna', 'merunkovy', 'vanilka', 'vanilkovy', 'cokolada', 'cokoladovy',
    'natural', 'naturalni', 'kakaovy', 'kakao', 'oriskovy', 'oriskove',
    'mentol', 'mata', 'matovy', 'kava', 'kavovy',
    'grapefruit', 'meloun', 'melounove', 'bezinka',
    // English
    'raspberry', 'strawberry', 'watermelon', 'peach', 'cactus', 'dragon',
    'passion', 'lemon', 'lime', 'orange', 'apple', 'cherry', 'blueberry',
    'blackberry', 'pineapple', 'mojito', 'cola', 'tropical', 'exotic',
    'coconut', 'mint', 'coffee', 'caramel', 'salted', 'speed',
    'fiesta', 'wild',
  ]) },
  // Sugar / energy: zero/sugar/free split sugar-free from regular drinks.
  { name: 'sugar', tokens: new Set(['zero', 'sugar', 'lite', 'light']) },
  // Beer style
  { name: 'beer-style', tokens: new Set(['lezak', 'vycepni', 'ipa', 'pils', 'pilsner', 'porter', 'pseno', 'weizen', 'lager']) },
  // Cigarette / coffee strength
  { name: 'strength', tokens: new Set(['kratky', 'jemny', 'silny', 'extra']) },
];

/** A token to (axis, member) lookup, derived from VARIETY_AXES. */
const TOKEN_AXIS = new Map<string, { axis: string; token: string }>();
for (const axis of VARIETY_AXES) {
  for (const t of axis.tokens) TOKEN_AXIS.set(t, { axis: axis.name, token: t });
}

/** Variety tokens present in a product's token set, grouped by axis.
 *  Multiple tokens from the same axis collapse to a single set per axis. */
export function varietyTokensOf(productTokens: ReadonlySet<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const t of productTokens) {
    const hit = TOKEN_AXIS.get(t);
    if (!hit) continue;
    let set = out.get(hit.axis);
    if (!set) out.set(hit.axis, (set = new Set()));
    set.add(hit.token);
  }
  return out;
}

/**
 * True when `a` and `b` pick DIFFERENT tokens on the same axis.
 * Returning true means: these are different SKUs and the matcher should
 * reject the pair / cluster merge.
 */
export function varietyConflict(
  a: Map<string, Set<string>>,
  b: Map<string, Set<string>>,
): boolean {
  for (const [axis, ta] of a) {
    const tb = b.get(axis);
    if (!tb) continue;
    // Conflict iff there's a token in `a` not in `b`, OR vice versa.
    for (const t of ta) if (!tb.has(t)) return true;
    for (const t of tb) if (!ta.has(t)) return true;
  }
  return false;
}

/** Multipack hint: "8x", "6 x", "4×0,5l" etc. Returns the pack count or 1. */
const MULTIPACK_RE = /\b(\d+)\s*[x×]\s*\d/i;
export function multipackHint(name: string): number {
  const m = MULTIPACK_RE.exec(name);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 2 && n <= 24 ? n : 1;
}
