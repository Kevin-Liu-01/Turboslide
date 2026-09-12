// `composite`: the declared figure grid (SPEC 4.2, M5): `tracks` is the grid template, `gap` the
// gap in pixels, `justify` the track distribution, `align` the cross-axis alignment, each cell
// holds blocks and may span columns. A one-track composite with gap 0 groups paragraphs so `p + p`
// spacing applies without the stack gap (s14:6-10); with gap 22 it is the deck's `.stack`
// (s44:12); a fixed-track grid with `justify: 'space-between'` is the example row of s25:8; a
// composite with a `caption` is a figure whose figcaption follows the cells (s67:6, s84:16), in the
// form of the shot figure so the 16 and 15 px caption rules apply. Every cell learns its width in
// sheet pixels from the track arithmetic (schema blocks/composite.ts), so a slot-fit diagram or a
// nested composite sizes itself the way it would in a slot.
import { classes, el, px, style } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { cellWidths, COMPOSITE_DEFAULT_GAP } from '@turboslide/schema/blocks/composite';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderTextOrPrompt } from './prompt.ts';
import { renderBlocks } from './render-block.ts';

export function renderComposite(block: BlockOf<'composite'>, ctx: BlockContext): string {
  const gap = block.gap ?? COMPOSITE_DEFAULT_GAP;
  const widths = cellWidths(block, ctx.slotWidth);
  // A cell with one block and no span is that block: the block root is the grid item, so sibling
  // rules such as `p + p` and a residual `align-self` on the block apply as they did in the deck.
  const cells = block.cells
    .map((cell, index) => {
      const width = widths[index];
      const inner = renderBlocks(cell.blocks, {
        ...ctx,
        ...(width !== undefined ? { slotWidth: width } : { slotWidth: undefined }),
      });
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
  const caption = block.caption
    ? el(
        'figcaption',
        { 'data-run': runAttr(ctx, block.id, 'caption'), style: 'grid-column:1 / -1' },
        renderTextOrPrompt(block.caption, ctx, block, '/caption'),
      )
    : '';
  const attributes = rootAttrs(block, ctx, {
    className: classes(
      'composite',
      block.caption !== undefined && 'shot-fig',
      block.caption !== undefined && block.captionSize === 15 && 'cap-15',
    ),
    style: style(
      `grid-template-columns:${block.tracks}`,
      `gap:${px(gap)}px`,
      block.justify !== undefined &&
        block.justify !== 'start' &&
        `justify-content:${block.justify}`,
      block.align !== undefined && block.align !== 'stretch' && `align-items:${block.align}`,
    ),
  });
  return el(block.caption !== undefined ? 'figure' : 'div', attributes, cells + caption);
}
