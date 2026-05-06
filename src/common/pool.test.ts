import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { mapPool } from './pool.ts';

describe('mapPool', () => {
  test('preserves input order in results', async () => {
    const out = await mapPool([1, 2, 3, 4, 5], 3, async (n) => n * 2);
    assert.deepEqual(out, [2, 4, 6, 8, 10]);
  });

  test('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    });
    assert.ok(peak <= 3, `peak ${peak} exceeded concurrency 3`);
  });

  test('reports progress as items finish', async () => {
    const seen: Array<[number, number]> = [];
    await mapPool([1, 2, 3], 2, async (n) => n, {
      onProgress: (done, total) => seen.push([done, total]),
    });
    assert.equal(seen.length, 3);
    assert.deepEqual(seen[seen.length - 1], [3, 3]);
  });
});
