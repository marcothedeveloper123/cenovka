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
  });

  test('Globus combined alc+nealc bucket → napoje (ambiguous, safer default)', () => {
    // "napoje-alkoholicke-a-nealkoholicke" mixes Becherovka with Evian.
    // Without product-name analysis we can't split them, so default to napoje.
    assert.equal(classifyCategory('napoje-alkoholicke-a-nealkoholicke', 'globus'), 'napoje');
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
