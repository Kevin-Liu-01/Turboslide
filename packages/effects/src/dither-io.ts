// The dither's Node half (gslides-parity SPEC-3 10.4; research-3 06 4.5, 4.6): the variant files a
// `picture.materialize` writes and the exporter reads, from the pure stages of dither.ts and the
// encoders at the package boundary. A two tone plane at full strength is a 1-bit palette PNG with
// the theme's exact light and dark colours (png1.ts, about 4 KB at cell 2); three tones, the
// posterised colours and a strength under 1 are RGBA PNGs through libvips, the last composited
// over the continuous source resized to the file's pixels so the file shows what the live canvas
// shows over the picture. The file's pixels are the screen's cells times `cell * scale`, so a 2x
// export gets crisp 4 by 4 device pixel cells at cell 2 (twoToneAtScale's rule). This module
// imports sharp and stays out of the browser; dither.ts is the shared part.
import sharp from 'sharp';

import type { PictureDither } from '@turboslide/schema/blocks/dither-values';
import { resolveDither } from '@turboslide/schema/blocks/dither-values';

import {
  DITHER_COLORS,
  baseSpecOf,
  ditherFrame,
  prepareToneBase,
  scaleNearestRgba,
  sameThemeOf,
  twinBits,
} from './dither.ts';
import type { DitherAdjust, DitherFrame, DitherTheme, DitherTrim, ToneBase } from './dither.ts';
import type { Box, RgbaImage } from './image.ts';
import type { TwoToneMetrics } from './metrics.ts';
import { encodePng1 } from './png1.ts';
import { scaleNearest } from './resample.ts';

export type VariantScale = 1 | 2;

export type VariantRenderInput = {
  /** The continuous source: a path or the decoded bytes. */
  source: string | Uint8Array;
  /** The picture's box in sheet pixels. */
  box: { width: number; height: number };
  dither: PictureDither;
  /** Device pixels per sheet pixel of the file; 2 unless set (the export's raster scale). */
  scale?: VariantScale;
  trim?: DitherTrim;
  position?: string;
  adjust?: DitherAdjust;
  /** The plate box to measure clearance against, in sheet pixels, when a plate group sits over the picture. */
  plate?: Box;
};

export type VariantFile = {
  /** The theme the file serves; `neutral` when one file serves both. */
  theme: DitherTheme | 'neutral';
  bytes: Uint8Array;
  /** File pixels. */
  width: number;
  height: number;
  /** `png-1bit` for a two tone plane at full strength, else `png-rgba`. */
  format: 'png-1bit' | 'png-rgba';
};

export type VariantRender = {
  files: VariantFile[];
  /** One neutral file serves both themes (polarity `same`, tone `original`). */
  neutral: boolean;
  /** The sheet pixels the file covers: the screen times the cell. */
  size: [number, number];
  scale: VariantScale;
  metrics: TwoToneMetrics;
  polarity: 'dark-ground' | 'light-ground';
  ms: number;
};

/** A PNG or JPEG path or buffer to RGBA (io.ts decodeImage, repeated here so io.ts can re-export this module). */
async function decodeRgba(input: string | Uint8Array): Promise<RgbaImage> {
  const { data, info } = await sharp(typeof input === 'string' ? input : Buffer.from(input))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/** The variant's sheet pixel size: every cell its `cell` sheet pixels. */
export function variantSize(frame: DitherFrame): [number, number] {
  return [frame.screen[0] * frame.cell, frame.screen[1] * frame.cell];
}

/** True when the frame is a two tone plane at full strength: the one bit encoder's case. */
export function isOneBit(dither: PictureDither): boolean {
  const resolved = resolveDither(dither);
  return resolved.tone === 'two' && resolved.strength >= 1;
}

/** The 1-bit palette PNG of a two tone frame at `cell * scale` pixels per cell. */
export function encodeOneBit(
  frame: DitherFrame,
  theme: DitherTheme,
  scale: VariantScale,
): VariantFile {
  const same = frame.neutral;
  const bits = twinBits(frame.cells, theme, same);
  const scaled = scaleNearest(bits, frame.cell * scale);
  const colors = DITHER_COLORS[theme];
  const bytes = encodePng1(scaled, { palette: [colors.dark, colors.light], level: 9 });
  return {
    theme: same ? 'neutral' : theme,
    bytes,
    width: scaled.width,
    height: scaled.height,
    format: 'png-1bit',
  };
}

function rawInput(image: RgbaImage): sharp.Sharp {
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
}

/**
 * The RGBA PNG of a frame at `cell * scale` pixels per cell; a plane under full alpha is
 * composited over the continuous source resized to the same pixels, so the file shows the plane
 * over the picture as the canvas does.
 */
export async function encodeRgba(
  frame: DitherFrame,
  theme: DitherTheme,
  scale: VariantScale,
  continuous: sharp.Sharp | null,
): Promise<VariantFile> {
  const plane = scaleNearestRgba(frame.plane, frame.cell * scale);
  const alpha = frame.plane.data[3] ?? 255;
  let image: sharp.Sharp;
  if (alpha < 255 && continuous !== null) {
    const under = await continuous
      .clone()
      .resize(plane.width, plane.height, { fit: 'cover', position: 'centre' })
      .removeAlpha()
      .raw()
      .toBuffer();
    image = sharp(under, {
      raw: { width: plane.width, height: plane.height, channels: 3 },
    }).composite([
      {
        input: Buffer.from(plane.data.buffer, plane.data.byteOffset, plane.data.byteLength),
        raw: { width: plane.width, height: plane.height, channels: 4 },
        blend: 'over',
      },
    ]);
  } else {
    image = rawInput(plane).removeAlpha();
  }
  const out = await image.png({ palette: false, compressionLevel: 9 }).toBuffer();
  return {
    theme: frame.neutral ? 'neutral' : theme,
    bytes: new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
    width: plane.width,
    height: plane.height,
    format: 'png-rgba',
  };
}

/** The frames of both themes over one base, or the one neutral frame. */
export function framesOf(
  base: ToneBase,
  dither: PictureDither,
  options: { adjust?: DitherAdjust; plate?: Box } = {},
): DitherFrame[] {
  const dark = ditherFrame(base, dither, 'dark', options);
  if (dark.neutral) return [dark];
  return [ditherFrame(base, dither, 'light', options), dark];
}

/**
 * The variant files of one dithered picture (SPEC-3 10.4): decode the source, prepare the base,
 * one frame per theme (one for a neutral variant), each encoded by the rule above.
 */
export async function renderVariant(input: VariantRenderInput): Promise<VariantRender> {
  const t0 = performance.now();
  const scale = input.scale ?? 2;
  const source = await decodeRgba(input.source);
  const spec = baseSpecOf(input.dither, input.box, {
    ...(input.trim !== undefined ? { trim: input.trim } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  });
  const base = prepareToneBase(source, spec);
  const frames = framesOf(base, input.dither, {
    ...(input.adjust !== undefined ? { adjust: input.adjust } : {}),
    ...(input.plate !== undefined ? { plate: input.plate } : {}),
  });
  const first = frames[0];
  if (first === undefined) throw new RangeError('renderVariant: no frame');
  const oneBit = isOneBit(input.dither);
  const continuous = oneBit
    ? null
    : sharp(typeof input.source === 'string' ? input.source : Buffer.from(input.source));
  const files: VariantFile[] = [];
  for (const frame of frames) {
    const theme: DitherTheme = frame.neutral ? sameThemeOf(frame.polarity) : frame.theme;
    files.push(
      oneBit
        ? encodeOneBit(frame, theme, scale)
        : await encodeRgba(frame, theme, scale, continuous),
    );
  }
  return {
    files,
    neutral: first.neutral,
    size: variantSize(first),
    scale,
    metrics: first.metrics,
    polarity: first.polarity,
    ms: Math.round(performance.now() - t0),
  };
}
