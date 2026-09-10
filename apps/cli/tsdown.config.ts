import { defineConfig } from 'tsdown';

// Distribution bundle of the CLI (SPEC 3.1: "the turboslide binary (tsdown bundle)").
// Development runs the TypeScript source directly through bin/turboslide.mjs.
export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  dts: false,
});
