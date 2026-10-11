import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ANON_B,
  CID_A,
  CID_B,
  call,
  connect,
  fakeApp,
  isAck,
  isEvent,
  mint,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// A resent ops frame keeps its author's letters in order in the object (RELIABILITY-2, F1;
// hardening HR-RT#2): the first entry is answered from the log, and the next, written on top of
// it, lands right after it and is never moved past its own author's letters
// (docs/gslides-parity/realtime/build/word-fix.md F1, "On the object").

type Doc = { slides: Record<string, unknown> };

function paragraph(document: Doc): string {
  const slide = document.slides['content-rule'] as {
    slots: Record<string, { id: string; text?: unknown }[]>;
  };
  const block = Object.values(slide.slots)
    .flat()
    .find((row) => row.id === 'p1');
  return String(block?.text ?? '');
}

function frame(
  req: number,
  base: number,
  entries: { n: number; at: number; insert: string; run?: true }[],
) {
  return {
    t: 'ops',
    req,
    clientId: CID_A,
    base: { seq: base },
    entries: entries.map((entry) => ({
      opId: `${CID_A}:${entry.n}`,
      kind: 'edit',
      mutations: [splice(entry.at, 0, entry.insert)],
      ...(entry.run === undefined ? {} : { run: true }),
    })),
  };
}

describe('a resent ops frame in the object', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('resend');
    app = fakeApp(deck);
  });

  afterEach(() => {
    app.restore();
  });

  it("answers the first entry from the log and lands the next right after its author's letters", async () => {
    const start = paragraph(app.document as unknown as Doc);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
    await a.next(isEvent('hello'));
    await b.next(isEvent('hello'));
    // B's " tb" at 0 lands as seq 1
    b.send({
      t: 'ops',
      req: 1,
      clientId: CID_B,
      base: { seq: 0 },
      entries: [{ opId: `${CID_B}:1`, kind: 'edit', mutations: [splice(0, 0, ' tb')] }],
    });
    await b.next(isAck(1));
    // A's " t" at 0 on base 0 lands after it as seq 2; the tab never reads the ack
    a.send(frame(1, 0, [{ n: 1, at: 0, insert: ' t' }]));
    await a.next(isAck(1));
    // the tab resends " t" with "a1", written after its own " t", on the same base
    a.send(
      frame(2, 0, [
        { n: 1, at: 0, insert: ' t' },
        { n: 2, at: 2, insert: 'a1', run: true },
      ]),
    );
    const ack = await a.next(isAck(2));
    if (ack.kind !== 'ack' || !ack.frame.ok) throw new Error('the resend was refused');
    expect(ack.frame.rejected).toEqual([]);
    expect(ack.frame.entries.map((entry) => [entry.opId, entry.seq])).toEqual([
      [`${CID_A}:1`, 2],
      [`${CID_A}:2`, 3],
    ]);
    expect(ack.frame.entries[1]?.mutations).toEqual([splice(5, 0, 'a1')]);
    const live = (await (await call(`/rooms/${deck}/document`)).json()) as { document: Doc };
    expect(paragraph(live.document)).toBe(` tb ta1${start}`);
    a.close();
    b.close();
  });
});
