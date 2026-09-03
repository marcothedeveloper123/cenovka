import { type CanonicalCategory, fold } from './categories.ts';
import type { Product, ReferenceItem, Unit } from './types.ts';

/**
 * Map scraped products onto Czech Statistical Office representative items.
 *
 * This is a *browse* join, not a price verdict: it answers "which products we
 * scraped belong under `Hovězí maso zadní bez kosti [1 kg]`", so a reader can
 * see the shelf prices beside the national average. A stray premium item in a
 * list is harmless; the same item folded into a "12% above average" badge would
 * be a lie. Nothing here computes such a badge.
 *
 * Three gates per item: unit must match, keywords must match, and the product's
 * unit price must sit inside a plausibility band around the ČSÚ price. The band
 * is not a quality filter — it drops quantity-parse errors (a beef fillet at
 * 699 900 Kč/kg because "1 g" was parsed) and wrong-product hits (baby purée
 * "s bramborami" under potatoes), which keyword rules alone cannot catch.
 */

export interface CsuMatcher {
  /** ČSÚ item code in the current (from-2026) scheme. */
  code: string;
  /** Optional canonical-category gate. */
  category?: CanonicalCategory;
  /** Product unit must equal this. */
  unit: Unit;
  /** Every keyword must match. */
  all?: string[];
  /** At least one must match, when present. */
  any?: string[];
  /** None may match. */
  none?: string[];
  /** Unit-price band as multiples of the ČSÚ unit price. */
  band?: [number, number];
}

const DEFAULT_BAND: [number, number] = [0.3, 5];

/** Folded word tokens, same splitting as `classifyCategory`. */
export function tokenize(name: string): string[] {
  return fold(name).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Exact token match by default; a trailing `*` means prefix. Prefix is opt-in
 * because it is too loose as a default: `maslo` must not match `maslova`
 * ("Rama máslová příchuť" is margarine), while `hovez*` should catch
 * `hovezi`, `hoveziho` and `hovezim`.
 */
export function matchKeyword(tokens: readonly string[], keyword: string): boolean {
  if (keyword.endsWith('*')) {
    const stem = keyword.slice(0, -1);
    return tokens.some((t) => t.startsWith(stem));
  }
  return tokens.includes(keyword);
}

export type MatchStage = 'no' | 'keywords' | 'band';

/**
 * How far a product gets through one matcher: `no`, `keywords` (name and unit
 * fit but the unit price is outside the band), or `band` (a full match). The
 * middle state exists for the audit, which lists what the band rejected.
 */
export function matchStage(
  product: Product,
  matcher: CsuMatcher,
  refUnitPrice: number | undefined,
): MatchStage {
  if (product.unit !== matcher.unit) return 'no';
  if (typeof product.quantity !== 'number' || product.quantity <= 0) return 'no';
  if (matcher.category && product.categoryCanonical !== matcher.category) return 'no';
  const tokens = tokenize(product.name);
  if (matcher.all && !matcher.all.every((k) => matchKeyword(tokens, k))) return 'no';
  if (matcher.any && !matcher.any.some((k) => matchKeyword(tokens, k))) return 'no';
  if (matcher.none && matcher.none.some((k) => matchKeyword(tokens, k))) return 'no';
  if (refUnitPrice === undefined) return 'keywords';
  const [lo, hi] = matcher.band ?? DEFAULT_BAND;
  const unitPrice = product.price / product.quantity;
  return unitPrice >= refUnitPrice * lo && unitPrice <= refUnitPrice * hi ? 'band' : 'keywords';
}

/** ČSÚ price per base unit (g / ml / ks), keyed by code. */
export function referenceUnitPrices(items: readonly ReferenceItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const latest = it.history[0];
    if (!latest || typeof it.quantity !== 'number' || it.quantity <= 0) continue;
    out.set(it.code, latest.price / it.quantity);
  }
  return out;
}

/** First full match in table order, which is the tie-break (most specific first). */
export function classifyCsu(product: Product, refUnitPrice: Map<string, number>): string | undefined {
  for (const m of CSU_MATCHERS) {
    if (matchStage(product, m, refUnitPrice.get(m.code)) === 'band') return m.code;
  }
  return undefined;
}

// Ready meals, pet food and sauces that reuse cut names. Shared by the meat rows.
const NOT_RAW_MEAT = [
  'omac*', 'knedl*', 'hotov*', 'ready', 'polevk*', 'vyvar*', 'gulas*', 'konzerv*', 'leco',
  'zele', 'susen*', 'granul*', 'kapsick*', 'psi', 'pes', 'kocic*', 'kocka', 'kocky', 'pizza',
  'bageta', 'panini', 'sendvic*', 'salat*', 'pomaz*', 'pasta', 'testovin*', 'paprice', 'kousk*',
];
// Plant "milks" and flavoured milk drinks.
const NOT_PLAIN_MILK = [
  'kokos*', 'mandl*', 'ovesn*', 'sojov*', 'ryzov*', 'kondenz*', 'susen*', 'kojen*',
  'napoj*', 'kakaov*', 'cokolad*', 'vanilk*', 'jahod*', 'banan*',
];

/**
 * First-pass table: items whose names are distinctive enough to match by keyword.
 * Order matters — a product is assigned to the first full match.
 *
 * Deliberately unmapped, because product names do not carry the distinction or
 * the probe found too few hits: the "s kostí / bez kosti" beef and pork variants
 * beyond the two below, `Vepřový bůček` (one hit), `Zakysané mléčné výrobky`, `Pečivo pšeničné bílé`,
 * duck, turkey, rabbit, fish, and everything under 0119 and 02 except beer.
 * Extend one row at a time, reading `npm run csu-audit` before and after.
 */
export const CSU_MATCHERS: readonly CsuMatcher[] = [
  // ---- maso ----
  {
    code: '01122101', // Hovězí maso zadní bez kosti [1 kg]
    category: 'maso', unit: 'g',
    all: ['hovez*'],
    any: ['zadni', 'kyta', 'rostenec', 'rostena', 'svickov*', 'kulat*', 'orech', 'vrchni', 'spodni', 'lozeni', 'steak*'],
    none: ['predni', 'krk*', 'plec*', 'klizk*', 'zebr*', 'mlet*', 'burger*', 'hamburger*', 'kostk*', 'nudl*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122102', // Hovězí maso přední bez kosti [1 kg]
    category: 'maso', unit: 'g',
    all: ['hovez*'],
    any: ['predni', 'plec', 'krk', 'klizk*'],
    none: ['zadni', 'kyta', 'rostenec', 'svickov*', 'zebr*', 'mlet*', 'burger*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122201', // Vepřová kýta bez kosti [1 kg]
    category: 'maso', unit: 'g',
    all: ['vepr*'], any: ['kyta', 'kyt*'],
    none: ['mlet*', 'uzen*', 'sunk*', 'salam*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122202', // Vepřová krkovice [1 kg]
    category: 'maso', unit: 'g',
    all: ['vepr*'], any: ['krkov*'],
    none: ['uzen*', 'mlet*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122401', // Kuřata kuchaná celá [1 kg]
    category: 'maso', unit: 'g',
    all: ['kur*'], any: ['cele', 'celeho', 'celych'],
    none: ['prs*', 'stehn*', 'kridl*', 'krk*', 'rizk*', 'mlet*', 'uzen*', 'grilov*', 'pecen*', 'salam*', 'park*', 'sunk*', 'kurkum*', 'kurz*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122402', // Kuřecí prsní řízky [1 kg]
    category: 'maso', unit: 'g',
    all: ['kur*'], any: ['prs*'],
    none: ['uzen*', 'grilov*', 'salam*', 'sunk*', 'mlet*', 'obalov*', 'smaz*', 'nugget*', 'strips*', 'marinov*', 'pecen*', 'varen*', 'ryze', 'ryzi', 'zelenin*', 'kurkum*', ...NOT_RAW_MEAT],
  },
  {
    code: '01122403', // Kuřecí stehna [1 kg]
    category: 'maso', unit: 'g',
    all: ['kur*'], any: ['stehn*', 'stehen*'],
    none: ['uzen*', 'grilov*', 'smaz*', 'kurkum*', ...NOT_RAW_MEAT],
  },
  {
    code: '01125001', // Párky [1 kg]
    unit: 'g',
    any: ['parky', 'parek', 'parku'],
    none: ['veget*', 'vegan*', 'sojov*', 'tofu', 'cock*', 'fazol*', ...NOT_RAW_MEAT],
  },
  {
    code: '01123003', // Šunka vepřová [1 kg]
    unit: 'g',
    // Exact 'sunka' only: the prefix form swallowed 'šunkou' (sauces), 'šunková'
    // (pâté, rolls) and a cat-food 'sýrovo-šunková kapsička'.
    all: ['sunka'],
    none: ['salam*', 'kurec*', 'krut*', 'drub*', 'pena', 'zavit*', 'chleb*', 'bagel*', 'toast*', 'sushi', 'susen*', 'prosciutto', 'parm*', 'serrano', 'pdo', 'sunkofl*', 'prichut*', 'popcorn', 'chips*', 'krekr*', ...NOT_RAW_MEAT],
  },

  // ---- mléko, sýry, vejce ----
  {
    code: '01142001', // Mléko polotučné pasterované [1 l]
    category: 'mlecne', unit: 'ml',
    all: ['mleko', 'polotucn*'],
    none: ['trvanliv*', 'uht', ...NOT_PLAIN_MILK],
  },
  {
    code: '01142002', // Mléko polotučné trvanlivé [1 l]
    category: 'mlecne', unit: 'ml',
    all: ['mleko', 'polotucn*'], any: ['trvanliv*', 'uht'],
    none: NOT_PLAIN_MILK,
  },
  {
    code: '01152001', // Máslo [1 kg]
    category: 'mlecne', unit: 'g',
    all: ['maslo'],
    none: ['prichut*', 'rostlin*', 'tuk', 'arasid*', 'kakao*', 'bambuck*', 'cesnek*', 'bylink*', 'pomaz*', 'susen*', 'kolac*', 'cokolad*', 'ghi', 'ghee', 'prepust*'],
  },
  {
    code: '01145001', // Eidamská cihla [1 kg]
    category: 'mlecne', unit: 'g',
    all: ['eidam*'], none: ['uzen*'],
  },
  {
    code: '01145002', // Hermelín [1 kg]
    category: 'mlecne', unit: 'g',
    all: ['hermelin'], none: ['smaz*', 'obalov*', 'naklad*', 'marinov*', 'pomaz*', 'salat*'],
  },
  {
    code: '01145007', // Tvaroh měkký konzumní [1 kg]
    category: 'mlecne', unit: 'g',
    all: ['tvaroh'], none: ['pomaz*', 'dezert*', 'kolac*', 'knedl*', 'termix*', 'tycink*'],
  },
  {
    code: '01146001', // Jogurt bílý netučný [150 g]
    category: 'mlecne', unit: 'g',
    all: ['jogurt*'], any: ['bily', 'bile', 'natur*', 'prirodni', 'white'],
    none: ['pit*', 'napoj*', 'drink', 'ovoc*', 'vanilk*', 'cokolad*', 'jahod*', 'boruvk*', 'malin*', 'brosk*', 'merunk*', 'mango', 'musli'],
  },
  {
    code: '01148001', // Vejce slepičí čerstvá [10 ks]
    unit: 'ks',
    any: ['vejce', 'vajec', 'vajicka', 'vajick*'],
    none: ['krepel*', 'prepel*', 'susen*', 'tekut*', 'bilk*', 'zloutk*', 'cokolad*', 'kinder', 'prekvap*', 'kalis*', 'kraslic*', 'velikonoc*', 'nudl*', 'testovin*'],
  },

  // ---- ovoce a zelenina ----
  {
    code: '01175001', // Konzumní brambory [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    all: ['brambor*'],
    none: ['hranolk*', 'kase', 'kasi', 'lupink*', 'chips*', 'knedl*', 'salat*', 'plack*', 'test*', 'kroket*', 'susen*', 'pyre', 'skrob*', 'mouk*', 'sadb*', 'hipp', 'kojen*'],
  },
  {
    code: '01161001', // Banány žluté [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    all: ['banan*'],
    none: ['cokolad*', 'kase', 'napoj*', 'jogurt*', 'chips*', 'susen*', 'tycink*', 'prichut*', 'mlecn*', 'smoothie', 'pure', 'pyre'],
  },
  {
    code: '01163001', // Jablka konzumní [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    any: ['jablk*', 'jablic*'],
    none: ['rajsk*', 'most', 'dzus', 'jus', 'stav*', 'pyre', 'kase', 'susen*', 'krizal*', 'cider*', 'cidr*', 'ocet', 'vinn*', 'pomaz*', 'kolac*'],
  },
  {
    code: '01174003', // Cibule suchá [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    any: ['cibule', 'cibuli'],
    none: ['cibulk*', 'smaz*', 'susen*', 'naklad*', 'omac*', 'polevk*', 'krouzk*', 'jarni', 'sazec*', 'smes', 'prichut*', 'salotk*'],
  },
  {
    code: '01174001', // Mrkev [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    any: ['mrkev', 'mrkve', 'mrkvi'],
    none: ['mrkvov*', 'dzus', 'stav*', 'salat*', 'kase', 'hipp', 'kojen*', 'susen*', 'pyre', 'konzerv*', 'steriliz*', 'mraz*'],
  },
  {
    code: '01172002', // Okurky salátové [1 kg] — "salátové" here means fresh, so no salat* exclude
    category: 'ovoce-zelenina', unit: 'g',
    any: ['okurk*'],
    none: ['naklad*', 'steril*', 'kysel*', 'kvasak*', 'kvasen*', 'nalev*', 'sladkokysel*', 'znojm*', 'americk*', 'konzerv*', 'sklen*', 'cm', 'ml', 'g'],
  },
  {
    code: '01172001', // Rajská jablka červená kulatá [1 kg]
    category: 'ovoce-zelenina', unit: 'g',
    any: ['rajce', 'rajcata', 'rajcat', 'rajska', 'rajske'],
    none: ['rajcatov*', 'omac*', 'protlak*', 'pyre', 'passat*', 'pasirov*', 'koncentr*', 'drcen*', 'fazol*', 'kecup*', 'ketchup*', 'loupan*', 'konzerv*', 'krajen*', 'dzus', 'stav*', 'susen*', 'polevk*', 'pasta', 'cherry', 'datter*', 'koktejl*'],
  },

  // ---- trvanlivé ----
  {
    code: '01112001', // Pšeničná mouka hladká [1 kg]
    unit: 'g',
    all: ['mouk*'], any: ['hladk*'],
    none: ['celozrn*', 'spald*', 'zitn*', 'kukuric*', 'ryzov*', 'pohank*', 'bezlep*', 'kokos*', 'mandl*'],
  },
  {
    code: '01181001', // Cukr krystalový [1 kg]
    unit: 'g',
    all: ['cukr'], any: ['krystal*', 'kristal*'],
    none: ['mouck*', 'trtin*', 'hned*', 'kokos*', 'brezov*', 'vanil*'],
  },
  {
    code: '01111001', // Rýže loupaná dlouhozrnná [1 kg]
    unit: 'g',
    any: ['ryze', 'ryzi'],
    none: ['ryzov*', 'jasmin*', 'basmat*', 'kulatozrn*', 'sushi', 'rizot*', 'natur*', 'cern*', 'cerven*', 'divok*', 'kase', 'chleb*', 'nudl*', 'vlock*', 'mouk*', 'napoj*', 'mleko', 'hipp', 'pedigree', 'whiskas', 'zele', 'kapsick*', 'psi', 'kocic*', 'masem', 'kure*', 'zelenin*'],
  },

  // ---- pivo ----
  {
    code: '02130001', // Pivo výčepní, světlé, lahvové [0,5 l]
    unit: 'ml',
    any: ['vycepn*'],
    none: ['nealko*', 'radler', 'ochuc*', 'plech*', 'tmav*', 'polotmav*', 'cern*'],
  },
];
