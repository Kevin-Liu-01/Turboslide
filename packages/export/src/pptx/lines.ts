// Hairlines, plates and rects (SPEC 8.2): a 1 px rule is a 0.6 pt line (`<a:ln w="7620">`) in the
// composite color on paper, or in the ink with alpha over a picture (`<a:alpha val="18000"/>`,
// measured); a plate or chip is a rectangle with `line: { type: 'none' }` (`width: 0` means 1 pt
// in pptxgenjs, pptx report section 6 item 6); crosses are two 1 px lines each. The freeform
// round's primitives (docs/freeform.md) travel the same way: a box or a closed shape is a
// `rect`, `roundRect` (with `rectRadius`) or `ellipse` preset geometry with its fill and outline,
// a shape with no fill writes `fill: { type: 'none' }`, and a line or arrow is a native line from
// its measured ends with `triangle` arrowheads at the headed ends.
import type PptxGenJS from 'pptxgenjs';

import type { Box } from '@turboslide/schema/render';

import type { SceneRect, SceneRule, SceneSegment } from '../scene/types.ts';
import { compositeHex, parseCssColor, pxToIn, pxToPt, transparencyOf } from '../units.ts';

export type LineEmitOptions = {
  /** The paper hex the translucent tokens composite on; undefined keeps alpha (over a picture). */
  paperHex?: string;
  namePrefix: string;
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

/** A filled rectangle, rounded rectangle or ellipse with no outline unless the rect carries one. */
export function addSceneRect(
  slide: PptxGenJS.Slide,
  rect: SceneRect,
  options: LineEmitOptions,
  name: string,
): void {
  const [x, y, w, h] = rect.box;
  let line: PptxGenJS.ShapeLineProps = { type: 'none' };
  if (rect.line) {
    const color = lineColor(rect.line.color, options.paperHex);
    line = { color: color.color, width: pxToPt(rect.line.width) };
    if (color.transparency !== undefined) line.transparency = color.transparency;
  }
  const shape: PptxGenJS.SHAPE_NAME =
    rect.shape === 'ellipse' ? 'ellipse' : rect.shape === 'roundRect' ? 'roundRect' : 'rect';
  slide.addShape(shape, {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    fill: fillProps(rect.fill, options.paperHex),
    line,
    ...(shape === 'roundRect' ? { rectRadius: pxToIn(rect.radius ?? 0) } : {}),
    objectName: `${options.namePrefix}#${name}${rect.group ? `@${rect.group}` : ''}`,
  });
}

/**
 * A line or arrow between two measured points. A pptxgenjs line runs from the top left to the
 * bottom right of its box, so a line whose end lies left of or above its start flips: `flipH`
 * when x2 < x1, `flipV` when y2 < y1, which keeps the shape's begin at `from` and its end at `to`
 * so the arrowheads land where the sheet drew them.
 */
export function addSceneLine(
  slide: PptxGenJS.Slide,
  line: SceneSegment,
  options: LineEmitOptions,
  name: string,
): void {
  const [x1, y1] = line.from;
  const [x2, y2] = line.to;
  const color = lineColor(line.color, options.paperHex);
  const props: PptxGenJS.ShapeLineProps = { color: color.color, width: pxToPt(line.width) };
  if (color.transparency !== undefined) props.transparency = color.transparency;
  if (line.heads === 'start' || line.heads === 'both') props.beginArrowType = 'triangle';
  if (line.heads === 'end' || line.heads === 'both') props.endArrowType = 'triangle';
  slide.addShape('line', {
    x: pxToIn(Math.min(x1, x2)),
    y: pxToIn(Math.min(y1, y2)),
    w: pxToIn(Math.abs(x2 - x1)),
    h: pxToIn(Math.abs(y2 - y1)),
    ...(x2 < x1 ? { flipH: true } : {}),
    ...(y2 < y1 ? { flipV: true } : {}),
    line: props,
    objectName: `${options.namePrefix}#${name}`,
  });
}
