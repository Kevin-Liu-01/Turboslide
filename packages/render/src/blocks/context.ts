// The per-slide context every block renderer receives, and the attribute helpers that make block
// roots addressable (SPEC 5.2: data-block, data-type, data-run, data-raster).
import { classes, escapeAttr, style } from '../html.ts';
import type { AssetId, BlockId, SlideId } from '@turboslide/schema/ids';
import type { Asset, AssetTwins, MediaAsset } from '@turboslide/schema/assets';
import type { Block, BlockOf, Icon } from '@turboslide/schema/blocks';
import { EMPTY_ASSET_REF } from '@turboslide/schema/blocks';
import type { LayoutId, SlideKind } from '@turboslide/schema/deck';
import type { RasterKind, Theme } from '@turboslide/schema/render';
import { importResidual } from '@turboslide/schema/ext';

export type RasterRef = { blockId: BlockId; kind: RasterKind; selector: string; alpha: boolean };

export type ResolvedImage = {
  /** The src for the requested theme. */
  src: string;
  /** Both twins when the asset has them, so a runtime can swap live. */
  light?: string;
  dark?: string;
  alt: string;
  size?: [number, number];
};

/**
 * What the frame module hands the renderer for an `html` block (SPEC-3 8.4): the frame document
 * (the sanitized markup, the theme CSS the block needs and the frame's CSP as `srcdoc`), the
 * accessible title, and the height in sheet pixels when the block sits in a flow layout.
 */
export type HtmlFrameSource = {
  srcdoc: string;
  title?: string;
  height?: number;
};

export type BlockContext = {
  slideId: SlideId;
  theme: Theme;
  blockAttrs: boolean;
  /**
   * A render for a show (RenderOptions.motion, gslides-parity SPEC-5 0.5; B1's request R1): every
   * top level block root carries `data-block` so the present layer and the standalone motion
   * script address it, with or without the other block attributes.
   */
  motion?: boolean;
  gtWord: boolean;
  /** The deck's page in sheet pixels (gslides-parity SPEC-5 6.1); a block without a slot reads its fallback width from it; 1600 by 900 when absent. */
  page?: { width: number; height: number };
  /** Resolves an asset to image URLs; undefined when the deck has no such asset. */
  image: (assetId: AssetId) => ResolvedImage | undefined;
  /** Resolves an asset file path (`assets/x-light.jpg`) to a URL, for escape markup. */
  assetUrl: (path: string) => string;
  /**
   * The asset record itself, for a block whose rendering reads the source (a picture object over
   * a material asset carries the recipe, gslides-parity SPEC-2 2.6.4); undefined when the
   * context has no deck.
   */
  asset?: (assetId: AssetId) => Asset | undefined;
  /**
   * The stored media record of an id (gslides-parity SPEC-5 0.16, 3.5; B2): `deck.media[id]`,
   * read by the media block's poster root for `data-src`, the title and the duration; undefined
   * when the context has no deck or the id names nothing. Set by `renderSlide` beside `asset`.
   */
  media?: (assetId: AssetId) => MediaAsset | undefined;
  /**
   * A media file's path (`assets/talk.0123abcd.mp4`) as the URL the show mounts (SPEC-5 3.3):
   * the asset base on a checkout, the Blob URL hosted; `assetUrl` when absent.
   */
  mediaUrl?: (path: string) => string;
  /** Emit the chips of a picture kind or a covering picture object (RenderOptions.chrome). */
  chrome?: boolean;
  /** The width in sheet pixels available to the block, when the layout knows it. */
  slotWidth?: number;
  /** The height of the block's box on a freeform slide (docs/freeform.md); unknown in a flow layout. */
  slotHeight?: number;
  /** A live render (RenderOptions.live): material roots carry data-live for the editor's mount. */
  live?: boolean;
  /**
   * Draw the prompt of an empty Text and the dashed plate of an empty picture (gslides-parity
   * SPEC 5.4): the editor stage and the layout grid's tiles; implied by `live`. Every other
   * surface draws nothing for an empty Text.
   */
  prompts?: boolean;
  /** The slide the block sits on, for the prompt wording (promptFor) and the slide link forms. */
  slide?: { kind: SlideKind; template?: LayoutId | undefined };
  /**
   * The stored size of the asset file at a twin path (`assets/x-light.jpg`), for the `width` and
   * `height` an escape block's `<img>` gains (gslides-parity SPEC-3 9.2 E12); undefined when the
   * context has no deck.
   */
  assetSize?: (path: string) => [number, number] | undefined;
  /**
   * A twin record as URLs, the way `image` resolves an asset's own twins, for the materialized
   * dither variants an asset lists (SPEC-3 10.3, 10.4); undefined when the context has no deck.
   */
  twins?: (
    assetId: AssetId,
    twins: AssetTwins,
    alt: string,
    size: [number, number],
  ) => ResolvedImage;
  /**
   * The sandboxed frame document of an `html` block (SPEC-3 8.4), from the frame module; absent,
   * the block renders as the scoped escape markup (html-escape.ts).
   */
  htmlFrame?: (block: BlockOf<'html'>) => HtmlFrameSource | undefined;
  rasters: RasterRef[];
  warnings: string[];
  /** Counter for unique raster ids within the slide. */
  rasterCount: number;
};

/**
 * Attributes shared by every block root: `data-block` under `blockAttrs` or `motion` (SPEC-5 0.5:
 * one id, four spellings; the show addresses a block by it), `data-type` under `blockAttrs` alone.
 */
export function rootAttrs(
  block: Block,
  ctx: BlockContext,
  extra: { className?: string; style?: string; [name: string]: string | undefined } = {},
): Record<string, string | undefined> {
  const residual = importResidual(block.ext);
  const { className, style: inline, ...rest } = extra;
  return {
    class: classes(className, ...(residual?.classes ?? [])),
    style: style(inline, residual?.style),
    ...(ctx.blockAttrs || ctx.motion === true ? { 'data-block': block.id } : {}),
    ...(ctx.blockAttrs ? { 'data-type': block.type } : {}),
    ...rest,
  };
}

/** `data-run` names the Text a text node renders: `<blockId>/<json pointer>` (SPEC 5.2). */
export function runAttr(ctx: BlockContext, blockId: BlockId, pointer: string): string | undefined {
  return ctx.blockAttrs ? `${blockId}/${pointer}` : undefined;
}

/**
 * Registers a raster and returns the attributes that mark its element. The selector addresses the
 * element through a unique `data-rid`, which the exporter screenshots.
 */
export function raster(
  ctx: BlockContext,
  blockId: BlockId,
  kind: RasterKind,
  alpha: boolean,
): { 'data-raster': string; 'data-rid': string } | Record<string, never> {
  ctx.rasterCount += 1;
  const rid = `${blockId}:${ctx.rasterCount}`;
  ctx.rasters.push({
    blockId,
    kind,
    selector: `[data-slide="${escapeAttr(ctx.slideId)}"] [data-rid="${rid}"]`,
    alpha,
  });
  return ctx.blockAttrs ? { 'data-raster': kind, 'data-rid': rid } : {};
}

/** Serializes a data attribute record onto an opening tag. */
export function dataAttrs(record: Record<string, string> | Record<string, never>): string {
  let out = '';
  for (const [name, value] of Object.entries(record)) out += ` ${name}="${escapeAttr(value)}"`;
  return out;
}

/**
 * A Heroicons 20 solid glyph from the sprite, written the way the deck writes it (DECK-GRAMMAR.md:40):
 * `<svg class="ic ok" aria-hidden="true"><use href="#i-check-circle"/></svg>`.
 */
export function iconSvg(
  icon: Icon,
  ctx: BlockContext,
  blockId: BlockId,
  extraClass?: string,
): string {
  const cls = classes('ic', icon.color, extraClass);
  return `<svg class="${cls}" aria-hidden="true"${dataAttrs(raster(ctx, blockId, 'icon', true))}><use href="#i-${escapeAttr(icon.name)}"/></svg>`;
}

/**
 * The standalone GT mark at a pixel size (s02:4, s15:4, s85:18). With `sized` false the svg
 * writes no size of its own and carries the class `mark-block`: a mark object of the canvas (a
 * block with `pos`) fills its box through block-css.ts, so a resize handle scales the glyph with
 * the box (build-4/hotfix-4.md cause W2, the rule of hotfix-3 causes R4 and R5 for the icon and
 * the diagram). The class, not `data-type`, keys the rule: a surface rendered without block
 * attributes (the deck build, the present surface the PDF gate shoots, a flatten sheet) writes no
 * `data-type`, and an unsized svg no rule reaches draws at the browser's 300 by 150 default
 * (hotfix-4 section 3, the ship step).
 */
export function markSvg(
  ctx: BlockContext,
  blockId: BlockId,
  w: number,
  h: number,
  attributes: Record<string, string> = {},
  sized = true,
): string {
  let out = sized
    ? `<svg width="${w}" height="${h}" fill="currentColor"`
    : '<svg fill="currentColor"';
  const extra = sized
    ? attributes
    : { ...attributes, class: classes(attributes['class'], 'mark-block') ?? 'mark-block' };
  for (const [name, value] of Object.entries(extra)) out += ` ${name}="${escapeAttr(value)}"`;
  if (!('aria-label' in attributes)) out += ' aria-hidden="true"';
  out += dataAttrs(raster(ctx, blockId, 'mark', true));
  return `${out}><use href="#gt-mark"/></svg>`;
}

/** True for the empty picture reference a figure layout inserts (gslides-parity SPEC 5.2). */
export function isEmptyPicture(assetId: AssetId): boolean {
  return assetId === EMPTY_ASSET_REF;
}

/**
 * Paths of the image twins for the theme, or a warning and an empty src. The empty picture
 * reference of a figure layout is not a missing asset: it draws the dashed plate (prompt.ts) and
 * warns nothing.
 */
export function imageFor(ctx: BlockContext, assetId: AssetId, blockId: BlockId): ResolvedImage {
  const found = ctx.image(assetId);
  if (found) return found;
  if (!isEmptyPicture(assetId))
    ctx.warnings.push(`${ctx.slideId}#${blockId}: asset ${assetId} is not in the deck`);
  return { src: '', alt: '' };
}

/**
 * `src` plus the twin attributes an image carries so the viewer runtime can swap themes. `src` is
 * the twin of the rendered theme; the other twin is written as `data-light` or `data-dark`, and
 * the runtimes (render/runtime.ts, viewer/standalone/runtime.ts, viewer/theme.ts) select
 * `img[data-light], img[data-dark]` and take the missing twin from `src` (tail:223-225 did this
 * for the light twin). Writing a twin twice cost 6.9 MiB of the standalone build's 16 MB budget
 * (SPEC 5.2 renderStandalone).
 */
export function imgAttrs(image: ResolvedImage): Record<string, string | undefined> {
  return {
    src: image.src,
    ...twinAttrs(image),
    ...sizeAttrs(image.size),
    alt: image.alt,
  };
}

/**
 * `width` and `height` from the asset's stored size, so the box is reserved before the file
 * decodes and a theme swap of the twins moves nothing (gslides-parity SPEC-3 9.2 E12, G3, P5, R2;
 * research-3 05 rule 2). Nothing when the size is unknown; the sheet rules that fix one dimension
 * leave the other `auto` so the attribute ratio holds.
 */
export function sizeAttrs(size: [number, number] | undefined): { width?: string; height?: string } {
  if (size === undefined) return {};
  return { width: String(size[0]), height: String(size[1]) };
}

/** The twin attributes alone: each twin only when it differs from `src`. */
export function twinAttrs(image: ResolvedImage): { 'data-light'?: string; 'data-dark'?: string } {
  return {
    ...(image.light !== undefined && image.light !== image.src
      ? { 'data-light': image.light }
      : {}),
    ...(image.dark !== undefined && image.dark !== image.src ? { 'data-dark': image.dark } : {}),
  };
}
