import { bayer8 } from '@turboslide/effects/bayer';
import {
  baseSpecKey,
  ditherFrame,
  prepareToneBase,
  type DitherTheme,
  type ToneBase,
  type ToneBaseSpec,
} from '@turboslide/effects/pipeline';
import { RAMP_COLORS, rampCells, rampInk } from '@turboslide/effects/ramp';
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import {
  previewDither as previewDitherOverlay,
  setMaterialPlay as setMaterialPlayOverlay,
  syncDitherOverlays,
} from '@turboslide/render/runtime';
import type { DitherBaseRequest, DitherFramePayload, DitherHost } from '@turboslide/render/runtime';

/**
 * The live dither ramp canvas (SPEC 5.4; tail:104-114), drawn from
 * @turboslide/effects: one cell per canvas pixel at half the CSS size (the
 * CSS scales it 2x with image-rendering: pixelated), lit where
 * bayer8(y, x) / 64 < 1 - x / W. Paper and ink follow the theme so both
 * themes share cells (SPEC 5.3 determinism rules). The standalone runtime
 * (standalone/runtime.ts) keeps an inline copy of the same table because it
 * ships as one classic script.
 *
 * Round three (gslides-parity SPEC-3 10.2, 10.3): the same draw pass syncs the block level dither
 * overlays (`.picture[data-dither-state="live"] > canvas.picture-dither`, dither-runtime.ts) through
 * a host: the studio's worker when a factory is registered (`setDitherWorkerFactory`), else the
 * main thread stages of @turboslide/effects. `applyThemeToTree` (theme.ts) calls `drawAllDither`
 * on every fresh render and theme change, so the editor, the viewer's stage and the live clones
 * draw their overlays with no other wiring; the chrome's Dither section drives the slider path
 * through `previewDither`.
 */
export { bayer8 };

export function drawDither(canvas: HTMLCanvasElement, theme: 'light' | 'dark'): void {
  const { w: W, h: H } = rampCells(canvas.clientWidth, canvas.clientHeight);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const colors = RAMP_COLORS[theme];
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colors.cell;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (rampInk(x, y, W)) ctx.fillRect(x, y, 1, 1);
    }
  }
  canvas.dataset.drawn = theme;
}

/** Draws every `canvas.dither` under root that is not already drawn for the theme, and syncs the picture dither overlays. */
export function drawAllDither(root: ParentNode, theme: 'light' | 'dark'): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach((canvas) => {
    if (canvas.dataset.drawn !== theme) drawDither(canvas, theme);
  });
  if (typeof document === 'undefined') return;
  try {
    void syncDitherOverlays(root, ditherHost(), theme).catch(() => undefined);
  } catch {
    // a document without canvas support (a test's jsdom): the picture keeps its continuous twin
  }
}

// ---------------------------------------------------------------------------------------------
// The hosts

/** The worker's message shapes (apps/studio/src/workers/dither.worker.ts answers them). */
export type DitherWorkerPrepare = {
  kind: 'prepare';
  id: number;
  key: string;
  /** The source, transferred. */
  source: ImageBitmap;
  spec: ToneBaseSpec;
};

export type DitherWorkerFrame = {
  kind: 'frame';
  id: number;
  key: string;
  dither: PictureDither;
  theme: DitherTheme;
  adjust?: { brightness?: number; contrast?: number };
};

export type DitherWorkerRelease = { kind: 'release'; key: string };

export type DitherWorkerRequest = DitherWorkerPrepare | DitherWorkerFrame | DitherWorkerRelease;

export type DitherWorkerReply =
  | { kind: 'prepared'; id: number; key: string; ok: true; ms: number }
  | {
      kind: 'frame';
      id: number;
      key: string;
      ok: true;
      image: ImageBitmap;
      width: number;
      height: number;
      litFraction: number;
      ms: number;
    }
  | { kind: 'stale'; id: number; key: string; ok: false }
  | { kind: 'error'; id: number; key: string; ok: false; error: string };

/** The worker surface the hosts drive; `new Worker(...)` satisfies it. */
export type DitherWorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
};

/** The stage 1 spec of a base request (dither-runtime.ts) in the effects package's shape. */
export function specOfRequest(request: DitherBaseRequest): ToneBaseSpec {
  return {
    screen: request.screen,
    ...(request.trim !== undefined ? { trim: request.trim } : {}),
    ...(request.position !== undefined ? { position: request.position } : {}),
    channel: request.channel,
    invert: request.invert,
    minFilter: request.minFilter,
    blur: request.blur,
    color: request.color,
  };
}

/** The source of a base request as a decoded image element: the runtime's element, or a new same origin load. */
export async function loadSource(source: HTMLImageElement | string): Promise<HTMLImageElement> {
  if (typeof source !== 'string') {
    if (!source.complete || source.naturalWidth === 0) await source.decode();
    if (source.currentSrc !== '' && source.naturalWidth > 0) return source;
  }
  const url = typeof source === 'string' ? source : source.currentSrc || source.src;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/** The pixels of a decoded image, read through a canvas (same origin assets only). */
export function readPixels(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d context is not available');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The plane of an effects frame as ImageData, the shape `drawFrame` puts on the canvas. */
export function imageDataOf(plane: { width: number; height: number; data: Uint8Array }): ImageData {
  return new ImageData(new Uint8ClampedArray(plane.data), plane.width, plane.height);
}

/**
 * The main thread host: the effects stages run in the page. The first frame carries the fit
 * (the slow step), every later frame over the same base only the LUT, the threshold and the
 * paint. The fallback when no worker factory is registered, and the host of a page without workers.
 */
export function inlineDitherHost(): DitherHost {
  const bases = new Map<string, Promise<ToneBase>>();
  const served = new Map<string, number>();
  return {
    prepare(request) {
      if (bases.has(request.key)) return bases.get(request.key)!.then(() => undefined);
      const base = loadSource(request.source).then((img) => {
        const pixels = readPixels(img);
        return prepareToneBase(
          { width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data.buffer) },
          specOfRequest(request),
        );
      });
      bases.set(request.key, base);
      base.catch(() => bases.delete(request.key));
      return base.then(() => undefined);
    },
    async frame(request) {
      const base = await bases.get(request.key);
      if (base === undefined) return null;
      if ((served.get(request.key) ?? -1) > request.id) return null;
      served.set(request.key, request.id);
      const t0 = performance.now();
      const frame = ditherFrame(base, request.dither as PictureDither, request.theme, {
        ...(request.adjust !== undefined ? { adjust: request.adjust } : {}),
      });
      return {
        image: imageDataOf(frame.plane),
        width: frame.plane.width,
        height: frame.plane.height,
        litFraction: frame.metrics.litFraction,
        ms: performance.now() - t0,
      };
    },
    release(key) {
      bases.delete(key);
      served.delete(key);
    },
  };
}

/**
 * The worker host: the source travels once as an ImageBitmap, every frame comes back transferred,
 * and the worker drops a frame request older than one it has served for the key.
 */
export function workerDitherHost(worker: DitherWorkerLike): DitherHost {
  let nextId = 0;
  const pending = new Map<number, { resolve: (reply: DitherWorkerReply) => void }>();
  const prepared = new Map<string, Promise<void>>();
  worker.addEventListener('message', (event) => {
    const reply = event.data as DitherWorkerReply | undefined;
    if (
      reply === undefined ||
      typeof reply !== 'object' ||
      typeof (reply as { id?: unknown }).id !== 'number'
    )
      return;
    const waiter = pending.get(reply.id);
    if (waiter === undefined) return;
    pending.delete(reply.id);
    waiter.resolve(reply);
  });
  const send = (message: DitherWorkerRequest & { id: number }, transfer: Transferable[] = []) =>
    new Promise<DitherWorkerReply>((resolve) => {
      pending.set(message.id, { resolve });
      worker.postMessage(message, transfer);
    });
  return {
    prepare(request) {
      const existing = prepared.get(request.key);
      if (existing !== undefined) return existing;
      const run = (async () => {
        const img = await loadSource(request.source);
        const bitmap = await createImageBitmap(img);
        nextId += 1;
        const reply = await send(
          {
            kind: 'prepare',
            id: nextId,
            key: request.key,
            source: bitmap,
            spec: specOfRequest(request),
          },
          [bitmap],
        );
        if (!reply.ok) throw new Error(reply.kind === 'error' ? reply.error : 'stale');
      })();
      prepared.set(request.key, run);
      run.catch(() => prepared.delete(request.key));
      return run;
    },
    async frame(request) {
      nextId += 1;
      const reply = await send({
        kind: 'frame',
        id: nextId,
        key: request.key,
        dither: request.dither as PictureDither,
        theme: request.theme,
        ...(request.adjust !== undefined ? { adjust: request.adjust } : {}),
      });
      if (!reply.ok || reply.kind !== 'frame') return null;
      const payload: DitherFramePayload = {
        image: reply.image,
        width: reply.width,
        height: reply.height,
        litFraction: reply.litFraction,
        ms: reply.ms,
      };
      return payload;
    },
    release(key) {
      prepared.delete(key);
      worker.postMessage({ kind: 'release', key } satisfies DitherWorkerRelease, []);
    },
  };
}

let factory: (() => DitherWorkerLike) | null = null;
let shared: DitherHost | null = null;

/** Registers the studio's worker factory (apps/studio router.tsx); the shared host is rebuilt on the next draw. */
export function setDitherWorkerFactory(make: (() => DitherWorkerLike) | null): void {
  factory = make;
  shared = null;
}

/** The host every draw uses: the worker when a factory exists and the page has workers, else the main thread. */
export function ditherHost(): DitherHost {
  if (shared !== null) return shared;
  if (factory !== null && typeof Worker !== 'undefined') {
    try {
      shared = workerDitherHost(factory());
      return shared;
    } catch {
      // a worker that fails to construct: the main thread stages stand in
    }
  }
  shared = inlineDitherHost();
  return shared;
}

/** Forgets the shared host (tests, or a worker that died). */
export function resetDitherHost(): void {
  shared = null;
}

/** Sets the shared host directly (tests). */
export function setDitherHost(host: DitherHost | null): void {
  shared = host;
}

function documentTheme(): DitherTheme {
  const theme = typeof document === 'undefined' ? null : document.documentElement.dataset.theme;
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * The slider path (SPEC-3 10.2, `EditorHandle.ditherPreview`): a draft field drawn over the
 * committed one for a block on the current slide until cleared with null. Under 100 ms at the
 * 95th percentile from the slider event to the draw (10.10), because the base is cached and only
 * the LUT, the threshold and the paint run.
 */
export function previewDither(
  blockId: string,
  dither: PictureDither | null,
  root: ParentNode = document,
): boolean {
  return previewDitherOverlay(root, blockId, dither, ditherHost(), documentTheme());
}

/** The Material section's Play: the shader plays undithered over the block's frame until stopped with null. */
export function setMaterialPlay(blockId: string | null, root: ParentNode = document): void {
  setMaterialPlayOverlay(root, blockId, ditherHost(), documentTheme());
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(MATERIAL_PLAY_EVENT, { detail: { blockId } }));
}

/** The event `setMaterialPlay` fires on the window so the live mounts start or stop (MaterialMount.tsx). */
export const MATERIAL_PLAY_EVENT = 'ts-material-play';

/** The frame time of a dither preview: the event a drawn frame fires (dither-runtime.ts DITHER_FRAME_EVENT). */
export { DITHER_FRAME_EVENT } from '@turboslide/render/runtime';

/** The base key of a request, the same string the worker caches under (effects baseSpecKey over the spec plus the source). */
export function baseKeyOf(request: DitherBaseRequest): string {
  const source =
    typeof request.source === 'string'
      ? request.source
      : request.source.currentSrc || request.source.src;
  return `${source}|${baseSpecKey(specOfRequest(request))}`;
}
