import { describe, it } from 'node:test';
import assert from 'node:assert';

// audit-dups.ts has only a CLI side-effect; ensure it's importable without
// running its `main()` (the file:// guard isolates the entrypoint).
describe('audit-dups module', () => {
  it('imports without invoking main', async () => {
    const mod = await import('./audit-dups.ts');
    assert.equal(typeof mod, 'object');
  });
});
