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

// A storage that refuses writes hands the tabs to the blob tier (RELIABILITY-22; hardening
// HR-RT#12). On the Workers Free plan, past 100,000 rows written in a UTC day "further operations
// of that type will fail with an error" (docs/CLOUDFLARE.md 1.3): the object's INSERT throws, and
// before this every ops frame answered 500 while `/health` said `callbacks: ok`, so the function
// kept its tabs on an object where nothing saved until 00:00 UTC. The test injects the cap's
// error into the object's SQL for every write; two refused writes in a row write the D1
// `callbacks` row as `failing:<ms>:storage:Error`, which `/health` answers and the function's flag
// reads as off, and a checkpoint the app answers meanwhile leaves it so. The head in memory goes
// back with the rolled back transaction, so the first write after the storage recovers takes the
// next seq, and the next answered checkpoint writes the row back to ok.

const CAP_ERROR = 'Exceeded allowed rows written in Durable Objects free tier.';

async function callbacksRow(): Promise<string | null> {
  const row = await env.ACCOUNTS.prepare("SELECT v FROM rt_flags WHERE k = 'callbacks'").first<{
    v: string;
  }>();
  return row?.v ?? null;
}

async function healthCallbacks(): Promise<string> {
  dropFlagCache();
  const health = (await (await call('/health')).json()) as { callbacks: string };
  return health.callbacks;
}

/** Makes the object's SQL refuse every write (`on`) or take them again (`off`). */
async function refuseWrites(deck: string, on: boolean): Promise<void> {
  const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
  await runInDurableObject(stub, async (instance: DeckRoom) => {
    const db = (instance as unknown as { db: { sql: SqlStorage & { real?: SqlStorage } } }).db;
    if (!on) {
      if (db.sql.real !== undefined) db.sql = db.sql.real;
      return;
    }
    const real = db.sql;
    db.sql = {
      real,
      exec: (query: string, ...bindings: SqlStorageValue[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(query)) throw new Error(CAP_ERROR);
        return real.exec(query, ...bindings);
      },
      get databaseSize() {
        return real.databaseSize;
      },
    } as unknown as SqlStorage & { real: SqlStorage };
  });
}

describe('a storage that refuses writes', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(async () => {
    deck = uniqueDeck('storage');
    app = fakeApp(deck);
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  afterEach(async () => {
    app.restore();
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  it('writes callbacks as failing with the storage class, and ok once a write lands', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'zero ')]]));
    const zero = await a.next(isAck(1));
    expect(zero.kind === 'ack' && zero.frame.ok).toBe(true);
    await refuseWrites(deck, true);

    // one refused write is not yet the deployment's word
    a.send(opsFrame(CID_A, 2, 1, 2, [[splice(0, 0, 'one ')]]));
    const first = await a.next(isAck(2));
    expect(first.kind === 'ack' && !first.frame.ok && first.frame.status).toBe(500);
    expect(await callbacksRow()).toBeNull();

    // the second in a row writes the row, and /health answers failing
    a.send(opsFrame(CID_A, 3, 1, 2, [[splice(0, 0, 'one ')]]));
    const second = await a.next(isAck(3));
    expect(second.kind === 'ack' && !second.frame.ok && second.frame.status).toBe(500);
    expect(await callbacksRow()).toMatch(/^failing:\d+:storage:Error$/);
    expect(await healthCallbacks()).toBe('failing');

    // the app answers a checkpoint while the storage still refuses: the row stays failing
    const refused = await call(`/rooms/${deck}/flush`, { method: 'POST' });
    await refused.text();
    expect(app.checkpoints.length).toBe(1);
    expect(refused.status).toBe(500);
    expect(await callbacksRow()).toMatch(/^failing:\d+:storage:Error$/);

    // the storage takes writes again: the entry lands at seq 2, no seq skipped, and the next
    // answered checkpoint writes the row back to ok
    await refuseWrites(deck, false);
    a.send(opsFrame(CID_A, 4, 1, 2, [[splice(0, 0, 'one ')]]));
    const landed = await a.next(isAck(4));
    expect(landed.kind === 'ack' && landed.frame.ok).toBe(true);
    if (landed.kind === 'ack' && landed.frame.ok)
      expect(landed.frame.entries.map((entry) => entry.seq)).toEqual([2]);
    const counters = (await (await call(`/rooms/${deck}/counters`)).json()) as { head: number };
    expect(counters.head).toBe(2);
    const flushed = await call(`/rooms/${deck}/flush`, { method: 'POST' });
    await flushed.text();
    expect(flushed.status).toBe(200);
    expect(await callbacksRow()).toMatch(/^ok:\d+$/);
    a.close();
  });

  it('leaves the row alone for a refusal that is not the storage’s', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    // a frame at a base the object never had is the writer's (a refusal, not a storage error)
    for (let req = 1; req <= 3; req += 1) {
      a.send(opsFrame(CID_A, req, 99, req, [[splice(0, 0, 'x')]]));
      await a.next(isAck(req));
    }
    expect(await callbacksRow()).toBeNull();
    expect(await healthCallbacks()).toBe('ok');
    a.close();
  });
});
