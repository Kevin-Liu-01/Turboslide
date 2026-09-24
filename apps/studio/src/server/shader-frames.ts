// The studio's half of the shader library's resting still (docs/FEATURES.md 5.5, 5.8;
// audit-shaders 1, 2, 9; judge-design additions 3 to 6): the 30 s bound of the hosted capture with
// its one sentence, the orphan prune behind a `shader.frame` response, and the wait an export
// gives a frame that is still on its way.
//
// The write itself, `shader.frame { slideId, blockId, frameKey, bytes | upload, baseRevision }`,
// is one implementation on every transport (SPEC 7.1): the materials package's `shaderFrame`
// (packages/materials/src/actions.ts, B5), which the studio's dispatcher reaches through the lazily
// loaded asset dispatcher like `material.capture`, with the store that puts the file on every
// instance and the presigned upload reader a frame over the body cap needs. That write stores the
// file under `assets/frame-<16 hex of the key>@2x.png`, checks the key against the head, writes
// the block's `/asset` and removes the block's superseded frame in one revision. What this module
// adds around it is the studio's: the orphan prune (packages/store frames.ts `pruneFrameAssets`,
// B5's rule over the caller's listing) runs behind the response through `waitUntil`, at most once
// a minute per deck per instance, so a slider burst costs one listing and the cost rows of
// docs/SYNC.md 6.1 hold; the listing is the Blob prefix on a deployment and this instance's folder
// on a checkout or the tmp store.
//
// The hosted capture (`material.capture`, `shader.capture`, `slide.setBackgroundMaterial`) is the
// fallback for a browser without WebGL and the agent's route. It launches Chromium inside the
// function and the walk's Place ran 93 s and printed the browser's command line into the dialog
// (audit-shaders 1); `boundedCapture` runs it through the render worker's local queue (one browser
// at a time, behind a running render or export) and answers `RenderError` with one sentence after
// 30 s, whatever the cause; the dialog shows that sentence and never a log, and the cause goes to
// the server log. A refusal that is the caller's (a stale base, a malformed input, an unknown id)
// passes through unchanged so the client's own paths keep working.
//
// `waitForShaderFrames` is the export's wait (5.5, the exporters): a download started within 800 ms
// of a recipe change would render the old frame or none, so the export reads the head, and while a
// shader's frame is missing or stale (recipe-key.ts `frameIsStale`) reads it again every 2 s for
// up to 10 s, then reports the count it waited for and the seconds it waited as the report row
// report.ts `shaderReportRow` writes and the Download dialog's `progress.rows` carries. At most six
// document reads per export, none without a pending frame, no listing, no timer of its own
// (docs/SYNC.md 4.5).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { waitUntil } from '@vercel/functions';

import { SHADER_GALLERY } from '@turboslide/chrome/menus/strings';
import { shaderPaletteOfDeck } from '@turboslide/materials/presets';
import { frameIsStale } from '@turboslide/materials/recipe-key';
import type { Queue } from '@turboslide/render-worker/queue';
import type { Block } from '@turboslide/schema/blocks';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { ConflictError, ForbiddenError, GoneError } from '@turboslide/schema/errors';
import type { BlobClient } from '@turboslide/store/blob-store';
import { deckPrefix } from '@turboslide/store/blob-store';
import { pruneFrameAssets } from '@turboslide/store/frames';
import type { FrameFileEntry } from '@turboslide/store/frames';
import type { DeckStore } from '@turboslide/store/store';

// ---------------------------------------------------------------------------------------------
// The hosted capture's bound and its sentence

/**
 * The one sentence a failed or overlong hosted capture answers (5.5; the dialog shows it, never a
 * log): the chrome's constant, so the Background dialog's fallback and the server's answer are one
 * string (build/b7.md R4, build/b1.md R3).
 */
export const RENDER_ERROR_SENTENCE: string = SHADER_GALLERY.placeFailed;

/** How long the hosted capture may take before the caller hears the sentence (5.5: "a 30 s bound"). */
export const CAPTURE_BOUND_MS = 30_000;

/**
 * The hosted capture's failure on every transport: HTTP 500 (`errorStatus` maps a plain Error so),
 * the message the one sentence, the cause kept for the server log and never sent.
 */
export class RenderError extends Error {
  readonly status = 500;
  readonly reason: string;

  constructor(cause?: unknown) {
    super(RENDER_ERROR_SENTENCE);
    this.name = 'RenderError';
    this.reason = cause instanceof Error ? cause.message : cause === undefined ? '' : String(cause);
  }
}

/** True for a refusal that is the caller's and passes through the bound unchanged. */
export function isCallerRefusal(error: unknown): boolean {
  return (
    error instanceof ConflictError ||
    error instanceof ForbiddenError ||
    error instanceof GoneError ||
    error instanceof TypeError ||
    error instanceof RangeError ||
    (typeof error === 'object' &&
      error !== null &&
      typeof (error as { status?: unknown }).status === 'number' &&
      (error as { status: number }).status < 500)
  );
}

export type BoundedCaptureOptions = {
  /** The render worker's local queue; without one the bound is a plain race. */
  queue?: Queue;
  boundMs?: number;
  /** Names the job in the queue's log. */
  label: string;
  log?: (line: string) => void;
};

/**
 * Runs a hosted capture under the bound (5.5). Through the queue the capture waits behind the
 * running render or export and the next job waits behind it (one browser at a time); the caller
 * waits `boundMs` at most and then hears the sentence while the job runs on to its own end, its
 * late result unread. Without a queue the same race runs in place.
 */
export async function boundedCapture<T>(
  run: () => Promise<T>,
  options: BoundedCaptureOptions,
): Promise<T> {
  const boundMs = options.boundMs ?? CAPTURE_BOUND_MS;
  let failure: unknown;
  const guarded = async (): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  if (options.queue === undefined) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<{ late: true }>((resolve) => {
      timer = setTimeout(() => resolve({ late: true }), boundMs);
    });
    try {
      const won = await Promise.race([
        guarded().then((value) => ({ late: false as const, value })),
        late,
      ]);
      if (won.late) {
        options.log?.(`capture ${options.label}: past the ${boundMs} ms bound`);
        throw new RenderError(`${options.label} did not answer within ${boundMs} ms`);
      }
      return won.value;
    } catch (error) {
      throw rethrowAsRenderError(error, failure, options);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const record = await options.queue.run('render', { capture: options.label }, guarded, boundMs);
    if (record.status === 'done') return record.result as T;
    throw rethrowAsRenderError(
      failure ?? new Error(record.error?.message ?? 'failed'),
      failure,
      options,
    );
  } catch (error) {
    throw rethrowAsRenderError(error, failure, options);
  }
}

/** The caller's own refusal unchanged; anything else (a timeout, a browser) as the one sentence, the cause logged. */
function rethrowAsRenderError(
  error: unknown,
  failure: unknown,
  options: Pick<BoundedCaptureOptions, 'label' | 'log'>,
): unknown {
  if (error instanceof RenderError) return error;
  const cause = failure ?? error;
  if (isCallerRefusal(cause)) return cause;
  const rendered = new RenderError(cause);
  options.log?.(`capture ${options.label}: ${rendered.reason || 'failed'}`);
  return rendered;
}

// ---------------------------------------------------------------------------------------------
// The orphan prune behind a shader.frame response

/** How often the orphan prune may run per deck per instance (behind a `shader.frame` or `shader.capture` response). */
export const FRAME_PRUNE_EVERY_MS = 60_000;

const lastPruneAt = new Map<string, number>();

/** True when the deck's orphan prune is due on this instance; records the run. */
export function pruneDue(
  deckId: string,
  now: number,
  everyMs: number = FRAME_PRUNE_EVERY_MS,
  table: Map<string, number> = lastPruneAt,
): boolean {
  const last = table.get(deckId);
  if (last !== undefined && now - last < everyMs) return false;
  table.set(deckId, now);
  return true;
}

/** Runs `work` after the response: inside Vercel's `waitUntil` when a request context exists, detached otherwise (thumbs.ts afterResponse). */
export function runBehindResponse(work: Promise<unknown>, label: string): void {
  const settled = work.catch((error: unknown) => {
    console.error(
      `turboslide shader.frame: ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  try {
    waitUntil(settled);
  } catch {
    // no request context (the dev server, a test): the promise runs on its own
  }
}

/**
 * The deck's `assets/` files for the prune: the Blob prefix listing with its upload times on a
 * deployment, this instance's folder with the files' modification times on a checkout or the tmp
 * store. The one listing the prune costs (docs/SYNC.md 4.5), taken behind the response.
 */
export function frameFileLister(
  deckId: string,
  dir: string,
  blob: () => Promise<BlobClient | null>,
): () => Promise<ReadonlyArray<FrameFileEntry>> {
  return async () => {
    const client = await blob().catch(() => null);
    if (client !== null) {
      const prefix = `${deckPrefix(deckId)}assets/`;
      const entries = await client.list(prefix);
      return entries
        .filter((entry) => entry.pathname.startsWith(prefix))
        .map((entry) => ({
          relative: `assets/${entry.pathname.slice(prefix.length)}`,
          ...(entry.uploadedAt !== undefined ? { uploadedAt: entry.uploadedAt } : {}),
        }));
    }
    const folder = join(dir, 'assets');
    if (!existsSync(folder)) return [];
    return readdirSync(folder).flatMap((name) => {
      const stat = statSync(join(folder, name), { throwIfNoEntry: false });
      if (stat === undefined || !stat.isFile()) return [];
      return [{ relative: `assets/${name}`, uploadedAt: stat.mtime.toISOString() }];
    });
  };
}

export type FramePruneDeps = {
  deckId: string;
  /** The deck's store on the tier it lives on (the hosted store). */
  store: DeckStore;
  /** The deck's `assets/` files; `frameFileLister` builds one. */
  listFrameFiles: () => Promise<ReadonlyArray<FrameFileEntry>>;
  /** Runs work behind the response; `runBehindResponse` when absent. */
  after?: (work: Promise<unknown>, label: string) => void;
  /** At most one orphan prune per this many ms per deck per instance. */
  pruneEveryMs?: number;
  /** The throttle's table (a test's seam); this process's table when absent. */
  pruneTable?: Map<string, number>;
  log?: (line: string) => void;
};

/**
 * The orphan prune behind a frame write's response (5.5): once a minute per deck per instance,
 * over the caller's listing, never in the response path. Returns true when a prune was scheduled.
 */
export function scheduleFramePrune(deps: FramePruneDeps, now: number = Date.now()): boolean {
  if (!pruneDue(deps.deckId, now, deps.pruneEveryMs, deps.pruneTable)) return false;
  (deps.after ?? runBehindResponse)(
    pruneFrameAssets({
      store: deps.store,
      list: deps.listFrameFiles,
      ...(deps.log !== undefined ? { log: deps.log } : {}),
    }),
    `pruning the orphan frames of ${deps.deckId}`,
  );
  return true;
}

// ---------------------------------------------------------------------------------------------
// The export's wait for a frame on its way

/** Every material block of a slide, composites' cells included, in document order. */
export function materialBlocksOf(slide: Slide): MaterialBlock[] {
  const out: MaterialBlock[] = [];
  const visit = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if (block.type === 'composite') {
        for (const cell of block.cells) visit(cell.blocks);
        continue;
      }
      if (block.type === 'material') out.push(block);
    }
  };
  visit(slideBlocks(slide).map((row) => row.block));
  return out;
}

/** How long an export waits for a pending frame, and how often it reads the head meanwhile (5.5). */
export const SHADER_FRAME_WAIT_MS = 10_000;
export const SHADER_FRAME_WAIT_TICK_MS = 2_000;

export type ShaderFrameWait = {
  /** The shaders whose frame was missing or stale when the export started. */
  pending: number;
  /** How long the export waited, in ms; 0 when nothing was pending. */
  waitedMs: number;
  /** The shaders still without a fresh frame when the wait ended. */
  left: number;
};

/** The ids of the shader blocks whose frame is missing or stale over the deck's palette (recipe-key.ts frameIsStale). */
export function pendingShaderBlocks(
  document: DeckDocument,
  slideIds?: ReadonlyArray<string>,
): string[] {
  const palette = shaderPaletteOfDeck(document.deck);
  const wanted = slideIds === undefined ? null : new Set(slideIds);
  const out: string[] = [];
  for (const slide of Object.values(document.slides)) {
    if (wanted !== null && !wanted.has(slide.id)) continue;
    for (const block of materialBlocksOf(slide)) {
      if (frameIsStale(block, document.deck.assets, palette)) out.push(`${slide.id}#${block.id}`);
    }
  }
  return out;
}

export type WaitForShaderFramesOptions = {
  boundMs?: number;
  tickMs?: number;
  slideIds?: ReadonlyArray<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
};

/**
 * Reads the head; while a shader's frame is missing or stale, reads it again every tick until the
 * bound (a tick that would pass the bound is not taken). Null when nothing was pending at the
 * first read (the common export: no wait, one read).
 */
export async function waitForShaderFrames(
  read: () => Promise<DeckDocument>,
  options: WaitForShaderFramesOptions = {},
): Promise<ShaderFrameWait | null> {
  const boundMs = options.boundMs ?? SHADER_FRAME_WAIT_MS;
  const tickMs = options.tickMs ?? SHADER_FRAME_WAIT_TICK_MS;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  let pending = pendingShaderBlocks(await read(), options.slideIds);
  if (pending.length === 0) return null;
  const count = pending.length;
  options.log?.(`shaders: ${count} frame(s) pending at export time: ${pending.join(', ')}`);
  while (pending.length > 0 && now() - started + tickMs <= boundMs) {
    await sleep(tickMs);
    pending = pendingShaderBlocks(await read(), options.slideIds);
  }
  const waitedMs = now() - started;
  options.log?.(
    `shaders: waited ${waitedMs} ms; ${pending.length} frame(s) still pending${pending.length > 0 ? `: ${pending.join(', ')}` : ''}`,
  );
  return { pending: count, waitedMs, left: pending.length };
}
