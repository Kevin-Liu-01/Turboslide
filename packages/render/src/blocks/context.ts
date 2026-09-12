// The per-slide context every block renderer receives, and the attribute helpers that make block
// roots addressable (SPEC 5.2: data-block, data-type, data-run, data-raster).
import { classes, escapeAttr, style } from '../html.ts';
import type { AssetId, BlockId, SlideId } from '@turboslide/schema/ids';
import type { Block, Icon } from '@turboslide/schema/blocks';
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

export type BlockContext = {
  slideId: SlideId;
  theme: Theme;
  blockAttrs: boolean;
  gtWord: boolean;
  /** Resolves an asset to image URLs; undefined when the deck has no such asset. */
  image: (assetId: AssetId) => ResolvedImage | undefined;
  /** Resolves an asset file path (`assets/x-light.jpg`) to a URL, for escape markup. */
  assetUrl: (path: string) => string;
  /** The width in sheet pixels available to the block, when the layout knows it. */
  slotWidth?: number;
  /** The height of the block's box on a freeform slide (docs/freeform.md); unknown in a flow layout. */
  slotHeight?: number;
  /** A live render (RenderOptions.live): material roots carry data-live for the editor's mount. */
  live?: boolean;
  rasters: RasterRef[];
  warnings: string[];
  /** Counter for unique raster ids within the slide. */
  rasterCount: number;
};

/** Attributes shared by every block root. */
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
    ...(ctx.blockAttrs ? { 'data-block': block.id, 'data-type': block.type } : {}),
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

/** The standalone GT mark at a pixel size (s02:4, s15:4, s85:18). */
export function markSvg(
  ctx: BlockContext,
  blockId: BlockId,
  w: number,
  h: number,
  attributes: Record<string, string> = {},
): string {
  let out = `<svg width="${w}" height="${h}" fill="currentColor"`;
  for (const [name, value] of Object.entries(attributes)) out += ` ${name}="${escapeAttr(value)}"`;
  if (!('aria-label' in attributes)) out += ' aria-hidden="true"';
  out += dataAttrs(raster(ctx, blockId, 'mark', true));
  return `${out}><use href="#gt-mark"/></svg>`;
}

/** Paths of the image twins for the theme, or a warning and an empty src. */
export function imageFor(ctx: BlockContext, assetId: AssetId, blockId: BlockId): ResolvedImage {
  const found = ctx.image(assetId);
  if (found) return found;
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
    alt: image.alt,
  };
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
