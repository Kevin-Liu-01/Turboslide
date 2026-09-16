// Shapes, text boxes, placeholders, lines and connectors (gslides-parity SPEC-5 5.1; R04 5.2,
// 5.3, 5.4): one `p:sp` or `p:cxnSp` read into a `heading`, `paragraph`, `text`, `plain`,
// `panel`, `shape` or `rule` block with its `pos`, or dropped with a row. The 135 presets keep
// their `prstGeom` name with the adjust values in guide order; a preset outside the list lands on
// the nearest family; a custom geometry is sampled into a polyline; a connector keeps its heads
// and its attachment sites through the slide's shape id map; a hidden shape and a footer
// placeholder are counted, not imported.
import type { Element } from '@xmldom/xmldom';

import type {
  Block,
  HeadingBlock,
  ParagraphBlock,
  PlainBlock,
  RuleBlock,
  Shadow,
  ShapeBlock,
  TextBlock,
  PanelBlock,
} from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import type { Position } from '@turboslide/schema/position';
import type { Dash, LineEnd } from '@turboslide/schema/shapes';
import { isShapePresetId, shapeAdjustDefaults, shapeGuides } from '@turboslide/schema/shapes';
import { serializeRuns } from '@turboslide/schema/text';

import type { SlideContext } from './context.ts';
import {
  altOf,
  colorOf,
  halfPx,
  parseRoundTripName,
  placed,
  px2,
  rowOn,
  shapeFacts,
} from './context.ts';
import type { ShapeFacts } from './context.ts';
import { DROPPED_PLACEHOLDER_TYPES, inheritedXfrm, placeholderOf } from './inherit.ts';
import type { Xfrm } from './inherit.ts';
import { ROW_CODES } from './report.ts';
import { readTextBody } from './text.ts';
import type { TextBodyReading } from './text.ts';
import { readFill, resolveColor } from './theme.ts';
import type { FillReading } from './theme.ts';
import { angleOf, boxToPx, emuToPx, flipOf, lineWidthPx, percentOf } from './units.ts';
import { attr, child, children, elementChildren, intAttr, is, path } from './xml.ts';
import { linkOf } from './text.ts';

/** The stroke ladders of the schema (R04 4): shapes, tables and rules snap to these. */
export const SHAPE_STROKE_LADDER = [1, 1.5, 2, 3, 4] as const;
export const RULE_WEIGHTS = [1, 1.5, 2] as const;

/** A heading is `h1` at 58 px and above, else `h2` (R04 5.2). */
export const H1_MIN_PX = 58;

/** The nearest value of a ladder; the delta the caller may report. */
export function snapLadder<T extends number>(
  value: number,
  ladder: readonly T[],
): { value: T; delta: number } {
  let best = ladder[0] as T;
  for (const step of ladder) if (Math.abs(step - value) < Math.abs(best - value)) best = step;
  return { value: best, delta: Math.abs(best - value) };
}

/** `a:prstDash val` to the schema's dashes (R04 5.3); `exact: false` when the value folded. */
export function dashOf(value: string | undefined): { dash: Dash | undefined; exact: boolean } {
  switch (value) {
    case undefined:
    case 'solid':
      return { dash: undefined, exact: true };
    case 'dot':
    case 'sysDot':
      return { dash: 'dot', exact: true };
    case 'dash':
    case 'sysDash':
      return { dash: 'dash', exact: true };
    case 'dashDot':
    case 'sysDashDot':
      return { dash: 'dashDot', exact: true };
    case 'lgDash':
      return { dash: 'longDash', exact: true };
    case 'lgDashDot':
      return { dash: 'longDashDot', exact: true };
    case 'lgDashDotDot':
    case 'sysDashDotDot':
      return { dash: 'longDashDot', exact: false };
    default:
      return { dash: 'dash', exact: false };
  }
}

/** `a:headEnd type` and `a:tailEnd type` to the schema's line ends (the inverse of `LINE_END_PPTX`). */
export function lineEndOf(type: string | undefined): LineEnd | undefined {
  switch (type) {
    case 'triangle':
      return 'fillArrow';
    case 'stealth':
      return 'stealth';
    case 'oval':
      return 'fillCircle';
    case 'diamond':
      return 'fillDiamond';
    case 'arrow':
      return 'openArrow';
    case 'none':
    case undefined:
      return undefined;
    default:
      return 'fillArrow';
  }
}

/** The family a preset outside the 135 lands on (R04 5.3). */
export function presetFallback(prst: string): string {
  if (prst.startsWith('flowChart')) return 'rect';
  if (prst.startsWith('actionButton')) return 'roundRect';
  if (prst.startsWith('wedge') || prst.endsWith('Callout')) return 'rect';
  if (prst.startsWith('star') || prst.startsWith('seal') || prst === 'irregularSeal1')
    return 'star5';
  if (prst.startsWith('math')) return 'rect';
  if (prst.includes('Arrow')) return 'rightArrow';
  return 'rect';
}

export type GeometryReading =
  | { kind: 'preset'; prst: string; adjust: number[]; exact: boolean }
  | { kind: 'custom'; paths: Element[] }
  | { kind: 'none' };

/** The geometry of a `p:spPr`: the preset with its adjusts in guide order, or the custom paths. */
export function readGeometry(spPr: Element | undefined): GeometryReading {
  if (spPr === undefined) return { kind: 'none' };
  const prstGeom = child(spPr, 'a', 'prstGeom');
  if (prstGeom !== undefined) {
    const prst = attr(prstGeom, 'prst') ?? 'rect';
    // the line and connector geometries are the schema's line kinds, not shape presets (R04 5.4)
    const connector = /^(line|straightConnector1|bentConnector[2-5]|curvedConnector[2-5])$/.test(
      prst,
    );
    const known = connector || isShapePresetId(prst);
    const kind = known ? prst : presetFallback(prst);
    const guides = shapeGuides(kind);
    const defaults = shapeAdjustDefaults(kind);
    const written = new Map<string, number>();
    const avLst = child(prstGeom, 'a', 'avLst');
    if (avLst !== undefined) {
      for (const gd of children(avLst, 'a', 'gd')) {
        const name = attr(gd, 'name');
        const fmla = attr(gd, 'fmla') ?? '';
        const m = /^val\s+(-?\d+(?:\.\d+)?)$/.exec(fmla.trim());
        if (name !== undefined && m !== null) written.set(name, Number(m[1]));
      }
    }
    const adjust = guides.map((name, i) => written.get(name) ?? defaults[i] ?? 0);
    return { kind: 'preset', prst: kind, adjust, exact: known };
  }
  const custGeom = child(spPr, 'a', 'custGeom');
  if (custGeom !== undefined) {
    const pathLst = child(custGeom, 'a', 'pathLst');
    return { kind: 'custom', paths: pathLst === undefined ? [] : children(pathLst, 'a', 'path') };
  }
  return { kind: 'none' };
}

export type LineReading = {
  color?: Color;
  widthPx?: number;
  dash?: Dash;
  dashExact: boolean;
  headEnd?: LineEnd;
  tailEnd?: LineEnd;
  noFill: boolean;
  present: boolean;
};

/** The outline of a `p:spPr` (`a:ln`) resolved; `p:style/a:lnRef` when the shape writes none. */
export function readLine(
  spPr: Element | undefined,
  style: Element | undefined,
  ctx: SlideContext,
): LineReading {
  const out: LineReading = { dashExact: true, noFill: false, present: false };
  const ln = spPr === undefined ? undefined : child(spPr, 'a', 'ln');
  if (ln !== undefined) {
    out.present = true;
    const w = intAttr(ln, 'w');
    if (w !== undefined) out.widthPx = lineWidthPx(w, ctx.mapping);
    if (child(ln, 'a', 'noFill') !== undefined) out.noFill = true;
    const fill = readFill(ln, ctx.chain.colors);
    if (fill !== undefined && 'color' in fill && fill.color !== undefined)
      out.color = colorOf(fill.color, ctx);
    const dash = dashOf(attr(child(ln, 'a', 'prstDash') ?? ln, 'val'));
    if (child(ln, 'a', 'prstDash') !== undefined) {
      out.dash = dash.dash;
      out.dashExact = dash.exact;
    } else if (child(ln, 'a', 'custDash') !== undefined) {
      out.dash = 'dash';
      out.dashExact = false;
    }
    const head = child(ln, 'a', 'headEnd');
    const tail = child(ln, 'a', 'tailEnd');
    if (head !== undefined) out.headEnd = lineEndOf(attr(head, 'type'));
    if (tail !== undefined) out.tailEnd = lineEndOf(attr(tail, 'type'));
  }
  if (!out.noFill && out.color === undefined && style !== undefined) {
    const lnRef = child(style, 'a', 'lnRef');
    const idx = lnRef === undefined ? 0 : (intAttr(lnRef, 'idx') ?? 0);
    if (lnRef !== undefined && idx > 0) {
      out.present = true;
      const colorEl = elementChildren(lnRef)[0];
      const resolved = colorEl === undefined ? undefined : resolveColor(colorEl, ctx.chain.colors);
      if (resolved !== undefined) out.color = colorOf(resolved, ctx);
      if (out.widthPx === undefined) out.widthPx = idx === 1 ? 0.75 : idx === 2 ? 1.5 : 2.25;
    }
  }
  return out;
}

/** The fill of a `p:spPr`, or the theme's `a:fillRef` when the shape writes none. */
export function readShapeFill(
  spPr: Element | undefined,
  style: Element | undefined,
  ctx: SlideContext,
): FillReading | undefined {
  const own = spPr === undefined ? undefined : readFill(spPr, ctx.chain.colors);
  if (own !== undefined) return own;
  if (style === undefined) return undefined;
  const fillRef = child(style, 'a', 'fillRef');
  if (fillRef === undefined) return undefined;
  const idx = intAttr(fillRef, 'idx') ?? 0;
  if (idx === 0) return { kind: 'none' };
  const colorEl = elementChildren(fillRef)[0];
  const resolved = colorEl === undefined ? undefined : resolveColor(colorEl, ctx.chain.colors);
  return resolved === undefined ? undefined : { kind: 'solid', color: resolved };
}

/** The outer shadow of an effect list (R04 5.3); undefined when none. */
export function readShadow(
  spPr: Element | undefined,
  ctx: SlideContext,
  object: string,
): Shadow | undefined {
  if (spPr === undefined) return undefined;
  const effects = child(spPr, 'a', 'effectLst');
  if (effects === undefined) return undefined;
  let shadow: Shadow | undefined;
  for (const effect of elementChildren(effects)) {
    if (is(effect, 'a', 'outerShdw')) {
      const blur = intAttr(effect, 'blurRad');
      const dist = intAttr(effect, 'dist');
      const dir = intAttr(effect, 'dir');
      const colorEl = elementChildren(effect)[0];
      const resolved = colorEl === undefined ? undefined : resolveColor(colorEl, ctx.chain.colors);
      shadow = {
        ...(blur !== undefined ? { blur: px2(emuToPx(blur, ctx.mapping)) } : {}),
        ...(dist !== undefined ? { distance: px2(emuToPx(dist, ctx.mapping)) } : {}),
        ...(dir !== undefined ? { angle: Math.round(angleOf(dir)) } : {}),
        ...(resolved !== undefined
          ? {
              color: colorOf({ hex: resolved.hex, alpha: 1 }, ctx),
              opacity: Math.round(resolved.alpha * 100) / 100,
            }
          : {}),
      };
    } else if (
      is(effect, 'a', 'innerShdw') ||
      is(effect, 'a', 'glow') ||
      is(effect, 'a', 'softEdge') ||
      is(effect, 'a', 'reflection')
    ) {
      ctx.report.substitute({
        ...rowOn(ctx, object),
        code: ROW_CODES.shapeEffect,
        message: `The ${effect.localName} effect was dropped; a shape carries an outer shadow alone`,
      });
    }
  }
  return shadow;
}

/** The box of a shape from its own or inherited transform, in sheet px. */
export function positionOf(xfrm: Xfrm, ctx: SlideContext): Position {
  const box = boxToPx(xfrm.off, xfrm.ext, ctx.mapping);
  const pos: Position = {
    x: px2(box.x),
    y: px2(box.y),
    w: Math.max(1, px2(box.w)),
    h: Math.max(1, px2(box.h)),
  };
  const rotate = angleOf(xfrm.rot);
  if (rotate !== 0) pos.rotate = rotate;
  const flip = flipOf(xfrm.flipH, xfrm.flipV);
  if (flip !== undefined) pos.flip = flip;
  return pos;
}

/** The `p:spPr` of a shape, connector or picture. */
export function spPrOf(shape: Element): Element | undefined {
  return elementChildren(shape).find((node) => node.localName === 'spPr');
}

/** The `p:style` of a shape. */
export function styleOf(shape: Element): Element | undefined {
  return elementChildren(shape).find((node) => node.localName === 'style');
}

/** The role a shape plays: a text box, a placeholder kind, a line, a plain shape. */
export type ShapeRole =
  | { kind: 'placeholder'; type: string }
  | { kind: 'textBox' }
  | { kind: 'line' }
  | { kind: 'shape' };

export function roleOf(
  shape: Element,
  geometry: GeometryReading,
  fill: FillReading | undefined,
  line: LineReading,
): ShapeRole {
  const ph = placeholderOf(shape);
  if (ph !== undefined) return { kind: 'placeholder', type: ph.type };
  if (is(shape, 'p', 'cxnSp')) return { kind: 'line' };
  if (
    geometry.kind === 'preset' &&
    /^(line|straightConnector1|bentConnector[2-5]|curvedConnector[2-5])$/.test(geometry.prst)
  )
    return { kind: 'line' };
  const cNvSpPr = path(shape, ['p', 'nvSpPr'], ['p', 'cNvSpPr']);
  const txBox =
    cNvSpPr !== undefined && (attr(cNvSpPr, 'txBox') === '1' || attr(cNvSpPr, 'txBox') === 'true');
  const hasText = elementChildren(shape).some((node) => node.localName === 'txBody');
  const plainRect = geometry.kind === 'preset' && geometry.prst === 'rect';
  const unfilled = fill === undefined || fill.kind === 'none';
  const unlined = !line.present || line.noFill;
  if (txBox || (plainRect && hasText && unfilled && unlined)) return { kind: 'textBox' };
  return { kind: 'shape' };
}

type ReadShapeResult = { blocks: Block[] };

/**
 * Reads one `p:sp` or `p:cxnSp` into blocks (usually one; a body whose runs differ in size is
 * split into one text block per size group when `splitMixedSizes` is on). An empty list means the
 * shape was skipped or dropped, with the counting done here.
 */
export function readShape(shape: Element, ctx: SlideContext): ReadShapeResult {
  const facts = shapeFacts(shape);
  const object = facts.name;
  if (facts.hidden) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.hidden',
      message: 'A hidden shape was left out',
    });
    return { blocks: [] };
  }
  const spPr = spPrOf(shape);
  const style = styleOf(shape);
  const geometry = readGeometry(spPr);
  const fill = readShapeFill(spPr, style, ctx);
  const line = readLine(spPr, style, ctx);
  const role = roleOf(shape, geometry, fill, line);
  const inherited = inheritedXfrm(shape, ctx.chain);
  if (inherited === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.noBox',
      message: 'A shape without a box on the slide, its layout or its master was dropped',
    });
    return { blocks: [] };
  }
  const pos = positionOf(inherited.xfrm, ctx);
  const alt = altOf(facts);
  // the exporter widens every text box by WIDTH_SLACK_IN (0.02 in, 2.4 px) so no line wraps early
  // (pptx/text.ts); a round trip text box gives the slack back so the box lands where it was
  const trip = parseRoundTripName(facts.name);
  if (
    ctx.roundTrip &&
    trip !== undefined &&
    (role.kind === 'textBox' || role.kind === 'placeholder')
  ) {
    const slack = px2(0.02 * 120 * (ctx.mapping.scale * 7620));
    pos.w = Math.max(1, px2(pos.w - slack));
  }

  if (role.kind === 'placeholder' && DROPPED_PLACEHOLDER_TYPES.has(role.type)) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.placeholderFooter,
      message: `The ${role.type} placeholder was left out; the frame draws the counter and the footer`,
    });
    return { blocks: [] };
  }

  if (role.kind === 'line')
    return { blocks: readLineShape(shape, facts, geometry, line, pos, alt, ctx) };

  const mark = ctx.report.mark();
  const text = readTextBody(ctx, { shape });
  for (const [family, runs] of text?.fonts ?? []) ctx.report.font(family, runs);

  if (role.kind === 'placeholder') {
    if (text === undefined || text.empty) {
      ctx.report.drop({
        ...rowOn(ctx, object),
        code: ROW_CODES.placeholderEmpty,
        message: `An empty ${role.type} placeholder was left out`,
      });
      return { blocks: [] };
    }
    return { blocks: [placeholderBlock(role.type, text, pos, alt, facts, ctx, mark)] };
  }

  if (role.kind === 'textBox') {
    if (text === undefined || text.empty) {
      ctx.report.drop({
        ...rowOn(ctx, object),
        code: 'text.empty',
        message: 'An empty text box was left out',
      });
      return { blocks: [] };
    }
    return { blocks: textBlocks(text, pos, alt, facts, ctx, spPr, {}, mark) };
  }

  // a shape proper
  if (geometry.kind === 'custom')
    return { blocks: customGeometryBlocks(geometry, facts, fill, line, pos, alt, ctx, spPr) };
  const prst = geometry.kind === 'preset' ? geometry.prst : 'rect';
  if (geometry.kind === 'preset' && !geometry.exact) {
    const original = attr(child(spPr as Element, 'a', 'prstGeom') as Element, 'prst') ?? prst;
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.shapePreset,
      message: `The ${original} shape is outside the 135 presets and became ${prst}`,
    });
  }
  const block: ShapeBlock = {
    id: ctx.ids.take(facts.name, 'shape'),
    type: 'shape',
    shape: prst,
    pos,
  };
  if (geometry.kind === 'preset' && geometry.adjust.length > 0) {
    const defaults = shapeAdjustDefaults(prst);
    if (geometry.adjust.some((v, i) => v !== defaults[i])) block.adjust = geometry.adjust;
    if (prst === 'roundRect') {
      const adj = geometry.adjust[0] ?? 16667;
      block.radius = halfPx((Math.min(pos.w, pos.h) * adj) / 100_000);
      delete block.adjust;
    }
  }
  applyFill(block, fill, facts, ctx, spPr);
  applyLine(block, line, facts, ctx);
  growByStroke(block, line);
  const shadow = readShadow(spPr, ctx, object);
  if (shadow !== undefined) block.shadow = shadow;
  if (text !== undefined && !text.empty) {
    block.text = text.text;
    if (text.typography !== undefined) block.typography = text.typography;
    if (text.color !== undefined) block.color = text.color;
    if (text.valign !== undefined) block.valign = text.valign;
    if (text.padding !== undefined) block.padding = text.padding;
    if (text.autofit !== 'none') block.autofit = text.autofit;
  }
  if (alt !== undefined) block.alt = alt;
  const link = shapeLink(shape, ctx);
  if (link !== undefined) block.link = link;
  reportThreeD(spPr, ctx, object);
  ctx.report.keepUnless(mark);
  block.ext = { pptxName: facts.name };
  return { blocks: [placed(ctx, block)] };
}

/**
 * PowerPoint centres an outline on the geometry's edge while the sheet draws a shape's stroke
 * inside its box (the exporter's `outlineBox` shrinks the box by half the stroke going out,
 * pptx/shapes.ts), so a stroked shape's box grows by the stroke width coming in and the outer edge
 * lands where the file shows it.
 */
function growByStroke(block: ShapeBlock, line: LineReading): void {
  if (!line.present || line.noFill || block.width === undefined || block.pos === undefined) return;
  const w = block.width;
  block.pos = {
    ...block.pos,
    x: px2(block.pos.x - w / 2),
    y: px2(block.pos.y - w / 2),
    w: px2(block.pos.w + w),
    h: px2(block.pos.h + w),
  };
}

function reportThreeD(spPr: Element | undefined, ctx: SlideContext, object: string): void {
  if (spPr === undefined) return;
  if (child(spPr, 'a', 'scene3d') !== undefined || child(spPr, 'a', 'sp3d') !== undefined)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.shapeEffect,
      message: 'The 3D format was dropped',
    });
}

/** The `a:hlinkClick` on a shape's `p:cNvPr`: the whole object links. */
function shapeLink(shape: Element, ctx: SlideContext): string | undefined {
  const nv = elementChildren(shape).find((node) => /^nv[A-Za-z]*Pr$/.test(node.localName ?? ''));
  const cNvPr = nv === undefined ? undefined : child(nv, 'p', 'cNvPr');
  const click = cNvPr === undefined ? undefined : child(cNvPr, 'a', 'hlinkClick');
  const link = linkOf(click, ctx);
  if (link === undefined) return undefined;
  if ('link' in link) return link.link;
  ctx.report.drop({
    ...rowOn(ctx, shapeFacts(shape).name),
    code: ROW_CODES.textLink,
    message: `A link to ${link.dropped} on the object was dropped`,
  });
  return undefined;
}

function applyFill(
  block: ShapeBlock,
  fill: FillReading | undefined,
  facts: ShapeFacts,
  ctx: SlideContext,
  spPr: Element | undefined,
): void {
  if (fill === undefined) return;
  const ground = ctx.chain.colors.scheme.colors.lt1;
  switch (fill.kind) {
    case 'solid':
      block.fill = colorOf(fill.color, ctx, ground);
      if (fill.color.alpha < 1 && ctx.options.theme === 'keep')
        ctx.report.substitute({
          ...rowOn(ctx, facts.name),
          code: ROW_CODES.shapeFill,
          message: `A fill at ${Math.round(fill.color.alpha * 100)} percent was made opaque`,
        });
      break;
    case 'none':
      break;
    case 'gradient':
      if (fill.color !== undefined) block.fill = colorOf(fill.color, ctx, ground);
      ctx.report.substitute({
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.shapeFill,
        message: `A gradient of ${fill.stops} stops became its first colour`,
      });
      break;
    case 'pattern':
      if (fill.color !== undefined) block.fill = colorOf(fill.color, ctx, ground);
      ctx.report.substitute({
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.shapeFill,
        message: `The ${fill.preset} pattern fill became its foreground colour`,
      });
      break;
    case 'picture':
      ctx.report.substitute({
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.shapeFill,
        message: 'A picture fill on a shape was dropped; the shape keeps its outline',
      });
      break;
    case 'group':
      break;
    default:
      ctx.report.substitute({
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.shapeFill,
        message: `The ${fill.element} fill was dropped`,
      });
  }
  void spPr;
}

function applyLine(
  block: ShapeBlock,
  line: LineReading,
  facts: ShapeFacts,
  ctx: SlideContext,
): void {
  if (!line.present || line.noFill) return;
  if (line.color !== undefined) block.stroke = line.color;
  if (line.widthPx !== undefined) {
    const { value, delta } = snapLadder(line.widthPx, SHAPE_STROKE_LADDER);
    block.width = value;
    if (delta > 0.25)
      ctx.report.row('kept', {
        ...rowOn(ctx, facts.name),
        code: 'shape.strokeWidth',
        message: `A ${line.widthPx} px outline snapped to ${value} px`,
      });
  }
  if (line.dash !== undefined) block.dash = line.dash;
  if (!line.dashExact)
    ctx.report.substitute({
      ...rowOn(ctx, facts.name),
      code: 'shape.dash',
      message: 'A dash pattern outside the six presets became the nearest one',
    });
}

/** A placeholder's block by its type (R04 5.2). */
function placeholderBlock(
  type: string,
  text: TextBodyReading,
  pos: Position,
  alt: string | undefined,
  facts: ShapeFacts,
  ctx: SlideContext,
  mark: number,
): Block {
  const size = text.typography?.size;
  if (type === 'title' || type === 'ctrTitle') {
    ctx.report.keepUnless(mark);
    const block: HeadingBlock = {
      id: ctx.ids.take(facts.name, 'h'),
      type: 'heading',
      level: size !== undefined && size >= H1_MIN_PX ? 'h1' : 'h2',
      text: text.text,
      pos,
    };
    if (text.typography !== undefined) block.typography = text.typography;
    if (text.autofit !== 'none') block.autofit = text.autofit;
    if (alt !== undefined) block.alt = alt;
    block.ext = { pptxName: facts.name, placeholder: type };
    return placed(ctx, block);
  }
  if (type === 'subTitle') {
    ctx.report.keepUnless(mark);
    const block: ParagraphBlock = {
      id: ctx.ids.take(facts.name, 'p'),
      type: 'paragraph',
      role: 'lead',
      text: text.text,
      pos,
    };
    if (text.typography !== undefined) block.typography = text.typography;
    if (text.autofit !== 'none') block.autofit = text.autofit;
    if (alt !== undefined) block.alt = alt;
    block.ext = { pptxName: facts.name, placeholder: type };
    return placed(ctx, block);
  }
  // body, obj and every other placeholder kind with text: a list when bulleted, else a text block
  const blocks = textBlocks(text, pos, alt, facts, ctx, undefined, { placeholder: type }, mark);
  return blocks[0] as Block;
}

/** A text body as blocks: a `plain` list, a `panel` for one paragraph of code, else `text` blocks (split by size when asked). */
export function textBlocks(
  text: TextBodyReading,
  pos: Position,
  alt: string | undefined,
  facts: ShapeFacts,
  ctx: SlideContext,
  spPr: Element | undefined,
  ext: Record<string, unknown> = {},
  mark: number = ctx.report.mark(),
): Block[] {
  void spPr;
  const object = facts.name;
  if (text.list !== undefined) {
    ctx.report.keepUnless(mark);
    const block: PlainBlock = {
      id: ctx.ids.take(facts.name, 'list'),
      type: 'plain',
      marker: text.list.marker,
      preset: text.list.preset,
      items: text.list.items,
      pos,
    };
    if (text.list.marker === 'number') block.numbered = true;
    if (text.list.start !== undefined) block.start = text.list.start;
    const size = text.typography?.size;
    if (size !== undefined) block.size = size >= 23 ? 24 : size >= 21 ? 22 : 20;
    if (alt !== undefined) block.alt = alt;
    block.ext = { pptxName: facts.name, ...ext };
    return [placed(ctx, block)];
  }
  if (text.mixedList) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.textMixedList,
      message:
        'A body with bulleted and plain paragraphs became one text block with the glyphs as text',
    });
    const lines = text.text.split('\n').map((line, i) => {
      const p = text.paragraphs[i];
      if (p === undefined || p.bullet === undefined || p.runs.length === 0) return line;
      const glyph =
        p.bullet.kind === 'char'
          ? p.bullet.char
          : p.bullet.kind === 'autonum'
            ? `${p.bullet.startAt + i}.`
            : '•';
      return `${'  '.repeat(p.level)}${glyph} ${line}`;
    });
    return [textBlock({ ...text, text: lines.join('\n') }, pos, alt, facts, ctx, ext)];
  }
  if (text.monospace && text.paragraphs.length === 1 && !text.text.includes('\n')) {
    ctx.report.keepUnless(mark);
    const block: PanelBlock = {
      id: ctx.ids.take(facts.name, 'panel'),
      type: 'panel',
      code: text.plain,
      pos,
    };
    if (alt !== undefined) block.alt = alt;
    block.ext = { pptxName: facts.name, ...ext };
    return [placed(ctx, block)];
  }
  if (text.mixedSizes && ctx.options.splitMixedSizes && text.paragraphs.length > 1)
    return splitBySize(text, pos, alt, facts, ctx, ext);
  if (text.mixedSizes)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.textRunSize,
      message: 'Runs of different sizes in one body took the first run’s size',
    });
  else ctx.report.keepUnless(mark);
  return [textBlock(text, pos, alt, facts, ctx, ext)];
}

function textBlock(
  text: TextBodyReading,
  pos: Position,
  alt: string | undefined,
  facts: ShapeFacts,
  ctx: SlideContext,
  ext: Record<string, unknown>,
): Block {
  const block: TextBlock = {
    id: ctx.ids.take(facts.name, 'text'),
    type: 'text',
    text: text.text,
    pos,
  };
  const typography = { ...(text.typography ?? {}) };
  if (text.columns !== undefined) typography.columns = text.columns;
  if (Object.keys(typography).length > 0) block.typography = typography;
  if (text.color !== undefined) block.color = text.color;
  if (text.valign !== undefined) block.valign = text.valign;
  if (text.padding !== undefined) block.padding = text.padding;
  if (text.autofit !== 'none') block.autofit = text.autofit;
  if (text.outline !== undefined) block.outline = text.outline;
  if (alt !== undefined) block.alt = alt;
  block.ext = { pptxName: facts.name, ...ext };
  return placed(ctx, block);
}

/** One text block per group of paragraphs with the same ladder size, stacked by a line estimate (R04 5.2). */
function splitBySize(
  text: TextBodyReading,
  pos: Position,
  alt: string | undefined,
  facts: ShapeFacts,
  ctx: SlideContext,
  ext: Record<string, unknown>,
): Block[] {
  ctx.report.substitute({
    ...rowOn(ctx, facts.name),
    code: ROW_CODES.textRunSize,
    message: 'A body with runs of different sizes was split into one text block per size',
  });
  const groups: { size: number; paragraphs: typeof text.paragraphs }[] = [];
  for (const p of text.paragraphs) {
    const size = p.sizes[0] ?? p.emptySize ?? text.typography?.size ?? 18;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.size === size) last.paragraphs.push(p);
    else groups.push({ size, paragraphs: [p] });
  }
  const leading = text.typography?.leading ?? 1.2;
  const heights = groups.map((g) =>
    g.paragraphs.reduce(
      (sum, p) =>
        sum +
        Math.max(
          1,
          Math.ceil((p.runs.map((r) => r.t).join('').length * g.size * 0.5) / Math.max(1, pos.w)),
        ) *
          g.size *
          leading,
      0,
    ),
  );
  const total = heights.reduce((a, b) => a + b, 0) || 1;
  const blocks: Block[] = [];
  let y = pos.y;
  groups.forEach((group, i) => {
    const h = Math.max(g0(group.size, leading), ((heights[i] ?? 0) / total) * pos.h);
    const part: TextBodyReading = {
      ...text,
      paragraphs: group.paragraphs,
      text: group.paragraphs.map((p) => serialize(p)).join('\n'),
      typography: {
        ...(text.typography ?? {}),
        size: ctx.options.snapLadder ? group.size : halfPx(group.size),
      },
    };
    blocks.push(
      textBlock(
        part,
        { ...pos, y: px2(y), h: px2(h) },
        i === 0 ? alt : undefined,
        { ...facts, name: i === 0 ? facts.name : `${facts.name} ${i + 1}` },
        ctx,
        ext,
      ),
    );
    y += h;
  });
  return blocks;
}

function g0(size: number, leading: number): number {
  return size * leading;
}

function serialize(p: TextBodyReading['paragraphs'][number]): string {
  // the runs already carry their marks; the schema's serializer writes the canonical markup
  return p.runs.length === 0 ? '' : serializeRuns(p.runs);
}

/** Lines and connectors (R04 5.4): `line`, `arrow`, `elbow`, `curved`, or a `rule` for a 1 px hair line. */
function readLineShape(
  shape: Element,
  facts: ShapeFacts,
  geometry: GeometryReading,
  line: LineReading,
  pos: Position,
  alt: string | undefined,
  ctx: SlideContext,
): Block[] {
  const prst = geometry.kind === 'preset' ? geometry.prst : 'line';
  const object = facts.name;
  const horizontal = pos.h <= 1;
  const vertical = pos.w <= 1;
  const widthPx = line.widthPx ?? 0.75;
  // a 1 px horizontal or vertical hair line is a rule (the grammar primitive, R04 5.4)
  if (
    (horizontal || vertical) &&
    widthPx <= 1.25 &&
    line.headEnd === undefined &&
    line.tailEnd === undefined &&
    /^(line|straightConnector1)$/.test(prst)
  ) {
    ctx.report.keep();
    const rule: RuleBlock = {
      id: ctx.ids.take(facts.name, 'rule'),
      type: 'rule',
      orientation: horizontal ? 'horizontal' : 'vertical',
      length: px2(horizontal ? pos.w : pos.h),
      pos: { ...pos, w: Math.max(1, pos.w), h: Math.max(1, pos.h) },
    };
    if (line.color !== undefined && line.color !== 'hair') rule.color = line.color;
    if (line.dash !== undefined) rule.dash = line.dash;
    if (alt !== undefined) rule.alt = alt;
    rule.ext = { pptxName: facts.name };
    return [placed(ctx, rule)];
  }
  ctx.report.keep();
  let kind: ShapeBlock['shape'] = 'line';
  if (/^bentConnector/.test(prst)) kind = 'elbow';
  else if (/^curvedConnector/.test(prst)) kind = 'curved';
  else if (line.headEnd !== undefined || line.tailEnd !== undefined) kind = 'arrow';
  const block: ShapeBlock = {
    id: ctx.ids.take(facts.name, kind),
    type: 'shape',
    shape: kind,
    pos: { ...pos, w: Math.max(1, pos.w), h: Math.max(1, pos.h) },
  };
  if (kind === 'line' || kind === 'arrow') {
    if (horizontal) block.orientation = 'horizontal';
    else if (vertical) block.orientation = 'vertical';
    else {
      const flipped = (pos.flip === 'h') !== (pos.flip === 'v');
      block.orientation = flipped ? 'diagonal-up' : 'diagonal-down';
    }
  }
  if (line.color !== undefined) block.stroke = line.color;
  if (line.widthPx !== undefined) block.width = snapLadder(line.widthPx, SHAPE_STROKE_LADDER).value;
  if (line.dash !== undefined) block.dash = line.dash;
  // head and tail swap when the connector is flipped along its axis so the arrow points as drawn
  const swap = pos.flip === 'h' || pos.flip === 'v';
  const start = swap ? line.tailEnd : line.headEnd;
  const end = swap ? line.headEnd : line.tailEnd;
  if (start !== undefined) block.lineStart = start;
  if (end !== undefined) block.lineEnd = end;
  if (kind === 'arrow' && block.lineEnd === undefined && block.lineStart === undefined)
    block.lineEnd = 'fillArrow';
  if (kind === 'elbow' || kind === 'curved') {
    const adj = geometry.kind === 'preset' ? geometry.adjust[0] : undefined;
    if (adj !== undefined && /Connector3$/.test(prst))
      block.bend = Math.round((adj / 100_000) * 1000) / 1000;
    else if (adj !== undefined && !/Connector3$/.test(prst))
      ctx.report.substitute({
        ...rowOn(ctx, object),
        code: 'connector.bends',
        message: `A ${prst} connector kept its first bend alone`,
      });
  }
  const cxn = path(shape, ['p', 'nvCxnSpPr'], ['p', 'cNvCxnSpPr']);
  if (cxn !== undefined) {
    const connect: NonNullable<ShapeBlock['connect']> = {};
    for (const [name, key] of [
      ['stCxn', 'start'],
      ['endCxn', 'end'],
    ] as const) {
      const el = child(cxn, 'a', name);
      if (el === undefined) continue;
      const id = intAttr(el, 'id');
      const idx = intAttr(el, 'idx') ?? 0;
      const target = id === undefined ? undefined : ctx.shapeIds.get(id);
      if (target === undefined || idx >= 8) {
        ctx.report.row('kept', {
          ...rowOn(ctx, object),
          code: 'connector.site',
          message: `A connector end was left unattached (shape ${id ?? '?'}, site ${idx})`,
        });
        continue;
      }
      connect[key] = { block: target, site: idx };
    }
    if (connect.start !== undefined || connect.end !== undefined) block.connect = connect;
  }
  if (alt !== undefined) block.alt = alt;
  block.ext = { pptxName: facts.name };
  return [placed(ctx, block)];
}

/** Custom geometry sampled into polylines (R04 5.3): one block per `a:path`. */
function customGeometryBlocks(
  geometry: Extract<GeometryReading, { kind: 'custom' }>,
  facts: ShapeFacts,
  fill: FillReading | undefined,
  line: LineReading,
  pos: Position,
  alt: string | undefined,
  ctx: SlideContext,
  spPr: Element | undefined,
): Block[] {
  const blocks: Block[] = [];
  geometry.paths.forEach((p, index) => {
    const w = Number(attr(p, 'w') ?? '0') || 1;
    const h = Number(attr(p, 'h') ?? '0') || 1;
    const points: [number, number][] = [];
    let closed = false;
    let current: [number, number] = [0, 0];
    const pt = (el: Element): [number, number] => [
      Number(attr(el, 'x') ?? '0') / w,
      Number(attr(el, 'y') ?? '0') / h,
    ];
    const push = (point: [number, number]): void => {
      const rounded: [number, number] = [
        Math.round(point[0] * 10000) / 10000,
        Math.round(point[1] * 10000) / 10000,
      ];
      const last = points[points.length - 1];
      if (last === undefined || last[0] !== rounded[0] || last[1] !== rounded[1])
        points.push(rounded);
      current = point;
    };
    for (const cmd of elementChildren(p)) {
      const pts = children(cmd, 'a', 'pt').map(pt);
      switch (cmd.localName) {
        case 'moveTo':
        case 'lnTo':
          if (pts[0] !== undefined) push(pts[0]);
          break;
        case 'cubicBezTo': {
          const [c1, c2, end] = pts;
          if (c1 && c2 && end)
            for (let t = 1; t <= 8; t += 1) push(cubic(current, c1, c2, end, t / 8));
          break;
        }
        case 'quadBezTo': {
          const [c, end] = pts;
          if (c && end) for (let t = 1; t <= 4; t += 1) push(quad(current, c, end, t / 4));
          break;
        }
        case 'arcTo': {
          const wR = Number(attr(cmd, 'wR') ?? '0') / w;
          const hR = Number(attr(cmd, 'hR') ?? '0') / h;
          const stAng = (Number(attr(cmd, 'stAng') ?? '0') / 60000) * (Math.PI / 180);
          const swAng = (Number(attr(cmd, 'swAng') ?? '0') / 60000) * (Math.PI / 180);
          const cx = current[0] - wR * Math.cos(stAng);
          const cy = current[1] - hR * Math.sin(stAng);
          for (let t = 1; t <= 8; t += 1) {
            const a = stAng + (swAng * t) / 8;
            push([cx + wR * Math.cos(a), cy + hR * Math.sin(a)]);
          }
          break;
        }
        case 'close':
          closed = true;
          break;
        default:
          break;
      }
    }
    if (points.length < 2) return;
    // a control point outside the path box grows the box so every point stays a fraction in 0 to 1
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(0, ...xs);
    const minY = Math.min(0, ...ys);
    const maxX = Math.max(1, ...xs);
    const maxY = Math.max(1, ...ys);
    let box = pos;
    let normalized = points;
    if (minX < 0 || minY < 0 || maxX > 1 || maxY > 1) {
      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      box = {
        ...pos,
        x: px2(pos.x + minX * pos.w),
        y: px2(pos.y + minY * pos.h),
        w: Math.max(1, px2(pos.w * spanX)),
        h: Math.max(1, px2(pos.h * spanY)),
      };
      normalized = points.map(([x, y]) => [
        Math.round(((x - minX) / spanX) * 10000) / 10000,
        Math.round(((y - minY) / spanY) * 10000) / 10000,
      ]);
    }
    const block: ShapeBlock = {
      id: ctx.ids.take(index === 0 ? facts.name : `${facts.name} ${index + 1}`, 'polyline'),
      type: 'shape',
      shape: 'polyline',
      points: normalized,
      pos: box,
    };
    if (closed) block.closed = true;
    const fillAttr = attr(p, 'fill');
    if (fillAttr !== 'none' && closed) applyFill(block, fill, facts, ctx, spPr);
    if (attr(p, 'stroke') !== '0') {
      applyLine(block, line, facts, ctx);
      growByStroke(block, line);
    }
    if (index === 0 && alt !== undefined) block.alt = alt;
    block.ext = { pptxName: facts.name };
    blocks.push(placed(ctx, block));
  });
  if (blocks.length === 0) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: 'shape.custom',
      message: 'A custom geometry with no drawable path was dropped',
    });
    return [];
  }
  ctx.report.substitute({
    ...rowOn(ctx, facts.name),
    code: 'shape.custom',
    message: `A custom geometry was sampled into ${blocks.length === 1 ? 'a polyline' : `${blocks.length} polylines`}`,
  });
  return blocks;
}

function cubic(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
    mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function quad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

/** A percentage string helper the picture reader shares. */
export { percentOf };
