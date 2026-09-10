// dither, mark, markSizes and matrix.
import { el, escapeText, escapeAttr } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { dataAttrs, markSvg, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

/**
 * `dither`: `<canvas class="dither" data-dither='{"ramp":"linear-x"}'>` that the viewer runtime draws
 * from @turboslide/effects (SPEC 5.2; tail:104-114). The slide draws nothing itself.
 */
export function renderDither(block: BlockOf<'dither'>, ctx: BlockContext): string {
  const params = JSON.stringify({ ramp: block.ramp, height: block.height });
  return `<canvas${Object.entries(
    rootAttrs(block, ctx, {
      className: 'dither',
      style: block.border ? 'border:1px solid var(--hair)' : undefined,
    }),
  )
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttr(String(value))}"`)
    .join('')} data-dither="${escapeAttr(params)}" aria-label="${escapeAttr(block.alt)}"${dataAttrs(
    raster(ctx, block.id, 'dither', false),
  )}></canvas>`;
}

/** `mark`: the standalone GT mark at a pixel size (s02:4, s15:4). */
export function renderMark(block: BlockOf<'mark'>, ctx: BlockContext): string {
  const attributes = rootAttrs(block, ctx, {});
  const extra: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes))
    if (value !== undefined) extra[name] = value;
  return markSvg(ctx, block.id, block.w, block.h, extra);
}

/**
 * `markSizes`: the compression specimen of s17:3-6 and s17:13-17: one column per size, the mark at
 * the size on a rule with a 16 px caption naming the size. The symbol is 1213 by 771 units, so the
 * height is the width over 1.573 rounded the way the slide rounds it.
 */
export function renderMarkSizes(block: BlockOf<'markSizes'>, ctx: BlockContext): string {
  const labels: Record<number, string> = {
    16: '16px favicon',
    32: '32px CLI banner',
    64: '64px README header',
    128: '128px npm page',
    256: '256px website',
  };
  const cells = block.sizes
    .map((size) => {
      const h = markHeight(size);
      return el(
        'div',
        {},
        `${markSvg(ctx, block.id, size, h)}<span class="cap step">${escapeText(labels[size] ?? `${size}px`)}</span>`,
      );
    })
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'sizes' }), cells);
}

/** The heights the slide gives the mark at each width (s17:13-17). */
export function markHeight(width: number): number {
  const known: Record<number, number> = { 16: 10, 32: 20, 64: 41, 128: 81, 256: 163 };
  return known[width] ?? Math.round(width / 1.573);
}

/** `matrix`: the 4 by 4 Bayer table of s26:9-18 as a ruled grid of tabular numerals. */
export function renderMatrix(block: BlockOf<'matrix'>, ctx: BlockContext): string {
  const rows = block.cells.length;
  const cells = block.cells
    .map((row, r) =>
      row
        .map((value, c) => {
          const cls = [c < row.length - 1 && 'r', r < rows - 1 && 'b']
            .filter((v): v is string => typeof v === 'string')
            .join(' ');
          return `<span${cls ? ` class="${cls}"` : ''}>${value}</span>`;
        })
        .join(''),
    )
    .join('');
  const caption = block.caption
    ? el(
        'p',
        { class: 'cap', 'data-run': runAttr(ctx, block.id, 'caption') },
        renderText(block.caption, { gtWord: ctx.gtWord }),
      )
    : '';
  const columns = block.cells[0]?.length ?? 4;
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: 'matrix',
      style: `grid-template-columns:repeat(${columns},1fr)`,
    }),
    cells + caption,
  );
}
