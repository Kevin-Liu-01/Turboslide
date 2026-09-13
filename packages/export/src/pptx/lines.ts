// Hairlines, plates and rects (SPEC 8.2): a 1 px rule is a 0.6 pt line (`<a:ln w="7620">`) in the
// composite color on paper, or in the ink with alpha over a picture (`<a:alpha val="18000"/>`,
// measured); a plate or chip is a rectangle with `line: { type: 'none' }` (`width: 0` means 1 pt
// in pptxgenjs, pptx report section 6 item 6); crosses are two 1 px lines each. The freeform
// round's primitives (docs/freeform.md) travel the same way: a box or a closed shape is a
// `rect`, `roundRect` (with `rectRadius`) or `ellipse` preset geometry with its fill and outline,
// a shape with no fill writes `fill: { type: 'none' }`, and a line or arrow is a native line from
// its measured ends with `triangle` arrowheads at the headed ends. The Google Slides parity round
// two (gslides-parity SPEC-2 2.1, 2.3, 2.4) adds the presets of shapes.ts as their ECMA
// `prstGeom` name (their adjust values in the post-process), the rotation, flip, shadow, dash and
// alt text of every shape, the ten line decorations, the elbow and curved connectors as
// `bentConnector3` and `curvedConnector3`, and the path kinds as custom geometry (a curve as the
// sheet's cubic segments). An outlined shape is written at its box drawn in by half the stroke
// (shapes.ts `outlineBox`), because the viewer centres an outline on the geometry.
import type PptxGenJS from 'pptxgenjs';

import type { Box } from '@turboslide/schema/render';

import type { SceneRect, SceneRule, SceneSegment } from '../scene/types.ts';
import { compositeHex, parseCssColor, pxToIn, pxToPt, transparencyOf } from '../units.ts';
import {
  LEGACY_PRESET,
  arrowHead,
  connectorPreset,
  customGeometryPoints,
  dashType,
  objectName,
  objectProps,
  outlineBox,
  prst,
  segmentBox,
} from './shapes.ts';

export type LineEmitOptions = {
  /** The paper hex the translucent tokens composite on; undefined keeps alpha (over a picture). */
  paperHex?: string;
  namePrefix: string;
  /** A block link on the shape (gslides-parity SPEC 7.2.7), resolved by the builder. */
  hyperlink?: PptxGenJS.HyperlinkProps;
  /** Residual lines the shapes add (a substituted line head, a curve as a polyline), for the report. */
  residual?: Set<string>;
};

/** The line color options: composite on paper, or the raw color with its alpha as transparency. */
export function lineColor(
  cssColor: string,
  paperHex: string | undefined,
): { color: string; transparency?: number } {
  const parsed = parseCssColor(cssColor);
  if (parsed.alpha >= 1) return { color: parsed.hex };
  if (paperHex) return { color: compositeHex(parsed, paperHex) };
  return { color: parsed.hex, transparency: transparencyOf(parsed.alpha) };
}

/** A rule box (an axis-aligned 1 px strip) as a pptxgenjs line along its long axis. */
export function ruleGeometry(box: Box): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = box;
  if (w >= h) return { x: pxToIn(x), y: pxToIn(y + h / 2), w: pxToIn(w), h: 0 };
  return { x: pxToIn(x + w / 2), y: pxToIn(y), w: 0, h: pxToIn(h) };
}

export function addSceneRule(
  slide: PptxGenJS.Slide,
  rule: SceneRule,
  options: LineEmitOptions,
  name: string,
): void {
  const color = lineColor(rule.color, options.paperHex);
  const line: PptxGenJS.ShapeLineProps = { color: color.color, width: pxToPt(rule.width) };
  if (color.transparency !== undefined) line.transparency = color.transparency;
  slide.addShape('line', {
    ...ruleGeometry(rule.box),
    line,
    objectName: `${options.namePrefix}#${name}${rule.group ? `@${rule.group}` : ''}`,
  });
}

/** The 11 by 11 registration cross: a vertical and a horizontal 1 px line through the center. */
export function addCross(
  slide: PptxGenJS.Slide,
  box: Box,
  cssColor: string,
  options: LineEmitOptions,
  name: string,
): void {
  const [x, y, w, h] = box;
  const color = lineColor(cssColor, options.paperHex);
  const line: PptxGenJS.ShapeLineProps = { color: color.color, width: pxToPt(1) };
  if (color.transparency !== undefined) line.transparency = color.transparency;
  slide.addShape('line', {
    x: pxToIn(x + Math.floor(w / 2) + 0.5),
    y: pxToIn(y),
    w: 0,
    h: pxToIn(h),
    line,
    objectName: `${options.namePrefix}#${name}/v`,
  });
  slide.addShape('line', {
    x: pxToIn(x),
    y: pxToIn(y + Math.floor(h / 2) + 0.5),
    w: pxToIn(w),
    h: 0,
    line,
    objectName: `${options.namePrefix}#${name}/h`,
  });
}

/** The fill props of a measured color: composite on paper, alpha as transparency, alpha 0 as no fill. */
export function fillProps(
  cssColor: string,
  paperHex: string | undefined,
): PptxGenJS.ShapeFillProps {
  const fill = parseCssColor(cssColor);
  if (fill.alpha === 0) return { type: 'none' };
  const props: PptxGenJS.ShapeFillProps = { color: fill.hex };
  if (fill.alpha < 1 && !paperHex) props.transparency = transparencyOf(fill.alpha);
  else if (fill.alpha < 1 && paperHex) props.color = compositeHex(fill, paperHex);
  return props;
}

/** The outline props of a rect: its measured line with the dash of SPEC-2 2.3.3, or none. */
export function rectLine(rect: SceneRect, paperHex: string | undefined): PptxGenJS.ShapeLineProps {
  if (!rect.line) return { type: 'none' };
  const color = lineColor(rect.line.color, paperHex);
  const line: PptxGenJS.ShapeLineProps = { color: color.color, width: pxToPt(rect.line.width) };
  if (color.transparency !== undefined) line.transparency = color.transparency;
  const dash = dashType(rect.dash);
  if (dash) line.dashType = dash;
  return line;
}

/**
 * The geometry a rect travels as: a preset of shapes.ts by its ECMA name (SPEC-2 2.3.1), else the
 * round one rect, roundRect or ellipse, with the corner radius of a rounded rectangle as
 * `rectRadius`.
 */
export function rectShape(rect: SceneRect): { shape: PptxGenJS.SHAPE_NAME; rectRadius?: number } {
  if (rect.preset !== undefined) return { shape: prst(LEGACY_PRESET[rect.preset] ?? rect.preset) };
  const shape: PptxGenJS.SHAPE_NAME =
    rect.shape === 'ellipse' ? 'ellipse' : rect.shape === 'roundRect' ? 'roundRect' : 'rect';
  return {
    shape,
    ...(shape === 'roundRect' ? { rectRadius: pxToIn(rect.radius ?? 0) } : {}),
  };
}

/**
 * A filled rectangle, rounded rectangle, ellipse or preset with no outline unless the rect carries
 * one, its rotation, flip, shadow, dash and alt text (SPEC-2 2.1, 2.3). The name carries the user
 * group as `@g:<tag>` and a row group after it.
 */
export function addSceneRect(
  slide: PptxGenJS.Slide,
  rect: SceneRect,
  options: LineEmitOptions,
  name: string,
): void {
  // an outlined shape or box is written drawn in by half its stroke (outlineBox): the viewer
  // centres the outline on the geometry, the sheet keeps it inside the box
  const [x, y, w, h] = outlineBox(rect);
  const { shape, rectRadius } = rectShape(rect);
  slide.addShape(shape, {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    fill: fillProps(rect.fill, options.paperHex),
    line: rectLine(rect, options.paperHex),
    ...(rectRadius !== undefined ? { rectRadius } : {}),
    ...(options.hyperlink ? { hyperlink: options.hyperlink } : {}),
    ...objectProps(rect),
    objectName: objectName(options.namePrefix, name, rect.userGroup, rect.group),
  });
}

/**
 * The invisible hit target of a linked block in the flatten file (gslides-parity SPEC 7.2.7): a
 * rectangle over the block's box with a fully transparent fill (a filled shape is clickable
 * inside, a shape with no fill only on its edge in PowerPoint) and no outline, above the cover
 * picture so the click reaches it.
 */
export function addLinkRect(
  slide: PptxGenJS.Slide,
  box: Box,
  hyperlink: PptxGenJS.HyperlinkProps,
  paperHex: string,
  name: string,
): void {
  const [x, y, w, h] = box;
  slide.addShape('rect', {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    fill: { color: paperHex, transparency: 100 },
    line: { type: 'none' },
    hyperlink,
    objectName: name,
  });
}

/** The line props of a segment: colour, width, dash and the two heads (the round one triangles or the decorations). */
function segmentLine(line: SceneSegment, options: LineEmitOptions): PptxGenJS.ShapeLineProps {
  const color = lineColor(line.color, options.paperHex);
  const props: PptxGenJS.ShapeLineProps = { color: color.color, width: pxToPt(line.width) };
  if (color.transparency !== undefined) props.transparency = color.transparency;
  const dash = dashType(line.dash);
  if (dash) props.dashType = dash;
  if (line.startEnd !== undefined || line.endEnd !== undefined) {
    // the decorations of SPEC-2 2.4.5; a substituted head is one residual line
    for (const [side, kind] of [
      ['begin', line.startEnd],
      ['end', line.endEnd],
    ] as const) {
      const { head, exact } = arrowHead(kind);
      if (head === 'none') continue;
      if (side === 'begin') props.beginArrowType = head;
      else props.endArrowType = head;
      if (!exact)
        options.residual?.add(
          `line heads: ${kind} on ${options.namePrefix}#${line.blockId} travels as ${head}; PowerPoint draws no ${kind} head (gslides-parity SPEC-2 2.4.5)`,
        );
    }
    return props;
  }
  if (line.heads === 'start' || line.heads === 'both') props.beginArrowType = 'triangle';
  if (line.heads === 'end' || line.heads === 'both') props.endArrowType = 'triangle';
  return props;
}

/**
 * A line or arrow between two measured points. A pptxgenjs line runs from the top left to the
 * bottom right of its box, so a line whose end lies left of or above its start flips: `flipH`
 * when x2 < x1, `flipV` when y2 < y1, which keeps the shape's begin at `from` and its end at `to`
 * so the arrowheads land where the sheet drew them. An elbow or curved connector (SPEC-2 2.4.1,
 * 2.4.2) is the ECMA connector preset over the same box, its bend an adjust value the post-process
 * writes; a polyline or scribble (2.4.4) is a custom geometry through its points and a curve
 * (2.4.3) one through the Catmull-Rom cubics the sheet draws (`catmullRomSegments`), so the file
 * holds the curve itself.
 */
export function addSceneLine(
  slide: PptxGenJS.Slide,
  line: SceneSegment,
  options: LineEmitOptions,
  name: string,
): void {
  const [x1, y1] = line.from;
  const [x2, y2] = line.to;
  const props = segmentLine(line, options);
  const common = {
    line: props,
    ...(options.hyperlink ? { hyperlink: options.hyperlink } : {}),
    objectName: objectName(options.namePrefix, name, line.userGroup),
    ...objectProps(line),
  };
  if (line.kind === 'curve' || line.kind === 'polyline' || line.kind === 'scribble') {
    const box = segmentBox(line);
    if (line.kind === 'curve' && (line.points?.length ?? 0) > 2)
      options.residual?.add(
        `paths: ${options.namePrefix}#${line.blockId} is a curve through its points; the file holds the sheet's Catmull-Rom cubics as a:cubicBezTo segments (gslides-parity SPEC-2 2.4.3)`,
      );
    slide.addShape(prst('custGeom'), {
      x: pxToIn(box.x),
      y: pxToIn(box.y),
      w: pxToIn(box.w),
      h: pxToIn(box.h),
      points: customGeometryPoints(line, box),
      fill: line.closed && line.fill ? fillProps(line.fill, options.paperHex) : { type: 'none' },
      ...common,
    });
    return;
  }
  const flipH = x2 < x1;
  const flipV = y2 < y1;
  const geometry = {
    x: pxToIn(Math.min(x1, x2)),
    y: pxToIn(Math.min(y1, y2)),
    w: pxToIn(Math.abs(x2 - x1)),
    h: pxToIn(Math.abs(y2 - y1)),
  };
  if (line.kind === 'elbow' || line.kind === 'curved') {
    slide.addShape(prst(connectorPreset(line.kind)), {
      ...geometry,
      ...(flipH ? { flipH: true } : {}),
      ...(flipV ? { flipV: true } : {}),
      fill: { type: 'none' },
      ...common,
    });
    return;
  }
  slide.addShape('line', {
    ...geometry,
    ...(flipH ? { flipH: true } : {}),
    ...(flipV ? { flipV: true } : {}),
    ...common,
  });
}
