// Hardening HR-SD#1d (the verifier of HR-SD#1c): the window's own server functions answered a
// reader who may not share a deck with other people's principal ids, because they do not run
// through the dispatcher's stand-in step. These run the real server functions of write.ts and
// decks.ts, the real access store and the real identity runtime over a file store on the memory
// tier. TanStack Start's compiler is not in the test, so `createServerFn` is a plain builder here
// (the validator, then the handler) and `getRequest` answers the request of the call. Three
// browsers: the owner, an invited editor while Editors Can Share is off, and an invited viewer.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AccessGrant } from '@turboslide/identity/access';
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

const DECK = 'window-stand-ins';
const AT = '2026-10-10T00:00:00.000Z';
const ORIGIN = 'http://localhost:4881';

// the store, the realtime tier and the secrets are read when the modules first run
const ENV: Record<string, string> = {
  TURBOSLIDE_STORE: 'file',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_DOWNLOAD_SECRET: 'a-download-secret-for-tests-only-0123456789',
  TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
};
const saved: Record<string, string | undefined> = {};
const root = mkdtempSync(join(tmpdir(), 'turboslide-window-stand-ins-'));
mkdirSync(join(root, 'decks'), { recursive: true });
for (const [name, value] of Object.entries({ ...ENV, TURBOSLIDE_ROOT: root })) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
for (const name of ['TURBOSLIDE_TOKEN', 'TURBOSLIDE_ROOM_SECRET', 'TURBOSLIDE_ROOM_HOST']) {
  saved[name] = process.env[name];
  delete process.env[name];
}

const { buildIdentityRuntime, setIdentityRuntime } = await import('./auth/identity');
const { ensurePrincipal } = await import('./auth/session');
const { bindAuthorize, boundDecide } = await import('./authorize');
const { COPY_COMMENTS_REFUSAL, createWithRecord, loadAccessRecord, readStoredAccess, writeAccess } =
  await import('./access');
const { deckDispatcher } = await import('./actions');
const decks = await import('./decks');
const { flushRoom } = await import('./room');
const { setSecurityLogSink } = await import('./log');
const { createStoredDeck, openDeckStore } = await import('./root');
const { standInFor } = await import('./stand-ins');
const write = await import('./write');

setSecurityLogSink(() => undefined);

type Browser = { id: string; cookie: string; name: string };
const people: Record<'owner' | 'editor' | 'viewer', Browser> = {
  owner: { id: '', cookie: '', name: 'Olive' },
  editor: { id: '', cookie: '', name: 'Eda' },
  viewer: { id: '', cookie: '', name: 'Vic' },
};
let slideId = '';

/** Every principal id a text carries but the reader's own. */
function othersIn(text: string, reader: Browser): string[] {
  return [...text.matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)]
    .map((match) => match[0])
    .filter((id) => id !== reader.id);
}

/** Runs one server function call as a browser. */
async function as<T>(who: Browser, call: () => Promise<T>): Promise<T> {
  current = new Request(`${ORIGIN}/edit/${DECK}`, { headers: { cookie: who.cookie } });
  try {
    return await call();
  } finally {
    current = undefined;
  }
}

function grant(principalId: string, role: AccessGrant['role'], by: string): AccessGrant {
  return {
    principalId,
    email: null,
    role,
    invitedBy: by,
    invitedAt: AT,
    acceptedAt: AT,
    expiresAt: null,
  };
}

function authorOf(who: Browser): Author {
  return { kind: 'human', name: who.name, principalId: who.id };
}

/** One action through the deck's dispatcher for a browser's request, as the editor's window runs it. */
async function dispatchAs(who: Browser, action: string, input: object): Promise<unknown> {
  const request = new Request(`${ORIGIN}/edit/${DECK}`, { headers: { cookie: who.cookie } });
  const { dispatcher } = await deckDispatcher(DECK, { request });
  return dispatcher.dispatch(action, input, {
    author: authorOf(who),
    deckDir: join(root, 'decks', DECK),
  });
}

let runtime: ReturnType<typeof buildIdentityRuntime>;

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
  for (const who of Object.values(people)) {
    const minted = await ensurePrincipal(new Request(`${ORIGIN}/edit/${DECK}`), runtime.secret);
    if (minted === null || minted.setCookie === undefined) throw new Error('no browser cookie');
    who.id = minted.principal.id;
    who.cookie = minted.setCookie.split(';')[0] ?? '';
  }
  // the owner makes the deck and writes three versions; the first heading is replaced later
  const ownerCtx = {
    principal: { id: people.owner.id, kind: 'anonymous' as const, admin: false },
    linkGrants: [],
  };
  await createWithRecord(DECK, ownerCtx, () =>
    createStoredDeck({ name: 'Window stand-ins', from: 'blank', id: DECK }),
  );
  const store = await openDeckStore(DECK);
  slideId = (await store.read()).document.deck.sections[0]?.slideIds[0] ?? '';
  for (const title of ['Figure 4471 draft', 'Two', 'Three']) {
    const baseRevision = (await store.read()).document.deck.revision;
    const outcome = await store.write({
      baseRevision,
      author: authorOf(people.owner),
      mutations: [{ op: 'deck.set', path: '/title', value: title }],
    });
    expect(outcome.ok).toBe(true);
  }
  // Editors Can Share off; the editor and the viewer invited by the owner
  const stored = await readStoredAccess(DECK);
  if (stored === null) throw new Error('the deck has no record');
  const record = stored.record;
  await writeAccess(
    DECK,
    {
      ...record,
      settings: { ...record.settings, editorsCanShare: false },
      grants: [
        ...record.grants,
        grant(people.editor.id, 'editor', people.owner.id),
        grant(people.viewer.id, 'viewer', people.owner.id),
      ],
      revision: record.revision + 1,
    },
    stored.etag,
  );
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

describe("the window's long poll of the version log (HR-SD#1d, watchDeckFn)", () => {
  it('is gone: no server function answers the log and the owner to a reader', async () => {
    const watch = (write as Record<string, unknown>).watchDeck as
      | ((input: { deckId: string; since: number; timeoutMs: number }) => Promise<unknown>)
      | undefined;
    if (watch !== undefined) {
      // what the function answered a viewer before it was removed: the owner's id and the
      // replaced heading, which version.list refuses the viewer
      const answer = JSON.stringify(
        await as(people.viewer, () => watch({ deckId: DECK, since: 0, timeoutMs: 0 })),
      );
      expect(othersIn(answer, people.viewer)).toEqual([]);
      expect(answer).not.toContain('Figure 4471');
    }
    expect(watch).toBeUndefined();
    // the window's version list stays the one answer of the log: refused to the viewer, read
    // with the owner as a stand-in by the editor who may not share
    await expect(as(people.viewer, () => write.listVersions({ deckId: DECK }))).rejects.toThrow(
      `No deck ${DECK}`,
    );
    const listed = JSON.stringify(
      await as(people.editor, () => write.listVersions({ deckId: DECK })),
    );
    expect(othersIn(listed, people.editor)).toEqual([]);
    expect(listed).toContain(standInFor(DECK, people.owner.id));
  });
});

describe("the window's write conflict (HR-SD#1d, writeDeckFn)", () => {
  /** A stale write of the title from a browser: base revision 1, under three newer records. */
  async function staleWrite(who: Browser): Promise<string> {
    return JSON.stringify(
      await as(who, () =>
        write.writeDeck({
          deckId: DECK,
          write: {
            baseRevision: 1,
            author: authorOf(who),
            mutations: [{ op: 'deck.set', path: '/title', value: `${who.name}'s title` }],
          },
        }),
      ),
    );
  }

  it('names the other authors by stand-ins to an editor who may not share, and writes nothing', async () => {
    const store = await openDeckStore(DECK);
    const before = (await store.read()).document.deck.revision;
    const answer = await staleWrite(people.editor);
    expect(answer).toContain('"code":"conflict"');
    expect(othersIn(answer, people.editor)).toEqual([]);
    expect(answer).toContain(`"principalId":"${standInFor(DECK, people.owner.id)}"`);
    expect((await store.read()).document.deck.revision).toBe(before);
  });

  it('keeps the ids for the owner, who may share', async () => {
    const answer = await staleWrite(people.owner);
    expect(answer).toContain('"code":"conflict"');
    expect(answer).toContain(`"principalId":"${people.owner.id}"`);
  });
});

describe('Make a copy with Copy comments (HR-SD#1d)', () => {
  /** Every comment file of a deck folder, as text. */
  function commentFiles(deckId: string): string {
    const dir = join(root, 'decks', deckId, 'comments');
    if (!existsSync(dir)) return '';
    return readdirSync(dir)
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n');
  }

  /** One deck.copy through the deck's dispatcher, as the editor's Make a copy dialog sends it. */
  async function dispatchCopy(who: Browser, input: object): Promise<unknown> {
    const baseRevision = (await (await openDeckStore(DECK)).read()).document.deck.revision;
    return dispatchAs(who, 'deck.copy', { id: DECK, baseRevision, ...input });
  }

  beforeAll(async () => {
    // the owner's thread on the first slide, in the deck's sidecar once the room flushes
    await dispatchAs(people.owner, 'comment.add', {
      anchor: { kind: 'slide', slideId },
      body: { text: 'For the owner only', mentions: [] },
    });
    await flushRoom(DECK);
    expect(commentFiles(DECK)).toContain(people.owner.id);
  }, 120_000);

  it('refuses Copy comments to an editor who may not share, on /decks and in the editor', async () => {
    const made = await as(people.editor, () =>
      decks.copyStoredDeck({ deckId: DECK, name: 'Copy with comments', copyComments: true }),
    ).catch((error: unknown) => error);
    if (!(made instanceof Error)) {
      // what the copy carried before: the owner's principal id in the copied threads
      expect(othersIn(commentFiles((made as { deckId: string }).deckId), people.editor)).toEqual(
        [],
      );
    }
    expect(made).toBeInstanceOf(Error);
    expect((made as Error).message).toBe(COPY_COMMENTS_REFUSAL);
    await expect(
      dispatchCopy(people.editor, { name: 'Copy with comments', copyComments: true }),
    ).rejects.toThrow(COPY_COMMENTS_REFUSAL);
  });

  it('copies for that editor without the comments, and for the owner with them', async () => {
    const plain = await as(people.editor, () =>
      decks.copyStoredDeck({ deckId: DECK, name: 'Copy without comments' }),
    );
    expect(commentFiles(plain.deckId)).toBe('');
    const owned = (await dispatchCopy(people.owner, {
      name: 'The owner copy',
      copyComments: true,
    })) as { deckId: string };
    expect(commentFiles(owned.deckId)).toContain('For the owner only');
  });
});

describe('the record a publish answers (HR-SD#1d sweep, deck.publish and deck.unpublish)', () => {
  const recordRevision = async (): Promise<number> =>
    (await readStoredAccess(DECK))?.record.revision ?? 0;

  it('answers an editor who may not share the record share.get gives it, the 409 included', async () => {
    const base = await recordRevision();
    const published = JSON.stringify(
      await dispatchAs(people.editor, 'deck.publish', { id: DECK, baseRevision: base }),
    );
    expect(othersIn(published, people.editor)).toEqual([]);
    expect(published).toContain(`"owner":"${standInFor(DECK, people.owner.id)}"`);
    expect(published).toContain('"links":[]');
    // a stale base: the 409 carries the current record, shaped the same way
    const stale = (await dispatchAs(people.editor, 'deck.unpublish', {
      id: DECK,
      baseRevision: base,
    }).catch((error: unknown) => error)) as Error & { current?: unknown };
    expect(stale.name).toBe('ConflictError');
    expect(othersIn(JSON.stringify(stale.current), people.editor)).toEqual([]);
    const unpublished = JSON.stringify(
      await dispatchAs(people.editor, 'deck.unpublish', {
        id: DECK,
        baseRevision: await recordRevision(),
      }),
    );
    expect(othersIn(unpublished, people.editor)).toEqual([]);
  });

  it('answers the owner the whole record', async () => {
    const published = JSON.stringify(
      await dispatchAs(people.owner, 'deck.publish', {
        id: DECK,
        baseRevision: await recordRevision(),
      }),
    );
    expect(published).toContain(people.viewer.id);
    expect(published).toContain(people.editor.id);
    await dispatchAs(people.owner, 'deck.unpublish', {
      id: DECK,
      baseRevision: await recordRevision(),
    });
  });
});
