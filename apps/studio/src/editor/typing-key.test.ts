import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import { SLIDE_TEXT_FIELDS, typingKeyOf } from './typing-key';

// The undo grouping key (SPEC 7.2.15; build-4/hotfix-4.md cause W10): a typing burst on a block's
// run and a burst on a title or statement slide's text field both name one Text, so the bursts of
// one word fold into one Cmd Z; every other write stays its own step.

const splice: Mutation = {
  op: 'text.splice',
  slideId: 's1',
  blockId: 'p1',
  path: '/text',
  at: 4,
  remove: 0,
  insert: 'x',
};

describe('typingKeyOf', () => {
  it('names the run of a text.splice', () => {
    expect(typingKeyOf([splice])).toBe('s1/p1/text');
    expect(typingKeyOf([{ ...splice, at: 5, insert: 'y' }])).toBe('s1/p1/text');
    expect(typingKeyOf([{ ...splice, blockId: 'p2' }])).toBe('s1/p2/text');
  });

  it('names the field of a title or statement slide burst, which writes the whole field', () => {
    expect([...SLIDE_TEXT_FIELDS].sort()).toEqual(['/big', '/heading', '/lead']);
    for (const path of SLIDE_TEXT_FIELDS) {
      const set: Mutation = { op: 'slide.set', slideId: 'title', path, value: 'Quarterly review' };
      expect(typingKeyOf([set])).toBe(`title${path}`);
      /* two bursts on the same field share the key whatever they wrote */
      expect(typingKeyOf([{ ...set, value: 'Quarterly review: Q3' }])).toBe(`title${path}`);
    }
    expect(typingKeyOf([{ op: 'slide.set', slideId: 'a', path: '/heading', value: 'x' }])).not.toBe(
      typingKeyOf([{ op: 'slide.set', slideId: 'b', path: '/heading', value: 'x' }]),
    );
  });

  it('is null for every other write: another slide field, a non string value, a block.set, a text.replace, a batch', () => {
    expect(
      typingKeyOf([{ op: 'slide.set', slideId: 's1', path: '/notes', value: 'x' }]),
    ).toBeNull();
    expect(
      typingKeyOf([{ op: 'slide.set', slideId: 's1', path: '/heading', value: 3 }]),
    ).toBeNull();
    expect(
      typingKeyOf([{ op: 'block.set', slideId: 's1', blockId: 'p1', path: '/text', value: 'x' }]),
    ).toBeNull();
    expect(
      typingKeyOf([
        {
          op: 'text.replace',
          slideId: 's1',
          blockId: 'p1',
          path: '/text',
          range: [0, 1],
          text: 'y',
        },
      ]),
    ).toBeNull();
    expect(typingKeyOf([splice, splice])).toBeNull();
    expect(typingKeyOf([])).toBeNull();
  });
});
