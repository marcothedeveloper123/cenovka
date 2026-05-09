import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { classifyCategory } from './categories.ts';

describe('classifyCategory', () => {
  test('Tesco breadcrumbs (root-first)', () => {
    assert.equal(classifyCategory('Mléčné, vejce a margaríny > Jogurty', 'tesco'), 'mlecne');
    assert.equal(classifyCategory('Maso a lahůdky > Hovězí', 'tesco'), 'maso');
    assert.equal(classifyCategory('Drogerie > Péče o ústa', 'tesco'), 'drogerie');
    assert.equal(classifyCategory('Domov a zábava > Hračky', 'tesco'), 'domov');
    assert.equal(classifyCategory('Dítě > Pleny', 'tesco'), 'dite');
    assert.equal(classifyCategory('Mražené > Zelenina', 'tesco'), 'mrazene');
  });

  test('Rohlík breadcrumbs (leaf-first; classifier walks all segments)', () => {
    assert.equal(classifyCategory('Máslo > Máslo, tuky a margaríny > Mléčné a chlazené', 'rohlik'), 'mlecne');
    assert.equal(classifyCategory('Energy nápoje > Limonády > Nápoje', 'rohlik'), 'napoje');
    assert.equal(classifyCategory('Květák > Zelenina > Ovoce a zelenina', 'rohlik'), 'ovoce-zelenina');
    // "Hořké čokolády > Sladkosti > Trvanlivé" — both 'cokolad' (sladke)
    // and 'trvanl' (trvanlive) match; sladke is more specific & wins.
    assert.equal(classifyCategory('Hořké čokolády > Sladkosti > Trvanlivé', 'rohlik'), 'sladke');
    assert.equal(classifyCategory('Sprchové gely > Kosmetika', 'rohlik'), 'drogerie');
  });

  test('alcoholic drinks under a Nápoje root → alkohol, not napoje', () => {
    // The bug: pickRoot only looked at one segment, so Tesco/Rohlík/Košík/Billa
    // alcohol products (always nested under Nápoje) all got classified as
    // napoje. Now the full path is searched, alkohol keywords win first.
    assert.equal(classifyCategory('Nápoje > Pivo > 11-12 / Ležáky', 'tesco'), 'alkohol');
    assert.equal(classifyCategory('Nápoje > Víno a vinné nápoje > Bílá vína', 'tesco'), 'alkohol');
    assert.equal(classifyCategory('Sekty > Šumivá a perlivá > Víno > Nápoje', 'rohlik'), 'alkohol');
    assert.equal(classifyCategory('Nápoje > Lihoviny > Gin', 'kosik'), 'alkohol');
    assert.equal(classifyCategory('Nápoje > Vína > Šumivá a šampaňské', 'kosik'), 'alkohol');
    assert.equal(classifyCategory('Nápoje > Lihoviny > Vodka', 'billa'), 'alkohol');
  });

  test('non-alcoholic drinks still classify as napoje, not alkohol', () => {
    assert.equal(classifyCategory('Nápoje > Limonády', 'tesco'), 'napoje');
    assert.equal(classifyCategory('Nápoje > Voda', 'tesco'), 'napoje');
    assert.equal(classifyCategory('Energy nápoje > Limonády > Nápoje', 'rohlik'), 'napoje');
    // Bug: "Top Topic Original limonáda" was classified alkohol because the
    // Rohlík breadcrumb has "Hroznové víno" (grape flavour name) and 'vino'
    // prefix-matched. Limonády in the same path now wins.
    assert.equal(classifyCategory('Hroznové víno > Limonády > Limonády a energy > Nápoje', 'rohlik'), 'napoje');
    // Tesco non-alc beer: should be napoje, not alkohol.
    assert.equal(classifyCategory('Nápoje > Pivo > Nealkoholické pivo', 'tesco'), 'napoje');
  });

  test('Globus combined alc+nealc bucket → napoje (ambiguous, safer default)', () => {
    // "napoje-alkoholicke-a-nealkoholicke" mixes Becherovka with Evian.
    // Without product-name analysis we can't split them, so default to napoje.
    assert.equal(classifyCategory('napoje-alkoholicke-a-nealkoholicke', 'globus'), 'napoje');
  });

  test('keyword tokens do not bleed into longer Czech words', () => {
    // 'gin' must not match 'original' (o-b-original-super-tampony-...).
    // 'vino' must not match 'potravinove' (Alufix Sáčky → potravinove-folie).
    // 'rum' must not match common substrings.
    assert.equal(classifyCategory('p > o-b-original-super-tampony-...', 'globus'), undefined);
    assert.equal(classifyCategory('domacnost-a-zahrada > kuchynske-potreby > skladovani-potravin > potravinove-folie-a-sacky', 'globus'), 'domov');
    assert.equal(classifyCategory('Domácnost a zahrada > Kuchyňské potřeby > Pečicí papír, alobal, fólie > Potravinové fólie', 'kosik'), 'domov');
  });

  test('Košík breadcrumbs (root-first)', () => {
    assert.equal(classifyCategory('Mléčné a chlazené > Jogurty', 'kosik'), 'mlecne');
    assert.equal(classifyCategory('Drogerie a kosmetika > Šampony', 'kosik'), 'drogerie');
    assert.equal(classifyCategory('Mazlíčci > Kočky', 'kosik'), 'pet');
    assert.equal(classifyCategory('Děti > Dětská kosmetika', 'kosik'), 'dite');
  });

  test('returns undefined for empty or unknown input', () => {
    assert.equal(classifyCategory(undefined, 'tesco'), undefined);
    assert.equal(classifyCategory('', 'tesco'), undefined);
    assert.equal(classifyCategory('Charita', 'kosik'), undefined);
  });

  test('is diacritic-insensitive', () => {
    assert.equal(classifyCategory('Mlecne > Jogurty', 'tesco'), 'mlecne');
    assert.equal(classifyCategory('MLÉČNÉ > Foo', 'tesco'), 'mlecne');
  });
});
