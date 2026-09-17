// The read through cache in front of the access store (gslides-parity SPEC-3 6.1; VERIFICATION-3
// finding 34): a read inside the trust window answers the entry and costs no store read, the
// window is the option the studio shortens on the blob tier, a write on this instance replaces
// the entry and publishes the drop to every subscriber, and `drop` then `read` sees a record
// another instance wrote behind the cache, which is what a share write's etag and a link
// exchange lean on (apps/studio/src/server/access.ts `readStoredAccessFresh`). The second group
// runs two cached stores over one fake Blob store as two function instances: the second link
// minted after another instance's write, the revoke seen everywhere within the TTL, and a Blob
// conflict thrown by another copy of the store module still mapped, never the store's sentence.
// The third group is the link hash index of F2 (`links/<hex>.json`) on its three backends.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { AccessRecord, ShareLink } from '@turboslide/schema/access';
import { legacyAssetKey, newDeckRecord } from '@turboslide/schema/access';

import {
  AccessPreconditionError,
  blobAccessStore,
  blobIndexStore,
  blobLinkIndex,
  cachedAccessStore,
  emptyDeckIndex,
  fileLinkIndex,
  indexUpdates,
  isAccessPrecondition,
  isBlobConflict,
  linkIndexKey,
  memoryAccessBus,
  memoryAccessStore,
  memoryLinkIndex,
  newLinkHashes,
  provenGet,
  accessEtag,
  immutableCopyPath,
  putWithCopy,
} from './access-store';
import type { FreshBodyFetch } from './access-store';
import { memoryBlobClient } from './blob-fake';
import type { BlobClient } from './blob-store';
import { BlobPreconditionError } from './blob-store';

const DECK = 'q4-review';
const NOW = '2026-09-14T00:00:00.000Z';
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function recordBy(owner: string): AccessRecord {
  return newDeckRecord(DECK, owner, legacyAssetKey(DECK), NOW);
}

function link(id: string, hash: string, revokedAt: string | null = null): ShareLink {
  return {
    id,
    hash,
    role: 'viewer',
    createdAt: NOW,
    createdBy: 'anon_owner',
    revokedAt,
    expiresAt: null,
  };
}

function withLinks(links: ShareLink[], revision: number): AccessRecord {
  return { ...recordBy('anon_owner'), links, revision };
}

function harness(ttlMs?: number) {
  const inner = memoryAccessStore();
  const reads = vi.spyOn(inner, 'read');
  let clock = 1_000;
  const bus = memoryAccessBus();
  const dropped: string[] = [];
  bus.subscribe((deckId) => dropped.push(deckId));
  const store = cachedAccessStore(inner, {
    bus,
    now: () => clock,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
  return { inner, reads, store, bus, dropped, advance: (ms: number) => (clock += ms) };
}

describe('cachedAccessStore', () => {
  it('answers the entry inside the trust window and reads the store again after it', async () => {
    const { inner, reads, store, advance } = harness(5_000);
    await inner.write(DECK, recordBy('anon_first'));
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    // another instance writes behind this cache
    await inner.write(DECK, recordBy('anon_second'));
    advance(4_000);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    expect(reads).toHaveBeenCalledTimes(1);
    advance(1_001);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('trusts a read for 60 s by default', async () => {
    const { inner, reads, store, advance } = harness();
    await inner.write(DECK, recordBy('anon_first'));
    await store.read(DECK);
    await inner.write(DECK, recordBy('anon_second'));
    advance(59_000);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    advance(1_001);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('sees a record written behind the cache after drop, inside the window', async () => {
    const { inner, store, advance } = harness(60_000);
    await inner.write(DECK, recordBy('anon_first'));
    const first = await store.read(DECK);
    const behind = await inner.write(DECK, recordBy('anon_second'));
    advance(100);
    expect((await store.read(DECK))?.etag).toBe(first?.etag);
    store.drop(DECK);
    const fresh = await store.read(DECK);
    expect(fresh?.record.owner).toBe('anon_second');
    expect(fresh?.etag).toBe(behind.etag);
    // and the fresh etag is the one a conditional write needs
    await expect(
      store.write(DECK, { ...recordBy('anon_second'), revision: 1 }, { ifMatch: fresh?.etag }),
    ).resolves.toMatchObject({ record: { revision: 1 } });
  });

  it('caches a missing record too, until a drop or the window ends', async () => {
    const { inner, reads, store } = harness(5_000);
    expect(await store.read(DECK)).toBeNull();
    await inner.write(DECK, recordBy('anon_first'));
    expect(await store.read(DECK)).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
    store.drop(DECK);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
  });

  it('replaces the entry on a write here and publishes the drop to every subscriber', async () => {
    const { inner, store, bus, dropped } = harness(60_000);
    const other = cachedAccessStore(inner, { bus, now: () => 1_000, ttlMs: 60_000 });
    await inner.write(DECK, recordBy('anon_first'));
    await store.read(DECK);
    await other.read(DECK);
    await store.write(DECK, recordBy('anon_second'));
    expect(dropped).toEqual([DECK]);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    // the other cache on the same bus dropped its entry and reads the store
    expect((await other.read(DECK))?.record.owner).toBe('anon_second');
    await store.remove(DECK);
    expect(dropped).toEqual([DECK, DECK]);
    expect(await store.read(DECK)).toBeNull();
    other.close();
    store.close();
  });
});

/** Two function instances: two cached blob stores with their own buses over one fake Blob store. */
function instances(ttlMs = 5_000) {
  const client = memoryBlobClient();
  let clock = 1_000;
  const now = () => clock;
  const a = cachedAccessStore(blobAccessStore(client), { bus: memoryAccessBus(), now, ttlMs });
  const b = cachedAccessStore(blobAccessStore(client), { bus: memoryAccessBus(), now, ttlMs });
  return { client, a, b, advance: (ms: number) => (clock += ms) };
}

describe('two blob tier instances over one store (finding 34)', () => {
  it('mints the second link after another instance wrote: the fresh read carries the store etag, the cached one is a mapped conflict', async () => {
    const { a, b } = instances();
    const base = await a.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    // B caches the record before any link exists
    expect((await b.read(DECK))?.etag).toBe(base.etag);
    // A mints the first link (the viewer link's mint on the rep's instance)
    const one = await a.write(DECK, withLinks([link('lnk_first1', HASH_A)], 1), {
      ifMatch: base.etag,
    });
    // B's cache still holds the record without the link
    expect((await b.read(DECK))?.record.links).toHaveLength(0);
    // B's fresh read (drop, then read: F1) sees the link at once with the etag the store holds
    b.drop(DECK);
    const fresh = await b.read(DECK);
    expect(fresh?.etag).toBe(one.etag);
    expect(fresh?.record.links.map((row) => row.id)).toEqual(['lnk_first1']);
    // the second link, minted on B against the fresh etag, lands
    const two = withLinks([link('lnk_first1', HASH_A), link('lnk_second', HASH_B)], 2);
    await expect(b.write(DECK, two, { ifMatch: fresh?.etag })).resolves.toMatchObject({
      record: { revision: 2 },
    });
    // A, writing against the etag of its own earlier write, meets the store's conflict as an
    // AccessPreconditionError with the current record attached, never the store's sentence
    const stale = a.write(DECK, { ...two, revision: 3 }, { ifMatch: one.etag });
    await expect(stale).rejects.toBeInstanceOf(AccessPreconditionError);
    await stale.catch((error: AccessPreconditionError) => {
      expect(error.current?.record.revision).toBe(2);
      expect(error.message).not.toContain('changed in the Blob store');
    });
  });

  it('never caches a missing record on the blob tier, so a deck made on another instance is found on the next read (b7 C2-R13)', async () => {
    /* a cached null held the "no record" answer for the TTL while decide() reads a recordless
       deck as the legacy open deck (VERIFICATION F-missing-record); a record, once found, is
       cached as before */
    const { a, b } = instances(5_000);
    expect(await a.read(DECK)).toBeNull();
    await b.write(DECK, recordBy('anon_maker'));
    expect((await a.read(DECK))?.record.owner).toBe('anon_maker');
  });

  it('a revoke on one instance is seen by every instance within the TTL and by a fresh read at once', async () => {
    const { a, b, client, advance } = instances(5_000);
    const live = await a.write(DECK, withLinks([link('lnk_first1', HASH_A)], 1), { ifMatch: null });
    expect((await b.read(DECK))?.record.links[0]?.revokedAt).toBeNull();
    // A revokes the link
    await a.write(DECK, withLinks([link('lnk_first1', HASH_A, NOW)], 2), { ifMatch: live.etag });
    // B's cache shows the link live for at most the trust window
    advance(4_999);
    expect((await b.read(DECK))?.record.links[0]?.revokedAt).toBeNull();
    advance(2);
    expect((await b.read(DECK))?.record.links[0]?.revokedAt).toBe(NOW);
    // a third instance reading fresh sees the revoke at once
    const c = cachedAccessStore(blobAccessStore(client), { bus: memoryAccessBus(), ttlMs: 5_000 });
    c.drop(DECK);
    expect((await c.read(DECK))?.record.links[0]?.revokedAt).toBe(NOW);
    // and A's own cache moved with its write
    expect((await a.read(DECK))?.record.revision).toBe(2);
  });

  it('maps a conflict thrown by another copy of the store module and never surfaces the store sentence', async () => {
    const client = memoryBlobClient();
    const current = await blobAccessStore(client).write(DECK, recordBy('anon_owner'), {
      ifMatch: null,
    });
    // the deployed function loads blob-store.ts twice; the Blob client's copy throws a class this
    // module's `instanceof` does not know, so the match is by name
    const foreign = Object.assign(
      new Error(`decks/${DECK}/access.json changed in the Blob store since it was read`),
      { name: 'BlobPreconditionError', pathname: `decks/${DECK}/access.json` },
    );
    expect(foreign).not.toBeInstanceOf(BlobPreconditionError);
    expect(isBlobConflict(foreign)).toBe(true);
    expect(isBlobConflict(new BlobPreconditionError('x'))).toBe(true);
    expect(isBlobConflict(new Error('network'))).toBe(false);
    const throwing: BlobClient = {
      ...client,
      put: async () => {
        throw foreign;
      },
    };
    const attempt = blobAccessStore(throwing).write(DECK, withLinks([], 1), { ifMatch: '"stale"' });
    await expect(attempt).rejects.toBeInstanceOf(AccessPreconditionError);
    await attempt.catch((error: AccessPreconditionError) => {
      expect(error.current?.etag).toBe(current.etag);
      expect(error.message).not.toContain('changed in the Blob store');
    });
    // the studio's hooks match the access conflict by name as well
    const foreignAccess = Object.assign(new Error('moved'), {
      name: 'AccessPreconditionError',
      deckId: DECK,
      current,
    });
    expect(isAccessPrecondition(foreignAccess)).toBe(true);
    expect(isAccessPrecondition(new AccessPreconditionError(DECK, null))).toBe(true);
    expect(isAccessPrecondition(new Error('AccessPreconditionError'))).toBe(false);
  });
});

describe('the link hash index (finding 34 F2)', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('keys a sha256 hash by its hex under links/ and refuses anything else', () => {
    expect(linkIndexKey(HASH_A)).toBe(`links/${'a'.repeat(64)}.json`);
    expect(() => linkIndexKey('sha256:short')).toThrow(TypeError);
    expect(() => linkIndexKey('md5:abc')).toThrow(TypeError);
  });

  it('names the links a save mints, all of them on a first write', () => {
    const before = withLinks([link('lnk_first1', HASH_A)], 1);
    const after = withLinks([link('lnk_first1', HASH_A), link('lnk_second', HASH_B)], 2);
    expect(newLinkHashes(before, after).map((row) => row.id)).toEqual(['lnk_second']);
    expect(newLinkHashes(null, after).map((row) => row.id)).toEqual(['lnk_first1', 'lnk_second']);
    expect(newLinkHashes(after, after)).toEqual([]);
  });

  it('stores, answers and removes an entry on the memory, blob and file backends', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-link-index-'));
    dirs.push(dir);
    const client = memoryBlobClient();
    const entry = { deckId: DECK, linkId: 'lnk_first1' };
    for (const index of [memoryLinkIndex(), blobLinkIndex(client), fileLinkIndex(dir)]) {
      expect(await index.get(HASH_A)).toBeNull();
      await index.put(HASH_A, entry);
      // idempotent: a second instance indexing the same link never conflicts
      await index.put(HASH_A, entry);
      expect(await index.get(HASH_A)).toEqual(entry);
      expect(await index.get(HASH_B)).toBeNull();
      await index.remove(HASH_A);
      expect(await index.get(HASH_A)).toBeNull();
    }
    // the blob entry sits beside the records under its own prefix, as JSON
    await blobLinkIndex(client).put(HASH_B, entry);
    expect(client.blobs.has(`links/${'b'.repeat(64)}.json`)).toBe(true);
    expect(client.calls.filter((call) => call.op === 'put').map((call) => call.pathname)).toContain(
      `links/${'b'.repeat(64)}.json`,
    );
    // a foreign or torn body is a miss, never a throw
    writeFileSync(join(dir, `links/${'a'.repeat(64)}.json`), '{"not": "an entry"}');
    expect(await fileLinkIndex(dir).get(HASH_A)).toBeNull();
    await client.put(`links/${'a'.repeat(64)}.json`, new TextEncoder().encode('torn{'), {
      overwrite: true,
    });
    expect(await blobLinkIndex(client).get(HASH_A)).toBeNull();
  });
});

// The proven read (the focus round, docs/FOCUS.md section 5 rank 1; VERIFICATION.md pass 2
// F-share-copy, F-share-404, F-missing-record): on the public store the body a url serves can be
// the CDN's copy from before the last overwrite while `head()` already names the new version
// (measured on the enforce preview 2026-09-16: a second `share.createLink` 155 ms after the first
// read the record at revision 0 and was refused). The fake's `holdGet()` is that CDN.
describe('the proven read (pass 2)', () => {
  /** The url read past the CDN in tests: the fake's current bytes. */
  const freshFrom =
    (client: ReturnType<typeof memoryBlobClient>): FreshBodyFetch =>
    async (url) => {
      const pathname = url.slice(client.base.length + 1).split('?')[0] ?? '';
      const stored = client.blobs.get(pathname);
      return stored === undefined ? null : new Uint8Array(stored.bytes);
    };
  const noSleep = async (): Promise<void> => undefined;

  it('reads the record the mint wrote while the plain read still answers the record from before it', async () => {
    const client = memoryBlobClient();
    const store = blobAccessStore(client, { fetchFresh: freshFrom(client), sleep: noSleep });
    const first = await store.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    // every instance has read revision 0 once (the Share dialog opening, the loader)
    expect((await store.read(DECK))?.record.revision).toBe(0);
    client.holdGet();
    const minted = await store.write(DECK, withLinks([link('lnk_aaaaaa', HASH_A)], 1), {
      ifMatch: first.etag,
    });
    // the CDN keeps the old body: the plain client answers revision 0 under the old version
    const plain = await client.get(`decks/${DECK}/access.json`);
    expect(JSON.parse(new TextDecoder().decode(plain?.bytes)).revision).toBe(0);
    // the proven read answers the mint's record under the store's version
    const read = await store.read(DECK);
    expect(read?.record.revision).toBe(1);
    expect(read?.record.links.map((link) => link.id)).toEqual(['lnk_aaaaaa']);
    expect(read?.etag).toBe(minted.etag);
    client.releaseGet();
  });

  it('answers the last body under its own version when nothing proves it, so a write on it is refused as stale', async () => {
    const client = memoryBlobClient();
    const store = blobAccessStore(client, {
      fetchFresh: async () => null,
      retries: 1,
      sleep: noSleep,
    });
    const first = await store.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    await store.read(DECK);
    client.holdGet();
    const minted = await store.write(DECK, withLinks([link('lnk_aaaaaa', HASH_A)], 1), {
      ifMatch: first.etag,
    });
    // a record written before the copies existed has none under its version (the cycle 2 fix
    // round): the copy is removed, so nothing proves the body
    client.blobs.delete(immutableCopyPath(`decks/${DECK}/access.json`, minted.etag));
    const stale = await store.read(DECK);
    expect(stale?.record.revision).toBe(0);
    expect(stale?.etag).toBe(first.etag);
    await expect(
      store.write(DECK, withLinks([link('lnk_aaaaaa', HASH_A), link('lnk_bbbbbb', HASH_B)], 2), {
        ifMatch: stale?.etag ?? null,
      }),
    ).rejects.toBeInstanceOf(AccessPreconditionError);
    client.releaseGet();
  });

  it('reads the record from its immutable copy when the plain body and the url read both lag (C2-F2)', async () => {
    const client = memoryBlobClient();
    // the url read lags like the plain read on the function's edge (measured on the cycle 2
    // preview: "revision 0, not 1" with the store at revision 3)
    const store = blobAccessStore(client, {
      fetchFresh: async () => null,
      retries: 0,
      sleep: noSleep,
    });
    const first = await store.write(DECK, recordBy('anon_owner'), { ifMatch: null });
    await store.read(DECK);
    client.holdGet();
    const minted = await store.write(DECK, withLinks([link('lnk_aaaaaa', HASH_A)], 1), {
      ifMatch: first.etag,
    });
    const plain = await client.get(`decks/${DECK}/access.json`);
    expect(JSON.parse(new TextDecoder().decode(plain?.bytes)).revision).toBe(0);
    const read = await store.read(DECK);
    expect(read?.record.revision).toBe(1);
    expect(read?.etag).toBe(minted.etag);
    // the copy lives under the deck's state folder, which the mirror never pulls
    expect(immutableCopyPath(`decks/${DECK}/access.json`, minted.etag)).toBe(
      `decks/${DECK}/.turboslide/copies/${minted.etag.replace(/"/g, '')}.json`,
    );
    expect(client.blobs.has(immutableCopyPath(`decks/${DECK}/access.json`, minted.etag))).toBe(
      true,
    );
    // a write on the proven record lands
    await store.write(
      DECK,
      withLinks([link('lnk_aaaaaa', HASH_A), link('lnk_bbbbbb', HASH_B)], 2),
      {
        ifMatch: read?.etag ?? null,
      },
    );
    client.releaseGet();
  });

  it('stores the copy before the record, so no version head() names is without one', async () => {
    const client = memoryBlobClient();
    const bytes = new TextEncoder().encode('{"n":1}');
    client.calls.length = 0;
    await putWithCopy(client, 'users/anon_v/decks.json', bytes, {
      overwrite: false,
      contentType: 'application/json',
    });
    expect(client.calls.map((call) => `${call.op} ${call.pathname}`)).toEqual([
      `put users/anon_v/.turboslide/copies/${accessEtag(bytes).replace(/"/g, '')}.json`,
      'put users/anon_v/decks.json',
    ]);
    // the same bytes again overwrite the same copy without a conflict
    await putWithCopy(client, 'users/anon_v/decks.json', bytes, { overwrite: true });
    expect(immutableCopyPath('links/abc.json', '"00"')).toBe('links/.turboslide/copies/00.json');
  });

  it('the deck index reads its copy when its own url lags, and the link index reads no copy', async () => {
    const client = memoryBlobClient();
    const lagging = { fetchFresh: async () => null, retries: 0, sleep: noSleep };
    const index = blobIndexStore(client, lagging);
    await index.update('anon_v', indexUpdates.shared(DECK, 'viewer', NOW, 'link', 'lnk_a'));
    await index.read('anon_v');
    client.holdGet();
    await index.update('anon_v', indexUpdates.shared(DECK, 'editor', NOW, 'link', 'lnk_b'));
    expect((await index.read('anon_v')).shared).toEqual([
      { deckId: DECK, role: 'editor', since: NOW, via: 'link', linkId: 'lnk_b' },
    ]);
    client.releaseGet();
    const links = blobLinkIndex(client, lagging);
    client.calls.length = 0;
    await links.put(HASH_A, { deckId: DECK, linkId: 'lnk_a' });
    expect(await links.get(HASH_A)).toEqual({ deckId: DECK, linkId: 'lnk_a' });
    expect(client.calls.some((call) => call.pathname.includes('/copies/'))).toBe(false);
  });

  it('answers null for a path the store does not hold and the client body for a version that is not an md5', async () => {
    const client = memoryBlobClient();
    expect(await provenGet(client, 'decks/none/access.json')).toBeNull();
    const dated: BlobClient = {
      ...client,
      head: async (pathname) => {
        const entry = await client.head(pathname);
        return entry === null ? null : { ...entry, version: '2026-09-16T00:00:00.000Z' };
      },
    };
    await client.put('decks/x/access.json', new TextEncoder().encode('{"v":1}'), {
      overwrite: true,
    });
    const got = await provenGet(dated, 'decks/x/access.json', { fetchFresh: async () => null });
    expect(new TextDecoder().decode(got?.bytes)).toBe('{"v":1}');
  });

  it('the link index and the deck index read through the same proof', async () => {
    const client = memoryBlobClient();
    const fresh = freshFrom(client);
    const links = blobLinkIndex(client, { fetchFresh: fresh, sleep: noSleep });
    const index = blobIndexStore(client, { fetchFresh: fresh, sleep: noSleep });
    await links.put(HASH_A, { deckId: DECK, linkId: 'lnk_a' });
    expect(await links.get(HASH_A)).toEqual({ deckId: DECK, linkId: 'lnk_a' });
    await index.update('anon_v', indexUpdates.shared(DECK, 'viewer', NOW, 'link', 'lnk_a'));
    expect(await index.read('anon_v')).toEqual({
      ...emptyDeckIndex(),
      shared: [{ deckId: DECK, role: 'viewer', since: NOW, via: 'link', linkId: 'lnk_a' }],
    });
    client.holdGet();
    await index.update('anon_v', indexUpdates.shared(DECK, 'editor', NOW, 'link', 'lnk_b'));
    expect((await index.read('anon_v')).shared).toEqual([
      { deckId: DECK, role: 'editor', since: NOW, via: 'link', linkId: 'lnk_b' },
    ]);
    client.releaseGet();
  });

  it('a shared row is written once per deck, role, via and link', () => {
    const base = emptyDeckIndex();
    const once = indexUpdates.shared(DECK, 'viewer', NOW, 'link', 'lnk_a')(base);
    expect(once?.shared).toHaveLength(1);
    expect(indexUpdates.shared(DECK, 'viewer', NOW, 'link', 'lnk_a')(once ?? base)).toBeNull();
    const rotated = indexUpdates.shared(DECK, 'viewer', NOW, 'link', 'lnk_c')(once ?? base);
    expect(rotated?.shared.map((row) => row.linkId)).toEqual(['lnk_c']);
    expect(indexUpdates.shared(DECK, 'viewer', NOW, 'grant')(once ?? base)?.shared).toEqual([
      { deckId: DECK, role: 'viewer', since: NOW, via: 'grant' },
    ]);
  });
});
