# Autonomous build harness — the plan

Written 2026-08-02, from `research/00–07`. Everything here is a decision, not an option.
Where a decision rests on something unverified, it says so and names the run that settles it.

---

## 1. Architecture — decided

### The harness

| | Decision |
|---|---|
| Repo | **Public, day one.** Every free thing below is free *because* it is public. |
| Runner | **GitHub-hosted `ubuntu-latest`.** No VM, no PaaS, no self-hosted runner. |
| Trigger | **`schedule` + `workflow_dispatch` only.** Never `issues`, `issue_comment`, `pull_request`, or `pull_request_target`. |
| Queue | **GitHub Issues + a five-label state machine.** One issue per run. |
| Who holds state | **Bash and `gh`.** Claude selects nothing, claims nothing, judges nothing, merges nothing. It writes code. |
| Definition of done | A fenced ` ```acceptance ` block of shell commands that must all exit 0, plus a `Files:` glob allowlist checked against the diff. |
| Agent auth | `claude_code_oauth_token` from `claude setup-token`. **`ANTHROPIC_API_KEY` never appears anywhere**, asserted in CI. |
| PR auth | `GITHUB_TOKEN` in Phase 1. **GitHub App installation token from Phase 2** — see §3. |
| Alerting | `if: failure()` → `gh issue create --assignee <you>`. Email is backup only. |
| Kill switch | Repo variable `AGENT_ENABLED`, checked by every job. |

### The game

| | Decision |
|---|---|
| Netcode | **Deterministic lockstep with a dumb intent-relay server.** The server holds zero world state and forwards commands per tick. |
| Tick rate | **10 Hz.** Empirical — it's what OpenFront uses. Not hardcoded; read from one constant. |
| Numbers | **Scaled integers (`int32`) for every authoritative quantity.** Millitiles, milliseconds, thousandths. |
| Banned in `src/sim/**` | `Math.random`, `Date`, `performance`, `setTimeout`, `Promise`, `await`, and every transcendental (`sin`/`cos`/`tan`/`pow`/`exp`/`log`). Enforced by ESLint, which is itself a test. |
| Renderer | **2D, canvas/WebGL2. 3D: never.** Not a budget decision — a 2D tile renderer's output is a pure function of game state and therefore checkable in CI. 3D quality is not checkable without a human eye, and an agent that can't verify its own output regresses silently. |
| Client hosting | Static. GitHub Pages. |
| Server hosting | **Cloudflare Workers + Durable Objects, free tier — provisionally.** Re-verify before Phase 3 starts; free tiers move, and this decision is months away from mattering. |

**Why lockstep and not an authoritative server.** Lockstep is the only choice where the free tier and the agent's verifiability point the same direction. A relay server that holds no state is cheap enough to run for nothing, and it makes the simulation the single source of truth — which means "replay this command log and compare the hash sequence" is your primary gate. An authoritative server would be testable too, but you'd lose that property, and you'd be paying to hold state.

**Why 3D is dead and not deferred.** You asked to be argued out of it. Track 05 found OpenFront itself is WebGL2 2D; track 06 found the decisive argument. Calling it "3D later" keeps it alive as a thing you'll drift toward. It's dead.

---

## 2. Operating schedule and token budget — concrete

All cron is **UTC**, which does not observe DST. Finland is UTC+3 in summer (EEST), UTC+2 in winter (EET), so these fire an hour earlier in local time after the late-October changeover. Harmless; know why it happens.

| Run | Cron (UTC) | Local (EEST) | Model | Turns | Timeout |
|---|---|---|---|---|---|
| Build (Phase 1) | `17 23 * * *` | 02:17 | sonnet | `--max-turns 20` | 25 min |
| Build 2 (Phase 2 only) | `17 1 * * *` | 04:17 | sonnet | `--max-turns 20` | 25 min |
| Planner (weekly) | `17 22 * * 6` | Sun 01:17 | sonnet | `--max-turns 10` | 15 min |

Minutes are `:17`, never `:00` — GitHub delays scheduled runs at the top of the hour.

**Both build runs sit inside one rolling five-hour window.** That's the whole point: on Pro, work concentrated in one bucket costs one bucket, work smeared across the day costs several. The bucket you're spending is one you're asleep for.

**Weekly ceiling: 150 turns in Phase 1** (7 × 20, plus 10 for the planner). **206 in Phase 2.** All Sonnet. Opus never appears in a cron job — you invoke it by hand, in chat, when you're stuck on architecture.

**No `--fallback-model` for the first month.** A silent downgrade on exhaustion hides the exact signal you need in order to learn your own envelope. Add it once you know what your weekly ceiling feels like.

**Do not enable the schedule yet.** Phase 1 starts with `workflow_dispatch` only. The cron lines stay commented out in `agent.yml` until you have watched one manual run go green end to end. A cron firing at 02:17 against an untested workflow is how you wake up to forty red PRs.

### Tuning rule

Watch Settings → Usage every morning for two weeks. Then, in this order:
1. Weekly meter comfortably under 50% → raise build turns 20 → 30. **Turn depth is cheaper than run count**, because every new run re-pays the context-loading cost from scratch.
2. Still under 50% after that → add the second nightly run (this is also a Phase 2 gate).
3. Over 85% → cut turns first, drop to every other night second.

---

## 3. Phased build plan

### Phase 0 — manual setup. You, by hand. No agent.

Nothing in this phase involves Claude Code running unattended. You are building the box before you put anything in it.

**Exit criteria — all must be true:**
- [ ] Repo exists, is **public**, has a licence, and `main` is green on a hand-pushed CI run.
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` set as a repo secret. **Calendar reminder set for 11 months out** to rotate it — no first-party TTL is documented, community reports say ~1 year.
- [ ] Repo variable `AGENT_ENABLED` exists and is `false`.
- [ ] The five labels exist: `agent:ready`, `agent:running`, `agent:done`, `agent:blocked`, `agent:alert`.
- [ ] Branch protection on `main`: require the CI check, **and tick "Do not allow bypassing the above settings"** — you are the admin, and this is what stops you hand-merging a red PR from your phone at midnight.
- [ ] Repository-level push protection turned on (it's off by default; the *user*-level one is already on).
- [ ] Auto-merge enabled in repo settings (needed later, one tick now).
- [ ] **Phone notification test passed** — assign yourself an issue, confirm the GitHub mobile app actually pushes. This underpins your entire "steer it from my phone" requirement and nobody verified it.
- [ ] **Baseline usage reading taken** before the agent ever runs. Screenshot Settings → Usage.
- [ ] You have merged one PR yourself, from the phone, to prove the path works.

### Phase 1 — supervised loop. You approve every PR.

Agent runs, opens PRs, and stops. You review and merge. `GITHUB_TOKEN` is fine here because *you* are the merge gate.

**Exit criteria:**
- [ ] 10 consecutive nightly runs completed.
- [ ] **≥7 of those produced a PR that passed every gate with no edits from you.** This is the real number. Below 7 and the loop isn't ready for more autonomy — the fix is smaller issues, not more trust.
- [ ] 0 occasions where you bypassed a gate to merge something.
- [ ] Median review time under 10 minutes. If it's longer, your issues are too big.
- [ ] You can state your own weekly usage percentage from memory.
- [ ] The review-backlog guard has fired at least once and you understood why.

### Phase 2 — autonomous merge on green CI.

**Entry requirement, non-negotiable: a GitHub App installation token replaces `GITHUB_TOKEN` for PR creation.** PRs opened with `GITHUB_TOKEN` get CI runs parked in an approval-required state — a human has to tap Approve before the check even starts. That is not autonomy. `claude-code-action`'s own setup docs walk through creating the App from a manifest.

Also required: the second nightly run only turns on if §2's tuning rule says there's headroom.

**Exit criteria:**
- [ ] 20 PRs auto-merged on green with no intervention.
- [ ] 0 broken-`main` incidents.
- [ ] The dead-man's switch has fired at least once (kill the workflow deliberately to test it) and you noticed within a day.
- [ ] CI on `main` gates whether run 2 fires — once runs auto-merge, run 2 builds on run 1's mistakes with no human checkpoint between them.

### Phase 3 — multiplayer.

**Entry criteria:** sim core stable, N-instance sync green over 10,000 ticks, 2D renderer working, and the Cloudflare free tier re-verified.

**Exit criteria:** two humans on different networks play a complete match to a win condition, in a browser, no install.

### The date that ends this

**1 October 2026.** By then, one of two things is true:

- The harness has autonomously merged **≥30 PRs**. It works. You port it to Kalavire (§8) and this repo becomes a portfolio artifact you maintain lightly.
- It hasn't. The harness doesn't work, and multiplayer is not the fix. You stop, write the retro, and take what you learned to Kalavire anyway.

This date is the anti-hopping mechanism, and it's deliberately your own Q4 boundary. You told me you jump between projects before finishing one; you also told me Kalavire is your quarterly priority and it is currently paused. I'm not relitigating that — you gave a real rationale, and learning the harness is a legitimate goal. But a project with no defined end doesn't get finished, it gets abandoned and re-labelled as a decision. This gives it an end.

---

## 4. Kill switches

Ranked by speed and bluntness. All are web-UI actions; **the GitHub mobile app may not expose Settings pages, so plan on the mobile browser with "Desktop site"** — test this once on a calm day, not during an incident.

1. **`AGENT_ENABLED` → `false`.** ~30 s. Gentlest: an in-flight run finishes, no new ones start. **This is the default response to anything weird.**
2. **Disable the workflow.** Actions tab → workflow → Disable. Kills the schedule too. Gotcha: re-enabling reassigns failure-notification email to whoever re-enabled it.
3. **Cancel the running job.** Only kills the current run.
4. **Delete the `CLAUDE_CODE_OAUTH_TOKEN` secret.** Hardest stop — every run fails loudly. Restoring needs `claude setup-token` on a computer, so this is the "I'm on holiday and something is very wrong" option.
5. **Branch protection.** Blunt on outcomes, useless on compute — the agent keeps burning turns, it just can't merge.

**Clean resume, in this order:** confirm `main` is green → run the "Reset agent state" workflow (one tap) → check nothing is still labelled `agent:running` → *then* flip `AGENT_ENABLED` back. A queued run can fire the instant you re-enable, so state must be clean first.

---

## 5. The 10-minute phone review

Every morning, same order. If you can't finish in ten minutes, your issues are too big — fix that, don't extend the routine.

1. **Assigned tab** (30 s). Any `agent:alert` issue? That's the only thing that can be genuinely urgent.
2. **Settings → Usage** (30 s). Note the weekly percentage. Two weeks of this is worth more than any published number, because Anthropic publishes none.
3. **Open PRs** (5 min). For each: read the *handoff comment*, not the diff. Green check + in-scope files + a handoff that describes what you asked for → merge. Anything else → close it and comment on the issue why.
4. **`agent:blocked`** (2 min). Anything that failed three times. Either rewrite the acceptance block or close it.
5. **Queue depth** (2 min). Fewer than 3 issues labelled `agent:ready`? Promote some from `needs-triage`.

**The one rule:** if you're about to spend more than two minutes on a PR, close it instead. A rejected PR costs one night. A half-understood merge costs a week.

---

## 6. Learning map

| Phase / step | What it actually teaches |
|---|---|
| `git clone`, `switch`, `add`, `commit`, `push` | The only five git commands that matter. Everything else is recovery. |
| `claude setup-token` + repo secret | Credential handling — secrets never live in files, only in the vault. Directly reusable in every job you'll ever have. |
| Making the repo public | Free-tier economics. Why "public" is a technical decision, not a social one. |
| `AGENT_ENABLED` gating | Feature flags and kill switches. The single most transferable ops idea here. |
| The label state machine | Finite state machines, and why state belongs in one place. |
| `acceptance` blocks | The difference between a specification and a wish. This one changes how you write tickets forever. |
| The scope glob check | Blast-radius control. Why "what can this change" is a separate question from "what should it do". |
| `ANTHROPIC_API_KEY` assertion | Defensive programming against your own future mistakes. |
| Deterministic sim core | Purity, referential transparency, and why testable design and good design are the same thing. |
| Per-tick hash tree | Observability. "It broke" vs "the territory subsystem diverged at tick 4,118". |
| fast-check properties | Property-based thinking — asserting invariants instead of examples. Rare and valuable. |
| The GitHub App token (Phase 2) | OAuth, installation tokens, and why identity determines permission. |
| Reading Settings → Usage daily | Capacity planning against an undocumented limit. |

---

## 7. Failure modes this plan actively defends against

- **Accidental API-key billing** — the only unbounded-dollar risk. Asserted twice: env var absent, and `.github/workflows/` grepped for the string.
- **Prompt injection via public issues** — schedule-only triggers plus an `--author` filter. A stranger can open an issue; they cannot make it `agent:ready`, because applying labels needs the Triage role.
- **Tests gamed** — coverage floor, test-count ratchet, `.skip`/`.only` grep, and CODEOWNERS on snapshot directories only. Any test repairable by regenerating its expectation is a ratchet the agent can unratchet.
- **Silent no-op commits** — CI fails a PR whose diff outside docs is empty.
- **Runaway retries** — concurrency group, explicit `timeout-minutes`, `--max-turns`, three-strike attempt guard.
- **Silence** — dead-man's switch opens an issue if no run has succeeded in 36 hours. The worst failure is nothing happening at all.
- **You** — the review-backlog guard. Three or more unreviewed agent PRs and the loop stops queueing work. Zero tokens. This is the one nobody researched and the one most likely to matter.

---

## 8. What transfers to Kalavire

**Transfers directly:**
- The whole harness shell — `agent.yml`, the label state machine, the selection/claim/gate/handoff sequence. Game-agnostic.
- The `acceptance` block + `Files:` glob issue format.
- Every guardrail: API-key assertion, scope check, ratchets, dead-man's switch, `AGENT_ENABLED`, reset workflow.
- The schedule and budget discipline.
- The 10-minute review routine.

**Transfers as a principle, not as code:**
- The deterministic core / renderer split. Kalavire's equivalent is separating pure business logic from the app shell and network calls — same idea, and the same reason: it's what makes the agent able to check itself.
- Property-based testing on invariants.

**Does not transfer:** lockstep netcode, tick hashing, the 2D renderer, map generation. Genuinely game-only.

**The honest read:** roughly 70% of what you build here is a harness you could point at Kalavire in a weekend. That's the actual justification for this project, and it's why §3's October date is the point at which you either collect on it or stop.

---

## 9. Upgrade trigger — Pro → Max 5x

Upgrade when **both** of these hold for **three consecutive weeks**:

1. **The constraint binds.** Settings → Usage weekly meter reads **>80%**, *and* at least two scheduled runs in that period failed or exited early on usage limits.
2. **The loop deserves it.** ≥15 PRs merged per week that passed all gates with no edits from you.

Both conditions, not either. Condition 1 alone means you're spending too much; the fix is fewer turns, not more money. **Condition 2 is the real test — upgrading a loop that doesn't produce mergeable work is just paying more for failure.**

Do not upgrade because a run failed and it felt bad. That's the feeling this criterion exists to override.

---

## 10. Unverified assumptions and the runs that settle them

Nothing here is a blocker; all are things to watch on the first real cycles.

| Assumption | How it gets settled |
|---|---|
| Whether `claude-code-action` commits and pushes on its own, or leaves edits in the working tree | Run 1. `agent.yml` handles both — `git commit` is `|| true` and the real check is commits-ahead-of-main. |
| The error signature on Pro usage-limit exhaustion | The first exhaustion. Record it, then tune the preflight. |
| Whether assigned issues push to the GitHub mobile app | Phase 0, tonight, two minutes. |
| Whether the mobile app can edit repo variables | Test once, calmly. Assume mobile browser. |
| `claude setup-token` TTL | Community says ~1 year. Calendar reminder at 11 months. |
| Whether Durable Objects alarms count against the free request quota | Phase 3. **Do not investigate this now** — it's months away and it is exactly the secondary-detail rabbit hole you flagged as your own failure mode. |
