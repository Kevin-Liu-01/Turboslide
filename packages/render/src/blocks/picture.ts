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
// The image is the raster the exporter reads (kind `shot`, SPEC-2 1.5).
import type {
  BlockOf,
  RecolorPreset,
  ShotAdjust,
  ShotFrame,
  ShotReflection,
  ShotTrim,
} from '@turboslide/schema/blocks';
import {
  NATIVE_RECOLOR_PRESETS,
  duotoneColors,
  isNativeRecolor,
  twinSrcset,
} from '@turboslide/schema/blocks/media';
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

// ---------------------------------------------------------------------------------------------
// Reflection and Recolor (gslides-parity SPEC-5 0.47, 11; SPEC-2 12; B2 day 6). The reflection is
// a second copy of the image below the box, mirrored, under a gradient mask, sized by Google's
// three sliders (transparency, distance in sheet px, size as the fraction of the height shown);
// the root lifts its clip downward with `clip-path: inset(0 0 -<reach>px 0)` so the box still
// clips a trimmed image at its edges while the reflection shows beneath. The recolor is one SVG
// filter per block, `feColorMatrix` for Grayscale, Sepia and Negative and, for the duotones, a
// saturate stage composed arithmetically with two floods painted from the theme's colours (the
// sheet's custom properties, so the dark appearance recolours with its own ink and paper). The
// root carries `data-recolor` and `data-reflection` for the exporter: `a:grayscl` and `a:duotone`
// are native in the Editable text file (pptx/images.ts), everything else is baked into the shot
// raster with a residual line, and a sheet under `data-native-blips` (the extractor's shoot of the
// native presets) drops the filter so the raster is the plain picture.

/** The native presets and the duotone colours are the schema's (`@turboslide/schema/blocks/media`), re-exported for the renderer's readers. */
export { NATIVE_RECOLOR_PRESETS, duotoneColors, isNativeRecolor };

/** The filter's element id: one per block per slide, so a document holding several slides keeps them apart. */
export function recolorFilterId(slideId: string, blockId: string): string {
  return `ts-recolor-${slideId}-${blockId}`.replace(/[^A-Za-z0-9_-]/g, '-');
}

const SEPIA_MATRIX =
  '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0';
const NEGATIVE_MATRIX = '-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0';

/**
 * The `<svg>` holding the block's recolor filter (zero sized, inside the root), or an empty string
 * for `none`. The duotone: the luminance of the picture (`saturate 0`), the highlight flood times
 * the luminance plus the shadow flood times its inverse, cut to the picture's own alpha.
 */
export function recolorFilterSvg(preset: RecolorPreset | undefined, id: string): string {
  if (preset === undefined || preset === 'none') return '';
  let body: string;
  if (preset === 'grayscale') body = '<feColorMatrix type="saturate" values="0"/>';
  else if (preset === 'sepia') body = `<feColorMatrix type="matrix" values="${SEPIA_MATRIX}"/>`;
  else if (preset === 'negative')
    body = `<feColorMatrix type="matrix" values="${NEGATIVE_MATRIX}"/>`;
  else {
    const colors = duotoneColors(preset);
    if (colors === null) return '';
    body =
      '<feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray"/>' +
      '<feComponentTransfer in="gray" result="inverse"><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>' +
      `<feFlood style="flood-color:${colorCss(colors.highlight)}" result="light"/>` +
      `<feFlood style="flood-color:${colorCss(colors.shadow)}" result="dark"/>` +
      '<feComposite in="light" in2="gray" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>' +
      '<feComposite in="dark" in2="inverse" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="shaded"/>' +
      '<feComposite in="lit" in2="shaded" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="toned"/>' +
      '<feComposite in="toned" in2="SourceGraphic" operator="in"/>';
  }
  return `<svg class="picture-recolor" width="0" height="0" aria-hidden="true" focusable="false"><filter id="${id}" color-interpolation-filters="sRGB">${body}</filter></svg>`;
}

/** `filter:url(#id)` for a recolored picture, false for none. */
export function recolorDeclaration(preset: RecolorPreset | undefined, id: string): string | false {
  if (preset === undefined || preset === 'none') return false;
  return `filter:url(#${id})`;
}

/** How far below the box the reflection reaches, in sheet px: the distance plus the shown fraction of the height. */
export function reflectionReach(reflection: ShotReflection, h: number): number {
  return Math.round(reflection.distance + reflection.size * h);
}

/** `data-reflection` as transparency, distance, size. */
export function reflectionAttr(reflection: ShotReflection | undefined): string | undefined {
  if (reflection === undefined) return undefined;
  return [reflection.transparency, reflection.distance, reflection.size].map(px).join(',');
}

/**
 * The mirrored copy under the gradient mask (SPEC-5 0.47): a wrapper `size` of the box high at
 * `distance` below it, holding the whole image flipped so the picture's bottom edge meets the
 * wrapper's top, at `1 - transparency` opacity; the recolor filter follows the image into it.
 */
export function renderReflection(
  reflection: ShotReflection | undefined,
  image: { src: string; alt: string },
  filter: string | false,
  extra: Record<string, string | undefined> = {},
): string {
  if (reflection === undefined || reflection.size <= 0 || image.src === '') return '';
  const shown = Math.max(0.01, Math.min(1, reflection.size));
  const wrapperStyle = style(
    `top:calc(100% + ${px(reflection.distance)}px)`,
    `height:${px(shown * 100)}%`,
    `opacity:${px(Math.max(0, Math.min(1, 1 - reflection.transparency)))}`,
  );
  const imgStyle = style(`height:${px(100 / shown)}%`, filter);
  return el(
    'div',
    { class: 'picture-reflection', 'aria-hidden': 'true', style: wrapperStyle },
    voidEl('img', { src: image.src, alt: '', style: imgStyle, ...extra }),
  );
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
  const w = block.pos?.w ?? ctx.slotWidth ?? ctx.page?.width ?? 1600;
  const h = block.pos?.h ?? ctx.slotHeight ?? Math.round((w * 9) / 16);
  const asset = ctx.asset?.(block.asset);
  const material =
    asset !== undefined && asset.source.kind === 'material' ? asset.source : undefined;
  // the block level dither (gslides-parity SPEC-3 10.3): the root carries the field, its key and
  // the state; in state variant the image is the materialized twin, in state live the continuous
  // twin under the overlay canvas the runtime draws (a live render only, dither-attrs.ts)
  const dither = ditherRender(block, block.asset, image, w, h, ctx);
  const shown = dither?.image ?? image;
  const recolor = block.adjust?.recolor;
  const filterId = recolorFilterId(ctx.slideId, block.id);
  const recolorCss = recolorDeclaration(recolor, filterId);
  const reflection = block.adjust?.reflection;
  const imgStyle = style(
    block.position !== undefined &&
      block.position !== 'center' &&
      `object-position:${block.position}`,
    ...trimDeclarations(block.trim),
    ...adjustDeclarations(block.adjust),
    recolorCss,
  );
  // the 320 px twin variant (SPEC-5 11): `srcset` beside the stored twin when the record carries
  // it, so a filmstrip clone (LiveClone sets `sizes` from its width) fetches the small file
  const srcset =
    asset !== undefined && dither === undefined
      ? twinSrcset(asset, ctx.theme, shown.src, ctx.assetUrl)
      : undefined;
  const img = voidEl('img', {
    class: 'picture-img',
    src: shown.src,
    ...(srcset !== undefined ? { srcset } : {}),
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
  // the reflection lifts the box's clip downward by its reach; a mask keeps its own path and
  // clips the reflection with it (the mask's `clip-path` wins as the later declaration)
  const reach = reflection === undefined ? 0 : reflectionReach(reflection, h);
  const frameStyle = style(
    block.pos === undefined && `width:${px(w)}px;height:${px(h)}px`,
    ...frameDeclarations(block.frame),
    reach > 0 && `clip-path:inset(0 0 ${px(-reach)}px 0)`,
    maskDeclaration(block.mask, w, h),
    boxShadowDeclaration(block.shadow),
  );
  const reflected = renderReflection(reflection, shown, recolorCss, twinAttrs(shown));
  const nativeRecolor = recolor !== undefined && recolor !== 'none' && isNativeRecolor(recolor);
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'picture',
        block.trim !== undefined && 'trimmed',
        reflected !== '' && 'has-reflection',
        recolorCss !== false && 'has-recolor',
      ),
      style: frameStyle,
      'data-trim': trimAttr(block.trim),
      'data-mask': block.mask,
      'data-recolor': recolor !== undefined && recolor !== 'none' ? recolor : undefined,
      'data-recolor-native': nativeRecolor ? '1' : undefined,
      'data-reflection': reflectionAttr(reflection),
      ...dither?.attrs,
    }),
    img + (dither?.canvas ?? '') + reflected + recolorFilterSvg(recolor, filterId),
  );
}

/**
 * The stylesheet of the two effects, appended to `BLOCK_CSS` (block-css.ts, by request to B4 under
 * the sweep rule): the reflection wrapper below the box under its gradient mask, the flipped
 * image inside it, the zero sized filter host, and the export rule that drops a native preset's
 * filter while the extractor shoots the plain raster (`data-native-blips` on the sheet root).
 */
export const PICTURE_EFFECTS_CSS = `
/* ---- reflection and recolor (gslides-parity SPEC-5 0.47; B2): the mirrored copy and the filter host ---- */
.ts-sheet .picture.has-reflection { overflow: visible; }
.ts-sheet .picture > .picture-reflection { position: absolute; left: 0; width: 100%; overflow: hidden; pointer-events: none; -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0)); mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0)); }
.ts-sheet .picture > .picture-reflection > img { position: absolute; left: 0; top: 0; width: 100%; object-fit: cover; display: block; transform: scaleY(-1); }
.ts-sheet .picture > svg.picture-recolor { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: hidden; pointer-events: none; }
.ts-sheet[data-native-blips] .picture[data-recolor-native] > img.picture-img { filter: none; }
`;
