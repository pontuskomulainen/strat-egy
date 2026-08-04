// mulberry32 — a 32-bit PRNG using only exactly-specified Uint32 operations
// (Math.imul, >>>). No transcendentals, no floats in the state, no Math.random.
// See CLAUDE.md's determinism rules: "Banned in src/sim/**".

export class Rng {
  #state: number;
  #calls = 0;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** Number of times nextU32() has been called. Hashed into per-tick state. */
  get callCount(): number {
    return this.#calls;
  }

  nextU32(): number {
    this.#calls += 1;

    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
}
