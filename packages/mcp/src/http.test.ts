// MCP over streamable HTTP end to end without a socket: the SDK client's fetch is the handler.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { afterEach, describe, expect, it } from 'vitest';

import { createMcpHttpHandler, isInitializeBody } from './http.ts';
import type { KeyBinding } from './http.ts';
import type { DeckSource } from './resources.ts';
import { createMcpServer } from './server.ts';

const author = { kind: 'agent' as const, name: 'agent', runId: 'http-test' };

function source(): DeckSource {
  return {
    deckId: 'fixture',
    manifest: async () => ({ id: 'fixture', revision: 3 }),
    slides: async () => [{ id: 'thesis', n: 1, title: 'Thesis' }],
    slide: async (slideId) =>
      slideId === 'thesis' ? { id: 'thesis', kind: 'statement', big: 'Thesis' } : undefined,
    latestRender: async () => undefined,
    latestSheet: async () => undefined,
  };
}

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

function handlerWith(
  options: {
    denyToken?: boolean;
    withView?: boolean;
    /** The API key record a bearer resolves to (SPEC-3 3.10); `null` for the static bearer. */
    resolveKey?: (request: Request) => KeyBinding | null;
    sessionsPerKey?: number;
    /** JSON answers instead of SSE, so a raw request's body reads as one object. */
    enableJsonResponse?: boolean;
  } = {},
) {
  const created: string[] = [];
  const handler = createMcpHttpHandler({
    ...(options.resolveKey !== undefined ? { resolveKey: options.resolveKey } : {}),
    ...(options.sessionsPerKey !== undefined ? { sessionsPerKey: options.sessionsPerKey } : {}),
    ...(options.enableJsonResponse !== undefined
      ? { enableJsonResponse: options.enableJsonResponse }
      : {}),
    authorize: options.denyToken
      ? (request) =>
          request.headers.get('authorization') === 'Bearer secret'
            ? undefined
            : new Response(JSON.stringify({ error: { status: 401 } }), { status: 401 })
      : undefined,
    createServer: (request, sessionId) => {
      const url = new URL(request.url);
      const deck = url.searchParams.get('deck') ?? 'fixture';
      if (deck !== 'fixture') throw new RangeError(`No deck ${deck}`);
      created.push(sessionId);
      const dispatcher = createDispatcher();
      dispatcher.register('deck.info', () => ({
        id: 'fixture',
        title: 'Fixture',
        theme: 'gt-ink-paper',
        revision: 3,
        sections: [],
        counts: { slides: 1, sections: 1, assets: 0, htmlBlocks: 0 },
      }));
      if (options.withView) {
        dispatcher.register('view.goto', (input) => ({
          slideId: (input as { slideId: string }).slideId,
          n: 1,
          mode: 'slide',
          theme: 'dark',
          present: false,
        }));
      }
      const server = createMcpServer({
        dispatcher,
        source: source(),
        author,
        version: '0.0.0-test',
      });
      return { server: server.server, facts: { deck, tools: server.tools.length } };
    },
  });
  closers.push(() => handler.close());
  return { handler, created };
}

async function connect(
  handler: ReturnType<typeof createMcpHttpHandler>,
  path = '/mcp',
  headers: Record<string, string> = {},
) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:4321${path}`), {
    fetch: (url, init) => {
      const merged = new Headers(init?.headers);
      for (const [name, value] of Object.entries(headers)) merged.set(name, value);
      return handler.handle(new Request(url, { ...init, headers: merged }));
    },
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  closers.push(async () => {
    try {
      await client.close();
    } catch {
      // the session may already be closed
    }
  });
  return { client, transport };
}

describe('createMcpHttpHandler', () => {
  it('opens a session on initialize, serves tools and calls, and closes on DELETE', async () => {
    const { handler, created } = handlerWith();
    const { client, transport } = await connect(handler);
    expect(created).toHaveLength(1);
    expect(handler.sessions()).toHaveLength(1);
    expect(handler.sessions()[0]?.facts).toEqual({ deck: 'fixture', tools: 1 });
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['deck_get_info']);
    const result = await client.callTool({ name: 'deck_get_info', arguments: {} });
    expect(result.structuredContent).toMatchObject({ id: 'fixture', revision: 3 });
    await transport.terminateSession();
    expect(handler.sessions()).toHaveLength(0);
  });

  it('lists deck_goto_slide when the factory registers view.goto', async () => {
    const { handler } = handlerWith({ withView: true });
    const { client } = await connect(handler);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['deck_get_info', 'deck_goto_slide']);
    const result = await client.callTool({
      name: 'deck_goto_slide',
      arguments: { slideId: 'thesis' },
    });
    expect(result.structuredContent).toMatchObject({ slideId: 'thesis', mode: 'slide' });
  });

  it('refuses a non-initialize request without a session, an unknown session on GET or an unknown deck, and an unknown deck', async () => {
    const { handler } = handlerWith();
    const noSession = await handler.handle(
      new Request('http://localhost:4321/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(noSession.status).toBe(400);
    /* a POST with an unknown session is rebuilt from the request (the resume below), so the 404
       stands where the rebuild cannot: a GET, and a request naming a deck this host lacks */
    const unknownGet = await handler.handle(
      new Request('http://localhost:4321/mcp', {
        headers: { 'mcp-session-id': 'nope', accept: 'text/event-stream' },
      }),
    );
    expect(unknownGet.status).toBe(404);
    const unknownDeck = await handler.handle(
      new Request('http://localhost:4321/mcp?deck=missing', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'nope',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(unknownDeck.status).toBe(404);
    expect(handler.sessions()).toHaveLength(0);
    const get = await handler.handle(new Request('http://localhost:4321/mcp'));
    expect(get.status).toBe(400);
    await expect(connect(handler, '/mcp?deck=missing')).rejects.toThrow(/404|No deck/);
    expect(isInitializeBody({ jsonrpc: '2.0', method: 'initialize' })).toBe(true);
    expect(isInitializeBody([{ method: 'tools/list' }])).toBe(false);
  });

  it('rebuilds a session another instance opened when its POST lands here (the features round, F5)', async () => {
    /* two handlers stand for two instances of one deployment: initialize answered on the first,
       a tools/list with its session id landed on the second (build/b6.md R16) */
    const first = handlerWith({ enableJsonResponse: true });
    const second = handlerWith({ enableJsonResponse: true });
    const { transport } = await connect(first.handler, '/mcp?deck=fixture');
    const sessionId = transport.sessionId;
    expect(sessionId).toBeDefined();
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId!,
      'mcp-protocol-version': '2025-03-26',
    };
    const list = await second.handler.handle(
      new Request('http://localhost:4321/mcp?deck=fixture', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }),
      }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { id: number; result: { tools: { name: string }[] } };
    expect(body.id).toBe(7);
    expect(body.result.tools.map((tool) => tool.name)).toEqual(['deck_get_info']);
    expect(second.created).toEqual([sessionId]);
    expect(second.handler.sessions()).toHaveLength(1);
    expect(second.handler.sessions()[0]).toMatchObject({
      id: sessionId,
      facts: { deck: 'fixture', tools: 1, resumed: true },
    });
    /* the second instance answers the next call on the rebuilt session without another rebuild */
    const call = await second.handler.handle(
      new Request('http://localhost:4321/mcp?deck=fixture', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'deck_get_info', arguments: {} },
        }),
      }),
    );
    expect(call.status).toBe(200);
    const called = (await call.json()) as { result: { structuredContent: { revision: number } } };
    expect(called.result.structuredContent).toMatchObject({ id: 'fixture', revision: 3 });
    expect(second.created).toHaveLength(1);
    /* the notification stream is not rebuilt: the client opens it again after the 404 */
    const third = handlerWith();
    const stream = await third.handler.handle(
      new Request('http://localhost:4321/mcp?deck=fixture', {
        headers: { 'mcp-session-id': sessionId!, accept: 'text/event-stream' },
      }),
    );
    expect(stream.status).toBe(404);
    expect(third.handler.sessions()).toHaveLength(0);
  });

  it('holds a key to its session cap on a rebuilt session as on initialize', async () => {
    const key: KeyBinding = { tokenId: 'k1', ownerId: 'o1', scopes: ['deck:write'], name: 'k' };
    const { handler } = handlerWith({ resolveKey: () => key, sessionsPerKey: 1 });
    await connect(handler, '/mcp?deck=fixture');
    expect(handler.sessions()).toHaveLength(1);
    const over = await handler.handle(
      new Request('http://localhost:4321/mcp?deck=fixture', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': 'opened-elsewhere',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBe('60');
    expect(handler.sessions()).toHaveLength(1);
  });

  it('runs the authorize hook before the transport', async () => {
    const { handler } = handlerWith({ denyToken: true });
    await expect(connect(handler)).rejects.toThrow(/401/);
    const { client } = await connect(handler, '/mcp', { authorization: 'Bearer secret' });
    expect((await client.listTools()).tools).toHaveLength(1);
  });

  describe('the key binding of round three (SPEC-3 3.10, 7.7)', () => {
    const keys: Record<string, KeyBinding> = {
      'Bearer ts_one': {
        tokenId: 'tok_one',
        ownerId: 'usr_kevin',
        scopes: ['read', 'write'],
        name: 'ci',
      },
      'Bearer ts_two': {
        tokenId: 'tok_two',
        ownerId: 'usr_maya',
        scopes: ['read'],
        name: 'reader',
      },
    };
    const resolveKey = (request: Request): KeyBinding | null =>
      keys[request.headers.get('authorization') ?? ''] ?? null;

    it('binds a session to the key record the request resolved and reports it', async () => {
      const { handler } = handlerWith({ resolveKey });
      await connect(handler, '/mcp', { authorization: 'Bearer ts_one' });
      expect(handler.sessions()[0]?.key).toEqual(keys['Bearer ts_one']);
      // the static bearer resolves to no record and binds nothing (the round one rule)
      await connect(handler, '/mcp', { authorization: 'Bearer static' });
      expect(handler.sessions().filter((session) => session.key === undefined)).toHaveLength(1);
    });

    it('caps the sessions one key holds open and answers 429 with Retry-After beyond the cap', async () => {
      const { handler } = handlerWith({ resolveKey, sessionsPerKey: 2 });
      await connect(handler, '/mcp', { authorization: 'Bearer ts_one' });
      await connect(handler, '/mcp', { authorization: 'Bearer ts_one' });
      const third = await handler.handle(
        new Request('http://localhost:4321/mcp', {
          method: 'POST',
          headers: {
            authorization: 'Bearer ts_one',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'x', version: '0' },
            },
          }),
        }),
      );
      expect(third.status).toBe(429);
      expect(third.headers.get('retry-after')).toBe('60');
      // another key is not held back
      await connect(handler, '/mcp', { authorization: 'Bearer ts_two' });
      expect(handler.sessions()).toHaveLength(3);
    });

    it("closes a key's sessions on revoke and refuses a bound session whose key stopped resolving", async () => {
      const live: Record<string, KeyBinding | null> = { ...keys };
      const { handler } = handlerWith({
        resolveKey: (request) => live[request.headers.get('authorization') ?? ''] ?? null,
      });
      const { client } = await connect(handler, '/mcp', { authorization: 'Bearer ts_one' });
      await connect(handler, '/mcp', { authorization: 'Bearer ts_two' });
      expect(await handler.closeByKey('tok_two')).toBe(1);
      expect(handler.sessions().map((session) => session.key?.tokenId)).toEqual(['tok_one']);
      // the key is revoked: the next request of the bound session is 401 and the session closes
      live['Bearer ts_one'] = null;
      await expect(client.listTools()).rejects.toThrow();
      expect(handler.sessions()).toHaveLength(0);
    });
  });
});
