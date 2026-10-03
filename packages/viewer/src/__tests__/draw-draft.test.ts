import { describe, expect, it } from 'vitest';

import { tableBoxHeight } from '@turboslide/schema/blocks/table';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';
import { validateDocument } from '@turboslide/schema/validate';

import {
  DRAW_MIN_PX,
  drawDraftMutation,
  drawnBox,
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  TOOL_DEFAULT_SIZE,
  toolDefaultSize,
  toolInsertMutation,
} from '../Gestures';
import type { EditorTool } from '../Gestures';

// The draw's draft (docs/archive/rounds/OBJECTS.md 2.4; the objects round, B1): the press builds the same
// block.insert the release commits, at the tool's default box while the pointer has not
// travelled DRAW_MIN_PX and at the drawn box after, so the sheet draws a shape as it grows from
// the press point, a table or a chart whole from the pointer down, and a connector snapped to the
// sites under the drag's ends at every frame.

const free: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'a',
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        text: '',
        pos: { x: 200, y: 200, w: 240, h: 160, z: 1 },
      },
    ],
  },
};

const grammar: Slide = {
  schemaVersion: 1,
  id: 'grammar',
  kind: 'content',
  layout: { type: 'stack' },
  slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'Heading' }] },
};

function documentOf(slide: Slide): DeckDocument {
  return {
    deck: {
      schemaVersion: 1,
      id: 'objects',
      title: 'Objects',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: [slide.id] }],
      assets: {},
      revision: 1,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    },
    slides: { [slide.id]: slide },
  };
}

const press = { x: 300, y: 300 };

/** The draft at a pointer position: drawnBox decides the box and the verdict, the way the Editor's armDraw does. */
function draftAt(tool: Exclude<EditorTool, 'select'>, id: string, now: { x: number; y: number }) {
  const drawn = drawnBox(tool, press, now);
  return drawDraftMutation(free, tool, id, drawn.box, {
    grid: false,
    dragged: drawn.dragged,
    start: press,
    end: drawn.dragged ? now : { x: press.x + drawn.box[2], y: press.y + drawn.box[3] / 2 },
  });
}

function blockOf(mutation: ReturnType<typeof drawDraftMutation>) {
  if (!mutation || mutation.op !== 'block.insert') throw new Error('no insert');
  return mutation.block;
}

describe('drawDraftMutation', () => {
  it('answers the default box at the press and the drawn box after the threshold, for a shape with the grammar default fill', () => {
    const tool: EditorTool = { kind: 'shape', shape: 'hexagon' };
    const atPress = blockOf(draftAt(tool, 'shape', press));
    expect(atPress).toEqual({
      id: 'shape',
      type: 'shape',
      shape: 'hexagon',
      fill: SHAPE_DEFAULT_FILL,
      stroke: SHAPE_DEFAULT_STROKE,
      text: '',
      pos: { x: 300, y: 300, w: TOOL_DEFAULT_SIZE.shape[0], h: TOOL_DEFAULT_SIZE.shape[1], z: 2 },
    });
    /* under the threshold the default box still stands, at the press point */
    const underThreshold = blockOf(
      draftAt(tool, 'shape', { x: press.x + DRAW_MIN_PX - 1, y: press.y + 3 }),
    );
    expect(underThreshold.pos).toEqual(atPress.pos);
    /* past it the drawn box, growing with the pointer */
    const step5 = blockOf(draftAt(tool, 'shape', { x: 433, y: 383 }));
    expect(step5.pos).toEqual({ x: 300, y: 300, w: 133, h: 83, z: 2 });
    const step12 = blockOf(draftAt(tool, 'shape', { x: 620, y: 500 }));
    expect(step12.pos).toEqual({ x: 300, y: 300, w: 320, h: 200, z: 2 });
    /* the block is the same but for its box: no adjust is written, so the preset's defaults apply */
    const { pos: _a, ...restPress } = atPress;
    const { pos: _b, ...rest12 } = step12;
    expect(rest12).toEqual(restPress);
    expect('adjust' in step12).toBe(false);
  });

  it('is the same block the release commits (toolInsertMutation with the same id and box)', () => {
    for (const tool of [
      { kind: 'shape', shape: 'ellipse' },
      { kind: 'text' },
      { kind: 'table', columns: 3, rows: 3 },
      { kind: 'chart', chart: 'column' },
    ] as const) {
      const draft = draftAt(tool, 'new', { x: 620, y: 500 });
      const release = toolInsertMutation(
        free,
        tool,
        'new',
        [300, 300, 320, 200],
        'main',
        undefined,
        {
          grid: false,
        },
      );
      expect(draft).toEqual(release);
    }
  });

  it('previews a text box as its frame alone, and a table or a chart whole at the default size from the press', () => {
    const text = blockOf(draftAt({ kind: 'text' }, 'text', press));
    expect(text).toEqual({
      id: 'text',
      type: 'text',
      text: '',
      autofit: 'grow',
      pos: { x: 300, y: 300, w: 480, h: 64, z: 2 },
    });
    const table = blockOf(draftAt({ kind: 'table', columns: 3, rows: 3 }, 'table', press));
    expect(table.type).toBe('table');
    if (table.type !== 'table') throw new Error('table');
    expect(table.rows).toHaveLength(3);
    expect(table.columns).toHaveLength(3);
    /* the placed table's box fits its rows (docs/archive/rounds/OBJECTS.md 3.3 item 3; build/b2.md request 1g):
       three rows at 20 px with the hairline, 163, never the 320 of TOOL_DEFAULT_SIZE */
    expect(table.pos).toEqual({ x: 300, y: 300, w: 960, h: tableBoxHeight(3), z: 2 });
    expect(tableBoxHeight(3)).toBe(163);
    expect(toolDefaultSize({ kind: 'table', columns: 5, rows: 5 })).toEqual([960, 271]);
    const chart = blockOf(draftAt({ kind: 'chart', chart: 'column' }, 'chart', press));
    expect(chart.type).toBe('chart');
    if (chart.type !== 'chart') throw new Error('chart');
    expect(chart.kind).toBe('column');
    expect(chart.pos).toEqual({ x: 300, y: 300, w: 960, h: 540, z: 2 });
  });

  it('snaps a connector kind to the sites under the drag ends, at the press and at every step', () => {
    const tool: EditorTool = { kind: 'line', line: 'elbow' };
    /* the rectangle's right site is at (440, 280); the drag starts on it and ends away */
    const start = { x: 441, y: 281 };
    const drawn = drawnBox(tool, start, { x: 700, y: 420 });
    const draft = drawDraftMutation(free, tool, 'elbow', drawn.box, {
      grid: false,
      dragged: drawn.dragged,
      start,
      end: { x: 700, y: 420 },
    });
    const block = blockOf(draft);
    expect(block.type).toBe('shape');
    if (block.type !== 'shape') throw new Error('shape');
    expect(block.shape).toBe('elbow');
    expect(block.connect).toEqual({ start: { block: 'a', site: 3 } });
    expect(block.orientation).toBe('diagonal-down');
    /* a drag that ends on the left site of the same rectangle attaches both ends */
    const both = blockOf(
      drawDraftMutation(free, tool, 'elbow', [200, 280, 240, 1], {
        grid: false,
        dragged: true,
        start: { x: 441, y: 281 },
        end: { x: 199, y: 279 },
      }),
    );
    if (both.type !== 'shape') throw new Error('shape');
    expect(both.connect).toEqual({ start: { block: 'a', site: 3 }, end: { block: 'a', site: 1 } });
    /* a plain line tool away from every site carries no attachment */
    const plain = blockOf(
      drawDraftMutation(free, { kind: 'line', line: 'line' }, 'line', [600, 600, 200, 1], {
        grid: false,
        dragged: true,
        start: { x: 600, y: 600 },
        end: { x: 800, y: 600 },
      }),
    );
    if (plain.type !== 'shape') throw new Error('shape');
    expect(plain.connect).toBeUndefined();
    expect(plain.orientation).toBe('horizontal');
  });

  it('applies through the reducer and validates, and answers null on a grammar slide with no conversion', () => {
    const draft = draftAt({ kind: 'shape', shape: 'star5' }, 'star', { x: 620, y: 500 });
    const doc = documentOf(free);
    const after = applyMutations(doc, [draft!]).document;
    expect(validateDocument(after).ok).toBe(true);
    const slide = after.slides['free'];
    expect(slide?.kind === 'content' && slide.slots.main?.map((b) => b.id)).toEqual(['a', 'star']);
    expect(
      drawDraftMutation(grammar, { kind: 'shape', shape: 'rectangle' }, 's', [0, 0, 240, 160]),
    ).toBeNull();
  });
});
