import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AccessRecord } from '@turboslide/identity/access';
import { synthesizeLegacyRecord } from '@turboslide/identity/access';
import { accountPrincipalId } from '@turboslide/identity/ids';

import { ensureUserByEmail } from './auth/actions';
import { buildIdentityRuntime, setIdentityRuntime } from './auth/identity';
import type { IdentityRuntime } from './auth/identity';
import { bindAuthorize, boundDecide } from './authorize';
import { bundleRouteAdmissionWithKey } from './bundle-core';
import { setSecurityLogSink } from './log';
import { ROUTE_BEARER_REQUIRED, bearerKeyContext } from './route-caller';

// Post-deploy review of caa20174: /docs/agents/http tells a hosted agent to send the API key
// `turboslide login` saves, and documents GET /api/render/<slideId> and POST /api/export/<id> for
// it; `turboslide deck push` and `deck pull` send the key to the two bundle routes. Those four
// routes compared the bearer with TURBOSLIDE_TOKEN alone and answered 401 "bearer token required"
// to every key. A live key now admits the request and `authorize()` decides the deck for the
// key's owner with its scopes; an unknown key is still refused.

setSecurityLogSink(() => undefined);

const STATIC = 'a-static-bearer-for-tests-only-0123456789';
const DECK = 'route-caller-deck';

describe('an API key on the render, export and bundle routes', () => {
  let dir = '';
  let runtime: IdentityRuntime;
  let ownerKey = '';
  let strangerKey = '';
  let owner = '';
  let before: string | undefined;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'turboslide-route-caller-'));
    runtime = buildIdentityRuntime({
      env: {
        TURBOSLIDE_AUTH_DB: 'state/auth.sqlite',
        TURBOSLIDE_MAIL: 'capture',
        TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
      },
      root: dir,
      stateDir: join(dir, 'state'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
    });
    await runtime.ready;
    await setIdentityRuntime(runtime);
    const alice = await ensureUserByEmail(runtime, 'alice@example.test');
    owner = accountPrincipalId(alice.id);
    ownerKey = (
      await runtime.keys.create({ userId: alice.id, name: 'alice', scopes: ['read', 'export'] })
    ).secret;
    const bob = await ensureUserByEmail(runtime, 'bob@example.test');
    strangerKey = (await runtime.keys.create({ userId: bob.id, name: 'bob', scopes: ['read'] }))
      .secret;
  }, 60_000);

  afterAll(async () => {
    await setIdentityRuntime(undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    before = process.env.TURBOSLIDE_TOKEN;
    process.env.TURBOSLIDE_TOKEN = STATIC;
    const record: AccessRecord = {
      ...synthesizeLegacyRecord(DECK),
      owner,
      createdBy: owner,
      generalAccess: { mode: 'restricted', role: 'viewer' },
    };
    bindAuthorize({
      decide: boundDecide,
      loadRecord: (deckId) => Promise.resolve(deckId === DECK ? record : null),
      now: () => Date.now(),
    });
  });

  afterEach(() => {
    if (before === undefined) delete process.env.TURBOSLIDE_TOKEN;
    else process.env.TURBOSLIDE_TOKEN = before;
    bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  });

  const withBearer = (path: string, bearer?: string, method = 'GET') =>
    new Request(`http://localhost:4321${path}`, {
      method,
      headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
    });

  it(
    'resolves a live key to its owner with its scopes, and nothing else',
    { timeout: 30_000 },
    async () => {
      const ctx = await bearerKeyContext(withBearer('/api/render/title', ownerKey));
      expect(ctx?.agent?.scopes).toEqual(['read', 'export']);
      expect(ctx?.agent?.ownerId).toBe(owner);
      expect(
        await bearerKeyContext(withBearer('/api/render/title', 'ts_' + 'x'.repeat(40))),
      ).toBeNull();
      expect(await bearerKeyContext(withBearer('/api/render/title', STATIC))).toBeNull();
      expect(await bearerKeyContext(withBearer('/api/render/title'))).toBeNull();
    },
  );

  it(
    'admits a key to the bundle routes, the static bearer as before, and refuses an unknown key',
    { timeout: 30_000 },
    async () => {
      const path = `/api/decks/${DECK}/bundle`;
      const admitted = await bundleRouteAdmissionWithKey(
        withBearer(path, ownerKey),
        'bundle-download',
        DECK,
        bearerKeyContext,
      );
      expect(admitted).toMatchObject({ kind: 'key' });
      expect(
        await bundleRouteAdmissionWithKey(
          withBearer(path, STATIC),
          'bundle-download',
          DECK,
          bearerKeyContext,
        ),
      ).toEqual({ kind: 'bearer' });
      const refused = await bundleRouteAdmissionWithKey(
        withBearer(path, 'ts_' + 'y'.repeat(40)),
        'bundle-download',
        DECK,
        bearerKeyContext,
      );
      expect(refused).toBeInstanceOf(Response);
      expect((refused as Response).status).toBe(401);
    },
  );

  it(
    'lets the export and render routes decide the deck for the key: a stranger key reads not found, not 401',
    { timeout: 30_000 },
    async () => {
      type Handler = (ctx: {
        request: Request;
        params: Record<string, string>;
      }) => Promise<Response>;
      const handlers = (route: unknown) =>
        (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server
          .handlers;
      const { Route: ExportRoute } = await import('../routes/api/export.$deckId');
      const { Route: RenderRoute } = await import('../routes/api/render.$slideId');
      const exportGet = handlers(ExportRoute)['GET']!;
      const renderGet = handlers(RenderRoute)['GET']!;

      const exported = await exportGet({
        request: withBearer(`/api/export/${DECK}`, strangerKey),
        params: { deckId: DECK },
      });
      expect(exported.status).toBe(404);
      const rendered = await renderGet({
        request: withBearer(`/api/render/title?deck=${DECK}`, strangerKey),
        params: { slideId: 'title' },
      });
      expect(rendered.status).toBe(404);

      for (const answer of [
        await exportGet({
          request: withBearer(`/api/export/${DECK}`, 'ts_' + 'z'.repeat(40)),
          params: { deckId: DECK },
        }),
        await renderGet({
          request: withBearer(`/api/render/title?deck=${DECK}`, 'ts_' + 'z'.repeat(40)),
          params: { slideId: 'title' },
        }),
      ]) {
        expect(answer.status).toBe(401);
        expect(JSON.stringify(await answer.json())).toContain(ROUTE_BEARER_REQUIRED);
      }
    },
  );
});
