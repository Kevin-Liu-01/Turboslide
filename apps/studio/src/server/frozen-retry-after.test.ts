// The routes answer the store's write freeze with 503 and `Retry-After: 30` (docs/hosting.md 10:
// "StorageFrozenError: 503, retry-after 30 s"). Before, /api/actions and /mcp answered the 503
// without the header, the bundle upload answered 500 and the export route 502. The agent surface's
// own answers (errorResponse, toolErrorBody, the MCP session's 503) are tested in
// packages/agent/src/http/http.test.ts and packages/mcp; this file drives the studio's bundle and
// export routes with the store refusing.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_SENTENCE, StorageFrozenError, StorageLayoutError } from '@turboslide/store/migrate';

const state = vi.hoisted(() => ({ error: new Error('unset') }));

vi.mock('./bundle-core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* the deployment's admin, admitted by a key: the route skips the per deck decision */
  bundleRouteAdmissionWithKey: async () => ({
    kind: 'key',
    ctx: { principal: { id: 'principal-admin', kind: 'account', admin: true } },
  }),
  importDeckBundle: async () => {
    throw state.error;
  },
}));
vi.mock('./flags', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertFlag: async () => undefined,
}));
vi.mock('./ratelimit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkQuota: async () => null,
}));
vi.mock('./authorize', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  authorize: async () => ({ ok: true }),
}));
vi.mock('./route-caller', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  routeCallerContext: async () => ({ principal: null }),
  bearerKeyContext: async () => null,
}));
vi.mock('@turboslide/render-worker/client', () => ({
  createWorkerClient: () => ({
    mode: 'inline',
    exec: 'test',
    job: async () => {
      throw state.error;
    },
    list: async () => {
      throw state.error;
    },
  }),
}));

const bundle = await import('../routes/api/decks.bundle');
const exportRoute = await import('../routes/api/export.$deckId');

type Handler = (input: { params: { deckId: string }; request: Request }) => Promise<Response>;
const handler = (route: { options: unknown }, method: 'GET' | 'POST'): Handler =>
  (route.options as { server: { handlers: Record<string, Handler> } }).server.handlers[method]!;

const DECK = 'q8wf2kzr0uyb3nxc5vlp1a7h2m';

const upload = () =>
  handler(
    bundle.Route,
    'POST',
  )({
    params: { deckId: '' },
    request: new Request('https://www.turboslide.com/api/decks/bundle', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array([80, 75, 3, 4, 0, 0]),
    }),
  });

const exportJob = () =>
  handler(
    exportRoute.Route,
    'GET',
  )({
    params: { deckId: DECK },
    request: new Request(`https://www.turboslide.com/api/export/${DECK}?job=job-1`),
  });

const token = process.env.TURBOSLIDE_TOKEN;
afterEach(() => {
  if (token === undefined) delete process.env.TURBOSLIDE_TOKEN;
  else process.env.TURBOSLIDE_TOKEN = token;
});

describe('a store refusal at the bundle and export routes (docs/hosting.md 10)', () => {
  it('answers a bundle upload during the freeze with 503, Retry-After 30 and the sentence', async () => {
    delete process.env.TURBOSLIDE_TOKEN;
    state.error = new StorageFrozenError(FROZEN_SENTENCE);
    const answer = await upload();
    expect(answer.status).toBe(503);
    expect(answer.headers.get('retry-after')).toBe('30');
    expect(await answer.json()).toMatchObject({
      error: { name: 'StorageFrozenError', status: 503, message: FROZEN_SENTENCE, retryAfter: 30 },
    });
    /* any other failure keeps the route's 500, with no wait */
    state.error = new Error('a bug');
    const failed = await upload();
    expect(failed.status).toBe(500);
    expect(failed.headers.get('retry-after')).toBeNull();
  });

  it('answers an export read during the freeze or a failed layout read with 503 and its wait', async () => {
    delete process.env.TURBOSLIDE_TOKEN;
    state.error = new StorageFrozenError(FROZEN_SENTENCE);
    const frozen = await exportJob();
    expect(frozen.status).toBe(503);
    expect(frozen.headers.get('retry-after')).toBe('30');
    expect(await frozen.json()).toMatchObject({ error: { status: 503, retryAfter: 30 } });
    state.error = new StorageLayoutError('meta.json did not answer');
    const layout = await exportJob();
    expect(layout.status).toBe(503);
    expect(layout.headers.get('retry-after')).toBe('5');
    state.error = new Error('the worker is down');
    const failed = await exportJob();
    expect(failed.status).toBe(502);
    expect(failed.headers.get('retry-after')).toBeNull();
  });
});
