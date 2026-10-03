// @vitest-environment jsdom
// The word at the double click's point (docs/archive/rounds/POLISH.md 2.4 item 30; VERIFICATION.md "Polish
// round, pass 1" finding 12): the word the caret's text node holds around the caret, taking the
// character after the caret first, so a caret before "2" in "Step 2" selects "2" and a caret
// inside "Step" selects "Step". The DOM path (placeCaret with `word`) runs in the walk's
// diagrams.label.double-click-selects-word; this pins the pure range.
import { describe, expect, it } from 'vitest';

import { wordRangeInNode } from '../InlineText.tsx';

const textNode = (data: string) => document.createTextNode(data);

describe('wordRangeInNode', () => {
  it('takes the word after a caret at a word start, else the word before it', () => {
    const node = textNode('Step 2');
    expect(wordRangeInNode(node, 5)).toMatchObject({ start: 5, end: 6 });
    expect(wordRangeInNode(node, 6)).toMatchObject({ start: 5, end: 6 });
    expect(wordRangeInNode(node, 2)).toMatchObject({ start: 0, end: 4 });
    expect(wordRangeInNode(node, 0)).toMatchObject({ start: 0, end: 4 });
    expect(wordRangeInNode(node, 4)).toMatchObject({ start: 0, end: 4 });
  });

  it('keeps an apostrophe inside a word and answers null on white space and outside a text node', () => {
    expect(wordRangeInNode(textNode("Acme's plan"), 3)).toMatchObject({ start: 0, end: 6 });
    expect(wordRangeInNode(textNode('a  b'), 2)).toBeNull();
    expect(wordRangeInNode(document.createElement('span'), 0)).toBeNull();
  });
});
