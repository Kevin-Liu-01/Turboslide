// The shader.* actions on a file store (docs/FEATURES.md 5.5, 5.8, 7.3): `shader.list` answers
// the gallery's order with the categories, the previews and the control ranges; `shader.insert`
// lands a shader object with its featured preset, `motion.play: 'show'` and the placement the deps
// hand in (the sheet's centre without one), converting the slide first; `shader.set` writes the
// controls and the resolved uniforms in one write and a preset change clears both; `shader.frame`
// stores the PNG under the key derived id, writes the block's `/asset` and removes the block's
// superseded frame in the same revision, answers `existed` for the same bytes again, and refuses
// a key the block no longer has as a conflict; `shader.capture` and `shader.render` drive the
// capture browser and are covered by capture.test.ts. The ids are named here for the coverage
// test: shader.list, shader.insert, shader.set, shader.frame, shader.capture, shader.render.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import {
  SHADER_ACTION_ID_STRINGS,
  SHADER_INSERT_SIZE,
  pngSize,
  shaderFrame,
  shaderInsert,
  shaderList,
  shaderSet,
} from './actions.ts';
import type { AssetActionDeps, AssetWriteContext } from './actions.ts';
import { GALLERY_MATERIAL_IDS } from './catalog.ts';
import { frameAssetId, frameKeyOf } from './recipe-key.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const ctx: AssetWriteContext = { author: { kind: 'agent', name: 'b5-test' } };

let dir: string;
let store: FileStore;
let deps: AssetActionDeps;

async function document(): Promise<DeckDocument> {
  return (await store.read()).document;
}

async function revision(): Promise<number> {
  return (await document()).deck.revision;
}

/** A PNG of one colour at a size, from scratch (the signature, IHDR, one IDAT of filter 0 rows, IEND). */
function pngOf(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length, false);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)), false);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) raw.set(rgb, row + 1 + x * 3);
  }
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ts-b5-shader-'));
  cpSync(FIXTURE, dir, { recursive: true });
  store = openFileStore({ dir });
  deps = { store, cwd: REPO, allowPaths: true, hosted: false };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('shader.list', () => {
  it('answers the gallery order, the categories, the previews and the control ranges', () => {
    const listed = shaderList({}, undefined);
    expect(listed.shaders.map((entry) => entry.id)).toEqual([...GALLERY_MATERIAL_IDS]);
    expect(listed.shaders[0]?.id).toBe('paper:liquid-metal');
    expect(listed.shaders[0]?.featuredPreset).toBe('diamond');
    expect(listed.shaders[0]?.category).toBe('metal');
    expect(listed.shaders[0]?.preview).toBe('liquid-metal.webp');
    expect(listed.shaders[0]?.presetPreviews.diamond).toBe('liquid-metal--diamond.webp');
    expect(
      listed.shaders
        .filter((entry) => entry.still)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual([
      'paper:dot-grid',
      'paper:static-mesh-gradient',
      'paper:static-radial-gradient',
      'paper:waves',
    ]);
    expect(listed.controls).toHaveLength(11);
    expect(listed.categories.map((row) => row.label)).toEqual([
      'Fluid',
      'Light',
      'Metal',
      'Gradient',
      'Graphic',
    ]);
    expect(shaderList({ materialId: 'paper:gem-smoke' }).shaders).toHaveLength(1);
    expect(SHADER_ACTION_ID_STRINGS).toEqual([
      'shader.list',
      'shader.insert',
      'shader.set',
      'shader.frame',
      'shader.capture',
      'shader.render',
    ]);
  });
});

describe('shader.insert, shader.set and shader.frame on a file store', () => {
  it('inserts the featured preset as an object, writes the controls with their uniforms, and stores one frame per key', async () => {
    // the fixture's canvas slide (a grammar slide would convert through the dispatcher first)
    const slideId = 'canvas-opener';
    expect((await document()).slides[slideId]?.kind).toBe('content');
    const placed = { x: 200, y: 300, w: 480, h: 272 };
    deps.placeInsert = () => placed;
    deps.dispatch = async (id, input, c) => {
      // the canvas conversion an insert on a grammar slide asks for (SPEC-2 1.6); the fixture's
      // slides are canvases already, so this records the call alone
      expect(id).toBe('slide.toCanvas');
      void input;
      void c;
      return undefined;
    };
    const inserted = await shaderInsert(deps, ctx, {
      baseRevision: await revision(),
      slideId,
      materialId: 'paper:liquid-metal',
    });
    expect(inserted.blockId).toBe('shader');
    expect(inserted.block.preset).toBe('diamond');
    expect(inserted.block.motion).toEqual({ play: 'show' });
    expect(inserted.block.pos).toMatchObject(placed);
    expect(inserted.block.alt).toBe('The liquid metal shader');
    const afterInsert = await document();
    const slide = afterInsert.slides[slideId];
    const stored =
      slide?.kind === 'content' ? slide.slots.main?.find((b) => b.id === 'shader') : undefined;
    expect(stored?.type).toBe('material');

    // the sheet's centre without a placement helper
    delete deps.placeInsert;
    const second = await shaderInsert(deps, ctx, {
      baseRevision: await revision(),
      slideId,
      materialId: 'paper:gem-smoke',
      controls: { grain: 40 },
    });
    expect(second.blockId).toBe('shader-2');
    expect(second.block.pos).toMatchObject({
      x: (1600 - SHADER_INSERT_SIZE[0]) / 2,
      y: (900 - SHADER_INSERT_SIZE[1]) / 2,
    });
    expect(second.block.controls).toEqual({ grain: 40 });
    expect(second.block.uniforms).toBeUndefined();

    // shader.set: a control writes /controls and /uniforms in one revision
    const rev1 = await revision();
    const set = await shaderSet(deps, ctx, {
      baseRevision: rev1,
      slideId,
      blockId: 'shader',
      path: '/controls/frequency',
      value: 9,
    });
    expect(set.revision).toBe(rev1 + 1);
    expect(set.block.controls).toEqual({ frequency: 9 });
    expect(set.block.uniforms?.u_repetition).toBeDefined();
    // a preset change clears both
    const set2 = await shaderSet(deps, ctx, {
      baseRevision: set.revision,
      slideId,
      blockId: 'shader',
      path: '/preset',
      value: 'sphere',
    });
    expect(set2.block.preset).toBe('sphere');
    expect(set2.block.controls).toBeUndefined();
    expect(set2.block.uniforms).toBeUndefined();
    await expect(
      shaderSet(deps, ctx, {
        baseRevision: set2.revision,
        slideId,
        blockId: 'shader',
        path: '/controls/strength',
        value: 5,
      }),
    ).rejects.toThrow();

    // shader.frame: the asset under its key, the block's /asset, one revision
    const current = await document();
    const block = (current.slides[slideId] as { slots: { main: MaterialBlock[] } }).slots.main.find(
      (b) => b.id === 'shader',
    ) as MaterialBlock;
    const key = frameKeyOf(block);
    const png = pngOf(64, 36, [200, 30, 30]);
    // a frame that is not 3200 long is refused
    await expect(
      shaderFrame(deps, ctx, {
        baseRevision: current.deck.revision,
        slideId,
        blockId: 'shader',
        frameKey: key,
        bytes: base64(png),
      }),
    ).rejects.toThrow(RangeError);
    const frame = pngOf(3200, 1814, [20, 20, 20]);
    expect(pngSize(frame)).toEqual([3200, 1814]);
    const written = await shaderFrame(deps, ctx, {
      baseRevision: current.deck.revision,
      slideId,
      blockId: 'shader',
      frameKey: key,
      bytes: base64(frame),
      renderer: 'ANGLE (Apple, test)',
    });
    expect(written.assetId).toBe(frameAssetId(key));
    expect(written.existed).toBe(false);
    expect(written.removed).toEqual([]);
    expect(written.revision).toBe(current.deck.revision + 1);
    const afterFrame = await document();
    const asset = afterFrame.deck.assets[written.assetId] as Asset;
    expect(asset.source.kind).toBe('material');
    if (asset.source.kind !== 'material') return;
    expect(asset.source.backend).toBe('client');
    expect(asset.source.frameKey).toBe(key);
    expect(asset.source.renderer).toBe('ANGLE (Apple, test)');
    expect(asset.size).toEqual([3200, 1814]);
    expect(asset.credit).toBe('Shader: Liquid metal, Paper Shaders, rendered in Turboslide');
    const neutral = 'neutral' in asset.twins ? asset.twins.neutral : '';
    expect(neutral).toBe(`assets/${written.assetId}@2x.png`);
    expect(existsSync(join(dir, neutral))).toBe(true);
    const blockAfter = (
      afterFrame.slides[slideId] as { slots: { main: MaterialBlock[] } }
    ).slots.main.find((b) => b.id === 'shader') as MaterialBlock;
    expect(blockAfter.asset).toBe(written.assetId);

    // the same bytes from the same renderer again store nothing and write nothing
    const again = await shaderFrame(deps, ctx, {
      baseRevision: afterFrame.deck.revision,
      slideId,
      blockId: 'shader',
      frameKey: key,
      bytes: base64(frame),
      renderer: 'ANGLE (Apple, test)',
    });
    expect(again.existed).toBe(true);
    expect(again.revision).toBe(afterFrame.deck.revision);

    // a moved recipe: the old key is a conflict, the new key supersedes the old frame in one write
    const moved = await shaderSet(deps, ctx, {
      baseRevision: afterFrame.deck.revision,
      slideId,
      blockId: 'shader',
      path: '/anchor',
      value: 7000,
    });
    await expect(
      shaderFrame(deps, ctx, {
        baseRevision: moved.revision,
        slideId,
        blockId: 'shader',
        frameKey: key,
        bytes: base64(frame),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const key2 = frameKeyOf(moved.block);
    expect(key2).not.toBe(key);
    const frame2 = pngOf(3200, 1814, [40, 40, 40]);
    const second2 = await shaderFrame(deps, ctx, {
      baseRevision: moved.revision,
      slideId,
      blockId: 'shader',
      frameKey: key2,
      bytes: base64(frame2),
    });
    expect(second2.removed).toEqual([written.assetId]);
    expect(second2.revision).toBe(moved.revision + 1);
    const final = await document();
    expect(final.deck.assets[written.assetId]).toBeUndefined();
    expect(final.deck.assets[second2.assetId]).toBeDefined();
    expect(existsSync(join(dir, neutral))).toBe(false);
    const finalAssets = Object.values(final.deck.assets).filter(
      (a) => a.source.kind === 'material' && a.role === 'frame',
    );
    expect(finalAssets).toHaveLength(1);
  });
});
