// The media block's poster root and the spotlight placeholder (gslides-parity SPEC-5 0.17, 3.4,
// 3.5, 3.7; R11 5.1; MILESTONES-5 B2 day 4): the fourteen data attributes with Google's defaults
// filled in, the poster image when a poster is named (the block's over the record's), the fallback
// frame with the glyph, the title and the duration when none is, the YouTube root, the `hide-icon`
// class, the shot raster the exporter reads, and the spotlight's shape clip and person glyph.
import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '@turboslide/schema/assets';
import type { BlockOf } from '@turboslide/schema/blocks';
import type { BlockContext } from './context.ts';
import {
  MEDIA_BLOCK_CSS,
  MEDIA_DATA_ATTRIBUTES,
  dataUrlBytes,
  playbackAttributes,
  renderMedia,
  renderSpotlight,
  spotlightClip,
  standaloneMediaSources,
} from './media.ts';
import { effectivePlayback } from '@turboslide/schema/blocks/media';

const clip: MediaAsset = {
  id: 'bars-1s',
  kind: 'video',
  role: 'media',
  file: 'assets/bars-1s.e5f1f192.webm',
  mime: 'video/webm',
  bytes: 1856,
  sha256: 'e5f1f192c901bcccb6511df55a120730e25f6fa0eabb8aefbceb7293fefe3dd1',
  durationMs: 130_000,
  size: [320, 180],
  codecs: ['V_VP9'],
  title: 'Colour bars',
  source: { kind: 'file' },
};

const tone: MediaAsset = {
  id: 'tone-1s',
  kind: 'audio',
  role: 'media',
  file: 'assets/tone-1s.c087187e.wav',
  mime: 'audio/wav',
  bytes: 88_278,
  sha256: 'c087187ef80798631ceac4eee8d43c8d4d441451576abdf45a8d7b7bd2269129',
  durationMs: 1000,
  codecs: ['pcm_s16le'],
  source: { kind: 'file' },
  poster: 'speaker-art',
};

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'media',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    page: { width: 1600, height: 900 },
    image: (id) =>
      id === 'poster-1' || id === 'speaker-art'
        ? { src: `decks/t/assets/${id}.jpg`, alt: 'a frame', size: [1600, 900] }
        : undefined,
    assetUrl: (path) => `decks/t/${path}`,
    media: (id) => (id === 'bars-1s' ? clip : id === 'tone-1s' ? tone : undefined),
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

const video: BlockOf<'media'> = {
  id: 'clip',
  type: 'media',
  kind: 'video',
  source: { asset: 'bars-1s' },
  playback: { start: 'auto', startMs: 12_000, endMs: 90_000, mute: true },
  alt: 'Colour bars for one second',
  pos: { x: 137, y: 220, w: 640, h: 360, z: 1 },
};

function attributesOf(html: string): Record<string, string> {
  const open = /<div\b[^>]*>/.exec(html)?.[0] ?? '';
  const out: Record<string, string> = {};
  for (const match of open.matchAll(/([a-z-]+)="([^"]*)"/g))
    out[match[1] as string] = match[2] as string;
  return out;
}

describe('renderMedia', () => {
  it('writes the poster root with the fourteen attributes and the fallback frame when no poster exists', () => {
    const ctx = context();
    const html = renderMedia(video, ctx);
    const attributes = attributesOf(html);
    for (const name of MEDIA_DATA_ATTRIBUTES) expect(attributes[name], name).toBeDefined();
    expect(attributes['class']).toBe('ts-media is-video');
    expect(attributes['data-block']).toBe('clip');
    expect(attributes['data-type']).toBe('media');
    expect(attributes['data-media']).toBe('clip');
    expect(attributes['data-kind']).toBe('video');
    expect(attributes['data-src']).toBe('decks/t/assets/bars-1s.e5f1f192.webm');
    expect(attributes['data-youtube']).toBe('');
    expect(attributes['data-title']).toBe('Colour bars');
    expect(attributes['data-duration']).toBe('130000');
    expect(attributes['data-start']).toBe('12000');
    expect(attributes['data-end']).toBe('90000');
    expect(attributes['data-play']).toBe('auto');
    expect(attributes['data-loop']).toBe('0');
    expect(attributes['data-volume']).toBe('100');
    expect(attributes['data-mute']).toBe('1');
    expect(attributes['data-stop-on-change']).toBe('1');
    expect(attributes['data-hide-icon']).toBe('0');
    expect(attributes['role']).toBe('button');
    expect(attributes['tabindex']).toBe('0');
    expect(attributes['aria-label']).toBe('Colour bars for one second');
    expect(attributes['data-raster']).toBe('shot');
    // never an element the renderer mounts (SPEC-5 0.17)
    expect(html).not.toMatch(/<video|<audio|<iframe/);
    // the frame: the play glyph, the title and the duration
    expect(html).toContain('class="ts-media-frame is-video"');
    expect(html).toContain('<use href="#ts-play"/>');
    expect(html).toContain('<span class="ts-media-title">Colour bars</span>');
    expect(html).toContain('<span class="ts-media-duration">2:10</span>');
    expect(html).not.toContain('ts-media-poster');
    expect(ctx.rasters).toHaveLength(1);
    expect(ctx.rasters[0]).toMatchObject({ blockId: 'clip', kind: 'shot', alpha: false });
    expect(ctx.warnings).toEqual([]);
  });

  it('shows the poster with the play badge when the block names one, the block’s over the record’s', () => {
    const ctx = context({
      media: (id) => (id === 'bars-1s' ? { ...clip, poster: 'speaker-art' } : undefined),
    });
    const html = renderMedia({ ...video, poster: 'poster-1' }, ctx);
    expect(html).toContain('class="ts-media is-video has-poster"');
    expect(html).toContain('<img class="ts-media-poster" src="decks/t/assets/poster-1.jpg"');
    expect(html).toContain('width="1600" height="900"');
    expect(html).toContain('class="ts-media-badge"');
    expect(html).not.toContain('ts-media-frame');
    const fromRecord = renderMedia(video, ctx);
    expect(fromRecord).toContain('src="decks/t/assets/speaker-art.jpg"');
  });

  it('draws an audio as the speaker glyph alone in a small box and with the words in a large one', () => {
    const audio: BlockOf<'media'> = {
      id: 'tone',
      type: 'media',
      kind: 'audio',
      source: { asset: 'tone-1s' },
      playback: {
        start: 'click',
        volume: 50,
        hideIcon: true,
        stopOnSlideChange: false,
        loop: true,
      },
      pos: { x: 900, y: 220, w: 96, h: 96 },
    };
    const ctx = context({
      media: (id) => (id === 'tone-1s' ? { ...tone, poster: undefined } : undefined),
    });
    const html = renderMedia(audio, ctx);
    const attributes = attributesOf(html);
    expect(attributes['class']).toBe('ts-media is-audio hide-icon');
    expect(attributes['data-volume']).toBe('50');
    expect(attributes['data-loop']).toBe('1');
    expect(attributes['data-stop-on-change']).toBe('0');
    expect(attributes['data-hide-icon']).toBe('1');
    expect(attributes['aria-label']).toBe('tone-1s');
    expect(html).toContain('<use href="#ts-speaker"/>');
    expect(html).not.toContain('ts-media-words');
    const wide = renderMedia({ ...audio, pos: { x: 0, y: 0, w: 480, h: 200 } }, ctx);
    expect(wide).toContain('<span class="ts-media-title">tone-1s</span>');
    expect(wide).toContain('<span class="ts-media-duration">0:01</span>');
  });

  it('writes a YouTube root with the id, no src and the recorded title, and warns about a missing record', () => {
    const ctx = context();
    const html = renderMedia(
      {
        id: 'talk',
        type: 'media',
        kind: 'video',
        source: { youtube: 'M7lc1UVf-VE' },
        playback: { start: 'click' },
        pos: { x: 0, y: 0, w: 960, h: 540 },
        ext: { mediaTitle: 'Introducing the API' },
      },
      ctx,
    );
    const attributes = attributesOf(html);
    expect(attributes['class']).toBe('ts-media is-video is-youtube');
    expect(attributes['data-youtube']).toBe('M7lc1UVf-VE');
    expect(attributes['data-src']).toBe('');
    expect(attributes['data-title']).toBe('Introducing the API');
    expect(attributes['data-duration']).toBe('');
    expect(attributes['aria-label']).toBe('Introducing the API');
    const missing = context();
    renderMedia({ ...video, source: { asset: 'gone' } }, missing);
    expect(missing.warnings).toEqual(['media#clip: media gone is not in the deck']);
    // a context without the media resolver still draws the frame and no src
    const bare = context({ media: undefined });
    const frame = renderMedia(video, bare);
    expect(attributesOf(frame)['data-src']).toBe('');
    expect(frame).toContain('ts-media-frame');
    expect(bare.warnings).toEqual([]);
    // a media URL resolver wins over the asset base hosted (R11 2 rule 1)
    const hosted = context({ mediaUrl: (path) => `https://store.example/decks/t/${path}` });
    expect(attributesOf(renderMedia(video, hosted))['data-src']).toBe(
      'https://store.example/decks/t/assets/bars-1s.e5f1f192.webm',
    );
  });

  it('fills Google’s defaults into the eight playback attributes and carries the stylesheet rules', () => {
    expect(playbackAttributes(effectivePlayback(undefined))).toEqual({
      'data-start': '0',
      'data-end': '',
      'data-play': 'click',
      'data-loop': '0',
      'data-volume': '100',
      'data-mute': '0',
      'data-stop-on-change': '1',
      'data-hide-icon': '0',
    });
    expect(MEDIA_BLOCK_CSS).toContain('.ts-sheet .ts-media {');
    expect(MEDIA_BLOCK_CSS).toContain('.ts-media.hide-icon { visibility: hidden; }');
    expect(MEDIA_BLOCK_CSS).toContain('.ts-spotlight');
  });
});

describe('renderSpotlight', () => {
  it('draws the person glyph on the plate inside the shape, or the named picture, as a shot raster', () => {
    const ctx = context();
    const html = renderSpotlight(
      { id: 'me', type: 'spotlight', shape: 'ellipse', pos: { x: 1100, y: 400, w: 400, h: 400 } },
      ctx,
    );
    const attributes = attributesOf(html);
    expect(attributes['class']).toBe('ts-spotlight is-ellipse');
    expect(attributes['data-spotlight']).toBe('me');
    expect(attributes['data-shape']).toBe('ellipse');
    expect(attributes['role']).toBe('img');
    expect(attributes['aria-label']).toBe('Speaker spotlight');
    expect(attributes['style']).toContain("clip-path:path('");
    expect(html).toContain('<use href="#ts-person"/>');
    expect(ctx.rasters[0]).toMatchObject({ blockId: 'me', kind: 'shot' });
    const pictured = renderSpotlight(
      {
        id: 'me',
        type: 'spotlight',
        shape: 'rect',
        picture: 'poster-1',
        pos: { x: 0, y: 0, w: 400, h: 300 },
      },
      context(),
    );
    expect(pictured).toContain('class="ts-spotlight is-rect has-picture"');
    expect(pictured).toContain(
      '<img class="ts-spotlight-picture" src="decks/t/assets/poster-1.jpg"',
    );
    expect(attributesOf(pictured)['style']).toBeUndefined();
    expect(spotlightClip('rect', 10, 10)).toBe(false);
    expect(spotlightClip('roundRect', 10, 10)).toMatch(/^clip-path:path\('/);
  });
});

describe('the standalone media modes (SPEC-5 3.6; handed to B1)', () => {
  const audio: BlockOf<'media'> = {
    id: 'tone',
    type: 'media',
    kind: 'audio',
    source: { asset: 'tone-1s' },
    playback: { start: 'click' },
    alt: 'A tone',
    pos: { x: 0, y: 0, w: 96, h: 96, z: 1 },
  };
  const html = renderMedia(video, context()) + renderMedia(audio, context());
  const media = { 'bars-1s': clip, 'tone-1s': tone };
  const resolve = (asset: MediaAsset) => `decks/t/${asset.file}`;
  const bytes: Record<string, Uint8Array> = {
    'bars-1s': new Uint8Array(1856).fill(7),
    'tone-1s': new Uint8Array(88_278).fill(1),
  };

  it('keeps the URLs under url, empties data-src under poster and inlines data URLs under inline, largest first', () => {
    expect(standaloneMediaSources({ html, mode: 'url', media, resolve }).html).toBe(html);
    const poster = standaloneMediaSources({ html, mode: 'poster', media, resolve });
    expect(poster.html).not.toContain('data-src="decks/t/assets/');
    expect(poster.html.match(/data-src=""/g)).toHaveLength(2);
    const inline = standaloneMediaSources({
      html,
      mode: 'inline',
      media,
      resolve,
      readBytes: (asset) => bytes[asset.id] ?? null,
    });
    expect(inline.inlined).toEqual(['tone-1s', 'bars-1s']);
    expect(inline.fallback).toEqual([]);
    expect(inline.html).toContain('data-src="data:video/webm;base64,');
    expect(inline.html).toContain('data-src="data:audio/wav;base64,');
    expect(inline.addedBytes).toBe(dataUrlBytes(1856) + dataUrlBytes(88_278));
    // the poster image and every other attribute are untouched
    expect(inline.html).toContain('data-kind="video"');
  });

  it('falls back to the URL for a file over the budget or missing on this instance, and keeps inlining the rest', () => {
    const tight = standaloneMediaSources({
      html,
      mode: 'inline',
      media,
      resolve,
      readBytes: (asset) => bytes[asset.id] ?? null,
      budgetBytes: dataUrlBytes(1856) + 10,
    });
    expect(tight.fallback).toEqual(['tone-1s']);
    expect(tight.inlined).toEqual(['bars-1s']);
    expect(tight.html).toContain('data-src="decks/t/assets/tone-1s.c087187e.wav"');
    const missing = standaloneMediaSources({
      html,
      mode: 'inline',
      media,
      resolve,
      readBytes: () => null,
    });
    expect(missing.inlined).toEqual([]);
    expect(missing.fallback.sort()).toEqual(['bars-1s', 'tone-1s']);
    expect(missing.html).toBe(html);
  });
});

describe('the poster twin variant (SPEC-5 11)', () => {
  it('writes srcset on the poster image when the picture record carries the 320 px variant, and nothing otherwise', () => {
    const key = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const posterRecord = {
      id: 'poster-1',
      role: 'thumb',
      alt: 'a frame',
      twins: { light: 'assets/poster-1.jpg', dark: 'assets/poster-1.jpg' },
      size: [1600, 900] as [number, number],
      scale: 1 as const,
      source: { kind: 'file' as const },
      inline: 'native' as const,
      variants: {
        [key]: {
          key,
          twins: {
            light: 'assets/poster-1.abcdef01-320-light.png',
            dark: 'assets/poster-1.abcdef01-320-dark.png',
          },
          size: [320, 180] as [number, number],
          scale: 1 as const,
          producedAt: 'now',
        },
      },
    };
    const withVariant = renderMedia(
      { ...video, poster: 'poster-1' },
      context({ asset: (id) => (id === 'poster-1' ? (posterRecord as never) : undefined) }),
    );
    expect(withVariant).toContain(
      'srcset="decks/t/assets/poster-1.abcdef01-320-light.png 320w, decks/t/assets/poster-1.jpg 1600w"',
    );
    const plain = renderMedia({ ...video, poster: 'poster-1' }, context());
    expect(plain).not.toContain('srcset=');
  });
});
