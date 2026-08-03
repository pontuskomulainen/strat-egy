# Game spec

The durable description of what is being built. `CLAUDE.md` holds the rules; this holds
the intent. When an acceptance block can't express something ("should feel responsive"),
it belongs here.

## The game

Real-time territory conquest in a browser, no install. Players start with a small
holding and expand into neutral land; territory adjacent to another player becomes a
front line. Reference point: `openfront.io`.

Full information — no fog of war. This matters technically: it is what makes
deterministic lockstep viable, because there is nothing to hide from a client that
already runs the whole simulation.

## Core loop

1. Expand into neutral tiles. Rate is proportional to border length, so wide fronts
   grow faster than narrow ones.
2. Territory generates resources per tick.
3. Spend resources to attack an adjacent player's tiles.
4. Win by holding a target share of the map, or by being the last player standing.

Base building and tech progression (the *War Selection* influence) are **out of scope
until the win condition above is playable end to end.** They are the most tempting
thing in this document and the least load-bearing.

## Simulation model

Fixed timestep, **10 Hz**. `step(state, commands) -> state`, synchronous and pure.
The tick counter is the only clock in the system.

All authoritative quantities are scaled `int32`: tiles in millitiles, resources in
thousandths, time in ticks. No floats anywhere in `src/sim/`.

## Netcode (Phase 3)

Deterministic lockstep with a **dumb intent-relay server**. The server holds zero world
state — it collects commands, stamps them with a tick, and broadcasts. Every client runs
the same simulation.

Chosen because it is the only model where the free hosting tier and the agent's ability
to verify its own work point the same direction: a stateless relay is cheap enough to
run for nothing, and it makes "replay this command log, compare the hash sequence" the
primary correctness gate.

Desync detection: clients exchange the `global` hash every N ticks. Mismatch means dump
the command log and halt loudly. **A silent desync is the worst possible outcome** —
two players in diverged worlds, both convinced they're winning.

## Rendering

2D, canvas/WebGL2. Read-only: the renderer draws state and contains no game rule.

The renderer interpolates between ticks and owns all variable-dt logic. The simulation
never sees a frame rate.

**3D is not a future phase.** See `CLAUDE.md`.

## Scope at zero cost

Provisional, from research track 05, to be re-verified before Phase 3: roughly **30–60
concurrent players** on the Cloudflare Workers free tier, bounded by the WebSocket
connection ratio and Durable Object duration quota rather than by simulation cost.

That estimate is the weakest load-bearing number in the whole plan. Do not build
anything around it until it has been tested with real connections.

## Out of scope, deliberately

Accounts and persistence. Matchmaking beyond a shared room code. Chat. Mobile controls.
Sound. Custom domains. Anything requiring a payment method.
