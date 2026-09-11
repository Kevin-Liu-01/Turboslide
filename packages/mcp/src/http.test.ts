// MCP over streamable HTTP end to end without a socket: the SDK client's fetch is the handler.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { afterEach, describe, expect, it } from 'vitest';

import { createMcpHttpHandler, isInitializeBody } from './http.ts';
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

function handlerWith(options: { denyToken?: boolean; withView?: boolean } = {}) {
  const created: string[] = [];
  const handler = createMcpHttpHandler({
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

  it('refuses a non-initialize request without a session, an unknown session and an unknown deck', async () => {
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
    const unknown = await handler.handle(
      new Request('http://localhost:4321/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'nope',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(unknown.status).toBe(404);
    const get = await handler.handle(new Request('http://localhost:4321/mcp'));
    expect(get.status).toBe(400);
    await expect(connect(handler, '/mcp?deck=missing')).rejects.toThrow(/404|No deck/);
    expect(isInitializeBody({ jsonrpc: '2.0', method: 'initialize' })).toBe(true);
    expect(isInitializeBody([{ method: 'tools/list' }])).toBe(false);
  });

  it('runs the authorize hook before the transport', async () => {
    const { handler } = handlerWith({ denyToken: true });
    await expect(connect(handler)).rejects.toThrow(/401/);
    const { client } = await connect(handler, '/mcp', { authorization: 'Bearer secret' });
    expect((await client.listTools()).tools).toHaveLength(1);
  });
});
