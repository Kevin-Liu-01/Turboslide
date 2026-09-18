// @vitest-environment jsdom
// The objects lane of the focus round (docs/FOCUS.md sections 4 and 5): a fresh closed shape
// carries its look and an empty run, a dropped picture's box takes the asset's aspect, the stage
// owns a clipboard event whenever no field, dialog, menu or panel does, the sheet's centre line
// outranks a nearer plate edge in the snap, and an align lands on the extreme object.
import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';
import { validateDocument } from '@turboslide/schema/validate';

import {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  droppedPictureBox,
  toolBlock,
  toolInsertMutation,
} from '../Gestures';
import { stageOwnsClipboard } from '../Selection';
import {
  FREE_SNAP_PX,
  boxSnapLines,
  isSheetCentreLine,
  sheetEdgeLines,
  sheetSnapLines,
  snapMove,
} from '../snap';

const free: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [] },
};

function documentOf(slide: Slide): DeckDocument {
  return {
    deck: {
      schemaVersion: 1,
      id: 'focus',
      title: 'Focus',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: [slide.id] }],
      assets: {},
      revision: 1,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
    slides: { [slide.id]: slide },
  };
}

describe('a fresh shape (FOCUS.md section 4: shapes.default-look, shapes.text.type-align-bold)', () => {
  it('carries the plate fill, the ink stroke and an empty text run for every closed kind', () => {
    for (const shape of ['rectangle', 'rounded', 'ellipse'] as const) {
      expect(toolBlock({ kind: 'shape', shape }, 's')).toEqual({
        id: 's',
        type: 'shape',
        shape,
        fill: SHAPE_DEFAULT_FILL,
        stroke: SHAPE_DEFAULT_STROKE,
        text: '',
      });
    }
    expect(SHAPE_DEFAULT_FILL).toBe('plate');
    expect(SHAPE_DEFAULT_STROKE).toBe('ink');
  });

  it('leaves a line kind bare: the renderer’s ink stroke, no fill, no text', () => {
    expect(toolBlock({ kind: 'line', line: 'line' }, 'l')).toEqual({
      id: 'l',
      type: 'shape',
      shape: 'line',
    });
    expect(toolBlock({ kind: 'line', line: 'arrow' }, 'a')).toEqual({
      id: 'a',
      type: 'shape',
      shape: 'arrow',
    });
  });

  it('inserts through the reducer and validates', () => {
    const mutation = toolInsertMutation(
      free,
      { kind: 'shape', shape: 'rounded' },
      'shape',
      [40, 60, 240, 160],
      'main',
    );
    expect(mutation).toMatchObject({
      op: 'block.insert',
      block: {
        id: 'shape',
        type: 'shape',
        shape: 'rounded',
        fill: 'plate',
        stroke: 'ink',
        text: '',
        pos: { x: 40, y: 64, w: 240, h: 160, z: 1 },
      },
    });
    const after = applyMutations(documentOf(free), [mutation!]).document;
    const validation = validateDocument(after);
    expect(validation.issues.filter((issue) => issue.severity === 3)).toEqual([]);
    const slide = after.slides['free'];
    expect(slide?.kind === 'content' && slide.slots.main?.[0]?.type).toBe('shape');
  });
});

describe('the box of a dropped picture (FOCUS.md rank 18)', () => {
  it('takes the asset’s aspect at the drop width, on the 8 px grid', () => {
    expect(droppedPictureBox({ x: 1003, y: 557 }, 480, [640, 400])).toEqual([1000, 560, 480, 300]);
    expect(droppedPictureBox({ x: 0, y: 0 }, 480, [1600, 900])).toEqual([0, 0, 480, 270]);
    expect(droppedPictureBox({ x: 0, y: 0 }, 480, [400, 400])).toEqual([0, 0, 480, 480]);
  });

  it('falls back to 16 by 9 without a size and never drops under 8 px', () => {
    expect(droppedPictureBox({ x: 0, y: 0 }, 480, undefined)).toEqual([0, 0, 480, 270]);
    expect(droppedPictureBox({ x: 0, y: 0 }, 480, [0, 0])).toEqual([0, 0, 480, 270]);
    expect(droppedPictureBox({ x: 0, y: 0 }, 480, [4000, 1])).toEqual([0, 0, 480, 8]);
  });
});

describe('the stage owns the clipboard (FOCUS.md rank 15: paste after New slide, paste with the filmstrip focused)', () => {
  const build = (html: string) => {
    document.body.innerHTML = html;
    return document.querySelector<HTMLElement>('.ts-stage');
  };

  it('takes the event from the body, the stage, a toolbar button and a filmstrip card', () => {
    const stage = build(`
      <div class="ts-toolbar" role="toolbar"><button data-control="toolbar.newSlide">New</button></div>
      <div role="listbox" class="ts-filmstrip"><div class="ts-card" role="option" tabindex="0">1</div></div>
      <div class="ts-stage"><section class="slide"><div class="free"></div></section></div>
    `);
    expect(stageOwnsClipboard(document.body, stage, false)).toBe(true);
    expect(stageOwnsClipboard(document.querySelector('.free'), stage, false)).toBe(true);
    expect(stageOwnsClipboard(document.querySelector('button'), stage, false)).toBe(true);
    expect(stageOwnsClipboard(document.querySelector('.ts-card'), stage, false)).toBe(true);
    expect(stageOwnsClipboard(null, stage, false)).toBe(true);
  });

  it('leaves the event to a field, an editable region, an open text session, a dialog, a menu and the Format options panel', () => {
    const stage = build(`
      <div role="dialog"><button>Cancel</button></div>
      <div role="menu"><div role="menuitem" tabindex="0">Paste</div></div>
      <div class="ts-inspector"><button>Fill</button></div>
      <input id="field" /><textarea id="notes"></textarea>
      <div class="ts-stage"><p contenteditable="true" id="run">Run</p></div>
    `);
    expect(stageOwnsClipboard(document.querySelector('[role="dialog"] button'), stage, false)).toBe(
      false,
    );
    expect(stageOwnsClipboard(document.querySelector('[role="menuitem"]'), stage, false)).toBe(
      false,
    );
    expect(stageOwnsClipboard(document.querySelector('.ts-inspector button'), stage, false)).toBe(
      false,
    );
    expect(stageOwnsClipboard(document.getElementById('field'), stage, false)).toBe(false);
    expect(stageOwnsClipboard(document.getElementById('notes'), stage, false)).toBe(false);
    // jsdom does not compute isContentEditable from the attribute; the flag stands for the session
    expect(stageOwnsClipboard(document.body, stage, true)).toBe(false);
  });

  it('keeps an element inside the stage even when it sits in a region the chrome would keep', () => {
    const stage = build(
      `<div class="ts-stage"><div role="dialog"><button id="inner">In</button></div></div>`,
    );
    expect(stageOwnsClipboard(document.getElementById('inner'), stage, false)).toBe(true);
  });
});

describe('the sheet’s centre line in the snap (FOCUS.md rank 33: images.guides.centre-x)', () => {
  const lines = [...sheetEdgeLines(), ...sheetSnapLines()];

  it('names the two centre lines and nothing else', () => {
    expect(lines.filter(isSheetCentreLine).map((line) => [line.axis, line.at])).toEqual([
      ['x', 800],
      ['y', 450],
    ]);
  });

  it('centres a picture aimed 3 px off the slide’s centre where its right edge touches the mood plate edge', () => {
    // audit-images row 16: a 200 by 125 picture whose centre aimed at 803 landed at 803, because
    // its right edge at 903 sat on the mood plate edge (903) with a smaller correction than the 3
    // px the centre needed
    const result = snapMove([200, 700, 200, 125], 503, 0, lines, { grid: false });
    expect(result.box).toEqual([700, 700, 200, 125]);
    expect(result.guides.some((guide) => guide.axis === 'x' && guide.at === 800)).toBe(true);
  });

  it('centres a wider picture aimed 3 px off where a column edge is nearer', () => {
    // audit-images row 16, run 6: a 480 by 300 picture aimed at 803 landed at 805
    const result = snapMove([0, 300, 480, 300], 563, 0, lines, { grid: false });
    expect(result.box).toEqual([560, 300, 480, 300]);
  });

  it('still takes the nearest other line when the centre is out of range', () => {
    // the moving box's right edge lands on the other's left edge (700) and its top on the other's top
    const other = [700, 300, 100, 100] as const;
    const result = snapMove([0, 296, 100, 100], 598, 0, boxSnapLines(other), { grid: false });
    expect(result.box).toEqual([600, 300, 100, 100]);
    expect(FREE_SNAP_PX).toBe(6);
  });
});
