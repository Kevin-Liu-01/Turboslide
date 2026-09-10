// `composite`: the declared figure grid (SPEC 4.2): `tracks` is the grid template, `gap` the gap in
// pixels, each cell holds blocks and may span columns. A one-track composite with gap 0 groups
// paragraphs so `p + p` spacing applies without the stack gap (s14:6-10); with gap 22 it is the
// deck's `.stack` (s44:12).
import { el, px } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { rootAttrs } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderBlocks } from './render-block.ts';

export function renderComposite(block: BlockOf<'composite'>, ctx: BlockContext): string {
  const single = /^(1fr|minmax\(0,\s*1fr\)|100%)$/.test(block.tracks.trim());
  const cellWidth = single ? ctx.slotWidth : undefined;
  // A cell with one block and no span is that block: the block root is the grid item, so sibling
  // rules such as `p + p` and a residual `align-self` on the block apply as they did in the deck.
  const cells = block.cells
    .map((cell) => {
      const inner = renderBlocks(cell.blocks, { ...ctx, slotWidth: cellWidth });
      if (cell.blocks.length === 1 && cell.span === undefined) return inner;
      return el(
        'div',
        {
          class: 'cell',
          style: cell.span !== undefined ? `grid-column:span ${cell.span}` : undefined,
        },
        inner,
      );
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: 'composite',
      style: `grid-template-columns:${block.tracks};gap:${px(block.gap ?? 22)}px`,
    }),
    cells,
  );
}
