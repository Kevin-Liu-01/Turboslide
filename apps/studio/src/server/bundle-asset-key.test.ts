// Hardening K1#3 and SD#6, the fix of verifier pass 1 F3 (docs/hardening/build/HR-fix.md): a deck
// made by a bundle upload takes a random asset key of its own, as every other new deck does, and
// its twins are written under `d/<id>/<assetKey>/` on the public store. Before the fix the unpack
// wrote the twins before the record, so the record kept the key derived from the deck id, the
// twins stayed at `decks/<id>/assets/<file>` (an address anyone can make from the id) and the
// assets route served them by name to anyone. The route is driven as the deployment runs it: the
// blob tier over a memory store behind the deployment's keyed client (blob-vercel.ts
// `keyedClient`), the access records on the same store.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@turboslide/identity/access';
import { hasOwnAssetKey, keyedTwinPrefix, legacyAssetKey } from '@turboslide/schema/access';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { blobAccessStore } from '@turboslide/store/access-store';
import type { BlobClient } from '@turboslide/store/blob-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { keyedClient } from '@turboslide/store/blob-vercel';
import type { HostedDecks } from '@turboslide/store/hosted';
import { openHostedDecks } from '@turboslide/store/hosted';
import { packDeckDir } from '@turboslide/store/pack';

const state = vi.hoisted(() => ({
  root: '',
  client: null as BlobClient | null,
  decks: null as HostedDecks | null,
  ctx: null as AuthContext | null,
}));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSelection: () => ({ kind: 'blob', reason: 'test', persistent: true, blob: true }),
  exportBlobClient: () => Promise.resolve(state.client),
  ensureDecks: () => Promise.resolve(state.decks),
  stateDir: () => join(state.root, 'state'),
  decksDir: () => join(state.root, 'overlay', 'decks'),
}));
vi.mock('./authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authorize')>();
  return { ...actual, requestContext: () => Promise.resolve(state.ctx) };
});
vi.mock('./flags', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertFlag: () => Promise.resolve(),
}));
vi.mock('./ratelimit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkQuota: () => Promise.resolve(null),
}));

const { Route } = await import('../routes/api/decks.bundle');
const { bindAuthorize, bootstrapAgentContext, boundDecide, contextForIdentity } =
  await import('./authorize');

type Handler = (input: { request: Request }) => Promise<Response>;
const post = (Route.options as unknown as { server: { handlers: { POST: Handler } } }).server
  .handlers.POST;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

/** The worked deck as a bundle zip, with every twin its manifest names. */
function bundle(): { zip: Uint8Array<ArrayBuffer>; twins: string[] } {
  const dir = join(state.root, 'source', WORKED_DECK.id);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  const twins: string[] = [];
  for (const asset of Object.values(WORKED_DECK.assets)) {
    for (const twin of Object.values(asset.twins)) {
      writeFileSync(join(dir, twin), /\.jpe?g$/.test(twin) ? JPEG : PNG);
      twins.push(twin);
    }
  }
  return { zip: packDeckDir(dir).zip, twins };
}

// one store for the file: the access module keeps the stores it built for the process
const raw = memoryBlobClient('https://teststore.public.blob.vercel-storage.com');
state.client = keyedClient(raw);

beforeEach(async () => {
  state.root = mkdtempSync(join(tmpdir(), 'hr-fix-bundle-'));
  state.decks = openHostedDecks({
    selection: { kind: 'blob', reason: 'test', persistent: true, blob: true },
    workspaceDecksDir: null,
    overlayRoot: join(state.root, 'overlay'),
    seed: null,
    blob: state.client!,
  });
  await state.decks.ready();
  // authorize reads the records the uploads write (a replace is decided on the record)
  bindAuthorize({
    decide: boundDecide,
    loadRecord: async (deckId) => (await blobAccessStore(raw).read(deckId))?.record ?? null,
    now: () => Date.now(),
  });
  delete process.env.TURBOSLIDE_TOKEN;
});

afterEach(() => {
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  rmSync(state.root, { recursive: true, force: true });
});

async function upload(ctx: AuthContext, query = ''): Promise<{ deckId: string; status: number }> {
  state.ctx = ctx;
  const { zip } = bundle();
  const answer = await post({
    request: new Request(`https://www.turboslide.com/api/decks/bundle${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/zip', 'content-length': String(zip.byteLength) },
      body: zip,
    }),
  });
  const body = (await answer.json()) as { deckId?: string; error?: unknown };
  expect(body.error, JSON.stringify(body)).toBeUndefined();
  return { deckId: body.deckId ?? '', status: answer.status };
}

async function expectKeyed(deckId: string): Promise<void> {
  const stored = await blobAccessStore(raw).read(deckId);
  expect(stored).not.toBeNull();
  const record = stored!.record;
  // a key of its own: random, never the one derived from the deck id
  expect(hasOwnAssetKey(record)).toBe(true);
  expect(record.assetKey).not.toBe(legacyAssetKey(deckId));
  expect(record.assetKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{21}$/);
  const { twins } = bundle();
  expect(twins.length).toBeGreaterThan(0);
  const keyed = keyedTwinPrefix(deckId, record.assetKey);
  for (const twin of twins) {
    // the twin lives under the key, and the address made from the id and the name holds nothing
    expect(await raw.head(`${keyed}${twin}`), twin).not.toBeNull();
    expect(await raw.head(`decks/${deckId}/${twin}`), twin).toBeNull();
  }
  // the deck's own documents went to their place, and the caller still names the twins by name
  expect(await raw.head(`decks/${deckId}/deck.json`)).not.toBeNull();
  expect(await state.client!.head(`decks/${deckId}/${twins[0]}`)).not.toBeNull();
}

describe("a bundle upload's new deck takes a key of its own (K1#3, verifier F3)", () => {
  it(
    "writes a person's uploaded deck with a random key and its twins under it",
    { timeout: 120_000 },
    async () => {
      const { deckId, status } = await upload(contextForIdentity('usr_owner'));
      expect(status).toBe(201);
      expect(deckId).not.toBe(WORKED_DECK.id);
      await expectKeyed(deckId);
    },
  );

  it(
    "writes the admin's uploaded deck (the bearer's path, the one the verifier read) the same way",
    { timeout: 120_000 },
    async () => {
      const { deckId, status } = await upload(bootstrapAgentContext('token'));
      expect(status).toBe(201);
      await expectKeyed(deckId);
      // a second upload of the same bundle takes the free sibling, keyed as well
      const again = await upload(bootstrapAgentContext('token'));
      expect(again.deckId).not.toBe(deckId);
      await expectKeyed(again.deckId);
    },
  );

  it(
    'keeps the record of a deck the admin replaces, and its key',
    { timeout: 120_000 },
    async () => {
      const first = await upload(bootstrapAgentContext('token'));
      const before = (await blobAccessStore(raw).read(first.deckId))!.record.assetKey;
      const replaced = await upload(
        bootstrapAgentContext('token'),
        `?as=${encodeURIComponent(first.deckId)}&replace=1`,
      );
      expect(replaced).toEqual({ deckId: first.deckId, status: 200 });
      expect((await blobAccessStore(raw).read(first.deckId))!.record.assetKey).toBe(before);
      await expectKeyed(first.deckId);
    },
  );
});
