// The renderer's block CSS as a page's head carries it (apps/studio/src/routes/__root.tsx): the
// rules of block-css.ts without their comments. The comments are 10,655 of the 29,310 bytes the
// head inlined on every page, /home among them, whose document has a 100,000 B line
// (docs/DESIGN.md 8.16; build/d4.md request to the integrator). The render documents (deck.ts,
// print.ts, standalone.ts) keep BLOCK_CSS as it is. No comment in BLOCK_CSS sits inside a string
// or between two tokens with no space beside it, so dropping each one changes no rule; the test
// pins both.
import { BLOCK_CSS } from './block-css.ts';

/** CSS with every comment removed and the blank lines they leave folded into one line break. */
export function withoutCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');
}

/** BLOCK_CSS for a page's head: the same rules, no comments. */
export const PAGE_BLOCK_CSS = withoutCssComments(BLOCK_CSS);
