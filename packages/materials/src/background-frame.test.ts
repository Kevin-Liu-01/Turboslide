// The client's frame of a shader ground (docs/FEATURES.md 5.5; the polish round's fix round 2, the
// row shaders.background.place-answers): `slide.setBackgroundMaterial` with `frame` stores the
// bytes under the key derived id the block frames use, records the asset `shader.frame` writes
// (backend client, the renderer, the preset under `ext` for the Shader section's ground read) and
// lands the covering picture at the back of the canvas slide, with no browser launched; a frame of
// another size is refused before anything is stored; the same frame again reuses the file. The id
// is named here for the coverage test: slide.setBackgroundMaterial.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { PictureBlock } from '@turboslide/schema/blocks';
import type { DeckDocument } from '@turboslide/schema/deck';
import { canvasObjects } from '@turboslide/schema/deck';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import {
  backgroundFrameBlockOf,
  coveringPictureOf,
  slideSetBackgroundMaterial,
} from './actions.ts';
import type { AssetActionDeps, AssetWriteContext } from './actions.ts';
import { entryWithPalette, requireMaterial } from './catalog.ts';
import { shaderPaletteOfDeck } from './presets.ts';
import { frameAssetId, frameKeyOf } from './recipe-key.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const ctx: AssetWriteContext = { author: { kind: 'agent', name: 'b4-test' } };

let dir: string;
let store: FileStore;
let deps: AssetActionDeps;

async function document(): Promise<DeckDocument> {
  return (await store.read()).document;
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
  dir = mkdtempSync(join(tmpdir(), 'ts-b4-background-'));
  cpSync(FIXTURE, dir, { recursive: true });
  store = openFileStore({ dir });
  /* a launch option that would fail at once: this path launches no browser */
  deps = {
    store,
    cwd: REPO,
    allowPaths: true,
    hosted: false,
    launch: { executablePath: '/nonexistent/browser' } as never,
  };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('slide.setBackgroundMaterial with the client’s frame', () => {
  it('stores the bytes under the key derived id, records the client frame asset with the preset, and lands the covering picture without a browser', async () => {
    const slideId = 'canvas-opener';
    const before = await document();
    expect(before.slides[slideId]?.kind).toBe('content');
    const recipe = { materialId: 'paper:liquid-metal', preset: 'diamond' };
    const palette = shaderPaletteOfDeck(before.deck);
    const entry = entryWithPalette(requireMaterial(recipe.materialId), palette);
    const key = frameKeyOf(backgroundFrameBlockOf(recipe, 5500, entry), palette);

    /* a frame of another size is refused before anything is stored */
    await expect(
      slideSetBackgroundMaterial(deps, ctx, {
        baseRevision: before.deck.revision,
        slideIds: [slideId],
        ...recipe,
        frame: { bytes: base64(pngOf(64, 36, [20, 20, 20])) },
      }),
    ).rejects.toThrow(RangeError);
    expect(existsSync(join(dir, `assets/${frameAssetId(key)}@2x.png`))).toBe(false);
    expect((await document()).deck.revision).toBe(before.deck.revision);

    const placed = await slideSetBackgroundMaterial(deps, ctx, {
      baseRevision: before.deck.revision,
      slideIds: [slideId],
      ...recipe,
      frame: { bytes: base64(pngOf(3200, 1800, [20, 20, 20])), renderer: 'ANGLE (Apple, test)' },
    });
    expect(placed.assetId).toBe(frameAssetId(key));
    expect(placed.slides).toEqual([{ slideId, blockId: expect.any(String) }]);
    const after = await document();
    const asset = after.deck.assets[placed.assetId] as Asset;
    expect(asset.role).toBe('frame');
    expect(asset.alt).toBe('The liquid metal shader in the diamond preset, behind the slide');
    expect(asset.size).toEqual([3200, 1800]);
    expect(asset.ext).toEqual({ preset: 'diamond' });
    expect(asset.credit).toBe('Shader: Liquid metal, Paper Shaders, rendered in Turboslide');
    expect(asset.source.kind).toBe('material');
    if (asset.source.kind !== 'material') return;
    expect(asset.source.backend).toBe('client');
    expect(asset.source.renderer).toBe('ANGLE (Apple, test)');
    expect(asset.source.frameKey).toBe(key);
    expect(asset.source.timeMs).toBe(5500);
    const neutral = 'neutral' in asset.twins ? asset.twins.neutral : '';
    expect(neutral).toBe(`assets/${placed.assetId}@2x.png`);
    expect(existsSync(join(dir, neutral))).toBe(true);
    const slide = after.slides[slideId];
    const covering = slide === undefined ? undefined : coveringPictureOf(slide);
    expect(covering?.asset).toBe(placed.assetId);
    expect(covering?.pos).toMatchObject({ x: 0, y: 0, w: 1600, h: 900 });
    const lowest = Math.min(
      ...canvasObjects(slide as never)
        .filter((b) => b.id !== covering?.id)
        .map((b) => b.pos?.z ?? 0),
    );
    expect((covering as PictureBlock).pos?.z).toBeLessThan(lowest);

    /* the same frame again: the file stands, the record is unchanged, the picture keeps the asset */
    const again = await slideSetBackgroundMaterial(deps, ctx, {
      baseRevision: after.deck.revision,
      slideIds: [slideId],
      ...recipe,
      frame: { bytes: base64(pngOf(3200, 1800, [20, 20, 20])), renderer: 'ANGLE (Apple, test)' },
    });
    expect(again.assetId).toBe(placed.assetId);
    const twice = await document();
    expect(twice.deck.assets[placed.assetId]).toEqual(asset);
    const coveringAgain = coveringPictureOf(twice.slides[slideId] as never);
    expect(coveringAgain?.id).toBe(covering?.id);
  });
});
