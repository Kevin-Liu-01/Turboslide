import { defineConfig } from 'vitest/config';

// The package runs under the root `packages/*` project list (root vitest.config.ts). Its modules
// import nothing from Node, so the browser handler and the Worker share them; the tests run in
// Node because they exercise pure functions.
export default defineConfig({
  test: {
    name: 'report',
    include: ['src/**/*.test.ts'],
  },
});
