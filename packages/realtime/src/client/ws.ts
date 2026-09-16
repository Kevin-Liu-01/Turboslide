// The WebSocket room transport (gslides-parity SPEC-5 11, SPEC-3 17): the stream's envelope
// unchanged in both directions over one socket, behind `TURBOSLIDE_REALTIME_WS=1`. Down the wire
// the server sends the same frames the SSE stream writes (`hello`, `ops`, `op`, `checkpoint`,
// `presence`, `leave`, `reject`, `inbox`, `access`, `resync`), each as one JSON text message; up
// the wire the client sends `{ kind: 'ops', id, body }` and `{ kind: 'presence', id, body,
// leave }` and reads `{ kind: 'answer', id, status, body }` back, so an ops POST becomes a frame
// and its 409 `since` entries ride in the answer's body the way the route's do. The room client
// (client/room-client.ts) sees a `RoomTransport` and nothing else changes. Off by default; a
// Vercel function never upgrades, so the flag is ignored there; on a checkout the dev sidecar
// (scripts/ws-sidecar.mjs, port 4322) stands in for the node-server preset's upgrade route.
import type { RoomEvent } from '../channel.ts';
import { roomEventOf } from '../protocol.ts';
import type { OpsPost, PresencePost } from '../protocol.ts';
import type { OpsResponse, RoomTransport } from '../../client/room-client.ts';

/** The dev sidecar's port (SPEC-5 11): the studio's dev server plus one. */
export const WS_SIDECAR_PORT = 4322;

/** A request frame the client sends. */
export type WsRequestFrame =
  | { kind: 'ops'; id: number; body: OpsPost }
  | { kind: 'presence'; id: number; body: PresencePost; leave?: true };

/** The server's answer to a request frame: the route's status and JSON body. */
export type WsAnswerFrame = { kind: 'answer'; id: number; status: number; body: unknown };

export type WsTransportOptions = {
  /** the socket URL base: `ws://host:4322` for the sidecar, the page's origin as `wss://` for the node-server preset */
  base: string;
  /** the WebSocket constructor, for tests; `globalThis.WebSocket` when absent */
  socket?: new (url: string) => WebSocketLike;
  /** the ops and presence POSTs while the socket is not open (the SSE transport's fetch pair) */
  fallback?: Pick<RoomTransport, 'postOps' | 'postPresence'>;
};

export type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

const OPEN = 1;

/** The socket URL of a deck's room with the stream's query (`since`, `client`, `retire`). */
export function wsUrl(
  base: string,
  deckId: string,
  options: { since: number; clientId?: string; retire?: readonly string[] },
): string {
  const params = new URLSearchParams();
  params.set('since', String(options.since));
  if (options.clientId !== undefined) params.set('client', options.clientId);
  if (options.retire !== undefined && options.retire.length > 0)
    params.set('retire', options.retire.join(','));
  return `${base.replace(/\/$/, '')}/api/decks/${encodeURIComponent(deckId)}/ws?${params.toString()}`;
}

/** Parses one text message from the server into a room event or an answer frame. */
export function parseWsMessage(data: unknown): RoomEvent | WsAnswerFrame | null {
  if (typeof data !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data) as unknown;
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const frame = raw as Record<string, unknown>;
  if (frame.kind === 'answer' && typeof frame.id === 'number' && typeof frame.status === 'number')
    return { kind: 'answer', id: frame.id, status: frame.status, body: frame.body };
  return roomEventOf({ data });
}

/**
 * The transport: one socket per open, the answers matched to their request ids, the fallback
 * POSTs while the socket is down so a write never waits on a reconnect.
 */
export function wsTransport(deckId: string, options: WsTransportOptions): RoomTransport {
  const Socket =
    options.socket ??
    ((globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket as
      (new (url: string) => WebSocketLike) | undefined);
  if (Socket === undefined) throw new Error('WebSocket is not available in this runtime');
  let socket: WebSocketLike | null = null;
  let nextId = 1;
  const waiting = new Map<number, (answer: WsAnswerFrame) => void>();

  const request = (frame: WsRequestFrame): Promise<WsAnswerFrame> | null => {
    if (socket === null || socket.readyState !== OPEN) return null;
    return new Promise((resolve) => {
      waiting.set(frame.id, resolve);
      socket?.send(JSON.stringify(frame));
    });
  };

  return {
    open({ since, clientId, retire, onEvent, onError }) {
      const ws = new Socket(
        wsUrl(options.base, deckId, {
          since,
          ...(clientId === undefined ? {} : { clientId }),
          ...(retire === undefined ? {} : { retire }),
        }),
      );
      socket = ws;
      ws.onmessage = (event) => {
        const parsed = parseWsMessage(event.data);
        if (parsed === null) return;
        if ('kind' in parsed && parsed.kind === 'answer') {
          const resolve = waiting.get(parsed.id);
          if (resolve !== undefined) {
            waiting.delete(parsed.id);
            resolve(parsed);
          }
          return;
        }
        onEvent(parsed as RoomEvent);
      };
      ws.onerror = () => onError(new Error('the socket closed'));
      ws.onclose = () => {
        if (socket === ws) socket = null;
        for (const [, resolve] of waiting)
          resolve({ kind: 'answer', id: -1, status: 503, body: { message: 'the socket closed' } });
        waiting.clear();
        onError(new Error('the socket closed'));
      };
      return {
        close: () => {
          if (socket === ws) socket = null;
          ws.onclose = null;
          ws.close();
        },
      };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      const answer = request({ kind: 'ops', id: nextId++, body });
      if (answer === null) {
        if (options.fallback !== undefined) return options.fallback.postOps(body);
        return { ok: false, status: 503, code: 'offline', message: 'The socket is not open' };
      }
      const reply = await answer;
      const json = (reply.body ?? {}) as Record<string, unknown>;
      if (reply.status >= 200 && reply.status < 300 && json.ok === true)
        return json as unknown as OpsResponse;
      return {
        ok: false,
        status: reply.status,
        code: typeof json.error === 'string' ? json.error : 'error',
        message:
          typeof json.message === 'string' ? json.message : `The room answered ${reply.status}`,
        ...(typeof json.head === 'number' ? { head: json.head } : {}),
        ...(typeof json.retryAfterMs === 'number' ? { retryAfterMs: json.retryAfterMs } : {}),
        ...(Array.isArray(json.since)
          ? { since: json.since as OpsResponse extends { since?: infer S } ? S : never }
          : {}),
      } as OpsResponse;
    },
    async postPresence(body: PresencePost, presenceOptions = {}) {
      const answer = request({
        kind: 'presence',
        id: nextId++,
        body,
        ...(presenceOptions.leave === true ? { leave: true as const } : {}),
      });
      if (answer === null) {
        if (options.fallback !== undefined)
          await options.fallback.postPresence(body, presenceOptions);
        return;
      }
      await answer;
    },
  };
}
