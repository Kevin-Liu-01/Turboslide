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
import type { ActionSpec } from '@turboslide/schema/actions';

import { DECK_ID_ACTIONS } from './action-deck';
import {
  INPUT_DECKS,
  gateAgentAction,
  gateInputDecks,
  gatedDispatcher,
  requireBoundDeckId,
  requireNamedDeck,
  toolRefusalFor,
  writesBoundDeck,
} from './agent-gate';
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
// A write that lands on a deck and names none (no ?deck= on /api/actions or on the /mcp
// initialize request) is 400 before it reaches a handler; a read runs on the default deck. A share
// or publish tool whose input `id` names a deck other than its session's is 400, naming both.
// Shadow mode throughout: production runs it until the enforce flip, and the gate holds anyway.
// An MCP session lists only the tools its key may call: a tool the key's scopes or admin standing
// never reach is left out of tools/list, per session over the process wide tool cache, and a call
// to it answers 403 naming the scope it lacks.

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
const AUTHOR = { kind: 'agent' as const, name: 'agent', runId: 'gate-test' };

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

  it('refuses a key exactly the MCP tools the gate refuses it with 403 on its own deck', async () => {
    const keys: AgentCaller[] = [
      keyCaller('usr_alice', ['read']),
      keyCaller('usr_alice', ['read', 'write']),
      keyCaller('usr_alice', ['read', 'comment']),
      keyCaller('usr_alice', ['read', 'export']),
      keyCaller('usr_alice', ['read', 'write', 'share']),
      keyCaller('usr_alice', ['read', 'write', 'comment', 'export', 'share']),
      keyCaller('usr_alice', ['read', 'admin']),
      keyCaller('usr_root', ['read'], true),
      keyCaller('usr_root', ['read', 'admin'], true),
    ].map((caller, n) => ({
      // one token per key, so the writes per minute quota counts each key's calls alone
      ...caller,
      ctx: { ...caller.ctx, agent: { ...caller.ctx.agent!, tokenId: `tok_${n}` } },
    }));
    for (const caller of keys) {
      const refuse = toolRefusalFor(caller);
      const who = `${caller.ctx.agent?.scopes.join(',')}${caller.ctx.principal?.admin ? ' (admin account)' : ''}`;
      for (const action of MCP_ACTIONS) {
        const refused = refuse(action, ACTIONS[action].mcp ?? action);
        const byGate = await refusalOf(
          gateAgentAction(caller, {
            action,
            deckId: 'alpha',
            input: inputNaming(action, 'alpha'),
            transport: 'mcp',
          }),
        );
        if (refused !== undefined) {
          expect(refused.status, `${action} for ${who}`).toBe(403);
          expect(byGate?.status, `${action} for ${who}`).toBe(403);
        } else expect(byGate?.status, `${action} for ${who}`).not.toBe(403);
      }
    }
    // the admin bearers refuse nothing
    const bootstrap: AgentCaller = {
      kind: 'admin',
      ctx: { principal: { id: 'agent:token', kind: 'account', admin: true }, linkGrants: [] },
    };
    expect(MCP_ACTIONS.filter((action) => toolRefusalFor(bootstrap)(action, action))).toEqual([]);
  });

  it('names what a key lacks for a tool it can never call', () => {
    const message = (caller: AgentCaller, action: string, tool: string) =>
      toolRefusalFor(caller)(action, tool)?.message;
    const read = keyCaller('usr_alice', ['read']);
    const writer = keyCaller('usr_alice', ['read', 'write']);
    const all = keyCaller('usr_alice', ['read', 'write', 'comment', 'export', 'share']);
    expect(message(read, 'share.setGeneralAccess', 'deck_set_general_access')).toBe(
      'this key lacks the share scope that deck_set_general_access needs',
    );
    expect(message(read, 'deck.set', 'deck_set')).toBe(
      'this key lacks the write scope that deck_set needs',
    );
    expect(message(writer, 'deck.copy', 'deck_copy')).toBe(
      'this key lacks the export scope that deck_copy needs',
    );
    expect(message(read, 'deck.copy', 'deck_copy')).toBe(
      'this key lacks the export scope and the write scope that deck_copy needs',
    );
    expect(message(keyCaller('usr_alice', ['write']), 'comment.list', 'deck_list_comments')).toBe(
      'this key lacks the read or comment scope that deck_list_comments needs',
    );
    expect(message(all, 'admin.flag', 'deck_admin_flag')).toBe(
      'this key lacks the deployment admin standing that deck_admin_flag needs: the key of an admin account, with the admin scope',
    );
    expect(message(all, 'share.transferOwnership', 'deck_transfer_ownership')).toBe(
      'no API key scope allows deck_transfer_ownership: a person does it in the editor',
    );
    // an admin account's key meets no deck scope, and its admin scope stands for every scope
    expect(
      message(keyCaller('usr_root', ['read'], true), 'share.transferOwnership', 'deck_t'),
    ).toBe('this key lacks the admin scope that deck_t needs');
    expect(message(all, 'deck.info', 'deck_get_info')).toBeUndefined();
    expect(toolRefusalFor(read)('share.setGeneralAccess', 'x')).toMatchObject({
      status: 403,
      capability: 'share',
    });
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

  it('names the writes that land on no bound deck, no read, and no action off the transport', () => {
    // a new write lands on the bound deck unless it is added here and to the rule on purpose
    const unbound = [
      'account.setAvatar',
      'account.setName',
      'account.signOut',
      'account.tokens.create',
      'account.tokens.revoke',
      'admin.avatar.sweep',
      'admin.bootstrap',
      'admin.flag',
      'admin.migrateStorage',
      'deck.copy',
      'deck.create',
      'deck.remove',
      'deck.restore',
      'deck.trash',
      'notification.markRead',
      'notification.settings',
      'template.create',
      'template.delete',
      'template.rename',
      'template.setDefault',
      'template.update',
    ];
    for (const transport of ['http', 'mcp'] as const) {
      const offered = Object.values(ACTIONS).filter((spec) => spec.transports.includes(transport));
      for (const spec of Object.values(ACTIONS))
        if (!spec.mutates || !spec.transports.includes(transport))
          expect(writesBoundDeck(spec.id, transport), `${spec.id} on ${transport}`).toBe(false);
      expect(
        offered
          .filter((spec) => spec.mutates && !writesBoundDeck(spec.id, transport))
          .map((spec) => spec.id)
          .sort(),
        transport,
      ).toEqual(unbound.filter((id) => offered.some((spec) => spec.id === id)).sort());
    }
    expect(writesBoundDeck('admin.assignOwner', 'http')).toBe(true);
    expect(writesBoundDeck('share.createLink', 'mcp')).toBe(true);
    // a CLI only and a window only write: the transport's own refusal answers them
    expect(writesBoundDeck('deck.unpack', 'http')).toBe(false);
    expect(writesBoundDeck('source.apply', 'mcp')).toBe(false);
    expect(writesBoundDeck('no.such.action', 'http')).toBe(false);
  });

  it('refuses every write on the bound deck through an MCP session that names no deck, before the gate decides', async () => {
    const recorder = createDispatcher();
    for (const action of MCP_ACTIONS)
      recorder.register(action, () => {
        reached.push(action);
        return Promise.resolve({});
      });
    // a key that cannot read alpha: the gate's answer would be 404, the deck rule's comes first
    const outsider = keyCaller('usr_carol', ['read', 'write']);
    const unnamed = gatedDispatcher(recorder, outsider, {
      deckId: 'alpha',
      deckNamed: false,
      transport: 'mcp',
    });
    for (const action of MCP_ACTIONS) {
      const refused = await refusalOf(
        unnamed
          .dispatch(action, inputNaming(action, 'alpha'), { author: AUTHOR })
          .then(() => undefined),
      );
      if (writesBoundDeck(action, 'mcp')) {
        expect(refused?.status, action).toBe(400);
        expect(refused?.message, action).toContain('?deck=<id> on the /mcp initialize request');
      } else expect(refused?.status, action).not.toBe(400);
      expect(() => requireNamedDeck({ action, deckNamed: true, transport: 'mcp' })).not.toThrow();
    }
    expect(reached).toEqual([]);
  });

  it('refuses a share or publish tool whose input id names another deck than the session’s, with both named, before the gate decides', async () => {
    const recorder = createDispatcher();
    for (const action of MCP_ACTIONS)
      recorder.register(action, () => {
        reached.push(action);
        return Promise.resolve({});
      });
    const deckIdActions = MCP_ACTIONS.filter((action) => DECK_ID_ACTIONS.has(action));
    expect(deckIdActions).toEqual(
      expect.arrayContaining(['share.get', 'share.createLink', 'deck.publish', 'deck.unpublish']),
    );
    // a key that cannot read alpha: the gate's answer would be 404, the deck rule's comes first
    const outsider = keyCaller('usr_carol', ['read', 'write', 'share']);
    const bound = gatedDispatcher(recorder, outsider, {
      deckId: 'alpha',
      deckNamed: true,
      transport: 'mcp',
    });
    for (const action of deckIdActions) {
      // the same answer for a deck the caller cannot see and one that does not exist
      for (const other of ['beta', 'ghost'])
        expect(
          await refusalOf(
            bound.dispatch(action, { id: other }, { author: AUTHOR }).then(() => undefined),
          ),
          action,
        ).toEqual({
          status: 400,
          message: `${action} names deck "${other}" in its input and this session is bound to deck "alpha": open a session with ?deck=${other} on the /mcp initialize request to act on "${other}"`,
        });
      // the bound deck, no id, or an id that is not a slug (the schema's): the rule passes them
      for (const input of [{ id: 'alpha' }, {}, { id: '../x' }])
        expect(
          () => requireBoundDeckId({ action, deckId: 'alpha', input, transport: 'mcp' }),
          `${action} ${JSON.stringify(input)}`,
        ).not.toThrow();
    }
    // a session that names no deck is bound to the default: a share read naming another is refused
    const unnamed = gatedDispatcher(recorder, outsider, {
      deckId: 'gt-brand',
      deckNamed: false,
      transport: 'mcp',
    });
    expect(
      await refusalOf(
        unnamed.dispatch('share.get', { id: 'alpha' }, { author: AUTHOR }).then(() => undefined),
      ),
    ).toMatchObject({ status: 400, message: expect.stringContaining('bound to deck "gt-brand"') });
    expect(reached).toEqual([]);
  });
});

// The routes: /mcp over JSON-RPC (the SSE answers read whole) and /api/actions, the real identity
// runtime over sqlite, real keys; the deck dispatcher is the recording one mocked above.
describe('the agent routes through the gate', () => {
  let dir = '';
  let runtime: IdentityRuntime;
  const secrets: Record<'alice' | 'aliceShare' | 'bob' | 'bobRead', string> = {
    alice: '',
    aliceShare: '',
    bob: '',
    bobRead: '',
  };
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
      if (who === 'alice') {
        const made = await runtime.keys.create({
          userId: id,
          name: 'alice share',
          scopes: ['read', 'write', 'share'],
        });
        secrets.aliceShare = made.secret;
      }
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
    const query = deckId === '' ? '' : `?deck=${deckId}`;
    const request = new Request(`http://localhost:4321/mcp${query}`, {
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

  /** A tool call's error body (status, message, pointer), or null when the tool answered. */
  async function toolErrorOf(
    s: Session,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ status: number; message: string; pointer?: string } | null> {
    const answer = await rpc(
      s.deckId,
      s.secret,
      { jsonrpc: '2.0', id: next++, method: 'tools/call', params: { name, arguments: args } },
      s.id,
    );
    const result = answer.body.result as { isError?: boolean; content?: { text?: string }[] };
    if (result.isError !== true) return null;
    return (
      JSON.parse(result.content?.[0]?.text ?? '{}') as {
        error: { status: number; message: string; pointer?: string };
      }
    ).error;
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
      for (const tool of ['deck_trash', 'deck_restore', 'deck_import_slides'])
        expect(await statusOf(mine, tool, inputNaming(actionOf(tool), deckId)), tool).toBe(404);
      // a copy needs the export scope these keys lack: hidden, and 403 before any deck is read,
      // so the answer says nothing about the other deck
      for (const tool of ['deck_copy', 'deck_create_template']) {
        expect(await toolsOf(mine)).not.toContain(tool);
        expect(await statusOf(mine, tool, inputNaming(actionOf(tool), deckId)), tool).toBe(403);
        expect(await statusOf(mine, tool, inputNaming(actionOf(tool), 'ghost')), tool).toBe(403);
      }
      expect(reached).toEqual([]);
    }
    // every listed tool over four sessions: 7 s at a load average of 100 and 75 s at 230 on the
    // shared machine, over the 5 s default (2026-10-17, on the base commit too)
  }, 180_000);

  it('lists a read key no write tool and refuses each one by name, and refuses a revoked key everything', async () => {
    restrictedDeck('beta', users.bob);
    const readOnly = await session('beta', secrets.bobRead);
    const listed = await toolsOf(readOnly);
    expect(listed).toContain('deck_get_info');
    expect(
      listed.filter((tool) => ACTIONS[actionOf(tool) as keyof typeof ACTIONS].mutates),
    ).toEqual([]);
    // each tool name's first action in table order is the one a call dispatches
    const primary = new Map<string, ActionSpec>();
    for (const spec of actionsOn('mcp'))
      if (spec.mcp !== undefined && !primary.has(spec.mcp)) primary.set(spec.mcp, spec);
    reached.length = 0;
    for (const [tool, spec] of primary) {
      if (!spec.mutates) continue;
      expect(await statusOf(readOnly, tool, inputNaming(spec.id, 'beta')), tool).toBe(403);
    }
    expect(reached).toEqual([]);
    expect(GATE.has(await statusOf(readOnly, 'deck_get_info'))).toBe(false);
    await runtime.keys.revoke(bobReadId);
    expect(await statusOf(readOnly, 'deck_get_info')).toBe(401);
    expect(await open('beta', secrets.bobRead)).toMatchObject({ status: 401 });
  }, 180_000);

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

  it('binds a session or a request that names no deck to the default for reads, and refuses its writes', async () => {
    // the seed deck as production keeps it: open to everyone as an editor
    existing.add('gt-brand');
    records.set('gt-brand', synthesizeLegacyRecord('gt-brand'));
    // a key with the share scope, so the share tool is listed and the deck rule answers it
    const unnamed = await session('', secrets.aliceShare);
    reached.length = 0;
    expect(GATE.has(await statusOf(unnamed, 'deck_get_info'))).toBe(false);
    expect(reached).toEqual(['deck.info']);
    reached.length = 0;
    const shareTool = actionsOn('mcp').find((spec) => spec.id === 'share.createLink')?.mcp ?? '';
    for (const [tool, args] of [
      ['deck_set', { path: '/title', value: 'x', baseRevision: 0 }],
      [shareTool, { id: 'gt-brand', role: 'editor', baseRevision: 0 }],
    ] as const) {
      const answer = await rpc(
        '',
        secrets.aliceShare,
        {
          jsonrpc: '2.0',
          id: next++,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        },
        unnamed.id,
      );
      const result = answer.body.result as { isError?: boolean; content?: { text?: string }[] };
      expect(result.isError, tool).toBe(true);
      const error = (
        JSON.parse(result.content?.[0]?.text ?? '{}') as {
          error: { status: number; message: string };
        }
      ).error;
      expect(error.status, tool).toBe(400);
      expect(error.message, tool).toContain('?deck=<id> on the /mcp initialize request');
    }
    expect(reached).toEqual([]);
    // the same over /api/actions: the write is deck_required, deck.create names no deck
    const unnamedPost = async (action: string, input: object) => {
      const request = new Request(`http://localhost:4321/api/actions/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secrets.alice}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const response = await actionsPost({ params: { action }, request });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    expect(
      await unnamedPost('deck.set', { path: '/title', value: 'x', baseRevision: 0 }),
    ).toMatchObject({
      status: 400,
      body: { error: { code: 'deck_required', action: 'deck.set' } },
    });
    expect(reached).toEqual([]);
    expect((await unnamedPost('deck.create', { name: 'Fresh' })).status).toBe(500);
    expect(reached).toEqual(['deck.create']);
  });

  it('lists each key only the tools it may call, session by session, and names the missing scope on a call to a hidden one', async () => {
    restrictedDeck('alpha', users.alice);
    const plain = await session('alpha', secrets.alice);
    const sharing = await session('alpha', secrets.aliceShare);
    const shareTool = actionsOn('mcp').find((spec) => spec.id === 'share.setGeneralAccess')?.mcp;
    expect(shareTool).toBe('deck_set_general_access');
    // interleaved twice over one process's tool cache: no session is served another key's list
    for (let round = 0; round < 2; round += 1) {
      const plainTools = await toolsOf(plain);
      const sharingTools = await toolsOf(sharing);
      expect(plainTools).not.toContain(shareTool);
      expect(sharingTools).toContain(shareTool);
      expect(plainTools.filter((tool) => !sharingTools.includes(tool))).toEqual([]);
      // the share scope adds the share and publish tools and nothing else
      expect(
        sharingTools
          .filter((tool) => !plainTools.includes(tool))
          .map((tool) => capabilityForAction(actionOf(tool)))
          .filter((capability) => capability !== 'share' && capability !== 'publish'),
      ).toEqual([]);
      // neither key is the deployment admin's
      expect(sharingTools.filter((tool) => actionOf(tool).startsWith('admin.'))).toEqual([]);
    }
    reached.length = 0;
    expect(
      await toolErrorOf(plain, 'deck_set_general_access', {
        id: 'alpha',
        mode: 'restricted',
        role: 'viewer',
        baseRevision: 0,
      }),
    ).toMatchObject({
      status: 403,
      message: 'this key lacks the share scope that deck_set_general_access needs',
    });
    expect(reached).toEqual([]);
    // the key with the scope reaches the handler (which refuses here with a 500)
    expect(
      await statusOf(sharing, 'deck_set_general_access', {
        id: 'alpha',
        mode: 'restricted',
        role: 'viewer',
        baseRevision: 0,
      }),
    ).not.toBe(403);
  });

  it('refuses a share or publish tool whose id names a deck other than the session’s, and runs it on the session’s own', async () => {
    // both decks are alice's, so the refusal is the mismatch and not the other deck's access
    restrictedDeck('alpha', users.alice);
    restrictedDeck('beta', users.alice);
    const bound = await session('alpha', secrets.aliceShare);
    const toolOf = (action: string): string =>
      actionsOn('mcp').find((spec) => spec.id === action)?.mcp ?? '';
    for (const [action, rest] of [
      ['share.get', {}],
      ['share.createLink', { role: 'editor', baseRevision: 0 }],
      ['deck.publish', { baseRevision: 0 }],
      ['deck.unpublish', { baseRevision: 0 }],
    ] as const) {
      const tool = toolOf(action);
      reached.length = 0;
      expect(await toolErrorOf(bound, tool, { id: 'beta', ...rest }), tool).toMatchObject({
        status: 400,
        message: `${action} names deck "beta" in its input and this session is bound to deck "alpha": open a session with ?deck=beta on the /mcp initialize request to act on "beta"`,
      });
      expect(reached, tool).toEqual([]);
      // the session's own deck reaches the handler (which refuses here with a 500)
      expect(await toolErrorOf(bound, tool, { id: 'alpha', ...rest }), tool).toMatchObject({
        status: 500,
        message: 'reached the handler',
      });
      expect(reached, tool).toEqual([action]);
      reached.length = 0;
      // no id passes the gate to the action's schema, which requires one
      expect(await toolErrorOf(bound, tool, { ...rest }), tool).toMatchObject({
        status: 400,
        pointer: '/id',
      });
      expect(reached, tool).toEqual([]);
    }
    // the session on beta runs the same tool on beta
    const other = await session('beta', secrets.aliceShare);
    reached.length = 0;
    expect(
      await toolErrorOf(other, toolOf('deck.publish'), { id: 'beta', baseRevision: 0 }),
    ).toMatchObject({ status: 500, message: 'reached the handler' });
    expect(reached).toEqual(['deck.publish']);
  });
});

describe("the decks an input names, on the editor's runDeckAction (H3)", () => {
  it("refuses a browser on another person's deck with a missing deck's answer, and admits its own", async () => {
    restrictedDeck('alpha', 'usr_alice');
    restrictedDeck('beta', 'usr_bob');
    const alice: AuthContext = {
      principal: { id: 'usr_alice', kind: 'account', admin: false },
      linkGrants: [],
    };
    expect([...INPUT_DECKS.keys()].sort()).toEqual([
      'deck.copy',
      'deck.remove',
      'deck.restore',
      'deck.trash',
      'slide.import',
      'template.create',
      'template.update',
    ]);
    for (const action of INPUT_DECKS.keys()) {
      expect(
        await refusalOf(gateInputDecks(alice, action, inputNaming(action, 'beta'))),
        action,
      ).toEqual({ status: 404, message: 'No deck beta' });
      expect(
        await refusalOf(gateInputDecks(alice, action, inputNaming(action, 'gamma'))),
        action,
      ).toEqual({ status: 404, message: 'No deck gamma' });
      expect(
        await refusalOf(gateInputDecks(alice, action, inputNaming(action, 'alpha'))),
        action,
      ).toBeNull();
    }
    // an action that names no deck decides nothing more
    expect(await refusalOf(gateInputDecks(alice, 'slide.duplicate', { id: 'beta' }))).toBeNull();
  });
});
