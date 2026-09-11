// The page raster policy of the flatten (perfect) mode (docs/pptx.md "The raster policy"): every
// flatten page is the 2x sheet shot, and the shot travels in the smallest encoding that decodes to
// the same pixels within budget. A page with two colors is a 1-bit palette PNG (the effects
// encoder, no quantizer); a page whose colors fit 256 entries, or quantize to 256 within 1 percent
// mismatch at pixelmatch threshold 0.1, is an 8-bit palette PNG; a page that carries a
// continuous-tone block (a screenshot, a photograph, a shader frame) may travel as a JPEG at
// quality 92 with 4:4:4 chroma when the decoded JPEG stays within 0.5 percent and is smaller than
// the PNG; everything else is a truecolor PNG (24-bit when the shot is opaque, 32-bit otherwise).
// Every candidate is decoded again and diffed against the shot, so the report's `page.fraction` is
// a measurement and `perfect` is the claim that every page stays under 0.1 percent. Measured on
// the deck's kept test pages (2026-09-11, sharp 0.35.0, libvips quantizer): a text page of 662
// colors quantizes with 0 mismatched pixels at 89 KB against 191 KB truecolor; a screenshot page
// of 38,808 colors quantizes at 0.0014 percent (371 KB against 873 KB) and JPEGs at 0 percent
// (467 KB); a two-tone opener with a plate (449 colors) is 44 KB as a palette PNG and 1.08 MB as a
// JPEG, which is why a dither never takes the JPEG path.
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

import type { BitImage, RgbaImage } from '@turboslide/effects/image';
import { decodeImage } from '@turboslide/effects/io';
import { encodePng1 } from '@turboslide/effects/png1';
import type { PageRasterFormat } from '@turboslide/schema/export';
import { PAGE_RASTER_BUDGETS } from '@turboslide/schema/export';

export const JPEG_QUALITY = 92;
export const PALETTE_SIZE = 256;
/** Past this many distinct colors a page counts as continuous tone for the JPEG candidate. */
export const CONTINUOUS_TONE_MIN_COLORS = 4096;
/** The zlib level of every PNG the policy writes; the page is written once and read many times. */
export const PNG_COMPRESSION_LEVEL = 9;

export type PageRasterCandidate = {
  format: PageRasterFormat;
  bytes: number;
  mismatch: number;
  fraction: number;
  ms: number;
  accepted: boolean;
  reason?: string;
};

export type PageRaster = {
  format: PageRasterFormat;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  colors: number;
  mismatch: number;
  fraction: number;
  /** Every encoding tried, in order, for the report and the log. */
  candidates: PageRasterCandidate[];
};

export type PageRasterOptions = {
  /** The page carries a block whose pixels are continuous tone (CONTINUOUS_TONE_BLOCK_TYPES). */
  continuousTone: boolean;
  threshold?: number;
  paletteBudget?: number;
  jpegBudget?: number;
  /** Skip the JPEG candidate even on a continuous-tone page (a deterministic PNG-only export). */
  noJpeg?: boolean;
};

export type ColorCount = {
  /** Distinct opaque colors, exact up to `limit`, `limit` when more were seen. */
  count: number;
  /** True when every pixel has alpha 255. */
  opaque: boolean;
  /** The first two distinct colors as packed 0xRRGGBB, for the two-color encoder. */
  first: number;
  second?: number;
};

/**
 * Counts distinct RGB values with a 2 MB bitmap over the 24-bit color space, exact until `limit`
 * distinct values have been seen (the policy needs "two", "at most 256" and "more than 4096").
 */
export function countColors(image: RgbaImage, limit = CONTINUOUS_TONE_MIN_COLORS + 1): ColorCount {
  const seen = new Uint8Array(1 << 21);
  const d = image.data;
  let count = 0;
  let opaque = true;
  let first = -1;
  let second: number | undefined;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 255) !== 255) opaque = false;
    const c = ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0);
    const byte = c >> 3;
    const bit = 1 << (c & 7);
    if ((seen[byte] ?? 0) & bit) continue;
    seen[byte] = (seen[byte] ?? 0) | bit;
    count += 1;
    if (first < 0) first = c;
    else if (second === undefined) second = c;
    if (count >= limit) {
      // the rest of the scan only settles opacity
      for (let j = i + 4; j < d.length; j += 4) {
        if ((d[j + 3] ?? 255) !== 255) {
          opaque = false;
          break;
        }
      }
      break;
    }
  }
  return {
    count,
    opaque,
    first: first < 0 ? 0 : first,
    ...(second === undefined ? {} : { second }),
  };
}

/** The pixels equal to `lit` as a one-bit image (1 for lit); every other pixel is 0. */
export function bitsOfColor(image: RgbaImage, lit: number): BitImage {
  const d = image.data;
  const bits = new Uint8Array(image.width * image.height);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const c = ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0);
    bits[p] = c === lit ? 1 : 0;
  }
  return { width: image.width, height: image.height, bits };
}

export function rgbOfPacked(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/** pixelmatch between the shot and a decoded candidate; the sizes must agree. */
export function rasterMismatch(
  source: RgbaImage,
  decoded: RgbaImage,
  threshold: number = PAGE_RASTER_BUDGETS.threshold,
): { mismatch: number; fraction: number } {
  if (source.width !== decoded.width || source.height !== decoded.height)
    throw new RangeError(
      `page raster: decoded ${decoded.width}x${decoded.height}, source ${source.width}x${source.height}`,
    );
  const total = source.width * source.height;
  const mismatch = pixelmatch(source.data, decoded.data, undefined, source.width, source.height, {
    threshold,
  });
  return { mismatch, fraction: total === 0 ? 0 : mismatch / total };
}

function rawInput(image: RgbaImage): sharp.Sharp {
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
}

async function encodePalette(image: RgbaImage): Promise<Uint8Array> {
  const out = await rawInput(image)
    .png({
      palette: true,
      colours: PALETTE_SIZE,
      dither: 0,
      effort: 7,
      compressionLevel: PNG_COMPRESSION_LEVEL,
    })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

async function encodeTruecolor(image: RgbaImage, opaque: boolean): Promise<Uint8Array> {
  const input = opaque ? rawInput(image).removeAlpha() : rawInput(image);
  const out = await input
    .png({ palette: false, compressionLevel: PNG_COMPRESSION_LEVEL })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

async function encodeJpeg(image: RgbaImage): Promise<Uint8Array> {
  const out = await rawInput(image)
    .removeAlpha()
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export function mimeOfFormat(format: PageRasterFormat): 'image/png' | 'image/jpeg' {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

/**
 * Encodes one sheet shot under the policy. The candidates run in order: 1-bit when the page has
 * two colors; palette; JPEG on a continuous-tone page with more than CONTINUOUS_TONE_MIN_COLORS
 * colors; truecolor as the fallback that always matches. The accepted candidate is the smallest
 * one within its budget; a JPEG is taken only when it is also smaller than the accepted PNG.
 */
export async function encodePageRaster(
  source: RgbaImage,
  options: PageRasterOptions,
): Promise<PageRaster> {
  const threshold = options.threshold ?? PAGE_RASTER_BUDGETS.threshold;
  const paletteBudget = options.paletteBudget ?? PAGE_RASTER_BUDGETS.palette;
  const jpegBudget = options.jpegBudget ?? PAGE_RASTER_BUDGETS.jpeg;
  const colors = countColors(source);
  const candidates: (PageRasterCandidate & { data?: Uint8Array })[] = [];
  const total = source.width * source.height;

  const measure = async (
    format: PageRasterFormat,
    bytes: Uint8Array,
    t0: number,
    exact = false,
  ): Promise<PageRasterCandidate & { data: Uint8Array }> => {
    const diff = exact
      ? { mismatch: 0, fraction: 0 }
      : rasterMismatch(source, await decodeImage(bytes), threshold);
    return {
      format,
      bytes: bytes.byteLength,
      mismatch: diff.mismatch,
      fraction: diff.fraction,
      ms: Math.round(performance.now() - t0),
      accepted: false,
      data: bytes,
    };
  };

  let chosen: (PageRasterCandidate & { data: Uint8Array }) | undefined;

  if (colors.opaque && colors.count <= 2 && total > 0) {
    const t0 = performance.now();
    const lit = colors.second ?? colors.first;
    const png = encodePng1(bitsOfColor(source, lit), {
      palette: [rgbOfPacked(colors.first), rgbOfPacked(lit)],
      level: PNG_COMPRESSION_LEVEL,
    });
    // the encoder writes the two exact colors, so the decode is the source by construction
    chosen = { ...(await measure('png-1bit', png, t0, true)), accepted: true };
    candidates.push(chosen);
  }

  if (!chosen) {
    const t0 = performance.now();
    const palette = await measure('png-palette', await encodePalette(source), t0);
    if (palette.fraction <= paletteBudget) {
      chosen = { ...palette, accepted: true };
      candidates.push(chosen);
    } else {
      candidates.push({
        ...palette,
        reason: `over the ${paletteBudget * 100} percent palette budget`,
      });
    }
  }

  if (
    !options.noJpeg &&
    options.continuousTone &&
    colors.opaque &&
    colors.count > CONTINUOUS_TONE_MIN_COLORS
  ) {
    const t0 = performance.now();
    const jpeg = await measure('jpeg', await encodeJpeg(source), t0);
    if (jpeg.fraction > jpegBudget) {
      candidates.push({ ...jpeg, reason: `over the ${jpegBudget * 100} percent JPEG budget` });
    } else if (chosen && jpeg.bytes >= chosen.bytes) {
      candidates.push({ ...jpeg, reason: 'not smaller than the PNG' });
    } else {
      if (chosen) chosen.accepted = false;
      chosen = { ...jpeg, accepted: true };
      candidates.push(chosen);
    }
  }
  // a continuous-tone block that paints few colors (a small or flat shot) stays a PNG

  if (!chosen) {
    const t0 = performance.now();
    chosen = {
      ...(await measure('png-rgba', await encodeTruecolor(source, colors.opaque), t0)),
      accepted: true,
    };
    candidates.push(chosen);
  }

  return {
    format: chosen.format,
    mime: mimeOfFormat(chosen.format),
    bytes: chosen.data,
    colors: colors.count,
    mismatch: chosen.mismatch,
    fraction: chosen.fraction,
    candidates: candidates.map(({ data: _data, ...rest }) => rest),
  };
}

/** `N png-palette, M jpeg` in a fixed format order, for the report and the card. */
export function describeFormats(pages: readonly { format: PageRasterFormat }[]): string {
  const order: PageRasterFormat[] = ['png-1bit', 'png-palette', 'jpeg', 'png-rgba'];
  const counts = new Map<PageRasterFormat, number>();
  for (const page of pages) counts.set(page.format, (counts.get(page.format) ?? 0) + 1);
  return order
    .filter((format) => counts.has(format))
    .map((format) => `${counts.get(format)} ${format}`)
    .join(', ');
}
