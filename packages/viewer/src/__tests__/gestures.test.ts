import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';

import {
  actionForMutation,
  blockMoveFor,
  gestureMutation,
  handlesFor,
  nudgeMutation,
  sheetPoint,
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
    const selected = handlesFor(slide, boxes, { kind: 'block', blockId: 'list' });
    expect(selected.map((h) => h.kind)).toEqual(['col-seam', 'block-move', 'key-edge']);
    const edge = handle('key-edge', selected);
    expect(edge.box[0] + edge.box[2] / 2).toBe(731.5 + 200);
    expect(edge.label).toBe('list: Key column edge');
    expect(edge.control).toBe('handle.list.key');
  });

  it('gives a heading no property handle beyond its chip', () => {
    const forHeading = handlesFor(slide, boxes, { kind: 'block', blockId: 'h' });
    expect(forHeading.map((h) => h.kind)).toEqual(['col-seam', 'block-move']);
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

  it('moves a block one position from the keyboard', () => {
    const chip = handle('block-move', handlesFor(slide, boxes, { kind: 'block', blockId: 'h' }));
    expect(nudgeMutation(chip, ctx, 1)).toEqual({
      op: 'block.move',
      slideId: 'positioning',
      blockId: 'h',
      slot: 'left',
      after: 'p1',
    });
    expect(nudgeMutation(chip, ctx, -1)).toBeNull();
    const second = handle('block-move', handlesFor(slide, boxes, { kind: 'block', blockId: 'p1' }));
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
