// The shaders of a scene without a browser (docs/FEATURES.md 5.5): the document's material
// blocks with their frame files and the two readings, the pending list over scenes, and the
// PowerPoint builder's frame picture (`ts:<slide>#<block>`, the frame's own bytes at the box, the
// recipe in descr) read back out of the written package.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import PptxGenJS from 'pptxgenjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Slide } from '@turboslide/schema/deck';

import { listParts, openPackage, readPart, readPartBytes, slideParts } from '../ooxml/zip.ts';
import { addShaderFrames } from '../pptx/build.ts';
import { defineLayout } from '../pptx/masters.ts';
import { PX_PER_IN } from '../units.ts';
import { materialBlocksOf, pendingShadersOf, sceneShadersOf, shadersOf } from './shaders.ts';
import type { ShaderScene } from './shaders.ts';
import type { Scene } from './types.ts';

/** A grey PNG of the size asked for (the studio's test makes the same one). */
function makePng(width: number, height: number, shade = 0x80): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.byteLength);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.byteLength);
    out.set(Buffer.from(type, 'latin1'), 4);
    out.set(data, 8);
    view.setUint32(8 + data.byteLength, crc(out.subarray(4, 8 + data.byteLength)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = new Uint8Array((width + 1) * height).fill(shade);
  for (let y = 0; y < height; y += 1) raw[y * (width + 1)] = 0;
  const idat = new Uint8Array(deflateSync(raw));
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())]);
}

const frame: Asset = {
  id: 'frame-0123456789abcdef',
  role: 'frame',
  alt: 'The liquid metal shader',
  twins: { neutral: 'assets/frame-0123456789abcdef@2x.png' },
  size: [3200, 1800],
  scale: 2,
  source: {
    kind: 'material',
    materialId: 'paper:liquid-metal',
    uniforms: { u_scale: 1 },
    size: [3200, 1800],
    timeMs: 5500,
    backend: 'client',
    renderer: 'test',
    recipeKey: 'sha256:1',
    frameKey: 'sha256:2',
  },
  inline: 'native',
};

const legacy: Asset = {
  ...frame,
  id: 'liquid-metal',
  twins: { neutral: 'assets/liquid-metal@2x.png' },
  source: { ...frame.source, frameKey: undefined } as Asset['source'],
};

const slide: Slide = {
  schemaVersion: 1,
  id: 's1',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'fresh',
        type: 'material',
        materialId: 'paper:liquid-metal',
        preset: 'diamond',
        asset: frame.id,
        alt: 'The liquid metal shader',
        pos: { x: 900, y: 300, w: 480, h: 272 },
      },
      {
        id: 'bare',
        type: 'material',
        materialId: 'paper:gem-smoke',
        alt: 'The gem smoke shader',
        pos: { x: 100, y: 100, w: 480, h: 272 },
      },
      {
        id: 'old',
        type: 'material',
        materialId: 'paper:liquid-metal',
        asset: legacy.id,
        alt: 'An old frame',
        pos: { x: 100, y: 500, w: 480, h: 272 },
      },
      {
        id: 'grid',
        type: 'composite',
        columns: 2,
        cells: [
          {
            blocks: [
              {
                id: 'inner',
                type: 'material',
                materialId: 'paper:god-rays',
                asset: 'nowhere',
                alt: 'A god rays shader',
              },
            ],
          },
          { blocks: [] },
        ],
      },
    ],
  },
} as unknown as Slide;

let deckDir: string;

beforeAll(() => {
  deckDir = mkdtempSync(join(tmpdir(), 'ts-b7-scene-shaders-'));
});

afterAll(() => {
  rmSync(deckDir, { recursive: true, force: true });
});

describe('the shaders of a slide (scene/shaders.ts)', () => {
  test('lists every material block, composites’ cells included, in document order', () => {
    expect(materialBlocksOf(slide).map((block) => block.id)).toEqual(['fresh', 'bare', 'old', 'inner']);
  });

  test('reads the recipe, the frame record, the file on disk and the two readings', () => {
    const deck = mkdtempSync(join(tmpdir(), 'ts-b7-deck-'));
    try {
      const assets = join(deck, 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(join(assets, 'frame-0123456789abcdef@2x.png'), makePng(3200, 1800));
      writeFileSync(join(assets, 'liquid-metal@2x.png'), makePng(3200, 1800));
      const shaders = sceneShadersOf(slide, { assets: { [frame.id]: frame, [legacy.id]: legacy } }, deck);
      expect(shaders.map((s) => s.blockId)).toEqual(['fresh', 'bare', 'old', 'inner']);
      const [fresh, bare, old, inner] = shaders;
      expect(fresh).toMatchObject({
        recipe: { materialId: 'paper:liquid-metal', preset: 'diamond' },
        assetId: frame.id,
        size: [3200, 1800],
        file: join(assets, 'frame-0123456789abcdef@2x.png'),
        missing: false,
        stale: false,
        alt: 'The liquid metal shader',
      });
      expect(bare).toMatchObject({ recipe: { materialId: 'paper:gem-smoke' }, missing: true, stale: false });
      expect(bare?.assetId).toBeUndefined();
      expect(bare?.file).toBeUndefined();
      expect(old).toMatchObject({ assetId: legacy.id, missing: false, stale: true });
      expect(inner).toMatchObject({ missing: true, stale: false });
      expect(inner?.assetId).toBeUndefined();
    } finally {
      rmSync(deck, { recursive: true, force: true });
    }
  });

  test('a scene with no shaders reads as none, and the pending list names each missing or stale shader once', () => {
    const scene = { slideId: 's1', rasters: [] } as unknown as Scene;
    expect(shadersOf(scene)).toEqual([]);
    const shaded: ShaderScene = {
      ...scene,
      shaders: [
        { blockId: 'fresh', recipe: { materialId: 'x' }, alt: '', missing: false, stale: false },
        { blockId: 'bare', recipe: { materialId: 'x' }, alt: '', missing: true, stale: false },
        { blockId: 'old', recipe: { materialId: 'x' }, alt: '', missing: false, stale: true },
      ],
    };
    const dark: ShaderScene = { ...shaded, theme: 'dark' } as ShaderScene;
    expect(pendingShadersOf([shaded, dark])).toEqual(['s1#bare', 's1#old']);
    expect(pendingShadersOf([scene])).toEqual([]);
  });
});

describe('the frame picture in a PowerPoint (pptx/build.ts addShaderFrames)', () => {
  test('places the frame’s own bytes at the box as ts:<slide>#<block> with the recipe in descr, and leaves a shader with no frame alone', async () => {
    const file = join(deckDir, 'frame@2x.png');
    writeFileSync(file, makePng(3200, 1800));
    const pptx = new PptxGenJS();
    defineLayout(pptx);
    const slideOut = pptx.addSlide();
    const residual = new Set<string>();
    const scene: ShaderScene = {
      slideId: 's1',
      rasters: [],
      shaders: [
        {
          blockId: 'fresh',
          recipe: { materialId: 'paper:liquid-metal', preset: 'diamond', anchor: 5500 },
          alt: 'The liquid metal shader',
          assetId: 'frame-0123456789abcdef',
          file,
          size: [3200, 1800],
          missing: false,
          stale: false,
          box: [900, 300, 480, 272],
        },
        { blockId: 'bare', recipe: { materialId: 'paper:gem-smoke' }, alt: '', missing: true, stale: false, box: [100, 100, 480, 272] },
        { blockId: 'unmeasured', recipe: { materialId: 'paper:gem-smoke' }, alt: '', file, missing: false, stale: false },
      ],
    } as unknown as ShaderScene;
    const placed = addShaderFrames(slideOut, scene, 'ts:s1', residual);
    expect(placed.map((s) => s.blockId)).toEqual(['fresh']);
    expect([...residual]).toEqual([
      "shader: s1#fresh travels as its frame (3200 by 1800) at the block's box with the recipe in descr (docs/FEATURES.md 5.5)",
    ]);
    const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await openPackage(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    const [part] = slideParts(zip);
    if (part === undefined) throw new Error('no slide part');
    const xml = await readPart(zip, part);
    expect(xml).toContain('name="ts:s1#fresh"');
    expect(xml).not.toContain('ts:s1#bare');
    expect(xml).toContain('descr="{&quot;materialId&quot;:&quot;paper:liquid-metal&quot;,&quot;preset&quot;:&quot;diamond&quot;,&quot;anchor&quot;:5500}"');
    // the box in EMU: the sheet's px per inch, 914,400 EMU per inch
    const emu = (px: number): number => Math.round((px / PX_PER_IN) * 914400);
    expect(xml).toContain(`<a:off x="${emu(900)}" y="${emu(300)}"/>`);
    expect(xml).toContain(`<a:ext cx="${emu(480)}" cy="${emu(272)}"/>`);
    // the media part is the frame's own bytes
    const media = listParts(zip).filter((name) => name.startsWith('ppt/media/'));
    expect(media.length).toBe(1);
    const bytes = await readPartBytes(zip, media[0] as string);
    expect(bytes.byteLength).toBe(makePng(3200, 1800).byteLength);
  });
});
