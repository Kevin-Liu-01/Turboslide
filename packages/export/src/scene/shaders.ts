// The shaders of a slide as the exporters read them (docs/FEATURES.md 5.5, the exporters;
// audit-shaders 9): each material block with its recipe, the frame asset the block names, the
// frame file under the deck's `assets/` and whether the frame is missing or stale by the reading
// this package can make without the materials package (a frame captured before the features round
// carries no `frameKey` and is stale by that absence; the key comparison over the deck's palette is
// the studio's, server/shader-frames.ts, which waits for the frame before the export starts). The
// PDF, the JPEG, the PNG and both PowerPoints draw the frame at the block's box: the print and
// render documents draw it through the renderer's `<img>`, and the PowerPoint builder places the
// frame file itself (the long side 3200) over the box as `ts:<slide>#<block>` with the recipe in
// `descr`. Schema imports alone, so the builder and the report read these without the extractor's
// browser graph; the box is the extractor's measurement (extract.ts).
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { MaterialBlock, MaterialRecipe } from '@turboslide/schema/blocks/material';
import { materialRecipeOf } from '@turboslide/schema/blocks/material';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';

import type { Scene } from './types.ts';

export type SceneShader = {
  blockId: string;
  /** The block's recipe (materialId, preset, uniforms, anchor, twoTone, plate), the `descr` of the placed picture. */
  recipe: MaterialRecipe;
  /** The block's alt text. */
  alt: string;
  /** The frame asset the block names, when the deck holds a material frame under that id. */
  assetId?: string;
  /** The frame file's absolute path, when the deck's folder holds it. */
  file?: string;
  /** The frame's pixels as the record states them. */
  size?: [number, number];
  /** True when the block names no frame, the deck lacks the record, or the file is not on disk. */
  missing: boolean;
  /** True when the frame carries no `frameKey` (captured before the features round). */
  stale: boolean;
  /** The frame's box in sheet px (the `.material` element), measured by the extractor. */
  box?: Box;
};

/** A scene with its shaders; `Scene` itself stays the measured record (types.ts). */
export type ShaderScene = Scene & { shaders?: SceneShader[] };

/** The shaders a scene carries; none on a scene measured without them. */
export function shadersOf(scene: Scene): ReadonlyArray<SceneShader> {
  const shaders = (scene as ShaderScene).shaders;
  return shaders ?? [];
}

/** Every material block of a slide, composites' cells included, in document order. */
export function materialBlocksOf(slide: Slide): MaterialBlock[] {
  const out: MaterialBlock[] = [];
  const visit = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if (block.type === 'composite') {
        for (const cell of block.cells) visit(cell.blocks);
        continue;
      }
      if (block.type === 'material') out.push(block);
    }
  };
  visit(slideBlocks(slide).map((row) => row.block));
  return out;
}

/** The frame asset a material block names, when the deck holds a material frame under that id. */
export function frameAssetOf(block: MaterialBlock, deck: Pick<Deck, 'assets'>): Asset | undefined {
  if (block.asset === undefined) return undefined;
  const asset = deck.assets[block.asset];
  if (asset === undefined || asset.source.kind !== 'material') return undefined;
  return asset;
}

/**
 * The shaders of a slide from the document: the recipe, the frame record, the file's path under
 * the deck folder and the two readings. The box is the extractor's and joins later.
 */
export function sceneShadersOf(
  slide: Slide,
  deck: Pick<Deck, 'assets'>,
  deckDir: string,
): SceneShader[] {
  return materialBlocksOf(slide).map((block) => {
    const asset = frameAssetOf(block, deck);
    const twin = asset === undefined ? undefined : 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
    const file = twin === undefined ? undefined : join(deckDir, ...twin.split('/'));
    const onDisk = file !== undefined && existsSync(file);
    return {
      blockId: block.id,
      recipe: materialRecipeOf(block),
      alt: block.alt,
      ...(asset !== undefined ? { assetId: asset.id, size: asset.size } : {}),
      ...(onDisk ? { file } : {}),
      missing: !onDisk,
      stale: asset !== undefined && asset.source.kind === 'material' && asset.source.frameKey === undefined,
    };
  });
}

/** The shaders of the scenes whose frame was missing or stale, as `<slide>#<block>`, each once. */
export function pendingShadersOf(scenes: ReadonlyArray<Scene>): string[] {
  const out = new Set<string>();
  for (const scene of scenes)
    for (const shader of shadersOf(scene))
      if (shader.missing || shader.stale) out.add(`${scene.slideId}#${shader.blockId}`);
  return [...out];
}
