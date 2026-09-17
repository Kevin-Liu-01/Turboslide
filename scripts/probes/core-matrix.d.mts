// Type declarations for core-matrix.mjs (docs/FOCUS.md section 6), for the TypeScript callers:
// the core specs under apps/studio/e2e/core/ through apps/studio/e2e/core/matrix.ts. The module
// itself is plain Node; the declarations describe what it exports and nothing more.

export type CoreFeature =
  | 'decks'
  | 'slides'
  | 'text'
  | 'images'
  | 'arrange'
  | 'shapes'
  | 'lines'
  | 'present'
  | 'share'
  | 'comments'
  | 'versions'
  | 'export'
  | 'help'
  | 'surface';

/** The four words of the audits for what production did on the day the matrix was written. */
export type CoreState = 'works' | 'broken' | 'flaky' | 'not driven';

/** What a run records for a driven row (6.2). */
export type RunResult = 'passed' | 'failed' | 'not driven';

export type CoreSpecDriver =
  | 'core/decks.spec.ts'
  | 'core/slides.spec.ts'
  | 'core/images.spec.ts'
  | 'core/present.spec.ts'
  | 'core/share.spec.ts'
  | 'core/export.spec.ts'
  | 'core/surface.spec.ts';

export type CoreDriver = 'probe --core' | CoreSpecDriver;

/** One row of docs/gslides-parity/focus/core-matrix.json. */
export type CoreRow = {
  /** `area.feature.interaction`, stable */
  readonly id: string;
  /** the section 2 feature the row belongs to; rule 4 of section 1 is computed from it */
  readonly feature: CoreFeature;
  /** what the row drives and checks, with its time bound where the audits measured one */
  readonly interaction: string;
  readonly driver: CoreDriver;
  /** what production did on 2026-09-15 */
  readonly today: CoreState;
  /** the audit row or the file that saw it */
  readonly evidence: string;
  /** on broken and flaky rows alone, as the audits set it */
  readonly severity?: 1 | 2 | 3;
  readonly note?: string;
  /** the orchestrator's ruling (3): the row's only obstacle is the headless browser; the sentence names it and the step is manual-checklist.md's */
  readonly manual?: string;
  /** a window API write made before the driven steps and never counted as one */
  readonly setup?: string;
};

export type Tally = { rows: number } & Record<CoreState, number>;

export const CORE_MATRIX_PATH: string;
export const CORE_FEATURES: readonly CoreFeature[];
export const AREA_FEATURE: Readonly<Record<string, CoreFeature>>;
export const CORE_STATES: readonly CoreState[];
export const RUN_RESULTS: readonly RunResult[];
export const PROBE_DRIVER: 'probe --core';
export const CORE_SPEC_DRIVERS: readonly CoreSpecDriver[];
export const CORE_DRIVERS: readonly CoreDriver[];
export const CORE_ID_PATTERN: RegExp;
export const UNPARKABLE_FEATURE: 'surface';
export const CORE_MATRIX: readonly CoreRow[];
export const CORE_IDS: readonly string[];

export function areaOf(id: string): string;
export function validateCoreMatrix(rows: unknown): CoreRow[];
export function loadCoreMatrix(path?: string): readonly CoreRow[];
export function isCoreId(id: string): boolean;
/** True for a manual row of ruling (3): not driven parks nothing and fails no ship; failed still does. */
export function isManualRow(row: CoreRow | undefined): boolean;
/** The row with the id; a RangeError on an unknown id. */
export function coreRow(id: string): CoreRow;
export function featureOf(id: string): CoreFeature;
export function rowsForFeature(feature: CoreFeature): CoreRow[];
/** The rows of a driver: `probe --core` or a `core/<area>.spec.ts` file name, `core/` optional. */
export function rowsForDriver(driver: string): CoreRow[];
export function probeRows(): CoreRow[];
export function tally(rows?: readonly CoreRow[]): Tally;
export function parkedFeaturesOf(
  results: Readonly<Record<string, RunResult>>,
  rows?: readonly CoreRow[],
): {
  parked: CoreFeature[];
  blocking: Array<{ id: string; result: RunResult }>;
  red: Record<string, Array<{ id: string; result: RunResult }>>;
};
export function shipVerdict(
  results: Readonly<Record<string, RunResult>>,
  parkedFeatures?: readonly CoreFeature[],
  rows?: readonly CoreRow[],
): { ok: boolean; failures: Array<{ id: string; feature: CoreFeature; result: RunResult }> };
/** The committed parked list of a ship, `ship-<commit>.json` (6.2); `surface` is refused. */
export function readParkedList(path: string): {
  commit: string | null;
  parkedFeatures: CoreFeature[];
};
