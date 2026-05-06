import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('billa scraper module is importable without running main', async () => {
  await import('./billa.ts');
  assert.ok(true);
});
