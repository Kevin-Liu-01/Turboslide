// `material`: a shader material as a figure (SPEC 5.3: "materials mount on
// [data-type="material"][data-live]"; SPEC 5.4; MILESTONES M5 item 3). The block shows its frozen
// frame asset (the twins of a `material.capture`) in a 16:9 box the slot's width wide, with an
// optional caption at 16 or 15 px, the form of the shot figure (block-css.ts .shot-fig). The
// recipe travels on the root as `data-recipe` (materialId, preset, uniforms, anchor, twoTone,
// plate) so the editor's MaterialMount can mount the live shader over the frame without reading
// the document, and `data-live` marks the root when the render is a live one (RenderOptions.live).
// Before a capture the box is the plate ground and nothing else (docs/FEATURES.md 5.5; audit-
// shaders 13, 21): the label that named the material and its preset never renders on a surface a
// viewer sees, so the editor shows the live canvas over the plate until the first frame lands 800
// ms after the last change, and the filmstrip card, the show and the exports draw the frame or
// the plate with no text. The frame box is the raster the exporter screenshots (kind 'material',
// SPEC 5.2 RasterRef).
import { classes, el, style, voidEl } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { materialRecipeOf } from '@turboslide/schema/blocks';
import { imageFor, imgAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderTextOrPrompt } from './prompt.ts';

export function renderMaterial(block: BlockOf<'material'>, ctx: BlockContext): string {
  // the Speed control rides the recipe attribute (docs/FEATURES.md 5.2: "Speed sets the mount's
  // speed"), so the editor's live mount reads it without the document; the default 1 is left out
  // (the render package sits under the materials package, so the value is read off the block)
  const speed = block.controls?.speed;
  const recipe = {
    ...materialRecipeOf(block),
    ...(speed !== undefined && speed !== 1 ? { speed } : {}),
  };
  const boxStyle = style(
    block.height !== undefined && `height:${block.height}px;aspect-ratio:auto`,
  );
  let inner = '';
  if (block.asset !== undefined) {
    const image = imageFor(ctx, block.asset, block.id);
    inner = voidEl('img', { class: 'material-frame', ...imgAttrs(image) });
  }
  const box = el(
    'div',
    {
      class: 'material',
      style: boxStyle,
      role: 'img',
      'aria-label': block.alt,
      ...raster(ctx, block.id, 'material', false),
    },
    inner,
  );
  const caption = block.caption
    ? el(
        'figcaption',
        { 'data-run': runAttr(ctx, block.id, 'caption') },
        renderTextOrPrompt(block.caption, ctx, block, '/caption'),
      )
    : '';
  return el(
    'figure',
    rootAttrs(block, ctx, {
      className: classes('material-fig', block.captionSize === 15 && 'cap-15'),
      'data-recipe': JSON.stringify(recipe),
      'data-live': ctx.live ? '1' : undefined,
    }),
    box + caption,
  );
}

/** The `data-recipe` value of a material-sourced picture (slide.ts and picture.ts write it through attrs, which escapes). */
export function pictureRecipeAttr(
  source: {
    materialId: string;
    uniforms: Record<string, number | number[] | string>;
    timeMs: number;
  },
  twoTone: boolean,
  plate?: 'lower-left' | 'lower-right' | 'upper-left',
): string {
  // a Choose image picture has no plate and the shader composes for none (SPEC-2 0.105)
  return JSON.stringify({
    materialId: source.materialId,
    uniforms: source.uniforms,
    anchor: source.timeMs,
    twoTone,
    ...(plate !== undefined ? { plate } : {}),
  });
}
