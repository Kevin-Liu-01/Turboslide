// The Blank title slide's mark after the first write (Round 1 verification finding 4): the
// conversion keeps a `mark` block in the document, at the content origin and 1326 by 64, while the
// deck's kit draws no mark. The renderer writes no element for it (render/slide.ts
// undrawnObjectIds), so a click reaches nothing there; the walks the editor reads from the
// document leave it out too: Tab from nothing starts at the title, Select all takes the drawn
// objects, and a marquee over the top band selects nothing.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { renderSlide, undrawnObjectIds } from '@turboslide/render/slide';
import type { Block } from '@turboslide/schema/blocks';
import { toCanvas } from '@turboslide/schema/canvas';
import { deckSchema, slideSchema } from '@turboslide/schema/deck';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';
import { describe, expect, it } from 'vitest';

import { objectIds } from '../Freeform';
import { EMPTY_BOXES } from '../Gestures';
import { marqueeHits } from '../Marquee';
import { cycleSelection } from '../Selection';

const BLANK = join(resolve(import.meta.dirname, '../../../..'), 'decks', 'templates', 'blank');

function blankDeck(): { deck: Deck; title: Slide } {
  const deck: Deck = deckSchema.parse(JSON.parse(readFileSync(join(BLANK, 'deck.json'), 'utf8')));
  const title: Slide = slideSchema.parse(
    JSON.parse(readFileSync(join(BLANK, 'slides', 'title.json'), 'utf8')),
  );
  return { deck, title };
}

/** The title slide as the editor writes it on the first insert: converted, then a text box on top. */
function afterFirstWrite(title: Slide): ContentSlide {
  const converted = toCanvas(title, {
    blocks: { heading: [137, 395.28125, 1326, 90], lead: [137, 511.03125, 901.453125, 38] },
    prompted: ['heading', 'lead'],
  });
  if (converted === null) throw new Error('the blank title converts');
  const text = {
    id: 'text',
    type: 'text',
    text: 'Hello',
    pos: { x: 300, y: 640, w: 700, h: 120, z: 3 },
  } as Block;
  return {
    ...converted.slide,
    slots: { main: [...(converted.slide.slots.main ?? []), text] },
  };
}

/** The `data-block` ids of a rendered slide in document order, as `blockOrder` reads the DOM. */
function renderedOrder(html: string): string[] {
  const ids: string[] = [];
  for (const match of html.matchAll(/data-block="([^"]+)"/g))
    if (match[1] !== undefined && !ids.includes(match[1])) ids.push(match[1]);
  return ids;
}

describe('the Blank title mark after the first write is not an object', () => {
  const { deck, title } = blankDeck();
  const slide = afterFirstWrite(title);
  const html = renderSlide(deck, slide, {
    theme: 'light',
    chrome: true,
    assetBase: '',
    blockAttrs: true,
    live: true,
    prompts: true,
    gtWord: true,
  }).html;
  const undrawn = undrawnObjectIds(deck, slide);

  it('stores the mark block, renders nothing for it and names it undrawn', () => {
    expect((slide.slots.main ?? []).map((block) => block.id)).toEqual([
      'mark',
      'heading',
      'lead',
      'text',
    ]);
    expect(html).not.toContain('data-free="mark"');
    expect(renderedOrder(html)).toEqual(['heading', 'lead', 'text']);
    expect([...undrawn]).toEqual(['mark']);
  });

  it('walks Tab from nothing to the title and never to the mark', () => {
    const order = objectIds(slide, EMPTY_BOXES, renderedOrder(html), undrawn);
    expect(order).toEqual(['heading', 'lead', 'text']);
    expect(cycleSelection(order, null, 1)).toEqual({ kind: 'block', blockId: 'heading' });
    expect(cycleSelection(order, null, -1)).toEqual({ kind: 'block', blockId: 'text' });
    /* the document alone, as before the fix, walked the mark first */
    expect(objectIds(slide, EMPTY_BOXES, renderedOrder(html))[0]).toBe('mark');
  });

  it('takes no mark under a marquee over the top band', () => {
    const order = objectIds(slide, EMPTY_BOXES, renderedOrder(html), undrawn);
    const bounding: Record<string, [number, number, number, number]> = {};
    for (const block of slide.slots.main ?? [])
      if (block.pos !== undefined && order.includes(block.id))
        bounding[block.id] = [block.pos.x, block.pos.y, block.pos.w, block.pos.h];
    expect(marqueeHits([120, 100, 780, 130], bounding, order)).toEqual([]);
  });
});
