import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dropFlagCache } from '../src/control.ts';
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

// One slow deck no longer moves every deck to the blob tier (RELIABILITY-12; hardening HR-RT#11):
// a checkpoint that passes its deadline is the deck's, so two of them on one object leave the
// D1 `callbacks` row alone, while two checkpoints with no answer for another reason (the
// connection lost) still write it as failing, and the next answer writes it back to ok. The
// object's deadline is shortened to 200 ms for the test; the fake app's checkpoint route answers
// nothing until the object aborts it.

async function callbacksRow(): Promise<string | null> {
  const row = await env.ACCOUNTS.prepare("SELECT v FROM rt_flags WHERE k = 'callbacks'").first<{
    v: string;
  }>();
  return row?.v ?? null;
}

async function flush(deck: string): Promise<number> {
  const response = await call(`/rooms/${deck}/flush`, { method: 'POST' });
  await response.text();
  return response.status;
}

describe('the callbacks row and a slow checkpoint', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(async () => {
    deck = uniqueDeck('callbacks');
    app = fakeApp(deck);
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  afterEach(async () => {
    app.restore();
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  it('leaves callbacks at ok after two checkpoint deadlines, and flags two lost connections', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'd')]]));
    await a.next(isAck(1));
    await runInDurableObject(stub, async (instance: DeckRoom, state) => {
      (instance as unknown as { checkpointDeadlineMs: number }).checkpointDeadlineMs = 200;
      // the idle alarm takes a checkpoint of its own between two flushes on a loaded machine
      await state.storage.deleteAlarm();
      (instance as unknown as { alarmAt: number | null }).alarmAt = null;
    });

    // two checkpoints pass their deadline: the deck's, not the deployment's
    app.hangTimes = 2;
    const before = app.checkpoints.length;
    expect(await flush(deck)).toBe(500);
    expect(await flush(deck)).toBe(500);
    expect(app.checkpoints.length - before).toBe(2);
    expect(app.hangTimes).toBe(0);
    expect(await callbacksRow()).toBeNull();
    const health = (await (await call('/health')).json()) as { callbacks: string };
    expect(health.callbacks).toBe('ok');

    // two checkpoints whose connection is lost: the deployment's, so the row reads failing
    app.loseAnswerTimes = 2;
    expect(await flush(deck)).toBe(500);
    expect(await flush(deck)).toBe(500);
    expect(await callbacksRow()).toMatch(/^failing:\d+:0$/);

    // the next answer writes it back
    expect(await flush(deck)).toBe(200);
    expect(await callbacksRow()).toMatch(/^ok:\d+$/);
    a.close();
  });
});
