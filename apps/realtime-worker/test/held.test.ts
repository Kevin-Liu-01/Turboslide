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

// The object answers which op ids its log holds (RELIABILITY-6, hardening HR-RT#14): an entry it
// admitted is held before any checkpoint commits it, so the recovered writes plate never offers it.

describe('the held route of the object', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('held');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('answers the op ids its log holds, committed or not, and refuses a body without a list', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'a')], [splice(1, 0, 'b')]]));
    await a.next(isAck(1));
    const ask = async (body: unknown): Promise<Response> =>
      call(`/rooms/${deck}/held`, { method: 'POST', body: JSON.stringify(body) });
    const before = (await (
      await ask({ opIds: [`${CID_A}:1`, `${CID_A}:2`, `${CID_A}:9`, 'nonsense'] })
    ).json()) as {
      held: string[];
    };
    expect(before.held).toEqual([`${CID_A}:1`, `${CID_A}:2`]);
    expect(app.checkpoints).toHaveLength(0);
    await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    const after = (await (await ask({ opIds: [`${CID_A}:2`] })).json()) as { held: string[] };
    expect(after.held).toEqual([`${CID_A}:2`]);
    expect((await ask({})).status).toBe(400);
    a.close();
  });
});
