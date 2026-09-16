// The exporter's paragraph count (gslides-parity SPEC-5 1.3): the distinct paragraphs of a
// block's scene lines, one per list item for a list block, the number the show reads from the
// rendered nodes and the schema from the document (MILESTONES-5 B1 day 1).
import { describe, expect, it } from 'vitest';

import { paragraphCountOf } from './extract.ts';
import type { Scene, SceneText } from './types.ts';

function text(id: string, blockId: string, paragraphs: (number | undefined)[]): SceneText {
  return {
    id,
    blockId,
    box: [0, 0, 100, 20],
    textBox: [0, 0, 100, 20],
    style: {} as SceneText['style'],
    lines: paragraphs.map((paragraph, index) => ({
      box: [0, index * 20, 100, 20],
      runs: [],
      ...(paragraph !== undefined ? { paragraph } : {}),
    })) as SceneText['lines'],
    native: true,
  } as SceneText;
}

function scene(texts: SceneText[]): Scene {
  return { texts } as unknown as Scene;
}

describe('paragraphCountOf (SPEC-5 1.3)', () => {
  it('counts the distinct paragraphs of a multiline text and one for a plain text', () => {
    const one = scene([text('p/text', 'p', [undefined, undefined])]);
    expect(paragraphCountOf(one, 'p')).toBe(1);
    const three = scene([text('p/text', 'p', [0, 0, 1, 2, 2])]);
    expect(paragraphCountOf(three, 'p')).toBe(3);
  });

  it('counts one per item of a list block, a ruled row’s key and value together', () => {
    const plain = scene([
      text('list/items/0/text', 'list', [undefined]),
      text('list/items/1/text', 'list', [undefined, undefined]),
      text('list/items/2/text', 'list', [undefined]),
    ]);
    expect(paragraphCountOf(plain, 'list')).toBe(3);
    const rows = scene([
      text('rows/items/0/key', 'rows', [undefined]),
      text('rows/items/0/value', 'rows', [undefined]),
      text('rows/items/1/key', 'rows', [undefined]),
      text('rows/items/1/value', 'rows', [undefined]),
    ]);
    expect(paragraphCountOf(rows, 'rows')).toBe(2);
    const refs = scene([
      text('refs/items/0', 'refs', [undefined]),
      text('refs/items/1', 'refs', [undefined]),
    ]);
    expect(paragraphCountOf(refs, 'refs')).toBe(2);
  });

  it('answers 0 for a block without text and ignores other blocks’ texts', () => {
    const mixed = scene([text('a/text', 'a', [0, 1]), text('b/text', 'b', [undefined])]);
    expect(paragraphCountOf(mixed, 'a')).toBe(2);
    expect(paragraphCountOf(mixed, 'b')).toBe(1);
    expect(paragraphCountOf(mixed, 'c')).toBe(0);
  });
});
