// The primitive blocks of the freeform round (docs/freeform.md): box, shape, rule, text and icon.
// Every color is written through colorCss, so a token stays a `var(--token)` the theme resolves
// and a custom hex is an inline literal; typography is inline declarations over the sheet's
// defaults (typography.ts). A shape is inline SVG filling its box, on the half-pixel grid for a
// 1 px stroke the way a declared diagram is (report 03 section 5.11), with filled 8 px arrowheads
// (DECK-GRAMMAR.md:44). The svg carries data attributes the exporter reads back (scene/measure.ts):
// `data-shape`, and for a line or arrow `data-from`, `data-to` and `data-heads` in the box's own
// pixels, so the PPTX gets a native line with the same ends.
import { classes, el, escapeAttr, px, style } from '../html.ts';
import type { Arrowheads, BlockOf, ShapeOrientation } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import { colorCss } from '@turboslide/schema/color';
import { iconSymbolId } from '@turboslide/schema/icons';
import { typographyDeclarations } from '@turboslide/schema/typography';
import { dataAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderMultiline } from './prompt.ts';

/** The filled arrowhead length in px, the largest dia/stroke-grammar allows (DECK-GRAMMAR.md:44). */
export const ARROWHEAD = 8;
/** A shape's height in a flow layout when the block sets none. */
export const SHAPE_FLOW_HEIGHT = 120;
/** A box's padding when the block sets none. */
export const BOX_PADDING = 16;

function colorDeclaration(property: string, color: Color | undefined): string | false {
  return color !== undefined && `${property}:${colorCss(color)}`;
}

/** The box a shape or box fills: the position box on a freeform slide, else the slot width and a flow height. */
function frame(
  ctx: BlockContext,
  block: { pos?: { w: number; h: number }; height?: number },
  fallbackHeight: number,
): { w: number; h: number } {
  if (block.pos !== undefined) return { w: block.pos.w, h: block.pos.h };
  return { w: ctx.slotWidth ?? 1326, h: block.height ?? fallbackHeight };
}

/**
 * `box`: a bordered rectangle with an optional text inside. The border is a hairline unless the
 * block sets a stroke or a width; 0 removes it. In a flow layout the box is as wide as its slot
 * and as tall as its text plus the padding, or `height` when set.
 */
export function renderBox(block: BlockOf<'box'>, ctx: BlockContext): string {
  const strokeWidth = block.strokeWidth ?? 1;
  const inline = style(
    colorDeclaration('background', block.fill),
    strokeWidth === 0
      ? 'border:0'
      : `border:${px(strokeWidth)}px solid ${colorCss(block.stroke ?? 'hair')}`,
    block.radius !== undefined && block.radius > 0 && `border-radius:${px(block.radius)}px`,
    `padding:${px(block.padding ?? BOX_PADDING)}px`,
    block.pos === undefined && block.height !== undefined && `height:${px(block.height)}px`,
    colorDeclaration('color', block.color),
    ...typographyDeclarations(block.typography),
  );
  // the box text is one of the four multiline pointers (SPEC 7.4)
  const text =
    block.text !== undefined
      ? el(
          'div',
          { class: 'box-text', 'data-run': runAttr(ctx, block.id, 'text') },
          renderMultiline(block.text, ctx, block, '/text'),
        )
      : '';
  return el('div', rootAttrs(block, ctx, { className: 'box', style: inline }), text);
}

/** The two ends of a line or arrow inside a w by h box, in the box's own pixels. */
export function lineEnds(
  w: number,
  h: number,
  orientation: ShapeOrientation | undefined,
  strokeWidth: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const resolved = orientation ?? (w >= h ? 'horizontal' : 'vertical');
  const inset = strokeWidth / 2;
  switch (resolved) {
    case 'horizontal':
      return { x1: 0, y1: h / 2, x2: w, y2: h / 2 };
    case 'vertical':
      return { x1: w / 2, y1: 0, x2: w / 2, y2: h };
    case 'diagonal-down':
      return { x1: inset, y1: inset, x2: w - inset, y2: h - inset };
    case 'diagonal-up':
      return { x1: inset, y1: h - inset, x2: w - inset, y2: inset };
  }
}

/** Snaps a coordinate to the half pixel for an odd stroke width (report 03 section 5.11). */
function snapStroke(value: number, width: number): number {
  return width % 2 === 1 ? Math.round(value - 0.5) + 0.5 : Math.round(value * 2) / 2;
}

/** The points of a filled triangle head at `tip` pointing along the line from `from`. */
function headPoints(
  from: { x: number; y: number },
  tip: { x: number; y: number },
  length: number,
): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tip.x - ux * length;
  const by = tip.y - uy * length;
  const half = length / 2;
  const p1 = { x: bx - uy * half, y: by + ux * half };
  const p2 = { x: bx + uy * half, y: by - ux * half };
  return `${px(tip.x)},${px(tip.y)} ${px(p1.x)},${px(p1.y)} ${px(p2.x)},${px(p2.y)}`;
}

/**
 * `shape`: inline SVG at the box's size. A closed shape is inset by half its stroke so the
 * outline stays inside the box; a line or arrow runs between the ends `lineEnds` gives it, on the
 * half-pixel grid, with `stroke-linecap="square"` and no joins (DECK-GRAMMAR.md:44). An arrow
 * shortens the line by the head length at each headed end and fills the head in the stroke color.
 */
export function renderShape(block: BlockOf<'shape'>, ctx: BlockContext): string {
  const { w, h } = frame(ctx, block, SHAPE_FLOW_HEIGHT);
  const width = block.width ?? 1;
  const closed = block.shape !== 'line' && block.shape !== 'arrow';
  const stroke = colorCss(block.stroke ?? (closed ? 'hair' : 'ink'));
  const fill = block.fill !== undefined ? colorCss(block.fill) : 'none';
  const attributes = rootAttrs(block, ctx, { className: classes('shape', `shape-${block.shape}`) });
  const rasterAttrs = raster(ctx, block.id, 'dia', true);
  let open = `<svg viewBox="0 0 ${px(w)} ${px(h)}" width="${px(w)}" height="${px(h)}" preserveAspectRatio="none"`;
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    open += ` ${name}="${escapeAttr(value)}"`;
  }
  open += dataAttrs(rasterAttrs);
  open += ` data-shape="${block.shape}" aria-hidden="true"`;
  const inset = width / 2;
  let body: string;
  switch (block.shape) {
    case 'rectangle':
    case 'rounded': {
      const radius = block.shape === 'rounded' ? (block.radius ?? 8) : 0;
      body = `<rect x="${px(inset)}" y="${px(inset)}" width="${px(Math.max(0, w - width))}" height="${px(Math.max(0, h - width))}"${
        radius > 0 ? ` rx="${px(radius)}" ry="${px(radius)}"` : ''
      } fill="${fill}" stroke="${stroke}" stroke-width="${px(width)}"/>`;
      break;
    }
    case 'ellipse':
      body = `<ellipse cx="${px(w / 2)}" cy="${px(h / 2)}" rx="${px(Math.max(0, w / 2 - inset))}" ry="${px(Math.max(0, h / 2 - inset))}" fill="${fill}" stroke="${stroke}" stroke-width="${px(width)}"/>`;
      break;
    case 'line':
    case 'arrow': {
      const ends = lineEnds(w, h, block.orientation, width);
      const heads: Arrowheads = block.shape === 'arrow' ? (block.arrowheads ?? 'end') : 'none';
      const from = { x: snapStroke(ends.x1, width), y: snapStroke(ends.y1, width) };
      const to = { x: snapStroke(ends.x2, width), y: snapStroke(ends.y2, width) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const headLength = Math.min(ARROWHEAD, len / 3);
      const startHead = heads === 'start' || heads === 'both';
      const endHead = heads === 'end' || heads === 'both';
      const lineFrom = startHead
        ? { x: from.x + ux * headLength, y: from.y + uy * headLength }
        : from;
      const lineTo = endHead ? { x: to.x - ux * headLength, y: to.y - uy * headLength } : to;
      body = `<line x1="${px(lineFrom.x)}" y1="${px(lineFrom.y)}" x2="${px(lineTo.x)}" y2="${px(lineTo.y)}" stroke="${stroke}" stroke-width="${px(width)}" stroke-linecap="square"/>`;
      if (endHead)
        body += `<polygon points="${headPoints(from, to, headLength)}" fill="${stroke}"/>`;
      if (startHead)
        body += `<polygon points="${headPoints(to, from, headLength)}" fill="${stroke}"/>`;
      open += ` data-from="${px(from.x)},${px(from.y)}" data-to="${px(to.x)},${px(to.y)}" data-heads="${heads}"`;
      break;
    }
  }
  return `${open}>${body}</svg>`;
}

/**
 * `rule`: the sheet hairline as a block (DECK-GRAMMAR.md:15). Horizontal rules run the slot width
 * or `length`; vertical rules need a `length` in a flow layout. On a freeform slide the box gives
 * the length and the weight is the thickness across it.
 */
export function renderRule(block: BlockOf<'rule'>, ctx: BlockContext): string {
  const weight = block.weight ?? 1;
  const color = colorCss(block.color ?? 'hair');
  const horizontal = block.orientation === 'horizontal';
  const length =
    block.pos !== undefined
      ? horizontal
        ? block.pos.w
        : block.pos.h
      : (block.length ?? (horizontal ? (ctx.slotWidth ?? 1326) : 120));
  const inline = style(
    horizontal
      ? `width:${px(length)}px;height:${px(weight)}px`
      : `width:${px(weight)}px;height:${px(length)}px`,
    `background:${color}`,
  );
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('rule', horizontal ? 'rule-h' : 'rule-v'),
      style: inline,
      role: 'separator',
      'aria-orientation': block.orientation,
    }),
    '',
  );
}

/** `text`: one Text at the body defaults (head:62) with typography and color over them. */
export function renderTextBlock(block: BlockOf<'text'>, ctx: BlockContext): string {
  const inline = style(
    colorDeclaration('color', block.color),
    ...typographyDeclarations(block.typography),
  );
  return el(
    'p',
    {
      ...rootAttrs(block, ctx, { className: 'text', style: inline }),
      'data-run': runAttr(ctx, block.id, 'text'),
    },
    // one of the four multiline pointers (SPEC 7.4)
    renderMultiline(block.text, ctx, block, '/text'),
  );
}

/**
 * `icon`: one sprite glyph on its own, the way a list icon is written (DECK-GRAMMAR.md:40), at a
 * stated size in a palette color; a raster on export like every icon (SPEC 8.6).
 */
export function renderIcon(block: BlockOf<'icon'>, ctx: BlockContext): string {
  const size = block.size ?? 24;
  const attributes = rootAttrs(block, ctx, {
    className: 'ic icon-block',
    style: style(`width:${size}px;height:${size}px`, colorDeclaration('color', block.color)),
  });
  let out = '<svg';
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  out += ` aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'icon', true))}`;
  return `${out}><use href="#${escapeAttr(iconSymbolId(block.name))}"/></svg>`;
}
