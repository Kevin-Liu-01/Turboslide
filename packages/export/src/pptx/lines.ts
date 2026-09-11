// Hairlines, plates and rects (SPEC 8.2): a 1 px rule is a 0.6 pt line (`<a:ln w="7620">`) in the
// composite color on paper, or in the ink with alpha over a picture (`<a:alpha val="18000"/>`,
// measured); a plate or chip is a rectangle with `line: { type: 'none' }` (`width: 0` means 1 pt
// in pptxgenjs, pptx report section 6 item 6); crosses are two 1 px lines each.
import type PptxGenJS from 'pptxgenjs';

import type { Box } from '@turboslide/schema/render';

import type { SceneRect, SceneRule } from '../scene/types.ts';
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

/** A filled rectangle with no outline unless the rect carries one. */
export function addSceneRect(
  slide: PptxGenJS.Slide,
  rect: SceneRect,
  options: LineEmitOptions,
  name: string,
): void {
  const [x, y, w, h] = rect.box;
  const fill = parseCssColor(rect.fill);
  const fillProps: PptxGenJS.ShapeFillProps = { color: fill.hex };
  if (fill.alpha < 1 && !options.paperHex) fillProps.transparency = transparencyOf(fill.alpha);
  else if (fill.alpha < 1 && options.paperHex)
    fillProps.color = compositeHex(fill, options.paperHex);
  let line: PptxGenJS.ShapeLineProps = { type: 'none' };
  if (rect.line) {
    const color = lineColor(rect.line.color, options.paperHex);
    line = { color: color.color, width: pxToPt(rect.line.width) };
    if (color.transparency !== undefined) line.transparency = color.transparency;
  }
  slide.addShape('rect', {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    fill: fillProps,
    line,
    objectName: `${options.namePrefix}#${name}${rect.group ? `@${rect.group}` : ''}`,
  });
}
