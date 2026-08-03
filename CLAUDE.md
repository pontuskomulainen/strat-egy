# CLAUDE.md

Binding rules for every session in this repository. Read fully before editing anything.
Kept under 200 lines deliberately — a diluted rules file stops being followed.

---

## What this repo is

A browser-based real-time territory-conquest strategy game, built almost entirely by
an autonomous agent loop. Reference point: `openfront.io`.

The game is the excuse. **The harness is the point.** Which means: work that cannot be
verified by CI is worth less than work that can, even when it looks more impressive.

## The one rule that generates all the others

**You cannot verify your own work. CI can.**

Every design decision here follows from that. If a change can't be checked by a command
that exits 0 or non-zero, it doesn't belong in this codebase yet.

---

## Layers, and what may touch what

```
src/sim/      pure deterministic simulation    -> imports nothing below
src/render/   2D canvas renderer, read-only    -> imports src/sim/ types only
src/net/      transport (Phase 3)              -> imports src/sim/ types only
tests/        vitest + fast-check
```

- `src/sim/` **must never** import from `src/render/` or `src/net/`.
- `src/render/` **must never** mutate simulation state. It reads and draws. Nothing else.
- All game logic lives in `src/sim/`. If you're writing a rule inside the renderer,
  you're in the wrong file.

## Determinism rules — `src/sim/**`

The simulation is one synchronous pure function: `step(state, commands) -> state`.
Same seed plus same command log must produce a byte-identical state hash sequence,
on any machine, forever. That property is the foundation of every test in this repo.

**Banned in `src/sim/**`** (ESLint enforces this; the rule is a test):

| Banned | Why | Use instead |
|---|---|---|
| `Math.random` | Unseedable; V8 has changed the algorithm twice | `mulberry32` from `src/sim/rng.ts` |
| `Math.sin/cos/tan/pow/exp/log`, `**` | Spec-designated "implementation-approximated" — engines may legitimately differ in the last bit | Precomputed integer lookup tables, committed |
| `Date`, `performance.now` | Wall clock is not a game clock | The tick counter. It is the only clock. |
| `setTimeout`, `Promise`, `await` | The core is synchronous | Nothing. Restructure. |
| Floating-point for authoritative quantities | Avoidable class of bug | **Scaled `int32`** — millitiles, milliseconds, thousandths |
| `for…in`, `Object.keys()` ordering | Plain-object property order is not guaranteed | `Map` / typed arrays, iterate sorted by entity ID |

Two further traps:
- `Map` preserves *insertion* order — delete-and-reinsert moves a key to the end.
  Assign entity IDs from a deterministic counter and sort by ID before any
  order-sensitive pass.
- `Array.prototype.sort` is stable, but a comparator with ties is a desync vector.
  **Always tiebreak on entity ID.**

## State and hashing

State is **structure-of-arrays in typed arrays**, so the per-tick hash is FNV-1a over
the raw buffer — no serialization, no key-order problem.

Emit a **tree** of hashes, never one: `global`, `territory`, `economy`, `units`,
`rngCursor`. "Hash differs" is a useless signal. "Territory diverged at tick 4,118,
economy matched" is a bug report.

Hash the **RNG call counter** into the tree. Desyncs usually begin as "one side drew
one extra number", and that surfaces a tick earlier than the effect does.

---

## Rules for you, the agent

1. **Stay inside the `Files:` globs** on the issue. The harness diffs your branch
   against them and fails the run if you strayed. A file you needed but weren't given
   means the issue is wrong — say so and change nothing.
2. **Never weaken a test to make something pass.** Not `.skip`, not `.only`, not
   deleting an assertion, not `--update-snapshots`. CI greps for all of these.
   If a test is wrong, say so in the handoff and stop.
3. **Never edit** `.github/**`, `.ratchet/**`, `CODEOWNERS`, or the acceptance block
   of any issue.
4. **Never merge, never close an issue, never open a PR.** The harness does that.
5. **Don't re-explore the repo.** The issue names the files. Reading the whole tree
   burns the token budget that the next task needs.
6. **If the task is impossible as specified, change nothing and say why.** A clean
   "this can't be done as written" is a good outcome. A plausible-looking wrong
   implementation is the expensive one.
7. **Write the handoff comment as if you won't be there tomorrow** — because you
   won't. Nothing in your session context survives. What changed, what surprised you,
   what the next person needs to know. Ten lines maximum.

## Definition of done

Not prose. **Every command in the issue's `acceptance` block exits 0**, and the diff
touches only files matching `Files:`.

"Territory capture should feel responsive" is not a definition of done — that belongs
in `docs/SPEC.md`. `npm run typecheck && npx vitest run tests/sim/territory.test.ts`
is one.

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint, includes the determinism rules
npm test              # vitest run
npm run test:sync     # N in-process sim instances, per-tick hash comparison
npm run replay -- <log>   # replay a command log, print the hash sequence
```

## Testing expectations

- Unit tests for behaviour, **fast-check properties for invariants.** Properties worth
  having: replay determinism; conservation (owned + neutral == total, every tick);
  no `NaN`/`Infinity`/negative stock; monotonic tick and ID counters; serialization
  round-trip; **order-independence of same-tick commands from disjoint players**.
- Performance is asserted on **deterministic counters** (node expansions, entity
  iterations), never wall-clock. Shared runners make timing assertions flaky, and a
  flaky test is worse than no test because you will "fix" the wrong thing.
- Everything must run under bare `node`. **If an assertion needs a browser to state
  itself, the logic is in the wrong layer.**

## Things that are decided — do not revisit

- **2D renderer. Not 3D, not ever.** A 2D tile renderer's output is a pure function
  of game state and therefore checkable in CI. 3D quality is not checkable without a
  human eye.
- **Deterministic lockstep**, dumb relay server, 10 Hz tick.
- **Scaled integers**, not floats, for authoritative quantities.
- **Vitest + fast-check.** Not Jest, no `seedrandom` package.

If you think one of these is wrong, write it in the handoff comment. Do not implement
against it.
