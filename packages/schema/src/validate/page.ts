// The `page` validator family (gslides-parity SPEC-5 1.2, 6.1): a page outside 120 to 6720 sheet
// pixels or not an integer (the zod schema refuses those), and the deck's guides outside the page
// (the `guides` code's "outside the page" extension; the zod bound is the page cap, this rule is
// the page itself). Answers `Issue[]` for `validateDeck`. The integrator landed the guide bound on
// day 0 (SPEC-5 1.6) because it relaxed `deckGuidesSchema`'s maximum from the sheet to the page
// cap; B4 owns the module from merge 1 (MILESTONES-5 B4 "Owns") with the page sweep.
import type { DeckDocument } from '../deck.ts';
import { deckPage } from '../render.ts';
import type { Issue } from '../validate.ts';

export function validatePage(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  const guides = document.deck.guides;
  if (guides === undefined) return issues;
  const page = deckPage(document.deck);
  const check = (axis: 'x' | 'y', limit: number): void => {
    guides[axis].forEach((at, index) => {
      if (at < 0 || at > limit)
        issues.push({
          code: 'page',
          severity: 3,
          file: 'deck.json',
          pointer: `/guides/${axis}/${index}`,
          message: `Guide at ${at} is outside the page (0 to ${limit} on the ${axis} axis; gslides-parity SPEC-5 6.1)`,
        });
    });
  };
  check('x', page.width);
  check('y', page.height);
  return issues;
}
