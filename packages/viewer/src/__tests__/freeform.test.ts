import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';

import {
  alignMutations,
  distributeMutations,
  freeNudgeMutations,
  grammarFit,
  GRAMMAR_EXT_KEY,
  groupBox,
  isFreeformSlide,
  layoutSwitchMutation,
  paintOrder,
  posFor,
  posOf,
  toFreeform,
  toGrammar,
  zOrderMutations,
} from '../Freeform';
import { actionForMutations, freeGesture, handlesFor } from '../Gestures';
import type { Handle, MeasuredBoxes } from '../Gestures';

// The freeform layout (this round): the conversion from the rendered boxes and back, the arrange
// actions over the schema's arithmetic (what block.align, block.distribute and block.order
// write), and the gestures that end in `block.set /pos`.

// The gestures fixture: a 5/7 cols slide, a heading and a paragraph left, a rows table right.
const cols: Slide = {
  schemaVersion: 1,
  id: 'positioning',
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'Positioning' },
      { id: 'p1', type: 'paragraph', text: 'One sentence.' },
    ],
    right: [{ id: 'list', type: 'rows', key: 200, items: [{ key: 'Where', value: 'Under.' }] }],
  },
};

const colsBoxes: MeasuredBoxes = {
  blocks: {
    h: [137, 129, 522.5, 60],
    p1: [137, 211, 522.5, 90],
    list: [731.5, 129, 731.5, 300],
  },
  slots: { left: [137, 129, 522.5, 642], right: [731.5, 129, 731.5, 642] },
  runs: {},
  parts: {},
};

function placed(id: string, pos: Position): Block {
  return { id, type: 'paragraph', text: id, pos };
}

/** A freeform slide with three positioned paragraphs, z 0, 1, 2 in document order. */
function freeSlide(): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'free',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        placed('a', { x: 200, y: 200, w: 300, h: 100, z: 0 }),
        placed('b', { x: 600, y: 240, w: 200, h: 60, z: 1 }),
        placed('c', { x: 1000, y: 300, w: 100, h: 200, z: 2 }),
      ],
    },
  };
}

const freeBoxes: MeasuredBoxes = {
  blocks: { a: [200, 200, 300, 100], b: [600, 240, 200, 60], c: [1000, 300, 100, 200] },
  slots: { main: [137, 129, 1326, 642] },
  runs: {},
  parts: {},
};

function documentOf(slide: Slide): DeckDocument {
  return {
    deck: {
      schemaVersion: 1,
      id: 'fixture',
      title: 'Fixture',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: [slide.id] }],
      assets: {},
      revision: 3,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    slides: { [slide.id]: slide },
  };
}

/** `[blockId, value]` of every block.set in a list. */
function sets(mutations: ReadonlyArray<{ op: string }>): unknown[] {
  return mutations.map((m) =>
    m.op === 'block.set' && 'blockId' in m && 'value' in m ? [m.blockId, m.value] : m,
  );
}

describe('the freeform types', () => {
  it('reads the layout and pos', () => {
    expect(isFreeformSlide(cols)).toBe(false);
    expect(isFreeformSlide(freeSlide())).toBe(true);
    const [a] = freeSlide().slots.main ?? [];
    expect(a && posOf(a)).toEqual({ x: 200, y: 200, w: 300, h: 100, z: 0 });
    expect(posOf({ id: 'x', type: 'paragraph', text: 'x' })).toBeNull();
  });

  it('paints by z with document order breaking ties', () => {
    const slide = freeSlide();
    const [a, b, c] = slide.slots.main ?? [];
    if (!a || !b || !c) throw new Error('fixture');
    a.pos = { ...(a.pos as Position), z: 5 };
    delete b.pos?.z;
    expect(paintOrder(slide).map((block) => block.id)).toEqual(['b', 'c', 'a']);
  });

  it('starts a gesture from pos, else from the measured box', () => {
    expect(posFor(freeSlide(), 'b', freeBoxes)).toEqual({ x: 600, y: 240, w: 200, h: 60, z: 1 });
    const slide = freeSlide();
    slide.slots.main?.push({ id: 'd', type: 'paragraph', text: 'd' });
    const boxes: MeasuredBoxes = {
      ...freeBoxes,
      blocks: { ...freeBoxes.blocks, d: [137.4, 129, 1326, 40] },
    };
    expect(posFor(slide, 'd', boxes)).toEqual({ x: 137, y: 129, w: 1326, h: 40 });
    expect(groupBox(['a', 'c'], freeBoxes)).toEqual([200, 200, 900, 300]);
  });
});

describe('toFreeform and toGrammar', () => {
  it('reads the rendered boxes into pos, collapses the slots into main and records the grammar', () => {
    const converted = toFreeform(cols, colsBoxes);
    if (!converted) throw new Error('expected a conversion');
    expect(converted.unplaced).toEqual([]);
    const { slide } = converted;
    expect(isFreeformSlide(slide)).toBe(true);
    expect(Object.keys(slide.slots)).toEqual(['main']);
    expect(slide.slots.main?.map((block) => [block.id, posOf(block)])).toEqual([
      ['h', { x: 137, y: 129, w: 523, h: 60, z: 0 }],
      ['p1', { x: 137, y: 211, w: 523, h: 90, z: 1 }],
      ['list', { x: 732, y: 129, w: 732, h: 300, z: 2 }],
    ]);
    /* the record is the first class field `grammar` since gslides-parity SPEC-2 0.99, never an ext key */
    expect(slide.grammar).toMatchObject({
      kind: 'content',
      layout: cols.layout,
      slots: { left: ['h', 'p1'], right: ['list'] },
    });
    expect(slide.ext?.[GRAMMAR_EXT_KEY]).toBeUndefined();
    /* `template` names the layout the slide came from (derivedLayout reads the content, SPEC 5.6) */
    expect(typeof slide.template).toBe('string');
  });

  it('is lossless back to the recorded grammar while nothing moved', () => {
    const converted = toFreeform(cols, colsBoxes);
    if (!converted) throw new Error('expected a conversion');
    expect(grammarFit(converted.slide)).toEqual({
      lossless: true,
      layout: cols.layout,
      slots: { left: ['h', 'p1'], right: ['list'] },
    });
    expect(toGrammar(converted.slide)).toEqual({ slide: cols, lossless: true });
  });

  it('reports a moved block as not lossless and refiles the blocks in reading order', () => {
    const converted = toFreeform(cols, colsBoxes);
    if (!converted) throw new Error('expected a conversion');
    const moved = applyMutations(documentOf(converted.slide), [
      {
        op: 'block.set',
        slideId: 'positioning',
        blockId: 'list',
        path: '/pos',
        value: { x: 772, y: 129, w: 732, h: 300, z: 2 },
      },
    ]).document.slides['positioning'];
    if (!moved) throw new Error('expected the slide');
    const fit = grammarFit(moved);
    if (!fit || fit.lossless) throw new Error('expected a lossy fit');
    expect(fit.reason).toMatch(/no grammar layout/);
    const back = toGrammar(moved);
    expect(back?.lossless).toBe(false);
    /* the schema's fromCanvas (SPEC-2 1.2) refiles a content source by geometry into the recorded
       layout; round one refiled into a stack */
    if (!back || back.slide.kind !== 'content') throw new Error('expected a content slide');
    expect(back.slide.layout.type).toBe('cols');
    const ids = Object.values(back.slide.slots)
      .flat()
      .map((block) => block?.id)
      .sort();
    expect(ids).toEqual(['h', 'list', 'p1']);
    expect(
      Object.values(back.slide.slots)
        .flat()
        .every((block) => block !== undefined && posOf(block) === null),
    ).toBe(true);
    expect(back.slide.ext).toBeUndefined();
    expect(back.slide.grammar).toBeUndefined();
  });

  it('infers cols from two columns on a named seam and stack from one column without a record', () => {
    const twoColumns: ContentSlide = {
      ...freeSlide(),
      slots: {
        main: [
          placed('h', { x: 137, y: 129, w: 523, h: 60 }),
          placed('list', { x: 731.5, y: 129, w: 732, h: 300 }),
          placed('p1', { x: 137, y: 211, w: 523, h: 90 }),
        ],
      },
    };
    expect(grammarFit(twoColumns)).toEqual({
      lossless: true,
      layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'start' },
      slots: { left: ['h', 'p1'], right: ['list'] },
    });
    const oneColumn: ContentSlide = {
      ...freeSlide(),
      slots: {
        main: [
          placed('p1', { x: 137, y: 300, w: 523, h: 90 }),
          placed('h', { x: 137, y: 129, w: 523, h: 60 }),
        ],
      },
    };
    expect(grammarFit(oneColumn)).toEqual({
      lossless: true,
      layout: { type: 'stack' },
      slots: { main: ['h', 'p1'] },
    });
  });

  it('is one slide.replace either way and null where nothing converts', () => {
    expect(layoutSwitchMutation(cols, colsBoxes, 'freeform')).toMatchObject({
      op: 'slide.replace',
      slideId: 'positioning',
    });
    expect(layoutSwitchMutation(cols, colsBoxes, 'grammar')).toBeNull();
    expect(layoutSwitchMutation(freeSlide(), freeBoxes, 'freeform')).toBeNull();
    expect(layoutSwitchMutation(freeSlide(), freeBoxes, 'grammar')).toMatchObject({
      op: 'slide.replace',
      slideId: 'free',
    });
    /* every kind converts since gslides-parity SPEC-2 1.2: a statement's big line becomes a `big` heading object */
    const statement: Slide = { schemaVersion: 1, id: 's', kind: 'statement', big: 'One.' };
    const bigBoxes: MeasuredBoxes = { ...freeBoxes, blocks: { big: [400, 380, 800, 140] } };
    const converted = layoutSwitchMutation(statement, bigBoxes, 'freeform');
    expect(converted).toMatchObject({ op: 'slide.replace', slideId: 's' });
    if (!converted || converted.op !== 'slide.replace' || converted.slide.kind !== 'content')
      throw new Error('expected a converted content slide');
    expect(
      converted.slide.slots.main?.map((block) => [block.id, block.type, posOf(block)]),
    ).toEqual([['big', 'heading', { x: 400, y: 380, w: 800, h: 140, z: 0 }]]);
    expect(converted.slide.grammar?.kind).toBe('statement');
  });
});

describe('arrange', () => {
  const ids = ['a', 'b', 'c'];

  it('aligns on the group box with the shared line snapped, writing only what moves', () => {
    // the group spans x 200 to 1100 and y 200 to 500; 200 is on the grid, 1100 rounds to 1104
    expect(sets(alignMutations(freeSlide(), ids, freeBoxes, 'left'))).toEqual([
      ['b', { x: 200, y: 240, w: 200, h: 60, z: 1 }],
      ['c', { x: 200, y: 300, w: 100, h: 200, z: 2 }],
    ]);
    expect(sets(alignMutations(freeSlide(), ids, freeBoxes, 'right'))).toEqual([
      ['a', { x: 804, y: 200, w: 300, h: 100, z: 0 }],
      ['b', { x: 904, y: 240, w: 200, h: 60, z: 1 }],
      ['c', { x: 1004, y: 300, w: 100, h: 200, z: 2 }],
    ]);
    // the middle at 350 rounds to 352 on the grid
    expect(
      alignMutations(freeSlide(), ids, freeBoxes, 'middle').map(
        (m) => m.op === 'block.set' && (m.value as Position).y,
      ),
    ).toEqual([302, 322, 252]);
    expect(alignMutations(freeSlide(), ids, freeBoxes, 'top')).toHaveLength(2);
    // the bottom at 500 rounds to 504, so every block moves
    expect(alignMutations(freeSlide(), ids, freeBoxes, 'bottom')).toHaveLength(3);
  });

  it('centers a lone block on the content box, on the content center guide', () => {
    expect(sets(alignMutations(freeSlide(), ['a'], freeBoxes, 'center'))).toEqual([
      ['a', { x: 650, y: 200, w: 300, h: 100, z: 0 }],
    ]);
  });

  it('distributes three blocks with equal gaps, keeping the ends', () => {
    // a 200..500, b 600..800, c 1000..1100: the span is 900, the sizes sum to 600, the gaps 150
    expect(sets(distributeMutations(freeSlide(), ids, freeBoxes, 'horizontal'))).toEqual([
      ['b', { x: 650, y: 240, w: 200, h: 60, z: 1 }],
    ]);
    expect(distributeMutations(freeSlide(), ['a', 'b'], freeBoxes, 'horizontal')).toEqual([]);
  });

  it('renumbers the stack densely as block.set /pos/z per changed block, as block.order does', () => {
    const zs = (mutations: ReadonlyArray<{ op: string }>) =>
      mutations.map((m) =>
        m.op === 'block.set' && 'blockId' in m && 'path' in m && 'value' in m
          ? [m.blockId, m.path, m.value]
          : m,
      );
    expect(zs(zOrderMutations(freeSlide(), 'a', 'forward'))).toEqual([
      ['a', '/pos/z', 1],
      ['b', '/pos/z', 0],
    ]);
    expect(zOrderMutations(freeSlide(), 'c', 'forward')).toEqual([]);
    expect(zs(zOrderMutations(freeSlide(), 'c', 'backward'))).toEqual([
      ['b', '/pos/z', 2],
      ['c', '/pos/z', 1],
    ]);
    expect(zs(zOrderMutations(freeSlide(), 'a', 'front'))).toEqual([
      ['a', '/pos/z', 2],
      ['b', '/pos/z', 0],
      ['c', '/pos/z', 1],
    ]);
    expect(zs(zOrderMutations(freeSlide(), 'c', 'back'))).toEqual([
      ['a', '/pos/z', 1],
      ['b', '/pos/z', 2],
      ['c', '/pos/z', 0],
    ]);
    expect(zOrderMutations(cols, 'h', 'forward')).toEqual([]);
  });

  it('nudges every selected block by the same offset', () => {
    expect(sets(freeNudgeMutations(freeSlide(), ['a', 'c'], freeBoxes, 8, -1))).toEqual([
      ['a', { x: 208, y: 199, w: 300, h: 100, z: 0 }],
      ['c', { x: 1008, y: 299, w: 100, h: 200, z: 2 }],
    ]);
    expect(freeNudgeMutations(freeSlide(), ['a'], freeBoxes, 0, 0)).toEqual([]);
  });
});

describe('the freeform gestures', () => {
  function handle(kind: Handle['kind'], list: Handle[], dir?: string): Handle {
    const found = list.find((h) => h.kind === kind && (dir === undefined || h.dir === dir));
    if (!found) throw new Error(`no ${kind} handle`);
    return found;
  }

  it('offers the move chip and eight resize squares for a positioned block', () => {
    const handles = handlesFor(freeSlide(), freeBoxes, { kind: 'block', blockId: 'a' });
    /* the rotation ring joins the eight squares (gslides-parity SPEC-2 6.1 row 11) */
    expect(handles.map((h) => h.kind)).toEqual([
      'free-move',
      ...Array<string>(8).fill('free-resize'),
      'free-rotate',
    ]);
    const chip = handle('free-move', handles);
    expect(chip.shape).toBe('chip');
    expect(chip.control).toBe('handle.a.move');
    const se = handle('free-resize', handles, 'se');
    expect(se.control).toBe('handle.a.resize.se');
    expect(se.cursor).toBe('nwse-resize');
    // the se square is centered on the block's bottom right corner
    expect([se.box[0] + se.box[2] / 2, se.box[1] + se.box[3] / 2]).toEqual([500, 300]);
  });

  it('moves the group by the anchor’s snapped offset, one pos write per block', () => {
    const slide = freeSlide();
    const chip = handle('free-move', handlesFor(slide, freeBoxes, { kind: 'block', blockId: 'a' }));
    const ctx = { slide, boxes: freeBoxes, free: { ids: ['a', 'b'], lines: [] } };
    const result = freeGesture(chip, ctx, { x: 250, y: 250 }, { x: 260, y: 261 });
    if (!result) throw new Error('expected a gesture');
    // a at 200 moves to 210 then the grid takes it to 208: the offset is 8 on x and 8 on y
    expect(sets(result.mutations)).toEqual([
      ['a', { x: 208, y: 208, w: 300, h: 100, z: 0 }],
      ['b', { x: 608, y: 248, w: 200, h: 60, z: 1 }],
    ]);
    expect(result.mutations[0]).toMatchObject({ op: 'block.set', slideId: 'free', path: '/pos' });
    expect(result.guides).toEqual([]);
    expect(freeGesture(chip, ctx, { x: 250, y: 250 }, { x: 251, y: 250 })).toBeNull();
  });

  it('snaps the anchor to a resting block’s edge and reports the guide', () => {
    const slide = freeSlide();
    const chip = handle('free-move', handlesFor(slide, freeBoxes, { kind: 'block', blockId: 'a' }));
    const lines = [{ axis: 'x' as const, at: 600, kind: 'edge' as const, from: 240, to: 300 }];
    const ctx = { slide, boxes: freeBoxes, free: { ids: ['a'], lines } };
    // a's right edge (500) dragged to 604 takes b's left edge at 600
    const result = freeGesture(chip, ctx, { x: 0, y: 0 }, { x: 104, y: 0 });
    expect(result?.mutations[0]).toMatchObject({ value: { x: 300, y: 200 } });
    expect(result?.guides[0]).toMatchObject({ axis: 'x', at: 600, kind: 'edge' });
  });

  it('resizes from a corner as one pos write, the aspect locked under Shift', () => {
    const slide = freeSlide();
    const se = handle(
      'free-resize',
      handlesFor(slide, freeBoxes, { kind: 'block', blockId: 'a' }),
      'se',
    );
    const ctx = { slide, boxes: freeBoxes, free: { ids: ['a'], lines: [] } };
    const result = freeGesture(se, ctx, { x: 500, y: 300 }, { x: 550, y: 300 });
    // the right edge, 550, rounds to 552 on the grid; the bottom edge did not move (dy 0) and
    // stays at 300 (gslides-parity SPEC-2 6.1 row 9: an edge snaps only when the pointer moved
    // along its axis; round one snapped it to 304, a phantom resize on a sideways drag)
    expect(sets(result?.mutations ?? [])).toEqual([
      ['a', { x: 200, y: 200, w: 352, h: 100, z: 0 }],
    ]);
    const locked = freeGesture(se, ctx, { x: 500, y: 300 }, { x: 600, y: 300 }, { shift: true });
    expect(locked?.mutations[0]).toMatchObject({ value: { w: 400, h: 133 } });
  });

  it('previews through the reducer and travels as one action call', () => {
    const slide = freeSlide();
    const mutations = freeNudgeMutations(slide, ['a', 'b'], freeBoxes, 8, 0);
    const draft = applyMutations(documentOf(slide), mutations).document.slides['free'];
    expect(draft && isFreeformSlide(draft) && draft.slots.main?.map((b) => posOf(b)?.x)).toEqual([
      208, 608, 1000,
    ]);
    expect(actionForMutations(mutations, 3)).toEqual({
      id: 'slide.update',
      input: { slideId: 'free', baseRevision: 3, mutations },
    });
    expect(actionForMutations(mutations.slice(0, 1), 3)).toMatchObject({ id: 'block.set' });
    expect(() => actionForMutations([], 3)).toThrow(RangeError);
  });
});
