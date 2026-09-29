import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { fieldObjectIds, retargetFieldRuns, slideToConvertFor } from './convert-first';
import { toCanvas } from '@turboslide/schema/canvas';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { Slide } from '@turboslide/schema/deck';

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

  it('reads past a text run on a slide field and still converts on a mark at another path', () => {
    // the sync and costs round (docs/SYNC.md 3.4; build/b2.md R2): a burst into the cover's
    // heading travels as text.splice { blockId: 'heading', path: '/heading' } and writes the
    // field in place, so it names nothing; a mark on the heading at another path is a write
    // against the field object and converts as before
    expect(
      slideToConvertFor(document, [
        {
          op: 'text.splice',
          slideId: 'title',
          blockId: 'heading',
          path: '/heading',
          at: 0,
          remove: 0,
          insert: 'Acme ',
        },
      ]),
    ).toBeNull();
    expect(
      slideToConvertFor(document, [
        {
          op: 'text.mark',
          slideId: 'thesis',
          blockId: 'big',
          path: '/big',
          range: [0, 2],
          edit: { kind: 'marks', set: { b: true } },
        },
      ]),
    ).toBeNull();
    expect(
      slideToConvertFor(document, [
        {
          op: 'text.mark',
          slideId: 'title',
          blockId: 'heading',
          path: '/text',
          range: [0, 2],
          edit: { kind: 'marks', set: { b: true } },
        },
      ]),
    ).toBe('title');
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

// The write's field text runs follow the conversion the same write makes (VERIFICATION.md "Polish
// round, pass 1" finding 1): the title's last burst rides with the placeholder shrink's size
// write, whose `slide.replace` travels in front, so the run's `blockId heading, path /heading`
// must become the canvas's `heading` block at `/text` or the reducer refuses the whole write.
describe('retargetFieldRuns', () => {
  const boxes: CanvasBoxes = {
    mark: [137, 307, 132, 84],
    blocks: { heading: [137, 439, 1326, 90], lead: [137, 555, 901, 38] },
    prompted: [],
  };
  const title = document.slides['title'] as Slide;
  const canvas = toCanvas(title, boxes)?.slide as Slide;
  const splice: Mutation = {
    op: 'text.splice',
    slideId: 'title',
    blockId: 'heading',
    path: '/heading',
    at: 24,
    remove: 0,
    insert: ' in ninety days',
  };
  const size: Mutation = {
    op: 'block.set',
    slideId: 'title',
    blockId: 'heading',
    path: '/typography',
    value: { size: 72 },
  };

  it('re-addresses the heading and lead runs to the canvas blocks at /text', () => {
    const mark: Mutation = {
      op: 'text.mark',
      slideId: 'title',
      blockId: 'lead',
      path: '/lead',
      range: [0, 4],
      edit: { kind: 'marks', set: { b: true } },
    };
    expect(retargetFieldRuns(title, canvas, [splice, size, mark])).toEqual([
      { ...splice, blockId: 'heading', path: '/text' },
      size,
      { ...mark, blockId: 'lead', path: '/text' },
    ]);
  });

  it('re-addresses a statement big line to its block', () => {
    const thesis = document.slides['thesis'] as Slide;
    const big = toCanvas(thesis, { blocks: { big: [137, 300, 1326, 120] }, prompted: [] })
      ?.slide as Slide;
    const run: Mutation = {
      op: 'text.replace',
      slideId: 'thesis',
      blockId: 'big',
      path: '/big',
      range: [0, 0],
      text: 'Now ',
    };
    expect(retargetFieldRuns(thesis, big, [run])).toEqual([
      { ...run, blockId: 'big', path: '/text' },
    ]);
  });

  it('leaves a run on another slide, a block write and an unconverted slide as they stand', () => {
    const elsewhere: Mutation = { ...splice, slideId: 'thesis', blockId: 'big', path: '/big' };
    expect(retargetFieldRuns(title, canvas, [elsewhere])).toEqual([elsewhere]);
    expect(retargetFieldRuns(title, title, [splice, size])).toEqual([splice, size]);
    const onBlock: Mutation = { ...splice, path: '/text' };
    expect(retargetFieldRuns(title, canvas, [onBlock])).toEqual([onBlock]);
  });
});
