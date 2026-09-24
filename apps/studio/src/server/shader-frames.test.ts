// The studio's half of the shader frame (docs/FEATURES.md 5.5, 5.8; the named tests of 7.3 that
// fall to B7): the hosted capture's bound and its one sentence, the orphan prune scheduled behind a
// frame write's response, and the export's wait for a frame on its way, over a scratch copy of the
// export fixture deck with a shader block on it. No browser: a frame record is written as the
// materials write leaves it.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { shaderPaletteOfDeck } from '@turboslide/materials/presets';
import { frameAssetId, frameKeyOf } from '@turboslide/materials/recipe-key';
import { createQueue } from '@turboslide/render-worker/queue';
import type { Asset } from '@turboslide/schema/assets';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import type { FrameFileEntry } from '@turboslide/store/frames';

import {
  CAPTURE_BOUND_MS,
  FRAME_PRUNE_EVERY_MS,
  RENDER_ERROR_SENTENCE,
  RenderError,
  boundedCapture,
  frameFileLister,
  isCallerRefusal,
  materialBlocksOf,
  pendingShaderBlocks,
  pruneDue,
  scheduleFramePrune,
  waitForShaderFrames,
} from './shader-frames';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const SLIDE = 'background-picture';
const BLOCK = 'sh1';
const author = { kind: 'human' as const, name: 'b7-test' };

let dir: string;
let store: FileStore;

async function document(): Promise<DeckDocument> {
  return (await store.read()).document;
}

async function block(): Promise<MaterialBlock> {
  const slide = (await document()).slides[SLIDE];
  if (slide === undefined) throw new Error('no slide');
  const found = materialBlocksOf(slide).find((b) => b.id === BLOCK);
  if (found === undefined) throw new Error('no block');
  return found;
}

/** The frame record the materials write leaves for the block's key now, and the block naming it. */
async function writeFreshFrame(): Promise<string> {
  const doc = await document();
  const key = frameKeyOf(await block(), shaderPaletteOfDeck(doc.deck));
  const id = frameAssetId(key);
  const asset: Asset = {
    id,
    role: 'frame',
    alt: 'The liquid metal shader',
    twins: { neutral: `assets/${id}@2x.png` },
    size: [3200, 1800],
    scale: 2,
    source: {
      kind: 'material',
      materialId: 'paper:liquid-metal',
      uniforms: {},
      size: [3200, 1800],
      timeMs: 5500,
      backend: 'client',
      renderer: 'test',
      recipeKey: 'sha256:0',
      frameKey: key,
    },
    inline: 'native',
  };
  const outcome = await store.write({
    baseRevision: doc.deck.revision,
    author,
    mutations: [
      { op: 'asset.set', asset },
      { op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/asset', value: id },
    ],
  });
  if (!outcome.ok) throw new Error(outcome.message);
  return id;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ts-b7-shader-frame-'));
  cpSync(FIXTURE, dir, { recursive: true });
  store = openFileStore({ dir });
  const revision = (await document()).deck.revision;
  const outcome = await store.write({
    baseRevision: revision,
    author,
    mutations: [
      {
        op: 'block.insert',
        slideId: SLIDE,
        slot: 'main',
        block: {
          id: BLOCK,
          type: 'material',
          materialId: 'paper:liquid-metal',
          alt: 'The liquid metal shader',
          pos: { x: 900, y: 300, w: 480, h: 272 },
        },
      },
    ],
  });
  if (!outcome.ok) throw new Error(outcome.message);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the hosted capture’s bound (docs/FEATURES.md 5.5; audit-shaders 1)', () => {
  it('reads the one sentence B1’s dialog shows, and the bound is 30 s', () => {
    expect(RENDER_ERROR_SENTENCE).toBe(
      'The frame could not be rendered. Try again, or place the shader without a frame',
    );
    expect(CAPTURE_BOUND_MS).toBe(30_000);
    const error = new RenderError(
      new Error('browserContext.close: Target page, context or browser has been closed'),
    );
    expect(error.message).toBe(RENDER_ERROR_SENTENCE);
    expect(error.status).toBe(500);
    expect(error.reason).toContain('browserContext.close');
  });

  it('answers the sentence after the bound while the capture runs on, without a queue', async () => {
    let finished = false;
    const slow = () =>
      new Promise<string>((r) =>
        setTimeout(() => {
          finished = true;
          r('late');
        }, 80),
      );
    await expect(boundedCapture(slow, { boundMs: 20, label: 'test' })).rejects.toMatchObject({
      name: 'RenderError',
      message: RENDER_ERROR_SENTENCE,
    });
    expect(finished).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(finished).toBe(true);
  });

  it('answers the sentence for a browser failure and passes the caller’s own refusals through', async () => {
    await expect(
      boundedCapture(
        async () => {
          throw new Error('Browser logs: <launching> /tmp/chromium');
        },
        { boundMs: 100, label: 'test' },
      ),
    ).rejects.toMatchObject({ name: 'RenderError', message: RENDER_ERROR_SENTENCE });
    const conflict = new ConflictError('stale', { currentRevision: 4 });
    await expect(
      boundedCapture(
        async () => {
          throw conflict;
        },
        { boundMs: 100, label: 'test' },
      ),
    ).rejects.toBe(conflict);
    const bad = new TypeError('materialId is required');
    await expect(
      boundedCapture(
        async () => {
          throw bad;
        },
        { boundMs: 100, label: 'test' },
      ),
    ).rejects.toBe(bad);
    expect(isCallerRefusal(conflict)).toBe(true);
    expect(isCallerRefusal(new RangeError('no such material'))).toBe(true);
    expect(isCallerRefusal({ status: 429 })).toBe(true);
    expect(isCallerRefusal(new Error('the browser closed'))).toBe(false);
    expect(await boundedCapture(async () => 'frame', { boundMs: 100, label: 'test' })).toBe('frame');
  });

  it('runs through the render worker’s queue: done answers, a failure is the sentence, the bound is the wait’s', async () => {
    const queueDir = mkdtempSync(join(tmpdir(), 'ts-b7-queue-'));
    const queue = createQueue({ dir: queueDir });
    try {
      expect(await boundedCapture(async () => 'frame', { queue, boundMs: 500, label: 'ok' })).toBe(
        'frame',
      );
      await expect(
        boundedCapture(
          async () => {
            throw new Error('Target page, context or browser has been closed');
          },
          { queue, boundMs: 500, label: 'fails' },
        ),
      ).rejects.toMatchObject({ name: 'RenderError', message: RENDER_ERROR_SENTENCE });
      const conflict = new ConflictError('stale', { currentRevision: 4 });
      await expect(
        boundedCapture(
          async () => {
            throw conflict;
          },
          { queue, boundMs: 500, label: 'conflict' },
        ),
      ).rejects.toBe(conflict);
      await expect(
        boundedCapture(() => new Promise<string>((r) => setTimeout(() => r('late'), 300)), {
          queue,
          boundMs: 30,
          label: 'slow',
        }),
      ).rejects.toMatchObject({ name: 'RenderError', message: RENDER_ERROR_SENTENCE });
      // the queue kept the slow job and finishes it on its own
      await new Promise((r) => setTimeout(r, 350));
      expect(queue.stats().running).toBe(0);
    } finally {
      queue.close();
      rmSync(queueDir, { recursive: true, force: true });
    }
  });
});

describe('the orphan prune behind the response (docs/FEATURES.md 5.5)', () => {
  it('is due once a minute per deck on this instance', () => {
    const table = new Map<string, number>();
    expect(pruneDue('x', 0, FRAME_PRUNE_EVERY_MS, table)).toBe(true);
    expect(pruneDue('x', FRAME_PRUNE_EVERY_MS - 1, FRAME_PRUNE_EVERY_MS, table)).toBe(false);
    expect(pruneDue('y', FRAME_PRUNE_EVERY_MS - 1, FRAME_PRUNE_EVERY_MS, table)).toBe(true);
    expect(pruneDue('x', FRAME_PRUNE_EVERY_MS, FRAME_PRUNE_EVERY_MS, table)).toBe(true);
  });

  it('lists this instance’s assets folder with modification times when no Blob store answers', async () => {
    const list = frameFileLister('gslides', dir, async () => null);
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'frame-0123456789abcdef@2x.png'), new Uint8Array([1]));
    const entries = await list();
    const frame = entries.find((e) => e.relative === 'assets/frame-0123456789abcdef@2x.png');
    expect(frame).toBeDefined();
    expect(Date.parse(frame?.uploadedAt ?? '')).toBeGreaterThan(0);
    expect(await frameFileLister('gslides', join(dir, 'nowhere'), async () => null)()).toEqual([]);
  });

  it('removes an unreferenced frame older than the grace behind the response, keeps the referenced one, and runs once a minute', async () => {
    const referenced = await writeFreshFrame();
    const orphan: Asset = {
      id: 'frame-0000000000000000',
      role: 'frame',
      alt: 'an old frame',
      twins: { neutral: 'assets/frame-0000000000000000@2x.png' },
      size: [3200, 1800],
      scale: 2,
      source: {
        kind: 'material',
        materialId: 'paper:liquid-metal',
        uniforms: {},
        size: [3200, 1800],
        timeMs: 5500,
        backend: 'client',
        renderer: 'test',
        recipeKey: 'sha256:0',
        frameKey: 'sha256:0',
      },
      inline: 'native',
    };
    const seeded = await store.write({
      baseRevision: (await document()).deck.revision,
      author,
      mutations: [{ op: 'asset.set', asset: orphan }],
    });
    if (!seeded.ok) throw new Error(seeded.message);
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const listed: FrameFileEntry[] = [
      { relative: 'assets/frame-0000000000000000@2x.png', uploadedAt: old },
      { relative: `assets/${referenced}@2x.png`, uploadedAt: old },
    ];
    const work: Promise<unknown>[] = [];
    const deps = {
      deckId: 'gslides',
      store,
      listFrameFiles: async () => listed,
      after: (promise: Promise<unknown>) => {
        work.push(promise);
      },
      pruneTable: new Map<string, number>(),
    };
    expect(scheduleFramePrune(deps, 1_000_000)).toBe(true);
    expect(work.length).toBe(1);
    await Promise.all(work);
    const after = await document();
    expect(after.deck.assets[orphan.id]).toBeUndefined();
    expect(after.deck.assets[referenced]).toBeDefined();
    // a second write within the minute schedules nothing
    expect(scheduleFramePrune(deps, 1_000_000 + 30_000)).toBe(false);
    expect(work.length).toBe(1);
    expect(scheduleFramePrune(deps, 1_000_000 + FRAME_PRUNE_EVERY_MS)).toBe(true);
    await Promise.all(work);
  });
});

describe('the export’s wait for a frame (docs/FEATURES.md 5.5)', () => {
  it('names the shaders whose frame is missing or stale, and none once the frame is fresh', async () => {
    expect(pendingShaderBlocks(await document())).toEqual([`${SLIDE}#${BLOCK}`]);
    expect(pendingShaderBlocks(await document(), ['title'])).toEqual([]);
    const id = await writeFreshFrame();
    expect(pendingShaderBlocks(await document())).toEqual([]);
    // a frame with no key (captured before the round) is stale by that absence
    const doc = await document();
    const asset = doc.deck.assets[id] as Asset;
    if (asset.source.kind !== 'material') throw new Error('not material');
    const { frameKey: _dropped, ...source } = asset.source;
    const outcome = await store.write({
      baseRevision: doc.deck.revision,
      author,
      mutations: [{ op: 'asset.set', asset: { ...asset, source } }],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(pendingShaderBlocks(await document())).toEqual([`${SLIDE}#${BLOCK}`]);
    // a moved recipe: the key no longer matches the frame's
    const moved = await store.write({
      baseRevision: outcome.revision,
      author,
      mutations: [
        { op: 'asset.set', asset },
        { op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/anchor', value: 7000 },
      ],
    });
    if (!moved.ok) throw new Error(moved.message);
    expect(pendingShaderBlocks(await document())).toEqual([`${SLIDE}#${BLOCK}`]);
  });

  it('reads once and waits for nothing when every frame is fresh', async () => {
    await writeFreshFrame();
    let reads = 0;
    const wait = await waitForShaderFrames(
      async () => {
        reads += 1;
        return document();
      },
      { sleep: async () => {} },
    );
    expect(wait).toBeNull();
    expect(reads).toBe(1);
  });

  it('reads every tick until the frame lands and reports the count and the time; stops before a tick would pass the bound', async () => {
    let clock = 0;
    let reads = 0;
    const read = async (): Promise<DeckDocument> => {
      reads += 1;
      if (reads === 3) await writeFreshFrame();
      return document();
    };
    const wait = await waitForShaderFrames(read, {
      boundMs: 10_000,
      tickMs: 2_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(wait).toEqual({ pending: 1, waitedMs: 4000, left: 0 });
    expect(reads).toBe(3);

    // never lands: five ticks and out
    clock = 0;
    reads = 0;
    const cleared = await store.write({
      baseRevision: (await document()).deck.revision,
      author,
      mutations: [{ op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/asset' }],
    });
    if (!cleared.ok) throw new Error(cleared.message);
    const gaveUp = await waitForShaderFrames(
      async () => {
        reads += 1;
        return document();
      },
      {
        boundMs: 10_000,
        tickMs: 2_000,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );
    expect(gaveUp).toEqual({ pending: 1, waitedMs: 10_000, left: 1 });
    expect(reads).toBe(6);
  });
});
