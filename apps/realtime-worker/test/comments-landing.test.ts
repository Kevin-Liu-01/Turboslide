import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ANON_B, CID_A, call, connect, fakeApp, isAck, isEvent, mint, uniqueDeck } from './lib.ts';
import type { FakeApp } from './lib.ts';

// A comment is covered only once the sidecar took it (RELIABILITY-9, hardening HR-RT#8): the route
// answers 503 when the sidecar write fails and the object keeps the entry for the retry; a comment
// the sidecar's reducer refused is kept as a dead letter and logged, never dropped silently.

const thread = (deck: string) => ({
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
});

async function postComment(deck: string): Promise<Response> {
  return call(`/rooms/${deck}/comment`, {
    method: 'POST',
    body: JSON.stringify({
      author: { kind: 'human', name: 'Titanium 471', principalId: ANON_B },
      clientId: 'server',
      comment: { op: 'add', thread: thread(deck) },
    }),
  });
}

describe('comments at the checkpoint', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('comments');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it('keeps covered when the route answers 503 for the sidecar, and covers the comment on the retry', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    // a tab's comment rides its ops frame; the object answers it before any checkpoint
    a.send({
      t: 'ops',
      req: 1,
      clientId: CID_A,
      base: { seq: 0 },
      entries: [
        { opId: `${CID_A}:1`, kind: 'comment', comment: { op: 'add', thread: thread(deck) } },
      ],
    });
    await a.next(isAck(1));
    app.failTimes = 1;
    const refused = await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    await refused.text();
    const state = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      head: number;
      covered: number;
    };
    expect(state).toMatchObject({ head: 1, covered: 0 });
    await call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
    const after = (await (await call(`/rooms/${deck}/counters`)).json()) as {
      head: number;
      covered: number;
    };
    expect(after).toMatchObject({ head: 1, covered: 1 });
    expect(app.checkpoints.map((row) => row.entries.map((entry) => entry.kind))).toEqual([
      ['comment'],
      ['comment'],
    ]);
    a.close();
  });

  it('keeps a comment the sidecar refused as a dead letter', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    app.refuseComments = true;
    expect((await postComment(deck)).status).toBe(200);
    const dead = (await (await call(`/rooms/${deck}/dead-letters`)).json()) as {
      rows: { seq: number; reason: string; entry: { kind: string } }[];
    };
    expect(dead.rows).toMatchObject([
      { seq: 1, reason: 'comment-refused', entry: { kind: 'comment' } },
    ]);
    a.close();
  });
});
