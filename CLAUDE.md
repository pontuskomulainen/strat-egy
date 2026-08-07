# CLAUDE.md

Harness documentation for `strat-egy`. Everything here is verified against files in
this repo or `gh` output on 2026-08-06. Gaps are marked `TODO: unclear`.

See also: **`docs/HARNESS.md`** — the binding rules this harness enforces (layer
boundaries, determinism rules for `src/sim/**`, agent conduct, settled decisions).
This file is the machinery; that one is the rules.

## 1. What this project is

A browser-based real-time territory-conquest strategy game (`docs/SPEC.md`), built by
an autonomous GitHub Actions loop: a nightly workflow picks the lowest-numbered
`agent:ready` issue, runs Claude Code against the issue body, verifies the result with
shell gates, and opens a PR. `src/` currently holds only `sim/rng.ts` and `sim/hash.ts`.

## 2. Directory layout

| Path | Contents |
|---|---|
| `src/sim/` | `rng.ts` (mulberry32), `hash.ts` (FNV-1a 32) |
| `tests/` | `smoke.test.ts`, `lint-rules.test.ts`, `sim/{rng,hash}.test.ts` |
| `tests/fixtures/` | `sim-determinism-violations.ts` — fixture linted by `lint-rules.test.ts` |
| `.github/workflows/` | `agent.yml`, `ci.yml`, `deadman.yml`, `reset-agent-state.yml` |
| `.github/ISSUE_TEMPLATE/` | `agent-task.md` — the machine-readable issue format |
| `.ratchet/` | `test-count.json` |
| `docs/` | `SPEC.md` — game intent; `HARNESS.md` — the binding rules |
| root | `PLAN.md`, `BACKLOG.md`, `eslint.config.js`, `vitest.config.ts`, `tsconfig.json` |

`src/render/` and `src/net/` do not exist yet. `coverage/` is gitignored.

## 3. Commands

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (flat config; includes the src/sim/** determinism rules)
npm test             # vitest run
npm run test -- --coverage   # what CI runs; thresholds fail the run
```

There is **no build script** and no bundler — `package.json` defines exactly those
three scripts. Node `>=22`, ESM, `moduleResolution: NodeNext` (relative imports need
explicit `.js` extensions).

TODO: unclear — `npm run test:sync` and `npm run replay` are specified in
`docs/HARNESS.md` but are not defined in `package.json`.

## 4. The issue label state machine

Eight harness labels exist (`gh label list`); the nine GitHub defaults (`bug`,
`enhancement`, …) are unused by the harness.

| Label | Meaning |
|---|---|
| `agent:ready` | Eligible for selection. **Selection also requires the issue author to be `OWNER` (`pontuskomulainen`)** — a security control, since an issue body becomes the prompt. |
| `agent:running` | Claimed. Invisible to selection, so a queued run can't take the same issue. |
| `agent:done` | PR opened. The issue is *not* closed by the harness; the PR body says `Closes #N`, so merging closes it. |
| `agent:blocked` | Gave up after 3 attempts. Terminal — no workflow removes it. |
| `agent:alert` | On a *new* issue opened by a failing agent run or by the dead-man's switch, assigned to `OWNER` for a mobile push. |
| `agent:attempt-1/-2/-3` | Attempt counter. Persists across failures; never removed by any workflow. |

Transitions, all in `agent.yml` unless noted:

```
(none) --[you add it]--> agent:ready
agent:ready + attempt-3 present --> agent:blocked   (Attempt guard; comments, then skips the run)
agent:ready --> agent:running + agent:attempt-K     (Claim step; K = 1, or 2 if attempt-1, or 3 if attempt-2)
agent:running --> agent:done                        (Success step)
agent:running --> agent:ready                       (Failure step; attempt label stays, so next run is K+1)
agent:running --> agent:ready                       (reset-agent-state.yml, manual dispatch)
```

Because the attempt guard only fires when `agent:attempt-3` is already present, an
issue is blocked on its **fourth** selection, not its third.

## 5. The workflows

**`ci.yml` — CI.** Triggers on every `pull_request` and on pushes to `main`. Runs
`npm ci`, typecheck, lint, tests with coverage, then five anti-gaming checks, a
`gitleaks` secret scan, and the `frozen paths` review gate. Job id `check` — this is the
required status check on `main` (branch protection: `strict: true`,
`enforce_admins: true`, no force pushes).

**`agent.yml` — Agent loop.** Cron `17 23 * * *` UTC plus `workflow_dispatch`;
`concurrency: agent-loop` with `cancel-in-progress: false`; 25-minute timeout; the
whole job is gated on the repository variable `AGENT_ENABLED == 'true'` (currently
`true`). It preflights (no tokens spent), selects and claims an issue, parses the
contract, runs `anthropics/claude-code-action@v1` with
`--model sonnet --effort medium --max-turns 35 --allowedTools "Read,Edit,Write,Grep,Glob,Bash"`,
then runs Gates 1 and 2 and opens a PR from `agent/issue-N`. Auto-merge is commented
out. Secrets: `CLAUDE_CODE_OAUTH_TOKEN` for Claude; `AGENT_PAT` for the PR (a PR opened
with `github.token` would get no CI checks).

**`deadman.yml` — Dead-man's switch.** Cron `17 6 * * *` UTC plus dispatch; ignores
`AGENT_ENABLED`. Looks up the last *successful* `agent.yml` run; if it is older than
`MAX_SILENCE_HOURS` (36) or never happened, opens one `agent:alert` issue assigned to
`OWNER` — suppressed if an open `agent:alert` issue already matches `in:title silent`.

**`reset-agent-state.yml` — Reset agent state.** Manual dispatch only. Moves every open
`agent:running` issue back to `agent:ready` with a comment; with the `close_prs`
boolean input, also closes open PRs whose head branch starts with `agent/` and deletes
those branches. Writes a ready/running/blocked tally to the job summary.

## 6. The gates

Preflight, in `agent.yml`, before any tokens are spent:

- **API-key assertion** — fails if `ANTHROPIC_API_KEY` is set, or if any workflow file
  other than `agent.yml` mentions it (it would bill per token, not the subscription).
- **Main is green** — fails if the latest `ci.yml` run on `main` concluded `failure`.
- **Review-backlog guard** — if ≥3 open PRs have head branches starting `agent/`, sets
  `SKIP=true` and the run does nothing (a notice, not a failure).
- **Queue empty** — no matching `agent:ready` issue ⇒ `SKIP=true`.
- **Contract extraction** — fails if the issue body has no ```` ```acceptance ```` block
  (parsed with `awk`) or no `Files:` line (parsed with `grep`).

After Claude runs:

- **Commit gate** — `git add -A && git commit || true`; fails if
  `git rev-list --count origin/main..HEAD` is 0 (the agent changed nothing).
- **Gate 1 — acceptance** — `bash -eo pipefail /tmp/acceptance.sh`. Any acceptance
  line exiting non-zero fails the run.
- **Gate 2 — scope** — every path in `git diff --name-only origin/main...HEAD` must
  match at least one comma-separated glob from the `Files:` line (shell `case`
  matching). Any unmatched path prints `OUT OF SCOPE:` and fails.

In `ci.yml`, on top of typecheck/lint/test:

- **Coverage** — `vitest.config.ts` thresholds fail the run: lines/functions/statements
  80%, branches 75%, measured over `src/**/*.ts`.
- **No skipped or focused tests** (PRs only) — greps changed `*.test.*`/`*.spec.*` files
  for `.skip(`, `.todo(`, `.only(`, `xit(`, `xdescribe(`.
- **Test-count ratchet** — fails when actual < floor; counts once, exports the pair.
- **Test-count ratchet floor is current** — fails when actual > floor, naming the value
  to write. Reuses those numbers, counts nothing. The pair forces floor == actual, so
  tests and floor move together. See §7.
- **No-op guard** (PRs only) — fails if every changed path is under `docs/` or
  `.agent/`, ends in `.md`, or matches `lock`. One exemption: a PR in which *every*
  changed file is `.md` passes.
- **Secret scan** — `gitleaks/gitleaks-action@v2`.
- **frozen paths** (PRs only, runs last) — fails when the PR changes `tests/**`,
  `.ratchet/**`, or `.github/workflows/**`, diffed against the PR's base branch
  (`github.base_ref`), not the previous commit. **Not a code failure**: the PR edits
  what decides what CI accepts, so a human reads it before merge. **No exemptions** —
  not by path, author, or label. Last, so other verdicts land first; its own named step
  so an auto-merge job can gate on it. Note it fails inside `check`, the required status
  check — with `enforce_admins: true` that blocks the merge button for admins too.

## 7. The ratchet files

`.ratchet/` contains one file, `test-count.json`, currently `{"count": 17}`. The CI
step reads the floor with `jq -r '.count'` and the actual count with
`npx vitest list | grep -c ' > '`, and the two ratchet steps fail on either side of it,
so **floor must equal actual**: delete a test and the first fails, add one without
raising the floor and the second fails. Raising it is a human edit made in the PR that
adds the test — and `.ratchet/**` is a frozen path, so that PR gets read by a person.
`agent.yml`'s prompt forbids the agent from editing `.ratchet/`.

- Until 2026-08-07 the floor was `{"count": 1}` from the bootstrap commit while
  `vitest list` reported 17, so the ratchet held nothing — 16 tests could have been
  deleted without CI noticing. The floor is now 17 and the second step keeps it honest.
- Nothing platform-side protects the file: `gh api repos/:owner/:repo/rulesets` returns
  `[]` and there is no `CODEOWNERS`. Only `agent.yml`'s prompt and Gate 2's `Files:`
  globs keep the agent out of `.ratchet/` — both inside the loop the agent runs in.
