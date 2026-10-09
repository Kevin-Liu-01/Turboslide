// The Vercel client under the store's deadline (the focus round, cycle 3; VERIFICATION C2-F24
// and C2-F27), against a local server standing in for the Blob API (the SDK reads its API
// origin from VERCEL_BLOB_API_URL). The mechanism this pins: @vercel/blob wraps every request in
// async-retry (VERCEL_BLOB_RETRIES attempts, waits of 1, 2, 4 ... s) on a network error or a
// 5xx, so a call the store's deadline gave up on kept retrying underneath for minutes; passing
// the deadline's signal as the SDK's `abortSignal` ends the chain at the deadline. Read only:
// nothing here reaches the real store.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { head } from '@vercel/blob';

import { BlobTimeoutError, boundedBlobClient } from './blob-store.ts';
import {
  DOCUMENTS_TOKEN_VARIABLES,
  PUBLIC_DOCUMENT_MAX_AGE_S,
  TWIN_MAX_AGE_S,
  documentsTokenVariable,
  hasDocumentsToken,
  publicMaxAge,
  vercelBlobClient,
  vercelDocumentsClient,
} from './blob-vercel.ts';

/** A read write token of the SDK's shape; the store id is its fourth segment. */
const TOKEN = 'vercel_blob_rw_teststore_secret';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Each test below waits out the SDK's retry schedule on purpose (attempts at 0, 1 and 3 s; the
 * quiet windows of 400 and 2,500 ms), so three to four seconds is its designed length and
 * vitest's 5 s default left no room for a loaded machine: under the root `pnpm test`, with every
 * package's workers and the check chain's browsers beside it, the two deadline tests timed out
 * while the package alone passed 190 of 190 (the focus round, VERIFICATION F-check5). The budget
 * is wide; the assertions on the attempt counts and the deadline are unchanged.
 */
const TIMING_TEST_MS = 20_000;

describe('the Vercel client under the store deadline', () => {
  let server: Server;
  let hits = 0;
  const env: Record<string, string | undefined> = {};

  beforeAll(async () => {
    server = createServer((_request, response) => {
      hits += 1;
      // the store is down: every attempt is a 503 the SDK retries
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'service_unavailable', message: 'down' } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    env.VERCEL_BLOB_API_URL = process.env.VERCEL_BLOB_API_URL;
    env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES;
    process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${port}`;
    // two retries, so the control call below ends inside the test instead of seventeen minutes on
    process.env.VERCEL_BLOB_RETRIES = '2';
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Polls until `test` accepts `hits` or the time is up; the value it saw last. */
  const hitsUntil = async (test: (n: number) => boolean, ms: number): Promise<number> => {
    const until = Date.now() + ms;
    while (!test(hits) && Date.now() < until) await sleep(20);
    return hits;
  };

  it(
    'the SDK alone keeps retrying a failed request past any deadline the caller kept (the mechanism of C2-F24)',
    async () => {
      hits = 0;
      // the SDK's head with no signal: the first attempt fails at once, the second follows about a
      // second later, the third two seconds after that (async-retry's waits); the windows below are
      // wide, so a loaded machine moves nothing
      const call = head('decks/x/deck.json', { token: TOKEN }).catch((error: unknown) => error);
      // a second attempt arrives about a second after the first, long after a 200 ms deadline
      expect(await hitsUntil((n) => n >= 2, 6000)).toBeGreaterThanOrEqual(2);
      const outcome = await call;
      expect(outcome).toBeInstanceOf(Error);
      expect(hits).toBe(3);
    },
    TIMING_TEST_MS,
  );

  it(
    'the bounded store client ends the call underneath at the deadline: no attempt follows it',
    async () => {
      hits = 0;
      const client = boundedBlobClient(vercelBlobClient({ BLOB_READ_WRITE_TOKEN: TOKEN }), {
        readMs: 200,
      });
      const started = Date.now();
      await expect(client.head('decks/x/deck.json')).rejects.toBeInstanceOf(BlobTimeoutError);
      expect(Date.now() - started).toBeLessThan(2000);
      // the SDK's next attempt would be due a second after the first; the aborted signal ends the
      // chain before it reaches the server, so the count once the first attempt has landed (or was
      // cancelled before it left, on a loaded machine) is the count for good
      await sleep(400);
      const atDeadline = hits;
      expect(atDeadline).toBeLessThanOrEqual(1);
      await sleep(2500);
      expect(hits).toBe(atDeadline);
    },
    TIMING_TEST_MS,
  );

  it(
    'a put, a list and a del carry the signal the same way (a get of a public store reads the blob URL, not the API, so it is not driven here)',
    async () => {
      hits = 0;
      const client = boundedBlobClient(vercelBlobClient({ BLOB_READ_WRITE_TOKEN: TOKEN }), {
        readMs: 200,
        documentWriteMs: 200,
      });
      await expect(client.list('decks/x/')).rejects.toBeInstanceOf(BlobTimeoutError);
      await expect(client.del(['decks/x/deck.json'])).rejects.toBeInstanceOf(BlobTimeoutError);
      await expect(
        client.put('decks/x/deck.json', new Uint8Array([123, 125]), { overwrite: true }),
      ).rejects.toBeInstanceOf(BlobTimeoutError);
      await sleep(400);
      const after = hits;
      await sleep(2500);
      expect(hits).toBe(after);
    },
    TIMING_TEST_MS,
  );
});

// Hardening K1#1 (docs/hardening/HARDENING.md 4.1; DATA-2): a document put on the public store
// carries a minute of max age, so a copy cached before the documents move to the private store
// expires within a minute; a twin keeps a year; a caller's own value wins; a put on the private
// store carries no default. Read from the header the SDK sends the stand-in API.
describe('the max age of a put on the public store (hardening K1#1)', () => {
  let server: Server;
  const seen = new Map<string, string | null>();
  const env: Record<string, string | undefined> = {};

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const pathname = url.searchParams.get('pathname') ?? '';
      const header = request.headers['x-cache-control-max-age'];
      seen.set(pathname, typeof header === 'string' ? header : null);
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            url: `https://teststore.public.blob.vercel-storage.com/${pathname}`,
            downloadUrl: `https://teststore.public.blob.vercel-storage.com/${pathname}?download=1`,
            pathname,
            contentType: 'application/octet-stream',
            contentDisposition: 'inline',
            etag: '"abc"',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    env.VERCEL_BLOB_API_URL = process.env.VERCEL_BLOB_API_URL;
    process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (env.VERCEL_BLOB_API_URL === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = env.VERCEL_BLOB_API_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const body = new Uint8Array([123, 125]);

  it('names the rule: a minute for a document, a year for a twin', () => {
    expect(PUBLIC_DOCUMENT_MAX_AGE_S).toBe(60);
    expect(TWIN_MAX_AGE_S).toBe(31_536_000);
    expect(publicMaxAge('decks/x/deck.json')).toBe(60);
    expect(publicMaxAge('decks/x/access.json')).toBe(60);
    expect(publicMaxAge('users/acct_1/decks.json')).toBe(60);
    expect(publicMaxAge('exports/x/job/x.pdf')).toBe(60);
    expect(publicMaxAge('decks/x/assets/logo.abc123.png')).toBe(31_536_000);
    expect(publicMaxAge('d/x/AAAAAAAAAAAAAAAAAAAAAA/logo.abc123.png')).toBe(31_536_000);
    expect(publicMaxAge('u/key/avatar.webp')).toBe(31_536_000);
    // a deck named `assets` is still a deck: its documents are not twins
    expect(publicMaxAge('decks/assets/deck.json')).toBe(60);
  });

  it('sends 60 for a document, a year for a twin and the caller value when one is named', async () => {
    const client = vercelBlobClient({ BLOB_READ_WRITE_TOKEN: TOKEN });
    await client.put('decks/x/deck.json', body, { overwrite: true });
    await client.put('decks/x/slides/title.json', body, { overwrite: true });
    await client.put('decks/x/assets/logo.abc123.png', body, { overwrite: false });
    await client.put('decks/x/.thumbs/s1/light@320/title.png', body, {
      overwrite: true,
      cacheControlMaxAge: 31_536_000,
    });
    expect(seen.get('decks/x/deck.json')).toBe('60');
    expect(seen.get('decks/x/slides/title.json')).toBe('60');
    expect(seen.get('decks/x/assets/logo.abc123.png')).toBe('31536000');
    expect(seen.get('decks/x/.thumbs/s1/light@320/title.png')).toBe('31536000');
  });

  it('sends no default on the private store', async () => {
    const client = vercelBlobClient(
      { TURBOSLIDE_BLOB_PRIVATE_TOKEN: TOKEN },
      { tokenVariable: 'TURBOSLIDE_BLOB_PRIVATE_TOKEN', access: 'private' },
    );
    await client.put('decks/y/deck.json', body, { overwrite: true });
    expect(seen.has('decks/y/deck.json')).toBe(true);
    expect(seen.get('decks/y/deck.json')).toBeNull();
  });
});

// Hardening K1#4 (docs/hardening/HARDENING.md 4.1): the private store's token is read under the
// name docs/hosting.md gives it and under the one the Vercel dashboard makes when the store is
// connected with the prefix TURBOSLIDE_BLOB_PRIVATE, so the stores Kevin connected are read.
describe('the private store token names (hardening K1#4)', () => {
  it('reads the documented name first, then the dashboard connection name', () => {
    expect(DOCUMENTS_TOKEN_VARIABLES).toEqual([
      'TURBOSLIDE_BLOB_PRIVATE_TOKEN',
      'TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN',
    ]);
    expect(documentsTokenVariable({})).toBeNull();
    expect(hasDocumentsToken({ TURBOSLIDE_BLOB_PRIVATE_TOKEN: '' })).toBe(false);
    expect(documentsTokenVariable({ TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN: TOKEN })).toBe(
      'TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN',
    );
    expect(
      documentsTokenVariable({
        TURBOSLIDE_BLOB_PRIVATE_TOKEN: TOKEN,
        TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN: TOKEN,
      }),
    ).toBe('TURBOSLIDE_BLOB_PRIVATE_TOKEN');
    // the dashboard's name alone opens the private client and the split layout
    expect(() =>
      vercelDocumentsClient({ TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN: TOKEN }),
    ).not.toThrow();
    expect(() => vercelDocumentsClient({})).toThrow(/TURBOSLIDE_BLOB_PRIVATE_TOKEN is not set/);
  });
});
