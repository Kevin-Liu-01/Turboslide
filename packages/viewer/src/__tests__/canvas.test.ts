import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument, Slide } from '@turboslide/schema/deck';
import { fromCanvas, rotatedBoxCorners } from '@turboslide/schema/canvas';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';

import { canvasBoxesFromMeasured, virtualObjectIds } from '../canvas-measure';
import {
  conversionMutation,
  expandGroups,
  freshGroupTag,
  groupMutations,
  isObjectId,
  objectIds,
  posOf,
  scaleGroupMutations,
  sharedGroup,
  toFreeform,
  ungroupMutations,
} from '../Freeform';
import {
  actionForMutations,
  freeGesture,
  handlesFor,
  lineEndMutations,
  nudgeMutation,
  siteUnder,
} from '../Gestures';
import type { Handle, MeasuredBoxes } from '../Gestures';
import { flipMutations, rotateMutations } from '../rotate';
import { boxSnapLines, sheetEdgeLines } from '../snap';

// The canvas (gslides-parity SPEC-2 sections 1 and 6; Kevin's directive of 2026-09-12): the
// conversion of every slide kind from the stage's boxes, the first gesture's write carrying the
// conversion, the objects a marquee and Tab walk, the groups, the group resize and flip, a line's
// end on a connection site, the deck's guides as snap lines.

const title: Slide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'General Translation',
  lead: 'This deck covers the brand.',
};

const statement: Slide = {
  schemaVersion: 1,
  id: 'thesis',
  kind: 'statement',
  big: 'Every product in every language',
  measure: 22,
};

const opener: Slide = {
  schemaVersion: 1,
  id: 'opener-brand',
  kind: 'opener',
  sectionId: 'brand',
  picture: { asset: 'opener-brand', fit: 'cover' },
  plate: {
    side: 'lower-left',
    maxWidth: 740,
    blocks: [
      { id: 'h', type: 'heading', level: 'big', text: 'Brand' },
      { id: 'p1', type: 'paragraph', text: 'This section covers the company.', measure: 56 },
      { id: 'credit', type: 'credit', text: 'Material: Event Horizon' },
    ],
  },
};

/** The stage's boxes of the title slide, as measureBoxes reads them (the mark under its virtual id). */
const titleBoxes: MeasuredBoxes = {
  blocks: { mark: [137, 288, 132, 84], heading: [137, 420, 901, 90], lead: [137, 536, 901, 75] },
  slots: { main: [137, 129, 1326, 642] },
  runs: { 'heading/text': [137, 420, 901, 90], 'lead/text': [137, 536, 901, 75] },
  parts: {},
  prompted: [],
};

const statementBoxes: MeasuredBoxes = {
  blocks: { big: [329, 366, 941.5, 168] },
  slots: { main: [137, 129, 1326, 642] },
  runs: { 'big/text': [329, 366, 941.5, 168] },
  parts: {},
};

const openerBoxes: MeasuredBoxes = {
  blocks: {
    picture: [-57, -57, 1714, 1014],
    plate: [137, 480, 740, 291],
    h: [163, 502, 688, 97],
    p1: [163, 613, 688, 66],
    credit: [163, 700, 688, 22],
  },
  slots: { plate: [137, 480, 740, 291] },
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
      assets: {
        'opener-brand': {
          id: 'opener-brand',
          role: 'picture',
          source: { kind: 'upload', name: 'opener-brand.png' },
          twins: { light: 'assets/opener-brand-light.png', dark: 'assets/opener-brand-dark.png' },
          alt: 'Brand',
        } as unknown as DeckDocument['deck']['assets'][string],
      },
      revision: 3,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    slides: { [slide.id]: slide },
  };
}

function handle(kind: Handle['kind'], list: Handle[], dir?: string): Handle {
  const found = list.find((h) => h.kind === kind && (dir === undefined || h.dir === dir));
  if (!found) throw new Error(`no ${kind} handle`);
  return found;
}

function positions(slide: Slide): Record<string, Position | null> {
  const out: Record<string, Position | null> = {};
  if (slide.kind === 'content')
    for (const block of slide.slots.main ?? []) out[block.id] = posOf(block);
  return out;
}

describe('the stage boxes as the conversion reads them', () => {
  it('moves the kinds’ virtual objects to their own fields and keeps the blocks', () => {
    const boxes = canvasBoxesFromMeasured(titleBoxes, title);
    expect(boxes.mark).toEqual([137, 288, 132, 84]);
    expect(boxes.blocks).toEqual({ heading: [137, 420, 901, 90], lead: [137, 536, 901, 75] });
    const pictured = canvasBoxesFromMeasured(openerBoxes, opener);
    expect(pictured.picture).toEqual([-57, -57, 1714, 1014]);
    expect(pictured.plate).toEqual([137, 480, 740, 291]);
    expect(Object.keys(pictured.blocks)).toEqual(['h', 'p1', 'credit']);
    expect([...virtualObjectIds(title)]).toEqual(['mark']);
    expect([...virtualObjectIds(opener)]).toEqual(['picture', 'plate']);
    expect([...virtualObjectIds(statement)]).toEqual([]);
  });

  it('rounds the stage’s half pixels to the integers pos stores', () => {
    const boxes = canvasBoxesFromMeasured(statementBoxes, statement);
    expect(boxes.blocks['big']).toEqual([329, 366, 942, 168]);
  });
});

describe('the conversion per kind (SPEC-2 1.2)', () => {
  it('turns a title slide into a mark, an h1 heading and a lead paragraph with shrink autofit', () => {
    const converted = toFreeform(title, titleBoxes);
    if (!converted) throw new Error('expected a conversion');
    const { slide } = converted;
    expect(slide.kind).toBe('content');
    expect(slide.layout).toEqual({ type: 'freeform' });
    expect(slide.template).toBe('title');
    expect(slide.slots.main?.map((b) => [b.id, b.type, posOf(b)])).toEqual([
      ['mark', 'mark', { x: 137, y: 288, w: 132, h: 84, z: 0 }],
      ['heading', 'heading', { x: 137, y: 420, w: 901, h: 90, z: 1 }],
      ['lead', 'paragraph', { x: 137, y: 536, w: 901, h: 75, z: 2 }],
    ]);
    const heading = slide.slots.main?.[1] as Extract<Block, { type: 'heading' }>;
    expect(heading.level).toBe('h1');
    expect(heading.autofit).toBe('shrink');
    expect(slide.grammar?.kind).toBe('title');
    expect(slide.grammar?.fields?.mark).toEqual({ w: 132, h: 84 });
    /* lossless back while nothing moved */
    const back = fromCanvas(slide);
    expect(back?.lossless).toBe(true);
    expect(back?.slide).toEqual(title);
  });

  it('turns a statement into one centred big heading and keeps the measure in the record', () => {
    const converted = toFreeform(statement, statementBoxes);
    if (!converted) throw new Error('expected a conversion');
    const [big] = converted.slide.slots.main ?? [];
    expect(big).toMatchObject({
      id: 'big',
      type: 'heading',
      level: 'big',
      typography: { align: 'center' },
      autofit: 'shrink',
      pos: { x: 329, y: 366, w: 942, h: 168, z: 0 },
    });
    expect(converted.slide.grammar?.fields?.measure).toBe(22);
    expect(fromCanvas(converted.slide)?.slide).toEqual(statement);
  });

  it('turns an opener into the picture object at the bottom, the plate box and its blocks in one group', () => {
    const converted = toFreeform(opener, openerBoxes);
    if (!converted) throw new Error('expected a conversion');
    const rows = converted.slide.slots.main?.map((b) => [b.id, b.type, posOf(b)]) ?? [];
    expect(rows[0]).toEqual(['picture', 'picture', { x: 0, y: 0, w: 1600, h: 900, z: 0 }]);
    expect(rows[1]).toEqual([
      'plate',
      'box',
      { x: 137, y: 480, w: 740, h: 291, z: 1, group: 'plate' },
    ]);
    expect(rows.slice(2).map((row) => row[0])).toEqual(['h', 'p1', 'credit']);
    for (const row of rows.slice(2)) expect((row[2] as Position).group).toBe('plate');
    const picture = converted.slide.slots.main?.[0] as Extract<Block, { type: 'picture' }>;
    expect(picture.asset).toBe('opener-brand');
    expect(picture.side).toBe('lower-left');
    const h = converted.slide.slots.main?.[2] as Extract<Block, { type: 'heading' }>;
    expect(h.autofit).toBe('shrink');
    expect(converted.slide.grammar?.fields?.sectionId).toBe('brand');
    expect(fromCanvas(converted.slide)?.slide).toEqual(opener);
  });

  it('is one slide.replace, and null on a slide that is a canvas already', () => {
    const mutation = conversionMutation(title, titleBoxes);
    expect(mutation).toMatchObject({ op: 'slide.replace', slideId: 'title' });
    if (!mutation || mutation.op !== 'slide.replace') throw new Error('expected a replace');
    expect(conversionMutation(mutation.slide, titleBoxes)).toBeNull();
  });
});

describe('the first gesture’s write (SPEC-2 1.6)', () => {
  it('travels the conversion first, then the pos writes, as one slide.update that one undo inverts', () => {
    const converted = toFreeform(title, titleBoxes);
    if (!converted) throw new Error('expected a conversion');
    const canvas = converted.slide;
    const boxes: MeasuredBoxes = {
      ...titleBoxes,
      blocks: Object.fromEntries(
        (canvas.slots.main ?? []).map((b) => [b.id, [b.pos!.x, b.pos!.y, b.pos!.w, b.pos!.h]]),
      ),
    };
    const chip = handle(
      'free-move',
      handlesFor(canvas, boxes, { kind: 'block', blockId: 'heading' }),
    );
    const ctx = { slide: canvas, boxes, free: { ids: ['heading'], lines: [], grid: false } };
    const drag = freeGesture(chip, ctx, { x: 300, y: 450 }, { x: 340, y: 474 });
    if (!drag) throw new Error('expected a move');
    const mutations: Mutation[] = [
      { op: 'slide.replace', slideId: 'title', slide: canvas },
      ...drag.mutations,
    ];
    const call = actionForMutations(mutations, 3);
    expect(call.id).toBe('slide.update');
    expect((call.input.mutations as Mutation[])[0]?.op).toBe('slide.replace');
    expect((call.input.mutations as Mutation[])[1]).toMatchObject({
      op: 'block.set',
      blockId: 'heading',
      path: '/pos',
      value: { x: 177, y: 444, w: 901, h: 90, z: 1 },
    });
    const applied = applyMutations(documentOf(title), mutations);
    const after = applied.document.slides['title'];
    expect(after?.kind).toBe('content');
    expect(positions(after as Slide)['heading']).toEqual({ x: 177, y: 444, w: 901, h: 90, z: 1 });
    /* the inverse restores the title slide byte for byte */
    const undone = applyMutations(applied.document, applied.inverse).document.slides['title'];
    expect(undone).toEqual(title);
  });

  it('nudges, resizes and rotates the opener’s photograph like any object', () => {
    const converted = toFreeform(opener, openerBoxes);
    if (!converted) throw new Error('expected a conversion');
    const canvas = converted.slide;
    const boxes: MeasuredBoxes = {
      ...openerBoxes,
      blocks: Object.fromEntries(
        (canvas.slots.main ?? []).map((b) => [b.id, [b.pos!.x, b.pos!.y, b.pos!.w, b.pos!.h]]),
      ),
    };
    const list = handlesFor(canvas, boxes, { kind: 'block', blockId: 'picture' });
    const chip = handle('free-move', list);
    const ctx = { slide: canvas, boxes, free: { ids: ['picture'], lines: [], grid: false } };
    const moved = freeGesture(chip, ctx, { x: 100, y: 100 }, { x: 140, y: 124 });
    expect(moved?.mutations[0]).toMatchObject({ value: { x: 40, y: 24, w: 1600, h: 900, z: 0 } });
    const east = handle('free-resize', list, 'e');
    const wider = freeGesture(east, ctx, { x: 1600, y: 450 }, { x: 1680, y: 450 });
    expect(wider?.mutations[0]).toMatchObject({ value: { x: 0, y: 0, w: 1680, h: 900 } });
    expect(wider?.size).toEqual({ w: 1680, h: 900 });
    const ring = handle('free-rotate', list);
    const turned = freeGesture(ring, ctx, { x: 800, y: 0 }, { x: 1250, y: 450 }, { shift: true });
    expect(turned?.mutations[0]).toMatchObject({ value: { rotate: 90 } });
    expect(turned?.angle).toBe(90);
  });
});

describe('objects, Tab order and the marquee (SPEC-2 6.1 rows 3, 4)', () => {
  it('walks a title slide’s mark, heading and lead in document order and a canvas in paint order', () => {
    expect(objectIds(title, titleBoxes, ['heading', 'lead'])).toEqual(['mark', 'heading', 'lead']);
    expect(objectIds(opener, openerBoxes, ['h', 'p1', 'credit'])).toEqual([
      'picture',
      'plate',
      'h',
      'p1',
      'credit',
    ]);
    const converted = toFreeform(opener, openerBoxes);
    if (!converted) throw new Error('expected a conversion');
    const reordered: ContentSlide = {
      ...converted.slide,
      slots: {
        main: (converted.slide.slots.main ?? []).map((b) =>
          b.id === 'credit' ? { ...b, pos: { ...(b.pos as Position), z: 0 } } : b,
        ),
      },
    };
    expect(objectIds(reordered, openerBoxes, [])).toEqual([
      'picture',
      'credit',
      'plate',
      'h',
      'p1',
    ]);
    expect(isObjectId(title, titleBoxes, 'mark')).toBe(true);
    expect(isObjectId(title, titleBoxes, 'heading')).toBe(true);
    expect(isObjectId(opener, openerBoxes, 'picture')).toBe(true);
    expect(isObjectId(opener, openerBoxes, 'nothing')).toBe(false);
  });
});

describe('groups (SPEC-2 6.1 row 14, 0.102)', () => {
  function placed(id: string, pos: Position): Block {
    return { id, type: 'paragraph', text: id, pos };
  }
  const grouped: ContentSlide = {
    schemaVersion: 1,
    id: 'g',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        placed('a', { x: 200, y: 200, w: 200, h: 100, z: 0, group: 'pair' }),
        placed('b', { x: 600, y: 200, w: 200, h: 100, z: 1, group: 'pair' }),
        placed('c', { x: 1000, y: 300, w: 100, h: 200, z: 2 }),
      ],
    },
  };
  const boxes: MeasuredBoxes = {
    blocks: { a: [200, 200, 200, 100], b: [600, 200, 200, 100], c: [1000, 300, 100, 200] },
    slots: {},
    runs: {},
    parts: {},
  };

  it('widens a click on a member to the whole group and names the shared tag', () => {
    expect(expandGroups(grouped, ['b'])).toEqual(['b', 'a']);
    expect(expandGroups(grouped, ['c'])).toEqual(['c']);
    expect(sharedGroup(grouped, ['a', 'b'])).toBe('pair');
    expect(sharedGroup(grouped, ['a', 'c'])).toBeNull();
    expect(freshGroupTag(grouped)).toBe('group');
    expect(freshGroupTag(grouped, 'pair')).toBe('pair-2');
  });

  it('writes and removes the tag as block.set /pos/group per member', () => {
    expect(groupMutations(grouped, ['b', 'c'], 'two')).toEqual([
      { op: 'block.set', slideId: 'g', blockId: 'b', path: '/pos/group', value: 'two' },
      { op: 'block.set', slideId: 'g', blockId: 'c', path: '/pos/group', value: 'two' },
    ]);
    expect(ungroupMutations(grouped, ['a', 'b', 'c'])).toEqual([
      { op: 'block.set', slideId: 'g', blockId: 'a', path: '/pos/group' },
      { op: 'block.set', slideId: 'g', blockId: 'b', path: '/pos/group' },
    ]);
  });

  it('scales the members about the union on a resize and mirrors them on a flip', () => {
    /* the union is 200..800 by 200..300; doubling its width to 1200 doubles every member's x offset and width */
    const scaled = scaleGroupMutations(grouped, ['a', 'b'], boxes, [200, 200, 1200, 100]);
    expect(scaled.map((m) => (m.op === 'block.set' ? [m.blockId, m.value] : m))).toEqual([
      ['a', { x: 200, y: 200, w: 400, h: 100, z: 0, group: 'pair' }],
      ['b', { x: 1000, y: 200, w: 400, h: 100, z: 1, group: 'pair' }],
    ]);
    const rows = [
      { id: 'a', pos: { x: 200, y: 200, w: 200, h: 100, z: 0, group: 'pair' } },
      { id: 'b', pos: { x: 600, y: 200, w: 200, h: 100, z: 1, group: 'pair' } },
    ];
    const flipped = flipMutations(grouped, rows, 'h', 'selection');
    expect(flipped.map((m) => (m.op === 'block.set' ? [m.blockId, m.value] : m))).toEqual([
      ['a', { x: 600, y: 200, w: 200, h: 100, z: 0, group: 'pair', flip: 'h' }],
      ['b', { x: 200, y: 200, w: 200, h: 100, z: 1, group: 'pair', flip: 'h' }],
    ]);
    const turned = rotateMutations(grouped, rows, { by: 90 }, 'selection');
    expect(turned).toHaveLength(2);
    expect(turned[0]).toMatchObject({ value: { rotate: 90 } });
    /* a group resize handle scales every member: the free-resize gesture over two ids */
    const list = handlesFor(grouped, boxes, { kind: 'block', blockId: 'a' }, { ids: ['a', 'b'] });
    const east = handle('free-resize', list, 'e');
    expect(east.box[0] + east.box[2] / 2).toBe(800);
    const ctx = { slide: grouped, boxes, free: { ids: ['a', 'b'], lines: [], grid: false } };
    const drag = freeGesture(east, ctx, { x: 800, y: 250 }, { x: 1400, y: 250 });
    expect(drag?.mutations).toHaveLength(2);
    expect(drag?.mutations[1]).toMatchObject({ value: { x: 1000, w: 400 } });
  });
});

describe('connectors (SPEC-2 6.1 row 20, 0.103)', () => {
  const withShapes: ContentSlide = {
    schemaVersion: 1,
    id: 'lines',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 'a',
          type: 'shape',
          shape: 'rectangle',
          pos: { x: 200, y: 200, w: 200, h: 100, z: 0 },
        },
        {
          id: 'b',
          type: 'shape',
          shape: 'rectangle',
          pos: { x: 800, y: 600, w: 200, h: 100, z: 1 },
        },
        {
          id: 'line',
          type: 'shape',
          shape: 'line',
          orientation: 'horizontal',
          pos: { x: 400, y: 246, w: 200, h: 8, z: 2 },
        },
      ],
    },
  };

  it('snaps a dragged end to the site under it and records connect; dropped away it detaches', () => {
    const site = siteUnder(withShapes, { x: 803, y: 648 }, ['line']);
    expect(site).toMatchObject({ blockId: 'b', site: 1 });
    const line = withShapes.slots.main?.[2] as Extract<Block, { type: 'shape' }>;
    const attached = lineEndMutations(withShapes, line, 'end', { x: 803, y: 648 });
    const connect = attached.mutations.find((m) => m.op === 'block.set' && m.path === '/connect');
    expect(connect).toMatchObject({ value: { end: { block: 'b', site: 1 } } });
    const pos = attached.mutations.find((m) => m.op === 'block.set' && m.path === '/pos');
    expect(pos).toMatchObject({ value: { x: 400, w: 400 } });
    const detached = lineEndMutations(
      {
        ...withShapes,
        slots: {
          main: [
            ...(withShapes.slots.main ?? []).slice(0, 2),
            { ...line, connect: { end: { block: 'b', site: 1 } } },
          ],
        },
      },
      { ...line, connect: { end: { block: 'b', site: 1 } } },
      'end',
      { x: 700, y: 400 },
    );
    expect(detached.mutations.find((m) => m.op === 'block.set' && m.path === '/connect')).toEqual({
      op: 'block.set',
      slideId: 'lines',
      blockId: 'line',
      path: '/connect',
    });
  });
});

describe('the snap lines of the canvas (SPEC-2 6.1 rows 7, 31)', () => {
  it('names the sheet’s edges and centre on both axes', () => {
    const lines = sheetEdgeLines();
    expect(lines.filter((l) => l.axis === 'x').map((l) => l.at)).toEqual([0, 800, 1600]);
    expect(lines.filter((l) => l.axis === 'y').map((l) => l.at)).toEqual([0, 450, 900]);
    expect(boxSnapLines([200, 200, 300, 100]).map((l) => l.at)).toEqual([
      200, 350, 500, 200, 250, 300,
    ]);
  });
});

// The resize handles over the one model (SPEC-5-amendments A4; build-4/hotfix-3.md section 2):
// the gesture and the keyboard nudge land what schema/canvas.ts resizeBox says, so a rotated
// object keeps its anchored corner on the sheet, Alt keeps the centre, an icon's corner keeps its
// ratio without Shift, and the size readout is the box written.
describe('the resize handles share the schema model (SPEC-5-amendments A4)', () => {
  const rectPos: Position = { x: 100, y: 100, w: 200, h: 100, z: 0, rotate: 30 };
  const iconPos: Position = { x: 500, y: 100, w: 96, h: 96, z: 1 };
  const textPos: Position = { x: 700, y: 100, w: 260, h: 140, z: 2 };
  const canvas: ContentSlide = {
    schemaVersion: 1,
    id: 'cv',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        { id: 'rect', type: 'shape', shape: 'rectangle', stroke: 'hair', pos: rectPos },
        { id: 'icon', type: 'icon', name: 'bolt', pos: iconPos },
        { id: 'text', type: 'text', text: 'Some text.', autofit: 'grow', pos: textPos },
      ] as Block[],
    },
  };
  const boxes: MeasuredBoxes = {
    blocks: {
      rect: [rectPos.x, rectPos.y, rectPos.w, rectPos.h],
      icon: [iconPos.x, iconPos.y, iconPos.w, iconPos.h],
      text: [textPos.x, textPos.y, textPos.w, textPos.h],
    },
    slots: {},
    runs: {},
    parts: {},
  };
  const ctx = (ids: string[]) => ({
    slide: canvas as Slide,
    boxes,
    free: { ids, lines: [], grid: false },
  });
  const posOfMutation = (m: Mutation | undefined): Position => {
    if (m?.op !== 'block.set') throw new Error('expected a block.set');
    return m.value as Position;
  };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(0.75);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(0.75);
  };

  it('keeps a rotated object’s anchored corner on the sheet and lands the dragged corner under the pointer', () => {
    const list = handlesFor(canvas, boxes, { kind: 'block', blockId: 'rect' });
    const se = handle('free-resize', list, 'se');
    const start = { x: 300, y: 200 };
    const drag = freeGesture(se, ctx(['rect']), start, { x: start.x + 40, y: start.y - 24 });
    const pos = posOfMutation(drag?.mutations[0]);
    const before = rotatedBoxCorners(rectPos, 30);
    const after = rotatedBoxCorners(pos, 30);
    near(after[0]!, before[0]!);
    near(after[2]!, { x: before[2]!.x + 40, y: before[2]!.y - 24 });
    expect(pos.rotate).toBe(30);
    expect(drag?.guides).toEqual([]);
    expect(drag?.size).toEqual({ w: pos.w, h: pos.h });
    /* a side handle: the opposite edge stays put and the size follows the delta along the axis */
    const n = handle('free-resize', list, 'n');
    const lifted = posOfMutation(
      freeGesture(n, ctx(['rect']), { x: 200, y: 100 }, { x: 200, y: 80 })?.mutations[0],
    );
    const lifts = rotatedBoxCorners(lifted, 30);
    near(lifts[2]!, before[2]!);
    near(lifts[3]!, before[3]!);
    expect(lifted.w).toBe(200);
    expect(lifted.h).toBe(Math.round(100 + 20 * Math.cos(Math.PI / 6)));
  });

  it('resizes about the centre under Alt and keeps an icon’s ratio from a corner without Shift', () => {
    const list = handlesFor(canvas, boxes, { kind: 'block', blockId: 'rect' });
    const e = handle('free-resize', list, 'e');
    const alt = posOfMutation(
      freeGesture(
        e,
        ctx(['rect']),
        { x: 300, y: 150 },
        { x: 340, y: 150 },
        { shift: false, alt: true },
      )?.mutations[0],
    );
    expect({ x: alt.x + alt.w / 2, y: alt.y + alt.h / 2 }).toEqual({ x: 200, y: 150 });
    expect(alt.h).toBe(100);
    const icons = handlesFor(canvas, boxes, { kind: 'block', blockId: 'icon' });
    const se = handle('free-resize', icons, 'se');
    const grown = posOfMutation(
      freeGesture(se, ctx(['icon']), { x: 596, y: 196 }, { x: 644, y: 196 })?.mutations[0],
    );
    expect(grown).toEqual({ ...iconPos, w: 144, h: 144 });
    /* the side handle of a locked kind changes one dimension */
    const east = posOfMutation(
      freeGesture(
        handle('free-resize', icons, 'e'),
        ctx(['icon']),
        { x: 596, y: 148 },
        { x: 644, y: 148 },
      )?.mutations[0],
    );
    expect(east).toEqual({ ...iconPos, w: 144 });
    /* Shift keeps a text box’s ratio, which resizes freely otherwise */
    const texts = handlesFor(canvas, boxes, { kind: 'block', blockId: 'text' });
    const corner = handle('free-resize', texts, 'se');
    const free = posOfMutation(
      freeGesture(corner, ctx(['text']), { x: 960, y: 240 }, { x: 1090, y: 240 })?.mutations[0],
    );
    expect(free).toEqual({ ...textPos, w: 390 });
    const held = posOfMutation(
      freeGesture(corner, ctx(['text']), { x: 960, y: 240 }, { x: 1090, y: 240 }, { shift: true })
        ?.mutations[0],
    );
    expect(held).toEqual({ ...textPos, w: 390, h: 210 });
  });

  it('nudges a rotated object’s handle along its own axis with the opposite edge held', () => {
    const list = handlesFor(canvas, boxes, { kind: 'block', blockId: 'rect' });
    const e = handle('free-resize', list, 'e');
    const pos = posOfMutation(nudgeMutation(e, ctx(['rect']), 10, 'x') ?? undefined);
    expect(pos.w).toBe(210);
    expect(pos.h).toBe(100);
    const before = rotatedBoxCorners(rectPos, 30);
    const after = rotatedBoxCorners(pos, 30);
    near(after[0]!, before[0]!);
    near(after[3]!, before[3]!);
  });

  it('scales a multi selection about the union’s centre under Alt', () => {
    const list = handlesFor(
      canvas,
      boxes,
      { kind: 'block', blockId: 'icon' },
      { ids: ['icon', 'text'] },
    );
    const e = handle('free-resize', list, 'e');
    const drag = freeGesture(
      e,
      ctx(['icon', 'text']),
      { x: 960, y: 170 },
      { x: 1060, y: 170 },
      {
        shift: false,
        alt: true,
      },
    );
    expect(drag?.size).toEqual({ w: 660, h: 140 });
    const written = Object.fromEntries(
      (drag?.mutations ?? []).map((m) => [
        m.op === 'block.set' ? m.blockId : '',
        m.op === 'block.set' ? m.value : null,
      ]),
    ) as Record<string, Position>;
    /* the union 500..960 by 100..240 grows 100 each way about its centre at 730, 170 */
    const iconOut = written['icon'];
    const textOut = written['text'];
    if (iconOut === undefined || textOut === undefined) throw new Error('both members write');
    expect(iconOut.x).toBeCloseTo(400, 0);
    expect(textOut.x + textOut.w).toBeCloseTo(1060, 0);
  });
});
