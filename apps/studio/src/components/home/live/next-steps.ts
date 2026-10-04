import { HOME_NEXT_STEPS } from '../loop.generated';
import { registerPainter } from './paint';
import type { HomeDeckState } from './state';

/**
 * Slide 5's two looks the agents band's chips set (docs/LANDING.md 2.9): the title turned to 8
 * degrees and the third row rewritten. V3's file, small enough for the live core: the store carries
 * the looks as `nextSteps` (V2's field, so a version keeps them and a restore puts them back), and
 * `paintNextSteps` draws them on every slide 5 under a root, the page's instances, the show's and
 * the print's clones and any band's markup inserted later (V2's `paintSlide` calls it, v3.md R8).
 * The renderer's own markup restyled (2.0 "Slides"): the title's `rotate`, which composes with
 * any transform a visitor's move wrote, and the row's value text. The module registers the painter
 * with V2's `paintSlide` when it loads (with the agents band's chunk, or the show's). The CLI's render of the same
 * deck is recorded in `home-deck/recorded-chips/next-steps-turned.json`.
 */

export type NextStepsLooks = { turned: boolean; rewritten: boolean };

const SLIDE5 = 'next-steps';

/** The looks the state holds; none before a chip ran. */
export function looksOf(state: HomeDeckState): NextStepsLooks {
  return (
    (state as HomeDeckState & { nextSteps?: NextStepsLooks }).nextSteps ?? {
      turned: false,
      rewritten: false,
    }
  );
}

/** The state with some looks changed. */
export function withLooks(state: HomeDeckState, looks: Partial<NextStepsLooks>): HomeDeckState {
  return { ...state, nextSteps: { ...looksOf(state), ...looks } } as HomeDeckState;
}

/** Draws slide 5's looks on every slide 5 under `root` (and on `root` itself). */
export function paintNextSteps(root: ParentNode, state: HomeDeckState): void {
  const { turned, rewritten } = looksOf(state);
  const value = rewritten ? HOME_NEXT_STEPS.row.after : HOME_NEXT_STEPS.row.before;
  const rotate = turned ? `${HOME_NEXT_STEPS.turnTo}deg` : '';
  const slides = [
    ...root.querySelectorAll<HTMLElement>(`[data-home-slides][data-slide="${SLIDE5}"]`),
  ];
  if (root instanceof HTMLElement && root.matches(`[data-home-slides][data-slide="${SLIDE5}"]`))
    slides.push(root);
  for (const slide of slides) {
    const title = slide.querySelector<HTMLElement>('[data-block="h"]');
    if (title !== null && title.style.rotate !== rotate) title.style.rotate = rotate;
    const cell = slide.querySelector<HTMLElement>(
      `[data-run="rows/items/${HOME_NEXT_STEPS.row.index}/value"]`,
    );
    if (cell !== null && cell.textContent !== value) cell.textContent = value;
  }
}

/* every slide the core draws takes the looks, a band's markup inserted after a chip included
   (V2's paintSlide runs the registered painters after the poses, v2.md's answer to v3.md R8) */
registerPainter(paintNextSteps);
