// The socket transport of the `do` tier (docs/CLOUDFLARE.md 3.6.3; realtime/build/r2.md, the
// Cloudflare phase) against the socket shaped fake, a scripted fetch and a fake clock: the
// upgrade's URL and subprotocols, the frames up and down, the ack settle by `req`, the HTTP belt
// while the socket is down, the literal `ping`, the leave, the ticket refresh and the `reauth`,
// the close code map, the join fallback, the offline event, and the wrapper's switch between the
// socket and the stream route.
import { describe, expect, test } from 'vitest';

import type { RoomEvent } from '@turboslide/realtime/channel';
import { fakeSocketHub } from '@turboslide/realtime/client/fake-transport';
import type { FakeSocket } from '@turboslide/realtime/client/fake-transport';
import { REOPEN_WAIT_MAX_MS } from '@turboslide/realtime/client/room-client';
import type { OpsResponse, StreamFailure } from '@turboslide/realtime/client/room-client';
import { CLOSE_CODES, HEARTBEAT_REQUEST, ackOf } from '@turboslide/realtime/frames';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';

import {
  BUSY_RETRY_FALLBACK_MS,
  TICKET_REFRESH_LEAD_MS,
  TIER_RETRY_FALLBACK_MS,
  TRANSPORT_FALLBACK_AFTER_MS,
  closeFailure,
  expiresAtOf,
  httpOriginOf,
  presenceKeyOf,
  reasonCodeOf,
  retryAfterMsOf,
  roomFactsOf,
  roomTransport,
  wsTransport,
} from './transport';
import type { TransportDeps, TransportFailure } from './transport';

const CLIENT = 'c'.repeat(32);
const DECK = 'deck-one';
const TAB = 't'.repeat(32);
const URL_WS = `ws://127.0.0.1:8792/rooms/${DECK}`;
const T0 = 1_700_000_000_000;

function hello(overrides: Partial<Extract<RoomEvent, { type: 'hello' }>> = {}): RoomEvent {
  return {
    type: 'hello',
    seq: 0,
    revision: 0,
    clientId: CLIENT,
    role: 'owner',
    clients: [],
    editing: 1,
    tier: 'do',
    covered: 0,
    ...overrides,
  };
}

/** A clock whose timers fire when `advance` moves it; the transport takes it as `timers` and `now`. */
function fakeClock(start = T0) {
  let t = start;
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return {
    now: () => t,
    timers: {
      setTimeout: (run: () => void, ms: number): unknown => {
        const id = next;
        next += 1;
        pending.set(id, { at: t + ms, run });
        return id;
      },
      clearTimeout: (handle: unknown): void => {
        pending.delete(handle as number);
      },
    },
    flush,
    async advance(ms: number): Promise<void> {
      const until = t + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, row]) => row.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        pending.delete(due[0]);
        t = due[1].at;
        due[1].run();
        await flush();
      }
      t = until;
      await flush();
    },
    armed: () => pending.size,
  };
}

type Call = { url: string; init: RequestInit | undefined };

/** A fetch answered by a script keyed on the URL's path; every call is recorded. */
function fakeFetch(
  script: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  const calls: Call[] = [];
  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(script(url, init));
  };
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const ticketAnswer = (ticket: string, extra: Record<string, unknown> = {}): Response =>
  json({ ticket, expiresAt: T0 + 600_000, tier: 'do', ...extra });

const presence = (clock: number, extra: Partial<PresencePost> = {}): PresencePost => ({
  clientId: CLIENT,
  clock,
  pointerOn: false,
  presenting: false,
  ...extra,
});

const opsPost = (): OpsPost => ({
  clientId: CLIENT,
  base: { seq: 0 },
  entries: [
    {
      opId: `${CLIENT}:1`,
      kind: 'edit',
      mutations: [
        {
          op: 'text.splice',
          slideId: 'title',
          blockId: 'h',
          path: '/text',
          at: 0,
          remove: 0,
          insert: 'a',
        },
      ],
    },
  ],
});

type Harness = {
  hub: ReturnType<typeof fakeSocketHub>;
  clock: ReturnType<typeof fakeClock>;
  fetch: ReturnType<typeof fakeFetch>;
  deps: TransportDeps;
  /** the browser's word on the network, read by the transport's `online` at every close */
  online: boolean;
  events: RoomEvent[];
  errors: TransportFailure[];
  resends: number;
  rooms: unknown[];
  open: (
    transport: { open: (o: Parameters<ReturnType<typeof wsTransport>['open']>[0]) => unknown },
    since?: number,
  ) => ReturnType<ReturnType<typeof wsTransport>['open']>;
};

function harness(script?: Parameters<typeof fakeFetch>[0]): Harness {
  const hub = fakeSocketHub();
  const clock = fakeClock();
  const fetch = fakeFetch(
    script ??
      ((url) => {
        if (url.includes('/ticket')) return ticketAnswer('fresh.mac');
        return json({ error: 'unexpected' }, 500);
      }),
  );
  const out: Harness = {
    hub,
    clock,
    fetch,
    deps: {
      WebSocket: hub.WebSocket,
      fetch: fetch.fetchImpl,
      now: clock.now,
      timers: clock.timers,
      window: null,
      online: () => out.online,
    },
    online: true,
    events: [],
    errors: [],
    resends: 0,
    rooms: [],
    open: (transport, since = 0) =>
      transport.open({
        since,
        retire: ['r'.repeat(32)],
        onEvent: (event) => out.events.push(event),
        onError: (error) => out.errors.push(error as TransportFailure),
        onResend: () => {
          out.resends += 1;
        },
        onRoom: (room) => out.rooms.push(room),
      }) as ReturnType<ReturnType<typeof wsTransport>['open']>,
  };
  return out;
}

const facts = (overrides: Partial<ReturnType<typeof roomFactsOf>> = {}) => ({
  tier: 'do',
  seq: 0,
  url: URL_WS,
  ticket: 'payload.mac',
  ticketExpiresAt: T0 + 600_000,
  ...overrides,
});

/** Accepts the newest socket as the Worker does and plays the hello. */
async function accept(h: Harness, event: RoomEvent = hello()): Promise<FakeSocket> {
  await h.clock.flush();
  const socket = h.hub.last();
  socket.accept('turboslide.v1');
  socket.push(event);
  await h.clock.flush();
  return socket;
}

describe('the room facts and the pure readers', () => {
  test('roomFactsOf reads the payload structurally and refuses what is not a socket URL or a time', () => {
    expect(
      roomFactsOf({ tier: 'do', seq: 4, url: URL_WS, ticket: 'a.b', ticketExpiresAt: T0 }),
    ).toEqual({ tier: 'do', seq: 4, url: URL_WS, ticket: 'a.b', ticketExpiresAt: T0 });
    expect(roomFactsOf({ tier: 'blob', seq: 1, notice: 'x' })).toEqual({
      tier: 'blob',
      seq: 1,
      url: null,
      ticket: null,
      ticketExpiresAt: null,
    });
    expect(roomFactsOf({ tier: 'do', url: 'https://host/rooms/d', ticket: '' }).url).toBeNull();
    expect(roomFactsOf(undefined).tier).toBeNull();
    expect(expiresAtOf('2026-10-01T00:00:00.000Z')).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
    expect(expiresAtOf(-1)).toBeNull();
    expect(expiresAtOf('soon')).toBeNull();
  });

  test('httpOriginOf maps the socket scheme onto the belt’s', () => {
    expect(httpOriginOf('wss://turboslide-realtime.kk.workers.dev/rooms/d')).toBe(
      'https://turboslide-realtime.kk.workers.dev',
    );
    expect(httpOriginOf(URL_WS)).toBe('http://127.0.0.1:8792');
    expect(httpOriginOf('https://host/rooms/d')).toBeNull();
    expect(httpOriginOf('not a url')).toBeNull();
  });

  test('the close reason’s wait and code are read in both spellings', () => {
    expect(retryAfterMsOf('retry-after=7')).toBe(7000);
    expect(retryAfterMsOf('retry-after: 30')).toBe(30_000);
    expect(retryAfterMsOf('{"retryAfter":12}')).toBe(12_000);
    expect(retryAfterMsOf('{"retryAfterMs":250}')).toBe(250);
    expect(retryAfterMsOf('')).toBeUndefined();
    expect(reasonCodeOf('too_many_streams')).toBe('too_many_streams');
    expect(reasonCodeOf('{"error":"forbidden"}')).toBe('forbidden');
    expect(reasonCodeOf('retry-after=7')).toBeUndefined();
  });

  test('the close code map (3.6.3)', () => {
    expect(closeFailure(CLOSE_CODES.ticket, '')).toMatchObject({
      status: 401,
      retryAfterMs: 0,
      closeCode: 4401,
    });
    expect(closeFailure(CLOSE_CODES.forbidden, 'forbidden')).toMatchObject({
      status: 403,
      code: 'forbidden',
      retryAfterMs: 0,
    });
    expect(closeFailure(CLOSE_CODES.superseded, '')).toMatchObject({
      status: 409,
      retryAfterMs: REOPEN_WAIT_MAX_MS,
    });
    expect(closeFailure(CLOSE_CODES.capped, 'retry-after=7')).toMatchObject({
      status: 503,
      retryAfterMs: 7000,
    });
    expect(closeFailure(CLOSE_CODES.capped, '').retryAfterMs).toBe(BUSY_RETRY_FALLBACK_MS);
    expect(closeFailure(CLOSE_CODES.tier, '')).toMatchObject({
      status: 503,
      code: 'tier',
      retryAfterMs: TIER_RETRY_FALLBACK_MS,
    });
    expect(closeFailure(CLOSE_CODES.error, '')).toEqual({
      message: 'the socket closed (4500)',
      closeCode: 4500,
    });
    expect(closeFailure(1006, '').status).toBeUndefined();
  });

  test('presenceKeyOf leaves the clock out and keeps everything else', () => {
    expect(presenceKeyOf(presence(1))).toBe(presenceKeyOf(presence(2)));
    expect(presenceKeyOf(presence(1))).not.toBe(presenceKeyOf(presence(1, { slideId: 'two' })));
    expect(
      presenceKeyOf(
        presence(1, {
          selection: { blockIds: [], caret: { blockId: 'h', path: '/text', seq: 1 } },
        }),
      ),
    ).not.toBe(
      presenceKeyOf(
        presence(1, {
          selection: { blockIds: [], caret: { blockId: 'h', path: '/text', seq: 2 } },
        }),
      ),
    );
  });
});

describe('wsTransport: the socket', () => {
  test('opens at the position with the tab and the retire list, the ticket as the second subprotocol, and hands the hello, the room frame and a resend on', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    expect(transport.kind()).toBe('ws');
    h.open(transport, 7);
    await h.clock.flush();
    const socket = h.hub.last();
    expect(socket.url).toBe(`${URL_WS}?since=7&tab=${TAB}&retire=${'r'.repeat(32)}`);
    expect(socket.protocols).toEqual(['turboslide.v1', 'ticket.payload.mac']);
    expect(h.fetch.calls).toHaveLength(0);
    socket.accept('turboslide.v1');
    socket.push(hello({ seq: 9 }));
    socket.push({ t: 'room', colo: 'IAD', object: 'abcdef01', idleMs: 2000, maxMs: 10_000 });
    socket.push({ type: 'resend' });
    socket.push('pong');
    await h.clock.flush();
    expect(h.events).toEqual([hello({ seq: 9 })]);
    expect(transport.clientId()).toBe(CLIENT);
    expect(h.rooms).toEqual([{ colo: 'IAD', object: 'abcdef01', idleMs: 2000, maxMs: 10_000 }]);
    expect(h.resends).toBe(1);
    expect(h.errors).toEqual([]);
    expect(socket.sent).toEqual([]);
  });

  test('an ops POST rides the socket as an ops frame and settles on the ack with its req', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    const answer = transport.postOps(opsPost());
    const frame = socket.frames()[0] as { t: string; req: number; clientId: string };
    expect(frame).toMatchObject({ t: 'ops', req: 1, clientId: CLIENT, base: { seq: 0 } });
    socket.push(ackOf(2, { ok: true, entries: [], rejected: [], head: 3, revision: 1 }));
    socket.push(
      ackOf(1, {
        ok: false,
        status: 409,
        code: 'resync',
        message: 'behind',
        head: 9,
      }),
    );
    const response = await answer;
    expect(response).toEqual({
      ok: false,
      status: 409,
      code: 'resync',
      message: 'behind',
      head: 9,
    });
    const second = transport.postOps(opsPost());
    expect((socket.frames()[1] as { req: number }).req).toBe(2);
    socket.push(ackOf(2, { ok: true, entries: [], rejected: [], head: 3, revision: 1 }));
    expect(await second).toMatchObject({ ok: true, head: 3, revision: 1 });
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('a POST in flight rejects when the socket closes, so the room client resends; an ordinary close takes the ladder', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    const answer = transport.postOps(opsPost());
    socket.closeFromServer(1006, '');
    await expect(answer).rejects.toThrow(/closed/);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]?.status).toBeUndefined();
    expect(h.errors[0]?.closeCode).toBe(1006);
    // the socket had opened: the carriage of the ticket stays the subprotocol
    expect(transport.joinFallback()).toBe(false);
  });

  test('a close before open while online alternates the ticket’s carriage: the next open offers one subprotocol and sends the join frame', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    await h.clock.flush();
    h.hub.last().closeFromServer(1006, '');
    await h.clock.flush();
    expect(h.errors).toHaveLength(1);
    expect(transport.joinFallback()).toBe(true);
    h.open(transport);
    await h.clock.flush();
    const second = h.hub.last();
    expect(second.protocols).toEqual(['turboslide.v1']);
    second.accept('turboslide.v1');
    expect(second.frames()).toEqual([{ t: 'join', ticket: 'payload.mac' }]);
    second.push(hello());
    await h.clock.flush();
    // a hello arrived in the fallback: it stays
    expect(transport.joinFallback()).toBe(true);
    // a close before open while offline is the network, not the carriage: nothing toggles
    h.online = false;
    second.closeFromServer(1006, '');
    await h.clock.flush();
    h.open(transport);
    await h.clock.flush();
    h.hub.last().closeFromServer(1006, '');
    await h.clock.flush();
    expect(transport.joinFallback()).toBe(true);
  });

  test('4401 fetches a ticket and reopens at once with the new token; 4403 lands on the refused path', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    socket.closeFromServer(CLOSE_CODES.ticket, '');
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 401, retryAfterMs: 0 });
    h.open(transport, 9);
    await h.clock.flush();
    expect(h.fetch.calls.map((c) => c.url)).toEqual([`/api/decks/${DECK}/ticket?client=${CLIENT}`]);
    const second = h.hub.last();
    expect(second.protocols).toEqual(['turboslide.v1', 'ticket.fresh.mac']);
    second.accept();
    second.push(hello());
    second.closeFromServer(CLOSE_CODES.forbidden, 'forbidden');
    await h.clock.flush();
    expect(h.errors[1]).toMatchObject({ status: 403, code: 'forbidden', retryAfterMs: 0 });
  });

  test('4409, 4429 and 4503 carry the waits of the map; the ticket route’s refusal at an open is the refused path too', async () => {
    const h = harness((url) =>
      url.includes('/ticket') ? json({ error: 'forbidden' }, 403) : json({}, 500),
    );
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    (await accept(h)).closeFromServer(CLOSE_CODES.superseded, '');
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 409, retryAfterMs: REOPEN_WAIT_MAX_MS });
    h.open(transport);
    (await accept(h)).closeFromServer(CLOSE_CODES.capped, 'retry-after=7');
    await h.clock.flush();
    expect(h.errors[1]).toMatchObject({ status: 503, retryAfterMs: 7000 });
    h.open(transport);
    (await accept(h)).closeFromServer(CLOSE_CODES.tier, '');
    await h.clock.flush();
    expect(h.errors[2]).toMatchObject({
      status: 503,
      code: 'tier',
      retryAfterMs: TIER_RETRY_FALLBACK_MS,
    });
    // the ticket is stale after a 4503: the next open asks the route, which refuses
    h.open(transport);
    await h.clock.flush();
    expect(h.errors[3]).toMatchObject({ status: 403, code: 'forbidden' });
    expect(h.hub.opens()).toBe(3);
  });

  test('the ticket route naming another tier at an open ({ tier } alone, the route’s shape off the do tier) is reported with the tier for the wrapper', async () => {
    const h = harness((url) => (url.includes('/ticket') ? json({ tier: 'blob' }) : json({}, 500)));
    const transport = wsTransport(
      DECK,
      TAB,
      facts({ ticket: null, ticketExpiresAt: null }),
      h.deps,
    );
    h.open(transport);
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 503, code: 'tier', tier: 'blob', retryAfterMs: 0 });
    expect(h.hub.opens()).toBe(0);
    expect(await transport.readTier()).toBe('blob');
    // the belt with no ticket on another tier: a 503 the room client resends after
    expect(await transport.postOps(opsPost())).toMatchObject({
      ok: false,
      status: 503,
      code: 'tier',
    });
  });

  test('without a socket URL the ticket route’s url is taken, and none at all is a wait', async () => {
    const h = harness((url) =>
      url.includes('/ticket') ? ticketAnswer('x.y', { url: URL_WS }) : json({}, 500),
    );
    const transport = wsTransport(DECK, TAB, facts({ url: null, ticket: null }), h.deps);
    h.open(transport);
    await h.clock.flush();
    expect(transport.url()).toBe(URL_WS);
    expect(h.hub.last().protocols[1]).toBe('ticket.x.y');
    const bare = harness((url) => (url.includes('/ticket') ? ticketAnswer('x.y') : json({}, 500)));
    const second = wsTransport(DECK, TAB, facts({ url: null, ticket: null }), bare.deps);
    bare.open(second);
    await bare.clock.flush();
    expect(bare.errors[0]).toMatchObject({ status: 503, code: 'no_room_url' });
    expect(bare.hub.opens()).toBe(0);
  });

  test('the HTTP belt carries the ops and the presence while the socket is down, with the ticket as the header; a 401 marks the ticket stale', async () => {
    const h = harness((url, init) => {
      if (url.includes('/ticket')) return ticketAnswer('renewed.mac');
      if (url.endsWith('/rooms/deck-one/ops')) {
        const auth = new Headers(init?.headers).get('authorization');
        if (auth === 'Ticket payload.mac') return json({ error: 'ticket' }, 401);
        return json({ ok: true, entries: [], rejected: [], head: 4, revision: 2 });
      }
      if (url.endsWith('/rooms/deck-one/presence')) return json({ ok: true });
      if (url.endsWith('/rooms/deck-one/presence?leave=1')) return json({ ok: true });
      return json({}, 500);
    });
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    const first = await transport.postOps(opsPost());
    expect(first).toMatchObject({ ok: false, status: 401, code: 'ticket' });
    expect(h.fetch.calls[0]?.url).toBe(`http://127.0.0.1:8792/rooms/${DECK}/ops`);
    expect(new Headers(h.fetch.calls[0]?.init?.headers).get('authorization')).toBe(
      'Ticket payload.mac',
    );
    // stale now: the next belt call fetches a ticket first and posts under it
    const second = await transport.postOps(opsPost());
    expect(second).toMatchObject({ ok: true, head: 4, revision: 2 });
    expect(h.fetch.calls.map((c) => c.url)).toEqual([
      `http://127.0.0.1:8792/rooms/${DECK}/ops`,
      `/api/decks/${DECK}/ticket`,
      `http://127.0.0.1:8792/rooms/${DECK}/ops`,
    ]);
    expect(new Headers(h.fetch.calls[2]?.init?.headers).get('authorization')).toBe(
      'Ticket renewed.mac',
    );
    await transport.postPresence(presence(1));
    expect(h.fetch.calls[3]?.url).toBe(`http://127.0.0.1:8792/rooms/${DECK}/presence`);
    await transport.postPresence(presence(2), { leave: true });
    expect(h.fetch.calls[4]?.url).toBe(`http://127.0.0.1:8792/rooms/${DECK}/presence?leave=1`);
    expect(h.fetch.calls[4]?.init?.keepalive).toBe(true);
    expect(new Headers(h.fetch.calls[4]?.init?.headers).get('authorization')).toBe(
      'Ticket renewed.mac',
    );
  });

  test('presence on the socket: a state goes as a frame, a heartbeat that changed nothing is the literal ping, the leave is a leave frame', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    await transport.postPresence(presence(1, { slideId: 'one' }));
    await transport.postPresence(presence(2, { slideId: 'one' }));
    await transport.postPresence(presence(3, { slideId: 'two' }));
    await transport.postPresence(presence(4, { slideId: 'two' }));
    // a woken object's resend, or a frame it refused: the next post is the whole state again
    socket.push({ type: 'resend' });
    await transport.postPresence(presence(5, { slideId: 'two' }));
    socket.push({ t: 'presence-refused', reason: 'budget' });
    await transport.postPresence(presence(6, { slideId: 'two' }));
    await transport.postPresence(presence(7, { slideId: 'two' }), { leave: true });
    expect(socket.frames()).toEqual([
      { t: 'presence', ...presence(1, { slideId: 'one' }) },
      HEARTBEAT_REQUEST,
      { t: 'presence', ...presence(3, { slideId: 'two' }) },
      HEARTBEAT_REQUEST,
      { t: 'presence', ...presence(5, { slideId: 'two' }) },
      { t: 'presence', ...presence(6, { slideId: 'two' }) },
      { t: 'leave', clock: 7 },
    ]);
    expect(h.resends).toBe(1);
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('the ticket refresh at exp minus 120 s and at once on a reauth frame sends a ticket frame', async () => {
    const h = harness();
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    await h.clock.advance(600_000 - TICKET_REFRESH_LEAD_MS - 1000);
    expect(h.fetch.calls).toHaveLength(0);
    await h.clock.advance(1000);
    expect(h.fetch.calls.map((c) => c.url)).toEqual([`/api/decks/${DECK}/ticket?client=${CLIENT}`]);
    expect(socket.frames()).toEqual([{ t: 'ticket', ticket: 'fresh.mac' }]);
    socket.push({ t: 'reauth' });
    await h.clock.flush();
    expect(h.fetch.calls).toHaveLength(2);
    expect(socket.frames()).toHaveLength(2);
    // the next refresh is armed from the new expiry
    expect(h.clock.armed()).toBeGreaterThan(0);
    transport.dispose();
    expect(h.clock.armed()).toBe(0);
  });

  test('the browser’s offline event closes the socket and reports once', async () => {
    const h = harness();
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    h.deps.window = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.get(type)?.delete(listener);
      },
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const transport = wsTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    const socket = await accept(h);
    expect(listeners.get('offline')?.size).toBe(1);
    for (const listener of listeners.get('offline') ?? [])
      (listener as EventListener)(new Event('offline'));
    await h.clock.flush();
    expect(socket.closedByClient).not.toBeNull();
    expect(h.errors).toEqual([{ message: 'the browser went offline' }]);
    expect(listeners.get('offline')?.size).toBe(0);
  });
});

describe('roomTransport: the choice and the switch (3.8)', () => {
  test('the payload’s tier picks the wire', () => {
    const h = harness();
    expect(roomTransport(DECK, TAB, { tier: 'blob', seq: 0, notice: 'x' }, h.deps).kind()).toBe(
      'sse',
    );
    expect(roomTransport(DECK, TAB, { tier: 'memory', seq: 0 }, h.deps).kind()).toBe('sse');
    expect(roomTransport(DECK, TAB, facts(), h.deps).kind()).toBe('ws');
    expect(roomTransport(DECK, TAB, undefined, h.deps).kind()).toBe('sse');
  });

  test('4503 asks the ticket route: blob switches to the stream at once, do keeps the wait', async () => {
    let tier = 'blob';
    const h = harness((url) =>
      url.includes('/ticket')
        ? json({ ticket: 'x.y', expiresAt: T0 + 600_000, tier })
        : json({}, 500),
    );
    const transport = roomTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    (await accept(h)).closeFromServer(CLOSE_CODES.tier, '');
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 503, code: 'tier', retryAfterMs: 0 });
    expect(transport.kind()).toBe('sse');
    // the other way: a socket transport told `do` keeps its wait and its wire
    tier = 'do';
    const second = roomTransport(DECK, TAB, facts(), h.deps);
    h.errors.length = 0;
    h.open(second);
    (await accept(h)).closeFromServer(CLOSE_CODES.tier, 'retry-after=9');
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 503, code: 'tier', retryAfterMs: 9000 });
    expect(second.kind()).toBe('ws');
  });

  test('the stream route’s 503 tier switches to the socket once a ticket and a URL are known', async () => {
    const h = harness((url) => {
      if (url.includes('/stream?'))
        return json({ error: 'tier', tier: 'do' }, 503, { 'retry-after': '30' });
      if (url.includes('/ticket')) return ticketAnswer('x.y', { url: URL_WS });
      return json({}, 500);
    });
    const transport = roomTransport(DECK, TAB, { tier: 'blob', seq: 0, notice: null }, h.deps);
    expect(transport.kind()).toBe('sse');
    h.open(transport);
    await h.clock.flush();
    expect(h.errors[0]).toMatchObject({ status: 503, code: 'tier', retryAfterMs: 0 });
    expect(transport.kind()).toBe('ws');
    h.open(transport);
    await h.clock.flush();
    expect(h.hub.last().protocols).toEqual(['turboslide.v1', 'ticket.x.y']);
  });

  test('after 30 s of failed opens the ticket route is asked and blob is the stream', async () => {
    const h = harness((url) =>
      url.includes('/ticket')
        ? json({ ticket: 'x.y', expiresAt: T0 + 600_000, tier: 'blob' })
        : json({}, 500),
    );
    const transport = roomTransport(DECK, TAB, facts(), h.deps);
    h.open(transport);
    await h.clock.flush();
    h.hub.last().closeFromServer(1006, '');
    await h.clock.flush();
    expect(h.errors[0]?.status).toBeUndefined();
    expect(h.fetch.calls).toHaveLength(0);
    await h.clock.advance(TRANSPORT_FALLBACK_AFTER_MS);
    h.open(transport);
    await h.clock.flush();
    h.hub.last().closeFromServer(1006, '');
    await h.clock.flush();
    expect(h.fetch.calls.map((c) => c.url)).toEqual([`/api/decks/${DECK}/ticket`]);
    expect(h.errors[1]).toMatchObject({ retryAfterMs: 0 });
    expect(transport.kind()).toBe('sse');
  });

  test('a failure the client reads: StreamFailure shape, with the ladder for a bare close', () => {
    const failure: StreamFailure = closeFailure(1006, '');
    expect(failure.status).toBeUndefined();
    const response: OpsResponse = { ok: false, status: 401, code: 'ticket', message: 'x' };
    expect(response.ok).toBe(false);
  });
});
