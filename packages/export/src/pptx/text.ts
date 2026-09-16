// Text boxes from measured text (SPEC 8.2): the browser's box, `margin: 0`, `valign: 'top'`, no
// autofit, `fontSize` in points (22 px is 13.2 pt, sz="1320"), `charSpacing` from the measured
// tracking (-1.1 px at 44 px is -0.66 pt, spc="-66"), `lineSpacing` in points (33 px is
// spcPts val="1980"), one `softBreakBefore` per browser line, weight 500 as a family name and a
// weight of 600 or more as the Medium family plus the bold flag (fonts-map.ts; the report's
// residual names every weight the set has no cut for), links
// as hyperlinks in the ink with a hairline underline (a slide link as a slide jump through
// pptx/links.ts, gslides-parity SPEC 7.2.8), a paragraph break as a new paragraph (SPEC 7.2.9),
// `.no` rows struck, and 0.02 in of width
// slack so no renderer wraps early (pptx report section 4.1). In flatten mode every run carries
// transparency 100 (`<a:alpha val="0"/>`), the searchable layer over the raster.
//
// The Google Slides parity round two (gslides-parity SPEC-2 2.1, 2.2, 7.2): the run marks as
// `italic`, `underline: { style: 'sng' }`, `strike`, `superscript`, `subscript`, `highlight` and
// the run's own colour; a Google list item's glyph or numeral as `bullet` with `indentLevel`
// (2.2.12); `paraSpaceBefore` and `paraSpaceAfter` on the paragraphs they apply to (2.2.9);
// `align: 'justify'`; `valign` and a four number `margin` on a positioned text box (2.2.18,
// 2.2.19); word art's `outline` (2.2.16); the object's `rotate`, `flipH`, `flipV`, `shadow` and
// `altText` (2.1, 2.3.4, 2.5.6); and a shape's text as one `addText` with `shape` (2.2.17).
import type PptxGenJS from 'pptxgenjs';

import type { SceneRect, SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { PX_PER_IN, pageIn, parseCssColor, pxToIn, pxToPt } from '../units.ts';
import type { PageSize } from '../units.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import type { BaselineTarget } from './baseline.ts';
import { faceAdvanceExcess } from './face-advance.ts';
import type { FontSet } from './fonts-map.ts';
import { MONO_FAMILY, pickFamily, weightSubstitution } from './fonts-map.ts';
import { fillProps, rectLine, rectShape } from './lines.ts';
import { isSlideLink } from './links.ts';
import type { LinkResolver } from './links.ts';
import { objectName, objectProps, outlineBox } from './shapes.ts';

/** Width slack on every text box, in inches (pptx report section 4.1). */
export const WIDTH_SLACK_IN = 0.02;

/** The bullet's indent in points: the renderer's 36 px key position (render lists.ts NUMERAL_INDENT). */
export const BULLET_INDENT_PX = 36;

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
  /**
   * Resolves a link href to hyperlink props for this slide (pptx/links.ts): a URL as is, a slide
   * link to its number in the file. Without it a URL link is written and a slide link dropped.
   */
  links?: LinkResolver;
  /** The paper hex a shape's translucent fill composites on (a shape with text, SPEC-2 2.2.17). */
  paperHex?: string;
  /** The deck's page in sheet pixels (gslides-parity SPEC-5 6.1): the width clamps read it; the default page when absent. */
  page?: PageSize;
  /** The deck's language (gslides-parity SPEC-5 7.1; R10 5.2): `a:rPr lang` on every run; `en-US` when absent. */
  language?: string;
};

/** The default language of a run's `lang` attribute when the scene carries none (SPEC-5 1.2 "Absent"). */
export const DEFAULT_RUN_LANGUAGE = 'en-US';

/** The families the sheet's own theme draws, whose export names come from the font set (fonts-map.ts). */
const SHEET_FAMILIES = new Set(['Inter', 'GT Inter', 'DejaVu Sans Mono', 'Menlo', 'monospace']);

/**
 * A catalog face (gslides-parity SPEC-5-amendments A5 item 5; b7.md R8): the computed family of a
 * run whose typography names a `FONT_IDS` face is that face's name (the renderer's
 * `--ts-font-<id>` variable resolves to it), so the file names it in `a:latin typeface` as is and
 * the residual line says PowerPoint may substitute it on a machine without the face. The sheet's
 * own families (Inter and the mono stack) keep the set's pick.
 */
export function catalogFace(style: SceneStyle): string | null {
  if (style.mono) return null;
  const family = style.family.trim();
  if (family === '' || SHEET_FAMILIES.has(family)) return null;
  /* the export set's own instances (`GT Inter Text 22`, `Inter Medium`, `GT Inter Display`) are
     the sheet's faces too: they take the set's pick with its weight rule, never a catalog name
     (merge 2; report.test.ts pins the Medium plus bold rule for weight 700) */
  if (family.startsWith('GT Inter') || family.startsWith('Inter ')) return null;
  return family;
}

/** The family for a style: the mono stack for the code panel, a catalog face by name, else the set's pick. */
export function familyFor(style: SceneStyle, set: FontSet): string {
  if (style.mono) return MONO_FAMILY;
  const face = catalogFace(style);
  if (face !== null) return face;
  return pickFamily(style.size, style.weight, set).family;
}

/** The residual line a catalog face adds once per family (A5 item 5). */
export function catalogFaceResidual(family: string): string {
  return `font: ${family} travels by name; PowerPoint substitutes it on a machine without the face (the catalog's licence allows embedding, which the export does not do)`;
}

/** The OOXML numbering schemes a prefix and suffix pair maps to (ST_TextAutonumberScheme). */
export type NumberScheme = {
  numberType: string;
  /** false when OOXML has no scheme for the pair and the file writes the nearest one */
  exact: boolean;
};

/**
 * The autonumber scheme of a numeral form with the block's prefix and suffix (gslides-parity
 * SPEC-5 7.7 "Edit prefix and suffix"): `(1)` is ParenBoth, `1)` ParenR, `1.` Period, a bare
 * arabic numeral Plain; alpha and roman forms have no Plain scheme, and any other pair has none,
 * so the nearest scheme is written with `exact: false` for the report.
 */
export function numberSchemeFor(
  form: 'arabic' | 'alphaLc' | 'alphaUc' | 'romanLc' | 'romanUc',
  prefix = '',
  suffix = '.',
): NumberScheme {
  if (prefix === '(' && suffix === ')') return { numberType: `${form}ParenBoth`, exact: true };
  if (prefix === '' && suffix === ')') return { numberType: `${form}ParenR`, exact: true };
  if (prefix === '' && suffix === '.') return { numberType: `${form}Period`, exact: true };
  if (prefix === '' && suffix === '' && form === 'arabic')
    return { numberType: 'arabicPlain', exact: true };
  const nearest = suffix === ')' ? `${form}ParenR` : `${form}Period`;
  return { numberType: nearest, exact: false };
}

/** The Unicode code point of a bullet glyph as pptxgenjs `characterCode` wants it: four hex digits. */
export function bulletCharacterCode(glyph: string): string {
  const code = glyph.codePointAt(0) ?? 0x2022;
  return code.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * The pptxgenjs `bullet` of a list item (SPEC-2 2.2.12, 2.2.13): the glyph's code point, or the
 * numbering scheme with the item's start number; the indent is the renderer's key position.
 */
export function bulletOptions(
  bullet: NonNullable<SceneText['bullet']>,
): NonNullable<PptxGenJS.TextPropsOptions['bullet']> {
  const indent = pxToPt(BULLET_INDENT_PX);
  if (bullet.kind === 'number') {
    const numberType = (bullet.numberType ?? 'arabicPeriod') as NonNullable<
      Exclude<PptxGenJS.TextPropsOptions['bullet'], boolean | undefined>
    >['numberType'];
    // pptxgenjs 4.0.1 declares `numberType` and its writer reads `bullet.style`
    // (gen-xml `<a:buAutoNum type="${bullet.style || 'arabicPeriod'}"`); both travel so the file
    // carries the scheme whichever the version reads
    return {
      type: 'number',
      numberType,
      numberStartAt: bullet.startAt ?? 1,
      indent,
      ...({ style: numberType } as Record<string, unknown>),
    };
  }
  return { characterCode: bulletCharacterCode(bullet.glyph || '•'), indent };
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
    // the deck's language on every run (gslides-parity SPEC-5 7.1: `a:rPr lang`; R10 5.2)
    lang: options.language ?? DEFAULT_RUN_LANGUAGE,
  };
  const face = catalogFace(run.style);
  if (face !== null) options.residual?.add(catalogFaceResidual(face));
  if (!run.style.mono && face === null) {
    // a weight the set has no cut for: 600 and 700 travel as Medium plus bold, 300 as Regular
    const pick = pickFamily(run.style.size, run.style.weight, options.fontSet);
    if (pick.bold) out.bold = true;
    const note = weightSubstitution(pick);
    if (note !== null) options.residual?.add(note);
  }
  if (run.style.letterSpacing !== 0) out.charSpacing = pxToPt(run.style.letterSpacing);
  // A text face used off its cut size renders wider in LibreOffice (calibration.json faceAdvance):
  // the measured excess of the run's width is taken back across its characters.
  const excess = run.style.mono || face !== null ? 0 : faceAdvanceExcess(family, run.style.size);
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
  // the run marks of gslides-parity SPEC-2 7.2: the italic face keeps the family name (7.1)
  if (run.style.italic) out.italic = true;
  if (run.style.underline) out.underline = { style: 'sng' };
  if (run.style.baseline === 'super') out.superscript = true;
  else if (run.style.baseline === 'sub') out.subscript = true;
  if (run.style.highlight !== undefined && !options.invisible)
    out.highlight = parseCssColor(run.style.highlight).hex;
  if (run.style.link) {
    // A slide link travels in both modes as a slide jump (gslides-parity SPEC 7.2.8; whether
    // PowerPoint honours it on the invisible run of a flatten file is unverified, the report
    // says so); a URL on a visible run is a hyperlink with the hairline underline, and on the
    // invisible layer nothing, because the cover picture takes the click.
    const link = linkFor(run.style.link, options);
    if (link !== undefined && (!options.invisible || isSlideLink(run.style.link))) {
      out.hyperlink = link;
      if (!options.invisible) out.underline = { style: 'sng', color: options.hairHex };
    }
  }
  if (lineStart && !first) out.softBreakBefore = true;
  return out;
}

/** The hyperlink props of a href through the slide's resolver; a bare URL without one. */
export function linkFor(
  href: string,
  options: Pick<TextEmitOptions, 'links'>,
): PptxGenJS.HyperlinkProps | undefined {
  if (options.links) return options.links(href);
  return isSlideLink(href) ? undefined : { url: href };
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
    if (prev?.style.link && text.startsWith(' ')) text = ` ${text.slice(1)}`;
    if (next?.style.link && text.endsWith(' ')) text = `${text.slice(0, -1)} `;
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
    text: ' ',
    options: {
      fontFace: family,
      fontSize: pxToPt(run.style.size),
      color: parseCssColor(run.style.color).hex,
      lang: options.language ?? DEFAULT_RUN_LANGUAGE,
      transparency: 100,
      charSpacing: Math.round(pxToPt(run.gapAfter - run.spaceWidth) * 100) / 100,
    },
  };
}

/**
 * The pptxgenjs run list of a measured text: lines joined by soft breaks, runs by style, and a
 * paragraph break (`breakLine` on the last run of the paragraph, gslides-parity SPEC 7.2.9) where
 * the browser's line starts a new `.para` span, so the file holds one `<a:p>` per paragraph with
 * the same alignment and pitch. The paragraph spacing of SPEC-2 2.2.9 goes on the paragraphs it
 * applies to (before on every paragraph but the first, after on every one but the last), the
 * bullet of a list item (2.2.12) on its first run.
 */
export function textRuns(text: SceneText, options: TextEmitOptions): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  const paragraphs = new Set(text.lines.map((line) => line.paragraph ?? 0)).size;
  let paragraphIndex = 0;
  text.lines.forEach((line, li) => {
    const previous = li > 0 ? text.lines[li - 1] : undefined;
    const newParagraph =
      previous !== undefined &&
      line.paragraph !== undefined &&
      previous.paragraph !== undefined &&
      line.paragraph !== previous.paragraph;
    if (newParagraph) {
      const last = out[out.length - 1];
      if (last) last.options = { ...last.options, breakLine: true };
      paragraphIndex += 1;
    }
    guardLinkSpaces(line.runs).forEach((run, ri) => {
      const runProps = runOptions(run, options, li === 0 && ri === 0, ri === 0);
      if (newParagraph && ri === 0) delete runProps.softBreakBefore;
      const startsParagraph = ri === 0 && (li === 0 || newParagraph);
      if (startsParagraph) {
        if (text.paraSpace?.before !== undefined && paragraphIndex > 0)
          runProps.paraSpaceBefore = pxToPt(text.paraSpace.before);
        if (text.paraSpace?.after !== undefined && paragraphIndex < paragraphs - 1)
          runProps.paraSpaceAfter = pxToPt(text.paraSpace.after);
        if (text.bullet !== undefined) {
          runProps.bullet = bulletOptions(text.bullet);
          if (text.bullet.level > 1) runProps.indentLevel = Math.min(8, text.bullet.level - 1);
          if (text.bullet.substituted === true)
            options.residual?.add(
              `numbering: ${options.namePrefix}#${text.blockId} uses the ${text.bullet.preset ?? 'digit-nested'} preset, whose "${text.bullet.glyph}" form has no OOXML numbering scheme; the file numbers it as arabicPeriod (gslides-parity SPEC-2 2.2.13)`,
            );
        }
      }
      out.push({ text: run.text, options: runProps });
      const filler = gapFiller(run, options);
      if (filler) out.push(filler);
    });
  });
  return out;
}

/** A four sided padding in px as the pptxgenjs `margin` in points: top, right, bottom, left. */
export function marginPt(
  padding: [number, number, number, number],
): [number, number, number, number] {
  // pptxgenjs 4.0.1 reads a margin array as left, right, bottom, top (gen-xml: margin[0] is lIns,
  // [1] rIns, [2] bIns, [3] tIns), not the CSS order the padding arrives in
  const [top, right, bottom, left] = padding;
  return [pxToPt(left), pxToPt(right), pxToPt(bottom), pxToPt(top)];
}

/**
 * The box options of a measured text: the lines' union widened to the element and the slack, and
 * the box moved up by the target renderer's first-baseline offset (baseline.ts); the mono stack
 * has its own measured anchor. A positioned text box with a vertical alignment or a padding
 * (SPEC-2 2.2.18, 2.2.19) is written at the element's own box, moved up by the same offset, with
 * `valign` and a four number `margin` instead, so the file lays the text out inside the same box
 * the sheet did; word art's
 * outline, the rotation, flip, shadow and alt text travel on the box (2.2.16, 2.1, 2.3.4, 2.5.6).
 */
export function textBoxOptions(
  text: SceneText,
  options: TextEmitOptions,
): PptxGenJS.TextPropsOptions {
  const [x, y, w, h] = text.textBox;
  const pageInches = pageIn(options.page);
  const maxW = pageInches.width - pxToIn(x);
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
  const fitted = text.valign !== undefined || text.padding !== undefined;
  // the first baseline shift moves the box for every vertical alignment: the target renderer
  // sets each line's glyphs lower in its pitch than the browser by the same amount whether the
  // lines sit at the top, the middle or the bottom of the box (measured in the render worker
  // image on the fixture's diagram labels, valign middle: dy 4 unshifted; b2.md, fix round)
  const opts: PptxGenJS.TextPropsOptions = fitted
    ? {
        x: pxToIn(text.box[0]),
        y: pxToIn(Math.max(0, text.box[1] - shift)),
        w: Math.min(pxToIn(text.box[2]) + WIDTH_SLACK_IN, pageInches.width - pxToIn(text.box[0])),
        h: Math.max(pxToIn(text.box[3]), lineHeight / PX_PER_IN),
        margin: marginPt(text.padding ?? [0, 0, 0, 0]),
        valign: text.valign ?? 'top',
      }
    : {
        x: pxToIn(x),
        y: pxToIn(Math.max(0, y - shift)),
        w: wIn,
        h: Math.max(pxToIn(h), lineHeight / PX_PER_IN),
        margin: 0,
        valign: 'top',
      };
  Object.assign(opts, {
    align: text.style.align,
    lineSpacing: pxToPt(lineHeight),
    paraSpaceBefore: 0,
    paraSpaceAfter: 0,
    wrap: true,
    isTextBox: true,
    objectName: objectName(options.namePrefix, text.id, text.userGroup, text.group),
    ...objectProps(text),
  });
  // a bulleted text box keeps the glyph in its margin: the box starts at the key position, and
  // for a nested item at the level's indent before it, since the file writes the level as
  // `indentLevel` and pptxgenjs sets the paragraph's marL to the indent times the level plus one
  // (measured in the render worker image on the fixture's bullets: a level 2 item landed 36 px
  // right of the sheet's, a level 3 item 72 px, dw 43 and 73 on the two blocks; b2.md, fix round)
  if (text.bullet !== undefined && !fitted) {
    const levels = Math.min(8, Math.max(0, (text.bullet.level ?? 1) - 1));
    const hanging = BULLET_INDENT_PX * (1 + levels);
    const left = Math.max(0, pxToIn(x - hanging));
    opts.x = left;
    opts.w = Math.min(wIn + pxToIn(hanging), pageInches.width - left);
  }
  if (text.outline !== undefined && !options.invisible)
    opts.outline = { color: text.outline.colorHex, size: pxToPt(text.outline.width) };
  // the owning block's link on the text box itself (gslides-parity SPEC 7.2.7)
  if (text.link !== undefined && !options.invisible) {
    const link = linkFor(text.link, options);
    if (link !== undefined) opts.hyperlink = link;
  }
  return opts;
}

/** Adds one measured text to a slide. Returns false when the text had no lines. */
export function addSceneText(
  slide: PptxGenJS.Slide,
  text: SceneText,
  options: TextEmitOptions,
): boolean {
  if (text.lines.length === 0) return false;
  const opts = textBoxOptions(text, options);
  if (opts.hyperlink !== undefined && !registerBoxLink(slide, opts.hyperlink)) {
    delete opts.hyperlink;
    options.residual?.add(
      `${options.namePrefix}#${text.id}: the block link stays off the text box (no relationship table on the slide)`,
    );
  }
  slide.addText(textRuns(text, options), opts);
  return true;
}

/** The slide's relationship tables as pptxgenjs 4.0.1 keeps them (`getNewRelId` counts the three). */
type SlideRelationshipTables = {
  _rels: Array<{ type: string; data: string; rId: number; Target: string }>;
  _relsChart: unknown[];
  _relsMedia: unknown[];
};

/**
 * Registers the relationship of a link on the text box itself (gslides-parity SPEC 7.2.7).
 * pptxgenjs writes the box's `a:hlinkClick` from `options.hyperlink._rId` but creates hyperlink
 * relationships for the runs alone (`createHyperlinkRels` walks the text array), so a box link
 * left the file with `r:id="rIdundefined"`, which SPEC-5 8.3's validator names (merge 2). The
 * row follows `createHyperlinkRels` exactly: the next id over the three tables, a `slide` row
 * for a slide jump and a `dummy` row for a URL, the id written back on the props.
 */
function registerBoxLink(slide: PptxGenJS.Slide, hyperlink: PptxGenJS.HyperlinkProps): boolean {
  const tables = slide as unknown as Partial<SlideRelationshipTables>;
  if (
    !Array.isArray(tables._rels) ||
    !Array.isArray(tables._relsChart) ||
    !Array.isArray(tables._relsMedia)
  )
    return false;
  if (hyperlink.url === undefined && hyperlink.slide === undefined) return false;
  const rId = tables._rels.length + tables._relsChart.length + tables._relsMedia.length + 1;
  const target =
    hyperlink.slide !== undefined
      ? String(hyperlink.slide)
      : (hyperlink.url ?? '').replace(/[&<>"']/g, (c) => XML_ENTITIES[c] ?? c);
  tables._rels.push({
    type: 'hyperlink',
    data: hyperlink.slide !== undefined ? 'slide' : 'dummy',
    rId,
    Target: target,
  });
  (hyperlink as { _rId?: number })._rId = rId;
  return true;
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * A shape with text (SPEC-2 2.2.17) as one `addText` with `shape`: the shape's geometry, fill and
 * line at the shape's box, the text laid out inside a margin that is the text layer's inset from
 * the shape's edges (the preset's text rectangle plus the block's padding), the vertical alignment
 * of the block, and the object's transform, shadow and alt text. Returns false when the text is
 * empty, in which case the caller writes the shape alone.
 */
export function addShapeText(
  slide: PptxGenJS.Slide,
  rect: SceneRect,
  text: SceneText,
  options: TextEmitOptions,
  name: string,
): boolean {
  if (text.lines.length === 0) return false;
  // the shape's geometry drawn in by half its outline (shapes.ts outlineBox); the text layer's
  // inset is measured from that box so the text keeps the sheet's position
  const [x, y, w, h] = outlineBox(rect);
  const [tx, ty, tw, th] = text.box;
  const lineHeight = Math.max(...text.lines.map((l) => l.box[3]));
  // the first baseline shift of textBoxOptions, as a margin the box cannot move: the top inset
  // gives it up and the bottom inset takes it, so a centred or bottom aligned text moves up by
  // the same amount a top aligned one does
  const shift = firstBaselineShiftPx(
    text.style.size,
    lineHeight,
    options.baseline ?? 'libreoffice',
    undefined,
    text.style.mono,
  );
  const inset: [number, number, number, number] = [
    Math.max(0, Math.max(0, ty - y) + (text.padding?.[0] ?? 0) - shift),
    Math.max(0, x + w - (tx + tw)) + (text.padding?.[1] ?? 0),
    Math.max(0, Math.max(0, y + h - (ty + th)) + (text.padding?.[2] ?? 0) + shift),
    Math.max(0, tx - x) + (text.padding?.[3] ?? 0),
  ];
  const { shape, rectRadius } = rectShape(rect);
  slide.addText(textRuns(text, options), {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    shape,
    ...(rectRadius !== undefined ? { rectRadius } : {}),
    fill: fillProps(rect.fill, options.paperHex),
    line: rectLine(rect, options.paperHex),
    margin: marginPt(inset),
    valign: text.valign ?? rect.valign ?? 'top',
    align: text.style.align,
    lineSpacing: pxToPt(lineHeight),
    paraSpaceBefore: 0,
    paraSpaceAfter: 0,
    wrap: true,
    objectName: objectName(options.namePrefix, name, rect.userGroup, rect.group),
    ...objectProps(rect),
  });
  return true;
}
