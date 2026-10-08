import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { AccessGrant, AccessRecord, AuthContext, Scope } from '@turboslide/identity/access';
import { synthesizeLegacyRecord } from '@turboslide/identity/access';
import { accountPrincipalId } from '@turboslide/identity/ids';
import type { DeckSource } from '@turboslide/mcp/resources';
import { ACTIONS, actionsOn } from '@turboslide/schema/actions';

import { INPUT_DECKS, gateAgentAction } from './agent-gate';
import type { AgentCaller } from './agent-gate';
import { ensureUserByEmail } from './auth/actions';
import { buildIdentityRuntime, setIdentityRuntime } from './auth/identity';
import type { IdentityRuntime } from './auth/identity';
import { bindAuthorize, boundDecide, capabilityForAction } from './authorize';
import { bindFlags } from './flags';
import { setSecurityLogSink } from './log';
import { bindRateLimiter, memoryLimiter } from './ratelimit';
import type { RateLimiter } from './ratelimit';

// Hardening H2 (docs/hardening/research/auth-verify.md AUTH-2, AV-1, AV-2): the one gate of the
// agent surface. Two accounts with their own keys are each refused on the other's restricted deck
// for every MCP tool, read and write, with the answer a missing deck gets; a read key is refused
// every write; a revoked key is refused; the read only switch and the write quota hold on MCP.
// Shadow mode throughout: production runs it until the enforce flip, and the gate holds anyway.

const existing = new Set<string>();
vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasStoredDeck: (deckId: string) => Promise.resolve(existing.has(deckId)),
}));

// the route's deck dispatcher: one handler per MCP action that records the call, over the decks
// this file says exist (the real one opens the store)
const reached: string[] = [];
vi.mock('./actions', () => ({
  DEFAULT_DECK: 'gt-brand',
  readRenderUrl: () => Promise.reject(new Error('no renders here')),
  deckDispatcher: (deckId: string) => {
    if (!existing.has(deckId))
      return Promise.reject(new RangeError(`No deck ${deckId} under decks/`));
    const dispatcher = createDispatcher();
    for (const spec of actionsOn('mcp'))
      dispatcher.register(spec.id, () => {
        reached.push(spec.id);
        return Promise.reject(new Error('reached the handler'));
      });
    const source: DeckSource = {
      deckId,
      manifest: () => Promise.resolve({ id: deckId, revision: 0 }),
      slides: () => Promise.resolve([]),
      slide: () => Promise.resolve(undefined),
      latestRender: () => Promise.resolve(undefined),
      latestSheet: () => Promise.resolve(undefined),
    };
    return Promise.resolve({
      deckId,
      store: { dir: '/nowhere' },
      dispatcher,
      source,
      session: undefined,
    });
  },
}));

vi.mock('./room', () => ({ flushRoom: () => Promise.resolve() }));

const { Route: McpRoute } = await import('../routes/mcp');
const { Route: ActionsRoute } = await import('../routes/api/actions.$action');

setSecurityLogSink(() => undefined);

const NOW = '2026-10-08T00:00:00.000Z';
const records = new Map<string, AccessRecord>();

function restrictedDeck(deckId: string, owner: string, grants: AccessGrant[] = []): void {
  existing.add(deckId);
  records.set(deckId, {
    ...synthesizeLegacyRecord(deckId),
    owner,
    createdBy: owner,
    generalAccess: { mode: 'restricted', role: 'viewer' },
    grants,
  });
}

function viewerGrant(principalId: string, by: string): AccessGrant {
  return {
    principalId,
    email: null,
    role: 'viewer',
    invitedBy: by,
    invitedAt: NOW,
    acceptedAt: NOW,
    expiresAt: null,
  };
}

function keyCaller(owner: string, scopes: Scope[], admin = false): AgentCaller {
  const ctx: AuthContext = {
    principal: { id: owner, kind: 'account', admin },
    agent: { tokenId: `tok_${owner}`, ownerId: owner, scopes, name: 'test key' },
    linkGrants: [],
  };
  return { kind: 'agent', ctx };
}

/** The input a call names a deck with: the deck naming field of INPUT_DECKS, else nothing. */
function inputNaming(action: string, deckId: string): Record<string, unknown> {
  const named = INPUT_DECKS.get(action);
  return named === undefined ? {} : { [named.field]: deckId };
}

async function refusalOf(run: Promise<void>): Promise<{ status: number; message: string } | null> {
  try {
    await run;
    return null;
  } catch (error) {
    return {
      status: (error as { status?: number }).status ?? (error instanceof RangeError ? 404 : 500),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

let flagsOn: (name: string) => boolean = () => true;

beforeEach(() => {
  bindAuthorize({
    decide: boundDecide,
    loadRecord: (deckId) => Promise.resolve(records.get(deckId) ?? null),
    mode: () => 'shadow',
    now: () => Date.now(),
  });
  flagsOn = () => true;
  bindFlags({ read: (name) => Promise.resolve(flagsOn(name)), write: null });
  bindRateLimiter(memoryLimiter());
  reached.length = 0;
});

afterEach(() => {
  records.clear();
  existing.clear();
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  bindFlags({ read: null, write: null });
  bindRateLimiter(undefined);
});

const MCP_ACTIONS = actionsOn('mcp').map((spec) => spec.id);

describe('the gate (server/agent-gate.ts) in shadow mode', () => {
  const alice = keyCaller('usr_alice', ['read', 'write', 'comment', 'export', 'share']);
  const bob = keyCaller('usr_bob', ['read', 'write', 'comment', 'export', 'share']);

  beforeEach(() => {
    restrictedDeck('alpha', 'usr_alice');
    restrictedDeck('beta', 'usr_bob');
  });

  it('refuses each key every MCP action on the other account’s deck, with the not found of a missing deck', async () => {
    for (const [caller, own, other] of [
      [bob, 'beta', 'alpha'],
      [alice, 'alpha', 'beta'],
    ] as const) {
      for (const action of MCP_ACTIONS) {
        // bound to the other deck
        const bound = await refusalOf(
          gateAgentAction(caller, {
            action,
            deckId: other,
            input: inputNaming(action, other),
            transport: 'mcp',
          }),
        );
        const admin = action.startsWith('admin.');
        expect(bound, `${action} bound to ${other}`).toEqual(
          admin
            ? { status: 403, message: 'This action is the deployment admin’s' }
            : { status: 404, message: `No deck ${other}` },
        );
        // bound to its own deck, naming the other one in the input
        if (!INPUT_DECKS.has(action)) continue;
        const named = await refusalOf(
          gateAgentAction(caller, {
            action,
            deckId: own,
            input: inputNaming(action, other),
            transport: 'mcp',
          }),
        );
        expect(named, `${action} naming ${other}`).toEqual({
          status: 404,
          message: `No deck ${other}`,
        });
        const missing = await refusalOf(
          gateAgentAction(caller, {
            action,
            deckId: own,
            input: inputNaming(action, 'gone'),
            transport: 'mcp',
          }),
        );
        expect(missing, `${action} naming a missing deck`).toEqual({
          status: 404,
          message: 'No deck gone',
        });
      }
    }
  });

  it('admits the owner’s key on its own deck, and refuses a read key every write', async () => {
    const readKey = keyCaller('usr_alice', ['read']);
    for (const action of MCP_ACTIONS) {
      if (action.startsWith('admin.')) continue;
      const call = {
        action,
        deckId: 'alpha',
        input: inputNaming(action, 'alpha'),
        transport: 'mcp' as const,
      };
      const capability = capabilityForAction(action);
      const byOwner = await refusalOf(gateAgentAction(alice, call));
      // follow and transfer are no key's, settings the admin scope's (SPEC-3 6.1); the rest pass
      if (capability === 'follow' || capability === 'transfer' || capability === 'settings')
        expect(byOwner?.status, `${action} by the owner's key`).toBe(403);
      else expect(byOwner, `${action} by the owner's key`).toBeNull();
      const byReadKey = await refusalOf(gateAgentAction(readKey, call));
      if (ACTIONS[action].mutates) expect(byReadKey?.status, `${action} by a read key`).toBe(403);
      else if (capability === 'read' || capability === null)
        expect(byReadKey, `${action} by a read key`).toBeNull();
    }
  });

  it('applies a key’s scopes to an admin account’s key, and keeps admin.* to the deployment admin', async () => {
    const adminRead = keyCaller('usr_root', ['read'], true);
    const call = { action: 'deck.set', deckId: 'alpha', input: {}, transport: 'mcp' as const };
    expect((await refusalOf(gateAgentAction(adminRead, call)))?.status).toBe(403);
    expect(
      await refusalOf(gateAgentAction(adminRead, { ...call, action: 'deck.info' })),
    ).toBeNull();
    const flag = {
      action: 'admin.flag',
      deckId: 'alpha',
      input: { name: 'readOnly' },
      transport: 'mcp' as const,
    };
    expect((await refusalOf(gateAgentAction(alice, flag)))?.status).toBe(403);
    expect(
      await refusalOf(gateAgentAction(keyCaller('usr_root', ['admin'], true), flag)),
    ).toBeNull();
  });

  it('applies the read only switch and the writes per minute per deck quota to a key’s writes', async () => {
    const write = { action: 'deck.set', deckId: 'alpha', input: {}, transport: 'mcp' as const };
    const read = { ...write, action: 'deck.info' };
    flagsOn = (name) => name !== 'readOnly';
    expect(await refusalOf(gateAgentAction(alice, write))).toMatchObject({ status: 503 });
    expect(await refusalOf(gateAgentAction(alice, read))).toBeNull();
    flagsOn = () => true;
    bindFlags({ read: (name) => Promise.resolve(flagsOn(name)) });
    const keys: string[] = [];
    const refusing: RateLimiter = {
      kind: 'memory',
      limit: (key) => {
        keys.push(key);
        return Promise.resolve({ ok: false, remaining: 0, resetAt: Date.now() + 60_000 });
      },
    };
    bindRateLimiter(refusing);
    expect(await refusalOf(gateAgentAction(alice, write))).toMatchObject({ status: 429 });
    expect(await refusalOf(gateAgentAction(alice, read))).toBeNull();
    expect(keys).toEqual(['agent:tok_usr_alice:writesPerMinutePerDeck:alpha']);
  });
});

// The routes: /mcp over JSON-RPC (the SSE answers read whole) and /api/actions, the real identity
// runtime over sqlite, real keys; the deck dispatcher is the recording one mocked above.
describe('the agent routes through the gate', () => {
  let dir = '';
  let runtime: IdentityRuntime;
  const secrets: Record<'alice' | 'bob' | 'bobRead', string> = { alice: '', bob: '', bobRead: '' };
  const users: Record<'alice' | 'bob', string> = { alice: '', bob: '' };
  let bobReadId = '';
  let next = 1;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'turboslide-agent-gate-'));
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
    for (const who of ['alice', 'bob'] as const) {
      const { id } = await ensureUserByEmail(runtime, `${who}@example.test`);
      users[who] = accountPrincipalId(id);
      const { secret } = await runtime.keys.create({
        userId: id,
        name: who,
        scopes: ['read', 'write'],
      });
      secrets[who] = secret;
      if (who === 'bob') {
        const made = await runtime.keys.create({ userId: id, name: 'bob read', scopes: ['read'] });
        secrets.bobRead = made.secret;
        bobReadId = made.record.id;
      }
    }
  });

  afterAll(async () => {
    await setIdentityRuntime(undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  type Handler = (ctx: { request: Request }) => Promise<Response>;
  const post = (McpRoute.options as unknown as { server: { handlers: { POST: Handler } } }).server
    .handlers.POST;

  type Rpc = {
    status: number;
    session: string | null;
    body: { result?: Record<string, unknown>; error?: { code: number; message: string } };
  };

  async function rpc(
    deckId: string,
    secret: string,
    message: object,
    sessionId?: string,
  ): Promise<Rpc> {
    const headers = new Headers({
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    });
    if (sessionId !== undefined) {
      headers.set('mcp-session-id', sessionId);
      headers.set('mcp-protocol-version', '2025-03-26');
    }
    const request = new Request(`http://localhost:4321/mcp?deck=${deckId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
    });
    const response = await post({ request });
    const text = await response.text();
    let body: Rpc['body'] = {};
    try {
      body = JSON.parse(text) as Rpc['body'];
    } catch {
      const data = text.split('\n').filter((line) => line.startsWith('data:'));
      if (data.length > 0) body = JSON.parse(data[data.length - 1]!.slice(5)) as Rpc['body'];
    }
    return { status: response.status, session: response.headers.get('mcp-session-id'), body };
  }

  type Session = { deckId: string; secret: string; id: string };

  /** Initialize: the session, or the refusal's status and message. */
  async function open(
    deckId: string,
    secret: string,
  ): Promise<Session | { status: number; message: string }> {
    const init = await rpc(deckId, secret, {
      jsonrpc: '2.0',
      id: next++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'gate-test', version: '0' },
      },
    });
    if (init.session === null)
      return { status: init.status, message: init.body.error?.message ?? '' };
    await rpc(
      deckId,
      secret,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      init.session,
    );
    return { deckId, secret, id: init.session };
  }

  async function session(deckId: string, secret: string): Promise<Session> {
    const opened = await open(deckId, secret);
    if (!('id' in opened))
      throw new Error(`initialize answered ${opened.status}: ${opened.message}`);
    return opened;
  }

  /** A tool call's status: the HTTP status of a refused request, the tool error's status, or 200. */
  async function statusOf(
    s: Session,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<number> {
    const answer = await rpc(
      s.deckId,
      s.secret,
      { jsonrpc: '2.0', id: next++, method: 'tools/call', params: { name, arguments: args } },
      s.id,
    );
    if (answer.body.error !== undefined || answer.status !== 200) return answer.status;
    const result = answer.body.result as { isError?: boolean; content?: { text?: string }[] };
    if (result.isError !== true) return 200;
    const text = result.content?.[0]?.text ?? '{}';
    return (JSON.parse(text) as { error?: { status?: number } }).error?.status ?? 0;
  }

  async function toolsOf(s: Session): Promise<string[]> {
    const answer = await rpc(
      s.deckId,
      s.secret,
      { jsonrpc: '2.0', id: next++, method: 'tools/list' },
      s.id,
    );
    return ((answer.body.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
  }

  const actionOf = (tool: string): string =>
    actionsOn('mcp').find((spec) => spec.mcp === tool)?.id ?? '';
  const GATE = new Set([401, 403, 404, 429, 503]);

  it('answers a deck the key cannot see as it answers a missing deck, at initialize', async () => {
    restrictedDeck('alpha', users.alice);
    restrictedDeck('beta', users.bob);
    const hidden = await open('alpha', secrets.bob);
    const missing = await open('ghost', secrets.bob);
    expect(hidden).toEqual({ status: 404, message: 'No deck alpha' });
    expect(missing).toEqual({ status: 404, message: 'No deck ghost' });
    expect(await open('beta', secrets.alice)).toEqual({ status: 404, message: 'No deck beta' });
  });

  it('refuses every tool, read and write, once the key loses the deck, and the other way round', async () => {
    for (const [owner, other, deckId, ownDeck] of [
      ['alice', 'bob', 'alpha', 'beta'],
      ['bob', 'alice', 'beta', 'alpha'],
    ] as const) {
      restrictedDeck(deckId, users[owner], [viewerGrant(users[other], users[owner])]);
      restrictedDeck(ownDeck, users[other]);
      const shared = await session(deckId, secrets[other]);
      expect(GATE.has(await statusOf(shared, 'deck_get_info'))).toBe(false);
      expect(
        await statusOf(shared, 'deck_set', { path: '/title', value: 'x', baseRevision: 0 }),
      ).toBe(403);
      // the grant ends: every tool the session lists is refused on its next call
      restrictedDeck(deckId, users[owner]);
      const tools = await toolsOf(shared);
      expect(tools.length).toBeGreaterThan(100);
      reached.length = 0;
      for (const tool of tools) {
        const action = actionOf(tool);
        expect(await statusOf(shared, tool, inputNaming(action, deckId)), tool).toBe(
          action.startsWith('admin.') ? 403 : 404,
        );
      }
      expect(reached).toEqual([]);
      // and from its own deck, naming the other's deck in the input
      const mine = await session(ownDeck, secrets[other]);
      for (const tool of [
        'deck_copy',
        'deck_trash',
        'deck_restore',
        'deck_import_slides',
        'deck_create_template',
      ])
        expect(await statusOf(mine, tool, inputNaming(actionOf(tool), deckId)), tool).toBe(404);
      expect(reached).toEqual([]);
    }
  });

  it('refuses a read key every write tool, and a revoked key everything', async () => {
    restrictedDeck('beta', users.bob);
    const readOnly = await session('beta', secrets.bobRead);
    for (const tool of await toolsOf(readOnly)) {
      const action = actionOf(tool);
      if (!ACTIONS[action as keyof typeof ACTIONS].mutates) continue;
      expect(await statusOf(readOnly, tool, inputNaming(action, 'beta')), tool).toBe(403);
    }
    expect(GATE.has(await statusOf(readOnly, 'deck_get_info'))).toBe(false);
    await runtime.keys.revoke(bobReadId);
    expect(await statusOf(readOnly, 'deck_get_info')).toBe(401);
    expect(await open('beta', secrets.bobRead)).toMatchObject({ status: 401 });
  });

  it('holds the read only switch and the write quota on MCP', async () => {
    restrictedDeck('alpha', users.alice);
    const own = await session('alpha', secrets.alice);
    const write = { path: '/title', value: 'x', baseRevision: 0 };
    flagsOn = (name) => name !== 'readOnly';
    expect(await statusOf(own, 'deck_set', write)).toBe(503);
    expect(GATE.has(await statusOf(own, 'deck_get_info'))).toBe(false);
    flagsOn = () => true;
    bindFlags({ read: (name) => Promise.resolve(flagsOn(name)) });
    // the window's clock stands still, so a slow machine cannot roll the minute over mid test
    const frozen = Date.now();
    bindRateLimiter(memoryLimiter(() => frozen));
    const statuses: number[] = [];
    for (let i = 0; i < 601; i += 1) statuses.push(await statusOf(own, 'deck_set', write));
    // 600 writes a minute per key per deck reach the dispatcher (whose handler refuses them here);
    // the 601st is the quota's
    expect(statuses.slice(0, 600).some((status) => GATE.has(status))).toBe(false);
    expect(statuses[600]).toBe(429);
  }, 120_000);

  type ActionsHandler = (ctx: {
    params: { action: string };
    request: Request;
  }) => Promise<Response>;
  const actionsPost = (
    ActionsRoute.options as unknown as { server: { handlers: { POST: ActionsHandler } } }
  ).server.handlers.POST;

  async function http(action: string, deckId: string, secret: string, input: object = {}) {
    const request = new Request(`http://localhost:4321/api/actions/${action}?deck=${deckId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const response = await actionsPost({ params: { action }, request });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('lets a key reach /api/actions under the same gate (AV-1)', async () => {
    restrictedDeck('alpha', users.alice);
    restrictedDeck('beta', users.bob);
    reached.length = 0;
    // the owner's key reaches its own deck's handler
    expect((await http('deck.info', 'alpha', secrets.alice)).status).toBe(500);
    expect(reached).toEqual(['deck.info']);
    reached.length = 0;
    // the other key: the not found of a missing deck, read or write, bound or named
    const hidden = await http('deck.info', 'alpha', secrets.bob);
    const missing = await http('deck.info', 'ghost', secrets.bob);
    expect(hidden.status).toBe(404);
    expect(JSON.stringify(hidden.body).replace('alpha', 'X')).toBe(
      JSON.stringify(missing.body).replace('ghost', 'X'),
    );
    expect(
      (
        await http('deck.set', 'alpha', secrets.bob, {
          path: '/title',
          value: 'x',
          baseRevision: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (await http('deck.trash', 'beta', secrets.bob, { id: 'alpha', baseRevision: 0 })).status,
    ).toBe(404);
    expect(
      (await http('admin.flag', 'beta', secrets.bob, { name: 'readOnly', on: false })).status,
    ).toBe(403);
    expect(reached).toEqual([]);
    // the switch and the quota keep their bodies
    flagsOn = (name) => name !== 'readOnly';
    expect(
      await http('deck.set', 'alpha', secrets.alice, {
        path: '/title',
        value: 'x',
        baseRevision: 0,
      }),
    ).toMatchObject({
      status: 503,
      body: { error: 'unavailable' },
    });
    flagsOn = () => true;
    bindFlags({ read: (name) => Promise.resolve(flagsOn(name)) });
    bindRateLimiter({
      kind: 'memory',
      limit: () => Promise.resolve({ ok: false, remaining: 0, resetAt: Date.now() + 60_000 }),
    });
    expect(
      await http('deck.set', 'alpha', secrets.alice, {
        path: '/title',
        value: 'x',
        baseRevision: 0,
      }),
    ).toMatchObject({
      status: 429,
      body: { error: 'rate_limited' },
    });
    expect(reached).toEqual([]);
  });
});
