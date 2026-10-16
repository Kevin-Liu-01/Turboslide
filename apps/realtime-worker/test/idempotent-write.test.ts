import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ROOM_WRITE_OP_ID_HEADER } from '@turboslide/realtime/frames';

import {
  CID_A,
  call,
  connect,
  eventOf,
  fakeApp,
  isEvent,
  mint,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// RELIABILITY-21 (hardening HR-O#6): an agent's write that carries an op id is admitted once. The
// resend of a write whose answer was lost meets the entry the room holds under the same client id
// and op id and is answered with it, whatever its base reads now, so the text lands once and every
// tab receives one op. A write without the header takes a fresh id as before.
describe('a keyed agent write', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('idem');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  const write = (opId: string | null, insert: string): Promise<Response> =>
    call(`/rooms/${deck}/write`, {
      method: 'POST',
      headers: opId === null ? {} : { [ROOM_WRITE_OP_ID_HEADER]: opId },
      body: JSON.stringify({
        author: { kind: 'agent', name: 'bootstrap', principalId: 'agent:bootstrap' },
        clientId: 'agent:bootstrap',
        mutations: [splice(0, 0, insert)],
        baseRevision: 0,
        strict: true,
      }),
    });

  it('admits the first send, answers the resend with the same entry, and fans out one op', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const first = await write('idem-abc', 'Agent');
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { ok: boolean; seq: number; replayed?: boolean };
    expect(firstBody).toMatchObject({ ok: true, revision: 1, seq: 1 });
    expect(firstBody.replayed).toBeUndefined();
    const op = eventOf(await a.next(isEvent('op')), 'op');
    expect(op.entry).toMatchObject({ clientId: 'agent:bootstrap', opId: 'idem-abc', seq: 1 });

    // the resend carries the base the first attempt read, now stale: answered, not refused
    const again = await write('idem-abc', 'Agent');
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, revision: 1, seq: 1, replayed: true });

    const counters = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      head: number;
      covered: number;
    };
    expect(counters).toMatchObject({ head: 1, covered: 1 });
    expect(app.checkpoints.flatMap((post) => post.entries)).toHaveLength(1);
    expect(app.records).toHaveLength(1);
    expect(app.records[0]?.origin).toEqual({ clientId: 'agent:bootstrap', opIds: ['idem-abc'] });
    a.close();
  });

  it('admits a second key as its own write, and a write without one as before', async () => {
    expect(await (await write('idem-one', 'A')).json()).toMatchObject({ ok: true, seq: 1 });
    const stale = await write('idem-two', 'B');
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, code: 'conflict' });
    const plain = await call(`/rooms/${deck}/write`, {
      method: 'POST',
      body: JSON.stringify({
        author: { kind: 'agent', name: 'bootstrap' },
        clientId: 'agent:bootstrap',
        mutations: [splice(0, 0, 'C')],
        baseRevision: 1,
        strict: true,
      }),
    });
    expect(await plain.json()).toMatchObject({ ok: true, seq: 2 });
  });

  it('refuses a malformed op id', async () => {
    const response = await write('has space', 'x');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: 'invalid' });
  });
});
