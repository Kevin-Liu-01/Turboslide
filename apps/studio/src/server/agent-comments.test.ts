// Hardening HR-SD#1d, the verifier of HR-SD#1d (sev 1): with TURBOSLIDE_TOKEN set, as on
// production, the comment actions of the agent surface refused every API key, the owner's
// included, and a key's notification.list read a fresh stranger's empty inbox. The deck's
// dispatcher took the comment and notification callers from the room's request identity, which
// reads the deployment bearer alone: a user key fell through to a stranger (401, mapped to 403
// "not allowed"), and with no token on localhost to the checkout holder, who reads every id. These
// run the real dispatcher behind /api/actions and /mcp, the real access store and the real identity
// runtime over a file store and the memory tier. A key acts for its owner cut to its scopes, as
// the gate decides it: it comments where its owner may comment, and never more.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accountPrincipalId, agentPrincipalId } from '@turboslide/identity/ids';
import type { AccessGrant, Scope } from '@turboslide/identity/access';

const DECK = 'agent-comments';
const AT = '2026-10-11T00:00:00.000Z';
const ORIGIN = 'http://localhost:4883';
const TOKEN = 'a-deployment-bearer-for-tests-only-0123456789';

// the store, the realtime tier and the secrets are read when the modules first run
const ENV: Record<string, string> = {
  TURBOSLIDE_STORE: 'file',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_DOWNLOAD_SECRET: 'a-download-secret-for-tests-only-0123456789',
  TURBOSLIDE_SESSION_SECRET: 'an-obviously-fake-session-secret-for-tests-0123456789',
  TURBOSLIDE_TOKEN: TOKEN,
};
const saved: Record<string, string | undefined> = {};
const root = mkdtempSync(join(tmpdir(), 'turboslide-agent-comments-'));
mkdirSync(join(root, 'decks'), { recursive: true });
for (const [name, value] of Object.entries({ ...ENV, TURBOSLIDE_ROOT: root })) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
for (const name of [
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_HOST',
  'TURBOSLIDE_LOCAL_OPEN',
  'TURBOSLIDE_AUTH_RATE_LIMIT',
]) {
  saved[name] = process.env[name];
  delete process.env[name];
}

const { ensureUserByEmail } = await import('./auth/actions');
const { buildIdentityRuntime, setIdentityRuntime } = await import('./auth/identity');
const { bindAuthorize, boundDecide } = await import('./authorize');
const { createWithRecord, loadAccessRecord, readStoredAccess, writeAccess } =
  await import('./access');
const { setSecurityLogSink } = await import('./log');
const { createStoredDeck, openDeckStore } = await import('./root');
const { standInFor } = await import('./stand-ins');
const { Route: ActionsRoute } = await import('../routes/api/actions.$action');
const { Route: McpRoute } = await import('../routes/mcp');

setSecurityLogSink(() => undefined);

type Handler = (ctx: { params: Record<string, string>; request: Request }) => Promise<Response>;
const actionsPost = (ActionsRoute.options as unknown as { server: { handlers: { POST: Handler } } })
  .server.handlers.POST;
const mcpPost = (McpRoute.options as unknown as { server: { handlers: { POST: Handler } } }).server
  .handlers.POST;

type Who = 'owner' | 'editor' | 'commenter' | 'viewer';
const people: Record<Who, string> = { owner: '', editor: '', commenter: '', viewer: '' };
/** Each key's secret and its agent principal id (`agent:<tokenId>`, the author it writes as). */
type Key = { secret: string; agent: string };
const keys: Record<string, Key> = {};
let slideId = '';

/** Every principal id a text carries. */
function principalIdsIn(text: string): string[] {
  return [...text.matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)].map((match) => match[0]);
}

function grant(principalId: string, role: AccessGrant['role']): AccessGrant {
  return {
    principalId,
    email: null,
    role,
    invitedBy: people.owner,
    invitedAt: AT,
    acceptedAt: AT,
    expiresAt: null,
  };
}

/** One call of /api/actions with a key, as an agent makes it. */
async function action(
  name: string,
  key: Key,
  input: object = {},
): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const request = new Request(`${ORIGIN}/api/actions/${name}?deck=${DECK}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const response = await actionsPost({ params: { action: name }, request });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: response.status, text, json };
}

let rpcId = 1;

/** One JSON-RPC message to /mcp with a key; the body from JSON or the last SSE data line. */
async function mcpCall(
  key: Key,
  message: object,
  sessionId?: string,
): Promise<{ status: number; session: string | null; body: Record<string, unknown> }> {
  const headers = new Headers({
    authorization: `Bearer ${key.secret}`,
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
  key: Key,
  name: string,
  args: object = {},
): Promise<{ status: number; text: string }> {
  const init = await mcpCall(key, {
    jsonrpc: '2.0',
    id: rpcId++,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'agent-comments', version: '0' },
    },
  });
  if (init.session === null) throw new Error(`initialize answered ${init.status}`);
  await mcpCall(key, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
  const answer = await mcpCall(
    key,
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

function body(text: string) {
  return { text, mentions: [] };
}

/** The thread an answer carries. */
function threadOf(answer: { json: Record<string, unknown> }): {
  id: string;
  comment: { id: string; author: { principalId: string } };
  replies: { id: string; author: { principalId: string } }[];
} {
  return answer.json.thread as ReturnType<typeof threadOf>;
}

beforeAll(async () => {
  bindAuthorize({ decide: boundDecide, loadRecord: loadAccessRecord, now: () => Date.now() });
  const runtime = buildIdentityRuntime({
    env: { TURBOSLIDE_AUTH_DB: 'state/auth.sqlite', TURBOSLIDE_MAIL: 'capture', ...ENV },
    root,
    stateDir: join(root, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  await runtime.ready;
  await setIdentityRuntime(runtime);
  const made: Record<string, [Who, Scope[]]> = {
    owner: ['owner', ['read', 'write', 'comment', 'export', 'share']],
    ownerRead: ['owner', ['read']],
    ownerComment: ['owner', ['read', 'comment']],
    ownerAdmin: ['owner', ['read', 'comment', 'admin']],
    editor: ['editor', ['read', 'write', 'comment']],
    commenter: ['commenter', ['read', 'comment']],
    viewer: ['viewer', ['read', 'comment']],
  };
  const users: Partial<Record<Who, string>> = {};
  for (const who of ['owner', 'editor', 'commenter', 'viewer'] as const) {
    const { id } = await ensureUserByEmail(runtime, `${who}@example.test`);
    users[who] = id;
    people[who] = accountPrincipalId(id);
  }
  for (const [name, [who, scopes]] of Object.entries(made)) {
    const created = await runtime.keys.create({ userId: users[who]!, name, scopes });
    keys[name] = { secret: created.secret, agent: agentPrincipalId(created.record.id) };
  }
  const ownerCtx = {
    principal: { id: people.owner, kind: 'account' as const, admin: false },
    linkGrants: [],
  };
  await createWithRecord(DECK, ownerCtx, () =>
    createStoredDeck({ name: 'Agent comments', from: 'blank', id: DECK }),
  );
  const store = await openDeckStore(DECK);
  slideId = (await store.read()).document.deck.sections[0]?.slideIds[0] ?? '';
  // Editors Can Share off; an editor, a commenter and a viewer invited
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
        grant(people.editor, 'editor'),
        grant(people.commenter, 'commenter'),
        grant(people.viewer, 'viewer'),
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

describe("a key's comment actions with TURBOSLIDE_TOKEN set (HR-SD#1d; the verifier of HR-SD#1d)", () => {
  let thread = '';
  let reply = '';

  it("lets the owner's key comment and read the comments, with the ids of a share holder", async () => {
    const added = await action('comment.add', keys.owner!, {
      anchor: { kind: 'slide', slideId },
      body: body('From the owner key'),
    });
    expect(added.status, added.text).toBe(200);
    // the key writes as its own agent principal, as its document writes do
    expect(threadOf(added).comment.author.principalId).toBe(keys.owner!.agent);
    thread = threadOf(added).id;
    const listed = await action('comment.list', keys.owner!);
    expect(listed.status, listed.text).toBe(200);
    expect(listed.text).toContain('From the owner key');
    expect(listed.text).toContain(keys.owner!.agent);
    const viaMcp = await tool(keys.owner!, 'deck_list_comments');
    expect(viaMcp.status, viaMcp.text).toBe(200);
    expect(viaMcp.text).toContain('From the owner key');
  });

  it("lets a commenter's key reply, with every other person as a stand-in", async () => {
    const replied = await action('comment.reply', keys.commenter!, {
      threadId: thread,
      body: body('From the commenter key'),
    });
    expect(replied.status, replied.text).toBe(200);
    const own = new Set([keys.commenter!.agent, people.commenter]);
    expect(principalIdsIn(replied.text).filter((id) => !own.has(id))).toEqual([]);
    reply = threadOf(replied).replies.at(-1)?.id ?? '';
    expect(reply).not.toBe('');
    const listed = await action('comment.list', keys.commenter!);
    expect(listed.status, listed.text).toBe(200);
    expect(listed.text).toContain('From the commenter key');
    expect(principalIdsIn(listed.text).filter((id) => !own.has(id))).toEqual([]);
    expect(listed.text).toContain(standInFor(DECK, keys.owner!.agent));
  });

  it("refuses a viewer's key, whose owner may not comment, whatever its scopes", async () => {
    const added = await action('comment.add', keys.viewer!, {
      anchor: { kind: 'slide', slideId },
      body: body('From the viewer key'),
    });
    expect(added.status).toBe(403);
    expect((await action('comment.list', keys.viewer!)).status).toBe(403);
    expect((await tool(keys.viewer!, 'deck_list_comments')).status).toBe(403);
  });

  it("refuses the owner's key a comment its scopes do not allow", async () => {
    const added = await action('comment.add', keys.ownerRead!, {
      anchor: { kind: 'slide', slideId },
      body: body('From the read key'),
    });
    expect(added.status).toBe(403);
    // reading comments is a read scope's
    expect((await action('comment.list', keys.ownerRead!)).status).toBe(200);
  });

  it("deletes another author's comment only with the admin scope, as the owner's remove", async () => {
    const refused = await action('comment.delete', keys.ownerComment!, {
      threadId: thread,
      commentId: reply,
    });
    expect(refused.status, refused.text).toBe(403);
    expect(refused.text).toContain('only the author or the owner may delete a comment');
    const deleted = await action('comment.delete', keys.ownerAdmin!, {
      threadId: thread,
      commentId: reply,
    });
    expect(deleted.status, deleted.text).toBe(200);
  });

  it("names other people by stand-ins to a key without the share scope, the owner's own", async () => {
    // the owner may share, the key may not: it reads what a reader who may not share reads
    const listed = await action('comment.list', keys.ownerComment!);
    expect(listed.status, listed.text).toBe(200);
    const own = new Set([keys.ownerComment!.agent, people.owner]);
    expect(principalIdsIn(listed.text).filter((id) => !own.has(id))).toEqual([]);
  });

  it("reads the key's own inbox: the reply to its thread, the actor a stand-in", async () => {
    const added = await action('comment.add', keys.commenter!, {
      anchor: { kind: 'slide', slideId },
      body: body('A thread of the commenter key'),
    });
    expect(added.status, added.text).toBe(200);
    const replied = await action('comment.reply', keys.owner!, {
      threadId: threadOf(added).id,
      body: body('The owner key answers'),
    });
    expect(replied.status, replied.text).toBe(200);
    const inbox = await action('notification.list', keys.commenter!);
    expect(inbox.status, inbox.text).toBe(200);
    const rows = (inbox.json.notifications ?? []) as { kind: string; actors: string[] }[];
    expect(rows.map((row) => row.kind)).toContain('reply');
    const own = new Set([keys.commenter!.agent, people.commenter]);
    expect(principalIdsIn(inbox.text).filter((id) => !own.has(id))).toEqual([]);
    expect(inbox.text).toContain(standInFor(DECK, keys.owner!.agent));
  });
});

describe('a key on localhost without TURBOSLIDE_TOKEN (HR-SD#1d)', () => {
  it("is its owner cut to its scopes, never the checkout holder: an editor's key reads stand-ins", async () => {
    delete process.env.TURBOSLIDE_TOKEN;
    try {
      const listed = await action('comment.list', keys.editor!);
      expect(listed.status, listed.text).toBe(200);
      expect(listed.text).toContain('From the owner key');
      const own = new Set([keys.editor!.agent, people.editor]);
      expect(principalIdsIn(listed.text).filter((id) => !own.has(id))).toEqual([]);
      expect(listed.text).toContain(standInFor(DECK, keys.owner!.agent));
      // a viewer's key is refused there too, where the checkout holder reads everything
      expect((await action('comment.list', keys.viewer!)).status).toBe(403);
    } finally {
      process.env.TURBOSLIDE_TOKEN = TOKEN;
    }
  });
});
