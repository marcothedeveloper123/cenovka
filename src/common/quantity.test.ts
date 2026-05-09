import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { parseQuantity } from './quantity.ts';

describe('parseQuantity', () => {
  test('extracts grams from product names', () => {
    assert.deepEqual(parseQuantity('Čokoláda 100g'), { unit: 'g', quantity: 100 });
    assert.deepEqual(parseQuantity('Máslo 250 g'), { unit: 'g', quantity: 250 });
  });

  test('converts kilograms and decagrams to grams', () => {
    assert.deepEqual(parseQuantity('Mouka 1 kg'), { unit: 'g', quantity: 1000 });
    assert.deepEqual(parseQuantity('Sýr 10 dag'), { unit: 'g', quantity: 100 });
  });

  test('converts liters and deciliters to milliliters', () => {
    assert.deepEqual(parseQuantity('Mléko 1 l'), { unit: 'ml', quantity: 1000 });
    assert.deepEqual(parseQuantity('Šťáva 500 ml'), { unit: 'ml', quantity: 500 });
    assert.deepEqual(parseQuantity('Olej 2 dl'), { unit: 'ml', quantity: 200 });
  });

  test('handles comma decimal separator', () => {
    assert.deepEqual(parseQuantity('Aviváž 1,35 l'), { unit: 'ml', quantity: 1350 });
  });

  test('tolerates whitespace around the decimal separator', () => {
    // Real Tesco/Billa data: "Hennessy Very Special 0, 35l" used to parse
    // as 35l (35000 ml) because the parser took the right-hand digits when
    // separated by a stray space. Now reads as 0.35 l = 350 ml.
    assert.deepEqual(parseQuantity('Hennessy Very Special 0, 35l'), { unit: 'ml', quantity: 350 });
    assert.deepEqual(parseQuantity('Coca-Cola 0, 33 l'), { unit: 'ml', quantity: 330 });
    assert.deepEqual(parseQuantity('Voda 1, 5 l'), { unit: 'ml', quantity: 1500 });
  });

  test('extracts piece counts', () => {
    assert.deepEqual(parseQuantity('Vejce 10 ks'), { unit: 'ks', quantity: 10 });
    assert.deepEqual(parseQuantity('Vdolečky 100 kusů'), { unit: 'ks', quantity: 100 });
  });

  test('extracts Czech-specific piece words (kapsle, tablety, sáčků)', () => {
    assert.deepEqual(parseQuantity('Lungo - 16 kapslí v balení'), { unit: 'ks', quantity: 16 });
    assert.deepEqual(parseQuantity('Tablety do myčky 30 tablet'), { unit: 'ks', quantity: 30 });
    assert.deepEqual(parseQuantity('Čaj 20 sáčků'), { unit: 'ks', quantity: 20 });
  });

  test('returns undefined when no quantity present', () => {
    assert.equal(parseQuantity('Alpro Kokosový nápoj'), undefined);
    assert.equal(parseQuantity(''), undefined);
  });
});
