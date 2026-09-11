// asset/stretched (SPEC 7.7; DECK-GRAMMAR.md:61): an image drawn at an aspect other than its
// file's, outside a declared crop. The record's `shot` rasters are the img elements of a slide in
// document order, so the i-th shot raster of a block is the block's i-th asset; the file's size is
// the asset record's `size`. A shot with `aspect` declares a cover crop and is skipped, as are the
// blocks whose CSS crops by design (tiles, details and board draw object-fit: cover).
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Block, Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { BlockIndex } from './shared.ts';
import { round2 } from './shared.ts';

type ImageRef = { assetId: string; pointer: string; border: number };

/** The image assets a block draws, in the order the renderer writes their img elements, or null when the block crops by design. */
export function imageAssets(block: Block): ImageRef[] | null {
  switch (block.type) {
    case 'shot':
      if (block.aspect) return [];
      return [{ assetId: block.asset, pointer: '/asset', border: block.border === false ? 0 : 1 }];
    case 'pair':
      return block.figures.flatMap((figure, f) =>
        figure.assets.map((assetId, a) => ({
          assetId,
          pointer: `/figures/${f}/assets/${a}`,
          border: 1,
        })),
      );
    case 'logoPlates':
      return block.items.flatMap((item, i) =>
        item.asset ? [{ assetId: item.asset, pointer: `/items/${i}/asset`, border: 0 }] : [],
      );
    case 'tiles':
    case 'details':
    case 'board':
      return null;
    default:
      return [];
  }
}

export function checkStretched(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (!slide) return out;
  for (const ref of refs.values()) {
    const images = imageAssets(ref.block);
    if (!images || images.length === 0) continue;
    const rasters = record.rasters.filter((r) => r.blockId === ref.block.id && r.kind === 'shot');
    images.forEach((image, i) => {
      const raster = rasters[i];
      const asset = ctx.asset(image.assetId);
      if (!raster || !asset) return;
      const drawnW = raster.box[2] - 2 * image.border;
      const drawnH = raster.box[3] - 2 * image.border;
      if (drawnW <= 0 || drawnH <= 0 || asset.size[0] <= 0 || asset.size[1] <= 0) return;
      const fileAspect = asset.size[0] / asset.size[1];
      const drawnAspect = drawnW / drawnH;
      const deviation = Math.abs(drawnAspect - fileAspect) / fileAspect;
      const expectedH = drawnW / fileAspect;
      if (
        deviation <= RENDERED_LIMITS.stretchedFraction ||
        Math.abs(drawnH - expectedH) <= RENDERED_LIMITS.stretchedMinPx
      )
        return;
      out.push(
        ctx.finding('asset/stretched', slide.id, {
          blockId: ref.block.id,
          path: `${ref.path}${image.pointer}`,
          theme: record.theme,
          box: raster.box,
          text: image.assetId,
          measured: {
            drawnAspect: round2(drawnAspect),
            fileAspect: round2(fileAspect),
            deviation: round2(deviation * 100),
          },
          proposal: `${image.assetId} is drawn at ${drawnW} by ${drawnH} (${round2(drawnAspect)}) but the file is ${asset.size[0]} by ${asset.size[1]} (${round2(fileAspect)}); let the height follow the width, or declare an aspect crop (DECK-GRAMMAR.md:61).`,
        }),
      );
    });
  }
  return out;
}
