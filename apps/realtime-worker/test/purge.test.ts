import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPLAY_MAX_ENTRIES } from '@turboslide/realtime/protocol';

import { RETAIN_ENTRIES } from '../src/deck-room.ts';
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

// A removed deck's object deletes its storage (RELIABILITY-20; hardening HR-RT#13). Before this no
// path called `deleteAll`: a deck's committed entries stayed in the object's SQLite after its
// sockets closed, every entry of a deck under 10,000 entries among them, and `/rooms/:id/purge`
// was no route. The function posts the purge under the bearer once the store removed the deck.
// The test leaves three committed entries and one uncommitted one in the object, with a socket
// open and the alarm armed, then purges: the socket closes with 4403 `gone`, no table and no alarm
// is left, the deck's `rt_open` row is gone, the tail is never posted to the app, and the object
// answers 404 `gone` until it is evicted.

async function userTables(deck: string): Promise<{ tables: string[]; alarm: number | null }> {
  const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
  return runInDurableObject(stub, async (_instance, state) => ({
    tables: state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map((row) => row.name)
      .filter((name) => !name.startsWith('_cf_') && !name.startsWith('sqlite_')),
    alarm: await state.storage.getAlarm(),
  }));
}

async function openRow(deck: string): Promise<unknown> {
  return env.ACCOUNTS.prepare('SELECT deck_id FROM rt_open WHERE deck_id = ?').bind(deck).first();
}

describe('the purge of a removed deck', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('purge');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('leaves no table, no alarm and no open row, and posts no tail', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    for (let req = 1; req <= 3; req += 1) {
      a.send(opsFrame(CID_A, req, req - 1, req, [[splice(0, 0, `w${req} `)]]));
      await a.next(isAck(req));
    }
    const flushed = await call(`/rooms/${deck}/flush`, { method: 'POST' });
    expect(flushed.status).toBe(200);
    await flushed.text();
    const posted = app.checkpoints.length;
    // one more entry stays uncommitted, behind the idle alarm
    a.send(opsFrame(CID_A, 4, 3, 4, [[splice(0, 0, 'tail ')]]));
    await a.next(isAck(4));
    const before = await userTables(deck);
    expect(before.tables).toEqual(expect.arrayContaining(['meta', 'doc']));
    expect(before.tables.some((name) => name.startsWith('entries_'))).toBe(true);
    expect(before.alarm).not.toBeNull();
    expect(await openRow(deck)).not.toBeNull();

    const purge = await call(`/rooms/${deck}/purge`, { method: 'POST' });
    expect(purge.status).toBe(200);
    expect(await purge.json()).toEqual({ ok: true, purged: true });
    expect(await a.closed).toEqual({ code: 4403, reason: 'gone' });

    const after = await userTables(deck);
    expect(after).toEqual({ tables: [], alarm: null });
    expect(await openRow(deck)).toBeNull();
    expect(app.checkpoints.length).toBe(posted);

    // the instance answers gone until it is evicted, and a second purge is a no-op
    const flush = await call(`/rooms/${deck}/flush`, { method: 'POST' });
    expect(flush.status).toBe(404);
    expect(await flush.json()).toEqual({ error: 'not_found', gone: true });
    const again = await call(`/rooms/${deck}/purge`, { method: 'POST' });
    expect(again.status).toBe(200);
    await again.text();
    expect(app.checkpoints.length).toBe(posted);
  });

  it('refuses a purge without the bearer', async () => {
    const response = await call(`/rooms/${deck}/purge`, {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-bearer' },
    });
    expect(response.status).toBe(401);
    await response.text();
  });

  it('keeps the replay window behind covered, not 10,000 entries', () => {
    expect(RETAIN_ENTRIES).toBe(REPLAY_MAX_ENTRIES);
    expect(RETAIN_ENTRIES).toBe(2000);
  });
});
