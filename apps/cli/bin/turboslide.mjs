#!/usr/bin/env node
// Launcher for the turboslide binary. In the workspace it runs the TypeScript source through
// Node 24's type stripping, so `pnpm exec turboslide` works with no build step; the tsdown
// bundle in dist/ is for distribution. The source uses erasable syntax only (tsconfig.base.json).
// The compile cache keeps the compiled modules on disk between runs (hardening HR-N#3, RUST-6), so
// it is enabled before the source loads, which is why the import is dynamic.
import module from 'node:module';

module.enableCompileCache?.();
await import('../src/main.ts');
