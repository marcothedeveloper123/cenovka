import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('penny scraper module is importable without running main', async () => {
  await import('./penny.ts');
  assert.ok(true);
});
