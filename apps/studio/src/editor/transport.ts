// The browser's transports of the room (gslides-parity SPEC-3 3.3; docs/CLOUDFLARE.md 3.6.3):
// what the room client (`@turboslide/realtime/client/room-client`) is handed at `attachRoom`.
// Two wires live here. `sseTransport` is the stream route plus the two POST routes, same origin,
// moved out of controller.tsx at the Cloudflare phase's seam with its body unchanged.
// `wsTransport` is the `do` tier's: one WebSocket per `open` to the deck's Durable Object on the
// realtime Worker, the room ticket the editor loader minted as the second subprotocol, the frames
// of `packages/realtime/src/frames.ts` (R1's; `parseDownFrame` reads every frame down, the up
// frames are written here in its shapes), the literal `ping` heartbeat the runtime answers without
// waking the object, the
// ticket refresh at `exp` minus 120 s and at once on a `reauth` frame, the close code map onto
// the room client's `StreamFailure`, and the HTTP belt (`POST /rooms/:id/ops` and `/presence`
// under `Authorization: Ticket`) while the socket is down. `roomTransport` picks one by the
// payload's tier word and holds the switch between them (3.8): the ticket route names the tier
// when the socket is refused for it, the stream route's 503 `tier` names the socket. The room
// client's state machine above the `RoomTransport` contract is unchanged; it owns every reopen.
import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import {
  REOPEN_WAIT_MAX_MS,
  splitSseBlocks,
  streamFailureOf,
} from '@turboslide/realtime/client/room-client';
import type {
  OpenOptions,
  OpsResponse,
  PresenceRefusal,
  Rejected,
  RoomTransport,
  StreamFailure,
  StreamHandle,
} from '@turboslide/realtime/client/room-client';
import {
  CLOSE_CODES,
  HEARTBEAT_REQUEST,
  HEARTBEAT_RESPONSE,
  ROOM_SUBPROTOCOL,
  TICKET_SUBPROTOCOL_PREFIX,
  parseDownFrame,
} from '@turboslide/realtime/frames';
import type { AckFrame } from '@turboslide/realtime/frames';
import {
  entrySchema,
  parseSseBlock,
  rejectReasonSchema,
  roomEventOf,
} from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';

// ---------------------------------------------------------------------------------------------
// The numbers

/**
 * How long one ops POST may take before the room client treats it as failed and resends (the
 * focus round, cycle 2; the transport's `postOps` says what a POST that never answered did).
 * Above the room's own admission time under load (the memory tier's checkpoint at its 10 s hard
 * limit, the blob tier's one second write spacing per deck) and under the browser's own limits.
 * On the socket the same deadline bounds the wait for the `ack` frame.
 */
export const OPS_POST_TIMEOUT_MS = 30_000;
/** The ticket is refreshed this long before it expires (3.3: `exp` minus 120 s). */
export const TICKET_REFRESH_LEAD_MS = 120_000;
/** The shortest wait before a refresh, so a ticket handed out nearly expired is not fetched in a loop. */
export const TICKET_REFRESH_MIN_WAIT_MS = 5000;
/** After this long of failed opens the transport asks the ticket route which tier the deployment runs (3.8). */
export const TRANSPORT_FALLBACK_AFTER_MS = 30_000;
/** The wait a 4429 names when its reason carries none. */
export const BUSY_RETRY_FALLBACK_MS = 5000;
/** The wait a 4503 names when its reason carries none (the stream route's own `retry-after: 30`). */
export const TIER_RETRY_FALLBACK_MS = 30_000;
/** The wait when the ticket route answered but named no socket URL (R2-C3 until it lands). */
export const NO_ROOM_URL_WAIT_MS = 8000;

const SOCKET_OPEN = 1;

// ---------------------------------------------------------------------------------------------
// The room facts of the payload

/**
 * What the editor payload's `room` says that the transports read (write.ts `EditorRoom`; on
 * the `do` tier `url`, `ticket` and `ticketExpiresAt` join it, R1's row in 3.6.1). Read
 * structurally, so a payload from a server without the fields (production today) carries nulls
 * and the SSE transport is chosen.
 */
export type RoomFacts = {
  tier: string | null;
  seq: number | null;
  /** `wss://<host>/rooms/<id>`, or `ws://` on a checkout with TURBOSLIDE_ROOM_INSECURE=1 */
  url: string | null;
  ticket: string | null;
  /** epoch milliseconds */
  ticketExpiresAt: number | null;
};

/** An expiry as a number of epoch milliseconds or an ISO string; null for anything else. */
export function expiresAtOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value !== '') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function roomFactsOf(room: unknown): RoomFacts {
  const row: Record<string, unknown> =
    typeof room === 'object' && room !== null ? (room as Record<string, unknown>) : {};
  return {
    tier: typeof row.tier === 'string' ? row.tier : null,
    seq: typeof row.seq === 'number' && Number.isFinite(row.seq) ? row.seq : null,
    url: typeof row.url === 'string' && /^wss?:\/\/[^/]+\//.test(row.url) ? row.url : null,
    ticket: typeof row.ticket === 'string' && row.ticket !== '' ? row.ticket : null,
    ticketExpiresAt: expiresAtOf(row.ticketExpiresAt ?? row.expiresAt),
  };
}

/** The HTTP origin of a socket URL (`wss://` to `https://`, `ws://` to `http://`), for the belt; null for a bad URL. */
export function httpOriginOf(socketUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(socketUrl);
  } catch {
    return null;
  }
  if (url.protocol === 'wss:') return `https://${url.host}`;
  if (url.protocol === 'ws:') return `http://${url.host}`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// The close codes

/**
 * A failure as the socket transport reports it: the room client's `StreamFailure` plus what the
 * wrapper reads for its switch between the two wires (the tier the ticket route named, the
 * close code).
 */
export type TransportFailure = StreamFailure & {
  /** the tier the ticket route named when the open was refused for the tier (3.8) */
  tier?: string;
  /** the socket's close code, when the failure was a close */
  closeCode?: number;
};

/** The wait a close reason carries (`retry-after: 30`, `retry-after=30`, or JSON `retryAfter` seconds or `retryAfterMs`), in milliseconds. */
export function retryAfterMsOf(reason: string): number | undefined {
  const text = reason.trim();
  if (text === '') return undefined;
  if (text.startsWith('{')) {
    try {
      const row = JSON.parse(text) as Record<string, unknown>;
      if (typeof row.retryAfterMs === 'number' && row.retryAfterMs >= 0) return row.retryAfterMs;
      if (typeof row.retryAfter === 'number' && row.retryAfter >= 0) return row.retryAfter * 1000;
    } catch {
      return undefined;
    }
    return undefined;
  }
  const match = /retry-after\s*[:=]\s*(\d+)/i.exec(text);
  return match?.[1] === undefined ? undefined : Number(match[1]) * 1000;
}

/** The code word a close reason carries (JSON `error`, or a bare `snake_case` word), or undefined. */
export function reasonCodeOf(reason: string): string | undefined {
  const text = reason.trim();
  if (text.startsWith('{')) {
    try {
      const row = JSON.parse(text) as Record<string, unknown>;
      return typeof row.error === 'string' && row.error !== '' ? row.error : undefined;
    } catch {
      return undefined;
    }
  }
  return /^[a-z][a-z0-9_]*$/.test(text) ? text : undefined;
}

/**
 * The close code map (3.6.3; frames.ts `CLOSE_CODES`): 4401 and 4403 fetch a ticket and reopen at
 * once (a 4403 whose ticket route then answers 403 lands on the room client's refused path, the
 * 8 s wait, through the open's own failure); 4409 stops the
 * older tab's reopen for REOPEN_WAIT_MAX_MS; 4429 is a 503 with the wait the reason names
 * (`retry-after=<seconds>`); 4503 is the tier's 503, and the wrapper asks the ticket route which
 * tier before the client reopens; 4500 (an error inside the object) and any other code take the
 * client's ladder (a failure without a status).
 */
export function closeFailure(code: number, reason: string): TransportFailure {
  const retryAfterMs = retryAfterMsOf(reason);
  const word = reasonCodeOf(reason);
  switch (code) {
    case CLOSE_CODES.ticket:
      return {
        status: 401,
        code: word ?? 'ticket',
        retryAfterMs: 0,
        message: 'The room asked for a new ticket',
        closeCode: code,
      };
    case CLOSE_CODES.forbidden:
      // a fresh ticket at once: the ticket route's own 403 is what lands on the refused path
      return {
        status: 403,
        code: word ?? 'forbidden',
        retryAfterMs: 0,
        message: 'The room refused this tab’s access',
        closeCode: code,
      };
    case CLOSE_CODES.superseded:
      return {
        status: 409,
        code: 'superseded',
        retryAfterMs: REOPEN_WAIT_MAX_MS,
        message: 'A newer socket of this tab took over',
        closeCode: code,
      };
    case CLOSE_CODES.capped:
      return {
        status: 503,
        code: word ?? 'too_many_streams',
        retryAfterMs: retryAfterMs ?? BUSY_RETRY_FALLBACK_MS,
        message: 'The room has no slot for this tab yet',
        closeCode: code,
      };
    case CLOSE_CODES.tier:
      return {
        status: 503,
        code: 'tier',
        retryAfterMs: retryAfterMs ?? TIER_RETRY_FALLBACK_MS,
        message: 'The room is off on this deployment',
        closeCode: code,
      };
    default:
      return {
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        message: `the socket closed (${code})`,
        closeCode: code,
      };
  }
}

// ---------------------------------------------------------------------------------------------
// The frames (frames.ts's shapes; the ack's body and the belt's body are one `OpsResponse`)

function rejectedOf(value: unknown): Rejected[] | null {
  if (!Array.isArray(value)) return null;
  const out: Rejected[] = [];
  for (const row of value) {
    if (typeof row !== 'object' || row === null) return null;
    const item = row as Record<string, unknown>;
    const reason = rejectReasonSchema.safeParse(item.reason);
    if (typeof item.opId !== 'string' || !reason.success) return null;
    out.push({
      opId: item.opId,
      reason: reason.data,
      ...(typeof item.message === 'string' ? { message: item.message } : {}),
    });
  }
  return out;
}

function entriesOf(value: unknown): Entry[] | null {
  if (!Array.isArray(value)) return null;
  const out: Entry[] = [];
  for (const row of value) {
    const parsed = entrySchema.safeParse(row);
    if (!parsed.success) return null;
    out.push(parsed.data);
  }
  return out;
}

/** The belt's answer body as an `OpsResponse` (the shape the ops route and the ack share), or null when it is not the protocol's. */
export function opsResponseOf(raw: Record<string, unknown>): OpsResponse | null {
  if (raw.ok === true) {
    const entries = entriesOf(raw.entries);
    const rejected = rejectedOf(raw.rejected ?? []);
    const between = raw.between === undefined ? undefined : entriesOf(raw.between);
    if (
      entries === null ||
      rejected === null ||
      between === null ||
      typeof raw.head !== 'number' ||
      typeof raw.revision !== 'number'
    )
      return null;
    return {
      ok: true,
      entries,
      rejected,
      head: raw.head,
      revision: raw.revision,
      ...(between === undefined ? {} : { between }),
    };
  }
  if (raw.ok === false) {
    if (typeof raw.status !== 'number') return null;
    return {
      ok: false,
      status: raw.status,
      code: typeof raw.code === 'string' ? raw.code : 'error',
      message: typeof raw.message === 'string' ? raw.message : `The room answered ${raw.status}`,
      ...(typeof raw.head === 'number' ? { head: raw.head } : {}),
      ...(typeof raw.retryAfterMs === 'number' ? { retryAfterMs: raw.retryAfterMs } : {}),
    };
  }
  return null;
}

/** The `ack` frame minus its envelope: the `OpsResponse` the room client settles its POST with. */
export function ackResponseOf(frame: AckFrame): OpsResponse {
  if (frame.ok) {
    return {
      ok: true,
      entries: frame.entries,
      rejected: frame.rejected,
      head: frame.head,
      revision: frame.revision,
      ...(frame.between === undefined ? {} : { between: frame.between }),
    };
  }
  return {
    ok: false,
    status: frame.status,
    code: frame.code,
    message: frame.message,
    ...(frame.head === undefined ? {} : { head: frame.head }),
    ...(frame.retryAfterMs === undefined ? {} : { retryAfterMs: frame.retryAfterMs }),
  };
}

/** The presence body minus its clock, so a heartbeat that changed nothing is the literal `ping`. */
export function presenceKeyOf(body: PresencePost): string {
  const rest: Record<string, unknown> = { ...body };
  delete rest.clock;
  return JSON.stringify(rest);
}

// ---------------------------------------------------------------------------------------------
// The dependencies a transport takes (the browser's by default; the tests inject theirs)

/**
 * What the socket transport needs of a `WebSocket`. The handler slots are typed with `never`
 * parameters so the browser's class, whose slots take `Event`, `MessageEvent` and `CloseEvent`,
 * is assignable here and a handler written against the fields it reads is assignable to them.
 */
export type SocketLike = {
  readonly readyState: number;
  readonly protocol: string;
  onopen: ((event: never) => void) | null;
  onmessage: ((event: never) => void) | null;
  onclose: ((event: never) => void) | null;
  onerror: ((event: never) => void) | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

export type SocketCtor = new (url: string, protocols?: string | string[]) => SocketLike;

export type TransportTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type TransportDeps = {
  fetch?: typeof globalThis.fetch;
  WebSocket?: SocketCtor;
  now?: () => number;
  timers?: TransportTimers;
  /** the window whose `offline` event closes the stream; null for none (the tests) */
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  /** the browser's word on the network, `navigator.onLine` by default */
  online?: () => boolean;
};

function fetchOf(deps: TransportDeps): typeof globalThis.fetch {
  return deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
}

function windowOf(deps: TransportDeps): TransportDeps['window'] {
  if (deps.window !== undefined) return deps.window;
  return typeof window === 'undefined' ? null : window;
}

function onlineOf(deps: TransportDeps): () => boolean {
  return (
    deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  );
}

const GLOBAL_TIMERS: TransportTimers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// ---------------------------------------------------------------------------------------------
// The SSE transport (controller.tsx 316 to 492 before the Cloudflare phase's seam)

/**
 * The browser's transport of the room (SPEC-3 3.3): a streamed fetch down, fetch up, same origin.
 *
 * The stream was an EventSource until the focus round's cycle 3 stream fix round (VERIFICATION.md
 * C3-F1): the browser reconnected it on its own, exposed neither the status nor the `retry-after`
 * of a refused open (the route's 503 `too_many_streams`), and the room client learnt only that
 * "the stream closed", so nobody read the wait and the reopen was left to the browser. The room
 * client owns the reopen now (room-client.ts `reopenStream`), so the transport opens one stream
 * per `open`, reports once how it ended, and reconnects nothing. A fetch with
 * `accept: text/event-stream` gives the status and the headers of a refusal directly and the same
 * bytes as the EventSource otherwise (the route's frames, parsed by protocol.ts `parseSseBlock`
 * over `splitSseBlocks`); its abort is the close the server sees. This was the smaller change
 * against an EventSource plus a second fetch to probe the status: one connection per open, no
 * probe that itself takes a slot, and no EventSource reconnect to suppress.
 */
export function sseTransport(deckId: string, tab: string, deps: TransportDeps = {}): RoomTransport {
  const base = `/api/decks/${encodeURIComponent(deckId)}`;
  const fetchImpl = fetchOf(deps);
  const listenerWindow = windowOf(deps);
  return {
    kind: () => 'sse',
    open({ since, retire, onEvent, onError }) {
      // the tab's earlier ids ride every open (a reconnect too), so the instance the stream lands
      // on drops their roster rows and releases their stream slots before hello (hotfix 2 cause
      // B1; C3-F1); the tab's token rides too, so the instance releases the tab's earlier slots
      // it holds under no id the tab knows (an open aborted before its hello, another deck's
      // stream of this tab; C3S-F2)
      const retiring =
        retire === undefined || retire.length === 0
          ? ''
          : `&retire=${retire.map((id) => encodeURIComponent(id)).join(',')}`;
      const tabbed = `&tab=${encodeURIComponent(tab)}`;
      const aborter = new AbortController();
      let done = false;
      // the browser's offline event ends the stream (the seam step of the cycle 3 stream fix
      // round): an established socket can stay open and silent long after the network went (a
      // laptop that changed networks; Playwright's offline emulation keeps an open stream's bytes
      // flowing while every new request fails), so the tab takes the browser's word as the
      // stream's end and the room client reopens it on its ladder once the network is back
      const onOffline = (): void => {
        aborter.abort();
        end({ message: 'the browser went offline' });
      };
      const listening = listenerWindow !== null && listenerWindow !== undefined;
      if (listening) listenerWindow.addEventListener('offline', onOffline);
      const end = (failure: StreamFailure): void => {
        if (listening) listenerWindow.removeEventListener('offline', onOffline);
        if (done) return;
        done = true;
        onError(failure);
      };
      void (async () => {
        let response: Response;
        try {
          response = await fetchImpl(`${base}/stream?since=${since}${retiring}${tabbed}`, {
            headers: { accept: 'text/event-stream' },
            cache: 'no-store',
            signal: aborter.signal,
          });
        } catch {
          // the network refused the connection (offline, a dropped socket): no status to read
          if (!aborter.signal.aborted) end({ message: 'the stream did not open' });
          return;
        }
        if (!response.ok || response.body === null) {
          // a refused open: the status, the body's code, the wait the route named and the
          // client id it minted (the room client posts under it while it waits for a slot)
          const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const retry = response.headers.get('retry-after');
          const retryAfterMs = retry === null ? NaN : Number(retry) * 1000;
          end({
            status: response.status,
            code: typeof json.error === 'string' ? json.error : 'error',
            ...(Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}),
            ...(typeof json.clientId === 'string' ? { clientId: json.clientId } : {}),
            message: `The stream answered ${response.status}`,
          });
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let rest = '';
        let retryMs: number | undefined;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const split = splitSseBlocks(rest + decoder.decode(chunk.value, { stream: true }));
            rest = split.rest;
            for (const block of split.blocks) {
              const parsed = parseSseBlock(block);
              if (parsed === null) continue;
              if (parsed.retry !== undefined) retryMs = parsed.retry;
              const event = roomEventOf(parsed);
              if (event !== null && !done) onEvent(event);
            }
          }
        } catch {
          // the connection dropped mid stream, or this tab aborted it
        }
        if (aborter.signal.aborted) return;
        // the stream ended (its lifetime, the server, the network): the server's `retry` is the
        // wait before the next open when it sent one
        end({
          ...(retryMs === undefined ? {} : { retryAfterMs: retryMs }),
          message: 'the stream closed',
        });
      })();
      return {
        close: () => {
          done = true;
          if (listening) listenerWindow.removeEventListener('offline', onOffline);
          aborter.abort();
        },
      };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      // a deadline on the write (the focus round, cycle 2): a POST that never answers (an
      // instance whose deck queue is held, VERIFICATION F-stall; a dev server that reloaded its
      // program under the request) left the room client's `posting` unsettled, so `flush()`
      // and every `idle()` caller after it (a version.restore, a named version, an asset
      // action) waited for good with no sentence anywhere (VERIFICATION F-versions, "restore
      // changed the deck false"). A timed out POST throws, the client marks itself offline and
      // resends with its op ids, which the room deduplicates against the stream's tail
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPS_POST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchImpl(`${base}/ops`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && json.ok === true) return json as unknown as OpsResponse;
      const retry = response.headers.get('retry-after');
      return {
        ok: false,
        status: response.status,
        code: typeof json.error === 'string' ? json.error : 'error',
        message:
          typeof json.message === 'string' ? json.message : `The room answered ${response.status}`,
        ...(typeof json.head === 'number' ? { head: json.head } : {}),
        ...(retry !== null ? { retryAfterMs: Number(retry) * 1000 } : {}),
      };
    },
    async postPresence(body: PresencePost, options = {}) {
      const response = await fetchImpl(
        `${base}/presence${options.leave === true ? '?leave=1' : ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: options.leave === true,
        },
      );
      /* a server from before the realtime round refuses a presence field it does not know
         (`unknown_field`, the presence route's 400 with the object's pointer and the keys): the
         refusal is thrown in the shape the room client reads (`presenceRefusalOf`), which drops
         that field for the session and posts the state again at once, so a tab served by an
         older deployment during an alias switch or an Instant Rollback keeps its row alive
         (realtime/build/r2.md R2-R4; docs/REALTIME.md 3.7). Any other answer is as before: a
         lost batch the next state replaces. A leave beacon's answer is never read. */
      if (options.leave === true || response.status !== 400) return;
      const refusal = await presenceRefusalFrom(response);
      if (refusal !== null) throw refusal;
    },
  };
}

/** The presence route's 400 `unknown_field` body as the thrown refusal (room-client.ts `presenceRefusalOf` reads it), or null for any other 400. */
async function presenceRefusalFrom(response: Response): Promise<PresenceRefusal | null> {
  const answer: unknown = await response.json().catch(() => null);
  if (typeof answer !== 'object' || answer === null) return null;
  const row = answer as { error?: unknown; pointer?: unknown; keys?: unknown; message?: unknown };
  if (row.error !== 'unknown_field') return null;
  return {
    status: 400,
    code: 'unknown_field',
    ...(typeof row.pointer === 'string' ? { pointer: row.pointer } : {}),
    ...(Array.isArray(row.keys)
      ? { keys: row.keys.filter((key): key is string => typeof key === 'string') }
      : {}),
    ...(typeof row.message === 'string' ? { message: row.message } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// The socket transport (docs/CLOUDFLARE.md 3.6.3)

/**
 * The ticket route's answer (`decks.$deckId.ticket.ts`): `{ ticket, expiresAt, tier, url }` on the
 * `do` tier, `{ tier }` alone on another tier (the hand off of 3.8), which the transport reads as
 * the word to switch to; `ticket` is null then.
 */
export type TicketAnswer = {
  ticket: string | null;
  expiresAt: number | null;
  tier: string | null;
  url: string | null;
};

type TicketRead =
  { ok: true; answer: TicketAnswer } | { ok: false; status: number; code: string; message: string };

export type SocketTransport = RoomTransport & {
  kind: () => 'ws';
  /** the socket URL the transport opens (the payload's, or the ticket route's), or null while none is known */
  url: () => string | null;
  /** the client id the last hello named, for the ticket refresh and the tests */
  clientId: () => string | null;
  /** forget the ticket: the next open and the next belt call fetch one first */
  markTicketStale: () => void;
  /** asks the ticket route; answers the tier it names (keeping the ticket), or null when it refused or did not answer */
  readTier: () => Promise<string | null>;
  /** whether the next open carries the ticket in the first frame instead of the subprotocol (the fallback of 3.3) */
  joinFallback: () => boolean;
  /** stops the refresh timer and closes the socket; nothing reconnects after this */
  dispose: () => void;
};

export function wsTransport(
  deckId: string,
  tab: string,
  room: RoomFacts,
  deps: TransportDeps = {},
): SocketTransport {
  const fetchImpl = fetchOf(deps);
  const timers = deps.timers ?? GLOBAL_TIMERS;
  const now = deps.now ?? (() => Date.now());
  const online = onlineOf(deps);
  const listenerWindow = windowOf(deps);
  const ticketBase = `/api/decks/${encodeURIComponent(deckId)}/ticket`;
  let socketUrl: string | null = room.url;
  let ticket: { token: string; expiresAt: number | null } | null =
    room.ticket === null ? null : { token: room.ticket, expiresAt: room.ticketExpiresAt };
  /** the tier the ticket route last named; null before it answered */
  let ticketTier: string | null = null;
  /** the ticket must be fetched again before it is used (a 4401, a 4403, a 401 on the belt) */
  let stale = false;
  let clientId: string | null = null;
  /** the socket in use: open or opening; null while none */
  let current: SocketLike | null = null;
  /** the ticket rides the first frame instead of the subprotocol (3.3's fallback) */
  let joinMode = false;
  let lastPresenceKey: string | null = null;
  let refreshTimer: unknown;
  let ticketFlight: Promise<TicketRead> | null = null;
  let reqCounter = 0;
  let disposed = false;
  type Ack = {
    resolve: (response: OpsResponse) => void;
    reject: (error: Error) => void;
    timer: unknown;
    socket: SocketLike;
  };
  /** the ops frames awaiting their ack, by `req` (a positive integer per socket transport, frames.ts) */
  const acks = new Map<number, Ack>();

  const expired = (): boolean =>
    ticket !== null && ticket.expiresAt !== null && ticket.expiresAt <= now();
  const needsTicket = (): boolean => ticket === null || stale || expired();

  const rejectAcks = (socket: SocketLike, reason: string): void => {
    for (const [req, ack] of [...acks]) {
      if (ack.socket !== socket) continue;
      acks.delete(req);
      timers.clearTimeout(ack.timer);
      ack.reject(new Error(reason));
    }
  };

  const clearRefresh = (): void => {
    if (refreshTimer !== undefined) timers.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  };

  /** The refresh at `exp` minus 120 s (3.3), armed while a socket is in use. */
  const armRefresh = (): void => {
    clearRefresh();
    if (disposed || current === null || ticket === null || ticket.expiresAt === null) return;
    const wait = Math.max(
      TICKET_REFRESH_MIN_WAIT_MS,
      ticket.expiresAt - TICKET_REFRESH_LEAD_MS - now(),
    );
    refreshTimer = timers.setTimeout(() => {
      refreshTimer = undefined;
      void refreshTicket();
    }, wait);
  };

  /** One call of the ticket route at a time; the answer replaces the ticket and the URL it names. */
  const fetchTicket = (): Promise<TicketRead> => {
    if (ticketFlight !== null) return ticketFlight;
    ticketFlight = (async (): Promise<TicketRead> => {
      const query = clientId === null ? '' : `?client=${encodeURIComponent(clientId)}`;
      let response: Response;
      try {
        response = await fetchImpl(`${ticketBase}${query}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
      } catch {
        return {
          ok: false,
          status: 0,
          code: 'network',
          message: 'the ticket route did not answer',
        };
      }
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const tier = typeof json.tier === 'string' ? json.tier : null;
      const token = typeof json.ticket === 'string' && json.ticket !== '' ? json.ticket : null;
      if (!response.ok || (token === null && tier === null)) {
        return {
          ok: false,
          status: response.status,
          code: typeof json.error === 'string' ? json.error : 'error',
          message:
            typeof json.message === 'string'
              ? json.message
              : `The ticket route answered ${response.status}`,
        };
      }
      const answer: TicketAnswer = {
        ticket: token,
        expiresAt: expiresAtOf(json.expiresAt),
        tier,
        url: typeof json.url === 'string' && /^wss?:\/\/[^/]+\//.test(json.url) ? json.url : null,
      };
      ticketTier = tier;
      if (token !== null) {
        ticket = { token, expiresAt: answer.expiresAt };
        stale = false;
        if (answer.url !== null) socketUrl = answer.url;
        armRefresh();
      }
      return { ok: true, answer };
    })().finally(() => {
      ticketFlight = null;
    });
    return ticketFlight;
  };

  /** The refresh (the timer, a `reauth` frame): a new token up the open socket as `{ t: 'ticket' }`. */
  const refreshTicket = async (): Promise<void> => {
    if (disposed) return;
    const got = await fetchTicket();
    if (!got.ok) {
      // refused or unreachable: the object closes the socket with 4403 after its grace, or
      // 4401 past the expiry, and the next open asks the route again
      stale = true;
      return;
    }
    if (got.answer.ticket !== null && current !== null && current.readyState === SOCKET_OPEN)
      current.send(JSON.stringify({ t: 'ticket', ticket: got.answer.ticket }));
  };

  const httpOrigin = (): string | null => (socketUrl === null ? null : httpOriginOf(socketUrl));

  /** The belt's ticket: the one held, or a fresh one; a refusal is answered as the room client's refusal shape. */
  const beltTicket = async (): Promise<
    { ok: true; token: string } | { ok: false; response: OpsResponse & { ok: false } }
  > => {
    if (!needsTicket() && ticket !== null) return { ok: true, token: ticket.token };
    const got = await fetchTicket();
    if (!got.ok) {
      if (got.status === 0) throw new Error(got.message);
      return {
        ok: false,
        response: { ok: false, status: got.status, code: got.code, message: got.message },
      };
    }
    if (got.answer.ticket === null) {
      // the instance runs another tier: the wrapper switches at the next open; the ops stay
      // pending and go again after the client's backoff
      return {
        ok: false,
        response: {
          ok: false,
          status: 503,
          code: 'tier',
          message: `The deployment runs the ${got.answer.tier ?? 'other'} tier`,
          retryAfterMs: 1000,
        },
      };
    }
    return { ok: true, token: got.answer.ticket };
  };

  const sendOps = (socket: SocketLike, body: OpsPost): Promise<OpsResponse> => {
    reqCounter += 1;
    const req = reqCounter;
    return new Promise<OpsResponse>((resolve, reject) => {
      const timer = timers.setTimeout(() => {
        acks.delete(req);
        reject(new Error(`the ops frame was not acknowledged within ${OPS_POST_TIMEOUT_MS} ms`));
      }, OPS_POST_TIMEOUT_MS);
      acks.set(req, { resolve, reject, timer, socket });
      try {
        socket.send(JSON.stringify({ t: 'ops', req, ...body }));
      } catch (error) {
        acks.delete(req);
        timers.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('the ops frame was not sent'));
      }
    });
  };

  const transport: SocketTransport = {
    kind: () => 'ws',
    url: () => socketUrl,
    clientId: () => clientId,
    markTicketStale: () => {
      stale = true;
    },
    joinFallback: () => joinMode,
    async readTier() {
      const got = await fetchTicket();
      return got.ok ? got.answer.tier : null;
    },
    dispose() {
      disposed = true;
      clearRefresh();
      const socket = current;
      current = null;
      if (socket !== null) {
        rejectAcks(socket, 'the transport was disposed');
        socket.close(1000, 'disposed');
      }
    },
    open({ since, retire, onEvent, onError, onResend, onRoom }: OpenOptions): StreamHandle {
      let done = false;
      let opened = false;
      let socket: SocketLike | null = null;
      const listening = listenerWindow !== null && listenerWindow !== undefined;
      const onOffline = (): void => {
        socket?.close(1000, 'offline');
        end({ message: 'the browser went offline' });
      };
      if (listening) listenerWindow.addEventListener('offline', onOffline);
      const end = (failure: TransportFailure): void => {
        if (listening) listenerWindow.removeEventListener('offline', onOffline);
        if (done) return;
        done = true;
        if (socket !== null) {
          rejectAcks(socket, failure.message);
          if (current === socket) {
            current = null;
            clearRefresh();
          }
        }
        onError(failure);
      };
      void (async () => {
        if (disposed) {
          end({ message: 'the transport was disposed' });
          return;
        }
        if (needsTicket()) {
          const got = await fetchTicket();
          if (done) return;
          if (!got.ok) {
            end({
              ...(got.status === 0 ? {} : { status: got.status }),
              code: got.code,
              message: got.message,
            });
            return;
          }
        }
        if (ticketTier !== null && ticketTier !== 'do') {
          // the instance runs another tier (the hand off of 3.8): the wrapper reads `tier`
          // and switches to the stream route at once
          end({
            status: 503,
            code: 'tier',
            tier: ticketTier,
            retryAfterMs: 0,
            message: `The deployment runs the ${ticketTier} tier`,
          });
          return;
        }
        if (socketUrl === null || ticket === null) {
          end({
            status: 503,
            code: 'no_room_url',
            retryAfterMs: NO_ROOM_URL_WAIT_MS,
            message: 'The room named no socket URL',
          });
          return;
        }
        const token = ticket.token;
        const retiring =
          retire === undefined || retire.length === 0
            ? ''
            : `&retire=${retire.map((id) => encodeURIComponent(id)).join(',')}`;
        const url = `${socketUrl}?since=${since}&tab=${encodeURIComponent(tab)}${retiring}`;
        const protocols = joinMode
          ? [ROOM_SUBPROTOCOL]
          : [ROOM_SUBPROTOCOL, `${TICKET_SUBPROTOCOL_PREFIX}${token}`];
        const Ctor: SocketCtor | undefined =
          deps.WebSocket ?? (typeof WebSocket === 'undefined' ? undefined : WebSocket);
        if (Ctor === undefined) {
          end({ message: 'no WebSocket in this environment' });
          return;
        }
        let ws: SocketLike;
        try {
          ws = new Ctor(url, protocols);
        } catch {
          end({ message: 'the socket could not be made' });
          return;
        }
        socket = ws;
        current = ws;
        lastPresenceKey = null;
        armRefresh();
        ws.onopen = () => {
          opened = true;
          // the fallback carrier (3.3): the ticket as the first frame within 5 s of the upgrade
          if (joinMode) ws.send(JSON.stringify({ t: 'join', ticket: token }));
        };
        ws.onerror = () => {
          // the close that follows carries the code
        };
        ws.onmessage = (event: { data: unknown }) => {
          if (done || typeof event.data !== 'string') return;
          // the auto response pair's answer is not JSON and never reaches the parser
          if (event.data === HEARTBEAT_RESPONSE) return;
          const frame = parseDownFrame(event.data);
          if (frame === null) return;
          switch (frame.kind) {
            case 'event':
              if (frame.event.type === 'hello') clientId = frame.event.clientId;
              onEvent(frame.event);
              return;
            case 'ack': {
              const ack = acks.get(frame.frame.req);
              if (ack === undefined) return;
              acks.delete(frame.frame.req);
              timers.clearTimeout(ack.timer);
              ack.resolve(ackResponseOf(frame.frame));
              return;
            }
            case 'reauth':
              // an access change (3.3): a fresh ticket up the socket within the object's grace
              void refreshTicket();
              return;
            case 'resend':
              // a woken object asks for the presence again: the hello's own path (3.6.3); the
              // object holds no state of this socket, so the next post is the whole frame and
              // never the heartbeat's ping
              lastPresenceKey = null;
              onResend?.();
              return;
            case 'presence-refused':
              // the object dropped one presence frame (the 15 a second budget, a stale clock, a
              // state its schema refused): the next state goes whole, as a lost batch's next one does
              lastPresenceKey = null;
              return;
            case 'room':
              onRoom?.({
                colo: frame.frame.colo,
                object: frame.frame.object,
                idleMs: frame.frame.idleMs,
                maxMs: frame.frame.maxMs,
              });
              return;
          }
        };
        ws.onclose = (event: { code: number; reason: string; wasClean: boolean }) => {
          if (done) return;
          // a close before `open` with no server code while the browser is online is an
          // upgrade the server refused: the carriage of the ticket alternates between the
          // subprotocol and the first frame on the next open (3.3's fallback), so the client
          // converges on the one the Worker takes at the cost of one open
          if (!opened && event.code === 1006 && online()) joinMode = !joinMode;
          const failure = closeFailure(event.code, event.reason);
          if (
            failure.closeCode === CLOSE_CODES.ticket ||
            failure.closeCode === CLOSE_CODES.forbidden ||
            failure.closeCode === CLOSE_CODES.tier
          )
            stale = true;
          end(failure);
        };
      })();
      return {
        close() {
          if (listening) listenerWindow.removeEventListener('offline', onOffline);
          done = true;
          if (socket === null) return;
          rejectAcks(socket, 'the stream was closed by the tab');
          if (current === socket) {
            current = null;
            clearRefresh();
          }
          socket.close(1000, 'closed by the tab');
        },
      };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      const ws = current;
      if (ws !== null && ws.readyState === SOCKET_OPEN) return sendOps(ws, body);
      // the HTTP belt while the socket is down (3.6.3): the same answer shape, the ticket as a
      // header, the room client's deadline
      const origin = httpOrigin();
      if (origin === null) throw new Error('the room named no host for the belt');
      const got = await beltTicket();
      if (!got.ok) return got.response;
      const controller = new AbortController();
      const timer = timers.setTimeout(() => controller.abort(), OPS_POST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchImpl(`${origin}/rooms/${encodeURIComponent(deckId)}/ops`, {
          method: 'POST',
          headers: {
            authorization: `Ticket ${got.token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        timers.clearTimeout(timer);
      }
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.status === 401) stale = true;
      if (response.ok && json.ok === true)
        return opsResponseOf(json) ?? (json as unknown as OpsResponse);
      if (json.ok === false && typeof json.status === 'number')
        return opsResponseOf(json) ?? (json as unknown as OpsResponse);
      const retry = response.headers.get('retry-after');
      return {
        ok: false,
        status: response.status,
        code: typeof json.error === 'string' ? json.error : 'error',
        message:
          typeof json.message === 'string' ? json.message : `The room answered ${response.status}`,
        ...(typeof json.head === 'number' ? { head: json.head } : {}),
        ...(retry !== null ? { retryAfterMs: Number(retry) * 1000 } : {}),
      };
    },
    async postPresence(body: PresencePost, options = {}): Promise<void> {
      const ws = current;
      const open = ws !== null && ws.readyState === SOCKET_OPEN;
      if (options.leave === true) {
        if (open) {
          // the socket is the client's: the object knows whose leave this is (frames.ts leaveFrame)
          ws.send(JSON.stringify({ t: 'leave', clock: body.clock }));
          return;
        }
        // the socket is down: the leave rides a keepalive fetch with the ticket as its header
        // (a keepalive fetch carries headers; sendBeacon is what cannot, and is not used); the
        // object's webSocketClose ran the leave already when the socket was the one that went
        const origin = httpOrigin();
        if (origin === null || ticket === null) return;
        await fetchImpl(`${origin}/rooms/${encodeURIComponent(deckId)}/presence?leave=1`, {
          method: 'POST',
          headers: { authorization: `Ticket ${ticket.token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => undefined);
        return;
      }
      if (open) {
        const key = presenceKeyOf(body);
        if (key === lastPresenceKey) {
          // nothing but the clock moved: the heartbeat is the literal `ping`, which the runtime
          // answers with `pong` without waking the object (3.2)
          ws.send(HEARTBEAT_REQUEST);
          return;
        }
        ws.send(JSON.stringify({ t: 'presence', ...body }));
        lastPresenceKey = key;
        return;
      }
      const origin = httpOrigin();
      if (origin === null) return;
      const got = await beltTicket().catch(() => null);
      if (got === null || !got.ok) return;
      const response = await fetchImpl(`${origin}/rooms/${encodeURIComponent(deckId)}/presence`, {
        method: 'POST',
        headers: { authorization: `Ticket ${got.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 401) stale = true;
      if (response.status !== 400) return;
      const refusal = await presenceRefusalFrom(response);
      if (refusal !== null) throw refusal;
    },
  };
  return transport;
}

// ---------------------------------------------------------------------------------------------
// The choice and the switch (3.6.3, 3.8)

/**
 * The transport `attachRoom` hands the room client: the socket transport when the payload's
 * room says `do`, the SSE transport otherwise, and the switch between them while the page lives.
 * Socket to stream: the ticket route names another tier at an open (the hand off of 3.8), the
 * object closed with 4503 (the realtime flag off) and the ticket route names `blob`, or 30 s of
 * failed opens and the same answer; the client reopens at once over the stream and the hello's
 * tier word makes it resync once (room-client.ts `helloTier`). Stream to socket: the stream
 * route's 503 `{ error: 'tier' }` (the instance serves `do`), when a socket URL is known or the
 * ticket route gives one. A failure that switches carries `retryAfterMs: 0`; every other passes
 * to the client as the transport reported it, so the ladder, the `retry-after` and the 8 s wait
 * of a refusal stay the client's.
 */
export function roomTransport(
  deckId: string,
  tab: string,
  room: unknown,
  deps: TransportDeps = {},
): RoomTransport & { kind: () => 'sse' | 'ws' } {
  const facts = roomFactsOf(room);
  const now = deps.now ?? (() => Date.now());
  const ws = wsTransport(deckId, tab, facts, deps);
  const sse = sseTransport(deckId, tab, deps);
  let mode: 'ws' | 'sse' = facts.tier === 'do' ? 'ws' : 'sse';
  /** when the socket's opens began failing with no hello between; null while they succeed */
  let failedSince: number | null = null;
  const switchTo = (next: 'ws' | 'sse'): void => {
    mode = next;
    failedSince = null;
  };
  return {
    kind: () => mode,
    open(options) {
      const onEvent = (event: RoomEvent): void => {
        if (event.type === 'hello') failedSince = null;
        options.onEvent(event);
      };
      if (mode === 'ws') {
        return ws.open({
          ...options,
          onEvent,
          onError: (error) => {
            const failure = error as TransportFailure;
            if (failedSince === null) failedSince = now();
            if (typeof failure.tier === 'string' && failure.tier !== 'do') {
              switchTo('sse');
              options.onError({ ...failure, retryAfterMs: 0 });
              return;
            }
            const asks =
              failure.closeCode === CLOSE_CODES.tier ||
              now() - failedSince >= TRANSPORT_FALLBACK_AFTER_MS;
            if (!asks) {
              options.onError(failure);
              return;
            }
            void ws.readTier().then((tier) => {
              if (tier !== null && tier !== 'do') {
                switchTo('sse');
                options.onError({ ...failure, retryAfterMs: 0 });
                return;
              }
              // asked and told `do` (or nothing): the ladder goes on and the question waits
              // another TRANSPORT_FALLBACK_AFTER_MS
              failedSince = now();
              options.onError(failure);
            });
          },
        });
      }
      return sse.open({
        ...options,
        onEvent,
        onError: (error) => {
          const failure = streamFailureOf(error);
          if (failure.status !== 503 || failure.code !== 'tier') {
            options.onError(error);
            return;
          }
          // the stream route says the instance serves the socket tier: a ticket (and the URL
          // it names) first, then the socket at once; without a URL the route's wait is honoured
          ws.markTicketStale();
          void ws.readTier().then((tier) => {
            if (tier === 'do' && ws.url() !== null) {
              switchTo('ws');
              options.onError({ ...failure, retryAfterMs: 0 });
              return;
            }
            options.onError(error);
          });
        },
      });
    },
    postOps: (body) => (mode === 'ws' ? ws : sse).postOps(body),
    postPresence: (body, options) => (mode === 'ws' ? ws : sse).postPresence(body, options),
  };
}
