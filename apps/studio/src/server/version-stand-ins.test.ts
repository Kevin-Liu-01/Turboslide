// Hardening HR-SD#1, verifier pass 3 (V3-1): an editor who may not share a deck read the owner's
// principal id in version.diff, in version.list on the agent surface and in the deck bundle,
// because the window's version list was the one answer with stand-ins. These run the real deck
// dispatcher, the real access store and the real identity runtime over a file store: the owner
// (an account) writes three versions, holds a lease, turns Editors Can Share off and invites two
// editors, an account with its own key (read, write, comment, export) and a browser. Every answer
// to either editor names the owner by the owner's stand-in on this deck and never by the id; the
// owner's own key reads the id. A viewer's key (HR-SD#1d) is refused the version log on every
// action that answers it, `deck.watch` as `version.list`, and a viewer's or a commenter's key is
// refused `diff.run` (`deck_diff` on /mcp), which answers the document at an older revision.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accountPrincipalId } from '@turboslide/identity/ids';
import type { AccessGrant, Scope } from '@turboslide/identity/access';
import type { Author } from '@turboslide/schema/mutations';
import { readZip } from '@turboslide/store/zip';

const DECK = 'stand-in-versions';
const AT = '2026-10-10T00:00:00.000Z';
const ORIGIN = 'http://localhost:4855';

// the store, the realtime tier and the secrets are read when the modules first run
const ENV: Record<string, string> = {
  TURBOSLIDE_STORE: 'file',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_DOWNLOAD_SECRET: 'a-download-secret-for-tests-only-0123456789',
  TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
};
const saved: Record<string, string | undefined> = {};
const root = mkdtempSync(join(tmpdir(), 'turboslide-version-stand-ins-'));
mkdirSync(join(root, 'decks'), { recursive: true });
for (const [name, value] of Object.entries({ ...ENV, TURBOSLIDE_ROOT: root })) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
for (const name of ['TURBOSLIDE_TOKEN', 'TURBOSLIDE_ROOM_SECRET', 'TURBOSLIDE_ROOM_HOST']) {
  saved[name] = process.env[name];
  delete process.env[name];
}

const { ensureUserByEmail } = await import('./auth/actions');
const { buildIdentityRuntime, setIdentityRuntime } = await import('./auth/identity');
const { ensurePrincipal } = await import('./auth/session');
const { bindAuthorize, boundDecide } = await import('./authorize');
const { createWithRecord, loadAccessRecord, readStoredAccess, writeAccess } =
  await import('./access');
const { deckDispatcher } = await import('./actions');
const { setSecurityLogSink } = await import('./log');
const { createStoredDeck, deckDir, openDeckStore } = await import('./root');
const { standInFor } = await import('./stand-ins');
const { DOWNLOAD_PURPOSE, signTicket } = await import('./bundle-core');
const { Route: ActionsRoute } = await import('../routes/api/actions.$action');
const { Route: BundleRoute } = await import('../routes/api/decks.$deckId.bundle');
const { Route: McpRoute } = await import('../routes/mcp');

setSecurityLogSink(() => undefined);

type Handler = (ctx: { params: Record<string, string>; request: Request }) => Promise<Response>;
const actionsPost = (ActionsRoute.options as unknown as { server: { handlers: { POST: Handler } } })
  .server.handlers.POST;
const bundleGet = (BundleRoute.options as unknown as { server: { handlers: { GET: Handler } } })
  .server.handlers.GET;
const mcpPost = (McpRoute.options as unknown as { server: { handlers: { POST: Handler } } }).server
  .handlers.POST;

let runtime: ReturnType<typeof buildIdentityRuntime>;
const people = { owner: '', editor: '', browser: '', viewer: '', commenter: '' };
const keys = { owner: '', editor: '', viewer: '', commenter: '' };
let browserCookie = '';
let slideId = '';

/** Every principal id a text carries. */
function principalIdsIn(text: string): string[] {
  return [...text.matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)].map((match) => match[0]);
}

function editorGrant(
  principalId: string,
  by: string,
  role: AccessGrant['role'] = 'editor',
): AccessGrant {
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

/** One call of /api/actions with a key, as an agent makes it. */
async function action(
  name: string,
  secret: string,
  input: object = {},
): Promise<{ status: number; text: string }> {
  const request = new Request(`${ORIGIN}/api/actions/${name}?deck=${DECK}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const response = await actionsPost({ params: { action: name }, request });
  return { status: response.status, text: await response.text() };
}

let rpcId = 1;

/** One JSON-RPC message to /mcp with a key; the answer's body, from JSON or the last SSE data line. */
async function mcpCall(
  secret: string,
  message: object,
  sessionId?: string,
): Promise<{ status: number; session: string | null; body: Record<string, unknown> }> {
  const headers = new Headers({
    authorization: `Bearer ${secret}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  });
  if (sessionId !== undefined) {
    headers.set('mcp-session-id', sessionId);
    headers.set('mcp-protocol-version', '2025-03-26');
  }
  const request = new Request(`${ORIGIN}/mcp?deck=${DECK}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
  const response = await mcpPost({ params: {}, request });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const data = text.split('\n').filter((line) => line.startsWith('data:'));
    if (data.length > 0) body = JSON.parse(data[data.length - 1]!.slice(5)) as typeof body;
  }
  return { status: response.status, session: response.headers.get('mcp-session-id'), body };
}

/** One MCP tool call with a key on a fresh session: the tool error's status, or 200, and the text. */
async function tool(
  secret: string,
  name: string,
  args: object = {},
): Promise<{ status: number; text: string }> {
  const init = await mcpCall(secret, {
    jsonrpc: '2.0',
    id: rpcId++,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'version-stand-ins', version: '0' },
    },
  });
  if (init.session === null) throw new Error(`initialize answered ${init.status}`);
  await mcpCall(secret, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
  const answer = await mcpCall(
    secret,
    { jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } },
    init.session,
  );
  const result = answer.body.result as
    { isError?: boolean; content?: { text?: string }[] } | undefined;
  const text = result?.content?.[0]?.text ?? JSON.stringify(answer.body);
  if (answer.status !== 200) return { status: answer.status, text };
  if (result?.isError !== true) return { status: 200, text };
  const status = (JSON.parse(text) as { error?: { status?: number } }).error?.status ?? 0;
  return { status, text };
}

/** One call of the editor's window: runDeckAction's dispatcher for the browser's request. */
async function windowAction(name: string, input: object = {}): Promise<string> {
  const request = new Request(`${ORIGIN}/edit/${DECK}`, { headers: { cookie: browserCookie } });
  const { dispatcher } = await deckDispatcher(DECK, { request });
  const author: Author = { kind: 'human', name: 'Bea', principalId: people.browser };
  return JSON.stringify(await dispatcher.dispatch(name, input, { author, deckDir: deckDir(DECK) }));
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
  for (const who of ['owner', 'editor', 'viewer', 'commenter'] as const) {
    const { id } = await ensureUserByEmail(runtime, `${who}@example.test`);
    people[who] = accountPrincipalId(id);
    const scopes: Scope[] =
      who === 'owner'
        ? ['read', 'write', 'share']
        : who === 'editor'
          ? ['read', 'write', 'comment', 'export']
          : who === 'commenter'
            ? ['read', 'comment']
            : ['read'];
    keys[who] = (await runtime.keys.create({ userId: id, name: who, scopes })).secret;
  }
  const minted = await ensurePrincipal(new Request(`${ORIGIN}/edit/${DECK}`), runtime.secret);
  if (minted === null || minted.setCookie === undefined) throw new Error('no browser cookie');
  people.browser = minted.principal.id;
  browserCookie = minted.setCookie.split(';')[0] ?? '';
  // the owner makes the deck in the browser and writes three versions
  const ownerCtx = {
    principal: { id: people.owner, kind: 'account' as const, admin: false },
    linkGrants: [],
  };
  await createWithRecord(DECK, ownerCtx, () =>
    createStoredDeck({ name: 'Stand-in versions', from: 'blank', id: DECK }),
  );
  const store = await openDeckStore(DECK);
  const author: Author = { kind: 'human', name: 'Olive', principalId: people.owner };
  slideId = (await store.read()).document.deck.sections[0]?.slideIds[0] ?? '';
  for (const note of ['One', 'Two', 'Three']) {
    const baseRevision = (await store.read()).document.deck.revision;
    const outcome = await store.write({
      baseRevision,
      author,
      mutations: [{ op: 'slide.set', slideId, path: '/notes', value: note }],
    });
    expect(outcome.ok).toBe(true);
  }
  // the owner's lease on the slide: another author's lease request meets the holder
  await store.lease(slideId, author, { minutes: 30 });
  // Editors Can Share off; the account and the browser invited as editors
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
        editorGrant(people.editor, people.owner),
        editorGrant(people.browser, people.owner),
        editorGrant(people.viewer, people.owner, 'viewer'),
        editorGrant(people.commenter, people.owner, 'commenter'),
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
});

describe('the dispatcher to an editor who may not share (HR-SD#1; verifier pass 3, V3-1)', () => {
  it("names the owner by the owner's stand-in in version.list and version.diff on /api/actions", async () => {
    const ref = standInFor(DECK, people.owner);
    const listed = await action('version.list', keys.editor);
    expect(listed.status).toBe(200);
    expect(principalIdsIn(listed.text)).toEqual([]);
    expect(listed.text).toContain(ref);
    for (const input of [{ from: 1 }, { staged: true }, {}]) {
      const diff = await action('version.diff', keys.editor, input);
      expect(diff.status, JSON.stringify(input)).toBe(200);
      expect(principalIdsIn(diff.text), JSON.stringify(input)).toEqual([]);
    }
    expect((await action('version.diff', keys.editor, { from: 0 })).text).toContain(
      `"author":{"kind":"human","name":"Olive","principalId":"${ref}"}`,
    );
  });

  it('names the owner by the stand-in in deck.watch and in the 409 of a held lease', async () => {
    const ref = standInFor(DECK, people.owner);
    const watched = await action('deck.watch', keys.editor, { since: 0, timeoutMs: 0 });
    expect(watched.status).toBe(200);
    expect(principalIdsIn(watched.text)).toEqual([]);
    expect(watched.text).toContain(ref);
    const leased = await action('slide.lease', keys.editor, { slideId });
    expect(leased.status).toBe(409);
    expect(principalIdsIn(leased.text)).toEqual([]);
    expect(leased.text).toContain(ref);
  });

  it("names the owner by the stand-in in the window's version.diff and activity.list", async () => {
    const ref = standInFor(DECK, people.owner);
    for (const input of [{ from: 1 }, { staged: true }, {}]) {
      const diff = await windowAction('version.diff', input);
      expect(principalIdsIn(diff), JSON.stringify(input)).toEqual([]);
    }
    expect(await windowAction('version.diff', { from: 0 })).toContain(`"principalId":"${ref}"`);
    // the browser's own id is its own, and stays
    const activity = await windowAction('activity.list');
    expect(principalIdsIn(activity).filter((id) => id !== people.browser)).toEqual([]);
    expect(activity).toContain(`"actor":"${ref}"`);
  });

  it("keeps the ids for the owner's own key, who may share", async () => {
    const listed = await action('version.list', keys.owner);
    expect(listed.status).toBe(200);
    expect(principalIdsIn(listed.text)).toContain(people.owner);
    const diff = await action('version.diff', keys.owner, { from: 0 });
    expect(diff.status).toBe(200);
    expect(principalIdsIn(diff.text)).toContain(people.owner);
  });
});

describe('deck.watch to a caller without history (HR-SD#1d)', () => {
  it("refuses a viewer's key the version log, as version.list does", async () => {
    const listed = await action('version.list', keys.viewer);
    expect(listed.status).toBe(403);
    const watched = await action('deck.watch', keys.viewer, { since: 0, timeoutMs: 0 });
    expect(watched.status, watched.text).toBe(403);
    expect(watched.text).not.toContain('slide.set');
    expect(principalIdsIn(watched.text)).toEqual([]);
    // the deck itself stays the viewer's to read
    expect((await action('deck.info', keys.viewer)).status).toBe(200);
  });

  it('answers an editor who may not share, with the owner as the stand-in', async () => {
    const watched = await action('deck.watch', keys.editor, { since: 0, timeoutMs: 0 });
    expect(watched.status).toBe(200);
    expect(watched.text).toContain('slide.set');
    expect(principalIdsIn(watched.text)).toEqual([]);
  });
});

describe('diff.run to a caller without history (HR-SD#1d; the verifier of HR-SD#1d)', () => {
  // diff.run answers the mutations between two revisions with their old values in prose: the
  // document at an older revision, what version.list and deck.watch refuse these readers
  const RANGES = [{ from: 1 }, { from: 1, to: 2 }, { staged: true }, {}];

  it("refuses a viewer's and a commenter's key on /api/actions, as version.list", async () => {
    for (const who of ['viewer', 'commenter'] as const) {
      expect((await action('version.list', keys[who])).status, who).toBe(403);
      for (const input of RANGES) {
        const diff = await action('diff.run', keys[who], input);
        const label = `${who} ${JSON.stringify(input)}`;
        expect(diff.status, label).toBe(403);
        expect(diff.text, label).toContain('history');
        expect(diff.text, label).not.toContain('notes');
        expect(principalIdsIn(diff.text), label).toEqual([]);
      }
      // the deck itself stays theirs to read
      expect((await action('deck.info', keys[who])).status, who).toBe(200);
    }
  });

  it("refuses a viewer's and a commenter's key deck_diff on /mcp, as deck_version_list", async () => {
    for (const who of ['viewer', 'commenter'] as const) {
      expect((await tool(keys[who], 'deck_version_list')).status, who).toBe(403);
      const diff = await tool(keys[who], 'deck_diff', { from: 1 });
      expect(diff.status, who).toBe(403);
      expect(diff.text, who).not.toContain('notes');
    }
  });

  it('answers an editor, who reads history, on both transports', async () => {
    const diff = await action('diff.run', keys.editor, { from: 1 });
    expect(diff.status).toBe(200);
    expect(diff.text).toContain('notes');
    const viaMcp = await tool(keys.editor, 'deck_diff', { from: 1 });
    expect(viaMcp.status).toBe(200);
    expect(viaMcp.text).toContain('notes');
  });
});

describe('the bundle an editor who may not share downloads (HR-SD#1; verifier pass 3, V3-1)', () => {
  /** File, Download, Turboslide file (.zip): the route with the window's ticket for a person. */
  async function bundleFor(principalId: string): Promise<{ status: number; entries: string[] }> {
    const ticket = signTicket(DOWNLOAD_PURPOSE, DECK, principalId);
    const request = new Request(`${ORIGIN}/api/decks/${DECK}/bundle?t=${ticket}`);
    const response = await bundleGet({ params: { deckId: DECK }, request });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.status !== 200) return { status: response.status, entries: [] };
    return {
      status: 200,
      entries: readZip(bytes).map(
        (entry) => `${entry.name}\n${new TextDecoder().decode(entry.data)}`,
      ),
    };
  }

  /** The author of each versions/<n>.json entry. */
  function authorsOf(entries: string[]): string[] {
    return entries
      .filter((entry) => entry.includes('/versions/'))
      .map((entry) => {
        const text = entry.slice(entry.indexOf('\n') + 1);
        return (JSON.parse(text) as { author: Author }).author.principalId ?? '';
      });
  }

  it("names no principal id: the version authors are the owner's stand-in", async () => {
    const ref = standInFor(DECK, people.owner);
    for (const reader of [people.editor, people.browser]) {
      const bundle = await bundleFor(reader);
      expect(bundle.status).toBe(200);
      for (const entry of bundle.entries)
        expect(
          principalIdsIn(entry).filter((id) => id !== reader),
          entry.split('\n')[0],
        ).toEqual([]);
      expect(authorsOf(bundle.entries)).toEqual([ref, ref, ref]);
    }
  });

  it('keeps the ids for the owner', async () => {
    const bundle = await bundleFor(people.owner);
    expect(bundle.status).toBe(200);
    expect(authorsOf(bundle.entries)).toEqual([people.owner, people.owner, people.owner]);
  });
});
