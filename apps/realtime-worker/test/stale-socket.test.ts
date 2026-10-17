import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLOSE_CODES } from '@turboslide/realtime/frames';

import type { DeckRoom } from '../src/deck-room.ts';
import {
  CID_A,
  CID_B,
  call,
  connect,
  eventOf,
  fakeApp,
  isEvent,
  mint,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp, Socket } from './lib.ts';

// Two sockets of one client id across a hibernation wake (the fan-out lane, 2026-10-17). Read on
// production: the tab's socket dropped at the edge without a close the object read, the room
// client reopened under the same client id through another colo, the object closed the older
// socket as retired, and the next HTTP write woke the object after it hibernated. The woken
// constructor rebuilt a member from every socket the runtime still held, the older one included,
// so both carried one client id: the map kept whichever came last, and the older socket's late
// close dropped the member the newer one shared. The tab read `connected` and heard nothing (no
// `resend`, no op, no checkpoint) until it sent a frame of its own. Here the older socket's
// attachment is given the newer one's client id and an earlier `joinedAt`, the state the runtime
// handed the woken object.

function stubOf(deck: string): DurableObjectStub<DeckRoom> {
  return env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
}

type Attached = { cid: string; joinedAt: number; claims: { cid: string } | null };

describe('DeckRoom with a stale socket of the same client', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('stale');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  const write = async (insert: string): Promise<void> => {
    const response = await call(`/rooms/${deck}/write`, {
      method: 'POST',
      body: JSON.stringify({
        author: { kind: 'agent', name: 'probe', principalId: 'agent:probe' },
        clientId: 'agent:probe',
        mutations: [splice(0, 0, insert)],
        baseRevision: app.revision,
      }),
    });
    expect(response.status).toBe(200);
    await response.text();
  };

  /** The older socket takes the newer one's client id in its attachment, an earlier join. */
  const makeStale = async (older: string, newer: string): Promise<void> => {
    await runInDurableObject(stubOf(deck), (_instance: DeckRoom, state) => {
      const sockets = state.getWebSockets();
      const of = (cid: string) =>
        sockets.find((ws) => (ws.deserializeAttachment() as Attached | null)?.cid === cid);
      const stale = of(older);
      const fresh = of(newer);
      if (stale === undefined || fresh === undefined) throw new Error('sockets not found');
      const kept = fresh.deserializeAttachment() as Attached;
      const was = stale.deserializeAttachment() as Attached;
      stale.serializeAttachment({
        ...was,
        cid: newer,
        joinedAt: kept.joinedAt - 1000,
        claims: was.claims === null ? null : { ...was.claims, cid: newer },
      });
    });
  };

  const opOf = async (socket: Socket): Promise<string> => {
    const entry = eventOf(await socket.next(isEvent('op')), 'op').entry;
    return JSON.stringify(entry.mutations);
  };

  it('keeps the fan-out on the newer socket after a wake, whatever the older one does', async () => {
    const older = await connect(deck, await mint({ deck, cid: CID_A }));
    await older.next(isEvent('hello'));
    const newer = await connect(deck, await mint({ deck, cid: CID_B }));
    await newer.next(isEvent('hello'));
    await makeStale(CID_A, CID_B);

    await evictDurableObject(stubOf(deck));

    // the write wakes the object; the newer socket hears the op
    await write('x');
    expect(await opOf(newer)).toContain('"insert":"x"');

    // the older socket's close arrives late: it never takes the newer socket's place
    older.close();
    const closed = await older.closed;
    await write('y');
    expect(await opOf(newer)).toContain('"insert":"y"');
    // the woken object closed the older socket itself, as superseded: one socket per client id
    expect(closed.code).toBe(CLOSE_CODES.superseded);
    newer.close();
  });
});
