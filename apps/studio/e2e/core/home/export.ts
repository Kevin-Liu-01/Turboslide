// A lane module of core/home.spec.ts (docs/LANDING.md 6.1, 6.7; build/integrator.md "Landing,
// day 0" 4.9). Its owner fills it in the push that enters its rows in core-matrix.json: L3, push 6:
// the export seam and its figure (home.export.seam, home.export.figure). Until then it declares no
// test, because `title(id)` throws on an id the matrix does not hold.

/** The rows this module drives. */
export const ROWS: readonly string[] = [];

/** Declares one test per row of ROWS. */
export function rows(): void {}
