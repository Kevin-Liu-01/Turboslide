import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { fieldObjectIds, slideToConvertFor } from './convert-first';

// The conversion a format write on a fixed kind's field needs first (docs/RETURN.md 2.14 item 1):
// a mutation that names the cover title's heading, a statement's big line or a picture kind's
// photograph, none of them a block of its slide, names the slide to convert; a block of a content
// slide, a slide field write and a deck write name nothing.

const document: DeckDocument = workedDocument();

describe('slideToConvertFor', () => {
  it('names the title slide for a format write on its heading or lead', () => {
    const bold: Mutation = {
      op: 'block.set',
      slideId: 'title',
      blockId: 'heading',
      path: '/typography',
      value: { weight: 500 },
    };
    expect(slideToConvertFor(document, [bold])).toBe('title');
    expect(
      slideToConvertFor(document, [
        {
          op: 'text.mark',
          slideId: 'title',
          blockId: 'lead',
          path: '/text',
          range: [0, 4],
          edit: { kind: 'marks', set: { i: true } },
        },
      ]),
    ).toBe('title');
    expect(
      slideToConvertFor(document, [
        {
          op: 'block.set',
          slideId: 'thesis',
          blockId: 'big',
          path: '/typography',
          value: { align: 'center' },
        },
      ]),
    ).toBe('thesis');
  });

  it('names nothing for a block of a content slide, a slide field write, a deck write or an unknown id', () => {
    expect(
      slideToConvertFor(document, [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/typography',
          value: { weight: 500 },
        },
      ]),
    ).toBeNull();
    expect(
      slideToConvertFor(document, [
        { op: 'slide.set', slideId: 'title', path: '/heading', value: 'Renewal' },
      ]),
    ).toBeNull();
    expect(
      slideToConvertFor(document, [{ op: 'deck.set', path: '/title', value: 'x' }]),
    ).toBeNull();
    expect(
      slideToConvertFor(document, [
        { op: 'block.set', slideId: 'title', blockId: 'p9', path: '/typography' },
      ]),
    ).toBeNull();
    expect(slideToConvertFor(document, [])).toBeNull();
  });

  it('names the ids the conversion keeps for every fixed kind', () => {
    expect([...fieldObjectIds(document.slides['title']!)].sort()).toEqual([
      'heading',
      'lead',
      'mark',
    ]);
    expect([...fieldObjectIds(document.slides['thesis']!)]).toEqual(['big']);
    expect(fieldObjectIds(document.slides['content-rule']!).size).toBe(0);
  });
});
