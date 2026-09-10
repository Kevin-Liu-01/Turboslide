// `.scales` slider rows (head:123-129; s11): 150 px labels, a hairline track, an 11 px ink marker at
// `left: value%` derived from the value so the marker cannot disagree with it (DECK-GRAMMAR.md:61).
import { classes, el } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

export function renderScales(block: BlockOf<'scales'>, ctx: BlockContext): string {
  const rows = block.items
    .map((item, index) => {
      const left = el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/left`) },
        renderText(item.left, { gtWord: ctx.gtWord }),
      );
      const bar = el('div', { class: 'bar' }, `<i style="left:${item.value}%"></i>`);
      const right = el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/right`) },
        renderText(item.right, { gtWord: ctx.gtWord }),
      );
      return el('div', { class: 'scale' }, left + bar + right);
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, { className: classes('scales', block.centerTick && 'center-tick') }),
    rows,
  );
}
