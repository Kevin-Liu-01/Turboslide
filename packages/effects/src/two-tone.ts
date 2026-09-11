// The two-tone pipeline (SPEC 5.4): crop, gray or one channel, invert, minimum filter, blur,
// cover fit to 800 by 450 with the pinned Lanczos3, unsharp band, autocontrast at 0.5 percent,
// black and white points and gamma through the tone LUT, the 8 by 8 Bayer screen at thresholds
// (m + 0.5) / 64, polarity, 2x nearest to 1600 by 900, both twins as 1-bit PNGs, and the plate
// metrics. The parameters are the two-tone treatment of Asset in SPEC 4.2.
//
// The screen is computed by the selected backend (select.ts; SPEC 10): the napi addon or the
// wasm module of crates/turboslide-native when one is built, the TypeScript stages of
// pipeline.ts otherwise. Polarity, the nearest upscale, the PNG encoder and the metrics stay in
// TypeScript here: they are integer operations that cannot disagree, and the PNG bytes then come
// from node:zlib on every machine, so a regenerated twin is byte-stable across backends.
import type { BitImage, Box, Box4, GrayImage, RgbaImage } from './image.ts';
import { invertBits } from './image.ts';
import type { UnsharpBand } from './filters.ts';
import { twoToneMetrics } from './metrics.ts';
import type { TwoToneMetrics } from './metrics.ts';
import type { TwoToneScreen } from './pipeline.ts';
import { encodePng1 } from './png1.ts';
import type { Png1Options } from './png1.ts';
import { scaleNearest } from './resample.ts';
import { getBackend } from './select.ts';
import type { Channel } from './tone.ts';

export { SHEET_SIZE, TWO_TONE_SIZE } from './pipeline.ts';

/** Mirrors Asset.treatment for kind 'two-tone' (SPEC 4.2). */
export type TwoToneParams = {
  kind?: 'two-tone';
  /** Left, top, right, bottom in source pixels; may reach past the source, padded with black. */
  crop?: Box4;
  channel?: Channel;
  invert?: boolean;
  blur?: number;
  autocontrast?: number;
  black?: number;
  white?: number;
  gamma?: number;
  minFilter?: number;
  unsharp?: UnsharpBand;
  /** Which twin the positive image becomes: dark-ground when the positive is mostly ink. */
  polarity?: 'dark-ground' | 'light-ground';
  cell?: 2;
  bayer?: 8;
  resampler?: 'lanczos3';
};

export type TwoToneTwin = {
  /** 1600 by 900 cells at one sheet pixel each (the 800 by 450 screen scaled 2x nearest). */
  bits: BitImage;
  png: Uint8Array;
};

export type TwoToneResult = {
  /** The processed 800 by 450 image before polarity; 1 is a lit cell. */
  positive: BitImage;
  /** The 800 by 450 tone image after autocontrast and the LUT, for inspection. */
  toneImage: GrayImage;
  dark: TwoToneTwin;
  light: TwoToneTwin;
  metrics: TwoToneMetrics;
  /** Which implementation cut the screen (SPEC 10). */
  backend: 'native' | 'wasm' | 'typescript';
  params: Required<
    Pick<
      TwoToneParams,
      | 'autocontrast'
      | 'black'
      | 'white'
      | 'gamma'
      | 'polarity'
      | 'cell'
      | 'bayer'
      | 'resampler'
      | 'channel'
      | 'invert'
      | 'blur'
      | 'minFilter'
    >
  > &
    TwoToneParams;
};

export type TwoToneOptions = {
  /** The plate rectangle to measure against, in sheet pixels. */
  plate?: Box;
  png?: Png1Options;
};

/** The one-bit screen before polarity, from the selected backend. */
export function twoToneScreen(rgba: RgbaImage, params: TwoToneParams): TwoToneScreen {
  return getBackend().twoToneScreen(rgba, params);
}

/** Both twins from a source picture and its treatment. */
export function twoTone(
  rgba: RgbaImage,
  params: TwoToneParams,
  options: TwoToneOptions = {},
): TwoToneResult {
  const backend = getBackend();
  const { positive, toneImage } = backend.twoToneScreen(rgba, params);
  const polarity = params.polarity ?? 'dark-ground';
  const cell = params.cell ?? 2;
  const darkBits = polarity === 'dark-ground' ? positive : invertBits(positive);
  const lightBits = invertBits(darkBits);
  const dark = scaleNearest(darkBits, cell);
  const light = scaleNearest(lightBits, cell);
  return {
    positive,
    toneImage,
    dark: { bits: dark, png: encodePng1(dark, options.png) },
    light: { bits: light, png: encodePng1(light, options.png) },
    metrics: twoToneMetrics(darkBits, options.plate, cell),
    backend: backend.kind,
    params: {
      ...params,
      channel: params.channel ?? 'gray',
      invert: params.invert ?? false,
      blur: params.blur ?? 0,
      minFilter: params.minFilter ?? 0,
      autocontrast: params.autocontrast ?? 0.5,
      black: params.black ?? 0,
      white: params.white ?? 255,
      gamma: params.gamma ?? 1,
      polarity,
      cell,
      bayer: 8,
      resampler: 'lanczos3',
    },
  };
}

/**
 * A twin at export scale: the one-bit screen scaled 2k times nearest, so a 2x export gets 4 by
 * 4 device pixel cells instead of a bilinear blow-up of the 1x file (SPEC 5.4; slides report
 * section 2.5).
 */
export function twoToneAtScale(screenBits: BitImage, scale: 1 | 2 | 3, cell = 2): BitImage {
  return scaleNearest(screenBits, cell * scale);
}
