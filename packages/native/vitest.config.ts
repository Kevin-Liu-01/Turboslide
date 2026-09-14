import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `cd packages/native && ../../node_modules/.bin/vitest run`
// runs this package alone; the root `pnpm test` still picks it up through the packages/* glob.
export default defineConfig({
  test: {
    name: 'native',
    include: ['src/**/*.test.ts'],
  },
});
