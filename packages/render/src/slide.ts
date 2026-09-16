// renderSlide: one string function that emits the deck's own markup for one slide (SPEC 5.2).
import { markSvg, sizeAttrs, twinAttrs } from './blocks/context.ts';
import type { BlockContext, HtmlFrameSource, RasterRef, ResolvedImage } from './blocks/context.ts';
import { isTextLike, renderBlock, renderBlocks, wantsShotWrap } from './blocks/render-block.ts';
import { pictureRecipeAttr } from './blocks/material.ts';
import { measureStyle } from './blocks/text-blocks.ts';
import { colsTemplate, COLS_GAP, geometry } from './geometry.ts';
import type { Geometry } from './geometry.ts';
import { attrs, classes, el, escapeAttr, px, style } from './html.ts';
import { colorCss } from '@turboslide/schema/color';
import { renderMultiline, renderTextOrPrompt } from './blocks/prompt.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { AssetTwins } from '@turboslide/schema/assets';
import type { Block, BlockOf } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck, Layout, Plate, Slide, SlotName } from '@turboslide/schema/deck';
import { insideContent, sortByZ } from '@turboslide/schema/freeform';
import { isLayoutId } from '@turboslide/schema/layouts';
import type { Position } from '@turboslide/schema/position';
import { normalizeRotation } from '@turboslide/schema/position';
import type { Box, Page, Theme } from '@turboslide/schema/render';
import { DEFAULT_PAGE, coversPage, deckPage } from '@turboslide/schema/render';
import { importResidual } from '@turboslide/schema/ext';
import { slideHasMotion } from '@turboslide/schema/motion';

export type RenderOptions = {
  theme: Theme;
  /** Emit the chips of a full-picture slide (what the deck scopes with `#stage >`, s01:6). */
  chrome: boolean;
  /**
   * The counter text of this slide (`03 / 85`), written as `data-counter` on the slide root so the
   * runtimes show it (runtime.ts); an empty string means the counter is hidden on this slide
   * (`defaults.counter` off, or skip-title on a title slide, gslides-parity SPEC 7.2.4); absent
   * leaves the runtime's own count.
   */
  counter?: string;
  /** Prefix for asset twin paths; ignored when `assetSrc` is given. */
  assetBase: string;
  /** Resolves an asset twin to a URL (data URIs in the standalone build). */
  assetSrc?: (assetId: AssetId, theme: Theme, path: string) => string;
  /**
   * Resolves a media file's path (`assets/talk.0123abcd.mp4`) to the URL the show mounts
   * (gslides-parity SPEC-5 3.3; VERIFICATION-5 finding 12): the deck's asset base when absent,
   * which the assets route serves with Range requests on a checkout and hosted. The standalone
   * build rewrites the URL the renderer wrote (`standaloneMediaSources`), so it needs no resolver.
   */
  mediaSrc?: (path: string) => string;
  blockAttrs: boolean;
  /**
   * A render for a show (gslides-parity SPEC-5 0.5; B1's request R1): every top level block root
   * carries `data-block` whether or not `blockAttrs` is set, so the present layer and the
   * standalone motion script address the blocks the schedule names.
   */
  motion?: boolean;
  gtWord: boolean;
  live?: boolean;
  /**
   * Draw the prompt of an empty Text and the dashed plate of an empty picture (gslides-parity
   * SPEC 5.4); implied by `live`. The layout grid's tiles set it on a thumbnail.
   */
  prompts?: boolean;
  /** Write the `is-on` class so the slide is visible on its own (default true). */
  active?: boolean;
  /**
   * The sandboxed frame document of an `html` block (gslides-parity SPEC-3 8.4), built by the
   * frame module from the sanitized markup; absent, the block renders as the scoped escape.
   */
  htmlFrame?: (block: BlockOf<'html'>) => HtmlFrameSource | undefined;
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

/**
 * A twin record as URLs for the rendered theme: `src` is the twin of the theme, the other twin
 * travels as `data-light` or `data-dark` (twinAttrs), and the stored size gives the image its
 * `width` and `height` (sizeAttrs). One resolver serves an asset's own twins and the materialized
 * dither variants it lists (SPEC-3 10.3).
 */
function twinResolver(
  options: RenderOptions,
): (id: AssetId, twins: AssetTwins, alt: string, size: [number, number]) => ResolvedImage {
  return (id, twins, alt, size) => {
    const url = (path: string, theme: Theme): string =>
      options.assetSrc ? options.assetSrc(id, theme, path) : `${options.assetBase}${path}`;
    if ('neutral' in twins) return { src: url(twins.neutral, options.theme), alt, size };
    const light = url(twins.light, 'light');
    const dark = url(twins.dark, 'dark');
    return { src: options.theme === 'dark' ? dark : light, light, dark, alt, size };
  };
}

function imageResolver(
  deck: Deck,
  options: RenderOptions,
): (id: AssetId) => ResolvedImage | undefined {
  const twins = twinResolver(options);
  return (id) => {
    const asset = deck.assets[id];
    if (!asset) return undefined;
    return twins(id, asset.twins, asset.alt, asset.size);
  };
}

/**
 * The stored size of the file at a twin path, over every asset's twins and the variants it lists
 * (their own sizes), for the `<img>` rewrite of an escape block (blocks/img-size.ts).
 */
function assetSizeResolver(deck: Deck): (path: string) => [number, number] | undefined {
  let sizes: Map<string, [number, number]> | undefined;
  const put = (
    into: Map<string, [number, number]>,
    twins: AssetTwins,
    size: [number, number],
  ): void => {
    if ('neutral' in twins) into.set(twins.neutral, size);
    else {
      into.set(twins.light, size);
      into.set(twins.dark, size);
    }
  };
  return (path) => {
    if (sizes === undefined) {
      sizes = new Map();
      for (const asset of Object.values(deck.assets)) {
        put(sizes, asset.twins, asset.size);
        const variants = (asset as { variants?: unknown }).variants;
        if (variants !== null && typeof variants === 'object')
          for (const variant of Object.values(variants as Record<string, unknown>)) {
            const record = variant as { twins?: AssetTwins; size?: [number, number] };
            if (record.twins !== undefined && record.size !== undefined)
              put(sizes, record.twins, record.size);
          }
      }
    }
    return sizes.get(path);
  };
}

export function renderSlide(deck: Deck, slide: Slide, options: RenderOptions): RenderedSlide {
  // the deck's page (gslides-parity SPEC-5 6.1): the slot boxes, the plate box and the freeform
  // layer derive from it; the GT sheet for a deck without one
  const geo = geometry(deckPage(deck));
  const ctx: BlockContext = {
    slideId: slide.id,
    theme: options.theme,
    page: geo.sheet,
    blockAttrs: options.blockAttrs,
    ...(options.motion === true ? { motion: true } : {}),
    gtWord: options.gtWord,
    image: imageResolver(deck, options),
    assetUrl: (path) =>
      options.assetSrc ? options.assetSrc('', options.theme, path) : `${options.assetBase}${path}`,
    asset: (id) => deck.assets[id],
    // the media records for the poster roots' `data-src`, title and duration (SPEC-5 3.5; the
    // round five fix round: no caller passed the resolver, so every stored clip rendered with an
    // empty `data-src` and the show's controller mounted nothing, VERIFICATION-5 finding 12)
    media: (id) => deck.media?.[id],
    ...(options.mediaSrc !== undefined ? { mediaUrl: options.mediaSrc } : {}),
    assetSize: assetSizeResolver(deck),
    twins: twinResolver(options),
    ...(options.htmlFrame !== undefined ? { htmlFrame: options.htmlFrame } : {}),
    ...(options.chrome ? { chrome: true } : {}),
    ...(options.live === true ? { live: true } : {}),
    ...(options.prompts === true ? { prompts: true } : {}),
    slide: {
      kind: slide.kind,
      // a custom layout's id (gslides-parity SPEC-5 9.2) is not a built in layout the prompts read
      ...(slide.template !== undefined && isLayoutId(slide.template)
        ? { template: slide.template }
        : {}),
    },
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
  // `data-motion="1"` when the slide carries a transition or an animation (SPEC-5 0.3: the one
  // thing renderSlide reads `animations` for), independent of the options, so the filmstrip glyph
  // and the export report read it; `data-block` on the pseudo blocks below follows `blockAttrs`
  // or `motion` like every block root (0.5; B1's request R1)
  const blockIds = options.blockAttrs || options.motion === true;
  const common = {
    'data-slide': slide.id,
    'data-kind': slide.kind,
    'data-counter': options.counter,
    'data-motion': slideHasMotion(slide) ? '1' : undefined,
  };
  const active = options.active !== false ? 'is-on' : undefined;
  const pictureKind = slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing';
  const background = slide.background ?? (pictureKind ? undefined : deck.defaults?.background);
  // the background colour layer (SPEC-2 2.6.1, 2.6.2): a `.slide-bg` under `.in` at the sheet
  // box, drawn only when set so every other slide's markup is unchanged; the deck default is not
  // drawn on an unconverted picture kind, whose photograph is the ground (0.108)
  const bg =
    background !== undefined
      ? `<div class="slide-bg" style="background:${escapeAttr(colorCss(background.color))}"></div>`
      : '';
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
      // the stored size as width and height, so the box is reserved before the file decodes and the
      // theme swap moves nothing (SPEC-3 9.2 E12)
      const img = image
        ? `<img class="${imgClass}" src="${escapeAttr(image.src)}"${attrs(twinAttrs(image))}${attrs(sizeAttrs(image.size))}${recipe} alt="${escapeAttr(image.alt)}"${
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
        scopedCss + img + bg + el('div', { class: 'in' }, plate) + chips,
      );
      slots = { plate: plateBox(slide.plate, geo) };
      break;
    }
    case 'title': {
      // The title slide (s02:3-7): the mark, h1 44 px below it, the lead 26 px below that.
      const mark = markSvg(ctx, 'mark', slide.mark.w, slide.mark.h);
      const h1 = el(
        'h1',
        {
          style: 'margin-top:44px',
          ...(blockIds ? { 'data-block': 'heading' } : {}),
          ...(ctx.blockAttrs ? { 'data-type': 'heading', 'data-run': 'heading/text' } : {}),
        },
        renderTextOrPrompt(slide.heading, ctx, undefined, '/heading'),
      );
      const lead = el(
        'p',
        {
          class: 'lead muted max-p',
          style: 'margin-top:26px',
          ...(blockIds ? { 'data-block': 'lead' } : {}),
          ...(ctx.blockAttrs ? { 'data-type': 'paragraph', 'data-run': 'lead/text' } : {}),
        },
        /* the lead takes paragraph breaks (hotfix-4 cause W4): renderMultiline writes one .para
           span per paragraph, and a one paragraph lead renders byte for byte as renderText did */
        renderMultiline(slide.lead, ctx, undefined, '/lead'),
      );
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss +
          bg +
          el(
            'div',
            { class: 'in' },
            el('div', { class: 'left-mid', 'data-slot': 'main' }, mark + h1 + lead),
          ),
      );
      slots = slotBoxesAsRecord({ type: 'left-mid' }, geo);
      break;
    }
    case 'statement': {
      const measure = measureStyle(slide.measure);
      const big = el(
        'div',
        {
          class: classes('big', measure.className),
          style: measure.style,
          ...(blockIds ? { 'data-block': 'big' } : {}),
          ...(ctx.blockAttrs ? { 'data-type': 'heading', 'data-run': 'big/text' } : {}),
        },
        renderTextOrPrompt(slide.big, ctx, undefined, '/big'),
      );
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss +
          bg +
          el('div', { class: 'in' }, el('div', { class: 'center', 'data-slot': 'main' }, big)),
      );
      slots = slotBoxesAsRecord({ type: 'center' }, geo);
      break;
    }
    case 'content': {
      html = el(
        'section',
        { class: classes('slide', scopeClass, active), ...common },
        scopedCss + bg + el('div', { class: 'in' }, renderLayout(slide, ctx, geo)),
      );
      slots = slotBoxesAsRecord(slide.layout, geo);
      break;
    }
  }
  return { html, slots, rasters: ctx.rasters, warnings: ctx.warnings };
}

function slotBoxesAsRecord(layout: Layout, geo: Geometry): Record<string, Box> {
  const out: Record<string, Box> = {};
  for (const [name, box] of Object.entries(geo.slotBoxes(layout))) out[name] = box;
  return out;
}

/** The plate rectangle in sheet pixels, at its max width in the page's content box; the height is unknown until measured. */
function plateBox(plate: Plate, geo: Geometry): Box {
  const [x, y, w, h] = geo.content;
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

function renderLayout(slide: ContentSlide, ctx: BlockContext, geo: Geometry): string {
  const layout = slide.layout;
  const slot = (name: SlotName): Block[] => slide.slots[name] ?? [];
  const contentWidth = geo.content[2];
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [leftW, rightW] = geo.colsWidths(layout.ratio, gap);
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
          renderBlocks(slot('head'), { ...ctx, slotWidth: contentWidth }),
        );
      } else {
        const [leftW, rightW] = geo.colsWidths(head.cols);
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
        renderBlocks(slot('body'), { ...ctx, slotWidth: contentWidth }),
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
        renderBlocks(slot('main'), { ...ctx, slotWidth: contentWidth }),
      );
    case 'left-mid':
      return el(
        'div',
        { class: 'left-mid', 'data-slot': 'main' },
        renderBlocks(slot('main'), { ...ctx, slotWidth: contentWidth }),
      );
    case 'stack':
      return el(
        'div',
        {
          class: 'stack',
          'data-slot': 'main',
          style: layout.gap !== undefined ? `gap:${layout.gap}px` : undefined,
        },
        renderBlocks(slot('main'), { ...ctx, slotWidth: contentWidth }),
      );
    case 'freeform':
      return renderFreeform(slot('main'), ctx, geo);
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
function renderFreeform(blocks: Block[], ctx: BlockContext, geo: Geometry): string {
  const inside: string[] = [];
  const outside: string[] = [];
  const [contentX, contentY, contentW, contentH] = geo.content;
  const ordered = sortByZ(blocks);
  ordered.forEach((block, order) => {
    const pos = block.pos ?? { x: contentX, y: contentY, w: contentW, h: contentH };
    const inContent = insideContent(pos, geo.sheet);
    const inline = style(
      `left:${px(inContent ? pos.x - contentX : pos.x)}px`,
      `top:${px(inContent ? pos.y - contentY : pos.y)}px`,
      `width:${px(pos.w)}px`,
      `height:${px(pos.h)}px`,
      `z-index:${order + 1}`,
      freeTransform(pos),
    );
    // the two paper chips of a picture kind (OPENERS.md:47) inside the wrapper of a picture
    // object that covers the sheet at the bottom of the stack, after the image, so they cover
    // the photograph and nothing else (SPEC-2 1.4, 0.75, 0.98)
    const chips =
      ctx.chrome === true && order === 0 && block.type === 'picture' && coversSheet(pos, geo.sheet)
        ? '<div class="ts-chips" aria-hidden="true"></div>'
        : '';
    const html = el(
      'div',
      {
        class: 'free',
        'data-free': block.id,
        style: inline,
        ...freeDataAttrs(pos),
        'aria-label': block.alt,
      },
      renderBlock(block, { ...ctx, slotWidth: pos.w, slotHeight: pos.h }) + chips,
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
 * The rotation and flip of an object (SPEC-2 2.1.1, 2.1.2): `rotate(<deg>)` then the mirror,
 * about the box centre; nothing for an object with neither, so a round one freeform slide keeps
 * its markup. The class `.ts-measure` on the sheet root drops the transform for the exporter's
 * measurement pass (1.5).
 */
export function freeTransform(pos: Position): string | false {
  const angle = normalizeRotation(pos.rotate ?? 0);
  const parts: string[] = [];
  if (angle !== 0) parts.push(`rotate(${px(angle)}deg)`);
  if (pos.flip === 'h') parts.push('scale(-1, 1)');
  else if (pos.flip === 'v') parts.push('scale(1, -1)');
  else if (pos.flip === 'hv') parts.push('scale(-1, -1)');
  return parts.length > 0 && `transform:${parts.join(' ')}`;
}

/** The data attributes of a positioned object the overlay and the exporter read (SPEC-2 1.4). */
export function freeDataAttrs(pos: Position): Record<string, string | undefined> {
  const angle = normalizeRotation(pos.rotate ?? 0);
  return {
    'data-rotate': angle !== 0 ? px(angle) : undefined,
    'data-flip': pos.flip,
    'data-group': pos.group,
  };
}

/** True when a box covers the whole page (the picture object of a converted picture kind, SPEC-2 1.4); the GT sheet when no page is given. */
export function coversSheet(
  pos: Position,
  page: Pick<Page, 'width' | 'height'> = DEFAULT_PAGE,
): boolean {
  return coversPage(pos, page);
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
