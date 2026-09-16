// The block level dither (gslides-parity SPEC-3 0.36, 10.2; research-3 06 section 4.2): one
// pipeline for the studio's worker, the sheet runtime and Node, browser safe (no encoder, no node
// import). The stages are the deck's two tone pipeline (pipeline.ts) split at the cache line the
// live preview needs:
//
//   1. toneBase: gray or one channel, the trimmed region (the block's crop) or an explicit source
//      crop, invert, the minimum filter, the blur, then the cover fit of the region to the screen
//      size (the box over the cell) through the pinned Lanczos3, with the object position deciding
//      what the cover keeps; the fit is the slow step and runs once per source, trim, box and cell
//   2. the tone LUT: autocontrast at the deck's fixed 0.5 percent (from the base's histogram) then
//      black, white and gamma, with the adjustments' brightness and contrast folded in as the CSS
//      filter formulas on the 0 to 1 value
//   3. the threshold against the pattern: bayer8 (the deck's table), bayer4 ((m + 0.5) / 16),
//      blue64 (the pinned texture), random (a 32 bit hash of x, y and seed) or a halftone screen
//      (halftone-dot, halftone-line: a function of the cell under the screen angle, gslides-parity
//      SPEC-5 11); the two tone rule is the deck's (lit when the tone exceeds the threshold), three
//      tones and the posterised colours quantise with the same threshold so the two tone case stays
//      byte identical; the two error diffusion patterns (floyd-steinberg, atkinson) walk the tone
//      image serpentine and carry the residual instead of reading a threshold
//   4. polarity: auto is dark ground when the positive's lit fraction is under 0.5
//   5. paint: the theme's light and dark colours, titanium in the middle of three tones, or the
//      posterised colours; strength under 1 is the plane's alpha over the continuous picture
//
// With bayer8, tone two, cell 2 and strength 1 the stages are the deck's pipeline unchanged, so
// `ditherFrame` over a source with a recorded treatment lights the cells `twoTone` lights
// (dither.test.ts pins the agreement at 1.0 on the deck's sixteen treatments). Every stage runs on
// plain typed arrays with integer arithmetic, so the worker, the runtime and Node agree bit for bit.
import type {
  DitherChannel,
  DitherPattern,
  PictureDither,
  ResolvedDither,
} from '@turboslide/schema/blocks/dither';
import { DITHER_ANGLE, DITHER_PATTERNS_GS5, resolveDither } from '@turboslide/schema/blocks/dither';

import { BAYER8_THRESHOLDS } from './bayer.ts';
import { blue64Thresholds } from './blue64.ts';
import { gaussianBlur, minFilter, unsharpBand } from './filters.ts';
import type { UnsharpBand } from './filters.ts';
import type { BitImage, Box, Box4, GrayImage, RgbaImage } from './image.ts';
import { invertBits, litFraction } from './image.ts';
import { twoToneMetrics } from './metrics.ts';
import type { TwoToneMetrics } from './metrics.ts';
import { cropPadded, fitCover } from './resample.ts';
import { autocontrastLut, invertGray, toGray, toneLut } from './tone.ts';

export type DitherTheme = 'light' | 'dark';

/** The kept fractions of a picture's crop tool (`ShotTrim`): left, right, top, bottom. */
export type DitherTrim = { left: number; right: number; top: number; bottom: number };

/** The adjustments folded into the tone LUT (SPEC-3 10.2 stage 3): `block.adjust`'s two numbers. */
export type DitherAdjust = { brightness?: number; contrast?: number };

/** The colours a frame is painted in: the theme's tokens (packages/theme tokens.ts). */
export type DitherColors = {
  /** The light colour: paper in the light theme, ink in the dark theme. */
  light: [number, number, number];
  /** The dark colour: ink in the light theme, paper in the dark theme. */
  dark: [number, number, number];
  /** The middle tone of three tones: titanium. */
  middle: [number, number, number];
};

/** The theme's ink, paper and titanium (tokens.ts): light paper #ffffff ink #070707, dark paper #070707 ink #f2f2f0. */
export const DITHER_COLORS: Record<DitherTheme, DitherColors> = {
  light: { light: [255, 255, 255], dark: [7, 7, 7], middle: [138, 143, 152] },
  dark: { light: [242, 242, 240], dark: [7, 7, 7], middle: [138, 143, 152] },
};

/** The deck's fixed autocontrast cutoff, not a field (SPEC-3 10.1). */
export const DITHER_AUTOCONTRAST = 0.5;

/** The 4 by 4 Bayer matrix of pattern 'bayer4'. */
export const BAYER4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** The 16 thresholds of 'bayer4': trunc((m + 0.5) / 16 * 255), row major. */
export const BAYER4_THRESHOLDS: Uint8Array = (() => {
  const t = new Uint8Array(16);
  for (let r = 0; r < 4; r += 1)
    for (let c = 0; c < 4; c += 1)
      t[r * 4 + c] = Math.trunc((((BAYER4[r]?.[c] ?? 0) + 0.5) / 16) * 255);
  return t;
})();

/**
 * The 32 bit hash of pattern 'random' (x, y and the seed, murmur3's final mix), deterministic on
 * every host: `Math.imul` and unsigned shifts keep it in 32 bit integers.
 */
export function hash32(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 0x9e3779b1) ^
      Math.imul(y | 0, 0x85ebca77) ^
      Math.imul(seed | 0, 0xc2b2ae3d)) >>>
    0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The halftone screens' pitch in cells (gslides-parity SPEC-5 11; SPEC-3 17): eight cells, the
 * period of the deck's Bayer screen, so a dot or a line repeats every 8 by `cell` sheet px and the
 * block's `cell` scales the pitch as it scales every other pattern.
 */
export const HALFTONE_PITCH = 8;

/** The two error diffusion patterns, which run over the whole tone image rather than a cell at a time. */
export function isDiffusion(pattern: DitherPattern): boolean {
  return pattern === 'floyd-steinberg' || pattern === 'atkinson';
}

/** The two halftone screens, threshold functions of the cell's position under the screen angle. */
export function isHalftone(pattern: DitherPattern): boolean {
  return pattern === 'halftone-dot' || pattern === 'halftone-line';
}

/**
 * The halftone threshold of a cell (SPEC-5 11): the cell's centre rotated by the screen angle
 * into screen space, its position inside the pitch, and the normalised distance from the nearest
 * dot centre (`halftone-dot`, the dots grow from the centres as the tone brightens) or from the
 * nearest line (`halftone-line`) as the threshold, `trunc(d * 255)`. The rotation's cos and sin
 * are taken once per call from `Math.cos` and `Math.sin`; the crate's `dither.rs` takes them from
 * libm's fdlibm ports, the same lineage as V8's, and the parity test holds the two together.
 */
export function halftoneThreshold(
  pattern: 'halftone-dot' | 'halftone-line',
  x: number,
  y: number,
  angle: number = DITHER_ANGLE.default,
): number {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = x + 0.5;
  const cy = y + 0.5;
  const rx = cx * cos + cy * sin;
  const ry = -cx * sin + cy * cos;
  const v = ry / HALFTONE_PITCH - Math.floor(ry / HALFTONE_PITCH);
  if (pattern === 'halftone-line') {
    const d = Math.abs(v - 0.5) * 2;
    return Math.min(254, Math.trunc(d * 255));
  }
  const u = rx / HALFTONE_PITCH - Math.floor(rx / HALFTONE_PITCH);
  const d = Math.sqrt((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5)) / 0.7071067811865476;
  return Math.min(254, Math.trunc(d * 255));
}

/**
 * The integer threshold of a cell for an ordered pattern, 0 to 255: the deck's Bayer 8 table,
 * Bayer 4, the blue noise texture, the hashed random screen, or a halftone screen at the angle.
 * The two diffusion patterns have no per cell threshold (`isDiffusion`); a caller that asks for
 * one gets the deck's Bayer screen, the fallback the preview budget also takes.
 */
export function thresholdAt(
  pattern: DitherPattern,
  x: number,
  y: number,
  seed = 0,
  angle: number = DITHER_ANGLE.default,
): number {
  switch (pattern) {
    case 'bayer8':
      return BAYER8_THRESHOLDS[(((y % 8) + 8) % 8) * 8 + (((x % 8) + 8) % 8)] ?? 0;
    case 'bayer4':
      return BAYER4_THRESHOLDS[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] ?? 0;
    case 'blue64':
      return blue64Thresholds()[(((y % 64) + 64) % 64) * 64 + (((x % 64) + 64) % 64)] ?? 0;
    case 'random':
      return hash32(x, y, seed) >>> 24;
    case 'halftone-dot':
    case 'halftone-line':
      return halftoneThreshold(pattern, x, y, angle);
    case 'floyd-steinberg':
    case 'atkinson':
      return BAYER8_THRESHOLDS[(((y % 8) + 8) % 8) * 8 + (((x % 8) + 8) % 8)] ?? 0;
  }
}

/** A diffusion kernel: the neighbours an error reaches as [dx, dy, weight], over `denominator`. */
export type DiffusionKernel = {
  taps: ReadonlyArray<readonly [dx: number, dy: number, weight: number]>;
  denominator: number;
};

/** Floyd and Steinberg (1976): 7, 3, 5, 1 over 16. */
export const FLOYD_STEINBERG: DiffusionKernel = {
  taps: [
    [1, 0, 7],
    [-1, 1, 3],
    [0, 1, 5],
    [1, 1, 1],
  ],
  denominator: 16,
};

/** Atkinson (1984): six neighbours at 1 over 8 each, three quarters of the error carried. */
export const ATKINSON: DiffusionKernel = {
  taps: [
    [1, 0, 1],
    [2, 0, 1],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [0, 2, 1],
  ],
  denominator: 8,
};

export function diffusionKernel(pattern: DitherPattern): DiffusionKernel {
  return pattern === 'atkinson' ? ATKINSON : FLOYD_STEINBERG;
}

/**
 * Serpentine error diffusion of a tone image to N levels (SPEC-5 11): the rows walk left to right
 * and right to left in turn with the kernel mirrored on the way back, every value plus its carried
 * error is clamped to 0 to 255 and quantised to the nearest of the N levels
 * (`floor(v / 255 * (N - 1) + 0.5)`), and the residual travels to the neighbours by the kernel's
 * weights. Doubles throughout in one operation order, so `dither.rs` reproduces every cell. At
 * two levels the output is the positive (1 is lit).
 */
export function diffuseLevels(
  tone: GrayImage,
  kernel: DiffusionKernel,
  levels: number,
): Uint8Array {
  const { width, height, data } = tone;
  const out = new Uint8Array(width * height);
  const error = new Float64Array(width * height);
  const steps = levels - 1;
  for (let y = 0; y < height; y += 1) {
    const leftToRight = y % 2 === 0;
    const row = y * width;
    for (let i = 0; i < width; i += 1) {
      const x = leftToRight ? i : width - 1 - i;
      const at = row + x;
      let value = (data[at] ?? 0) + (error[at] ?? 0);
      if (value < 0) value = 0;
      else if (value > 255) value = 255;
      const level = Math.floor((value / 255) * steps + 0.5);
      out[at] = level;
      const target = (level * 255) / steps;
      const residual = value - target;
      for (const [dx, dy, weight] of kernel.taps) {
        const nx = x + (leftToRight ? dx : -dx);
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const index = ny * width + nx;
        error[index] = (error[index] ?? 0) + (residual * weight) / kernel.denominator;
      }
    }
  }
  return out;
}

/** The screen size in cells of a box: `w / cell` by `h / cell`, at least one cell each way (dither-key.ts ditherScreen). */
export function screenOf(width: number, height: number, cell: number): [number, number] {
  return [Math.max(1, Math.round(width / cell)), Math.max(1, Math.round(height / cell))];
}

/** The centering of ImageOps.fit for a picture's `position`: `top`, `bottom`, `center`, or a CSS object-position. */
export function centeringOf(position: string | undefined): [number, number] {
  if (position === undefined || position === 'center') return [0.5, 0.5];
  if (position === 'top') return [0.5, 0];
  if (position === 'bottom') return [0.5, 1];
  const parts = position.trim().split(/\s+/);
  const read = (part: string | undefined, fallback: number): number => {
    if (part === undefined) return fallback;
    if (part === 'left' || part === 'top') return 0;
    if (part === 'right' || part === 'bottom') return 1;
    if (part === 'center') return 0.5;
    const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (pct) return Math.min(1, Math.max(0, Number(pct[1]) / 100));
    return fallback;
  };
  return [read(parts[0], 0.5), read(parts[1], 0.5)];
}

/** The source crop of a trim, in source pixels, rounded as cropPadded rounds. */
export function cropOfTrim(width: number, height: number, trim: DitherTrim | undefined): Box4 {
  if (trim === undefined) return [0, 0, width, height];
  return [
    Math.round(width * trim.left),
    Math.round(height * trim.top),
    Math.round(width * (1 - trim.right)),
    Math.round(height * (1 - trim.bottom)),
  ];
}

/** What stage 1 depends on: the source, its region, the screen and the pre fit filters. */
export type ToneBaseSpec = {
  /** The screen size in cells. */
  screen: [number, number];
  /** The block's crop as kept fractions; ignored when `crop` names source pixels. */
  trim?: DitherTrim;
  /** A source crop in source pixels (the asset level treatment's `crop`), padded past the edges. */
  crop?: Box4;
  /** The picture's object position; the centering of the cover fit. */
  position?: string;
  channel: DitherChannel;
  invert: boolean;
  minFilter: number;
  blur: number;
  /** The asset level treatment's unsharp band, for the parity of a recorded twin; never a block field. */
  unsharp?: UnsharpBand;
  /** Keep the fitted colour channels too (tone 'original' and the composite of a strength under 1). */
  color?: boolean;
};

/** Stage 1's result, cached per source, region and screen (SPEC-3 10.2 `toneBase`). */
export type ToneBase = {
  screen: [number, number];
  /** The gray after the pre fit filters and the cover fit, before autocontrast. */
  gray: GrayImage;
  /** The autocontrast LUT of `gray` at the deck's cutoff. */
  autocontrast: Uint8Array;
  /** The fitted colour channels, present when the spec asked for them. */
  color?: { r: GrayImage; g: GrayImage; b: GrayImage };
};

/** The base spec of a dither over a picture at a box (the block's fields, the box, the trim and position). */
export function baseSpecOf(
  dither: PictureDither,
  box: { width: number; height: number },
  options: { trim?: DitherTrim; position?: string; color?: boolean } = {},
): ToneBaseSpec {
  const resolved = resolveDither(dither);
  return {
    screen: screenOf(box.width, box.height, resolved.cell),
    ...(options.trim !== undefined ? { trim: options.trim } : {}),
    ...(options.position !== undefined ? { position: options.position } : {}),
    channel: resolved.channel,
    invert: resolved.invert,
    minFilter: resolved.minFilter,
    blur: resolved.blur,
    color: options.color ?? (resolved.tone === 'original' || resolved.strength < 1),
  };
}

/** A stable string of a base spec, the cache key of a prepared base in the worker and the runtime. */
export function baseSpecKey(spec: ToneBaseSpec): string {
  return JSON.stringify([
    spec.screen,
    spec.trim ?? null,
    spec.crop ?? null,
    spec.position ?? 'center',
    spec.channel,
    spec.invert,
    spec.minFilter,
    spec.blur,
    spec.unsharp ?? null,
    spec.color === true,
  ]);
}

/** Stage 1: the source's region through the pre fit filters and the cover fit to the screen. */
export function prepareToneBase(source: RgbaImage, spec: ToneBaseSpec): ToneBase {
  const [w, h] = spec.screen;
  const crop = spec.crop ?? cropOfTrim(source.width, source.height, spec.trim);
  const centering = centeringOf(spec.position);
  let gray = toGray(source, spec.channel);
  gray = cropPadded(gray, crop);
  if (spec.invert) gray = invertGray(gray);
  if (spec.minFilter > 0) gray = minFilter(gray, spec.minFilter);
  if (spec.blur > 0) gray = gaussianBlur(gray, spec.blur);
  gray = fitCover(gray, w, h, centering);
  if (spec.unsharp !== undefined) gray = unsharpBand(gray, spec.unsharp);
  const base: ToneBase = {
    screen: [w, h],
    gray,
    autocontrast: autocontrastLut(gray, DITHER_AUTOCONTRAST),
  };
  if (spec.color === true) {
    const channel = (name: 'r' | 'g' | 'b'): GrayImage =>
      fitCover(cropPadded(toGray(source, name), crop), w, h, centering);
    base.color = { r: channel('r'), g: channel('g'), b: channel('b') };
  }
  return base;
}

/**
 * The adjustments' LUT (SPEC-3 10.2 stage 3): the CSS filter formulas on the 0 to 1 value,
 * gray' = clamp(((gray * (1 + brightness)) - 0.5) * (1 + contrast) + 0.5), rounded to the nearest
 * integer; the identity when both are 0 or absent.
 */
export function adjustLut(adjust: DitherAdjust | undefined): Uint8Array | null {
  const brightness = adjust?.brightness ?? 0;
  const contrast = adjust?.contrast ?? 0;
  if (brightness === 0 && contrast === 0) return null;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    const g = (v / 255) * (1 + brightness);
    const c = (g - 0.5) * (1 + contrast) + 0.5;
    lut[v] = Math.round(Math.min(1, Math.max(0, c)) * 255);
  }
  return lut;
}

/** Stage 2: one LUT from the base's autocontrast, the tone points and the adjustments. */
export function toneLutOf(
  base: ToneBase,
  dither: ResolvedDither,
  adjust?: DitherAdjust,
): Uint8Array {
  const tone = toneLut(dither.black, dither.white, dither.gamma);
  const adjusted = adjustLut(adjust);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    const t = tone[base.autocontrast[v] ?? 0] ?? 0;
    lut[v] = adjusted === null ? t : (adjusted[t] ?? 0);
  }
  return lut;
}

/** The tone image of a base under a LUT. */
export function toneOf(base: ToneBase, lut: Uint8Array): GrayImage {
  const out = new Uint8Array(base.gray.data.length);
  const data = base.gray.data;
  for (let i = 0; i < out.length; i += 1) out[i] = lut[data[i] ?? 0] ?? 0;
  return { width: base.gray.width, height: base.gray.height, data: out };
}

/** Stage 3 for two tones: the deck's rule, a cell is lit when its tone exceeds the threshold. */
export function positiveOf(tone: GrayImage, dither: ResolvedDither): BitImage {
  const { width, height, data } = tone;
  if (isDiffusion(dither.pattern))
    return { width, height, bits: diffuseLevels(tone, diffusionKernel(dither.pattern), 2) };
  const bits = new Uint8Array(width * height);
  const angle = dither.angle ?? DITHER_ANGLE.default;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const t = thresholdAt(dither.pattern, x, y, dither.seed, angle);
      bits[row + x] = (data[row + x] ?? 0) > t ? 1 : 0;
    }
  }
  return { width, height, bits };
}

/**
 * Stage 3 for N levels: the ordered quantiser `min(N - 1, floor((v * (N - 1) + 254 - T) / 255))`,
 * which at N = 2 is the two tone rule (level 1 exactly when v > T), so three tones and the
 * posterised colours share the two tone screen's cells.
 */
export function quantise(value: number, threshold: number, levels: number): number {
  const q = Math.floor((value * (levels - 1) + 254 - threshold) / 255);
  return q < 0 ? 0 : q > levels - 1 ? levels - 1 : q;
}

/** The levels of a gray image under a pattern, one byte per cell, 0 to levels minus 1. */
export function levelsOf(tone: GrayImage, dither: ResolvedDither, levels: number): Uint8Array {
  const { width, height, data } = tone;
  if (isDiffusion(dither.pattern))
    return diffuseLevels(tone, diffusionKernel(dither.pattern), levels);
  const out = new Uint8Array(width * height);
  const angle = dither.angle ?? DITHER_ANGLE.default;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const t = thresholdAt(dither.pattern, x, y, dither.seed, angle);
      out[row + x] = quantise(data[row + x] ?? 0, t, levels);
    }
  }
  return out;
}

export type ResolvedPolarity = 'dark-ground' | 'light-ground';

/** Stage 4: auto is dark ground when the positive's lit fraction is under 0.5 (the deck's rule made mechanical). */
export function polarityOf(positive: BitImage, dither: ResolvedDither): ResolvedPolarity {
  if (dither.polarity === 'dark-ground' || dither.polarity === 'light-ground')
    return dither.polarity;
  return litFraction(positive) < 0.5 ? 'dark-ground' : 'light-ground';
}

/**
 * The twin a theme shows for a polarity: the positive on the ground it was picked for, the
 * inverse on the other theme (twoTone's rule: dark-ground puts the positive in the dark twin).
 * With polarity `same` both themes show the positive's own side.
 */
export function positiveShows(
  polarity: ResolvedPolarity,
  theme: DitherTheme,
  same: boolean,
): boolean {
  if (same) return true;
  return polarity === 'dark-ground' ? theme === 'dark' : theme === 'light';
}

/** The theme a `same` variant is painted for: the positive's own ground. */
export function sameThemeOf(polarity: ResolvedPolarity): DitherTheme {
  return polarity === 'dark-ground' ? 'dark' : 'light';
}

export type DitherCells =
  | { kind: 'two'; positive: BitImage; polarity: ResolvedPolarity }
  | { kind: 'three'; levels: Uint8Array; positive: BitImage; polarity: ResolvedPolarity }
  | {
      kind: 'original';
      r: Uint8Array;
      g: Uint8Array;
      b: Uint8Array;
      steps: number;
      positive: BitImage;
      polarity: ResolvedPolarity;
    };

/** Stages 2 to 4 over a prepared base: the cells before paint, per theme independent. */
export function ditherCells(
  base: ToneBase,
  dither: PictureDither,
  adjust?: DitherAdjust,
): DitherCells {
  const resolved = resolveDither(dither);
  const lut = toneLutOf(base, resolved, adjust);
  const tone = toneOf(base, lut);
  const positive = positiveOf(tone, resolved);
  const polarity = polarityOf(positive, resolved);
  if (resolved.tone === 'three')
    return { kind: 'three', levels: levelsOf(tone, resolved, 3), positive, polarity };
  if (resolved.tone === 'original') {
    const color = base.color ?? {
      r: base.gray,
      g: base.gray,
      b: base.gray,
    };
    const quantised = (channel: GrayImage): Uint8Array =>
      levelsOf(applyAdjust(channel, lut), resolved, resolved.steps);
    return {
      kind: 'original',
      r: quantised(color.r),
      g: quantised(color.g),
      b: quantised(color.b),
      steps: resolved.steps,
      positive,
      polarity,
    };
  }
  return { kind: 'two', positive, polarity };
}

/** A colour channel through the tone LUT (the same autocontrast, points and adjustments as the gray). */
function applyAdjust(channel: GrayImage, lut: Uint8Array): GrayImage {
  const out = new Uint8Array(channel.data.length);
  for (let i = 0; i < out.length; i += 1) out[i] = lut[channel.data[i] ?? 0] ?? 0;
  return { width: channel.width, height: channel.height, data: out };
}

/** The alpha of the painted plane: round(strength * 255); 255 at strength 1. */
export function planeAlpha(strength: number): number {
  return Math.round(Math.min(1, Math.max(0, strength)) * 255);
}

/**
 * Stage 5: the plane at cell resolution (one pixel per cell; the canvas or the nearest upscale
 * gives every cell its `cell` sheet pixels), painted in the theme's colours with the plane's
 * alpha. `neutral` says the frame is the same in both themes (polarity `same`, tone `original`).
 */
export function paintPlane(
  cells: DitherCells,
  dither: PictureDither,
  theme: DitherTheme,
): { plane: RgbaImage; neutral: boolean } {
  const resolved = resolveDither(dither);
  const { width, height } = cells.positive;
  const alpha = planeAlpha(resolved.strength);
  const data = new Uint8Array(width * height * 4);
  const same = resolved.polarity === 'same' || cells.kind === 'original';
  const paintTheme = same && cells.kind !== 'original' ? sameThemeOf(cells.polarity) : theme;
  const colors = DITHER_COLORS[paintTheme];
  const positiveSide = positiveShows(cells.polarity, paintTheme, same);
  const put = (i: number, rgb: readonly [number, number, number]) => {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = alpha;
  };
  const n = width * height;
  if (cells.kind === 'two') {
    for (let i = 0; i < n; i += 1) {
      const lit = (cells.positive.bits[i] === 1) === positiveSide;
      put(i, lit ? colors.light : colors.dark);
    }
  } else if (cells.kind === 'three') {
    for (let i = 0; i < n; i += 1) {
      const level = cells.levels[i] ?? 0;
      const shown = positiveSide ? level : 2 - level;
      put(i, shown === 0 ? colors.dark : shown === 1 ? colors.middle : colors.light);
    }
  } else {
    const scale = 255 / (cells.steps - 1);
    for (let i = 0; i < n; i += 1) {
      put(i, [
        Math.round((cells.r[i] ?? 0) * scale),
        Math.round((cells.g[i] ?? 0) * scale),
        Math.round((cells.b[i] ?? 0) * scale),
      ]);
    }
  }
  return { plane: { width, height, data }, neutral: same };
}

/** Nearest upscale of an RGBA image by an integer factor: every cell becomes a k by k square. */
export function scaleNearestRgba(image: RgbaImage, k: number): RgbaImage {
  const f = Math.max(1, Math.round(k));
  if (f === 1) return image;
  const width = image.width * f;
  const height = image.height * f;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcRow = Math.floor(y / f) * image.width;
    const outRow = y * width;
    for (let x = 0; x < width; x += 1) {
      const s = (srcRow + Math.floor(x / f)) * 4;
      const d = (outRow + x) * 4;
      out[d] = image.data[s] ?? 0;
      out[d + 1] = image.data[s + 1] ?? 0;
      out[d + 2] = image.data[s + 2] ?? 0;
      out[d + 3] = image.data[s + 3] ?? 0;
    }
  }
  return { width, height, data: out };
}

/**
 * The live preview's budget per frame in milliseconds (gslides-parity SPEC-5 11; SPEC-3 10.10):
 * a round five family (`DITHER_PATTERNS_GS5`) whose stages 2 to 5 ran over it on this host, at
 * this screen size or a larger one, draws as the deck's Bayer screen in later preview frames and
 * the frame says so in `fallback`; a file (`ditherPicture` without `preview`) never falls back.
 * `setDitherPreviewBudget` pins another number (0 forces the fallback, a test's use).
 */
export const DITHER_PREVIEW_BUDGET_MS = 100;

let previewBudgetMs = DITHER_PREVIEW_BUDGET_MS;
/** Per pattern, the smallest screen area (cells) a frame ran over the budget at. */
const overBudget = new Map<DitherPattern, number>();

export function setDitherPreviewBudget(ms: number): void {
  previewBudgetMs = ms;
  overBudget.clear();
}

export function ditherPreviewBudget(): number {
  return previewBudgetMs;
}

/** Whether a preview of a pattern at a screen falls back to Bayer (a slower frame was measured at this size or under). */
export function previewFallsBack(pattern: DitherPattern, screen: [number, number]): boolean {
  if (!DITHER_PATTERNS_GS5.includes(pattern)) return false;
  const area = overBudget.get(pattern);
  return area !== undefined && screen[0] * screen[1] >= area;
}

function recordFrameTime(pattern: DitherPattern, screen: [number, number], ms: number): void {
  if (!DITHER_PATTERNS_GS5.includes(pattern) || ms <= previewBudgetMs) return;
  const area = screen[0] * screen[1];
  const known = overBudget.get(pattern);
  if (known === undefined || area < known) overBudget.set(pattern, area);
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export type DitherFrame = {
  /** The screen in cells. */
  screen: [number, number];
  /** The pattern drawn: the field's, or `bayer8` when a preview fell back to it (SPEC-5 11). */
  pattern: DitherPattern;
  /** Present when a preview drew the deck's Bayer screen in place of a family over the budget. */
  fallback?: 'bayer8';
  /** Stages 2 to 5 in milliseconds on this host. */
  ms: number;
  cell: number;
  theme: DitherTheme;
  /** One pixel per cell, alpha the strength; drawn on the overlay canvas or upscaled for a file. */
  plane: RgbaImage;
  /** The frame is the same in both themes (polarity `same`, tone `original`). */
  neutral: boolean;
  polarity: ResolvedPolarity;
  /** The dark twin's metrics: lit fraction, the plate clearance when a plate box is given, the warnings. */
  metrics: TwoToneMetrics;
  /** The positive's cells, for callers that encode a one bit file. */
  cells: DitherCells;
};

/** The bits a theme shows for two tone cells: the positive on its ground, the inverse elsewhere. */
export function twinBits(cells: DitherCells, theme: DitherTheme, same: boolean): BitImage {
  return positiveShows(cells.polarity, theme, same) ? cells.positive : invertBits(cells.positive);
}

/** Stages 2 to 5 over a prepared base, for one theme (the per slider work of the live preview). */
export function ditherFrame(
  base: ToneBase,
  dither: PictureDither,
  theme: DitherTheme,
  options: { adjust?: DitherAdjust; plate?: Box; preview?: boolean } = {},
): DitherFrame {
  const started = now();
  const wanted = resolveDither(dither);
  const fallsBack = options.preview === true && previewFallsBack(wanted.pattern, base.screen);
  const drawn: PictureDither = fallsBack ? { ...dither, pattern: 'bayer8' } : dither;
  const resolved = fallsBack ? resolveDither(drawn) : wanted;
  const cells = ditherCells(base, drawn, options.adjust);
  const { plane, neutral } = paintPlane(cells, drawn, theme);
  // the metrics read the dark twin as the deck's did: the positive on a dark ground, else its inverse
  const darkBits = twinBits(cells, 'dark', resolved.polarity === 'same');
  const metrics = twoToneMetrics(darkBits, options.plate, resolved.cell);
  const ms = now() - started;
  if (!fallsBack) recordFrameTime(wanted.pattern, base.screen, ms);
  return {
    screen: base.screen,
    pattern: resolved.pattern,
    ...(fallsBack ? { fallback: 'bayer8' as const } : {}),
    ms,
    cell: resolved.cell,
    theme,
    plane,
    neutral,
    polarity: cells.polarity,
    metrics,
    cells,
  };
}

export type DitherPictureOptions = {
  trim?: DitherTrim;
  position?: string;
  adjust?: DitherAdjust;
  plate?: Box;
  /** A source crop in source pixels instead of the trim (the asset level treatment's crop). */
  crop?: Box4;
  unsharp?: UnsharpBand;
};

/**
 * The whole pipeline for one picture and one theme (SPEC-3 10.2 `ditherPicture`): the source, the
 * box in sheet pixels, the field, the theme, and the block's trim, position and adjustments.
 */
export function ditherPicture(
  source: RgbaImage,
  box: { width: number; height: number },
  dither: PictureDither,
  theme: DitherTheme,
  options: DitherPictureOptions = {},
): DitherFrame {
  const spec = baseSpecOf(dither, box, {
    ...(options.trim !== undefined ? { trim: options.trim } : {}),
    ...(options.position !== undefined ? { position: options.position } : {}),
  });
  if (options.crop !== undefined) spec.crop = options.crop;
  if (options.unsharp !== undefined) spec.unsharp = options.unsharp;
  const base = prepareToneBase(source, spec);
  return ditherFrame(base, dither, theme, {
    ...(options.adjust !== undefined ? { adjust: options.adjust } : {}),
    ...(options.plate !== undefined ? { plate: options.plate } : {}),
  });
}

/** The lit fraction of the positive, the number the Format options metrics line reads. */
export function litFractionOf(frame: DitherFrame): number {
  return litFraction(frame.cells.positive);
}
