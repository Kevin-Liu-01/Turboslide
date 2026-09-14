/// <reference lib="dom" />
// The live dither overlay (gslides-parity SPEC-3 10.2, 10.3; research-3 06 sections 4.3 and 4.4):
// a picture whose root carries `data-dither-state="live"` shows its continuous twin in the `<img>`
// and the runtime draws the effect on the `<canvas class="picture-dither">` over it, one canvas
// pixel per cell, the CSS scaling the canvas to the box with `image-rendering: pixelated`. The
// pixels come from a `DitherHost`: the studio's worker (apps/studio/src/workers/dither.worker.ts)
// or the main thread fallback (packages/viewer/src/dither.ts), both running the stages of
// @turboslide/effects dither.ts. This module is the DOM half and knows no pixel arithmetic: it
// reads the root's attributes (the field, its key, the continuous source, the trim, the position
// and the adjustments), keeps the base cached per source and region through the host, asks for a
// frame per theme or slider event with an increasing id (a stale answer is dropped), draws the
// newest frame, unhides the canvas on the first one and reports the frame time on the root as a
// `ts-dither-frame` event, which the e2e budget of 10.10 listens to.
//
// `previewDither` is the slider path (EditorHandle.ditherPreview): a draft field for one block
// draws over the committed one until it is cleared, which is one write on pointer up
// (`picture.dither`). A picture in state `variant` gains a canvas for the preview, so a slider
// over a materialized picture shows the draft too. Like measure-dom.ts, the file references the
// DOM lib itself so the render package stays a Node program elsewhere.
import type { PictureDitherLike } from './dither-key.ts';
import { readDither, resolveDither } from './dither-key.ts';

export type DitherRuntimeTheme = 'light' | 'dark';

/** The stage 1 spec a host prepares a base from (effects dither.ts `ToneBaseSpec`, structurally). */
export type DitherBaseRequest = {
  /** The base key: the source, the screen, the region and the pre fit filters. */
  key: string;
  /** The continuous source's URL, or the loaded image element the runtime found. */
  source: HTMLImageElement | string;
  screen: [number, number];
  trim?: { left: number; right: number; top: number; bottom: number };
  position?: string;
  channel: 'gray' | 'r' | 'g' | 'b';
  invert: boolean;
  minFilter: number;
  blur: number;
  color: boolean;
};

export type DitherFrameRequest = {
  key: string;
  /** Increasing per canvas; a host answers null for a request older than one it already served. */
  id: number;
  dither: PictureDitherLike;
  theme: DitherRuntimeTheme;
  adjust?: { brightness?: number; contrast?: number };
};

export type DitherFramePayload = {
  /** One pixel per cell. */
  image: ImageBitmap | ImageData;
  width: number;
  height: number;
  litFraction: number;
  /** The host's own time for the frame in milliseconds. */
  ms: number;
};

export type DitherHost = {
  prepare: (request: DitherBaseRequest) => Promise<void>;
  frame: (request: DitherFrameRequest) => Promise<DitherFramePayload | null>;
  release: (key: string) => void;
};

/** The root of a dithered picture: the picture object or the shot figure (dither-attrs.ts). */
export const DITHER_ROOT_SELECTOR = '[data-dither][data-dither-key]';
export const DITHER_CANVAS_CLASS = 'picture-dither';
/** The event a drawn frame dispatches on the root (bubbles): `{ blockId, requestedAt, drawnAt, ms, hostMs }`. */
export const DITHER_FRAME_EVENT = 'ts-dither-frame';

export type DitherOverlay = {
  root: HTMLElement;
  blockId: string | null;
  img: HTMLImageElement;
  /** The element the canvas is appended to: the root, or the shot's crop frame. */
  frame: HTMLElement;
  canvas: HTMLCanvasElement | null;
  dither: PictureDitherLike;
  key: string;
  state: 'variant' | 'live';
  source: string;
  trim?: { left: number; right: number; top: number; bottom: number };
  position?: string;
  adjust?: { brightness?: number; contrast?: number };
  /** The picture's box in sheet pixels; the screen is the box over the requested cell. */
  box: [number, number];
};

/** `data-trim="l,r,t,b"` as the trim, or undefined. */
export function parseTrim(
  value: string | null | undefined,
): { left: number; right: number; top: number; bottom: number } | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parts = value.split(',').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [left, right, top, bottom] = parts as [number, number, number, number];
  return { left, right, top, bottom };
}

/** The `object-position` of an inline style, or undefined for the centre. */
export function parsePosition(style: string | null | undefined): string | undefined {
  if (!style) return undefined;
  const match = /object-position:\s*([^;]+)/.exec(style);
  const value = match?.[1]?.trim();
  return value === undefined || value === '' || value === 'center' ? undefined : value;
}

/** The brightness and contrast of an inline `filter`, as the adjustments the renderer wrote them from. */
export function parseAdjust(
  style: string | null | undefined,
): { brightness?: number; contrast?: number } | undefined {
  if (!style) return undefined;
  const out: { brightness?: number; contrast?: number } = {};
  const brightness = /brightness\(([-\d.]+)\)/.exec(style);
  const contrast = /contrast\(([-\d.]+)\)/.exec(style);
  if (brightness) out.brightness = Math.round((Number(brightness[1]) - 1) * 1000) / 1000;
  if (contrast) out.contrast = Math.round((Number(contrast[1]) - 1) * 1000) / 1000;
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The picture's box in sheet pixels: the root's inline size, else the wrapper's, else the sheet. */
export function boxOf(root: HTMLElement, img: HTMLElement): [number, number] {
  const fromStyle = (el: HTMLElement): [number, number] | null => {
    const w = Number.parseFloat(el.style.width);
    const h = Number.parseFloat(el.style.height);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? [w, h] : null;
  };
  const own = fromStyle(root);
  if (own) return own;
  const wrapper = root.parentElement;
  if (wrapper) {
    const fromWrapper = fromStyle(wrapper);
    if (fromWrapper) return fromWrapper;
  }
  // a flow shot: the image's attributes carry the stored size; the width of the figure decides
  const w = Number(img.getAttribute('width'));
  const h = Number(img.getAttribute('height'));
  if (w > 0 && h > 0) return [w, h];
  return [1600, 900];
}

/** Reads a dithered root, or null when it is not one the runtime can draw. */
export function readOverlay(root: Element): DitherOverlay | null {
  if (!(root instanceof HTMLElement)) return null;
  const dither = readDither({ dither: safeJson(root.getAttribute('data-dither')) });
  const key = root.getAttribute('data-dither-key');
  const state = root.getAttribute('data-dither-state');
  if (dither === undefined || key === null || (state !== 'variant' && state !== 'live'))
    return null;
  const img = root.querySelector<HTMLImageElement>('img.picture-img, img.shot');
  if (img === null) return null;
  const frame = (img.parentElement ?? root) as HTMLElement;
  const canvas = frame.querySelector<HTMLCanvasElement>(`:scope > canvas.${DITHER_CANVAS_CLASS}`);
  const source =
    root.getAttribute('data-dither-source') ?? img.getAttribute('data-light') ?? img.src;
  const trim = parseTrim(root.getAttribute('data-trim') ?? frame.getAttribute('data-trim'));
  const position = parsePosition(img.getAttribute('style'));
  const adjust = parseAdjust(img.getAttribute('style'));
  const box = boxOf(root, img);
  return {
    root,
    blockId: blockIdOf(root),
    img,
    frame,
    canvas,
    dither,
    key,
    state,
    source,
    ...(trim !== undefined ? { trim } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(adjust !== undefined ? { adjust } : {}),
    box,
  };
}

function safeJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The base request of an overlay for a field (the draft or the committed one). */
export function baseRequestOf(
  overlay: DitherOverlay,
  dither: PictureDitherLike,
): DitherBaseRequest {
  const resolved = resolveDither(dither);
  const screen: [number, number] = [
    Math.max(1, Math.round(overlay.box[0] / resolved.cell)),
    Math.max(1, Math.round(overlay.box[1] / resolved.cell)),
  ];
  const color = resolved.tone === 'original' || resolved.strength < 1;
  const key = JSON.stringify([
    overlay.source,
    screen,
    overlay.trim ?? null,
    overlay.position ?? 'center',
    resolved.channel,
    resolved.invert,
    resolved.minFilter,
    resolved.blur,
    color,
  ]);
  return {
    key,
    source:
      overlay.img.currentSrc === overlay.source || overlay.img.src === overlay.source
        ? overlay.img
        : overlay.source,
    screen,
    ...(overlay.trim !== undefined ? { trim: overlay.trim } : {}),
    ...(overlay.position !== undefined ? { position: overlay.position } : {}),
    channel: resolved.channel,
    invert: resolved.invert,
    minFilter: resolved.minFilter,
    blur: resolved.blur,
    color,
  };
}

/** The canvas of an overlay, made when the root has none (a preview over a materialized picture). */
export function ensureCanvas(overlay: DitherOverlay): HTMLCanvasElement {
  if (overlay.canvas !== null) return overlay.canvas;
  const canvas = overlay.root.ownerDocument.createElement('canvas');
  canvas.className = DITHER_CANVAS_CLASS;
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  overlay.frame.appendChild(canvas);
  overlay.canvas = canvas;
  return canvas;
}

type CanvasState = {
  baseKey: string | null;
  prepared: Promise<void> | null;
  lastId: number;
  drawn: string | null;
  inFlight: boolean;
  queued: (() => void) | null;
};

const states = new WeakMap<HTMLCanvasElement, CanvasState>();
/** The draft fields of the slider path, by block root. */
const previews = new WeakMap<HTMLElement, PictureDitherLike>();
/** Roots whose material plays undithered for a look (the Material section's Play). */
const playing = new WeakSet<HTMLElement>();

function stateOf(canvas: HTMLCanvasElement): CanvasState {
  let state = states.get(canvas);
  if (state === undefined) {
    state = {
      baseKey: null,
      prepared: null,
      lastId: 0,
      drawn: null,
      inFlight: false,
      queued: null,
    };
    states.set(canvas, state);
  }
  return state;
}

/** Draws a frame payload on a canvas sized to the frame, one pixel per cell. */
export function drawFrame(canvas: HTMLCanvasElement, payload: DitherFramePayload): boolean {
  if (canvas.width !== payload.width) canvas.width = payload.width;
  if (canvas.height !== payload.height) canvas.height = payload.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (typeof ImageData !== 'undefined' && payload.image instanceof ImageData) {
    ctx.putImageData(payload.image, 0, 0);
  } else {
    ctx.drawImage(payload.image as CanvasImageSource, 0, 0);
    if ('close' in payload.image && typeof payload.image.close === 'function')
      payload.image.close();
  }
  return true;
}

export type SyncOptions = {
  /** Only these block ids; every live root when absent. */
  blockIds?: ReadonlySet<string>;
  /** Called after a frame is drawn, before the event. */
  onFrame?: (overlay: DitherOverlay, payload: DitherFramePayload) => void;
};

/**
 * Draws or refreshes the overlay of one root: the draft field when a preview is set, else the
 * committed field in state `live`; a variant root without a preview hides its canvas. One frame
 * in flight per canvas, the newest request replacing a queued one, so a drag never queues.
 */
export async function syncOverlay(
  root: Element,
  host: DitherHost,
  theme: DitherRuntimeTheme,
  options: SyncOptions = {},
): Promise<void> {
  const overlay = readOverlay(root);
  if (overlay === null) return;
  if (
    options.blockIds !== undefined &&
    (overlay.blockId === null || !options.blockIds.has(overlay.blockId))
  )
    return;
  const preview = previews.get(overlay.root);
  const dither = preview ?? overlay.dither;
  const wanted = preview !== undefined || overlay.state === 'live';
  if (!wanted || playing.has(overlay.root)) {
    if (overlay.canvas !== null) overlay.canvas.hidden = true;
    return;
  }
  const canvas = ensureCanvas(overlay);
  const state = stateOf(canvas);
  const run = async (): Promise<void> => {
    const requestedAt = now();
    const base = baseRequestOf(overlay, dither);
    if (state.baseKey !== base.key || state.prepared === null) {
      if (state.baseKey !== null && state.baseKey !== base.key) host.release(state.baseKey);
      state.baseKey = base.key;
      state.prepared = host.prepare(base);
    }
    try {
      await state.prepared;
    } catch {
      state.prepared = null;
      return;
    }
    state.lastId += 1;
    const id = state.lastId;
    const payload = await host.frame({
      key: base.key,
      id,
      dither,
      theme,
      ...(overlay.adjust !== undefined ? { adjust: overlay.adjust } : {}),
    });
    if (payload === null || id !== state.lastId) return;
    if (!drawFrame(canvas, payload)) return;
    canvas.hidden = false;
    state.drawn = `${base.key}|${JSON.stringify(dither)}|${theme}`;
    options.onFrame?.(overlay, payload);
    const drawnAt = now();
    overlay.root.dispatchEvent(
      new CustomEvent(DITHER_FRAME_EVENT, {
        bubbles: true,
        detail: {
          blockId: overlay.blockId,
          requestedAt,
          drawnAt,
          ms: drawnAt - requestedAt,
          hostMs: payload.ms,
          litFraction: payload.litFraction,
          preview: preview !== undefined,
        },
      }),
    );
  };
  if (state.inFlight) {
    // the newest request wins; the one it replaces is never sent
    state.queued = () => void syncOverlay(root, host, theme, options);
    return;
  }
  state.inFlight = true;
  try {
    await run();
  } finally {
    state.inFlight = false;
    const queued = state.queued;
    state.queued = null;
    queued?.();
  }
}

/** Every dithered root under `root` (the root itself included) drawn for the theme. */
export function syncDitherOverlays(
  root: ParentNode,
  host: DitherHost,
  theme: DitherRuntimeTheme,
  options: SyncOptions = {},
): Promise<void> {
  const roots: Element[] = [];
  if (root instanceof Element && root.matches(DITHER_ROOT_SELECTOR)) roots.push(root);
  roots.push(...root.querySelectorAll(DITHER_ROOT_SELECTOR));
  return Promise.all(roots.map((el) => syncOverlay(el, host, theme, options))).then(
    () => undefined,
  );
}

/**
 * The block id of a root: `data-block` when the render carries block attributes, else the id of
 * the freeform wrapper around it (`.free[data-free]`, the live editor render, slide.ts renderFreeform).
 */
export function blockIdOf(root: Element): string | null {
  return (
    root.getAttribute('data-block') ??
    root.closest('.free[data-free]')?.getAttribute('data-free') ??
    null
  );
}

function escapeId(blockId: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(blockId)
    : blockId;
}

/** The dithered root of a block on the rendered slide, by `data-block` or inside its freeform wrapper. */
export function ditherRootOf(root: ParentNode, blockId: string): HTMLElement | null {
  const id = escapeId(blockId);
  const el =
    root.querySelector(`${DITHER_ROOT_SELECTOR}[data-block="${id}"]`) ??
    root.querySelector(`.free[data-free="${id}"] ${DITHER_ROOT_SELECTOR}`);
  return el instanceof HTMLElement ? el : null;
}

/**
 * The slider path (SPEC-3 10.2): a draft field for one block, drawn over the committed one until
 * cleared with null; the store sees one write on pointer up. Answers false when the slide holds no
 * dithered root for the block (a picture without the field is not previewable until it has one).
 */
export function previewDither(
  root: ParentNode,
  blockId: string,
  dither: PictureDitherLike | null,
  host: DitherHost,
  theme: DitherRuntimeTheme,
): boolean {
  const target = ditherRootOf(root, blockId) ?? blockRootOf(root, blockId);
  if (target === null) return false;
  if (dither === null) previews.delete(target);
  else previews.set(target, dither);
  void syncOverlay(target, host, theme);
  return true;
}

/** A picture root without the field yet (a preview before the first write), by either id form. */
function blockRootOf(root: ParentNode, blockId: string): HTMLElement | null {
  const id = escapeId(blockId);
  const el =
    root.querySelector(`.picture[data-block="${id}"], figure.shot-fig[data-block="${id}"]`) ??
    root.querySelector(
      `.free[data-free="${id}"] .picture, .free[data-free="${id}"] figure.shot-fig`,
    );
  return el instanceof HTMLElement ? el : null;
}

/** True while a block's preview draft is set. */
export function hasPreview(root: HTMLElement): boolean {
  return previews.has(root);
}

/** The Material section's Play: the undithered shader plays over `blockId`'s frame until stopped. */
export function setMaterialPlay(
  root: ParentNode,
  blockId: string | null,
  host: DitherHost,
  theme: DitherRuntimeTheme,
): void {
  for (const el of root.querySelectorAll<HTMLElement>(DITHER_ROOT_SELECTOR)) {
    const was = playing.has(el);
    const wants = blockId !== null && el.getAttribute('data-block') === blockId;
    if (wants) playing.add(el);
    else playing.delete(el);
    if (was !== wants) void syncOverlay(el, host, theme);
  }
}

/** True while the block's shader plays undithered. */
export function isPlaying(root: HTMLElement): boolean {
  return playing.has(root);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
