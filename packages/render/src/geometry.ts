// Slot geometry from the sheet constants (SPEC 2.1, 5.2; report 03 section 1). The values mirror
// tokens.ts in @turboslide/theme; the theme's CSS parity test guards the CSS side, this file is the
// arithmetic the renderer needs before a browser has measured anything.
import type { ColsRatio, Layout, SlotName } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';

/** The sheet is 1600 by 900 (head:255). */
export const SHEET = { width: 1600, height: 900 } as const;
/** Rails and rules sit 56 px from the edges (head:39-43). */
export const RAIL = 56;
/** The slide box is inset 57 px (head:257). */
export const INSET = 57;
/** Slide padding, top and bottom then left and right (head:257). */
export const PAD = { y: 72, x: 80 } as const;
/** The content box: 1326 by 642 at (137, 129) (DECK-GRAMMAR.md:15). */
export const CONTENT: Box = [
  INSET + PAD.x,
  INSET + PAD.y,
  SHEET.width - 2 * (INSET + PAD.x),
  SHEET.height - 2 * (INSET + PAD.y),
];
/** Column gap of `.cols` (head:83). */
export const COLS_GAP = 72;
/** Wordmark and counter positions (head:51-53). */
export const WORDMARK = { left: 72, bottom: 18, width: 28, height: 18 } as const;
export const COUNTER = { right: 72, bottom: 22 } as const;
/** The two paper chips a full-picture slide paints under the wordmark and the counter (OPENERS.md:47). */
export const CHIPS = [
  { x: 66, y: 858, w: 40, h: 30 },
  { x: 1474, y: 856, w: 60, h: 28 },
] as const;

/** Pixel widths of the two columns of a `cols` layout on the 1326 px content width. */
export function colsWidths(ratio: ColsRatio, gap: number = COLS_GAP): [number, number] {
  const total = CONTENT[2] - gap;
  if (typeof ratio === 'string') {
    const parts = ratio.split('/').map(Number);
    const a = parts[0] ?? 1;
    const b = parts[1] ?? 1;
    const unit = total / (a + b);
    return [unit * a, unit * b];
  }
  if ('left' in ratio) return [ratio.left, total - ratio.left];
  return [total - ratio.right, ratio.right];
}

/** The class and template the deck writes for a ratio (head:83-85, s32:3, s75:3, s77:3). */
export function colsTemplate(ratio: ColsRatio): { className?: string; template?: string } {
  if (ratio === '5/7') return {};
  if (ratio === '1/1') return { className: 'even' };
  if (ratio === '4/8') return { className: 'wide-right' };
  if ('left' in ratio) return { template: `${ratio.left}px minmax(0, 1fr)` };
  return { className: 'even', template: `minmax(0, 1fr) ${ratio.right}px` };
}

/** Boxes of every slot of a layout, in sheet pixels. Heights are the content height. */
export function slotBoxes(layout: Layout): Partial<Record<SlotName, Box>> {
  const [x, y, w, h] = CONTENT;
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [left, right] = colsWidths(layout.ratio, gap);
      return { left: [x, y, left, h], right: [x + left + gap, y, right, h] };
    }
    case 'split': {
      const head = layout.head;
      if (head && head !== 'single') {
        const [left, right] = colsWidths(head.cols);
        return {
          headLeft: [x, y, left, h],
          headRight: [x + left + COLS_GAP, y, right, h],
          body: [x, y, w, h],
        };
      }
      return { head: [x, y, w, h], body: [x, y, w, h] };
    }
    default:
      return { main: [x, y, w, h] };
  }
}

/**
 * Whether a raw diagram's viewBox width was hand-derived from its column (SPEC 9 table: 522, 731
 * or 732, 418, 627, 1326 match a slot; report 03 section 1). The importer uses this to infer
 * `fit: 'slot'`; a width within one pixel of a slot width counts.
 */
export function matchesSlotWidth(width: number, slotWidth: number): boolean {
  return Math.abs(width - slotWidth) <= 1;
}
