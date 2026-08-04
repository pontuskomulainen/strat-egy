// @ts-check
//
// Flat config. The determinism rules for `src/sim/**` (no-restricted-globals /
// no-restricted-properties banning Math.random, Date, performance, setTimeout and
// the transcendentals) live in the `src/sim/**`-scoped block below. See
// CLAUDE.md's "Banned in src/sim/**" table for the rationale behind each entry.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // This config file itself is plain JS and is not part of the TS project, so it
  // must not be type-checked by the linter.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Determinism rules — see CLAUDE.md. The simulation core must be a pure,
  // synchronous function of (state, commands). Every entry here is banned because
  // it is either unseedable, wall-clock-derived, asynchronous, or engine-approximated
  // (transcendental Math functions may legitimately differ in the last bit between
  // engines). tests/lint-rules.test.ts asserts each one is actually reported.
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '{{name}} is wall-clock, not the game clock. Use the tick counter.' },
        { name: 'performance', message: '{{name}} is wall-clock, not the game clock. Use the tick counter.' },
        { name: 'setTimeout', message: '{{name}} is asynchronous. The sim core must be synchronous.' },
        { name: 'setInterval', message: '{{name}} is asynchronous. The sim core must be synchronous.' },
        { name: 'crypto', message: '{{name}} is unseedable. Use mulberry32 from src/sim/rng.ts.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Math.random is unseedable. Use mulberry32 from src/sim/rng.ts.' },
        { object: 'Math', property: 'sin', message: 'Math.sin is engine-approximated. Use a precomputed integer lookup table.' },
        { object: 'Math', property: 'cos', message: 'Math.cos is engine-approximated. Use a precomputed integer lookup table.' },
        { object: 'Math', property: 'tan', message: 'Math.tan is engine-approximated. Use a precomputed integer lookup table.' },
        { object: 'Math', property: 'pow', message: 'Math.pow is engine-approximated. Use a precomputed integer lookup table.' },
        { object: 'Math', property: 'exp', message: 'Math.exp is engine-approximated. Use a precomputed integer lookup table.' },
        { object: 'Math', property: 'log', message: 'Math.log is engine-approximated. Use a precomputed integer lookup table.' },
      ],
    },
  },
);
