// Who manages the template collection every account of a deployment shares (template-manager.ts,
// deployment-admin.ts; Kevin, 2026-11-09: "Admin only"). The rule is a pure function over the
// context every transport carries, and the open checkout rule is driven over an explicit
// runtime. The rest runs the real
// server functions, the real deck dispatcher, the real access store and the real identity
// runtime over a file store with no `TURBOSLIDE_TOKEN`: a browser on a host that is not local is
// a stranger to the collection, and a browser on localhost holds the checkout. TanStack Start's
// compiler is not in the test, so `createServerFn` is a plain builder here and `getRequest`
// answers the request of the call (the harness of admin-window.test.ts).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Author } from '@turboslide/schema/mutations';

import type { AuthContext } from './authorize';

/** The request the server functions read as `getRequest()`; each call sets it. */
let current: Request | undefined;

type Validator = (input: unknown) => unknown;
type Handler = (options: { data: unknown; context: object }) => unknown;

/** createServerFn without the compiler: the validator, then the handler (admin-window.test.ts). */
function serverFn(validator?: Validator) {
  return {
    validator: (next: Validator) => serverFn(next),
    inputValidator: (next: Validator) => serverFn(next),
    middleware: () => serverFn(validator),
    handler:
      (handler: Handler) =>
      async (options?: { data?: unknown }): Promise<unknown> =>
        handler({
          data: validator === undefined ? options?.data : await validator(options?.data),
          context: {},
        }),
  };
}

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createServerFn: () => serverFn(),
}));

vi.mock('@tanstack/react-start/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRequest: () => {
    if (current === undefined) throw new Error('no request');
    return current;
  },
  setCookie: () => undefined,
  setResponseHeader: () => undefined,
}));

/** A deployment's own host, where nobody holds the folder. */
const REMOTE = 'https://slides.example.test';
/** A checkout's dev server. */
const LOCAL = 'http://localhost:4883';

// the store, the realtime tier and the secrets are read when the modules first run
const ENV: Record<string, string> = {
  TURBOSLIDE_STORE: 'file',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_DOWNLOAD_SECRET: 'a-download-secret-for-tests-only-0123456789',
  TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
};
const saved: Record<string, string | undefined> = {};
const root = mkdtempSync(join(tmpdir(), 'turboslide-template-manager-'));
mkdirSync(join(root, 'decks'), { recursive: true });
for (const [name, value] of Object.entries({ ...ENV, TURBOSLIDE_ROOT: root })) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
for (const name of [
  'TURBOSLIDE_TOKEN',
  'TURBOSLIDE_LOCAL_TOKEN',
  'TURBOSLIDE_TRUST_PROXY',
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_HOST',
]) {
  saved[name] = process.env[name];
  delete process.env[name];
}

const { runDeckAction } = await import('./agent-actions');
const { onOpenCheckoutWith } = await import('./auth');
const { ADMIN_ONLY } = await import('./auth/actions');
const { buildIdentityRuntime, setIdentityRuntime } = await import('./auth/identity');
const { ensurePrincipal } = await import('./auth/session');
const { memoryApiKeyStore } = await import('./auth/tokens');
const { bindAuthorize, boundDecide } = await import('./authorize');
const { createWithRecord, loadAccessRecord } = await import('./access');
const { deckDispatcher } = await import('./actions');
const { setSecurityLogSink } = await import('./log');
const { createStoredDeck, openDeckStore } = await import('./root');
const { runsDeployment } = await import('./deployment-admin');
const { templateNameTaken } = await import('./template-manager');
const { deleteStoredTemplate, listTemplateGallery, renameStoredTemplate, useTemplateForNew } =
  await import('./templates');

setSecurityLogSink(() => undefined);

/** One browser: its origin, its anonymous principal with the sealed cookie, and a deck it owns. */
type Browser = { origin: string; id: string; cookie: string; deck: string };

const stranger: Browser = { origin: REMOTE, id: '', cookie: '', deck: 'stranger-deck' };
const holder: Browser = { origin: LOCAL, id: '', cookie: '', deck: 'holder-deck' };

const authorOf = (browser: Browser): Author => ({
  kind: 'human',
  name: 'Visitor',
  principalId: browser.id,
});

/** Runs one server function call as a browser. */
async function as<T>(browser: Browser, call: () => Promise<T>): Promise<T> {
  current = new Request(`${browser.origin}/edit/${browser.deck}`, {
    headers: { cookie: browser.cookie },
  });
  try {
    return await call();
  } finally {
    current = undefined;
  }
}

/** One action through the editor's server function, as a browser on its own deck. */
function act(browser: Browser, action: string, input: object): Promise<unknown> {
  return as(browser, () =>
    runDeckAction({
      deckId: browser.deck,
      action: action as Parameters<typeof runDeckAction>[0]['action'],
      input,
      author: authorOf(browser),
    }),
  );
}

async function refusalOf(run: Promise<unknown>): Promise<{ name: string; message: string }> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error('the call was not refused');
}

async function revisionOf(deck: string): Promise<number> {
  return (await (await openDeckStore(deck)).read()).document.deck.revision;
}

type ListAnswer = { templates: { id: string; name: string }[]; default: string; manage: boolean };

let runtime: ReturnType<typeof buildIdentityRuntime>;

async function mint(browser: Browser): Promise<void> {
  const minted = await ensurePrincipal(
    new Request(`${browser.origin}/edit/${browser.deck}`),
    runtime.secret,
  );
  if (minted === null || minted.setCookie === undefined) throw new Error('no browser cookie');
  browser.id = minted.principal.id;
  browser.cookie = minted.setCookie.split(';')[0] ?? '';
  await createWithRecord(
    browser.deck,
    { principal: { id: browser.id, kind: 'anonymous', admin: false }, linkGrants: [] },
    () => createStoredDeck({ name: browser.deck, from: 'blank', id: browser.deck }),
  );
}

beforeAll(async () => {
  bindAuthorize({ decide: boundDecide, loadRecord: loadAccessRecord, now: () => Date.now() });
  runtime = buildIdentityRuntime({
    env: { TURBOSLIDE_AUTH_DB: 'state/auth.sqlite', TURBOSLIDE_MAIL: 'capture', ...ENV },
    root,
    stateDir: join(root, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  await runtime.ready;
  await setIdentityRuntime(runtime);
  await mint(stranger);
  await mint(holder);
}, 120_000);

afterAll(async () => {
  await setIdentityRuntime(undefined);
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(root, { recursive: true, force: true });
}, 120_000);

describe('the template manager rule', () => {
  const account = (admin: boolean): AuthContext => ({
    principal: { id: 'usr_0f1e2d3c', kind: 'account', admin },
    linkGrants: [],
  });
  const key = (admin: boolean, scopes: readonly string[]): AuthContext =>
    ({
      ...account(admin),
      agent: { tokenId: 'key_1', ownerId: 'usr_0f1e2d3c', scopes, name: 'a key' },
    }) as AuthContext;

  it('is the deployment admin: a session, or a key that carries the admin scope', () => {
    expect(runsDeployment(account(true), false)).toBe(true);
    expect(runsDeployment(key(true, ['admin']), false)).toBe(true);
    // an admin account's key without the scope, and the scope on anyone else's key
    expect(runsDeployment(key(true, ['read', 'write']), false)).toBe(false);
    expect(runsDeployment(key(false, ['admin']), false)).toBe(false);
  });

  it('refuses an account that is not an admin, an anonymous browser and nobody', () => {
    expect(runsDeployment(account(false), false)).toBe(false);
    expect(
      runsDeployment(
        { principal: { id: 'anon_1', kind: 'anonymous', admin: false }, linkGrants: [] },
        false,
      ),
    ).toBe(false);
    expect(runsDeployment({ principal: null, linkGrants: [] }, false)).toBe(false);
    expect(runsDeployment(null, false)).toBe(false);
  });

  it('admits anyone on an open checkout', () => {
    expect(runsDeployment(null, true)).toBe(true);
    expect(runsDeployment(account(false), true)).toBe(true);
  });
});

describe('the open checkout rule', () => {
  const open = (
    url: string,
    env: Record<string, string>,
    headers: Record<string, string> = {},
    hosted = false,
  ): boolean =>
    onOpenCheckoutWith(new Request(url, { headers }), {
      env,
      keys: memoryApiKeyStore(),
      checkoutToken: null,
      hosted,
    });

  it('holds on localhost with no token set, with or without a cookie', () => {
    expect(open(`${LOCAL}/decks/templates`, {})).toBe(true);
    expect(open(`${LOCAL}/decks/templates`, {}, { cookie: 'ts_id=whatever' })).toBe(true);
    expect(open('http://127.0.0.1:4321/decks/templates', {})).toBe(true);
  });

  it('never holds where a token is set, off localhost, or with a bearer', () => {
    expect(open(`${LOCAL}/decks/templates`, { TURBOSLIDE_TOKEN: 'a-fake-bearer' })).toBe(false);
    expect(open(`${REMOTE}/decks/templates`, {})).toBe(false);
    expect(open(`${LOCAL}/decks/templates`, {}, { authorization: 'Bearer anything' })).toBe(false);
  });

  it('follows the checkout token switch, and never a forwarded host the deployment does not trust', () => {
    expect(open(`${LOCAL}/decks/templates`, { TURBOSLIDE_LOCAL_TOKEN: 'require' })).toBe(false);
    expect(
      open(`${LOCAL}/decks/templates`, {
        TURBOSLIDE_LOCAL_TOKEN: 'require',
        TURBOSLIDE_LOCAL_OPEN: '1',
      }),
    ).toBe(true);
    expect(open(`${REMOTE}/decks/templates`, {}, { 'x-forwarded-host': 'localhost' })).toBe(false);
    expect(
      open(`${LOCAL}/decks/templates`, {}, { 'x-forwarded-host': 'slides.example.test' }),
    ).toBe(false);
  });
});

describe('the shared templates on a host that is not local', () => {
  it('lets a visitor save a new template and tells it that it does not manage them', async () => {
    const made = await act(stranger, 'template.create', {
      deckId: stranger.deck,
      name: 'Shared sales',
      baseRevision: await revisionOf(stranger.deck),
    });
    expect(made).toMatchObject({ id: 'shared-sales', name: 'Shared sales', replaced: false });
    const list = (await act(stranger, 'template.list', {})) as ListAnswer;
    expect(list.manage).toBe(false);
    expect(list.templates.map((row) => row.id)).toContain('shared-sales');
    expect((await as(stranger, () => listTemplateGallery())).manage).toBe(false);
  }, 60_000);

  it('refuses the visitor a save over a saved name, a replace, a rename, a delete and the default', async () => {
    const baseRevision = await revisionOf(stranger.deck);
    expect(
      await refusalOf(
        act(stranger, 'template.create', {
          deckId: stranger.deck,
          name: 'shared SALES',
          baseRevision,
        }),
      ),
    ).toEqual({ name: 'ForbiddenError', message: templateNameTaken('Shared sales') });
    for (const [action, input] of [
      ['template.update', { id: 'shared-sales', deckId: stranger.deck, baseRevision }],
      ['template.rename', { id: 'shared-sales', name: 'Taken over' }],
      ['template.delete', { id: 'shared-sales', confirm: true }],
      ['template.setDefault', { id: 'shared-sales' }],
    ] as const) {
      expect(await refusalOf(act(stranger, action, input)), action).toEqual({
        name: 'ForbiddenError',
        message: ADMIN_ONLY,
      });
    }
    // the gallery page's own server functions answer the same
    for (const call of [
      () => renameStoredTemplate({ id: 'shared-sales', name: 'Taken over' }),
      () => deleteStoredTemplate({ id: 'shared-sales' }),
      () => useTemplateForNew({ id: 'shared-sales' }),
    ]) {
      expect((await as(stranger, () => refusalOf(call()))).message).toBe(ADMIN_ONLY);
    }
    const list = (await act(stranger, 'template.list', {})) as ListAnswer;
    expect(list.default).toBe('blank');
    expect(list.templates.find((row) => row.id === 'shared-sales')?.name).toBe('Shared sales');
  }, 60_000);
});

describe('the logo index rebuild on a host that is not local', () => {
  it('refuses the visitor the rebuild through the dispatcher', async () => {
    const request = new Request(`${REMOTE}/api/actions/logo.refresh?deck=${stranger.deck}`, {
      method: 'POST',
      headers: { cookie: stranger.cookie },
    });
    const { dispatcher } = await deckDispatcher(stranger.deck, { request });
    const refusal = await refusalOf(
      dispatcher.dispatch(
        'logo.refresh',
        {},
        { author: authorOf(stranger), deckDir: join(root, 'decks', stranger.deck) },
      ),
    );
    expect(refusal).toEqual({ name: 'ForbiddenError', message: ADMIN_ONLY });
  }, 60_000);
});

describe('the shared templates on an open checkout', () => {
  it('lets a browser on localhost replace, rename, choose the default and delete', async () => {
    const list = (await act(holder, 'template.list', {})) as ListAnswer;
    expect(list.manage).toBe(true);
    expect((await as(holder, () => listTemplateGallery())).manage).toBe(true);
    const replaced = await act(holder, 'template.create', {
      deckId: holder.deck,
      name: 'Shared sales',
      baseRevision: await revisionOf(holder.deck),
    });
    expect(replaced).toMatchObject({ id: 'shared-sales', replaced: true });
    const renamed = await as(holder, () =>
      renameStoredTemplate({ id: 'shared-sales', name: 'Sales, renamed' }),
    );
    expect(renamed).toMatchObject({ id: 'shared-sales', name: 'Sales, renamed' });
    expect(await as(holder, () => useTemplateForNew({ id: 'shared-sales' }))).toMatchObject({
      default: 'shared-sales',
    });
    await as(holder, () => useTemplateForNew({ id: 'blank' }));
    expect(await as(holder, () => deleteStoredTemplate({ id: 'shared-sales' }))).toEqual({
      id: 'shared-sales',
      removed: true,
    });
  }, 60_000);

  it('lets the checkout holder, a cookieless call on localhost, rename through the dispatcher', async () => {
    await act(holder, 'template.create', {
      deckId: holder.deck,
      name: 'Holder template',
      baseRevision: await revisionOf(holder.deck),
    });
    const request = new Request(`${LOCAL}/api/actions/template.rename?deck=${holder.deck}`, {
      method: 'POST',
    });
    const { dispatcher } = await deckDispatcher(holder.deck, { request });
    const answer = await dispatcher.dispatch(
      'template.rename',
      { id: 'holder-template', name: 'Renamed by the holder' },
      { author: { kind: 'agent', name: 'checkout' }, deckDir: join(root, 'decks', holder.deck) },
    );
    expect(answer).toMatchObject({ id: 'holder-template', name: 'Renamed by the holder' });
  }, 60_000);
});
