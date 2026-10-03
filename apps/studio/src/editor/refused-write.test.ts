// A refused write's one sentence (docs/archive/rounds/POLISH.md item 102; the row sync.reject.sentence-below-
// toolbar and the loser of sync.structural.concurrent): a structural write reads one snackbar
// sentence named by what it was, with no id, and the same sentence is what the write's caller is
// thrown, so the chrome's dispatch says nothing else over it; typed text keeps the room's own
// sentence for the card.
import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import {
  isStructuralRefusal,
  refusedText,
  refusedWriteSentence,
  structuralRefusalSentence,
} from './refused-write';

const slideId = 'split-9';
const blockId = 'body-3';
const move: Mutation = { op: 'block.move', slideId, blockId, slot: 'main' };
const remove: Mutation = { op: 'slide.remove', slideId };
const resize: Mutation = {
  op: 'block.set',
  slideId,
  blockId,
  path: '/pos',
  value: { x: 1, y: 2, w: 3, h: 4 },
};
const typed: Mutation = {
  op: 'text.splice',
  slideId,
  blockId,
  path: '/text',
  at: 4,
  remove: 0,
  insert: ' refused',
};
const caption: Mutation = { op: 'block.set', slideId, blockId, path: '/caption', value: 'Q3' };

describe('refusedText and isStructuralRefusal', () => {
  it('reads the typed text of a write and none from a structural one', () => {
    expect(refusedText([typed])).toBe(' refused');
    expect(refusedText([caption])).toBe('Q3');
    expect(refusedText([move, remove, resize])).toBe('');
    expect(isStructuralRefusal([move])).toBe(true);
    expect(isStructuralRefusal([typed])).toBe(false);
  });
});

describe('structuralRefusalSentence', () => {
  it('names the change and never an id', () => {
    expect(structuralRefusalSentence([move])).toBe('Your object was not moved. Try again');
    expect(structuralRefusalSentence([remove])).toBe('Your slide was not deleted. Try again');
    /* a drag or a handle writes `/pos` (the loser of sync.structural.concurrent read
       "Your change was not applied" on the enforce preview of 2026-09-30) */
    expect(structuralRefusalSentence([resize])).toBe(
      'Your object was not moved or resized. Try again',
    );
    expect(structuralRefusalSentence([caption])).toBe('Your change was not applied. Try again');
    for (const mutations of [[move], [remove], [resize], [move, resize]])
      expect(structuralRefusalSentence(mutations)).not.toMatch(/split-|body-|[{}"]/);
  });
});

describe('refusedWriteSentence', () => {
  it("throws the caller the snackbar's sentence for a structural write, whatever the room said", () => {
    for (const message of ['The room answered 409', 'Slide "split-9" already exists', undefined])
      expect(refusedWriteSentence({ reason: 'invalid', message }, [move])).toBe(
        'Your object was not moved. Try again',
      );
    expect(
      refusedWriteSentence({ reason: 'forbidden', message: 'The room answered 409' }, [remove]),
    ).toBe('Your slide was not deleted. Try again');
  });

  it("keeps the room's sentence for typed text, whose card carries it", () => {
    expect(
      refusedWriteSentence({ reason: 'invalid', message: 'the text changed elsewhere' }, [typed]),
    ).toBe('the text changed elsewhere');
    expect(refusedWriteSentence({ reason: 'stale' }, [typed])).toBe(
      'The change was not accepted (stale)',
    );
  });
});
