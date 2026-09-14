import { ditherGray } from '@turboslide/effects/bayer';
import { gaussianBlur, minFilter, unsharpBand } from '@turboslide/effects/filters';
import type { BitImage, Box, GrayImage, RgbaImage } from '@turboslide/effects/image';
import { invertBits } from '@turboslide/effects/image';
import { twoToneMetrics } from '@turboslide/effects/metrics';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { ditherFrame, prepareToneBase } from '@turboslide/effects/pipeline';
import type { ToneBase, ToneBaseSpec } from '@turboslide/effects/pipeline';
import { cropPadded, fitCover, scaleNearest } from '@turboslide/effects/resample';
import { autocontrast, invertGray, toGray, tone } from '@turboslide/effects/tone';
import type { TwoToneTreatment } from '@turboslide/schema/assets';
import type {
  DitherWorkerFrame,
  DitherWorkerPrepare,
  DitherWorkerReply,
  DitherWorkerRequest,
} from '@turboslide/viewer/dither';

/**
 * The dither preview worker (SPEC 5.4, 6.5; MILESTONES M3 item 5; gslides-parity SPEC-3 10.2 for
 * the block level dither): the pipelines of @turboslide/effects run off the main thread, so the
 * editor shows a dither live while a designer moves a slider.
 *
 * Two request shapes share the worker:
 *
 * 1. The asset level treatment of round one (`treatment` present, the inspector's Pictures and
 *    materials panel): the source arrives as an ImageBitmap, goes through the two-tone stages
 *    stage by stage (repeated here because two-tone.ts imports the 1-bit PNG encoder, which needs
 *    node:zlib), and each twin comes back as a 1600 by 900 ImageBitmap. `previewTwoTone` is
 *    exported so a Node test can hold it against twoToneScreen.
 * 2. The block level dither of round three (`kind` present, packages/viewer/src/dither.ts
 *    `workerDitherHost`): `prepare` reads the source once and keeps the tone base (the cover fit,
 *    the slow step) under the caller's key; `frame` re-runs the LUT, the threshold and the paint
 *    over the cached base for one field and one theme and answers a transferred ImageBitmap of
 *    the plane, one pixel per cell; `release` forgets a base. Requests carry an id increasing per
 *    key; a frame request older than the newest one served for its key is dropped with a `stale`
 *    reply, so a drag never queues frames. The same effects stages run in Node
 *    (`@turboslide/effects/pipeline` ditherFrame) and the test asserts equal bits.
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

// ---------------------------------------------------------------------------------------------
// The block level dither (round three)

/** The cached bases and the newest frame id served per key; the pure state a Node test can drive. */
export type BlockDitherState = {
  bases: Map<string, ToneBase>;
  served: Map<string, number>;
};

export function newBlockDitherState(): BlockDitherState {
  return { bases: new Map(), served: new Map() };
}

/** `prepare` over decoded pixels: the base under the key (the fit runs here, once per source and region). */
export function prepareBlockBase(
  state: BlockDitherState,
  key: string,
  rgba: RgbaImage,
  spec: ToneBaseSpec,
): ToneBase {
  const base = prepareToneBase(rgba, spec);
  state.bases.set(key, base);
  return base;
}

export type BlockFrame = {
  plane: RgbaImage;
  litFraction: number;
};

/**
 * `frame` over a cached base: null when the key has no base or the request is older than the newest
 * one served for the key (the stale drop of SPEC-3 10.2); else the plane and the lit fraction.
 */
export function blockFrame(state: BlockDitherState, request: DitherWorkerFrame): BlockFrame | null {
  const base = state.bases.get(request.key);
  if (base === undefined) return null;
  if ((state.served.get(request.key) ?? -1) > request.id) return null;
  state.served.set(request.key, request.id);
  const frame = ditherFrame(base, request.dither, request.theme, {
    ...(request.adjust !== undefined ? { adjust: request.adjust } : {}),
  });
  return { plane: frame.plane, litFraction: frame.metrics.litFraction };
}

/** One block level request to its reply and the bitmaps to transfer. */
export function answerBlock(
  state: BlockDitherState,
  request: DitherWorkerRequest,
): { reply: DitherWorkerReply | null; transfer: Transferable[] } {
  const t = performance.now();
  if (request.kind === 'release') {
    state.bases.delete(request.key);
    state.served.delete(request.key);
    return { reply: null, transfer: [] };
  }
  try {
    if (request.kind === 'prepare') {
      const rgba = readSource(request.source);
      request.source.close();
      prepareBlockBase(state, request.key, rgba, request.spec);
      return {
        reply: {
          kind: 'prepared',
          id: request.id,
          key: request.key,
          ok: true,
          ms: Math.round(performance.now() - t),
        },
        transfer: [],
      };
    }
    const frame = blockFrame(state, request);
    if (frame === null)
      return {
        reply: { kind: 'stale', id: request.id, key: request.key, ok: false },
        transfer: [],
      };
    const image = toBitmap(frame.plane);
    return {
      reply: {
        kind: 'frame',
        id: request.id,
        key: request.key,
        ok: true,
        image,
        width: frame.plane.width,
        height: frame.plane.height,
        litFraction: frame.litFraction,
        ms: performance.now() - t,
      },
      transfer: [image],
    };
  } catch (error) {
    return {
      reply: {
        kind: 'error',
        id: request.id,
        key: request.key,
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

function isBlockRequest(data: unknown): data is DitherWorkerRequest {
  if (typeof data !== 'object' || data === null || !('kind' in data)) return false;
  const kind = (data as { kind: unknown }).kind;
  if (kind === 'release') return typeof (data as { key?: unknown }).key === 'string';
  if (kind !== 'prepare' && kind !== 'frame') return false;
  return (
    typeof (data as { id?: unknown }).id === 'number' &&
    typeof (data as { key?: unknown }).key === 'string'
  );
}

/* the listeners register only inside a worker; a Node test imports the pure functions above */
if (typeof self !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
  const scope = self as unknown as WorkerScope;
  const state = newBlockDitherState();
  scope.addEventListener('message', (event) => {
    if (isBlockRequest(event.data)) {
      const { reply, transfer } = answerBlock(state, event.data);
      if (reply !== null) scope.postMessage(reply, transfer);
      return;
    }
    if (!isRequest(event.data)) return;
    const { response, transfer } = answer(event.data);
    scope.postMessage(response, transfer);
  });
}

export type { DitherWorkerPrepare };
