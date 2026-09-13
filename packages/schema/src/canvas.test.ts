// The canvas conversion (gslides-parity SPEC-2 1.2, 11.5 canvas.test.ts): toCanvas on one slide
// of every kind of the GT deck and the templates over recorded boxes (the block list, the ids, the
// z order, autofit, the picture object at 0, 0, 1600, 900, the plate group and its padding, the
// statement's centred typography, template, grammar with kind and fields); the ids a kind's
// conversion creates free on every stored slide of that kind; the fresh Title slide converting at
// the prompts' boxes with no height under one line box; a converted slide validating with no
// issue; fromCanvas restoring every kind byte for byte while nothing moved and refusing after a
// move; applyLayout re-flowing a converted slide into every layout; the guides arithmetic.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyLayout } from './apply-layout.ts';
import type { Block } from './blocks.ts';
import {
  CANVAS_GROUP,
  CONVERSION_IDS,
  PICTURE_POS,
  PLATE_PADDING,
  applyGuides,
  canvasUnmoved,
  fromCanvas,
  minLineBox,
  normalizeGuideList,
  toCanvas,
} from './canvas.ts';
import type { CanvasBoxes } from './canvas.ts';
import type { ContentSlide, Slide } from './deck.ts';
import { LAYOUT_IDS, isCanvasSlide } from './deck.ts';
import {
  CONTENT_RULE,
  MOOD_EARTH_SLIDE,
  OPENER_BRAND,
  THESIS,
  TITLE,
  WORKED_DECK,
  workedDocument,
} from './fixtures.ts';
import { layoutEntry } from './layouts.ts';
import { applyWrite } from './reduce.ts';
import type { Write } from './mutations.ts';
import { validateDeck, validateSlide } from './validate.ts';

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function slidesOf(dir: string): Slide[] {
  return readdirSync(join(dir, 'slides'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson<Slide>(join(dir, 'slides', file)));
}

/** Boxes as the measurer would record them for the worked slides: one per block, the picture, the plate, the mark. */
function boxesFor(slide: Slide): CanvasBoxes {
  const boxes: CanvasBoxes = { blocks: {}, prompted: [] };
  if (slide.kind === 'content') {
    let y = 129;
    for (const list of Object.values(slide.slots)) {
      for (const block of list) {
        boxes.blocks[block.id] = [137, y, 627, 72];
        y += 96;
      }
    }
    return boxes;
  }
  if (slide.kind === 'title') {
    boxes.mark = [137, 289, slide.mark.w, slide.mark.h];
    boxes.blocks['heading'] = [137, 421, 901, 90];
    boxes.blocks['lead'] = [137, 537, 901, 76];
    return boxes;
  }
  if (slide.kind === 'statement') {
    boxes.blocks['big'] = [556, 413, 491, 77];
    return boxes;
  }
  boxes.picture = [-57, -57, 1600, 900];
  boxes.plate = slide.plate.side === 'lower-right' ? [1070, 604, 394, 168] : [137, 573, 539, 199];
  if (slide.kind === 'closing') boxes.mark = [163, 152, 138, 88];
  let y = (boxes.plate[1] ?? 0) + PLATE_PADDING.top;
  for (const block of slide.plate.blocks) {
    boxes.blocks[block.id] = [(boxes.plate[0] ?? 0) + PLATE_PADDING.left, y, 486, 48];
    y += 60;
  }
  return boxes;
}

function main(slide: Slide): Block[] {
  return slide.kind === 'content' ? (slide.slots.main ?? []) : [];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('toCanvas', () => {
  it('converts a grammar content slide as toFreeform did: every block of every slot in slot order with its box and z', () => {
    const result = toCanvas(CONTENT_RULE, boxesFor(CONTENT_RULE));
    expect(result).not.toBeNull();
    const { slide, record, unplaced } = result!;
    expect(unplaced).toEqual([]);
    expect(slide.kind).toBe('content');
    expect(slide.layout).toEqual({ type: 'freeform' });
    expect(slide.template).toBe('plain');
    expect(main(slide).map((block) => [block.id, block.pos?.z])).toEqual([
      ['h', 0],
      ['p1', 1],
      ['list', 2],
    ]);
    expect(main(slide)[0]?.pos).toEqual({ x: 137, y: 129, w: 627, h: 72, z: 0 });
    expect(record.kind).toBe('content');
    expect(record.layout).toEqual(CONTENT_RULE.kind === 'content' ? CONTENT_RULE.layout : null);
    expect(record.slots).toEqual({ left: ['h', 'p1'], right: ['list'] });
    expect(slide.grammar).toBe(record);
    // autofit stays what the block carried: the fixture's blocks carry none
    expect(main(slide).every((block) => !('autofit' in block))).toBe(true);
    // a block without a box is stacked from the content origin and named
    const partial = toCanvas(CONTENT_RULE, { blocks: { h: [137, 129, 600, 56] }, prompted: [] })!;
    expect(partial.unplaced).toEqual(['p1', 'list']);
    expect(main(partial.slide)[1]?.pos).toMatchObject({ x: 137, y: 129, w: 1326, h: 64 });
  });

  it('converts a title: the mark, an h1 heading and a lead paragraph at the measured boxes with autofit shrink', () => {
    const { slide, record } = toCanvas(TITLE, boxesFor(TITLE))!;
    expect(slide.template).toBe('title');
    expect(main(slide)).toEqual([
      { id: 'mark', type: 'mark', w: 132, h: 84, pos: { x: 137, y: 289, w: 132, h: 84, z: 0 } },
      {
        id: 'heading',
        type: 'heading',
        level: 'h1',
        text: TITLE.kind === 'title' ? TITLE.heading : '',
        autofit: 'shrink',
        pos: { x: 137, y: 421, w: 901, h: 90, z: 1 },
      },
      {
        id: 'lead',
        type: 'paragraph',
        role: 'lead',
        tone: 'muted',
        measure: 56,
        text: TITLE.kind === 'title' ? TITLE.lead : '',
        autofit: 'shrink',
        pos: { x: 137, y: 537, w: 901, h: 76, z: 2 },
      },
    ]);
    expect(record).toMatchObject({
      kind: 'title',
      slots: { main: ['mark', 'heading', 'lead'] },
      fields: { mark: { w: 132, h: 84 }, autofit: ['heading', 'lead'] },
    });
  });

  it('converts a statement: the big line as a centred big heading, the measure recorded', () => {
    const { slide, record } = toCanvas(THESIS, boxesFor(THESIS))!;
    expect(main(slide)).toEqual([
      {
        id: 'big',
        type: 'heading',
        level: 'big',
        text: 'Every product in every language',
        typography: { align: 'center' },
        autofit: 'shrink',
        pos: { x: 556, y: 413, w: 491, h: 77, z: 0 },
      },
    ]);
    expect(record.fields?.measure).toBe(THESIS.kind === 'statement' ? THESIS.measure : undefined);
    expect(slide.template).toBe('statement');
  });

  it('converts a picture kind: the picture object at the bottom, the plate box with its padding, the plate blocks in the plate group', () => {
    for (const source of [OPENER_BRAND, MOOD_EARTH_SLIDE]) {
      if (source.kind !== 'opener' && source.kind !== 'mood') throw new Error('fixture');
      const { slide, record } = toCanvas(source, boxesFor(source))!;
      const blocks = main(slide);
      expect(blocks[0]).toEqual({
        id: 'picture',
        type: 'picture',
        asset: source.picture.asset,
        ...(source.picture.position !== undefined ? { position: source.picture.position } : {}),
        side: source.plate.side,
        pos: PICTURE_POS,
      });
      expect(blocks[1]).toMatchObject({
        id: 'plate',
        type: 'box',
        fill: 'paper',
        strokeWidth: 0,
        padding: { top: 22, right: 26, bottom: 20, left: 26 },
      });
      expect(blocks[1]?.pos?.group).toBe(CANVAS_GROUP);
      expect(blocks[1]?.pos?.z).toBe(1);
      expect(blocks.slice(2).map((block) => block.id)).toEqual(
        source.plate.blocks.map((b) => b.id),
      );
      for (const block of blocks.slice(2)) {
        expect(block.pos?.group).toBe('plate');
        if (block.type === 'heading' || block.type === 'paragraph')
          expect(block.autofit).toBe('shrink');
        if (block.type === 'credit') expect('autofit' in block).toBe(false);
      }
      expect(blocks.map((block) => block.pos?.z)).toEqual(blocks.map((_block, i) => i));
      expect(record).toMatchObject({
        kind: source.kind,
        slots: { plate: source.plate.blocks.map((b) => b.id) },
        fields: {
          picture: source.picture,
          plate: { side: source.plate.side, maxWidth: source.plate.maxWidth },
        },
      });
      if (source.kind === 'opener') expect(record.fields?.sectionId).toBe(source.sectionId);
      expect(slide.template).toBe(source.kind);
    }
  });

  it('converts the closing with its mark inside the plate group before the heading', () => {
    const closing = slidesOf(join(DECKS, 'gt-brand')).find((slide) => slide.kind === 'closing')!;
    const { slide } = toCanvas(closing, boxesFor(closing))!;
    expect(main(slide).map((block) => block.id)).toEqual([
      'picture',
      'plate',
      'mark',
      'h',
      'p1',
      'credit',
    ]);
    expect(main(slide)[2]).toMatchObject({
      type: 'mark',
      w: 138,
      h: 88,
      pos: { x: 163, y: 152, w: 138, h: 88, z: 2, group: 'plate' },
    });
  });

  it('answers null for a canvas slide and keeps the slide fields it does not rewrite', () => {
    const converted = toCanvas(TITLE, boxesFor(TITLE))!.slide;
    expect(toCanvas(converted, boxesFor(converted))).toBeNull();
    const withFields: Slide = {
      ...clone(TITLE),
      notes: 'n',
      tags: ['t'],
      skip: true,
      background: { color: 'plate' },
    };
    const { slide } = toCanvas(withFields, boxesFor(withFields))!;
    expect(slide).toMatchObject({
      notes: 'n',
      tags: ['t'],
      skip: true,
      background: { color: 'plate' },
    });
    expect('ext' in slide).toBe(false);
  });

  it('keeps the ids a conversion creates free on every stored slide of that kind (GT deck and templates)', () => {
    const dirs = [
      join(DECKS, 'gt-brand'),
      join(DECKS, 'templates', 'gt-brand'),
      join(DECKS, 'templates', 'blank'),
    ];
    for (const dir of dirs) {
      for (const slide of slidesOf(dir)) {
        if (slide.kind === 'content') continue;
        const created = CONVERSION_IDS[slide.kind];
        const existing = 'plate' in slide ? slide.plate.blocks.map((block) => block.id) : [];
        for (const id of created) expect(existing, `${dir} ${slide.id}`).not.toContain(id);
      }
    }
  });

  it('converts the fresh Title slide of layouts.ts make at the prompts’ boxes with no height under one line box (0.97)', () => {
    const fresh = layoutEntry('title').make('title-1', WORKED_DECK, 'brand')!;
    const boxes: CanvasBoxes = {
      blocks: { heading: [137, 421, 901, 0], lead: [137, 537, 901, 0] },
      mark: [137, 289, 132, 84],
      prompted: ['heading', 'lead'],
    };
    const { slide } = toCanvas(fresh, boxes)!;
    const heading = main(slide)[1]!;
    const lead = main(slide)[2]!;
    expect(heading.pos?.h).toBe(minLineBox(heading));
    expect(lead.pos?.h).toBe(minLineBox(lead));
    expect(heading.pos?.h).toBe(90);
    expect(lead.pos?.h).toBe(38);
    expect(validateSlide(slide).issues.filter((issue) => issue.severity >= 2)).toEqual([]);
  });

  it('produces a slide that validates with no issue: the record is a schema field, not an ext key (0.99)', () => {
    for (const source of [TITLE, THESIS, OPENER_BRAND, MOOD_EARTH_SLIDE, CONTENT_RULE]) {
      const { slide } = toCanvas(source, boxesFor(source))!;
      const document = workedDocument();
      const result = validateDeck({
        deck: document.deck,
        slides: { ...document.slides, [slide.id]: slide },
      });
      expect(
        result.issues.filter((issue) => issue.file === `slides/${slide.id}.json`),
        source.id,
      ).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it('is one slide.replace that converts and moves in one revision, and the inverse restores the grammar slide', () => {
    const document = workedDocument();
    const { slide } = toCanvas(TITLE, boxesFor(TITLE))!;
    const write: Write = {
      baseRevision: document.deck.revision,
      author: { kind: 'human', name: 'kevin' },
      mutations: [
        { op: 'slide.replace', slideId: 'title', slide },
        {
          op: 'block.set',
          slideId: 'title',
          blockId: 'heading',
          path: '/pos',
          value: { x: 177, y: 445, w: 901, h: 90, z: 1 },
        },
      ],
    };
    const result = applyWrite(document, write);
    if (!result.ok) throw new Error(result.message);
    expect(result.document.deck.revision).toBe(document.deck.revision + 1);
    const after = result.document.slides['title']!;
    expect(isCanvasSlide(after)).toBe(true);
    expect(main(after)[1]?.pos).toEqual({ x: 177, y: 445, w: 901, h: 90, z: 1 });
    const undone = applyWrite(result.document, {
      baseRevision: result.document.deck.revision,
      author: { kind: 'human', name: 'kevin' },
      mutations: result.inverse,
    });
    if (!undone.ok) throw new Error(undone.message);
    expect(undone.document.slides['title']).toEqual(document.slides['title']);
  });
});

describe('fromCanvas', () => {
  const kinds: Slide[] = [TITLE, THESIS, OPENER_BRAND, MOOD_EARTH_SLIDE, CONTENT_RULE];

  it('restores every kind byte for byte while nothing moved', () => {
    for (const source of kinds) {
      const { slide } = toCanvas(source, boxesFor(source))!;
      const back = fromCanvas(clone(slide));
      expect(back?.lossless, source.id).toBe(true);
      expect(back?.slide, source.id).toEqual(source);
    }
    const closing = slidesOf(join(DECKS, 'gt-brand')).find((slide) => slide.kind === 'closing')!;
    const back = fromCanvas(toCanvas(closing, boxesFor(closing))!.slide);
    expect(back?.lossless).toBe(true);
    expect(back?.slide).toEqual(closing);
  });

  it('keeps a written template and a slide that carried one restores it', () => {
    const templated: Slide = { ...clone(TITLE), template: 'title' };
    const { slide } = toCanvas(templated, boxesFor(templated))!;
    expect(slide.grammar?.fields?.template).toBe('title');
    expect(fromCanvas(slide)?.slide).toEqual(templated);
  });

  it('refuses after a move, a rotation or an added object and names the layout to re-flow into', () => {
    const { slide } = toCanvas(TITLE, boxesFor(TITLE))!;
    const moved = clone(slide) as ContentSlide;
    moved.slots.main![1]!.pos = { ...moved.slots.main![1]!.pos!, x: 200 };
    expect(canvasUnmoved(moved, moved.grammar!)).toBe(false);
    const back = fromCanvas(moved);
    expect(back?.lossless).toBe(false);
    if (back?.lossless !== false) throw new Error('lossless');
    expect(back.layout).toBe('title');
    expect(back.slide.kind).toBe('content');
    const rotated = clone(slide) as ContentSlide;
    rotated.slots.main![0]!.pos = { ...rotated.slots.main![0]!.pos!, rotate: 15 };
    expect(fromCanvas(rotated)?.lossless).toBe(false);
    const added = clone(slide) as ContentSlide;
    added.slots.main!.push({
      id: 'extra',
      type: 'text',
      text: 'x',
      pos: { x: 1, y: 1, w: 10, h: 10, z: 3 },
    });
    expect(fromCanvas(added)?.lossless).toBe(false);
    // within a pixel is unmoved
    const nudged = clone(slide) as ContentSlide;
    nudged.slots.main![1]!.pos = { ...nudged.slots.main![1]!.pos!, x: 138 };
    expect(fromCanvas(nudged)?.lossless).toBe(true);
  });

  it('reads the editor depth round’s ext.grammar once and answers null for a slide with no record', () => {
    const legacy: ContentSlide = {
      schemaVersion: 1,
      id: 'legacy',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: {
        main: [
          {
            id: 'h',
            type: 'heading',
            level: 'h2',
            text: 'Legacy',
            pos: { x: 137, y: 129, w: 600, h: 56, z: 0 },
          },
        ],
      },
      ext: {
        grammar: {
          layout: { type: 'stack', gap: 22 },
          slots: { main: ['h'] },
          boxes: { h: { x: 137, y: 129, w: 600, h: 56, z: 0 } },
        },
      },
    };
    const back = fromCanvas(legacy);
    expect(back?.lossless).toBe(true);
    expect(back?.slide).toEqual({
      schemaVersion: 1,
      id: 'legacy',
      kind: 'content',
      layout: { type: 'stack', gap: 22 },
      slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'Legacy' }] },
    });
    const { ext: _ext, ...bare } = legacy;
    expect(fromCanvas(bare)).toBeNull();
    expect(fromCanvas(TITLE)).toBeNull();
  });
});

describe('applyLayout over a canvas slide', () => {
  it('re-flows a converted slide of every kind into every layout without a throw, the picture object as the picture and the plate box dropped', () => {
    for (const source of [TITLE, THESIS, OPENER_BRAND, MOOD_EARTH_SLIDE, CONTENT_RULE]) {
      const { slide } = toCanvas(source, boxesFor(source))!;
      for (const layout of LAYOUT_IDS) {
        const result = applyLayout({ slide, layout, deck: WORKED_DECK, sectionId: 'brand' });
        const validation = validateSlide(result.slide);
        expect(
          validation.issues.filter((issue) => issue.severity === 3),
          `${source.id} to ${layout}`,
        ).toEqual([]);
        // the plate box never travels into a grammar layout (Blank keeps every object as it is)
        if (result.slide.kind === 'content' && layout !== 'blank') {
          for (const list of Object.values(result.slide.slots))
            for (const block of list)
              expect(
                block.id === 'plate' && block.type === 'box',
                `${source.id} to ${layout}`,
              ).toBe(false);
        }
      }
      // a picture kind's photograph becomes the picture of a picture layout
      if (source.kind === 'opener' || source.kind === 'mood') {
        const reflowed = applyLayout({
          slide,
          layout: 'mood',
          deck: WORKED_DECK,
          sectionId: 'brand',
        }).slide;
        expect(reflowed.kind).toBe('mood');
        if (reflowed.kind === 'mood') expect(reflowed.picture.asset).toBe(source.picture.asset);
      }
    }
  });
});

describe('deck.guides arithmetic', () => {
  it('adds, removes, moves, sets and clears, sorted and inside the sheet, and an empty result removes the field', () => {
    expect(applyGuides(undefined, { add: [{ axis: 'x', at: 800 }] })).toEqual({ x: [800], y: [] });
    expect(
      applyGuides(
        { x: [800], y: [] },
        {
          add: [
            { axis: 'y', at: 450 },
            { axis: 'x', at: 200 },
          ],
        },
      ),
    ).toEqual({
      x: [200, 800],
      y: [450],
    });
    expect(applyGuides({ x: [200, 800], y: [450] }, { remove: [{ axis: 'x', at: 200 }] })).toEqual({
      x: [800],
      y: [450],
    });
    expect(
      applyGuides({ x: [800], y: [450] }, { move: [{ axis: 'x', from: 800, to: 640 }] }),
    ).toEqual({ x: [640], y: [450] });
    expect(applyGuides({ x: [640], y: [450] }, { set: { x: [1, 1, 1700], y: [-5] } })).toEqual({
      x: [1, 1600],
      y: [0],
    });
    expect(applyGuides({ x: [800], y: [] }, { clear: true })).toBeUndefined();
    expect(applyGuides({ x: [800], y: [] }, { remove: [{ axis: 'x', at: 800 }] })).toBeUndefined();
    expect(normalizeGuideList([900.4, 3, 3, -2], 'y')).toEqual([0, 3, 900]);
  });
});
