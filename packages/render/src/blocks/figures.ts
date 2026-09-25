// Figures and screenshots (head:88-94; report 03 sections 4.3, 5.5, 5.6): shot, pair, tiles,
// details, board, logoPlates.
import { classes, el, escapeText, px, style, voidEl } from '../html.ts';
import { renderText } from '../text.ts';
import { vectorOf } from '@turboslide/schema/assets';
import type { BlockOf } from '@turboslide/schema/blocks';
import {
  dataAttrs,
  imageFor,
  imgAttrs,
  iconSvg,
  isEmptyPicture,
  markSvg,
  raster,
  rootAttrs,
  runAttr,
} from './context.ts';
import type { BlockContext } from './context.ts';
import { ditherRender } from './dither-attrs.ts';
import { emptyPictureHtml, renderTextOrPrompt } from './prompt.ts';
import {
  adjustDeclarations,
  frameDeclarations,
  maskDeclaration,
  trimAttr,
  trimDeclarations,
} from './picture.ts';
import { boxShadowDeclaration } from './primitives.ts';

/**
 * A figure caption: the Text, the prompt "Add a caption" for an empty one with prompts on, or no
 * figcaption at all when the block has none. An empty caption without prompts draws nothing but
 * keeps its carrier so the caption stays addressable.
 */
function figcaption(
  caption: string | undefined,
  ctx: BlockContext,
  block: BlockOf<'shot'> | BlockOf<'pair'> | BlockOf<'details'>,
  path: string,
  pointer: string,
  extra: Record<string, string | undefined> = {},
): string {
  if (caption === undefined) return '';
  return el(
    'figcaption',
    { ...extra, 'data-run': runAttr(ctx, block.id, pointer) },
    renderTextOrPrompt(caption, ctx, block, path),
  );
}

/**
 * `shot`: a bordered screenshot (head:88-89) in a figure with an optional caption at 16 or 15 px
 * (s33:3-4, s38:11). `fit: 'fit'` is `.shot.fit`, `aspect` plus `crop` writes the cover crop of
 * s41:4-5 and s49:4 onto the image, `width` fixes the figure (s48:3, s66:5). `border: false` drops
 * the hairline for images that carry a plate of their own. The empty picture reference of a
 * figure layout draws the dashed plate with prompts on and nothing otherwise (SPEC 5.2).
 */
export function renderShot(block: BlockOf<'shot'>, ctx: BlockContext): string {
  // the picture tools of gslides-parity SPEC-2 2.5: a trimmed or masked picture sits in a
  // `.shot-crop` frame at the picture's aspect (the frame clips, the image is scaled inside it);
  // the frame border of 2.5.5 replaces the hairline, the adjustments are the image's opacity and
  // filter, the shadow the frame's. A shot without them renders byte for byte as before.
  const image = isEmptyPicture(block.asset) ? undefined : imageFor(ctx, block.asset, block.id);
  // the frame keeps the picture's aspect after the trim: the kept fractions of the asset's size,
  // else the block's aspect, else 16:9; the box is the slot's width at that ratio
  const size = image?.size;
  const keptW = 1 - (block.trim?.left ?? 0) - (block.trim?.right ?? 0);
  const keptH = 1 - (block.trim?.top ?? 0) - (block.trim?.bottom ?? 0);
  const w = block.width ?? ctx.slotWidth ?? 1326;
  const h = (w * (size?.[1] ?? 9) * keptH) / ((size?.[0] ?? 16) * keptW);
  // the block level dither (gslides-parity SPEC-3 10.1, 10.3): a shot takes the field as a picture
  // does; the figure root carries the attributes and the frame holds the overlay canvas
  const dither =
    image !== undefined ? ditherRender(block, block.asset, image, w, h, ctx) : undefined;
  const tooled =
    block.trim !== undefined ||
    block.mask !== undefined ||
    block.adjust !== undefined ||
    block.frame !== undefined ||
    block.shadow !== undefined ||
    dither !== undefined;
  // a trimmed, masked or dithered picture sits in the `.shot-crop` frame
  const framed = block.trim !== undefined || block.mask !== undefined || dither !== undefined;
  // a vector asset (docs/VECTOR.md 4.4, `vectorOf`) shows whole at the box's aspect: contain
  // inline, as picture.ts writes it, since the canvas rule of a shot is fill (block-css.ts)
  const shotAsset = ctx.asset?.(block.asset);
  const vector = shotAsset !== undefined && vectorOf(shotAsset) !== undefined;
  const imgStyle = style(
    block.aspect && `aspect-ratio:${block.aspect}`,
    block.aspect && 'object-fit:cover',
    block.aspect && `object-position:${block.crop ?? 'center'}`,
    vector && 'object-fit:contain',
    block.border === false && 'border:0',
    block.frame !== undefined && !framed ? frameDeclarations(block.frame).join(';') : false,
    ...adjustDeclarations(block.adjust),
    framed && `position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;border:0`,
    ...(block.trim !== undefined ? trimDeclarations(block.trim) : []),
  );
  let img: string;
  if (image === undefined) img = emptyPictureHtml(ctx, 'shot');
  else {
    const shown = dither?.image ?? image;
    img = voidEl('img', {
      class: classes('shot', block.fit === 'fit' && 'fit'),
      ...imgAttrs(shown),
      style: imgStyle,
      ...raster(ctx, block.id, 'shot', false),
    });
    if (framed) {
      const ratio =
        block.aspect !== undefined
          ? block.aspect
          : size !== undefined
            ? `${px(size[0] * keptW)} / ${px(size[1] * keptH)}`
            : `${px(16 * keptW)} / ${px(9 * keptH)}`;
      img = el(
        'div',
        {
          class: 'shot-crop',
          style: style(
            `aspect-ratio:${ratio}`,
            ...frameDeclarations(block.frame),
            block.frame === undefined && block.border !== false && 'border:1px solid var(--hair)',
            maskDeclaration(block.mask, w, h),
            boxShadowDeclaration(block.shadow),
          ),
          'data-trim': trimAttr(block.trim),
          'data-mask': block.mask,
        },
        img + (dither?.canvas ?? ''),
      );
    }
  }
  const caption = figcaption(block.caption, ctx, block, '/caption', 'caption');
  return el(
    'figure',
    rootAttrs(block, ctx, {
      className: classes(
        'shot-fig',
        block.captionSize === 15 && 'cap-15',
        block.fit === 'fit' && 'fit',
        tooled && 'tooled',
      ),
      style: style(
        block.width !== undefined && `width:${block.width}px;max-width:100%`,
        block.shadow !== undefined && !framed ? boxShadowDeclaration(block.shadow) : false,
      ),
      ...dither?.attrs,
    }),
    img + caption,
  );
}

/** `.pair`: figures side by side with captions (head:91-94); two images stack in one figure (s76). */
export function renderPair(block: BlockOf<'pair'>, ctx: BlockContext): string {
  const template =
    block.ratio && typeof block.ratio === 'object'
      ? `grid-template-columns:${block.ratio.left}fr ${block.ratio.right}fr`
      : undefined;
  const figures = block.figures
    .map((figure, index) => {
      const images = figure.assets
        .map((assetId) =>
          isEmptyPicture(assetId)
            ? emptyPictureHtml(ctx)
            : voidEl('img', {
                ...imgAttrs(imageFor(ctx, assetId, block.id)),
                ...raster(ctx, block.id, 'shot', false),
              }),
        )
        .join('');
      const caption = figcaption(
        figure.caption,
        ctx,
        block,
        `/figures/${index}/caption`,
        `figures/${index}/caption`,
      );
      return el('figure', {}, images + caption);
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'pair',
        block.gap === 40 && 'gap-40',
        block.captionSize === 15 && 'cap-15',
      ),
      style: template,
    }),
    figures,
  );
}

/**
 * `tiles`: a grid of image tiles with labels. Three forms the deck draws (report 03 section 5.6):
 * label-only tiles at 15 px (s13, s69: the reference grid and the direction grid, whose marked
 * items are the site concepts with an ink border and a 9 px square), and name-plus-sub tiles at
 * 20 px (s72, the engines). `more` is a text tile that closes the grid (s13:20).
 */
export function renderTiles(block: BlockOf<'tiles'>, ctx: BlockContext): string {
  const hasSub = block.items.some((item) => item.sub !== undefined);
  const marked = block.items.some((item) => item.marker === true);
  const items = block.items
    .map((item, index) => {
      const img = item.asset
        ? voidEl('img', {
            ...imgAttrs(imageFor(ctx, item.asset, block.id)),
            ...raster(ctx, block.id, 'shot', false),
          })
        : '';
      if (hasSub) {
        const name = item.label
          ? el(
              'b',
              { 'data-run': runAttr(ctx, block.id, `items/${index}/label`) },
              renderText(item.label, { gtWord: ctx.gtWord }),
            )
          : '';
        const sub = item.sub
          ? el(
              'span',
              { 'data-run': runAttr(ctx, block.id, `items/${index}/sub`) },
              renderText(item.sub, { gtWord: ctx.gtWord }),
            )
          : '';
        return el('figure', {}, img + name + sub);
      }
      const label = item.label
        ? el(
            'span',
            { 'data-run': runAttr(ctx, block.id, `items/${index}/label`) },
            renderText(item.label, { gtWord: ctx.gtWord }),
          )
        : '';
      return el('div', { class: classes('tile', item.marker && 'site') }, img + label);
    })
    .join('');
  const more = block.more
    ? el(
        'div',
        { class: 'tile more', 'data-run': runAttr(ctx, block.id, 'more') },
        renderText(block.more, { gtWord: ctx.gtWord }),
      )
    : '';
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'tiles',
        `cols-${block.columns}`,
        `aspect-${block.aspect.replace('/', '-')}`,
        hasSub ? 'tiles-eng' : 'tiles-thumb',
        marked && 'tiles-marked',
        block.labelSize === 20 && 'label-20',
      ),
    }),
    items + more,
  );
}

/**
 * `details`: three 425 px columns of 2x detail crops with 15 px captions (s38:6-11, s65:5-8).
 * `rowHeights` gives the image height per row; a single value applies to every row.
 */
export function renderDetails(block: BlockOf<'details'>, ctx: BlockContext): string {
  const items = block.items
    .map((item, index) => {
      const row = Math.floor(index / block.columns);
      const heights = block.rowHeights ?? [];
      const height = heights[row] ?? heights[heights.length - 1];
      const img = isEmptyPicture(item.asset)
        ? emptyPictureHtml(ctx)
        : voidEl('img', {
            ...imgAttrs(imageFor(ctx, item.asset, block.id)),
            style: height !== undefined ? `height:${height}px` : undefined,
            ...raster(ctx, block.id, 'shot', false),
          });
      const caption = figcaption(
        item.caption,
        ctx,
        block,
        `/items/${index}/caption`,
        `items/${index}/caption`,
      );
      return el('figure', {}, img + caption);
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('details', block.items.length <= block.columns && 'one-row'),
    }),
    items,
  );
}

/** `board`: the status board of s80:7-15, one ruled row per surface. */
export function renderBoard(block: BlockOf<'board'>, ctx: BlockContext): string {
  const rows = block.rows
    .map((row, index) => {
      const img = row.asset
        ? voidEl('img', {
            ...imgAttrs(imageFor(ctx, row.asset, block.id)),
            ...raster(ctx, block.id, 'shot', false),
          })
        : '<span></span>';
      const who = el(
        'span',
        { class: 'who' },
        el(
          'b',
          { 'data-run': runAttr(ctx, block.id, `rows/${index}/name`) },
          renderText(row.name, { gtWord: ctx.gtWord }),
        ) + (row.address ? `<small>${escapeText(row.address)}</small>` : ''),
      );
      const state = el(
        'b',
        { class: 'state' },
        iconSvg(row.state, ctx, block.id) + escapeText(stateLabel(row.state)),
      );
      const note = el(
        'span',
        { 'data-run': runAttr(ctx, block.id, `rows/${index}/note`) },
        renderText(row.note, { gtWord: ctx.gtWord }),
      );
      return el('div', {}, img + who + state + note);
    })
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'board' }), rows);
}

/** The state label a board icon carries; the deck writes the words beside the icon (s80:9-14). */
function stateLabel(icon: { name: string; color?: string }): string {
  if (icon.name === 'check-circle') return 'Live';
  if (icon.name === 'clock') return icon.color === 'warn' ? 'Fixes open' : 'In progress';
  if (icon.name === 'x-circle') return 'Excluded';
  return '';
}

/**
 * `logoPlates`: external logos on fixed-white plates so they never invert (s14:3-7; report 03
 * section 11 item 13). An item with `mark` draws the GT mark on the plate in fixed ink.
 */
export function renderLogoPlates(block: BlockOf<'logoPlates'>, ctx: BlockContext): string {
  const items = block.items
    .map((item, index) => {
      const inner = item.mark
        ? `<svg fill="currentColor" aria-hidden="true"${dataAttrs(raster(ctx, block.id, 'mark', true))}><use href="#gt-mark"/></svg>`
        : item.asset
          ? voidEl('img', {
              ...imgAttrs(imageFor(ctx, item.asset, block.id)),
              ...raster(ctx, block.id, 'shot', false),
            })
          : '';
      const caption = el(
        'figcaption',
        { 'data-run': runAttr(ctx, block.id, `items/${index}/name`) },
        renderText(item.name, { gtWord: ctx.gtWord }),
      );
      return el('figure', {}, `<div class="plate">${inner}</div>${caption}`);
    })
    .join('');
  return el('div', rootAttrs(block, ctx, { className: 'lineage' }), items);
}

export { markSvg };
