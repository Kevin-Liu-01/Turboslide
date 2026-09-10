import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'import',
    include: ['src/**/*.test.ts'],
  },
});
