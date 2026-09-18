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
import { vercelBlobClient } from './blob-vercel.ts';

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
