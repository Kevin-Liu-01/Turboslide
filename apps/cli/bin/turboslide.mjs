#!/usr/bin/env node
// Launcher for the turboslide binary. In the workspace it runs the TypeScript source through
// Node 24's type stripping, so `pnpm exec turboslide` works with no build step; the tsdown
// bundle in dist/ is for distribution. The source uses erasable syntax only (tsconfig.base.json).
import '../src/main.ts';
