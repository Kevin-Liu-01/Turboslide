// The browser's transport of the room (gslides-parity SPEC-3 3.3; SPEC-5-amendments A3 items 3
// and 5; B7): EventSource down, fetch up, same origin. The stream open carries the client id the
// tab holds (`client=`, kept by the server when it names this deck and this identity) and the
// ids the tab held before (`retire=`, dropped from the instance's roster before hello); a 409 of
// the ops route is handed back with its `since` entries so the room client rebases without a
// reload. An EventSource reconnects on its own after a network error, but closes for good after
// an HTTP error (a 503 at the stream cap, a 5xx from a cold function); the transport then opens a
// new one after a backoff from the last event id it saw, so a tab whose stream met one bad answer
// keeps converging (the fix round of VERIFICATION-5 finding 14). The controller
// (apps/studio/src/editor/controller.tsx, the integrator's file) builds its room client over this
// module; nothing here reads the DOM beyond EventSource and fetch.
import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import type { OpsResponse, RoomTransport } from '@turboslide/realtime/client/room-client';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import { roomEventOf } from '@turboslide/realtime/protocol';

/** The event names the stream writes (protocol.ts roomEventSchema). */
export const STREAM_EVENTS: readonly RoomEvent['type'][] = [
  'hello',
  'ops',
  'op',
  'checkpoint',
  'presence',
  'leave',
  'reject',
  'inbox',
  'access',
  'resync',
];

/** The stream URL of one open: the position, the held client id and the ids to retire. */
export function streamUrl(
  base: string,
  options: { since: number; clientId?: string; retire?: readonly string[] },
): string {
  const params = new URLSearchParams();
  params.set('since', String(options.since));
  if (options.clientId !== undefined) params.set('client', options.clientId);
  if (options.retire !== undefined && options.retire.length > 0)
    params.set('retire', options.retire.join(','));
  return `${base}/stream?${params.toString()}`;
}

/** The entries a 409 body carries, when it carries a well formed list; nothing otherwise. */
export function sinceOf(json: Record<string, unknown>): Entry[] | undefined {
  const raw = json.since;
  if (!Array.isArray(raw)) return undefined;
  const entries = raw.filter(
    (row): row is Entry =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { seq?: unknown }).seq === 'number' &&
      typeof (row as { opId?: unknown }).opId === 'string' &&
      typeof (row as { clientId?: unknown }).clientId === 'string',
  );
  return entries.length === raw.length ? entries : undefined;
}

/** The part of EventSource the transport uses, so a test hands in its own. */
export type EventSourceLike = {
  readonly readyState: number;
  addEventListener: (
    type: string,
    listener: (event: { data: string; lastEventId?: string }) => void,
  ) => void;
  onerror: ((event: unknown) => void) | null;
  close: () => void;
};

export type SseTransportOptions = {
  /** the EventSource constructor; the browser's by default */
  EventSource?: new (url: string) => EventSourceLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

/** The first wait before a closed EventSource is opened again, doubled each time up to the cap. */
export const REOPEN_MS = 1000;
export const REOPEN_MAX_MS = 30_000;
/** EventSource.CLOSED, spelled here so a test needs no browser global. */
const CLOSED = 2;

export function sseTransport(deckId: string, options: SseTransportOptions = {}): RoomTransport {
  const base = `/api/decks/${encodeURIComponent(deckId)}`;
  const Source =
    options.EventSource ?? (EventSource as unknown as new (url: string) => EventSourceLike);
  const setTimer = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as number));
  return {
    open({ since, clientId, retire, onEvent, onError }) {
      let position = since;
      let backoff = 0;
      let closed = false;
      let source: EventSourceLike | null = null;
      let reopenTimer: unknown;
      const connect = (first: boolean): void => {
        source = new Source(
          streamUrl(base, {
            since: position,
            ...(clientId === undefined ? {} : { clientId }),
            // the earlier ids are retired on the first open; a reopen names none
            ...(first && retire !== undefined ? { retire } : {}),
          }),
        );
        const current = source;
        for (const type of STREAM_EVENTS) {
          current.addEventListener(type, (raw) => {
            const id = Number(raw.lastEventId ?? NaN);
            if (Number.isFinite(id)) position = id;
            const event = roomEventOf({ data: raw.data });
            if (event !== null) {
              if (event.type === 'hello') backoff = 0;
              onEvent(event);
            }
          });
        }
        current.onerror = () => {
          if (closed) return;
          onError(new Error('the stream closed'));
          // a network error reconnects on its own; an HTTP error closes the source for good, and
          // the transport opens a new one from the last position after a backoff
          if (current.readyState !== CLOSED || reopenTimer !== undefined) return;
          backoff = Math.min(REOPEN_MAX_MS, backoff === 0 ? REOPEN_MS : backoff * 2);
          reopenTimer = setTimer(() => {
            reopenTimer = undefined;
            if (closed) return;
            connect(false);
          }, backoff);
        };
      };
      connect(true);
      return {
        close: () => {
          closed = true;
          if (reopenTimer !== undefined) clearTimer(reopenTimer);
          reopenTimer = undefined;
          source?.close();
        },
      };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      const response = await fetch(`${base}/ops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && json.ok === true) return json as unknown as OpsResponse;
      const retry = response.headers.get('retry-after');
      const since = sinceOf(json);
      return {
        ok: false,
        status: response.status,
        code: typeof json.error === 'string' ? json.error : 'error',
        message:
          typeof json.message === 'string' ? json.message : `The room answered ${response.status}`,
        ...(typeof json.head === 'number' ? { head: json.head } : {}),
        ...(retry !== null ? { retryAfterMs: Number(retry) * 1000 } : {}),
        ...(since === undefined ? {} : { since }),
      };
    },
    async postPresence(body: PresencePost, options = {}) {
      await fetch(`${base}/presence${options.leave === true ? '?leave=1' : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: options.leave === true,
      });
    },
  };
}
