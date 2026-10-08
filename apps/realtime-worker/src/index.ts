// The realtime Worker's router (docs/CLOUDFLARE.md 3.1, 3.3, 3.6.2 `src/index.ts`): nothing
// reaches an object or the database unverified. `GET /rooms/:id` with `Upgrade: websocket` reads
// the realtime flag (`rt_flags`, 30 s cache per isolate; `off` and `unset` refuse with 4503),
// verifies the ticket the second subprotocol carries (the MAC, `exp`, `deck` equals the path,
// `org` equals the request's `Origin`, `v` in the two version window) and forwards the upgrade to
// `DECK_ROOM.get(idFromName(id), hint)` with the claims in a header; an upgrade without a ticket
// is forwarded as a join (the fallback carrier of 3.3) and the object waits 5 s for the frame.
// `POST /rooms/:id/ops` and `/presence` carry `Authorization: Ticket` and are verified the same
// way. The bearer routes (`/rooms/:id/{write,comment,flush,external,publish,roster,document,
// counters,access-changed}`, `/control/{open,flags,counters}`) compare the room bearer in
// constant time and forward. The database routes (`/db/{query,batch}`) take their own bearer,
// `TURBOSLIDE_DB_BEARER` (AUTH-3), so the room bearer, which the object also sends to the app and
// the probes carry, reaches no account row; `/db/counters` reads no database and takes either.
// Each secret has an optional `_PREVIOUS` value the Worker also accepts while a rotation is in
// flight (docs/hosting.md 13.8); it is never sent. A Worker without `TURBOSLIDE_DB_BEARER` (a
// deployment before the rotation) takes the room bearer on `/db` and logs `db.bearer.fallback`
// once per isolate. `GET /health` answers `{ ok, protocol, commit, realtime, appOrigin,
// callbacks, db, statements }`, the last two naming the bearer mode and the allowlist mode,
// never a value. `OPTIONS` answers CORS for the ticket POSTs. A refused upgrade is accepted and
// closed with its code so the browser reads it (3.6.3). The Worker's own work per request stays
// under the Free plan's 10 ms: one HMAC verify and one JSON parse per upgrade, one digest compare
// per bearer value. Request counts by class ride `GET /control/counters`.
import {
  ROOM_PROTOCOL,
  ROOM_SUBPROTOCOL,
  offersRoomProtocol,
  ticketOfProtocols,
} from '@turboslide/realtime/frames';
import type { TicketClaims } from '@turboslide/realtime/frames';

import {
  callbacksState,
  dropFlagCache,
  openDecks,
  readFlags,
  realtimeFlag,
  workerCounters,
  writeFlags,
} from './control.ts';
import type { CallbacksState } from './control.ts';
import { dbBatch, dbCountersAnswer, dbQuery, statementMode } from './db.ts';
import type { StatementMode } from './db.ts';
import {
  ADDRESS_HEADER,
  CLAIMS_HEADER,
  COLO_HEADER,
  DeckRoom,
  JOIN_HEADER,
  ORIGIN_HEADER,
  REALTIME_HEADER,
} from './deck-room.ts';
import { authorizationToken, secretsMatchAny, verifyTicketRotating } from './ticket.ts';

export { DeckRoom };

// the module exports handlers and the object class alone: workerd refuses any other export
// ("Incorrect type for map entry ... not of type 'function or ExportedHandler'", read on the
// first wrangler dev of 2026-10-01), so the protocol version is a module constant here
const PROTOCOL = ROOM_PROTOCOL;

/** The body of GET /health (docs/CLOUDFLARE.md 2.3, `setup.worker.health`). */
export type HealthBody = {
  ok: true;
  protocol: number;
  commit: string;
  realtime: 'on' | 'off' | 'unset';
  appOrigin: string;
  /** whether the deck objects reach `appOrigin` (control.ts `CallbacksState`; 3.8) */
  callbacks: CallbacksState;
  /** which bearer guards `/db` (`dbBearerMode`); never a value */
  db: DbBearerMode;
  /** whether `/db` refuses an unlisted statement or runs and logs it (db.ts) */
  statements: StatementMode;
};

/**
 * Which bearer `/db/query` and `/db/batch` take (AUTH-3): `own` the database bearer alone,
 * `rotating` the database bearer and its previous value (a rotation in flight, docs/hosting.md
 * 13.8), `fallback` the room bearer (no `TURBOSLIDE_DB_BEARER` on this Worker yet).
 */
export type DbBearerMode = 'own' | 'rotating' | 'fallback';

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function dbBearerMode(env: Env): DbBearerMode {
  if (!isSet(env.TURBOSLIDE_DB_BEARER)) return 'fallback';
  return isSet(env.TURBOSLIDE_DB_BEARER_PREVIOUS) ? 'rotating' : 'own';
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const BEARER_TAILS = new Set([
  'write',
  'comment',
  'flush',
  'external',
  'publish',
  'roster',
  'document',
  'counters',
  'access-changed',
]);
const TICKET_TAILS = new Set(['ops', 'presence']);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** The CORS answer of 3.3: the request's Origin echoed, POST, the two headers, no credentials. */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin === null) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

function withCors(response: Response, request: Request): Response {
  const cors = corsHeaders(request);
  if (Object.keys(cors).length === 0) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Accepts the socket and closes it with the code, so the browser reads the code and not a bare 1006 (3.6.3). */
function refusedUpgrade(code: number, reason: string): Response {
  workerCounters.upgradesRefused += 1;
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  server.close(code, reason.slice(0, 120));
  return new Response(null, { status: 101, webSocket: client });
}

function protocolOf(env: Env): number {
  const n = Number(env.TURBOSLIDE_PROTOCOL);
  return Number.isInteger(n) && n > 0 ? n : PROTOCOL;
}

async function health(env: Env): Promise<HealthBody> {
  return {
    ok: true,
    protocol: protocolOf(env),
    commit: env.TURBOSLIDE_BUILD_COMMIT ?? '',
    realtime: await realtimeFlag(env.ACCOUNTS),
    appOrigin: env.TURBOSLIDE_APP_ORIGIN ?? '',
    callbacks: await callbacksState(env.ACCOUNTS),
    db: dbBearerMode(env),
    statements: statementMode(env.TURBOSLIDE_DB_STATEMENTS),
  };
}

/** The object of a deck, with the placement hint when the variable names one (3.6.2). */
function roomStub(env: Env, deckId: string): DurableObjectStub<DeckRoom> {
  const hint = env.TURBOSLIDE_ROOM_HINT?.trim();
  const id = env.DECK_ROOM.idFromName(deckId);
  return hint
    ? env.DECK_ROOM.get(id, { locationHint: hint as DurableObjectLocationHint })
    : env.DECK_ROOM.get(id);
}

/**
 * The request as the object receives it: the original headers plus the router's stamps, and the
 * body read here in full (at most the ops cap or a bearer body), so no stream is left for the
 * runtime to read after the object answered (VERIFICATION.md realtime pass 1 finding 11: the
 * flush route, which reads no body, logged "Can't read from request stream after response has
 * been sent" after each answer).
 */
async function forwarded(
  request: Request,
  stamps: Record<string, string | null>,
  realtime: 'on' | 'off' | 'unset',
): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete(CLAIMS_HEADER);
  headers.delete(JOIN_HEADER);
  headers.delete(REALTIME_HEADER);
  for (const [key, value] of Object.entries(stamps)) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  if (realtime !== 'on') headers.set(REALTIME_HEADER, 'off');
  const colo = (request.cf as { colo?: string } | undefined)?.colo;
  if (colo !== undefined) headers.set(COLO_HEADER, colo);
  const address = request.headers.get('cf-connecting-ip');
  if (address !== null) headers.set(ADDRESS_HEADER, address);
  const origin = request.headers.get('origin');
  headers.set(ORIGIN_HEADER, origin ?? '');
  if (origin === null) headers.delete(ORIGIN_HEADER);
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer();
  return new Request(request.url, {
    method: request.method,
    headers,
    body: body === null || body.byteLength === 0 ? null : body,
  });
}

async function verifyClaims(
  token: string,
  env: Env,
  deckId: string,
  request: Request,
): Promise<{ ok: true; claims: TicketClaims } | { ok: false; reason: string }> {
  const secrets = {
    current: env.TURBOSLIDE_ROOM_SECRET,
    previous: env.TURBOSLIDE_ROOM_SECRET_PREVIOUS,
  };
  const verdict = await verifyTicketRotating(token, secrets, {
    deck: deckId,
    origin: request.headers.get('origin'),
    now: Date.now(),
    protocol: protocolOf(env),
  });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  return verdict;
}

async function serve(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'OPTIONS') {
    workerCounters.options += 1;
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    workerCounters.health += 1;
    return json(await health(env));
  }
  if (parts[0] === 'rooms' && parts[1] !== undefined) {
    const deckId = parts[1];
    if (!SLUG.test(deckId)) return json({ error: 'not_found' }, 404);
    const tail = parts[2] ?? '';
    const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    if (upgrade && request.method === 'GET' && tail === '') {
      workerCounters.upgrades += 1;
      const flag = await realtimeFlag(env.ACCOUNTS);
      if (flag !== 'on') return refusedUpgrade(4503, `realtime ${flag}`);
      const protocols = request.headers.get('sec-websocket-protocol');
      if (!offersRoomProtocol(protocols)) return refusedUpgrade(4401, 'no room protocol');
      if (request.headers.get('origin') === null) return refusedUpgrade(4403, 'no origin');
      const token = ticketOfProtocols(protocols);
      if (token === null) {
        // the fallback carrier (3.3): the object waits JOIN_WINDOW_MS for `{ t: 'join', ticket }`
        return roomStub(env, deckId).fetch(await forwarded(request, { [JOIN_HEADER]: '1' }, flag));
      }
      const verdict = await verifyClaims(token, env, deckId, request);
      if (!verdict.ok)
        return refusedUpgrade(
          verdict.reason === 'origin' ? 4403 : 4401,
          `ticket ${verdict.reason}`,
        );
      const response = await roomStub(env, deckId).fetch(
        await forwarded(request, { [CLAIMS_HEADER]: JSON.stringify(verdict.claims) }, flag),
      );
      // the answered subprotocol rides the 101 (3.3)
      if (
        response.status === 101 &&
        response.webSocket !== null &&
        response.webSocket !== undefined
      ) {
        return new Response(null, {
          status: 101,
          webSocket: response.webSocket,
          headers: { 'sec-websocket-protocol': ROOM_SUBPROTOCOL },
        });
      }
      return response;
    }
    if (TICKET_TAILS.has(tail) && request.method === 'POST') {
      workerCounters.ticketPosts += 1;
      const token = authorizationToken(request.headers.get('authorization'), 'Ticket');
      if (token === null)
        return withCors(
          json({ error: 'ticket', message: 'Authorization: Ticket <token>' }, 401),
          request,
        );
      const verdict = await verifyClaims(token, env, deckId, request);
      if (!verdict.ok)
        return withCors(
          json(
            { error: 'ticket', message: `ticket ${verdict.reason}` },
            verdict.reason === 'origin' ? 403 : 401,
          ),
          request,
        );
      const flag = await realtimeFlag(env.ACCOUNTS);
      const response = await roomStub(env, deckId).fetch(
        await forwarded(request, { [CLAIMS_HEADER]: JSON.stringify(verdict.claims) }, flag),
      );
      return withCors(response, request);
    }
    if (BEARER_TAILS.has(tail)) {
      workerCounters.bearerCalls += 1;
      if (!(await bearerOk(request, env))) return json({ error: 'bearer' }, 401);
      const flag = await realtimeFlag(env.ACCOUNTS);
      return roomStub(env, deckId).fetch(
        await forwarded(
          request,
          {},
          tail === 'counters' || tail === 'roster' || tail === 'document' ? 'on' : flag,
        ),
      );
    }
    return json({ error: 'not_found' }, 404);
  }
  if (parts[0] === 'db') {
    workerCounters.dbCalls += 1;
    if (parts[1] === 'counters' && request.method === 'GET') {
      // the isolate's sums and no database read: either bearer (the cost probe carries the room one)
      if (!(await bearerOk(request, env)) && !(await dbBearerOk(request, env)))
        return json({ error: 'bearer' }, 401);
      return dbCountersAnswer();
    }
    if (!(await dbBearerOk(request, env))) return json({ error: 'bearer' }, 401);
    const mode = statementMode(env.TURBOSLIDE_DB_STATEMENTS);
    if (parts[1] === 'query' && request.method === 'POST')
      return dbQuery(env.ACCOUNTS, await request.json().catch(() => null), mode);
    if (parts[1] === 'batch' && request.method === 'POST')
      return dbBatch(env.ACCOUNTS, await request.json().catch(() => null), mode);
    return json({ error: 'not_found' }, 404);
  }
  if (parts[0] === 'control') {
    workerCounters.controlCalls += 1;
    if (!(await bearerOk(request, env))) return json({ error: 'bearer' }, 401);
    if (parts[1] === 'open' && request.method === 'GET') {
      const decks = await openDecks(env.ACCOUNTS);
      return decks === null
        ? json({ error: 'unset', message: 'the control tables are not made' }, 503)
        : json({ decks });
    }
    if (parts[1] === 'flags' && request.method === 'GET') {
      const flags = await readFlags(env.ACCOUNTS);
      return flags === null
        ? json({ error: 'unset', message: 'the control tables are not made' }, 503)
        : json({ flags });
    }
    if (parts[1] === 'flags' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object') return json({ error: 'invalid' }, 400);
      const flags: Record<string, string> = {};
      for (const [key, value] of Object.entries(body))
        if (typeof value === 'string') flags[key] = value;
      try {
        await writeFlags(env.ACCOUNTS, flags);
      } catch (error) {
        if (error instanceof TypeError)
          return json({ error: 'invalid', message: error.message }, 400);
        return json({ error: 'unset', message: 'the control tables are not made' }, 503);
      }
      dropFlagCache();
      return json({ ok: true, flags: await readFlags(env.ACCOUNTS) });
    }
    if (parts[1] === 'counters' && request.method === 'GET') return json({ ...workerCounters });
    return json({ error: 'not_found' }, 404);
  }
  workerCounters.other += 1;
  return json({ error: 'not_found' }, 404);
}

/** The room bearer, or its previous value while a rotation is in flight: the room and control routes. */
async function bearerOk(request: Request, env: Env): Promise<boolean> {
  return secretsMatchAny(authorizationToken(request.headers.get('authorization'), 'Bearer'), [
    env.TURBOSLIDE_ROOM_BEARER,
    env.TURBOSLIDE_ROOM_BEARER_PREVIOUS,
  ]);
}

let fallbackLogged = false;

/**
 * The database bearer of `/db/query` and `/db/batch` (AUTH-3): `TURBOSLIDE_DB_BEARER` or, while a
 * rotation is in flight, `TURBOSLIDE_DB_BEARER_PREVIOUS`. A Worker without the database bearer
 * takes the room bearer, as every Worker did before AUTH-3, and logs `db.bearer.fallback` once per
 * isolate; once the database bearer is set the room bearer is refused here.
 */
async function dbBearerOk(request: Request, env: Env): Promise<boolean> {
  const given = authorizationToken(request.headers.get('authorization'), 'Bearer');
  if (isSet(env.TURBOSLIDE_DB_BEARER))
    return secretsMatchAny(given, [env.TURBOSLIDE_DB_BEARER, env.TURBOSLIDE_DB_BEARER_PREVIOUS]);
  const ok = await bearerOk(request, env);
  if (ok && !fallbackLogged) {
    fallbackLogged = true;
    console.warn(
      JSON.stringify({
        message: 'db.bearer.fallback',
        reason: 'TURBOSLIDE_DB_BEARER is not set on this Worker; /db takes the room bearer',
      }),
    );
  }
  return ok;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await serve(request, env);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'request failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ error: 'worker', message: 'The Worker could not answer' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
