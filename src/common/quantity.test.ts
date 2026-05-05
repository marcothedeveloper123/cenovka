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

  test('extracts piece counts', () => {
    assert.deepEqual(parseQuantity('Vejce 10 ks'), { unit: 'ks', quantity: 10 });
    assert.deepEqual(parseQuantity('Vdolečky 100 kusů'), { unit: 'ks', quantity: 100 });
  });

  test('returns undefined when no quantity present', () => {
    assert.equal(parseQuantity('Alpro Kokosový nápoj'), undefined);
    assert.equal(parseQuantity(''), undefined);
  });
});
