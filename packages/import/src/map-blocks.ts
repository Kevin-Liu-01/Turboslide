// Element to block mapping (SPEC 9 table): one matcher per head.html class or pattern. Each matcher
// consumes the scoped rules and inline styles it turns into properties; what is left is residual.
import { consumeRule, take } from './css.ts';
import {
  attr,
  children,
  classList,
  collapse,
  contentChildren,
  find,
  findAll,
  hasClass,
  isElement,
  isText,
  outerHtml,
  parseStyle,
  pxNumber,
  removeAttr,
  textOf,
} from './dom.ts';
import type { ChildNode, Element } from './dom.ts';
import {
  bareImage,
  compositeCandidate,
  compositeFigure,
  consumeDiaWidth,
  consumePlain20Rules,
  consumeShotImageRules,
  iconDiagram,
  isCompositeFigure,
  isStandaloneIcon,
  lowerHeading,
  rowMinHeight,
} from './composite.ts';
import { addResidualClasses, addResidualStyle, newBlock, pxIn, Unmapped } from './map-context.ts';
import type { MapContext } from './map-context.ts';
import { textOfElement, textOfNodes } from './text.ts';
import type { AssetId } from '@turboslide/schema/ids';
import { isIconName } from '@turboslide/schema/icons';
import type { IconColor } from '@turboslide/schema/icons';
import type { Block, BlockOf, Icon } from '@turboslide/schema/blocks';
import { plainText } from '@turboslide/schema/text';

const SLOT_WIDTHS = [522.5, 731.5, 418, 836, 627, 1326];
const GRAMMAR_CLASSES = new Set([
  'stack',
  'rows',
  'tight',
  'narrow',
  'links',
  'plain',
  'refs',
  'scales',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'shot',
  'fit',
  'shot-wrap',
  'pair',
  'dia',
  'dither',
  'panel',
  'term',
  'big',
  'title',
  'lead',
  'cap',
  'muted',
  'max',
  'max-p',
  'credit',
  'no',
  'ok',
  'warn',
  'info',
  'ic',
  'ext',
  'gt-word',
  'sr',
  'head',
  'body',
  'end',
  'cols',
  'even',
  'wide-right',
  'split',
  'center',
  'left-mid',
  'lay',
  'ref',
  'more',
  'dir',
  'site',
  'r1',
  'r2',
  'who',
  'state',
  'plate',
  'step',
  'crop',
  'w',
  'q',
  'scale',
  'bar',
  'swatch',
  'ink',
  'raised',
  'ti',
  'paper',
  'lk',
  'nb',
  'name-mark',
  'ex',
]);
// Source container classes the renderer replaces with its own (`.mats` becomes `.pair`, `.dgrid`
// becomes `.details`) are extra classes: a residual rule that names one keeps it on the block root.

/** Source classes the grammar does not name, kept so residual rules can target them. */
function extraClasses(el: Element): string[] {
  return classList(el).filter((c) => !GRAMMAR_CLASSES.has(c));
}

/** The icon of a `<svg class="ic ok"><use href="#i-check-circle"/></svg>`. */
export function iconOf(svg: Element): Icon {
  const use = find(svg, (e) => e.tagName === 'use');
  const href = use ? (attr(use, 'href') ?? attr(use, 'xlink:href') ?? '') : '';
  const name = href.replace(/^#i-/, '').replace(/^#/, '');
  // IconName is the sprite's 63 symbols plus gt-mark (SPEC 4.2); a symbol the sprite lacks has
  // no declared form, so the element falls back to the html escape and lint's icon/known names it.
  if (!isIconName(name)) throw new Unmapped(`icon "${name}" is not in the sprite`, svg);
  const color = (['ok', 'warn', 'no', 'info'] as IconColor[]).find((c) => hasClass(svg, c));
  return color ? { name, color } : { name };
}

/**
 * Registers an image and returns its asset id. The deck writes `alt=""` on tiles whose visible
 * label names the picture (slides 69 and 71); an asset needs a non-empty alt (SPEC 4.2), so the
 * label's plain text is the alt when the source has none.
 */
function imageRef(ctx: MapContext, img: Element, fallbackAlt?: string): AssetId {
  const src = attr(img, 'src') ?? '';
  const dark = attr(img, 'data-dark');
  const alt = attr(img, 'alt') || (fallbackAlt !== undefined ? plainText(fallbackAlt) : '');
  return ctx.assets.register({ src, dark, alt });
}

/** Takes a declaration from an inline style map, marking it used. */
function takeInline(style: Map<string, string>, prop: string): string | undefined {
  const value = style.get(prop);
  style.delete(prop);
  return value;
}

/** Maps a list of sibling elements to blocks; the path names the slot. */
export function mapBlocks(ctx: MapContext, nodes: ChildNode[], path: string): Block[] {
  const out: Block[] = [];
  let index = 0;
  for (const node of nodes) {
    if (isText(node)) {
      if (node.value.trim())
        throw new Unmapped(`loose text "${collapse(node.value).slice(0, 40)}"`);
      continue;
    }
    if (!isElement(node)) continue;
    const mapped = mapElement(ctx, node, `${path}/${index}`);
    out.push(...mapped);
    index += mapped.length;
  }
  return out;
}

export function mapElement(ctx: MapContext, el: Element, path: string): Block[] {
  const tag = el.tagName;
  const cls = classList(el);
  if (tag === 'style') return [];
  if (tag === 'h1' || tag === 'h2') return [heading(ctx, el, path, tag)];
  if (tag === 'p') return [paragraph(ctx, el, path)];
  if (tag === 'div' && hasClass(el, 'big'))
    return [heading(ctx, el, path, hasClass(el, 'title') ? 'title' : 'big')];
  if (tag === 'div' && hasClass(el, 'credit')) return [credit(ctx, el, path)];
  if (hasClass(el, 'rows')) return [hasClass(el, 'ex') ? say(ctx, el, path) : rows(ctx, el, path)];
  if (hasClass(el, 'plain')) return [plain(ctx, el, path)];
  if (hasClass(el, 'refs')) return [refs(ctx, el, path)];
  if (hasClass(el, 'scales')) return [scales(ctx, el, path)];
  if (hasClass(el, 'spec')) return [spec(ctx, el, path)];
  if (hasClass(el, 'lang')) return [lang(ctx, el, path)];
  if (hasClass(el, 'ladder')) return [ladder(ctx, el, path)];
  if (hasClass(el, 'swatches')) return [swatches(ctx, el, path)];
  if (hasClass(el, 'shot-wrap')) return shotWrap(ctx, el, path);
  if (tag === 'figure')
    return [isCompositeFigure(el) ? compositeFigure(ctx, el, path, mapNode) : shot(ctx, el, path)];
  if (tag === 'img' && hasClass(el, 'shot')) return [shotImage(ctx, el, path, undefined)];
  if (tag === 'img') return [bareImage(ctx, el, path)];
  if (hasClass(el, 'crop')) return [cropShot(ctx, el, path)];
  if (tag === 'svg' && hasClass(el, 'dia')) return [dia(ctx, el, path)];
  if (isStandaloneIcon(el))
    return [iconDiagram(ctx, el, path, (block, classes) => ctx.sourceClasses.set(block, classes))];
  if (
    tag === 'svg' &&
    find(el, (e) => e.tagName === 'use' && (attr(e, 'href') ?? '') === '#gt-mark')
  ) {
    return [mark(ctx, el, path)];
  }
  if (/^h[3-6]$/.test(tag)) return [lowerHeading(ctx, el, path)];
  if (tag === 'canvas' && hasClass(el, 'dither')) return [dither(ctx, el, path)];
  if (hasClass(el, 'panel')) return [panel(ctx, el, path)];
  if (hasClass(el, 'pair') || hasClass(el, 'mats')) return [pair(ctx, el, path)];
  if (hasClass(el, 'refgrid') || hasClass(el, 'dirs')) return [thumbTiles(ctx, el, path)];
  if (hasClass(el, 'eng')) return [engineTiles(ctx, el, path)];
  if (hasClass(el, 'dgrid')) return [details(ctx, el, path)];
  if (hasClass(el, 'board')) return [board(ctx, el, path)];
  if (hasClass(el, 'lineage')) return [logoPlates(ctx, el, path)];
  if (hasClass(el, 'sizes')) return [markSizes(ctx, el, path)];
  if (hasClass(el, 'key') || hasClass(el, 'strips') || hasClass(el, 'stack'))
    return [columnGroup(ctx, el, path)];
  if (tag === 'div' && cls.length === 0) return [plainDiv(ctx, el, path)];
  // A div or span the grammar names no block for: a grid, a stack or a text element by its scoped
  // rules (composite.ts), the M5 path that retired the last html escapes.
  if (tag === 'div' || tag === 'span')
    return [compositeCandidate(ctx, el, path, mapNode, keepSourceClasses(ctx))];
  throw new Unmapped(`no block for <${tag}${cls.length ? ` class="${cls.join(' ')}"` : ''}>`, el);
}

/** One child node to its blocks, the callback the composite mappers recurse through. */
function mapNode(ctx: MapContext, node: ChildNode, path: string): Block[] {
  return mapBlocks(ctx, [node], path);
}

/** Keeps an element's non-grammar classes on the block so residual rules can target them. */
function keepSourceClasses(ctx: MapContext): (block: Block, el: Element) => void {
  return (block, el) => ctx.sourceClasses.set(block, extraClasses(el));
}

function heading(
  ctx: MapContext,
  el: Element,
  path: string,
  level: 'h1' | 'h2' | 'big' | 'title',
): Block {
  const style = parseStyle(attr(el, 'style'));
  const marginTop = pxNumber(takeInline(style, 'margin-top'));
  const block = newBlock(ctx, 'heading', path, {
    level,
    text: textOfElement(el, { unhandled: ctx.unhandled }),
    ...(marginTop !== undefined ? { marginTop } : {}),
  });
  // s66:3 `.stack > h2 { margin-bottom: 0 }`, s83:3 `.head h2 { margin-bottom: 14px }` (escape).
  const mb = take(ctx.sheet, 'SCOPE .stack > h2', 'margin-bottom');
  if (mb !== undefined && pxNumber(mb) === 0 && level === 'h2') block.marginBottom = 0;
  addResidualStyle(ctx, block, style);
  return block;
}

function paragraph(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const body: Omit<BlockOf<'paragraph'>, 'id' | 'type'> = {
    text: textOfElement(el, { unhandled: ctx.unhandled }),
  };
  if (hasClass(el, 'lead')) body.role = 'lead';
  else if (hasClass(el, 'cap')) body.role = 'cap';
  if (hasClass(el, 'muted')) body.tone = 'muted';
  if (hasClass(el, 'max')) body.measure = 32;
  if (hasClass(el, 'max-p')) body.measure = 56;
  const maxWidth = takeInline(style, 'max-width');
  if (maxWidth) {
    const ch = /^(\d+)ch$/.exec(maxWidth);
    if (ch) body.measure = Number(ch[1]);
    else style.set('max-width', maxWidth);
  }
  const marginTop = pxNumber(takeInline(style, 'margin-top'));
  if (marginTop !== undefined) body.marginTop = marginTop;
  // s13:4 `.credit { margin-top: 16px }` on a caption that carries the class.
  if (hasClass(el, 'credit')) {
    const mt = pxNumber(take(ctx.sheet, 'SCOPE .credit', 'margin-top'));
    if (mt !== undefined) body.marginTop = mt;
  }
  const block = newBlock(ctx, 'paragraph', path, body);
  addResidualStyle(ctx, block, style);
  return block;
}

function credit(ctx: MapContext, el: Element, path: string): Block {
  return newBlock(ctx, 'credit', path, { text: textOfElement(el, { unhandled: ctx.unhandled }) });
}

const KEYS = [90, 120, 150, 180, 190, 200, 220, 240, 250, 300] as const;

function rows(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  let key: (typeof KEYS)[number] | undefined = pxIn(takeInline(style, '--key'), KEYS);
  if (key === undefined) {
    // s28:3 `.rows > div { grid-template-columns: 150px 1fr }`
    const template = take(ctx.sheet, 'SCOPE .rows > div', 'grid-template-columns');
    const px = template ? pxIn(template.split(/\s+/)[0], KEYS) : undefined;
    if (px !== undefined) key = px;
  }
  if (key === undefined) key = hasClass(el, 'narrow') ? 180 : 240;
  const items: BlockOf<'rows'>['items'] = [];
  let minRowHeight: number | undefined;
  for (const row of children(el)) {
    const b = children(row).find((c) => c.tagName === 'b');
    const span = children(row).find((c) => c.tagName === 'span');
    if (!b || !span) throw new Unmapped('a rows entry without key and value', row);
    const iconSvg = children(b).find((c) => c.tagName === 'svg' && hasClass(c, 'ic'));
    const keyNodes = b.childNodes.filter((n) => n !== iconSvg);
    const item: BlockOf<'rows'>['items'][number] = {
      key: textOfNodes(keyNodes, { unhandled: ctx.unhandled }),
      value: textOfElement(span, { unhandled: ctx.unhandled }),
    };
    if (iconSvg) item.icon = iconOf(iconSvg);
    if (findAll(span, (e) => hasClass(e, 'ext')).length > 0) item.ext = true;
    items.push(item);
    const rowStyle = parseStyle(attr(row, 'style'));
    const mh = pxNumber(rowStyle.get('min-height'));
    if (mh !== undefined) minRowHeight = mh;
  }
  // s25:7 `.rules .rows > div { min-height: 79px }`: the row height a scoped rule forces
  if (minRowHeight === undefined) minRowHeight = rowMinHeight(ctx, el);
  const block = newBlock(ctx, 'rows', path, {
    key,
    ...(hasClass(el, 'tight') ? { tight: true } : {}),
    ...(hasClass(el, 'links') ? { links: true } : {}),
    ...(minRowHeight !== undefined ? { minRowHeight } : {}),
    items,
  });
  ctx.sourceClasses.set(block, extraClasses(el));
  addResidualStyle(ctx, block, style);
  return block;
}

/** Slide 12's `.rows.ex`: the two-register quote table the `say` block renders (s12:3-8). */
function say(ctx: MapContext, el: Element, path: string): Block {
  const items: BlockOf<'say'>['items'] = [];
  for (const row of children(el)) {
    const b = children(row).find((c) => c.tagName === 'b');
    const q = children(row).find((c) => c.tagName === 'span');
    if (!b || !q) throw new Unmapped('a say entry without note and quote', row);
    const iconSvg = children(b).find((c) => c.tagName === 'svg');
    const item: BlockOf<'say'>['items'][number] = {
      quote: textOfElement(q, { unhandled: ctx.unhandled }),
      note: textOfNodes(
        b.childNodes.filter((n) => n !== iconSvg),
        { unhandled: ctx.unhandled },
      ),
    };
    if (hasClass(q, 'no')) item.no = true;
    items.push(item);
  }
  for (const key of [
    'SCOPE .ex',
    'SCOPE .ex > div',
    'SCOPE .ex > div > b',
    'SCOPE .ex .q',
    'SCOPE .ex .q.no',
  ]) {
    consumeRule(ctx.sheet, key);
  }
  return newBlock(ctx, 'say', path, { items });
}

function plain(ctx: MapContext, el: Element, path: string): Block {
  const size = pxIn(take(ctx.sheet, 'SCOPE .plain', 'font-size'), [24, 22, 20] as const);
  if (size === 22) take(ctx.sheet, 'SCOPE .plain', 'line-height');
  if (size === 20) {
    // s84:8-11: the 20 px list restates the renderer's row and icon rules (block-css .plain-20)
    take(ctx.sheet, 'SCOPE .plain', 'line-height');
    consumePlain20Rules(ctx);
  }
  const items: BlockOf<'plain'>['items'] = [];
  for (const span of children(el)) {
    const iconSvg = children(span).find((c) => c.tagName === 'svg' && hasClass(c, 'ic'));
    const item: BlockOf<'plain'>['items'][number] = {
      text: textOfNodes(
        span.childNodes.filter((n) => n !== iconSvg),
        { unhandled: ctx.unhandled },
      ),
    };
    if (iconSvg) item.icon = iconOf(iconSvg);
    if (hasClass(span, 'no')) item.no = true;
    items.push(item);
  }
  return newBlock(ctx, 'plain', path, {
    ...(size !== undefined && size !== 24 ? { size } : {}),
    items,
  });
}

function refs(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const items = children(el).map((span) => textOfElement(span, { unhandled: ctx.unhandled }));
  const block = newBlock(ctx, 'refs', path, { items });
  ctx.sourceClasses.set(block, extraClasses(el));
  addResidualStyle(ctx, block, style);
  return block;
}

function scales(ctx: MapContext, el: Element, path: string): Block {
  const items: BlockOf<'scales'>['items'] = [];
  for (const scale of children(el)) {
    const parts = children(scale);
    const left = parts[0];
    const bar = parts[1];
    const right = parts[2];
    if (!left || !bar || !right) throw new Unmapped('a scale without two labels and a bar', scale);
    const marker = find(bar, (e) => e.tagName === 'i');
    const value = marker
      ? Number(/(-?\d+(?:\.\d+)?)%/.exec(attr(marker, 'style') ?? '')?.[1] ?? Number.NaN)
      : Number.NaN;
    if (Number.isNaN(value)) throw new Unmapped('a scale marker without a percent position', scale);
    items.push({
      left: textOfElement(left, { unhandled: ctx.unhandled }),
      right: textOfElement(right, { unhandled: ctx.unhandled }),
      value,
    });
  }
  const centerTick = consumeRule(ctx.sheet, 'SCOPE .scale .bar::after');
  return newBlock(ctx, 'scales', path, { ...(centerTick ? { centerTick: true } : {}), items });
}

function spec(ctx: MapContext, el: Element, path: string): Block {
  const weights: BlockOf<'spec'>['weights'] = [];
  let sample = 'Inter';
  let textRow: string | undefined;
  for (const row of children(el)) {
    const style = parseStyle(attr(row, 'style'));
    const small = children(row).find((c) => c.tagName === 'small');
    const label = collapse(textOf(row).replace(small ? textOf(small) : '', ''));
    if (style.has('font-family')) {
      textRow = textOfNodes(
        row.childNodes.filter((n) => n !== small),
        { unhandled: ctx.unhandled },
      );
      continue;
    }
    const weight = Number(style.get('font-weight'));
    if ([300, 400, 500, 600, 700, 800].includes(weight)) weights.push(weight as 300);
    const first = label.split(' ')[0];
    if (first) sample = first;
  }
  consumeRule(ctx.sheet, 'SCOPE .spec .w small');
  return newBlock(ctx, 'spec', path, { weights, sample, ...(textRow ? { textRow } : {}) });
}

function lang(ctx: MapContext, el: Element, path: string): Block {
  const items: BlockOf<'lang'>['items'] = [];
  for (const row of children(el)) {
    const small = children(row).find((c) => c.tagName === 'small');
    const inner = children(row).find((c) => c.tagName === 'span' && attr(c, 'lang'));
    const script = attr(row, 'lang') ?? (inner ? attr(inner, 'lang') : undefined) ?? 'en';
    const textNodes = (inner ?? row).childNodes.filter((n) => n !== small);
    items.push({
      script,
      text: collapse(textNodes.map(textOf).join('')),
      label: small ? collapse(textOf(small)) : '',
    });
  }
  consumeRule(ctx.sheet, 'SCOPE .lang div small');
  consumeRule(ctx.sheet, 'SCOPE .lang .ja, SCOPE .lang .zh, SCOPE .lang .ko');
  return newBlock(ctx, 'lang', path, { items });
}

function ladder(ctx: MapContext, el: Element, path: string): Block {
  const rowsOut: BlockOf<'ladder'>['rows'] = [];
  for (const row of children(el)) {
    const style = parseStyle(attr(row, 'style'));
    const small = children(row).find((c) => c.tagName === 'small');
    const size = pxNumber(style.get('font-size'));
    if (size === undefined) throw new Unmapped('a ladder row without a font size', row);
    rowsOut.push({ size, label: small ? collapse(textOf(small)) : '' });
    // The renderer derives weight 500 and the display face from a size of 21 and up, the text face
    // with no tracking below (s21:17-24); anything else on the row is a residual rule for that row.
    const derived: Record<string, string | undefined> =
      size >= 21
        ? { 'font-size': `${size}px`, 'font-weight': '500' }
        : { 'font-size': `${size}px`, 'font-family': 'var(--text)', 'letter-spacing': '0' };
    const residual = [...style.entries()]
      .filter(([prop, value]) => derived[prop] !== value.replace(/\s+/g, ''))
      .map(([prop, value]) => `${prop}: ${value};`);
    if (residual.length > 0) {
      ctx.residualCss.push(
        `SCOPE .ladder > div:nth-child(${rowsOut.length}) { ${residual.join(' ')} }`,
      );
    }
  }
  const template = take(ctx.sheet, 'SCOPE .ladder > div', 'grid-template-columns');
  const valueWidth = template ? pxIn(template.split(/\s+/)[1], [200, 320] as const) : undefined;
  take(ctx.sheet, 'SCOPE .ladder > div', 'padding');
  consumeRule(ctx.sheet, 'SCOPE .ladder > div > small');
  return newBlock(ctx, 'ladder', path, { rows: rowsOut, ...(valueWidth ? { valueWidth } : {}) });
}

function swatches(ctx: MapContext, el: Element, path: string): Block {
  const items: BlockOf<'swatches'>['items'] = [];
  for (const swatch of children(el)) {
    const b = children(swatch).find((c) => c.tagName === 'b');
    const span = children(swatch).find((c) => c.tagName === 'span');
    const plate =
      (['ink', 'raised', 'ti', 'paper'] as const).find((p) => hasClass(swatch, p)) ?? 'outline';
    items.push({
      name: b ? collapse(textOf(b)) : '',
      value: span ? textOfElement(span, { breaks: true }) : '',
      plate,
    });
  }
  return newBlock(ctx, 'swatches', path, { items });
}

/** The figure rules of s33:3-4 and friends: `figure { margin:0; width:100%|Npx; display:grid; gap:12px }`. */
function consumeFigureRules(
  ctx: MapContext,
  keys: string[],
): { width?: number; gap?: number; captionSize?: 16 | 15 } {
  const out: { width?: number; gap?: number; captionSize?: 16 | 15 } = {};
  for (const key of keys) {
    take(ctx.sheet, key, 'margin');
    take(ctx.sheet, key, 'display');
    const width = take(ctx.sheet, key, 'width');
    if (width && width !== '100%') out.width = pxNumber(width);
    take(ctx.sheet, key, 'max-width');
    const gap = pxNumber(take(ctx.sheet, key, 'gap'));
    if (gap !== undefined && gap !== 12) out.gap = gap;
    take(ctx.sheet, key, 'justify-items');
  }
  for (const key of ['SCOPE figcaption', 'SCOPE figure figcaption', 'SCOPE .pair figcaption']) {
    const size = pxIn(take(ctx.sheet, key, 'font-size'), [16, 15] as const);
    if (size) out.captionSize = size;
    take(ctx.sheet, key, 'line-height');
    take(ctx.sheet, key, 'color');
  }
  return out;
}

function shotWrap(ctx: MapContext, el: Element, path: string): Block[] {
  const inner = children(el);
  if (inner.length !== 1 || !inner[0]) throw new Unmapped('a shot-wrap with several children', el);
  return mapElement(ctx, inner[0], path);
}

function shot(ctx: MapContext, figure: Element, path: string): Block {
  const img = children(figure).find((c) => c.tagName === 'img');
  const caption = children(figure).find((c) => c.tagName === 'figcaption');
  if (!img) throw new Unmapped('a figure without an image', figure);
  const figureStyle = parseStyle(attr(figure, 'style'));
  takeInline(figureStyle, 'margin');
  takeInline(figureStyle, 'display');
  const inlineGap = pxNumber(takeInline(figureStyle, 'gap'));
  const rules = consumeFigureRules(ctx, ['SCOPE figure', 'SCOPE figure img']);
  const block = shotImage(
    ctx,
    img,
    path,
    caption ? textOfElement(caption, { unhandled: ctx.unhandled }) : undefined,
  );
  if (block.type === 'shot') {
    if (rules.width !== undefined) block.width = rules.width;
    if (rules.captionSize) block.captionSize = rules.captionSize;
    else if (caption && hasClass(caption, 'cap')) block.captionSize = 15;
    const gap = rules.gap ?? (inlineGap !== undefined && inlineGap !== 12 ? inlineGap : undefined);
    if (gap !== undefined) addResidualStyle(ctx, block, new Map([['gap', `${gap}px`]]));
    if (caption && hasClass(caption, 'cap')) {
      ctx.sourceClasses.set(block, [...(ctx.sourceClasses.get(block) ?? []), 'cap-caption']);
    }
  }
  addResidualStyle(ctx, block, figureStyle);
  return block;
}

function shotImage(
  ctx: MapContext,
  img: Element,
  path: string,
  caption: string | undefined,
): Block {
  const asset = imageRef(ctx, img);
  const body: Omit<BlockOf<'shot'>, 'id' | 'type'> = {
    asset,
    fit: hasClass(img, 'fit') ? 'fit' : 'width',
  };
  if (caption !== undefined) body.caption = caption;
  // s49:4 `.shot { aspect-ratio: 1440 / 780; object-fit: cover; object-position: top }`
  const aspect = take(ctx.sheet, 'SCOPE .shot', 'aspect-ratio');
  if (aspect) {
    body.aspect = aspect.replace(/\s+/g, '');
    take(ctx.sheet, 'SCOPE .shot', 'object-fit');
    const position = take(ctx.sheet, 'SCOPE .shot', 'object-position');
    body.crop = position === 'top' ? 'top' : 'center';
    take(ctx.sheet, 'SCOPE .shot', 'width');
    take(ctx.sheet, 'SCOPE .shot', 'height');
  }
  // s66:5 `figure img { width: 522px; height: auto }`
  const width = pxNumber(take(ctx.sheet, 'SCOPE figure img', 'width'));
  if (width !== undefined) body.width = width;
  take(ctx.sheet, 'SCOPE figure img', 'height');
  if (!hasClass(img, 'shot')) {
    // A figure image without the class (s39:5, s67:7, s84:15) takes the shot's border and plate
    // from its own rule; the renderer writes the class, so the matching declarations are consumed.
    consumeShotImageRules(ctx, img);
    for (const key of ['SCOPE figure img', 'SCOPE img']) {
      const border = take(ctx.sheet, key, 'border');
      if (border && !/1px solid var\(--hair\)/.test(border))
        ctx.unhandled.push(`${key} border ${border}`);
      const background = take(ctx.sheet, key, 'background');
      if (background && background !== 'var(--plate)')
        ctx.unhandled.push(`${key} background ${background}`);
      take(ctx.sheet, key, 'display');
    }
  }
  const block = newBlock(ctx, 'shot', path, body);
  const style = parseStyle(attr(img, 'style'));
  addResidualStyle(ctx, block, style);
  return block;
}

/** s41:4-5 `.crop { aspect-ratio: 1440 / 864; overflow: hidden; border; background } .crop img { cover top }`. */
function cropShot(ctx: MapContext, el: Element, path: string): Block {
  const img = children(el).find((c) => c.tagName === 'img');
  if (!img) throw new Unmapped('a crop without an image', el);
  const asset = imageRef(ctx, img);
  const aspect = take(ctx.sheet, 'SCOPE .crop', 'aspect-ratio');
  const position = take(ctx.sheet, 'SCOPE .crop img', 'object-position');
  consumeRule(ctx.sheet, 'SCOPE .crop');
  consumeRule(ctx.sheet, 'SCOPE .crop img');
  return newBlock(ctx, 'shot', path, {
    asset,
    fit: 'width',
    aspect: (aspect ?? '16/9').replace(/\s+/g, ''),
    crop: position === 'top' ? 'top' : 'center',
  });
}

function dia(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  removeAttr(el, 'style');
  consumeDiaWidth(ctx, el);
  const viewBox = (attr(el, 'viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = viewBox[2] ?? 0;
  // `fit: 'slot'` only when the viewBox width is the slot width exactly. A width one pixel off (731
  // in a 731.5 column, s22:10; 732, s66:19; 522 in 522.5, s64:7) keeps its viewBox: rewriting it
  // moves the layout by a fraction of a pixel and text below it can snap to the next pixel row,
  // which the pixel acceptance sees. The dia/fit-slot lint (SPEC 7.7) offers the conversion.
  const slotFit =
    ctx.slotWidth !== undefined
      ? Math.abs(width - ctx.slotWidth) < 0.01 &&
        SLOT_WIDTHS.some((w) => Math.abs(w - width) < 0.01)
      : false;
  const alt = attr(el, 'aria-label') ?? '';
  const block = newBlock(ctx, 'dia', path, {
    fit: slotFit ? 'slot' : { viewBox: [viewBox[0] ?? 0, viewBox[1] ?? 0, width, viewBox[3] ?? 0] },
    svg: outerHtml(el),
    alt,
  });
  ctx.sourceClasses.set(block, extraClasses(el));
  addResidualStyle(ctx, block, style);
  return block;
}

function mark(ctx: MapContext, el: Element, path: string): Block {
  const w = Number(attr(el, 'width'));
  const h = Number(attr(el, 'height'));
  if (!w || !h) throw new Unmapped('a standalone mark without width and height', el);
  return newBlock(ctx, 'mark', path, { w, h });
}

function dither(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const border = /1px solid var\(--hair\)/.test(takeInline(style, 'border') ?? '');
  const block = newBlock(ctx, 'dither', path, {
    height: 220,
    ramp: 'linear-x',
    ...(border ? { border: true } : {}),
    alt: attr(el, 'aria-label') ?? '',
  });
  addResidualStyle(ctx, block, style);
  return block;
}

function panel(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const size = pxIn(take(ctx.sheet, 'SCOPE .panel', 'font-size'), [17, 15] as const);
  const pre = take(ctx.sheet, 'SCOPE .panel', 'white-space') === 'pre';
  take(ctx.sheet, 'SCOPE .panel', 'line-height');
  if (pre) {
    take(ctx.sheet, 'SCOPE .panel', 'padding');
    take(ctx.sheet, 'SCOPE .panel', 'overflow');
  }
  const term = hasClass(el, 'term');
  let code: string;
  let marks = false;
  if (term) {
    const span = children(el).find((c) => c.tagName === 'span');
    marks = children(el).some((c) => c.tagName === 'svg');
    code = span ? collapse(textOf(span)) : collapse(textOf(el));
    consumeRule(ctx.sheet, 'SCOPE .term');
    consumeRule(ctx.sheet, 'SCOPE .term svg');
    consumeRule(ctx.sheet, 'SCOPE .term span');
  } else {
    code = pre ? preText(el) : panelText(el);
  }
  const block = newBlock(ctx, 'panel', path, {
    code,
    ...(size !== undefined && size !== 17 ? { size } : {}),
    ...(pre ? { pre: true } : {}),
    ...(term ? { term: true } : {}),
    ...(marks ? { marks: true } : {}),
  });
  addResidualStyle(ctx, block, style);
  return block;
}

/** Panel text with `<br>` as line breaks and entities decoded (s44:66, s57:7). */
function panelText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (isText(node)) out += node.value.replace(/[ \t\n\r]+/g, ' ');
    else if (isElement(node) && node.tagName === 'br') out += '\n';
    else if (isElement(node)) out += panelText(node);
  }
  return out
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function preText(el: Element): string {
  return textOf(el).replace(/^\n/, '').replace(/\s+$/, '');
}

function pair(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const template = takeInline(style, 'grid-template-columns');
  const body: Omit<BlockOf<'pair'>, 'id' | 'type'> = { figures: [] };
  if (template) {
    const fr = /^(\d+)fr\s+(\d+)fr$/.exec(template.trim());
    if (fr) body.ratio = { left: Number(fr[1]), right: Number(fr[2]) };
    else style.set('grid-template-columns', template);
  }
  const key = hasClass(el, 'mats') ? 'SCOPE .mats' : 'SCOPE .pair';
  const gap = take(ctx.sheet, key, 'gap');
  if (gap !== undefined) {
    const n = pxIn(gap, [28, 40] as const);
    if (n) body.gap = n;
    else style.set('gap', gap);
  }
  take(ctx.sheet, key, 'align-self');
  take(ctx.sheet, key, 'display');
  take(ctx.sheet, key, 'grid-template-columns');
  const rules = consumeFigureRules(ctx, [`${key} figure`]);
  if (rules.gap !== undefined) ctx.residualCss.push(`SCOPE .pair figure { gap: ${rules.gap}px; }`);
  const captionSize =
    pxIn(take(ctx.sheet, `${key} figcaption`, 'font-size'), [16, 15] as const) ?? rules.captionSize;
  if (captionSize) body.captionSize = captionSize;
  for (const figure of children(el)) {
    const assets = children(figure)
      .filter((c) => c.tagName === 'img')
      .map((img) => imageRef(ctx, img));
    const caption = children(figure).find((c) => c.tagName === 'figcaption');
    body.figures.push({
      assets,
      ...(caption ? { caption: textOfElement(caption, { unhandled: ctx.unhandled }) } : {}),
    });
  }
  const block = newBlock(ctx, 'pair', path, body);
  ctx.sourceClasses.set(block, extraClasses(el));
  addResidualStyle(ctx, block, style);
  return block;
}

/** s13 `.refgrid` and s69 `.dirs`: image tiles with 15 px labels. */
function thumbTiles(ctx: MapContext, el: Element, path: string): Block {
  const grid = hasClass(el, 'refgrid') ? 'refgrid' : 'dirs';
  const item = grid === 'refgrid' ? 'ref' : 'dir';
  const template = take(ctx.sheet, `SCOPE .${grid}`, 'grid-template-columns') ?? '';
  const columns = Number(/repeat\((\d+)/.exec(template)?.[1] ?? 4);
  if (![4, 5, 6].includes(columns)) throw new Unmapped(`a tile grid of ${columns} columns`, el);
  const aspectRaw = take(ctx.sheet, `SCOPE .${item} img`, 'aspect-ratio') ?? '16 / 9';
  const aspect = aspectRaw.replace(/\s+/g, '');
  if (!['16/9', '16/10', '1/1'].includes(aspect))
    throw new Unmapped(`a tile aspect of ${aspect}`, el);
  for (const key of [
    `SCOPE .${grid}`,
    `SCOPE .${item} img`,
    `SCOPE .${item} span`,
    `SCOPE .${item}.more`,
    `SCOPE .${item}.site img`,
    `SCOPE .${item}.site span::before`,
  ]) {
    consumeRule(ctx.sheet, key);
  }
  const items: BlockOf<'tiles'>['items'] = [];
  let more: string | undefined;
  for (const tile of children(el)) {
    if (hasClass(tile, 'more')) {
      more = textOfElement(tile, { unhandled: ctx.unhandled });
      continue;
    }
    const img = children(tile).find((c) => c.tagName === 'img');
    const span = children(tile).find((c) => c.tagName === 'span');
    const label = span ? textOfElement(span, { unhandled: ctx.unhandled }) : undefined;
    items.push({
      ...(img ? { asset: imageRef(ctx, img, label) } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(hasClass(tile, 'site') ? { marker: true } : {}),
    });
  }
  return newBlock(ctx, 'tiles', path, {
    columns: columns as 4 | 5 | 6,
    aspect: aspect as '16/9' | '16/10' | '1/1',
    labelSize: 15,
    items,
    ...(more ? { more } : {}),
  });
}

/** s72 `.eng`: twelve figures with a 20 px name and a 15 px line. */
function engineTiles(ctx: MapContext, el: Element, path: string): Block {
  const template = take(ctx.sheet, 'SCOPE .eng', 'grid-template-columns') ?? '';
  const columns = Number(/repeat\((\d+)/.exec(template)?.[1] ?? 4);
  if (![4, 5, 6].includes(columns)) throw new Unmapped(`an engine grid of ${columns} columns`, el);
  for (const key of [
    'SCOPE .eng',
    'SCOPE .eng figure',
    'SCOPE .eng img',
    'SCOPE .eng b',
    'SCOPE .eng span',
  ]) {
    consumeRule(ctx.sheet, key);
  }
  const items: BlockOf<'tiles'>['items'] = children(el).map((figure) => {
    const img = children(figure).find((c) => c.tagName === 'img');
    const b = children(figure).find((c) => c.tagName === 'b');
    const span = children(figure).find((c) => c.tagName === 'span');
    const label = b ? textOfElement(b, { unhandled: ctx.unhandled }) : undefined;
    return {
      ...(img ? { asset: imageRef(ctx, img, label) } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(span ? { sub: textOfElement(span, { unhandled: ctx.unhandled }) } : {}),
    };
  });
  return newBlock(ctx, 'tiles', path, {
    columns: columns as 4 | 5 | 6,
    aspect: '16/9',
    labelSize: 20,
    items,
  });
}

/** s38 and s65 `.dgrid`: three 425 px columns with row heights from `.r1 img`, `.r2 img` or `img`. */
function details(ctx: MapContext, el: Element, path: string): Block {
  const heights: number[] = [];
  for (const key of ['SCOPE .r1 img', 'SCOPE .r2 img', 'SCOPE .r3 img']) {
    const h = pxNumber(take(ctx.sheet, key, 'height'));
    if (h !== undefined) heights.push(h);
  }
  const single = pxNumber(take(ctx.sheet, 'SCOPE figure img', 'height'));
  if (heights.length === 0 && single !== undefined) heights.push(single);
  for (const key of ['SCOPE .dgrid', 'SCOPE figure', 'SCOPE figure img', 'SCOPE figcaption'])
    consumeRule(ctx.sheet, key);
  const items: BlockOf<'details'>['items'] = [];
  for (const figure of children(el)) {
    const img = children(figure).find((c) => c.tagName === 'img');
    const caption = children(figure).find((c) => c.tagName === 'figcaption');
    if (!img) throw new Unmapped('a detail figure without an image', figure);
    items.push({
      asset: imageRef(ctx, img),
      ...(caption ? { caption: textOfElement(caption, { unhandled: ctx.unhandled }) } : {}),
    });
  }
  return newBlock(ctx, 'details', path, {
    columns: 3,
    ...(heights.length ? { rowHeights: heights } : {}),
    items,
  });
}

function board(ctx: MapContext, el: Element, path: string): Block {
  for (const key of [
    'SCOPE .board',
    'SCOPE .board > div',
    'SCOPE .board img',
    'SCOPE .board b',
    'SCOPE .board .who b',
    'SCOPE .board .who small',
    'SCOPE .board .state',
    'SCOPE .board .state .ic',
  ]) {
    consumeRule(ctx.sheet, key);
  }
  const rowsOut: BlockOf<'board'>['rows'] = [];
  for (const row of children(el)) {
    const img = children(row).find((c) => c.tagName === 'img');
    const who = children(row).find((c) => hasClass(c, 'who'));
    const state = children(row).find((c) => hasClass(c, 'state'));
    const note = children(row)
      .filter((c) => c.tagName === 'span' && !hasClass(c, 'who'))
      .at(-1);
    if (!who || !state || !note)
      throw new Unmapped('a board row without name, state and note', row);
    const name = children(who).find((c) => c.tagName === 'b');
    const small = children(who).find((c) => c.tagName === 'small');
    const iconSvg = children(state).find((c) => c.tagName === 'svg');
    if (!iconSvg) throw new Unmapped('a board state without an icon', row);
    rowsOut.push({
      ...(img ? { asset: imageRef(ctx, img) } : {}),
      name: name ? textOfElement(name, { unhandled: ctx.unhandled }) : '',
      ...(small ? { address: collapse(textOf(small)) } : {}),
      state: iconOf(iconSvg),
      note: textOfElement(note, { unhandled: ctx.unhandled }),
    });
  }
  return newBlock(ctx, 'board', path, { columns: [128, 250, 200, 'fr'], rows: rowsOut });
}

function logoPlates(ctx: MapContext, el: Element, path: string): Block {
  for (const key of [
    'SCOPE .lineage',
    'SCOPE .lineage figure',
    'SCOPE .lineage .plate',
    'SCOPE .lineage img',
    'SCOPE .lineage svg',
    'SCOPE .lineage figcaption',
  ]) {
    consumeRule(ctx.sheet, key);
  }
  // s14:8: the row whose key is the mark takes the icon indent; the renderer derives it.
  consumeRule(ctx.sheet, 'SCOPE .rows > div > b.name-mark');
  const items: BlockOf<'logoPlates'>['items'] = children(el).map((figure) => {
    const plate = children(figure).find((c) => hasClass(c, 'plate'));
    const caption = children(figure).find((c) => c.tagName === 'figcaption');
    const img = plate ? children(plate).find((c) => c.tagName === 'img') : undefined;
    const svg = plate ? children(plate).find((c) => c.tagName === 'svg') : undefined;
    return {
      ...(img ? { asset: imageRef(ctx, img) } : {}),
      ...(svg ? { mark: true as const } : {}),
      name: caption ? textOfElement(caption, { unhandled: ctx.unhandled }) : '',
    };
  });
  return newBlock(ctx, 'logoPlates', path, { items });
}

function markSizes(ctx: MapContext, el: Element, path: string): Block {
  for (const key of [
    'SCOPE .sizes',
    'SCOPE .sizes > div',
    'SCOPE .sizes svg',
    'SCOPE .sizes .step',
  ])
    consumeRule(ctx.sheet, key);
  const sizes = children(el)
    .map((cell) => children(cell).find((c) => c.tagName === 'svg'))
    .map((svg) => (svg ? Number(attr(svg, 'width')) : Number.NaN))
    .filter((n) => !Number.isNaN(n));
  return newBlock(ctx, 'markSizes', path, { sizes });
}

/** `.key` (s66:7), `.strips` (s39:3) and a nested `.stack` (s44:12): a one-track composite. */
function columnGroup(ctx: MapContext, el: Element, path: string): Block {
  const cls = hasClass(el, 'key') ? 'key' : hasClass(el, 'strips') ? 'strips' : 'stack';
  let gap = 22;
  if (cls !== 'stack') {
    const g = pxNumber(take(ctx.sheet, `SCOPE .${cls}`, 'gap'));
    if (g !== undefined) gap = g;
    consumeRule(ctx.sheet, `SCOPE .${cls}`);
  }
  const cells = contentChildren(el).map((child, index) => ({
    blocks: mapBlocks(ctx, [child], `${path}/cells/${index}/blocks`),
  }));
  return newBlock(ctx, 'composite', path, { tracks: '1fr', gap, cells });
}

/** A classless div: a paragraph group (s14:6-10), an inline grid (s26:9), or the matrix table (s26:10). */
function plainDiv(ctx: MapContext, el: Element, path: string): Block {
  const style = parseStyle(attr(el, 'style'));
  const kids = children(el);
  if (
    kids.length > 0 &&
    kids.every((c) => c.tagName === 'span') &&
    kids.every((c) => /^\d+$/.test(collapse(textOf(c))))
  ) {
    const columns = Number(
      /repeat\((\d+)/.exec(style.get('grid-template-columns') ?? '')?.[1] ?? 4,
    );
    const values = kids.map((c) => Number(collapse(textOf(c))));
    const cells: number[][] = [];
    for (let i = 0; i < values.length; i += columns) cells.push(values.slice(i, i + columns));
    return newBlock(ctx, 'matrix', path, { cells });
  }
  if (style.get('display') === 'grid') {
    takeInline(style, 'display');
    const tracks = takeInline(style, 'grid-template-columns') ?? '1fr';
    const gapRaw = takeInline(style, 'gap');
    let gap: number | undefined;
    if (gapRaw !== undefined) {
      const single = pxNumber(gapRaw);
      if (single !== undefined) gap = single;
      else style.set('gap', gapRaw);
    }
    const cells = contentChildren(el).map((child, index) => ({
      blocks: mapBlocks(ctx, [child], `${path}/cells/${index}/blocks`),
    }));
    const block = newBlock(ctx, 'composite', path, {
      tracks,
      ...(gap !== undefined ? { gap } : {}),
      cells,
    });
    addResidualStyle(ctx, block, style);
    return block;
  }
  if (kids.length > 0 && kids.every((c) => c.tagName === 'p')) {
    const cells = kids.map((child, index) => ({
      blocks: mapBlocks(ctx, [child], `${path}/cells/${index}/blocks`),
    }));
    const block = newBlock(ctx, 'composite', path, { tracks: '1fr', gap: 0, cells });
    addResidualStyle(ctx, block, style);
    return block;
  }
  // a classless div of blocks (s83:26-40, the halves of the two grid) or a grid by its rules
  return compositeCandidate(ctx, el, path, mapNode, keepSourceClasses(ctx));
}

export { addResidualClasses, extraClasses };
