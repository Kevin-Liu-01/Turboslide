// Hardening K1#3 (docs/hardening/HARDENING.md 4.1; DATA-2): a new deck's record carries a random
// asset key of its own, its twins are written under `d/<id>/<assetKey>/` on the public store, and
// the viewer payload's asset base names that keyed prefix, so the page loads every twin by key and
// no twin URL can be derived from the deck id and a file name. A record that names the derived
// key (a deck from before K1#3) keeps the route prefix until `migrate-storage rekey`; a bundle
// upload's new deck is keyed like the others (bundle-asset-key.test.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasOwnAssetKey, legacyAssetKey } from '@turboslide/schema/access';
import { blobAccessStore } from '@turboslide/store/access-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { keyedClient } from '@turboslide/store/blob-vercel';

const selection = vi.hoisted(() => ({ kind: 'blob' as 'blob' | 'tmp' | 'file' }));
const records = vi.hoisted(() => ({ read: null as null | ((deckId: string) => Promise<unknown>) }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSelection: () => ({ kind: selection.kind, reason: 'test', persistent: true, blob: true }),
}));
vi.mock('./access', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    readStoredAccess: (deckId: string) =>
      records.read === null ? Promise.resolve(null) : records.read(deckId),
  };
});

const { recordNewDeck } = await import('./access');
const { contextForIdentity } = await import('./authorize');
const { viewerAssetBase } = await import('./asset-base');

const NOW = '2026-10-08T22:00:00.000Z';
const HOST = 'teststore.public.blob.vercel-storage.com';
const previousHost = process.env.TURBOSLIDE_PUBLIC_STORE_HOST;

afterEach(() => {
  selection.kind = 'blob';
  records.read = null;
  if (previousHost === undefined) delete process.env.TURBOSLIDE_PUBLIC_STORE_HOST;
  else process.env.TURBOSLIDE_PUBLIC_STORE_HOST = previousHost;
});

describe("a new deck's asset key (hardening K1#3)", () => {
  it('is random for every new record and never the one derived from the id', async () => {
    const store = blobAccessStore(memoryBlobClient(`https://${HOST}`));
    const ctx = contextForIdentity('usr_owner');
    const a = await recordNewDeck('aaaaaaaaaaaaaaaaaaaaaa', ctx, { now: NOW, store });
    const b = await recordNewDeck('bbbbbbbbbbbbbbbbbbbbbb', ctx, { now: NOW, store });
    for (const { record } of [a, b]) {
      expect(record.assetKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{21}$/);
      expect(hasOwnAssetKey(record)).toBe(true);
    }
    expect(a.record.assetKey).not.toBe(b.record.assetKey);
    // a record that names the derived key has no key of its own (a deck from before K1#3)
    const c = await recordNewDeck('cccccccccccccccccccccc', ctx, {
      now: NOW,
      store,
      assetKey: legacyAssetKey('cccccccccccccccccccccc'),
    });
    expect(hasOwnAssetKey(c.record)).toBe(false);
  });

  it("writes the twin under the key, and the viewer's asset base names the same keyed URL", async () => {
    process.env.TURBOSLIDE_PUBLIC_STORE_HOST = HOST;
    const store = memoryBlobClient(`https://${HOST}`);
    const deckId = 'q8wf2kzr0uyb3nxc5vlp1a7h2m';
    const recorded = await recordNewDeck(deckId, contextForIdentity('usr_owner'), {
      now: NOW,
      store: blobAccessStore(store),
    });
    const key = recorded.record.assetKey;
    // the store's twin write through the deployment's client (blob-vercel.ts layoutBlobClient)
    const client = keyedClient(store);
    const put = await client.put(`decks/${deckId}/assets/cover.1a2b3c4d.png`, new Uint8Array([1]), {
      overwrite: false,
      contentType: 'image/png',
    });
    expect(put.url).toBe(`https://${HOST}/d/${deckId}/${key}/assets/cover.1a2b3c4d.png`);
    // the address made from the id and the file name holds nothing
    expect(await store.head(`decks/${deckId}/assets/cover.1a2b3c4d.png`)).toBeNull();
    // the payload's base plus the manifest's twin path is that URL
    records.read = (id) => blobAccessStore(store).read(id);
    const base = await viewerAssetBase(deckId);
    expect(base).toBe(`https://${HOST}/d/${deckId}/${key}/`);
    expect(`${base}assets/cover.1a2b3c4d.png`).toBe(put.url);
    // the key segment is the record's random key, not the one derived from the id
    expect(base.split('/').at(-2)).toBe(key);
    expect(key).not.toBe(legacyAssetKey(deckId));
  });

  it('keeps the route prefix for a deck without a key, off the blob store, or with no public host', async () => {
    process.env.TURBOSLIDE_PUBLIC_STORE_HOST = HOST;
    const store = memoryBlobClient(`https://${HOST}`);
    const access = blobAccessStore(store);
    await recordNewDeck('legacydeck', contextForIdentity('usr_owner'), {
      now: NOW,
      store: access,
      assetKey: legacyAssetKey('legacydeck'),
    });
    await recordNewDeck('keyeddeck', contextForIdentity('usr_owner'), { now: NOW, store: access });
    records.read = (id) => access.read(id);
    expect(await viewerAssetBase('legacydeck')).toBe('/decks/legacydeck/');
    expect(await viewerAssetBase('no-record')).toBe('/decks/no-record/');
    expect(await viewerAssetBase('keyeddeck')).toMatch(
      new RegExp(`^https://${HOST.replace(/\./g, '\\.')}/d/keyeddeck/[A-Za-z0-9_-]{22}/$`),
    );
    selection.kind = 'tmp';
    expect(await viewerAssetBase('keyeddeck')).toBe('/decks/keyeddeck/');
    selection.kind = 'blob';
    delete process.env.TURBOSLIDE_PUBLIC_STORE_HOST;
    expect(await viewerAssetBase('keyeddeck')).toBe('/decks/keyeddeck/');
  });
});
