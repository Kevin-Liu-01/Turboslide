// The two keys of a material frame (SPEC 5.4; docs/FEATURES.md 5.5). `recipeKey` is the capture's
// own identity, `sha256(materialId, uniforms, size, timeMs, backend)`, the same digest
// packages/import/src/assets.ts writes for the imported deck: the JSON of the five fields in that
// order, hashed as written, so a key recorded in deck.json is reproduced from the record and a
// frame is never regenerated silently on another backend. `frameKey` is what decides staleness:
// sha256 over the material, the preset, the resolved uniforms, the anchor, the seven colours of
// the deck's shader palette (presets.ts, 5.7) and the box's aspect rounded to two decimals,
// without the pixel size and without the backend, so a client frame and a hosted frame of one
// recipe carry one key and both are fresh (judge-design addition 5); the aspect is in the key
// because it decides the frame's shape, and a 1600 by 900 and a 3200 by 1800 capture share it.
// `frameKeyOf(block, palette)` computes it from the document at read time, so the block stores
// nothing new; a frame is stale when the block's key differs from `asset.source.frameKey`, is
// still drawn, and is re captured, never regenerated silently. The frame asset's id is
// `frame-<the first 16 hex of frameKey>`, so a repeated recipe reuses its asset (5.5, the storage
// rule). Browser safe: the digest is the package's own sha256 (sha256.ts).
import type { Asset } from '@turboslide/schema/assets';
import type { MaterialBlock, MaterialUniforms } from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS } from '@turboslide/schema/blocks/material';

import { entryWithPalette, requireMaterial } from './catalog.ts';
import type { MaterialEntry } from './catalog.ts';
import type { ShaderPalette } from './presets.ts';
import { LEGACY_SHADER_PALETTE } from './presets.ts';
import { resolveRecipe } from './recipe.ts';
import { sha256Hex } from './sha256.ts';

export type MaterialSource = Extract<Asset['source'], { kind: 'material' }>;

export type RecipeKeyInput = Pick<
  MaterialSource,
  'materialId' | 'uniforms' | 'size' | 'timeMs' | 'backend'
>;

export function recipeKey(source: RecipeKeyInput): string {
  return `sha256:${sha256Hex(
    JSON.stringify([
      source.materialId,
      source.uniforms,
      source.size,
      source.timeMs,
      source.backend,
    ]),
  )}`;
}

/** The anchor a block's frame freezes at: its own, else the catalog's default (5,500 ms). */
export function anchorOf(block: Pick<MaterialBlock, 'anchor'>): number {
  return block.anchor ?? MATERIAL_ANCHORS[1];
}

/** The long side of every frame, in pixels (SPEC 4.2; docs/FEATURES.md 5.5). */
export const FRAME_LONG_SIDE = 3200;

/**
 * The aspect of a block's box (width over height): the object's `pos` on a canvas, else 16:9,
 * the figure's shape in a flow layout (block-css.ts `.material { aspect-ratio: 16 / 9 }`; a
 * `height` alone leaves the width to the slot, so the still keeps 16:9 there).
 */
export function materialAspectOf(block: Pick<MaterialBlock, 'pos' | 'height'>): number {
  const pos = block.pos;
  if (pos !== undefined && pos.w > 0 && pos.h > 0) return pos.w / pos.h;
  return 16 / 9;
}

/** The aspect as the key carries it: two decimals. */
export function roundedAspect(aspect: number): number {
  return Math.round(aspect * 100) / 100;
}

/**
 * The frame's pixels for an aspect (5.5): the long side 3200 and the short side from the aspect,
 * both even so the capture host is whole CSS pixels at half size (3200 by 1800 for 16:9, 3200 by
 * 800 for a 4:1 band, 1800 by 3200 for a 9:16 box).
 */
export function frameSizeFor(aspect: number): [number, number] {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (!Number.isFinite(aspect) || aspect <= 0) return [FRAME_LONG_SIDE, 1800];
  if (aspect >= 1) return [FRAME_LONG_SIDE, even(FRAME_LONG_SIDE / aspect)];
  return [even(FRAME_LONG_SIDE * aspect), FRAME_LONG_SIDE];
}

/** The recipe fields the frame key reads off a block. */
export type FrameKeyBlock = Pick<
  MaterialBlock,
  'materialId' | 'preset' | 'uniforms' | 'anchor' | 'pos' | 'height'
>;

/** The pieces the frame key hashes, in order: what a test reads to see which one moved. */
export type FrameKeyInput = {
  materialId: string;
  preset: string | null;
  uniforms: MaterialUniforms;
  anchor: number;
  palette: ShaderPalette;
  aspect: number;
};

/**
 * The resolved pieces of a block's frame key over a deck's palette. The uniforms are the recipe
 * resolved against the entry whose palette presets the kit computed (5.7), so a `brand.set
 * /colors/*` changes the uniforms of every palette preset and the palette field both.
 */
export function frameKeyInput(
  block: FrameKeyBlock,
  palette: ShaderPalette = LEGACY_SHADER_PALETTE,
  entry: MaterialEntry = entryWithPalette(requireMaterial(block.materialId), palette),
): FrameKeyInput {
  const resolved = resolveRecipe(entry, {
    ...(block.preset !== undefined ? { preset: block.preset } : {}),
    ...(block.uniforms !== undefined ? { uniforms: block.uniforms } : {}),
  });
  return {
    materialId: entry.id,
    preset: block.preset ?? null,
    uniforms: resolved.uniforms,
    anchor: anchorOf(block),
    palette,
    aspect: roundedAspect(materialAspectOf(block)),
  };
}

/** The frame key of resolved pieces: `sha256:<64 hex>` over their JSON in field order. */
export function frameKeyOfInput(input: FrameKeyInput): string {
  const { palette } = input;
  return `sha256:${sha256Hex(
    JSON.stringify([
      input.materialId,
      input.preset,
      input.uniforms,
      input.anchor,
      [
        palette.text,
        palette.background,
        palette.caption,
        palette.hint,
        palette.primary,
        palette.accent,
        palette.figure,
      ],
      input.aspect,
    ]),
  )}`;
}

/** The frame key of a block over a deck's shader palette (5.5). */
export function frameKeyOf(
  block: FrameKeyBlock,
  palette: ShaderPalette = LEGACY_SHADER_PALETTE,
): string {
  return frameKeyOfInput(frameKeyInput(block, palette));
}

/** `frame-<the first 16 hex of the key>`: the asset id every frame of one key shares (5.5). */
export function frameAssetId(frameKey: string): string {
  const hex = frameKey.replace(/^sha256:/, '');
  return `frame-${hex.slice(0, 16)}`;
}

/** True for an asset id a frame write made. */
export function isFrameAssetId(id: string): boolean {
  return /^frame-[0-9a-f]{16}$/.test(id);
}

/**
 * True when the block's frame is missing or stale: no asset, an asset that is not a material
 * frame, or a frame whose recorded key is not the block's key over this palette (a frame captured
 * before the features round carries no key and is stale by that absence).
 */
export function frameIsStale(
  block: FrameKeyBlock & { asset?: string | undefined },
  assets: Readonly<Record<string, Asset>>,
  palette: ShaderPalette = LEGACY_SHADER_PALETTE,
): boolean {
  if (block.asset === undefined) return true;
  const asset = assets[block.asset];
  if (asset === undefined || asset.source.kind !== 'material') return true;
  if (asset.source.frameKey === undefined) return true;
  return asset.source.frameKey !== frameKeyOf(block, palette);
}
