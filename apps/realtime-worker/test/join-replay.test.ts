import { env, evictDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeckRoom } from '../src/deck-room.ts';
import {
  ANON_B,
  CID_A,
  CID_B,
  connect,
  eventOf,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The join frame's hello replays from the socket's `since` (docs/CLOUDFLARE.md 3.2 "A join":
// hello, then the replay (since, head]). The transport carries the ticket in the first frame
// after an upgrade closed before it opened (transport.ts `joinMode`), and it keeps that carrier
// for every later open of the page. Before this fix the join's hello replayed from the head
// whatever the URL named, so a tab that reopened behind the head read the hello's head, received
// no entry under it and buffered every later op above a gap no replay filled: the next reopen of
// the gap watch was a join again, and only the tab's own write (the ack's `between`) or a resync
// brought the missing entries.

function stubOf(deck: string): DurableObjectStub<DeckRoom> {
  return env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
}

describe('DeckRoom join frame replay', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('join');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('replays the entries above the since the join socket named', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'a')], [splice(1, 0, 'b')]]));
    await a.next(isAck(1));

    const b = await connect(deck, null, { protocols: 'turboslide.v1', query: '?since=0' });
    b.send({ t: 'join', ticket: await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }) });
    const hello = eventOf(await b.next(isEvent('hello')), 'hello');
    expect(hello.seq).toBe(2);
    const replay = eventOf(await b.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([1, 2]);
    a.close();
    b.close();
  });

  it('replays nothing for a join socket whose URL names no since', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'a')]]));
    await a.next(isAck(1));

    const b = await connect(deck, null, { protocols: 'turboslide.v1' });
    b.send({ t: 'join', ticket: await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }) });
    expect(eventOf(await b.next(isEvent('hello')), 'hello').seq).toBe(1);
    expect(eventOf(await b.next(isEvent('ops')), 'ops').entries).toEqual([]);
    a.close();
    b.close();
  });

  it('keeps the since through a hibernation wake before the join', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'a')], [splice(1, 0, 'b')]]));
    await a.next(isAck(1));

    const b = await connect(deck, null, { protocols: 'turboslide.v1', query: '?since=1' });
    await evictDurableObject(stubOf(deck));
    b.send({ t: 'join', ticket: await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }) });
    expect(eventOf(await b.next(isEvent('hello')), 'hello').seq).toBe(2);
    const replay = eventOf(await b.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([2]);
    a.close();
    b.close();
  });
});
