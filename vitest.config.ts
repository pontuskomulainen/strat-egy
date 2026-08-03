import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Deterministic ordering so a failing run is reproducible from the log alone.
    sequence: { shuffle: false },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
      // Thresholds FAIL the run rather than printing — CI invokes
      // `npm run test -- --coverage`. There is no src/ yet, so nothing is
      // measured; the first module to land is measured against these.
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
