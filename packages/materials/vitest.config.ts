import { defineConfig } from 'vitest/config';

// The materials tests run in Node; capture.test.ts drives a browser and skips itself when the
// TURBOSLIDE_SKIP_BROWSER variable is set (the catalog and recipe tests need nothing outside the
// repository).
export default defineConfig({
  test: {
    name: 'materials',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
