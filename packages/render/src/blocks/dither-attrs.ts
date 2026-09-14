// The DOM of a dithered picture (gslides-parity SPEC-3 10.3; research-3 06 section 4.4): the block
// root carries `data-dither` (the field as stored), `data-dither-key` (dither-key.ts) and
// `data-dither-state`. In state `variant` the asset record lists a materialized file for the key
// and the image points at it, so the standalone build, the CLI render, the PDF page and the Perfect
// raster need no script. In state `live` the image stays the continuous twin and, in a live render
// only (RenderOptions.live), a `<canvas class="picture-dither">` sits over it at the screen size
// for the runtime to draw (dither-runtime.ts, day three); the overlay is absolute inside the box,
// so a toggle or a state change moves nothing (SPEC-3 9.2, 06 6.5).
import type { Asset } from '@turboslide/schema/assets';
import type { AssetId } from '@turboslide/schema/ids';
import {
  ditherKey,
  ditherScreen,
  ditherSourceOf,
  readDither,
  resolveDither,
  variantFor,
} from '../dither-key.ts';
import type { AssetVariantLike, PictureDitherLike } from '../dither-key.ts';
import type { BlockContext, ResolvedImage } from './context.ts';

export type DitherState = 'variant' | 'live';

export type DitherRender = {
  dither: PictureDitherLike;
  key: string;
  state: DitherState;
  /** The attributes of the block root: the field, its key, the state and the continuous source's URL. */
  attrs: {
    'data-dither': string;
    'data-dither-key': string;
    'data-dither-state': DitherState;
    'data-dither-source': string;
  };
  /** The image to show: the variant's twins in state `variant`, the continuous twin otherwise. */
  image: ResolvedImage;
  /** The screen size in cells (`w / cell` by `h / cell`). */
  screen: [number, number];
  /** The overlay canvas markup, empty unless the state is `live` in a live render. */
  canvas: string;
};

/**
 * Reads the block's `dither` and resolves its state against the asset record. Undefined when the
 * block has no dither or the context has no asset record for it (a bare block context).
 */
export function ditherRender(
  block: object,
  assetId: AssetId,
  image: ResolvedImage,
  w: number,
  h: number,
  ctx: BlockContext,
): DitherRender | undefined {
  const dither = readDither(block);
  if (dither === undefined) return undefined;
  const asset = ctx.asset?.(assetId);
  if (asset === undefined) return undefined;
  const resolved = resolveDither(dither);
  const screen = ditherScreen(w, h, resolved.cell);
  const source = ditherSourceOf(asset);
  const key = ditherKey({ source, dither, screen });
  const variant = variantFor(asset, key);
  const state: DitherState = variant !== undefined ? 'variant' : 'live';
  const shown = variant !== undefined ? variantImage(ctx, asset, variant, image) : image;
  const canvas =
    state === 'live' && ctx.live === true
      ? `<canvas class="picture-dither" width="${screen[0]}" height="${screen[1]}" hidden aria-hidden="true"></canvas>`
      : '';
  return {
    dither,
    key,
    state,
    attrs: {
      'data-dither': JSON.stringify(dither),
      'data-dither-key': key,
      'data-dither-state': state,
      // the runtime reads the continuous source from here (dither-runtime.ts), since the image
      // shows the variant in state variant and a two tone asset's twins are not its source
      'data-dither-source': ctx.assetUrl(source),
    },
    image: shown,
    screen,
    canvas,
  };
}

/** The variant's twins as URLs, through the deck's resolver when the context has one. */
function variantImage(
  ctx: BlockContext,
  asset: Asset,
  variant: AssetVariantLike,
  image: ResolvedImage,
): ResolvedImage {
  if (ctx.twins !== undefined) return ctx.twins(asset.id, variant.twins, image.alt, variant.size);
  if ('neutral' in variant.twins)
    return { src: ctx.assetUrl(variant.twins.neutral), alt: image.alt, size: variant.size };
  const light = ctx.assetUrl(variant.twins.light);
  const dark = ctx.assetUrl(variant.twins.dark);
  return {
    src: ctx.theme === 'dark' ? dark : light,
    light,
    dark,
    alt: image.alt,
    size: variant.size,
  };
}
