import { describe, it } from 'node:test';
import assert from 'node:assert';
import { foldName, stripContainer } from './fold.ts';

describe('foldName', () => {
  it('lowercases and folds Czech diacritics', () => {
    assert.equal(foldName('Budvar Nealko pivo 0,5l'), 'budvar nealko pivo 0 5l');
    assert.equal(foldName('Vyžadováno ověření'), 'vyzadovano overeni');
  });

  it('squashes punctuation but keeps digits', () => {
    assert.equal(foldName('Budvar 33, světlý ležák, sklo'), 'budvar 33 svetly lezak sklo');
  });

  it('returns empty for empty input', () => {
    assert.equal(foldName(''), '');
  });
});

describe('stripContainer', () => {
  it('drops container tokens', () => {
    assert.equal(stripContainer('budvar nealko sklo'), 'budvar nealko');
    assert.equal(stripContainer('budvar original lahev 0 5l'), 'budvar original 0 5l');
    assert.equal(stripContainer('budvar plech'), 'budvar');
  });

  it('leaves non-container words alone', () => {
    assert.equal(stripContainer('budvar nealko pivo'), 'budvar nealko pivo');
  });

  it('collapses lahev vs plech of the same name', () => {
    const a = stripContainer(foldName('Budvar Original lahev 0,5 l'));
    const b = stripContainer(foldName('Budvar Original plech 0,5 l'));
    assert.equal(a, b);
  });
});
