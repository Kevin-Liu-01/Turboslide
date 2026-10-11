import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckRoom } from '../src/deck-room.ts';
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

// A 404 from the checkpoint route keeps the tail unless the deck is gone for good (RELIABILITY-10,
// hardening HR-RT#7): a 404 without `gone` (a deployment without the route, an app origin that
// names a deleted preview) and a `gone` the seed route contradicts keep every entry, and the
// alarm tries again on its backoff.

describe('a 404 from the checkpoint route', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('gone');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
    vi.useRealTimers();
  });

  async function tail(): Promise<{ head: number; covered: number }> {
    return (await (await call(`/rooms/${deck}/counters`)).json()) as {
      head: number;
      covered: number;
    };
  }

  for (const [label, setup] of [
    ['a 404 without gone', (row: FakeApp) => (row.notFoundPlain = true)],
    ['gone while the seed route serves the deck', (row: FakeApp) => (row.gone = true)],
  ] as const) {
    it(`keeps the tail on ${label}, arms the alarm, and commits once the route answers`, async () => {
      const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
      const a = await connect(deck, await mint({ deck, cid: CID_A }));
      await a.next(isEvent('hello'));
      a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'kept ')]]));
      await a.next(isAck(1));
      setup(app);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 2500);
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      vi.useRealTimers();
      expect(await tail()).toMatchObject({ head: 1, covered: 0 });
      const armed = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
        state.storage.getAlarm(),
      );
      expect(armed).not.toBeNull();
      app.notFoundPlain = false;
      app.gone = false;
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
      expect(await tail()).toMatchObject({ head: 1, covered: 1 });
      expect(app.records).toHaveLength(1);
      const dead = (await (await call(`/rooms/${deck}/dead-letters`)).json()) as {
        rows: unknown[];
      };
      expect(dead.rows).toEqual([]);
      a.close();
    });
  }
});
