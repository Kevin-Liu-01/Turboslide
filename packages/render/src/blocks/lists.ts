// Ruled rows and lists instead of bullets (SPEC 2.1; head:96-107): rows, plain, refs, say.
import { classes, el, style } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { iconSvg, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

/**
 * `.rows`: a top hairline, then one grid row per item with the key in `<b>` and the value in a
 * span (head:96-99). `--key` is written inline unless it is the default 240 or `.narrow`'s 180
 * (head:100). Icons sit in the key cell at 20 px (head:117-118). In a table where other keys
 * carry icons, a key without one gets the icon's 30 px indent so the labels align (s14:8).
 */
export function renderRows(block: BlockOf<'rows'>, ctx: BlockContext): string {
  const narrow = block.key === 180;
  const keyStyle = block.key === 240 || narrow ? undefined : `--key:${block.key}px`;
  const mixedIcons =
    block.items.some((item) => item.icon !== undefined) &&
    block.items.some((item) => item.icon === undefined);
  const rows = block.items
    .map((item, index) => {
      const icon = item.icon ? iconSvg(item.icon, ctx, block.id) : '';
      const key = el(
        'b',
        {
          class: mixedIcons && !item.icon ? 'no-ic' : undefined,
          'data-run': runAttr(ctx, block.id, `items/${index}/key`),
        },
        icon + renderText(item.key, { gtWord: ctx.gtWord }),
      );
      const value = el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/value`) },
        renderText(item.value, { gtWord: ctx.gtWord, linkGlyph: block.links === true }),
      );
      return el(
        'div',
        { style: block.minRowHeight ? `min-height:${block.minRowHeight}px` : undefined },
        key + value,
      );
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'rows',
        narrow && 'narrow',
        block.tight && 'tight',
        block.links && 'links',
      ),
      style: keyStyle,
    }),
    rows,
  );
}

/**
 * `.plain`: a ruled statement list at 24 px display weight 500 (head:102-105); an icon at the
 * start of a row is 24 px with a 36 px hanging indent (head:119-120); `.no` strikes a row. The
 * 22 px and 20 px sizes are the slide-level overrides of s73:5 and s84:8-11.
 */
export function renderPlain(block: BlockOf<'plain'>, ctx: BlockContext): string {
  const items = block.items
    .map((item, index) => {
      const icon = item.icon ? iconSvg(item.icon, ctx, block.id) : '';
      return el(
        'span',
        {
          class: item.no ? 'no' : undefined,
          'data-run': runAttr(ctx, block.id, `items/${index}/text`),
        },
        icon + renderText(item.text, { gtWord: ctx.gtWord }),
      );
    })
    .join('');
  const size = block.size ?? 24;
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('plain', size !== 24 && `plain-${size}`),
    }),
    items,
  );
}

/** `.refs`: a two-column reference list with soft rules (head:106-107; s71:11-17). */
export function renderRefs(block: BlockOf<'refs'>, ctx: BlockContext): string {
  const items = block.items
    .map((item, index) =>
      el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `items/${index}`) },
        renderText(item, { gtWord: ctx.gtWord }),
      ),
    )
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'refs' }), items);
}

/**
 * `say`: two registers as ruled rows, the form slide 12 gives the block (s12:3-8): the note in a
 * titanium 18 px key with an ok or no icon, the quote at 27 px display, struck when `no`. The
 * head.html `.say` grid (head:164-168) is unused by the deck, so the block renders as `.rows.ex`
 * and its rules live in block-css.ts.
 */
export function renderSay(block: BlockOf<'say'>, ctx: BlockContext): string {
  const rows = block.items
    .map((item, index) => {
      const icon = iconSvg(
        item.no ? { name: 'x-circle', color: 'no' } : { name: 'check-circle', color: 'ok' },
        ctx,
        block.id,
      );
      const note = item.note ?? (item.no ? 'Not acceptable' : 'Acceptable');
      const key = el(
        'b',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/note`) },
        icon + renderText(note, { gtWord: ctx.gtWord }),
      );
      const quote = el(
        'span',
        {
          class: classes('q', item.no && 'no'),
          'data-run': runAttr(ctx, block.id, `items/${index}/quote`),
        },
        renderText(item.quote, { gtWord: ctx.gtWord }),
      );
      return el('div', {}, key + quote);
    })
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'rows ex', style: style() }), rows);
}
