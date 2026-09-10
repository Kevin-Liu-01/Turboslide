// `.panel`: code on the #101010 panel in white monospace (head:170-172). Text is escaped and `\n`
// becomes `<br>` (s44:66, s57:7, s59:7) unless `pre` keeps the white space (s78:5). The GT word
// transform never runs inside a panel (SPEC 5.2). `term` is the terminal bench of s84:18 with the
// mark at 16 and 32 px beside the command when `marks` is set.
import { classes, el, escapeText } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { dataAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

export function renderPanel(block: BlockOf<'panel'>, ctx: BlockContext): string {
  const code = block.pre ? escapeText(block.code) : escapeText(block.code).split('\n').join('<br>');
  let inner = code;
  if (block.term) {
    const marks = block.marks
      ? `<svg width="25" height="16" aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'mark', true))}><use href="#gt-mark"/></svg><svg width="50" height="32" aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'mark', true))}><use href="#gt-mark"/></svg>`
      : '';
    inner = `${marks}<span>${code}</span>`;
  }
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, {
        className: classes(
          'panel',
          block.size === 15 && 'panel-15',
          block.pre && 'pre',
          block.term && 'term',
        ),
      }),
      'data-run': runAttr(ctx, block.id, 'code'),
    },
    inner,
  );
}
