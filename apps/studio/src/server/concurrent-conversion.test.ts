import { describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';
import type { OpsPost } from '@turboslide/realtime/protocol';
import { canvasFieldBlocks, carryFieldText, landCandidate } from '@turboslide/realtime/room-core';
import { toCanvas } from '@turboslide/schema/canvas';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { isCanvasSlide, slideBlocks } from '@turboslide/schema/deck';
import type { DeckDocument, TitleSlide } from '@turboslide/schema/deck';
import { WORKED_SLIDES, workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import {
  entryRun,
  landedOf,
  landedOwn,
  transformEntry,
  undoOfSplices,
  yieldConcurrentConversion,
} from './room';

// Two tabs converting one slide at once (the realtime round, R1's two process run; the row
// `realtime.title.two-typers`): the wire of the run read both tabs posting `slide.replace` with
// their own copy of the cover beside a `text.splice`, 11 ms apart; the second's splice, moved past
// the first's, fell outside its own copy's text and the whole entry was refused ("text.splice: 40
// plus 0 is outside a text of 32 characters"), the second word lost in three runs of three. The
// rule under test: the later entry yields its `slide.replace` when another replaced the slide
// since its base and the entry types on that slide; a bare replacement keeps last writer wins.

const SLIDE = WORKED_SLIDES.find((slide) => slide.id === 'content-rule')!;
const BLOCK = 'p1';

function splice(at: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: SLIDE.id, blockId: BLOCK, path: '/text', at, remove: 0, insert };
}
const replace: Mutation = { op: 'slide.replace', slideId: SLIDE.id, slide: SLIDE };
const typography: Mutation = {
  op: 'block.set',
  slideId: SLIDE.id,
  blockId: BLOCK,
  path: '/size',
  value: 9,
};

describe('yieldConcurrentConversion (docs/REALTIME.md row realtime.title.two-typers)', () => {
  it('drops the later slide.replace when the entry also types on the slide, and keeps the rest', () => {
    const landed = landedOwn([replace, splice(32, ' charlie'), typography]);
    expect(yieldConcurrentConversion([replace, splice(32, ' delta'), typography], landed)).toEqual([
      splice(32, ' delta'),
      typography,
    ]);
  });

  it('keeps a bare slide.replace (the source drawer, slide.toCanvas): last writer wins as before', () => {
    const landed = landedOwn([replace]);
    expect(yieldConcurrentConversion([replace], landed)).toEqual([replace]);
    // a replacement of another slide is not touched either
    const other: Mutation = { op: 'slide.replace', slideId: 'title', slide: { ...SLIDE, id: 'title' } };
    expect(yieldConcurrentConversion([other, splice(1, 'x')], landed)).toEqual([other, splice(1, 'x')]);
  });

  it('transformEntry then moves the second typist’s splice past the first’s and lands no replacement', () => {
    const landed = landedOwn([replace, splice(32, ' charlie'), typography]);
    const out = transformEntry([replace, splice(32, ' delta'), typography], landed);
    expect(out).toEqual([splice(40, ' delta'), typography]);
  });
});

// ---------------------------------------------------------------------------------------------
// Fix round 3 (VERIFICATION.md "Realtime round, pass 3" finding 3): two people typing into a
// cover whose title wraps, so each tab's Escape converts the cover to a canvas with its own copy.
// The admission below is the object's loop (apps/realtime-worker deck-room.ts `admit`) and the
// function's (room.ts `admitOps`): every entry of a POST transformed past what landed since the
// base with the running document, placed by the reducer and the validator, a refused entry's
// undo added to what the later entries move past.

const COVER_ID = 'title';
const BOXES: CanvasBoxes = {
  blocks: { heading: [137, 300, 1646, 180], lead: [137, 520, 1200, 80] },
  mark: [137, 137, 132, 84],
  prompted: [],
};

/** The worked deck with its cover's title reading `heading`. */
function deckWithCover(heading: string): DeckDocument {
  const document = workedDocument();
  const cover = document.slides[COVER_ID] as TitleSlide;
  document.slides[COVER_ID] = { ...cover, heading };
  return document;
}

/** A tab's conversion of its own copy of the cover (viewer toFreeform over schema toCanvas). */
function conversionOf(heading: string): Mutation {
  const copy = { ...(workedDocument().slides[COVER_ID] as TitleSlide), heading };
  const converted = toCanvas(copy, BOXES);
  if (converted === null) throw new Error('the cover did not convert');
  return { op: 'slide.replace', slideId: COVER_ID, slide: converted.slide };
}

/** The cover's shrunk size and its height, the writes the Escape carries (Editor.tsx growAfterBurst). */
const SIZE: Mutation[] = [
  {
    op: 'block.set',
    slideId: COVER_ID,
    blockId: 'heading',
    path: '/typography',
    value: { size: 72 },
  },
  { op: 'block.set', slideId: COVER_ID, blockId: 'heading', path: '/pos/h', value: 90 },
];

function fieldSplice(at: number, insert: string): Mutation {
  return {
    op: 'text.splice',
    slideId: COVER_ID,
    blockId: 'heading',
    path: '/heading',
    at,
    remove: 0,
    insert,
  };
}
function blockSplice(at: number, insert: string): Mutation {
  return {
    op: 'text.splice',
    slideId: COVER_ID,
    blockId: 'heading',
    path: '/text',
    at,
    remove: 0,
    insert,
  };
}

type Room = { document: DeckDocument; log: Entry[] };

/** One POST through the admission; the answer's admitted entries and refusals. */
function admit(
  room: Room,
  clientId: string,
  base: number,
  entries: { mutations: Mutation[]; run?: true }[],
): { admitted: Entry[]; rejected: { opId: string; message?: string }[] } {
  const post: OpsPost = {
    clientId,
    base: { seq: base },
    entries: entries.map((entry, i) => ({
      opId: `${clientId}:${base}-${i}`,
      kind: 'edit',
      mutations: entry.mutations,
      ...(entry.run ? { run: true as const } : {}),
    })),
  };
  const landed = landedOf(
    room.log.filter((entry) => entry.seq > base),
    post,
  );
  const admitted: Entry[] = [];
  const rejected: { opId: string; message?: string }[] = [];
  let running = room.document;
  for (const entry of post.entries) {
    const transformed = transformEntry(entry.mutations ?? [], landed, entryRun(entry), running);
    if (transformed === null) {
      rejected.push({ opId: entry.opId });
      continue;
    }
    const placed = landCandidate(
      running,
      { opId: entry.opId, kind: 'edit', mutations: transformed },
      () => true,
    );
    if (!placed.ok) {
      rejected.push(placed.rejected);
      landed.push(...landedOwn(undoOfSplices(transformed)));
      continue;
    }
    running = placed.document;
    const row: Entry = {
      seq: room.log.length + 1,
      rev: 0,
      kind: 'edit',
      author: { kind: 'human', name: clientId },
      clientId,
      opId: entry.opId,
      mutations: placed.mutations,
      at: '2026-10-03T00:00:00.000Z',
    };
    room.log.push(row);
    admitted.push(row);
  }
  room.document = running;
  return { admitted, rejected };
}

/** The cover's title as the room holds it: the canvas heading block's text, or the field. */
function titleOf(document: DeckDocument): string {
  const slide = document.slides[COVER_ID]!;
  if (slide.kind === 'title') return slide.heading;
  const block = slideBlocks(slide).find((row) => row.block.id === 'heading')?.block;
  return block !== undefined && 'text' in block && typeof block.text === 'string' ? block.text : '';
}

describe('a cover that converts while two people type into it (fix round 3)', () => {
  it("keeps both words when B's conversion lands first and A's word and A's conversion follow in one POST (the standing row's red reading)", () => {
    // the object's admissions of R1's red reading of sync.title.concurrent-both-kept, round 2
    const room: Room = { document: deckWithCover('Sync title ca1 da1 cb1 db1 cb2 ca2'), log: [] };
    for (let i = 0; i < 7; i += 1) room.log.push({ seq: i + 1 } as Entry);
    const b = admit(room, 'b', 7, [
      {
        mutations: [
          conversionOf('Sync title ca1 da1 cb1 db1 cb2 ca2'),
          blockSplice(31, 'db2 '),
          ...SIZE,
        ],
      },
    ]);
    expect(b.rejected).toEqual([]);
    expect(titleOf(room.document)).toBe('Sync title ca1 da1 cb1 db1 cb2 db2 ca2');
    // A heard nothing of B's conversion: its word is a field run, its Escape the size alone
    const a = admit(room, 'a', 7, [
      { mutations: [fieldSplice(34, ' da2')], run: true },
      { mutations: [conversionOf('Sync title ca1 da1 cb1 db1 cb2 ca2 da2'), ...SIZE] },
    ]);
    expect(a.rejected).toEqual([]);
    // the field run lands on the canvas's heading block past B's word; the conversion yields
    expect(a.admitted[0]?.mutations).toEqual([blockSplice(38, ' da2')]);
    expect(a.admitted[1]?.mutations).toEqual(SIZE);
    expect(titleOf(room.document)).toBe('Sync title ca1 da1 cb1 db1 cb2 db2 ca2 da2');
  });

  it("keeps both words when A's conversion lands first and B's arrives with its word after it", () => {
    const room: Room = { document: deckWithCover('Two typers tb2 ta2'), log: [] };
    room.log.push({ seq: 1 } as Entry);
    admit(room, 'a', 1, [{ mutations: [fieldSplice(18, ' ua2')], run: true }]);
    admit(room, 'a', 2, [{ mutations: [conversionOf('Two typers tb2 ta2 ua2'), ...SIZE] }]);
    // B posts on base 2: A's conversion landed after it
    const b = admit(room, 'b', 2, [
      { mutations: [conversionOf('Two typers tb2 ta2'), blockSplice(14, ' ub2'), ...SIZE] },
    ]);
    expect(b.rejected).toEqual([]);
    expect(titleOf(room.document)).toBe('Two typers tb2 ub2 ta2 ua2');
  });

  it('yields a conversion of a cover the room holds as a canvas already, though the tab heard of it before it posted', () => {
    const room: Room = { document: deckWithCover('Two typers ta2 ua2'), log: [] };
    admit(room, 'a', 0, [{ mutations: [conversionOf('Two typers ta2 ua2'), ...SIZE] }]);
    // B's base is after A's conversion: nothing landed since it, the document says converted
    const b = admit(room, 'b', 1, [
      { mutations: [conversionOf('Two typers ta2'), blockSplice(14, ' ub2'), ...SIZE] },
    ]);
    expect(b.rejected).toEqual([]);
    expect(b.admitted[0]?.mutations?.some((mutation) => mutation.op === 'slide.replace')).toBe(
      false,
    );
    expect(titleOf(room.document)).toBe('Two typers ta2 ub2 ua2');
  });

  it("carries the other person's words into a conversion that lands after them", () => {
    const room: Room = { document: deckWithCover('Two typers ta1'), log: [] };
    admit(room, 'a', 0, [{ mutations: [fieldSplice(14, ' ua1')] }]);
    // B measured its copy before A's word reached it, then typed its own after its copy's end
    const b = admit(room, 'b', 0, [
      { mutations: [conversionOf('Two typers ta1'), blockSplice(14, ' ub1'), ...SIZE] },
    ]);
    expect(b.rejected).toEqual([]);
    const [replacement] = b.admitted[0]?.mutations ?? [];
    expect(replacement?.op).toBe('slide.replace');
    expect(titleOf(room.document)).toBe('Two typers ta1 ua1 ub1');
    expect(isCanvasSlide(room.document.slides[COVER_ID]!)).toBe(true);
  });

  it('leaves a lone conversion and a bare replacement as they were', () => {
    const document = deckWithCover('Alone');
    const lone = [conversionOf('Alone'), blockSplice(5, ' typed'), ...SIZE];
    expect(transformEntry(lone, [], false, document)).toEqual(lone);
    // the source drawer's replacement of a canvas keeps last writer wins, with its own text
    const converted = deckWithCover('Alone');
    converted.slides[COVER_ID] = (
      conversionOf('Alone') as Extract<Mutation, { op: 'slide.replace' }>
    ).slide;
    const drawer = conversionOf('Rewritten by hand');
    expect(transformEntry([drawer], [], false, converted)).toEqual([drawer]);
    expect(carryFieldText([drawer], document)).toEqual([drawer]);
  });

  it('reads the blocks a conversion made of the fields, and nothing on a slide that is not one', () => {
    const replacement = conversionOf('Title') as Extract<Mutation, { op: 'slide.replace' }>;
    expect([...(canvasFieldBlocks(replacement.slide) ?? new Map())]).toEqual([
      ['heading', 'heading'],
      ['lead', 'lead'],
    ]);
    expect(canvasFieldBlocks(workedDocument().slides[COVER_ID]!)).toBeNull();
    expect(canvasFieldBlocks(SLIDE)).toBeNull();
  });
});
