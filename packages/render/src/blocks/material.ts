// `material`: a shader material as a figure (SPEC 5.3: "materials mount on
// [data-type="material"][data-live]"; SPEC 5.4; MILESTONES M5 item 3). The block shows its frozen
// frame asset (the twins of a `material.capture`) in a 16:9 box the slot's width wide, with an
// optional caption at 16 or 15 px, the form of the shot figure (block-css.ts .shot-fig). The
// recipe travels on the root as `data-recipe` (materialId, preset, uniforms, anchor, twoTone,
// plate) so the editor's MaterialMount can mount the live shader over the frame without reading
// the document, and `data-live` marks the root when the render is a live one (RenderOptions.live).
// Before a capture the box is the plate ground with a 15 px titanium label naming the material.
// The frame box is the raster the exporter screenshots (kind 'material', SPEC 5.2 RasterRef).
import { classes, el, escapeText, style, voidEl } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { materialRecipeOf } from '@turboslide/schema/blocks';
import { imageFor, imgAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderTextOrPrompt } from './prompt.ts';

export function renderMaterial(block: BlockOf<'material'>, ctx: BlockContext): string {
  const recipe = materialRecipeOf(block);
  const boxStyle = style(
    block.height !== undefined && `height:${block.height}px;aspect-ratio:auto`,
  );
  let inner: string;
  if (block.asset !== undefined) {
    const image = imageFor(ctx, block.asset, block.id);
    inner = voidEl('img', { class: 'material-frame', ...imgAttrs(image) });
  } else {
    inner = `<span class="material-label">${escapeText(block.materialId)}${
      block.preset !== undefined ? ` · ${escapeText(block.preset)}` : ''
    } · not captured</span>`;
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
