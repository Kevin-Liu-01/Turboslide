import { defineConfig } from 'vitest/config';

// The chrome's tests: the pure modules (the inspector's control generation, the palette filter,
// the source drawer's Apply path, the schema completion) run in Node; the component tests
// (*.test.tsx) ask for jsdom with a `@vitest-environment jsdom` docblock and use Testing Library
// (AGENTS.md "Tests": a package that needs jsdom adds its own vitest.config.ts and the dependency).
export default defineConfig({
  test: {
    name: 'chrome',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
