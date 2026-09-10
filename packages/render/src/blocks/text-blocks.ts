// heading, paragraph and credit (SPEC 4.2; head:57-68 for the ladder, s01:8-10 for the plate).
import { el, style } from '../html.ts';
import { renderText } from '../text.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';

export function renderHeading(block: BlockOf<'heading'>, ctx: BlockContext): string {
  const text = renderText(block.text, { gtWord: ctx.gtWord });
  const inline = style(
    block.marginTop !== undefined && `margin-top:${block.marginTop}px`,
    block.marginBottom !== undefined && `margin-bottom:${block.marginBottom}px`,
  );
  const run = runAttr(ctx, block.id, 'text');
  switch (block.level) {
    case 'h1':
      return el('h1', { ...rootAttrs(block, ctx, { style: inline }), 'data-run': run }, text);
    case 'h2':
      return el('h2', { ...rootAttrs(block, ctx, { style: inline }), 'data-run': run }, text);
    case 'big':
      return el(
        'div',
        { ...rootAttrs(block, ctx, { className: 'big', style: inline }), 'data-run': run },
        text,
      );
    case 'title':
      // The mood plate's title: the h2 size on the .big element (s06:9, s06:16).
      return el(
        'div',
        { ...rootAttrs(block, ctx, { className: 'big title', style: inline }), 'data-run': run },
        text,
      );
  }
}

/** `.max` is 32ch and `.max-p` 56ch (head:67-68); any other measure is written inline. */
export function measureStyle(measure: number | undefined): { className?: string; style?: string } {
  if (measure === undefined) return {};
  if (measure === 32) return { className: 'max' };
  if (measure === 56) return { className: 'max-p' };
  return { style: `max-width:${measure}ch` };
}

export function renderParagraph(block: BlockOf<'paragraph'>, ctx: BlockContext): string {
  const measure = measureStyle(block.measure);
  const className = [
    block.role === 'lead' && 'lead',
    block.role === 'cap' && 'cap',
    block.tone === 'muted' && 'muted',
    measure.className,
  ]
    .filter((c): c is string => typeof c === 'string')
    .join(' ');
  const inline = style(
    measure.style,
    block.marginTop !== undefined && `margin-top:${block.marginTop}px`,
  );
  return el(
    'p',
    {
      ...rootAttrs(block, ctx, { className: className || undefined, style: inline }),
      'data-run': runAttr(ctx, block.id, 'text'),
    },
    renderText(block.text, { gtWord: ctx.gtWord }),
  );
}

/** The 15 px titanium credit line of a plate (s01:10, OPENERS.md:45). */
export function renderCredit(block: BlockOf<'credit'>, ctx: BlockContext): string {
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, { className: 'credit' }),
      'data-run': runAttr(ctx, block.id, 'text'),
    },
    renderText(block.text, { gtWord: ctx.gtWord }),
  );
}
