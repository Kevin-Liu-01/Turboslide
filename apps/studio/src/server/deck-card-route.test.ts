import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessRecord, AuthContext } from '@turboslide/identity/access';
import { synthesizeLegacyRecord, tokenHash } from '@turboslide/identity/access';

import { bindAuthorize, boundDecide } from './authorize';
import { bindFlags } from './flags';
import { setSecurityLogSink } from './log';
import type { ThumbRequest, ThumbResult } from './thumbs';
import { signThumbGrant } from './tokens';

// The render route's deck card (GF-2.1; routes/api/render.$slideId.ts, deck-card.ts): `w=1200` is
// the first slide a shared link unfurls with. It is served when a stranger holding the URL may
// read the deck (open general access, or the URL's live publish token) and to nobody else, whatever
// cookie, link grant or thumbnail grant the request carries; the slide must be the deck's first
// shown slide; the picture is the current content, never a render per `r`. The decision is the
// real one over the records below; the thumbnail cache and the slide order are stand ins.

const contexts = new Map<string, AuthContext>();
vi.mock('./authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authorize')>();
  return {
    ...actual,
    requestContext: (request?: Request) =>
      Promise.resolve(
        contexts.get(request?.headers.get('x-test-reader') ?? '') ?? actual.anonymousContext(),
      ),
  };
});

const asked: ThumbRequest[] = [];
let next: ThumbResult;
vi.mock('./thumbs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getThumbnail: (request: ThumbRequest) => {
    asked.push(request);
    return Promise.resolve(next);
  },
}));

vi.mock('./deck-card', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cardSlideOf: () => Promise.resolve('cover'),
}));

const { Route } = await import('../routes/api/render.$slideId');
type Handler = (input: { params: { slideId: string }; request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;

const NOW = '2026-10-15T00:00:00.000Z';
const TOKEN = 'pub_card_token_0123456789';

function record(deckId: string, over: Partial<AccessRecord>): AccessRecord {
  return {
    ...synthesizeLegacyRecord(deckId),
    owner: 'usr_owner',
    createdBy: 'usr_owner',
    generalAccess: { mode: 'restricted', role: 'viewer' },
    ...over,
  };
}

const records = new Map<string, AccessRecord>([
  [
    'open-deck',
    record('open-deck', { owner: null, generalAccess: { mode: 'open', role: 'viewer' } }),
  ],
  [
    'kept-deck',
    record('kept-deck', {
      links: [
        {
          id: 'lnk_view01',
          hash: `sha256:${'a'.repeat(64)}`,
          role: 'viewer',
          createdAt: NOW,
          createdBy: 'usr_owner',
          revokedAt: null,
          expiresAt: null,
        },
      ],
      publish: {
        hash: tokenHash(TOKEN),
        publishedAt: NOW,
        publishedBy: 'usr_owner',
        revokedAt: null,
      },
    }),
  ],
  [
    'revoked-deck',
    record('revoked-deck', {
      publish: {
        hash: tokenHash(TOKEN),
        publishedAt: NOW,
        publishedBy: 'usr_owner',
        revokedAt: NOW,
      },
    }),
  ],
]);

const person = (id: string, extra: Partial<AuthContext> = {}): AuthContext => ({
  principal: { id, kind: id.startsWith('anon_') ? 'anonymous' : 'account', admin: false },
  linkGrants: [],
  ...extra,
});

function bytes(over: Partial<ThumbResult> = {}): ThumbResult {
  return {
    kind: 'bytes',
    png: new Uint8Array(new ArrayBuffer(3)),
    stamp: 'cafe0001',
    current: 'cafe0001',
    revision: 7,
    cached: true,
    source: 'disk',
    fresh: true,
    ...over,
  };
}

async function card(
  deckId: string,
  options: { slide?: string; r?: string; p?: string; s?: string; w?: string; reader?: string } = {},
): Promise<Response> {
  const query = new URLSearchParams({ deck: deckId, theme: 'dark', w: options.w ?? '1200' });
  if (options.r !== undefined) query.set('r', options.r);
  if (options.p !== undefined) query.set('p', options.p);
  if (options.s !== undefined) query.set('s', options.s);
  const slide = options.slide ?? 'cover';
  const headers: Record<string, string> =
    options.reader === undefined ? {} : { 'x-test-reader': options.reader };
  return get({
    params: { slideId: slide },
    request: new Request(`https://studio.example.test/api/render/${slide}?${query}`, { headers }),
  });
}

beforeEach(() => {
  contexts.set('owner', person('usr_owner'));
  contexts.set(
    'linked',
    person('anon_11111111-1111-4111-8111-111111111111', {
      linkGrants: [{ linkId: 'lnk_view01', deckId: 'kept-deck', role: 'viewer' }],
    }),
  );
  bindAuthorize({
    decide: boundDecide,
    loadRecord: (deckId) => Promise.resolve(records.get(deckId) ?? null),
    now: () => Date.parse(NOW),
  });
  bindFlags({ read: () => Promise.resolve(true), write: null });
  setSecurityLogSink(() => undefined);
  next = bytes();
  asked.length = 0;
});

afterEach(() => {
  contexts.clear();
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  bindFlags({ read: null, write: null });
});

describe('the deck card on the render route (GF-2.1)', () => {
  it("serves an open deck's first slide to a caller with no identity, at the current stamp", async () => {
    const answer = await card('open-deck', { r: '7' });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-type')).toBe('image/png');
    expect(answer.headers.get('x-turboslide-thumb')).toBe('1200x675');
    // the URL names the revision the pixels are at: the public year of a stamped thumbnail
    expect(answer.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asked).toEqual([
      { deckId: 'open-deck', slideId: 'cover', theme: 'dark', width: 1200, r: null },
    ]);
  });

  it('keeps a picture whose URL names no revision, or another one, a minute at the CDN', async () => {
    for (const r of [undefined, '6', 'cafe0001']) {
      const answer = await card('open-deck', r === undefined ? {} : { r });
      expect({ r, status: answer.status }).toEqual({ r, status: 200 });
      expect(answer.headers.get('cache-control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=86400',
      );
    }
    // the URL's r never names a render: every request asked for the current stamp
    expect(asked.map((request) => request.r)).toEqual([null, null, null]);
  });

  it('serves a restricted deck through its live publish token alone', async () => {
    const answer = await card('kept-deck', { r: '7', p: TOKEN });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await card('revoked-deck', { p: TOKEN })).status).toBe(410);
    expect((await card('kept-deck', { p: 'pub_some_other_token_99' })).status).toBe(404);
  });

  it('refuses a restricted deck whatever the request carries besides the token', async () => {
    const tries = [
      await card('kept-deck'),
      await card('kept-deck', { reader: 'owner' }),
      await card('kept-deck', { reader: 'linked' }),
      await card('kept-deck', { s: signThumbGrant('kept-deck', 'viewer') }),
      await card('missing-deck'),
    ];
    for (const answer of tries) {
      expect(answer.status).toBe(404);
      expect(answer.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(asked).toEqual([]);
  });

  it('opens the first shown slide alone', async () => {
    const answer = await card('open-deck', { slide: 'agenda' });
    expect(answer.status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('leaves the thumbnail widths to their own rule: no identity is still refused there', async () => {
    const thumb = await card('open-deck', { w: '320' });
    expect(thumb.status).toBe(403);
    expect((await card('open-deck', { w: '1000' })).status).toBe(400);
  });
});
