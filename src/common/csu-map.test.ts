import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { CSU_MATCHERS, classifyCsu, matchKeyword, matchStage, referenceUnitPrices, tokenize } from './csu-map.ts';
import type { Product, ReferenceItem } from './types.ts';

const base: Product = {
  store: 'tesco', id: '1', name: 'x', price: 100, currency: 'CZK',
  unit: 'g', quantity: 1000, available: true, url: 'https://example.com/1',
  scrapedAt: '2026-09-03T00:00:00Z', categoryCanonical: 'maso',
};
const p = (o: Partial<Product>): Product => ({ ...base, ...o });

// ČSÚ prices per base unit (Kč per g / ml / ks), matching the live values.
const REF = new Map<string, number>([
  ['01122101', 320.48 / 1000], // beef hindquarter
  ['01152001', 117.54 / 1000], // butter
  ['01148001', 46.5 / 10],     // eggs
  ['01175001', 17.72 / 1000],  // potatoes
]);
const by = (code: string) => CSU_MATCHERS.find((m) => m.code === code)!;

describe('matchKeyword', () => {
  test('is exact by default — maslo does not match maslova (margarine)', () => {
    assert.equal(matchKeyword(tokenize('Rama Máslová příchuť 400g'), 'maslo'), false);
    assert.equal(matchKeyword(tokenize('Milko Máslo 250g'), 'maslo'), true);
  });
  test('trailing * opts into prefix matching across declensions', () => {
    for (const n of ['Hovězí zadní', 'z hovězího masa', 's hovězím']) {
      assert.equal(matchKeyword(tokenize(n), 'hovez*'), true, n);
    }
  });
  test('tokenises on word boundaries so short stems cannot match inside words', () => {
    assert.equal(matchKeyword(tokenize('Original crisps'), 'gin'), false);
  });
});

describe('matchStage', () => {
  const beef = by('01122101');
  test('accepts a real hindquarter cut', () => {
    assert.equal(matchStage(p({ name: 'Masna Rosovice Hovězí zadní bez kosti', price: 340 }), beef, REF.get(beef.code)), 'band');
  });
  test('rejects a ready meal that reuses the cut name (svíčková sauce)', () => {
    assert.equal(matchStage(p({ name: 'Svíčková omáčka s hovězím masem a knedlíkem', price: 240 }), beef, REF.get(beef.code)), 'no');
  });
  test('rejects forequarter and pet food', () => {
    assert.equal(matchStage(p({ name: 'Hovězí přední kližka', price: 290 }), beef, REF.get(beef.code)), 'no');
    assert.equal(matchStage(p({ name: 'Hovězí kapsička pro psy', price: 50, quantity: 100 }), beef, REF.get(beef.code)), 'no');
  });
  test('gates on unit and on canonical category', () => {
    assert.equal(matchStage(p({ name: 'Hovězí zadní', unit: 'ks', quantity: 1 }), beef, REF.get(beef.code)), 'no');
    assert.equal(matchStage(p({ name: 'Hovězí zadní', categoryCanonical: 'mrazene' }), beef, REF.get(beef.code)), 'no');
  });
  test('band drops a quantity-parse error but keeps a premium cut', () => {
    // "1 g" parsed as the quantity → 699 900 Kč/kg; the band is what catches it.
    assert.equal(matchStage(p({ name: 'Masna Rosovice Hovězí svíčková', price: 699.9, quantity: 1 }), beef, REF.get(beef.code)), 'keywords');
    assert.equal(matchStage(p({ name: 'Qualivo Hovězí steak svíčková', price: 1475 }), beef, REF.get(beef.code)), 'band');
  });
  test('reports keywords-only when there is no reference price to band against', () => {
    assert.equal(matchStage(p({ name: 'Hovězí zadní bez kosti' }), beef, undefined), 'keywords');
  });
});

describe('table traps found on real data', () => {
  test('butter excludes butter-flavoured margarine and herb butter', () => {
    const m = by('01152001');
    const r = REF.get(m.code);
    assert.equal(matchStage(p({ name: 'Rama Máslová příchuť 400g', categoryCanonical: 'mlecne', price: 45, quantity: 400 }), m, r), 'no');
    assert.equal(matchStage(p({ name: 'Kotányi Bylinkové máslo', categoryCanonical: 'mlecne', price: 40, quantity: 125 }), m, r), 'no');
    assert.equal(matchStage(p({ name: 'Miil Máslo 82%', categoryCanonical: 'mlecne', price: 48, quantity: 250 }), m, r), 'band');
  });
  test('eggs exclude egg cups and quail eggs', () => {
    const m = by('01148001');
    const r = REF.get(m.code);
    assert.equal(matchStage(p({ name: 'F&F kalíšek na vejce 4 ks', unit: 'ks', quantity: 4, price: 145, categoryCanonical: 'domov' }), m, r), 'no');
    assert.equal(matchStage(p({ name: 'Křepelčí vejce 12 ks', unit: 'ks', quantity: 12, price: 60, categoryCanonical: 'mlecne' }), m, r), 'no');
    assert.equal(matchStage(p({ name: 'Čerstvá vejce M 10 ks', unit: 'ks', quantity: 10, price: 55, categoryCanonical: 'mlecne' }), m, r), 'band');
  });
  test('potatoes exclude baby purée via keywords and via the band', () => {
    const m = by('01175001');
    const r = REF.get(m.code);
    const veg = { categoryCanonical: 'ovoce-zelenina' as const };
    assert.equal(matchStage(p({ ...veg, name: 'HiPP BIO Mrkev s bramborami', price: 45, quantity: 200 }), m, r), 'no');
    // a gourmet baby potato at 83 Kč/kg is 4.7× the ČSÚ price — inside [0.3, 5]
    assert.equal(matchStage(p({ ...veg, name: 'Brambory baby gourmet', price: 41.5, quantity: 500 }), m, r), 'band');
  });
  test('apples do not swallow rajská jablka (tomatoes)', () => {
    const m = by('01163001');
    assert.equal(matchStage(p({ name: 'Rajská jablka kulatá', categoryCanonical: 'ovoce-zelenina', price: 55 }), m, undefined), 'no');
  });
});

describe('classifyCsu', () => {
  test('returns the first full match in table order', () => {
    assert.equal(classifyCsu(p({ name: 'Hovězí zadní bez kosti', price: 340 }), REF), '01122101');
  });
  test('returns undefined when nothing matches or the band rejects', () => {
    assert.equal(classifyCsu(p({ name: 'Něco úplně jiného' }), REF), undefined);
    assert.equal(classifyCsu(p({ name: 'Hovězí zadní', price: 699.9, quantity: 1 }), REF), undefined);
  });
});

describe('referenceUnitPrices', () => {
  test('converts each item to price per base unit and skips unparsed packaging', () => {
    const items: ReferenceItem[] = [
      { code: 'A', label: 'Máslo [1 kg]', name: 'Máslo', packaging: '1 kg', unit: 'g', quantity: 1000, coicop: '01152', history: [{ month: '2026-07', price: 117.54 }] },
      { code: 'B', label: 'Vejce [10 ks]', name: 'Vejce', packaging: '10 ks', unit: 'ks', quantity: 10, coicop: '01148', history: [{ month: '2026-07', price: 46.5 }] },
      { code: 'C', label: 'Bez balení', name: 'Bez balení', packaging: '', coicop: '01199', history: [{ month: '2026-07', price: 1 }] },
    ];
    const m = referenceUnitPrices(items);
    assert.equal(m.get('A'), 0.11754);
    assert.equal(m.get('B'), 4.65);
    assert.equal(m.has('C'), false);
  });
});

describe('table hygiene', () => {
  test('codes are unique and every row has a positive keyword gate', () => {
    const codes = CSU_MATCHERS.map((m) => m.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const m of CSU_MATCHERS) assert.ok((m.all?.length ?? 0) + (m.any?.length ?? 0) > 0, m.code);
  });
});
