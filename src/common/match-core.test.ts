import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { buildMatchGroups, jaccard, tokens } from './match-core.ts';
import type { CanonicalProduct } from './types.ts';

function product(extra: Partial<CanonicalProduct>): CanonicalProduct {
  return {
    store: 'tesco',
    id: '1',
    name: 'Máslo 250 g',
    price: 60,
    currency: 'CZK',
    available: true,
    unit: 'g',
    quantity: 250,
    categoryCanonical: 'mlecne',
    url: 'https://example.com/1',
    scrapedAt: '2026-05-06T00:00:00Z',
    priceHistory: [{ date: '2026-05-06', price: 60 }],
    ...extra,
  };
}

describe('tokens', () => {
  test('produces folded, lowercased, stopword-stripped tokens', () => {
    const t = tokens('Hollandia Selský jogurt jahoda', 'Hollandia');
    assert.ok(t.has('hollandia'));
    assert.ok(t.has('selsky'));
    assert.ok(t.has('jogurt'));
    assert.ok(t.has('jahoda'));
    assert.equal(t.has('a'), false);
  });

  test('drops "bio" / "eko" / units / pure numbers', () => {
    const t = tokens('Bio máslo 250 g', undefined);
    assert.equal(t.has('bio'), false);
    assert.equal(t.has('250'), false);
    assert.equal(t.has('g'), false);
    assert.ok(t.has('maslo'));
  });
});

describe('jaccard', () => {
  test('identical sets score 1', () => {
    assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  });

  test('disjoint sets score 0', () => {
    assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  });

  test('half overlap', () => {
    assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'c'])), 1 / 3);
  });
});

describe('buildMatchGroups', () => {
  test('groups same-name products from different chains', () => {
    const items: CanonicalProduct[] = [
      product({ store: 'tesco', id: 't', name: 'Hollandia Selský jogurt jahoda', price: 22, quantity: 150 }),
      product({ store: 'rohlik', id: 'r', name: 'Hollandia Selský jogurt jahoda', price: 21, quantity: 150 }),
    ];
    const groups = buildMatchGroups(items);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.members.length, 2);
  });

  test('does not group same-store duplicates as cross-chain', () => {
    const items: CanonicalProduct[] = [
      product({ store: 'tesco', id: 't1', name: 'Máslo' }),
      product({ store: 'tesco', id: 't2', name: 'Máslo' }),
    ];
    assert.equal(buildMatchGroups(items).length, 0);
  });

  test('does not group dissimilar names in same bucket', () => {
    const items: CanonicalProduct[] = [
      product({ store: 'tesco', id: 't', name: 'Máslo Selské' }),
      product({ store: 'rohlik', id: 'r', name: 'Margarín Rama' }),
    ];
    assert.equal(buildMatchGroups(items).length, 0);
  });

  test('skips products without category/unit/quantity', () => {
    const items: CanonicalProduct[] = [
      product({ store: 'tesco', id: 't', categoryCanonical: undefined }),
      product({ store: 'rohlik', id: 'r', categoryCanonical: undefined }),
    ];
    assert.equal(buildMatchGroups(items).length, 0);
  });
});
