import { ditherGray } from '@turboslide/effects/bayer';
import { gaussianBlur, minFilter, unsharpBand } from '@turboslide/effects/filters';
import type { BitImage, Box, GrayImage, RgbaImage } from '@turboslide/effects/image';
import { invertBits } from '@turboslide/effects/image';
import { twoToneMetrics } from '@turboslide/effects/metrics';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { cropPadded, fitCover, scaleNearest } from '@turboslide/effects/resample';
import { autocontrast, invertGray, toGray, tone } from '@turboslide/effects/tone';
import type { TwoToneTreatment } from '@turboslide/schema/assets';

/**
 * The dither preview worker (SPEC 5.4, 6.5; MILESTONES M3 item 5): the two-tone treatment of a
 * picture asset run off the main thread, so the inspector's Asset section shows the twins and
 * their plate metrics live while a designer moves the black point, the gamma or the crop. The
 * source arrives as an ImageBitmap (the main thread's createImageBitmap of the asset file or of
 * an img), is read to RGBA on an OffscreenCanvas, goes through the pipeline of
 * @turboslide/effects, and each twin comes back as an ImageBitmap of the 1600 by 900 sheet,
 * transferred, ready for drawImage on the inspector's canvas.
 *
 * The stages and their order are twoToneScreen in packages/effects/src/two-tone.ts (gray or one
 * channel, crop, invert, minimum filter, blur, cover fit to 800 by 450 with the pinned Lanczos3,
 * unsharp band, autocontrast, the tone LUT, the 8 by 8 Bayer screen), repeated here stage by
 * stage because that module also imports the 1-bit PNG encoder, which needs node:zlib and cannot
 * load in a browser worker. `previewTwoTone` is exported so a Node test can hold it against
 * twoToneScreen; a change to the pipeline is made in both places.
 *
 * Usage from the main thread:
 *   const worker = new Worker(new URL('../workers/dither.worker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ id, source, treatment, plate }, [source]);
 *   worker.onmessage = (e: MessageEvent<DitherResponse>) => { ... drawImage(e.data.dark, 0, 0) ... };
 */

/**
 * The treatment fields the pipeline reads (Asset.treatment for kind two-tone, SPEC 4.2); the crop
 * defaults to the whole source and the polarity to dark-ground, as twoTone does.
 */
export type DitherTreatment = Omit<
  TwoToneTreatment,
  'kind' | 'crop' | 'polarity' | 'autocontrast' | 'cell' | 'bayer' | 'resampler'
> &
  Partial<
    Pick<
      TwoToneTreatment,
      'kind' | 'crop' | 'polarity' | 'autocontrast' | 'cell' | 'bayer' | 'resampler'
    >
  >;

export type DitherRequest = {
  /** echoed in the response so the caller can drop stale answers */
  id: number;
  /** the source picture, transferred */
  source: ImageBitmap;
  treatment: DitherTreatment;
  /** the plate rectangle in sheet pixels, for the metrics (PLATE_BOXES in @turboslide/effects/metrics) */
  plate?: Box;
  /** which twins to paint; both by default */
  themes?: ('light' | 'dark')[];
};

export type DitherOk = {
  id: number;
  ok: true;
  /** the twins as 1600 by 900 bitmaps, present for the requested themes */
  light?: ImageBitmap;
  dark?: ImageBitmap;
  metrics: TwoToneMetrics;
  /** the screen size before the 2x nearest scale: 800 by 450 */
  cells: [number, number];
  ms: number;
};

export type DitherFail = { id: number; ok: false; error: string };

export type DitherResponse = DitherOk | DitherFail;

/** The screen the deck dithers at and the sheet it covers (two-tone.ts TWO_TONE_SIZE, SHEET_SIZE). */
export const SCREEN = { width: 800, height: 450 } as const;
export const SHEET = { width: 1600, height: 900 } as const;

/** The twin colors: a lit cell (1) is the theme's light color, an unlit cell the dark one (tokens.ts paper and ink). */
export const TWIN_COLORS = {
  dark: { lit: [242, 242, 240], unlit: [7, 7, 7] },
  light: { lit: [255, 255, 255], unlit: [7, 7, 7] },
} as const;

/** The one-bit screen before polarity: twoToneScreen's stages, in its order. */
export function previewScreen(
  rgba: RgbaImage,
  params: DitherTreatment,
): { positive: BitImage; toneImage: GrayImage } {
  let gray = toGray(rgba, params.channel ?? 'gray');
  gray = cropPadded(gray, params.crop ?? [0, 0, rgba.width, rgba.height]);
  if (params.invert) gray = invertGray(gray);
  if (params.minFilter) gray = minFilter(gray, params.minFilter);
  if (params.blur) gray = gaussianBlur(gray, params.blur);
  gray = fitCover(gray, SCREEN.width, SCREEN.height);
  if (params.unsharp) gray = unsharpBand(gray, params.unsharp);
  gray = autocontrast(gray, params.autocontrast ?? 0.5);
  gray = tone(gray, params.black ?? 0, params.white ?? 255, params.gamma ?? 1);
  return { positive: ditherGray(gray), toneImage: gray };
}

export type PreviewTwoTone = {
  /** 800 by 450 cells; 1 is a lit (paper) cell of the dark twin */
  darkBits: BitImage;
  lightBits: BitImage;
  metrics: TwoToneMetrics;
};

/** Both twins' screens and the plate metrics from a source picture and its treatment (twoTone without the encoders). */
export function previewTwoTone(
  rgba: RgbaImage,
  params: DitherTreatment,
  plate?: Box,
): PreviewTwoTone {
  const { positive } = previewScreen(rgba, params);
  const polarity = params.polarity ?? 'dark-ground';
  const darkBits = polarity === 'dark-ground' ? positive : invertBits(positive);
  const lightBits = invertBits(darkBits);
  return { darkBits, lightBits, metrics: twoToneMetrics(darkBits, plate, params.cell ?? 2) };
}

/** The sheet-size RGBA of a twin: the screen scaled 2x nearest, lit cells in the theme's light color. */
export function paintTwin(bits: BitImage, theme: 'light' | 'dark', cell = 2): RgbaImage {
  const scaled = scaleNearest(bits, cell);
  const { lit, unlit } = TWIN_COLORS[theme];
  const data = new Uint8Array(scaled.width * scaled.height * 4);
  for (let i = 0; i < scaled.bits.length; i += 1) {
    const color = scaled.bits[i] ? lit : unlit;
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width: scaled.width, height: scaled.height, data };
}

/** The source bitmap read to RGBA through an OffscreenCanvas. */
function readSource(source: ImageBitmap): RgbaImage {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context is not available');
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  return {
    width: source.width,
    height: source.height,
    data: new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength),
  };
}

/** An RGBA image painted on an OffscreenCanvas and handed over as a transferable bitmap. */
function toBitmap(image: RgbaImage): ImageBitmap {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context is not available');
  // copied into a clamped array on its own buffer, the shape ImageData takes
  const pixels = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  ctx.putImageData(pixels, 0, 0);
  return canvas.transferToImageBitmap();
}

/** One request to one response, plus the bitmaps to transfer. */
export function answer(request: DitherRequest): {
  response: DitherResponse;
  transfer: Transferable[];
} {
  const t = performance.now();
  try {
    const rgba = readSource(request.source);
    request.source.close();
    const { darkBits, lightBits, metrics } = previewTwoTone(rgba, request.treatment, request.plate);
    const themes = request.themes ?? ['light', 'dark'];
    const cell = request.treatment.cell ?? 2;
    const response: DitherOk = {
      id: request.id,
      ok: true,
      metrics,
      cells: [darkBits.width, darkBits.height],
      ms: 0,
    };
    const transfer: Transferable[] = [];
    if (themes.includes('dark')) {
      response.dark = toBitmap(paintTwin(darkBits, 'dark', cell));
      transfer.push(response.dark);
    }
    if (themes.includes('light')) {
      response.light = toBitmap(paintTwin(lightBits, 'light', cell));
      transfer.push(response.light);
    }
    response.ms = Math.round(performance.now() - t);
    return { response, transfer };
  } catch (error) {
    return {
      response: {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      transfer: [],
    };
  }
}

type WorkerScope = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
};

function isRequest(data: unknown): data is DitherRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'source' in data &&
    'treatment' in data &&
    typeof (data as { id: unknown }).id === 'number'
  );
}

/* the listener registers only inside a worker; a Node test imports the pure functions above */
if (typeof self !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
  const scope = self as unknown as WorkerScope;
  scope.addEventListener('message', (event) => {
    if (!isRequest(event.data)) return;
    const { response, transfer } = answer(event.data);
    scope.postMessage(response, transfer);
  });
}
