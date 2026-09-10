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
      artist?: string;
      license: 'CC0' | 'CC BY' | 'CC BY-SA' | 'public domain' | string;
      shareAlike: boolean;
    }
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
  /** must appear on the plate for share-alike sources */
  credit?: string;
  inline: InlineRule;
  metrics?: AssetMetrics;
  ext?: Record<string, unknown>;
};

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
    artist: z.string().optional(),
    license: z.string().min(1),
    shareAlike: z.boolean(),
  }),
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
  ext: extSchema,
}) satisfies z.ZodType<Asset>;

/** The twin for a theme; a neutral asset serves both. */
export function assetTwin(asset: Asset, theme: 'light' | 'dark'): string {
  return 'neutral' in asset.twins ? asset.twins.neutral : asset.twins[theme];
}

export function isShareAlike(asset: Asset): boolean {
  return asset.source.kind === 'photo' && asset.source.shareAlike;
}
