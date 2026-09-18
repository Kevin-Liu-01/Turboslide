// The picture dither (gslides-parity SPEC-3 10.1, 0.36, 0.37; research-3 06 4.1): a non
// destructive field on `picture` and `shot` that re-tones the asset's continuous source through
// the deck's two tone screen. The field never rewrites an asset's twins; the asset level
// `treatment` and `asset.dither` stay for the committed GT twins. The toggle in the interface is the
// field's presence: on writes `{ pattern: 'bayer8' }` or the Photograph preset's three numbers
// beside it, off removes it. Imports only zod, annotate and the values module so blocks.ts, the
// effects package, the renderer and the chrome can all read it without a cycle. The values (the
// lists, the type, the defaults, `resolveDither`, `ditherPresetOf`, the no source sentence) live
// in ./dither-values.ts since the focus round (VERIFICATION C2-F18) and are re-exported here by
// name, so the readers of the schema keep one import while the entry chunk and the dither worker,
// which read the values alone, no longer carry zod.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { PictureDither } from './dither-values.ts';
import {
  DITHER_CELLS,
  DITHER_CHANNELS,
  DITHER_PATTERNS,
  DITHER_POLARITIES,
  DITHER_TONES,
} from './dither-values.ts';

export type {
  DitherCell,
  DitherChannel,
  DitherPattern,
  DitherPolarity,
  DitherTone,
  PictureDither,
  ResolvedDither,
} from './dither-values.ts';
export {
  DITHER_CELLS,
  DITHER_CHANNELS,
  DITHER_DEFAULT_PATTERN,
  DITHER_DEFAULTS,
  DITHER_NO_SOURCE_MESSAGE,
  DITHER_PATTERNS,
  DITHER_PHOTOGRAPH_PRESET,
  DITHER_PHOTOGRAPH_VALUE,
  DITHER_POLARITIES,
  DITHER_TOGGLE_VALUE,
  DITHER_TONES,
  ditherPresetOf,
  resolveDither,
} from './dither-values.ts';

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
