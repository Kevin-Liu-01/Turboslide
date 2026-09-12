// renderSlide: one string function that emits the deck's own markup for one slide (SPEC 5.2).
import { markSvg, twinAttrs } from './blocks/context.ts';
import type { BlockContext, RasterRef, ResolvedImage } from './blocks/context.ts';
import { isTextLike, renderBlock, renderBlocks, wantsShotWrap } from './blocks/render-block.ts';
import { pictureRecipeAttr } from './blocks/material.ts';
import { measureStyle } from './blocks/text-blocks.ts';
import { colsTemplate, colsWidths, COLS_GAP, CONTENT, slotBoxes } from './geometry.ts';
import { attrs, classes, el, escapeAttr, px, style } from './html.ts';
import { renderText } from './text.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck, Layout, Plate, Slide, SlotName } from '@turboslide/schema/deck';
import { insideContent, sortByZ } from '@turboslide/schema/freeform';
import type { Box, Theme } from '@turboslide/schema/render';
import { importResidual } from '@turboslide/schema/ext';

export type RenderOptions = {
  theme: Theme;
  /** Emit the chips of a full-picture slide (what the deck scopes with `#stage >`, s01:6). */
  chrome: boolean;
  counter?: string;
  /** Prefix for asset twin paths; ignored when `assetSrc` is given. */
  assetBase: string;
  /** Resolves an asset twin to a URL (data URIs in the standalone build). */
  assetSrc?: (assetId: AssetId, theme: Theme, path: string) => string;
  blockAttrs: boolean;
  gtWord: boolean;
  live?: boolean;
  /** Write the `is-on` class so the slide is visible on its own (default true). */
  active?: boolean;
};

export type RenderedSlide = {
  html: string;
  slots: Record<string, Box>;
  rasters: RasterRef[];
  warnings: string[];
};

/** The slides of a deck as a map, from any order of slide files. */
export function slideMap(slides: Slide[]): Map<SlideId, Slide> {
  return new Map(slides.map((slide) => [slide.id, slide]));
}

/** Slide numbers follow `deck.json` `sections[].slideIds` flattened, `n = index + 1` (SPEC 4.2). */
export function slideOrder(deck: Deck): SlideId[] {
  return deck.sections.flatMap((section) => section.slideIds);
}

/**
 * The one slide title (SPEC 4.2; tail:90-94) lives in the document library with the other
 * derived facts and is re-exported here so the studio reads it from the module it renders with.
 */
export { slideTitle } from '@turboslide/schema/deck';

function imageResolver(
  deck: Deck,
  options: RenderOptions,
): (id: AssetId) => ResolvedImage | undefined {
  return (id) => {
    const asset = deck.assets[id];
    if (!asset) return undefined;
    const url = (path: string, theme: Theme): string =>
      options.assetSrc ? options.assetSrc(id, theme, path) : `${options.assetBase}${path}`;
    if ('neutral' in asset.twins) {
      return { src: url(asset.twins.neutral, options.theme), alt: asset.alt, size: asset.size };
    }
    const light = url(asset.twins.light, 'light');
    const dark = url(asset.twins.dark, 'dark');
    return {
      src: options.theme === 'dark' ? dark : light,
      light,
      dark,
      alt: asset.alt,
      size: asset.size,
    };
  };
}

export function renderSlide(deck: Deck, slide: Slide, options: RenderOptions): RenderedSlide {
  const ctx: BlockContext = {
    slideId: slide.id,
    theme: options.theme,
    blockAttrs: options.blockAttrs,
    gtWord: options.gtWord,
    image: imageResolver(deck, options),
    assetUrl: (path) =>
      options.assetSrc ? options.assetSrc('', options.theme, path) : `${options.assetBase}${path}`,
    ...(options.live === true ? { live: true } : {}),
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
  const residual = importResidual(slide.ext);
  const scopeClass = residual?.css ? `ts-x-${slide.id}` : undefined;
  const scopedCss = residual?.css
    ? `<style>${rewriteSlideScope(residual.css, `.ts-x-${slide.id}`)}</style>`
    : '';
  // The residual rules are written against `.ts-x-<slideId>`; rewriteSlideScope prefixes `.ts-sheet`
  // so they keep the cascade weight they had in the deck, where the theme's rules had one class less.
  const common = {
    'data-slide': slide.id,
    'data-kind': slide.kind,
  };
  const active = options.active !== false ? 'is-on' : undefined;
  let html: string;
  let slots: Record<string, Box> = {};
  switch (slide.kind) {
    case 'opener':
    case 'mood':
    case 'closing': {
      const image = ctx.image(slide.picture.asset);
      if (!image)
        ctx.warnings.push(`${slide.id}: picture asset ${slide.picture.asset} is not in the deck`);
      const imgClass = slide.kind === 'mood' ? 'mood-img' : 'opener-img';
      const kindClass =
        slide.kind === 'mood'
          ? 'mood s-mood'
          : slide.kind === 'closing'
            ? 'opener s-opener s-closing'
            : 'opener s-opener';
      // a material-sourced picture carries its recipe so the editor's MaterialMount can play the
      // shader live over the frozen frame (SPEC 5.3, 5.4; M5)
      const pictureAsset = deck.assets[slide.picture.asset];
      const recipe =
        pictureAsset !== undefined && pictureAsset.source.kind === 'material'
          ? attrs({
              'data-recipe': pictureRecipeAttr(
                pictureAsset.source,
                pictureAsset.treatment?.kind === 'two-tone',
                slide.plate.side,
              ),
              'data-live': options.live === true ? '1' : undefined,
            })
          : '';
      const img = image
        ? `<img class="${imgClass}" src="${escapeAttr(image.src)}"${attrs(twinAttrs(image))}${recipe} alt="${escapeAttr(image.alt)}"${
            slide.picture.position && slide.picture.position !== 'center'
              ? ` style="object-position:${slide.picture.position}"`
              : ''
          }>`
        : '';
      const mark =
        slide.kind === 'closing' && slide.mark
          ? `<svg class="mark" aria-hidden="true"><use href="#gt-mark"/></svg>`
          : '';
      const plate = renderPlate(slide.plate, ctx, mark);
      const chips = options.chrome ? '<div class="ts-chips" aria-hidden="true"></div>' : '';
      html = el(
        'section',
        { class: classes('slide', kindClass, scopeClass, active), ...common },
        scopedCss + img + el('div', { class: 'in' }, plate) + chips,
      );
      slots = { plate: plateBox(slide.plate) };
      break;
    }
    case 'title': {
      // The title slide (s02:3-7): the mark, h1 44 px below it, the lead 26 px below that.
      const mark = markSvg(ctx, 'mark', slide.mark.w, slide.mark.h);
      const h1 = el(
        'h1',
        {
          style: 'margin-top:44px',
          ...(ctx.blockAttrs
            ? { 'data-block': 'heading', 'data-type': 'heading', 'data-run': 'heading/text' }
            : {}),
        },
        renderText(slide.heading, { gtWord: ctx.gtWord }),
      );
      const lead = el(
        'p',
        {
          class: 'lead muted max-p',
          style: 'margin-top:26px',
          ...(ctx.blockAttrs
            ? { 'data-block': 'lead', 'data-type': 'paragraph', 'data-run': 'lead/text' }
            : {}),
        },
        renderText(slide.lead, { gtWord: ctx.gtWord }),
      );
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss +
          el(
            'div',
            { class: 'in' },
            el('div', { class: 'left-mid', 'data-slot': 'main' }, mark + h1 + lead),
          ),
      );
      slots = slotBoxesAsRecord({ type: 'left-mid' });
      break;
    }
    case 'statement': {
      const measure = measureStyle(slide.measure);
      const big = el(
        'div',
        {
          class: classes('big', measure.className),
          style: measure.style,
          ...(ctx.blockAttrs
            ? { 'data-block': 'big', 'data-type': 'heading', 'data-run': 'big/text' }
            : {}),
        },
        renderText(slide.big, { gtWord: ctx.gtWord }),
      );
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss +
          el('div', { class: 'in' }, el('div', { class: 'center', 'data-slot': 'main' }, big)),
      );
      slots = slotBoxesAsRecord({ type: 'center' });
      break;
    }
    case 'content': {
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss + el('div', { class: 'in' }, renderLayout(slide, ctx)),
      );
      slots = slotBoxesAsRecord(slide.layout);
      break;
    }
  }
  return { html, slots, rasters: ctx.rasters, warnings: ctx.warnings };
}

function slotBoxesAsRecord(layout: Layout): Record<string, Box> {
  const out: Record<string, Box> = {};
  for (const [name, box] of Object.entries(slotBoxes(layout))) out[name] = box;
  return out;
}

/** The plate rectangle in sheet pixels, at its max width; the height is unknown until measured. */
function plateBox(plate: Plate): Box {
  const [x, y, w, h] = [137, 129, 1326, 642];
  if (plate.side === 'lower-right') return [x + w - plate.maxWidth, y, plate.maxWidth, h];
  return [x, y, plate.maxWidth, h];
}

function renderPlate(plate: Plate, ctx: BlockContext, before: string): string {
  const cls = plate.side === 'lower-right' ? 'mood-plate' : 'opener-plate';
  const maxWidth =
    (plate.side === 'lower-left' && plate.maxWidth !== 740) ||
    (plate.side === 'lower-right' && plate.maxWidth !== 560) ||
    (plate.side === 'upper-left' && plate.maxWidth !== 720)
      ? `max-width:${plate.maxWidth}px`
      : undefined;
  return el(
    'div',
    { class: cls, style: maxWidth, 'data-slot': 'plate' },
    before + renderBlocks(plate.blocks, ctx),
  );
}

function renderLayout(slide: ContentSlide, ctx: BlockContext): string {
  const layout = slide.layout;
  const slot = (name: SlotName): Block[] => slide.slots[name] ?? [];
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [leftW, rightW] = colsWidths(layout.ratio, gap);
      const template = colsTemplate(layout.ratio);
      const hasPre = [...slot('left'), ...slot('right')].some(
        (block) => block.type === 'panel' && block.pre === true,
      );
      const templateStyle =
        template.template ??
        (hasPre && layout.ratio === '5/7' ? 'minmax(0, 5fr) minmax(0, 7fr)' : undefined);
      return el(
        'div',
        {
          class: classes('cols', template.className),
          style: style(
            templateStyle && `grid-template-columns:${templateStyle}`,
            gap !== COLS_GAP && `gap:${gap}px`,
            layout.align === 'start' && 'align-items:start',
          ),
        },
        renderColumn('left', slot('left'), { ...ctx, slotWidth: leftW }) +
          renderColumn('right', slot('right'), { ...ctx, slotWidth: rightW }),
      );
    }
    case 'split': {
      const head = layout.head ?? 'single';
      let headHtml: string;
      if (head === 'single') {
        headHtml = el(
          'div',
          { class: 'head', 'data-slot': 'head' },
          renderBlocks(slot('head'), { ...ctx, slotWidth: 1326 }),
        );
      } else {
        const [leftW, rightW] = colsWidths(head.cols);
        headHtml = el(
          'div',
          {
            class: classes(
              'head',
              'head-cols',
              head.cols === '4/8' ? 'head-4-8' : 'head-5-7',
              head.align === 'baseline' && 'head-baseline',
            ),
            'data-slot': 'head',
          },
          renderBlocks(slot('headLeft'), { ...ctx, slotWidth: leftW }) +
            renderBlocks(slot('headRight'), { ...ctx, slotWidth: rightW }),
        );
      }
      const align = layout.body?.align;
      const bodyHtml = el(
        'div',
        {
          class: classes('body', align === 'end' && 'end', align === 'start' && 'start'),
          'data-slot': 'body',
        },
        renderBlocks(slot('body'), { ...ctx, slotWidth: 1326 }),
      );
      return el(
        'div',
        {
          class: 'split',
          style: layout.gap !== undefined && layout.gap !== 56 ? `gap:${layout.gap}px` : undefined,
        },
        headHtml + bodyHtml,
      );
    }
    case 'center':
      return el(
        'div',
        { class: 'center', 'data-slot': 'main' },
        renderBlocks(slot('main'), { ...ctx, slotWidth: 1326 }),
      );
    case 'left-mid':
      return el(
        'div',
        { class: 'left-mid', 'data-slot': 'main' },
        renderBlocks(slot('main'), { ...ctx, slotWidth: 1326 }),
      );
    case 'stack':
      return el(
        'div',
        {
          class: 'stack',
          'data-slot': 'main',
          style: layout.gap !== undefined ? `gap:${layout.gap}px` : undefined,
        },
        renderBlocks(slot('main'), { ...ctx, slotWidth: 1326 }),
      );
    case 'freeform':
      return renderFreeform(slot('main'), ctx);
  }
}

/**
 * The freeform layout (docs/freeform.md): every block sits in a `.free` wrapper at its position
 * box, in paint order (z, then document order). A box inside the content box lives in the
 * `.freeform` layer over `.in`, offset by the content origin, so the slot geometry still holds; a
 * box that reaches past the content box lives in the `.freeform-sheet` layer, which is the whole
 * sheet placed at the sheet origin (the slide box is inset 57 px with 80 by 72 padding, head:257),
 * so its coordinates are sheet coordinates as written. The block renders with the box's width and
 * height as its slot.
 */
function renderFreeform(blocks: Block[], ctx: BlockContext): string {
  const inside: string[] = [];
  const outside: string[] = [];
  const [contentX, contentY] = CONTENT;
  sortByZ(blocks).forEach((block, order) => {
    const pos = block.pos ?? { x: contentX, y: contentY, w: 1326, h: 642 };
    const inContent = insideContent(pos);
    const inline = style(
      `left:${px(inContent ? pos.x - contentX : pos.x)}px`,
      `top:${px(inContent ? pos.y - contentY : pos.y)}px`,
      `width:${px(pos.w)}px`,
      `height:${px(pos.h)}px`,
      `z-index:${order + 1}`,
    );
    const html = el(
      'div',
      { class: 'free', 'data-free': block.id, style: inline },
      renderBlock(block, { ...ctx, slotWidth: pos.w, slotHeight: pos.h }),
    );
    (inContent ? inside : outside).push(html);
  });
  // the sheet layer sits at the sheet origin: .in starts at the content origin, which is the
  // slide inset plus the padding (INSET + PAD, geometry.ts CONTENT)
  const sheetLayer =
    outside.length > 0
      ? el(
          'div',
          { class: 'freeform-sheet', style: `left:${-contentX}px;top:${-contentY}px` },
          outside.join(''),
        )
      : '';
  return el('div', { class: 'freeform', 'data-slot': 'main' }, inside.join('')) + sheetLayer;
}

/**
 * A column of a `cols` layout: one figure-like block stands alone (in a `.shot-wrap` for a shot or a
 * mark, s15:3, s33:9); text or several blocks sit in the deck's `.stack` (head:86).
 */
function renderColumn(name: 'left' | 'right', blocks: Block[], ctx: BlockContext): string {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only && !isTextLike(only)) {
    if (wantsShotWrap(only)) {
      return el('div', { class: 'shot-wrap', 'data-slot': name }, renderBlock(only, ctx));
    }
    return renderBlock(only, ctx).replace(/^<(\w+)/, `<$1 data-slot="${name}"`);
  }
  const hasPre = blocks.some((block) => block.type === 'panel' && block.pre === true);
  return el(
    'div',
    { class: classes('stack', hasPre && 'has-pre'), 'data-slot': name },
    renderBlocks(blocks, ctx),
  );
}

/**
 * Residual slide CSS from the import is written against `.ts-x-<slideId>`; this guards against a
 * rule that escaped the scope by prefixing anything that does not start with it.
 */
export function rewriteSlideScope(css: string, scope: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((rule) => {
      const at = rule.indexOf('{');
      if (at < 0) return rule.trim() ? `${rule}}` : '';
      const selector = rule.slice(0, at).trim();
      const body = rule.slice(at + 1);
      if (!selector) return '';
      const scoped = selector
        .split(',')
        .map((part) => {
          const p = part.trim();
          if (p.startsWith('@')) return p;
          const withScope = p.startsWith(scope) ? p : `${scope} ${p}`;
          return withScope.startsWith('.ts-sheet ') ? withScope : `.ts-sheet ${withScope}`;
        })
        .join(', ');
      return `${scoped} {${body}}`;
    })
    .filter(Boolean)
    .join('\n');
}
