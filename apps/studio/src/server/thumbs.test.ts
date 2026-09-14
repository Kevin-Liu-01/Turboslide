import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { CONTENT_RULE } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import {
  THUMB_KEEP,
  parseThumbPathname,
  pruneThumbs,
  storedThumbs,
  thumbPathname,
  thumbsPrefix,
} from '@turboslide/store/blob-store';

import {
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  isThumbStamp,
  slideStamp,
  thumbCacheControl,
  thumbHeaders,
  thumbResponse,
  thumbStoreAccess,
} from './thumbs';
import type { ThumbRequest, ThumbResult } from './thumbs';

// The thumbnail cache of round four (gslides-parity SPEC-4 0.31, 3.2; MILESTONES-4 B4 item 3): the
// header set per URL shape, the 302 for a stored answer on a public store, the retention of three
// stamps per slide and theme on the fake Blob client, the stamp the server computes for a slide
// (the editor's arithmetic) and the store access rule. The render itself needs Chromium and is the
// e2e and hosted smoke rows'.

const request: ThumbRequest = {
  deckId: 'gt-brand',
  slideId: 'title',
  theme: 'dark',
  width: 320,
  r: null,
};

function result(over: Partial<ThumbResult> = {}): ThumbResult {
  return {
    kind: 'bytes',
    png: new Uint8Array(new ArrayBuffer(3)),
    stamp: 'aaaa0002',
    current: 'aaaa0002',
    revision: 7,
    cached: true,
    source: 'disk',
    fresh: true,
    ...over,
  };
}

describe('the thumbnail headers (SPEC-4 0.31)', () => {
  it('names a stamp in the URL immutable for a year and a URL without one stale while revalidate', () => {
    expect(thumbCacheControl({ revisionInUrl: true })).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(thumbCacheControl({ revisionInUrl: false })).toBe(REVALIDATE_CACHE_CONTROL);
    expect(IMMUTABLE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(REVALIDATE_CACHE_CONTROL).toBe('public, s-maxage=60, stale-while-revalidate=86400');
    const headers = thumbHeaders(result(), request, { revisionInUrl: false });
    expect(headers['cache-control']).toBe(REVALIDATE_CACHE_CONTROL);
    expect(headers['x-turboslide-stamp']).toBe('aaaa0002');
    expect(headers['x-turboslide-fresh']).toBe('1');
    expect(headers['x-turboslide-cached']).toBe('1');
    expect(headers['x-turboslide-source']).toBe('disk');
    expect(headers['x-turboslide-thumb']).toBe('320x180');
    expect(headers.etag).toBe('"gt-brand-aaaa0002-title-dark-320"');
  });

  it('answers a stored thumbnail on a public store as a 302 to its URL, and bytes as a PNG body', async () => {
    const stored = thumbResponse(
      result({
        kind: 'stored',
        url: 'https://fake.blob.local/decks/gt-brand/.thumbs/aaaa0002/dark@320/title.png',
        source: 'blob',
      }),
      { ...request, r: 'aaaa0002' },
      { revisionInUrl: true },
    );
    expect(stored.status).toBe(302);
    expect(stored.headers.get('location')).toBe(
      'https://fake.blob.local/decks/gt-brand/.thumbs/aaaa0002/dark@320/title.png',
    );
    expect(stored.headers.get('cache-control')).toBe(IMMUTABLE_CACHE_CONTROL);
    const body = thumbResponse(result({ fresh: false, stamp: 'aaaa0001' }), request, {
      revisionInUrl: false,
    });
    expect(body.status).toBe(200);
    expect(body.headers.get('content-type')).toBe('image/png');
    expect(body.headers.get('content-length')).toBe('3');
    expect(body.headers.get('cache-control')).toBe(REVALIDATE_CACHE_CONTROL);
    expect(body.headers.get('x-turboslide-fresh')).toBe('0');
    expect(new Uint8Array(await body.arrayBuffer())).toHaveLength(3);
  });

  it('takes a stamp from `r` in the shapes the pages send and refuses the rest', () => {
    expect(isThumbStamp('454dfda1')).toBe(true);
    expect(isThumbStamp('12')).toBe(true);
    expect(isThumbStamp('')).toBe(false);
    expect(isThumbStamp(null)).toBe(false);
    expect(isThumbStamp('../x')).toBe(false);
    expect(isThumbStamp('a/b')).toBe(false);
    expect(isThumbStamp('x'.repeat(65))).toBe(false);
  });

  it('reads the store access: private under TURBOSLIDE_BLOB_ACCESS or the layout v2 documents token', () => {
    expect(thumbStoreAccess({})).toBe('public');
    expect(thumbStoreAccess({ TURBOSLIDE_BLOB_ACCESS: 'private' })).toBe('private');
    expect(thumbStoreAccess({ TURBOSLIDE_BLOB_PRIVATE_TOKEN: 'x' })).toBe('private');
    expect(
      thumbStoreAccess({ TURBOSLIDE_BLOB_ACCESS: 'public', TURBOSLIDE_BLOB_PRIVATE_TOKEN: '' }),
    ).toBe('public');
  });
});

describe('the slide stamp', () => {
  it("is FNV-1a over the canonical JSON, eight hex digits, the editor's arithmetic, moving with the slide", () => {
    const slide = CONTENT_RULE as Slide;
    const stamp = slideStamp(slide);
    expect(stamp).toMatch(/^[0-9a-f]{8}$/);
    // the reference arithmetic (apps/studio/src/editor/controller.tsx slideStamp), spelled out
    const text = canonicalJson(slide);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    expect(stamp).toBe(hash.toString(16).padStart(8, '0'));
    expect(slideStamp(JSON.parse(JSON.stringify(slide)) as Slide)).toBe(stamp);
    expect(slideStamp({ ...slide, notes: 'changed' })).not.toBe(stamp);
  });
});

describe('the store layout and the retention (SPEC-4 0.31)', () => {
  it('names a thumbnail under decks/<id>/.thumbs/<stamp>/<theme>@<width>/<slide>.png and parses it back', () => {
    const pathname = thumbPathname('gt-brand', 'aaaa0001', 'dark', 320, 'title');
    expect(pathname).toBe('decks/gt-brand/.thumbs/aaaa0001/dark@320/title.png');
    expect(thumbsPrefix('gt-brand')).toBe('decks/gt-brand/.thumbs/');
    expect(parseThumbPathname(pathname)).toEqual({
      deckId: 'gt-brand',
      stamp: 'aaaa0001',
      theme: 'dark',
      width: 320,
      slideId: 'title',
    });
    expect(parseThumbPathname('decks/gt-brand/slides/title.json')).toBeNull();
  });

  it('keeps the newest three stamps per slide and theme: the fourth evicts the first', async () => {
    let clock = 0;
    const fake = memoryBlobClient(undefined, {
      now: () => new Date(Date.UTC(2026, 8, 14, 10, clock)).toISOString(),
    });
    const png = new Uint8Array([1, 2, 3]);
    for (const stamp of ['s1', 's2', 's3']) {
      clock += 1;
      await fake.put(thumbPathname('gt-brand', stamp, 'dark', 320, 'title'), png, {
        overwrite: true,
      });
    }
    expect(await pruneThumbs(fake, 'gt-brand', 'title', 'dark', THUMB_KEEP)).toEqual([]);
    clock += 1;
    await fake.put(thumbPathname('gt-brand', 's4', 'dark', 320, 'title'), png, { overwrite: true });
    await fake.put(thumbPathname('gt-brand', 's4', 'dark', 160, 'title'), png, { overwrite: true });
    const doomed = await pruneThumbs(fake, 'gt-brand', 'title', 'dark', THUMB_KEEP);
    expect(doomed).toEqual([thumbPathname('gt-brand', 's1', 'dark', 320, 'title')]);
    const left = storedThumbs(
      await fake.list(thumbsPrefix('gt-brand')),
      'gt-brand',
      'title',
      'dark',
      320,
    );
    expect(left.map((row) => row.key.stamp)).toEqual(['s4', 's3', 's2']);
    // the light theme of the same slide is another set
    await fake.put(thumbPathname('gt-brand', 's1', 'light', 320, 'title'), png, {
      overwrite: true,
    });
    expect(await pruneThumbs(fake, 'gt-brand', 'title', 'light', THUMB_KEEP)).toEqual([]);
    expect(fake.blobs.has(thumbPathname('gt-brand', 's1', 'light', 320, 'title'))).toBe(true);
  });
});
