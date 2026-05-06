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

  test('Rohlík breadcrumbs (leaf-first → take last segment)', () => {
    assert.equal(classifyCategory('Máslo > Máslo, tuky a margaríny > Mléčné a chlazené', 'rohlik'), 'mlecne');
    assert.equal(classifyCategory('Energy nápoje > Limonády > Nápoje', 'rohlik'), 'napoje');
    assert.equal(classifyCategory('Květák > Zelenina > Ovoce a zelenina', 'rohlik'), 'ovoce-zelenina');
    assert.equal(classifyCategory('Hořké čokolády > Sladkosti > Trvanlivé', 'rohlik'), 'trvanlive');
    assert.equal(classifyCategory('Sprchové gely > Kosmetika', 'rohlik'), 'drogerie');
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
