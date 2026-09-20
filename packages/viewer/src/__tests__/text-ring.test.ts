import { describe, expect, it } from 'vitest';
import { TEXT_RING_OUTSET, blockTypeIn, boxContains, ringBoxFor } from '../text-ring';

describe('the text ring outset', () => {
  it('stands a text object ring off its text by the outset on every side', () => {
    expect(ringBoxFor('heading', [100, 200, 300, 40])).toEqual([
      100 - TEXT_RING_OUTSET,
      200 - TEXT_RING_OUTSET,
      300 + 2 * TEXT_RING_OUTSET,
      40 + 2 * TEXT_RING_OUTSET,
    ]);
    for (const type of ['paragraph', 'text', 'plain', 'say', 'credit']) {
      expect(ringBoxFor(type, [0, 0, 10, 10])[0]).toBe(-TEXT_RING_OUTSET);
    }
  });

  it('leaves every other object ring at its measured box', () => {
    for (const type of ['picture', 'shape', 'table', 'chart', 'rule', 'composite', undefined]) {
      expect(ringBoxFor(type, [5, 6, 7, 8])).toEqual([5, 6, 7, 8]);
    }
  });

  it('reads a press inside the band between the text and its ring as a press on the object', () => {
    const ring = ringBoxFor('paragraph', [100, 100, 200, 50]);
    expect(boxContains(ring, 95, 120)).toBe(true);
    expect(boxContains(ring, 100 + 200 + TEXT_RING_OUTSET, 150 + TEXT_RING_OUTSET)).toBe(true);
    expect(boxContains(ring, 89, 120)).toBe(false);
    expect(boxContains(ring, 150, 161)).toBe(false);
  });
});

describe('the block type read from the rendered element', () => {
  const rootWith = (types: Record<string, string>): ParentNode =>
    ({
      querySelector(selector: string) {
        const id = /\[data-block="([^"]+)"\]/.exec(selector)?.[1];
        const type = id === undefined ? undefined : types[id];
        return type === undefined
          ? null
          : { getAttribute: (name: string) => (name === 'data-type' ? type : null) };
      },
    }) as unknown as ParentNode;

  it('reads data-type for a grammar field and answers undefined for an unknown id', () => {
    const root = rootWith({ heading: 'heading', p1: 'paragraph' });
    expect(blockTypeIn(root, 'heading')).toBe('heading');
    expect(blockTypeIn(root, 'p1')).toBe('paragraph');
    expect(blockTypeIn(root, 'nope')).toBeUndefined();
    expect(blockTypeIn(null, 'heading')).toBeUndefined();
    expect(blockTypeIn(root, 'a"b')).toBeUndefined();
  });
});
