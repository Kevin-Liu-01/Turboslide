// The picture dither's values without its schema (gslides-parity SPEC-3 10.1, 0.36, 0.37): the
// pattern, tone, cell, polarity and channel lists, the field type, the defaults, the Photograph
// preset, the two toggle values, `resolveDither`, `ditherPresetOf` and the no source sentence.
// Split from ./dither.ts in the focus round (cycle 3 stream fix round's fix round; VERIFICATION
// C2-F18) so the effects pipeline, the renderer's dither walk, the dither worker and the material
// actions read the values without the zod schema: through ./dither.ts they carried zod (99 KB
// decoded) into the studio's entry chunk on every route and into the worker. This module imports
// nothing; ./dither.ts builds `pictureDitherSchema` over these lists and re-exports them, so a
// reader that needs the schema keeps one import.

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
