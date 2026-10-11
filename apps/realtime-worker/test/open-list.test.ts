import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

// The open list keeps a deck while its tail is uncommitted (RELIABILITY-8, hardening HR-RT#6a; the
// probe P2 of docs/hardening/research/reliability.md): the last socket closes while the route
// refuses every checkpoint, and the deck stays in `GET /control/open`, where the drain finds the
// objects it must flush; once a later checkpoint commits the tail, the deck leaves the list.

async function openDecks(): Promise<string[]> {
  const body = (await (await call('/control/open')).json()) as { decks: { deckId: string }[] };
  return body.decks.map((row) => row.deckId);
}

describe('the open list after a failed close', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('open');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('keeps the deck listed while its tail is uncommitted, and lets it go once a later checkpoint commits it', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'kept ')]]));
    await a.next(isAck(1));
    expect(await openDecks()).toContain(deck);
    // every checkpoint is refused while the socket closes
    app.failTimes = 1_000;
    a.close();
    await a.closed;
    for (let i = 0; i < 50 && app.checkpoints.length === 0; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const state = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      head: number;
      covered: number;
      sockets: number;
    };
    expect(state).toMatchObject({ head: 1, covered: 0, sockets: 0 });
    // before the fix the close deleted the row with the tail still here
    expect(await openDecks()).toContain(deck);
    // the route answers again; the next checkpoint (an alarm, here a flush) commits the tail and
    // the deck lets go
    app.failTimes = 0;
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { covered: number };
    expect(flushed.covered).toBe(1);
    expect(app.records).toHaveLength(1);
    expect(await openDecks()).not.toContain(deck);
  });
});
