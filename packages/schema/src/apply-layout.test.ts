// Apply layout (gslides-parity SPEC 5.5, 14.2 apply-layout.test.ts): every source layout to every
// target layout of the 21 produces a valid slide; the mapping rows of the table (title, body,
// appended paragraphs, lists, tables, pictures, the credit, the kept fields); the drop count on
// Title slide and Main point; the same layout resets the overrides; freeform to Blank keeps the
// boxes, a grammar source to Blank gets boxes, freeform to a grammar layout refiles by geometry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyLayout, extractContent, untouchedPlaceholders } from './apply-layout.ts';
import type { Block } from './blocks.ts';
import type { ContentSlide, Deck, Slide } from './deck.ts';
import { LAYOUT_IDS, slideBlocks } from './deck.ts';
import { layoutEntry } from './layouts.ts';
import { validateDeck } from './validate.ts';

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const blankDeck = JSON.parse(
  readFileSync(join(DECKS, 'templates', 'blank', 'deck.json'), 'utf8'),
) as Deck;

/** Validates a slide alone in the blank deck; the severity 3 issues. */
function blocking(slide: Slide) {
  const result = validateDeck({
    deck: {
      ...blankDeck,
      sections: [{ id: 'deck', name: 'Deck', slideIds: [slide.id] }],
    },
    slides: { [slide.id]: slide },
  });
  return result.issues.filter((issue) => issue.severity === 3);
}

/** A filled version of a layout's slide: every empty Text gets a distinct phrase. */
function filled(layout: (typeof LAYOUT_IDS)[number], id = 'source'): Slide {
  const slide = layoutEntry(layout).make(id, blankDeck, 'deck');
  if (slide === null) throw new Error(`${layout} needs a picture`);
  let n = 0;
  const fill = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fill);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (['credit', 'id', 'type', 'asset', 'assets'].includes(key)) out[key] = item;
        else if (typeof item === 'string' && item === '') {
          n += 1;
          out[key] = `${key} ${n}`;
        } else if (Array.isArray(item) && item.every((c) => typeof c === 'string')) {
          out[key] = item.map((c: string) => {
            if (c !== '') return c;
            n += 1;
            return `cell ${n}`;
          });
        } else out[key] = fill(item);
      }
      return out;
    }
    return value;
  };
  return fill(slide) as Slide;
}

const CONTENT_RULE: ContentSlide = {
  schemaVersion: 1,
  id: 'content-rule',
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7' },
  notes: 'Say the rule before the list.',
  tags: ['brand'],
  skip: true,
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'The content rule' },
      { id: 'p1', type: 'paragraph', text: 'Every post states what was built.', measure: 56 },
      { id: 'p2', type: 'paragraph', text: 'And what it cost.', measure: 56 },
    ],
    right: [
      {
        id: 'list',
        type: 'plain',
        items: [{ text: 'A measured result' }, { text: 'How GT ships a locale' }],
      },
      {
        id: 'fig',
        type: 'shot',
        asset: 'mood-earth',
        fit: 'width',
        caption: 'The Blue Marble.',
      },
    ],
  },
};

describe('applyLayout', () => {
  it('produces a valid slide for every source layout to every target layout of the 21', () => {
    for (const source of LAYOUT_IDS) {
      const sourceSlide = filled(source);
      for (const target of LAYOUT_IDS) {
        const { slide } = applyLayout({
          slide: sourceSlide,
          layout: target,
          deck: blankDeck,
          sectionId: 'deck',
        });
        const issues = blocking(slide);
        expect(
          issues,
          `${source} to ${target}: ${issues.map((i) => i.message).join('; ')}`,
        ).toEqual([]);
        expect(slide.id).toBe('source');
        expect(slide.template).toBe(target);
        expect(slide.kind).toBe(layoutEntry(target).kind);
      }
    }
  });

  it('moves the title, the body and the list into Title and two columns and appends the rest', () => {
    const { slide, dropped } = applyLayout({
      slide: CONTENT_RULE,
      layout: 'cols',
      deck: blankDeck,
      sectionId: 'deck',
    });
    expect(dropped).toEqual([]);
    if (slide.kind !== 'content') throw new Error('kind');
    expect(slide.layout).toMatchObject({ type: 'cols', ratio: '1/1' });
    expect(slide.slots.left?.[0]).toMatchObject({ type: 'heading', text: 'The content rule' });
    expect(slide.slots.left?.[1]).toMatchObject({
      type: 'paragraph',
      text: 'Every post states what was built.',
    });
    expect(slide.slots.right?.[0]).toMatchObject({ type: 'paragraph', text: 'And what it cost.' });
    // no list or figure placeholder: appended to the body slot in order
    expect(slide.slots.right?.slice(1).map((block) => block.type)).toEqual(['plain', 'shot']);
    expect(slide.slots.right?.[2]).toMatchObject({
      asset: 'mood-earth',
      caption: 'The Blue Marble.',
    });
    // the kept fields
    expect(slide.notes).toBe('Say the rule before the list.');
    expect(slide.tags).toEqual(['brand']);
    expect(slide.skip).toBe(true);
    expect(slide.template).toBe('cols');
  });

  it('takes the list placeholder of Ruled statement list and the figure placeholder of Figure', () => {
    const plain = applyLayout({
      slide: CONTENT_RULE,
      layout: 'plain',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    if (plain.kind !== 'content') throw new Error('kind');
    expect(plain.slots.right?.[0]).toMatchObject({
      id: 'list',
      type: 'plain',
      items: [{ text: 'A measured result' }, { text: 'How GT ships a locale' }],
    });
    const figure = applyLayout({
      slide: CONTENT_RULE,
      layout: 'figure',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    if (figure.kind !== 'content') throw new Error('kind');
    expect(figure.slots.right?.[0]).toMatchObject({
      id: 'fig',
      type: 'shot',
      asset: 'mood-earth',
      caption: 'The Blue Marble.',
    });
    // the list had no placeholder: appended to the body slot, the left column that holds the paragraph
    // the second paragraph and then the list follow the body paragraph
    expect(figure.slots.left?.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'plain',
    ]);
    expect(figure.slots.right?.map((block) => block.type)).toEqual(['shot']);
    const table = applyLayout({
      slide: filled('table'),
      layout: 'rows',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    if (table.kind !== 'content') throw new Error('kind');
    // no table placeholder on Ruled rows: the table is appended to the body slot, the left column
    expect(table.slots.right?.map((block) => block.type)).toEqual(['rows']);
    expect(table.slots.left?.map((block) => block.type)).toEqual(['heading', 'paragraph', 'table']);
  });

  it('drops what does not fit on Title slide and Main point and names the blocks', () => {
    const title = applyLayout({
      slide: CONTENT_RULE,
      layout: 'title',
      deck: blankDeck,
      sectionId: 'deck',
    });
    expect(title.slide).toMatchObject({
      kind: 'title',
      heading: 'The content rule',
      lead: 'Every post states what was built.',
      notes: 'Say the rule before the list.',
    });
    expect(title.dropped.sort()).toEqual(['fig', 'list', 'p2']);
    const statement = applyLayout({
      slide: CONTENT_RULE,
      layout: 'statement',
      deck: blankDeck,
      sectionId: 'deck',
    });
    expect(statement.slide).toMatchObject({ kind: 'statement', big: 'The content rule' });
    expect(statement.dropped.sort()).toEqual(['fig', 'list', 'p1', 'p2']);
    // the other way: a title slide's heading and lead land in the head of Title and body
    const back = applyLayout({
      slide: title.slide,
      layout: 'split',
      deck: blankDeck,
      sectionId: 'deck',
    });
    expect(back.dropped).toEqual([]);
    if (back.slide.kind !== 'content') throw new Error('kind');
    expect(back.slide.slots.headLeft?.[0]).toMatchObject({ text: 'The content rule' });
    expect(back.slide.slots.headRight?.[0]).toMatchObject({
      text: 'Every post states what was built.',
    });
  });

  it('takes the first picture as the background of a picture layout and keeps the credit', () => {
    const { slide, dropped } = applyLayout({
      slide: CONTENT_RULE,
      layout: 'mood',
      deck: blankDeck,
      sectionId: 'deck',
    });
    expect(dropped).toEqual([]);
    if (slide.kind !== 'mood') throw new Error('kind');
    expect(slide.picture.asset).toBe('mood-earth');
    const types = slide.plate.blocks.map((block) => block.type);
    expect(types[0]).toBe('heading');
    expect(types[1]).toBe('paragraph');
    expect(types[types.length - 1]).toBe('credit');
    expect(slide.plate.blocks[0]).toMatchObject({ text: 'The content rule' });
    expect(slide.plate.blocks[1]).toMatchObject({ text: 'Every post states what was built.' });
    // the list became a paragraph of two lines on the plate, the second paragraph was appended
    const texts = slide.plate.blocks
      .filter((block) => block.type === 'paragraph')
      .map((block) => (block as Extract<Block, { type: 'paragraph' }>).text);
    expect(texts).toContain('And what it cost.');
    expect(texts).toContain('A measured result\nHow GT ships a locale');
    const credit = slide.plate.blocks[slide.plate.blocks.length - 1];
    expect(credit).toMatchObject({
      type: 'credit',
      text: 'Image: NASA, Reto Stöckli, 2007, public domain',
    });
    // an opener target writes the section it sits in
    const opener = applyLayout({
      slide: CONTENT_RULE,
      layout: 'opener',
      deck: blankDeck,
      sectionId: 'brand',
    }).slide;
    expect(opener).toMatchObject({ kind: 'opener', sectionId: 'brand' });
    // a picture slide back to content: the picture becomes a figure in the body slot, the credit is dropped
    const content = applyLayout({
      slide,
      layout: 'split',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    expect(slideBlocks(content).some(({ block }) => block.type === 'credit')).toBe(false);
    expect(
      slideBlocks(content).some(
        ({ block }) => block.type === 'shot' && block.asset === 'mood-earth',
      ),
    ).toBe(true);
  });

  it('resets the placeholders when the same layout is applied and keeps the copy', () => {
    const styled: ContentSlide = {
      ...CONTENT_RULE,
      slots: {
        left: [
          {
            id: 'h',
            type: 'heading',
            level: 'h2',
            text: 'The content rule',
            typography: { size: 34, weight: 700 },
          },
          { id: 'p1', type: 'paragraph', text: 'Body.', measure: 32, tone: 'muted' },
        ],
        right: [{ id: 'list', type: 'plain', size: 20, items: [{ text: 'One' }] }],
      },
    };
    const { slide } = applyLayout({
      slide: { ...styled, template: 'plain' },
      layout: 'plain',
      deck: blankDeck,
      sectionId: 'deck',
    });
    if (slide.kind !== 'content') throw new Error('kind');
    // the fresh placeholders carry Shrink text on overflow (gslides-parity SPEC-2 0.41)
    expect(slide.slots.left?.[0]).toEqual({
      id: 'h',
      type: 'heading',
      level: 'h2',
      text: 'The content rule',
      autofit: 'shrink',
    });
    expect(slide.slots.left?.[1]).toEqual({
      id: 'p1',
      type: 'paragraph',
      text: 'Body.',
      measure: 56,
      autofit: 'shrink',
    });
    // the list moved into the placeholder as it is (its size is its own setting, not an override)
    expect(slide.slots.right?.[0]).toMatchObject({
      id: 'list',
      type: 'plain',
      items: [{ text: 'One' }],
    });
  });

  it('keeps the boxes of a freeform slide on Blank, gives a grammar source boxes, and refiles a freeform source by geometry', () => {
    const freeform: ContentSlide = {
      schemaVersion: 1,
      id: 'free',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: {
        main: [
          {
            id: 'h',
            type: 'heading',
            level: 'h2',
            text: 'Free',
            pos: { x: 137, y: 129, w: 600, h: 56, z: 0 },
          },
          {
            id: 'p1',
            type: 'paragraph',
            text: 'Left column text.',
            pos: { x: 137, y: 300, w: 500, h: 100, z: 1 },
          },
          {
            id: 'p2',
            type: 'paragraph',
            text: 'Right column text.',
            pos: { x: 900, y: 300, w: 500, h: 100, z: 2 },
          },
        ],
      },
    };
    const kept = applyLayout({
      slide: freeform,
      layout: 'blank',
      deck: blankDeck,
      sectionId: 'deck',
    });
    if (kept.slide.kind !== 'content') throw new Error('kind');
    expect(kept.slide.slots.main?.map((block) => block.pos)).toEqual(
      freeform.slots.main?.map((block) => block.pos),
    );
    expect(kept.slide.template).toBe('blank');
    const boxed = applyLayout({
      slide: CONTENT_RULE,
      layout: 'blank',
      deck: blankDeck,
      sectionId: 'deck',
    });
    if (boxed.slide.kind !== 'content') throw new Error('kind');
    expect(boxed.slide.layout.type).toBe('freeform');
    expect(boxed.slide.slots.main?.every((block) => block.pos !== undefined)).toBe(true);
    expect(boxed.slide.slots.main?.map((block) => block.id).sort()).toEqual(
      ['fig', 'h', 'list', 'p1', 'p2'].sort(),
    );
    expect(blocking(boxed.slide)).toEqual([]);
    // a title slide to Blank becomes a stack of boxes
    const titleToBlank = applyLayout({
      slide: filled('title'),
      layout: 'blank',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    if (titleToBlank.kind !== 'content') throw new Error('kind');
    expect(titleToBlank.slots.main?.map((block) => block.type)).toEqual(['heading', 'paragraph']);
    // freeform to two columns: the right column text lands in the right column by its box
    const refiled = applyLayout({
      slide: freeform,
      layout: 'cols',
      deck: blankDeck,
      sectionId: 'deck',
    }).slide;
    if (refiled.kind !== 'content') throw new Error('kind');
    expect(refiled.slots.left?.[0]).toMatchObject({ type: 'heading', text: 'Free' });
    expect(refiled.slots.left?.[1]).toMatchObject({ text: 'Left column text.' });
    expect(refiled.slots.right?.[0]).toMatchObject({ text: 'Right column text.' });
    expect(slideBlocks(refiled).every(({ block }) => block.pos === undefined)).toBe(true);
  });

  it('refuses a picture layout on a deck without a starter picture with a plain error', () => {
    expect(() =>
      applyLayout({
        slide: CONTENT_RULE,
        layout: 'opener',
        deck: { ...blankDeck, assets: {} },
        sectionId: 'deck',
      }),
    ).toThrow(/add a picture first/);
  });

  it('extracts the roles of the table in reading order', () => {
    const extracted = extractContent(CONTENT_RULE);
    expect(extracted.title).toBe('The content rule');
    expect(extracted.body.map((row) => row.text)).toEqual([
      'Every post states what was built.',
      'And what it cost.',
    ]);
    expect(extracted.lists.map((block) => block.id)).toEqual(['list']);
    expect(extracted.pictures).toEqual([
      { asset: 'mood-earth', caption: 'The Blue Marble.', from: 'fig' },
    ]);
    expect(extracted.rest).toEqual([]);
    const title = extractContent(filled('title'));
    expect(title.title).toBe('heading 1');
    expect(title.body).toEqual([{ text: 'lead 2', from: 'lead' }]);
  });
});

describe('untouched placeholders leave with the layout (docs/FOCUS.md section 5 ranks 8 and 31)', () => {
  /** A slide as New slide with a layout makes it: the fresh placeholders, nothing typed. */
  function fresh(layout: (typeof LAYOUT_IDS)[number], id = 'fresh'): Slide {
    const slide = layoutEntry(layout).make(id, blankDeck, 'deck');
    if (slide === null) throw new Error(`${layout} needs a picture`);
    return { ...slide, template: layout };
  }

  function apply(slide: Slide, layout: (typeof LAYOUT_IDS)[number]) {
    return applyLayout({ slide, layout, deck: blankDeck, sectionId: 'deck' });
  }

  it('Section header then Title and body on a fresh slide leaves the second layout alone: no starter figure (audit-slides rows 59 to 61)', () => {
    const opener = apply(fresh('split'), 'opener').slide;
    expect(opener.kind).toBe('opener');
    const back = apply(opener, 'split');
    expect(back.dropped).toEqual([]);
    const blocks = slideBlocks(back.slide).map(({ block }) => block);
    const made = fresh('split');
    expect(blocks.length).toBe(slideBlocks(made).length);
    expect(blocks.map((block) => block.type)).toEqual(
      slideBlocks(made).map(({ block }) => block.type),
    );
    expect(blocks.some((block) => block.type === 'shot')).toBe(false);
  });

  it('Ruled statement list then Title and table on a fresh slide carries no empty list rows (audit-slides rows 62 to 64)', () => {
    const plain = apply(fresh('split'), 'plain').slide;
    const table = apply(plain, 'table').slide;
    const types = slideBlocks(table).map(({ block }) => block.type);
    expect(types).toEqual(slideBlocks(fresh('table')).map(({ block }) => block.type));
    expect(types).not.toContain('plain');
  });

  it('Title slide on an untouched Title and body counts nothing as dropped (audit-slides rows 68 to 70)', () => {
    const title = apply(fresh('split'), 'title');
    expect(title.dropped).toEqual([]);
    expect(title.slide).toMatchObject({ kind: 'title', heading: '', lead: '' });
    const statement = apply(fresh('split'), 'statement');
    expect(statement.dropped).toEqual([]);
  });

  it('a typed title survives Main point and Title and body, and the untouched paragraphs are not counted (audit-slides rows 65 to 67)', () => {
    const source = fresh('split');
    if (source.kind !== 'content') throw new Error('kind');
    const heading = slideBlocks(source).find(({ block }) => block.type === 'heading')?.block;
    if (heading === undefined || heading.type !== 'heading') throw new Error('heading');
    heading.text = 'Agenda for today';
    const statement = apply(source, 'statement');
    expect(statement.slide).toMatchObject({ kind: 'statement', big: 'Agenda for today' });
    expect(statement.dropped).toEqual([]);
    const back = apply(statement.slide, 'split');
    expect(back.dropped).toEqual([]);
    const texts = slideBlocks(back.slide).map(({ block }) =>
      'text' in block && typeof block.text === 'string' ? block.text : '',
    );
    expect(texts[0]).toBe('Agenda for today');
    expect(texts.slice(1).every((text) => text === '')).toBe(true);
    expect(slideBlocks(back.slide).length).toBe(slideBlocks(fresh('split')).length);
  });

  it('a slide someone typed on keeps its starter picture as a figure, since the deck cannot tell it from a figure that person brought', () => {
    const opener = apply(fresh('split'), 'opener').slide;
    if (opener.kind !== 'opener') throw new Error('kind');
    const heading = opener.plate.blocks.find((block) => block.type === 'heading');
    if (heading === undefined || heading.type !== 'heading') throw new Error('heading');
    heading.text = 'Pipeline';
    const back = apply(opener, 'split').slide;
    expect(slideBlocks(back).some(({ block }) => block.type === 'shot')).toBe(true);
    expect(slideBlocks(back)[0]?.block).toMatchObject({ type: 'heading', text: 'Pipeline' });
  });

  it('reads the untouched set from the slide shape when template is absent, and a moved placeholder is still untouched', () => {
    const made = layoutEntry('split').make('shape', blankDeck, 'deck');
    if (made === null || made.kind !== 'content') throw new Error('kind');
    const first = slideBlocks(made)[0]?.block;
    if (first === undefined) throw new Error('block');
    first.pos = { x: 40, y: 40, w: 600, h: 120 };
    const untouched = untouchedPlaceholders(made, blankDeck, 'deck');
    expect(untouched.blocks.has(first.id)).toBe(true);
    expect(untouched.blocks.size).toBe(slideBlocks(made).length);
    expect(untouched.picture).toBe(false);
  });

  it('a typed placeholder is content and an empty text placeholder is never a title', () => {
    const extracted = extractContent({
      ...CONTENT_RULE,
      slots: {
        left: [
          { id: 'h', type: 'heading', level: 'h2', text: '' },
          { id: 'p1', type: 'paragraph', text: 'Typed', measure: 56 },
        ],
      },
    });
    expect(extracted.title).toBeUndefined();
    expect(extracted.body).toEqual([{ text: 'Typed', from: 'p1' }]);
    const statement = apply(
      {
        ...CONTENT_RULE,
        slots: {
          left: [
            { id: 'h', type: 'heading', level: 'h2', text: '' },
            { id: 'p1', type: 'paragraph', text: 'Typed', measure: 56 },
          ],
        },
      },
      'statement',
    );
    expect(statement.slide).toMatchObject({ big: 'Typed' });
    expect(statement.dropped).toEqual([]);
  });
});
