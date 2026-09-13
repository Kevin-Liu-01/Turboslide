import { describe, expect, it } from 'vitest';

import type { Box } from '@turboslide/schema/render';
import { COLUMN_GAP, COLUMNS, CONTENT_ORIGIN, RAIL, SHEET } from '@turboslide/theme/tokens';

import {
  axisLock,
  boxSnapLines,
  deckGuideLines,
  FREE_GRID,
  FREE_MIN_SIZE,
  FREE_SNAP_PX,
  resizeCursor,
  sheetEdgeLines,
  sheetSnapLines,
  snapMove,
  snapResize,
  snapToGrid,
} from '../snap';

// The freeform snap engine (this round): a dragged box lands on the 8 px grid, the rails, the
// content box, the seams, the plate edges, or another block's edges and centers.
describe('sheetSnapLines', () => {
  it('names the rails, the content box edges and centers, the named seams and the plate edges', () => {
    const lines = sheetSnapLines();
    const xs = lines.filter((line) => line.axis === 'x').map((line) => line.at);
    const ys = lines.filter((line) => line.axis === 'y').map((line) => line.at);
    expect(xs).toContain(RAIL);
    expect(xs).toContain(SHEET.width - RAIL);
    expect(ys).toContain(RAIL);
    expect(ys).toContain(SHEET.height - RAIL);
    expect(xs).toContain(CONTENT_ORIGIN[0]);
    expect(xs).toContain(800);
    expect(xs).toContain(1463);
    expect(ys).toContain(CONTENT_ORIGIN[1]);
    expect(ys).toContain(450);
    expect(ys).toContain(771);
    expect(xs).toContain(CONTENT_ORIGIN[0] + COLUMNS['5/7'][0]);
    expect(xs).toContain(CONTENT_ORIGIN[0] + COLUMNS['5/7'][0] + COLUMN_GAP);
    expect(xs).toContain(CONTENT_ORIGIN[0] + COLUMNS['4/8'][0]);
    expect(xs).toContain(CONTENT_ORIGIN[0] + 740);
    expect(xs).toContain(1463 - 560);
    expect(lines.every((line) => line.to > line.from)).toBe(true);
  });
});

describe('boxSnapLines', () => {
  it('gives a box its two edges and its center on each axis, spanning the box on the other', () => {
    const lines = boxSnapLines([400, 100, 200, 50]);
    expect(lines.filter((line) => line.axis === 'x').map((line) => line.at)).toEqual([
      400, 500, 600,
    ]);
    expect(lines.filter((line) => line.axis === 'y').map((line) => line.at)).toEqual([
      100, 125, 150,
    ]);
    expect(lines[0]).toMatchObject({ kind: 'edge', from: 100, to: 150 });
    expect(lines[1]).toMatchObject({ kind: 'center' });
  });
});

describe('snapMove', () => {
  it('lands the top left corner on the grid when no line is near, and draws no guide', () => {
    const result = snapMove([300, 300, 200, 100], 3, 5, []);
    expect(result.box).toEqual([304, 304, 200, 100]);
    expect(result.guides).toEqual([]);
    expect(snapToGrid(303)).toBe(304);
    expect(snapToGrid(305)).toBe(304);
    expect(FREE_GRID).toBe(8);
  });

  it('takes a rail within the threshold over the grid and reports it as the guide', () => {
    const result = snapMove([70, 300, 200, 100], -10, 0, sheetSnapLines());
    expect(result.box[0]).toBe(RAIL);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toMatchObject({ axis: 'x', at: RAIL, kind: 'rail' });
  });

  it('snaps a center to another block center', () => {
    const other: Box = [400, 100, 200, 50];
    // the moved box's center would be 502; the other block's center is 500
    const result = snapMove([0, 300, 100, 100], 452, 0, boxSnapLines(other));
    expect(result.box[0]).toBe(450);
    expect(result.guides[0]).toMatchObject({ axis: 'x', at: 500, kind: 'center' });
  });

  it('snaps an edge to another block edge and the guide spans both boxes', () => {
    const other: Box = [400, 100, 200, 50];
    // the box sits on the grid at y 296, so only x moves: its left edge takes the other's right
    const result = snapMove([0, 296, 100, 100], 604, 0, boxSnapLines(other));
    expect(result.box).toEqual([600, 296, 100, 100]);
    expect(result.guides[0]).toMatchObject({
      axis: 'x',
      at: 600,
      kind: 'edge',
      from: 100,
      to: 396,
    });
  });

  it('leaves a box alone past the threshold and rounds to whole pixels', () => {
    const other: Box = [400, 100, 200, 50];
    const result = snapMove([0, 300, 100, 100], 600 + FREE_SNAP_PX + 2.4, 0, boxSnapLines(other), {
      grid: false,
    });
    expect(result.box[0]).toBe(608);
    expect(result.guides).toEqual([]);
  });
});

describe('snapResize', () => {
  it('moves only the dragged edge and lands it on the grid', () => {
    const result = snapResize([100, 100, 200, 100], 'e', 13, 0, []);
    expect(result.box).toEqual([100, 100, 212, 100]);
  });

  it('holds the opposite edge and never drops under the minimum size', () => {
    const result = snapResize([100, 100, 200, 100], 'w', 500, 0, []);
    expect(result.box).toEqual([300 - FREE_MIN_SIZE, 100, FREE_MIN_SIZE, 100]);
  });

  it('keeps the aspect under Shift from the dominant delta of a corner', () => {
    const result = snapResize([100, 100, 200, 100], 'se', 100, 0, [], {
      aspect: true,
      grid: false,
    });
    expect(result.box).toEqual([100, 100, 300, 150]);
    const fromEdge = snapResize([100, 100, 200, 100], 'n', -50, 0, [], {
      aspect: true,
      grid: false,
    });
    // the top edge moves by dy; an n handle leads on y, so dx is ignored and the width follows
    expect(fromEdge.box).toEqual([100, 100, 200, 100]);
    const tall = snapResize([100, 100, 200, 100], 'n', 0, -50, [], { aspect: true, grid: false });
    expect(tall.box).toEqual([100, 50, 300, 150]);
  });

  it('snaps the moving edge to a rail and reports the guide', () => {
    const result = snapResize([100, 100, 200, 100], 'n', 0, -40, sheetSnapLines());
    expect(result.box).toEqual([100, RAIL, 200, 144]);
    expect(result.guides[0]).toMatchObject({ axis: 'y', at: RAIL, kind: 'rail' });
  });
});

describe('resizeCursor', () => {
  it('names the cursor of each direction', () => {
    expect(resizeCursor('n')).toBe('ns-resize');
    expect(resizeCursor('e')).toBe('ew-resize');
    expect(resizeCursor('ne')).toBe('nesw-resize');
    expect(resizeCursor('se')).toBe('nwse-resize');
  });
});

// Round two (gslides-parity SPEC-2 6.1 rows 7 and 31): the sheet's edges and centre, the deck's
// guides, the equal spacing guides, the Shift axis lock and a drag with every snap off.
describe('the canvas snaps', () => {
  it('lists the sheet edges and centre and the deck guides as lines spanning the sheet', () => {
    const edges = sheetEdgeLines();
    expect(edges.map((l) => [l.axis, l.at])).toEqual([
      ['x', 0],
      ['x', 800],
      ['x', 1600],
      ['y', 0],
      ['y', 450],
      ['y', 900],
    ]);
    const guides = deckGuideLines({ x: [400], y: [300] });
    expect(guides).toEqual([
      { axis: 'x', at: 400, kind: 'guide', from: 0, to: 900 },
      { axis: 'y', at: 300, kind: 'guide', from: 0, to: 1600 },
    ]);
    expect(deckGuideLines(undefined)).toEqual([]);
  });

  it('snaps a moved box to a deck guide and reports it', () => {
    const lines = deckGuideLines({ x: [400], y: [] });
    const result = snapMove([100, 100, 200, 50], 296, 0, lines, { grid: false });
    expect(result.box[0]).toBe(400);
    expect(result.guides[0]).toMatchObject({ axis: 'x', at: 400, kind: 'guide' });
  });

  it('constrains a move to the axis of the larger delta under Shift', () => {
    expect(axisLock(30, 10)).toEqual({ dx: 30, dy: 0 });
    expect(axisLock(-4, 12)).toEqual({ dx: 0, dy: 12 });
  });

  it('snaps to an equal gap beside two resting boxes and draws the spacing ticks', () => {
    /* a at 100..200 and b at 300..400 sit 100 apart; a moving box of 100 lands at 500 when its
       gap to b equals theirs */
    const others: [number, number, number, number][] = [
      [100, 100, 100, 50],
      [300, 100, 100, 50],
    ];
    const result = snapMove([0, 100, 100, 50], 496, 0, [], { grid: false, spacing: others });
    expect(result.box[0]).toBe(500);
    expect(result.guides.every((g) => g.kind === 'spacing')).toBe(true);
    expect(result.guides.map((g) => g.at).sort((a, b) => a - b)).toEqual([200, 300, 400, 500]);
    /* midway between the two: 200..300 has no room for 100, but a gap of 50 each side fits a 0 box only */
    const far = snapMove([0, 100, 100, 50], 700, 0, [], { grid: false, spacing: others });
    expect(far.box[0]).toBe(700);
    expect(far.guides).toEqual([]);
  });

  it('rounds to whole pixels with every snap off', () => {
    const result = snapMove([100, 100, 200, 50], 33.4, 0.6, [], { grid: false });
    expect(result.box).toEqual([133, 101, 200, 50]);
    expect(result.guides).toEqual([]);
  });
});
