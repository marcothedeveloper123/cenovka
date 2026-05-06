import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('match entrypoint is importable without running main', async () => {
  await import('./match.ts');
  assert.ok(true);
});
