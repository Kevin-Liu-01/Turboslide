import { defineConfig } from 'vitest/config';

// The viewer's tests cover its pure modules (fit math, hash, keys, dither)
// in Node; the React components are exercised by apps/studio/e2e in a real
// browser, so no jsdom dependency is needed here.
export default defineConfig({
  test: {
    name: 'viewer',
    include: ['src/**/*.test.ts', 'standalone/**/*.test.ts'],
    environment: 'node',
  },
});
