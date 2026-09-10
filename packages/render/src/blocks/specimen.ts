// The specimen blocks (head:131-154): spec, lang, ladder, swatches.
import { classes, el, escapeText } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

/** `.spec`: one 58 px row per weight with the weight in a 90 px small column (head:133-134; s19). */
export function renderSpec(block: BlockOf<'spec'>, ctx: BlockContext): string {
  const names: Record<number, string> = {
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semibold',
    700: 'Bold',
    800: 'Extrabold',
  };
  const rows = block.weights
    .map((weight) =>
      el(
        'div',
        { class: 'w', style: `font-weight:${weight}` },
        `<small>${weight}</small>${escapeText(`${block.sample} ${names[weight] ?? weight}`)}`,
      ),
    )
    .join('');
  // The text row of s19:16: the text face at 30 px with a 14 px gap above the weights.
  const textRow = block.textRow
    ? el(
        'div',
        {
          class: 'w',
          style:
            'font-family:var(--text);font-weight:400;font-size:30px;letter-spacing:0;margin-top:14px',
          'data-run': runAttr(ctx, block.id, 'textRow'),
        },
        `<small>Text</small>${renderText(block.textRow, { gtWord: ctx.gtWord })}`,
      )
    : '';
  return el('div', rootAttrs(block, ctx, { className: 'spec' }), rows + textRow);
}

/**
 * `.lang`: two columns of 34 px display rows, each with a small label (head:135-140; s20). The
 * `script` is the BCP 47 code written on the `lang` attribute; the CJK, Arabic and Indic codes get
 * their font stack classes. Arabic is set right to left inside a left-aligned block (s20:19).
 */
export function renderLang(block: BlockOf<'lang'>, ctx: BlockContext): string {
  const rows = block.items
    .map((item, index) => {
      const code = item.script.toLowerCase();
      const cls = code.startsWith('ja')
        ? 'ja'
        : code.startsWith('zh')
          ? 'zh'
          : code.startsWith('ko')
            ? 'ko'
            : code.startsWith('ar')
              ? 'ar'
              : code.startsWith('hi')
                ? 'hi'
                : undefined;
      const label = `<small>${escapeText(item.label)}</small>`;
      const run = runAttr(ctx, block.id, `items/${index}/text`);
      if (cls === 'ar') {
        return el(
          'div',
          { class: 'ar' },
          el(
            'span',
            {
              lang: item.script,
              dir: 'rtl',
              style: 'display:block;text-align:left',
              'data-run': run,
            },
            escapeText(item.text),
          ) + label,
        );
      }
      return el(
        'div',
        { lang: item.script, class: cls, 'data-run': run },
        escapeText(item.text) + label,
      );
    })
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'lang' }), rows);
}

/**
 * `.ladder`: ruled rows of the sample at each size with the label right (head:142-144; s21). Sizes
 * of 21 px and up are display weight 500; 20 px and below are the text face with no tracking, as
 * the slide sets them row by row (s21:17-24).
 */
export function renderLadder(block: BlockOf<'ladder'>, ctx: BlockContext): string {
  const rows = block.rows
    .map((row, index) => {
      const display = row.size >= 21;
      const inline = display
        ? `font-size:${row.size}px;font-weight:500`
        : `font-size:${row.size}px;font-family:var(--text);letter-spacing:0`;
      return el(
        'div',
        { style: inline, 'data-run': runAttr(ctx, block.id, `rows/${index}/label`) },
        `Launch in every language<small>${escapeText(row.label)}</small>`,
      );
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('ladder', block.valueWidth === 320 && 'wide-value'),
    }),
    rows,
  );
}

/** `.swatches`: five plates with a name and a value; a `\n` in the value breaks the line (s18:9-13). */
export function renderSwatches(block: BlockOf<'swatches'>, ctx: BlockContext): string {
  const items = block.items
    .map((item, index) => {
      const value = item.value.split('\n').map(escapeText).join('<br>');
      return el(
        'div',
        { class: classes('swatch', item.plate !== 'outline' && item.plate) },
        `<b data-run="${runAttr(ctx, block.id, `items/${index}/name`) ?? ''}">${escapeText(item.name)}</b><span>${value}</span>`,
      );
    })
    .join('')
    .replace(/ data-run=""/g, '');
  return el('div', rootAttrs(block, ctx, { className: 'swatches' }), items);
}
