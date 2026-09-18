import { basename } from 'node:path';

import type { CoreRow } from '../../../../scripts/probes/core-matrix.mjs';
import { coreRow, rowsForDriver } from '../../../../scripts/probes/core-matrix.mjs';

// The core matrix as the core specs read it (docs/FOCUS.md 6.1; the integrator's day 0). One
// module, scripts/probes/core-matrix.mjs, holds every row id of section 6 for the walk probe and
// for these specs; this file is the typed doorway from apps/studio/e2e/core/<area>.spec.ts to it.
// A spec names its rows through `rowsOfSpec(import.meta.filename)` and titles each test with
// `coreTitle(id)`, so the report maps every test back to a matrix id and a row the spec never
// drove is visible as missing, never counted as passed. The rules of 6.1 for a core spec stand:
// no deck seeded from disk, no environment variable but PLAYWRIGHT_BASE_URL and
// VERCEL_OIDC_TOKEN, every deck created from /new by the test and torn down through the product.

export type { CoreFeature, CoreRow, RunResult } from '../../../../scripts/probes/core-matrix.mjs';
export {
  CORE_IDS,
  CORE_MATRIX,
  PROBE_DRIVER,
  coreRow,
  featureOf,
  isCoreId,
  parkedFeaturesOf,
  rowsForDriver,
  rowsForFeature,
  shipVerdict,
} from '../../../../scripts/probes/core-matrix.mjs';

/** The rows whose driver is this spec file: `rowsOfSpec(import.meta.filename)`. */
export function rowsOfSpec(specFile: string): CoreRow[] {
  return rowsForDriver(`core/${basename(specFile)}`);
}

/** The test title of a row: the id first, so the report and the ship note read it back. */
export function coreTitle(id: string): string {
  const row = coreRow(id);
  return `${row.id}: ${row.interaction}`;
}

/** The id at the head of a test title made by `coreTitle`, or null for another title. */
export function idOfTitle(title: string): string | null {
  const head = title.split(':')[0]?.trim() ?? '';
  return head.length > 0 && /^[a-z][a-z0-9]*(?:\.[a-z0-9-]+){1,3}$/.test(head) ? head : null;
}
