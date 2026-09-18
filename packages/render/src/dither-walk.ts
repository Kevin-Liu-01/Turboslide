// The dithered pictures of a document (gslides-parity SPEC-3 10.4): what `picture.materialize`
// (packages/materials) and the exporter's materialization pass (packages/export) both walk, so the
// two derive one key per block and write one record shape. Split out of dither-key.ts in the
// round four fixer round (SPEC-4 3.12, VERIFICATION-4 finding 2): this half reads a whole document
// and so imports the schema's runtime values (`canvasObjects`, `slideBlocks`, the sheet size,
// the canvas group), and `schema/deck` reaches `blocks.ts`, `shapes.ts` and the shape table,
// which the bundler cannot drop. dither-key.ts keeps the pure key half the live renderer needs
// (`readDither`, `resolveDither`, `ditherKey`, the variant names), so the root route's graph
// (`__root.tsx` and `router.tsx` through `@turboslide/viewer/dither` and
// `@turboslide/render/runtime`) no longer carries the schema package and zod in the entry chunk.
// Node and the server paths import this module; nothing in the browser's root graph does.
import type { Asset } from '@turboslide/schema/assets';
import { hasContinuousSource } from '@turboslide/schema/assets';
import type { Block, PictureBlock, ShotBlock } from '@turboslide/schema/blocks';
import { DITHER_NO_SOURCE_MESSAGE } from '@turboslide/schema/blocks/dither-values';
import { CANVAS_GROUP } from '@turboslide/schema/canvas';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { canvasObjects, slideBlocks, slideOrder } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import type { PictureDitherLike } from './dither-key.ts';
import {
  ditherKey,
  ditherScreen,
  ditherSourceOf,
  readDither,
  resolveDither,
} from './dither-key.ts';

/** A dithered picture or shot on a slide with everything its variant is derived from. */
export type DitheredPicture = {
  slideId: string;
  block: PictureBlock | ShotBlock;
  asset: Asset;
  dither: PictureDitherLike;
  /** The box in sheet pixels the renderer's key uses (blocks/picture.ts, blocks/figures.ts). */
  box: [number, number];
  key: string;
  /** The continuous source's relative path (ditherSourceOf). */
  source: string;
  /** The union box of the slide's plate group, when one sits over the picture. */
  plate?: Box;
};

/**
 * The box of a dithered block as the renderer sizes it: the object's box, else the sheet for a
 * picture, else the content width at the asset's trimmed ratio for a flow shot (a shot in a
 * narrower slot renders at the slot's width and stays in state `live`, which the export residual
 * names).
 */
export function boxOfDithered(block: PictureBlock | ShotBlock, asset: Asset): [number, number] {
  if (block.pos !== undefined) return [block.pos.w, block.pos.h];
  if (block.type === 'picture') return [SHEET_WIDTH, SHEET_HEIGHT];
  const keptW = 1 - (block.trim?.left ?? 0) - (block.trim?.right ?? 0);
  const keptH = 1 - (block.trim?.top ?? 0) - (block.trim?.bottom ?? 0);
  const w = block.width ?? 1326;
  const h = (w * asset.size[1] * keptH) / (asset.size[0] * keptW);
  return [w, h];
}

/** The union of the slide's `plate` group boxes (canvas.ts CANVAS_GROUP) the plate clearance is measured against. */
export function plateBoxOf(slide: Slide): Box | undefined {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const block of canvasObjects(slide)) {
    if (block.pos === undefined || block.pos.group !== CANVAS_GROUP) continue;
    x0 = Math.min(x0, block.pos.x);
    y0 = Math.min(y0, block.pos.y);
    x1 = Math.max(x1, block.pos.x + block.pos.w);
    y1 = Math.max(y1, block.pos.y + block.pos.h);
  }
  if (!Number.isFinite(x0)) return undefined;
  return [x0, y0, x1 - x0, y1 - y0];
}

/** True for a picture or shot that carries the field. */
export function isDitheredBlock(block: Block): block is PictureBlock | ShotBlock {
  return (block.type === 'picture' || block.type === 'shot') && readDither(block) !== undefined;
}

/**
 * Every dithered picture of the named slides (all when absent), with its key and source. A
 * dither over an asset without a continuous source is refused with the sentence of SPEC-3 10.1.
 */
export function ditheredPictures(
  document: DeckDocument,
  slideIds?: 'all' | readonly string[],
  blockIds?: readonly string[],
): DitheredPicture[] {
  const ids = slideIds === undefined || slideIds === 'all' ? slideOrder(document.deck) : slideIds;
  const out: DitheredPicture[] = [];
  for (const slideId of ids) {
    const slide = document.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
    const plate = plateBoxOf(slide);
    for (const { block } of slideBlocks(slide)) {
      if (!isDitheredBlock(block)) continue;
      if (blockIds !== undefined && !blockIds.includes(block.id)) continue;
      const asset = document.deck.assets[block.asset];
      if (asset === undefined) continue;
      if (!hasContinuousSource(asset))
        throw new TypeError(
          `Block "${block.id}" dithers asset "${asset.id}": ${DITHER_NO_SOURCE_MESSAGE}`,
        );
      const dither = readDither(block) as PictureDitherLike;
      const box = boxOfDithered(block, asset);
      const resolved = resolveDither(dither);
      const source = ditherSourceOf(asset);
      const key = ditherKey({
        source,
        dither,
        screen: ditherScreen(box[0], box[1], resolved.cell),
      });
      out.push({
        slideId,
        block,
        asset,
        dither,
        box,
        key,
        source,
        ...(plate !== undefined ? { plate } : {}),
      });
    }
  }
  return out;
}
