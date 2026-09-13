// Ruled rows and lists instead of bullets (SPEC 2.1; head:96-107): rows, plain, refs, say.
import { classes, el, px, style } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import type { BulletPreset, NumberPreset } from '@turboslide/schema/text';
import {
  BULLET_PRESETS,
  LIST_LEVEL_MAX,
  NUMBER_PRESETS,
  bulletGlyph,
  listNumerals,
} from '@turboslide/schema/text';
import { iconSvg, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderTextOrPrompt } from './prompt.ts';

/** The hanging indent of a numbered item: the icon's 24 px plus its 12 px margin (head:119-120). */
export const NUMERAL_INDENT = 36;

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
        icon + renderTextOrPrompt(item.key, ctx, block, `/items/${index}/key`),
      );
      const value = el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/value`) },
        renderTextOrPrompt(item.value, ctx, block, `/items/${index}/value`, {
          gtWord: ctx.gtWord,
          linkGlyph: block.links === true,
        }),
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
  if (block.marker === 'bullet' || block.marker === 'number') return renderMarkedPlain(block, ctx);
  const numbered = block.numbered === true;
  const items = block.items
    .map((item, index) => {
      const icon = item.icon ? iconSvg(item.icon, ctx, block.id) : '';
      const text = el(
        'span',
        {
          class: item.no ? 'no' : undefined,
          'data-run': runAttr(ctx, block.id, `items/${index}/text`),
        },
        icon + renderTextOrPrompt(item.text, ctx, block, `/items/${index}/text`),
      );
      if (!numbered) return text;
      // A numbered list (gslides-parity SPEC 7.2.6): a tabular numeral in the key position where
      // the icon sits, outside the Text's carrier so the inline editor never reads it as copy;
      // data-num names it for the exporter, which writes it as its own run (scene/measure.ts).
      const numeral = el(
        'span',
        { class: 'num', 'data-num': ctx.blockAttrs ? `${block.id}/items/${index}` : undefined },
        String(index + 1),
      );
      return el('span', { class: 'item' }, numeral + text);
    })
    .join('');
  const size = block.size ?? 24;
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('plain', size !== 24 && `plain-${size}`, numbered && 'numbered'),
    }),
    items,
  );
}

/** A list level clamped to 1 to 9 (SPEC-2 0.58). */
function levelOf(level: number | undefined): number {
  return Math.min(LIST_LEVEL_MAX, Math.max(1, Math.round(level ?? 1)));
}

/** The glyph or numeral of every item of a marked list, by preset and level (SPEC-2 2.2.12, 2.2.13). */
export function listMarkers(block: BlockOf<'plain'>): string[] {
  const levels = block.items.map((item) => levelOf(item.level));
  if (block.marker === 'number') {
    const preset: NumberPreset =
      block.preset !== undefined && (NUMBER_PRESETS as ReadonlyArray<string>).includes(block.preset)
        ? (block.preset as NumberPreset)
        : 'digit-alpha-roman';
    return listNumerals(preset, levels);
  }
  const preset: BulletPreset =
    block.preset !== undefined && (BULLET_PRESETS as ReadonlyArray<string>).includes(block.preset)
      ? (block.preset as BulletPreset)
      : 'disc-circle-square';
  return levels.map((level) => bulletGlyph(preset, level));
}

/**
 * Google's bulleted and numbered list (gslides-parity SPEC-2 2.2.12, 2.2.13, 0.58, 0.59): one
 * `.item` grid per item with the glyph or numeral in the 36 px key position (`.num[data-num]`,
 * outside the Text's carrier so the inline editor never reads it as copy and the exporter writes
 * it as its own run), indented 36 px per level below the first, the preset's three forms cycling
 * from level 4. The round one `numbered: true` form is untouched (renderPlain draws it).
 */
function renderMarkedPlain(block: BlockOf<'plain'>, ctx: BlockContext): string {
  const markers = listMarkers(block);
  const items = block.items
    .map((item, index) => {
      const level = levelOf(item.level);
      const icon = item.icon ? iconSvg(item.icon, ctx, block.id) : '';
      const text = el(
        'span',
        {
          class: item.no ? 'no' : undefined,
          'data-run': runAttr(ctx, block.id, `items/${index}/text`),
        },
        icon + renderTextOrPrompt(item.text, ctx, block, `/items/${index}/text`),
      );
      const glyph = el(
        'span',
        {
          class: classes('num', block.marker === 'bullet' && 'glyph'),
          'data-num': ctx.blockAttrs ? `${block.id}/items/${index}` : undefined,
        },
        markers[index] ?? '',
      );
      return el(
        'span',
        {
          class: 'item',
          'data-level': level > 1 ? String(level) : undefined,
          style: level > 1 ? `padding-left:${px((level - 1) * NUMERAL_INDENT)}px` : undefined,
        },
        glyph + text,
      );
    })
    .join('');
  const size = block.size ?? 24;
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'plain',
        size !== 24 && `plain-${size}`,
        'marked',
        block.marker === 'bullet' ? 'bulleted' : 'numbered',
      ),
      'data-marker': block.marker,
      'data-preset': block.preset,
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
        renderTextOrPrompt(item, ctx, block, `/items/${index}`),
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
