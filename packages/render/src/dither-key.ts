// The block level dither's resolved parameters and its variant key (gslides-parity SPEC-3 0.36,
// 10.1, 10.3, 10.4; research-3 06 sections 4.1, 4.4, 4.5). One derivation shared by the renderer
// (which looks a variant up on the asset record), the materializer (`picture.materialize`, which
// writes it) and the export paths, so a variant written by one host is found by every other.
//
// The key is the sha256 hex digest (64 characters, the form `Asset.variants` is keyed by,
// `ASSET_VARIANT_KEY` in the schema) of the JSON of `[source, resolved, screen]`: the file
// identity of the continuous source, the dither with every default filled in and its keys in a
// fixed order (so `{ pattern: 'bayer8' }` and `{ pattern: 'bayer8', cell: 2 }` name one variant),
// and the screen size in cells. The source identity is a path, not a byte digest: the string
// renderer has the document and nothing else, and the asset files of round three are digest named
// (`assets/<id>.<sha8>-light.png`, SPEC-3 8.5), so a replaced source changes the path and the key.
// The theme is not part of the key: a variant lists both twins, or one neutral file for `same`.
//
// The `PictureDither` type is B1's seam on `picture` and `shot` (SPEC-3 10.1); `PictureDitherLike`
// mirrors it here so the renderer reads the field before and after the schema lands it.
import type { Asset, AssetTwins, AssetVariant } from '@turboslide/schema/assets';
import { hasContinuousSource } from '@turboslide/schema/assets';
import type { Block, PictureBlock, ShotBlock } from '@turboslide/schema/blocks';
import { DITHER_NO_SOURCE_MESSAGE } from '@turboslide/schema/blocks/dither';
import { CANVAS_GROUP } from '@turboslide/schema/canvas';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { canvasObjects, slideBlocks, slideOrder } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { sha256Hex } from './sha256.ts';

export type DitherPattern = 'bayer8' | 'bayer4' | 'blue64' | 'random';
export type DitherTone = 'two' | 'three' | 'original';
export type DitherPolarity = 'auto' | 'dark-ground' | 'light-ground' | 'same';
export type DitherChannel = 'gray' | 'r' | 'g' | 'b';

/** The field as stored on a block (SPEC-3 10.1); every field but `pattern` is optional. */
export type PictureDitherLike = {
  pattern: DitherPattern;
  tone?: DitherTone;
  steps?: number;
  cell?: 1 | 2 | 3 | 4;
  strength?: number;
  black?: number;
  white?: number;
  gamma?: number;
  invert?: boolean;
  polarity?: DitherPolarity;
  blur?: number;
  minFilter?: number;
  channel?: DitherChannel;
  seed?: number;
};

/** The field with every default filled in, in the key order below. */
export type ResolvedDither = Required<PictureDitherLike>;

/** The defaults of SPEC-3 10.1 and 10.9: the pipeline's identity, the Format options default. */
export const DITHER_DEFAULTS: Omit<ResolvedDither, 'pattern'> = {
  tone: 'two',
  steps: 4,
  cell: 2,
  strength: 1,
  black: 0,
  white: 255,
  gamma: 1,
  invert: false,
  polarity: 'auto',
  blur: 0,
  minFilter: 0,
  channel: 'gray',
  seed: 0,
};

/** The Photograph preset the Background dialog's toggle writes (SPEC-3 0.37, 10.6). */
export const DITHER_PHOTOGRAPH: PictureDitherLike = {
  pattern: 'bayer8',
  black: 120,
  white: 230,
  gamma: 0.9,
};

/** The Neutral preset, the identity: the toggle of the Format options section (SPEC-3 10.7). */
export const DITHER_NEUTRAL: PictureDitherLike = { pattern: 'bayer8' };

const PATTERNS: readonly DitherPattern[] = ['bayer8', 'bayer4', 'blue64', 'random'];

/** The key order of the resolved record; fixed so two writers hash one string. */
const KEY_ORDER: readonly (keyof ResolvedDither)[] = [
  'pattern',
  'tone',
  'steps',
  'cell',
  'strength',
  'black',
  'white',
  'gamma',
  'invert',
  'polarity',
  'blur',
  'minFilter',
  'channel',
  'seed',
];

/** Every default filled in, keys in the fixed order. */
export function resolveDither(dither: PictureDitherLike): ResolvedDither {
  const merged: ResolvedDither = { ...DITHER_DEFAULTS, ...stripUndefined(dither) };
  const ordered: Partial<ResolvedDither> = {};
  for (const key of KEY_ORDER) (ordered as Record<string, unknown>)[key] = merged[key];
  return ordered as ResolvedDither;
}

function stripUndefined(dither: PictureDitherLike): PictureDitherLike {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dither)) if (value !== undefined) out[key] = value;
  return out as unknown as PictureDitherLike;
}

/**
 * The dither field of a block, read structurally: `dither` is B1's day one field on `picture`
 * and `shot`; a value that is not an object with a known pattern is no dither at all, so a stale
 * or foreign value never reaches the DOM.
 */
export function readDither(block: object): PictureDitherLike | undefined {
  const value = (block as { dither?: unknown }).dither;
  if (value === null || typeof value !== 'object') return undefined;
  const pattern = (value as { pattern?: unknown }).pattern;
  if (typeof pattern !== 'string' || !PATTERNS.includes(pattern as DitherPattern)) return undefined;
  return value as PictureDitherLike;
}

/** The screen size in cells of a box: `w / cell` by `h / cell`, at least one cell each way. */
export function ditherScreen(w: number, h: number, cell: number): [number, number] {
  return [Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell))];
}

/**
 * The file identity a variant is derived from: the continuous source when the asset keeps one
 * (`assets/<id>.source.<ext>`), else the continuous twin the picture shows (the light twin, or
 * the one neutral file).
 */
export function ditherSourceOf(asset: Pick<Asset, 'twins' | 'sourceFile'>): string {
  if (asset.sourceFile !== undefined) return asset.sourceFile;
  return 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
}

export type DitherKeyInput = {
  /** `ditherSourceOf(asset)`. */
  source: string;
  dither: PictureDitherLike;
  /** `ditherScreen(w, h, cell)`. */
  screen: [number, number];
};

/** The sha256 hex digest of the JSON of `[source, resolved dither, screen]`. */
export function ditherKey(input: DitherKeyInput): string {
  const resolved = resolveDither(input.dither);
  return sha256Hex(JSON.stringify([input.source, resolved, input.screen]));
}

/** The twelve hex characters the variant file names carry (`assets/<id>.dither-<key12>-light.png`). */
export function ditherKey12(key: string): string {
  return key.slice(0, 12);
}

/**
 * The variant files of an asset for a key (SPEC-3 10.4): `assets/<asset>.dither-<key12>-light.png`
 * and `-dark.png`, or one neutral `assets/<asset>.dither-<key12>.png` for polarity `same` (and the
 * posterised colours, which are the same in both themes). Digest named, never overwritten (8.5).
 */
export function variantFileNames(assetId: string, key: string, neutral: boolean): AssetTwins {
  const stem = `assets/${assetId}.dither-${ditherKey12(key)}`;
  return neutral
    ? { neutral: `${stem}.png` }
    : { light: `${stem}-light.png`, dark: `${stem}-dark.png` };
}

/** True for a path a variant file carries (the files `picture.materialize --prune` may remove). */
export const VARIANT_FILE_PATTERN = /^assets\/[^/]+\.dither-[0-9a-f]{12}(?:-light|-dark)?\.png$/;

/** A materialized variant on the asset record (SPEC-3 10.1, `Asset.variants`; B1's schema). */
export type AssetVariantLike = {
  key: string;
  twins: AssetTwins;
  /** The sheet pixels the file covers. */
  size: [number, number];
  scale: 1 | 2;
  metrics?: unknown;
  producedAt: string;
};

/** The variant record of an asset for a key, read structurally until the schema carries the field. */
export function variantFor(asset: object, key: string): AssetVariantLike | undefined {
  const variants = (asset as { variants?: unknown }).variants;
  if (variants === null || typeof variants !== 'object') return undefined;
  const found = (variants as Record<string, unknown>)[key];
  if (found === null || typeof found !== 'object') return undefined;
  const record = found as Partial<AssetVariantLike>;
  if (typeof record.key !== 'string' || record.twins === undefined) return undefined;
  if (!Array.isArray(record.size) || record.size.length !== 2) return undefined;
  return record as AssetVariantLike;
}

// ---------------------------------------------------------------------------------------------
// The dithered pictures of a document (gslides-parity SPEC-3 10.4): what `picture.materialize`
// (packages/materials) and the exporter's materialization pass (packages/export) both walk, so the
// two derive one key per block and write one record shape.

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

/** What a rendered variant reports, structurally (effects dither-io.ts `VariantRender`). */
export type VariantRenderLike = {
  neutral: boolean;
  size: [number, number];
  scale: 1 | 2;
  metrics: {
    litFraction: number;
    plateClear?: AssetVariant['metrics'] extends infer M
      ? M extends { plateClear?: infer P }
        ? P
        : never
      : never;
  };
};

/** The variant record of one render (SPEC-3 10.1 `AssetVariant`) and the files it names. */
export function variantRecordOf(
  assetId: string,
  key: string,
  rendered: VariantRenderLike,
  now: string,
): { variant: AssetVariant; files: string[] } {
  const twins = variantFileNames(assetId, key, rendered.neutral);
  const files = 'neutral' in twins ? [twins.neutral] : [twins.light, twins.dark];
  const metrics: NonNullable<AssetVariant['metrics']> = {
    litFraction: rendered.metrics.litFraction,
    ...(rendered.metrics.plateClear !== undefined
      ? { plateClear: rendered.metrics.plateClear }
      : {}),
  };
  return {
    variant: { key, twins, size: rendered.size, scale: rendered.scale, metrics, producedAt: now },
    files,
  };
}
