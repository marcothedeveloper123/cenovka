import { describe, it } from 'node:test';
import assert from 'node:assert';
import { multipackHint, varietyConflict, varietyTokensOf } from './varieties.ts';

describe('varietyTokensOf', () => {
  it('extracts tokens grouped by axis', () => {
    const tokens = new Set(['bohemia', 'sekt', 'brut', 'bile', '750ml']);
    const v = varietyTokensOf(tokens);
    assert.deepEqual(v.get('sweetness'), new Set(['brut']));
    assert.deepEqual(v.get('colour'), new Set(['bile']));
    assert.equal(v.get('alcohol'), undefined);
  });

  it('returns empty map for products with no axis tokens', () => {
    const v = varietyTokensOf(new Set(['rummo', 'spaghetti', 'semolina']));
    assert.equal(v.size, 0);
  });
});

describe('varietyConflict', () => {
  it('detects sweetness conflict (brut vs demi)', () => {
    const a = varietyTokensOf(new Set(['bohemia', 'sekt', 'brut']));
    const b = varietyTokensOf(new Set(['bohemia', 'sekt', 'demi', 'sec']));
    assert.equal(varietyConflict(a, b), true);
  });

  it('detects flavour conflict (jablko vs ananas)', () => {
    const a = varietyTokensOf(new Set(['relax', 'dzus', 'jablko']));
    const b = varietyTokensOf(new Set(['relax', 'fruit', 'drink', 'ananas']));
    assert.equal(varietyConflict(a, b), true);
  });

  it('does not flag when one side has no token on the axis', () => {
    // "Bohemia Sekt brut" vs "Bohemia Sekt Prestige" — no sweetness token in B.
    const a = varietyTokensOf(new Set(['bohemia', 'sekt', 'brut']));
    const b = varietyTokensOf(new Set(['bohemia', 'sekt', 'prestige']));
    assert.equal(varietyConflict(a, b), false);
  });

  it('matching variants do not conflict', () => {
    const a = varietyTokensOf(new Set(['relax', 'jablko']));
    const b = varietyTokensOf(new Set(['relax', 'dzus', 'jablko']));
    assert.equal(varietyConflict(a, b), false);
  });
});

describe('multipackHint', () => {
  it('detects N x M packaging', () => {
    assert.equal(multipackHint('Budweiser Original 8 x 0,5l'), 8);
    assert.equal(multipackHint('Budvar 4×0,5 l'), 4);
    assert.equal(multipackHint('Budvar 33 ležák 6 x 0,33l (1,98l)'), 6);
  });

  it('returns 1 for singletons', () => {
    assert.equal(multipackHint('Budvar Original 0,5l'), 1);
    assert.equal(multipackHint('Madeta máslo 250g'), 1);
  });

  it('rejects implausible counts', () => {
    assert.equal(multipackHint('123 x 1l'), 1); // 123 too big
    assert.equal(multipackHint('1 x 1l'), 1); // 1 isn't a multipack
  });
});
