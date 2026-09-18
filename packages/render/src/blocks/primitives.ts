// The primitive blocks of the freeform round (docs/freeform.md): box, shape, rule, text and icon,
// grown by the Google Slides parity round two (gslides-parity SPEC-2 2.2 to 2.4). Every color is
// written through colorCss, so a token stays a `var(--token)` the theme resolves and a custom hex
// is an inline literal; typography is inline declarations over the sheet's defaults
// (typography.ts). A shape is inline SVG filling its box, on the half-pixel grid for a 1 px
// stroke the way a declared diagram is (report 03 section 5.11): the five legacy kinds draw as
// they did in round one (byte for byte when no round two field is set), a preset of shapes.ts
// draws its ECMA path from `shapePath` inset by half the stroke, a line kind draws its segments
// or curve through the box, and the ten decorations of `lineEndPath` sit at the ends, sized as a
// medium DrawingML line end for the stroke (decorationSize) and centred on the end for the circle,
// square and diamond kinds the way PowerPoint and LibreOffice draw `oval` and `diamond`. The svg
// carries data attributes the exporter reads back (scene/measure.ts): `data-shape`, and for a
// line kind `data-from`, `data-to`, `data-heads`, `data-points`, `data-bend`, `data-start` and
// `data-end` in the box's own pixels, so the PPTX gets a native line, connector or custom geometry
// with the same ends. A shape with text (2.2.17) wraps the svg and a `.shape-text` layer at the
// preset's text rectangle in one `.shape-block` root. Dash (2.3.3), drop shadow (2.3.4), vertical
// alignment and four sided padding (2.2.18, 2.2.19) and word art's outline (2.2.16) are inline
// declarations, written only when the block carries the field.
import { classes, el, escapeAttr, px, style } from '../html.ts';
import type {
  Arrowheads,
  BlockOf,
  Padding,
  Shadow,
  ShapeOrientation,
  Valign,
} from '@turboslide/schema/blocks';
import { SHADOW_DEFAULTS, paddingSides } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import { colorCss } from '@turboslide/schema/color';
import { iconSymbolId } from '@turboslide/schema/icon-names';
import type { Box, Dash, LineEnd } from '@turboslide/schema/shapes';
import {
  LEGACY_PRESETS,
  dashArray,
  isLineKind,
  lineEndFilled,
  lineEndPath,
  shapePath,
  textInset,
} from '@turboslide/schema/shapes';
import { typographyDeclarations } from '@turboslide/schema/typography';
import { dataAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderMultiline } from './prompt.ts';
import { paraSpacingDeclarations } from './text-blocks.ts';

/** The filled arrowhead length in px, the largest dia/stroke-grammar allows (DECK-GRAMMAR.md:44). */
export const ARROWHEAD = 8;
/** A shape's height in a flow layout when the block sets none. */
export const SHAPE_FLOW_HEIGHT = 120;
/** A box's padding when the block sets none. */
export const BOX_PADDING = 16;

function colorDeclaration(property: string, color: Color | undefined): string | false {
  return color !== undefined && `${property}:${colorCss(color)}`;
}

/**
 * A box's padding: one number as before (the round one form, byte identical), or the four sides
 * of SPEC-2 2.2.19 in CSS order.
 */
function paddingDeclaration(padding: Padding | undefined, fallback = BOX_PADDING): string {
  if (padding === undefined || typeof padding === 'number')
    return `padding:${px(padding ?? fallback)}px`;
  const sides = paddingSides(padding);
  return `padding:${px(sides.top)}px ${px(sides.right)}px ${px(sides.bottom)}px ${px(sides.left)}px`;
}

/** The flex declarations of a vertical alignment (SPEC-2 2.2.18); nothing when absent. */
function valignDeclarations(valign: Valign | undefined): string[] {
  if (valign === undefined) return [];
  const justify = valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start';
  return ['display:flex', 'flex-direction:column', `justify-content:${justify}`];
}

// ---------------------------------------------------------------------------------------------
// Drop shadow (SPEC-2 2.3.4)

export type ShadowParts = { dx: number; dy: number; blur: number; color: string };

/** The CSS parts of a shadow: the offset from angle and distance, the blur, the colour at its opacity. */
export function shadowParts(shadow: Shadow): ShadowParts {
  const angle = shadow.angle ?? SHADOW_DEFAULTS.angle;
  const distance = shadow.distance ?? SHADOW_DEFAULTS.distance;
  const opacity = shadow.opacity ?? SHADOW_DEFAULTS.opacity;
  const rad = (angle * Math.PI) / 180;
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  return {
    dx: round2(distance * Math.cos(rad)),
    dy: round2(distance * Math.sin(rad)),
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    color: `color-mix(in srgb, ${colorCss(shadow.color ?? SHADOW_DEFAULTS.color)} ${Math.round(opacity * 100)}%, transparent)`,
  };
}

/** `box-shadow` for a box, text box, picture frame, table or chart. */
export function boxShadowDeclaration(shadow: Shadow | undefined): string | false {
  if (shadow === undefined) return false;
  const s = shadowParts(shadow);
  return `box-shadow:${px(s.dx)}px ${px(s.dy)}px ${px(s.blur)}px ${s.color}`;
}

/**
 * `filter: drop-shadow` for an svg shape, a glyph or a text box without a fill; the deviation is
 * half the box-shadow blur so the two forms read the same.
 */
export function dropShadowDeclaration(shadow: Shadow | undefined): string | false {
  if (shadow === undefined) return false;
  const s = shadowParts(shadow);
  return `filter:drop-shadow(${px(s.dx)}px ${px(s.dy)}px ${px(s.blur / 2)}px ${s.color})`;
}

/** The `border-style` of a dashed box or frame (SPEC-2 2.3.3); nothing for solid or absent. */
export function borderStyleDeclaration(dash: Dash | undefined): string | false {
  if (dash === undefined || dash === 'solid') return false;
  return `border-style:${dash === 'dot' ? 'dotted' : 'dashed'}`;
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
 * and as tall as its text plus the padding, or `height` when set. Round two adds the dash, the
 * shadow and the vertical alignment of its text (SPEC-2 2.3.3, 2.3.4, 2.2.18).
 */
export function renderBox(block: BlockOf<'box'>, ctx: BlockContext): string {
  const strokeWidth = block.strokeWidth ?? 1;
  const inline = style(
    colorDeclaration('background', block.fill),
    strokeWidth === 0
      ? 'border:0'
      : `border:${px(strokeWidth)}px solid ${colorCss(block.stroke ?? 'hair')}`,
    strokeWidth !== 0 && borderStyleDeclaration(block.dash),
    block.radius !== undefined && block.radius > 0 && `border-radius:${px(block.radius)}px`,
    paddingDeclaration(block.padding),
    block.pos === undefined && block.height !== undefined && `height:${px(block.height)}px`,
    colorDeclaration('color', block.color),
    ...typographyDeclarations(block.typography),
    ...paraSpacingDeclarations(block.typography),
    ...valignDeclarations(block.valign),
    boxShadowDeclaration(block.shadow),
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

type Point = { x: number; y: number };

/**
 * The smallest line width a decoration is sized from, in sheet px: 0.7 mm, the floor the verify
 * renderer applies to DrawingML line ends (LibreOffice oox `lineproperties`, `max(nLineWidth, 70)`
 * in 1/100 mm), so a medium head on a hairline stays visible. Measured in the render worker image
 * on the fixture's `lines#decorated` (a 2 px line): the oval head renders 10 px across, centred on
 * the line end; a 6 px head drawn behind the end measured dx -5, dw 4 against it (b2.md, fix
 * round). PowerPoint's own floor is the manual pass of docs/export-verification.md.
 */
export const DECORATION_MIN_LINE_PX = (70 / 2540) * 120;

/**
 * The size of a decoration for a line width (SPEC-2 2.4.5): a medium DrawingML line end, three
 * line widths long and wide (ECMA-376 ST_LineEndLength and ST_LineEndWidth `med`), the width
 * floored at DECORATION_MIN_LINE_PX. The same number sizes the head the export writes, so the
 * sheet and the file agree on the ink the verify loop measures.
 */
export function decorationSize(kind: LineEnd, width = 1): number {
  if (kind === 'none') return 0;
  return 3 * Math.max(width, DECORATION_MIN_LINE_PX);
}

/**
 * True for the decorations DrawingML centres on the line end (`oval` and `diamond`; the squares
 * travel as diamonds): the head straddles the end, half of it past the line. An arrow or stealth
 * head keeps its tip on the end and lies wholly along the line.
 */
export function decorationCentered(kind: LineEnd): boolean {
  return kind.includes('Circle') || kind.includes('Square') || kind.includes('Diamond');
}

/** How far the stroke stops short of the end under a decoration of `size`: the head's length, or half of it when the head is centred. */
export function decorationInset(kind: LineEnd, size: number): number {
  if (kind === 'none') return 0;
  return decorationCentered(kind) ? size / 2 : size;
}

/**
 * A decoration at `end`, pointing along the unit direction `dir` (out of the line), in the line's
 * stroke colour: filled for the fill variants and stealth, stroked for the open ones; `size` px
 * long (decorationSize), drawn with its tip on the end or, for the centred kinds, moved half its
 * length past the end so it straddles it the way the file's viewer draws it.
 */
function decoration(
  kind: LineEnd,
  end: Point,
  dir: Point,
  stroke: string,
  width: number,
  size: number,
): string {
  if (kind === 'none' || size <= 0) return '';
  const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const paint = lineEndFilled(kind)
    ? `fill="${stroke}"`
    : `fill="none" stroke="${stroke}" stroke-width="${px(Math.min(width, 1.5))}"`;
  const centre = decorationCentered(kind) ? ` translate(${px(size / 2)} 0)` : '';
  return `<path class="line-end" d="${lineEndPath(kind, size)}" transform="translate(${px(end.x)} ${px(end.y)}) rotate(${px(Math.round(angle * 100) / 100)})${centre}" ${paint}/>`;
}

/** `end` moved `by` px back along `dir` so the stroke stops under a decoration. */
function shorten(end: Point, dir: Point, by: number): Point {
  return { x: end.x - dir.x * by, y: end.y - dir.y * by };
}

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const pt = (p: Point): string => `${px(p.x)},${px(p.y)}`;

/**
 * A Catmull-Rom spline through the points as cubic segments (SPEC-2 2.4.3 `curve`), closed on the
 * first point when asked; two points give one straight segment.
 */
export function catmullRomPath(points: ReadonlyArray<Point>, closed: boolean): string {
  const n = points.length;
  if (n === 0) return '';
  const first = points[0] as Point;
  if (n === 1) return `M${pt(first)}`;
  const at = (i: number): Point => {
    if (closed) return points[((i % n) + n) % n] as Point;
    return points[Math.min(n - 1, Math.max(0, i))] as Point;
  };
  let d = `M${pt(first)}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/**
 * The text rectangle of a shape block at its box (SPEC-2 2.2.17): `textInset` of shapes.ts through
 * the legacy id's preset, which is the whole box for every kind today (its docblock names the
 * exporter's reason), so the layer and the PPTX body insets agree.
 */
export function shapeTextRect(block: BlockOf<'shape'>, w: number, h: number): Box {
  const presetKind = LEGACY_PRESETS[block.shape as keyof typeof LEGACY_PRESETS] ?? block.shape;
  return textInset(presetKind, w, h, block.adjust ?? []);
}

/**
 * `shape`: inline SVG at the box's size. A closed shape is inset by half its stroke so the
 * outline stays inside the box; a line or arrow runs between the ends `lineEnds` gives it, on the
 * half-pixel grid, with `stroke-linecap="square"` and no joins (DECK-GRAMMAR.md:44). An arrow
 * shortens the line by the head length at each headed end and fills the head in the stroke color.
 * A preset (SPEC-2 2.3.1) draws `shapePath` with its adjust values; a line kind (2.4.1 to 2.4.4)
 * draws its segments or curve with the decorations of 2.4.5 at its ends; a shape with text (2.2.17)
 * wraps the svg and its `.shape-text` layer in one root.
 */
export function renderShape(block: BlockOf<'shape'>, ctx: BlockContext): string {
  const { w, h } = frame(ctx, block, SHAPE_FLOW_HEIGHT);
  const width = block.width ?? 1;
  const kind = block.shape;
  const lineLike = isLineKind(kind);
  const closed = !lineLike;
  const stroke = colorCss(block.stroke ?? (closed ? 'hair' : 'ink'));
  const fill = block.fill !== undefined ? colorCss(block.fill) : 'none';
  const withText = closed && block.text !== undefined;
  const svgClass = classes('shape', `shape-${kind}`);
  const svgStyle = style(dropShadowDeclaration(block.shadow));
  // with a text layer the block root is the wrapper; the svg keeps the shape's own attributes
  const attributes: Record<string, string | undefined> = withText
    ? { class: svgClass, style: svgStyle }
    : rootAttrs(block, ctx, { className: svgClass, style: svgStyle });
  const rasterAttrs = raster(ctx, block.id, 'dia', true);
  let open = `<svg viewBox="0 0 ${px(w)} ${px(h)}" width="${px(w)}" height="${px(h)}" preserveAspectRatio="none"`;
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    open += ` ${name}="${escapeAttr(value)}"`;
  }
  open += dataAttrs(rasterAttrs);
  open += ` data-shape="${kind}" aria-hidden="true"`;
  const inset = width / 2;
  const dash = dashArray(block.dash, width);
  const dashAttr = dash !== '' ? ` stroke-dasharray="${dash}"` : '';
  let body = '';
  switch (kind) {
    case 'rectangle':
    case 'rounded': {
      const radius = kind === 'rounded' ? (block.radius ?? 8) : 0;
      body = `<rect x="${px(inset)}" y="${px(inset)}" width="${px(Math.max(0, w - width))}" height="${px(Math.max(0, h - width))}"${
        radius > 0 ? ` rx="${px(radius)}" ry="${px(radius)}"` : ''
      } fill="${fill}" stroke="${stroke}" stroke-width="${px(width)}"${dashAttr}/>`;
      break;
    }
    case 'ellipse':
      body = `<ellipse cx="${px(w / 2)}" cy="${px(h / 2)}" rx="${px(Math.max(0, w / 2 - inset))}" ry="${px(Math.max(0, h / 2 - inset))}" fill="${fill}" stroke="${stroke}" stroke-width="${px(width)}"${dashAttr}/>`;
      break;
    case 'line':
    case 'arrow': {
      const ends = lineEnds(w, h, block.orientation, width);
      const from = { x: snapStroke(ends.x1, width), y: snapStroke(ends.y1, width) };
      const to = { x: snapStroke(ends.x2, width), y: snapStroke(ends.y2, width) };
      const dir = unit(from, to);
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      if (block.lineStart !== undefined || block.lineEnd !== undefined) {
        // the decorations of SPEC-2 2.4.5 replace the round one arrowheads when written
        const startKind: LineEnd = block.lineStart ?? 'none';
        const endKind: LineEnd = block.lineEnd ?? 'none';
        const startSize = Math.min(decorationSize(startKind, width), len / 3);
        const endSize = Math.min(decorationSize(endKind, width), len / 3);
        const lineFrom = shorten(
          from,
          { x: -dir.x, y: -dir.y },
          decorationInset(startKind, startSize),
        );
        const lineTo = shorten(to, dir, decorationInset(endKind, endSize));
        body = `<line x1="${px(lineFrom.x)}" y1="${px(lineFrom.y)}" x2="${px(lineTo.x)}" y2="${px(lineTo.y)}" stroke="${stroke}" stroke-width="${px(width)}" stroke-linecap="square"${dashAttr}/>`;
        body += decoration(endKind, to, dir, stroke, width, endSize);
        body += decoration(startKind, from, { x: -dir.x, y: -dir.y }, stroke, width, startSize);
        open += ` data-from="${pt(from)}" data-to="${pt(to)}" data-heads="none" data-start="${startKind}" data-end="${endKind}"`;
        break;
      }
      const heads: Arrowheads = kind === 'arrow' ? (block.arrowheads ?? 'end') : 'none';
      const headLength = Math.min(ARROWHEAD, len / 3);
      const startHead = heads === 'start' || heads === 'both';
      const endHead = heads === 'end' || heads === 'both';
      const lineFrom = startHead
        ? { x: from.x + dir.x * headLength, y: from.y + dir.y * headLength }
        : from;
      const lineTo = endHead ? { x: to.x - dir.x * headLength, y: to.y - dir.y * headLength } : to;
      body = `<line x1="${px(lineFrom.x)}" y1="${px(lineFrom.y)}" x2="${px(lineTo.x)}" y2="${px(lineTo.y)}" stroke="${stroke}" stroke-width="${px(width)}" stroke-linecap="square"${dashAttr}/>`;
      if (endHead)
        body += `<polygon points="${headPoints(from, to, headLength)}" fill="${stroke}"/>`;
      if (startHead)
        body += `<polygon points="${headPoints(to, from, headLength)}" fill="${stroke}"/>`;
      open += ` data-from="${pt(from)}" data-to="${pt(to)}" data-heads="${heads}"`;
      break;
    }
    case 'elbow':
    case 'curved': {
      // a connector from one corner of the box to the opposite one with its bend at `bend`
      // (SPEC-2 2.4.1, 2.4.2); the horizontal and vertical orientations run straight through
      const ends = lineEnds(w, h, block.orientation ?? 'diagonal-down', width);
      const from = { x: snapStroke(ends.x1, width), y: snapStroke(ends.y1, width) };
      const to = { x: snapStroke(ends.x2, width), y: snapStroke(ends.y2, width) };
      const bend = block.bend ?? 0.5;
      const bx = snapStroke(from.x + (to.x - from.x) * bend, width);
      const heads: Arrowheads = block.arrowheads ?? 'none';
      const startKind: LineEnd =
        block.lineStart ?? (heads === 'start' || heads === 'both' ? 'fillArrow' : 'none');
      const endKind: LineEnd =
        block.lineEnd ?? (heads === 'end' || heads === 'both' ? 'fillArrow' : 'none');
      const startDir = { x: -1, y: 0 };
      const endDir = { x: 1, y: 0 };
      if (to.x < from.x) {
        startDir.x = 1;
        endDir.x = -1;
      }
      const startSize = decorationSize(startKind, width);
      const endSize = decorationSize(endKind, width);
      const lineFrom = shorten(from, startDir, decorationInset(startKind, startSize));
      const lineTo = shorten(to, endDir, decorationInset(endKind, endSize));
      let d: string;
      if (kind === 'elbow') {
        d = `M${pt(lineFrom)} H${px(bx)} V${px(lineTo.y)} H${px(lineTo.x)}`;
      } else {
        d = `M${pt(lineFrom)} C${px(bx)},${px(lineFrom.y)} ${px(bx)},${px(lineTo.y)} ${pt(lineTo)}`;
      }
      body = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${px(width)}" stroke-linecap="square" stroke-linejoin="miter"${dashAttr}/>`;
      body += decoration(endKind, to, endDir, stroke, width, endSize);
      body += decoration(startKind, from, startDir, stroke, width, startSize);
      open += ` data-from="${pt(from)}" data-to="${pt(to)}" data-heads="none" data-bend="${px(bend)}" data-start="${startKind}" data-end="${endKind}"`;
      open += ` data-points="${pt(from)} ${px(bx)},${px(from.y)} ${px(bx)},${px(to.y)} ${pt(to)}"`;
      break;
    }
    case 'curve':
    case 'polyline':
    case 'scribble': {
      // points as fractions of the box (SPEC-2 2.4.3, 2.4.4), two or more
      const raw = block.points ?? [
        [0, 0.5],
        [1, 0.5],
      ];
      const points: Point[] = raw.map(([fx, fy]) => ({
        x: snapStroke(inset + fx * Math.max(0, w - width), width),
        y: snapStroke(inset + fy * Math.max(0, h - width), width),
      }));
      const isClosed = block.closed === true && kind !== 'scribble';
      const first = points[0] as Point;
      const last = points[points.length - 1] as Point;
      const startKind: LineEnd = isClosed ? 'none' : (block.lineStart ?? 'none');
      const endKind: LineEnd = isClosed ? 'none' : (block.lineEnd ?? 'none');
      const second = points[1] ?? first;
      const beforeLast = points[points.length - 2] ?? last;
      const startDir = unit(second, first);
      const endDir = unit(beforeLast, last);
      const drawn = points.map((p) => ({ ...p }));
      const startSize = decorationSize(startKind, width);
      const endSize = decorationSize(endKind, width);
      if (startKind !== 'none' && drawn.length > 1)
        drawn[0] = shorten(first, startDir, decorationInset(startKind, startSize));
      if (endKind !== 'none' && drawn.length > 1)
        drawn[drawn.length - 1] = shorten(last, endDir, decorationInset(endKind, endSize));
      const d =
        kind === 'curve'
          ? catmullRomPath(drawn, isClosed)
          : `M${drawn.map(pt).join(' L')}${isClosed ? ' Z' : ''}`;
      const pathFill = isClosed && block.fill !== undefined ? fill : 'none';
      const joins =
        kind === 'scribble'
          ? 'stroke-linejoin="round" stroke-linecap="round"'
          : 'stroke-linejoin="miter" stroke-linecap="square"';
      body = `<path d="${d}" fill="${pathFill}" stroke="${stroke}" stroke-width="${px(width)}" ${joins}${dashAttr}/>`;
      body += decoration(endKind, last, endDir, stroke, width, endSize);
      body += decoration(startKind, first, startDir, stroke, width, startSize);
      open += ` data-points="${points.map(pt).join(' ')}"${isClosed ? ' data-closed="1"' : ''} data-start="${startKind}" data-end="${endKind}"`;
      break;
    }
    default: {
      // a preset of shapes.ts (SPEC-2 2.3.1): the ECMA path at the box less the stroke, inset by
      // half of it so the outline stays inside the box, with the adjust values of 2.3.2
      const path = shapePath(
        kind,
        Math.max(0, w - width),
        Math.max(0, h - width),
        block.adjust ?? [],
      );
      const translate = inset > 0 ? ` transform="translate(${px(inset)} ${px(inset)})"` : '';
      body = `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${px(width)}" stroke-linejoin="miter"${dashAttr}${translate}/>`;
      if (block.adjust !== undefined) open += ` data-adjust="${block.adjust.map(px).join(',')}"`;
      break;
    }
  }
  const svg = `${open}>${body}</svg>`;
  if (!withText) return svg;
  // the text layer over the svg inside the kind's text rectangle (SPEC-2 2.2.17, shapeTextRect)
  const rect = shapeTextRect(block, w, h);
  const empty = block.text === '';
  const textStyle = style(
    `left:${px(rect.x)}px`,
    `top:${px(rect.y)}px`,
    `width:${px(rect.w)}px`,
    `height:${px(rect.h)}px`,
    block.padding !== undefined && paddingDeclaration(block.padding, 0),
    colorDeclaration('color', block.color),
    ...typographyDeclarations(block.typography),
    ...paraSpacingDeclarations(block.typography),
    ...valignDeclarations(block.valign),
  );
  // an empty text (a fresh shape, docs/FOCUS.md section 4) keeps its run so Enter and a double
  // click open it, draws no prompt (a shape is not a placeholder) and is marked `is-empty` so the
  // canvas CSS lets a click through to the shape until the session takes the focus
  const text = el(
    'div',
    {
      class: classes('shape-text', empty && 'is-empty'),
      style: textStyle,
      'data-run': runAttr(ctx, block.id, 'text'),
    },
    empty ? '' : renderMultiline(block.text ?? '', ctx, block, '/text'),
  );
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: 'shape-block',
      style: style(block.pos === undefined && `width:${px(w)}px;height:${px(h)}px`),
    }),
    svg + text,
  );
}

/**
 * `rule`: the sheet hairline as a block (DECK-GRAMMAR.md:15). Horizontal rules run the slot width
 * or `length`; vertical rules need a `length` in a flow layout. On a freeform slide the box gives
 * the length and the weight is the thickness across it. A dash (SPEC-2 2.3.3) draws the rule as a
 * dashed border instead of a filled strip.
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
  const dashed = block.dash !== undefined && block.dash !== 'solid';
  const inline = style(
    horizontal
      ? `width:${px(length)}px;height:${px(weight)}px`
      : `width:${px(weight)}px;height:${px(length)}px`,
    dashed
      ? `border-${horizontal ? 'top' : 'left'}:${px(weight)}px ${block.dash === 'dot' ? 'dotted' : 'dashed'} ${color};box-sizing:content-box;${horizontal ? 'height:0' : 'width:0'}`
      : `background:${color}`,
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

/**
 * `text`: one Text at the body defaults (head:62) with typography and color over them. Round two
 * adds word art's outline (SPEC-2 2.2.16), the vertical alignment and the padding of a positioned
 * text box (2.2.18, 2.2.19) and the drop shadow (2.3.4), each written only when the block carries
 * it, so a round one text box renders byte for byte.
 */
export function renderTextBlock(block: BlockOf<'text'>, ctx: BlockContext): string {
  const fitted = block.valign !== undefined || block.padding !== undefined;
  const inline = style(
    colorDeclaration('color', block.color),
    ...typographyDeclarations(block.typography),
    ...paraSpacingDeclarations(block.typography),
    block.outline !== undefined &&
      `-webkit-text-stroke:${px(block.outline.width)}px ${colorCss(block.outline.color)};paint-order:stroke fill`,
    block.padding !== undefined && paddingDeclaration(block.padding, 0),
    ...valignDeclarations(block.valign),
    fitted && 'height:100%;box-sizing:border-box',
    dropShadowDeclaration(block.shadow),
  );
  return el(
    'p',
    {
      ...rootAttrs(block, ctx, {
        className: classes('text', block.outline !== undefined && 'word-art'),
        style: inline,
      }),
      'data-run': runAttr(ctx, block.id, 'text'),
    },
    // one of the four multiline pointers (SPEC 7.4)
    renderMultiline(block.text, ctx, block, '/text'),
  );
}

/**
 * `icon`: one sprite glyph on its own, the way a list icon is written (DECK-GRAMMAR.md:40), at a
 * stated size in a palette color; a raster on export like every icon (SPEC 8.6). An icon object
 * of the canvas (a block with `pos`) writes no size of its own: the glyph fills its box through
 * block-css.ts, so a resize handle scales it with the box (hotfix-3 cause R4).
 */
export function renderIcon(block: BlockOf<'icon'>, ctx: BlockContext): string {
  const size = block.size ?? 24;
  const attributes = rootAttrs(block, ctx, {
    className: 'ic icon-block',
    style: style(
      block.pos === undefined && `width:${size}px;height:${size}px`,
      colorDeclaration('color', block.color),
      dropShadowDeclaration(block.shadow),
    ),
  });
  let out = '<svg';
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  out += ` aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'icon', true))}`;
  return `${out}><use href="#${escapeAttr(iconSymbolId(block.name))}"/></svg>`;
}
