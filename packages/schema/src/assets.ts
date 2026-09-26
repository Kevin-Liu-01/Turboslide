// Assets carry role, twins, provenance, treatment and metrics (SPEC 4.2 "Assets"). Twins are
// relative paths under assets/; the two-tone treatment records the OPENERS.md pipeline as data
// (report 03 section 11 item 15), and metrics record the plate clearance that used to be counted
// by hand (item 16). The vector round (docs/VECTOR.md 4.1) adds the svg asset: `kind: 'svg'` with
// its sanitized source under `vector` beside the PNG `twins`, read through `vectorOf`, which also
// answers a ship one logo's untinted `sourceFile` so the decks already stored draw their logos as
// vector without a migration.
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
      /**
       * The frame's pixels: 3200 by 1800 for the 16:9 box, and since the features round's ship two
       * the box's own aspect with the long side 3200 (docs/FEATURES.md 5.5: 3200 by 800 for a 4:1
       * band, 1800 by 3200 for a 9:16 box).
       */
      size: [number, number];
      timeMs: number;
      /**
       * Where the frame was rendered: the hosted job's Metal or SwiftShader, or `client`, the
       * editor's own WebGL (docs/FEATURES.md 5.5); `renderer` names the GPU string either way.
       */
      backend: 'angle-metal' | 'swiftshader' | 'client';
      renderer: string;
      /** The capture's own identity: sha256 over materialId, uniforms, size, timeMs and backend. */
      recipeKey: string;
      /**
       * What decides staleness (docs/FEATURES.md 5.5): sha256 over the material, the preset, the
       * resolved uniforms, the anchor, the six kit colours and the box's aspect, without the pixel
       * size and the backend, so a client frame and a hosted frame of one recipe share it. Absent
       * on a frame captured before the features round, which is stale by that absence.
       */
      frameKey?: string;
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
  | FileAssetSource
  | LogoAssetSource;

/**
 * An uploaded, pasted, dropped or fetched file (the intake's default record). `sanitized` records
 * the elements the svg sanitizer dropped from an svg asset (docs/VECTOR.md 4.2), in document
 * order, once each; absent for a raster and for an svg nothing left.
 */
export type FileAssetSource = { kind: 'file'; sanitized?: { removed: string[] } };

/**
 * A company mark from a logo source (docs/FEATURES.md 4.4; audit-logos 2): the provider and the
 * mark's slug and variant as the source names them, the title, the licence string as recorded on
 * the day of the insert, the brand's site and guidelines, when it was fetched and the digest of the
 * sanitized file; `sanitized` records the elements the sanitizer dropped (4.7), `tint` the kit's
 * text colour written into a mono mark per appearance. The document never carries the source's
 * address: the twins are the deck's own PNG files and `sourceFile` is the sanitized SVG.
 */
export type LogoAssetSource = {
  kind: 'logo';
  provider: 'thesvg';
  slug: string;
  variant: string;
  title: string;
  license: string;
  url?: string;
  guidelines?: string;
  fetchedAt: string;
  /** sha256, hex, of the sanitized SVG the twins were rasterized from */
  digest: string;
  sanitized?: { removed: string[] };
  tint?: { light?: string; dark?: string };
};

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
  /**
   * `svg` for a vector picture (docs/VECTOR.md 4.1): `vector` names its sanitized source file and
   * `twins` the PNG twin at 3x for the surfaces that cannot take a vector (the deck cards, the
   * render route's thumbnails, the PowerPoint's fallback blip). Absent for every raster asset.
   */
  kind?: 'svg';
  /**
   * The sanitized svg file (or the two tinted files of a mono logo, one per appearance) under
   * assets/, what the sheet, the PDF and the web page draw for an svg asset; read through
   * `vectorOf`, never directly, so a ship one logo answers too.
   */
  vector?: AssetTwins;
  /** relative paths under assets/ */
  twins: AssetTwins;
  /** pixels of the stored file; for an svg asset the file's intrinsic size in sheet px (4.1) */
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
    size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    timeMs: z.number().nonnegative(),
    backend: z.enum(['angle-metal', 'swiftshader', 'client']),
    renderer: z.string(),
    recipeKey: z.string(),
    frameKey: z.string().optional(),
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
  z.strictObject({
    kind: z.literal('file'),
    sanitized: z.strictObject({ removed: z.array(z.string()) }).optional(),
  }),
  z.strictObject({
    kind: z.literal('logo'),
    provider: z.literal('thesvg'),
    slug: z.string().min(1).max(200),
    variant: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    license: z.string().min(1).max(400),
    url: z.string().url().optional(),
    guidelines: z.string().url().optional(),
    fetchedAt: z.string().min(1),
    digest: z.string().regex(/^[0-9a-f]{8,64}$/, 'a hex digest'),
    sanitized: z.strictObject({ removed: z.array(z.string()) }).optional(),
    tint: z
      .strictObject({
        light: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        dark: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      })
      .optional(),
  }),
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
  kind: z.literal('svg').optional(),
  vector: assetTwinsSchema.optional(),
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

/**
 * The vector files an asset draws as (docs/VECTOR.md 4.1): `vector` when the record carries it,
 * and for a ship one logo asset (`role: 'logo'`, a `sourceFile` ending in `.svg`, no tint) the
 * untinted `sourceFile` as one neutral file, so the decks already on production draw their logos
 * as vector without a migration. A tinted logo of ship one has no tinted svg on disk and answers
 * nothing (it keeps its PNG twins until it is inserted again). Undefined for every raster asset.
 */
export function vectorOf(
  asset: Pick<Asset, 'vector' | 'role' | 'sourceFile' | 'source'>,
): AssetTwins | undefined {
  if (asset.vector !== undefined) return asset.vector;
  if (
    asset.role === 'logo' &&
    asset.sourceFile !== undefined &&
    /\.svg$/i.test(asset.sourceFile) &&
    asset.source.kind === 'logo' &&
    asset.source.tint === undefined
  )
    return { neutral: asset.sourceFile };
  return undefined;
}

/** The vector file for a theme, or undefined for a raster asset (`vectorOf`). */
export function assetVector(asset: Asset, theme: 'light' | 'dark'): string | undefined {
  const vector = vectorOf(asset);
  if (vector === undefined) return undefined;
  return 'neutral' in vector ? vector.neutral : vector[theme];
}

export function isShareAlike(asset: Asset): boolean {
  return asset.source.kind === 'photo' && asset.source.shareAlike;
}
