import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { MediaAsset } from '@turboslide/schema/assets';
import type { MediaBlock } from '@turboslide/schema/blocks';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { lintLists } from '../deps/theme.ts';
import {
  CAMERA_NEEDS_EDITOR,
  POSTER_NEEDS_PAGE,
  noMediaIntake,
  registerMediaActions,
} from './media.ts';
import type { MediaLaneDeps } from './media.ts';
import { dataExtension, nodeMediaIntake, sha256Hex } from './media-node.ts';

// The media handlers through the dispatcher over a scratch copy of decks/fixture/motion
// (gslides-parity SPEC-5 3.3, 3.8; R11 8.1; MILESTONES-5 B2 day 3): media.insert with a file
// (the record, the digest named file, the block on the canvas, the Play row when it starts
// automatically), with a YouTube link (the id, the start, the title, the second automatic player
// downgraded), the refusals (a QuickTime file, a wrong kind, no intake, a small YouTube box),
// media.setPlayback (the patch, the Play rows, the end before the start), media.info by asset and
// by block, media.list, media.poster with a picture, and the two page executors' sentences.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURES = join(ROOT, 'fixtures', 'media');
const context: ActionContext = { author: { kind: 'agent', name: 'b2-test', runId: 'b2-test' } };

let root: string;
let store: FileStore;
let deps: MediaLaneDeps;
const titles: string[] = [];

function dispatcherWith(extra: Partial<MediaLaneDeps> = {}) {
  const dispatcher = createDispatcher();
  registerMediaActions(dispatcher, { ...deps, ...extra });
  return dispatcher;
}

async function revision(): Promise<number> {
  return store.revision();
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-media-'));
  cpSync(join(ROOT, 'decks', 'fixture', 'motion'), join(root, 'motion'), { recursive: true });
  store = openFileStore({ dir: join(root, 'motion') });
  deps = {
    store,
    lint: lintLists(),
    media: nodeMediaIntake({
      deckDir: store.dir,
      putAsset: (relative, bytes, type) => store.putAsset(relative, bytes, type),
      cwd: ROOT,
      allowPaths: true,
      fetchImpl: (async (input: string | URL | Request) => {
        titles.push(String(input));
        return new Response(
          JSON.stringify({ title: 'Introducing the API', author_name: 'Google' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }) as typeof fetch,
    }),
  };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('media.insert', () => {
  test('a wav file becomes a record, a digest named file and a block on the canvas in one write', async () => {
    const dispatcher = dispatcherWith();
    const before = await revision();
    const out = (await dispatcher.dispatch(
      'media.insert',
      {
        slideId: 'media',
        file: join(FIXTURES, 'tone-vbr.mp3'),
        alt: 'A tone',
        playback: { start: 'auto', volume: 60 },
        baseRevision: before,
      },
      context,
    )) as {
      revision: number;
      blockId: string;
      assetId: string;
      asset: MediaAsset;
      slide: { animations?: unknown[] };
    };
    expect(out.revision).toBe(before + 1);
    expect(out.assetId).toBe('tone-vbr');
    expect(out.asset.kind).toBe('audio');
    expect(out.asset.mime).toBe('audio/mpeg');
    expect(out.asset.file).toBe(`assets/tone-vbr.${out.asset.sha256.slice(0, 8)}.mp3`);
    expect(out.asset.source).toEqual({ kind: 'file' });
    expect(out.asset.title).toBe('tone vbr');
    expect(out.asset.durationMs).toBeGreaterThan(900);
    const bytes = readFileSync(join(store.dir, out.asset.file));
    expect(sha256Hex(new Uint8Array(bytes))).toBe(out.asset.sha256);
    const document = (await store.read()).document;
    expect(document.deck.media?.[out.assetId]).toEqual(out.asset);
    const slide = document.slides['media'];
    const block =
      slide?.kind === 'content' ? slide.slots.main?.find((b) => b.id === out.blockId) : undefined;
    expect(block?.type).toBe('media');
    const media = block as MediaBlock;
    expect(media.source).toEqual({ asset: 'tone-vbr' });
    expect(media.playback).toEqual({ start: 'auto', volume: 60 });
    expect(media.alt).toBe('A tone');
    // the 96 by 96 audio box, centred on the page, on top of the stack
    expect(media.pos).toMatchObject({ w: 96, h: 96, x: 752, y: 402, z: 3 });
    // Play (automatically) takes its place among the animations as one Play row (SPEC-5 2.1)
    const rows = slide?.animations ?? [];
    expect(
      rows.filter((row) => row.effect === 'playMedia' && row.blockId === out.blockId),
    ).toHaveLength(1);
    expect(rows.find((row) => row.blockId === out.blockId)).toMatchObject({
      trigger: 'withPrevious',
    });
  });

  test('a video from a data URL keeps its coded size in the default box and names the pasted kind', async () => {
    const dispatcher = dispatcherWith();
    const bytes = readFileSync(join(FIXTURES, 'bars-1s.webm'));
    const out = (await dispatcher.dispatch(
      'media.insert',
      {
        slideId: 'media',
        file: `data:video/webm;base64,${bytes.toString('base64')}`,
        baseRevision: await revision(),
      },
      context,
    )) as { blockId: string; asset: MediaAsset; slide: { slots: { main: MediaBlock[] } } };
    expect(out.asset.kind).toBe('video');
    expect(out.asset.size).toEqual([320, 180]);
    expect(out.asset.codecs).toContain('V_VP9');
    expect(out.asset.id).toBe('media');
    const block = out.slide.slots.main.find((b) => b.id === out.blockId) as MediaBlock;
    expect(block.pos).toMatchObject({ w: 960, h: 540 });
    expect(block.playback).toEqual({ start: 'click' });
    expect(block.alt).toBe('Video');
    expect(dataExtension('data:audio/wav;base64,AAA')).toBe('wav');
  });

  test('a YouTube link: the id, the start from t, the title from oEmbed, one automatic player per slide', async () => {
    const dispatcher = dispatcherWith();
    const first = (await dispatcher.dispatch(
      'media.insert',
      {
        slideId: 'effects',
        youtube: 'https://youtu.be/M7lc1UVf-VE?t=30',
        playback: { start: 'auto' },
        baseRevision: await revision(),
      },
      context,
    )) as {
      blockId: string;
      assetId?: string;
      slide: { slots: { main: MediaBlock[] }; animations?: { effect: string }[] };
    };
    expect(first.assetId).toBeUndefined();
    const block = first.slide.slots.main.find((b) => b.id === first.blockId) as MediaBlock;
    expect(block.source).toEqual({ youtube: 'M7lc1UVf-VE' });
    expect(block.playback).toEqual({ start: 'auto', startMs: 30_000 });
    expect(block.alt).toBe('Introducing the API');
    expect(block.id).toBe('introducing-the-api');
    expect(titles.some((url) => url.includes('/oembed?'))).toBe(true);
    expect(first.slide.animations?.some((row) => row.effect === 'playMedia')).toBe(true);
    // a second automatic YouTube player is downgraded to Play (on click) (R11 4.2)
    const second = (await dispatcher.dispatch(
      'media.insert',
      {
        slideId: 'effects',
        youtube: 'M7lc1UVf-VE',
        playback: { start: 'auto' },
        title: 'Again',
        baseRevision: await revision(),
      },
      context,
    )) as { blockId: string; slide: { slots: { main: MediaBlock[] } } };
    const again = second.slide.slots.main.find((b) => b.id === second.blockId) as MediaBlock;
    expect(again.playback.start).toBe('click');
    expect(again.alt).toBe('Again');
  });

  test('refuses a QuickTime file, a wrong kind, a playlist, a small YouTube box and a transport without the intake', async () => {
    const dispatcher = dispatcherWith();
    const base = await revision();
    await expect(
      dispatcher.dispatch(
        'media.insert',
        { slideId: 'media', file: join(FIXTURES, 'bars-1s.mov'), baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/QuickTime/);
    await expect(
      dispatcher.dispatch(
        'media.insert',
        {
          slideId: 'media',
          file: join(FIXTURES, 'tone-1s.wav'),
          kind: 'video',
          baseRevision: base,
        },
        context,
      ),
    ).rejects.toThrow(/is audio, not video/);
    await expect(
      dispatcher.dispatch(
        'media.insert',
        {
          slideId: 'media',
          youtube: 'https://www.youtube.com/playlist?list=PLx',
          baseRevision: base,
        },
        context,
      ),
    ).rejects.toThrow('Paste a link to one video');
    await expect(
      dispatcher.dispatch(
        'media.insert',
        {
          slideId: 'media',
          youtube: 'M7lc1UVf-VE',
          pos: { x: 0, y: 0, w: 199, h: 300 },
          baseRevision: base,
        },
        context,
      ),
    ).rejects.toThrow('A YouTube player is at least 200 by 200 pixels');
    await expect(
      dispatcher.dispatch(
        'media.insert',
        { slideId: 'media', youtube: 'M7lc1UVf-VE', playback: { loop: true }, baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/Loop is not offered/);
    const bare = createDispatcher();
    registerMediaActions(bare, { store: deps.store, lint: deps.lint });
    await expect(
      bare.dispatch(
        'media.insert',
        { slideId: 'media', file: join(FIXTURES, 'tone-1s.wav'), baseRevision: base },
        context,
      ),
    ).rejects.toThrow(noMediaIntake('media.insert'));
    const refusing = dispatcherWith({
      media: { ...deps.media!, refusal: 'Audio and video need the Blob store on this instance' },
    });
    await expect(
      refusing.dispatch(
        'media.insert',
        { slideId: 'media', file: join(FIXTURES, 'tone-1s.wav'), baseRevision: base },
        context,
      ),
    ).rejects.toThrow('Audio and video need the Blob store on this instance');
    expect(await revision()).toBe(base);
  });
});

describe('media.insert on a restricted deck (SPEC-5 0.19)', () => {
  test('stores the file under the deck key through putKeyedAsset and keeps the assets/ path on the record', async () => {
    // its own copy of the fixture, so the shared store's records stay as the other cases expect
    cpSync(join(ROOT, 'decks', 'fixture', 'motion'), join(root, 'restricted'), { recursive: true });
    const own = openFileStore({ dir: join(root, 'restricted') });
    const keyedPuts: { relative: string; key: string; type: string | undefined }[] = [];
    const plainPuts: string[] = [];
    const keyedStore = Object.assign(Object.create(own) as FileStore, {
      putAsset: (relative: string, bytes: Uint8Array, type?: string) => {
        plainPuts.push(relative);
        return own.putAsset(relative, bytes, type);
      },
      putKeyedAsset: async (relative: string, bytes: Uint8Array, key: string, type?: string) => {
        keyedPuts.push({ relative, key, type });
        const put = await own.putAsset(relative, bytes, type);
        return {
          ...put,
          url: `https://store.example/d/motion/${key}/${relative.slice('assets/'.length)}`,
        };
      },
    });
    const intake = nodeMediaIntake({
      deckDir: own.dir,
      putAsset: (relative, bytes, type) => own.putAsset(relative, bytes, type),
      cwd: ROOT,
      allowPaths: true,
    });
    const dispatcher = dispatcherWith({
      store: keyedStore,
      media: { ...intake, assetKey: async () => 'abcdefghijklmnopqrstuv' },
    });
    const out = (await dispatcher.dispatch(
      'media.insert',
      {
        slideId: 'media',
        file: join(FIXTURES, 'tone-vbr.mp3'),
        alt: 'Keyed tone',
        baseRevision: await own.revision(),
      },
      context,
    )) as { assetId: string; asset: MediaAsset };
    expect(keyedPuts).toEqual([
      { relative: out.asset.file, key: 'abcdefghijklmnopqrstuv', type: 'audio/mpeg' },
    ]);
    expect(plainPuts).toEqual([]);
    expect(out.asset.file).toMatch(/^assets\/tone-vbr\.[0-9a-f]{8}\.mp3$/);
    // a store without a keyed put (a checkout) ignores the key and writes the plain file
    const plain = dispatcherWith({
      store: own,
      media: { ...intake, assetKey: async () => 'abcdefghijklmnopqrstuv' },
    });
    const second = (await plain.dispatch(
      'media.insert',
      {
        slideId: 'media',
        file: join(FIXTURES, 'tone-1s-float.wav'),
        alt: 'Plain tone',
        baseRevision: await own.revision(),
      },
      context,
    )) as { asset: MediaAsset };
    expect(readFileSync(join(own.dir, second.asset.file)).byteLength).toBe(second.asset.bytes);
  });
});

describe('media.setPlayback', () => {
  test('writes the patch, adds and removes the Play row, refuses an end at or before the start', async () => {
    const dispatcher = dispatcherWith();
    const out = (await dispatcher.dispatch(
      'media.setPlayback',
      {
        slideId: 'media',
        blockId: 'tone',
        start: 'auto',
        mute: true,
        volume: 40,
        baseRevision: await revision(),
      },
      context,
    )) as {
      slide: { slots: { main: MediaBlock[] }; animations?: { effect: string; blockId: string }[] };
    };
    const tone = out.slide.slots.main.find((b) => b.id === 'tone') as MediaBlock;
    expect(tone.playback).toEqual({ start: 'auto', mute: true, volume: 40 });
    expect(
      out.slide.animations?.filter((row) => row.effect === 'playMedia' && row.blockId === 'tone'),
    ).toHaveLength(1);
    const back = (await dispatcher.dispatch(
      'media.setPlayback',
      {
        slideId: 'media',
        blockId: 'tone',
        start: 'manual',
        mute: false,
        volume: null,
        stopOnSlideChange: false,
        baseRevision: await revision(),
      },
      context,
    )) as {
      slide: { slots: { main: MediaBlock[] }; animations?: { effect: string; blockId: string }[] };
    };
    const manual = back.slide.slots.main.find((b) => b.id === 'tone') as MediaBlock;
    expect(manual.playback).toEqual({ start: 'manual', stopOnSlideChange: false });
    expect(
      back.slide.animations?.some((row) => row.effect === 'playMedia' && row.blockId === 'tone'),
    ).toBe(false);
    await expect(
      dispatcher.dispatch(
        'media.setPlayback',
        {
          slideId: 'media',
          blockId: 'clip',
          startMs: 500,
          endMs: 400,
          baseRevision: await revision(),
        },
        context,
      ),
    ).rejects.toThrow(/is not after Start at/);
    await expect(
      dispatcher.dispatch(
        'media.setPlayback',
        { slideId: 'media', blockId: 'h', start: 'auto', baseRevision: await revision() },
        context,
      ),
    ).rejects.toThrow(/is a heading/);
  });
});

describe('media.info, media.list, media.poster and the page executors', () => {
  test('info answers the record by asset id and by block id with the blocks that play it; list answers every record', async () => {
    const dispatcher = dispatcherWith();
    const byAsset = (await dispatcher.dispatch('media.info', { id: 'bars-1s' }, context)) as {
      asset: MediaAsset;
      blocks: unknown[];
    };
    expect(byAsset.asset.file).toBe('assets/bars-1s.e5f1f192.webm');
    expect(byAsset.blocks).toEqual([{ slideId: 'media', blockId: 'clip' }]);
    const byBlock = (await dispatcher.dispatch(
      'media.info',
      { id: 'clip', refresh: true },
      context,
    )) as { asset: MediaAsset };
    expect(byBlock.asset.id).toBe('bars-1s');
    expect(byBlock.asset.codecs).toEqual(['V_VP9']);
    await expect(dispatcher.dispatch('media.info', { id: 'nothing' }, context)).rejects.toThrow(
      RangeError,
    );
    const list = (await dispatcher.dispatch('media.list', {}, context)) as { assets: MediaAsset[] };
    expect(list.assets.map((asset) => asset.id).sort()).toEqual([
      'bars-1s',
      'media',
      'tone-1s',
      'tone-vbr',
    ]);
  });

  test('poster --file stores a picture with the thumb role and names it on the block; --at names the page', async () => {
    const dispatcher = dispatcherWith();
    const png = join(ROOT, 'decks', 'gt-brand', 'assets', 'ref-rosetta.jpg');
    const out = (await dispatcher.dispatch(
      'media.poster',
      { slideId: 'media', blockId: 'clip', file: png, baseRevision: await revision() },
      context,
    )) as { posterAssetId: string; slide: { slots: { main: MediaBlock[] } } };
    expect(out.posterAssetId).toBe('clip-poster');
    const clip = out.slide.slots.main.find((b) => b.id === 'clip') as MediaBlock;
    expect(clip.poster).toBe('clip-poster');
    const document = (await store.read()).document;
    expect(document.deck.assets['clip-poster']?.role).toBe('thumb');
    await expect(
      dispatcher.dispatch(
        'media.poster',
        { slideId: 'media', blockId: 'clip', atMs: 500, baseRevision: await revision() },
        context,
      ),
    ).rejects.toThrow(POSTER_NEEDS_PAGE);
    await expect(
      dispatcher.dispatch('camera.capture', { slideId: 'media', baseRevision: 0 }, context),
    ).rejects.toThrow(CAMERA_NEEDS_EDITOR);
    expect(await dispatcher.dispatch('view.presentOnScreen', { screen: 'other' }, context)).toEqual(
      {
        supported: false,
        screens: 0,
        opened: false,
      },
    );
  });
});
