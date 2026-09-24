// The frame assets' prune (docs/FEATURES.md 5.5, 7.3): `pruneFrameAssets` removes an unreferenced
// material asset older than the grace and keeps a referenced one, a younger one and every non
// material asset; the frame asset id is `frame-<16 hex of frameKey>`; the superseded frame rule
// names the block's previous frame when nothing else holds it.
import { describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument } from '@turboslide/schema/deck';
import { freeformDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import {
  FRAME_GRACE_MS,
  assetFiles,
  isFrameAssetId,
  orphanFrameAssets,
  pruneFrameAssets,
  referencedAssetIds,
  supersededFrameOf,
} from './frames.ts';
import type { DeckStore, WriteOutcome } from './store.ts';

function frameAsset(id: string, key: string): Asset {
  return {
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
    treatment: { kind: 'continuous', quality: 92 },
    inline: 'native',
  };
}

function photo(id: string): Asset {
  return {
    id,
    role: 'capture',
    alt: 'a photograph',
    twins: { neutral: `assets/${id}.jpg` },
    size: [800, 600],
    scale: 1,
    source: { kind: 'file' },
    inline: 'native',
  };
}

/** The freeform slide of the worked document ('free') carrying a shader block over the asset named, with the assets added. */
const SLIDE_ID = 'free';
function documentWith(assets: Asset[], shaderAsset: string | undefined): DeckDocument {
  const doc = freeformDocument();
  const slide = doc.slides[SLIDE_ID] as ContentSlide;
  const shader: Block = {
    id: 'shader',
    type: 'material',
    materialId: 'paper:liquid-metal',
    pos: { x: 100, y: 400, w: 480, h: 272, z: 5 },
    ...(shaderAsset !== undefined ? { asset: shaderAsset } : {}),
    alt: 'The liquid metal shader',
  } as Block;
  slide.slots.main = [...(slide.slots.main ?? []), shader];
  for (const asset of assets) doc.deck.assets[asset.id] = asset;
  return doc;
}

/** A store over one document: writes apply asset.remove alone, the way the prune writes. */
function storeOf(initial: DeckDocument): DeckStore & { writes: Mutation[][]; removed: string[] } {
  let document = initial;
  const writes: Mutation[][] = [];
  const removed: string[] = [];
  const store = {
    writes,
    removed,
    read: async () => ({ document, issues: [] }),
    write: async (write: {
      baseRevision: number;
      mutations: Mutation[];
    }): Promise<WriteOutcome> => {
      if (write.baseRevision !== document.deck.revision)
        return {
          ok: false,
          code: 'conflict',
          message: 'stale',
          currentRevision: document.deck.revision,
          current: document,
        } as unknown as WriteOutcome;
      writes.push([...write.mutations]);
      const assets = { ...document.deck.assets };
      for (const mutation of write.mutations)
        if (mutation.op === 'asset.remove') delete assets[mutation.assetId];
      document = {
        ...document,
        deck: { ...document.deck, assets, revision: document.deck.revision + 1 },
      };
      return {
        ok: true,
        revision: document.deck.revision,
        document,
        warnings: [],
      } as unknown as WriteOutcome;
    },
    removeAsset: async (relative: string) => {
      removed.push(relative);
    },
  } as unknown as DeckStore & { writes: Mutation[][]; removed: string[] };
  return store;
}

const NOW = Date.parse('2026-09-24T12:00:00Z');
const old = new Date(NOW - FRAME_GRACE_MS - 60_000).toISOString();
const young = new Date(NOW - 30_000).toISOString();

describe('the frame assets', () => {
  it('names the id shape and the files a record holds', () => {
    expect(isFrameAssetId('frame-0123456789abcdef')).toBe(true);
    expect(isFrameAssetId('frame-0123')).toBe(false);
    expect(isFrameAssetId('liquid-metal-diamond')).toBe(false);
    expect(assetFiles(frameAsset('frame-0123456789abcdef', 'sha256:x'))).toEqual([
      'assets/frame-0123456789abcdef@2x.png',
    ]);
  });

  it('reads every reference: the blocks, the slide pictures and the kit slots', () => {
    const doc = documentWith([frameAsset('frame-a000000000000000', 'k')], 'frame-a000000000000000');
    doc.deck.brand = { mark: { kind: 'picture', assetId: 'acme-mark' } };
    const ids = referencedAssetIds(doc);
    expect(ids.has('frame-a000000000000000')).toBe(true);
    expect(ids.has('acme-mark')).toBe(true);
  });

  it('prunes an unreferenced frame older than the grace and keeps the referenced, the young and the photographs', async () => {
    const held = frameAsset('frame-a000000000000000', 'sha256:a');
    const orphanOld = frameAsset('frame-b000000000000000', 'sha256:b');
    const orphanYoung = frameAsset('frame-c000000000000000', 'sha256:c');
    const dangling = frameAsset('frame-d000000000000000', 'sha256:d');
    const picture = photo('photo-1');
    const doc = documentWith([held, orphanOld, orphanYoung, dangling, picture], held.id);
    const entries = [
      { relative: 'assets/frame-a000000000000000@2x.png', uploadedAt: old },
      { relative: 'assets/frame-b000000000000000@2x.png', uploadedAt: old },
      { relative: 'assets/frame-c000000000000000@2x.png', uploadedAt: young },
      { relative: 'assets/photo-1.jpg', uploadedAt: old },
    ];
    const orphans = orphanFrameAssets(doc, entries, NOW);
    expect(orphans.map((row) => row.assetId).sort()).toEqual([
      'frame-b000000000000000',
      'frame-d000000000000000',
    ]);
    expect(orphans.find((row) => row.assetId === 'frame-d000000000000000')?.files).toEqual([]);
    const store = storeOf(doc);
    const result = await pruneFrameAssets({
      store,
      list: async () => entries,
      now: () => NOW,
    });
    expect(result.removed.sort()).toEqual(['frame-b000000000000000', 'frame-d000000000000000']);
    expect(result.files).toEqual(['assets/frame-b000000000000000@2x.png']);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]?.every((m) => m.op === 'asset.remove')).toBe(true);
    const after = (await store.read()).document.deck.assets;
    expect(Object.keys(after).sort()).toEqual(
      expect.arrayContaining(['frame-a000000000000000', 'frame-c000000000000000', 'photo-1']),
    );
    expect(after['frame-b000000000000000']).toBeUndefined();
    // nothing left: no write
    const second = await pruneFrameAssets({ store, list: async () => entries, now: () => NOW });
    expect(second.removed).toEqual([]);
    expect(store.writes).toHaveLength(1);
  });

  it('names the block’s superseded frame when nothing else holds it', () => {
    const previous = frameAsset('frame-a000000000000000', 'sha256:a');
    const doc = documentWith([previous], previous.id);
    const slideId = SLIDE_ID;
    expect(supersededFrameOf(doc, slideId, 'shader', 'frame-b000000000000000')).toBe(previous.id);
    // the same id again is no supersession; a frame another block names is kept
    expect(supersededFrameOf(doc, slideId, 'shader', previous.id)).toBeNull();
    const slide = doc.slides[slideId] as ContentSlide;
    slide.slots.main?.push({
      id: 'shader-2',
      type: 'material',
      materialId: 'paper:liquid-metal',
      pos: { x: 700, y: 100, w: 480, h: 272 },
      asset: previous.id,
      alt: 'The liquid metal shader',
    } as Block);
    expect(supersededFrameOf(doc, slideId, 'shader', 'frame-b000000000000000')).toBeNull();
    // a photograph the block once named is never removed by a frame write
    const photoDoc = documentWith([photo('photo-1')], 'photo-1');
    expect(supersededFrameOf(photoDoc, slideId, 'shader', 'frame-b000000000000000')).toBeNull();
  });
});
