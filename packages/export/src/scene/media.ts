// The scene's media records (gslides-parity SPEC-5 1.4, 3.6; R05 7.1; MILESTONES-5 B2 day 5):
// `sceneMedia` reads the media blocks of a slide (composite cells included) and the deck's media
// records and answers one `SceneMedia` per block: the box the extractor measured for the block's
// poster root (the `shot` raster render/blocks/media.ts registers, else the block's `pos`), the
// stored file's absolute path under the deck folder with its facts, the raster id of the poster
// picture pptxgenjs places, the playback as stored and the YouTube id. `extractScenes` calls it
// once per scene; `ooxml/media.ts` rewrites the poster picture into the media picture from it,
// `odp/media.ts` (B4) writes `draw:plugin` and the standalone build (B1) inlines or links the
// file. A block whose record is missing travels as its poster with a warning on the scene.
import { join } from 'node:path';

import type { Block, MediaBlock, RecolorPreset, ShotReflection } from '@turboslide/schema/blocks';
import { isNativeRecolor, isYoutubeSource } from '@turboslide/schema/blocks/media';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';

import type { Box } from '@turboslide/schema/render';

import type { Scene, SceneMedia } from './types.ts';

export type SceneMediaOptions = {
  /** the deck folder, where a media asset's `file` resolves */
  deckDir?: string;
};

/** A picture object's Reflection and Recolor as the exporter reads them (SPEC-5 0.47): the rows B1's build writes native or bakes. */
export type ScenePictureEffect = {
  blockId: string;
  recolor?: RecolorPreset;
  reflection?: ShotReflection;
  /** true when the recolor travels as `a:grayscl` or `a:duotone` and the raster is shot plain */
  native: boolean;
};

/** The picture and shot blocks of a slide that carry a reflection or a recolor, composite cells walked, in document order. */
export function scenePictureEffects(slide: Slide): ScenePictureEffect[] {
  const out: ScenePictureEffect[] = [];
  const walk = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if ((block.type === 'picture' || block.type === 'shot') && block.adjust !== undefined) {
        const recolor =
          block.adjust.recolor !== undefined && block.adjust.recolor !== 'none'
            ? block.adjust.recolor
            : undefined;
        const reflection = block.adjust.reflection;
        if (recolor !== undefined || reflection !== undefined)
          out.push({
            blockId: block.id,
            ...(recolor !== undefined ? { recolor } : {}),
            ...(reflection !== undefined ? { reflection } : {}),
            native: recolor !== undefined && isNativeRecolor(recolor),
          });
      }
      if (block.type === 'composite') for (const cell of block.cells) walk(cell.blocks);
    }
  };
  walk(slideBlocks(slide).map(({ block }) => block));
  return out;
}

/** The media blocks of a slide with their composite cells walked, in document order. */
export function mediaBlocksOfSlide(slide: Slide): MediaBlock[] {
  const out: MediaBlock[] = [];
  const walk = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if (block.type === 'media') out.push(block);
      if (block.type === 'composite') for (const cell of block.cells) walk(cell.blocks);
    }
  };
  walk(slideBlocks(slide).map(({ block }) => block));
  return out;
}

export function sceneMedia(
  scene: Scene,
  slide: Slide,
  deck: Deck,
  options: SceneMediaOptions = {},
): SceneMedia[] {
  const out: SceneMedia[] = [];
  for (const block of mediaBlocksOfSlide(slide)) {
    const raster = scene.rasters.find((entry) => entry.blockId === block.id);
    const box: Box | undefined =
      raster?.box ??
      (block.pos !== undefined ? [block.pos.x, block.pos.y, block.pos.w, block.pos.h] : undefined);
    if (box === undefined) {
      scene.warnings.push(`${block.id}: media block has no box on the page; left out of the file`);
      continue;
    }
    const entry: SceneMedia = {
      blockId: block.id,
      kind: block.kind,
      box,
      playback: block.playback,
      ...(raster !== undefined ? { poster: raster.id } : {}),
    };
    if (isYoutubeSource(block.source)) {
      entry.youtube = block.source.youtube;
      out.push(entry);
      continue;
    }
    const asset = block.source.asset === '' ? undefined : deck.media?.[block.source.asset];
    if (asset === undefined) {
      if (block.source.asset !== '')
        scene.warnings.push(
          `${block.id}: media ${block.source.asset} is not in the deck; the poster alone travels`,
        );
      out.push(entry);
      continue;
    }
    entry.file = options.deckDir !== undefined ? join(options.deckDir, asset.file) : asset.file;
    entry.mime = asset.mime;
    entry.bytes = asset.bytes;
    entry.durationMs = asset.durationMs;
    out.push(entry);
  }
  return out;
}
