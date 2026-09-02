import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { coicopClass, type JsonStatDoc, mergeSeries, normalizeLabel, parseJsonStat, parseLabel } from './csu.ts';

/**
 * Two items x three months, shaped like the real ČSÚ payload. `id` order is
 * deliberately *not* item-major here — the historical selection is item-major
 * and the current one is not, and the parser must handle both.
 */
function doc(opts: {
  itemDim: string;
  codes: Record<string, string>;
  months: string[];
  /** values[itemCode][month] */
  values: Record<string, Array<number | null>>;
}): JsonStatDoc {
  const codes = Object.keys(opts.codes);
  // Dimension order: IndicatorType (1) x Uz0 (1) x item x time
  const value: Array<number | null> = [];
  for (const c of codes) for (let t = 0; t < opts.months.length; t++) value.push(opts.values[c]![t]!);
  return {
    id: ['IndicatorType', 'Uz0', opts.itemDim, 'CasM'],
    size: [1, 1, codes.length, opts.months.length],
    value,
    dimension: {
      IndicatorType: { category: { index: { '6137': 0 } } },
      Uz0: { category: { index: { CZ: 0 } } },
      [opts.itemDim]: {
        category: {
          index: Object.fromEntries(codes.map((c, i) => [c, i])),
          label: opts.codes,
        },
      },
      CasM: { category: { index: Object.fromEntries(opts.months.map((m, i) => [m, i])) } },
    },
  };
}

const OLDER = doc({
  itemDim: 'CENREP3',
  codes: { '0115101': 'Máslo [1 kg]', '0112201': 'Vepřová pečeně [1kg]' },
  months: ['2025-11', '2025-12'],
  values: { '0115101': [230.5, 240.1], '0112201': [110.0, 111.5] },
});

const NEWER = doc({
  itemDim: 'CENREP4',
  codes: { '01152001': 'Máslo [1 kg]', '01122205': 'Vepřová pečeně [1 kg]' },
  months: ['2026-01', '2026-02'],
  values: { '01152001': [165.4, 151.6], '01122205': [112.5, 108.9] },
});

describe('normalizeLabel', () => {
  test('folds the three cosmetic differences between ČSÚ vintages', () => {
    assert.equal(normalizeLabel('Vepřová pečeně [1kg]'), normalizeLabel('Vepřová pečeně [1 kg]'));
    assert.equal(
      normalizeLabel('Tuzemský tmavý (Tuzemák) [1 l]'),
      normalizeLabel('Tuzemský tmavý (tuzemák) [1 l]'),
    );
    assert.equal(
      normalizeLabel('Jakostní víno červené - od 2015 [0,75 l]'),
      normalizeLabel('Jakostní víno červené [0,75 l]'),
    );
  });

  test('keeps genuinely different items apart', () => {
    assert.notEqual(normalizeLabel('Máslo [1 kg]'), normalizeLabel('Máslo [250 g]'));
  });
});

describe('parseLabel', () => {
  test('splits name from packaging and normalises to base units', () => {
    assert.deepEqual(parseLabel('Máslo [1 kg]'), {
      name: 'Máslo',
      packaging: '1 kg',
      unit: 'g',
      quantity: 1000,
    });
    assert.deepEqual(parseLabel('Jogurt bílý netučný [150 g]'), {
      name: 'Jogurt bílý netučný',
      packaging: '150 g',
      unit: 'g',
      quantity: 150,
    });
    assert.deepEqual(parseLabel('Vejce slepičí čerstvá [10 ks]'), {
      name: 'Vejce slepičí čerstvá',
      packaging: '10 ks',
      unit: 'ks',
      quantity: 10,
    });
    assert.deepEqual(parseLabel('Jakostní víno červené [0,75 l]'), {
      name: 'Jakostní víno červené',
      packaging: '0,75 l',
      unit: 'ml',
      quantity: 750,
    });
  });

  test('survives a label with no bracketed packaging', () => {
    assert.deepEqual(parseLabel('Něco bez balení'), { name: 'Něco bez balení', packaging: '' });
  });
});

describe('parseJsonStat', () => {
  test('reads each item newest-first, keyed by normalised label', () => {
    const parsed = parseJsonStat(OLDER);
    const maslo = parsed.get(normalizeLabel('Máslo [1 kg]'));
    assert.equal(maslo?.code, '0115101');
    assert.deepEqual(maslo?.history, [
      { month: '2025-12', price: 240.1 },
      { month: '2025-11', price: 230.5 },
    ]);
  });

  test('skips null months rather than interpolating', () => {
    const withGap = doc({
      itemDim: 'CENREP4',
      codes: { '01131002': 'Kapr chlazený [1 kg]' },
      months: ['2026-01', '2026-02'],
      values: { '01131002': [null, 221.3] },
    });
    const h = parseJsonStat(withGap).get(normalizeLabel('Kapr chlazený [1 kg]'))?.history;
    assert.deepEqual(h, [{ month: '2026-02', price: 221.3 }]);
  });

  test('rejects a document with no recognisable item dimension', () => {
    const bad = { ...OLDER, id: ['IndicatorType', 'Uz0', 'NOPE', 'CasM'] };
    assert.throws(() => parseJsonStat(bad as JsonStatDoc), /no CENREP\* dimension/);
  });
});

describe('mergeSeries', () => {
  test('joins the vintages on label and keeps the current code', () => {
    const items = mergeSeries(parseJsonStat(OLDER), parseJsonStat(NEWER));
    assert.equal(items.length, 2);
    const maslo = items.find((i) => i.name === 'Máslo');
    assert.equal(maslo?.code, '01152001', 'current scheme wins');
    assert.equal(maslo?.coicop, '01152');
    assert.deepEqual(
      maslo?.history.map((h) => h.month),
      ['2026-02', '2026-01', '2025-12', '2025-11'],
      'newest first, both vintages present',
    );
  });

  test('joins despite the [1kg] / [1 kg] whitespace difference', () => {
    const pork = mergeSeries(parseJsonStat(OLDER), parseJsonStat(NEWER)).find(
      (i) => i.name === 'Vepřová pečeně',
    );
    assert.equal(pork?.history.length, 4);
  });

  test('current vintage wins on an overlapping month', () => {
    const overlap = doc({
      itemDim: 'CENREP4',
      codes: { '01152001': 'Máslo [1 kg]', '01122205': 'Vepřová pečeně [1 kg]' },
      months: ['2025-12'],
      values: { '01152001': [999], '01122205': [111.5] },
    });
    const maslo = mergeSeries(parseJsonStat(OLDER), parseJsonStat(overlap)).find(
      (i) => i.name === 'Máslo',
    );
    assert.equal(maslo?.history.find((h) => h.month === '2025-12')?.price, 999);
  });

  test('throws when the item sets diverge instead of silently shrinking', () => {
    const renamed = doc({
      itemDim: 'CENREP4',
      codes: { '01152001': 'Máslo tradiční [1 kg]', '01122205': 'Vepřová pečeně [1 kg]' },
      months: ['2026-01'],
      values: { '01152001': [165.4], '01122205': [112.5] },
    });
    assert.throws(
      () => mergeSeries(parseJsonStat(OLDER), parseJsonStat(renamed)),
      /item sets diverged/,
    );
  });
});

describe('coicopClass', () => {
  test('takes the leading five digits', () => {
    assert.equal(coicopClass('01152001'), '01152');
    assert.equal(coicopClass('02130001'), '02130');
  });
});
