import {
  createExecutionContext,
  createScheduledController,
  env,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sweepOpenDecks } from '../src/control.ts';
import type { OpenDeck } from '../src/control.ts';
import type { DeckRoom } from '../src/deck-room.ts';
import worker from '../src/index.ts';
import {
  CID_A,
  call,
  connect,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The Worker's sweep (RELIABILITY-8, hardening HR-RT#6c): every five minutes the scheduled
// handler pokes each object `rt_open` names; one whose oldest uncommitted entry waited more than
// two minutes checkpoints at once, so a tail never rests on its alarm alone. `GET /control/open`
// answers each open deck's head, covered seq and the age of its oldest uncommitted entry.

/** The objects as the router calls them (index.ts `objectsOf`). */
async function callRoom(deckId: string, tail: string, method: 'GET' | 'POST') {
  const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deckId));
  const response = await stub.fetch(`https://rooms.internal/rooms/${deckId}/${tail}`, { method });
  return (await response.json()) as Record<string, unknown>;
}

const sweep = () => sweepOpenDecks(env.ACCOUNTS, callRoom);

async function openList(): Promise<OpenDeck[]> {
  return ((await (await call('/control/open')).json()) as { decks: OpenDeck[] }).decks;
}

describe('the sweep of the open decks', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('sweep');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
    vi.useRealTimers();
  });

  it('answers each open deck with its head, covered seq and the age of its tail', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'x')]]));
    await a.next(isAck(1));
    const row = (await openList()).find((item) => item.deckId === deck);
    expect(row).toMatchObject({ deckId: deck, head: 1, covered: 0, sockets: 1 });
    expect(typeof row?.openedAt).toBe('number');
    expect(row?.ageMs).toBeGreaterThanOrEqual(0);
    expect(row?.ageMs).toBeLessThan(60_000);
    a.close();
  });

  it('pokes a stale tail once per sweep, leaves a fresh one, and lets the deck go once it commits', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'swept ')]]));
    await a.next(isAck(1));
    // the route refuses every checkpoint while the socket closes: the tail stays, and so does the row
    app.failTimes = 1_000;
    a.close();
    await a.closed;
    for (let i = 0; i < 50 && app.checkpoints.length === 0; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await openList()).map((row) => row.deckId)).toContain(deck);
    // the object's alarm is gone (an eviction, a runtime that gave up): the sweep is what is left
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const dropAlarm = () =>
      runInDurableObject(stub, async (_instance: DeckRoom, state) => {
        await state.storage.deleteAlarm();
      });
    await dropAlarm();
    // a fresh tail is the alarm's: the sweep leaves it
    let posted = app.checkpoints.length;
    expect((await sweep()).poked).toBe(0);
    expect(app.checkpoints).toHaveLength(posted);
    // three minutes on: the sweep pokes it once, the route still refuses, the tail stays
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 180_000);
    const first = await sweep();
    expect(first.poked).toBe(1);
    expect(app.checkpoints).toHaveLength(posted + 1);
    expect((await openList()).find((row) => row.deckId === deck)).toMatchObject({
      head: 1,
      covered: 0,
    });
    await dropAlarm();
    // the next sweep, through the scheduled handler: the route answers, the tail commits once,
    // and the deck leaves the list
    app.failTimes = 0;
    posted = app.checkpoints.length;
    vi.setSystemTime(Date.now() + 300_000);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: '*/5 * * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    vi.useRealTimers();
    expect(app.checkpoints).toHaveLength(posted + 1);
    expect(app.records).toHaveLength(1);
    expect((await openList()).map((row) => row.deckId)).not.toContain(deck);
  });
});
