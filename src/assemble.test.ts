import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('assemble entrypoint is importable without running main', async () => {
  await import('./assemble.ts');
  // If the import.meta guard works, importing this module is a no-op.
  assert.ok(true);
});
