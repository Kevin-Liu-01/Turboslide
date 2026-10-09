import { describe, expect, it } from 'vitest';

import { VIAS } from '@turboslide/schema/access';
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
  PRIVATE_CACHE_CONTROL,
  PRIVATE_IMMUTABLE_CACHE_CONTROL,
  PRIVATE_REDIRECT_CACHE_CONTROL,
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

const open = { via: 'open' } as const;

describe('the thumbnail headers (SPEC-4 0.31)', () => {
  it('names a stamp in the URL immutable for a year and a URL without one stale while revalidate', () => {
    expect(thumbCacheControl({ revisionInUrl: true, standing: open })).toBe(
      IMMUTABLE_CACHE_CONTROL,
    );
    expect(thumbCacheControl({ revisionInUrl: false, standing: open })).toBe(
      REVALIDATE_CACHE_CONTROL,
    );
    expect(IMMUTABLE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(REVALIDATE_CACHE_CONTROL).toBe('public, s-maxage=60, stale-while-revalidate=86400');
    const headers = thumbHeaders(result(), request, { revisionInUrl: false, standing: open });
    expect(headers['cache-control']).toBe(REVALIDATE_CACHE_CONTROL);
    expect(headers['x-turboslide-stamp']).toBe('aaaa0002');
    expect(headers['x-turboslide-fresh']).toBe('1');
    expect(headers['x-turboslide-cached']).toBe('1');
    expect(headers['x-turboslide-source']).toBe('disk');
    expect(headers['x-turboslide-thumb']).toBe('320x180');
    expect(headers.etag).toBe('"gt-brand-aaaa0002-title-dark-320"');
  });

  it('answers a stored thumbnail on a public store as a private 302 to its URL, and bytes as a PNG body', async () => {
    const stored = thumbResponse(
      result({
        kind: 'stored',
        url: 'https://fake.blob.local/decks/gt-brand/.thumbs/aaaa0002/dark@320/title.png',
        source: 'blob',
      }),
      { ...request, r: 'aaaa0002' },
      { revisionInUrl: true, standing: open },
    );
    expect(stored.status).toBe(302);
    expect(stored.headers.get('location')).toBe(
      'https://fake.blob.local/decks/gt-brand/.thumbs/aaaa0002/dark@320/title.png',
    );
    // the redirect names the stored object: no shared cache keeps it, whoever asked (HR-SD#5);
    // the reader's browser keeps the stamped current one an hour
    expect(stored.headers.get('cache-control')).toBe(PRIVATE_REDIRECT_CACHE_CONTROL);
    const body = thumbResponse(result({ fresh: false, stamp: 'aaaa0001' }), request, {
      revisionInUrl: false,
      standing: open,
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

describe('who may keep a thumbnail (hardening HR-SD#5, CRIT-M2)', () => {
  const NOW = Date.parse('2026-10-08T22:00:00.000Z');

  it('keeps the public rules only for a reader who reached the deck as anyone would', () => {
    for (const via of VIAS) {
      const stamped = thumbCacheControl({ revisionInUrl: true, standing: { via } });
      const unstamped = thumbCacheControl({ revisionInUrl: false, standing: { via } });
      if (via === 'open' || via === 'publish') {
        expect(stamped).toBe(IMMUTABLE_CACHE_CONTROL);
        expect(unstamped).toBe(REVALIDATE_CACHE_CONTROL);
      } else {
        // the reader's own browser keeps the stamped current pixels; no shared cache keeps either
        expect(stamped).toBe(PRIVATE_IMMUTABLE_CACHE_CONTROL);
        expect(unstamped).toBe(PRIVATE_CACHE_CONTROL);
      }
    }
    expect(PRIVATE_CACHE_CONTROL).toBe('private, no-store');
    expect(PRIVATE_IMMUTABLE_CACHE_CONTROL).toBe('private, max-age=31536000, immutable');
  });

  it("lets a restricted reader's browser keep the stamped current pixels, and nothing else", () => {
    const stamped = { ...request, r: 'aaaa0002' };
    for (const via of ['owner', 'grant', 'link', 'agent', 'admin'] as const) {
      expect(
        thumbHeaders(result(), stamped, { revisionInUrl: true, standing: { via } })[
          'cache-control'
        ],
      ).toBe('private, max-age=31536000, immutable');
      // an older copy under the stamped URL is never kept: the next visit reads the new one
      expect(
        thumbHeaders(result({ fresh: false }), stamped, {
          revisionInUrl: true,
          standing: { via },
        })['cache-control'],
      ).toBe(PRIVATE_CACHE_CONTROL);
      expect(
        thumbHeaders(result(), request, { revisionInUrl: false, standing: { via } })[
          'cache-control'
        ],
      ).toBe(PRIVATE_CACHE_CONTROL);
    }
  });

  it('keeps an answer under a grant at the CDN no longer than the grant, never immutable', () => {
    const grant = (ms: number) => ({ grantExpiresAt: NOW + ms });
    expect(thumbCacheControl({ revisionInUrl: true, standing: grant(540_000), now: NOW })).toBe(
      'public, s-maxage=540',
    );
    expect(thumbCacheControl({ revisionInUrl: false, standing: grant(540_000), now: NOW })).toBe(
      'public, s-maxage=60',
    );
    expect(thumbCacheControl({ revisionInUrl: true, standing: grant(30_900), now: NOW })).toBe(
      'public, s-maxage=30',
    );
    expect(thumbCacheControl({ revisionInUrl: false, standing: grant(30_900), now: NOW })).toBe(
      'public, s-maxage=30',
    );
    expect(thumbCacheControl({ revisionInUrl: true, standing: grant(999), now: NOW })).toBe(
      PRIVATE_CACHE_CONTROL,
    );
    expect(thumbCacheControl({ revisionInUrl: true, standing: grant(-5_000), now: NOW })).toBe(
      PRIVATE_CACHE_CONTROL,
    );
  });

  it('gives an older copy under a stamped URL the minute, never the grant or the year', () => {
    const stale = result({ fresh: false, stamp: 'aaaa0001' });
    const stamped = { ...request, r: 'aaaa0002' };
    expect(
      thumbHeaders(stale, stamped, {
        revisionInUrl: true,
        standing: { grantExpiresAt: NOW + 540_000 },
        now: NOW,
      })['cache-control'],
    ).toBe('public, s-maxage=60');
    expect(
      thumbHeaders(stale, stamped, { revisionInUrl: true, standing: { via: 'open' } })[
        'cache-control'
      ],
    ).toBe(REVALIDATE_CACHE_CONTROL);
  });

  it('answers the 302 and the pending answer private for every standing', () => {
    const standings = [...VIAS.map((via) => ({ via })), { grantExpiresAt: NOW + 540_000 }];
    for (const standing of standings) {
      const options = { revisionInUrl: true, standing, now: NOW };
      const stored = thumbResponse(
        result({ kind: 'stored', url: 'https://fake.blob.local/x.png', source: 'blob' }),
        { ...request, r: 'aaaa0002' },
        options,
      );
      expect(stored.status).toBe(302);
      // the stamped current pixels: an hour in the reader's browser alone, never a shared cache
      expect(stored.headers.get('cache-control')).toBe(PRIVATE_REDIRECT_CACHE_CONTROL);
      expect(PRIVATE_REDIRECT_CACHE_CONTROL).toBe('private, max-age=3600');
      const older = thumbResponse(
        result({
          kind: 'stored',
          url: 'https://fake.blob.local/x.png',
          source: 'blob',
          fresh: false,
        }),
        { ...request, r: 'aaaa0002' },
        options,
      );
      expect(older.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
      const unstamped = thumbResponse(
        result({ kind: 'stored', url: 'https://fake.blob.local/x.png', source: 'blob' }),
        request,
        { ...options, revisionInUrl: false },
      );
      expect(unstamped.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
      const pending = thumbResponse(
        result({ kind: 'pending', source: 'render', cached: false, fresh: false }),
        { ...request, r: 'aaaa0002' },
        options,
      );
      expect(pending.status).toBe(204);
      expect(pending.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
    }
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
