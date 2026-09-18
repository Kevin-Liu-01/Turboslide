import { FACTS_DATA } from './facts-data';

/**
 * The counts the /home page states (gslides-parity SPEC-4 0.25; MILESTONES-4 "The seams"): the
 * action count, the MCP tool count, the HTTP path count, the layouts, the materials, the check
 * step count and the parity audit row count are written into `packages/theme/brand/facts.json` by
 * `scripts/build-brand.ts --facts` from the tree (B1's file and script) and `brand.test.ts`
 * asserts them against the tree, so a literal count in the page's copy is a defect and every count
 * flows through this module. The page does not import the facts file itself: it carries 141
 * measured rows the page never reads (about 120 KB of JavaScript, measured on the dev server), so
 * `scripts/build-home-assets.ts` copies the values the page needs into `facts-data.ts` with the
 * file's sha256 and `--check` fails when facts.json has moved on. The shape preset count the file
 * still carries is not a fact of this page since the focus round (docs/FOCUS.md section 4: the
 * presets drew as their bounding boxes, so the page states no count of them). The measured numbers
 * of the speed rows and the closing sentence do not come from here: they are quoted with their
 * document and date in `copy.ts` (`MEASURED`) and cross checked against the verifier's JSON by
 * `copy.test.ts`.
 */
export type HomeFacts = {
  actions: number;
  mcpTools: number;
  httpPaths: number;
  layouts: number;
  materials: number;
  checkSteps: number;
  /** every row of the parity audit, passed, failed or skipped */
  parityRows: number;
  /** the worst decoded page mismatch of the Perfect export, in percent (the strip's fourth figure) */
  mismatchPercent: number;
  /** the licence's name (the strip's sixth figure) */
  licence: string;
};

export const COUNT_KEYS: ReadonlyArray<Exclude<keyof HomeFacts, 'mismatchPercent' | 'licence'>> = [
  'actions',
  'mcpTools',
  'httpPaths',
  'layouts',
  'materials',
  'checkSteps',
  'parityRows',
];

/** The keys a facts file must carry as positive integers. */
export const FACT_KEYS = COUNT_KEYS;

/** The repository path of the facts file, for the source lines and the tests. */
export const FACTS_PATH = 'packages/theme/brand/facts.json';

/** The sha256 of the facts file the copy was made from (`--check` compares it with the file). */
export const FACTS_SHA256: string = FACTS_DATA.factsSha256;

/** The facts of the tree, as the build copied them from `packages/theme/brand/facts.json`. */
export const HOME_FACTS: HomeFacts = {
  actions: FACTS_DATA.actions,
  mcpTools: FACTS_DATA.mcpTools,
  httpPaths: FACTS_DATA.httpPaths,
  layouts: FACTS_DATA.layouts,
  materials: FACTS_DATA.materials,
  checkSteps: FACTS_DATA.checkSteps,
  parityRows: FACTS_DATA.parityRows,
  mismatchPercent: FACTS_DATA.mismatchPercent,
  licence: FACTS_DATA.licence,
};

/** A count as the page prints it: digits with a thousands separator, never words. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** The mismatch figure as the strip prints it: the percent with a space before the sign. */
export function formatPercent(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })} %`;
}
