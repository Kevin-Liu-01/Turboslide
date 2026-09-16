// Slot geometry from the sheet constants (SPEC 2.1, 5.2; report 03 section 1). The values mirror
// tokens.ts in @turboslide/theme; the theme's CSS parity test guards the CSS side, this file is the
// arithmetic the renderer needs before a browser has measured anything. Since round five the
// sheet is the deck's page (gslides-parity SPEC-5 6.1; R08 3c): the constants below are the
// default page's values and `geometry(page)` derives the same values for any page; every function
// takes the page as its last argument and reads the GT sheet when it is absent, so no caller of
// the round one signatures changes behaviour.
import type { ColsRatio, Layout, SlotName } from '@turboslide/schema/deck';
import type { Box, Page } from '@turboslide/schema/render';
import { DEFAULT_PAGE, contentBox } from '@turboslide/schema/render';

/** A page size in sheet pixels (the schema's `Page` without its preset). */
export type PageSize = Pick<Page, 'width' | 'height'>;

/** The default page: the GT sheet, 1600 by 900 (head:255; the schema's DEFAULT_PAGE). */
export const SHEET = { width: 1600, height: 900 } as const;
/** Rails and rules sit 56 px from the edges (head:39-43). */
export const RAIL = 56;
/** The slide box is inset 57 px (head:257). */
export const INSET = 57;
/** Slide padding, top and bottom then left and right (head:257). */
export const PAD = { y: 72, x: 80 } as const;
/** The content box of the default page: 1326 by 642 at (137, 129) (DECK-GRAMMAR.md:15). */
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
/** The two paper chips a full-picture slide paints under the wordmark and the counter on the default page (OPENERS.md:47). */
export const CHIPS = [
  { x: 66, y: 858, w: 40, h: 30 },
  { x: 1474, y: 856, w: 60, h: 28 },
] as const;

export type Chip = { x: number; y: number; w: number; h: number };

/** The two chips of a page: `66, H - 42` and `W - 126, H - 44` (R08 3c), edge relative like the wordmark and the counter. */
export function chipsOf(page: PageSize = DEFAULT_PAGE): [Chip, Chip] {
  return [
    { x: CHIPS[0].x, y: page.height - (SHEET.height - CHIPS[0].y), w: CHIPS[0].w, h: CHIPS[0].h },
    {
      x: page.width - (SHEET.width - CHIPS[1].x),
      y: page.height - (SHEET.height - CHIPS[1].y),
      w: CHIPS[1].w,
      h: CHIPS[1].h,
    },
  ];
}

/** Pixel widths of the two columns of a `cols` layout on a page's content width (1326 px on the default page). */
export function colsWidths(
  ratio: ColsRatio,
  gap: number = COLS_GAP,
  page: PageSize = DEFAULT_PAGE,
): [number, number] {
  const total = contentBox(page)[2] - gap;
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

/** Boxes of every slot of a layout, in sheet pixels on a page. Heights are the content height. */
export function slotBoxes(
  layout: Layout,
  page: PageSize = DEFAULT_PAGE,
): Partial<Record<SlotName, Box>> {
  const [x, y, w, h] = contentBox(page);
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [left, right] = colsWidths(layout.ratio, gap, page);
      return { left: [x, y, left, h], right: [x + left + gap, y, right, h] };
    }
    case 'split': {
      const head = layout.head;
      if (head && head !== 'single') {
        const [left, right] = colsWidths(head.cols, COLS_GAP, page);
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

/** The derived geometry of one page, bound so a renderer reads it without repeating the page. */
export type Geometry = {
  sheet: PageSize;
  /** the content box, `W - 274` by `H - 258` at 137, 129 */
  content: Box;
  chips: [Chip, Chip];
  colsWidths: (ratio: ColsRatio, gap?: number) => [number, number];
  slotBoxes: (layout: Layout) => Partial<Record<SlotName, Box>>;
};

/**
 * The geometry of a page (gslides-parity SPEC-5 6.1; R08 3c): `geometry(SHEET)` states the
 * constants above; `geometry({ width: 1200, height: 900 })` gives the 926 by 642 content box and
 * the chips at 66, 858 and 1074, 856. Every export and the renderer read the deck's page through
 * it; the inch valued constants (rails, inset, padding, wordmark, counter) stay.
 */
export function geometry(page: PageSize = DEFAULT_PAGE): Geometry {
  const size = { width: page.width, height: page.height };
  return {
    sheet: size,
    content: contentBox(size),
    chips: chipsOf(size),
    colsWidths: (ratio, gap = COLS_GAP) => colsWidths(ratio, gap, size),
    slotBoxes: (layout) => slotBoxes(layout, size),
  };
}

/**
 * Whether a raw diagram's viewBox width was hand-derived from its column (SPEC 9 table: 522, 731
 * or 732, 418, 627, 1326 match a slot; report 03 section 1). The importer uses this to infer
 * `fit: 'slot'`; a width within one pixel of a slot width counts.
 */
export function matchesSlotWidth(width: number, slotWidth: number): boolean {
  return Math.abs(width - slotWidth) <= 1;
}
