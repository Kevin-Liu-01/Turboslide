import { test } from '@playwright/test';

import { coverage } from './lib';
import * as agents from './home/agents';
import * as design from './home/design';
import * as exportBand from './home/export';
import * as kits from './home/kits';
import * as menus from './home/menus';
import * as motion from './home/motion';
import * as objects from './home/objects';
import * as page from './home/page';
import * as patterns from './home/patterns';
import * as people from './home/people';
import * as present from './home/present';
import * as tailor from './home/tailor';
import * as versions from './home/versions';

// The driver of the landing's `home.*` rows (docs/LANDING.md 6.1, 6.7; the second pass, 6.4's
// shared file table). V4 owns this file; each lane owns its module under home/ and fills it in the
// push that enters its rows in core-matrix.json, and a module joins MODULES (its import and its
// entry, as the lane's hunk) in the push that first commits it:
//
//   page.ts      V1, pushes 1, 8, 15   the page, the hero and its loop, the budgets, the features
//   objects.ts   V2, pushes 2, 10      the selection replica, the gestures, the keys
//   tailor.ts    V2, pushes 3, 12      Tailor and the filmstrip
//   agents.ts    V3, pushes 4, 13      the agents band, its chips, its console, Version history
//   present.ts   V3, pushes 5, 16      the show and the print
//   export.ts    V3, pushes 6, 17      the seam, the figure, the loupe
//   motion.ts    V4, pushes 7, 9, 18   the motion system, Pause Motion, the interludes, the loops
//   menus.ts     V2, push 11           the miniature editor and its menus
//   kits.ts      V2, push 12           the brand kits and the typed colour
//   versions.ts  V2, push 14           the scrubber and Restore
//   patterns.ts  V4, push 19           the animated patterns band
//   people.ts    V4, push 20           the two people band
//   design.ts    D4, DR-D4#1 to #7     the design round's landing rows (docs/DESIGN.md 8, 11)
//
// Each module exports `ROWS`, the ids it drives, and `rows()`, which declares one test per row with
// `test(title(id), ...)`. A module declares a row's test only in the push that enters the row,
// because `title(id)` throws on an id the matrix does not hold. `coverage` then registers a failing
// test for every row of this driver that no module drives, so a forgotten row reads "no test" and
// is never counted as passed (docs/FOCUS.md 6.1).
//
// The rules of a core spec hold: no fixture, no disk, no environment variable but
// PLAYWRIGHT_BASE_URL and VERCEL_OIDC_TOKEN, every observation through the page and the network,
// retries 0. /home writes no store, so no row needs a teardown.
//
//   PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/home.spec.ts

const MODULES = [
  page,
  objects,
  tailor,
  agents,
  present,
  exportBand,
  motion,
  menus,
  kits,
  versions,
  patterns,
  people,
  design,
] as const;

/* the runner's trace keeps its actions, network and console but not its DOM snapshots or its
   screencast: together they take 2 to 3 ms of the page's main thread a second at rest (read
   2026-10-03 19:15 to 19:25 on home.motion.offscreen's spot: 2.1 to 3.0 ms with them, 0.1 ms with
   --trace off, 0 ms with this setting), which the rows that bound the page's own task time at rest
   would read as the page's */
test.use({
  trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
});

for (const module of MODULES) module.rows();

coverage(
  import.meta.filename,
  MODULES.flatMap((module) => module.ROWS),
);
