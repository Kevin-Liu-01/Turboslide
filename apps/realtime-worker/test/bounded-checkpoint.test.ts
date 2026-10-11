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

// The object continues from a partial answer (RELIABILITY-1 fix 5, hardening HR-RT#4): it asks
// the route for the bound with its header, covers up to the `toSeq` the answer names, and posts
// the rest on its next call; a flush and the last close make the calls until the tail is covered.

describe('a checkpoint the route bounds', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('bounded');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('covers what the answer names, posts the rest next, and commits every entry once', async () => {
    app.budgetEntries = 2;
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(
      opsFrame(CID_A, 1, 0, 1, [
        [splice(0, 0, 'a')],
        [splice(1, 0, 'b')],
        [splice(2, 0, 'c')],
        [splice(3, 0, 'd')],
        [splice(4, 0, 'e')],
      ]),
    );
    await a.next(isAck(1));
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { covered: number; head: number; revision: number };
    expect(flushed).toMatchObject({ covered: 5, head: 5, revision: 3 });
    expect(app.bounded).toEqual([true, true, true]);
    expect(app.checkpoints.map((row) => [row.fromSeq, row.entries.length])).toEqual([
      [1, 5],
      [3, 3],
      [5, 1],
    ]);
    // every entry is in the store once
    expect(app.records.flatMap((record) => record.origin?.opIds ?? [])).toEqual([
      `${CID_A}:1`,
      `${CID_A}:2`,
      `${CID_A}:3`,
      `${CID_A}:4`,
      `${CID_A}:5`,
    ]);
    a.close();
  });
});
