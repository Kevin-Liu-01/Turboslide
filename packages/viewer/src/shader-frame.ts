// The resting still of a shader, made in the editor's own WebGL (docs/FEATURES.md 5.5;
// audit-shaders 1, 2; judge-design additions 3 to 6). The resting rule: a commit of any recipe
// field, a resize of the box or a kit colour change schedules a capture 800 ms after the last
// change; a held slider or a held handle previews and never commits, so nothing captures until
// the release. The frame's shape is the block's box aspect with the long side 3200
// (recipe-key.ts frameSizeFor), so the still equals the editor at rest. The pixel path is the
// capture job's (materials capture.ts mountInPage): `mountMaterial` with preserveDrawingBuffer and
// no antialias on a hidden host sized to half the target in CSS px, wait for the first
// ResizeObserver callback, clear `devicePixelsSupported` so a 1x display also reaches the target
// pixels, `setMinPixelRatio(2)`, wait until the canvas is the target size, `setFrame(anchor)`,
// then `canvas.toBlob('image/png')` in the same frame; the mount is disposed after the blob.
//
// The capture in a shared editor: the client whose own commit changed the recipe schedules the
// capture (`afterCommit`, called from the editor's commit path and never from the document
// observer), so a follower never captures and draws the frame it receives through the
// `shader.frame` write that follows. The frame write is a system write the controller queues
// behind the seller's pending commits with the latest server revision as its base and no history
// entry (`deps.write`); on a conflict the client re reads the head, drops the write when the block
// is gone or its key moved on, and retries once otherwise. Browser only (DOM, WebGL); the
// scheduling rule is pure and tested in Node with fake deps.
import type { MaterialHandle } from '@turboslide/materials/mount';
import type { ShaderPalette } from '@turboslide/materials/presets';
import { shaderPaletteOfDeck } from '@turboslide/materials/presets';
import {
  anchorOf,
  frameIsStale,
  frameKeyOf,
  frameSizeFor,
  materialAspectOf,
} from '@turboslide/materials/recipe-key';
import type { FrameKeyBlock } from '@turboslide/materials/recipe-key';
import type { MaterialBlock, MaterialUniforms } from '@turboslide/schema/blocks/material';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';

import { loadMaterialMount } from './MaterialMount';

/** The rest after the last change before a capture (5.5). */
export const FRAME_DEBOUNCE_MS = 800;

/** How many animation frames the capture waits for the host's box and for the canvas's size. */
const CAPTURE_WAIT_FRAMES = 240;

export type ShaderFrameCapture = {
  /** The frame's bytes: a PNG, or a WebP when the PNG was over the cap the capture was given. */
  bytes: Uint8Array;
  /** The encoding of `bytes`; a PNG when absent (the fakes of the tests). */
  type?: FrameEncoding;
  width: number;
  height: number;
  /** The WebGL renderer string of the client, for the asset's source. */
  renderer: string;
  frameKey: string;
};

export type FrameEncoding = 'image/png' | 'image/webp';

export type CaptureOptions = {
  /**
   * Over this many bytes the PNG is encoded again as a WebP on the same canvas before the mount is
   * disposed (docs/POLISH.md item 36: a god rays frame at the content box is a PNG of several MB,
   * over the function's body cap on every path a deployment has). Absent, the PNG is answered as
   * it is.
   */
  maxBytes?: number;
};

/**
 * The WebP qualities tried in turn for a frame over the cap: the first keeps a shader's grain and
 * bloom at a fraction of the PNG's bytes, the second is the floor before the hosted job draws it.
 */
export const FRAME_WEBP_QUALITIES: ReadonlyArray<number> = [0.92, 0.8];

let canCaptureAnswer: boolean | null = null;

/**
 * True when this browser can draw a frame itself; false sends the block to the hosted
 * `shader.capture`. Read once per page and the probe's context released: Chromium keeps at most
 * sixteen live WebGL contexts and loses the oldest past that, so a probe per capture would in time
 * take down the stage's own mount (the integrator's note of ship two).
 */
export function clientCanCapture(): boolean {
  if (typeof document === 'undefined') return false;
  if (canCaptureAnswer !== null) return canCaptureAnswer;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    canCaptureAnswer = gl !== null;
    (gl?.getExtension('WEBGL_lose_context') as { loseContext: () => void } | null)?.loseContext();
  } catch {
    canCaptureAnswer = false;
  }
  return canCaptureAnswer;
}

/** The GPU's renderer string as WebGL reports it, or 'webgl2' when the extension is hidden. */
export function webglRendererOf(canvas: HTMLCanvasElement): string {
  try {
    const gl = canvas.getContext('webgl2');
    if (gl === null) return 'webgl2';
    const info = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const value =
      info === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    return typeof value === 'string' && value !== '' ? value : 'webgl2';
  } catch {
    return 'webgl2';
  }
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/** The hidden host a capture mounts into: off the viewport, at half the frame in CSS px. */
function captureHost(size: [number, number]): HTMLDivElement {
  const host = document.createElement('div');
  host.className = 'ts-shader-capture';
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${size[0] / 2}px`;
  host.style.height = `${size[1] / 2}px`;
  host.style.overflow = 'hidden';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
}

/**
 * The canvas as a WebP under `maxBytes` when a quality of FRAME_WEBP_QUALITIES gets there, else the
 * smallest WebP the qualities gave; null when this browser encodes no WebP (Safari answers a PNG
 * blob for the type, which is read off `blob.type`) so the caller keeps the PNG.
 */
async function encodeWebp(canvas: HTMLCanvasElement, maxBytes: number): Promise<Uint8Array | null> {
  let smallest: Uint8Array | null = null;
  for (const quality of FRAME_WEBP_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/webp', quality),
    );
    if (blob === null || blob.type !== 'image/webp') return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length <= maxBytes) return bytes;
    if (smallest === null || bytes.length < smallest.length) smallest = bytes;
  }
  return smallest;
}

/**
 * Draws the frame of a block in this browser (5.5, the client's pixel path). Throws when WebGL
 * is unavailable or the canvas never reaches the frame size, so the caller falls back to the
 * hosted `shader.capture`.
 */
export async function captureShaderFrame(
  block: FrameKeyBlock,
  palette: ShaderPalette,
  options: CaptureOptions = {},
): Promise<ShaderFrameCapture> {
  const size = frameSizeFor(materialAspectOf(block));
  const anchor = anchorOf(block);
  const frameKey = frameKeyOf(block, palette);
  const { mountMaterial } = await loadMaterialMount();
  const host = captureHost(size);
  let handle: MaterialHandle | null = null;
  try {
    handle = await mountMaterial(
      host,
      {
        materialId: block.materialId,
        ...(block.preset !== undefined ? { preset: block.preset } : {}),
        ...(block.uniforms !== undefined ? { uniforms: block.uniforms } : {}),
        anchor,
      },
      {
        speed: 0,
        frame: anchor,
        minPixelRatio: 2,
        maxPixelCount: size[0] * size[1] + 1,
        contextAttributes: { preserveDrawingBuffer: true, antialias: false },
        palette,
      },
    );
    const mount = handle.mount as unknown as {
      parentWidth: number;
      devicePixelsSupported: boolean;
      setMinPixelRatio: (ratio: number) => void;
      setFrame: (ms: number) => void;
      canvasElement: HTMLCanvasElement;
    };
    for (let i = 0; i < CAPTURE_WAIT_FRAMES && mount.parentWidth === 0; i += 1) await nextFrame();
    // the fallback path of Paper's resize: the CSS box times max(dpr, minPixelRatio), so a 1x
    // display also reaches the target pixels (materials capture.ts, the same clearing)
    mount.devicePixelsSupported = false;
    mount.setMinPixelRatio(2);
    const canvas = mount.canvasElement;
    for (
      let i = 0;
      i < CAPTURE_WAIT_FRAMES && (canvas.width !== size[0] || canvas.height !== size[1]);
      i += 1
    )
      await nextFrame();
    if (canvas.width !== size[0] || canvas.height !== size[1])
      throw new Error(
        `the capture canvas is ${canvas.width} by ${canvas.height}, not ${size[0]} by ${size[1]}`,
      );
    mount.setFrame(anchor);
    const renderer = webglRendererOf(canvas);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result === null) reject(new Error('the capture canvas gave no PNG'));
        else resolve(result);
      }, 'image/png');
    });
    let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
    let type: FrameEncoding = 'image/png';
    if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
      const webp = await encodeWebp(canvas, options.maxBytes);
      if (webp !== null) {
        bytes = webp;
        type = 'image/webp';
      }
    }
    return { bytes, type, width: canvas.width, height: canvas.height, renderer, frameKey };
  } finally {
    handle?.dispose();
    host.remove();
  }
}

/** The recipe of a shader ground (Change background > Shader): what `slide.setBackgroundMaterial` takes. */
export type BackgroundShaderRecipe = {
  materialId: string;
  preset?: string;
  uniforms?: MaterialUniforms;
  anchor?: number;
};

/**
 * The block a shader ground's frame is keyed and sized by (docs/FEATURES.md 5.5; docs/POLISH.md
 * section 2.5, the polish round's fix round 2 for `shaders.background.place-answers`): a covering
 * box at the sheet's own aspect, so `frameSizeFor(materialAspectOf(block))` reads 3200 by 1800
 * and `frameKeyOf` hashes the same recipe the hosted job would render. Pure; the capture below
 * draws it in this browser.
 */
export function backgroundFrameBlock(recipe: BackgroundShaderRecipe): FrameKeyBlock {
  return {
    materialId: recipe.materialId,
    ...(recipe.preset !== undefined ? { preset: recipe.preset } : {}),
    ...(recipe.uniforms !== undefined ? { uniforms: recipe.uniforms } : {}),
    ...(recipe.anchor !== undefined ? { anchor: recipe.anchor } : {}),
    pos: { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT, z: 0 },
  };
}

/**
 * The frame of a shader ground drawn in this browser, the same pixel path as a block's frame
 * (`captureShaderFrame`), so Change background > Shader > Place sends the bytes with its one write
 * and the function stores them instead of launching Chromium (the walk's Place waited 17 s on the
 * run of record and past 65 s on its rerun for the hosted render; the verifier's pass 2 finding 14).
 */
export function captureBackgroundFrame(
  recipe: BackgroundShaderRecipe,
  palette: ShaderPalette,
  options: CaptureOptions = {},
): Promise<ShaderFrameCapture> {
  return captureShaderFrame(backgroundFrameBlock(recipe), palette, options);
}

// ---------------------------------------------------------------------------------------------
// The capturer: what schedules a frame, when, and how the write goes up

export type ShaderFrameWrite = {
  slideId: string;
  blockId: string;
  frameKey: string;
  /** The PNG or WebP as base64, or an upload key when the deps uploaded a PNG first. */
  bytes?: string;
  upload?: string;
  renderer: string;
};

export type ShaderFrameWriteOutcome =
  | { ok: true; revision: number }
  /** The server said the block's key moved on or the base was stale: the client re reads. */
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: unknown };

export type ShaderCapturerDeps = {
  /** The latest local document (the controller's `latest().document`). */
  document: () => DeckDocument;
  /** The system write of `shader.frame` through the controller's queue (5.5). */
  write: (input: ShaderFrameWrite) => Promise<ShaderFrameWriteOutcome>;
  /** The hosted fallback when the client cannot draw (`shader.capture`); absent leaves the block without a frame. */
  captureHosted?: (slideId: string, blockId: string) => Promise<unknown>;
  /**
   * Uploads a PNG over the presign threshold and answers the key (`shader.frame { upload }`); the
   * grant the controller asks declares `image/png`, so a WebP never takes this path.
   */
  upload?: (bytes: Uint8Array) => Promise<string>;
  /** Above this many bytes the frame is a WebP, or goes through `upload` (the function's body cap; 3 MB as the picture path). */
  uploadAbove?: number;
  /** The rest after the last change; FRAME_DEBOUNCE_MS by default. */
  delayMs?: number;
  /** The capture itself; the real one by default, a fake in a test. */
  capture?: (
    block: MaterialBlock,
    palette: ShaderPalette,
    options?: CaptureOptions,
  ) => Promise<ShaderFrameCapture>;
  canCapture?: () => boolean;
  onError?: (error: unknown) => void;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

export type ShaderFrameCapturer = {
  /**
   * The mutations of a commit this client made (never an entry that arrived from the room): every
   * shader block they touch is scheduled, and a kit colour write schedules every shader on the deck.
   */
  afterCommit: (mutations: ReadonlyArray<Mutation>) => void;
  /** Schedules one block (a resize the gesture commits, a paste). */
  schedule: (slideId: string, blockId: string) => void;
  /** Schedules every shader block whose frame is stale by key (a deck opened with stale frames). */
  scheduleStale: () => void;
  /** The blocks waiting or capturing, for a test and the status line. */
  pending: () => string[];
  dispose: () => void;
};

/** `slideId#blockId` of every material block a document holds. */
export function materialBlocksOf(
  document: DeckDocument,
): { slideId: string; block: MaterialBlock }[] {
  const out: { slideId: string; block: MaterialBlock }[] = [];
  for (const slide of Object.values(document.slides))
    for (const { block } of slideBlocks(slide))
      if (block.type === 'material') out.push({ slideId: slide.id, block });
  return out;
}

/** The `slideId#blockId` pairs a commit's mutations touch that name a shader block, plus every shader on a kit colour write. */
export function shaderBlocksTouched(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): { slideId: string; blockId: string }[] {
  const touched = new Map<string, { slideId: string; blockId: string }>();
  const all = () => {
    for (const { slideId, block } of materialBlocksOf(document))
      touched.set(`${slideId}#${block.id}`, { slideId, blockId: block.id });
  };
  const isMaterial = (slideId: string, blockId: string): boolean => {
    const slide = document.slides[slideId];
    if (slide === undefined) return false;
    return slideBlocks(slide).some(
      (row) => row.block.id === blockId && row.block.type === 'material',
    );
  };
  for (const mutation of mutations) {
    switch (mutation.op) {
      case 'block.set':
      case 'block.move':
        if (isMaterial(mutation.slideId, mutation.blockId))
          touched.set(`${mutation.slideId}#${mutation.blockId}`, {
            slideId: mutation.slideId,
            blockId: mutation.blockId,
          });
        break;
      case 'block.insert':
        if (mutation.block.type === 'material')
          touched.set(`${mutation.slideId}#${mutation.block.id}`, {
            slideId: mutation.slideId,
            blockId: mutation.block.id,
          });
        break;
      case 'slide.replace':
      case 'slide.set':
        for (const { block } of slideBlocks(
          document.slides[mutation.slideId] ?? ({ kind: 'content', slots: {} } as never),
        ))
          if (block.type === 'material')
            touched.set(`${mutation.slideId}#${block.id}`, {
              slideId: mutation.slideId,
              blockId: block.id,
            });
        break;
      case 'deck.set':
        if (
          mutation.path === '/brand' ||
          mutation.path.startsWith('/brand/colors') ||
          mutation.path === '/defaults/appearance'
        )
          all();
        break;
      case 'version.restore':
        all();
        break;
      default:
        break;
    }
  }
  return [...touched.values()];
}

/** The base64 of PNG bytes without growing a string per byte. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

/** The presign threshold of the picture path (apps/studio/src/server/upload.ts): 3 MB. */
export const FRAME_UPLOAD_ABOVE_BYTES = 3 * 1024 * 1024;

/**
 * The one sentence the editor shows when a block's frame could not be saved after the capturer's
 * own retry (docs/POLISH.md item 36; audit-media item 2: god rays at 727 by 412 answered 413 four
 * times and nothing said so). The controller wires it to the snackbar through `onError`.
 */
export const SHADER_FRAME_FAILED_SENTENCE =
  'The shader’s frame could not be saved. Change the shader to try again';

/**
 * One capturer per editor (5.5, the shared editor rule): debounced per block, one capture at a
 * time, the write through the controller's queue, the 409 rule, the hosted fallback.
 *
 * The frame over the function's cap (docs/POLISH.md item 36; the polish round's verifier, pass 1
 * finding 2: a god rays PNG at the content box answered 413 on the presigned PUT too, since a
 * deployment's upload route is a function with the same 4.5 MB body cap, and the retry's grant
 * answered 429 while the first upload's slot was held). The capture is given `uploadAbove` (3 MB,
 * the picture path's presign threshold; base64 grows the bytes by a third) as its cap, and a PNG
 * over it comes back as a WebP of the same pixels from the same canvas, a fraction of the bytes,
 * which travels inside the write as base64 and which the server writes as the PNG twin
 * (materials actions.ts `frameBytesAsPng`). A PNG still over the cap (a browser that encodes no
 * WebP) goes up through `deps.upload`, the presigned PUT the picture intake uses, and the write
 * names the upload's key; a WebP still over the cap, or a PNG over it on a page without an upload
 * path, asks the hosted `shader.capture`, which draws and stores the frame inside the function, so
 * no frame is ever sent through a body it cannot fit. A failed capture, put or write is tried once
 * more, and when the second attempt fails too `onError` is called once with the error, so the
 * editor shows one sentence (`SHADER_FRAME_FAILED_SENTENCE`) and never one per attempt.
 *
 * The head behind the tab's own recipe commit (the polish round's fix round 2, the rows
 * `shaders.panel.kit-colours` and `shaders.panel.preset-tiles`; read on the memory tier under a
 * one minute load of 19 to 21: three writes of three after a preset click, a swatch click and a
 * kit colour write answered "the block's recipe moved on since the frame was drawn", the frame
 * was drawn a second time for the same key and the tab showed the sentence, while the frame
 * reached the document 32 s later). The write's 409 names two cases the capturer tells apart by
 * the tab's own block: a key that moved on drops the write; a key that stands means the head has
 * not taken this tab's commit yet (the acknowledgement's time, seconds on the blob tier), so the
 * write is scheduled again after the rest, up to `CONFLICT_RESCHEDULES` times, with the frame
 * already drawn kept under its key (`drawn`) so the same pixels are never drawn twice; the last
 * miss is reported once. A frame under its key is drawn once per capturer, however many attempts
 * its write takes.
 */
/**
 * How many times a write that met a head still behind this tab's own recipe commit is scheduled
 * again before the one sentence. The waits double from the rest (0.8, 1.6, 3.2, 6.4 and 12.8 s,
 * `conflictWait`): the blob tier's acknowledgement is 1 to 4 s, and the memory tier's head takes
 * a tab's own commit at its checkpoint, read at 7 s under load and once at 32 s, so the five waits
 * reach past both with five writes of the frame and not thirty.
 */
export const CONFLICT_RESCHEDULES = 5;

/** The wait before the next write after `misses` conflicts with the tab's own key unchanged: the rest, doubled per miss. */
export function conflictWait(delay: number, misses: number): number {
  return delay * 2 ** Math.max(0, misses - 1);
}

export function createShaderFrameCapturer(deps: ShaderCapturerDeps): ShaderFrameCapturer {
  const delay = deps.delayMs ?? FRAME_DEBOUNCE_MS;
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const capture = deps.capture ?? captureShaderFrame;
  const canCapture = deps.canCapture ?? clientCanCapture;
  const timers = new Map<string, unknown>();
  const capturing = new Set<string>();
  /* the frames drawn and not yet stored, by frame key: a write tried again reuses the pixels */
  const drawn = new Map<string, ShaderFrameCapture>();
  /* the writes of a frame key that met a head behind the tab's own commit; the count stands
     through the last attempt, so the catch's one more try ends the cycle instead of restarting it */
  const behind = new Map<string, number>();
  /* the frame key each block last drew, so a block that moved on drops its older key's entries */
  const lastKey = new Map<string, string>();
  let disposed = false;
  let chain: Promise<void> = Promise.resolve();

  const keyOf = (slideId: string, blockId: string) => `${slideId}#${blockId}`;

  const blockOf = (slideId: string, blockId: string): MaterialBlock | null => {
    const document = deps.document();
    const slide = document.slides[slideId];
    if (slide === undefined) return null;
    const block = slideBlocks(slide).find((row) => row.block.id === blockId)?.block;
    return block !== undefined && block.type === 'material' ? block : null;
  };

  const run = async (slideId: string, blockId: string): Promise<void> => {
    if (disposed) return;
    const key = keyOf(slideId, blockId);
    const document = deps.document();
    const block = blockOf(slideId, blockId);
    const dropOlder = (keep: string | null) => {
      const previous = lastKey.get(key);
      if (previous !== undefined && previous !== keep) {
        drawn.delete(previous);
        behind.delete(previous);
      }
      if (keep === null) lastKey.delete(key);
      else lastKey.set(key, keep);
    };
    if (block === null) {
      dropOlder(null);
      return;
    }
    const palette = shaderPaletteOfDeck(document.deck);
    if (!frameIsStale(block, document.deck.assets, palette)) {
      dropOlder(null);
      return;
    }
    if (!canCapture()) {
      await deps.captureHosted?.(slideId, blockId);
      return;
    }
    const cap = deps.uploadAbove ?? FRAME_UPLOAD_ABOVE_BYTES;
    const wanted = frameKeyOf(block, palette);
    dropOlder(wanted);
    // the pixels of a key are drawn once: a write tried again, after a conflict or a failed put, reuses them
    const frame = drawn.get(wanted) ?? (await capture(block, palette, { maxBytes: cap }));
    if (disposed) return;
    drawn.set(frame.frameKey, frame);
    const forget = () => {
      drawn.delete(frame.frameKey);
      behind.delete(frame.frameKey);
      lastKey.delete(key);
    };
    const input: ShaderFrameWrite = {
      slideId,
      blockId,
      frameKey: frame.frameKey,
      renderer: frame.renderer,
    };
    const overCap = frame.bytes.length > cap;
    const png = (frame.type ?? 'image/png') === 'image/png';
    if (!overCap) input.bytes = bytesToBase64(frame.bytes);
    else if (png && deps.upload !== undefined) input.upload = await deps.upload(frame.bytes);
    else {
      // no path for these bytes on this page: the hosted job draws and stores the frame in the function
      forget();
      if (deps.captureHosted === undefined)
        throw new Error(
          `the frame is ${frame.bytes.length} bytes, over the function's cap, and the page has no upload path`,
        );
      await deps.captureHosted(slideId, blockId);
      return;
    }
    const outcome = await deps.write(input);
    if (outcome.ok) {
      forget();
      return;
    }
    if (!outcome.conflict) throw outcome.error;
    // the 409 rule: the block gone or re keyed drops the write
    const again = blockOf(slideId, blockId);
    if (
      again === null ||
      frameKeyOf(again, shaderPaletteOfDeck(deps.document().deck)) !== frame.frameKey
    ) {
      forget();
      return;
    }
    // the key stands: the head has not taken this tab's own commit yet; the write goes again after
    // the rest, with the pixels kept, and the last miss is the one sentence (the count stays on
    // the key, so the catch's one more attempt is the last write and not a new cycle)
    const misses = (behind.get(frame.frameKey) ?? 0) + 1;
    behind.set(frame.frameKey, misses);
    if (misses > CONFLICT_RESCHEDULES)
      throw new Error(
        `the head kept an older recipe of the block through ${misses} writes of its frame`,
      );
    schedule(slideId, blockId, conflictWait(delay, misses));
  };

  const fire = (slideId: string, blockId: string) => {
    const key = keyOf(slideId, blockId);
    timers.delete(key);
    capturing.add(key);
    chain = chain
      .then(() => run(slideId, blockId))
      .catch(async () => {
        // one more attempt after a failed capture, put or write; then the one sentence
        if (disposed) return;
        try {
          await run(slideId, blockId);
        } catch (error: unknown) {
          deps.onError?.(error);
        }
      })
      .finally(() => capturing.delete(key));
  };

  const schedule = (slideId: string, blockId: string, wait: number = delay) => {
    if (disposed) return;
    const key = keyOf(slideId, blockId);
    const held = timers.get(key);
    if (held !== undefined) clearTimer(held);
    timers.set(
      key,
      setTimer(() => fire(slideId, blockId), wait),
    );
  };

  return {
    afterCommit: (mutations) => {
      for (const { slideId, blockId } of shaderBlocksTouched(deps.document(), mutations))
        schedule(slideId, blockId);
    },
    schedule: (slideId, blockId) => schedule(slideId, blockId),
    scheduleStale: () => {
      const document = deps.document();
      const palette = shaderPaletteOfDeck(document.deck);
      for (const { slideId, block } of materialBlocksOf(document))
        if (frameIsStale(block, document.deck.assets, palette)) schedule(slideId, block.id);
    },
    pending: () => [...new Set([...timers.keys(), ...capturing])],
    dispose: () => {
      disposed = true;
      for (const id of timers.values()) clearTimer(id);
      timers.clear();
      drawn.clear();
      behind.clear();
      lastKey.clear();
    },
  };
}
