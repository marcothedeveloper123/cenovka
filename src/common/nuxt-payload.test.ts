import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  extractNuxtArray,
  findFirstWithKeys,
  readNumber,
  readObject,
  readString,
} from './nuxt-payload.ts';

describe('extractNuxtArray', () => {
  test('parses the script payload', () => {
    const html = '<script id="__NUXT_DATA__" type="application/json">[1,2,3]</script>';
    assert.deepEqual(extractNuxtArray(html), [1, 2, 3]);
  });

  test('returns null when missing or malformed', () => {
    assert.equal(extractNuxtArray(''), null);
    assert.equal(extractNuxtArray('<script id="__NUXT_DATA__">not json</script>'), null);
  });
});

describe('readString / readNumber / readObject', () => {
  const arr = ['x', 42, { a: 1 }, [1, 2]];
  test('returns typed values via ref', () => {
    assert.equal(readString(arr, 0), 'x');
    assert.equal(readNumber(arr, 1), 42);
    assert.deepEqual(readObject(arr, 2), { a: 1 });
  });

  test('rejects out-of-range and non-integer refs', () => {
    assert.equal(readString(arr, 99), undefined);
    assert.equal(readString(arr, -1), undefined);
    assert.equal(readNumber(arr, 'x'), undefined);
  });

  test('readObject rejects arrays', () => {
    assert.equal(readObject(arr, 3), undefined);
  });
});

describe('findFirstWithKeys', () => {
  test('locates the first dict carrying all listed keys', () => {
    const arr = [{ a: 1 }, { name: 'X', sku: 'Y', other: 0 }, { name: 'Z' }];
    const found = findFirstWithKeys(arr, ['name', 'sku']);
    assert.equal(found?.sku, 'Y');
  });

  test('returns undefined when none match', () => {
    assert.equal(findFirstWithKeys([{ a: 1 }], ['b']), undefined);
  });
});
