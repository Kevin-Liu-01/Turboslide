// The MediaAsset union's runtime helpers (gslides-parity SPEC-5 0.16, 0.18, 3.1; R11 1.1, 1.4,
// 1.5): the extension and mime tables, the kinds a mime carries, the digest named file, the caps,
// the effective playback with Google's defaults, the poster rule, the duration label and parser.
import { describe, expect, it } from 'vitest';

import { MEDIA_EXTENSIONS, MEDIA_MIMES } from '../assets.ts';
import {
  DECK_MEDIA_BYTES_MAX,
  DEFAULT_PLAYBACK,
  MEDIA_BYTES_MAX,
  MEDIA_KINDS_OF_MIME,
  MEDIA_MIME_BY_EXTENSION,
  effectivePlayback,
  formatDuration,
  mediaAssetFile,
  mediaAssetForBlock,
  mediaBytesOf,
  mediaKindOfMime,
  mediaKindsOfMime,
  mediaMimeOfName,
  mediaTitle,
  parseDuration,
  playbackProblem,
  posterOf,
  applyPlaybackPatch,
  defaultMediaAlt,
  defaultMediaBox,
  effectivePlayback as effective,
  parseYoutubeTime,
  parseYoutubeUrl,
  playRowsFor,
  youtubeEmbedUrl,
  youtubeOembedUrl,
  youtubeThumbnailUrl,
  YOUTUBE_NOT_A_LINK_SENTENCE,
  YOUTUBE_PLAYLIST_SENTENCE,
} from './media.ts';

describe('the tables', () => {
  it('maps the six extensions onto the five mimes and back', () => {
    expect(Object.keys(MEDIA_MIME_BY_EXTENSION).sort()).toEqual([
      'm4a',
      'm4v',
      'mp3',
      'mp4',
      'wav',
      'webm',
    ]);
    for (const mime of MEDIA_MIMES) {
      expect(MEDIA_MIME_BY_EXTENSION[MEDIA_EXTENSIONS[mime]]).toBe(mime);
    }
    expect(MEDIA_MIME_BY_EXTENSION.m4v).toBe('video/mp4');
    expect(mediaMimeOfName('talk.MP4')).toBe('video/mp4');
    expect(mediaMimeOfName('assets/talk.0123abcd.m4a')).toBe('audio/mp4');
    expect(mediaMimeOfName('talk.mov')).toBeNull();
    expect(mediaMimeOfName('talk')).toBeNull();
  });

  it('names the kinds a mime carries, webm carrying audio too', () => {
    expect(Object.keys(MEDIA_KINDS_OF_MIME).sort()).toEqual([...MEDIA_MIMES].sort());
    expect(mediaKindsOfMime('video/webm')).toEqual(['video', 'audio']);
    expect(mediaKindsOfMime('video/mp4')).toEqual(['video']);
    expect(mediaKindOfMime('video/webm')).toBe('video');
    expect(mediaKindOfMime('audio/mpeg')).toBe('audio');
  });

  it('carries the caps of SPEC-5 0.18', () => {
    expect(MEDIA_BYTES_MAX.audio).toBe(50 * 1024 * 1024);
    expect(MEDIA_BYTES_MAX.video).toBe(200 * 1024 * 1024);
    expect(DECK_MEDIA_BYTES_MAX).toBe(300 * 1024 * 1024);
  });

  it('names the digest named file per mime', () => {
    const sha = 'abcdef0123456789'.repeat(4);
    expect(mediaAssetFile('talk', sha, 'video/mp4')).toBe('assets/talk.abcdef01.mp4');
    expect(mediaAssetFile('talk', sha, 'audio/mp4')).toBe('assets/talk.abcdef01.m4a');
    expect(mediaAssetFile('talk', sha, 'video/webm')).toBe('assets/talk.abcdef01.webm');
    expect(mediaAssetFile('talk', sha, 'audio/mpeg')).toBe('assets/talk.abcdef01.mp3');
    expect(mediaAssetFile('talk', sha, 'audio/wav')).toBe('assets/talk.abcdef01.wav');
  });
});

describe('the block helpers', () => {
  const asset = {
    id: 'talk',
    kind: 'video' as const,
    role: 'media' as const,
    file: 'assets/talk.abcdef01.mp4',
    mime: 'video/mp4' as const,
    bytes: 1234,
    sha256: 'ab'.repeat(32),
    durationMs: 130_000,
    codecs: ['avc1'],
    poster: 'frame',
    source: { kind: 'file' as const },
  };

  it('finds the record a block plays and applies the poster rule', () => {
    expect(mediaAssetForBlock({ talk: asset }, { source: { asset: 'talk' } })).toBe(asset);
    expect(mediaAssetForBlock({ talk: asset }, { source: { asset: 'other' } })).toBeUndefined();
    expect(mediaAssetForBlock({ talk: asset }, { source: { asset: '' } })).toBeUndefined();
    expect(
      mediaAssetForBlock({ talk: asset }, { source: { youtube: 'dQw4w9WgXcQ' } }),
    ).toBeUndefined();
    expect(mediaAssetForBlock(undefined, { source: { asset: 'talk' } })).toBeUndefined();
    expect(posterOf({ poster: 'mine' }, asset)).toBe('mine');
    expect(posterOf({}, asset)).toBe('frame');
    expect(posterOf({}, undefined)).toBeUndefined();
    expect(mediaBytesOf({ talk: asset, other: { ...asset, id: 'other', bytes: 6 } })).toBe(1240);
    expect(mediaBytesOf(undefined)).toBe(0);
  });

  it('fills Google’s defaults into the effective playback', () => {
    expect(effectivePlayback(DEFAULT_PLAYBACK)).toEqual({
      start: 'click',
      loop: false,
      volume: 100,
      mute: false,
      stopOnSlideChange: true,
      hideIcon: false,
      startMs: 0,
      endMs: null,
    });
    expect(effectivePlayback(undefined).start).toBe('click');
    expect(
      effectivePlayback({
        start: 'auto',
        loop: true,
        volume: 40,
        mute: true,
        stopOnSlideChange: false,
        hideIcon: true,
        startMs: 500,
        endMs: 800,
      }),
    ).toEqual({
      start: 'auto',
      loop: true,
      volume: 40,
      mute: true,
      stopOnSlideChange: false,
      hideIcon: true,
      startMs: 500,
      endMs: 800,
    });
  });

  it('names the playback problems with their field and severity', () => {
    const file = { asset: 'talk' };
    expect(playbackProblem({ start: 'click' }, file, 130_000)).toBeNull();
    expect(
      playbackProblem({ start: 'click', startMs: 12_000, endMs: 90_000 }, file, 130_000),
    ).toBeNull();
    expect(playbackProblem({ start: 'click', volume: 101 }, file, null)).toEqual({
      field: 'volume',
      severity: 3,
      message: 'Volume 101 is outside 0 to 100',
    });
    expect(playbackProblem({ start: 'click', endMs: 0 }, file, null)).toEqual({
      field: 'endMs',
      severity: 3,
      message: 'End at 0:00 is not after Start at 0:00',
    });
    expect(playbackProblem({ start: 'click', startMs: 5000, endMs: 5000 }, file, null)?.field).toBe(
      'endMs',
    );
    expect(
      playbackProblem({ start: 'click', loop: true }, { youtube: 'dQw4w9WgXcQ' }, null),
    ).toEqual({ field: 'loop', severity: 3, message: 'Loop is not offered for a YouTube video' });
    expect(playbackProblem({ start: 'click', loop: true }, file, null)).toBeNull();
    expect(playbackProblem({ start: 'click', startMs: 130_000 }, file, 130_000)).toEqual({
      field: 'startMs',
      severity: 2,
      message: 'Start at 2:10 is past the end of the media (2:10)',
    });
    expect(playbackProblem({ start: 'click', endMs: 130_001 }, file, 130_000)?.severity).toBe(2);
    expect(playbackProblem({ start: 'click', endMs: 130_001 }, file, undefined)).toBeNull();
  });

  it('formats and parses durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(42_000)).toBe('0:42');
    expect(formatDuration(130_000)).toBe('2:10');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
    expect(parseDuration('0:42')).toBe(42_000);
    expect(parseDuration('2:10')).toBe(130_000);
    expect(parseDuration('1:02:05')).toBe(3_725_000);
    expect(parseDuration('12')).toBe(12_000);
    expect(parseDuration('12.5')).toBe(12_500);
    expect(parseDuration(' 0:07 ')).toBe(7_000);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:2:3:4')).toBeNull();
  });

  it('titles a record by its title, else its file stem, else its id', () => {
    expect(mediaTitle({ ...asset, title: ' Product demo ' })).toBe('Product demo');
    expect(mediaTitle(asset)).toBe('talk');
    expect(mediaTitle({ ...asset, file: 'assets/Quarterly review.mp4' })).toBe('Quarterly review');
    expect(mediaTitle({ ...asset, file: 'assets/.mp4' })).toBe('talk');
  });
});

describe('the By URL grammar (SPEC-5 3.2; R11 4.1)', () => {
  it('reads the eight registered forms, the embed form and a bare id', () => {
    const id = 'M7lc1UVf-VE';
    for (const form of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?v=${id}&feature=share`,
      `https://www.youtube.com/v/${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `www.youtube.com/watch?v=${id}`,
      id,
    ]) {
      const parsed = parseYoutubeUrl(form);
      expect(parsed.ok, form).toBe(true);
      if (parsed.ok) expect(parsed.link.id).toBe(id);
    }
  });

  it('maps t and start to startMs and end to endMs, and refuses playlists and other links', () => {
    expect(parseYoutubeUrl('https://youtu.be/M7lc1UVf-VE?t=30')).toEqual({
      ok: true,
      link: { id: 'M7lc1UVf-VE', startMs: 30_000 },
    });
    expect(parseYoutubeUrl('https://youtu.be/M7lc1UVf-VE?t=1h2m3s')).toEqual({
      ok: true,
      link: { id: 'M7lc1UVf-VE', startMs: 3_723_000 },
    });
    expect(parseYoutubeUrl('https://www.youtube.com/embed/M7lc1UVf-VE?start=12&end=90')).toEqual({
      ok: true,
      link: { id: 'M7lc1UVf-VE', startMs: 12_000, endMs: 90_000 },
    });
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=M7lc1UVf-VE&list=PLx')).toEqual({
      ok: true,
      link: { id: 'M7lc1UVf-VE' },
    });
    expect(parseYoutubeUrl('https://www.youtube.com/playlist?list=PLx')).toEqual({
      ok: false,
      reason: YOUTUBE_PLAYLIST_SENTENCE,
    });
    for (const bad of [
      'https://vimeo.com/123',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/channel/UCx',
      'not a link',
      '',
    ]) {
      expect(parseYoutubeUrl(bad)).toEqual({ ok: false, reason: YOUTUBE_NOT_A_LINK_SENTENCE });
    }
    expect(parseYoutubeTime('90')).toBe(90_000);
    expect(parseYoutubeTime('2m3s')).toBe(123_000);
    expect(parseYoutubeTime('x')).toBeUndefined();
    expect(parseYoutubeTime(null)).toBeUndefined();
  });

  it('writes the player, oEmbed and thumbnail URLs of R11 4.2 and 4.3', () => {
    const url = youtubeEmbedUrl(
      'M7lc1UVf-VE',
      effective({ start: 'auto', startMs: 12_000, endMs: 90_500, mute: true }),
      'https://turboslide.vercel.app',
    );
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('enablejsapi')).toBe('1');
    expect(params.get('origin')).toBe('https://turboslide.vercel.app');
    expect(params.get('playsinline')).toBe('1');
    expect(params.get('rel')).toBe('0');
    expect(params.get('controls')).toBe('1');
    expect(params.get('start')).toBe('12');
    expect(params.get('end')).toBe('91');
    expect(params.get('mute')).toBe('1');
    expect(params.has('loop')).toBe(false);
    const plain = new URL(youtubeEmbedUrl('M7lc1UVf-VE', effective(undefined), undefined));
    expect(plain.searchParams.has('start')).toBe(false);
    expect(plain.searchParams.has('mute')).toBe(false);
    expect(plain.searchParams.has('origin')).toBe(false);
    expect(youtubeOembedUrl('M7lc1UVf-VE')).toBe(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DM7lc1UVf-VE&format=json',
    );
    expect(youtubeThumbnailUrl('M7lc1UVf-VE')).toBe(
      'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg',
    );
  });
});

describe('the default box, the playback patch and the Play row rule (SPEC-5 3.1, 3.2; b1.md request 5)', () => {
  const page = { width: 1600, height: 900 };

  it('centres 960 by 540 for a video and 96 by 96 for an audio, keeping a stored aspect', () => {
    expect(defaultMediaBox('video', page)).toEqual({ x: 320, y: 180, w: 960, h: 540 });
    expect(defaultMediaBox('audio', page)).toEqual({ x: 752, y: 402, w: 96, h: 96 });
    expect(defaultMediaBox('video', page, [320, 180])).toEqual({ x: 320, y: 180, w: 960, h: 540 });
    // a portrait clip keeps its aspect inside the content height
    const portrait = defaultMediaBox('video', page, [1080, 1920]);
    expect(portrait.h).toBe(642);
    expect(portrait.w).toBe(Math.round((642 * 1080) / 1920));
    expect(defaultMediaBox('video', { width: 1200, height: 900 })).toEqual({
      x: 120,
      y: 180,
      w: 960,
      h: 540,
    });
  });

  it('applies a patch: values write, null clears, booleans store their non default form alone', () => {
    expect(applyPlaybackPatch(undefined, { start: 'auto' })).toEqual({ start: 'auto' });
    expect(
      applyPlaybackPatch(
        { start: 'click' },
        { startMs: 12_000, endMs: 90_000, mute: true, loop: true, volume: 80 },
      ),
    ).toEqual({
      start: 'click',
      startMs: 12_000,
      endMs: 90_000,
      mute: true,
      loop: true,
      volume: 80,
    });
    expect(
      applyPlaybackPatch(
        { start: 'click', startMs: 12_000, endMs: 90_000, mute: true, loop: true, volume: 80 },
        { startMs: null, endMs: null, mute: false, loop: false, volume: null },
      ),
    ).toEqual({ start: 'click' });
    expect(applyPlaybackPatch({ start: 'auto' }, { stopOnSlideChange: false })).toEqual({
      start: 'auto',
      stopOnSlideChange: false,
    });
    expect(
      applyPlaybackPatch({ start: 'auto', stopOnSlideChange: false }, { stopOnSlideChange: true }),
    ).toEqual({ start: 'auto' });
    expect(applyPlaybackPatch({ start: 'auto' }, { hideIcon: true })).toEqual({
      start: 'auto',
      hideIcon: true,
    });
    // the defaults are not stored
    expect(applyPlaybackPatch({ start: 'click' }, { volume: 100, startMs: 0 })).toEqual({
      start: 'click',
    });
  });

  it('adds one withPrevious Play row on auto and removes the block’s rows when it leaves auto', () => {
    const list = [{ id: 'a1', blockId: 'h', effect: 'fadeIn', trigger: 'click', durationMs: 500 }];
    const added = playRowsFor(list, 'clip', 'auto');
    expect(added).toEqual([
      ...list,
      { id: 'a2', blockId: 'clip', effect: 'playMedia', trigger: 'withPrevious', durationMs: 500 },
    ]);
    // a second call changes nothing
    expect(playRowsFor(added ?? [], 'clip', 'auto')).toBeNull();
    expect(playRowsFor(added ?? [], 'clip', 'click')).toEqual(list);
    expect(playRowsFor(added ?? [], 'clip', 'manual')).toEqual(list);
    expect(playRowsFor(list, 'clip', 'click')).toBeNull();
    expect(playRowsFor(undefined, 'clip', 'auto')).toEqual([
      { id: 'a1', blockId: 'clip', effect: 'playMedia', trigger: 'withPrevious', durationMs: 500 },
    ]);
    expect(defaultMediaAlt('audio', undefined)).toBe('Audio');
    expect(defaultMediaAlt('video', ' Demo ')).toBe('Demo');
  });
});

describe('the twin variant helpers (SPEC-5 11)', async () => {
  const { TWIN_VARIANT_SIZE } = await import('../assets.ts');
  const {
    TWIN_VARIANT_FILE_PATTERN,
    TWIN_VARIANT_WIDTH,
    twinSrcset,
    twinVariantFileNames,
    twinVariantOf,
  } = await import('./media.ts');
  it('spells the schema width, names digest named files and finds the variant on a record', () => {
    expect(TWIN_VARIANT_WIDTH).toBe(TWIN_VARIANT_SIZE[0]);
    const key = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(twinVariantFileNames('photo', key, false)).toEqual({
      light: 'assets/photo.abcdef01-320-light.png',
      dark: 'assets/photo.abcdef01-320-dark.png',
    });
    expect(twinVariantFileNames('photo', key, true)).toEqual({
      neutral: 'assets/photo.abcdef01-320.png',
    });
    expect(TWIN_VARIANT_FILE_PATTERN.test('assets/photo.abcdef01-320-light.png')).toBe(true);
    expect(TWIN_VARIANT_FILE_PATTERN.test('assets/photo.dither-abcdef012345-light.png')).toBe(
      false,
    );
    const asset = {
      size: [1600, 900] as [number, number],
      twins: { light: 'assets/photo-light.jpg', dark: 'assets/photo-dark.jpg' },
      variants: {
        [key]: {
          key,
          twins: twinVariantFileNames('photo', key, false),
          size: [320, 180] as [number, number],
          scale: 1 as const,
          producedAt: 'now',
        },
        other: {
          key: 'other',
          twins: { neutral: 'assets/photo.dither-abcdef012345.png' },
          size: [320, 180] as [number, number],
          scale: 1 as const,
          producedAt: 'now',
        },
      },
    };
    expect(twinVariantOf(asset)?.key).toBe(key);
    expect(twinVariantOf({ variants: undefined })).toBeUndefined();
    expect(twinSrcset(asset, 'dark', '/d/assets/photo-dark.jpg', (path) => `/d/${path}`)).toBe(
      '/d/assets/photo.abcdef01-320-dark.png 320w, /d/assets/photo-dark.jpg 1600w',
    );
    expect(
      twinSrcset({ ...asset, variants: undefined }, 'dark', '/d/x.jpg', (path) => path),
    ).toBeUndefined();
  });
});
