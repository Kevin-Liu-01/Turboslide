// Hardening K1#2 (docs/hardening/HARDENING.md 4.1; DATA-2): once the split client of layout v2
// writes `.thumbs/` to the private store, `/api/render/<slide>?w=` streams the stored thumbnail
// instead of answering a 302 to a URL only the store's token opens; an object on the public store
// keeps the 302. The route is driven as the deployment runs it, over two fake stores behind the
// split client, with the page's thumbnail grant.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { CONTENT_RULE } from '@turboslide/schema/fixtures';
import type { BlobClient } from '@turboslide/store/blob-store';
import { thumbPathname } from '@turboslide/store/blob-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { emptyMeta, splitBlobClient, writeMeta } from '@turboslide/store/migrate';

const state = vi.hoisted(() => ({ dir: '', blob: null as BlobClient | null }));

const DECK = 'q8wf2kzr0uyb3nxc5vlp1a7h2m';
const SLIDE = 'title';

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  stateDir: () => state.dir,
  exportBlobClient: () => Promise.resolve(state.blob),
  isUnsavedDraft: () => Promise.resolve(false),
  ensureDeckAssets: () => Promise.resolve(),
  openDeckStore: () =>
    Promise.resolve({
      read: () =>
        Promise.resolve({
          document: {
            deck: { revision: 3, sections: [{ id: 's1', slideIds: [SLIDE] }] },
            slides: { [SLIDE]: { ...(CONTENT_RULE as Slide), id: SLIDE } },
          },
        }),
    }),
}));
vi.mock('./flags', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireFlag: () => Promise.resolve(null),
}));

const { Route } = await import('../routes/api/render.$slideId');
const { signThumbGrant } = await import('./tokens');
const { slideStamp } = await import('./thumbs');

type Handler = (input: { params: { slideId: string }; request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const stamp = slideStamp({ ...(CONTENT_RULE as Slide), id: SLIDE });

function thumbRequest(): Request {
  const grant = encodeURIComponent(signThumbGrant(DECK, 'viewer'));
  return new Request(
    `https://www.turboslide.com/api/render/${SLIDE}?deck=${DECK}&theme=light&w=320&r=${stamp}&s=${grant}`,
  );
}

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'k1-thumbs-'));
});
afterAll(() => {
  if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true });
});

describe('a private stored thumbnail is streamed (hardening K1#2)', () => {
  it('answers 200 with the PNG and no location when the split client keeps .thumbs/ private', async () => {
    const legacy = memoryBlobClient('https://ab12.public.blob.vercel-storage.com');
    const documents = memoryBlobClient('https://ab12.private.blob.vercel-storage.com');
    await writeMeta(documents, { ...emptyMeta('2026-10-08T22:00:00.000Z'), layout: 'v2' });
    const split = splitBlobClient({ legacy, documents }, { ttlMs: 0 });
    const pathname = thumbPathname(DECK, stamp, 'light', 320, SLIDE);
    await split.put(pathname, PNG, { overwrite: true, contentType: 'image/png' });
    // the split client put it on the private store
    expect(documents.blobs.has(pathname)).toBe(true);
    expect(legacy.blobs.has(pathname)).toBe(false);
    state.blob = split;
    const answer = await get({ params: { slideId: SLIDE }, request: thumbRequest() });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('location')).toBeNull();
    expect(answer.headers.get('content-type')).toBe('image/png');
    expect(answer.headers.get('x-turboslide-source')).toBe('blob');
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(PNG);
  });

  it('keeps the 302 to an object on the public store', async () => {
    const legacy = memoryBlobClient('https://ab12.public.blob.vercel-storage.com');
    const pathname = thumbPathname(DECK, stamp, 'light', 320, SLIDE);
    await legacy.put(pathname, PNG, { overwrite: true, contentType: 'image/png' });
    state.blob = legacy;
    const answer = await get({ params: { slideId: SLIDE }, request: thumbRequest() });
    expect(answer.status).toBe(302);
    expect(answer.headers.get('location')).toBe(
      `https://ab12.public.blob.vercel-storage.com/${pathname}`,
    );
  });
});
