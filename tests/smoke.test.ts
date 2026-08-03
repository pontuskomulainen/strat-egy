import { describe, expect, it } from 'vitest';

// Placeholder. Its only job is to prove the runner is wired up and to give the
// test-count ratchet a floor to stand on. Delete it once real sim tests exist —
// but only together with a ratchet floor that does not go down.
describe('toolchain', () => {
  it('runs tests as ESM', () => {
    expect(import.meta.url).toMatch(/smoke\.test\.ts$/);
  });
});
