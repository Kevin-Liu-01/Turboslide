// MCP over streamable HTTP (SPEC 7.3 "streamable HTTP at /mcp in the studio (M4) for hosted
// clients"; MILESTONES M4 item 1). One MCP session is one SDK Server over one
// WebStandardStreamableHTTPServerTransport, created on the initialize request and kept in memory
// under the mcp-session-id the transport hands out; later POSTs, the GET notification stream and
// DELETE find it by that header. The server for a session comes from the host's factory, which
// binds the deck, the author and the tool list (deck_goto_slide only while a studio page is
// attached) at initialize, so the tool list a client reads is the one it can call. This module is
// framework free: it takes a web-standard Request and returns a Response, so the studio route is
// an adapter and the tests drive it through the SDK client with a fetch that calls handle().
import { randomUUID } from 'node:crypto';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export const SESSION_HEADER = 'mcp-session-id';

/** A session that has not carried a request for this long is closed. */
export const DEFAULT_IDLE_MS = 30 * 60_000;

export type McpHttpSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  /** What the factory reported about the session: the deck, the author, the tool count. */
  facts: Record<string, unknown>;
};

export type CreatedSession = {
  server: Server;
  /** Facts for the manifest and the logs (deck id, author, tool names). */
  facts?: Record<string, unknown>;
};

export type McpHttpOptions = {
  /**
   * Builds the server for a new session from the initialize request (its query names the deck and
   * the author). A RangeError (an unknown deck) becomes a 404 JSON-RPC error; anything else a 500.
   */
  createServer: (request: Request, sessionId: string) => Promise<CreatedSession> | CreatedSession;
  /** Refuses a request before it reaches the transport (the bearer token check); undefined lets it through. */
  authorize?: (request: Request) => Response | undefined | Promise<Response | undefined>;
  idleMs?: number;
  /** JSON responses instead of SSE for request and response pairs; default false (SSE, the SDK's default). */
  enableJsonResponse?: boolean;
  log?: (line: string) => void;
  now?: () => number;
};

export type McpHttpHandler = {
  handle: (request: Request) => Promise<Response>;
  sessions: () => McpHttpSession[];
  /** Closes one session, or every session when no id is given. */
  close: (sessionId?: string) => Promise<void>;
};

type Entry = {
  session: McpHttpSession;
  transport: WebStandardStreamableHTTPServerTransport;
  server: Server;
};

function rpcError(status: number, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the body is (or contains) an initialize request. */
export function isInitializeBody(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => isRecord(message) && message.method === 'initialize');
}

export function createMcpHttpHandler(options: McpHttpOptions): McpHttpHandler {
  const entries = new Map<string, Entry>();
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);

  const stamp = (): string => new Date(now()).toISOString();

  const closeEntry = async (entry: Entry): Promise<void> => {
    entries.delete(entry.session.id);
    try {
      await entry.transport.close();
    } catch {
      // already closed by the client
    }
    try {
      await entry.server.close();
    } catch {
      // the server closes with its transport
    }
    log(`mcp http: session ${entry.session.id} closed`);
  };

  const sweep = async (): Promise<void> => {
    for (const entry of [...entries.values()]) {
      if (now() - Date.parse(entry.session.lastSeenAt) > idleMs) await closeEntry(entry);
    }
  };

  const start = async (request: Request, body: unknown): Promise<Response> => {
    const id = randomUUID();
    let created: CreatedSession;
    try {
      created = await options.createServer(request, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof RangeError) return rpcError(404, -32004, message);
      log(`mcp http: createServer failed: ${message}`);
      return rpcError(500, -32603, message);
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      ...(options.enableJsonResponse !== undefined
        ? { enableJsonResponse: options.enableJsonResponse }
        : {}),
      onsessionclosed: (closed) => {
        const entry = entries.get(closed);
        if (entry) void closeEntry(entry);
      },
    });
    const entry: Entry = {
      session: { id, createdAt: stamp(), lastSeenAt: stamp(), facts: created.facts ?? {} },
      transport,
      server: created.server,
    };
    entries.set(id, entry);
    transport.onclose = () => {
      if (entries.get(id) === entry) void closeEntry(entry);
    };
    await created.server.connect(transport);
    log(`mcp http: session ${id} opened (${JSON.stringify(entry.session.facts)})`);
    return transport.handleRequest(request, { parsedBody: body });
  };

  const handler: McpHttpHandler = {
    async handle(request) {
      const denied = await options.authorize?.(request);
      if (denied) return denied;
      await sweep();
      const sessionId = request.headers.get(SESSION_HEADER);
      if (sessionId) {
        const entry = entries.get(sessionId);
        if (!entry)
          return rpcError(404, -32001, `Unknown MCP session ${sessionId}; initialize again`);
        entry.session.lastSeenAt = stamp();
        return entry.transport.handleRequest(request);
      }
      if (request.method !== 'POST') {
        return rpcError(
          400,
          -32000,
          `${request.method} needs an ${SESSION_HEADER} header; POST initialize first`,
        );
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return rpcError(400, -32700, 'the body is not JSON');
      }
      if (!isInitializeBody(body)) {
        return rpcError(
          400,
          -32000,
          `a request without an ${SESSION_HEADER} header must be initialize`,
        );
      }
      return start(request, body);
    },
    sessions() {
      return [...entries.values()].map((entry) => ({
        ...entry.session,
        facts: { ...entry.session.facts },
      }));
    },
    async close(sessionId) {
      if (sessionId !== undefined) {
        const entry = entries.get(sessionId);
        if (entry) await closeEntry(entry);
        return;
      }
      for (const entry of [...entries.values()]) await closeEntry(entry);
    },
  };
  return handler;
}
