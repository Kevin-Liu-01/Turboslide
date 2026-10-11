import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { WORKED_SLIDES } from '@turboslide/schema/fixtures';
import type { Mutation, TextOp } from '@turboslide/schema/mutations';
import { rewritesText } from '@turboslide/schema/transform';

import { defaultTransform, transformPast } from '../client/room-client.ts';
import { landedOwn, transformEntry } from './room-core.ts';

// The one rule of a whole Text rewrite (RUST-2; hardening HR-RT#3): every `Mutation` op against a
// text op on a slide field (the cover's lead) and on a block (a content slide's paragraph), read
// by the schema's rule and by the admission's transform (room-core `transformEntry`), which must
// answer the same. The table is typed by op, so a new mutation is a type error here until its
// row is written. HR-RC#2 extends it to the browser's rebase.

const cover = WORKED_SLIDES.find((slide) => slide.id === 'title') as Slide;
const content = WORKED_SLIDES.find((slide) => slide.id === 'content-rule') as Slide;

const onLead: TextOp = {
  op: 'text.splice',
  slideId: 'title',
  blockId: 'lead',
  path: '/lead',
  at: 4,
  remove: 0,
  insert: 'x',
};
const onBlock: TextOp = {
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at: 4,
  remove: 0,
  insert: 'x',
};

/** A slide like `slide` without the block `blockId` (a conversion or a drawer that dropped it). */
function without(slide: Slide, blockId: string): Slide {
  if (slide.kind !== 'content') return slide;
  const slots = Object.fromEntries(
    Object.entries(slide.slots).map(([slot, blocks]) => [
      slot,
      blocks.filter((block) => block.id !== blockId),
    ]),
  );
  return { ...slide, slots } as Slide;
}

type Row = { against: Mutation; lead: boolean; block: boolean; why: string };

/**
 * Every op of `Mutation`, each with the rows that decide it: [the write, rewrites the lead,
 * rewrites the block]. One row per line, so prettier leaves the table as a table.
 */
// prettier-ignore
const TABLE: { [Op in Mutation['op']]: Row[] } = {
  'slide.insert': [
    {
      against: { op: 'slide.insert', sectionId: 'brand', slide: { ...cover, id: 'cover-2' } },
      lead: false,
      block: false,
      why: 'another slide',
    },
  ],
  'slide.remove': [
    { against: { op: 'slide.remove', slideId: 'title' }, lead: true, block: false, why: 'the cover goes' },
    { against: { op: 'slide.remove', slideId: 'content-rule' }, lead: false, block: true, why: 'the content slide goes' },
  ],
  'slide.move': [
    {
      against: { op: 'slide.move', slideId: 'title', sectionId: 'brand' },
      lead: false,
      block: false,
      why: 'a move keeps every Text',
    },
  ],
  'slide.set': [
    { against: { op: 'slide.set', slideId: 'title', path: '/lead', value: 'New' }, lead: true, block: false, why: 'the lead written whole' },
    { against: { op: 'slide.set', slideId: 'title', path: '/heading', value: 'New' }, lead: false, block: false, why: 'the other field' },
    { against: { op: 'slide.set', slideId: 'title', path: '/typography/heading', value: {} }, lead: false, block: false, why: 'the title font' },
    { against: { op: 'slide.set', slideId: 'title', path: '/notes', value: 'n' }, lead: false, block: false, why: 'the notes' },
    { against: { op: 'slide.set', slideId: 'content-rule', path: '/notes', value: 'n' }, lead: false, block: false, why: 'the notes of the content slide' },
  ],
  'slide.replace': [
    { against: { op: 'slide.replace', slideId: 'content-rule', slide: content }, lead: false, block: false, why: 'the block survives the rewrite' },
    { against: { op: 'slide.replace', slideId: 'content-rule', slide: without(content, 'p1') }, lead: false, block: true, why: 'the block is gone' },
    { against: { op: 'slide.replace', slideId: 'title', slide: cover }, lead: true, block: false, why: 'a field is no block of the new slide' },
  ],
  'block.insert': [
    {
      against: {
        op: 'block.insert',
        slideId: 'content-rule',
        slot: 'left',
        block: { id: 'p9', type: 'paragraph', text: 'More' },
      } as Mutation,
      lead: false,
      block: false,
      why: 'another block',
    },
  ],
  'block.remove': [
    { against: { op: 'block.remove', slideId: 'content-rule', blockId: 'p1' }, lead: false, block: true, why: 'the block goes' },
    { against: { op: 'block.remove', slideId: 'content-rule', blockId: 'h' }, lead: false, block: false, why: 'another block goes' },
  ],
  'block.move': [
    {
      against: { op: 'block.move', slideId: 'content-rule', blockId: 'p1', slot: 'right' },
      lead: false,
      block: false,
      why: 'a move keeps the Text',
    },
  ],
  'block.set': [
    { against: { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/text', value: 'New' }, lead: false, block: true, why: 'the text written whole' },
    { against: { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '', value: {} }, lead: false, block: true, why: 'the block written whole' },
    { against: { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/measure', value: 40 }, lead: false, block: false, why: 'another field of the block' },
    { against: { op: 'block.set', slideId: 'content-rule', blockId: 'h', path: '/text', value: 'New' }, lead: false, block: false, why: 'another block' },
  ],
  'text.replace': [
    {
      against: { op: 'text.replace', slideId: 'content-rule', blockId: 'p1', path: '/text', range: [0, 3], text: 'New' },
      lead: false,
      block: true,
      why: 'the Text replaced',
    },
    {
      against: { op: 'text.replace', slideId: 'title', blockId: 'lead', path: '/lead', range: [0, 3], text: 'New' },
      lead: true,
      block: false,
      why: 'the lead replaced',
    },
  ],
  'text.splice': [
    { against: { ...onBlock, at: 0, insert: 'y' }, lead: false, block: false, why: 'typing is transformed, never a rewrite' },
  ],
  'text.mark': [
    {
      against: { op: 'text.mark', slideId: 'title', blockId: 'lead', path: '/lead', range: [0, 2], edit: { kind: 'marks', set: { b: true } } },
      lead: false,
      block: false,
      why: 'a mark is transformed, never a rewrite',
    },
  ],
  'section.set': [{ against: { op: 'section.set', sections: [] }, lead: false, block: false, why: 'the sections' }],
  'asset.set': [
    {
      against: { op: 'asset.set', asset: { id: 'a' } } as unknown as Mutation,
      lead: false,
      block: false,
      why: 'an asset',
    },
  ],
  'asset.remove': [{ against: { op: 'asset.remove', assetId: 'a' }, lead: false, block: false, why: 'an asset' }],
  'deck.set': [{ against: { op: 'deck.set', path: '/title', value: 'T' }, lead: false, block: false, why: 'the title of the deck' }],
  'version.restore': [{ against: { op: 'version.restore', n: 1 }, lead: true, block: true, why: 'a restore' }],
};

describe('the one rule of a whole Text rewrite', () => {
  for (const [op, rows] of Object.entries(TABLE)) {
    for (const row of rows) {
      it(`${op}, ${row.why}: the lead ${row.lead ? 'goes back' : 'stays'}, the block ${row.block ? 'goes back' : 'stays'}`, () => {
        expect(rewritesText(row.against, onLead)).toBe(row.lead);
        expect(rewritesText(row.against, onBlock)).toBe(row.block);
        // the admission's transform answers the same: a rewritten op returns to its author
        expect(transformEntry([onLead], landedOwn([row.against])) === null).toBe(row.lead);
        expect(transformEntry([onBlock], landedOwn([row.against])) === null).toBe(row.block);
        // and the browser's rebase of a pending op (HR-RC#2): the tab drops what the room would
        // refuse and keeps what the room admits
        expect(transformPast([onLead], [row.against], defaultTransform) === null).toBe(row.lead);
        expect(transformPast([onBlock], [row.against], defaultTransform) === null).toBe(row.block);
      });
    }
  }

  it('lists every mutation op', () => {
    expect(Object.keys(TABLE).sort()).toEqual([
      'asset.remove',
      'asset.set',
      'block.insert',
      'block.move',
      'block.remove',
      'block.set',
      'deck.set',
      'section.set',
      'slide.insert',
      'slide.move',
      'slide.remove',
      'slide.replace',
      'slide.set',
      'text.mark',
      'text.replace',
      'text.splice',
      'version.restore',
    ]);
  });

  it('refuses a mutation it has no rule for instead of keeping the typing silently', () => {
    expect(() => rewritesText({ op: 'deck.rename' } as unknown as Mutation, onBlock)).toThrow(
      /no rule for deck.rename/,
    );
  });
});
