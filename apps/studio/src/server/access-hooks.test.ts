// The share hooks and the link lookup of server/access.ts (gslides-parity SPEC-3 6.1, 6.4, 6.9;
// VERIFICATION-3 finding 34): `hostedAccessHooks` reads past the cache, indexes the links a save
// mints before the record is written, writes with the read etag, retries once when the store
// holds the very record the write based on under another etag, and answers the SPEC-3 sentence
// with the current record attached when the record moved (never the store's sentence);
// `findShareLink` answers from the index with one record read and falls back to the scan. The
// last group pins the one denial shadow mode refuses: a revoked publish token (finding 48's
// route work depends on it).
import { describe, expect, it, vi } from 'vitest';

import { tokenHash } from '@turboslide/identity/access';
import type { AccessRecord, ShareLink } from '@turboslide/schema/access';
import { legacyAssetKey, newDeckRecord } from '@turboslide/schema/access';
import { ConflictError } from '@turboslide/schema/errors';
import {
  AccessPreconditionError,
  cachedAccessStore,
  memoryAccessBus,
  memoryAccessStore,
  memoryLinkIndex,
} from '@turboslide/store/access-store';
import type { AccessStore } from '@turboslide/store/access-store';

import type { AccessHookDeps, ShareLinkLookupDeps } from './access';
import { SHARE_CONFLICT_SENTENCE, findShareLink, hostedAccessHooks } from './access';
import { authorize, bindAuthorize, contextForIdentity } from './authorize';
import { setSecurityLogSink } from './log';

const DECK = 'q4-review';
const OTHER = 'launch-plan';
const NOW = '2026-09-14T00:00:00.000Z';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const REVOKED = 'CCCCCCCCCCCCCCCCCCCCCC';

function recordBy(owner: string, deckId = DECK): AccessRecord {
  return newDeckRecord(deckId, owner, legacyAssetKey(deckId), NOW);
}

function link(id: string, token: string, revokedAt: string | null = null): ShareLink {
  return {
    id,
    hash: tokenHash(token),
    role: 'commenter',
    createdAt: NOW,
    createdBy: 'anon_owner',
    revokedAt,
    expiresAt: null,
  };
}

/** One instance: a cached store over the shared inner store, its own bus, the shared index. */
function instance(
  inner: AccessStore,
  links = memoryLinkIndex(),
): AccessHookDeps & { announced: { deckId: string; revision: number }[] } {
  const announced: { deckId: string; revision: number }[] = [];
  return {
    store: cachedAccessStore(inner, { bus: memoryAccessBus(), ttlMs: 60_000 }),
    links,
    announce: async (deckId, revision) => {
      announced.push({ deckId, revision });
    },
    now: () => NOW,
    announced,
  };
}

describe('hostedAccessHooks', () => {
  it('synthesizes the legacy record for an unclaimed deck, indexes the links a save mints before the write, and announces the change', async () => {
    const inner = memoryAccessStore();
    const deps = instance(inner);
    const puts: string[] = [];
    const writes: string[] = [];
    const order: string[] = [];
    vi.spyOn(deps.links, 'put').mockImplementation(async (hash) => {
      puts.push(hash);
      order.push('index');
    });
    vi.spyOn(inner, 'write').mockImplementation(async (deckId, record, options) => {
      writes.push(deckId);
      order.push('record');
      return memoryAccessStore().write(deckId, record, options);
    });
    const hooks = hostedAccessHooks(DECK, deps);
    const legacy = await hooks.load();
    expect(legacy).toMatchObject({ deckId: DECK, owner: null, generalAccess: { mode: 'open' } });
    const minted = { ...recordBy('anon_owner'), links: [link('lnk_first1', TOKEN)], revision: 1 };
    await hooks.save(minted);
    expect(puts).toEqual([tokenHash(TOKEN)]);
    expect(writes).toEqual([DECK]);
    expect(order).toEqual(['index', 'record']);
    expect(deps.announced).toEqual([{ deckId: DECK, revision: 1 }]);
  });

  it('lets two instances mint one link each: the second save bases on the store etag, not the stale cache', async () => {
    const inner = memoryAccessStore();
    const links = memoryLinkIndex();
    const a = instance(inner, links);
    const b = instance(inner, links);
    // both instances cache the record before any link exists
    await inner.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    await a.store.read(DECK);
    await b.store.read(DECK);
    // A mints the viewer link
    const hooksA = hostedAccessHooks(DECK, a);
    await hooksA.load();
    await hooksA.save({
      ...recordBy('anon_owner'),
      links: [link('lnk_first1', TOKEN)],
      revision: 1,
    });
    // B's cache is stale, and the record functions load before they save, so the second link
    // minted on B bases on the store's etag and lands
    const hooksB = hostedAccessHooks(DECK, b);
    const loaded = await hooksB.load();
    expect(loaded?.links.map((row) => row.id)).toEqual(['lnk_first1']);
    await hooksB.save({
      ...recordBy('anon_owner'),
      links: [link('lnk_first1', TOKEN), link('lnk_second', TOKEN_2)],
      revision: 2,
    });
    expect((await inner.read(DECK))?.record.revision).toBe(2);
    expect(await links.get(tokenHash(TOKEN))).toEqual({ deckId: DECK, linkId: 'lnk_first1' });
    expect(await links.get(tokenHash(TOKEN_2))).toEqual({ deckId: DECK, linkId: 'lnk_second' });
    // A's next write loads first as well and sees revision 2
    expect((await hooksA.load())?.revision).toBe(2);
  });

  it('retries once when the store holds the record the write based on under another etag', async () => {
    const inner = memoryAccessStore();
    const stored = await inner.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    const deps = instance(inner);
    // the first conditional write meets a conflict whose current record equals the one read (a
    // lagging copy answered the read with another etag); the retry on the store's etag lands
    const attempts: (string | null | undefined)[] = [];
    let failed = false;
    vi.spyOn(deps.store, 'write').mockImplementation(async (deckId, record, options) => {
      attempts.push(options?.ifMatch);
      if (!failed) {
        failed = true;
        throw new AccessPreconditionError(deckId, { record: stored.record, etag: '"the-store"' });
      }
      return inner.write(deckId, record, {});
    });
    const hooks = hostedAccessHooks(DECK, deps);
    await hooks.load();
    await expect(
      hooks.save({ ...recordBy('anon_owner'), links: [link('lnk_first1', TOKEN)], revision: 1 }),
    ).resolves.toBeUndefined();
    expect(attempts).toEqual([stored.etag, '"the-store"']);
    expect((await inner.read(DECK))?.record.revision).toBe(1);
  });

  it('answers the SPEC-3 sentence with the current record when the record moved, whatever class the store threw', async () => {
    const inner = memoryAccessStore();
    await inner.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    const deps = instance(inner);
    const hooks = hostedAccessHooks(DECK, deps);
    await hooks.load();
    // another instance writes behind this one's load
    const moved = await inner.write(DECK, { ...recordBy('anon_owner'), revision: 1 }, {});
    const attempt = hooks.save({
      ...recordBy('anon_owner'),
      links: [link('lnk_first1', TOKEN)],
      revision: 1,
    });
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await attempt.catch((error: ConflictError) => {
      expect(error.message).toBe(SHARE_CONFLICT_SENTENCE);
      expect(error.currentRevision).toBe(1);
      expect(error.current).toEqual(moved.record);
    });
    // the store's own class, thrown by another module copy (the deployed bundle's two chunks)
    const foreign = Object.assign(
      new Error(`decks/${DECK}/access.json changed in the Blob store since it was read`),
      {
        name: 'AccessPreconditionError',
        deckId: DECK,
        current: moved,
      },
    );
    const other = instance(inner);
    vi.spyOn(other.store, 'write').mockRejectedValue(foreign);
    const hooksB = hostedAccessHooks(DECK, other);
    await hooksB.load();
    const second = hooksB.save({ ...recordBy('anon_owner'), revision: 2 });
    await expect(second).rejects.toBeInstanceOf(ConflictError);
    await second.catch((error: ConflictError) => {
      expect(error.message).toBe(SHARE_CONFLICT_SENTENCE);
      expect(error.message).not.toContain('changed in the Blob store');
      expect(error.currentRevision).toBe(1);
    });
    // any other failure passes through as it is
    const broken = instance(inner);
    vi.spyOn(broken.store, 'write').mockRejectedValue(new TypeError('disk full'));
    const hooksC = hostedAccessHooks(DECK, broken);
    await hooksC.load();
    await expect(hooksC.save({ ...recordBy('anon_owner'), revision: 2 })).rejects.toThrow(
      'disk full',
    );
    expect(other.announced).toEqual([]);
  });
});

describe('findShareLink', () => {
  function lookupDeps(inner: AccessStore, deckIds: string[]) {
    const links = memoryLinkIndex();
    const store = cachedAccessStore(inner, { bus: memoryAccessBus(), ttlMs: 60_000 });
    const reads = vi.spyOn(inner, 'read');
    const listed = vi.fn(async () => deckIds);
    const deps: ShareLinkLookupDeps = { store, links, deckIds: listed, now: () => new Date(NOW) };
    return { deps, links, store, reads, listed };
  }

  it('answers from the index with one record read, past the cache when asked, and a dead link with no scan', async () => {
    const inner = memoryAccessStore();
    await inner.write(OTHER, recordBy('anon_other', OTHER), { ifMatch: null });
    await inner.write(
      DECK,
      {
        ...recordBy('anon_owner'),
        links: [link('lnk_first1', TOKEN), link('lnk_dead00', REVOKED, NOW)],
      },
      { ifMatch: null },
    );
    const { deps, links, store, reads, listed } = lookupDeps(inner, [OTHER, DECK]);
    await links.put(tokenHash(TOKEN), { deckId: DECK, linkId: 'lnk_first1' });
    await links.put(tokenHash(REVOKED), { deckId: DECK, linkId: 'lnk_dead00' });
    // the record is cached; a fresh lookup drops it and reads the store once
    await store.read(DECK);
    reads.mockClear();
    expect(await findShareLink(tokenHash(TOKEN), { fresh: true }, deps)).toEqual({
      deckId: DECK,
      linkId: 'lnk_first1',
      role: 'commenter',
    });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(listed).not.toHaveBeenCalled();
    // a revoked link the record names is dead, and no deck is scanned for it
    expect(await findShareLink(tokenHash(REVOKED), { fresh: true }, deps)).toBeNull();
    expect(listed).not.toHaveBeenCalled();
    // without fresh, the cached record answers and the store is not read
    reads.mockClear();
    expect(await findShareLink(tokenHash(TOKEN), { fresh: false }, deps)).toMatchObject({
      linkId: 'lnk_first1',
    });
    expect(reads).not.toHaveBeenCalled();
  });

  it('falls back to the scan for a hash the index does not know or points at the wrong deck, and heals the index', async () => {
    const inner = memoryAccessStore();
    await inner.write(OTHER, recordBy('anon_other', OTHER), { ifMatch: null });
    await inner.write(
      DECK,
      { ...recordBy('anon_owner'), links: [link('lnk_first1', TOKEN)] },
      { ifMatch: null },
    );
    const { deps, links, listed } = lookupDeps(inner, [OTHER, DECK]);
    // a link the CLI minted on a checkout: no entry
    expect(await findShareLink(tokenHash(TOKEN), { fresh: true }, deps)).toMatchObject({
      deckId: DECK,
      linkId: 'lnk_first1',
    });
    expect(listed).toHaveBeenCalledTimes(1);
    expect(await links.get(tokenHash(TOKEN))).toEqual({ deckId: DECK, linkId: 'lnk_first1' });
    // a dangling entry (the deck id reused, the record rewritten) is not the answer
    await links.put(tokenHash(TOKEN_2), { deckId: OTHER, linkId: 'lnk_gone00' });
    expect(await findShareLink(tokenHash(TOKEN_2), { fresh: true }, deps)).toBeNull();
    expect(listed).toHaveBeenCalledTimes(2);
    // an index that fails to answer leaves the scan to decide
    vi.spyOn(links, 'get').mockRejectedValueOnce(new Error('store unreachable'));
    expect(await findShareLink(tokenHash(TOKEN), { fresh: true }, deps)).toMatchObject({
      linkId: 'lnk_first1',
    });
    // an unknown token is null after the scan
    expect(
      await findShareLink(tokenHash('DDDDDDDDDDDDDDDDDDDDDD'), { fresh: true }, deps),
    ).toBeNull();
  });
});

describe('authorize() and a revoked publish token (SPEC-3 6.4)', () => {
  it('answers 410 in shadow mode too, while every other denial still passes with the legacy role', async () => {
    const restore = setSecurityLogSink(() => undefined);
    const published: AccessRecord = {
      ...recordBy('anon_owner'),
      publish: {
        hash: tokenHash(TOKEN),
        publishedAt: NOW,
        publishedBy: 'anon_owner',
        revokedAt: '2026-09-14T00:01:00.000Z',
      },
    };
    const previous = bindAuthorize({
      loadRecord: () => Promise.resolve(published),
      mode: () => 'shadow',
      now: () => Date.parse('2026-09-14T00:02:00.000Z'),
    });
    try {
      const stranger = contextForIdentity('anon_7e2f0000-0000-4000-8000-000000000000');
      const gone = await authorize({ ...stranger, publishToken: TOKEN }, DECK, 'read');
      expect(gone).toEqual({ ok: false, status: 410, code: 'gone' });
      // the same stranger without the token: admitted in shadow mode with the denial attached
      const admitted = await authorize(stranger, DECK, 'read');
      expect(admitted.ok).toBe(true);
      expect(admitted.ok && admitted.shadow).toEqual({ status: 404, code: 'not_found' });
    } finally {
      bindAuthorize(previous);
      setSecurityLogSink(restore);
    }
  });
});
