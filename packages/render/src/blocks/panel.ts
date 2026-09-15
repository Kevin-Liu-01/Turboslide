// `.panel`: code on the #101010 panel in white monospace (head:170-172). Text is escaped and `\n`
// becomes `<br>` (s44:66, s57:7, s59:7) unless `pre` keeps the white space (s78:5). The GT word
// transform never runs inside a panel (SPEC 5.2). `term` is the terminal bench of s84:18 with the
// mark at 16 and 32 px beside the command when `marks` is set. A panel object of the canvas (a
// block with `pos`) fills its box and its two marks are sized by the box through block-css.ts
// (`mark-s` half the content height, `mark-l` the whole of it, the 16 and 32 of the flow form at
// the box the conversion measured), so a resize handle scales them with the box (build-4/hotfix-4.md
// cause W8); the flow form keeps its fixed sizes byte for byte.
import { classes, el, escapeText } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { dataAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

/** The GT symbol's box (sprite.svg `#gt-mark`): the intrinsic ratio a box sized mark keeps. */
export const MARK_VIEW_BOX = '0 0 1213 771';

export function renderPanel(block: BlockOf<'panel'>, ctx: BlockContext): string {
  const code = block.pre ? escapeText(block.code) : escapeText(block.code).split('\n').join('<br>');
  let inner = code;
  if (block.term) {
    const mark = (w: number, h: number, cls: string): string => {
      const size =
        block.pos === undefined
          ? `width="${w}" height="${h}"`
          : `class="${cls}" viewBox="${MARK_VIEW_BOX}"`;
      return `<svg ${size} aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'mark', true))}><use href="#gt-mark"/></svg>`;
    };
    const marks = block.marks ? mark(25, 16, 'mark-s') + mark(50, 32, 'mark-l') : '';
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
