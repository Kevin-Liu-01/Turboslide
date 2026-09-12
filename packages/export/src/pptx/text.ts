// Text boxes from measured text (SPEC 8.2): the browser's box, `margin: 0`, `valign: 'top'`, no
// autofit, `fontSize` in points (22 px is 13.2 pt, sz="1320"), `charSpacing` from the measured
// tracking (-1.1 px at 44 px is -0.66 pt, spc="-66"), `lineSpacing` in points (33 px is
// spcPts val="1980"), one `softBreakBefore` per browser line, weight 500 as a family name and a
// weight of 600 or more as the Medium family plus the bold flag (fonts-map.ts; the report's
// residual names every weight the set has no cut for), links
// as hyperlinks in the ink with a hairline underline, `.no` rows struck, and 0.02 in of width
// slack so no renderer wraps early (pptx report section 4.1). In flatten mode every run carries
// transparency 100 (`<a:alpha val="0"/>`), the searchable layer over the raster.
import type PptxGenJS from 'pptxgenjs';

import type { SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { PAGE_IN, PX_PER_IN, parseCssColor, pxToIn, pxToPt } from '../units.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import type { BaselineTarget } from './baseline.ts';
import { faceAdvanceExcess } from './face-advance.ts';
import type { FontSet } from './fonts-map.ts';
import { MONO_FAMILY, pickFamily, weightSubstitution } from './fonts-map.ts';

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
  /** Residual lines the runs add (a weight the set has no cut for), for the report. */
  residual?: Set<string>;
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
  if (!run.style.mono) {
    // a weight the set has no cut for: 600 and 700 travel as Medium plus bold, 300 as Regular
    const pick = pickFamily(run.style.size, run.style.weight, options.fontSet);
    if (pick.bold) out.bold = true;
    const note = weightSubstitution(pick);
    if (note !== null) options.residual?.add(note);
  }
  if (run.style.letterSpacing !== 0) out.charSpacing = pxToPt(run.style.letterSpacing);
  // A text face used off its cut size renders wider in LibreOffice (calibration.json faceAdvance):
  // the measured excess of the run's width is taken back across its characters.
  const excess = run.style.mono ? 0 : faceAdvanceExcess(family, run.style.size);
  if (excess > 0 && run.text.length > 0 && !run.gt) {
    const perChar = (excess * run.box[2]) / run.text.length;
    out.charSpacing = Math.round(pxToPt(run.style.letterSpacing - perChar) * 100) / 100;
  }
  if (run.gt && run.gtLetters !== undefined && run.text.length > 0) {
    // The invisible letters under the mark are spaced down (or up) to the mark's box, so the text
    // after the mark starts where the browser put it: at 22 px the letters GT are about 4 px wider
    // than the mark and moved the rest of the line by that much (M5 width gate, avoid#p1 and
    // audience#p1 measured dw +4). spc is per character, to the hundredth of a point.
    const perChar = (run.box[2] - run.gtLetters) / run.text.length;
    out.charSpacing = Math.round(pxToPt(run.style.letterSpacing + perChar) * 100) / 100;
  }
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

/**
 * A space that touches a hyperlink run becomes a no-break space. LibreOffice turns each hyperlink
 * run into a URL field and drops the ordinary space of the plain run beside it (measured in the
 * M5 baseline: the link table of surfaces rendered "x.com/generaltxn,linkedin.com/..." and its
 * widest line 6 px narrower than the browser's); U+00A0 survives the field boundary and has the
 * same advance in Inter.
 */
export function guardLinkSpaces(runs: readonly SceneRun[]): SceneRun[] {
  return runs.map((run, i) => {
    if (run.style.link) return run;
    let text = run.text;
    const prev = runs[i - 1];
    const next = runs[i + 1];
    if (prev?.style.link && text.startsWith(' ')) text = `\u00a0${text.slice(1)}`;
    if (next?.style.link && text.endsWith(' ')) text = `${text.slice(0, -1)}\u00a0`;
    return text === run.text ? run : { ...run, text };
  });
}

/**
 * The invisible run that holds the place of an inline element between two runs (the external
 * glyph after a link, a raster in the file): one no-break space spaced out to the measured gap.
 */
export function gapFiller(run: SceneRun, options: TextEmitOptions): PptxGenJS.TextProps | null {
  if (run.gapAfter === undefined || run.spaceWidth === undefined) return null;
  const family = familyFor(run.style, options.fontSet);
  options.families.add(family);
  return {
    text: '\u00a0',
    options: {
      fontFace: family,
      fontSize: pxToPt(run.style.size),
      color: parseCssColor(run.style.color).hex,
      transparency: 100,
      charSpacing: Math.round(pxToPt(run.gapAfter - run.spaceWidth) * 100) / 100,
    },
  };
}

/** The pptxgenjs run list of a measured text: lines joined by soft breaks, runs by style. */
export function textRuns(text: SceneText, options: TextEmitOptions): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  text.lines.forEach((line, li) => {
    guardLinkSpaces(line.runs).forEach((run, ri) => {
      out.push({
        text: run.text,
        options: runOptions(run, options, li === 0 && ri === 0, ri === 0),
      });
      const filler = gapFiller(run, options);
      if (filler) out.push(filler);
    });
  });
  return out;
}

/**
 * The box options of a measured text: the lines' union widened to the element and the slack, and
 * the box moved up by the target renderer's first-baseline offset (baseline.ts); the mono stack
 * has its own measured anchor.
 */
export function textBoxOptions(
  text: SceneText,
  options: TextEmitOptions,
): PptxGenJS.TextPropsOptions {
  const [x, y, w, h] = text.textBox;
  const maxW = PAGE_IN.width - pxToIn(x);
  const wIn = Math.min(pxToIn(w) + WIDTH_SLACK_IN, maxW);
  const lineHeight = Math.max(...text.lines.map((l) => l.box[3]));
  // the mono face has its own anchor (M5: the dark code panels measured 6 px low with none)
  const shift = firstBaselineShiftPx(
    text.style.size,
    lineHeight,
    options.baseline ?? 'libreoffice',
    undefined,
    text.style.mono,
  );
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
