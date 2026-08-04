// Deliberately violates every determinism rule banned in `src/sim/**` by
// eslint.config.js. tests/lint-rules.test.ts lints this file's contents under a
// virtual `src/sim/**` path and asserts every violation below is reported.
//
// This file itself lives outside `src/sim/**`, so `npm run lint` does not flag it
// when run normally over the repo.

export function violateEveryDeterminismRule() {
  Math.random();
  Math.sin(0);
  Math.cos(0);
  Math.tan(0);
  Math.pow(2, 3);
  Math.exp(1);
  Math.log(1);
  new Date();
  performance.now();
  setTimeout(() => {}, 0);
  setInterval(() => {}, 0);
  crypto.getRandomValues(new Uint32Array(1));
}
