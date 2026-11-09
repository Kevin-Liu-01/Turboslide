// The editor's action server function and the deployment's own actions. `runDeckAction` decides
// `read` on the page's deck for an action with no deck of its own, so an action that belongs to
// the deployment admin must refuse everyone else in its handler, and an action the table gives no
// window transport must not run from a page at all. These run the real server function, the real
// deck dispatcher, the real access store and the real identity runtime over a file store on the
// memory tier, with the flags bound to a table in this file. TanStack Start's compiler is not in
// the test, so `createServerFn` is a plain builder here (the validator, then the handler) and
// `getRequest` answers the request of the call (the harness of window-stand-ins.test.ts).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Author } from '@turboslide/schema/mutations';

/** The request the server functions read as `getRequest()`; each call sets it. */
let current: Request | undefined;

type Validator = (input: unknown) => unknown;
type Handler = (options: { data: unknown; context: object }) => unknown;

/** createServerFn without the compiler: `.validator(v).handler(h)` is `(opts) => h({ data: v(opts.data) })`. */
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

const DECK = 'admin-window';
const ORIGIN = 'http://localhost:4882';

// the store, the realtime tier and the secrets are read when the modules first run
const ENV: Record<string, string> = {
  TURBOSLIDE_STORE: 'file',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_DOWNLOAD_SECRET: 'a-download-secret-for-tests-only-0123456789',
  TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
};
const saved: Record<string, string | undefined> = {};
const root = mkdtempSync(join(tmpdir(), 'turboslide-admin-window-'));
mkdirSync(join(root, 'decks'), { recursive: true });
for (const [name, value] of Object.entries({ ...ENV, TURBOSLIDE_ROOT: root })) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
for (const name of ['TURBOSLIDE_TOKEN', 'TURBOSLIDE_ROOM_SECRET', 'TURBOSLIDE_ROOM_HOST']) {
  saved[name] = process.env[name];
  delete process.env[name];
}

const { runDeckAction } = await import('./agent-actions');
const { ADMIN_ONLY } = await import('./auth/actions');
const { buildIdentityRuntime, setIdentityRuntime } = await import('./auth/identity');
const { ensurePrincipal } = await import('./auth/session');
const { bindAuthorize, boundDecide } = await import('./authorize');
const { createWithRecord, loadAccessRecord } = await import('./access');
const { deckDispatcher } = await import('./actions');
const { bindFlags } = await import('./flags');
const { setSecurityLogSink } = await import('./log');
const { createStoredDeck } = await import('./root');

setSecurityLogSink(() => undefined);

/** A visitor's browser: an anonymous principal with its sealed cookie. */
const visitor = { id: '', cookie: '' };
const author = (): Author => ({ kind: 'human', name: 'Visitor', principalId: visitor.id });

/** The switches this file's table holds, and every write the table took. */
const flags = new Map<string, boolean>();
const writes: [string, boolean][] = [];
let previous: ReturnType<typeof bindFlags>;

/** Runs one server function call as the visitor's browser. */
async function asVisitor<T>(call: () => Promise<T>): Promise<T> {
  current = new Request(`${ORIGIN}/edit/${DECK}`, { headers: { cookie: visitor.cookie } });
  try {
    return await call();
  } finally {
    current = undefined;
  }
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

let runtime: ReturnType<typeof buildIdentityRuntime>;

beforeAll(async () => {
  bindAuthorize({ decide: boundDecide, loadRecord: loadAccessRecord, now: () => Date.now() });
  previous = bindFlags({
    read: (name) => Promise.resolve(flags.get(name)),
    write: (name, value) => {
      writes.push([name, value]);
      flags.set(name, value);
      return Promise.resolve();
    },
  });
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
  const minted = await ensurePrincipal(new Request(`${ORIGIN}/edit/${DECK}`), runtime.secret);
  if (minted === null || minted.setCookie === undefined) throw new Error('no browser cookie');
  visitor.id = minted.principal.id;
  visitor.cookie = minted.setCookie.split(';')[0] ?? '';
  // the visitor owns the deck the page is on, so every deck decision of the call passes
  await createWithRecord(
    DECK,
    { principal: { id: visitor.id, kind: 'anonymous', admin: false }, linkGrants: [] },
    () => createStoredDeck({ name: 'Admin window', from: 'blank', id: DECK }),
  );
}, 120_000);

beforeEach(() => {
  flags.clear();
  writes.length = 0;
});

afterAll(async () => {
  bindFlags(previous);
  await setIdentityRuntime(undefined);
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(root, { recursive: true, force: true });
}, 120_000);

describe("the deployment's actions on the editor's runDeckAction", () => {
  it('refuses a visitor the kill switches, read and write, on a deck the visitor owns', async () => {
    for (const input of [
      { name: 'exports', on: false },
      { name: 'readOnly', on: true },
    ]) {
      const refusal = await asVisitor(() =>
        refusalOf(runDeckAction({ deckId: DECK, action: 'admin.flag', input, author: author() })),
      );
      expect(refusal, JSON.stringify(input)).toEqual({
        name: 'ForbiddenError',
        message: ADMIN_ONLY,
      });
    }
    const read = await asVisitor(() =>
      refusalOf(
        runDeckAction({
          deckId: DECK,
          action: 'admin.flag',
          input: { name: 'exports' },
          author: author(),
        }),
      ),
    );
    expect(read.message).toBe(ADMIN_ONLY);
    expect(writes).toEqual([]);
  }, 60_000);

  it('runs the switch for the checkout holder, a cookieless call on localhost', async () => {
    const request = new Request(`${ORIGIN}/api/actions/admin.flag?deck=${DECK}`, {
      method: 'POST',
    });
    const { dispatcher } = await deckDispatcher(DECK, { request });
    const answer = await dispatcher.dispatch(
      'admin.flag',
      { name: 'exports', on: false },
      {
        author: { kind: 'agent', name: 'checkout' },
        deckDir: join(root, 'decks', DECK),
      },
    );
    expect(answer).toMatchObject({ name: 'exports', on: false });
    expect(writes).toEqual([['exports', false]]);
  }, 60_000);

  it('refuses a page an action the table gives no window transport', async () => {
    const refusal = await asVisitor(() =>
      refusalOf(
        runDeckAction({
          deckId: DECK,
          action: 'logo.refresh',
          input: { dryRun: true },
          author: author(),
        }),
      ),
    );
    expect(refusal).toEqual({
      name: 'TypeError',
      message: 'logo.refresh has no window transport',
    });
  }, 60_000);
});
