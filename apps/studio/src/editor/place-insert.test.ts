import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { CONTENT_BOX, SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';

import {
  CASCADE_STEP,
  CHART_SHARED_SIZE,
  INSERT_GAP,
  INSERT_MIN_SIZE,
  bodyRect,
  contentRect,
  freeRectangles,
  isContentObject,
  occupiedRects,
  placeInsert,
  wantsPlacement,
} from './place-insert';

const [CX, CY, CW, CH] = CONTENT_BOX;

function canvas(blocks: Block[]): Slide {
  return {
    schemaVersion: 1,
    id: 'canvas',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: blocks },
  };
}

/** The objects of a converted Title and body slide: the title prompt across the head, the body prompt under it. */
function titleAndBody(extra: Block[] = [], typed = { title: '', body: '' }): Slide {
  return canvas([
    {
      id: 'h',
      type: 'heading',
      level: 'h2',
      text: typed.title,
      pos: { x: CX, y: CY, w: CW, h: 48, z: 0 },
    },
    {
      id: 'p1',
      type: 'paragraph',
      text: typed.body,
      pos: { x: CX, y: 400, w: CW, h: 66, z: 1 },
    },
    ...extra,
  ]);
}

const table = (id: string, pos: Block['pos'], cells = ['Q1', 'Q2', 'Q3']): Block => ({
  id,
  type: 'table',
  columns: [{}, {}, {}],
  rows: [{ cells, header: true }, { cells: ['', '', ''] }, { cells: ['', '', ''] }],
  pos,
});

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the body slot', () => {
  it('is the content box under the head band, the lowest heading in the top third plus the gap', () => {
    const body = bodyRect(titleAndBody());
    expect(body).toEqual({
      x: CX,
      y: CY + 48 + INSERT_GAP,
      w: CW,
      h: CY + CH - (CY + 48 + INSERT_GAP),
    });
    // an empty title prompt reserves the title's place as a typed one does
    expect(bodyRect(titleAndBody([], { title: 'Agenda', body: '' }))).toEqual(body);
  });

  it('is the whole content box on a slide with no heading up top', () => {
    expect(bodyRect(canvas([]))).toEqual(contentRect());
    const dragged = canvas([
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'Low',
        pos: { x: 200, y: 600, w: 600, h: 48 },
      },
    ]);
    expect(bodyRect(dragged)).toEqual(contentRect());
  });
});

describe('what takes room', () => {
  it('counts a typed text, a table, a shape and the mark, and not a prompt or the background picture', () => {
    const pos = { x: 200, y: 300, w: 400, h: 100 };
    expect(isContentObject({ id: 'p', type: 'paragraph', text: '', pos })).toBe(false);
    expect(isContentObject({ id: 'p', type: 'paragraph', text: '  ', pos })).toBe(false);
    expect(isContentObject({ id: 'p', type: 'paragraph', text: 'Typed', pos })).toBe(true);
    expect(isContentObject({ id: 't', type: 'text', text: '', pos })).toBe(false);
    expect(isContentObject({ id: 'h', type: 'heading', level: 'h2', text: '**Bold**', pos })).toBe(
      true,
    );
    expect(isContentObject(table('t', pos, ['', '', '']))).toBe(true);
    expect(isContentObject({ id: 's', type: 'shape', shape: 'rect', pos } as Block)).toBe(true);
    expect(isContentObject({ id: 'm', type: 'mark', pos } as Block)).toBe(true);
    expect(
      isContentObject({
        id: 'bg',
        type: 'picture',
        asset: 'mood',
        pos: { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT, z: 0 },
      } as Block),
    ).toBe(false);
    expect(isContentObject({ id: 'p', type: 'paragraph', text: 'No box' })).toBe(false);
  });

  it('grows a taken rectangle by the gap and clips it to the body', () => {
    const slide = titleAndBody([table('t', { x: 320, y: 217, w: 960, h: 320 })]);
    const body = bodyRect(slide);
    expect(occupiedRects(slide, body)).toEqual([
      {
        x: 320 - INSERT_GAP,
        y: body.y,
        w: 960 + 2 * INSERT_GAP,
        h: 217 + 320 + INSERT_GAP - body.y,
      },
    ]);
    // the empty body prompt takes nothing
    expect(occupiedRects(titleAndBody(), body)).toEqual([]);
  });
});

describe('the free rectangles', () => {
  it('is the body alone when nothing is taken', () => {
    const body = { x: 0, y: 0, w: 100, h: 100 };
    expect(freeRectangles(body, [])).toEqual([body]);
  });

  it('lists the maximal empty rectangles around one taken block', () => {
    const body = { x: 0, y: 0, w: 100, h: 100 };
    const taken = { x: 40, y: 40, w: 20, h: 20 };
    const free = freeRectangles(body, [taken]);
    // the four strips: above, below, left, right, each the full body length on its axis
    expect(free).toHaveLength(4);
    expect(free).toContainEqual({ x: 0, y: 0, w: 100, h: 40 });
    expect(free).toContainEqual({ x: 0, y: 60, w: 100, h: 40 });
    expect(free).toContainEqual({ x: 0, y: 0, w: 40, h: 100 });
    expect(free).toContainEqual({ x: 60, y: 0, w: 40, h: 100 });
    for (const rect of free) expect(overlaps(rect, taken)).toBe(false);
  });

  it('keeps an L shaped free area as two overlapping maximal rectangles', () => {
    const body = { x: 0, y: 0, w: 100, h: 100 };
    const free = freeRectangles(body, [{ x: 50, y: 50, w: 50, h: 50 }]);
    expect(free).toHaveLength(2);
    expect(free).toContainEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(free).toContainEqual({ x: 0, y: 0, w: 50, h: 100 });
  });
});

describe('placeInsert (docs/PRODUCT.md section 2 rank 1)', () => {
  it('lands the first table at the top of an empty body, centred across it, at its default size', () => {
    const placed = placeInsert(titleAndBody(), 'table', [960, 320]);
    expect(placed.how).toBe('free');
    expect(placed.shrunk).toBe(false);
    expect(placed.pos).toEqual({ x: CX + (CW - 960) / 2, y: CY + 48 + INSERT_GAP, w: 960, h: 320 });
    expect(placed.pos.z).toBeUndefined();
  });

  it('lands a shader under the head band, free of the title, at 480 by 272 (shaders.insert.selected-free-rectangle)', () => {
    /* the features round, ship two (docs/FEATURES.md 5.4; build/b5/integrator-hunks.md R5) */
    const slide = titleAndBody([], { title: 'A title', body: '' });
    const placed = placeInsert(slide, 'material', [480, 272]);
    expect(placed.how).toBe('free');
    expect(placed.pos.w).toBe(480);
    expect(placed.pos.h).toBe(272);
    expect(placed.pos.y).toBeGreaterThanOrEqual(CY + 48 + INSERT_GAP);
    expect(placed.pos.z).toBeUndefined();
    expect(INSERT_MIN_SIZE.material).toEqual([240, 135]);
  });

  it('lands a table on a Blank slide at the top of the content box at 960 by 320 (tables.insert.grid keeps its size)', () => {
    const placed = placeInsert(canvas([]), 'table', [960, 320]);
    expect(placed.pos).toEqual({ x: 320, y: CY, w: 960, h: 320 });
  });

  it('keeps a lone chart at 960 by 540 under a one line title, and shrinks it to the body under a taller head', () => {
    const placed = placeInsert(titleAndBody(), 'chart', [960, 540]);
    expect(placed.how).toBe('free');
    expect(placed.pos).toMatchObject({ w: 960, h: 540, y: CY + 48 + INSERT_GAP });
    expect(placed.shrunk).toBe(false);
    // a two line title: the body is shorter than 540 and the chart takes the body's height
    const tall = canvas([
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'Two lines',
        pos: { x: CX, y: CY, w: CW, h: 120 },
      },
    ]);
    const body = bodyRect(tall);
    const shrunk = placeInsert(tall, 'chart', [960, 540]);
    expect(body.h).toBeLessThan(540);
    expect(shrunk.pos.h).toBe(body.h);
    expect(shrunk.pos.w).toBe(960);
    expect(shrunk.shrunk).toBe(true);
  });

  it('keeps a chart on a Blank slide at 960 by 540 (charts.insert.bar keeps its size)', () => {
    const placed = placeInsert(canvas([]), 'chart', [960, 540]);
    expect(placed.pos.w).toBe(960);
    expect(placed.pos.h).toBe(540);
    expect(placed.pos.y).toBe(CY);
  });

  it('puts a chart under a typed table without overlap, 640 wide and as tall as the room left (arrange.insert.selected-after-menu)', () => {
    const first = placeInsert(titleAndBody(), 'table', [960, 320]);
    const withTable = titleAndBody([table('t', { ...first.pos, z: 2 })]);
    const chart = placeInsert(withTable, 'chart', [960, 540]);
    expect(chart.how).toBe('free');
    expect(overlaps(chart.pos, first.pos)).toBe(false);
    expect(chart.pos.w).toBe(CHART_SHARED_SIZE[0]);
    expect(chart.pos.y).toBe(first.pos.y + first.pos.h + INSERT_GAP);
    expect(chart.pos.h).toBe(CY + CH - chart.pos.y);
    expect(chart.pos.h).toBeGreaterThanOrEqual(INSERT_MIN_SIZE.chart[1]);
    expect(chart.pos.x).toBe(CX + (CW - CHART_SHARED_SIZE[0]) / 2);
    // inside the sheet
    expect(chart.pos.y + chart.pos.h).toBeLessThanOrEqual(SHEET_HEIGHT);
  });

  it('takes the wider free strip beside a narrow object over a shorter one under it', () => {
    // a 300 wide typed text box at the body's left leaves a wide right strip
    const slide = titleAndBody([
      { id: 't', type: 'text', text: 'Notes', pos: { x: CX, y: 300, w: 300, h: 400 } },
    ]);
    const placed = placeInsert(slide, 'chart', [960, 540]);
    expect(placed.how).toBe('free');
    expect(placed.pos.x).toBeGreaterThanOrEqual(CX + 300 + INSERT_GAP);
    expect(placed.pos.w).toBe(CHART_SHARED_SIZE[0]);
    expect(placed.pos.h).toBe(CHART_SHARED_SIZE[1]);
  });

  it('cascades 40 by 40 from the last object when the body is taken, clamped inside the sheet (arrange.insert.free-rectangle)', () => {
    const first = placeInsert(titleAndBody(), 'table', [960, 320]);
    const withTable = titleAndBody([table('t', { ...first.pos, z: 2 })]);
    const chart = placeInsert(withTable, 'chart', [960, 540]);
    const chartBlock: Block = {
      id: 'c',
      type: 'chart',
      kind: 'column',
      categories: ['A', 'B', 'C'],
      series: [{ name: 'S', values: [1, 2, 3] }],
      pos: { ...chart.pos, z: 3 },
    } as Block;
    const taken = titleAndBody([table('t', { ...first.pos, z: 2 }), chartBlock]);
    const third = placeInsert(taken, 'table', [960, 320]);
    expect(third.how).toBe('cascade');
    expect(third.pos.w).toBe(960);
    expect(third.pos.h).toBe(320);
    expect(third.pos.x).toBe(chart.pos.x + CASCADE_STEP);
    expect(third.pos.y).toBe(Math.min(chart.pos.y + CASCADE_STEP, SHEET_HEIGHT - 320));
    expect(third.pos.x + third.pos.w).toBeLessThanOrEqual(SHEET_WIDTH);
    expect(third.pos.y + third.pos.h).toBeLessThanOrEqual(SHEET_HEIGHT);
  });

  it('cascades from the last content object, never from a prompt or the background picture', () => {
    const wide = table('t', { x: CX, y: CY + 48 + INSERT_GAP, w: CW, h: 400, z: 1 });
    const slide = canvas([
      {
        id: 'bg',
        type: 'picture',
        asset: 'mood',
        pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
      } as Block,
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: '',
        pos: { x: CX, y: CY, w: CW, h: 48, z: 1 },
      },
      wide,
      { id: 'p', type: 'paragraph', text: '', pos: { x: CX, y: 700, w: CW, h: 60, z: 5 } },
    ]);
    const placed = placeInsert(slide, 'table', [960, 320]);
    expect(placed.how).toBe('cascade');
    expect(placed.pos.x).toBe(wide.pos!.x + CASCADE_STEP);
  });
});

describe('wantsPlacement', () => {
  const pos = { x: 320, y: 180, w: 960, h: 540 };
  it('is the chrome insert of a table, a chart or a shader with a box on top of the stack', () => {
    expect(wantsPlacement({ slot: 'main', block: { type: 'chart', pos } })).toBe(true);
    expect(wantsPlacement({ slot: 'main', block: { type: 'table', pos } })).toBe(true);
    /* the features round, ship two (docs/FEATURES.md 5.4): the gallery's insert */
    expect(wantsPlacement({ slot: 'main', block: { type: 'material', pos } })).toBe(true);
  });
  it('leaves an insert with its own place, stack position or kind alone', () => {
    expect(wantsPlacement({ slot: 'main', block: { type: 'chart', pos: { ...pos, z: 4 } } })).toBe(
      false,
    );
    expect(wantsPlacement({ slot: 'main', after: 'h', block: { type: 'chart', pos } })).toBe(false);
    expect(wantsPlacement({ slot: 'body', block: { type: 'table' } })).toBe(false);
    expect(wantsPlacement({ slot: 'main', block: { type: 'shot', pos } })).toBe(false);
    expect(wantsPlacement({ slot: 'main', block: { type: 'text', pos } })).toBe(false);
  });
});
