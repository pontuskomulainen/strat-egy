# Backlog — the first 15 issues

Paste each block below into a new GitHub issue. Title goes in the title field, the rest
in the body. **Do not label anything `agent:ready` until Phase 0 is complete.** Then
promote two or three at a time — the queue should be shallow, so you can reorder it by
just labelling something else.

They are ordered by dependency: 1 unblocks 2–3, and so on. Issue 14 is the first thing
you can look at with your own eyes; everything before it is verified only by CI, which
is the point.

Every issue has exactly two machine-readable parts the harness parses: a fenced
` ```acceptance ` block and a `Files:` line. If either is missing the run fails
before Claude is invoked.

---

### 1. Bootstrap the toolchain

Set up TypeScript, Vitest, and ESLint. Node 22, ESM, strict mode. No application code.
`npm run typecheck`, `npm run lint`, `npm test` must all exist and pass on an empty
test suite. Add `.ratchet/test-count.json` containing `{"count": 0}`.

```acceptance
npm run typecheck
npm run lint
npm test
test -f .ratchet/test-count.json
```

Files: package.json, package-lock.json, tsconfig.json, eslint.config.js, vitest.config.ts, .ratchet/test-count.json, tests/smoke.test.ts

---

### 2. ESLint determinism rules for the sim core

Add `no-restricted-globals` and `no-restricted-properties` scoped to `src/sim/**`,
banning `Math.random`, `Math.sin|cos|tan|pow|exp|log`, `Date`, `performance`,
`setTimeout`, `setInterval`, and `crypto`. Add a fixture file that violates each rule
and a test asserting ESLint reports every one of them.

This lint rule is the cheapest test in the repo and it guards the property everything
else depends on.

```acceptance
npm run lint
npx vitest run tests/lint-rules.test.ts
```

Files: eslint.config.js, tests/lint-rules.test.ts, tests/fixtures/**

---

### 3. Seeded RNG

Implement `mulberry32` in `src/sim/rng.ts`, using only `Uint32` operations
(`Math.imul`, `>>>`) which are exactly specified. Expose `nextU32()` and a **call
counter** — the counter gets hashed into per-tick state later, because a desync
usually starts as "one side drew one extra number".

Include a golden test: seed `12345`, first 20 outputs, committed as literals.

```acceptance
npm run lint
npx vitest run tests/sim/rng.test.ts
```

Files: src/sim/rng.ts, tests/sim/rng.test.ts

---

### 4. FNV-1a hasher

`src/sim/hash.ts`: FNV-1a 32-bit over a raw `ArrayBuffer`. Also a `HashTree` type with
named sub-hashes. Golden tests over known byte sequences.

```acceptance
npm run lint
npx vitest run tests/sim/hash.test.ts
```

Files: src/sim/hash.ts, tests/sim/hash.test.ts

---

### 5. State shape and serialization

`src/sim/state.ts`: structure-of-arrays in typed arrays. Tile ownership (`Int32Array`),
per-player resources in **thousandths as `int32`**, tick counter, RNG state.
`serialize()` / `deserialize()` over a single `ArrayBuffer`.

Property test: `hash(deserialize(serialize(s))) === hash(s)` for random states.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/sim/state.test.ts
```

Files: src/sim/state.ts, tests/sim/state.test.ts

---

### 6. The step function and the hash tree

`src/sim/step.ts`: `step(state, commands) -> state`. Synchronous, pure, no allocation
inside the hot path where avoidable. For now it only advances the tick counter and
returns a `HashTree` with `global`, `territory`, `economy`, `units`, `rngCursor`.

Constant `TICK_HZ = 10` in one place. Never hardcode it anywhere else.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/sim/step.test.ts
```

Files: src/sim/step.ts, src/sim/constants.ts, tests/sim/step.test.ts

---

### 7. Command log format and replay

`src/sim/replay.ts`: a binary-ish command log (tick, playerId, commandType, args as
int32s), plus `replay(seed, log) -> HashTree[]`. Add `npm run replay -- <file>` printing
the hash sequence.

This makes every recorded game a regression test for free.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/sim/replay.test.ts
npm run replay -- tests/fixtures/empty.log
```

Files: src/sim/replay.ts, package.json, tests/sim/replay.test.ts, tests/fixtures/empty.log

---

### 8. Determinism property test

fast-check property: for random seeds and random command logs, two independent
`replay()` calls produce identical hash sequences. Print the fast-check seed on
failure — without it a shrunk counterexample is unreproducible. Commit failing seeds
to `tests/fuzz-corpus/`.

```acceptance
npm run lint
npx vitest run tests/props/determinism.test.ts
```

Files: tests/props/determinism.test.ts, tests/fuzz-corpus/**

---

### 9. Deterministic map generation

`src/sim/map.ts`: `generateMap(seed, width, height)` producing land/water tiles using
only the seeded RNG and integer maths. Golden test: seed `1`, 32×32, committed tile
array. Same seed must give the same map on any machine.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/sim/map.test.ts
```

Files: src/sim/map.ts, tests/sim/map.test.ts

---

### 10. Territory ownership and expansion

`src/sim/territory.ts`: each tick, a player expands into 4-adjacent neutral tiles at a
rate proportional to their border length. Integer maths only. Wire it into `step()`
and into the `territory` sub-hash.

Acceptance is deliberately strict — this is the template for every gameplay issue that
follows.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/sim/territory.test.ts
npx vitest run tests/props/territory.test.ts
```

Files: src/sim/territory.ts, src/sim/step.ts, tests/sim/territory.test.ts, tests/props/territory.test.ts

Acceptance criteria the tests must encode:
- 32×32 map, seed S, one player owning a 3×3 block: after 1 tick, newly owned tile IDs
  equal a committed golden set, exactly.
- Rate law over 200 random blobs: `gained ≈ k · perimeter`, `k` stable within ±10%;
  `gained(side 9) / gained(side 3) ∈ [2.5, 3.5]`.
- No teleport: every newly owned tile is 4-adjacent to a tile that player owned at T−1.
- Isolation: this system never transfers a tile from player A to player B.

---

### 11. Conservation and safety properties

fast-check properties over 1,000 random ticks: owned + neutral == total tiles at every
tick; no `NaN`, `Infinity`, or negative stock anywhere; tick and entity-ID counters
strictly monotonic.

```acceptance
npm run lint
npx vitest run tests/props/conservation.test.ts
```

Files: tests/props/conservation.test.ts

---

### 12. N-instance in-process sync harness

`npm run test:sync`: spin up N (default 4) independent sim instances **in one Node
process**, feed them one command log, compare hash trees per tick. On mismatch, binary
search for the first divergent tick and print a field-level diff of T−1 vs T.

This catches nearly every determinism bug for seconds of CI, before a socket exists.
It is the single highest-value test in the project.

```acceptance
npm run lint
npm run typecheck
npm run test:sync
```

Files: scripts/sync-check.ts, package.json, tests/sync/**

---

### 13. Deterministic performance counters

Count entity iterations and neighbour lookups per tick and expose them on the state.
Assert budgets on the **counters**, never on wall clock — shared runners make timing
assertions flaky, and a flaky test is worse than no test.

Budget: 500 players / 10k tiles / 1,000 ticks under a committed node-visit ceiling.

```acceptance
npm run lint
npx vitest run tests/sim/perf.test.ts
```

Files: src/sim/counters.ts, src/sim/step.ts, tests/sim/perf.test.ts

---

### 14. 2D debug renderer

`src/render/`: canvas 2D, draws tile ownership by colour from a `SimState`. Read-only —
it must not mutate state or contain any game rule. Plus a minimal `index.html` that
runs the sim locally and draws it.

**This is not throwaway.** It is the permanent desync-forensics tool that draws a
failing replay when a hash mismatch lands.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/render/renderer.test.ts
npm run build
```

Files: src/render/**, index.html, package.json, tests/render/renderer.test.ts

---

### 15. Replay viewer

Load a command log in the browser, step and scrub through it with the 2D renderer, show
the hash tree for the current tick. The first time you can watch a desync instead of
reading about one.

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/render/viewer.test.ts
npm run build
```

Files: src/render/**, index.html, tests/render/viewer.test.ts

---

## Issue template

Every future issue — yours or the weekly planner's — uses this shape:

```markdown
<One paragraph: what to build and why. Link the spec section if relevant.>

```acceptance
<shell commands, one per line, all must exit 0>
```

Files: <comma-separated globs>
```

Two failure modes to avoid when writing them:

**Too big.** If it won't finish in 20 turns, the agent burns a night and the issue
comes back as attempt 2. Symptom: your review takes more than two minutes.

**Acceptance that doesn't discriminate.** `npm test` alone passes on an empty
implementation if no test exists yet. Name the specific test file the work must make
pass — that's what stops the agent from satisfying the letter of the contract.
