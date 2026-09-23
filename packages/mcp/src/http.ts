// MCP over streamable HTTP (SPEC 7.3 "streamable HTTP at /mcp in the studio (M4) for hosted
// clients"; MILESTONES M4 item 1). One MCP session is one SDK Server over one
// WebStandardStreamableHTTPServerTransport, created on the initialize request and kept in memory
// under the mcp-session-id the transport hands out; later POSTs, the GET notification stream and
// DELETE find it by that header. The server for a session comes from the host's factory, which
// binds the deck, the author and the tool list (deck_goto_slide only while a studio page is
// attached) at initialize, so the tool list a client reads is the one it can call. This module is
// framework free: it takes a web-standard Request and returns a Response, so the studio route is
// an adapter and the tests drive it through the SDK client with a fetch that calls handle().
// On a deployment of several instances a POST may land on an instance that never saw the
// session's initialize: the session is rebuilt there under the same id from the request itself
// (`resume`), so a tool call after an initialize answered elsewhere no longer reads 404.
//
// Round three binds a session to the API key record the request carries (gslides-parity SPEC-3
// 3.10, 7.7, 0.23): the host's `resolveKey` answers the key's record (B3's resolver over the
// better-auth API key plugin) and the session remembers its `tokenId`, so `account.tokens.revoke`
// closes the key's sessions (`closeByKey`) and a key opens at most 16 sessions at once (a 429 with
// `Retry-After` beyond); the deployment's static bearer resolves to no record and keeps the round
// one behaviour.
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
  /** The API key record the session is bound to (SPEC-3 3.10), when the request carried one. */
  key?: KeyBinding;
};

/** The API key record a request resolved to: the key, its owner, its scopes and its name. */
export type KeyBinding = {
  tokenId: string;
  ownerId: string;
  scopes: readonly string[];
  name: string;
};

/** How many sessions one key may hold open at once (SPEC-3 3.10, 8.3 R5 and R6). */
export const SESSIONS_PER_KEY = 16;

export type CreatedSession = {
  server: Server;
  /** Facts for the manifest and the logs (deck id, author, tool names). */
  facts?: Record<string, unknown>;
};

export type McpHttpOptions = {
  /**
   * Builds the server for a new session from the initialize request (its query names the deck and
   * the author; `key` is the record `resolveKey` answered). A RangeError (an unknown deck) becomes
   * a 404 JSON-RPC error; anything else a 500.
   */
  createServer: (
    request: Request,
    sessionId: string,
    key: KeyBinding | null,
  ) => Promise<CreatedSession> | CreatedSession;
  /**
   * Resolves the request's bearer to an API key record, or null for the static bearer and the
   * localhost rule (SPEC-3 7.7). Runs after `authorize` admitted the request. A later request of a
   * bound session whose key resolves to nothing (a revoked key) is refused with 401 and the
   * session closed.
   */
  resolveKey?: (request: Request) => Promise<KeyBinding | null> | KeyBinding | null;
  sessionsPerKey?: number;
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
  /** Closes every session bound to a key (account.tokens.revoke, SPEC-3 12); answers how many. */
  closeByKey: (tokenId: string) => Promise<number>;
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

  const start = async (
    request: Request,
    body: unknown,
    key: KeyBinding | null,
  ): Promise<Response> => {
    const id = randomUUID();
    if (key !== null) {
      const open = [...entries.values()].filter(
        (entry) => entry.session.key?.tokenId === key.tokenId,
      ).length;
      if (open >= (options.sessionsPerKey ?? SESSIONS_PER_KEY)) {
        const response = rpcError(
          429,
          -32000,
          `this key holds ${open} open MCP sessions; close one or wait for the idle timeout`,
        );
        response.headers.set('retry-after', '60');
        return response;
      }
    }
    let created: CreatedSession;
    try {
      created = await options.createServer(request, id, key);
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
      session: {
        id,
        createdAt: stamp(),
        lastSeenAt: stamp(),
        facts: created.facts ?? {},
        ...(key !== null ? { key } : {}),
      },
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

  /**
   * A session another instance opened (a deployment of several instances: `initialize` answered
   * there and this POST landed here): rebuilt under the same id from the request, which carries
   * everything `createServer` binds (the deck in the query, the author in its header, the key from
   * the bearer), so nothing is lost but this instance's count for the key. The transport answers
   * only after its own initialize, so one is fed to it first and its answer discarded. POST alone:
   * the notification stream (GET) is opened again by the client after a 404, and a DELETE of an
   * unknown session names one that is closed here already. Null leaves the 404 as it was; a key
   * at its session cap answers the same 429 as `start` (the features round's fix round,
   * VERIFICATION.md pass 1 F5; build/b6.md R16).
   */
  const resume = async (
    request: Request,
    sessionId: string,
    key: KeyBinding | null,
  ): Promise<Entry | Response | null> => {
    if (request.method !== 'POST') return null;
    if (key !== null) {
      const open = [...entries.values()].filter(
        (entry) => entry.session.key?.tokenId === key.tokenId,
      ).length;
      if (open >= (options.sessionsPerKey ?? SESSIONS_PER_KEY)) {
        const response = rpcError(
          429,
          -32000,
          `this key holds ${open} open MCP sessions; close one or wait for the idle timeout`,
        );
        response.headers.set('retry-after', '60');
        return response;
      }
    }
    let created: CreatedSession;
    try {
      created = await options.createServer(request, sessionId, key);
    } catch {
      return null;
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      ...(options.enableJsonResponse !== undefined
        ? { enableJsonResponse: options.enableJsonResponse }
        : {}),
      onsessionclosed: (closed) => {
        const entry = entries.get(closed);
        if (entry) void closeEntry(entry);
      },
    });
    const entry: Entry = {
      session: {
        id: sessionId,
        createdAt: stamp(),
        lastSeenAt: stamp(),
        facts: { ...(created.facts ?? {}), resumed: true },
        ...(key !== null ? { key } : {}),
      },
      transport,
      server: created.server,
    };
    entries.set(sessionId, entry);
    transport.onclose = () => {
      if (entries.get(sessionId) === entry) void closeEntry(entry);
    };
    await created.server.connect(transport);
    const protocolVersion = request.headers.get('mcp-protocol-version') ?? '2025-03-26';
    const handshake = new Request(request.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `resume-${sessionId}`,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'resumed', version: '0' },
        },
      }),
    });
    const answer = await transport.handleRequest(handshake);
    await answer.body?.cancel().catch(() => undefined);
    log(`mcp http: session ${sessionId} resumed here (${JSON.stringify(entry.session.facts)})`);
    return entry;
  };

  const handler: McpHttpHandler = {
    async handle(request) {
      const denied = await options.authorize?.(request);
      if (denied) return denied;
      await sweep();
      const key = (await options.resolveKey?.(request)) ?? null;
      const sessionId = request.headers.get(SESSION_HEADER);
      if (sessionId) {
        let entry = entries.get(sessionId);
        if (!entry) {
          const resumed = await resume(request, sessionId, key);
          if (resumed instanceof Response) return resumed;
          entry = resumed ?? undefined;
        }
        if (!entry)
          return rpcError(404, -32001, `Unknown MCP session ${sessionId}; initialize again`);
        if (
          entry.session.key !== undefined &&
          (key === null || key.tokenId !== entry.session.key.tokenId)
        ) {
          // the key was revoked or the request carries another one: the binding is the session's
          await closeEntry(entry);
          return rpcError(
            401,
            -32001,
            'this MCP session was bound to a key that no longer resolves; initialize again',
          );
        }
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
      return start(request, body, key);
    },
    sessions() {
      return [...entries.values()].map((entry) => ({
        ...entry.session,
        facts: { ...entry.session.facts },
        ...(entry.session.key !== undefined ? { key: { ...entry.session.key } } : {}),
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
    async closeByKey(tokenId) {
      let closed = 0;
      for (const entry of [...entries.values()]) {
        if (entry.session.key?.tokenId !== tokenId) continue;
        await closeEntry(entry);
        closed += 1;
      }
      return closed;
    },
  };
  return handler;
}
