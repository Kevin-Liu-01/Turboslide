// Type declarations for core-matrix.mjs (docs/FOCUS.md section 6; docs/RETURN.md section 5;
// docs/PRODUCT.md section 8; docs/VECTOR.md section 6 for the svg feature and the menus area), for
// the TypeScript callers: the core specs under apps/studio/e2e/core/ through
// apps/studio/e2e/core/matrix.ts. The module itself is plain Node; the declarations describe what
// it exports and nothing more.

export type CoreFeature =
  | 'decks'
  | 'slides'
  | 'text'
  | 'images'
  | 'arrange'
  | 'shapes'
  | 'lines'
  | 'tables'
  | 'charts'
  | 'diagrams'
  | 'wordart'
  | 'formatting'
  | 'present'
  | 'share'
  | 'comments'
  | 'versions'
  | 'export'
  | 'help'
  | 'chrome'
  | 'view'
  | 'inbox'
  | 'brand'
  | 'fonts'
  | 'templates'
  | 'assist'
  | 'sync'
  | 'cost'
  | 'logos'
  | 'svg'
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
  | 'core/surface.spec.ts'
  | 'core/documents.spec.ts'
  | 'core/chrome.spec.ts'
  | 'core/brand.spec.ts'
  | 'core/assist.spec.ts'
  | 'core/sync.spec.ts'
  | 'core/logos.spec.ts'
  | 'core/svg.spec.ts';

/** The cost probe of docs/SYNC.md 6.3 (scripts/probes/sync-cost-probe.mjs), run by the gate. */
export type CostProbeDriver = 'cost-probe';

export type CoreDriver = 'probe --core' | CoreSpecDriver | CostProbeDriver;

/** One row of docs/gslides-parity/focus/core-matrix.json. */
export type CoreRow = {
  /** `area.feature.interaction`, stable */
  readonly id: string;
  /** the feature the row belongs to; rule 4 of section 1 and RETURN.md rule 2 are computed from it */
  readonly feature: CoreFeature;
  /** what the row drives and checks, with its time bound where the audits measured one */
  readonly interaction: string;
  readonly driver: CoreDriver;
  /** what production did on the day the row was written (2026-09-15, or 2026-09-18 for the return round's rows) */
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
  /**
   * docs/RETURN.md section 1 rule 2: the data-control ids this row alone guards. A red row with
   * `parks` keeps those ids behind the Advanced tools switch for the ship and neither parks its
   * feature nor blocks the ship.
   */
  readonly parks?: readonly string[];
  /**
   * docs/PRODUCT.md 8.2: a measurement row records its number (the seconds per slide of a large
   * deck export) in the run and never holds the ship; a red one is written into the ship note by
   * id with its mechanism. On a cost row (docs/SYNC.md 6.1) the counts are recorded beside the
   * ceiling and the row holds the ship only over its ceiling on the preview.
   */
  readonly measure?: true;
};

export type Tally = { rows: number } & Record<CoreState, number>;

/** A row of the parked list whose own controls stay parked (RETURN.md rule 2). */
export type ParkedRow = { id: string; parks: string[] };

/** The committed parked list of a ship, `ship-<commit>.json`. */
export type ParkedList = {
  commit: string | null;
  parkedFeatures: CoreFeature[];
  parkedRows: ParkedRow[];
};

export const CORE_MATRIX_PATH: string;
export const CORE_FEATURES: readonly CoreFeature[];
export const AREA_FEATURE: Readonly<Record<string, CoreFeature>>;
/** The rows whose feature is not their id's area (docs/FEATURES.md 7.1): the export and URL intake rows of the logos area. */
export const ROW_FEATURE: Readonly<Record<string, CoreFeature>>;
export const CORE_STATES: readonly CoreState[];
export const RUN_RESULTS: readonly RunResult[];
export const PROBE_DRIVER: 'probe --core';
export const COST_PROBE_DRIVER: 'cost-probe';
export const CORE_SPEC_DRIVERS: readonly CoreSpecDriver[];
export const CORE_DRIVERS: readonly CoreDriver[];
export const CORE_ID_PATTERN: RegExp;
export const CONTROL_ID_PATTERN: RegExp;
/** The sources `parks` ids are validated against (model.ts, toolbar-tails.ts, TitleRow.tsx, the panels and pages of PRODUCT.md 7.1). */
export const CONTROL_SOURCE_PATHS: readonly string[];
/** The control ids docs/PRODUCT.md 7.1 declares before the lanes' files exist; a `parks` id here is known. */
export const DECLARED_CONTROL_IDS: readonly string[];
/** The features a red row cannot park: a red row of one blocks the ship unless it carries `parks`. */
export const UNPARKABLE_FEATURES: readonly CoreFeature[];
/** The focus round's one unparkable feature, kept for the callers that named it. */
export const UNPARKABLE_FEATURE: 'surface';
export const CORE_MATRIX: readonly CoreRow[];
export const CORE_IDS: readonly string[];

export function areaOf(id: string): string;
export function validateCoreMatrix(rows: unknown): CoreRow[];
export function loadCoreMatrix(path?: string): readonly CoreRow[];
export function isCoreId(id: string): boolean;
/** True for a manual row of ruling (3): not driven parks nothing and fails no ship; failed still does. */
export function isManualRow(row: CoreRow | undefined): boolean;
/** True for a measurement row (PRODUCT.md 8.2): red parks nothing and fails no ship; the ship note carries it. */
export function isMeasureRow(row: CoreRow | undefined): boolean;
/** True for a row of the cost probe (docs/SYNC.md 6.1, 6.3). */
export function isCostRow(row: CoreRow | undefined): boolean;
/** True for a feature a red row can park. */
export function isParkable(feature: string): boolean;
/** True when the id appears as a string literal in one of the control sources. */
export function isKnownControl(id: string): boolean;
/** The row with the id; a RangeError on an unknown id. */
export function coreRow(id: string): CoreRow;
export function featureOf(id: string): CoreFeature;
export function rowsForFeature(feature: CoreFeature): CoreRow[];
/** The rows of a driver: `probe --core` or a `core/<area>.spec.ts` file name, `core/` optional. */
export function rowsForDriver(driver: string): CoreRow[];
export function probeRows(): CoreRow[];
/** The rows the cost probe drives (docs/SYNC.md 6.3). */
export function costRows(): CoreRow[];
export function tally(rows?: readonly CoreRow[]): Tally;
export function parkedFeaturesOf(
  results: Readonly<Record<string, RunResult>>,
  rows?: readonly CoreRow[],
): {
  parked: CoreFeature[];
  parkedRows: Array<ParkedRow & { result: RunResult }>;
  blocking: Array<{ id: string; feature: CoreFeature; result: RunResult }>;
  /** the red measurement rows, recorded and not counted (PRODUCT.md 8.2) */
  measured: Array<{ id: string; feature: CoreFeature; result: RunResult }>;
  red: Record<string, Array<{ id: string; result: RunResult }>>;
};
export function shipVerdict(
  results: Readonly<Record<string, RunResult>>,
  parked?: readonly CoreFeature[] | Partial<ParkedList>,
  rows?: readonly CoreRow[],
): {
  ok: boolean;
  failures: Array<{ id: string; feature: CoreFeature; result: RunResult }>;
  /** the red measurement rows the verdict recorded and did not count */
  measured: Array<{ id: string; feature: CoreFeature; result: RunResult }>;
};
/** The committed parked list of a ship, `ship-<commit>.json` (6.2); an unparkable feature is refused. */
export function readParkedList(path: string): ParkedList;
/** B1's module packages/chrome/src/parked-controls.ts, whose set `--emit-parked` writes (docs/FEATURES.md 7.2). */
export const PARKED_CONTROLS_PATH: string;
export const PARKED_BEGIN: string;
export const PARKED_END: string;
/** The control ids a ship's parked list keeps behind the switch through the module: the union of its parkedRows' parks, sorted. */
export function parkedControlsOf(list: readonly CoreFeature[] | Partial<ParkedList>): string[];
/** The lines written between the module's markers for a set and the ship it came from. */
export function renderParkedSet(controls: readonly string[], commit: string | null): string;
/** The module's text with its set replaced; throws when the markers are absent or doubled. */
export function spliceParkedSet(source: string, rendered: string): string;
/** The `--emit-parked` step: writes (or with check compares) the module's set from a ship's parked list. */
export function emitParked(
  listPath: string,
  options?: { out?: string; check?: boolean },
): { controls: string[]; changed: boolean; path: string; commit: string | null };
