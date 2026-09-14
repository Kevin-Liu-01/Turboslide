// The picture dither (gslides-parity SPEC-3 10.1, 0.36, 0.37; research-3 06 4.1): a non
// destructive field on `picture` and `shot` that re-tones the asset's continuous source through
// the deck's two tone screen. The field never rewrites an asset's twins; the asset level
// `treatment` and `asset.dither` stay for the committed GT twins. The toggle in the interface is the
// field's presence: on writes `{ pattern: 'bayer8' }` or the Photograph preset's three numbers
// beside it, off removes it. Imports only zod and annotate so blocks.ts, the effects package, the
// renderer and the chrome can all read it without a cycle.
import { z } from 'zod';
import { annotate } from '../annotate.ts';

export const DITHER_PATTERNS = ['bayer8', 'bayer4', 'blue64', 'random'] as const;
export type DitherPattern = (typeof DITHER_PATTERNS)[number];

export const DITHER_TONES = ['two', 'three', 'original'] as const;
export type DitherTone = (typeof DITHER_TONES)[number];

export const DITHER_CELLS = [1, 2, 3, 4] as const;
export type DitherCell = (typeof DITHER_CELLS)[number];

export const DITHER_POLARITIES = ['auto', 'dark-ground', 'light-ground', 'same'] as const;
export type DitherPolarity = (typeof DITHER_POLARITIES)[number];

export const DITHER_CHANNELS = ['gray', 'r', 'g', 'b'] as const;
export type DitherChannel = (typeof DITHER_CHANNELS)[number];

/** A non destructive dither over a picture's continuous source (SPEC-3 10.1). */
export type PictureDither = {
  /** The threshold texture; bayer8 is the deck's screen. */
  pattern: DitherPattern;
  /** Ink and paper, three tones with titanium in the middle, or the picture's own colours posterised. */
  tone?: DitherTone;
  /** The posterise steps for tone 'original', 2 to 7. */
  steps?: number;
  /** Sheet pixels per cell; 2 is the deck's cell. */
  cell?: DitherCell;
  /** The dithered plane's opacity over the continuous picture, 0 to 1; 1 is the pure two tone. */
  strength?: number;
  /** The tone LUT's ink point: values at or below it become ink. */
  black?: number;
  /** The tone LUT's paper point: values at or above it become paper. */
  white?: number;
  /** The midtones; below 1 lifts them. */
  gamma?: number;
  /** Source inversion before the tone stages. */
  invert?: boolean;
  /** Which theme the positive image serves; auto picks by the lit fraction; same writes one neutral variant. */
  polarity?: DitherPolarity;
  /** Advanced: a blur in source pixels of the 1800 px scaled source; two of the deck's pictures used 0.6. */
  blur?: number;
  /** Advanced ("Thicken"): a minimum filter radius in source pixels. */
  minFilter?: number;
  /** Advanced: the channel read as the tone. */
  channel?: DitherChannel;
  /** Advanced: the hash seed of pattern 'random', a 32 bit integer; 0 so two writers agree. */
  seed?: number;
};

/** Every field resolved; what the pipeline, the variant key and the Format options section read. */
export type ResolvedDither = Required<PictureDither>;

/** The defaults when a field is absent (SPEC-3 10.1); the identity of the Format options section (0.37). */
export const DITHER_DEFAULTS: Readonly<Omit<ResolvedDither, 'pattern'>> = {
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

/** The pattern the toggle writes (SPEC-3 10.1). */
export const DITHER_DEFAULT_PATTERN: DitherPattern = 'bayer8';

/**
 * The Photograph preset (SPEC-3 0.37): the middle of the GT deck's recorded ranges, what the
 * Background dialog's Dither toggle writes beside `pattern`. The Format options panel highlights
 * the Photograph row when black, white and gamma equal these and the Neutral row when they equal
 * the defaults; no preset is stored.
 */
export const DITHER_PHOTOGRAPH_PRESET = { black: 120, white: 230, gamma: 0.9 } as const;

/** The dither the toggle writes: the pattern alone, every other value a default. */
export const DITHER_TOGGLE_VALUE: PictureDither = { pattern: DITHER_DEFAULT_PATTERN };

/** The dither the Background dialog's toggle writes: the pattern and the Photograph numbers. */
export const DITHER_PHOTOGRAPH_VALUE: PictureDither = {
  pattern: DITHER_DEFAULT_PATTERN,
  ...DITHER_PHOTOGRAPH_PRESET,
};

const DITHER_GROUP = 'Block';

export const pictureDitherSchema = z.strictObject({
  pattern: annotate(z.enum(DITHER_PATTERNS), {
    label: 'Pattern',
    control: 'select',
    snap: DITHER_PATTERNS,
    group: DITHER_GROUP,
    help: 'The threshold texture; Bayer 8 by 8 is the deck’s two tone screen (gslides-parity SPEC-3 10.1).',
  }),
  tone: annotate(z.enum(DITHER_TONES).optional(), {
    label: 'Tone',
    control: 'select',
    snap: DITHER_TONES,
    group: DITHER_GROUP,
    help: 'Ink and paper (two), three tones with titanium in the middle, or the picture’s own colours posterised (original).',
  }),
  steps: annotate(z.number().int().min(2).max(7).optional(), {
    label: 'Steps',
    control: 'number',
    snap: [2, 3, 4, 5, 6, 7],
    group: DITHER_GROUP,
    help: 'The colour steps for the original tone, 2 to 7; 4 unless set.',
  }),
  cell: annotate(z.literal(DITHER_CELLS).optional(), {
    label: 'Cell',
    control: 'select',
    snap: DITHER_CELLS,
    group: DITHER_GROUP,
    help: 'Sheet pixels per cell; 2 is the deck’s cell.',
  }),
  strength: annotate(z.number().min(0).max(1).optional(), {
    label: 'Strength',
    control: 'number',
    group: DITHER_GROUP,
    help: 'The dithered plane’s opacity over the continuous picture, 0 to 1; 1 is the pure two tone.',
  }),
  black: annotate(z.number().min(0).max(255).optional(), {
    label: 'Black point',
    control: 'number',
    group: DITHER_GROUP,
    help: 'Values at or below it become ink; 0 unless set, 120 in the Photograph preset.',
  }),
  white: annotate(z.number().min(0).max(255).optional(), {
    label: 'White point',
    control: 'number',
    group: DITHER_GROUP,
    help: 'Values at or above it become paper; 255 unless set, 230 in the Photograph preset.',
  }),
  gamma: annotate(z.number().min(0.5).max(2).optional(), {
    label: 'Gamma',
    control: 'number',
    group: DITHER_GROUP,
    help: 'The midtones, 0.5 to 2; below 1 lifts them; 1 unless set, 0.9 in the Photograph preset.',
  }),
  invert: annotate(z.boolean().optional(), {
    label: 'Invert',
    control: 'toggle',
    group: DITHER_GROUP,
    help: 'Inverts the source before the tone stages, for a light render.',
  }),
  polarity: annotate(z.enum(DITHER_POLARITIES).optional(), {
    label: 'Polarity',
    control: 'select',
    snap: DITHER_POLARITIES,
    group: DITHER_GROUP,
    help: 'Which theme the positive image serves; auto picks dark ground when the lit fraction is under 0.5; same writes one neutral variant.',
  }),
  blur: annotate(z.number().min(0).max(8).optional(), {
    label: 'Blur',
    control: 'number',
    group: 'Advanced',
    help: 'A blur in source pixels of the 1800 px scaled source, 0 to 8.',
  }),
  minFilter: annotate(z.number().min(0).max(9).optional(), {
    label: 'Thicken',
    control: 'number',
    group: 'Advanced',
    help: 'A minimum filter radius in source pixels, 0 to 9.',
  }),
  channel: annotate(z.enum(DITHER_CHANNELS).optional(), {
    label: 'Channel',
    control: 'select',
    snap: DITHER_CHANNELS,
    group: 'Advanced',
    help: 'The channel read as the tone; gray unless set.',
  }),
  seed: annotate(
    z
      .number()
      .int()
      .min(-(2 ** 31))
      .max(2 ** 31 - 1)
      .optional(),
    {
      label: 'Seed',
      control: 'number',
      group: 'Advanced',
      help: 'The hash seed of the random pattern, a 32 bit integer; 0 unless set so two writers agree.',
    },
  ),
}) satisfies z.ZodType<PictureDither>;

/** The inspector field: the dither, or none. */
export const pictureDitherField = annotate(pictureDitherSchema.optional(), {
  label: 'Dither',
  control: 'json',
  group: DITHER_GROUP,
  help: 'The deck’s two tone screen over the picture’s continuous source; present means on (gslides-parity SPEC-3 10.1).',
});

/** Every field with its default filled in. */
export function resolveDither(dither: PictureDither): ResolvedDither {
  return {
    pattern: dither.pattern,
    tone: dither.tone ?? DITHER_DEFAULTS.tone,
    steps: dither.steps ?? DITHER_DEFAULTS.steps,
    cell: dither.cell ?? DITHER_DEFAULTS.cell,
    strength: dither.strength ?? DITHER_DEFAULTS.strength,
    black: dither.black ?? DITHER_DEFAULTS.black,
    white: dither.white ?? DITHER_DEFAULTS.white,
    gamma: dither.gamma ?? DITHER_DEFAULTS.gamma,
    invert: dither.invert ?? DITHER_DEFAULTS.invert,
    polarity: dither.polarity ?? DITHER_DEFAULTS.polarity,
    blur: dither.blur ?? DITHER_DEFAULTS.blur,
    minFilter: dither.minFilter ?? DITHER_DEFAULTS.minFilter,
    channel: dither.channel ?? DITHER_DEFAULTS.channel,
    seed: dither.seed ?? DITHER_DEFAULTS.seed,
  };
}

/** The preset row the Format options section highlights (0.36): by equality, never a stored field. */
export function ditherPresetOf(dither: PictureDither): 'photograph' | 'neutral' | null {
  const resolved = resolveDither(dither);
  const preset = DITHER_PHOTOGRAPH_PRESET;
  if (
    resolved.black === preset.black &&
    resolved.white === preset.white &&
    resolved.gamma === preset.gamma
  ) {
    return 'photograph';
  }
  if (
    resolved.black === DITHER_DEFAULTS.black &&
    resolved.white === DITHER_DEFAULTS.white &&
    resolved.gamma === DITHER_DEFAULTS.gamma
  ) {
    return 'neutral';
  }
  return null;
}

/**
 * The sentence the validator and the actions refuse a block dither with when the asset carries a
 * two tone treatment and no continuous source (SPEC-3 10.1); `asset.add --replace-source` attaches
 * one.
 */
export const DITHER_NO_SOURCE_MESSAGE =
  'the asset has no continuous source (sourceFile); the committed twins are already dithered';
