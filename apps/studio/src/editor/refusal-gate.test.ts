// The refusal card's gate (docs/FEATURES.md 2.2 rank 8; the integrator of ship one): a write the
// room refused as invalid with no typed text and every named object still on the document came
// from a chrome control and is said once in the snackbar; a stale write, a notice carrying text,
// and a write whose slide or block is gone (the loser of a structural race, docs/SYNC.md; the row
// sync.structural.concurrent reads A's reject card) keep the card and its Copy text.
import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { slideBlocks, slideOrder } from '@turboslide/schema/deck';

import { isControlRefusal } from './EditorRoot';

const document = workedDocument();
const slideId = slideOrder(document.deck)[0]!;
const slide = document.slides[slideId]!;
const blockId = slideBlocks(slide)[0]!.block.id;

describe('isControlRefusal', () => {
  it('reads a schema refusal of a write on an object the document still holds as a control refusal', () => {
    expect(
      isControlRefusal(
        {
          reason: 'invalid',
          text: '',
          message: `slides/${slideId}.json /slots/main/0/typography: a table carries no typography`,
          mutations: [{ op: 'block.set', slideId, blockId, path: '/typography', value: {} }],
        },
        document,
      ),
    ).toBe(true);
  });

  it("keeps the card for a reducer's refusal or a refusal with no message (the object the write named is gone)", () => {
    for (const message of [
      'No slide "gone-slide"',
      `No block "gone" on slide "${slideId}"`,
      undefined,
    ])
      expect(
        isControlRefusal(
          {
            reason: 'invalid',
            text: '',
            ...(message === undefined ? {} : { message }),
            mutations: [{ op: 'block.set', slideId, blockId, path: '/pos', value: { x: 1 } }],
          },
          document,
        ),
        message ?? 'no message',
      ).toBe(false);
  });

  it('keeps the card for a stale write and for a notice that carries text', () => {
    expect(isControlRefusal({ reason: 'stale', text: '', mutations: [] }, document)).toBe(false);
    expect(
      isControlRefusal(
        {
          reason: 'invalid',
          text: 'the words the seller typed',
          mutations: [{ op: 'block.set', slideId, blockId, path: '/text', value: 'x' }],
        },
        document,
      ),
    ).toBe(false);
  });

  it("keeps the card for a write whose slide or block is gone (the structural loser's notice)", () => {
    expect(
      isControlRefusal(
        {
          reason: 'invalid',
          text: '',
          message: 'slides/gone-slide.json /slots/main/0/pos: refused',
          mutations: [
            { op: 'block.set', slideId: 'gone-slide', blockId, path: '/pos', value: { x: 0 } },
          ],
        },
        document,
      ),
    ).toBe(false);
    expect(
      isControlRefusal(
        {
          reason: 'invalid',
          text: '',
          message: `slides/${slideId}.json /slots/main/9/pos: refused`,
          mutations: [{ op: 'block.set', slideId, blockId: 'gone-block', path: '/pos', value: {} }],
        },
        document,
      ),
    ).toBe(false);
  });

  it('reads the notice alone when no document is given', () => {
    expect(
      isControlRefusal({
        reason: 'invalid',
        text: '',
        message: '/brand/mark: refused',
        mutations: [],
      }),
    ).toBe(true);
  });
});
