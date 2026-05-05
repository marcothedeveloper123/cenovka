import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { sleep } from './fetch.ts';

describe('sleep', () => {
  test('resolves after roughly the requested delay', async () => {
    const t0 = Date.now();
    await sleep(20);
    assert.ok(Date.now() - t0 >= 15);
  });
});
