// The picture object (gslides-parity SPEC-2 2.6.4, 1.4, 0.71, 0.94, 0.105): a photograph as an
// object on a canvas slide, drawn as the picture kinds draw theirs. The block root is a `.picture`
// frame at the object's box holding `<img class="picture-img">` at object-fit cover with the
// theme's twins (`twinAttrs`), `alt` from the asset, `object-position` from `position`, and
// `data-recipe` (carrying `side`) plus `data-live` when the asset is a material, so the editor's
// MaterialMount plays the shader over it at the object's box. The picture tools of SPEC-2 2.5
// apply to the frame and the image: `trim` scales and offsets the image inside the frame so the
// trimmed region fills it (the frame carries `data-trim` for the export), `mask` clips the frame
// to a closed preset's path (`data-mask`), `adjust` writes the image's opacity and filter, `frame`
// its border and `shadow` the frame's box-shadow. A converted picture kind's photograph and the
// Background dialog's Choose image both produce this block; the chips of a picture kind are drawn
// by the slide over this object when it covers the sheet at the bottom of the stack (slide.ts).
// The image is the raster the exporter reads (kind `shot`, SPEC-2 1.5). An svg asset
// (docs/VECTOR.md 4.4, `vectorOf`) draws its vector file, which the resolver answers as the
// image's `src`, with `object-fit: contain` inline so the picture shows whole at the box's
// aspect and stays vector at every zoom; every picture gesture but crop applies unchanged.
import { vectorOf } from '@turboslide/schema/assets';
import type { BlockOf, ShotAdjust, ShotFrame, ShotTrim } from '@turboslide/schema/blocks';
import { colorCss } from '@turboslide/schema/color';
import { shapePath } from '@turboslide/schema/shapes';
import { classes, el, px, style, voidEl } from '../html.ts';
import { imageFor, raster, rootAttrs, sizeAttrs, twinAttrs } from './context.ts';
import type { BlockContext } from './context.ts';
import { ditherRender } from './dither-attrs.ts';
import { pictureRecipeAttr } from './material.ts';
import { borderStyleDeclaration, boxShadowDeclaration } from './primitives.ts';

/** The inline declarations that place a trimmed image so the kept region fills its frame (SPEC-2 2.5.1). */
export function trimDeclarations(trim: ShotTrim | undefined): string[] {
  if (trim === undefined) return [];
  const keptW = Math.max(0.01, 1 - trim.left - trim.right);
  const keptH = Math.max(0.01, 1 - trim.top - trim.bottom);
  const pct = (v: number): string => px(Math.round(v * 10000) / 100);
  return [
    `width:${pct(1 / keptW)}%`,
    `height:${pct(1 / keptH)}%`,
    `left:${pct(-trim.left / keptW)}%`,
    `top:${pct(-trim.top / keptH)}%`,
  ];
}

/** `data-trim` as the four fractions, left right top bottom. */
export function trimAttr(trim: ShotTrim | undefined): string | undefined {
  if (trim === undefined) return undefined;
  return [trim.left, trim.right, trim.top, trim.bottom].map(px).join(',');
}

/** The image's opacity and filter of the adjustments (SPEC-2 2.5.3). */
export function adjustDeclarations(adjust: ShotAdjust | undefined): string[] {
  if (adjust === undefined) return [];
  const out: string[] = [];
  if (adjust.transparency !== undefined && adjust.transparency > 0)
    out.push(`opacity:${px(1 - adjust.transparency)}`);
  const filters: string[] = [];
  if (adjust.brightness !== undefined && adjust.brightness !== 0)
    filters.push(`brightness(${px(1 + adjust.brightness)})`);
  if (adjust.contrast !== undefined && adjust.contrast !== 0)
    filters.push(`contrast(${px(1 + adjust.contrast)})`);
  if (filters.length > 0) out.push(`filter:${filters.join(' ')}`);
  return out;
}

/** The frame's border (SPEC-2 2.5.5): a hairline unless the frame says otherwise. */
export function frameDeclarations(frame: ShotFrame | undefined): string[] {
  if (frame === undefined) return [];
  const out = [`border:${px(frame.weight ?? 1)}px solid ${colorCss(frame.color ?? 'hair')}`];
  const dashed = borderStyleDeclaration(frame.dash);
  if (dashed) out.push(dashed);
  return out;
}

/** `clip-path: path(...)` of a mask preset at a box (SPEC-2 2.5.2). */
export function maskDeclaration(mask: string | undefined, w: number, h: number): string | false {
  if (mask === undefined) return false;
  return `clip-path:path('${shapePath(mask, w, h)}')`;
}

export function renderPicture(block: BlockOf<'picture'>, ctx: BlockContext): string {
  const image = imageFor(ctx, block.asset, block.id);
  const w = block.pos?.w ?? ctx.slotWidth ?? 1600;
  const h = block.pos?.h ?? ctx.slotHeight ?? Math.round((w * 9) / 16);
  const asset = ctx.asset?.(block.asset);
  const material =
    asset !== undefined && asset.source.kind === 'material' ? asset.source : undefined;
  const vector = asset !== undefined && vectorOf(asset) !== undefined;
  // the block level dither (gslides-parity SPEC-3 10.3): the root carries the field, its key and
  // the state; in state variant the image is the materialized twin, in state live the continuous
  // twin under the overlay canvas the runtime draws (a live render only, dither-attrs.ts)
  const dither = ditherRender(block, block.asset, image, w, h, ctx);
  const shown = dither?.image ?? image;
  const imgStyle = style(
    block.position !== undefined &&
      block.position !== 'center' &&
      `object-position:${block.position}`,
    vector && 'object-fit:contain',
    ...trimDeclarations(block.trim),
    ...adjustDeclarations(block.adjust),
  );
  const img = voidEl('img', {
    class: 'picture-img',
    src: shown.src,
    ...twinAttrs(shown),
    ...sizeAttrs(shown.size),
    alt: shown.alt,
    style: imgStyle,
    ...(material !== undefined
      ? {
          'data-recipe': pictureRecipeAttr(
            material,
            asset?.treatment?.kind === 'two-tone',
            block.side,
          ),
          'data-live': ctx.live === true ? '1' : undefined,
        }
      : {}),
    ...raster(ctx, block.id, 'shot', false),
  });
  const frameStyle = style(
    block.pos === undefined && `width:${px(w)}px;height:${px(h)}px`,
    ...frameDeclarations(block.frame),
    maskDeclaration(block.mask, w, h),
    boxShadowDeclaration(block.shadow),
  );
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('picture', block.trim !== undefined && 'trimmed'),
      style: frameStyle,
      'data-trim': trimAttr(block.trim),
      'data-mask': block.mask,
      ...dither?.attrs,
    }),
    img + (dither?.canvas ?? ''),
  );
}
