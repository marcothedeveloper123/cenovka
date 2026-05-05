import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { isValidEan } from './validate.ts';

describe('isValidEan', () => {
  test('accepts real EAN-13 codes', () => {
    for (const ean of ['8720181334740', '5051007171489', '5901234123457']) {
      assert.equal(isValidEan(ean), true, ean);
    }
  });

  test('rejects bad check digits and non-numeric input', () => {
    for (const bad of ['1234567890123', '1234567890', 'abcd', '']) {
      assert.equal(isValidEan(bad), false, bad);
    }
  });
});
