// Slide-level mapping (SPEC 9): the kind from the section classes, the layout from the `.in` child,
// the blocks from map-blocks.ts, the known full-picture style block recognized and dropped, and the
// escape fallback when the grammar cannot express the slide.
import type { Assets } from './assets.ts';
import { consumeRule, consumedCount, leftover, readStyleSheet, scopeClassOf, take } from './css.ts';
import type { StyleSheet } from './css.ts';
import {
  attr,
  children,
  classList,
  collapse,
  contentChildren,
  find,
  hasClass,
  innerHtml,
  isComment,
  isElement,
  outerHtml,
  parseHtmlFragment,
  parseStyle,
  pxNumber,
  textOf,
} from './dom.ts';
import type { Element } from './dom.ts';
import { BlockIdAllocator, slideIdFromFile } from './ids.ts';
import type { IdMap } from './ids.ts';
import { mapBlocks, mapElement, extraClasses, addResidualClasses } from './map-blocks.ts';
import { newBlock, Unmapped } from './map-context.ts';
import type { MapContext } from './map-context.ts';
import type { SourceSection } from './sections.ts';
import { textOfElement } from './text.ts';
import type { Block } from '@turboslide/schema/blocks';
import { importResidual, withImportResidual } from '@turboslide/schema/ext';
import type { ContentSlide, Layout, Plate, Slide, SlotName } from '@turboslide/schema/deck';

export type ReportRow = {
  n: number;
  file: string;
  id: string;
  kind: Slide['kind'];
  layout: string;
  blocks: { id: string; type: string }[];
  rulesConsumed: number;
  rulesLeftOver: string[];
  inlineLeftOver: string[];
  unhandled: string[];
  html: null | { reason: string };
};

export type MappedSlide = { slide: Slide; row: ReportRow; warnings: string[] };

export type MapInput = {
  file: string;
  n: number;
  html: string;
  section: SourceSection;
  assets: Assets;
  previousIds: IdMap;
  nextIds: IdMap;
};

const CONTENT_WIDTH = 1326;
const COLS_GAP = 72;

export function mapSlide(input: MapInput): MappedSlide {
  const fragment = parseHtmlFragment(input.html);
  const section = find(fragment, (el) => el.tagName === 'section' && hasClass(el, 'slide'));
  if (!section) throw new Error(`${input.file}: no <section class="slide">`);
  const comment = fragment.childNodes.find(isComment);
  const slideId = slideIdFromFile(input.file);
  const classes = classList(section);
  const scope = scopeClassOf(classes);
  const styleText = children(section)
    .filter((el) => el.tagName === 'style')
    .map((el) => textOf(el))
    .join('\n');
  const sheet = readStyleSheet(styleText, scope);
  const ids = new BlockIdAllocator(input.file, input.previousIds, input.nextIds);
  const ctx: MapContext = {
    slideId,
    sheet,
    assets: input.assets,
    ids,
    leftoverInline: [],
    unhandled: [],
    sourceClasses: new Map(),
    residualCss: [],
  };
  const warnings: string[] = [];
  const base = { schemaVersion: 1 as const, id: slideId };
  const row: ReportRow = {
    n: input.n,
    file: input.file,
    id: slideId,
    kind: 'content',
    layout: '',
    blocks: [],
    rulesConsumed: 0,
    rulesLeftOver: [],
    inlineLeftOver: [],
    unhandled: [],
    html: null,
  };
  const inEl = children(section).find((el) => hasClass(el, 'in'));
  if (!inEl) throw new Error(`${input.file}: no .in`);

  let slide: Slide;
  try {
    if (hasClass(section, 'opener') || hasClass(section, 'mood')) {
      slide = fullPicture(ctx, section, inEl, input, base, sheet, warnings);
    } else {
      slide = contentOrStatement(ctx, inEl, base);
    }
  } catch (error) {
    if (!(error instanceof Unmapped)) throw error;
    slide = escape(ctx, section, inEl, base, error, input.file);
    row.html = { reason: escapeReason(error, section) };
  }

  // Residual rules: everything the matchers did not consume, rewritten under the slide scope. The
  // nowrap helpers are the renderer's (word joiners in the text, `.lk` in link tables).
  if (row.html === null) {
    consumeRule(sheet, 'SCOPE .nb');
    consumeRule(sheet, 'SCOPE .lk');
    const rest = leftover(sheet, `.ts-x-${slideId}`);
    if (ctx.residualCss.length > 0) {
      const extra = ctx.residualCss.map((rule) => rule.split('SCOPE').join(`.ts-x-${slideId}`));
      rest.css = [rest.css, ...extra].filter(Boolean).join('\n');
      rest.rules.push(...ctx.residualCss.map((rule) => rule.replace(/\s*\{.*$/, ' { residual }')));
    }
    if (rest.css) {
      slide.ext = withImportResidual(slide.ext, { css: rest.css, ...(scope ? { scope } : {}) });
      row.rulesLeftOver = rest.rules;
      // Blocks keep the source classes that the residual rules still name.
      for (const [block, sourceClasses] of ctx.sourceClasses) {
        const kept = sourceClasses.filter(
          (c) => c !== 'cap-caption' && new RegExp(`\\.${c}(?![\\w-])`).test(rest.css),
        );
        addResidualClasses(block, kept);
      }
    }
    if (rest.css === '' && scope) {
      slide.ext = importResidual(slide.ext) ? withImportResidual(slide.ext, { scope }) : slide.ext;
    }
    // A figcaption with the `.cap` class is titanium rather than ink-2 (s52:16): one residual rule.
    for (const [block, sourceClasses] of ctx.sourceClasses) {
      if (sourceClasses.includes('cap-caption')) {
        const rule = `.ts-x-${slideId} [data-block="${block.id}"] figcaption { color: var(--titanium); }`;
        const current = importResidual(slide.ext) ?? {};
        slide.ext = withImportResidual(slide.ext, {
          css: current.css ? `${current.css}\n${rule}` : rule,
        });
        row.rulesLeftOver.push('figcaption.cap { color }');
      }
    }
  }
  row.kind = slide.kind;
  row.layout = describeLayout(slide);
  row.blocks = listBlocks(slide);
  row.rulesConsumed = consumedCount(sheet);
  row.inlineLeftOver = ctx.leftoverInline;
  row.unhandled = [...new Set(ctx.unhandled)];
  if (comment && !slide.title) {
    // The leading comment names the slide (DECK-GRAMMAR.md:7); the derived title stands unless
    // the file has no heading at all.
    void collapse(comment.data);
  }
  return { slide, row, warnings };
}

/* ---------- full-picture kinds ---------- */

const OPENER_RULES: Record<string, Record<string, string>> = {
  '.s-opener .opener-img': {
    position: 'absolute',
    inset: '-57px',
    'z-index': '-1',
    width: '1600px',
    height: '900px',
    'object-fit': 'cover',
    display: 'block',
  },
  '.s-mood .mood-img': {
    position: 'absolute',
    inset: '-57px',
    'z-index': '-1',
    width: '1600px',
    height: '900px',
    'object-fit': 'cover',
    display: 'block',
  },
  '#stage > .s-opener::after': {
    content: "''",
    position: 'absolute',
    inset: '-57px',
    'z-index': '-1',
    'pointer-events': 'none',
    background:
      'linear-gradient(var(--paper), var(--paper)) 66px 858px / 40px 30px no-repeat, linear-gradient(var(--paper), var(--paper)) 1474px 856px / 60px 28px no-repeat',
  },
  '#stage > .s-mood::after': {
    content: "''",
    position: 'absolute',
    inset: '-57px',
    'z-index': '-1',
    'pointer-events': 'none',
    background:
      'linear-gradient(var(--paper), var(--paper)) 66px 858px / 40px 30px no-repeat, linear-gradient(var(--paper), var(--paper)) 1474px 856px / 60px 28px no-repeat',
  },
  '.s-opener .opener-plate': {
    position: 'absolute',
    left: '0',
    bottom: '0',
    width: 'fit-content',
    'max-width': '740px',
    padding: '22px 26px 20px',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  '.s-opener .opener-plate .big': { color: 'var(--ink)' },
  '.s-opener .opener-plate p': { 'margin-top': '14px', 'max-width': '56ch', color: 'var(--ink)' },
  '.s-opener .opener-plate .credit': {
    'margin-top': '12px',
    'font-size': '15px',
    'line-height': '1.45',
    'letter-spacing': '0.01em',
    color: 'var(--titanium)',
  },
  '.s-mood .mood-plate': {
    position: 'absolute',
    right: '0',
    bottom: '0',
    width: 'fit-content',
    'max-width': '560px',
    padding: '22px 26px 20px',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  '.s-mood .mood-plate .title': { 'font-size': '44px', 'line-height': '1.08', color: 'var(--ink)' },
  '.s-mood .mood-plate p': { 'margin-top': '12px', color: 'var(--ink)' },
  '.s-mood .mood-plate .credit': {
    'margin-top': '12px',
    'font-size': '15px',
    'line-height': '1.45',
    'letter-spacing': '0.01em',
    color: 'var(--titanium)',
  },
  '.s-closing .opener-plate': { top: '0', bottom: 'auto', 'max-width': '720px' },
  '.s-closing .opener-plate .mark': {
    display: 'block',
    width: '138px',
    height: '88px',
    fill: 'currentColor',
    'margin-bottom': '24px',
  },
};

function normalizeCss(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([,/])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

/** Recognizes the copied full-picture style block (s01:3-11, s06:3-12, s85:3-13) and drops it. */
function consumeFullPictureRules(sheet: StyleSheet, warnings: string[], file: string): void {
  for (const rule of sheet.rules) {
    const expected = OPENER_RULES[rule.selector.replace(/\s+/g, ' ').trim()];
    if (!expected) continue;
    let same = true;
    for (const d of rule.declarations) {
      if (normalizeCss(expected[d.prop] ?? '') !== normalizeCss(d.value)) same = false;
      d.consumed = true;
    }
    rule.consumed = true;
    if (!same)
      warnings.push(`${file}: the full-picture rule ${rule.selector} differs from the kind's text`);
  }
}

function fullPicture(
  ctx: MapContext,
  section: Element,
  inEl: Element,
  input: MapInput,
  base: { schemaVersion: 1; id: string },
  sheet: StyleSheet,
  warnings: string[],
): Slide {
  consumeFullPictureRules(sheet, warnings, input.file);
  const img = children(section).find((el) => el.tagName === 'img');
  if (!img) throw new Unmapped('a full-picture slide without its image', section);
  const asset = input.assets.register({
    src: attr(img, 'src') ?? '',
    dark: attr(img, 'data-dark'),
    alt: attr(img, 'alt') ?? '',
  });
  const plateEl = children(inEl).find(
    (el) => hasClass(el, 'opener-plate') || hasClass(el, 'mood-plate'),
  );
  if (!plateEl) throw new Unmapped('a full-picture slide without its plate', section);
  const closing = hasClass(section, 's-closing');
  const mood = hasClass(section, 'mood');
  const plateBlocks: Block[] = [];
  let markSize: { w: number; h: number } | undefined;
  let index = 0;
  for (const child of contentChildren(plateEl)) {
    if (!isElement(child)) continue;
    if (child.tagName === 'svg' && hasClass(child, 'mark')) {
      markSize = { w: 138, h: 88 };
      continue;
    }
    const mapped = mapElement(ctx, child, `/plate/blocks/${index}`);
    for (const block of mapped) {
      // The plate paragraph's spacing is the kind's (s01:9, s06:10); the document states it as the
      // spec's worked example does.
      if (block.type === 'paragraph') {
        if (mood) block.marginTop = 12;
        else {
          block.measure = 56;
          block.marginTop = 14;
        }
      }
      plateBlocks.push(block);
      index += 1;
    }
  }
  const plate: Plate = mood
    ? { side: 'lower-right', maxWidth: 560, blocks: plateBlocks }
    : closing
      ? { side: 'upper-left', maxWidth: 720, blocks: plateBlocks }
      : { side: 'lower-left', maxWidth: 740, blocks: plateBlocks };
  const picture = { asset, fit: 'cover' as const };
  if (mood) return { ...base, kind: 'mood', picture, plate };
  if (closing)
    return { ...base, kind: 'closing', picture, plate, ...(markSize ? { mark: markSize } : {}) };
  return { ...base, kind: 'opener', sectionId: input.section.id, picture, plate };
}

/* ---------- title, statement and content ---------- */

function contentOrStatement(
  ctx: MapContext,
  inEl: Element,
  base: { schemaVersion: 1; id: string },
): Slide {
  const roots = contentChildren(inEl).filter(isElement);
  const root = roots[0];
  if (!root || roots.length !== 1)
    throw new Unmapped(`${roots.length} layout roots under .in`, inEl);
  if (hasClass(root, 'center')) {
    const big = children(root).find((el) => hasClass(el, 'big'));
    if (!big || children(root).length !== 1)
      throw new Unmapped('a center layout that is not one statement', root);
    const style = parseStyle(attr(big, 'style'));
    const ch = /^(\d+)ch$/.exec(style.get('max-width') ?? '');
    return {
      ...base,
      kind: 'statement',
      big: textOfElement(big, { unhandled: ctx.unhandled }),
      ...(ch ? { measure: Number(ch[1]) } : {}),
    };
  }
  if (hasClass(root, 'left-mid')) {
    const svg = children(root).find((el) => el.tagName === 'svg');
    const h1 = children(root).find((el) => el.tagName === 'h1');
    const lead = children(root).find((el) => el.tagName === 'p');
    if (!svg || !h1 || !lead)
      throw new Unmapped('a left-mid layout that is not the title slide', root);
    const w = Number(attr(svg, 'width'));
    const h = Number(attr(svg, 'height'));
    if (
      pxNumber(parseStyle(attr(h1, 'style')).get('margin-top')) !== 44 ||
      pxNumber(parseStyle(attr(lead, 'style')).get('margin-top')) !== 26
    ) {
      ctx.unhandled.push('title slide margins differ from 44 and 26');
    }
    return {
      ...base,
      kind: 'title',
      mark: { w, h },
      heading: textOfElement(h1, { unhandled: ctx.unhandled }),
      lead: textOfElement(lead, { unhandled: ctx.unhandled }),
    };
  }
  if (hasClass(root, 'cols')) return cols(ctx, root, base);
  if (hasClass(root, 'split') || hasClass(root, 'lay')) return split(ctx, root, base);
  throw new Unmapped(`no layout for <${root.tagName} class="${classList(root).join(' ')}">`, root);
}

function colsWidths(ratio: Layout & { type: 'cols' }): [number, number] {
  const total = CONTENT_WIDTH - COLS_GAP;
  const r = ratio.ratio;
  if (typeof r === 'string') {
    const [a, b] = r.split('/').map(Number);
    const unit = total / ((a ?? 1) + (b ?? 1));
    return [unit * (a ?? 1), unit * (b ?? 1)];
  }
  if ('left' in r) return [r.left, total - r.left];
  return [total - r.right, r.right];
}

function cols(
  ctx: MapContext,
  root: Element,
  base: { schemaVersion: 1; id: string },
): ContentSlide {
  const layout: Layout & { type: 'cols' } = {
    type: 'cols',
    ratio: hasClass(root, 'even') ? '1/1' : hasClass(root, 'wide-right') ? '4/8' : '5/7',
  };
  // Scoped column templates (s32:3, s75:3, s77:3, s78:3).
  for (const key of ['SCOPE .cols', 'SCOPE .cols.even', 'SCOPE .cols.wide-right']) {
    const template = take(ctx.sheet, key, 'grid-template-columns');
    if (!template) continue;
    const t = template.trim();
    const left = /^(\d+)px\s+(minmax\(0,\s*1fr\)|1fr)$/.exec(t);
    const right = /^(minmax\(0,\s*1fr\)|1fr)\s+(\d+)px$/.exec(t);
    if (left) layout.ratio = { left: Number(left[1]) };
    else if (right) layout.ratio = { right: Number(right[2]) };
    else if (/^minmax\(0,\s*5fr\)\s+minmax\(0,\s*7fr\)$/.test(t)) layout.ratio = '5/7';
    else throw new Unmapped(`a column template of ${t}`, root);
  }
  take(ctx.sheet, 'SCOPE .stack', 'min-width');
  const columns = contentChildren(root).filter(isElement);
  if (columns.length !== 2) throw new Unmapped(`${columns.length} columns in .cols`, root);
  const [leftW, rightW] = colsWidths(layout);
  const slots: ContentSlide['slots'] = {
    left: column(ctx, columns[0] as Element, 'left', leftW),
    right: column(ctx, columns[1] as Element, 'right', rightW),
  };
  return { ...base, kind: 'content', layout, slots };
}

function column(ctx: MapContext, el: Element, name: SlotName, width: number): Block[] {
  const inner: MapContext = { ...ctx, slotWidth: width };
  if (hasClass(el, 'stack') && extraClasses(el).length === 0) {
    return mapBlocks(inner, contentChildren(el), `/slots/${name}`);
  }
  return mapElement(inner, el, `/slots/${name}/0`);
}

function split(
  ctx: MapContext,
  root: Element,
  base: { schemaVersion: 1; id: string },
): ContentSlide {
  const lay = hasClass(root, 'lay');
  const layout: Layout & { type: 'split' } = { type: 'split' };
  const gapKey = lay ? 'SCOPE .lay' : 'SCOPE .split';
  const gap = pxNumber(take(ctx.sheet, gapKey, 'gap'));
  if (gap !== undefined) {
    if (![56, 44, 40, 36, 32, 26].includes(gap)) throw new Unmapped(`a split gap of ${gap}`, root);
    layout.gap = gap as 44;
  }
  if (lay) {
    take(ctx.sheet, 'SCOPE .lay', 'position');
    take(ctx.sheet, 'SCOPE .lay', 'inset');
    take(ctx.sheet, 'SCOPE .lay', 'display');
    take(ctx.sheet, 'SCOPE .lay', 'flex-direction');
    take(ctx.sheet, 'SCOPE .lay > .head', 'flex');
    layout.body = { align: 'start' };
  }
  const parts = contentChildren(root).filter(isElement);
  const head = parts.find((el) => hasClass(el, 'head'));
  if (!head) throw new Unmapped('a split without a head', root);
  const bodyEl = parts.find((el) => hasClass(el, 'body'));
  const rest = parts.filter((el) => el !== head && el !== bodyEl);
  if (lay && bodyEl) throw new Unmapped('a .lay with a .body', root);
  if (!lay && (rest.length > 0 || !bodyEl))
    throw new Unmapped('a split whose body is not .body', root);
  const slots: ContentSlide['slots'] = {};
  // The head as two columns (s21:4, s34:3-5, s38:3-5, s61:4-5, s80:4-6).
  const headDisplay = take(ctx.sheet, 'SCOPE .head', 'display');
  if (headDisplay === 'grid') {
    const template = (take(ctx.sheet, 'SCOPE .head', 'grid-template-columns') ?? '').trim();
    const colsRatio = template === '5fr 7fr' ? '5/7' : template === '4fr 8fr' ? '4/8' : undefined;
    if (!colsRatio) throw new Unmapped(`a head template of ${template}`, head);
    take(ctx.sheet, 'SCOPE .head', 'gap');
    const align = take(ctx.sheet, 'SCOPE .head', 'align-items');
    layout.head = {
      cols: colsRatio,
      ...(align === 'first baseline' || align === 'baseline' ? { align: 'baseline' as const } : {}),
    };
    for (const key of ['SCOPE .head h2', 'SCOPE .head p', 'SCOPE .head h2, SCOPE .head p']) {
      take(ctx.sheet, key, 'margin-bottom');
      take(ctx.sheet, key, 'margin-top');
      take(ctx.sheet, key, 'margin');
    }
    const headKids = contentChildren(head).filter(isElement);
    const [leftW, rightW] = colsWidths({ type: 'cols', ratio: colsRatio });
    slots.headLeft = mapBlocks(
      { ...ctx, slotWidth: leftW },
      headKids.slice(0, 1),
      '/slots/headLeft',
    );
    slots.headRight = mapBlocks(
      { ...ctx, slotWidth: rightW },
      headKids.slice(1),
      '/slots/headRight',
    );
  } else {
    // s63:4, s76:4 `.head p { margin-top: 10px }`; s83:3 `.head h2 { margin-bottom: 14px }`.
    const pTop = pxNumber(take(ctx.sheet, 'SCOPE .head p', 'margin-top'));
    const blocks = mapBlocks(
      { ...ctx, slotWidth: CONTENT_WIDTH },
      contentChildren(head),
      '/slots/head',
    );
    if (pTop !== undefined) {
      for (const block of blocks)
        if (block.type === 'paragraph' && block.marginTop === undefined) block.marginTop = pTop;
    }
    slots.head = blocks;
  }
  if (bodyEl) {
    if (hasClass(bodyEl, 'end')) layout.body = { align: 'end' };
    const style = parseStyle(attr(bodyEl, 'style'));
    style.delete('color');
    if (style.size > 0) ctx.unhandled.push(`.body style="${attr(bodyEl, 'style') ?? ''}"`);
    slots.body = mapBlocks(
      { ...ctx, slotWidth: CONTENT_WIDTH },
      contentChildren(bodyEl),
      '/slots/body',
    );
  } else {
    slots.body = mapBlocks({ ...ctx, slotWidth: CONTENT_WIDTH }, rest, '/slots/body');
  }
  return { ...base, kind: 'content', layout, slots };
}

/* ---------- the escape hatch ---------- */

function escapeReason(error: Unmapped, section: Element): string {
  const classes = classList(section).filter((c) => c !== 'slide');
  return `${error.reason}${classes.length ? ` (section classes: ${classes.join(' ')})` : ''}`;
}

function escape(
  ctx: MapContext,
  section: Element,
  inEl: Element,
  base: { schemaVersion: 1; id: string },
  error: Unmapped,
  file: string,
): ContentSlide {
  // Start over: a fresh allocator so the escape block is the slide's only block.
  const ids = new BlockIdAllocator(file, {}, {});
  const scoped = ctx.sheet.rules
    .map(
      (rule) =>
        `${rule.key.split('SCOPE').join(`.${`ts-x-${ctx.slideId}-html`}`)} { ${rule.declarations.map((d) => `${d.prop}: ${d.value};`).join(' ')} }`,
    )
    .join('\n');
  // Sprite patches and other siblings of .in (s83:20-21) travel with the markup.
  const extras = children(section)
    .filter((el) => el !== inEl && el.tagName !== 'style')
    .map(outerHtml)
    .join('');
  const html = rewriteEscapeImages(ctx, extras + innerHtml(inEl));
  const block = newBlock({ ...ctx, ids }, 'html', '/slots/main/0', {
    css: scoped,
    html: html.trim(),
    note: `Escape: ${error.reason}. Source ${file}; every scoped rule of the slide travels with the markup.`,
  });
  return { ...base, kind: 'content', layout: { type: 'stack' }, slots: { main: [block] } };
}

/** Images in escape markup become deck assets too; their paths point at the copied twins. */
function rewriteEscapeImages(ctx: MapContext, html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const read = (name: string): string | undefined =>
      new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
    const src = read('src');
    if (!src || !src.startsWith('shots/')) return tag;
    const dark = read('data-dark');
    const alt = read('alt') ?? '';
    const id = ctx.assets.register({ src, dark, alt });
    const asset = ctx.assets.registry.assets[id];
    if (!asset) return tag;
    const light = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
    const darkPath = 'neutral' in asset.twins ? undefined : asset.twins.dark;
    let out = tag.replace(/\ssrc="[^"]*"/, ` src="${light}"`);
    if (darkPath) out = out.replace(/\sdata-dark="[^"]*"/, ` data-dark="${darkPath}"`);
    return out;
  });
}

/* ---------- report helpers ---------- */

function describeLayout(slide: Slide): string {
  switch (slide.kind) {
    case 'content': {
      const l = slide.layout;
      if (l.type === 'cols')
        return `cols ${typeof l.ratio === 'string' ? l.ratio : JSON.stringify(l.ratio)}`;
      if (l.type === 'split')
        return `split${l.gap ? ` gap ${l.gap}` : ''}${l.head && l.head !== 'single' ? ` head ${l.head.cols}` : ''}`;
      return l.type;
    }
    case 'opener':
      return 'plate lower-left';
    case 'mood':
      return 'plate lower-right';
    case 'closing':
      return 'plate upper-left';
    case 'title':
      return 'left-mid';
    case 'statement':
      return 'center';
  }
}

function listBlocks(slide: Slide): { id: string; type: string }[] {
  const out: { id: string; type: string }[] = [];
  const walk = (blocks: Block[]): void => {
    for (const block of blocks) {
      out.push({ id: block.id, type: block.type });
      if (block.type === 'composite') for (const cell of block.cells) walk(cell.blocks);
    }
  };
  if (slide.kind === 'content') for (const blocks of Object.values(slide.slots)) walk(blocks);
  else if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    walk(slide.plate.blocks);
  return out;
}
