import {
  SELF,
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOSE_CODES } from '@turboslide/realtime/frames';

import { dropFlagCache } from '../src/control.ts';
import type { DeckRoom } from '../src/deck-room.ts';
import { CALLBACK_FAILURES_BEFORE_FLAG, DECK_KEY, META_UPSERT_ROWS } from '../src/deck-room.ts';
import {
  ANON_B,
  CID_A,
  CID_B,
  ORIGIN,
  call,
  connect,
  eventOf,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  presenceFrame,
  sleep,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The object across a hibernation wake and against an app it cannot reach (VERIFICATION.md
// "Realtime round, pass 1" findings 1, 6, 7, 10, 11 and 12; docs/CLOUDFLARE.md 3.3, 3.4 item 7,
// 3.5, 3.8). The plugin's `evictDurableObject` tears the instance down and keeps its storage and
// hibernates the open sockets, once nothing holds the instance: a pending timer or an unread
// response body holds it until the plugin's 25 s drain (measured 2026-10-02 on
// @cloudflare/vitest-plugin 1.3.5: 25,002 ms after a seed under `AbortSignal.timeout(25_000)`,
// 1 ms once the object's deadlines clear on settle, `withDeadline`; build/r1.md R1-R6d read the
// helper as never completing under a 5 s test timeout). `runInDurableObject` and
// `runDurableObjectAlarm` reach the instance without its `fetch`, so nothing they do names the
// deck to it.

type Counters = Record<string, number>;
type CountersAnswer = {
  countsSelf: boolean;
  selfRowsWritten: number;
  durable: boolean;
  sinceWake: Counters;
  total: Counters;
  head: number;
  covered: number;
};

async function counters(deck: string): Promise<CountersAnswer> {
  return (await (await call(`/rooms/${deck}/counters`)).json()) as CountersAnswer;
}

function stubOf(deck: string): DurableObjectStub<DeckRoom> {
  return env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
}

describe('DeckRoom across a wake', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('wake');
    app = fakeApp(deck);
  });

  afterEach(async () => {
    app.restore();
    vi.useRealTimers();
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  it('names its deck after a hibernation wake: the ticket refresh verifies and the alarm checkpoints to the deck (finding 1)', async () => {
    const stub = stubOf(deck);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    // the deck id is kept where a wake whose id carries no name reads it
    const kept = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.kv.get<string>(DECK_KEY),
    );
    expect(kept).toBe(deck);
    const awakeBefore = await runInDurableObject(
      stub,
      (instance: DeckRoom) => (instance as unknown as { awakeSince: number }).awakeSince,
    );

    await evictDurableObject(stub);

    // the next frame wakes the object through the hibernated socket alone: no fetch names the
    // deck, the constructor runs again and asks for presence (`resend`)
    a.send({ t: 'ticket', ticket: await mint({ deck, cid: CID_A }) });
    expect((await a.next((frame) => frame.kind === 'resend')).kind).toBe('resend');
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'w')]]));
    const ack = await a.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok).toBe(true);
    const woke = await runInDurableObject(stub, (instance: DeckRoom) => ({
      awakeSince: (instance as unknown as { awakeSince: number }).awakeSince,
      deckId: (instance as unknown as { deckId: string | null }).deckId,
    }));
    expect(woke.awakeSince).toBeGreaterThan(awakeBefore);
    expect(woke.deckId).toBe(deck);

    // the alarm after the wake posts to this deck's checkpoint route (before the fix the post
    // went to /api/decks//checkpoint and the route answered 404)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2500);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    vi.useRealTimers();
    expect(app.checkpoints).toHaveLength(1);
    expect(app.checkpoints[0]).toMatchObject({ fromSeq: 1, toSeq: 1 });
    expect(app.revision).toBe(1);

    // the socket the refreshed ticket rode is still open: a second edit is acknowledged
    a.send(opsFrame(CID_A, 2, 1, 2, [[splice(1, 0, 'x')]]));
    const second = await a.next(isAck(2));
    expect(second.kind === 'ack' && second.frame.ok).toBe(true);
    let closedEarly = false;
    void a.closed.then(() => {
      closedEarly = true;
    });
    await sleep(50);
    expect(closedEarly).toBe(false);
    a.close();
  });

  it('keeps its counters across a wake: the total a read answers is never lower after it (finding 6)', async () => {
    const stub = stubOf(deck);
    // the HTTP belt and the bearer routes alone, so no socket holds the eviction for 25 s
    const ticket = await mint({ deck, cid: CID_A });
    const posted = await SELF.fetch(`https://rooms.test/rooms/${deck}/ops`, {
      method: 'POST',
      headers: {
        authorization: `Ticket ${ticket}`,
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: CID_A,
        base: { seq: 0 },
        entries: [{ opId: `${CID_A}:1`, kind: 'edit', mutations: [splice(0, 0, 'c')] }],
      }),
    });
    expect(posted.status).toBe(200);
    // every answer read to its end: an unread body is a reference that holds the eviction
    await posted.text();
    await (await call(`/rooms/${deck}/flush`, { method: 'POST' })).text();
    expect(app.checkpoints).toHaveLength(1);
    const before = await counters(deck);
    expect(before.durable).toBe(true);
    expect(before.selfRowsWritten).toBe(META_UPSERT_ROWS);
    expect(before.total.requestUnits).toBeGreaterThan(0);

    await evictDurableObject(stub);

    const after = await counters(deck);
    expect(after.sinceWake.wakes).toBe(1);
    expect(after.sinceWake.requests).toBe(1);
    for (const field of [
      'requests',
      'opsFrames',
      'checkpoints',
      'rowsWritten',
      'rowsRead',
      'requestUnits',
    ])
      expect(after.total[field] ?? 0, field).toBeGreaterThanOrEqual(before.total[field] ?? 0);
    expect(after.total.wakes).toBe((before.total.wakes ?? 0) + 1);
    // the one request between the readings is the second read itself (countsSelf)
    expect((after.total.requests ?? 0) - (before.total.requests ?? 0)).toBe(1);
  });

  it('makes no app call and no row for an upgrade without a ticket until its join verifies (finding 12)', async () => {
    const stub = stubOf(deck);
    const stranger = await connect(deck, null, { protocols: 'turboslide.v1' });
    await sleep(100);
    expect(app.seeds).toHaveLength(0);
    const open = await env.ACCOUNTS.prepare('SELECT deck_id FROM rt_open WHERE deck_id = ?')
      .bind(deck)
      .first();
    expect(open).toBeNull();
    // the join window passes with no join: the socket closes 4401 and nothing was read
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6000);
    await runDurableObjectAlarm(stub);
    vi.useRealTimers();
    expect((await stranger.closed).code).toBe(CLOSE_CODES.ticket);
    expect(app.seeds).toHaveLength(0);

    // a join that verifies seeds then and says hello
    const joiner = await connect(deck, null, { protocols: 'turboslide.v1' });
    expect(app.seeds).toHaveLength(0);
    joiner.send({ t: 'join', ticket: await mint({ deck, cid: CID_A }) });
    await joiner.next(isEvent('hello'));
    expect(app.seeds).toHaveLength(1);
    joiner.close();
  });

  it('tells the router when the app does not answer its seed, and clears it once the app answers (finding 7)', async () => {
    app.seedFailTimes = CALLBACK_FAILURES_BEFORE_FLAG;
    for (let i = 0; i < CALLBACK_FAILURES_BEFORE_FLAG; i += 1) {
      const refused = await connect(deck, await mint({ deck, cid: CID_A }));
      const closed = await refused.closed;
      expect(closed).toMatchObject({ code: CLOSE_CODES.error, reason: 'seed failed' });
    }
    const failing = await env.ACCOUNTS.prepare(
      "SELECT v FROM rt_flags WHERE k = 'callbacks'",
    ).first<{
      v: string;
    }>();
    expect(failing?.v).toMatch(/^failing:\d+:302$/);
    dropFlagCache();
    const health = (await (await call('/health')).json()) as { callbacks: string };
    expect(health.callbacks).toBe('failing');

    // the app answers again: the hello, and the row back to ok
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const ok = await env.ACCOUNTS.prepare("SELECT v FROM rt_flags WHERE k = 'callbacks'").first<{
      v: string;
    }>();
    expect(ok?.v).toMatch(/^ok:\d+$/);
    // a checkpoint route that answers 5xx is the deck's (the tabs keep editing, the alarm
    // retries): two in a row write no failing row
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'z')]]));
    await a.next(isAck(1));
    app.failTimes = 2;
    const posts = app.checkpoints.length;
    for (let i = 0; i < 2; i += 1) {
      const flushed = await call(`/rooms/${deck}/flush`, { method: 'POST' });
      await flushed.text();
      expect(flushed.status).toBe(500);
    }
    expect(app.checkpoints.length - posts).toBe(2);
    const after = await env.ACCOUNTS.prepare("SELECT v FROM rt_flags WHERE k = 'callbacks'").first<{
      v: string;
    }>();
    expect(after?.v).toMatch(/^ok:\d+$/);
    a.close();
  });

  it('a 404 from a removed deck drops nothing but the tail and stops the retries (finding 10)', async () => {
    const stub = stubOf(deck);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'g')]]));
    await a.next(isAck(1));
    app.gone = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2500);
    // the alarm resolves: no throw, so the runtime does not retry it
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    vi.useRealTimers();
    expect(app.checkpoints).toHaveLength(1);
    const read = await counters(deck);
    expect(read).toMatchObject({ head: 1, covered: 1 });
    const alarm = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.getAlarm(),
    );
    expect(alarm).toBeNull();
    // no callbacks row: a 404 is the deck's and not the deployment's
    const flag = await env.ACCOUNTS.prepare("SELECT v FROM rt_flags WHERE k = 'callbacks'").first();
    expect(flag).toBeNull();
    a.close();
  });

  it('closes a reauthed socket with 4403 when no fresh ticket follows within the grace, across a wake (finding 9)', async () => {
    const stub = stubOf(deck);
    const c = await connect(deck, await mint({ deck, cid: CID_A, role: 'viewer', via: 'link' }));
    await c.next(isEvent('hello'));
    const asked = (await (
      await call(`/rooms/${deck}/access-changed`, { method: 'POST', body: '{}' })
    ).json()) as { asked: number };
    expect(asked.asked).toBe(1);
    await c.next((frame) => frame.kind === 'reauth');
    // the tab's ticket route refused (the record says Restricted): nothing comes up the socket,
    // and the object hibernates inside the grace; the deadline is the attachment's
    await evictDurableObject(stub);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10_100);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    vi.useRealTimers();
    expect(await c.closed).toMatchObject({
      code: CLOSE_CODES.forbidden,
      reason: 'reauth timed out',
    });
  });

  it('announces the leave of a tab that closes while the object slept, and gives a woken tab back its hue', async () => {
    const stub = stubOf(deck);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    b.send(presenceFrame(CID_B, 1));
    const before = eventOf(await a.next(isEvent('presence')), 'presence');
    expect(before.clientId).toBe(CID_B);
    await evictDurableObject(stub);
    // the woken object holds B's socket and no entry for B until B posts again
    b.send(presenceFrame(CID_B, 2, { slideId: 'title' }));
    const again = eventOf(await a.next(isEvent('presence')), 'presence');
    expect(again.state.hueSlot).toBe(before.state.hueSlot);
    await evictDurableObject(stub);
    b.close();
    // the close wakes the object with B restored from its attachment and no entry: the leave goes out
    const left = eventOf(await a.next(isEvent('leave')), 'leave');
    expect(left.clientId).toBe(CID_B);
    a.close();
  });

  it('runs the last close when the last socket closes while the object slept: the open row and the doc rows go', async () => {
    const stub = stubOf(deck);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'l')]]));
    await a.next(isAck(1));
    await (await call(`/rooms/${deck}/flush`, { method: 'POST' })).text();
    const openRow = () =>
      env.ACCOUNTS.prepare('SELECT deck_id FROM rt_open WHERE deck_id = ?').bind(deck).first();
    expect(await openRow()).not.toBeNull();
    await evictDurableObject(stub);
    a.close();
    await a.closed;
    for (let i = 0; i < 40 && (await openRow()) !== null; i += 1) await sleep(25);
    expect(await openRow()).toBeNull();
    const docRows = await runInDurableObject(
      stub,
      (_instance: DeckRoom, state) =>
        state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM doc').one().n,
    );
    expect(docRows).toBe(0);
  });

  it('answers a flush with a body the object does not read, and the router reads it whole (finding 11)', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'f')]]));
    await a.next(isAck(1));
    const flushed = await call(`/rooms/${deck}/flush`, {
      method: 'POST',
      body: JSON.stringify({ padding: 'x'.repeat(64 * 1024) }),
    });
    expect(flushed.status).toBe(200);
    expect(((await flushed.json()) as { covered: number }).covered).toBe(1);
    a.close();
  });
});
