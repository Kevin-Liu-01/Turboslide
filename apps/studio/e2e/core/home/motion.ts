// A lane module of core/home.spec.ts (docs/LANDING.md 6.1, 6.7; build/integrator.md "Landing,
// day 0" 4.9). Its owner fills it in the push that enters its rows in core-matrix.json: L4, push 7:
// the hero sequence, the in view motions, rest, reduced motion, the hidden tab, the frame and main
// thread budgets and the keyboard walk (home.motion.hero, home.motion.in-view, home.motion.rest,
// home.motion.reduced, home.motion.hidden-tab, home.budget.frame, home.budget.main-thread,
// home.a11y.keyboard-walk). Until then it declares no test, because `title(id)` throws on an id the
// matrix does not hold.

/** The rows this module drives. */
export const ROWS: readonly string[] = [];

/** Declares one test per row of ROWS. */
export function rows(): void {}
