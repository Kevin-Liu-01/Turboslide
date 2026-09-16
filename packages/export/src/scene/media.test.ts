import { describe, expect, test } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';

import { mediaBlocksOfSlide, sceneMedia, scenePictureEffects } from './media.ts';
import type { Scene } from './types.ts';

// The scene's media records (gslides-parity SPEC-5 1.4, 3.6): one per media block with the box
// the extractor measured (else the block's pos), the file resolved under the deck folder with its
// facts, the poster raster id, the YouTube id, and a warning for a record the deck lacks.

const deck = {
  media: {
    'bars-1s': {
      id: 'bars-1s',
      kind: 'video',
      role: 'media',
      file: 'assets/bars-1s.e5f1f192.webm',
      mime: 'video/webm',
      bytes: 1856,
      sha256: 'e5f1f192c901bcccb6511df55a120730e25f6fa0eabb8aefbceb7293fefe3dd1',
      durationMs: 1000,
      size: [320, 180],
      codecs: ['V_VP9'],
      source: { kind: 'file' },
    },
  },
} as unknown as Deck;

const slide: Slide = {
  schemaVersion: 1,
  id: 'media',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'clip',
        type: 'media',
        kind: 'video',
        source: { asset: 'bars-1s' },
        playback: { start: 'auto', startMs: 200 },
        pos: { x: 137, y: 220, w: 640, h: 360 },
      },
      {
        id: 'talk',
        type: 'media',
        kind: 'video',
        source: { youtube: 'M7lc1UVf-VE' },
        playback: { start: 'click' },
        pos: { x: 800, y: 220, w: 640, h: 360 },
      },
      {
        id: 'grid',
        type: 'composite',
        columns: 2,
        cells: [
          {
            blocks: [
              {
                id: 'gone',
                type: 'media',
                kind: 'audio',
                source: { asset: 'nothing' },
                playback: { start: 'click' },
                pos: { x: 0, y: 0, w: 96, h: 96 },
              },
            ],
          },
        ],
      },
      {
        id: 'boxless',
        type: 'media',
        kind: 'audio',
        source: { asset: 'bars-1s' },
        playback: { start: 'click' },
      },
    ],
  },
} as unknown as Slide;

function scene(): Scene {
  return {
    slideId: 'media',
    n: 1,
    rasters: [
      {
        id: 'clip:1',
        blockId: 'clip',
        kind: 'shot',
        selector: '',
        box: [137, 221, 640, 359],
        alpha: false,
        scale: 2,
      },
    ],
    warnings: [],
  } as unknown as Scene;
}

describe('sceneMedia', () => {
  test('answers one record per media block, composite cells included, with the measured box and the resolved file', () => {
    expect(mediaBlocksOfSlide(slide).map((block) => block.id)).toEqual([
      'clip',
      'talk',
      'gone',
      'boxless',
    ]);
    const out = scene();
    const media = sceneMedia(out, slide, deck, { deckDir: '/decks/motion' });
    expect(media).toEqual([
      {
        blockId: 'clip',
        kind: 'video',
        box: [137, 221, 640, 359],
        playback: { start: 'auto', startMs: 200 },
        poster: 'clip:1',
        file: '/decks/motion/assets/bars-1s.e5f1f192.webm',
        mime: 'video/webm',
        bytes: 1856,
        durationMs: 1000,
      },
      {
        blockId: 'talk',
        kind: 'video',
        box: [800, 220, 640, 360],
        playback: { start: 'click' },
        youtube: 'M7lc1UVf-VE',
      },
      { blockId: 'gone', kind: 'audio', box: [0, 0, 96, 96], playback: { start: 'click' } },
    ]);
    // a block without a box and without a raster leaves the file with a warning
    expect(out.warnings).toEqual([
      'gone: media nothing is not in the deck; the poster alone travels',
      'boxless: media block has no box on the page; left out of the file',
    ]);
    // without a deck folder the file stays relative
    expect(sceneMedia(scene(), slide, deck)[0]?.file).toBe('assets/bars-1s.e5f1f192.webm');
  });
});

describe('scenePictureEffects (SPEC-5 0.47)', () => {
  test('lists the picture and shot blocks that carry a reflection or a recolor, native or baked, composite cells walked', () => {
    const slide = {
      id: 'gallery',
      kind: 'content',
      layout: { type: 'canvas' },
      slots: {
        main: [
          {
            id: 'plain',
            type: 'picture',
            asset: 'photo',
            pos: { x: 0, y: 0, w: 100, h: 100, z: 1 },
          },
          {
            id: 'grey',
            type: 'picture',
            asset: 'photo',
            adjust: { recolor: 'grayscale' },
            pos: { x: 0, y: 0, w: 100, h: 100, z: 2 },
          },
          {
            id: 'mirror',
            type: 'shot',
            asset: 'photo',
            adjust: { reflection: { transparency: 0.2, distance: 8, size: 0.4 }, recolor: 'sepia' },
            pos: { x: 0, y: 0, w: 100, h: 100, z: 3 },
          },
          {
            id: 'cleared',
            type: 'picture',
            asset: 'photo',
            adjust: { recolor: 'none', brightness: 0.1 },
            pos: { x: 0, y: 0, w: 100, h: 100, z: 4 },
          },
          {
            id: 'grid',
            type: 'composite',
            cells: [
              {
                blocks: [
                  {
                    id: 'inner',
                    type: 'picture',
                    asset: 'photo',
                    adjust: { recolor: 'blue-dark' },
                  },
                ],
              },
            ],
            pos: { x: 0, y: 0, w: 100, h: 100, z: 5 },
          },
        ],
      },
    } as never;
    expect(scenePictureEffects(slide)).toEqual([
      { blockId: 'grey', recolor: 'grayscale', native: true },
      {
        blockId: 'mirror',
        reflection: { transparency: 0.2, distance: 8, size: 0.4 },
        recolor: 'sepia',
        native: false,
      },
      { blockId: 'inner', recolor: 'blue-dark', native: true },
    ]);
  });
});
