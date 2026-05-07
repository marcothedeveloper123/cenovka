import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scoreQueryMatch } from './search.ts';
import type { Product } from './types.ts';

function p(name: string, brand?: string): Product {
  return {
    id: `t::${name}`,
    store: 'tesco',
    storeName: 'Tesco',
    name,
    brand,
    price: 1,
    available: true,
    url: 'x',
    history: [],
  };
}

describe('scoreQueryMatch — máslo bleed', () => {
  it('exact word in name beats prefix beats substring', () => {
    const butter = scoreQueryMatch(['maslo'], p('Madeta máslo 250g'));
    const buttery = scoreQueryMatch(['maslo'], p('Opavia máslové sušenky 100g'));
    const internal = scoreQueryMatch(['maslo'], p('lůj umaslo'));
    assert.ok(butter > buttery, `butter=${butter} buttery=${buttery}`);
    assert.ok(buttery > internal, `buttery=${buttery} internal=${internal}`);
  });

  it('returns 0 when any token is missing', () => {
    assert.equal(scoreQueryMatch(['maslo', 'farsky'], p('Madeta máslo 250g')), 0);
  });

  it('weights name 10× and brand 3× for whole-word', () => {
    const inName = scoreQueryMatch(['rama'], p('Rama 500g'));
    const inBrand = scoreQueryMatch(['rama'], p('Rostlinný tuk', 'Rama'));
    assert.equal(inName, 10);
    assert.equal(inBrand, 3);
  });

  it('prefix match requires both sides ≥ 4 chars', () => {
    // "ras" is too short — should fall back to substring
    const short = scoreQueryMatch(['ras'], p('Rasa kořenné koření'));
    // "rajca" prefixes "rajcata" — should hit prefix tier (5)
    const prefix = scoreQueryMatch(['rajca'], p('Sušená rajčata 100g'));
    assert.ok(short < 5, `short=${short} should be substring tier`);
    assert.equal(prefix, 5);
  });
});
