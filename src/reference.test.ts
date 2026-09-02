import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('reference entrypoint is importable without running main', async () => {
  const mod = await import('./reference.ts');
  assert.equal(typeof mod.buildReference, 'function');
});
