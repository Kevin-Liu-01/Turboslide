import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';

import {
  blockSentence,
  brailleSlideName,
  formattingSentence,
  slideSentence,
  speakSentence,
  verbalizeSentence,
} from './verbalize.ts';

// The Accessibility menu's sentences (gslides-parity SPEC-5 7.5; R10 7.4): the words a screen
// reader speaks for the three Verbalize rows, the braille name of a filmstrip card and the
// speechSynthesis pass, pinned without a DOM.

const heading = {
  id: 'h',
  type: 'heading',
  level: 'h2',
  text: 'Quarterly *numbers*',
} as unknown as Block;
const list = {
  id: 'l',
  type: 'plain',
  items: [{ text: 'One' }, { text: 'Two' }],
} as unknown as Block;
const slide = {
  id: 'body',
  kind: 'content',
  layout: { type: 'stack' },
  slots: { main: [heading, list, { id: 'p', type: 'picture', asset: 'a' }] },
} as unknown as Slide;

describe('the sentences', () => {
  it('names a block by its kind and text, and a slide by its position and title', () => {
    expect(blockSentence(heading)).toBe('Heading: Quarterly numbers');
    expect(blockSentence(list)).toBe('List: One. Two');
    expect(blockSentence({ id: 'p', type: 'picture', asset: 'a' } as unknown as Block)).toBe(
      'Image',
    );
    expect(slideSentence(slide, 4, 12)).toBe('Slide 4 of 12, Quarterly numbers');
    expect(slideSentence(undefined, 2, 3)).toBe('Slide 2 of 3');
  });
  it('reads the selection, the block or the slide for Verbalize selection', () => {
    expect(verbalizeSentence('selection', { slide, n: 1, of: 2, selectedText: ' numbers ' })).toBe(
      'numbers',
    );
    expect(verbalizeSentence('selection', { slide, n: 1, of: 2, block: heading })).toBe(
      'Heading: Quarterly numbers',
    );
    expect(verbalizeSentence('selection', { slide, n: 1, of: 2 })).toBe(
      'Slide 1 of 2, Quarterly numbers',
    );
  });
  it('reads the marks and typography at the caret in Google’s word order', () => {
    expect(
      formattingSentence({ i: true, color: 'ink' }, { size: 22, align: 'left', weight: 700 }),
    ).toBe('Bold, italic, 17 point, left aligned, ink');
    expect(formattingSentence({})).toBe('Plain text');
    expect(
      verbalizeSentence('selectionFormatting', {
        slide,
        n: 1,
        of: 2,
        text: 'a *b* c',
        range: [2, 3],
      }),
    ).toBe('Bold');
  });
  it('reads from the caret to the end of the text, then the remaining blocks', () => {
    expect(
      verbalizeSentence('fromCursor', {
        slide,
        n: 1,
        of: 2,
        block: heading,
        text: 'Quarterly *numbers*',
        range: [10, 10],
      }),
    ).toBe('numbers. List: One. Two. Image');
    expect(verbalizeSentence('fromCursor', { slide, n: 1, of: 2 })).toBe(
      'Heading: Quarterly numbers. List: One. Two. Image',
    );
  });
  it('names a filmstrip card under braille support as slide, title and layout', () => {
    expect(brailleSlideName(slide, 4)).toBe('Slide 4, Quarterly numbers, stack');
    expect(brailleSlideName(undefined, 2)).toBe('Slide 2');
  });
  it('speaks through an injected synthesis in the deck language and answers false without one', () => {
    const spoken: { text: string; lang: string }[] = [];
    const synthesis = {
      speak: (u: { text: string; lang: string }) => void spoken.push(u),
      cancel: () => undefined,
    };
    expect(speakSentence('Hello', 'fr', synthesis, (text) => ({ text, lang: '' }))).toBe(true);
    expect(spoken).toEqual([{ text: 'Hello', lang: 'fr' }]);
    expect(speakSentence('Hello', 'fr', undefined)).toBe(false);
  });
});
