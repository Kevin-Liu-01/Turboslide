// Assets carry role, twins, provenance, treatment and metrics (SPEC 4.2 "Assets"). Twins are
// relative paths under assets/; the two-tone treatment records the OPENERS.md pipeline as data
// (report 03 section 11 item 15), and metrics record the plate clearance that used to be counted
// by hand (item 16).
import { z } from 'zod';
import { annotate } from './annotate.ts';
import { extSchema } from './blocks.ts';
import type { AssetId } from './ids.ts';
import { slugSchema } from './ids.ts';

export const ASSET_ROLES = [
  'opener',
  'mood',
  'capture',
  'detail',
  'thumb',
  'render',
  'icon',
  'logo',
  'frame',
  'other',
  /* round five (gslides-parity SPEC-5 1.2): a stored audio or video file; the asset picker lists pictures only */
  'media',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/** The build rule, from build-deck.mjs:72-76. */
export const INLINE_RULES = ['native', 'resample-1280', 'two-color', 'pass-through'] as const;
export type InlineRule = (typeof INLINE_RULES)[number];

export type AssetTwins = { light: string; dark: string } | { neutral: string };

export type AssetSource =
  | {
      kind: 'material';
      materialId: string;
      uniforms: Record<string, number | number[] | string>;
      size: [3200, 1800];
      timeMs: number;
      backend: 'angle-metal' | 'swiftshader';
      renderer: string;
      recipeKey: string;
    }
  | {
      kind: 'capture';
      url: string;
      viewport: [1440, 900];
      scale: 2;
      theme: 'light' | 'dark' | 'both';
      region?: [number, number, number, number];
      recipe: string;
    }
  | {
      kind: 'photo';
      origin: string;
      /** The picture's name as the source states it (the mood plate's title). */
      title?: string;
      artist?: string;
      license: 'CC0' | 'CC BY' | 'CC BY-SA' | 'public domain' | string;
      shareAlike: boolean;
    }
  /** the Camera dialog's photo with its capture time (gslides-parity SPEC-5 3.7; b2.md R16) */
  | { kind: 'camera'; at: string }
  | { kind: 'file' };

export type TwoToneTreatment = {
  kind: 'two-tone';
  crop: [number, number, number, number];
  channel?: 'gray' | 'r' | 'g' | 'b';
  invert?: boolean;
  blur?: number;
  autocontrast: 0.5;
  black?: number;
  white?: number;
  gamma?: number;
  minFilter?: number;
  unsharp?: { rows: [number, number]; amount: number };
  polarity: 'dark-ground' | 'light-ground';
  cell: 2;
  bayer: 8;
  resampler: 'lanczos3';
};

export type AssetTreatment = TwoToneTreatment | { kind: 'continuous'; quality: 88 | 92 | 95 };

export type AssetMetrics = {
  litFraction: number;
  plateClear?: {
    plate: [number, number, number, number];
    nearestLitPx: number;
    litUnder: number;
    litInBand: number;
  };
};

/**
 * A materialized dither variant (gslides-parity SPEC-3 10.1, 10.4; research-3 06 4.5): the files
 * `picture.materialize` wrote for one resolved dither over one source, recorded on the asset
 * because two pictures with the same source and effect share one file; what every export reads.
 */
export type AssetVariant = {
  /** sha256, hex, of the source digest, the resolved PictureDither, the cell and the screen size. */
  key: string;
  /** `assets/<id>.dither-<key12>-light.png` and `-dark.png`, or one neutral file for polarity 'same'. */
  twins: AssetTwins;
  /** The sheet pixels the file covers. */
  size: [number, number];
  /** Cells are cell times scale file pixels. */
  scale: 1 | 2;
  /** The lit fraction; the plate clearance when a plate group sits over it. */
  metrics?: AssetMetrics;
  producedAt: string;
};

export type Asset = {
  id: AssetId;
  role: AssetRole;
  alt: string;
  /** relative paths under assets/ */
  twins: AssetTwins;
  /** pixels of the stored file */
  size: [number, number];
  /** device pixels per sheet px the file was produced at */
  scale: 1 | 2 | 3;
  source: AssetSource;
  treatment?: AssetTreatment;
  /**
   * The continuous original under assets/ that a two-tone treatment re-runs from (asset add
   * --two-tone keeps it as assets/<id>.source.<ext>); the inspector's Dither section and
   * `asset dither` need it, the twins alone cannot be re-toned. Absent for the imported deck,
   * whose sources were not committed (OPENERS.md names them).
   */
  sourceFile?: string;
  /** must appear on the plate for share-alike sources */
  credit?: string;
  inline: InlineRule;
  metrics?: AssetMetrics;
  /** The materialized dither variants by key (SPEC-3 10.1); pruned by `picture.materialize --prune`. */
  variants?: Record<string, AssetVariant>;
  ext?: Record<string, unknown>;
};

/** A variant key: the sha256 hex digest of 06 4.5. */
export const ASSET_VARIANT_KEY = /^[0-9a-f]{64}$/;

/**
 * The 320 px twin variant (gslides-parity SPEC-5 11; SPEC-4 7): an `AssetVariant` with this size,
 * a palette PNG for a two tone picture and a JPEG for a continuous one, written at intake and by
 * `picture.materialize --clone`; the filmstrip clone's `srcset` names it beside the 1600 twin.
 */
export const TWIN_VARIANT_SIZE: readonly [number, number] = [320, 180];

// ---------------------------------------------------------------------------------------------
// Media assets (gslides-parity SPEC-5 0.16, 1.2; R11 1.4)

export const MEDIA_ASSET_KINDS = ['audio', 'video'] as const;
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

/** The five formats the intake accepts (SPEC-5 0.18): mp4, webm, mp3, m4a, wav. */
export const MEDIA_MIMES = [
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
] as const;
export type MediaMime = (typeof MEDIA_MIMES)[number];

/** The file extension per accepted mime (R11 1.1). */
export const MEDIA_EXTENSIONS: Readonly<Record<MediaMime, string>> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
};

export type MediaAssetSource =
  | { kind: 'file' }
  | { kind: 'url'; origin: string }
  | { kind: 'upload' }
  /** a recording of the device's camera or microphone, with its capture time (gslides-parity SPEC-5 3.7) */
  | { kind: 'camera' | 'recording'; at: string };

/**
 * A stored audio or video file in `deck.assets` beside the pictures (R11 1.4): the digest named
 * file under `assets/`, its container facts as the sniff and Turboslide's own parsers read them,
 * an optional default poster (a picture asset; a block's own poster wins) and where it came from.
 * A picture asset has no `kind`, so `isMediaAsset` tells the two apart in one map.
 */
export type MediaAsset = {
  id: AssetId;
  kind: MediaAssetKind;
  role: 'media';
  /** `assets/<id>.<sha8>.<ext>`, digest named like a twin, never overwritten */
  file: string;
  mime: MediaMime;
  bytes: number;
  sha256: string;
  /** null when the container states none (a recorded webm); refreshed from the browser */
  durationMs: number | null;
  /** video: coded pixels */
  size?: [number, number];
  /** the sample entry codes or Matroska codec ids: ['avc1', 'mp4a'], ['V_VP9', 'A_OPUS'] */
  codecs: string[];
  /** the default poster, a picture asset; a block may name its own */
  poster?: AssetId;
  title?: string;
  source: MediaAssetSource;
  ext?: Record<string, unknown>;
};

/** A value of `deck.assets`: a picture asset (today's record) or a media asset (SPEC-5 0.16). */
export type DeckAsset = Asset | MediaAsset;

const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) => !value.startsWith('/') && !value.includes('..'),
    'a relative path under assets/',
  );

export const assetTwinsSchema = z.union([
  z.strictObject({ light: relativePath, dark: relativePath }),
  z.strictObject({ neutral: relativePath }),
]) satisfies z.ZodType<AssetTwins>;

export const assetSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('material'),
    materialId: z.string().min(1),
    uniforms: z.record(z.string(), z.union([z.number(), z.array(z.number()), z.string()])),
    size: z.tuple([z.literal(3200), z.literal(1800)]),
    timeMs: z.number().nonnegative(),
    backend: z.enum(['angle-metal', 'swiftshader']),
    renderer: z.string(),
    recipeKey: z.string(),
  }),
  z.strictObject({
    kind: z.literal('capture'),
    url: z.string().url(),
    viewport: z.tuple([z.literal(1440), z.literal(900)]),
    scale: z.literal(2),
    theme: z.enum(['light', 'dark', 'both']),
    region: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    recipe: z.string(),
  }),
  z.strictObject({
    kind: z.literal('photo'),
    origin: z.string().min(1),
    title: z.string().optional(),
    artist: z.string().optional(),
    license: z.string().min(1),
    shareAlike: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('camera'), at: z.string().min(1) }),
  z.strictObject({ kind: z.literal('file') }),
]) satisfies z.ZodType<AssetSource>;

export const twoToneTreatmentSchema = z.strictObject({
  kind: z.literal('two-tone'),
  crop: annotate(z.tuple([z.number(), z.number(), z.number(), z.number()]), {
    label: 'Crop',
    control: 'json',
    group: 'Asset',
    help: 'x, y, width, height in source pixels; may reach past the source, which pads with the ground.',
  }),
  channel: annotate(z.enum(['gray', 'r', 'g', 'b']).optional(), {
    label: 'Channel',
    control: 'select',
    snap: ['gray', 'r', 'g', 'b'],
    group: 'Asset',
  }),
  invert: annotate(z.boolean().optional(), { label: 'Invert', control: 'toggle', group: 'Asset' }),
  blur: annotate(z.number().nonnegative().optional(), {
    label: 'Blur',
    control: 'number',
    group: 'Asset',
  }),
  autocontrast: z.literal(0.5),
  black: annotate(z.number().min(0).max(255).optional(), {
    label: 'Black point',
    control: 'number',
    group: 'Asset',
  }),
  white: annotate(z.number().min(0).max(255).optional(), {
    label: 'White point',
    control: 'number',
    group: 'Asset',
  }),
  gamma: annotate(z.number().positive().optional(), {
    label: 'Gamma',
    control: 'number',
    group: 'Asset',
  }),
  minFilter: annotate(z.number().positive().optional(), {
    label: 'Min filter',
    control: 'number',
    group: 'Asset',
  }),
  unsharp: z
    .strictObject({ rows: z.tuple([z.number(), z.number()]), amount: z.number() })
    .optional(),
  polarity: annotate(z.enum(['dark-ground', 'light-ground']), {
    label: 'Polarity',
    control: 'select',
    snap: ['dark-ground', 'light-ground'],
    group: 'Asset',
  }),
  cell: z.literal(2),
  bayer: z.literal(8),
  resampler: z.literal('lanczos3'),
}) satisfies z.ZodType<TwoToneTreatment>;

export const assetTreatmentSchema = z.discriminatedUnion('kind', [
  twoToneTreatmentSchema,
  z.strictObject({
    kind: z.literal('continuous'),
    quality: annotate(z.literal([88, 92, 95]), {
      label: 'JPEG quality',
      control: 'select',
      snap: [88, 92, 95],
      group: 'Asset',
    }),
  }),
]) satisfies z.ZodType<AssetTreatment>;

export const assetMetricsSchema = z.strictObject({
  litFraction: z.number().min(0).max(1),
  plateClear: z
    .strictObject({
      plate: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      nearestLitPx: z.number().nonnegative(),
      litUnder: z.number().nonnegative(),
      litInBand: z.number().nonnegative(),
    })
    .optional(),
}) satisfies z.ZodType<AssetMetrics>;

export const assetVariantSchema = z.strictObject({
  key: z.string().regex(ASSET_VARIANT_KEY, 'a sha256 hex digest'),
  twins: assetTwinsSchema,
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  scale: z.literal([1, 2]),
  metrics: assetMetricsSchema.optional(),
  producedAt: z.string(),
}) satisfies z.ZodType<AssetVariant>;

export const assetSchema = z.strictObject({
  id: slugSchema,
  role: annotate(z.enum(ASSET_ROLES), {
    label: 'Role',
    control: 'select',
    snap: ASSET_ROLES,
    group: 'Asset',
  }),
  alt: annotate(z.string().min(1), { label: 'Alt text', control: 'textarea', group: 'Asset' }),
  twins: assetTwinsSchema,
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  scale: annotate(z.literal([1, 2, 3]), {
    label: 'Scale',
    control: 'select',
    snap: [1, 2, 3],
    group: 'Asset',
  }),
  source: assetSourceSchema,
  treatment: assetTreatmentSchema.optional(),
  sourceFile: relativePath.optional(),
  credit: annotate(z.string().optional(), {
    label: 'Credit',
    control: 'text',
    group: 'Asset',
    help: 'Must appear on the plate for share-alike sources (OPENERS.md:255).',
  }),
  inline: annotate(z.enum(INLINE_RULES), {
    label: 'Inline rule',
    control: 'select',
    snap: INLINE_RULES,
    group: 'Asset',
    help: 'How the standalone build embeds the file (build-deck.mjs:72-76).',
  }),
  metrics: assetMetricsSchema.optional(),
  variants: z
    .record(z.string().regex(ASSET_VARIANT_KEY, 'a sha256 hex digest'), assetVariantSchema)
    .optional(),
  ext: extSchema,
}) satisfies z.ZodType<Asset>;

const mediaFilePath = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('assets/') && !value.includes('..'),
    'a media file under assets/',
  );

export const mediaAssetSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('file') }),
  z.strictObject({ kind: z.literal('url'), origin: z.string().min(1) }),
  z.strictObject({ kind: z.literal('upload') }),
  z.strictObject({ kind: z.enum(['camera', 'recording']), at: z.string().min(1) }),
]) satisfies z.ZodType<MediaAssetSource>;

export const mediaAssetSchema = z.strictObject({
  id: slugSchema,
  kind: annotate(z.enum(MEDIA_ASSET_KINDS), {
    label: 'Kind',
    control: 'select',
    snap: MEDIA_ASSET_KINDS,
    group: 'Asset',
  }),
  role: z.literal('media'),
  file: mediaFilePath,
  mime: z.enum(MEDIA_MIMES),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'a sha256 hex digest'),
  durationMs: z.number().int().nonnegative().nullable(),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  codecs: z.array(z.string().min(1)).max(8),
  poster: annotate(slugSchema.optional(), {
    label: 'Poster',
    control: 'asset',
    group: 'Asset',
    help: 'The picture asset every still shows for this media; a block may name its own (gslides-parity SPEC-5 0.16).',
  }),
  title: annotate(z.string().max(200).optional(), {
    label: 'Title',
    control: 'text',
    group: 'Asset',
  }),
  source: mediaAssetSourceSchema,
  ext: extSchema,
}) satisfies z.ZodType<MediaAsset>;

/** A value of `deck.assets`: the picture record first, the media record when `kind` is present. */
export const deckAssetSchema = z.union([
  assetSchema,
  mediaAssetSchema,
]) satisfies z.ZodType<DeckAsset>;

/** True for a stored audio or video record; a picture asset carries no `kind`. */
export function isMediaAsset(asset: DeckAsset): asset is MediaAsset {
  return 'kind' in asset && (asset.kind === 'audio' || asset.kind === 'video');
}

/** True for a picture asset, the record every twin reader takes. */
export function isPictureAsset(asset: DeckAsset): asset is Asset {
  return !isMediaAsset(asset);
}

/** The picture assets of a deck's map, media left out (the readers of twins, the asset picker, the bundle's twin logic). */
export function pictureAssets(assets: Readonly<Record<string, DeckAsset>>): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  for (const [id, asset] of Object.entries(assets)) if (isPictureAsset(asset)) out[id] = asset;
  return out;
}

/** The picture asset of an id, or undefined when the id names nothing or a media file. */
export function pictureAssetOf(
  assets: Readonly<Record<string, DeckAsset>>,
  id: string,
): Asset | undefined {
  const asset = assets[id];
  return asset !== undefined && isPictureAsset(asset) ? asset : undefined;
}

/** The variant twins for a theme, or undefined when no variant carries the key. */
export function assetVariantTwin(
  asset: Asset,
  key: string,
  theme: 'light' | 'dark',
): string | undefined {
  const variant = asset.variants?.[key];
  if (variant === undefined) return undefined;
  return 'neutral' in variant.twins ? variant.twins.neutral : variant.twins[theme];
}

/**
 * True when a block level dither may run on the asset (SPEC-3 10.1): the asset has a continuous
 * source, or carries no two tone treatment (its twins are the continuous picture).
 */
export function hasContinuousSource(asset: Asset): boolean {
  return asset.sourceFile !== undefined || asset.treatment?.kind !== 'two-tone';
}

/** The twin for a theme; a neutral asset serves both. */
export function assetTwin(asset: Asset, theme: 'light' | 'dark'): string {
  return 'neutral' in asset.twins ? asset.twins.neutral : asset.twins[theme];
}

export function isShareAlike(asset: Asset): boolean {
  return asset.source.kind === 'photo' && asset.source.shareAlike;
}
