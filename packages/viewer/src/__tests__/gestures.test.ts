import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';

import {
  actionForMutation,
  actionForMutations,
  blockMoveFor,
  blockMoveHandle,
  drawnBox,
  dropIndexFor,
  dropSlotFor,
  gestureMutation,
  handlesFor,
  labelClearanceBox,
  nudgeMutation,
  sheetPoint,
  TOOL_DEFAULT_SIZE,
  toolBlockType,
  toolInsertMutation,
} from '../Gestures';
import type { Handle, MeasuredBoxes } from '../Gestures';

// A 5/7 cols slide: a heading and a paragraph on the left, a rows table with key 200 on the right.
const slide: Slide = {
  schemaVersion: 1,
  id: 'positioning',
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'Positioning' },
      { id: 'p1', type: 'paragraph', text: 'One sentence.' },
    ],
    right: [
      {
        id: 'list',
        type: 'rows',
        key: 200,
        items: [{ key: 'Where', value: 'Under the fold.' }],
      },
    ],
  },
};

// Boxes in sheet pixels, as the Editor measures them: the left column is 522.5 wide at x 137, the
// right one starts at 137 + 522.5 + 72.
const boxes: MeasuredBoxes = {
  blocks: {
    h: [137, 129, 522.5, 60],
    p1: [137, 211, 522.5, 90],
    list: [731.5, 129, 731.5, 300],
  },
  slots: { left: [137, 129, 522.5, 642], right: [731.5, 129, 731.5, 642] },
  runs: {},
  parts: {},
};

function handle(kind: Handle['kind'], list: Handle[]): Handle {
  const found = list.find((h) => h.kind === kind);
  if (!found) throw new Error(`no ${kind} handle`);
  return found;
}

describe('handlesFor', () => {
  it('offers the column seam always and the key edge of a selected rows block at its key', () => {
    const none = handlesFor(slide, boxes, null);
    expect(none.map((h) => h.kind)).toEqual(['col-seam']);
    /* every object of every slide kind carries the canvas handles (gslides-parity SPEC-2 1.1,
       6.1): the chip, the eight squares and the rotation ring, then the grammar's own property
       handles; the round one block-move chip is gone (the chip moves the object and converts) */
    const selected = handlesFor(slide, boxes, { kind: 'block', blockId: 'list' });
    expect(selected.map((h) => h.kind)).toEqual([
      'col-seam',
      'free-move',
      ...Array<string>(8).fill('free-resize'),
      'free-rotate',
      'key-edge',
    ]);
    const edge = handle('key-edge', selected);
    expect(edge.box[0] + edge.box[2] / 2).toBe(731.5 + 200);
    expect(edge.label).toBe('list: Key column edge');
    expect(edge.control).toBe('handle.list.key');
  });

  it('gives a heading no property handle beyond the canvas handles', () => {
    const forHeading = handlesFor(slide, boxes, { kind: 'block', blockId: 'h' });
    expect(forHeading.map((h) => h.kind)).toEqual([
      'col-seam',
      'free-move',
      ...Array<string>(8).fill('free-resize'),
      'free-rotate',
    ]);
  });
});

describe('gestureMutation', () => {
  const ctx = { slide, boxes };
  const edge = handle('key-edge', handlesFor(slide, boxes, { kind: 'block', blockId: 'list' }));
  const seam = handle('col-seam', handlesFor(slide, boxes, null));

  it('maps a drag of the key edge from 200 to 232 to block.set /key with the snapped value', () => {
    const start = { x: 931.5, y: 200 };
    expect(gestureMutation(edge, ctx, start, { x: 963.5, y: 220 })).toEqual({
      op: 'block.set',
      slideId: 'positioning',
      blockId: 'list',
      path: '/key',
      value: 240,
    });
  });

  it('yields nothing while the snapped value is the current one', () => {
    const start = { x: 931.5, y: 200 };
    expect(gestureMutation(edge, ctx, start, start)).toBeNull();
    expect(gestureMutation(edge, ctx, start, { x: 939.5, y: 200 })).toBeNull();
  });

  it('maps the column seam to slide.set /layout/ratio on a named ratio, then 10 px steps', () => {
    const start = { x: 695.5, y: 400 };
    expect(gestureMutation(seam, ctx, start, { x: start.x + 104.5, y: 400 })).toEqual({
      op: 'slide.set',
      slideId: 'positioning',
      path: '/layout/ratio',
      value: '1/1',
    });
    expect(gestureMutation(seam, ctx, start, { x: start.x + 77.5, y: 400 })).toEqual({
      op: 'slide.set',
      slideId: 'positioning',
      path: '/layout/ratio',
      value: { left: 600 },
    });
    expect(gestureMutation(seam, ctx, start, { x: start.x + 4, y: 400 })).toBeNull();
  });

  it('the mutation applies through the reducer and the preview document carries the value', () => {
    const document: DeckDocument = {
      deck: {
        schemaVersion: 1,
        id: 'fixture',
        title: 'Fixture',
        theme: 'gt-ink-paper',
        sections: [{ id: 'one', name: 'One', slideIds: ['positioning'] }],
        assets: {},
        revision: 13,
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
      slides: { positioning: slide },
    };
    const mutation = gestureMutation(edge, ctx, { x: 931.5, y: 200 }, { x: 963.5, y: 200 });
    if (!mutation) throw new Error('expected a mutation');
    const draft = applyMutations(document, [mutation]).document;
    const rows = draft.slides.positioning;
    if (!rows || rows.kind !== 'content') throw new Error('expected the content slide');
    expect(rows.slots.right?.[0]).toMatchObject({ id: 'list', key: 240 });
    // the original is untouched: a preview never compounds
    expect(slide.slots.right?.[0]).toMatchObject({ key: 200 });
  });
});

describe('blockMoveFor', () => {
  it('moves a block below its neighbour within the slot', () => {
    const { mutation, indicator } = blockMoveFor(slide, 'h', { x: 300, y: 300 }, boxes);
    expect(mutation).toEqual({
      op: 'block.move',
      slideId: 'positioning',
      blockId: 'h',
      slot: 'left',
      after: 'p1',
    });
    expect(indicator).toEqual([137, 211 + 90 + 11, 522.5, 0]);
  });

  it('moves a block across the two columns of cols, first in the target slot', () => {
    const { mutation } = blockMoveFor(slide, 'h', { x: 900, y: 150 }, boxes);
    expect(mutation).toEqual({
      op: 'block.move',
      slideId: 'positioning',
      blockId: 'h',
      slot: 'right',
    });
  });

  it('yields no mutation when the block would land where it is', () => {
    expect(blockMoveFor(slide, 'h', { x: 300, y: 150 }, boxes).mutation).toBeNull();
    expect(blockMoveFor(slide, 'p1', { x: 300, y: 300 }, boxes).mutation).toBeNull();
  });

  it('never leaves a plate', () => {
    const opener: Slide = {
      schemaVersion: 1,
      id: 'opener-brand',
      kind: 'opener',
      sectionId: 'brand',
      picture: { asset: 'cover', fit: 'cover' },
      plate: {
        side: 'lower-left',
        maxWidth: 740,
        blocks: [
          { id: 'title', type: 'heading', level: 'big', text: 'Brand' },
          { id: 'credit', type: 'credit', text: 'Photo: someone' },
        ],
      },
    };
    const plateBoxes: MeasuredBoxes = {
      blocks: { title: [137, 560, 400, 80], credit: [137, 652, 400, 24] },
      slots: { plate: [137, 540, 460, 150] },
      runs: {},
      parts: {},
    };
    // dragged far outside the plate, to the sheet's right edge and below it: the slot stays plate
    expect(blockMoveFor(opener, 'title', { x: 1400, y: 880 }, plateBoxes).mutation).toEqual({
      op: 'block.move',
      slideId: 'opener-brand',
      blockId: 'title',
      slot: 'plate',
      after: 'credit',
    });
    // and above the plate it stays first, so nothing moves
    expect(blockMoveFor(opener, 'title', { x: 1400, y: 100 }, plateBoxes).mutation).toBeNull();
  });
});

describe('plate, shot, scales and pair gestures', () => {
  const opener: Slide = {
    schemaVersion: 1,
    id: 'opener-brand',
    kind: 'opener',
    sectionId: 'brand',
    picture: { asset: 'cover', fit: 'cover' },
    plate: { side: 'lower-left', maxWidth: 740, blocks: [] },
  };
  const plateBoxes: MeasuredBoxes = {
    blocks: {},
    slots: { plate: [137, 500, 700, 271] },
    runs: {},
    parts: {},
  };

  it('draws the eight crop handles over the frame of an unconverted photograph with no block box (VERIFICATION-3 finding 27)', () => {
    /* the provisional crop of SPEC-2 1.1 arms on a picture kind before the slide converts: the
       photograph is measured under `picture`, never `blocks.picture`, so the frame is the box */
    const frame: [number, number, number, number] = [420, 0, 1180, 900];
    const handles = handlesFor(
      opener,
      plateBoxes,
      { kind: 'block', blockId: 'picture' },
      { ids: ['picture'], crop: { frame } },
    );
    const crop = handles.filter((h) => h.kind === 'crop-edge');
    expect(crop).toHaveLength(8);
    expect(crop.map((h) => h.control).sort()).toEqual(
      ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
        .map((dir) => `handle.picture.crop.${dir}`)
        .sort(),
    );
    expect(handles.some((h) => h.kind === 'free-move' || h.kind === 'free-resize')).toBe(false);
    const west = crop.find((h) => h.dir === 'w')!;
    expect(west.box[0] + west.box[2] / 2).toBe(frame[0]);
    expect(west.box[1] + west.box[3] / 2).toBe(frame[1] + frame[3] / 2);
    /* without crop mode the same selection still draws nothing: no measured box, no handles */
    expect(
      handlesFor(
        opener,
        plateBoxes,
        { kind: 'block', blockId: 'picture' },
        { ids: ['picture'] },
      ).filter((h) => h.blockId === 'picture'),
    ).toEqual([]);
  });

  it('snaps the plate edge to the plate widths and flips the side by the pointer half', () => {
    const handles = handlesFor(opener, plateBoxes, null);
    expect(handles.map((h) => h.kind)).toEqual(['plate-width', 'plate-side']);
    const width = handle('plate-width', handles);
    const ctx = { slide: opener, boxes: plateBoxes };
    expect(gestureMutation(width, ctx, { x: 837, y: 600 }, { x: 737, y: 600 })).toEqual({
      op: 'slide.set',
      slideId: 'opener-brand',
      path: '/plate/maxWidth',
      value: 720,
    });
    const side = handle('plate-side', handles);
    expect(gestureMutation(side, ctx, { x: 487, y: 500 }, { x: 1200, y: 500 })).toEqual({
      op: 'slide.set',
      slideId: 'opener-brand',
      path: '/plate/side',
      value: 'lower-right',
    });
    expect(gestureMutation(side, ctx, { x: 487, y: 500 }, { x: 300, y: 500 })).toBeNull();
  });

  it('resizes a shot to the snaps and deletes the width at the column width', () => {
    const shots: Slide = {
      schemaVersion: 1,
      id: 'shots',
      kind: 'content',
      layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
      slots: {
        left: [{ id: 'p', type: 'paragraph', text: 'Text.' }],
        right: [{ id: 'fig', type: 'shot', asset: 'capture', width: 600 }],
      },
    };
    const shotBoxes: MeasuredBoxes = {
      blocks: { p: [137, 129, 522.5, 60], fig: [731.5, 129, 600, 338] },
      slots: { left: [137, 129, 522.5, 642], right: [731.5, 129, 731.5, 642] },
      runs: {},
      parts: { fig: [[731.5, 129, 600, 338]] },
    };
    const handles = handlesFor(shots, shotBoxes, { kind: 'block', blockId: 'fig' });
    const width = handle('shot-width', handles);
    const ctx = { slide: shots, boxes: shotBoxes };
    expect(gestureMutation(width, ctx, { x: 1331.5, y: 300 }, { x: 1161.5, y: 300 })).toEqual({
      op: 'block.set',
      slideId: 'shots',
      blockId: 'fig',
      path: '/width',
      value: 425,
    });
    expect(gestureMutation(width, ctx, { x: 1331.5, y: 300 }, { x: 1461.5, y: 300 })).toEqual({
      op: 'block.set',
      slideId: 'shots',
      blockId: 'fig',
      path: '/width',
    });
  });

  it('drags a scales marker to an integer value and swaps pair figures', () => {
    const specimen: Slide = {
      schemaVersion: 1,
      id: 'specimen',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [
          {
            id: 'sc',
            type: 'scales',
            items: [{ left: 'Loud', right: 'Quiet', value: 30 }],
          },
          {
            id: 'pr',
            type: 'pair',
            figures: [
              { assets: ['a'], caption: 'A' },
              { assets: ['b'], caption: 'B' },
            ],
          },
        ],
      },
    };
    const specimenBoxes: MeasuredBoxes = {
      blocks: { sc: [137, 129, 1326, 60], pr: [137, 240, 1326, 400] },
      slots: { main: [137, 129, 1326, 642] },
      runs: {},
      parts: {
        sc: [[300, 158, 500, 1]],
        pr: [
          [137, 240, 649, 400],
          [814, 240, 649, 400],
        ],
      },
    };
    const scaleHandles = handlesFor(specimen, specimenBoxes, { kind: 'block', blockId: 'sc' });
    const marker = handle('scale-marker', scaleHandles);
    expect(marker.box[0] + marker.box[2] / 2).toBe(450);
    const ctx = { slide: specimen, boxes: specimenBoxes };
    expect(gestureMutation(marker, ctx, { x: 450, y: 158 }, { x: 610, y: 170 })).toEqual({
      op: 'block.set',
      slideId: 'specimen',
      blockId: 'sc',
      path: '/items/0/value',
      value: 62,
    });
    const pairHandles = handlesFor(specimen, specimenBoxes, { kind: 'block', blockId: 'pr' });
    const first = pairHandles.find((h) => h.kind === 'pair-swap' && h.index === 0);
    if (!first) throw new Error('no figure handle');
    expect(gestureMutation(first, ctx, { x: 300, y: 400 }, { x: 1000, y: 400 })).toEqual({
      op: 'block.set',
      slideId: 'specimen',
      blockId: 'pr',
      path: '/figures',
      value: [
        { assets: ['b'], caption: 'B' },
        { assets: ['a'], caption: 'A' },
      ],
    });
    expect(gestureMutation(first, ctx, { x: 300, y: 400 }, { x: 400, y: 400 })).toBeNull();
  });
});

describe('nudgeMutation', () => {
  const ctx = { slide, boxes };
  it('steps the key edge through the set and the seam past a named ratio', () => {
    const edge = handle('key-edge', handlesFor(slide, boxes, { kind: 'block', blockId: 'list' }));
    expect(nudgeMutation(edge, ctx, 1)).toMatchObject({ path: '/key', value: 220 });
    expect(nudgeMutation(edge, ctx, -1)).toMatchObject({ path: '/key', value: 190 });
    const seam = handle('col-seam', handlesFor(slide, boxes, null));
    expect(nudgeMutation(seam, ctx, -1)).toMatchObject({
      path: '/layout/ratio',
      value: { left: 500 },
    });
  });

  it('moves a block one position from the keyboard (the round one slot reorder, blockMoveHandle)', () => {
    const chip = blockMoveHandle(slide, boxes, 'h');
    if (!chip) throw new Error('no block-move handle');
    expect(nudgeMutation(chip, ctx, 1)).toEqual({
      op: 'block.move',
      slideId: 'positioning',
      blockId: 'h',
      slot: 'left',
      after: 'p1',
    });
    expect(nudgeMutation(chip, ctx, -1)).toBeNull();
    const second = blockMoveHandle(slide, boxes, 'p1');
    if (!second) throw new Error('no block-move handle');
    expect(nudgeMutation(second, ctx, -1)).toEqual({
      op: 'block.move',
      slideId: 'positioning',
      blockId: 'p1',
      slot: 'left',
    });
  });
});

describe('actionForMutation', () => {
  it('sends a block.set as the block.set action with the base revision', () => {
    expect(
      actionForMutation(
        { op: 'block.set', slideId: 'positioning', blockId: 'list', path: '/key', value: 240 },
        13,
      ),
    ).toEqual({
      id: 'block.set',
      input: {
        slideId: 'positioning',
        blockId: 'list',
        path: '/key',
        value: 240,
        baseRevision: 13,
      },
    });
  });

  it('sends the two multiplayer text ops through slide.update like text.replace (SPEC-3 3.1)', () => {
    const splice = actionForMutation(
      {
        op: 'text.splice',
        slideId: 'p',
        blockId: 'h',
        path: '/text',
        at: 3,
        remove: 0,
        insert: 'ab',
      },
      7,
    );
    expect(splice.id).toBe('slide.update');
    expect(splice.input).toEqual({
      slideId: 'p',
      baseRevision: 7,
      mutations: [
        {
          op: 'text.splice',
          slideId: 'p',
          blockId: 'h',
          path: '/text',
          at: 3,
          remove: 0,
          insert: 'ab',
        },
      ],
    });
    const mark = actionForMutation(
      {
        op: 'text.mark',
        slideId: 'p',
        blockId: 'h',
        path: '/text',
        range: [0, 2],
        edit: { kind: 'marks', set: { i: true } },
      },
      7,
    );
    expect(mark.id).toBe('slide.update');
    expect((mark.input as { mutations: unknown[] }).mutations).toHaveLength(1);
  });

  it('omits an absent value so the action deletes the property', () => {
    expect(
      actionForMutation({ op: 'block.set', slideId: 'shots', blockId: 'fig', path: '/width' }, 2)
        .input,
    ).toEqual({ slideId: 'shots', blockId: 'fig', path: '/width', baseRevision: 2 });
  });

  it('sends a slide.set through slide.update and a block.move as block.move', () => {
    const set = actionForMutation(
      { op: 'slide.set', slideId: 'positioning', path: '/layout/ratio', value: '1/1' },
      13,
    );
    expect(set).toEqual({
      id: 'slide.update',
      input: {
        slideId: 'positioning',
        baseRevision: 13,
        mutations: [
          { op: 'slide.set', slideId: 'positioning', path: '/layout/ratio', value: '1/1' },
        ],
      },
    });
    expect(
      actionForMutation(
        { op: 'block.move', slideId: 'positioning', blockId: 'h', slot: 'left', after: 'p1' },
        13,
      ),
    ).toEqual({
      id: 'block.move',
      input: { slideId: 'positioning', blockId: 'h', slot: 'left', after: 'p1', baseRevision: 13 },
    });
  });
});

describe('sheetPoint', () => {
  it('divides client offsets by k, the stage width over 1600', () => {
    const stage = { left: 100, top: 50, width: 800 };
    expect(sheetPoint(stage, 500, 250)).toEqual({ x: 800, y: 400 });
  });
});

describe('declared diagram labels and markers (SPEC 6.4 Alt-drag, M5)', () => {
  const dia: Slide = {
    schemaVersion: 1,
    id: 'flow',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Flow' }],
      right: [
        {
          id: 'dia1',
          type: 'dia',
          fit: { viewBox: [0, 0, 300, 210] },
          alt: 'A three-step flow',
          data: {
            w: 300,
            h: 210,
            lines: [{ x1: 5.5, y1: 70.5, x2: 294.5, y2: 70.5, stroke: 'ink' }],
            rects: [],
            markers: [
              { x: 5.5, y: 70.5 },
              { x: 150, y: 70.5 },
            ],
            texts: [
              { x: 0, y: 114, text: 'Source', size: 20 },
              { x: 150, y: 114, text: 'Translate', size: 20, anchor: 'middle' },
            ],
            icons: [],
            marks: [],
          },
        },
      ],
    },
  };
  // the dia is drawn at 600 px for its 300 units: one unit is two pixels
  const diaBoxes: MeasuredBoxes = {
    blocks: { h: [137, 129, 522.5, 60], dia1: [731.5, 129, 600, 420] },
    slots: { left: [137, 129, 522.5, 642], right: [731.5, 129, 731.5, 642] },
    runs: {},
    parts: {
      dia1: [
        [731.5, 259, 22, 22],
        [1020.5, 259, 22, 22],
        [731.5, 327, 120, 40],
        [971.5, 327, 120, 40],
      ],
    },
  };

  it('offers Alt-only handles for every marker and label of a selected declared dia', () => {
    const list = handlesFor(dia, diaBoxes, { kind: 'block', blockId: 'dia1' });
    expect(list.map((h) => h.kind)).toEqual([
      'col-seam',
      'free-move',
      ...Array<string>(8).fill('free-resize'),
      'free-rotate',
      'dia-marker',
      'dia-marker',
      'dia-label',
      'dia-label',
    ]);
    const label = list.find((h) => h.kind === 'dia-label');
    expect(label).toMatchObject({
      label: 'dia1: Label 1',
      control: 'handle.dia1.data.texts.0',
      axis: 'xy',
      alt: true,
      shape: 'area',
    });
    expect(handlesFor(slide, boxes, { kind: 'block', blockId: 'list' }).some((h) => h.alt)).toBe(
      false,
    );
  });

  it('moves a label by the drag in diagram units on the half-pixel grid as one block.set', () => {
    const list = handlesFor(dia, diaBoxes, { kind: 'block', blockId: 'dia1' });
    const label = list.filter((h) => h.kind === 'dia-label')[1];
    if (!label) throw new Error('no label handle');
    const ctx = { slide: dia, boxes: diaBoxes };
    // 41 px right and 9 px down at two pixels per unit: 20.5 and 4.5 units
    expect(gestureMutation(label, ctx, { x: 1000, y: 340 }, { x: 1041, y: 349 })).toEqual({
      op: 'block.set',
      slideId: 'flow',
      blockId: 'dia1',
      path: '/data/texts/1',
      value: { x: 170.5, y: 118.5, text: 'Translate', size: 20, anchor: 'middle' },
    });
    expect(gestureMutation(label, ctx, { x: 1000, y: 340 }, { x: 1000.4, y: 340 })).toBeNull();
    const marker = list.find((h) => h.kind === 'dia-marker');
    if (!marker) throw new Error('no marker handle');
    expect(gestureMutation(marker, ctx, { x: 742, y: 270 }, { x: 762, y: 270 })).toEqual({
      op: 'block.set',
      slideId: 'flow',
      blockId: 'dia1',
      path: '/data/markers/0',
      value: { x: 15.5, y: 70.5 },
    });
  });

  it('nudges on both axes from the keyboard and shows the clearance ring', () => {
    const list = handlesFor(dia, diaBoxes, { kind: 'block', blockId: 'dia1' });
    const label = list.find((h) => h.kind === 'dia-label');
    if (!label) throw new Error('no label handle');
    const ctx = { slide: dia, boxes: diaBoxes };
    expect(nudgeMutation(label, ctx, 1, 'x')).toMatchObject({
      path: '/data/texts/0',
      value: { x: 1, y: 114 },
    });
    expect(nudgeMutation(label, ctx, 10, 'y')).toMatchObject({ value: { x: 0, y: 104 } });
    const ring = labelClearanceBox(dia, label, diaBoxes);
    if (!ring) throw new Error('no clearance');
    expect(ring.ok).toBe(true);
    // the label box in units [0, 99, 62.4, 20] at two pixels per unit from the block origin
    expect(ring.box.map((v) => Math.round(v * 100) / 100)).toEqual([731.5, 129 + 198, 124.8, 40]);
    // a label moved onto the line loses its clearance
    const moved = applyMutations(
      {
        deck: {
          schemaVersion: 1,
          id: 'fixture',
          title: 'Fixture',
          theme: 'gt-ink-paper',
          sections: [{ id: 'one', name: 'One', slideIds: ['flow'] }],
          assets: {},
          revision: 1,
          createdAt: '2026-09-10T00:00:00.000Z',
          updatedAt: '2026-09-10T00:00:00.000Z',
        },
        slides: { flow: dia },
      },
      [{ op: 'block.set', slideId: 'flow', blockId: 'dia1', path: '/data/texts/0/y', value: 80 }],
    ).document.slides.flow;
    if (!moved) throw new Error('no slide');
    expect(labelClearanceBox(moved, label, diaBoxes)?.ok).toBe(false);
  });
});

describe('dropIndexFor and dropSlotFor', () => {
  it('lands before the first sibling whose center is below the pointer, else after the last', () => {
    const list: MeasuredBoxes['blocks'] = { a: [137, 100, 500, 40], b: [137, 200, 500, 40] };
    expect(dropIndexFor(90, ['a', 'b'], list)).toEqual({ index: 0, lineY: 100 - 11 });
    expect(dropIndexFor(150, ['a', 'b'], list)).toEqual({ index: 1, lineY: 200 - 11 });
    expect(dropIndexFor(300, ['a', 'b'], list)).toEqual({ index: 2, lineY: 240 + 11 });
    // an empty slot: the line sits at the slot's top
    expect(dropIndexFor(300, [], list)).toEqual({ index: 0, lineY: null });
    // a sibling without a measured box is skipped
    expect(dropIndexFor(150, ['zzz', 'b'], list)).toEqual({ index: 1, lineY: 200 - 11 });
  });

  it('names the target slot of cols by the gap half and of split by the pointer', () => {
    expect(dropSlotFor(slide, 'left', { x: 900, y: 300 }, boxes)).toBe('right');
    expect(dropSlotFor(slide, 'right', { x: 300, y: 300 }, boxes)).toBe('left');
    const split: Slide = {
      schemaVersion: 1,
      id: 'split',
      kind: 'content',
      layout: { type: 'split', head: { cols: '5/7' } },
      slots: {
        headLeft: [{ id: 'h', type: 'heading', level: 'h2', text: 'Head' }],
        headRight: [{ id: 'p', type: 'paragraph', text: 'Lead.' }],
        body: [{ id: 'rows', type: 'rows', key: 200, items: [] }],
      },
    };
    const splitBoxes: MeasuredBoxes = {
      blocks: { h: [137, 129, 522.5, 60], p: [731.5, 129, 731.5, 60], rows: [137, 300, 1326, 200] },
      slots: { head: [137, 129, 1326, 60], body: [137, 245, 1326, 526] },
      runs: {},
      parts: {},
    };
    expect(dropSlotFor(split, 'body', { x: 300, y: 150 }, splitBoxes)).toBe('headLeft');
    expect(dropSlotFor(split, 'body', { x: 900, y: 150 }, splitBoxes)).toBe('headRight');
    expect(dropSlotFor(split, 'headLeft', { x: 300, y: 500 }, splitBoxes)).toBe('body');
    const { mutation, slot, slotBox } = blockMoveFor(split, 'h', { x: 300, y: 500 }, splitBoxes);
    expect(slot).toBe('body');
    expect(slotBox).toEqual([137, 245, 1326, 526]);
    expect(mutation).toEqual({
      op: 'block.move',
      slideId: 'split',
      blockId: 'h',
      slot: 'body',
      after: 'rows',
    });
    // a stack keeps its one slot wherever the pointer is
    const stack: Slide = { ...split, layout: { type: 'stack' }, slots: { main: [] } };
    expect(dropSlotFor(stack, 'main', { x: 1500, y: 880 }, splitBoxes)).toBe('main');
  });

  it('reports the outlined slot beside the drop line on a cols slide', () => {
    const across = blockMoveFor(slide, 'h', { x: 900, y: 150 }, boxes);
    expect(across.slot).toBe('right');
    expect(across.slotBox).toEqual([731.5, 129, 731.5, 642]);
    expect(across.indicator).toEqual([731.5, 129 - 11, 731.5, 0]);
  });
});

describe('actionForMutations', () => {
  it('sends one mutation as its own action and several as one slide.update', () => {
    const one = {
      op: 'block.set',
      slideId: 'positioning',
      blockId: 'list',
      path: '/key',
      value: 240,
    } as const;
    expect(actionForMutations([one], 13)).toEqual(actionForMutation(one, 13));
    const two = { op: 'block.remove', slideId: 'positioning', blockId: 'p1' } as const;
    expect(actionForMutations([one, two], 13)).toEqual({
      id: 'slide.update',
      input: { slideId: 'positioning', baseRevision: 13, mutations: [one, two] },
    });
    const elsewhere = { op: 'block.remove', slideId: 'other', blockId: 'x' } as const;
    expect(() => actionForMutations([one, elsewhere], 13)).toThrow(RangeError);
  });
});

// The draw tools (gslides-parity SPEC 3.1 rows 9 to 12): a click places the default box, a drag
// draws one; the insert is one block.insert with pos on a freeform slide and into the slot on a
// grammar slide.
describe('draw tools', () => {
  const free: Slide = {
    schemaVersion: 1,
    id: 'free',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        { id: 'a', type: 'paragraph', text: 'A', pos: { x: 200, y: 200, w: 300, h: 100, z: 2 } },
      ],
    },
  };

  it('places the default box on a click and the drawn box on a drag', () => {
    expect(drawnBox({ kind: 'text' }, { x: 300, y: 300 }, { x: 303, y: 302 })).toEqual({
      box: [300, 300, 480, 64],
      dragged: false,
    });
    expect(
      drawnBox({ kind: 'shape', shape: 'ellipse' }, { x: 300, y: 300 }, { x: 100, y: 500 }),
    ).toEqual({
      box: [100, 300, 200, 200],
      dragged: true,
    });
    expect(TOOL_DEFAULT_SIZE.line).toEqual([320, 8]);
  });

  it('inserts on the 8 px grid on top of a freeform stack, and into the slot on a grammar slide', () => {
    const onFree = toolInsertMutation(free, { kind: 'text' }, 'text', [301, 299, 480, 64], 'main');
    expect(onFree).toEqual({
      op: 'block.insert',
      slideId: 'free',
      slot: 'main',
      after: 'a',
      /* a new text box inserts with autofit grow (gslides-parity SPEC-2 6.2 Autofit) */
      block: {
        id: 'text',
        type: 'text',
        text: '',
        autofit: 'grow',
        pos: { x: 304, y: 296, w: 480, h: 64, z: 3 },
      },
    });
    const onGrammar = toolInsertMutation(
      slide,
      { kind: 'shape', shape: 'rectangle' },
      'shape',
      [0, 0, 240, 160],
      'left',
      'h',
    );
    expect(onGrammar).toEqual({
      op: 'block.insert',
      slideId: 'positioning',
      slot: 'left',
      after: 'h',
      block: { id: 'shape', type: 'shape', shape: 'rectangle' },
    });
    expect(toolBlockType({ kind: 'line', line: 'rule' })).toBe('rule');
    expect(toolBlockType({ kind: 'line', line: 'arrow' })).toBe('shape');
    expect(toolInsertMutation(slide, { kind: 'text' }, 't', [0, 0, 1, 1], null)).toBeNull();
    /* every insert applies through the reducer */
    const doc: DeckDocument = {
      deck: {
        schemaVersion: 1,
        id: 'd',
        title: 'd',
        theme: 'gt-ink-paper',
        sections: [{ id: 's', name: 's', slideIds: ['free'] }],
        assets: {},
        revision: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      slides: { free },
    };
    const after = applyMutations(doc, [onFree!]).document.slides['free'];
    expect(after?.kind === 'content' && after.slots.main?.length).toBe(2);
  });
});
