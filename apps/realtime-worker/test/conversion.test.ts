import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toCanvas } from '@turboslide/schema/canvas';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { slideBlocks } from '@turboslide/schema/deck';
import type { DeckDocument, Slide, TitleSlide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

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
  opsFrame,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The object's admission of a cover that converts while two people type into it (the realtime
// round, fix round 3; VERIFICATION.md "Realtime round, pass 3" finding 3): each tab's Escape on a
// wrapped title converts the cover to a canvas with its own copy, so the object passes its
// running document to room-core.ts `transformEntry` and the later conversion follows the slide
// as it stands. The frames below are the ones R1's admission trace read on the two process run.

const COVER = 'title';
const BOXES: CanvasBoxes = {
  blocks: { heading: [137, 300, 1646, 180], lead: [137, 520, 1200, 80] },
  mark: [137, 137, 132, 84],
  prompted: [],
};
const SIZE: Mutation[] = [
  { op: 'block.set', slideId: COVER, blockId: 'heading', path: '/typography', value: { size: 72 } },
  { op: 'block.set', slideId: COVER, blockId: 'heading', path: '/pos/h', value: 90 },
];

function withCover(heading: string): DeckDocument {
  const document = workedDocument();
  document.slides[COVER] = { ...(document.slides[COVER] as TitleSlide), heading };
  return document;
}
function conversionOf(heading: string): Mutation {
  const copy = { ...(workedDocument().slides[COVER] as TitleSlide), heading };
  const converted = toCanvas(copy, BOXES);
  if (converted === null) throw new Error('the cover did not convert');
  return { op: 'slide.replace', slideId: COVER, slide: converted.slide };
}
function splice(path: '/heading' | '/text', at: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: COVER, blockId: 'heading', path, at, remove: 0, insert };
}

async function titleOf(deck: string): Promise<string> {
  const answer = await (
    await call(`/rooms/${deck}/document`)
  ).json<{ document: { slides: Record<string, Slide> } }>();
  const slide = answer.document.slides[COVER];
  if (slide === undefined) return '';
  if (slide.kind === 'title') return slide.heading;
  const block = slideBlocks(slide).find((row) => row.block.id === 'heading')?.block;
  return block !== undefined && 'text' in block && typeof block.text === 'string' ? block.text : '';
}

describe('DeckRoom, a cover converted by two tabs at once', () => {
  let app: FakeApp;
  let deck: string;

  afterEach(() => {
    app.restore();
  });

  describe('the standing row’s red reading', () => {
    beforeEach(() => {
      deck = uniqueDeck();
      app = fakeApp(deck, { document: withCover('Sync title ca1 cb1') });
    });

    it("keeps both words when A's field run and A's conversion arrive after B's conversion with its word", async () => {
      const a = await connect(deck, await mint({ deck, cid: CID_A }));
      const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
      await a.next(isEvent('hello'));
      await b.next(isEvent('hello'));
      b.send(
        opsFrame(CID_B, 1, 0, 1, [
          [conversionOf('Sync title ca1 cb1'), splice('/text', 18, ' db2'), ...SIZE],
        ]),
      );
      const ackB = await b.next(isAck(1));
      expect(ackB.kind === 'ack' && ackB.frame.ok && ackB.frame.rejected).toEqual([]);
      // A heard nothing of B's conversion: its word is a field run, its Escape the size alone
      a.send(
        opsFrame(CID_A, 1, 0, 1, [
          [splice('/heading', 18, ' da2')],
          [conversionOf('Sync title ca1 cb1 da2'), ...SIZE],
        ]),
      );
      const ackA = await a.next(isAck(1));
      expect(ackA.kind === 'ack' && ackA.frame.ok).toBe(true);
      if (ackA.kind === 'ack' && ackA.frame.ok) {
        expect(ackA.frame.rejected).toEqual([]);
        expect(ackA.frame.entries.map((entry) => entry.mutations)).toEqual([
          [splice('/text', 22, ' da2')],
          SIZE,
        ]);
      }
      expect(await titleOf(deck)).toBe('Sync title ca1 cb1 db2 da2');
      a.close();
      b.close();
    });
  });

  describe('a tab that heard of the other conversion before it posted its own', () => {
    beforeEach(() => {
      deck = uniqueDeck();
      app = fakeApp(deck, { document: withCover('Two typers ta2 ua2') });
    });

    it('yields the stale conversion and lands its word on the canvas as it stands', async () => {
      const a = await connect(deck, await mint({ deck, cid: CID_A }));
      const b = await connect(deck, await mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B }));
      await a.next(isEvent('hello'));
      await b.next(isEvent('hello'));
      a.send(opsFrame(CID_A, 1, 0, 1, [[conversionOf('Two typers ta2 ua2'), ...SIZE]]));
      expect((await a.next(isAck(1))).kind).toBe('ack');
      // B's base is the head: nothing landed since it, and the object's document is the canvas
      b.send(
        opsFrame(CID_B, 1, 1, 1, [
          [conversionOf('Two typers ta2'), splice('/text', 14, ' ub2'), ...SIZE],
        ]),
      );
      const ackB = await b.next(isAck(1));
      expect(ackB.kind === 'ack' && ackB.frame.ok).toBe(true);
      if (ackB.kind === 'ack' && ackB.frame.ok) {
        expect(ackB.frame.rejected).toEqual([]);
        expect(ackB.frame.entries[0]?.mutations?.map((mutation) => mutation.op)).toEqual([
          'text.splice',
          'block.set',
          'block.set',
        ]);
      }
      expect(await titleOf(deck)).toBe('Two typers ta2 ub2 ua2');
      a.close();
      b.close();
    });
  });
});
