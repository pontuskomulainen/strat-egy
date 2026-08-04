import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng.js';

// Golden output for seed 12345 — generated once from the mulberry32
// implementation in src/sim/rng.ts and committed as a literal. If this ever
// changes, the RNG algorithm changed and every replay in the repo desyncs.
const GOLDEN_SEED_12345 = [
  4207900869, 1317490944, 2079646450, 3513001552, 2187978186, 1492380277,
  316786230, 3291647763, 4281336957, 3543444592, 1975405240, 4062369846,
  3825196835, 4163299428, 2695781441, 1068698135, 2032992014, 1310158935,
  3317514493, 3715897801,
];

describe('Rng (mulberry32)', () => {
  it('matches the committed golden output for seed 12345', () => {
    const rng = new Rng(12345);
    const outputs = Array.from({ length: 20 }, () => rng.nextU32());
    expect(outputs).toEqual(GOLDEN_SEED_12345);
  });

  it('produces only uint32 values', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const value = rng.nextU32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('is deterministic: same seed produces the same sequence', () => {
    const a = new Rng(999);
    const b = new Rng(999);
    const seqA = Array.from({ length: 50 }, () => a.nextU32());
    const seqB = Array.from({ length: 50 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('tracks the number of calls made', () => {
    const rng = new Rng(42);
    expect(rng.callCount).toBe(0);
    rng.nextU32();
    rng.nextU32();
    rng.nextU32();
    expect(rng.callCount).toBe(3);
  });
});
