import { applyMutations } from '@turboslide/schema/reduce';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BLOCK,
  CID_A,
  SLIDE,
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

// A checkpoint whose answer is lost after the route committed it (RELIABILITY-1, hardening
// HR-RT#1; the probe P1 of docs/hardening/research/reliability.md): the retry is answered from
// the log by a route that knows its own records (checkpoint.ts `planCheckpoint`), and an object
// that meets the older route's 409 keeps the entries its own records name instead of moving them
// past themselves. Either way the store holds one record and the text holds the word once.

type Doc = Parameters<typeof applyMutations>[0];

/** The paragraph's text in a document. */
function paragraph(document: Doc): string {
  const slide = document.slides[SLIDE] as unknown as {
    slots: Record<string, { id: string; text?: unknown }[]>;
  };
  const block = Object.values(slide.slots)
    .flat()
    .find((row) => row.id === BLOCK);
  return String(block?.text ?? '');
}

/** The paragraph's text in the fake store's deck. */
function textOf(app: FakeApp): string {
  return paragraph(app.document);
}

async function flush(deck: string): Promise<Response> {
  return call(`/rooms/${deck}/flush`, { method: 'POST', body: '{}' });
}

describe('a checkpoint whose answer was lost', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('lost');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  for (const route of ['log', 'conflict'] as const) {
    it(`commits the word once on the retry (the route ${route === 'log' ? 'answers from the log' : 'answers 409, the object keeps its own records'})`, async () => {
      app.revisionCheck = route;
      const before = textOf(app);
      const a = await connect(deck, await mint({ deck, cid: CID_A }));
      await a.next(isEvent('hello'));
      a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'word ')]]));
      await a.next(isAck(1));
      // the route commits the run, and its answer never reaches the object
      app.loseAnswerTimes = 1;
      const first = await flush(deck);
      expect(first.status).toBe(500);
      expect(app.records).toHaveLength(1);
      expect(app.revision).toBe(1);
      // the retry posts the same entry at the object's old revision
      const second = (await (await flush(deck)).json()) as {
        ok: boolean;
        revision: number;
        covered: number;
        head: number;
      };
      expect(second).toMatchObject({ ok: true, revision: 1, covered: 1 });
      expect(app.checkpoints).toHaveLength(2);
      expect(app.records).toHaveLength(1);
      expect(app.revision).toBe(1);
      expect(textOf(app)).toBe(`word ${before}`);
      // nothing is left to post
      await flush(deck);
      expect(app.checkpoints).toHaveLength(2);
      // the live document the object answers holds the word once
      const live = (await (await call(`/rooms/${deck}/document`)).json()) as { document: Doc };
      expect(paragraph(live.document)).toBe(`word ${before}`);
      a.close();
    });
  }

  it('keeps its own records apart from a foreign write that landed after them, and moves only the rest', async () => {
    app.revisionCheck = 'conflict';
    const before = textOf(app);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    a.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'one ')]]));
    await a.next(isAck(1));
    app.loseAnswerTimes = 1;
    expect((await flush(deck)).status).toBe(500);
    // more typing in the object, then a write from outside lands after the lost checkpoint
    a.send(opsFrame(CID_A, 2, 1, 2, [[splice(4, 0, 'two ')]]));
    await a.next(isAck(2));
    app.revision += 1;
    const theirs = splice(0, 0, 'cli ');
    app.records.push({
      n: app.records.length + 1,
      revision: app.revision,
      author: { kind: 'human', name: 'cli' },
      note: '',
      mutations: [theirs],
    });
    app.document = applyMutations(app.document, [theirs]).document;
    app.document.deck.revision = app.revision;
    const flushed = (await (await flush(deck)).json()) as { revision: number; covered: number };
    // the retry met 409; the seed named the object's own record and the foreign one; the first
    // entry stayed committed, the second moved past the foreign insert alone and committed
    expect(app.records).toHaveLength(3);
    const last = app.checkpoints.at(-1);
    expect(last?.entries.map((entry) => entry.opId)).toEqual([`${CID_A}:2`]);
    expect(last?.entries[0]?.mutations?.[0]).toMatchObject({
      at: 'cli one '.length,
      insert: 'two ',
    });
    expect(textOf(app)).toBe(`cli one two ${before}`);
    expect(flushed).toMatchObject({ revision: 3, covered: 3 });
    a.close();
  });
});
