import { coverage } from './lib';
import * as agents from './home/agents';
import * as exportBand from './home/export';
import * as motion from './home/motion';
import * as objects from './home/objects';
import * as page from './home/page';
import * as present from './home/present';
import * as tailor from './home/tailor';

// The driver of the landing's `home.*` rows (docs/LANDING.md 6.1, 6.7; build/integrator.md
// "Landing, day 0" 4.9 and 5.1). L4 owns this file; each lane owns its module under home/ and
// fills it in the push that enters its rows in core-matrix.json:
//
//   page.ts     L1, push 1       the still page, the budgets, the skip link and the contrast
//   objects.ts  L2, push 2       the selection replica, the gestures, the keys, the live module
//   tailor.ts   L2, push 3       Tailor, the example kits, the filmstrip
//   agents.ts   L3, push 4       the recorded run, the typed line, the transports, Version history
//   present.ts  L3, push 5       the show and the print
//   export.ts   L3, push 6       the seam and the figure
//   motion.ts   L4, push 7       the hero sequence, the in view motions, rest, reduced motion
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

const MODULES = [page, objects, tailor, agents, present, exportBand, motion] as const;

for (const module of MODULES) module.rows();

coverage(
  import.meta.filename,
  MODULES.flatMap((module) => module.ROWS),
);
