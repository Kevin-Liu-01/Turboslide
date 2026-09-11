// The TypeScript two-tone screen (SPEC 5.4; OPENERS.md "Shader pipeline" and "Photograph
// pipeline"; scratchpad/rosetta/make.py is the Pillow original): gray or one channel, crop,
// invert, minimum filter, blur, cover fit to 800 by 450 with the pinned Lanczos3, unsharp band,
// autocontrast at 0.5 percent, black and white points and gamma through the tone LUT, the 8 by 8
// Bayer screen at thresholds (m + 0.5) / 64. This is the reference implementation the Rust crate
// mirrors (crates/turboslide-native/src/lib.rs two_tone_screen) and the fallback the backend
// selection lands on without a native build (SPEC 10). `twoToneScreen` in two-tone.ts dispatches
// to the selected backend; this module is the backend-free stage order.
//
// Stage order follows make.py (gray before the fit). The round ten shader pipeline resized the
// RGB crop first and converted to gray after, and compared the tone in floating point instead of
// through the LUT; the two orders agree on all but a small share of cells at threshold edges
// (the two-tone test measures the share on the liquid metal opener).
import { ditherGray } from './bayer.ts';
import { gaussianBlur, minFilter, unsharpBand } from './filters.ts';
import type { BitImage, GrayImage, RgbaImage } from './image.ts';
import { cropPadded, fitCover } from './resample.ts';
import { autocontrast, invertGray, toGray, tone } from './tone.ts';
import type { TwoToneParams } from './two-tone.ts';

/** The screen size the deck dithers at and the sheet it covers (OPENERS.md steps 5 and 6). */
export const TWO_TONE_SIZE = { width: 800, height: 450 } as const;
export const SHEET_SIZE = { width: 1600, height: 900 } as const;

export type TwoToneScreen = { positive: BitImage; toneImage: GrayImage };

/** The one-bit screen before polarity: every stage up to and including the dither, in TypeScript. */
export function twoToneScreenTypeScript(rgba: RgbaImage, params: TwoToneParams): TwoToneScreen {
  let gray = toGray(rgba, params.channel ?? 'gray');
  gray = cropPadded(gray, params.crop ?? [0, 0, rgba.width, rgba.height]);
  if (params.invert) gray = invertGray(gray);
  if (params.minFilter) gray = minFilter(gray, params.minFilter);
  if (params.blur) gray = gaussianBlur(gray, params.blur);
  gray = fitCover(gray, TWO_TONE_SIZE.width, TWO_TONE_SIZE.height);
  if (params.unsharp) gray = unsharpBand(gray, params.unsharp);
  gray = autocontrast(gray, params.autocontrast ?? 0.5);
  gray = tone(gray, params.black ?? 0, params.white ?? 255, params.gamma ?? 1);
  return { positive: ditherGray(gray), toneImage: gray };
}
