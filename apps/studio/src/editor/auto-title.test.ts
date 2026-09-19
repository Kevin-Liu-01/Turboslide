import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';

import { autoTitleMutations, headingAfter, titleHeadingOf } from './auto-title';

// The auto-title (SPEC 6.3; docs/RETURN.md 2.18, `decks.name.follows-heading`): the deck's name
// follows the title slide's heading burst by burst until the deck is renamed by hand, so a slow
// typist's deck is not named after its first eight characters.

function deck(title: string, heading = 'General Translation'): DeckDocument {
  const document = workedDocument();
  const slide = document.slides['title'];
  if (slide?.kind !== 'title') throw new Error('fixture');
  return {
    deck: { ...document.deck, title },
    slides: { ...document.slides, title: { ...slide, heading } },
  };
}
const set = (value: string): Mutation => ({
  op: 'slide.set',
  slideId: 'title',
  path: '/heading',
  value,
});
const rename = (value: string): Mutation => ({ op: 'deck.set', path: '/title', value });

describe('autoTitleMutations', () => {
  it('names an Untitled presentation from the first heading burst', () => {
    expect(autoTitleMutations(deck(TITLE_ROW.untitled, ''), [set('Renewal ')])).toEqual([
      rename('Renewal'),
    ]);
  });

  it('follows the heading while the name is the heading it started from, and stops after a hand rename', () => {
    expect(
      autoTitleMutations(deck('Renewal', 'Renewal '), [set('Renewal review for Acme')]),
    ).toEqual([rename('Renewal review for Acme')]);
    expect(
      autoTitleMutations(deck('Acme pitch', 'Renewal '), [set('Renewal review for Acme')]),
    ).toEqual([]);
    /* the name this rule wrote in this session is followed even when the heading passed through
       another value (an emptied heading keeps the name; the next heading takes it again) */
    expect(
      autoTitleMutations(deck('Renewal', ''), [set('Pipeline review')], { lastAuto: 'Renewal' }),
    ).toEqual([rename('Pipeline review')]);
    expect(
      autoTitleMutations(deck('Acme pitch', ''), [set('Pipeline review')], { lastAuto: 'Renewal' }),
    ).toEqual([]);
  });

  it('keeps the name on an emptied heading, an unchanged name and a write that renames the deck itself', () => {
    expect(autoTitleMutations(deck('Renewal', 'Renewal'), [set('')])).toEqual([]);
    expect(autoTitleMutations(deck('Renewal', 'Renewal'), [set('*Renewal*')])).toEqual([]);
    expect(
      autoTitleMutations(deck('Renewal', 'Renewal'), [set('Renewal review'), rename('By hand')]),
    ).toEqual([]);
  });

  it('reads the heading as plain text, trimmed, and follows a heading block of a title slide converted to a canvas', () => {
    expect(autoTitleMutations(deck(TITLE_ROW.untitled, ''), [set('  *Q3* review  ')])).toEqual([
      rename('Q3 review'),
    ]);
    const converted: Slide = {
      schemaVersion: 1,
      id: 'title',
      kind: 'content',
      layout: { type: 'freeform' },
      grammar: { kind: 'title', boxes: {}, slots: { main: ['mark', 'heading', 'lead'] } },
      slots: {
        main: [
          { id: 'mark', type: 'mark', w: 132, h: 84, pos: { x: 0, y: 0, w: 132, h: 84 } },
          {
            id: 'heading',
            type: 'heading',
            level: 'h1',
            text: 'Renewal',
            pos: { x: 0, y: 100, w: 800, h: 100 },
          },
          {
            id: 'lead',
            type: 'paragraph',
            role: 'lead',
            text: '',
            pos: { x: 0, y: 220, w: 800, h: 60 },
          },
        ],
      },
    } as Slide;
    const document: DeckDocument = {
      ...deck('Renewal'),
      slides: { ...deck('Renewal').slides, title: converted },
    };
    expect(titleHeadingOf(converted)).toBe('Renewal');
    const typed: Mutation = {
      op: 'text.splice',
      slideId: 'title',
      blockId: 'heading',
      path: '/text',
      at: 7,
      remove: 0,
      insert: ' review',
    };
    expect(headingAfter(document, converted, [typed])).toBe('Renewal review');
    expect(autoTitleMutations(document, [typed])).toEqual([rename('Renewal review')]);
    /* a format write on the converted heading changes no name */
    expect(
      autoTitleMutations(document, [
        {
          op: 'block.set',
          slideId: 'title',
          blockId: 'heading',
          path: '/typography',
          value: { weight: 500 },
        },
      ]),
    ).toEqual([]);
  });

  it('follows the heading through the conversion write itself (a slide.replace in front of the format write)', () => {
    const document = deck('Renewal', 'Renewal');
    const before = document.slides['title'] as Slide;
    const replaced: Slide = {
      schemaVersion: 1,
      id: 'title',
      kind: 'content',
      layout: { type: 'freeform' },
      grammar: { kind: 'title', boxes: {} },
      slots: {
        main: [
          {
            id: 'heading',
            type: 'heading',
            level: 'h1',
            text: 'Renewal',
            pos: { x: 0, y: 100, w: 800, h: 100 },
          },
        ],
      },
    } as Slide;
    expect(titleHeadingOf(before)).toBe('Renewal');
    expect(
      autoTitleMutations(document, [
        { op: 'slide.replace', slideId: 'title', slide: replaced },
        {
          op: 'block.set',
          slideId: 'title',
          blockId: 'heading',
          path: '/typography',
          value: { weight: 500 },
        },
      ]),
    ).toEqual([]);
  });

  it('leaves the deck it reads untouched: a slide.remove or a slide.move in the write reorders nothing before the real apply (the slides undo rows, return/build/b4.md request 2)', () => {
    const document = deck(TITLE_ROW.untitled, 'Renewal');
    const section = document.deck.sections[0]!;
    const order = [...section.slideIds];
    const victim = order.find((id) => id !== 'title')!;
    expect(autoTitleMutations(document, [{ op: 'slide.remove', slideId: victim }])).toEqual([]);
    expect(section.slideIds).toEqual(order);
    expect(
      autoTitleMutations(document, [
        { op: 'slide.move', slideId: victim, sectionId: section.id, after: order[0]! },
      ]),
    ).toEqual([]);
    expect(section.slideIds).toEqual(order);
    /* the title slide itself removed: no rename, and the deck's order is still the caller's */
    expect(autoTitleMutations(document, [{ op: 'slide.remove', slideId: 'title' }])).toEqual([]);
    expect(section.slideIds).toEqual(order);
    expect(headingAfter(document, document.slides['title'] as Slide, [set('Acme')])).toBe('Acme');
    expect(section.slideIds).toEqual(order);
  });

  it('touches nothing on a content slide and answers null for its heading', () => {
    expect(titleHeadingOf(workedDocument().slides['content-rule'] as Slide)).toBeNull();
    expect(
      autoTitleMutations(deck(TITLE_ROW.untitled), [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/typography',
          value: { weight: 500 },
        },
      ]),
    ).toEqual([]);
  });
});
