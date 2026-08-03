---
name: Agent task
about: A task the autonomous loop can pick up
title: ""
labels: ""
---

<!--
Two sections below are machine-readable. The harness parses them with awk and grep.
If either is missing or malformed, the run fails BEFORE Claude is invoked.

Do not add the agent:ready label until you are happy with the acceptance block.
That label is the trigger.
-->

<!-- One paragraph: what to build and why. Link a docs/SPEC.md section if relevant. -->

```acceptance
npm run lint
npm run typecheck
npx vitest run tests/<the specific test file this work must make pass>
```

Files: src/<area>/**, tests/<area>/**

<!--
Acceptance rules:
- Every command must exit 0. That is the entire definition of done.
- Name a SPECIFIC test file. `npm test` alone passes on an empty implementation.
- Prose criteria go in the paragraph above, never in the acceptance block.

Files rules:
- Comma-separated globs. The harness diffs the branch against these and fails
  the run if the agent strayed outside them.
- Keep it tight. This is blast-radius control, not a convenience list.
-->
