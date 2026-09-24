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
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { loadMaterialMount } from './MaterialMount';

/** The rest after the last change before a capture (5.5). */
export const FRAME_DEBOUNCE_MS = 800;

/** How many animation frames the capture waits for the host's box and for the canvas's size. */
const CAPTURE_WAIT_FRAMES = 240;

export type ShaderFrameCapture = {
  /** The PNG bytes of the frame. */
  bytes: Uint8Array;
  width: number;
  height: number;
  /** The WebGL renderer string of the client, for the asset's source. */
  renderer: string;
  frameKey: string;
};

/** True when this browser can draw a frame itself; false sends the block to the hosted `shader.capture`. */
export function clientCanCapture(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
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
 * Draws the frame of a block in this browser (5.5, the client's pixel path). Throws when WebGL
 * is unavailable or the canvas never reaches the frame size, so the caller falls back to the
 * hosted `shader.capture`.
 */
export async function captureShaderFrame(
  block: FrameKeyBlock,
  palette: ShaderPalette,
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
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, width: canvas.width, height: canvas.height, renderer, frameKey };
  } finally {
    handle?.dispose();
    host.remove();
  }
}

// ---------------------------------------------------------------------------------------------
// The capturer: what schedules a frame, when, and how the write goes up

export type ShaderFrameWrite = {
  slideId: string;
  blockId: string;
  frameKey: string;
  /** The PNG as base64, or an upload key when the deps uploaded the bytes first. */
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
  /** Uploads bytes over the presign threshold and answers the key (`shader.frame { upload }`). */
  upload?: (bytes: Uint8Array) => Promise<string>;
  /** Above this many bytes the frame goes through `upload` (the function's body cap; 3 MB as the picture path). */
  uploadAbove?: number;
  /** The rest after the last change; FRAME_DEBOUNCE_MS by default. */
  delayMs?: number;
  /** The capture itself; the real one by default, a fake in a test. */
  capture?: (block: MaterialBlock, palette: ShaderPalette) => Promise<ShaderFrameCapture>;
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
 * One capturer per editor (5.5, the shared editor rule): debounced per block, one capture at a
 * time, the write through the controller's queue, the 409 rule, the hosted fallback.
 */
export function createShaderFrameCapturer(deps: ShaderCapturerDeps): ShaderFrameCapturer {
  const delay = deps.delayMs ?? FRAME_DEBOUNCE_MS;
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const capture = deps.capture ?? captureShaderFrame;
  const canCapture = deps.canCapture ?? clientCanCapture;
  const timers = new Map<string, unknown>();
  const capturing = new Set<string>();
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

  const run = async (slideId: string, blockId: string, retry: boolean): Promise<void> => {
    if (disposed) return;
    const document = deps.document();
    const block = blockOf(slideId, blockId);
    if (block === null) return;
    const palette = shaderPaletteOfDeck(document.deck);
    if (!frameIsStale(block, document.deck.assets, palette)) return;
    if (!canCapture()) {
      await deps.captureHosted?.(slideId, blockId);
      return;
    }
    const frame = await capture(block, palette);
    if (disposed) return;
    const input: ShaderFrameWrite = {
      slideId,
      blockId,
      frameKey: frame.frameKey,
      renderer: frame.renderer,
    };
    if (
      deps.upload !== undefined &&
      frame.bytes.length > (deps.uploadAbove ?? FRAME_UPLOAD_ABOVE_BYTES)
    )
      input.upload = await deps.upload(frame.bytes);
    else input.bytes = bytesToBase64(frame.bytes);
    const outcome = await deps.write(input);
    if (outcome.ok) return;
    if (!outcome.conflict) throw outcome.error;
    // the 409 rule: the head moved; the block gone or re keyed drops the write, else once more
    const again = blockOf(slideId, blockId);
    if (again === null) return;
    if (frameKeyOf(again, shaderPaletteOfDeck(deps.document().deck)) !== frame.frameKey) return;
    if (retry) await run(slideId, blockId, false);
  };

  const fire = (slideId: string, blockId: string) => {
    const key = keyOf(slideId, blockId);
    timers.delete(key);
    capturing.add(key);
    chain = chain
      .then(() => run(slideId, blockId, true))
      .catch((error: unknown) => deps.onError?.(error))
      .finally(() => capturing.delete(key));
  };

  const schedule = (slideId: string, blockId: string) => {
    if (disposed) return;
    const key = keyOf(slideId, blockId);
    const held = timers.get(key);
    if (held !== undefined) clearTimer(held);
    timers.set(
      key,
      setTimer(() => fire(slideId, blockId), delay),
    );
  };

  return {
    afterCommit: (mutations) => {
      for (const { slideId, blockId } of shaderBlocksTouched(deps.document(), mutations))
        schedule(slideId, blockId);
    },
    schedule,
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
    },
  };
}
