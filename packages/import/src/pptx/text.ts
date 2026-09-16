// Text bodies, runs and paragraphs (gslides-parity SPEC-5 5.1; R04 5.2): one `a:txBody` (or a
// table cell's, or a diagram shape's) read into the schema's run model. Every paragraph becomes
// a list of `Run`s the schema's `serializeRuns` writes as the canonical markup (`*bold*`,
// `[text](url){i u s sup sub c:<color> h:<color>}`), so the escapes are the schema's own; the
// paragraphs join with `\n`. The typography is the body's first run (per run sizes have no form
// in the markup; a body whose runs differ by more than one ladder step is split by `shapes.ts`
// when `splitMixedSizes` is on, else reported), the colour lands on the block when every run
// agrees, the list facts (bullet or number, the preset, the start) come from the merged level
// styles of `inherit.ts`, and every source family is counted for `report.fonts`.
import type { Element } from '@xmldom/xmldom';

import type { Autofit, Padding, PlainItem, Valign } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import type { BulletPreset, NumberPreset, Run, Text as SchemaText } from '@turboslide/schema/text';
import { BULLET_PRESET_GLYPHS, isAllowedLink, serializeRuns } from '@turboslide/schema/text';
import type { TypeAlign, TypeColumns, TypeWeight, Typography } from '@turboslide/schema/typography';
import { TYPE_LADDER, TYPE_TRACKING, nearestLadderSize } from '@turboslide/schema/typography';

import type { SlideContext } from './context.ts';
import { colorOf, halfPx, px2, rowOn } from './context.ts';
import type { BulletStyle, LevelStyle, SlideChain } from './inherit.ts';
import { bodyProps, cloneStyle, mergeRunProps, paragraphLevel, paragraphStyle } from './inherit.ts';
import { REL } from './package.ts';
import { ROW_CODES } from './report.ts';
import { readFill, resolveColor, resolveTypeface } from './theme.ts';
import { DEFAULT_INSETS_EMU, emuToPx, percentOf, ptToPx, szToPx } from './units.ts';
import { attr, attrNS, child, children, elementChildren, is, ownText } from './xml.ts';

/** The default run size when no source writes one: 18 pt (PowerPoint's default text). */
export const DEFAULT_SZ = 1800;

export type ParagraphReading = {
  runs: Run[];
  /** zero based `lvl` */
  level: number;
  style: LevelStyle;
  bullet: BulletStyle | undefined;
  align?: TypeAlign;
  /** the run sizes in sheet px, in order */
  sizes: number[];
  /** the `a:br` count folded into paragraph breaks */
  softBreaks: number;
  /** the paragraph's own size when its runs are empty (`a:endParaRPr sz`) */
  emptySize?: number;
};

export type ListReading = {
  marker: 'bullet' | 'number';
  preset: BulletPreset | NumberPreset;
  start?: number;
  items: PlainItem[];
  /** the glyph or scheme was outside the presets and landed on the nearest one */
  substituted?: string;
};

export type TextBodyReading = {
  paragraphs: ParagraphReading[];
  /** the multiline markup, paragraphs joined with `\n` */
  text: SchemaText;
  plain: string;
  typography?: Typography;
  /** the colour every run shares, or undefined when they differ or none is written */
  color?: Color;
  /** every run is bold */
  bold: boolean;
  valign?: Valign;
  padding?: Padding;
  autofit: Autofit;
  columns?: TypeColumns;
  /** the body's paragraphs all carry a bullet or a number */
  list?: ListReading;
  /** some paragraphs carry a bullet and some do not */
  mixedList: boolean;
  /** the distinct run sizes in px differ by more than one ladder step */
  mixedSizes: boolean;
  /** `a:ln` on a run: the text outline (word art's one property) */
  outline?: { color: Color; width: 1 | 1.5 | 2 };
  /** the body has no visible text */
  empty: boolean;
  /** the source families with their run counts */
  fonts: Map<string, number>;
  /** the run families are all monospace names */
  monospace: boolean;
};

const MONO_FAMILIES =
  /consolas|courier|menlo|monaco|mono|source code|fira code|jetbrains|inconsolata|lucida console/i;

/** The bullet glyph to its preset (the level 1 glyph of each preset, R04 5.2). */
function bulletPresetOf(char: string): { preset: BulletPreset; exact: boolean } {
  const glyph = char.trim().charAt(0);
  for (const [preset, glyphs] of Object.entries(BULLET_PRESET_GLYPHS) as [
    BulletPreset,
    readonly string[],
  ][]) {
    if (glyphs[0] === glyph) return { preset, exact: true };
  }
  for (const [preset, glyphs] of Object.entries(BULLET_PRESET_GLYPHS) as [
    BulletPreset,
    readonly string[],
  ][]) {
    if (glyphs.includes(glyph)) return { preset, exact: true };
  }
  // the common Wingdings and Symbol bullets PowerPoint writes with a symbol font
  if (glyph === 'v' || glyph === 'Ø' || glyph === '§' || glyph === 'q' || glyph === 'ü')
    return { preset: 'checkbox', exact: false };
  if (glyph === '–' || glyph === '-' || glyph === '—' || glyph === '·' || glyph === '•')
    return { preset: 'disc-circle-square', exact: glyph === '•' };
  return { preset: 'disc-circle-square', exact: false };
}

/** `ST_TextAutonumberScheme` to the schema's number presets (the inverse of `bulletOptions`). */
export function numberPresetOf(scheme: string): { preset: NumberPreset; exact: boolean } {
  switch (scheme) {
    case 'arabicPeriod':
      return { preset: 'digit-alpha-roman', exact: true };
    case 'arabicParenR':
    case 'arabicParenBoth':
      return { preset: 'digit-alpha-roman-parens', exact: scheme === 'arabicParenR' };
    case 'alphaUcPeriod':
    case 'alphaUcParenR':
    case 'alphaUcParenBoth':
      return { preset: 'upperalpha-alpha-roman', exact: scheme === 'alphaUcPeriod' };
    case 'romanUcPeriod':
    case 'romanUcParenR':
    case 'romanUcParenBoth':
      return { preset: 'upperroman-upperalpha-digit', exact: scheme === 'romanUcPeriod' };
    case 'arabicDbPeriod':
    case 'arabicDbPlain':
      return { preset: 'zerodigit-alpha-roman', exact: scheme === 'arabicDbPeriod' };
    case 'alphaLcPeriod':
    case 'alphaLcParenR':
    case 'alphaLcParenBoth':
    case 'romanLcPeriod':
    case 'romanLcParenR':
    case 'romanLcParenBoth':
      return { preset: 'digit-alpha-roman', exact: false };
    default:
      return { preset: 'digit-alpha-roman', exact: false };
  }
}

/** The link a run's `a:hlinkClick` names in the schema's forms, or null with the reason when dropped. */
export function linkOf(
  click: Element | undefined,
  ctx: SlideContext,
): { link: string } | { dropped: string } | undefined {
  if (click === undefined) return undefined;
  const action = attr(click, 'action') ?? '';
  const rId = attrNS(click, 'r', 'id');
  if (action.startsWith('ppaction://hlinkshowjump')) {
    const jump = /jump=([a-z]+)/i.exec(action)?.[1]?.toLowerCase() ?? '';
    const target: Record<string, string> = {
      nextslide: '#next',
      previousslide: '#previous',
      firstslide: '#first',
      lastslide: '#last',
    };
    const url = target[jump];
    return url === undefined ? { dropped: action } : { link: url };
  }
  if (action.startsWith('ppaction://hlinksldjump')) {
    if (rId === undefined) return { dropped: action };
    const rel = ctx.pkg.relationship(ctx.slide.part, rId);
    const slideId = rel?.part === undefined ? undefined : ctx.slideIdsByPart.get(rel.part);
    return slideId === undefined ? { dropped: action } : { link: `#s/${slideId}` };
  }
  if (action !== '' && !action.startsWith('ppaction://hlinkfile')) {
    // endshow, lastslideviewed, customshow, macro, program, ole
    return { dropped: action };
  }
  if (rId === undefined) return undefined;
  const rel = ctx.pkg.relationship(ctx.slide.part, rId);
  if (rel === undefined) return { dropped: `r:id ${rId}` };
  if (rel.mode === 'External') {
    return isAllowedLink(rel.target) ? { link: rel.target } : { dropped: rel.target };
  }
  if (rel.type === REL.slide && rel.part !== undefined) {
    const slideId = ctx.slideIdsByPart.get(rel.part);
    return slideId === undefined ? { dropped: rel.target } : { link: `#s/${slideId}` };
  }
  return { dropped: rel.target };
}

type RunFacts = {
  run: Run;
  sizePx: number;
  weightBold: boolean;
  family?: string;
  outline?: { color: Color; width: 1 | 1.5 | 2 };
  /** the colour the run inherits from its level style when it writes none of its own */
  inherited?: Color;
};

function readRun(
  r: Element,
  paragraph: LevelStyle,
  ctx: SlideContext,
  chain: SlideChain,
  fontScale: number,
  text: string,
): RunFacts {
  const style = mergeRunProps(cloneStyle(paragraph), child(r, 'a', 'rPr'));
  const run: Run = { t: text };
  const sz = Number(style.run.sz ?? DEFAULT_SZ);
  const sizePx = szToPx((Number.isFinite(sz) ? sz : DEFAULT_SZ) * fontScale, ctx.mapping);
  const bold = style.run.b === '1' || style.run.b === 'true';
  if (bold) run.b = true;
  if (style.run.i === '1' || style.run.i === 'true') run.i = true;
  if (style.run.u !== undefined && style.run.u !== 'none') run.u = true;
  if (style.run.strike !== undefined && style.run.strike !== 'noStrike') run.s = true;
  const baseline = Number(style.run.baseline ?? '0');
  if (baseline > 0) run.sup = true;
  else if (baseline < 0) run.sub = true;
  // a run's own fill is its colour; a fill inherited from the level style is the body's default
  // (the theme's text colour on most bodies), which lands on the block when the runs agree and is
  // never a run mark; a fully transparent run (the Perfect file's text layer, R04 7) keeps no colour
  const rPr = child(r, 'a', 'rPr');
  const ownFill =
    rPr === undefined ? undefined : (child(rPr, 'a', 'solidFill') ?? child(rPr, 'a', 'gradFill'));
  const fill = style.runElements.solidFill ?? style.runElements.gradFill;
  let inherited: Color | undefined;
  if (fill !== undefined) {
    const holder = fill.parentNode as Element | null;
    const reading = holder === null ? undefined : readFill(holder, chain.colors);
    if (
      reading !== undefined &&
      'color' in reading &&
      reading.color !== undefined &&
      reading.color.alpha > 0
    ) {
      const color = colorOf(reading.color, ctx, chain.colors.scheme.colors.lt1);
      if (ownFill !== undefined) run.color = color;
      else inherited = color;
    }
  }
  const highlight = style.runElements.highlight;
  if (highlight !== undefined) {
    const el = elementChildren(highlight)[0];
    const resolved = el === undefined ? undefined : resolveColor(el, chain.colors);
    if (resolved !== undefined) run.hl = colorOf(resolved, ctx, chain.colors.scheme.colors.lt1);
  }
  const cap = style.run.cap;
  if (cap === 'all') run.t = run.t.toUpperCase();
  const latin = style.runElements.latin;
  const typeface = latin === undefined ? undefined : attr(latin, 'typeface');
  const family =
    typeface === undefined ? undefined : resolveTypeface(typeface, chain.colors.scheme);
  const ln = style.runElements.ln;
  let outline: RunFacts['outline'];
  if (ln !== undefined && child(ln, 'a', 'noFill') === undefined) {
    const stroke = readFill(ln, chain.colors);
    const w = Number(attr(ln, 'w') ?? '0');
    const widthPx = Number.isFinite(w) && w > 0 ? emuToPx(w, ctx.mapping) : 1;
    const width: 1 | 1.5 | 2 = widthPx <= 1.25 ? 1 : widthPx <= 1.75 ? 1.5 : 2;
    if (stroke !== undefined && 'color' in stroke && stroke.color !== undefined)
      outline = { color: colorOf(stroke.color, ctx), width };
  }
  return {
    run,
    sizePx,
    weightBold: bold,
    ...(family !== undefined ? { family } : {}),
    ...(outline !== undefined ? { outline } : {}),
    ...(inherited !== undefined ? { inherited } : {}),
  };
}

function alignOf(value: string | undefined): TypeAlign | undefined {
  switch (value) {
    case 'l':
      return 'left';
    case 'ctr':
      return 'center';
    case 'r':
      return 'right';
    case 'just':
    case 'justLow':
    case 'dist':
    case 'thaiDist':
      return 'justify';
    default:
      return undefined;
  }
}

/** The effective bullet of a paragraph style: none when `buNone`, the inherited one otherwise; a blip reads as a char. */
function effectiveBullet(style: LevelStyle): BulletStyle | undefined {
  return style.bullet === undefined || style.bullet.kind === 'none' ? undefined : style.bullet;
}

export type ReadTextOptions = {
  /** the element whose `p:txBody` is read; the placeholder walk starts here */
  shape: Element;
  /** the text body when it is not `shape`'s direct `p:txBody` (a table cell, a diagram shape) */
  txBody?: Element;
  /** the body properties to read (a cell's `a:tcPr` has none of its own) */
  withBody?: boolean;
};

/** Reads one text body; undefined when the element has none. */
export function readTextBody(
  ctx: SlideContext,
  options: ReadTextOptions,
): TextBodyReading | undefined {
  const { shape, chain } = { shape: options.shape, chain: ctx.chain };
  const txBody =
    options.txBody ?? elementChildren(shape).find((node) => node.localName === 'txBody');
  if (txBody === undefined) return undefined;
  const body = options.withBody === false ? { attrs: {} } : bodyProps(shape, chain);
  const fontScale = body.autofit?.kind === 'norm' ? body.autofit.fontScale : 1;
  const paragraphs: ParagraphReading[] = [];
  const fonts = new Map<string, number>();
  let outline: TextBodyReading['outline'];
  let allBold = true;
  let anyRun = false;
  const colors = new Set<string>();
  let colorless = false;
  const inheritedColors = new Set<string>();
  const families: string[] = [];
  for (const p of children(txBody, 'a', 'p')) {
    const style = paragraphStyle(shape, chain, p);
    const level = paragraphLevel(p);
    let current: ParagraphReading = {
      runs: [],
      level,
      style,
      bullet: effectiveBullet(style),
      ...(alignOf(style.attrs.algn) !== undefined ? { align: alignOf(style.attrs.algn) } : {}),
      sizes: [],
      softBreaks: 0,
    };
    const flush = (): void => {
      paragraphs.push(current);
      current = { ...current, runs: [], sizes: [], softBreaks: 0 };
    };
    for (const node of elementChildren(p)) {
      if (is(node, 'a', 'r') || is(node, 'a', 'fld')) {
        const isField = is(node, 'a', 'fld');
        const fieldType = isField ? (attr(node, 'type') ?? '') : '';
        const tEl = child(node, 'a', 't');
        const text = tEl === undefined ? '' : ownText(tEl);
        if (isField && fieldType === 'slidenum') {
          ctx.report.row('kept', {
            ...rowOn(ctx, undefined),
            code: 'text.field',
            message: 'A slide number field was left out; the frame draws the counter',
          });
          continue;
        }
        const facts = readRun(node, style, ctx, chain, fontScale, text);
        anyRun = true;
        if (!facts.weightBold) allBold = false;
        if (facts.run.color !== undefined) colors.add(facts.run.color);
        else {
          colorless = true;
          if (facts.inherited !== undefined) inheritedColors.add(facts.inherited);
        }
        if (facts.family !== undefined) {
          fonts.set(facts.family, (fonts.get(facts.family) ?? 0) + 1);
          families.push(facts.family);
        }
        if (facts.outline !== undefined && outline === undefined) outline = facts.outline;
        const rPr = child(node, 'a', 'rPr');
        const link = linkOf(rPr === undefined ? undefined : child(rPr, 'a', 'hlinkClick'), ctx);
        if (link !== undefined) {
          if ('link' in link) facts.run.link = link.link;
          else
            ctx.report.drop({
              ...rowOn(ctx, undefined),
              code: ROW_CODES.textLink,
              message: `A link to ${link.dropped} was dropped; links take https, http, mailto, tel and slide targets`,
            });
        }
        if (text !== '') {
          current.runs.push(facts.run);
          current.sizes.push(facts.sizePx);
        }
      } else if (is(node, 'a', 'br')) {
        if (ctx.roundTrip) {
          // the exporter writes a measured wrap as `a:br` inside one paragraph and a paragraph
          // break as a new `a:p` (pptx/text.ts), so a round trip's break is a space
          const last = current.runs[current.runs.length - 1];
          if (last !== undefined && !last.t.endsWith(' ')) last.t += ' ';
          continue;
        }
        // a soft break has no form in a Text: it becomes a paragraph break (R04 5.2)
        current.softBreaks += 1;
        const breaks = current.softBreaks;
        flush();
        current.softBreaks = breaks;
      } else if (is(node, 'a', 'endParaRPr')) {
        const sz = Number(attr(node, 'sz') ?? '');
        if (Number.isFinite(sz) && sz > 0) current.emptySize = szToPx(sz * fontScale, ctx.mapping);
      }
    }
    paragraphs.push(current);
  }
  const softBreaks = paragraphs.reduce((sum, p) => sum + p.softBreaks, 0);
  if (softBreaks > 0)
    ctx.report.row('kept', {
      ...rowOn(ctx, undefined),
      code: ROW_CODES.textSoftBreak,
      message: `${softBreaks} line break${softBreaks === 1 ? '' : 's'} inside a paragraph became paragraph breaks`,
    });
  const text = paragraphs.map((p) => serializeRuns(p.runs)).join('\n');
  const plain = paragraphs.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
  const empty = plain.trim() === '';
  const sizes = paragraphs.flatMap((p) => p.sizes);
  const firstSize = sizes[0] ?? paragraphs[0]?.emptySize;
  const ladderSteps = new Set(sizes.map((s) => nearestLadderSize(s)));
  const mixedSizes = ladderSteps.size > 1 && spread(sizes) > 1;

  const typography: Typography = {};
  if (firstSize !== undefined) {
    const size = ctx.options.snapLadder ? nearestLadderSize(firstSize) : halfPx(firstSize);
    typography.size = size;
    if (ctx.options.snapLadder && nearestLadderSize(firstSize) !== firstSize)
      ctx.report.row('kept', {
        ...rowOn(ctx, undefined),
        code: 'text.ladder',
        message: `A ${firstSize} px size snapped to ${size} px on the ladder`,
      });
  }
  if (anyRun && allBold) typography.weight = 600 as TypeWeight;
  const first = paragraphs[0];
  const aligns = new Set(paragraphs.filter((p) => p.runs.length > 0).map((p) => p.align ?? 'left'));
  if (first?.align !== undefined && first.align !== 'left') typography.align = first.align;
  if (aligns.size > 1)
    ctx.report.row('kept', {
      ...rowOn(ctx, undefined),
      code: 'text.align',
      message: 'Paragraphs with different alignments took the first paragraph’s',
    });
  const firstStyle = first?.style;
  if (firstStyle !== undefined) {
    const lnSpc = firstStyle.elements.lnSpc;
    if (lnSpc !== undefined) {
      const pct = child(lnSpc, 'a', 'spcPct');
      const pts = child(lnSpc, 'a', 'spcPts');
      if (pct !== undefined) {
        const value = percentOf(attr(pct, 'val'));
        if (value !== undefined) {
          const reduction = body.autofit?.kind === 'norm' ? body.autofit.lnSpcReduction : 0;
          const leading = Math.round((value - reduction) * 100) / 100;
          if (leading > 0 && leading !== 1.2) typography.leading = Math.max(0.8, leading);
        }
      } else if (pts !== undefined && typography.size !== undefined && typography.size > 0) {
        const val = Number(attr(pts, 'val') ?? '');
        if (Number.isFinite(val))
          typography.leading =
            Math.round((ptToPx(val / 100, ctx.mapping) / typography.size) * 100) / 100;
      }
    }
    const before = spacingPx(firstStyle.elements.spcBef, typography.size, ctx);
    if (before !== undefined && before > 0) typography.spaceBefore = before;
    const after = spacingPx(firstStyle.elements.spcAft, typography.size, ctx);
    if (after !== undefined && after > 0) typography.spaceAfter = after;
    const marL = Number(firstStyle.attrs.marL ?? '0');
    const indent = Number(firstStyle.attrs.indent ?? '0');
    if (first !== undefined && first.bullet === undefined && Number.isFinite(marL) && marL > 0) {
      const left = emuToPx(marL, ctx.mapping);
      typography.indent = px2(left);
      if (Number.isFinite(indent) && indent !== 0) {
        const firstLine = emuToPx(indent, ctx.mapping);
        if (firstLine > 0) typography.firstLine = px2(firstLine);
        else typography.hanging = px2(-firstLine);
      }
    }
    const spc = Number(firstStyle.run.spc ?? '0');
    if (Number.isFinite(spc) && spc !== 0 && typography.size !== undefined && typography.size > 0) {
      const em = ptToPx(spc / 100, ctx.mapping) / typography.size;
      const snapped = TYPE_TRACKING.find((t) => Math.abs(t - em) <= 0.005);
      typography.tracking = snapped ?? Math.round(em * 1000) / 1000;
    }
  }
  const numCol = Number(body.attrs.numCol ?? '1');
  let columns: TypeColumns | undefined;
  if (Number.isFinite(numCol) && numCol > 1) {
    columns = Math.min(3, numCol) as TypeColumns;
    if (numCol > 3)
      ctx.report.row('kept', {
        ...rowOn(ctx, undefined),
        code: 'text.columns',
        message: `${numCol} columns became 3, the most a text block holds`,
      });
  }
  const valign = valignOf(body.attrs.anchor);
  const padding = paddingOf(body.attrs, ctx);
  const autofit: Autofit =
    body.autofit?.kind === 'norm' ? 'shrink' : body.autofit?.kind === 'shape' ? 'grow' : 'none';

  const bulleted = paragraphs.filter((p) => p.runs.length > 0 && p.bullet !== undefined);
  const withText = paragraphs.filter((p) => p.runs.length > 0);
  let list: ListReading | undefined;
  let mixedList = false;
  if (withText.length > 0 && bulleted.length === withText.length) list = listOf(withText, ctx);
  else if (bulleted.length > 0) mixedList = true;

  // the block's colour: the one colour every run writes itself, else the one inherited colour of a
  // body whose runs write none (the theme's default text colour, `ink` under adopt, is the block's
  // default and is left unwritten)
  let color: Color | undefined;
  if (!colorless && colors.size === 1) color = [...colors][0] as Color;
  else if (colors.size === 0 && inheritedColors.size === 1) {
    const only = [...inheritedColors][0] as Color;
    if (only !== 'ink') color = only;
  }
  if (color !== undefined && !colorless) {
    for (const p of paragraphs) for (const r of p.runs) delete r.color;
  }
  const textFinal =
    color === undefined ? text : paragraphs.map((p) => serializeRuns(p.runs)).join('\n');
  const monospace = families.length > 0 && families.every((f) => MONO_FAMILIES.test(f));
  return {
    paragraphs,
    text: textFinal,
    plain,
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(color !== undefined ? { color } : {}),
    bold: anyRun && allBold,
    ...(valign !== undefined ? { valign } : {}),
    ...(padding !== undefined ? { padding } : {}),
    autofit,
    ...(columns !== undefined ? { columns } : {}),
    ...(list !== undefined ? { list } : {}),
    mixedList,
    mixedSizes,
    ...(outline !== undefined ? { outline } : {}),
    empty,
    fonts,
    monospace,
  };
}

function spread(sizes: number[]): number {
  if (sizes.length < 2) return 0;
  const ladder: number[] = [...TYPE_LADDER].sort((a, b) => a - b);
  const index = (size: number): number => ladder.indexOf(nearestLadderSize(size));
  const indexes = sizes.map(index);
  return Math.max(...indexes) - Math.min(...indexes);
}

function spacingPx(
  el: Element | undefined,
  size: number | undefined,
  ctx: SlideContext,
): number | undefined {
  if (el === undefined) return undefined;
  const pts = child(el, 'a', 'spcPts');
  if (pts !== undefined) {
    const val = Number(attr(pts, 'val') ?? '');
    return Number.isFinite(val) ? px2(ptToPx(val / 100, ctx.mapping)) : undefined;
  }
  const pct = child(el, 'a', 'spcPct');
  if (pct !== undefined && size !== undefined) {
    const value = percentOf(attr(pct, 'val'));
    if (value === undefined) return undefined;
    return px2(value * size);
  }
  return undefined;
}

function valignOf(anchor: string | undefined): Valign | undefined {
  switch (anchor) {
    case 't':
      return 'top';
    case 'ctr':
      return 'middle';
    case 'b':
      return 'bottom';
    default:
      return undefined;
  }
}

function paddingOf(attrs: Record<string, string>, ctx: SlideContext): Padding | undefined {
  const l = Number(attrs.lIns ?? DEFAULT_INSETS_EMU.l);
  const t = Number(attrs.tIns ?? DEFAULT_INSETS_EMU.t);
  const r = Number(attrs.rIns ?? DEFAULT_INSETS_EMU.r);
  const b = Number(attrs.bIns ?? DEFAULT_INSETS_EMU.b);
  const sides = {
    left: px2(emuToPx(l, ctx.mapping)),
    top: px2(emuToPx(t, ctx.mapping)),
    right: px2(emuToPx(r, ctx.mapping)),
    bottom: px2(emuToPx(b, ctx.mapping)),
  };
  if (sides.left === sides.right && sides.top === sides.bottom && sides.left === sides.top)
    return sides.left;
  return sides;
}

/** The list a fully bulleted body is (R04 5.2): the marker and preset from the first paragraph. */
function listOf(paragraphs: ParagraphReading[], ctx: SlideContext): ListReading {
  const first = paragraphs[0]?.bullet;
  const items: PlainItem[] = paragraphs.map((p) => {
    const item: PlainItem = { text: serializeRuns(p.runs) };
    if (p.level > 0) item.level = Math.min(9, p.level + 1);
    return item;
  });
  if (first !== undefined && first.kind === 'autonum') {
    const { preset, exact } = numberPresetOf(first.scheme);
    const list: ListReading = { marker: 'number', preset, items };
    if (first.startAt > 1) list.start = first.startAt;
    if (!exact) {
      list.substituted = first.scheme;
      ctx.report.substitute({
        ...rowOn(ctx, undefined),
        code: 'list.scheme',
        message: `The numbering scheme ${first.scheme} became the nearest preset, ${preset}`,
      });
    }
    return list;
  }
  const char = first !== undefined && first.kind === 'char' ? first.char : '•';
  const { preset, exact } = bulletPresetOf(char);
  const list: ListReading = { marker: 'bullet', preset, items };
  if (first !== undefined && first.kind === 'blip') {
    list.substituted = 'picture bullet';
    ctx.report.substitute({
      ...rowOn(ctx, undefined),
      code: 'list.glyph',
      message: 'A picture bullet became the disc preset',
    });
  } else if (!exact) {
    list.substituted = char;
    ctx.report.substitute({
      ...rowOn(ctx, undefined),
      code: 'list.glyph',
      message: `The bullet glyph ${JSON.stringify(char)} became the nearest preset, ${preset}`,
    });
  }
  return list;
}

/** Whether every paragraph of a body is empty. */
export function isEmptyBody(reading: TextBodyReading | undefined): boolean {
  return reading === undefined || reading.empty;
}
