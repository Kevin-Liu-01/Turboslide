// The coalescing rules of SPEC-3 0.51: a typing burst folds into one splice, a drag's pos sets
// into the final box, runs break per author, and each coalesced record's inverse (computed by
// the reducer) undoes only that author's work on an interleaved two author session.
import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { applyWrite } from '@turboslide/schema/reduce';
import { validateDocument } from '@turboslide/schema/validate';
import type { DeckDocument } from '@turboslide/schema/deck';

import type { Entry, RoomMutation, TextSpliceMutation } from './channel.ts';
import { CLIENT_A, CLIENT_B, kevin, maya, threadFixture } from './channel-contract.ts';
import { coalesceEntries, foldMutation, mergeSplices, spliceString } from './coalesce.ts';

function splice(at: number, remove: number, insert: string, blockId = 'p1'): TextSpliceMutation {
  return { op: 'text.splice', slideId: 'content-rule', blockId, path: '/text', at, remove, insert };
}

function setPointer(blockId: string, path: string, value: unknown): RoomMutation {
  return { op: 'block.set', slideId: 'content-rule', blockId, path, value };
}

let seq = 0;
function entry(clientId: string, author: typeof kevin, mutations: RoomMutation[]): Entry {
  seq += 1;
  return {
    seq,
    rev: 412,
    kind: 'edit',
    author,
    clientId,
    opId: `${clientId}:${seq}`,
    mutations,
    at: '2026-09-13T10:00:00.000Z',
  };
}

function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

/** A small deterministic generator, so the property run is repeatable. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('mergeSplices', () => {
  it('folds a typing burst, a backspace inside it and a run of deletes into one splice', () => {
    const typed = ['H', 'e', 'l', 'l', 'o'].map((ch, i) => splice(i, 0, ch));
    const list: RoomMutation[] = [];
    for (const m of typed) foldMutation(list, m);
    expect(list).toEqual([splice(0, 0, 'Hello')]);
    // backspace over the last two, then type 'p'
    foldMutation(list, splice(3, 2, ''));
    foldMutation(list, splice(3, 0, 'p'));
    expect(list).toEqual([splice(0, 0, 'Help')]);
    // a replacement inside the insert
    foldMutation(list, splice(1, 2, 'EL'));
    expect(list).toEqual([splice(0, 0, 'HELp')]);
    // forward deletes at one offset and backspaces walking left
    const forward: RoomMutation[] = [];
    foldMutation(forward, splice(10, 1, ''));
    foldMutation(forward, splice(10, 1, ''));
    expect(forward).toEqual([splice(10, 2, '')]);
    const back: RoomMutation[] = [];
    foldMutation(back, splice(10, 1, ''));
    foldMutation(back, splice(9, 1, ''));
    expect(back).toEqual([splice(9, 2, '')]);
  });

  it('keeps splices apart when they are not one gesture or not one Text', () => {
    expect(mergeSplices(splice(0, 0, 'ab'), splice(5, 0, 'c'))).toBeNull();
    expect(mergeSplices(splice(0, 0, 'ab'), splice(2, 0, 'c', 'p2'))).toBeNull();
    // a delete that reaches before the insert is not inside it
    expect(mergeSplices(splice(4, 0, 'ab'), splice(3, 2, ''))).toBeNull();
    const list: RoomMutation[] = [];
    foldMutation(list, splice(0, 0, 'a'));
    foldMutation(list, splice(5, 0, 'b'));
    expect(list).toHaveLength(2);
  });

  it('agrees with applying the gestures one by one, over 300 random typing sessions', () => {
    const random = prng(20260913);
    for (let session = 0; session < 300; session += 1) {
      let text = 'The content rule states what was built.';
      let caret = Math.floor(random() * (text.length + 1));
      const folded: RoomMutation[] = [];
      const gestures = 1 + Math.floor(random() * 30);
      for (let i = 0; i < gestures; i += 1) {
        const roll = random();
        let next: TextSpliceMutation;
        if (roll < 0.55)
          next = splice(caret, 0, String.fromCharCode(97 + Math.floor(random() * 26)));
        else if (roll < 0.8 && caret > 0) next = splice(caret - 1, 1, '');
        else if (roll < 0.9 && caret < text.length) next = splice(caret, 1, '');
        else {
          caret = Math.floor(random() * (text.length + 1));
          continue;
        }
        text = spliceString(text, next);
        caret = next.at + next.insert.length;
        foldMutation(folded, next);
      }
      let replay = 'The content rule states what was built.';
      for (const m of folded) replay = spliceString(replay, m as TextSpliceMutation);
      expect(replay, `session ${session}`).toBe(text);
    }
  });
});

describe('coalesceEntries', () => {
  it('collapses consecutive sets of one pointer to the last value and keeps other pointers', () => {
    seq = 0;
    const drag = entry(CLIENT_A, kevin, [
      setPointer('list', '/pos', { x: 0, y: 0, w: 100, h: 50 }),
      setPointer('list', '/pos', { x: 8, y: 0, w: 100, h: 50 }),
    ]);
    const more = entry(CLIENT_A, kevin, [
      setPointer('list', '/pos', { x: 16, y: 8, w: 100, h: 50 }),
      setPointer('list', '/size', 22),
      setPointer('list', '/pos', { x: 24, y: 8, w: 100, h: 50 }),
    ]);
    const writes = coalesceEntries([drag, more]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ author: kevin, clientId: CLIENT_A, fromSeq: 1, toSeq: 2 });
    expect(writes[0]?.opIds).toEqual([`${CLIENT_A}:1`, `${CLIENT_A}:2`]);
    // the pos sets fold while consecutive; the size set between them keeps the last pos apart
    expect(writes[0]?.mutations).toEqual([
      setPointer('list', '/pos', { x: 16, y: 8, w: 100, h: 50 }),
      setPointer('list', '/size', 22),
      setPointer('list', '/pos', { x: 24, y: 8, w: 100, h: 50 }),
    ]);
  });

  it('breaks runs per author and per client and skips comment entries', () => {
    seq = 0;
    const a1 = entry(CLIENT_A, kevin, [splice(0, 0, 'H')]);
    const a2 = entry(CLIENT_A, kevin, [splice(1, 0, 'i')]);
    const b1 = entry(CLIENT_B, maya, [splice(10, 0, 'x')]);
    const a3 = entry(CLIENT_A, kevin, [splice(2, 0, '!')]);
    const c: Entry = {
      ...entry(CLIENT_B, maya, []),
      kind: 'comment',
      comment: { op: 'add', thread: threadFixture() },
    };
    delete (c as { mutations?: unknown }).mutations;
    const writes = coalesceEntries([a1, a2, b1, a3, c]);
    expect(writes.map((w) => [w.author.name, w.fromSeq, w.toSeq])).toEqual([
      ['kevin', 1, 2],
      ['maya', 3, 3],
      ['kevin', 4, 4],
    ]);
    expect(writes[0]?.mutations).toEqual([splice(0, 0, 'Hi')]);
    expect(writes[2]?.mutations).toEqual([splice(2, 0, '!')]);
    // the same person on two tabs is two runs
    seq = 0;
    const tabs = coalesceEntries([
      entry(CLIENT_A, kevin, [splice(0, 0, 'a')]),
      entry(CLIENT_B, kevin, [splice(1, 0, 'b')]),
    ]);
    expect(tabs).toHaveLength(2);
  });

  it('gives each author a record whose inverse undoes only that author’s work', () => {
    seq = 0;
    // an interleaved two author session on one slide: kevin resizes the list while maya widens
    // the paragraph's measure
    const entries = [
      entry(CLIENT_A, kevin, [setPointer('list', '/size', 20)]),
      entry(CLIENT_B, maya, [setPointer('p1', '/measure', 40)]),
      entry(CLIENT_A, kevin, [setPointer('list', '/size', 22), setPointer('list', '/size', 24)]),
      entry(CLIENT_B, maya, [setPointer('p1', '/measure', 44)]),
    ];
    const writes = coalesceEntries(entries);
    expect(writes).toHaveLength(4);
    let document = normalized();
    const records = writes.map((write) => {
      const applied = applyWrite(document, {
        baseRevision: document.deck.revision,
        author: write.author,
        mutations: write.mutations as Mutation[],
      });
      if (!applied.ok) throw new Error(`write refused: ${applied.message}`);
      document = applied.document;
      return { write, inverse: applied.inverse };
    });
    const list = (doc: DeckDocument): { size?: unknown; measure?: unknown } => {
      const slide = doc.slides['content-rule'];
      const right = (slide?.kind === 'content' ? slide.slots.right?.[0] : undefined) as
        { size?: unknown } | undefined;
      const left = (slide?.kind === 'content' ? slide.slots.left?.[1] : undefined) as
        { measure?: unknown } | undefined;
      return { size: right?.size, measure: left?.measure };
    };
    expect(list(document)).toMatchObject({ size: 24, measure: 44 });
    // undo kevin's last record: his size returns to 20 and maya's measure stays at 44
    const kevinLast = records[2];
    if (kevinLast === undefined) throw new Error('fixture');
    const undone = applyWrite(document, {
      baseRevision: document.deck.revision,
      author: kevin,
      mutations: kevinLast.inverse,
    });
    if (!undone.ok) throw new Error(undone.message);
    expect(list(undone.document)).toMatchObject({ size: 20, measure: 44 });
    // and maya's last record alone
    const mayaLast = records[3];
    if (mayaLast === undefined) throw new Error('fixture');
    const undoneMaya = applyWrite(undone.document, {
      baseRevision: undone.document.deck.revision,
      author: maya,
      mutations: mayaLast.inverse,
    });
    if (!undoneMaya.ok) throw new Error(undoneMaya.message);
    expect(list(undoneMaya.document)).toMatchObject({ size: 20, measure: 40 });
  });
});
