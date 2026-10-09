import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessRecord, AuthContext } from '@turboslide/identity/access';
import { synthesizeLegacyRecord } from '@turboslide/identity/access';

import { bindAuthorize, boundDecide } from './authorize';
import { setSecurityLogSink } from './log';
import { twinRequest } from './twin-access';
import type { TwinAccessDeps } from './twin-access';

// Hardening HR-SD#6 (docs/hardening/HARDENING.md 4.4; CRIT-M3): the assets route ran no identity
// check and no authorize, so anyone who knew a deck id and a file name read its twins, and after
// K1#3 its 302 would have handed out the deck's asset key. A keyed deck's twin is now served by the
// key alone, and by its name on the blob store only to a reader the deck admits; a stranger gets
// the answer a missing file gets. The rule's cases first, then the route over a fake store.

const KEY = 'AbCdEfGhIjKlMnOpQrStUv';
const request = new Request('https://studio.example.test/decks/d1/assets/cover.png');

function deps(over: Partial<TwinAccessDeps> = {}): TwinAccessDeps {
  return {
    storeKind: () => 'blob',
    keyOf: () => Promise.resolve(KEY),
    mayRead: () => Promise.resolve(false),
    ...over,
  };
}

describe('the twin rule (twin-access.ts)', () => {
  it('serves a keyed twin by its key alone, and by name only to a reader on the blob store', async () => {
    expect(await twinRequest('d1', `${KEY}/cover.png`, request, deps())).toEqual({
      serve: 'cover.png',
      cache: 'public',
    });
    expect(await twinRequest('d1', 'cover.png', request, deps())).toEqual({ refuse: true });
    expect(
      await twinRequest('d1', 'cover.png', request, deps({ mayRead: () => Promise.resolve(true) })),
    ).toEqual({ serve: 'cover.png', cache: 'private' });
    // a wrong key is a name like any other
    expect(await twinRequest('d1', 'AbCdEfGhIjKlMnOpQrStUw/cover.png', request, deps())).toEqual({
      refuse: true,
    });
  });

  it('keeps names for a deck without a key, a checkout and a tmp store', async () => {
    const byName = { serve: 'cover.png', cache: 'public' };
    expect(
      await twinRequest('d1', 'cover.png', request, deps({ keyOf: () => Promise.resolve(null) })),
    ).toEqual(byName);
    expect(
      await twinRequest('d1', 'cover.png', request, deps({ storeKind: () => 'file' })),
    ).toEqual(byName);
    expect(await twinRequest('d1', 'cover.png', request, deps({ storeKind: () => 'tmp' }))).toEqual(
      byName,
    );
    // the key form answers on a tmp store as well, so one address works on every hosted store
    expect(
      await twinRequest('d1', `${KEY}/cover.png`, request, deps({ storeKind: () => 'tmp' })),
    ).toEqual(byName);
  });

  it('refuses on the blob store when the record cannot be read', async () => {
    const failing = deps({ keyOf: () => Promise.reject(new Error('store down')) });
    expect(await twinRequest('d1', 'cover.png', request, failing)).toEqual({ refuse: true });
  });
});

// the route over a fake blob store: the deck's twin is never on this instance's disk, and the
// store's URL for it is the keyed one, as the deployment's keyed client answers
const records = new Map<string, AccessRecord>();
const contexts = new Map<string, AuthContext>();
vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSelection: () => ({ kind: 'blob' }),
  storedAssetFile: () => Promise.resolve(null),
  storedAssetUrl: (deckId: string, relative: string) =>
    Promise.resolve(
      relative === 'cover.png'
        ? `https://store.example.test/d/${deckId}/${records.get(deckId)?.assetKey ?? 'none'}/assets/cover.png`
        : null,
    ),
}));
vi.mock('./access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readStoredAccess: (deckId: string) => {
    const record = records.get(deckId);
    return Promise.resolve(record === undefined ? null : { record, etag: 'e1' });
  },
}));
vi.mock('./authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authorize')>();
  return {
    ...actual,
    requestContext: (req?: Request) =>
      Promise.resolve(
        contexts.get(req?.headers.get('x-test-reader') ?? '') ?? actual.anonymousContext(),
      ),
  };
});

const { Route } = await import('../routes/decks.$deckId.assets.$');
type Handler = (input: {
  params: { deckId: string; _splat: string };
  request: Request;
}) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;

function fetchTwin(deckId: string, path: string, reader?: string): Promise<Response> {
  return get({
    params: { deckId, _splat: path },
    request: new Request(`https://studio.example.test/decks/${deckId}/assets/${path}`, {
      headers: reader === undefined ? {} : { 'x-test-reader': reader },
    }),
  });
}

describe('the assets route by key and by name (HR-SD#6)', () => {
  beforeEach(() => {
    setSecurityLogSink(() => undefined);
    records.set('kept-deck', {
      ...synthesizeLegacyRecord('kept-deck'),
      owner: 'usr_owner',
      createdBy: 'usr_owner',
      assetKey: KEY,
      generalAccess: { mode: 'restricted', role: 'viewer' },
    });
    contexts.set('owner', {
      principal: { id: 'usr_owner', kind: 'account', admin: false },
      linkGrants: [],
    });
    contexts.set('stranger', {
      principal: {
        id: 'anon_11111111-1111-4111-8111-111111111111',
        kind: 'anonymous',
        admin: false,
      },
      linkGrants: [],
    });
    bindAuthorize({
      decide: boundDecide,
      loadRecord: (deckId) => Promise.resolve(records.get(deckId) ?? null),
      now: () => Date.now(),
    });
  });

  afterEach(() => {
    records.clear();
    contexts.clear();
    bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  });

  it('answers a stranger by name with the missing file answer, and never names the key', async () => {
    for (const reader of [undefined, 'stranger']) {
      const answer = await fetchTwin('kept-deck', 'cover.png', reader);
      expect(answer.status).toBe(404);
      expect(answer.headers.get('location')).toBeNull();
      expect(await answer.text()).toBe('Not found');
    }
  });

  it('serves the twin by its key to anyone, as the store URL does', async () => {
    const answer = await fetchTwin('kept-deck', `${KEY}/cover.png`);
    expect(answer.status).toBe(302);
    expect(answer.headers.get('location')).toBe(
      `https://store.example.test/d/kept-deck/${KEY}/assets/cover.png`,
    );
    expect(answer.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it("serves the owner's editor by name, privately", async () => {
    const answer = await fetchTwin('kept-deck', 'cover.png', 'owner');
    expect(answer.status).toBe(302);
    expect(answer.headers.get('cache-control')).toBe('private, max-age=60');
  });

  it('keeps names for a deck without a key of its own', async () => {
    records.set('old-deck', {
      ...synthesizeLegacyRecord('old-deck'),
      owner: 'usr_owner',
      generalAccess: { mode: 'restricted', role: 'viewer' },
    });
    const answer = await fetchTwin('old-deck', 'cover.png');
    expect(answer.status).toBe(302);
    expect(answer.headers.get('cache-control')).toBe('public, max-age=60');
  });
});
