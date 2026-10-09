import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessRecord, AuthContext } from '@turboslide/identity/access';
import { synthesizeLegacyRecord, tokenHash } from '@turboslide/identity/access';

import { bindAuthorize, bootstrapAgentContext, boundDecide } from './authorize';
import { bindFlags } from './flags';
import { setSecurityLogSink } from './log';
import type { ThumbResult } from './thumbs';
import { THUMB_GRANT_TTL_MS, signThumbGrant } from './tokens';

// Hardening HR-SD#5 (docs/hardening/HARDENING.md 4.4; CRIT-M2): the render route's thumbnail
// answers by the reader's standing. The CDN keys an answer by its URL, which carries no identity,
// so before this push a restricted deck's thumbnail answered `public` to its owner and the next
// requester of the same URL got the picture from the CDN without passing authorize. The request
// context is chosen per request here (authorize.test.ts pins the real builder over the cookie
// and the bearer); authorize and its decision are the real ones over the records below.

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

let next: ThumbResult;
vi.mock('./thumbs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getThumbnail: () => Promise.resolve(next),
}));

const { Route } = await import('../routes/api/render.$slideId');
type Handler = (input: { params: { slideId: string }; request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;

const NOW = '2026-10-08T00:00:00.000Z';
const PUBLISH_TOKEN = 'pub_test_token_for_the_route_test';

const records = new Map<string, AccessRecord>([
  [
    'open-deck',
    {
      ...synthesizeLegacyRecord('open-deck'),
      createdBy: 'seed',
      generalAccess: { mode: 'open', role: 'viewer' },
    },
  ],
  [
    'kept-deck',
    {
      ...synthesizeLegacyRecord('kept-deck'),
      owner: 'usr_owner',
      createdBy: 'usr_owner',
      generalAccess: { mode: 'restricted', role: 'viewer' },
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
      grants: [
        {
          principalId: 'usr_guest',
          email: null,
          role: 'viewer',
          invitedBy: 'usr_owner',
          invitedAt: NOW,
          acceptedAt: NOW,
          expiresAt: null,
        },
      ],
      publish: {
        hash: tokenHash(PUBLISH_TOKEN),
        publishedAt: NOW,
        publishedBy: 'usr_owner',
        revokedAt: null,
      },
    },
  ],
]);

const ANON = 'anon_11111111-1111-4111-8111-111111111111';
const person = (id: string, extra: Partial<AuthContext> = {}): AuthContext => ({
  principal: { id, kind: id.startsWith('anon_') ? 'anonymous' : 'account', admin: false },
  linkGrants: [],
  ...extra,
});

const READERS: Record<string, AuthContext> = {
  stranger: person(ANON),
  owner: person('usr_owner'),
  guest: person('usr_guest'),
  linked: person(ANON, {
    linkGrants: [{ linkId: 'lnk_view01', deckId: 'kept-deck', role: 'viewer' }],
  }),
  published: person(ANON, { publishToken: PUBLISH_TOKEN }),
  admin: bootstrapAgentContext('token'),
};

function bytes(over: Partial<ThumbResult> = {}): ThumbResult {
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

async function thumb(
  deckId: string,
  options: { reader?: string; stamped?: boolean; grant?: string } = {},
): Promise<Response> {
  const query = new URLSearchParams({ deck: deckId, theme: 'light', w: '320' });
  if (options.stamped !== false) query.set('r', 'aaaa0002');
  if (options.grant !== undefined) query.set('s', options.grant);
  const headers: Record<string, string> =
    options.reader === undefined ? {} : { 'x-test-reader': options.reader };
  return get({
    params: { slideId: 'title' },
    request: new Request(`https://studio.example.test/api/render/title?${query}`, { headers }),
  });
}

beforeEach(() => {
  for (const [name, ctx] of Object.entries(READERS)) contexts.set(name, ctx);
  bindAuthorize({
    decide: boundDecide,
    loadRecord: (deckId) => Promise.resolve(records.get(deckId) ?? null),
    now: () => Date.now(),
  });
  bindFlags({ read: () => Promise.resolve(true), write: null });
  setSecurityLogSink(() => undefined);
  next = bytes();
});

afterEach(() => {
  contexts.clear();
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  bindFlags({ read: null, write: null });
});

describe('the thumbnail cache rule by standing (HR-SD#5, CRIT-M2)', () => {
  it('keeps the public rules for a reader of an open deck and of the published player', async () => {
    const open = await thumb('open-deck', { reader: 'stranger' });
    expect(open.status).toBe(200);
    expect(open.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const openNow = await thumb('open-deck', { reader: 'stranger', stamped: false });
    expect(openNow.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=86400',
    );
    const published = await thumb('kept-deck', { reader: 'published' });
    expect(published.status).toBe(200);
    expect(published.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('answers private, no-store to the owner, a grant holder, a link holder and the admin', async () => {
    for (const reader of ['owner', 'guest', 'linked', 'admin']) {
      for (const stamped of [true, false]) {
        const answer = await thumb('kept-deck', { reader, stamped });
        expect({ reader, stamped, status: answer.status }).toEqual({
          reader,
          stamped,
          status: 200,
        });
        expect(answer.headers.get('cache-control')).toBe('private, no-store');
      }
    }
    // the admin reaches an open deck as the admin: the answer is the admin's alone as well
    const own = await thumb('open-deck', { reader: 'admin' });
    expect(own.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps an answer under the grant no longer than the grant and never immutable', async () => {
    const grant = signThumbGrant('kept-deck', 'viewer');
    const answer = await thumb('kept-deck', { grant });
    expect(answer.status).toBe(200);
    const header = answer.headers.get('cache-control') ?? '';
    const seconds = Number(/^public, s-maxage=(\d+)$/.exec(header)?.[1]);
    expect(seconds).toBeGreaterThan(THUMB_GRANT_TTL_MS / 1000 - 30);
    expect(seconds).toBeLessThanOrEqual(THUMB_GRANT_TTL_MS / 1000);
    expect(header).not.toMatch(/immutable|max-age=31536000/);
    // a grant for another deck stands for nothing: the stranger is refused, and nothing is kept
    const other = await thumb('kept-deck', {
      reader: 'stranger',
      grant: signThumbGrant('open-deck', 'viewer'),
    });
    expect(other.status).toBe(404);
    expect(other.headers.get('cache-control') ?? '').not.toMatch(/public/);
  });

  it('answers every 302 to the stored object private, whoever asked', async () => {
    next = bytes({ kind: 'stored', url: 'https://fake.blob.local/t.png', source: 'blob' });
    for (const reader of ['stranger', 'owner', 'published']) {
      const deck = reader === 'stranger' ? 'open-deck' : 'kept-deck';
      const answer = await thumb(deck, { reader });
      expect(answer.status).toBe(302);
      expect(answer.headers.get('location')).toBe('https://fake.blob.local/t.png');
      expect(answer.headers.get('cache-control')).toBe('private, no-store');
    }
    const granted = await thumb('kept-deck', { grant: signThumbGrant('kept-deck', 'viewer') });
    expect(granted.status).toBe(302);
    expect(granted.headers.get('cache-control')).toBe('private, no-store');
  });

  it('refuses a stranger on a restricted deck with the missing deck answer and no public header', async () => {
    const answer = await thumb('kept-deck', { reader: 'stranger' });
    expect(answer.status).toBe(404);
    expect(answer.headers.get('cache-control') ?? '').not.toMatch(/public/);
  });
});
