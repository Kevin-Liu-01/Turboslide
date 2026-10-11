import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REFUSED_BY_STORE } from '../src/deck-room.ts';
import {
  CID_A,
  call,
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

// A run the store refused reaches its author (RELIABILITY-11, hardening HR-RT#9): the route answers
// 409 `refused` with the op ids, the object sends the author a `reject` with the text, keeps the
// entry as a dead letter, reads its document from the store again and tells every tab to reload.
// The post names the object's protocol and schema version.

describe('runs the store refused', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('refused');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('returns a refused run to its author, keeps it as a dead letter, and reloads the tabs', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'kept ')], [splice(5, 0, 'refused ')]]));
    await a.next(isAck(1));
    app.refuseOpIds = [`${CID_A}:2`];
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { covered: number; head: number };
    expect(flushed).toMatchObject({ covered: 2, head: 2 });
    expect(app.protocols[0]).toBe('1');
    const reject = eventOf(await a.next(isEvent('reject')), 'reject');
    expect(reject).toMatchObject({
      opId: `${CID_A}:2`,
      reason: 'invalid',
      message: REFUSED_BY_STORE,
    });
    expect(reject.mutations).toEqual([splice(5, 0, 'refused ')]);
    expect(eventOf(await a.next(isEvent('resync')), 'resync').revision).toBe(1);
    const dead = (await (await call(`/rooms/${deck}/dead-letters`)).json()) as {
      rows: { opId: string; reason: string }[];
    };
    expect(dead.rows).toMatchObject([{ opId: `${CID_A}:2`, reason: 'store-refused' }]);
    // the object reads its document from the store again (the loader reads the store on a 204),
    // and the store never held the refused text
    expect((await call(`/rooms/${deck}/document`)).status).toBe(204);
    const slide = app.document.slides['content-rule'] as unknown as {
      slots: Record<string, { id: string; text?: string }[]>;
    };
    const paragraph = Object.values(slide.slots)
      .flat()
      .find((row) => row.id === 'p1');
    expect(paragraph?.text?.startsWith('kept ')).toBe(true);
    expect(paragraph?.text?.includes('refused')).toBe(false);
    a.close();
  });
});
