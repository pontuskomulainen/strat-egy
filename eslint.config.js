// @ts-check
//
// Flat config. The determinism rules for `src/sim/**` (no-restricted-globals /
// no-restricted-properties banning Math.random, Date, performance, setTimeout and
// the transcendentals) are NOT here yet — they land with their fixture test in the
// next issue. This file is the toolchain baseline only.

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
);
