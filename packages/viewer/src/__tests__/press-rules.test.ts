// The click model of the canvas (docs/gslides-parity/focus/AMENDMENTS.md A1; Kevin, 2026-09-16:
// "when you click and drag in the selection area, it should drag, and double clicking is what
// goes inside"): what a pointer down on the sheet does before any state changes, for every object
// kind, text boxes and placeholders included, and the chip geometry that makes the whole area of
// an object, or of a multi selection's union, the surface the drag starts from.
import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';

import { isObjectId } from '../Freeform';
import { EMPTY_BOXES, handlesFor } from '../Gestures';
import type { MeasuredBoxes } from '../Gestures';
import { objectPressPlan, selectionOf } from '../Selection';

// A canvas with two text boxes, a picture and a shape, the boxes as the stage measures them.
const free: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      { id: 't1', type: 'text', text: 'One', pos: { x: 100, y: 100, w: 400, h: 80, z: 0 } },
      { id: 't2', type: 'text', text: 'Two', pos: { x: 700, y: 300, w: 400, h: 80, z: 1 } },
      { id: 'pic', type: 'shot', asset: 'a1', pos: { x: 200, y: 500, w: 320, h: 180, z: 2 } },
      {
        id: 'sq',
        type: 'shape',
        shape: 'rectangle',
        text: '',
        pos: { x: 900, y: 600, w: 200, h: 120, z: 3 },
      },
    ],
  },
} as Slide;

const boxes: MeasuredBoxes = {
  blocks: {
    t1: [100, 100, 400, 80],
    t2: [700, 300, 400, 80],
    pic: [200, 500, 320, 180],
    sq: [900, 600, 200, 120],
  },
  slots: {},
  runs: {},
  parts: {},
};

// The title slide: the heading and the lead are placeholders drawn as pseudo blocks (Selection
// blockTypeOf), objects by isObjectId, so the same rule reaches "Click to add title".
const title: Slide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'General Translation',
  lead: 'This deck covers the brand.',
};

const editing = { modifier: false, editable: true, paint: false, grouped: false, object: true };

describe('objectPressPlan (A1 rules 1 and 2: one click selects, a press inside a selected object drags)', () => {
  it('starts a marquee on the empty sheet, whatever the modifiers or the paint tool', () => {
    expect(objectPressPlan({ ...editing, under: null, selected: [] })).toEqual({
      action: 'marquee',
    });
    expect(objectPressPlan({ ...editing, under: null, selected: ['t1'], modifier: true })).toEqual({
      action: 'marquee',
    });
    expect(objectPressPlan({ ...editing, under: null, selected: ['t1'], paint: true })).toEqual({
      action: 'marquee',
    });
  });

  it('selects an unselected text box and arms the drag in the same press', () => {
    expect(objectPressPlan({ ...editing, under: 't1', selected: [] })).toEqual({
      action: 'press',
      blockId: 't1',
      select: true,
      drag: true,
    });
    expect(objectPressPlan({ ...editing, under: 't1', selected: ['t2'] })).toEqual({
      action: 'press',
      blockId: 't1',
      select: true,
      drag: true,
    });
  });

  it('keeps a selected text box selected and arms the drag from anywhere inside it, with no caret', () => {
    const plan = objectPressPlan({ ...editing, under: 't1', selected: ['t1'] });
    expect(plan).toEqual({ action: 'press', blockId: 't1', select: false, drag: true });
    /* the plan never names a run or a caret: the session is the double click's, Enter's or a
       typed character's (InlineText clickEntry, entryCaret) */
    expect(Object.keys(plan)).toEqual(['action', 'blockId', 'select', 'drag']);
  });

  it('keeps a multiple selection whole on a press inside any of its members and arms the drag', () => {
    for (const under of ['t1', 't2', 'pic'] as const) {
      expect(objectPressPlan({ ...editing, under, selected: ['t1', 't2', 'pic'] })).toEqual({
        action: 'press',
        blockId: under,
        select: false,
        drag: true,
      });
    }
  });

  it('treats a picture and a shape as it treats a text box', () => {
    expect(objectPressPlan({ ...editing, under: 'pic', selected: ['pic'] })).toEqual({
      action: 'press',
      blockId: 'pic',
      select: false,
      drag: true,
    });
    expect(objectPressPlan({ ...editing, under: 'sq', selected: [] })).toEqual({
      action: 'press',
      blockId: 'sq',
      select: true,
      drag: true,
    });
  });

  it('reaches the title and subtitle placeholders: objects by isObjectId, so the press arms the drag', () => {
    for (const id of ['heading', 'lead']) {
      const object = isObjectId(title, EMPTY_BOXES, id);
      expect(object).toBe(true);
      expect(objectPressPlan({ ...editing, under: id, selected: [id], object })).toEqual({
        action: 'press',
        blockId: id,
        select: false,
        drag: true,
      });
    }
    /* the title's mark is an object only once the stage measured it */
    expect(isObjectId(title, EMPTY_BOXES, 'mark')).toBe(false);
    expect(isObjectId(title, { ...EMPTY_BOXES, blocks: { mark: [80, 80, 132, 84] } }, 'mark')).toBe(
      true,
    );
  });

  it('arms no drag on an id the stage has not measured as an object', () => {
    expect(objectPressPlan({ ...editing, under: 'ghost', selected: [], object: false })).toEqual({
      action: 'press',
      blockId: 'ghost',
      select: true,
      drag: false,
    });
  });

  it('toggles membership on a Shift or Cmd press, selected or not (SPEC-2 6.1 row 2)', () => {
    expect(objectPressPlan({ ...editing, under: 't2', selected: ['t1'], modifier: true })).toEqual({
      action: 'toggle',
      blockId: 't2',
    });
    expect(
      objectPressPlan({ ...editing, under: 't2', selected: ['t1', 't2'], modifier: true }),
    ).toEqual({ action: 'toggle', blockId: 't2' });
    /* the modifier wins in Commenting and Viewing mode too, as before the amendment */
    expect(
      objectPressPlan({ ...editing, under: 't2', selected: [], modifier: true, editable: false }),
    ).toEqual({ action: 'toggle', blockId: 't2' });
  });

  it('paints when the paint format tool is armed, before the modifiers (SPEC 3.1 row 6)', () => {
    expect(objectPressPlan({ ...editing, under: 't1', selected: ['t1'], paint: true })).toEqual({
      action: 'paint',
      blockId: 't1',
    });
    expect(
      objectPressPlan({ ...editing, under: 't1', selected: [], paint: true, modifier: true }),
    ).toEqual({ action: 'paint', blockId: 't1' });
  });

  it('selects a group through an unentered member alone and keeps an entered member as it is (SPEC-2 6.1 row 14)', () => {
    /* the member stands alone in the selection and the group has not been entered: the press
       re-selects, which selectObjects expands to the whole group, so the drag moves it whole */
    expect(objectPressPlan({ ...editing, under: 'g1', selected: ['g1'], grouped: true })).toEqual({
      action: 'press',
      blockId: 'g1',
      select: true,
      drag: true,
    });
    /* the group is already selected whole: the press keeps it and arms the drag */
    expect(
      objectPressPlan({ ...editing, under: 'g1', selected: ['g1', 'g2'], grouped: true }),
    ).toEqual({ action: 'press', blockId: 'g1', select: false, drag: true });
    /* the member was entered by a double click (grouped false): a plain selected object */
    expect(objectPressPlan({ ...editing, under: 'g1', selected: ['g1'] })).toEqual({
      action: 'press',
      blockId: 'g1',
      select: false,
      drag: true,
    });
  });

  it('selects for a comment anchor and never drags in Commenting and Viewing mode (SPEC-3 5.3, 6.3)', () => {
    expect(objectPressPlan({ ...editing, under: 't1', selected: [], editable: false })).toEqual({
      action: 'press',
      blockId: 't1',
      select: true,
      drag: false,
    });
    expect(objectPressPlan({ ...editing, under: 't1', selected: ['t1'], editable: false })).toEqual(
      {
        action: 'press',
        blockId: 't1',
        select: false,
        drag: false,
      },
    );
  });
});

describe('the chip the press arms (Editor armPress, chipHandleFor): the whole area is the drag surface', () => {
  it('covers the whole box of one selected text box, not its border alone', () => {
    const chip = handlesFor(free, boxes, { kind: 'block', blockId: 't1' }).find(
      (h) => h.shape === 'chip',
    );
    expect(chip).toBeDefined();
    expect(chip?.kind).toBe('free-move');
    expect(chip?.box).toEqual([100, 100, 400, 80]);
    expect(chip?.cursor).toBe('move');
  });

  it('covers the union of a multi selection from a press inside any member (A1 rule 2)', () => {
    const { selection, extra } = selectionOf(['t2', 't1']);
    const ids = [selection && selection.blockId, ...extra].filter(
      (id): id is string => id !== null,
    );
    const chip = handlesFor(free, boxes, selection, { ids }).find((h) => h.shape === 'chip');
    expect(chip?.kind).toBe('free-move');
    /* t1 at 100,100 400 by 80 and t2 at 700,300 400 by 80: the union is 100,100 to 1100,380 */
    expect(chip?.box).toEqual([100, 100, 1000, 280]);
    /* the union chip stands for every member, whichever one the press landed on */
    const fromT1 = handlesFor(free, boxes, { kind: 'block', blockId: 't1' }, { ids: ['t1', 't2'] });
    expect(fromT1.find((h) => h.shape === 'chip')?.box).toEqual([100, 100, 1000, 280]);
    /* a multi selection draws the union's handles alone, no per type handle of the anchor */
    expect(fromT1.filter((h) => h.kind === 'free-resize')).toHaveLength(8);
  });

  it('covers a picture and a shape the same way', () => {
    for (const [id, box] of [
      ['pic', [200, 500, 320, 180]],
      ['sq', [900, 600, 200, 120]],
    ] as const) {
      const chip = handlesFor(free, boxes, { kind: 'block', blockId: id }).find(
        (h) => h.shape === 'chip',
      );
      expect(chip?.box).toEqual(box);
    }
  });
});

describe('objectPressPlan on a table (docs/FEATURES.md 2.1: A1 rules 1 and 3 amended for tables alone)', () => {
  const cell = { row: 1, col: 2 };

  it('selects an unselected table, arms its drag and names the pressed cell for the tap', () => {
    expect(objectPressPlan({ ...editing, under: 'tbl', selected: [], cell })).toEqual({
      action: 'press',
      blockId: 'tbl',
      select: true,
      drag: true,
      caret: cell,
    });
    /* another object selected: the table joins alone and the tap still places the caret */
    expect(objectPressPlan({ ...editing, under: 'tbl', selected: ['t1'], cell })).toEqual({
      action: 'press',
      blockId: 'tbl',
      select: true,
      drag: true,
      caret: cell,
    });
  });

  it('on the one selected table a press in a cell arms a range and never the move, and a tap moves the caret', () => {
    expect(objectPressPlan({ ...editing, under: 'tbl', selected: ['tbl'], cell })).toEqual({
      action: 'press',
      blockId: 'tbl',
      select: false,
      drag: false,
      caret: cell,
      range: true,
    });
  });

  it('keeps A1 as written for a table in a multiple selection, in a group, with a modifier or outside a cell', () => {
    expect(objectPressPlan({ ...editing, under: 'tbl', selected: ['tbl', 't1'], cell })).toEqual({
      action: 'press',
      blockId: 'tbl',
      select: false,
      drag: true,
    });
    expect(
      objectPressPlan({ ...editing, under: 'tbl', selected: ['g1'], grouped: true, cell }),
    ).toEqual({ action: 'press', blockId: 'tbl', select: true, drag: true });
    expect(
      objectPressPlan({ ...editing, under: 'tbl', selected: ['tbl'], modifier: true, cell }),
    ).toEqual({ action: 'toggle', blockId: 'tbl' });
    expect(objectPressPlan({ ...editing, under: 'tbl', selected: ['tbl'], cell: null })).toEqual({
      action: 'press',
      blockId: 'tbl',
      select: false,
      drag: true,
    });
    /* Commenting and Viewing mode: a selection for a comment's anchor, no caret and no drag */
    expect(
      objectPressPlan({ ...editing, under: 'tbl', selected: [], editable: false, cell }),
    ).toEqual({ action: 'press', blockId: 'tbl', select: true, drag: false });
  });
});
