import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('globus scraper module is importable without running main', async () => {
  await import('./globus.ts');
  assert.ok(true);
});
