import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isChallengeMarkup } from './kaufland-cf.ts';

describe('isChallengeMarkup', () => {
  it('detects Czech challenge title', () => {
    assert.equal(isChallengeMarkup('Vyžadováno ověření'), true);
    assert.equal(isChallengeMarkup('Okamžik...'), true);
    assert.equal(isChallengeMarkup('Potvrďte, že jste člověk'), true);
  });

  it('detects English challenge title', () => {
    assert.equal(isChallengeMarkup('Just a moment...'), true);
    assert.equal(isChallengeMarkup('Attention Required! | Cloudflare'), true);
  });

  it('detects challenge body markers', () => {
    assert.equal(isChallengeMarkup('Cloudflare Ray ID: 9f7afb9a9c0cf99e'), true);
    assert.equal(isChallengeMarkup('<iframe src="https://challenges.cloudflare.com/foo">'), true);
  });

  it('strips diacritics before matching', () => {
    // simulates a build where the title was un-accented (e.g. fold-and-fetch)
    assert.equal(isChallengeMarkup('Vyzadovano overeni'), true);
  });

  it('does not flag normal kaufland pages', () => {
    assert.equal(isChallengeMarkup('Sušenky a sladkosti — Kaufland'), false);
    assert.equal(isChallengeMarkup('Potraviny | Kaufland.cz'), false);
    assert.equal(isChallengeMarkup(''), false);
  });
});
