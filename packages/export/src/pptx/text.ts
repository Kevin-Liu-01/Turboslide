// Text boxes from measured text (SPEC 8.2): the browser's box, `margin: 0`, `valign: 'top'`, no
// autofit, `fontSize` in points (22 px is 13.2 pt, sz="1320"), `charSpacing` from the measured
// tracking (-1.1 px at 44 px is -0.66 pt, spc="-66"), `lineSpacing` in points (33 px is
// spcPts val="1980"), one `softBreakBefore` per browser line, weight 500 as a family name, links
// as hyperlinks in the ink with a hairline underline, `.no` rows struck, and 0.02 in of width
// slack so no renderer wraps early (pptx report section 4.1). In flatten mode every run carries
// transparency 100 (`<a:alpha val="0"/>`), the searchable layer over the raster.
import type PptxGenJS from 'pptxgenjs';

import type { SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { PAGE_IN, PX_PER_IN, parseCssColor, pxToIn, pxToPt } from '../units.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import type { BaselineTarget } from './baseline.ts';
import type { FontSet } from './fonts-map.ts';
import { MONO_FAMILY, pickFamily } from './fonts-map.ts';

/** Width slack on every text box, in inches (pptx report section 4.1). */
export const WIDTH_SLACK_IN = 0.02;

export type TextEmitOptions = {
  fontSet: FontSet;
  /** Write the text invisibly (flatten mode). */
  invisible: boolean;
  /** The composite hairline color for link underlines. */
  hairHex: string;
  /** Families used, collected for the report and the font embedding. */
  families: Set<string>;
  /** The object name prefix, `ts:<slideId>`. */
  namePrefix: string;
  /** The renderer whose first-baseline constant offsets the box (baseline.ts); default libreoffice. */
  baseline?: BaselineTarget;
};

/** The family for a style: the mono stack for the code panel, else the set's pick. */
export function familyFor(style: SceneStyle, set: FontSet): string {
  if (style.mono) return MONO_FAMILY;
  return pickFamily(style.size, style.weight, set).family;
}

function runOptions(
  run: SceneRun,
  options: TextEmitOptions,
  first: boolean,
  lineStart: boolean,
): PptxGenJS.TextPropsOptions {
  const color = parseCssColor(run.style.color);
  const family = familyFor(run.style, options.fontSet);
  options.families.add(family);
  const out: PptxGenJS.TextPropsOptions = {
    fontFace: family,
    fontSize: pxToPt(run.style.size),
    color: color.hex,
  };
  if (run.style.letterSpacing !== 0) out.charSpacing = pxToPt(run.style.letterSpacing);
  if (options.invisible || run.gt) out.transparency = 100;
  else if (color.alpha < 1) out.transparency = Math.round((1 - color.alpha) * 100);
  if (run.style.strike) out.strike = 'sngStrike';
  if (run.style.link && !options.invisible) {
    out.hyperlink = { url: run.style.link };
    out.underline = { style: 'sng', color: options.hairHex };
  }
  if (lineStart && !first) out.softBreakBefore = true;
  return out;
}

/** The pptxgenjs run list of a measured text: lines joined by soft breaks, runs by style. */
export function textRuns(text: SceneText, options: TextEmitOptions): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  text.lines.forEach((line, li) => {
    line.runs.forEach((run, ri) => {
      out.push({
        text: run.text,
        options: runOptions(run, options, li === 0 && ri === 0, ri === 0),
      });
    });
  });
  return out;
}

/**
 * The box options of a measured text: the lines' union widened to the element and the slack, and
 * the box moved up by the target renderer's first-baseline offset (baseline.ts), which is 0 for
 * the mono stack because the constant was measured for Inter.
 */
export function textBoxOptions(
  text: SceneText,
  options: TextEmitOptions,
): PptxGenJS.TextPropsOptions {
  const [x, y, w, h] = text.textBox;
  const maxW = PAGE_IN.width - pxToIn(x);
  const wIn = Math.min(pxToIn(w) + WIDTH_SLACK_IN, maxW);
  const lineHeight = Math.max(...text.lines.map((l) => l.box[3]));
  const shift = text.style.mono
    ? 0
    : firstBaselineShiftPx(text.style.size, lineHeight, options.baseline ?? 'libreoffice');
  const opts: PptxGenJS.TextPropsOptions = {
    x: pxToIn(x),
    y: pxToIn(Math.max(0, y - shift)),
    w: wIn,
    h: Math.max(pxToIn(h), lineHeight / PX_PER_IN),
    margin: 0,
    valign: 'top',
    align: text.style.align,
    lineSpacing: pxToPt(lineHeight),
    paraSpaceBefore: 0,
    paraSpaceAfter: 0,
    wrap: true,
    isTextBox: true,
    objectName: `${options.namePrefix}#${text.id}${text.group ? `@${text.group}` : ''}`,
  };
  return opts;
}

/** Adds one measured text to a slide. Returns false when the text had no lines. */
export function addSceneText(
  slide: PptxGenJS.Slide,
  text: SceneText,
  options: TextEmitOptions,
): boolean {
  if (text.lines.length === 0) return false;
  slide.addText(textRuns(text, options), textBoxOptions(text, options));
  return true;
}
