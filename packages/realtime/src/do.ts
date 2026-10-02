// The `do` channel (the Cloudflare move, docs/CLOUDFLARE.md 3.6.1): what a Vercel function holds
// of a deck's room when the room itself is a Durable Object on the realtime Worker. The object is
// the order, the roster and the fan out, so almost nothing of `RealtimeChannel` applies here: the
// function publishes the deck level events the share, access and notify routes publish today
// (`publish`), reads the roster for a payload (`presence.roster`), reads the realtime flag off
// `GET /health` (`flag`, cached 60 s per instance; 3.8), and has six calls of its own on the
// `DoChannel` type the room narrows to: `document` (the live document at the head, for the editor
// loader and `liveIfOpen`), `flush` (the object checkpoints its tail at once), `serverWrite` (an
// agent's write entering the object's order), `serverComment` (a comment op entering it, so the
// comment actions work on this tier), `external` (a manifest written outside the object),
// `accessChanged` (the reauth of 3.3). Everything else throws `TypeError('not on the do tier')`,
// since no function appends, replays or binds on this tier; `bus` is undefined, so the readers of
// access.ts and room.ts fall to their TTLs. Every call carries the bearer and
// `AbortSignal.timeout`. No `node:`; tested with a fake `fetch`. Not a full channel, so
// channel-contract.ts does not run it.
import type { DeckDocument } from '@turboslide/schema/deck';
import type { CommentOp } from '@turboslide/schema/comments';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import type { RealtimeChannel, RoomEvent, RosterEntry } from './channel.ts';
import { checkDeckId } from './keys.ts';

/** How long a function trusts the Worker's `/health` answer (3.8 item 4). */
export const DO_FLAG_CACHE_MS = 60_000;
/** Failed `/health` reads in a row before the flag reads off (3.8 item 4: "three failed calls"). */
export const DO_FLAG_FAILURES = 3;
/** The deadline of every function call to the Worker (3.6.1). */
export const DO_CALL_TIMEOUT_MS = 10_000;
/** The deadline of the loader's document read (3.2: "a 2 s deadline"). */
export const DO_DOCUMENT_TIMEOUT_MS = 2_000;

export type DoChannelOptions = {
  /** the Worker's host, `turboslide-realtime.<subdomain>.workers.dev` or `127.0.0.1:87<lane>` */
  host: string;
  /** `TURBOSLIDE_ROOM_BEARER`; never printed */
  bearer: string;
  /** `http://` instead of `https://` (a checkout against `wrangler dev`) */
  insecure?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  /** where a failed call is reported; the message never carries the bearer */
  onError?: (error: unknown, context: string) => void;
};

/** `GET /health`'s body (docs/CLOUDFLARE.md 2.3, `setup.worker.health`). */
export type RoomHealth = {
  ok: boolean;
  protocol: number;
  commit: string;
  realtime: 'on' | 'off' | 'unset';
  appOrigin: string;
  /**
   * Whether the deck objects reach the app (the Worker's `rt_flags.callbacks`; 3.8): `failing`
   * after an object's seed or checkpoint calls failed for the deployment's reason, which the flag
   * reads as off; `ok` when the Worker answers nothing for it (an older Worker)
   */
  callbacks: 'ok' | 'failing';
};

/** The object's live document at its head (`GET /rooms/:id/document`), or null for an object without one. */
export type RoomDocument = {
  document: DeckDocument;
  /** the object's head, the seq the document includes */
  seq: number;
  revision: number;
  covered: number;
};

export type RoomFlush = { ok: boolean; revision: number; covered: number; head: number };

export type RoomWriteBody = {
  author: Author;
  clientId: string;
  mutations: Mutation[];
  baseRevision: number;
  strict?: boolean;
  note?: string;
};

export type RoomWriteAnswer =
  | { ok: true; revision: number; seq: number; record?: unknown }
  | { ok: false; code: 'conflict'; message: string; currentRevision: number }
  | { ok: false; code: 'invalid'; message: string };

export type RoomExternalBody = { revision: number; author: Author; note: string };

/** `POST /rooms/:id/comment` (frames.ts `roomCommentBodySchema`): one comment op the function checked. */
export type RoomCommentBody = { author: Author; clientId: string; comment: CommentOp };

export type RoomCommentAnswer =
  | { ok: true; revision: number; seq: number; covered: number }
  | { ok: false; code: 'invalid'; message: string };

export type DoChannel = RealtimeChannel & {
  readonly tier: 'do';
  /** the Worker's origin, `https://<host>` (or `http://` when insecure) */
  readonly origin: string;
  health: () => Promise<RoomHealth | null>;
  document: (deckId: string) => Promise<RoomDocument | null>;
  flush: (deckId: string) => Promise<RoomFlush>;
  serverWrite: (deckId: string, body: RoomWriteBody) => Promise<RoomWriteAnswer>;
  serverComment: (deckId: string, body: RoomCommentBody) => Promise<RoomCommentAnswer>;
  external: (deckId: string, body: RoomExternalBody) => Promise<void>;
  accessChanged: (deckId: string, principalIds?: readonly string[]) => Promise<void>;
  counters: (deckId: string) => Promise<Record<string, unknown>>;
};

/** True when the process's channel is the Worker's (the room narrows on it). */
export function isDoChannel(channel: RealtimeChannel): channel is DoChannel {
  return channel.tier === 'do' && 'document' in channel && 'flush' in channel;
}

function notOnDo(what: string): never {
  throw new TypeError(`${what} is not on the do tier: the object orders the deck`);
}

/** A failed call to the Worker; the message names the route and the status, never the bearer or a body. */
export class RoomCallError extends Error {
  readonly status: number;
  readonly route: string;
  constructor(route: string, status: number) {
    super(`the realtime Worker answered ${status} on ${route}`);
    this.name = 'RoomCallError';
    this.status = status;
    this.route = route;
  }
}

export function doChannel(options: DoChannelOptions): DoChannel {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => Date.now());
  const onError = options.onError ?? (() => {});
  const origin = `${options.insecure === true ? 'http' : 'https'}://${options.host}`;
  const headers = (json: boolean): Record<string, string> => ({
    authorization: `Bearer ${options.bearer}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  const call = async (
    method: 'GET' | 'POST',
    route: string,
    body?: unknown,
    timeoutMs = DO_CALL_TIMEOUT_MS,
  ): Promise<Response> => {
    return fetchFn(`${origin}${route}`, {
      method,
      headers: headers(body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const roomRoute = (deckId: string, tail: string): string =>
    `/rooms/${encodeURIComponent(checkDeckId(deckId))}/${tail}`;

  // the realtime flag off `/health`, cached per instance (3.8 item 4)
  let flagAt = -Infinity;
  let flagValue = true;
  let flagFailures = 0;

  const health = async (): Promise<RoomHealth | null> => {
    try {
      const response = await fetchFn(`${origin}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(DO_CALL_TIMEOUT_MS),
      });
      if (!response.ok) throw new RoomCallError('/health', response.status);
      const body = (await response.json()) as Partial<RoomHealth>;
      if (typeof body !== 'object' || body === null || body.ok !== true) return null;
      return {
        ok: true,
        protocol: typeof body.protocol === 'number' ? body.protocol : 0,
        commit: typeof body.commit === 'string' ? body.commit : '',
        realtime:
          body.realtime === 'on' || body.realtime === 'off' || body.realtime === 'unset'
            ? body.realtime
            : 'unset',
        appOrigin: typeof body.appOrigin === 'string' ? body.appOrigin : '',
        callbacks: body.callbacks === 'failing' ? 'failing' : 'ok',
      };
    } catch (error) {
      onError(error, 'health');
      return null;
    }
  };

  const channel: DoChannel = {
    tier: 'do',
    origin,

    async append() {
      return notOnDo('append');
    },
    async since() {
      return notOnDo('since');
    },
    async head() {
      return notOnDo('head');
    },
    subscribe() {
      return notOnDo('subscribe');
    },
    async publish(deckId, event: RoomEvent) {
      const response = await call('POST', roomRoute(deckId, 'publish'), { event });
      if (!response.ok) throw new RoomCallError('publish', response.status);
    },
    async trim() {
      return notOnDo('trim');
    },
    presence: {
      async set() {
        return notOnDo('presence.set');
      },
      async roster(deckId) {
        const response = await call('GET', roomRoute(deckId, 'roster'));
        if (!response.ok) throw new RoomCallError('roster', response.status);
        const body = (await response.json()) as { clients?: RosterEntry[] };
        return Array.isArray(body.clients) ? body.clients : [];
      },
      async leave() {
        return notOnDo('presence.leave');
      },
      async bind() {
        return notOnDo('presence.bind');
      },
      async owner() {
        return notOnDo('presence.owner');
      },
    },
    async lock() {
      return notOnDo('lock');
    },
    async heartbeat() {
      return notOnDo('heartbeat');
    },
    async unlock() {
      return notOnDo('unlock');
    },
    async budget() {
      return notOnDo('budget');
    },
    async flag(name) {
      if (name !== 'realtime') return true;
      const t = now();
      if (t - flagAt < DO_FLAG_CACHE_MS) return flagValue;
      const read = await health();
      if (read === null) {
        flagFailures += 1;
        // three failed reads in a row hand the instance's rooms to the blob tier (3.8 item 4);
        // the cache holds the answer so a flapping Worker is asked once a minute
        if (flagFailures >= DO_FLAG_FAILURES) {
          flagValue = false;
          flagAt = t;
        }
        return flagValue;
      }
      flagFailures = 0;
      // an object that cannot reach the app (a protected preview, the routes answering 5xx)
      // strands its tabs on the ladder, so the instance hands off as for an unreachable Worker
      // (VERIFICATION.md realtime pass 1 finding 7)
      flagValue = read.realtime === 'on' && read.callbacks !== 'failing';
      flagAt = t;
      return flagValue;
    },
    bus: undefined,
    async close() {},

    health,

    async document(deckId) {
      const response = await call(
        'GET',
        roomRoute(deckId, 'document'),
        undefined,
        DO_DOCUMENT_TIMEOUT_MS,
      );
      if (response.status === 204) return null;
      if (!response.ok) throw new RoomCallError('document', response.status);
      const body = (await response.json()) as Partial<RoomDocument> & { none?: boolean };
      if (body.none === true || body.document === undefined) return null;
      return {
        document: body.document,
        seq: typeof body.seq === 'number' ? body.seq : 0,
        revision: typeof body.revision === 'number' ? body.revision : 0,
        covered: typeof body.covered === 'number' ? body.covered : 0,
      };
    },

    async flush(deckId) {
      const response = await call('POST', roomRoute(deckId, 'flush'), {});
      if (!response.ok) throw new RoomCallError('flush', response.status);
      return (await response.json()) as RoomFlush;
    },

    async serverWrite(deckId, body) {
      const response = await call('POST', roomRoute(deckId, 'write'), body);
      if (response.status === 409 || response.status === 400 || response.ok) {
        return (await response.json()) as RoomWriteAnswer;
      }
      throw new RoomCallError('write', response.status);
    },

    async serverComment(deckId, body) {
      const response = await call('POST', roomRoute(deckId, 'comment'), body);
      if (response.status === 400 || response.ok) {
        return (await response.json()) as RoomCommentAnswer;
      }
      throw new RoomCallError('comment', response.status);
    },

    async external(deckId, body) {
      const response = await call('POST', roomRoute(deckId, 'external'), body);
      if (!response.ok) throw new RoomCallError('external', response.status);
    },

    async accessChanged(deckId, principalIds) {
      const response = await call('POST', roomRoute(deckId, 'access-changed'), {
        ...(principalIds === undefined ? {} : { principalIds: [...principalIds] }),
      });
      if (!response.ok) throw new RoomCallError('access-changed', response.status);
    },

    async counters(deckId) {
      const response = await call('GET', roomRoute(deckId, 'counters'));
      if (!response.ok) throw new RoomCallError('counters', response.status);
      return (await response.json()) as Record<string, unknown>;
    },
  };
  return channel;
}
