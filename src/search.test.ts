import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('search entrypoint is importable without running main', async () => {
  await import('./search.ts');
  assert.ok(true);
});
