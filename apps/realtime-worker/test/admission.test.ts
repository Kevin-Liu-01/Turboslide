import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADMISSION_DISAGREE_FLAG,
  admissionDisagreements,
  noteAdmissionDisagreements,
} from '../src/control.ts';
import { CID_A, connect, fakeApp, isAck, isEvent, mint, uniqueDeck } from './lib.ts';
import type { FakeApp } from './lib.ts';

// The object's admission mode (hardening HR-RT#5a): the suite runs `shadow` (vitest.config.ts),
// so every typed entry of every Worker test is placed by the full admission and by the
// incremental one beside it. Typing in a body text and in the cover's heading (the deck title
// follows it, so the manifest is judged too) reads no disagreement, and /health answers the mode
// and the count HR-RT#5b reads.

type Health = { admission: { mode: string; disagree: number } };

describe('the admission mode of the object', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('admission');
    app = fakeApp(deck);
  });

  afterEach(async () => {
    app.restore();
    await env.ACCOUNTS.prepare('DELETE FROM rt_flags WHERE k = ?')
      .bind(ADMISSION_DISAGREE_FLAG)
      .run();
  });

  it('places typing in shadow with no disagreement and answers the mode on /health', async () => {
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'));
    const entries = [
      { slideId: 'content-rule', blockId: 'p1', path: '/text', at: 0, insert: 'one ' },
      { slideId: 'content-rule', blockId: 'p1', path: '/text', at: 4, insert: 'two ' },
      { slideId: 'title', blockId: 'heading', path: '/heading', at: 0, insert: 'New ' },
      // past the end of the paragraph: refused the same way by both placements
      { slideId: 'content-rule', blockId: 'p1', path: '/text', at: 9999, insert: 'x' },
    ];
    a.send({
      t: 'ops',
      req: 1,
      clientId: CID_A,
      base: { seq: 0 },
      entries: entries.map((row, n) => ({
        opId: `${CID_A}:${n + 1}`,
        kind: 'edit',
        mutations: [{ op: 'text.splice', remove: 0, ...row }],
      })),
    });
    const ack = await a.next(isAck(1));
    if (ack.kind !== 'ack' || !ack.frame.ok) throw new Error('the post was refused');
    expect(ack.frame.entries).toHaveLength(3);
    expect(ack.frame.rejected.map((row) => row.opId)).toEqual([`${CID_A}:4`]);
    const health = (await (await SELF.fetch('https://rooms.test/health')).json()) as Health;
    expect(health.admission).toEqual({ mode: 'shadow', disagree: 0 });
    a.close();
  });

  it('counts disagreements in rt_flags and answers the count on /health', async () => {
    expect(await admissionDisagreements(env.ACCOUNTS)).toBe(0);
    await noteAdmissionDisagreements(env.ACCOUNTS, 1);
    await noteAdmissionDisagreements(env.ACCOUNTS, 2);
    expect(await admissionDisagreements(env.ACCOUNTS)).toBe(3);
    const health = (await (await SELF.fetch('https://rooms.test/health')).json()) as Health;
    expect(health.admission.disagree).toBe(3);
  });
});
