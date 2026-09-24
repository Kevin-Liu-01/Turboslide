// The frame capturer's scheduling rule (docs/FEATURES.md 5.5; judge-design additions 3 and 6):
// a commit that touches a shader block schedules its capture 800 ms after the last change and
// one capture per block however many commits land inside the rest; a kit colour write schedules
// every shader on the deck; a fresh frame by key captures nothing; the write goes up with the
// key, the renderer and the bytes; a conflict re reads and drops the write when the block's key
// moved on, and retries once otherwise. The pixel path (captureShaderFrame) needs WebGL and is
// driven in the browser by core/shaders.spec.ts; here the capture is a fake.
import { describe, expect, it } from 'vitest';

import { frameAssetId, frameKeyOf } from '@turboslide/materials/recipe-key';
import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import type { ContentSlide, DeckDocument } from '@turboslide/schema/deck';
import { freeformDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import {
  bytesToBase64,
  createShaderFrameCapturer,
  materialBlocksOf,
  shaderBlocksTouched,
} from '../shader-frame';
import type { ShaderFrameWrite, ShaderFrameWriteOutcome } from '../shader-frame';

const SLIDE = 'free';

function shader(id: string, extra: Partial<MaterialBlock> = {}): MaterialBlock {
  return {
    id,
    type: 'material',
    materialId: 'paper:liquid-metal',
    preset: 'diamond',
    pos: { x: 100, y: 400, w: 480, h: 272, z: 5 },
    alt: 'The liquid metal shader',
    ...extra,
  };
}

function documentWith(blocks: MaterialBlock[]): DeckDocument {
  const doc = freeformDocument();
  const slide = doc.slides[SLIDE] as ContentSlide;
  slide.slots.main = [...(slide.slots.main ?? []), ...(blocks as Block[])];
  return doc;
}

/** A fake clock: timers fire when `advance` passes their time. */
function clock() {
  let now = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    now: () => now,
    setTimer: (run: () => void, ms: number): unknown => {
      const id = next;
      next += 1;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number);
    },
    advance: async (ms: number) => {
      now += ms;
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.run();
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    },
    pending: () => timers.size,
  };
}

describe('what a commit schedules', () => {
  it('names the shader blocks a commit touches, and every shader on a kit colour write', () => {
    const doc = documentWith([shader('shader'), shader('shader-2')]);
    expect(materialBlocksOf(doc).map((row) => row.block.id)).toEqual(['shader', 'shader-2']);
    const set: Mutation = {
      op: 'block.set',
      slideId: SLIDE,
      blockId: 'shader',
      path: '/controls',
      value: { strength: 1 },
    };
    expect(shaderBlocksTouched(doc, [set])).toEqual([{ slideId: SLIDE, blockId: 'shader' }]);
    const text: Mutation = {
      op: 'block.set',
      slideId: SLIDE,
      blockId: 'h',
      path: '/text',
      value: 'x',
    };
    expect(shaderBlocksTouched(doc, [text])).toEqual([]);
    const kit: Mutation = { op: 'deck.set', path: '/brand/colors/light/primary', value: '#0b3d91' };
    expect(
      shaderBlocksTouched(doc, [kit])
        .map((row) => row.blockId)
        .sort(),
    ).toEqual(['shader', 'shader-2']);
    const title: Mutation = { op: 'deck.set', path: '/title', value: 'Q4' };
    expect(shaderBlocksTouched(doc, [title])).toEqual([]);
  });

  it('is base64 of the bytes', () => {
    expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('iVBORw==');
  });
});

describe('the capturer', () => {
  it('captures once 800 ms after the last change and writes the key, the renderer and the bytes', async () => {
    const block = shader('shader');
    let doc = documentWith([block]);
    const c = clock();
    const captures: string[] = [];
    const writes: ShaderFrameWrite[] = [];
    const capturer = createShaderFrameCapturer({
      document: () => doc,
      write: async (input) => {
        writes.push(input);
        return { ok: true, revision: 9 };
      },
      capture: async (target, palette) => {
        captures.push(target.id);
        return {
          bytes: new Uint8Array([1, 2, 3]),
          width: 3200,
          height: 1814,
          renderer: 'ANGLE (test)',
          frameKey: frameKeyOf(target, palette),
        };
      },
      canCapture: () => true,
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    const set: Mutation = {
      op: 'block.set',
      slideId: SLIDE,
      blockId: 'shader',
      path: '/anchor',
      value: 4000,
    };
    capturer.afterCommit([set]);
    await c.advance(500);
    capturer.afterCommit([set]);
    await c.advance(500);
    expect(captures).toEqual([]);
    expect(capturer.pending()).toEqual([`${SLIDE}#shader`]);
    await c.advance(400);
    expect(captures).toEqual(['shader']);
    expect(writes).toHaveLength(1);
    const write = writes[0];
    expect(write?.frameKey).toBe(frameKeyOf(block));
    expect(write?.renderer).toBe('ANGLE (test)');
    expect(write?.bytes).toBe('AQID');
    expect(capturer.pending()).toEqual([]);

    // a fresh frame by key captures nothing more
    const assetId = frameAssetId(frameKeyOf(block));
    const asset: Asset = {
      id: assetId,
      role: 'frame',
      alt: block.alt,
      twins: { neutral: `assets/${assetId}@2x.png` },
      size: [3200, 1814],
      scale: 2,
      source: {
        kind: 'material',
        materialId: block.materialId,
        uniforms: {},
        size: [3200, 1814],
        timeMs: 5500,
        backend: 'client',
        renderer: 'ANGLE (test)',
        recipeKey: 'sha256:x',
        frameKey: frameKeyOf(block),
      },
      inline: 'native',
    };
    doc = documentWith([{ ...block, asset: assetId }]);
    doc.deck.assets[assetId] = asset;
    capturer.afterCommit([set]);
    await c.advance(900);
    expect(captures).toEqual(['shader']);
    capturer.dispose();
  });

  it('drops the write on a conflict when the block’s key moved on, and retries once otherwise', async () => {
    let doc = documentWith([shader('shader')]);
    const c = clock();
    const outcomes: ShaderFrameWriteOutcome[] = [
      { ok: false, conflict: true },
      { ok: true, revision: 3 },
    ];
    const writes: ShaderFrameWrite[] = [];
    const capturer = createShaderFrameCapturer({
      document: () => doc,
      write: async (input) => {
        writes.push(input);
        return outcomes.shift() ?? { ok: true, revision: 4 };
      },
      capture: async (target, palette) => ({
        bytes: new Uint8Array([7]),
        width: 3200,
        height: 1814,
        renderer: 'r',
        frameKey: frameKeyOf(target, palette),
      }),
      canCapture: () => true,
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    capturer.schedule(SLIDE, 'shader');
    await c.advance(800);
    // the block held its key: the write went once more and landed
    expect(writes).toHaveLength(2);

    // the block moved on before the retry: the write is dropped
    const moved = shader('shader', { anchor: 7000 });
    outcomes.push({ ok: false, conflict: true });
    capturer.schedule(SLIDE, 'shader');
    doc = documentWith([shader('shader')]);
    let reads = 0;
    const capturer2 = createShaderFrameCapturer({
      document: () => {
        reads += 1;
        return reads > 2 ? documentWith([moved]) : doc;
      },
      write: async () => ({ ok: false, conflict: true }),
      capture: async (target, palette) => ({
        bytes: new Uint8Array([7]),
        width: 3200,
        height: 1814,
        renderer: 'r',
        frameKey: frameKeyOf(target, palette),
      }),
      canCapture: () => true,
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    const before = writes.length;
    capturer2.schedule(SLIDE, 'shader');
    await c.advance(800);
    expect(writes.length).toBe(before + 2);
    capturer.dispose();
    capturer2.dispose();
  });

  it('asks the hosted job when the client cannot draw', async () => {
    const doc = documentWith([shader('shader')]);
    const c = clock();
    const hosted: string[] = [];
    const capturer = createShaderFrameCapturer({
      document: () => doc,
      write: async () => ({ ok: true, revision: 1 }),
      captureHosted: async (_slideId, blockId) => {
        hosted.push(blockId);
      },
      canCapture: () => false,
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    capturer.scheduleStale();
    await c.advance(800);
    expect(hosted).toEqual(['shader']);
    capturer.dispose();
  });
});
