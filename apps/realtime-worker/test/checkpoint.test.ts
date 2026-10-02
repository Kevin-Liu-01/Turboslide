import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckRoom } from '../src/deck-room.ts';
import { RETAIN_ENTRIES } from '../src/deck-room.ts';
import {
  ANON_B,
  CID_A,
  CID_B,
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

// The checkpoint (docs/CLOUDFLARE.md 3.4 item 8, 3.5): the alarm set at the first entry, re-armed
// while the newest entry is younger than the idle cadence, the post to the route with the entries
// above covered, the `checkpoint` frame, the doc rows written for the touched slides, the agent
// write's checkpoint at once, the conflict's re-admission, the compaction by partition drop, the
// counters, and the day 0 probes.
describe('DeckRoom checkpoints', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('ckpt');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
    vi.useRealTimers();
  });

  it('sets the alarm at the first entry, re-arms while typing goes on and commits once the idle cadence passes', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'a')]]));
    await a.next(isAck(1));
    const armed = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.getAlarm(),
    );
    expect(armed).not.toBeNull();
    expect((armed ?? 0) - Date.now()).toBeGreaterThan(1000);
    expect((armed ?? 0) - Date.now()).toBeLessThanOrEqual(2000);
    // the alarm fires early (the test runs it now): the newest entry is younger than idle, so it re-arms
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(app.checkpoints).toHaveLength(0);
    const rearmed = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.getAlarm(),
    );
    expect(rearmed).not.toBeNull();
    // the clock moves past the idle cadence: the alarm commits
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2500);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    vi.useRealTimers();
    expect(app.checkpoints).toHaveLength(1);
    expect(app.checkpoints[0]).toMatchObject({ fromSeq: 1, toSeq: 1 });
    expect(app.checkpoints[0]?.entries[0]).toMatchObject({ seq: 1, opId: `${CID_A}:1` });
    const checkpoint = eventOf(await a.next(isEvent('checkpoint')), 'checkpoint');
    expect(checkpoint).toMatchObject({ revision: 1, fromSeq: 1, toSeq: 1 });
    const counters = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      covered: number;
      head: number;
      revision: number;
      sinceWake: { rowsWritten: number; checkpoints: number };
    };
    expect(counters).toMatchObject({ covered: 1, head: 1, revision: 1 });
    expect(counters.sinceWake.checkpoints).toBe(1);
    expect(counters.sinceWake.rowsWritten).toBeGreaterThan(0);
    // nothing stands once nothing is uncommitted: a far deadline (the ticket's expiry, minutes
    // away) rides the next message or alarm and arms none of its own (SWEEP_ALARM_WINDOW_MS)
    const after = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.getAlarm(),
    );
    expect(after).toBeNull();
    a.close();
  });

  it('flushes on demand, writes the doc rows of the touched slide, and answers the loader the live document', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'f')], [splice(1, 0, 'g')]]));
    await a.next(isAck(1));
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { ok: boolean; revision: number; covered: number; head: number };
    expect(flushed).toEqual({ ok: true, revision: 1, covered: 2, head: 2 });
    expect(app.checkpoints[0]?.entries).toHaveLength(2);
    const rows = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.sql
        .exec<{ key: string }>('SELECT key FROM doc ORDER BY key')
        .toArray()
        .map((row) => row.key),
    );
    expect(rows).toContain('manifest');
    expect(rows).toContain('slide:content-rule');
    const doc = (await (await call(`/rooms/${deck}/document`)).json()) as {
      seq: number;
      revision: number;
      covered: number;
    };
    expect(doc).toMatchObject({ seq: 2, revision: 1, covered: 2 });
    // a second flush with nothing uncommitted posts nothing
    await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    expect(app.checkpoints).toHaveLength(1);
    a.close();
  });

  it('admits an agent write under the bearer, fans it out, checkpoints at once and answers the record', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const response = await call(`/rooms/${deck}/write`, {
      method: 'POST',
      body: JSON.stringify({
        author: { kind: 'agent', name: 'bootstrap', runId: 'r1', principalId: 'agent:bootstrap' },
        clientId: 'agent:bootstrap',
        mutations: [splice(0, 0, 'Agent')],
        baseRevision: 0,
        strict: true,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      revision: number;
      seq: number;
      record?: { ops: { fromSeq: number; toSeq: number } };
    };
    expect(body).toMatchObject({ ok: true, revision: 1, seq: 1 });
    expect(body.record?.ops).toEqual({ fromSeq: 1, toSeq: 1 });
    const op = eventOf(await a.next(isEvent('op')), 'op');
    expect(op.entry).toMatchObject({
      clientId: 'agent:bootstrap',
      author: { kind: 'agent', name: 'bootstrap' },
    });
    expect(eventOf(await a.next(isEvent('checkpoint')), 'checkpoint').revision).toBe(1);
    // a stale strict base is a conflict
    const stale = await call(`/rooms/${deck}/write`, {
      method: 'POST',
      body: JSON.stringify({
        author: { kind: 'agent', name: 'bootstrap' },
        clientId: 'agent:bootstrap',
        mutations: [splice(0, 0, 'x')],
        baseRevision: 0,
        strict: true,
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, code: 'conflict', currentRevision: 1 });
    a.close();
  });

  it('admits a comment op under the bearer, fans it out and answers once a checkpoint covers it', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const thread = {
      id: '01j8z2kmayaq4e0s7r9x2v8b3c',
      deckId: deck,
      anchor: { kind: 'slide', slideId: 'content-rule' },
      comment: {
        id: '01j8z2kmayaq4e0s7r9x2v8b3c',
        author: { principalId: ANON_B, label: 'Titanium 471', kind: 'human' },
        createdAt: '2026-10-01T10:00:00.000Z',
        body: { text: 'Check this', mentions: [] },
      },
      replies: [],
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      revision: 0,
    };
    const response = await call(`/rooms/${deck}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        author: { kind: 'human', name: 'Titanium 471', principalId: ANON_B },
        clientId: 'server',
        comment: { op: 'add', thread },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, seq: 1, covered: 1 });
    const op = eventOf(await a.next(isEvent('op')), 'op');
    expect(op.entry).toMatchObject({ kind: 'comment', clientId: 'server', seq: 1 });
    expect(app.checkpoints.at(-1)?.entries.map((entry) => entry.kind)).toEqual(['comment']);
    // a body the schema refuses never enters the log
    const refused = await call(`/rooms/${deck}/comment`, {
      method: 'POST',
      body: JSON.stringify({ author: { kind: 'human', name: 'x' }, clientId: 'server' }),
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ ok: false, code: 'invalid' });
    a.close();
  });

  it('re-admits its entries past a foreign record after a conflict and tells the tabs to reload', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'mine')]]));
    await a.next(isAck(1));
    // a write landed outside the object: the store moved to revision 1 with another text in front
    app.conflictOnce = true;
    app.revision = 1;
    app.records.push({
      n: 1,
      revision: 1,
      author: { kind: 'human', name: 'cli' },
      note: '',
      mutations: [splice(0, 0, 'theirs ')],
    });
    const { applyMutations } = await import('@turboslide/schema/reduce');
    app.document = applyMutations(app.document, [splice(0, 0, 'theirs ')]).document;
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { revision: number; covered: number; head: number };
    // the first post met the conflict, the seed at ?since=0 answered the record, the entry moved
    // to seq 2 transformed past the foreign insert, and the second post committed it
    expect(app.seeds.some((seed) => seed.since === 0)).toBe(true);
    expect(app.checkpoints).toHaveLength(2);
    const readmitted = app.checkpoints[1]?.entries[0];
    expect(readmitted).toMatchObject({ opId: `${CID_A}:1`, seq: 2 });
    expect(readmitted?.mutations?.[0]).toMatchObject({
      op: 'text.splice',
      at: 'theirs '.length,
      insert: 'mine',
    });
    expect(flushed.revision).toBe(2);
    expect(flushed.covered).toBe(2);
    const external = eventOf(await a.next(isEvent('checkpoint')), 'checkpoint');
    expect(external.external).toBe(true);
    a.close();
  });

  it('keeps the entries and the sockets when the route refuses, and commits on the next alarm', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'k')]]));
    await a.next(isAck(1));
    app.failTimes = 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3000);
    await expect(runDurableObjectAlarm(stub)).rejects.toThrow(/503/);
    vi.useRealTimers();
    expect(app.checkpoints).toHaveLength(1);
    const counters = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      covered: number;
      head: number;
      sockets: number;
    };
    expect(counters).toMatchObject({ covered: 0, head: 1, sockets: 1 });
    const flushed = (await (
      await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' })
    ).json()) as { covered: number };
    expect(flushed.covered).toBe(1);
    a.close();
  });

  it('closes every socket with 4503 and resyncs when the route answers another tier', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 't')]]));
    await a.next(isAck(1));
    app.tier = 'blob';
    await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    expect(eventOf(await a.next(isEvent('resync')), 'resync').revision).toBe(1);
    expect((await a.closed).code).toBe(4503);
  });

  it('drops a month table once covered and the retention are past it, never a row at a time', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    // an object that already orders the deck far past the retention, with an old month behind it:
    // the rows are seeded before the object's first socket (its constructor read no meta row; the
    // seed re-reads the row before the store's answer is taken)
    const far = RETAIN_ENTRIES + 5;
    await runInDurableObject(stub, (_instance: DeckRoom, state) => {
      const sql = state.storage.sql;
      sql.exec(
        `CREATE TABLE IF NOT EXISTS entries_202501 (seq INTEGER PRIMARY KEY, rev INTEGER NOT NULL, kind TEXT NOT NULL, client_id TEXT NOT NULL, op_id TEXT NOT NULL, author TEXT NOT NULL, mutations TEXT, comment TEXT, at TEXT NOT NULL, at_ms INTEGER NOT NULL, note TEXT, covers TEXT)`,
      );
      sql.exec(
        `INSERT INTO entries_202501 (seq, rev, kind, client_id, op_id, author, mutations, at, at_ms) VALUES (1, 0, 'edit', 'c', 'c:1', '{"kind":"human","name":"x"}', '[]', '2025-01-01T00:00:00.000Z', 0)`,
      );
      sql.exec(
        `INSERT INTO meta (id, head, covered, revision, last_checkpoint_at, first_uncommitted_at, months, seeded, stale, counters) VALUES (1, ?, ?, 0, NULL, NULL, ?, 0, 0, '{}')`,
        far,
        far,
        JSON.stringify(['202501']),
      );
    });
    app.covered = far;
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    const hello = eventOf(await b.next(isEvent('hello')), 'hello');
    expect(hello.seq).toBe(far);
    b.send(opsFrame(CID_B, 1, far, 1, [[splice(0, 0, 'z')]]));
    const ack = await b.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok && ack.frame.head).toBe(far + 1);
    await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    const tables = await runInDurableObject(stub, (_instance: DeckRoom, state) =>
      state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'entries_%' ORDER BY name",
        )
        .toArray()
        .map((row) => row.name),
    );
    expect(tables).not.toContain('entries_202501');
    expect(tables).toHaveLength(1);
    const months = await runInDurableObject(
      stub,
      (_instance: DeckRoom, state) =>
        state.storage.sql.exec<{ months: string }>('SELECT months FROM meta WHERE id = 1').one()
          .months,
    );
    expect(JSON.parse(months)).toHaveLength(1);
    b.close();
  });

  it('answers the day 0 probes: the DROP TABLE cursor counts and a CPU spin inside the object', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const body = (await (await call(`/rooms/${deck}/counters?probe=drop&spin=20`)).json()) as {
      probe: { insertRowsWritten: number; dropRowsWritten: number; dropRowsRead: number };
      spinMs: number;
      sinceWake: { rowsWritten: number };
    };
    expect(body.probe.insertRowsWritten).toBe(1000);
    expect(typeof body.probe.dropRowsWritten).toBe('number');
    expect(body.spinMs).toBe(20);
    a.close();
  });

  it('asks a named principal to reauth and closes it with 4403 when the fresh ticket lowers the role', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    const asked = (await (
      await call(`/rooms/${deck}/access-changed`, {
        method: 'POST',
        body: JSON.stringify({ principalIds: [ANON_B] }),
      })
    ).json()) as { asked: number };
    expect(asked.asked).toBe(1);
    expect((await b.next((frame) => frame.kind === 'reauth')).kind).toBe('reauth');
    expect(a.frames.some((frame) => frame.kind === 'reauth')).toBe(false);
    b.send({
      t: 'ticket',
      ticket: await mint({
        deck,
        cid: CID_B,
        id: ANON_B,
        pid: ANON_B,
        role: 'viewer',
        via: 'link',
      }),
    });
    expect((await b.closed).code).toBe(4403);
    // A keeps its socket with a same role ticket
    await call(`/rooms/${deck}/access-changed`, { method: 'POST', body: '{}' });
    await a.next((frame) => frame.kind === 'reauth');
    a.send({ t: 'ticket', ticket: await mint({ deck, cid: CID_A }) });
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'r')]]));
    expect((await a.next(isAck(1))).kind).toBe('ack');
    a.close();
  });

  it('posts closed to the route at the last socket and drops the doc rows, keeping the log', async () => {
    const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(deck));
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'c')]]));
    await a.next(isAck(1));
    const open = (await (await call(`/control/open`)).json()) as { decks: { deckId: string }[] };
    expect(open.decks.map((row) => row.deckId)).toContain(deck);
    a.close();
    await a.closed;
    // the close checkpoint is behind waitUntil: poll the fake route
    for (let i = 0; i < 50 && app.checkpoints.length === 0; i += 1)
      await new Promise((r) => setTimeout(r, 50));
    expect(app.checkpoints[0]).toMatchObject({ fromSeq: 1, toSeq: 1, closed: true });
    for (let i = 0; i < 50; i += 1) {
      const rows = await runInDurableObject(
        stub,
        (_instance: DeckRoom, state) =>
          state.storage.sql.exec('SELECT key FROM doc').toArray().length,
      );
      if (rows === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const left = await runInDurableObject(stub, (_instance: DeckRoom, state) => ({
      doc: state.storage.sql.exec('SELECT key FROM doc').toArray().length,
      entries: state.storage.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE 'entries_%'",
        )
        .one().n,
    }));
    expect(left).toEqual({ doc: 0, entries: 1 });
    const after = (await (await call(`/control/open`)).json()) as { decks: { deckId: string }[] };
    expect(after.decks.map((row) => row.deckId)).not.toContain(deck);
    expect((await call(`/rooms/${deck}/document`)).status).toBe(204);
  });
});
