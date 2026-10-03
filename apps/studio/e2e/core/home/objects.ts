// A lane module of core/home.spec.ts (docs/LANDING.md 6.1, 6.7; build/integrator.md "Landing,
// day 0" 4.9). Its owner fills it in the push that enters its rows in core-matrix.json: L2, push 2:
// the selection replica on slides 1 and 6, the gestures, the Command row, Google's keys and the
// live module's request (home.hero.select, home.hero.edit, home.canvas.gestures, home.canvas.log,
// home.objects.keyboard, home.budget.live-module). Until then it declares no test, because
// `title(id)` throws on an id the matrix does not hold.

/** The rows this module drives. */
export const ROWS: readonly string[] = [];

/** Declares one test per row of ROWS. */
export function rows(): void {}
