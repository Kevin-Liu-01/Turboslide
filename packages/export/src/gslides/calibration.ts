// The Slides calibration constants (calibration/slides.json; SPEC 8.5 step 5): the page, the text
// inset and pitch model, the line weight rules, the font names, the batch caps, the quota, the
// thumbnail budgets and the image hosting limits, read once through a Zod schema so a hand edit
// that breaks the file fails here and not in a request.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const status = z.enum(['fixed', 'assumed', 'unmeasured', 'measured']);

export const slidesCalibrationSchema = z.object({
  version: z.number().int(),
  page: z.object({
    status,
    widthEmu: z.number().int().positive(),
    heightEmu: z.number().int().positive(),
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    emuPerPx: z.number().positive(),
    ptPerPx: z.number().positive(),
  }),
  text: z.object({
    normalPitchFactor: z.number().positive(),
    defaultInsetPt: z.object({
      left: z.number().nonnegative(),
      right: z.number().nonnegative(),
      top: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
    }),
    firstBaselineOffsetPx: z.number().nullable(),
    widthSlackPx: z.number().nonnegative(),
    headingMinSizePx: z.number().positive(),
    headingWidthSlack: z.number().nonnegative(),
  }),
  lines: z.object({
    weightPt: z.number().positive(),
    minimumHonoredWeightPt: z.number().nullable(),
    zeroHeightAccepted: z.boolean().nullable(),
    fallbackThicknessEmu: z.number().int().positive(),
  }),
  fonts: z.object({
    family: z.string().min(1),
    mono: z.string().min(1),
    weights: z.array(z.number().int()),
  }),
  batch: z.object({
    maxBytes: z.number().int().positive(),
    maxRequests: z.number().int().positive(),
  }),
  quota: z.object({
    writesPerMinute: z.number().int().positive(),
    readsPerMinute: z.number().int().positive(),
  }),
  thumbnail: z.object({
    size: z.literal('LARGE'),
    widthPx: z.number().int().positive(),
    mimeType: z.literal('PNG'),
    budgets: z.object({ native: z.number().min(0).max(1), flatten: z.number().min(0).max(1) }),
    threshold: z.number().min(0).max(1),
  }),
  images: z.object({
    signedUrlTtlSeconds: z.number().int().positive(),
    maxUrlBytes: z.number().int().positive(),
  }),
});

export type SlidesCalibration = z.infer<typeof slidesCalibrationSchema>;

export const SLIDES_CALIBRATION_PATH = fileURLToPath(
  new URL('../calibration/slides.json', import.meta.url),
);

let cached: SlidesCalibration | undefined;

/** The committed constants, parsed once. */
export function loadSlidesCalibration(path: string = SLIDES_CALIBRATION_PATH): SlidesCalibration {
  if (path === SLIDES_CALIBRATION_PATH && cached) return cached;
  const parsed = slidesCalibrationSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (path === SLIDES_CALIBRATION_PATH) cached = parsed;
  return parsed;
}
