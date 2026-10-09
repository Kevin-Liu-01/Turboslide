// Hardening K1#5a (docs/hardening/HARDENING.md 4.1; CRIT-M4, DATA-3): every produced file (an
// export, a bundle, a web page build) reaches the browser as `/api/download/s.<token>`, never as
// the store's address. The token names the store path, the deck, the principal and an expiry ten
// minutes out; the route refuses another principal (403), answers 410 once expired and 404 for a
// token that does not verify, and streams the file from the store.
import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { ExportReport } from '@turboslide/schema/export';

import { contextForIdentity } from './authorize';
import type { AuthContext } from './authorize';
import { jsonBody, storeExportFiles, storedExportPath } from './export-sync';
import type { SyncExportResult } from './export-sync';
import {
  STORED_LINK_TTL_MS,
  isProducedPath,
  signStoredToken,
  storedFileLink,
  storedFileResponse,
  verifyStoredToken,
} from './stored-files';

const STORE_HOST = 'https://teststore.public.blob.vercel-storage.com';
const NOW = Date.parse('2026-10-08T22:00:00.000Z');
const OWNER = 'usr_owner';

function result(files: { name: string; bytes: Uint8Array }[]): SyncExportResult {
  return {
    jobId: 'mgx1-0922ac',
    deckId: 'q4-review',
    title: 'Q4 review',
    report: {
      deckId: 'q4-review',
      revision: 12,
      format: 'pdf',
      mode: 'flatten',
      theme: 'light',
      fontSet: 'exact',
      fontSetVersion: '1',
      files: [],
      fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
      slides: [],
      geometryInBounds: true,
      perfect: true,
      passed: true,
      residual: [],
    } as unknown as ExportReport,
    files: files.map((file) => ({
      name: file.name,
      source: file.name,
      bytes: file.bytes.byteLength,
      sha256: 'x',
      contentType: 'application/pdf',
      data: new Uint8Array(file.bytes),
    })),
    verify: 'not-requested',
    worker: 'local',
    exec: 'inprocess',
    renderer: null,
    ms: 1,
    log: [],
  };
}

function tokenOf(url: string): string {
  return url.slice('/api/download/'.length);
}

const request = new Request('https://www.turboslide.com/api/download/x');

/** The route as the deployment runs it, over one fake store and one caller. */
function serve(
  url: string,
  caller: AuthContext,
  store: Map<string, Uint8Array>,
  now: number = NOW,
): Promise<Response> {
  return storedFileResponse(tokenOf(url), request, {
    now,
    context: async () => caller,
    read: async (path) => store.get(path) ?? null,
  });
}

describe('the produced files through the download route (hardening K1#5a)', () => {
  it('answers an export with the download route and no store host, and keeps the path for the record', async () => {
    const client = memoryBlobClient(STORE_HOST);
    const owner = contextForIdentity(OWNER);
    const stored = await storeExportFiles(
      result([{ name: 'Q4 review.pdf', bytes: new Uint8Array([1, 2, 3]) }]),
      client,
      (target) => storedFileLink(target, owner),
    );
    const [file] = stored.files;
    expect(file?.stored).toBe(true);
    expect(file?.url).toMatch(/^\/api\/download\/s\./);
    expect(file?.path).toBe(storedExportPath('q4-review', 'mgx1-0922ac', 'Q4 review.pdf'));
    // the answer the page and the agent read carries the route alone
    const body = JSON.stringify(jsonBody(stored));
    expect(body).toContain('/api/download/s.');
    expect(body).not.toContain('blob.vercel-storage.com');
    expect(body).not.toContain(STORE_HOST);
    // the stored copy is where the token says
    expect(client.blobs.has(file?.path ?? '')).toBe(true);
  });

  it("links a web page build and a bundle the same way, and only a deck's produced files", async () => {
    const owner = contextForIdentity(OWNER);
    const build = await storedFileLink(
      {
        path: 'builds/q4-review/mgx1-a1b2c3/Q4 review.html',
        deckId: 'q4-review',
        name: 'Q4 review.html',
      },
      owner,
    );
    const bundle = await storedFileLink(
      {
        path: 'bundles/q4-review/mgx1-a1b2c3/q4-review-12.zip',
        deckId: 'q4-review',
        name: 'q4-review-12.zip',
      },
      owner,
    );
    for (const url of [build, bundle]) {
      expect(url).toMatch(/^\/api\/download\/s\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
      expect(url).not.toContain('vercel-storage');
    }
    expect(isProducedPath('decks/q4-review/deck.json', 'q4-review')).toBe(false);
    expect(isProducedPath('exports/other/job/x.pdf', 'q4-review')).toBe(false);
    expect(isProducedPath('exports/q4-review/job/sub/x.pdf', 'q4-review')).toBe(false);
    expect(() =>
      signStoredToken({
        path: 'decks/q4-review/access.json',
        deckId: 'q4-review',
        principalId: OWNER,
        name: 'access.json',
      }),
    ).toThrow(TypeError);
    // a caller with no identity gets no link: a link names the one who may open it
    await expect(
      storedFileLink({ path: 'builds/q4-review/f/x.html', deckId: 'q4-review', name: 'x.html' }, {
        principal: null,
        linkGrants: [],
      } as unknown as AuthContext),
    ).rejects.toThrow(TypeError);
  });

  it('serves the file to its principal and refuses another, an expired token and a forged one', async () => {
    const path = storedExportPath('q4-review', 'mgx1-0922ac', 'Q4 review.pptx');
    // over one 1 MB part, so the answer is read back from more than one
    const bytes = new Uint8Array(2 * 1024 * 1024 + 17);
    for (let i = 0; i < bytes.byteLength; i += 1) bytes[i] = i % 251;
    const store = new Map([[path, bytes]]);
    const url = `/api/download/${signStoredToken(
      { path, deckId: 'q4-review', principalId: OWNER, name: 'Q4 review.pptx' },
      NOW,
    )}`;
    // the principal: the file, an attachment, not cached
    const ok = await serve(url, contextForIdentity(OWNER), store);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toBe('attachment; filename="Q4 review.pptx"');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.compare(Buffer.from(await ok.arrayBuffer()), Buffer.from(bytes))).toBe(0);
    // an alias of the principal (an anonymous browser merged into the account) opens it too
    const merged = contextForIdentity('usr_merged');
    merged.principal = { ...merged.principal!, aliases: [OWNER] } as AuthContext['principal'];
    expect((await serve(url, merged, store)).status).toBe(200);
    // another principal: 403, and the file is never read
    let reads = 0;
    const refused = await storedFileResponse(tokenOf(url), request, {
      now: NOW,
      context: async () => contextForIdentity('usr_other'),
      read: async () => {
        reads += 1;
        return bytes;
      },
    });
    expect(refused.status).toBe(403);
    expect(reads).toBe(0);
    // expired: 410 with a sentence
    const expired = await serve(
      url,
      contextForIdentity(OWNER),
      store,
      NOW + STORED_LINK_TTL_MS + 1,
    );
    expect(expired.status).toBe(410);
    expect(((await expired.json()) as { error: { message: string } }).error.message).toMatch(
      /expired/,
    );
    // forged: a changed path under the same signature, or a bare guess, is 404
    const [prefix, body, mac] = tokenOf(url).split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8')),
        p: storedExportPath('q4-review', 'mgx1-0922ac', 'other.pptx'),
      }),
    ).toString('base64url');
    expect(
      (
        await serve(
          `/api/download/${prefix}.${forgedBody}.${mac}`,
          contextForIdentity(OWNER),
          store,
        )
      ).status,
    ).toBe(404);
    expect(verifyStoredToken('s.e30.00', NOW)).toEqual({ ok: false, status: 404 });
    // a file the store no longer holds is 404
    expect((await serve(url, contextForIdentity(OWNER), new Map())).status).toBe(404);
  });
});
