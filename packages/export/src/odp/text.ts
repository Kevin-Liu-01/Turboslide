// The text of the ODP (gslides-parity SPEC-5 6.3; R09 2.2, 2.4): one `draw:frame` with a
// `draw:text-box` per measured text, its paragraphs from the scene's line groups (`text:p` per
// paragraph, `text:line-break` between the browser's own lines so no reader rewraps), one
// `text:span` per run with a text style from `SceneStyle` (the family through the same pick the
// PPTX writer makes, the size in points at 0.6 pt per sheet pixel, weight, colour, letter
// spacing, italic, underline, strike, super and subscript, the highlight), the deck's language
// on every span (SPEC-5 7.1), the paragraph style with the exact line height, the alignment and
// the paragraph spacing, and the frame moved up by the LibreOffice first baseline offset
// (pptx/baseline.ts, the same model the PPTX text boxes use). Perfect mode writes the same frames
// with paper coloured runs at `loext:opacity="0%"` under the page raster, so the text stays
// searchable and invisible (R09 2.4 path a).
import type { SceneLine, SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { firstBaselineShiftPx } from '../pptx/baseline.ts';
import type { BaselineTarget } from '../pptx/baseline.ts';
import { familyFor } from '../pptx/text.ts';
import type { FontSet } from '../pptx/fonts-map.ts';
import type { StyleAllocator } from './styles.ts';
import { languageParts } from './styles.ts';
import { cm, cssColor, el, num, odfText, pt } from './xml.ts';

/** Width slack on every text frame in sheet px, the PPTX writer's 0.02 in. */
export const FRAME_SLACK_PX = 2.4;

export type OdfTextContext = {
  styles: StyleAllocator;
  fontSet: FontSet;
  /** The deck's language tag. */
  language?: string;
  /** Perfect mode: the runs are invisible, paper coloured at opacity 0. */
  invisible: boolean;
  /** The paper hex the invisible runs take. */
  paperHex: string;
  baseline: BaselineTarget;
  /** The families the content names, for the font face declarations. */
  families: Set<string>;
};

/** The text properties of a run's style as `style:text-properties` attributes. */
export function textProperties(
  style: SceneStyle,
  ctx: OdfTextContext,
): Record<string, string | undefined> {
  const family = familyFor(style, ctx.fontSet);
  ctx.families.add(family);
  const { language, country } = languageParts(ctx.language);
  const color = ctx.invisible ? { hex: ctx.paperHex, alpha: 1 } : cssColor(style.color);
  const props: Record<string, string | undefined> = {
    'style:font-name': family,
    'fo:font-size': pt(style.size),
    'fo:font-weight':
      style.weight >= 600 ? 'bold' : style.weight <= 300 ? String(style.weight) : 'normal',
    'fo:color': color?.hex ?? '#000000',
    'fo:language': language,
    'fo:country': country,
  };
  if (style.letterSpacing !== 0) props['fo:letter-spacing'] = pt(style.letterSpacing);
  if (style.italic === true) props['fo:font-style'] = 'italic';
  if (style.underline === true) {
    props['style:text-underline-style'] = 'solid';
    props['style:text-underline-width'] = 'auto';
    props['style:text-underline-color'] = 'font-color';
  }
  if (style.strike) props['style:text-line-through-style'] = 'solid';
  if (style.baseline === 'super') props['style:text-position'] = 'super 58%';
  if (style.baseline === 'sub') props['style:text-position'] = 'sub 58%';
  if (ctx.invisible) props['loext:opacity'] = '0%';
  else if (color !== null && color.alpha < 1)
    props['loext:opacity'] = `${Math.round(color.alpha * 100)}%`;
  if (!ctx.invisible && style.highlight !== undefined) {
    const highlight = cssColor(style.highlight);
    if (highlight !== null) props['fo:background-color'] = highlight.hex;
  }
  return props;
}

/** The text style name of a run. */
export function textStyleOf(style: SceneStyle, ctx: OdfTextContext): string {
  return ctx.styles.add('text', el('style:text-properties', textProperties(style, ctx)));
}

/** The paragraph style of a text: the alignment, the exact line height and the spacing. */
export function paragraphStyleOf(
  text: SceneText,
  lineHeightPx: number,
  ctx: OdfTextContext,
): string {
  const props: Record<string, string | undefined> = {
    'fo:text-align':
      text.style.align === 'justify'
        ? 'justify'
        : text.style.align === 'center'
          ? 'center'
          : text.style.align === 'right'
            ? 'end'
            : 'start',
    'fo:line-height': pt(lineHeightPx),
    'fo:margin-top': text.paraSpace?.before !== undefined ? cm(text.paraSpace.before) : '0cm',
    'fo:margin-bottom': text.paraSpace?.after !== undefined ? cm(text.paraSpace.after) : '0cm',
  };
  return ctx.styles.add('paragraph', el('style:paragraph-properties', props));
}

/** One run as a `text:span`, a link as `text:a` around it. */
export function runXml(run: SceneRun, ctx: OdfTextContext): string {
  const span = el(
    'text:span',
    { 'text:style-name': textStyleOf(run.style, ctx) },
    odfText(run.text),
  );
  if (run.style.link !== undefined && !ctx.invisible && /^https?:/i.test(run.style.link))
    return el('text:a', { 'xlink:type': 'simple', 'xlink:href': run.style.link }, span);
  return span;
}

/** The lines grouped into paragraphs by their `paragraph` index, in order. */
export function paragraphsOf(lines: readonly SceneLine[]): SceneLine[][] {
  const out: SceneLine[][] = [];
  let current = -1;
  for (const line of lines) {
    const index = line.paragraph ?? 0;
    if (out.length === 0 || index !== current) {
      out.push([line]);
      current = index;
    } else out[out.length - 1]?.push(line);
  }
  return out;
}

/** The `text:p` elements of a text: the browser's lines joined by line breaks inside each paragraph. */
export function paragraphsXml(text: SceneText, ctx: OdfTextContext): string {
  const lineHeight = Math.max(...text.lines.map((line) => line.box[3]), text.style.lineHeight);
  const pStyle = paragraphStyleOf(text, lineHeight, ctx);
  return paragraphsOf(text.lines)
    .map((lines) =>
      el(
        'text:p',
        { 'text:style-name': pStyle },
        lines
          .map((line) => line.runs.map((run) => runXml(run, ctx)).join(''))
          .join('<text:line-break/>'),
      ),
    )
    .join('');
}

/** The graphic style of a text frame: no fill, no stroke, the vertical alignment and the padding. */
export function textFrameStyleOf(text: SceneText, ctx: OdfTextContext): string {
  const padding = text.padding ?? [0, 0, 0, 0];
  const props: Record<string, string | undefined> = {
    'draw:stroke': 'none',
    'draw:fill': 'none',
    'draw:auto-grow-height': 'false',
    'draw:auto-grow-width': 'false',
    'fo:wrap-option': 'no-wrap',
    'draw:textarea-vertical-align':
      text.valign === 'middle' ? 'middle' : text.valign === 'bottom' ? 'bottom' : 'top',
    'draw:textarea-horizontal-align': 'left',
    'fo:padding-top': cm(padding[0]),
    'fo:padding-right': cm(padding[1]),
    'fo:padding-bottom': cm(padding[2]),
    'fo:padding-left': cm(padding[3]),
  };
  return ctx.styles.add('graphic', el('style:graphic-properties', props), 'standard');
}

/**
 * The frame of a measured text: at the lines' union widened by the slack for a plain text, at
 * the element's box for a fitted one (a vertical alignment or a padding), moved up by the first
 * baseline offset of the target renderer; the id the animation tree targets.
 */
export function textFrameXml(
  text: SceneText,
  ctx: OdfTextContext,
  attributes: Record<string, string | undefined> = {},
): string {
  const fitted = text.valign !== undefined || text.padding !== undefined;
  const lineHeight = Math.max(...text.lines.map((line) => line.box[3]), text.style.lineHeight);
  const shift = firstBaselineShiftPx(
    text.style.size,
    lineHeight,
    ctx.baseline,
    undefined,
    text.style.mono,
  );
  const [bx, by, bw, bh] = fitted ? text.box : text.textBox;
  const x = bx;
  const y = Math.max(0, by - shift);
  const w = bw + (fitted ? 0 : FRAME_SLACK_PX);
  const h = Math.max(bh, lineHeight);
  const frameAttrs: Record<string, string | undefined> = {
    'draw:style-name': textFrameStyleOf(text, ctx),
    'draw:layer': 'layout',
    'svg:x': cm(x),
    'svg:y': cm(y),
    'svg:width': cm(w),
    'svg:height': cm(h),
    ...attributes,
  };
  if (text.rotate !== undefined && text.rotate !== 0 && !fitted) {
    // ODF rotates about the frame's origin through draw:transform: translate to the centre,
    // rotate (counter clockwise radians), translate back
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = (-text.rotate * Math.PI) / 180;
    frameAttrs['draw:transform'] =
      `rotate (${num(rad)}) translate (${cm(cx - (w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad))} ${cm(cy + (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad))})`;
    delete frameAttrs['svg:x'];
    delete frameAttrs['svg:y'];
  }
  return el('draw:frame', frameAttrs, el('draw:text-box', {}, paragraphsXml(text, ctx)));
}
