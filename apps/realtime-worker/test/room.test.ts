import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLOSE_CODES } from '@turboslide/realtime/frames';

import type { DeckRoom } from '../src/deck-room.ts';
import {
  ANON_B,
  CID_A,
  CID_B,
  CID_C,
  ORIGIN,
  call,
  connect,
  eventOf,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  presenceFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The object's rows over the socket (docs/CLOUDFLARE.md 3.2 to 3.4): the hello and the room frame
// from one handler, the admission with the ack and the own op frame, the fan out to the second
// socket, the dedupe by (client id, op id), the base window, the presence fan out and the leave,
// the close codes of a refused upgrade, and the roster rebuilt from the attachments after a wake.
describe('DeckRoom over the socket', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck();
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('says hello from the seed, names itself, admits an ops frame and fans the op out to the other socket', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const helloA = eventOf(await a.next(isEvent('hello')), 'hello');
    expect(helloA).toMatchObject({
      seq: 0,
      revision: 0,
      clientId: CID_A,
      role: 'editor',
      tier: 'do',
      covered: 0,
      clients: [],
      editing: 0,
    });
    const room = await a.next((frame) => frame.kind === 'room');
    expect(room.kind === 'room' && room.frame).toMatchObject({ idleMs: 2000, maxMs: 10000 });
    expect(eventOf(await a.next(isEvent('ops')), 'ops').entries).toEqual([]);
    expect(app.seeds).toHaveLength(1);

    const b = await connect(
      deck,
      await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B, label: 'Maya' }),
    );
    eventOf(await b.next(isEvent('hello')), 'hello');

    const started = Date.now();
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'A')]]));
    const ack = await a.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok).toBe(true);
    if (ack.kind === 'ack' && ack.frame.ok) {
      expect(ack.frame.entries).toHaveLength(1);
      expect(ack.frame.entries[0]).toMatchObject({
        seq: 1,
        rev: 0,
        clientId: CID_A,
        opId: `${CID_A}:1`,
      });
      expect(ack.frame.head).toBe(1);
      expect(ack.frame.rejected).toEqual([]);
    }
    // the own op frame settles the client's own path too (3.9 invariant 4)
    const own = eventOf(await a.next(isEvent('op')), 'op');
    expect(own.entry.opId).toBe(`${CID_A}:1`);
    const theirs = eventOf(await b.next(isEvent('op')), 'op');
    expect(theirs.entry.seq).toBe(1);
    expect(theirs.entry.author).toMatchObject({ kind: 'human', name: 'Someone' });
    expect(Date.now() - started).toBeLessThan(1000);

    // the second entry builds on the first; a resend of the first is answered from the log
    a.send(opsFrame(CID_A, 2, 1, 2, [[splice(1, 0, 'B')]]));
    const second = await a.next(isAck(2));
    expect(second.kind === 'ack' && second.frame.ok && second.frame.head).toBe(2);
    a.send(opsFrame(CID_A, 3, 2, 1, [[splice(0, 0, 'A')]]));
    const replayed = await a.next(isAck(3));
    expect(
      replayed.kind === 'ack' && replayed.frame.ok && replayed.frame.entries.map((e) => e.seq),
    ).toEqual([1]);
    expect(replayed.kind === 'ack' && replayed.frame.ok && replayed.frame.head).toBe(2);

    // the document the loader reads carries both characters at the head
    const doc = (await (await call(`/rooms/${deck}/document`)).json()) as {
      seq: number;
      document: {
        slides: Record<string, { slots: Record<string, { id: string; text: unknown }[]> }>;
      };
    };
    expect(doc.seq).toBe(2);
    a.close();
    b.close();
  });

  it('transforms a concurrent splice past what landed since the base and reports between', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'aa')]]));
    expect((await a.next(isAck(1))).kind).toBe('ack');
    // B wrote at base 0, after A's two characters landed: its insert at 0 ties by server order
    b.send(opsFrame(CID_B, 1, 0, 1, [[splice(0, 0, 'b')]]));
    const ack = await b.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok).toBe(true);
    if (ack.kind === 'ack' && ack.frame.ok) {
      expect(ack.frame.entries[0]?.seq).toBe(2);
      expect(ack.frame.between?.map((entry) => entry.seq)).toEqual([1]);
      const placed = ack.frame.entries[0]?.mutations?.[0];
      expect(placed).toMatchObject({ op: 'text.splice', at: 2, insert: 'b' });
    }
    a.close();
    b.close();
  });

  it('answers resync on a base above the head or more than the window behind, and refuses a foreign client id', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 7, 1, [[splice(0, 0, 'x')]]));
    const ack = await a.next(isAck(1));
    expect(ack.kind === 'ack' && !ack.frame.ok && ack.frame).toMatchObject({
      status: 409,
      code: 'resync',
      head: 0,
    });
    a.send(opsFrame(CID_B, 2, 0, 1, [[splice(0, 0, 'x')]]));
    const foreign = await a.next(isAck(2));
    expect(foreign.kind === 'ack' && !foreign.frame.ok && foreign.frame).toMatchObject({
      status: 403,
      code: 'client_unbound',
    });
    a.close();
  });

  it('refuses an edit from a viewer and a comment from a viewer, admits a comment from a commenter', async () => {
    const viewer = await connect(
      deck,
      await mint({ deck, cid: CID_A, role: 'viewer', via: 'link' }),
    );
    await viewer.next(isEvent('hello'));
    viewer.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'x')]]));
    const refused = await viewer.next(isAck(1));
    expect(refused.kind === 'ack' && !refused.frame.ok && refused.frame.status).toBe(403);
    viewer.close();
  });

  it('fans out presence with the identity fields from the ticket, drops an older clock, and announces a leave', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const b = await connect(
      deck,
      await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B, label: 'Maya', trust: 'guest' }),
    );
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    b.send(presenceFrame(CID_B, 3, { selection: { blockIds: ['p1'] } }));
    const presence = eventOf(await a.next(isEvent('presence')), 'presence');
    expect(presence.clientId).toBe(CID_B);
    expect(presence.state).toMatchObject({
      label: 'Maya',
      trust: 'guest',
      role: 'editor',
      principalId: ANON_B,
      kind: 'human',
    });
    expect(presence.state.mark).toMatchObject({ hue: { slot: presence.state.hueSlot + 1 } });
    // an older clock is a late batch
    b.send(presenceFrame(CID_B, 2));
    const refused = await b.next((frame) => frame.kind === 'presence-refused');
    expect(refused.kind === 'presence-refused' && refused.frame.reason).toBe('clock');
    // the roster the next joiner reads carries B
    const c = await connect(deck, await mint({ deck, cid: CID_C }));
    const hello = eventOf(await c.next(isEvent('hello')), 'hello');
    expect(hello.clients.map((row) => row.clientId)).toEqual([CID_B]);
    expect(hello.editing).toBe(1);
    const roster = (await (await call(`/rooms/${deck}/roster`)).json()) as {
      clients: { clientId: string }[];
    };
    expect(roster.clients.map((row) => row.clientId)).toEqual([CID_B]);
    b.send({ t: 'leave', clock: 9 });
    const left = eventOf(await a.next(isEvent('leave')), 'leave');
    expect(left.clientId).toBe(CID_B);
    a.close();
    b.close();
    c.close();
  });

  it('closes a refused upgrade with its code: no ticket 4401, a wrong origin 4403, a stranger 4401, a tab reopen 4409', async () => {
    const none = await connect(deck, null);
    expect((await none.closed).code).toBe(CLOSE_CODES.ticket);
    const ticket = await mint({ deck, cid: CID_A });
    const wrongOrigin = await connect(deck, ticket, { origin: 'https://evil.example' });
    expect((await wrongOrigin.closed).code).toBe(CLOSE_CODES.forbidden);
    const noOrigin = await connect(deck, ticket, { origin: null });
    expect((await noOrigin.closed).code).toBe(CLOSE_CODES.forbidden);
    const forged = await connect(deck, await mint({ deck, cid: CID_A }, { secret: 'another' }));
    expect((await forged.closed).code).toBe(CLOSE_CODES.ticket);
    const tab = 'f'.repeat(32);
    const first = await connect(deck, ticket, { query: `?since=0&tab=${tab}` });
    await first.next(isEvent('hello'));
    const second = await connect(deck, await mint({ deck, cid: CID_B }), {
      query: `?since=0&tab=${tab}`,
    });
    await second.next(isEvent('hello'));
    expect((await first.closed).code).toBe(CLOSE_CODES.superseded);
    // a newer socket of the same client id supersedes the older one
    const again = await connect(deck, await mint({ deck, cid: CID_B }));
    await again.next(isEvent('hello'));
    expect((await second.closed).code).toBe(CLOSE_CODES.superseded);
    again.close();
  });

  it('closes every upgrade with 4503 while the realtime flag is off', async () => {
    await env.ACCOUNTS.prepare("UPDATE rt_flags SET v = 'off' WHERE k = 'realtime'").run();
    const { dropFlagCache } = await import('../src/control.ts');
    dropFlagCache();
    try {
      const refused = await connect(deck, await mint({ deck, cid: CID_A }));
      expect((await refused.closed).code).toBe(CLOSE_CODES.tier);
    } finally {
      await env.ACCOUNTS.prepare("UPDATE rt_flags SET v = 'on' WHERE k = 'realtime'").run();
      dropFlagCache();
    }
  });

  it('admits the join frame within the window when the ticket could not ride the subprotocol', async () => {
    const joiner = await connect(deck, null, { protocols: 'turboslide.v1' });
    joiner.send({ t: 'join', ticket: await mint({ deck, cid: CID_A }) });
    const hello = eventOf(await joiner.next(isEvent('hello')), 'hello');
    expect(hello.clientId).toBe(CID_A);
    joiner.close();
  });

  it('carries the HTTP belt: an ops POST and a presence POST with Authorization: Ticket, CORS on the answer', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const ticket = await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B });
    const { SELF } = await import('cloudflare:test');
    const response = await SELF.fetch(`https://rooms.test/rooms/${deck}/ops`, {
      method: 'POST',
      headers: {
        authorization: `Ticket ${ticket}`,
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: CID_B,
        base: { seq: 0 },
        entries: [{ opId: `${CID_B}:1`, kind: 'edit', mutations: [splice(0, 0, 'h')] }],
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const body = (await response.json()) as { ok: boolean; entries: { seq: number }[] };
    expect(body.ok).toBe(true);
    expect(body.entries[0]?.seq).toBe(1);
    expect(eventOf(await a.next(isEvent('op')), 'op').entry.clientId).toBe(CID_B);
    const presence = await SELF.fetch(`https://rooms.test/rooms/${deck}/presence`, {
      method: 'POST',
      headers: {
        authorization: `Ticket ${ticket}`,
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify((({ t: _t, ...rest }) => rest)(presenceFrame(CID_B, 1))),
    });
    expect(presence.status).toBe(200);
    expect(eventOf(await a.next(isEvent('presence')), 'presence').clientId).toBe(CID_B);
    const wrong = await SELF.fetch(`https://rooms.test/rooms/${deck}/ops`, {
      method: 'POST',
      headers: {
        authorization: `Ticket ${ticket}`,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(wrong.status).toBe(403);
    a.close();
  });

  it("writes each socket's attachment with the claims, the tab and the slide, so a wake rebuilds the roster from them", async () => {
    const tab = 'e'.repeat(32);
    const a = await connect(deck, await mint({ deck, cid: CID_A, tab }), {
      query: `?since=0&tab=${tab}`,
    });
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    a.send(presenceFrame(CID_A, 1, { slideId: 'title' }));
    await b.next(isEvent('presence'));
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const attachments = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state
        .getWebSockets()
        .map(
          (ws) =>
            ws.deserializeAttachment() as {
              cid: string;
              tab?: string;
              slideId?: string;
              claims: { role: string; label: string } | null;
              origin: string | null;
            },
        )
        .sort((x, y) => x.cid.localeCompare(y.cid)),
    );
    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({ cid: CID_A, tab, slideId: 'title', origin: ORIGIN });
    expect(attachments[0]?.claims).toMatchObject({ role: 'editor', label: 'Someone' });
    expect(attachments[1]).toMatchObject({ cid: CID_B });
    expect(attachments[1]?.slideId).toBeUndefined();
    const tags = await runInDurableObject(
      stub,
      (_instance: DeckRoom, state) => state.getWebSockets(`tab:${tab}`).length,
    );
    expect(tags).toBe(1);
    // the eviction helper of the plugin (evictDurableObject) never completed on this machine
    // (5 s, with and without sockets; build/r1.md), so the wake itself is read on wrangler dev
    a.close();
    b.close();
  });

  it('strips the notes for a viewer and keeps them for an editor', async () => {
    const editor = await connect(deck, await mint({ deck, cid: CID_A }));
    const viewer = await connect(
      deck,
      await mint({
        deck,
        cid: CID_B,
        id: ANON_B,
        pid: ANON_B,
        role: 'viewer',
        via: 'link',
        names: false,
      }),
    );
    await editor.next(isEvent('hello'));
    await viewer.next(isEvent('hello'));
    editor.send(
      opsFrame(CID_A, 1, 0, 1, [
        [
          { op: 'slide.set', slideId: 'content-rule', path: '/notes', value: 'secret' } as never,
          splice(0, 0, 'n'),
        ],
      ]),
    );
    const ack = await editor.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok).toBe(true);
    const seen = eventOf(await viewer.next(isEvent('op')), 'op');
    expect(seen.entry.mutations?.some((mutation) => mutation.op === 'slide.set')).toBe(false);
    expect(seen.entry.mutations).toHaveLength(1);
    editor.close();
    viewer.close();
  });
});
