import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng } from '../../src/sim/rng.js';

const uint32 = () => fc.integer({ min: 0, max: 0xffffffff });

describe('Rng (mulberry32) properties', () => {
  it('is deterministic: same seed produces identical sequences', () => {
    fc.assert(
      fc.property(uint32(), (seed) => {
        const a = new Rng(seed);
        const b = new Rng(seed);
        const seqA = Array.from({ length: 100 }, () => a.nextU32());
        const seqB = Array.from({ length: 100 }, () => b.nextU32());
        expect(seqA).toEqual(seqB);
      }),
    );
  });

  it('has a stable prefix: drawing more does not change earlier draws', () => {
    fc.assert(
      fc.property(uint32(), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }), (seed, x, y) => {
        const n = Math.min(x, y);
        const m = Math.max(x, y);

        const short = new Rng(seed);
        const shortDraws = Array.from({ length: n }, () => short.nextU32());

        const long = new Rng(seed);
        const longDraws = Array.from({ length: m }, () => long.nextU32());

        expect(longDraws.slice(0, n)).toEqual(shortDraws);
      }),
    );
  });

  it('produces every nextU32() result as an integer in [0, 4294967295]', () => {
    fc.assert(
      fc.property(uint32(), (seed) => {
        const rng = new Rng(seed);
        const value = rng.nextU32();
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });

  it('tracks callCount exactly: 0 before any call, k after k calls', () => {
    fc.assert(
      fc.property(uint32(), fc.integer({ min: 0, max: 200 }), (seed, k) => {
        const rng = new Rng(seed);
        expect(rng.callCount).toBe(0);
        for (let i = 0; i < k; i++) {
          rng.nextU32();
        }
        expect(rng.callCount).toBe(k);
      }),
    );
  });
});
