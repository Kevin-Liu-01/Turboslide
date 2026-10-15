import { test } from '@playwright/test';

import { coverage } from './lib';
import * as site from './home/site';

// The driver of the landing's `home.*` rows (docs/SITE.md, the site build of 2026-10-14; the
// Workbench layout replaced the landing of docs/LANDING.md and its 84 rows, retired from
// core-matrix.json in the same commit). Each module under home/ exports `ROWS`, the ids it
// drives, and `rows()`, which declares one test per row with `test(title(id), ...)`; `coverage`
// registers a failing test for every row of this driver no module drives, so a forgotten row
// reads "no test" and is never counted as passed (docs/FOCUS.md 6.1). The hero step's module of
// the live editor joins MODULES in the push that enters its rows.
//
//   site.ts   the landing step: the layout, the title and its stacks, the poster, the script
//
// The rules of a core spec hold: no fixture, no disk, no environment variable but
// PLAYWRIGHT_BASE_URL and VERCEL_OIDC_TOKEN, every observation through the page and the network,
// retries 0. /home writes no store, so no row needs a teardown.
//
//   PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/home.spec.ts

const MODULES = [site] as const;

test.use({
  trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
});

for (const module of MODULES) module.rows();

coverage(
  import.meta.filename,
  MODULES.flatMap((module) => module.ROWS),
);
